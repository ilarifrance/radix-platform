#!/usr/bin/env node
'use strict';
/* «Sales Orbis»: the product's own, empty database. Prints SQL, never connects and never reads a secret from the command line,
   so nothing runs until someone pipes it into the database Francesco approved:
     node tools/sales-orbis/db.js schema | psql "$SALES_ORBIS_DATABASE_URL"
     SALES_ORBIS_OWNER_PASSWORD=… node tools/sales-orbis/db.js owner --email a@b.it --name "Nome" --workspace "Azienda" | psql "$SALES_ORBIS_DATABASE_URL"
   schema: the accounts table (as api/admin/_migrate.js makes it) and the CRM migrations (migrations/sales, in order), nothing of
   RADIX (no team state, registry, memory, accounting). Once, on an empty database: migration 001 is not repeatable.
   owner: the first account, its workspace and the owner membership; the workspace starts empty (no records, no pipeline: the
   CRM's own onboarding builds it). The password comes only from SALES_ORBIS_OWNER_PASSWORD. See docs/sales-orbis.md. */
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const ROOT = path.join(__dirname, '..', '..');
const USERS = `CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);`;
function migrations() {
  const dir = path.join(ROOT, 'migrations', 'sales');
  return fs.readdirSync(dir).filter(f => /^\d{3}_[a-z0-9_]+\.sql$/.test(f)).sort().map(f => ({ file: 'migrations/sales/' + f, sql: fs.readFileSync(path.join(dir, f), 'utf8') }));
}
function schema() {
  return ['-- Sales Orbis: CRM-only schema (tools/sales-orbis/db.js schema). Apply only to the Sales Orbis database.', USERS,
    ...migrations().map(m => '-- ' + m.file + '\n' + m.sql.trim())].join('\n\n') + '\n';
}
const lit = s => "'" + String(s).replace(/'/g, "''") + "'";
function owner({ email, name, workspace, password, id = crypto.randomUUID() }) {
  const e = String(email || '').trim().toLowerCase(), n = String(name || '').trim(), w = String(workspace || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 254) throw new Error('Email non valida.');
  if (!n || n.length > 200) throw new Error('Nome: da 1 a 200 caratteri.');
  if (!w || w.length > 200) throw new Error('Nome del workspace: da 1 a 200 caratteri.');
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) throw new Error('Password: da 8 a 200 caratteri, in SALES_ORBIS_OWNER_PASSWORD.');
  const { hashPassword } = require(path.join(ROOT, 'api', '_auth.js'));
  return ['-- Sales Orbis: first owner and empty workspace (tools/sales-orbis/db.js owner).', 'BEGIN;',
    `INSERT INTO users (email, name, password_hash) VALUES (${lit(e)}, ${lit(n)}, ${lit(hashPassword(password))}) ON CONFLICT (email) DO NOTHING;`,
    `INSERT INTO sales_workspaces (id, name) VALUES (${lit(id)}, ${lit(w)});`,
    `INSERT INTO sales_memberships (workspace_id, user_id, role) SELECT ${lit(id)}, id, 'owner' FROM users WHERE email = ${lit(e)};`,
    'COMMIT;'].join('\n') + '\n';
}
// The plan of a workspace (api/_sales_plan.js): prova, base or completo. Set by whoever sells it, never by the customer.
function plan({ workspace, plan: p }) {
  const { PLANS } = require(path.join(ROOT, 'api', '_sales_plan.js'));
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(workspace || ''))) throw new Error('Workspace: l’id (uuid) del workspace.');
  if (!PLANS.includes(p)) throw new Error('Piano: ' + PLANS.join(', ') + '.');
  return `-- Sales Orbis: plan of a workspace (tools/sales-orbis/db.js plan).\nUPDATE sales_workspaces SET plan = ${lit(p)} WHERE id = ${lit(workspace)};\n`;
}
function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) { const m = /^--([a-z]+)$/.exec(argv[i]); if (m) out[m[1]] = argv[++i]; }
  return out;
}
if (require.main === module) {
  const [cmd, ...rest] = process.argv.slice(2);
  try {
    if (cmd === 'schema') process.stdout.write(schema());
    else if (cmd === 'owner') { const a = args(rest); process.stdout.write(owner({ ...a, password: process.env.SALES_ORBIS_OWNER_PASSWORD })); }
    else if (cmd === 'plan') process.stdout.write(plan(args(rest)));
    else { process.stderr.write('Uso: node tools/sales-orbis/db.js schema | owner --email … --name … --workspace … | plan --workspace <id> --plan prova|base|completo\n'); process.exit(2); }
  } catch (e) { process.stderr.write(e.message + '\n'); process.exit(1); }
}
module.exports = { USERS, migrations, schema, owner, plan };
