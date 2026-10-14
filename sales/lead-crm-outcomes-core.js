'use strict';
(function(root){
 const SCHEMA='radix.li.crm.outcome.v1',STAGES=Object.freeze(['contacted','replied','meeting','won','lost']),MAX_PAGE=100,MAX_PAGES=10;
 const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
 const eventKey=x=>typeof x==='string'&&/^li-[a-z0-9-]{8,110}$/i.test(x);
 const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(x)&&Number.isFinite(Date.parse(x));
 const title=row=>'RADIX Lead Intelligence · '+(row.type==='void'?'Rettifica':row.stage);
 function writeData(row,companyId){
  if(!uuid(companyId)||!row||!eventKey(row.key)||!['event','void'].includes(row.type)||!STAGES.includes(row.stage)||!date(row.at)||row.type==='void'&&!eventKey(row.ref))throw Error('Esito CRM incompleto: impossibile salvarlo.');
  const body={schema:SCHEMA,key:row.key,type:row.type,stage:row.stage,at:row.at};
  if(row.type==='void')body.ref=row.ref;
  return{title:title(row),kind:'note',company_id:companyId,occurred_at:row.at,body:JSON.stringify(body)};
 }
 function parse(r,companyId){
  if(!r||r.kind!=='note'||r.company_id!==companyId||typeof r.body!=='string')return null;
  let obj;try{obj=JSON.parse(r.body)}catch{return null}
  if(obj.schema!==SCHEMA||!eventKey(obj.key)||!['event','void'].includes(obj.type)||!STAGES.includes(obj.stage)||!date(obj.at)||r.title!==title(obj))return null;
  if(obj.type==='void'&&!eventKey(obj.ref))return null;
  return{key:obj.key,type:obj.type,stage:obj.stage,at:obj.at,...(obj.type==='void'?{ref:obj.ref}:{}),crmId:r.id};
 }
 async function read({companyId,fetchPage}){
  if(!uuid(companyId)||typeof fetchPage!=='function')throw Error('Seleziona un’azienda CRM valida.');
  const found=[];
  for(let p=0;p<MAX_PAGES;p++){
   const rows=await fetchPage(p*MAX_PAGE);
   if(!Array.isArray(rows)||rows.length>MAX_PAGE)throw Error('Risposta CRM non valida.');
   for(const r of rows){const e=parse(r,companyId);if(e)found.push(e)}
   if(rows.length<MAX_PAGE)return found;
  }
  throw Error('Oltre 1.000 interazioni CRM: impossibile escludere duplicati senza una ricerca completa.');
 }
 function timeline(rows){
  const ordered=rows.slice().sort((a,b)=>a.at.localeCompare(b.at)||a.key.localeCompare(b.key));
  const events=new Map(),voided=new Set(),corrections=[];
  for(const row of ordered){
   if(row.type==='event')events.set(row.key,row);
   else{voided.add(row.ref);corrections.push(row)}
  }
  return{active:[...events.values()].filter(row=>!voided.has(row.key)),all:[...events.values()],corrections};
 }
 const api={writeData,parse,read,timeline,STAGES,SCHEMA};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.RadixLeadCrmOutcomesCore=api;
})(typeof window!=='undefined'?window:globalThis);
