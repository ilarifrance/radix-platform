'use strict';
// Sales Orbis plans (api/_sales_plan.js, migrations sales 023 and 024): what each plan includes and its monthly limits per
// user; only the product applies them. The database part runs on PGlite (in-memory Postgres, fake data) and is skipped without it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Plan = require('../api/_sales_plan.js');
const DB = require('../tools/sales-orbis/db.js');
let PGlite = null; try { PGlite = require('@electric-sql/pglite').PGlite; } catch { PGlite = null; }
const SKIP = PGlite ? false : 'optional: npm i --no-save @electric-sql/pglite';
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('what each plan includes, and its monthly limits', () => {
  assert.deepEqual(Plan.PLANS, ['prova', 'completo', 'avanzato', 'extreme']);
  for (const [p, lead, copilot] of [['prova', true, true], ['completo', false, false], ['avanzato', false, true], ['extreme', true, true]]) {
    assert.equal(Plan.has(p, 'lead'), lead, p + ' lead'); assert.equal(Plan.has(p, 'copilot'), copilot, p + ' copilot');
  }
  assert.equal(Plan.has('altro', 'lead'), true, 'an unknown value counts as the default, prova');
  assert.deepEqual(Plan.limits('completo'), { ai: 0, lead: 0, send: 1000 });
  assert.deepEqual(Plan.limits('avanzato'), { ai: 140, lead: 0, send: 1000 });
  assert.deepEqual(Plan.limits('extreme'), { ai: 350, lead: 300, send: 1500 });
  assert.deepEqual(Plan.limits('prova'), { ai: 100, lead: 50, send: 300 });
  for (const e of ['lead_lists', 'lead_contact_jobs', 'lead_growth_projects', 'lead_public_lookup', 'lead_provider_status', 'lead_import_token', 'email_finder'])
    assert.ok(Plan.LEAD_ENTITIES.includes(e), e);
  for (const e of ['companies', 'contacts', 'opportunities', 'tasks', 'leads', 'send_queue', 'workspace_settings']) assert.ok(!Plan.LEAD_ENTITIES.includes(e), e + ' is CRM');
});

test('the limits keep the margins (prices with VAT 22%, estimated costs)', () => {
  const PRICE = { completo: 8, avanzato: 17, extreme: 59 }, FIXED = 2, AI = 0.03, LEAD = 0.035;
  const margin = p => { const net = PRICE[p] / 1.22, l = Plan.limits(p), cost = FIXED + PRICE[p] * 0.015 + 0.25 + l.ai * AI + l.lead * LEAD; return (net - cost) / net; };
  assert.ok(margin('completo') >= 0.5, 'completo ' + margin('completo'));
  assert.ok(margin('avanzato') >= 0.5, 'avanzato ' + margin('avanzato'));
  assert.ok(margin('extreme') >= 0.4, 'extreme ' + margin('extreme'));
});

test('gate: only on the product, only Lead Intelligence, «extreme» before migration 023', async () => {
  const sqlOf = plan => async () => [{ plan }];
  const ws = '44444444-4444-4444-8444-444444444444';
  assert.deepEqual(await Plan.gate('lead_lists', ws, { sql: sqlOf('avanzato'), product: true }), [403, Plan.LOCKED]);
  assert.deepEqual(await Plan.gate('email_finder', ws, { sql: sqlOf('completo'), product: true }), [403, Plan.LOCKED]);
  assert.equal(await Plan.gate('lead_lists', ws, { sql: sqlOf('completo'), product: false }), null, 'RADIX: everything');
  assert.equal(await Plan.gate('companies', ws, { sql: sqlOf('completo'), product: true }), null);
  assert.equal(await Plan.gate('lead_lists', ws, { sql: sqlOf('prova'), product: true }), null);
  assert.equal(await Plan.gate('lead_lists', ws, { sql: sqlOf('extreme'), product: true }), null);
  const noColumn = async () => { const e = new Error('column "plan" does not exist'); e.code = '42703'; throw e; };
  assert.equal(await Plan.planOf(noColumn, ws), 'extreme');
  assert.equal(await Plan.meter(sqlOf('completo'), { workspace: ws, user: 1, product: false }), null, 'RADIX: no limits');
});

test('db.js plan: only a workspace id and a known plan', () => {
  assert.match(DB.plan({ workspace: '44444444-4444-4444-8444-444444444444', plan: 'avanzato' }), /UPDATE sales_workspaces SET plan = 'avanzato' WHERE id = '44444444-4444-4444-8444-444444444444';/);
  assert.throws(() => DB.plan({ workspace: 'x', plan: 'extreme' }));
  assert.throws(() => DB.plan({ workspace: '44444444-4444-4444-8444-444444444444', plan: 'base' }), 'the old name is gone');
  assert.match(read('migrations/sales/023_workspace_plan.sql'), /DEFAULT 'prova'/);
  assert.match(read('migrations/sales/023_workspace_plan.sql'), /'prova','completo','avanzato','extreme'/);
  assert.match(read('migrations/sales/024_plan_usage.sql'), /CREATE TABLE IF NOT EXISTS sales_plan_usage/);
});

