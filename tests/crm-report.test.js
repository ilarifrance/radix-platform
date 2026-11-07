'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const R=require('../sales/crm-report-core.js');
const CSV=require('../sales/crm-csv-core.js');
const api=require('../api/_sales.js');
const NOW=Date.parse('2026-10-20T10:00:00Z');

const stages=[{id:'s2',title:'Proposta',position:2},{id:'s1',title:'Qualifica',position:1}];
const members=[{id:1,name:'Anna'},{id:2,name:'Luca'}];
const companies=[{id:'c1',name:'Alfa',industry:'Moda',city:'Milano'},{id:'c2',name:'Beta',industry:'moda ',city:'Roma'},{id:'c3',name:'Gamma',industry:'',city:'Torino'},{id:'c4',name:'Delta',industry:'Food',city:'Milano'}];
const opp=(id,o)=>({id,title:'Opp '+id,stage_id:'s1',outcome:'open',...o});
const opps=[
 opp('a',{amount_cents:100000,owner_id:1,company_id:'c1',created_at:'2026-08-03T10:00:00Z'}),
 opp('b',{amount_cents:50000,owner_id:2,stage_id:'s2',company_id:'c2',created_at:'2026-10-01T10:00:00Z'}),
 opp('c',{amount_cents:null,owner_id:1,stage_id:'s2',created_at:'2026-10-31T23:30:00Z'}), // 1 Nov in Rome
 opp('w',{outcome:'won',amount_cents:30000,owner_id:2,company_id:'c4',closed_at:'2026-09-15T10:00:00Z',created_at:'2026-06-01T10:00:00Z'}),
 opp('l',{outcome:'lost',amount_cents:20000,company_id:'c1',created_at:null})];
const data={rows:opps,stages,members,companies,processes:[]};

test('definition validation: defaults, strict keys, entity rules, dates',()=>{
 const v=R.validate({entity:'opportunities',group:'stage'});
 assert.deepEqual(v,{ok:true,def:{v:1,entity:'opportunities',filters:{},date:null,group:'stage',measure:'count',chart:'bar',sort:'value'}});
 assert.equal(R.validate({entity:'opportunities',group:'month:closed_at'}).def.sort,'label','months sort by calendar');
 for(const [d,re] of [
  [null,/non valida/],[{entity:'deals',group:'stage'},/Scegli un oggetto/],[{entity:'companies',group:'stage'},/Raggruppamento/],
  [{entity:'companies',group:'industry',measure:'sum'},/solo per le opportunità/],[{entity:'tasks',group:'status',chart:'pie'},/Grafico/],
  [{entity:'tasks',group:'status',sql:'x'},/non consentito/],[{entity:'tasks',group:'status',filters:{status:'boh'}},/Valore non valido/],
  [{entity:'tasks',group:'status',filters:{nope:'x'}},/Filtro non consentito/],[{entity:'tasks',group:'status',filters:{role:'CEO'}},/Filtro non consentito/],
  [{entity:'contacts',group:'role',filters:{consent:'maybe'}},/Consenso/],[{entity:'contacts',group:'role',filters:{city:'x'.repeat(81)}},/Città/],
  [{entity:'tasks',group:'status',date:{field:'closed_at',last:3}},/data non valido/],[{entity:'tasks',group:'status',date:{field:'due_at',last:0}},/Ultimi giorni/],
  [{entity:'tasks',group:'status',date:{field:'due_at',from:'2026-02-30'}},/Data non valida/],[{entity:'tasks',group:'status',date:{field:'due_at',from:'2026-03-02',to:'2026-03-01'}},/Intervallo/],
  [{entity:'tasks',group:'status',date:{field:'due_at'}},/almeno una data/],[{v:2,entity:'tasks',group:'status'},/Versione/],
  [{entity:'tasks',group:'status',filters:{status:Array(21).fill('todo')}},/non valido/]])assert.match(R.validate(d).error,re,JSON.stringify(d));
 assert.ok(R.validate({entity:'tickets',group:'priority',filters:{status:['open','pending'],company:''},date:{field:'created_at',from:'2026-01-01',to:undefined}}).ok);
 assert.equal(R.validate({entity:'contacts',group:'role',filters:{role:'x'.repeat(80),consent:'yes'}}).ok,true);
 for(const p of R.PRESETS)assert.ok(R.validate(p.def).ok,p.name);
 assert.equal(R.PRESETS.length,6);
 assert.deepEqual(R.PRESETS.map(p=>p.name),['Pipeline per fase','Opportunità vinte per mese','Attività per responsabile (ultimi 30 giorni)','Aziende per settore','Lead per fonte','Ticket aperti per priorità']);
});

