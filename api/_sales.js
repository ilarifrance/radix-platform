'use strict';
const { randomUUID } = require('node:crypto');
const fields = Object.freeze({companies:['name'],contacts:['name','company_id'],leads:['title','company_id','contact_id'],processes:['title','kind'],stages:['title','process_id','position','task_title'],opportunities:['title','company_id','contact_id','process_id','stage_id','amount_cents'],tasks:['title','opportunity_id','process_id','stage_id','status']});
class SalesError extends Error { constructor(status,message){super(message);this.status=status;} }
function fail(status,message){throw new SalesError(status,message);}
function uuid(v){return typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);}
function object(v){return v && typeof v==='object' && !Array.isArray(v) && Object.getPrototypeOf(v)===Object.prototype;}
function command(body){
 if(!object(body)||Object.keys(body).some(k=>!['workspace','entity','action','data'].includes(k)))fail(400,'Comando non valido.');
 const {workspace,entity,action}=body; let d=body.data;
 if(!uuid(workspace)||!Object.hasOwn(fields,entity)||!['create','update','delete','transition'].includes(action)||!object(d))fail(400,'Comando non valido.');
 let allowed=[...fields[entity]];
 if(action==='update'){if(entity==='opportunities')allowed=allowed.filter(k=>!['process_id','stage_id'].includes(k));if(entity==='processes')allowed=allowed.filter(k=>k!=='kind');allowed.push('id','version');}
 if(action==='delete')allowed=['id','version'];
 if(action==='transition'){if(entity!=='opportunities')fail(400,'Transizione non supportata.');allowed=['id','version','stage_id','key'];}
 if(Object.keys(d).some(k=>!allowed.includes(k)))fail(400,'Campo non consentito.');
 for(const [k,v] of Object.entries(d)){
   if(k==='version'){if(!Number.isInteger(v)||v<1||v>2147483646)fail(400,'Versione non valida.');}
   else if(k==='id'||k==='key'||k.endsWith('_id')){if(v===null && ['company_id','contact_id','opportunity_id'].includes(k))continue;if(v===null&&entity==='tasks'&&['process_id','stage_id'].includes(k))continue;if(!uuid(v))fail(400,'Identificativo non valido.');}
   else if(['name','title','task_title'].includes(k)){if(k==='task_title'&&v===null)continue;if(typeof v!=='string'||!v.trim()||v.length>200)fail(400,'Testo obbligatorio: massimo 200 caratteri.');}
   else if(k==='amount_cents'){if(!Number.isSafeInteger(v)||v<0||v>9000000000000)fail(400,'Importo non valido.');}
   else if(k==='position'){if(!Number.isInteger(v)||v<0||v>10000)fail(400,'Posizione non valida.');}
   else if(k==='kind'&&!['opportunity','task'].includes(v))fail(400,'Tipo processo non valido.');
   else if(k==='status'&&!['todo','doing','done'].includes(v))fail(400,'Stato non valido.');
 }
 if(action!=='create'&&(!d.id||!d.version))fail(400,'Identificativo e versione obbligatori.');
 if(action==='create'){
   const required=[entity==='companies'||entity==='contacts'?'name':'title'];
   if(entity==='processes')required.push('kind');if(entity==='stages')required.push('process_id','position');if(entity==='opportunities')required.push('process_id','stage_id');
   if(required.some(k=>d[k]===undefined||d[k]===null))fail(400,'Campi obbligatori mancanti.');
 }
 if(action==='update'&&Object.keys(d).length===2)fail(400,'Nessuna modifica.');
 if(entity==='tasks'&&((Object.hasOwn(d,'process_id')!==Object.hasOwn(d,'stage_id'))||(Object.hasOwn(d,'process_id')&&((d.process_id===null)!==(d.stage_id===null)))))fail(400,'Processo e fase devono essere coerenti.');
 if(action==='transition'&&(!d.key||!d.stage_id))fail(400,'Fase e chiave idempotenza obbligatorie.');
 d={...d};if(action==='create')d.id=randomUUID();if(action==='transition')d.task_id=randomUUID();
 return {workspace,entity,action,data:d};
}
function createHandler({getSessionUser,getStore}){
 return async function(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 try{
   if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');fail(405,'Metodo non consentito.');}
   let user;try{user=getSessionUser(req);}catch{user=null;}
   if(!user||!Number.isInteger(user.uid)||user.uid<1)fail(401,'Accedi con il tuo account RADIX.');
   if(req.method==='POST'){
     if(req.headers['x-radix-sales']!=='1'||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')||req.headers['sec-fetch-site']==='cross-site')fail(403,'Richiesta non consentita.');
   }
   let c;
   if(req.method==='POST'){
     let body=req.body;if(typeof body==='string'){if(Buffer.byteLength(body)>16384)fail(413,'Richiesta troppo grande.');try{body=JSON.parse(body);}catch{fail(400,'JSON non valido.');}}
     if(Buffer.byteLength(JSON.stringify(body)||'')>16384)fail(413,'Richiesta troppo grande.');c=command(body);
   }else{
     const q=req.query||{};if(Object.keys(q).some(k=>!['entity','workspace','offset'].includes(k)))fail(400,'Parametro non consentito.');
     if(q.entity==='workspaces'){const store=getStore();return res.status(200).json({rows:await store.workspaces(user.uid)});}
     if(!uuid(q.workspace)||(!Object.hasOwn(fields,q.entity)&&q.entity!=='dashboard'))fail(400,'Workspace o risorsa non validi.');
     const offset=q.offset===undefined?0:Number(q.offset);if(!Number.isSafeInteger(offset)||offset<0||offset>1000000||Array.isArray(q.offset))fail(400,'Pagina non valida.');
     c={workspace:q.workspace,entity:q.entity,offset};
   }
   const store=getStore();const membership=await store.membership(c.workspace,user.uid);
   if(!membership)fail(403,'Membership esplicita richiesta per questo workspace.');
   if(req.method==='POST'){
     if(!['owner','admin','member'].includes(membership.role)||(['processes','stages'].includes(c.entity)&&!['owner','admin'].includes(membership.role)))fail(403,'Permessi insufficienti.');
     return res.status(200).json({rows:[await store.command(c,user.uid)]});
   }
   return res.status(200).json({rows:await store.read(c,user.uid),limit:100,offset:c.offset});
 }catch(e){
   const codes={'42501':[403,'Permessi insufficienti.'],'P0002':[404,'Record non trovato.'],'40001':[409,'Conflitto: ricarica i dati o riusa la stessa chiave per riprovare.'],'40P01':[409,'Concorrenza: riprova la richiesta.'],'23503':[409,'Relazione non valida o record ancora collegato.'],'23505':[409,'Record o posizione già esistente.'],'23514':[400,'Dati non validi.'],'23502':[400,'Campi obbligatori mancanti.'],'22023':[400,'Comando non valido.'],'22P02':[400,'Formato non valido.']};
   const mapped=codes[e.code];res.status(e.status||mapped?.[0]||503).json({error:e.status?e.message:mapped?.[1]||'Sales non disponibile. Verificare dipendenza Neon, configurazione e migrazioni manuali in ambiente isolato.'});
 }
 };
}
module.exports={createHandler,command,uuid,fields};
