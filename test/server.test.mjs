import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { createServer, DEFAULT_PORT } from '../server.mjs';

async function fixture(t, options = {}) {
  const instance = createServer({ project: path.resolve('examples/demo-project'), port: 0, ...options });
  await new Promise(resolve => instance.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { instance.server.closeAllConnections(); instance.server.close(resolve); }));
  const base = `http://127.0.0.1:${instance.server.address().port}`;
  const request = (pathname, init) => fetch(base + pathname, init);
  const login = () => request('/api/session', { method: 'POST', headers: { Authorization: `Bearer ${instance.token}` } });
  return { ...instance, base, request, login };
}

test('HTTP bootstrap replay denied, no credential cookie issued, cookie authentication refused', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/config')).status, 401);
  const results = await Promise.all([f.login(), f.login()]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 401]);
  const accepted = results.find(r => r.status === 200);
  assert.equal(accepted.headers.get('set-cookie'), null);
  const session = await accepted.json();
  assert.notEqual(session.accessToken, f.token);
  assert.equal((await f.request('/api/config', { headers: { Cookie: `ov_session=${session.accessToken}` } })).status, 401);
  const headers = { Authorization: `Bearer ${session.accessToken}` };
  assert.equal((await f.request('/api/config', { headers })).status, 200);
  assert.equal((await f.request('/api/session', { method: 'DELETE', headers })).status, 204);
  assert.equal((await f.request('/api/config', { headers })).status, 401);
});
test('real HTTP scan runs in worker and returns static evidence, not runtime claims', async t => {
  const f = await fixture(t), session = await (await f.login()).json();
  const response = await f.request('/api/graph', { headers: { Authorization: `Bearer ${session.accessToken}` } });
  assert.equal(response.status, 200);
  const graph = await response.json();
  assert(graph.nodes.some(n => n.label === 'handleSave'));
  assert.equal(graph.coverage.runtime, 'not-instrumented');
  assert.equal(graph.coverage.status, 'complete');
});
test('host, origin, null origin, cross-site, preflight and arbitrary file access denied', async t => {
  const f = await fixture(t), session = await (await f.login()).json();
  for (const addition of [{Origin:'http://127.0.0.1:3000'}, {Origin:'null'}, {'Sec-Fetch-Site':'cross-site'}]) {
    assert.equal((await f.request('/api/config', {headers:{Authorization:`Bearer ${session.accessToken}`,...addition}})).status, 403);
  }
  const deniedHost = await new Promise((resolve,reject)=>{
    const req=http.request(f.base+'/api/config',{headers:{Host:'attacker.invalid:4418',Authorization:`Bearer ${session.accessToken}`}},res=>{res.resume();resolve(res.statusCode);});
    req.on('error',reject);req.end();
  });
  assert.equal(deniedHost,403);
  const preflight = await f.request('/api/config', {method:'OPTIONS',headers:{Origin:'https://attacker.invalid'}});
  assert.equal(preflight.headers.get('access-control-allow-origin'), null);
  for (const pathname of ['/.env', '/package.json', '/lib/auth.mjs', '/%2e%2e/server.mjs']) assert.equal((await f.request(pathname)).status, 404);
});
test('HTTP sessions expire independently from client storage and cookies', async t => {
  let time = 0;
  const f = await fixture(t, {authOptions:{now:()=>time,sessionTtlMs:5}});
  const session = await (await f.login()).json(); time = 5;
  assert.equal((await f.request('/api/config',{headers:{Authorization:`Bearer ${session.accessToken}`}})).status,401);
});
test('HTML and assets carry no secrets; CSP uses nonce and old cookie is only expired', async t => {
  const f = await fixture(t);
  const response = await f.request('/');
  assert.equal(response.headers.get('set-cookie'),null);
  assert.match(response.headers.get('content-security-policy'), /script-src 'self' 'nonce-/);
  const html = await response.text(); assert(!html.includes(f.token)); assert.match(html,/type="module" nonce="[^"]+" src="\.\/app.mjs"/);
  assert.equal((await f.request('/',{method:'HEAD'})).status,200);
  const migration = await f.request('/',{headers:{Cookie:'ov_session=obsolete'}});
  assert.match(migration.headers.get('set-cookie'),/^ov_session=;.*Max-Age=0/);
  for (const asset of ['/app.mjs','/graph-model.mjs','/session-client.mjs']) assert.equal((await f.request(asset)).status,200);
  assert(![4317,4318].includes(DEFAULT_PORT));
});
test('absolute-form request cannot select a different origin', async t => {
  const f=await fixture(t);
  const status=await new Promise((resolve,reject)=>{
    const req=http.request(f.base,{path:'http://attacker.invalid/api/config'},res=>{res.resume();resolve(res.statusCode);});
    req.on('error',reject);req.end();
  });
  assert.equal(status,403);
});
test('hard analysis deadline reports failure rather than a complete graph', async t => {
  const f=await fixture(t,{scanTimeoutMs:1}), session=await (await f.login()).json();
  const response=await f.request('/api/graph',{headers:{Authorization:`Bearer ${session.accessToken}`}});
  assert.equal(response.status,503); assert.equal((await response.json()).nodes,undefined);
});
