'use strict';
/* Direct one-off sends from the CRM (Customer360 «Invia e registra», follow-up «Invia», campaign «Invia», ticket replies):
   from the workspace's first active mailbox (Impostazioni › Caselle email: Gmail SMTP or Microsoft 365 via Graph), or,
   when the workspace has none, from the server Gmail (GMAIL_USER). One message per call, always after the user's confirm;
   /api/send-email does the sending (api/_send-email.js). */
(function(root){
const app=()=>root.RadixSalesApp;
let cache=null; // {workspace, mailbox:{id,label,from_email}|null, gmail:boolean}
// → {mailbox,gmail} when a direct send is possible, else null. Cached per workspace; reset() after a mailbox change.
async function ready(){
 const a=app(),ws=String(a&&a.state&&a.state.workspace||'');
 if(!cache||cache.workspace!==ws){
  let mailbox=null,gmail=false;
  if(ws&&a&&a.api){try{const d=await a.api('mailboxes',{});const m=((d&&d.rows)||[]).find(x=>x&&x.status==='active');if(m)mailbox={id:m.id,label:m.label||m.from_email||'',from_email:m.from_email||''}}catch{mailbox=null}}
  if(!mailbox){try{const r=await fetch('/api/integrations/status',{credentials:'same-origin',cache:'no-store'});const d=r.ok?await r.json():{};gmail=!!(d.items||[]).find(i=>i&&i.id==='email'&&i.configured)}catch{gmail=false}}
  cache={workspace:ws,mailbox,gmail};
 }
 return cache.mailbox||cache.gmail?{mailbox:cache.mailbox,gmail:cache.gmail}:null;
}
// The source of the send, for the notes next to the buttons.
const describe=c=>c&&c.mailbox?'dalla casella «'+c.mailbox.label+'»':'dalla casella Gmail configurata';
// p = {to, subject, body, unsubscribeUrl?, kind?} → the server reply; throws with the server's message.
async function send(p){
 const c=await ready();if(!c)throw new Error('Invio diretto non configurato: collega una casella in Impostazioni › Caselle email.');
 const body={...p,confirm:true};if(c.mailbox){body.workspace=cache.workspace;body.mailbox=c.mailbox.id}
 const r=await fetch('/api/send-email',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw new Error(d.error||'Invio non riuscito ('+r.status+').');
 return d;
}
const reset=()=>{cache=null};
root.RadixCrmSendDirect={ready,describe,send,reset};
})(typeof globalThis!=='undefined'?globalThis:this);
