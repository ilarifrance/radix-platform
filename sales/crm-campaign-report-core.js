'use strict';
/* «Report campagna»: pure computation of per-campaign metrics from data the CRM already stores
   (api/_sales_clicks.js campaignData). No new tables: what the data cannot say is reported as such.
   - Invio: an «email» interaction titled «Email: …» on a contact (crm-campaigns.js records one per email sent
     or marked as sent). It belongs to a campaign through the k= parameter of its tracked links (exact name used
     by the click log); a send without tracked links is grouped by identical title when 2+ contacts got it.
     Inviate = distinct contacts; a contact sent twice counts once, at the first send.
   - Clic: rows of sales_email_clicks for the campaign. Unici = distinct contacts; tasso di clic = recipients who
     clicked / inviate (null when nothing was sent).
   - Disiscritti dopo l'invio: the unsubscribe link stamps the contact notes with «Disiscrizione dalle email
     commerciali tramite link: DD/MM/YYYY HH:MM» (Europe/Rome). Each stamp goes to the latest campaign the contact
     received at or before that minute. Recipients now without consent and with no such stamp are counted apart.
   - Conversione entro N giorni: first of these after the contact's send and within N calendar days (Europe/Rome
     wall clock, DST-aware): a «meeting» or «call» interaction on the contact, an «email» interaction on the
     contact whose title starts with «Re:», «R:» or «Risposta:» (a logged reply), a new opportunity
     (created_at) on the contact or on the contact's company. Each recipient counts once.
   Aperture, CTOR, consegnate e bounce: not measurable with what is stored (see NOT_MEASURED). */
