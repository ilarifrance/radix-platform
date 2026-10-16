'use strict';
// /api/workspace?resource=clients|projects|documents|approvals|activity|publications|import
// Shared team registry: every signed-in RADIX user sees the same clients and projects.
// Writes use optimistic revisions (409 when someone else saved first) and leave an activity entry.
const {sql}=require('./_db');
const {getSessionUser}=require('./_auth');
const core=require('./_registry-core');
const memory=require('./_agency-memory-store');
const editorial=require('../editorial-core.js');
const projectJourney=require('../lib/project-journey.js');
const send=(res,code,data)=>res.status(code).json(data);
function bodyOf(req){if(typeof req.body==='string')return JSON.parse(req.body||'{}');return req.body||{}}
const revisionOf=v=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<1)throw new core.InputError('Versione richiesta');return n};
const conflict=res=>send(res,409,{error:'Elemento assente o modificato da qualcun altro: ricarica e riprova'});

const CLIENT_COLS='id,name,status,sector,manager,goal,notes,revision,created_at,updated_at';
const PROJECT_COLS='p.id,p.client_id,c.name AS client_name,p.name,p.kind,p.status,p.summary,p.profile,p.revision,p.created_at,p.updated_at';

async function log(db,uid,projectId,action,subject,detail){
 await db`INSERT INTO rx_activity(project_id,actor_id,action,subject,detail) VALUES(${projectId||null},${uid},${action},${core.clean(subject,160)},${JSON.stringify(detail||{})}::jsonb)`;
}

async function clients(req,res,db,uid){
 if(req.method==='GET'){
  const rows=await db(`SELECT ${CLIENT_COLS},(SELECT count(*)::int FROM rx_projects p WHERE p.client_id=rx_clients.id) AS project_count FROM rx_clients ORDER BY lower(name),id LIMIT 500`);
  return send(res,200,{items:rows});
 }
 const data=bodyOf(req);
 if(req.method==='POST'){
  const c=core.client(data),id=data.id&&core.validClientId(data.id)?String(data.id):core.newClientId();
  const rows=await db`INSERT INTO rx_clients(id,name,status,sector,manager,goal,notes,created_by,updated_by)
   VALUES(${id},${c.name},${c.status},${c.sector},${c.manager},${c.goal},${c.notes},${uid},${uid})
   ON CONFLICT (id) DO NOTHING RETURNING id,revision,created_at,updated_at`;
  if(!rows.length)return send(res,409,{error:'Cliente già esistente'});
  await log(db,uid,null,'client.created',c.name,{clientId:id});
  return send(res,201,{ok:true,item:{...c,...rows[0]}});
 }
 if(!core.validClientId(data.id))throw new core.InputError('Cliente non valido');
 const revision=revisionOf(data.revision);
 if(req.method==='PATCH'){
  const c=core.client(data,{partial:true});
  const rows=await db`UPDATE rx_clients SET
   name=COALESCE(${c.name??null},name),status=COALESCE(${c.status??null},status),sector=COALESCE(${c.sector??null},sector),
   manager=COALESCE(${c.manager??null},manager),goal=COALESCE(${c.goal??null},goal),notes=COALESCE(${c.notes??null},notes),
   revision=revision+1,updated_by=${uid},updated_at=now()
   WHERE id=${data.id} AND revision=${revision} RETURNING id,name,status,sector,manager,goal,notes,revision,created_at,updated_at`;
  if(!rows.length)return conflict(res);
  await log(db,uid,null,'client.updated',rows[0].name,{clientId:data.id,fields:Object.keys(c)});
  return send(res,200,{ok:true,item:rows[0]});
 }
 if(req.method==='DELETE'){
  const linked=await db`SELECT count(*)::int AS n FROM rx_projects WHERE client_id=${data.id}`;
  if(linked[0].n>0)return send(res,409,{error:'Il cliente ha progetti collegati: archivialo invece di eliminarlo'});
  const rows=await db`DELETE FROM rx_clients WHERE id=${data.id} AND revision=${revision} RETURNING name`;
  if(!rows.length)return conflict(res);
  await log(db,uid,null,'client.deleted',rows[0].name,{clientId:data.id});
  return send(res,200,{ok:true});
 }
 return send(res,405,{error:'Metodo non consentito'});
}

