/* RADIX Trasporti — first management control of a transport company: revenue and costs of every trip, vehicle,
   driver and customer in a period. Costs tied to a trip (tolls reconciled to it, fuel the driver logged during it)
   go to that trip; costs of a vehicle (fuel cards, maintenance, leasing, insurance) are shared among that vehicle's
   trips by km (by count when km are missing); costs of a driver (payslip) are shared among that driver's trips the
   same way. Costs with no trip to share them stay visible on the vehicle or driver as "non ripartiti".
   Amounts in cents. Pure functions. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixTrMargini=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';

// Cost items of a road haulage company, grouped as in the management accounts: vehicle, driver, trip, company.
const KIND_LABEL={
 carburante:'Carburante',adblue:'AdBlue',pedaggio:'Pedaggi',lavaggio:'Lavaggi e disinfezione',lettiera:'Segatura e lettiera (animali vivi)',subvettore:'Subvettori',trasferte:'Trasferte e diarie autisti',
 stipendio:'Stipendi e contributi autisti',straordinari:'Straordinari',autista_esterno:'Autisti esterni (agenzia o noleggio con conducente)',
 manutenzione:'Manutenzione e riparazioni',pneumatici:'Pneumatici',leasing:'Leasing mezzi',noleggio:'Noleggio mezzi',ammortamento:'Ammortamento mezzi di proprietà',
 assicurazione:'Assicurazione',bollo:'Tassa di possesso, revisioni e tachigrafo',multe:'Multe e sanzioni',generali:'Spese generali (ufficio, software, consulenti)',altro:'Altri costi'};
const KIND_GROUP={carburante:'Viaggio',adblue:'Viaggio',pedaggio:'Viaggio',lavaggio:'Viaggio',lettiera:'Viaggio',subvettore:'Viaggio',trasferte:'Autista',stipendio:'Autista',straordinari:'Autista',autista_esterno:'Autista',
 manutenzione:'Mezzo',pneumatici:'Mezzo',leasing:'Mezzo',noleggio:'Mezzo',ammortamento:'Mezzo',assicurazione:'Mezzo',bollo:'Mezzo',multe:'Azienda',generali:'Azienda',altro:'Azienda'};
const day=s=>String(s||'').slice(0,10);
const inPeriod=(d,from,to)=>(!from||d>=from)&&(!to||d<=to);
const pct=(m,r)=>r?Math.round(m*1000/r)/10:null;
const DAY=86400000,dn=s=>Date.parse(s+'T00:00:00Z')/DAY;
function share(c,from,to){
 if(!Number.isSafeInteger(c.amount_cents))return null;
 const a=c.period_from&&/^\d{4}-\d{2}-\d{2}$/.test(c.period_from)?c.period_from:null,b=c.period_to&&/^\d{4}-\d{2}-\d{2}$/.test(c.period_to)?c.period_to:null;
 if(!a||!b||b<a)return inPeriod(day(c.date),from,to)?c:null;
 const lo=from&&from>a?from:a,hi=to&&to<b?to:b;if(hi<lo)return null;
 if(lo===a&&hi===b)return c;
 const part=Math.round(c.amount_cents*(dn(hi)-dn(lo)+1)/(dn(b)-dn(a)+1));
 return part?{...c,amount_cents:part,full_cents:c.amount_cents}:null;
}

// Split `amount` over items by weight with exact cents (largest remainder).
function split(amount,weights){
 const tot=weights.reduce((s,w)=>s+w,0);if(!weights.length)return [];
 const w=tot>0?weights:weights.map(()=>1),T=tot>0?tot:weights.length;
 const raw=w.map(x=>amount*x/T),base=raw.map(Math.floor);let rest=amount-base.reduce((s,x)=>s+x,0);
 const order=raw.map((x,i)=>[x-Math.floor(x),i]).sort((a,b)=>b[0]-a[0]);
 for(let k=0;rest>0;k=(k+1)%order.length,rest--)base[order[k][1]]++;
 return base;
}

/* trips: [{id, vehicle_id, driver_id, customer_id, started_at, km, revenue_cents}]
   costs: [{id, kind, date, amount_cents, trip_id?, vehicle_id?, driver_id?}]
   tolls: optional {perTrip:{tripId:cents}} from RadixTrPedaggi.reconcile, added as direct toll costs
   (pass toll transits either here or as costs, not both). */
