#!/usr/bin/env node
'use strict';
/* «Sales Orbis» on this machine, with fake data only: the real pages and the real CRM API on an in-memory Postgres (PGlite),
   for screenshots and end-to-end checks (docs/sales-orbis.md). No network, no real database, no AI call, no email sent.
     npm i --no-save @electric-sql/pglite
     node tools/sales-orbis/demo-server.js [--port 8090] [--seed] [--plan prova|completo|avanzato|extreme]
   Open it as a product host, e.g. a browser started with --host-resolver-rules="MAP sales-orbis.test 127.0.0.1":
   http://sales-orbis.test:8090/ . Demo account: demo@example.com / password-demo (printed at start). */
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const ROOT = path.join(__dirname, '..', '..');
const DB = require('./db.js');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json; charset=utf-8', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const DEMO = { email: 'demo@example.com', name: 'Demo Sales Orbis', password: 'password-demo', workspace: 'Azienda Demo Srl' };

// The neon() tag of api/_db.js on top of PGlite: tagged template or (text, params), rows back.
function neonLike(db) {
  return async function sql(strings, ...values) {
    if (Array.isArray(strings) && strings.raw) { let text = ''; strings.forEach((s, i) => { text += s + (i < values.length ? '$' + (i + 1) : ''); }); return (await db.query(text, values)).rows; }
    return (await db.query(strings, values[0] || [])).rows;
  };
}

async function start({ port = 8090, seed = false, plan = '', log = console.log } = {}) {
  const { PGlite } = require('@electric-sql/pglite');
  const db = new PGlite();
  await db.exec(DB.schema());
  const ws = crypto.randomUUID();
  await db.exec(DB.owner({ ...DEMO, id: ws }));
  if (plan) await db.exec(DB.plan({ workspace: ws, plan }));
  process.env.JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(24).toString('hex');
  process.env.RADIX_PRODUCT = 'sales-orbis';
  // api/_db.js answers with the in-memory database.
  const dbPath = require.resolve(path.join(ROOT, 'api', '_db.js'));
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { sql: () => neonLike(db) } };
  const api = {
    sales: require(path.join(ROOT, 'api', 'sales.js')),
    auth: require(path.join(ROOT, 'api', 'auth', '[action].js')),
    chat: require(path.join(ROOT, 'api', 'chat.js')),
    integrations: require(path.join(ROOT, 'api', 'integrations', '[service].js')),
    state: require(path.join(ROOT, 'api', 'state.js')),
    workspace: require(path.join(ROOT, 'api', 'workspace.js'))
  };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
    res.status = c => { res.statusCode = c; return res; };
    res.json = b => { if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(b)); return res; };
    try {
      if (url.pathname.startsWith('/api/')) {
        const parts = url.pathname.slice(5).split('/');
        req.query = Object.fromEntries(url.searchParams);
        let raw = ''; for await (const c of req) raw += c;
        if (raw) { try { req.body = JSON.parse(raw); } catch { req.body = raw; } }
        if (parts[0] === 'auth') req.query.action = parts[1];
        if (parts[0] === 'integrations') req.query.service = parts[1];
        if (parts[0] === 'send-email') { req.query.service = 'send-email'; return api.integrations(req, res); }
        const h = api[parts[0]];
        if (!h) return res.status(404).json({ error: 'Endpoint non trovato' });
        return await h(req, res);
      }
      if (url.pathname === '/') { res.statusCode = 302; res.setHeader('Location', '/crm'); return res.end(); }
      let p = url.pathname === '/crm' ? '/radix-sales.html' : decodeURIComponent(url.pathname);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(ROOT, path.normalize(p));
      if (!file.startsWith(ROOT + path.sep) || /[/\\](node_modules|\.git)[/\\]/.test(file)) { res.statusCode = 404; return res.end(); }
      fs.readFile(file, (e, b) => {
        if (e) { res.statusCode = 404; return res.end('Not found'); }
        res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream'); res.end(b);
      });
    } catch (e) { if (!res.headersSent) res.status(500).json({ error: String(e && e.message || e) }); }
  });
  await new Promise(r => server.listen(port, r));
  if (seed) await require('./demo-seed.js').seed({ port, ...DEMO, workspace: ws });
  log('Sales Orbis demo: http://sales-orbis.test:' + port + '/  ·  ' + DEMO.email + ' / ' + DEMO.password);
  return { server, db, port, workspace: ws, demo: DEMO, close: async () => { server.close(); await db.close(); } };
}
if (require.main === module) {
  const a = process.argv.slice(2), i = a.indexOf('--port');
  const j = a.indexOf('--plan');
  start({ port: i >= 0 ? Number(a[i + 1]) : 8090, seed: a.includes('--seed'), plan: j >= 0 ? a[j + 1] : '' }).catch(e => { console.error(e.message); process.exit(1); });
}
module.exports = { start, neonLike, DEMO };
