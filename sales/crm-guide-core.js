'use strict';
/* «Guida alla configurazione» of Sales Orbis (#guida): the steps of «Primi passi» (crm-onboarding-core.js) in three
   groups, each with an estimated time, plus «Scopri di più» for what is not urgent. Pure: a step is done only when the
   workspace data shows it. */
(function (root) {
  const list = v => Array.isArray(v) ? v : [];
  const GROUPS = [
    { id: 'base', title: 'Prepara il CRM', time: '5 min', steps: ['pipeline', 'company', 'contact'] },
    { id: 'deals', title: 'Lavora le trattative', time: '5 min', steps: ['opportunity', 'task'] },
    { id: 'reach', title: 'Trova e contatta nuovi clienti', time: '10 min', steps: ['lead', 'campaign'] }
  ];
  const MORE = [
    { id: 'mailbox', label: 'Collega la tua casella email', hint: 'Per leggere e inviare la posta dal CRM.', href: '/impostazioni.html?area=sales#caselle' },
    { id: 'import', label: 'Importa aziende e contatti da un file', hint: 'Da Contatti o Aziende, con «Azioni» › «Importa».', href: '#contacts' },
    { id: 'team', label: 'Invita i colleghi', hint: 'Ogni persona entra con il suo account.', href: '/impostazioni.html?area=sales' },
    { id: 'pipeline', label: 'Personalizza le colonne della pipeline', hint: 'Nomi, ordine e probabilità di ogni fase.', href: '/sales-pipeline-premium.html' }
  ];
  // d: the workspace rows by entity; O: RadixCrmOnboarding; opts as in O.steps().
  function groups(d, O, opts) {
    const by = {};
    O.steps(d, opts).forEach(s => { by[s.id] = s; });
    by.task = { id: 'task', label: 'Pianifica la prima attività', hint: 'Una telefonata o un promemoria con la sua scadenza.', done: list((d || {}).tasks).length > 0, href: '#tasks' };
    return GROUPS.map(g => {
      const steps = g.steps.map(id => by[id]).filter(Boolean);
      return { id: g.id, title: g.title, time: g.time, steps, done: steps.filter(s => s.done).length, total: steps.length };
    });
  }
  function progress(gs) {
    const done = gs.reduce((n, g) => n + g.done, 0), total = gs.reduce((n, g) => n + g.total, 0);
    return { done, total, left: total - done, complete: done === total };
  }
  // The first step still to do: the one the page offers with its main button.
  function next(gs) { for (const g of gs) for (const s of g.steps) if (!s.done) return s; return null; }
  const api = { GROUPS, MORE, groups, progress, next };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.RadixCrmGuide = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
