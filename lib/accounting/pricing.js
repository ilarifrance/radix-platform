/* RADIX Accounting — service price and cost per client company. Francesco (17/10): start at 39 € a month
   if what one company costs us stays under 15 €. The unit costs below are estimates to replace with real quotes
   (SDI channel, bank feed); the AI cost follows the copilot request size and the model price list. Pure functions. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixPricing=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const PRICE_CENTS=3900;            // a month, VAT excluded
const VAT_RATE=22;
const COST_CAP_CENTS=1500;         // ceiling on what one company may cost a month
// Fictitious placeholder until the partner firm is chosen: it must never be shown as a real firm.
const PARTNER=Object.freeze({name:'Studio Partner Esempio (nome fittizio)',fictitious:true});
// What the 39 € includes; above these the extra is billed or the plan is upgraded.
const INCLUDED=Object.freeze({invoices:100,bank_accounts:1,copilot_questions:100,users:3});
// Francesco (17/10): the partner firm's fee is included in the 39 €, there is no extra charge.
const PLANS=Object.freeze({
 professionista:{label:'RADIX Contabilità',price_cents:PRICE_CENTS,partner:true,summary:'Fatture elettroniche, prima nota assistita, IVA, banca, chiusure, controllo di gestione e copilota AI, con la revisione e gli invii telematici dello studio partner compresi.'},
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
function monthly({companies=50,invoices=60,bank_accounts=1,questions=30,bank_feed=true}={},unit=UNIT){
 const gross=Math.round(PRICE_CENTS*(100+VAT_RATE)/100);
 const rows=[
  {key:'ai',label:'Copilota AI',cents:Math.round(questions*unit.ai_question)},
  {key:'infra',label:'Server e database (quota)',cents:Math.round(unit.infra_month/Math.max(1,companies))},
  {key:'sdi',label:'Canale SDI fatture',cents:Math.round(invoices*unit.sdi_invoice)},
  {key:'bank',label:'Collegamento banca',cents:bank_feed?Math.round(bank_accounts*unit.bank_account):0},
  {key:'payment',label:'Incasso con carta',cents:Math.round(gross*unit.card_pct/100+unit.card_fixed)},
  {key:'support',label:'Assistenza',cents:unit.support},
  {key:'partner',label:'Studio partner',cents:unit.partner||0}];
 const total=rows.reduce((s,r)=>s+r.cents,0);
 return {rows,total_cents:total,price_cents:PRICE_CENTS,margin_cents:PRICE_CENTS-total,within_cap:total<COST_CAP_CENTS};
}
// The three cases shown to Francesco: a typical client, the heaviest one the plan allows, and launch with few clients.
const SCENARIOS=Object.freeze({
 tipico:{label:'Azienda tipica',companies:50,invoices:60,bank_accounts:1,questions:30},
 massimo:{label:'Uso massimo incluso',companies:50,invoices:INCLUDED.invoices,bank_accounts:INCLUDED.bank_accounts,questions:INCLUDED.copilot_questions},
 avvio:{label:'Avvio con 10 aziende',companies:10,invoices:60,bank_accounts:1,questions:30}});
// What one company can pay the partner firm a month and still stay under the ceiling.
function partnerBudget(scenario,unit=UNIT){return Math.max(0,COST_CAP_CENTS-monthly(scenario,{...unit,partner:0}).total_cents);}
return {partnerBudget,PRICE_CENTS,VAT_RATE,COST_CAP_CENTS,PARTNER,INCLUDED,PLANS,UNIT,SCENARIOS,monthly};
});
