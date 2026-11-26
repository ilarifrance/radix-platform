'use strict';
// One Vercel function for /api/auth/login, /api/auth/logout, /api/auth/me, /api/auth/password and the «password
// dimenticata» pair /api/auth/forgot + /api/auth/reset. Dynamic route: api/auth/[action].js. Existing public URLs are unchanged.
// Limits on failed sign-ins and the reset link: api/_auth_guard.js.
const { sql } = require('../_db');
const { hashPassword, verifyPassword, signSessionToken, buildSessionCookie, buildClearCookie, getSessionUser } = require('../_auth');
const guard = require('../_auth_guard');
const { isProductRequest } = require('../_product');

const TOO_MANY = 'Troppi tentativi di accesso: riprova tra 15 minuti.';
const FAILED = 'Accesso non riuscito: riprova tra poco.';
function bodyOf(req) {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  return body && typeof body === 'object' ? body : {};
}
// Accounts created by the accounting sign-up (/contabilita/) are clients: never a team session, never a team reset.
// Databases without the accounting tables have no client accounts.
async function isClientAccount(client, userId) {
  try { return (await client`SELECT 1 FROM acc_client_accounts WHERE user_id = ${userId} LIMIT 1`).length > 0; }
  catch (err) { if (err && err.code === '42P01') return false; throw err; }
}

async function login(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST' });
  const { email, password } = bodyOf(req);
  if (!email || !password) return res.status(400).json({ error: 'Email e password sono obbligatorie.' });
  const normalizedEmail = String(email).trim().toLowerCase();
  const ip = guard.ipOf(req);
  let user;
  try {
    const client = sql();
    if (!(await guard.allowed(client, 'login', normalizedEmail, ip))) return res.status(429).json({ error: TOO_MANY });
    user = (await client`SELECT id, email, name, password_hash FROM users WHERE email = ${normalizedEmail} LIMIT 1`)[0];
    if (!user || !verifyPassword(password, user.password_hash) || await isClientAccount(client, user.id)) {
      await guard.record(client, 'login', normalizedEmail, ip);
      return res.status(401).json({ error: 'Email o password errati.' });
    }
    await guard.clear(client, 'login', normalizedEmail);
  } catch (err) {
    // The details stay in the server log: the person signing in only learns that it did not work.
    console.error('auth/login', err && err.code, err && err.message);
    return res.status(500).json({ error: FAILED });
  }
  const token = signSessionToken({ uid: user.id, email: user.email, name: user.name });
  res.setHeader('Set-Cookie', buildSessionCookie(token));
  return res.status(200).json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
}

// «Password dimenticata»: the same answer whether the email has an account or not; the link goes by email only.
const SENT = 'Se l’email è registrata, ti abbiamo inviato un link per scegliere una nuova password.';
const NOT_ACTIVE = 'Il recupero della password non è ancora attivo: chiedi all’amministratore del tuo workspace.';
async function forgot(req, res, { env = process.env, createTransport } = {}) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST' });
  const mail = guard.mailer(env, createTransport);
  if (!mail) return res.status(503).json({ error: NOT_ACTIVE });
  const email = String(bodyOf(req).email || '').trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Scrivi la tua email.' });
  const ip = guard.ipOf(req);
  try {
    const client = sql();
    if (!(await guard.allowed(client, 'forgot', email, ip))) return res.status(200).json({ ok: true, message: SENT });
    await guard.record(client, 'forgot', email, ip);
    const user = (await client`SELECT id, email, name, password_hash FROM users WHERE email = ${email} LIMIT 1`)[0];
    if (user && !(await isClientAccount(client, user.id))) {
      const lang = String((req.headers || {})['x-radix-lang'] || '') === 'en' ? 'en' : 'it';
      const msg = guard.resetEmail({ base: mail.base, to: user.email, name: user.name, token: guard.resetToken(user, env.JWT_SECRET), lang,
        product: isProductRequest(req, env) ? 'Sales Orbis' : 'RADIX' });
      await mail.send(msg).catch(err => console.error('auth/forgot mail', err && err.message));
    }
  } catch (err) {
    console.error('auth/forgot', err && err.code, err && err.message);
    return res.status(500).json({ error: FAILED });
  }
  return res.status(200).json({ ok: true, message: SENT });
}

