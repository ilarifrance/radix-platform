'use strict';
/* Sign-in protection for /api/auth (api/auth/[action].js), pure where it can be, for the tests:
   - limit(): too many failed sign-ins for one email (8 in 15 minutes) or one address (30 in 15 minutes) answer 429; too many
     «password dimenticata» requests (3 an hour per email, 10 per address) are dropped. The attempts live in auth_attempts
     (migrations/sales/022); a database without that table has no limit (it answers as before).
   - resetToken() / readResetToken(): the link of «password dimenticata». Signed with its own key (JWT_SECRET + purpose, so it
     is never a session), valid 30 minutes and once only: it carries a fingerprint of the current password hash, which changes
     as soon as the password is reset.
   - mailer(): the email with the link, through the product's own SMTP box (AUTH_SMTP_*, AUTH_MAIL_FROM) and the product's
     public address (PUBLIC_URL). Without them the recovery is «not active» and nothing is sent. */
const crypto = require('crypto');

const RULES = Object.freeze({
  login: { email: 8, ip: 30, minutes: 15 },
  forgot: { email: 3, ip: 10, minutes: 60 }
});
const RESET_MINUTES = 30;

function ipOf(req) {
  const h = (req && req.headers) || {};
  return String(h['x-forwarded-for'] || h['x-real-ip'] || (req && req.socket && req.socket.remoteAddress) || '').split(',')[0].trim().slice(0, 64) || '?';
}
function keys(kind, email, ip) { return { email: kind + ':' + String(email || '').toLowerCase(), ip: kind + '-ip:' + ip }; }

// true when the request may go on. A missing table (42P01) means no limit; any other database error goes up.
async function allowed(client, kind, email, ip) {
  const r = RULES[kind], k = keys(kind, email, ip);
  try {
    const rows = await client`SELECT
      count(*) FILTER (WHERE key = ${k.email})::int AS by_email,
      count(*) FILTER (WHERE key = ${k.ip})::int AS by_ip
      FROM auth_attempts WHERE key IN (${k.email}, ${k.ip}) AND at > now() - make_interval(mins => ${r.minutes})`;
    const row = rows[0] || {};
    return Number(row.by_email || 0) < r.email && Number(row.by_ip || 0) < r.ip;
  } catch (err) {
    if (err && err.code === '42P01') return true;
    throw err;
  }
}
async function record(client, kind, email, ip) {
  const k = keys(kind, email, ip);
  try {
    await client`INSERT INTO auth_attempts (key) VALUES (${k.email}), (${k.ip})`;
    await client`DELETE FROM auth_attempts WHERE key IN (${k.email}, ${k.ip}) AND at < now() - interval '1 day'`;
  } catch (err) { if (!err || err.code !== '42P01') throw err; }
}
async function clear(client, kind, email) {
  try { await client`DELETE FROM auth_attempts WHERE key = ${keys(kind, email, '').email}`; }
  catch (err) { if (!err || err.code !== '42P01') throw err; }
}

// ---- the reset link ----
function resetKey(secret) { return crypto.createHmac('sha256', String(secret)).update('radix-password-reset-v1').digest(); }
function fingerprint(hash) { return crypto.createHash('sha256').update(String(hash || '')).digest('base64url').slice(0, 22); }
function resetToken(user, secret, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ p: 'reset', uid: user.id, f: fingerprint(user.password_hash), exp: Math.floor(now / 1000) + RESET_MINUTES * 60 })).toString('base64url');
  return body + '.' + crypto.createHmac('sha256', resetKey(secret)).update(body).digest('base64url');
}
// The claims of a well-signed, unexpired reset token, or null. The fingerprint is checked against the user row afterwards.
function readResetToken(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 600 || !/^[\w-]+\.[\w-]+$/.test(token)) return null;
  const [body, sig] = token.split('.');
  const want = crypto.createHmac('sha256', resetKey(secret)).update(body).digest();
  let got; try { got = Buffer.from(sig, 'base64url'); } catch { return null; }
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  let c; try { c = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  if (!c || c.p !== 'reset' || c.uid == null || typeof c.f !== 'string' || !(c.exp > now / 1000)) return null;
  return c;
}
function tokenMatches(claims, user) { return !!(claims && user && String(claims.uid) === String(user.id) && claims.f === fingerprint(user.password_hash)); }

// ---- the email ----
function mailConfig(env) {
  const e = env || {};
  const base = String(e.PUBLIC_URL || '').replace(/\/+$/, '');
  if (!/^https:\/\/[^/\s]+$/.test(base) || !e.AUTH_SMTP_HOST || !e.AUTH_SMTP_USER || !e.AUTH_SMTP_PASS || !e.AUTH_MAIL_FROM) return null;
  return { base, from: e.AUTH_MAIL_FROM, transport: { host: e.AUTH_SMTP_HOST, port: Number(e.AUTH_SMTP_PORT) || 465,
    secure: (Number(e.AUTH_SMTP_PORT) || 465) === 465, auth: { user: e.AUTH_SMTP_USER, pass: e.AUTH_SMTP_PASS } } };
}
function resetEmail({ base, to, name, token, lang, product }) {
  const brand = product || 'Sales Orbis';
  const link = base + '/crm#reset=' + token;
  if (lang === 'en') return { to, subject: brand + ' · Reset your password',
    text: 'Hello' + (name ? ' ' + name : '') + ',\n\nto choose a new password for ' + brand + ' open this link within ' + RESET_MINUTES + ' minutes:\n' + link +
      '\n\nIf you did not ask for it, ignore this email: your password stays the same.' };
  return { to, subject: brand + ' · Nuova password',
    text: 'Ciao' + (name ? ' ' + name : '') + ',\n\nper scegliere una nuova password di ' + brand + ' apri questo link entro ' + RESET_MINUTES + ' minuti:\n' + link +
      '\n\nSe non l’hai chiesta tu, ignora questa email: la password resta quella di prima.' };
}
function mailer(env, createTransport) {
  const cfg = mailConfig(env);
  if (!cfg) return null;
  const make = createTransport || (o => require('nodemailer').createTransport(o));
  return { base: cfg.base, send: msg => make(cfg.transport).sendMail({ from: cfg.from, ...msg }) };
}

module.exports = { RULES, RESET_MINUTES, ipOf, keys, allowed, record, clear, resetToken, readResetToken, tokenMatches, fingerprint, mailConfig, resetEmail, mailer };
