/* Plancia (Trasporti) — management control on top of the margin (lib/trasporti/margini.js), the way haulage
   management software reads it: variable costs (they grow with the km: fuel, tolls, tyres, workshop,
   subcontractors, allowances) and fixed costs (wages, leasing, insurance, road tax, overheads), contribution
   margin, break-even revenue, revenue and cost per km, fuel consumption per vehicle, monthly trend, deadlines of
   the vehicles and what to look at. Amounts in cents. Pure functions. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixTrControllo=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const VARIABLE=new Set(['carburante','adblue','pedaggio','subvettore','trasferte','straordinari','autista_esterno','pneumatici','manutenzione']);
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
 for(const d of deadlines(vehicles,today||to))if(d.days<=30)say(d.days<0?'critico':'attenzione',d.label+' di '+d.plate+(d.days<0?' scaduta il ':' scade il ')+d.date.split('-').reverse().join('/')+'.','anagrafiche');
 const order={critico:0,attenzione:1,info:2};alerts.sort((a,b)=>order[a.level]-order[b.level]);
 return {variable_cents:variable,fixed_cents:fixed,contribution_cents:contribution,contribution_pct:ratio!=null?Math.round(ratio*1000)/10:null,breakeven_cents:breakeven,
  breakeven_gap_cents:breakeven!=null?t.revenue_cents-breakeven:null,revenue_per_km_cents:perKm(t.revenue_cents),cost_per_km_cents:perKm(t.cost_cents),variable_per_km_cents:perKm(variable),fixed_per_km_cents:perKm(fixed),
  vehicles:veh,alerts};
}

// Deadlines kept on the vehicle (as in every fleet register): inspection, insurance, tachograph, road tax, ATP.
const DEADLINES=[['due_revisione','Revisione'],['due_assicurazione','Assicurazione'],['due_tachigrafo','Tachigrafo'],['due_bollo','Bollo'],['due_atp','ATP']];
function deadlines(vehicles,today){
 const out=[];const t=String(today||'').slice(0,10);if(!t)return out;
 for(const v of vehicles||[]){if(v.active===false)continue;for(const [k,label] of DEADLINES)if(v[k]&&/^\d{4}-\d{2}-\d{2}$/.test(v[k]))out.push({vehicle_id:v.id,plate:v.plate,kind:k,label,date:v[k],days:Math.round(dn(v[k])-dn(t))});}
 return out.sort((a,b)=>a.days-b.days);
}

return {VARIABLE,DEADLINES,months,lastMonths,analyze,deadlines};
});
