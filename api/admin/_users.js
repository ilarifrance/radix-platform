// GET/POST /api/admin/users — list or create user accounts. Protected by the x-admin-secret header.
// POST with an email that already exists resets that user's name/password (upsert) — a deliberate
// convenience so the admin page can also be used to reset a forgotten password.
const { sql } = require('../_db');
const { isAdminRequest, hashPassword } = require('../_auth');

// 42703 = undefined_column: users.access is not migrated yet (migrations/core/002_users_access.sql).
const isMissingColumn = (err) => !!err && err.code === '42703';

module.exports = async (req, res) => {
  if (!isAdminRequest(req)) {
    res.status(401).json({ error: 'Admin secret mancante o errato.' });
    return;
  }

  const client = sql();

  if (req.method === 'GET') {
    try {
      let rows;
      try {
        rows = await client`SELECT id, email, name, access, created_at FROM users ORDER BY created_at ASC`;
      } catch (err) {
        if (!isMissingColumn(err)) throw err;
        rows = (await client`SELECT id, email, name, created_at FROM users ORDER BY created_at ASC`).map((u) => ({ ...u, access: 'full' }));
      }
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
    const accessRaw = body && body.access;

    if (!email || !name || !password) {
      res.status(400).json({ error: 'Email, nome e password sono obbligatori.' });
      return;
    }
    if (String(password).length < 8) {
      res.status(400).json({ error: 'La password deve avere almeno 8 caratteri.' });
      return;
    }

    if (accessRaw !== undefined && accessRaw !== null && accessRaw !== '' && accessRaw !== 'full' && accessRaw !== 'crm') {
      res.status(400).json({ error: "Accesso non valido: usa 'full' o 'crm'." });
      return;
    }
    const access = accessRaw === 'full' || accessRaw === 'crm' ? accessRaw : null;

    const normalizedEmail = String(email).trim().toLowerCase();
    const passwordHash = hashPassword(password);

    try {
      let rows;
      try {
        // access omitted: new accounts get the column default ('full'), existing ones keep their level.
        rows = await client`
          INSERT INTO users (email, name, password_hash, access)
          VALUES (${normalizedEmail}, ${String(name).trim()}, ${passwordHash}, ${access || 'full'})
          ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash,
            access = CASE WHEN ${access}::text IS NULL THEN users.access ELSE ${access}::text END
          RETURNING id, email, name, access, created_at
        `;
      } catch (err) {
        if (!isMissingColumn(err)) throw err;
        if (access === 'crm') {
          res.status(409).json({ error: 'Applica prima la migrazione users.access (migrations/core/002_users_access.sql).' });
          return;
        }
        rows = await client`
          INSERT INTO users (email, name, password_hash)
          VALUES (${normalizedEmail}, ${String(name).trim()}, ${passwordHash})
          ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash
          RETURNING id, email, name, created_at
        `;
        rows = rows.map((u) => ({ ...u, access: 'full' }));
      }
      res.status(200).json({ ok: true, user: rows[0] });
    } catch (err) {
      res.status(500).json({ error: 'Errore database: ' + (err && err.message ? err.message : String(err)) });
    }
    return;
  }

  res.status(405).json({ error: 'Usa GET o POST' });
};
