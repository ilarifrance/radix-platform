'use strict';
// Browser-only link from staged local contacts to manual prospect validation.
// Never approves a prospect, changes email verification or writes to CRM.
(()=>{
 const Engine=window.RadixLeadContactCRMStage;
 const $=id=>document.getElementById(id);
 const panel=$('local-crm-review'),picker=$('local-crm-contact-select'),status=$('local-crm-contact-status'),apply=$('local-crm-contact-apply');
 if(!Engine||!panel||!picker||!status||!apply)return;
 let contacts=[],reviewed=[],matches=[],forIndex=-1;
 const option=(value,label)=>{const o=document.createElement('option');o.value=String(value);o.textContent=label;return o};
 const index=()=>Number($('out-prospect')?.value||0);
 function render(){
  const idx=index(),prospect=reviewed[idx]?.candidate;
  forIndex=idx;matches=[];
  picker.replaceChildren(option('','Seleziona un referente da esaminare'));
  apply.disabled=true;
  if(!prospect||$('out-prospect').disabled){status.textContent='Prima qualifica almeno un prospect nella sezione ICP.';return}
  if(!contacts.length){status.textContent='Importa prima un backup dall’agente locale; nessun referente viene trasferito automaticamente.';return}
  try{matches=Engine.suggestions(prospect,contacts)}catch(e){status.textContent='Abbinamento non disponibile: '+e.message;return}
  for(let i=0;i<matches.length;i++)picker.append(option(i,matches[i].fullName+' · '+(matches[i].jobTitle||'ruolo da verificare')+' · '+matches[i].match));
  status.textContent=matches.length?matches.length+' referenti proposti per '+(prospect.name||prospect.domain)+'. Verifica il profilo e scegli esplicitamente il nominativo.':'Nessun referente associabile con sicurezza: controlla azienda, Paese e dominio prima di procedere.';
 }
 picker.addEventListener('change',()=>{apply.disabled=picker.value===''||forIndex!==index()});
 apply.addEventListener('click',()=>{
  if(picker.value===''||forIndex!==index()||!matches[Number(picker.value)])return;
  const contact=matches[Number(picker.value)];
  if(!window.confirm('Precompilare il referente '+contact.fullName+' per il prospect selezionato? La corrispondenza non certifica email, consenso o idoneità del contatto; resterà necessaria la revisione umana.'))return;
  const name=$('out-contact'),source=$('out-source');
  if(name.value.trim()&&name.value.trim()!==contact.fullName&&!window.confirm('Sostituire il referente già inserito "'+name.value.trim()+'"?'))return;
  name.value=contact.fullName;name.dispatchEvent(new Event('input',{bubbles:true}));
  if(!source.value.trim()){source.value=contact.profileUrl;source.dispatchEvent(new Event('input',{bubbles:true}))}
  status.textContent='Referente inserito dalla fonte LinkedIn. Controlla il profilo, verifica separatamente email, base giuridica e privacy, quindi premi «Approva». Nessun dato CRM creato.';
 });
 window.addEventListener('radix:lead-local-handoff-staged',event=>{contacts=Array.isArray(event.detail?.contacts)?event.detail.contacts.slice(0,5000):[];render()});
 window.addEventListener('radix:lead-reviewed',event=>{reviewed=Array.isArray(event.detail?.entries)?event.detail.entries.slice(0,250):[];render()});
 $('out-prospect').addEventListener('change',render);
 render();
})();
