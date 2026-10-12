'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {evaluateOpportunity}=require('../lib/sales-advisory');
const O='22222222-2222-4222-8222-222222222222',A='33333333-3333-4333-8333-333333333333';
const base=()=>({opportunityId:O,recordVersion:2,asOf:'2026-10-12T09:00:00.000Z',closeDate:null,dataQuality:{completeness:'partial',activitiesComplete:false},activities:[]});
const opts={validateEnvelope:()=>true,now:'2026-10-12T12:00:00Z'};
test('missing evidence does not produce invented advice',()=>{
 const r=evaluateOpportunity(base(),opts);assert.equal(r.recommendations.length,0);assert.equal(r.status,'partial');assert.equal(r.actionsExecuted,0);
});
test('overdue open Nexus task is recommended with evidence, closed task ignored',()=>{
 const e=base();e.activities=[{source:'tasks',id:A,version:3,status:'doing',dueAt:'2026-10-10T09:00:00Z'},{source:'tasks',id:O,version:1,status:'done',dueAt:'2026-10-01T09:00:00Z'}];
 const before=structuredClone(e),r=evaluateOpportunity(e,opts);
 assert.equal(r.recommendations.length,1);assert.equal(r.recommendations[0].kind,'review_overdue_task');
 assert.deepEqual(r.recommendations[0].evidence,[{source:'tasks',id:A,version:3}]);assert.deepEqual(e,before);
});
test('older recorded interaction suggests review, never sends email',()=>{
 const e=base();e.activities=[{source:'interactions',id:A,version:1,occurredAt:'2026-09-01T10:00:00Z'}];
 const r=evaluateOpportunity(e,opts);assert.equal(r.recommendations[0].kind,'review_follow_up');assert.equal(r.actionsExecuted,0);
});
test('future interaction does not produce stale-contact advice',()=>{
 const e=base();e.activities=[{source:'interactions',id:A,version:1,occurredAt:'2026-10-15T10:00:00Z'}];
 assert.equal(evaluateOpportunity(e,opts).recommendations.length,0);
});
test('past close date suggests human review without assuming stage',()=>{
 const e=base();e.closeDate='2026-10-11';assert.equal(evaluateOpportunity(e,opts).recommendations[0].kind,'review_close_date');
});
test('invalid envelope and clock fail closed',()=>{
 assert.throws(()=>evaluateOpportunity(base(),{...opts,validateEnvelope:()=>false}),TypeError);
 assert.throws(()=>evaluateOpportunity(base(),{...opts,now:'invalid'}),TypeError);
 assert.throws(()=>evaluateOpportunity(base(),{now:opts.now}),TypeError);
});
