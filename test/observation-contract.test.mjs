import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeOutcome,persistenceStatus,parseTraceparent,propagationHeaders} from '../lib/observation-contract.mjs';
const traceparent=`00-${'1'.repeat(32)}-${'2'.repeat(16)}-01`;
test('successful HTTP and query without a commit do not prove persistence',()=>{
 assert.equal(persistenceStatus({transport:'response',operation:'succeeded'}),'not-confirmed');
 assert.equal(persistenceStatus({operation:'succeeded',transaction:'rolled-back'}),'rollback-confirmed');
});
test('commit survives later business failure or fixture fallback',()=>{
 assert.equal(persistenceStatus({transaction:'committed',business:'failed',dataOrigin:'fixture'}),'commit-confirmed');
 assert.equal(persistenceStatus({dataOrigin:'fixture'}),'not-confirmed');
});
test('unknown remains unknown and unsupported outcome payload fields are rejected',()=>{
 assert.equal(normalizeOutcome().transaction,'unknown');assert.throws(()=>normalizeOutcome({token:'not-allowed'}));assert.throws(()=>normalizeOutcome({transaction:'success'}));
});
test('traceparent version 00 validates lengths and nonzero IDs',()=>{
 assert(parseTraceparent(traceparent)?.sampled);assert.equal(parseTraceparent('00-'+'0'.repeat(32)+'-'+'2'.repeat(16)+'-01'),null);assert.equal(parseTraceparent(traceparent+'-extra'),null);assert.equal(parseTraceparent(traceparent.replace('00-','ff-')),null);
});
test('propagation is deny-by-default and excludes collector and telemetry requests',()=>{
 const input={url:'/api/save',baseUrl:'http://localhost:3000',traceparent};assert.deepEqual(propagationHeaders(input),{});
 assert.deepEqual(propagationHeaders({...input,allowedOrigins:['http://localhost:3000']}),{traceparent});
 assert.deepEqual(propagationHeaders({...input,allowedOrigins:['http://localhost:3000'],collectorOrigins:['http://localhost:3000']}),{});
 assert.deepEqual(propagationHeaders({...input,url:'/__open_view/events',allowedOrigins:['http://localhost:3000']}),{});
 assert.deepEqual(propagationHeaders({...input,url:'https://other.invalid/api/save',allowedOrigins:['http://localhost:3000']}),{});
});
