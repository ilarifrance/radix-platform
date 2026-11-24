/* Plancia (Trasporti) — management control on top of the margin (lib/trasporti/margini.js), the way haulage
   management software reads it: variable costs (they grow with the km: fuel, tolls, tyres, workshop,
   subcontractors, allowances) and fixed costs (wages, leasing, insurance, road tax, overheads), contribution
   margin, break-even revenue, revenue and cost per km, fuel consumption per vehicle, monthly trend, deadlines of
   the vehicles and what to look at. Amounts in cents. Pure functions. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixTrControllo=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const VARIABLE=new Set(['carburante','adblue','pedaggio','lavaggio','lettiera','subvettore','trasferte','straordinari','autista_esterno','pneumatici','manutenzione']);
const pad=n=>String(n).padStart(2,'0');
const MONTH_NAMES=['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
const DAY=86400000,dn=s=>Date.parse(s.slice(0,10)+'T00:00:00Z')/DAY;

// calendar months touching [from,to], each cut to the period
function months(from,to){
 const out=[];if(!from||!to||to<from)return out;
 let y=+from.slice(0,4),m=+from.slice(5,7);
 for(let i=0;i<60;i++){
  const a=y+'-'+pad(m)+'-01',last=new Date(Date.UTC(y,m,0)).getUTCDate(),b=y+'-'+pad(m)+'-'+pad(last);
  if(a>to)break;
  out.push({key:y+'-'+pad(m),label:MONTH_NAMES[m-1]+' '+String(y).slice(2),from:a<from?from:a,to:b>to?to:b,full:a>=from&&b<=to});
  m++;if(m>12){m=1;y++;}
 }
 return out;
}
// the last n months ending with the month of `to`
function lastMonths(to,n){const y=+to.slice(0,4),m=+to.slice(5,7);const d=new Date(Date.UTC(y,m-1-(n-1),1));return months(d.toISOString().slice(0,10),to);}

/* m: result of RadixTrMargini.compute for the period. costs: the raw costs (for litres). */
function analyze({m,costs,vehicles,drivers,customers,payslips,company,from,to,today}){
 const t=m.totals;let variable=0,fixed=0;
 for(const [k,c] of Object.entries(m.by_kind))(VARIABLE.has(k)?(variable+=c):(fixed+=c));
 const contribution=t.revenue_cents-variable;
 const ratio=t.revenue_cents>0?contribution/t.revenue_cents:null;
 const breakeven=ratio&&ratio>0?Math.round(fixed/ratio):null;
 const perKm=c=>t.km?Math.round(c/t.km):null;
 // litres per vehicle in the period (fuel receipts and fuel card invoices with litres)
 const litres={};for(const c of costs||[])if(c.kind==='carburante'&&c.vehicle_id&&c.liters>0&&String(c.date).slice(0,10)>=from&&String(c.date).slice(0,10)<=to)litres[c.vehicle_id]=(litres[c.vehicle_id]||0)+Number(c.liters);
 const ref=company&&company.ref_cost_km_cents||null;
 const veh=m.vehicles.map(v=>({...v,revenue_per_km_cents:v.km?Math.round(v.revenue_cents/v.km):null,liters:litres[v.id]||null,l100:litres[v.id]&&v.km?Math.round(litres[v.id]*1000/v.km)/10:null,over_ref:!!(ref&&v.cost_per_km_cents&&v.cost_per_km_cents>ref)}));
 const alerts=[];
 const say=(level,text,tab)=>alerts.push({level,text,tab});
 for(const c of m.customers)if(c.revenue_cents>0&&c.margin_pct!=null&&c.margin_pct<0)say('critico','Il cliente '+c.name+' è in perdita: margine '+String(c.margin_pct).replace('.',',')+'%. Controlla il listino.','listini');
  else if(c.revenue_cents>0&&c.margin_pct!=null&&c.margin_pct<8)say('attenzione','Il cliente '+c.name+' ha un margine basso ('+String(c.margin_pct).replace('.',',')+'%).','listini');
 for(const v of veh)if(v.over_ref)say('attenzione','Il mezzo '+v.name+' costa '+(v.cost_per_km_cents/100).toFixed(2).replace('.',',')+' €/km, sopra il riferimento di '+(ref/100).toFixed(2).replace('.',',')+' €/km.','margine');
 for(const v of veh)if(v.l100&&v.l100>38)say('attenzione','Il mezzo '+v.name+' consuma '+String(v.l100).replace('.',',')+' l/100 km: controlla rifornimenti e km.','costi');
 // payslips missing for the full months of the period, for active drivers with trips
 const full=months(from,to).filter(x=>x.full);
 const have=new Set((payslips||[]).map(p=>p.driver_id+'|'+p.month));
 const busy=new Set(m.drivers.filter(d=>d.trips>0).map(d=>d.id));
 for(const mo of full){const miss=(drivers||[]).filter(d=>d.active!==false&&busy.has(d.id)&&!have.has(d.id+'|'+mo.key));if(miss.length)say('info','Buste paga di '+mo.label+' non caricate: '+miss.map(d=>d.name).join(', ')+'. Senza, il costo degli autisti manca.','costi');}
 const other=(costs||[]).filter(c=>c.kind==='altro'&&String(c.date).slice(0,10)>=from&&String(c.date).slice(0,10)<=to);
 if(other.length)say('info',other.length+(other.length===1?' costo da classificare':' costi da classificare')+' (voce «Altri costi»).','costi');
 if(t.missing_revenue)say('attenzione',t.missing_revenue+(t.missing_revenue===1?' viaggio senza importo':' viaggi senza importo')+': calcolali dal listino in Fatturazione.','fatturazione');
 for(const d of deadlines(vehicles,today||to,drivers))if(d.days<=30)say(d.days<0?'critico':'attenzione',d.label+' di '+d.plate+(d.days<0?' scaduta il ':' scade il ')+d.date.split('-').reverse().join('/')+'.','anagrafiche');
 const order={critico:0,attenzione:1,info:2};alerts.sort((a,b)=>order[a.level]-order[b.level]);
 return {variable_cents:variable,fixed_cents:fixed,contribution_cents:contribution,contribution_pct:ratio!=null?Math.round(ratio*1000)/10:null,breakeven_cents:breakeven,
  breakeven_gap_cents:breakeven!=null?t.revenue_cents-breakeven:null,revenue_per_km_cents:perKm(t.revenue_cents),cost_per_km_cents:perKm(t.cost_cents),variable_per_km_cents:perKm(variable),fixed_per_km_cents:perKm(fixed),
  vehicles:veh,alerts};
}

