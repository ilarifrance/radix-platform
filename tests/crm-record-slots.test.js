'use strict';
// «Slot liberi» in the record page (crm-record.js › Registra un’attività): the same picker as the Foglio chiamate
// (RadixCrmCalendars.slotPicker), run here in a small fake DOM with the real scripts.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const core=require('../sales/crm-record-core.js');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const W='5b1d2c3e-4f50-4a61-8b72-9c83d4e5f601',C1='22222222-2222-4222-8222-222222222222',K1='11111111-1111-4111-8111-111111111111';
// Monday 19 October 2026, 08:00 in Rome: the first free slot of the day is 09:00 (07:00Z).
const NOW=Date.parse('2026-10-19T06:00:00Z');

test('slotField: only Chiamata, Evento and Attività, only for who can save',()=>{
 assert.equal(core.slotField('call',true),'when');assert.equal(core.slotField('meeting',true),'when');assert.equal(core.slotField('task',true),'due');
 assert.equal(core.slotField('email',true),null,'an email is already sent: no slots');
 for(const t of ['call','meeting','task'])assert.equal(core.slotField(t,false),null,t+' read-only');
 assert.equal(core.slotField('task'),null,'undefined permission = no slots');assert.equal(core.slotField('toString',true),null);
});

test('a picked slot is a valid date for the composer (local value → UTC)',()=>{
 const rec={id:C1,name:'Giulia Rossi',company_id:K1};
 const v=core.localInput(Date.parse('2026-10-20T08:30:00Z'));
 const m=core.composerPlan('meeting',{when:v},'contacts',rec,NOW,[]);assert.equal(m.error,null);assert.equal(m.data.occurred_at,'2026-10-20T08:30:00Z');
 const t=core.composerPlan('task',{title:'Richiamare',due:v},'contacts',rec,NOW,[]);assert.equal(t.data.due_at,'2026-10-20T08:30:00Z');
});

/* ---------- a minimal DOM, enough for crm-record.js and crm-calendars.js ---------- */
class Node_{
 constructor(tag){this.tagName=String(tag).toUpperCase();this.children=[];this.attrs={};this.dataset={};this.style={};this._text='';this.listeners={};this.parentNode=null;this.isConnected=true;this.value='';
  const self=this;this.classList={add:(...c)=>{for(const x of c)if(!self.classes().includes(x))self.className=(self.className+' '+x).trim()},contains:c=>self.classes().includes(c),toggle(){},remove:(...c)=>{self.className=self.classes().filter(x=>!c.includes(x)).join(' ')}};this.className=''}
 classes(){return String(this.className||'').split(/\s+/).filter(Boolean)}
 append(...n){for(let x of n){if(x==null)continue;if(typeof x==='string'){const t=new Node_('#text');t._text=x;x=t}x.parentNode=this;this.children.push(x)}}
 prepend(...n){const keep=this.children;this.children=[];this.append(...n);this.children.push(...keep)}
 replaceChildren(...n){this.children=[];this._text='';this.append(...n)}
 set textContent(v){this._text=String(v);this.children=[]}
 get textContent(){return this._text+this.children.map(c=>c.textContent).join('')}
 setAttribute(k,v){this.attrs[k]=String(v)}getAttribute(k){return this.attrs[k]??null}
 addEventListener(t,f){(this.listeners[t]||(this.listeners[t]=[])).push(f)}
 dispatchEvent(e){for(const f of this.listeners[e.type]||[])f(e);return true}
 click(){if(this.disabled)return;if(this.onclick)this.onclick({type:'click'});this.dispatchEvent({type:'click',preventDefault(){}})}
 all(){const out=[];const walk=n=>{for(const c of n.children){out.push(c);walk(c)}};walk(this);return out}
 querySelectorAll(sel){return this.all().filter(n=>sel.startsWith('.')?n.classList.contains(sel.slice(1)):n.tagName===sel.toUpperCase())}
 querySelector(sel){return this.querySelectorAll(sel)[0]||null}
}
function env({writable=true,sources=[]}={}){
 const calls=[];
 const reply=b=>({ok:true,status:200,json:async()=>b});
 const fetch=async url=>{url=String(url);calls.push(url);
  if(url.includes('entity=calendar_busy'))return reply({rows:[]});
  if(url.includes('entity=calendar_sources'))return reply({rows:sources});
  if(url.includes('/api/integrations/status'))return reply({items:[]});
  throw new Error('unexpected fetch '+url)};
 const document={createElement:t=>new Node_(t),dispatchEvent(){return true},addEventListener(){},querySelector:()=>null,getElementById:()=>null};
 const data={tasks:[{id:'t1',title:'Chiamare Rossi',status:'todo',due_at:'2026-10-19T07:00:00Z',assignee_id:7}],interactions:[]};
 const app={state:{workspace:W,me:7,busy:false,ready:true},writable:()=>writable,rows:e=>e==='members'?[{id:7,name:'Marco'}]:[],error(){},notice(){}};
 const g={document,fetch,console,setTimeout,clearTimeout,setInterval,clearInterval,Promise,Event,CustomEvent,URLSearchParams,Intl,
  location:{search:'',origin:'http://localhost',href:'http://localhost/radix-sales.html',pathname:'/radix-sales.html',hash:''},history:{replaceState(){}},
  Option:function(t,v){const o=new Node_('option');o.textContent=t;o.value=v;return o},
  RadixSalesApp:app,RadixCrmData:{workspace:()=>W,load:()=>Promise.resolve(data)}};
 g.window=g;const ctx=vm.createContext(g);
 vm.runInContext('Date.now=()=>'+NOW,ctx);
 for(const f of ['sales/crm-dates-core.js','sales/crm-freebusy-core.js','sales/crm-record-core.js','sales/crm-calendars.js','sales/crm-record.js'])vm.runInContext(read(f),ctx,{filename:f});
 return {g,calls,mount(){const panel=new Node_('div');g.RadixCrmRecord.mount(panel,{subject:'contacts',id:C1,title:'Giulia Rossi',rows:[{entity:'contacts',record:{id:C1,name:'Giulia Rossi',company_id:K1}}]});return panel}};
}
const tick=async()=>{for(let i=0;i<10;i++)await new Promise(r=>setImmediate(r))};
const tab=(panel,name)=>panel.querySelector('.crm-rec-tabs').children.find(b=>b.textContent===name);

