'use strict';
// Sign-in protection (api/_auth_guard.js, api/auth/[action].js): limit on failed sign-ins, «password dimenticata» with a signed,
// single-use link, generic errors. The database part runs on PGlite (in-memory Postgres, fake accounts only) and is skipped
// without the optional package; no email leaves the machine (a fake transport collects them).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const G = require('../api/_auth_guard.js');
const { hashPassword, verifySessionToken } = require('../api/_auth.js');
let PGlite = null; try { PGlite = require('@electric-sql/pglite').PGlite; } catch { PGlite = null; }
const SKIP = PGlite ? false : 'optional: npm i --no-save @electric-sql/pglite';
const SECRET = 'segreto-di-prova-solo-per-i-test';
process.env.JWT_SECRET = process.env.JWT_SECRET || SECRET;

test('reset link: signed, 30 minutes, once only, never a session', () => {
  const user = { id: 7, password_hash: hashPassword('password-vecchia') };
  const now = Date.UTC(2026, 10, 16, 10);
  const t = G.resetToken(user, SECRET, now);
  const c = G.readResetToken(t, SECRET, now + 60e3);
  assert.equal(c.uid, 7); assert.ok(G.tokenMatches(c, user));
  assert.equal(G.readResetToken(t, SECRET, now + 31 * 60e3), null, 'expired');
  assert.equal(G.readResetToken(t, 'altro-segreto', now), null, 'other secret');
  assert.equal(G.readResetToken(t.slice(0, -2) + 'xx', SECRET, now), null, 'tampered');
  assert.equal(G.readResetToken('a.b.c', SECRET, now), null);
  assert.equal(G.readResetToken(null, SECRET, now), null);
  assert.equal(G.tokenMatches(c, { id: 7, password_hash: hashPassword('password-nuova') }), false, 'used once: the hash changed');
  assert.equal(G.tokenMatches(c, { id: 8, password_hash: user.password_hash }), false);
  const prev = process.env.JWT_SECRET; process.env.JWT_SECRET = SECRET;
  try { assert.equal(verifySessionToken(t), null, 'a reset link is not a session'); } finally { process.env.JWT_SECRET = prev; }
});

