/* RADIX Contabilità public page: price and limits come from lib/accounting/pricing.js, the same source the app uses. */
(function(){
'use strict';
const P=window.RadixPricing;if(!P)return;
const eur=c=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:c%100?2:0}).format(c/100);
document.querySelectorAll('[data-price]').forEach(n=>{n.textContent=eur(P.PRICE_CENTS);});
document.querySelectorAll('[data-price-full]').forEach(n=>{n.textContent=eur(P.PRICE_CENTS)+' al mese + IVA';});
document.querySelectorAll('[data-inc]').forEach(n=>{const v=P.INCLUDED[n.dataset.inc];if(v!==undefined)n.textContent=v;});
})();
