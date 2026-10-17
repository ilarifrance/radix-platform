'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const coa=require('../lib/accounting/chart-of-accounts');
const ledger=require('../lib/accounting/ledger');
const assets=require('../lib/accounting/assets');
const copilot=require('../lib/accounting/copilot');
const demo=require('../accounting/demo-data');
const {createHandler}=require('../api/_accounting');
const A=coa.STANDARD;
const post=(id,date,lines,extra)=>({id,date,description:'x',status:'posted',number:'n'+id,lines,...extra});

test('register reads assets from posted debits on fixed-asset accounts, not the fund',()=>{
 const e=[post('a','2025-03-10',[{account:'01.12',debit_cents:200000},{account:'02.10',debit_cents:44000},{account:'04.01',credit_cents:244000}]),
  post('b','2025-05-01',[{account:'01.90',debit_cents:100},{account:'03.01',credit_cents:100}]),
  {...post('c','2025-06-01',[{account:'01.13',debit_cents:900000},{account:'03.01',credit_cents:900000}]),status:'draft'}];
 const r=assets.register(e,A);assert.equal(r.length,1);assert.deepEqual([r[0].account,r[0].cost_cents,r[0].date],['01.12',200000,'2025-03-10']);
});

test('straight-line schedule: half rate in year one, residual in the last year, small assets in one year',()=>{
 const s=assets.schedule({account:'01.12',date:'2025-03-10',cost_cents:200000});
 assert.equal(s.rate,20);assert.deepEqual(s.years.map(y=>y.amount_cents),[20000,40000,40000,40000,40000,20000]);
 assert.equal(s.years.at(-1).residual_cents,0);
 assert.deepEqual(assets.schedule({account:'01.13',date:'2025-01-01',cost_cents:50000}).years.map(y=>y.amount_cents),[50000]);
 assert.deepEqual(assets.schedule({account:'01.13',date:'2025-01-01',cost_cents:50000},{smallFull:false,rate:50,halfFirstYear:false}).years.map(y=>y.amount_cents),[25000,25000]);
 assert.deepEqual(assets.schedule({account:'01.99',date:'2025-01-01',cost_cents:1}).years,[]);
});

test('depreciation entry balances, splits intangible and tangible and is detected once posted',()=>{
 const e=[post('a','2025-03-10',[{account:'01.12',debit_cents:200000,project:'P1'},{account:'03.01',credit_cents:200000}]),
  post('b','2026-02-01',[{account:'01.01',debit_cents:300000},{account:'03.01',credit_cents:300000}])];
 const d=assets.depreciation(e,A,2026);
 assert.equal(d.total_cents,40000+30000);assert.deepEqual(ledger.validateEntry(d.entry,A),[]);
 assert.deepEqual(d.entry.lines.map(l=>[l.account,l.debit_cents,l.credit_cents]),[['64.01',30000,0],['64.02',40000,0],['01.90',0,70000]]);
 assert.equal(d.entry.lines[1].project,'P1');
 assert.equal(assets.depreciation(e,A,2026,{rates:{'01.12':10}}).rows.find(r=>r.account==='01.12').amount_cents,20000);
 const booked=[...e,post('dep',d.entry.date,d.entry.lines,{source:d.entry.source})];
 assert.deepEqual(assets.depreciation(booked,A,2026).existing,['dep']);
 assert.deepEqual(assets.depreciation([...booked,post('st','2026-12-31',[],{reverses:'dep'})],A,2026).existing,[]);
 // The fund reduces fixed assets in the balance sheet and the books still balance.
 const bs=ledger.balanceSheet(booked,A,{to:'2026-12-31'});assert.ok(bs.balanced);assert.equal(bs.assets.immobilizzazioni.value_cents,500000-70000);
});

