'use strict';
/* Lead Intelligence «Percorso guidato»: what to do next and which sources and services work in this workspace.
   Pure (no DOM, no fetch), for sales/lead-guide.js and the tests. Input, all read from /api/sales:
   - lists: saved lead lists (entity lead_lists); crmLeads: whether the CRM has leads yet (entity leads, one row is enough);
   - chain: the paid email services with their state (entity email_finder: pronto / da collegare / non disponibile / spento);
   - provider: the Captain Data connection (entity lead_provider_status: {configured}).
   Nothing here calls a paid service: the guide only says what is ready and opens the step where the person decides. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.RadixLeadGuide = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // A step either opens a step of the page (go: 1..4, mode) or another page (href).
  function steps(d) {
    var lists = Number(d && d.lists) || 0, crm = Number(d && d.crmLeads) || 0;
    var ready = paidReady(d && d.chain);
    return [
      { id: 'import', title: 'Importa la prima lista di lead', done: lists > 0, go: 1,
        text: lists ? lists + (lists === 1 ? ' lista salvata.' : ' liste salvate.') : 'Dall’estensione Chrome per LinkedIn Sales Navigator, da un file CSV/Excel o dal file JSON di un provider.' },
      { id: 'crm', title: 'Porta i lead migliori nel CRM', done: crm > 0, go: 3,
        text: crm ? 'Ci sono già lead nel CRM: continua da «Porta nel CRM» o apri il CRM.' : 'Rivedi la lista, tieni chi è in target e portalo nel CRM come lead, con azienda e contatto.' },
      { id: 'email', title: 'Trova le email che mancano', done: null, href: '/crm#contacts',
        text: 'Nel CRM, da Contatti › «Trova email»: prima il sito dell’azienda e il DNS (gratis), poi ' +
          (ready.length ? ready.map(function (p) { return p.label; }).join(', ') + ', solo dopo una tua conferma.' : 'nessun servizio a pagamento: oggi non ce n’è uno collegato.') },
      { id: 'write', title: 'Scrivi la prima email', done: null, go: 4,
        text: 'Una bozza per contatto o una newsletter: l’AI propone, tu rivedi e confermi l’invio.' }
    ];
  }
  function paidReady(chain) { return (Array.isArray(chain) ? chain : []).filter(function (p) { return p && p.state === 'pronto'; }); }
  // The first step not done yet among the ones the guide can check; null when both are done.
  function next(list) { for (var i = 0; i < list.length; i++) if (list[i].done === false) return list[i]; return null; }
  function sources(d) {
    var out = [
      { label: 'Estensione Chrome · LinkedIn Sales Navigator', state: 'pronto', note: 'Si collega da «Collega estensione Chrome», nel passo 1.' },
      { label: 'File CSV o Excel', state: 'pronto', note: null },
      { label: 'File JSON di un provider', state: 'pronto', note: null },
      { label: 'Captain Data (API)', state: d && d.provider && d.provider.configured ? 'pronto' : 'da collegare',
        note: d && d.provider && d.provider.configured ? null : 'Serve la chiave del servizio, a cura dell’amministratore.' },
      { label: 'Email dal sito dell’azienda e dal DNS', state: 'pronto', note: 'Gratis, sempre attiva.' }
    ];
    // The paid email services the workspace can use (a service with no public API for it stays out of the list).
    (Array.isArray(d && d.chain) ? d.chain : []).forEach(function (p) {
      if (!p || !p.label || p.state === 'non disponibile') return;
      out.push({ label: 'Email con ' + p.label + ' (a pagamento)', state: p.state || 'da collegare',
        note: p.state === 'da collegare' ? 'Serve la chiave del servizio, a cura dell’amministratore.' : p.state === 'spento' ? 'Spento nelle impostazioni del workspace.' : (p.cost || null) });
    });
    return out;
  }
  function summary(list) {
    var tracked = list.filter(function (s) { return s.done !== null; }), done = tracked.filter(function (s) { return s.done; }).length;
    return done + ' di ' + tracked.length + ' fatti';
  }
  return { steps: steps, next: next, sources: sources, summary: summary, paidReady: paidReady };
});
