'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {playbookFor,planPlaybook,GENERIC}=require('../sales/crm-playbook-core.js');
const stages=[{id:'s1',title:'Nuovo lead'},{id:'s2',title:'Proposta inviata'},{id:'s3',title:'Negoziazione'},{id:'s4',title:'Fase X'}];
test('playbookFor matches the stage title, else the generic steps',()=>{
  assert.equal(playbookFor(stages[0]).id,'nuovo');assert.equal(playbookFor(stages[1]).id,'proposta');assert.equal(playbookFor(stages[2]).id,'trattativa');
  assert.equal(playbookFor(stages[3]),GENERIC);assert.equal(playbookFor(null),GENERIC);
});
test('planPlaybook creates only the missing steps, dated from today, for the deal owner',()=>{
  const opp={id:'o1',stage_id:'s2',company_id:'c1',contact_id:'p1',owner_id:7};
  const now=Date.parse('2026-10-18T15:00:00Z');
  const first=planPlaybook(opp,stages,[],{now});
  assert.equal(first.create.length,3);assert.equal(first.create[0].title,'[Playbook Proposta] Invia la proposta con prezzo e tempi');
  assert.equal(first.create[0].due_at,'2026-10-18T09:00:00Z');assert.equal(first.create[2].due_at,'2026-10-25T09:00:00Z');
  assert.deepEqual([first.create[0].opportunity_id,first.create[0].company_id,first.create[0].contact_id,first.create[0].assignee_id],['o1','c1','p1',7]);
  const tasks=[{opportunity_id:'o1',title:first.create[0].title,status:'done'},{opportunity_id:'o2',title:first.create[1].title}];
  const again=planPlaybook(opp,stages,tasks,{now});
  assert.equal(again.create.length,2);assert.equal(again.steps[0].done,true);assert.equal(again.steps[1].done,false);
});
test('planPlaybook falls back to the current user when the deal has no owner',()=>{
  const p=planPlaybook({id:'o',stage_id:'s4'},stages,[],{now:0,assignee:3});
  assert.equal(p.playbook,GENERIC);assert.equal(p.create[0].assignee_id,3);
});
