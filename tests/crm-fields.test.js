'use strict';
// Salesforce-style Account/Contact fields and Italian fiscal data (migration sales 011, draft).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const F=require('../sales/crm-fields-core.js');
const {createHandler,command,fields}=require('../api/_sales');
const {createStore,normalize}=require('../api/_sales_store');
const csv=require('../sales/crm-csv-core.js');
const L=require('../sales/crm-list-core.js');
const D=require('../sales/crm-dedupe-core.js');
const W='11111111-1111-4111-8111-111111111111',ID='33333333-3333-4333-8333-333333333333',P='44444444-4444-4444-8444-444444444444';
const body=(entity,action,data)=>({workspace:W,entity,action,data});
const rejects=(b,re)=>assert.throws(()=>command(b),e=>e.status===400&&(!re||re.test(e.message)),JSON.stringify(b.data));
const MIG=fs.readFileSync(__dirname+'/../migrations/sales/011_crm_account_contact_fields.sql','utf8');

test('Partita IVA: 11 digits with the check digit, optional IT prefix, foreign VAT up to 20 characters',()=>{
 assert.equal(F.pivaChecksum('12345678903'),true);assert.equal(F.pivaChecksum('12345678901'),false);
 assert.deepEqual(F.vat('12345678903'),{value:'12345678903'});
 assert.deepEqual(F.vat(' it 123.456.789-03 '),{value:'IT12345678903'});
 assert.deepEqual(F.vat('DE 123456789'),{value:'DE123456789'});
 assert.deepEqual(F.vat('ESX1234567X'),{value:'ESX1234567X'});
 assert.deepEqual(F.vat(''),{value:null});
 for(const bad of ['12345678901','1234567890','IT1234567890','IT12345678901','X1','DE'+'1'.repeat(19),'IT12345678903!'])assert.ok(F.vat(bad).error,bad);
});
test('codice fiscale: 16 characters with the control letter, or 11 digits for a company',()=>{
 assert.deepEqual(F.taxCode('rssmra85t10a562s'),{value:'RSSMRA85T10A562S'});
 assert.deepEqual(F.taxCode('12345678903'),{value:'12345678903'});
 for(const bad of ['RSSMRA85T10A562X','RSSMRA85T10A562','12345678901','RSSMRA85Z10A562S'])assert.ok(F.taxCode(bad).error,bad);
});
test('SDI recipient code: 7 characters, 6 for the public administration',()=>{
 assert.deepEqual(F.sdi('0000000'),{value:'0000000'});assert.deepEqual(F.sdi('m5uxcr1'),{value:'M5UXCR1'});assert.deepEqual(F.sdi('UFABCD'),{value:'UFABCD'});
 for(const bad of ['12345','12345678','ABC-12'])assert.ok(F.sdi(bad).error,bad);
});
test('form values: euros to cents, integers, dates, enums, references and self references',()=>{
 for(const [s,c] of [['1250000',125000000],['1.250.000',125000000],['1.250.000,50',125000050],['1,250,000.50',125000050],['€ 1.000',100000],['12,5',1250],['0',0]])assert.equal(F.euroToCents(s),c,s);
 for(const s of ['abc','1.25.0','-5','1,'])assert.ok(Number.isNaN(F.euroToCents(s)),s);
 assert.equal(F.euroToCents(''),null);assert.equal(F.centsToEuro(125000050),'1250000,50');assert.equal(F.centsToEuro(125000000),'1250000');
 assert.deepEqual(F.parse('companies','employees','1.200'),{value:1200});assert.ok(F.parse('companies','employees','-1').error);
 assert.deepEqual(F.parse('companies','account_type','partner'),{value:'partner'});assert.ok(F.parse('companies','account_type','boh').error);
 assert.deepEqual(F.parse('companies','rating',''),{value:null});
 assert.deepEqual(F.parse('contacts','birthdate','1980-02-29',{now:Date.UTC(2026,9,20)}),{value:'1980-02-29'});
 for(const d of ['1981-02-29','1899-12-31','2027-01-01','31/12/1980'])assert.ok(F.parse('contacts','birthdate',d,{now:Date.UTC(2026,9,20)}).error,d);
 assert.ok(F.parse('companies','parent_company_id',ID,{selfId:ID}).error);assert.deepEqual(F.parse('companies','parent_company_id',P,{selfId:ID}),{value:P});
 assert.ok(F.parse('contacts','reports_to_id',ID,{selfId:ID}).error);
 assert.deepEqual(F.parse('contacts','owner_id','7'),{value:7});assert.ok(F.parse('contacts','owner_id','0').error);
 assert.ok(F.parse('companies','pec','non-una-pec').error);assert.deepEqual(F.parse('companies','pec',' a@pec.it '),{value:'a@pec.it'});
 assert.ok(F.parse('contacts','zip','2010@').error);assert.deepEqual(F.parse('contacts','zip','20100'),{value:'20100'});
 assert.ok(F.parse('contacts','first_name','x'.repeat(101)).error);
 assert.equal(F.displayName(' Mario ','Rossi'),'Mario Rossi');assert.equal(F.displayName('','Rossi'),'Rossi');
});
test('an archive without migration 011: rows lack the added keys and unchanged added fields are not resent',()=>{
 assert.equal(F.supported('contacts',{id:ID,name:'X'}),false);assert.equal(F.supported('contacts',{id:ID,name:'X',first_name:null}),true);
 const old={id:ID,version:3,name:'Beta',city:'Roma'};
 assert.deepEqual(F.prune('companies',{name:'Beta',city:'Roma',legal_name:null,vat_number:null},old),{name:'Beta',city:'Roma'});
 assert.deepEqual(F.prune('companies',{name:'Beta',legal_name:'Beta S.r.l.'},old),{name:'Beta',legal_name:'Beta S.r.l.'});
 // Stored bigint arrives as a string from the driver: the same value is not resent.
 assert.deepEqual(F.prune('companies',{annual_revenue_cents:100,employees:null},{annual_revenue_cents:'100',employees:5}),{employees:null});
 assert.deepEqual(F.prune('contacts',{first_name:null},null),{});
});
test('«Dettagli» lists only the filled fields, with names instead of ids',()=>{
 const rec={id:ID,name:'Beta',legal_name:'Beta S.r.l.',account_type:'cliente',owner_id:7,parent_company_id:P,annual_revenue_cents:'125000050',employees:42,vat_number:'IT12345678903',sdi_code:null,billing_city:'',shipping_city:null};
 const g=F.details('companies',rec,{companies:[{id:P,name:'Holding'}],members:[{id:7,name:'Marta'}]});
 assert.deepEqual(g.map(s=>s.label),['Informazioni','Dati fiscali']);
 const info=Object.fromEntries(g[0].items.map(i=>[i.key,i.text]));
 assert.deepEqual(info,{legal_name:'Beta S.r.l.',account_type:'Cliente',owner_id:'Marta',parent_company_id:'Holding',annual_revenue_cents:'€ 1.250.000,5',employees:'42'});
 assert.equal(g[0].items.find(i=>i.key==='parent_company_id').ref,P);
 assert.deepEqual(F.details('contacts',{id:ID,name:'X',birthdate:'1980-05-01'},{}),[{id:'other',label:'Altro',items:[{key:'birthdate',label:'Data di nascita',text:'01/05/1980',type:'date',ref:null}]}]);
 assert.deepEqual(F.details('contacts',{id:ID,name:'Solo nome'},{}),[],'old archive row: nothing to show');
});

