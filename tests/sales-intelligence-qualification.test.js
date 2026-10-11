'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {qualifyLead}=require('../lib/sales-intelligence/qualification.js');
test('qualifies complete high-fit lead without mutating',()=>{
  const lead={fit:9,urgency:8,budget:9,authority:8,engagement:7};
  const before={...lead};
  const result=qualifyLead(lead);
  assert.equal(result.score,82);
  assert.equal(result.qualificationStage,'qualified');
  assert.deepEqual(result.missingFields,[]);
  assert.deepEqual(lead,before);
});
test('zero signals remains prospect',()=>{
  assert.equal(qualifyLead({fit:0,urgency:0,budget:0,authority:0,engagement:0}).qualificationStage,'prospect');
});
test('does not silently score missing or invalid fields as qualified',()=>{
  for (const lead of [{fit:10},{fit:10,urgency:10,budget:10,authority:10,engagement:NaN},null,[],{fit:Infinity}]) {
    const result=qualifyLead(lead);
    assert.equal(result.qualificationStage,'insufficient_data');
    assert.ok(result.missingFields.length>0);
  }
});
test('guards against overflow and out-of-range scores',()=>{
  const result=qualifyLead({fit:999,urgency:10,budget:10,authority:10,engagement:10});
  assert.equal(result.qualificationStage,'insufficient_data');
  assert.ok(result.score<=100);
});
