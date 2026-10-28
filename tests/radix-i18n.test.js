'use strict';
// English mode of the CRM pages (lib/radix-i18n.js + lib/radix-i18n-en.js): the translator, the DOM pass,
// the language choice, the locale and currency shims.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const I = require('../lib/radix-i18n.js');
require('../lib/radix-i18n-en.js');
const EN = globalThis.RadixI18nEn;
const T = I.compile(EN, I.HAND);

test('dictionary: loaded, keys without outer spaces, slots matching between Italian and English', () => {
  assert.ok(Object.keys(EN).length > 3000);
  for (const [k, v] of Object.entries(EN)) {
    assert.equal(k, k.trim(), k);
    const slots = s => (s.match(/\{\d+\}/g) || []).sort().join();
    assert.equal(slots(k), slots(v), k);
  }
});

test('exact strings, first-letter case and symbols around a known string', () => {
  assert.equal(T.tr('Salva'), 'Save');
  assert.equal(T.tr('  Salva  '), '  Save  ');
  assert.equal(T.tr('Nuova azienda'), 'New company');
  assert.equal(T.tr('Contatti:'), 'Contacts:');
  assert.equal(T.tr('aperta'), T.tr('Aperta').charAt(0).toLowerCase() + T.tr('Aperta').slice(1));
});

test('patterns: slots are kept, captured values translated, user data left alone', () => {
  const c = I.compile({ 'Nessun contatto da {0} giorni': 'No contact for {0} days', 'Apri «{0}»': 'Open «{0}»', 'Bozza': 'Draft', '{0} e {1}': '{0} and {1}' }, I.HAND);
  assert.equal(c.tr('Nessun contatto da 12 giorni'), 'No contact for 12 days');
  assert.equal(c.tr('Apri «Bozza»'), 'Open «Draft»');
  assert.equal(c.tr('Apri «Rossi e Figli»'), 'Open «Rossi e Figli»');
  assert.equal(c.tr('Rossi e Figli'), null, 'a weak pattern never rewrites a whole string');
  assert.equal(c.tr('Northbridge Logistics Ltd'), null);
});

test('patterns with an Italian ending in the slot are not used', () => {
  const c = I.compile({ 'Nuov{0} contatto': 'New contact', 'Salvato{0}': 'Saved{0}' });
  assert.equal(c.tr('Nuovo contatto'), null);
  assert.equal(c.tr('Salvato'), 'Saved', 'a tail slot may be empty');
  assert.equal(c.tr('Salvato · ora'), 'Saved · ora');
});

test('counts, relative dates and singulars', () => {
  assert.equal(T.tr('3 giorni fa'), '3 days ago');
  assert.equal(T.tr('1 giorno fa'), '1 day ago');
  assert.equal(T.tr('Ieri alle 14.30'), 'Yesterday at 14:30');
  assert.equal(T.tr('2 scadute'), '2 overdue');
  assert.equal(T.tr('1 attività'), '1 task');
  assert.equal(T.tr('Pagina 2 di 5'), 'Page 2 of 5');
});

test('date words written by the pages', () => {
  assert.equal(I.dateWords('lunedì 26 ottobre'), 'Monday 26 October');
  assert.equal(I.dateWords('26 ott · 14:30'), '26 Oct · 14:30');
  assert.equal(I.dateWords('Rossi'), null);
  assert.equal(T.tr('novembre 2026'), 'November 2026');
});

test('multi-line messages for confirm/alert are translated line by line', () => {
  const m = T.message('Salva\nNorthbridge Logistics Ltd');
  assert.equal(m, 'Save\nNorthbridge Logistics Ltd');
});

test('money: pounds in English, the amount untouched', () => {
  assert.equal(I.toPounds('€ 1,200'), '£1,200');
  assert.equal(I.toPounds('1,200 €'), '£1,200');
  assert.equal(I.toPounds('€ 12K · 3 deals'), '£12K · 3 deals');
  assert.equal(I.toPounds('Valore aperto (€)'), 'Valore aperto (£)');
  assert.equal(I.toPounds('-€ 5'), '-£5');
  assert.equal(I.toPounds('Northbridge'), 'Northbridge');
  assert.deepEqual(I.gbp({ style: 'currency', currency: 'EUR' }), { style: 'currency', currency: 'GBP' });
  assert.deepEqual(I.gbp({ style: 'currency', currency: 'USD' }), { style: 'currency', currency: 'USD' });
  assert.equal(T.display('Valore aperto (€)'), 'Open value (£)');
  assert.equal(I.money('€ 5'), '€ 5', 'Italian mode (default) keeps euro');
});

