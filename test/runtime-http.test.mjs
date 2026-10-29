import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server.mjs';
import { createCollector } from '../runtime/collector.mjs';
import { createEmitter } from '../runtime/emitter.mjs';
import { createNodeTracer } from '../runtime/node-sdk.mjs';
import path from 'node:path';
const project = path.resolve('examples/runtime-app');
async function setup(t) {
  const collector=createCollector({projectId:'test'}),ui=createServer({project,port:0,collector});
  await new Promise(resolve=>ui.server.listen(0,'127.0.0.1',resolve));t.after(()=>{ui.server.closeAllConnections();ui.server.close();});
  const url=`http://127.0.0.1:${ui.server.address().port}`;
  const login=await fetch(url+'/api/session',{method:'POST',headers:{Authorization:`Bearer ${ui.token}`}});const session=await login.json();
  const agent=collector.issueAgent({buildId:'b1',runtimeInstanceId:'r1'});
  return {collector,url,uiAuth:`Bearer ${session.accessToken}`,agentAuth:`Bearer ${agent.token}`,scope:agent.scope};
}
test('runtime HTTP separates write-only agents and UI sessions; trace deletion is UI-only',async t=>{
  const app=await setup(t);
  assert.equal((await fetch(app.url+'/api/traces',{headers:{Authorization:app.agentAuth}})).status,401);
  assert.equal((await fetch(app.url+'/api/ingest',{method:'POST',headers:{Authorization:app.uiAuth,'Content-Type':'application/json'},body:'{"events":[]}'})).status,401);
  assert.equal((await fetch(app.url+'/api/traces',{method:'DELETE',headers:{Authorization:app.agentAuth}})).status,401);
  const events=[],emitter=createEmitter(app.scope,{autoFlush:false,send:batch=>{events.push(...batch);}}),tracer=createNodeTracer({emitter});
  await tracer.span('observed',()=>42);await emitter.flush();
  const response=await fetch(app.url+'/api/ingest',{method:'POST',headers:{Authorization:app.agentAuth,'Content-Type':'application/json'},body:JSON.stringify({events})});assert.equal(response.status,202);
  const list=await (await fetch(app.url+'/api/traces',{headers:{Authorization:app.uiAuth}})).json();assert.equal(list.retainedEvents,1);
  const detail=await (await fetch(app.url+`/api/traces/${list.traces[0].traceId}`,{headers:{Authorization:app.uiAuth}})).json();assert.equal(detail.basis,'observed');assert.equal(detail.sourceMapping,'not-linked');
  assert.equal((await fetch(app.url+'/api/traces',{method:'DELETE',headers:{Authorization:app.uiAuth}})).status,204);assert.equal(app.collector.list().retainedEvents,0);
});
test('ingest rejects oversize, malformed, encoded and cross-origin bodies',async t=>{
  const app=await setup(t);const send=(body,headers={})=>fetch(app.url+'/api/ingest',{method:'POST',headers:{Authorization:app.agentAuth,'Content-Type':'application/json',...headers},body});
  assert.equal((await send('{')).status,400);assert.equal((await send('x'.repeat(66_000))).status,413);
  assert.equal((await send('{}',{'Content-Encoding':'gzip'})).status,415);assert.equal((await send('{}',{'Content-Type':'text/plain'})).status,415);
  assert.equal((await send('{}',{Origin:'http://evil.example'})).status,403);
});