function newPasswordProblem(body) {
  const { password, confirm } = body || {};
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) return 'La nuova password deve avere almeno ' + PASSWORD_MIN + ' caratteri.';
  if (password.length > PASSWORD_MAX) return 'La nuova password può avere al massimo ' + PASSWORD_MAX + ' caratteri.';
  if (confirm !== undefined && confirm !== password) return 'Le due nuove password non coincidono.';
  return '';
}
const EXPIRED = 'Link scaduto o già usato: chiedi un nuovo link.';
async function reset(req, res, { env = process.env } = {}) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST' });
  const body = bodyOf(req);
  const claims = guard.readResetToken(body.token, env.JWT_SECRET);
  if (!claims) return res.status(400).json({ error: EXPIRED });
  const problem = newPasswordProblem(body);
  if (problem) return res.status(400).json({ error: problem });
  try {
    const client = sql();
    const user = (await client`SELECT id, email, password_hash FROM users WHERE id = ${claims.uid} LIMIT 1`)[0];
    if (!guard.tokenMatches(claims, user) || await isClientAccount(client, user.id)) return res.status(400).json({ error: EXPIRED });
    // Only if the hash is still the one the link was made for: two clicks on the same link change the password once.
    const done = await client`UPDATE users SET password_hash = ${hashPassword(body.password)} WHERE id = ${user.id} AND password_hash = ${user.password_hash} RETURNING id`;
    if (!done.length) return res.status(400).json({ error: EXPIRED });
    await guard.clear(client, 'login', user.email);
  } catch (err) {
    console.error('auth/reset', err && err.code, err && err.message);
    return res.status(500).json({ error: 'Password non aggiornata: riprova tra poco.' });
  }
  return res.status(200).json({ ok: true, message: 'Password aggiornata: accedi con la nuova password.' });
}

async function logout(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST' });
  res.setHeader('Set-Cookie', buildClearCookie());
  return res.status(200).json({ ok: true });
}

async function me(req, res) {
  // Keep original behavior, including authentication check and response format.
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Non autenticato' });
  return res.status(200).json({ user: { id: user.uid, email: user.email, name: user.name } });
}

// «Cambia password» (impostazioni.html › Profilo). Same length rule as shell/settings-core.js (passwordProblem).
const PASSWORD_MIN = 8, PASSWORD_MAX = 200;
function passwordProblem(body) {
  const { current, password, confirm } = body || {};
  if (typeof current !== 'string' || !current) return 'Scrivi la password attuale.';
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) return 'La nuova password deve avere almeno ' + PASSWORD_MIN + ' caratteri.';
  if (password.length > PASSWORD_MAX) return 'La nuova password può avere al massimo ' + PASSWORD_MAX + ' caratteri.';
  if (confirm !== undefined && confirm !== password) return 'Le due nuove password non coincidono.';
  if (password === current) return 'La nuova password è uguale a quella attuale.';
  return '';
}
async function password(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST' });
  const user = getSessionUser(req);
  if (!user || user.uid == null) return res.status(401).json({ error: 'Non autenticato' });
  // A custom header a cross-site form cannot send (same guard as x-radix-sales on /api/sales).
  const h = req.headers || {};
  if (h['x-radix-settings'] !== '1') return res.status(400).json({ error: 'Richiesta non valida.' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const problem = passwordProblem(body);
  if (problem) return res.status(400).json({ error: problem });
  let row;
  try {
    const client = sql();
    row = (await client`SELECT id, password_hash FROM users WHERE id = ${user.uid} LIMIT 1`)[0];
    if (!row) return res.status(401).json({ error: 'Account non trovato: accedi di nuovo.' });
    if (!verifyPassword(body.current, row.password_hash)) return res.status(400).json({ error: 'La password attuale non è corretta.' });
    await client`UPDATE users SET password_hash = ${hashPassword(body.password)} WHERE id = ${row.id}`;
  } catch (err) {
    return res.status(500).json({ error: 'Password non aggiornata: errore del database.' });
  }
  return res.status(200).json({ ok: true });
}

const ACTIONS = { login, logout, me, password, forgot, reset };
module.exports = async function authRoute(req, res) {
  const action = req.query && req.query.action;
  if (typeof action !== 'string' || !Object.hasOwn(ACTIONS, action)) {
    return res.status(404).json({ error: 'Endpoint non trovato' });
  }
  return ACTIONS[action](req, res);
};
module.exports.passwordProblem = passwordProblem;
module.exports.newPasswordProblem = newPasswordProblem;
module.exports.forgot = forgot;
module.exports.reset = reset;
