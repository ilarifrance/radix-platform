'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{Readable}=require('node:stream');
process.env.JWT_SECRET=process.env.JWT_SECRET||'test-secret';
const F=require('../lib/accounting/fee-invoice'),P=require('../lib/accounting/fatturapa');
const billing=require('../api/_accounting_billing'),auth=require('../api/_auth'),{createHandler}=require('../api/_accounting');

const SELLER={name:'RADIX Servizi Srl',vat:'IT01234567897',address:'Via Roma 1',zip:'20121',city:'Milano',province:'MI',regime_fiscale:'RF01'};
const BUYER={name:'Alfa & Figli <Srl>',vat:'IT09876543210',address:'Via Po 2',zip:'10121',city:'Torino',province:'TO',sdi_code:'M5UXCR1'};
const C='22222222-2222-4222-8222-222222222222',ID='33333333-3333-4333-8333-333333333333';

test('fee invoice: valid FatturaPA that the RADIX parser reads back with the amount charged',()=>{
 const t=F.split(8418);assert.deepEqual(t,{net_cents:6900,vat_cents:1518,gross_cents:8418,rate:22});
 for(const g of [4758,4759,16958,1])assert.equal(F.split(g).net_cents+F.split(g).vat_cents,g);
 const xml=F.build(SELLER,BUYER,{number:'2026/7',date:'2026-10-18',progressive:F.progressive(2026,7),gross_cents:8418,lines:[{description:'RADIX Contabilità, pacchetto Crescita',net_cents:6900}]});
 const r=P.parse(xml),d=r.documents[0];assert.deepEqual(r.warnings,[]);
 assert.equal(r.format,'FPR12');assert.equal(r.supplier.name,SELLER.name);assert.equal(r.customer.name,BUYER.name,'special characters are escaped');
 assert.equal(d.type,'TD01');assert.equal(d.total_cents,8418);assert.equal(d.summary[0].taxable_cents,6900);assert.equal(d.summary[0].vat_cents,1518);assert.equal(d.payments[0].method,'MP08');
 assert.match(xml,/<CodiceDestinatario>M5UXCR1<\/CodiceDestinatario>/);
 const pec=F.build(SELLER,{...BUYER,sdi_code:null,pec:'alfa@pec.it'},{number:'1',date:'2026-10-18',progressive:'26001',gross_cents:4758,lines:[{description:'x',net_cents:3900}]});
 assert.match(pec,/<CodiceDestinatario>0000000<\/CodiceDestinatario><PECDestinatario>alfa@pec.it<\/PECDestinatario>/);
 assert.equal(F.fileName(SELLER,F.progressive(2026,7)),'IT01234567897_26007.xml');assert.equal(F.progressive(2026,1295),'260ZZ');
 assert.throws(()=>F.build(SELLER,{...BUYER,zip:'123'},{number:'1',date:'2026-10-18',progressive:'26001',gross_cents:4758,lines:[{description:'x',net_cents:3900}]}),/CAP/);
 assert.throws(()=>F.build({...SELLER,regime_fiscale:null},BUYER,{number:'1',date:'2026-10-18',progressive:'26001',gross_cents:4758,lines:[{description:'x',net_cents:3900}]}),/regime fiscale/);
 assert.throws(()=>F.build(SELLER,BUYER,{number:'1',date:'2026-10-18',progressive:'26001',gross_cents:4758,lines:[{description:'x',net_cents:3800}]}),/non tornano/);
 assert.deepEqual(F.missing({name:'A',tax_code:'RSSMRA80A01F205X',address:'x',zip:'00100',city:'Roma',province:'RM'}),['codice destinatario o PEC']);
});

