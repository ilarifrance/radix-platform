'use strict';
// «Trova email»: free sources first, then paid providers (Hunter, Apollo, Dropcontact) on fake local servers.
// No real calls, no real keys: every key here is a throwaway string, every endpoint is 127.0.0.1.
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const P=require('../sales/crm-prospecting-core.js');
const F=require('../sales/crm-email-finder-core.js');
const finder=require('../api/_sales_email_finder.js');
const reserved=require('../api/_sales_reserved.js');
const W='5b1d2c3e-4f50-4a61-8b72-9c83d4e5f601';
const id=n=>'aaaaaaaa-aaaa-4aaa-8aaa-'+String(n).padStart(12,'0');
const KEYS={HUNTER_API_KEY:'fake-hunter-key-123',APOLLO_API_KEY:'fake-apollo-key-456',DROPCONTACT_API_KEY:'fake-dropcontact-key-789'};

test('free step rules: domain, published addresses, person match, company pattern, SSRF guard',()=>{
 assert.equal(F.domainOf('https://www.acme.it/chi-siamo'),'acme.it');assert.equal(F.domainOf('acme.it'),'acme.it');assert.equal(F.domainOf('info@acme.it'),'acme.it');
 assert.equal(F.domainOf('https://gmail.com'),null,'webmail is not a company domain');assert.equal(F.domainOf('http://127.0.0.1'),null);
 const html='<a href="mailto:Mario.Rossi@acme.it">scrivi</a> info&#64;acme.it, l.bianchi [at] acme.it · amministrazione@acme.it · logo@2x.png · altro@other.com · ufficio(at)acme(dot)it';
 const found=F.extractEmails(html,'acme.it').sort();
 assert.deepEqual(found,['amministrazione@acme.it','info@acme.it','l.bianchi@acme.it','mario.rossi@acme.it','ufficio@acme.it']);
 assert.equal(F.personalMatch(found,{name:'Mario Rossi'}),'mario.rossi@acme.it');
 assert.equal(F.personalMatch(found,{name:'Ufficio Acme'}),null,'a generic mailbox never matches a person');
 assert.equal(F.personalMatch(['m.rossi@acme.it'],{first_name:'Mario',last_name:'Rossi'}),'m.rossi@acme.it');
 assert.equal(F.personalMatch(['giulia.derossi@acme.it'],{name:'Giulia De Rossi'}),'giulia.derossi@acme.it','double surname');
 assert.equal(F.detectPattern(['luca.verdi@acme.it','info@acme.it','anna.neri@acme.it']),'{f}.{l}');
 assert.equal(F.detectPattern(['l.verdi@acme.it']),'{fi}.{l}');
 assert.equal(F.detectPattern(['info@acme.it','commerciale@acme.it']),null,'generic ones say nothing about people');
 assert.equal(F.detectPattern(['l.verdi@acme.it','anna.neri@acme.it']),null,'two shapes: no guess');
 assert.equal(F.applyPattern('{f}.{l}',{name:'Màrio D’Àngelo'},'acme.it'),'mario.dangelo@acme.it');
 for(const ip of ['127.0.0.1','10.1.2.3','192.168.1.1','172.20.0.1','169.254.169.254','100.64.0.1','0.0.0.0','::1','fd00::1','fe80::1','::ffff:127.0.0.1'])assert.ok(F.privateIp(ip),ip);
 for(const ip of ['93.184.216.34','2606:4700::1111'])assert.equal(F.privateIp(ip),false,ip);
});

test('order of the paid services: reserved row «__trova_email__», defaults, states',()=>{
 assert.deepEqual(F.DEFAULT_ORDER,['hunter','apollo','captaindata','dropcontact']);
 assert.equal(reserved.bySubject('email_finder'),'__trova_email__');
 assert.equal(reserved.filtersError({email_finder:{order:['dropcontact','hunter']}}),null);
 assert.match(reserved.filtersError({email_finder:{order:['hunter','hunter']}}),/non valido/);
 assert.match(reserved.filtersError({email_finder:{order:['free']}}),/non valido/,'the free step is always first, not orderable');
 assert.deepEqual(F.orderOf({filters:{email_finder:{order:['dropcontact']}}}),['dropcontact']);
 assert.deepEqual(F.orderOf(null),F.DEFAULT_ORDER);
 const ch=F.chain(['dropcontact','hunter','captaindata'],{hunter:true,dropcontact:false});
 assert.deepEqual(ch.map(p=>[p.id,p.state]),[['dropcontact','da collegare'],['hunter','pronto'],['captaindata','non disponibile'],['apollo','spento']]);
});

