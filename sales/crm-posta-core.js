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
/* «Prossima mossa»: which mail to send to this contact now, from the CRM state (no AI). Fixed rules, in order:
   a received mail is answered first; a won deal gets after-sales; a proposal / negotiation stage gets a chase after
   SILENCE_PROPOSAL days; an early stage gets a follow-up after SILENCE_FOLLOWUP days; no deal and nothing recorded
   gets a first contact; a lost deal gets a reactivation after 60 days; otherwise «wait». Each move carries a draft
   (subject, body) with the names filled in; nothing is sent from here. */
const DAY=864e5,SILENCE_PROPOSAL=5,SILENCE_FOLLOWUP=7,REACTIVATE=60;
const PROPOSAL_STAGE=/propost|preventiv|offert|negozia|trattativ|quot|proposal|negotiat/i,WON_STAGE=/vint|client|chius[oa] vint|won/i,LOST_STAGE=/pers|lost/i;
const first=n=>text(n).trim().split(/\s+/)[0]||'';
function lastTouch(contact,interactions){let last=null;for(const i of interactions||[]){if(i.contact_id!==contact.id)continue;const t=Date.parse(i.occurred_at||i.created_at||'');if(!Number.isNaN(t)&&(last===null||t>last))last=t}return last}
function nextMove(contact,crm,o){
 if(!contact)return null;const now=(o&&o.now)||Date.now(),me=text(o&&o.me).trim();
 const company=(crm.companies||[]).find(c=>c.id===contact.company_id),coName=company?text(company.name):'',name=first(contact.name)||'buongiorno';
 const stageOf=op=>(crm.stages||[]).find(s=>s.id===op.stage_id)||{};
 const opps=(crm.opportunities||[]).filter(op=>op.contact_id===contact.id||(!op.contact_id&&contact.company_id&&op.company_id===contact.company_id));
 const open=opps.filter(op=>op.outcome==null||op.outcome==='open'),won=opps.filter(op=>op.outcome==='won'||WON_STAGE.test(text(stageOf(op).title))),lost=opps.filter(op=>op.outcome==='lost'||LOST_STAGE.test(text(stageOf(op).title)));
 const last=lastTouch(contact,crm.interactions),silence=last===null?null:Math.floor((now-last)/DAY);
 const sign=me?'\n\n'+me:'';
 const draft=(subject,body)=>({subject,body:body+sign});
 const mail=o&&o.mail,received=mail&&o.direction==='received';
 if(received){const s=text(mail.subject).replace(/^\s*(?:re|r|fwd?|fw)\s*:\s*/i,'');
  return {kind:'reply',title:'Rispondi a questa mail',why:'Ti ha scritto '+(contact.name||contact.email)+(open.length?' con una trattativa aperta («'+text(open[0].title)+'»)':'')+': una risposta entro oggi vale più di qualsiasi follow-up.',
   draft:draft('Re: '+s,'Ciao '+name+',\n\ngrazie per la tua mail. '+(open.length?'Procedo come dici e ti aggiorno su «'+text(open[0].title)+'» entro domani.':'Ti rispondo nel dettaglio entro domani; intanto, se preferisci, sentiamoci al telefono: dimmi tu quando.'))}}
 if(won.length&&!open.length){const op=won[0];
  return {kind:'aftersales',title:'Post-vendita',why:'«'+text(op.title)+'» è chiusa come vinta: una mail di avvio e un appuntamento di verifica tengono il cliente vicino.',
   draft:draft('Partiamo insieme: '+text(op.title),'Ciao '+name+',\n\ngrazie ancora per la fiducia su «'+text(op.title)+'». Ti propongo una breve chiamata per fissare i primi passi e le date; fammi sapere due orari che ti vanno bene questa settimana.')}}
 if(open.length){const op=open.slice().sort((a,b)=>(stageOf(b).position||0)-(stageOf(a).position||0))[0],st=stageOf(op),title=text(op.title);
  if(PROPOSAL_STAGE.test(text(st.title))){
   if(silence===null||silence>=SILENCE_PROPOSAL)return {kind:'chase',title:'Sollecita la proposta',why:'«'+title+'» è in fase «'+text(st.title)+'»'+(silence===null?' e non risulta nessun contatto registrato':' e sono passati '+silence+' giorni dall’ultimo contatto')+'.',
    draft:draft('Un riscontro su «'+title+'»','Ciao '+name+',\n\nhai avuto modo di guardare la proposta su «'+title+'»? Se ci sono punti da chiarire o adattare, dimmelo pure: possiamo vederci dieci minuti al telefono quando preferisci.')};
   return {kind:'wait',title:'Aspetta',why:'«'+title+'» è in fase «'+text(st.title)+'» e l’ultimo contatto è di '+silence+(silence===1?' giorno':' giorni')+' fa: un sollecito ora sarebbe prematuro.',draft:null}}
  if(silence===null||silence>=SILENCE_FOLLOWUP)return {kind:'followup',title:'Follow-up',why:'«'+title+'» è aperta in fase «'+(text(st.title)||'iniziale')+'»'+(silence===null?' senza contatti registrati':' e sono passati '+silence+' giorni dall’ultimo contatto')+'.',
   draft:draft('Proseguiamo su «'+title+'»?','Ciao '+name+',\n\nriprendo il filo su «'+title+'»'+(coName?' per '+coName:'')+'. Ti va di fissare una chiamata di 20 minuti per capire tempi e prossimi passi? Dimmi due orari che ti vanno bene.')};
  return {kind:'wait',title:'Aspetta',why:'«'+title+'» è aperta e l’ultimo contatto è di '+silence+(silence===1?' giorno':' giorni')+' fa.',draft:null}}
 if(lost.length&&(silence===null||silence>=REACTIVATE)){const op=lost[0];
  return {kind:'reactivate',title:'Riattiva il contatto',why:'«'+text(op.title)+'» era stata persa'+(silence===null?'':' e sono passati '+silence+' giorni dall’ultimo contatto')+': un messaggio senza pressione riapre la porta.',
   draft:draft('Come procede'+(coName?' in '+coName:'')+'?','Ciao '+name+',\n\nè passato un po’ di tempo da quando ci eravamo sentiti su «'+text(op.title)+'». Se nel frattempo le esigenze sono cambiate, mi fa piacere riparlarne senza impegno: dimmi tu se e quando.')}}
 if(lost.length)return {kind:'wait',title:'Aspetta',why:'L’ultima trattativa era stata persa '+(silence===null?'':silence+' giorni fa')+': riprova dopo '+REACTIVATE+' giorni.',draft:null};
 if(last===null)return {kind:'intro',title:'Primo contatto',why:'Nessuna trattativa e nessun contatto registrato con '+(contact.name||contact.email)+(coName?' ('+coName+')':'')+'.',
  draft:draft('Un confronto di 15 minuti'+(coName?' per '+coName:''),'Ciao '+name+',\n\nmi occupo di aiutare aziende come '+(coName||'la tua')+' a seguire clienti e trattative con meno sforzo. Ti va un confronto di 15 minuti per capire se può esserti utile? Dimmi due orari che ti vanno bene, senza impegno.')};
 return {kind:'followup',title:'Tieni vivo il contatto',why:'Nessuna trattativa aperta; l’ultimo contatto è di '+silence+(silence===1?' giorno':' giorni')+' fa.',
  draft:draft('Ci risentiamo?','Ciao '+name+',\n\nriprendo il filo del nostro ultimo scambio'+(coName?' per '+coName:'')+'. Se ha senso, fissiamo una chiamata breve per capire se posso esserti utile ora: dimmi tu quando.')};
}

