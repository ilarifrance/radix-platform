'use strict';
/* CSV import of opportunities (trattative) and tasks (attività): column mapping with Italian and English
   (Salesforce export) headers, amounts and dates in Italian and English formats, and the plan shown in the
   preview. Pure: no DOM, no network. Companies, contacts, opportunities, stages and members are matched
   against the CRM rows passed in; nothing new is created for them. Only fields of api/_sales.js. */
(function(root){
const csvCore=()=>root.RadixCrmCsv||(typeof require==='function'?require('./crm-csv-core.js'):null);
const fieldsCore=()=>root.RadixCrmFields||(typeof require==='function'?require('./crm-fields-core.js'):null);
const MAX_AMOUNT=9000000000000;
// Header «Importo (€)» → «importo»; «Probabilità (%)» → «probabilita».
const hkey=s=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
// Value for matching: case, accents and repeated spaces do not count.
const vkey=s=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLocaleLowerCase('it').replace(/\s+/g,' ').trim();
// Aliases in priority order: the first one found wins, and a column is used by one field only.
const COMPANY=['azienda','company','accountname','account','nomeazienda','companyname','societa','cliente','organizzazione','ragionesociale'];
const CONTACT=['contatto','contact','contactname','nomecontatto','referente','persona'];
const CONTACT_EMAIL=['emailcontatto','contactemail','emailreferente','email','mail'];
const ALIASES={
 opportunities:{title:['trattativa','titolo','nometrattativa','opportunita','nomeopportunita','opportunityname','dealname','deal','title','oggetto','nome','name'],
  amount:['importo','valore','ammontare','importotrattativa','valoretrattativa','amount','value','dealvalue','importoeur','valoreeur'],
  process:['pipeline','processo','process','processovendita'],
  stage:['fase','stage','dealstage','fasevendita','faseopportunita','stato','status'],
  expected_close:['chiusuraprevista','datachiusuraprevista','datachiusura','datadichiusura','closedate','expectedclose','expectedclosedate','chiusura'],
  probability:['probabilita','probability','probabilitapercentuale'],
  company:COMPANY,contact:CONTACT,contact_email:CONTACT_EMAIL,
  owner:['responsabile','owner','opportunityowner','dealowner','proprietario','commerciale','assegnatario'],
  notes:['note','notes','descrizione','description','commenti']},
 tasks:{title:['attivita','titolo','oggetto','compito','subject','task','title','nome','name'],
  due:['scadenza','datascadenza','duedate','due','activitydate','entroil','data','date'],
  status:['stato','status','completata','completato','fatto','done'],
  priority:['priorita','priority'],
  assignee:['assegnatario','assegnataa','assegnato','assignedto','incaricato','responsabile','owner'],
  opportunity:['trattativa','opportunita','opportunity','opportunityname','nometrattativa','deal'],
  company:COMPANY,contact:CONTACT,contact_email:CONTACT_EMAIL}
};
const STATUS={todo:['todo','da fare','dafare','aperta','aperto','open','not started','non iniziata','non iniziato','in attesa','waiting on someone else','deferred','rimandata','no','false','0'],
 doing:['doing','in corso','in progress','iniziata','avviata','in lavorazione','started'],
 done:['done','fatto','fatta','completata','completato','completed','chiusa','chiuso','closed','conclusa','sì','si','yes','true','x','1']};
const PRIORITY={low:['low','bassa','basso'],normal:['normal','normale','media','medio','medium'],high:['high','alta','alto','importante'],urgent:['urgent','urgente','critica','critico']};
const wordOf=(table,v)=>{const k=vkey(v);for(const [w,list] of Object.entries(table))if(list.some(x=>vkey(x)===k))return w;return null};
function columns(kind,headers){
 const col={},used=new Set();
 for(const [field,names] of Object.entries(ALIASES[kind]))for(const n of names){const h=headers.find(x=>!used.has(x)&&hkey(x)===n);if(h){col[field]=h;used.add(h);break}}
 return col;
}
// Our own export writes «'=…» so that a spreadsheet keeps it as text: the import reads back the value.
const unsafe=v=>{const s=String(v??'').trim();return /^'[=+\-@]/.test(s)?s.slice(1):s};
// «€ 1.234,56», «1,234.56», «1234», «1.500 EUR» → cents; NaN when not a positive amount.
function amountCents(v){
 const s=String(v??'').replace(/[\s  ]/g,'').replace(/^(?:eur|euro)/i,'').replace(/(?:eur|euro)$/i,'');if(!s)return null;
 if(/^-|-$/.test(s))return NaN;
 const F=fieldsCore();const c=F?F.euroToCents(s):NaN;
 return Number.isSafeInteger(c)&&c>=0&&c<=MAX_AMOUNT?c:NaN;
}
const realDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&(d=>Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s)(new Date(s+'T00:00:00Z'));
// «31/12/2026», «31.12.2026», «2026-12-31» (also with a time after it) → «2026-12-31», or null.
function calendarDay(v){const s=String(v??'').trim().split(/[ T]/)[0];const d=csvCore().isoDate(s);return realDate(d)?d:null}
/* Due date of a task → UTC timestamp with seconds and Z (api/_sales.js). A date without a time is due at
   09:00 local time, as the follow-up rules do; «31/12/2026 15:30» keeps its time. */
function dueAt(v){
 const s=String(v??'').trim();if(!s)return null;
 if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(s)){const t=Date.parse(s);return Number.isFinite(t)?new Date(t).toISOString():null}
 const m=/^(\S+)(?:[ T](\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?)?$/.exec(s);if(!m)return null;
 const day=calendarDay(m[1]);if(!day)return null;const h=m[2]===undefined?9:Number(m[2]),mi=Number(m[3]||0),sec=Number(m[4]||0);
 if(h>23||mi>59||sec>59)return null;
 const [y,mo,d]=day.split('-').map(Number);const t=new Date(y,mo-1,d,h,mi,sec);
 return Number.isFinite(t.getTime())?t.toISOString():null;
}
// «40», «40%», «40,5 %» → 40 (or 41); null when empty, NaN when not 0–100.
function percent(v){const s=String(v??'').trim();if(!s)return null;if(!/^\d{1,3}(?:[.,]\d+)?\s*%?$/.test(s))return NaN;const n=Math.round(Number(s.replace('%','').replace(',','.').trim()));return n>=0&&n<=100?n:NaN}
const index=(rows,keyOf)=>{const m=new Map();for(const r of rows||[]){const k=keyOf(r);if(!k)continue;if(!m.has(k))m.set(k,[]);m.get(k).push(r)}return m};
/* ctx: {companies,contacts,opportunities,tasks,processes,stages,members} as /api/sales reads them. */
function matcher(ctx){
 const companies=index(ctx.companies,c=>vkey(c.name)),byEmail=index(ctx.contacts,c=>c.email?vkey(c.email):''),byName=index(ctx.contacts,c=>vkey(c.name));
 const members=index(ctx.members,m=>vkey(m.name)),opps=index(ctx.opportunities,o=>vkey(o.title));
 const one=(list,label,value,narrow)=>{if(!list||!list.length)return {miss:label+' «'+value+'» non '+(['Azienda','Trattativa'].includes(label)?'trovata':'trovato')+' nel CRM'};
  const l=narrow&&list.length>1?list.filter(narrow):list;if(l.length===1)return {row:l[0]};return {miss:'più record per '+label.toLowerCase()+' «'+value+'»: collegalo a mano'}};
 return {
  company:v=>one(companies.get(vkey(v)),'Azienda',v),
  contact:(name,email,companyId)=>email&&byEmail.has(vkey(email))?one(byEmail.get(vkey(email)),'Contatto',email,c=>c.company_id===companyId):name?one(byName.get(vkey(name)),'Contatto',name,c=>c.company_id===companyId):email?one(null,'Contatto',email):{},
  member:v=>one(members.get(vkey(v)),'Membro',v),
  opportunity:(v,companyId)=>one(opps.get(vkey(v)),'Trattativa',v,o=>o.company_id===companyId)
 };
}
const nameOf=(rows,id,key='name')=>id?((rows||[]).find(r=>r.id===id)||{})[key]||'':'';
// Company and contact of one row, kept coherent the way the database requires: a contact carries its own
// company (or none), so a contact of another company is left out rather than moving the record.
function linkParties(M,cell,ctx,warn){
 let company=null,contact=null;
 if(cell.company){const r=M.company(cell.company);if(r.row)company=r.row;else warn(r.miss+': senza azienda')}
 // An email in the «Contatto» column is matched as an email.
 if(!cell.contact_email&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cell.contact||''))cell={...cell,contact_email:cell.contact,contact:''};
 if(cell.contact||cell.contact_email){const r=M.contact(cell.contact,cell.contact_email,company?company.id:null);
  if(r.row){if(company&&r.row.company_id!==company.id)warn('il contatto «'+r.row.name+'» non è di «'+company.name+'»: senza contatto');else contact=r.row}
  else if(r.miss)warn(r.miss+': senza contatto')}
 const company_id=contact?(contact.company_id||null):company?company.id:null;
 if(contact&&!company&&contact.company_id)company={id:contact.company_id,name:nameOf(ctx.companies,contact.company_id)};
 return {company_id,contact_id:contact?contact.id:null,company:company_id?(company&&company.name)||nameOf(ctx.companies,company_id):'',contact:contact?contact.name:''};
}
const stageKey=s=>vkey(s.title);
function pipelines(ctx){
 const processes=(ctx.processes||[]).filter(p=>p.kind==='opportunity');
 return processes.map(p=>({process:p,stages:(ctx.stages||[]).filter(s=>s.process_id===p.id).sort((a,b)=>a.position-b.position)})).filter(p=>p.stages.length);
}
const dupKey=(title,companyId)=>vkey(title)+'|'+(companyId||'');
const taskKey=t=>[vkey(t.title),t.opportunity_id||'',t.contact_id||'',t.company_id||'',t.due_at?String(t.due_at).slice(0,10):''].join('|');
/* parsed: RadixCrmCsv.parse(text). Returns {rows,columns,counts} or {fatal} when nothing can be read.
   Each row: {line,status:'create'|'dup'|'error',data,note,view,problems}. data is the /api/sales create
   payload; note (opportunities) is the text of «Note», saved as a note interaction on the opportunity. */
function plan(kind,parsed,ctx,opts){
 const o=opts||{},col=columns(kind,parsed.headers);
 if(!col.title)return {fatal:'Manca la colonna '+(kind==='opportunities'?'«Trattativa» (o «Titolo», «Opportunity Name»)':'«Attività» (o «Titolo», «Oggetto», «Subject»)')+'.',columns:col};
 const lines=kind==='opportunities'?pipelines(ctx):null;
 if(kind==='opportunities'&&!lines.length)return {fatal:'Nessuna pipeline delle trattative con fasi in questo workspace: creala in Processi e fasi, poi importa.',columns:col};
 const M=matcher(ctx),seen=new Set(kind==='opportunities'?(ctx.opportunities||[]).map(x=>dupKey(x.title,x.company_id)):(ctx.tasks||[]).map(taskKey));
 const rows=parsed.rows.map((raw,i)=>{
  const cell={};for(const [f,h] of Object.entries(col))cell[f]=unsafe(raw[h]).slice(0,f==='notes'?4000:200);
  const problems=[],errors=[];const warn=t=>problems.push(t);
  const out={line:i+2,problems,data:{},view:{}};
  if(!cell.title)errors.push('titolo mancante');
  const data={title:cell.title};
  if(kind==='opportunities'){
   let line=lines[0];
   if(cell.process){const p=lines.find(l=>vkey(l.process.title)===vkey(cell.process));if(p)line=p;else warn('pipeline «'+cell.process+'» non trovata: '+line.process.title)}
   let stage=null;
   if(cell.stage){stage=line.stages.find(s=>stageKey(s)===vkey(cell.stage))||null;
    if(!stage&&!cell.process){const other=lines.find(l=>l.stages.some(s=>stageKey(s)===vkey(cell.stage)));if(other){line=other;stage=other.stages.find(s=>stageKey(s)===vkey(cell.stage))}}
    if(!stage)warn('fase «'+cell.stage+'» non trovata: '+line.stages[0].title)}
   stage=stage||line.stages[0];
   Object.assign(data,{process_id:line.process.id,stage_id:stage.id});
   if(cell.amount){const c=amountCents(cell.amount);if(Number.isNaN(c))errors.push('importo «'+cell.amount+'» non leggibile');else if(c!=null)data.amount_cents=c}
   if(cell.expected_close){const d=calendarDay(cell.expected_close);if(d)data.expected_close=d;else warn('data di chiusura «'+cell.expected_close+'» non leggibile: lasciata vuota')}
   if(cell.probability){const p=percent(cell.probability);if(Number.isNaN(p))warn('probabilità «'+cell.probability+'» non valida: lasciata vuota');else data.probability=p}
   if(cell.owner){const r=M.member(cell.owner);if(r.row)data.owner_id=Number(r.row.id);else warn(r.miss+': responsabile non assegnato')}
   const who=linkParties(M,cell,ctx,warn);if(who.company_id)data.company_id=who.company_id;if(who.contact_id)data.contact_id=who.contact_id;
   if(cell.notes)out.note=cell.notes;
   out.view={title:cell.title,amount:data.amount_cents,stage:(lines.length>1?line.process.title+' / ':'')+stage.title,close:data.expected_close||'',company:who.company,contact:who.contact,notes:cell.notes?'sì':''};
   const k=dupKey(cell.title,who.company_id);
   if(!errors.length&&seen.has(k)){out.status='dup';problems.unshift('già nel CRM'+(who.company?' per «'+who.company+'»':' senza azienda')+': saltata')}
   else if(!errors.length)seen.add(k);
  }else{
   if(cell.due){const t=dueAt(cell.due);if(t)data.due_at=t;else warn('scadenza «'+cell.due+'» non leggibile: lasciata vuota')}
   if(cell.status){const s=wordOf(STATUS,cell.status);if(s)data.status=s;else warn('stato «'+cell.status+'» non riconosciuto: da fare')}
   if(cell.priority){const p=wordOf(PRIORITY,cell.priority);if(p)data.priority=p;else warn('priorità «'+cell.priority+'» non riconosciuta: normale')}
   if(cell.assignee){const r=M.member(cell.assignee);if(r.row)data.assignee_id=Number(r.row.id);else warn(r.miss+': non assegnata')}
   let who;
   if(cell.opportunity){
    const company=cell.company?M.company(cell.company).row:null;const r=M.opportunity(cell.opportunity,company?company.id:null);
    if(r.row){
     // A task on an opportunity carries the opportunity's company and contact (database rule).
     const opp=r.row;who={company_id:opp.company_id||null,contact_id:opp.contact_id||null,company:nameOf(ctx.companies,opp.company_id),contact:nameOf(ctx.contacts,opp.contact_id),opportunity:opp.title};data.opportunity_id=opp.id;
     if(cell.company&&company&&company.id!==opp.company_id)warn('azienda «'+cell.company+'» diversa da quella della trattativa: usata quella della trattativa');
     if((cell.contact||cell.contact_email)&&!opp.contact_id)warn('la trattativa non ha un contatto: attività senza contatto');
    }else warn(r.miss+': senza trattativa')}
   if(!who)who=linkParties(M,cell,ctx,warn);
   if(who.company_id)data.company_id=who.company_id;if(who.contact_id)data.contact_id=who.contact_id;
   out.view={title:cell.title,due:data.due_at||'',status:data.status||'todo',priority:data.priority||'normal',link:[who.opportunity,who.company,who.contact].filter(Boolean).join(' · ')};
   const k=taskKey(data);
   if(!errors.length&&seen.has(k)){out.status='dup';problems.unshift('attività uguale già presente: saltata')}
   else if(!errors.length)seen.add(k);
  }
  out.data=data;
  if(errors.length){out.status='error';problems.unshift(...errors.map(e=>e+': non importata'))}
  else if(!out.status)out.status='create';
  return out;
 });
 const counts={create:0,dup:0,error:0};for(const r of rows)counts[r.status]++;
 return {rows,columns:col,counts};
}
// Body of the note interaction that keeps the «Note» column of an imported opportunity.
function noteFor(created,text,now){return {title:'Note importate da CSV',kind:'note',occurred_at:new Date(now??Date.now()).toISOString(),body:String(text).slice(0,4000),opportunity_id:created.id,company_id:created.company_id||null,contact_id:created.contact_id||null}}
const api={ALIASES,STATUS,PRIORITY,hkey,vkey,columns,unsafe,amountCents,calendarDay,dueAt,percent,plan,noteFor,matcher};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.RadixCrmImportDealsCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
