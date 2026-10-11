// GET /api/auth/me — returns the logged-in user (from the session cookie), or 401.
// Used by the frontend on page load to decide whether to show the login form or the app.
const { getSessionUser } = require('../_auth');

module.exports = async (req, res) => {
  // Dedicated Agency memory action shares an existing function to respect Vercel Hobby's 12-function limit.
  if (req.query && req.query.agencyMemory === '1') return require('../_agency-memory-handler')(req, res);
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Non autenticato' });
    return;
  }
  res.status(200).json({ user: { id: user.uid, email: user.email, name: user.name } });
};
