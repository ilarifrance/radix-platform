'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createHandler}=require('../api/_accounting');
const demo=require('../accounting/demo-data');
const ledger=require('../lib/accounting/ledger');
const C='11111111-1111-4111-8111-111111111111';
// Fake store: records transactions, answers reads from a map keyed by SQL fragments.
function fakeStore(reads={}){
 const txs=[];return {txs,json:async t=>{for(const [k,v] of Object.entries(reads))if(t.includes(k))return typeof v==='function'?v():v;return null;},tx:async q=>{txs.push(q);return q.map(()=>[{n:1}]);}};
}
function call(handler,{method='POST',body,query,user={uid:7},headers}){
 return new Promise(resolve=>{const res={headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;},status(c){this.statusCode=c;return this;},json(o){resolve({status:this.statusCode,body:o});return this;}};
  handler({method,body,query:query||{},headers:{'content-type':'application/json','x-radix-accounting':'1',...headers}},res);});
}
const H=(store)=>createHandler({getSessionUser:()=>({uid:7}),getStore:()=>store});

test('requires login, the custom header and a known action',async()=>{
 const st=fakeStore();
 assert.equal((await call(createHandler({getSessionUser:()=>null,getStore:()=>st}),{body:{}})).status,401);
 assert.equal((await call(H(st),{body:{action:'x',data:{}},headers:{'x-radix-accounting':undefined}})).status,403);
 assert.equal((await call(H(st),{body:{company:C,action:'nope',data:{}}})).body.error,'Azione non riconosciuta.');
 assert.equal((await call(H(st),{method:'GET',query:{resource:'bundle',company:'bad'}})).status,400);
 assert.equal((await call(H(st),{method:'DELETE'})).status,405);
 assert.equal(st.txs.length,0);
});

test('company creation seeds the standard chart and makes the creator owner',async()=>{
 const st=fakeStore();const r=await call(H(st),{body:{action:'company.create',data:{name:'Rossi Srl',vat:'01234567890',vat_periodicity:'monthly'}}});
 assert.equal(r.status,200);const q=st.txs[0];
 assert.match(q[0][0],/INSERT INTO acc_companies/);assert.equal(q[0][1][2],'IT01234567890');assert.equal(q[0][1][6],'monthly');
 assert.match(q[1][0],/'owner'/);assert.equal(JSON.parse(q[2][1][1]).length,require('../lib/accounting/chart-of-accounts').STANDARD.length);
 assert.equal((await call(H(st),{body:{action:'company.create',data:{name:'X',vat:'IT123'}}})).body.error,'Partita IVA non valida.');
});

test('entries are validated before the database and every write checks the role first',async()=>{
 const accounts=require('../lib/accounting/chart-of-accounts').STANDARD.map(a=>({code:a.code,name:a.name,kind:a.kind,group:a.group}));
 const st=fakeStore({'FROM acc_accounts':accounts});
 const bad=await call(H(st),{body:{company:C,action:'entry.save',data:{date:'2026-03-01',description:'x',lines:[{account:'03.01',debit_cents:100},{account:'70.02',credit_cents:90}]}}});
 assert.equal(bad.status,400);assert.match(bad.body.error,/non bilanciata/);assert.equal(st.txs.length,0);
 const ok=await call(H(st),{body:{company:C,action:'entry.save',data:{date:'2026-03-01',description:'Incasso',lines:[{account:'03.01',debit_cents:100},{account:'70.02',credit_cents:100}],post:true}}});
 assert.equal(ok.status,200);const q=st.txs[0];
 assert.match(q[0][0],/acc_role/);assert.deepEqual(q[0][1].slice(0,2),[C,7]);
 assert.ok(q.some(([t])=>/status='posted'/.test(t)));
 assert.equal((await call(H(st),{body:{company:C,action:'entry.save',data:{date:'2026-03-01',description:'x',lines:[{account:'03.01',debit_cents:1,evil:1},{account:'70.02',credit_cents:1}]}}})).status,400);
});

test('database errors become Italian messages without leaking internals',async()=>{
 const err=(code,message,extra)=>({json:async()=>[],tx:async()=>{throw Object.assign(new Error(message),{code},extra||{});}});
 const body={company:C,action:'budget.save',data:{year:2026,rows:[]}};
 assert.equal((await call(H(err('42501','forbidden')),{body})).body.error,'Permessi insufficienti per questa azione.');
 assert.equal((await call(H(err('40001','conflict')),{body})).status,409);
 assert.equal((await call(H(err('42P01','relation "acc_x" does not exist')),{body})).status,503);
 const chk=await call(H(err('23514','new row violates check constraint "x"',{constraint:'x'})),{body});assert.equal(chk.status,400);assert.equal(chk.body.error,'Dati non validi.');
 assert.equal((await call(H(err('P0001','Periodo chiuso: fino alla data di blocco non si registra più nulla')),{body})).body.error,'Periodo chiuso: fino alla data di blocco non si registra più nulla');
 assert.match((await call(H(err('XX000','boom')),{body})).body.error,/non disponibile/);
});

test('page script parses and loads only shared libraries; studio keeps the v3.7 agents',()=>{
 const html=fs.readFileSync('accounting/index.html','utf8');
 for(const lib of ['chart-of-accounts','ledger','fatturapa','bank-csv','posting','vat','management','reconcile'])assert.ok(html.includes('/lib/accounting/'+lib+'.js'),lib);
 assert.doesNotThrow(()=>new vm.Script(fs.readFileSync('accounting/app.js','utf8')));
 assert.doesNotMatch(fs.readFileSync('accounting/app.js','utf8'),/localStorage|sessionStorage/);
 assert.ok(fs.readFileSync('accounting/studio.html','utf8').includes('data-area="accounting"'));
 assert.match(fs.readFileSync('shell/radix-shell.js','utf8'),/\/accounting\/studio\.html/);
});

test('demonstration company is generated through the real engine and balances',async()=>{
 const s=demo.createStore();await demo.seed(s,'2026-10-16');const b=await s.bundle(2026);
 assert.equal(b.company.name,demo.COMPANY.name);
 const posted=b.entries.filter(e=>e.status==='posted');
 assert.ok(posted.length>50);assert.ok(ledger.trialBalance(posted,b.accounts).balanced);
 assert.ok(ledger.balanceSheet(posted,b.accounts,{to:'2026-12-31'}).balanced);
 assert.ok(b.documents.some(d=>d.status==='to_review'));assert.ok(b.bank.some(m=>m.status==='new'));
 assert.ok(b.entries.every(e=>e.date<='2026-10-16'));
 await assert.rejects(s.command('entry.save',{date:'2026-10-01',description:'x',lines:[{account:'03.01',debit_cents:1},{account:'70.02',credit_cents:2}]}),/non bilanciata/);
});