test('locales: Italian becomes en-GB, explicit other locales stay', () => {
  assert.equal(I.mapLocale('it-IT'), 'en-GB');
  assert.equal(I.mapLocale('it'), 'en-GB');
  assert.equal(I.mapLocale(undefined), 'en-GB');
  assert.equal(I.mapLocale('de-DE'), 'de-DE');
  assert.deepEqual(I.mapLocale(['it-IT', 'fr']), ['en-GB', 'fr']);
});

test('language choice: ?lang wins and is remembered, then localStorage, else Italian; storage errors are safe', () => {
  const store = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };
  const s1 = store();
  assert.equal(I.readLang({ location: { search: '?lang=en' }, localStorage: s1 }), 'en');
  assert.equal(s1.m.get('rx-lang'), 'en');
  assert.equal(I.readLang({ location: { search: '' }, localStorage: s1 }), 'en');
  assert.equal(I.readLang({ location: { search: '?lang=xx' }, localStorage: store() }), 'it');
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(I.readLang({ location: { search: '' }, localStorage: broken }), 'it');
  assert.equal(I.readLang({ location: { search: '?lang=en' }, localStorage: broken }), 'en');
  assert.equal(I.saveLang({ localStorage: broken }, 'en'), false);
  assert.equal(I.saveLang({ localStorage: s1 }, 'it'), true);
  assert.equal(I.saveLang({ localStorage: s1 }, 'fr'), false);
});

// ---- a very small DOM, enough for makeDom (tree walker, closest, attributes) ----
function fakeDom() {
  const one = (el, sel) => {
    sel = sel.trim();
    const a = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(sel);
    if (a) return el.attrs && Object.prototype.hasOwnProperty.call(el.attrs, a[1]) && (a[2] === undefined || el.attrs[a[1]] === a[2]);
    return el.tagName === sel.toUpperCase();
  };
  const matches = (el, sel) => sel.split(',').some(s => one(el, s));
  class El {
    constructor(tag, attrs) { this.nodeType = 1; this.tagName = tag.toUpperCase(); this.attrs = Object.assign({}, attrs); this.childNodes = []; this.parentElement = null; this.type = this.attrs.type || ''; }
    append(...ns) { for (const n of ns) { n.parentElement = this; this.childNodes.push(n); } return this; }
    hasAttribute(n) { return Object.prototype.hasOwnProperty.call(this.attrs, n); }
    getAttribute(n) { return this.hasAttribute(n) ? this.attrs[n] : null; }
    setAttribute(n, v) { this.attrs[n] = String(v); }
    matches(s) { return matches(this, s); }
    closest(s) { let e = this; while (e) { if (e.nodeType === 1 && matches(e, s)) return e; e = e.parentElement; } return null; }
  }
  const txt = (data) => ({ nodeType: 3, data, parentElement: null });
  const doc = {
    createTreeWalker(root, what, filter) {
      const list = [];
      const walk = n => {
        for (const c of n.childNodes || []) {
          if (c.nodeType === 1) { const r = filter ? filter.acceptNode(c) : 1; if (r === 2) continue; list.push(c); walk(c); }
          else if (c.nodeType === 3 && (what & 4)) list.push(c);
        }
      };
      walk(root);
      const out = list.filter(n => (n.nodeType === 1 ? what & 1 : what & 4));
      let i = 0;
      return { nextNode: () => out[i++] || null };
    }
  };
  return { El, txt, doc };
}

