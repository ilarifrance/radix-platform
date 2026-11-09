'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const coa=require('../lib/accounting/chart-of-accounts');
const ledger=require('../lib/accounting/ledger');
const posting=require('../lib/accounting/posting');
const vat=require('../lib/accounting/vat');
const mgmt=require('../lib/accounting/management');
const rec=require('../lib/accounting/reconcile');
const L=(account,d,c,extra)=>({account,debit_cents:d,credit_cents:c,...extra});
const E=(date,lines,extra)=>({id:date+Math.random(),date,description:'x',status:'posted',lines,...extra});
const sum=(lines,k)=>lines.reduce((t,l)=>t+l[k],0);

test('standard chart is valid and suggests accounts from descriptions',()=>{
 assert.deepEqual(coa.validate(coa.STANDARD),[]);
 assert.equal(coa.suggest('Canone fibra ottica ufficio').code,'61.03');
 assert.equal(coa.suggest('Campagna Pubblicità Meta').code,'61.02');
 assert.equal(coa.suggest('Licenza Microsoft 365 annuale').code,'61.04');
 assert.equal(coa.suggest('Voce sconosciuta').code,'65.01');
 assert.equal(coa.suggest('Consulenza',{kind:'R'}).code,'70.02');
 const broken=coa.STANDARD.filter(a=>a.code!=='02.10').concat([{code:'1',name:'',kind:'Z',group:'x'},{...coa.STANDARD[0]}]);
 const errs=coa.validate(broken);
 assert.ok(errs.some(e=>e.includes('02.10')));assert.ok(errs.some(e=>e.includes('Codice conto non valido')));assert.ok(errs.some(e=>e.includes('duplicato')));
});

test('entries must balance, use known accounts and one side per line',()=>{
 assert.deepEqual(ledger.validateEntry(E('2026-03-01',[L('03.01',1000,0),L('70.02',0,1000)]),coa.STANDARD),[]);
 assert.match(ledger.validateEntry(E('2026-03-01',[L('03.01',1000,0),L('70.02',0,999)]),coa.STANDARD).join(),/non bilanciata/);
 assert.match(ledger.validateEntry(E('2026-02-30',[L('03.01',1,0),L('70.02',0,1)]),coa.STANDARD).join(),/Data/);
 assert.match(ledger.validateEntry(E('2026-03-01',[L('99.99',1,0),L('70.02',0,1)]),coa.STANDARD).join(),/inesistente/);
 assert.match(ledger.validateEntry(E('2026-03-01',[L('03.01',1,1),L('70.02',0,0)]),coa.STANDARD).join(),/dare oppure in avere/);
 assert.match(ledger.validateEntry(E('2026-03-01',[L('03.01',1.5,0),L('70.02',0,1.5)]),coa.STANDARD).join(),/importo non valido/);
 assert.match(ledger.validateEntry(E('2026-03-01',[L('03.01',1,0)]),coa.STANDARD).join(),/almeno due/);
 assert.equal(ledger.fmt(123456789),'1.234.567,89 €');assert.equal(ledger.fmt(-5),'-0,05 €');
});

const year=[
 E('2026-01-01',[L('03.01',1000000,0),L('06.01',0,1000000)]), // capitale versato 10.000
 E('2026-01-15',[L('02.01',1220000,0),L('70.02',0,1000000,{project:'P1',cost_center:'Consulenza'}),L('04.10',0,220000)]),
 E('2026-01-20',[L('61.04',100000,0,{project:'P1',cost_center:'Consulenza'}),L('02.10',22000,0),L('04.01',0,122000)]),
 E('2026-02-10',[L('63.01',300000,0),L('03.01',0,300000)]),
 E('2026-02-28',[L('03.01',1220000,0),L('02.01',0,1220000)]),
 E('2026-03-05',[L('64.02',50000,0),L('01.90',0,50000)]),
 E('2026-03-10',[L('66.01',10000,0),L('03.01',0,10000)]),
 E('2026-03-11',[L('03.01',999,0),L('70.02',0,999)],{status:'draft'})
];

