'use strict';
/* RADIX team memory: database access shared by /api/agency-memory, the registry approvals
   and /api/chat. Memory is shared by the whole team, like the registry; the author and the
   person who confirmed each item are recorded. Only confirmed items reach agents. */
const crypto=require('crypto');
const core=require('./_agency-memory-core');

// Additive columns on top of the v1 table; safe to run more than once.
const UPGRADE=Object.freeze([
 `ALTER TABLE agency_memory ADD COLUMN IF NOT EXISTS created_by integer`,
 `ALTER TABLE agency_memory ADD COLUMN IF NOT EXISTS confirmed_by integer`,
 `ALTER TABLE agency_memory ADD COLUMN IF NOT EXISTS confirmed_at timestamptz`,
 `ALTER TABLE agency_memory ADD COLUMN IF NOT EXISTS approval_id uuid`,
 `CREATE INDEX IF NOT EXISTS agency_memory_project_idx ON agency_memory(project_id, updated_at DESC)`,
 `CREATE INDEX IF NOT EXISTS agency_memory_client_idx ON agency_memory(client_id, updated_at DESC)`
]);
const TEAM_LIMIT=5000;
const COLS=`m.id,m.level,m.kind,m.status,m.project_id,m.client_id,m.agent_id,m.title,m.content,m.source,m.revision,m.approval_id,
 m.created_at,m.updated_at,m.confirmed_at,cu.name AS author_name,fu.name AS confirmed_by_name`;
const JOINS=`LEFT JOIN users cu ON cu.id=COALESCE(m.created_by,CASE WHEN m.owner_id ~ '^[0-9]{1,9}$' THEN m.owner_id::int END)
 LEFT JOIN users fu ON fu.id=m.confirmed_by`;

// A project's client comes from the registry when the caller did not send it.
async function resolveContext(db,{projectId='',clientId='',agentId=''}){
 if(projectId&&!clientId){
  try{const r=await db`SELECT client_id FROM rx_projects WHERE id=${projectId}`;if(r.length&&r[0].client_id)clientId=r[0].client_id}catch(e){}
 }
 return {projectId,clientId,agentId};
}

async function list(db,ctx){
 const {projectId,clientId,agentId}=await resolveContext(db,ctx);
 return db(`SELECT ${COLS} FROM agency_memory m ${JOINS}
  WHERE m.level='agency' OR (m.level='client' AND m.client_id=$2 AND $2<>'')
   OR (m.project_id=$1 AND $1<>'' AND (m.level<>'agent' OR m.agent_id=$3 OR $3=''))
  ORDER BY m.updated_at DESC LIMIT 250`,[projectId,clientId,agentId]);
}

async function context(db,ctx){
 const resolved=await resolveContext(db,ctx);
 const rows=await list(db,resolved);
 return {context:core.buildContext(rows,resolved),count:rows.length};
}

async function insert(db,item,uid,{approvalId=null}={}){
 const count=await db`SELECT count(*)::int AS n FROM agency_memory`;
 if(Number(count[0].n)>=TEAM_LIMIT){const e=Error('Limite memoria del team raggiunto');e.limit=true;throw e}
 const id=crypto.randomUUID(),confirmed=item.status==='confirmed';
 const rows=await db`INSERT INTO agency_memory
  (id,owner_id,created_by,level,kind,status,project_id,client_id,agent_id,title,content,source,approval_id,confirmed_by,confirmed_at)
  VALUES (${id},${String(uid)},${uid},${item.level},${item.kind},${item.status},${item.projectId},${item.clientId},${item.agentId},
   ${item.title},${item.content},${item.source},${approvalId},${confirmed?uid:null},${confirmed?new Date().toISOString():null})
  RETURNING id,status,revision,created_at`;
 return rows[0];
}

// What a person approved becomes confirmed project memory, linked to the approval.
function fromApproval(approval,memory){
 const m=memory&&typeof memory==='object'?memory:{};
 const kind=core.KINDS.includes(m.kind)?m.kind:'decision';
 return core.validate({level:'project',kind,status:'confirmed',projectId:approval.project_id,
  title:m.title||approval.summary||approval.subject_id,content:m.content,
  source:'Approvazione '+approval.subject_type+' · '+String(approval.subject_id).slice(0,120)});
}

async function removeProject(db,projectId){
 await db`DELETE FROM agency_memory WHERE project_id=${projectId} AND level IN ('project','agent','shared')`;
}

module.exports={UPGRADE,TEAM_LIMIT,resolveContext,list,context,insert,fromApproval,removeProject};
