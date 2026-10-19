'use strict';
// Lead Intelligence tools grouped in tabs under the Lead pipeline. Without this script every panel stays visible.
(()=>{
 const bar=document.getElementById('lp-tabs');if(!bar)return;
 const tabs=[...bar.querySelectorAll('[data-tab]')],panels=[...document.querySelectorAll('[data-panel]')];
 function show(name,focus){
  for(const t of tabs){const on=t.dataset.tab===name;t.setAttribute('aria-selected',String(on));t.tabIndex=on?0:-1;if(on&&focus)t.focus()}
  for(const p of panels)p.hidden=p.dataset.panel!==name;
  document.body.dataset.tab=name;
 }
 // Old in-page links (#lead-import, #lead-crm…) open the tab that holds their target.
 function reveal(id){const p=id&&document.getElementById(id)?.closest('[data-panel]');if(!p)return false;if(p.hidden)show(p.dataset.panel);return true}
 bar.addEventListener('click',e=>{const t=e.target.closest('[data-tab]');if(t)show(t.dataset.tab)});
 bar.addEventListener('keydown',e=>{const i=tabs.indexOf(document.activeElement);if(i<0||!['ArrowRight','ArrowLeft','Home','End'].includes(e.key))return;e.preventDefault();const n=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;show(tabs[n].dataset.tab,true)});
 document.addEventListener('click',e=>{const a=e.target.closest('a[href^="#"]');if(a)reveal(decodeURIComponent(a.getAttribute('href').slice(1)))});
 window.addEventListener('hashchange',()=>reveal(decodeURIComponent(location.hash.slice(1))));
 // Header labels that open a file picker behave like buttons from the keyboard too.
 for(const l of document.querySelectorAll('label.lp-btn[for]'))l.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();l.click()}});
 show(tabs[0].dataset.tab);reveal(decodeURIComponent(location.hash.slice(1)));
})();
