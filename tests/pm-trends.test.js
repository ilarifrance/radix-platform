'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),views=require('../lib/pm-views.js');
const now=Date.parse('2026-10-19T09:00:00Z');
const tasks=[
 {title:'Brief',owner:'Anna',status:'Completato',due:'2026-10-10',completedAt:'2026-10-12T10:00:00Z'},
 {title:'Bozza',owner:'Anna',status:'Da fare',due:'2026-10-15'},
 {title:'Vecchia',owner:'Luca',status:'Completato',due:'2026-10-08'},
 {title:'Lancio',owner:'Luca',status:'In corso',due:'2026-11-02'},
 {title:'Go live',owner:'Luca',status:'Da fare',due:'2026-11-03',milestone:true}];

test('trends: cumulative planned and done per week, none done in future weeks, milestones left out',()=>{
 const t=views.trends(tasks,now,{weeks:3,ahead:2});
 assert.deepEqual(t.weeks.map(w=>w.from),['2026-10-05','2026-10-12','2026-10-19','2026-10-26','2026-11-02']);
 assert.deepEqual(t.weeks.map(w=>w.planned),[2,3,3,3,4]);
 assert.deepEqual(t.weeks.map(w=>w.done),[1,2,2,null,null]);
 assert.equal(t.weeks[2].current,true);assert.equal(t.total,4);
});

test('trends: per person open, late and on-time share, most late first',()=>{
 const p=views.trends(tasks,now).people;
 assert.deepEqual(p.map(r=>r.owner),['Anna','Luca']);
 assert.deepEqual([p[0].open,p[0].late,p[0].done,p[0].onTime],[1,1,1,0]);
 assert.deepEqual([p[1].open,p[1].late,p[1].done,p[1].onTime],[1,0,1,100]);
});
