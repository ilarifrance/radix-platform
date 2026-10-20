'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const F=require('../sales/crm-fields-core.js');
const L=require('../sales/crm-list-core.js');
const {fields}=require('../api/_sales');
const MIG=fs.readFileSync(__dirname+'/../migrations/sales/014_crm_division.sql','utf8');

test('Dipartimento: one optional text field on Aziende and Contatti, accepted by the API',()=>{
 for(const kind of ['companies','contacts']){
  const fd=F.fieldOf(kind,'division');assert.equal(fd.label,'Dipartimento');assert.ok(fd.added&&fd.suggest);
  assert.ok(fields[kind].includes('division'));
  assert.deepEqual(F.parse(kind,'division','  Divisione Nord  '),{value:'Divisione Nord'});
  assert.match(F.parse(kind,'division','x'.repeat(121)).error,/massimo 120/);
 }
 // An archive without 014 still saves the other fields: an unchanged empty Dipartimento is not sent.
 assert.deepEqual(F.prune('contacts',{name:'A',division:null},{name:'B',title:null}),{name:'A'});
});
test('migration 014: two columns, and sales_command = 012 plus «division» in the allowlists',()=>{
 assert.match(MIG,/\nBEGIN;\n/);assert.match(MIG,/\nCOMMIT;\n$/);assert.ok(!/\bDROP\b|NOT NULL DEFAULT|SET NOT NULL/i.test(MIG.replace(/CREATE OR REPLACE FUNCTION[\s\S]*\$\$;/,'')));
 assert.match(MIG,/ALTER TABLE sales_companies ADD COLUMN IF NOT EXISTS division text CHECK\(length\(division\)<=120\);/);
 assert.match(MIG,/ALTER TABLE sales_contacts ADD COLUMN IF NOT EXISTS division text CHECK\(length\(division\)<=120\);/);
 const body=s=>{const i=s.indexOf('CREATE OR REPLACE FUNCTION sales_command');return s.slice(i,s.indexOf('$$;',i)+3)};
 const fn=body(MIG),prev=body(fs.readFileSync(__dirname+'/../migrations/sales/012_crm_lead_status.sql','utf8'));
 const arr=k=>/WHEN 'companies' THEN/.test(fn)&&new RegExp("WHEN '"+k+"' THEN ARRAY\\[([^\\]]*)\\]").exec(fn)[1].match(/'[a-z_]+'/g).map(x=>x.slice(1,-1));
 const sorted=a=>[...a].sort();
 assert.deepEqual(sorted(arr('companies')),sorted(fields.companies));assert.deepEqual(sorted(arr('contacts')),sorted(fields.contacts));
 assert.equal(fn.replace(/,'division'\]/g,']'),prev,'identical to 012 apart from the two allowlists');
});
test('list views: Dipartimento column, search and filter',()=>{
 const data={companies:[{id:'c1',name:'Alfa',division:'GCP'},{id:'c2',name:'Beta',division:'gcp'},{id:'c3',name:'Gamma'}],contacts:[{id:'p1',name:'Anna',company_id:'c1',division:'Doc Capital'},{id:'p2',name:'Bruno'}]};
 const rows=L.buildRows('companies',data,{now:0});
 assert.deepEqual(L.divisions(rows),[{value:'GCP',count:2}]);
 assert.deepEqual(L.apply('companies',rows,{division:'Gcp'},0).map(r=>r.name),['Alfa','Beta']);
 assert.deepEqual(L.apply('companies',rows,{division:L.NONE},0).map(r=>r.name),['Gamma']);
 assert.deepEqual(L.apply('contacts',L.buildRows('contacts',data,{now:0}),{query:'capital'},0).map(r=>r.name),['Anna']);
 assert.equal(L.normalize('contacts',{division:'GCP'}).division,'GCP');assert.equal(L.normalize('contacts',{division:7}).division,'');
});
test('editor wiring: suggestions and the company Dipartimento for a new contact',()=>{
 const js=fs.readFileSync(__dirname+'/../sales/sales.js','utf8');
 assert.match(js,/if\(fd\.suggest\)\{const dl=el\('datalist'\)/);assert.match(js,/co\?\.division\)\{inputs\.division\.value=co\.division/);
 assert.match(fs.readFileSync(__dirname+'/../sales/crm-list.js','utf8'),/drawDivisions\(all\)/);
});

test('import: «Dipartimento» column fills division, «Reparto» stays department', () => {
  const csv = require('../sales/crm-csv-core.js');
  const parsed = { headers: ['Nome', 'Dipartimento', 'Reparto'], rows: [{ Nome: 'Anna Rossi', Dipartimento: 'GCP Corporate', Reparto: 'Acquisti' }] };
  const r = csv.mapRows('contacts', parsed, { extended: true });
  assert.equal(r.rows[0].division, 'GCP Corporate');
  assert.equal(r.rows[0].department, 'Acquisti');
  const c = csv.mapRows('companies', { headers: ['Azienda', 'Dipartimento'], rows: [{ Azienda: 'Arredi Srl', Dipartimento: 'GCP Corporate' }] }, { extended: true });
  assert.equal(c.rows[0].division, 'GCP Corporate');
});
