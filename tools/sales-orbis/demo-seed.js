'use strict';
/* Fake records for the Sales Orbis demo (tools/sales-orbis/demo-server.js --seed): a small B2B pipeline, invented names only,
   written through the real CRM API with the demo account. */
async function seed({ port, email, password, workspace }) {
  const base = 'http://127.0.0.1:' + port;
  const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (!login.ok) throw new Error('demo login failed: ' + login.status);
  const cookie = String(login.headers.get('set-cookie') || '').split(';')[0];
  async function create(entity, data) {
    const r = await fetch(base + '/api/sales', { method: 'POST', headers: { cookie, 'content-type': 'application/json', 'x-radix-sales': '1' }, body: JSON.stringify({ workspace, entity, action: 'create', data }) });
    const d = await r.json();
    if (!r.ok) throw new Error(entity + ': ' + (d.error || r.status));
    return d.rows[0];
  }
  const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const proc = await create('processes', { title: 'Vendita B2B', kind: 'opportunity' });
  const names = [['Primo contatto', 10], ['Qualifica', 25], ['Proposta', 50], ['Negoziazione', 75], ['Firma', 90]];
  const stages = [];
  for (let i = 0; i < names.length; i++) stages.push(await create('stages', { title: names[i][0], process_id: proc.id, position: i, probability: names[i][1] }));
  const companies = [];
  for (const [name, industry, city] of [['Aurora Meccanica Demo', 'Meccanica', 'Brescia'], ['Bluverde Foods Demo', 'Alimentare', 'Parma'], ['Castello Software Demo', 'Software', 'Milano'], ['Delta Logistica Demo', 'Logistica', 'Verona'], ['Elmo Design Demo', 'Arredo', 'Udine']])
    companies.push(await create('companies', { name, industry, city }));
  const contacts = [];
  for (const [first, last, role, c] of [['Giulia', 'Ferri', 'Direttrice acquisti', 0], ['Marco', 'Bassi', 'CEO', 1], ['Sara', 'Conti', 'Responsabile IT', 2], ['Luca', 'Moretti', 'Operations manager', 3], ['Elena', 'Rizzi', 'Titolare', 4]])
    contacts.push(await create('contacts', { first_name: first, last_name: last, role, company_id: companies[c].id, email: first.toLowerCase() + '@example.com' }));
  const deals = [['Linea di assemblaggio 2027', 0, 4800000, 2, 20], ['Fornitura etichette', 1, 1250000, 1, 35], ['Licenze gestionale', 2, 3600000, 3, 12], ['Magazzino automatico', 3, 9200000, 0, 60], ['Showroom Udine', 4, 780000, 2, 9]];
  for (const [title, i, cents, s, days] of deals)
    await create('opportunities', { title, company_id: companies[i].id, contact_id: contacts[i].id, process_id: proc.id, stage_id: stages[s].id, amount_cents: cents, expected_close: day(days) });
  for (const [title, i, d] of [['Richiamare per la proposta', 0, 0], ['Inviare il listino aggiornato', 1, 1], ['Demo del gestionale', 2, -2], ['Sopralluogo in magazzino', 3, 5]])
    await create('tasks', { title, company_id: companies[i].id, contact_id: contacts[i].id, due_at: new Date(Date.now() + d * 864e5).toISOString() });
  return { companies: companies.length, contacts: contacts.length, opportunities: deals.length };
}
module.exports = { seed };
