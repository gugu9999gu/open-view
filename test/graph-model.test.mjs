import test from 'node:test';
import assert from 'node:assert/strict';
import {createGraphIndex,searchGraph,graphWindow} from '../public/graph-model.mjs';
const graph={nodes:Array.from({length:250},(_,i)=>({id:`f${i}`,label:`function_${i}`,path:`src/f${i}.ts`,kind:'function'})),edges:[{id:'call',source:'f249',target:'f1'}]};
test('search finds nodes beyond the canvas limit and focus includes neighbors',()=>{
  const index=createGraphIndex(graph);assert.equal(graphWindow(index).nodes.length,100);
  const found=searchGraph(index,'FUNCTION_249');assert.equal(found.total,1);assert.equal(found.nodes[0].id,'f249');
  const view=graphWindow(index,{focusId:'f249'});assert.deepEqual(view.nodes.map(n=>n.id),['f249','f1']);assert.equal(view.edges.length,1);
});
test('pagination can reach every matching node without expanding the canvas',()=>{
  const index=createGraphIndex(graph);const ids=[];
  for(let offset=0;offset<250;offset+=30)ids.push(...searchGraph(index,'function',{offset}).nodes.map(n=>n.id));
  assert.equal(new Set(ids).size,250);assert.equal(searchGraph(index,'absent').total,0);
});
test('unknown focus, invalid limits, duplicate IDs and dangling edges fail explicitly',()=>{
  const index=createGraphIndex(graph);
  assert.throws(()=>graphWindow(index,{focusId:'missing'}));assert.throws(()=>graphWindow(index,{limit:0}));
  assert.throws(()=>searchGraph(index,'f',{offset:-1}));assert.throws(()=>createGraphIndex({nodes:[graph.nodes[0],graph.nodes[0]],edges:[]}));
  assert.throws(()=>createGraphIndex({nodes:[],edges:graph.edges}));
});
test('high-degree neighborhood reports omitted nodes without losing the full index',()=>{
  const large={...graph,edges:graph.nodes.slice(1).map(n=>({source:'f0',target:n.id}))};const index=createGraphIndex(large);
  const view=graphWindow(index,{focusId:'f0'});assert.equal(view.nodes.length,100);assert.equal(view.omittedNeighbors,150);assert.equal(searchGraph(index,'f249.ts').total,1);
});
