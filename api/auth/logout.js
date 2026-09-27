// POST /api/auth/logout — clears the session cookie. No body required.
const { buildClearCookie } = require('../_auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Usa POST' });
    return;
  }
  res.setHeader('Set-Cookie', buildClearCookie());
  res.status(200).json({ ok: true });
};
