/* Regia RADIX · CRM adapter (radix-sales.html, area 'crm'). It reads the rows the CRM page already loaded
   (window.RadixSalesApp of sales/sales.js) and computes the numbers with the CRM's own pure cores: the day's agenda
   (crm-today-core), the stale deals (crm-automations-core, rule «Trattativa ferma», 14 days), the follow-ups, the
   pipeline by stage. Three ops, each validated against those rows and applied only on «Sì, applica» through the
   page's /api/sales commands (RadixSalesApp.api, the same body sales.js sends), each with its undo:
     task_add    a to-do on a contact (tasks create, built by crm-record-core composerPlan), due in Europe/Rome;
     deal_stage  an open deal to another stage of its process (opportunities transition, with a new key);
     task_due    a new due date for an open task (tasks update with the record version).
   Never sends: an email or a message stays a draft written in the chat (the core rejects any send op).
   UMD: registers itself with RadixRegiaCore in the browser; Node gets create(env) for the tests. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else{root.RadixRegiaCrm=api;if(root.RadixRegiaCore)root.RadixRegiaCore.register('crm',api.adapter)}})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const need=(name,file)=>root[name]||(typeof require==='function'?require(file):null);
const D=()=>need('RadixCrmDates','../sales/crm-dates-core.js');
const T=()=>need('RadixCrmTodayCore','../sales/crm-today-core.js');
const A=()=>need('RadixCrmAutomations','../sales/crm-automations-core.js');
const R=()=>need('RadixCrmRecordCore','../sales/crm-record-core.js');
const DAY=864e5,STALE_DAYS=14,ENTITIES=['contacts','companies','opportunities','tasks','interactions','stages','processes','members'];
const PRIORITIES=['low','normal','high','urgent'];
const one=(v,n)=>{const s=String(v==null?'':v).replace(/\s+/g,' ').trim();return n&&s.length>n?s.slice(0,n-1)+'…':s};
// «€ 15.700»: whole euros with the Italian thousands dot, the same in every browser and in Node.
const eur=c=>'€ '+String(Math.round(Number(c||0)/100)).replace(/\B(?=(\d{3})+(?!\d))/g,'.');
const norm=s=>one(s).toLocaleLowerCase('it');
const isOpenDeal=o=>o&&(!o.outcome||o.outcome==='open');
const rowsOf=(state,e)=>Array.isArray(state&&state.rows&&state.rows[e])?state.rows[e]:[];
const nowOf=state=>Number.isFinite(state&&state.now)?state.now:Date.now();
const nameOf=r=>r?(r.name||r.title||''):'';

// ---- lookups: by id first, else by the exact name when it is unique ----
function find(list,id,name,field){if(id!=null&&String(id).trim()){const x=list.find(r=>r.id===String(id).trim());return x||null}
 const n=norm(name);if(!n)return null;const hits=list.filter(r=>norm(r[field||'name'])===n);return hits.length===1?hits[0]:null}
const contactOf=(state,op)=>find(rowsOf(state,'contacts'),op.contactId,op.contact,'name');
const dealOf=(state,op)=>find(rowsOf(state,'opportunities'),op.dealId,op.deal,'title');
const taskOf=(state,op)=>find(rowsOf(state,'tasks'),op.taskId,op.task,'title');
const stagesOf=(state,processId)=>rowsOf(state,'stages').filter(s=>s.process_id===processId).sort((a,b)=>(a.position||0)-(b.position||0));
function stageOf(state,deal,op){const list=stagesOf(state,deal.process_id);return find(list,op.stageId,op.stage,'title')}
const stageName=(state,id)=>{const s=rowsOf(state,'stages').find(x=>x.id===id);return s?s.title:'senza fase'};
const contactName=(state,id)=>nameOf(rowsOf(state,'contacts').find(c=>c.id===id));

// The due date of an op in ora italiana: due 'YYYY-MM-DD' (time from op.time, else 09:00) or 'YYYY-MM-DDTHH:MM'.
// {local, iso, ms} or {error}; a moment already past is refused.
function dueOf(op,now){const raw=one(op.due||op.date||'');let local=raw;
 if(/^\d{4}-\d{2}-\d{2}$/.test(raw)){const t=one(op.time||'09:00');if(!/^\d{2}:\d{2}$/.test(t))return {error:'Ora non valida: usa HH:MM.'};local=raw+'T'+t}
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))return {error:'Manca la scadenza: usa una data AAAA-MM-GG.'};
 const iso=R().localToUtc(local);if(!iso)return {error:'Scadenza non valida: «'+raw+'».'};
 const ms=Date.parse(iso);if(!(ms>now))return {error:'La scadenza '+D().dateTimeLabel(ms)+' è già passata: scegli un momento da adesso in avanti.'};
 return {local,iso,ms}}
const dueText=iso=>{const ms=Date.parse(iso||'');return Number.isFinite(ms)?D().dateTimeLabel(ms):'senza scadenza'};

// ---- numbers ----
function staleDeals(state){const now=nowOf(state),inter=rowsOf(state,'interactions');
 const items=A().plan('stale-deal',{opportunities:rowsOf(state,'opportunities'),tasks:rowsOf(state,'tasks'),interactions:inter},{now}).items;
 return items.map(it=>{const o=it.record,last=Math.max(0,...inter.filter(i=>i.opportunity_id===o.id||(o.contact_id&&i.contact_id===o.contact_id)).map(i=>Date.parse(i.occurred_at)||0));
  return {deal:o,days:last?Math.floor((now-last)/DAY):null}}).sort((a,b)=>Number(b.deal.amount_cents||0)-Number(a.deal.amount_cents||0))}
function pipeline(state){const procs=rowsOf(state,'processes'),many=new Set(rowsOf(state,'opportunities').filter(isOpenDeal).map(o=>o.process_id)).size>1;
 const by=new Map();for(const o of rowsOf(state,'opportunities')){if(!isOpenDeal(o))continue;const k=o.stage_id||'';if(!by.has(k))by.set(k,{n:0,cents:0,deal:o});const g=by.get(k);g.n++;g.cents+=Number(o.amount_cents||0)}
 const stages=rowsOf(state,'stages'),pos=id=>{const s=stages.find(x=>x.id===id);return s?[String(s.process_id),s.position||0]:['~',1e9]};
 return [...by.entries()].sort((a,b)=>{const x=pos(a[0]),y=pos(b[0]);return x[0].localeCompare(y[0])||x[1]-y[1]}).map(([id,g])=>{const s=stages.find(x=>x.id===id),p=s&&procs.find(x=>x.id===s.process_id);
  return {stageId:id||null,stage:s?s.title:'Senza fase',process:p?p.title:'',label:(many&&p?p.title+' › ':'')+(s?s.title:'Senza fase'),deals:g.n,cents:g.cents}})}
function agendaOf(state){return T().agenda(rowsOf(state,'tasks'),nowOf(state),state&&state.me)}
const who=(state,t)=>T().target(t,rowsOf(state,'contacts'),rowsOf(state,'companies')).name;

function digest(state){const ag=agendaOf(state),open=rowsOf(state,'opportunities').filter(isOpenDeal),stale=staleDeals(state);
 return {oggi:ag.today.length,scadute:ag.overdue.length,mie:ag.mine,trattativeAperte:open.length,valoreAperto:eur(open.reduce((s,o)=>s+Number(o.amount_cents||0),0)),
  ferme14giorni:stale.length,pipeline:pipeline(state).map(p=>({fase:p.label,trattative:p.deals,valore:eur(p.cents)}))}}

// Compact summary for the AI: today's calls with the ids the ops name, the stale deals, the stages it may use.
function context(state){if(!state||!state.workspace)return 'CRM: nessun workspace caricato, nessun dato da leggere.';
 const now=nowOf(state),ag=agendaOf(state),stale=staleDeals(state),open=rowsOf(state,'opportunities').filter(isOpenDeal);
 const partial=ENTITIES.some(e=>rowsOf(state,e).length>=100)?' (primi 100 record per tipo)':'';
 const task=t=>'«'+one(t.title,60)+'»'+(who(state,t)?' con '+one(who(state,t),40):'')+' ('+T().dueLabel(t.due_at,now)+') id '+t.id;
 const deal=s=>'«'+one(s.deal.title,60)+'»'+(s.deal.contact_id?' · '+one(contactName(state,s.deal.contact_id),40):'')+' · '+eur(s.deal.amount_cents)+' · fase '+stageName(state,s.deal.stage_id)+' · '+(s.days==null?'nessun contatto registrato':'ultimo contatto '+s.days+' giorni fa')+' id '+s.deal.id;
 const procs=rowsOf(state,'processes').filter(p=>open.some(o=>o.process_id===p.id));
 return 'CRM'+partial+': '+rowsOf(state,'contacts').length+' contatti, '+open.length+' trattative aperte ('+eur(open.reduce((s,o)=>s+Number(o.amount_cents||0),0))+'), '+
  rowsOf(state,'tasks').filter(t=>t.status!=='done').length+' attività aperte. Oggi '+D().dateLabel(D().dayOf(now))+'.'+(state.writable===false?' Ruolo in sola lettura: niente modifiche.':'')+'\n'+
  (ag.overdue.length?'Follow-up scaduti ('+ag.overdue.length+'): '+ag.overdue.slice(0,6).map(task).join('; ')+'.\n':'Nessun follow-up scaduto.\n')+
  (ag.today.length?'Da fare oggi ('+ag.today.length+'): '+ag.today.slice(0,6).map(task).join('; ')+'.\n':'Niente in scadenza per il resto di oggi.\n')+
  (stale.length?'Trattative ferme da '+STALE_DAYS+'+ giorni ('+stale.length+'): '+stale.slice(0,6).map(deal).join('; ')+'.\n':'Nessuna trattativa ferma da '+STALE_DAYS+' giorni.\n')+
  'Pipeline per fase: '+(pipeline(state).map(p=>p.label+' '+p.deals+' ('+eur(p.cents)+')').join('; ')||'nessuna trattativa aperta')+'.\n'+
  (procs.length?'Fasi disponibili: '+procs.map(p=>p.title+': '+stagesOf(state,p.id).map(s=>s.title).join(' → ')).join(' | ')+'.\n':'')+
  'Le email e i messaggi non partono da qui: una bozza la scrivi come testo nella chat.'}

// The real numbers in the panel, no AI.
function view(state){if(!state||!state.workspace)return null;const d=digest(state);
 return {title:'Oggi nel CRM',items:['Follow-up scaduti: '+d.scadute+' · in scadenza oggi: '+d.oggi,'Trattative ferme da '+STALE_DAYS+'+ giorni: '+d.ferme14giorni,
  'Pipeline aperta: '+d.trattativeAperte+' trattative · '+d.valoreAperto].concat(d.pipeline.slice(0,4).map(p=>p.fase+': '+p.trattative+' · '+p.valore))}}

// ---- ops ----
const READONLY='Il tuo ruolo in questo workspace è in sola lettura: la Regia non può cambiare il CRM.';
const ops={
 task_add:{copyFields:[],cost:{ai:0},
  validate(op,state){if(state&&state.writable===false)return READONLY;const c=contactOf(state,op);if(!c)return 'Contatto non trovato in questo CRM'+(op.contact||op.contactId?': «'+one(op.contact||op.contactId,60)+'»':'')+'.';
   const title=one(op.title||'');if(!title)return 'Manca cosa c’è da fare (titolo).';if(title.length>200)return 'Titolo troppo lungo: al massimo 200 caratteri.';
   if(op.priority!=null&&!PRIORITIES.includes(op.priority))return 'Priorità non valida: low, normal, high o urgent.';
   const d=dueOf(op,nowOf(state));return d.error||true},
  preview(op,state){const c=contactOf(state,op),d=dueOf(op,nowOf(state));return 'Nuova attività per «'+nameOf(c)+'»: «'+one(op.title,80)+'» · scadenza '+(d.ms?D().dateTimeLabel(d.ms):'—')}},
 deal_stage:{copyFields:[],cost:{ai:0},
  validate(op,state){if(state&&state.writable===false)return READONLY;const o=dealOf(state,op);if(!o)return 'Trattativa non trovata in questo CRM'+(op.deal||op.dealId?': «'+one(op.deal||op.dealId,60)+'»':'')+'.';
   if(!isOpenDeal(o))return 'La trattativa «'+one(o.title,60)+'» è già chiusa.';if(!o.process_id||!o.stage_id)return 'La trattativa «'+one(o.title,60)+'» non ha una fase di partenza: spostala dalla sua scheda.';
   const s=stageOf(state,o,op);if(!s)return 'La fase «'+one(op.stage||op.stageId,60)+'» non esiste nel processo di questa trattativa.';
   if(s.id===o.stage_id)return 'La trattativa è già in «'+s.title+'».';return true},
  preview(op,state){const o=dealOf(state,op),s=stageOf(state,o,op);return 'Sposta «'+one(o.title,80)+'» da «'+stageName(state,o.stage_id)+'» a «'+s.title+'»'+(s.task_title?' · si crea l’attività automatica «'+one(s.task_title,60)+'»':'')}},
 task_due:{copyFields:[],cost:{ai:0},
  validate(op,state){if(state&&state.writable===false)return READONLY;const t=taskOf(state,op);if(!t)return 'Attività non trovata in questo CRM'+(op.task||op.taskId?': «'+one(op.task||op.taskId,60)+'»':'')+'.';
   if(t.status==='done')return 'L’attività «'+one(t.title,60)+'» è già completata.';const d=dueOf(op,nowOf(state));if(d.error)return d.error;
   if(t.due_at&&Date.parse(t.due_at)===d.ms)return 'L’attività ha già questa scadenza.';return true},
  preview(op,state){const t=taskOf(state,op),d=dueOf(op,nowOf(state)),w=who(state,t);return 'Nuova scadenza per «'+one(t.title,80)+'»'+(w?' ('+one(w,40)+')':'')+': '+dueText(t.due_at)+' → '+(d.ms?D().dateTimeLabel(d.ms):'—')}}
};
// Whole proposal: one change per record, and the ops carry the resolved ids (what apply gets).
function validate(proposal,state){const seen=new Set(),out=[],rejected=[];
 for(const op of proposal.ops){let key,x;
  if(op.op==='task_add'){x={contactId:contactOf(state,op).id};key=null}
  else if(op.op==='deal_stage'){const o=dealOf(state,op);x={dealId:o.id,stageId:stageOf(state,o,op).id};key='deal:'+o.id}
  else{x={taskId:taskOf(state,op).id};key='task:'+x.taskId}
  if(key&&seen.has(key)){rejected.push({op,reason:'Una sola modifica per volta sullo stesso record.'});continue}if(key)seen.add(key);out.push(Object.assign({},op,x))}
 return {ops:out,rejected}}

// ---- apply ----
// env: {app, fetch, uuid, now} for the tests; the browser uses window.RadixSalesApp, fetch and crypto.randomUUID.
function create(env){const E=env||{};
 const app=()=>E.app!==undefined?E.app:root.RadixSalesApp||null;
 const uuid=()=>E.uuid?E.uuid():root.crypto&&root.crypto.randomUUID?root.crypto.randomUUID():null;
 // One /api/sales command, the body sales.js sends: {workspace, entity, action, data}. The page's api() when it is there
 // (session, timeouts, access invalidation), else the same POST with fetch.
 async function post(state,entity,action,data){const a=app(),workspace=a&&a.state&&a.state.workspace||state.workspace,body={workspace,entity,action,data};
  let r;if(a&&typeof a.api==='function')r=await a.api(entity,{body});
  else{const f=E.fetch||root.fetch;if(typeof f!=='function')throw new Error('CRM non raggiungibile.');
   const res=await f('/api/sales',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','x-radix-sales':'1'},body:JSON.stringify(body)});
   let d={};try{d=await res.json()||{}}catch(e){d={}}if(!res.ok)throw new Error(typeof d.error==='string'?d.error:'Richiesta rifiutata ('+res.status+').');r=d}
  const row=r&&Array.isArray(r.rows)?r.rows[0]:null;if(!row||!row.id)throw new Error('Risposta del CRM senza il record salvato.');return row}
 // The record as the page has it now (its version may have moved since the proposal), else the proposal's copy.
 const live=(state,entity,id)=>{const a=app(),rows=a&&a.state&&a.state.rows&&a.state.rows[entity];return (Array.isArray(rows)&&rows.find(r=>r.id===id))||rowsOf(state,entity).find(r=>r.id===id)||null};
 async function reload(){const a=app();if(root.RadixCrmData&&root.RadixCrmData.reset)root.RadixCrmData.reset();if(a&&typeof a.refresh==='function')await a.refresh(false)}
 // One op: what it sends, then its undo (which restores the values read just before).
 async function run(state,op){const now=E.now||nowOf(state);
  if(op.op==='task_add'){const c=contactOf(state,op),d=dueOf(op,now),me=state.me;
   const plan=R().composerPlan('task',{title:one(op.title,200),due:d.local,priority:op.priority||'normal',assignee_id:Number.isInteger(me)&&me>0?String(me):''},'contacts',c,now);
   if(plan.error)throw new Error(plan.error);const row=await post(state,'tasks','create',plan.data);
   return {label:'attività «'+one(op.title,40)+'»',undo:async()=>{const cur=live(state,'tasks',row.id)||row;await post(state,'tasks','delete',{id:row.id,version:cur.version||row.version})}}}
  if(op.op==='task_due'){const t=live(state,'tasks',op.taskId||taskOf(state,op).id),d=dueOf(op,now),before=t.due_at==null?null:t.due_at;
   const row=await post(state,'tasks','update',{id:t.id,version:t.version,due_at:d.iso});
   return {label:'scadenza di «'+one(t.title,40)+'»',undo:async()=>{const cur=live(state,'tasks',t.id);const v=cur&&cur.version>row.version?cur.version:row.version;await post(state,'tasks','update',{id:t.id,version:v,due_at:before})}}}
  if(op.op==='deal_stage'){const o=live(state,'opportunities',op.dealId||dealOf(state,op).id),stage=op.stageId||stageOf(state,o,op).id,before=o.stage_id;
   const key=uuid();if(!key)throw new Error('Cambio fase non disponibile: apri la pagina in HTTPS.');
   const row=await post(state,'opportunities','transition',{id:o.id,version:o.version,stage_id:stage,key});
   return {label:'fase di «'+one(o.title,40)+'»',undo:async()=>{const cur=live(state,'opportunities',o.id),v=cur&&cur.version>row.version?cur.version:row.version;
    const back=await post(state,'opportunities','transition',{id:o.id,version:v,stage_id:before,key:uuid()});
    // The automatic tasks of the two moves (forward and back) go too: the deal is as it was.
    for(const id of [row.generated_task_id,back.generated_task_id].filter(Boolean)){const t=live(state,'tasks',id);await post(state,'tasks','delete',{id,version:t&&t.version||1})}}}}
  throw new Error('Operazione sconosciuta: «'+op.op+'».')}
 async function apply(state,list){const a=app();if(a&&a.state&&a.state.busy)throw new Error('Attendi la fine del salvataggio in corso.');
  if(state&&state.writable===false)throw new Error(READONLY);
  const done=[];
  try{for(const op of list)done.push(await run(state,op))}
  catch(e){const back=[];for(const s of done.slice().reverse()){try{await s.undo();back.push(s.label)}catch(x){}}await reload().catch(()=>{});
   throw new Error(String(e&&e.message||e).replace(/\.$/,'')+(done.length?(back.length===done.length?'. Le modifiche già fatte sono state annullate.':'. Controlla con Aggiorna: non tutte le modifiche già fatte si sono potute annullare.'):'.'))}
  await reload().catch(()=>{});
  return {state:read(null,state),undo:async()=>{const failed=[];for(const s of done.slice().reverse()){try{await s.undo()}catch(e){failed.push(s.label+': '+String(e&&e.message||e))}}
   await reload().catch(()=>{});if(failed.length)throw new Error(failed.join(' · '));return read(null,state)}}}
 // The page's rows as they are now (sales.js state); without the page, the previous state.
 function read(doc,prev){const a=app();if(!a||!a.state)return prev||{workspace:null,rows:{}};const s=a.state,rows={};
  for(const e of ENTITIES)rows[e]=Array.isArray(s.rows&&s.rows[e])?s.rows[e].slice():[];
  let writable=null;try{writable=typeof a.writable==='function'?!!(a.writable('tasks')&&a.writable('opportunities')):null}catch(e){writable=null}
  return {workspace:s.workspace||null,me:Number.isInteger(s.me)?s.me:null,ready:!!s.ready,writable,rows,now:E.now||Date.now()}}
 // The fixed answer of the fake AI (tests, screenshots): call back the most valuable stale deal tomorrow at 9, and an
 // email the Regia refuses to send.
 function sample(state){const stale=staleDeals(state),first=stale.find(s=>s.deal.contact_id),ag=agendaOf(state),late=ag.overdue[0];
  const tomorrow=D().addDays(D().dayOf(nowOf(state)),1);const out=[];
  if(first)out.push({op:'task_add',contactId:first.deal.contact_id,title:'Richiamare '+contactName(state,first.deal.contact_id)+' per «'+one(first.deal.title,60)+'»',due:tomorrow,time:'09:00'});
  if(late)out.push({op:'task_due',taskId:late.id,due:tomorrow,time:'11:00'});
  out.push({op:'send_email',contactId:first?first.deal.contact_id:'',subject:'Ci sentiamo?'});
  return {area:'crm',summary:(ag.overdue.length+ag.today.length)+' chiamate per oggi, '+stale.length+(stale.length===1?' trattativa ferma':' trattative ferme')+(first?': parti da «'+one(first.deal.title,40)+'».':'.'),ops:out}}
 const shortcuts=[
  {label:'Chi chiamo oggi?',prompt:'Chi chiamo oggi? Metti in ordine le attività scadute e quelle di oggi, dimmi perché e proponi i richiami che mancano.'},
  {label:'Trattative ferme',prompt:'Quali trattative sono ferme da più di 14 giorni? Per ognuna proponi il prossimo passo (un’attività con la data, o il cambio di fase).'}];
 return {title:'CRM',pages:['sales-crm'],contextMax:3800,shortcuts,read,context,digest,view,ops,validate,apply,sample}}

const adapter=create();
return Object.freeze({adapter,create,staleDeals,pipeline,dueOf,STALE_DAYS});
});
