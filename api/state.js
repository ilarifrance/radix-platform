// GET/POST /api/state — the shared team workspace state (history + pipeline), replacing what used
// to live only in each browser's localStorage. Protected by the session cookie (real login).
//
// Deliberately a SINGLE shared row, not one per user: the goal is one common dataset the whole team
// sees (shared visibility), with accounts providing author attribution on top of it — not private
// per-user state. See README for the "last write wins" concurrency note this implies.
const { sql } = require('./_db');
const { getSessionUser } = require('./_auth');

module.exports = async (req, res) => {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Sessione mancante o scaduta. Rifai il login.' });
    return;
  }

  const client = sql();

  if (req.method === 'GET') {
    try {
      const rows = await client`SELECT data, updated_at, updated_by FROM workspace_state WHERE id = 1`;
      const row = rows[0];
      res.status(200).json({
        state: row ? row.data : null,
        updatedAt: row ? row.updated_at : null,
        updatedBy: row ? row.updated_by : null,
      });
    } catch (err) {
      res.status(500).json({
        error:
          'Errore database: ' +
          (err && err.message ? err.message : String(err)) +
          ' — se il database non è ancora stato inizializzato, esegui prima la migrazione dalla pagina admin.',
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
    const { state } = body || {};
    if (state === undefined) {
      res.status(400).json({ error: "Manca 'state' nel corpo della richiesta." });
      return;
    }

    try {
      const rows = await client`
        UPDATE workspace_state
        SET data = ${JSON.stringify(state)}::jsonb, updated_at = now(), updated_by = ${user.name || user.email}
        WHERE id = 1
        RETURNING updated_at
      `;
      res.status(200).json({ ok: true, updatedAt: rows[0] ? rows[0].updated_at : null });
    } catch (err) {
      res.status(500).json({ error: 'Errore database: ' + (err && err.message ? err.message : String(err)) });
    }
    return;
  }

  res.status(405).json({ error: 'Usa GET o POST' });
};
