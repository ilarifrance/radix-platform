'use strict';
// «Slot liberi» in ora italiana whatever the browser's zone: the real slotPicker (sales/crm-calendars.js) runs in a
// child node with TZ=Europe/Rome, America/New_York and Asia/Tokyo; each picked value goes through the three consumers
// (editor «Modifica / Crea» of sales.js, record forms of crm-record-core.js, «Registra chiamata» of crm-sheet-core.js)
// and every zone must give the same labels, the same values and the same UTC instants.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
// Friday 23 October 2026, 08:00 in Rome (06:00Z). A CRM task holds 09:00–09:30. Sunday 25 the clocks go back (CEST → CET).
const NOW=Date.parse('2026-10-23T06:00:00Z');

async function worker(){
 class N{
  constructor(tag){this.tagName=String(tag).toUpperCase();this.children=[];this.attrs={};this._text='';this.className='';
   const self=this;this.classList={add:(...c)=>{self.className=(self.className+' '+c.join(' ')).trim()}};}
  append(...n){for(const x of n)if(x!=null)this.children.push(x)}
  replaceChildren(...n){this.children=[];this.append(...n)}
  set textContent(v){this._text=String(v);this.children=[]}
  get textContent(){return this._text+this.children.map(c=>c.textContent).join('')}
  setAttribute(k,v){this.attrs[k]=String(v)}getAttribute(k){return this.attrs[k]??null}
  querySelectorAll(sel){const out=[];const walk=n=>{for(const c of n.children){if(c.tagName===sel.toUpperCase())out.push(c);walk(c)}};walk(this);return out}
 }
 const data={tasks:[{id:'t1',title:'Chiamare Rossi',status:'todo',due_at:'2026-10-23T07:00:00Z',assignee_id:7}],interactions:[]};
 const g={document:{createElement:t=>new N(t),addEventListener(){},dispatchEvent(){return true}},location:{search:'',origin:'http://localhost'},console,Promise,Intl,setTimeout,clearTimeout,URLSearchParams,
  RadixSalesApp:{state:{me:7}},RadixCrmData:{workspace:()=>null,load:()=>Promise.resolve(data)}};
 g.window=g;const ctx=vm.createContext(g);vm.runInContext('Date.now=()=>'+NOW,ctx);
 for(const f of ['sales/crm-dates-core.js','sales/crm-freebusy-core.js','sales/crm-calendars.js'])vm.runInContext(read(f),ctx,{filename:f});
 const picked=[];const box=g.RadixCrmCalendars.slotPicker({onPick:v=>picked.push(v)});
 for(let i=0;i<20;i++)await new Promise(r=>setImmediate(r));
 const buttons=box.querySelectorAll('button').filter(b=>!/min$/.test(b.textContent));
 for(const b of buttons)b.onclick();
 const D=require('../sales/crm-dates-core.js'),R=require('../sales/crm-record-core.js'),S=require('../sales/crm-sheet-core.js');
 const rec={id:'22222222-2222-4222-8222-222222222222',name:'Giulia Rossi',company_id:'11111111-1111-4111-8111-111111111111'};
 const row={id:rec.id,name:rec.name,record:rec};
 const consumers=picked.map(v=>{
  // sales.js editor: onPick → D.fromInput → D.toInput is the field value; saving reads it back with D.keep / D.fromInput.
  const field=D.toInput(D.fromInput(v).value);
  return {v,
   editor:{field,saved:D.keep(null,field).value},
   record:{meeting:R.composerPlan('meeting',{title:'Demo',when:v},'contacts',rec,NOW,[]).data.occurred_at,task:R.composerPlan('task',{title:'Richiamare',due:v},'contacts',rec,NOW,[]).data.due_at},
   sheet:S.callPlan(row,{outcome:'callback',note:'',follow:v},NOW,7).task.due_at}});
 const defaults={recordNow:R.localInput(NOW),sheetTomorrow:S.tomorrowAt9(NOW),sheetTomorrowSaturdayNight:S.tomorrowAt9(Date.parse('2026-10-24T22:30:00Z')),
  gap:S.localDateTime('2026-03-29T02:30'),zones:[D.ZONE,g.RadixFreeBusy.DEFAULT_ZONE]};
 process.stdout.write(JSON.stringify({tz:Intl.DateTimeFormat().resolvedOptions().timeZone,labels:buttons.map(b=>b.textContent),consumers,defaults}));
}

