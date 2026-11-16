'use strict';
// Sales Orbis plans (api/_sales_plan.js, migration sales 023): «prova» and «completo» have Lead Intelligence, «base» does not;
// only the product applies them. The database part runs on PGlite (in-memory Postgres, fake data) and is skipped without it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Plan = require('../api/_sales_plan.js');
const DB = require('../tools/sales-orbis/db.js');
let PGlite = null; try { PGlite = require('@electric-sql/pglite').PGlite; } catch { PGlite = null; }
const SKIP = PGlite ? false : 'optional: npm i --no-save @electric-sql/pglite';
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('what each plan includes', () => {
  assert.deepEqual(Plan.PLANS, ['prova', 'base', 'completo']);
  assert.equal(Plan.has('prova', 'lead'), true);
  assert.equal(Plan.has('completo', 'lead'), true);
  assert.equal(Plan.has('base', 'lead'), false);
  assert.equal(Plan.has('altro', 'lead'), true, 'an unknown value counts as the default, prova');
  for (const e of ['lead_lists', 'lead_contact_jobs', 'lead_growth_projects', 'lead_public_lookup', 'lead_provider_status', 'lead_import_token', 'email_finder'])
    assert.ok(Plan.LEAD_ENTITIES.includes(e), e);
  for (const e of ['companies', 'contacts', 'opportunities', 'tasks', 'leads', 'send_queue', 'workspace_settings']) assert.ok(!Plan.LEAD_ENTITIES.includes(e), e + ' is CRM');
});

test('gate: only on the product, only Lead Intelligence, «completo» before migration 023', async () => {
  const sqlOf = plan => async () => [{ plan }];
  const ws = '44444444-4444-4444-8444-444444444444';
  assert.deepEqual(await Plan.gate('lead_lists', ws, { sql: sqlOf('base'), product: true }), [403, Plan.LOCKED]);
  assert.equal(await Plan.gate('lead_lists', ws, { sql: sqlOf('base'), product: false }), null, 'RADIX: everything');
  assert.equal(await Plan.gate('companies', ws, { sql: sqlOf('base'), product: true }), null);
  assert.equal(await Plan.gate('lead_lists', ws, { sql: sqlOf('prova'), product: true }), null);
  const noColumn = async () => { const e = new Error('column "plan" does not exist'); e.code = '42703'; throw e; };
  assert.equal(await Plan.planOf(noColumn, ws), 'completo');
});

test('db.js plan: only a workspace id and a known plan', () => {
  assert.match(DB.plan({ workspace: '44444444-4444-4444-8444-444444444444', plan: 'base' }), /UPDATE sales_workspaces SET plan = 'base' WHERE id = '44444444-4444-4444-8444-444444444444';/);
  assert.throws(() => DB.plan({ workspace: 'x', plan: 'base' }));
  assert.throws(() => DB.plan({ workspace: '44444444-4444-4444-8444-444444444444', plan: 'gratis' }));
  assert.match(read('migrations/sales/023_workspace_plan.sql'), /DEFAULT 'prova'/);
});

test('pages: the menu drops Lead Intelligence with «base», the settings show the plan', () => {
  const nav = read('sales/sales-nav.js');
  assert.match(nav, /baseOnly = product && localStorage\.getItem\('rx-ws-plan'\) === 'base'/);
  assert.match(nav, /!\(baseOnly && it\.href === LEAD\)/);
  assert.match(read('sales/sales.js'), /localStorage\.setItem\('rx-ws-plan',plan\)/);
  assert.match(read('shell/settings.js'), /if\(PRODUCT\)out\.append\(await planCard\(\)\)/);
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

test('on a real (in-memory) Postgres: «base» closes Lead Intelligence on the product only', { skip: SKIP }, async () => {
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
    assert.equal((await lists('sales-orbis.test')).status, 200);
    await db.exec(DB.plan({ workspace: ws, plan: 'base' }));
    const locked = await lists('sales-orbis.test');
    assert.equal(locked.status, 403); assert.equal(locked.body.error, Plan.LOCKED);
    assert.equal((await call(h, { host: 'sales-orbis.test', query: { entity: 'companies', workspace: ws } })).status, 200, 'the CRM stays open');
    assert.equal((await lists('radix.example.com')).status, 200, 'RADIX has no plans');
    await db.exec(DB.plan({ workspace: ws, plan: 'completo' }));
    assert.equal((await lists('sales-orbis.test')).status, 200);
  } finally {
    if (prev !== undefined) process.env.RADIX_PRODUCT = prev;
    await db.close();
  }
});