test('pages: the menu drops Lead Intelligence without it, the Copilota button goes with «completo», the settings show the limits', () => {
  const nav = read('sales/sales-nav.js');
  assert.match(nav, /NO_LEAD = \['completo', 'avanzato'\]/);
  assert.match(nav, /!\(baseOnly && it\.href === LEAD\)/);
  assert.match(nav, /setAttribute\('data-plan', plan\)/);
  assert.match(read('sales/crm-copilot.css'), /html\[data-product\]\[data-plan="completo"\] \.cc-fab\{display:none!important\}/);
  assert.match(read('sales/sales.js'), /localStorage\.setItem\('rx-ws-plan',plan\)/);
  const st = read('shell/settings.js');
  assert.match(st, /if\(PRODUCT\)out\.append\(await planCard\(\)\)/);
  assert.match(st, /Richieste al Copilota: \{0\} su \{1\}/);
  const en = require('../lib/radix-i18n-en.js');
  const dict = en.DICT || en.default || en;
  const text = JSON.stringify(dict);
  for (const k of ['Piano: Avanzato', 'Piano: Extreme', 'Richieste al Copilota: {0} su {1}', Plan.LOCKED, Plan.COPILOT_LOCKED, Plan.OVER.ai, Plan.OVER.lead, Plan.OVER.send])
    assert.ok(text.includes(JSON.stringify(k).slice(1, -1)) || read('lib/radix-i18n-en.js').includes(k), 'EN: ' + k);
});

function neonLike(db) {
  return async function sql(strings, ...values) {
    if (Array.isArray(strings) && strings.raw) { let text = ''; strings.forEach((s, i) => { text += s + (i < values.length ? '$' + (i + 1) : ''); }); return (await db.query(text, values)).rows; }
    return (await db.query(strings, values[0] || [])).rows;
  };
}
function call(handler, { host, query }) {
  return new Promise((resolve, reject) => {
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; },
      json(b) { resolve({ status: this.statusCode, body: b }); return this; }, end(b) { resolve({ status: this.statusCode, body: b }); } };
    Promise.resolve(handler({ method: 'GET', query, headers: { host } }, res)).catch(reject);
  });
}

test('on a real (in-memory) Postgres: plans close Lead Intelligence on the product only, limits count per user and month', { skip: SKIP }, async () => {
  const prev = process.env.RADIX_PRODUCT; delete process.env.RADIX_PRODUCT;
  const db = new PGlite();
  try {
    await db.exec(DB.schema());
    const ws = '55555555-5555-4555-8555-555555555555';
    await db.exec(DB.owner({ email: 'owner@example.com', name: 'Owner Prova', workspace: 'Azienda di prova', password: 'password-di-prova', id: ws }));
    const uid = (await db.query("SELECT id FROM users WHERE email='owner@example.com'")).rows[0].id;
    const { createHandler } = require('../api/_sales.js'), { createStore } = require('../api/_sales_store.js');
    const h = createHandler({ getSessionUser: () => ({ uid }), getStore: () => createStore(neonLike(db)) });
    const lists = host => call(h, { host, query: { entity: 'lead_lists', workspace: ws } });
    const settings = await call(h, { host: 'sales-orbis.test', query: { entity: 'workspace_settings', workspace: ws } });
    assert.equal(settings.body.settings.plan, 'prova', 'a new workspace starts on the trial');
    assert.deepEqual(settings.body.settings.limits, { ai: 100, lead: 50, send: 300 });
    assert.deepEqual(settings.body.settings.usage, { ai: 0, lead: 0, send: 0 });
    assert.equal((await lists('sales-orbis.test')).status, 200);
    await db.exec(DB.plan({ workspace: ws, plan: 'avanzato' }));
    const locked = await lists('sales-orbis.test');
    assert.equal(locked.status, 403); assert.equal(locked.body.error, Plan.LOCKED);
    assert.equal((await call(h, { host: 'sales-orbis.test', query: { entity: 'companies', workspace: ws } })).status, 200, 'the CRM stays open');
    assert.equal((await lists('radix.example.com')).status, 200, 'RADIX has no plans');
    await db.exec(DB.plan({ workspace: ws, plan: 'extreme' }));
    assert.equal((await lists('sales-orbis.test')).status, 200);

    // Limits: all or nothing, given back, per user, read in the settings.
    const sql = neonLike(db);
    await db.exec(DB.plan({ workspace: ws, plan: 'avanzato' }));
    assert.equal(await Plan.aiWorkspace(sql, uid, ws), ws);
    assert.equal(await Plan.aiWorkspace(sql, uid, '66666666-6666-4666-8666-666666666666'), ws, 'not a member there: their own workspace');
    const m = await Plan.meter(sql, { workspace: ws, user: uid, product: true });
    assert.equal(m.plan, 'avanzato');
    for (let k = 0; k < 140; k++) await m.take('ai', 1);
    await assert.rejects(m.take('ai', 1), e => e.status === 429 && e.message === Plan.OVER.ai);
    await m.give('ai', 1); await m.take('ai', 1);
    await assert.rejects(m.take('lead', 1), e => e.status === 403 && e.message === Plan.LOCKED, 'no paid searches in «avanzato»');
    await m.take('send', 900);
    await assert.rejects(m.take('send', 101), e => e.status === 429, 'over the limit: nothing taken');
    await m.take('send', 100);
    const after = await call(h, { host: 'sales-orbis.test', query: { entity: 'workspace_settings', workspace: ws } });
    assert.deepEqual(after.body.settings.usage, { ai: 140, lead: 0, send: 1000 });
    await db.exec(DB.plan({ workspace: ws, plan: 'completo' }));
    const c = await Plan.meter(sql, { workspace: ws, user: uid, product: true });
    await assert.rejects(c.take('ai', 1), e => e.status === 403 && e.message === Plan.COPILOT_LOCKED);
    // A new month starts from zero.
    await db.query("UPDATE sales_plan_usage SET month = month - interval '1 month'");
    assert.deepEqual(await Plan.usage(sql, ws, uid), { ai: 0, lead: 0, send: 0 });
  } finally {
    if (prev !== undefined) process.env.RADIX_PRODUCT = prev;
    await db.close();
  }
});
