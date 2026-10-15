'use strict';
const {fields}=require('./_sales');
const {createLeadListStore}=require('./_lead_lists_store');
const {createLeadContactJobsStore}=require('./_lead_contact_jobs_store');
const {createGrowthProjectsStore}=require('./_lead_growth_projects_store');
const {isolatedUrl}=require('./_lead_db_guard');
// PostgreSQL JSON timestamptz uses offsets/microseconds. Public API intentionally uses UTC milliseconds.
function normalize(value,key=''){
 if(value===null||value===undefined)return value;
 if(['due_at','occurred_at','created_at','updated_at'].includes(key)){
  const date=new Date(value);if(!Number.isFinite(date.getTime()))throw new Error('invalid stored timestamp');return date.toISOString();
 }
 if(Array.isArray(value))return value.map(v=>normalize(v));
 if(typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalize(v,k)]));
 return value;
}
function createStore(rawSql){
 const sql=async(...args)=>normalize(await rawSql(...args));
 // Sensitive Lead archives must never connect to the shared RADIX database.
 let leadRaw=null;
 const leadSql=async(...args)=>{
  const leadUrl=isolatedUrl(process.env.LEAD_DATABASE_URL,process.env.DATABASE_URL,process.env.VERCEL_ENV);
  if(!leadRaw)leadRaw=require('@neondatabase/serverless').neon(leadUrl);
  return normalize(await leadRaw(...args));
 };
 const allowedRoles="m.role IN ('owner','admin','member','viewer')";
 const membership=(w,u)=>sql('SELECT m.role FROM sales_memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=$1 AND m.user_id=$2',[w,u]).then(r=>r[0]||null);
 return {
 membership,
 leadLists:createLeadListStore(leadSql),
 leadContactJobs:createLeadContactJobsStore(leadSql),
 growthProjects:createGrowthProjectsStore(leadSql),
 workspaces:u=>sql('SELECT w.id,w.name,m.role FROM sales_workspaces w JOIN sales_memberships m ON m.workspace_id=w.id JOIN users u ON u.id=m.user_id WHERE m.user_id=$1 AND '+allowedRoles+' ORDER BY w.name,w.id',[u]),
 read:async(c,u)=>{
   const guard='EXISTS (SELECT 1 FROM sales_memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=$1 AND m.user_id=$2 AND '+allowedRoles+')';
   if(c.entity==='members')return sql('SELECT m.user_id AS id,u.name,m.role FROM sales_memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=$1 AND '+guard+' ORDER BY m.user_id LIMIT 100 OFFSET $3',[c.workspace,u,c.offset]);
   if(c.entity==='customer360'){
     if(!['companies','contacts','opportunities'].includes(c.subject))throw new Error('invalid subject');
     // Root scope is checked inside this statement. Related lists do not depend on client-loaded pages.
     return sql(`WITH root AS (SELECT to_jsonb(t) AS r FROM sales_${c.subject} t WHERE t.workspace_id=$1 AND t.id=$3::uuid AND ${guard}),
 contacts AS (SELECT t.* FROM sales_contacts t,root WHERE t.workspace_id=$1 AND (($4='companies' AND t.company_id=$3::uuid) OR ($4='contacts' AND t.id=$3::uuid) OR ($4='opportunities' AND t.id=(r->>'contact_id')::uuid))),
 opportunities AS (SELECT t.* FROM sales_opportunities t,root WHERE t.workspace_id=$1 AND (($4='companies' AND t.company_id=$3::uuid) OR ($4='contacts' AND t.contact_id=$3::uuid) OR ($4='opportunities' AND t.id=$3::uuid))),
 companies AS (SELECT t.* FROM sales_companies t,root WHERE t.workspace_id=$1 AND (($4='companies' AND t.id=$3::uuid) OR ($4<>'companies' AND t.id=(r->>'company_id')::uuid))),
 related AS (SELECT 'companies' AS entity,to_jsonb(t) AS record FROM companies t UNION ALL SELECT 'contacts',to_jsonb(t) FROM contacts t UNION ALL SELECT 'opportunities',to_jsonb(t) FROM opportunities t UNION ALL SELECT 'tasks',to_jsonb(t) FROM sales_tasks t WHERE t.workspace_id=$1 AND EXISTS(SELECT 1 FROM root) AND (($4='companies' AND t.company_id=$3::uuid) OR ($4='contacts' AND t.contact_id=$3::uuid) OR t.opportunity_id IN(SELECT id FROM opportunities)) UNION ALL SELECT 'interactions',to_jsonb(t) FROM sales_interactions t WHERE t.workspace_id=$1 AND EXISTS(SELECT 1 FROM root) AND (($4='companies' AND t.company_id=$3::uuid) OR ($4='contacts' AND t.contact_id=$3::uuid) OR t.opportunity_id IN(SELECT id FROM opportunities))) SELECT entity,record FROM related ORDER BY entity,record->>'id' LIMIT 100 OFFSET $5`,[c.workspace,u,c.id,c.subject,c.offset]);

   }
   if(c.entity==='dashboard')return sql('SELECT (SELECT count(*) FROM sales_companies WHERE workspace_id=$1) AS companies, (SELECT count(*) FROM sales_contacts WHERE workspace_id=$1) AS contacts, (SELECT count(*) FROM sales_leads WHERE workspace_id=$1) AS leads, (SELECT count(*) FROM sales_opportunities WHERE workspace_id=$1) AS opportunities, (SELECT count(*) FROM sales_tasks WHERE workspace_id=$1) AS tasks, (SELECT COALESCE(sum(amount_cents),0)::text FROM sales_opportunities WHERE workspace_id=$1) AS open_amount_cents WHERE '+guard,[c.workspace,u]);
   if(!Object.hasOwn(fields,c.entity))throw new Error('invalid entity');
   // Literal, case-insensitive substring search over all tenant rows before pagination.
   // strpos avoids treating user %, _ or backslashes as LIKE wildcard syntax.
   if(c.search!==undefined){
    if(!['companies','contacts'].includes(c.entity)||typeof c.search!=='string'||c.search.length>200)throw new Error('invalid search');
    return sql('SELECT t.* FROM sales_'+c.entity+' t WHERE t.workspace_id=$1 AND '+guard+' AND strpos(lower(t.name),lower($4::text))>0 ORDER BY t.id LIMIT 100 OFFSET $3',[c.workspace,u,c.offset,c.search]);
   }
   // Server transaction time; open tasks only in due buckets, before pagination.
   if(c.due!==undefined){
    const predicates={all:'TRUE',overdue:"t.status<> 'done' AND t.due_at<now()",upcoming:"t.status<> 'done' AND t.due_at>=now() AND t.due_at<now()+interval '168 hours'",unscheduled:"t.status<> 'done' AND t.due_at IS NULL"};
    if(c.entity!=='tasks'||!Object.hasOwn(predicates,c.due))throw new Error('invalid due filter');
    return sql('SELECT t.* FROM sales_tasks t WHERE t.workspace_id=$1 AND '+guard+' AND ('+predicates[c.due]+') ORDER BY t.due_at NULLS LAST,t.id LIMIT 100 OFFSET $3',[c.workspace,u,c.offset]);
   }
   // Explicit text cast prevents SQL DATE driver parsing from shifting a calendar date.
   if(c.entity==='opportunities')return sql('SELECT t.*,t.expected_close::text AS expected_close FROM sales_opportunities t WHERE t.workspace_id=$1 AND '+guard+' ORDER BY t.id LIMIT 100 OFFSET $3',[c.workspace,u,c.offset]);
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
module.exports={createStore,normalize};
