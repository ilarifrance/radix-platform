'use strict';
/* Sales Orbis plans (migration sales 023) and their monthly limits per user (migration sales 024). Prices include VAT.
   - «completo» (8 €): the whole CRM, without the Copilota and without Lead Intelligence.
   - «avanzato» (17 €): the CRM and the Copilota.
   - «extreme» (59 €): the CRM, the Copilota and Lead Intelligence.
   - «prova»: the trial, everything, with smaller limits.
   Limits are per user, per workspace and per calendar month (Europe/Rome), counted in sales_plan_usage:
   «ai» = requests to the AI (/api/chat), «lead» = contacts sent to a paid email provider, «send» = emails queued.
   Only the product applies them (api/_product.js); on RADIX every workspace has everything, without limits.
   Before migration 023 there is no plan column and every workspace counts as «extreme».
   The plan is set by whoever sells it (tools/sales-orbis/db.js plan …, later the payments), never by the customer. */
const PLANS = Object.freeze(['prova', 'completo', 'avanzato', 'extreme']);
const DEFAULT = 'prova';
const NO_COLUMN = 'extreme';
const NAMES = Object.freeze({ prova: 'Prova', completo: 'Completo', avanzato: 'Avanzato', extreme: 'Extreme' });
// What each plan includes beyond the CRM itself.
const FEATURES = Object.freeze({ copilot: Object.freeze(['prova', 'avanzato', 'extreme']), lead: Object.freeze(['prova', 'extreme']) });
// Monthly limits per user (docs/sales-orbis.md, «Piani»: the margins behind these numbers).
const LIMITS = Object.freeze({
  prova: Object.freeze({ ai: 100, lead: 50, send: 300 }),
  completo: Object.freeze({ ai: 0, lead: 0, send: 1000 }),
  avanzato: Object.freeze({ ai: 140, lead: 0, send: 1000 }),
  extreme: Object.freeze({ ai: 350, lead: 300, send: 1500 })
});
const METRICS = Object.freeze(['ai', 'lead', 'send']);
// The /api/sales resources of Lead Intelligence (lead-intelligence.html and its scripts).
const LEAD_ENTITIES = Object.freeze(['lead_lists', 'lead_contact_jobs', 'lead_growth_projects', 'lead_public_lookup', 'lead_provider_status',
  'lead_import_token', 'email_finder']);
const LOCKED = 'Lead Intelligence è inclusa nel piano Extreme: chiedi all’owner del workspace di passare a Extreme.';
const COPILOT_LOCKED = 'Il Copilota è incluso nei piani Avanzato ed Extreme: chiedi all’owner del workspace di cambiare piano.';
const OVER = Object.freeze({
  ai: 'Hai usato tutte le richieste al Copilota di questo mese previste dal piano. Si azzerano il primo del mese, oppure l’owner può passare a un piano più ampio.',
  lead: 'Hai usato tutte le ricerche email a pagamento di questo mese previste dal piano. Si azzerano il primo del mese, oppure l’owner può passare a un piano più ampio.',
  send: 'Questi invii superano le email di questo mese previste dal piano. Riduci i destinatari: il conto si azzera il primo del mese.'
});
const NOT_READY = 'Il conteggio dei limiti del piano non è ancora attivo in questo archivio: serve la migrazione sales 024 (da approvare).';

class LimitError extends Error { constructor(status, message) { super(message); this.status = status; } }
const known = plan => (PLANS.includes(plan) ? plan : DEFAULT);
function has(plan, feature) { return (FEATURES[feature] || []).includes(known(plan)); }
function limits(plan) { return LIMITS[known(plan)]; }
// The plan of a workspace; «extreme» on a database without the column (42703).
async function planOf(sql, workspace) {
  try {
    const r = await sql('SELECT plan FROM sales_workspaces WHERE id=$1', [workspace]);
    return r[0] && PLANS.includes(r[0].plan) ? r[0].plan : DEFAULT;
  } catch (e) { if (e && e.code === '42703') return NO_COLUMN; throw e; }
}
// null when the request may go on, else the [status, message] to answer.
async function gate(entity, workspace, { sql, product }) {
  if (!product || !LEAD_ENTITIES.includes(entity) || !workspace) return null;
  return has(await planOf(sql, workspace), 'lead') ? null : [403, LOCKED];
}

