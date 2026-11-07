'use strict';
// Fixes from the pre-demo check of the CRM (Demo · UK workspace): numbers that were wrong on screen,
// a link to a concept page, internal notes on the Pipeline page, the amount typed in cents.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

function node(tag){return{tag,children:[],textContent:'',className:'',style:{},href:'',
  append(...n){this.children.push(...n)},prepend(...n){this.children.unshift(...n)},setAttribute(){},addEventListener(){}}}
function view(file){
  const document={getElementById:id=>id==='content'?node('div'):null,createElement:node,createTextNode:t=>({textContent:String(t)}),
    querySelectorAll:()=>[],documentElement:{classList:{add(){},remove(){},toggle(){}}}};
  const win={document,MutationObserver:class{observe(){}},addEventListener(){},setTimeout(){},requestAnimationFrame(){},RadixCrmForecast:require('../sales/analytics-view.js')};
  win.window=win;vm.createContext(win);vm.runInContext(src('sales/crm-dates-core.js'),win);vm.runInContext(src(file),win);return win}

test('Panoramica › Pipeline per mese: one axis for both lines, up to the cumulative total',()=>{
  const {trendMax}=view('sales/dashboard-view.js').RadixCrmDashboardView;
  // Demo · UK: Nov 36.200, Dec 64.200, Jan 65.100, Feb 72.100 → the «Cumulato» line ends at 237.600, not at 72.100.
  assert.equal(trendMax([{value:0},{value:3620000},{value:6420000},{value:6510000},{value:7210000},{value:0}]),23760000);
  assert.equal(trendMax([]),1,'empty: never a zero scale');
  assert.equal(trendMax([{value:0},{value:0}]),1);
  assert.doesNotMatch(src('sales/dashboard-view.js'),/cum\.map\(v=>v\/cmax\*max\)/,'the cumulative line is no longer rescaled');
});

test('Sales Orbit: a task without due date is not «già scaduta» nor «in scadenza»',()=>{
  const line=src('sales/orbit-universe.js').split('\n').find(l=>l.startsWith('const day='));
  const day=vm.runInNewContext('('+line.replace(/^const day=/,'').replace(/;\s*$/,'')+')');
  assert.equal(day(null),null);assert.equal(day(''),null);assert.equal(day(undefined),null);
  assert.equal(day('nonsense'),null);
  assert.equal(day('2026-10-21T12:00:00.000Z').toISOString(),'2026-10-21T12:00:00.000Z');
});

test('Pipeline: dates as 15/12/2026, today in the local day, weighted value with the stage probability as fallback',()=>{
  const P=require('../sales/pipeline-premium.js');
  assert.equal(P.dateLabel('2026-12-15'),'15/12/2026');assert.equal(P.dateLabel(''),'');assert.equal(P.dateLabel(null),'');assert.equal(P.dateLabel('15/12/2026'),'15/12/2026');
  assert.equal(P.localDay(new Date(2026,9,26,0,30)),'2026-10-26');
  const stages=[{id:'s1',probability:40},{id:'s2'}];
  assert.equal(P.weighted([
    {id:'a',amount_cents:1000000,probability:80,stage_id:'s1',outcome:'open'},   // own 80% → 8.000
    {id:'b',amount_cents:500000,probability:null,stage_id:'s1',outcome:'open'},  // stage 40% → 2.000
    {id:'c',amount_cents:500000,stage_id:'s2',outcome:'open'},                   // no probability → 0
    {id:'d',amount_cents:900000,probability:100,stage_id:'s1',outcome:'won'}],stages),1000000);
});

test('Pipeline page: no internal notes on screen; the Regia reads the weighted value',()=>{
  const html=src('sales-pipeline-premium.html');
  for(const s of ['Higgsfield','Nessun dato demo','snapshot','Offset','in validazione','Non un totale globale'])assert.ok(!html.includes(s),s);
  assert.ok(html.includes('id="weighted"'));assert.ok(!html.includes('id="coverage"'));
  assert.doesNotMatch(src('sales/pipeline-premium.js'),/valuta non modellata|snapshot non garantito|\$\('coverage'\)/);
  assert.match(src('lib/regia-sales.js'),/\['Valore ponderato','weighted'\]/);
});

test('Attività › «Visualizza calendario completo» opens the CRM calendar, not the concept page',()=>{
  const s=src('sales/tasks-view.js');
  assert.ok(s.includes("a.href='/radix-sales.html#calendar'"));assert.ok(!s.includes('sales-workspace.html#calendar'));
});

test('Opportunità editor: the amount is typed in currency units, not in cents',()=>{
  const s=src('sales/sales.js');
  assert.ok(!s.includes('Importo in centesimi'));
  assert.match(s,/key==='amount_cents'&&RF\)\{const n=RF\.euroToCents\(value\)/);
  const F=require('../sales/crm-fields-core.js');
  assert.equal(F.euroToCents('24.000'),2400000);assert.equal(F.euroToCents('24.000,50'),2400050);
  assert.equal(F.euroToCents('£24,000'),2400000,'a pound sign is accepted too');assert.equal(F.euroToCents('GBP 1.500'),150000);
  assert.equal(F.centsToEuro(2440000),'24400','the edit form shows the stored amount in units');
});

test('Copilota and Regia buttons do not overlap in the corner',()=>{
  const css=src('sales/crm-copilot.css');
  assert.match(css,/html\[data-rx-regia\] \.cc-fab\{bottom:72px\}/);
});

test('LinkedIn page: no competitor reference nor hosting notes',()=>{
  const html=src('sales-linkedin.html');
  assert.ok(!html.includes('LydGen'));assert.ok(!html.includes('variabili Vercel Preview'));
});
