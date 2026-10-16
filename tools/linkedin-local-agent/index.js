#!/usr/bin/env node
'use strict';
/* RADIX local LinkedIn agent: manual login; no stealth, CAPTCHA bypass, cookie extraction,
   credential forwarding or paid provider. Runs exclusively on loopback. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const Batch = require('../../lib/lead-contact-batches');
const Source = require('../../lib/salesnav-source');
const PublicLookup = require('../../api/_lead_public_lookup');
const ProfileReview = require('../../lib/linkedin-profile-review');
const ContactReview = require('../../lib/linkedin-contact-review');
const BraveLookup = require('../../lib/lead-brave-lookup');
const ProviderBudget = require('../../lib/lead-provider-budget');
const {visibleSearchCards,normalizeVisibleCards,visibleProfileDetails,csvExport} = require('../../lib/linkedin-browser-extract');
const PORT = Number(process.env.RADIX_LINKEDIN_PORT || 4317);
const HOME = path.join(os.homedir(), '.radix', 'linkedin-agent');
const JOBS = path.join(HOME, 'jobs');
const PROFILE = path.join(HOME, 'browser-profile');
const BRAVE_USAGE=path.join(HOME,'brave-usage.json');
let braveBusy=false;
const braveLimit=()=>{const raw=process.env.RADIX_BRAVE_DAILY_LIMIT||'0';const n=Number(raw);return /^\d+$/.test(raw)&&Number.isSafeInteger(n)&&n>=0&&n<=100?n:0};
const braveEnabled=()=>process.env.RADIX_BRAVE_ENABLED==='1'&&Boolean(process.env.BRAVE_SEARCH_API_KEY)&&braveLimit()>0;
function braveStored(){try{const v=JSON.parse(fs.readFileSync(BRAVE_USAGE,'utf8'));return v&&typeof v==='object'&&!Array.isArray(v)?v:null}catch{return null}}
function braveState(){const q=ProviderBudget.status(braveStored(),new Date().toISOString().slice(0,10),braveLimit());return {configured:Boolean(process.env.BRAVE_SEARCH_API_KEY),enabled:braveEnabled(),busy:braveBusy,...q}}
function reserveBrave(){if(!braveEnabled())throw Error('Brave non abilitato: configura chiave, RADIX_BRAVE_ENABLED=1 e RADIX_BRAVE_DAILY_LIMIT');const current=ProviderBudget.reserve(braveStored(),new Date().toISOString().slice(0,10),braveLimit());fs.mkdirSync(HOME,{recursive:true,mode:0o700});const tmp=BRAVE_USAGE+'.tmp';fs.writeFileSync(tmp,JSON.stringify(current),{mode:0o600});fs.renameSync(tmp,BRAVE_USAGE);return current}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const state = {phase:'idle', browser:null, page:null, active:null, stopping:false, error:'', lastUpdate:null};
const json = (res,status,value) => send(res,status,JSON.stringify(value),{'Content-Type':'application/json; charset=utf-8'});
function send(res,status,body,headers={}) {res.writeHead(status,{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'",...headers});res.end(body)}
function isLocalRequest(req){
 const host=String(req.headers.host||'').toLowerCase();
 const expected='127.0.0.1:'+String(req.socket.localPort||PORT);
 const remote=String(req.socket.remoteAddress||'');
 return host===expected&&(remote==='127.0.0.1'||remote==='::ffff:127.0.0.1');
}
function snapshot(){const job=state.active;return {phase:state.phase,error:state.error,jobId:job?.id||'',page:job?.page||0,requested:job?.requested||0,collected:job?.data?.records?.length||0,duplicates:job?.data?.duplicates||0,startedAt:job?.startedAt||null,lastUpdate:state.lastUpdate,sourceUrl:job?.sourceUrl||'',browserOpen:!!state.browser,outputAvailable:!!job?.data?.records?.length,profilesReviewed:job?.profileReview?.length||0}}
function atomicSave(job){fs.mkdirSync(JOBS,{recursive:true,mode:0o700});const final=path.join(JOBS,job.id+'.json'),temp=final+'.tmp';fs.writeFileSync(temp,JSON.stringify(job,null,2),{mode:0o600});fs.renameSync(temp,final);state.lastUpdate=new Date().toISOString()}
function loadJob(id){if(!/^[a-f0-9-]{36}$/.test(id))throw Error('ID lavoro non valido');return JSON.parse(fs.readFileSync(path.join(JOBS,id+'.json'),'utf8'))}
async function openBrowser(){
 if(state.browser){if(!state.page||state.page.isClosed())state.page=await state.browser.newPage();await state.page.bringToFront();return}
 let chromium;
 try{({chromium}=require('playwright'))}catch{throw Error('Playwright non installato: esegui npm install nella cartella tools/linkedin-local-agent')}
 fs.mkdirSync(PROFILE,{recursive:true,mode:0o700});
 state.browser=await chromium.launchPersistentContext(PROFILE,{headless:false,viewport:{width:1440,height:900},acceptDownloads:false});
 const current=state.browser.pages()[0]||await state.browser.newPage();state.page=current;
 await current.goto('https://www.linkedin.com/sales/',{waitUntil:'domcontentloaded',timeout:60000});
 state.phase='login';state.error='';
}
function isAuthOrChallenge(url){return /\/(login|checkpoint|challenge|authwall|uas\/login)/i.test(url)}
async function nextPage(page){
 const candidates=[
  page.getByRole('button',{name:/^(next|next page|pagina successiva|avanti|successiva)$/i}),
  page.locator('button[aria-label*="Next" i],button[aria-label*="Avanti" i],button[aria-label*="Successiv" i]'),
  page.locator('a[aria-label*="Next" i],a[aria-label*="Avanti" i]')
 ];
 for(const q of candidates){const count=await q.count().catch(()=>0);for(let i=0;i<Math.min(count,5);i++){
  const btn=q.nth(i);if(await btn.isVisible().catch(()=>false)&&await btn.isEnabled().catch(()=>false)){
   await btn.click({timeout:10000});await delay(1800);return true;
  }
 }}return false;
}
async function scrape(job){
 state.phase='running';state.error='';state.stopping=false;
 try{
  const page=state.page;
  await page.goto(job.sourceUrl,{waitUntil:'domcontentloaded',timeout:60000});
  if(isAuthOrChallenge(page.url()))throw Error('La sessione richiede login/verifica. Completa l’accesso manualmente nel browser.');
  for(let skipped=0;skipped<job.page;skipped++){
   if(state.stopping)break;
   if(!(await nextPage(page)))throw Error('Ripresa non disponibile: impossibile tornare alla pagina '+(job.page+1));
  }
  while(!state.stopping && job.data.records.length<job.requested){
   if(isAuthOrChallenge(page.url()))throw Error('LinkedIn richiede una verifica: completa manualmente nel browser.');
   await page.locator('a[href*="/sales/lead/"],a[href*="/in/"]').first().waitFor({state:'visible',timeout:20000})
    .catch(()=>{throw Error('Nessun risultato visibile: verifica URL, login oppure selettori della pagina.')});
   let combined=[],profileSeen=new Set();
   for(let scroll=0;scroll<5 && !state.stopping;scroll++){
    const found=normalizeVisibleCards(await page.evaluate(visibleSearchCards),job.sourceUrl);
    for(const r of found)if(!profileSeen.has(r.profileUrl)){profileSeen.add(r.profileUrl);combined.push(r)}
    await page.evaluate(()=>window.scrollBy(0,Math.max(550,window.innerHeight*.7)));
    await delay(600);
   }
   if(state.stopping)break;
   const pageNumber=job.page+1,remaining=job.requested-job.data.records.length;
   combined=combined.slice(0,Math.max(0,remaining));
   if(!combined.length)throw Error('Pagina '+pageNumber+' senza contatti riconoscibili: dati precedenti conservati.');
   for(let i=0;i<combined.length;i+=200)job.data=Batch.add(job.data,combined.slice(i,i+200),'page-'+pageNumber+'-'+Math.floor(i/200));
   job.page=pageNumber;atomicSave(job);
   if(job.data.records.length>=job.requested)break;
   if(!(await nextPage(page))){state.phase='completed';break}
   await delay(1600);
  }
  if(state.stopping)state.phase='paused';else if(state.phase!=='completed')state.phase='completed';
 }catch(err){state.error=err.message;state.phase='error'}finally{job.status=state.phase;job.error=state.error;atomicSave(job)}
}

async function reviewVisibleProfiles(job,limit){
 state.phase='reviewing';state.error='';state.stopping=false;
 try{
  job.profileReview=Array.isArray(job.profileReview)?job.profileReview:[];
  const choices=ProfileReview.select(job.data.records,{limit,attempted:job.profileReview.map(x=>x.profileUrl)});
  for(const choice of choices){
   if(state.stopping)break;
   // Only explicit, visible LinkedIn profile pages are opened. No hidden APIs
   // or authentication workarounds are used.
   await state.page.goto(choice.profileUrl,{waitUntil:'domcontentloaded',timeout:60000});
   if(isAuthOrChallenge(state.page.url()))throw Error('LinkedIn richiede un nuovo accesso o verifica. Fermata la revisione; completa personalmente l’accesso.');
   await state.page.locator('main').first().waitFor({state:'visible',timeout:12000});
   await delay(1200);
   if(state.stopping)break;
   const observed=await state.page.evaluate(visibleProfileDetails);
   const result=ProfileReview.apply(job.data.records[choice.index],observed);
   if(result.changed)job.data.records[choice.index]=result.record;
   job.profileReview.push({profileUrl:choice.profileUrl,status:result.reason,fields:result.fields,reviewedAt:new Date().toISOString()});
   atomicSave(job);
   await delay(1600);
  }
  state.phase=state.stopping?'paused':job.status==='paused'?'paused':'completed';
 }catch(err){state.phase='error';state.error=err.message}
 finally{atomicSave(job)}
}
async function readBody(req){let s='';for await(const part of req){s+=part;if(s.length>16000)throw Error('Richiesta troppo grande')}return JSON.parse(s||'{}')}
async function handler(req,res){
 try{
  if(!isLocalRequest(req))return json(res,403,{error:'Accesso consentito solo da 127.0.0.1'});
  const url = new URL(req.url,'http://127.0.0.1:'+PORT);
  if(req.method==='GET'&&url.pathname==='/')return send(res,200,fs.readFileSync(path.join(__dirname,'index.html'),'utf8'),{'Content-Type':'text/html; charset=utf-8'});
  if(req.method==='GET'&&url.pathname==='/api/status')return json(res,200,snapshot());
  if(req.method==='GET'&&url.pathname==='/api/brave-status')return json(res,200,braveState());
  if(req.method==='GET'&&url.pathname==='/lead-enrichment-plan.js')return send(res,200,fs.readFileSync(path.join(__dirname,'../../lib/lead-enrichment-plan.js'),'utf8'),{'Content-Type':'application/javascript; charset=utf-8'});
  if(req.method==='GET'&&url.pathname==='/lead-domain-suggestions.js')return send(res,200,fs.readFileSync(path.join(__dirname,'../../lib/lead-domain-suggestions.js'),'utf8'),{'Content-Type':'application/javascript; charset=utf-8'});
  if(req.method==='GET'&&url.pathname==='/lead-provider-waterfall.js')return send(res,200,fs.readFileSync(path.join(__dirname,'../../lib/lead-provider-waterfall.js'),'utf8'),{'Content-Type':'application/javascript; charset=utf-8'});
  if(req.method==='GET'&&url.pathname==='/api/jobs'){
   const jobs=fs.existsSync(JOBS)?fs.readdirSync(JOBS).filter(x=>/^[a-f0-9-]{36}\.json$/.test(x)).slice(-30).map(x=>{try{const j=loadJob(x.slice(0,-5));return {id:j.id,sourceUrl:j.sourceUrl,page:j.page,count:j.data.records.length,createdAt:j.startedAt}}catch{return null}}).filter(Boolean):[];
   return json(res,200,{jobs});
  }
  if(req.method==='GET'&&url.pathname==='/api/contacts'){
   const id=url.searchParams.get('id')||state.active?.id;
   if(!id)return json(res,200,{jobId:'',total:0,complete:0,incomplete:0,records:[]});
   const job=loadJob(id);
   const records=job.data.records||[];
   const complete=records.filter(r=>r.fullName&&r.jobTitle&&r.companyName).length;
   // The receiver reads local checkpoints only; it never triggers browsing.
   return json(res,200,{jobId:id,total:records.length,complete,incomplete:records.length-complete,records:records.slice(0,5000).map(r=>({
    fullName:r.fullName||'',jobTitle:r.jobTitle||'',companyName:r.companyName||'',
    location:r.location||'',country:r.country||'',companyDomain:r.companyDomain||'',email:r.email||'',phone:r.phone||'',profileUrl:r.profileUrl||'',
    sourceUrl:r.sourceUrl||''
   }))});
  }
  if(req.method==='GET'&&url.pathname==='/api/download'){
   const id=url.searchParams.get('id')||state.active?.id;if(!id)throw Error('Nessun lavoro selezionato');
   const job=loadJob(id),type=url.searchParams.get('format');if(!['json','csv'].includes(type))throw Error('Formato non valido');
   const content=type==='csv'?csvExport(job.data):JSON.stringify(job.data,null,2);
   return send(res,200,content,{'Content-Type':type==='csv'?'text/csv; charset=utf-8':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="radix-linkedin-'+id+'.'+type+'"'});
  }
  if(req.method!=='POST')return json(res,404,{error:'Risorsa non trovata'});
  if(req.headers.origin && req.headers.origin!=='http://127.0.0.1:'+PORT)return json(res,403,{error:'Origine non autorizzata'});
  if(!String(req.headers['content-type']||'').startsWith('application/json'))return json(res,415,{error:'Content-Type JSON richiesto'});
  const input=await readBody(req);
  if(url.pathname==='/api/contact-review'){
   if(['running','reviewing'].includes(state.phase))return json(res,409,{error:'Attendi la fine dell’acquisizione o revisione profili'});
   const id=String(input.jobId||''),job=loadJob(id);
   const record=job.data.records.find(r=>r.profileUrl===input.profileUrl);
   if(!record)return json(res,404,{error:'Contatto non trovato nel lavoro'});
   const reviewed=ContactReview.review(record,input);
   Object.assign(record,reviewed.record);
   if(reviewed.audit.fields.includes('companyName')||reviewed.audit.fields.includes('companyDomain')){
    for(const note of (job.freeEnrichment||[]))if(note.profileUrl===record.profileUrl&&note.field==='companyDomain'&&!note.supersededAt)note.supersededAt=new Date().toISOString();
   }
   job.manualReviews=Array.isArray(job.manualReviews)?job.manualReviews:[];
   job.manualReviews.push({...reviewed.audit,reviewedAt:new Date().toISOString()});
   if(job.manualReviews.length>10000)job.manualReviews=job.manualReviews.slice(-10000);
   atomicSave(job);return json(res,200,{saved:true,fields:reviewed.audit.fields,record:{fullName:record.fullName,profileUrl:record.profileUrl,jobTitle:record.jobTitle,companyName:record.companyName,country:record.country,companyDomain:record.companyDomain}});
  }
  if(url.pathname==='/api/free-lookup'){
   const id=String(input.jobId||''),profileUrl=String(input.profileUrl||'');
   const job=loadJob(id),contact=job.data.records.find(r=>r.profileUrl===profileUrl);
   if(!contact)return json(res,404,{error:'Contatto non trovato nel lavoro'});
   if(!contact.companyName||contact.companyDomain)return json(res,400,{error:'Nome aziendale assente oppure dominio già presente'});
   const result=await PublicLookup.lookup({name:contact.companyName});
   return json(res,200,{jobId:id,profileUrl,companyName:contact.companyName,...result});
  }
  if(url.pathname==='/api/free-accept'){
   const id=String(input.jobId||''),profileUrl=String(input.profileUrl||'');
   const name=String(input.companyName||''),domain=String(input.domain||''),source=String(input.source||'');
   if(!/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(domain)||domain.length>253||!/^https:\/\/www\.wikidata\.org\/wiki\/Q[1-9]\d{0,11}$/.test(source))return json(res,400,{error:'Proposta fonte/dominio non valida'});
   if(['running','reviewing'].includes(state.phase))return json(res,409,{error:'Attendi la fine del lavoro corrente'});
   const job=loadJob(id),contact=job.data.records.find(r=>r.profileUrl===profileUrl);
   if(!contact||contact.companyName!==name||contact.companyDomain)return json(res,409,{error:'Contatto modificato o dominio già disponibile'});
   contact.companyDomain=domain;
   job.freeEnrichment=Array.isArray(job.freeEnrichment)?job.freeEnrichment:[];
   job.freeEnrichment.push({profileUrl,field:'companyDomain',value:domain,source,confirmedAt:new Date().toISOString()});
   atomicSave(job);
   return json(res,200,{saved:true,domain});
  }
  if(url.pathname==='/api/browser'){await openBrowser();return json(res,200,snapshot())}
  if(url.pathname==='/api/profile-review'){
   if(['running','reviewing'].includes(state.phase))return json(res,409,{error:'Un lavoro è già in esecuzione'});
   if(!state.browser||!state.page||state.page.isClosed())return json(res,409,{error:'Apri prima il browser e accedi personalmente a Sales Navigator'});
   const job=loadJob(String(input.jobId||'')),limit=Number(input.limit);
   const choices=ProfileReview.select(job.data.records,{limit,attempted:(job.profileReview||[]).map(x=>x.profileUrl)});
   if(!choices.length)return json(res,200,{started:false,message:'Nessun contatto idoneo da rivedere, oppure tutti già esaminati.'});
   state.active=job;void reviewVisibleProfiles(job,limit);
   return json(res,202,{started:true,selected:choices.length,...snapshot()});
  }
  if(url.pathname==='/api/stop'){state.stopping=true;return json(res,200,snapshot())}
  if(url.pathname==='/api/start'){
   if(['running','reviewing'].includes(state.phase))return json(res,409,{error:'Un lavoro è già in esecuzione'});
   if(!state.browser||!state.page||state.page.isClosed())return json(res,409,{error:'Apri prima il browser e accedi personalmente a Sales Navigator'});
   if(input.resumeId){state.active=loadJob(input.resumeId);if(state.active.status==='completed')return json(res,409,{error:'Questo lavoro è già completato'});}
   else {const sourceUrl=Source.validate(input.url),requested=Source.quantity(input.quantity);
    state.active={id:crypto.randomUUID(),sourceUrl,requested,page:0,startedAt:new Date().toISOString(),status:'ready',data:Batch.start(sourceUrl)};
    atomicSave(state.active);
   }
   void scrape(state.active);return json(res,202,snapshot());
  }
  return json(res,404,{error:'Azione sconosciuta'});
 }catch(err){return json(res,400,{error:err.message||'Errore inatteso'})}
}
if(require.main===module){
 const server=http.createServer(handler);
 server.listen(PORT,'127.0.0.1',()=>{process.stdout.write('RADIX LinkedIn Local Agent: http://127.0.0.1:'+PORT+'\nProfilo browser e dati: '+HOME+'\n')});
 process.on('SIGINT',()=>{state.stopping=true;server.close()});
}
module.exports={handler,snapshot,isAuthOrChallenge,isLocalRequest};
