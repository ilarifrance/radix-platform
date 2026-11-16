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
function gate(){
 if(document.querySelector('.solo-gate'))return;
 const box=E('div',undefined,'solo-gate');box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-labelledby','solo-title');
 const form=E('form',undefined,'solo-card');form.setAttribute('autocomplete','on');
 const brand=E('div',product?'Sales Orbis':'RADIX','solo-brand');const title=E('h1','CRM','');title.id='solo-title';
 const lead=E('p','Accedi con il tuo account per aprire il CRM.','solo-lead');
 const field=(label,type,auto)=>{const l=E('label',label);const i=E('input');i.type=type;i.autocomplete=auto;i.required=true;i.name=type==='password'?'password':'email';l.append(i);return [l,i]};
 const [le,email]=field('Email','email','username'),[lp,pass]=field('Password','password','current-password');
 const err=E('p',undefined,'solo-err');err.setAttribute('role','alert');err.hidden=true;
 const go=E('button','Accedi','solo-go');go.type='submit';
 // The language flag of the top bar is behind this window: the same choice here (lib/radix-i18n.js), before signing in.
 const I=window.RadixI18n,langs=E('div',undefined,'solo-langs');langs.setAttribute('data-i18n-skip','');langs.setAttribute('role','group');langs.setAttribute('aria-label',I&&I.en?'Language':'Lingua');
 if(I&&I.saveLang)for(const [l,name] of [['it','Italiano'],['en','English']]){const b=E('button',l.toUpperCase(),'solo-lang');b.type='button';b.lang=l;b.title=name;b.setAttribute('aria-label',name);b.setAttribute('aria-pressed',String(I.lang===l));
  b.addEventListener('click',()=>{if(I.lang===l)return;I.saveLang(window,l);try{const u=new URL(location.href);if(u.searchParams.has('lang')){u.searchParams.set('lang',l);location.href=u.toString();return}}catch(e){}location.reload()});langs.append(b)}
 form.append(langs,brand,title,lead,le,lp,err,go);box.append(form);document.body.append(box);email.focus();
 form.addEventListener('submit',async ev=>{ev.preventDefault();err.hidden=true;go.disabled=true;go.textContent='Accesso in corso…';
  try{const r=await fetch('/api/auth/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.value,password:pass.value})});
   const d=await r.json().catch(()=>({}));
   if(r.ok){location.reload();return}
   err.textContent=d.error||'Email o password errati.';err.hidden=false}
  catch{err.textContent='Connessione non riuscita: riprova.';err.hidden=false}
  go.disabled=false;go.textContent='Accedi';pass.value='';pass.focus()})}
fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'}).then(r=>{if(!r.ok)gate()}).catch(()=>{});
})();