test('trial balance, ledger and riclassified income statement',()=>{
 const tb=ledger.trialBalance(year,coa.STANDARD);
 assert.ok(tb.balanced);assert.equal(tb.debit_cents,tb.credit_cents);
 assert.equal(tb.rows.find(r=>r.code==='03.01').balance_cents,1000000-300000+1220000-10000);
 const ml=ledger.accountLedger(year,'03.01',{from:'2026-02-01'});
 assert.equal(ml.opening_cents,1000000);assert.equal(ml.rows.length,3);assert.equal(ml.closing_cents,1910000);
 const is=ledger.incomeStatement(year,coa.STANDARD,{from:'2026-01-01',to:'2026-12-31'});
 assert.equal(is.by.ricavi,1000000);assert.equal(is.by.servizi,-100000);assert.equal(is.by.valore_aggiunto,900000);
 assert.equal(is.by.ebitda,600000);assert.equal(is.by.ebit,550000);assert.equal(is.net_cents,540000);
 assert.equal(is.rows.find(r=>r.key==='ebitda').pct,60);
 // Drafts are excluded unless asked.
 assert.equal(ledger.incomeStatement(year,coa.STANDARD,{includeDrafts:true}).by.ricavi,1000999);
});

test('balance sheet balances with the period result in equity, and flips an overdrawn bank',()=>{
 const bs=ledger.balanceSheet(year,coa.STANDARD,{to:'2026-12-31'});
 assert.ok(bs.balanced,JSON.stringify([bs.total_assets_cents,bs.total_liabilities_cents]));
 assert.equal(bs.result_cents,540000);
 assert.equal(bs.assets.immobilizzazioni.value_cents,-50000);
 const od=[E('2026-01-02',[L('61.03',5000,0),L('03.01',0,5000)])];
 const b2=ledger.balanceSheet(od,coa.STANDARD,{to:'2026-12-31'});
 assert.equal(b2.liabilities.debiti_finanziari.value_cents,5000);assert.ok(b2.balanced);
 // A prior-year result not yet closed stays in equity.
 const b3=ledger.balanceSheet([...od,E('2027-01-05',[L('03.01',7000,0),L('70.02',0,7000)])],coa.STANDARD,{to:'2027-06-30'});
 assert.ok(b3.balanced);assert.equal(b3.result_cents,7000);
 assert.equal(ledger.nextNumber([{date:'2026-01-01',number:'2026/0007'},{date:'2025-01-01',number:'2025/0100'}],2026),'2026/0008');
});

const purchase={type:'TD01',number:'45/A',date:'2026-04-10',rounding_cents:0,withholding:[],
 lines:[{description:'Abbonamento software gestionale',total_cents:30000},{description:'Canone fibra',total_cents:10000}],
 summary:[{vatRate:22,nature:null,taxable_cents:40000,vat_cents:8800,exigibility:'I'}],
 payments:[{due:'2026-05-10',amount_cents:24400},{due:'2026-06-10',amount_cents:24400}]};
const supplier={name:'Cloud Italia Srl',vat:'IT01234567890'};

test('purchase proposal: costs by keyword, VAT credit, supplier and two due dates',()=>{
 const p=posting.propose(purchase,supplier,{direction:'purchase'});
 assert.deepEqual(ledger.validateEntry(p.entry,coa.STANDARD),[]);
 const by=Object.fromEntries(p.entry.lines.map(l=>[l.account,l]));
 assert.equal(by['61.04'].debit_cents,30000);assert.equal(by['61.03'].debit_cents,10000);
 assert.equal(by['02.10'].debit_cents,8800);assert.equal(by['04.01'].credit_cents,48800);
 assert.equal(p.open_items.length,2);assert.equal(p.open_items[0].kind,'payable');
 assert.equal(p.vat[0].register,'acquisti');assert.equal(p.vat[0].deductible_vat_cents,8800);
 assert.equal(p.counterpart_key,'vat:IT01234567890');
 // Learned account wins; 40% deductible VAT puts 60% into non deductible cost.
 const q=posting.propose(purchase,supplier,{direction:'purchase',learned:{'vat:IT01234567890':'61.02'},deductiblePct:40});
 assert.equal(q.confidence,'alta');assert.deepEqual(ledger.validateEntry(q.entry,coa.STANDARD),[]);
 assert.equal(q.entry.lines.find(l=>l.account==='61.02').debit_cents,40000);
 assert.equal(q.entry.lines.find(l=>l.account==='65.03').debit_cents,5280);
 assert.equal(q.vat[0].deductible_vat_cents,3520);
});

