// GET/POST /api/admin/users — list or create user accounts. Protected by the x-admin-secret header.
// POST with an email that already exists resets that user's name/password (upsert) — a deliberate
// convenience so the admin page can also be used to reset a forgotten password.
const { sql } = require('../_db');
const { isAdminRequest, hashPassword } = require('../_auth');

module.exports = async (req, res) => {
  if (!isAdminRequest(req)) {
    res.status(401).json({ error: 'Admin secret mancante o errato.' });
    return;
  }

  const client = sql();

  if (req.method === 'GET') {
    try {
      const rows = await client`SELECT id, email, name, created_at FROM users ORDER BY created_at ASC`;
      res.status(200).json({ users: rows });
    } catch (err) {
      res.status(500).json({
        error:
          'Errore database: ' +
          (err && err.message ? err.message : String(err)) +
          ' — se il database non è ancora stato inizializzato, esegui prima la migrazione.',
      });
    }
    return;
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }
    const { email, name, password } = body || {};

    if (!email || !name || !password) {
      res.status(400).json({ error: 'Email, nome e password sono obbligatori.' });
      return;
    }
    if (String(password).length < 8) {
      res.status(400).json({ error: 'La password deve avere almeno 8 caratteri.' });
      return;
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const passwordHash = hashPassword(password);

    try {
      const rows = await client`
        INSERT INTO users (email, name, password_hash)
        VALUES (${normalizedEmail}, ${String(name).trim()}, ${passwordHash})
        ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash
        RETURNING id, email, name, created_at
      `;
      res.status(200).json({ ok: true, user: rows[0] });
    } catch (err) {
      res.status(500).json({ error: 'Errore database: ' + (err && err.message ? err.message : String(err)) });
    }
    return;
  }

  res.status(405).json({ error: 'Usa GET o POST' });
};
