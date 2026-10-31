'use strict';
// «Trova email» by company name only (LinkedIn leads without a site): the provider's domain must look like the
// company's, and the domain it found is kept on the company as its website.
const test=require('node:test'),assert=require('node:assert/strict');
const F=require('../sales/crm-email-finder-core.js');
const finder=require('../api/_sales_email_finder.js');
const W='5b1d2c3e-4f50-4a61-8b72-9c83d4e5f601';
const id=n=>'aaaaaaaa-aaaa-4aaa-8aaa-'+String(n).padStart(12,'0');

test('a domain found from the company name is accepted only when it looks like the company’s',()=>{
 assert.equal(F.companyDomainOk('contardi.it','CONTARDI LIGHTING ITALIA & CONTARDI USA'),true);
 assert.equal(F.companyDomainOk('mrcentroclima.it','MR Centro Clima Srl'),true);
 assert.equal(F.companyDomainOk('scmsim.it','SCM srl'),true,'the base may extend a word of the name');
 assert.equal(F.companyDomainOk('cdelettrica.it','CD Elettrica s.r.l Elettrotecnica industriale'),true);
 assert.equal(F.companyDomainOk('prodottigianni.com','Prodotti Gianni'),true);
 assert.equal(F.companyDomainOk('mcs.com.pr','MCS'),false,'a two-level foreign TLD is never this company');
 assert.equal(F.companyDomainOk('quark.com','Nuova Fapam'),false,'no word in common');
 assert.equal(F.companyDomainOk('gmail.com','Gmail Srl'),false,'webmail is never a company domain');
 assert.equal(F.companyDomainOk('','Acme'),false);
});

function crm(contacts){
 const db={contacts,saves:[]};
 db.sql=async(text,params)=>{const t=text.replace(/\s+/g,' ');
  if(/^SELECT email_hash FROM sales_email_suppressions/.test(t))return [];
  if(/FROM sales_segments/.test(t))return [];
  if(/FROM sales_contacts t LEFT JOIN sales_companies/.test(t))return db.contacts.filter(c=>params[1].includes(c.id)).map(c=>({...c}));
  return []};
 db.save=async(entity,data)=>{db.saves.push([entity,data]);if(entity==='contacts'){const c=db.contacts.find(x=>x.id===data.id);Object.assign(c,data,{version:c.version+1})}return {}};
 return db;
}
const C=(n,o)=>({id:id(n),version:1,notes:'',email:null,company_id:'cccccccc-cccc-4ccc-8ccc-'+String(n).padStart(12,'0'),company_version:2,company_email:null,website:null,opted_out:false,...o});
// Hunter answers by last name; the request carries company= (no domain known) or domain=.
const hunterFetch=seen=>async(url,init)=>{
 const u=new URL(url);seen.push(Object.fromEntries(u.searchParams));
 const last=u.searchParams.get('last_name');const data=
  last==='Marziali'?{email:'alessandro@mcs.com.pr',score:60,verification:{status:'valid'}}:
  last==='Carcano'?{email:'achille.carcano@contardi.it',score:95,verification:{status:'valid'}}:
  last==='Rossi'?{email:'mario.rossi@altraditta.it',score:90,verification:{status:'valid'}}:{email:null,score:null,verification:{status:null}};
 return {ok:true,status:200,json:async()=>({data})}};

test('paid Hunter by company name: incoherent domain refused, coherent one saved on the contact and as company website',async()=>{
 const db=crm([C(1,{name:'Alessandro Marziali',first_name:'Alessandro',last_name:'Marziali',company:'MCS'}),
  C(2,{name:'Achille Carcano',first_name:'Achille',last_name:'Carcano',company:'CONTARDI LIGHTING ITALIA & CONTARDI USA'}),
  C(3,{name:'Mario Rossi',first_name:'Mario',last_name:'Rossi',company:'Acme Srl',website:'https://acme.it'})]);
 const seen=[];
 const r=await finder.handle(finder.command({workspace:W,entity:'email_finder',action:'paid',data:{provider:'hunter',contacts:db.contacts.map(c=>c.id),confirm:true}}),
  {sql:db.sql,user:1,role:'member',env:{HUNTER_API_KEY:'fake-hunter-key-123'},fetch:hunterFetch(seen),save:db.save,now:Date.parse('2026-10-27T10:00:00Z')});
 assert.equal(db.contacts[0].email,null,'mcs.com.pr is not MCS: refused');
 assert.equal(db.contacts[1].email,'achille.carcano@contardi.it');
 assert.equal(db.contacts[2].email,'mario.rossi@altraditta.it','looked up by the known domain: no name check on the answer');
 assert.equal(r.saved,2);assert.equal(r.not_found,1);assert.equal(r.domains,1,'one company website learnt');
 assert.deepEqual(db.saves.find(([e])=>e==='companies'),['companies',{id:db.contacts[1].company_id,version:2,website:'https://contardi.it'}]);
 assert.ok(seen.some(q=>q.company==='MCS'&&!q.domain)&&seen.some(q=>q.domain==='acme.it'&&!q.company),'company= without a site, domain= with one');
});