test('confirm gates: nothing is sent before the first OK, no paid provider before the second',async()=>{
 const people=[{id:id(1),name:'Mario Rossi',company:'Acme'},{id:id(2),name:'Lucia Verdi',company:'Beta'},{id:id(3),name:'Già Email',company:'X',email:'g@x.it'}];
 const calls=[],asked=[];
 const api=async(action,data)=>{calls.push([action,data]);if(action==='free')return {saved:1,resolved:[id(1)]};if(action==='paid')return {saved:1,resolved:data.contacts};return {}};
 const opts=answers=>({ask:t=>{asked.push(t);return answers.shift()},api,configured:{hunter:true,dropcontact:true},order:['hunter','dropcontact'],wait:async()=>{}});
 let r=await F.runFinder(people,opts([false]));
 assert.equal(r.reason,'cancelled');assert.equal(calls.length,0,'cancel = no request at all');
 assert.match(asked[0],/2 contatti/);assert.match(asked[0],/fonti gratuite/);assert.match(asked[0],/Hunter \(1 credito Hunter/);assert.match(asked[0],/1 hanno già un’email/);assert.match(asked[0],/mai info@/);
 r=await F.runFinder(people,opts([true,false]));
 assert.equal(r.reason,'paid-cancelled');assert.deepEqual(calls.map(c=>c[0]),['free'],'free step only');assert.deepEqual(calls[0][1],{contacts:[id(1),id(2)],confirm:true});
 assert.match(asked[2],/non hanno trovato un indirizzo buono per 1 contatto/);assert.match(asked[2],/Hunter: al massimo 1 ricerche/);
 calls.length=0;r=await F.runFinder(people,opts([true,true]));
 assert.deepEqual(calls.map(c=>c[0]+':'+(c[1].provider||'')),['free:','paid:hunter'],'stops at the first good result: Dropcontact not called');
 assert.deepEqual(calls[1][1],{provider:'hunter',contacts:[id(2)],confirm:true});assert.equal(r.remaining,0);
 // Server side: the same gates.
 assert.throws(()=>finder.command({workspace:W,entity:'email_finder',action:'free',data:{contacts:[id(1)]}}),/non confermata/);
 assert.throws(()=>finder.command({workspace:W,entity:'email_finder',action:'paid',data:{provider:'hunter',contacts:[id(1)]}}),/a pagamento non confermata/);
 assert.throws(()=>finder.command({workspace:W,entity:'email_finder',action:'paid',data:{provider:'free',contacts:[id(1)],confirm:true}}),/Servizio non valido/);
 assert.throws(()=>finder.command({workspace:W,entity:'email_finder',action:'paid',data:{provider:'hunter',contacts:Array.from({length:11},(_,i)=>id(i)),confirm:true}}),/da 1 a 10/);
 assert.equal(finder.command({workspace:W,entity:'email_finder',action:'paid',data:{provider:'dropcontact',contacts:Array.from({length:250},(_,i)=>id(i)),confirm:true}}).data.contacts.length,250);
});

// ---- server, with fake providers on 127.0.0.1 ----
function fakeProvider(){
 const seen=[];
 const srv=http.createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{
  const u=new URL(req.url,'http://x'),j=(code,o)=>{res.writeHead(code,{'content-type':'application/json'});res.end(JSON.stringify(o))};
  seen.push({method:req.method,path:u.pathname,q:Object.fromEntries(u.searchParams),headers:req.headers,body});
  if(u.pathname==='/dns-query'){const d=u.searchParams.get('name');return j(200,d==='nomail.it'?{Status:0,Answer:[]}:{Status:0,Answer:[{type:15,data:'10 mx.'+d+'.'}]})}
  if(u.pathname==='/v2/email-finder'){
   if(req.headers['x-api-key']!==KEYS.HUNTER_API_KEY)return j(401,{errors:[{id:'authentication_failed'}]});
   const last=u.searchParams.get('last_name');
   if(last==='Generico')return j(200,{data:{email:'info@zeta.it',score:99,verification:{status:'valid'}}});
   if(last==='Verdi')return j(200,{data:{email:'lucia.verdi@beta.it',score:97,verification:{status:'valid'}}});
   if(last==='Catch')return j(200,{data:{email:'c.catch@kappa.it',score:70,verification:{status:'accept_all'}}});
   return j(200,{data:{email:null,score:null,verification:{status:null}}});
  }
  if(u.pathname==='/api/v1/people/match'){
   if(req.headers['x-api-key']!==KEYS.APOLLO_API_KEY)return j(401,{error:'invalid'});
   const last=u.searchParams.get('last_name');
   if(last==='Catch')return j(200,{person:{email:'carla.catch@kappa.it',email_status:'verified'}});
   if(last==='Bloccato')return j(200,{person:{email:'email_not_unlocked@domain.com',email_status:'verified'}});
   return j(200,{person:null});
  }
  if(u.pathname==='/v1/enrich/all'&&req.method==='POST'){if(req.headers['x-access-token']!==KEYS.DROPCONTACT_API_KEY)return j(401,{error:true});return j(200,{error:false,success:true,request_id:'req_123',credits_left:99})}
  if(u.pathname==='/v1/enrich/all/req_123'){
   const sent=JSON.parse(seen.find(s=>s.path==='/v1/enrich/all'&&s.method==='POST').body);
   if(seen.filter(s=>s.path==='/v1/enrich/all/req_123').length===1)return j(200,{error:false,success:false,reason:'Request not ready yet, try again in 30 seconds'});
   return j(200,{error:false,success:true,data:sent.data.map(x=>({...x,email:x.last_name==='Solo'?[{email:'contact@omega.it',qualification:'generic@pro'}]:[{email:'contact@omega.it',qualification:'generic@pro'},{email:(x.first_name||'x').toLowerCase()+'@omega.it',qualification:'nominative@pro'}]}))});
  }
  j(404,{});
 })});
 return new Promise(r=>srv.listen(0,'127.0.0.1',()=>r({srv,seen,base:'http://127.0.0.1:'+srv.address().port})));
}
function fakeCrm(contacts,{order=null,suppressed=[]}={}){
 const db={contacts,saves:[],audit:[],suppressed:new Set(suppressed)};
 db.sql=async(text,params)=>{const t=text.replace(/\s+/g,' ');
  // «Indirizzi disiscritti» (017): hashes in, the hashes on the list out.
  if(/^SELECT email_hash FROM sales_email_suppressions/.test(t))return params[1].filter(h=>db.suppressed.has(h)).map(email_hash=>({email_hash}));
  if(/FROM sales_segments/.test(t))return order?[{filters:{email_finder:{order}}}]:[];
  if(/FROM sales_contacts t LEFT JOIN sales_companies/.test(t))return db.contacts.filter(c=>params[1].includes(c.id)).map(c=>({...c}));
  if(/^INSERT INTO sales_audit/.test(t)){db.audit.push(params);return []}
  throw new Error('unexpected '+t.slice(0,60));
 };
 db.save=async(entity,data)=>{db.saves.push([entity,data]);if(entity==='contacts'){const c=db.contacts.find(x=>x.id===data.id);Object.assign(c,data,{version:c.version+1})}return {}};
 return db;
}
const site={
 'acme.it':'<p>Contatti: <a href="mailto:mario.rossi@acme.it">Mario</a>, anna.neri@acme.it, info@acme.it</p>',
 'beta.it':'<p>Scrivici a luca.bianchi@beta.it o amministrazione@beta.it</p>',
 'zeta.it':'<p>info@zeta.it — commerciale@zeta.it</p>',
 'nomail.it':'<p>paolo.rossi@nomail.it</p>'};
