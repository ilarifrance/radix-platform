'use strict';
/* «Scrivi con l’AI una per contatto» (campaign panel of crm-campaigns.js, next to «Metti in coda»). RadixCrmAiEmails.open
   draws, in the panel, one card per contact of the lot (at most MAX_LOT, only the contacts the campaign rules would send
   to). «Genera le email con l’AI» asks ONE confirmation that names the number of AI calls, then makes one /api/chat call
   per contact (role crm-copilot, no workspace snapshot: the facts travel in the prompt, crm-ai-emails-core.js). Every
   subject and text can be corrected in its card; «Rigenera» is one more call; «Usa il testo base» goes back to the
   campaign text. «Metti in coda» then passes the texts to RadixCrmMailboxes.enqueue, which asks ONE approval for the
   whole lot (api/_sales_mailboxes.js texts). Nothing is sent from this file; the queue sends in working hours. */
(function(){
const C=window.RadixCrmAiEmailsCore;if(!C)return;
const PARALLEL=3;
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n};
const B=(text,fn,cls)=>{const b=E('button',text,cls);b.type='button';b.addEventListener('click',fn);return b};
const app=()=>window.RadixSalesApp;
const n=(v,s,p)=>new Intl.NumberFormat('it-IT').format(v||0)+' '+(v===1?s:p);
// The campaign text filled for one contact: the base every card starts from and falls back to.
const fill=(t,c)=>{const F=window.RadixCrmCampaignCore&&window.RadixCrmCampaignCore.fill;return F?F(t,c):String(t)};
async function ask(content){
 const r=await fetch('/api/chat',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({role:'crm-copilot',messages:[{role:'user',content}]})});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'AI non disponibile ('+r.status+').');return d.reply;
}
// open({subject, body, contacts, companies, mode, mount, enqueue}): contacts = the lot (already filtered by the campaign
// rules, in the order they would be sent: more than MAX_LOT are taken in lots, one after the other), companies = rows of
// the companies export, enqueue(texts, ids) → RadixCrmMailboxes.enqueue with the texts and the contacts of the lot.
function open(o){
 const a=app(),mount=o.mount,t={subject:String(o.subject||'').trim(),body:String(o.body||'').trim()};
 const byName=new Map((o.companies||[]).map(c=>[String(c.name||'').trim().toLowerCase(),c]));
 const all=o.contacts||[],lots=C.lots(all.length);let lot=0,items=[];
 const build=c=>({id:c.id,contact:c,facts:C.facts(c,c.company?byName.get(String(c.company).trim().toLowerCase()):null),base:{subject:fill(t.subject,c).slice(0,C.SUBJECT_MAX),body:fill(t.body,c).slice(0,C.BODY_MAX)},subject:null,body:null,warnings:[],error:null,ai:false});
 const box=E('div',undefined,'crm-ai-emails');mount.replaceChildren(box);
 const head=E('p','','crm-ai-emails-head'),lotLine=E('p','','muted crm-ai-emails-lot'),status=E('p','','muted crm-ai-emails-status');status.setAttribute('role','status');
 const cards=E('div',undefined,'crm-ai-emails-cards'),acts=E('div',undefined,'actions');
 const gen=B('Genera le email con l’AI',()=>generate(items.filter(it=>!it.ai)),'primary');
 const queue=B('Metti in coda queste email',async()=>{
  const texts=C.texts(items.map(it=>({id:it.id,subject:it.subject,body:it.body,base:it.base})));
  const r=await o.enqueue(texts,items.map(it=>it.id));if(r){gen.disabled=queue.disabled=true;queued=true;summary()}
 });
 // The next lot (same campaign: the queue skips a contact already in it, so nothing is sent twice).
 const next=B('Lotto successivo',()=>{if(lot+1>=lots.length)return;lot++;queued=false;gen.disabled=queue.disabled=false;items=all.slice(lots[lot].from,lots[lot].to).map(build);redraw();box.scrollIntoView({block:'start'})});
 const close=B('Chiudi',()=>mount.replaceChildren());let queued=false;
 acts.append(gen,queue,next,close);box.append(E('h4','Email scritte dall’AI, una per contatto'),head,lotLine,acts,status,cards);
 function summary(){
  const done=items.filter(it=>it.ai).length,warn=items.filter(it=>it.ai&&it.warnings.length).length,failed=items.filter(it=>it.error).length,L=lots[lot];
  head.textContent=n(items.length,'contatto nel lotto','contatti nel lotto')+'. '
   +(done?n(done,'email scritta dall’AI','email scritte dall’AI')+(warn?', '+warn+' da rileggere':'')+(failed?', '+failed+' non riuscite (useranno il testo base)':'')+'. Correggi quello che vuoi, poi «Metti in coda»: una sola conferma per tutto il lotto.':'Una chiamata AI per contatto, solo dopo la tua conferma. Nulla viene inviato da qui.');
  lotLine.hidden=lots.length<=1;
  lotLine.textContent=lots.length>1?'Lotto '+(lot+1)+' di '+lots.length+': contatti da '+(L.from+1)+' a '+L.to+' su '+all.length+'. '+(queued?'In coda. Passa al lotto successivo: stessa campagna, chi è già in coda non viene ripreso.':'Dopo «Metti in coda» passi al lotto successivo, fino all’ultimo contatto.'):'';
  gen.textContent=done?'Scrivi le mancanti con l’AI ('+(items.length-done)+')':'Genera le email con l’AI';gen.hidden=done===items.length||queued;
  queue.textContent='Metti in coda queste '+n(items.length,'email','email');
  const more=lot+1<lots.length;next.hidden=!(queued&&more);next.textContent=more?'Lotto successivo ('+(lots[lot+1].from+1)+'–'+lots[lot+1].to+')':'Lotto successivo';
 }
 function card(it){
  const el=E('article',undefined,'crm-ai-email'+(it.warnings.length?' has-warnings':''));
  el.append(E('strong',it.contact.name+' · '+(it.contact.email||'')),E('span',[it.facts.ruolo,it.facts.azienda,it.facts.settore,it.facts.citta].filter(Boolean).join(' · ')||'Nessun dato oltre l’email: resterà vicina al testo base','muted'));
  const subject=Object.assign(E('input'),{maxLength:C.SUBJECT_MAX,value:it.subject===null?it.base.subject:it.subject});subject.setAttribute('aria-label','Oggetto');
  const body=Object.assign(E('textarea'),{maxLength:C.BODY_MAX,rows:7,value:it.body===null?it.base.body:it.body});body.setAttribute('aria-label','Testo');
  subject.addEventListener('input',()=>{it.subject=subject.value});body.addEventListener('input',()=>{it.body=body.value});
  const ls=E('label','Oggetto');ls.append(subject);const lb=E('label','Testo');lb.append(body);
  el.append(E('span',it.ai?'Scritta dall’AI':it.error?'AI non riuscita: '+it.error:'Testo base (non ancora scritta dall’AI)','crm-ai-email-tag'+(it.ai?' ai':'')),ls,lb);
  if(it.warnings.length){const ul=E('ul',undefined,'crm-ai-email-warnings');for(const w of it.warnings)ul.append(E('li',w));el.append(ul)}
  const row=E('div',undefined,'actions');
  row.append(B('Rigenera',()=>generate([it])),B('Usa il testo base',()=>{it.subject=null;it.body=null;it.ai=false;it.warnings=[];it.error=null;redraw()}));
  el.append(row);return el;
 }
 function redraw(){summary();cards.replaceChildren(...items.map(card))}
 // One AI call per contact, in order, after one confirmation that names the number of calls (credits).
 async function generate(list){
  if(!list.length||a.state.busy)return;
  if(!window.confirm('Chiedere all’AI di scrivere '+n(list.length,'email','email')+', una per contatto?\n'+n(list.length,'chiamata AI','chiamate AI')+', consumano crediti API. Usa solo i dati del CRM su ogni persona e il tuo testo: nulla viene inviato, leggerai ogni email prima di metterla in coda.'))return;
  // PARALLEL calls at a time (a lot of 100 takes minutes, not a quarter of an hour); the cards keep the contacts' order.
  let done=0,next=0;a.lock(true);a.error('');
  const one=async it=>{status.textContent='L’AI scrive le email: '+done+' di '+list.length+' pronte · '+it.contact.name+'…';
   try{const got=C.parse(await ask(C.prompt(t,it.facts,{mode:o.mode||'consent'})),it.facts,t);if(!got)throw new Error('risposta non leggibile');
    it.subject=got.subject;it.body=got.body;it.warnings=got.warnings;it.ai=true;it.error=null}
   catch(e){it.error=(e&&e.message)||String(e);it.ai=false;it.subject=null;it.body=null;it.warnings=[]}
   done++;redraw()};
  const lane=async()=>{while(next<list.length){const it=list[next++];await one(it)}};
  try{await Promise.all(Array.from({length:Math.min(PARALLEL,list.length)},lane))}
  finally{a.lock(false)}
  status.textContent='';const ok=list.filter(it=>it.ai).length;
  a.notice(ok===list.length?n(ok,'email scritta','email scritte')+' dall’AI: rileggile, poi «Metti in coda».':ok+' di '+list.length+' scritte: le altre useranno il testo base, oppure premi «Rigenera».');
 }
 items=all.slice(lots[0].from,lots[0].to).map(build);redraw();box.scrollIntoView({block:'start'});return {get items(){return items},get lot(){return lot},lots,redraw};
}
window.RadixCrmAiEmails={open};
})();
