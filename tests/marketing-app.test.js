'use strict';
const test = require('node:test');
const assert = require('node:assert');
const C = require('../marketing-app/strategy-core.js');

const brief = { nome: 'Forno Aurora', settore: 'Ristorazione', cosa: 'Pane e dolci artigianali', obiettivo: 'Ricevere contatti', orizzonte: '6 mesi',
  pubblico: 'Famiglie del quartiere', mercato: 'Citta', canali: ['Facebook'], concorrenti: 'Forno Rossi, Pane&Co', budget: '0' };

test('validate segnala i campi mancanti per passo', () => {
  assert.strictEqual(C.validate({}, 'azienda').length, 3);
  assert.strictEqual(C.validate(brief).length, 0);
  assert.ok(C.validate({ ...brief, settore: 'Boh' }).length);
});

test('analyze separa cio che scrive il cliente da cio che e stimato', () => {
  const a = C.analyze(brief);
  assert.ok(a.strengths.every(f => f.source === 'cliente'));
  assert.ok(a.gaps.every(f => f.source === 'stimato'));
  assert.ok(a.gaps.some(f => /Instagram/.test(f.text)));
  assert.deepStrictEqual(a.competitors, ['Forno Rossi', 'Pane&Co']);
  assert.ok(a.risks.some(f => /budget/.test(f.text)));
  assert.throws(() => C.analyze({}), /Manca/);
});

test('piano base ha una sola strategia, medio e avanzato anche la variante performante', () => {
  assert.strictEqual(C.strategies(brief, 'base').strategies.length, 1);
  const m = C.strategies(brief, 'medio');
  assert.deepStrictEqual(m.strategies.map(s => s.id), ['standard', 'performante']);
  assert.ok(m.strategies[1].postsPerMonth > m.strategies[0].postsPerMonth);
  assert.strictEqual(m.monthlyReview, false);
  assert.strictEqual(C.strategies(brief, 'avanzato').monthlyReview, true);
  assert.throws(() => C.strategies(brief, 'oro'), /Piano sconosciuto/);
});

test('i canali rispettano il limite del piano e i crediti sono confrontati col piano', () => {
  assert.strictEqual(C.strategies(brief, 'base').strategies[0].channels.length, 2);
  assert.strictEqual(C.strategies(brief, 'avanzato').strategies[0].channels.length, 6);
  const b = C.strategies(brief, 'base').strategies[0];
  assert.strictEqual(b.withinPlan, b.creditsPerMonth <= 60);
});

test('guide segue il percorso e non salta passi', () => {
  assert.strictEqual(C.guide({ brief: {} }).stage, 'brief');
  assert.strictEqual(C.guide({ brief }).stage, 'analysis');
  assert.strictEqual(C.guide({ brief, analysisSeen: true }).stage, 'plan');
  assert.strictEqual(C.guide({ brief, analysisSeen: true, plan: 'base' }).stage, 'strategy');
  assert.strictEqual(C.guide({ brief, analysisSeen: true, plan: 'base', chosen: 'standard' }).stage, 'done');
});
