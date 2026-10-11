// Authenticated, owner-scoped RADIX Agency memory CRUD. No AI calls or external side effects.
const crypto=require('crypto');
const {sql}=require('./_db');
const {getSessionUser}=require('./_auth');
const core=require('./_agency-memory-core');
const send=(res,code,data)=>res.status(code).json(data);
function bodyOf(req){if(typeof req.body==='string')return JSON.parse(req.body);return req.body||{}}
function safeContext(query){const projectId=core.clean(query.projectId,80),clientId=core.clean(query.clientId,80),agentId=core.clean(query.agentId,80);
 for(const id of [projectId,clientId,agentId])if(id&&!core.validId(id))throw Error('Identificatore contesto non valido');
 return {projectId,clientId,agentId};
}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 const user=getSessionUser(req);if(!user||!user.uid)return send(res,401,{error:'Accesso RADIX richiesto'});
 const owner=String(user.uid);
 if(!['GET','POST','PATCH','DELETE'].includes(req.method))return send(res,405,{error:'Metodo non consentito'});
 try{
 const db=sql();
 if(req.method==='GET'){
  const {projectId,clientId,agentId}=safeContext(req.query||{});
  if(!projectId&&!clientId)return send(res,400,{error:'Seleziona un progetto o un cliente'});
  const rows=await db`SELECT id,level,kind,status,project_id,client_id,agent_id,title,content,source,revision,created_at,updated_at
   FROM agency_memory WHERE owner_id=${owner} AND
   (level='agency' OR (level='client' AND client_id=${clientId} AND ${clientId} <> '') OR
    (project_id=${projectId} AND ${projectId} <> '' AND (level <> 'agent' OR agent_id=${agentId} OR ${agentId}='')))
   ORDER BY updated_at DESC LIMIT 250`;
  if(req.query&&req.query.mode==='context')return send(res,200,{context:core.buildContext(rows,{projectId,clientId,agentId}),count:rows.length});
  return send(res,200,{items:rows});
 }
 const data=bodyOf(req);
 if(req.method==='POST'){
  const item=core.validate({...data,status:'proposed'});
  // Every record is owner-scoped; shared means shared across agents of this owner/project, not across users.
  const count=await db`SELECT count(*)::int AS n FROM agency_memory WHERE owner_id=${owner}`;
  if(Number(count[0].n)>=1000)return send(res,409,{error:'Limite memoria account raggiunto'});
  const id=crypto.randomUUID();
  const rows=await db`INSERT INTO agency_memory
   (id,owner_id,level,kind,status,project_id,client_id,agent_id,title,content,source)
   VALUES (${id},${owner},${item.level},${item.kind},${item.status},${item.projectId},${item.clientId},${item.agentId},${item.title},${item.content},${item.source})
   RETURNING id,revision,created_at`;
  return send(res,201,{ok:true,item:rows[0]});
 }
 const id=String(data.id||'');if(!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(id))return send(res,400,{error:'ID memoria non valido'});
 if(req.method==='DELETE'){
  const revision=Number(data.revision);if(!Number.isSafeInteger(revision)||revision<1)return send(res,400,{error:'Versione richiesta'});
  const rows=await db`DELETE FROM agency_memory WHERE id=${id} AND owner_id=${owner} AND revision=${revision} RETURNING id`;
  return rows.length?send(res,200,{ok:true}):send(res,409,{error:'Elemento assente o modificato altrove'});
 }
 const revision=Number(data.revision),status=String(data.status||'');
 if(!Number.isSafeInteger(revision)||revision<1||!core.STATUSES.includes(status))return send(res,400,{error:'Versione o stato non valido'});
 const rows=await db`UPDATE agency_memory SET status=${status},revision=revision+1,updated_at=now()
  WHERE id=${id} AND owner_id=${owner} AND revision=${revision}
  RETURNING id,status,revision,updated_at`;
 return rows.length?send(res,200,{ok:true,item:rows[0]}):send(res,409,{error:'Elemento assente o modificato altrove'});
 }catch(e){
  if(e instanceof SyntaxError)return send(res,400,{error:'JSON non valido'});
  if(/non valido|obbligator|richiesto|livello memoria|Contesto/.test(e.message))return send(res,400,{error:e.message});
  return send(res,503,{error:'Memoria server non disponibile: verifica migrazione e database'});
 }
};
