'use strict';
/* «Trova email» in /api/sales (entity «email_finder»): the PERSON's business email for CRM contacts that have a name and
   a company but no email (typically people brought in from LinkedIn via Lead Intelligence), as a waterfall: free sources
   first, then paid providers in the workspace order, stopping per contact at the first good result
   (rules in sales/crm-email-finder-core.js, qualifications in sales/crm-prospecting-core.js).
   - GET → the chain with each provider's state («pronto», «da collegare», «non disponibile», «spento»).
   - POST free {contacts ≤10, confirm:true}: company site pages + DNS MX, no key, no cost.
   - POST paid {provider, contacts, confirm:true}: one paid provider (Hunter/Apollo: ≤10 per call, answered at once;
     Dropcontact: ≤250, a batch → request_id). Only after the user's second confirmation in the CRM; the server checks
     again who still needs it (no email, or only a «da verificare»/catch-all one) and that the provider is on and has its key.
   - POST result {provider:'dropcontact', request_id}: the batch, when ready.
   Every hit is saved through the normal contact update (sales_command: validation, version, audit) with a note
   «Email trovata con <fonte> il DD/MM/YYYY (qualifica: …): <email>»; an address replaces another only when better.
   Generic or role mailboxes (info@, commerciale@ …) are never a hit: at most the company's email when it has none.
   Keys (HUNTER_API_KEY, APOLLO_API_KEY, DROPCONTACT_API_KEY) are read only here, sent only to their provider, never
   logged or returned. *_API_BASE override the endpoints for tests (https only, or http on localhost). */
const {randomUUID}=require('node:crypto');
const P=require('../sales/crm-prospecting-core.js');
const F=require('../sales/crm-email-finder-core.js');
const optout=require('./_sales_optout');
const vis=require('./_sales_visibility');
class FinderError extends Error{constructor(status,message){super(message);this.status=status}}
const fail=(s,m)=>{throw new FinderError(s,m)};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuid=v=>typeof v==='string'&&UUID.test(v);
const object=v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const SYNC_MAX=10,BATCH_MAX=250;
const REQUEST_ID=/^[A-Za-z0-9_-]{1,100}$/;
const clean=(v,max)=>{const t=String(v||'').replace(/[\u0000-\u001f\u007f]+/g,' ').trim();return t?t.slice(0,max):undefined};
const keyOk=v=>String(v||'').length>=8;

// ---- HTTP to a provider: key in a header, never in a message ----
function baseOf(env,name,def){
 const raw=String(env[name]||def).replace(/\/+$/,'');
 let u;try{u=new URL(raw)}catch{throw new FinderError(503,'Indirizzo del servizio non valido.')}
 const local=['localhost','127.0.0.1','[::1]'].includes(u.hostname);
 if(u.protocol!=='https:'&&!(u.protocol==='http:'&&local))throw new FinderError(503,'Indirizzo del servizio non valido: serve https.');
 return raw;
}
async function call(label,fetchImpl,url,init,{codes={}}={}){
 let res;
 try{res=await fetchImpl(url,{...init,redirect:'error',signal:AbortSignal.timeout(12000)})}
 catch{throw new FinderError(502,label+' non raggiungibile in questo momento: riprova tra poco.')}
 let body=null;try{body=await res.json()}catch{body=null}
 if(codes[res.status]!==undefined)return {status:res.status,body,special:codes[res.status]};
 if(res.status===401)fail(502,label+' ha rifiutato la chiave: controlla la variabile d’ambiente.');
 if(res.status===402)fail(402,'Crediti '+label+' esauriti: ricarica l’account.');
 if(res.status===429||res.status===403)fail(429,label+' chiede di rallentare o ha finito la quota: riprova più tardi.');
 if(!res.ok||!object(body))fail(502,label+' non ha risposto correttamente ('+res.status+').');
 return {status:res.status,body};
}
const reason=b=>clean(b&&(b.reason||b.message||b.error_message),200)||'';
// A provider hit counts only when it is a business address of the person: never generic, webmail or malformed.
const personal=e=>P.emailOk(e)&&String(e).length<=254&&P.businessEmail(e)&&!P.genericEmail(e);

