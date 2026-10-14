'use strict';
(function(root){
 const SIZE=100,MAX_PAGES=10;
 // A read-only preflight reduces duplicate tasks on retries/reloads.
 // It is not an atomic uniqueness guarantee against concurrent clients.
 async function findExisting({companyId,title,fetchPage}){
  if(typeof companyId!=='string'||!companyId||typeof title!=='string'||!title||typeof fetchPage!=='function')throw Error('Verifica task non valida.');
  for(let page=0;page<MAX_PAGES;page++){
   const rows=await fetchPage(page*SIZE);
   if(!Array.isArray(rows)||rows.length>SIZE)throw Error('Risposta CRM non valida: verifica task interrotta.');
   const found=rows.find(r=>r&&r.company_id===companyId&&r.title===title);
   if(found)return found;
   if(rows.length<SIZE)return null;
  }
  throw Error('Oltre 1000 task: verifica automatica incompleta. Controlla manualmente nel CRM prima di creare.');
 }
 const api={findExisting,SIZE,MAX_PAGES};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.RadixLeadTaskGuard=api;
})(typeof window!=='undefined'?window:globalThis);
