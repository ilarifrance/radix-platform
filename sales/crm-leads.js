'use strict';
/* CRM «Lead» view (radix-sales.html#leads), as in Salesforce: the status path with counts, tabs, one table
   (cards on a phone) with the status picker on each row, and «Converti», which turns the lead into an
   opportunity of a pipeline with the same company and contact. sales.js calls section() while it renders
   #leads and keeps the generic cards when this returns false. Data: the rows sales.js already loaded.
   Writes go through RadixSalesApp.mutate (same API, reload and errors as every other save). Logic and
   payloads: sales/crm-leads-core.js. */
(()=>{
const L=window.RadixCrmLeadsCore;if(!L)return;
const app=()=>window.RadixSalesApp;
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n};
const btn=(text,fn,cls)=>{const b=E('button',text,cls);b.type='button';b.addEventListener('click',fn);return b};
const state={tab:'aperti'};
const rows=e=>app()?.rows(e)||[];
const byId=(e,id)=>id?rows(e).find(r=>r.id===id):null;
const nameOf=(e,id)=>{const r=byId(e,id);return r?(r.name||r.title||''):''};
const memberName=id=>id==null?'':rows('members').find(m=>String(m.id)===String(id))?.name||'';
const day=v=>{const d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleDateString('it-IT',{day:'2-digit',month:'short',year:'numeric'}):''};

// ---- dialog (status reason and «Converti») ----
let dialog=null,pending=null;
function sheet(){
 if(dialog)return dialog;
 dialog=E('dialog',undefined,'ld-sheet');dialog.setAttribute('aria-labelledby','ld-sheet-title');
 const form=E('form');form.method='dialog';form.noValidate=true;
 const head=E('div',undefined,'ld-sheet-head');head.append(E('h2','',''),btn('Chiudi',()=>close(),'ld-close'));head.querySelector('h2').id='ld-sheet-title';
 form.append(head,E('div',undefined,'ld-sheet-body'),E('p','','ld-sheet-error'));
 const actions=E('div',undefined,'ld-sheet-actions');const ok=E('button','','primary ld-ok');ok.type='submit';actions.append(btn('Annulla',()=>close(),'ld-cancel'),ok);form.append(actions);
 form.addEventListener('submit',e=>{e.preventDefault();pending?.submit()});
 dialog.addEventListener('cancel',e=>{if(app()?.state.busy)e.preventDefault()});
 dialog.append(form);document.body.append(dialog);return dialog;
}
function close(){if(app()?.state.busy)return;pending=null;dialog?.close()}
function open(title,okText,build,submit){
 const d=sheet();d.querySelector('h2').textContent=title;d.querySelector('.ld-ok').textContent=okText;
 const body=d.querySelector('.ld-sheet-body');body.replaceChildren();const err=d.querySelector('.ld-sheet-error');err.textContent='';err.hidden=true;
 const fail=m=>{err.textContent=m||'';err.hidden=!m};
 pending={submit:()=>submit(fail)};build(body,fail);d.showModal();body.querySelector('input,select,textarea')?.focus();
}
const field=(label,control,hint)=>{const l=E('label',undefined,'ld-field');l.append(E('span',label),control);if(hint)l.append(E('small',hint));return l};
const input=(value,attrs={})=>{const i=E('input');i.value=value??'';for(const [k,v] of Object.entries(attrs))i[k]=v;return i};
const select=(choices,value)=>{const s=E('select');for(const [v,t] of choices){const o=E('option',t);o.value=v;s.append(o)}s.value=value==null?'':String(value);return s};

// Errors stay in the open dialog too (sales.js writes them at the top of the page, behind it).
async function save(action,data,done,fail){const ok=await app().mutate('leads',action,data,null);if(ok){pending=null;dialog?.open&&dialog.close();done?.()}else fail?.(document.getElementById('error')?.textContent||'Salvataggio non riuscito: premi Aggiorna e riprova.');return ok}

function changeStatus(lead,status){
 if(status==='non_qualificato'){
  let reason;
  open('Lead non qualificato','Salva',body=>{
   body.append(E('p','«'+lead.title+'» esce dalla coda dei lead aperti. Il motivo aiuta a capire quali liste non funzionano.','ld-sheet-lead'));
   reason=E('textarea');reason.maxLength=500;reason.rows=3;reason.value=lead.status_reason||'';reason.placeholder='Es. Azienda troppo piccola, nessun budget, fuori zona';
   body.append(field('Perché non è qualificato? *',reason));
  },fail=>{const p=L.statusPayload(lead,status,reason.value);if(p.error)return fail(p.error);save('update',p.data,()=>app().notice('«'+lead.title+'» segnato come non qualificato.'),fail)});
  return;
 }
 const p=L.statusPayload(lead,status);if(p.error){app().error(p.error);return}
 save('update',p.data,()=>app().notice('«'+lead.title+'» ora è '+L.LABEL[status]+'.'));
}

function convert(lead){
 const pipes=L.pipelines(rows('processes'),rows('stages'));const def=L.convertDefaults(lead,pipes);const key=crypto.randomUUID();
 const names={company:nameOf('companies',lead.company_id),contact:nameOf('contacts',lead.contact_id)};
 let f;
 open('Converti il lead','Converti',(body,fail)=>{
  const who=E('div',undefined,'ld-sheet-lead');who.append(E('b',lead.title),E('small',[names.contact,names.company].filter(Boolean).join(' · ')||'Senza azienda né contatto collegati'));body.append(who);
  const create=E('input');create.type='checkbox';create.checked=pipes.length>0;create.disabled=!pipes.length;
  const createBox=E('label',undefined,'ld-check');createBox.append(create,E('span','Crea una trattativa nella pipeline'));body.append(createBox);
  if(!pipes.length)body.append(E('p','Nel CRM non c’è ancora una pipeline con fasi: puoi convertire il lead senza trattativa, oppure crea prima la pipeline in «Processi».','ld-note'));
  const box=E('div',undefined,'ld-grid');
  const title=input(def.title,{maxLength:200,required:true});
  const proc=select(pipes.map(p=>[p.id,p.title]),def.process_id);
  const stage=E('select');const fill=()=>{const p=pipes.find(x=>x.id===proc.value);stage.replaceChildren(...(p?.stages||[]).map(s=>Object.assign(E('option',s.title),{value:s.id})));};fill();if(def.stage_id)stage.value=def.stage_id;
  proc.addEventListener('change',()=>{fill();sum()});stage.addEventListener('change',()=>sum());
  const amount=input('',{inputMode:'decimal',placeholder:'Es. 12.500'});
  const closeDate=input('',{type:'date'});
  const owner=select([['','Non assegnato'],...rows('members').map(m=>[String(m.id),m.name||('Membro '+m.id)])],def.owner_id);
  box.append(field('Nome della trattativa *',title),field('Pipeline *',proc),field('Fase *',stage),field('Valore (€)',amount,'Vuoto = 0'),field('Chiusura prevista',closeDate),field('Responsabile',owner));
  body.append(box);
  const summary=E('p','','ld-summary');summary.setAttribute('aria-live','polite');body.append(summary);
  f=()=>({create:create.checked,title:title.value,process_id:proc.value,stage_id:stage.value,amount:amount.value,expected_close:closeDate.value,owner_id:owner.value});
  const sum=()=>{box.hidden=!create.checked;summary.textContent=L.convertSummary(lead,names,f(),pipes)};
  for(const n of [create,title])n.addEventListener('input',sum);create.addEventListener('change',sum);sum();
 },fail=>{
  const p=L.convertPayload(lead,f(),key,pipes);if(p.error)return fail(p.error);
  save('convert',p.data,()=>app().notice(p.data.opportunity?'Lead convertito: la trattativa «'+p.data.opportunity.title+'» è in Opportunità.':'Lead convertito senza trattativa.'),fail);
 });
}

// ---- view ----
function path(c){
 const ol=E('ol',undefined,'ld-path');ol.setAttribute('aria-label','Percorso del lead');
 for(const k of L.PATH){const li=E('li');const b=btn('',()=>{state.tab=k;rerender()},'ld-step'+(state.tab===k?' on':''));b.setAttribute('aria-pressed',String(state.tab===k));b.append(E('span',L.LABEL[k]),E('b',c[k]));li.append(b);ol.append(li)}
 const side=btn('',()=>{state.tab='non_qualificato';rerender()},'ld-side'+(state.tab==='non_qualificato'?' on':''));side.setAttribute('aria-pressed',String(state.tab==='non_qualificato'));side.append(E('span','Non qualificati'),E('b',c.non_qualificato));
 const wrap=E('div',undefined,'ld-pathbar');wrap.append(ol,side);return wrap;
}
function tabs(c){
 const t=E('div',undefined,'ld-tabs');t.setAttribute('role','tablist');t.setAttribute('aria-label','Filtra i lead');
 for(const [k,label] of L.TABS){const b=btn('',()=>{state.tab=k;rerender()},'ld-tab');b.setAttribute('role','tab');b.setAttribute('aria-selected',String(state.tab===k));b.append(document.createTextNode(label),E('span',c[k],'ld-badge'));t.append(b)}
 return t;
}
function statusCell(lead,writable){
 const s=L.statusOf(lead);
 if(s==='convertito'||!writable){const chip=E('span',L.LABEL[s],'ld-chip ld-'+s);if(s==='non_qualificato'&&lead.status_reason)chip.title=lead.status_reason;return chip}
 const sel=select(L.EDITABLE,s);sel.className='ld-status ld-'+s;sel.setAttribute('aria-label','Stato di '+lead.title);
 sel.addEventListener('change',()=>{const v=sel.value;sel.value=s;changeStatus(lead,v)});return sel;
}
function actionsCell(lead,writable){
 const td=E('td',undefined,'ld-act');const s=L.statusOf(lead);
 if(s==='convertito'){
  const opp=byId('opportunities',lead.converted_opportunity_id);
  if(opp){const a=E('a','Apri la trattativa','ld-link');a.href='#opportunities';a.title=opp.title||'';td.append(a)}
  else td.append(E('span',lead.converted_at?'Convertito il '+day(lead.converted_at):'Convertito','ld-muted'));
  return td;
 }
 if(writable)td.append(btn('Converti',()=>convert(lead),'ld-convert'+(s==='qualificato'?' primary':'')));
 return td;
}
function table(list,writable){
 const scroll=E('div',undefined,'ld-scroll');const t=E('table',undefined,'ld-table');
 const head=E('tr');// Status and «Converti» right after the name: the actions stay in view when the other columns scroll.
 for(const h of ['Lead','Stato','','Azienda','Fonte','Responsabile','Creato'])head.append(E('th',h));
 const thead=E('thead');thead.append(head);t.append(thead);const tb=E('tbody');
 for(const l of list){
  const tr=E('tr');tr.dataset.status=L.statusOf(l);
  const name=E('td',undefined,'ld-name');const open=btn(l.title,()=>app().edit('leads',l),'ld-title');open.title='Modifica il lead';name.append(open);
  // The contact under the name when the title does not already say it (titles from Lead Intelligence do).
  const person=nameOf('contacts',l.contact_id);if(person&&!String(l.title).includes(person))name.append(E('small',person,'ld-reason'));
  if(L.statusOf(l)==='non_qualificato'&&l.status_reason)name.append(E('small',l.status_reason,'ld-reason'));
  const cell=(label,text)=>{const td=E('td',text||'—');td.dataset.label=label;return td};
  const st=E('td',undefined,'ld-st');st.dataset.label='Stato';st.append(statusCell(l,writable));
  tr.append(name,st,actionsCell(l,writable),cell('Azienda',nameOf('companies',l.company_id)),cell('Fonte',l.source),cell('Responsabile',memberName(l.owner_id)),cell('Creato',day(l.created_at)));
  tb.append(tr);
 }
 t.append(tb);scroll.append(t);return scroll;
}
let host=null;
function build(section){
 const leads=rows('leads');const root=E('div',undefined,'ld');
 if(!L.supported(leads)){root.append(E('p','Stato lead e «Converti» non sono ancora attivi in questo archivio: serve la migrazione sales 012. I lead restano visibili qui sotto.','ld-note'));return null}
 const c=L.counts(leads),writable=app().writable('leads');
 const top=E('div',undefined,'ld-head');const h=E('div');h.append(E('p','Qualifica i lead, poi «Converti»: diventano una trattativa con la stessa azienda e lo stesso contatto.','ld-meta'));top.append(h);
 const li=E('a','Prendi lead da Lead Intelligence','ld-link');li.href='/lead-intelligence.html#step=3';top.append(li);root.append(top);
 root.append(path(c),tabs(c));
 const list=L.sort(L.filter(leads,state.tab));
 if(!list.length)root.append(E('p',leads.length?'Nessun lead in questa vista.':'Nessun lead ancora. Portali da Lead Intelligence al passo 3, scegliendo «Lead nel CRM», oppure crea un lead qui.','ld-empty'));
 else root.append(table(list,writable));
 return root;
}
function rerender(){if(!host?.isConnected)return;const next=build(host.parentElement);if(next){host.replaceWith(next);host=next}}
// Called by sales.js while it renders #leads. true = the lead view replaces the generic cards.
function section(sec){const v=build(sec);if(!v)return false;host=v;sec.append(v);return true}
window.RadixCrmLeads={section};
})();
