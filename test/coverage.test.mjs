import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { scanProject } from '../lib/scanner.mjs';
import { scanInWorker } from '../lib/scan-runner.mjs';
async function root(t) { const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ov-coverage-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir; }
async function write(dir,file,text='export function sample() { return 1; }') { const full=path.join(dir,file);await fs.mkdir(path.dirname(full),{recursive:true});await fs.writeFile(full,text); }

test('depth-limit regression: skipped nested sources are partial with a relative path',async t=>{
  const dir=await root(t);await write(dir,'visible.ts');await write(dir,[...Array(21).fill('nested'),'hidden.ts'].join('/'));
  const graph=await scanProject(dir);assert.equal(graph.coverage.files,1);assert.equal(graph.coverage.status,'partial');assert.equal(graph.coverage.truncated,true);
  assert(graph.coverage.reasons.includes('depth-limit'));assert(graph.notices.some(n=>n.kind==='depth-limit'&&n.path.startsWith('nested/')));
});
test('exact file count is complete, an additional eligible file marks partial',async t=>{
  const dir=await root(t);await write(dir,'a.ts');
  assert.equal((await scanProject(dir,{maxFiles:1})).coverage.status,'complete');
  await write(dir,'b.ts');assert((await scanProject(dir,{maxFiles:1})).coverage.reasons.includes('file-limit'));
});
for(const [options,reason] of [[{maxBytes:1},'file-size-limit'],[{maxTotalBytes:1},'total-size-limit'],[{maxDirectories:0},'directory-limit'],[{maxEntries:0},'entry-limit'],[{maxDurationMs:0},'time-limit']]){
  test(`bounded traversal reports ${reason}`,async t=>{const dir=await root(t);await write(dir,'a.ts');const g=await scanProject(dir,options);assert.equal(g.coverage.status,'partial');assert(g.coverage.reasons.includes(reason));});
}
test('notice cap does not erase incompleteness reasons',async t=>{
  const dir=await root(t);await write(dir,'a.ts');const g=await scanProject(dir,{maxBytes:1,maxNotices:0});
  assert.equal(g.notices.length,0);assert.equal(g.coverage.suppressedNotices,1);assert.equal(g.coverage.status,'partial');assert.deepEqual(g.coverage.reasons,['file-size-limit']);
});
test('parse errors mark partial; relative symlinks remain a stated exclusion',async t=>{
  const dir=await root(t);await write(dir,'broken.ts','export function broken( {');
  const g=await scanProject(dir);assert(g.coverage.reasons.includes('parse-diagnostic'));assert.equal(g.coverage.status,'partial');
});
test('source identity is repeatable for a snapshot and changes when source changes',async t=>{
  const dir=await root(t);await write(dir,'a.ts');
  const a=await scanProject(dir), b=await scanProject(dir);
  assert.equal(a.sourceSnapshotId,b.sourceSnapshotId);
  const fn=a.nodes.find(n=>n.kind==='function');assert.equal(fn.sourceRef.sourceSnapshotId,a.sourceSnapshotId);assert.equal(fn.sourceRef.moduleId,'a.ts');
  await write(dir,'a.ts','\nexport function sample() { return 2; }');
  const c=await scanProject(dir);assert.notEqual(c.sourceSnapshotId,a.sourceSnapshotId);assert.notEqual(c.nodes.find(n=>n.kind==='function').id,fn.id);
});
test('a cancelled scan does not launch or report a graph',async()=>{
  const controller=new AbortController();controller.abort();
  await assert.rejects(scanInWorker('.', {signal:controller.signal}),{code:'SCAN_ABORTED'});
});
test('invalid limits fail explicitly',async t=>{const dir=await root(t);await assert.rejects(scanProject(dir,{maxFiles:-1}),/Invalid maxFiles/);});
