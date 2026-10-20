'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const L=require('../sales/crm-list-core.js');
const {score,explain}=require('../sales/crm-score-core.js');
const {fields}=require('../api/_sales.js');
const DAY=864e5,NOW=Date.parse('2026-10-20T10:00:00Z'),iso=n=>new Date(n).toISOString();

const data={
 companies:[
  {id:'a',name:'Àlfa Srl',industry:'Meccanica',city:'Brescia',phone:'030 123456',website:'alfa.it',created_at:iso(NOW-90*DAY)},
  {id:'b',name:'beta spa',industry:'Logistica',city:'Milano',created_at:iso(NOW-5*DAY)},
  {id:'c',name:'Gamma',created_at:iso(NOW-40*DAY)}],
 contacts:[
  {id:'k1',name:'Zoe Neri',company_id:'a',email:'zoe@alfa.it',role:'CEO',marketing_consent:true,consent_at:iso(NOW-10*DAY),created_at:iso(NOW-3*DAY)},
  {id:'k2',name:'Andrea Bianchi',company_id:'a',email:null,phone:'333 1',role:'Acquisti',marketing_consent:false,created_at:iso(NOW-60*DAY)},
  {id:'k3',name:'Marta Elia',company_id:'b',email:'m@b.it',marketing_consent:false},
  {id:'k4',name:'Senza Azienda',email:'',marketing_consent:true,created_at:iso(NOW-1*DAY)}],
 interactions:[
  {contact_id:'k1',company_id:null,kind:'call',occurred_at:iso(NOW-2*DAY)},
  {contact_id:'k1',kind:'email',occurred_at:iso(NOW-20*DAY)},
  {contact_id:null,company_id:'b',kind:'meeting',occurred_at:iso(NOW-45*DAY)},
  {opportunity_id:'o3',kind:'note',occurred_at:iso(NOW-31*DAY)},
  {contact_id:'k3',kind:'email',occurred_at:'not a date'}],
 opportunities:[
  {id:'o1',company_id:'a',contact_id:'k1',amount_cents:1500000,outcome:'open',stage_id:'s'},
  {id:'o2',company_id:'a',amount_cents:250000,outcome:null},
  {id:'o3',company_id:'c',amount_cents:900000,outcome:'won'},
  {id:'o4',company_id:'b',amount_cents:100000,outcome:'lost'}],
 stages:[{id:'s',probability:50}]
};
const ids=rows=>rows.map(r=>r.id);

test('columns only use fields the CRM stores, plus counted values',()=>{
 const stored={contacts:{company:'company_id',role:'role',email:'email',phone:'phone',consent:'marketing_consent',linkedin:'linkedin_url',title:'title',department:'department',mobile:'mobile',city:'city',owner:'owner_id',leadSource:'lead_source'},companies:{industry:'industry',city:'city',phone:'phone',website:'website',email:'email',accountType:'account_type',vat:'vat_number',legalName:'legal_name',owner:'owner_id',rating:'rating',employees:'employees',revenue:'annual_revenue_cents',province:'billing_province'}};
 const counted=new Set(['name','score','lastAt','createdAt','contacts','openValue']);
 for(const kind of L.KINDS)for(const c of L.COLUMNS[kind]){if(counted.has(c.id))continue;assert.ok(stored[kind][c.id],kind+'.'+c.id+' unmapped');assert.ok(fields[kind].includes(stored[kind][c.id]),kind+'.'+c.id+' is not a stored field')}
 // Narrow defaults: Contatti fits a 1280px screen without sideways scroll; the rest is in «Colonne».
 assert.deepEqual(L.COLUMNS.contacts.filter(c=>!c.hidden).map(c=>c.label),['Nome','Azienda','Ruolo','Email','Consenso marketing','Punteggio']);
 assert.deepEqual(L.COLUMNS.companies.filter(c=>!c.hidden).map(c=>c.label),['Nome','Tipo','Settore','Città','N. contatti','Opportunità aperte','Ultima attività']);
 assert.equal(L.columnsFor('contacts',{score:false}).some(c=>c.id==='score'),false,'no score column without crm-score-core');
});

