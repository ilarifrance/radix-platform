'use strict';
// Tools of each step of the guided flow (sales/lead-flow.js) grouped under one bar: a pressed button shows the
// panels with the same data-panel. Buttons marked data-toggle can be closed again (step 2 shows only the list).
// Without this script every panel stays visible.
(()=>{
 const bar=document.getElementById('lp-tabs');if(!bar)return;
 const tabs=[...bar.querySelectorAll('[data-tab]')],panels=[...document.querySelectorAll('[data-panel]')];
 function show(name){
  name=name||'';
  for(const t of tabs)t.setAttribute('aria-pressed',String(t.dataset.tab===name));
  for(const p of panels)p.hidden=p.dataset.panel!==name;
  document.body.dataset.tab=name;
  window.dispatchEvent(new CustomEvent('radix:lead-tab',{detail:{tab:name}}));
 }
 const current=()=>document.body.dataset.tab||'';
 // The tab whose panels hold an element (old in-page links such as #lead-import, #lead-crm…).
 const panelOf=id=>id&&document.getElementById(id)?.closest('[data-panel]')?.dataset.panel||'';
 bar.addEventListener('click',e=>{
  const t=e.target.closest('[data-tab]');if(!t)return;
  show(t.hasAttribute('data-toggle')&&current()===t.dataset.tab?'':t.dataset.tab);
 });
 // Header labels that open a file picker behave like buttons from the keyboard too.
 for(const l of document.querySelectorAll('label.lp-btn[for]'))l.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();l.click()}});
 window.RadixLeadTabs=Object.freeze({show,current,panelOf});
 show('');
})();
