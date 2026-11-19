/* Ciuffo — free slots for a shop's agenda. Pure functions, no dependencies, same file in Node and in the browser.
   Times of day are 'HH:MM' in the shop's time zone; instants are ISO strings in UTC. A day's opening hours are a list
   of [open, close] pairs (a lunch break is the gap between two pairs). Weekdays are 1 = Monday … 7 = Sunday.
   An appointment blocks its staff member from starts_at to blocks_until (the service plus its buffer). */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CiuffoSlots=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const MIN=60000,DAY=86400000;
const isDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
const isTime=s=>typeof s==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const toMin=s=>Number(s.slice(0,2))*60+Number(s.slice(3,5));
const fromMin=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
const addDays=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*DAY).toISOString().slice(0,10);
const weekday=d=>{const w=new Date(d+'T12:00:00Z').getUTCDay();return w===0?7:w;};

// Offset of a time zone from UTC, in minutes, at a given instant (Europe/Rome: +60 in winter, +120 in summer).
const FORMATS=new Map();
function offsetAt(tz,ms){
 let f=FORMATS.get(tz);if(!f){f=new Intl.DateTimeFormat('en-US',{timeZone:tz,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});FORMATS.set(tz,f);}
 const p={};for(const x of f.formatToParts(new Date(ms)))p[x.type]=x.value;
 return Math.round((Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second)-Math.floor(ms/1000)*1000)/MIN);
}
// Local date + minutes of the day → UTC milliseconds. A time skipped by the spring change moves forward one hour.
function localToUtc(date,minutes,tz){
 const guess=Date.parse(date+'T00:00:00Z')+minutes*MIN;
 let ms=guess-offsetAt(tz,guess)*MIN;const o2=offsetAt(tz,ms);if(guess-o2*MIN!==ms)ms=guess-o2*MIN;
 return ms;
}
// UTC instant → {date, time} in the shop's zone.
function utcToLocal(iso,tz){const ms=typeof iso==='number'?iso:Date.parse(iso);const l=new Date(ms+offsetAt(tz,ms)*MIN).toISOString();return {date:l.slice(0,10),time:l.slice(11,16)};}

// Hours: {"1":[["09:00","13:00"],["14:30","19:00"]], …}. Returns null when valid, else an Italian message.
function checkHours(h){
 if(!h||typeof h!=='object'||Array.isArray(h))return 'Orari non validi.';
 for(const [k,v] of Object.entries(h)){
  if(!/^[1-7]$/.test(k))return 'Giorno della settimana non valido.';
  if(!Array.isArray(v)||v.length>4)return 'Al massimo 4 fasce orarie al giorno.';
  let last=-1;for(const p of v){if(!Array.isArray(p)||p.length!==2||!isTime(p[0])||!isTime(p[1]))return 'Orario non valido: usa HH:MM.';
   const a=toMin(p[0]),b=toMin(p[1]);if(b<=a)return 'La chiusura deve venire dopo l\'apertura.';if(a<last)return 'Le fasce orarie si sovrappongono o non sono in ordine.';last=b;}
 }
 return null;
}
const closedOn=(closures,date,staffId)=>(closures||[]).some(c=>c.from_date<=date&&date<=(c.to_date||c.from_date)&&(!c.staff_id||c.staff_id===staffId));

