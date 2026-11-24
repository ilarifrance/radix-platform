/* RADIX Accounting — service price and cost per client company. Francesco (17/10): start at 39 € a month
   if what one company costs us stays under 15 €. The unit costs below are estimates to replace with real quotes
   (SDI channel, bank feed); the AI cost follows the copilot request size and the model price list. Pure functions. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixPricing=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const PRICE_CENTS=3900;            // a month, VAT excluded
const VAT_RATE=22;
const COST_CAP_CENTS=1500;         // ceiling on what one company may cost a month
// Internal placeholder until the partner firm is chosen; Francesco (17/10): the pages do not name it.
const PARTNER=Object.freeze({name:'Studio Partner Esempio (nome fittizio)',fictitious:true});
/* Size packs (Francesco 18/10: add-on packages by actual workload and company size). The monthly fee is the base
   price plus the pack's extra; the extras are proposals checked against the unit costs below (sizeCheck()): at the
   pack's full allowance what is left for the partner firm grows with the pack (about 25 €, 38 € and 68 € a month). */
const SIZES=Object.freeze({
 base:Object.freeze({label:'Base',extra_cents:0,who:'Ditte, professionisti e piccole società',limits:Object.freeze({invoices:100,bank_accounts:1,copilot_questions:100,users:3})}),
 crescita:Object.freeze({label:'Crescita',extra_cents:3000,who:'Società con un piccolo team e più conti',limits:Object.freeze({invoices:300,bank_accounts:3,copilot_questions:200,users:6})}),
 strutturata:Object.freeze({label:'Strutturata',extra_cents:10000,who:'Società con più sedi, progetti o centri di costo',limits:Object.freeze({invoices:800,bank_accounts:6,copilot_questions:400,users:10})})});
const SIZE_KEYS=Object.keys(SIZES);
const sizeOf=k=>SIZES[k]||SIZES.base;
const priceOf=k=>PRICE_CENTS+sizeOf(k).extra_cents;
const limitsOf=k=>sizeOf(k).limits;
// What the base 39 € includes; above the largest pack the price is agreed case by case.
const INCLUDED=SIZES.base.limits;
/* Yearly and occasional services, quoted before starting (Francesco 18/10: «preventivo a parte»). from_cents is the
   "da" price shown on the public page, VAT excluded; chamber fees and stamp duties are always extra. Proposals. */
const EXTRAS=Object.freeze([
 Object.freeze({key:'chiusura_capitali',label:'Chiusura annuale società di capitali',detail:'Bilancio d\'esercizio e deposito, dichiarazione IVA, Redditi SC e IRAP',from_cents:59000,per:'all\'anno'}),
 Object.freeze({key:'chiusura_persone',label:'Chiusura annuale ditte, società di persone e professionisti',detail:'Dichiarazione IVA, Redditi PF o SP e IRAP',from_cents:29000,per:'all\'anno'}),
 Object.freeze({key:'sostituto',label:'Modello 770 e Certificazioni uniche',detail:'Per chi paga professionisti o dipendenti',from_cents:15000,per:'all\'anno'}),
 Object.freeze({key:'paghe',label:'Buste paga',detail:'Cedolino, contributi e F24 di ogni dipendente',from_cents:1800,per:'per dipendente al mese'}),
 Object.freeze({key:'recupero',label:'Recupero dei mesi precedenti',detail:'Registrazione degli arretrati quando entri in corso d\'anno',from_cents:4000,per:'per mese recuperato'})]);
// Francesco (17/10): the partner firm's fee is included in the 39 €, there is no extra charge.
const PLANS=Object.freeze({
 professionista:{label:'RADIX Contabilità',price_cents:PRICE_CENTS,partner:true,summary:'Fatture elettroniche, prima nota assistita, IVA, banca, chiusure, controllo di gestione e copilota AI, con la revisione e gli invii telematici del commercialista compresi.'},
 base:{label:'RADIX Contabilità, con il tuo commercialista',price_cents:PRICE_CENTS,partner:false,summary:'Lo stesso servizio per chi tiene il proprio commercialista: lo invita come utente.'},
 controllo:{label:'RADIX Contabilità, con il tuo commercialista',price_cents:PRICE_CENTS,partner:false,summary:'Come base: il controllo di gestione è incluso.'}});