test('contact rows: company, consent, last contact and score from the loaded rows only',()=>{
 const rows=L.buildRows('contacts',data,{now:NOW,score,explain});const k1=rows.find(r=>r.id==='k1'),k3=rows.find(r=>r.id==='k3'),k4=rows.find(r=>r.id==='k4');
 assert.equal(k1.company,'Àlfa Srl');assert.equal(k1.companyRecord.id,'a');assert.equal(k1.consent,true);
 assert.equal(k1.lastAt,NOW-2*DAY);assert.equal(k1.lastKind,'call');
 assert.equal(k1.score,score(data.contacts[0],data,NOW).total);assert.ok(k1.explain.length>0);
 assert.equal(k3.lastAt,null,'an invalid date is not a contact');assert.equal(k4.company,'');assert.equal(k4.companyRecord,null);
 assert.equal(L.buildRows('contacts',data,{now:NOW}).every(r=>r.score===null),true,'no scorer, no invented score');
 assert.deepEqual(L.buildRows('contacts',{},{now:NOW}),[]);assert.deepEqual(L.buildRows('leads',data),[]);
});

test('company rows: contacts, open deals (count and value) and last activity through contacts and deals',()=>{
 const rows=L.buildRows('companies',data,{now:NOW});const by=id=>rows.find(r=>r.id===id);
 assert.equal(by('a').contacts,2);assert.equal(by('a').openCount,2);assert.equal(by('a').openValue,1750000);
 assert.equal(by('b').openCount,0,'lost is not open');assert.equal(by('c').openCount,0,'won is not open');
 assert.equal(by('a').lastAt,NOW-2*DAY,'via its contact');assert.equal(by('b').lastAt,NOW-45*DAY,'direct');assert.equal(by('c').lastAt,NOW-31*DAY,'via its deal');
});

test('views: recent, consent, without email; open deals, idle 30 days',()=>{
 const c=L.buildRows('contacts',data,{now:NOW}),co=L.buildRows('companies',data,{now:NOW});
 const v=(kind,rows,view)=>ids(rows.filter(r=>L.inView(kind,view,r,NOW))).sort();
 assert.deepEqual(v('contacts',c,'all'),['k1','k2','k3','k4']);
 assert.deepEqual(v('contacts',c,'recent'),['k1','k4'],'no created_at is not recent');
 assert.deepEqual(v('contacts',c,'consent'),['k1','k4']);
 assert.deepEqual(v('contacts',c,'no-email'),['k2','k4']);
 assert.deepEqual(v('companies',co,'open'),['a']);
 assert.deepEqual(v('companies',co,'idle'),['b','c']);
 assert.deepEqual(L.VIEWS.contacts.map(x=>x.label),['Tutti i contatti','Creati di recente','Con consenso marketing','Senza email']);
 assert.deepEqual(L.VIEWS.companies.map(x=>x.label),['Tutte le aziende','Con opportunità aperte','Senza attività da 30 giorni']);
});

test('search ignores case and accents and needs every word',()=>{
 const c=L.buildRows('contacts',data,{now:NOW}),co=L.buildRows('companies',data,{now:NOW});
 assert.deepEqual(ids(L.apply('contacts',c,{query:'ALFA'})),['k2','k1'],'by company name, accent-free');
 assert.deepEqual(ids(L.apply('contacts',c,{query:'zoe ceo'})),['k1']);
 assert.deepEqual(ids(L.apply('contacts',c,{query:'zoe acquisti'})),[]);
 assert.deepEqual(ids(L.apply('companies',co,{query:'brescia'})),['a']);
 assert.equal(L.apply('contacts',c,{query:'  '}).length,4);
});

