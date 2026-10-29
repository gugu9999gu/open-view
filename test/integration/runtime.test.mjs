import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startRuntimeExample, validateExampleDatabase } from '../../scripts/runtime-example.mjs';
import { createBrowserTracer } from '../../runtime/browser-sdk.mjs';
import { createEmitter, httpTransport } from '../../runtime/emitter.mjs';

const databaseUrl = process.env.OPEN_VIEW_EXAMPLE_DATABASE_URL;
if (!databaseUrl) throw new Error('Integration tests require a real dedicated PostgreSQL database; skipping is not a pass.');

test('real PostgreSQL + Vite HTTP + SDKs integration',async t=>{
  const app=await startRuntimeExample({databaseUrl,uiPort:0,appPort:0});
  const prefix=`integration-${crypto.randomUUID()}`;
  t.after(async()=>{try{await app.pool.query('DELETE FROM open_view_runtime_examples WHERE name LIKE $1',[prefix+'%']);}finally{await app.close();}});
  const agent=app.collector.issueAgent({buildId:'integration:1',runtimeInstanceId:`browser:${crypto.randomUUID()}`,pageInstanceId:crypto.randomBytes(16).toString('hex'),kinds:['action','function','http.client']});
  const emitter=createEmitter(agent.scope,{send:httpTransport({url:app.uiUrl+'/api/ingest',token:agent.token})});t.after(()=>emitter.close());
  const browser=createBrowserTracer({emitter,baseUrl:app.appUrl,allowedOrigins:[app.appUrl]});
  async function save(scenario,name){
    let traceId;
    const response=await browser.traceAction('Save customer',async action=>{traceId=action.traceId;return action.span('handleSaveCustomer',handler=>handler.fetch(app.appUrl+'/api/customers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,scenario})}));});
    await emitter.flush();await app.emitter.flush();
    const trace=app.collector.trace(traceId);return {response,trace};
  }
  for(const scenario of ['success','rollback','after-commit','fixture'])await t.test(scenario,async()=>{
    const name=prefix+'-'+scenario;const {response,trace}=await save(scenario,name);const body=await response.json();
    const expectedCommitted=['success','after-commit'].includes(scenario);
    assert.equal(response.status,['rollback','after-commit'].includes(scenario)?500:200);
    assert.equal(trace.events.find(e=>e.kind==='db.transaction').outcome.transaction,expectedCommitted?'committed':'rolled-back');
    assert.equal(trace.coverage.missingParents.length,0);
    const row=await app.pool.query('SELECT COUNT(*)::int AS count FROM open_view_runtime_examples WHERE name=$1',[name]);assert.equal(row.rows[0].count,expectedCommitted?1:0);
    assert.ok(!JSON.stringify(trace).includes(name));assert.ok(!JSON.stringify(trace).includes('INSERT INTO'));
    if(scenario==='fixture'){assert.equal(body.origin,'fixture');assert.ok(trace.events.some(e=>e.kind==='fallback'&&e.outcome.dataOrigin==='fixture'));}
    if(scenario==='after-commit')assert.ok(trace.events.some(e=>e.name==='createCustomer'&&e.outcome.business==='failed'));
    for(const kind of ['action','function','http.client','http.server','db.query','db.transaction'])assert.ok(trace.events.some(e=>e.kind===kind));
  });
  await t.test('concurrent saves and untraced polling have separate trace identities',async()=>{
    const results=await Promise.all([1,2,3].map(i=>save('success',prefix+'-parallel-'+i)));
    assert.equal(new Set(results.map(result=>result.trace.traceId)).size,3);
    for(const {trace} of results){assert.equal(trace.events.filter(e=>e.kind==='action').length,1);assert.equal(trace.events.filter(e=>e.kind==='db.transaction').length,1);}
    const before=new Set(app.collector.list().traces.map(trace=>trace.traceId));await fetch(app.appUrl+'/api/ping');await app.emitter.flush();
    const polls=app.collector.list().traces.filter(trace=>!before.has(trace.traceId));assert.equal(polls.length,1);assert.equal(polls[0].name,'poll');
  });
  await t.test('relay rejects other ports, missing credentials, and forged Node events',async()=>{
    assert.equal((await fetch(app.appUrl+'/__open_view/bootstrap',{headers:{Origin:'http://localhost:1'}})).status,403);
    assert.equal((await fetch(app.appUrl+'/__open_view/events',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
    const boot=await (await fetch(app.appUrl+'/__open_view/bootstrap')).json();assert.ok(boot.relaySession);assert.ok(!boot.token);
    const existing=app.collector.list().traces.find(trace=>trace.transactions.length);const fake=app.collector.trace(existing.traceId).events.find(e=>e.kind==='db.transaction');
    const response=await fetch(app.appUrl+'/__open_view/events',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${boot.relaySession}`},body:JSON.stringify({events:[fake]})});
    assert.equal(response.status,503);
  });
  await t.test('collector shutdown does not change business writes',async()=>{
    await app.stopCollector();
    const response=await fetch(app.appUrl+'/api/customers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:prefix+'-offline',scenario:'success'})});assert.equal(response.status,200);
    await app.emitter.flush();assert.ok(app.emitter.stats().dropped>0);
    const rows=await app.pool.query('SELECT id FROM open_view_runtime_examples WHERE name=$1',[prefix+'-offline']);assert.equal(rows.rowCount,1);
  });
});
test('example refuses non-local or non-dedicated databases',()=>{
  for(const url of ['postgres://example.com/open_view_test','postgres://localhost/production','postgres://localhost/open_view_test?host=evil','https://localhost/open_view_test'])assert.throws(()=>validateExampleDatabase(url));
});