const JOURNEY_LIMIT=40,JOURNEY_MODULES=['editorial','agency-workspace','pm','agents'];
async function journeys(db,ids){
 const out={};if(!ids.length)return out;
 const docs=await db`SELECT project_id,module,data FROM rx_documents WHERE project_id = ANY(${ids}) AND module = ANY(${JOURNEY_MODULES})`;
 const by={};for(const d of docs)(by[d.project_id]=by[d.project_id]||{})[d.module]=d.data;
 // Publications are optional: the table only exists once the registry migration has run.
 let pubs=[];try{pubs=await db`SELECT project_id,content_id,status FROM rx_publications WHERE project_id = ANY(${ids})`}catch(e){pubs=[]}
 const pubsBy={};for(const r of pubs)(pubsBy[r.project_id]=pubsBy[r.project_id]||[]).push(r);
 for(const id of ids)out[id]=projectJourney.journey(by[id]||{},{publications:pubsBy[id]||[]});
 return out;
}
async function projects(req,res,db,uid){
 if(req.method==='GET'){
  const q=req.query||{};
  if(q.id){
   if(!core.validProjectId(q.id))throw new core.InputError('Progetto non valido');
   const rows=await db(`SELECT ${PROJECT_COLS} FROM rx_projects p LEFT JOIN rx_clients c ON c.id=p.client_id WHERE p.id=$1`,[q.id]);
   if(!rows.length)return send(res,404,{error:'Progetto non trovato'});
   const docs=await db`SELECT module,revision,updated_at FROM rx_documents WHERE project_id=${q.id} ORDER BY module`;
   const item={...rows[0],documents:docs};
   if(q.journey==='1')item.journey=(await journeys(db,[q.id]))[q.id];
   return send(res,200,{item});
  }
  if(q.clientId&&!core.validClientId(q.clientId))throw new core.InputError('Cliente non valido');
  const rows=q.clientId
   ?await db(`SELECT ${PROJECT_COLS} FROM rx_projects p LEFT JOIN rx_clients c ON c.id=p.client_id WHERE p.client_id=$1 ORDER BY p.updated_at DESC LIMIT 500`,[q.clientId])
   :await db(`SELECT ${PROJECT_COLS} FROM rx_projects p LEFT JOIN rx_clients c ON c.id=p.client_id ORDER BY p.updated_at DESC LIMIT 500`);
  // ?journey=1 adds each step's state for the most recently updated projects (documents are read in full).
  if(q.journey==='1'){
   const ids=rows.slice(0,JOURNEY_LIMIT).map(r=>r.id),map=await journeys(db,ids);
   return send(res,200,{items:rows.map(r=>map[r.id]?{...r,journey:map[r.id]}:r)});
  }
  return send(res,200,{items:rows});
 }
 const data=bodyOf(req);
 if(req.method==='POST'){
  const p=core.project(data),id=data.id&&core.validProjectId(data.id)?String(data.id):core.newProjectId(p.name);
  const rows=await db`INSERT INTO rx_projects(id,client_id,name,kind,status,summary,profile,created_by,updated_by)
   VALUES(${id},${p.clientId},${p.name},${p.kind},${p.status},${p.summary},${JSON.stringify(p.profile)}::jsonb,${uid},${uid})
   ON CONFLICT (id) DO NOTHING RETURNING id,revision,created_at,updated_at`;
  if(!rows.length)return send(res,409,{error:'Progetto già esistente'});
  await log(db,uid,id,'project.created',p.name,{clientId:p.clientId});
  return send(res,201,{ok:true,item:{...p,client_id:p.clientId,...rows[0]}});
 }
 if(!core.validProjectId(data.id))throw new core.InputError('Progetto non valido');
 const revision=revisionOf(data.revision);
 if(req.method==='PATCH'){
  const p=core.project(data,{partial:true});
  const clientSet='clientId' in p;
  const rows=await db`UPDATE rx_projects SET
   client_id=CASE WHEN ${clientSet} THEN ${clientSet?p.clientId:null} ELSE client_id END,
   name=COALESCE(${p.name??null},name),kind=COALESCE(${p.kind??null},kind),status=COALESCE(${p.status??null},status),
   summary=COALESCE(${p.summary??null},summary),profile=COALESCE(${p.profile?JSON.stringify(p.profile):null}::jsonb,profile),
   revision=revision+1,updated_by=${uid},updated_at=now()
   WHERE id=${data.id} AND revision=${revision} RETURNING id,client_id,name,kind,status,summary,profile,revision,updated_at`;
  if(!rows.length)return conflict(res);
  await log(db,uid,data.id,'project.updated',rows[0].name,{fields:Object.keys(p)});
  return send(res,200,{ok:true,item:rows[0]});
 }
 if(req.method==='DELETE'){
  const rows=await db`DELETE FROM rx_projects WHERE id=${data.id} AND revision=${revision} RETURNING name`;
  if(!rows.length)return conflict(res);
  try{await memory.removeProject(db,data.id)}catch(e){}
  await log(db,uid,null,'project.deleted',rows[0].name,{projectId:data.id});
  return send(res,200,{ok:true});
 }
 return send(res,405,{error:'Metodo non consentito'});
}

