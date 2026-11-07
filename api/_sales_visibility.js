'use strict';
// «I member vedono solo i propri record» (sales/crm-visibility-core.js): the ONE place that turns the workspace switch into SQL.
// visible(entity,alias,w,u) is a predicate for a WHERE clause: TRUE for owners/admins, for workspaces without the switch and
// for entities that are not personal records (pipelines, segments, products…); otherwise the record must be the caller's.
// It reads the switch itself (one uncorrelated EXISTS, planned once per statement), so every read path only appends it:
// api/_sales_store.js (lists, search, due filter, Customer360, export, dashboard), api/_sales_documents.js, api/_sales_clicks.js
// (click and campaign reports), api/_crm-context.js (copilot snapshot) and the write check in api/_sales.js.
// w and u are SQL expressions (normally $1 = workspace, $2 = caller user id). Inner aliases start with v_ and are never used
// by callers. Columns of optional migrations (owner_id of companies/contacts 011 and leads 012) go through to_jsonb, so an
// archive without them sees «not mine by owner» instead of an «undefined column» error.
const core=require('../sales/crm-visibility-core.js');
const ROLES=core.RESTRICTED.map(r=>"'"+r+"'").join(',');
const restricted=(w,u)=>`EXISTS(SELECT 1 FROM sales_memberships v_m JOIN sales_segments v_s ON v_s.workspace_id=v_m.workspace_id AND lower(btrim(v_s.name))='${core.RESERVED}' WHERE v_m.workspace_id=${w} AND v_m.user_id=${u} AND v_m.role IN(${ROLES}) AND v_s.filters->'visibility'->>'ownOnly'='true')`;
const opt=(a,col)=>`(to_jsonb(${a})->>'${col}')::integer`;
const RULES={
 opportunities:(a,u)=>`(${a}.owner_id=${u} OR ${a}.created_by=${u})`,
 leads:(a,u)=>`(${opt(a,'owner_id')}=${u} OR ${a}.created_by=${u})`,
 tasks:(a,u)=>`(${a}.assignee_id=${u} OR ${a}.created_by=${u})`,
 tickets:(a,u)=>`(${a}.assignee_id=${u} OR ${a}.created_by=${u})`,
 interactions:(a,u)=>`(${a}.created_by=${u} OR ${mineOpp(a,u,'id',a+'.opportunity_id')})`,
 companies:(a,u)=>`(${opt(a,'owner_id')}=${u} OR ${a}.created_by=${u} OR ${linked(a,u,'company_id')})`,
 contacts:(a,u)=>`(${opt(a,'owner_id')}=${u} OR ${a}.created_by=${u} OR ${linked(a,u,'contact_id')} OR EXISTS(SELECT 1 FROM sales_companies v_c WHERE v_c.workspace_id=${a}.workspace_id AND v_c.id=${a}.company_id AND (${opt('v_c','owner_id')}=${u} OR v_c.created_by=${u})))`,
 documents:(a,u)=>`(${a}.created_by=${u} OR ${mineOpp(a,u,'id',a+'.opportunity_id')})`};
const mineOpp=(a,u,col,value)=>`EXISTS(SELECT 1 FROM sales_opportunities v_o WHERE v_o.workspace_id=${a}.workspace_id AND v_o.${col}=${value} AND ${RULES.opportunities('v_o',u)})`;
const linked=(a,u,col)=>`${mineOpp(a,u,col,a+'.id')} OR EXISTS(SELECT 1 FROM sales_tasks v_t WHERE v_t.workspace_id=${a}.workspace_id AND v_t.${col}=${a}.id AND ${RULES.tasks('v_t',u)}) OR EXISTS(SELECT 1 FROM sales_tickets v_k WHERE v_k.workspace_id=${a}.workspace_id AND v_k.${col}=${a}.id AND ${RULES.tickets('v_k',u)})`;
const ENTITIES=Object.freeze(Object.keys(RULES));
function visible(entity,a='t',w='$1',u='$2'){
 if(!Object.hasOwn(RULES,entity))return 'TRUE';
 if(!/^[a-z_][a-z0-9_]*$/.test(a))throw new Error('invalid alias');
 return `(NOT ${restricted(w,u)} OR ${RULES[entity](a,u)})`;
}
// ' AND <predicate>' or '' for entities without a rule: for appending to an existing WHERE.
const and=(entity,a,w,u)=>Object.hasOwn(RULES,entity)?' AND '+visible(entity,a,w,u):'';
// A contact id column (clicks, sends): the contact it points to must be visible.
const contact=(col,w='$1',u='$2')=>`EXISTS(SELECT 1 FROM sales_contacts v_x WHERE v_x.workspace_id=${w} AND v_x.id=${col} AND ${visible('contacts','v_x',w,u)})`;
// Write check (api/_sales.js): ids of the entity that exist in the workspace but are hidden from the caller.
async function hidden(sql,entity,workspace,uid,ids){
 if(!Object.hasOwn(RULES,entity)||!ids.length)return [];
 const rows=await sql(`SELECT t.id FROM sales_${entity} t WHERE t.workspace_id=$1 AND t.id=ANY($3::uuid[]) AND NOT ${visible(entity,'t')}`,[workspace,uid,ids]);
 return Array.isArray(rows)?rows.map(r=>r.id):[];
}
module.exports={ENTITIES,visible,and,contact,hidden,restricted};
