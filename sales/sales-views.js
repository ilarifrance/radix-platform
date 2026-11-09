'use strict';
/* Operational CRM: small view helpers for the visual layer (sales-parity.css).
   Adds initials for the avatar circles, marks the current sidebar entry and
   links back to Sales Orbit. It does not read or change CRM data. */
(()=>{
const nav=document.getElementById('navigation'),content=document.getElementById('content');if(!nav||!content)return;
const initials=t=>String(t||'').trim().split(/\s+/).filter(w=>/^[\p{L}\p{N}]/u.test(w)).slice(0,2).map(w=>w[0].toUpperCase()).join('');
function decorate(){
  if(!nav.querySelector('a[href*="sales-orbit"]')){const a=document.createElement('a');a.href='/sales-orbit-higgsfield.html';a.textContent='Sales Orbit';nav.prepend(a)}
  const hash=location.hash||'#dashboard';for(const a of nav.querySelectorAll('a'))a.getAttribute('href')===hash?a.setAttribute('aria-current','page'):a.removeAttribute('aria-current');
  /* show only the section the sidebar points to; unknown hashes keep the full page */
  const view=content.querySelector(':scope>section'+(/^#[a-z0-9-]+$/i.test(hash)?hash:'#dashboard'));
  for(const s of content.querySelectorAll(':scope>section.rx-view'))if(s!==view)s.classList.remove('rx-view');
  // add only when missing: classList.add on a present class still fires a mutation, and the views re-render on it
  if(view&&!view.classList.contains('rx-view'))view.classList.add('rx-view');document.documentElement.classList.toggle('rx-has-view',!!view);
  /* which view is shown, for CSS (e.g. the «Promemoria» box is hidden where it repeats the view) */
  const id=view?view.id:'';if(document.documentElement.dataset.rxView!==id)document.documentElement.dataset.rxView=id;
  for(const h of content.querySelectorAll('section>article.card>h3:not([data-initials])'))h.dataset.initials=initials(h.textContent);
}
let queued=false;const later=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;decorate()})};
new MutationObserver(later).observe(content,{childList:true,subtree:true});new MutationObserver(later).observe(nav,{childList:true});
/* a record opened in Customer360 belongs to the view it was opened from: close it when the menu moves to another view,
   otherwise it stays open under the new one (it is shown in every view, sales-parity.css) */
addEventListener('hashchange',()=>{window.RadixSalesApp?.closeCustomer?.();decorate();scrollTo(0,0)});decorate();
})();
