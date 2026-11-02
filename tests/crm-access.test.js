'use strict';
// users.access ('full' | 'crm'): an account that may use only the CRM. Pure/mocked tests, no database.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-crm-access';
const auth = require('../api/_auth');

function res() {
  return {
    code: 200, headers: {}, data: null,
    status(n) { this.code = n; return this; },
    setHeader(k, v) { this.headers[k] = v; },
    json(v) { this.data = v; return this; },
  };
}
function load(file, mocks) {
  const filename = path.resolve(__dirname, '..', file);
  const original = Module._load;
  Module._load = function (request, parent) {
    if (parent && parent.filename === filename && Object.hasOwn(mocks, request)) return mocks[request];
    return original.apply(this, arguments);
  };
  try { delete require.cache[filename]; return require(filename); } finally { Module._load = original; }
}
function cookieToken(reply) { return decodeURIComponent(/radix_session=([^;]*)/.exec(reply.headers['Set-Cookie'])[1]); }

test('accessOf: only acc="crm" restricts, anything else is full', () => {
  assert.equal(auth.accessOf({ acc: 'crm' }), 'crm');
  for (const u of [null, undefined, {}, { acc: 'full' }, { acc: 'CRM' }, { uid: 1 }]) assert.equal(auth.accessOf(u), 'full');
});

test('requireFull: 401 without session, 403 for crm, user for full and legacy tokens', () => {
  let r = res();
  assert.equal(auth.requireFull({ headers: {} }, r), null);
  assert.equal(r.code, 401);
  r = res();
  assert.equal(auth.requireFull({}, r, { uid: 1, acc: 'crm' }), null);
  assert.equal(r.code, 403);
  assert.deepEqual(r.data, { error: 'Questo account può usare solo il CRM.' });
  r = res();
  const legacy = { uid: 1, email: 'a@b.test' };
  assert.equal(auth.requireFull({}, r, legacy), legacy);
  assert.equal(r.code, 200);
  const token = auth.signSessionToken({ uid: 2, acc: 'crm' });
  r = res();
  assert.equal(auth.requireFull({ headers: { cookie: 'radix_session=' + encodeURIComponent(token) } }, r), null);
  assert.equal(r.code, 403);
});

test('session token round trip keeps acc', () => {
  const t = auth.signSessionToken({ uid: 3, email: 'c@b.test', name: 'C', acc: 'crm' });
  assert.equal(auth.verifySessionToken(t).acc, 'crm');
  assert.equal(auth.verifySessionToken(auth.signSessionToken({ uid: 3 })).acc, undefined);
});

function authHandler(rowsFor) {
  const queries = [];
  const handler = load('api/auth/[action].js', {
    '../_db': { sql: () => async (parts, ...values) => { queries.push(parts.join('?')); return rowsFor(parts.join('?'), values); } },
  });
  return { handler, queries };
}
const row = (o) => ({ id: 5, email: 'u@b.test', name: 'U', password_hash: auth.hashPassword('password123'), ...o });
const loginReq = { method: 'POST', query: { action: 'login' }, body: { email: 'u@b.test', password: 'password123' } };

test('login: crm account gets acc in the token and access in the reply; me echoes it', async () => {
  const { handler } = authHandler(() => [row({ access: 'crm' })]);
  const r = res();
  await handler(loginReq, r);
  assert.equal(r.code, 200);
  assert.equal(r.data.user.access, 'crm');
  const claims = auth.verifySessionToken(cookieToken(r));
  assert.equal(claims.acc, 'crm');
  const m = res();
  const meHandler = load('api/auth/[action].js', { '../_db': { sql: () => async () => [] } });
  await meHandler({ method: 'GET', query: { action: 'me' }, headers: { cookie: r.headers['Set-Cookie'].split(';')[0] } }, m);
  assert.equal(m.data.user.access, 'crm');
});

test('login: full account has no acc in the token', async () => {
  const { handler } = authHandler(() => [row({ access: 'full' })]);
  const r = res();
  await handler(loginReq, r);
  assert.equal(r.data.user.access, 'full');
  assert.equal(auth.verifySessionToken(cookieToken(r)).acc, undefined);
});

test('login: falls back to the old query when users.access does not exist (42703)', async () => {
  const { handler, queries } = authHandler((q) => {
    if (q.includes('access')) throw Object.assign(new Error('column "access" does not exist'), { code: '42703' });
    return [row({})];
  });
  const r = res();
  await handler(loginReq, r);
  assert.equal(r.code, 200);
  assert.equal(r.data.user.access, 'full');
  assert.equal(queries.length, 2);
  assert.equal(auth.verifySessionToken(cookieToken(r)).acc, undefined);
});

test('login: other database errors are still reported', async () => {
  const { handler } = authHandler(() => { throw Object.assign(new Error('boom'), { code: '08006' }); });
  const r = res();
  await handler(loginReq, r);
  assert.equal(r.code, 500);
});

