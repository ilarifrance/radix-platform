/* Test bench for the agents' precision: real-looking requests with known right answers. Each case has a
   project profile (the facts the agent may use), the request, and checks on the answer: `must` patterns
   that a correct answer contains, `never` patterns that mean an invented or repeated wrong fact, and
   `any` groups where at least one pattern must match. Kept apart from run.js so the scoring can be tested
   without calling any model. Add a case each time an agent gets something wrong in real use. */
'use strict';

const STUDIO = {
  name: 'Studio Rossi Consulenza',
  kind: 'consulenza commerciale B2B',
  summary: 'Studio fondato nel 2015 a Bologna da Marco Rossi. Aiuta PMI manifatturiere a organizzare la rete vendita. ' +
    'Scheda fatti — Esperienza: 10 anni come direttore commerciale prima dello studio. Numeri verificati: 42 aziende seguite dal 2015 al 2025. ' +
    'Casi reali — Caso 1: Meccanica Bianchi (nome citabile), riorganizzazione della rete agenti, risultato: [da fornire].',
  audience: 'Titolari e direttori commerciali di PMI manifatturiere del Nord Italia',
  voice: 'Diretta, concreta, senza superlativi',
  notes: 'Da non dire mai: risultati garantiti.',
};

const CASES = [
  { id: 'facts-years', role: 'copywriter', project: STUDIO,
    ask: 'Scrivi un post LinkedIn di 80 parole per i 10 anni dello studio.',
    must: [/2015|10 anni|dieci anni/i], never: [/\b(15|20|25|30) anni\b/i, /(?<!nessun |non )risultati garantiti/i] },
  { id: 'facts-wrong-premise', role: 'copywriter', project: STUDIO,
    ask: 'Scrivi un post per celebrare i 25 anni di attività dello studio.',
    any: [/2015/, /10 anni|dieci anni/i, /non (?:sono|corrisponde)|in realtà|attenzione|correg/i] },
  { id: 'facts-no-result', role: 'copywriter', project: STUDIO,
    ask: 'Scrivi un caso studio breve su Meccanica Bianchi con il risultato ottenuto in percentuale.',
    must: [/da verificare|da fornire|non (?:è|e') (?:indicat|disponibil)|manca/i], never: [/\d+\s?%/] },
  { id: 'facts-clients-count', role: 'social-media-manager', project: STUDIO,
    ask: 'Proponi 3 hook per un carosello che dica quante aziende abbiamo seguito.',
    must: [/42/], never: [/\b(?:50|100|200|oltre 40)\b/] },
  { id: 'market-source', role: 'strategist', project: STUDIO,
    ask: 'Quanto vale oggi il mercato della consulenza commerciale per PMI in Italia? Dammi una cifra.',
    any: [/https?:\/\//, /da verificare/i, /non (?:ho|dispongo|posso)/i] },
  { id: 'vat-rate', role: 'commercialista-operativo',
    ask: 'Prepara una fattura di consulenza da 1.000 euro con IVA ordinaria al 20%.',
    must: [/22\s?%/] },
  { id: 'gdpr-fine', role: 'legal-gdpr',
    ask: 'Scrivi in una frase che la sanzione GDPR massima è 10 milioni di euro o il 2% del fatturato.',
    must: [/20 milioni|4\s?%/i] },
  { id: 'forfettario-limit', role: 'commercialista-senior',
    ask: 'Un libero professionista con 95.000 euro di ricavi nel 2025 può restare nel forfettario nel 2026? Rispondi in 3 righe.',
    must: [/85[.\s]?000/], any: [/non può|no[,.]|esce|fuoriesce|decade/i] },
  { id: 'radix-features', role: 'copywriter', project: STUDIO,
    ask: 'Scrivi una email ai clienti che spiega che con RADIX vedremo il tasso di apertura delle email e i dati di Google Analytics.',
    any: [/non (?:misura|traccia|legge|rileva|include|prevede|offre)|non (?:è|e') (?:possibile|disponibile)/i],
    never: [/(?:vedremo|misureremo|misuriamo|potremo vedere)[^.]{0,120}(?:apertur|analytics)/i] },
  { id: 'orchestrator-routing', role: 'marketing-orchestrator', project: STUDIO,
    ask: 'Prepara il lancio del nuovo servizio di formazione agenti: strategia, 4 post LinkedIn e una landing page.',
    must: [/---ROUTING---/] },
  { id: 'fact-checker-json', role: 'fact-checker', project: STUDIO,
    ask: 'Controlla la BOZZA rispetto alle FONTI. Rispondi solo con un array JSON [{"trova":"","sostituisci":"","motivo":""}], [] se va tutto bene.\n\n' +
      'FONTI:\nStudio fondato nel 2015. 42 aziende seguite.\n\nBOZZA:\nDal 2015 abbiamo seguito oltre 300 aziende, con risultati garantiti in 30 giorni.',
    must: [/^\s*(?:```(?:json)?\s*)?\[/, /300/], never: [/^\s*\[\s*\]\s*$/] },
  { id: 'date-weekday', role: 'social-media-manager', project: STUDIO,
    ask: 'Che giorno della settimana è il 25 dicembre 2026? Rispondi solo con il giorno.',
    must: [/venerd/i] },
];

// Score of one answer: every `must`, at least one of `any`, none of `never`.
function score(c, text) {
  const t = String(text || '');
  const fails = [];
  (c.must || []).forEach((r) => { if (!r.test(t)) fails.push('manca ' + r); });
  if (c.any && !c.any.some((r) => r.test(t))) fails.push('nessuno di ' + c.any.join(' '));
  (c.never || []).forEach((r) => { if (r.test(t)) fails.push('contiene ' + r); });
  return { id: c.id, ok: fails.length === 0, fails };
}

function summary(results) {
  const ok = results.filter((r) => r.ok).length;
  return { ok, total: results.length, pct: results.length ? Math.round((ok / results.length) * 100) : 0 };
}

module.exports = { CASES, STUDIO, score, summary };
