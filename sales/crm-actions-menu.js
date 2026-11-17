'use strict';
/* One «Azioni ▾» button in the heading row of the CRM lists (Francesco, 17/11): Esporta CSV, Importa, Segmenti,
   Doppioni and the import buttons that crm-tools.js, crm-import-deals.js and crm-import-storico.js add as separate
   bars are moved into a single drop-down. The buttons are the same elements, with their own handlers; a bar with
   fields (the follow-up rule of Attività) stays where it is. */
(()=>{
const content=document.getElementById('content');if(!content)return;
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n};
function menu(row){
 let m=row.querySelector(':scope>details.crm-actions');if(m)return m;
 m=E('details',undefined,'crm-actions');const sum=E('summary','Azioni');sum.setAttribute('aria-label','Azioni sull’elenco');
 const list=E('div',undefined,'crm-actions-list');list.setAttribute('role','menu');m.append(sum,list);
 // A choice closes the menu (the file picker of «Importa» still opens: the click has already run).
 list.addEventListener('click',e=>{if(e.target.closest('button,a'))m.open=false});
 row.append(m);return m}
function wrap(){
 for(const row of content.querySelectorAll(':scope>section>.row')){
  const bars=[...row.querySelectorAll(':scope>.crm-tools')].filter(b=>!b.querySelector('label,input:not([type="file"]),select'));
  if(!bars.length)continue;
  const m=menu(row),list=m.querySelector('.crm-actions-list');
  for(const b of bars){list.append(...b.childNodes);b.remove()}
  m.hidden=!list.querySelector('button,a')}}
let q=false;const later=()=>{if(q)return;q=true;requestAnimationFrame(()=>{q=false;wrap()})};
new MutationObserver(later).observe(content,{childList:true,subtree:true});
addEventListener('click',e=>{for(const m of content.querySelectorAll('details.crm-actions[open]'))if(!m.contains(e.target))m.open=false});
addEventListener('keydown',e=>{if(e.key==='Escape')for(const m of content.querySelectorAll('details.crm-actions[open]'))m.open=false});
later();
})();
