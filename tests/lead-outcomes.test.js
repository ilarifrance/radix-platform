'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=require('../sales/lead-outcomes-core.js');
const script=fs.readFileSync('sales/lead-outcomes.js','utf8');
const html=fs.readFileSync('lead-intelligence.html','utf8');
test('manual funnel counts only declared events, never infers prior stages',()=>{
 const data=[{index:0,stage:'contacted'},{index:0,stage:'replied'},{index:1,stage:'meeting'},{index:2,stage:'won'},{index:3,stage:'lost'}];
 assert.deepEqual(core.summarize(data),{contacted:1,replied:1,meeting:1,won:1,lost:1});
 assert.deepEqual(core.summarize([{index:1,stage:'invalid'},null]),{contacted:0,replied:0,meeting:0,won:0,lost:0});
 assert.deepEqual(core.summarize([{index:0,stage:'contacted'},{index:0,stage:'lost'}]),{contacted:1,replied:0,meeting:0,won:0,lost:1});
 assert.deepEqual(core.summarize([{index:0,stage:'won'}]),{contacted:0,replied:0,meeting:0,won:1,lost:0});
});
test('outcome interface gates manual events and makes no external requests',()=>{
 assert.doesNotThrow(()=>new vm.Script(script));
 for(const id of ['outcome-prospect','outcome-stage','outcome-record','outcome-export','outcome-history','outcome-won'])assert.ok(html.includes('id="'+id+'"'));
 assert.match(script,/radixLeadWorkflow\?\.approvalFor/);
 assert.match(script,/window\.confirm/);
 assert.match(script,/radix:lead-approval-changed/);
 assert.ok(!/localStorage|sessionStorage|fetch\(/.test(script));
});
