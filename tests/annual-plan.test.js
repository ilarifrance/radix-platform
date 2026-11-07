'use strict';
// Studio «Piano annuale e budget» (lib/annual-plan.js): the plan from the budget saved by «Budget e KPI» or from the
// essential questions, the seasonal moments (Pasqua moving with the year), the three ways to spread the year by fixed
// rules (whole euros, the year equal to the budget, closed months empty), the grid totals and warnings, the KPI per
// month («da misurare» without a source), the template activities, the ONE optional AI call (confirmation, grounding),
// the checks, the real .xlsx (checked and read back by the RADIX Excel reader), the PDF, the CSV, the saved key
// annualPlan kept by agents-page.js and the card in «Cosa vuoi fare». Fake data and fake AI only.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
require('./xml-dom-shim.js');
const A=require('../lib/annual-plan.js'),S=require('../lib/strategy-budget.js'),X=require('../lib/xlsx-lite.js'),READER=require('../lib/lead-xlsx-parser.js'),F=require('./strategy-budget-fixtures.js');
const crea=require('../agency/crea-core.js'),look=require('../agency/marketing-look.js');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const latin=b=>Buffer.from(b).toString('latin1');
const pdfText=bytes=>[...latin(bytes).matchAll(/<([0-9A-F]+)> Tj/g)].map(m=>Buffer.from(m[1],'hex').toString('latin1')).join('\n');
const sum=a=>a.reduce((s,v)=>s+v,0);
// The budget saved by «Budget e KPI»: 1.200 € a month for 6 months, «Bilanciata», KPI targets +10%.
function budgetRecord(){const src=F.input(),st=S.strategyOf(src.editorial),b=S.baselines(src),p=S.newPlan({strategy:st,projectName:'Forno Aurora',today:F.TODAY,base:b});
 p.budget=1200;const a=S.allocate(1200,p.channels,p.goal,'bilanciata',{b2b:p.b2b});p.proposal='bilanciata';p.lines=a.lines;p.kpis=S.deriveTargets(S.kpisFor(p.lines,b),10);
 return S.savedRecord(p,{at:'2026-10-22T10:00:00.000Z'})}
function plan({proposal='stagionale',closed=[8],events=[{label:'Festa del quartiere',month:6}]}={}){const p=A.newPlan({projectName:'Forno Aurora',today:F.TODAY,strategy:S.strategyOf(F.editorial()),budget:budgetRecord()});
 p.closed=closed;p.events=events;return A.choose(p,proposal)}
const BRAND=A.brandFor(F.PROFILE,'Forno Aurora');

test('sector, seasonal moments and Pasqua that moves with the year',()=>{
 assert.equal(A.detectSector('Forno Aurora, forno di quartiere dal 1987 a lievito madre'),'forno');assert.equal(A.detectSector('Studio di fisioterapia'),'salute');
 assert.equal(A.detectSector('Boutique di abbigliamento'),'negozio');assert.equal(A.detectSector('qualcosa'),'altro','no word, no guess: «Altro»');
 assert.deepEqual(A.easter(2027),{month:3,day:28});assert.deepEqual(A.easter(2026),{month:4,day:5});assert.deepEqual(A.easter(2028),{month:4,day:16});
 assert.equal(A.peakKind('pasqua',2027,3),'peak');assert.equal(A.peakKind('pasqua',2027,2),'lead');assert.equal(A.peakKind('pasqua',2026,4),'peak');
 const S0=A.seasonOf({start:'2026-11',sector:'forno',peaks:['natale','pasqua'],events:[{label:'Fiera',month:6}],closed:[8]});
 assert.deepEqual(S0.map(s=>s.short),['Nov 26','Dic 26','Gen 27','Feb 27','Mar 27','Apr 27','Mag 27','Giu 27','Lug 27','Ago 27','Set 27','Ott 27']);
 assert.deepEqual(S0[0].tags,[{id:'natale',label:'Natale e feste',kind:'lead'}]);assert.equal(S0[1].tags[0].kind,'peak');assert.equal(S0[4].tags[0].id,'pasqua');
 assert.equal(S0[7].tags[0].label,'Fiera');assert.equal(S0[9].closed,true);assert.equal(A.seasonText(S0[9]),'Chiuso');
});

