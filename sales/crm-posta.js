'use strict';
/* CRM «Posta» (sales-posta.html): the Microsoft 365 mailbox connected by this user (Impostazioni › Caselle), read through
   /api/sales?entity=mail (api/_sales_mail_read.js), next to the CRM. Each mail shows the CRM contacts it involves;
   «Collega al CRM» saves it as an email interaction of a contact and, if chosen, an opportunity (crm-posta-core.js).
   Nothing is sent from here and nothing is read until the page asks for one folder of one mailbox. */
(function(){
const P=window.RadixCrmPosta,$=id=>document.getElementById(id);
const E=(tag,txt,cls)=>{const n=document.createElement(tag);if(txt!==undefined)n.textContent=String(txt);if(cls)n.className=cls;return n};
const S={meName:'',workspace:'',workspaces:[],mailbox:'',mailboxes:[],folder:'inbox',search:'',skip:0,items:[],more:false,open:null,crm:{contacts:[],companies:[],opportunities:[],interactions:[],processes:[],stages:[]},crmReady:false,gen:0,busy:false,opps:false,created:new Set()};
const wsMemo={get(){try{return localStorage.getItem('radix.workspace')||''}catch{return ''}},set(v){try{if(v)localStorage.setItem('radix.workspace',v)}catch{}}};
const status=(m,err)=>{const p=$('pm-status');p.textContent=m||'';p.classList.toggle('err',!!err)};
class ApiError extends Error{constructor(m,s,code){super(m);this.status=s;this.code=code}}
async function get(params){const q=new URLSearchParams(params);const r=await fetch('/api/sales?'+q,{credentials:'same-origin',cache:'no-store'});const d=await r.json().catch(()=>({}));
 if(!r.ok)throw new ApiError(r.status===401?'Sessione non autenticata: accedi a RADIX sullo stesso dominio.':typeof d.error==='string'?d.error:'Richiesta non riuscita ('+r.status+').',r.status,d.code);return d}
async function post(entity,data){const r=await fetch('/api/sales',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json','x-radix-sales':'1'},body:JSON.stringify({workspace:S.workspace,entity,action:'create',data})});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw new ApiError(typeof d.error==='string'?d.error:'Salvataggio non riuscito ('+r.status+').',r.status);const row=d.rows?.[0];if(!row?.id)throw new ApiError('Il server non ha restituito il record: premi Aggiorna e verifica.');return row}
async function pages(entity,gen){const all=[];for(let n=0;n<10;n++){const d=await get({entity,workspace:S.workspace,offset:String(all.length),limit:'500'});if(gen!==S.gen)return null;all.push(...d.rows);if(d.rows.length<(Number(d.limit)||100))break}return all}
const own=()=>S.mailboxes.find(m=>m.id===S.mailbox)?.from_email||'';
const when=t=>{const D=window.RadixCrmDates,ms=Date.parse(t);if(Number.isNaN(ms))return '';if(!D)return new Date(ms).toLocaleString('it-IT');const v=D.inputAt(ms);const today=D.inputAt(Date.now()).slice(0,10);return v.slice(0,10)===today?D.hm(ms):v.slice(8,10)+'/'+v.slice(5,7)+(v.slice(0,4)===today.slice(0,4)?'':'/'+v.slice(2,4))};
/* Avatar: initials of the name (or the address) on a colour chosen by the address, the same across list and mail. */
const initials=p=>{const n=String(p?.name||'').trim();if(n){const w=n.replace(/[«»"'()<>]/g,'').split(/\s+/).filter(Boolean);return ((w[0]?.[0]||'')+(w.length>1?w[w.length-1][0]:'')).toUpperCase()}const a=String(p?.address||'?');return a.slice(0,2).toUpperCase()};
const hue=p=>{const s=String(p?.address||p?.name||'');let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return h%360};
const avatar=p=>{const a=E('span',initials(p),'pm-av');a.setAttribute('aria-hidden','true');a.style.setProperty('--h',String(hue(p)));return a};
const longWhen=t=>{const D=window.RadixCrmDates,ms=Date.parse(t);return Number.isNaN(ms)?'':D?D.dateTimeLabel(ms):new Date(ms).toLocaleString('it-IT')};

async function init(){
 // The signature of the drafts: the signed-in person's name (not required).
 fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>{S.meName=String(d&&d.user&&d.user.name||'').trim()}).catch(()=>{});
 try{const d=await get({entity:'workspaces'});S.workspaces=d.rows;const sel=$('pm-workspace');sel.replaceChildren();
  if(!d.rows.length){sel.append(E('option','Nessun workspace'));status('Nessun workspace CRM disponibile per questo account.');return}
  for(const w of d.rows){const o=E('option',w.name||w.id);o.value=w.id;sel.append(o)}const kept=wsMemo.get();if(d.rows.some(w=>w.id===kept))sel.value=kept;S.workspace=sel.value;wsMemo.set(S.workspace);await workspace()}
 catch(e){status(e.message,true)}}
async function workspace(){const gen=++S.gen;S.mailbox='';S.items=[];S.open=null;S.crmReady=false;drawList();drawRead();status('Caricamento delle caselle…');
 let boxes=[];try{boxes=(await get({entity:'mailboxes',workspace:S.workspace})).rows||[]}catch(e){if(gen===S.gen)status(e.message,true);return}
 if(gen!==S.gen)return;S.mailboxes=boxes.filter(m=>m.provider==='microsoft');const sel=$('pm-mailbox');sel.replaceChildren();
 if(!S.mailboxes.length){sel.disabled=true;sel.append(E('option','Nessuna casella Microsoft'));
  status('Nessuna casella Microsoft 365 collegata in questo workspace. Collegala da Impostazioni › Caselle email con «Collega con Microsoft 365».',true);return}
 for(const m of S.mailboxes){const o=E('option',(m.label||m.from_email)+' · '+m.from_email);o.value=m.id;sel.append(o)}sel.disabled=S.mailboxes.length<2;S.mailbox=sel.value;
 crm(gen);await folder()}
// The CRM side, loaded once per workspace: contacts (to match addresses), companies, opportunities, email interactions.
async function crm(gen){try{const [contacts,companies,opportunities,interactions,processes,stages]=await Promise.all(['contacts','companies','opportunities','interactions','processes','stages'].map(e=>pages(e,gen)));
 if(gen!==S.gen||!contacts)return;S.crm={contacts,companies,opportunities,interactions:interactions.filter(i=>i.kind==='email'),all:interactions,processes:processes||[],stages:stages||[]};S.crmReady=true;drawList();drawRead()}
 catch(e){if(gen===S.gen)status('CRM non caricato: '+e.message+' Puoi leggere la posta, ma non collegarla.',true)}}
async function folder(append){if(!S.mailbox)return;const gen=S.gen;if(!append){S.skip=0;S.items=[];S.open=null;drawRead()}
 status(S.search?'Ricerca in corso…':'Lettura della casella…');$('pm-more').hidden=true;
 try{const d=await get({entity:'mail',workspace:S.workspace,mailbox:S.mailbox,folder:S.folder,skip:String(S.skip),...(S.search?{search:S.search}:{})});if(gen!==S.gen)return;
  S.items=append?[...S.items,...d.rows.filter(r=>!S.items.some(x=>x.id===r.id))]:d.rows;S.more=!S.search&&d.rows.length===25&&S.skip<975;
  status(S.items.length?(S.search?S.items.length+' risultati per «'+S.search+'».':'Ultime '+S.items.length+' mail · '+(S.folder==='sent'?'Inviata':'In arrivo')+'.'):'Nessuna mail qui.');drawList()}
 catch(e){if(gen!==S.gen)return;S.items=[];drawList();status(e.message,true);if(e.code==='needs_reconnect')reconnectHint()}}
function reconnectHint(){const host=$('pm-read');host.replaceChildren(E('h2','Serve un nuovo collegamento della casella','pm-force'),
 E('p','La casella è stata collegata prima che RADIX chiedesse il permesso di leggere la posta. Vai in Impostazioni › Caselle email e premi di nuovo «Collega con Microsoft 365» con lo stesso account: Microsoft chiederà di consentire la lettura. L’invio continua a funzionare anche prima.'),
 Object.assign(E('a','Apri Impostazioni › Caselle email ↗','pm-btn'),{href:'/impostazioni.html?area=sales#caselle'}))}

/* ---------- List ---------- */
const matched=m=>S.crmReady?P.matches(m,S.crm.contacts,own()):[];
const isLinked=m=>S.crmReady&&P.linked(m,own(),S.crm.interactions).length>0;
function drawList(){const ul=$('pm-items');ul.replaceChildren();const only=$('pm-only').checked;
 const shown=S.items.filter(m=>!only||matched(m).length);
 for(const m of shown){const li=E('li'),b=E('button',undefined,'pm-item');b.type='button';if(S.open&&S.open.id===m.id)b.classList.add('on');if(m.unread)b.classList.add('unread');
  const sent=P.direction(m,own())==='sent',people=sent?(m.to||[]).map(p=>p.name||p.address).join(', '):(m.from?.name||m.from?.address||'');
  const top=E('span',undefined,'pm-item-top');top.append(E('b',(sent?'A: ':'')+(people||'(sconosciuto)')),E('time',when(m.at)));
  b.append(avatar(sent?(m.to||[])[0]:m.from),top,E('span',m.subject||'(senza oggetto)','pm-item-subject'),E('span',String(m.preview||'').replace(/\s+/g,' ').trim(),'pm-item-preview'));
  const tags=E('span',undefined,'pm-tags'),cs=matched(m);for(const c of cs.slice(0,2))tags.append(E('span',c.name||c.email,'pm-tag'));if(cs.length>2)tags.append(E('span','+'+(cs.length-2),'pm-tag'));
  if(isLinked(m))tags.append(E('span','✓ Collegata','pm-tag ok'));else if(S.crmReady&&P.campaignReply(m,own(),S.crm.contacts,S.crm.interactions))tags.append(E('span','↩ Risposta a una campagna','pm-tag reply'));if(m.attachments)tags.append(E('span','📎','pm-tag clip'));if(tags.children.length)b.append(tags);
  b.onclick=()=>openMessage(m);li.append(b);ul.append(li)}
 if(!shown.length&&S.items.length)ul.append(E('li','Nessuna di queste mail riguarda contatti del CRM.','pm-none'));
 $('pm-more').hidden=!S.more;drawReplies();drawOppsButton()}
/* «Registra le risposte alle campagne»: the received mails of this page from contacts the queue wrote to, not yet
   recorded, saved as email interactions in one go (one confirmation). A recorded reply stops the follow-ups of the
   contact and the worker skips it (api/_sales_optout.js LAST_REPLY). */
function drawReplies(){let b=$('pm-replies');if(!b){b=E('button',undefined,'pm-replies');b.id='pm-replies';b.type='button';$('pm-reload').after(b)}
 const list=S.crmReady?P.campaignReplies(S.items,own(),S.crm.contacts,S.crm.interactions):[];
 b.hidden=!list.length;if(!list.length)return;
 b.textContent='Registra '+list.length+(list.length===1?' risposta a una campagna':' risposte alle campagne');
 b.onclick=async()=>{if(S.busy)return;
  if(!window.confirm('Registrare nel CRM '+list.length+(list.length===1?' risposta':' risposte')+' di contatti a cui la coda ha scritto?\n'+list.slice(0,8).map(r=>'· '+(r.contact.name||r.contact.email)+' · «'+(r.msg.subject||'(senza oggetto)')+'»').join('\n')+(list.length>8?'\n· …':'')+'\nOgni mail entra nella cronologia del contatto come email ricevuta; i follow-up automatici a quel contatto si fermano. Nulla viene inviato.'))return;
  S.busy=true;b.disabled=true;let ok=0;const failed=[];
  try{for(const r of list){status('Registro la risposta di '+(r.contact.name||r.contact.email)+'… ('+(ok+failed.length+1)+' di '+list.length+')');
   try{const d=await get({entity:'mail',workspace:S.workspace,mailbox:S.mailbox,id:r.msg.id});const full={...r.msg,...d.rows[0],full:true};
    const p=P.interaction(full,own(),{contact:r.contact});if(p.error)throw new Error(p.error);
    const row=await post('interactions',p.data);S.crm.interactions.push(row);ok++}
   catch(e){failed.push((r.contact.name||r.contact.email)+': '+e.message)}}}
  finally{S.busy=false;b.disabled=false}
  drawList();drawRead();status(ok+(ok===1?' risposta registrata':' risposte registrate')+(failed.length?' · non registrate: '+failed.join(' · '):'')+'.',failed.length>0)}}

/* «Opportunità suggerite»: mails of this page that speak of proposals, quotes or amounts (crm-posta-core.js opportunityHints),
   one card each in the reading pane; «Crea opportunità» creates the contact when missing, the opportunity in the first stage
   of the chosen pipeline, and links the mail to it, after one confirmation. */
const hints=()=>S.crmReady?P.opportunityHints(S.items,own(),S.crm.contacts,S.crm.companies,S.crm.opportunities,S.crm.interactions).filter(h=>!S.created.has(h.msg.id)):[];
function drawOppsButton(){let b=$('pm-opps');if(!b){b=E('button',undefined,'pm-opps');b.id='pm-opps';b.type='button';($('pm-replies')||$('pm-reload')).after(b)}
 const list=hints();b.hidden=!list.length;if(!list.length){if(S.opps){S.opps=false;drawRead()}return}
 b.textContent='Opportunità suggerite ('+list.length+')';b.setAttribute('aria-pressed',String(S.opps));b.onclick=()=>{S.opps=!S.opps;if(S.opps)S.open=null;drawList();drawRead()}}
function oppsPane(host){const list=hints();host.append(E('h2','Opportunità suggerite dalla posta'),E('p','Mail di questa pagina che parlano di proposte, preventivi, offerte o importi, con una persona che nel CRM non ha ancora una trattativa aperta. Nulla viene creato senza la tua conferma; nessuna chiamata AI.','pm-muted'));
 const pipes=P.pipelines(S.crm.processes,S.crm.stages);
 if(!pipes.length)host.append(E('p','Nel CRM non c’è ancora una pipeline delle opportunità: creala da Pipeline › «Personalizza pipeline», poi torna qui.','pm-err'));
 const pSel=E('select');pSel.setAttribute('aria-label','Pipeline');for(const p of pipes){const o=E('option',p.title+' › '+p.stage);o.value=p.process_id;pSel.append(o)}
 if(pipes.length>1){const l=E('label','Pipeline ');l.append(pSel);host.append(l)}
 for(const h of list){const card=E('article',undefined,'pm-opp');
  const who=h.contact?h.contact.name+(h.company?' · '+h.company.name:''):(h.participant.name||h.participant.address)+(h.company?' · '+h.company.name:'')+' (nuovo contatto)';
  card.append(E('strong',who),E('span',(h.direction==='sent'?'Inviata · ':'Ricevuta · ')+longWhen(h.msg.at),'pm-muted'),E('span',h.msg.subject||'(senza oggetto)','pm-item-subject'),E('span',h.msg.preview||'','pm-item-preview'));
  const tags=E('span',undefined,'pm-tags');if(h.keyword)tags.append(E('span','«'+h.keyword+'»','pm-tag'));if(h.amount!==null)tags.append(E('span',new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(h.amount/100),'pm-tag ok'));card.append(tags);
  const t=E('input');t.value=h.title;t.maxLength=200;t.setAttribute('aria-label','Nome dell’opportunità');const lt=E('label','Nome dell’opportunità');lt.append(t);card.append(lt);
  const acts=E('div',undefined,'pm-link-actions'),go=E('button','Crea opportunità','pm-btn primary'),openB=E('button','Apri la mail','pm-btn');go.type='button';openB.type='button';go.disabled=!pipes.length;
  openB.onclick=()=>{S.opps=false;openMessage(h.msg)};
  go.onclick=async()=>{if(S.busy)return;const pipe=pipes.find(p=>p.process_id===(pSel.value||pipes[0].process_id))||pipes[0];const plan=P.opportunityPlan({...h,title:t.value.trim()||h.title},pipe);if(plan.error){status(plan.error,true);return}
   if(!window.confirm('Creare l’opportunità «'+plan.opportunity.title+'» in «'+pipe.title+' › '+pipe.stage+'»'+(plan.opportunity.amount_cents?' da '+new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(plan.opportunity.amount_cents/100):'')+'?\n'+(plan.contact.create?'Prima viene creato il contatto «'+plan.contact.create.name+'» ('+plan.contact.create.email+').\n':'')+'La mail viene collegata all’opportunità come email '+(h.direction==='sent'?'inviata':'ricevuta')+'. Nulla viene inviato.'))return;
   S.busy=true;go.disabled=true;
   try{let contact=h.contact;if(plan.contact.create){status('Creo il contatto…');contact=await post('contacts',plan.contact.create);S.crm.contacts.push(contact)}
    status('Creo l’opportunità…');const opp=await post('opportunities',{...plan.opportunity,contact_id:contact.id,...(contact.company_id?{company_id:contact.company_id}:{})});S.crm.opportunities.push(opp);
    status('Collego la mail…');const d=await get({entity:'mail',workspace:S.workspace,mailbox:S.mailbox,id:h.msg.id});const full={...h.msg,...d.rows[0],full:true};
    const p=P.interaction(full,own(),{contact,opportunity:opp});if(!p.error){const row=await post('interactions',p.data);S.crm.interactions.push(row)}
    S.created.add(h.msg.id);status('Opportunità «'+opp.title+'» creata'+(plan.contact.create?' con il contatto «'+contact.name+'»':'')+(p.error?' (mail non collegata: '+p.error+')':' e mail collegata')+'.');drawList();drawRead()}
   catch(e){status('Non creata: '+e.message,true);go.disabled=false}finally{S.busy=false}};
  acts.append(go,openB);card.append(acts);host.append(card)}
 if(!list.length)host.append(E('p','Nessun suggerimento in questa pagina di mail.','pm-empty'))}

/* ---------- Reading pane ---------- */
async function openMessage(m){S.opps=false;S.open={...m};drawList();drawRead();const gen=S.gen,id=m.id;
 try{const d=await get({entity:'mail',workspace:S.workspace,mailbox:S.mailbox,id});if(gen!==S.gen||S.open?.id!==id)return;S.open={...m,...d.rows[0],full:true};drawRead()}
 catch(e){if(S.open?.id===id){S.open.error=e.message;drawRead()}}}
function drawRead(){const host=$('pm-read'),m=S.open;host.replaceChildren();
 if(!m&&S.opps){oppsPane(host);return}
 if(!m){const e=E('div',undefined,'pm-empty');e.append(E('span',undefined,'pm-empty-ic'),E('p','Scegli una mail a sinistra per leggerla e collegarla al CRM.'));const k=E('p',undefined,'pm-keys');k.append(E('kbd','↑'),' ',E('kbd','↓'),' per muoverti tra le mail');e.append(k);host.append(e);return}
 const back=E('button','‹ Torna all’elenco','pm-back');back.type='button';back.onclick=()=>{S.open=null;drawList();drawRead()};
 // Header: subject, the sender card (avatar, name, address, «a …» that opens the full headers), date, actions.
 const head=E('header',undefined,'pm-head');head.append(back,E('h2',m.subject||'(senza oggetto)'));
 const who=p=>p?(p.name?p.name+' <'+p.address+'>':p.address):'';
 const sent=P.direction(m,own())==='sent',main=sent?(m.to||[])[0]:m.from;
 const card=E('div',undefined,'pm-sender');const w=E('div',undefined,'pm-sender-who');
 w.append(E('b',main?.name||main?.address||'(sconosciuto)'),E('span',main?.name&&main?.address?main.address:''));
 const toLine=E('button',(sent?'da me a ':'a ')+((m.to||[]).map(p=>p.name||p.address).slice(0,3).join(', ')||'me')+((m.to||[]).length>3?' +'+((m.to||[]).length-3):'')+((m.cc||[]).length?' · cc '+(m.cc||[]).length:'')+' ▾','pm-to');toLine.type='button';toLine.setAttribute('aria-expanded','false');
 const meta=E('dl','', 'pm-meta');const row=(k,v)=>{if(v){meta.append(E('dt',k),E('dd',v))}};
 row('Da',who(m.from));row('A',(m.to||[]).map(who).join(', '));row('Cc',(m.cc||[]).map(who).join(', '));row('Data',longWhen(m.at));
 toLine.onclick=()=>{const o=!meta.classList.contains('open');meta.classList.toggle('open',o);toLine.setAttribute('aria-expanded',String(o))};
 w.append(toLine);card.append(avatar(main),w,E('time',longWhen(m.at)));head.append(card,meta);
 // CRM context: the contacts of this mail that are in the CRM, each a link to its card.
 const known=S.crmReady?P.matches(m,S.crm.contacts,own()):[];
 if(known.length){const ctx=E('div',undefined,'pm-ctx');for(const c of known.slice(0,4)){const a=E('a',undefined);a.href='/radix-sales.html?ws='+encodeURIComponent(S.workspace)+'&contatto='+encodeURIComponent(c.id)+'#contacts';a.append(E('i'),document.createTextNode((c.name||c.email)+(S.crm.companies.find(x=>x.id===c.company_id)?.name?' · '+S.crm.companies.find(x=>x.id===c.company_id).name:'')));a.title='Apri la scheda nel CRM';ctx.append(a)}head.append(ctx)}
 if(known.length&&P.nextMove)head.append(moveCard(m,known[0]));
 const acts=E('div',undefined,'pm-actions');
 const linkBtn=E('button',P.linked(m,own(),S.crm.interactions).length?'✓ Collegata al CRM':'Collega al CRM','pm-btn primary');linkBtn.type='button';linkBtn.onclick=()=>{const b=host.querySelector('.pm-link');if(b){b.scrollIntoView({block:'start',behavior:'smooth'});const s=b.querySelector('select');if(s)s.focus({preventScroll:true})}};acts.append(linkBtn);
 if(m.link){const a=E('a','Apri in Outlook ↗','pm-btn pm-outlook');a.href=m.link;a.target='_blank';a.rel='noopener noreferrer';acts.append(a)}
 head.append(acts);host.append(head);
 const content=E('div',undefined,'pm-content');content.append(linkBox(m));
 const body=E('div',undefined,'pm-body');
 if(m.error)body.append(E('p',m.error,'pm-err'));else if(!m.full)body.append(E('p','Caricamento del testo…','pm-muted'));
 else{let quoting=false;for(const para of String(m.text||'').split(/\n{2,}/)){if(!quoting&&/^(?:-{3,}\s*(?:messaggio originale|original message)|(?:da|from|il giorno|on)\s.{0,120}(?:ha scritto|wrote)\s*:?$|>)/i.test(para.trim().split('\n')[0]))quoting=true;body.append(E('p',para,quoting?'pm-quote':undefined))}}
 content.append(body);host.append(content);
 // Keyboard users moving with ↑ ↓ keep the focus on the list row; otherwise the pane takes it (screen readers, phones).
 if(!document.activeElement||!document.activeElement.closest('#pm-items'))host.focus({preventScroll:true})}

/* «Prossima mossa»: what to send to this contact now, from fixed rules on the CRM state (crm-posta-core nextMove).
   The draft opens on click with «Copia» and «Segna come inviata» (records the email interaction); nothing is sent from here. */
function moveCard(m,contact){
 const mv=P.nextMove(contact,{...S.crm,interactions:S.crm.all||S.crm.interactions},{now:Date.now(),mail:m,direction:P.direction(m,own()),me:S.meName||''});
 const box=E('section',undefined,'pm-move pm-move-'+mv.kind);const h=E('h3');h.append(E('span','Prossima mossa','pm-move-eyebrow'),E('b',mv.title));
 box.append(h,E('p',mv.why,'pm-move-why'));
 if(!mv.draft)return box;
 const open=E('button','Apri la bozza','pm-btn');open.type='button';const pane=E('div',undefined,'pm-move-draft');pane.hidden=true;
 const subj=E('input');subj.value=mv.draft.subject;subj.maxLength=200;subj.setAttribute('aria-label','Oggetto');const body=E('textarea');body.rows=7;body.value=mv.draft.body;body.setAttribute('aria-label','Testo');
 const note=E('p','Bozza da regole fisse, non dall’AI: adattala e inviala dal tuo programma di posta. RADIX non invia nulla da qui.','pm-muted');
 // «Riscrivi con l’AI»: one AI call, only after a click and a confirmation that names the cost; the draft fields are replaced, nothing is sent.
 const ai=E('button','✨ Riscrivi con l’AI','pm-btn');ai.type='button';ai.title='Una chiamata AI, dopo conferma';
 ai.onclick=async()=>{if(S.busy||!P.aiPrompt)return;if(!window.confirm('Chiedere all’AI di riscrivere questa bozza per '+(contact.name||contact.email)+'?\nUna chiamata AI, consuma crediti API. Usa solo i dati del CRM e la mail: niente fatti inventati. Nulla viene inviato.'))return;
  S.busy=true;ai.disabled=true;const was=ai.textContent;ai.textContent='L’AI sta scrivendo…';
  try{const current={...mv,draft:{subject:subj.value,body:body.value}};const prompt=P.aiPrompt(current,contact,S.crm,{mail:m,me:S.meName||''});
   const r=await fetch('/api/chat',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({role:'crm-copilot',crmScope:{workspace:S.workspace},messages:[{role:'user',content:prompt}]})});
   const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'AI non disponibile ('+r.status+').');
   const got=P.aiParse(d.reply,{source:prompt});if(!got)throw new Error('Risposta dell’AI non leggibile: riprova.');if(got.error)throw new Error(got.error);
   subj.value=got.subject;body.value=got.body;note.textContent='Testo riscritto dall’AI dai dati del CRM: rileggilo, poi copialo nel tuo programma di posta. RADIX non invia nulla da qui.';status('Bozza riscritta dall’AI.')}
  catch(e){status('Bozza non cambiata: '+e.message,true)}finally{S.busy=false;ai.disabled=false;ai.textContent=was}};
 const copy=E('button','Copia','pm-btn');copy.type='button';copy.onclick=async()=>{try{await navigator.clipboard.writeText('Oggetto: '+subj.value+'\n\n'+body.value);copy.textContent='Copiata ✓';setTimeout(()=>{copy.textContent='Copia'},1500)}catch{copy.textContent='Copia non riuscita'}};
 const mark=E('button','Segna come inviata','pm-btn');mark.type='button';
 mark.onclick=async()=>{if(S.busy)return;if(!window.confirm('Registrare l’email «'+subj.value+'» come inviata da te a '+(contact.name||contact.email)+' (fuori da RADIX)?\nEntra nella cronologia del contatto come email inviata.'))return;
  S.busy=true;mark.disabled=true;
  try{const row=await post('interactions',{kind:'email',title:'Email: '+subj.value.slice(0,180),body:body.value.slice(0,4000),contact_id:contact.id,company_id:contact.company_id||null,occurred_at:new Date().toISOString().slice(0,19)+'Z'});S.crm.interactions.push(row);status('Email registrata nella cronologia di '+(contact.name||contact.email)+'.');drawRead()}
  catch(e){status('Non registrata: '+e.message,true);mark.disabled=false}finally{S.busy=false}};
 const acts=E('div',undefined,'pm-move-acts');acts.append(ai,copy,mark);
 pane.append(E('label','Oggetto'),subj,E('label','Testo'),body,note,acts);
 open.onclick=()=>{pane.hidden=!pane.hidden;open.textContent=pane.hidden?'Apri la bozza':'Chiudi la bozza'};
 box.append(open,pane);return box}

/* «Collega al CRM»: contact (suggested from the addresses), opportunity (that contact's open ones), «Collega». */
function linkBox(m){const box=E('section',undefined,'pm-link');box.append(E('h3','Collega al CRM'));
 if(!S.crmReady){box.append(E('p','Caricamento dei contatti del CRM…','pm-muted'));return box}
 const done=P.linked(m,own(),S.crm.interactions);
 if(done.length){const names=done.map(i=>S.crm.contacts.find(c=>c.id===i.contact_id)?.name||S.crm.opportunities.find(o=>o.id===i.opportunity_id)?.title||'CRM');
  box.classList.add('done');box.append(E('p','✓ Già collegata a '+[...new Set(names)].join(', ')+'. La trovi nella cronologia del contatto.','pm-ok'))}
 const sug=P.matches(m,S.crm.contacts,own());
 const cSel=E('select'),oSel=E('select');cSel.setAttribute('aria-label','Contatto');oSel.setAttribute('aria-label','Opportunità');
 const opt=(sel,v,t)=>{const o=E('option',t);o.value=v;sel.append(o)};
 opt(cSel,'','Scegli un contatto…');for(const c of sug)opt(cSel,c.id,(c.name||c.email)+' · '+c.email+' (dalla mail)');
 const rest=S.crm.contacts.filter(c=>!sug.includes(c)).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'it'));for(const c of rest.slice(0,2000))opt(cSel,c.id,(c.name||c.email||'Contatto')+(c.email?' · '+c.email:''));
 if(sug[0])cSel.value=sug[0].id;
 const fillOpps=()=>{oSel.replaceChildren();opt(oSel,'','Nessuna opportunità');const c=S.crm.contacts.find(x=>x.id===cSel.value);for(const o of P.opportunitiesFor(c,S.crm.opportunities))opt(oSel,o.id,o.title||'Opportunità')};
 cSel.onchange=fillOpps;fillOpps();
 const msg=E('p','','pm-link-msg'),go=E('button','Collega al CRM','pm-btn primary');go.type='button';
 go.onclick=async()=>{if(S.busy)return;const contact=S.crm.contacts.find(c=>c.id===cSel.value)||null,opportunity=S.crm.opportunities.find(o=>o.id===oSel.value)||null;
  if(!m.full){msg.textContent='Aspetta che il testo della mail sia caricato.';return}
  const p=P.interaction(m,own(),{contact,opportunity});if(p.error){msg.textContent=p.error;return}
  S.busy=true;go.disabled=true;msg.textContent='Salvataggio…';
  try{const row=await post('interactions',p.data);S.crm.interactions.push(row);msg.textContent='';drawList();drawRead();status('Mail collegata a '+(contact?.name||opportunity?.title||'CRM')+'.')}
  catch(e){msg.textContent='Non collegata: '+e.message}finally{S.busy=false;go.disabled=false}};
 const grid=E('div',undefined,'pm-link-grid');const l1=E('label','Contatto'),l2=E('label','Opportunità (facoltativa)');l1.append(cSel);l2.append(oSel);grid.append(l1,l2);
 box.append(grid);
 // A sender not yet in the CRM: one click makes the contact (name and email from the mail), then it is chosen.
 const unknown=P.participants(m,own()).filter(p=>!S.crm.contacts.some(c=>String(c.email||'').toLowerCase()===p.address));
 if(unknown.length){const add=E('div',undefined,'pm-new');add.append(E('span','Non nel CRM: '));
  for(const p of unknown.slice(0,4)){const b=E('button','+ '+(p.name||p.address),'pm-chip');b.type='button';b.title='Crea il contatto '+p.address;
   b.onclick=async()=>{const data=P.contactFrom(p);if(!data||S.busy)return;const co=P.companyByDomain(p.address,S.crm.contacts);if(co)data.company_id=co;S.busy=true;b.disabled=true;
    try{const row=await post('contacts',data);S.crm.contacts.push(row);drawList();drawRead();status('Contatto «'+row.name+'» creato'+(co?' in «'+(S.crm.companies.find(c=>c.id===co)?.name||'azienda')+'»':'')+': ora puoi collegare la mail.')}
    catch(e){msg.textContent='Contatto non creato: '+e.message;b.disabled=false}finally{S.busy=false}};add.append(b)}
  box.append(add)}
 box.append(E('div',undefined,'pm-link-actions'));box.lastChild.append(go);box.append(msg);
 return box}

/* ---------- Wiring ---------- */
$('pm-workspace').onchange=()=>{S.workspace=$('pm-workspace').value;wsMemo.set(S.workspace);workspace()};
$('pm-mailbox').onchange=()=>{S.mailbox=$('pm-mailbox').value;folder()};
for(const b of document.querySelectorAll('[data-folder]'))b.onclick=()=>{S.folder=b.dataset.folder;for(const x of document.querySelectorAll('[data-folder]'))x.setAttribute('aria-selected',String(x===b));folder()};
$('pm-search').addEventListener('submit',e=>{e.preventDefault();S.search=$('pm-q').value.trim().slice(0,100);folder()});
$('pm-q').addEventListener('search',()=>{if(!$('pm-q').value&&S.search){S.search='';folder()}});
$('pm-only').onchange=drawList;$('pm-reload').onclick=()=>folder();
/* Keyboard: ↑ ↓ (or k j) open the previous / next mail of the list, Home / End the first / last; works from the list and from the open mail. */
const listButtons=()=>[...$('pm-items').querySelectorAll('button.pm-item')];
function step(key){const btns=listButtons();if(!btns.length)return false;
 let i=btns.findIndex(b=>b.classList.contains('on'));if(i<0)i=btns.indexOf(document.activeElement);
 const n=key==='Home'?0:key==='End'?btns.length-1:key==='ArrowUp'||key==='k'?Math.max(0,i-1):Math.min(btns.length-1,i+1);
 if(n===i&&btns[n].classList.contains('on'))return true;
 const shown=S.items.filter(m=>!$('pm-only').checked||matched(m).length),m=shown[n];if(!m)return false;
 openMessage(m);const b=listButtons()[n];if(b){b.focus({preventScroll:true});b.scrollIntoView({block:'nearest'})}return true}
function onKeys(e){if(e.altKey||e.ctrlKey||e.metaKey)return;const t=e.target,tag=t&&t.tagName;
 if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||(t&&t.isContentEditable))return;
 if(['ArrowDown','ArrowUp','Home','End','j','k'].includes(e.key)&&step(e.key))e.preventDefault()}
$('pm-items').addEventListener('keydown',onKeys);$('pm-read').addEventListener('keydown',onKeys);
$('pm-more').onclick=()=>{S.skip+=25;folder(true)};
init();
})();
