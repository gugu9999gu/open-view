"""One-time, hash-guarded source import on the feature branch. Not a verification step."""
from pathlib import Path
import hashlib
import json
import os

expected = {
 'server.mjs':'f3a53dc92c6089d7278005e96d540089f33dd73cefa0c62eaf3977fe30b8dd49',
 'public/app.mjs':'a02db4963c475a1d1748be855a1408c3aedc50451166e0852305e7e54d23b294',
 'public/index.html':'c7200511b3b2e653b36b63fe00af7dee84620e23fc052b1d9eb25495872c9a8b',
 'scripts/check-source.mjs':'f6ae4c41a9d27fadfca0c0cfe6dc353c632ed7427641894af60a0a193438b9a1',
 'package.json':'daab6896081c47e766cd622dd1e383b49291da01159694eb832ac101f6ae865e',
 'package-lock.json':'71b7d7ffcaff62e0445a7e68632e571795796a9baa407ac951226662d3545ed7',
}
outputs = {}
s = Path('server.mjs').read_text()
s = s.replace("import { scanInWorker } from './lib/scan-runner.mjs';", "import { scanInWorker } from './lib/scan-runner.mjs';\nimport { readJsonBody } from './runtime/collector.mjs';")
s = s.replace("['/session-client.mjs', 'text/javascript; charset=utf-8'],", "['/session-client.mjs', 'text/javascript; charset=utf-8'],\n  ['/runtime-view.mjs', 'text/javascript; charset=utf-8'],")
s = s.replace('token = crypto.randomBytes(32).toString(\'hex\'), authOptions = {}, scanTimeoutMs = 30_000,', 'token = crypto.randomBytes(32).toString(\'hex\'), authOptions = {}, scanTimeoutMs = 30_000, collector = null,')
s = s.replace("      if (url.pathname === '/api/session' && req.method === 'POST') {", """      if (url.pathname === '/api/ingest' && collector) {
        if (req.method !== 'POST') return send(405, { error: 'POST required' });
        if (!collector.authorize(req.headers.authorization)) return send(401, { error: 'Ingest credential required' });
        try { return send(202, collector.ingest(req.headers.authorization, await readJsonBody(req))); }
        catch (error) { return send(error.status || 400, { error: error.status ? error.message : 'Invalid batch' }); }
      }
      if (url.pathname === '/api/session' && req.method === 'POST') {""")
s = s.replace("        if (req.method !== 'GET') return send(405, { error: 'Read-only analysis API' });", """        if (collector && url.pathname === '/api/traces' && req.method === 'DELETE') {
          collector.clear(); return send(204, '');
        }
        if (req.method !== 'GET') return send(405, { error: 'Read-only analysis API' });
        if (collector && url.pathname === '/api/traces') return send(200, collector.list());
        if (collector && /^\\/api\\/traces\\/[a-f0-9]{32}$/.test(url.pathname)) {
          const result = collector.trace(url.pathname.split('/').pop());
          return result ? send(200, result) : send(404, { error: 'Trace not retained' });
        }""")
s = s.replace("runtime: 'not-implemented'", "runtime: collector ? 'explicit-wrappers' : 'not-implemented'")
s = s.replace('shutdown.abort(); auth.clear();', 'shutdown.abort(); auth.clear(); collector?.close();')
outputs['server.mjs'] = s
s = Path('public/app.mjs').read_text().replace("import {createSessionClient}","import {createRuntimeView} from './runtime-view.mjs';\nimport {createSessionClient}",1)
s = s.replace('const sessionClient = createSessionClient({baseUrl: location.href, storage});', "const sessionClient = createSessionClient({baseUrl: location.href, storage});\nconst runtimeView = createRuntimeView({root: document.getElementById('runtimeView'), request: (...args)=>sessionClient.request(...args), ready: ()=>authReady});")
s = s.replace('function showView(view){',"function showView(view){\nif(view==='runtime')void runtimeView.refresh();")
s = s.replace('await sessionClient.logout(); toast', 'await sessionClient.logout(); runtimeView.clear(); toast')
outputs['public/app.mjs'] = s
s = Path('public/index.html').read_text()
s = s.replace('</style>', '.runtime-controls{display:flex;gap:10px;margin:18px 0}.runtime-layout{display:grid;grid-template-columns:230px minmax(0,1fr);gap:20px}.runtime-trace{display:block;width:100%;text-align:left;white-space:pre-line;margin-bottom:10px;line-height:1.8;color:var(--text)}.runtime-detail{min-width:0;overflow:auto}.runtime-detail td{white-space:pre-line;overflow-wrap:anywhere}.runtime-detail .data-table{min-width:550px}@media(max-width:1100px){.runtime-layout{grid-template-columns:1fr}}\n</style>')
s = s.replace('<hr><div class="section-label">ROUTES', '<button class="navbutton" data-view="runtime"><span data-icon="pulse"></span>실제 실행 <span class="count">OBSERVED</span></button><hr><div class="section-label">ROUTES',1)
s = s.replace('<section class="overlay" id="helpView">','<section class="overlay" id="runtimeView" aria-label="실제 실행"></section>\n<section class="overlay" id="helpView">')
s = s.replace('v0.1.1','v0.2.0')
outputs['public/index.html'] = s
outputs['scripts/check-source.mjs'] = Path('scripts/check-source.mjs').read_text().replace("['lib', 'public', 'test', 'scripts']", "['lib', 'public', 'test', 'scripts', 'runtime', 'examples/runtime-app', 'examples/runtime-app/src', 'test/integration']")
deps = Path(os.environ.get('OV_PREPARED_DEPS','/tmp/runtime-deps'))
assert hashlib.sha256((deps/'package-lock.json').read_bytes()).hexdigest() == 'fb22d0a6c85e0215d5aaaaa364c53f598f9532eb4aa16648681b0451dbdda583'
p = json.loads((deps/'package.json').read_text());p['version']='0.2.0'
p['scripts'].update({'example:runtime':'node scripts/runtime-example.mjs','build:example':'vite build --config examples/runtime-app/vite.config.mjs','test:integration':'node --test test/integration/*.test.mjs','test:runtime-e2e':'python scripts/check-runtime.py'})
outputs['package.json']=json.dumps(p,ensure_ascii=False,indent=2)+'\n'
p=json.loads((deps/'package-lock.json').read_text());p['version']=p['packages']['']['version']='0.2.0'
outputs['package-lock.json']=json.dumps(p,ensure_ascii=False,indent=2)+'\n'
for name, content in outputs.items():
    assert hashlib.sha256(content.encode()).hexdigest() == expected[name], 'Import output mismatch: '+name
for name, content in outputs.items(): Path(name).write_text(content)
# This narrowly-scoped importer removes itself. Normal verification remains read-only.
for name in ['scripts/finalize-runtime-import.py','.github/workflows/prepare-runtime-dependencies.yml']:
    Path(name).unlink(missing_ok=True)
print('Imported six hash-verified files. No main branch or application data was modified.')