async function documents(req,res,db,uid){
 if(req.method==='GET'){
  const projectId=core.clean((req.query||{}).projectId,80),module=core.clean((req.query||{}).module,40);
  if(!core.validProjectId(projectId)||!core.MODULES.includes(module))throw new core.InputError('Progetto o modulo non valido');
  const exists=await db`SELECT 1 FROM rx_projects WHERE id=${projectId}`;
  if(!exists.length)return send(res,404,{error:'Progetto non trovato'});
  const rows=await db`SELECT data,revision,updated_at,updated_by FROM rx_documents WHERE project_id=${projectId} AND module=${module}`;
  return send(res,200,rows.length?rows[0]:{data:null,revision:0,updated_at:null,updated_by:null});
 }
 if(req.method!=='PUT')return send(res,405,{error:'Metodo non consentito'});
 const d=core.documentPayload(bodyOf(req));
 const json=JSON.stringify(d.data);
 // revision 0 creates the document; otherwise it must match the stored revision.
 const rows=d.revision===0
  ?await db`INSERT INTO rx_documents(project_id,module,data,updated_by) SELECT ${d.projectId},${d.module},${json}::jsonb,${uid}
     WHERE EXISTS(SELECT 1 FROM rx_projects WHERE id=${d.projectId}) ON CONFLICT (project_id,module) DO NOTHING RETURNING revision,updated_at`
  :await db`UPDATE rx_documents SET data=${json}::jsonb,revision=revision+1,updated_by=${uid},updated_at=now()
     WHERE project_id=${d.projectId} AND module=${d.module} AND revision=${d.revision} RETURNING revision,updated_at`;
 if(!rows.length)return conflict(res);
 await log(db,uid,d.projectId,'document.saved',d.module,{revision:rows[0].revision});
 return send(res,200,{ok:true,...rows[0]});
}

