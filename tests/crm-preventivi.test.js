'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const V=require('../sales/vendite-core.js');
const docs=require('../api/_sales_documents.js');
const {createHandler}=require('../api/_sales');
const W='5b1d2c3e-4f50-4a61-8b72-9c83d4e5f601',ID='7c9e6679-7425-40de-944b-e07fc1f90ae7';
const res=()=>{const r={headers:{},setHeader(a,v){r.headers[a]=v},status(s){r.code=s;return r},json(b){r.body=b;return r},send(b){r.body=b;return r},end(){return r}};return r};

test('Italian amounts, rates and quantities',()=>{
 assert.equal(V.cents('1.200'),120000);assert.equal(V.cents('99,9'),9990);assert.equal(V.cents('€ 12.500,50'),1250050);assert.equal(V.cents('12,345'),null);
 assert.equal(V.bp('22'),2200);assert.equal(V.bp('4,5%'),450);assert.equal(V.bp('101'),null);
 assert.equal(V.qty('1,25'),1.25);assert.equal(V.qty('0'),null);assert.equal(V.qty('1,2345'),null);
});
test('totals: VAT per rate on the rate total, discounts, as sales_document_set_lines',()=>{
 const {lines}=V.cleanLines([{description:'Consulenza',quantity:'3',price:'250,16',discount:'10',vat:'22'},{description:'Libro',quantity:'2',price:'19,90',vat:'4'},{description:'',price:''}]);
 assert.equal(lines.length,2);
 assert.deepEqual(V.totals(lines),{subtotal_cents:71523,discount_cents:7505,vat_cents:15018,total_cents:86541,vat_summary:[{vat_rate_bp:2200,net_cents:67543,vat_cents:14859},{vat_rate_bp:400,net_cents:3980,vat_cents:159}]});
 // Two lines at 22%: VAT on the sum, not rounded per line.
 const t=V.totals([{quantity:1,unit_price_cents:5,vat_rate_bp:2200},{quantity:1,unit_price_cents:5,vat_rate_bp:2200}]);
 assert.equal(t.vat_cents,2);
 assert.match(V.cleanLines([{description:'x',quantity:'a',price:'1'}]).error,/Riga 1: quantità/);
});
test('document payloads: create drops empties, update sends only changes',()=>{
 const f=V.newDocument('quote',{settings:{quote_validity_days:15,quote_terms:'Bonifico'},books:[{id:ID,is_default:true}],opportunity:{id:W,title:'Sito',company_id:ID},now:new Date(2026,9,20)});
 assert.equal(f.valid_until,'2026-11-04');assert.equal(f.price_book_id,ID);assert.equal(f.terms,'Bonifico');
 f.lines=[{description:'Sito',quantity:'1',price:'1.000',vat:'22'}];
 const c=V.documentPayload(null,f);assert.equal(c.action,'create');assert.equal(c.data.kind,'quote');assert.equal(c.data.opportunity_id,W);assert.ok(!('contact_id' in c.data));
 const doc={id:ID,version:3,kind:'quote',status:'bozza',title:'Sito',company_id:ID,contact_id:null,opportunity_id:W,price_book_id:ID,issue_date:f.issue_date,valid_until:f.valid_until,notes:null,terms:'Bonifico',
  lines:[{description:'Sito',quantity:'1.000',unit:'pz',unit_price_cents:'100000',discount_bp:0,vat_rate_bp:2200,net_cents:100000}]};
 const same=V.formOf(doc);assert.deepEqual(V.documentPayload(doc,same),{nothing:true});
 same.title='Sito nuovo';same.lines[0].price='1.100';
 const u=V.documentPayload(doc,same);assert.equal(u.action,'update');assert.deepEqual(Object.keys(u.data).sort(),['id','lines','title','version']);assert.equal(u.data.lines[0].unit_price_cents,110000);
});
test('status moves match the database',()=>{
 assert.deepEqual(V.moves({kind:'quote',status:'inviato'}).map(m=>m[0]),['accettato','rifiutato','scaduto','bozza']);
 assert.deepEqual(V.moves({kind:'invoice',status:'bozza'}).map(m=>m[0]),['emessa']);
 assert.deepEqual(V.moves({kind:'invoice',status:'annullata'}),[]);
 const sql=fs.readFileSync(require.resolve('../migrations/sales/013_crm_products_quotes.sql'),'utf8');
 assert.match(sql,/doc\.status='inviato' AND d->>'status' IN\('bozza','accettato','rifiutato','scaduto'\)/);
 assert.match(sql,/doc\.status='emessa' AND d->>'status' IN\('pagata','annullata'\)/);
 assert.ok(V.overdue({kind:'invoice',status:'emessa',due_date:'2026-01-01'},new Date(2026,9,20)));
});
test('product and settings payloads',()=>{
 assert.match(V.productPayload(null,{name:'',price:'1'}).error,/nome/);
 const p=V.productPayload(null,{name:'Ora di consulenza',price:'90',vat:'22',unit:'ore',code:''});
 assert.deepEqual(p,{action:'create',data:{name:'Ora di consulenza',unit:'ore',unit_price_cents:9000,vat_rate_bp:2200,active:true}});
 const ex={id:ID,version:2,name:'Ora',code:null,description:null,unit:'ore',unit_price_cents:'9000',vat_rate_bp:2200,active:true};
 assert.deepEqual(V.productPayload(ex,{name:'Ora',price:'90,00',vat:'22',unit:'ore'}),{nothing:true});
 assert.deepEqual(V.productPayload(ex,{name:'Ora',price:'95',vat:'22',unit:'ore'}).data,{id:ID,version:2,unit_price_cents:9500});
 const s=V.settingsPayload({version:4},{issuer_name:' Doc Capital ',issuer_vat_number:'IT123',quote_validity_days:30,payment_days:0});
 assert.deepEqual(s.data.issuer,{name:'Doc Capital',vat_number:'IT123'});assert.equal(s.data.version,4);
 assert.match(V.settingsPayload(null,{quote_validity_days:0,payment_days:30}).error,/Validità/);
});
test('API validator: fields, ids generated server side, reads',()=>{
 const c=docs.command({workspace:W,entity:'documents',action:'create',data:{kind:'quote',title:'X',lines:[{description:'A',quantity:2,unit_price_cents:100,vat_rate_bp:2200}]}});
 assert.ok(c.data.id&&c.data.id!==ID);assert.equal(c.data.lines[0].quantity,2);
 assert.throws(()=>docs.command({workspace:W,entity:'documents',action:'create',data:{kind:'quote',total_cents:1}}),/Campo non consentito/);
 assert.throws(()=>docs.command({workspace:W,entity:'documents',action:'create',data:{kind:'quote',lines:[{description:'A',quantity:-1,unit_price_cents:1,vat_rate_bp:0}]}}),/quantità/);
 assert.throws(()=>docs.command({workspace:W,entity:'products',action:'create',data:{name:'A',code:'<b>'}}),/Codice/);
 const inv=docs.command({workspace:W,entity:'documents',action:'invoice',data:{id:ID,version:1,key:W}});assert.ok(inv.data.invoice_id);
 assert.deepEqual(docs.query({entity:'documents',workspace:W,kind:'invoice'}),{workspace:W,entity:'documents',offset:0,kind:'invoice'});
 assert.throws(()=>docs.query({entity:'document',workspace:W}),/Documento/);
});
test('handler routes documents and keeps the catalog to owner/admin',async()=>{
 const calls=[];let role='member';
 const store={membership:async()=>({role}),documents:{command:async(c,u)=>{calls.push(['cmd',c.entity,c.action,u]);return {id:c.data.id}},read:async(c)=>{calls.push(['read',c.entity]);return [{id:ID}]}}};
 const h=createHandler({getSessionUser:()=>({uid:7}),getStore:()=>store});
 const post=body=>{const r=res();return h({method:'POST',headers:{'x-radix-sales':'1','content-type':'application/json'},body,query:{}},r).then(()=>r)};
 let r=await post({workspace:W,entity:'documents',action:'create',data:{kind:'quote'}});assert.equal(r.code,200);assert.deepEqual(calls.at(-1),['cmd','documents','create',7]);
 r=await post({workspace:W,entity:'products',action:'create',data:{name:'A'}});assert.equal(r.code,403);
 role='admin';r=await post({workspace:W,entity:'products',action:'create',data:{name:'A'}});assert.equal(r.code,200);
 role='viewer';r=await post({workspace:W,entity:'documents',action:'create',data:{kind:'quote'}});assert.equal(r.code,403);
 const g=res();await h({method:'GET',headers:{},query:{entity:'documents',workspace:W,kind:'quote'}},g);assert.equal(g.code,200);assert.deepEqual(g.body.rows,[{id:ID}]);
 role='member';const big=res();await h({method:'POST',headers:{'x-radix-sales':'1','content-type':'application/json'},query:{},body:{workspace:W,entity:'documents',action:'create',data:{kind:'quote',lines:Array.from({length:150},(_,i)=>({description:'Riga '+i+' '+'x'.repeat(60),quantity:1,unit_price_cents:1,vat_rate_bp:2200}))}}},big);
 assert.equal(big.code,200);
});
test('page wiring: nav, scripts, opportunity link, print view',()=>{
 const html=fs.readFileSync(require.resolve('../sales-vendite.html'),'utf8');
 assert.match(html,/vendite-core\.js[\s\S]*vendite\.js/);assert.match(html,/sales-nav\.js/);assert.match(html,/id="vd-print"/);
 assert.match(fs.readFileSync(require.resolve('../sales/sales-nav.js'),'utf8'),/sales-vendite\.html#quotes/);
 assert.match(fs.readFileSync(require.resolve('../sales/sales.js'),'utf8'),/sales-vendite\.html\?opp=/);
 assert.match(fs.readFileSync(require.resolve('../sales/vendite.css'),'utf8'),/@media print/);
});
