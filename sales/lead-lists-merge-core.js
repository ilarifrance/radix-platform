'use strict';
/* «Apri le liste selezionate»: several saved contact jobs (lead_contact_jobs) opened together in the Lead pipeline.
   Pure logic: one person per LinkedIn profile URL (origin + path, no query, no trailing slash, case-insensitive
   like the extension and lead-contact-batches.js; a Sales Navigator lead keeps only its id, not the search token).
   When the same person is in several lists the most complete record wins (company, role, location filled);
   on a tie the record of the newer list wins. Records without a usable profile URL are kept as they are. */
(function(root){
 const RICH=['companyName','jobTitle','location'];
 const filled=v=>typeof v==='string'?v.trim()!=='':v!=null&&v!=='';
 function profileKey(value){
  if(typeof value!=='string'||!value.trim())return '';
  let u;try{u=new URL(value.trim())}catch{return ''}
  if(!/^https?:$/.test(u.protocol))return '';
  let path=u.pathname.replace(/\/+$/,'');
  // Sales Navigator lead links carry the search they came from (/sales/lead/<id>,NAME_SEARCH,<token>):
  // the same person found by two searches has the same <id>.
  if(/^\/sales\/(?:lead|people)\//i.test(path))path=path.split(',')[0];
  return (u.origin+path).toLowerCase();
 }
 const completeness=r=>RICH.reduce((n,k)=>n+(filled(r?.[k])?1:0),0);
 const time=v=>{const t=Date.parse(v||'');return Number.isFinite(t)?t:0};
 // jobs: [{id, updatedAt, records}] in any order. Returns the merged records in list order (newest list first).
 function merge(jobs){
  const lists=(Array.isArray(jobs)?jobs:[]).map((j,i)=>({id:j?.id,at:time(j?.updatedAt),i,records:Array.isArray(j?.records)?j.records:[]}));
  // Newest first; among lists with the same date the first given wins.
  lists.sort((a,b)=>b.at-a.at||a.i-b.i);
  const byKey=new Map(),out=[];let total=0;
  for(const l of lists)for(const r of l.records){
   if(!r||typeof r!=='object')continue;total++;
   const key=profileKey(r.profileUrl);
   if(!key){out.push(r);continue}
   const seen=byKey.get(key);
   if(seen===undefined){byKey.set(key,out.length);out.push(r);continue}
   // Lists are visited newest first, so on equal completeness the record already kept is the newer one.
   if(completeness(r)>completeness(out[seen]))out[seen]=r;
  }
  return {records:out,total,unique:out.length,duplicates:total-out.length,lists:lists.length};
 }
 function summary(m){
  const n=m.lists,lists=n===1?'Aperta 1 lista':'Aperte '+n+' liste';
  return lists+': '+m.unique+(m.unique===1?' contatto unico, ':' contatti unici, ')+m.duplicates+(m.duplicates===1?' doppione unito.':' doppioni uniti.');
 }
 const api={profileKey,completeness,merge,summary};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;root.RadixLeadListsMerge=api;
})(typeof window!=='undefined'?window:globalThis);
