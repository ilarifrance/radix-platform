'use strict';
const { randomUUID } = require('node:crypto');
const leadLists=require('./_lead_lists');
const leadContactJobs=require('./_lead_contact_jobs');
const growthProjects=require('./_lead_growth_projects');
const publicLookup=require('./_lead_public_lookup');
const providerStatus=require('./_lead_provider_client');
const providerCallback=require('./_lead_provider_callback');
const fields = Object.freeze({companies:['name'],contacts:['name','company_id'],leads:['title','company_id','contact_id'],processes:['title','kind'],stages:['title','process_id','position','task_title','task_assignee_id','task_priority','task_due_days'],opportunities:['title','company_id','contact_id','process_id','stage_id','amount_cents','owner_id','expected_close'],tasks:['title','company_id','contact_id','opportunity_id','process_id','stage_id','status','assignee_id','priority','due_at'],interactions:['title','kind','occurred_at','body','company_id','contact_id','opportunity_id']});
class SalesError extends Error { constructor(status,message){super(message);this.status=status;} }
function fail(status,message){throw new SalesError(status,message);}
function uuid(v){return typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);}
function object(v){return v && typeof v==='object' && !Array.isArray(v) && Object.getPrototypeOf(v)===Object.prototype;}
function timestamp(v){
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v))return false;
 const date=new Date(v);if(v.startsWith('0000-')||!Number.isFinite(date.getTime()))return false;
 return date.toISOString().slice(0,19)===v.slice(0,19);
}
// Calendar date, not an instant: no timezone conversion or inferred close time.
function calendarDate(v){return typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && timestamp(v+'T00:00:00Z');}
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
   else if(k==='expected_close'){if(v!==null&&!calendarDate(v))fail(400,'Data chiusura prevista non valida: usa YYYY-MM-DD.');}
   else if(['owner_id','assignee_id','task_assignee_id'].includes(k)){if(v!==null&&(!Number.isInteger(v)||v<1||v>2147483647))fail(400,'Assegnatario non valido.');}
   else if(['due_at','occurred_at'].includes(k)){if(v===null&&k==='due_at')continue;if(!timestamp(v))fail(400,'Usa un timestamp UTC valido con secondi e suffisso Z.');}
   else if(['priority','task_priority'].includes(k)){if(v===null&&k==='task_priority')continue;if(!['low','normal','high','urgent'].includes(v))fail(400,'Priorità non valida.');}
   else if(k==='task_due_days'){if(v!==null&&(!Number.isInteger(v)||v<0||v>3650))fail(400,'Intervallo scadenza non valido.');}
   else if(k==='body'){if(typeof v!=='string'||v.length>4000)fail(400,'Nota troppo lunga.');}
   else if(k==='id'||k==='key'||k.endsWith('_id')){if(v===null && ['company_id','contact_id','opportunity_id'].includes(k))continue;if(v===null&&entity==='tasks'&&['process_id','stage_id'].includes(k))continue;if(!uuid(v))fail(400,'Identificativo non valido.');}
   else if(['name','title','task_title'].includes(k)){if(k==='task_title'&&v===null)continue;if(typeof v!=='string'||!v.trim()||v.length>200)fail(400,'Testo obbligatorio: massimo 200 caratteri.');}
   else if(k==='amount_cents'){if(!Number.isSafeInteger(v)||v<0||v>9000000000000)fail(400,'Importo non valido.');}
   else if(k==='position'){if(!Number.isInteger(v)||v<0||v>10000)fail(400,'Posizione non valida.');}
   else if(k==='kind'&&!(entity==='interactions'?['note','call','meeting','email']:['opportunity','task']).includes(v))fail(400,'Tipo processo non valido.');
   else if(k==='status'&&!['todo','doing','done'].includes(v))fail(400,'Stato non valido.');
 }
 if(action!=='create'&&(!d.id||!d.version))fail(400,'Identificativo e versione obbligatori.');
 if(action==='create'){
   const required=[entity==='companies'||entity==='contacts'?'name':'title'];
   if(entity==='interactions')required.push('kind','occurred_at');if(entity==='processes')required.push('kind');if(entity==='stages')required.push('process_id','position');if(entity==='opportunities')required.push('process_id','stage_id');
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
   if(req.method==='POST'&&(req.headers?.['x-radix-provider-token']!==undefined||req.query?.job!==undefined)){
     const result=await providerCallback.receive(req,getStore);
     return res.status(200).json(result);
   }
   if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');fail(405,'Metodo non consentito.');}
   let user;try{user=getSessionUser(req);}catch{user=null;}
   if(!user||!Number.isInteger(user.uid)||user.uid<1||user.uid>2147483647)fail(401,'Accedi con il tuo account RADIX.');
   if(req.method==='POST'){
     if(req.headers['x-radix-sales']!=='1'||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')||req.headers['sec-fetch-site']==='cross-site')fail(403,'Richiesta non consentita.');
   }
   let c;
   if(req.method==='POST'){
     let body=req.body;if(typeof body==='string'){if(Buffer.byteLength(body)>200000)fail(413,'Richiesta troppo grande.');try{body=JSON.parse(body);}catch{fail(400,'JSON non valido.');}}
     if(Buffer.byteLength(JSON.stringify(body)||'')>(['lead_lists','lead_contact_jobs'].includes(body?.entity)?1700000:body?.entity==='lead_growth_projects'?150000:16384))fail(413,'Richiesta troppo grande.');if(body?.entity==='lead_provider_status'){
       if(!object(body)||Object.keys(body).some(k=>!['workspace','entity','action','data'].includes(k))||body.action!=='test'||!uuid(body.workspace)||!object(body.data)||Object.keys(body.data).length)fail(400,'Verifica provider non valida.');
       c={workspace:body.workspace,entity:'lead_provider_status',data:{}};
     }else if(body?.entity==='lead_public_lookup'){
       if(!object(body)||Object.keys(body).some(k=>!['workspace','entity','action','data'].includes(k))||body.action!=='suggest'||!uuid(body.workspace)||!object(body.data)||Object.keys(body.data).some(k=>!['name','domain'].includes(k)))fail(400,'Richiesta ricerca pubblica non valida.');
       c={workspace:body.workspace,entity:'lead_public_lookup',data:body.data};
     }else c=body?.entity==='lead_growth_projects'?growthProjects.command(body):body?.entity==='lead_contact_jobs'?leadContactJobs.command(body):body?.entity==='lead_lists'?leadLists.command(body):command(body);
   }else{
     const q=req.query||{};if(Object.keys(q).some(k=>!['entity','workspace','offset','subject','id','search','due'].includes(k)))fail(400,'Parametro non consentito.');
     if(q.search!==undefined && (!['companies','contacts'].includes(q.entity)||typeof q.search!=='string'||q.search.length>200||/[\u0000-\u001f\u007f]/.test(q.search)))fail(400,'Ricerca non valida: massimo 200 caratteri per aziende o contatti.');
     if(q.due!==undefined && (q.entity!=='tasks'||!['all','overdue','upcoming','unscheduled'].includes(q.due)))fail(400,'Filtro scadenza non valido.');
     if(q.entity==='workspaces'){const store=getStore();return res.status(200).json({rows:await store.workspaces(user.uid)});}
     if(q.entity==='lead_workspaces'){
       if(Object.keys(q).some(k=>k!=='entity'))fail(400,'Parametri archivio non validi.');
       const store=getStore();return res.status(200).json({rows:await store.leadLists.workspaces(user.uid)});
     }
     if(!uuid(q.workspace)||(!Object.hasOwn(fields,q.entity)&&!['dashboard','members','customer360','lead_lists','lead_contact_jobs','lead_growth_projects','lead_provider_status'].includes(q.entity)))fail(400,'Workspace o risorsa non validi.');
     const offset=q.offset===undefined?0:Number(q.offset);if(!Number.isSafeInteger(offset)||offset<0||offset>1000000||Array.isArray(q.offset))fail(400,'Pagina non valida.');
     if(q.entity==='customer360'){if(!['companies','contacts','opportunities'].includes(q.subject)||!uuid(q.id))fail(400,'Cliente non valido.');}
     else if(q.subject!==undefined||(q.id!==undefined&&(!['lead_lists','lead_contact_jobs','lead_growth_projects'].includes(q.entity)||!uuid(q.id))))fail(400,'Filtro non consentito.');
     c={workspace:q.workspace,entity:q.entity,offset,...(q.due!==undefined?{due:q.due}:{}),...(q.search!==undefined?{search:q.search.trim()}:{}),...(q.entity==='customer360'?{subject:q.subject,id:q.id}:{}),...(['lead_lists','lead_contact_jobs','lead_growth_projects'].includes(q.entity)&&q.id!==undefined?{id:q.id}:{})};
   }
   const store=getStore();const membership=await (['lead_lists','lead_contact_jobs','lead_growth_projects','lead_public_lookup','lead_provider_status'].includes(c.entity)?store.leadLists.membership(c.workspace,user.uid):store.membership(c.workspace,user.uid));
   if(!membership||!['owner','admin','member','viewer'].includes(membership.role))fail(403,'Membership esplicita richiesta per questo workspace.');
   if(c.entity==='lead_provider_status'){
     if(req.method==='GET')return res.status(200).json(providerStatus.status());
     if(!['owner','admin'].includes(membership.role))fail(403,'Solo admin e owner possono verificare la connessione API.');
     return res.status(200).json(await providerStatus.verify());
   }
   if(req.method==='POST'&&c.entity==='lead_public_lookup'){
     const result=await publicLookup.lookup(c.data);
     return res.status(200).json(result);
   }
   if(req.method==='POST'){
     if(!['owner','admin','member'].includes(membership.role)||(['processes','stages'].includes(c.entity)&&!['owner','admin'].includes(membership.role)))fail(403,'Permessi insufficienti.');
     return res.status(200).json({rows:[await (c.entity==='lead_lists'?store.leadLists.command(c,user.uid):c.entity==='lead_contact_jobs'?store.leadContactJobs.command(c,user.uid):c.entity==='lead_growth_projects'?store.growthProjects.command(c,user.uid):store.command(c,user.uid))]});
   }
   return res.status(200).json({rows:await (c.entity==='lead_lists'?store.leadLists.read(c,user.uid):c.entity==='lead_contact_jobs'?store.leadContactJobs.read(c,user.uid):c.entity==='lead_growth_projects'?store.growthProjects.read(c,user.uid):store.read(c,user.uid)),limit:100,offset:c.offset});
 }catch(e){
   const codes={'42P01':[503,'Archivio Lead Intelligence non attivato: migrazione Preview ancora da applicare in un database isolato.'],'22007':[400,'Timestamp non valido.'],'22008':[400,'Timestamp fuori intervallo.'],'42501':[403,'Permessi insufficienti.'],'P0002':[404,'Record non trovato.'],'40001':[409,'Conflitto: ricarica i dati o riusa la stessa chiave per riprovare.'],'40P01':[409,'Concorrenza: riprova la richiesta.'],'23503':[409,'Relazione non valida o record ancora collegato.'],'23505':[409,'Record o posizione già esistente.'],'23514':[400,'Dati non validi.'],'23502':[400,'Campi obbligatori mancanti.'],'22023':[400,'Comando non valido.'],'22P02':[400,'Formato non valido.']};
   const mapped=codes[e.code];res.status(e.status||mapped?.[0]||503).json({error:e.status?e.message:mapped?.[1]||'Sales non disponibile. Verificare dipendenza Neon, configurazione e migrazioni manuali in ambiente isolato.'});
 }
 };
}
module.exports={createHandler,command,uuid,fields,timestamp,calendarDate};