test('from the budget of «Budget e KPI»: × 12, its split as the weight of the year, goal, first month',()=>{
 const p=A.newPlan({projectName:'Forno Aurora',today:F.TODAY,strategy:S.strategyOf(F.editorial()),budget:budgetRecord()});
 assert.equal(p.budgetYear,14400);assert.equal(p.start,'2026-11');assert.deepEqual(p.goals,['contatti']);assert.equal(p.sector,'forno');assert.deepEqual(p.peaks,['natale','pasqua','sanvalentino','festamamma']);
 assert.deepEqual(p.channels,['instagram','facebook','googleads','gbp','email']);assert.equal(p.reserve,true);
 assert.deepEqual(A.yearlyOf(p),{instagram:2160,facebook:2160,googleads:3600,gbp:2880,email:2160,riserva:1440},'the monthly split × 12');
 const q=A.newPlan({projectName:'Studio Lume',today:F.TODAY,profileText:'Studio di fisioterapia'});
 assert.equal(q.budgetYear,null,'no budget is ever proposed');assert.equal(q.fromBudget,null);assert.equal(q.sector,'salute');assert.equal(q.start,'2026-11');
 q.budgetYear=6000;q.goals=['contatti'];q.channels=['gbp','googleads','instagram'];const y=A.yearlyOf(q);
 assert.equal(sum(Object.values(y)),6000);assert.ok(y.googleads>y.instagram,'Google Ads weighs more for contacts');assert.equal(Math.round(y.riserva/60),10,'10% reserve');
});

test('three ways to spread the year: whole euros, every line equal to its share, closed months empty',()=>{
 const p=plan(),all=A.proposals(p);assert.deepEqual(all.map(a=>a.id),['costante','stagionale','lancio']);const year=A.yearlyOf(p);
 for(const a of all){assert.equal(a.total,14400,a.id);for(const r of a.rows){assert.equal(sum(r.months),year[r.id],a.id+' '+r.id);assert.ok(r.months.every(Number.isInteger));assert.equal(r.months[9],0,'August closed')}}
 const [c,s,l]=all;
 assert.ok(Math.max(...c.byMonth)-Math.min(...c.byMonth.filter(v=>v))<=12,'«Costante»: the same in every open month');
 assert.ok(s.byMonth[1]>s.byMonth[0]&&s.byMonth[0]>s.byMonth[8],'«Picchi»: Natale > its preparation > a month without moments');
 assert.equal(s.top,3,'February: San Valentino and the preparation of Pasqua 2027');
 assert.ok(l.byMonth[0]>l.byMonth[1]&&l.byMonth[1]>l.byMonth[2]&&l.byMonth[2]>l.byMonth[8],'«Lancio»: the first three months push');
 const gb=s.rows.find(r=>r.id==='gbp'),ig=s.rows.find(r=>r.id==='instagram');assert.ok(ig.months[1]/ig.months[8]>gb.months[1]/gb.months[8],'owned channels move half as much');
 assert.ok(s.warnings.some(w=>/Google Ads: \d+ mesi sotto la soglia RADIX di 300 €/.test(w)));
 assert.deepEqual(A.monthWeights({...p,closed:[]},'costante'),Array(12).fill(1));
});

test('the grid: totals, over and under the budget, warnings, «Adatta al budget annuale»',()=>{
 const p=plan();let t=A.totalsOf(p);assert.equal(t.state,'ok');assert.equal(t.total,14400);assert.equal(sum(t.byMonth),14400);
 p.rows.find(r=>r.id==='googleads').months[1]+=500;t=A.totalsOf(p);assert.equal(t.state,'over');assert.equal(t.diff,-500);
 assert.equal(A.checksOf(p).find(c=>c.id==='totale').state,'fail','over the budget blocks the export');assert.equal(A.blocking(A.checksOf(p)).length,1);
 p.rows=A.balance(p);t=A.totalsOf(p);assert.equal(t.state,'ok');assert.equal(t.total,14400);assert.equal(p.rows.find(r=>r.id==='googleads').months[9],0,'closed stays empty');
 p.rows[0].months[0]-=100;assert.equal(A.totalsOf(p).state,'under');assert.equal(A.checksOf(p).find(c=>c.id==='totale').state,'warn');
 p.rows[0].months[9]=50;const ws=A.cellWarnings(p);assert.ok(ws.some(w=>w.id==='instagram'&&w.i===9&&w.kind==='closed'));
 assert.ok(A.warningLines(p).some(l=>/Instagram: spesa in un mese chiuso \(Ago 27\)/.test(l)));
});

