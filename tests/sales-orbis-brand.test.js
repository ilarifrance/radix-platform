'use strict';
/* Sales Orbis brand: on the product no RADIX name, no link to the RADIX pages, no Regia, the product's icon and manifest. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../sales/crm-product.js');
const I = require('../lib/radix-i18n.js');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const PAGES = ['radix-sales.html', 'impostazioni.html', 'lead-intelligence.html', 'sales-pipeline-premium.html', 'sales-posta.html',
  'sales-vendite.html', 'sales-linkedin.html', 'sales-growth-campaigns.html', 'sales-growth-projects.html'];

test('brand(): the RADIX names become Sales Orbis, other text stays', () => {
  assert.equal(P.brand('RADIX · Pipeline'), 'Sales Orbis · Pipeline');
  assert.equal(P.brand('RADIX | Pipeline Intelligence'), 'Sales Orbis | Pipeline Intelligence');
  assert.equal(P.brand('RADIX / SALES ORBIT / PIPELINE'), 'SALES ORBIS / PIPELINE');
  assert.equal(P.brand('✧ RADIX AI'), '✧ Sales Orbis AI');
  assert.equal(P.brand('Apri il Copilota commerciale in Sales Orbit'), 'Apri il Copilota commerciale in Sales Orbis');
  assert.equal(P.brand('Le pagine Sales mostrano i dati dopo l’accesso a RADIX.'), 'Le pagine Sales mostrano i dati dopo l’accesso a Sales Orbis.');
  assert.equal(P.brand('Radix Srl, RADIXO'), 'Radix Srl, RADIXO', 'only the whole word in capitals');
  assert.equal(P.brand('Contatti'), 'Contatti');
  assert.equal(P.brand(null), null);
});

test('branded translator: the brand after the translation, so the English keys stay Italian', () => {
  const T = I.compile({ 'Accedi a RADIX': 'Sign in to RADIX', 'Contatti': 'Contacts' }, []);
  const B = I.branded(T, P.brand);
  assert.equal(B.display('Accedi a RADIX'), 'Sign in to Sales Orbis');
  assert.equal(B.display('Contatti'), 'Contacts');
  assert.equal(B.display('Northbridge Ltd'), null, 'unchanged text: null, as display() promises');
  assert.equal(B.t('Accedi a RADIX'), 'Sign in to Sales Orbis');
  assert.equal(B.message('RADIX non risponde'), 'Sales Orbis non risponde');
  assert.equal(I.branded(T, null), T, 'outside the product: the translator as it was');
  const it = I.branded(I.compile({}, []), P.brand);
  assert.equal(it.display('RADIX · Posta'), 'Sales Orbis · Posta', 'Italian on the product: the brand alone');
});

test('applyHead(): the product icon, manifest and home-screen name, every icon link included', () => {
  const el = (tag, attrs) => ({ tag, attrs: Object.assign({}, attrs), setAttribute(n, v) { this.attrs[n] = v; } });
  const links = [el('link', { rel: 'icon', href: '/sales/icons/radix-app.svg' }), el('link', { rel: 'shortcut icon', href: '/favicon.ico' })];
  const manifest = el('link', { rel: 'manifest', href: '/manifest.webmanifest' });
  const touch = el('link', { rel: 'apple-touch-icon', href: '/tools/radix-chrome-extension/icons/icon128.png' });
  const app = el('meta', { name: 'apple-mobile-web-app-title', content: 'RADIX Oggi' });
  const by = { 'link[rel~="icon"]': links, 'link[rel="manifest"]': [manifest], 'link[rel="apple-touch-icon"]': [touch], 'meta[name="apple-mobile-web-app-title"]': [app] };
  const html = el('html', {});
  const doc = { documentElement: html, title: 'RADIX · Sales', head: { querySelectorAll: s => by[s] || [], appendChild() { throw new Error('no new icon needed'); } } };
  P.applyHead(doc);
  assert.equal(html.attrs['data-product'], 'sales-orbis');
  links.forEach(l => assert.equal(l.attrs.href, P.ICON));
  assert.equal(manifest.attrs.href, P.MANIFEST);
  assert.equal(touch.attrs.href, P.ICON);
  assert.equal(app.attrs.content, 'Sales Orbis');
  assert.equal(doc.title, 'Sales Orbis · Sales');
});

test('product pages load crm-product.js before the language layer; manifest and icon are the product ones', () => {
  for (const p of PAGES) {
    const html = read(p);
    const a = html.indexOf('<script src="/sales/crm-product.js"></script>'), b = html.indexOf('<script src="/lib/radix-i18n.js"></script>');
    assert.ok(a > 0 && b > a, p);
  }
  const m = JSON.parse(read('sales-orbis.webmanifest'));
  assert.equal(m.name, 'Sales Orbis');
  assert.doesNotMatch(JSON.stringify(m), /RADIX|radix/);
  for (const i of m.icons) { assert.ok(P.pageAllowed(i.src), i.src + ' is served on the product'); assert.ok(fs.existsSync(path.join(ROOT, i.src))); }
  assert.ok(P.pageAllowed(P.ICON) && fs.existsSync(path.join(ROOT, P.ICON)));
  assert.ok(P.pageAllowed(P.MANIFEST));
});

test('menu and assistant: no Sales Orbit globe, no RADIX guide, no Regia on the product', () => {
  const nav = read('sales/sales-nav.js');
  assert.match(nav, /if \(product\) items = items\.filter\(function \(it\) \{ return !it\.external && P\.pageAllowed/);
  assert.equal(P.pageAllowed('/sales-orbit-higgsfield.html'), false);
  assert.equal(P.pageAllowed('/control-center-v2.html'), false);
  assert.match(read('sales/regia-loader.js'), /RadixCrmProduct\.here\(\)\)return;/);
  assert.match(read('shell/radix-shell.js'), /if \(!soloProduct && body\.dataset\.shellGuide/);
  const css = read('sales/sales-nav.css');
  for (const sel of ['a[href*="sales-orbit"]', 'a[href*="control-center"]', 'a[href^="https://claude.ai/"]']) assert.ok(css.includes('html[data-product] ' + sel), sel);
});