(function(root){
const TZ='Europe/Rome',DAY=864e5,WINDOWS=Object.freeze([7,14,30]),DEFAULT_DAYS=14;
const SEND_PREFIX='Email: ';
const REPLY=/^\s*(re|r|risposta)\s*:/i;
const STAMP=/Disiscrizione dalle email commerciali tramite link: (\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/g;
const NOT_MEASURED=Object.freeze({
 opens:'Aperture: non ancora misurate. Servono un pixel di tracciamento nelle email e una tabella per registrarle: non ci sono ancora.',
 ctor:'CTOR (clic su aperture): non calcolabile finché le aperture non sono misurate.',
 delivered:'Consegnate e bounce: non disponibili. Il CRM registra solo gli invii riusciti; i rimbalzi tornano nella casella Gmail del mittente e non arrivano al CRM.',
 repeatOpens:'Aperture ripetute: non misurate (vedi aperture). Sono indicati i clic ripetuti.',
 readTime:'Tempo di lettura e inoltri: non misurabili in modo affidabile via email.'
});
const CONVERSION_LABEL=Object.freeze({reply:'Risposta',meeting:'Incontro',call:'Telefonata',opportunity:'Trattativa'});
const CONVERSION_NOTE='Conta come conversione il primo di questi eventi dopo l’invio ed entro N giorni (ora italiana): un incontro o una telefonata registrati sul contatto; una email registrata sul contatto con oggetto che inizia con «Re:», «R:» o «Risposta:»; una nuova trattativa sul contatto o sulla sua azienda. Ogni destinatario conta una volta; lo stesso evento può valere per più campagne ricevute dal contatto.';

const ms=v=>{if(v instanceof Date)return v.getTime();if(typeof v==='number')return Number.isFinite(v)?v:NaN;if(typeof v!=='string'||!v)return NaN;return Date.parse(v)};
// Europe/Rome wall clock of an instant: [y,m,d,h,mi,s].
let fmt=null;
function romeParts(t){
 fmt=fmt||new Intl.DateTimeFormat('en-GB',{timeZone:TZ,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
 const p={};for(const x of fmt.formatToParts(new Date(t)))p[x.type]=Number(x.value);
 return [p.year,p.month,p.day,p.hour===24?0:p.hour,p.minute,p.second];
}
// Minutes Rome is ahead of UTC at instant t (60 in winter, 120 in summer).
function romeOffset(t){const [y,m,d,h,mi,s]=romeParts(t);return Math.round((Date.UTC(y,m-1,d,h,mi,s)-Math.floor(t/1000)*1000)/6e4)}
// Instant of a Europe/Rome wall-clock time (a skipped spring-forward time lands one hour later).
function romeToUtc(y,m,d,h,mi,s){
 const wall=Date.UTC(y,m-1,d,h||0,mi||0,s||0);let t=wall-romeOffset(wall)*6e4;
 t=wall-romeOffset(t)*6e4;return t;
}
// Same Rome wall-clock time n calendar days later.
function addRomeDays(t,n){const [y,m,d,h,mi,s]=romeParts(t);return romeToUtc(y,m,d+n,h,mi,s)+(t%1000+1000)%1000}
// The unsubscribe stamps of a contact (array of 'DD/MM/YYYY HH:MM' or notes text) → instants (start of the minute).
function unsubscribeTimes(v){
 const list=Array.isArray(v)?v:typeof v==='string'?[v]:[];const out=[];
 for(const s of list){if(typeof s!=='string')continue;
  const re=Array.isArray(v)?/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/:new RegExp(STAMP.source,'g');
  if(Array.isArray(v)){const m=re.exec(s.trim());if(m)push(m)}else{let m;while((m=re.exec(s)))push(m)}}
 function push(m){const [d,mo,y,h,mi]=m.slice(1).map(Number);if(mo<1||mo>12||d<1||d>31||h>23||mi>59)return;const t=romeToUtc(y,mo,d,h,mi,0);if(Number.isFinite(t))out.push(t)}
 return out.sort((a,b)=>a-b);
}
const rate=(num,den)=>Number.isFinite(den)&&den>0&&Number.isFinite(num)?num/den:null;
function formatRate(r){if(r===null||r===undefined||!Number.isFinite(r))return '—';const p=r*100;return (p===0||p>=10||Number.isInteger(p)?String(Math.round(p)):p.toFixed(1).replace('.',','))+'%'}
function formatRome(t,withTime){if(!Number.isFinite(ms(t)))return '—';const [y,m,d,h,mi]=romeParts(ms(t));const p=n=>String(n).padStart(2,'0');return p(d)+'/'+p(m)+'/'+y+(withTime===false?'':' '+p(h)+':'+p(mi))}
// Campaign name carried by the tracked links of a send (k= is encodeURIComponent of the click-log name).
function decodeK(k){if(typeof k!=='string'||!k)return null;try{const s=decodeURIComponent(k).trim();return s&&s.length<=80?s:null}catch{return null}}
const isReply=title=>typeof title==='string'&&REPLY.test(title);
const isSend=s=>!!s&&typeof s.title==='string'&&s.title.startsWith(SEND_PREFIX)&&!!s.contact_id&&Number.isFinite(ms(s.occurred_at));
function normDays(n){n=Number(n);return WINDOWS.includes(n)?n:DEFAULT_DAYS}

/* data: {sends,clicks,contacts,followups,opportunities}; opts: {days,now}. */
function buildReport(data,opts){
 const d=data||{},o=opts||{},days=normDays(o.days),now=Number.isFinite(ms(o.now))?ms(o.now):Date.now();
 const contacts=new Map();for(const c of d.contacts||[])if(c&&c.id)contacts.set(c.id,c);
 const groups=new Map();
 const group=(key,name,tracked)=>{let g=groups.get(key);if(!g){g={key,name,tracked,recipients:new Map(),records:0,clicks:[]};groups.set(key,g)}return g};
 // Sends: tracked ones by campaign name, the others by identical title.
 const loose=new Map();
 for(const s of d.sends||[]){
  if(!isSend(s))continue;const t=ms(s.occurred_at),name=decodeK(s.k);
  let g;if(name)g=group('k:'+name,name,true);else{const title=s.title.slice(SEND_PREFIX.length).trim()||s.title;if(!loose.has(title))loose.set(title,[]);loose.get(title).push(s);continue}
  add(g,s.contact_id,t);
 }
 for(const [title,list] of loose){if(new Set(list.map(s=>s.contact_id)).size<2)continue;const g=group('t:'+title,title,false);for(const s of list)add(g,s.contact_id,ms(s.occurred_at))}
 function add(g,id,t){g.records++;const prev=g.recipients.get(id);if(prev===undefined||t<prev)g.recipients.set(id,t)}
 for(const k of d.clicks||[]){if(!k||!k.contact_id||typeof k.campaign!=='string'||!Number.isFinite(ms(k.clicked_at)))continue;const name=k.campaign.trim();if(!name)continue;group('k:'+name,name,true).clicks.push({contact_id:k.contact_id,url:String(k.url||''),at:ms(k.clicked_at)})}
 // Every send of a contact, for unsubscribe attribution (latest send at or before the stamp minute).
 const sendsOf=new Map();
 for(const g of groups.values())for(const [id,t] of g.recipients){if(!sendsOf.has(id))sendsOf.set(id,[]);sendsOf.get(id).push({key:g.key,t})}
 const unsubOf=new Map();
 for(const [id,list] of sendsOf){const c=contacts.get(id);if(!c)continue;
  for(const u of unsubscribeTimes(c.unsubscribed!==undefined?c.unsubscribed:c.notes)){
   let best=null;for(const s of list)if(Math.floor(s.t/6e4)*6e4<=u&&(!best||s.t>best.t))best=s;
   if(best){const k=id+'\n'+best.key;if(!unsubOf.has(k))unsubOf.set(k,u)}}}
 // Conversion signals per contact and per company.
 const byContact=new Map(),byCompany=new Map();
 const push=(m,k,v)=>{if(!k)return;if(!m.has(k))m.set(k,[]);m.get(k).push(v)};
 for(const f of d.followups||[]){if(!f||!f.contact_id)continue;const t=ms(f.occurred_at);if(!Number.isFinite(t))continue;
  const type=f.kind==='meeting'?'meeting':f.kind==='call'?'call':f.kind==='email'&&isReply(f.title)?'reply':null;if(!type)continue;
  push(byContact,f.contact_id,{type,at:t,id:f.id||null,title:f.title||'',entity:'interactions'})}
 for(const op of d.opportunities||[]){if(!op)continue;const t=ms(op.created_at);if(!Number.isFinite(t))continue;const v={type:'opportunity',at:t,id:op.id||null,title:op.title||'',entity:'opportunities'};
  push(byContact,op.contact_id,v);if(op.company_id)push(byCompany,op.company_id,v)}
 const campaigns=[];
 for(const g of groups.values()){
  const people=[],clickBy=new Map(),urls=new Map();
  for(const k of g.clicks){const p=clickBy.get(k.contact_id)||{n:0,first:k.at,last:k.at};p.n++;p.first=Math.min(p.first,k.at);p.last=Math.max(p.last,k.at);clickBy.set(k.contact_id,p);
   const u=urls.get(k.url)||{url:k.url,clicks:0,people:new Set()};u.clicks++;u.people.add(k.contact_id);urls.set(k.url,u)}
  let clickersSent=0,unsub=0,noDate=0,conv=0,open=0;const by={reply:0,meeting:0,call:0,opportunity:0};
  for(const [id,sentAt] of g.recipients){
   const c=contacts.get(id)||null,cl=clickBy.get(id)||null;if(cl)clickersSent++;
   const u=unsubOf.get(id+'\n'+g.key)??null;if(u!==null)unsub++;
   else if(c&&c.marketing_consent===false&&!unsubscribeTimes(c.unsubscribed!==undefined?c.unsubscribed:c.notes).some(x=>x>=Math.floor(sentAt/6e4)*6e4))noDate++;
   const end=addRomeDays(sentAt,days);if(end>now)open++;
   const cands=[...(byContact.get(id)||[]),...(c&&c.company_id?byCompany.get(c.company_id)||[]:[])];
   let hit=null;for(const x of cands)if(x.at>sentAt&&x.at<=end&&(!hit||x.at<hit.at||(x.at===hit.at&&x.type<hit.type)))hit=x;
   if(hit){conv++;by[hit.type]++}
   people.push({contact_id:id,name:c?c.name||'':'',company_id:c?c.company_id||null:null,sentAt,clicks:cl?cl.n:0,firstClickAt:cl?cl.first:null,unsubscribedAt:u,consent:c?c.marketing_consent!==false:null,conversion:hit?{type:hit.type,label:CONVERSION_LABEL[hit.type],at:hit.at,id:hit.id,title:hit.title,entity:hit.entity}:null});
  }
  // Clickers with no logged send (send recorded elsewhere or outside the period read) still appear in the drill-down.
  for(const [id,cl] of clickBy)if(!g.recipients.has(id)){const c=contacts.get(id)||null;people.push({contact_id:id,name:c?c.name||'':'',company_id:c?c.company_id||null:null,sentAt:null,clicks:cl.n,firstClickAt:cl.first,unsubscribedAt:null,consent:c?c.marketing_consent!==false:null,conversion:null})}
  people.sort((a,b)=>(b.conversion?1:0)-(a.conversion?1:0)||b.clicks-a.clicks||String(a.name).localeCompare(String(b.name),'it'));
  const sent=g.recipients.size,times=[...g.recipients.values()];
  const links=[...urls.values()].map(u=>({url:u.url,clicks:u.clicks,people:u.people.size})).sort((a,b)=>b.people-a.people||b.clicks-a.clicks||a.url.localeCompare(b.url));
  campaigns.push({key:g.key,name:g.name,tracked:g.tracked,sent,sendRecords:g.records,firstSentAt:times.length?Math.min(...times):null,lastSentAt:times.length?Math.max(...times):null,
   clickers:clickBy.size,clickersSent,clickersWithoutSend:clickBy.size-clickersSent,clicks:g.clicks.length,repeatClicks:g.clicks.length-clickBy.size,clickRate:rate(clickersSent,sent),
   lastClickAt:g.clicks.length?Math.max(...g.clicks.map(k=>k.at)):null,links,
   unsubscribed:unsub,unsubscribedNoDate:noDate,unsubscribeRate:rate(unsub,sent),
   conversions:conv,conversionRate:rate(conv,sent),conversionsBy:by,windowOpen:open,people});
 }
 return {days,now,campaigns:sortCampaigns(campaigns,'date','desc'),notMeasured:NOT_MEASURED,conversionNote:CONVERSION_NOTE.replace('N giorni',days+' giorni')};
}
// Sort keys: name, date, sent, clickers, clickRate, unsubscribed, conversions, conversionRate. Null rates go last.
const SORT_KEYS=Object.freeze({name:c=>c.name,date:c=>c.lastSentAt??c.lastClickAt,sent:c=>c.sent,clickers:c=>c.clickers,clickRate:c=>c.clickRate,unsubscribed:c=>c.unsubscribed,conversions:c=>c.conversions,conversionRate:c=>c.conversionRate});
function sortCampaigns(list,key,dir){
 const get=SORT_KEYS[key]||SORT_KEYS.date,sign=dir==='asc'?1:-1;
 return [...(list||[])].sort((a,b)=>{const x=get(a),y=get(b);const nx=x===null||x===undefined,ny=y===null||y===undefined;
  if(nx||ny)return nx&&ny?String(a.name).localeCompare(String(b.name),'it'):nx?1:-1;
  const c=typeof x==='string'?x.localeCompare(y,'it'):x-y;return c?c*sign:String(a.name).localeCompare(String(b.name),'it')});
}
const core={TZ,WINDOWS,DEFAULT_DAYS,NOT_MEASURED,CONVERSION_LABEL,CONVERSION_NOTE,REPLY,romeParts,romeOffset,romeToUtc,addRomeDays,unsubscribeTimes,rate,formatRate,formatRome,decodeK,isReply,isSend,normDays,buildReport,sortCampaigns,SORT_KEYS};
if(typeof module==='object'&&module.exports)module.exports=core;else root.RadixCrmCampaignReportCore=core;
})(typeof globalThis!=='undefined'?globalThis:this);
