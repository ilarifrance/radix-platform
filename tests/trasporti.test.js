'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const DOC=require('../lib/trasporti/documenti');
const TOLL=require('../lib/trasporti/pedaggi');
const MRG=require('../lib/trasporti/margini');
const LOC=require('../lib/trasporti/localizzatori');
const XL=require('../lib/trasporti/xlsx');
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
 for(const f of ['trasporti/index.html','trasporti/autista/index.html'])for(const m of fs.readFileSync(f,'utf8').matchAll(/(?:src|href)="(\/[^"#?]+\.(?:js|css|svg|png|webmanifest))"/g))assert.ok(fs.existsSync(m[1].slice(1)),m[1]);
 const man=JSON.parse(fs.readFileSync('trasporti/autista/manifest.webmanifest','utf8'));for(const i of man.icons)assert.ok(fs.existsSync(i.src.slice(1)),i.src);
 assert.ok(man.icons.some(i=>i.sizes==='512x512'&&i.purpose==='maskable'));
 for(const u of fs.readFileSync('trasporti/autista/sw.js','utf8').match(/SHELL=\[([^\]]+)\]/)[1].match(/'([^']+)'/g).map(x=>x.slice(1,-1)))assert.ok(fs.existsSync(u.endsWith('/')?u.slice(1)+'index.html':u.slice(1)),u);
 const ST=require('../trasporti/store.js');const d=ST.seed(new Date(2026,10,18,9,0));
 assert.ok(d.trips.length>20);const closed=d.trips.filter(t=>t.ended_at);assert.equal(d.trips.length-closed.length,1);
 const p=TOLL.parseTransits(ST.sampleTollCsv(d));assert.equal(p.skipped.length,0);
 const r=TOLL.reconcile({transits:p.transits,vehicles:d.vehicles,trips:d.trips,positions:d.positions});
 assert.equal(r.totals.matched,closed.length*2);assert.equal(r.rows.filter(x=>x.status==='fuori_viaggio').length,1);assert.equal(r.rows.filter(x=>x.status==='mezzo_sconosciuto').length,1);
 const m=MRG.compute({trips:closed,costs:d.costs,tolls:r,vehicles:d.vehicles,drivers:d.drivers,customers:d.customers});
 // every demo position belongs to a vehicle with its own source; the open trip has a track and no alert at 09:00
 assert.ok(d.positions.every(p=>d.vehicles.some(v=>v.id===p.vehicle_id)));
 assert.deepEqual(LOC.alerts({vehicles:d.vehicles,trips:d.trips,positions:d.positions,nowAt:'2026-11-18T09:00'}),[]);
 assert.ok(LOC.tripKm(d.trips.find(t=>!t.ended_at),d.positions,'2026-11-18T09:00').km>0);
 assert.ok(m.totals.revenue_cents>0);assert.equal(m.totals.missing_revenue,0);
});

test('trackers: Webfleet, Verizon, rFMS and CSV exports become the same position, times in Italian local time',()=>{
 const w=LOC.fromWebfleet([{objectno:'001',objectname:'GA123BC',latitude_mdeg:45133000,longitude_mdeg:10022000,pos_time:'2026-07-01T08:00:00+02:00',speed:60,odometer:1234567},{objectno:'002',latitude_mdeg:0,longitude_mdeg:0,pos_time:'2026-07-01T08:00:00Z'}]);
 assert.equal(w.length,1);assert.deepEqual([w[0].ref,w[0].at,w[0].lat,w[0].lon,w[0].odometer_km],['001','2026-07-01T08:00',45.133,10.022,123456.7]);
 assert.throws(()=>LOC.fromWebfleet({errorCode:8011,errorMsg:'request quota reached'}),/quota/);
 const v=LOC.fromVerizon({VehicleNumber:'TRK7',Latitude:45.5,Longitude:9.2,UpdateUTC:'2026-11-18T05:00:00Z',Speed:0});
 assert.equal(v[0].at,'2026-11-18T06:00');assert.equal(v[0].ref,'TRK7');
 const r=LOC.fromRfms({vehiclePositionResponse:{vehiclePositions:[{vin:'zcfc1lf0x0d123456',gnssPosition:{latitude:44.6,longitude:10.9,positionDateTime:'2026-11-18T08:30:00.000Z',speed:72},hrTotalVehicleDistance:812345000}]},moreDataAvailable:false});
 assert.deepEqual([r[0].vin,r[0].at,r[0].speed_kmh,r[0].odometer_km],['ZCFC1LF0X0D123456','2026-11-18T09:30',72,812345]);
 const c=LOC.fromCsv('Report Targa Telematics\nTarga;Data ora;Latitudine;Longitudine;Velocità\nGA 123 BC;18/11/2026 06:05;45,133;10,022;55\nGD789FG;;;\n');
 assert.equal(c.error,null);assert.equal(c.positions.length,1);assert.equal(c.skipped.length,1);assert.equal(c.positions[0].at,'2026-11-18T06:05');
 assert.match(LOC.fromCsv('a;b\n1;2').error,/colonne/);
 const vehicles=[{id:'v1',plate:'GA123BC',tracker_ref:'001'},{id:'v3',plate:'GD789FG',vin:'ZCFC1LF0X0D123456'},{id:'v7',plate:'AA000AA',tracker_ref:'TRK7'}];
 const a=LOC.assign([...w,...v,...r,...c.positions,{ref:'999',at:'2026-11-18T06:00',lat:45,lon:9}],vehicles);
 assert.deepEqual(a.positions.map(p=>p.vehicle_id),['v1','v7','v3','v1']);assert.deepEqual(a.unknown,[{ref:'999',count:1}]);
});