test('API allowlist: the 011 fields, written with the same permissions as the other record fields',()=>{
 for(const k of F.ADDED.companies)assert.ok(fields.companies.includes(k),k);
 for(const k of F.ADDED.contacts)assert.ok(fields.contacts.includes(k),k);
 assert.ok(!fields.companies.includes('workspace_id'));
});
test('API validates and normalizes the company fields',()=>{
 const d=command(body('companies','create',{name:'Beta',legal_name:' Beta S.r.l. ',account_type:'cliente',rating:'calda',owner_id:7,parent_company_id:P,annual_revenue_cents:125000000,employees:42,billing_zip:'25100',billing_province:'BS',vat_number:'it 12345678903',tax_code:'12345678903',pec:'beta@pec.it',sdi_code:'m5uxcr1',description:'',shipping_city:null})).data;
 assert.equal(d.legal_name,'Beta S.r.l.');assert.equal(d.vat_number,'IT12345678903');assert.equal(d.sdi_code,'M5UXCR1');assert.equal(d.description,null);assert.equal(d.shipping_city,null);assert.equal(d.owner_id,7);
 for(const [k,v,re] of [['vat_number','12345678901',/controllo/],['tax_code','ABC',/Codice fiscale/],['sdi_code','12345',/SDI/],['pec','x@',/PEC/],['account_type','Cliente',/Tipo/],['rating','hot',/Valutazione/],['annual_revenue_cents',-1,/Fatturato/],['annual_revenue_cents','100',/Fatturato/],['annual_revenue_cents',1.5,/Fatturato/],['employees',-3,/Dipendenti/],['employees',10000001,/Dipendenti/],['owner_id','7',/Responsabile/],['parent_company_id','x',/Identificativo/],['legal_name','x'.repeat(201),/200/],['billing_zip','<script>',/CAP/],['vat_number',12345678903,/valore/]])
  rejects(body('companies','create',{name:'Beta',[k]:v}),re);
 rejects(body('companies','update',{id:ID,version:1,parent_company_id:ID}),/capogruppo/);
});
test('API contacts: «Nome Cognome» becomes the display name when the name is missing or empty',()=>{
 assert.equal(command(body('contacts','create',{first_name:'Mario',last_name:'Rossi'})).data.name,'Mario Rossi');
 assert.equal(command(body('contacts','create',{name:'',first_name:'Mario',last_name:'Rossi'})).data.name,'Mario Rossi');
 assert.equal(command(body('contacts','create',{name:'Dott. Rossi',first_name:'Mario',last_name:'Rossi'})).data.name,'Dott. Rossi');
 assert.equal(command(body('contacts','update',{id:ID,version:2,last_name:'Bianchi'})).data.name,undefined,'an update without name keeps the stored one');
 assert.equal(command(body('contacts','update',{id:ID,version:2,name:null,first_name:'Anna'})).data.name,'Anna');
 rejects(body('contacts','create',{first_name:'  '}),/obbligatori/);
 const d=command(body('contacts','create',{name:'X',title:'Direttore acquisti',department:'Acquisti',mobile:'+39 333',birthdate:'1980-05-01',reports_to_id:P,owner_id:3,lead_source:'Fiera',preferred_language:'Italiano',city:'Milano',zip:'20100'})).data;
 assert.equal(d.title,'Direttore acquisti');assert.equal(d.birthdate,'1980-05-01');assert.equal(d.reports_to_id,P);
 assert.equal(command(body('contacts','create',{name:'X',title:''})).data.title,null,'contact title is optional, unlike task titles');
 rejects(body('tasks','create',{title:''}),/obbligatorio/);
 rejects(body('contacts','update',{id:ID,version:1,reports_to_id:ID}),/sé stesso/);
 rejects(body('contacts','create',{name:'X',birthdate:'2999-01-01'}),/oggi/);
 rejects(body('contacts','create',{name:'X',birthdate:'1980-02-30'}),/data reale/);
 rejects(body('contacts','create',{name:'X',legal_name:'Y'}),/consentito/);
 rejects(body('companies','create',{name:'X',first_name:'Y'}),/consentito/);
});
test('API on an archive without 011: the refused field is named, not a generic error',async()=>{
 const store={membership:async()=>({role:'member'}),command:async()=>{throw Object.assign(new Error('invalid field'),{code:'22023'})}};
 const r={headers:{},setHeader(){},status(v){this.code=v;return this},json(v){this.body=v;return this}};
 await createHandler({getSessionUser:()=>({uid:1}),getStore:()=>store})({method:'POST',query:{},body:body('companies','create',{name:'X',legal_name:'Y'}),headers:{'content-type':'application/json','x-radix-sales':'1'}},r);
 assert.equal(r.code,400);assert.match(r.body.error,/ultima migrazione sales/);
});
test('store: calendar dates stay YYYY-MM-DD; the export carries the added fields only when the columns exist',async()=>{
 assert.deepEqual(normalize([{birthdate:new Date(1980,4,1),name:'X'}]),[{birthdate:'1980-05-01',name:'X'}]);
 assert.deepEqual(normalize({birthdate:'1980-05-01T00:00:00'}),{birthdate:'1980-05-01'});
 let q;const rows=[{id:ID,name:'X',company:null,added:{id:ID,name:'X',workspace_id:W,version:4,first_name:'Mario',birthdate:'1980-05-01',owner_id:null}}];
 const store=createStore(async(sql)=>{q=sql;return structuredClone(rows)});
 const out=await store.read({workspace:W,entity:'export',subject:'contacts',offset:0},1);
 assert.deepEqual(out,[{id:ID,name:'X',company:null,first_name:'Mario',birthdate:'1980-05-01',owner_id:null}]);
 assert.match(q,/to_jsonb\(t\) AS added/);assert.ok(!/t\.first_name|t\.vat_number/.test(q),'no column named in SQL: an older archive must not fail');
 const old=createStore(async()=>[{id:ID,name:'X',created_at:null,added:{id:ID,name:'X',workspace_id:W}}]);
 assert.deepEqual(await old.read({workspace:W,entity:'export',subject:'companies',offset:0},1),[{id:ID,name:'X',created_at:null}]);
});