test('KPI per month: from the targets of «Budget e KPI» (a line to the target, then held) or «da misurare»',()=>{
 const p=plan(),k=Object.fromEntries(p.kpis.map(x=>[x.key,x]));
 assert.deepEqual(p.kpis.map(x=>x.key),['generale:newLeads','instagram:impressions','facebook:impressions','googleads:adsClicks','gbp:gbpScore','email:clickRate']);
 assert.equal(k['googleads:adsClicks'].targets.every(v=>v===null),true,'no current value, no target: «da misurare»');assert.equal(k['googleads:adsClicks'].from,'');
 const ig=k['instagram:impressions'].targets;assert.equal(k['instagram:impressions'].from,'strategia');assert.ok(ig[0]<ig[5]);assert.equal(ig[5],ig[11],'held after the end of the budget');
 assert.deepEqual(A.rampOf({target:110,baseline:{value:100},unit:'',d:0},{start:'2026-11',months:2},['2026-10','2026-11','2026-12','2027-01']),[null,105,110,110]);
 assert.deepEqual(A.rampOf({target:110,baseline:null,unit:'',d:0},{start:'2026-11',months:3},['2026-11','2026-12','2027-01']),[null,null,110],'no current value: only the target, at its date');
 const c=A.checksOf(p).find(x=>x.id==='kpi');assert.equal(c.state,'warn');assert.match(c.detail,/1 KPI su 6 hanno mesi «da misurare» \(1 tutto l’anno\)/);
});

test('activities by fixed templates: preparation, the moment of the month, closed months, launch',()=>{
 const p=plan(),acts=p.activities;assert.equal(acts.length,12);
 assert.match(acts[0][0].text,/^Prepara «Natale e feste»/);assert.ok(acts[1].some(a=>/«Natale e feste»/.test(a.text)&&a.channel==='googleads'));
 assert.match(acts[7].map(a=>a.text).join(' '),/«Festa del quartiere»/);assert.deepEqual(acts[9].map(a=>a.channel),['generale']);assert.match(acts[9][0].text,/chiusura/);
 assert.ok(acts.flat().every(a=>a.by==='regola'&&!/\d/.test(a.text)),'template activities quote no number');
 const used=new Set(acts.flat().map(a=>a.channel));for(const id of ['instagram','facebook','googleads','gbp','email'])assert.ok(used.has(id),id+' gets its activity during the year');
 assert.match(plan({proposal:'lancio'}).activities[0].map(a=>a.text).join(' '),/Lancio: /);
});

