'use strict';
function createGrowthProjectsStore(sql){
 const allowed="EXISTS (SELECT 1 FROM sales_memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=$1 AND m.user_id=$2 AND m.role IN ('owner','admin','member','viewer'))";
 const writable="EXISTS (SELECT 1 FROM sales_memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=$1 AND m.user_id=$2 AND m.role IN ('owner','admin','member'))";
 return{
  read:async(c,uid)=>c.id?sql('SELECT id,title,payload,version,created_at,updated_at FROM sales_lead_growth_projects t WHERE t.workspace_id=$1 AND '+allowed+' AND t.id=$3::uuid',[c.workspace,uid,c.id]):sql("SELECT id,title,version,created_at,updated_at,payload->>'state' AS state,jsonb_array_length(payload->'campaigns') AS campaign_count FROM sales_lead_growth_projects t WHERE t.workspace_id=$1 AND "+allowed+" ORDER BY t.updated_at DESC,t.id LIMIT 100 OFFSET $3",[c.workspace,uid,c.offset]),
  command:async(c,uid)=>{
   const d=c.data;let rows;
   if(c.action==='create')rows=await sql('INSERT INTO sales_lead_growth_projects(workspace_id,id,title,payload,updated_by) SELECT $1::uuid,$3::uuid,$4::text,$5::jsonb,$2::integer WHERE '+writable+' AND (SELECT count(*) FROM sales_lead_growth_projects WHERE workspace_id=$1)<100 RETURNING id,title,version,created_at,updated_at',[c.workspace,uid,d.id,d.title,JSON.stringify(d.payload)]);
   else if(c.action==='update')rows=await sql('UPDATE sales_lead_growth_projects t SET title=$5::text,payload=$6::jsonb,updated_by=$2,version=version+1,updated_at=now() WHERE t.workspace_id=$1 AND t.id=$3::uuid AND t.version=$4 AND '+writable+' RETURNING id,title,version,created_at,updated_at',[c.workspace,uid,d.id,d.version,d.title,JSON.stringify(d.payload)]);
   else rows=await sql('DELETE FROM sales_lead_growth_projects t WHERE t.workspace_id=$1 AND t.id=$3::uuid AND t.version=$4 AND '+writable+' RETURNING id,version',[c.workspace,uid,d.id,d.version]);
   if(!rows.length){const e=new Error('Operazione non riuscita: permessi, limite o versione modificata. Ricarica prima di riprovare.');e.status=409;throw e}
   return {...rows[0],...(c.action==='delete'?{deleted:true}:{})};
  }
 };
}
module.exports={createGrowthProjectsStore};
