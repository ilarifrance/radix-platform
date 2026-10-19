'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {evaluatePriority}=require('../api/_sales_priority');
const {validateEnvelope}=require('../api/_sales_intelligence');
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'];
function envelope(activities=[]){return {contractVersion:'1.0.0',organizationId:ids[0],clientId:null,contactId:null,opportunityId:ids[1],recordVersion:1,asOf:'2026-10-12T12:00:00Z',stage:{processId:ids[2],id:ids[3]},amount:1200000,amountUnit:'minor',currency:null,probability:null,closeDate:null,ownerId:null,activities,nextAction:null,dataQuality:{completeness:'partial',activitiesComplete:false,missingFields:['clientId','contactId','currency','probability','closeDate','ownerId','nextAction'],issues:['currency_not_modeled','probability_not_modeled','next_action_not_modeled','offset_pagination_not_snapshot']}};}
const task=(x={})=>({source:'tasks',id:ids[0],version:1,type:'task',title:'Call client',status:'todo',assigneeId:2,priority:'normal',dueAt:'2026-10-11T12:00:00Z',...x});
test('valid CRM envelope',()=>assert.equal(validateEnvelope(envelope()),true));
test('overdue task triggers review not automatic write',()=>{const r=evaluatePriority(envelope([task()]));assert.equal(r.attentionScore,25);assert.equal(r.alerts[0].code,'overdue_tasks');assert.equal(r.nextBestAction.taskId,ids[0]);assert.equal(r.automatedActionsTaken,false)});
test('done tasks do not trigger alerts',()=>{const r=evaluatePriority(envelope([task({status:'done'})]));assert.equal(r.attentionScore,0);assert.equal(r.nextBestAction,null)});
test('incomplete snapshots are explicitly uncertain',()=>{const r=evaluatePriority(envelope());assert.equal(r.alerts.length,0);assert.equal(r.dataLimitations.activitiesComplete,false);assert.match(r.dataLimitations.warning,/Partial/)});
test('invalid envelopes fail closed',()=>assert.throws(()=>evaluatePriority({...envelope(),amount:-1}),TypeError));
test('old interaction triggers relationship review',()=>{const r=evaluatePriority(envelope([{source:'interactions',id:ids[0],version:1,type:'call',title:'Intro call',occurredAt:'2026-08-01T12:00:00Z'}]));assert.equal(r.nextBestAction.kind,'review_relationship');assert.ok(r.alerts.some(a=>a.code==='stale_interaction'))});
