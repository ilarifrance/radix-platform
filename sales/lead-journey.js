'use strict';
(()=>{
 const $=id=>document.getElementById(id);
 const state={entries:[],crm:new Map(),drafts:new Set(),plans:new Set(),outcomes:new Map(),saved:new Set()};
 const stages=[
  {key:'qualified',label:'Qualificati',anchor:'lead-qualified',description:'Dati valutati'},
  {key:'reviewed',label:'Approvati',anchor:'lead-verify',description:'Convalida umana'},
  {key:'crm',label:'Collegati CRM',anchor:'lead-crm',description:'Aziende associate'},
  {key:'email',label:'Bozze email',anchor:'email-studio',description:'Nessun invio'},
  {key:'plans',label:'Piani contatto',anchor:'lead-sequence',description:'Bozze e scadenze'},
  {key:'outcomes',label:'Esiti dichiarati',anchor:'lead-outcomes',description:'Solo manuali'},
  {key:'saved',label:'Storico CRM',anchor:'crm-outcome-save',description:'Registrazioni confermate'}
 ];
 const validatedCount=()=>state.entries.filter((_,i)=>Boolean(window.radixLeadWorkflow?.approvalFor(i))).length;
 const counts=()=>({
  qualified:state.entries.length,
  reviewed:validatedCount(),
  crm:state.crm.size,
  email:state.drafts.size,
  plans:state.plans.size,
  outcomes:state.outcomes.size,
  saved:state.saved.size
 });
 function draw(){
  const count=counts();
  const track=$('lead-journey-track');track.replaceChildren();
  for(let i=0;i<stages.length;i++){
   const s=stages[i],n=count[s.key],a=document.createElement('a');
   a.className='journey-node'+(n?' has-data':'');a.href='#'+s.anchor;
   a.setAttribute('aria-label',s.label+': '+n+'. Vai al passaggio relativo');
   const badge=document.createElement('span');badge.className='journey-node-index';badge.textContent=String(i+1).padStart(2,'0');
   const metric=document.createElement('strong');metric.className='journey-node-number';metric.textContent=String(n);
   const label=document.createElement('span');label.className='journey-node-label';label.textContent=s.label;
   const subtitle=document.createElement('small');subtitle.textContent=s.description;
   a.append(badge,metric,label,subtitle);track.append(a);
  }
  const n=count.qualified;
  $('lead-journey-total').textContent=n?'REPORT OPERATIVO · '+n+' PROSPECT':'IN ATTESA DI QUALIFICAZIONE';
  const next=!n?'Importa la lista e qualifica i prospect con il tuo ICP.'
   :!count.reviewed?'Revisiona e approva i prospect con dati e fonti verificati.'
   :!count.crm?'Collega almeno un’azienda approvata al CRM RADIX.'
   :!count.email?'Prepara una bozza email per un prospect approvato.'
   :!count.plans?'Crea un piano di contatto e follow-up, senza inviare automaticamente.'
   :!count.outcomes?'Registra manualmente gli esiti solo dopo attività realmente avvenute.'
   :!count.saved?'Salva un esito confermato nello storico del CRM.'
   :'Percorso avviato: consulta lo storico CRM e prosegui con i prospect ancora da lavorare.';
  $('lead-journey-next').textContent=next;
 }
 window.addEventListener('radix:lead-reviewed',e=>{
  state.entries=Array.isArray(e.detail?.entries)?e.detail.entries:[];
  state.crm.clear();state.drafts.clear();state.plans.clear();state.outcomes.clear();state.saved.clear();draw();
 });
 window.addEventListener('radix:lead-approval-changed',e=>{
  const i=Number(e.detail?.index);
  if(e.detail?.approved===false){state.drafts.delete(i);state.plans.delete(i)}
  draw();
 });
 window.addEventListener('radix:lead-crm-created',e=>{
  const d=e.detail||{};if(!Number.isInteger(d.index)||!d.companyId)return;
  state.crm.set(d.index,{companyId:d.companyId,workspace:d.workspace});draw();
 });
 window.addEventListener('radix:lead-draft',e=>{
  const i=Number(e.detail?.index);if(!state.entries[i])return;
  state.drafts.add(i);state.plans.delete(i);draw();
 });
 window.addEventListener('radix:lead-draft-stale',e=>{const i=Number(e.detail?.index);state.drafts.delete(i);state.plans.delete(i);draw()});
 window.addEventListener('radix:lead-plan-created',e=>{const i=Number(e.detail?.index);if(state.entries[i])state.plans.add(i);draw()});
 window.addEventListener('radix:lead-plan-stale',e=>{state.plans.delete(Number(e.detail?.index));draw()});
 window.addEventListener('radix:lead-outcome-recorded',e=>{const d=e.detail||{};if(state.entries[d.index]&&d.key)state.outcomes.set(d.key,d.index);draw()});
 window.addEventListener('radix:lead-outcome-voided',e=>{state.outcomes.delete(e.detail?.ref);draw()});
 window.addEventListener('radix:lead-crm-outcome-saved',e=>{if(e.detail?.key)state.saved.add(e.detail.key);draw()});
 draw();
})();
