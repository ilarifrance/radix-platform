// Password hashing + session tokens, using only Node's built-in `crypto`
// (no bcrypt / jsonwebtoken dependency).
//
// Password storage: scrypt with a random salt per user, stored as
// "saltHex:hashHex" in the `users.password_hash` column.
//
// Sessions: a compact, HMAC-SHA256-signed token carried in an httpOnly
// cookie. The token is NOT encrypted — it just proves the server issued it
// and hasn't been tampered with — so only put non-secret identifiers
// (user id, email, name, expiry) in the payload.

const crypto = require('crypto');

const SESSION_COOKIE = 'radix_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set in the environment.');
  }
  return secret;
}

// ---------- password hashing ----------

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, hashHex] = stored.split(':');
  const hash = crypto.scryptSync(String(password), salt, 64);
  const storedHash = Buffer.from(hashHex, 'hex');
  if (hash.length !== storedHash.length) return false;
  return crypto.timingSafeEqual(hash, storedHash);
}

// ---------- base64url helpers ----------

function b64urlEncode(input) {
  return Buffer.from(input).toString('base64url');
}

function b64urlDecode(input) {
  return Buffer.from(input, 'base64url').toString('utf8');
}

// ---------- session tokens ----------

function signSessionToken(payload) {
  const secret = getJwtSecret();
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS };
  const encodedBody = b64urlEncode(JSON.stringify(body));
  const signature = crypto.createHmac('sha256', secret).update(encodedBody).digest('base64url');
  return `${encodedBody}.${signature}`;
}

function verifySessionToken(token) {
  try {
    const secret = getJwtSecret();
    if (!token || typeof token !== 'string' || !token.includes('.')) return null;
    const [encodedBody, signature] = token.split('.');
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(encodedBody)
      .digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    const payload = JSON.parse(b64urlDecode(encodedBody));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

// ---------- cookie helpers ----------

function parseCookies(req) {
  const header = req.headers && req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  });
  return out;
}

function buildSessionCookie(token) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ];
  if (process.env.VERCEL) parts.push('Secure');
  return parts.join('; ');
}

function buildClearCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function getSessionUser(req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  return verifySessionToken(token);
}

// ---------- admin secret ----------

function isAdminRequest(req) {
  const provided = req.headers['x-admin-secret'];
  const expected = process.env.ADMIN_SECRET;
  if (!expected || !provided) return false;
  const providedBuf = Buffer.from(String(provided));
  const expectedBuf = Buffer.from(String(expected));
  if (providedBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

module.exports = {
  hashPassword,
  verifyPassword,
  signSessionToken,
  verifySessionToken,
  parseCookies,
  buildSessionCookie,
  buildClearCookie,
  getSessionUser,
  isAdminRequest,
};