test('email: only with the product SMTP box and an https address; Italian and English, the link to /crm#reset=', () => {
  const env = { PUBLIC_URL: 'https://app.example.com/', AUTH_SMTP_HOST: 'smtp.example.com', AUTH_SMTP_USER: 'u', AUTH_SMTP_PASS: 'p', AUTH_MAIL_FROM: 'Sales Orbis <no-reply@example.com>' };
  assert.equal(G.mailConfig({}), null);
  assert.equal(G.mailConfig({ ...env, PUBLIC_URL: 'http://app.example.com' }), null, 'https only');
  assert.equal(G.mailConfig({ ...env, AUTH_SMTP_PASS: '' }), null);
  const cfg = G.mailConfig(env);
  assert.equal(cfg.base, 'https://app.example.com'); assert.equal(cfg.transport.port, 465); assert.equal(cfg.transport.secure, true);
  const it = G.resetEmail({ base: cfg.base, to: 'a@example.com', name: 'Ada', token: 'T.K', product: 'Sales Orbis' });
  assert.match(it.text, /https:\/\/app\.example\.com\/crm#reset=T\.K/); assert.match(it.subject, /^Sales Orbis/); assert.match(it.text, /30 minuti/);
  assert.doesNotMatch(it.text + it.subject, /RADIX/);
  const en = G.resetEmail({ base: cfg.base, to: 'a@example.com', token: 'T.K', lang: 'en', product: 'Sales Orbis' });
  assert.match(en.subject, /Reset your password/); assert.match(en.text, /within 30 minutes/);
});

test('ip: the first forwarded address', () => {
  assert.equal(G.ipOf({ headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' } }), '203.0.113.9');
  assert.equal(G.ipOf({ headers: {} }), '?');
});

function neonLike(db) {
  return async function sql(strings, ...values) {
    if (Array.isArray(strings) && strings.raw) { let text = ''; strings.forEach((s, i) => { text += s + (i < values.length ? '$' + (i + 1) : ''); }); return (await db.query(text, values)).rows; }
    return (await db.query(strings, values[0] || [])).rows;
  };
}
function call(handler, { action, body, headers = {}, extra }) {
  return new Promise((resolve, reject) => {
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; },
      json(b) { resolve({ status: this.statusCode, body: b, headers: this.headers }); return this; } };
    const req = { method: 'POST', query: { action }, body, headers: { 'x-forwarded-for': '198.51.100.7', ...headers } };
    Promise.resolve(extra ? handler(req, res, extra) : handler(req, res)).catch(reject);
  });
}

test('on a real (in-memory) Postgres: limit, forgotten password, reset once, generic errors', { skip: SKIP }, async () => {
  const DB = require('../tools/sales-orbis/db.js');
  const db = new PGlite();
  await db.exec(DB.schema());
  await db.exec(DB.owner({ email: 'owner@example.com', name: 'Owner Prova', workspace: 'Azienda di prova', password: 'password-di-prova', id: '33333333-3333-4333-8333-333333333333' }));
  const dbPath = require.resolve('../api/_db.js'), authPath = require.resolve('../api/auth/[action].js');
  const saved = require.cache[dbPath];
  let broken = false;
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { sql: () => (broken ? async () => { throw new Error('connessione rifiutata a db.interno:5432'); } : neonLike(db)) } };
  delete require.cache[authPath];
  try {
    const auth = require('../api/auth/[action].js');
    const login = (password, email = 'owner@example.com') => call(auth, { action: 'login', body: { email, password } });
    assert.equal((await login('password-di-prova')).status, 200);
    for (let i = 0; i < 8; i++) assert.equal((await login('sbagliata')).status, 401);
    const blocked = await login('password-di-prova');
    assert.equal(blocked.status, 429); assert.match(blocked.body.error, /Troppi tentativi/);
    // Another account from the same address still signs in (8 per email, 30 per address).
    assert.equal((await login('x', 'nessuno@example.com')).status, 401);

    // Forgotten password: not active without the product's SMTP box.
    assert.equal((await call(auth.forgot, { action: 'forgot', body: { email: 'owner@example.com' }, extra: { env: { JWT_SECRET: SECRET } } })).status, 503);
    const sent = [];
    const env = { JWT_SECRET: SECRET, RADIX_PRODUCT: 'sales-orbis', PUBLIC_URL: 'https://app.example.com', AUTH_SMTP_HOST: 'smtp.example.com', AUTH_SMTP_USER: 'u', AUTH_SMTP_PASS: 'p', AUTH_MAIL_FROM: 'no-reply@example.com' };
    const extra = { env, createTransport: () => ({ sendMail: async m => { sent.push(m); } }) };
    const unknown = await call(auth.forgot, { action: 'forgot', body: { email: 'nessuno@example.com' }, extra });
    const known = await call(auth.forgot, { action: 'forgot', body: { email: 'OWNER@example.com' }, extra });
    assert.equal(unknown.status, 200); assert.deepEqual(unknown.body, known.body, 'the same answer: nobody learns which emails exist');
    assert.equal(sent.length, 1); assert.equal(sent[0].to, 'owner@example.com'); assert.equal(sent[0].from, 'no-reply@example.com');
    assert.match(sent[0].subject, /^Sales Orbis/);
    const token = /#reset=([\w.-]+)/.exec(sent[0].text)[1];
    // 3 requests an hour per email: the fourth sends nothing, with the same answer.
    await call(auth.forgot, { action: 'forgot', body: { email: 'owner@example.com' }, extra });
    await call(auth.forgot, { action: 'forgot', body: { email: 'owner@example.com' }, extra });
    assert.equal(sent.length, 3);
    assert.deepEqual((await call(auth.forgot, { action: 'forgot', body: { email: 'owner@example.com' }, extra })).body, known.body);
    assert.equal(sent.length, 3);

    const reset = body => call(auth.reset, { action: 'reset', body, extra: { env } });
    assert.equal((await reset({ token, password: 'corta' })).status, 400);
    assert.equal((await reset({ token, password: 'password-nuova-1', confirm: 'diversa-1234' })).status, 400);
    const done = await reset({ token, password: 'password-nuova-1', confirm: 'password-nuova-1' });
    assert.equal(done.status, 200, JSON.stringify(done.body));
    const again = await reset({ token, password: 'password-nuova-2', confirm: 'password-nuova-2' });
    assert.equal(again.status, 400); assert.match(again.body.error, /già usato/);
    // The reset also lifts the sign-in block of that email.
    assert.equal((await login('password-di-prova')).status, 401);
    assert.equal((await login('password-nuova-1')).status, 200);

    // A database failure: a plain message, no detail of the server.
    broken = true;
    const fail = await login('password-nuova-1');
    assert.equal(fail.status, 500); assert.equal(fail.body.error, 'Accesso non riuscito: riprova tra poco.');
    assert.doesNotMatch(JSON.stringify(fail.body), /db\.interno|Errore database/);
  } finally {
    if (saved) require.cache[dbPath] = saved; else delete require.cache[dbPath];
    delete require.cache[authPath];
    await db.close();
  }
});
