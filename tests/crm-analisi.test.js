'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const A=require('../sales/crm-analisi-core.js');
const NOW=Date.parse('2026-10-19T10:00:00Z');

test('period ranges: month, quarter, year, custom, in Italian time',()=>{
 assert.deepEqual(A.periodRange('month',NOW),{kind:'month',from:'2026-10-01',to:'2026-10-31',days:31});
 assert.deepEqual(A.periodRange('quarter',NOW),{kind:'quarter',from:'2026-10-01',to:'2026-12-31',days:92});
 assert.deepEqual(A.periodRange('year',NOW),{kind:'year',from:'2026-01-01',to:'2026-12-31',days:365});
 assert.deepEqual(A.periodRange('custom',NOW,{from:'2026-02-10',to:'2026-03-01'}),{kind:'custom',from:'2026-02-10',to:'2026-03-01',days:20});
 assert.equal(A.periodRange('custom',NOW,{from:'2026-03-02',to:'2026-03-01'}),null);
 assert.equal(A.periodRange('custom',NOW,{from:'2026-02-30',to:'2026-03-01'}),null);
 assert.equal(A.periodRange('week',NOW),null);
 // 23:30 UTC on 31 Dec is already 1 Jan in Rome
 assert.equal(A.periodRange('year',Date.parse('2026-12-31T23:30:00Z')).from,'2027-01-01');
 assert.equal(A.romeDay('2026-10-31T23:30:00Z'),'2026-11-01');assert.equal(A.romeDay('2026-10-31'),'2026-10-31');assert.equal(A.romeDay('boh'),'');assert.equal(A.romeDay(null),'');
});

test('previous period and months in the period',()=>{
 assert.deepEqual(A.previousRange(A.periodRange('month',NOW)),{kind:'month',from:'2026-09-01',to:'2026-09-30',days:30});
 assert.deepEqual(A.previousRange(A.periodRange('quarter',Date.parse('2026-02-01T10:00:00Z'))),{kind:'quarter',from:'2025-10-01',to:'2025-12-31',days:92});
 assert.deepEqual(A.previousRange(A.periodRange('year',NOW)),{kind:'year',from:'2025-01-01',to:'2025-12-31',days:365});
 assert.deepEqual(A.previousRange({kind:'custom',from:'2026-03-01',to:'2026-03-10',days:10}),{kind:'custom',from:'2026-02-19',to:'2026-02-28',days:10});
 assert.deepEqual(A.monthsIn(A.periodRange('quarter',NOW)),['2026-10','2026-11','2026-12']);
 assert.equal(A.monthsIn({from:'2020-01-01',to:'2026-12-31'}).length,24);
 assert.ok(A.inRange('2026-10-31T23:30:00Z',A.periodRange('month',NOW))===false,'late evening of the 31st in UTC is November in Rome');
});

const stages=[{id:'s1',process_id:'p',title:'Qualifica',position:1,probability:20},{id:'s2',process_id:'p',title:'Proposta',position:2,probability:null}];
const opp=(id,o)=>({id,process_id:'p',stage_id:'s1',outcome:'open',...o});
const data={stages,members:[{id:1,name:'Anna'},{id:2,name:'Luca'}],
 opportunities:[
  opp('a',{amount_cents:100000,expected_close:'2026-10-05',owner_id:1}),                 // in, stage 20%
  opp('b',{amount_cents:50000,expected_close:'2026-11-20',stage_id:'s2',probability:50,owner_id:2}), // in, own 50%
  opp('c',{amount_cents:70000,expected_close:'2026-11-02',stage_id:'s2',owner_id:1}),   // in, no probability
  opp('d',{amount_cents:90000,expected_close:'2027-02-01'}),                            // other period
  opp('e',{amount_cents:10000}),                                                         // no date
  opp('w1',{outcome:'won',amount_cents:30000,created_at:'2026-09-01T10:00:00Z',closed_at:'2026-10-11T10:00:00Z',owner_id:1}), // 40 days
  opp('w2',{outcome:'won',amount_cents:20000,created_at:'2026-10-01T10:00:00Z',closed_at:'2026-10-21T10:00:00Z',owner_id:2}), // 20 days
  opp('l1',{outcome:'lost',amount_cents:5000,lost_reason:'Prezzo',closed_at:'2026-11-03T10:00:00Z'}),
  opp('l2',{outcome:'lost',amount_cents:5000,lost_reason:' ',closed_at:'2026-12-03T10:00:00Z'}),
  opp('l3',{outcome:'lost',amount_cents:5000,lost_reason:'Prezzo',closed_at:'2026-12-04T10:00:00Z'}),
  opp('w0',{outcome:'won',amount_cents:10000,closed_at:'2026-08-15T10:00:00Z'}),        // previous quarter
 ],
 tasks:[{id:'t1',due_at:'2026-10-02T09:00:00Z',status:'done',opportunity_id:'a'},{id:'t2',due_at:'2026-10-10T09:00:00Z',status:'todo'},{id:'t3',due_at:'2026-12-10T09:00:00Z',status:'todo'},{id:'t4',status:'todo'}],
 interactions:[{kind:'call',occurred_at:'2026-10-03T09:00:00Z'},{kind:'call',occurred_at:'2026-10-04T09:00:00Z'},{kind:'email',occurred_at:'2026-10-05T09:00:00Z'},{kind:'call',occurred_at:'2026-01-05T09:00:00Z'}]};

