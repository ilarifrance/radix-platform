'use strict';
/* «Solo CRM»: /crm is radix-sales.html (vercel.json rewrite) with its own sign-in page. A colleague who only works in the CRM
   types e-mail and password here (same account and cookie as the rest of RADIX, /api/auth/login) and finds the CRM without the
   Command Center and the other areas (menu in sales-nav.js, remembered in this browser). Nothing else changes: the data a person
   sees is still decided by the server (workspace membership and role). */
(()=>{
const PR=window.RadixCrmProduct,product=!!(PR&&PR.here());
if(location.pathname!=='/crm'&&!product)return;
document.documentElement.classList.add('crm-solo');document.title=product?'Sales Orbis · CRM':'RADIX · CRM';
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n};
// The reset link of «Password dimenticata» (api/auth/[action].js forgot/reset): /crm#reset=<token>.
const resetToken=(/^#reset=([\w.-]+)$/.exec(location.hash)||[])[1]||'';
async function post(url,body){const r=await fetch(url,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return [r,await r.json().catch(()=>({}))]}
function gate(mode,notice){
 const old=document.querySelector('.solo-gate');if(old)old.remove();
 mode=mode||(resetToken?'reset':'login');
 const box=E('div',undefined,'solo-gate');box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-labelledby','solo-title');
 const form=E('form',undefined,'solo-card');form.setAttribute('autocomplete','on');form.dataset.mode=mode;
 const brand=E('div',product?'Sales Orbis':'RADIX','solo-brand');
 const title=E('h1',mode==='login'?'CRM':mode==='forgot'?'Password dimenticata':'Nuova password','');title.id='solo-title';
 const lead=E('p',mode==='login'?'Accedi con il tuo account per aprire il CRM.':mode==='forgot'?'Scrivi l’email del tuo account: ti mandiamo un link per scegliere una nuova password.':'Scegli la nuova password del tuo account (almeno 8 caratteri).','solo-lead');
 const field=(label,type,auto,name)=>{const l=E('label',label);const i=E('input');i.type=type;i.autocomplete=auto;i.required=true;i.name=name;l.append(i);return [l,i]};
 const err=E('p',undefined,'solo-err');err.setAttribute('role','alert');err.hidden=true;
 const ok=E('p',notice||undefined,'solo-ok');ok.setAttribute('role','status');ok.hidden=!notice;
 const say=(el,text)=>{err.hidden=ok.hidden=true;el.textContent=text;el.hidden=false};
 const go=E('button',mode==='login'?'Accedi':mode==='forgot'?'Invia il link':'Salva la nuova password','solo-go');go.type='submit';
 const swap=(label,to)=>{const b=E('button',label,'solo-alt');b.type='button';b.addEventListener('click',()=>gate(to));return b};
 // The language flag of the top bar is behind this window: the same choice here (lib/radix-i18n.js), before signing in.
 const I=window.RadixI18n,langs=E('div',undefined,'solo-langs');langs.setAttribute('data-i18n-skip','');langs.setAttribute('role','group');langs.setAttribute('aria-label',I&&I.en?'Language':'Lingua');
 if(I&&I.saveLang)for(const [l,name] of [['it','Italiano'],['en','English']]){const b=E('button',l.toUpperCase(),'solo-lang');b.type='button';b.lang=l;b.title=name;b.setAttribute('aria-label',name);b.setAttribute('aria-pressed',String(I.lang===l));
  b.addEventListener('click',()=>{if(I.lang===l)return;I.saveLang(window,l);try{const u=new URL(location.href);if(u.searchParams.has('lang')){u.searchParams.set('lang',l);location.href=u.toString();return}}catch(e){}location.reload()});langs.append(b)}
 let first,submit;
 if(mode==='login'){
  const [le,email]=field('Email','email','username','email'),[lp,pass]=field('Password','password','current-password','password');first=email;
  form.append(langs,brand,title,lead,le,lp,ok,err,go,swap('Password dimenticata?','forgot'));
  submit=async()=>{const [r,d]=await post('/api/auth/login',{email:email.value,password:pass.value});
   if(r.ok){location.reload();return}
   say(err,d.error||(r.status===429?'Troppi tentativi di accesso: riprova tra 15 minuti.':'Email o password errati.'));pass.value='';pass.focus()};
 }else if(mode==='forgot'){
  const [le,email]=field('Email','email','username','email');first=email;
  form.append(langs,brand,title,lead,le,ok,err,go,swap('Torna all’accesso','login'));
  submit=async()=>{const [r,d]=await post('/api/auth/forgot',{email:email.value});
   if(r.ok){say(ok,d.message||'Se l’email è registrata, ti abbiamo inviato un link per scegliere una nuova password.');return}
   say(err,d.error||'Richiesta non riuscita: riprova.')};
 }else{
  const [lp,pass]=field('Nuova password','password','new-password','password'),[lc,conf]=field('Ripeti la nuova password','password','new-password','confirm');first=pass;
  pass.minLength=conf.minLength=8;
  form.append(langs,brand,title,lead,lp,lc,ok,err,go,swap('Torna all’accesso','login'));
  submit=async()=>{if(pass.value!==conf.value){say(err,'Le due nuove password non coincidono.');return}
   const [r,d]=await post('/api/auth/reset',{token:resetToken,password:pass.value,confirm:conf.value});
   if(r.ok){try{history.replaceState(null,'',location.pathname+location.search)}catch(e){}gate('login',d.message||'Password aggiornata: accedi con la nuova password.');return}
   say(err,d.error||'Password non aggiornata: riprova tra poco.')};
 }
 box.append(form);document.body.append(box);first.focus();
 form.addEventListener('submit',async ev=>{ev.preventDefault();err.hidden=true;const label=go.textContent;go.disabled=true;go.textContent=mode==='login'?'Accesso in corso…':'Invio in corso…';
  try{await submit()}catch{say(err,'Connessione non riuscita: riprova.')}
  if(go.isConnected){go.disabled=false;go.textContent=label}})}
if(resetToken)gate('reset');
else fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'}).then(r=>{if(!r.ok)gate()}).catch(()=>{});
})();
