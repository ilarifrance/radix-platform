'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const E=require('../editorial-core.js');
const {journey,STEPS}=require('../lib/project-journey.js');
const step=(j,id)=>j.steps.find(s=>s.id===id);
const fullBrief=()=>Object.fromEntries(E.fields.map(k=>[k,'x']));

test('empty project: every step to do, next is the brief',()=>{
 const j=journey({});
 assert.deepEqual(j.steps.map(s=>s.id),STEPS.map(s=>s.id));
 assert.ok(j.steps.every(s=>s.state==='todo'));
 assert.equal(j.next,'brief');assert.equal(j.progress,0);assert.equal(j.total,4);
});

test('brief: missing fields, waiting for approval, approved',()=>{
 const e=E.create({id:'p1',summary:'Obiettivo'});
 assert.equal(step(journey({editorial:e}),'brief').state,'active');
 e.brief=fullBrief();
 const j=journey({editorial:e});
 assert.equal(step(j,'brief').state,'waiting');assert.deepEqual(j.waiting,['brief']);
 E.approveBrief(e);
 assert.equal(step(journey({editorial:e}),'brief').state,'done');
 // A stale approval (strategy revised afterwards) is not done.
 e.strategyRevision=(e.strategyRevision||0)+1;
 assert.notEqual(step(journey({editorial:e}),'brief').state,'done');
});

test('ped: contents in review wait, an approved plan is done',()=>{
 const e=E.create({id:'p1'});e.brief=fullBrief();E.approveBrief(e);
 E.updateContent(e,{id:'c1',title:'Post',channel:'LinkedIn',date:'2026-10-20',copy:'Testo'});
 assert.equal(step(journey({editorial:e}),'ped').state,'active');
 E.review(e,'c1','request');
 assert.equal(step(journey({editorial:e}),'ped').state,'waiting');
 E.review(e,'c1','approve');E.approvePlan(e);
 const s=step(journey({editorial:e}),'ped');
 assert.equal(s.state,'done');assert.equal(s.total,1);assert.equal(s.done,1);
 // Editing a content after approval reopens the plan.
 E.updateContent(e,{id:'c1',title:'Post 2',channel:'LinkedIn',date:'2026-10-20',copy:'Testo'});
 assert.notEqual(step(journey({editorial:e}),'ped').state,'done');
});

test('agency tasks: drafts wait for approval, all approved is done',()=>{
 const w=st=>({tasks:st.map((status,i)=>({id:'a'+i,status}))});
 assert.equal(step(journey({'agency-workspace':w(['proposed','running'])}),'tasks').state,'active');
 const j=journey({'agency-workspace':w(['done','approved'])});
 assert.equal(step(j,'tasks').state,'waiting');assert.match(step(j,'tasks').detail,/1 bozza/);
 assert.equal(step(journey({'agency-workspace':w(['approved','approved'])}),'tasks').state,'done');
});

test('pm: synthetic demo tasks are ignored; review waits; all completed is done',()=>{
 const p={projects:[{id:'d',synthetic:true},{id:'r'}],tasks:[{project:'d',status:'In corso'},{project:'r',status:'Da fare'}]};
 const s=step(journey({pm:p}),'pm');assert.equal(s.state,'todo');assert.equal(s.total,1);
 p.tasks[1].status='In revisione';assert.equal(step(journey({pm:p}),'pm').state,'waiting');
 p.tasks[1].status='Completato';assert.equal(step(journey({pm:p}),'pm').state,'done');
});

test('agents are used or not, never block progress; next skips done steps',()=>{
 const e=E.create({id:'p1'});e.brief=fullBrief();E.approveBrief(e);
 const j=journey({editorial:e,agents:{conversations:{copywriter:[{},{}],seo:[]}}});
 assert.equal(step(j,'agents').state,'active');assert.match(step(j,'agents').detail,/1 agente coinvolto · 2 messaggi/);
 assert.equal(j.done,1);assert.equal(j.progress,25);assert.equal(j.next,'ped');
});

test('malformed documents do not throw',()=>{
 const j=journey({editorial:{contents:'x',strategyApproval:5},pm:{tasks:[null,1]},'agency-workspace':{tasks:{}},agents:{conversations:[]}});
 assert.equal(j.steps.length,5);
});
