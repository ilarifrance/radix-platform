/* RADIX Contabilità public page: prices, packs and limits come from lib/accounting/pricing.js, the same source the app uses. */
(function(){
'use strict';
const P=window.RadixPricing;if(!P)return;
const eur=c=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:c%100?2:0}).format(c/100);
document.querySelectorAll('[data-price]').forEach(n=>{n.textContent=eur(P.PRICE_CENTS);});
document.querySelectorAll('[data-price-full]').forEach(n=>{n.textContent=eur(P.PRICE_CENTS)+' al mese + IVA';});
document.querySelectorAll('[data-inc]').forEach(n=>{const v=P.INCLUDED[n.dataset.inc];if(v!==undefined)n.textContent=v;});
document.querySelectorAll('[data-size]').forEach(card=>{const k=card.dataset.size,z=P.SIZES[k];if(!z)return;
 card.querySelectorAll('[data-size-price]').forEach(n=>{n.textContent=eur(P.priceOf(k));});
 card.querySelectorAll('[data-size-who]').forEach(n=>{n.textContent=z.who;});
 card.querySelectorAll('[data-size-limit]').forEach(n=>{const v=z.limits[n.dataset.sizeLimit];if(v!==undefined)n.textContent=v;});});
const ex=document.querySelector('#ctExtras tbody');
if(ex)ex.replaceChildren(...P.EXTRAS.map(x=>{const tr=document.createElement('tr');
 [x.label,x.detail,'da '+eur(x.from_cents)+' + IVA '+x.per].forEach((t,i)=>{const td=document.createElement('td');td.textContent=t;if(i===2)td.className='num';tr.append(td);});return tr;}));
})();
