'use strict';
(async()=>{
 const C=window.RadixImportCore,S=window.RadixSettings;
 const $=id=>document.getElementById(id);
 const show=(id,on)=>{$(id).hidden=!on};
 let tab=null,settings=null;
 for(const n of C.MAX_CHOICES){const o=document.createElement('option');o.value=n;o.textContent='Fino a '+n+' contatti';if(n===100)o.selected=true;$('max').append(o)}
 function say(id,text,kind){$(id).textContent=text||'';$(id).className='status small'+(kind?' '+kind:'')}
 async function renderLink(){
  settings=await S.load();
  const d=S.describe(settings);
  $('link-text').textContent=d.text;$('link-dot').classList.toggle('on',d.linked);
  show('link-form',!d.linked);
 }
 const toTab=msg=>new Promise(resolve=>{
  if(!tab)return resolve(null);
  chrome.tabs.sendMessage(tab.id,msg,r=>{void chrome.runtime.lastError;resolve(r||null)});
 });
 async function renderPage(){
  [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  const p=await toTab({type:'radix:probe'});
  const ready=!!(p&&p.supported);
  show('page-ready',ready);show('page-unsupported',!ready);
  if(!p)$('page-hint').innerHTML='Apri una <b>ricerca persone</b> o una <b>lista lead</b> di Sales Navigator. Se è già aperta, <b>ricarica la pagina</b> (l’estensione è appena stata installata).';
  else if(!p.supported)$('page-hint').innerHTML='Questa pagina non è una ricerca persone o una lista lead di Sales Navigator.';
  if(!ready)return;
  $('visible-count').textContent=String(p.visible);
  $('visible-label').textContent=p.challenge?'LinkedIn chiede un accesso o una verifica: completala tu, poi riapri':'persone visibili in questa pagina'+(p.total?' · '+p.total+' in totale':'');
  $('start').disabled=!!p.challenge||!!p.running;
 }
 function renderRun(run){
  show('run-box',!!run);
  if(!run)return;
  // No progress for 90 s: the LinkedIn tab was closed or reloaded. Keep the contacts, allow sending them.
  if(run.status==='running'&&Date.now()-(run.updatedAt||0)>90000)run={...run,status:'collected',message:'Importazione interrotta (scheda chiusa o ricaricata): puoi inviare i contatti raccolti.'};
  const count=run.rows?run.rows.length:0,running=run.status==='running',uploading=run.status==='uploading';
  const titles={running:'Importazione in corso',uploading:'Invio a RADIX',imported:'Importazione completata',collected:'Contatti raccolti','upload-error':'Invio non riuscito','needs-link':'Da collegare',blocked:'Fermata da LinkedIn'};
  $('run-title').textContent=titles[run.status]||'Importazione';
  $('run-count').textContent=count+' di massimo '+run.max+' contatti'+(run.page?' · pagina '+run.page:'');
  $('run-bar').style.width=Math.min(100,Math.round(count/Math.max(1,run.max)*100))+'%';
  $('run-message').textContent=run.message||'';
  $('run-message').className='status '+(run.status==='imported'?'ok':['upload-error','blocked'].includes(run.status)?'bad':'');
  show('stop',running);
  show('retry',!running&&!uploading&&run.status!=='imported'&&count>0);
  show('backup',!running&&count>0);
  show('clear',!running&&!uploading);
  show('open',run.status==='imported'&&!!run.openUrl);
  if(run.openUrl)$('open').href=run.openUrl;
  $('start').disabled=$('start').disabled||running||uploading;
 }
 $('link-save').onclick=async()=>{
  try{
   say('link-message','Collegamento in corso…');
   const code=$('link-code').value,parsed=C.parseLinkCode(code);
   // A preview address needs a Chrome permission prompt, which would close this popup: finish in the options page.
   if(parsed.baseUrl&&parsed.baseUrl!==C.DEFAULT_BASE&&!(await chrome.permissions.contains({origins:[parsed.baseUrl+'/*']}))){
    await chrome.storage.local.set({pendingCode:code});chrome.runtime.openOptionsPage();return;
   }
   const {baseUrl}=await S.saveLink(code,settings&&settings.baseUrl);
   const s=await S.load(),check=await C.checkLink({baseUrl,token:s.token});
   say('link-message','Collegata al workspace ('+check.role+').','ok');$('link-code').value='';
   await renderLink();
  }catch(e){say('link-message',e.message,'bad');await renderLink().catch(()=>{});show('link-form',true)}
 };
 $('start').onclick=async()=>{
  $('start').disabled=true;say('start-message','');
  if(!settings||!S.describe(settings).linked)say('start-message','Puoi iniziare: collega RADIX prima della fine per inviare i contatti.','warn');
  const r=await toTab({type:'radix:start',max:Number($('max').value)});
  if(!r||!r.ok){say('start-message',(r&&r.error)||'Ricarica la pagina di Sales Navigator e riprova.','bad');$('start').disabled=false}
 };
 $('stop').onclick=()=>{toTab({type:'radix:stop'});$('run-message').textContent='Arresto in corso…'};
 $('retry').onclick=()=>chrome.runtime.sendMessage({type:'radix:upload'});
 $('clear').onclick=async()=>{await chrome.runtime.sendMessage({type:'radix:clear'});renderPage()};
 $('backup').onclick=async()=>{
  const {run}=await chrome.storage.local.get('run');
  if(!run||!run.rows||!run.rows.length)return;
  const payload=C.buildJob(run.rows,run.sourceUrl,run.id);
  const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='radix-contatti-sales-navigator.json';document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
 };
 chrome.storage.onChanged.addListener((changes,area)=>{
  if(area!=='local')return;
  if(changes.run)renderRun(changes.run.newValue);
  if(changes.token||changes.baseUrl)renderLink();
 });
 await renderLink();
 await renderPage();
 renderRun((await chrome.storage.local.get('run')).run);
})();
