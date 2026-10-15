// Authenticated RADIX team memory CRUD. No AI calls or external side effects.
// Memory is shared by the whole team, like the registry: each item records who wrote it and
// who confirmed it. Only confirmed items are handed to agents as context.
const {sql}=require('./_db');
const {getSessionUser}=require('./_auth');
const core=require('./_agency-memory-core');
const store=require('./_agency-memory-store');
const send=(res,code,data)=>res.status(code).json(data);
function bodyOf(req){if(typeof req.body==='string')return JSON.parse(req.body);return req.body||{}}
function safeContext(query){const projectId=core.clean(query.projectId,80),clientId=core.clean(query.clientId,80),agentId=core.clean(query.agentId,80);
 for(const id of [projectId,clientId,agentId])if(id&&!core.validId(id))throw Error('Identificatore contesto non valido');
 return {projectId,clientId,agentId};
}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 const user=getSessionUser(req);if(!user||!user.uid)return send(res,401,{error:'Accesso RADIX richiesto'});
 const uid=Number(user.uid);
 if(!['GET','POST','PATCH','DELETE'].includes(req.method))return send(res,405,{error:'Metodo non consentito'});
 try{
 const db=sql();
 if(req.method==='GET'){
  const ctx=safeContext(req.query||{});
  if(!ctx.projectId&&!ctx.clientId)return send(res,400,{error:'Seleziona un progetto o un cliente'});
  if(req.query&&req.query.mode==='context')return send(res,200,await store.context(db,ctx));
  return send(res,200,{items:await store.list(db,ctx)});
 }
 const data=bodyOf(req);
 if(req.method==='POST'){
  // People and agents propose; confirming is a separate, explicit step by a person.
  const item=core.validate({...data,status:'proposed'});
  try{return send(res,201,{ok:true,item:await store.insert(db,item,uid)})}
  catch(e){if(e.limit)return send(res,409,{error:e.message});throw e}
 }
 const id=String(data.id||'');if(!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(id))return send(res,400,{error:'ID memoria non valido'});
 if(req.method==='DELETE'){
  const revision=Number(data.revision);if(!Number.isSafeInteger(revision)||revision<1)return send(res,400,{error:'Versione richiesta'});
  const rows=await db`DELETE FROM agency_memory WHERE id=${id} AND revision=${revision} RETURNING id`;
  return rows.length?send(res,200,{ok:true}):send(res,409,{error:'Elemento assente o modificato altrove'});
 }
 const revision=Number(data.revision),status=String(data.status||'');
 if(!Number.isSafeInteger(revision)||revision<1||!core.STATUSES.includes(status))return send(res,400,{error:'Versione o stato non valido'});
 const confirmed=status==='confirmed';
 const rows=await db`UPDATE agency_memory SET status=${status},revision=revision+1,updated_at=now(),
  confirmed_by=${confirmed?uid:null},confirmed_at=${confirmed?new Date().toISOString():null}
  WHERE id=${id} AND revision=${revision}
  RETURNING id,status,revision,updated_at,confirmed_at`;
 return rows.length?send(res,200,{ok:true,item:rows[0]}):send(res,409,{error:'Elemento assente o modificato altrove'});
 }catch(e){
  if(e instanceof SyntaxError)return send(res,400,{error:'JSON non valido'});
  if(/non valido|obbligator|richiesto|livello memoria|Contesto/.test(e.message))return send(res,400,{error:e.message});
  return send(res,503,{error:'Memoria server non disponibile: verifica migrazione e database'});
 }
};
