'use strict';
// Sales Orbis top bar (sales/crm-topbar.js): the one search over the loaded records.
const test = require('node:test'), assert = require('node:assert');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function load() {
  const node = () => ({ append() {}, setAttribute() {}, addEventListener() {}, replaceChildren() {}, contains: () => false, classList: { add() {} } });
  const document = { querySelector: () => Object.assign(node(), { prepend() {} }), createElement: node, addEventListener() {}, documentElement: node() };
  const window = { RadixCrmProduct: { here: () => true } };
  vm.runInNewContext(read('sales/crm-topbar.js'), { window, document, location: { hash: '' }, setTimeout });
  return window.RadixCrmTopbar;
}

test('find: every word must match, names that start with the text first, accents ignored', () => {
  const T = load();
  const data = {
    companies: [{ id: 'c1', name: 'Aurora Meccanica' }, { id: 'c2', name: 'Chilò Forni' }],
    contacts: [{ id: 'p1', name: 'Giulia Ferri', email: 'giulia@aurora.example' }],
    opportunities: [{ id: 'o1', title: 'Linea Aurora 2027' }], leads: [], tasks: [{ id: 't1', title: 'Richiamare Aurora' }]
  };
  const rows = e => data[e];
  assert.deepEqual(T.find('', rows), []);
  const a = T.find('aurora', rows);
  assert.equal(a[0].name, 'Aurora Meccanica');
  assert.deepEqual(a.map(x => x.entity).sort(), ['companies', 'contacts', 'opportunities', 'tasks']);
  assert.equal(T.find('chilo', rows)[0].row.id, 'c2');
  assert.equal(T.find('aurora 2027', rows).length, 1);
  assert.equal(T.find('zzz', rows).length, 0);
});

test('page: the top bar is loaded by the CRM page, writes nothing and has its English', () => {
  const html = read('radix-sales.html');
  assert.match(html, /sales\/crm-topbar\.js/); assert.match(html, /sales\/crm-topbar\.css/);
  assert.doesNotMatch(read('sales/crm-topbar.js'), /fetch\(/);
  global.self = global; require('../lib/radix-i18n-en.js');
  const en = global.RadixI18nEn || global.self.RadixI18nEn;
  for (const k of ['Cerca in tutto il CRM', 'Nessun risultato', 'Crea', 'Nuovo contatto', 'Nuova azienda', 'Nuova opportunità', 'Nuova attività']) assert.ok(en && en[k], k);
});
