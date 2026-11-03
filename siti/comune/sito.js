/* Script comune dei siti pubblici RADIX (siti/): menu mobile e modulo «Parliamone».
   Il modulo scrive un contatto e una nota nel CRM RADIX con POST /api/sales?site_form=1 (api/_site_form.js), con il token
   del sito messo in data-token sul <form>. Senza token il modulo resta spento e mostra l'e-mail di contatto: niente invii
   persi in silenzio. Funzioni pure esposte in RadixSito per i test (buildPayload, invalid). */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixSito=api;if(typeof document!=='undefined')api.boot(document)})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const LIMITS={name:120,email:254,phone:40,message:3000};
const clean=(v,max)=>String(v==null?'':v).replace(/\s+/g,' ').trim().slice(0,max);
// The fields the API accepts (api/_site_form.js), already trimmed and capped: t, name, email, phone, message, privacy, marketing, website.
function buildPayload(form){const f=form||{};
 return {t:String(f.token||'').trim(),name:clean(f.name,LIMITS.name),email:clean(f.email,LIMITS.email).toLowerCase(),phone:clean(f.phone,LIMITS.phone),
  message:String(f.message==null?'':f.message).trim().slice(0,LIMITS.message),privacy:f.privacy?'1':'',marketing:f.marketing?'1':'',website:String(f.website||'')}}
// '' when the payload can be sent, else the message to show.
function invalid(p){
 if(!p.t)return 'Il modulo non è ancora collegato: scrivici per e-mail.';
 if(!p.name)return 'Scrivi il tuo nome.';
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(p.email))return 'L’indirizzo e-mail non sembra valido.';
 if(!p.message)return 'Scrivi un messaggio.';
 if(!p.privacy)return 'Serve il consenso alla privacy per inviare.';
 return ''}
function boot(doc){
 const top=doc.querySelector('.sx-top'),btn=doc.querySelector('.sx-menu');
 if(top&&btn){btn.addEventListener('click',()=>{const open=top.classList.toggle('open');btn.setAttribute('aria-expanded',open?'true':'false')});
  top.querySelectorAll('.sx-nav a').forEach(a=>a.addEventListener('click',()=>{top.classList.remove('open');btn.setAttribute('aria-expanded','false')}))}
 doc.querySelectorAll('form[data-site-form]').forEach(form=>{
  const token=String(form.dataset.token||'').trim(),out=form.querySelector('[data-form-msg]'),submit=form.querySelector('button[type=submit]');
  const say=(text,ok)=>{if(!out)return;out.textContent=text;out.className='sx-alert'+(ok?' ok':'');out.hidden=!text};
  if(!token||/^\[da completare/.test(token)){form.querySelectorAll('input,textarea,button').forEach(el=>{el.disabled=true});
   say('Il modulo non è ancora collegato al CRM. Scrivici a '+(form.dataset.fallback||'info@radixinnovationstudio.com')+'.',false);return}
  form.addEventListener('submit',async ev=>{ev.preventDefault();
   const fd=new FormData(form),p=buildPayload({token,name:fd.get('name'),email:fd.get('email'),phone:fd.get('phone'),message:fd.get('message'),privacy:fd.get('privacy'),marketing:fd.get('marketing'),website:fd.get('website')});
   const bad=invalid(p);if(bad){say(bad,false);return}
   if(submit)submit.disabled=true;say('Invio in corso…',true);
   try{const r=await fetch('/api/sales?site_form=1',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(p)});
    const j=await r.json().catch(()=>({}));
    if(r.ok&&j&&j.ok){form.reset();say(form.dataset.thanks||'Grazie, ti rispondiamo entro un giorno lavorativo.',true)}
    else say((j&&j.error)||'Invio non riuscito: riprova fra poco o scrivici per e-mail.',false)}
   catch{say('Invio non riuscito: controlla la connessione e riprova.',false)}
   finally{if(submit)submit.disabled=false}})})}
return {LIMITS,buildPayload,invalid,boot}});
