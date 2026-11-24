/* RADIX confirm: the one styled confirmation before every AI call, credit spend, publication or send of the Marketing
   studios, in place of the browser's grey confirm(). ask({title,cost,message,facts,ok,cancel,tag}) resolves true only
   when the person presses the primary button (or Enter); «Annulla», Esc and a click outside resolve false.
   A modal <dialog> (role=dialog, aria-modal, labelled by its title, described by the cost and the message), focus kept
   inside with Tab, focus back where it was on close. Styles in shell/radix-confirm.css (linked once if the page has not).
   No DOM (Node tests) or no <dialog> support: falls back to root.confirm with the same text, so nothing is ever spent
   without a yes. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixConfirm=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const CSS='/shell/radix-confirm.css';
let counter=0;
const str=v=>v==null?'':String(v).trim();
// The plain text of a confirmation: the fallback for root.confirm and what the tests read.
function textOf(o){o=typeof o==='string'?{title:o}:(o||{});const facts=(o.facts||[]).map(f=>f[0]+': '+f[1]);
 return [str(o.title),...facts,str(o.cost),str(o.message)].filter(Boolean).join('\n')}
const fallback=o=>{const c=root.confirm;return Promise.resolve(typeof c==='function'?!!c.call(root,textOf(o)):false)};
function canDialog(d){return !!(d&&typeof d.createElement==='function'&&d.body&&typeof d.createElement('dialog').showModal==='function')}
function ensureStyles(d){if(!d.querySelector||!d.head||d.querySelector('link[data-rx-confirm],link[href$="radix-confirm.css"]'))return;
 const l=d.createElement('link');l.rel='stylesheet';l.href=CSS;l.setAttribute('data-rx-confirm','');d.head.append(l)}
const FOCUSABLE='button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function ask(opts){const o=typeof opts==='string'?{title:opts}:(opts||{}),d=root.document;
 if(!canDialog(d))return fallback(o);
 return new Promise(resolve=>{ensureStyles(d);
  const n=++counter,el=(tag,text,cls)=>{const x=d.createElement(tag);if(text!=null)x.textContent=text;if(cls)x.className=cls;return x};
  const prev=d.activeElement,dlg=el('dialog',undefined,'rx-confirm'+(o.tone?' rx-confirm--'+o.tone:''));
  dlg.setAttribute('role',o.tone==='danger'?'alertdialog':'dialog');dlg.setAttribute('aria-modal','true');
  const h=el('h2',str(o.title)||'Confermi?','rx-confirm-title');h.id='rx-confirm-t'+n;dlg.setAttribute('aria-labelledby',h.id);
  const body=el('div',undefined,'rx-confirm-body');body.id='rx-confirm-d'+n;dlg.setAttribute('aria-describedby',body.id);
  if(o.facts&&o.facts.length){const dl=el('dl',undefined,'rx-confirm-facts');o.facts.forEach(([k,v])=>{const r=el('div');r.append(el('dt',str(k)),el('dd',String(v)));dl.append(r)});body.append(dl)}
  if(str(o.cost)){const c=el('p',undefined,'rx-confirm-cost');c.append(el('span',o.tag||'Costo','rx-confirm-tag'),el('span',str(o.cost)));body.append(c)}
  str(o.message).split('\n').filter(Boolean).forEach(t=>body.append(el('p',t,'rx-confirm-msg')));
  const no=el('button',o.cancel||'Annulla','rx-confirm-no'),yes=el('button',o.ok||'Conferma','rx-confirm-yes');no.type=yes.type='button';
  const acts=el('div',undefined,'rx-confirm-actions');acts.append(no,yes);
  dlg.append(h,body,acts);
  let done=false;const finish=v=>{if(done)return;done=true;try{dlg.close()}catch(e){}dlg.remove();if(prev&&typeof prev.focus==='function'&&prev.isConnected)prev.focus();resolve(v)};
  no.onclick=()=>finish(false);yes.onclick=()=>finish(true);
  dlg.addEventListener('cancel',e=>{e.preventDefault();finish(false)});
  dlg.addEventListener('close',()=>finish(false));
  dlg.addEventListener('click',e=>{if(e.target===dlg)finish(false)}); // the backdrop
  dlg.addEventListener('keydown',e=>{
   if(e.key==='Escape'){e.preventDefault();finish(false);return}
   if(e.key==='Enter'&&!e.isComposing){e.preventDefault();finish(e.target!==no);return}
   if(e.key==='Tab'){const f=[...dlg.querySelectorAll(FOCUSABLE)];if(!f.length)return;const first=f[0],last=f[f.length-1],a=d.activeElement;
    if(e.shiftKey&&(a===first||!dlg.contains(a))){e.preventDefault();last.focus()}else if(!e.shiftKey&&(a===last||!dlg.contains(a))){e.preventDefault();first.focus()}}});
  d.body.append(dlg);dlg.showModal();yes.focus()})}

return Object.freeze({ask,textOf});
});