// Free start times for one service on one local day.
// opts: {date, tz, step_min, min_notice_min, now (ISO or ms), service:{id,duration_min,buffer_min,staff_ids},
//        hours (shop), staff:[{id,hours?,active}], closures:[{from_date,to_date,staff_id?}], busy:[{staff_id,starts_at,blocks_until}],
//        staff_id (optional: only this member)}
// Returns [{time:'HH:MM', starts_at, ends_at, blocks_until, staff_ids:[…]}] in time order.
function freeSlots(o){
 const tz=o.tz||'Europe/Rome',step=o.step_min||15,svc=o.service;
 if(!isDate(o.date)||!svc||!(svc.duration_min>0))return [];
 const dur=svc.duration_min,buf=svc.buffer_min||0,now=o.now===undefined?Date.now():(typeof o.now==='number'?o.now:Date.parse(o.now));
 const earliest=now+(o.min_notice_min||0)*MIN;
 if(closedOn(o.closures,o.date,null))return [];
 const canDo=s=>s.active!==false&&(!svc.staff_ids||!svc.staff_ids.length||svc.staff_ids.includes(s.id))&&(!o.staff_id||o.staff_id===s.id);
 const wd=String(weekday(o.date)),byTime=new Map();
 for(const s of (o.staff||[]).filter(canDo)){
  if(closedOn(o.closures,o.date,s.id))continue;
  const ranges=((s.hours&&Object.keys(s.hours).length?s.hours:o.hours)||{})[wd]||[];
  const busy=(o.busy||[]).filter(b=>b.staff_id===s.id).map(b=>[Date.parse(b.starts_at),Date.parse(b.blocks_until||b.ends_at)]);
  for(const [a,b] of ranges){
   const open=toMin(a),close=toMin(b);
   // Starts are aligned to the step from the opening time; the service must end by closing time (the buffer may run past it).
   for(let m=open;m+dur<=close;m+=step){
    const start=localToUtc(o.date,m,tz),end=start+dur*MIN,block=end+buf*MIN;
    if(start<earliest)continue;
    if(busy.some(([x,y])=>start<y&&x<block))continue;
    const key=fromMin(m);let slot=byTime.get(key);
    if(!slot){slot={time:key,starts_at:new Date(start).toISOString(),ends_at:new Date(end).toISOString(),blocks_until:new Date(block).toISOString(),staff_ids:[]};byTime.set(key,slot);}
    slot.staff_ids.push(s.id);
   }
  }
 }
 return [...byTime.values()].sort((x,y)=>x.time<y.time?-1:x.time>y.time?1:0);
}
// The member who takes a booking made with "any staff": the one with the fewest booked minutes that day, then list order.
function pickStaff(staffIds,staff,busy){
 const load=id=>(busy||[]).filter(b=>b.staff_id===id).reduce((t,b)=>t+(Date.parse(b.blocks_until||b.ends_at)-Date.parse(b.starts_at)),0);
 const order=id=>{const i=(staff||[]).findIndex(s=>s.id===id);return i<0?1e9:i;};
 return [...staffIds].sort((a,b)=>load(a)-load(b)||order(a)-order(b))[0]||null;
}
// Gaps of a member's day for the owner's agenda: open time not taken by appointments, at least minMinutes long.
function gaps(o,minMinutes){
 const tz=o.tz||'Europe/Rome',s=o.member,wd=String(weekday(o.date));
 if(closedOn(o.closures,o.date,s.id))return [];
 const ranges=((s.hours&&Object.keys(s.hours).length?s.hours:o.hours)||{})[wd]||[];
 const busy=(o.busy||[]).filter(b=>b.staff_id===s.id).map(b=>[Date.parse(b.starts_at),Date.parse(b.blocks_until||b.ends_at)]).sort((x,y)=>x[0]-y[0]);
 const out=[];
 for(const [a,b] of ranges){
  let cur=localToUtc(o.date,toMin(a),tz);const end=localToUtc(o.date,toMin(b),tz);
  for(const [x,y] of busy){if(y<=cur||x>=end)continue;if(x>cur)out.push([cur,x]);cur=Math.max(cur,y);}
  if(cur<end)out.push([cur,end]);
 }
 return out.filter(([x,y])=>(y-x)/MIN>=(minMinutes||1)).map(([x,y])=>({from:utcToLocal(x,tz).time,to:utcToLocal(y,tz).time,starts_at:new Date(x).toISOString(),ends_at:new Date(y).toISOString(),minutes:Math.round((y-x)/MIN)}));
}
const DEFAULT_HOURS={"2":[["09:00","13:00"],["14:30","19:00"]],"3":[["09:00","13:00"],["14:30","19:00"]],"4":[["09:00","13:00"],["14:30","19:00"]],"5":[["09:00","19:00"]],"6":[["08:30","18:00"]]};
const DEFAULT_SERVICES=[{name:'Taglio',duration_min:30,price_cents:2000},{name:'Piega',duration_min:30,price_cents:1800},{name:'Taglio e piega',duration_min:60,price_cents:3500},{name:'Colore',duration_min:90,buffer_min:0,price_cents:4500}];
return {isDate,isTime,toMin,fromMin,addDays,weekday,offsetAt,localToUtc,utcToLocal,checkHours,closedOn,freeSlots,pickStaff,gaps,DEFAULT_HOURS,DEFAULT_SERVICES};
});
