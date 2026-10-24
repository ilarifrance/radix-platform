'use strict';
// The CRM screens read and show days and hours in ora italiana (Europe/Rome) whatever the browser's zone:
// Foglio chiamate (crm-sheet-core.js / crm-sheet.js), «Oggi» (crm-today-core.js / crm-today.js), the «Occupato»
// all-day blocks of the external calendars (crm-freebusy-core.js / crm-calendars.js), the Panoramica suggestions
// (crm-home-core.js), Attività (tasks-view.js) and the CRM lists (crm-list-core.js / crm-list.js).
// The same code runs in child processes with TZ=Europe/Rome, America/New_York and Asia/Tokyo around the
// 25 October 2026 clock change (02:00 CEST → 01:00 CET in Rome) and every zone must give the Rome answer.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const Z=s=>Date.parse(s);
// Sunday 25 October 2026, 10:00 in Rome (CET, 09:00Z): 05:00 in New York, 18:00 in Tokyo.
const NOW=Z('2026-10-25T09:00:00Z');

// One top-level `const name=…;` line of a browser file, evaluated with RadixCrmDates in scope (closures not exported).
function grab(ctx,file,name){
 const line=read(file).split('\n').find(l=>l.startsWith('const '+name+'='));
 if(!line)throw new Error(name+' not found in '+file);
 return vm.runInContext('(()=>{'+line+'\n;return '+name+'})()',ctx);
}
async function worker(){
 const out={};
 const safe=(k,f)=>{try{out[k]=f()}catch(e){out[k]='ERROR '+e.message}};
 const D=require('../sales/crm-dates-core.js');
 const ctx=vm.createContext({console,Intl,Date,URLSearchParams});ctx.window=ctx;vm.runInContext(read('sales/crm-dates-core.js'),ctx);
 // Instants around the change: Rome 25/10 00:30 CEST, 01:30 CEST, 23:30 CET; Mon 26/10 00:30 CET.
 const T=['2026-10-24T22:30:00Z','2026-10-24T23:30:00Z','2026-10-25T22:30:00Z','2026-10-25T23:30:00Z'].map(Z);

 // Foglio chiamate: read-only times, the long date of the detail panel and the «oggi» filter (end of the Rome day).
 const S=require('../sales/crm-sheet-core.js');
 safe('sheetDateTime',()=>T.map(S.dateTime));
 safe('sheetLongDate',()=>T.map(S.longDate));
 safe('sheetToday',()=>{const rows=[['a',Z('2026-10-25T22:30:00Z')],['b',Z('2026-10-25T23:30:00Z')],['c',Z('2026-10-24T23:30:00Z')]]
  .map(([id,at])=>({id,name:id,todos:[{at}],nextAt:at,acts:[],overdue:false}));
  return S.apply(rows,{filters:{next:'today'}},NOW).map(r=>r.id)});
 safe('sheetHm',()=>{const hm=grab(ctx,'sales/crm-sheet.js','hm'),dShort=grab(ctx,'sales/crm-sheet.js','dShort');return T.map(t=>dShort(t)+' '+hm(t))});

 // «Oggi»: today's bounds, «domani alle 9», due labels, today's calendar items, the times on the screen.
 const O=require('../sales/crm-today-core.js');
 safe('todayBounds',()=>[NOW,...T].map(t=>{const b=O.dayBounds(t);return new Date(b.start).toISOString()+' '+new Date(b.end).toISOString()}));
 safe('todayTomorrowAt9',()=>[NOW,...T].map(O.tomorrowAt9));
 safe('todayDue',()=>['2026-10-25T08:30:00Z','2026-10-24T23:30:00Z','2026-10-24T21:30:00Z','2026-10-22T22:30:00Z'].map(d=>O.dueLabel(d,NOW)));
 safe('todayEvents',()=>{const ev=[
   {type:'meeting',title:'ieri sera a Roma',start:new Date(Z('2026-10-24T21:30:00Z'))},
   {type:'call',title:'stanotte a Roma',start:new Date(Z('2026-10-24T23:30:00Z'))},
   {type:'meeting',title:'stasera a Roma',start:new Date(Z('2026-10-25T22:30:00Z'))},
   {type:'call',title:'domani a Roma',start:new Date(Z('2026-10-25T23:30:00Z'))},
   // All-day items are dated at the browser's midnight of their date, as calendar-view.js does.
   {type:'close',title:'chiude oggi',start:new Date(2026,9,25),allDay:true},
   {type:'close',title:'chiude domani',start:new Date(2026,9,26),allDay:true}];
  return O.todayEvents(ev,NOW).map(e=>e.title)});
 safe('todayHm',()=>{const hm=grab(ctx,'sales/crm-today.js','hm');return T.map(t=>hm(new Date(t)))});

 // External calendars: an all-day busy event blocks its whole Rome day (25 October lasts 25 hours) and shows on that date.
 const FB=require('../sales/crm-freebusy-core.js');
 const ics=['BEGIN:VCALENDAR','BEGIN:VEVENT','UID:a','SUMMARY:Ferie','DTSTART;VALUE=DATE:20261025','DTEND;VALUE=DATE:20261026','END:VEVENT',
  'BEGIN:VEVENT','UID:b','SUMMARY:Fiera','DTSTART;VALUE=DATE:20261027','DTEND;VALUE=DATE:20261029','END:VEVENT','END:VCALENDAR'].join('\r\n');
 const from=Z('2026-10-24T00:00:00Z'),to=Z('2026-10-31T00:00:00Z');
 let rows=[];
 safe('busyRows',()=>{rows=FB.busy(ics,{from,to,zone:FB.DEFAULT_ZONE,details:true});return rows.map(r=>new Date(r.start).toISOString()+' '+new Date(r.end).toISOString())});
 safe('busySlots',()=>FB.freeSlots({busy:rows,zone:FB.DEFAULT_ZONE,now:Z('2026-10-24T06:00:00Z'),days:6,slot:60,buffer:0,hours:{start:'00:00',end:'23:59'},weekdays:[0,1,2,3,4,5,6],limit:200,perDay:48,step:30})
  .filter(s=>s.start>=Z('2026-10-25T20:00:00Z')&&s.start<Z('2026-10-26T01:00:00Z')).map(s=>new Date(s.start).toISOString()));
 const g={document:{createElement:()=>({}),addEventListener(){},dispatchEvent(){return true}},console,Intl,Date,Promise,setTimeout,clearTimeout,URLSearchParams,localStorage:{getItem:()=>null,setItem(){}},
  location:{search:'',origin:'http://localhost'},fetch:async()=>({ok:true,json:async()=>({rows})}),RadixCrmData:{workspace:()=>'11111111-1111-4111-8111-111111111111'},RadixSalesApp:{state:{me:7}}};
 g.window=g;const cctx=vm.createContext(g);
 for(const f of ['sales/crm-dates-core.js','sales/crm-freebusy-core.js','sales/crm-calendars.js'])vm.runInContext(read(f),cctx,{filename:f});
 try{g.RadixCrmCalendars.busyEvents(from,to);for(let i=0;i<20;i++)await new Promise(r=>setImmediate(r));
  const ymd=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  out.busyEvents=g.RadixCrmCalendars.busyEvents(from,to).map(e=>(e.allDay?'giorno ':'')+ymd(e.start)+' '+e.title);
 }catch(e){out.busyEvents='ERROR '+e.message}
 safe('sourceRead',()=>grab(cctx,'sales/crm-calendars.js','when')('2026-10-24T23:30:00Z'));

 // Panoramica: «Suggerimenti per oggi» and the task counts use the Rome day.
 const H=require('../sales/crm-home-core.js');
 const tasks=[{id:'t1',title:'Ieri sera',status:'todo',assignee_id:7,due_at:'2026-10-24T21:30:00Z'},{id:'t2',title:'Stanotte',status:'todo',assignee_id:7,due_at:'2026-10-24T23:30:00Z'},
  {id:'t3',title:'Stasera',status:'todo',assignee_id:7,due_at:'2026-10-25T22:30:00Z'},{id:'t4',title:'Domani',status:'todo',assignee_id:7,due_at:'2026-10-25T23:30:00Z'}];
 const opps=[{id:'o1',title:'Chiude ieri',outcome:'open',amount_cents:100,expected_close:'2026-10-24'},{id:'o2',title:'Chiude oggi',outcome:'open',amount_cents:100,expected_close:'2026-10-25'}];
 safe('homePulse',()=>H.pulse({tasks,interactions:[{title:'Chiamata',occurred_at:'2026-10-24T23:30:00Z'}]},{now:NOW}));
 safe('homeCollect',()=>H.collect({tasks,opportunities:opps},{now:NOW,me:7}).filter(x=>['task-due','close-overdue','close-soon'].includes(x.rule)).map(x=>x.rule+' '+x.title+': '+x.reason));

 // Attività: «Oggi», «Scaduta …», relative days and the time next to them.
 const el=()=>({children:[],style:{},append(){},prepend(){},setAttribute(){},addEventListener(){}});
 const doc={getElementById:id=>id==='content'?el():null,createElement:el,createTextNode:t=>({textContent:String(t)}),querySelectorAll:()=>[],documentElement:{classList:{add(){},remove(){},toggle(){}}}};
 const w={document:doc,MutationObserver:class{observe(){}},addEventListener(){},setTimeout(){},requestAnimationFrame(){},RadixCrmForecast:require('../sales/analytics-view.js'),console,Intl,Promise};
 w.window=w;const tctx=vm.createContext(w);vm.runInContext('Date.now=()=>'+NOW,tctx);
 vm.runInContext(read('sales/crm-dates-core.js'),tctx);vm.runInContext(read('sales/tasks-view.js'),tctx);
 safe('tasksRel',()=>T.map(t=>w.RadixCrmTasksView.rel(new Date(t))));
 safe('tasksGroups',()=>{const gr=w.RadixCrmTasksView.groups({tasks,opportunities:[]});return {today:gr.today.map(t=>t.id),due:gr.due.map(t=>t.id)}});

 // Liste: «Ultimo contatto» older than a year, and the dates and times of the cells.
 const L=require('../sales/crm-list-core.js');
 safe('listAgo',()=>L.ago(Z('2025-10-24T22:30:00Z'),NOW));
 safe('listCells',()=>['fullDate','shortDate'].map(n=>grab(ctx,'sales/crm-list.js',n)(Z('2026-10-24T22:30:00Z'))).concat(grab(ctx,'sales/crm-list.js','hhmm')(new Date(Z('2026-10-24T22:30:00Z')))));

 // The new helpers themselves.
 safe('dates',()=>T.map(t=>[D.dayOf(t),D.weekday(D.dayOf(t)),D.dateTimeLabel(t),D.hm(t),new Date(D.dayStart(t)).toISOString(),new Date(D.dayEnd(t)).toISOString()].join(' ')));
 process.stdout.write(JSON.stringify({tz:Intl.DateTimeFormat().resolvedOptions().timeZone,out}));
}

