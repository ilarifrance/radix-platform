/* RADIX PED results — social numbers of published posts (from Buffer or a CSV export of Meta Business Suite /
   LinkedIn), KPIs, weekly totals and the AI «Prossimi passi» prompt. Pure functions shared by
   project-editorial.html, api/_buffer.js and the tests. A metric the network did not report stays null, never 0. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixPedResults=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const METRICS=Object.freeze(['impressions','reach','reactions','comments','shares','clicks']);
const LABELS=Object.freeze({date:'Data',link:'Link',title:'Titolo',channel:'Canale',impressions:'Impression',reach:'Copertura',reactions:'Reazioni',comments:'Commenti',shares:'Condivisioni',clicks:'Clic',engagementRate:'Engagement'});
const emptyMetrics=()=>Object.fromEntries(METRICS.map(k=>[k,null]));
const fin=v=>typeof v==='number'&&Number.isFinite(v);

// «1.234» and «1,234» are thousands, «12,5» and «12.5» decimals, «1.234,5» / «1,234.5» both; % and spaces dropped.
function num(v){
 if(fin(v))return v;if(v==null)return null;
 let s=String(v).replace(/[\s  %']/g,'').replace(/^\+/,'');
 if(!s||/^(-|—|n\/?a|nd|null|--)$/i.test(s))return null;
 const neg=/^-/.test(s);s=s.replace(/^-/,'');
 if(s.includes('.')&&s.includes(',')){const dec=s.lastIndexOf('.')>s.lastIndexOf(',')?'.':',';s=s.split(dec==='.'?',':'.').join('').replace(',','.')}
 else if(s.includes(',')){s=/^[1-9]\d{0,2}(,\d{3})+$/.test(s)?s.replace(/,/g,''):s.replace(',','.')}
 else if(/^[1-9]\d{0,2}(\.\d{3})+$/.test(s))s=s.replace(/\./g,'');
 if(!/^\d+(\.\d+)?$/.test(s))return null;
 const n=Number(s);return neg?-n:n;
}
const sumOrNull=list=>{const v=list.filter(fin);return v.length?v.reduce((a,b)=>a+b,0):null};
const round=(n,d=1)=>n==null?null:Math.round(n*10**d)/10**d;
const interactionsOf=m=>sumOrNull([m.reactions,m.comments,m.shares,m.clicks]);
// Interactions on reach (people) or, without reach, on impressions; percent with one decimal.
function engagementRate(m){if(!m)return null;const i=interactionsOf(m),base=fin(m.reach)&&m.reach>0?m.reach:fin(m.impressions)&&m.impressions>0?m.impressions:null;return i==null||!base?null:round(i*100/base,2)}

// Buffer GraphQL Post (developers.buffer.com/guides/post-metrics.html): metrics [{type,value,unit}], normalized types
// stable across networks. reposts count as shares; deprecated names map to their replacement; no clicks metric exists.
const BUFFER_TYPES=Object.freeze({impressions:'impressions',reach:'reach',reactions:'reactions',favorites:'reactions',comments:'comments',replies:'comments',shares:'shares',reposts:'shares',retweets:'shares',reblogs:'shares',clicks:'clicks',link_clicks:'clicks',linkClicks:'clicks'});
function normalizeBufferPost(p){
 if(!p||!p.id)return null;const metrics=emptyMetrics();let likes=null,rate=null;
 for(const x of Array.isArray(p.metrics)?p.metrics:[]){const t=String(x&&x.type||''),v=num(x&&x.value);if(v==null)continue;
  if(t==='engagementRate'){rate=v;continue}if(t==='likes'){likes=v;continue}
  const k=BUFFER_TYPES[t];if(k)metrics[k]=(metrics[k]||0)+v}
 if(metrics.reactions==null&&likes!=null)metrics.reactions=likes;
 return {postId:String(p.id),channel:String(p.channelService||'').toLowerCase()||null,channelId:p.channelId?String(p.channelId):null,publishedAt:p.sentAt||p.dueAt||null,link:/^https:\/\//.test(String(p.externalLink||''))?String(p.externalLink):null,metrics,engagementRate:rate,updatedAt:p.metricsUpdatedAt||null};
}

// ---- CSV import (Meta Business Suite, LinkedIn page analytics; Italian or English headers) ----
function parseCsv(text){
 const t=String(text||'').replace(/^﻿/,''),first=t.split(/\r?\n/).find(l=>l.trim())||'';
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
// Exact names only, in priority order: «Reactions, comments and shares» must not be read as reactions.
const HEADERS=Object.freeze({
 date:['publish time','ora di pubblicazione','data di pubblicazione','orario di pubblicazione','created date','data di creazione','date published','publish date','published','pubblicato','data','date'],
 link:['permalink','post link','link del post','link al post','url del post','post url','link','url'],
 title:['post title','titolo del post','title','titolo','description','descrizione','post','testo','caption','update'],
 channel:['channel','canale','network','social','piattaforma','platform'],
 impressions:['impressions','impression','impressioni','visualizzazioni','views','total impressions','impression totali'],
 reach:['reach','copertura','persone raggiunte','account raggiunti','accounts reached','post reach'],
 reactions:['reactions','reazioni','likes','like','mi piace'],
 comments:['comments','commenti'],
 shares:['shares','condivisioni','reposts','repost','diffusioni','ricondivisioni'],
 clicks:['total clicks','clic totali','clicks','clic','link clicks','clic sul link'],
 engagementRate:['engagement rate','tasso di engagement','tasso di interesse','tasso di coinvolgimento','engagement']
});
function mapColumns(headers){
 const keys=(headers||[]).map(headKey),map={};
 for(const [field,names] of Object.entries(HEADERS)){for(const n of names){const i=keys.indexOf(n);if(i>=0&&!Object.values(map).includes(i)){map[field]=i;break}}}
 return map;
}
const ITALIAN=/^(ora di pubblicazione|data di pubblicazione|orario di pubblicazione|data di creazione|data|pubblicato|copertura|reazioni|commenti|condivisioni|impressioni|clic|clic totali|titolo|titolo del post|link del post|mi piace|diffusioni|visualizzazioni|tasso di engagement|tasso di interesse)$/;
const italianHeaders=headers=>(headers||[]).map(headKey).some(k=>ITALIAN.test(k));
// Exports write dates as ISO, d/m/y (Italian) or m/d/y (US Meta export): an impossible day or month decides,
// otherwise the language of the headers does.
function parseDate(v,dayFirst){
 const s=String(v||'').trim();let m=/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?/.exec(s);
 if(m)return {date:m[1]+'-'+m[2]+'-'+m[3],time:m[4]?m[4].padStart(2,'0')+':'+m[5]:''};
 m=/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:,?\s+(\d{1,2})[:.](\d{2}))?(?:\s*([AaPp])\.?[Mm]\.?)?/.exec(s);if(!m)return null;
 let a=+m[1],b=+m[2],y=+m[3];if(y<100)y+=2000;let d,mo;
 if(a>12&&b<=12){d=a;mo=b}else if(b>12&&a<=12){d=b;mo=a}else if(dayFirst){d=a;mo=b}else{d=b;mo=a}
 if(mo<1||mo>12||d<1||d>31)return null;let h=m[4]==null?null:+m[4];
 if(h!=null&&m[6]){const pm=/p/i.test(m[6]);if(pm&&h<12)h+=12;if(!pm&&h===12)h=0}
 return {date:y+'-'+String(mo).padStart(2,'0')+'-'+String(d).padStart(2,'0'),time:h==null?'':String(h).padStart(2,'0')+':'+m[5]};
}
function channelFromLink(link){const s=String(link||'').toLowerCase();return /linkedin\./.test(s)?'linkedin':/instagram\./.test(s)?'instagram':/facebook\.|fb\.com/.test(s)?'facebook':/tiktok\./.test(s)?'tiktok':/youtu/.test(s)?'youtube':/(twitter|x)\.com/.test(s)?'x':''}
const slug=ch=>{const c=String(ch||'').trim().toLowerCase();for(const k of ['linkedin','instagram','facebook','tiktok','youtube','threads','pinterest'])if(c.includes(k))return k;if(c==='x'||c==='twitter'||c.startsWith('x ')||c.includes('twitter'))return 'x';return c.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')};
// The header row is the first of the first five with at least two known metric names (LinkedIn puts a note above).
function importCsv(text,{channel}={}){
 const rows=parseCsv(text);let h=-1,map={};
 for(let i=0;i<Math.min(5,rows.length);i++){const m=mapColumns(rows[i]);if(METRICS.filter(k=>k in m).length>=2){h=i;map=m;break}}
 if(h<0)return {mapping:{},headers:rows[0]||[],rows:[],skipped:rows.length,error:'Non trovo le colonne dei numeri (impression, copertura, reazioni, commenti…): esporta i dati dei post da Meta Business Suite o LinkedIn.'};
 const headers=rows[h],dayFirst=italianHeaders(headers),out=[];let skipped=0;
 for(const r of rows.slice(h+1)){
  const get=k=>k in map?String(r[map[k]]==null?'':r[map[k]]).trim():'';
  const metrics=emptyMetrics();METRICS.forEach(k=>{if(k in map)metrics[k]=num(get(k))});
  const d=parseDate(get('date'),dayFirst),link=/^https?:\/\//.test(get('link'))?get('link'):'',ch=slug(get('channel')||channelFromLink(link)||channel||'');
  if(!d&&!link||METRICS.every(k=>metrics[k]==null)){skipped++;continue}
  const rate=num(get('engagementRate'));
  out.push({date:d?d.date:'',time:d?d.time:'',link,title:get('title').slice(0,200),channel:ch,metrics,engagementRate:rate==null?null:rate<=1&&!/%/.test(get('engagementRate'))&&/^0?[.,]\d/.test(get('engagementRate'))?round(rate*100,2):rate});
 }
 return {mapping:Object.fromEntries(Object.entries(map).map(([k,i])=>[k,headers[i]])),headers,rows:out,skipped,dayFirst};
}
const words=t=>new Set(String(t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').split(/[^a-z0-9]+/).filter(w=>w.length>3));
const overlap=(a,b)=>{const x=words(a),y=words(b);let n=0;x.forEach(w=>{if(y.has(w))n++});return n};
// Each imported row goes to one PED content: same post link first, then same day and channel (title words and time
// decide between several); a content is used once.
function matchRows(contents,rows){
 const used=new Set(),list=(contents||[]).filter(Boolean);
 return (rows||[]).map(row=>{
  let hit=row.link?list.find(c=>!used.has(c.id)&&c.stats&&c.stats.link&&c.stats.link.replace(/\/$/,'')===row.link.replace(/\/$/,'')):null,how=hit?'link':'';
  if(!hit&&row.date){const same=list.filter(c=>!used.has(c.id)&&c.date===row.date&&(!row.channel||slug(c.channel)===row.channel));
   if(same.length===1)hit=same[0];else if(same.length>1)hit=same.map(c=>({c,s:overlap(c.title+' '+c.copy,row.title)*10+(row.time&&c.time===row.time?5:0)})).sort((a,b)=>b.s-a.s).filter(x=>x.s>0)[0]?.c||null;
   if(hit)how='data e canale'}
  if(hit)used.add(hit.id);return {row,contentId:hit?hit.id:null,how};
 });
}
const statsFromRow=(row,at)=>({source:'csv',link:row.link||null,publishedAt:row.date?row.date+'T'+(row.time||'12:00')+':00':null,metrics:{...emptyMetrics(),...row.metrics},engagementRate:row.engagementRate==null?null:row.engagementRate,importedAt:at});
const statsFromBuffer=(n,at)=>({source:'buffer',postId:n.postId,link:n.link,publishedAt:n.publishedAt,metrics:{...emptyMetrics(),...n.metrics},engagementRate:n.engagementRate==null?null:n.engagementRate,updatedAt:n.updatedAt||null,fetchedAt:at});
// Saving keeps a metric already known when the new source does not report it (Buffer has no clicks, a CSV may).
function mergeStats(prev,next){if(!prev||!prev.metrics)return next;const metrics={...next.metrics};METRICS.forEach(k=>{if(metrics[k]==null&&prev.metrics[k]!=null)metrics[k]=prev.metrics[k]});return {...prev,...next,link:next.link||prev.link||null,metrics}}

// ---- KPIs ----
const DAYS=Object.freeze(['domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato']);
const SLOTS=Object.freeze([[0,9,'notte e prima mattina (0-9)'],[9,12,'mattina (9-12)'],[12,15,'pranzo (12-15)'],[15,18,'pomeriggio (15-18)'],[18,24,'sera (18-24)']]);
const isoDay=ms=>new Date(ms).toISOString().slice(0,10);
const mondayOf=day=>{const t=Date.parse(day+'T12:00:00Z');return isoDay(t-((new Date(t).getUTCDay()+6)%7)*86400000)};
// The post's own day and time from the plan when there is one (they are in the plan's time zone).
function whenOf(c){const s=c.stats||{},iso=String(s.publishedAt||'');const date=c.date||iso.slice(0,10),time=c.time||(/T(\d{2}:\d{2})/.exec(iso)||[])[1]||'';return {date:/^\d{4}-\d{2}-\d{2}$/.test(date)?date:'',time}}
function results(state){
 const posts=((state&&state.contents)||[]).filter(c=>c&&c.stats&&c.stats.metrics).map(c=>{const m={...emptyMetrics(),...c.stats.metrics},w=whenOf(c),er=engagementRate(m);
  return {id:c.id,title:c.title,channel:c.channel,date:w.date,time:w.time,link:c.stats.link||null,source:c.stats.source,metrics:m,interactions:interactionsOf(m),engagementRate:er==null?(fin(c.stats.engagementRate)?c.stats.engagementRate:null):er}});
 // Engagement over the whole set: interactions on reach (or impressions) of the posts that have both.
 const totals=list=>{const t=Object.fromEntries(METRICS.map(k=>[k,sumOrNull(list.map(p=>p.metrics[k]))])),baseOf=p=>fin(p.metrics.reach)&&p.metrics.reach>0?p.metrics.reach:fin(p.metrics.impressions)&&p.metrics.impressions>0?p.metrics.impressions:null;
  const both=list.filter(p=>p.interactions!=null&&baseOf(p)),inter=sumOrNull(list.map(p=>p.interactions)),base=both.reduce((a,p)=>a+baseOf(p),0);
  return {...t,posts:list.length,interactions:inter,engagementRate:both.length?round(both.reduce((a,p)=>a+p.interactions,0)*100/base,2):null}};
 const byChannel=[...new Set(posts.map(p=>p.channel))].map(ch=>({channel:ch,...totals(posts.filter(p=>p.channel===ch))})).sort((a,b)=>(b.impressions||0)-(a.impressions||0));
 const dated=posts.filter(p=>p.date),weeksMap={};dated.forEach(p=>{const k=mondayOf(p.date);(weeksMap[k]=weeksMap[k]||[]).push(p)});
 const keys=Object.keys(weeksMap).sort(),weeks=[];
 if(keys.length){let k=keys[0];const last=keys[keys.length-1];while(k<=last&&weeks.length<52){weeks.push({start:k,...totals(weeksMap[k]||[])});k=isoDay(Date.parse(k+'T12:00:00Z')+7*86400000)}}
 const ranked=posts.filter(p=>p.engagementRate!=null).sort((a,b)=>b.engagementRate-a.engagementRate||(b.interactions||0)-(a.interactions||0));
 const best=ranked[0]||posts.slice().sort((a,b)=>(b.interactions||0)-(a.interactions||0)||(b.metrics.impressions||0)-(a.metrics.impressions||0))[0]||null;
 const slots={};dated.filter(p=>p.engagementRate!=null).forEach(p=>{const d=DAYS[new Date(p.date+'T12:00:00Z').getUTCDay()],h=p.time?+p.time.slice(0,2):null,s=h==null?null:SLOTS.find(x=>h>=x[0]&&h<x[1]);const k=d+(s?' · '+s[2]:'');(slots[k]=slots[k]||[]).push(p.engagementRate)});
 const slot=Object.entries(slots).map(([label,v])=>({label,posts:v.length,engagementRate:round(v.reduce((a,b)=>a+b,0)/v.length,2)})).sort((a,b)=>b.engagementRate-a.engagementRate||b.posts-a.posts)[0]||null;
 // Up to 12 weeks in a row with the empty ones; a longer span keeps only the last 12 weeks that have posts.
 return {posts,totals:totals(posts),byChannel,weeks:weeks.length<=12?weeks:weeks.filter(w=>w.posts).slice(-12),best,bestSlot:slot};
}
function sortPosts(posts,key,dir){const d=dir==='asc'?1:-1,val=p=>key==='title'||key==='channel'?String(p[key]||'').toLowerCase():key==='date'?(p.date||'')+(p.time||''):key==='engagementRate'||key==='interactions'?p[key]:p.metrics[key];
 return posts.slice().sort((a,b)=>{const x=val(a),y=val(b);if(x==null&&y==null)return 0;if(x==null)return 1;if(y==null)return -1;return (x>y?1:x<y?-1:0)*d})}

// ---- AI «Prossimi passi»: only aggregated numbers and post titles leave the page ----
const n0=v=>v==null?'n.d.':String(v);
function nextStepsPrompt(r){
 const t=r.totals,top=r.posts.filter(p=>p.engagementRate!=null).sort((a,b)=>b.engagementRate-a.engagementRate),low=top.slice().reverse();
 const line=p=>'«'+String(p.title||'').slice(0,120)+'» · '+p.channel+' · '+(p.date||'')+(p.time?' '+p.time:'')+' · impression '+n0(p.metrics.impressions)+' · interazioni '+n0(p.interactions)+' · engagement '+n0(p.engagementRate)+'%';
 return ['Sei il Social Media Manager. Leggi i risultati dei post pubblicati e proponi cosa pubblicare dopo.',
  'Totale: '+t.posts+' post · impression '+n0(t.impressions)+' · copertura '+n0(t.reach)+' · reazioni '+n0(t.reactions)+' · commenti '+n0(t.comments)+' · condivisioni '+n0(t.shares)+' · clic '+n0(t.clicks)+' · engagement medio '+n0(t.engagementRate)+'%',
  'Per canale:\n'+r.byChannel.map(c=>'- '+c.channel+': '+c.posts+' post, impression '+n0(c.impressions)+', interazioni '+n0(c.interactions)+', engagement '+n0(c.engagementRate)+'%').join('\n'),
  r.weeks.length?'Per settimana (lunedì · impression · interazioni):\n'+r.weeks.map(w=>'- '+w.start+' · '+n0(w.impressions)+' · '+n0(w.interactions)).join('\n'):'',
  r.bestSlot?'Giorno e fascia migliori: '+r.bestSlot.label+' (engagement medio '+r.bestSlot.engagementRate+'% su '+r.bestSlot.posts+' post)':'',
  top.length?'Post migliori:\n'+top.slice(0,5).map(line).join('\n'):'',low.length>5?'Post più deboli:\n'+low.slice(0,3).map(line).join('\n'):'',
  'n.d. = il social non ha dato quel numero: non trattarlo come zero. Non inventare numeri che non sono qui.',
  'Proponi esattamente 3 azioni concrete per le prossime settimane (tema o formato, canale, giorno e fascia), ognuna motivata dai numeri sopra.',
  'Rispondi solo con JSON, senza testo prima o dopo: {"azioni":[{"titolo":"titolo del prossimo contenuto","canale":"canale","perche":"il dato che lo giustifica","come":"formato, giorno, orario e call to action"}]}'
 ].filter(Boolean).join('\n\n');
}
const clip=(s,n)=>String(s==null?'':s).replace(/\s+/g,' ').trim().slice(0,n);
function parseNextSteps(text){
 const t=String(text||'');let data=null;
 const tries=[t,(/```(?:json)?\s*([\s\S]*?)```/i.exec(t)||[])[1],t.slice(t.indexOf('{'),t.lastIndexOf('}')+1),t.slice(t.indexOf('['),t.lastIndexOf(']')+1)];
 for(const s of tries){if(!s)continue;try{data=JSON.parse(s);break}catch(e){}}
 let list=Array.isArray(data)?data:data&&(data.azioni||data.actions||data.passi);
 if(Array.isArray(list)){list=list.map(a=>typeof a==='string'?{titolo:a}:a||{}).map(a=>({titolo:clip(a.titolo||a.title||a.azione,160),canale:clip(a.canale||a.channel,60),perche:clip(a.perche||a['perché']||a.why,600),come:clip(a.come||a.how,600)})).filter(a=>a.titolo)}
 else{// Not JSON: numbered or bulleted lines, title before the first «:» or « — ».
  list=t.split(/\n/).map(l=>/^\s*(?:\d+[.)]|[-*•])\s+(.+)/.exec(l)).filter(Boolean).map(m=>{const s=m[1].replace(/\*\*/g,''),p=s.split(/:\s+|\s+[—–-]\s+/);return {titolo:clip(p[0],160),canale:'',perche:clip(p.slice(1).join(': '),600),come:''}}).filter(a=>a.titolo)}
 return list.slice(0,3);
}
return {METRICS,LABELS,num,engagementRate,interactionsOf,normalizeBufferPost,parseCsv,mapColumns,parseDate,importCsv,matchRows,statsFromRow,statsFromBuffer,mergeStats,results,sortPosts,nextStepsPrompt,parseNextSteps,channelSlug:slug,mondayOf};
});