const getPage=async(url,domain)=>{const u=new URL(url);return u.pathname==='/contatti'?site[domain]||null:u.pathname==='/'?'<html>home</html>':null};
const C=(n,o)=>({id:id(n),version:1,notes:'',email:null,company_id:'cccccccc-cccc-4ccc-8ccc-'+String(n).padStart(12,'0'),company_version:1,company_email:null,opted_out:false,...o});

test('server: free step saves the person’s published address, guesses from the pattern, never a generic one',async()=>{
 const f=await fakeProvider();
 try{
  const db=fakeCrm([C(1,{name:'Mario Rossi',company:'Acme',website:'https://www.acme.it'}),C(2,{name:'Lucia Verdi',company:'Beta',website:'beta.it'}),C(3,{name:'Ugo Generico',company:'Zeta',website:'zeta.it'}),C(4,{name:'Rita Bianca',company:'NoMail',website:'nomail.it'}),C(5,{name:'Senza Sito',company:'Nulla'})]);
  const env={DNS_OVER_HTTPS_URL:f.base+'/dns-query'};
  const r=await finder.handle(finder.command({workspace:W,entity:'email_finder',action:'free',data:{contacts:db.contacts.map(c=>c.id),confirm:true}}),{sql:db.sql,user:1,role:'member',env,fetch,getPage,save:db.save,now:Date.parse('2026-10-23T10:00:00Z')});
  assert.equal(r.saved,1);assert.deepEqual(r.resolved,[id(1)],'only a published personal address resolves a contact');
  assert.equal(r.guessed,1);assert.equal(r.not_found,3);
  const mario=db.contacts[0];assert.equal(mario.email,'mario.rossi@acme.it');
  assert.equal(mario.notes,'Email trovata con sito aziendale il 23/10/2026 (qualifica: pubblicata sul sito): mario.rossi@acme.it');
  const lucia=db.contacts[1];assert.equal(lucia.email,'lucia.verdi@beta.it');assert.equal(P.qualificationOf(lucia),'da verificare');
  assert.equal(P.b2bReason(lucia,{step:0}),'unverified','a guessed address stays out of campaigns by default');
  assert.equal(db.contacts[2].email,null,'Zeta publishes only generic mailboxes: no hit for the person');
  assert.ok(db.saves.some(([e,d])=>e==='companies'&&d.email==='info@zeta.it'),'the generic one goes on the company');
  assert.equal(db.contacts[3].email,null,'no MX: no guess');
  assert.ok(!db.saves.some(([e,d])=>e==='contacts'&&P.genericEmail(d.email)),'never a generic address on a contact');
 }finally{f.srv.close()}
});