const MONTH = "date_trunc('month', now() AT TIME ZONE 'Europe/Rome')::date";
const missing = e => e && e.code === '42P01';
// Takes n from this month's allowance, all or nothing; false when it would go over the limit.
async function take(sql, { workspace, user, metric, n, limit }) {
  if (!METRICS.includes(metric) || !Number.isSafeInteger(n) || n < 0) throw new LimitError(400, 'Conteggio non valido.');
  if (n === 0) return true;
  if (n > limit) return false;
  try {
    const r = await sql(`INSERT INTO sales_plan_usage(workspace_id,user_id,month,metric,used) VALUES($1,$2,${MONTH},$3,$4::int)
      ON CONFLICT (workspace_id,user_id,month,metric) DO UPDATE SET used=sales_plan_usage.used+EXCLUDED.used
      WHERE sales_plan_usage.used+EXCLUDED.used<=$5::int RETURNING used`, [workspace, user, metric, n, limit]);
    return r.length > 0;
  } catch (e) { if (missing(e)) throw new LimitError(503, NOT_READY); throw e; }
}
// Gives back what was taken and not used (a failed AI call, a provider that did not answer, emails not queued).
async function give(sql, { workspace, user, metric, n }) {
  if (!Number.isSafeInteger(n) || n <= 0) return;
  try { await sql(`UPDATE sales_plan_usage SET used=GREATEST(used-$4::int,0) WHERE workspace_id=$1 AND user_id=$2 AND month=${MONTH} AND metric=$3`, [workspace, user, metric, n]); }
  catch (e) { if (!missing(e)) throw e; }
}
// This month's use of one user in one workspace: {ai, lead, send}; zeros before migration 024.
async function usage(sql, workspace, user) {
  const out = { ai: 0, lead: 0, send: 0 };
  try {
    const r = await sql(`SELECT metric,used FROM sales_plan_usage WHERE workspace_id=$1 AND user_id=$2 AND month=${MONTH}`, [workspace, user]);
    for (const x of r) if (METRICS.includes(x.metric)) out[x.metric] = Number(x.used) || 0;
  } catch (e) { if (!missing(e)) throw e; }
  return out;
}
/* The meter of one request: null off the product (no limits), else {plan, take(metric,n), give(metric,n)}.
   take throws a LimitError (429 over the limit, 403 when the plan has no allowance at all, 503 before migration 024). */
async function meter(sql, { workspace, user, product }) {
  if (!product) return null;
  const plan = await planOf(sql, workspace), lim = limits(plan);
  return {
    plan,
    limits: lim,
    async take(metric, n) {
      if (!lim[metric]) throw new LimitError(403, metric === 'ai' ? COPILOT_LOCKED : metric === 'lead' ? LOCKED : OVER.send);
      if (!(await take(sql, { workspace, user, metric, n, limit: lim[metric] }))) throw new LimitError(429, OVER[metric]);
    },
    give(metric, n) { return give(sql, { workspace, user, metric, n }); }
  };
}
// The workspace an AI request counts on: the one asked for (when the user is a member), else the user's workspace with the
// widest plan. null when the user is in no workspace.
async function aiWorkspace(sql, user, wanted) {
  const r = await sql('SELECT m.workspace_id AS id FROM sales_memberships m WHERE m.user_id=$1', [user]);
  const ids = r.map(x => x.id);
  if (wanted && ids.includes(wanted)) return wanted;
  let best = null, rank = -2;
  for (const id of ids) {
    const p = await planOf(sql, id), k = has(p, 'copilot') ? limits(p).ai : -1;
    if (k > rank) { rank = k; best = id; }
  }
  return best;
}
module.exports = { PLANS, DEFAULT, NO_COLUMN, NAMES, FEATURES, LIMITS, METRICS, LEAD_ENTITIES, LOCKED, COPILOT_LOCKED, OVER, NOT_READY, LimitError,
  has, limits, planOf, gate, take, give, usage, meter, aiWorkspace };
