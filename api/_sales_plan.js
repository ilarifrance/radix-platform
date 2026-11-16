'use strict';
/* Sales Orbis plans (migration sales 023): a workspace is «prova» (trial: everything), «base» (everything but Lead
   Intelligence) or «completo» (everything). Only the product applies them (api/_product.js); on RADIX every workspace has
   everything. Before migration 023 there is no plan column and every workspace counts as «completo».
   The plan is set by whoever sells it (tools/sales-orbis/db.js plan …, later the payments), never by the customer. */
const PLANS = Object.freeze(['prova', 'base', 'completo']);
const DEFAULT = 'prova';
// What each plan includes beyond the CRM itself.
const FEATURES = Object.freeze({ lead: Object.freeze(['prova', 'completo']) });
// The /api/sales resources of Lead Intelligence (lead-intelligence.html and its scripts).
const LEAD_ENTITIES = Object.freeze(['lead_lists', 'lead_contact_jobs', 'lead_growth_projects', 'lead_public_lookup', 'lead_provider_status',
  'lead_import_token', 'email_finder']);
const LOCKED = 'Lead Intelligence è inclusa nel piano Completo: chiedi all’owner del workspace di passare al Completo.';

function has(plan, feature) { const p = PLANS.includes(plan) ? plan : DEFAULT; return (FEATURES[feature] || []).includes(p); }
// The plan of a workspace; «completo» on a database without the column (42703).
async function planOf(sql, workspace) {
  try {
    const r = await sql('SELECT plan FROM sales_workspaces WHERE id=$1', [workspace]);
    return r[0] && PLANS.includes(r[0].plan) ? r[0].plan : DEFAULT;
  } catch (e) { if (e && e.code === '42703') return 'completo'; throw e; }
}
// null when the request may go on, else the [status, message] to answer.
async function gate(entity, workspace, { sql, product }) {
  if (!product || !LEAD_ENTITIES.includes(entity) || !workspace) return null;
  return has(await planOf(sql, workspace), 'lead') ? null : [403, LOCKED];
}
module.exports = { PLANS, DEFAULT, FEATURES, LEAD_ENTITIES, LOCKED, has, planOf, gate };
