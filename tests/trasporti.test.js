'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const DOC=require('../lib/trasporti/documenti');
const TOLL=require('../lib/trasporti/pedaggi');
const MRG=require('../lib/trasporti/margini');
const {createHandler}=require('../api/_trasporti');

test('document reading: values normalised, unsure and missing required fields flagged, nothing invented',()=>{
 const r=DOC.parseReading('ddt','```json\n'+JSON.stringify({tipo:'ddt',leggibile:true,campi:{numero:{valore:'4187',sicurezza:'alta'},data:{valore:'12/11/26',sicurezza:'alta'},mittente:{valore:'Latteria Srl',sicurezza:'alta'},peso_kg:{valore:'18.450',sicurezza:'bassa'},colli:{valore:'24 colli',sicurezza:'alta'},targa:{valore:'ga 123 bc',sicurezza:'alta'}}})+'\n```');
 assert.equal(r.campi.data,'2026-11-12');assert.equal(r.campi.peso_kg,18450);assert.equal(r.campi.colli,24);assert.equal(r.campi.targa,'GA123BC');
 assert.ok(r.da_controllare.includes('peso_kg'));assert.ok(r.da_controllare.includes('destinatario'));assert.ok(!r.da_controllare.includes('numero'));
 assert.equal(r.campi.merce,null);
 const bad=DOC.parseReading('cmr','non so leggere');assert.equal(bad.leggibile,false);assert.equal(bad.da_controllare.length,DOC.KINDS.cmr.fields.length);
 assert.equal(DOC.parseReading('ddt',{campi:{data:{valore:'31/02/2026'}}}).campi.data,null);
});

test('numbers in Italian and English notation, dates and plates',()=>{
 assert.equal(DOC.normNumber('1.250,50'),1250.5);assert.equal(DOC.normNumber('1,250.50'),1250.5);assert.equal(DOC.normNumber('312,40 l'),312.4);
 assert.equal(DOC.normNumber('18.450'),18450);assert.equal(DOC.normNumber('45.5'),45.5);assert.equal(DOC.normNumber('abc'),null);
 assert.equal(DOC.normDateTime('18/11/2026 05.40'),'2026-11-18T05:40');assert.equal(DOC.normPlate('AB'),null);
 const c=DOC.checkConfirmed('carburante',{data:'2026-11-18',litri:'312,4',importo:'505,78'});assert.ok(c.ok);assert.equal(c.values.importo,505.78);
 const e=DOC.checkConfirmed('carburante',{data:'',litri:'x',importo:'1'});assert.ok(!e.ok);assert.equal(e.errors.length,3);
 assert.match(DOC.instructions('giornale'),/numero_animali/);assert.throws(()=>DOC.instructions('x'));
});

const CSV=['Fattura Telepass n. 123','Data;Ora entrata;Casello entrata;Ora uscita;Casello uscita;Targa;Dispositivo;Importo',
 '12/11/2026;06:10;CREMONA;07:05;VERONA SUD;GA123BC;3190000101;12,40',
 '12/11/2026;15:20;VERONA SUD;16:10;CREMONA;GA123BC;3190000101;12,40',
 '14/11/2026;10:00;CREMONA;10:40;PIACENZA SUD;GA 123 BC;3190000101;6,90',
 '15/11/2026;09:00;BRESCIA;09:30;VERONA SUD;ZZ999ZZ;999;5,40',
 'riga rotta'].join('\n');
const vehicles=[{id:'v1',plate:'GA123BC',devices:['3190000101']}];
const trips=[{id:'t1',vehicle_id:'v1',started_at:'2026-11-12T06:30',ended_at:'2026-11-12T16:00'}];

test('toll transits: header found after a title line, wrong rows reported',()=>{
 const p=TOLL.parseTransits(CSV);assert.equal(p.error,null);assert.equal(p.transits.length,4);assert.equal(p.skipped.length,1);
 assert.deepEqual({e:p.transits[0].entryAt,x:p.transits[0].exitAt,a:p.transits[0].amount_cents,pl:p.transits[0].plate},{e:'2026-11-12T06:10',x:'2026-11-12T07:05',a:1240,pl:'GA123BC'});
 assert.match(TOLL.parseTransits('a;b;c\n1;2;3').error,/colonne/);
 const night=TOLL.parseTransits('Data;Ora entrata;Ora uscita;Targa;Importo\n05/11/2026;23:50;00:30;GA123BC;3,10').transits[0];
 assert.equal(night.entryAt,'2026-11-04T23:50');assert.equal(night.exitAt,'2026-11-05T00:30');
});

