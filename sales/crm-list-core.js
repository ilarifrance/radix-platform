'use strict';
/* List views for «Contatti» and «Aziende», as in Salesforce: one row per record with the fields the
   CRM really stores (api/_sales.js `fields`) plus values counted from the rows already loaded
   (interactions, opportunities, contacts). Fixed views, sort, search, column choice and selection.
   Pure logic, no DOM and no writes: sales/crm-list.js draws it, sales.js still does every change. */
(function(root){
const DAY=864e5;
const list=v=>Array.isArray(v)?v:[];
const ts=v=>{const n=Date.parse(v||'');return Number.isFinite(n)?n:null};
const text=v=>v==null?'':String(v).trim();
const fold=v=>text(v).normalize('NFD').replace(/[̀-ͯ]/g,'').toLocaleLowerCase('it');
const KINDS=['contacts','companies'];

/* Columns: id, label (short: narrower table header), sort key on the row, shown by default. «name» is always shown. `added`: a field
   of migration sales 011 (crm-fields-core.js), offered only when the archive has it.
   Defaults stay narrow enough for a 1280px screen without sideways scroll; the rest is in «Colonne». */
const COLUMNS=Object.freeze({
 contacts:Object.freeze([
  {id:'name',label:'Nome',fixed:true},{id:'company',label:'Azienda'},{id:'role',label:'Ruolo'},
  {id:'email',label:'Email'},{id:'phone',label:'Telefono',hidden:true},{id:'consent',label:'Consenso marketing',short:'Consenso'},
  {id:'score',label:'Punteggio',needsScore:true},{id:'lastAt',label:'Ultimo contatto',hidden:true},
  {id:'title',label:'Qualifica',hidden:true,added:true},{id:'department',label:'Reparto',hidden:true,added:true},
  {id:'mobile',label:'Cellulare',hidden:true,added:true},{id:'city',label:'Città',hidden:true,added:true},
  {id:'owner',label:'Responsabile',hidden:true,added:true},{id:'leadSource',label:'Origine',hidden:true,added:true},
  {id:'linkedin',label:'LinkedIn',hidden:true},{id:'createdAt',label:'Creato il',hidden:true}]),
 companies:Object.freeze([
  {id:'name',label:'Nome',fixed:true},{id:'accountType',label:'Tipo',added:true},{id:'industry',label:'Settore'},{id:'city',label:'Città'},
  {id:'phone',label:'Telefono',hidden:true},{id:'website',label:'Sito',hidden:true},{id:'contacts',label:'N. contatti',short:'Contatti'},
  {id:'openValue',label:'Opportunità aperte',short:'Opp. aperte'},{id:'lastAt',label:'Ultima attività'},
  {id:'vat',label:'P.IVA',hidden:true,added:true},{id:'legalName',label:'Ragione sociale',hidden:true,added:true},
  {id:'owner',label:'Responsabile',hidden:true,added:true},{id:'rating',label:'Valutazione',hidden:true,added:true},
  {id:'employees',label:'Dipendenti',hidden:true,added:true},{id:'revenue',label:'Fatturato',hidden:true,added:true},
  {id:'province',label:'Provincia',hidden:true,added:true},
  {id:'email',label:'Email',hidden:true},{id:'createdAt',label:'Creata il',hidden:true}])
});
/* Saved views: fixed filters over the loaded rows. «recent» = created in the last 30 days, newest first. */
const VIEWS=Object.freeze({
 contacts:Object.freeze([
  {id:'all',label:'Tutti i contatti'},{id:'recent',label:'Creati di recente',sort:{key:'createdAt',dir:'desc'}},
  {id:'consent',label:'Con consenso marketing'},{id:'no-email',label:'Senza email'}]),
 companies:Object.freeze([
  {id:'all',label:'Tutte le aziende'},{id:'open',label:'Con opportunità aperte',sort:{key:'openValue',dir:'desc'}},
  {id:'idle',label:'Senza attività da 30 giorni',sort:{key:'lastAt',dir:'asc'}}])
});
const RECENT_DAYS=30,IDLE_DAYS=30;
const SEARCH=Object.freeze({contacts:['name','company','role','email','phone','title','mobile','city'],companies:['name','industry','city','phone','website','email','legalName','vat']});
const TYPES={cliente:'Cliente',prospect:'Prospect',partner:'Partner',fornitore:'Fornitore',altro:'Altro'},RATINGS={calda:'Calda',tiepida:'Tiepida',fredda:'Fredda'};
const num=v=>v==null||v===''||!Number.isFinite(Number(v))?null:Number(v);

const isOpen=o=>!o.outcome||o.outcome==='open';
function latest(map,key,at){if(key==null||at==null)return;const old=map.get(key);if(!old||old.at<at.at)map.set(key,at)}

/* One row per record. data: {contacts, companies, interactions, opportunities, stages, members}; opts.score: RadixCrmScore.score.
   Rows without the 011 fields (older archive) just give empty values for those columns. */
function buildRows(kind,data,opts){
 const d=data||{},o=opts||{},now=o.now??Date.now();
 const members=new Map(list(d.members).map(m=>[String(m.id),text(m.name)]));const owner=id=>id==null?'':members.get(String(id))||'';
 const companies=list(d.companies),contacts=list(d.contacts),inter=list(d.interactions),opps=list(d.opportunities);
 if(kind==='contacts'){
  const byCompany=new Map(companies.map(c=>[c.id,c]));const last=new Map();
  for(const i of inter){const at=ts(i.occurred_at);if(at!=null&&at<=now+DAY)latest(last,i.contact_id,{at,kind:i.kind||''})}
  const scoreData={interactions:inter,opportunities:opps,stages:list(d.stages)};
  return contacts.map(c=>{const co=c.company_id?byCompany.get(c.company_id):null;const l=last.get(c.id);
   let score=null,band=null,explain='';if(typeof o.score==='function'){try{const s=o.score(c,scoreData,now);score=s.total;band=s.band;explain=typeof o.explain==='function'?o.explain(s):''}catch{score=null}}
   return {id:c.id,record:c,name:text(c.name)||'(senza nome)',company:co?text(co.name):'',companyId:c.company_id||null,companyRecord:co||null,
    role:text(c.role),email:text(c.email),phone:text(c.phone),linkedin:text(c.linkedin_url),title:text(c.title),department:text(c.department),mobile:text(c.mobile),city:text(c.city),owner:owner(c.owner_id),leadSource:text(c.lead_source),consent:!!c.marketing_consent,consentAt:c.consent_at||null,
    score,band,explain,lastAt:l?l.at:null,lastKind:l?l.kind:'',createdAt:ts(c.created_at)}});
 }
 if(kind==='companies'){
  const people=new Map(),contactCompany=new Map();for(const c of contacts){if(!c.company_id)continue;people.set(c.company_id,(people.get(c.company_id)||0)+1);contactCompany.set(c.id,c.company_id)}
  const open=new Map(),oppCompany=new Map();for(const x of opps){if(x.company_id)oppCompany.set(x.id,x.company_id);if(!x.company_id||!isOpen(x))continue;const v=open.get(x.company_id)||{count:0,value:0};v.count++;v.value+=Number(x.amount_cents)||0;open.set(x.company_id,v)}
  const last=new Map();
  for(const i of inter){const at=ts(i.occurred_at);if(at==null||at>now+DAY)continue;const ids=new Set([i.company_id,contactCompany.get(i.contact_id),oppCompany.get(i.opportunity_id)].filter(Boolean));for(const k of ids)latest(last,k,{at,kind:i.kind||''})}
  return companies.map(c=>{const v=open.get(c.id)||{count:0,value:0};const l=last.get(c.id);
   return {id:c.id,record:c,name:text(c.name)||'(senza nome)',industry:text(c.industry),city:text(c.city)||text(c.billing_city),
    accountType:TYPES[c.account_type]||text(c.account_type),legalName:text(c.legal_name),vat:text(c.vat_number),owner:owner(c.owner_id),rating:RATINGS[c.rating]||text(c.rating),
    employees:num(c.employees),revenue:num(c.annual_revenue_cents),province:text(c.billing_province),phone:text(c.phone),website:text(c.website),email:text(c.email),
    contacts:people.get(c.id)||0,openCount:v.count,openValue:v.value,lastAt:l?l.at:null,lastKind:l?l.kind:'',createdAt:ts(c.created_at)}});
 }
 return [];
}

function inView(kind,view,row,now){
 const n=now??Date.now();
 if(kind==='contacts'){
  if(view==='recent')return row.createdAt!=null&&n-row.createdAt<=RECENT_DAYS*DAY;
  if(view==='consent')return row.consent;
  if(view==='no-email')return !row.email;
  return true;
 }
 if(kind==='companies'){
  if(view==='open')return row.openCount>0;
  if(view==='idle')return row.lastAt==null||n-row.lastAt>IDLE_DAYS*DAY;
  return true;
 }
 return true;
}
function matches(kind,row,query){const q=fold(query);if(!q)return true;const keys=SEARCH[kind]||['name'];return q.split(/\s+/).every(w=>keys.some(k=>fold(row[k]).includes(w)))}

/* Sort: empty values always last; text in Italian order; ties by name. */
const collator=typeof Intl!=='undefined'?new Intl.Collator('it',{sensitivity:'base',numeric:true}):null;
const cmpText=(a,b)=>collator?collator.compare(a,b):a<b?-1:a>b?1:0;
function sortKey(kind,key,row){
 if(key==='consent')return row.consent?1:0;
 if(key==='openValue')return row.openCount?row.openValue:null;
 const v=row[key];return v===''||v==null?null:v;
}
function sortRows(kind,rows,sort){
 const s=sort||{},key=s.key||'name',dir=s.dir==='desc'?-1:1;
 return [...rows].sort((a,b)=>{const x=sortKey(kind,key,a),y=sortKey(kind,key,b);
  if(x==null&&y!=null)return 1;if(y==null&&x!=null)return -1;
  let c=0;if(x!=null&&y!=null)c=typeof x==='number'&&typeof y==='number'?x-y:cmpText(String(x),String(y));
  return c*dir||cmpText(a.name,b.name)||String(a.id).localeCompare(String(b.id))});
}
function apply(kind,rows,state,now){const s=state||{};return sortRows(kind,list(rows).filter(r=>inView(kind,s.view,r,now)&&matches(kind,r,s.query)),s.sort)}

/* Preferences saved per workspace (localStorage in the page): only known values survive. */
const storageKey=(workspace,kind)=>'radix-crm-list:'+String(workspace||'')+':'+kind;
// opts.score false: no score column; opts.added false: the archive has no 011 fields, so no such columns.
function columnsFor(kind,opts){return (COLUMNS[kind]||[]).filter(c=>!(c.needsScore&&opts&&opts.score===false)&&!(c.added&&opts&&opts.added===false))}
function defaults(kind){const cols=COLUMNS[kind]||[];return {view:'all',mode:'table',columns:cols.filter(c=>!c.hidden).map(c=>c.id),sort:{key:'name',dir:'asc'}}}
function normalize(kind,saved){
 const def=defaults(kind);if(!saved||typeof saved!=='object')return def;
 const cols=COLUMNS[kind]||[],ids=new Set(cols.map(c=>c.id)),views=(VIEWS[kind]||[]).map(v=>v.id);
 const out={...def};
 if(views.includes(saved.view))out.view=saved.view;
 if(saved.mode==='cards'||saved.mode==='table')out.mode=saved.mode;
 if(Array.isArray(saved.columns)){const chosen=cols.filter(c=>c.fixed||saved.columns.includes(c.id)).map(c=>c.id);if(chosen.length)out.columns=chosen}
 if(saved.sort&&ids.has(saved.sort.key))out.sort={key:saved.sort.key,dir:saved.sort.dir==='desc'?'desc':'asc'};
 return out;
}
function parse(kind,raw){try{return normalize(kind,raw?JSON.parse(raw):null)}catch{return defaults(kind)}}
/* Header click: same column flips the direction; a new column starts ascending (dates and numbers descending). */
const DESC_FIRST=new Set(['score','lastAt','createdAt','contacts','openValue','consent','employees','revenue']);
function nextSort(sort,key){if(sort&&sort.key===key)return {key,dir:sort.dir==='asc'?'desc':'asc'};return {key,dir:DESC_FIRST.has(key)?'desc':'asc'}}
function toggleColumn(kind,columns,id){const col=(COLUMNS[kind]||[]).find(c=>c.id===id);if(!col||col.fixed)return list(columns).slice();const set=new Set(list(columns));set.has(id)?set.delete(id):set.add(id);return (COLUMNS[kind]||[]).filter(c=>c.fixed||set.has(c.id)).map(c=>c.id)}

/* Selection: a Set of ids. «Seleziona tutti» works on the rows on screen. */
function selectionState(selected,visibleIds){const ids=list(visibleIds);if(!ids.length)return 'none';const n=ids.filter(id=>selected.has(id)).length;return n===0?'none':n===ids.length?'all':'some'}
function toggleAll(selected,visibleIds){const out=new Set(selected);const all=selectionState(selected,visibleIds)==='all';for(const id of list(visibleIds))all?out.delete(id):out.add(id);return out}
function prune(selected,allIds){const keep=new Set(list(allIds));return new Set([...selected].filter(id=>keep.has(id)))}
/* Contacts of the chosen companies (for «Seleziona i loro contatti»). */
function contactsOf(companyIds,contacts){const ids=new Set(list(companyIds));return list(contacts).filter(c=>c.company_id&&ids.has(c.company_id)).map(c=>c.id)}

/* Links: only http(s) sites, mailto for a plausible address, tel with digits. */
function websiteHref(v){let s=text(v);if(!s||/\s/.test(s))return null;if(!/^[a-z][a-z0-9+.-]*:/i.test(s))s='https://'+s.replace(/^\/+/,'');try{const u=new URL(s);return ['http:','https:'].includes(u.protocol)&&u.hostname.includes('.')?u.href:null}catch{return null}}
const mailHref=v=>/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(text(v))?'mailto:'+text(v):null;
const telHref=v=>{const s=text(v).replace(/[^\d+]/g,'');return s.replace(/\D/g,'').length>=5?'tel:'+s:null};

/* «oggi», «ieri», «12 g fa»; older than a year shows the date. */
function ago(at,now){if(at==null)return '';const n=Math.floor(((now??Date.now())-at)/DAY);if(n<=0)return 'oggi';if(n===1)return 'ieri';if(n<365)return n+' g fa';const d=new Date(at);return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear()}

const api={KINDS,COLUMNS,VIEWS,RECENT_DAYS,IDLE_DAYS,buildRows,inView,matches,sortRows,apply,storageKey,columnsFor,defaults,normalize,parse,nextSort,toggleColumn,selectionState,toggleAll,prune,contactsOf,websiteHref,mailHref,telHref,ago,fold};
if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixCrmList=api;
})(typeof globalThis!=='undefined'?globalThis:this);
