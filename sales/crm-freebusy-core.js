'use strict';
/* Free/busy core for «Calendari esterni» (no I/O: the same file runs in the browser and in api/).
   - parse(text): an iCalendar file (RFC 5545) as published by Outlook / Microsoft 365 («Pubblica calendario», link ICS)
     or Google Calendar («Indirizzo segreto in formato iCal») → its VEVENTs. Folded lines, escaped text, DTSTART/DTEND
     or DURATION, all-day dates, UTC, floating and TZID times. A TZID can be an IANA zone (Google: «Europe/Rome»), a
     Windows zone name (Outlook: «W. Europe Standard Time»), a zone described only by its VTIMEZONE block, or an Outlook
     label such as «(UTC+01:00) Amsterdam, Berlino, Berna, Roma…».
   - busy(input,{from,to,zone}): the busy intervals between from and to (ms). Recurring events are expanded (RRULE
     DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY, BYMONTH; EXDATE; RECURRENCE-ID
     overrides). Cancelled events (STATUS:CANCELLED), free time (TRANSP:TRANSPARENT, Outlook BUSYSTATUS FREE) and
     zero-length events are left out. All-day events are busy from local midnight to midnight in `zone`.
   - merge(...lists): busy intervals of several calendars as one sorted list without overlaps.
   - freeSlots({busy,from,days,zone,hours,weekdays,slot,buffer,step,limit,perDay}): the free slots in working hours.
   Times are epoch milliseconds; wall-clock times are computed in the IANA zone (default Europe/Rome) with Intl. */
