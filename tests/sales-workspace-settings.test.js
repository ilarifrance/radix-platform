'use strict';
// Impostazioni › CRM › Valuta (api/_sales_workspace_settings.js, migration sales 021) and the currency it gives the pages
// (lib/radix-i18n.js «rx-ws-currency»). Stubs only: no database.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const W=require('../api/_sales_workspace_settings.js'),I=require('../lib/radix-i18n.js');
const ws='11111111-1111-4111-8111-111111111111';
test('command: only the currency, only a known code, upper case',()=>{
  assert.deepEqual(W.command({workspace:ws,entity:'workspace_settings',action:'update',data:{currency:'usd'}}).data,{currency:'USD'});
  for(const data of [{currency:'XYZ'},{currency:''},{currency:'EUR',name:'x'},{}])assert.throws(()=>W.command({workspace:ws,entity:'workspace_settings',action:'update',data}),e=>e.status===400);
  assert.throws(()=>W.command({workspace:'x',entity:'workspace_settings',action:'update',data:{currency:'EUR'}}),e=>e.status===400);
  assert.deepEqual(W.query({entity:'workspace_settings',workspace:ws,offset:'0'}),{workspace:ws,entity:'workspace_settings'});
});
test('handle: every member reads, owner/admin change; before migration 021 euro and a clear 503',async()=>{
  let cur='EUR';const sql=async(q,p)=>{if(/^UPDATE/.test(q))cur=p[1];return [{currency:cur}]};
  assert.deepEqual((await W.handle({workspace:ws},{sql,role:'viewer',method:'GET'})).settings,{currency:'EUR',plan:'prova',limits:{ai:100,lead:50,send:300},usage:{ai:0,lead:0,send:0}});
  await assert.rejects(W.handle({workspace:ws,data:{currency:'GBP'}},{sql,role:'member',method:'POST'}),e=>e.status===403);
  const r=await W.handle({workspace:ws,data:{currency:'GBP'}},{sql,role:'admin',method:'POST'});
  assert.equal(r.settings.currency,'GBP');assert.deepEqual(r.rows,[r.settings]);
  const old=async()=>{const e=new Error('column "currency" does not exist');e.code='42703';throw e};
  assert.deepEqual((await W.handle({workspace:ws},{sql:old,role:'owner',method:'GET'})).settings,{currency:'EUR',pending:true,plan:'extreme',limits:{ai:350,lead:300,send:1500},usage:{ai:0,lead:0,send:0}},'before 021 and 023: euro, every feature');
  await assert.rejects(W.handle({workspace:ws,data:{currency:'GBP'}},{sql:old,role:'owner',method:'POST'}),e=>e.status===503);
});
test('migration 021: one idempotent column with an ISO check, euro by default',()=>{
  const m=fs.readFileSync(path.join(__dirname,'../migrations/sales/021_workspace_currency.sql'),'utf8');
  assert.match(m,/ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'EUR'/);
  assert.match(m,/CHECK\(currency ~ '\^\[A-Z\]\{3\}\$'\)/);
  assert.doesNotMatch(m,/DROP TABLE|DELETE|TRUNCATE/);
});
test('i18n: any workspace currency replaces the euro sign; euro passes through',()=>{
  assert.equal(I.convert('€ 1.200','USD'),'$1.200');
  assert.equal(I.convert('1.200 €','CHF'),'CHF 1.200');
  assert.equal(I.convert('Valore (€)','GBP'),'Valore (£)');
  assert.equal(I.convert('€ 5','EUR'),'€ 5');
  assert.deepEqual(I.swap({style:'currency',currency:'EUR'},'USD'),{style:'currency',currency:'USD'});
  assert.deepEqual(I.swap({style:'currency',currency:'EUR'},'EUR'),{style:'currency',currency:'EUR'});
  const m=new Map(),win={localStorage:{getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)}};
  assert.equal(I.readWsCurrency(win),null);
  assert.equal(I.saveWsCurrency(win,'usd'),true);assert.equal(I.readWsCurrency(win),'USD');
  assert.equal(I.saveWsCurrency(win,'XYZ'),false);assert.equal(I.readWsCurrency(win),'USD');
  assert.ok(I.CODES.includes('EUR')&&I.CODES.includes('GBP')&&I.CODES.every(c=>/^[A-Z]{3}$/.test(c)));
});
test('i18n: the product host rule is the one of sales/crm-product.js',()=>{
  const src=fs.readFileSync(path.join(__dirname,'../lib/radix-i18n.js'),'utf8');
  const m=/const PRODUCT_HOST = (\/.*\/i);/.exec(src);assert.ok(m);
  assert.equal(m[1],String(require('../sales/crm-product.js').HOST_RE));
});
test('settings page and CRM: the Valuta card and the sync are wired',()=>{
  const st=fs.readFileSync(path.join(__dirname,'../shell/settings.js'),'utf8'),sa=fs.readFileSync(path.join(__dirname,'../sales/sales.js'),'utf8');
  assert.match(st,/currencyCard\(manage\)/);assert.match(st,/entity:'workspace_settings',action:'update'/);
  assert.match(sa,/syncCurrency\(\)/);
});
