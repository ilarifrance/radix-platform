'use strict';
const {fields}=require('./_sales');
function createStore(sql){
 const membership=(w,u)=>sql('SELECT m.role FROM sales_memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=$1 AND m.user_id=$2',[w,u]).then(r=>r[0]||null);
 return {
 membership,
 workspaces:u=>sql('SELECT w.id,w.name,m.role FROM sales_workspaces w JOIN sales_memberships m ON m.workspace_id=w.id JOIN users u ON u.id=m.user_id WHERE m.user_id=$1 ORDER BY w.name,w.id',[u]),
 read:async(c,u)=>{
   const guard='EXISTS (SELECT 1 FROM sales_memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=$1 AND m.user_id=$2)';
   if(c.entity==='dashboard')return sql('SELECT (SELECT count(*) FROM sales_companies WHERE workspace_id=$1) AS companies, (SELECT count(*) FROM sales_contacts WHERE workspace_id=$1) AS contacts, (SELECT count(*) FROM sales_leads WHERE workspace_id=$1) AS leads, (SELECT count(*) FROM sales_opportunities WHERE workspace_id=$1) AS opportunities, (SELECT count(*) FROM sales_tasks WHERE workspace_id=$1) AS tasks, (SELECT COALESCE(sum(amount_cents),0)::text FROM sales_opportunities WHERE workspace_id=$1) AS open_amount_cents WHERE '+guard,[c.workspace,u]);
   if(!Object.hasOwn(fields,c.entity))throw new Error('invalid entity');
   // Identifier is from a frozen server allowlist; all user values remain parameters.
   return sql('SELECT t.* FROM sales_'+c.entity+' t WHERE t.workspace_id=$1 AND '+guard+' ORDER BY '+(c.entity==='stages'?'t.position,t.id':'t.id')+' LIMIT 100 OFFSET $3',[c.workspace,u,c.offset]);
 },
 command:async(c,u)=>{
   // One HTTP SQL statement calls one atomic PL/pgSQL function. No fake BEGIN/COMMIT across HTTP connections.
   const rows=await sql('SELECT sales_command($1::uuid,$2::integer,$3::text,$4::text,$5::jsonb) AS result',[c.workspace,u,c.entity,c.action,JSON.stringify(c.data)]);
   return rows[0].result;
 }
 };
}
module.exports={createStore};
