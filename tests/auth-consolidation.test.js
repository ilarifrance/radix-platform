'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

function loadHandler({ users = [], session = null } = {}) {
  const filename = path.resolve(__dirname, '../api/auth/[action].js');
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (parent && parent.filename === filename && request === '../_db') {
      return { sql: () => async (parts, ...values) => users.filter(u => u.email === values[0]) };
    }
    if (parent && parent.filename === filename && request === '../_auth') {
      return {
        verifyPassword: (password, stored) => password === stored,
        signSessionToken: user => 'token-' + user.uid,
        buildSessionCookie: token => 'radix_session=' + token + '; HttpOnly',
        buildClearCookie: () => 'radix_session=; Max-Age=0; HttpOnly',
        getSessionUser: () => session,
      };
    }
    return originalLoad.apply(this, arguments);
  };
  try { delete require.cache[filename]; return require(filename); }
  finally { Module._load = originalLoad; }
}
function res() {
  return {
    code: 200, headers: {}, data: null,
    status(n) { this.code = n; return this; },
    setHeader(k, v) { this.headers[k] = v; },
    json(v) { this.data = v; return this; },
  };
}
test('login: valid credentials and cookie', async () => {
  const handler = loadHandler({ users: [{ id: 9, email: 'a@b.test', name: 'A', password_hash: 'secret' }] });
  const reply = res();
  await handler({ method: 'POST', query: { action: 'login' }, body: { email: 'A@B.TEST', password: 'secret' } }, reply);
  assert.equal(reply.code, 200);
  assert.match(reply.headers['Set-Cookie'], /HttpOnly/);
  assert.equal(reply.data.user.id, 9);
  assert.equal(reply.data.user.password_hash, undefined);
});
test('login: reject wrong password', async () => {
  const reply = res();
  await loadHandler({ users: [{ id: 9, email: 'a@b.test', password_hash: 'secret' }] })({ method: 'POST', query: { action: 'login' }, body: { email: 'a@b.test', password: 'wrong' } }, reply);
  assert.equal(reply.code, 401);
  assert.equal(reply.headers['Set-Cookie'], undefined);
});
test('logout: clear cookie, reject GET', async () => {
  const handler = loadHandler();
  const reply = res();
  await handler({ method: 'POST', query: { action: 'logout' } }, reply);
  assert.equal(reply.code, 200);
  assert.match(reply.headers['Set-Cookie'], /Max-Age=0/);
  const denied = res();
  await handler({ method: 'GET', query: { action: 'logout' } }, denied);
  assert.equal(denied.code, 405);
});
test('me: authenticated and unauthenticated', async () => {
  const handler = loadHandler({ session: { uid: 1, email: 'a@b.test', name: 'A' } });
  const reply = res();
  await handler({ method: 'GET', query: { action: 'me' } }, reply);
  assert.deepEqual(reply.data, { user: { id: 1, email: 'a@b.test', name: 'A' } });
  const denied = res();
  await loadHandler()({ method: 'GET', query: { action: 'me' } }, denied);
  assert.equal(denied.code, 401);
});
test('unknown action: 404', async () => {
  const reply = res();
  await loadHandler()({ method: 'GET', query: { action: 'other' } }, reply);
  assert.equal(reply.code, 404);
});
