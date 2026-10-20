'use strict';
/* Lead Intelligence as a guided flow: 1 Acquisisci → 2 Rivedi i lead → 3 Porta nel CRM → 4 Email e newsletter.
   Presentation only: it shows and hides the existing sections ([data-step], [data-mode-panel]) and drives the
   existing buttons (#contact-job-list, #contact-job-load, #lp-crm…), so every check and confirm stays where it was.
   One workspace picker (#archive-workspace, owned by lead-archive.js) is the source the other pickers follow.
   Browser storage keeps only two conveniences (chosen mode, last workspace id), never lead data.
   The pickers that already follow it (bulk «Porta nel CRM», single lead, newsletter) are hidden while they show the
   same workspace; they stay in the page and come back as soon as they differ.
   LinkedIn lists can be ticked and opened together (lead-contact-workbench.js › radixLeadContacts.openJobs).
   Deep links: #mode=linkedin|file|provider|backup, #step=1..4, any element id (#lead-import, #radix-extension-link…).
   #lead-job=<id>&ws=<uuid> belongs to lead-contact-workbench.js: here it only selects LinkedIn and step 2. */
(()=>{
 const $=id=>document.getElementById(id),flow=$('lead-flow');if(!flow)return;
 const Tabs=window.RadixLeadTabs;
 const MODES=['linkedin','file','provider','backup'],STEPS=[1,2,3,4],DEFAULT_TAB={1:'',2:'',3:'bulk',4:'contatto'};
 const KEY_MODE='radix.leadFlow.mode',KEY_WS='radix.leadFlow.workspace',OPEN_WINDOW=30000;
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const store={get(k){try{return window.localStorage.getItem(k)||''}catch{return ''}},set(k,v){try{window.localStorage.setItem(k,v)}catch{}}};
 const state={step:0,mode:'',pendingOpen:0,lastRefresh:0,opening:false,merging:false,picked:new Set(),counts:new Map()};
 const FOLLOWERS=['bulk-workspace','sync-workspace','nl-workspace'];
 const ws=$('archive-workspace'),jobSel=$('contact-job-select');
 const wsValue=()=>ws&&UUID.test(ws.value)?ws.value:'';
 const hashJob=()=>/(?:^#|&)lead-job=/.test(location.hash);
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=String(text);if(cls)n.className=cls;return n};
 const say=(id,text)=>{const n=$(id);if(n)n.textContent=text};

 // ---- steps ----
 function setStep(n,opts={}){
  n=STEPS.includes(Number(n))?Number(n):1;state.step=n;document.body.dataset.step=String(n);
  for(const x of document.querySelectorAll('[data-step]'))x.hidden=!x.dataset.step.split(' ').includes(String(n));
  for(const b of flow.querySelectorAll('.lf-steps [data-go-step]')){
   const k=Number(b.dataset.goStep);
   if(k===n)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');
   b.closest('li')?.classList.toggle('lf-done',k<n);
  }
  Tabs?.show(opts.tab!==undefined?opts.tab:DEFAULT_TAB[n]);
  // Step 3 opens the existing bulk «Porta nel CRM» (it reads the CRM and checks duplicates; nothing is created).
  if(n===3&&Tabs?.current()==='bulk'&&$('bulk-crm')?.hidden&&!state.opening){state.opening=true;try{$('lp-crm')?.click()}finally{state.opening=false}}
  bulkHint();
  if(opts.scroll&&flow.getBoundingClientRect().top<0)flow.scrollIntoView({block:'start'});
 }
 function bulkHint(){const h=$('lf-bulk-empty');if(h)h.hidden=!$('bulk-crm')?.hidden}

 // ---- acquisition modes ----
 function setMode(m,opts={}){
  if(!MODES.includes(m))m='linkedin';state.mode=m;
  for(const b of document.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===m));
  for(const p of document.querySelectorAll('[data-mode-panel]'))p.hidden=p.dataset.modePanel!==m;
  if(opts.remember!==false)store.set(KEY_MODE,m);
  if(m==='linkedin')refreshJobs();
 }

 // ---- one workspace for the page ----
 function preferWorkspace(select){
  const v=wsValue();if(select&&v&&[...select.options].some(o=>o.value===v))select.value=v;
  tidyPickers();
 }
 // A follower picker showing the top workspace is redundant: hide its label (the select keeps working).
 function tidyPickers(){
  const v=wsValue();
  for(const id of FOLLOWERS){const s=$(id),label=s?.closest('label');if(label)label.classList.toggle('lf-follows',Boolean(v)&&s.value===v)}
 }
 function follow(){
  const v=wsValue();if(!v)return;
  for(const id of FOLLOWERS){
   const s=$(id);if(!s||s.disabled||s.value===v||![...s.options].some(o=>o.value===v))continue;
   s.value=v;
   // A closed bulk panel reads the CRM only when opened: no event needed.
   if(id==='bulk-workspace'&&$('bulk-crm')?.hidden)continue;
   s.dispatchEvent(new Event('change'));
  }
  tidyPickers();
 }
 function autoPick(){
  if(!ws||ws.disabled||wsValue()||hashJob())return;
  const opts=[...ws.options].filter(o=>UUID.test(o.value));if(!opts.length)return;
  const saved=store.get(KEY_WS),pick=opts.find(o=>o.value===saved)||(opts.length===1?opts[0]:null);
  if(!pick)return;
  ws.value=pick.value;ws.dispatchEvent(new Event('change'));
 }
 function onWorkspace(){
  const v=wsValue();
  say('lf-ws-hint',v?'Vale per tutta la pagina: liste, CRM e newsletter.':'Scegli il workspace: vale per tutta la pagina.');
  tidyPickers();
  if(!v){renderJobs();return}
  store.set(KEY_WS,v);follow();refreshJobs(true);
 }

 // ---- LinkedIn: jobs the extension saved in the workspace (read through the existing «Aggiorna» button) ----
 function refreshJobs(force){
  if(!wsValue()){renderJobs();return}
  if(!force&&Date.now()-state.lastRefresh<4000)return;
  state.lastRefresh=Date.now();say('lf-jobs-status','Leggo le liste del workspace…');
  $('contact-job-list')?.click();
 }
 function parseJob(o){
  const m=/^(.*) · (\d+) contatti · v\d+$/.exec(o.textContent||'');
  const title=m?m[1]:o.textContent||'Lista';
  return {id:o.value,title,count:m?Number(m[2]):null,label:title.replace(/^LinkedIn Sales Navigator · /,'').replace(/ · \d+ contatti$/,'')};
 }
 function renderJobs(){
  const list=$('lf-jobs');if(!list||!jobSel)return;list.replaceChildren();
  if(!wsValue()){state.picked.clear();const multi=$('lf-jobs-multi');if(multi)multi.hidden=true;say('lf-jobs-status','Scegli il workspace in alto: qui compariranno le liste importate.');say('lf-ext-status','Scegli il workspace in alto per collegare l’estensione e vedere le importazioni.');return}
  const all=[...jobSel.options].filter(o=>o.value).map(parseJob),li=all.filter(j=>/linkedin/i.test(j.title));
  const ids=new Set(li.map(j=>j.id));for(const id of [...state.picked])if(!ids.has(id))state.picked.delete(id);
  state.counts=new Map(li.map(j=>[j.id,j.count]));
  for(const j of li){
   const item=el('li'),text=el('div'),tick=el('label',null,'lf-pick'),box=el('input');
   box.type='checkbox';box.dataset.pick=j.id;box.checked=state.picked.has(j.id);box.setAttribute('aria-label','Seleziona la lista '+j.label);
   tick.append(box);
   text.append(el('strong',j.label),el('small',j.count==null?'Importata dall’estensione':j.count+' contatti'));
   const open=el('button','Apri','lp-btn lp-primary');open.type='button';open.dataset.job=j.id;
   open.setAttribute('aria-label','Apri la lista '+j.label);
   item.append(tick,text,open);list.append(item);
  }
  const multi=$('lf-jobs-multi');if(multi)multi.hidden=li.length<2;
  picked();
  const others=all.length-li.length;
  if(!state.lastRefresh)return;
  say('lf-jobs-status',li.length?(others?(others===1?'C’è anche un’altra lista salvata: la trovi in «Provider».':'Ci sono anche '+others+' altre liste salvate: le trovi in «Provider».'):''):all.length?'Nessuna lista da LinkedIn. Le '+all.length+' liste salvate sono in «Provider».':'Nessuna lista ancora: importa da Sales Navigator con l’estensione, poi premi «Aggiorna».');
  say('lf-ext-status',li.length?'L’estensione ha importato '+li.length+(li.length===1?' lista':' liste')+' in questo workspace. Ultima: '+li[0].label+'.':'Nessuna importazione dall’estensione in questo workspace. Collegala qui sotto.');
 }
 function openJob(id){
  if(!jobSel||![...jobSel.options].some(o=>o.value===id))return;
  jobSel.value=id;state.pendingOpen=Date.now();
  $('contact-job-load')?.click();
 }
 // ---- several LinkedIn lists at once ----
 function picked(){
  const n=state.picked.size,btn=$('lf-jobs-open-selected'),all=$('lf-jobs-toggle-all');
  if(btn)btn.disabled=!n||state.merging;
  if(all){all.disabled=state.merging;all.textContent=n&&n===state.counts.size?'Deseleziona tutte':'Seleziona tutte'}
  const sum=[...state.picked].reduce((t,id)=>t+(state.counts.get(id)||0),0);
  say('lf-jobs-picked',!n?'Spunta due o più liste per aprirle insieme: chi compare in più liste resta una volta sola.'
   :n===1?'1 lista selezionata: spuntane un’altra per aprirle insieme.'
   :n+' liste selezionate · '+sum+' contatti prima di unire i doppioni.');
 }
 // «Seleziona tutte» / «Deseleziona tutte»: every LinkedIn list in the panel, or none.
 function toggleAll(){
  if(state.merging)return;
  const every=state.picked.size===state.counts.size;state.picked.clear();
  if(!every)for(const id of state.counts.keys())state.picked.add(id);
  for(const b of document.querySelectorAll('#lf-jobs [data-pick]'))b.checked=state.picked.has(b.dataset.pick);
  picked();
 }
 async function openPicked(){
  const open=window.radixLeadContacts?.openJobs;if(!open||!state.picked.size||state.merging)return;
  // Same order as the list (newest first); the merge prefers the newer list on ties.
  const ids=[...jobSel.options].map(o=>o.value).filter(v=>state.picked.has(v));
  state.merging=true;picked();state.pendingOpen=Date.now();
  let r=null;try{r=await open(ids)}finally{state.merging=false;picked()}
  if(!r){state.pendingOpen=0;return}
  say('lf-jobs-status',r.note);
  const note=$('lp-open-status');if(note){note.textContent=r.note;note.hidden=false}
 }
 // Messages of the existing archive code, shown next to the LinkedIn list (the routine «N lavori disponibili» is not).
 function mirrorJobs(){const t=$('contact-job-status')?.textContent||'';if(t&&!/liste salvate nel workspace|lavori disponibili/.test(t))say('lf-jobs-status',t)}
 function mirrorBackup(){if(state.mode==='backup')say('lf-backup-status',$('contact-status')?.textContent||'')}

 // ---- counts ----
 function counts(){
  const n=window.RadixLeadPipeline?.leads?.().length||0,badge=$('lf-count');
  if(badge){badge.hidden=!n;badge.textContent=String(n)}
  say('lf-next-text',n?'Hai '+n+(n===1?' lead':' lead')+' nella lista.':'Nessun lead ancora: scegli da dove prenderli.');
 }
 function onContacts(e){
  counts();
  if(state.pendingOpen&&Date.now()-state.pendingOpen<OPEN_WINDOW&&(e.detail?.count||0)>0){
   state.pendingOpen=0;setStep(2);$('lead-pipeline')?.scrollIntoView?.({block:'start'});
  }
 }

 // ---- deep links ----
 function reveal(id){
  const target=id&&document.getElementById(id);if(!target||target.contains(flow))return false;
  const modePanel=target.closest('[data-mode-panel]');
  if(modePanel){setMode(modePanel.dataset.modePanel);setStep(1)}
  else{
   const tab=Tabs?.panelOf(id),btn=tab&&document.querySelector('#lp-tabs [data-tab="'+tab+'"]');
   if(btn)setStep(btn.dataset.step,{tab});
   else{const s=target.closest('[data-step]');if(s)setStep(s.dataset.step.split(' ')[0])}
  }
  for(let d=target.closest('details');d;d=d.parentElement?.closest('details'))d.open=true;
  requestAnimationFrame(()=>target.scrollIntoView?.({block:'start'}));
  return true;
 }
 function fromHash(){
  let raw='';try{raw=decodeURIComponent(location.hash.slice(1))}catch{return false}
  if(!raw)return false;
  if(hashJob()){setMode('linkedin',{remember:false});setStep(2);return true}
  if(raw.includes('=')){
   const p=new URLSearchParams(raw),m=p.get('mode'),s=p.get('step');let done=false;
   if(MODES.includes(m)){setMode(m);setStep(1);done=true}
   if(s&&STEPS.includes(Number(s))){setStep(s);done=true}
   return done;
  }
  return reveal(raw);
 }

 // ---- wiring ----
 document.addEventListener('click',e=>{
  const go=e.target.closest('[data-go-step]');if(go){setStep(go.dataset.goStep,{scroll:true});return}
  const mode=e.target.closest('[data-mode]');
  if(mode){setMode(mode.dataset.mode);setStep(1);document.querySelector('[data-mode-panel="'+state.mode+'"]')?.scrollIntoView?.({block:'nearest',behavior:'smooth'});return}
  const job=e.target.closest('#lf-jobs [data-job]');if(job){openJob(job.dataset.job);return}
  const box=e.target.closest('#lf-jobs [data-pick]');if(box){if(box.checked)state.picked.add(box.dataset.pick);else state.picked.delete(box.dataset.pick);picked();return}
  const a=e.target.closest('a[href^="#"]');if(a&&a.getAttribute('href').length>1)reveal(a.getAttribute('href').slice(1).split('&')[0]);
 });
 $('lf-jobs-refresh')?.addEventListener('click',()=>refreshJobs(true));
 $('lf-jobs-open-selected')?.addEventListener('click',openPicked);
 $('lf-jobs-toggle-all')?.addEventListener('click',toggleAll);
 for(const id of FOLLOWERS){const s=$(id);if(!s)continue;s.addEventListener('change',tidyPickers);new MutationObserver(tidyPickers).observe(s,{childList:true,attributes:true})}
 $('lp-crm')?.addEventListener('click',()=>{if(state.step!==3)setStep(3,{tab:'bulk'})});
 $('lp-more-leads')?.addEventListener('click',()=>setStep(1,{scroll:true}));
 $('bulk-close')?.addEventListener('click',()=>{if($('bulk-crm')?.hidden)setStep(2)});
 $('contact-restore')?.addEventListener('click',()=>{state.pendingOpen=Date.now()});
 // «Applica ICP al form» of a linked project scrolls to the ICP form: open it first.
 $('lead-growth-apply-icp')?.addEventListener('click',()=>reveal('lead-icp'));
 if(ws){
  ws.addEventListener('change',onWorkspace);
  new MutationObserver(autoPick).observe(ws,{childList:true});
 }
 if(jobSel)new MutationObserver(renderJobs).observe(jobSel,{childList:true});
 if($('contact-job-status'))new MutationObserver(mirrorJobs).observe($('contact-job-status'),{childList:true,characterData:true,subtree:true});
 if($('contact-status'))new MutationObserver(mirrorBackup).observe($('contact-status'),{childList:true,characterData:true,subtree:true});
 if($('bulk-crm'))new MutationObserver(bulkHint).observe($('bulk-crm'),{attributes:true,attributeFilter:['hidden']});
 // Lists imported in another tab (the extension) appear when you come back.
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&state.step===1&&state.mode==='linkedin')refreshJobs()});
 window.addEventListener('radix:lead-contacts-updated',onContacts);
 for(const ev of ['radix:lead-list-updated','radix:lead-reviewed','radix:lead-approval-changed'])window.addEventListener(ev,counts);
 window.addEventListener('hashchange',fromHash);
 // An empty list sends you back to step 1.
 const empty=$('lp-empty');
 if(empty){const b=el('button','← Scegli da dove prendere i lead','lp-btn');b.type='button';b.dataset.goStep='1';empty.append(b)}

 window.RadixLeadFlow=Object.freeze({setStep,setMode,preferWorkspace,step:()=>state.step,mode:()=>state.mode});
 const saved=store.get(KEY_MODE);
 setMode(MODES.includes(saved)?saved:'linkedin',{remember:false});
 setStep(1);
 fromHash();
 counts();renderJobs();autoPick();tidyPickers();
})();
