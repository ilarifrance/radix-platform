'use strict';
/* CRM «Regole» (configurable automations, Salesforce «Flow» gap): «quando X → proponi Y» from a CLOSED list of
   triggers and actions. Same principle as crm-automations-core.js: a rule only PROPOSES; a person confirms each
   task, and an email is only a draft (nothing is sent). The six fixed rules of crm-automations-core.js are the
   default rules: they can be switched off, never edited, and with no saved rules the result is exactly theirs.
   Storage: one sales_segments row per workspace named «__regole__» with filters={rules:[…]} (no new table);
   the server validates it with validateSet() below and owners/admins only may write it.
   A builtin entry is {id,on}; a custom rule is {id,name,on,when:{type,…},do:{type,…}}. */
(function(root){
const automations=()=>root.RadixCrmAutomations||(typeof require==='function'?require('./crm-automations-core.js'):null);
const RESERVED='__regole__';
const DAY=864e5,HOUR=36e5,MAX_RULES=16,MAX_JSONB=2000;
const TRIGGERS=Object.freeze({
 'stage':{label:'Opportunità entra in fase',entity:'opportunities',help:'Opportunità aperte che si trovano nella fase scelta: una proposta per ingresso.'},
 'deal-stale':{label:'Opportunità ferma da N giorni',entity:'opportunities',help:'Opportunità aperte senza interazioni né attività aperte da N giorni.'},
 'lead-source':{label:'Nuovo lead da fonte',entity:'leads',help:'Lead in stato «Nuovo» con la fonte indicata (vuota = qualsiasi fonte).'},
 'contact-idle':{label:'Contatto senza attività da N giorni',entity:'contacts',help:'Contatti senza interazioni da N giorni e senza attività aperte.'},
 'ticket-high':{label:'Ticket priorità alta aperto da N ore',entity:'tickets',help:'Ticket aperti o in attesa, priorità alta o urgente, aperti da almeno N ore.'},
 'quote-accepted':{label:'Preventivo accettato',entity:'quotes',help:'Preventivi accettati negli ultimi 30 giorni.'}
});
const ACTIONS=Object.freeze({task:'Proponi attività',email:'Proponi email da modello'});
const KINDS=Object.freeze({call:'Chiama',email:'Scrivi',meeting:'Fissa riunione',todo:'Da fare'});
const PRIORITIES=Object.freeze(['low','normal','high','urgent']);
const PLACEHOLDERS=Object.freeze(['{nome}','{azienda}','{trattativa}']);
const BUILTIN=()=>automations().RULES;
const isBuiltin=id=>BUILTIN().some(r=>r.id===id);
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const keysIn=(o,allowed)=>Object.keys(o).every(k=>allowed.includes(k));
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CTRL=/[\u0000-\u001f\u007f]/,CTRL_TEXT=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const line=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!CTRL.test(v);
const int=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
const low=s=>String(s||'').trim().toLocaleLowerCase('it');
// PostgreSQL prints jsonb with ", " and ": ": the CHECK on sales_segments.filters counts that text.
function jsonbText(v){
 if(Array.isArray(v))return '['+v.map(jsonbText).join(', ')+']';
 if(v&&typeof v==='object')return '{'+Object.keys(v).map(k=>JSON.stringify(k)+': '+jsonbText(v[k])).join(', ')+'}';
 return JSON.stringify(v);
}

// One rule → null when valid, else the reason (Italian, shown as is).
function ruleError(r){
 if(!plain(r)||typeof r.id!=='string')return 'Regola non valida.';
 if(isBuiltin(r.id)){if(!keysIn(r,['id','on'])||typeof r.on!=='boolean')return 'Regola predefinita non valida.';return null}
 if(!/^r[a-z0-9]{3,11}$/.test(r.id))return 'Identificativo della regola non valido.';
 if(!keysIn(r,['id','name','on','when','do'])||typeof r.on!=='boolean')return 'Regola non valida.';
 if(!line(r.name,40))return 'Nome della regola obbligatorio: massimo 40 caratteri.';
 const w=r.when,d=r.do;
 if(!plain(w)||!own(TRIGGERS,w.type))return 'Scegli un evento dall’elenco.';
 if(w.type==='stage'){if(!keysIn(w,['type','stage'])||typeof w.stage!=='string'||!UUID.test(w.stage))return 'Scegli la fase.'}
 else if(w.type==='deal-stale'||w.type==='contact-idle'){if(!keysIn(w,['type','days'])||!int(w.days,1,365))return 'Giorni: un numero intero da 1 a 365.'}
 else if(w.type==='ticket-high'){if(!keysIn(w,['type','hours'])||!int(w.hours,1,720))return 'Ore: un numero intero da 1 a 720.'}
 else if(w.type==='lead-source'){if(!keysIn(w,['type','source'])||typeof w.source!=='string'||w.source.length>80||CTRL.test(w.source))return 'Fonte: massimo 80 caratteri.'}
 else if(!keysIn(w,['type']))return 'Evento non valido.';
 if(!plain(d)||!own(ACTIONS,d.type))return 'Scegli un’azione dall’elenco.';
 if(d.type==='task'){
  if(!keysIn(d,['type','kind','title','days','to','priority'])||!own(KINDS,d.kind))return 'Tipo di attività non valido.';
  if(!line(d.title,120))return 'Titolo dell’attività obbligatorio: massimo 120 caratteri.';
  if(!int(d.days,0,365))return 'Scadenza: da 0 a 365 giorni.';
  if(d.to!=='owner'&&!int(d.to,1,2147483647))return 'Assegnatario non valido.';
  if(own(d,'priority')&&!PRIORITIES.includes(d.priority))return 'Priorità non valida.';
 }else{
  if(!keysIn(d,['type','subject','body']))return 'Modello email non valido.';
  if(!line(d.subject,120))return 'Oggetto dell’email obbligatorio: massimo 120 caratteri.';
  if(typeof d.body!=='string'||!d.body.trim()||d.body.length>600||CTRL_TEXT.test(d.body))return 'Testo dell’email obbligatorio: massimo 600 caratteri.';
 }
 return null;
}
// The whole list as stored in filters.rules → {ok,error}.
function validateSet(list){
 if(!Array.isArray(list))return {ok:false,error:'Elenco regole non valido.'};
 if(list.length>MAX_RULES+BUILTIN().length)return {ok:false,error:'Troppe regole: massimo '+MAX_RULES+' personalizzate.'};
 const ids=new Set(),names=new Set(BUILTIN().map(r=>low(r.name)));
 for(const r of list){const e=ruleError(r);if(e)return {ok:false,error:e};
  if(ids.has(r.id))return {ok:false,error:'Regola ripetuta.'};ids.add(r.id);
  if(!isBuiltin(r.id)){const n=low(r.name);if(names.has(n))return {ok:false,error:'Esiste già una regola «'+r.name.trim()+'».'};names.add(n)}}
 if(list.filter(r=>!isBuiltin(r.id)).length>MAX_RULES)return {ok:false,error:'Troppe regole: massimo '+MAX_RULES+' personalizzate.'};
 if(jsonbText({rules:list}).length>MAX_JSONB)return {ok:false,error:'Spazio per le regole esaurito: accorcia i testi delle email o elimina una regola.'};
 return {ok:true,error:null};
}

// Stored list (or nothing) → the rules in force: the six defaults first (on unless switched off), then the custom ones.
function effective(list){
 const stored=Array.isArray(list)?list:[],state=new Map(stored.filter(r=>r&&isBuiltin(r.id)).map(r=>[r.id,r.on!==false]));
 const out=BUILTIN().map(b=>({id:b.id,name:b.name,description:b.description,builtin:true,on:state.has(b.id)?state.get(b.id):true}));
 for(const r of stored)if(r&&!isBuiltin(r.id)&&!ruleError(r))out.push({...r,builtin:false,description:describe(r)});
 return out;
}
const stageName=(id,data)=>((data&&data.stages||[]).find(s=>s.id===id)||{}).title||'fase non trovata';
// «Quando … → …» in one line, for the list and the registro.
function describe(r,data){
 const w=r.when,d=r.do;let q;
 if(w.type==='stage')q='un’opportunità è nella fase «'+stageName(w.stage,data)+'»';
 else if(w.type==='deal-stale')q='un’opportunità aperta è ferma da '+w.days+' giorni';
 else if(w.type==='lead-source')q=w.source.trim()?'arriva un nuovo lead da «'+w.source.trim()+'»':'arriva un nuovo lead';
 else if(w.type==='contact-idle')q='un contatto è senza attività da '+w.days+' giorni';
 else if(w.type==='ticket-high')q='un ticket ad alta priorità è aperto da '+w.hours+' ore';
 else q='un preventivo è accettato';
 const a=d.type==='task'?'proponi «'+KINDS[d.kind]+': '+d.title+'» con scadenza '+(d.days?'a '+d.days+(d.days===1?' giorno':' giorni'):'oggi'):'proponi la bozza email «'+d.subject+'»';
 return 'Quando '+q+' → '+a+'.';
}

const tag=rule=>'[Auto · '+rule.name+']';
const at9=(now,days)=>{const d=new Date(now+days*DAY);d.setUTCHours(9,0,0,0);return d.toISOString().slice(0,19)+'Z'};
const open=o=>!o.outcome||o.outcome==='open';
const byId=(list,id)=>id?(list||[]).find(x=>x&&x.id===id)||null:null;
const short=(s,n)=>String(s||'').slice(0,n);
// The records a trigger matches now. Each: {entity,record,owner,title,links}.
function matches(rule,data,now){
 const w=rule.when,opps=data.opportunities||[],inter=data.interactions||[],openTasks=(data.tasks||[]).filter(t=>t&&t.status!=='done');
 const out=[];const add=(entity,record,owner,title,links)=>out.push({entity,record,owner:owner==null?null:owner,title:title||'',links});
 const oppLinks=o=>({opportunity_id:o.id,company_id:o.company_id||null,contact_id:o.contact_id||null});
 if(w.type==='stage'){for(const o of opps)if(open(o)&&o.stage_id===w.stage)add('opportunities',o,o.owner_id,o.title,oppLinks(o))}
 else if(w.type==='deal-stale'){
  // Same reading as «Trattativa ferma», with the number of days of the rule.
  const since=now-w.days*DAY;
  for(const o of opps){if(!open(o)||(Date.parse(o.created_at||'')||0)>since||openTasks.some(t=>t.opportunity_id===o.id))continue;
   const last=Math.max(0,...inter.filter(i=>i.opportunity_id===o.id||(o.contact_id&&i.contact_id===o.contact_id)).map(i=>Date.parse(i.occurred_at)||0));if(last>since)continue;
   add('opportunities',o,o.owner_id,o.title,oppLinks(o))}
 }else if(w.type==='lead-source'){const src=low(w.source);
  for(const l of data.leads||[]){if((l.status||'nuovo')!=='nuovo'||(src&&low(l.source)!==src))continue;
   add('leads',l,l.owner_id,l.title,{company_id:l.company_id||null,contact_id:l.contact_id||null})}
 }else if(w.type==='contact-idle'){const since=now-w.days*DAY;
  for(const c of data.contacts||[]){const born=Date.parse(c.created_at||'');if(!born||born>since||openTasks.some(t=>t.contact_id===c.id))continue;
   const last=Math.max(0,...inter.filter(i=>i.contact_id===c.id).map(i=>Date.parse(i.occurred_at)||0));if(last>since)continue;
   add('contacts',c,c.owner_id,c.name,{contact_id:c.id,company_id:c.company_id||null})}
 }else if(w.type==='ticket-high'){
  for(const k of data.tickets||[]){if(!['open','pending'].includes(k.status)||!['high','urgent'].includes(k.priority))continue;const born=Date.parse(k.created_at||'');if(!born||now-born<w.hours*HOUR)continue;
   add('tickets',k,k.assignee_id,k.title,{company_id:k.company_id||null,contact_id:k.contact_id||null})}
 }else if(w.type==='quote-accepted'){
  for(const q of data.quotes||[]){if(q.kind&&q.kind!=='quote')continue;if(q.status!=='accettato')continue;const when=Date.parse(q.updated_at||q.issue_date||'');if(when&&now-when>30*DAY)continue;
   const o=byId(opps,q.opportunity_id);add('quotes',q,o&&o.owner_id,(q.number?q.number+' · ':'')+(q.title||'Preventivo'),{opportunity_id:q.opportunity_id||null,company_id:q.company_id||null,contact_id:q.contact_id||null})}
 }
 return out;
}
// Records without their own link field on a task are named by «#id» at the end of the title (as «Ticket fermo» does).
const suffixed=entity=>['leads','tickets','quotes'].includes(entity);
function linked(m,item,title){
 if(!String(item.title||'').startsWith(title))return false;
 if(suffixed(m.entity))return String(item.title).endsWith('#'+m.record.id);
 return m.entity==='opportunities'?item.opportunity_id===m.record.id:item.contact_id===m.record.id;
}
// Events that happen once (stage entry, new lead, accepted quote) are proposed once, even after the task is done.
const once=type=>['stage','lead-source','quote-accepted'].includes(type);
const withSuffix=(m,text,max)=>suffixed(m.entity)?short(text,max-38)+' #'+m.record.id:short(text,max);
function fill(text,m,data){
 const contact=byId(data.contacts,m.links.contact_id),company=byId(data.companies,m.links.company_id)||(contact?byId(data.companies,contact.company_id):null),opp=byId(data.opportunities,m.links.opportunity_id);
 const v={'{nome}':contact?String(contact.name||'').trim().split(/\s+/)[0]:'','{azienda}':company?company.name:'','{trattativa}':opp?opp.title:''};
 return String(text).replace(/\{(nome|azienda|trattativa)\}/g,k=>v[k]||'[DA COMPLETARE: '+k.slice(1,-1)+']');
}
// One custom rule → {rule,items}; item: {entity,record,key,task}|{entity,record,key,email}.
function planCustom(rule,data,opts){
 const now=opts&&opts.now||Date.now(),me=opts&&opts.assignee||null,title=tag(rule),d=rule.do;
 const tasks=data.tasks||[],pool=once(rule.when.type)?tasks:tasks.filter(t=>t&&t.status!=='done');
 const items=[];
 for(const m of matches(rule,data,now)){
  const key=m.entity+':'+m.record.id;
  if(d.type==='task'){
   if(pool.some(t=>linked(m,t,title)))continue;
   const text=title+' '+KINDS[d.kind]+': '+d.title+' · '+(m.title||'');
   items.push({entity:m.entity,record:m.record,key,task:{title:withSuffix(m,text,200),...m.links,assignee_id:d.to==='owner'?(m.owner??me):d.to,priority:d.priority||'normal',status:'todo',due_at:at9(now,d.days)}});
  }else{
   // A draft «marked as sent» is an email interaction with the rule's tag: it is not proposed again.
   if((data.interactions||[]).some(i=>linked(m,i,title)))continue;
   const contact=byId(data.contacts,m.links.contact_id);
   items.push({entity:m.entity,record:m.record,key,email:{subject:short(fill(d.subject,m,data),180),body:fill(d.body,m,data),contact,links:m.links,
    log:{title:withSuffix(m,title+' Email: '+fill(d.subject,m,data),200),kind:'email',body:fill(d.body,m,data),...m.links}}});
  }
 }
 return {rule,items};
}
const recordEntity={'close-overdue':'opportunities','won-onboarding':'opportunities','stale-deal':'opportunities','ticket-stalled':'tickets','new-contact':'contacts','hot-contact':'contacts'};
// All rules in force → [{rule,items,skipped}]. Defaults are planned by crm-automations-core.js unchanged.
// A custom rule never proposes a second task (or a second email) for a record another rule already covers.
function evaluate(list,data,opts){
 const A=automations(),seen=new Map(),runs=[];
 for(const rule of effective(list)){
  if(!rule.on){runs.push({rule,items:[],skipped:[],off:true});continue}
  let p;
  if(rule.builtin)p={rule,items:A.plan(rule.id,data,opts).items.map(x=>({...x,entity:recordEntity[rule.id],key:recordEntity[rule.id]+':'+x.record.id}))};
  else p=planCustom(rule,data,opts);
  const items=[],skipped=[];
  for(const it of p.items){const k=(it.email?'email:':'task:')+it.key;
   if(!rule.builtin&&seen.has(k)){skipped.push({...it,by:seen.get(k)});continue}
   if(!seen.has(k))seen.set(k,rule.name);items.push(it)}
  runs.push({rule,items,skipped,off:false});
 }
 return runs;
}
// Registro: what each rule has produced so far and what it proposes now, from the rows already loaded.
function registro(list,data,opts){
 return evaluate(list,data,opts).map(run=>{const t=tag(run.rule);
  const tasks=(data.tasks||[]).filter(x=>String(x.title||'').startsWith(t));
  const emails=(data.interactions||[]).filter(x=>String(x.title||'').startsWith(t));
  return {rule:run.rule,off:run.off,proposed:run.items,skipped:run.skipped,
   confirmed:{tasks:tasks.length,open:tasks.filter(x=>x.status!=='done').length,done:tasks.filter(x=>x.status==='done').length,emails:emails.length},
   recent:[...tasks.map(x=>({kind:'task',title:x.title,status:x.status,at:x.created_at||x.due_at||''})),...emails.map(x=>({kind:'email',title:x.title,status:'done',at:x.occurred_at||''}))].sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,5)}});
}
// A new rule id, unique among the stored ones.
function newId(list,rand){const r=rand||Math.random;let id;do{id='r'+Math.floor(r()*36**6).toString(36).padStart(6,'0')}while((list||[]).some(x=>x&&x.id===id));return id}
// Toggle / replace / remove in the stored list (always a new array; builtins stay as {id,on}).
function setOn(list,id,on){const l=Array.isArray(list)?[...list]:[];const i=l.findIndex(r=>r&&r.id===id);
 if(isBuiltin(id)){const rest=l.filter(r=>r&&r.id!==id);return on?rest:[{id,on:false},...rest]}
 if(i>=0)l[i]={...l[i],on};return l}
function upsert(list,rule){const l=Array.isArray(list)?[...list]:[];const i=l.findIndex(r=>r&&r.id===rule.id);if(i>=0)l[i]=rule;else l.push(rule);return l}
function remove(list,id){return (Array.isArray(list)?list:[]).filter(r=>r&&r.id!==id)}
const api={RESERVED,MAX_RULES,TRIGGERS,ACTIONS,KINDS,PRIORITIES,PLACEHOLDERS,ruleError,validateSet,effective,describe,tag,matches,planCustom,evaluate,registro,newId,setOn,upsert,remove,jsonbText};
if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixCrmRules=api;
})(typeof globalThis!=='undefined'?globalThis:this);
