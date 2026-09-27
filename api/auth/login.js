// POST /api/auth/login — { email, password } -> sets an httpOnly session cookie.
const { sql } = require('../_db');
const { verifyPassword, signSessionToken, buildSessionCookie } = require('../_auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Usa POST' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  const { email, password } = body || {};

  if (!email || !password) {
    res.status(400).json({ error: 'Email e password sono obbligatorie.' });
    return;
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  let rows;
  try {
    const client = sql();
    rows = await client`SELECT id, email, name, password_hash FROM users WHERE email = ${normalizedEmail} LIMIT 1`;
  } catch (err) {
    res.status(500).json({
      error:
        'Errore database: ' +
        (err && err.message ? err.message : String(err)) +
        ' — se il database non è ancora stato inizializzato, esegui prima la migrazione dalla pagina admin.',
    });
    return;
  }

  const user = rows[0];
  if (!user || !verifyPassword(password, user.password_hash)) {
    res.status(401).json({ error: 'Email o password errati.' });
    return;
  }

  const token = signSessionToken({ uid: user.id, email: user.email, name: user.name });
  res.setHeader('Set-Cookie', buildSessionCookie(token));
  res.status(200).json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
};
