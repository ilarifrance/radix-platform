'use strict';
/* «Guida alla configurazione» (#guida) on Sales Orbis: its own page in the menu, with the steps in groups, a progress bar
   and one main button, the next step to do (rules in crm-guide-core.js). Read only: it reads the rows sales.js loaded. */
(() => {
const content = document.getElementById('content'); if (!content) return;
const P = window.RadixCrmProduct; if (!P || !P.here()) return;
const app = () => window.RadixSalesApp;
const E = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined && text !== null) n.textContent = String(text); if (cls) n.className = cls; return n; };
let busy = false;
function ensure() {
  if ((location.hash || '') !== '#guida') { document.getElementById('guida')?.remove(); return null; }
  let s = document.getElementById('guida');
  if (!s || s.parentNode !== content) { s = E('section', undefined, 'panel gd-section'); s.id = 'guida'; content.append(s); }
  content.querySelectorAll(':scope>section.rx-view').forEach(x => { if (x !== s) x.classList.remove('rx-view'); });
  s.classList.add('rx-view'); document.documentElement.classList.add('rx-has-view'); return s;
}
function data() {
  const a = app(), d = {};
  ['processes', 'stages', 'companies', 'contacts', 'opportunities', 'leads', 'interactions', 'tasks'].forEach(e => { d[e] = a ? a.rows(e) : []; });
  return d;
}
function stepRow(s, isNext) {
  const li = E('li', undefined, 'gd-step' + (s.done ? ' is-done' : ''));
  const mark = E('span', s.done ? '✓' : '', 'gd-mark'); mark.setAttribute('aria-hidden', 'true');
  const tx = E('div'); tx.append(E('b', s.label), E('small', s.hint));
  li.append(mark, tx);
  if (s.done) li.append(E('span', 'Fatto', 'gd-state'));
  else { const a = E('a', isNext ? 'Inizia' : 'Apri', isNext ? 'gd-go primary' : 'gd-go'); a.href = s.href; a.setAttribute('aria-label', (isNext ? 'Inizia' : 'Apri') + ': ' + s.label); li.append(a); }
  return li;
}
function draw() {
  const s = ensure(); if (!s) return;
  const G = window.RadixCrmGuide, O = window.RadixCrmOnboarding, a = app(); if (!G || !O || !a) return;
  busy = true;
  let plan = ''; try { plan = localStorage.getItem('rx-ws-plan') || ''; } catch { /* storage blocked */ }
  const gs = G.groups(data(), O, { lead: !['completo', 'avanzato'].includes(plan), product: true }), pr = G.progress(gs), nx = G.next(gs);
  s.replaceChildren();
  const head = E('div', undefined, 'row'); head.append(E('h2', 'Guida alla configurazione')); s.append(head);
  const top = E('div', undefined, 'gd-top');
  top.append(E('p', pr.complete ? 'Hai completato tutti i passi: il CRM è pronto.' : pr.done + ' di ' + pr.total + ' passi completati', 'gd-count'));
  const bar = E('div', undefined, 'gd-bar'); bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', String(pr.total)); bar.setAttribute('aria-valuenow', String(pr.done)); bar.setAttribute('aria-label', 'Passi completati');
  const fill = E('progress'); fill.max = pr.total; fill.value = pr.done; bar.append(fill); top.append(bar); s.append(top);
  const ex = window.RadixCrmExamplesUi && window.RadixCrmExamplesUi.box(); if (ex) s.append(ex);
  gs.forEach(g => {
    const box = E('details', undefined, 'gd-group'); box.open = g.done < g.total;
    const sum = E('summary'); sum.append(E('span', g.title, 'gd-title'), E('small', g.done === g.total ? 'Fatto' : g.time), E('small', g.done + ' di ' + g.total, 'gd-of'));
    const ol = E('ol', undefined, 'gd-steps'); g.steps.forEach(st => ol.append(stepRow(st, st === nx)));
    box.append(sum, ol); s.append(box);
  });
  const more = E('section', undefined, 'gd-more'); more.append(E('h3', 'Scopri di più'));
  const ul = E('ul', undefined, 'gd-steps');
  G.MORE.forEach(m => { const li = E('li', undefined, 'gd-step'); const tx = E('div'); tx.append(E('b', m.label), E('small', m.hint)); const go = E('a', 'Apri', 'gd-go'); go.href = m.href; go.setAttribute('aria-label', 'Apri: ' + m.label); li.append(tx, go); ul.append(li); });
  more.append(ul); s.append(more);
  requestAnimationFrame(() => { busy = false; });
}
let q = false; const later = () => { if (busy || q) return; q = true; setTimeout(() => { q = false; draw(); }, 60); };
new MutationObserver(() => { if (!busy) later(); }).observe(content, { childList: true });
addEventListener('hashchange', later);
document.getElementById('workspace')?.addEventListener('change', () => setTimeout(later, 0));
later();
})();
