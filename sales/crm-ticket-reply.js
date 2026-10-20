'use strict';
/* Assistenza clienti: reply to a support ticket from its card. The AI (Copilota, on the live CRM data)
   writes a draft into an editable box; the person checks it and then sends it (one email, one
   confirmation, through /api/send-email), opens it in their mail client, or marks it as sent.
   Every reply is recorded as an «email» interaction of the contact, and an open ticket moves to
   «in attesa» (waiting for the customer). Nothing is sent without a click. */
(function(root){
// Pure: the request to the AI for one ticket. Only the email text comes back, so it can go straight in the box.
function aiPrompt(ticket,contact){
 const who=contact&&contact.name&&contact.name!=='Contatto anonimizzato'?contact.name:'il cliente';
 return 'Scrivi la risposta email al ticket di assistenza «'+String(ticket.title||'').slice(0,200)+'» per '+who+'.'
  +(ticket.body?' Richiesta del cliente: «'+String(ticket.body).slice(0,1500)+'».':'')
  +' Tono cortese e concreto, in italiano, massimo 150 parole. Usa solo i dati del CRM, non promettere tempi, sconti o interventi che non risultano.'
  +' Se manca un dato necessario scrivi [DA COMPLETARE: cosa]. Rispondi solo con il testo dell’email, senza oggetto, senza firma inventata e senza commenti.';
}
// Pure: the AI text cleaned for the box (no code fences, no «Oggetto:» line, no surrounding quotes).
function cleanDraft(text){
 let t=String(text||'').replace(/^```[a-z]*\n?|```$/gim,'').trim();
 t=t.replace(/^(oggetto|subject)\s*:.*\n+/i,'').trim();
 if(/^[«"“].*[»"”]$/s.test(t))t=t.slice(1,-1).trim();
 return t.slice(0,4000);
}
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Pure: what one reply does. to is null when the contact has no valid email (mail client and «segna» still work).
function plan(ticket,contact,body,now){
 const text=String(body||'').trim();
 if(!text)return {error:'Scrivi la risposta prima di inviarla.'};
 if(text.length>4000)return {error:'La risposta supera 4000 caratteri: accorciala.'};
 const subject=('Re: '+String(ticket.title||'Richiesta di assistenza')).slice(0,200);
 const to=contact&&EMAIL.test(String(contact.email||'').trim())?String(contact.email).trim():null;
 const company=ticket.company_id||(contact&&contact.company_id)||null;
 // An interaction needs a contact or a company; a ticket with neither only changes state.
 return {error:null,to,subject,body:text,
  interaction:!ticket.contact_id&&!company?null:{title:('Risposta al ticket: '+String(ticket.title||'')).slice(0,200),kind:'email',occurred_at:new Date(now??Date.now()).toISOString().slice(0,19)+'Z',body:text,contact_id:ticket.contact_id||null,company_id:company},
  ticket:ticket.status==='open'?{id:ticket.id,version:ticket.version,status:'pending'}:null};
}
const core={aiPrompt,cleanDraft,plan};
if(typeof module==='object'&&module.exports){module.exports=core;return}
root.RadixCrmTicketReply=core;

const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n};
const B=(text,fn,cls)=>{const b=E('button',text,cls);b.type='button';b.addEventListener('click',fn);return b};
const app=()=>root.RadixSalesApp;
const post=(entity,action,data)=>app().api(entity,{body:{workspace:app().state.workspace,entity,action,data}});
let emailReady=null;
async function emailConfigured(){if(emailReady!==null)return emailReady;try{const r=await fetch('/api/integrations/status',{credentials:'same-origin',cache:'no-store'});const d=r.ok?await r.json():{};emailReady=!!(d.items||[]).find(i=>i.id==='email'&&i.configured)}catch{emailReady=false}return emailReady}
async function contactOf(ticket){
 if(!ticket.contact_id)return null;
 const a=app(),known=a.rows('contacts').find(c=>c.id===ticket.contact_id);if(known)return known;
 const d=await a.api('customer360',{subject:'contacts',id:ticket.contact_id});
 return ((d.rows||[]).find(r=>r.entity==='contacts'&&r.record.id===ticket.contact_id)||{}).record||null;
}
async function run(label,fn){const a=app();if(a.state.busy)return false;a.lock(true);a.error('');a.notice(label);let ok=false;try{await fn();ok=true}catch(e){a.error(e.message||String(e))}finally{a.lock(false)}return ok}

// Card block: «Rispondi al cliente» (writable roles, tickets not closed).
function mount(c,ticket){
 const a=app();if(!a||!a.writable('interactions')||!['open','pending'].includes(ticket.status))return false;
 const box=E('details',undefined,'crm-ticket-reply');box.append(E('summary','Rispondi al cliente'));
 const label=E('label','Risposta');const area=E('textarea');area.rows=8;area.maxLength=4000;area.placeholder='Scrivi la risposta o chiedi una bozza all’AI.';label.append(area);
 const note=E('p','','muted');const acts=E('div',undefined,'actions');box.append(label,acts,note);
 let contact,loaded=false;
 const load=async()=>{if(!loaded){contact=await contactOf(ticket);loaded=true}return contact};
 // Knowledge base and quick replies (sales/crm-knowledge.js) sit above the box and write into it.
 if(root.RadixCrmKnowledge&&root.RadixCrmKnowledge.attach)root.RadixCrmKnowledge.attach(box,area,ticket,load);
 const record=async p=>{if(p.interaction)await post('interactions','create',p.interaction);if(p.ticket)await post('tickets','update',p.ticket);await a.refresh(false)};
 acts.append(B('Bozza con l’AI',async()=>{
  if(!await run('L’AI sta scrivendo la bozza…',async()=>{const ct=await load();
   const r=await fetch('/api/chat',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({role:'crm-copilot',crmScope:{workspace:a.state.workspace},messages:[{role:'user',content:aiPrompt(ticket,ct)}]})});
   const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'AI non disponibile ('+r.status+').');
   const t=cleanDraft(d.reply);if(!t)throw new Error('Bozza vuota: riprova.');area.value=t;
   note.textContent='Bozza dell’AI: controllala e completa le parti tra parentesi quadre prima di inviarla.'}))return;
  a.notice('Bozza pronta.');area.focus()}));
 acts.append(B('Invia',async()=>{
  let p;if(!await run('Preparo l’invio…',async()=>{const ct=await load();p=plan(ticket,ct,area.value);if(p.error)throw new Error(p.error);
   if(!p.to)throw new Error('Il contatto del ticket non ha un’email valida: usa «Segna come inviata» dopo aver risposto da un altro canale.');
   if(!await emailConfigured())throw new Error('Invio diretto non configurato (manca Gmail): usa «Apri nel programma email».')}))return;
  if(/\[DA COMPLETARE/i.test(p.body)&&!window.confirm('La risposta contiene ancora parti [DA COMPLETARE]. Inviarla comunque?'))return;
  if(!window.confirm('Inviare ora la risposta a '+p.to+'?\nOggetto: '+p.subject))return;
  if(await run('Invio in corso…',async()=>{const r=await fetch('/api/send-email',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({to:p.to,subject:p.subject,body:p.body,confirm:true})});
   const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw new Error(d.error||'Invio non riuscito ('+r.status+').');await record(p)}))a.notice('Risposta inviata a '+p.to+' e registrata.')}));
 acts.append(B('Apri nel programma email',async()=>{
  let p;if(!await run('Preparo l’email…',async()=>{p=plan(ticket,await load(),area.value);if(p.error)throw new Error(p.error)}))return;
  location.href='mailto:'+(p.to?encodeURIComponent(p.to):'')+'?subject='+encodeURIComponent(p.subject)+'&body='+encodeURIComponent(p.body);
  note.textContent='Dopo l’invio dal tuo programma email, premi «Segna come inviata».'}));
 acts.append(B('Segna come inviata',async()=>{
  let p;if(!await run('Registro la risposta…',async()=>{p=plan(ticket,await load(),area.value);if(p.error)throw new Error(p.error)}))return;
  if(!window.confirm('Registrare la risposta come inviata'+(p.ticket?' e mettere il ticket «in attesa» del cliente':'')+'?'))return;
  if(await run('Registro la risposta…',()=>record(p)))a.notice('Risposta registrata'+(p.ticket?': ticket in attesa del cliente.':'.'))}));
 c.append(box);return true;
}
root.RadixCrmTicketReply.mount=mount;
})(typeof globalThis!=='undefined'?globalThis:this);
