'use strict';
/* «Sales Orbis»: the CRM sold on its own. The same code (one source) is served on a CRM-only host: `/` is the CRM page
   (vercel.json host rewrite), with its own sign-in, no Command Center and no link to the other RADIX areas.
   Which hosts count as the product is decided here only: HOST_RE. Pure, no DOM. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.RadixCrmProduct = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var HOST_RE = /^(sales-orbis|crm)\./i;
  var NAME = 'Sales Orbis';
  function isProduct(host) { return HOST_RE.test(String(host || '')); }
  return { HOST_RE: HOST_RE, NAME: NAME, isProduct: isProduct,
    here: function () { return typeof location === 'object' && isProduct(location.hostname); },
    home: function () { return '/'; } };
});
