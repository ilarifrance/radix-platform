'use strict';
/* Import of the history of calls, meetings, emails and notes (interazioni) from a CSV or Excel export:
   Salesforce «Activity History», HubSpot, Pipedrive or a sheet kept by hand. Column mapping with Italian
   and English headers, activity types, dates in Italian, English and ISO formats (also Excel serial
   numbers), matching of companies, contacts and opportunities already in the CRM, duplicates and the
   final report. Pure: no DOM, no network. Only the fields of api/_sales.js (interactions:
   title, kind, occurred_at, body, company_id, contact_id, opportunity_id); nothing else is created. */
(function(root){
const deals=()=>root.RadixCrmImportDealsCore||(typeof require==='function'?require('./crm-import-deals-core.js'):null);
const csvCore=()=>root.RadixCrmCsv||(typeof require==='function'?require('./crm-csv-core.js'):null);
const hkey=s=>deals().hkey(s),vkey=s=>deals().vkey(s);
const KINDS=['call','meeting','email','note'];
const KIND_LABEL={call:'Chiamata',meeting:'Riunione',email:'Email',note:'Nota'};
const FIELD_LABEL={title:'Oggetto',kind:'Tipo',date:'Data (e ora)',time:'Ora',body:'Note / descrizione',outcome:'Esito',duration:'Durata',company:'Azienda',contact:'Contatto',contact_email:'Email contatto',opportunity:'Trattativa',owner:'Assegnata a'};
/* Aliases in priority order (header compared without case, accents, spaces and punctuation): the first one
   found wins and a column is used by one field only. Pipedrive and HubSpot prefixes («Activity - Subject»)
   are ignored. The order of the fields matters: «Email» goes to the contact email before anything else. */
const ALIASES={
 title:['oggetto','titolo','subject','activitysubject','oggettoattivita','titoloattivita','calltitle','meetingname','meetingtitle','emailsubject','titolointerazione','interazione','attivita','title'],
 kind:['tipo','tipoattivita','tipointerazione','tipodiattivita','tipologia','type','activitytype','tasksubtype','subtype','eventsubtype','engagementtype','canale','channel'],
 date:['dataeora','dataora','data','dataattivita','datainterazione','giorno','quando','activitydate','activitydatetime','date','datetime','startdatetime','startdate','eventdate','duedate','createddate','timestamp','scadenza'],
 time:['ora','orario','orainizio','oradiinizio','time','duetime','starttime','activitytime'],
 body:['note','notes','descrizione','description','comments','commenti','commento','testo','body','notebody','callnotes','meetingnotes','meetingdescription','emailbody','dettagli','contenuto','resoconto'],
 outcome:['esito','calloutcome','meetingoutcome','outcome','risultato','esitochiamata'],
 duration:['durata','duration','durataminuti','duratamin','durationminutes','durationinminutes','callduration','calldurationhhmmss','durationhhmmss','calldurationinseconds','durationinseconds','duratasecondi','minuti'],
 opportunity:['trattativa','nometrattativa','opportunita','opportunity','opportunityname','deal','dealname','associateddeal'],
 company:['azienda','nomeazienda','company','companyname','accountname','account','associatedcompany','organizzazione','organization','organizationname','societa','cliente','ragionesociale'],
 contact_email:['emailcontatto','contactemail','emailreferente','email','mail','emailaddress','personemail','contactpersonemail','associatedcontactemail'],
 contact:['contatto','nomecontatto','contact','contactname','associatedcontact','contactperson','referente','persona','person','name','nome','nomeecognome','fullname','who'],
 owner:['assegnataa','assegnatoa','assegnatario','responsabile','assignedto','assignedtouser','activityassignedto','activityowner','owner','proprietario','commerciale','utente','user']
};
const PREFIX=/^(?:activity|attivita|attività|engagement)\s*[-–—:]\s*/i;
const keysOf=h=>{const a=hkey(h),b=hkey(String(h).replace(PREFIX,''));return a===b?[a]:[a,b]};
function columns(headers){
 const col={},used=new Set(),keys=new Map((headers||[]).map(h=>[h,keysOf(h)]));
 for(const [field,names] of Object.entries(ALIASES))for(const n of names){const h=(headers||[]).find(x=>x&&!used.has(x)&&keys.get(x).includes(n));if(h){col[field]=h;used.add(h);break}}
 return col;
}
// Mapping edited in the preview: {field: header or ''}; unknown headers and a header used twice are dropped.
function mapping(headers,auto,edit){
 const col={...auto};
 for(const [f,h] of Object.entries(edit||{})){if(!ALIASES[f])continue;if(!h)delete col[f];else if((headers||[]).includes(h))col[f]=h}
 const seen=new Set();for(const f of Object.keys(ALIASES)){if(!col[f])continue;if(seen.has(col[f]))delete col[f];else seen.add(col[f])}
 return col;
}

/* ---------- type ---------- */
const compact=s=>vkey(s).replace(/[^a-z0-9]/g,'');
const KIND_WORDS={
 call:['chiamata','chiamate','telefonata','telefonate','telefono','tel','call','calls','phone','phonecall','loggedcall','coldcall','outboundcall','inboundcall','chiamatainuscita','chiamatainentrata','richiamata','callback'],
 meeting:['meeting','meetings','riunione','riunioni','incontro','incontri','appuntamento','event','evento','visita','videochiamata','videocall','videoconferenza','demo','presentazione','conferenza','webinar'],
 email:['email','emails','mail','posta','listemail','loggedemail','emailinviata','emailricevuta','sentemail','incomingemail','outgoingemail','inmail'],
 note:['note','nota','notes','appunto','appunti','task','other','altro','commento','comment','attivita','todo','compito','promemoria','generico','generica']
};
// «Chiamata in uscita», «Logged call», «Video call», «E-mail» → call / meeting / email / note; null when unknown.
function kindOf(v){
 const c=compact(v);if(!c)return null;
 for(const k of KINDS)if(KIND_WORDS[k].includes(c))return k;
 const s=vkey(v);
 if(/riunion|incontr|meeting|appuntament|video|visit|evento|\bevent\b|demo|webinar|conferen/.test(s))return 'meeting';
 if(/chiamat|telefon|\bcall|phone|richiam/.test(s))return 'call';
 if(/e-?mail|\bmail\b|posta/.test(s))return 'email';
 if(/\bnot[ae]\b|appunt|comment|\btask\b/.test(s))return 'note';
 return null;
}
// Without a type column: «Email: Proposta», «Call», «Chiamata con Anna» at the start of the subject.
function kindFromTitle(t){
 const s=vkey(t);
 if(/^(?:e-?mail|mail)\b/.test(s))return 'email';
 if(/^(?:call|chiamata|telefonata|logged call)\b/.test(s))return 'call';
 if(/^(?:meeting|riunione|incontro|appuntamento|video ?call|videochiamata)\b/.test(s))return 'meeting';
 return null;
}

/* ---------- dates ---------- */
const MONTHS={gen:1,gennaio:1,jan:1,january:1,feb:2,febbraio:2,february:2,mar:3,marzo:3,march:3,apr:4,aprile:4,april:4,mag:5,maggio:5,may:5,giu:6,giugno:6,jun:6,june:6,lug:7,luglio:7,jul:7,july:7,ago:8,agosto:8,aug:8,august:8,set:9,sett:9,settembre:9,sep:9,sept:9,september:9,ott:10,ottobre:10,oct:10,october:10,nov:11,novembre:11,november:11,dic:12,dicembre:12,dec:12,december:12};
const WEEKDAY=/^(?:lun|lunedi|mar|martedi|mer|mercoledi|gio|giovedi|ven|venerdi|sab|sabato|dom|domenica|mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday)\.?,?\s+/;
const year=y=>y.length===2?(Number(y)<70?2000:1900)+Number(y):Number(y);
const real=(y,m,d)=>{if(!(y>=1900&&y<=2200&&m>=1&&m<=12&&d>=1&&d<=31))return null;const t=new Date(Date.UTC(y,m-1,d));return t.getUTCMonth()===m-1&&t.getUTCDate()===d?{y,m,d}:null};
/* Order of «03/04/2025» in a column: Italian day/month unless some value only reads as month/day
   (second number above 12, as in a US Salesforce export) and none reads only as day/month. */
function dateOrder(values){
 let dmy=false,mdy=false;
 for(const v of values||[]){const m=/^\s*(\d{1,2})[\/.\-](\d{1,2})[\/.\-]\d{2,4}/.exec(String(v??''));if(!m)continue;if(Number(m[1])>12)dmy=true;if(Number(m[2])>12)mdy=true}
 return mdy&&!dmy?'mdy':'dmy';
}
function day(s,order){
 s=vkey(s).replace(/,/g,' ').replace(/\s+/g,' ').trim();
 let m=/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/.exec(s);if(m)return real(+m[1],+m[2],+m[3]);
 m=/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/.exec(s);
 if(m){let a=+m[1],b=+m[2];if(order==='mdy'&&a<=12)[a,b]=[b,a];else if(a<=12&&b>12)[a,b]=[b,a];return real(year(m[3]),b,a)}
 m=/^(\d{1,2})(?:\s|-)*([a-z]+)\.?(?:\s|-)*(\d{4})$/.exec(s);if(m&&MONTHS[m[2]])return real(+m[3],MONTHS[m[2]],+m[1]);
 m=/^([a-z]+)\.?\s*(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})$/.exec(s);if(m&&MONTHS[m[1]])return real(+m[3],MONTHS[m[1]],+m[2]);
 const w=s.replace(WEEKDAY,'');return w!==s?day(w,order):null;
}
// «14:30», «14.30», «2:30 PM», «ore 9», Excel fraction «0.6041» → {h,mi,s} or null.
function clock(v){
 let s=vkey(v).replace(/^(?:ore|h|alle)\s*/,'').replace(/^(\d{1,2}[:.]\d{2}[:.]\d{2})\.\d+$/,'$1').trim();if(!s)return null;
 if(/^0?[.,]\d+$/.test(s)){const t=Math.round(Number(s.replace(',','.'))*86400);if(t>=86400)return null;return {h:Math.floor(t/3600),mi:Math.floor(t/60)%60,s:t%60}}
 const m=/^(\d{1,2})(?:[:.](\d{2}))?(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/.exec(s);if(!m)return null;
 let h=+m[1];const mi=+(m[2]||0),sec=+(m[3]||0),ap=m[4]?m[4][0]:'';
 if(m[2]===undefined&&!ap&&!/^(?:ore|h|alle)/.test(vkey(v)))return null;
 if(ap){if(h<1||h>12)return null;if(ap==='p'&&h<12)h+=12;if(ap==='a'&&h===12)h=0}
 return h<=23&&mi<=59&&sec<=59?{h,mi,s:sec}:null;
}
const TIME_AT_END=/^(.*?\S)(?:\s*,\s*|\s+|T)((?:ore|alle|h)\s*\d{1,2}(?:[:.]\d{2})?|\d{1,2}[:.]\d{2}(?:[:.]\d{2})?(?:\.\d+)?(?:\s*[ap]\.?m\.?)?|\d{1,2}\s*[ap]\.?m\.?)$/i;
/* Date of an interaction → {at: UTC timestamp with seconds and Z, timed} or null. A date without a time
   (and no «Ora» column) is at 09:00 local time, as the task import does. timeCell: the «Ora» column. */
function occurredAt(v,timeCell,order){
 const s=String(v??'').trim();if(!s)return null;
 if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(s)){const t=Date.parse(s);return Number.isFinite(t)?{at:new Date(t).toISOString(),timed:true}:null}
 let d=null,t=null;
 if(/^\d{5}(?:\.\d+)?$/.test(s)){
  // Excel serial number: days since 30/12/1899, the fraction is the time of day.
  const n=Number(s);if(n<20000||n>110000)return null;
  const base=new Date(Date.UTC(1899,11,30)+Math.floor(n)*864e5);d={y:base.getUTCFullYear(),m:base.getUTCMonth()+1,d:base.getUTCDate()};
  const f=n-Math.floor(n);if(f>0)t=clock(String(f));
 }else{
  d=day(s,order);
  if(!d){const m=TIME_AT_END.exec(s);if(m){d=day(m[1],order);t=clock(m[2]);if(d&&!t)return null}}
 }
 if(!d)return null;
 if(!t&&timeCell!=null&&String(timeCell).trim()){t=clock(timeCell);if(!t)return {bad:'time'}}
 const timed=!!t;t=t||{h:9,mi:0,s:0};
 const at=new Date(d.y,d.m-1,d.d,t.h,t.mi,t.s);
 return Number.isFinite(at.getTime())?{at:at.toISOString(),timed}:null;
}

/* ---------- duration ---------- */
// «15», «15 min», «00:15:00», «1:30», «1h 30m», «90 secondi» → minutes; NaN when not readable.
function minutes(v,seconds){
 const s=vkey(v);if(!s)return null;
 if(/^\d+(?:[.,]\d+)?$/.test(s)){const n=Number(s.replace(',','.'));return Math.round(seconds?n/60:n)}
 let m=/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/.exec(s);
 if(m)return m[3]!==undefined?Math.round(+m[1]*60+ +m[2]+ +m[3]/60):+m[1]*60+ +m[2];
 const h=/(\d+(?:[.,]\d+)?)\s*(?:h|ore|ora|hr|hrs|hour|hours)\b/.exec(s),mi=/(\d+)\s*(?:m|min|mins|minuti|minuto|minutes|minute)\b/.exec(s),se=/(\d+)\s*(?:s|sec|secs|secondi|secondo|seconds|second)\b/.exec(s);
 if(!h&&!mi&&!se)return NaN;
 return Math.round((h?Number(h[1].replace(',','.'))*60:0)+(mi?+mi[1]:0)+(se?+se[1]/60:0));
}
const durationText=n=>n>=60?Math.floor(n/60)+' h'+(n%60?' '+(n%60)+' min':''):n+' min';

/* ---------- plan ---------- */
const keyOf=d=>[d.kind,String(d.occurred_at||'').slice(0,16),vkey(d.title),d.contact_id||d.company_id||d.opportunity_id||''].join('|');
const minuteOf=t=>{const n=Date.parse(t);return Number.isFinite(n)?new Date(n).toISOString():String(t||'')};
const nameOf=(rows,id,key='name')=>id?((rows||[]).find(r=>r.id===id)||{})[key]||'':'';
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/* Company, contact and opportunity of one row, coherent as the database requires: a contact carries its
   own company, an opportunity its own company and contact. warn() collects what was changed. */
function link(M,cell,ctx,warn){
 let company=null,contact=null,opp=null;
 if(cell.company){const r=M.company(cell.company);if(r.row)company=r.row;else warn(r.miss)}
 if(!cell.contact_email&&EMAIL.test(cell.contact||''))cell={...cell,contact_email:cell.contact,contact:''};
 if(cell.contact||cell.contact_email){const r=M.contact(cell.contact,cell.contact_email,company?company.id:null);if(r.row)contact=r.row;else if(r.miss)warn(r.miss)}
 if(cell.opportunity){const r=M.opportunity(cell.opportunity,contact?contact.company_id:company?company.id:null);if(r.row)opp=r.row;else warn(r.miss)}
 let out;
 if(opp){
  out={company_id:opp.company_id||null,contact_id:opp.contact_id||null,opportunity_id:opp.id};
  if(contact&&contact.id!==opp.contact_id)warn('il contatto «'+contact.name+'» non è quello della trattativa: collegata alla trattativa');
  else if(company&&company.id!==opp.company_id)warn('l’azienda «'+company.name+'» non è quella della trattativa: collegata alla trattativa');
 }else if(contact){
  out={company_id:contact.company_id||null,contact_id:contact.id,opportunity_id:null};
  if(company&&company.id!==contact.company_id)warn(contact.company_id?'il contatto «'+contact.name+'» è di «'+nameOf(ctx.companies,contact.company_id)+'», non di «'+company.name+'»: collegata al contatto e alla sua azienda':'il contatto «'+contact.name+'» non ha un’azienda nel CRM: collegata solo al contatto');
 }else out={company_id:company?company.id:null,contact_id:null,opportunity_id:null};
 out.label=[out.opportunity_id?nameOf(ctx.opportunities,out.opportunity_id,'title'):'',nameOf(ctx.companies,out.company_id),nameOf(ctx.contacts,out.contact_id)].filter(Boolean).join(' · ');
 return out;
}
/* parsed: RadixCrmCsv.parse(text) or fromRows(). ctx: {companies,contacts,opportunities,interactions} as
   /api/sales reads them. opts: {columns: mapping edited in the preview, now}. Returns {rows,columns,
   headers,order,counts} or {fatal,columns}. Each row: {line,status:'create'|'dup'|'error',data,problems,
   view,raw}; data is the /api/sales create payload of an interaction. */
function plan(parsed,ctx,opts){
 const o=opts||{},headers=parsed.headers||[],D=deals();
 const auto=columns(headers),col=o.columns?mapping(headers,auto,o.columns):auto;
 if(!col.date)return {fatal:'Manca la colonna della data: «Data», «Activity Date», «Date» o simili. Sceglila in «Colonne del file».',columns:col,auto,headers};
 if(!col.company&&!col.contact&&!col.contact_email&&!col.opportunity)return {fatal:'Manca una colonna per collegare le interazioni: «Azienda», «Contatto», «Email» o «Trattativa» (anche «Account Name», «Name», «Company»).',columns:col,auto,headers};
 const order=dateOrder(parsed.rows.map(r=>r[col.date])),seconds=!!col.duration&&/second|secondi|sec\b/i.test(col.duration);
 const M=D.matcher(ctx),now=o.now??Date.now();
 const inCrm=new Set((ctx.interactions||[]).map(x=>keyOf({...x,occurred_at:minuteOf(x.occurred_at)}))),inFile=new Map();
 const rows=parsed.rows.map((raw,i)=>{
  const cell={};for(const f of Object.keys(ALIASES))cell[f]=col[f]?D.unsafe(raw[col[f]]).slice(0,f==='body'?6000:300):'';
  const problems=[],errors=[],warn=t=>problems.push(t);
  const out={line:i+2,raw,problems,data:{},view:{}};
  // Type
  let kind=null;
  if(cell.kind){kind=kindOf(cell.kind);if(!kind)warn('tipo «'+cell.kind+'» non riconosciuto: importata come nota')}
  if(!kind&&!cell.kind){kind=kindFromTitle(cell.title);if(!kind&&col.kind)warn('tipo mancante: importata come nota')}
  kind=kind||'note';
  // Date and time
  let at=null,timed=false;
  if(!cell.date)errors.push('data mancante');
  else{const r=occurredAt(cell.date,cell.time,order);
   if(!r)errors.push('data «'+cell.date+'» non leggibile');
   else if(r.bad){errors.push('ora «'+cell.time+'» non leggibile')}
   else{at=r.at;timed=r.timed;if(Date.parse(at)>now+864e5)warn('data nel futuro: controlla che sia avvenuta')}}
  // Subject
  let title=cell.title.replace(/\s+/g,' ').trim();
  if(!title){title=KIND_LABEL[kind];if(col.title)warn('oggetto mancante: titolo «'+title+'»')}
  if(title.length>200){title=title.slice(0,199)+'…';warn('oggetto oltre 200 caratteri: accorciato')}
  // Text: notes, then outcome, duration and the person who did it (interactions have no owner field).
  const extra=[];
  if(cell.outcome)extra.push('Esito: '+cell.outcome);
  if(cell.duration){const n=minutes(cell.duration,seconds);extra.push('Durata: '+(Number.isNaN(n)?cell.duration:durationText(n)));if(Number.isNaN(n))warn('durata «'+cell.duration+'» non leggibile: riportata nel testo')}
  if(cell.owner)extra.push('Assegnata a: '+cell.owner);
  let body=[cell.body.trim(),extra.join(' · ')].filter(Boolean).join('\n\n');
  if(body.length>4000){body=body.slice(0,3999)+'…';warn('testo oltre 4000 caratteri: accorciato')}
  // Company, contact, opportunity
  const who=link(M,cell,ctx,warn);
  if(!who.company_id&&!who.contact_id&&!who.opportunity_id)errors.push(cell.company||cell.contact||cell.contact_email||cell.opportunity?'nessuna azienda, contatto o trattativa del CRM da collegare':'azienda e contatto mancanti');
  const data={title,kind,occurred_at:at,body};
  for(const k of ['company_id','contact_id','opportunity_id'])if(who[k])data[k]=who[k];
  out.data=data;
  out.view={at,timed,kind,title,link:who.label,body:body.length>140?body.slice(0,139)+'…':body};
  if(errors.length){out.status='error';problems.unshift(...errors.map(e=>e+': saltata'));return out}
  const k=keyOf(data);
  if(inCrm.has(k)){out.status='dup';problems.unshift('già nel CRM (stesso tipo, data e ora, oggetto e '+(who.contact_id?'contatto':who.company_id?'azienda':'trattativa')+'): saltata')}
  else if(inFile.has(k)){out.status='dup';problems.unshift('ripetuta nel file (come la riga '+inFile.get(k)+'): saltata')}
  else{inFile.set(k,out.line);out.status='create'}
  return out;
 });
 const counts={create:0,warn:0,dup:0,error:0};
 for(const r of rows){counts[r.status]++;if(r.status==='create'&&r.problems.length)counts.warn++}
 return {rows,columns:col,auto,headers,order,counts};
}

/* ---------- report ---------- */
/* results: {line: {ok:true} | {error:'message'}} of the rows sent. Rows never sent (stopped) are «non
   inviata». Returns {created,skipped:[{line,title,reason,raw}],byReason}. */
function report(p,results){
 const res=results||{},skipped=[];let created=0;
 for(const r of p.rows){
  if(r.status==='create'){const x=res[r.line];if(x&&x.ok){created++;continue}
   skipped.push({line:r.line,title:r.data.title,reason:x&&x.error?'errore del CRM: '+x.error:'non inviata: importazione interrotta',raw:r.raw});continue}
  skipped.push({line:r.line,title:r.data.title||'',reason:r.problems[0]||'',raw:r.raw});
 }
 const byReason={dup:p.counts.dup,error:p.counts.error,failed:skipped.filter(s=>/^errore del CRM/.test(s.reason)).length,stopped:skipped.filter(s=>/^non inviata/.test(s.reason)).length};
 return {created,skipped,byReason};
}
// CSV (semicolons, as the other CRM exports) of the skipped rows: line, reason, then the original columns.
function skippedCsv(rep,headers){
 const cols=[{label:'Riga',key:'line'},{label:'Motivo',key:'reason'},...(headers||[]).filter(Boolean).map(h=>({label:h,value:s=>s.raw?s.raw[h]:''}))];
 return csvCore().toCsv(rep.skipped,cols);
}
const api={ALIASES,FIELD_LABEL,KIND_LABEL,KINDS,columns,mapping,kindOf,kindFromTitle,dateOrder,occurredAt,clock,minutes,plan,report,skippedCsv,keyOf};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.RadixCrmImportStoricoCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