(function(root){
const DAY=864e5,MIN=6e4;
const DEFAULT_ZONE='Europe/Rome';
const MAX_INSTANCES=5000,MAX_PERIODS=20000;

/* ---------- Time zones ---------- */
// Windows zone names that Outlook / Exchange write in TZID, with the CLDR (windowsZones.xml) territory-001 zone.
const WINDOWS=Object.freeze({
 'W. Europe Standard Time':'Europe/Berlin','Central Europe Standard Time':'Europe/Budapest','Romance Standard Time':'Europe/Paris',
 'Central European Standard Time':'Europe/Warsaw','GMT Standard Time':'Europe/London','Greenwich Standard Time':'Atlantic/Reykjavik',
 'E. Europe Standard Time':'Europe/Chisinau','FLE Standard Time':'Europe/Kiev','GTB Standard Time':'Europe/Bucharest',
 'Russian Standard Time':'Europe/Moscow','Turkey Standard Time':'Europe/Istanbul','Israel Standard Time':'Asia/Jerusalem',
 'South Africa Standard Time':'Africa/Johannesburg','Egypt Standard Time':'Africa/Cairo','Morocco Standard Time':'Africa/Casablanca',
 'W. Central Africa Standard Time':'Africa/Lagos','Arabian Standard Time':'Asia/Dubai','Arab Standard Time':'Asia/Riyadh',
 'India Standard Time':'Asia/Kolkata','China Standard Time':'Asia/Shanghai','Singapore Standard Time':'Asia/Singapore',
 'Tokyo Standard Time':'Asia/Tokyo','Korea Standard Time':'Asia/Seoul','AUS Eastern Standard Time':'Australia/Sydney',
 'New Zealand Standard Time':'Pacific/Auckland','Eastern Standard Time':'America/New_York','Central Standard Time':'America/Chicago',
 'Mountain Standard Time':'America/Denver','US Mountain Standard Time':'America/Phoenix','Pacific Standard Time':'America/Los_Angeles',
 'Atlantic Standard Time':'America/Halifax','E. South America Standard Time':'America/Sao_Paulo','Argentina Standard Time':'America/Buenos_Aires',
 'Mexico Standard Time':'America/Mexico_City','Central Standard Time (Mexico)':'America/Mexico_City','Canada Central Standard Time':'America/Regina',
 'UTC':'UTC','Coordinated Universal Time':'UTC'});
// Cities of the Outlook labels «(UTC+01:00) Amsterdam, Berlino, Berna, Roma, Stoccolma, Vienna» (English and Italian).
const CITIES=[[/\b(rom[ea]|amsterdam|berlin[o]?|bern[a]?|stockholm|stoccolma|vienna)\b/i,'Europe/Rome'],[/\b(brussels|bruxelles|copenhagen|copenaghen|madrid|paris|parigi)\b/i,'Europe/Paris'],
 [/\b(belgrade|belgrado|bratislava|budapest|ljubljana|lubiana|prague|praga)\b/i,'Europe/Budapest'],[/\b(sarajevo|skopje|warsaw|varsavia|zagreb|zagabria)\b/i,'Europe/Warsaw'],
 [/\b(dublin|dublino|edinburgh|lisbon|lisbona|london|londra)\b/i,'Europe/London'],[/\b(athens|atene|bucharest|bucarest)\b/i,'Europe/Bucharest'],
 [/\b(helsinki|kyiv|kiev|riga|sofia|tallinn|vilnius)\b/i,'Europe/Kiev'],[/\b(eastern time|new york)\b/i,'America/New_York'],[/\bpacific time\b/i,'America/Los_Angeles']];
const fmtCache=new Map();
function validZone(z){if(typeof z!=='string'||!z)return false;if(fmtCache.has(z))return true;try{formatter(z);return true}catch{return false}}
function formatter(z){let f=fmtCache.get(z);if(!f){f=new Intl.DateTimeFormat('en-US',{timeZone:z,hourCycle:'h23',year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric',second:'numeric',weekday:'short'});fmtCache.set(z,f)}return f}
const WD={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
// Wall clock of an instant in an IANA zone → {y,m(1-12),d,h,mi,s,wd(0=Sunday)}.
function wall(ms,zone){
 if(zone==='UTC'||!zone){const d=new Date(ms);return {y:d.getUTCFullYear(),m:d.getUTCMonth()+1,d:d.getUTCDate(),h:d.getUTCHours(),mi:d.getUTCMinutes(),s:d.getUTCSeconds(),wd:d.getUTCDay()}}
 const o={};for(const p of formatter(zone).formatToParts(new Date(ms)))o[p.type]=p.value;
 return {y:+o.year,m:+o.month,d:+o.day,h:+o.hour%24,mi:+o.minute,s:+o.second,wd:WD[o.weekday]};
}
const offsetAt=(ms,zone)=>{const w=wall(ms,zone);return Date.UTC(w.y,w.m-1,w.d,w.h,w.mi,w.s)-Math.floor(ms/1000)*1000};
// Wall clock in a zone → instant. In the spring-forward gap the time moves forward by the gap; in the autumn
// overlap the first (summer time) instant is taken, as calendar programs do.
function zoned(y,m,d,h,mi,s,zone){
 const local=Date.UTC(y,m-1,d,h||0,mi||0,s||0);
 if(zone&&typeof zone==='object')return local-zone.offset(y,m,d,h||0,mi||0);// VTIMEZONE rules
 if(!zone||zone==='UTC')return local;
 // The offsets in force half a day before and after: one of them fits, both in the autumn overlap, none in the gap.
 const before=offsetAt(local-12*3600e3,zone),after=offsetAt(local+12*3600e3,zone);
 const fits=[before,after].filter(o=>offsetAt(local-o,zone)===o).map(o=>local-o);
 return fits.length?Math.min(...fits):local-before;
}

/* ---------- Text level: unfold, content lines, values ---------- */
function unfold(text){return String(text==null?'':text).replace(/^﻿/,'').replace(/\r\n|\r/g,'\n').replace(/\n[ \t]/g,'')}
// One content line → {name, params:{NAME:value}, value}. Quoted parameter values may contain ; : and ,.
function line(raw){
 let i=0,name='';const params={};const n=raw.length;
 while(i<n&&raw[i]!==';'&&raw[i]!==':')name+=raw[i++];
 while(i<n&&raw[i]===';'){i++;let k='';while(i<n&&raw[i]!=='='&&raw[i]!==':'&&raw[i]!==';')k+=raw[i++];
  let v='';if(raw[i]==='='){i++;let q=false;while(i<n&&(q||(raw[i]!==';'&&raw[i]!==':'))){if(raw[i]==='"'){q=!q;i++;continue}v+=raw[i++]}}
  params[k.trim().toUpperCase()]=v}
 return {name:name.trim().toUpperCase(),params,value:raw[i]===':'?raw.slice(i+1):''};
}
const unescape=v=>String(v).replace(/\\([\\;,nN])/g,(_,c)=>c==='n'||c==='N'?'\n':c);
// Component tree: {type, props:[line], children:[component]}.
function tree(text){
 const top={type:'ROOT',props:[],children:[]},stack=[top];
 for(const raw of unfold(text).split('\n')){if(!raw.trim())continue;const l=line(raw);const cur=stack[stack.length-1];
  if(l.name==='BEGIN'){const c={type:l.value.trim().toUpperCase(),props:[],children:[]};cur.children.push(c);stack.push(c)}
  else if(l.name==='END'){if(stack.length>1)stack.pop()}
  else cur.props.push(l)}
 return top;
}
const prop=(c,name)=>c.props.find(p=>p.name===name);
const props=(c,name)=>c.props.filter(p=>p.name===name);

// DATE or DATE-TIME value → {date:true,y,m,d} | {y,m,d,h,mi,s,utc:bool}. null when invalid.
function dateValue(v){
 const m=/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(String(v).trim());if(!m)return null;
 const y=+m[1],mo=+m[2],d=+m[3];if(mo<1||mo>12||d<1||d>31)return null;
 if(m[4]===undefined)return {date:true,y,m:mo,d};
 const h=+m[4],mi=+m[5],s=+(m[6]||0);if(h>24||mi>59||s>60)return null;
 return {y,m:mo,d,h,mi,s,utc:!!m[7]};
}
// ISO 8601 duration (P1D, PT1H30M, P2W) → ms; null when invalid. Negative durations are not meaningful here.
function duration(v){
 const m=/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(v||'').trim());
 if(!m||!/\d/.test(v))return null;const ms=(+(m[2]||0)*7+ +(m[3]||0))*DAY+(+(m[4]||0)*60+ +(m[5]||0))*MIN+ +(m[6]||0)*1000;
 return m[1]==='-'?-ms:ms;
}

/* ---------- VTIMEZONE rules (zones that are neither IANA nor known Windows names) ---------- */
function offsetValue(v){const m=/^([+-])(\d{2})(\d{2})(\d{2})?$/.exec(String(v||'').trim());if(!m)return null;return (m[1]==='-'?-1:1)*((+m[2]*60+ +m[3])*MIN+ +(m[4]||0)*1000)}
function vtimezone(c){
 const obs=[];
 for(const s of c.children){if(s.type!=='STANDARD'&&s.type!=='DAYLIGHT')continue;
  const to=offsetValue(prop(s,'TZOFFSETTO')?.value),from=offsetValue(prop(s,'TZOFFSETFROM')?.value),st=dateValue(prop(s,'DTSTART')?.value||'');
  if(to==null||!st)continue;const rr=prop(s,'RRULE');obs.push({to,from:from==null?to:from,start:st,rule:rr?rrule(rr.value):null})}
 if(!obs.length)return null;
 // Transitions of one observance in a year, as local wall-clock ms (in the offset before the change).
 const onsets=(o,y)=>{const t=o.start,base=[t.h||0,t.mi||0,t.s||0];
  if(!o.rule){return t.y===y?[Date.UTC(t.y,t.m-1,t.d,...base)]:[]}
  if(o.rule.until!=null&&Date.UTC(y,0,1)>o.rule.until+DAY*366)return [];
  if(y<t.y)return [];const months=o.rule.bymonth.length?o.rule.bymonth:[t.m];const out=[];
  for(const mo of months){const days=o.rule.byday.length?monthDays(y,mo,o.rule.byday):o.rule.bymonthday.length?monthDayList(y,mo,o.rule.bymonthday):[t.d];for(const d of days)out.push(Date.UTC(y,mo-1,d,...base))}
  return out};
 return {offset(y,m,d,h,mi){const local=Date.UTC(y,m-1,d,h,mi);let best=null;
  for(const yy of [y-1,y])for(const o of obs)for(const on of onsets(o,yy))if(on<=local&&(!best||on>best.on))best={on,o};
  if(best)return best.o.to;
  const first=obs.slice().sort((a,b)=>Date.UTC(a.start.y,a.start.m-1,a.start.d)-Date.UTC(b.start.y,b.start.m-1,b.start.d))[0];return first.from}};
}
// TZID → an IANA zone name, a VTIMEZONE rule object or a fixed offset; fallback when nothing fits.
function resolveZone(tzid,zones,fallback){
 if(!tzid)return fallback;let id=String(tzid).trim().replace(/^\//,'');
 if(validZone(id))return id;
 if(Object.hasOwn(WINDOWS,id))return WINDOWS[id];
 const tail=/([A-Za-z]+\/[A-Za-z_+-]+(?:\/[A-Za-z_+-]+)?)$/.exec(id);// «/mozilla.org/20050126_1/Europe/Rome»
 if(tail&&validZone(tail[1]))return tail[1];
 if(zones&&zones.has(id)&&zones.get(id))return zones.get(id);
 for(const [re,z] of CITIES)if(re.test(id))return z;
 const fixed=/UTC\s*([+-])(\d{1,2}):?(\d{2})/i.exec(id);
 if(fixed){const off=(fixed[1]==='-'?-1:1)*((+fixed[2])*60+ +fixed[3])*MIN;return {offset:()=>off}}
 if(/^(utc|gmt|z)$/i.test(id))return 'UTC';
 return fallback;
}

/* ---------- RRULE ---------- */
const DAYS={SU:0,MO:1,TU:2,WE:3,TH:4,FR:5,SA:6};
function rrule(v){
 const r={freq:null,interval:1,count:null,until:null,untilDate:null,byday:[],bymonthday:[],bymonth:[],wkst:1,unsupported:[]};
 for(const part of String(v||'').split(';')){const [k0,val='']=part.split('=');const k=(k0||'').trim().toUpperCase();if(!k)continue;
  if(k==='FREQ')r.freq=val.toUpperCase();
  else if(k==='INTERVAL'){const n=parseInt(val,10);if(n>0)r.interval=n}
  else if(k==='COUNT'){const n=parseInt(val,10);if(n>0)r.count=n}
  else if(k==='UNTIL'){r.untilDate=dateValue(val)}
  else if(k==='BYDAY'){for(const x of val.split(',')){const m=/^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/i.exec(x.trim());if(m)r.byday.push({n:m[1]?parseInt(m[1],10):0,wd:DAYS[m[2].toUpperCase()]})}}
  else if(k==='BYMONTHDAY'){for(const x of val.split(',')){const n=parseInt(x,10);if(n&&Math.abs(n)<=31)r.bymonthday.push(n)}}
  else if(k==='BYMONTH'){for(const x of val.split(',')){const n=parseInt(x,10);if(n>=1&&n<=12)r.bymonth.push(n)}}
  else if(k==='WKST'){if(Object.hasOwn(DAYS,val.toUpperCase()))r.wkst=DAYS[val.toUpperCase()]}
  else r.unsupported.push(k)}
 if(r.untilDate)r.until=r.untilDate.date?Date.UTC(r.untilDate.y,r.untilDate.m-1,r.untilDate.d,23,59,59):Date.UTC(r.untilDate.y,r.untilDate.m-1,r.untilDate.d,r.untilDate.h,r.untilDate.mi,r.untilDate.s);
 return r;
}
const daysIn=(y,m)=>new Date(Date.UTC(y,m,0)).getUTCDate();
const weekday=(y,m,d)=>new Date(Date.UTC(y,m-1,d)).getUTCDay();
// Days of a month matching BYDAY (MO = every Monday, 2TU = second Tuesday, -1FR = last Friday).
function monthDays(y,m,byday){const n=daysIn(y,m),out=new Set();
 for(const b of byday){const all=[];for(let d=1;d<=n;d++)if(weekday(y,m,d)===b.wd)all.push(d);
  if(!b.n)all.forEach(d=>out.add(d));else{const d=b.n>0?all[b.n-1]:all[all.length+b.n];if(d)out.add(d)}}
 return [...out].sort((a,b)=>a-b)}
function monthDayList(y,m,list){const n=daysIn(y,m),out=new Set();for(const x of list){const d=x>0?x:n+1+x;if(d>=1&&d<=n)out.add(d)}return [...out].sort((a,b)=>a-b)}
const addDays=(y,m,d,k)=>{const t=new Date(Date.UTC(y,m-1,d)+k*DAY);return [t.getUTCFullYear(),t.getUTCMonth()+1,t.getUTCDate()]};

// Start dates (local y,m,d) of a recurring event in order, from its first date; stops at `last` (local date ms, UTC-based).
function* occurrences(st,r,last){
 const s=[st.y,st.m,st.d],startKey=Date.UTC(st.y,st.m-1,st.d);let periods=0;
 const emit=function*(list){for(const [y,m,d] of list){const k=Date.UTC(y,m-1,d);if(k<startKey)continue;yield [y,m,d]}};
 if(r.freq==='DAILY'){let [y,m,d]=s;while(periods++<MAX_PERIODS){const k=Date.UTC(y,m-1,d);if(k>last)return;
   if((!r.byday.length||r.byday.some(b=>b.wd===weekday(y,m,d)))&&(!r.bymonth.length||r.bymonth.includes(m))&&(!r.bymonthday.length||monthDayList(y,m,r.bymonthday).includes(d)))yield* emit([[y,m,d]]);
   [y,m,d]=addDays(y,m,d,r.interval)}return}
 if(r.freq==='WEEKLY'){const wds=r.byday.length?[...new Set(r.byday.map(b=>b.wd))]:[weekday(...s)];
  const back=(weekday(...s)-r.wkst+7)%7;let [y,m,d]=addDays(...s,-back);
  while(periods++<MAX_PERIODS){if(Date.UTC(y,m-1,d)>last)return;const week=[];
   for(let i=0;i<7;i++){const x=addDays(y,m,d,i);if(wds.includes(weekday(...x))&&(!r.bymonth.length||r.bymonth.includes(x[1])))week.push(x)}
   yield* emit(week);[y,m,d]=addDays(y,m,d,7*r.interval)}return}
 if(r.freq==='MONTHLY'||r.freq==='YEARLY'){let y=st.y,m=st.m;
  while(periods++<MAX_PERIODS){if(Date.UTC(y,m-1,1)>last)return;
   const months=r.freq==='YEARLY'?(r.bymonth.length?r.bymonth:[st.m]).map(mm=>[y,mm]):[[y,m]];
   for(const [yy,mm] of months){if(r.freq==='MONTHLY'&&r.bymonth.length&&!r.bymonth.includes(mm))continue;
    let days=r.byday.length?monthDays(yy,mm,r.byday):r.bymonthday.length?monthDayList(yy,mm,r.bymonthday):(st.d<=daysIn(yy,mm)?[st.d]:[]);
    if(r.byday.length&&r.bymonthday.length){const md=monthDayList(yy,mm,r.bymonthday);days=days.filter(d=>md.includes(d))}
    yield* emit(days.map(d=>[yy,mm,d]))}
   if(r.freq==='YEARLY')y+=r.interval;else{m+=r.interval;while(m>12){m-=12;y++}}}
  return}
}

/* ---------- Events ---------- */
// Instant of a DTSTART/DTEND/EXDATE/RECURRENCE-ID value: {ms, allDay, parts, zone}.
function instant(p,ctx){
 if(!p)return null;const v=dateValue(p.value.split(',')[0]);if(!v)return null;
 if(v.date||String(p.params.VALUE||'').toUpperCase()==='DATE'){if(!v.date)return null;return {allDay:true,parts:v,zone:ctx.allDayZone,ms:zoned(v.y,v.m,v.d,0,0,0,ctx.allDayZone)}}
 const zone=v.utc?'UTC':resolveZone(p.params.TZID,ctx.zones,ctx.floating);
 return {allDay:false,parts:v,zone,ms:zoned(v.y,v.m,v.d,v.h,v.mi,v.s,zone)};
}
function instants(list,ctx){const out=[];for(const p of list)for(const raw of p.value.split(',')){const x=instant({...p,value:raw},ctx);if(x)out.push(x.ms)}return out}

// Text → {name, zone, events:[{uid,summary,status,transparent,allDay,start,end,rrule,exdates,recurrenceId,...}]}.
function parse(text,opts){
 const o=opts||{};const top=tree(text);const cal=top.children.find(c=>c.type==='VCALENDAR')||top;
 const xzone=prop(cal,'X-WR-TIMEZONE')?.value?.trim();
 const zone=o.zone||DEFAULT_ZONE;
 const zones=new Map();for(const c of cal.children)if(c.type==='VTIMEZONE'){const id=prop(c,'TZID')?.value?.trim();if(!id)continue;
  zones.set(id,validZone(id)?id:Object.hasOwn(WINDOWS,id)?WINDOWS[id]:vtimezone(c))}
 const floating=xzone&&validZone(xzone)?xzone:zone;
 const ctx={zones,floating,allDayZone:zone};
 const events=[];
 for(const c of cal.children){if(c.type!=='VEVENT')continue;
  const st=instant(prop(c,'DTSTART'),ctx);if(!st)continue;
  const endP=prop(c,'DTEND'),durP=prop(c,'DURATION');let len;
  if(endP){const en=instant(endP,ctx);len=en?(st.allDay?Math.round((Date.UTC(en.parts.y,en.parts.m-1,en.parts.d)-Date.UTC(st.parts.y,st.parts.m-1,st.parts.d))/DAY)*DAY:en.ms-st.ms):null}
  else if(durP)len=duration(durP.value);
  if(len==null||!Number.isFinite(len))len=st.allDay?DAY:0;
  const busyStatus=String(prop(c,'X-MICROSOFT-CDO-BUSYSTATUS')?.value||'').trim().toUpperCase();
  const transp=String(prop(c,'TRANSP')?.value||'').trim().toUpperCase();
  const rr=prop(c,'RRULE');
  events.push({uid:prop(c,'UID')?.value?.trim()||'',summary:unescape(prop(c,'SUMMARY')?.value||''),location:unescape(prop(c,'LOCATION')?.value||''),
   status:String(prop(c,'STATUS')?.value||'').trim().toUpperCase(),transparent:transp==='TRANSPARENT'||busyStatus==='FREE',
   private:/^(PRIVATE|CONFIDENTIAL)$/i.test(String(prop(c,'CLASS')?.value||'').trim()),
   allDay:st.allDay,start:st.ms,end:st.ms+Math.max(0,len),length:Math.max(0,len),startParts:st.parts,zone:st.zone,
   rrule:rr?rrule(rr.value):null,exdates:instants(props(c,'EXDATE'),ctx),rdates:instants(props(c,'RDATE'),ctx),
   recurrenceId:(()=>{const x=instant(prop(c,'RECURRENCE-ID'),ctx);return x?x.ms:null})()});
 }
 return {name:unescape(prop(cal,'X-WR-CALNAME')?.value||''),zone:xzone||'',events};
}

// Instances of one event overlapping [from,to): [{start,end}].
function expand(ev,from,to){
 if(!ev.rrule||!ev.rrule.freq){const out=[{start:ev.start,end:ev.end}];for(const r of ev.rdates)out.push({start:r,end:r+ev.length});return out.filter(x=>x.end>from&&x.start<to)}
 const r=ev.rrule,p=ev.startParts,out=[],ex=new Set(ev.exdates);let n=0;
 const zone=ev.zone;
 // Local-date bound: one day of slack either side covers any zone offset.
 const last=Date.UTC(new Date(to).getUTCFullYear(),new Date(to).getUTCMonth(),new Date(to).getUTCDate())+2*DAY;
 for(const [y,m,d] of occurrences(p,r,last)){
  const s=ev.allDay?zoned(y,m,d,0,0,0,zone):zoned(y,m,d,p.h,p.mi,p.s,zone);
  if(r.untilDate&&(r.untilDate.date?Date.UTC(y,m-1,d)>Date.UTC(r.untilDate.y,r.untilDate.m-1,r.untilDate.d):s>r.until))break;
  n++;if(r.count!=null&&n>r.count)break;
  if(s>=to)break;
  if(!ex.has(s)&&s+ev.length>from)out.push({start:s,end:s+ev.length});
  if(out.length>=MAX_INSTANCES)break}
 for(const rd of ev.rdates)if(!ex.has(rd)&&rd<to&&rd+ev.length>from)out.push({start:rd,end:rd+ev.length});
 return out;
}
const counts=ev=>ev.status!=='CANCELLED'&&!ev.transparent;

/* busy(textOrParsed, {from, to, zone, details}) → [{start,end,allDay,summary?}] sorted by start.
   summary is included only with details:true (the CRM shows «Occupato» otherwise). */
function busy(input,opts){
 const o=opts||{},from=Number(o.from),to=Number(o.to);if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from)return [];
 const cal=typeof input==='string'?parse(input,{zone:o.zone}):input;const events=(cal&&cal.events)||[];
 // RECURRENCE-ID: the override replaces the instance of the series with the same UID that started at that time.
 const moved=new Map();for(const e of events)if(e.recurrenceId!=null){const k=e.uid;if(!moved.has(k))moved.set(k,new Set());moved.get(k).add(e.recurrenceId)}
 const out=[];
 for(const e of events){
  let list;
  if(e.recurrenceId!=null){if(!counts(e))continue;list=e.end>from&&e.start<to?[{start:e.start,end:e.end}]:[]}
  else{if(!counts(e))continue;const skip=moved.get(e.uid);list=expand(e,from,to).filter(x=>!(skip&&skip.has(x.start)))}
  for(const x of list){if(x.end<=x.start)continue;const b={start:x.start,end:x.end,allDay:e.allDay};if(o.details){b.summary=e.private?'':e.summary}out.push(b)}}
 return out.sort((a,b)=>a.start-b.start||a.end-b.end);
}

// Several lists of {start,end} (or [start,end]) → one sorted list of disjoint intervals.
function merge(...lists){
 const all=[];for(const l of lists)for(const x of l||[]){const s=Array.isArray(x)?x[0]:x.start,e=Array.isArray(x)?x[1]:x.end;if(Number.isFinite(s)&&Number.isFinite(e)&&e>s)all.push([s,e])}
 all.sort((a,b)=>a[0]-b[0]);const out=[];
 for(const [s,e] of all){const l=out[out.length-1];if(l&&s<=l.end){if(e>l.end)l.end=e}else out.push({start:s,end:e})}
 return out;
}

/* ---------- Free slots ---------- */
const hm=v=>{const m=/^(\d{1,2}):(\d{2})$/.exec(String(v||''));if(!m)return null;const h=+m[1],mi=+m[2];return h<=24&&mi<60&&h*60+mi<=1440?h*60+mi:null};
const DEFAULT_HOURS=Object.freeze({start:'09:00',end:'18:00'});
/* opts: busy (any of the shapes merge takes), from (ms, default now), now (ms), days (default 7, max 60),
   zone (IANA, default Europe/Rome), hours {start:'09:00',end:'18:00'}, weekdays [1..5] (0 = Sunday),
   slot minutes (30 or 60 in the UI; 5-480 accepted), buffer minutes kept free around busy time (0-120),
   step minutes between candidate starts (default 30, or the slot when shorter), limit (default 20), perDay (default no limit).
   → [{start,end}] in order. A slot starts no earlier than now (rounded up to the step). */
function freeSlots(opts){
 const o=opts||{},zone=o.zone&&validZone(o.zone)?o.zone:DEFAULT_ZONE,now=Number.isFinite(o.now)?o.now:Date.now();
 const from=Number.isFinite(o.from)?Math.max(o.from,now):now,days=Math.min(60,Math.max(1,Math.floor(o.days||7)));
 const slot=Math.min(480,Math.max(5,Math.floor(o.slot||30))),buffer=Math.min(120,Math.max(0,Math.floor(o.buffer||0)));
 const step=Math.min(slot,Math.max(5,Math.floor(o.step||30)));
 const h=o.hours||DEFAULT_HOURS,hs=hm(h.start),he=hm(h.end);if(hs==null||he==null||he<=hs)return [];
 const weekdays=Array.isArray(o.weekdays)&&o.weekdays.length?o.weekdays:[1,2,3,4,5];
 const limit=Math.max(1,Math.floor(o.limit||20)),perDay=o.perDay?Math.max(1,Math.floor(o.perDay)):Infinity;
 const blocked=merge(o.busy||[]).map(b=>({start:b.start-buffer*MIN,end:b.end+buffer*MIN}));
 const out=[];const w0=wall(from,zone);let i=0;
 for(let k=0;k<days&&out.length<limit;k++){
  const [y,m,d]=addDays(w0.y,w0.m,w0.d,k);if(!weekdays.includes(weekday(y,m,d)))continue;
  const open=zoned(y,m,d,Math.floor(hs/60),hs%60,0,zone),close=he===1440?zoned(...addDays(y,m,d,1),0,0,0,zone):zoned(y,m,d,Math.floor(he/60),he%60,0,zone);
  let t=open;if(t<from)t=open+Math.ceil((from-open)/(step*MIN))*step*MIN;let today=0;
  while(t+slot*MIN<=close&&out.length<limit&&today<perDay){const e=t+slot*MIN;
   while(i<blocked.length&&blocked[i].end<=t)i++;// blocked is sorted; i only moves forward within the day
   let clash=null;for(let j=i;j<blocked.length&&blocked[j].start<e;j++)if(blocked[j].end>t){clash=blocked[j];break}
   if(!clash){out.push({start:t,end:e});today++;t+=step*MIN;continue}
   // Jump past the clash, back on the step grid.
   t=open+Math.ceil((clash.end-open)/(step*MIN))*step*MIN}
  i=0;
 }
 return out;
}

/* The CRM's own appointments as busy time, with the same lengths as the calendar feed (api/_sales_calendar_feed.js):
   open tasks with a due date assigned to `me` (60 minutes for «Appuntamento…», else 30), calls (30) and meetings (60)
   recorded by `me`. Without `me`, every open task and every call/meeting. → [{start,end}] overlapping [from,to). */
function crmBusy(data,opts){
 const o=opts||{},me=o.me==null?null:String(o.me),from=Number.isFinite(o.from)?o.from:-Infinity,to=Number.isFinite(o.to)?o.to:Infinity,out=[];
 const mine=v=>me===null||String(v==null?'':v)===me;
 for(const t of (data&&data.tasks)||[]){if(t.status==='done'||!t.due_at||!mine(t.assignee_id))continue;const s=Date.parse(t.due_at);if(!Number.isFinite(s))continue;
  const e=s+(/^appuntamento\b/i.test(String(t.title||'').trim())?60:30)*MIN;if(e>from&&s<to)out.push({start:s,end:e})}
 for(const i of (data&&data.interactions)||[]){if(!['call','meeting'].includes(i.kind)||!i.occurred_at||(me!==null&&i.created_by!=null&&!mine(i.created_by)))continue;const s=Date.parse(i.occurred_at);if(!Number.isFinite(s))continue;
  const e=s+(i.kind==='meeting'?60:30)*MIN;if(e>from&&s<to)out.push({start:s,end:e})}
 return out.sort((a,b)=>a.start-b.start);
}

const api={parse,busy,merge,freeSlots,crmBusy,expand,rrule,duration,dateValue,unfold,resolveZone,zoned,wall,WINDOWS,DEFAULT_ZONE,DEFAULT_HOURS};
if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixFreeBusy=api;
})(typeof globalThis!=='undefined'?globalThis:this);
