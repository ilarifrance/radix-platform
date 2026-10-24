'use strict';
/* «Primi passi» on the CRM home (Panoramica): a checklist computed from the workspace rows
   (crm-data.js). A step is done only when the data shows it; nothing is ticked by hand.
   The card can be hidden per user and workspace (browser storage, see storageKey). */
(function(root){
const list=v=>Array.isArray(v)?v:[];
// Campaign emails are recorded by sales/crm-campaigns.js as «Email: <oggetto>» and by the
// Lead Intelligence newsletter (sales/lead-newsletter.js) as «Newsletter: <oggetto>».
const CAMPAIGN=/^(?:Email|Newsletter): /;
function steps(d){
 const x=d||{};
 const processes=list(x.processes),stages=list(x.stages);
 const pipeline=processes.some(p=>p.kind==='opportunity'&&stages.some(s=>s.process_id===p.id));
 return [
  {id:'pipeline',label:'Crea la pipeline',hint:'Un processo «Opportunità» con almeno una fase.',done:pipeline,href:'#processes'},
  {id:'company',label:'Aggiungi la prima azienda',hint:'Il cliente o il prospect con cui lavori.',done:list(x.companies).length>0,href:'#companies'},
  {id:'contact',label:'Aggiungi il primo contatto',hint:'La persona di riferimento in azienda.',done:list(x.contacts).length>0,href:'#contacts'},
  {id:'opportunity',label:'Apri la prima opportunità',hint:'Una trattativa con importo e fase.',done:list(x.opportunities).length>0,href:'#opportunities'},
  {id:'lead',label:'Porta il primo lead nel CRM',hint:'Da Lead Intelligence, con «Porta nel CRM».',done:list(x.leads).length>0,href:'/lead-intelligence.html'},
  {id:'campaign',label:'Invia la prima campagna email',hint:'Da Contatti › Sequenze e campagne email, o dalla Newsletter.',done:list(x.interactions).some(i=>i&&i.kind==='email'&&CAMPAIGN.test(String(i.title||''))),href:'#contacts'}
 ];
}
function progress(s){const done=s.filter(x=>x.done).length;return {done,total:s.length,complete:done===s.length};}
// One key per user and workspace; null when either is unknown (then the card cannot be hidden).
function storageKey(user,workspace){return user&&workspace?'radix-crm-primi-passi:'+user+':'+workspace:null;}
const api={steps,progress,storageKey};
if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixCrmOnboarding=api;
})(typeof globalThis!=='undefined'?globalThis:this);
