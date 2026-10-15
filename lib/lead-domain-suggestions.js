'use strict';
// Offline-only reconciliation of domain suggestions from approved source adapters.
// Never fetches URLs, accepts an email address, or persists a suggested value.
(function(root){
 const PROVIDERS=new Set(['wikidata','brave-search','manual']);
 const clean=x=>typeof x==='string'?x.normalize('NFKC').trim():'';
 const normalized=x=>clean(x).toLocaleLowerCase('it').replace(/\s+/g,' ');
 function domain(raw){
  const s=clean(raw);if(!s||s.length>1500)return '';
  let u;try{u=new URL(/^https?:\/\//i.test(s)?s:'https://'+s)}catch{return ''}
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port)return '';
  let host=u.hostname.toLowerCase();if(host.startsWith('www.'))host=host.slice(4);
  if(host.length>253||host.endsWith('.')||!host.includes('.'))return '';
  const labels=host.split('.');
  if(labels.some(x=>!x||x.length>63||!(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(x))))return '';
  const tld=labels[labels.length-1];
  if(!/^(?:[a-z]{2,24}|xn--[a-z0-9-]{2,59})$/.test(tld))return '';
  return host;
 }
 function sourceURL(value){
  const s=clean(value);if(!s||s.length>1600)return '';
  try{const u=new URL(s);if(u.protocol!=='https:'||u.username||u.password||u.port||!domain(u.hostname))return '';return u.toString()}catch{return ''}
 }
 const key=(name,country)=>normalized(name)+'|'+normalized(country);
 function reconcile(rows,evidence){
  if(!Array.isArray(rows)||rows.length>5000||!Array.isArray(evidence)||evidence.length>10000)throw Error('Lotto di suggerimenti non valido');
  const groups=new Map();
  for(const row of rows){
   if(!row||typeof row!=='object'||Array.isArray(row))throw Error('Contatto non valido');
   const name=clean(row.companyName),country=clean(row.country);
   if(!name||name.length>200||country.length>100)continue;
   const k=key(name,country);if(!groups.has(k))groups.set(k,{companyName:name,country,contactCount:0,existing:new Set(),proposals:new Map()});
   const g=groups.get(k);g.contactCount++;
   if(clean(row.companyDomain))g.existing.add(domain(row.companyDomain)||'INVALID');
  }
  let unmatchedEvidence=0,invalidEvidence=0;
  for(const item of evidence){
   if(!item||typeof item!=='object'||Array.isArray(item)){invalidEvidence++;continue}
   const name=clean(item.companyName),country=clean(item.country),provider=clean(item.provider);
   const g=groups.get(key(name,country));if(!g){unmatchedEvidence++;continue}
   const d=domain(item.domain),source=sourceURL(item.sourceUrl);
   if(!PROVIDERS.has(provider)||!d||!source){invalidEvidence++;continue}
   if(!g.proposals.has(d))g.proposals.set(d,new Map());
   g.proposals.get(d).set(provider+'|'+source,{provider,sourceUrl:source});
  }
  const companies=[...groups.values()].map(g=>{
   const proposals=[...g.proposals.entries()].map(([d,sources])=>({domain:d,sourceCount:sources.size,sources:[...sources.values()],verified:false}));
   const existing=[...g.existing];
   const status=existing.length>1||existing.includes('INVALID')?'existing_conflict':existing.length?'already_present':proposals.length>1?'conflict':proposals.length?'review':'no_suggestion';
   return {companyName:g.companyName,country:g.country,contactCount:g.contactCount,status,existingDomain:existing.length===1&&existing[0]!=='INVALID'?existing[0]:'',proposals:status==='already_present'?[]:proposals};
  });
  return {totalCompanies:companies.length,companies,unmatchedEvidence,invalidEvidence};
 }
 const api={domain,reconcile};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.RadixLeadDomainSuggestions=api;
})(typeof window!=='undefined'?window:globalThis);
