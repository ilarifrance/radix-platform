'use strict';
/* Analisi and Report as one menu entry (Francesco, 17/11): the two pages (#analytics, analytics-view.js; #report,
   crm-report.js) get the same two tabs under their title, «Cruscotto» (the analyses, overall and by period) and
   «Report» (the report you build). Navigation only: each tab is the page's own hash link. */
(()=>{
const content=document.getElementById('content');if(!content)return;
const TABS=[['#analytics','Cruscotto'],['#report','Report']];
function tabs(here){const n=document.createElement('nav');n.className='an-tabs';n.setAttribute('aria-label','Analisi');
 for(const [h,label] of TABS){const a=document.createElement('a');a.href=h;a.textContent=label;if(h===here)a.setAttribute('aria-current','page');n.append(a)}return n}
function place(){for(const id of ['analytics','report']){const s=document.getElementById(id);if(!s||s.parentNode!==content)continue;
  const row=s.querySelector(':scope>.row');if(!row)continue;const cur=s.querySelector(':scope>nav.an-tabs');
  if(cur&&cur.previousElementSibling===row)continue;if(cur)cur.remove();row.after(tabs('#'+id))}}
let q=false;const later=()=>{if(q)return;q=true;requestAnimationFrame(()=>{q=false;place()})};
new MutationObserver(later).observe(content,{childList:true,subtree:true});
addEventListener('hashchange',later);later();
})();
