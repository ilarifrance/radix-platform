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

// ---- Results over time: the daily readings of a post (rx_post_stats rows), shown as its numbers 1, 3 and 7 days on ----
const AGES=Object.freeze([1,3,7,14,30]);
// rows [{content_id,fetched_at,published_at,metrics}] → {contentId:[{age,at,metrics}]}: per post the last reading taken at
// or after each age (in days from publication), so a late reading still counts for the age it reached.
function seriesByContent(rows){
 const by={};for(const r of rows||[]){const id=r&&r.content_id;if(!id||!r.metrics)continue;(by[id]=by[id]||[]).push(r)}
 const out={};
 for(const [id,list] of Object.entries(by)){const pub=Date.parse(list.find(r=>r.published_at)?.published_at||'');if(!Number.isFinite(pub))continue;
  const sorted=list.slice().sort((a,b)=>Date.parse(a.fetched_at)-Date.parse(b.fetched_at)),points=[];
  for(const age of AGES){const hit=sorted.filter(r=>Date.parse(r.fetched_at)-pub>=age*86400000-3*3600000)[0];if(hit)points.push({age,at:hit.fetched_at,metrics:{...emptyMetrics(),...hit.metrics}})}
  const last=sorted[sorted.length-1];out[id]={points,last:{at:last.fetched_at,metrics:{...emptyMetrics(),...last.metrics},engagementRate:fin(last.engagement_rate)?last.engagement_rate:null,link:last.link||null,postId:last.post_id||null,publishedAt:last.published_at||null}}}
 return out;
}
const trendText=points=>(points||[]).filter(p=>fin(p.metrics.impressions)).map(p=>p.age+'g '+p.metrics.impressions).join(' → ');

// ---- Levers: what each choice (time, day, format, length, opening, channel) did on the posts with numbers ----
const LEVERS=Object.freeze([['slot','Orario'],['day','Giorno'],['format','Formato'],['length','Lunghezza'],['hook','Apertura'],['channel','Canale']]);
const firstLine=copy=>(String(copy||'').split(/\n/).find(l=>l.trim())||'').trim();
function hookOf(line){const l=String(line||'').trim();if(!l)return '';if(/\?\s*$/.test(l))return 'domanda';if(/^(io |ho |quando |anni fa|ieri|la settimana|il mio |la mia |mi |nel \d{4})/i.test(l))return 'esperienza personale';if(/\d/.test(l))return 'numero';return 'affermazione'}
function lengthOf(copy){const n=String(copy||'').trim().length;return !n?'':n<600?'breve (sotto 600 caratteri)':n<=1300?'media (600-1300 caratteri)':'lunga (oltre 1300 caratteri)'}
const FORMAT_LABELS=Object.freeze({video:'video',carousel:'carosello',image:'immagine',text:'solo testo',email:'email'});
// kindOf: the page's mediaKind (lib/ped-views); without it the stored format decides.
function featuresOf(c,{kindOf}={}){
 if(!c)return {};const w=whenOf(c),h=w.time?+w.time.slice(0,2):null,s=h==null?null:SLOTS.find(x=>h>=x[0]&&h<x[1]);
 const k=kindOf?kindOf(c):(c.format||(c.photo||c.slides?'image':'text'));
 return {slot:s?s[2]:'',day:w.date?DAYS[new Date(w.date+'T12:00:00Z').getUTCDay()]:'',format:FORMAT_LABELS[k]||String(k||''),length:lengthOf(c.copy),hook:hookOf(firstLine(c.copy)),channel:String(c.channel||'')};
}
const avg=list=>{const v=list.filter(fin);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null};
function levers(state,opts={}){
 const r=results(state),byId=new Map(((state&&state.contents)||[]).map(c=>[c.id,c]));
 const rows=r.posts.map(p=>({p,f:featuresOf(byId.get(p.id),opts)}));
 const out={posts:rows.length,groups:{}};
 for(const [key] of LEVERS){const g={};rows.forEach(({p,f})=>{const k=f[key];if(k)(g[k]=g[k]||[]).push(p)});
  out.groups[key]=Object.entries(g).map(([label,list])=>{const imp=avg(list.map(p=>p.metrics.impressions)),int=avg(list.map(p=>p.interactions)),er=avg(list.map(p=>p.engagementRate));
   return {label,posts:list.length,impressions:imp==null?null:Math.round(imp),interactions:round(int),engagementRate:round(er,2)}}).sort((a,b)=>(b.engagementRate??-1)-(a.engagementRate??-1)||(b.impressions??-1)-(a.impressions??-1))}
 return out;
}

