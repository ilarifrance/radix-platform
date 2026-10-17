'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const pm=require('../lib/pm-demo.js'),views=require('../lib/pm-views.js');
const now=Date.parse('2026-10-17T10:00:00Z');
function plan(){const s=pm.seed();// t1 done 10-12, t2 In revisione 10-15 (late), t3 10-19 dep t2, t4 10-22 dep t3
 s.tasks.find(t=>t.id==='t3').start='2026-10-16';return s}

test('late open tasks move to today and dependents keep their distance',()=>{
 const s=plan(),rp=views.replan(pm.filter(s,{project:'p1'}),now);
 assert.deepEqual(rp.map(c=>[c.id,c.from,c.due,c.start,c.late]),[['t2','2026-10-15','2026-10-17','',true],['t3','2026-10-19','2026-10-21','2026-10-18',false],['t4','2026-10-22','2026-10-24','',false]]);
});
test('completed tasks, PED contents and on-time plans do not move',()=>{
 const s=plan();s.tasks.find(t=>t.id==='t2').pedContentId='c1';
 assert.deepEqual(views.replan(s.tasks,now),[]);
 assert.deepEqual(views.replan(plan().tasks,Date.parse('2026-10-14T10:00:00Z')),[]);
});
test('a dependent with slack is not pushed beyond its own date',()=>{
 const s=plan(),t3=s.tasks.find(t=>t.id==='t3');t3.due='2026-10-25';t3.start='';s.tasks.find(t=>t.id==='t4').due='2026-10-30';
 // t2 moves +2 days; t3 keeps its 10-day gap → 10-27; t4 keeps 5 days → 11-01
 assert.deepEqual(views.replan(s.tasks,now).map(c=>[c.id,c.due]),[['t2','2026-10-17'],['t3','2026-10-27'],['t4','2026-11-01']]);
});
test('reschedule changes dates only, records history and survives validation',()=>{
 const s=plan(),rp=views.replan(s.tasks,now),t2=s.tasks.find(t=>t.id==='t2'),status=t2.status;
 pm.reschedule(s,rp);
 assert.equal(t2.due,'2026-10-17');assert.equal(t2.status,status);assert.match(t2.history.at(-1),/Ripianificata: scadenza 2026-10-15 → 2026-10-17/);
 assert.equal(s.tasks.find(t=>t.id==='t3').start,'2026-10-18');
 assert.doesNotThrow(()=>pm.validateState(s));
 assert.deepEqual(views.replan(s.tasks,now),[]);
});
test('reschedule rejects completed tasks and bad dates without applying anything',()=>{
 const s=plan();
 assert.throws(()=>pm.reschedule(s,[{id:'t3',due:'2026-10-30'},{id:'t1',due:'2026-10-30'}]),/completata/);
 assert.equal(s.tasks.find(t=>t.id==='t3').due,'2026-10-19');
 assert.throws(()=>pm.reschedule(s,[{id:'t3',due:'2026-10-10'}]),/iniziale/);
 assert.throws(()=>pm.reschedule(s,[]),/Nessuna/);
});