test('trackers: phone only where the tracker is silent; trip km from odometer or points; alerts',()=>{
 const P=[{vehicle_id:'v1',at:'2026-11-18T06:00',lat:45.13,lon:10.02,source:'webfleet',odometer_km:1000},{vehicle_id:'v1',at:'2026-11-18T06:10',lat:45.2,lon:10.1,source:'telefono'},
  {vehicle_id:'v1',at:'2026-11-18T07:30',lat:45.4,lon:10.9,source:'telefono'},{vehicle_id:'v1',at:'2026-11-18T08:00',lat:45.44,lon:10.99,source:'webfleet',odometer_km:1112},{vehicle_id:'v1',at:'2026-11-18T08:00',lat:45.44,lon:10.99,source:'webfleet',odometer_km:1112}];
 const m=LOC.merge(P);assert.deepEqual(m.map(p=>p.at+' '+p.source),['2026-11-18T06:00 webfleet','2026-11-18T07:30 telefono','2026-11-18T08:00 webfleet']);
 const trip={id:'t',vehicle_id:'v1',started_at:'2026-11-18T05:50',ended_at:'2026-11-18T08:10'};
 assert.deepEqual(LOC.tripKm(trip,m),{km:112,method:'contachilometri',points:3});
 const noOdo=LOC.tripKm(trip,m.map(p=>({...p,odometer_km:null})));assert.equal(noOdo.method,'punti_gps');assert.ok(noOdo.km>70&&noOdo.km<90,String(noOdo.km));
 assert.equal(LOC.tripKm(trip,[]),null);
 const al=LOC.alerts({vehicles:[{id:'v1',plate:'GA123BC',tracker:'webfleet'},{id:'v2',plate:'FX456DE',tracker:'webfleet'}],nowAt:'2026-11-18T20:30',
  trips:[trip,{id:'o',vehicle_id:'v2',started_at:'2026-11-18T03:00',ended_at:null}],
  positions:[...m,{vehicle_id:'v1',at:'2026-11-18T19:00',lat:45.44,lon:10.99,source:'webfleet'},{vehicle_id:'v1',at:'2026-11-18T19:30',lat:45.2,lon:10.5,source:'webfleet'},{vehicle_id:'v2',at:'2026-11-18T04:00',lat:45,lon:9,source:'webfleet'}]});
 assert.deepEqual(al.map(a=>a.kind+':'+a.vehicle_id).sort(),['senza_posizione:v2','senza_viaggio:v1','viaggio_lungo:v2']);assert.equal(al[0].kind,'senza_viaggio');
 assert.match(al.find(a=>a.kind==='senza_posizione').text,/da 16,5 ore/);
 assert.match(al[0].text,/GA123BC in movimento senza un viaggio/);
});

