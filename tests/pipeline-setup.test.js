'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const S=require('../sales/pipeline-setup-core.js');
const cur=[{id:'a',title:'Nuovo',position:0,probability:10},{id:'b',title:'Proposta',position:1,probability:null},{id:'c',title:'Vinto',position:2,probability:null}];
// Replays the steps on the positions, checking the UNIQUE(process_id,position) rule after every step.
function replay(current,steps){const pos=new Map(current.map(s=>[s.id,s.position]));let n=0;
 for(const st of steps){if(st.op==='delete')pos.delete(st.id);else if(st.op==='update'){if(st.data.position!=null)pos.set(st.id,st.data.position)}else pos.set('new'+(n++),st.data.position);
  const v=[...pos.values()];assert.equal(new Set(v).size,v.length,'duplicate position after '+JSON.stringify(st));assert.ok(v.every(p=>p>=0&&p<=10000))}
 return pos}
test('rename and probability only: one update per changed column, no position moves',()=>{
 const p=S.plan(cur,[{id:'a',title:'Primo contatto',probability:'10'},{id:'b',title:'Proposta',probability:'50'},{id:'c',title:'Vinto',probability:''}],[]);
 assert.deepEqual(p.steps,[{op:'update',id:'a',data:{title:'Primo contatto'}},{op:'update',id:'b',data:{probability:50}}]);
});
test('reorder parks the moving columns first, so positions never collide',()=>{
 const p=S.plan(cur,[{id:'c',title:'Vinto'},{id:'a',title:'Nuovo',probability:'10'},{id:'b',title:'Proposta'}],[]);
 const pos=replay(cur,p.steps);assert.deepEqual(Object.fromEntries(pos),{c:0,a:1,b:2});
 assert.ok(p.steps.some(s=>s.data.position>=S.PARK));
});
test('add and remove columns: deletes first, new columns at their place',()=>{
 const p=S.plan(cur,[{id:'a',title:'Nuovo',probability:'10'},{title:'Demo',probability:'30'},{id:'c',title:'Vinto'},{title:'Contratto'}],[]);
 assert.deepEqual(p.steps[0],{op:'delete',id:'b'});
 assert.deepEqual(p.steps.filter(s=>s.op==='create'),[{op:'create',data:{title:'Demo',position:1,probability:30}},{op:'create',data:{title:'Contratto',position:3}}]);
 assert.deepEqual([...replay(cur,p.steps).values()].sort(),[0,1,2,3]);
});
test('refused: removing a column with opportunities, empty or duplicate names, bad probability, no columns',()=>{
 assert.match(S.plan(cur,[{id:'a',title:'Nuovo'},{id:'c',title:'Vinto'}],[{stage_id:'b'},{stage_id:'b'}]).error,/«Proposta» contiene 2 opportunità/);
 assert.match(S.plan(cur,[{id:'a',title:' '}],[]).error,/non ha un nome/);
 assert.match(S.plan(cur,[{title:'X'},{title:'x '}],[]).error,/Due colonne/);
 assert.match(S.plan(cur,[{title:'X',probability:'120'}],[]).error,/Probabilità/);
 assert.match(S.plan(cur,[],[]).error,/almeno una colonna/);
 assert.match(S.plan(cur,[{id:'zzz',title:'X'}],[]).error,/Aggiorna/);
});
test('pipeline names: required and unique among sales pipelines',()=>{
 const ps=[{id:'p1',title:'Vendita',kind:'opportunity'},{id:'p2',title:'Onboarding',kind:'task'}];
 assert.match(S.pipelineName('vendita ',ps,null).error,/Esiste già/);assert.deepEqual(S.pipelineName('Vendita',ps,'p1'),{title:'Vendita'});
 assert.deepEqual(S.pipelineName('Onboarding',ps,null),{title:'Onboarding'});assert.match(S.pipelineName('',ps).error,/nome/);
});
test('Pipeline page: «Personalizza pipeline» for owner/admin, pipeline choice in the quick dialog, task processes excluded',()=>{
 const html=fs.readFileSync('sales-pipeline-premium.html','utf8'),js=fs.readFileSync('sales/pipeline-premium.js','utf8');
 assert.ok(html.indexOf('pipeline-setup-core.js')<html.indexOf('pipeline-premium.js'));
 assert.match(html,/id="setup-pipeline"/);assert.match(html,/<dialog id="setup"/);assert.match(html,/name="process_id"/);
 assert.match(js,/\['owner','admin'\]\.includes\(w\.role\)/);assert.match(js,/p\.kind==null\|\|p\.kind==='opportunity'/);
});
