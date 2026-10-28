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
const api={participants,companyByDomain,matches,direction,title,body,interaction,linked,opportunitiesFor,contactFrom,MAX};
if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixCrmPosta=api;
})(typeof globalThis!=='undefined'?globalThis:this);
