'use strict';
// One Vercel function for /api/auth/login, /api/auth/logout and /api/auth/me.
// Dynamic route: api/auth/[action].js. Existing public URLs are unchanged.
const { sql } = require('../_db');
const { verifyPassword, signSessionToken, buildSessionCookie, buildClearCookie, getSessionUser } = require('../_auth');

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

module.exports = async function authRoute(req, res) {
  const action = req.query && req.query.action;
  if (typeof action !== 'string' || !Object.hasOwn({ login: 1, logout: 1, me: 1 }, action)) {
    return res.status(404).json({ error: 'Endpoint non trovato' });
  }
  if (action === 'login') return login(req, res);
  if (action === 'logout') return logout(req, res);
  return me(req, res);
};
