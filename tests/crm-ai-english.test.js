'use strict';
// English CRM: every AI request from the CRM pages carries lang:'en' and api/chat.js then adds a strict
// British-English rule; the prompt builders that hard-code «in italiano» ask for English. Italian stays as it was.
// Stubs only: no real AI call, no database.
const test = require('node:test'), assert = require('node:assert/strict');
const I = require('../lib/radix-i18n.js');

// English UI on/off for the pure builders (they read globalThis.RadixI18n.en at call time).
function withUi(en, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'RadixI18n'), old = globalThis.RadixI18n;
  if (en === undefined) delete globalThis.RadixI18n; else globalThis.RadixI18n = { en };
  try { return fn(); } finally { if (had) globalThis.RadixI18n = old; else delete globalThis.RadixI18n; }
}
// The English prompt with its English fragments put back in Italian must be the Italian prompt, byte for byte.
function sameButLanguage(build, pairs) {
  const it = withUi(undefined, build), off = withUi(false, build), en = withUi(true, build);
  assert.equal(off, it, 'Italian UI flag off = no flag');
  assert.notEqual(en, it);
  let back = en;
  for (const [e, i] of pairs) { assert.ok(back.includes(e), 'English prompt has «' + e + '»'); back = back.split(e).join(i); }
  assert.equal(back, it);
  assert.doesNotMatch(en, /in italiano/);
  return { it, en };
}
const BRIT = 'in inglese britannico (British English)';

test('api/chat languageRule: allow-list it|en, nothing for Italian or unknown values', () => {
  const { languageRule, LANGUAGES } = require('../api/chat.js');
  assert.deepEqual(LANGUAGES, ['it', 'en']);
  for (const v of [undefined, null, '', 'it', 'IT', 'fr', 'english', 'en-GB', 1, {}, ['en']]) assert.equal(languageRule(v), '', String(v));
  const r = languageRule('en');
  assert.equal(languageRule(' EN '), r);
  assert.match(r, /^\n\nLANGUAGE: Write the whole answer in British English, including any drafts, regardless of the language of the instructions or data; keep names and quoted record data as they are\./);
  assert.match(r, /JSON keys, codes and values taken from a fixed list/);
  assert.match(r, /\{nome\}/);
});