test('KPI math over the quarter',()=>{
 const a=A.analyze(data,A.periodRange('quarter',NOW),NOW),k=a.kpi;
 assert.deepEqual(k.open,{count:3,total:220000});
 assert.deepEqual(k.weighted,{value:20000+25000,withProb:2,withoutProb:1});
 assert.deepEqual(k.won,{count:2,total:50000});
 assert.deepEqual(k.winRate,{won:2,closed:5,rate:40});
 assert.deepEqual(k.cycle,{days:30,n:2});
 assert.deepEqual(a.stages.map(s=>[s.title,s.value,s.count]),[['Qualifica',100000,1],['Proposta',120000,2]]);
 assert.deepEqual(a.months.map(m=>[m.month,m.total,m.byStage]),[['2026-10',100000,[100000,0]],['2026-11',120000,[0,120000]],['2026-12',0,[0,0]]]);
 assert.equal(a.lateInPeriod,1);assert.deepEqual(a.outside,{undated:1,other:1});
 assert.deepEqual(a.results.map(m=>[m.won,m.lost,m.wonCount,m.lostCount]),[[50000,0,2,0],[0,5000,0,1],[0,10000,0,2]]);
 assert.deepEqual(a.wonPrev,{count:1,total:10000});
 assert.deepEqual(a.lostReasons,[{reason:'Prezzo',count:2},{reason:'Motivo non indicato',count:1}]);
 assert.deepEqual(a.owners.map(o=>[o.name,o.open,o.won]),[['Anna',170000,30000],['Luca',50000,20000]]);
 assert.deepEqual(a.tasks,{total:3,done:1,late:1,linked:1,undated:1});
 assert.deepEqual(a.interactions,{total:3,byKind:[{kind:'call',label:'Chiamata',count:2},{kind:'email',label:'Email',count:1}]});
});

test('no data gives null values (shown as «—»), never zeros dressed as results',()=>{
 const a=A.analyze({opportunities:[],stages:[]},A.periodRange('month',NOW),NOW),k=a.kpi;
 assert.equal(k.open.total,null);assert.equal(k.weighted.value,null);assert.equal(k.won.total,null);assert.equal(k.winRate.rate,null);assert.equal(k.cycle.days,null);
 const b=A.analyze(data,A.periodRange('month',Date.parse('2025-03-10T10:00:00Z')),NOW);
 assert.equal(b.kpi.open.count,0);assert.equal(b.kpi.open.total,null);assert.equal(b.kpi.winRate.rate,null);
});

test('missing data list explains what the CRM lacks',()=>{
 assert.deepEqual(A.missingData({}),['Nessuna opportunità nel CRM: crea la prima da Pipeline.','Nessuna attività né interazione registrata.']);
 const m=A.missingData({opportunities:[{id:'x',outcome:'open',stage_id:'s'}],stages:[{id:'s'}],tasks:[{}]});
 assert.equal(m.length,4);assert.match(m[0],/valore/);assert.match(m[1],/data di chiusura prevista/);assert.match(m[2],/Nessuna trattativa chiusa/);assert.match(m[3],/probabilità/);
 assert.deepEqual(A.missingData(data),[]);
});

test('takeaways follow fixed rules',()=>{
 const T=A.takeaway,a=A.analyze(data,A.periodRange('quarter',NOW),NOW),eur=c=>'€'+c/100;
 assert.equal(T.stages(a,eur),'La fase con più valore è «Proposta»: 55% della pipeline del periodo, quasi tutto il valore è lì.');
 assert.equal(T.months(a,eur),'Il mese con più valore in chiusura è novembre 2026: €1200. 1 trattativa ha la data di chiusura già passata: aggiornala.');
 assert.equal(T.results(a,eur),'Vinte 2 su 5 chiuse (40%). Vinto €400 in più del periodo precedente.');
 assert.equal(T.lostReasons(a),'Il motivo di perdita più frequente è «Prezzo» (2 su 3 perse).');
 assert.equal(T.owners(a),'Anna ha il 77% della pipeline aperta del periodo.');
 assert.equal(T.tasks(a),'1 attività completate su 3 in scadenza nel periodo; 1 scaduta e non completata.');
 assert.equal(T.interactions(a),'Il tipo più frequente è «Chiamata»: 2 su 3 interazioni.');
 const e=A.analyze({opportunities:[],stages:[]},A.periodRange('month',NOW),NOW);
 assert.equal(T.stages(e),'Nessuna trattativa aperta con chiusura prevista nel periodo.');
 assert.equal(T.results(e),'Nessuna trattativa chiusa nel periodo.');assert.equal(T.lostReasons(e),'Nessuna trattativa persa nel periodo.');
 assert.equal(T.tasks(e),'Nessuna attività in scadenza nel periodo.');assert.equal(T.interactions(e),'Nessuna interazione registrata nel periodo.');
});

test('page wiring: core loaded before the view, token-only colours, sections and labels',()=>{
 const html=fs.readFileSync('radix-sales.html','utf8');
 assert.ok(html.indexOf('sales/crm-analisi-core.js')>0&&html.indexOf('sales/crm-analisi-core.js')<html.indexOf('sales/analytics-view.js'));
 assert.ok(html.includes('sales/crm-analisi.css'));
 const css=fs.readFileSync('sales/crm-analisi.css','utf8').replace(/\/\*[\s\S]*?\*\//g,'');
 assert.doesNotMatch(css,/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i,'colours come only from --crm-* tokens');
 const js=fs.readFileSync('sales/analytics-view.js','utf8');
 for(const t of ["section('Pipeline'","section('Risultati'","section('Attività'","section('Previsioni'",'Regola fissa, non AI','Questo mese','Personalizzato','simPanel(all)','predict(all','Chiusure attese','Previsione dallo storico'])assert.ok(js.includes(t),t);
 assert.doesNotMatch(js,/#[0-9a-f]{6}\b/i,'no hex colours in the view');
});
