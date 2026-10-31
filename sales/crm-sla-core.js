'use strict';
/* CRM «Scadenze SLA» of the support tickets (Salesforce Service «Entitlements/Milestones» gap): per priority, the
   hours to the first response and to the resolution, counted from the ticket's creation, optionally only in working
   hours (lun-ven 09-18 Europe/Rome, no holidays). Pure: no DOM, no fetch.
   Storage: one sales_segments row per workspace named «__sla__» with filters={sla:{business,urgent:{response,resolution},…}}
   (no new table); the server validates it with validate() below, hides it from the segments list, owners/admins only write it.
   First response: tickets have no response timestamp. It is the first «email» interaction recorded by «Rispondi al cliente»
   (sales/crm-ticket-reply.js: title «Risposta al ticket: <titolo>», same contact or company) among the loaded interactions;
   a resolved ticket with no such reply counts its resolution as the response; a «pending» ticket with none has no response
   SLA (it was answered, we cannot say when). The clock never pauses while «in attesa del cliente» (no status history). */
(function(root){
const RESERVED='__sla__',HOUR=36e5,MINUTE=6e4,DAY=864e5,TZ='Europe/Rome',OPEN_H=9,CLOSE_H=18,WARN=0.25,MAX_HOURS=2160;
const PRIORITIES=Object.freeze(['urgent','high','normal','low']);
const PRIORITY_LABEL=Object.freeze({urgent:'urgente',high:'alta',normal:'media',low:'bassa'});
const DEFAULTS=Object.freeze({business:false,urgent:Object.freeze({response:1,resolution:8}),high:Object.freeze({response:4,resolution:24}),normal:Object.freeze({response:8,resolution:48}),low:Object.freeze({response:24,resolution:120})});
const STATE_LABEL=Object.freeze({ok:'Nei tempi','in-scadenza':'In scadenza',scaduto:'Scaduto',rispettato:'Rispettato'});
const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const int=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
const ts=v=>{const n=Date.parse(v||'');return Number.isFinite(n)?n:null};

// Stored settings → null when valid, else the reason (Italian, shown as is). Every key is required: the panel saves them all.
function error(s){
 if(!plain(s))return 'Impostazioni SLA non valide.';
 if(Object.keys(s).some(k=>k!=='business'&&!PRIORITIES.includes(k))||PRIORITIES.some(p=>!Object.hasOwn(s,p)))return 'Impostazioni SLA non valide.';
 if(typeof s.business!=='boolean')return 'Orario lavorativo: sì o no.';
 for(const p of PRIORITIES){const x=s[p];
  if(!plain(x)||Object.keys(x).some(k=>!['response','resolution'].includes(k)))return 'Impostazioni SLA non valide.';
  if(!int(x.response,1,MAX_HOURS)||!int(x.resolution,1,MAX_HOURS))return 'Priorità '+PRIORITY_LABEL[p]+': ore intere da 1 a '+MAX_HOURS+'.';
  if(x.response>x.resolution)return 'Priorità '+PRIORITY_LABEL[p]+': la prima risposta non può superare la risoluzione.';}
 return null;
}
const validate=s=>{const e=error(s);return e?{ok:false,error:e}:{ok:true}};
// The row's settings, or the defaults when missing or invalid (a broken row never blocks the tickets).
function settings(row){const s=row&&plain(row.filters)?row.filters.sla:undefined;return s!==undefined&&!error(s)?s:DEFAULTS}
const copy=s=>{const x=s||DEFAULTS,out={business:!!x.business};for(const p of PRIORITIES)out[p]={response:x[p].response,resolution:x[p].resolution};return out};
const same=(a,b)=>JSON.stringify(copy(a))===JSON.stringify(copy(b));

// Europe/Rome wall clock, DST included, through Intl (no library).
let fmt=null;
function parts(ms){
 fmt=fmt||new Intl.DateTimeFormat('en-GB',{timeZone:TZ,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',weekday:'short'});
 const o={};for(const p of fmt.formatToParts(new Date(ms)))o[p.type]=p.value;
 return {y:+o.year,m:+o.month,d:+o.day,h:+o.hour%24,mi:+o.minute,s:+o.second,dow:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(o.weekday)};
}
// Rome local y-m-d h:00 → instant. 09:00 and 18:00 never fall in a DST gap.
function at(y,m,d,h){
 let t=Date.UTC(y,m-1,d,h);
 for(let i=0;i<2;i++){const p=parts(t);t=Date.UTC(y,m-1,d,h)-(Date.UTC(p.y,p.m-1,p.d,p.h,p.mi,p.s)-t)}
 return t;
}
const nextDay=p=>{const n=new Date(Date.UTC(p.y,p.m-1,p.d+1));return {y:n.getUTCFullYear(),m:n.getUTCMonth()+1,d:n.getUTCDate(),dow:n.getUTCDay()}};
const workday=dow=>dow>=1&&dow<=5;
// Working window [open,close) of the Rome day of t (null on weekends).
function window_(p){return workday(p.dow)?[at(p.y,p.m,p.d,OPEN_H),at(p.y,p.m,p.d,CLOSE_H)]:null}
// start + n working ms.
function addBusiness(start,ms){
 let t=start,left=ms,p=parts(t);
 for(let guard=0;guard<4000;guard++){
  const w=window_(p);
  if(w&&t<w[1]){const from=Math.max(t,w[0]);if(left<=w[1]-from)return from+left;left-=w[1]-from}
  const n=nextDay(p);p={...n,h:OPEN_H};t=at(n.y,n.m,n.d,OPEN_H);
 }
 return t;
}
// Working ms between a and b (a<=b).
function businessBetween(a,b){
 if(!(b>a))return 0;let total=0,t=a,p=parts(a);
 for(let guard=0;guard<4000&&t<b;guard++){
  const w=window_(p);if(w){const from=Math.max(t,w[0]),to=Math.min(b,w[1]);if(to>from)total+=to-from}
  const n=nextDay(p);p={...n,h:0};t=at(n.y,n.m,n.d,OPEN_H);
 }
 return total;
}
const add=(start,hours,business)=>business?addBusiness(start,hours*HOUR):start+hours*HOUR;
const between=(a,b,business)=>business?(b>=a?businessBetween(a,b):-businessBetween(b,a)):b-a;

// The first reply recorded for the ticket by «Rispondi al cliente», among the loaded interactions.
function firstReply(ticket,interactions){
 const title=('Risposta al ticket: '+String(ticket.title||'')).slice(0,200),born=ts(ticket.created_at);let best=null;
 for(const i of Array.isArray(interactions)?interactions:[]){
  if(!i||i.kind!=='email'||i.title!==title)continue;
  if(ticket.contact_id?i.contact_id!==ticket.contact_id:!ticket.company_id||i.company_id!==ticket.company_id)continue;
  const t=ts(i.occurred_at);if(t===null||(born!==null&&t<born-MINUTE))continue;
  if(best===null||t<best)best=t;
 }
 return best;
}
// One clock: {kind,due,at,total,remaining,state,done}
function clock(kind,start,hours,doneAt,now,business){
 const due=add(start,hours,business),total=hours*HOUR;
 if(doneAt!==null)return {kind,due,at:doneAt,total,remaining:between(doneAt,due,business),state:doneAt<=due?'rispettato':'scaduto',done:true};
 const remaining=between(now,due,business);
 return {kind,due,at:null,total,remaining,state:remaining<=0?'scaduto':remaining<total*WARN?'in-scadenza':'ok',done:false};
}
const RANK={scaduto:3,'in-scadenza':2,ok:1,rispettato:0};
// ticket → {priority,business,response|null,resolution,state,active} (null without a valid created_at).
function evaluate(ticket,opts){
 const o=opts||{},s=o.settings&&!error(o.settings)?o.settings:DEFAULTS,now=o.now||Date.now();
 const start=ts(ticket&&ticket.created_at);if(start===null)return null;
 const priority=PRIORITIES.includes(ticket.priority)?ticket.priority:'normal',h=s[priority],business=!!s.business;
 const closed=ticket.status==='resolved'||ticket.status==='closed',resolvedAt=closed?ts(ticket.resolved_at)??ts(ticket.updated_at)??now:null;
 const resolution=clock('resolution',start,h.resolution,resolvedAt,now,business);
 const reply=firstReply(ticket,o.interactions);
 let response=null;
 if(reply!==null)response=clock('response',start,h.response,reply,now,business);
 else if(closed)response=clock('response',start,h.response,resolvedAt,now,business);
 else if(ticket.status==='open')response=clock('response',start,h.response,null,now,business);
 const live=[response,resolution].filter(c=>c&&!c.done);
 const pool=live.length?live:[response,resolution].filter(Boolean);
 const state=pool.reduce((a,c)=>RANK[c.state]>RANK[a]?c.state:a,live.length?'ok':'rispettato');
 return {priority,business,response,resolution,state,active:!closed};
}
// Short duration in Italian: «45 min», «3 h 20 min», «2 g 4 h».
function duration(ms){
 const m=Math.round(Math.abs(ms)/MINUTE);if(m<1)return 'meno di 1 min';
 if(m<60)return m+' min';const h=Math.floor(m/60),r=m%60;
 if(h<24)return h+' h'+(r?' '+r+' min':'');const d=Math.floor(h/24),rh=h%24;return d+' g'+(rh?' '+rh+' h':'');
}
const pad=n=>String(n).padStart(2,'0');
const when=ms=>{const p=parts(ms);return pad(p.d)+'/'+pad(p.m)+' '+pad(p.h)+':'+pad(p.mi)};
// The clock that matters for the badge: the live one closest to its due time, else the worst finished one.
function focus(r){const cs=[r.response,r.resolution].filter(Boolean),live=cs.filter(c=>!c.done);
 if(live.length)return live.reduce((a,c)=>RANK[c.state]>RANK[a.state]||(RANK[c.state]===RANK[a.state]&&c.remaining<a.remaining)?c:a);
 return cs.reduce((a,c)=>RANK[c.state]>RANK[a.state]?c:a)}
// Badge text + tooltip for one evaluated ticket.
function badge(r){
 if(!r)return null;const c=focus(r),what=c.kind==='response'?'prima risposta':'risoluzione',lav=r.business?' lavorative':'';
 let text;
 if(c.done)text=c.state==='rispettato'?'SLA rispettato':'SLA non rispettato ('+what+')';
 else if(c.state==='scaduto')text='SLA scaduto: '+what+' da '+duration(-c.remaining)+lav;
 else text='SLA '+what+': '+duration(c.remaining)+lav;
 const line=x=>x?(x.kind==='response'?'Prima risposta':'Risoluzione')+' entro '+when(x.due)+(x.done?' · '+(x.state==='rispettato'?'rispettata':'in ritardo')+' ('+when(x.at)+')':' · '+STATE_LABEL[x.state]):null;
 const title=[line(r.response)||(r.active?'Prima risposta: non rilevabile (nessuna risposta registrata con «Rispondi al cliente»)':null),line(r.resolution),'Priorità '+PRIORITY_LABEL[r.priority]+(r.business?' · orario lavorativo lun-ven 09-18':' · ore di calendario')].filter(Boolean).join('\n');
 return {text,title,state:r.active?c.state:c.done&&c.state==='scaduto'?'scaduto':'rispettato'};
}
// Filter of the ticket list: '' (tutti), 'scaduti', 'in-scadenza', 'a-rischio' (both). Only open/pending tickets match.
function matches(r,filter){
 if(!filter)return true;if(!r||!r.active)return false;
 if(filter==='scaduti')return r.state==='scaduto';if(filter==='in-scadenza')return r.state==='in-scadenza';
 return r.state==='scaduto'||r.state==='in-scadenza';
}
// Counts over a list of tickets.
function summary(tickets,opts){const out={scaduto:0,'in-scadenza':0,ok:0};for(const t of Array.isArray(tickets)?tickets:[]){const r=evaluate(t,opts);if(r&&r.active&&Object.hasOwn(out,r.state))out[r.state]++}return out}
const api={RESERVED,PRIORITIES,PRIORITY_LABEL,DEFAULTS,STATE_LABEL,WARN,MAX_HOURS,error,validate,settings,copy,same,parts,addBusiness,businessBetween,add,between,firstReply,evaluate,duration,badge,matches,summary};
if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixCrmSla=api;
})(typeof globalThis!=='undefined'?globalThis:this);
