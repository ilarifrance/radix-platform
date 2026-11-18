'use strict';
// Lead Intelligence «Percorso guidato» (sales/lead-guide-core.js, sales/lead-guide.js): the next step and the state of the
// sources and email services, from what /api/sales already says. Read only: it never starts a search or a paid call.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const G = require('../sales/lead-guide-core.js');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const CHAIN = [
  { id: 'hunter', label: 'Hunter', cost: '1 credito', state: 'pronto' },
  { id: 'apollo', label: 'Apollo.io', cost: '1 credito', state: 'da collegare' },
  { id: 'captaindata', label: 'Captain Data', state: 'non disponibile' },
  { id: 'dropcontact', label: 'Dropcontact', state: 'spento' }
];

test('an empty workspace starts from the import', () => {
  const s = G.steps({ lists: 0, crmLeads: 0, chain: [] });
  assert.deepEqual(s.map(x => x.id), ['import', 'crm', 'email', 'write']);
  assert.equal(G.next(s).id, 'import');
  assert.equal(G.summary(s), '0 di 2 fatti');
  assert.match(s[2].text, /nessun servizio a pagamento/);
});

test('with lists and leads in the CRM the checked steps are done', () => {
  const one = G.steps({ lists: 1, crmLeads: 0, chain: CHAIN });
  assert.equal(G.next(one).id, 'crm'); assert.match(one[0].text, /^1 lista salvata\.$/);
  const both = G.steps({ lists: 3, crmLeads: 1, chain: CHAIN });
  assert.equal(G.next(both), null); assert.equal(G.summary(both), '2 di 2 fatti');
  assert.match(both[2].text, /poi Hunter, solo dopo una tua conferma\./, 'only the ready paid services are named');
  assert.equal(both[2].href, '/crm#contacts');
});

test('sources: always-on ones ready, keys to connect said plainly, unavailable services left out', () => {
  const s = G.sources({ chain: CHAIN, provider: { configured: false } });
  const by = Object.fromEntries(s.map(x => [x.label, x]));
  assert.equal(by['File CSV o Excel'].state, 'pronto');
  assert.equal(by['Captain Data (API)'].state, 'da collegare');
  assert.equal(by['Email con Hunter (a pagamento)'].state, 'pronto');
  assert.equal(by['Email con Apollo.io (a pagamento)'].state, 'da collegare');
  assert.match(by['Email con Apollo.io (a pagamento)'].note, /chiave/);
  assert.equal(by['Email con Dropcontact (a pagamento)'].state, 'spento');
  assert.ok(!s.some(x => /Email con Captain Data/.test(x.label)));
  assert.equal(G.sources({ chain: [], provider: { configured: true } }).find(x => x.label === 'Captain Data (API)').state, 'pronto');
});

test('page: the guide loads after the flow, reads only, and has its English', () => {
  const html = read('lead-intelligence.html');
  const a = html.indexOf('/sales/lead-flow.js'), b = html.indexOf('/sales/lead-guide-core.js'), c = html.indexOf('/sales/lead-guide.js');
  assert.ok(a > 0 && b > a && c > b);
  const js = read('sales/lead-guide.js');
  assert.doesNotMatch(js, /method:\s*'POST'/, 'no write, no search');
  assert.match(js, /entity: 'email_finder'/); assert.match(js, /entity: 'lead_provider_status'/);
  global.self = global; require('../lib/radix-i18n-en.js');
  const en = global.RadixI18nEn || global.self.RadixI18nEn;
  for (const k of ['Percorso guidato', 'Fonti e servizi', 'Inizia da qui', 'Importa la prima lista di lead', 'Trova le email che mancano', 'Scrivi la prima email', 'pronto', 'da collegare'])
    assert.ok(en && en[k], k);
});
