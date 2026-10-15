'use strict';
(function(root){
 const safe=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(x);
 function read(value){
  const p=typeof value==='string'?JSON.parse(value):value;
  if(!p||typeof p!=='object'||Array.isArray(p))throw Error('Evento provider non valido');
  if(!p.run)return null;
  const r=p.run;
  if(typeof r!=='object'||!safe(r.run_uid)||!safe(r.batch_uid))throw Error('Evento senza identificativi run/batch validi');
  if(!['SUCCEEDED','PARTIAL_SUCCEEDED','RUNNING'].includes(r.status))throw Error('Evento provider senza risultati elaborabili');
  if(!Array.isArray(p.results)||!p.results.length)throw Error('Evento provider senza contatti');
  return {id:'run-'+r.run_uid+'-'+r.batch_uid,raw:p.results,runStatus:r.status};
 }
 const api={read};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.RadixProviderCallback=api;
})(typeof window!=='undefined'?window:globalThis);