// ---- Providers. find(person) → {email,qualification}|null ; person: {first_name,last_name,full_name,company,domain,linkedin} ----
const hunter={id:'hunter',label:'Hunter',configured:env=>keyOk(env.HUNTER_API_KEY),
 // GET /v2/email-finder (hunter.io/api-documentation/v2#email-finder): data.email, data.score, data.verification.status valid|accept_all|unknown.
 async find(p,{env,fetch:f}){
  const q=new URLSearchParams();if(p.domain)q.set('domain',p.domain);else if(p.company)q.set('company',p.company);
  const h=p.linkedin&&String(p.linkedin).match(/linkedin\.com\/in\/([^/?#]+)/i);if(!p.domain&&!p.company&&h)q.set('linkedin_handle',h[1]);
  if(p.first_name&&p.last_name){q.set('first_name',p.first_name);q.set('last_name',p.last_name)}else if(p.full_name)q.set('full_name',p.full_name);
  q.set('max_duration','6');
  // 451: the person asked Hunter not to process their data → not found.
  const r=await call('Hunter',f,baseOf(env,'HUNTER_API_BASE','https://api.hunter.io')+'/v2/email-finder?'+q,{method:'GET',headers:{'X-API-KEY':String(env.HUNTER_API_KEY),Accept:'application/json'}},{codes:{404:null,451:null,400:null,422:null}});
  if(r.special!==undefined)return null;
  const d=object(r.body.data)?r.body.data:{},email=String(d.email||'').trim().toLowerCase();
  if(!personal(email))return null;
  const st=object(d.verification)?String(d.verification.status||''):'';
  return {email,qualification:st==='valid'?'verificata':st==='accept_all'?'catch_all':'da verificare',score:Number.isFinite(d.score)?d.score:null};
 }};
const apollo={id:'apollo',label:'Apollo.io',configured:env=>keyOk(env.APOLLO_API_KEY),
 // POST /api/v1/people/match (docs.apollo.io/reference/people-enrichment), no personal emails, no phone, no waterfall.
 // person.email, person.email_status: verified → «verificata»; guessed/unverified/extrapolated → «da verificare».
 async find(p,{env,fetch:f}){
  const q=new URLSearchParams({reveal_personal_emails:'false',reveal_phone_number:'false',run_waterfall_email:'false',run_waterfall_phone:'false'});
  if(p.first_name&&p.last_name){q.set('first_name',p.first_name);q.set('last_name',p.last_name)}else if(p.full_name)q.set('name',p.full_name);
  if(p.company)q.set('organization_name',p.company);if(p.domain)q.set('domain',p.domain);if(p.linkedin)q.set('linkedin_url',p.linkedin);
  const r=await call('Apollo.io',f,baseOf(env,'APOLLO_API_BASE','https://api.apollo.io')+'/api/v1/people/match?'+q,{method:'POST',headers:{'X-Api-Key':String(env.APOLLO_API_KEY),'Content-Type':'application/json',Accept:'application/json','Cache-Control':'no-cache'},body:'{}'},{codes:{404:null,422:null}});
  if(r.special!==undefined)return null;
  const person=object(r.body.person)?r.body.person:{},email=String(person.email||'').trim().toLowerCase(),st=String(person.email_status||'').toLowerCase();
  if(!personal(email)||/email_not_unlocked|not_unlocked/.test(email))return null;
  if(st==='verified')return {email,qualification:'verificata'};
  if(['guessed','unverified','extrapolated','likely to engage','likely_to_engage'].includes(st))return {email,qualification:'da verificare'};
  return null;
 }};
// Captain Data: no public email-finding endpoint (it relies on Dropcontact for emails); kept in the list as «non disponibile».
const captaindata={id:'captaindata',label:'Captain Data',configured:env=>keyOk(env.CAPTAIN_DATA_API_KEY),unavailable:true};
// Dropcontact: POST /v1/enrich/all (≤250, custom_fields kept), then GET /v1/enrich/all/{request_id}
// (developer.dropcontact.com). email: [{email, qualification «local@domain»}], local nominative|catch_all|generic|random|invalid.
const DC_RANK=['nominative','catch_all','random'];
const dropcontact={id:'dropcontact',label:'Dropcontact',configured:env=>keyOk(env.DROPCONTACT_API_KEY),
 async submit(people,{env,fetch:f}){
  const data=people.map(p=>{const o={};for(const [k,v] of [['first_name',p.first_name],['last_name',p.last_name],['full_name',p.full_name],['company',p.company],['website',p.domain],['linkedin',p.linkedin]]){const c=clean(v,300);if(c)o[k]=c}
   o.custom_fields={radix_workspace:p.ref.w,radix_contact:p.ref.id};return o});
  const r=await call('Dropcontact',f,baseOf(env,'DROPCONTACT_API_BASE','https://api.dropcontact.com')+'/v1/enrich/all',{method:'POST',headers:{'X-Access-Token':String(env.DROPCONTACT_API_KEY),'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({data,siren:false,language:'en'})});
  const b=r.body;if(b.error===true||b.success===false||typeof b.request_id!=='string'||!REQUEST_ID.test(b.request_id))fail(502,'Dropcontact non ha accettato la richiesta'+(reason(b)?': '+reason(b):'.'));
  return {request_id:b.request_id,credits_left:Number.isFinite(b.credits_left)?b.credits_left:null};
 },
 async poll(id,{env,fetch:f}){
  const r=await call('Dropcontact',f,baseOf(env,'DROPCONTACT_API_BASE','https://api.dropcontact.com')+'/v1/enrich/all/'+encodeURIComponent(id),{method:'GET',headers:{'X-Access-Token':String(env.DROPCONTACT_API_KEY),Accept:'application/json'}});
  const b=r.body;if(b.error===true)fail(502,'Dropcontact: '+(reason(b)||'richiesta non riuscita.'));
  if(b.success!==true||!Array.isArray(b.data))return {ready:false,message:reason(b)||'Dropcontact sta ancora cercando.'};
  return {ready:true,results:b.data.filter(object).map(x=>({ref:object(x.custom_fields)?{w:String(x.custom_fields.radix_workspace||''),id:String(x.custom_fields.radix_contact||'')}:{w:'',id:''},
   emails:(Array.isArray(x.email)?x.email:[]).filter(object).map(e=>({email:String(e.email||'').trim().toLowerCase(),qualification:String(e.qualification||'').trim().toLowerCase()}))}))};
 }};
// Best personal business address of a Dropcontact result (nominative first; generic/perso/invalid never).
function dropcontactBest(list){
 const ok=(list||[]).filter(e=>/^[a-z_]+@[a-z_]+$/.test(e.qualification)&&personal(e.email)).map(e=>({...e,local:e.qualification.split('@')[0],domain:e.qualification.split('@')[1]}))
  .filter(e=>e.domain==='pro'&&DC_RANK.includes(e.local)).sort((a,b)=>DC_RANK.indexOf(a.local)-DC_RANK.indexOf(b.local));
 return ok[0]?{email:ok[0].email,qualification:ok[0].qualification}:null;
}
const PROVIDERS=Object.freeze({hunter,apollo,captaindata,dropcontact});

// ---- Free step: company site + DNS ----
const PAGES=['/','/contatti','/contattaci','/contact','/chi-siamo','/about','/team','/impressum','/privacy-policy'];
const PAGE_MAX=300000,PAGE_MS=4000;
/* One public page as text, or null. Only http(s) on default ports, only hostnames of the company domain, every
   resolved address checked to be public (privateIp) at connect time, ≤2 redirects inside the domain, 4 s, 300 KB. */
function sitePage(url,domain,hops=0){
 return new Promise(resolve=>{
  let u;try{u=new URL(url)}catch{return resolve(null)}
  const host=u.hostname.toLowerCase();
  if(!/^https?:$/.test(u.protocol)||u.port||u.username||(host!==domain&&!host.endsWith('.'+domain))||/^[\d.]+$|:/.test(host))return resolve(null);
  const dns=require('node:dns'),mod=require(u.protocol==='https:'?'node:https':'node:http');
  const lookup=(h,opts,cb)=>dns.lookup(h,{...(typeof opts==='object'?opts:{}),all:true},(err,list)=>{
   if(err)return cb(err);const bad=list.find(a=>F.privateIp(a.address));if(bad||!list.length)return cb(new Error('blocked address'));
   if(opts&&opts.all)return cb(null,list);cb(null,list[0].address,list[0].family)});
  const req=mod.get(u,{lookup,timeout:PAGE_MS,headers:{'User-Agent':'RADIX-CRM/1.0 (ricerca email pubblicate)','Accept':'text/html,text/plain'}},res=>{
   const loc=res.headers.location;
   if(res.statusCode>=300&&res.statusCode<400&&loc&&hops<2){res.resume();let next;try{next=new URL(loc,u).toString()}catch{return resolve(null)}return resolve(sitePage(next,domain,hops+1))}
   if(res.statusCode!==200||!/text\/(html|plain)|application\/xhtml/.test(String(res.headers['content-type']||'')))return res.resume(),resolve(null);
   let size=0,chunks=[];res.on('data',c=>{size+=c.length;if(size>PAGE_MAX){chunks.push(c.subarray(0,Math.max(0,c.length-(size-PAGE_MAX))));res.destroy();return}chunks.push(c)});
   res.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));res.on('close',()=>resolve(Buffer.concat(chunks).toString('utf8')));res.on('error',()=>resolve(null));
  });
  req.on('timeout',()=>{req.destroy();resolve(null)});req.on('error',()=>resolve(null));
 });
}
// MX through DNS over HTTPS: true (has mail), false (no MX or no such domain), null (cannot tell).
async function hasMx(domain,{env,fetch:f}){
 try{const r=await f(String(env.DNS_OVER_HTTPS_URL||'https://cloudflare-dns.com/dns-query')+'?name='+encodeURIComponent(domain)+'&type=MX',{headers:{Accept:'application/dns-json'},signal:AbortSignal.timeout(4000)});
  if(!r.ok)return null;const b=await r.json();if(b.Status===3)return false;if(b.Status!==0)return null;
  return Array.isArray(b.Answer)&&b.Answer.some(a=>a&&a.type===15&&!/^0\s+\.$/.test(String(a.data||'').trim()))}
 catch{return null}
}
async function readSite(domain,website,{getPage,deadline}){
 const hosts=[...new Set([website&&F.domainOf(website)===domain?(()=>{try{return new URL(/^[a-z]+:\/\//i.test(website)?website:'https://'+website).hostname.toLowerCase()}catch{return null}})():null,'www.'+domain,domain].filter(Boolean))];
 const found=new Set();
 for(const h of hosts.slice(0,2)){
  if(Date.now()>deadline)break;
  const pages=await Promise.all(PAGES.map(p=>getPage('https://'+h+p,domain).catch(()=>null)));
  if(!pages.some(Boolean))continue;
  for(const html of pages)for(const e of F.extractEmails(html,domain))found.add(e);
  break;
 }
 return [...found];
}

// ---- API ----
function command(body){
 if(!object(body)||Object.keys(body).some(k=>!['workspace','entity','action','data'].includes(k))||body.entity!=='email_finder'||!uuid(body.workspace)||!object(body.data))fail(400,'Richiesta «Trova email» non valida.');
 const d=body.data,a=body.action;
 if(a==='free'||a==='paid'){
  if(Object.keys(d).some(k=>!['contacts','confirm',...(a==='paid'?['provider']:[])].includes(k)))fail(400,'Campo non consentito.');
  // The confirm gates: the CRM sends confirm:true only after the user's click (and a second one before paid providers).
  if(d.confirm!==true)fail(400,a==='paid'?'Ricerca a pagamento non confermata: conferma nella finestra del CRM (ogni email trovata usa crediti).':'Ricerca non confermata: conferma nella finestra del CRM.');
  let max=SYNC_MAX;
  if(a==='paid'){const p=PROVIDERS[d.provider];if(!p||!F.PAID.includes(d.provider))fail(400,'Servizio non valido.');if(d.provider==='dropcontact')max=BATCH_MAX}
  if(!Array.isArray(d.contacts)||!d.contacts.length||d.contacts.length>max||!d.contacts.every(uuid))fail(400,'Contatti non validi (da 1 a '+max+' per volta).');
  return {workspace:body.workspace,entity:'email_finder',action:a,data:{contacts:[...new Set(d.contacts)],...(a==='paid'?{provider:d.provider}:{})}};
 }
 if(a==='result'){
  if(Object.keys(d).sort().join()!=='provider,request_id'||d.provider!=='dropcontact'||typeof d.request_id!=='string'||!REQUEST_ID.test(d.request_id))fail(400,'Richiesta non valida.');
  return {workspace:body.workspace,entity:'email_finder',action:'result',data:{provider:'dropcontact',request_id:d.request_id}};
 }
 fail(400,'Azione non valida.');
}
function query(q){
 if(Object.keys(q).some(k=>!['entity','workspace','offset'].includes(k))||(q.offset!==undefined&&q.offset!=='0')||!uuid(q.workspace))fail(400,'Parametri non validi.');
 return {workspace:q.workspace,entity:'email_finder'};
}
const CONTACTS=`SELECT t.id,t.version,t.name,to_jsonb(t)->>'first_name' AS first_name,to_jsonb(t)->>'last_name' AS last_name,t.email,t.notes,t.linkedin_url,
 ${optout.OPTED_OUT('t')} AS opted_out,t.company_id,co.version AS company_version,co.name AS company,co.website,co.email AS company_email
 FROM sales_contacts t LEFT JOIN sales_companies co ON co.workspace_id=t.workspace_id AND co.id=t.company_id
 WHERE t.workspace_id=$1 AND t.id=ANY($2::uuid[]) AND ${vis.visible('contacts','t','$1','$3')}`;
async function orderOf(sql,w){
 try{return F.orderOf((await sql('SELECT filters FROM sales_segments WHERE workspace_id=$1 AND lower(btrim(name))=$2 LIMIT 1',[w,F.RESERVED]))[0])}
 catch(e){if(e&&e.code==='42P01')return [...F.DEFAULT_ORDER];throw e}
}
const configuredMap=env=>Object.fromEntries(Object.values(PROVIDERS).map(p=>[p.id,!p.unavailable&&p.configured(env)]));
function personOf(c){
 const first=clean(c.first_name,100),last=clean(c.last_name,100);let names;
 if(first&&last)names={first_name:first,last_name:last};
 else{const w=String(c.name||'').trim().split(/\s+/).filter(Boolean);names=w.length>1?{first_name:w[0],last_name:w.slice(1).join(' ')}:{full_name:clean(c.name,200)}}
 return {...names,company:clean(c.company,200),domain:F.domainOf(c.website)||F.domainOf(c.company_email)||undefined,linkedin:clean(c.linkedin_url,300)};
}

/* opts: {sql,user,role,env,fetch,now,getPage(url,domain),save(entity,data)} — save runs the normal sales_command update. */
async function handle(c,{sql,user,role,env=process.env,fetch:f=globalThis.fetch,now=Date.now(),getPage=sitePage,save,budgetMs=12000}){
 if(!c.action){const order=await orderOf(sql,c.workspace);return {rows:[{chain:F.chain(order,configuredMap(env)),order,can_configure:['owner','admin'].includes(role),sync_max:SYNC_MAX,batch_max:BATCH_MAX}]}}
 if(!['owner','admin','member'].includes(role))fail(403,'Permessi insufficienti.');
 const out={saved:0,guessed:0,company:0,not_found:0,already:0,failed:0,resolved:[],rows:[]};
 const companiesDone=new Set();
 // Save a hit on the contact if it is better than what the contact has; record the outcome.
 async function keep(contact,hit,source){
  const cur=P.emailOk(contact.email)?P.qualificationRank(P.findingOf(contact)?P.qualificationOf(contact):'verificata'):0,rank=P.qualificationRank(hit.qualification);
  if(rank<=cur){if(cur>=2)out.resolved.push(contact.id);out.already++;return}
  const note=P.finderNote(now,hit.qualification,hit.email,source),notes=contact.notes?contact.notes+'\n\n'+note:note;
  if(notes.length>4000){out.failed++;out.rows.push({id:contact.id,name:contact.name,error:'Note del contatto piene: email non salvata.'});return}
  try{await save('contacts',{id:contact.id,version:contact.version,email:hit.email,notes});contact.email=hit.email;contact.notes=notes;contact.version++;
   if(rank>=2){out.saved++;out.resolved.push(contact.id)}else out.guessed++;
   out.rows.push({id:contact.id,name:contact.name,email:hit.email,qualification:hit.qualification,source})}
  catch(e){out.failed++;out.rows.push({id:contact.id,name:contact.name,error:e&&e.status?e.message:'Salvataggio non riuscito: riprova.'})}
 }
 // A generic mailbox is the company's, never the person's: saved only when the company has no email.
 async function companyEmail(contact,email){
  if(!contact.company_id||P.emailOk(contact.company_email)||companiesDone.has(contact.company_id)||!email)return;
  companiesDone.add(contact.company_id);
  try{await save('companies',{id:contact.company_id,version:contact.company_version,email});out.company++}catch{}
 }
 const load=async ids=>sql(CONTACTS,[c.workspace,ids,user]);
 if(c.action==='free'){
  const rows=await load(c.data.contacts),pick=F.candidates(rows),deadline=Date.now()+budgetMs;
  // Every company site of the batch is read in parallel (each page 4 s at most), then each contact is looked up.
  const sites=new Map(),mx=new Map(),domainOf=ct=>F.domainOf(ct.website)||F.domainOf(ct.company_email);
  for(const ct of pick.contacts){const d=domainOf(ct);if(d&&!sites.has(d))sites.set(d,readSite(d,ct.website,{getPage,deadline}))}
  for(const ct of pick.contacts){
   const domain=domainOf(ct);
   if(!domain){out.not_found++;continue}
   const emails=await sites.get(domain);
   const own=F.personalMatch(emails,ct);
   if(own&&P.businessEmail(own)){await keep(ct,{email:own,qualification:'pubblicata sul sito'},'sito aziendale');continue}
   const generic=emails.find(e=>P.genericEmail(e));if(generic)await companyEmail(ct,generic);
   const pattern=F.detectPattern(emails);
   if(pattern){
    if(!mx.has(domain))mx.set(domain,hasMx(domain,{env,fetch:f}));
    const guess=(await mx.get(domain))===true?F.applyPattern(pattern,ct,domain):null;
    if(guess&&P.businessEmail(guess)&&!P.genericEmail(guess)){await keep(ct,{email:guess,qualification:'da verificare'},'schema del sito aziendale');continue}
   }
   out.not_found++;
  }
  return {...out,skipped:pick.skipped,missing:c.data.contacts.length-rows.length};
 }
 const order=await orderOf(sql,c.workspace),name=c.data.provider,p=PROVIDERS[name];
 if(!order.includes(name))fail(400,p.label+' è spento nell’ordine dei servizi «Trova email».');
 if(p.unavailable)fail(400,F.byId(name).unavailable);
 if(!p.configured(env))fail(503,p.label+' da collegare: serve la chiave '+F.byId(name).env+' nelle variabili d’ambiente di Vercel (Production). Nessuna ricerca è partita.');
 if(c.action==='paid'){
  const rows=await load(c.data.contacts),pick=F.candidates(rows,{paid:true});
  if(p.find){
   await Promise.all(pick.contacts.map(async ct=>{
    let hit=null;try{hit=await p.find(personOf(ct),{env,fetch:f})}catch(e){out.failed++;out.rows.push({id:ct.id,name:ct.name,error:e&&e.status?e.message:'Ricerca non riuscita.'});return}
    if(!hit){out.not_found++;return}
    await keep(ct,hit,p.label);
   }));
   return {...out,provider:p.label,skipped:pick.skipped};
  }
  if(!pick.contacts.length)return {...out,provider:p.label,sent:0,skipped:pick.skipped};
  const people=pick.contacts.map(ct=>({ref:{w:c.workspace,id:ct.id},...personOf(ct)}));
  const r=await p.submit(people,{env,fetch:f});
  await sql('INSERT INTO sales_audit(workspace_id,actor_id,entity,entity_id,action,detail) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[c.workspace,user,'email_finder',randomUUID(),'submit',JSON.stringify({provider:p.id,contacts:people.length,request_id:r.request_id})]).catch(()=>{});
  return {...out,provider:p.label,sent:people.length,request_id:r.request_id,skipped:pick.skipped};
 }
 // result (Dropcontact batch): only results of this workspace; the rest is ignored.
 const r=await p.poll(c.data.request_id,{env,fetch:f});
 if(!r.ready)return {ready:false,message:r.message};
 const mine=r.results.filter(x=>x.ref.w===c.workspace&&uuid(x.ref.id));
 const rows=mine.length?await load([...new Set(mine.map(x=>x.ref.id))]):[],byId=new Map(rows.map(x=>[x.id,x]));
 for(const x of mine){
  const ct=byId.get(x.ref.id);if(!ct||P.optedOut(ct)){out.failed++;continue}
  const best=dropcontactBest(x.emails);
  if(!best){const g=x.emails.find(e=>P.genericEmail(e.email)&&P.businessEmail(e.email));if(g)await companyEmail(ct,g.email);out.not_found++;continue}
  await keep(ct,best,p.label);
 }
 return {...out,ready:true,provider:p.label};
}
module.exports={command,query,handle,dropcontactBest,personOf,sitePage,hasMx,PROVIDERS,SYNC_MAX,BATCH_MAX,FinderError};
