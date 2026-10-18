'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const A=require('../sales/crm-automations-core.js');
const now=Date.parse('2026-10-16T10:00:00Z');
const ids=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');

test('close-overdue proposes one task per open deal past its close date, once',()=>{
 const data={opportunities:[{id:ids(1),title:'Acme',expected_close:'2026-10-10',outcome:'open',owner_id:ids(9)},{id:ids(2),title:'Beta',expected_close:'2026-11-10'},{id:ids(3),title:'Vinta',expected_close:'2026-10-01',outcome:'won'}],tasks:[]};
 const p=A.plan('close-overdue',data,{now});assert.equal(p.items.length,1);
 const t=p.items[0].task;assert.equal(t.title,'[Auto · Chiusura scaduta] Aggiorna la chiusura: Acme');assert.equal(t.assignee_id,ids(9));assert.equal(t.priority,'high');assert.equal(t.due_at,'2026-10-17T09:00:00Z');
 data.tasks.push({...t,status:'todo'});assert.equal(A.plan('close-overdue',data,{now}).items.length,0);
});

test('won-onboarding fires once per recently won deal, even after the task is done',()=>{
 const data={opportunities:[{id:ids(1),title:'Acme',outcome:'won',closed_at:'2026-10-14T10:00:00Z'},{id:ids(2),title:'Vecchia',outcome:'won',closed_at:'2026-08-01T10:00:00Z'}],tasks:[]};
 const p=A.plan('won-onboarding',data,{now});assert.deepEqual(p.items.map(x=>x.record.id),[ids(1)]);
 data.tasks.push({...p.items[0].task,status:'done'});assert.equal(A.plan('won-onboarding',data,{now}).items.length,0);
});

test('ticket-stalled covers unassigned or late open tickets',()=>{
 const data={tickets:[{id:ids(1),title:'Login',status:'open'},{id:ids(2),title:'Fattura',status:'pending',assignee_id:ids(9),due_at:'2026-10-15T09:00:00Z'},{id:ids(3),title:'Ok',status:'open',assignee_id:ids(9)},{id:ids(4),title:'Chiuso',status:'resolved'}],tasks:[]};
 const p=A.plan('ticket-stalled',data,{now});assert.deepEqual(p.items.map(x=>x.record.id),[ids(1),ids(2)]);
 assert.match(p.items[1].task.title,/Ticket scaduto: Fattura #00000000-0000-4000-8000-000000000002$/);
 data.tasks.push({...p.items[0].task,status:'todo'});assert.equal(A.plan('ticket-stalled',data,{now}).items.length,1);
});

test('stale-deal flags open deals with no recent touch and no open task',()=>{
 const old='2026-09-01T10:00:00Z';
 const data={opportunities:[{id:ids(1),title:'Ferma',created_at:old,contact_id:ids(7),owner_id:ids(9)},{id:ids(2),title:'Toccata',created_at:old,contact_id:ids(8)},{id:ids(3),title:'Nuova',created_at:'2026-10-10T10:00:00Z'},{id:ids(4),title:'Con attività',created_at:old},{id:ids(5),title:'Mai sentita',created_at:old,outcome:'open'},{id:ids(6),title:'Persa',created_at:old,outcome:'lost'}],
  interactions:[{contact_id:ids(7),occurred_at:'2026-09-20T10:00:00Z'},{opportunity_id:ids(2),occurred_at:'2026-10-12T10:00:00Z'}],
  tasks:[{opportunity_id:ids(4),title:'Chiama',status:'todo'}]};
 const p=A.plan('stale-deal',data,{now});assert.deepEqual(p.items.map(x=>x.record.id),[ids(1),ids(5)]);
 assert.equal(p.items[0].task.title,'[Auto · Trattativa ferma] Riprendi il contatto: Ferma (ultimo contatto 26 giorni fa)');assert.equal(p.items[0].task.assignee_id,ids(9));
 assert.match(p.items[1].task.title,/nessun contatto registrato\)$/);
 data.tasks.push({...p.items[0].task,status:'todo'});assert.equal(A.plan('stale-deal',data,{now}).items.length,1);
});

test('hot-contact needs a scorer and skips contacts already in play',()=>{
 const data={contacts:[{id:ids(1),name:'Anna'},{id:ids(2),name:'Bruno'},{id:ids(3),name:'Carla'}],opportunities:[{id:ids(5),contact_id:ids(2),outcome:'open'}],tasks:[]};
 assert.equal(A.plan('hot-contact',data,{now}).items.length,0);
 const score=c=>({band:c.name==='Carla'?'freddo':'caldo'});
 assert.deepEqual(A.plan('hot-contact',data,{now,score}).items.map(x=>x.record.name),['Anna']);
 assert.throws(()=>A.plan('nope',data,{now}),/sconosciuta/);
});
