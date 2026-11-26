'use strict';
// Sales Orbis «Guida alla configurazione» (sales/crm-guide-core.js): groups, progress and the next step.
const test = require('node:test'), assert = require('node:assert');
const fs = require('node:fs'), path = require('node:path');
const G = require('../sales/crm-guide-core.js'), O = require('../sales/crm-onboarding-core.js');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('groups: every step once, done only from the data, next = first step to do', () => {
  const empty = G.groups({}, O, { product: true });
  assert.deepEqual(empty.map(g => g.id), ['base', 'deals', 'reach']);
  assert.deepEqual(G.progress(empty), { done: 0, total: 7, left: 7, complete: false });
  assert.equal(G.next(empty).id, 'pipeline');
  const d = { processes: [{ id: 'p', kind: 'opportunity' }], stages: [{ id: 's', process_id: 'p' }], companies: [{}], contacts: [{}], tasks: [{}] };
  const gs = G.groups(d, O, { product: true });
  assert.equal(gs[0].done, 3); assert.equal(gs[1].done, 1);
  assert.equal(G.next(gs).id, 'opportunity');
  assert.equal(G.progress(gs).left, 3);
});

test('page: the guide is loaded by the CRM page, reads only and has its English', () => {
  const html = read('radix-sales.html');
  const a = html.indexOf('sales/crm-onboarding-core.js'), b = html.indexOf('sales/crm-guide-core.js'), c = html.indexOf('sales/crm-guide.js');
  assert.ok(a > 0 && b > a && c > b);
  assert.doesNotMatch(read('sales/crm-guide.js'), /fetch\(/);
  global.self = global; require('../lib/radix-i18n-en.js');
  const en = global.RadixI18nEn || global.self.RadixI18nEn;
  for (const g of G.GROUPS) assert.ok(en[g.title], g.title);
  for (const m of G.MORE) { assert.ok(en[m.label], m.label); assert.ok(en[m.hint], m.hint); }
  for (const k of ['Guida alla configurazione', 'Scopri di più', 'Pianifica la prima attività']) assert.ok(en[k], k);
});
