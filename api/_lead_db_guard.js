'use strict';
function isolatedUrl(candidate,shared,environment){
 const refuse=message=>{const e=new Error(message);e.status=503;throw e};
 if(environment==='production')refuse('Archivio Lead Intelligence non abilitato in produzione.');
 if(typeof candidate!=='string'||!candidate.trim()||typeof shared!=='string'||!shared.trim()||candidate.trim()===shared.trim())
  refuse('Archivio Lead Intelligence disabilitato: configura LEAD_DATABASE_URL con un database Preview isolato e diverso da DATABASE_URL.');
 try{
  const a=new URL(candidate),b=new URL(shared);
  if(!['postgres:','postgresql:'].includes(a.protocol)||!['postgres:','postgresql:'].includes(b.protocol))
   refuse('LEAD_DATABASE_URL non è una connessione PostgreSQL.');
  // Different credentials or query options on the same DB do not isolate data.
  if(a.hostname===b.hostname&&a.pathname===b.pathname)
   refuse('Archivio Lead Intelligence disabilitato: host e database coincidono con quello condiviso.');
 }catch(e){if(e.status)throw e;refuse('LEAD_DATABASE_URL non valido.')}
 return candidate;
}
module.exports={isolatedUrl};
