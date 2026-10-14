'use strict';
(function(root){
 const allowed=['captain-data','phantombuster','generic'];
 const clean=v=>String(v??'').trim();
 const key=r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k.toLowerCase().replace(/[^a-z0-9]/g,''),v]));
 const first=(row,names)=>{for(const n of names){const value=row[n];if(value!==undefined&&value!==null&&clean(value))return clean(value)}return ''};
 const paths=['results','items','data','leads','profiles','companies'];
 function rows(raw){
  let r=typeof raw==='string'?JSON.parse(raw):raw;
  for(let i=0;i<3&&r&&!Array.isArray(r);i++){
   if(typeof r!=='object')break;
   const p=paths.find(x=>Array.isArray(r[x]));if(!p)break;r=r[p];
  }
  if(!Array.isArray(r)||!r.length||r.length>250)throw Error('Sono richiesti 1–250 risultati in formato JSON array');
  return r;
 }
 function convert(raw,provider,sourceUrl){
  if(!allowed.includes(provider))throw Error('Provider non riconosciuto');
  const link=root.RadixLeadIntakeCore.linkedinUrl(sourceUrl);
  const seen=new Set();
  const result=rows(raw).map((r,i)=>{
   if(!r||typeof r!=='object'||Array.isArray(r))throw Error('Risultato '+(i+1)+' non valido');
   const o=key(r),name=first(o,['companyname','company','organizationname','organization','accountname','name']);
   const domain=first(o,['companywebsite','companydomain','website','domain','companyurl']);
   const company=name||domain;
   if(!company)throw Error('Risultato '+(i+1)+' senza azienda: non inventare il nome');
   const source=first(o,['companylinkedinurl','companylinkedinprofile','linkedincompanyurl','sourceurl','profileurl','linkedinurl'])||link.url.split('?')[0];
   if(source.startsWith('http')&&!/^https:\/\//.test(source))throw Error('Fonte non sicura');
   const mapped={name:company.slice(0,200),domain:domain.slice(0,200),country:first(o,['country','companycountry','locationcountry']).slice(0,200),
     industry:first(o,['industry','companyindustry']).slice(0,200),companySize:first(o,['companysize','headcount','employeeheadcount']).slice(0,200),
     contactRole:first(o,['jobtitle','title','position','contactrole']).slice(0,200),source:source.slice(0,500)};
   const identity=root.RadixLeadIntakeCore.identity(mapped);
   if(identity&&seen.has(identity))return null;
   if(identity)seen.add(identity);
   return mapped;
  }).filter(Boolean);
  return {rows:result,received:rows(raw).length,provider};
 }
 const api={convert};if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.RadixLeadProviderAdapter=api;
})(typeof window!=='undefined'?window:globalThis);
