import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createSourceRegistry, loadSourceModule } from '../runtime/source-registry.mjs';
import { transformSource } from '../runtime/source-transform.mjs';
import { sourceGraph } from '../runtime/source-graph.mjs';
import { scanProject } from '../lib/scanner.mjs';
import { createCollector } from '../runtime/collector.mjs';
import { createNodeTracer } from '../runtime/node-sdk.mjs';
import { createBrowserTracer } from '../runtime/browser-sdk.mjs';
import { createEmitter } from '../runtime/emitter.mjs';
import { randomId, validateEvent } from '../runtime/protocol.mjs';
import { createServer } from '../server.mjs';
const root = path.resolve('examples/runtime-app'), buildId = 'build:1', projectId = 'test';
const source = "import { traceAction } from '@open-view/runtime';\nexport function save(){return traceAction('save', async action => action.span('same', async handler => 42));}";
const make = options => createSourceRegistry({ projectId, root, ...options });
const capture = (registry, text = source, build = buildId) => registry.capture({ moduleId:'src/main.jsx',source:text,buildId:build });
const event = (result, index=0, patch={}) => ({ projectId, buildId, spanId:randomId(8), parentSpanId:null, durationMs:1, status:'ok',
  source:{manifestId:result.manifestId,definitionId:result.definitions[index].sourceRef.definitionId}, ...patch });

