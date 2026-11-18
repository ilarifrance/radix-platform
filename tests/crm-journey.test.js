'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const core=require('../sales/crm-journey-core.js');
const NOW=Date.parse('2026-11-17T10:00:00Z');
const K1='11111111-1111-4111-8111-111111111111',C1='22222222-2222-4222-8222-222222222222',C2='55555555-5555-4555-8555-555555555555',O1='33333333-3333-4333-8333-333333333333';
const contact={id:C1,name:'Giulia Rossi',company_id:K1};
const call={id:'i1',kind:'call',title:'Prima chiamata',occurred_at:'2026-11-10T09:00:00Z',contact_id:C1,company_id:K1,opportunity_id:null};
const mail={id:'i2',kind:'email',title:'Presentazione',occurred_at:'2026-11-12T09:00:00Z',contact_id:C1,company_id:K1,opportunity_id:null};
const todo={id:'t1',title:'Fissare la demo',status:'todo',due_at:'2026-11-15T09:00:00Z',contact_id:C1,company_id:K1,opportunity_id:null};
const done={id:'t2',title:'Cercare il referente',status:'done',updated_at:'2026-11-09T09:00:00Z',contact_id:C1,company_id:K1,opportunity_id:null};
const other={id:'i9',kind:'call',title:'Altro contatto',occurred_at:'2026-11-11T09:00:00Z',contact_id:C2,company_id:K1};
const R=(...xs)=>xs.map(([entity,record])=>({entity,record}));

test('a contact with no activity is «Da lavorare», and its steps exclude other contacts',()=>{
 const j=core.journey('contacts',C1,R(['contacts',contact],['interactions',other]),NOW);
 assert.equal(j.steps.length,0);assert.equal(core.stage(j).key,'new');
});
test('activities before the opportunity: done ones newest first, open to-dos on top, overdue flagged',()=>{
 const j=core.journey('contacts',C1,R(['contacts',contact],['interactions',call],['interactions',mail],['tasks',todo],['tasks',done],['interactions',other]),NOW);
 assert.deepEqual(j.steps.map(s=>s.id),['t1','i2','i1','t2']);
 assert.equal(j.counts.done,3);assert.equal(j.counts.planned,1);
 assert.equal(j.overdue.length,1);assert.equal(j.steps[0].overdue,true);
 assert.equal(j.daysSinceLast,5);
 // Two real touches (call + email, not the note or the to-do): ready for an opportunity.
 assert.equal(core.stage(j).key,'ready');
});
test('one touch only: «In lavorazione»',()=>{
 const j=core.journey('contacts',C1,R(['contacts',contact],['interactions',call]),NOW);
 assert.equal(core.stage(j).key,'working');
});
test('with an open opportunity the preparatory steps stay on the contact and the opportunity shows them too',()=>{
 const opp={id:O1,title:'Fornitura',contact_id:C1,company_id:K1,outcome:'open',amount_cents:100000,created_at:'2026-11-14T09:00:00Z'};
 const onOpp={id:'i3',kind:'meeting',title:'Demo',occurred_at:'2026-11-16T09:00:00Z',contact_id:C1,company_id:K1,opportunity_id:O1};
 const rows=R(['contacts',contact],['opportunities',opp],['interactions',call],['interactions',mail],['interactions',onOpp]);
 const j=core.journey('contacts',C1,rows,NOW);
 assert.equal(core.stage(j).key,'opportunity');
 assert.deepEqual(j.preparatory.map(s=>s.id),['i2','i1']);assert.deepEqual(j.onOpportunity.map(s=>s.id),['i3']);
 const k=core.journey('opportunities',O1,rows,NOW);
 assert.equal(k.contactId,C1);assert.equal(k.preparatory.length,2);
 const lost=core.journey('contacts',C1,R(['contacts',contact],['opportunities',{...opp,outcome:'lost'}]),NOW);
 assert.equal(core.stage(lost).key,'closed');
});
test('an opportunity without contact has no contact journey',()=>{
 assert.equal(core.journey('opportunities',O1,R(['opportunities',{id:O1,title:'X',contact_id:null}]),NOW),null);
});
test('«Crea opportunità» prefills the contact, its company and a title',()=>{
 assert.deepEqual(core.opportunityDraft(contact,'Rossi Srl'),{contact_id:C1,company_id:K1,title:'Opportunità Rossi Srl'});
 assert.deepEqual(core.opportunityDraft({id:C2,name:'Luca'},''),{contact_id:C2,company_id:'',title:'Opportunità Luca'});
 assert.equal(core.opportunityDraft(null),null);
});
test('list line for the contacts table',()=>{
 const l=core.listLine(C1,[call,mail,other],[todo],[],NOW);
 assert.equal(l.key,'ready');assert.equal(l.label,'Pronto');assert.equal(l.full,'Pronto per un’opportunità');
 assert.equal(l.done,2);assert.equal(l.planned,1);assert.equal(l.overdue,1);
 assert.equal(core.listLine(C2,[],[],[],NOW).key,'new');
});
test('the CRM page loads the journey before the record view, and the record mounts it',()=>{
 const html=fs.readFileSync(__dirname+'/../radix-sales.html','utf8');
 const a=html.indexOf('sales/crm-journey-core.js'),b=html.indexOf('sales/crm-journey.js'),c=html.indexOf('sales/crm-record.js');
 assert.ok(a>0&&a<b&&b<c);
 assert.match(fs.readFileSync(__dirname+'/../sales/crm-record.js','utf8'),/RadixCrmJourney\?\.panel\(ctx\)/);
});
