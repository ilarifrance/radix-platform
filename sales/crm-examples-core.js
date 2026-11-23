'use strict';
/* Example data for Sales Orbis: a few companies, contacts, opportunities and tasks that a person loads with one button
   to see how the CRM works, each marked «[Esempio]» in its name so that one more button removes exactly those.
   Pure: what to create (plan) and which rows are examples (isExample, pick). The writes are in crm-examples.js. */
(function (root) {
  const TAGS = ['[Esempio] ', '[Example] '];
  const tagOf = lang => lang === 'en' ? TAGS[1] : TAGS[0];
  const STAGES = { it: [['Primo contatto', 10], ['Qualifica', 25], ['Proposta', 50], ['Negoziazione', 75], ['Firma', 90]], en: [['First contact', 10], ['Qualification', 25], ['Proposal', 50], ['Negotiation', 75], ['Signature', 90]] };
  const DATA = {
    it: {
      pipeline: 'Vendita',
      companies: [['Officine Riva', 'Meccanica', 'Brescia'], ['Pastificio Colle', 'Alimentare', 'Parma'], ['Studio Lumen', 'Servizi', 'Milano'], ['Trasporti Adige', 'Logistica', 'Verona']],
      contacts: [['Giulia', 'Ferri', 'Direttrice acquisti', 0], ['Marco', 'Bassi', 'Titolare', 1], ['Sara', 'Conti', 'Responsabile IT', 2], ['Luca', 'Moretti', 'Responsabile operativo', 3]],
      deals: [['Linea di confezionamento', 0, 4800000, 2, 20], ['Fornitura annuale etichette', 1, 1250000, 1, 35], ['Licenze gestionale', 2, 3600000, 3, 12], ['Magazzino automatico', 3, 9200000, 0, 60]],
      tasks: [['Richiamare per la proposta', 0, 0], ['Inviare il listino aggiornato', 1, 1], ['Preparare la demo', 2, 3]]
    },
    en: {
      pipeline: 'Sales',
      companies: [['Riva Engineering', 'Engineering', 'Leeds'], ['Hill Foods', 'Food', 'Bristol'], ['Lumen Studio', 'Services', 'London'], ['Adige Transport', 'Logistics', 'Manchester']],
      contacts: [['Emma', 'Clarke', 'Head of purchasing', 0], ['James', 'Bennett', 'Owner', 1], ['Sarah', 'Collins', 'IT manager', 2], ['Luke', 'Morgan', 'Operations manager', 3]],
      deals: [['Packaging line', 0, 4800000, 2, 20], ['Yearly label supply', 1, 1250000, 1, 35], ['Software licences', 2, 3600000, 3, 12], ['Automated warehouse', 3, 9200000, 0, 60]],
      tasks: [['Call back about the proposal', 0, 0], ['Send the updated price list', 1, 1], ['Prepare the demo', 2, 3]]
    }
  };
  // now: ms. Indexes (company, contact, stage) point into the lists of the same plan.
  function plan(lang, now) {
    const l = lang === 'en' ? 'en' : 'it', d = DATA[l], tag = tagOf(l), day = n => new Date(now + n * 864e5);
    return {
      tag, pipeline: d.pipeline, stages: STAGES[l].map(([title, probability], position) => ({ title, probability, position })),
      companies: d.companies.map(([name, industry, city]) => ({ name: tag + name, industry, city })),
      contacts: d.contacts.map(([first, last, role, company]) => ({ company, data: { name: tag + first + ' ' + last, first_name: first, last_name: last, role, email: first.toLowerCase() + '@example.com' } })),
      deals: d.deals.map(([title, i, cents, stage, days]) => ({ company: i, contact: i, stage, data: { title: tag + title, amount_cents: cents, expected_close: day(days).toISOString().slice(0, 10) } })),
      tasks: d.tasks.map(([title, i, days]) => { const t = day(days); t.setUTCHours(9, 0, 0, 0); return { company: i, contact: i, data: { title: tag + title, due_at: t.toISOString().slice(0, 19) + 'Z' } }; })
    };
  }
  const label = r => String((r && (r.name || r.title)) || '');
  const isExample = r => TAGS.some(t => label(r).startsWith(t));
  // rows: {tasks, opportunities, contacts, companies}. The example rows, in the order they must be deleted.
  function pick(rows) {
    const out = [];
    ['tasks', 'opportunities', 'contacts', 'companies'].forEach(e => (rows[e] || []).forEach(r => { if (isExample(r)) out.push({ entity: e, id: r.id, version: r.version }); }));
    return out;
  }
  // Offered only to a workspace with no company, contact or opportunity of its own.
  const canLoad = rows => ['companies', 'contacts', 'opportunities'].every(e => !(rows[e] || []).length);
  const api = { TAGS, plan, isExample, pick, canLoad };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.RadixCrmExamples = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