/* Unit costs in euro cents (estimates, 17/10/2026):
   - AI: one copilot question ≈ 5.000 token in + 1.500 out on claude-opus-5-5 ($4 / $20 per milione) ≈ 0,05 $ → 5 cent.
   - Infra: Vercel Pro + Neon, about 40 € a month shared by all client companies.
   - SDI channel (send/receive e-invoices through an intermediary): 5 cent an invoice, to confirm with a quote.
   - Bank feed via PSD2 provider: 100 cent per account a month, to confirm; manual CAMT/CSV upload costs nothing.
   - Card payment: 1,5 % + 25 cent on the VAT-inclusive amount (EU cards).
   - Support reserve: 100 cent a company a month.
   - Partner firm: unknown until the firm is chosen, so 0 here; partnerBudget() says how much is left for it. */
const UNIT=Object.freeze({ai_question:5,infra_month:4000,sdi_invoice:5,bank_account:100,card_pct:1.5,card_fixed:25,support:100,partner:0});
function monthly({companies=50,invoices=60,bank_accounts=1,questions=30,bank_feed=true,size='base'}={},unit=UNIT){
 const price=priceOf(size),gross=Math.round(price*(100+VAT_RATE)/100);
 const rows=[
  {key:'ai',label:'Copilota AI',cents:Math.round(questions*unit.ai_question)},
  {key:'infra',label:'Server e database (quota)',cents:Math.round(unit.infra_month/Math.max(1,companies))},
  {key:'sdi',label:'Canale SDI fatture',cents:Math.round(invoices*unit.sdi_invoice)},
  {key:'bank',label:'Collegamento banca',cents:bank_feed?Math.round(bank_accounts*unit.bank_account):0},
  {key:'payment',label:'Incasso con carta',cents:Math.round(gross*unit.card_pct/100+unit.card_fixed)},
  {key:'support',label:'Assistenza',cents:unit.support},
  {key:'partner',label:'Studio partner',cents:unit.partner||0}];
 const total=rows.reduce((s,r)=>s+r.cents,0);
 return {rows,total_cents:total,price_cents:price,margin_cents:price-total,within_cap:total<COST_CAP_CENTS};
}
// The three cases shown to Francesco: a typical client, the heaviest one the plan allows, and launch with few clients.
const SCENARIOS=Object.freeze({
 tipico:{label:'Azienda tipica',companies:50,invoices:60,bank_accounts:1,questions:30},
 massimo:{label:'Uso massimo incluso',companies:50,invoices:INCLUDED.invoices,bank_accounts:INCLUDED.bank_accounts,questions:INCLUDED.copilot_questions},
 avvio:{label:'Avvio con 10 aziende',companies:10,invoices:60,bank_accounts:1,questions:30}});
// What one company can pay the partner firm a month and still stay under the ceiling.
function partnerBudget(scenario,unit=UNIT){return Math.max(0,COST_CAP_CENTS-monthly(scenario,{...unit,partner:0}).total_cents);}
// Each pack used to its full allowance: cost and what is left for the partner firm out of the monthly fee.
function sizeCheck(unit=UNIT){return SIZE_KEYS.map(k=>{const l=limitsOf(k),m=monthly({size:k,invoices:l.invoices,bank_accounts:l.bank_accounts,questions:l.copilot_questions},{...unit,partner:0});
 return {size:k,price_cents:m.price_cents,cost_cents:m.total_cents,left_cents:m.margin_cents};});}
return {partnerBudget,sizeCheck,priceOf,limitsOf,PRICE_CENTS,VAT_RATE,COST_CAP_CENTS,PARTNER,INCLUDED,SIZES,SIZE_KEYS,EXTRAS,PLANS,UNIT,SCENARIOS,monthly};
});
