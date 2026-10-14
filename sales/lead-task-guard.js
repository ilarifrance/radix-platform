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
 // A complete snapshot prevents skipping existing follow-up stages on retries.
 async function findExistingMany({companyId,titles,fetchPage}){
  if(typeof companyId!=='string'||!companyId||!Array.isArray(titles)||titles.length<1||titles.length>10||
     new Set(titles).size!==titles.length||titles.some(t=>typeof t!=='string'||!t||t.length>200)||typeof fetchPage!=='function')throw Error('Ricerca task non valida.');
  const target=new Set(titles),found=new Map();
  for(let page=0;page<MAX_PAGES;page++){
   const rows=await fetchPage(page*SIZE);
   if(!Array.isArray(rows)||rows.length>SIZE)throw Error('Risposta CRM non valida: ricerca task interrotta.');
   for(const r of rows)if(r&&r.company_id===companyId&&target.has(r.title)&&!found.has(r.title))found.set(r.title,r);
   if(rows.length<SIZE)return found;
  }
  throw Error('Oltre 1.000 task: controllo duplicati non completo. Non creare task senza verifica manuale.');
 }
 const api={findExisting,findExistingMany,SIZE,MAX_PAGES};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.RadixLeadTaskGuard=api;
})(typeof window!=='undefined'?window:globalThis);