const driven=t=>(t.km>0?t.km:0)+(t.empty_km>0?t.empty_km:0);
function compute({trips,costs,tolls,from,to,vehicles,drivers,customers,shareCompany=false}){
 const T=(trips||[]).filter(t=>inPeriod(day(t.started_at),from,to));
 const byId=new Map(T.map(t=>[t.id,{id:t.id,trip:t,revenue_cents:t.revenue_cents||0,direct:{},allocated:{},cost_cents:0}]));
 const unallocated={vehicles:{},drivers:{},company:{}};
 const add=(o,k,c)=>{o[k]=(o[k]||0)+c;};
 // a cost with a period of competence (insurance year, payslip month, leasing instalment) counts for the days of
 // that period inside [from,to]; the others on their date
 const C=(costs||[]).map(c=>share(c,from,to)).filter(Boolean);
 for(const c of C){
  const kind=KIND_LABEL[c.kind]?c.kind:'altro';
  if(c.trip_id&&byId.has(c.trip_id)){add(byId.get(c.trip_id).direct,kind,c.amount_cents);continue;}
  let pool=null,bucket=null,key=null;
  if(c.vehicle_id){pool=T.filter(t=>t.vehicle_id===c.vehicle_id);bucket=unallocated.vehicles;key=c.vehicle_id;}
  else if(c.driver_id){pool=T.filter(t=>t.driver_id===c.driver_id);bucket=unallocated.drivers;key=c.driver_id;}
  // company overheads: on all trips of the period by km when asked (full cost), else shown apart
  if(!pool&&shareCompany&&T.length){pool=T;bucket=unallocated.company;key=null;}
  if(!pool){add(unallocated.company,kind,c.amount_cents);continue;}
  if(!pool.length&&key==null){add(unallocated.company,kind,c.amount_cents);continue;}
  if(!pool.length){bucket[key]=bucket[key]||{};add(bucket[key],kind,c.amount_cents);continue;}
  // shared by the km really driven: loaded plus empty (to reach the loading place, to come back)
  const parts=split(c.amount_cents,pool.map(t=>driven(t)));
  pool.forEach((t,i)=>add(byId.get(t.id).allocated,kind,parts[i]));
 }
 if(tolls&&tolls.perTrip)for(const [id,c] of Object.entries(tolls.perTrip))if(byId.has(id))add(byId.get(id).direct,'pedaggio',c);
 const rows=[...byId.values()].map(r=>{
  const cost=Object.values(r.direct).reduce((s,x)=>s+x,0)+Object.values(r.allocated).reduce((s,x)=>s+x,0);
  const t=r.trip;return {id:r.id,date:day(t.started_at),vehicle_id:t.vehicle_id,driver_id:t.driver_id,customer_id:t.customer_id,origin:t.origin||null,destination:t.destination||null,km:driven(t),empty_km:t.empty_km>0?t.empty_km:0,
   revenue_cents:r.revenue_cents,direct:r.direct,allocated:r.allocated,cost_cents:cost,margin_cents:r.revenue_cents-cost,margin_pct:pct(r.revenue_cents-cost,r.revenue_cents),missing_revenue:!t.revenue_cents};
 }).sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:0);
 const group=(key,names,extra)=>{
  const m=new Map();
  for(const r of rows){const k=r[key];if(k==null)continue;const g=m.get(k)||{id:k,name:names&&names.get(k)||k,trips:0,km:0,empty_km:0,revenue_cents:0,cost_cents:0,by_kind:{}};g.trips++;g.km+=r.km;g.empty_km+=r.empty_km;g.revenue_cents+=r.revenue_cents;g.cost_cents+=r.cost_cents;for(const o of [r.direct,r.allocated])for(const [k2,c] of Object.entries(o))add(g.by_kind,k2,c);m.set(k,g);}
  if(extra)for(const [k,kinds] of Object.entries(extra)){const g=m.get(k)||{id:k,name:names&&names.get(k)||k,trips:0,km:0,revenue_cents:0,cost_cents:0,by_kind:{}};g.unallocated_cents=Object.values(kinds).reduce((s,x)=>s+x,0);g.cost_cents+=g.unallocated_cents;for(const [k2,c] of Object.entries(kinds))add(g.by_kind,k2,c);m.set(k,g);}
  return [...m.values()].map(g=>({...g,margin_cents:g.revenue_cents-g.cost_cents,margin_pct:pct(g.revenue_cents-g.cost_cents,g.revenue_cents),cost_per_km_cents:g.km?Math.round(g.cost_cents/g.km):null})).sort((a,b)=>b.revenue_cents-a.revenue_cents);
 };
 const names=list=>new Map((list||[]).map(x=>[x.id,x.name||x.plate||x.id]));
 const companyCost=Object.values(unallocated.company).reduce((s,x)=>s+x,0);
 const revenue=rows.reduce((s,r)=>s+r.revenue_cents,0);
 const cost=rows.reduce((s,r)=>s+r.cost_cents,0)+[unallocated.vehicles,unallocated.drivers].reduce((s,o)=>s+Object.values(o).reduce((a,k)=>a+Object.values(k).reduce((x,y)=>x+y,0),0),0)+companyCost;
 const byKind={};for(const r of rows)for(const o of [r.direct,r.allocated])for(const [k,c] of Object.entries(o))add(byKind,k,c);
 for(const o of [unallocated.vehicles,unallocated.drivers])for(const k of Object.values(o))for(const [k2,c] of Object.entries(k))add(byKind,k2,c);
 for(const [k,c] of Object.entries(unallocated.company))add(byKind,k,c);
 return {trips:rows,vehicles:group('vehicle_id',new Map((vehicles||[]).map(v=>[v.id,v.plate+(v.label?' · '+v.label:'')])),unallocated.vehicles),drivers:group('driver_id',names(drivers),unallocated.drivers),customers:group('customer_id',names(customers)),
  company_costs:unallocated.company,by_kind:byKind,totals:{trips:rows.length,km:rows.reduce((s,r)=>s+r.km,0),empty_km:rows.reduce((s,r)=>s+r.empty_km,0),revenue_cents:revenue,cost_cents:cost,margin_cents:revenue-cost,margin_pct:pct(revenue-cost,revenue),missing_revenue:rows.filter(r=>r.missing_revenue).length}};
}

