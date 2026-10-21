'use strict';
/* CRM «Report», pure logic (the view is sales/crm-report.js): a report is a small JSON definition
   {v:1, entity, filters, date, group, measure, chart, sort} computed in the browser over the rows the
   list API returns. Nothing here reads the network or the DOM.
   - entity: opportunities · companies · contacts · tasks · tickets · leads (the entities /api/sales lists);
   - filters: the contact-segment filters of api/_sales.js SEGMENT_FILTERS that apply to the entity
     (role, industry, city: «contiene», case-insensitive; consent: yes/no; industry and city are the
     company's, as in the segment panel) plus «is one of» on any groupable field ('' = empty);
   - date: {field, from?, to?} or {field, last:N days}, compared as YYYY-MM-DD in Europe/Rome;
   - group: a field (stage, owner, industry, status…) or «month:<date field>»; empty values go to «(vuoto)»;
   - measure: count, or sum/avg of amount_cents (opportunities only).
   Saved definitions live in sales_segments.filters as {report:<definition>} (no new table): validate() is
   the rule api/_sales.js applies before saving. */
(function(root){
const A=root.RadixCrmAnalisi||(typeof require==='function'?require('./crm-analisi-core.js'):null);
const romeDay=A.romeDay;
const EMPTY='(vuoto)',MAX_ROWS=5000,MAX_JSON=1800;
const MN=['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
// Same types as SEGMENT_FILTERS in api/_sales.js, for the keys that make sense outside the contact list.
const SEGMENT={role:'text',industry:'text',city:'text',consent:['yes','no']};
const OUTCOME={open:'Aperta',won:'Vinta',lost:'Persa'};
const PRIORITY={urgent:'Urgente',high:'Alta',normal:'Normale',low:'Bassa'};
const TASK_STATUS={todo:'Da fare',doing:'In corso',done:'Fatta'};
const TICKET_STATUS={open:'Aperto',pending:'In attesa',resolved:'Risolto',closed:'Chiuso'};
const CHANNEL={email:'Email',phone:'Telefono',chat:'Chat',web:'Web',other:'Altro'};
const LEAD_STATUS={nuovo:'Nuovo',contattato:'Contattato',qualificato:'Qualificato',non_qualificato:'Non qualificato',convertito:'Convertito'};
const BOOL={yes:'Sì',no:'No'};
// Group types: text (free text, grouped case-insensitively), enum (fixed options, in that order), member,
// stage, process, company (ids resolved to names), bool, month (a date field).
const g=(label,type,field,options)=>Object.freeze({label,type,field,...(options?{options}:{})});
const ENTITIES=Object.freeze({
 opportunities:Object.freeze({label:'Opportunità',subject:'opportunities',amount:'amount_cents',title:'title',
  dates:{created_at:'Data di creazione',expected_close:'Chiusura prevista',closed_at:'Data di chiusura'},
  groups:{stage:g('Fase','stage','stage_id'),owner:g('Responsabile','member','owner_id'),outcome:g('Esito','enum','outcome',OUTCOME),process:g('Pipeline','process','process_id'),company:g('Azienda','company','company_id'),lost_reason:g('Motivo di perdita','text','lost_reason')},
  segment:['industry','city']}),
 companies:Object.freeze({label:'Aziende',subject:'companies',title:'name',
  dates:{created_at:'Data di creazione'},
  groups:{industry:g('Settore','text','industry'),city:g('Città','text','city'),division:g('Dipartimento','text','division'),account_type:g('Tipo','text','account_type'),rating:g('Valutazione','text','rating'),owner:g('Responsabile','member','owner_id')},
  segment:['industry','city']}),
 contacts:Object.freeze({label:'Contatti',subject:'contacts',title:'name',
  dates:{created_at:'Data di creazione'},
  groups:{role:g('Ruolo','text','role'),company:g('Azienda','company','company_id'),division:g('Dipartimento','text','division'),lead_source:g('Origine','text','lead_source'),owner:g('Responsabile','member','owner_id'),consent:g('Consenso marketing','bool','marketing_consent',BOOL)},
  segment:['role','industry','city','consent']}),
 tasks:Object.freeze({label:'Attività',title:'title',
  dates:{created_at:'Data di creazione',due_at:'Scadenza'},
  groups:{assignee:g('Responsabile','member','assignee_id'),status:g('Stato','enum','status',TASK_STATUS),priority:g('Priorità','enum','priority',PRIORITY),company:g('Azienda','company','company_id')},
  segment:['industry','city']}),
 tickets:Object.freeze({label:'Ticket',title:'title',
  dates:{created_at:'Data di apertura',due_at:'Scadenza',resolved_at:'Data di risoluzione'},
  groups:{status:g('Stato','enum','status',TICKET_STATUS),priority:g('Priorità','enum','priority',PRIORITY),channel:g('Canale','enum','channel',CHANNEL),assignee:g('Responsabile','member','assignee_id'),company:g('Azienda','company','company_id')},
  segment:['industry','city']}),
 leads:Object.freeze({label:'Lead',title:'title',
  dates:{created_at:'Data di creazione'},
  groups:{source:g('Fonte','text','source'),status:g('Stato','enum','status',LEAD_STATUS),owner:g('Responsabile','member','owner_id'),company:g('Azienda','company','company_id')},
  segment:['industry','city']})
});
const MEASURES={count:'Conteggio',sum:'Somma importo',avg:'Media importo'};
const CHARTS={bar:'Barre orizzontali',column:'Colonne',table:'Tabella'};
const SORTS={value:'Per valore',label:'Per etichetta'};
const SEGMENT_LABELS={role:'Ruolo contiene',industry:'Settore azienda contiene',city:'Città azienda contiene',consent:'Consenso marketing'};

const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const shortText=v=>typeof v==='string'&&v.length<=80&&!/[\u0000-\u001f\u007f]/.test(v);
const ISO=/^\d{4}-\d{2}-\d{2}$/;
const validDay=s=>typeof s==='string'&&ISO.test(s)&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
// The group spec for a key: a field of the entity, or month:<date field>.
function groupSpec(entity,key){const e=ENTITIES[entity];if(!e||typeof key!=='string')return null;
 if(key.startsWith('month:')){const f=key.slice(6);return Object.hasOwn(e.dates,f)?{label:'Mese ('+e.dates[f].toLowerCase()+')',type:'month',field:f}:null}
 return Object.hasOwn(e.groups,key)?e.groups[key]:null}
function groupOptions(entity){const e=ENTITIES[entity];if(!e)return [];return [...Object.entries(e.groups).map(([k,s])=>[k,s.label]),...Object.entries(e.dates).map(([f,l])=>['month:'+f,'Mese ('+l.toLowerCase()+')'])]}

// {ok:true,def} with the definition normalized (defaults filled in), or {ok:false,error} in Italian.
function validate(d){
 const no=error=>({ok:false,error});
 if(!object(d))return no('Definizione del report non valida.');
 if(Object.keys(d).some(k=>!['v','entity','filters','date','group','measure','chart','sort'].includes(k)))return no('Campo del report non consentito.');
 if(d.v!==undefined&&d.v!==1)return no('Versione del report non supportata.');
 const e=ENTITIES[d.entity];if(!Object.hasOwn(ENTITIES,d.entity||''))return no('Scegli un oggetto: Opportunità, Aziende, Contatti, Attività, Ticket o Lead.');
 if(!groupSpec(d.entity,d.group))return no('Raggruppamento non valido per '+e.label+'.');
 const measure=d.measure===undefined?'count':d.measure;if(!Object.hasOwn(MEASURES,measure))return no('Misura non valida.');
 if(measure!=='count'&&!e.amount)return no('Somma e media dell’importo valgono solo per le opportunità.');
 const chart=d.chart===undefined?'bar':d.chart;if(!Object.hasOwn(CHARTS,chart))return no('Grafico non valido.');
 const sort=d.sort===undefined?(d.group.startsWith('month:')?'label':'value'):d.sort;if(!Object.hasOwn(SORTS,sort))return no('Ordinamento non valido.');
 const filters=d.filters===undefined?{}:d.filters;if(!object(filters))return no('Filtri non validi.');
 for(const [k,v] of Object.entries(filters)){
  if(e.segment.includes(k)){const t=SEGMENT[k];if(t==='text'?!shortText(v)||!v.trim():!t.includes(v))return no('Filtro «'+SEGMENT_LABELS[k]+'» non valido.');continue}
  const s=Object.hasOwn(e.groups,k)?e.groups[k]:null;if(!s)return no('Filtro non consentito: '+k+'.');
  const list=Array.isArray(v)?v:[v];
  if(!list.length||list.length>20||!list.every(x=>typeof x==='string'&&x.length<=200&&!/[\u0000-\u001f\u007f]/.test(x)))return no('Filtro «'+s.label+'» non valido.');
  if(s.options&&!list.every(x=>x===''||Object.hasOwn(s.options,x)))return no('Valore non valido per «'+s.label+'».');}
 let date=d.date===undefined?null:d.date;
 if(object(date))date=Object.fromEntries(Object.entries(date).filter(([,x])=>x!==undefined));
 if(date!==null){
  if(!object(date)||Object.keys(date).some(k=>!['field','from','to','last'].includes(k))||!Object.hasOwn(e.dates,date.field||''))return no('Filtro data non valido.');
  if(date.last!==undefined){if(!Number.isInteger(date.last)||date.last<1||date.last>3650||date.from!==undefined||date.to!==undefined)return no('Ultimi giorni: un numero intero da 1 a 3650.');}
  else{if(date.from===undefined&&date.to===undefined)return no('Indica almeno una data nel filtro.');
   if((date.from!==undefined&&!validDay(date.from))||(date.to!==undefined&&!validDay(date.to)))return no('Data non valida: usa AAAA-MM-GG.');
   if(date.from&&date.to&&date.from>date.to)return no('Intervallo non valido: «Dal» deve venire prima di «Al».');}
  date={...date}}
 const def={v:1,entity:d.entity,filters:{...filters},date,group:d.group,measure,chart,sort};
 if(JSON.stringify(def).length>MAX_JSON)return no('Report troppo lungo da salvare: riduci i filtri.');
 return {ok:true,def};
}

const low=s=>String(s??'').trim().toLocaleLowerCase('it');
const pad=n=>String(n).padStart(2,'0');
const shift=(day,n)=>{const t=Date.UTC(+day.slice(0,4),+day.slice(5,7)-1,+day.slice(8,10))+n*864e5;return new Date(t).toISOString().slice(0,10)};
// The date window of a definition as {from,to} (YYYY-MM-DD, both included); «last N days» ends today.
function dateWindow(date,now){if(!date)return null;
 if(date.last){const today=romeDay(now??Date.now());return {from:shift(today,-(date.last-1)),to:today}}
 return {from:date.from||'',to:date.to||''}}
function monthLabel(m){return /^\d{4}-\d{2}$/.test(m)?MN[+m.slice(5,7)-1]+' '+m.slice(0,4):EMPTY}
// Lookups for the ids the rows carry: {stages, members, processes, companies}.
function lookups(data){const by=(l,f)=>new Map((l||[]).filter(Boolean).map(x=>[String(x.id),f(x)]));
 return {stages:by(data.stages,x=>x),members:by(data.members,x=>x.name||('Utente '+x.id)),processes:by(data.processes,x=>x.title||''),companies:by(data.companies,x=>x)}}
// One record's group {key,label}; empty values have key '' and label «(vuoto)».
function keyOf(r,spec,L){const v=r[spec.field];
 if(spec.type==='month'){const d=romeDay(v);return d?{key:d.slice(0,7),label:monthLabel(d.slice(0,7))}:{key:'',label:EMPTY}}
 if(spec.type==='bool'){if(v==null||v==='')return {key:'',label:EMPTY};const k=v===true||v==='true'?'yes':'no';return {key:k,label:BOOL[k]}}
 if(v==null||String(v).trim()==='')return {key:'',label:EMPTY};
 const k=String(v);
 if(spec.type==='enum')return {key:k,label:spec.options[k]||k};
 if(spec.type==='member')return {key:k,label:L.members.get(k)||'Utente '+k};
 if(spec.type==='stage'){const s=L.stages.get(k);return {key:k,label:s?.title||'Fase sconosciuta'}}
 if(spec.type==='process')return {key:k,label:L.processes.get(k)||'Pipeline sconosciuta'};
 if(spec.type==='company'){const c=L.companies.get(k);return {key:k,label:c?.name||'Azienda non caricata'}}
 return {key:low(v),label:String(v).trim()}}
// The rows that pass the filters and the date window.
function apply(def,rows,data,now){const e=ENTITIES[def.entity],L=lookups(data||{}),win=dateWindow(def.date,now);
 const company=r=>def.entity==='companies'?r:(r.company_id?L.companies.get(String(r.company_id))||null:null);
 return (rows||[]).filter(r=>{if(!r)return false;
  for(const [k,v] of Object.entries(def.filters||{})){
   if(e.segment.includes(k)){
    if(k==='consent'){if((v==='yes')!==(r.marketing_consent===true))return false;continue}
    const src=k==='role'?r.role:company(r)?.[k];if(!low(src).includes(low(v)))return false;continue}
   const key=keyOf(r,e.groups[k],L).key,want=(Array.isArray(v)?v:[v]).map(x=>e.groups[k].type==='text'?low(x):x);if(!want.includes(key))return false}
  if(win){const d=romeDay(r[def.date.field]);if(!d||(win.from&&d<win.from)||(win.to&&d>win.to))return false}
  return true})}
// The groups in the chosen order: by value (largest first, ties by label) or by label (the options'
// order for fixed lists, stage position for stages, calendar order for months; «(vuoto)» always last).
function sortGroups(groups,sort,spec,L){const coll=new Intl.Collator('it',{sensitivity:'base',numeric:true});
 const rank=x=>{if(spec.type==='enum'||spec.type==='bool'){const o=Object.keys(spec.options||BOOL);return o.indexOf(x.key)}if(spec.type==='stage'){const s=L&&L.stages.get(x.key);return s?Number(s.position)||0:1e9}return null};
 const byLabel=(a,b)=>{const ra=rank(a),rb=rank(b);if(ra!=null&&rb!=null&&ra!==rb)return ra-rb;return spec.type==='month'?(a.key<b.key?-1:a.key>b.key?1:0):coll.compare(a.label,b.label)};
 return [...groups].sort((a,b)=>{if((a.key==='')!==(b.key===''))return a.key===''?1:-1;
  if(sort==='value'){const va=a.value??-Infinity,vb=b.value??-Infinity;if(va!==vb)return vb-va}
  return byLabel(a,b)})}
const amountOf=(r,e)=>{if(!e.amount)return null;const v=r[e.amount];if(v==null||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null};
function measureOf(list,measure,e){if(measure==='count')return list.length;
 const xs=list.map(r=>amountOf(r,e)).filter(v=>v!=null),s=xs.reduce((a,b)=>a+b,0);
 return measure==='sum'?s:xs.length?Math.round(s/xs.length):null}
/* The report: {groups:[{key,label,count,value,share,ids}], total:{count,value}, rows, measure, spec}.
   data = {rows (the entity's records), stages, members, processes, companies, capped}. Month groups fill
   the months with nothing in between (up to 10 years) so a column chart shows the gaps. */
function run(input,data,now){const v=validate(input);if(!v.ok)throw Error(v.error);const def=v.def,e=ENTITIES[def.entity],spec=groupSpec(def.entity,def.group),L=lookups(data||{});
 const rows=apply(def,data?.rows,data,now),map=new Map();
 for(const r of rows){const k=keyOf(r,spec,L);let x=map.get(k.key);if(!x){x={key:k.key,label:k.label,rows:[]};map.set(k.key,x)}x.rows.push(r)}
 if(spec.type==='month'&&map.size>1){const ks=[...map.keys()].filter(Boolean).sort();if(ks.length>1){let [y,m]=ks[0].split('-').map(Number);const end=ks[ks.length-1];
  for(let i=0;i<120;i++){const k=y+'-'+pad(m);if(k>end)break;if(!map.has(k))map.set(k,{key:k,label:monthLabel(k),rows:[]});m++;if(m>12){m=1;y++}}}}
 const total={count:rows.length,value:measureOf(rows,def.measure,e)};
 const parts=[...map.values()].map(x=>({key:x.key,label:x.label,count:x.rows.length,value:measureOf(x.rows,def.measure,e),ids:x.rows.map(r=>r.id)}));
 const base=def.measure==='avg'?null:parts.reduce((a,x)=>a+(x.value||0),0);
 for(const x of parts)x.share=base?Math.round((x.value||0)/base*1000)/10:null;
 return {def,spec,measure:def.measure,groups:sortGroups(parts,def.sort,spec,L),total,rows,capped:!!data?.capped}}
// Records of one group (bar click), in the report's filter.
function recordsOf(result,key){const g=result.groups.find(x=>x.key===key);if(!g)return [];const ids=new Set(g.ids);return result.rows.filter(r=>ids.has(r.id))}
const euro=c=>c==null?'':(c/100).toFixed(2).replace('.',',');
// The summary table for «Esporta CSV» (RadixCrmCsv.toCsv(rows, columns)): one row per group plus «Totale».
function csvTable(result){const money=result.measure!=='count';
 const columns=[{label:result.spec.label,key:'label'},{label:'Record',key:'count'}];
 if(money)columns.push({label:MEASURES[result.measure]+' (€)',key:'value'});
 if(result.measure!=='avg')columns.push({label:'% del totale',key:'share'});
 const rows=result.groups.map(x=>({label:x.label,count:x.count,value:euro(x.value),share:x.share==null?'':String(x.share).replace('.',',')}));
 rows.push({label:'Totale',count:result.total.count,value:euro(result.total.value),share:result.groups.length?'100':''});
 return {columns,rows}}
// A plain description of the definition, for the page and the saved list.
function describe(def){const e=ENTITIES[def.entity],spec=groupSpec(def.entity,def.group);if(!e||!spec)return '';
 const parts=[(def.measure==='count'?'Numero di ':MEASURES[def.measure]+' di ')+e.label.toLowerCase()+' per '+spec.label.toLowerCase()];
 for(const [k,v] of Object.entries(def.filters||{})){if(e.segment.includes(k)){parts.push(k==='consent'?'consenso '+(v==='yes'?'sì':'no'):SEGMENT_LABELS[k].toLowerCase()+' «'+v+'»');continue}
  const s=e.groups[k];parts.push(s.label.toLowerCase()+': '+(Array.isArray(v)?v:[v]).map(x=>x===''?EMPTY:s.options?.[x]||x).join(' o '))}
 if(def.date)parts.push(e.dates[def.date.field].toLowerCase()+(def.date.last?' negli ultimi '+def.date.last+' giorni':(def.date.from?' dal '+def.date.from:'')+(def.date.to?' al '+def.date.to:'')));
 return parts.join(' · ')}
// Ready-made reports, shown above the saved ones.
const PRESETS=Object.freeze([
 {id:'pipeline-fase',name:'Pipeline per fase',def:{v:1,entity:'opportunities',filters:{outcome:'open'},date:null,group:'stage',measure:'sum',chart:'bar',sort:'label'}},
 {id:'vinte-mese',name:'Opportunità vinte per mese',def:{v:1,entity:'opportunities',filters:{outcome:'won'},date:{field:'closed_at',last:365},group:'month:closed_at',measure:'sum',chart:'column',sort:'label'}},
 {id:'attivita-responsabile',name:'Attività per responsabile (ultimi 30 giorni)',def:{v:1,entity:'tasks',filters:{},date:{field:'created_at',last:30},group:'assignee',measure:'count',chart:'bar',sort:'value'}},
 {id:'aziende-settore',name:'Aziende per settore',def:{v:1,entity:'companies',filters:{},date:null,group:'industry',measure:'count',chart:'bar',sort:'value'}},
 {id:'lead-fonte',name:'Lead per fonte',def:{v:1,entity:'leads',filters:{},date:null,group:'source',measure:'count',chart:'bar',sort:'value'}},
 {id:'ticket-priorita',name:'Ticket aperti per priorità',def:{v:1,entity:'tickets',filters:{status:['open','pending']},date:null,group:'priority',measure:'count',chart:'column',sort:'label'}}
]);
// A saved segment row that holds a report (sales_segments.filters = {report:def}).
const isReport=row=>!!row&&object(row.filters)&&object(row.filters.report);
// Which lookups an entity's report needs besides its own rows.
const needs=entity=>['stages','members','processes',...(entity==='companies'?[]:['companies'])];

const core={ENTITIES,MEASURES,CHARTS,SORTS,SEGMENT,SEGMENT_LABELS,PRESETS,EMPTY,MAX_ROWS,groupSpec,groupOptions,validate,dateWindow,monthLabel,apply,run,sortGroups,recordsOf,csvTable,describe,isReport,needs,euro};
if(typeof module!=='undefined'&&module.exports)module.exports=core;
root.RadixCrmReport=core;
})(typeof window!=='undefined'?window:globalThis);
