'use strict';
// Deterministic review of explicitly visible Sales Navigator profile details.
// Never invents fields, accesses hidden APIs, or fetches pages.
(function(root){
 const clean=value=>String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim();
 const nameKey=value=>clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 function validProfile(v){let u;try{u=new URL(v)}catch{return false}return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['linkedin.com','www.linkedin.com'].includes(u.hostname)&&/^\/(?:sales\/lead\/|in\/)[^/]+/.test(u.pathname)}
 function select(rows,{limit=20,attempted=[]}={}){
  if(!Array.isArray(rows)||rows.length>5000||!Number.isSafeInteger(limit)||limit<1||limit>20)throw Error('Lotto di revisione non valido');
  if(!Array.isArray(attempted)||attempted.length>5000)throw Error('Storico non valido');
  const done=new Set(attempted);const chosen=[];const seen=new Set();
  for(let i=0;i<rows.length;i++){
   const r=rows[i];if(!r||typeof r!=='object')continue;
   const link=clean(r.profileUrl).split('?')[0].replace(/\/$/,'');
   if(!validProfile(link)||done.has(link)||seen.has(link)||!clean(r.fullName)||clean(r.companyName)&&clean(r.jobTitle))continue;
   chosen.push({index:i,profileUrl:link});seen.add(link);if(chosen.length>=limit)break;
  }
  return chosen;
 }
 function apply(contact,observed){
  if(!contact||!observed||typeof observed!=='object'||!validProfile(clean(contact.profileUrl)))throw Error('Scheda profilo non valida');
  const actual=nameKey(observed.fullName),expected=nameKey(contact.fullName);
  if(!actual||actual!==expected)return {changed:false,reason:'nome profilo non corrispondente',record:{...contact},fields:[]};
  const candidate={...contact},fields=[];
  const neutral=/^(?:mostra altro|see more|visualizza|view profile|informazioni|about|esperienza|experience|salva|save|message|messaggio|contact)$/i;
  const acceptable=value=>{const s=clean(value);return s.length>=2&&s.length<=180&&!neutral.test(s)&&!/[\u0000-\u001f]/.test(s)?s:''};
  let title=acceptable(observed.roleText),company=acceptable(observed.companyText);
  const split=title.match(/^(.{2,120}?)\s*[·•|]\s*(.{2,180})$/);
  if(split){title=acceptable(split[1]);if(!company)company=acceptable(split[2])}
  if(!clean(candidate.jobTitle)&&title){candidate.jobTitle=title;fields.push('jobTitle')}
  if(!clean(candidate.companyName)&&company){candidate.companyName=company;fields.push('companyName')}
  const loc=acceptable(observed.location);
  if(!clean(candidate.location)&&loc){candidate.location=loc;fields.push('location')}
  return {changed:fields.length>0,reason:fields.length?'campi visibili da rivedere':'nessun campo affidabile nuovo',record:candidate,fields};
 }
 const api={select,apply,validProfile};if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.RadixLinkedinProfileReview=api;
})(typeof window!=='undefined'?window:globalThis);
