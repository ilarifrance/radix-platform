'use strict';
// One Vercel function for /api/auth/login, /api/auth/logout, /api/auth/me and /api/auth/password.
// Dynamic route: api/auth/[action].js. Existing public URLs are unchanged.
const { sql } = require('../_db');
const { hashPassword, verifyPassword, signSessionToken, buildSessionCookie, buildClearCookie, getSessionUser } = require('../_auth');

async function login(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST' });
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { email, password } = body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email e password sono obbligatorie.' });
  const normalizedEmail = String(email).trim().toLowerCase();
  let rows;
  try {
    const client = sql();
    rows = await client`SELECT id, email, name, password_hash FROM users WHERE email = ${normalizedEmail} LIMIT 1`;
  } catch (err) {
    return res.status(500).json({
      error: 'Errore database: ' + (err && err.message ? err.message : String(err)) +
        ' — se il database non è ancora stato inizializzato, esegui prima la migrazione dalla pagina admin.',
    });
  }
  const user = rows[0];
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Email o password errati.' });
  }
  const token = signSessionToken({ uid: user.id, email: user.email, name: user.name });
  res.setHeader('Set-Cookie', buildSessionCookie(token));
  return res.status(200).json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
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

const ACTIONS = { login, logout, me, password };
module.exports = async function authRoute(req, res) {
  const action = req.query && req.query.action;
  if (typeof action !== 'string' || !Object.hasOwn(ACTIONS, action)) {
    return res.status(404).json({ error: 'Endpoint non trovato' });
  }
  return ACTIONS[action](req, res);
};
module.exports.passwordProblem = passwordProblem;
