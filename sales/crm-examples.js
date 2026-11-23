'use strict';
/* Example data (rules in crm-examples-core.js): «Carica dati di esempio» on an empty workspace and «Rimuovi i dati di
   esempio» while any is there. Every write is an ordinary command of the CRM API, started by the person's click; the
   removal deletes only the rows whose name starts with «[Esempio]» / «[Example]», after a confirmation. */
(() => {
const P = window.RadixCrmProduct; if (!P || !P.here()) return;
const X = window.RadixCrmExamples; if (!X) return;
const app = () => window.RadixSalesApp;
const E = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined && text !== null) n.textContent = String(text); if (cls) n.className = cls; return n; };
const rows = () => { const a = app(), o = {}; ['tasks', 'opportunities', 'contacts', 'companies', 'processes', 'stages'].forEach(e => { o[e] = a ? a.rows(e) : []; }); return o; };
let working = false;
async function send(entity, action, data) {
  const a = app(), r = await a.api(entity, { body: { workspace: a.state.workspace, entity, action, data } });
  return r && r.rows && r.rows[0];
}
async function load() {
  const a = app(); if (!a || working || !a.writable('companies')) return;
  const I = window.RadixI18n, p = X.plan(I && I.en ? 'en' : 'it', Date.now()), r = rows();
  working = true; a.error(''); a.notice('Carico i dati di esempio…');
  try {
    let proc = r.processes.find(x => x.kind === 'opportunity' && r.stages.some(s => s.process_id === x.id)), stages;
    if (proc) stages = r.stages.filter(s => s.process_id === proc.id).sort((x, y) => (x.position || 0) - (y.position || 0));
    else {
      proc = await send('processes', 'create', { title: p.pipeline, kind: 'opportunity' }); stages = [];
      for (const s of p.stages) stages.push(await send('stages', 'create', { ...s, process_id: proc.id }));
    }
    const companies = [], contacts = [];
    for (const c of p.companies) companies.push(await send('companies', 'create', c));
    for (const c of p.contacts) contacts.push(await send('contacts', 'create', { ...c.data, company_id: companies[c.company].id }));
    const deals = [];
    for (const d of p.deals) deals.push(await send('opportunities', 'create', { ...d.data, company_id: companies[d.company].id, contact_id: contacts[d.contact].id, process_id: proc.id, stage_id: stages[Math.min(d.stage, stages.length - 1)].id }));
    for (const t of p.tasks) await send('tasks', 'create', { ...t.data, company_id: companies[t.company].id, contact_id: contacts[t.contact].id, opportunity_id: deals[t.company].id });
    await a.refresh(); a.notice('Dati di esempio caricati: li riconosci da «[Esempio]» nel nome.');
  } catch (e) { a.error((e && e.message ? e.message : 'Caricamento non riuscito.') + ' Premi Aggiorna e controlla cosa è stato creato.'); }
  finally { working = false; }
}
async function remove() {
  const a = app(); if (!a || working) return;
  const list = X.pick(rows()); if (!list.length) return;
  if (!window.confirm('Rimuovere i dati di esempio? Vengono eliminati solo i record con «[Esempio]» nel nome.')) return;
  working = true; a.error(''); a.notice('Rimuovo i dati di esempio…'); let failed = 0;
  for (const x of list) { try { await send(x.entity, 'delete', { id: x.id, version: x.version }); } catch { failed++; } }
  working = false; await a.refresh();
  if (failed) a.error('Alcuni record di esempio non sono stati eliminati (' + failed + '): hanno dati collegati. Eliminali dalla loro scheda.');
  else a.notice('Dati di esempio rimossi.');
}
// The box for the guide page and Panoramica: null when there is nothing to offer.
function box() {
  const a = app(); if (!a || !a.writable('companies')) return null;
  const r = rows(), have = X.pick(r).length;
  if (!have && !X.canLoad(r)) return null;
  const s = E('section', undefined, 'ex-box');
  const tx = E('div');
  if (have) { tx.append(E('b', 'Stai vedendo dei dati di esempio'), E('small', 'Servono a provare il CRM. Quando vuoi li togli con un clic: i tuoi dati restano.')); const b = E('button', 'Rimuovi i dati di esempio', 'ex-remove'); b.type = 'button'; b.onclick = remove; s.append(tx, b); }
  else { tx.append(E('b', 'Vuoi vedere come funziona?'), E('small', 'Carichiamo alcune aziende, contatti, opportunità e attività di esempio. Li togli quando vuoi con un clic.')); const b = E('button', 'Carica dati di esempio', 'ex-load'); b.type = 'button'; b.onclick = load; s.append(tx, b); }
  return s;
}
window.RadixCrmExamplesUi = { box, load, remove };
// Panoramica shows the same box under its title, so an empty workspace has something to do on the first screen.
const content = document.getElementById('content'); if (!content) return;
let q = false, busy = false;
function home() {
  const d = document.getElementById('dashboard'); if (!d || d.parentNode !== content) return;
  const old = d.querySelector(':scope>.ex-box'), b = box();
  busy = true;
  if (old) old.remove();
  if (b) { const first = d.querySelector(':scope>.row'); if (first) first.after(b); else d.prepend(b); }
  requestAnimationFrame(() => { busy = false; });
}
const later = () => { if (busy || q) return; q = true; setTimeout(() => { q = false; home(); }, 120); };
new MutationObserver(later).observe(content, { childList: true, subtree: true });
later();
})();
