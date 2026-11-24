'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const C=require('../sales/crm-custom-fields.js');
const api=require('../api/_sales_custom_fields.js');
const sales=require('../api/_sales.js');
const csv=require('../sales/crm-csv-core.js');
const L=require('../sales/crm-list-core.js');
const MIG=fs.readFileSync(__dirname+'/../migrations/sales/015_crm_custom_fields.sql','utf8');
const W='5b1d2c3e-4f50-4a61-8b72-9c83d4e5f601',F1='11111111-1111-4111-8111-111111111111',F2='22222222-2222-4222-8222-222222222222';
const defs=[{id:F1,entity:'companies',label:'Budget 2026',position:0},{id:F2,entity:'contacts',label:'Hobby',position:0}];

test('a new name equal to an existing field reuses it; a near one is proposed',()=>{
 assert.equal(C.match(defs,'companies',' budget-2026 ').exact,true);
 const near=C.match(defs,'companies','Budjet 2026');assert.equal(near.exact,false);assert.equal(near.field.id,F1);
 assert.equal(C.match(defs,'companies','Fornitore storico'),null);
 assert.equal(C.match(defs,'contacts','Budget 2026'),null,'fields of the other entity do not count');
});

test('merge keeps other values, clears emptied ones, and says when nothing changed',()=>{
 assert.deepEqual(C.merge({[F1]:'10'},{[F2]:' x '}),{[F1]:'10',[F2]:'x'});
 assert.deepEqual(C.merge({[F1]:'10'},{[F1]:''}),{});
 assert.equal(C.merge({[F1]:'10'},{[F1]:'10'}),null);
});

test('API: field commands and record values are checked before the database',()=>{
 const c=api.command({workspace:W,entity:'custom_fields',action:'create',data:{entity:'companies',label:'  Budget   2026 '}});
 assert.equal(c.data.label,'Budget 2026');assert.match(c.data.id,/^[0-9a-f-]{36}$/);
 assert.throws(()=>api.command({workspace:W,entity:'custom_fields',action:'create',data:{entity:'leads',label:'X'}}),/aziende o contatti/);
 assert.throws(()=>api.command({workspace:W,entity:'custom_fields',action:'create',data:{entity:'contacts',label:'x'.repeat(61)}}),/60/);
 assert.throws(()=>api.command({workspace:W,entity:'custom_fields',action:'delete',data:{id:F1,label:'x'}}),/non consentito/);
 assert.deepEqual(api.values({[F1]:' 50.000 € ',[F2]:''}),{[F1]:'50.000 €'});
 assert.throws(()=>api.values({budget:'1'}),/sconosciuto/);
 assert.throws(()=>api.values({[F1]:'x'.repeat(501)}),/500/);
 const cmd=sales.command({workspace:W,entity:'companies',action:'create',data:{name:'Alfa',custom:{[F1]:'10'}}});
 assert.deepEqual(cmd.data.custom,{[F1]:'10'});
});

test('CSV: a column named like a field fills it; unknown columns are reported',()=>{
 const parsed=csv.parse('Azienda;Budget 2026;Colore preferito\nAlfa Srl;50.000;blu\n');
 const r=csv.mapRows('companies',parsed,{extended:true,custom:C.columnsFor(defs,'companies',parsed.headers)});
 assert.deepEqual(r.rows[0].custom,{[F1]:'50.000'});assert.deepEqual(r.unknown,['Colore preferito']);
});

test('lists: one hidden column per field, sortable and searchable',()=>{
 L.setCustom('companies',defs);
 const col=L.cols('companies').find(c=>c.id==='cf:'+F1);assert.ok(col&&col.hidden);assert.equal(col.label,'Budget 2026');
 const rows=L.buildRows('companies',{companies:[{id:'a',name:'Alfa',custom:{[F1]:'20'}},{id:'b',name:'Beta',custom:{[F1]:'10'}}]});
 assert.deepEqual(L.apply('companies',rows,{sort:{key:'cf:'+F1,dir:'asc'}}).map(r=>r.name),['Beta','Alfa']);
 assert.deepEqual(L.apply('companies',rows,{query:'20'}).map(r=>r.name),['Alfa']);
 assert.ok(L.normalize('companies',{columns:['name','cf:'+F1]}).columns.includes('cf:'+F1),'saved custom column survives');
 L.setCustom('companies',[]);
});

test('migration 015: new table, «custom» columns, field command, sales_command = 014 plus «custom»',()=>{
 assert.match(MIG,/\nBEGIN;\n/);assert.match(MIG,/\nCOMMIT;\n$/);assert.ok(!/\bDROP\b/i.test(MIG));
 assert.match(MIG,/CREATE TABLE IF NOT EXISTS sales_custom_fields\(/);
 assert.match(MIG,/CREATE UNIQUE INDEX IF NOT EXISTS sales_custom_fields_label ON sales_custom_fields\(workspace_id,entity,lower\(btrim\(label\)\)\)/);
 for(const t of ['sales_companies','sales_contacts'])assert.match(MIG,new RegExp('ALTER TABLE '+t+" ADD COLUMN IF NOT EXISTS custom jsonb NOT NULL DEFAULT '\\{\\}'::jsonb"));
 assert.match(MIG,/>=40 THEN RAISE EXCEPTION 'too many custom fields'/);
 assert.match(MIG,/action='delete' AND r NOT IN \('owner','admin'\)/);
 const body=s=>{const i=s.indexOf('CREATE OR REPLACE FUNCTION sales_command');return s.slice(i,s.indexOf('$$;',i)+3)};
 const prev=body(fs.readFileSync(__dirname+'/../migrations/sales/014_crm_division.sql','utf8')),fn=body(MIG);
 const stripped=fn.replace(/,'custom'\]/g,']').replace(/   -- Campi aggiunti \(015\)[\s\S]*?   END IF;\n(?=   -- Identifiers)/,'');
 assert.equal(stripped,prev,'identical to 014 apart from «custom»');
});