test('server: paid chain — Hunter, Apollo, Dropcontact on fake servers; generic = not found; keys only in headers',async()=>{
 const f=await fakeProvider();
 try{
  const env={...KEYS,HUNTER_API_BASE:f.base,APOLLO_API_BASE:f.base,DROPCONTACT_API_BASE:f.base};
  const db=fakeCrm([C(1,{name:'Lucia Verdi',company:'Beta'}),C(2,{name:'Ugo Generico',company:'Zeta'}),C(3,{name:'Carla Catch',company:'Kappa'}),C(4,{name:'Omar Solo',company:'Omega'}),C(5,{name:'Pia Bloccato',company:'Omega'}),
   C(6,{name:'Già Fatto',company:'X',email:'gia.fatto@x.it'}),C(7,{name:'Dino Dubbio',company:'Y',email:'dino@y.it',notes:P.finderNote(0,'da verificare','dino@y.it','schema del sito aziendale')})]);
  const opts={sql:db.sql,user:1,role:'member',env,fetch,save:db.save,now:Date.parse('2026-10-23T10:00:00Z')};
  const cmd=(provider,ids)=>finder.command({workspace:W,entity:'email_finder',action:'paid',data:{provider,contacts:ids,confirm:true}});
  let r=await finder.handle(cmd('hunter',db.contacts.map(c=>c.id)),opts);
  assert.equal(r.saved,1);assert.deepEqual(r.resolved,[id(1)]);assert.equal(db.contacts[0].email,'lucia.verdi@beta.it');assert.equal(P.qualificationOf(db.contacts[0]),'verificata');
  assert.equal(db.contacts[1].email,null,'Hunter returned info@: not a hit');assert.equal(db.contacts[2].email,'c.catch@kappa.it','catch-all kept as better than nothing');assert.equal(r.guessed,1);
  const hunterCalls=f.seen.filter(s=>s.path==='/v2/email-finder');
  assert.equal(hunterCalls.length,6,'already-good contact (manual email) never sent to a paid service; «da verificare» one is');
  assert.ok(hunterCalls.every(s=>!s.q.api_key&&s.headers['x-api-key']===KEYS.HUNTER_API_KEY),'key in the header, not in the URL');
  r=await finder.handle(cmd('apollo',[id(2),id(3),id(5)]),opts);
  assert.equal(db.contacts[2].email,'carla.catch@kappa.it');assert.equal(P.qualificationOf(db.contacts[2]),'verificata','a verified address replaces a catch-all');
  assert.equal(db.contacts[4].email,null,'Apollo placeholder for locked emails is ignored');
  const ap=f.seen.find(s=>s.path==='/api/v1/people/match');assert.equal(ap.q.reveal_personal_emails,'false');assert.equal(ap.q.organization_name,'Zeta');
  r=await finder.handle(cmd('dropcontact',[id(2),id(4),id(5)]),opts);
  assert.equal(r.request_id,'req_123');assert.equal(r.sent,3);assert.equal(db.audit.length,1);
  const sent=JSON.parse(f.seen.find(s=>s.path==='/v1/enrich/all').body);
  assert.deepEqual(sent.data[0].custom_fields,{radix_workspace:W,radix_contact:id(2)});assert.equal(sent.data[0].company,'Zeta');
  const res=c=>finder.handle(finder.command({workspace:W,entity:'email_finder',action:'result',data:{provider:'dropcontact',request_id:'req_123'}}),opts);
  assert.deepEqual(await res(),{ready:false,message:'Request not ready yet, try again in 30 seconds'});
  r=await res();
  assert.equal(r.ready,true);assert.equal(r.saved,2);assert.equal(r.not_found,1,'Omar: only generic@pro → not found');
  assert.equal(db.contacts[1].email,'ugo@omega.it');assert.equal(db.contacts[3].email,null);
  assert.match(db.contacts[1].notes,/Email trovata con Dropcontact il 23\/10\/2026 \(qualifica: nominative@pro\): ugo@omega\.it$/);
  const all=JSON.stringify([r,db.saves,db.audit]);for(const k of Object.values(KEYS))assert.ok(!all.includes(k),'no key in results, saves or audit');
 }finally{f.srv.close()}
});

