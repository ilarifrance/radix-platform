'use strict';
// Two currencies on an opportunity (migration sales 025): sales/crm-fx.js, the workspace settings and the opportunity fields.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const F=require('../sales/crm-fx.js'),W=require('../api/_sales_workspace_settings.js'),S=require('../api/_sales.js');
const ws='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
test('core: amounts and rates as typed in Italian or English',()=>{
  assert.equal(F.parse('24.000'),2400000);assert.equal(F.parse('24,000.50'),2400050);assert.equal(F.parse('24000,5'),2400050);
  assert.equal(F.parse(''),null);assert.ok(Number.isNaN(F.parse('abc')));
  assert.equal(F.rate('1,15'),1.15);assert.equal(F.rate('0.8695652'),0.869565);assert.equal(F.rate(''),null);
  for(const bad of ['0','-1','1,2,3','x'])assert.ok(Number.isNaN(F.rate(bad)),bad);
  assert.equal(F.toSecond(1000000,1.15),1150000);assert.equal(F.toMain(2300000,1.15),2000000);
  assert.equal(F.toSecond(null,1.15),null);assert.equal(F.toMain(100,0),null);
  assert.equal(F.fmt(2000000),'20000');assert.equal(F.fmt(2000050),'20000,50');assert.equal(F.fmtRate(1.15),'1,15');
});
test('settings: second currency and rate, checked before the database',()=>{
  const cmd=data=>W.command({workspace:ws,entity:'workspace_settings',action:'update',data});
  assert.deepEqual(cmd({second_currency:'eur',exchange_rate:1.1500004}).data,{second_currency:'EUR',exchange_rate:1.15});
  assert.deepEqual(cmd({second_currency:null,exchange_rate:null}).data,{second_currency:null,exchange_rate:null});
  for(const data of [{second_currency:'XYZ'},{exchange_rate:0},{exchange_rate:-2},{exchange_rate:'1.15'},{exchange_rate:1e7},{currency:'GBP',second_currency:'GBP'}])assert.throws(()=>cmd(data),e=>e.status===400,JSON.stringify(data));
});
test('settings: before migration 025 a change answers a clear 503; the rate is read as a number',async()=>{
  const old=async q=>{if(/second_currency|exchange_rate/.test(q)){const e=new Error('missing');e.code='42703';throw e}return [{currency:'GBP'}]};
  await assert.rejects(W.handle({workspace:ws,data:{second_currency:'EUR'}},{sql:old,role:'owner',method:'POST'}),e=>e.status===503&&/025/.test(e.message));
  const sql=async q=>/second_currency/.test(q)?[{second_currency:'EUR',exchange_rate:'1.150000'}]:[{currency:'GBP'}];
  const s=(await W.handle({workspace:ws},{sql,role:'viewer',method:'GET'})).settings;
  assert.equal(s.second_currency,'EUR');assert.equal(s.exchange_rate,1.15);assert.equal(s.fx_pending,undefined);
});
test('opportunity: second amount, rate and added fields are accepted and checked',()=>{
  const cmd=data=>S.command({workspace:ws,entity:'opportunities',action:'update',data:{id,version:1,...data}});
  const ok=cmd({amount2_cents:2300000,exchange_rate:1.15,custom:{[id]:' FOB '}}).data;
  assert.equal(ok.amount2_cents,2300000);assert.equal(ok.exchange_rate,1.15);assert.deepEqual(ok.custom,{[id]:'FOB'});
  assert.equal(cmd({amount2_cents:null,exchange_rate:null}).data.amount2_cents,null);
  for(const data of [{amount2_cents:-1},{amount2_cents:1.5},{exchange_rate:0},{exchange_rate:'1'},{custom:{x:'y'}}])assert.throws(()=>cmd(data),e=>e.status===400,JSON.stringify(data));
});
test('migration 025: idempotent columns, no data loss, opportunities among the entities with added fields',()=>{
  const m=fs.readFileSync(path.join(__dirname,'../migrations/sales/025_deal_fields_exchange.sql'),'utf8');
  for(const c of ['second_currency text','exchange_rate numeric(14,6)','amount2_cents bigint',"custom jsonb NOT NULL DEFAULT '{}'::jsonb"])assert.ok(m.includes('ADD COLUMN IF NOT EXISTS '+c),c);
  assert.match(m,/CHECK\(entity IN \('companies','contacts','opportunities'\)\)/);
  assert.match(m,/'amount2_cents','exchange_rate','custom'\] ELSE/);
  assert.doesNotMatch(m,/DROP TABLE|DROP COLUMN|DELETE FROM sales_(?!custom_fields)|TRUNCATE/);
  assert.ok(m.trimStart().startsWith('--')&&/\nBEGIN;/.test(m)&&m.trimEnd().endsWith('COMMIT;'));
});
