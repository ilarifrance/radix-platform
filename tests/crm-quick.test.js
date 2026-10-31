'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const Q=require('../sales/crm-quick-core.js');
const P='p1',stages=[{id:'s1',process_id:P,title:'Nuovo contatto'},{id:'s2',process_id:P,title:'Proposta inviata'}];
const companies=[{id:'c1',name:'Interfood Ltd'},{id:'c2',name:'Gelateria Àlba'}];
const contacts=[{id:'k1',name:'Mario Rossi',company_id:'c1'},{id:'k2',name:'Anna Neri',company_id:null},{id:'k3',name:'Mario Rossi',company_id:'c2'}];
const data={companies,contacts,stages};

test('quick opportunity: new company and new contact are created, process comes from the stage',()=>{
 const p=Q.plan({title:'  Forni 2027 ',company:'Nuova Srl',contact:'Luca Bianchi',amount:'24.000,50',expected_close:'2026-12-15',stage_id:'s2'},data);
 assert.deepEqual(p,{company:{create:{name:'Nuova Srl'}},contact:{create:{name:'Luca Bianchi'}},opportunity:{title:'Forni 2027',process_id:P,stage_id:'s2',amount_cents:2400050,expected_close:'2026-12-15'}});
});
test('quick opportunity: names already in the CRM are linked (case, accents and spaces ignored)',()=>{
 const p=Q.plan({title:'X',company:'gelateria  alba',contact:'mario rossi',stage_id:'s1'},data);
 assert.deepEqual(p.company,{id:'c2'});assert.deepEqual(p.contact,{id:'k3'},'the namesake under the chosen company');
 assert.equal(p.opportunity.amount_cents,0,'empty amount = 0');
});
test('quick opportunity: a known contact with the company left empty brings its own company',()=>{
 const p=Q.plan({title:'X',contact:'Anna Neri',stage_id:'s1'},data);assert.deepEqual(p.company,null);assert.deepEqual(p.contact,{id:'k2'});
 const q=Q.plan({title:'X',contact:'Mario Rossi',stage_id:'s1'},{...data,contacts:[contacts[0]]});assert.deepEqual(q.company,{id:'c1'});
});
test('quick opportunity: incoherent contact and company are refused before saving',()=>{
 assert.match(Q.plan({title:'X',company:'Nuova Srl',contact:'Mario Rossi',stage_id:'s1'},{...data,contacts:[contacts[0]]}).error,/già un contatto di «Interfood Ltd»/);
 assert.match(Q.plan({title:'X',company:'Interfood Ltd',contact:'Anna Neri',stage_id:'s1'},data).error,/senza azienda/);
});
test('quick opportunity: missing title, stage, bad amount or date',()=>{
 assert.match(Q.plan({title:' ',stage_id:'s1'},data).error,/nome dell’opportunità/);
 assert.match(Q.plan({title:'X',stage_id:'nope'},data).error,/fase/);
 assert.match(Q.plan({title:'X',stage_id:'s1',amount:'12,3,4'},data).error,/Importo/);
 assert.match(Q.plan({title:'X',stage_id:'s1',expected_close:'2026-02-30'},data).error,/Data/);
 assert.equal(Q.amountCents('€ 1.000'),100000);assert.equal(Q.amountCents('1250000,5'),125000050);
});
test('quick hints say whether a typed name is linked or created',()=>{
 assert.equal(Q.hint('companies','INTERFOOD ltd',companies),'Azienda già nel CRM: la collego.');
 assert.equal(Q.hint('contacts','Nuovo Nome',contacts),'Nuovo contatto: lo creo al salvataggio.');
 assert.equal(Q.hint('companies','',companies),'');
});
test('Pipeline has «+ Nuova opportunità», a «+ Aggiungi» per stage and loads the quick core first',()=>{
 const html=fs.readFileSync('sales-pipeline-premium.html','utf8'),js=fs.readFileSync('sales/pipeline-premium.js','utf8');
 assert.ok(html.indexOf('crm-quick-core.js')>-1&&html.indexOf('crm-quick-core.js')<html.indexOf('pipeline-premium.js'));
 assert.match(html,/id="new-deal"[^>]*>\+ Nuova opportunità</);assert.match(html,/<dialog id="quick-deal"/);
 for(const k of ['title','company','contact','amount','expected_close','stage_id'])assert.match(html,new RegExp('name="'+k+'"'));
 assert.match(js,/'\+ Aggiungi','stage-add'/);assert.match(js,/post\('companies'/);assert.match(js,/post\('contacts',\{\.\.\.p\.contact\.create,company_id:companyId\}\)/);
});
test('CRM editor offers «+ Nuova azienda» and «+ Nuovo contatto» under the lists',()=>{
 const html=fs.readFileSync('radix-sales.html','utf8'),js=fs.readFileSync('sales/sales.js','utf8');
 assert.ok(html.indexOf('sales/crm-quick-core.js')>-1&&html.indexOf('sales/crm-quick-core.js')<html.indexOf('sales/sales.js'));
 assert.match(js,/n\.name==='company_id'&&entity!=='companies'\)quickAdd\(n,'companies',fields\)/);
 assert.match(js,/n\.name==='contact_id'&&entity!=='contacts'\)quickAdd\(n,'contacts',fields\)/);
});
