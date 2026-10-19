'use strict';
// One function, preserving /api/admin/users and /api/admin/migrate.
// Handlers retain their existing admin authentication and method checks.
module.exports = async function adminRoute(req, res) {
  const action = req.query && req.query.action;
  if (action === 'users') return require('./_users')(req, res);
  if (action === 'migrate') return require('./_migrate')(req, res);
  return res.status(404).json({ error: 'Endpoint non trovato' });
};