test('the optional AI: one confirmation with its cost, one call, numbers not in the plan dropped',async()=>{
 const p=plan(),allowed=A.allowedNumbers(p);
 assert.ok(allowed.has('14400')&&allowed.has('2027'));for(const n of ['3','7','17'])assert.ok(!allowed.has(n),n+': a month number is not a fact of the plan');
 const dec=p.rows.find(r=>r.id==='googleads').months[1];
 const reply=JSON.stringify({mesi:[{mese:'2026-11',attivita:[{canale:'instagram',testo:'Dietro le quinte dei panettoni'},{canale:'instagram',testo:'3 reel sul lievito madre'},{canale:'email',testo:'Sconto del 20% sugli ordini'}]},
  {mese:'2026-12',attivita:[{canale:'googleads',testo:'Annunci «torta di Natale» con i '+S.fmtNum(dec)+' € del mese'},{canale:'whatsapp',testo:'Messaggio ai clienti'},{canale:'Scheda Google',testo:'Orari delle feste'}]},
  {mese:'2027-02',attivita:[{canale:'facebook',testo:'Il mercato cresce: sponsorizzata per tutti, ROI garantito del 12'}]},{mese:'2027-08',attivita:[{canale:'instagram',testo:'Promo estate'}]},{mese:'2030-01',attivita:['x']}]});
 const r=A.parseActivities(reply,p);
 assert.deepEqual(r.months[0].map(a=>a.text),['Dietro le quinte dei panettoni']);assert.deepEqual(r.months[1].map(a=>a.channel),['googleads','gbp'],'a channel without budget is dropped, a label is read');
 assert.equal(r.count,3);assert.equal(r.dropped,6);assert.ok(r.months.flat().every(a=>a.by==='ai'));
 assert.equal(A.parseActivities('nessun JSON',p),null);
 let calls=0,asked=null;const rt={reply:async x=>{calls++;assert.equal(x.role,'strategist');assert.match(x.messages[0].content,/DATI DEL PIANO/);assert.match(x.messages[0].content,/2026-12 Dicembre 2026: Natale e feste/);return {text:reply}}};
 assert.deepEqual(await A.suggestActivities({plan:p,rt,confirm:async o=>{asked=o;return false}}),{cancelled:true});assert.equal(calls,0,'no yes, no call');
 assert.equal(asked.cost,'È una sola chiamata AI al Digital Strategist: usa crediti API.');assert.deepEqual(asked.facts[0],['Chiamate AI','1']);assert.match(asked.facts[1][1],/11 aperti su 12/);
 const out=await A.suggestActivities({plan:p,rt,confirm:async()=>true});assert.equal(calls,1);assert.equal(out.count,3);
 p.activities[0].push({channel:'generale',text:'Mia nota',by:'persona'});const applied=A.applyActivities(p,out);
 assert.deepEqual(applied[0].map(a=>a.by),['ai','persona'],'the lines written by the person stay');assert.equal(applied[2][0].by,'regola','a month without suggestions keeps its lines');
 await assert.rejects(A.suggestActivities({plan:p,rt:{reply:async()=>({text:'{}'})},confirm:async()=>true}),/utilizzabili/);
 const src=read('lib/annual-plan.js');assert.equal((src.match(/rt\.reply\(/g)||[]).length,1,'one call site');assert.doesNotMatch(src,/fetch\(|\/api\//,'no network of its own');
});

test('the Excel file: four sheets, € and % formats, SUM formulas with their values, read back by the RADIX reader',async()=>{
 const p=plan(),bytes=A.xlsxBytes(p,{date:F.TODAY}),r=X.inspect(bytes);
 assert.deepEqual(r.problems,[]);assert.deepEqual(r.sheets.map(s=>s.name),['Piano','KPI','Attività','Note']);
 const P=r.sheets[0];assert.deepEqual(P.rows[0].slice(0,3),['Canale','Nov 26','Dic 26']);assert.deepEqual(P.rows[0].slice(13),['Totale','Quota']);
 assert.equal(P.cells.N2.f,'SUM(B2:M2)');assert.equal(P.cells.N2.v,2160);assert.equal(P.cells.N8.f,'SUM(N2:N7)');assert.equal(P.cells.N8.v,14400);assert.equal(P.cells.O2.f,'IF($N$8=0,0,N2/$N$8)');assert.equal(P.cells.O2.v,.15);
 assert.equal(P.rows[7][0],'Totale del mese');assert.equal(P.cells.B12.v,14400);assert.equal(P.cells.B13.v,0,'nothing left to assign');assert.equal(r.sums,6*1+12+1+0,'6 rows, 12 months, the year');
 assert.deepEqual(P.freeze,{rows:1,cols:1,frozen:true});assert.equal(P.cells.B2.s,X.STYLES.eur);assert.equal(P.cells.B9.s,X.STYLES.pct);
 assert.equal(P.cells.B4.s,X.STYLES.eurWarn,'Google Ads in November is under the RADIX minimum');assert.equal(P.rows[9][10],'Chiuso');
 const K=r.sheets[1];assert.equal(K.rows[4][1],'Clic dagli annunci al mese');assert.equal(K.rows[4][2],'da misurare');assert.equal(K.rows[2][2],p.kpis[1].targets[0]);
 const Act=r.sheets[2];assert.deepEqual(Act.rows[0],['Mese','Momenti stagionali','Canale','Attività','Origine']);assert.equal(Act.rows.length-1,p.activities.flat().length);
 assert.ok(r.sheets[3].rows.some(x=>x[0]==='Formule'));
 const rows=await READER.readRows(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),{formulas:true,maxRows:50});
 assert.equal(rows[1][0],'Instagram');assert.equal(rows[1][13],'2160');assert.equal(rows[7][13],'14400');
});

test('PDF (A4 landscape, every text inside the page), CSV and the file name',()=>{
 const p=plan(),doc=A.layoutPlan(p,BRAND,{date:F.TODAY});assert.deepEqual(A.fitProblems(doc),[]);assert.ok(doc.pages.every(pg=>pg.w===297&&pg.h===210));
 const bytes=A.planPdf(p,BRAND,{date:F.TODAY,doc}),txt=pdfText(bytes);assert.match(latin(bytes),/^%PDF-/);
 for(const s of ['Piano marketing annuale','Budget mese per mese','KPI mese per mese','Attivit\xe0 mese per mese','Note e ipotesi','Natale e feste'])assert.ok(txt.includes(s),s);
 assert.ok(txt.includes('da misurare tutto l\x92anno'));
 const csv=A.planCsv(p),lines=csv.split('\r\n');assert.ok(csv.startsWith('﻿'));assert.equal(lines[0].replace('﻿','').split(';')[1],'Novembre 2026');
 assert.match(lines.find(l=>l.startsWith('Totale del mese')),/;14400;100$/);assert.ok(lines.some(l=>/^Clic dagli annunci al mese;Google Ads;da misurare/.test(l)));
 assert.equal(A.fileBase(p,BRAND),'piano-annuale-forno-aurora-2026-11');
});

test('checks of a ready plan, saved under annualPlan with the rest of the agents document; agents-page.js keeps it',async()=>{
 const p=plan();assert.deepEqual(A.checksOf(p).map(c=>[c.id,c.state]),[['budget','ok'],['totale','ok'],['soglie','warn'],['kpi','warn'],['attivita','ok']]);
 let doc={schemaVersion:1,conversations:{strategist:[{role:'user',content:'x'}]},strategyBudget:{schemaVersion:1,items:[budgetRecord()]}};
 const ws={bind:()=>({load:async()=>JSON.parse(JSON.stringify(doc)),save:async d=>{doc=d}})};
 const rec=A.savedRecord(p,{by:'Francesco',at:'2026-10-23T10:00:00.000Z'});await A.saveToProject(ws,'forno-aurora',rec);
 assert.equal(doc.annualPlan.items.length,1);assert.equal(doc.strategyBudget.items.length,1);assert.equal(doc.conversations.strategist.length,1);
 assert.deepEqual(A.readStore(doc).items[0].plan.rows,p.rows);assert.equal(A.latestBudget(doc).id,doc.strategyBudget.items[0].id);
 for(let i=0;i<14;i++)await A.saveToProject(ws,'x',A.savedRecord(p,{at:'2026-10-23T10:00:'+String(10+i)+'.000Z'}));assert.equal(doc.annualPlan.items.length,12);
 const ap=read('agents-page.js');assert.match(ap,/if\(d\.annualPlan\)out\.annualPlan=d\.annualPlan/);assert.equal((ap.match(/data\.annualPlan=fresh\.annualPlan/g)||[]).length,2);
});

test('the card in «Cosa vuoi fare», the studio in crea.js and crea.html, the icon and the styles',()=>{
 const c=crea.card('pianoannuale');assert.equal(c.group,'Strategia');assert.equal(c.inline,'pianoannuale');assert.deepEqual(crea.costBadge(c),{tone:'free',label:'Gratis · AI facoltativa'});
 assert.equal(crea.best('piano annuale'),'pianoannuale');assert.equal(crea.best('stagionalità'),'pianoannuale');assert.equal(look.CARDS.pianoannuale,'yearPlan');assert.ok(look.has('yearPlan'));
 const html=read('agency/crea.html');assert.ok(html.indexOf('/lib/zip-lite.js')<html.indexOf('/lib/xlsx-lite.js')&&html.indexOf('/lib/pptx-lite.js')<html.indexOf('/lib/xlsx-lite.js')&&html.indexOf('/lib/xlsx-lite.js')<html.indexOf('/lib/annual-plan.js'));
 assert.ok(html.indexOf('/lib/strategy-budget.js')<html.indexOf('/lib/annual-plan.js'));
 const js=read('agency/crea.js');assert.match(js,/c\.inline==='pianoannuale'/);assert.match(js,/RadixAnnualPlan/);assert.match(js,/openBudget:\(\)=>openInline\(core\.card\('budget'\)\)/);
 assert.match(read('shell/crea.css'),/\.annual-plan \.ap-grid/);
});