test('Stripe invoice.paid records the next numbered fee invoice with the buyer snapshot, once',async()=>{
 process.env.STRIPE_WEBHOOK_SECRET='whsec_test';const txs=[];const st={json:async()=>null,tx:async q=>{txs.push(q);return [];}};
 const send=(raw,header)=>new Promise(resolve=>{const req=Readable.from([Buffer.from(raw)]);Object.assign(req,{method:'POST',query:{},headers:{'stripe-signature':header}});
  const res={headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;},status(c){this.statusCode=c;return this;},json(o){resolve({status:this.statusCode,body:o});return this;}};billing.webhook(st,req,res).then(o=>res.status(200).json(o),e=>res.status(e.status||500).json({error:e.message}));});
 const ev={id:'evt_inv',type:'invoice.paid',created:1792300000,data:{object:{id:'in_1',amount_paid:8418,status_transitions:{paid_at:1792300000},
  parent:{subscription_details:{subscription:'sub_1',metadata:{company_id:C}}},lines:{data:[{period:{start:1792300000,end:1794978400}}]}}}};
 const t=Math.floor(Date.now()/1000),raw=JSON.stringify(ev);
 const r=await send(raw,'t='+t+',v1='+crypto.createHmac('sha256','whsec_test').update(t+'.'+raw).digest('hex'));assert.equal(r.status,200,JSON.stringify(r.body));
 const [ev1,ins]=txs[0];assert.match(ins[0],/INSERT INTO acc_fee_invoices/);assert.match(ins[0],/ON CONFLICT\(stripe_invoice\) DO NOTHING/);assert.match(ins[0],/max\(number\)/);
 assert.equal(ins[1][0],C);assert.equal(ins[1][1],'sub_1');assert.equal(ins[1][2],2026);assert.equal(ins[1][3],'2026-10-18');assert.match(ins[1][4],/^ dal 18\/10\/2026 al 17\/11\/2026$/);
 assert.deepEqual(ins[1].slice(5,9),[6900,1518,8418,'in_1']);
 // A zero invoice (trial, coupon) issues nothing.
 txs.length=0;const z={...ev,id:'evt_zero',data:{object:{...ev.data.object,id:'in_0',amount_paid:0}}},rz=JSON.stringify(z);
 assert.equal((await send(rz,'t='+t+',v1='+crypto.createHmac('sha256','whsec_test').update(t+'.'+rz).digest('hex'))).status,200);assert.equal(txs[0].length,1);
});

test('fee invoices: members list them and download the XML once the seller is set',async()=>{
 const row={id:ID,company_id:C,year:2026,number:7,issued_on:'2026-10-18',description:'RADIX Contabilità, pacchetto Crescita, canone mensile',net_cents:6900,vat_cents:1518,gross_cents:8418,buyer:BUYER};
 const reads=[];const st={json:async(t,p)=>{reads.push([t,p]);if(/acc_fee_invoices f JOIN acc_memberships/.test(t)&&/to_jsonb\(f\)/.test(t))return p[0]===ID?row:null;if(/jsonb_agg/.test(t))return [row];return null;},tx:async()=>[]};
 const H=createHandler({getSessionUser:()=>({uid:5}),getStore:()=>st});
 const get=query=>new Promise(resolve=>{const res={headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;},status(c){this.statusCode=c;return this;},json(o){resolve({status:this.statusCode,body:o,headers:this.headers});return this;},end(b){resolve({status:this.statusCode,raw:b,headers:this.headers});}};
  H({method:'GET',query,headers:{}},res);});
 delete process.env.ACCOUNTING_SELLER;
 const list=await get({resource:'fee_invoices',company:C});assert.equal(list.status,200);assert.equal(list.body.rows.length,1);assert.equal(list.body.seller_ready,false);
 assert.ok(reads.some(([t,p])=>/m\.user_id=\$2/.test(t)&&p[1]===5),'only members of the company');
 assert.equal((await get({resource:'fee_invoice_xml',id:ID})).status,503);
 process.env.ACCOUNTING_SELLER=JSON.stringify(SELLER);
 const x=await get({resource:'fee_invoice_xml',id:ID});assert.equal(x.status,200);assert.match(x.headers['Content-Disposition'],/IT01234567897_26007\.xml/);
 assert.equal(P.parse(x.raw).documents[0].total_cents,8418);
 assert.equal((await get({resource:'fee_invoice_xml',id:'44444444-4444-4444-8444-444444444444'})).status,404);
 delete process.env.ACCOUNTING_SELLER;
});
