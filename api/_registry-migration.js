// Explicit, admin-only registry migration (POST /api/admin/migrate?registry=1). Idempotent.
const { sql } = require('./_db');
const { isAdminRequest } = require('./_auth');
const { SCHEMA } = require('./_registry-core');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST' });
  if (!isAdminRequest(req)) return res.status(401).json({ error: 'Autorizzazione admin richiesta' });
  try {
    const db = sql();
    for (const statement of SCHEMA) await db(statement);
    res.status(200).json({ ok: true, message: 'Registro RADIX verificato: clienti, progetti, documenti, approvazioni, attività' });
  } catch (e) {
    res.status(500).json({ error: 'Migrazione registro non riuscita' });
  }
};