test('sort: Italian order, empty values last both ways, numbers and dates',()=>{
 const c=L.buildRows('contacts',data,{now:NOW}),co=L.buildRows('companies',data,{now:NOW});
 assert.deepEqual(ids(L.sortRows('contacts',c,{key:'name',dir:'asc'})),['k2','k3','k4','k1']);
 assert.deepEqual(ids(L.sortRows('contacts',c,{key:'name',dir:'desc'})),['k1','k4','k3','k2']);
 assert.deepEqual(ids(L.sortRows('companies',co,{key:'name'})),['a','b','c'],'À sorts with A, lowercase beta in place');
 assert.deepEqual(ids(L.sortRows('contacts',c,{key:'email',dir:'asc'})).slice(-2).sort(),['k2','k4'],'no email at the bottom');
 assert.deepEqual(ids(L.sortRows('contacts',c,{key:'email',dir:'desc'})).slice(-2).sort(),['k2','k4'],'still at the bottom');
 assert.deepEqual(ids(L.sortRows('contacts',c,{key:'lastAt',dir:'desc'})).slice(0,1),['k1']);
 assert.deepEqual(ids(L.sortRows('companies',co,{key:'openValue',dir:'desc'})),['a','b','c'],'no open deal ties by name, last');
 assert.deepEqual(ids(L.sortRows('contacts',c,{key:'consent',dir:'desc'})),['k4','k1','k2','k3']);
 assert.deepEqual(L.nextSort({key:'name',dir:'asc'},'name'),{key:'name',dir:'desc'});
 assert.deepEqual(L.nextSort({key:'name',dir:'asc'},'lastAt'),{key:'lastAt',dir:'desc'});
 assert.deepEqual(L.nextSort({key:'lastAt',dir:'desc'},'city'),{key:'city',dir:'asc'});
 assert.deepEqual(ids(L.apply('contacts',c,{view:'recent',sort:{key:'createdAt',dir:'desc'}},NOW)),['k4','k1']);
});

test('preferences per workspace: only known views, columns and sort keys survive',()=>{
 assert.equal(L.storageKey('ws1','contacts'),'radix-crm-list:ws1:contacts');assert.notEqual(L.storageKey('ws1','contacts'),L.storageKey('ws2','contacts'));
 assert.deepEqual(L.parse('contacts',null),L.defaults('contacts'));
 assert.deepEqual(L.parse('contacts','{bad json'),L.defaults('contacts'));
 const p=L.normalize('contacts',{view:'consent',mode:'cards',columns:['email','nope'],sort:{key:'email',dir:'desc'}});
 assert.deepEqual(p,{view:'consent',mode:'cards',columns:['name','email'],sort:{key:'email',dir:'desc'}},'name stays, unknown dropped');
 const q=L.normalize('companies',{view:'consent',mode:'x',columns:'x',sort:{key:'__proto__'}});
 assert.deepEqual(q,L.defaults('companies'));assert.equal(L.defaults('contacts').mode,'table');
 assert.deepEqual(L.toggleColumn('contacts',['name','email'],'role'),['name','role','email'],'kept in table order');
 assert.deepEqual(L.toggleColumn('contacts',['name','email'],'email'),['name']);
 assert.deepEqual(L.toggleColumn('contacts',['name','email'],'name'),['name','email'],'name cannot be hidden');
});

test('selection: select all on screen, partial state, prune, contacts of companies',()=>{
 let s=new Set();assert.equal(L.selectionState(s,['a','b']),'none');
 s=L.toggleAll(s,['a','b']);assert.deepEqual([...s],['a','b']);assert.equal(L.selectionState(s,['a','b']),'all');
 s.add('z');assert.equal(L.selectionState(s,['a','b','c']),'some');
 s=L.toggleAll(s,['a','b']);assert.deepEqual([...s],['z'],'unselects only the rows on screen');
 assert.deepEqual([...L.prune(new Set(['a','x']),['a','b'])],['a']);
 assert.equal(L.selectionState(new Set(['a']),[]),'none');
 assert.deepEqual(L.contactsOf(['a'],data.contacts),['k1','k2']);
});

