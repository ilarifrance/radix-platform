'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const C=require('../sales/lead-bulk-crm-core');
const {fields,command}=require('../api/_sales');
const W='11111111-1111-4111-8111-111111111111';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const OPP={entity:'opportunities',process_id:id(900),stage_id:id(901)};
// Record shape written by the LinkedIn local agent backup (lib/lead-contact-batches.js).
const agent=(o)=>({fullName:'',firstName:'',lastName:'',jobTitle:'',companyName:'',companyDomain:'',profileUrl:'',companyUrl:'',email:'',phone:'',location:'',country:'',industry:'',companySize:'',sourceUrl:'https://www.linkedin.com/sales/search/people?query=x',...o});

test('normalizers: company legal suffixes, person order, email and domain',()=>{
 assert.equal(C.companyKey('Svicom S.p.A. Società Benefit'),'svicom');
 assert.equal(C.companyKey('Decorluxe S.r.l.'),C.companyKey('decorluxe'));
 assert.equal(C.personKey('LAURA TESTA'),C.personKey('Testa Laura'));
 assert.equal(C.email(' Roberto.G@Phitogenspa.IT '),'roberto.g@phitogenspa.it');
 assert.equal(C.email('non-una-mail'),'');
 assert.equal(C.domain('https://www.mocainteractive.com/chi-siamo'),'mocainteractive.com');
});

test('local agent contact maps to CRM company and contact columns that exist',()=>{
 const l=C.fromContact(agent({fullName:'Roberto Gabrielli',jobTitle:'Chief Executive Officer',companyName:'Phitogen Beauty Labs',email:'roberto.gabrielli@phitogenspa.it',phone:'+39 02 1234567',profileUrl:'https://www.linkedin.com/in/roberto-gabrielli',industry:'Cosmetica',location:'Milano'}),0);
 assert.equal(l.domain,'phitogenspa.it');assert.equal(l.sourceLabel,'LinkedIn Sales Navigator');
 const co=C.companyPayload(l),ct=C.contactPayload(l,'Cosmetica Nord');
 assert.deepEqual(Object.keys(co).sort(),['industry','name','notes','website']);
 assert.equal(co.website,'https://phitogenspa.it');
 for(const k of Object.keys(co))assert.ok(fields.companies.includes(k),k);
 for(const k of Object.keys(ct))assert.ok(fields.contacts.includes(k),k);
 assert.equal(ct.email,'roberto.gabrielli@phitogenspa.it');assert.equal(ct.role,'Titolare / CEO');assert.equal(ct.title,'Chief Executive Officer');assert.equal(co.industry,'Chimica e farmaceutica');assert.equal(ct.linkedin_url,'https://www.linkedin.com/in/roberto-gabrielli');
 assert.match(ct.notes,/Segmento: Cosmetica Nord/);
 // The real server validator accepts both payloads.
 assert.doesNotThrow(()=>command({workspace:W,entity:'companies',action:'create',data:co}));
 assert.doesNotThrow(()=>command({workspace:W,entity:'contacts',action:'create',data:{...ct,company_id:id(1)}}));
});

test('free-mail addresses never become a company domain; invalid email is kept only in notes',()=>{
 const l=C.fromContact(agent({fullName:'Ada Neri',companyName:'Neri Srl',email:'ada@gmail.com'}),0);
 assert.equal(l.domain,'');
 const bad=C.fromContact(agent({fullName:'Bea',companyName:'X',email:'bea@'}),1),ct=C.contactPayload(bad);
 assert.equal(ct.email,undefined);assert.match(ct.notes,/Email non valida nel file: bea@/);
});

test('CSV prospect with human-approved contact uses the reviewed name and verified email',()=>{
 const p={name:'Alfa S.p.A.',domain:'alfa.it',country:'Italia',industry:'Packaging',companySize:'PMI',contactRole:'CEO',source:'https://alfa.it'};
 const l=C.fromProspect(p,3,{contact:'Mario Rossi',email:'mario@alfa.it'});
 assert.equal(l.name,'Mario Rossi');assert.equal(l.email,'mario@alfa.it');assert.equal(l.verified,true);assert.equal(l.role,'CEO');assert.equal(l.sourceLabel,'Lista importata');
 const bare=C.fromProspect(p,4,null);assert.equal(bare.name,'');assert.equal(bare.verified,false);
});