test('trackers: server requests carry the credentials, Verizon goes token then vehicle; the API action',async()=>{
 const w=LOC.webfleetRequest({account:'acme',username:'api',password:'p',apikey:'K'});
 assert.match(w.url,/^https:\/\/csv\.webfleet\.com\/extern\?account=acme&apikey=K.*action=showObjectReportExtern.*outputformat=json/);assert.equal(w.headers.Authorization,'Basic '+Buffer.from('api:p').toString('base64'));
 assert.throws(()=>LOC.rfmsRequest({base_url:'http://x'}),/https/);
 const calls=[];const f=async(url,o)=>{calls.push([url,o.headers.Authorization]);if(url.endsWith('/token'))return {ok:true,text:async()=>'"TOK"'};if(url.includes('/missing/'))return {ok:false,status:404};return {ok:true,json:async()=>({VehicleNumber:'TRK7',Latitude:45,Longitude:9,UpdateUTC:'2026-11-18T05:00:00Z'})};};
 const ps=await LOC.fetchPositions('verizon',{username:'u',password:'p',app_id:'APP',vehicles:['TRK7','missing']},{fetch:f});
 assert.equal(ps.length,1);assert.equal(calls[1][1],'Atmosphere atmosphere_app_id=APP, Bearer TOK');
 await assert.rejects(LOC.fetchPositions('targa',{}),/file di export/);
 let t=0;const H=createHandler({getSessionUser:()=>({uid:3}),now:()=>t,tracker:()=>({provider:'webfleet'}),fetchPositions:async()=>[{ref:'001',at:'2026-11-18T06:00',lat:45,lon:9}]});
 const ok=await call(H,{body:{action:'posizioni.aggiorna'}});assert.equal(ok.status,200);assert.equal(ok.body.positions.length,1);
 assert.equal((await call(H,{body:{action:'posizioni.aggiorna'}})).status,429);t=61000;assert.equal((await call(H,{body:{action:'posizioni.aggiorna'}})).status,200);
 assert.equal((await call(createHandler({getSessionUser:()=>({uid:3}),tracker:()=>null}),{body:{action:'posizioni.aggiorna'}})).status,503);
 const down=await call(createHandler({getSessionUser:()=>({uid:3}),tracker:()=>({provider:'rfms'}),fetchPositions:async()=>{throw new Error('ECONNRESET secret');}}),{body:{action:'posizioni.aggiorna'}});
 assert.equal(down.status,502);assert.doesNotMatch(down.body.error,/secret/);
});

test('Excel: written file has the sheets, numbers as numbers, euro and date formats; read back, also a toll detail',async()=>{
 const b=XL.write([{name:'Da fatturare: novembre/2026',columns:[{title:'Cliente'},{title:'Data',type:'date'},{title:'Importo',type:'euro'},{title:'Km',type:'int'}],rows:[['Rossi & C. <srl>','2026-11-12',1234.5,1200],['=HYPERLINK("x")','2026-11-13',null,'']]},{name:'Dettaglio',columns:[{title:'A'}],rows:[['x']]}]);
 assert.ok(XL.isXlsx(b));
 const text=Buffer.from(b).toString('latin1');
 assert.match(text,/<sheet name="Da fatturare  novembre 2026" sheetId="1"/);assert.match(text,/<c r="C2" s="2"><v>1234.5<\/v><\/c>/);assert.match(text,/<c r="B2" s="3"><v>46338<\/v>/);
 assert.match(text,/t="inlineStr"><is><t xml:space="preserve">=HYPERLINK\(&quot;x&quot;\)<\/t>/);assert.doesNotMatch(text,/<f>/);
 const back=await XL.read(b);assert.equal(back.length,2);assert.deepEqual(back[0].rows,[['Cliente','Data','Importo','Km'],['Rossi & C. <srl>','12/11/2026','1234,5','1200'],['=HYPERLINK("x")','13/11/2026']]);
 // a deflated workbook with shared strings and date styles, as Telepass and Excel produce
 const zlib=require('zlib');const raw=(n,s)=>[n,new Uint8Array(zlib.deflateRawSync(Buffer.from(s)))];
 const files=[raw('xl/workbook.xml','<workbook xmlns:r="r"><sheets><sheet name="Transiti" sheetId="1" r:id="rId1"/></sheets></workbook>'),
  raw('xl/_rels/workbook.xml.rels','<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>'),
  raw('xl/sharedStrings.xml','<sst><si><t>Data</t></si><si><t>Ora uscita</t></si><si><t>Targa</t></si><si><t>Importo</t></si><si><r><t>GA123</t></r><r><t>BC</t></r></si></sst>'),
  raw('xl/styles.xml','<styleSheet><numFmts><numFmt numFmtId="170" formatCode="[$-410]hh:mm"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="170"/></cellXfs></styleSheet>'),
  raw('xl/worksheets/sheet1.xml','<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row><row r="2"><c r="A2" s="1"><v>46338</v></c><c r="B2" s="2"><v>0.29513888888888889</v></c><c r="C2" t="s"><v>4</v></c><c r="D2"><v>12.4</v></c></row></sheetData></worksheet>')];
 // rebuild as a deflated zip: patch the stored zip's method and sizes
 const z=XL.zip(files.map(([n,d])=>[n,d]));const dv=new DataView(z.buffer);
 for(let i=0;i<z.length-4;i++){const sig=dv.getUint32(i,true);if(sig===0x04034b50)dv.setUint16(i+8,8,true);if(sig===0x02014b50)dv.setUint16(i+10,8,true);}
 const rows=(await XL.read(z))[0].rows;assert.deepEqual(rows[1],['12/11/2026','07:05','GA123BC','12,4']);
 const p=TOLL.parseTransits(rows);assert.equal(p.error,null);assert.deepEqual([p.transits[0].exitAt,p.transits[0].plate,p.transits[0].amount_cents],['2026-11-12T07:05','GA123BC',1240]);
 await assert.rejects(XL.read(new Uint8Array([1,2,3])),/Excel/);
});

