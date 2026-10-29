import test from 'node:test';
import assert from 'node:assert/strict';
import { createCollector } from '../runtime/collector.mjs';
import { createEmitter, httpTransport } from '../runtime/emitter.mjs';
import { createNodeTracer } from '../runtime/node-sdk.mjs';
import { createBrowserTracer } from '../runtime/browser-sdk.mjs';
import { traceTransaction } from '../runtime/postgres.mjs';
import { randomId, validateEvent } from '../runtime/protocol.mjs';
const scope = { projectId:'test',buildId:'build:1',runtimeInstanceId:'runtime:1',pageInstanceId:null };
const event = (patch={}) => ({...scope,schemaVersion:1,eventId:randomId(),sequence:1,droppedCount:0,traceId:randomId(),spanId:randomId(8),parentSpanId:null,interactionId:null,kind:'function',name:'function label',startedAt:Date.now(),durationMs:1,status:'ok',outcome:{},...patch});
function fixture(options={}) { const collector=createCollector({projectId:'test',...options});const agent=collector.issueAgent(scope);return {collector,auth:`Bearer ${agent.token}`}; }
function memoryTracer() { const events=[];return {events,tracer:createNodeTracer({emitter:{emit:event=>events.push(event)}})}; }
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));

test('collector validates scope and excludes payload/header/SQL fields atomically',()=>{
  const {collector,auth}=fixture();
  for(const field of ['body','headers','sql','error','source']) assert.throws(()=>collector.ingest(auth,{events:[event(),event({sequence:2,[field]:'private'})]}),{status:400});
  assert.equal(collector.list().retainedEvents,0);
  assert.throws(()=>collector.ingest(auth,{events:[event({projectId:'other'})]}),{status:403});
  assert.throws(()=>collector.ingest(auth,{events:[event({buildId:'other'})]}),{status:403});
});
test('collector deduplicates reordered events and resolves gaps without inventing parents',()=>{
  const {collector,auth}=fixture(),root=event(),child=event({sequence:3,traceId:root.traceId,parentSpanId:root.spanId});
  collector.ingest(auth,{events:[child]});assert.equal(collector.trace(root.traceId).coverage.missingParents.length,1);
  assert.equal(collector.trace(root.traceId).coverage.runtimeSequenceGaps,2);
  assert.equal(collector.ingest(auth,{events:[child]}).accepted,0);
  collector.ingest(auth,{events:[event({sequence:2,traceId:root.traceId}),root]});
  assert.equal(collector.trace(root.traceId).coverage.runtimeSequenceGaps,0);
  assert.equal(collector.trace(root.traceId).coverage.missingParents.length,0);
});
test('collector rejects sequence and event identity collisions including within a batch',()=>{
  const {collector,auth}=fixture(),first=event();collector.ingest(auth,{events:[first]});
  assert.throws(()=>collector.ingest(auth,{events:[event()]}),{status:409});
  assert.throws(()=>collector.ingest(auth,{events:[{...first,sequence:2}]}),{status:409});
  const duplicate=event({sequence:2});
  assert.throws(()=>collector.ingest(auth,{events:[duplicate,{...duplicate,sequence:3}]}),{status:409});
});
test('collector bounds retention and grants; expires and revokes ingest credentials',()=>{
  let now=0;const {collector,auth}=fixture({now:()=>now,ttlMs:100,maxEvents:1,maxAgents:1});
  assert.throws(()=>collector.issueAgent({...scope,runtimeInstanceId:'another'}),{status:429});
  collector.ingest(auth,{events:[event(),event({sequence:2})]});assert.equal(collector.list().retainedEvents,1);assert.equal(collector.list().evicted,1);
  now=101;assert.equal(collector.list().retainedEvents,0);assert.throws(()=>collector.ingest(auth,{events:[event()]}),{status:401});
  const agent=collector.issueAgent(scope);collector.revoke(agent.token);assert.equal(collector.authorize(`Bearer ${agent.token}`),null);
});
test('collector kinds, batch limits and request rate are enforced',()=>{
  const collector=createCollector({projectId:'test'}),agent=collector.issueAgent({...scope,kinds:['function']});const auth=`Bearer ${agent.token}`;
  assert.throws(()=>collector.ingest(auth,{events:[event({kind:'db.transaction'})]}),{status:403});
  assert.throws(()=>collector.ingest(auth,{events:Array.from({length:65},()=>event())}),{status:400});
  const first=event();for(let i=0;i<238;i++)collector.ingest(auth,{events:[first]});
  assert.throws(()=>collector.ingest(auth,{events:[first]}),{status:429});
});
test('emitter queue is bounded and carries cumulative dropped counts',async()=>{
  const sent=[];const emitter=createEmitter(scope,{maxQueue:1,autoFlush:false,send:async events=>{sent.push(...events);return true;}});
  const base=event();emitter.emit(base);emitter.emit(base);assert.equal(emitter.stats().dropped,1);await emitter.flush();
  emitter.emit(base);await emitter.flush();assert.deepEqual(sent.map(e=>e.sequence),[1,3]);assert.equal(sent.at(-1).droppedCount,1);
});
test('emitter transport errors and shutdown never throw into application code',async()=>{
  const emitter=createEmitter(scope,{autoFlush:false,send:async()=>{throw new Error('offline');}});emitter.emit(event());await emitter.flush();
  assert.equal(emitter.stats().dropped,1);emitter.close();emitter.emit(event());assert.equal(emitter.stats().queued,0);
});
test('collector transport refuses external/credential URLs and forwards no cookies',async()=>{
  assert.throws(()=>httpTransport({url:'https://example.com/api/ingest',token:'test'}));
  let init;const send=httpTransport({url:'http://127.0.0.1:4418/api/ingest',token:'test',fetchImpl:async(_url,options)=>{init=options;return new Response('{}',{status:202});}});
  assert.equal(await send([event()]),true);assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');assert.ok(init.signal);
});
test('Node concurrent contexts and nested spans retain exact parents',async()=>{
  const {tracer,events}=memoryTracer();
  await Promise.all([1,2].map(i=>tracer.span(`root${i}`,async root=>{await delay(i);return tracer.span('child',async child=>{await delay(3-i);assert.equal(tracer.current().traceId,root.traceId);assert.equal(child.parentSpanId,root.spanId);});})));
  assert.equal(new Set(events.filter(e=>!e.parentSpanId).map(e=>e.traceId)).size,2);assert.equal(tracer.current(),undefined);
});
test('Node accepts valid traceparent, rejects zero IDs, and rethrows original error',async()=>{
  const {tracer,events}=memoryTracer(),traceId=randomId(),parent=randomId(8),original=new Error('PRIVATE_ERROR');
  await assert.rejects(tracer.request('request',`00-${traceId}-${parent}-01`,()=>{throw original;}),error=>error===original);
  assert.equal(events[0].traceId,traceId);assert.equal(events[0].parentSpanId,parent);assert.ok(!JSON.stringify(events).includes('PRIVATE_ERROR'));
  await tracer.request('request','00-'+('0'.repeat(32))+'-'+parent+'-01',()=>{});assert.equal(events[1].parentSpanId,null);
});
test('browser actions isolate explicit context, preserve results and connect fetch',async()=>{
  const events=[],headers=[];const tracer=createBrowserTracer({emitter:{emit:e=>events.push(e)},baseUrl:'http://localhost:123/',allowedOrigins:['http://localhost:123'],fetchImpl:async(_url,init)=>{headers.push(init.headers.get('traceparent'));return new Response('ok');}});
  const results=await Promise.all([1,2].map(i=>tracer.traceAction('click',async action=>{await delay(i);return action.span('handler',async context=>(await context.fetch('/api/customer')).text());})));
  assert.deepEqual(results,['ok','ok']);assert.equal(new Set(events.filter(e=>e.kind==='action').map(e=>e.traceId)).size,2);
  assert.equal(headers.length,2);for(const header of headers)assert.ok(events.some(e=>e.kind==='http.client'&&header.includes(e.spanId)));
});
test('browser allowlist and telemetry exclusion do not modify non-target requests',async()=>{
  const calls=[];const tracer=createBrowserTracer({emitter:{emit(){}},baseUrl:'http://localhost:123/',allowedOrigins:['http://localhost:123'],fetchImpl:async(url,init)=>{calls.push(init);return new Response('ok');}});
  await tracer.traceAction('click',async action=>{await action.fetch('https://example.com/api');await action.fetch('/__open_view/events');});
  assert.ok(calls.every(init=>!init.headers));
});
test('browser abort/error identity and manual redirect policy are preserved',async()=>{
  const events=[],error=new DOMException('PRIVATE_CANCEL','AbortError');let options;
  const tracer=createBrowserTracer({emitter:{emit:e=>events.push(e)},baseUrl:'http://localhost:123/',allowedOrigins:['http://localhost:123'],fetchImpl:async(_url,init)=>{options=init;throw error;}});
  const signal=AbortSignal.abort();await assert.rejects(tracer.traceAction('click',action=>action.fetch('/api',{signal})),e=>e===error);
  assert.equal(options.signal,signal);assert.equal(options.redirect,'error');assert.ok(events.every(e=>e.status==='cancelled'));assert.ok(!JSON.stringify(events).includes('PRIVATE_CANCEL'));
});
function fakePool({ commitError=false, rollbackError=false, command='COMMIT' }={}) {
  const commands=[],released=[];
  const client={async query(sql){commands.push(sql);if(sql==='COMMIT'&&commitError)throw new Error('ack lost');if(sql==='ROLLBACK'&&rollbackError)throw new Error('lost');return {command:sql==='COMMIT'?command:sql,rows:[]};},release(value){released.push(value);}};
  return {pool:{connect:async()=>client},commands,released};
}
test('PG confirms commit on acknowledgement and never records query strings/values',async()=>{
  const {tracer,events}=memoryTracer(),db=fakePool();
  await traceTransaction(tracer,db.pool,db=>db.query('INSERT','PRIVATE_SQL',['PRIVATE_PARAM']));
  assert.deepEqual(db.commands,['BEGIN','PRIVATE_SQL','COMMIT']);assert.equal(events.at(-1).outcome.transaction,'committed');assert.ok(!JSON.stringify(events).includes('PRIVATE_'));
});
test('PG rollback preserves original failure; rollback failure remains unknown',async()=>{
  for(const rollbackError of [false,true]){
    const {tracer,events}=memoryTracer(),db=fakePool({rollbackError}),error=new Error('original');
    await assert.rejects(traceTransaction(tracer,db.pool,()=>{throw error;}),e=>e===error);
    assert.equal(events.at(-1).outcome.transaction,rollbackError?'unknown':'rolled-back');assert.equal(db.released[0],rollbackError);
  }
});
test('PG lost COMMIT acknowledgement stays unknown, does not infer rollback, discards client',async()=>{
  const {tracer,events}=memoryTracer(),db=fakePool({commitError:true});await assert.rejects(traceTransaction(tracer,db.pool,()=>{}));
  assert.equal(events.at(-1).outcome.transaction,'unknown');assert.ok(!db.commands.includes('ROLLBACK'));assert.equal(db.released[0],true);
});
test('PG server-side implicit rollback on COMMIT is not reported as commit',async()=>{
  const {tracer,events}=memoryTracer(),db=fakePool({command:'ROLLBACK'});await assert.rejects(traceTransaction(tracer,db.pool,()=>{}));
  assert.equal(events.at(-1).outcome.transaction,'rolled-back');
});
test('protocol rejects impossible values and normalizes independent outcome dimensions',()=>{
  for(const patch of [{durationMs:-1},{sequence:0},{traceId:'0'.repeat(32)},{status:'success'},{outcome:{transaction:'committed',secret:'x'}}])assert.throws(()=>validateEvent(event(patch)));
  const result=validateEvent(event({outcome:{transaction:'committed',business:'failed',dataOrigin:'fixture'}}));assert.equal(result.outcome.transaction,'committed');assert.equal(result.outcome.business,'failed');
});