test('transform links exact callback offsets, including nested wrappers, not labels',()=>{
 const result=capture(make()); assert.equal(result.definitions.length,2);
 for(const item of result.definitions) assert.ok(source.slice(item.sourceRef.start,item.sourceRef.end).startsWith('async '));
 assert.equal((result.code.match(/manifestId/g)||[]).length,2);
 const other=capture(make(),source.replace("'same'","'save'"));
 assert.equal(new Set(other.definitions.map(item=>item.sourceRef.definitionId)).size,2);
});
test('scanner and runtime transform share file-version source references',async t=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'ov-mapping-'));t.after(()=>fs.rm(temp,{recursive:true,force:true}));
 await fs.writeFile(path.join(temp,'main.jsx'),source);
 const result=transformSource({root:temp,moduleId:'main.jsx',source}); const graph=await scanProject(temp);
 for(const definition of result.definitions){const match=graph.nodes.find(node=>node.id===definition.sourceRef.definitionId);assert.ok(match);const {sourceSnapshotId,...ref}=match.sourceRef;assert.deepEqual(ref,definition.sourceRef);}
});
test('unrelated file edits do not change a module definition; module edits do',async t=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'ov-ref-'));t.after(()=>fs.rm(temp,{recursive:true,force:true}));
 await fs.writeFile(path.join(temp,'a.jsx'),source);await fs.writeFile(path.join(temp,'b.js'),'export const x=1');
 const one=await scanProject(temp);await fs.writeFile(path.join(temp,'b.js'),'export const x=2');const two=await scanProject(temp);
 assert.notEqual(one.sourceSnapshotId,two.sourceSnapshotId);assert.deepEqual(one.nodes.filter(n=>n.kind==='function').map(n=>n.id),two.nodes.filter(n=>n.kind==='function').map(n=>n.id));
 await fs.appendFile(path.join(temp,'a.jsx'),'\n// changed');const three=await scanProject(temp);assert.notEqual(two.nodes.find(n=>n.kind==='function').id,three.nodes.find(n=>n.kind==='function').id);
});
test('shadowed functions and unknown/indirect callbacks remain unmapped',()=>{
 const result=transformSource({root,moduleId:'src/main.jsx',source:`import {traceAction} from '@open-view/runtime';
 function local(traceAction){traceAction('fake',x=>42);}
 traceAction('indirect',callback); traceAction(dynamic,x=>42);
 traceAction('ok',action=>{ function shadow(action){action.span('fake',x=>1);} return action.span('real',ctx=>2); });`});
 assert.deepEqual(result.definitions.map(item=>item.label),['ok','real']);
});
test('explicit Node receiver parameter and options are supported without interpreting names',()=>{
 const result=transformSource({root,moduleId:'service.mjs',nodeReceivers:['tracer'],source:"export function save({tracer}){return tracer.span('fallback',ctx=>42,{kind:'fallback',});}"});
 assert.equal(result.definitions.length,1);assert.match(result.code,/kind:'fallback',source:/);
 assert.throws(()=>transformSource({root,moduleId:'bad.js',source:'export function ('}));
});
test('source protocol rejects payloads, paths and malformed source references',()=>{
 const base={schemaVersion:1,eventId:randomId(),projectId,buildId,runtimeInstanceId:'node:1',pageInstanceId:null,interactionId:null,sequence:1,droppedCount:0,traceId:randomId(),spanId:randomId(8),parentSpanId:null,kind:'function',name:'x',startedAt:0,durationMs:1,status:'ok',outcome:{}};
 for(const source of ['secret',{manifestId:'x',definitionId:'x'},{manifestId:'a'.repeat(64),definitionId:'function:'+'b'.repeat(20),code:'secret'}])assert.throws(()=>validateEvent({...base,source}));
 assert.ok(validateEvent({...base,source:null}));
});
test('registry checks project/build/definition identity and never falls back to current source',()=>{
 const registry=make(),result=capture(registry),record=event(result);
 assert.equal(registry.resolve(record).status,'linked');assert.equal(registry.resolve({...record,projectId:'wrong'}).status,'project-mismatch');
 assert.equal(registry.resolve({...record,buildId:'wrong'}).status,'build-mismatch');assert.equal(registry.resolve({...record,source:{...record.source,definitionId:'function:'+'0'.repeat(20)}}).status,'definition-mismatch');
 assert.equal(registry.resolve({...record,source:{...record.source,manifestId:'0'.repeat(64)}}).status,'not-retained');assert.equal(registry.resolve({}).status,'not-instrumented');
});
test('HMR revision retains old callback bytes and produces new definition IDs',()=>{
 const registry=make(),old=capture(registry),before=registry.read(old.manifestId,old.definitions[1].sourceRef.definitionId);
 const next=capture(registry,source.replace('=> 42','=> 99'),'build:2');
 assert.notEqual(old.manifestId,next.manifestId);assert.notEqual(old.definitions[1].sourceRef.definitionId,next.definitions[1].sourceRef.definitionId);
 assert.deepEqual(registry.read(old.manifestId,old.definitions[1].sourceRef.definitionId),before);assert.match(before.code,/42/);
 assert.match(registry.read(next.manifestId,next.definitions[1].sourceRef.definitionId).code,/99/);
 assert.equal(registry.resolve(event(old)).status,'linked');assert.equal(registry.resolve(event(next,0,{buildId:'build:2'})).status,'linked');
});
test('bounded source retention evicts and expires explicitly rather than remapping',()=>{
 let clock=0;const registry=make({maxVersions:1,ttlMs:100,now:()=>clock}),old=capture(registry);
 const next=capture(registry,source+'\n// new','build:2');assert.equal(registry.resolve(event(old)).status,'not-retained');assert.equal(registry.stats().versions,1);
 clock=101;assert.equal(registry.read(next.manifestId,next.definitions[0].sourceRef.definitionId),null);assert.equal(registry.stats().bytes,0);
 assert.throws(()=>capture(make({maxBytes:10})));assert.throws(()=>capture(make({maxFileBytes:10})));
 for(const moduleId of ['../outside.js','.env','node_modules/a.js','a/../main.jsx']) assert.throws(()=>registry.capture({moduleId,source,buildId}));
});
test('source graph preserves versions and derives only observed ancestry, including missing/cyclic parents',()=>{
 const registry=make(),result=capture(registry),first=event(result),child=event(result,1,{parentSpanId:first.spanId}),unmapped={...event(result),source:null,parentSpanId:first.spanId};
 const grandchild=event(result,1,{parentSpanId:unmapped.spanId});
 const graph=sourceGraph([first,child,unmapped,grandchild],registry);assert.equal(graph.nodes.length,2);assert.equal(graph.linkedSpans,3);assert.equal(graph.edges.length,2);assert.deepEqual(graph.edges.map(e=>e.intermediateSpans).sort(),[0,1]);
 assert.equal(graph.nodes.find(n=>n.id===child.source.definitionId).executions,2);
 assert.equal(sourceGraph([{...first,parentSpanId:first.spanId}],registry).edges.length,0);
 assert.equal(sourceGraph([{...child,parentSpanId:'missing'}],registry).edges.length,0);
});
test('transformed Node module actually executes and emits exact stored refs through collector',async t=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'ov-node-'));t.after(()=>fs.rm(temp,{recursive:true,force:true}));
 await fs.writeFile(path.join(temp,'service.mjs'),"export const save=({tracer})=>tracer.span('save',async context=>42);");
 const sources=createSourceRegistry({root:temp,projectId}),collector=createCollector({projectId,sources});
 const agent=collector.issueAgent({buildId,runtimeInstanceId:'node:one'});
 const emitter=createEmitter(agent.scope,{autoFlush:false,send:events=>collector.ingest(`Bearer ${agent.token}`,{events})});
 const module=await loadSourceModule({registry:sources,moduleId:'service.mjs',buildId});assert.equal(await module.save({tracer:createNodeTracer({emitter})}),42);await emitter.flush();
 const trace=collector.trace(collector.list().traces[0].traceId);assert.equal(trace.sourceGraph.linkedSpans,1);
 assert.match(sources.read(trace.events[0].source.manifestId,trace.events[0].source.definitionId).code,/async context=>42/);
 collector.close();assert.equal(sources.stats().versions,0);
});
test('browser action and nested wrapper emit explicit source without changing return values',async()=>{
 const result=capture(make()),events=[];const tracer=createBrowserTracer({emitter:{emit:e=>events.push(e)}});
 const outer=event(result).source,inner=event(result,1).source;
 assert.equal(await tracer.traceAction('save',action=>action.span('child',()=>42,{source:inner}),{source:outer}),42);
 assert.deepEqual(events.map(e=>e.source),[inner,outer]);
});
test('immutable source endpoint requires UI auth, not agent credentials; unknown refs return 404',async t=>{
 const sources=make(),captured=capture(sources),collector=createCollector({projectId,sources});
 const app=createServer({project:root,port:0,collector});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(()=>{app.server.closeAllConnections();app.server.close();});
 const base=`http://127.0.0.1:${app.server.address().port}`,url=base+'/api/sources/'+captured.manifestId+'/'+captured.definitions[0].sourceRef.definitionId;
 assert.equal((await fetch(url)).status,401);const agent=collector.issueAgent({buildId,runtimeInstanceId:'node:one'});assert.equal((await fetch(url,{headers:{Authorization:`Bearer ${agent.token}`}})).status,401);
 const session=await (await fetch(base+'/api/session',{method:'POST',headers:{Authorization:`Bearer ${app.token}`}})).json();
 const headers={Authorization:`Bearer ${session.accessToken}`};const response=await fetch(url,{headers});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 const original=await response.json();assert.match(original.code,/action\.span/);assert.ok(!original.code.includes('manifestId'));
 assert.equal((await fetch(url.replace(captured.manifestId,'0'.repeat(64)),{headers})).status,404);
});
test('source deletion revokes history and loaded-module refs become explicitly unretained',()=>{
 const sources=make(),result=capture(sources),collector=createCollector({projectId,sources});
 assert.equal(sources.resolve(event(result)).status,'linked');collector.clear();
 assert.equal(sources.resolve(event(result)).status,'not-retained');assert.equal(sources.stats().bytes,0);
});
test('source loader denies symlink escape and unsupported module semantics',async t=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'ov-loader-'));t.after(()=>fs.rm(temp,{recursive:true,force:true}));
 const registry=createSourceRegistry({projectId,root:temp});
 await fs.writeFile(path.join(temp,'real.mjs'),'export const a=import.meta.url;');await fs.symlink(path.join(temp,'real.mjs'),path.join(temp,'alias.mjs'));
 await assert.rejects(loadSourceModule({registry,moduleId:'alias.mjs',buildId}),/symlink/);
 await assert.rejects(loadSourceModule({registry,moduleId:'real.mjs',buildId}),/import.meta/);
 await assert.rejects(loadSourceModule({registry,moduleId:'../outside.mjs',buildId}),/inside/);
});
test('source graph has a bounded ancestry walk rather than time-based or name-based guesses',()=>{
 const registry=make(),result=capture(registry),first=event(result);const events=[first];
 for(let index=0;index<130;index++)events.push({...event(result),source:null,parentSpanId:events.at(-1).spanId});
 events.push(event(result,1,{parentSpanId:events.at(-1).spanId}));
 const graph=sourceGraph(events,registry);assert.equal(graph.ancestryTruncated,1);assert.equal(graph.edges.length,0);
});