if(process.env.RADIX_SLOT_TZ_WORKER){worker().catch(e=>{console.error(e);process.exit(1)});}
else{
 const test=require('node:test'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
 const run=tz=>JSON.parse(execFileSync(process.execPath,[__filename],{env:{...process.env,TZ:tz,RADIX_SLOT_TZ_WORKER:'1'},encoding:'utf8'}));
 const ZONES=['Europe/Rome','America/New_York','Asia/Tokyo'];
 const results=Object.fromEntries(ZONES.map(tz=>[tz,run(tz)]));
 const SLOTS=[// Rome wall clock → UTC: CEST (+2) until Sunday 25, CET (+1) from Monday 26.
  ['ven 23/10 · 09:30','2026-10-23T09:30','2026-10-23T07:30:00Z'],['ven 23/10 · 10:00','2026-10-23T10:00','2026-10-23T08:00:00Z'],['ven 23/10 · 10:30','2026-10-23T10:30','2026-10-23T08:30:00Z'],
  ['lun 26/10 · 09:00','2026-10-26T09:00','2026-10-26T08:00:00Z'],['lun 26/10 · 09:30','2026-10-26T09:30','2026-10-26T08:30:00Z'],['lun 26/10 · 10:00','2026-10-26T10:00','2026-10-26T09:00:00Z'],
  ['mar 27/10 · 09:00','2026-10-27T09:00','2026-10-27T08:00:00Z'],['mar 27/10 · 09:30','2026-10-27T09:30','2026-10-27T08:30:00Z']];

 for(const tz of ZONES)test('«Slot liberi» in ora italiana with the browser in '+tz,()=>{
  const r=results[tz];assert.equal(r.tz,tz,'the child really runs in '+tz);
  assert.deepEqual(r.labels,SLOTS.map(s=>s[0]),'working hours 09:00–18:00 and labels in Rome time; 09:00 Friday is the CRM task');
  assert.deepEqual(r.consumers.map(c=>c.v),SLOTS.map(s=>s[1]),'onPick gets the Rome datetime-local value');
  r.consumers.forEach((c,i)=>{const utc=SLOTS[i][2];
   assert.equal(c.editor.field,c.v,'editor (sales.js): the field shows the slot as picked');
   assert.equal(c.editor.saved,utc,'editor saves the same instant');
   assert.equal(c.record.meeting,utc,'record page «Evento» saves the same instant');
   assert.equal(c.record.task,utc,'record page «Attività» saves the same instant');
   assert.equal(c.sheet,utc,'«Registra chiamata» creates the next activity at the same instant');
  });
  assert.deepEqual(r.defaults.zones,['Europe/Rome','Europe/Rome'],'one zone for slots and dates');
  assert.equal(r.defaults.recordNow,'2026-10-23T08:00','record form default «adesso» in Rome time');
  assert.equal(r.defaults.sheetTomorrow,'2026-10-24T09:00','«Richiamare» default: tomorrow 9:00 in Rome');
  assert.equal(r.defaults.sheetTomorrowSaturdayNight,'2026-10-26T09:00','after midnight in Rome (00:30 Sunday 25) tomorrow is Monday 26, across the clock change');
  assert.equal(r.defaults.gap,null,'an hour that does not exist in Rome (29 March, 02:30) is refused');
 });

 test('same labels, values and instants in every zone',()=>{
  const base=JSON.stringify({...results['Europe/Rome'],tz:''});
  for(const tz of ZONES)assert.equal(JSON.stringify({...results[tz],tz:''}),base,tz);
 });

 test('the consumers read the slot value with the Rome helpers (no browser-local Date parsing)',()=>{
  assert.match(read('sales/sales.js'),/C\.slotPicker\(\{onPick:p=>\{const r=D\.fromInput\(p\);if\(!r\.value\)return;input\.value=D\.toInput\(r\.value\);/);
  assert.ok(read('sales/crm-sheet.js').includes('RadixCrmCalendars.slotPicker({onPick:v=>{when.value=v;fcb.checked=true}})'));
  const cal=read('sales/crm-calendars.js');
  assert.ok(!/getHours\(\)|getDay\(\)|getDate\(\)/.test(cal.slice(cal.indexOf('/* ---------- Working hours'))),'no browser-local wall clock in the slot picker');
  const html=read('radix-sales.html'),i=s=>html.indexOf(s);
  for(const f of ['sales/crm-record-core.js','sales/crm-sheet-core.js','sales/crm-calendars.js'])assert.ok(i('sales/crm-dates-core.js')>0&&i('sales/crm-dates-core.js')<i(f),'crm-dates-core.js loads before '+f);
 });
}
