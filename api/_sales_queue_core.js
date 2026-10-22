'use strict';
/* «Coda invii» (migration sales 016): pure rules, no database, no network.
   - Ramp-up of a new mailbox: days 1-3 → 10 emails/day, days 4-7 → 25/day, then its daily limit (max 50).
   - Working hours: Monday-Friday, 08:30-18:30 Europe/Rome; each mailbox sends one email every 4-9 minutes.
   - Distribution: each email goes to the active mailbox with the most room left that day, so the load
     follows the remaining daily capacity; a day that is full moves on to the next working day.
   - Worker decisions: re-check consent and address at send time, keep within the daily limit, classify errors. */
const TZ='Europe/Rome';
const START_MIN=8*60+30,END_MIN=18*60+30;
const MAX_MAILBOXES=5,MAX_DAILY=50;
const GAP_MIN_MS=4*60e3,GAP_SPREAD_MS=5*60e3;
const MAX_ATTEMPTS=3,AUTH_PAUSE_AFTER=3,STALE_MS=15*60e3;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY=864e5;

const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',weekday:'short'});
// Rome wall clock of an instant: {date:'YYYY-MM-DD', minutes since midnight, weekday 0-6 (0 = Sunday)}.
function romeParts(ms){
 const p=Object.fromEntries(fmt.formatToParts(new Date(ms)).map(x=>[x.type,x.value]));
 return {date:p.year+'-'+p.month+'-'+p.day,minutes:Number(p.hour)*60+Number(p.minute),seconds:Number(p.second),weekday:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(p.weekday)};
}
const romeDate=ms=>romeParts(ms).date;
// The instant of a Rome wall-clock time (working hours never fall in a DST gap).
function romeToUtc(date,minutes){
 const [y,m,d]=date.split('-').map(Number),wall=Date.UTC(y,m-1,d,0,minutes);
 let t=wall;for(let i=0;i<2;i++){const p=romeParts(t),[py,pm,pd]=p.date.split('-').map(Number);const shown=Date.UTC(py,pm-1,pd,0,p.minutes,p.seconds);t=t+(wall-shown)}
 return t;
}
function addDays(date,n){const [y,m,d]=date.split('-').map(Number);return new Date(Date.UTC(y,m-1,d)+n*DAY).toISOString().slice(0,10)}
function daysBetween(a,b){const t=s=>{const [y,m,d]=String(s).slice(0,10).split('-').map(Number);return Date.UTC(y,m-1,d)};return Math.round((t(b)-t(a))/DAY)}
const workday=date=>{const w=new Date(date+'T12:00:00Z').getUTCDay();return w!==0&&w!==6};

// Emails a mailbox may send on a Rome calendar day, from its warm-up start date and daily limit.
function rampLimit(dailyLimit,warmupStart,date){
 const limit=Math.max(1,Math.min(MAX_DAILY,Number.isInteger(dailyLimit)?dailyLimit:MAX_DAILY));
 const n=warmupStart?daysBetween(warmupStart,date)+1:Infinity;
 if(n<=3)return Math.min(10,limit);
 if(n<=7)return Math.min(25,limit);
 return limit;
}
const gap=random=>GAP_MIN_MS+Math.floor(random()*GAP_SPREAD_MS);

/* Times and mailboxes for `count` emails.
   mailboxes: [{id,daily_limit,warmup_start,status}] (only «active» ones are used);
   load: {mailboxId:{date:emails already planned or sent that day}}; last: {mailboxId:ms of its latest planned email};
   now: ms; random: () => [0,1); maxDays: calendar days to look ahead.
   → {slots:[{mailbox,at}], perMailbox:{id:n}, days:[dates], unplanned} */
