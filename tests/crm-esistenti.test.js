'use strict';
// Bugs already in the RC: tasks without a due date, the LinkedIn workspace UUID check,
// and won/lost deals counted as open pipeline in Panoramica and Attività.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const forecast=require('../sales/analytics-view.js');
const src=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

// Just enough DOM for the views' E() helper and their text output.
function node(tag){return{tag,children:[],textContent:'',className:'',style:{},href:'',
  append(...n){this.children.push(...n)},prepend(...n){this.children.unshift(...n)},setAttribute(){},addEventListener(){}}}
const text=n=>n?[n.textContent,...(n.children||[]).map(text)].filter(Boolean).join(' '):'';
function view(file){
  const document={getElementById:id=>id==='content'?node('div'):null,createElement:node,createTextNode:t=>({textContent:String(t)}),
    querySelectorAll:()=>[],documentElement:{classList:{add(){},remove(){},toggle(){}}}};
  const win={document,MutationObserver:class{observe(){}},addEventListener(){},setTimeout(){},requestAnimationFrame(){},RadixCrmForecast:forecast};
  // radix-sales.html loads sales/crm-dates-core.js (ora italiana) before the views.
  win.window=win;vm.createContext(win);freeze(win);vm.runInContext(src('sales/crm-dates-core.js'),win);vm.runInContext(src(file),win);return win}

// A fixed «now» for the views and the fixtures alike (process.env.CRM_TEST_NOW overrides it): with the real clock,
// «2 giorni fa» became «Ieri» late in the evening, when now−48 h and today fall on Rome days that are not two apart.
const NOW=Date.parse(process.env.CRM_TEST_NOW||'2026-10-14T10:00:00Z');
function freeze(win){vm.runInContext('(()=>{const R=Date,N='+NOW+';globalThis.Date=class extends R{constructor(...a){if(a.length)super(...a);else super(N)}static now(){return N}}})()',win)}
const DAY=864e5,iso=d=>new Date(NOW+d*DAY).toISOString(),date=d=>iso(d).slice(0,10);
const data=()=>({
  members:[{id:1,name:'Giulia Bianchi'}],companies:[{id:'c1',name:'Aurora'}],stages:[{id:'s1',process_id:'p1',position:1,title:'Proposta'}],interactions:[],
  contacts:[{id:'k1',name:'Anna Neri'},{id:'k2',name:'Luca Galli'},{id:'k3',name:'Paolo Conti'}],
  opportunities:[
    {id:'o1',title:'Aperta',amount_cents:100000,outcome:'open',expected_close:date(-2),contact_id:'k1',stage_id:'s1',process_id:'p1',owner_id:1,company_id:'c1'},
    {id:'o2',title:'Senza esito',amount_cents:50000,outcome:null,expected_close:date(5),contact_id:'k3',stage_id:'s1',process_id:'p1',owner_id:1,company_id:'c1'},
    {id:'o3',title:'Rinnovo vinto',amount_cents:900000,outcome:'won',expected_close:date(-3),contact_id:'k2',stage_id:'s1',process_id:'p1',owner_id:1,company_id:'c1'},
    {id:'o4',title:'Pilota perso',amount_cents:700000,outcome:'lost',expected_close:date(3),contact_id:'k2',stage_id:'s1',process_id:'p1',owner_id:1,company_id:'c1'}],
  tasks:[
    {id:'t1',title:'Senza scadenza',due_at:null,status:'todo',priority:'low'},
    {id:'t2',title:'Scaduta',due_at:iso(-2),status:'todo',priority:'high'},
    {id:'t3',title:'Vuota',due_at:'',status:'doing'},
    {id:'t4',title:'Fatta',due_at:null,status:'done'}]});

test('Attività: a task without due date goes to «Senza data», not «In scadenza», and has no age',()=>{
  const {groups,dd,rel}=view('sales/tasks-view.js').RadixCrmTasksView;
  assert.equal(dd(null),null);assert.equal(dd(''),null);assert.equal(dd(undefined),null);
  const g=groups(data());
  assert.deepEqual(g.due.map(t=>t.id),['t2']);
  assert.deepEqual(g.nodate.map(t=>t.id),['t1','t3']);
  assert.equal(g.today.length,0);assert.equal(g.week.length,0);
  assert.equal(rel(dd(iso(-2))),'2 giorni fa');
});

test('Panoramica: a task without due date is not counted as due today',()=>{
  const {model}=view('sales/dashboard-view.js').RadixCrmDashboardView;
  assert.deepEqual(model(data()).due.map(t=>t.id),['t2']);
});

test('Panoramica: won and lost deals are not open pipeline nor «a rischio»',()=>{
  const {model}=view('sales/dashboard-view.js').RadixCrmDashboardView;
  const m=model(data());
  assert.deepEqual(m.opps.map(o=>o.id),['o1','o2']);
  assert.equal(m.total,150000);
  assert.deepEqual(m.risk.map(r=>r.o.id).sort(),['o1','o2']);
  assert.equal(m.board[0].v,150000);
  assert.ok(m.in30.every(o=>forecast.isOpen(o)));
});

test('Attività: «Da richiamare» and the briefing ignore won and lost deals',()=>{
  const {groups,recall,rail}=view('sales/tasks-view.js').RadixCrmTasksView;
  const d=data(),r=text(recall(d));
  assert.match(r,/Anna Neri/);assert.match(r,/Paolo Conti/);
  assert.doesNotMatch(r,/Luca Galli|Rinnovo vinto|Pilota perso/);
  const b=text(rail(d,groups(d)));
  assert.match(b,/Pipeline nel CRM: 1500\s?€|Pipeline nel CRM: €\s?1500|Pipeline nel CRM: 1\.500\s?€|Pipeline nel CRM: €\s?1\.500/);
  assert.match(b,/2 trattative chiudono entro 14 giorni senza attività/);
});

test('Panoramica and Attività reuse the shared open rule from analytics-view.js',()=>{
  for(const f of ['sales/dashboard-view.js','sales/tasks-view.js'])assert.match(src(f),/window\.RadixCrmForecast\.isOpen\(o\)/);
});

test('LinkedIn: a real-format workspace UUID fills the workspace menu',async()=>{
  const WS='5b1d2c3e-4f50-4a61-8b72-9c83d4e5f601',els={};
  const el=id=>els[id]||(els[id]={id,value:'',textContent:'',options:[],replaceChildren(){this.options=[];this.value=''},append(o){this.options.push(o)}});
  const responses={lead_workspaces:{rows:[{id:WS,name:'Demo',role:'owner'},{id:'non-un-uuid',name:'Rotto',role:'owner'}]},lead_growth_projects:{rows:[]},lead_provider_status:{configured:false}};
  const fetch=async url=>{const e=new URL(url,'http://x').searchParams.get('entity');return{ok:true,json:async()=>responses[e]||{}}};
  const win={document:{getElementById:el,createElement:()=>({value:'',textContent:''})},fetch,URL,URLSearchParams,location:{search:''},sessionStorage:{setItem(){}},RadixSalesnavSource:{}};
  win.window=win;vm.createContext(win);vm.runInContext(src('sales/linkedin-hub.js'),win);
  for(let i=0;i<20;i++)await new Promise(r=>setImmediate(r));
  assert.deepEqual(els['linkedin-workspace'].options.map(o=>o.value),['',WS]);
  const sel=els['linkedin-workspace'];sel.value=WS;await sel.onchange();
  assert.equal(els['linkedin-key'].textContent,'Non configurata');
  assert.doesNotMatch(els['linkedin-connection-status'].textContent,/Seleziona un workspace/);
});
