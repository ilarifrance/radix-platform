/* RADIX Risultati SEO — the numbers of a Google Search Console «Prestazioni» export (the .zip with Query.csv, Pagine.csv,
   Paesi.csv, Dispositivi.csv, Date.csv/Grafico.csv, or the single CSVs; Italian or English headers) and, optionally, a
   GA4 landing-page CSV. Pure functions for lib/seo-results.js and the tests: parse, normalise numbers, KPIs, period
   comparison between two imports, the opportunity lists, brand and non-brand split, the compact storage in the
   project's «agents» document (next to the seo-geo thread) and the AI «Prossimi passi» prompt with its grounded reading.
   A number the export did not have stays null, never 0. No network here. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixSeoResultsCore=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const AGENT='seo-geo',MAX_IMPORTS=6,MAX_ADVICE_ACTIONS=5;
// Rows kept per import (by impressions): enough for the lists, small enough for the shared document.
const CAPS=Object.freeze({queries:300,pages:300,countries:30,devices:6,dates:500,landing:100});
const KINDS=Object.freeze(['queries','pages','countries','devices','dates','landing']);
const KIND_LABELS=Object.freeze({queries:'Query',pages:'Pagine',countries:'Paesi',devices:'Dispositivi',dates:'Date',landing:'Pagine di destinazione (GA4)'});
const fin=v=>typeof v==='number'&&Number.isFinite(v);
const round=(n,d=1)=>n==null||!fin(n)?null:Math.round(n*10**d)/10**d;

// «1.234» and «1,234» are thousands, «12,5» and «12.5» decimals, «1.234,5» / «1,234.5» both; % and spaces dropped.
function num(v){
 if(fin(v))return v;if(v==null)return null;
 let s=String(v).replace(/[\s  %'’]/g,'').replace(/^\+/,'');
 if(!s||/^(-|—|n\/?a|nd|null|--)$/i.test(s))return null;
 const neg=/^-/.test(s);s=s.replace(/^-/,'');
 if(s.includes('.')&&s.includes(',')){const dec=s.lastIndexOf('.')>s.lastIndexOf(',')?'.':',';s=s.split(dec==='.'?',':'.').join('').replace(',','.')}
 else if(s.includes(',')){s=/^[1-9]\d{0,2}(,\d{3})+$/.test(s)?s.replace(/,/g,''):s.replace(',','.')}
 else if(/^[1-9]\d{0,2}(\.\d{3})+$/.test(s))s=s.replace(/\./g,'');
 if(!/^\d+(\.\d+)?$/.test(s))return null;
 const n=Number(s);return neg?-n:n;
}
// Tab, semicolon or comma separated (the most frequent in the first line), quotes, BOM; GA4 «#» comment lines dropped.
function parseCsv(text){
 const t=String(text||'').replace(/^﻿/,'').split(/\r?\n/).filter(l=>!/^\s*#/.test(l)).join('\n'),first=t.split('\n').find(l=>l.trim())||'';
 const count=c=>{let n=0,q=false;for(const ch of first){if(ch==='"')q=!q;else if(ch===c&&!q)n++}return n};
 const sep=['\t',';',','].reduce((a,b)=>count(b)>count(a)?b:a,',');
 const rows=[];let row=[],cell='',q=false;
 for(let i=0;i<t.length;i++){const ch=t[i];
  if(q){if(ch==='"'){if(t[i+1]==='"'){cell+='"';i++}else q=false}else cell+=ch;continue}
  if(ch==='"')q=true;else if(ch===sep){row.push(cell);cell=''}else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&t[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell=''}else cell+=ch}
 if(cell||row.length){row.push(cell);rows.push(row)}
 return rows.filter(r=>r.some(c=>String(c).trim()));
}
const headKey=h=>String(h||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\([^)]*\)/g,' ').replace(/[^a-z0-9%]+/g,' ').trim();
// The dimension column decides what the table is; exact header names only, Italian and English.
const DIMENSIONS=Object.freeze({
 queries:['query principali','top queries','query','queries','query di ricerca','search query'],
 pages:['pagine principali','top pages','pagina','pagine','page','pages','url'],
 countries:['paese','paesi','country','countries'],
 devices:['dispositivo','dispositivi','device','devices'],
 dates:['data','date','giorno','day','date data'],
 landing:['pagina di destinazione','pagina di destinazione stringa di query','landing page','landing page query string','pagina di destinazione e stringa di query']
});
const METRIC_HEADERS=Object.freeze({
 clicks:['clic','clicks','click'],
 impressions:['impressioni','impressions','impression'],
 ctr:['ctr'],
 position:['posizione','position','posizione media','average position','pos media'],
 sessions:['sessioni','sessions'],
 users:['utenti attivi','active users','utenti','users','utenti totali','total users'],
 keyEvents:['eventi chiave','key events','conversioni','conversions']
});
function findColumn(keys,names,taken){for(const n of names){const i=keys.indexOf(n);if(i>=0&&!taken.includes(i))return i}return -1}
// File name hints (the zip names its CSVs): «Grafico.csv» / «Chart.csv» are the daily dates.
function kindFromName(name){const n=headKey(String(name||'').replace(/^.*[\\/]/,'').replace(/\.csv$/i,''));
 if(/^(query|queries)$/.test(n))return 'queries';if(/^(pagine|pages)$/.test(n))return 'pages';if(/^(paesi|countries)$/.test(n))return 'countries';
 if(/^(dispositivi|devices)$/.test(n))return 'devices';if(/^(date|dates|grafico|chart)$/.test(n))return 'dates';return ''}
// d/m/y (Italian exports), y-m-d (Search Console) or m/d/y when the day says so.
function isoDate(v){const s=String(v||'').trim();let m=/^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
 if(m)return m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');
 m=/^(\d{4})(\d{2})(\d{2})$/.exec(s);if(m)return m[1]+'-'+m[2]+'-'+m[3];
 m=/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);if(!m)return '';
 let a=+m[1],b=+m[2],y=+m[3];if(y<100)y+=2000;const [d,mo]=b>12&&a<=12?[b,a]:[a,b];
 if(mo<1||mo>12||d<1||d>31)return '';return y+'-'+String(mo).padStart(2,'0')+'-'+String(d).padStart(2,'0')}
// One CSV → {kind, rows:[{key, clicks, impressions, ctr, position}] or GA4 rows {key, sessions, users, keyEvents}}.
// The header row is the first of the first eight rows with a dimension and at least one metric (GA4 puts notes above).
function readTable(text,{name}={}){
 const rows=parseCsv(text),hint=kindFromName(name);let h=-1,kind='',dim=-1,cols={};
 for(let i=0;i<Math.min(8,rows.length)&&h<0;i++){const keys=rows[i].map(headKey);
  const order=hint?[hint,...KINDS.filter(k=>k!==hint)]:KINDS;
  for(const k of order){const d=findColumn(keys,DIMENSIONS[k],[]);if(d<0)continue;const c={};
   for(const [m,names] of Object.entries(METRIC_HEADERS)){const j=findColumn(keys,names,[d,...Object.values(c)]);if(j>=0)c[m]=j}
   const ok=k==='landing'?'sessions' in c||'users' in c:'clicks' in c||'impressions' in c;
   if(ok){h=i;kind=k;dim=d;cols=c;break}}}
 if(h<0)return {kind:'',rows:[],skipped:rows.length,error:'Non trovo le colonne di Search Console (Query principali o Pagine, Clic, Impressioni, CTR, Posizione).'};
 const out=[];let skipped=0;
 for(const r of rows.slice(h+1)){const get=m=>m in cols?num(r[cols[m]]):null,raw=String(r[dim]==null?'':r[dim]).trim();
  const key=kind==='dates'?isoDate(raw):raw.slice(0,300);if(!key){skipped++;continue}
  if(kind==='landing'){const x={key,sessions:get('sessions'),users:get('users'),keyEvents:get('keyEvents')};if(x.sessions==null&&x.users==null){skipped++;continue}out.push(x);continue}
  const clicks=get('clicks'),impressions=get('impressions'),position=get('position');let ctr=get('ctr');
  if(clicks==null&&impressions==null){skipped++;continue}
  // CTR from the counts when both are there (exact); else the column, «0,034» without % read as a share.
  if(fin(clicks)&&fin(impressions)&&impressions>0)ctr=round(clicks*100/impressions,2);
  else if(ctr!=null&&'ctr' in cols&&!/%/.test(r[cols.ctr])&&ctr<1&&/^0?[.,]/.test(String(r[cols.ctr]).trim()))ctr=round(ctr*100,2);
  out.push({key,clicks,impressions,ctr,position:position==null?null:round(position,1)})}
 return {kind,rows:out,skipped};
}
// Biggest first, then capped (dates keep their order).
const byImpressions=(a,b)=>(b.impressions||0)-(a.impressions||0)||(b.clicks||0)-(a.clicks||0);
function capRows(kind,rows){if(kind==='dates')return rows.slice().sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0).slice(-CAPS.dates);
 if(kind==='landing')return rows.slice().sort((a,b)=>(b.sessions||0)-(a.sessions||0)).slice(0,CAPS.landing);
 return rows.slice().sort(byImpressions).slice(0,CAPS[kind])}
const IGNORED=/^(filtri|filters|aspetto nella ricerca|search appearance)\.csv$/i;
// files: [{name, text}] (the CSVs of the zip, or picked one by one) → one import with its date range.
function importFiles(files,{at,id}={}){
 const imp={id:id||'',at:at||new Date().toISOString(),range:null,files:[],warnings:[]};KINDS.forEach(k=>{imp[k]=[]});
 for(const f of files||[]){const name=String(f&&f.name||'').replace(/^.*[\\/]/,'');if(!/\.(csv|tsv|txt)$/i.test(name)||/^\./.test(name)||/__MACOSX/.test(f.name||''))continue;
  if(IGNORED.test(name))continue;
  const t=readTable(f.text,{name});
  if(!t.kind){imp.warnings.push(name+': '+t.error);continue}
  if(imp[t.kind].length){imp.warnings.push(name+': '+KIND_LABELS[t.kind]+' già importate da un altro file, ignorato.');continue}
  imp[t.kind]=capRows(t.kind,t.rows);imp.files.push(name);if(t.skipped)imp.warnings.push(name+': '+t.skipped+' righe senza numeri saltate.')}
 if(!imp.queries.length&&!imp.pages.length&&!imp.dates.length&&!imp.landing.length)throw Error('Nessun dato leggibile: carica lo .zip esportato da Search Console (Prestazioni → Esporta → Scarica CSV) o i file Query, Pagine e Date.');
 if(imp.dates.length)imp.range={from:imp.dates[0].key,to:imp.dates[imp.dates.length-1].key};
 if(!imp.id)imp.id='gsc-'+(imp.range?imp.range.from+'_'+imp.range.to:imp.at.replace(/[^0-9]/g,'').slice(0,14));
 return imp;
}
// The zip as bytes → the import. zip is RadixZip (lib/zip-lite.js), opts go to its unzipAsync.
async function importZip(bytes,zip,opts={}){if(!zip||typeof zip.unzipAsync!=='function')throw Error('Lettore .zip non caricato: ricarica la pagina.');
 const dec=new TextDecoder('utf-8'),files=(await zip.unzipAsync(bytes,opts)).map(f=>({name:f.name,text:dec.decode(f.data)}));
 return importFiles(files,opts)}

// ---- KPIs ----
const sum=(rows,k)=>{const v=rows.map(r=>r[k]).filter(fin);return v.length?v.reduce((a,b)=>a+b,0):null};
// Average position weighted by impressions, as Search Console computes it.
function weightedPosition(rows){let w=0,s=0;for(const r of rows)if(fin(r.position)&&fin(r.impressions)&&r.impressions>0){w+=r.impressions;s+=r.position*r.impressions}return w?round(s/w,1):null}
// Totals from the daily table when there is one (the query table hides anonymous queries), else pages, else queries.
function kpis(imp){if(!imp)return null;const src=imp.dates&&imp.dates.length?'dates':imp.pages&&imp.pages.length?'pages':imp.queries&&imp.queries.length?'queries':'';
 if(!src)return {clicks:null,impressions:null,ctr:null,position:null,source:'',days:0};
 const rows=imp[src],clicks=sum(rows,'clicks'),impressions=sum(rows,'impressions');
 return {clicks,impressions,ctr:fin(clicks)&&impressions>0?round(clicks*100/impressions,2):null,position:weightedPosition(rows),source:src,days:imp.dates?imp.dates.length:0}}
const delta=(a,b)=>!fin(a)||!fin(b)?null:{abs:round(a-b,2),pct:b?round((a-b)*100/b,1):null};
// Current against the previous import: clicks, impressions, CTR and position (lower position is better).
function compare(cur,prev){const a=kpis(cur),b=kpis(prev);if(!a||!b)return null;
 return {clicks:delta(a.clicks,b.clicks),impressions:delta(a.impressions,b.impressions),ctr:delta(a.ctr,b.ctr),position:delta(a.position,b.position),previous:prev.range||null}}

// ---- brand terms ----
const fold=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const STOP=new Set(['srl','spa','snc','sas','studio','the','di','del','della','e','and','group','italia','italy','www','http','https','com','it']);
// The project name, the site's name (domain without www and extension) and the terms the person wrote.
function brandTerms(profile,extra){const p=profile||{},out=[];
 const add=t=>{const f=fold(t);if(f.length>=3&&!STOP.has(f)&&!out.includes(f))out.push(f)};
 add(p.name);const link=(String(p.links||'').match(/https?:\/\/[^\s,;)<>"']+/i)||[''])[0].replace(/[.]+$/,'');
 if(link){try{const host=new URL(link).hostname.replace(/^www\./,'').split('.');if(host.length>1)add(host.slice(0,-1).join(' ').replace(/-/g,' '))}catch(e){}}
 (Array.isArray(extra)?extra:String(extra||'').split(/[,;\n]/)).forEach(add);
 return out.slice(0,12)}
// A query is «brand» when it contains a term, also written without spaces («doccapital» for «doc capital»).
function isBrand(query,terms){const q=' '+fold(query)+' ',joined=q.replace(/ /g,'');
 return (terms||[]).some(t=>{const f=fold(t);return f&&(q.includes(' '+f+' ')||f.length>=5&&joined.includes(f.replace(/ /g,'')))})}
function brandSplit(imp,terms){const qs=(imp&&imp.queries)||[];if(!qs.length||!(terms||[]).length)return null;
 const b=qs.filter(r=>isBrand(r.key,terms)),n=qs.filter(r=>!isBrand(r.key,terms)),part=rows=>({queries:rows.length,clicks:sum(rows,'clicks')||0,impressions:sum(rows,'impressions')||0});
 const brand=part(b),other=part(n),tot=brand.clicks+other.clicks;
 return {terms:terms.slice(),brand,nonBrand:other,brandShare:tot?round(brand.clicks*100/tot,1):null}}

// ---- opportunities ----
// Rows worth reading: impressions at least the larger of 10 and the median of the table.
function minImpressions(rows){const v=rows.map(r=>r.impressions).filter(fin).sort((a,b)=>a-b);if(!v.length)return Infinity;return Math.max(10,v[Math.floor((v.length-1)/2)])}
function opportunities(cur,prev,{brand,limit=10}={}){const qs=(cur&&cur.queries)||[],ps=(cur&&cur.pages)||[],k=kpis(cur)||{};
 const terms=brand||[],nb=r=>!terms.length||!isBrand(r.key,terms);
 // a un passo dalla prima pagina: position 4-20 with many impressions, brand queries left out (they already win).
 const qMin=minImpressions(qs);
 const nearFirstPage=qs.filter(r=>fin(r.position)&&r.position>=4&&r.position<=20&&(r.impressions||0)>=qMin&&nb(r)).sort(byImpressions).slice(0,limit)
  .map(r=>({...r,type:'query',note:r.position<=10?'prima pagina, sotto i primi 3':'seconda pagina, a un passo dalla prima'}));
 // title/meta to rewrite: many impressions, in the first two pages, CTR under half the site's.
 const base=ps.length?ps:qs,type=ps.length?'pagina':'query',bMin=minImpressions(base),site=fin(k.ctr)?k.ctr:null;
 const lowCtr=site==null?[]:base.filter(r=>fin(r.ctr)&&(r.impressions||0)>=bMin&&(!fin(r.position)||r.position<=20)&&r.ctr<site*0.5&&(type==='pagina'||nb(r))).sort(byImpressions).slice(0,limit)
  .map(r=>({...r,type,siteCtr:site}));
 // pages losing clicks between the two imports (a page gone from the export counts as 0).
 let losingPages=[];
 if(prev&&prev.pages&&prev.pages.length&&ps.length){const now=new Map(ps.map(r=>[r.key,r]));
  losingPages=prev.pages.filter(p=>fin(p.clicks)&&p.clicks>=5).map(p=>{const c=now.get(p.key),cc=c&&fin(c.clicks)?c.clicks:0;return {key:p.key,type:'pagina',clicks:cc,previousClicks:p.clicks,change:cc-p.clicks,changePct:round((cc-p.clicks)*100/p.clicks,1),impressions:c?c.impressions:0,position:c?c.position:null,previousPosition:p.position}})
   .filter(x=>x.change<0&&(x.changePct<=-20||x.change<=-20)).sort((a,b)=>a.change-b.change).slice(0,limit)}
 return {nearFirstPage,lowCtr,losingPages}}

// Everything the panel shows for the import picked and the one before it.
function analyse(store,{importId,brand}={}){const list=sortedImports(store);if(!list.length)return null;
 let i=importId?list.findIndex(x=>x.id===importId):list.length-1;if(i<0)i=list.length-1;
 const cur=list[i],prev=i>0?list[i-1]:null,terms=brand||((store&&store.brandTerms)||[]);
 return {current:cur,previous:prev,kpis:kpis(cur),previousKpis:prev?kpis(prev):null,comparison:prev?compare(cur,prev):null,brand:brandSplit(cur,terms),opportunities:opportunities(cur,prev,{brand:terms}),
  topQueries:(cur.queries||[]).slice().sort((a,b)=>(b.clicks||0)-(a.clicks||0)).slice(0,10),devices:cur.devices||[],countries:(cur.countries||[]).slice(0,5),landing:(cur.landing||[]).slice(0,10)}}

// ---- storage in the «agents» document (key seoResults, beside the seo-geo thread of the Studio SEO e GEO) ----
const pack=(kind,rows)=>(rows||[]).map(r=>kind==='landing'?[r.key,r.sessions,r.users,r.keyEvents]:[r.key,r.clicks,r.impressions,r.position]);
const unpack=(kind,rows)=>(Array.isArray(rows)?rows:[]).filter(Array.isArray).map(a=>kind==='landing'?{key:String(a[0]),sessions:a[1]??null,users:a[2]??null,keyEvents:a[3]??null}
 :{key:String(a[0]),clicks:a[1]??null,impressions:a[2]??null,ctr:fin(a[1])&&fin(a[2])&&a[2]>0?round(a[1]*100/a[2],2):null,position:a[3]??null});
function packImport(imp){const o={id:imp.id,at:imp.at,range:imp.range||null,files:(imp.files||[]).slice(0,12),by:imp.by||''};KINDS.forEach(k=>{if(imp[k]&&imp[k].length)o[k]=pack(k,imp[k])});return o}
function unpackImport(o){const imp={id:String(o.id||''),at:o.at||'',range:o.range||null,files:o.files||[],by:o.by||'',warnings:[]};KINDS.forEach(k=>{imp[k]=unpack(k,o[k])});return imp}
const endOf=x=>(x.range&&x.range.to)||String(x.at||'').slice(0,10);
function sortedImports(store){return ((store&&store.imports)||[]).filter(x=>x&&typeof x==='object').map(unpackImport)
 .sort((a,b)=>endOf(a)<endOf(b)?-1:endOf(a)>endOf(b)?1:String(a.at)<String(b.at)?-1:1)}
const emptyStore=()=>({schemaVersion:1,imports:[],brandTerms:[],advice:null});
function readStore(doc){const s=doc&&doc.seoResults;if(!s||typeof s!=='object')return emptyStore();
 return {schemaVersion:1,imports:Array.isArray(s.imports)?s.imports:[],brandTerms:Array.isArray(s.brandTerms)?s.brandTerms.map(String):[],advice:s.advice&&typeof s.advice==='object'?s.advice:null}}
// A new import replaces one with the same period; only the last MAX_IMPORTS periods are kept.
function addImport(store,imp){const s={...emptyStore(),...store},packed=packImport(imp);
 const rest=(s.imports||[]).filter(x=>x&&x.id!==packed.id&&!(packed.range&&x.range&&x.range.from===packed.range.from&&x.range.to===packed.range.to));
 const all=rest.concat([packed]).sort((a,b)=>endOf(a)<endOf(b)?-1:endOf(a)>endOf(b)?1:String(a.at)<String(b.at)?-1:1).slice(-MAX_IMPORTS);
 return {...s,imports:all}}
function removeImport(store,id){const s={...emptyStore(),...store};return {...s,imports:(s.imports||[]).filter(x=>x.id!==id),advice:s.advice&&s.advice.importId===id?null:s.advice}}
// Load, change and save the document; on a conflict reload and apply the change again (like the Studio SEO e GEO).
async function updateStore(ws,projectId,change){if(!ws||typeof ws.bind!=='function')throw Error('Archivio del progetto non disponibile.');
 const doc=ws.bind(projectId,'agents');
 for(let i=0;i<3;i++){const cur=(await doc.load())||{},next=change(readStore(cur));
  try{await doc.save({...cur,schemaVersion:1,conversations:cur.conversations||{},seoResults:next});return next}catch(e){if(!(ws.ConflictError&&e instanceof ws.ConflictError)||i===2)throw e}}}
// The plan chosen in the Studio SEO e GEO: the last «Piano SEO e GEO» document saved in the seo-geo thread.
function savedPlan(doc,max=3000){const msgs=((doc&&doc.conversations)||{})[AGENT]||[];
 for(let i=msgs.length-1;i>=0;i--){const m=msgs[i],c=String(m&&m.content||''),x=/---DOCUMENTO:\s*(Piano SEO[^\n]*?)---\n([\s\S]*?)\n---FINE DOCUMENTO---/.exec(c);if(m&&m.role==='assistant'&&x)return {title:x[1].trim(),text:x[2].slice(0,max)}}
 return null}

// ---- AI «Prossimi passi»: only the computed numbers and the saved plan leave the page ----
const n0=v=>v==null?'n.d.':String(v);
const signed=d=>!d?'n.d.':(d.abs>0?'+':'')+d.abs+(d.pct==null?'':' ('+(d.pct>0?'+':'')+d.pct+'%)');
const qline=r=>'«'+r.key+'» · clic '+n0(r.clicks)+' · impressioni '+n0(r.impressions)+' · CTR '+n0(r.ctr)+'% · posizione '+n0(r.position);
function nextStepsPrompt(a,{plan}={}){if(!a||!a.kpis)throw Error('Importa prima i dati di Search Console.');
 const k=a.kpis,c=a.comparison,o=a.opportunities,r=a.current.range,lines=[];
 lines.push('Sei lo Specialista SEO e GEO. Leggi i risultati di Google Search Console e proponi i prossimi passi.');
 lines.push('Periodo: '+(r?r.from+' → '+r.to:'non indicato')+'. Totale: clic '+n0(k.clicks)+' · impressioni '+n0(k.impressions)+' · CTR '+n0(k.ctr)+'% · posizione media '+n0(k.position)+'.');
 if(c)lines.push('Rispetto al periodo precedente'+(c.previous?' ('+c.previous.from+' → '+c.previous.to+')':'')+': clic '+signed(c.clicks)+' · impressioni '+signed(c.impressions)+' · CTR '+signed(c.ctr)+' punti · posizione '+signed(c.position)+' (posizione più bassa = meglio).');
 if(a.brand)lines.push('Brand e non brand (termini: '+a.brand.terms.join(', ')+'): brand '+a.brand.brand.clicks+' clic su '+a.brand.brand.impressions+' impressioni; non brand '+a.brand.nonBrand.clicks+' clic su '+a.brand.nonBrand.impressions+' impressioni; quota brand dei clic '+n0(a.brand.brandShare)+'%.');
 if(a.topQueries.length)lines.push('Query con più clic:\n'+a.topQueries.slice(0,8).map(x=>'- '+qline(x)).join('\n'));
 if(o.nearFirstPage.length)lines.push('Query a un passo dalla prima pagina (posizione 4-20, molte impressioni):\n'+o.nearFirstPage.map(x=>'- '+qline(x)).join('\n'));
 if(o.lowCtr.length)lines.push((o.lowCtr[0].type==='pagina'?'Pagine':'Query')+' con molte impressioni e CTR basso (CTR medio del sito '+n0(o.lowCtr[0].siteCtr)+'%): titolo e meta description da riscrivere:\n'+o.lowCtr.map(x=>'- '+qline(x)).join('\n'));
 if(o.losingPages.length)lines.push('Pagine che perdono clic rispetto al periodo precedente:\n'+o.losingPages.map(x=>'- «'+x.key+'» · clic '+x.previousClicks+' → '+x.clicks+' ('+x.changePct+'%) · posizione '+n0(x.previousPosition)+' → '+n0(x.position)).join('\n'));
 if(a.landing&&a.landing.length)lines.push('Pagine di destinazione da Google Analytics 4 (sessioni · utenti · eventi chiave):\n'+a.landing.slice(0,8).map(x=>'- «'+x.key+'» · '+n0(x.sessions)+' · '+n0(x.users)+' · '+n0(x.keyEvents)).join('\n'));
 lines.push(plan&&plan.text?'Il piano SEO e GEO già scelto per il progetto («'+plan.title+'»):\n'+plan.text:'Nessun piano SEO e GEO salvato nel progetto.');
 lines.push('n.d. = dato non presente nell’export: non trattarlo come zero. Non inventare numeri, volumi di ricerca, query o pagine che non sono qui sopra.');
 lines.push('Proponi esattamente '+MAX_ADVICE_ACTIONS+' azioni in ordine di priorità. Ogni azione riguarda UNA query o UNA pagina copiata esattamente dall’elenco sopra e cita la metrica che la giustifica (clic, impressioni, CTR o posizione con il numero). Poi indica cosa misurare al prossimo import per capire se le azioni hanno funzionato.');
 lines.push('Italiano semplice, frasi brevi, niente emoji.');
 lines.push('Rispondi solo con JSON, senza testo prima o dopo: {"azioni":[{"titolo":"cosa fare, in breve","tipo":"query|pagina","oggetto":"la query o la pagina esatta","metrica":"il numero che lo giustifica","come":"i passi concreti"}],"da_misurare":["cosa controllare al prossimo export"]}');
 return lines.join('\n\n')}
const clip=(s,n)=>String(s==null?'':s).replace(/\s+/g,' ').trim().slice(0,n);
const normKey=s=>String(s||'').trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?/,'').replace(/\/+$/,'').replace(/\s+/g,' ');
// The queries and pages the AI may cite: the import picked, plus the previous one (for pages losing clicks).
function knownTargets(a){const q=new Set(),p=new Set();if(!a)return {q,p};
 for(const imp of [a.current,a.previous])if(imp){(imp.queries||[]).forEach(r=>q.add(normKey(r.key)));(imp.pages||[]).forEach(r=>p.add(normKey(r.key)));(imp.landing||[]).forEach(r=>p.add(normKey(r.key)))}
 return {q,p}}
// The reply → up to 5 actions. Grounding: an action is dropped when its query or page is not in the data, or when it
// quotes an address that is not among the pages. Returns {actions, measure, dropped}.
function parseAdvice(text,a){
 const t=String(text||'');let data=null;
 const tries=[t,(/```(?:json)?\s*([\s\S]*?)```/i.exec(t)||[])[1],t.slice(t.indexOf('{'),t.lastIndexOf('}')+1)];
 for(const s of tries){if(!s)continue;try{data=JSON.parse(s);break}catch(e){}}
 const list=Array.isArray(data)?data:data&&(data.azioni||data.actions||data.passi)||[],{q,p}=knownTargets(a);let dropped=0;
 const actions=[];
 for(const x of Array.isArray(list)?list:[]){if(!x||typeof x!=='object')continue;
  const it={titolo:clip(x.titolo||x.title||x.azione,160),tipo:/pag|page|url/i.test(String(x.tipo||x.type||''))?'pagina':'query',oggetto:clip(x.oggetto||x.target||x.query||x.pagina||x.page,300),metrica:clip(x.metrica||x.metric||x.perche||x['perché']||x.why,300),come:clip(x.come||x.how,600)};
  if(!it.titolo||!it.oggetto){dropped++;continue}
  const key=normKey(it.oggetto),found=it.tipo==='pagina'?p.has(key):q.has(key)||p.has(key);
  if(found&&!q.has(key)&&p.has(key))it.tipo='pagina';
  const urls=(it.titolo+' '+it.metrica+' '+it.come).match(/https?:\/\/[^\s«»"')]+/gi)||[];
  if(!found||urls.some(u=>!p.has(normKey(u.replace(/[.,;:]+$/,''))))){dropped++;continue}
  if(actions.length<MAX_ADVICE_ACTIONS)actions.push(it)}
 const m=data&&!Array.isArray(data)?data.da_misurare||data.misurare||data.measure||data.next_measure||[]:[];
 const measure=(Array.isArray(m)?m:String(m).split(/\n|;/)).map(s=>clip(typeof s==='string'?s:s&&(s.testo||s.text||s.metrica)||'',240)).filter(Boolean).slice(0,5);
 return {actions,measure,dropped}}
// Same numbers and same plan → same key: the cached advice is shown instead of a new call.
function adviceKey(a,plan){const s=JSON.stringify([a&&a.current&&a.current.id,a&&a.previous&&a.previous.id,a&&a.brand&&a.brand.terms,plan&&plan.text||'']);
 let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(36)}

// Day labels for the chart and the tiles.
const MONTHS=['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
const shortDate=iso=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso||''));return m?(+m[3])+' '+MONTHS[+m[2]-1]+(m[1]?' '+m[1].slice(2):''):String(iso||'')};
const fmt=(v,d=0)=>v==null?'n.d.':Number(v).toLocaleString('it-IT',{maximumFractionDigits:d,minimumFractionDigits:0});
return Object.freeze({AGENT,MAX_IMPORTS,CAPS,KINDS,KIND_LABELS,num,parseCsv,readTable,isoDate,kindFromName,importFiles,importZip,kpis,compare,weightedPosition,
 brandTerms,isBrand,brandSplit,opportunities,analyse,packImport,unpackImport,sortedImports,readStore,addImport,removeImport,updateStore,savedPlan,
 nextStepsPrompt,parseAdvice,adviceKey,shortDate,fmt});
});