test('api/chat handler: lang en appends the rule last for any role (Copilot, Regia, agents); Italian prompt unchanged', async () => {
  const dbPath = require.resolve('../api/_db');
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { sql: () => () => [] } };
  const auth = require('../api/_auth'), realUser = auth.getSessionUser;
  auth.getSessionUser = () => ({ uid: 'u1' });
  delete require.cache[require.resolve('../api/chat.js')];
  const chat = require('../api/chat.js');
  const sent = [], realFetch = global.fetch, key = process.env.ANTHROPIC_API_KEY;
  global.fetch = async (url, opts) => { sent.push(JSON.parse(opts.body)); return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' }) }; };
  process.env.ANTHROPIC_API_KEY = 'test';
  const res = { code: 0, status(c) { this.code = c; return this; }, json() { return this; }, setHeader() {} };
  const text = (s) => (typeof s === 'string' ? s : (s || []).map((b) => b.text).join(''));
  const rule = chat.languageRule('en');
  try {
    for (const role of ['crm-copilot', 'radix-director', 'comm-email-outreach', 'radix-guide']) {
      const base = { role, messages: [{ role: 'user', content: 'Ciao' }] };
      if (role === 'radix-director') base.context = 'Area: CRM';
      sent.length = 0;
      for (const extra of [{}, { lang: 'it' }, { lang: 'fr' }, { language: 'de' }, { lang: 'en' }, { language: 'en' }]) {
        res.code = 0;
        await chat({ method: 'POST', headers: {}, body: { ...base, ...extra } }, res);
        assert.equal(res.code, 200, role + ' ' + JSON.stringify(extra));
      }
      const sys = sent.map((b) => text(b.system));
      assert.equal(sent.length, 6, role);
      assert.ok(sys[0].length > 0 && !sys[0].includes('British English'), role + ': Italian prompt has no English rule');
      assert.equal(sys[1], sys[0], role + ': lang it = no lang');
      assert.equal(sys[2], sys[0], role + ': unknown lang ignored');
      assert.equal(sys[3], sys[0], role + ': unknown language ignored');
      assert.equal(sys[4], sys[0] + rule, role + ': lang en = Italian prompt + the rule at the very end');
      assert.equal(sys[5], sys[4], role + ': language en works too');
    }
  } finally {
    global.fetch = realFetch;
    if (key === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = key;
    delete require.cache[dbPath];
    auth.getSessionUser = realUser;
  }
});

test('client: withLang adds lang:en only to JSON POSTs to /api/chat, only in English', () => {
  const body = JSON.stringify({ role: 'crm-copilot', messages: [] });
  const init = { method: 'POST', headers: { 'content-type': 'application/json' }, body };
  const out = I.withLang('/api/chat', init, 'en');
  assert.notEqual(out, init, 'a new init, the caller’s object is left alone');
  assert.equal(init.body, body);
  assert.deepEqual(JSON.parse(out.body), { role: 'crm-copilot', messages: [], lang: 'en' });
  assert.equal(out.headers, init.headers);
  assert.deepEqual(JSON.parse(I.withLang('https://radix.example/api/chat?x=1', init, 'en').body).lang, 'en');
  assert.deepEqual(JSON.parse(I.withLang({ url: 'https://radix.example/api/chat' }, init, 'en').body).lang, 'en');
  // Untouched: Italian, other URLs, GET, non-JSON or non-object bodies, a language already chosen (dictation says lang:'it').
  assert.equal(I.withLang('/api/chat', init, 'it'), init);
  assert.equal(I.withLang('/api/chat', init, undefined), init);
  for (const u of ['/api/chats', '/api/crm', '/x/api/chat', 'https://radix.example/api/chat-log']) assert.equal(I.withLang(u, init, 'en'), init, u);
  assert.equal(I.withLang('/api/chat', { ...init, method: 'GET' }, 'en').body, body);
  assert.equal(I.withLang('/api/chat', { method: 'POST' }, 'en').body, undefined);
  for (const b of ['not json', '[1,2]', 'null', '"x"']) assert.equal(I.withLang('/api/chat', { method: 'POST', body: b }, 'en').body, b);
  const it = { method: 'POST', body: JSON.stringify({ role: 'crm-copilot', lang: 'it' }) };
  assert.equal(I.withLang('/api/chat', it, 'en'), it);
  assert.equal(I.withLang('/api/chat', undefined, 'en'), undefined);
});

test('client: wrapFetch wraps window.fetch once and passes the window as this', async () => {
  const calls = [];
  const win = {};
  win.fetch = function (input, init) { calls.push({ self: this, input, init }); return Promise.resolve('ok'); };
  I.wrapFetch(win, 'en');
  const wrapped = win.fetch;
  I.wrapFetch(win, 'en');
  assert.equal(win.fetch, wrapped, 'not wrapped twice');
  const f = win.fetch;
  assert.equal(await f('/api/chat', { method: 'POST', body: '{"role":"crm-copilot"}' }), 'ok');
  await win.fetch.call(undefined, '/api/other', { method: 'POST', body: '{}' });
  assert.equal(calls[0].self, win);
  assert.equal(calls[0].init.body, '{"role":"crm-copilot","lang":"en"}');
  assert.equal(calls[1].init.body, '{}');
  const none = {};
  I.wrapFetch(none, 'en');
  assert.equal(none.fetch, undefined, 'no fetch, nothing installed');
});

test('client: in Italian the layer does not touch fetch', () => {
  const src = require('node:fs').readFileSync(require.resolve('../lib/radix-i18n.js'), 'utf8');
  const boot = src.slice(src.indexOf('function boot('));
  assert.ok(boot.indexOf("if (lang !== 'en') return;") < boot.indexOf('wrapFetch(win, lang)'), 'wrapFetch only after the Italian return');
});

test('prompts: campaign next email asks for English and English weekdays; parse maps them back', () => {
  const R = require('../sales/crm-campaign-report-core.js'), N = require('../sales/crm-campaign-next-core.js');
  const sends = [], contacts = [];
  for (let i = 1; i <= 4; i++) { sends.push({ contact_id: 'c' + i, occurred_at: '2026-10-20T08:00:00Z', title: 'Email: Autunno', k: 'Autunno' }); contacts.push({ id: 'c' + i, name: 'C' + i, marketing_consent: true }); }
  const rep = R.buildReport({ sends, clicks: [{ contact_id: 'c1', campaign: 'Autunno', url: 'https://radix.example/a', clicked_at: '2026-10-20T09:00:00Z' }], contacts, followups: [], opportunities: [] }, { days: 14, now: Date.parse('2026-11-30T00:00:00Z') });
  const f = N.facts(rep.campaigns[0], rep.days);
  const { en } = sameButLanguage(() => N.prompt(f), [
    ['Rispondi in inglese britannico (British English).', 'Rispondi in italiano.'],
    ['(in inglese, es. «Tuesday»)', '(in italiano, es. «martedì»)'],
    ['"send_day":"Tuesday"', '"send_day":"martedì"']]);
  assert.match(en, /British English/);
  assert.equal(N.dayOf('Tuesday'), 'martedì');
  assert.equal(N.dayOf('friday morning'), 'venerdì');
  assert.equal(N.dayOf('martedì'), 'martedì');
  assert.equal(N.dayOf('Thursdays'), '');
  // English numbers: 1,234 is a thousand and more, 12.5 a decimal (Italian reading unchanged).
  assert.deepEqual(withUi(true, () => N.numbersIn('1,234 people, 12.5% and 3')), ['1234', '12.5', '3']);
  assert.deepEqual(withUi(undefined, () => N.numbersIn('1.234 persone, 12,5% e 3')), ['1234', '12.5', '3']);
  const reply = JSON.stringify({ insights: ['4 recipients, 1 clicked.'], proposals: [{ segment: 'non_cliccato', subject: 'Did you see it?', preview: 'A short reminder', outline: ['a', 'b', 'c'], send_day: 'Thursday', why: '3 did not click' }] });
  const p = withUi(true, () => N.parse(reply, f));
  assert.equal(p.insights.length, 1);
  assert.equal(p.proposals[0].sendDay, 'giovedì');
});

test('prompts: follow-up, LinkedIn, ticket reply, newsletter lines ask for British English; Italian identical', () => {
  const F = require('../sales/crm-follow-up.js');
  const NOW = Date.parse('2026-10-20T15:00:00Z');
  const MEET = { id: 'i1', kind: 'meeting', title: 'Riunione con Laura', occurred_at: '2026-10-20T09:00:00Z', body: 'Demo.', contact_id: 'k1', company_id: null, opportunity_id: null };
  const ff = F.facts(MEET, { contacts: [{ id: 'k1', name: 'Laura Bianchi' }], interactions: [MEET] }, NOW);
  sameButLanguage(() => F.prompt(ff), [[' ' + BRIT + ' dopo', ' in italiano dopo'], ['[TO BE COMPLETED: what]', '[DA COMPLETARE: cosa]']]);

  const L = require('../sales/crm-linkedin-message-core.js');
  const lf = L.facts({ id: 'k1', name: 'Laura Bianchi', linkedin_url: 'x' }, {}, NOW);
  for (const p of ['primo', 'followup', 'evento', 'altro']) {
    sameButLanguage(() => L.prompt(lf, p, 'Fiera'), [[', ' + BRIT + ',', ', in italiano,'], ['[TO BE COMPLETED: what]', '[DA COMPLETARE: cosa]'], ['professionale, formale,', 'professionale, dai del lei,']]);
  }

  const { aiPrompt } = require('../sales/crm-ticket-reply.js');
  sameButLanguage(() => aiPrompt({ title: 'Accesso', body: 'Non entro.' }, { name: 'Giulia' }), [[', ' + BRIT + ',', ', in italiano,'], ['[TO BE COMPLETED: what]', '[DA COMPLETARE: cosa]']]);

  const N = require('../sales/lead-newsletter-core.js');
  const rows = [{ contact: { id: 'c1', email: 'a@x.it' }, fields: { nome: 'P1', ruolo: 'CEO' }, segment: '' }];
  sameButLanguage(() => N.hooksPrompt({ goal: 'Novità', facts: 'Linea bio' }, rows), [[', ' + BRIT + ', tono', ', in italiano, tono']]);
});

test('prompts: AI summary asks English headings and parseSummary reads them (and still the Italian ones)', () => {
  const core = require('../sales/crm-record-core.js');
  const O1 = '33333333-3333-4333-8333-333333333333';
  const rows = [{ entity: 'opportunities', record: { id: O1, title: 'Fornitura 2027', stage_id: 's', amount_cents: 100, outcome: 'open' } }];
  const f = core.summaryFacts('opportunities', O1, rows, { stages: [{ id: 's', title: 'Proposta' }], members: [], now: Date.parse('2026-10-19T10:00:00Z') });
  sameButLanguage(() => core.summaryPrompt(f), [
    ['«not recorded»', '«non registrato»'], ['Rispondi in inglese britannico (British English), con', 'Rispondi in italiano, con'],
    ['\nSituation: ', '\nSituazione: '], ['\nRisks: ', '\nRischi: '], ['«No evident risk from the data»', '«Nessun rischio evidente dai dati»'],
    ['\nRecommended next step: ', '\nProssimo passo consigliato: ']]);
  const en = core.parseSummary('**Situation:** Proposal sent.\n## Risks\n- No contact for 10 days\nRecommended next step: call Giulia by Friday.');
  assert.deepEqual([en.situation, en.risks, en.next, en.complete], ['Proposal sent.', '- No contact for 10 days', 'call Giulia by Friday.', true]);
  const it = core.parseSummary('Situazione: ok.\nRischi: nessuno.\nProssimo passo consigliato: chiamare.');
  assert.deepEqual([it.situation, it.risks, it.next, it.complete], ['ok.', 'nessuno.', 'chiamare.', true]);
});

test('email ideas: the fallback reader takes English Subject/Body blocks too', () => {
  const E = require('../sales/crm-email-ideas.js');
  const out = E.parse('Version 1\nSubject: Hello {nome}\nBody: A short note for {azienda}.\n\nVersion 2\n**Subject**: Second\n**Body**: Text two.');
  assert.deepEqual(out.map((e) => [e.subject, e.body]), [['Hello {nome}', 'A short note for {azienda}.'], ['Second', 'Text two.']]);
  assert.deepEqual(E.parse('Oggetto: Ciao\nCorpo: Testo.').map((e) => e.subject), ['Ciao']);
});

test('the TO BE COMPLETED placeholders of English drafts are caught like DA COMPLETARE', () => {
  const fs = require('node:fs');
  for (const f of ['../sales/crm-follow-up.js', '../sales/crm-ticket-reply.js', '../sales/crm-linkedin-message.js']) {
    assert.match(fs.readFileSync(require.resolve(f), 'utf8'), /\\\[\(\?:DA COMPLETARE\|TO BE COMPLETED\)/, f);
  }
  const d = fs.readFileSync(require.resolve('../sales/crm-dictation.js'), 'utf8');
  assert.match(d, /RadixI18n\.en\)req\.lang='it'/, 'dictation stays Italian (its values are read the Italian way)');
});
