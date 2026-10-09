/* RADIX CRM concept. No network, storage, AI or speech services. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RadixCRM = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const stages = ['Qualifica', 'Proposta', 'Negoziazione', 'Vinta', 'Persa'];
  const example = 'Azienda: Aurora Meccanica Demo; Contatto: Giulia Ferri (persona fittizia); Opportunità: Progetto sviluppo commerciale; Valore: 35000 EUR; Probabilità: 60%; Fase: Proposta; Attività: richiamare il contatto prossimo martedì.';
  function parseNote(note) {
    if (typeof note !== 'string' || !note.trim()) throw new Error('Scrivi una nota prima di creare la bozza.');
    const evidence = {}, warnings = [];
    function field(name, regex) { const m = note.match(regex); if (m) { evidence[name] = m[0].trim(); return m[1].trim(); } return ''; }
    const company = field('company', /(?:^|[;\n])\s*Azienda:\s*([^;\n]+)/i);
    const contact = field('contact', /(?:^|[;\n])\s*Contatto:\s*([^;\n]+)/i);
    const title = field('title', /(?:^|[;\n])\s*Opportunità:\s*([^;\n]+)/i);
    const amountText = field('amount', /\b(\d+(?:\.\d{3})*(?:,\d{1,2})?)\s*(?:EUR|€)/i);
    const probabilityText = field('probability', /\b(\d+(?:[.,]\d+)?)\s*%/);
    const stageText = field('stage', /(?:^|[;\n])\s*Fase:\s*([^;\n]+)/i);
    const stage = stages.find(s => s.toLowerCase() === stageText.toLowerCase()) || '';
    const activity = field('activity', /(?:^|[;\n])\s*Attività:\s*([^;\n]+)/i);
    const dateExpression = field('dateExpression', /(?<!\p{L})(prossimo\s+\p{L}+|domani|dopodomani|oggi|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{4}-\d{2}-\d{2})(?!\p{L})/iu);
    if (dateExpression) warnings.push('Data da confermare: «' + dateExpression + '». Nessuna scadenza è stata dedotta; scegli una data oppure lascia da definire.');
    if ((note.match(/\d+(?:\.\d{3})*(?:,\d{1,2})?\s*(?:EUR|€)/gi) || []).length > 1) warnings.push('Più importi nella nota: estratto solo il primo, verifica il valore.');
    if (!company || !title || !activity) warnings.push('Campi mancanti: completa azienda, opportunità e attività prima di salvare.');
    warnings.push('Parser locale a regole, non AI: legge etichette e pochi formati numerici. Non interpreta negazioni, intenzioni o tutti i formati. Ogni campo richiede revisione.');
    return { source: note, company, contact, title, amount: amountText ? Number(amountText.replace(/\./g, '').replace(',', '.')) : '', probability: probabilityText ? Number(probabilityText.replace(',', '.')) : '', stage, activity, dateExpression, dueDate: '', evidence, warnings };
  }
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(value + 'T00:00:00Z');
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
  }
  function createState() {
    return { sequence: 10, companies: [{id:'c1',name:'Orizzonte Lab Demo'},{id:'c2',name:'Bosco Sistemi Demo'}], contacts:[{id:'p1',companyId:'c1',name:'Elena Riva · fittizia'},{id:'p2',companyId:'c2',name:'Luca Mori · fittizio'}], leads:[{id:'l1',companyId:'c1',name:'Richiesta esplorativa',status:'Qualificato'},{id:'l2',companyId:'c2',name:'Interesse servizi B2B',status:'Da qualificare'}], opportunities:[{id:'o1',companyId:'c1',title:'Percorso commerciale demo',amount:18000,probability:40,stage:'Qualifica',noteId:'n1'},{id:'o2',companyId:'c2',title:'Sviluppo rete demo',amount:24000,probability:70,stage:'Negoziazione',noteId:'n2'}], activities:[{id:'a1',companyId:'c1',opportunityId:'o1',title:'Verificare obiettivi con il contatto',dueDate:'',dateExpression:'Da concordare',done:false,noteId:'n1'}], notes:[{id:'n1',companyId:'c1',opportunityId:'o1',text:'Scenario sintetico: obiettivi e tempistiche da validare.'},{id:'n2',companyId:'c2',opportunityId:'o2',text:'Scenario sintetico: manca una prossima attività.'}], history:[{id:'h1',text:'Caricato dataset dimostrativo, non dati reali.',noteId:null}] };
  }
  function saveDraft(state, draft, confirmed) {
    if (confirmed !== true) throw new Error('Conferma esplicitamente la revisione prima del salvataggio.');
    for (const key of ['source','company','title','activity']) if (typeof draft[key] !== 'string' || !draft[key].trim()) throw new Error('Completa nota, azienda, opportunità e attività.');
    if (draft.amount === '' || draft.probability === '' || !Number.isFinite(Number(draft.amount)) || Number(draft.amount) < 0 || !Number.isFinite(Number(draft.probability)) || Number(draft.probability) < 0 || Number(draft.probability) > 100) throw new Error('Verifica valore e probabilità (0–100%).');
    if (!stages.includes(draft.stage)) throw new Error('Seleziona una fase valida.');
    if (draft.dueDate && !validDate(draft.dueDate)) throw new Error('La data selezionata non è valida.');
    const id = prefix => prefix + (++state.sequence);
    let company = state.companies.find(c => c.name.toLocaleLowerCase() === draft.company.trim().toLocaleLowerCase());
    if (!company) { company = {id:id('c'),name:draft.company.trim()}; state.companies.push(company); }
    if (draft.contact && !state.contacts.some(c => c.companyId === company.id && c.name === draft.contact.trim())) state.contacts.push({id:id('p'),companyId:company.id,name:draft.contact.trim()});
    const noteId = id('n'), opportunityId = id('o');
    state.notes.push({id:noteId,companyId:company.id,opportunityId,text:draft.source,evidence:{...draft.evidence}});
    state.opportunities.push({id:opportunityId,companyId:company.id,title:draft.title.trim(),amount:Number(draft.amount),probability:Number(draft.probability),stage:draft.stage,noteId});
    state.activities.push({id:id('a'),companyId:company.id,opportunityId,title:draft.activity.trim(),dueDate:draft.dueDate || '',dateExpression:draft.dateExpression || 'Da definire',done:false,noteId});
    state.leads.push({id:id('l'),companyId:company.id,name:draft.title.trim(),status:'Da nota confermata',noteId});
    state.history.unshift({id:id('h'),text:'Bozza revisionata: create opportunità e attività per ' + company.name + '. Scadenza: ' + (draft.dueDate || 'da definire') + '.',noteId,opportunityId,reviewed:{company:draft.company,contact:draft.contact,title:draft.title,amount:Number(draft.amount),probability:Number(draft.probability),stage:draft.stage,activity:draft.activity,dueDate:draft.dueDate || ''}});
    return opportunityId;
  }
  function moveOpportunity(state, opportunityId, stage) {
    const op = state.opportunities.find(o => o.id === opportunityId);
    if (!op || !stages.includes(stage)) throw new Error('Opportunità o fase non valida.');
    if (op.stage === stage) return;
    const previous = op.stage; op.stage = stage;
    state.history.unshift({id:'h'+(++state.sequence),text:op.title + ': ' + previous + ' → ' + stage + '.',noteId:op.noteId,opportunityId});
  }
  function completeActivity(state, activityId) {
    const a = state.activities.find(item => item.id === activityId);
    if (!a) throw new Error('Attività non trovata.');
    if (a.done) return;
    a.done = true;
    state.history.unshift({id:'h'+(++state.sequence),text:'Attività completata nella demo: ' + a.title,noteId:a.noteId,opportunityId:a.opportunityId});
  }
  function summarize(state) {
    const open = state.opportunities.filter(o => !['Vinta','Persa'].includes(o.stage));
    return {open:open.length,total:open.reduce((s,o)=>s+o.amount,0),weighted:open.reduce((s,o)=>s+o.amount*o.probability/100,0),pending:state.activities.filter(a=>!a.done).length,risks:open.flatMap(o=>{
      const pending = state.activities.filter(a=>a.opportunityId===o.id&&!a.done);
      return !pending.length ? [o.title + ': manca una prossima attività.'] : pending.some(a=>!a.dueDate) ? [o.title + ': scadenza da confermare.'] : [];
    })};
  }
  return {stages,example,parseNote,validDate,createState,saveDraft,moveOpportunity,completeActivity,summarize};
});