test('DOM pass: text and attributes translated, skipped zones and data untouched, source() gives the Italian back', () => {
  const { El, txt, doc } = fakeDom();
  const root = new El('div');
  const h = new El('h2'); const t1 = txt('Contatti'); h.append(t1);
  const name = new El('p'); const t2 = txt('Northbridge Logistics Ltd'); name.append(t2);
  const inp = new El('input', { placeholder: 'Cerca', type: 'text', value: 'Salva' });
  const btn = new El('input', { type: 'button', value: 'Salva' });
  const ta = new El('textarea', { placeholder: 'Nota' }); const t3 = txt('Salva'); ta.append(t3);
  const skip = new El('span', { 'data-i18n-skip': '' }); const t4 = txt('Salva'); skip.append(t4);
  const money = new El('td'); const t5 = txt('€ 1,200'); money.append(t5);
  root.append(h, name, inp, btn, ta, skip, money);
  const dom = I.makeDom({ document: doc }, T);
  dom.tree(root);
  assert.equal(t1.data, 'Contacts');
  assert.equal(t2.data, 'Northbridge Logistics Ltd');
  assert.equal(inp.getAttribute('placeholder'), T.tr('Cerca'));
  assert.equal(inp.getAttribute('value'), 'Salva', 'a text input value is user data');
  assert.equal(btn.getAttribute('value'), 'Save');
  assert.equal(t3.data, 'Salva', 'textarea content is user data');
  assert.equal(ta.getAttribute('placeholder'), T.tr('Nota'), 'textarea placeholder is UI');
  assert.equal(t4.data, 'Salva');
  assert.equal(t5.data, '£1,200');
  assert.equal(dom.source(t1), 'Contatti');
  assert.equal(dom.source(h), 'Contatti');
  assert.equal(dom.sourceAttr(inp, 'placeholder'), 'Cerca');
});

test('pages: every CRM page loads the language layer before its scripts, and Italian is the default', () => {
  const pages = ['radix-sales.html', 'lead-intelligence.html', 'sales-pipeline-premium.html', 'sales-growth-campaigns.html', 'sales-growth-projects.html', 'sales-linkedin.html', 'sales-vendite.html', 'sales-orbit-higgsfield.html'];
  for (const p of pages) {
    const html = fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
    const i = html.indexOf('<script src="/lib/radix-i18n.js"></script>');
    assert.ok(i > 0, p);
    assert.ok(html.indexOf('/lib/radix-i18n-en.js') < i, p);
    assert.ok(html.indexOf('/lib/radix-i18n.css') > 0, p);
    const first = html.search(/<script\b/);
    assert.ok(first >= html.indexOf('/lib/radix-i18n-en.js') - 13, p + ': no script before the language layer');
  }
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib/radix-i18n.js'), 'utf8');
  assert.match(src, /return lang \|\| 'it';/);
});

test('pages: the Command Center pages load the language layer before any script too', () => {
  const pages = ['control-center-v2.html', 'radix-pm-concept.html', 'impostazioni.html', 'agents.html', 'archive.html', 'project-profile.html', 'radix-ecosystem.html'];
  for (const p of pages) {
    const html = fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
    const i = html.indexOf('<script src="/lib/radix-i18n.js"></script>');
    assert.ok(i > 0, p);
    assert.ok(html.indexOf('/lib/radix-i18n-en.js') < i, p);
    assert.ok(html.indexOf('/lib/radix-i18n.css') > 0, p);
    const first = html.search(/<script\b/);
    assert.ok(first >= html.indexOf('/lib/radix-i18n-en.js') - 13, p + ': no script before the language layer');
  }
});

test('Command Center strings: journey, activity and approvals written by the server read in English', () => {
  assert.equal(T.display('3 campi da completare', true), '3 fields to complete');
  assert.equal(T.display('Piano approvato · 4 contenuti', true), 'Plan approved · 4 items');
  assert.equal(T.display('Alex Morgan ha salvato il piano editoriale', true), 'Alex Morgan saved the editorial plan');
  assert.equal(T.display('Aura Skincare · richiesta da una persona del team', true), 'Aura Skincare · requested by a team member');
  assert.equal(T.tr('Rossi e Figli ha creato il cliente Bianchi Srl'), 'Rossi e Figli created the client Bianchi Srl', 'names stay as typed');
});
