'use strict';
// Sales Orbis example data (sales/crm-examples-core.js): what is created and what «Rimuovi» deletes.
const test = require('node:test'), assert = require('node:assert');
const fs = require('node:fs'), path = require('node:path');
const X = require('../sales/crm-examples-core.js');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('plan: every record is tagged, links stay inside the plan, dates are valid', () => {
  for (const lang of ['it', 'en']) {
    const p = X.plan(lang, Date.UTC(2026, 10, 23, 12));
    assert.equal(p.tag, lang === 'en' ? '[Example] ' : '[Esempio] ');
    assert.equal(p.stages.length, 5);
    for (const c of p.companies) assert.ok(c.name.startsWith(p.tag));
    for (const c of p.contacts) { assert.ok(c.data.name.startsWith(p.tag)); assert.ok(p.companies[c.company]); assert.match(c.data.email, /@example\.com$/); }
    for (const d of p.deals) { assert.ok(d.data.title.startsWith(p.tag)); assert.ok(p.companies[d.company] && p.contacts[d.contact] && p.stages[d.stage]); assert.match(d.data.expected_close, /^\d{4}-\d{2}-\d{2}$/); assert.ok(Number.isSafeInteger(d.data.amount_cents)); }
    for (const t of p.tasks) { assert.ok(t.data.title.startsWith(p.tag)); assert.match(t.data.due_at, /^\d{4}-\d{2}-\d{2}T09:00:00Z$/); }
  }
});

test('pick: only tagged rows, children first; canLoad only on an empty workspace', () => {
  const rows = { companies: [{ id: 'c1', version: 1, name: '[Esempio] Officine Riva' }, { id: 'c2', version: 3, name: 'Cliente vero' }], contacts: [{ id: 'p1', version: 1, name: '[Example] Emma Clarke' }], opportunities: [{ id: 'o1', version: 2, title: 'Trattativa vera' }], tasks: [{ id: 't1', version: 1, title: '[Esempio] Richiamare' }] };
  assert.deepEqual(X.pick(rows), [{ entity: 'tasks', id: 't1', version: 1 }, { entity: 'contacts', id: 'p1', version: 1 }, { entity: 'companies', id: 'c1', version: 1 }]);
  assert.equal(X.isExample({ name: 'Esempio Srl' }), false);
  assert.equal(X.canLoad(rows), false);
  assert.equal(X.canLoad({ companies: [], contacts: [], opportunities: [], tasks: [{}] }), true);
});

test('page: removal asks for confirmation and deletes only what pick() returns; English is there', () => {
  const js = read('sales/crm-examples.js');
  assert.match(js, /window\.confirm\(/); assert.match(js, /X\.pick\(rows\(\)\)/);
  global.self = global; require('../lib/radix-i18n-en.js');
  const en = global.RadixI18nEn || global.self.RadixI18nEn;
  for (const k of ['Carica dati di esempio', 'Rimuovi i dati di esempio', 'Dati di esempio rimossi.', 'Vuoi vedere come funziona?']) assert.ok(en[k], k);
});
