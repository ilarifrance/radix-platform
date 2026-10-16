'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const v=require('../lib/pm-views'),pm=require('../lib/pm-demo');
const now=Date.parse('2026-10-15T10:00:00Z');
const T=(id,o)=>({id,project:'p1',subproject:'p1s1',title:'Task '+id,owner:'Anna',start:'',due:'2026-10-20',details:'',assignedAgents:[],dependencies:[],approvalRequired:false,approved:false,milestone:false,recurrence:'Nessuna',status:'Da fare',documents:[],decisions:[],history:[],...o});

test('kanban groups by status and sorts by due date',()=>{
 const cols=v.kanban([T('a',{due:'2026-10-30'}),T('b',{due:'2026-10-18'}),T('c',{status:'Completato'})]);
 assert.deepEqual(cols.map(c=>c.status),v.STATUSES);assert.deepEqual(cols[0].tasks.map(t=>t.id),['b','a']);assert.equal(cols[3].tasks.length,1);
});

test('gantt places tasks after their dependencies and flags lateness',()=>{
 const g=v.gantt([T('a',{start:'2026-10-01',due:'2026-10-10'}),T('b',{due:'2026-10-25',dependencies:['a']}),T('c',{due:'2026-10-14',status:'Completato'}),T('d',{due:''})],now);
 const by=Object.fromEntries(g.rows.map(r=>[r.id,r]));
 assert.equal(by.d,undefined);assert.equal(v.fromDay(by.b.start),'2026-10-10');assert.equal(by.a.late,true);assert.equal(by.c.late,false);
 assert.ok(g.from<=by.a.start&&g.to>=by.b.end);assert.ok(g.weeks.length>=3);
});

test('workload counts open tasks per owner and agent per week',()=>{
 const w=v.workload([T('a',{due:'2026-10-16',assignedAgents:['copywriter']}),T('b',{due:'2026-10-01'}),T('c',{due:'2026-10-28',owner:'Bruno'}),T('d',{status:'Completato'})],now);
 const anna=w.rows.find(r=>r.owner==='Anna');assert.deepEqual(anna.cells.slice(0,3),[2,0,0]);
 assert.equal(w.rows.find(r=>r.owner==='Agente copywriter').total,1);assert.equal(w.rows.find(r=>r.owner==='Bruno').cells[2],1);
});

test('kpis: on-time rate, late tasks, next milestone',()=>{
 const k=v.kpis([T('a',{due:'2026-10-10',status:'Completato'}),T('b',{due:'2026-10-12'}),T('c',{due:'2026-11-01',milestone:true})],now);
 assert.equal(k.onTime,50);assert.equal(k.late,1);assert.equal(k.nextMilestone.id,'c');
});

test('approved Agency deliverables complete their PM activity in order',()=>{
 const state={projects:[{id:'p1',name:'X',note:'',synthetic:true,subprojects:[{id:'p1s1',name:'Generale'}]}],tasks:[T('t1',{agencyTaskId:'step-1',approvalRequired:true}),T('t2',{agencyTaskId:'step-2',approvalRequired:true,dependencies:['t1']}),T('t3',{agencyTaskId:'step-3',approvalRequired:true})],nextId:4};
 const changed=v.syncFromAgency(pm,state,[{id:'step-1',status:'approved'},{id:'step-2',status:'approved'},{id:'step-3',status:'done'}]);
 assert.deepEqual(changed,['t1','t2']);assert.equal(state.tasks[0].status,'Completato');assert.equal(state.tasks[2].status,'Da fare');
 assert.doesNotThrow(()=>pm.validateState(state));
});

test('PM page offers the four views and syncs from the Agency workspace',()=>{
 const html=fs.readFileSync('radix-pm-concept.html','utf8');
 for(const view of ['list','kanban','gantt','workload'])assert.match(html,new RegExp('data-view="'+view+'"'));
 assert.match(html,/views\.syncFromAgency\(pm,state/);assert.doesNotMatch(fs.readFileSync('lib/pm-demo.js','utf8'),/Cambio stato simulato|Approvazione esplicita simulata/);
});

test('budget compares planned and actual costs with the project budget',()=>{
 const v=require('../lib/pm-views.js');
 const tasks=[{estimate:1000,actual:400},{estimate:500.5},{actual:250.25},{}];
 assert.deepEqual(v.budget(tasks,{budget:2000}),{budget:2000,planned:1500.5,spent:650.25,remaining:1349.75,spentPct:33,plannedPct:75,overPlanned:false,overSpent:false});
 const none=v.budget(tasks,{});assert.equal(none.spentPct,null);assert.equal(none.remaining,null);assert.equal(none.overSpent,false);
 assert.equal(v.budget([{estimate:3000,actual:2100}],{budget:2000}).overSpent,true);
});

test('cost-only edits keep status and approval; other edits still revoke it',()=>{
 const s=pm.validateState({projects:[{id:'p1',name:'P',note:'',synthetic:true,subprojects:[{id:'p1s1',name:'G'}]}],tasks:[],nextId:1});
 const t=pm.create(s,{title:'A',owner:'Anna',due:'2026-10-20',project:'p1',subproject:'p1s1',approvalRequired:true});
 pm.changeStatus(s,t.id,'In corso');pm.changeStatus(s,t.id,'In revisione');pm.approve(s,t.id,true);
 pm.update(s,t.id,{estimate:'800',actual:'120,5'});
 assert.equal(t.status,'In revisione');assert.equal(t.approved,true);assert.equal(t.estimate,800);assert.equal(t.actual,120.5);
 pm.update(s,t.id,{actual:''});assert.equal('actual' in t,false);assert.equal(t.approved,true);
 assert.throws(()=>pm.update(s,t.id,{estimate:'-5'}),/Costo previsto/);
 assert.deepEqual(pm.validateState(JSON.parse(JSON.stringify(s))).tasks[0].estimate,800);
 pm.update(s,t.id,{title:'B'});assert.equal(t.approved,false);assert.equal(t.status,'Da fare');
});
