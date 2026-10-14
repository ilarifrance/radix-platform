'use strict';
function createLeadListStore(sql){
 const guard="EXISTS (SELECT 1 FROM sales_memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=$1 AND m.user_id=$2 AND m.role IN ('owner','admin','member','viewer'))";
 const writer="EXISTS (SELECT 1 FROM sales_memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=$1 AND m.user_id=$2 AND m.role IN ('owner','admin','member'))";
 return{
  read:async(c,uid)=>{
   if(c.id){
    const rows=await sql('SELECT id,title,payload,version,created_at,updated_at FROM sales_lead_lists t WHERE t.workspace_id=$1 AND '+guard+' AND t.id=$3::uuid',[c.workspace,uid,c.id]);
    return rows;
   }
   return sql('SELECT id,title,version,created_at,updated_at,jsonb_array_length(payload->\'prospects\') AS prospect_count FROM sales_lead_lists t WHERE t.workspace_id=$1 AND '+guard+' ORDER BY t.updated_at DESC,t.id LIMIT 100 OFFSET $3',[c.workspace,uid,c.offset]);
  },
  command:async(c,uid)=>{
   const d=c.data;let rows;
   if(c.action==='create'){
    // Single atomic statement, membership checked in DB. Unique titles are allowed; ID identifies a list.
    rows=await sql('INSERT INTO sales_lead_lists(workspace_id,id,title,payload,updated_by) SELECT $1::uuid,$3::uuid,$4::text,$5::jsonb,$2::integer WHERE '+writer+' AND (SELECT count(*) FROM sales_lead_lists WHERE workspace_id=$1)<40 RETURNING id,title,version,created_at,updated_at',[c.workspace,uid,d.id,d.title,JSON.stringify(d.payload)]);
   }else if(c.action==='update'){
    rows=await sql('UPDATE sales_lead_lists t SET title=$5::text,payload=$6::jsonb,updated_by=$2,version=t.version+1,updated_at=now() WHERE t.workspace_id=$1 AND t.id=$3::uuid AND t.version=$4 AND '+writer+' RETURNING id,title,version,created_at,updated_at',[c.workspace,uid,d.id,d.version,d.title,JSON.stringify(d.payload)]);
   }else{
    rows=await sql('DELETE FROM sales_lead_lists t WHERE t.workspace_id=$1 AND t.id=$3::uuid AND t.version=$4 AND '+writer+' RETURNING id,title,version',[c.workspace,uid,d.id,d.version]);
   }
   if(!rows.length){const e=new Error(c.action==='create'?'Limite di 40 liste raggiunto.':'Lista modificata, eliminata o non più disponibile: ricarica prima di riprovare.');e.status=409;throw e}
   return {...rows[0],...(c.action==='delete'?{deleted:true}:{})};
  }
 };
}
module.exports={createLeadListStore};
