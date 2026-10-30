'use strict';
// Service worker: keeps the import run in chrome.storage.local and sends the
// collected contacts to RADIX. It never reads cookies and never contacts
// LinkedIn: the content script reads the page, this worker only talks to RADIX.
importScripts('lead-contact-batches.js','core.js');
const C=self.RadixImportCore;
const store={
 get:keys=>chrome.storage.local.get(keys),
 set:value=>chrome.storage.local.set(value)
};
// Serialise updates: messages from the content script can arrive back to back.
let queue=Promise.resolve();
const serial=fn=>(queue=queue.then(fn,fn));
async function settings(){
 const s=await store.get(['baseUrl','token']);
 return {baseUrl:s.baseUrl||C.DEFAULT_BASE,token:s.token||''};
}
async function upload(){
 const {run}=await store.get('run');
 if(!run||!run.rows||!run.rows.length)throw Error('Nessun contatto raccolto da inviare');
 if(['imported','uploading'].includes(run.status))return;
 const {baseUrl,token}=await settings();
 if(!C.tokenInfo(token)){await store.set({run:{...run,status:'needs-link',message:'Collega l’estensione a RADIX, poi premi «Invia a RADIX».'}});return}
 await store.set({run:{...run,status:'uploading',message:'Invio a RADIX in corso…'}});
 try{
  const result=await C.uploadContacts({baseUrl,token,rows:run.rows,sourceUrl:run.sourceUrl,runId:run.id});
  const {run:latest}=await store.get('run');
  await store.set({run:{...latest,status:'imported',result,openUrl:C.leadIntelligenceUrl(baseUrl,result),message:C.finishMessage(result.count,latest.endReason,latest.endMessage)}});
 }catch(e){
  const {run:latest}=await store.get('run');
  await store.set({run:{...latest,status:'upload-error',message:e.message}});
 }
}
const handlers={
 'radix:run-start':async(msg,sender)=>{
  const {run}=await store.get('run');
  const stale=run&&run.status==='running'&&Date.now()-(run.updatedAt||0)>120000;
  if(run&&run.status==='running'&&!stale&&run.tabId!==sender.tab?.id)return {ok:false,error:'Un’importazione è già in corso in un’altra scheda.'};
  const next={id:msg.id,tabId:sender.tab?.id,sourceUrl:C.sourceUrlFor(msg.sourceUrl),max:C.clampMax(msg.max),rows:[],page:0,status:'running',message:'Lettura dei risultati visibili…',startedAt:Date.now(),updatedAt:Date.now()};
  await store.set({run:next});
  return {ok:true};
 },
 'radix:run-rows':async msg=>{
  const {run}=await store.get('run');
  if(!run||run.id!==msg.id||run.status!=='running')return {ok:false,error:'Importazione non attiva'};
  const merged=C.mergeRows(run.rows,msg.rows,run.max);
  await store.set({run:{...run,rows:merged.rows,page:msg.page||run.page,message:'Pagina '+(msg.page||run.page)+' · '+merged.rows.length+' contatti raccolti',updatedAt:Date.now()}});
  return {ok:true,count:merged.rows.length};
 },
 'radix:run-end':async msg=>{
  const {run}=await store.get('run');
  // Only the first end counts: a late duplicate must not import the same contacts twice.
  if(!run||run.id!==msg.id||run.status!=='running')return {ok:false};
  const ended={...run,status:msg.reason==='blocked'?'blocked':'collected',endReason:msg.reason,endMessage:msg.message||'',message:msg.message||'',updatedAt:Date.now()};
  await store.set({run:ended});
  if(ended.rows.length)await upload();
  return {ok:true};
 },
 'radix:upload':async()=>{await upload();return {ok:true}},
 'radix:clear':async()=>{await chrome.storage.local.remove('run');return {ok:true}}
};
chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
 const fn=msg&&handlers[msg.type];
 if(!fn)return false;
 // Messages from other extensions or web pages are not accepted.
 if(sender.id!==chrome.runtime.id){sendResponse({ok:false,error:'Mittente non valido'});return false}
 serial(()=>fn(msg,sender)).then(sendResponse,e=>sendResponse({ok:false,error:e.message}));
 return true;
});
