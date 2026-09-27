// POST /api/admin/migrate — one-time (idempotent) schema setup. Protected by the x-admin-secret
// header (must match the ADMIN_SECRET env var). Safe to call more than once: every statement is
// IF NOT EXISTS / ON CONFLICT DO NOTHING, so re-running it never touches existing data.
const { sql } = require('../_db');
const { isAdminRequest } = require('../_auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Usa POST' });
    return;
  }
  if (!isAdminRequest(req)) {
    res.status(401).json({ error: 'Admin secret mancante o errato.' });
    return;
  }

  try {
    const client = sql();

    await client`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;

    // Single shared row (id fixed to 1): the whole team sees one common history/pipeline state,
    // not a private copy per user. Real accounts give author attribution, not private silos.
    await client`
      CREATE TABLE IF NOT EXISTS workspace_state (
        id INTEGER PRIMARY KEY DEFAULT 1,
        data JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by TEXT,
        CONSTRAINT workspace_state_singleton CHECK (id = 1)
      )
    `;

    await client`
      INSERT INTO workspace_state (id, data)
      VALUES (1, '{}'::jsonb)
      ON CONFLICT (id) DO NOTHING
    `;

    res.status(200).json({ ok: true, message: 'Schema creato/verificato: tabelle users e workspace_state pronte.' });
  } catch (err) {
    res.status(500).json({ error: 'Errore migrazione: ' + (err && err.message ? err.message : String(err)) });
  }
};
