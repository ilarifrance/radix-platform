/* RADIX Accounting — controllo di gestione: monthly income statement, budget vs actual, margins by cost
   centre or project, KPIs, receivable/payable ageing (scadenzario) and a 13-week cash forecast. Pure functions. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./chart-of-accounts'):root.RadixChartOfAccounts,typeof module==='object'&&module.exports?require('./ledger'):root.RadixLedger);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixManagement=api})(typeof globalThis!=='undefined'?globalThis:this,function(coa,ledger){
'use strict';
const pad=n=>String(n).padStart(2,'0');
const DAY=864e5;
const days=(a,b)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/DAY);
const addDays=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*DAY).toISOString().slice(0,10);
const monthRange=(y,m)=>({from:y+'-'+pad(m)+'-01',to:y+'-'+pad(m)+'-'+pad(new Date(Date.UTC(y,m,0)).getUTCDate())});
const KEYS=['ricavi','valore_produzione','acquisti','servizi','godimento','oneri_diversi','valore_aggiunto','personale','ebitda','ammortamenti','ebit','ante_imposte','utile'];
// Income statement month by month for a year (values in natural sign: costs negative).
function monthly(entries,accounts,year){
 return Array.from({length:12},(_,i)=>{const r=monthRange(+year,i+1),is=ledger.incomeStatement(entries,accounts,r);return {month:i+1,...r,values:Object.fromEntries(KEYS.map(k=>[k,is.by[k]]))};});
}
/* Budget rows: {key (income statement key, e.g. 'ricavi','servizi','ebitda'), month 1-12, amount_cents in natural sign (costs negative)}.
   Returns for each key the budget, actual, variance and whether the variance is favourable. */
