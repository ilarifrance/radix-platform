'use strict';
const B=require('../lib/lead-contact-batches');
const {payload}=require('./_lead_contact_jobs');
function createLeadContactJobsStore(sql){
 const readGuard="EXISTS (SELECT 1 FROM sales_memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=$1 AND m.user_id=$2 AND m.role IN ('owner','admin','member','viewer'))";
 const writeGuard="EXISTS (SELECT 1 FROM sales_memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=$1 AND m.user_id=$2 AND m.role IN ('owner','admin','member'))";
 return{
 receive:async(workspace,id,runUid,rows,batchId)=>{
  const found=await sql("SELECT payload,version FROM sales_lead_contact_jobs WHERE workspace_id=$1::uuid AND id=$2::uuid AND payload->>'providerRunUid'=$3",[workspace,id,runUid]);
  if(!found.length){const e=new Error('Lavoro o identità provider non associati');e.status=403;throw e}
  const current=found[0],next=B.add(current.payload,rows,batchId);
  next.providerRunUid=runUid;
  if(next.last.repeated)return {accepted:true,repeated:true,contacts:current.payload.records.length};
  const clean=payload(next);
  const saved=await sql("UPDATE sales_lead_contact_jobs SET payload=$5::jsonb,version=version+1,updated_at=now() WHERE workspace_id=$1::uuid AND id=$2::uuid AND version=$3 AND payload->>'providerRunUid'=$4 RETURNING version",[workspace,id,current.version,runUid,JSON.stringify(clean)]);
  if(!saved.length){const e=new Error('Conflitto versione: riprova il callback');e.status=409;throw e}
  return {accepted:true,repeated:false,contacts:clean.records.length,version:saved[0].version};
 },
 read:async(c,uid)=>c.id?sql('SELECT id,title,payload,version,created_at,updated_at FROM sales_lead_contact_jobs t WHERE t.workspace_id=$1 AND '+readGuard+' AND t.id=$3::uuid',[c.workspace,uid,c.id]):sql("SELECT id,title,version,created_at,updated_at,jsonb_array_length(payload->'records') AS contact_count FROM sales_lead_contact_jobs t WHERE t.workspace_id=$1 AND "+readGuard+" ORDER BY t.updated_at DESC,t.id LIMIT 100 OFFSET $3",[c.workspace,uid,c.offset]),
 command:async(c,uid)=>{
  const d=c.data;let result;
  if(c.action==='create')result=await sql('INSERT INTO sales_lead_contact_jobs(workspace_id,id,title,payload,updated_by) SELECT $1::uuid,$3::uuid,$4::text,$5::jsonb,$2::integer WHERE '+writeGuard+' AND (SELECT count(*) FROM sales_lead_contact_jobs WHERE workspace_id=$1)<40 RETURNING id,title,version,created_at,updated_at',[c.workspace,uid,d.id,d.title,JSON.stringify(d.payload)]);
  else if(c.action==='update')result=await sql('UPDATE sales_lead_contact_jobs t SET title=$5::text,payload=$6::jsonb,updated_by=$2,version=t.version+1,updated_at=now() WHERE t.workspace_id=$1 AND t.id=$3::uuid AND t.version=$4 AND '+writeGuard+' RETURNING id,title,version,created_at,updated_at',[c.workspace,uid,d.id,d.version,d.title,JSON.stringify(d.payload)]);
  else result=await sql('DELETE FROM sales_lead_contact_jobs t WHERE t.workspace_id=$1 AND t.id=$3::uuid AND t.version=$4 AND '+writeGuard+' RETURNING id,title,version',[c.workspace,uid,d.id,d.version]);
  if(!result.length){const e=new Error('Nessuna modifica: permessi, limite archivio o versione non aggiornati');e.status=409;throw e}
  return {...result[0],...(c.action==='delete'?{deleted:true}:{})};
 }
 };
}
module.exports={createLeadContactJobsStore};
