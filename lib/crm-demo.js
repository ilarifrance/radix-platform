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

  // Demo-only CRUD: no server authority, requests or real account data.
  const editable = {
    companies:['name'], contacts:['name','companyId'], leads:['name','companyId','status'],
    opportunities:['title','companyId','amount','probability','stage'],
    activities:['title','companyId','opportunityId','owner','priority','dueDate','done']
  };
  function record(state,entity,id) {
    if (!Object.hasOwn(editable,entity)) throw new Error('Entita demo non valida.');
    const found=state[entity].find(row=>row.id===id);
    if(!found) throw new Error('Record demo non trovato.');
    return found;
  }
  function saveRecord(state,entity,input,id) {
    if(!Object.hasOwn(editable,entity)||!input||typeof input!=='object'||Array.isArray(input)) throw new Error('Entita o dati non validi.');
    if(Object.keys(input).some(key=>!editable[entity].includes(key))) throw new Error('Campo non modificabile.');
    const old=id?record(state,entity,id):null;
    const next={...(old||{}),...input};
    const text=(key,max,required=true)=>{
      if(next[key]===undefined&&!required){next[key]='';return;}
      if(typeof next[key]!=='string'||next[key].length>max||(required&&!next[key].trim())) throw new Error('Verifica il campo '+key+'.');
      next[key]=next[key].trim();
    };
    text(entity==='companies'||entity==='contacts'||entity==='leads'?'name':'title',200);
    if(entity!=='companies') record(state,'companies',next.companyId);
    if(entity==='leads'&&!['Da qualificare','Qualificato','Non qualificato','Da nota confermata'].includes(next.status)) throw new Error('Stato lead non valido.');
    if(entity==='opportunities') {
      if(typeof next.amount!=='number'||!Number.isFinite(next.amount)||next.amount<0||next.amount>1000000000||Math.abs(next.amount*100-Math.round(next.amount*100))>0.00001) throw new Error('Valore EUR non valido (massimo due decimali).');
      if(typeof next.probability!=='number'||!Number.isFinite(next.probability)||next.probability<0||next.probability>100) throw new Error('Probabilita non valida.');
      if(!stages.includes(next.stage)) throw new Error('Fase non valida.');
      if(old&&old.companyId!==next.companyId&&(state.activities.some(a=>a.opportunityId===id)||state.notes.some(n=>n.opportunityId===id))) throw new Error('Contesto collegato: non puoi cambiare azienda.');
    }
    if(entity==='activities') {
      const op=record(state,'opportunities',next.opportunityId);
      if(op.companyId!==next.companyId) throw new Error('Azienda e opportunita incoerenti.');
      text('owner',80,false);next.priority=next.priority===undefined?'normal':next.priority;
      if(!['low','normal','high','urgent'].includes(next.priority)) throw new Error('Priorita non valida.');
      next.dueDate=next.dueDate===undefined?'':next.dueDate;
      if(typeof next.dueDate!=='string'||(next.dueDate&&!validDate(next.dueDate))) throw new Error('Scadenza non valida.');
      next.done=next.done===undefined?false:next.done;
      if(typeof next.done!=='boolean') throw new Error('Completamento non valido.');
      if(old&&old.noteId&&(old.companyId!==next.companyId||old.opportunityId!==next.opportunityId)) throw new Error('Nota collegata: contesto non modificabile.');
    }
    if(old&&editable[entity].every(key=>old[key]===next[key])) return old;
    if(!old)next.id=({companies:'c',contacts:'p',leads:'l',opportunities:'o',activities:'a'})[entity]+(++state.sequence);
    if(old)Object.assign(old,next);else state[entity].push(next);
    state.history.unshift({id:'h'+(++state.sequence),text:(old?'Modificato':'Creato')+' record demo '+entity+': '+(next.name||next.title)+'.',noteId:next.noteId||null,opportunityId:entity==='opportunities'?next.id:next.opportunityId});
    return old||next;
  }
  function deleteRecord(state,entity,id) {
    const row=record(state,entity,id);
    if(entity==='companies'&&['contacts','leads','opportunities','activities','notes'].some(type=>state[type].some(child=>child.companyId===id))) throw new Error('Azienda ancora collegata: elimina prima i record dipendenti.');
    if(entity==='opportunities'&&['activities','notes'].some(type=>state[type].some(child=>child.opportunityId===id))) throw new Error('Opportunita ancora collegata ad attivita o note.');
    state[entity].splice(state[entity].indexOf(row),1);
    state.history.unshift({id:'h'+(++state.sequence),text:'Eliminato record demo '+entity+': '+(row.name||row.title)+'.',noteId:row.noteId||null});
  }
  function customer360(state,companyId) {
    const company=record(state,'companies',companyId);
    return {company,contacts:state.contacts.filter(r=>r.companyId===companyId),leads:state.leads.filter(r=>r.companyId===companyId),opportunities:state.opportunities.filter(r=>r.companyId===companyId),activities:state.activities.filter(r=>r.companyId===companyId),notes:state.notes.filter(r=>r.companyId===companyId)};
  }
  return {stages,example,parseNote,validDate,createState,saveDraft,moveOpportunity,completeActivity,summarize,saveRecord,deleteRecord,customer360};
});