test('filters: segment filters on the company, field filters, date window in Rome',()=>{
 const ids=def=>R.apply(R.validate(def).def,opps,data,NOW).map(r=>r.id);
 assert.deepEqual(ids({entity:'opportunities',group:'stage',filters:{outcome:'open'}}),['a','b','c']);
 assert.deepEqual(ids({entity:'opportunities',group:'stage',filters:{outcome:['won','lost']}}),['w','l']);
 assert.deepEqual(ids({entity:'opportunities',group:'stage',filters:{industry:'MODA'}}),['a','b','l'],'segment text filter: contains, any case, company industry');
 assert.deepEqual(ids({entity:'opportunities',group:'stage',filters:{city:'mil',outcome:'open'}}),['a']);
 assert.deepEqual(ids({entity:'opportunities',group:'stage',filters:{company:''}}),['c'],'empty value filter');
 assert.deepEqual(ids({entity:'opportunities',group:'stage',filters:{owner:'2'}}),['b','w']);
 assert.deepEqual(ids({entity:'opportunities',group:'stage',date:{field:'created_at',from:'2026-10-01',to:'2026-10-31'}}),['b'],'23:30 UTC on 31 Oct is November in Rome; no date = out');
 assert.deepEqual(ids({entity:'opportunities',group:'stage',date:{field:'created_at',last:30}}),['b'],'the last 30 days end today (c is in November)');
 assert.deepEqual(R.dateWindow({field:'x',last:30},NOW),{from:'2026-09-21',to:'2026-10-20'});
 const contacts=[{id:'k1',role:'CEO',company_id:'c1',marketing_consent:true},{id:'k2',role:'Ceo assistant',company_id:'c4',marketing_consent:false},{id:'k3',role:'CTO'}];
 const k=def=>R.apply(R.validate(def).def,contacts,{companies},NOW).map(r=>r.id);
 assert.deepEqual(k({entity:'contacts',group:'role',filters:{role:'ceo'}}),['k1','k2']);
 assert.deepEqual(k({entity:'contacts',group:'role',filters:{consent:'no'}}),['k2','k3']);
 assert.deepEqual(k({entity:'contacts',group:'role',filters:{city:'Milano',consent:'yes'}}),['k1']);
 assert.deepEqual(R.apply(R.validate({entity:'companies',group:'industry',filters:{city:'milano'}}).def,companies,{},NOW).map(r=>r.id),['c1','c4'],'companies filter on their own fields');
});

test('grouping: names from lookups, case-insensitive text, «(vuoto)», month buckets with gaps',()=>{
 const r=R.run({entity:'opportunities',group:'stage',sort:'label'},data,NOW);
 assert.deepEqual(r.groups.map(g=>[g.key,g.label,g.count]),[['s1','Qualifica',3],['s2','Proposta',2]],'stage position order');
 const own=R.run({entity:'opportunities',group:'owner'},data,NOW);
 assert.deepEqual(own.groups.map(g=>[g.label,g.count]),[['Anna',2],['Luca',2],['(vuoto)',1]],'ties by label, empty last');
 const co=R.run({entity:'companies',group:'industry'},{rows:companies},NOW);
 assert.deepEqual(co.groups.map(g=>[g.key,g.label,g.count]),[['moda','Moda',2],['food','Food',1],['','(vuoto)',1]]);
 const m=R.run({entity:'opportunities',group:'month:created_at'},data,NOW);
 assert.deepEqual(m.groups.map(g=>[g.key,g.label,g.count]),[['2026-06','giu 2026',1],['2026-07','lug 2026',0],['2026-08','ago 2026',1],['2026-09','set 2026',0],['2026-10','ott 2026',1],['2026-11','nov 2026',1],['','(vuoto)',1]]);
 assert.deepEqual(m.groups.find(g=>g.key==='2026-08').ids,['a']);
 const t=R.run({entity:'tasks',group:'priority',sort:'label'},{rows:[{id:1,priority:'low'},{id:2,priority:'urgent'},{id:3,priority:'low'},{id:4}]},NOW);
 assert.deepEqual(t.groups.map(g=>g.label),['Urgente','Bassa','(vuoto)'],'fixed lists keep their order');
 const b=R.run({entity:'contacts',group:'consent'},{rows:[{id:1,marketing_consent:true},{id:2,marketing_consent:false},{id:3,marketing_consent:false}]},NOW);
 assert.deepEqual(b.groups.map(g=>[g.label,g.count]),[['No',2],['Sì',1]]);
 assert.equal(R.run({entity:'tasks',group:'assignee'},{rows:[{id:1,assignee_id:9}],members},NOW).groups[0].label,'Utente 9');
 assert.equal(R.monthLabel('2026-12'),'dic 2026');assert.equal(R.monthLabel(''),'(vuoto)');
});

