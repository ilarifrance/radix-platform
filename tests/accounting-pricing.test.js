'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const pricing=require('../lib/accounting/pricing');
const {createHandler}=require('../api/_accounting');

test('39 € a month stays above cost: every scenario under the 15 € ceiling',()=>{
 assert.equal(pricing.PRICE_CENTS,3900);assert.equal(pricing.COST_CAP_CENTS,1500);
 for(const [k,s] of Object.entries(pricing.SCENARIOS)){const m=pricing.monthly(s);
  assert.ok(m.within_cap,k+' costs '+m.total_cents);assert.equal(m.margin_cents,3900-m.total_cents);
  assert.equal(m.total_cents,m.rows.reduce((t,r)=>t+r.cents,0));}
 // Card fee on 39 € + 22 % VAT = 47,58 €: 1,5 % + 0,25 €.
 assert.equal(pricing.monthly().rows.find(r=>r.key==='payment').cents,Math.round(4758*0.015+25));
 assert.equal(pricing.monthly({bank_feed:false}).rows.find(r=>r.key==='bank').cents,0);
 // A heavier client than the plan includes would break the ceiling: that is why the plan has limits.
 assert.equal(pricing.monthly({companies:10,invoices:200,bank_accounts:3,questions:200}).within_cap,false);
});

test('the partner firm is a declared placeholder and the page shows the price',()=>{
 assert.equal(pricing.PARTNER.fictitious,true);
 // The partner fee is included: every plan costs 39 € and the budget left for the firm is what the ceiling allows.
 for(const p of Object.values(pricing.PLANS))assert.equal(p.price_cents,3900);
 assert.equal(pricing.PLANS.professionista.partner,true);
 for(const s of Object.values(pricing.SCENARIOS))assert.equal(pricing.partnerBudget(s),1500-pricing.monthly(s).total_cents);
 assert.equal(pricing.monthly(pricing.SCENARIOS.tipico,{...pricing.UNIT,partner:500}).total_cents,pricing.monthly(pricing.SCENARIOS.tipico).total_cents+500);assert.match(pricing.PARTNER.name,/fittizio/);
 const html=fs.readFileSync(__dirname+'/../accounting/index.html','utf8'),app=fs.readFileSync(__dirname+'/../accounting/app.js','utf8');
 assert.match(html,/\/lib\/accounting\/pricing\.js/);assert.match(app,/PRICE\.PARTNER\.name/);assert.match(app,/PRICE\.PRICE_CENTS/);
});

const C='11111111-1111-4111-8111-111111111111';
function call(handler,body){return new Promise(resolve=>{const res={headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;},status(c){this.statusCode=c;return this;},json(o){resolve({status:this.statusCode,body:o});return this;}};
 handler({method:'POST',body,query:{},headers:{'content-type':'application/json','x-radix-accounting':'1'}},res);});}
const bundle={company:{id:C,name:'Alfa Srl',role:'owner',vat_periodicity:'quarterly'},accounts:[],entries:[],documents:[],vat_rows:[],open_items:[],bank:[],budget:[],settlements:[],members:[],audit:[]};

test('copilot allowance: counted per company and month in the audit log, 429 when used up',async()=>{
 let used=0;const st={json:async t=>t.includes("'company',(SELECT")?bundle:t.includes('count(*)::int')?used:null,
  tx:async q=>{const lim=q[1][1][1];if(used>=lim){const e=new Error('Hai usato tutte le domande al copilota incluse questo mese.');e.code='P0429';throw e;}used++;return [];}};
 const H=createHandler({getSessionUser:()=>({uid:3}),getStore:()=>st,ask:async()=>({text:'ok'})});
 const r=await call(H,{company:C,action:'copilot.ask',data:{question:'Come va?'}});
 assert.equal(r.status,200);assert.deepEqual([r.body.used,r.body.limit],[1,pricing.INCLUDED.copilot_questions]);
 used=pricing.INCLUDED.copilot_questions;
 const over=await call(H,{company:C,action:'copilot.ask',data:{question:'Ancora?'}});
 assert.equal(over.status,429);assert.match(over.body.error,/domande/);
});

test('demo copilot has a daily allowance per user',async()=>{
 const H=createHandler({getSessionUser:()=>({uid:991}),getStore:()=>({}),ask:async()=>({text:'ok'})});
 const body={action:'copilot.ask',data:{question:'?',context:{azienda:{nome:'Demo'}}}};
 for(let i=0;i<20;i++)assert.equal((await call(H,body)).status,200);
 const r=await call(H,body);assert.equal(r.status,429);assert.match(r.body.error,/prova/);
});