test('ratei e risconti: pro-rata by days, right accounts, reversal on 1 January',()=>{
 const r=assets.accrual({kind:'risconto_attivo',account:'61.08',amount_cents:240000,from:'2026-07-01',to:'2027-06-30',closing:'2026-12-31'},A);
 assert.equal(r.days_total,365);assert.equal(r.days_after,181);assert.equal(r.amount_cents,Math.round(240000*181/365));
 assert.deepEqual(r.entry.lines.map(l=>[l.account,l.debit_cents,l.credit_cents]),[['02.30',r.amount_cents,0],['61.08',0,r.amount_cents]]);
 assert.equal(r.reversal.date,'2027-01-01');assert.deepEqual(r.reversal.lines.map(l=>[l.account,l.debit_cents]),[['02.30',0],['61.08',r.amount_cents]]);
 const rp=assets.accrual({kind:'rateo_passivo',account:'61.03',amount_cents:90000,from:'2026-11-01',to:'2027-01-31'},A);
 assert.equal(rp.amount_cents,Math.round(90000*61/92));assert.deepEqual(rp.entry.lines.map(l=>l.account),['61.03','04.50']);
 assert.deepEqual(assets.accrual({kind:'rateo_attivo',account:'70.02',amount_cents:1000,from:'2026-12-01',to:'2027-01-30'},A).entry.lines.map(l=>l.account),['02.31','70.02']);
 assert.deepEqual(assets.accrual({kind:'risconto_passivo',account:'70.02',amount_cents:1000,from:'2026-12-01',to:'2027-01-30'},A).entry.lines.map(l=>l.account),['70.02','04.51']);
 assert.throws(()=>assets.accrual({kind:'risconto_attivo',account:'70.02',amount_cents:1,from:'2026-07-01',to:'2027-06-30'},A),/costo/);
 assert.throws(()=>assets.accrual({kind:'risconto_attivo',account:'61.08',amount_cents:1,from:'2026-01-01',to:'2026-06-30'},A),/chiusura/);
 assert.throws(()=>assets.accrual({kind:'x'},A),/Tipo/);
 for(const k of ['02.30','02.31','04.50','04.51'])assert.ok(A.some(a=>a.code===k));
 assert.deepEqual(coa.validate(A),[]);
});

async function demoBundle(today){const s=demo.createStore();await demo.seed(s,today);return {s,b:await s.bundle(+today.slice(0,4))};}

test('copilot checks, month close and snapshot come from the engine',async()=>{
 const {s,b}=await demoBundle('2026-12-20');
 const checks=copilot.anomalies(b,{year:2026,today:'2026-12-20'});
 assert.ok(checks.some(c=>c.code==='depreciation_missing'),'year-end reminder for depreciation');
 assert.ok(checks.every(c=>['alta','media','bassa'].includes(c.level)&&c.title&&c.tab));
 const mc=copilot.monthClose(b,{year:2026,month:12,today:'2026-12-20'});assert.ok(mc.items.some(i=>i.key==='depreciation'&&!i.done));
 await s.command('closing.depreciation',{year:2026});
 await assert.rejects(s.command('closing.depreciation',{year:2026}),/già registrati/);
 await s.command('closing.accrual',{kind:'risconto_attivo',account:'61.08',amount_cents:240000,from:'2026-07-01',to:'2027-06-30'});
 const b2=await s.bundle(2026),p=b2.entries.filter(e=>e.status==='posted');
 assert.ok(ledger.balanceSheet(p,b2.accounts,{to:'2026-12-31'}).balanced);
 assert.ok(!copilot.anomalies(b2,{year:2026,today:'2026-12-20'}).some(c=>c.code==='depreciation_missing'));
 assert.ok(copilot.monthClose(b2,{year:2026,month:12,today:'2026-12-20'}).items.find(i=>i.key==='accruals').done);
 const snap=copilot.snapshot(b2,{year:2026,today:'2026-12-20'});
 assert.equal(snap.azienda.nome,demo.COMPANY.name);assert.ok(snap.kpi.ricavi>0);assert.equal(snap.cassa_13_settimane.length,13);
 assert.ok(JSON.stringify(snap).length<40000,'snapshot stays small');
 const pr=copilot.prompt(snap,'Come va?',[{role:'assistant',content:'ciao'},{role:'user',content:'prima'},{role:'assistant',content:'risposta'},{role:'system',content:'x'}]);
 assert.match(pr.system,/SITUAZIONE \(JSON\)/);assert.deepEqual(pr.messages.map(m=>m.role),['user','assistant','user']);assert.equal(pr.messages.at(-1).content,'Come va?');
});

