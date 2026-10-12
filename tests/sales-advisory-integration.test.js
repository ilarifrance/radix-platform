'use strict';
// Cross-module test: actual Nexus projection and validator + Qwen-inspired advisory.
// Offline fixtures only. Does not prove authentication, DB access or Preview E2E.
const test=require('node:test');
const assert=require('node:assert/strict');
const {projectOpportunity,validateEnvelope}=require('../api/_sales_intelligence');
const {evaluateOpportunity}=require('../lib/sales-advisory');
const W='11111111-1111-4111-8111-111111111111';
const O='22222222-2222-4222-8222-222222222222';
const P='33333333-3333-4333-8333-333333333333';
const S='44444444-4444-4444-8444-444444444444';
const T='55555555-5555-4555-8555-555555555555';
const I='66666666-6666-4666-8666-666666666666';
const now='2026-10-12T12:00:00Z';
function rows(){
 return [
  {entity:'opportunities',record:{workspace_id:W,id:O,version:2,company_id:null,contact_id:null,process_id:P,stage_id:S,amount_cents:120000,owner_id:null,expected_close:'2026-10-10'}},
  {entity:'tasks',record:{workspace_id:W,id:T,version:4,opportunity_id:O,company_id:null,contact_id:null,title:'Call buyer',status:'todo',assignee_id:null,priority:'high',due_at:'2026-10-09T08:00:00Z'}},
  {entity:'interactions',record:{workspace_id:W,id:I,version:1,opportunity_id:O,company_id:null,contact_id:null,title:'Meeting',kind:'meeting',occurred_at:'2026-09-20T08:00:00Z',body:'DO NOT EXPORT PRIVATE NOTES'}}
 ];
}
function project(source=rows()){return projectOpportunity({workspace:W,opportunityId:O,rows:source,asOf:'2026-10-12T09:00:00.000Z'});}
test('Nexus projected envelope validates and drives three evidence-backed suggestions',()=>{
 const source=rows(),before=structuredClone(source),envelope=project(source);
 assert.equal(validateEnvelope(envelope),true);
 const output=evaluateOpportunity(envelope,{validateEnvelope,now});
 assert.deepEqual(output.recommendations.map(x=>x.kind),['review_overdue_task','review_follow_up','review_close_date']);
 assert.equal(output.status,'partial');assert.equal(output.actionsExecuted,0);
 assert.equal(output.requiresHumanReview,true);
 assert.ok(output.recommendations.every(x=>x.evidence.every(e=>e.id&&e.version)));
 assert.ok(!JSON.stringify({envelope,output}).includes('DO NOT EXPORT PRIVATE NOTES'));
 assert.deepEqual(source,before);
});
test('missing task and interaction evidence never invents outreach or tasks',()=>{
 const envelope=project(rows().slice(0,1));
 const result=evaluateOpportunity(envelope,{validateEnvelope,now});
 assert.deepEqual(result.recommendations.map(x=>x.kind),['review_close_date']);
 assert.equal(result.status,'partial');
});
test('cross-tenant activity rejected by Nexus projection before advisory',()=>{
 const source=rows();source[1].record.workspace_id='77777777-7777-4777-8777-777777777777';
 assert.throws(()=>project(source),/Sales intelligence input unavailable or invalid/);
});
test('advisory rejects malformed envelope through real Nexus validator',()=>{
 const envelope=project();envelope.amount=NaN;
 assert.throws(()=>evaluateOpportunity(envelope,{validateEnvelope,now}),/Valid Nexus Sales Intelligence envelope required/);
});