// A bundle shaped like the real ones (names invented): two cattle consignments on one truck, each with contract,
// CMR in two copies, carnet de route over 5 pages cut by the batch boundary; a weighing ticket stuck on a CMR page.
const PR=require('../lib/trasporti/pratiche');
const c=(v,s='alta')=>({valore:v,sicurezza:s});
const BATCH1={documenti:[
 {tipo:'contratto',pagine:[1],campi:{numero:c('2125BRXX 106'),data:c('30/04/25'),venditore:c('Esempio Export'),acquirente:c('Azienda Agricola Uno'),capi:c('15'),qualita:c('Broutards femelles'),resa:c('reso franco destino')}},
 {tipo:'cmr',pagine:[2],campi:{numero:c('1302'),mittente:c('Esempio Export'),destinatario:c('Azienda Agricola Uno'),luogo_carico:c('Pouilly en Auxois (21) France'),luogo_scarico:c('Canneto sull\'Oglio'),data_presa_in_carico:c('30/04/2025'),documenti_allegati:c('Certificat sanitaire 2125 BRXX 106 Intra EV.FR.2025 0032291','media'),istruzioni:c('Prix rendu'),consegna_data:c('01/05/2025','media')}},
 {tipo:'pesata',pagine:[2],campi:{data:c('01/05/2025'),peso_entrata_kg:c('13320'),peso_uscita_kg:c('8800'),peso_netto_kg:c('4520')}},
 {tipo:'cmr',pagine:[3],copia:true,campi:{numero:c('1302'),mittente:c('Esempio Export'),destinatario:c('Azienda Agricola Uno'),luogo_carico:c('Pouilly en Auxois'),luogo_scarico:c(null),targa:c('FF902PW')}},
 {tipo:'giornale',pagine:[4,5,6],campi:{numero:c('2125BRXX 106'),certificato_sanitario:c('INTRA.EU.FR.2025.0032291'),specie:c('Bovins'),numero_animali:c('15'),peso_stimato_kg:c('4 779'),luogo_partenza:c('Bellenot sous Pouilly (21) France'),partenza:c('30/04/2025 18:00'),luogo_destinazione:c('Canneto sull\'Oglio'),arrivo_previsto:c('01/05/2025 07:00'),targa:c('FF902PW'),targa_rimorchio:c('XA449EE'),conducente:c('Luca Esempio')}}]};
const BATCH2={documenti:[
 {tipo:'giornale',pagine:[7,8],continua:true,campi:{arrivo_effettivo:c('01/05/2025 06:30'),animali_idonei_arrivo:c('15')}},
 {tipo:'cmr',pagine:[9],campi:{numero:c('1312'),mittente:c('Esempio Export'),destinatario:c('Società Agricola Due'),luogo_carico:c('Pouilly en Auxois'),luogo_scarico:c('Mogliano Veneto (TV)'),documenti_allegati:c('Certificat sanitaire 2125 BRXX 105 Intra EV.FR.2025 0032289'),consegna_ricevuto_da:c('Società Agricola Due','media')}},
 {tipo:'contratto',pagine:[10],campi:{numero:c('2125BRXX 105'),venditore:c('Esempio Export'),acquirente:c('Società Agricola Due'),capi:c('20')}},
 {tipo:'giornale',pagine:[11,12],campi:{numero:c('2125BRXX 105'),certificato_sanitario:c('INTRA.EU.FR.2025.0032289'),specie:c('Bovins'),numero_animali:c('21'),luogo_partenza:c('Bellenot sous Pouilly'),partenza:c('30/04/2025 18:30'),luogo_destinazione:c('Mogliano Veneto')}},
 {tipo:'boh',pagine:[99],campi:{}}]};

