'use strict';
/* «Foglio chiamate» (sales/crm-sheet.js): Contatti as a spreadsheet for whoever calls many people.
   One row per contact with a few contact and company fields, then everything done with it: one
   column per interaction (newest first: date, kind, outcome, short note), one per thing still to do
   (open tasks and planned interactions, soonest first) and the stage of the most advanced open deal. Pure logic, no DOM and no writes: the page sends the
   bodies built here through RadixSalesApp.api (the same /api/sales commands as the edit form,
   «Oggi» and Customer360). Only fields api/_sales.js already accepts; no new tables. */
(function(root){
const DAY=864e5;
const list=v=>Array.isArray(v)?v:[];
const ts=v=>{if(v==null||v==='')return null;const n=Date.parse(v);return Number.isFinite(n)?n:null};
const text=v=>v==null?'':String(v).trim();
const fold=v=>text(v).normalize('NFD').replace(/[̀-ͯ]/g,'').toLocaleLowerCase('it');
const num=v=>v==null||v===''||!Number.isFinite(Number(v))?null:Number(v);
const utc=ms=>new Date(ms).toISOString().slice(0,19)+'Z';
const RF=typeof module==='object'&&module.exports?require('./crm-fields-core.js'):root.RadixCrmFields;

/* Call outcomes: the key is kept in the browser, the label goes in the interaction text as
   «Esito: <label>» on the first line (the same shape as «Oggi», crm-today-core.js). */
const OUTCOMES=Object.freeze({answered:'Risposto',no_answer:'Non risponde',callback:'Richiamare',not_interested:'Non interessato',appointment:'Appuntamento'});
// Outcomes that propose a next activity (a task with a due date), and its title.
const FOLLOW=Object.freeze({callback:'Richiamare',appointment:'Appuntamento con'});
const KINDS=Object.freeze({call:'Chiamata',email:'Email',meeting:'Riunione',note:'Nota',linkedin:'LinkedIn'});

/* «Esito: Non risponde» on the first line → 'no_answer'; any other text → null. */
function outcomeOf(body){
 const m=/^\s*Esito:\s*(.+?)\s*$/im.exec(String(body??'').split(/\r?\n/)[0]||'');if(!m)return null;
 const want=fold(m[1]);for(const [k,l] of Object.entries(OUTCOMES))if(fold(l)===want)return k;return null;
}
/* The text after the «Esito:» line, on one line, cut to max characters with «…». */
function shortNote(body,max){
 const lines=String(body??'').split(/\r?\n/);if(lines.length&&/^\s*Esito:/i.test(lines[0]))lines.shift();
 const s=lines.join(' ').replace(/\s+/g,' ').trim(),m=max||80;return s.length>m?s.slice(0,m-1).trimEnd()+'…':s;
}
/* The whole text after the «Esito:» line, as written: line breaks kept (Windows ones made plain),
   spaces at line ends dropped, at most one empty line between paragraphs, no empty lines around. */
function fullNote(body){
 const lines=String(body??'').replace(/\r\n?/g,'\n').split('\n');if(lines.length&&/^\s*Esito:/i.test(lines[0]))lines.shift();
 return lines.map(l=>l.replace(/[ \t]+$/,'')).join('\n').replace(/\n{3,}/g,'\n\n').trim();
}
/* Paragraphs of a note (split on empty lines), each keeping its own line breaks. */
const paragraphs=t=>text(t)?text(t).split(/\n\s*\n/).map(p=>p.trim()).filter(Boolean):[];
/* What a cell can show in its two lines: longer texts, or texts on more lines, open in full on click. */
const PREVIEW=160;
const isLong=t=>text(t).length>90||/\n/.test(text(t));

/* Every interaction of a contact already done (occurred_at not after now + 1 minute of clock skew),
   most recent first: one entry per sheet column «Attività 1, 2, …». */
function activities(interactions,contactId,now){
 const out=[];
 for(const i of list(interactions)){if(!i||i.contact_id!==contactId)continue;const at=ts(i.occurred_at);if(at==null||at>now+60e3)continue;
  const full=fullNote(i.body);
  out.push({at,id:i.id,kind:text(i.kind),title:text(i.title),outcome:outcomeOf(i.body),note:shortNote(i.body,80),preview:shortNote(i.body,PREVIEW),text:full,long:isLong(full),author:i.created_by??null,record:i})}
 return out.sort((a,b)=>b.at-a.at||String(b.id).localeCompare(String(a.id)));
}
const lastInteraction=(interactions,contactId,now)=>activities(interactions,contactId,now)[0]||null;
/* What is still to do with a contact: its open tasks (status not done) and future interactions (a
   meeting or call already in the calendar). Dated ones first by date (overdue tasks are the earliest),
   then open tasks without a due date. One entry per column «Da fare 1, 2, …». */
function todos(tasks,interactions,contactId,now){
 const out=[];
 for(const t of list(tasks)){if(!t||t.contact_id!==contactId||t.status==='done')continue;const at=ts(t.due_at);
  out.push({at,id:t.id,source:'task',title:text(t.title)||'Attività',overdue:at!=null&&at<now,text:'',long:text(t.title).length>60,record:t})}
 for(const i of list(interactions)){if(!i||i.contact_id!==contactId)continue;const at=ts(i.occurred_at);if(at==null||at<=now+60e3)continue;
  const full=fullNote(i.body);
  out.push({at,id:i.id,source:'interaction',kind:text(i.kind),title:text(i.title)||KINDS[i.kind]||'Interazione',overdue:false,text:full,long:isLong(full),record:i})}
 return out.sort((a,b)=>(a.at==null)-(b.at==null)||(a.at??0)-(b.at??0)||String(a.id).localeCompare(String(b.id)));
}
const nextActivity=(tasks,interactions,contactId,now)=>todos(tasks,interactions,contactId,now)[0]||null;
/* Most advanced open deal for a contact: its own deals and its company's deals without a contact.
   Advanced = higher stage position (then probability, then amount). Stage not loaded: position -1. */
function topDeal(opportunities,stages,contact){
 const st=new Map(list(stages).map(s=>[s.id,s]));let best=null,count=0;
 for(const o of list(opportunities)){
  if(!o||(o.outcome&&o.outcome!=='open'))continue;
  const mine=o.contact_id?o.contact_id===contact.id:!!contact.company_id&&o.company_id===contact.company_id;if(!mine)continue;
  count++;const s=st.get(o.stage_id),pos=s&&Number.isFinite(Number(s.position))?Number(s.position):-1;
  const c={pos,prob:num(o.probability)??num(s&&s.probability)??-1,amount:Number(o.amount_cents)||0,stage:s?text(s.title):'',title:text(o.title),id:o.id,record:o};
  if(!best||c.pos>best.pos||(c.pos===best.pos&&(c.prob>best.prob||(c.prob===best.prob&&c.amount>best.amount))))best=c;
 }
 return best?{...best,count}:null;
}

/* Columns, in sheet order. The frozen ones (freeze) stay on screen when the grid scrolls sideways,
   as Excel's frozen panes: name, phone (then the «Registra chiamata» button) and company.
   group: who (the frozen block) | contact | company | todo | activity, each one contiguous so its label
   is drawn once over its columns (see headerGroups); edit = [entity, field key] for inline edit;
   num right-aligned; hidden: off by default (the column chooser adds it); added: a field of migration 011.
   Each field is in one column only: «Telefono» is the contact's phone, «Cellulare» its mobile,
   «Tel. azienda» the company's switchboard; the company name only in the frozen «Azienda».
   After these come the activity columns, as many as the contact with most has:
   «Da fare 1…n» (open tasks and planned interactions, soonest first) and «Attività 1…n» (done, newest first). */
const COLUMNS=Object.freeze([
 {id:'name',group:'who',label:'Nome',fixed:true,freeze:true,edit:['contacts','name']},
 {id:'phone',group:'who',label:'Telefono',fixed:true,freeze:true,edit:['contacts','phone'],tel:true},
 {id:'company',group:'who',label:'Azienda',fixed:true,freeze:true},
 {id:'role',group:'contact',label:'Ruolo',edit:['contacts','role']},
 {id:'mobile',group:'contact',label:'Cellulare',edit:['contacts','mobile'],tel:true,added:true},
 {id:'email',group:'contact',label:'Email',edit:['contacts','email']},
 {id:'title',group:'contact',label:'Qualifica',edit:['contacts','title'],added:true,hidden:true},
 {id:'industry',group:'company',label:'Settore',edit:['companies','industry']},
 // «Paese»: the company's billing_country (011), else the contact's country. Editing writes the company's
 // field; a contact without a loaded company gets its own country instead (see target).
 {id:'country',group:'company',label:'Paese',edit:['companies','billing_country'],added:true},
 {id:'city',group:'company',label:'Città',edit:['companies','city'],hidden:true},
 {id:'employees',group:'company',label:'Dipendenti',edit:['companies','employees'],num:true,added:true,hidden:true},
 {id:'revenue',group:'company',label:'Fatturato',edit:['companies','annual_revenue_cents'],num:true,added:true,hidden:true},
 {id:'companyPhone',group:'company',label:'Tel. azienda',edit:['companies','phone'],tel:true,hidden:true},
 {id:'stage',group:'company',label:'Fase trattativa'},
 {id:'todos',group:'todo',label:'Da fare',many:true},
 {id:'acts',group:'activity',label:'Attività svolte',many:true}
].map(Object.freeze));
const GROUPS=Object.freeze({who:'Chi',contact:'Contatto',company:'Azienda',todo:'Da fare',activity:'Attività'});
/* The group header row over the drawn columns (from expand; {call:true} is the «Registra chiamata»
   column, part of the frozen block). Frozen columns get one cell each, so each sticks to the left with
   its column (on a phone the company scrolls away); the label «Chi» sits on the first of them only.
   The other columns of one group share one cell (span). Each label appears once.
   Each entry: {group, label, span, frozen, col (frozen: the column id, 'call' for the button)}. */
function headerGroups(cols){
 const out=[],seen=new Set();
 for(const c of list(cols)){
  if(!c)continue;
  const frozen=!!(c.call||(c.base&&c.base.freeze)),g=frozen?'who':c.base?c.base.group:'';
  const prev=out[out.length-1];
  if(!frozen&&prev&&!prev.frozen&&prev.group===g){prev.span++;continue}
  out.push({group:g,label:seen.has(g)?'':GROUPS[g]||'',span:1,frozen,col:frozen?(c.call?'call':c.id):null});seen.add(g);
 }
 return out;
}
/* Every interaction gets its column («A destra ci devono essere tutte le attività»): the cap only guards
   the page against a broken record set (500 columns per kind, far beyond a real contact's history). */
const MAX_MANY=500;
const colOf=id=>COLUMNS.find(c=>c.id===id)||null;
function columnsFor(opts){return COLUMNS.filter(c=>!(c.added&&opts&&opts.added===false))}
/* The columns drawn: chosen base columns, with «todos»/«acts» spread into one column per entry
   (count from the rows given, at least 1, at most MAX_MANY). Each: {id, label, base, index?}. */
function expand(columnIds,rows,opts){
 const ids=new Set(list(columnIds)),out=[];
 const most=k=>{let m=1;for(const r of list(rows))m=Math.max(m,list(r[k]).length);return Math.min(MAX_MANY,m)};
 for(const c of columnsFor(opts)){if(!c.fixed&&!ids.has(c.id))continue;
  if(!c.many){out.push({id:c.id,label:c.label,base:c});continue}
  const n=most(c.id),one=c.id==='todos'?'Da fare':'Attività';
  for(let i=0;i<n;i++)out.push({id:c.id+':'+(i+1),label:one+' '+(i+1),base:c,index:i});
 }
 return out;
}

/* One row per contact. data: {contacts, companies, interactions, tasks, opportunities, stages}. */
function buildRows(data,opts){
 const d=data||{},now=(opts&&opts.now)??Date.now();
 const byCompany=new Map(list(d.companies).map(c=>[c.id,c]));
 const inter=list(d.interactions),tasks=list(d.tasks),opps=list(d.opportunities),stages=list(d.stages);
 // Index by contact once: a few thousand rows stay fast.
 const by=(rows,key)=>{const m=new Map();for(const r of rows){const k=r&&r[key];if(!k)continue;let a=m.get(k);if(!a)m.set(k,a=[]);a.push(r)}return m};
 const iBy=by(inter,'contact_id'),tBy=by(tasks,'contact_id');
 return list(d.contacts).filter(c=>c&&c.id).map(c=>{
  const co=c.company_id?byCompany.get(c.company_id)||null:null;
  const acts=activities(iBy.get(c.id),c.id,now),todo=todos(tBy.get(c.id),iBy.get(c.id),c.id,now),deal=topDeal(opps,stages,c);
  const last=acts[0]||null,next=todo[0]||null;
  return {id:c.id,record:c,companyRecord:co,companyId:c.company_id||null,companyMissing:!!c.company_id&&!co,
   name:text(c.name)||'(senza nome)',title:text(c.title),role:text(c.role),phone:text(c.phone),mobile:text(c.mobile),email:text(c.email),
   company:co?text(co.name):'',industry:co?text(co.industry):'',city:co?text(co.city)||text(co.billing_city):'',
   country:(co&&text(co.billing_country))||text(c.country),countryFrom:co&&text(co.billing_country)?'company':text(c.country)?'contact':'',
   employees:co?num(co.employees):null,revenue:co?num(co.annual_revenue_cents):null,companyPhone:co?text(co.phone):'',
   acts,todos:todo,last,lastAt:last?last.at:null,outcomeKey:last?last.outcome:null,
   next,nextAt:next?next.at:null,overdue:todo.some(t=>t.overdue),
   deal,stage:deal?(deal.stage||'Fase non caricata'):'',stagePos:deal?deal.pos:null};
 });
}

/* Filters (saved): outcome of the last interaction ('' all, 'never' no interaction, 'none' no outcome, or a key),
   to-do ('' all, 'overdue', 'today' due by the end of today, 'week' within 7 days, 'none' nothing open). */
function endOfDay(now){const d=new Date(now);d.setHours(24,0,0,0);return +d}
function passes(row,f,now){
 const o=(f&&f.outcome)||'',n=(f&&f.next)||'';
 if(o==='never'&&row.last)return false;
 if(o==='none'&&(!row.last||row.outcomeKey))return false;
 if(Object.hasOwn(OUTCOMES,o)&&row.outcomeKey!==o)return false;
 if(n==='none'&&row.todos.length)return false;
 if(n==='overdue'&&!row.overdue)return false;
 if(n==='today'&&!(row.nextAt!=null&&row.nextAt<endOfDay(now)))return false;
 if(n==='week'&&!(row.nextAt!=null&&row.nextAt<now+7*DAY))return false;
 return true;
}
const SEARCH=['name','title','role','phone','mobile','email','company','industry','country','city','companyPhone','stage'];
function matches(row,query){const q=fold(query);if(!q)return true;
 const extra=[...list(row.acts).map(a=>a.title+' '+(a.text??a.note)+' '+(a.outcome?OUTCOMES[a.outcome]:'')),...list(row.todos).map(t=>t.title)];
 return q.split(/\s+/).every(w=>SEARCH.some(k=>fold(row[k]).includes(w))||extra.some(x=>fold(x).includes(w)))}
const collator=typeof Intl!=='undefined'?new Intl.Collator('it',{sensitivity:'base',numeric:true}):null;
const cmpText=(a,b)=>collator?collator.compare(a,b):a<b?-1:a>b?1:0;
// Sort keys: «Attività svolte» by the last one, «Da fare» by the soonest, the deal by its stage position.
const SORT_KEY={stage:'stagePos',acts:'lastAt',todos:'nextAt'};
function sortKey(row,key){const v=row[SORT_KEY[key]||key];return v===''||v==null?null:v}
/* Sort: empty values always last, then by name. */
function sortRows(rows,sort){
 const key=(sort&&sort.key)||'name',dir=sort&&sort.dir==='desc'?-1:1;
 return [...list(rows)].sort((a,b)=>{const x=sortKey(a,key),y=sortKey(b,key);
  if(x==null&&y!=null)return 1;if(y==null&&x!=null)return -1;
  let c=0;if(x!=null&&y!=null)c=typeof x==='number'&&typeof y==='number'?x-y:cmpText(String(x),String(y));
  return c*dir||cmpText(a.name,b.name)||String(a.id).localeCompare(String(b.id))});
}
function apply(rows,state,now){const s=state||{};return sortRows(list(rows).filter(r=>passes(r,s.filters,now??Date.now())&&matches(r,s.query)),s.sort)}
const DESC_FIRST=new Set(['acts','employees','revenue','stage']);
function nextSort(sort,key){if(sort&&sort.key===key)return {key,dir:sort.dir==='asc'?'desc':'asc'};return {key,dir:DESC_FIRST.has(key)?'desc':'asc'}}

/* Preferences per workspace, as the list views (crm-list-core.js): only known values survive. */
const storageKey=workspace=>'radix-crm-sheet:'+String(workspace||'');
function defaults(){return {columns:COLUMNS.filter(c=>!c.hidden).map(c=>c.id),sort:{key:'name',dir:'asc'},filters:{outcome:'',next:''}}}
function normalize(saved){
 const def=defaults();if(!saved||typeof saved!=='object')return def;const out={...def,filters:{...def.filters}};
 if(Array.isArray(saved.columns)){const chosen=COLUMNS.filter(c=>c.fixed||saved.columns.includes(c.id)).map(c=>c.id);if(chosen.length)out.columns=chosen}
 if(saved.sort&&colOf(saved.sort.key))out.sort={key:saved.sort.key,dir:saved.sort.dir==='desc'?'desc':'asc'};
 const f=saved.filters||{};
 if(f.outcome==='never'||f.outcome==='none'||Object.hasOwn(OUTCOMES,f.outcome))out.filters.outcome=f.outcome;
 if(['overdue','today','week','none'].includes(f.next))out.filters.next=f.next;
 return out;
}
function parse(raw){try{return normalize(raw?JSON.parse(raw):null)}catch{return defaults()}}
function toggleColumn(columns,id){const c=colOf(id);if(!c||c.fixed)return list(columns).slice();const s=new Set(list(columns));s.has(id)?s.delete(id):s.add(id);return COLUMNS.filter(x=>x.fixed||s.has(x.id)).map(x=>x.id)}

/* Inline edit. Which record a cell writes to (null: not editable here). */
function target(row,col){
 if(!col||!col.edit)return null;let [entity,key]=col.edit;
 if(col.id==='country'&&!row.companyRecord){entity='contacts';key='country'}
 const record=entity==='contacts'?row.record:row.companyRecord;if(!record||!record.id)return null;
 return {entity,key,record};
}
/* The text put in the editor for a stored value (money in euro, as in the form). */
function editValue(row,col){const t=target(row,col);if(!t)return '';if(t.key==='name')return text(t.record.name);return RF?RF.formValue(t.entity,t.key,t.record):text(t.record[t.key])}
/* Typed value → the update body {id, version, key: value}, or {error}, or {same:true} when nothing changes.
   Same checks as the edit form (crm-fields-core.js parse), the server checks again. */
function editPlan(row,col,raw){
 const t=target(row,col);if(!t)return {error:'Questo campo non si modifica qui.'};
 const {entity,key,record}=t;let value;
 if(key==='name'){const s=text(raw);if(!s)return {error:entity==='contacts'?'Il nome non può restare vuoto.':'Il nome dell’azienda non può restare vuoto.'};if(s.length>200)return {error:'Nome: massimo 200 caratteri.'};value=s}
 else{if(!RF)return {error:'Campi non disponibili.'};const r=RF.parse(entity,key,raw,{selfId:record.id,current:record[key]});if(r.error)return {error:r.error};value=r.value}
 const before=record[key]??null;if((value==null&&before==null)||(value!=null&&before!=null&&String(value)===String(before)))return {same:true};
 if(!Number.isInteger(record.version))return {error:'Versione del record mancante: premi Aggiorna.'};
 return {entity,data:{id:record.id,version:record.version,[key]:value}};
}

/* «Registra chiamata»: one interactions create (kind call, now) on the contact and its company.
   input: {outcome, note, follow: 'YYYY-MM-DDTHH:mm' local date-time or ''}. With «Richiamare» or
   «Appuntamento» and a date, also one tasks create with that due date (the next activity). */
function callPlan(row,input,now,me){
 const i=input||{},n=Number.isFinite(now)?now:Date.now();
 if(!Object.hasOwn(OUTCOMES,i.outcome))return {error:'Scegli l’esito della chiamata.'};
 if(!row||!row.record||!row.record.id)return {error:'Contatto non trovato: premi Aggiorna.'};
 const note=text(i.note),body='Esito: '+OUTCOMES[i.outcome]+(note?'\n'+note:'');
 if(body.length>4000)return {error:'La nota supera 4000 caratteri.'};
 const links={contact_id:row.record.id,company_id:row.record.company_id||null};
 const cut=s=>s.length>200?s.slice(0,199)+'…':s;
 const interaction={title:cut('Chiamata con '+row.name+' · '+OUTCOMES[i.outcome]),kind:'call',occurred_at:utc(n),body,...links};
 let task=null;
 if(FOLLOW[i.outcome]&&text(i.follow)){
  const due=localDateTime(i.follow);if(due==null)return {error:'Data della prossima attività non valida.'};
  if(due<n-5*60e3)return {error:'La prossima attività deve essere nel futuro.'};
  task={title:cut(FOLLOW[i.outcome]+' '+row.name),status:'todo',priority:'normal',due_at:utc(due),assignee_id:Number.isInteger(me)&&me>0?me:null,...links};
 }
 return {error:null,interaction,task};
}
/* 'YYYY-MM-DDTHH:mm' (an <input type=datetime-local>) in local time → ms, or null. */
function localDateTime(v){
 const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(text(v));if(!m)return null;
 const d=new Date(+m[1],+m[2]-1,+m[3],+m[4],+m[5],0,0);
 return d.getFullYear()===+m[1]&&d.getMonth()===+m[2]-1&&d.getDate()===+m[3]&&d.getHours()===+m[4]?+d:null;
}
/* Default for «Richiamare»: tomorrow at 9:00 local, as the datetime-local value. */
function tomorrowAt9(now){const d=new Date(now);d.setDate(d.getDate()+1);d.setHours(9,0,0,0);const p=x=>String(x).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T09:00'}

/* After a write: the row the server returned replaces (or joins) the loaded rows, so the sheet
   updates at once without reloading every page («Carica altri 100» pages stay loaded). */
function merge(rows,saved){const a=list(rows);if(!saved||!saved.id)return a;const i=a.findIndex(r=>r&&r.id===saved.id);if(i<0)return [saved,...a];const out=a.slice();out[i]={...a[i],...saved};return out}

/* Keyboard: the next cell for a key in a grid of rows × cols (0-based). null: key not handled. */
function move(pos,key,rows,cols,opts){
 const r=pos&&Number.isInteger(pos.r)?pos.r:0,c=pos&&Number.isInteger(pos.c)?pos.c:0,ctrl=!!(opts&&opts.ctrl),page=(opts&&opts.page)||10;
 if(rows<=0||cols<=0)return null;const clamp=(v,n)=>Math.max(0,Math.min(n-1,v));
 switch(key){
  case 'ArrowUp':return {r:ctrl?0:clamp(r-1,rows),c};
  case 'ArrowDown':return {r:ctrl?rows-1:clamp(r+1,rows),c};
  case 'ArrowLeft':return {r,c:ctrl?0:clamp(c-1,cols)};
  case 'ArrowRight':return {r,c:ctrl?cols-1:clamp(c+1,cols)};
  case 'Home':return ctrl?{r:0,c:0}:{r,c:0};
  case 'End':return ctrl?{r:rows-1,c:cols-1}:{r,c:cols-1};
  case 'PageUp':return {r:clamp(r-page,rows),c};
  case 'PageDown':return {r:clamp(r+page,rows),c};
 }
 return null;
}

/* CSV of the grid as shown: visible columns, visible rows, values as text. */
const pad=x=>String(x).padStart(2,'0');
const dateTime=t=>{if(t==null)return '';const d=new Date(t);return pad(d.getDate())+'/'+pad(d.getMonth()+1)+'/'+d.getFullYear()+' '+pad(d.getHours())+':'+pad(d.getMinutes())};
function actText(a){if(!a)return '';return [dateTime(a.at),KINDS[a.kind]||a.kind,a.outcome?OUTCOMES[a.outcome]:a.title,a.note].filter(Boolean).join(' · ')}
function todoText(t){if(!t)return '';return [t.at!=null?dateTime(t.at):'senza scadenza',t.title,t.overdue?'scaduta':''].filter(Boolean).join(' · ')}
/* Text of one drawn column (from expand, or a base column id) for a row: what the CSV holds. */
function cellText(row,col){
 const c=typeof col==='string'?{id:col,base:colOf(col.split(':')[0]),index:col.includes(':')?Number(col.split(':')[1])-1:undefined}:col;
 if(c.base&&c.base.id==='acts')return actText(list(row.acts)[c.index]);
 if(c.base&&c.base.id==='todos')return todoText(list(row.todos)[c.index]);
 switch(c.id){
  case 'stage':return row.deal?row.stage+(row.deal.title?' · '+row.deal.title:''):'';
  case 'revenue':return row.revenue==null?'':String(Math.round(row.revenue/100));
  case 'employees':return row.employees==null?'':String(row.employees);
  default:return row[c.id]==null?'':String(row[c.id]);
 }
}
function csvColumns(drawn){return list(drawn).map(c=>({label:c.id==='revenue'?'Fatturato (EUR)':c.label,value:r=>cellText(r,c)}))}

/* ---------- Full text of one activity or to-do (the panel opened from its cell) ---------- */
const WEEKDAYS=['domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato'];
const longDate=t=>t==null?'':WEEKDAYS[new Date(t).getDay()]+' '+dateTime(t).replace(' ',', ');
const TASK_STATUS=Object.freeze({todo:'Da fare',doing:'In corso',done:'Fatta'});
const PRIORITY=Object.freeze({low:'Bassa',normal:'Normale',high:'Alta',urgent:'Urgente'});
const memberName=(members,id)=>{if(id==null||id==='')return '';const m=list(members).find(x=>x&&String(x.id)===String(id));return m?text(m.name)||text(m.email):''};
/* entry: one of row.acts or row.todos. opts.members: the workspace members (for the author).
   → {kind:'act'|'todo', heading, when, kindLabel, outcome, title, paragraphs, facts, late, position, contact}. */
function detail(row,entry,opts){
 if(!row||!entry)return null;const members=opts&&opts.members,r=entry.record||{};
 const todo=!!entry.source,listOf=todo?list(row.todos):list(row.acts),i=listOf.indexOf(entry);
 const kindLabel=todo&&entry.source==='task'?'Attività da fare':KINDS[entry.kind]||entry.kind||'Interazione';
 const facts=[];
 if(todo&&entry.source==='task'){
  if(r.status&&TASK_STATUS[r.status])facts.push(['Stato',TASK_STATUS[r.status]]);
  if(r.priority&&PRIORITY[r.priority])facts.push(['Priorità',PRIORITY[r.priority]]);
  const who=memberName(members,r.assignee_id);if(who)facts.push(['Assegnata a',who]);
 }else{const who=memberName(members,r.created_by);if(who)facts.push(['Registrata da',who])}
 if(todo&&entry.source==='interaction')facts.push(['In calendario','interazione futura']);
 const title=text(entry.title);
 return {kind:todo?'todo':'act',
  heading:kindLabel+(entry.outcome?' · '+OUTCOMES[entry.outcome]:''),
  when:entry.at==null?'Senza scadenza':(todo?'Scadenza: ':'')+longDate(entry.at),
  kindLabel,outcome:entry.outcome?{key:entry.outcome,label:OUTCOMES[entry.outcome]}:null,
  title,paragraphs:paragraphs(entry.text),facts,late:!!entry.overdue,
  position:i<0?'':(todo?'Da fare ':'Attività ')+(i+1)+' di '+listOf.length,
  contact:row.name+(row.company?' · '+row.company:'')};
}

/* ---------- Loading every page when the sheet opens (reads only) ---------- */
// What the sheet joins, in reading order: interactions first, they fill the «Attività» columns.
const LOAD_ORDER=Object.freeze(['interactions','tasks','companies','opportunities']);
const LOAD_NAMES=Object.freeze({interactions:'interazioni',tasks:'attività',companies:'aziende',opportunities:'trattative'});
const PAGE_CAP=30;
/* Entities still partial (more[e] true), in LOAD_ORDER. */
const toLoad=more=>LOAD_ORDER.filter(e=>more&&more[e]);
/* The progress line: p = {entity, pages (read so far), done, capped: [entities left partial at the cap], failed}. */
function progressText(p){
 const s=p||{},n=s.pages||0,pages=n+(n===1?' pagina letta':' pagine lette');
 if(s.failed)return 'Caricamento delle attività interrotto: '+s.failed+' Premi «Completa i dati» per riprovare.';
 if(!s.done)return 'Carico tutte le attività: '+(LOAD_NAMES[s.entity]||s.entity||'dati')+', '+pages+'…';
 const capped=list(s.capped);
 if(capped.length)return 'Lette '+PAGE_CAP+' pagine di '+capped.map(e=>LOAD_NAMES[e]||e).join(', ')+' (limite per volta): ne restano altre, premi «Completa i dati» per continuare.';
 return n?'Tutte le attività caricate ('+pages+').':'';
}

/* ---------- Activity columns out of sight (the hint next to the grid) ---------- */
/* «N attività» under the contact's name, in the frozen block: how many columns it fills on the right. */
const countLabel=n=>!Number.isFinite(n)||n<1?'':n===1?'1 attività':n+' attività';
/* The «Attività N» columns are the last ones: on a 1920 px screen only part of «Attività 1» is in view,
   at 1440 px and on a phone none, and macOS hides scrollbars, so a contact with five activities looked
   like it had one. cols: the drawn activity headers [{id, label, left, right}] in grid pixels; view:
   {left, right} the part of the grid in view right of the frozen columns. A column counts as seen only
   when it is wholly in view. → {count, first, from, to, text} of the activity columns cut off on the
   right (count 0: all in view). first: the id to scroll to. */
function hiddenRight(cols,view){
 const right=view&&Number.isFinite(view.right)?view.right:Infinity;
 const out=list(cols).filter(c=>c&&/^acts:\d+$/.test(c.id)&&Number.isFinite(c.right)&&c.right>right+1);
 if(!out.length)return {count:0,first:null,from:0,to:0,text:''};
 const n=out.map(c=>Number(c.id.split(':')[1])).sort((a,b)=>a-b),from=n[0],to=n[n.length-1],count=out.length;
 const all=from===1,range=from===to?'Attività '+from:'Attività '+from+'–'+to;
 const text=(all?(count===1?'1 attività':count+' attività'):(count===1?'Un’altra attività':'Altre '+count+' attività'))+' a destra ('+range+') ›';
 return {count,first:'acts:'+from,from,to,text};
}

const api={OUTCOMES,FOLLOW,KINDS,GROUPS,COLUMNS,MAX_MANY,colOf,headerGroups,columnsFor,expand,outcomeOf,shortNote,activities,todos,lastInteraction,nextActivity,topDeal,buildRows,actText,todoText,passes,matches,sortRows,apply,nextSort,
 storageKey,defaults,normalize,parse,toggleColumn,target,editValue,editPlan,callPlan,localDateTime,tomorrowAt9,merge,move,cellText,csvColumns,dateTime,fold,
 fullNote,paragraphs,isLong,PREVIEW,longDate,detail,LOAD_ORDER,PAGE_CAP,toLoad,progressText,countLabel,hiddenRight};
if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixCrmSheet=api;
})(typeof globalThis!=='undefined'?globalThis:this);
