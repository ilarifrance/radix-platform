'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {command,segmentFilters}=require('../api/_sales');
const W='5b1d2c3e-4f50-4a61-8b72-9c83d4e5f601',ID='9220862f-d82e-4c33-a2b2-899d4a77fe16';
const cmd=(entity,action,data)=>command({workspace:W,entity,action,data});
test('tickets accept support fields with their own statuses and channels',()=>{
 const t=cmd('tickets','create',{title:'Fattura errata',body:'Il cliente segnala…',status:'open',priority:'high',channel:'phone',contact_id:ID,company_id:ID,due_at:'2026-10-20T09:00:00Z'});
 assert.equal(t.data.channel,'phone');
 assert.equal(cmd('tickets','update',{id:ID,version:1,status:'resolved',resolution:'Nota di credito'}).data.status,'resolved');
 assert.equal(cmd('tickets','update',{id:ID,version:1,resolution:''}).data.resolution,null);
 assert.throws(()=>cmd('tickets','update',{id:ID,version:1,status:'done'}),/Stato non valido/);
 assert.throws(()=>cmd('tasks','update',{id:ID,version:1,status:'resolved'}),/Stato non valido/);
 assert.throws(()=>cmd('tickets','create',{title:'X',channel:'fax'}),/Canale/);
 assert.throws(()=>cmd('tickets','create',{title:'X',opportunity_id:ID}),/Campo non consentito/);
 assert.throws(()=>cmd('tickets','create',{body:'senza titolo'}),/obbligatori/);
});
test('saved segments only store the five known filters',()=>{
 assert.ok(segmentFilters({role:'CMO',industry:'Moda',city:'Milano',consent:'yes',silent_days:30}));
 assert.ok(segmentFilters({}));
 assert.equal(segmentFilters({consent:'maybe'}),false);
 assert.equal(segmentFilters({silent_days:-1}),false);
 assert.equal(segmentFilters({sql:'x'}),false);
 assert.equal(segmentFilters({role:'x'.repeat(81)}),false);
 assert.equal(segmentFilters([]),false);
 assert.equal(cmd('segments','create',{name:'Decisori Milano',filters:{city:'Milano'}}).data.name,'Decisori Milano');
 assert.throws(()=>cmd('segments','create',{name:'Senza filtri'}),/obbligatori/);
 assert.throws(()=>cmd('segments','create',{name:'X',filters:{city:'Milano',owner:'me'}}),/Filtri del segmento/);
 assert.throws(()=>cmd('segments','update',{id:ID,version:1,created_by:3}),/Campo non consentito/);
});
test('migration 009 adds both tables and lets sales_command write them with the actor as author',()=>{
 const sql=fs.readFileSync(__dirname+'/../migrations/sales/009_crm_tickets_segments.sql','utf8');
 assert.match(sql,/CREATE TABLE sales_tickets/);
 assert.match(sql,/CREATE TABLE sales_segments/);
 assert.match(sql,/FOREIGN KEY\(workspace_id,contact_id,company_id\) REFERENCES sales_contacts\(workspace_id,id,company_id\)/);
 assert.match(sql,/'interactions','tickets','segments'\) OR action NOT IN/);
 assert.match(sql,/IF entity IN \('companies','contacts','leads','opportunities','tasks','interactions','tickets','segments'\) THEN cols := cols \|\| ',created_by'/);
 assert.match(sql,/WHEN 'segments' THEN ARRAY\['name','filters'\]/);
});
test('the CRM page lists tickets and the copilot sees the support queue',()=>{
 assert.match(fs.readFileSync(__dirname+'/../sales/sales.js','utf8'),/tickets:'Assistenza'/);
 assert.match(fs.readFileSync(__dirname+'/../api/_crm-context.js','utf8'),/TICKET DI ASSISTENZA APERTI/);
 assert.match(fs.readFileSync(__dirname+'/../sales/crm-tools.js','utf8'),/post\('segments','create'/);
});
