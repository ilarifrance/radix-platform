'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const js=fs.readFileSync('sales/lead-crm-handoff.js','utf8');
const html=fs.readFileSync('lead-intelligence.html','utf8');
test('CRM handoff safely parses with manual stages',()=>{
 assert.doesNotThrow(()=>new vm.Script(js));for(const id of ['sync-create-contact','sync-create-lead','sync-linked'])assert.ok(html.includes('id="'+id+'"'));
});
test('CRM link checks authorized workspace, duplicate names and explicit confirmations',()=>{
 assert.match(js,/approval\(i\)/);assert.match(js,/search\('companies',name\)/);assert.match(js,/readAllLeads\(\)/);
 assert.match(js,/window\.confirm/);assert.match(js,/state\.attempted\.add/);
 assert.match(js,/entity:'leads'|create\('leads'/);
 assert.ok(!js.includes('localStorage')&&!js.includes('sessionStorage'));assert.ok(!js.includes('send-email'));
});
test('new CRM contact fields conform to current CRM allowlist',()=>{
 const {fields}=require('../api/_sales');
 for(const f of ['name','company_id'])assert.ok(fields.contacts.includes(f));
 for(const f of ['title','company_id','contact_id'])assert.ok(fields.leads.includes(f));
 assert.ok(!fields.contacts.includes('email'));
});
