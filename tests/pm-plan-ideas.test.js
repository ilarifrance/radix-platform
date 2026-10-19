'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const I=require('../lib/pm-plan-ideas.js');
const pm=require('../lib/pm-demo.js');
const reply=JSON.stringify({plans:[
 {name:'Rapido',approach:'Due fasi in parallelo',phases:[{name:'Contenuti',tasks:[{n:1,title:'Scrivere i testi',owner:'Copywriter',days:3,after:[],agent:'copywriter'},{n:2,title:'Rivedere i testi',owner:'Responsabile',days:1,after:[1,9]}]},{name:'Contenuti',tasks:[{n:3,title:'Pubblicare il sito',owner:'Sviluppo',days:2,after:[2],milestone:true}]}]},
 {name:'Equilibrato',phases:[{name:'A',tasks:[{n:1,title:'Uno',days:500,after:[1]}]}]},
 {name:'Vuoto',phases:[]}]});

test('prompt carries the answers and asks for three plans as JSON',()=>{
 const p=I.prompt({name:'Sito',goal:'nuovo sito',start:'2026-10-19',deadline:'2026-11-30',team:'Team con agenti AI',notes:'blog incluso'});
 for(const s of ['Sito','nuovo sito','2026-11-30','blog incluso','"Rapido"','"Prudente"','agent','{"plans"'])assert.ok(p.includes(s),s);
 assert.ok(!I.prompt({name:'x',goal:'y',start:'2026-10-19',team:'Solo io'}).includes('Dove un agente AI'));
});
test('parse keeps valid plans, renumbers tasks, drops unknown or forward dependencies and dedupes phase names',()=>{
 const plans=I.parse('Ecco:\n'+reply);
 assert.equal(plans.length,2);
 const [a,b]=plans;
 assert.deepEqual(a.phases.map(p=>p.name),['Contenuti','Contenuti (2)']);
 assert.deepEqual(a.phases[0].tasks[1].after,[1]);
 assert.equal(a.phases[0].tasks[0].agent,'copywriter');assert.equal(a.phases[1].tasks[0].milestone,true);
 assert.equal(b.phases[0].tasks[0].days,120);assert.deepEqual(b.phases[0].tasks[0].after,[]);assert.equal(b.phases[0].tasks[0].owner,'Da assegnare');
 assert.deepEqual(I.parse('niente'),[]);
});
test('schedule uses working days and starts each task after its dependencies',()=>{
 assert.equal(I.addWork('2026-10-16',1),'2026-10-16');// Friday
 assert.equal(I.addWork('2026-10-17',1),'2026-10-19');// Saturday → Monday
 assert.equal(I.addWork('2026-10-16',3),'2026-10-20');
 const sc=I.schedule(I.parse(reply)[0],'2026-10-19');
 assert.deepEqual(sc.tasks.map(t=>[t.start,t.due]),[['2026-10-19','2026-10-21'],['2026-10-22','2026-10-22'],['2026-10-23','2026-10-26']]);
 assert.equal(sc.end,'2026-10-26');
});
test('buildState makes a valid PM plan with sub-projects, dependencies and milestones',()=>{
 const s=I.buildState(pm,I.parse(reply)[0],{name:'Sito',start:'2026-10-19'});
 assert.equal(s.projects.length,1);assert.deepEqual(s.projects[0].subprojects.map(x=>x.name),['Contenuti','Contenuti (2)']);
 assert.equal(s.tasks.length,3);assert.deepEqual(s.tasks[1].dependencies,[s.tasks[0].id]);
 assert.deepEqual(s.tasks[0].assignedAgents,['copywriter']);assert.equal(s.tasks[2].milestone,true);assert.equal(s.tasks[2].approvalRequired,true);
 assert.match(s.projects[0].note,/Rapido/);
});