function usersHandler(onQuery) {
  const queries = [];
  const handler = load('api/admin/_users.js', {
    '../_db': { sql: () => async (parts, ...values) => { const q = parts.join('?'); queries.push(q); return onQuery(q, values); } },
    '../_auth': { isAdminRequest: () => true, hashPassword: () => 'salt:hash' },
  });
  return { handler, queries };
}
const post = (body) => ({ method: 'POST', headers: {}, body: { email: 'N@B.test', name: 'N', password: 'password123', ...body } });

test('admin users: rejects an unknown access value before touching the database', async () => {
  const { handler, queries } = usersHandler(() => []);
  const r = res();
  await handler(post({ access: 'root' }), r);
  assert.equal(r.code, 400);
  assert.equal(queries.length, 0);
});

test('admin users: access crm is saved; omitted access leaves existing level (NULL param)', async () => {
  let seen;
  const { handler } = usersHandler((q, v) => { seen = v; return [{ id: 1, email: 'n@b.test', name: 'N', access: v[3], created_at: 'x' }]; });
  let r = res();
  await handler(post({ access: 'crm' }), r);
  assert.equal(r.code, 200);
  assert.equal(r.data.user.access, 'crm');
  r = res();
  await handler(post({}), r);
  assert.equal(seen[3], 'full');
  assert.equal(seen[4], null);
});

test('admin users: missing column -> 409 for crm, old query for full, list falls back', async () => {
  const missing = (q) => {
    if (q.includes('access')) throw Object.assign(new Error('no column'), { code: '42703' });
    return [{ id: 1, email: 'n@b.test', name: 'N', created_at: 'x' }];
  };
  const { handler } = usersHandler(missing);
  let r = res();
  await handler(post({ access: 'crm' }), r);
  assert.equal(r.code, 409);
  assert.match(r.data.error, /Applica prima la migrazione users\.access/);
  r = res();
  await handler(post({ access: 'full' }), r);
  assert.equal(r.code, 200);
  assert.equal(r.data.user.access, 'full');
  r = res();
  await handler({ method: 'GET', headers: {} }, r);
  assert.equal(r.code, 200);
  assert.equal(r.data.users[0].access, 'full');
});

test('migration file and idempotent admin migrate add the column', () => {
  const sql = fs.readFileSync('migrations/core/003_users_access.sql', 'utf8');
  assert.match(sql, /ALTER TABLE users ADD COLUMN IF NOT EXISTS access text NOT NULL DEFAULT 'full' CHECK \(access IN \('full','crm'\)\);/);
  assert.match(fs.readFileSync('api/admin/_migrate.js', 'utf8'), /ADD COLUMN IF NOT EXISTS access text/);
});

// Classification fixture (see RILEVAZIONE.md). A = reachable by a CRM-only account. B = other areas, closed with requireFull.
const B_FILES = [
  'api/state.js', 'api/_registry-handler.js', 'api/_agency-memory-handler.js',
  'api/_buffer.js', 'api/_heygen.js', 'api/_higgsfield.js', 'api/_openai-image.js',
  'api/_site_audit.js', 'api/_site_publish.js', 'api/_trading.js', 'api/_transcribe.js', 'api/_twilio_call.js',
];
const A_FILES = [
  'api/sales.js', 'api/_sales.js', 'api/ms-oauth.js', 'api/parse-file.js', 'api/auth/[action].js',
  'api/_send-email.js', 'api/_integrations-status.js', 'api/_sales_send_worker.js', 'api/_ped_stats.js',
  'api/integrations/[service].js', 'api/admin/[action].js', 'api/workspace.js', 'api/agency-memory.js',
];
test('source: every (B) handler calls requireFull, no (A) file does', () => {
  for (const f of B_FILES) assert.match(fs.readFileSync(f, 'utf8'), /requireFull\(/, f + ' must call requireFull');
  for (const f of A_FILES) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /requireFull\(/, f + ' must stay open to CRM-only accounts');
});

test('chat: CRM-only accounts are limited to the roles the CRM pages use', () => {
  const src = fs.readFileSync('api/chat.js', 'utf8');
  const roles = /CRM_ONLY_ROLES = new Set\(\[([^\]]*)\]/.exec(src)[1].match(/"[^"]+"/g).map((s) => s.slice(1, -1)).sort();
  assert.deepEqual(roles, ['comm-crm-manager', 'comm-email-outreach', 'crm-copilot', 'radix-director', 'radix-guide']);
  assert.match(src, /accessOf\(req\.user\) === "crm"/);
  // every role that a sales/*.js script sends to /api/chat is allowed
  const used = new Set();
  for (const f of fs.readdirSync('sales').filter((n) => n.endsWith('.js'))) {
    const t = fs.readFileSync(path.join('sales', f), 'utf8');
    if (!t.includes('/api/chat')) continue;
    for (const m of t.matchAll(/role:'((?:crm|comm)-[a-z-]+)'/g)) used.add(m[1]);
  }
  assert.ok(used.size >= 3);
  for (const u of used) assert.ok(roles.includes(u), u);
});