test('bundle: batches merged, CMR copies collapsed, carnet joined across batches, consignments grouped by shared numbers',()=>{
 assert.match(PR.instructions(13,12),/pagine da 13 a 24/);assert.deepEqual(PR.pageBatches(23,12),[{first:1,count:12},{first:13,count:11}]);
 const b1=PR.parseBatch(JSON.stringify(BATCH1),1,6),b2=PR.parseBatch('```json\n'+JSON.stringify(BATCH2)+'\n```',7,6);
 assert.equal(b2.documents[4].kind,'altro');assert.deepEqual(b2.documents[4].pages,[7]); // page outside the batch is not trusted
 assert.equal(PR.parseBatch('boh',1,3).error.includes('1-3'),true);
 const docs=PR.merge([b1.documents,b2.documents]);
 const cmr=docs.filter(d=>d.kind==='cmr');assert.equal(cmr.length,2);
 assert.deepEqual(cmr[0].copy_pages,[3]);assert.equal(cmr[0].fields.targa,'FF902PW');assert.equal(cmr[0].fields.consegna_data,'2025-05-01'); // filled from the copy
 const g=docs.find(d=>d.kind==='giornale'&&d.fields.numero==='2125BRXX 106');assert.deepEqual(g.pages,[4,5,6,7,8]);assert.equal(g.fields.animali_idonei_arrivo,15);assert.equal(g.fields.peso_stimato_kg,4779);
 const groups=PR.group(docs);
 assert.equal(groups.length,2,JSON.stringify(groups.map(x=>x.documents.map(d=>d.kind+d.pages))));
 const [s1,s2]=groups.map(PR.shipmentOf);
 assert.deepEqual(s1.documents.map(d=>d.kind).sort(),['altro','cmr','contratto','giornale','pesata']); // loose pages stay with what was scanned before them
 assert.deepEqual([s1.number,s1.consignee,s1.animals,s1.weight_kg,s1.delivered_at,s1.plate,s1.customer_hint],['1302','Azienda Agricola Uno',15,4520,'2025-05-01','FF902PW','Esempio Export']);
 assert.deepEqual(s2.documents.map(d=>d.kind).sort(),['cmr','contratto','giornale']);
 assert.equal(s2.animals,21);assert.ok(s2.warnings.some(w=>/Capi diversi.*20.*21/.test(w)));assert.ok(s2.warnings.some(w=>/casella 24/.test(w)));
 const alone=PR.group([{id:'x',kind:'giornale',pages:[1],fields:{numero:'99XX99999'}}]).map(PR.shipmentOf)[0];
 assert.equal(alone.kind,'altro');assert.ok(alone.warnings.some(w=>/Manca la CMR/.test(w)));
});

test('CMR groupage lines: normalised, totals, confirmed lines kept',()=>{
 const r=DOC.parseReading('cmr',{campi:{numero:c('34719'),mittente:c('Mittenti vari'),destinatario:c('Stock B SAS'),luogo_carico:c('Sassuolo'),luogo_scarico:c('Vitry sur Seine'),pallet:c('26'),peso_kg:c('13.405'),
  righe:[{colli:'1',imballaggio:'pallet',descrizione:'Alfa Maranello',ddt:'362504',data:'16/06/2023',peso_kg:'47'},{colli:'6',descrizione:'Alfa Maranello',ddt:'79553',data:'16/06/2023',peso_kg:'5.072'},null,{}]}});
 assert.equal(r.righe.length,2);assert.deepEqual(r.righe[1],{colli:6,imballaggio:null,descrizione:'Alfa Maranello',ddt:'79553',data:'2023-06-16',peso_kg:5072});
 assert.equal(r.campi.peso_kg,13405);assert.equal(r.campi.pallet,26);assert.match(DOC.instructions('cmr'),/righe/);assert.doesNotMatch(DOC.instructions('giornale'),/righe/);
 const ok=DOC.checkConfirmed('cmr',{numero:'1',mittente:'a',destinatario:'b',luogo_carico:'c',luogo_scarico:'d',righe:[{colli:'2',peso_kg:'1.000,5'}]});
 assert.ok(ok.ok);assert.equal(ok.values.righe[0].peso_kg,1000.5);
 const s=PR.shipmentOf({id:'s1',documents:[{id:'d1',kind:'cmr',pages:[1],fields:{...r.campi,pallet:null},lines:r.righe}]});
 assert.equal(s.pallets,7);assert.equal(s.weight_kg,13405);
});

test('API pratica.leggi: page limits, then the batch reading with absolute page numbers',async()=>{
 let seen=null;const H=createHandler({getSessionUser:()=>({uid:4}),ask:async a=>{seen=a;return {text:JSON.stringify(BATCH2)};}});
 const page={image:IMG,media_type:'image/jpeg'};
 assert.equal((await call(H,{body:{action:'pratica.leggi',data:{pages:[]}}})).status,400);
 assert.equal((await call(H,{body:{action:'pratica.leggi',data:{pages:Array(13).fill(page)}}})).status,400);
 assert.equal((await call(H,{body:{action:'pratica.leggi',data:{pages:[{image:IMG,media_type:'application/pdf'}]}}})).status,400);
 assert.equal((await call(H,{body:{action:'pratica.leggi',data:{pages:[{image:'A'.repeat(4200004),media_type:'image/jpeg'}]}}})).status,413);
 assert.equal(seen,null);
 const r=await call(H,{body:{action:'pratica.leggi',data:{first:7,pages:Array(6).fill(page)}}});
 assert.equal(r.status,200);assert.equal(seen.content.length,7);assert.match(seen.content[6].text,/pagine da 7 a 12/);assert.equal(seen.maxTokens,12000);
 assert.equal(r.body.documents.length,5);assert.equal(r.body.documents[1].fields.numero,'1312');
});

