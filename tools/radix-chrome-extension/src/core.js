'use strict';
// Pure logic of the «Importa in RADIX» extension: link code, URLs, dedupe,
// RADIX contact-job payload and the upload request. No DOM, no chrome.* API,
// so the same file runs in the service worker, the popup and node:test.
(function(root){
 const B=root.RadixContactBatch||(typeof require==='function'?require('./lead-contact-batches.js'):null);
 const DEFAULT_BASE='https://radix-platform.vercel.app';
 const MAX_CHOICES=[25,100,250,1000];
 const MAX_CONTACTS=1000;
 const BATCH_SIZE=200;
 const SOURCE_LABEL='LinkedIn Sales Navigator';
 const LINK_PREFIX='radix-link:';
 function clampMax(value){
  const n=Math.floor(Number(value));
  if(!Number.isFinite(n)||n<1)return MAX_CHOICES[1];
  return Math.min(n,MAX_CONTACTS);
 }
 // RADIX address: HTTPS origin (production or a Vercel preview), or a local
 // http://localhost / 127.0.0.1 server for development. Paths are dropped.
 function normalizeBaseUrl(value){
  let url;
  try{url=new URL(String(value||'').trim())}catch{throw Error('Indirizzo RADIX non valido')}
  if(url.username||url.password)throw Error('Indirizzo RADIX senza credenziali, per favore');
  const local=url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname);
  if(url.protocol!=='https:'&&!local)throw Error('Usa un indirizzo https:// (es. '+DEFAULT_BASE+')');
  return url.origin;
 }
 function b64urlDecode(text){
  const s=String(text).replace(/-/g,'+').replace(/_/g,'/');
  const bin=(typeof atob==='function'?atob:x=>Buffer.from(x,'base64').toString('binary'))(s+'='.repeat((4-s.length%4)%4));
  return decodeURIComponent(Array.from(bin,c=>'%'+c.charCodeAt(0).toString(16).padStart(2,'0')).join(''));
 }
 function b64urlEncode(text){
  const bin=unescape(encodeURIComponent(String(text)));
  return (typeof btoa==='function'?btoa(bin):Buffer.from(bin,'binary').toString('base64')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 }
 const TOKEN=/^rli1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
 // Link code created by «Collega estensione» in Lead Intelligence: it carries
 // the RADIX address and the import token. A bare token is accepted too.
 function makeLinkCode(baseUrl,token){return LINK_PREFIX+b64urlEncode(JSON.stringify({u:normalizeBaseUrl(baseUrl),t:token}))}
 function parseLinkCode(code){
  const text=String(code||'').replace(/\s+/g,'');
  if(TOKEN.test(text))return {baseUrl:null,token:text};
  if(!text.startsWith(LINK_PREFIX))throw Error('Codice non riconosciuto: copialo da RADIX › Lead Intelligence › Collega estensione');
  let data;
  try{data=JSON.parse(b64urlDecode(text.slice(LINK_PREFIX.length)))}catch{throw Error('Codice incompleto: copialo di nuovo per intero')}
  if(!data||typeof data.t!=='string'||!TOKEN.test(data.t))throw Error('Codice incompleto: copialo di nuovo per intero');
  return {baseUrl:normalizeBaseUrl(data.u),token:data.t};
 }
 // Reads (without verifying) the public part of the token to show workspace
 // and expiry. Only the RADIX server decides whether the token is valid.
 function tokenInfo(token,now){
  if(typeof token!=='string'||!TOKEN.test(token))return null;
  try{
   const p=JSON.parse(b64urlDecode(token.split('.')[1]));
   if(!p||typeof p.ws!=='string'||!Number.isInteger(p.exp))return null;
   const t=now===undefined?Date.now():now;
   return {workspace:p.ws,expiresAt:new Date(p.exp*1000).toISOString(),expired:p.exp*1000<=t};
  }catch{return null}
 }
 function isSupportedUrl(href){
  let url;try{url=new URL(String(href||''))}catch{return false}
  return url.protocol==='https:'&&['www.linkedin.com','linkedin.com'].includes(url.hostname)&&/^\/sales\/(search\/people|lists\/people)(?:\/|$)/.test(url.pathname);
 }
 function isBlockedUrl(href){return /\/(login|checkpoint|challenge|authwall|uas\/login|sales\/login)/i.test(String(href||''))}
 // RADIX keeps source URLs up to 1000 characters: long search URLs keep only
 // their path, which still identifies Sales Navigator as the source.
 function sourceUrlFor(href){
  const url=new URL(String(href));url.hash='';
  if(url.protocol!=='https:')throw Error('Fonte HTTPS richiesta');
  const full=url.toString();
  return full.length<=1000?full:(url.origin+url.pathname).slice(0,1000);
 }
 const key=row=>String(row.profileUrl||'').split('?')[0].replace(/\/$/,'').toLowerCase();
 function mergeRows(existing,incoming,max){
  const rows=(existing||[]).slice(),seen=new Set(rows.map(key)),added=[];
  const limit=max===undefined?MAX_CONTACTS:clampMax(max);
  for(const row of incoming||[]){
   if(rows.length>=limit)break;
   const k=key(row);if(!k||seen.has(k))continue;
   seen.add(k);rows.push(row);added.push(row);
  }
  return {rows,added};
 }
 function pad(n){return String(n).padStart(2,'0')}
 function jobTitle(count,date){
  const d=date||new Date();
  return (SOURCE_LABEL+' · '+pad(d.getDate())+'/'+pad(d.getMonth()+1)+'/'+d.getFullYear()+' '+pad(d.getHours())+':'+pad(d.getMinutes())+' · '+count+' contatti').slice(0,120);
 }
 // Same payload as the local agent's «Backup RADIX JSON» and Lead Intelligence
 // «Salva backup lavoro»: lead-contact-batches v1 without the transient `last`.
 function buildJob(rows,sourceUrl,runId){
  if(!B)throw Error('Modulo lotti RADIX non caricato');
  if(!Array.isArray(rows)||!rows.length)throw Error('Nessun contatto da importare');
  if(rows.length>MAX_CONTACTS)throw Error('Massimo '+MAX_CONTACTS+' contatti per importazione');
  const id=String(runId||'run').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,40)||'run';
  let job=B.start(sourceUrl);
  const fields=['fullName','firstName','lastName','jobTitle','companyName','location','profileUrl','sourceUrl'];
  const clean=rows.map(r=>{const o={};for(const f of fields)o[f]=String(r[f]||'');o.sourceUrl=o.sourceUrl||job.sourceUrl;return o});
  for(let i=0;i<clean.length;i+=BATCH_SIZE)job=B.add(job,clean.slice(i,i+BATCH_SIZE),'ext-'+id+'-'+(i/BATCH_SIZE));
  const payload={...job};delete payload.last;
  return payload;
 }
 function importBody(workspace,title,payload){return {workspace,entity:'lead_contact_jobs',action:'create',data:{title,payload}}}
 function randomDelay(min,max,rand){const r=typeof rand==='function'?rand():Math.random();return Math.round(min+(max-min)*Math.min(1,Math.max(0,r)))}
 async function readJson(response){
  let body={};try{body=await response.json()}catch{}
  if(!response.ok){
   const message=body&&body.error?body.error:'RADIX ha risposto '+response.status;
   const e=Error(response.status===401?'Collegamento scaduto: genera un nuovo codice in RADIX. ('+message+')':message);e.status=response.status;throw e;
  }
  return body;
 }
 function headers(token,json){return {...(json?{'Content-Type':'application/json'}:{}),'x-radix-sales':'1',Authorization:'Bearer '+token}}
 async function checkLink({baseUrl,token,fetchImpl}){
  const f=fetchImpl||fetch;
  const response=await f(normalizeBaseUrl(baseUrl)+'/api/sales?entity=lead_import_check',{method:'GET',credentials:'include',headers:headers(token,false)});
  return readJson(response);
 }
 async function uploadContacts({baseUrl,token,rows,sourceUrl,runId,date,fetchImpl}){
  const info=tokenInfo(token);
  if(!info)throw Error('Estensione non collegata a RADIX');
  if(info.expired)throw Error('Collegamento scaduto: genera un nuovo codice in RADIX');
  const payload=buildJob(rows,sourceUrl,runId),title=jobTitle(payload.records.length,date);
  const f=fetchImpl||fetch;
  const response=await f(normalizeBaseUrl(baseUrl)+'/api/sales',{method:'POST',credentials:'include',headers:headers(token,true),body:JSON.stringify(importBody(info.workspace,title,payload))});
  const body=await readJson(response),row=body.rows&&body.rows[0];
  if(!row||!row.id)throw Error('Risposta RADIX inattesa');
  return {id:row.id,title:row.title||title,version:row.version,count:payload.records.length,workspace:info.workspace};
 }
 // With the created job, the link opens it straight away in the Lead pipeline of its workspace.
 function leadIntelligenceUrl(baseUrl,job){return normalizeBaseUrl(baseUrl)+'/lead-intelligence.html'+(job&&B&&B.openHash?B.openHash(job.workspace,job.id):'')}
 // Results page number from the Sales Navigator address (?page=N), 1 when absent.
 function pageFromUrl(href){try{const n=Number(new URL(String(href)).searchParams.get('page'));return Number.isInteger(n)&&n>0?n:1}catch{return 1}}
 // A run ended before its natural end (max reached or last page): error, block or stop by the user.
 const stoppedEarly=run=>!!(run&&run.endReason&&run.endReason!=='done');
 // Final message after the upload: keeps visible why the run ended when it ended early.
 function finishMessage(count,endReason,endMessage){
  const base='Importati '+count+' contatti in RADIX.';
  return endReason&&endReason!=='done'&&endMessage?base+' '+endMessage:base;
 }
 const CONTINUE_HINT='Resta su questa pagina e premi «Nuova importazione» per continuare da qui.';
 const api={DEFAULT_BASE,MAX_CHOICES,MAX_CONTACTS,BATCH_SIZE,SOURCE_LABEL,LINK_PREFIX,clampMax,normalizeBaseUrl,makeLinkCode,parseLinkCode,tokenInfo,isSupportedUrl,isBlockedUrl,sourceUrlFor,mergeRows,jobTitle,buildJob,importBody,randomDelay,checkLink,uploadContacts,leadIntelligenceUrl,pageFromUrl,stoppedEarly,finishMessage,CONTINUE_HINT};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.RadixImportCore=api;
})(typeof window!=='undefined'?window:globalThis);