test('professional invoice with withholding, credit note, reverse charge and split payment',()=>{
 const prof={...purchase,lines:[{description:'Consulenza fiscale',total_cents:100000}],summary:[{vatRate:22,taxable_cents:104000,vat_cents:22880,exigibility:'I'}],withholding:[{amount_cents:20000}],payments:[{due:'2026-04-30',amount_cents:106880}]};
 const p=posting.propose(prof,{name:'Studio Rossi'},{direction:'purchase'});
 assert.deepEqual(ledger.validateEntry(p.entry,coa.STANDARD),[]);
 assert.equal(p.entry.lines.find(l=>l.account==='04.01').credit_cents,106880);
 assert.equal(p.entry.lines.find(l=>l.account==='04.11').credit_cents,20000);
 assert.equal(p.entry.lines.find(l=>l.account==='61.01').debit_cents,104000);
 assert.equal(p.open_items[0].amount_cents,106880);
 const cn=posting.propose({...purchase,type:'TD04',payments:[]},supplier,{direction:'purchase'});
 assert.deepEqual(ledger.validateEntry(cn.entry,coa.STANDARD),[]);
 assert.equal(cn.entry.lines.find(l=>l.account==='04.01').debit_cents,48800);
 assert.equal(cn.vat[0].taxable_cents,-40000);assert.equal(cn.open_items[0].amount_cents,-48800);
 const rc=posting.propose({...purchase,summary:[{vatRate:0,nature:'N6.7',taxable_cents:50000,vat_cents:0}],lines:[{description:'Lavori edili',total_cents:50000}],payments:[]},{name:'Edil'},{direction:'purchase'});
 assert.deepEqual(ledger.validateEntry(rc.entry,coa.STANDARD),[]);
 assert.equal(rc.entry.lines.find(l=>l.account==='04.10').credit_cents,11000);
 assert.equal(rc.vat.length,2);assert.equal(rc.open_items[0].amount_cents,50000);
 const sp=posting.propose({type:'TD01',number:'12',date:'2026-04-02',lines:[{description:'Servizio',total_cents:100000}],summary:[{vatRate:22,taxable_cents:100000,vat_cents:22000,exigibility:'S'}],payments:[]},{name:'Comune di Milano'},{direction:'sale'});
 assert.deepEqual(ledger.validateEntry(sp.entry,coa.STANDARD),[]);
 assert.equal(sp.entry.lines.find(l=>l.account==='02.01').debit_cents,100000);
 assert.equal(sp.vat[0].vat_cents,22000);assert.equal(sp.vat[0].exigibility,'S');
 assert.equal(posting.directionFor({supplier:{vat:'IT111'},customer:{vat:'IT222'}},{vat:'111'}),'sale');
 assert.equal(posting.directionFor({supplier:{vat:'IT111'},customer:{taxCode:'RSSMRA'}},{taxCode:'rssmra'}),'purchase');
 assert.deepEqual(posting.allocate(100,[1,1,1]),[34,33,33]);
});

test('VAT periods, quarterly interest, threshold carry and credit carry',()=>{
 const q=vat.periods(2026,'quarterly');assert.equal(q[1].due,'2026-08-20');assert.equal(q[3].f24_code,'6099');assert.equal(vat.periods(2026,'monthly')[11].due,'2027-01-16');
 const rows=[
  {register:'vendite',date:'2026-01-20',rate:22,taxable_cents:1000000,vat_cents:220000},
  {register:'acquisti',date:'2026-02-03',rate:22,taxable_cents:200000,vat_cents:44000,deductible_vat_cents:44000},
  {register:'vendite',date:'2026-02-05',rate:22,taxable_cents:100000,vat_cents:22000,exigibility:'S'},
  {register:'vendite',date:'2026-03-01',rate:22,taxable_cents:100000,vat_cents:22000,exigibility:'D',paid_date:'2026-04-15'},
  {register:'acquisti',date:'2026-04-03',rate:22,taxable_cents:300000,vat_cents:66000,deductible_vat_cents:66000},
  {register:'vendite',date:'2026-07-01',rate:22,taxable_cents:10000,vat_cents:2200}
 ];
 const t1=vat.settle(rows,{periodicity:'quarterly',period:'2026-T1'});
 assert.equal(t1.vp2_cents,1200000);assert.equal(t1.vp4_cents,220000);assert.equal(t1.vp5_cents,44000);
 assert.equal(t1.vp12_cents,1760);assert.equal(t1.payable_cents,177760);assert.equal(t1.f24_code,'6031');
 const yr=vat.settleYear(rows,{year:2026,periodicity:'quarterly'});
 assert.equal(yr[1].vp4_cents,22000);assert.equal(yr[1].carry_credit_cents,44000);assert.equal(yr[1].status,'credito');
 assert.equal(yr[2].vp8_cents,44000);assert.equal(yr[2].carry_credit_cents,41800);
 const small=vat.settleYear([{register:'vendite',date:'2026-01-10',rate:22,taxable_cents:10000,vat_cents:2200}],{year:2026,periodicity:'monthly'});
 assert.equal(small[0].payable_cents,0);assert.equal(small[0].carry_debit_cents,2200);assert.equal(small[1].vp7_cents,2200);
 const reg=vat.registers(rows,{from:'2026-01-01',to:'2026-03-31'});assert.equal(reg.vendite[0].count,3);
 const e=vat.settlementEntry(t1);assert.deepEqual(ledger.validateEntry(e,coa.STANDARD),[]);
});