test('duplicate purchase invoices and negative cash are flagged',()=>{
 const b={company:{name:'X',vat_periodicity:'quarterly',plan:'base'},accounts:A.map(a=>({...a})),entries:[post('a','2026-03-01',[{account:'61.01',debit_cents:5000},{account:'03.01',credit_cents:5000}])],
  documents:[{direction:'purchase',status:'registered',number:'1',date:'2026-03-01',total_cents:12200,counterpart_vat:'IT1',counterpart_name:'Forn'},{direction:'purchase',status:'to_review',number:'1bis',date:'2026-03-04',total_cents:12200,counterpart_vat:'IT1',counterpart_name:'Forn'}],
  vat_rows:[],open_items:[],bank:[],budget:[],settlements:[]};
 const codes=copilot.anomalies(b,{year:2026,today:'2026-03-10'}).map(c=>c.code);
 assert.ok(codes.includes('duplicate_invoice'));assert.ok(codes.includes('negative_cash'));assert.equal(codes[0],'negative_cash');
});

// API: fake store as in accounting-api.test.js.
const C='11111111-1111-4111-8111-111111111111';
function call(handler,body){return new Promise(resolve=>{const res={headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;},status(c){this.statusCode=c;return this;},json(o){resolve({status:this.statusCode,body:o});return this;}};
 handler({method:'POST',body,query:{},headers:{'content-type':'application/json','x-radix-accounting':'1'}},res);});}
async function liveLike(today){const {b}=await demoBundle(today);b.company={...b.company,id:C,role:'owner'};b.accounts=b.accounts.map(a=>({code:a.code,name:a.name,kind:a.kind,group:a.group}));return b;}
function store(b){const txs=[];return {txs,json:async t=>{if(t.includes("'company',(SELECT"))return b;if(t.includes('FROM acc_accounts'))return b.accounts;return null;},tx:async q=>{txs.push(q);return q.map(()=>[{n:1}]);}};}

test('closing commands: role first, accounts ensured, guarded against doubles',async()=>{
 const b=await liveLike('2026-12-20'),st=store(b),H=createHandler({getSessionUser:()=>({uid:7}),getStore:()=>st});
 const r=await call(H,{company:C,action:'closing.depreciation',data:{year:2026,rates:{'01.12':25}}});
 assert.equal(r.status,200,JSON.stringify(r.body));const q=st.txs[0];
 assert.match(q[0][0],/acc_role/);assert.deepEqual(q[0][1][2],['owner','admin','accountant']);
 assert.match(q[1][0],/ON CONFLICT\(company_id,code\) DO NOTHING/);assert.match(q[2][0],/'depreciation'/);
 assert.ok(q.some(([t,p])=>/INSERT INTO acc_entries/.test(t)&&JSON.parse(p[4]).type==='depreciation'));
 assert.equal((await call(H,{company:C,action:'closing.depreciation',data:{year:2026,rates:{'01.12':0}}})).status,400);
 const a=await call(H,{company:C,action:'closing.accrual',data:{kind:'risconto_attivo',account:'61.08',amount_cents:240000,from:'2026-07-01',to:'2027-06-30',closing:'2026-12-31'}});
 assert.equal(a.status,200,JSON.stringify(a.body));const qa=st.txs[1],entries=qa.filter(([t])=>/INSERT INTO acc_entries/.test(t));
 assert.equal(entries.length,2);assert.equal(entries[1][1][5],entries[0][1][1],'reopening points to the accrual');assert.equal(entries[1][1][2],'2027-01-01');
 assert.equal((await call(H,{company:C,action:'closing.accrual',data:{kind:'risconto_attivo',account:'70.02',amount_cents:1,from:'2026-07-01',to:'2027-06-30'}})).status,400);
});