// Rows to invoice: closed trips of the period not yet invoiced, by customer. CSV with ; and BOM opens in Excel.
/* Shipments of one trip (several consignees on one truck): each its own row; the trip amount is shared by kg,
   else by animals, else by pallets, unless the office set the shipment's own amount. */
function shipmentRows(t,ships,base,cus){
 const own=ships.filter(s=>s.revenue_cents!=null).reduce((a,s)=>a+s.revenue_cents,0);
 const free=ships.filter(s=>s.revenue_cents==null);
 const by=['weight_kg','animals','pallets'].find(k=>free.every(s=>s[k]>0))||null;
 const parts=split(Math.max(0,(t.revenue_cents||0)-own),free.map(s=>by?s[by]:1));
 return ships.map(s=>({...base,customer_id:s.customer_id||t.customer_id||null,doc_kind:s.kind||null,doc_number:s.number||null,doc_date:s.load_date||null,price_auto:!!s.price_auto,customer:(cus.get(s.customer_id||t.customer_id)||{}).name||s.customer_hint||'',doc:(s.kind&&s.kind!=='altro'?s.kind.toUpperCase()+' ':'')+(s.number||''),
  origin:s.load_place||base.origin,destination:s.delivery_place||base.destination,goods:s.species?s.species+(s.animals?' ('+s.animals+' capi)':''):(s.pallets?s.pallets+' pallet':base.goods),
  weight_kg:s.weight_kg??'',amount_cents:s.revenue_cents!=null?s.revenue_cents:parts[free.indexOf(s)]||0,shipment_id:s.id,delivered:!!s.delivered_at,split_by:s.revenue_cents!=null?null:by}));
}
function invoiceRows({trips,documents,vehicles,customers,drivers,shipments,from,to}){
 const veh=new Map((vehicles||[]).map(v=>[v.id,v])),cus=new Map((customers||[]).map(c=>[c.id,c])),drv=new Map((drivers||[]).map(d=>[d.id,d]));
 const docs=new Map();for(const d of documents||[]){if(!d.trip_id)continue;(docs.get(d.trip_id)||docs.set(d.trip_id,[]).get(d.trip_id)).push(d);}
 const sh=new Map();for(const s of shipments||[]){if(!s.trip_id)continue;(sh.get(s.trip_id)||sh.set(s.trip_id,[]).get(s.trip_id)).push(s);}
 return (trips||[]).filter(t=>t.status==='chiuso'&&inPeriod(day(t.started_at),from,to)).flatMap(t=>{
  const ds=docs.get(t.id)||[];const main=ds.find(d=>d.kind==='ddt'||d.kind==='cmr'||d.kind==='giornale')||{};const f=main.fields||{};
  const base={customer_id:t.customer_id||null,customer:(cus.get(t.customer_id)||{}).name||'',date:day(t.started_at),doc_kind:main.kind||null,doc_number:f.numero||null,doc_date:f.data||null,price_auto:!!t.price_auto,doc:(main.kind?main.kind.toUpperCase()+' ':'')+(f.numero||''),
   origin:t.origin||f.luogo_carico||f.luogo_partenza||'',destination:t.destination||f.luogo_scarico||f.luogo_destinazione||'',
   goods:f.merce||f.specie||'',weight_kg:f.peso_kg??'',plate:(veh.get(t.vehicle_id)||{}).plate||'',driver:(drv.get(t.driver_id)||{}).name||'',km:t.km||'',amount_cents:t.revenue_cents||0,trip_id:t.id};
  return sh.has(t.id)?shipmentRows(t,sh.get(t.id),base,cus):[base];
 }).sort((a,b)=>a.customer.localeCompare(b.customer,'it')||a.date.localeCompare(b.date));
}
function toCsv(rows){
 const cell=v=>{let s=String(v??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return /[;"\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
 const head=['Cliente','Data','Documento','Da','A','Merce','Peso kg','Targa','Autista','Km','Importo €','Viaggio'];
 const lines=rows.map(r=>[r.customer,r.date.split('-').reverse().join('/'),r.doc,r.origin,r.destination,r.goods,r.weight_kg,r.plate,r.driver,r.km,(r.amount_cents/100).toFixed(2).replace('.',','),r.trip_id].map(cell).join(';'));
 return '﻿'+[head.join(';'),...lines].join('\r\n');
}

return {compute,split,share,invoiceRows,toCsv,KIND_LABEL,KIND_GROUP};
});