test('management: budget vs actual, margins by project, ageing, cash forecast, KPIs',()=>{
 const bva=mgmt.budgetVsActual(year,coa.STANDARD,[{key:'ricavi',month:1,amount_cents:800000},{key:'servizi',month:1,amount_cents:-150000}],{year:2026,months:3});
 const r=bva.find(x=>x.key==='ricavi');assert.equal(r.variance_cents,200000);assert.equal(r.variance_pct,25);assert.ok(r.favourable);
 assert.ok(bva.find(x=>x.key==='servizi').favourable);
 const dim=mgmt.byDimension(year,coa.STANDARD,'project');const p1=dim.find(d=>d.key==='P1');
 assert.equal(p1.margin_cents,900000);assert.equal(p1.margin_pct,90);
 const items=[{kind:'receivable',due:'2026-03-01',amount_cents:50000,paid_cents:10000,counterpart:'A'},{kind:'payable',due:'2026-04-20',amount_cents:30000},{kind:'receivable',due:'2025-11-01',amount_cents:1000}];
 const ag=mgmt.ageing(items,'2026-04-10');
 assert.equal(ag.receivable.d31_60,40000);assert.equal(ag.receivable.over_90,1000);assert.equal(ag.payable.not_due,30000);assert.equal(ag.overdue[0].days_late,160);
 const cf=mgmt.cashForecast(items,{today:'2026-04-10',opening_cents:5000,recurring:[{amount_cents:-20000,every:'month',day:27,label:'Stipendi'}]});
 assert.equal(cf.weeks[0].inflow_cents,41000);assert.equal(cf.weeks[1].outflow_cents,30000);
 assert.equal(cf.weeks.length,13);assert.ok(cf.first_negative);
 const k=mgmt.kpis(year,coa.STANDARD,items,{from:'2026-01-01',to:'2026-03-31'});
 assert.equal(k.cash_cents,1910000);assert.equal(k.ebitda_pct,60);assert.equal(k.receivables_cents,41000);
});

test('reconciliation scores amount, invoice number and name; rules classify bank fees',()=>{
 const items=[{id:'a',kind:'receivable',due:'2026-05-10',amount_cents:122000,doc_number:'2026/015',counterpart:'Rossi Costruzioni Srl'},{id:'b',kind:'receivable',due:'2026-05-12',amount_cents:122000,doc_number:'2026/016',counterpart:'Bianchi Spa'},{id:'c',kind:'payable',due:'2026-05-01',amount_cents:48800,doc_number:'45/A',counterpart:'Cloud Italia Srl'}];
 const rows=[{date:'2026-05-11',amount_cents:122000,description:'BONIFICO DA ROSSI COSTRUZIONI SAL FT 2026/015'},{date:'2026-05-02',amount_cents:-48800,description:'Bonifico a Cloud Italia fattura 45/A'},{date:'2026-05-31',amount_cents:-350,description:'Commissioni e spese tenuta conto'}];
 const s=rec.suggest(rows,items);
 assert.equal(s[0].match.item.id,'a');assert.ok(s[0].match.score>=90);
 assert.equal(s[1].match.item.id,'c');
 assert.equal(s[2].match,null);assert.equal(s[2].rule.account,'61.07');
 const e1=rec.entryFor(rows[0],{item:items[0]});assert.deepEqual(ledger.validateEntry(e1,coa.STANDARD),[]);assert.equal(e1.lines[1].account,'02.01');
 const e2=rec.entryFor(rows[2],{account:'61.07'});assert.equal(e2.lines[0].account,'61.07');assert.equal(e2.lines[1].credit_cents,350);
 assert.throws(()=>rec.entryFor(rows[2],{}),/Scegli/);
});
