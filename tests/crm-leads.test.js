'use strict';
// CRM «Stato lead» and «Converti» (migration sales 012): core logic, API validation, SQL and page wiring.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const L=require('../sales/crm-leads-core.js');
const {createHandler,command,fields}=require('../api/_sales');
const {createStore}=require('../api/_sales_store');
const B=require('../sales/lead-bulk-crm-core.js');
const W='11111111-1111-4111-8111-111111111111',ID='33333333-3333-4333-8333-333333333333',P='44444444-4444-4444-8444-444444444444',S='55555555-5555-4555-8555-555555555555',K='66666666-6666-4666-8666-666666666666';
const body=(entity,action,data)=>({workspace:W,entity,action,data});
const rejects=(b,re)=>assert.throws(()=>command(b),e=>e.status===400&&(!re||re.test(e.message)),JSON.stringify(b.data));
const MIG=fs.readFileSync(__dirname+'/../migrations/sales/012_crm_lead_status.sql','utf8');
const lead=(o={})=>({id:ID,version:3,title:'Mario Rossi · Acme',status:'nuovo',company_id:null,contact_id:null,created_at:'2026-10-20T10:00:00.000Z',...o});
const pipes=L.pipelines([{id:P,kind:'opportunity',title:'Vendita B2B'},{id:'x',kind:'task',title:'Attività'}],[{id:S,process_id:P,position:2,title:'Proposta'},{id:'s0',process_id:P,position:1,title:'Primo contatto'},{id:'t',process_id:'x',position:1,title:'Da fare'}]);

test('status path: labels, counts, filters and order newest first',()=>{
 assert.deepEqual(L.PATH,['nuovo','contattato','qualificato','convertito']);
 assert.ok(!L.EDITABLE.some(([k])=>k==='convertito'),'«Convertito» only through «Converti»');
 const list=[lead({id:'a',status:'nuovo',created_at:'2026-10-01T00:00:00Z'}),lead({id:'b',status:'qualificato',created_at:'2026-10-03T00:00:00Z'}),lead({id:'c',status:'convertito'}),lead({id:'d',status:'non_qualificato'}),lead({id:'e',status:undefined})];
 const c=L.counts(list);assert.equal(c.nuovo,2);assert.equal(c.qualificato,1);assert.equal(c.convertito,1);assert.equal(c.non_qualificato,1);assert.equal(c.aperti,3);assert.equal(c.tutti,5);
 assert.deepEqual(L.filter(list,'aperti').map(x=>x.id),['a','b','e']);assert.deepEqual(L.filter(list,'convertito').map(x=>x.id),['c']);assert.equal(L.filter(list,'tutti').length,5);
 assert.deepEqual(L.sort(L.filter(list,'aperti')).map(x=>x.id),['e','b','a']);
 assert.equal(L.step(lead({status:'qualificato'})),2);assert.equal(L.step(lead({status:'non_qualificato'})),-1);
 assert.equal(L.supported([]),true);assert.equal(L.supported([{id:'a',title:'x'}]),false,'archive before 012');assert.equal(L.supported([lead()]),true);
});

test('status change: «Non qualificato» needs a reason, the other states clear it, «Convertito» is refused',()=>{
 assert.deepEqual(L.statusPayload(lead(),'contattato'),{data:{id:ID,version:3,status:'contattato',status_reason:null}});
 assert.match(L.statusPayload(lead(),'non_qualificato','  ').error,/perché/);
 assert.deepEqual(L.statusPayload(lead(),'non_qualificato',' Nessun budget ').data,{id:ID,version:3,status:'non_qualificato',status_reason:'Nessun budget'});
 assert.match(L.statusPayload(lead(),'convertito').error,/non valido/);
 assert.match(L.statusPayload(lead({status:'convertito'}),'nuovo').error,/già convertito/);
 assert.match(L.statusPayload(lead(),'nuovo').error,/già in questo stato/);
 assert.match(L.statusPayload(lead(),'non_qualificato','x'.repeat(501)).error,/500/);
});

