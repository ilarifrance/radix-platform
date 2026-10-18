/* RADIX Contabilità sign-up and sign-in pages: they call /api/accounting (signup.start, client.login). */
(function(){
'use strict';
const P=window.RadixPricing,$=id=>document.getElementById(id);
const eur=c=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(c/100);
if(P)document.querySelectorAll('[data-price-full]').forEach(n=>{n.textContent=eur(P.PRICE_CENTS)+' al mese + IVA';});
// Size pack: options and limits from the pricing module, preselected from ?pacchetto= on the public page.
const size=$('ctSize');
if(size&&P){const want=new URLSearchParams(location.search).get('pacchetto');
 size.replaceChildren(...P.SIZE_KEYS.map(k=>new Option(P.SIZES[k].label+', '+eur(P.priceOf(k))+' al mese + IVA',k)));if(P.SIZES[want])size.value=want;
 const help=()=>{const l=P.limitsOf(size.value);$('ctSizeHelp').textContent='Fino a '+l.invoices+' fatture al mese, '+l.bank_accounts+(l.bank_accounts>1?' conti bancari, ':' conto bancario, ')+l.copilot_questions+' domande al copilota, '+l.users+' utenti.';};
 size.addEventListener('change',help);help();}
function msg(text,kind){const m=$('ctMsg');m.hidden=!text;m.textContent=text||'';m.className='ct-alert '+(kind||'error');if(text)m.focus&&m.scrollIntoView({block:'nearest'});}
async function post(action,data){
 const r=await fetch('/api/accounting',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Radix-Accounting':'1'},body:JSON.stringify({action,data})});
 let j={};try{j=await r.json();}catch{}if(!r.ok)throw new Error(j.error||'Servizio non disponibile, riprova tra poco.');return j;
}
function busy(form,on){form.querySelectorAll('input,select,button').forEach(n=>{n.disabled=on;});}
if(new URLSearchParams(location.search).get('pagamento')==='annullato')msg('Pagamento annullato: il tuo account è stato creato, accedi per completarlo quando vuoi.','info');
const signup=$('ctSignup');
if(signup)signup.addEventListener('submit',async ev=>{
 ev.preventDefault();const f=signup.elements;
 if(!signup.checkValidity()){const bad=signup.querySelector(':invalid');msg(bad&&bad.name==='accept'?'Per continuare accetta le condizioni del servizio.':bad&&bad.name==='accept_clauses'?'Per continuare approva le clausole dell\'articolo 14.':bad&&bad.name==='password'?'La password deve avere almeno 10 caratteri.':'Controlla i campi evidenziati.');bad&&bad.focus();return;}
 msg('');busy(signup,true);
 try{const r=await post('signup.start',{name:f.name.value,email:f.email.value,password:f.password.value,accept:f.accept.checked,accept_clauses:f.accept_clauses.checked,size:f.size.value,
   company:{name:f.cname.value,vat:f.vat.value||null,legal_form:f.legal_form.value,regime:f.regime.value,vat_periodicity:f.vat_periodicity.value}});
  location.href=r.url;}
 catch(e){msg(e.message);busy(signup,false);}
});
const login=$('ctLogin');
if(login)login.addEventListener('submit',async ev=>{
 ev.preventDefault();const f=login.elements;if(!f.email.value||!f.password.value){msg('Inserisci email e password.');return;}
 msg('');busy(login,true);
 try{await post('client.login',{email:f.email.value,password:f.password.value});location.href='/contabilita/app/';}
 catch(e){msg(e.message);busy(login,false);}
});
})();
