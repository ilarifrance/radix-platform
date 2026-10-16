'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {SEQUENCES,planSequence,planCampaign,fill}=require('../sales/crm-campaigns');
const now=Date.parse('2026-10-16T22:00:00Z');
test('a sequence becomes one dated task per step, skipping contacts already in it and email steps without consent',()=>{
 const seq=SEQUENCES.find(s=>s.id==='nuovo');
 const contacts=[{id:'a',name:'Anna Rossi',company_id:'c1',marketing_consent:true},{id:'b',name:'Bruno Neri',marketing_consent:false},{id:'c',name:'Carla Bo',marketing_consent:true}];
 const open=[{title:'['+seq.name+'] Telefonata: x · Carla Bo',contact_id:'c',status:'todo'}];
 const {tasks,skipped}=planSequence(seq,contacts,open,{now,consentOnly:true,assignee:3});
 assert.deepEqual(skipped,{already:1,consent:2});
 assert.deepEqual(tasks.map(t=>[t.contact_id,t.due_at]),[['a','2026-10-17T09:00:00Z'],['a','2026-10-20T09:00:00Z'],['a','2026-10-24T09:00:00Z'],['b','2026-10-20T09:00:00Z']]);
 assert.match(tasks[0].title,/^\[Nuovo contatto · 3 tocchi\] Email: Email di primo contatto · Anna Rossi$/);
 assert.equal(tasks[0].company_id,'c1');assert.equal(tasks[3].company_id,null);assert.equal(tasks[0].assignee_id,3);
 assert.equal(planSequence(seq,contacts,[],{now,consentOnly:false}).tasks.length,9);
});
test('a campaign prepares one personalised email per contact with consent and a valid address',()=>{
 const {emails,skipped}=planCampaign('{nome}, una proposta per {azienda}','Gentile {nome_completo} ({ruolo})',[{id:'a',name:'Anna Rossi',email:'anna@x.it',company:'Acme',role:'CMO',marketing_consent:true},{id:'b',name:'B',email:'b@x.it',marketing_consent:false},{id:'c',name:'C',email:'non-valida',marketing_consent:true}]);
 assert.deepEqual(skipped,{consent:1,email:1});
 assert.deepEqual(emails.map(e=>[e.to,e.subject,e.body]),[['anna@x.it','Anna, una proposta per Acme','Gentile Anna Rossi (CMO)']]);
 assert.equal(fill('{azienda}',{}),'');
});
test('the CRM page loads campaigns before the tools and sends one email at a time with confirm',()=>{
 const html=fs.readFileSync(__dirname+'/../radix-sales.html','utf8');assert.ok(html.indexOf('crm-campaigns.js')<html.indexOf('crm-tools.js'));
 const src=fs.readFileSync(__dirname+'/../sales/crm-campaigns.js','utf8');
 assert.match(src,/window\.confirm\('Inviare ora a '/);assert.match(src,/confirm:true/);assert.doesNotMatch(src,/for\s*\([^)]*emails[^)]*\)\s*\{?\s*await fetch/);
});
