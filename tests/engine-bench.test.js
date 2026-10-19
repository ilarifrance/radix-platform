const test = require('node:test');
const assert = require('node:assert');
const { CASES, score, summary } = require('../tools/engine-bench/cases');

test('bench cases are well formed and ids unique', () => {
  const ids = new Set();
  CASES.forEach((c) => {
    assert.ok(c.id && c.role && c.ask, c.id);
    assert.ok((c.must && c.must.length) || (c.any && c.any.length), c.id + ' has a positive check');
    assert.ok(!ids.has(c.id), c.id); ids.add(c.id);
  });
  assert.ok(CASES.length >= 12);
});

test('score: must, any, never', () => {
  const c = CASES.find((x) => x.id === 'facts-no-result');
  assert.equal(score(c, 'Risultato: [da verificare: percentuale]').ok, true);
  assert.equal(score(c, 'Risultato: +35% di vendite').ok, false);
  const p = CASES.find((x) => x.id === 'facts-wrong-premise');
  assert.equal(score(p, 'Attenzione: lo studio è nato nel 2015, quindi sono 10 anni.').ok, true);
  assert.equal(score(p, 'Venticinque anni di passione!').ok, false);
  const j = CASES.find((x) => x.id === 'fact-checker-json');
  assert.equal(score(j, '[{"trova":"oltre 300 aziende","sostituisci":"42 aziende","motivo":"fonti"}]').ok, true);
  assert.equal(score(j, '[]').ok, false);
  assert.deepEqual(summary([{ ok: true }, { ok: false }]), { ok: 1, total: 2, pct: 50 });
});

test('scoring fixes found in the first real run', () => {
  const y = CASES.find((x) => x.id === 'facts-years');
  assert.equal(score(y, 'Dieci anni dopo, 42 aziende seguite. Nessun risultato garantito, mai.').ok, true);
  assert.equal(score(y, 'Dal 2015, risultati garantiti.').ok, false);
  const j = CASES.find((x) => x.id === 'fact-checker-json');
  assert.equal(score(j, '```json\n[{"trova":"oltre 300 aziende","sostituisci":"42","motivo":"x"}]\n```').ok, true);
  const f = CASES.find((x) => x.id === 'radix-features');
  assert.equal(score(f, 'Da oggi vedremo il tasso di apertura delle email. [da verificare: privacy]').ok, false);
  assert.equal(score(f, 'RADIX non misura le aperture delle email: conta i clic sui link.').ok, true);
});
