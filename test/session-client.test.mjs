import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionClient} from '../public/session-client.mjs';
const token='a'.repeat(64),accessToken='b'.repeat(64),baseUrl='http://127.0.0.1:4418';
function storage(){const map=new Map();return {getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k),map};}
function fixture(options={}){
 const saved=storage(),calls=[];
 const client=createSessionClient({baseUrl,storage:saved,now:()=>10,fetchImpl:async(url,init)=>{calls.push({url,init});return Response.json({accessToken,expiresAt:100});},...options});
 return {saved,calls,client};
}
test('bootstrap not persisted; session persists for reload with explicit cookie-free requests',async()=>{
 const {client,saved,calls}=fixture();await client.bootstrap(token);assert(![...saved.map.values()].join('').includes(token));assert([...saved.map.values()].join('').includes(accessToken));
 await client.request('/api/graph');assert.equal(calls[1].init.headers.get('Authorization'),`Bearer ${accessToken}`);assert.equal(calls[1].init.credentials,'omit');assert.equal(calls[1].init.redirect,'error');
 const reload=createSessionClient({baseUrl,storage:saved,now:()=>10});assert(reload.hasSession());
});
test('UI credential cannot reach another port, another host, or a non-API path',async()=>{
 const {client,calls}=fixture();await client.bootstrap(token);
 for(const url of ['http://127.0.0.1:3000/api/x','https://attacker.invalid/api/x','//attacker.invalid/api/x','/app.mjs','/api/../file'])await assert.rejects(client.request(url));
 assert.equal(calls.length,1);
});
test('unauthorized response clears storage; logout is revocable',async()=>{
 const saved=storage();let code=200;
 const client=createSessionClient({baseUrl,storage:saved,now:()=>10,fetchImpl:async()=>Response.json({accessToken,expiresAt:100},{status:code})});
 await client.bootstrap(token);code=401;await client.request('/api/config');assert(!client.hasSession());assert.equal(saved.map.size,0);
 code=200;await client.bootstrap(token);await client.logout();assert(!client.hasSession());
});
test('storage denial falls back to memory without leaking credentials',async()=>{
 const denied={getItem(){throw Error();},setItem(){throw Error();},removeItem(){throw Error();}};
 const {client}=fixture({storage:denied});await client.bootstrap(token);assert(client.hasSession());await client.logout();assert(!client.hasSession());
});
test('expired sessions are not attached and redirects cannot be opted in',async()=>{
 let now=10;const {client,calls}=fixture({now:()=>now});await client.bootstrap(token);now=100;
 await client.request('/api/config',{redirect:'follow',credentials:'include',headers:{Authorization:'Bearer injected'}});
 assert.equal(calls[1].init.headers.get('Authorization'),null);assert.equal(calls[1].init.redirect,'error');assert.equal(calls[1].init.credentials,'omit');
});


test('late unauthorized response from previous login cannot clear a newer session', async () => {
 const saved=storage();let rejectOld;
 const oldResponse=new Promise(resolve=>{rejectOld=resolve;});
 let sessions=0;
 const nextToken='c'.repeat(64);
 const client=createSessionClient({baseUrl,storage:saved,now:()=>10,fetchImpl:async (url,init)=>{
  if(url.endsWith('/api/session') && init.method==='POST') return Response.json({accessToken:++sessions===1?accessToken:nextToken,expiresAt:100});
  if(url.endsWith('/api/graph')) return oldResponse;
  return Response.json({});
 }});
 await client.bootstrap(token);
 const oldRequest=client.request('/api/graph');
 await client.bootstrap(token);
 rejectOld(Response.json({error:'expired'},{status:401}));
 await oldRequest;
 assert.equal(client.hasSession(),true);
 assert.equal(JSON.parse(saved.getItem('open-view.ui-session.v1')).accessToken,nextToken);
});

test('late logout completion cannot erase login that succeeded meanwhile', async () => {
 const saved=storage();let finishLogout;
 const pending=new Promise(resolve=>{finishLogout=resolve;});
 const nextToken='d'.repeat(64);
 let sessions=0;
 const client=createSessionClient({baseUrl,storage:saved,now:()=>10,fetchImpl:async (_url,init)=>{
  if(init.method==='POST') return Response.json({accessToken:++sessions===1?accessToken:nextToken,expiresAt:100});
  if(init.method==='DELETE') return pending;
  return Response.json({});
 }});
 await client.bootstrap(token);
 const oldLogout=client.logout();
 await client.bootstrap(token);
 finishLogout(new Response(null,{status:204}));
 await oldLogout;
 assert.equal(client.hasSession(),true);
 assert.equal(JSON.parse(saved.getItem('open-view.ui-session.v1')).accessToken,nextToken);
});
