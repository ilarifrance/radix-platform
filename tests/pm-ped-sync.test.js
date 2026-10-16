'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const v=require('../lib/pm-views'),pm=require('../lib/pm-demo');
const base=()=>({projects:[{id:'p1',name:'Campagna',note:'',synthetic:true,subprojects:[{id:'p1s1',name:'Generale'}]}],tasks:[],nextId:1});
const C=(id,o)=>({id,title:'Post '+id,channel:'Instagram',date:'2026-11-10',time:'09:30',copy:'x',status:'draft',revision:1,...o});

test('PED contents become production tasks in «Contenuti PED», due the day before publication',()=>{
 const s=base();const r=v.syncFromPed(pm,s,{contents:[C('c1'),C('c2',{date:''}),C('c3',{status:'review',channel:'LinkedIn'})]});
 assert.equal(r.created.length,2);const sub=s.projects[0].subprojects.find(x=>x.name==='Contenuti PED');assert.ok(sub);
 const t1=s.tasks.find(t=>t.pedContentId==='c1');assert.equal(t1.title,'Instagram · Post c1');assert.equal(t1.due,'2026-11-09');assert.equal(t1.start,'2026-11-06');assert.equal(t1.subproject,sub.id);assert.equal(t1.status,'Da fare');
 assert.equal(s.tasks.find(t=>t.pedContentId==='c3').status,'In revisione');
 assert.deepEqual(v.syncFromPed(pm,s,{contents:[C('c1'),C('c3',{status:'review',channel:'LinkedIn'})]}),{created:[],updated:[],completed:[]});
});

test('approval completes the task, a later edit reopens it with the new date',()=>{
 const s=base();v.syncFromPed(pm,s,{contents:[C('c1')]});
 const r=v.syncFromPed(pm,s,{contents:[C('c1',{status:'approved'})]});const t=s.tasks[0];
 assert.deepEqual(r.completed,[t.id]);assert.equal(t.status,'Completato');
 const r2=v.syncFromPed(pm,s,{contents:[C('c1',{status:'draft',revision:2,date:'2026-11-20',title:'Nuovo'})]});
 assert.deepEqual(r2.updated,[t.id]);assert.equal(t.status,'Da fare');assert.equal(t.due,'2026-11-19');assert.equal(t.title,'Instagram · Nuovo');assert.equal(t.pedRevision,2);
});

test('sync links survive validateState so later syncs find the same task',()=>{
 const s=base();v.syncFromPed(pm,s,{contents:[C('c1')]});s.tasks[0].agencyTaskId='step-1';
 const back=pm.validateState(JSON.parse(JSON.stringify(s)));
 assert.equal(back.tasks[0].pedContentId,'c1');assert.equal(back.tasks[0].pedRevision,1);assert.equal(back.tasks[0].agencyTaskId,'step-1');
 assert.equal(v.syncFromPed(pm,back,{contents:[C('c1')]}).created.length,0);
});

test('PM work never goes backwards because of the PED',()=>{
 const s=base();v.syncFromPed(pm,s,{contents:[C('c1')]});pm.changeStatus(s,s.tasks[0].id,'In corso');
 v.syncFromPed(pm,s,{contents:[C('c1')]});assert.equal(s.tasks[0].status,'In corso');
});

test('incarichi added to the Agency plan later get their PM task, after their dependencies',()=>{
 const s=base();const t1=pm.create(s,{title:'Copywriter — testi',owner:'Copywriter',start:'',due:'2026-10-20',project:'p1',subproject:'p1s1',approvalRequired:true});t1.agencyTaskId='step-1';
 const agency={roles:{copywriter:'Copywriter','seo-specialist':'SEO'},tasks:[{id:'step-1',role:'copywriter',instruction:'testi',dependsOn:[]},{id:'step-2',role:'seo-specialist',instruction:'Analizza le keyword',dependsOn:['step-1']}]};
 const added=v.addFromAgency(pm,s,agency,'2026-10-16');assert.equal(added.length,1);
 const t2=s.tasks.find(t=>t.agencyTaskId==='step-2');assert.equal(t2.title,'SEO — Analizza le keyword');assert.equal(t2.due,'2026-10-27');assert.deepEqual(t2.dependencies,[t1.id]);assert.equal(t2.approvalRequired,true);
 assert.equal(v.addFromAgency(pm,s,agency,'2026-10-16').length,0);
 assert.equal(v.addFromAgency(pm,base(),agency,'2026-10-16').length,0,'hand-made plans are not touched');
});
