'use strict';
// Content script on Sales Navigator: reads the visibly rendered results,
// scrolls and presses the visible «Avanti» button with human-like pauses, and
// stops at any login, checkpoint or CAPTCHA. It never reads cookies, never
// calls LinkedIn APIs and never hides itself: a RADIX badge stays visible.
(()=>{
 if(window.__radixImport)return;
 const X=window.RadixExtract,C=window.RadixImportCore;
 const state={running:false,stop:false,id:''};
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const timing=window.__radixTiming||{scroll:[800,1800],page:[4000,9000],wait:45000,poll:400,pager:20000};
 const wait=range=>sleep(C.randomDelay(range[0],range[1]));
 const send=msg=>new Promise(resolve=>{
  try{chrome.runtime.sendMessage(msg,r=>{void chrome.runtime.lastError;resolve(r||{ok:false,error:'Estensione non raggiungibile: ricarica la pagina'})})}
  catch{resolve({ok:false,error:'Estensione aggiornata: ricarica la pagina'})}
 });
 function readVisible(){return X.normalizeVisibleCards(X.visibleSearchCards(document),C.sourceUrlFor(location.href))}
 function probe(){
  const supported=C.isSupportedUrl(location.href),challenge=X.detectChallenge(document);
  let visible=0;try{visible=supported&&!challenge?readVisible().length:0}catch{}
  return {ok:true,url:location.href,supported,challenge,visible,total:supported?X.resultsTotalText(document):'',running:state.running};
 }
 async function waitFor(check,ms){
  const end=Date.now()+ms;
  while(Date.now()<end){if(state.stop)return false;if(check())return true;await sleep(timing.poll)}
  return check();
 }
 const blocked=()=>C.isBlockedUrl(location.href)||!!X.detectChallenge(document);
 const PAGE_SIZE=25;
 // Scrolls the results (window and the inner results box) until the page's 25
 // profiles are rendered, or nothing new appears for a while; then down to «Avanti».
 async function collectPage(){
  const seen=new Map(),take=()=>{for(const row of readVisible())if(!seen.has(row.profileUrl))seen.set(row.profileUrl,row)};
  let still=0;
  for(let step=0;step<25&&!state.stop;step++){
   if(blocked())return null;
   const before=seen.size;take();
   still=seen.size===before?still+1:0;
   if(seen.size>=PAGE_SIZE||still>=5)break;
   const last=X.lastProfileAnchor(document),box=X.scrollParent(last);
   if(last)last.scrollIntoView({block:'center'});
   if(box)box.scrollBy(0,Math.round(box.clientHeight*0.6));
   window.scrollBy(0,Math.round(window.innerHeight*0.6));
   await wait(timing.scroll);
  }
  if(state.stop)return Array.from(seen.values());
  if(blocked())return null;
  const next=X.findNextButton(document),last=X.lastProfileAnchor(document),box=X.scrollParent(last);
  if(box)box.scrollTop=box.scrollHeight;
  if(next)next.scrollIntoView({block:'center'});else window.scrollTo(0,document.documentElement.scrollHeight);
  await wait(timing.scroll);
  if(blocked())return null;
  take();
  return Array.from(seen.values());
 }
 // «Avanti» is drawn late, at the very bottom of the results: keep scrolling the window and the results box to
 // the end until it shows up (or a disabled one says this is the last page).
 async function nextButton(){
  const end=Date.now()+(timing.pager||20000);
  for(;;){
   if(state.stop||blocked())return {state:'none',el:null};
   const s=X.paginationState(document);
   if(s.state!=='none')return s;
   if(Date.now()>=end)return s;
   const box=X.scrollParent(X.lastProfileAnchor(document));
   if(box)box.scrollTop=box.scrollHeight;
   window.scrollTo(0,document.documentElement.scrollHeight);
   await sleep(timing.poll*2);
  }
 }
 async function run(max){
  if(state.running)return {ok:false,error:'Importazione già in corso'};
  if(!C.isSupportedUrl(location.href))return {ok:false,error:'Apri una ricerca persone o una lista lead di Sales Navigator'};
  if(blocked())return {ok:false,error:'LinkedIn chiede un accesso o una verifica: completala tu, poi riprova'};
  const id=Date.now().toString(36)+Math.random().toString(36).slice(2,8);
  const started=await send({type:'radix:run-start',id,sourceUrl:location.href,max});
  if(!started.ok)return started;
  Object.assign(state,{running:true,stop:false,id});
  (async()=>{
   let total=0,page=C.pageFromUrl(location.href),reason='done',message='';
   try{
    const limit=C.clampMax(max);
    while(!state.stop){
     if(blocked()){reason='blocked';message='LinkedIn ha chiesto un accesso o una verifica: importazione fermata. Completa la verifica tu stesso.';break}
     const ready=await waitFor(()=>blocked()||readVisible().length>0,timing.wait);
     if(state.stop)break;
     if(blocked()){reason='blocked';message='LinkedIn ha chiesto un accesso o una verifica: importazione fermata.';break}
     if(!ready){reason='empty';message='Nessun risultato visibile a pagina '+page+'.';break}
     const rows=await collectPage();
     if(rows===null){reason='blocked';message='LinkedIn ha chiesto una verifica: importazione fermata.';break}
     const saved=await send({type:'radix:run-rows',id,page,rows});
     if(!saved.ok){reason='error';message=saved.error||'Salvataggio non riuscito';break}
     total=saved.count;
     if(total>=limit){message='Raggiunto il massimo di '+limit+' contatti.';break}
     if(state.stop)break;
     const pager=await nextButton();
     if(state.stop)break;
     if(blocked())continue;
     if(pager.state==='last'){message='Ultima pagina dei risultati raggiunta.';break}
     // No pagination at all is not the last page: say so, so the user can go on from here.
     if(pager.state!=='next'){reason='error';message='Non trovo il pulsante «Avanti» a pagina '+page+': scorri in fondo ai risultati e premi «Nuova importazione».';break}
     const next=pager.el;
     const firstKey=X.firstProfileKey(document),fromPage=C.pageFromUrl(location.href);
     // Moved: other profiles on screen, or the address shows the next page and its results are there.
     const urlMoved=()=>C.pageFromUrl(location.href)!==fromPage;
     const moved=()=>blocked()||(X.firstProfileKey(document)&&X.firstProfileKey(document)!==firstKey)||(urlMoved()&&readVisible().length>0);
     await wait([600,1400]);
     next.scrollIntoView({block:'center'});
     next.click();
     let ok=await waitFor(moved,timing.wait);
     // LinkedIn can be slow: if the address already changed keep waiting, otherwise press «Avanti» once more.
     if(!ok&&!state.stop){
      if(!urlMoved()){
       const again=X.findNextButton(document);
       if(again){await wait([1500,3500]);if(!moved()){again.scrollIntoView({block:'center'});again.click()}}
      }
      ok=await waitFor(moved,timing.wait);
     }
     if(state.stop)break;
     if(!ok){reason='error';message='La pagina '+(page+1)+' non si è caricata in tempo (LinkedIn lento).';break}
     if(blocked())continue;
     // Address changed but the old profiles are still shown: give LinkedIn a little longer to swap them.
     const changed=()=>X.firstProfileKey(document)!==firstKey;
     if(!changed())await waitFor(()=>blocked()||changed(),Math.round(timing.wait/3));
     if(state.stop)break;
     page=Math.max(page+1,C.pageFromUrl(location.href));
     await wait(timing.page);
    }
    if(state.stop&&reason==='done'){reason='stopped';message='Importazione fermata da te.'}
   }catch(e){reason='error';message=e.message}
   state.running=false;
   await send({type:'radix:run-end',id,reason,message});
  })();
  return {ok:true,id};
 }
 chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
  if(sender.id!==chrome.runtime.id||!msg)return false;
  if(msg.type==='radix:probe'){sendResponse(probe());return false}
  if(msg.type==='radix:start'){run(msg.max).then(sendResponse);return true}
  if(msg.type==='radix:stop'){state.stop=true;sendResponse({ok:true});return false}
  return false;
 });
 // A full navigation (login, checkpoint, another page) ends this script: hand over what was collected.
 window.addEventListener('pagehide',()=>{
  if(!state.running)return;
  state.stop=true;state.running=false;
  try{chrome.runtime.sendMessage({type:'radix:run-end',id:state.id,reason:'blocked',message:'La pagina è cambiata durante l’importazione (forse un accesso o una verifica LinkedIn): importazione fermata.'})}catch{}
 });
 window.__radixImport={probe,run,stop:()=>{state.stop=true}};

 // Small visible RADIX badge (bottom right). Shadow DOM keeps LinkedIn styles out.
 function badge(){
  if(!C.isSupportedUrl(location.href)||document.getElementById('radix-import-badge'))return;
  const host=document.createElement('div');host.id='radix-import-badge';
  const root=host.attachShadow({mode:'open'});
  root.innerHTML='<style>:host{all:initial}.b{position:fixed;right:18px;bottom:18px;z-index:2147483000;font:13px/1.35 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1f1640}.pill{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #e4defa;border-radius:999px;padding:7px 12px 7px 8px;box-shadow:0 6px 24px rgba(76,29,149,.16);cursor:pointer}.dot{width:22px;height:22px;border-radius:7px;background:#6d28d9;color:#fff;display:grid;place-items:center;font-weight:700;font-size:12px}.panel{margin-bottom:8px;background:#fff;border:1px solid #e4defa;border-radius:14px;padding:12px;width:240px;box-shadow:0 10px 30px rgba(76,29,149,.18)}.row{display:flex;gap:6px;align-items:center;margin-top:8px}select{flex:1;border:1px solid #d9d0f7;border-radius:8px;padding:6px;font:inherit;background:#fff}button.go{background:#6d28d9;color:#fff;border:0;border-radius:8px;padding:7px 10px;font:inherit;font-weight:600;cursor:pointer}button.go:disabled{opacity:.5;cursor:default}button.stop{background:#fff;color:#6d28d9;border:1px solid #d9d0f7;border-radius:8px;padding:6px 10px;font:inherit;cursor:pointer}.muted{color:#6b6390;font-size:12px}[hidden]{display:none!important}</style><div class="b"><div class="panel" hidden><strong>Importa in RADIX</strong><div class="muted info"></div><div class="row idle"><select aria-label="Numero massimo di contatti"></select><button class="go" type="button">Importa</button></div><div class="row busy" hidden><button class="stop" type="button">Ferma</button></div></div><div class="pill" role="button" tabindex="0" aria-label="RADIX: importa contatti visibili"><span class="dot">R</span><span class="label">Importa in RADIX</span></div></div>';
  const $=s=>root.querySelector(s),select=$('select');
  for(const n of C.MAX_CHOICES){const o=document.createElement('option');o.value=n;o.textContent='Fino a '+n+' contatti';if(n===100)o.selected=true;select.append(o)}
  const toggle=()=>{$('.panel').hidden=!$('.panel').hidden;refresh()};
  $('.pill').addEventListener('click',toggle);
  $('.pill').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle()}});
  $('.go').addEventListener('click',async()=>{$('.go').disabled=true;const r=await run(Number(select.value));if(!r.ok)$('.info').textContent=r.error;$('.go').disabled=false;refresh()});
  $('.stop').addEventListener('click',()=>{state.stop=true;$('.info').textContent='Arresto in corso…'});
  async function refresh(){
   const {run:r}=await chrome.storage.local.get('run').catch(()=>({}));
   const busy=state.running;
   $('.idle').hidden=busy;$('.busy').hidden=!busy;
   if(busy||(r&&r.status&&r.tabId!==undefined)){
    const count=r&&r.rows?r.rows.length:0;
    $('.label').textContent=busy?'RADIX · '+count+(r?'/'+r.max:''):'Importa in RADIX';
    if(r&&r.message)$('.info').textContent=r.message;
   }
   if(!busy&&!(r&&r.message)){const p=probe();$('.info').textContent=p.challenge?'LinkedIn chiede una verifica: completala prima.':p.visible+' persone visibili ora'+(p.total?' · '+p.total:'')}
  }
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.run)refresh()});
  document.documentElement.append(host);
 }
 // Sales Navigator is a single-page app: re-check the address now and then.
 badge();setInterval(()=>{const el=document.getElementById('radix-import-badge');if(!el)badge();else el.style.display=C.isSupportedUrl(location.href)||state.running?'':'none'},3000);
})();