test('measures: count, sum and average of the amount; shares and totals',()=>{
 const s=R.run({entity:'opportunities',group:'stage',measure:'sum'},data,NOW);
 assert.deepEqual(s.groups.map(g=>[g.label,g.value,g.share]),[['Qualifica',150000,75],['Proposta',50000,25]]);
 assert.deepEqual(s.total,{count:5,value:200000});
 const a=R.run({entity:'opportunities',group:'stage',measure:'avg'},data,NOW);
 assert.deepEqual(a.groups.map(g=>[g.label,g.value,g.share]),[['Qualifica',50000,null],['Proposta',50000,null]],'null amounts are left out of the average');
 assert.deepEqual(a.total,{count:5,value:50000});
 const none=R.run({entity:'opportunities',group:'stage',measure:'avg'},{rows:[opp('x',{amount_cents:null})],stages},NOW);
 assert.equal(none.groups[0].value,null);
 const c=R.run({entity:'opportunities',group:'outcome'},data,NOW);
 assert.deepEqual(c.groups.map(g=>[g.label,g.value]),[['Aperta',3],['Vinta',1],['Persa',1]],'ties keep the order of the fixed list');
 assert.equal(R.run({entity:'opportunities',group:'outcome',sort:'label'},data,NOW).groups.map(g=>g.label).join(),'Aperta,Vinta,Persa');
 const empty=R.run({entity:'opportunities',group:'stage',filters:{owner:'7'}},data,NOW);
 assert.deepEqual([empty.groups.length,empty.total],[0,{count:0,value:0}]);
 assert.throws(()=>R.run({entity:'x'},data,NOW),/Scegli un oggetto/);
 assert.deepEqual(R.recordsOf(s,'s2').map(r=>r.id),['b','c']);
 assert.equal(R.run({entity:'leads',group:'source'},{rows:[],capped:true},NOW).capped,true);
});

test('sorting: by value with ties by label, by label, empty always last',()=>{
 const spec={type:'text'},G=(key,label,value)=>({key,label,value});
 const list=[G('','(vuoto)',9),G('b','beta',2),G('a','Alfa',2),G('z','Zeta',5)];
 assert.deepEqual(R.sortGroups(list,'value',spec).map(g=>g.key),['z','a','b','']);
 assert.deepEqual(R.sortGroups(list,'label',spec).map(g=>g.key),['a','b','z','']);
 assert.deepEqual(R.sortGroups([G('2026-10','',1),G('2025-12','',3)],'label',{type:'month'}).map(g=>g.key),['2025-12','2026-10']);
 assert.deepEqual(R.sortGroups([G('x','X',null),G('y','Y',0)],'value',spec).map(g=>g.key),['y','x'],'no value after zero');
});

