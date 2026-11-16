'use strict';
/* «Sales Orbis»: the CRM sold on its own. The same code (one source) is served on a CRM-only host or deployment:
   `/` is the CRM page, with its own sign-in, no Command Center and no link to the other RADIX areas.
   Everything that decides what the product is lives here, pure and with no DOM, for the browser, the API and the tests:
   - HOST_RE: which hosts are the product: sales-orbis.*, sales-orbis-*.vercel.app (its own Vercel project) or crm.*.
     On the server a deployment with RADIX_PRODUCT=sales-orbis is the product on every host (docs/sales-orbis.md).
   - PAGES / ASSET_PREFIXES: the allow-list of what a product host serves; anything else goes back to the CRM
     (vercel.json builds its redirect from these lists, tests/crm-product.test.js keeps the two in step).
   - API: the allow-list of /api endpoints; the others answer 404 on the product (api/_product.js).
   - chatRoleAllowed: on the product the AI runs only the CRM agents (crm-*, comm-*), never the RADIX ones.
   - brand(): the RADIX names in the interface texts become «Sales Orbis» (lib/radix-i18n.js runs it on the product
     after the translation, so the English dictionary keeps its Italian keys); applyHead() sets the product's title,
     icon and manifest. This file loads before lib/radix-i18n.js on every product page. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else {
    var api = root.RadixCrmProduct = factory();
    if (root.document && api.here()) {
      // The mark right away (the CSS needs it before paint), the <head> once it is parsed.
      root.document.documentElement.setAttribute('data-product', api.ENV_VALUE);
      var head = function () { api.applyHead(root.document); };
      if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', head); else head();
    }
  }
})(typeof self !== 'undefined' ? self : this, function () {
  var HOST_RE = /^(?:sales-orbis[.-]|(?:app\.)?salesorbis\.|crm\.)/i;
  // The same rule for vercel.json's «has host» conditions (Vercel matches the whole host).
  var HOST_VALUE = '(?:sales-orbis[.-]|(?:app\\.)?salesorbis\\.|crm\\.).+';
  var NAME = 'Sales Orbis';
  var ENV_VALUE = 'sales-orbis';
  // The CRM pages of the product (the Sales menu without the RADIX «Sales Orbit» globe pages) and its settings.
  var PAGES = Object.freeze(['crm', 'radix-sales.html', 'sales-pipeline-premium.html', 'sales-posta.html', 'sales-vendite.html',
    'lead-intelligence.html', 'sales-linkedin.html', 'sales-growth-campaigns.html', 'sales-growth-projects.html',
    'impostazioni.html', 'manifest.webmanifest', 'sales-orbis.webmanifest', 'favicon.ico', 'robots.txt']);
  // Folders of code and icons the pages load. api/ is open here because every endpoint checks itself (API below).
  var ASSET_PREFIXES = Object.freeze(['sales/', 'lib/', 'shell/', 'api/']);
  // /api endpoints the CRM pages call (auth, the CRM itself, its AI, email sending, file import, Microsoft mailbox
  // sign-in) and the integration services among /api/integrations/* they need; admin (ADMIN_SECRET header only) sets up
  // the product's own database and accounts. Everything else is RADIX only.
  var API = Object.freeze(['auth', 'sales', 'chat', 'parse-file', 'ms-oauth', 'integrations', 'admin']);
  var SERVICES = Object.freeze(['status', 'send-email', 'send-queue']);

  // Ordered: the long forms first («RADIX / SALES ORBIT / PIPELINE» → «SALES ORBIS / PIPELINE»).
  var BRAND = [
    [/RADIX\s*\/\s*SALES ORBIT\s*\/\s*/g, 'SALES ORBIS / '],
    [/\bSales Orbit\b/g, NAME],
    [/\bSALES ORBIT\b/g, 'SALES ORBIS'],
    [/\bRADIX\b/g, NAME]
  ];
  var ICON = '/sales/icons/sales-orbis.svg', MANIFEST = '/sales-orbis.webmanifest';
  function brand(s) {
    if (typeof s !== 'string' || !/RADIX|Sales Orbit|SALES ORBIT/.test(s)) return s;
    for (var i = 0; i < BRAND.length; i++) s = s.replace(BRAND[i][0], BRAND[i][1]);
    return s;
  }
  // The <head> of a product page: icon, manifest and home-screen name of Sales Orbis, and the page marked as the product
  // (html[data-product], used by the CSS that hides links to RADIX pages).
  function applyHead(doc) {
    var el = doc && doc.documentElement; if (!el) return;
    el.setAttribute('data-product', ENV_VALUE);
    var head = doc.head; if (!head) return;
    var each = function (sel, attr, value) {
      var list = head.querySelectorAll(sel);
      for (var i = 0; i < list.length; i++) list[i].setAttribute(attr, value);
      return list.length;
    };
    if (!each('link[rel~="icon"]', 'href', ICON)) {
      var icon = doc.createElement('link'); icon.rel = 'icon'; icon.type = 'image/svg+xml'; icon.href = ICON; head.appendChild(icon);
    }
    // Only a page that already has a manifest (its CSP allows manifest-src) gets the product's one.
    each('link[rel="manifest"]', 'href', MANIFEST);
    each('link[rel="apple-touch-icon"]', 'href', ICON);
    each('meta[name="apple-mobile-web-app-title"]', 'content', NAME);
    if (doc.title) doc.title = brand(doc.title);
  }

  function isProduct(host) { return HOST_RE.test(String(host || '')); }
  function isProductEnv(env) { return !!env && String(env.RADIX_PRODUCT || '').toLowerCase() === ENV_VALUE; }
  function pageAllowed(pathname) {
    var p = String(pathname || '/').replace(/^\/+/, '');
    if (p === '') return true;
    if (PAGES.indexOf(p) !== -1) return true;
    for (var i = 0; i < ASSET_PREFIXES.length; i++) if (p.indexOf(ASSET_PREFIXES[i]) === 0) return true;
    return false;
  }
  // name: the first path segment after /api/ («sales», «auth», «integrations»…); service: /api/integrations/<service>.
  function apiAllowed(name, service) {
    var n = String(name || '').replace(/\.js$/, '');
    if (API.indexOf(n) === -1) return false;
    if (n === 'integrations') return SERVICES.indexOf(String(service || '')) !== -1;
    return true;
  }
  function chatRoleAllowed(role) { return typeof role === 'string' && /^(crm|comm)-[a-z0-9-]+$/.test(role); }
  // The source of vercel.json's product redirect: every path not in the allow-list goes back to the CRM.
  function redirectSource() {
    var esc = function (s) { return s.replace(/[.]/g, '\\.'); };
    return '/:path((?!(?:' + PAGES.map(esc).join('|') + ')$|(?:' + ASSET_PREFIXES.map(esc).join('|') + ')).+)';
  }
  return { HOST_RE: HOST_RE, HOST_VALUE: HOST_VALUE, NAME: NAME, ENV_VALUE: ENV_VALUE, PAGES: PAGES, ASSET_PREFIXES: ASSET_PREFIXES, API: API, SERVICES: SERVICES,
    isProduct: isProduct, isProductEnv: isProductEnv, pageAllowed: pageAllowed, apiAllowed: apiAllowed,
    chatRoleAllowed: chatRoleAllowed, redirectSource: redirectSource, brand: brand, applyHead: applyHead, ICON: ICON, MANIFEST: MANIFEST,
    here: function () { return typeof location === 'object' && isProduct(location.hostname); },
    home: function () { return '/'; } };
});