test('dedupe: email first, then LinkedIn, then person name inside the matched company',()=>{
 const crm={companies:[{id:id(1),name:'Phitogen Beauty Labs S.r.l.',website:'https://www.phitogenspa.it'},{id:id(2),name:'Decorluxe'}],
  contacts:[{id:id(11),name:'Roberto G.',email:'Roberto.Gabrielli@phitogenspa.it',company_id:id(1)},{id:id(12),name:'Manuel Giazzon',company_id:id(2)},{id:id(13),name:'Andrea S',linkedin_url:'https://it.linkedin.com/in/andrea-sportillo/'}],
  leads:[{id:id(21),contact_id:id(11),company_id:id(1)}],opportunities:[]};
 const ix=C.indexCrm(crm);
 const leads=[
  agent({fullName:'Roberto Gabrielli',companyName:'Phitogen',email:'roberto.gabrielli@phitogenspa.it'}),
  agent({fullName:'Giazzon Manuel',companyName:'Decorluxe S.r.l.'}),
  agent({fullName:'Andrea Sportillo',companyName:'Moca',profileUrl:'https://www.linkedin.com/in/andrea-sportillo?trk=x'}),
  agent({fullName:'Letizia Cantini',companyName:'Svicom S.p.A. Società Benefit',email:'letizia.cantini@svicom.com'}),
  agent({fullName:'Paolo Verdi',companyName:'Svicom',email:'paolo@svicom.com'}),
  agent({fullName:'Letizia Cantini',companyName:'Svicom',email:'LETIZIA.CANTINI@svicom.com'}),
  agent({fullName:'',companyName:''})
 ].map(C.fromContact);
 assert.equal(C.inCrm(leads[0],ix),true);assert.equal(C.inCrm(leads[1],ix),true);assert.equal(C.inCrm(leads[3],ix),false);
 const p=C.plan(leads,ix,OPP,new Map()),s=p.items.map(x=>x.state);
 assert.deepEqual(s,['exists','todo','todo','todo','todo','skip','skip']);
 assert.deepEqual(p.items[1].contact,{id:id(12),existing:true});assert.ok(p.items[1].deal.create);
 assert.equal(p.items[2].contact.id,id(13));assert.ok(p.items[2].company.ref,'Moca is a new company');
 // Two Svicom people share ONE new company.
 assert.equal(p.items[3].company.ref,p.items[4].company.ref);
 assert.equal(p.items[5].reason,'Doppione nella lista');assert.equal(p.items[6].reason,'Mancano nome e azienda');
 assert.deepEqual(C.preview(p),{leads:4,companies:2,contacts:2,deals:4,existing:1,skipped:2});
});

test('company-only prospect: company reused, lead skipped when a company deal already exists',()=>{
 const ix=C.indexCrm({companies:[{id:id(1),name:'Beta Packaging',website:'beta.example'}],contacts:[],leads:[{id:id(5),company_id:id(1),contact_id:null}],opportunities:[]});
 const p=C.plan([C.fromProspect({name:'Beta Packaging Srl',domain:'beta.example'},0)],ix,{entity:'leads'});
 assert.equal(p.items[0].state,'exists');
 const q=C.plan([C.fromProspect({name:'Gamma',domain:''},0)],ix,{entity:'leads'});
 assert.equal(q.items[0].contact,null);assert.ok(q.items[0].company.ref);assert.equal(q.items[0].deal.create.entity,'leads');
 assert.throws(()=>C.plan([],ix,{entity:'opportunities'}),/Scegli/);
});

test('run creates company, contact and opportunity in the first stage, linking ids',async()=>{
 const calls=[];let n=100;const api={create:async(entity,data)=>{calls.push([entity,data]);return id(++n)}};
 const leads=[agent({fullName:'Letizia Cantini',jobTitle:'CEO',companyName:'Svicom',email:'letizia@svicom.com'}),agent({fullName:'Paolo Verdi',companyName:'Svicom',email:'paolo@svicom.com'})].map(C.fromContact);
 const p=C.plan(leads,C.indexCrm({}),OPP,new Map()),progress=[];
 const r=await C.run(p,api,{batch:1,onProgress:x=>progress.push(x)});
 assert.equal(r.stopped,null);
 assert.deepEqual(calls.map(c=>c[0]),['companies','contacts','opportunities','contacts','opportunities']);
 assert.equal(calls[1][1].company_id,id(101));
 assert.deepEqual({...calls[2][1]},{title:'Letizia Cantini · Svicom',process_id:id(900),stage_id:id(901),company_id:id(101),contact_id:id(102)});
 for(const [entity,data] of calls)assert.doesNotThrow(()=>command({workspace:W,entity,action:'create',data}),entity);
 assert.deepEqual(progress.at(-1),{done:2,total:2});
 const s=C.summary(p);assert.equal(s.companies,1);assert.equal(s.contacts,2);assert.equal(s.deals,2);assert.equal(s.pending,0);
});

