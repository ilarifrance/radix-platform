'use strict';
/* Copilota commerciale: chat with the AI on the live CRM data of the selected workspace.
   The server reads the CRM snapshot (crmScope) only for members; the AI cannot change the CRM.
   Opens from the floating button, or from any page via window.RadixCrmCopilot.open(question). */
(()=>{
const $=id=>document.getElementById(id);
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n};
const SUGGEST=['Su quali trattative mi concentro questa settimana e perché?','Quali clienti non sento da troppo tempo?','Prepara un follow-up per la trattativa più a rischio','Perché stiamo perdendo trattative?'];
let messages=[],busy=false,panel=null,log=null,input=null,send=null;
function workspace(){return $('workspace')?.value||''}
function css(){if(document.querySelector('link[data-crm-copilot]'))return;const l=document.createElement('link');l.rel='stylesheet';l.href='/sales/crm-copilot.css';l.dataset.crmCopilot='';document.head.append(l)}
function bubble(role,text){const b=E('div',undefined,'cc-msg cc-'+role);b.append(E('p',text));log.append(b);log.scrollTop=log.scrollHeight;return b}
async function ask(question){
 const q=String(question||'').trim();if(!q||busy)return;
 const w=workspace();if(!w){bubble('error','Scegli prima un workspace CRM.');return}
 busy=true;send.disabled=true;input.value='';bubble('user',q);messages.push({role:'user',content:q});
 const wait=bubble('assistant','Sto leggendo il CRM…');wait.classList.add('cc-wait');
 try{
  const r=await fetch('/api/chat',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({role:'crm-copilot',crmScope:{workspace:w},messages:messages.slice(-12)})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(d.error||'Copilota non disponibile ('+r.status+').');
  if(typeof d.reply!=='string'||!d.reply.trim())throw Error('Risposta vuota: riprova.');
  wait.remove();bubble('assistant',d.reply);messages.push({role:'assistant',content:d.reply});
 }catch(e){wait.remove();messages.pop();bubble('error',e.message)}
 finally{busy=false;send.disabled=false;input.focus()}
}
function build(){
 css();panel=E('dialog',undefined,'cc-panel');panel.setAttribute('aria-labelledby','cc-title');
 const head=E('div',undefined,'cc-head');const h=E('h2','Copilota commerciale');h.id='cc-title';
 const close=E('button','Chiudi','cc-close');close.type='button';close.onclick=()=>panel.close();
 head.append(h,close);
 const note=E('p','Risponde sui dati di questo workspace, letti ora. Non modifica il CRM e non invia messaggi.','cc-note');
 log=E('div',undefined,'cc-log');log.setAttribute('aria-live','polite');
 const chips=E('div',undefined,'cc-chips');SUGGEST.forEach(s=>{const b=E('button',s);b.type='button';b.onclick=()=>ask(s);chips.append(b)});
 const form=E('form',undefined,'cc-form');input=E('textarea');input.rows=2;input.maxLength=2000;input.placeholder='Chiedi qualcosa sul tuo CRM…';input.setAttribute('aria-label','Domanda al Copilota');
 input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ask(input.value)}});
 send=E('button','Chiedi');send.type='submit';form.append(input,send);form.addEventListener('submit',e=>{e.preventDefault();ask(input.value)});
 panel.append(head,note,log,chips,form);document.body.append(panel);
 $('workspace')?.addEventListener('change',()=>{messages=[];log.replaceChildren()});
}
function open(question){if(!panel)build();if(!panel.open)panel.showModal();if(question)ask(question);else input.focus()}
// On phones only the icon shows (crm-copilot.css): the name stays in aria-label and title.
function fab(){if(document.querySelector('.cc-fab'))return;css();const b=E('button',undefined,'cc-fab');b.type='button';b.setAttribute('aria-label','Copilota AI');b.title='Copilota AI';
 const i=E('span','✦','cc-fab-icon');i.setAttribute('aria-hidden','true');b.append(i,E('span','Copilota AI','cc-fab-label'));b.onclick=()=>open();document.body.append(b)}
window.RadixCrmCopilot={open};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fab);else fab();
})();
