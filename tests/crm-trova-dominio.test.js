'use strict';
// «Trova email», free step for LinkedIn leads: the company domain is guessed from the company name and kept on the company.
const test=require('node:test'),assert=require('node:assert/strict');
const F=require('../sales/crm-email-finder-core.js');
const finder=require('../api/_sales_email_finder.js');
const W='5b1d2c3e-4f50-4a61-8b72-9c83d4e5f601';
const id=n=>'aaaaaaaa-aaaa-4aaa-8aaa-'+String(n).padStart(12,'0');

test('domain candidates come from the company name without legal form',()=>{
 assert.deepEqual(F.domainCandidates('Acrotecna S.r.l.'),['acrotecna.it','acrotecna.com']);
 assert.ok(F.domainCandidates('Autodemolizione Silkar Srl').includes('autodemolizionesilkar.it'));
 assert.ok(F.domainCandidates('Autodemolizione Silkar Srl').includes('autodemolizione.it'));
 assert.deepEqual(F.domainCandidates('S.p.A.'),[]);
 assert.ok(F.domainCandidates('Citterio F.lli s.n.c').length<=6);
 assert.equal(F.pageMentions('<title>Acrotecna - impianti</title>','Acrotecna S.r.l.',{domain:'acrotecna.it'}),true);
 assert.equal(F.pageMentions('<title>Quark Software</title>','Quark srl',{city:'Stradella',domain:'quark.com'}),false,'foreign TLD without city or VAT sign');
 assert.equal(F.pageMentions('<p>Quark S.r.l. - Stradella (PV)</p>','Quark srl',{city:'Stradella',domain:'quark.com'}),true);
 assert.equal(F.pageMentions('<title>Nuova casa</title>','Nuova Fapam',{domain:'nuova.it'}),false,'every distinctive word must appear');
 assert.equal(F.pageMentions('<title>Domain for sale</title>','Acrotecna S.r.l.'),false);
});

test('free step guesses the domain, keeps it on the company, then reads the site',async()=>{
 const saves=[];
 const contact={id:id(1),version:1,name:'Mario Rossi',first_name:'Mario',last_name:'Rossi',email:null,notes:'',company_id:id(9),company_version:3,company:'Acrotecna S.r.l.',website:null,company_email:null};
 const sql=async q=>/FROM sales_contacts/.test(q)?[contact]:/sales_segments/.test(q)?[]:/sales_email_suppressions/.test(q)?[]:[];
 const pages={'https://www.acrotecna.it/':'<title>Acrotecna</title>','https://www.acrotecna.it/contatti':'mario.rossi@acrotecna.it'};
 const getPage=async(url)=>pages[url]||null;
 const fetchMx=async url=>({ok:true,json:async()=>({Status:0,Answer:/acrotecna\.it/.test(url)?[{type:15,data:'10 mx.acrotecna.it.'}]:[]})});
 const r=await finder.handle({workspace:W,entity:'email_finder',action:'free',data:{contacts:[contact.id]}},{sql,user:7,role:'owner',env:{},fetch:fetchMx,getPage,save:async(e,d)=>{saves.push([e,d])}});
 assert.equal(r.domains,1);assert.equal(r.saved,1);
 assert.deepEqual(saves[0],['companies',{id:id(9),version:3,website:'https://acrotecna.it'}]);
 assert.equal(saves[1][1].email,'mario.rossi@acrotecna.it');
});

test('a guessed domain without the company name on its page is refused',async()=>{
 const saves=[];
 const contact={id:id(1),version:1,name:'Mario Rossi',first_name:'Mario',last_name:'Rossi',email:null,notes:'',company_id:id(9),company_version:3,company:'Acrotecna S.r.l.',website:null,company_email:null};
 const sql=async q=>/FROM sales_contacts/.test(q)?[contact]:[];
 const r=await finder.handle({workspace:W,entity:'email_finder',action:'free',data:{contacts:[contact.id]}},{sql,user:7,role:'owner',env:{},fetch:async()=>({ok:true,json:async()=>({Status:0,Answer:[{type:15,data:'10 mx.x.'}]})}),getPage:async()=>'<title>Parked domain</title>',save:async(e,d)=>{saves.push([e,d])}});
 assert.equal(r.not_found,1);assert.equal(saves.length,0);
});

test('a timed-out free batch does not stop the run',async()=>{
 const calls=[];
 const ids=[1,2,3,4,5,6].map(n=>({id:id(n),name:'Mario Rossi '+n,first_name:'Mario',last_name:'Rossi',email:null,company:'Acme',notes:''}));
 const api=async(action,data)=>{calls.push(data.contacts.length);if(calls.length===1)throw Object.assign(new Error('Tempo di attesa scaduto. Se era un salvataggio, verifica i dati con Aggiorna prima di riprovare.'));return {saved:1,resolved:data.contacts}};
 const r=await F.runFinder(ids,{ask:()=>true,api,configured:{},order:[]});
 assert.equal(calls.length,2,'two batches of 4 and 2');assert.equal(r.timeouts,1);assert.equal(r.free.saved,1);assert.equal(r.remaining,4);
});