async function approvals(req,res,db,uid){
 if(req.method==='GET'){
  const q=req.query||{};
  if(!core.validProjectId(q.projectId))throw new core.InputError('Progetto non valido');
  const rows=q.subjectType&&q.subjectId
   ?await db`SELECT a.*,u.name AS reviewer_name FROM rx_approvals a LEFT JOIN users u ON u.id=a.reviewer_id
      WHERE a.project_id=${q.projectId} AND a.subject_type=${String(q.subjectType)} AND a.subject_id=${String(q.subjectId)} ORDER BY a.requested_at DESC LIMIT 50`
   :await db`SELECT a.*,u.name AS reviewer_name FROM rx_approvals a LEFT JOIN users u ON u.id=a.reviewer_id
      WHERE a.project_id=${q.projectId} ORDER BY a.requested_at DESC LIMIT 200`;
  return send(res,200,{items:rows});
 }
 if(req.method!=='POST')return send(res,405,{error:'Metodo non consentito'});
 const data=bodyOf(req);
 if(data.action==='request'){
  const r=core.approvalRequest(data,uid);
  const exists=await db`SELECT 1 FROM rx_projects WHERE id=${r.projectId}`;
  if(!exists.length)return send(res,404,{error:'Progetto non trovato'});
  // A new request replaces any open one for the same element.
  await db`UPDATE rx_approvals SET state='superseded',decided_at=now() WHERE project_id=${r.projectId} AND subject_type=${r.subjectType} AND subject_id=${r.subjectId} AND state='awaiting_approval'`;
  const id=require('crypto').randomUUID();
  const rows=await db`INSERT INTO rx_approvals(id,project_id,subject_type,subject_id,fingerprint,summary,state,requested_by)
   VALUES(${id},${r.projectId},${r.subjectType},${r.subjectId},${r.fingerprint},${r.summary},'awaiting_approval',${r.requestedBy}) RETURNING *`;
  await log(db,uid,r.projectId,'approval.requested',r.summary||r.subjectId,{approvalId:id,subjectType:r.subjectType,subjectId:r.subjectId});
  return send(res,201,{ok:true,item:rows[0]});
 }
 if(data.action==='decide'){
  const d=core.approvalDecision(data);
  const found=await db`SELECT * FROM rx_approvals WHERE id=${d.id}`;
  if(!found.length)return send(res,404,{error:'Richiesta di approvazione non trovata'});
  const a=found[0];
  if(a.state!=='awaiting_approval')return send(res,409,{error:'Questa richiesta è già stata decisa'});
  if(a.fingerprint!==d.fingerprint)return send(res,409,{error:'Il contenuto è cambiato dopo la richiesta: va richiesta una nuova approvazione',stale:true});
  const self=a.requested_by==='user:'+uid;
  const rows=await db`UPDATE rx_approvals SET state=${d.state},reviewer_id=${uid},self_review=${self},note=${d.note},decided_at=now()
   WHERE id=${d.id} AND state='awaiting_approval' RETURNING *`;
  if(!rows.length)return conflict(res);
  await log(db,uid,a.project_id,'approval.'+d.state,a.summary||a.subject_id,{approvalId:d.id,selfReview:self});
  // An approval can carry what the team should remember; it becomes confirmed project memory.
  let remembered=null;
  if(d.state==='approved'&&data.memory){
   try{remembered=(await memory.insert(db,memory.fromApproval(rows[0],data.memory),uid,{approvalId:d.id})).id}
   catch(e){remembered=false}
  }
  return send(res,200,{ok:true,item:rows[0],memoryId:remembered});
 }
 throw new core.InputError('Azione non valida');
}