test('«Converti»: pipelines with ordered stages, defaults, Italian amounts and the API payload',()=>{
 assert.deepEqual(pipes.map(p=>[p.title,p.stages.map(s=>s.title)]),[['Vendita B2B',['Primo contatto','Proposta']]]);
 assert.deepEqual(L.convertDefaults(lead({owner_id:2}),pipes),{title:'Mario Rossi · Acme',process_id:P,stage_id:'s0',amount:'',expected_close:'',owner_id:2});
 for(const [v,c] of [['',0],['12.500',1250000],['12500,50',1250050],['€ 1.200',120000],['99.5',9950],['1.2.3',null],['-5',null],['abc',null]])assert.equal(L.cents(v),c,v);
 const form={create:true,title:' Deal Acme ',process_id:P,stage_id:S,amount:'2.000',expected_close:'2026-12-31',owner_id:'2'};
 assert.deepEqual(L.convertPayload(lead(),form,K,pipes),{data:{id:ID,version:3,key:K,opportunity:{title:'Deal Acme',process_id:P,stage_id:S,amount_cents:200000,expected_close:'2026-12-31',owner_id:2}}});
 assert.deepEqual(L.convertPayload(lead(),{create:false},K,pipes),{data:{id:ID,version:3,key:K,opportunity:null}});
 assert.match(L.convertPayload(lead(),{...form,stage_id:'t'},K,pipes).error,/fase/);
 assert.match(L.convertPayload(lead(),{...form,process_id:'x'},K,pipes).error,/pipeline/);
 assert.match(L.convertPayload(lead(),{...form,title:''},K,pipes).error,/nome/);
 assert.match(L.convertPayload(lead(),{...form,amount:'tanti'},K,pipes).error,/Importo/);
 assert.match(L.convertPayload(lead(),{...form,expected_close:'2026-02-30'},K,pipes).error,/Data/);
 assert.match(L.convertPayload(lead({status:'convertito'}),form,K,pipes).error,/già convertito/);
 assert.match(L.convertSummary(lead(),{company:'Acme',contact:'Mario Rossi'},form,pipes),/«Deal Acme» in Vendita B2B › Proposta, collegata a Mario Rossi · Acme/);
 assert.match(L.convertSummary(lead(),{},{create:false},pipes),/senza creare una trattativa/);
});

test('API: lead fields and statuses, «convertito» never by hand, «convert» validated with a fresh opportunity id',()=>{
 assert.deepEqual(fields.leads,['title','company_id','contact_id','status','status_reason','source','owner_id','notes']);
 assert.equal(command(body('leads','create',{title:'X',status:'contattato',source:'LinkedIn'})).data.status,'contattato');
 rejects(body('leads','update',{id:ID,version:1,status:'convertito'}),/Converti/);
 rejects(body('leads','update',{id:ID,version:1,status:'perso'}),/Stato lead/);
 rejects(body('leads','update',{id:ID,version:1,source:'x'.repeat(81)}),/Testo/);
 const c=command(body('leads','convert',{id:ID,version:3,key:K,opportunity:{title:' Deal ',process_id:P,stage_id:S,amount_cents:100}}));
 assert.equal(c.action,'convert');assert.equal(c.data.opportunity.title,'Deal');assert.match(c.data.opportunity_id,/^[0-9a-f-]{36}$/);
 assert.deepEqual(command(body('leads','convert',{id:ID,version:3,key:K,opportunity:null})).data,{id:ID,version:3,key:K,opportunity:null});
 rejects(body('contacts','convert',{id:ID,version:3,key:K,opportunity:null}),/Conversione/);
 rejects(body('leads','convert',{id:ID,version:3,opportunity:null}),/Conversione/);
 rejects(body('leads','convert',{id:ID,version:3,key:K}),/Conversione/);
 rejects(body('leads','convert',{id:ID,version:3,key:K,opportunity:{title:'D',process_id:P}}),/pipeline/);
 rejects(body('leads','convert',{id:ID,version:3,key:K,opportunity:{title:'D',process_id:P,stage_id:S,outcome:'won'}}),/Trattativa/);
 rejects(body('leads','convert',{id:ID,version:3,key:K,opportunity:{title:'D',process_id:P,stage_id:S,expected_close:'31/12/2026'}}),/Data/);
 rejects(body('leads','convert',{id:ID,version:3,key:K,opportunity:{title:'D',process_id:P,stage_id:S,amount_cents:-1}}),/Importo/);
});

test('API errors: archive before 012 and a lead already converted get a clear message',async()=>{
 const run=async(err)=>{const store={membership:async()=>({role:'member'}),command:async()=>{throw err}};
  const r={headers:{},setHeader(){},status(v){this.code=v;return this},json(v){this.body=v;return this}};
  await createHandler({getSessionUser:()=>({uid:1}),getStore:()=>store})({method:'POST',query:{},body:body('leads','convert',{id:ID,version:3,key:K,opportunity:null}),headers:{'content-type':'application/json','x-radix-sales':'1'}},r);return r};
 const r=await run(Object.assign(new Error('already converted'),{code:'23514'}));assert.equal(r.code,409);assert.match(r.body.error,/già stato convertito/);
 // The store turns the «unknown action» of an old sales_command into the 012 message.
 const store=createStore(async()=>{throw Object.assign(new Error('invalid command'),{code:'22023'})});
 await assert.rejects(store.command({workspace:W,entity:'leads',action:'convert',data:{}},1),e=>e.status===400&&/migrazione sales 012/.test(e.message));
 await assert.rejects(store.command({workspace:W,entity:'leads',action:'update',data:{}},1),e=>e.code==='22023'&&!e.status);
});