test('migration 011: idempotent, optional columns, workspace-scoped references, versioned sales_command',()=>{
 assert.match(MIG,/^-- CRM:/);assert.match(MIG,/Applied on Neon radix-preview and radix-production/);assert.match(MIG,/\nBEGIN;\n/);assert.match(MIG,/\nCOMMIT;\n$/);
 assert.ok(!/\bDROP\b|NOT NULL DEFAULT|\bUPDATE sales_(companies|contacts)\b/i.test(MIG.replace(/CREATE OR REPLACE FUNCTION[\s\S]*\$\$;/,'')),'no destructive or backfilling statements');
 for(const [table,kind] of [['sales_companies','companies'],['sales_contacts','contacts']]){
  const block=MIG.slice(MIG.indexOf('ALTER TABLE '+table),MIG.indexOf(';',MIG.indexOf('ALTER TABLE '+table)));
  // «division» (Dipartimento) arrives with migration 014.
  const in011=F.ADDED[kind].filter(k=>k!=='division');
  for(const k of in011)assert.match(block,new RegExp('ADD COLUMN IF NOT EXISTS '+k+' '),table+'.'+k);
  assert.equal((block.match(/ADD COLUMN IF NOT EXISTS/g)||[]).length,in011.length);
 }
 assert.match(MIG,/account_type IN\('cliente','prospect','partner','fornitore','altro'\)/);assert.match(MIG,/rating IN\('calda','tiepida','fredda'\)/);
 assert.match(MIG,/annual_revenue_cents bigint CHECK\(annual_revenue_cents BETWEEN 0 AND 9000000000000000\)/);assert.match(MIG,/employees integer CHECK\(employees BETWEEN 0 AND 10000000\)/);
 assert.match(MIG,/FOREIGN KEY\(workspace_id,parent_company_id\) REFERENCES sales_companies\(workspace_id,id\) ON DELETE SET NULL \(parent_company_id\)/);
 assert.match(MIG,/FOREIGN KEY\(workspace_id,reports_to_id\) REFERENCES sales_contacts\(workspace_id,id\) ON DELETE SET NULL \(reports_to_id\)/);
 assert.equal((MIG.match(/REFERENCES sales_memberships\(workspace_id,user_id\) ON DELETE SET NULL \(owner_id\)/g)||[]).length,2);
 assert.match(MIG,/CHECK\(parent_company_id IS NULL OR parent_company_id<>id\)/);assert.match(MIG,/CHECK\(reports_to_id IS NULL OR reports_to_id<>id\)/);
 assert.equal((MIG.match(/IF NOT EXISTS\(SELECT 1 FROM pg_constraint/g)||[]).length,6);
 assert.match(MIG,/server_version_num/);
 // sales_command: the same allowlists as the API, the rest identical to 009.
 const fn=MIG.slice(MIG.indexOf('CREATE OR REPLACE FUNCTION sales_command'));
 const arr=k=>{const m=new RegExp("WHEN '"+k+"' THEN ARRAY\\[([^\\]]*)\\]").exec(fn);return m[1].match(/'[a-z_]+'/g).map(x=>x.slice(1,-1))};
 const no014=a=>a.filter(k=>k!=='division');
 assert.deepEqual(arr('companies'),no014(fields.companies));assert.deepEqual(arr('contacts'),no014(fields.contacts));
 const prev=fs.readFileSync(__dirname+'/../migrations/sales/009_crm_tickets_segments.sql','utf8');const p9=prev.slice(prev.indexOf('CREATE OR REPLACE FUNCTION sales_command'),prev.indexOf('$$;',prev.indexOf('CREATE OR REPLACE FUNCTION sales_command'))+3);
 const strip=s=>s.replace(/WHEN 'companies' THEN ARRAY\[[^\]]*\]|WHEN 'contacts' THEN ARRAY\[[^\]]*\]/g,'').replace(/\s+/g,' ');
 assert.equal(strip(fn.slice(0,fn.indexOf('$$;')+3)),strip(p9));
});