// An attempt still 'sending' after this long may or may not have reached Buffer.
const UNCERTAIN_MS=2*60*1000;
// Publishing goes through the server: it sends only the approved version stored in the team PED,
// at the time planned in the PED's time zone, and at most once per content version.
async function publications(req,res,db,uid,deps){
 if(req.method==='GET'){
  const projectId=core.clean((req.query||{}).projectId,80);
  if(!core.validProjectId(projectId))throw new core.InputError('Progetto non valido');
  const rows=await db`SELECT * FROM rx_publications WHERE project_id=${projectId} ORDER BY updated_at DESC LIMIT 500`;
  return send(res,200,{items:rows});
 }
 if(req.method!=='POST')return send(res,405,{error:'Metodo non consentito'});
 const r=core.publicationRequest(bodyOf(req));
 const docs=await db`SELECT data FROM rx_documents WHERE project_id=${r.projectId} AND module='editorial'`;
 const plan=docs.length?docs[0].data:null,item=plan&&Array.isArray(plan.contents)?plan.contents.find(x=>x&&x.id===r.contentId):null;
 if(!item)return send(res,404,{error:'Contenuto non trovato nel PED del team: ricarica la pagina'});
 if(item.status!=='approved'||item.revision!==r.revision)return send(res,409,{error:'Il contenuto è cambiato o non è più approvato: ricarica la pagina',stale:true});
 if(!String(item.copy||'').trim())return send(res,400,{error:'Il contenuto approvato non ha testo da pubblicare'});
 const approved=await db`SELECT * FROM rx_approvals WHERE project_id=${r.projectId} AND subject_type='content' AND subject_id=${r.contentId} AND state='approved' ORDER BY decided_at DESC LIMIT 1`;
 if(core.approvalStatus(approved[0],editorial.approvalPayload(item))!=='approved')return send(res,409,{error:'Questa versione non ha un’approvazione valida registrata sul server: approvala di nuovo',stale:true});
 // The page asks with a 5-minute margin; the server accepts down to 2 minutes so a slow click still goes through.
 const plan2=editorial.publishSchedule(plan,item,Date.now()-3*60*1000);
 if(r.mode==='scheduled'&&plan2.mode!=='scheduled')return send(res,409,{error:plan2.reason==='past'?'L’orario previsto è già passato: aggiorna data e ora o usa il prossimo slot libero':'Data e orario mancanti: usa il prossimo slot libero',stale:true});
 const scheduledAt=r.mode==='scheduled'?plan2.scheduledAt:null;
 // Claim the content version; the unique key stops a second send of the same version.
 let claim=await db`INSERT INTO rx_publications(project_id,content_id,revision,service,channel_id,channel_name,mode,timezone,scheduled_at,status,requested_by)
  VALUES(${r.projectId},${r.contentId},${r.revision},'buffer',${r.channelId},${r.channelName},${r.mode},${plan2.timezone},${scheduledAt},'sending',${uid})
  ON CONFLICT (project_id,content_id,revision,service) DO NOTHING RETURNING id`;
 if(!claim.length){
  const prev=(await db`SELECT * FROM rx_publications WHERE project_id=${r.projectId} AND content_id=${r.contentId} AND revision=${r.revision} AND service='buffer'`)[0];
  if(!prev)return conflict(res);
  if(prev.status==='queued')return send(res,200,{ok:true,idempotent:true,item:prev});
  const uncertain=prev.status==='sending';
  if(uncertain&&Date.now()-new Date(prev.updated_at).getTime()<UNCERTAIN_MS)return send(res,409,{error:'Invio di questa versione già in corso: attendi qualche istante e ricarica'});
  if(uncertain&&!r.retryUncertain)return send(res,409,{uncertain:true,item:prev,error:'L’invio precedente si è interrotto senza risposta: controlla su Buffer se il post c’è già prima di riprovare'});
  claim=await db`UPDATE rx_publications SET status='sending',channel_id=${r.channelId},channel_name=${r.channelName},mode=${r.mode},timezone=${plan2.timezone},scheduled_at=${scheduledAt},
   error='',attempts=attempts+1,requested_by=${uid},updated_at=now() WHERE id=${prev.id} AND status=${prev.status} AND attempts=${prev.attempts} RETURNING id`;
  if(!claim.length)return send(res,409,{error:'Invio di questa versione già in corso: ricarica'});
 }
 const id=claim[0].id,key=process.env.BUFFER_ACCESS_TOKEN;
 const failed=async(code,message)=>{const rows=await db`UPDATE rx_publications SET status='failed',error=${core.clean(message,500)},updated_at=now() WHERE id=${id} RETURNING *`;return send(res,code,{error:message,item:rows[0]})};
 if(!key)return failed(503,'Buffer non è collegato in questo ambiente: manca BUFFER_ACCESS_TOKEN');
 let post;
 try{post=await deps.createPost(key,{channelId:r.channelId,text:String(item.copy),dueAt:scheduledAt})}
 catch(e){return failed(e&&e.status===422?422:502,'Buffer non ha accettato il post: '+core.clean(e&&e.message,300))}
 const rows=await db`UPDATE rx_publications SET status='queued',post_id=${String(post.postId)},due_at=${post.dueAt||scheduledAt},error='',updated_at=now() WHERE id=${id} RETURNING *`;
 await log(db,uid,r.projectId,'publication.queued',(item.channel+' · '+item.title).slice(0,160),{contentId:r.contentId,revision:r.revision,mode:r.mode,scheduledAt,postId:String(post.postId)});
 return send(res,201,{ok:true,item:rows[0]});
}

async function activity(req,res,db){
 if(req.method!=='GET')return send(res,405,{error:'Metodo non consentito'});
 const q=req.query||{};
 if(q.projectId&&!core.validProjectId(q.projectId))throw new core.InputError('Progetto non valido');
 const rows=q.projectId
  ?await db`SELECT a.id,a.project_id,a.action,a.subject,a.detail,a.at,u.name AS actor FROM rx_activity a LEFT JOIN users u ON u.id=a.actor_id WHERE a.project_id=${q.projectId} ORDER BY a.id DESC LIMIT 100`
  :await db`SELECT a.id,a.project_id,a.action,a.subject,a.detail,a.at,u.name AS actor FROM rx_activity a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 100`;
 return send(res,200,{items:rows});
}