test('migration 012: idempotent columns, converted state, links that clear on delete, convert inside sales_command',()=>{
 assert.match(MIG,/ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'nuovo' CHECK\(status IN\('nuovo','contattato','qualificato','non_qualificato','convertito'\)\)/);
 for(const c of ['status_reason','source','owner_id','notes','converted_at','converted_by','converted_opportunity_id'])assert.match(MIG,new RegExp('ADD COLUMN IF NOT EXISTS '+c+' '));
 assert.match(MIG,/sales_lead_converted_state CHECK\(\(status='convertito'\)=\(converted_at IS NOT NULL\)/);
 assert.match(MIG,/REFERENCES sales_opportunities\(workspace_id,id\) ON DELETE SET NULL \(converted_opportunity_id\)/);
 assert.match(MIG,/REFERENCES sales_memberships\(workspace_id,user_id\) ON DELETE SET NULL \(owner_id\)/);
 assert.match(MIG,/WHEN 'leads' THEN ARRAY\['title','company_id','contact_id','status','status_reason','source','owner_id','notes'\]/);
 assert.match(MIG,/action NOT IN \('create','update','delete','transition','convert'\)/);
 assert.match(MIG,/d->>'status'='convertito' THEN RAISE EXCEPTION 'invalid lead status'/);
 assert.match(MIG,/RAISE EXCEPTION 'already converted' USING ERRCODE='23514'/);
 // The opportunity takes the lead's company and contact from the locked row, never from the client.
 assert.match(MIG,/\(current_row->>'company_id'\)::uuid,\(current_row->>'contact_id'\)::uuid,x\.process_id,x\.stage_id/);
 assert.match(MIG,/INSERT INTO sales_idempotency\(workspace_id,actor_id,key,fingerprint,result\) VALUES\(w,actor,\(d->>'key'\)::uuid,fp,result\);\n ELSIF action='delete'/);
 assert.match(MIG,/^BEGIN;[\s\S]*COMMIT;\n$/m);assert.ok(!/DROP |TRUNCATE/i.test(MIG),'nothing is dropped');
});

test('Lead Intelligence: «Lead nel CRM» is the default target and new leads carry their source',()=>{
 const pl=fs.readFileSync(__dirname+'/../sales/lead-pipeline.js','utf8');
 assert.match(pl,/sel\.replaceChildren\(Object\.assign\(el\('option','Lead nel CRM: da qualificare, poi «Converti»'\),\{value:'leads'\}\)/);
 const l={id:'c0',origin:'contatti',name:'Mario Rossi',email:'mario@acme.it',phone:'',role:'',linkedin:'',company:'Acme',domain:'acme.it',industry:'',country:'',location:'',size:'',source:'https://www.linkedin.com/sales/lead/x',sourceLabel:'LinkedIn Sales Navigator',verified:false};
 const p=B.plan([l],B.indexCrm({}),{entity:'leads'},new Map());
 assert.deepEqual(p.items[0].deal.create,{entity:'leads',data:{title:'Mario Rossi · Acme',source:'LinkedIn Sales Navigator'}});
 const o=B.plan([l],B.indexCrm({}),{entity:'opportunities',process_id:P,stage_id:S},new Map());
 assert.ok(!('source' in o.items[0].deal.create.data),'opportunities have no source column');
 assert.match(fs.readFileSync(__dirname+'/../sales/lead-crm-handoff.js','utf8'),/const data=\{title,company_id:link\.companyId,source:'Lead Intelligence'\}/);
});

test('page wiring: lead view loaded before sales.js renders, writes through sales.js, editor fields, tokens only',()=>{
 const html=fs.readFileSync(__dirname+'/../radix-sales.html','utf8');
 const at=s=>{const i=html.indexOf(s);assert.ok(i>0,s+' missing');return i};
 assert.ok(at('src="sales/crm-fields-core.js"')<at('src="sales/crm-leads-core.js"')&&at('src="sales/crm-leads-core.js"')<at('src="sales/crm-leads.js"')&&at('src="sales/crm-leads.js"')<at('src="sales/sales.js"'));
 assert.ok(at('href="sales/crm-leads.css"')<at('<script'));
 const ui=fs.readFileSync(__dirname+'/../sales/crm-leads.js','utf8');
 assert.ok(!/fetch\(/.test(ui),'no own requests');assert.ok(!/send-email|\/api\/chat/.test(ui),'no sends, no AI');
 assert.match(ui,/app\(\)\.mutate\('leads',action,data,null\)/);assert.match(ui,/crypto\.randomUUID\(\)/);
 const sales=fs.readFileSync(__dirname+'/../sales/sales.js','utf8');
 assert.match(sales,/window\.RadixSalesApp=\{state,mutate:\(\.\.\.a\)=>mutate\(\.\.\.a\),/);
 assert.match(sales,/entity==='leads'&&window\.RadixCrmLeads\?\.section\(section\)/);
 assert.match(sales,/if\(confirmation&&!window\.confirm\(confirmation\)\)return false;/);
 assert.match(sales,/addSelect\('status','Stato \*',L\?L\.EDITABLE/);
 const css=fs.readFileSync(__dirname+'/../sales/crm-leads.css','utf8').replace(/\/\*[\s\S]*?\*\//g,'');
 const body=css.replace(/:root\{[\s\S]*?\}\n/,'');assert.ok(!/#[0-9a-f]{3,8}\b/i.test(body),'colours only through tokens');
});
