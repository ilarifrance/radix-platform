'use strict';
// Single serverless entrypoint for authenticated external provider integrations.
// The original public URLs remain unchanged through the exact Vercel rewrites.
// Provider handlers retain their existing auth, method and explicit-confirmation checks.
const handlers = Object.freeze({
  'buffer': '../_buffer',
  'heygen': '../_heygen',
  'openai-image': '../_openai-image',
  'send-email': '../_send-email'
});
module.exports = async function integrationRoute(req, res) {
  const service = req.query && req.query.service;
  if (typeof service !== 'string' || !Object.hasOwn(handlers, service)) {
    return res.status(404).json({ error: 'Endpoint non trovato' });
  }
  return require(handlers[service])(req, res);
};
