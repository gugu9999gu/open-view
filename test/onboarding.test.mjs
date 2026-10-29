import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { initProject, projectRoot, readLocalFile, validateConfig, loadConfig } from '../onboarding/config.mjs';
import { diagnoseProject } from '../onboarding/doctor.mjs';
import { parseArgs, connectProject } from '../onboarding/cli.mjs';
import { openView } from '../onboarding/vite.mjs';
import { traceAction as disabled } from '../runtime/browser-disabled.mjs';
import { transformSource } from '../runtime/source-transform.mjs';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = `import { traceAction } from 'open-view/browser'; export async function save() { return traceAction('Save', async action => action.span('fn', async () => 42)); }`;
async function fixture(t, { installed = false } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'open-view external '));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'src/main.jsx'), source);
  await fs.writeFile(path.join(root, 'index.html'), '<main></main><script type="module" src="/src/main.jsx"></script>');
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({type:'module',dependencies:{vite:'7.3.7',react:'19.3.1'}}));
  if (installed) await fs.symlink(path.join(repo,'node_modules'),path.join(root,'node_modules'),'dir');
  return root;
}
test('init previews without writing and exclusive config creation never overwrites', async t => {
  const root = await fixture(t);
  const before = await fs.readdir(root);
  const preview = await initProject({ project:root, sourceFiles:['src/main.jsx'] });
  assert.equal(preview.written,false); assert.deepEqual(await fs.readdir(root),before);
  await initProject({project:root,sourceFiles:['src/main.jsx'],write:true});
  const original=await fs.readFile(path.join(root,'open-view.config.json'));
  await assert.rejects(initProject({project:root,sourceFiles:['src/main.jsx'],write:true}),{code:'EEXIST'});
  assert.deepEqual(await fs.readFile(path.join(root,'open-view.config.json')),original);
  assert.equal((await loadConfig(root)).uiPort,4418);
});
test('config rejects unknown fields, credentials, traversal, hidden/dependency/output paths and duplicate files', () => {
  for (const sourceFiles of [[],['src/main.jsx','src/main.jsx'],['../outside.js'],['/tmp/a.js'],['.env'],['.hidden/a.ts'],['src/../a.ts'],['src\\a.ts'],['node_modules/a.js'],['dist/a.js'],['src//x.ts'],['src/x.json'],['C:/x.ts']]) assert.throws(()=>validateConfig({schemaVersion:1,sourceFiles}));
  for (const input of [{schemaVersion:2,sourceFiles:['a.js']},{schemaVersion:1,sourceFiles:['a.js'],token:'secret'},{schemaVersion:1,sourceFiles:['a.js'],uiPort:3000,appPort:3000},{schemaVersion:1,sourceFiles:['a.js'],uiPort:80}]) assert.throws(()=>validateConfig(input));
});
test('selected symlinks and symlink directories cannot be read or initialized', async t => {
  const root=await fixture(t);await fs.symlink(path.join(root,'src/main.jsx'),path.join(root,'link.js'));
  await fs.symlink(path.join(root,'src'),path.join(root,'linked'));
  for (const relative of ['link.js','linked/main.jsx']) await assert.rejects(readLocalFile(root,relative),{code:'SYMLINK_DENIED'});
  await fs.symlink(path.join(root,'src/main.jsx'),path.join(root,'open-view.config.json'));
  await assert.rejects(initProject({project:root,sourceFiles:['src/main.jsx'],write:true}),{code:'EEXIST'});
});
test('bounded source and JSON reads reject over-limit and malformed data',async t=>{
  const root=await fixture(t);await fs.writeFile(path.join(root,'huge.js'),'x'.repeat(256*1024+1));
  await assert.rejects(initProject({project:root,sourceFiles:['huge.js']}),{code:'FILE_SIZE'});
  await fs.writeFile(path.join(root,'bad.js'),Buffer.from([0xff]));await assert.rejects(readLocalFile(root,'bad.js'));
  await fs.writeFile(path.join(root,'open-view.config.json'),'{');await assert.rejects(loadConfig(root));
});
test('doctor checks installed Vite/React and exact wrappers without executing project config, scripts or .env',async t=>{
  const root=await fixture(t,{installed:true});await initProject({project:root,sourceFiles:['src/main.jsx'],write:true});
  await fs.writeFile(path.join(root,'vite.config.mjs'),"throw new Error('DO_NOT_EXECUTE_CONFIG_SECRET');");
  await fs.writeFile(path.join(root,'.env'),'SECRET_DO_NOT_READ=secret-value');
  const report=await diagnoseProject({project:root});
  assert.equal(report.status,'ready-with-limitations');assert.equal(report.configurationExecuted,false);assert.equal(report.executionObserved,false);
  assert.equal(report.files[0].linkedCallbacks,2);assert.ok(!JSON.stringify(report).includes('secret-value'));
});
test('doctor reports missing dependencies and unsupported frameworks instead of claiming coverage',async t=>{
  const root=await fixture(t);await initProject({project:root,sourceFiles:['src/main.jsx'],write:true});
  assert.equal((await diagnoseProject({project:root})).status,'blocked');
  const p=JSON.parse(await fs.readFile(path.join(root,'package.json')));p.dependencies.next='16.0.0';await fs.writeFile(path.join(root,'package.json'),JSON.stringify(p));
  assert.ok((await diagnoseProject({project:root})).checks.some(c=>c.id==='framework'&&c.status==='error'));
});
test('doctor labels unsupported callbacks without source content leakage',async t=>{
  const root=await fixture(t,{installed:true});await initProject({project:root,sourceFiles:['src/main.jsx'],write:true});
  await fs.writeFile(path.join(root,'src/main.jsx'),"import { traceAction } from 'open-view/browser'; const callback=()=>42; traceAction('unsupported',callback);");
  const report=await diagnoseProject({project:root});assert.equal(report.files[0].status,'not-instrumented');assert.equal(report.files[0].linkedCallbacks,0);
});
test('public browser import supports aliases and lexical shadowing',()=>{
  const result=transformSource({root:'/project',moduleId:'a.jsx',source:"import { traceAction as act } from 'open-view/browser'; act('outer',async x=>x.span('inner',async()=>1)); function f(act){ return act('shadow',async()=>2); }"});
  assert.equal(result.definitions.length,2);
});
test('disabled browser API preserves result, nested setOutcome and original error',async()=>{
  assert.equal(await disabled('noop',async action=>action.span('nested',c=>{c.setOutcome({business:'success'});return 42;})),42);
  const original=new Error('business');await assert.rejects(disabled('err',()=>{throw original;}),error=>error===original);
});
test('CLI rejects unknown or duplicate options and dev requires explicit trust before executing',async()=>{
  for(const args of [['exec'],['doctor','--write'],['init','--source'],['dev','--trust-project','--trust-project']]) assert.throws(()=>parseArgs(args));
  await assert.rejects(connectProject({project:'/nonexistent'}),{code:'TRUST_REQUIRED'});
  const process=spawnSync(globalThis.process.execPath,['onboarding/cli.mjs','dev','--project','/nonexistent'],{cwd:repo,encoding:'utf8'});
  assert.equal(process.status,2);assert.ok(process.stderr.includes('TRUST_REQUIRED'));
});
test('Vite adapter rejects reserved alias conflicts and unsupported root/host/base/SSR',async t=>{
  const root=await fixture(t);
  const options={project:root,sourceFiles:['src/main.jsx'],uiPort:0};
  const adapter=openView(options);assert.throws(()=>adapter.config({resolve:{alias:{'open-view/browser':'other'}}},{command:'serve'}),{code:'ALIAS_CONFLICT'});
  adapter.config({},{command:'serve'});
  const base={root,base:'/',server:{host:'127.0.0.1'},build:{},plugins:[adapter]};
  for(const patch of [{base:'/nested/'},{server:{host:'0.0.0.0'}},{server:{https:{}}},{server:{middlewareMode:true}},{build:{ssr:true}},{plugins:[adapter,adapter]}]) await assert.rejects(adapter.configResolved({...base,...patch}));
});
test('real Vite connector starts isolated UI, emits actual transformed source, denies unauthenticated source, and closes ports',async t=>{
  const root=await fixture(t,{installed:true});await initProject({project:root,sourceFiles:['src/main.jsx'],write:true,uiPort:0,appPort:0});
  const instance=await connectProject({project:root,trusted:true});t.after(()=>instance.close());
  const page=await fetch(`${instance.appUrl}/src/main.jsx`);assert.equal(page.status,200);assert.ok((await page.text()).includes('manifestId'));
  const token=new URLSearchParams(new URL(instance.loginUrl).hash.slice(1)).get('token');
  const session=await fetch(instance.uiUrl+'/api/session',{method:'POST',headers:{Authorization:`Bearer ${token}`}}).then(r=>r.json());
  assert.equal((await fetch(instance.uiUrl+'/api/traces')).status,401);
  const data=await fetch(instance.uiUrl+'/api/traces',{headers:{Authorization:`Bearer ${session.accessToken}`}}).then(r=>r.json());assert.equal(data.traces.length,0);
  await instance.close();assert.equal(instance.connector.api.status().enabled,false);await assert.rejects(fetch(instance.uiUrl));
});
test('UI port conflict is surfaced without modifying target sources or leaking active server',async t=>{
  const root=await fixture(t,{installed:true});const busy=http.createServer();await new Promise(resolve=>busy.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>busy.close(resolve)));
  await initProject({project:root,sourceFiles:['src/main.jsx'],write:true,uiPort:busy.address().port,appPort:0});
  await assert.rejects(connectProject({project:root,trusted:true}),{code:'EADDRINUSE'});assert.equal(await fs.readFile(path.join(root,'src/main.jsx'),'utf8'),source);
});
test('a later project plugin startup failure also disposes the connector and watchers',async t=>{
  const root=await fixture(t,{installed:true});await initProject({project:root,sourceFiles:['src/main.jsx'],write:true,uiPort:0,appPort:0});
  await fs.writeFile(path.join(root,'vite.config.mjs'),"export default {plugins:[{name:'fail-late',configureServer(){throw new Error('project-plugin-error');}}]};");
  await assert.rejects(connectProject({project:root,trusted:true}),/project-plugin-error/);
});
test('malformed package metadata cannot be reported ready',async t=>{
  const root=await fixture(t,{installed:true});await initProject({project:root,sourceFiles:['src/main.jsx'],write:true});
  for(const data of ['null','[]','"package"']){await fs.writeFile(path.join(root,'package.json'),data);assert.equal((await diagnoseProject({project:root})).status,'blocked');}
});
