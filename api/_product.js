'use strict';
/* «Sales Orbis» on the server: the same rule as sales/crm-product.js. A request is the product when its host is a product
   host (sales-orbis.*, sales-orbis-*.vercel.app, salesorbis.*, app.salesorbis.*, crm.*) or when the whole deployment is the product (RADIX_PRODUCT=sales-orbis,
   its own Vercel project and database). On the product only the CRM endpoints answer: every other /api endpoint answers
   404 as if it did not exist, so a Sales Orbis account never reaches the RADIX team state, registry, memory or tools. */
const P = require('../sales/crm-product.js');

function hostOf(req) {
  const h = (req && req.headers) || {};
  return String(h.host || h['x-forwarded-host'] || '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
}
function isProductRequest(req, env = process.env) { return P.isProductEnv(env) || P.isProduct(hostOf(req)); }
function notFound(res) {
  res.statusCode = 404;
  if (typeof res.setHeader === 'function') res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (typeof res.status === 'function' && typeof res.json === 'function') return res.status(404).json({ error: 'Endpoint non trovato' });
  return res.end(JSON.stringify({ error: 'Endpoint non trovato' }));
}
// Wraps an /api handler that is RADIX only: on the product it answers 404 and the handler never runs.
function radixOnly(handler, env) {
  const wrapped = function (req, res) { return isProductRequest(req, env || process.env) ? notFound(res) : handler(req, res); };
  return Object.assign(wrapped, handler);
}
module.exports = { hostOf, isProductRequest, notFound, radixOnly };