test('record page: Chiamata, Evento and Attività show «Slot liberi»; a click fills the date; email does not',async()=>{
 const e=env();const panel=e.mount();await tick();
 assert.equal(panel.querySelectorAll('.cs-slots').length,0,'Email tab: no slots');
 for(const [name,field] of [['Chiamata','when'],['Evento','when'],['Attività','due']]){
  tab(panel,name).click();await tick();
  const box=panel.querySelector('.cs-slots');assert.ok(box,name+' has slots');assert.ok(box.classList.contains('crm-rec-slots'));
  assert.match(box.textContent,/Slot liberi/);
  assert.match(panel.querySelector('.cs-slots-note').textContent,/Solo gli impegni del CRM: collega Outlook e Google/,'without external calendars it says so');
  const buttons=panel.querySelector('.cs-slots-list').querySelectorAll('button');assert.ok(buttons.length>0,name+' lists slots');
  const input=panel.querySelectorAll('input').find(i=>i.name===field);let changed=0;input.addEventListener('change',()=>changed++);
  buttons[0].click();
  assert.match(input.value,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  assert.equal(core.localToUtc(input.value),'2026-10-19T07:30:00Z',name+': 09:00 is taken by the CRM task, so 09:30 Rome');
  assert.equal(changed,1);assert.equal(buttons[0].getAttribute('aria-pressed'),'true');
 }
 assert.equal(e.calls.filter(u=>u.includes('calendar_busy')).length,1,'redrawn pickers reuse the busy time already read');
});

test('record page: nothing for who cannot write, and no calendar request',async()=>{
 const e=env({writable:false});const panel=e.mount();await tick();
 assert.equal(panel.querySelectorAll('.cs-slots').length,0);assert.match(panel.textContent,/Sola lettura/);
 assert.equal(e.calls.filter(u=>u.includes('calendar_')).length,0);
});

test('record page: with an external calendar linked, the note counts it',async()=>{
 const e=env({sources:[{id:'s1',label:'Outlook lavoro',host:'outlook.office365.com',status:'ok'}]});const panel=e.mount();await tick();
 tab(panel,'Evento').click();await tick();
 assert.match(panel.querySelector('.cs-slots-note').textContent,/Esclusi gli impegni del CRM e di 1 calendario esterno · 09:00–18:00/);
});

test('wiring: crm-record.js reuses the calendar module, no copy of the slot logic',()=>{
 const js=read('sales/crm-record.js');
 assert.ok(js.includes('C.slotPicker({onPick:'));assert.ok(js.includes('core.slotField(tab,canWrite)'));
 assert.ok(!/freeSlots|crmBusy|workHours/.test(js),'the slot computation stays in crm-calendars.js / crm-freebusy-core.js');
 const html=read('radix-sales.html');assert.ok(html.indexOf('sales/crm-calendars.js')<html.indexOf('sales/crm-record.js'));
});