function budgetVsActual(entries,accounts,budget,{year,months}){
 const until=months||12,actual=monthly(entries,accounts,year).slice(0,until),out=[];
 const keys=[...new Set((budget||[]).map(b=>b.key))].filter(k=>KEYS.includes(k));
 for(const key of keys){
  const b=(budget||[]).filter(x=>x.key===key&&x.month<=until).reduce((t,x)=>t+x.amount_cents,0);
  const a=actual.reduce((t,m)=>t+(m.values[key]||0),0),v=a-b;
  out.push({key,budget_cents:b,actual_cents:a,variance_cents:v,variance_pct:b?Math.round(v*1000/Math.abs(b))/10:null,favourable:v>=0,
   months:actual.map(m=>({month:m.month,actual_cents:m.values[key]||0,budget_cents:(budget||[]).filter(x=>x.key===key&&x.month===m.month).reduce((t,x)=>t+x.amount_cents,0)}))});
 }
 return out;
}
// Margins by a line dimension ('cost_center' or 'project'): revenue, direct costs, margin and margin %.
function byDimension(entries,accounts,dimension,o={}){
 if(!['cost_center','project'].includes(dimension))throw new Error('Dimensione non valida.');
 const idx=coa.index(accounts),m=new Map();
 for(const e of entries||[]){if(e.status==='draft'&&!o.includeDrafts)continue;if((o.from&&e.date<o.from)||(o.to&&e.date>o.to))continue;
  for(const l of e.lines){const a=idx.get(l.account);if(!a||!['R','C'].includes(a.kind))continue;const k=l[dimension]||'(non assegnato)';
   const t=m.get(k)||{key:k,revenue_cents:0,cost_cents:0};const nat=(l.credit_cents||0)-(l.debit_cents||0);if(a.kind==='R')t.revenue_cents+=nat;else t.cost_cents-=nat;m.set(k,t);}}
 return [...m.values()].map(t=>({...t,margin_cents:t.revenue_cents-t.cost_cents,margin_pct:t.revenue_cents?Math.round((t.revenue_cents-t.cost_cents)*1000/t.revenue_cents)/10:null})).sort((a,b)=>b.revenue_cents-a.revenue_cents||a.key.localeCompare(b.key));
}
// Ageing of open items at `today`: {kind:'receivable'|'payable',due,amount_cents,paid_cents}.
function ageing(items,today){
 const buckets=()=>({not_due:0,d0_30:0,d31_60:0,d61_90:0,over_90:0,total:0});
 const out={receivable:buckets(),payable:buckets(),overdue:[]};
 for(const i of items||[]){const open=i.amount_cents-(i.paid_cents||0);if(open<=0||!out[i.kind])continue;const late=days(i.due,today),b=out[i.kind];
  b.total+=open;if(late<=0)b.not_due+=open;else{out.overdue.push({...i,open_cents:open,days_late:late});if(late<=30)b.d0_30+=open;else if(late<=60)b.d31_60+=open;else if(late<=90)b.d61_90+=open;else b.over_90+=open;}}
 out.overdue.sort((a,b)=>b.days_late-a.days_late);
 return out;
}
// 13-week cash forecast: opening cash + open receivables - open payables by due week, plus recurring flows {amount_cents (signed), every:'month'|'week', day, label}.
function cashForecast(items,{today,opening_cents=0,weeks=13,recurring=[]}={}){
 const out=[];let cash=opening_cents;
 for(let w=0;w<weeks;w++){
  const from=addDays(today,w*7),to=addDays(today,w*7+6);let inflow=0,outflow=0;const detail=[];
  for(const i of items||[]){const open=i.amount_cents-(i.paid_cents||0);if(open<=0)continue;
   // Overdue items are expected in the first week.
   const due=i.due<today?today:i.due;if(due<from||due>to)continue;if(i.kind==='receivable')inflow+=open;else outflow+=open;detail.push({label:(i.counterpart||'')+' '+(i.doc_number||''),amount_cents:i.kind==='receivable'?open:-open,due:i.due});}
  for(const r of recurring){for(let d=from;d<=to;d=addDays(d,1)){const hit=r.every==='week'?new Date(d+'T12:00:00Z').getUTCDay()===(r.day??1):+d.slice(8,10)===(r.day??27);if(hit){if(r.amount_cents>=0)inflow+=r.amount_cents;else outflow-=r.amount_cents;detail.push({label:r.label,amount_cents:r.amount_cents,due:d});}}}
  cash+=inflow-outflow;out.push({week:w+1,from,to,inflow_cents:inflow,outflow_cents:outflow,closing_cents:cash,detail});
 }
 return {weeks:out,min_cents:Math.min(opening_cents,...out.map(w=>w.closing_cents)),first_negative:out.find(w=>w.closing_cents<0)||null};
}
// Headline KPIs for a period. DSO/DPO use the period's sales/purchases including VAT in open items.
function kpis(entries,accounts,items,{from,to}){
 const is=ledger.incomeStatement(entries,accounts,{from,to}),idx=coa.index(accounts),b=ledger.balances(entries,{to});
 let cash=0;for(const [code,v] of b){const a=idx.get(code);if(a&&a.group==='liquidita')cash+=v.debit_cents-v.credit_cents;}
 const openSum=k=>(items||[]).filter(i=>i.kind===k).reduce((t,i)=>t+Math.max(0,i.amount_cents-(i.paid_cents||0)),0);
 const span=Math.max(1,days(from,to)+1),purchases=-(is.by.acquisti+is.by.servizi+is.by.godimento);
 return {revenue_cents:is.revenue_cents,ebitda_cents:is.ebitda_cents,ebitda_pct:is.revenue_cents?Math.round(is.ebitda_cents*1000/is.revenue_cents)/10:null,net_cents:is.net_cents,cash_cents:cash,
  receivables_cents:openSum('receivable'),payables_cents:openSum('payable'),
  dso_days:is.revenue_cents>0?Math.round(openSum('receivable')/(is.revenue_cents*1.22)*span):null,
  dpo_days:purchases>0?Math.round(openSum('payable')/(purchases*1.22)*span):null};
}
return {monthly,budgetVsActual,byDimension,ageing,cashForecast,kpis,KEYS,addDays,days};
});