test('CSV rows: one per group plus Totale, euro with decimal comma, through crm-csv-core',()=>{
 const s=R.run({entity:'opportunities',group:'stage',measure:'sum'},data,NOW),t=R.csvTable(s);
 assert.deepEqual(t.columns.map(c=>c.label),['Fase','Record','Somma importo (€)','% del totale']);
 assert.deepEqual(t.rows,[{label:'Qualifica',count:3,value:'1500,00',share:'75'},{label:'Proposta',count:2,value:'500,00',share:'25'},{label:'Totale',count:5,value:'2000,00',share:'100'}]);
 const csv=CSV.toCsv(t.rows,t.columns);
 assert.equal(csv,'﻿Fase;Record;Somma importo (€);% del totale\r\nQualifica;3;"1500,00";75\r\nProposta;2;"500,00";25\r\nTotale;5;"2000,00";100','decimal commas are quoted');
 const c=R.csvTable(R.run({entity:'companies',group:'industry'},{rows:[...companies,{id:'c5',industry:'=cmd'}]},NOW));
 assert.deepEqual(c.columns.map(x=>x.label),['Settore','Record','% del totale']);
 assert.match(CSV.toCsv(c.rows,c.columns),/\r\n'=cmd;1;20\r\n/,'formula cells stay text');
 const a=R.csvTable(R.run({entity:'opportunities',group:'stage',measure:'avg'},data,NOW));
 assert.deepEqual(a.columns.map(x=>x.label),['Fase','Record','Media importo (€)']);
 assert.equal(R.describe(R.validate(R.PRESETS[5].def).def),'Numero di ticket per priorità · stato: Aperto o In attesa');
 assert.equal(R.describe(R.validate({entity:'opportunities',group:'month:closed_at',measure:'sum',filters:{industry:'Moda'},date:{field:'closed_at',last:365}}).def),'Somma importo di opportunità per mese (data di chiusura) · settore azienda contiene «Moda» · data di chiusura negli ultimi 365 giorni');
});

test('saved reports ride in sales_segments.filters as {report}: the API validates them, contact segments ignore them',()=>{
 const def=R.PRESETS[0].def;
 assert.equal(api.segmentFilters({report:def}),true);
 assert.equal(api.segmentFilters({report:{...def,group:'nope'}}),false);
 assert.equal(api.segmentFilters({report:def,city:'Milano'}),false,'a report is only a report');
 assert.equal(api.segmentFilters({city:'Milano'}),true,'contact segments unchanged');
 const cmd=api.command({workspace:'00000000-0000-4000-8000-000000000001',entity:'segments',action:'create',data:{name:'Pipeline',filters:{report:def}}});
 assert.deepEqual(cmd.data.filters,{report:def});
 assert.throws(()=>api.command({workspace:'00000000-0000-4000-8000-000000000001',entity:'segments',action:'create',data:{name:'X',filters:{report:{entity:'companies',group:'industry',measure:'sum'}}}}),/Filtri del segmento/);
 assert.ok(JSON.stringify({report:R.validate({entity:'tickets',group:'priority',filters:{status:['open','pending','resolved','closed'],company:Array(20).fill('0'.repeat(36))}}).def}).length<=2000||!R.validate({entity:'tickets',group:'priority',filters:{company:Array(20).fill('x'.repeat(200))}}).ok,'fits the 2000-char column check');
 assert.match(R.validate({entity:'tickets',group:'priority',filters:{company:Array(20).fill('x'.repeat(200))}}).error,/troppo lungo/);
 // The segment filter keys the report reuses have the same types as the API's.
 for(const [k,t] of Object.entries(R.SEGMENT))assert.deepEqual(api.SEGMENT_FILTERS[k],t,k);
 assert.equal(R.isReport({filters:{report:def}}),true);assert.equal(R.isReport({filters:{city:'Milano'}}),false);
 assert.match(fs.readFileSync('sales/crm-tools.js','utf8'),/filter\(r=>!\(r\.filters&&r\.filters\.report\)\)/);
 assert.match(fs.readFileSync('sales/lead-newsletter.js','utf8'),/rowsOf\('segments'\)\.then\(l=>l\.filter\(r=>!\(r\.filters&&r\.filters\.report\)\)\)/);
 const mig=fs.readdirSync('migrations/sales');assert.ok(!mig.some(f=>/report/i.test(f)),'no migration');
});

test('page wiring: menu, scripts in order, token-only colours, no chart library',()=>{
 const html=fs.readFileSync('radix-sales.html','utf8'),at=s=>html.indexOf(s);
 assert.ok(at('sales/crm-analisi-core.js')<at('sales/crm-report-core.js')&&at('sales/crm-report-core.js')<at('sales/crm-report.js')&&at('sales/crm-report.js')<at('</head>'));
 assert.ok(at('<link rel="stylesheet" href="sales/crm-report.css">')>at('sales/crm-light-sales.css'));
 assert.match(fs.readFileSync('sales/sales-nav.js','utf8'),/CRM \+ '#report', text: 'Report'/);
 assert.match(fs.readFileSync('sales/crm-boot.js','utf8'),/report: 'Report'/);
 const css=fs.readFileSync('sales/crm-report.css','utf8').replace(/\/\*[\s\S]*?\*\//g,'');
 assert.doesNotMatch(css,/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i,'colours come only from --crm-* tokens');
 assert.match(css,/var\(--crm-chart-1\)/);
 const js=fs.readFileSync('sales/crm-report.js','utf8');
 assert.doesNotMatch(js,/#[0-9a-f]{6}\b/i);assert.doesNotMatch(js,/\.innerHTML\s*=/,'text only through textContent');
 for(const t of ['Esporta CSV','Salva report','Report pronti','Aggiorna dati','openCustomer','RadixCrmCsv','createElementNS'])assert.ok(js.includes(t),t);
});
