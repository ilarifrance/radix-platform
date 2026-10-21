'use strict';
const {fields,RESERVED_SEGMENTS}=require('./_sales');
const recordFields=require('../sales/crm-fields-core.js');
// Export rows: the added fields (011) arrive in one jsonb column and become ordinary keys.
function flatten(kind){return rows=>rows.map(({added,...r})=>{const out={...r};if(added&&typeof added==='object')for(const k of recordFields.ADDED[kind])if(Object.hasOwn(added,k))out[k]=k==='birthdate'&&added[k]?String(added[k]).slice(0,10):added[k];if(added&&added.custom&&typeof added.custom==='object')out.custom=added.custom;return out;});}
const {createLeadListStore}=require('./_lead_lists_store');
const {createLeadContactJobsStore}=require('./_lead_contact_jobs_store');
const {createGrowthProjectsStore}=require('./_lead_growth_projects_store');
const {createDocumentsStore}=require('./_sales_documents');
const {createCustomFieldsStore}=require('./_sales_custom_fields');
// PostgreSQL JSON timestamptz uses offsets/microseconds. Public API intentionally uses UTC milliseconds.
function normalize(value,key=''){
 if(value===null||value===undefined)return value;
 if(['due_at','occurred_at','created_at','updated_at','consent_at','closed_at','resolved_at','clicked_at','last_at'].includes(key)){
  const date=new Date(value);if(!Number.isFinite(date.getTime()))throw new Error('invalid stored timestamp');return date.toISOString();
 }
 // Calendar dates (birthdate, 011) stay YYYY-MM-DD: a driver Date is local midnight, so local parts are exact.
 if(value instanceof Date&&['birthdate','expected_close'].includes(key)){const p=n=>String(n).padStart(2,'0');return value.getFullYear()+'-'+p(value.getMonth()+1)+'-'+p(value.getDate());}
 if(typeof value==='string'&&key==='birthdate')return value.slice(0,10);
 if(Array.isArray(value))return value.map(v=>normalize(v));
 if(typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalize(v,k)]));
 return value;
}
function createStore(rawSql){
 const sql=async(...args)=>normalize(await rawSql(...args));
 // Acquisition (Lead Intelligence) lives in the same CRM database since phase A: one archive, one pipeline.
 const leadSql=sql;
 const allowedRoles="m.role IN ('owner','admin','member','viewer')";
 const membership=(w,u)=>sql('SELECT m.role FROM sales_memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=$1 AND m.user_id=$2',[w,u]).then(r=>r[0]||null);
 return {
 sql,
 membership,
 leadLists:createLeadListStore(leadSql),
 leadContactJobs:createLeadContactJobsStore(leadSql),
 growthProjects:createGrowthProjectsStore(leadSql),
 documents:createDocumentsStore(sql),
 customFields:createCustomFieldsStore(sql),
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
 related AS (SELECT 'companies' AS entity,to_jsonb(t) AS record FROM companies t UNION ALL SELECT 'contacts',to_jsonb(t) FROM contacts t UNION ALL SELECT 'opportunities',to_jsonb(t) FROM opportunities t UNION ALL SELECT 'tasks',to_jsonb(t) FROM sales_tasks t WHERE t.workspace_id=$1 AND EXISTS(SELECT 1 FROM root) AND (($4='companies' AND t.company_id=$3::uuid) OR ($4='contacts' AND t.contact_id=$3::uuid) OR t.opportunity_id IN(SELECT id FROM opportunities)) UNION ALL SELECT 'interactions',to_jsonb(t) FROM sales_interactions t WHERE t.workspace_id=$1 AND EXISTS(SELECT 1 FROM root) AND (($4='companies' AND t.company_id=$3::uuid) OR ($4='contacts' AND t.contact_id=$3::uuid) OR t.opportunity_id IN(SELECT id FROM opportunities)) UNION ALL SELECT 'tickets',to_jsonb(t) FROM sales_tickets t WHERE t.workspace_id=$1 AND EXISTS(SELECT 1 FROM root) AND (($4='companies' AND t.company_id=$3::uuid) OR ($4='contacts' AND t.contact_id=$3::uuid))) SELECT entity,record FROM related ORDER BY entity,record->>'id' LIMIT 100 OFFSET $5`,[c.workspace,u,c.id,c.subject,c.offset]);

   }
   // Full export (GDPR access, CSV): every row of the workspace up to 5000, with the company name.
   if(c.entity==='export'){
    // The added fields of migration 011 come through to_jsonb only when the columns exist: an
    // archive without them exports the same columns as before, never an «undefined column» error.
    if(c.subject==='contacts')return sql('SELECT t.id,t.name,t.role,t.email,t.phone,t.linkedin_url,t.marketing_consent,t.consent_at,t.notes,c.name AS company,t.created_at,to_jsonb(t) AS added FROM sales_contacts t LEFT JOIN sales_companies c ON c.workspace_id=t.workspace_id AND c.id=t.company_id WHERE t.workspace_id=$1 AND '+guard+' ORDER BY t.name,t.id LIMIT 5000',[c.workspace,u]).then(flatten('contacts'));
    if(c.subject==='companies')return sql('SELECT t.id,t.name,t.industry,t.website,t.email,t.phone,t.city,t.notes,t.created_at,to_jsonb(t) AS added FROM sales_companies t WHERE t.workspace_id=$1 AND '+guard+' ORDER BY t.name,t.id LIMIT 5000',[c.workspace,u]).then(flatten('companies'));
    throw new Error('invalid export');
   }
   if(c.entity==='dashboard')return sql('SELECT (SELECT count(*) FROM sales_companies WHERE workspace_id=$1) AS companies, (SELECT count(*) FROM sales_contacts WHERE workspace_id=$1) AS contacts, (SELECT count(*) FROM sales_leads WHERE workspace_id=$1) AS leads, (SELECT count(*) FROM sales_opportunities WHERE workspace_id=$1) AS opportunities, (SELECT count(*) FROM sales_tasks WHERE workspace_id=$1) AS tasks, (SELECT COALESCE(sum(amount_cents),0)::text FROM sales_opportunities WHERE workspace_id=$1 AND outcome=\'open\') AS open_amount_cents WHERE '+guard,[c.workspace,u]);
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
   // Support queue: open first, then by due date.
   if(c.entity==='tickets')return sql("SELECT t.* FROM sales_tickets t WHERE t.workspace_id=$1 AND "+guard+" ORDER BY array_position(ARRAY['open','pending','resolved','closed'],t.status),t.due_at NULLS LAST,t.id LIMIT 100 OFFSET $3",[c.workspace,u,c.offset]);
   // Reserved rows (CRM settings such as «__sla__», sales/crm-sla-core.js) are not contact segments: each is read only on request.
   if(c.entity==='segments')return c.reserved?sql('SELECT t.* FROM sales_segments t WHERE t.workspace_id=$1 AND '+guard+' AND lower(btrim(t.name))=$4 ORDER BY t.id LIMIT 1 OFFSET $3',[c.workspace,u,c.offset,c.reserved])
    :sql('SELECT t.* FROM sales_segments t WHERE t.workspace_id=$1 AND '+guard+' AND lower(btrim(t.name))<>ALL($4::text[]) ORDER BY lower(t.name),t.id LIMIT 100 OFFSET $3',[c.workspace,u,c.offset,RESERVED_SEGMENTS]);
   if(c.entity==='opportunities')return sql('SELECT t.*,t.expected_close::text AS expected_close FROM sales_opportunities t WHERE t.workspace_id=$1 AND '+guard+' ORDER BY t.id LIMIT 100 OFFSET $3',[c.workspace,u,c.offset]);
   // Identifier is from a frozen server allowlist; all user values remain parameters.
   return sql('SELECT t.* FROM sales_'+c.entity+' t WHERE t.workspace_id=$1 AND '+guard+' ORDER BY '+(c.entity==='stages'?'t.position,t.id':'t.id')+' LIMIT 100 OFFSET $3',[c.workspace,u,c.offset]);
 },
 memberCommand:async(c,u)=>{
   const messages={'unknown user':[404,'Nessun account RADIX con questa email: crealo prima dall\'amministrazione.'],'already member':[409,'Questa persona è già nel workspace.'],'last owner':[409,'Il workspace deve avere almeno un owner.'],'forbidden':[403,'Solo owner e admin gestiscono i membri; solo un owner assegna owner o admin.']};
   try{const rows=await sql('SELECT sales_member_command($1::uuid,$2::integer,$3::text,$4::jsonb) AS result',[c.workspace,u,c.action,JSON.stringify(c.data)]);return rows[0].result;}
   catch(e){const m=messages[e.message];if(m){const err=new Error(m[1]);err.status=m[0];throw err;}if(e.code==='23503'){const err=new Error('Riassegna prima le trattative e le attività di questo membro.');err.status=409;throw err;}throw e;}
 },
 command:async(c,u)=>{
   // One HTTP SQL statement calls one atomic PL/pgSQL function. No fake BEGIN/COMMIT across HTTP connections.
   let rows;
   try{rows=await sql('SELECT sales_command($1::uuid,$2::integer,$3::text,$4::text,$5::jsonb) AS result',[c.workspace,u,c.entity,c.action,JSON.stringify(c.data)]);}
   catch(e){
    // An archive before migration 012 knows no «convert» action.
    if(c.action==='convert'&&e.code==='22023'&&e.message==='invalid command'){const err=new Error('«Converti» non è ancora disponibile in questo archivio: serve la migrazione sales 012 (da approvare).');err.status=400;throw err;}
    throw e;
   }
   return rows[0].result;
 }
 };
}
module.exports={createStore,normalize};