/* The margin of the period seen through filters (customer, vehicle, driver, kind of vehicle, route, group of costs,
   trips at a loss) and grouped also by route and by month. m: result of RadixTrMargini.compute. Costs that belong to
   no trip (a vehicle that never moved, overheads with no trips) stay in only when no trip is filtered out.
   f: {vehicle_id, driver_id, customer_id, vehicle_kind, route, cost_group, margin:'neg'|'low', low_pct}
   look: {vehicleKind:Map(id→kind), kindGroup:{kind→group}} → same shape as m, plus routes, months, active, left_out_cents. */
function slice(m,f,look){
 f=f||{};look=look||{};
 const norm=x=>String(x||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
 const q=norm(f.route),kg=look.kindGroup||{},vk=look.vehicleKind||new Map();
 const keepKind=k=>!f.cost_group||(kg[k]||'Azienda')===f.cost_group;
 const low=f.low_pct!=null?+f.low_pct:8;
 const tripFilter=!!(f.vehicle_id||f.driver_id||f.customer_id||f.vehicle_kind||q||f.margin);
 const pct=(a,b)=>b>0?Math.round(a*1000/b)/10:null;
 const add=(o,k,c)=>{o[k]=(o[k]||0)+c;};
 const rows=m.trips.map(r=>{
  if(!f.cost_group)return r;
  const pick=o=>Object.fromEntries(Object.entries(o).filter(([k])=>keepKind(k)));
  const direct=pick(r.direct),allocated=pick(r.allocated);
  const cost=Object.values(direct).reduce((a,b)=>a+b,0)+Object.values(allocated).reduce((a,b)=>a+b,0);
  return {...r,direct,allocated,cost_cents:cost,margin_cents:r.revenue_cents-cost,margin_pct:pct(r.revenue_cents-cost,r.revenue_cents)};
 }).filter(r=>(!f.vehicle_id||r.vehicle_id===f.vehicle_id)&&(!f.driver_id||r.driver_id===f.driver_id)&&(!f.customer_id||r.customer_id===f.customer_id)
  &&(!f.vehicle_kind||vk.get(r.vehicle_id)===f.vehicle_kind)&&(!q||norm((r.origin||'')+' '+(r.destination||'')).includes(q))
  &&(!f.margin||(f.margin==='neg'?r.margin_cents<0:r.margin_pct!=null&&r.margin_pct<low)));
 // costs outside the trips, by kind: what the whole period has more than its trips
 const inTrips={};for(const r of m.trips)for(const o of [r.direct,r.allocated])for(const [k,c] of Object.entries(o))add(inTrips,k,c);
 const outside={};for(const [k,c] of Object.entries(m.by_kind)){const d=c-(inTrips[k]||0);if(d>0&&keepKind(k))outside[k]=d;}
 const outsideTot=Object.values(outside).reduce((a,b)=>a+b,0);
 const byKind={};for(const r of rows)for(const o of [r.direct,r.allocated])for(const [k,c] of Object.entries(o))add(byKind,k,c);
 if(!tripFilter)for(const [k,c] of Object.entries(outside))add(byKind,k,c);
 const group=(key,name,base)=>{
  const g=new Map();
  for(const r of rows){const k=key(r);if(k==null||k==='')continue;const x=g.get(k)||{id:k,name:name(k,r),trips:0,km:0,empty_km:0,revenue_cents:0,cost_cents:0,by_kind:{}};x.trips++;x.km+=r.km;x.empty_km+=r.empty_km||0;x.revenue_cents+=r.revenue_cents;x.cost_cents+=r.cost_cents;for(const o of [r.direct,r.allocated])for(const [k2,c] of Object.entries(o))add(x.by_kind,k2,c);g.set(k,x);}
  // costs of a vehicle or driver with no trips in the period, only when nothing is filtered out
  if(base&&!tripFilter)for(const b of base)if(b.unallocated_cents){const x=g.get(b.id)||{id:b.id,name:b.name,trips:0,km:0,revenue_cents:0,cost_cents:0,by_kind:{}};const part=f.cost_group?Object.entries(b.by_kind||{}).filter(([k])=>keepKind(k)).reduce((a,[,c])=>a+c,0)-Object.values(x.by_kind).reduce((a,c)=>a+c,0):b.unallocated_cents;if(part>0){x.unallocated_cents=part;x.cost_cents+=part;g.set(b.id,x);}}
  return [...g.values()].map(x=>({...x,margin_cents:x.revenue_cents-x.cost_cents,margin_pct:pct(x.revenue_cents-x.cost_cents,x.revenue_cents),cost_per_km_cents:x.km?Math.round(x.cost_cents/x.km):null}));
 };
 const nameOf=list=>{const mp=new Map(list.map(x=>[x.id,x.name]));return k=>mp.get(k)||k;};
 const byRev=(a,b)=>b.revenue_cents-a.revenue_cents;
 const revenue=rows.reduce((a,r)=>a+r.revenue_cents,0),cost=rows.reduce((a,r)=>a+r.cost_cents,0)+(tripFilter?0:outsideTot);
 return {trips:rows,vehicles:group(r=>r.vehicle_id,nameOf(m.vehicles),m.vehicles).sort(byRev),drivers:group(r=>r.driver_id,nameOf(m.drivers),m.drivers).sort(byRev),customers:group(r=>r.customer_id,nameOf(m.customers)).sort(byRev),
  routes:group(r=>r.origin&&r.destination?r.origin+' → '+r.destination:null,k=>k).sort(byRev),
  months:group(r=>r.date.slice(0,7),k=>MONTH_NAMES[+k.slice(5,7)-1]+' '+k.slice(0,4)).sort((a,b)=>a.id<b.id?-1:1),
  by_kind:byKind,company_costs:m.company_costs,active:tripFilter||!!f.cost_group,trip_filter:tripFilter,left_out_cents:tripFilter?outsideTot:0,
  totals:{trips:rows.length,km:rows.reduce((a,r)=>a+r.km,0),empty_km:rows.reduce((a,r)=>a+(r.empty_km||0),0),revenue_cents:revenue,cost_cents:cost,margin_cents:revenue-cost,margin_pct:pct(revenue-cost,revenue),missing_revenue:rows.filter(r=>r.missing_revenue).length}};
}

// Ready-made periods of a management program, as [from,to] around a day.
function preset(key,today,first){
 const y=+today.slice(0,4),mo=+today.slice(5,7),iso=d=>d.toISOString().slice(0,10),u=(a,b,c)=>new Date(Date.UTC(a,b,c));
 const t=u(y,mo-1,+today.slice(8,10));
 switch(key){
  case 'oggi':return [today,today];
  case 'settimana':{const wd=(t.getUTCDay()+6)%7;return [iso(new Date(t-wd*DAY)),today];}
  case 'mese':return [iso(u(y,mo-1,1)),today];
  case 'mese_scorso':return [iso(u(y,mo-2,1)),iso(u(y,mo-1,0))];
  case 'ultimi30':return [iso(new Date(t-29*DAY)),today];
  case 'trimestre':return [iso(u(y,Math.floor((mo-1)/3)*3,1)),today];
  case 'anno':return [y+'-01-01',today];
  case 'anno_scorso':return [(y-1)+'-01-01',(y-1)+'-12-31'];
  case 'tutto':return [first&&first<today?first:today,today];
 }
 return null;
}
const PRESETS=[['mese','Questo mese'],['mese_scorso','Mese scorso'],['ultimi30','Ultimi 30 giorni'],['settimana','Questa settimana'],['oggi','Oggi'],['trimestre','Questo trimestre'],['anno','Quest\'anno'],['anno_scorso','Anno scorso'],['tutto','Tutto']];

// Deadlines kept on the vehicle (as in every fleet register): inspection, insurance, tachograph, road tax, ATP.
const DEADLINES=[['due_revisione','Revisione'],['due_assicurazione','Assicurazione'],['due_tachigrafo','Tachigrafo'],['due_bollo','Bollo'],['due_atp','ATP']];
const DRIVER_DEADLINES=[['due_patente','Patente'],['due_cqc','CQC'],['due_carta','Carta tachigrafica'],['due_adr','Patentino ADR'],['due_visita','Visita medica']];
function deadlines(vehicles,today,drivers){
 const out=[];const t=String(today||'').slice(0,10);if(!t)return out;
 for(const v of vehicles||[]){if(v.active===false)continue;for(const [k,label] of DEADLINES)if(v[k]&&/^\d{4}-\d{2}-\d{2}$/.test(v[k]))out.push({vehicle_id:v.id,plate:v.plate,kind:k,label,date:v[k],days:Math.round(dn(v[k])-dn(t))});}
 for(const d of drivers||[]){if(d.active===false)continue;for(const [k,label] of DRIVER_DEADLINES)if(d[k]&&/^\d{4}-\d{2}-\d{2}$/.test(d[k]))out.push({driver_id:d.id,plate:d.name,kind:k,label,date:d[k],days:Math.round(dn(d[k])-dn(t))});}
 return out.sort((a,b)=>a.days-b.days);
}

return {DRIVER_DEADLINES,VARIABLE,DEADLINES,PRESETS,months,lastMonths,analyze,deadlines,slice,preset};
});