function schedule({count,mailboxes,load={},last:lastIn={},now,random=Math.random,maxDays=120}){
 const last={...lastIn};
 const active=(mailboxes||[]).filter(m=>m&&m.status==='active').slice(0,MAX_MAILBOXES);
 const slots=[],perMailbox={},days=[];let left=Math.max(0,count|0);
 if(!active.length)return {slots,perMailbox,days,unplanned:left};
 let date=romeDate(now);
 for(let d=0;d<maxDays&&left>0;d++,date=addDays(date,1)){
  if(!workday(date))continue;
  const start=romeToUtc(date,START_MIN),end=romeToUtc(date,END_MIN);
  const state=active.map(m=>{
   const cap=Math.max(0,rampLimit(m.daily_limit,m.warmup_start,date)-((load[m.id]||{})[date]||0));
   const after=Math.max(now+2*60e3,last[m.id]?last[m.id]+gap(random):0);
   return {id:m.id,cap,next:Math.max(start+Math.floor(random()*GAP_SPREAD_MS),after)};
  });
  let used=false;
  while(left>0){
   const open=state.filter(s=>s.cap>0&&s.next<=end);if(!open.length)break;
   // Most room left first; then the one free earliest; then a stable order.
   open.sort((a,b)=>b.cap-a.cap||a.next-b.next||(a.id<b.id?-1:1));
   const s=open[0];slots.push({mailbox:s.id,at:s.next});perMailbox[s.id]=(perMailbox[s.id]||0)+1;
   last[s.id]=s.next;s.cap--;s.next+=gap(random);left--;used=true;
  }
  if(used)days.push(date);
 }
 slots.sort((a,b)=>a.at-b.at);
 return {slots,perMailbox,days,unplanned:left};
}

// Send-time check of one queue row. contact: current CRM row or null; mailbox: current row or null;
// sentToday: emails this mailbox already sent today (Rome). → {action:'send'|'skip'|'wait'|'postpone', ...}
function decide(row,contact,mailbox,{now,sentToday=0,random=Math.random}){
 if(!contact)return {action:'skip',error:'Contatto non più presente nel CRM.'};
 if(contact.marketing_consent!==true)return {action:'skip',error:'Consenso marketing ritirato: email non inviata.'};
 const to=String(contact.email||'').trim();
 if(!EMAIL.test(to))return {action:'skip',error:'Email del contatto mancante o non valida.'};
 if(!mailbox)return {action:'skip',error:'Casella eliminata: email non inviata.'};
 if(mailbox.status!=='active')return {action:'wait'};
 const today=romeDate(now),limit=rampLimit(mailbox.daily_limit,mailbox.warmup_start,today),p=romeParts(now);
 if(sentToday>=limit||!workday(today)||p.minutes<START_MIN||p.minutes>=END_MIN)return {action:'postpone',at:nextWorkingStart(now,random)};
 return {action:'send',to};
}
// Next working-hours start after now, with a few minutes of random spread.
function nextWorkingStart(now,random=Math.random){
 let date=romeDate(now);const p=romeParts(now);
 if(!(workday(date)&&p.minutes<START_MIN))date=addDays(date,1);
 while(!workday(date))date=addDays(date,1);
 return romeToUtc(date,START_MIN)+Math.floor(random()*GAP_SPREAD_MS*2);
}
// SMTP error → what to do with the row and the mailbox. Never echoes credentials.
function classify(err,attempts){
 const code=err&&err.code,rc=Number(err&&err.responseCode)||0;
 const auth=code==='EAUTH'||rc===535||rc===534||rc===530;
 const message=cleanError(err);
 // Login refused is the mailbox's problem, not the recipient's: the email waits, its attempts are not used up.
 if(auth)return {auth:true,status:'queued',retryInMs:30*60e3,error:'Accesso SMTP rifiutato: controlla utente e password per le app. '+message};
 const permanent=rc>=500&&rc<600;
 if(permanent)return {auth:false,status:'failed',error:message};
 return {auth:false,status:attempts>=MAX_ATTEMPTS?'failed':'queued',retryInMs:15*60e3,error:message};
}
function cleanError(err,secret){
 let m=String((err&&(err.response||err.message))||err||'Errore sconosciuto').replace(/\s+/g,' ').trim();
 if(secret)m=m.split(secret).join('•••');
 return m.slice(0,300);
}
module.exports={TZ,START_MIN,END_MIN,MAX_MAILBOXES,MAX_DAILY,MAX_ATTEMPTS,AUTH_PAUSE_AFTER,STALE_MS,EMAIL,romeParts,romeDate,romeToUtc,addDays,daysBetween,workday,rampLimit,schedule,decide,nextWorkingStart,classify,cleanError};
