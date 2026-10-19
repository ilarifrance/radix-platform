'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),core=require('../sales/lead-crm-outcomes-core.js'),fs=require('node:fs'),vm=require('node:vm');
const company='11111111-1111-4111-8111-111111111111',at='2026-10-14T09:00:00.000Z';
const a={key:'li-1728892800000-0-0',type:'event',stage:'replied',at};
const b={key:'li-1728892800001-0-1-void',type:'void',stage:'replied',ref:a.key,at:'2026-10-14T09:05:00.000Z'};
const record=row=>({...core.writeData(row,company),id:'22222222-2222-4222-8222-222222222222'});
test('CRM interaction encoding contains no email and round trips',()=>{
 const r=record(a);assert.equal(r.kind,'note');assert.equal(r.company_id,company);
 assert.deepEqual(core.parse(r,company),{...a,crmId:r.id});
 assert.equal(core.parse(r,'33333333-3333-4333-8333-333333333333'),null);
 assert.ok(!r.body.includes('@'));
});
test('rectification is linked to the original and excludes it from active history',()=>{
 const result=core.timeline([core.parse(record(a),company),core.parse(record(b),company)]);
 assert.equal(result.active.length,0);assert.equal(result.all.length,1);assert.equal(result.corrections.length,1);
});
test('paginated read scoped by company and bounded; malformed fails closed',async()=>{
 let offsets=[];const all=await core.read({companyId:company,fetchPage:async off=>{offsets.push(off);return off===0?Array(100).fill({kind:'call',body:'',company_id:company}):[record(a)]}});
 assert.equal(all.length,1);assert.deepEqual(offsets,[0,100]);
 await assert.rejects(()=>core.read({companyId:company,fetchPage:async()=>({rows:[]})}),/non valida/);
 await assert.rejects(()=>core.read({companyId:company,fetchPage:async()=>Array(100).fill({kind:'note'})}),/1.000/);
});
test('HTML wiring and existing manual outcome module remains read-only',()=>{
 const h=fs.readFileSync('lead-intelligence.html','utf8'),js=fs.readFileSync('sales/lead-crm-outcomes.js','utf8'),base=fs.readFileSync('sales/lead-outcomes.js','utf8');
 for(const id of ['crm-outcome-save','crm-outcome-load','crm-outcome-status','crm-outcome-history'])assert.ok(h.includes('id="'+id+'"'));
 assert.ok(h.indexOf('lead-crm-outcomes-core.js')<h.indexOf('lead-crm-outcomes.js'));
 assert.ok(/radix:lead-outcome-recorded/.test(base)&&/radix:lead-outcome-voided/.test(base));
 assert.ok(!/fetch\(|localStorage|sessionStorage/.test(base));assert.doesNotThrow(()=>new vm.Script(js));
});