// One-time copy of browser-saved data and Command Center profiles into the registry.
// Existing ids are never overwritten, so running it twice changes nothing.
async function importData(req,res,db,uid){
 if(req.method!=='POST')return send(res,405,{error:'Metodo non consentito'});
 const data=bodyOf(req),result={clients:0,projects:0,documents:0,skipped:0};
 if(data.source==='command-center'){
  const rows=await db`SELECT data FROM workspace_state WHERE id=1`;
  const list=rows.length&&Array.isArray(rows[0].data&&rows[0].data.projects)?rows[0].data.projects:[];
  data.projects=list.slice(0,200).map(p=>({id:p&&p.id,name:p&&p.name,kind:p&&p.kind==='personal'?'personal':'brand',summary:p&&p.summary,
   profile:{audience:p&&p.audience,positioning:p&&p.positioning,voice:p&&p.voice,channels:p&&p.channels,visual:p&&p.visual,links:p&&p.links,notes:p&&p.notes,source:'command-center'}}));
  data.clients=[];
 }
 const clients=Array.isArray(data.clients)?data.clients.slice(0,200):[];
 const projects=Array.isArray(data.projects)?data.projects.slice(0,300):[];
 for(const raw of clients){
  try{
   if(!core.validClientId(raw&&raw.id)){result.skipped++;continue}
   const c=core.client(raw);
   const rows=await db`INSERT INTO rx_clients(id,name,status,sector,manager,goal,notes,created_by,updated_by)
    VALUES(${raw.id},${c.name},${c.status},${c.sector},${c.manager},${c.goal},${c.notes},${uid},${uid}) ON CONFLICT (id) DO NOTHING RETURNING id`;
   rows.length?result.clients++:result.skipped++;
  }catch(e){if(!(e instanceof core.InputError))throw e;result.skipped++}
 }
 for(const raw of projects){
  try{
   const id=String(raw&&raw.id||'').toLowerCase();
   if(!core.validProjectId(id)){result.skipped++;continue}
   const p=core.project({...raw,clientId:raw.clientId||null});
   if(p.clientId){const c=await db`SELECT 1 FROM rx_clients WHERE id=${p.clientId}`;if(!c.length)p.clientId=null}
   const rows=await db`INSERT INTO rx_projects(id,client_id,name,kind,status,summary,profile,created_by,updated_by)
    VALUES(${id},${p.clientId},${p.name},${p.kind},${p.status},${p.summary},${JSON.stringify(p.profile)}::jsonb,${uid},${uid}) ON CONFLICT (id) DO NOTHING RETURNING id`;
   rows.length?result.projects++:result.skipped++;
   const docs=raw.documents&&typeof raw.documents==='object'?raw.documents:{};
   for(const module of core.MODULES){
    if(!docs[module])continue;
    const d=core.documentPayload({projectId:id,module,revision:0,data:docs[module]});
    const saved=await db`INSERT INTO rx_documents(project_id,module,data,updated_by) VALUES(${id},${module},${JSON.stringify(d.data)}::jsonb,${uid}) ON CONFLICT (project_id,module) DO NOTHING RETURNING revision`;
    if(saved.length)result.documents++;
   }
  }catch(e){if(!(e instanceof core.InputError))throw e;result.skipped++}
 }
 if(result.clients||result.projects||result.documents)await log(db,uid,null,'registry.imported',data.source||'browser',result);
 return send(res,200,{ok:true,...result});
}

const ROUTES={clients,projects,documents,approvals,activity,publications,import:importData};

module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 const user=getSessionUser(req);
 if(!user||!user.uid)return send(res,401,{error:'Accesso RADIX richiesto'});
 const route=ROUTES[String((req.query||{}).resource||'')];
 if(!route)return send(res,404,{error:'Risorsa non trovata'});
 try{
  return await route(req,res,sql(),Number(user.uid),{createPost:require('./_buffer').createPost});
 }catch(e){
  if(e instanceof SyntaxError)return send(res,400,{error:'JSON non valido'});
  if(e instanceof core.InputError)return send(res,400,{error:e.message});
  if(e&&e.code==='23503')return send(res,400,{error:'Riferimento a cliente o progetto inesistente'});
  return send(res,503,{error:'Registro non disponibile: verifica migrazione e database'});
 }
};