// ---- AI «Ottimizza i post in programma»: changes to upcoming posts, each tied to a number above ----
const FIELDS=Object.freeze(['orario','giorno','formato','apertura','testo']);
// The posts that can still change: dated today or later, with text, not email, not already out.
function upcoming(state,{today,kindOf,isOut}={}){
 return ((state&&state.contents)||[]).filter(c=>c&&c.date&&c.date>=today&&String(c.copy||'').trim()&&!(kindOf&&kindOf(c)==='email')&&!(isOut&&isOut(c)))
  .sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||''))).slice(0,12)
  .map((c,i)=>({n:i+1,id:c.id,title:c.title,date:c.date,time:c.time||'',channel:c.channel,status:c.status,own:!!(c.photo&&c.photo.source==='upload'),...featuresOf(c,{kindOf}),opening:firstLine(c.copy).slice(0,200),chars:String(c.copy||'').trim().length}));
}
function optimizePrompt(lv,r,list,{today}={}){
 const g=(key,label)=>{const rows=lv.groups[key]||[];return rows.length?label+':\n'+rows.map(x=>'- '+x.label+': '+x.posts+' post · impression medie '+n0(x.impressions)+' · interazioni medie '+n0(x.interactions)+' · engagement medio '+n0(x.engagementRate)+'%').join('\n'):''};
 return ['Sei il Social Media Manager e analista dei risultati. Leggi i numeri dei post pubblicati e decidi cosa cambiare nei post già in programma, per migliorare i risultati.',
  'Post con numeri: '+lv.posts+' · impression totali '+n0(r.totals.impressions)+' · engagement medio '+n0(r.totals.engagementRate)+'%',
  ...LEVERS.map(([k,l])=>g(k,l)),
  'Post in programma:\n'+list.map(p=>p.n+'. '+p.date+(p.time?' '+p.time:'')+' · '+p.channel+' · formato '+(p.format||'n.d.')+(p.own?' (immagini proprie: formato fisso)':'')+' · '+p.chars+' caratteri · apertura ('+(p.hook||'n.d.')+'): «'+p.opening+'»').join('\n'),
  'Regole:\n- n.d. = numero non disponibile, non è zero. Non inventare numeri: cita solo quelli scritti qui.\n- Un gruppo con 1 solo post non prova niente. Se i dati non bastano per una leva, non cambiarla e dillo nell’analisi.\n- Ogni modifica deve citare nel «perche» il dato che la giustifica.\n- campo «orario»: valore HH:MM. campo «giorno»: valore AAAA-MM-GG dal '+(today||'oggi')+' in poi. campo «formato»: valore «immagine» o «carosello» (non per i video). campo «apertura»: la nuova prima riga, al massimo 200 caratteri, prima persona, stessa voce, nessun fatto, numero, cliente o materiale nuovo. campo «testo»: un’indicazione per il copywriter su come riscrivere il post (non il testo).\n- Al massimo 8 modifiche, solo dove i numeri lo giustificano. Nessuna modifica è una risposta valida.',
  'Rispondi solo con JSON, senza testo prima o dopo: {"analisi":"2-4 frasi su cosa dicono i numeri, compresi i limiti dei dati","modifiche":[{"post":1,"campo":"orario","valore":"08:30","perche":"il dato che lo giustifica"}]}'
 ].filter(Boolean).join('\n\n');
}
function parseOptimizations(text,list,{today}={}){
 const t=String(text||'');let data=null;
 for(const s of [t,(/```(?:json)?\s*([\s\S]*?)```/i.exec(t)||[])[1],t.slice(t.indexOf('{'),t.lastIndexOf('}')+1)]){if(!s)continue;try{data=JSON.parse(s);break}catch(e){}}
 if(!data||typeof data!=='object')return {analysis:'',items:[],error:'Risposta non leggibile: riprova.'};
 const byN=new Map((list||[]).map(p=>[p.n,p])),items=[],seen=new Set();
 for(const m of Array.isArray(data.modifiche)?data.modifiche:[]){
  const p=byN.get(Number(m&&m.post)),field=String(m&&m.campo||'').toLowerCase().trim();let v=String(m&&m.valore==null?'':m.valore).trim();
  if(!p||!FIELDS.includes(field)||seen.has(p.id+'|'+field))continue;
  if(field==='orario'){const x=/^(\d{1,2})[:.](\d{2})$/.exec(v);if(!x||+x[1]>23||+x[2]>59)continue;v=x[1].padStart(2,'0')+':'+x[2];if(v===p.time)continue}
  if(field==='giorno'){if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(Date.parse(v+'T12:00:00Z'))||(today&&v<today)||v===p.date)continue}
  if(field==='formato'){v=v.toLowerCase();if(!['immagine','carosello'].includes(v)||p.own||p.format==='video'||p.format===v)continue}
  if(field==='apertura'){v=clip(v,200);if(!v||v===p.opening)continue}
  if(field==='testo'){v=clip(v,600);if(!v)continue}
  seen.add(p.id+'|'+field);items.push({id:p.id,n:p.n,title:p.title,field,value:v,why:clip(m.perche||m['perché']||m.why,400)});
  if(items.length>=8)break}
 return {analysis:clip(data.analisi||data.analysis,1200),items};
}
// The opening is the first non-empty line: the new one replaces it, the rest of the text stays as it is.
function withOpening(copy,opening){const lines=String(copy||'').split('\n'),i=lines.findIndex(l=>l.trim());if(i<0)return String(opening);lines[i]=String(opening);return lines.join('\n')}
return {METRICS,LABELS,num,engagementRate,interactionsOf,normalizeBufferPost,parseCsv,mapColumns,parseDate,importCsv,matchRows,statsFromRow,statsFromBuffer,mergeStats,results,sortPosts,nextStepsPrompt,parseNextSteps,channelSlug:slug,mondayOf,AGES,seriesByContent,trendText,LEVERS,featuresOf,hookOf,levers,upcoming,optimizePrompt,parseOptimizations,withOpening};
});