test('toll reconciliation by plate/device and time: inside, just outside, no trip, unknown vehicle',()=>{
 const {transits}=TOLL.parseTransits(CSV);
 const r=TOLL.reconcile({transits,vehicles,trips,positions:[{vehicle_id:'v1',at:'2026-11-14T10:20'}]});
 const st=r.rows.map(x=>x.status);assert.deepEqual(st,['abbinato','abbinato','fuori_viaggio','mezzo_sconosciuto']);
 assert.equal(r.perTrip.t1,2480);assert.match(r.rows[1].reason,/fuori dagli orari/);assert.match(r.rows[2].reason,/in movimento/);
 assert.equal(r.totals.matched_cents,2480);assert.equal(r.totals.outside_cents,690);assert.equal(r.totals.unknown_cents,540);
 // an open trip runs until now
 const open=TOLL.reconcile({transits,vehicles,trips:[{id:'t2',vehicle_id:'v1',started_at:'2026-11-14T09:00',ended_at:null}],nowAt:'2026-11-14T12:00'});
 assert.equal(open.rows[2].trip_id,'t2');
});

test('margin: direct costs, km-shared vehicle and driver costs with exact cents, unallocated kept visible',()=>{
 const T=[{id:'a',vehicle_id:'v1',driver_id:'d1',customer_id:'c1',started_at:'2026-11-10T06:00',km:100,revenue_cents:50000},
  {id:'b',vehicle_id:'v1',driver_id:'d1',customer_id:'c2',started_at:'2026-11-11T06:00',km:200,revenue_cents:90000}];
 const C=[{kind:'carburante',date:'2026-11-10',amount_cents:10000,trip_id:'a'},{kind:'leasing',date:'2026-11-01',amount_cents:100000,vehicle_id:'v1'},
  {kind:'stipendio',date:'2026-11-01',amount_cents:30001,driver_id:'d1'},{kind:'leasing',date:'2026-11-01',amount_cents:5000,vehicle_id:'v9'},{kind:'assicurazione',date:'2026-11-02',amount_cents:7000}];
 const m=MRG.compute({trips:T,costs:C,tolls:{perTrip:{b:2480}},from:'2026-11-01',to:'2026-11-30',vehicles:[{id:'v1',plate:'GA123BC'}]});
 const a=m.trips.find(x=>x.id==='a'),b=m.trips.find(x=>x.id==='b');
 assert.equal(a.allocated.leasing+b.allocated.leasing,100000);assert.equal(a.allocated.leasing,33333);assert.equal(a.allocated.stipendio+b.allocated.stipendio,30001);
 assert.equal(b.direct.pedaggio,2480);assert.equal(a.direct.carburante,10000);
 assert.equal(m.totals.cost_cents,10000+100000+30001+5000+7000+2480);assert.equal(m.totals.margin_cents,140000-m.totals.cost_cents);
 assert.equal(m.vehicles.find(v=>v.id==='v9').unallocated_cents,5000);assert.equal(m.company_costs.assicurazione,7000);
 assert.deepEqual(MRG.split(100,[0,0,0]),[34,33,33]);
});

