'use strict';
// Sales Orbis plan limits on /api/chat (api/_sales_plan.js): on the product the Copilota needs a plan that has it, each
// request takes one from the user's monthly allowance, a failed call gives it back. Runs on PGlite (in-memory Postgres,
// fake data) with a fake Anthropic API; skipped without PGlite. RADIX is never metered.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const DB = require('../tools/sales-orbis/db.js');
const Plan = require('../api/_sales_plan.js');
let PGlite = null; try { PGlite = require('@electric-sql/pglite').PGlite; } catch { PGlite = null; }
const SKIP = PGlite ? false : 'optional: npm i --no-save @electric-sql/pglite';

function neonLike(db) {
  return async function sql(strings, ...values) {
    if (Array.isArray(strings) && strings.raw) { let text = ''; strings.forEach((s, i) => { text += s + (i < values.length ? '$' + (i + 1) : ''); }); return (await db.query(text, values)).rows; }
    return (await db.query(strings, values[0] || [])).rows;
  };
}
function res() { return { statusCode: 200, body: undefined, headers: {}, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; return this; } }; }

test('chat on the product: plan, monthly limit, give back on failure; RADIX untouched', { skip: SKIP }, async () => {
  const db = new PGlite();
  const dbPath = require.resolve('../api/_db.js');
  const saved = { db: require.cache[dbPath], fetch: globalThis.fetch, jwt: process.env.JWT_SECRET, key: process.env.ANTHROPIC_API_KEY, product: process.env.RADIX_PRODUCT };
  try {
    await db.exec(DB.schema());
    const ws = '77777777-7777-4777-8777-777777777777';
    await db.exec(DB.owner({ email: 'limiti@example.com', name: 'Prova Limiti', workspace: 'Azienda finta', password: 'password-di-prova', id: ws }));
    const uid = (await db.query("SELECT id FROM users WHERE email='limiti@example.com'")).rows[0].id;
    require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { sql: () => neonLike(db) } };
    delete process.env.RADIX_PRODUCT;
    process.env.JWT_SECRET = 'test-secret-not-real'; process.env.ANTHROPIC_API_KEY = 'sk-test-not-real';
    let upstream = 'ok', calls = 0;
    globalThis.fetch = async () => { calls++; const ok = upstream === 'ok';
      return { ok, status: ok ? 200 : 500, json: async () => ok ? { content: [{ type: 'text', text: 'Risposta finta.' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } } : { error: { message: 'down' } } }; };
    delete require.cache[require.resolve('../api/chat.js')];
    const chat = require('../api/chat.js');
    const { signSessionToken } = require('../api/_auth.js');
    const cookie = 'radix_session=' + encodeURIComponent(signSessionToken({ uid, email: 'limiti@example.com', name: 'Prova Limiti' }));
    const ask = async host => { const r = res(); await chat({ method: 'POST', headers: { host, cookie }, query: {}, body: { role: 'crm-copilot', messages: [{ role: 'user', content: 'Ciao' }] } }, r); return r; };
    const P = 'sales-orbis.example.com';

    await db.exec(DB.plan({ workspace: ws, plan: 'completo' }));
    let r = await ask(P);
    assert.equal(r.statusCode, 403); assert.equal(r.body.error, Plan.COPILOT_LOCKED); assert.equal(calls, 0, 'no AI call without the Copilota');

    await db.exec(DB.plan({ workspace: ws, plan: 'avanzato' }));
    r = await ask(P); assert.equal(r.statusCode, 200); assert.equal(r.body.reply, 'Risposta finta.');
    assert.deepEqual(await Plan.usage(neonLike(db), ws, uid), { ai: 1, lead: 0, send: 0 });

    upstream = 'down'; r = await ask(P); assert.equal(r.statusCode, 500);
    assert.equal((await Plan.usage(neonLike(db), ws, uid)).ai, 1, 'a failed call is given back');
    upstream = 'ok';

    await db.query(`UPDATE sales_plan_usage SET used=140 WHERE workspace_id=$1 AND user_id=$2 AND metric='ai'`, [ws, uid]);
    const before = calls; r = await ask(P);
    assert.equal(r.statusCode, 429); assert.equal(r.body.error, Plan.OVER.ai); assert.equal(r.body.code, 'plan_limit'); assert.equal(calls, before, 'no AI call over the limit');

    // Without the AI key the customer sees a plain message, never the server setup.
    delete process.env.ANTHROPIC_API_KEY; r = await ask(P);
    assert.equal(r.statusCode, 503); assert.doesNotMatch(r.body.error, /ANTHROPIC|Vercel/);
    process.env.ANTHROPIC_API_KEY = 'sk-test-not-real';

    r = await ask('radix-platform.vercel.app');
    assert.equal(r.statusCode, 200, 'RADIX: no plans, no limits');
    assert.equal((await Plan.usage(neonLike(db), ws, uid)).ai, 140, 'RADIX requests are not counted');
  } finally {
    if (saved.db) require.cache[dbPath] = saved.db; else delete require.cache[dbPath];
    delete require.cache[require.resolve('../api/chat.js')];
    globalThis.fetch = saved.fetch;
    for (const [k, v] of [['JWT_SECRET', saved.jwt], ['ANTHROPIC_API_KEY', saved.key], ['RADIX_PRODUCT', saved.product]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    await db.close();
  }
});
