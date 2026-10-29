'use strict';
/* CRM «Posta» (sales-posta.html): pure rules, no DOM. A message read from the connected Microsoft mailbox
   (api/_sales_mail_read.js) is matched to CRM contacts by address and, on «Collega al CRM», saved as an interaction
   of kind email (title, date, sender, recipients and text), linked to a contact and optionally an opportunity. */
(function(root){
const text=v=>v==null?'':String(v);
const addr=v=>text(v).trim().toLowerCase();
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const who=p=>p&&p.address?(p.name&&addr(p.name)!==addr(p.address)?p.name+' <'+p.address+'>':p.address):'';
/* Every address of the message except the mailbox's own: sender first, then To, then Cc. */
function participants(msg,own){const me=addr(own),seen=new Set(),out=[];
 for(const p of [msg&&msg.from,...((msg&&msg.to)||[]),...((msg&&msg.cc)||[])]){const a=addr(p&&p.address);if(!EMAIL.test(a)||a===me||seen.has(a))continue;seen.add(a);out.push({name:text(p.name),address:a})}
 return out}
/* CRM contacts whose email is one of the participants, in the participants' order. */
function matches(msg,contacts,own){const by=new Map();for(const c of contacts||[]){const a=addr(c&&c.email);if(a&&!by.has(a))by.set(a,c)}
 const out=[];for(const p of participants(msg,own)){const c=by.get(p.address);if(c&&!out.includes(c))out.push(c)}return out}
/* Received (from someone else) or sent (from the mailbox). */
const direction=(msg,own)=>addr(msg&&msg.from&&msg.from.address)===addr(own)?'sent':'received';
function title(msg,own){const s=text(msg&&msg.subject).replace(/\s+/g,' ').trim()||'(senza oggetto)';return ((direction(msg,own)==='sent'?'Email inviata: ':'Email ricevuta: ')+s).slice(0,200)}
const MAX=4000;
/* The interaction's text: who, when, then the message as written, cut to the 4000 characters the CRM keeps. */
function body(msg){const lines=['Da: '+who(msg.from)];
 if((msg.to||[]).length)lines.push('A: '+msg.to.map(who).filter(Boolean).join(', '));
 if((msg.cc||[]).length)lines.push('Cc: '+msg.cc.map(who).filter(Boolean).join(', '));
 if(msg.attachments)lines.push('Con allegati (restano in Outlook)');
 const head=lines.join('\n')+'\n\n',t=text(msg.text||msg.preview).trim();
 return head.length+t.length<=MAX?head+t:(head+t).slice(0,MAX-1).trimEnd()+'…'}
/* The command data for /api/sales interactions create. link: {contact, opportunity} (records). */
function interaction(msg,own,link){
 const c=link&&link.contact,o=link&&link.opportunity;if(!c&&!o)return {error:'Scegli un contatto o un’opportunità a cui collegare la mail.'};
 if(c&&o&&o.contact_id&&o.contact_id!==c.id)return {error:'Questa opportunità è di un altro contatto: scegli quella giusta o lascia vuoto.'};
 const at=text(msg&&msg.at);if(!/^\d{4}-\d{2}-\d{2}T/.test(at)||Number.isNaN(Date.parse(at)))return {error:'La mail non ha una data valida.'};
 const company=(c&&c.company_id)||(o&&o.company_id)||null;
 // The opportunity's contact and company must match the interaction's (same rule as tasks and opportunities).
 if(o&&company&&o.company_id&&o.company_id!==company)return {error:'L’opportunità è di un’altra azienda rispetto al contatto scelto.'};
 return {data:{title:title(msg,own),kind:'email',occurred_at:new Date(Date.parse(at)).toISOString().replace(/\.\d{3}Z$/,'Z'),body:body(msg),
  contact_id:c?c.id:(o&&o.contact_id)||null,company_id:company,opportunity_id:o?o.id:null}}}
/* Interactions already saved from this message (same title and same second): the mail shows «Collegata». */
function linked(msg,own,interactions){const t=title(msg,own),at=Date.parse(text(msg&&msg.at));if(Number.isNaN(at))return [];
 return (interactions||[]).filter(i=>i&&i.kind==='email'&&text(i.title)===t&&Math.floor(Date.parse(i.occurred_at)/1000)===Math.floor(at/1000))}
/* Open opportunities to offer for a contact: its own, then its company's. */
function opportunitiesFor(contact,opps){if(!contact)return [];const open=o=>o&&(o.outcome==null||o.outcome==='open');
 const own=(opps||[]).filter(o=>open(o)&&o.contact_id===contact.id),co=contact.company_id?(opps||[]).filter(o=>open(o)&&!o.contact_id&&o.company_id===contact.company_id):[];
 return [...own,...co]}
/* A new contact from a participant: name from the address book name, else from the address. */
function contactFrom(p){const a=addr(p&&p.address);if(!EMAIL.test(a))return null;let n=text(p.name).replace(/\s+/g,' ').trim();
 if(!n||addr(n)===a)n=a.split('@')[0].split(/[._-]+/).filter(Boolean).map(w=>w[0].toUpperCase()+w.slice(1)).join(' ')||a;
 return {name:n.slice(0,200),email:a}}
/* The company of a new contact from the mail: the one of CRM contacts with the same address domain, when they all agree
   (never for free mail providers, where colleagues share nothing). */
const FREE=new Set(['gmail.com','googlemail.com','outlook.com','hotmail.com','hotmail.it','live.com','live.it','msn.com','yahoo.com','yahoo.it','icloud.com','me.com','libero.it','virgilio.it','tiscali.it','alice.it','tim.it','fastwebnet.it','aol.com','proton.me','protonmail.com','gmx.com','gmx.it','pec.it','legalmail.it']);
function companyByDomain(address,contacts){const d=addr(address).split('@')[1]||'';if(!d||FREE.has(d))return null;
 const ids=new Set((contacts||[]).filter(c=>c&&c.company_id&&addr(c.email).split('@')[1]===d).map(c=>c.company_id));return ids.size===1?[...ids][0]:null}
/* Replies to the campaigns: a received mail from a contact the queue wrote to (the worker records «Email: …» interactions,
   api/_sales_send_worker.js) with no answer recorded since (any interaction that is not «Email: …», as LAST_REPLY in api/_sales_optout.js,
   an opt-out included: then nothing more goes out and there is nothing to record). Once linked, the follow-ups stop and the worker skips the contact.
   → {contact, sent} or null. */
const SENT=/^Email: /;
function campaignReply(msg,own,contacts,interactions){
 if(!msg||direction(msg,own)!=='received')return null;
 const at=Date.parse(text(msg.at));if(Number.isNaN(at))return null;
 const from=addr(msg.from&&msg.from.address);if(!EMAIL.test(from))return null;
 const c=(contacts||[]).find(x=>x&&addr(x.email)===from);if(!c)return null;
 const mine=(interactions||[]).filter(i=>i&&i.contact_id===c.id&&!Number.isNaN(Date.parse(i.occurred_at)));
 const sent=mine.filter(i=>SENT.test(text(i.title))&&Date.parse(i.occurred_at)<=at).sort((a,b)=>Date.parse(b.occurred_at)-Date.parse(a.occurred_at))[0];
 if(!sent)return null;
 const since=Date.parse(sent.occurred_at);
 // An answer already recorded, or an opt-out since the send (nothing more goes out): nothing to record.
 if(mine.some(i=>!SENT.test(text(i.title))&&Date.parse(i.occurred_at)>=since))return null;
 return {contact:c,sent};
}
/* The mails of the list that are replies to campaigns still to record, in list order. */
function campaignReplies(items,own,contacts,interactions){const out=[];for(const m of items||[]){const r=campaignReply(m,own,contacts,interactions);if(r)out.push({msg:m,...r})}return out}
/* Opportunities suggested from the mail list (received or sent): a mail whose subject or preview speaks of a proposal
   (HINT) or carries an amount, with a counterpart that is a CRM contact without an open opportunity, or a person not yet
   in the CRM. One suggestion per conversation (the newest mail of it); a mail already linked to an opportunity is skipped.
   Nothing is created here: the page shows the cards and creates on «Crea opportunità» after a confirmation. */
const HINT=/\b(propost[ae]|preventiv[oi]|offert[ae]|quotazion[ei]|quote|quotation|proposal|contratt[oi]|ordine|ordini|listino|accordo|collaborazione|tariff[ae]|budget|fattur[ae]|invoice|pricing)\b/i;
const NUM='\\d{1,3}(?:[.\\s]\\d{3})+(?:,\\d{1,2})?|\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?';
const AMOUNT=new RegExp('(?:€|eur\\b|euro\\b|£|gbp\\b)\\s?('+NUM+')|('+NUM+')\\s?(?:€|eur\\b|euro\\b|£|gbp\\b)','i');
/* Amount in cents from a text («€ 12.500», «12.500,00 euro», «1200€», «12,5 €», «£ 1,200.50»), else null. */
function amountCents(s){const m=AMOUNT.exec(text(s));if(!m)return null;let v=(m[1]||m[2]||'').replace(/\s/g,'');
 if(/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(v))v=v.replace(/\./g,'').replace(',','.');
 else if(/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(v))v=v.replace(/,/g,'');
 else if(/^\d+,\d{1,2}$/.test(v))v=v.replace(',','.');
 const n=Math.round(Number(v)*100);return Number.isFinite(n)&&n>0&&n<=1e13?n:null}
const cleanSubject=s=>text(s).replace(/^(?:\s*(?:re|r|fwd?|fw|i|tr|aw|wg)\s*:\s*)+/i,'').replace(/\s+/g,' ').trim();
function opportunityHint(msg,own,contacts,companies,opportunities,interactions){
 if(!msg)return null;const blob=text(msg.subject)+' '+text(msg.preview);const kw=HINT.exec(blob),amount=amountCents(blob);if(!kw&&amount===null)return null;
 if(linked(msg,own,interactions).some(i=>i&&i.opportunity_id))return null;
 const parts=participants(msg,own);if(!parts.length)return null;
 const contact=matches(msg,contacts,own)[0]||null;
 const participant=(contact&&parts.find(p=>p.address===addr(contact.email)))||parts[0];
 if(contact&&opportunitiesFor(contact,opportunities).length)return null;
 const companyId=contact?(contact.company_id||null):companyByDomain(participant.address,contacts);
 const company=companyId?(companies||[]).find(c=>c&&c.id===companyId)||null:null;
 const who=(company&&company.name)||(contact&&contact.name)||participant.name||participant.address.split('@')[0];
 const subject=cleanSubject(msg.subject)||'(senza oggetto)';
 return {msg,direction:direction(msg,own),contact,participant,company,companyId,amount,keyword:kw?kw[0]:null,title:(who+' · '+subject).slice(0,200)};
}
function opportunityHints(items,own,contacts,companies,opportunities,interactions){
 const out=[],seen=new Set();
 for(const m of items||[]){const key=text(m&&m.conversation)||text(m&&m.id);if(!key||seen.has(key))continue;const h=opportunityHint(m,own,contacts,companies,opportunities,interactions);if(!h)continue;seen.add(key);out.push(h)}
 return out;
}
/* First stage of every opportunity pipeline (processes of kind «opportunity», lowest position). */
function pipelines(processes,stages){
 return (processes||[]).filter(p=>p&&p.kind==='opportunity').map(p=>{const s=(stages||[]).filter(x=>x&&x.process_id===p.id).sort((a,b)=>a.position-b.position)[0];return s?{process_id:p.id,stage_id:s.id,title:p.title||'Pipeline',stage:s.title||''}:null}).filter(Boolean);
}
/* What «Crea opportunità» creates for a hint and a pipeline: the contact when missing, then the opportunity. */
function opportunityPlan(h,pipe){
 if(!h)return {error:'Suggerimento non valido.'};if(!pipe||!pipe.process_id||!pipe.stage_id)return {error:'Crea prima una pipeline delle opportunità nel CRM.'};
 const contact=h.contact?{id:h.contact.id}:(()=>{const c=contactFrom(h.participant);if(!c)return null;if(h.companyId)c.company_id=h.companyId;return {create:c}})();
 if(!contact)return {error:'La mail non ha un indirizzo valido per il contatto.'};
 const opportunity={title:h.title,process_id:pipe.process_id,stage_id:pipe.stage_id};if(h.amount!==null&&h.amount!==undefined)opportunity.amount_cents=h.amount;
 return {contact,opportunity,companyId:h.companyId||null};
}
const api={participants,companyByDomain,matches,direction,title,body,interaction,linked,opportunitiesFor,contactFrom,campaignReply,campaignReplies,amountCents,cleanSubject,opportunityHint,opportunityHints,pipelines,opportunityPlan,MAX};
if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixCrmPosta=api;
})(typeof globalThis!=='undefined'?globalThis:this);
