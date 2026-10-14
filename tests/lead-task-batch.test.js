'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),guard=require('../sales/lead-task-guard'),fs=require('node:fs'),vm=require('node:vm');
const company='11111111-1111-4111-8111-111111111111';
const titles=['Primo contatto · Alfa','Follow-up 1 · Alfa','Follow-up 2 · Alfa'];
test('batch task preflight finds only exact company/title matches, across pages',async()=>{
 const other={company_id:'other',title:titles[0]},match={company_id:company,title:titles[1]};
 const calls=[],found=await guard.findExistingMany({companyId:company,titles,fetchPage:async offset=>{calls.push(offset);return offset===0?Array(100).fill(other):[match]}});
 assert.deepEqual(calls,[0,100]);assert.equal(found.get(titles[1]),match);
 assert.equal(found.has(titles[0]),false);
});
test('malformed or unbounded task lists block creating CRM sequence',async()=>{
 await assert.rejects(()=>guard.findExistingMany({companyId:company,titles,fetchPage:async()=>({rows:[]})}),/non valida/);
 await assert.rejects(()=>guard.findExistingMany({companyId:company,titles,fetchPage:async()=>Array(100).fill({company_id:'other',title:'x'})}),/1.000/);
 await assert.rejects(()=>guard.findExistingMany({companyId:company,titles:[titles[0],titles[0]],fetchPage:async()=>[]}),/non valida/);
});
test('three-stage manual CRM task action is wired with explicit confirmation and no mail send',()=>{
 const js=fs.readFileSync('sales/lead-outreach.js','utf8'),html=fs.readFileSync('lead-intelligence.html','utf8');
 assert.ok(html.includes('id="out-task-all"'));
 assert.match(js,/RadixLeadTaskGuard\.findExistingMany/);assert.match(js,/window\.confirm/);
 assert.match(js,/taskGroups\.add/);assert.ok(!js.includes('/api/send-email'));
 assert.doesNotThrow(()=>new vm.Script(js));
});