test('customer: broker in box 16 when we are the successive carrier; per conto di; live pigs DDT',()=>{
 const PR=require('../lib/trasporti/pratiche');
 const own='Autotrasporti Esempio Srl';
 const cmr={id:'c',documents:[{id:'d1',kind:'cmr',pages:[1],fields:{numero:'00539',mittente:'Mittente Uno Spa',destinatario:'Ricevitore FR',vettore:'Broker Logistica Srl',vettore_successivo:'Autotrasporti Esempio',pallet:7,peso_kg:736}}]};
 const s=PR.shipmentOf(cmr,own);
 assert.equal(s.customer_hint,'Broker Logistica Srl');assert.match(s.customer_why,/subvettori/);
 // we are the carrier in box 16 → sender pays
 cmr.documents[0].fields.vettore='Autotrasporti Esempio S.r.l.';cmr.documents[0].fields.vettore_successivo=null;
 assert.equal(PR.shipmentOf(cmr,own).customer_hint,'Mittente Uno Spa');
 const ddt={id:'p',documents:[{id:'d2',kind:'ddt',pages:[1],fields:{numero:'14',mittente:'Allevamento Esempio',destinatario:'Macello Esempio',per_conto_di:'Soccida Esempio Srl',specie:'Suini',numero_capi:110,modello_4:'14',peso_kg:20150}}]};
 const p=PR.shipmentOf(ddt,own);
 assert.deepEqual([p.customer_hint,p.animals,p.species,p.animal_ref,p.weight_kg],['Soccida Esempio Srl',110,'Suini','14',20150]);
 assert.match(DOC.instructions('ddt'),/numero_capi/);assert.match(DOC.instructions('cmr'),/casella|16 vettore/);
});

test('invoicing: one row per shipment, trip amount split by kg unless a shipment has its own',()=>{
 const trips=[{id:'t',status:'chiuso',started_at:'2026-11-10T06:00',customer_id:'c1',vehicle_id:'v1',revenue_cents:100000}];
 const customers=[{id:'c1',name:'Uno'},{id:'c2',name:'Broker'}];
 const shipments=[{id:'a',trip_id:'t',kind:'cmr',number:'1',weight_kg:3000,customer_id:'c2'},{id:'b',trip_id:'t',kind:'cmr',number:'2',weight_kg:1000}];
 let r=MRG.invoiceRows({trips,documents:[],vehicles:[],customers,drivers:[],shipments,from:'2026-11-01',to:'2026-11-30'});
 assert.deepEqual(r.map(x=>[x.customer,x.doc,x.amount_cents,x.split_by]),[['Broker','CMR 1',75000,'weight_kg'],['Uno','CMR 2',25000,'weight_kg']]);
 shipments[1].revenue_cents=40000;
 r=MRG.invoiceRows({trips,documents:[],vehicles:[],customers,drivers:[],shipments,from:'2026-11-01',to:'2026-11-30'});
 assert.deepEqual(r.map(x=>x.amount_cents),[60000,40000]);
});