test('invoicing rows and CSV for Excel (formula injection neutralised)',()=>{
 const rows=MRG.invoiceRows({trips:[{id:'a',status:'chiuso',started_at:'2026-11-10T06:00',customer_id:'c1',vehicle_id:'v1',km:100,revenue_cents:50000},{id:'b',status:'aperto',started_at:'2026-11-10T06:00'}],
  documents:[{trip_id:'a',kind:'ddt',fields:{numero:'41',merce:'=HYPERLINK("x")',luogo_carico:'Cremona',luogo_scarico:'Verona'}}],customers:[{id:'c1',name:'Rossi; Srl'}],vehicles:[{id:'v1',plate:'GA123BC'}]});
 assert.equal(rows.length,1);assert.equal(rows[0].doc,'DDT 41');
 const csv=MRG.toCsv(rows);assert.ok(csv.startsWith('﻿Cliente;'));assert.match(csv,/"Rossi; Srl"/);assert.match(csv,/'=HYPERLINK/);assert.match(csv,/500,00/);
});

function call(h,{method='POST',body,headers}={}){
 return new Promise(resolve=>{const res={headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;},status(c){this.statusCode=c;return this;},json(o){resolve({status:this.statusCode,body:o});return this;}};
  h({method,body,headers:{'content-type':'application/json','x-radix-trasporti':'1',...headers}},res);});
}
const IMG=Buffer.from('fake-jpeg').toString('base64');
test('API: login, header, kind, format and size checked before the AI is called',async()=>{
 let asked=0;const ask=async()=>{asked++;return {text:'{"tipo":"ddt","campi":{"numero":{"valore":"7","sicurezza":"alta"}}}'};};
 const H=createHandler({getSessionUser:()=>({uid:3}),ask});
 assert.equal((await call(createHandler({getSessionUser:()=>null,ask}),{body:{}})).status,401);
 assert.equal((await call(H,{body:{},headers:{'x-radix-trasporti':undefined}})).status,403);
 assert.equal((await call(H,{method:'GET'})).status,405);
 assert.equal((await call(H,{body:{action:'x'}})).body.error,'Azione non riconosciuta.');
 assert.equal((await call(H,{body:{action:'documento.leggi',data:{kind:'x',image:IMG,media_type:'image/jpeg'}}})).status,400);
 assert.equal((await call(H,{body:{action:'documento.leggi',data:{kind:'ddt',image:IMG,media_type:'image/gif'}}})).status,400);
 assert.equal((await call(H,{body:{action:'documento.leggi',data:{kind:'ddt',image:'A'.repeat(4200004),media_type:'image/jpeg'}}})).status,413);
 assert.equal(asked,0);
 const ok=await call(H,{body:JSON.stringify({action:'documento.leggi',data:{kind:'ddt',image:IMG,media_type:'image/jpeg'}})});
 assert.equal(ok.status,200);assert.equal(ok.body.reading.campi.numero,'7');assert.equal(asked,1);
 assert.equal((await call(createHandler({getSessionUser:()=>({uid:3}),ask:async()=>null}),{body:{action:'documento.leggi',data:{kind:'ddt',image:IMG,media_type:'image/jpeg'}}})).status,503);
 assert.equal((await call(createHandler({getSessionUser:()=>({uid:3}),ask:async()=>{throw new Error('down');}}),{body:{action:'documento.leggi',data:{kind:'ddt',image:IMG,media_type:'image/jpeg'}}})).status,502);
});

test('route, rewrite and pages are wired; the demo data reconciles with its own sample toll file',()=>{
 assert.match(fs.readFileSync('api/integrations/[service].js','utf8'),/'trasporti': \(\) => require\('\.\.\/_trasporti'\)/);
 const cfg=JSON.parse(fs.readFileSync('vercel.json','utf8'));assert.ok(cfg.rewrites.some(r=>r.source==='/api/trasporti'&&r.destination==='/api/integrations/trasporti'));
 for(const f of ['trasporti/index.html','trasporti/autista/index.html'])for(const m of fs.readFileSync(f,'utf8').matchAll(/(?:src|href)="(\/[^"#?]+\.(?:js|css))"/g))assert.ok(fs.existsSync(m[1].slice(1)),m[1]);
 const ST=require('../trasporti/store.js');const d=ST.seed(new Date(2026,10,18,9,0));
 assert.ok(d.trips.length>20);
 const p=TOLL.parseTransits(ST.sampleTollCsv(d));assert.equal(p.skipped.length,0);
 const r=TOLL.reconcile({transits:p.transits,vehicles:d.vehicles,trips:d.trips,positions:d.positions});
 assert.equal(r.totals.matched,d.trips.length*2);assert.equal(r.rows.filter(x=>x.status==='fuori_viaggio').length,1);assert.equal(r.rows.filter(x=>x.status==='mezzo_sconosciuto').length,1);
 const m=MRG.compute({trips:d.trips,costs:d.costs,tolls:r,vehicles:d.vehicles,drivers:d.drivers,customers:d.customers});
 assert.ok(m.totals.revenue_cents>0);assert.equal(m.totals.missing_revenue,0);
});
