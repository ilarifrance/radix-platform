'use strict';
// Pure, offline preflight only. It never calls a paid API or stores contact data.
(function(root){
 const clean=x=>String(x??'').normalize('NFKC').trim();
 const bad=/\b(mostra altro|see more|february|january|march|april|may|june|july|august|september|october|november|december)\b/i;
 const issues=r=>{
  const out=[];
  if(!clean(r.fullName))out.push('nome');
  if(!clean(r.jobTitle))out.push('ruolo');
  if(!clean(r.companyName))out.push('azienda');
  else if(bad.test(clean(r.companyName)))out.push('azienda da verificare');
  if(!clean(r.companyDomain))out.push('dominio');
  if(!clean(r.email))out.push('email');
  if(!clean(r.phone))out.push('telefono');
  return out;
 };
 function plan(rows,options={}){
  if(!Array.isArray(rows)||rows.length>5000)throw Error('Lotto non valido');
  const cost=Number(options.unitCost??0),budget=Number(options.budget??0);
  if(!Number.isFinite(cost)||cost<0||cost>100||!Number.isFinite(budget)||budget<0||budget>100000)throw Error('Costo o budget non valido');
  const seen=new Set(),queue=[];
  for(const row of rows){
   const url=clean(row.profileUrl).split('?')[0].replace(/\/$/,'').toLowerCase();
   if(url&&seen.has(url))continue;
   if(url)seen.add(url);
   const missing=issues(row);
   const companyReady=clean(row.companyName)&&!missing.includes('azienda da verificare');
   // One paid email-finder call is only an estimate; there is no automated request.
   const candidate=Boolean(companyReady&&!clean(row.email));
   queue.push({fullName:clean(row.fullName),companyName:clean(row.companyName),profileUrl:clean(row.profileUrl),missing,eligible: candidate});
  }
  const eligible=queue.filter(x=>x.eligible).length;
  const permitted=cost===0?0:Math.min(eligible,Math.floor((budget+1e-9)/cost));
  return {total:queue.length,needReview:queue.filter(x=>x.missing.includes('azienda')||x.missing.includes('azienda da verificare')||x.missing.includes('ruolo')).length,
    eligible,plannedCalls:permitted,estimatedCost:Number((permitted*cost).toFixed(4)),currency:'EUR',queue};
 }
 const api={issues,plan};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.RadixEnrichmentPlan=api;
})(typeof window!=='undefined'?window:globalThis);