test('phone positions: validation and API posizioni.telefono',async()=>{
 const now=Date.parse('2026-11-19T20:00:00Z');
 const pts=LOC.phonePoints([{at:'2026-11-19T19:58:00Z',lat:43.12345678,lon:13.5,speed_kmh:80.4,accuracy_m:12},{at:'2026-11-19T19:58:00.400Z',lat:43,lon:13},{at:'2026-11-30T00:00:00Z',lat:1,lon:1},{at:'2026-11-19T19:00:00Z',lat:0,lon:0},{at:'2026-11-19T19:00:00Z',lat:95,lon:1},{at:'2026-11-19T19:30:00Z',lat:'44.1',lon:'12.2',trip_id:'nope'}],now);
 assert.deepEqual(pts.map(p=>[p.at.slice(11,19),p.lat,p.speed_kmh,p.trip_id]),[['19:30:00',44.1,null,null],['19:58:00',43.12346,80,null]]);
 const saved=[];const V='11111111-1111-4111-8111-111111111111';
 const db={driverOf:async uid=>uid===7?{company_id:'c',driver_id:'d',default_vehicle:V}:null,vehicleOk:async()=>false,insertPositions:async(c,d,v,p)=>{saved.push([c,d,v,p.length]);return p.length;}};
 const h=createHandler({getSessionUser:req=>req.uid?{uid:req.uid}:null,now:()=>now,db});
 const call=async(uid,data)=>{const res={code:0,body:null,setHeader(){},status(c){this.code=c;return this;},json(b){this.body=b;return this;}};await h({method:'POST',uid,headers:{'x-radix-trasporti':'1','content-type':'application/json'},body:{action:'posizioni.telefono',data}},res);return res;};
 let r=await call(7,{points:[{at:'2026-11-19T19:59:00Z',lat:43.1,lon:13.5}]});
 assert.deepEqual([r.code,r.body.saved],[200,1]);assert.deepEqual(saved[0],['c','d',V,1]);
 r=await call(7,{points:[{at:'2026-11-19T19:59:30Z',lat:43.1,lon:13.5}]});assert.equal(r.code,429);
 r=await call(8,{points:[{at:'2026-11-19T19:59:00Z',lat:43.1,lon:13.5}]});assert.equal(r.code,403);
 r=await call(9,{points:[]});assert.deepEqual([r.code,r.body.saved],[200,0]);
});

test('listini: zones by province/region/country and origin, bands, per head, minimum, fuel and waiting supplements',()=>{
 const L=require('../lib/trasporti/listini');
 const zones=L.parseZones('MN, CR = 350\nLombardia = 420\nFR = 1200\nVI -> FR = 110 /pallet');
 assert.ok(zones.every(z=>!z.error));
 const card={method:'zone',zones,min_cents:40000,supplements:[{kind:'gasolio',base_eur_l:1.6,incidence_pct:30},{kind:'sosta',free_hours:2,per_hour_cents:4000},{kind:'adr',amount_cents:5000}]};
 assert.equal(L.price(card,{delivery_place:'Canneto sull\'Oglio (MN)'}).amount_cents,40000); // 350 raised to the minimum
 assert.equal(L.price(card,{delivery_place:'24100 Bergamo BG'}).zone,'Lombardia');
 let r=L.price(card,{delivery_place:'74150 Marigny Saint Marcel - FR',load_place:'36050 Cartigliano VI',pallets:7,diesel_eur_l:1.72,wait_hours:3});
 assert.equal(r.zone,'FR da VI');assert.equal(r.amount_cents,77000+1732+4000);
 assert.equal(L.placeOf('03100 Frosinone (FR)').country,'IT');assert.equal(L.placeOf('Pouilly-en-Auxois (FR)').country,'FR');
 r=L.price(card,{delivery_place:'Roma (RM)'});assert.equal(r.amount_cents,null);assert.match(r.missing[0],/zona/);
 const bands={method:'fasce',basis:'peso',bands:L.parseBands('1000 = 120\n5000 = 300\n24000 = 0,08/u')};
 assert.equal(L.price(bands,{weight_kg:800}).amount_cents,12000);assert.equal(L.price(bands,{weight_kg:20150}).amount_cents,161200);
 assert.equal(L.price({method:'capo',per_unit_cents:1800},{animals:110}).amount_cents,198000);
 assert.equal(L.price({method:'km',per_km_cents:165},{km:239}).amount_cents,39435);
 const cards=[{id:'d',method:'km',per_km_cents:150},{id:'c',customer_id:'c1',method:'fisso',amount_cents:50000,valid_to:'2026-12-31'}];
 assert.equal(L.cardFor(cards,'c1','2026-11-20').id,'c');assert.equal(L.cardFor(cards,'c1','2027-01-02').id,'d');assert.equal(L.cardFor(cards,'c2','2026-11-20').id,'d');
});

const ANA=require('../lib/trasporti/anagrafiche');
const FPA=require('../lib/trasporti/fatturapa');

