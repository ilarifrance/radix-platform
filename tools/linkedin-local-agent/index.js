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
const {visibleSearchCards,normalizeVisibleCards,csvExport} = require('../../lib/linkedin-browser-extract');
const PORT = Number(process.env.RADIX_LINKEDIN_PORT || 4317);
const HOME = path.join(os.homedir(), '.radix', 'linkedin-agent');
const JOBS = path.join(HOME, 'jobs');
const PROFILE = path.join(HOME, 'browser-profile');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const state = {phase:'idle', browser:null, page:null, active:null, stopping:false, error:'', lastUpdate:null};
const json = (res,status,value) => send(res,status,JSON.stringify(value),{'Content-Type':'application/json; charset=utf-8'});
function send(res,status,body,headers={}) {res.writeHead(status,{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(body)}
function snapshot(){const job=state.active;return {phase:state.phase,error:state.error,jobId:job?.id||'',page:job?.page||0,requested:job?.requested||0,collected:job?.data?.records?.length||0,duplicates:job?.data?.duplicates||0,startedAt:job?.startedAt||null,lastUpdate:state.lastUpdate,sourceUrl:job?.sourceUrl||'',browserOpen:!!state.browser,outputAvailable:!!job?.data?.records?.length}}
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
async function readBody(req){let s='';for await(const part of req){s+=part;if(s.length>16000)throw Error('Richiesta troppo grande')}return JSON.parse(s||'{}')}
async function handler(req,res){
 try{
  const url = new URL(req.url,'http://127.0.0.1:'+PORT);
  if(req.method==='GET'&&url.pathname==='/')return send(res,200,fs.readFileSync(path.join(__dirname,'index.html'),'utf8'),{'Content-Type':'text/html; charset=utf-8'});
  if(req.method==='GET'&&url.pathname==='/api/status')return json(res,200,snapshot());
  if(req.method==='GET'&&url.pathname==='/api/jobs'){
   const jobs=fs.existsSync(JOBS)?fs.readdirSync(JOBS).filter(x=>/^[a-f0-9-]{36}\.json$/.test(x)).slice(-30).map(x=>{try{const j=loadJob(x.slice(0,-5));return {id:j.id,sourceUrl:j.sourceUrl,page:j.page,count:j.data.records.length,createdAt:j.startedAt}}catch{return null}}).filter(Boolean):[];
   return json(res,200,{jobs});
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
  if(url.pathname==='/api/browser'){await openBrowser();return json(res,200,snapshot())}
  if(url.pathname==='/api/stop'){state.stopping=true;return json(res,200,snapshot())}
  if(url.pathname==='/api/start'){
   if(state.phase==='running')return json(res,409,{error:'Un lavoro è già in esecuzione'});
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
module.exports={handler,snapshot,isAuthOrChallenge};