test('copilot: live companies use the server snapshot, demo sends its own, errors stay generic',async()=>{
 const b=await liveLike('2026-10-17'),st=store(b);let seen=null;
 const H=ask=>createHandler({getSessionUser:()=>({uid:7}),getStore:()=>st,ask});
 const ok=await call(H(async p=>{seen=p;return {text:'Va bene.'};}),{company:C,action:'copilot.ask',data:{question:'Come va?',year:2026,context:{falso:true}}});
 assert.equal(ok.status,200);assert.equal(ok.body.answer,'Va bene.');assert.match(seen.system,/Officina Digitale Demo/);assert.doesNotMatch(seen.system,/falso/);
 const demoCtx=await call(H(async p=>{seen=p;return {text:'ok'};}),{action:'copilot.ask',data:{question:'?',context:{azienda:{nome:'Demo X'}}}});
 assert.equal(demoCtx.status,200);assert.match(seen.system,/Demo X/);
 assert.equal((await call(H(async()=>({text:'x'})),{action:'copilot.ask',data:{question:'?'}})).status,400);
 assert.equal((await call(H(undefined),{company:C,action:'copilot.ask',data:{question:'?'}})).status,503);
 assert.equal((await call(H(async()=>null),{company:C,action:'copilot.ask',data:{question:'?'}})).status,503);
 const boom=await call(H(async()=>{throw Object.assign(new Error('secret upstream detail'),{status:529});}),{company:C,action:'copilot.ask',data:{question:'?'}});
 assert.equal(boom.status,503);assert.doesNotMatch(boom.body.error,/secret/);
 assert.equal((await call(H(async()=>({refused:true})),{company:C,action:'copilot.ask',data:{question:'?'}})).body.refused,true);
 assert.equal((await call(H(async()=>({text:'x'})),{company:C,action:'copilot.ask',data:{question:'?',history:[{role:'system',content:'x'}]}})).status,400);
 assert.equal(st.txs.length,0,'the copilot never writes');
});

test('bank import accepts CAMT.053 with the same rows as CSV',async()=>{
 const st=store({}),H=createHandler({getSessionUser:()=>({uid:7}),getStore:()=>st});
 const xml=fs.readFileSync('tests/fixtures/accounting/camt/camt053-v02-banca-italiana.xml','utf8');
 const r=await call(H,{company:C,action:'bank.import',data:{camt:xml}});
 assert.equal(r.status,200,JSON.stringify(r.body));const rows=JSON.parse(st.txs[0][2][1][2]);assert.equal(rows.length,5);assert.ok(rows.every(x=>x.fingerprint&&Number.isInteger(x.amount_cents)));
 assert.equal((await call(H,{company:C,action:'bank.import',data:{camt:'<x/>'}})).status,400);
});

test('page loads the new libraries and the shell lists the new sections',()=>{
 const html=fs.readFileSync('accounting/index.html','utf8');
 for(const lib of ['assets','copilot','p7m','camt'])assert.ok(html.includes('/lib/accounting/'+lib+'.js'),lib);
 assert.ok(html.indexOf('/lib/accounting/assets.js')<html.indexOf('/lib/accounting/copilot.js'));
 const shell=fs.readFileSync('shell/radix-shell.js','utf8');assert.match(shell,/#chiusure/);assert.match(shell,/#copilota/);
 assert.match(fs.readFileSync('api/accounting.js','utf8'),/require\('@anthropic-ai\/sdk'\)/);
});