test('customer records from documents: VAT check, addresses, proposals without duplicates or our own company',()=>{
 assert.ok(ANA.pivaOk('04425640242'));assert.ok(ANA.pivaOk('01950620201'));assert.ok(!ANA.pivaOk('01950620202'));
 assert.equal(ANA.vatIn('P.IVA IT 04425640242 - tel 0444')[0].code,'04425640242');
 const a=ANA.addressOf('Via Roma 12, 36100 Vicenza (VI)');assert.equal(a.cap,'36100');assert.equal(a.provincia,'VI');
 const docs=[{kind:'ddt',fields:{numero:'1',mittente:'Latteria Rossi Srl P.IVA 04425640242',mittente_indirizzo:'Via Roma 12, 36100 Vicenza (VI)',destinatario:'Supermercati Nord Spa',destinatario_indirizzo:'Via Po 3, 20100 Milano MI'}},
  {kind:'ddt',fields:{numero:'2',mittente:'LATTERIA ROSSI S.R.L.',destinatario:'Supermercati Nord Spa'}},
  {kind:'cmr',fields:{numero:'3',mittente:'Ilari Group Srl',vettore:'Broad Logistics',destinatario:'Ferme SA'}}];
 const p=ANA.proposals({documents:docs,customers:[{name:'Broad Logistics'}],consignees:[],own:'Ilari Group Srl'});
 const names=p.customers.map(c=>c.name);
 assert.equal(names.filter(n=>/latteria/i.test(n)).length,1,'same company written differently is one proposal');
 assert.ok(!names.some(n=>/ilari/i.test(n)),'our company is never proposed');
 assert.ok(!names.some(n=>/broad/i.test(n)),'already known customers are skipped');
 const lat=p.customers.find(c=>/latteria/i.test(c.name));assert.equal(lat.count,2);assert.equal(lat.vat.code,'04425640242');
 assert.ok(p.places.some(x=>/supermercati/i.test(x.name)&&x.count===2));
});

test('electronic invoice: totals per VAT treatment, stamp duty, required data and Latin-1 only',()=>{
 const company={name:'Trasporti Demo Srl',vat:'01950620201',street:'Via San Giorgio 1',cap:'63835',comune:'Montappone',provincia:'FM',iban:'IT60 X054 2811 1010 0000 0123 456'};
 const customer={name:'Latteria Rossi Srl',vat:'04425640242',street:'Via Roma 12',cap:'36100',comune:'Vicenza',provincia:'VI',sdi:'abc1234'};
 const r=FPA.build({company,customer,number:'12/2026',date:'2026-11-20',progressive:12,rows:[
  {description:'Vicenza → Milano',amount_cents:50000,ddt:{numero:'4187',data:'2026-11-12'}},
  {description:'Vicenza – Lione “frigo”',amount_cents:120000,load_country:'IT',delivery_country:'FR'}]});
 assert.deepEqual(r.errors,[]);
 assert.equal(r.totals.taxable_cents,170000);assert.equal(r.totals.vat_cents,11000);assert.ok(r.totals.stamp);assert.equal(r.totals.total_cents,181200);
 assert.equal(r.file_name,'IT01950620201_00012.xml');
 assert.match(r.xml,/<Natura>N3\.4<\/Natura>/);assert.match(r.xml,/<CodiceDestinatario>ABC1234<\/CodiceDestinatario>/);
 assert.match(r.xml,/<NumeroDDT>4187<\/NumeroDDT>/);assert.match(r.xml,/<IBAN>IT60X0542811101000000123456<\/IBAN>/);
 assert.ok(!/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/.test(r.xml),'only Latin-1 characters');
 assert.equal(FPA.build({company,customer,number:'1',date:'2026-11-20',rows:[{amount_cents:120000,load_country:'IT',delivery_country:'FR'}],stamp_duty:false}).totals.stamp,false);
 const foreign=FPA.build({company,customer:{name:'Ferme SA',vat:'FR12345678901',street:'Rue 1',comune:'Lyon',nazione:'FR'},number:'2',date:'2026-11-20',rows:[{amount_cents:10000}]});
 assert.match(foreign.xml,/<Natura>N2\.1<\/Natura>/);assert.match(foreign.xml,/XXXXXXX/);assert.match(foreign.xml,/<IdPaese>FR<\/IdPaese>/);
 const bad=FPA.build({company:{},customer:{},rows:[]});assert.ok(bad.errors.length>=6);
});

test('company costs shared over trips by km when asked',()=>{
 const trips=[{id:'t1',started_at:'2026-11-10T08:00',km:100,vehicle_id:'v1',revenue_cents:50000},{id:'t2',started_at:'2026-11-11T08:00',km:300,vehicle_id:'v1',revenue_cents:90000}];
 const costs=[{kind:'generali',date:'2026-11-05',amount_cents:40000}];
 const a=MRG.compute({trips,costs,tolls:[],from:'2026-11-01',to:'2026-11-30',shareCompany:true});
 const b=MRG.compute({trips,costs,tolls:[],from:'2026-11-01',to:'2026-11-30'});
 const t1=a.trips.find(t=>t.id==='t1'),t2=a.trips.find(t=>t.id==='t2');
 assert.equal(t1.cost_cents,10000);assert.equal(t2.cost_cents,30000);
 assert.equal(b.trips.find(t=>t.id==='t1').cost_cents,0);
 assert.equal(MRG.KIND_GROUP.autista_esterno,'Autista');assert.equal(MRG.KIND_GROUP.pedaggio,'Viaggio');
});