test('run stops at the first server error and resumes without repeating finished steps',async()=>{
 let n=200,fail=true;const calls=[];
 const api={create:async(entity,data)=>{calls.push(entity);if(entity==='contacts'&&data.name==='B'&&fail)throw Error('Email non valida.');return id(++n)}};
 const leads=['A','B','C'].map(x=>C.fromContact(agent({fullName:x,companyName:'Co '+x}),0));
 const p=C.plan(leads,C.indexCrm({}),{entity:'leads'});
 const r=await C.run(p,api,{batch:10});
 assert.equal(r.stopped,'error');assert.equal(r.error,'Email non valida.');
 assert.deepEqual(p.items.map(x=>x.state),['done','error','todo']);
 assert.equal(C.summary(p).failed[0].reason,'Email non valida.');
 fail=false;calls.length=0;
 assert.equal((await C.run(p,api)).stopped,null);
 // Company of B was already created before the error: not created again.
 assert.deepEqual(calls,['contacts','leads','companies','contacts','leads']);
 assert.deepEqual(p.items.map(x=>x.state),['done','done','done']);
});

test('run honours a stop request between batches',async()=>{
 const api={create:async()=>id(1)};
 const leads=Array.from({length:25},(_,i)=>C.fromContact(agent({fullName:'P'+i,companyName:'C'+i}),i));
 const p=C.plan(leads,C.indexCrm({}),{entity:'leads'});
 const r=await C.run(p,api,{batch:10,shouldStop:()=>true});
 assert.equal(r.stopped,'user');assert.equal(C.progress?C.progress(p).done:p.items.filter(x=>x.state==='done').length,10);
});

test('pipelines picks the lowest-position stage of each opportunity process',()=>{
 const r=C.pipelines([{id:'p1',title:'Vendite',kind:'opportunity'},{id:'p2',title:'Task',kind:'task'},{id:'p3',title:'Vuota',kind:'opportunity'}],[{id:'s2',process_id:'p1',position:2,title:'Offerta'},{id:'s1',process_id:'p1',position:0,title:'Nuovo'},{id:'t',process_id:'p2',position:0,title:'x'}]);
 assert.deepEqual(r,[{process_id:'p1',stage_id:'s1',title:'Vendite',stage:'Nuovo'}]);
});

test('CSV export neutralises spreadsheet formulas',()=>{
 const csv=C.toCsv([{name:'=HYPERLINK("x")',email:'a@b.it',company:'Alfa'}]);
 assert.match(csv,/"'=HYPERLINK\(""x""\)"/);assert.ok(csv.startsWith('﻿"nome";"email"'));
});

test('CSV parser keeps optional person columns only when the file has them',()=>{
 const {parseCsv}=require('../lib/lead-csv-parser');
 const [a]=parseCsv('First Name,Last Name,Company,Title,Email,Profile URL\nLaura,Testa,Custom S.p.A.,Manager,laura@custom.it,https://www.linkedin.com/in/laura');
 assert.deepEqual(a,{name:'Custom S.p.A.',domain:'',country:'',industry:'',companySize:'',contactRole:'Manager',source:'https://www.linkedin.com/in/laura',firstName:'Laura',lastName:'Testa',email:'laura@custom.it',profileUrl:'https://www.linkedin.com/in/laura'});
 const l=C.fromProspect(a,0,null);assert.equal(l.name,'Laura Testa');assert.equal(l.domain,'custom.it');assert.equal(l.linkedin,'https://www.linkedin.com/in/laura');
 assert.deepEqual(Object.keys(parseCsv('name,domain\nAlfa,alfa.it')[0]),['name','domain','country','industry','companySize','contactRole','source']);
});

test('page wires the bulk flow through the existing /api/sales commands',()=>{
 const html=fs.readFileSync('lead-intelligence.html','utf8'),js=fs.readFileSync('sales/lead-pipeline.js','utf8');
 assert.ok(html.indexOf('src="/sales/lead-bulk-crm-core.js"')<html.indexOf('src="/sales/lead-pipeline.js"'));
 for(const x of ['lead-pipeline','lp-rows','lp-search','lp-source','lp-status','lp-segment','lp-crm','bulk-crm','bulk-run','bulk-summary','lp-total','lp-incrm','lp-email','lp-contacted'])assert.ok(html.includes('id="'+x+'"'),x);
 assert.match(js,/'x-radix-sales':'1'/);assert.match(js,/action:'create'/);assert.match(js,/credentials:'same-origin'/);
 assert.doesNotMatch(js,/localStorage|sessionStorage/);
 assert.doesNotMatch(html,/<script>(?!<\/script>)/);
});
