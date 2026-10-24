'use strict';
// Single serverless entrypoint for authenticated external provider integrations.
// The original public URLs remain unchanged through the exact Vercel rewrites.
// Provider handlers retain their existing auth, method and explicit-confirmation checks.
// Literal require() calls so Vercel's file tracer bundles each provider module;
// a require() of a computed path is not traced and fails with MODULE_NOT_FOUND.
const handlers = Object.freeze({
  'buffer': () => require('../_buffer'),
  'heygen': () => require('../_heygen'),
  'higgsfield': () => require('../_higgsfield'),
  'openai-image': () => require('../_openai-image'),
  // Vercel Cron: daily reading of the numbers of published PED posts (CRON_SECRET bearer).
  'ped-stats': () => require('../_ped_stats'),
  'send-email': () => require('../_send-email'),
  // Vercel Cron worker of the CRM «Coda invii» (CRON_SECRET bearer, not the session cookie).
  'send-queue': () => require('../_sales_send_worker'),
  'site-audit': () => require('../_site_audit'),
  'site-publish': () => require('../_site_publish'),
  'status': () => require('../_integrations-status')
});
module.exports = async function integrationRoute(req, res) {
  const service = req.query && req.query.service;
  if (typeof service !== 'string' || !Object.hasOwn(handlers, service)) {
    return res.status(404).json({ error: 'Endpoint non trovato' });
  }
  return handlers[service]()(req, res);
};