test('CSV: Italian and Salesforce headers for the new fields; values the CRM would refuse are left out with a warning',()=>{
 const p=csv.parse('Nome;Cognome;Email;Azienda;Cellulare;Telefono;Data di nascita;Qualifica;Reparto;CAP;Provincia;Origine\nMario;Rossi;m@r.it;ACME;333 1;02 1;31/12/1980;CEO;Acquisti;20100;MI;Fiera\n');
 const m=csv.mapRows('contacts',p,{extended:true});
 assert.deepEqual(m.rows,[{name:'Mario Rossi',email:'m@r.it',phone:'02 1',company:'ACME',last_name:'Rossi',title:'CEO',department:'Acquisti',mobile:'333 1',zip:'20100',province:'MI',birthdate:'1980-12-31',lead_source:'Fiera',first_name:'Mario'}]);
 assert.deepEqual(m.warnings,[]);
 assert.deepEqual(csv.mapRows('contacts',p).rows,[{name:'Mario Rossi',email:'m@r.it',phone:'333 1',company:'ACME'}],'without extended: the previous mapping');
 const c=csv.mapRows('companies',csv.parse('Account Name;Ragione sociale;VAT Number;Type;Annual Revenue;Employees;Billing City;Billing Postal Code;Città spedizione;Codice fiscale;PEC;Codice destinatario;Rating\nBeta;Beta S.r.l.;IT 12345678903;Customer;1.250.000;42;Brescia;25100;Milano;12345678903;beta@pec.it;m5uxcr1;Hot\nGamma;;12345678901;boh;tanti;-2;;;;;;;\n'),{extended:true});
 assert.deepEqual(c.rows[0],{name:'Beta',legal_name:'Beta S.r.l.',account_type:'cliente',rating:'calda',annual_revenue_cents:125000000,employees:42,billing_zip:'25100',billing_city:'Brescia',shipping_city:'Milano',vat_number:'IT12345678903',tax_code:'12345678903',pec:'beta@pec.it',sdi_code:'M5UXCR1'});
 assert.deepEqual(c.rows[1],{name:'Gamma'});
 assert.deepEqual(c.warnings.map(w=>w.field).sort(),['account_type','annual_revenue_cents','employees','vat_number']);
 assert.equal(csv.mapRows('companies',csv.parse('Ragione sociale\nSolo Ragione S.p.A.\n'),{extended:true}).rows[0].name,'Solo Ragione S.p.A.','ragione sociale alone also names the company');
 assert.equal(csv.isoDate('1.2.1980'),'1980-02-01');
});
test('CSV import and export keep working on an archive without 011',()=>{
 const src=fs.readFileSync(__dirname+'/../sales/crm-tools.js','utf8');
 assert.match(src,/mapRows\(kind,CSV\(\)\.parse\(await file\.text\(\)\),\{extended:true\}\)/);
 assert.match(src,/e\.status===400&&\/011\/\.test\(e\.message\)/,'retry without the added fields');
 assert.match(src,/CSV\(\)\.toCsv\(rows,cols\(kind,rows\)\)/,'added columns only when the rows have them');
 assert.match(src,/supported\('contacts',row\)\?\{first_name:null/,'GDPR erase clears the added personal fields when present');
});

test('list views: new optional columns, offered only when the archive has them; Contatti defaults stay narrow',()=>{
 const data={companies:[{id:'a',name:'Beta',account_type:'fornitore',vat_number:'IT12345678903',billing_city:'Brescia',city:null,owner_id:7,annual_revenue_cents:'125000000',employees:42,rating:'fredda',billing_province:'BS'}],contacts:[{id:'k',name:'Mario Rossi',company_id:'a',title:'CEO',mobile:'333',city:'Milano',owner_id:7,lead_source:'Fiera'}],members:[{id:7,name:'Marta'}]};
 const [co]=L.buildRows('companies',data,{now:0});
 assert.equal(co.accountType,'Fornitore');assert.equal(co.city,'Brescia','billing city when the head office city is empty');assert.equal(co.vat,'IT12345678903');assert.equal(co.owner,'Marta');assert.equal(co.revenue,125000000);assert.equal(co.employees,42);assert.equal(co.rating,'Fredda');
 const [k]=L.buildRows('contacts',data,{now:0});assert.equal(k.title,'CEO');assert.equal(k.mobile,'333');assert.equal(k.owner,'Marta');assert.equal(k.leadSource,'Fiera');
 const [old]=L.buildRows('companies',{companies:[{id:'b',name:'Vecchia',city:'Roma'}]},{now:0});assert.equal(old.accountType,'');assert.equal(old.revenue,null);assert.equal(old.city,'Roma');
 assert.ok(L.matches('companies',co,'12345678903'));assert.ok(L.matches('contacts',k,'ceo'));
 assert.ok(!L.columnsFor('companies',{added:false}).some(c=>['accountType','vat'].includes(c.id)));assert.ok(L.columnsFor('companies',{added:true}).some(c=>c.id==='vat'));
 const vis=L.defaults('contacts').columns;assert.ok(!vis.includes('lastAt')&&vis.length<=7);
 assert.deepEqual(L.sortRows('companies',[co,{...old,employees:null}],{key:'employees',dir:'desc'}).map(r=>r.id),['a','b']);
});
test('duplicate merge fills the added contact fields too, never first and last name',()=>{
 const keep={id:'a',name:'Mario Rossi',company_id:null,mobile:null,first_name:null},drop={id:'b',name:'M. Rossi',company_id:null,mobile:'333',city:'Milano',first_name:'M.'};
 assert.deepEqual(D.mergePlan(keep,drop,[]).fill,{mobile:'333',city:'Milano'});
});
test('page wiring: the shared field description loads before sales.js, with its stylesheet',()=>{
 const html=fs.readFileSync(__dirname+'/../radix-sales.html','utf8');
 assert.ok(html.indexOf('sales/crm-fields-core.js')>0&&html.indexOf('sales/crm-fields-core.js')<html.indexOf('sales/sales.js'));
 assert.match(html,/sales\/crm-fields\.css/);
 const js=fs.readFileSync(__dirname+'/../sales/sales.js','utf8');
 for(const s of ['Informazioni','Indirizzo di fatturazione','Indirizzo di spedizione','Dati fiscali','Altro'])assert.ok(fs.readFileSync(__dirname+'/../sales/crm-fields-core.js','utf8').includes("label:'"+s+"'"),s);
 assert.match(js,/recordSections\(entity,row,fields,references,selectControl\)/);assert.match(js,/RF\.prune\(entity,data,row\)/);
 assert.match(fs.readFileSync(__dirname+'/../sales/crm-record.js','utf8'),/E\('h3','Dettagli'\)/);
});
