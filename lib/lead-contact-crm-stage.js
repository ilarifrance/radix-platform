'use strict';
// Compare a prospect to imported individual contacts. No automatic CRM writes.
(function(root){
 const clean=x=>typeof x==='string'?x.normalize('NFKC').trim():'';
 const key=x=>clean(x).toLocaleLowerCase('it').replace(/\s+/g,' ');
 const country=x=>({it:'italia',italy:'italia',uk:'regno unito',gb:'regno unito','united kingdom':'regno unito',us:'stati uniti',usa:'stati uniti','united states':'stati uniti'}[key(x)]||key(x));
 const host=x=>{let s=clean(x).toLowerCase();if(!s)return '';try{if(/^https?:\/\//.test(s))s=new URL(s).hostname}catch{return ''}return /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}$/.test(s)?s.replace(/^www\./,''):''};
 const profile=x=>{let u;try{u=new URL(x)}catch{return false}return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['linkedin.com','www.linkedin.com'].includes(u.hostname.toLowerCase())&&/^\/(?:sales\/lead\/|in\/)[^/]+/.test(u.pathname)};
 function suggestions(prospect,contacts){
  if(!prospect||typeof prospect!=='object'||!Array.isArray(contacts)||contacts.length>5000)throw Error('Input non valido');
  const pDomain=host(prospect.domain),pName=key(prospect.name),pCountry=country(prospect.country);
  if(!pDomain&&(!pName||!pCountry))return [];
  const selected=[],seen=new Set();
  for(const person of contacts){
   if(!person||typeof person!=='object'||!clean(person.fullName)||!profile(person.profileUrl)||!clean(person.companyName))continue;
   const cDomain=host(person.companyDomain),cCountry=country(person.country),sameDomain=Boolean(pDomain&&cDomain&&pDomain===cDomain);
   const sameNameCountry=Boolean(pName&&pCountry&&cCountry&&key(person.companyName)===pName&&pCountry===cCountry);
   if(pDomain&&cDomain&&pDomain!==cDomain)continue;
   // Shared domains may cover different subsidiaries: never suggest a conflicting company name.
   if(pName&&key(person.companyName)!==pName)continue;
   if(pCountry&&cCountry&&pCountry!==cCountry)continue;
   if(!sameDomain&&!sameNameCountry)continue;
   if(seen.has(person.profileUrl))continue;
   seen.add(person.profileUrl);
   selected.push({fullName:clean(person.fullName),jobTitle:clean(person.jobTitle),companyName:clean(person.companyName),profileUrl:person.profileUrl,
    match:sameDomain?'dominio coincidente':'azienda e paese coincidenti',verified:false});
  }
  return selected.slice(0,250);
 }
 const api={suggestions};if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.RadixLeadContactCRMStage=api;
})(typeof window!=='undefined'?window:globalThis);
