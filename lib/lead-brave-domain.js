'use strict';
// Parse authorized Brave Search API results into UNVERIFIED domain evidence.
// No API request, credential handling, website fetching or automated purchase.
(function(root){
 const clean=x=>typeof x==='string'?x.normalize('NFKC').trim():'';
 const nameKey=x=>clean(x).toLocaleLowerCase('it').replace(/[^a-z0-9\u00c0-\u024f]+/g,' ').trim().replace(/\s+/g,' ');
 function extract(companyName,data){
  const company=nameKey(companyName);
  if(company.length<3||company.length>140||!data||typeof data!=='object'||Array.isArray(data))throw Error('Risposta o azienda non valida');
  const entries=data.web?.results;
  if(!Array.isArray(entries)||entries.length>50)throw Error('Risultati non validi');
  const seen=new Set(),out=[];
  const domainTool=root.RadixLeadDomainSuggestions;
  if(!domainTool||typeof domainTool.domain!=='function')throw Error('Validazione dominio non disponibile');
  for(const item of entries){
   if(!item||typeof item!=='object'||Array.isArray(item))continue;
   const title=nameKey(item.title),url=clean(item.url);
   if(!title.includes(company)||!/^https:\/\//i.test(url))continue;
   let candidate;try{candidate=new URL(url)}catch{continue}
   if(candidate.username||candidate.password||candidate.port)continue;
   const host=domainTool.domain(candidate.hostname);
   if(!host||seen.has(host))continue;
   seen.add(host);
   out.push({companyName:clean(companyName),domain:host,provider:'brave-search',
     sourceUrl: candidate.origin+candidate.pathname,verified:false,method:'Titolo risultato Brave contiene nome azienda; non conferma proprietà del dominio'});
   if(out.length>=5)break;
  }
  return out;
 }
 const api={extract};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.RadixLeadBraveDomain=api;
})(typeof window!=='undefined'?window:globalThis);
