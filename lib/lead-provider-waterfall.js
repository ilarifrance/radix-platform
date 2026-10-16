'use strict';
// RADIX Lead Intelligence — offline-only provider router. No network or secrets.
// Prices are user-entered hypothetical EUR/request; never assert provider tariff.
(function(root){
 const SERVICES=Object.freeze([
  {id:'brave-search',label:'Brave Search',kind:'domain',status:'needs-api-key'},
  {id:'hunter',label:'Hunter',kind:'email',status:'disabled'},
  {id:'dropcontact',label:'Dropcontact',kind:'email',status:'disabled'},
  {id:'snov',label:'Snov.io',kind:'email',status:'disabled'},
  {id:'prospeo',label:'Prospeo',kind:'email',status:'disabled'},
  {id:'findymail',label:'Findymail',kind:'email',status:'disabled'},
  {id:'apollo',label:'Apollo',kind:'email',status:'disabled'},
  {id:'people-data-labs',label:'People Data Labs',kind:'email',status:'disabled'}
 ]);
 const serviceById=new Map(SERVICES.map(x=>[x.id,x]));
 const trim=x=>typeof x==='string'?x.normalize('NFKC').trim():'';
 const validPrice=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=100;
 const safeDomain=x=>/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}$/i.test(trim(x))&&trim(x).length<=253;
 function quote(rows,prices={},budget=0){
  if(!Array.isArray(rows)||rows.length>5000)throw Error('Lotto non valido');
  if(!Number.isFinite(budget)||budget<0||budget>100000)throw Error('Budget non valido');
  if(!prices||typeof prices!=='object'||Array.isArray(prices))throw Error('Preventivi non validi');
  const tiers=[];
  for(const [id,unitCost] of Object.entries(prices)){
   const service=serviceById.get(id);
   if(!service||service.kind!=='email'||!validPrice(unitCost))throw Error('Prezzo o provider non valido');
   tiers.push({id,label:service.label,unitCost});
  }
  tiers.sort((a,b)=>a.unitCost-b.unitCost||a.id.localeCompare(b.id));
  const seen=new Set();let eligible=0,missingIdentity=0;
  for(const row of rows){
   if(!row||typeof row!=='object'||Array.isArray(row))throw Error('Contatto non valido');
   const profile=trim(row.profileUrl).split('?')[0].replace(/\/$/,'').toLowerCase();
   if(profile&&seen.has(profile))continue;
   if(profile)seen.add(profile);
   if(trim(row.email))continue;
   if(!trim(row.fullName)||!safeDomain(row.companyDomain)){missingIdentity++;continue}
   eligible++;
  }
  // An entire fallback chain on one contact costs the sum of all quoted
  // requests in the worst case. We never assume that a provider will succeed.
  // Round each quote UP to one ten-thousandth of a euro and the budget
  // DOWN. This avoids approving a theoretical plan fractionally over budget.
  const unitCostUnits=tiers.reduce((sum,t)=>sum+Math.ceil(t.unitCost*10000),0);
  const perContactWorstCase=unitCostUnits/10000;
  const affordable=tiers.length&&unitCostUnits>0?
   Math.min(eligible,Math.floor(Math.floor(budget*10000)/unitCostUnits)):0;
  return {mode:'offline',canExecute:false,executedCalls:0,actualSpend:0,currency:'EUR',
   eligible,missingIdentity,tiers,
   worstCaseCostPerContact:Number(perContactWorstCase.toFixed(4)),
   coveredContacts:affordable,
   maxPlannedCalls:affordable*tiers.length,
   worstCaseBudget:Number((affordable*perContactWorstCase).toFixed(4)),
   notes:'Preventivo teorico: servizi non collegati, prezzi da verificare. Nessuna API chiamata.'};
 }
 const api={SERVICES,quote};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.RadixLeadProviderWaterfall=api;
})(typeof window!=='undefined'?window:globalThis);
