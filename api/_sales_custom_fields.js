'use strict';
// «Aggiungi campo» on Aziende and Contatti (migration sales 015): a field is defined once per workspace and
// entity; each record keeps its values in «custom» = { field id: text }. command() checks the request,
// the store calls sales_custom_field_command (atomic PL/pgSQL, like sales_command).
const {randomUUID}=require('node:crypto');
class FieldError extends Error{constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new FieldError(status,message)};
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const object=v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const MAX_FIELDS=40,MAX_VALUE=500;
function label(v){
 if(typeof v!=='string'||/[\u0000-\u001f\u007f]/.test(v))fail(400,'Nome del campo non valido.');
 const t=v.trim().replace(/\s+/g,' ');if(!t||t.length>60)fail(400,'Nome del campo: da 1 a 60 caratteri.');return t;
}
function command(body){
 if(!object(body)||Object.keys(body).some(k=>!['workspace','entity','action','data'].includes(k))||body.entity!=='custom_fields'||!uuid(body.workspace)||!['create','update','delete'].includes(body.action)||!object(body.data))fail(400,'Comando campo non valido.');
 const d=body.data,a=body.action;
 const allowed=a==='create'?['entity','label']:a==='update'?['id','label']:['id'];
 if(Object.keys(d).some(k=>!allowed.includes(k)))fail(400,'Campo non consentito.');
 if(a==='create'){if(!['companies','contacts'].includes(d.entity))fail(400,'I campi si aggiungono ad aziende o contatti.');return {workspace:body.workspace,action:a,data:{id:randomUUID(),entity:d.entity,label:label(d.label)}}}
 if(!uuid(d.id))fail(400,'Identificativo non valido.');
 return {workspace:body.workspace,action:a,data:a==='update'?{id:d.id,label:label(d.label)}:{id:d.id}};
}
// Values of one record: { field id: text }. Empty values are dropped (the field stays defined).
function values(v){
 if(v===null)return {};
 if(!object(v))fail(400,'Campi aggiunti non validi.');
 const out={};const entries=Object.entries(v);if(entries.length>MAX_FIELDS)fail(400,'Troppi campi aggiunti.');
 for(const [k,x] of entries){
  if(!uuid(k))fail(400,'Campo aggiunto sconosciuto.');
  if(x===null||x==='')continue;
  if(typeof x!=='string'||/[\u0000-\u0009\u000b-\u001f\u007f]/.test(x))fail(400,'Valore del campo non valido.');
  const t=x.trim();if(t.length>MAX_VALUE)fail(400,'Valore del campo: massimo '+MAX_VALUE+' caratteri.');if(t)out[k]=t;
 }
 return out;
}
const MESSAGES=Object.freeze({'too many custom fields':[409,'Hai raggiunto il massimo di '+MAX_FIELDS+' campi aggiunti.'],'forbidden':[403,'Solo owner e admin eliminano un campo.'],'not found':[404,'Campo non trovato: ricarica la pagina.']});
function createCustomFieldsStore(sql){
 const missing=e=>{if(['42P01','42883'].includes(e.code)){const err=new Error('«Aggiungi campo» non è ancora attivo in questo archivio: serve la migrazione sales 015 (da approvare).');err.status=503;throw err}throw e};
 return {
  command:async(c,u)=>{
   try{const rows=await sql('SELECT sales_custom_field_command($1::uuid,$2::integer,$3::text,$4::jsonb) AS result',[c.workspace,u,c.action,JSON.stringify(c.data)]);return rows[0].result}
   catch(e){const m=MESSAGES[e.message];if(m){const err=new Error(m[1]);err.status=m[0];throw err}
    if(e.code==='23505'){const err=new Error('Esiste già un campo con questo nome: usa quello.');err.status=409;throw err}
    return missing(e)}
  },
  read:async(c,u)=>{
   try{return await sql("SELECT t.id,t.entity,t.label,t.position FROM sales_custom_fields t WHERE t.workspace_id=$1 AND EXISTS (SELECT 1 FROM sales_memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=$1 AND m.user_id=$2 AND m.role IN ('owner','admin','member','viewer')) ORDER BY t.entity,t.position,t.id",[c.workspace,u])}
   catch(e){if(['42P01','42883'].includes(e.code))return [];throw e}
  }
 };
}
module.exports={command,values,createCustomFieldsStore,MAX_FIELDS,MAX_VALUE};