test('server: providers without a key are «da collegare», Captain Data is unavailable, a switched-off one is refused',async()=>{
 const db=fakeCrm([C(1,{name:'Lucia Verdi',company:'Beta'})],{order:['hunter','dropcontact']});
 const opts={sql:db.sql,user:1,role:'member',env:{},fetch:()=>{throw new Error('no network in this test')},save:db.save};
 const st=(await finder.handle(finder.query({entity:'email_finder',workspace:W,offset:'0'}),opts)).rows[0];
 assert.deepEqual(st.chain.map(p=>[p.id,p.state]),[['hunter','da collegare'],['dropcontact','da collegare'],['apollo','spento'],['captaindata','spento']]);
 assert.equal(st.can_configure,false);
 const cmd=p=>finder.command({workspace:W,entity:'email_finder',action:'paid',data:{provider:p,contacts:[id(1)],confirm:true}});
 await assert.rejects(finder.handle(cmd('hunter'),opts),/Hunter da collegare: serve la chiave HUNTER_API_KEY/);
 await assert.rejects(finder.handle(cmd('apollo'),{...opts,env:KEYS}),/spento/);
 const on=fakeCrm([C(1,{name:'L V',company:'B'})]);
 await assert.rejects(finder.handle(cmd('captaindata'),{...opts,sql:on.sql,env:{CAPTAIN_DATA_API_KEY:'x'.repeat(20)}}),/non offre un’API pubblica/);
 await assert.rejects(finder.handle(cmd('hunter'),{...opts,role:'viewer'}),/Permessi/);
 const clear=await finder.handle(cmd('hunter'),{...opts,env:{...KEYS,HUNTER_API_BASE:'http://evil.example'}});
 assert.equal(clear.failed,1);assert.match(clear.rows[0].error,/serve https/,'the key never travels in clear text (and fetch is never called)');
});

test('site reader: only hosts of the company domain, never IP literals or other sites; MX via DNS over HTTPS',async()=>{
 assert.equal(await finder.sitePage('http://127.0.0.1/contatti','127.0.0.1'),null);
 assert.equal(await finder.sitePage('https://evil.example/','acme.it'),null);
 assert.equal(await finder.sitePage('https://acme.it:8443/','acme.it'),null,'no custom ports');
 assert.equal(await finder.sitePage('file:///etc/passwd','acme.it'),null);
 const doh=answer=>async()=>({ok:true,json:async()=>answer});
 assert.equal(await finder.hasMx('acme.it',{env:{},fetch:doh({Status:0,Answer:[{type:15,data:'10 mx.acme.it.'}]})}),true);
 assert.equal(await finder.hasMx('acme.it',{env:{},fetch:doh({Status:0,Answer:[{type:15,data:'0 .'}]})}),false,'null MX: the domain takes no mail');
 assert.equal(await finder.hasMx('acme.it',{env:{},fetch:doh({Status:3})}),false);
 assert.equal(await finder.hasMx('acme.it',{env:{},fetch:async()=>{throw new Error('down')}}),null);
});