test('links: http(s) sites only, plausible email, phone with digits; relative days',()=>{
 assert.equal(L.websiteHref('alfa.it'),'https://alfa.it/');assert.equal(L.websiteHref('http://x.it/a'),'http://x.it/a');
 for(const bad of ['javascript:alert(1)','data:text/html,x','ftp://x.it','localhost','a b.it','',null])assert.equal(L.websiteHref(bad),null,String(bad));
 assert.equal(L.mailHref('a@b.it'),'mailto:a@b.it');assert.equal(L.mailHref('nope'),null);
 assert.equal(L.telHref('+39 030 12 34'),'tel:+390301234');assert.equal(L.telHref('n/d'),null);
 assert.equal(L.ago(NOW-1000,NOW),'oggi');assert.equal(L.ago(NOW-DAY-1,NOW),'ieri');assert.equal(L.ago(NOW-12*DAY,NOW),'12 g fa');assert.equal(L.ago(null,NOW),'');
 assert.match(L.ago(NOW-400*DAY,NOW),/^\d{2}\/\d{2}\/\d{4}$/);
});

test('page wiring: assets in the head in order, writes through sales.js, storage guarded, no sends',()=>{
 const html=fs.readFileSync(__dirname+'/../radix-sales.html','utf8');
 const at=s=>{const i=html.indexOf(s);assert.ok(i>0,s+' missing');return i};
 assert.ok(at('href="sales/crm-home.css"')<at('href="sales/crm-list.css"'));assert.ok(at('href="sales/crm-list.css"')<at('<script'));
 assert.ok(at('src="sales/crm-score-core.js"')<at('src="sales/crm-list-core.js"'));
 assert.ok(at('src="sales/crm-tools.js"')<at('src="sales/crm-list-core.js"')&&at('src="sales/crm-list-core.js"')<at('src="sales/crm-list.js"'));
 for(const f of ['crm-list.css','crm-list-core.js','crm-list.js"'])assert.equal(html.split(f).length,2,f+' once');
 const ui=fs.readFileSync(__dirname+'/../sales/crm-list.js','utf8');
 assert.ok(!/fetch\(/.test(ui),'no own requests');assert.ok(!/send-email|confirm:true/.test(ui),'never sends');
 assert.match(ui,/a\.edit\(kind,r\.record\)/);assert.match(ui,/a\.remove\(kind,r\.record\)/);assert.match(ui,/openCustomer\(/);
 assert.match(ui,/try\{raw=localStorage\.getItem/);assert.match(ui,/try\{localStorage\.setItem/);
 assert.match(ui,/RadixCrmCampaigns\.panel\(/);assert.match(ui,/RadixCrmTools\.exportCsv\(/);
 const sales=fs.readFileSync(__dirname+'/../sales/sales.js','utf8');
 assert.match(sales,/edit:\(e,r\)=>openEditor\(e,r\),remove:\(e,r\)=>removeRecord\(e,r\)/);
 assert.match(sales,/button\('Elimina',\(\)=>removeRecord\(entity,row\),'danger'\)/,'cards and list share one delete');
 assert.match(fs.readFileSync(__dirname+'/../sales/crm-tools.js','utf8'),/exportCsv:\(kind,filter\)=>exportCsv\(kind,filter\)/);
 const css=fs.readFileSync(__dirname+'/../sales/crm-list.css','utf8');
 assert.match(css,/\.lv-scroll\{overflow-x:auto/);assert.ok(!/#[0-9a-f]{3,8}\b/i.test(css.replace(/\/\*[\s\S]*?\*\//g,'').replace(/#(contacts|companies)\b/g,'')),'only --crm-* tokens');
});