if(process.env.RADIX_SCREENS_TZ_WORKER){worker().catch(e=>{console.error(e);process.exit(1)});}
else{
 const test=require('node:test'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
 const run=tz=>JSON.parse(execFileSync(process.execPath,[__filename],{env:{...process.env,TZ:tz,RADIX_SCREENS_TZ_WORKER:'1'},encoding:'utf8'}));
 const ZONES=['Europe/Rome','America/New_York','Asia/Tokyo'];
 const results=Object.fromEntries(ZONES.map(tz=>[tz,run(tz)]));
 const EXPECTED={
  sheetDateTime:['25/10/2026 00:30','25/10/2026 01:30','25/10/2026 23:30','26/10/2026 00:30'],
  sheetLongDate:['domenica 25/10/2026, 00:30','domenica 25/10/2026, 01:30','domenica 25/10/2026, 23:30','lunedì 26/10/2026, 00:30'],
  sheetToday:['a','c'],// due by the end of Sunday in Rome (23:30 CET counts, 00:30 Monday does not); sorted by name
  sheetHm:['25/10/26 00:30','25/10/26 01:30','25/10/26 23:30','26/10/26 00:30'],
  todayBounds:[
   '2026-10-24T22:00:00.000Z 2026-10-25T23:00:00.000Z','2026-10-24T22:00:00.000Z 2026-10-25T23:00:00.000Z','2026-10-24T22:00:00.000Z 2026-10-25T23:00:00.000Z',
   '2026-10-24T22:00:00.000Z 2026-10-25T23:00:00.000Z','2026-10-25T23:00:00.000Z 2026-10-26T23:00:00.000Z'],
  todayTomorrowAt9:['2026-10-26T08:00:00Z','2026-10-26T08:00:00Z','2026-10-26T08:00:00Z','2026-10-26T08:00:00Z','2026-10-27T08:00:00Z'],
  todayDue:['Scaduta oggi · 09:30','Scaduta oggi · 01:30','Scaduta ieri · 23:30','Scaduta da 2 giorni · 00:30'],
  todayEvents:['stanotte a Roma','stasera a Roma','chiude oggi'],
  todayHm:['00:30','01:30','23:30','00:30'],
  busyRows:['2026-10-24T22:00:00.000Z 2026-10-25T23:00:00.000Z','2026-10-26T23:00:00.000Z 2026-10-28T23:00:00.000Z'],
  busySlots:['2026-10-25T23:00:00.000Z','2026-10-25T23:30:00.000Z','2026-10-26T00:00:00.000Z','2026-10-26T00:30:00.000Z'],
  busyEvents:['giorno 2026-10-25 Ferie','giorno 2026-10-27 Fiera','giorno 2026-10-28 Fiera'],
  sourceRead:'25 ott, 01:30',
  homePulse:{overdue:1,today:2,open:4,done:0,total:4,last:{title:'Chiamata',day:'25 ott'}},
  homeCollect:['close-overdue Chiude ieri: Chiusura prevista il 24 ott, ancora aperta (1 giorno fa).','close-soon Chiude oggi: Chiude il 25 ott (oggi) e non ha attività aperte.',
   'task-due Ieri sera: Scaduta da 1 giorno, assegnata a te.','task-due Stanotte: Scaduta oggi, assegnata a te.','task-due Stasera: In scadenza oggi, assegnata a te.'],
  tasksRel:['Oggi','Oggi','Oggi','Domani'],
  tasksGroups:{today:['t2','t3'],due:['t1','t2','t3']},
  listAgo:'25/10/2025',
  listCells:['25/10/2026, 00:30','25/10/2026','00:30'],
  dates:['2026-10-25 0 25/10/2026 00:30 00:30 2026-10-24T22:00:00.000Z 2026-10-25T23:00:00.000Z','2026-10-25 0 25/10/2026 01:30 01:30 2026-10-24T22:00:00.000Z 2026-10-25T23:00:00.000Z',
   '2026-10-25 0 25/10/2026 23:30 23:30 2026-10-24T22:00:00.000Z 2026-10-25T23:00:00.000Z','2026-10-26 1 26/10/2026 00:30 00:30 2026-10-25T23:00:00.000Z 2026-10-26T23:00:00.000Z']};

 for(const tz of ZONES)test('CRM screens in ora italiana with the browser in '+tz,()=>{
  const r=results[tz];assert.equal(r.tz,tz,'the child really runs in '+tz);
  for(const [k,v] of Object.entries(EXPECTED)){
   const got=k==='homeCollect'&&Array.isArray(r.out[k])?[...r.out[k]].sort():r.out[k],want=k==='homeCollect'?[...v].sort():v;
   assert.deepEqual(got,want,k+' in '+tz)}
 });

 test('same output in every zone',()=>{
  const base=JSON.stringify(results['Europe/Rome'].out);
  for(const tz of ZONES)assert.equal(JSON.stringify(results[tz].out),base,tz);
 });

 test('no browser-local wall clock left in the fixed helpers, and crm-dates-core.js loads first',()=>{
  const local=/\.(getHours|getMinutes|getDate|getDay|setHours|setDate)\(/;
  for(const [f,names] of [['sales/crm-sheet-core.js',['endOfDay','dateTime','longDate']],['sales/crm-sheet.js',['dShort','hm']],['sales/crm-today-core.js',['dayBounds','tomorrowAt9','dueLabel']],
   ['sales/crm-today.js',['hm']],['sales/crm-home-core.js',['localDay','midnight']],['sales/tasks-view.js',['DAY','hm','rel']],['sales/crm-list-core.js',['ago']]]){
   const s=read(f);for(const n of names){const line=s.split('\n').find(l=>new RegExp('^(const|function) '+n+'\\b').test(l));assert.ok(line,n+' in '+f);assert.ok(!local.test(line),f+' '+n+' uses the browser zone')}}
  for(const f of ['sales/crm-today.js','sales/crm-calendars.js','sales/crm-list.js','sales/crm-record.js','sales/crm-campaigns.js','sales/contacts-view.js','sales/dashboard-view.js','sales/tasks-view.js'])
   for(const l of read(f).split('\n'))if(/toLocale(Date|Time)?String\('it-IT',\{[^}]*(hour|day|weekday)/.test(l))assert.match(l,/toLocale(Date|Time)?String\('it-IT',\{[^}]*timeZone:'Europe\/Rome'/,f+': '+l.slice(0,120));
  const html=read('radix-sales.html'),i=s=>html.indexOf('src="'+s+'"');
  for(const f of ['sales/tasks-view.js','sales/crm-calendars.js','sales/crm-today-core.js','sales/crm-today.js','sales/crm-list-core.js','sales/crm-list.js','sales/crm-sheet-core.js','sales/crm-sheet.js','sales/crm-home-core.js'])
   assert.ok(i('sales/crm-dates-core.js')>0&&i('sales/crm-dates-core.js')<i(f),'crm-dates-core.js loads before '+f);
 });
}