/* «Riscrivi con l’AI» on the next-move draft: ONE /api/chat call after the user's click and confirmation. The prompt
   carries only facts the CRM holds (name, role, company, sector), the move and its reason, the mail being answered
   and the current draft; the answer must be «Oggetto: …» then the text. aiParse rejects an answer that brings in
   numbers absent from those facts (invented prices, dates, percentages), so the draft can only get better wording. */
function aiPrompt(mv,contact,crm,o){
 const opt=o||{},company=(crm&&crm.companies||[]).find(c=>c.id===contact.company_id)||{},mail=opt.mail||{};
 const facts=['Nome: '+text(contact.name).trim(),contact.role?'Ruolo: '+text(contact.role).trim():'',company.name?'Azienda: '+text(company.name).trim():'',company.industry?'Settore: '+text(company.industry).trim():'',opt.me?'Firma: '+text(opt.me).trim():''].filter(Boolean).join('\n');
 const excerpt=text(mail.text||mail.preview||'').replace(/\s+/g,' ').trim().slice(0,1500);
 return 'Riscrivi questa email in italiano per una persona precisa: più naturale, breve e concreta, stesso scopo. Non inventare fatti, numeri, prezzi, date, prodotti o referenze che non siano qui sotto. Niente markdown, niente oggetto nel testo.\n'
 +'Mossa consigliata: '+text(mv&&mv.title)+' ('+text(mv&&mv.why)+').\n\nFATTI SUL CONTATTO:\n'+facts
 +(excerpt?'\n\nMAIL A CUI SI RISPONDE (oggetto: '+text(mail.subject).trim()+'):\n'+excerpt:'')
 +'\n\nBOZZA ATTUALE:\nOggetto: '+text(mv&&mv.draft&&mv.draft.subject)+'\n'+text(mv&&mv.draft&&mv.draft.body)
 +'\n\nRispondi SOLO così, senza altro: la prima riga «Oggetto: …», poi una riga vuota, poi il testo dell’email.';
}
function aiParse(reply,o){
 const opt=o||{},raw=text(reply).replace(/\r/g,'').trim();if(!raw)return null;
 const m=/^\s*(?:\*\*)?(?:oggetto|subject)\s*:\s*(.+)$/im.exec(raw);if(!m)return null;
 const subject=m[1].replace(/\*\*$/,'').trim().slice(0,200),body=raw.slice(m.index+m[0].length).replace(/^\s*\n/,'').trim().slice(0,4000);
 if(!subject||!body)return null;
 const allowed=new Set();for(const n of text(opt.source).match(/\d[\d.,:]*/g)||[])allowed.add(n.replace(/[.,:]$/,''));
 const invented=[...new Set((subject+'\n'+body).match(/\d[\d.,:]*/g)||[])].map(n=>n.replace(/[.,:]$/,'')).filter(n=>!allowed.has(n));
 if(invented.length)return {error:'L’AI ha aggiunto numeri che non sono nei dati ('+invented.slice(0,5).join(', ')+'): bozza non cambiata, riprova.'};
 return {subject,body};
}
const api={nextMove,lastTouch,aiPrompt,aiParse,participants,companyByDomain,matches,direction,title,body,interaction,linked,opportunitiesFor,contactFrom,campaignReply,campaignReplies,amountCents,cleanSubject,opportunityHint,opportunityHints,pipelines,opportunityPlan,MAX};
if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixCrmPosta=api;
})(typeof globalThis!=='undefined'?globalThis:this);
