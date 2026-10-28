'use strict';
/* CRM «Posta» (sales-posta.html): the Microsoft 365 mailbox connected by this user (Impostazioni › Caselle), read through
   /api/sales?entity=mail (api/_sales_mail_read.js), next to the CRM. Each mail shows the CRM contacts it involves;
   «Collega al CRM» saves it as an email interaction of a contact and, if chosen, an opportunity (crm-posta-core.js).
   Nothing is sent from here and nothing is read until the page asks for one folder of one mailbox. */
(function(){
const P=window.RadixCrmPosta,$=id=>document.getElementById(id);
const E=(tag,txt,cls)=>{const n=document.createElement(tag);if(txt!==undefined)n.textContent=String(txt);if(cls)n.className=cls;return n};
const S={workspace:'',workspaces:[],mailbox:'',mailboxes:[],folder:'inbox',search:'',skip:0,items:[],more:false,open:null,crm:{contacts:[],companies:[],opportunities:[],interactions:[]},crmReady:false,gen:0,busy:false};
const wsMemo={get(){try{return localStorage.getItem('radix.workspace')||''}catch{return ''}},set(v){try{if(v)localStorage.setItem('radix.workspace',v)}catch{}}};
const status=(m,err)=>{const p=$('pm-status');p.textContent=m||'';p.classList.toggle('err',!!err)};
class ApiError extends Error{constructor(m,s,code){super(m);this.status=s;this.code=code}}
async function get(params){const q=new URLSearchParams(params);const r=await fetch('/api/sales?'+q,{credentials:'same-origin',cache:'no-store'});const d=await r.json().catch(()=>({}));
 if(!r.ok)throw new ApiError(r.status===401?'Sessione non autenticata: accedi a RADIX sullo stesso dominio.':typeof d.error==='string'?d.error:'Richiesta non riuscita ('+r.status+').',r.status,d.code);return d}
async function post(entity,data){const r=await fetch('/api/sales',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json','x-radix-sales':'1'},body:JSON.stringify({workspace:S.workspace,entity,action:'create',data})});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw new ApiError(typeof d.error==='string'?d.error:'Salvataggio non riuscito ('+r.status+').',r.status);const row=d.rows?.[0];if(!row?.id)throw new ApiError('Il server non ha restituito il record: premi Aggiorna e verifica.');return row}
async function pages(entity,gen){const all=[];for(let n=0;n<10;n++){const d=await get({entity,workspace:S.workspace,offset:String(all.length)});if(gen!==S.gen)return null;all.push(...d.rows);if(d.rows.length<100)break}return all}
const own=()=>S.mailboxes.find(m=>m.id===S.mailbox)?.from_email||'';
const when=t=>{const D=window.RadixCrmDates,ms=Date.parse(t);if(Number.isNaN(ms))return '';if(!D)return new Date(ms).toLocaleString('it-IT');const v=D.inputAt(ms);const today=D.inputAt(Date.now()).slice(0,10);return v.slice(0,10)===today?D.hm(ms):v.slice(8,10)+'/'+v.slice(5,7)+(v.slice(0,4)===today.slice(0,4)?'':'/'+v.slice(2,4))};
const longWhen=t=>{const D=window.RadixCrmDates,ms=Date.parse(t);return Number.isNaN(ms)?'':D?D.dateTimeLabel(ms):new Date(ms).toLocaleString('it-IT')};

async function init(){
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
async function crm(gen){try{const [contacts,companies,opportunities,interactions]=await Promise.all(['contacts','companies','opportunities','interactions'].map(e=>pages(e,gen)));
 if(gen!==S.gen||!contacts)return;S.crm={contacts,companies,opportunities,interactions:interactions.filter(i=>i.kind==='email')};S.crmReady=true;drawList();drawRead()}
 catch(e){if(gen===S.gen)status('CRM non caricato: '+e.message+' Puoi leggere la posta, ma non collegarla.',true)}}
async function folder(append){if(!S.mailbox)return;const gen=S.gen;if(!append){S.skip=0;S.items=[];S.open=null;drawRead()}
 status(S.search?'Ricerca in corso…':'Lettura della casella…');$('pm-more').hidden=true;
 try{const d=await get({entity:'mail',workspace:S.workspace,mailbox:S.mailbox,folder:S.folder,skip:String(S.skip),...(S.search?{search:S.search}:{})});if(gen!==S.gen)return;
  S.items=append?[...S.items,...d.rows.filter(r=>!S.items.some(x=>x.id===r.id))]:d.rows;S.more=!S.search&&d.rows.length===25&&S.skip<975;
  status(S.items.length?(S.search?S.items.length+' risultati per «'+S.search+'».':'Ultime '+S.items.length+' mail · '+(S.folder==='sent'?'Inviata':'In arrivo')+'.'):'Nessuna mail qui.');drawList()}
 catch(e){if(gen!==S.gen)return;S.items=[];drawList();status(e.message,true);if(e.code==='needs_reconnect')reconnectHint()}}
function reconnectHint(){const host=$('pm-read');host.replaceChildren(E('h2','Serve un nuovo collegamento della casella','pm-force'),
 E('p','La casella è stata collegata prima che RADIX chiedesse il permesso di leggere la posta. Vai in Impostazioni › Caselle email e premi di nuovo «Collega con Microsoft 365» con lo stesso account: Microsoft chiederà di consentire la lettura. L’invio continua a funzionare anche prima.'),
 Object.assign(E('a','Apri Impostazioni › Caselle email ↗','pm-btn'),{href:'/impostazioni.html'}))}

/* ---------- List ---------- */
const matched=m=>S.crmReady?P.matches(m,S.crm.contacts,own()):[];
const isLinked=m=>S.crmReady&&P.linked(m,own(),S.crm.interactions).length>0;
function drawList(){const ul=$('pm-items');ul.replaceChildren();const only=$('pm-only').checked;
 const shown=S.items.filter(m=>!only||matched(m).length);
 for(const m of shown){const li=E('li'),b=E('button',undefined,'pm-item');b.type='button';if(S.open&&S.open.id===m.id)b.classList.add('on');
  const sent=P.direction(m,own())==='sent',people=sent?(m.to||[]).map(p=>p.name||p.address).join(', '):(m.from?.name||m.from?.address||'');
  const top=E('span',undefined,'pm-item-top');top.append(E('b',(sent?'A: ':'')+(people||'(sconosciuto)')),E('time',when(m.at)));
  b.append(top,E('span',m.subject||'(senza oggetto)','pm-item-subject'),E('span',m.preview||'','pm-item-preview'));
  const tags=E('span',undefined,'pm-tags'),cs=matched(m);for(const c of cs.slice(0,2))tags.append(E('span',c.name||c.email,'pm-tag'));if(cs.length>2)tags.append(E('span','+'+(cs.length-2),'pm-tag'));
  if(isLinked(m))tags.append(E('span','✓ Collegata','pm-tag ok'));if(m.attachments)tags.append(E('span','📎','pm-tag clip'));if(tags.children.length)b.append(tags);
  b.onclick=()=>openMessage(m);li.append(b);ul.append(li)}
 if(!shown.length&&S.items.length)ul.append(E('li','Nessuna di queste mail riguarda contatti del CRM.','pm-none'));
 $('pm-more').hidden=!S.more}

/* ---------- Reading pane ---------- */
async function openMessage(m){S.open={...m};drawList();drawRead();const gen=S.gen,id=m.id;
 try{const d=await get({entity:'mail',workspace:S.workspace,mailbox:S.mailbox,id});if(gen!==S.gen||S.open?.id!==id)return;S.open={...m,...d.rows[0],full:true};drawRead()}
 catch(e){if(S.open?.id===id){S.open.error=e.message;drawRead()}}}
function drawRead(){const host=$('pm-read'),m=S.open;host.replaceChildren();
 if(!m){host.append(E('p','Scegli una mail a sinistra per leggerla e collegarla al CRM.','pm-empty'));return}
 const back=E('button','‹ Torna all’elenco','pm-back');back.type='button';back.onclick=()=>{S.open=null;drawList();drawRead()};
 host.append(back,E('h2',m.subject||'(senza oggetto)'));
 const meta=E('dl','', 'pm-meta');const row=(k,v)=>{if(v){meta.append(E('dt',k),E('dd',v))}};
 const who=p=>p?(p.name?p.name+' <'+p.address+'>':p.address):'';
 row('Da',who(m.from));row('A',(m.to||[]).map(who).join(', '));row('Cc',(m.cc||[]).map(who).join(', '));row('Data',longWhen(m.at));host.append(meta);
 if(m.link){const a=E('a','Apri in Outlook ↗','pm-outlook');a.href=m.link;a.target='_blank';a.rel='noopener noreferrer';host.append(a)}
 host.append(linkBox(m));
 const body=E('div',undefined,'pm-body');
 if(m.error)body.append(E('p',m.error,'pm-err'));else if(!m.full)body.append(E('p','Caricamento del testo…','pm-muted'));
 else for(const para of String(m.text||'').split(/\n{2,}/))body.append(E('p',para));
 host.append(body);host.focus({preventScroll:true})}

/* «Collega al CRM»: contact (suggested from the addresses), opportunity (that contact's open ones), «Collega». */
function linkBox(m){const box=E('section',undefined,'pm-link');box.append(E('h3','Collega al CRM'));
 if(!S.crmReady){box.append(E('p','Caricamento dei contatti del CRM…','pm-muted'));return box}
 const done=P.linked(m,own(),S.crm.interactions);
 if(done.length){const names=done.map(i=>S.crm.contacts.find(c=>c.id===i.contact_id)?.name||S.crm.opportunities.find(o=>o.id===i.opportunity_id)?.title||'CRM');
  box.append(E('p','✓ Già collegata a '+[...new Set(names)].join(', ')+'. La trovi nella cronologia del contatto.','pm-ok'))}
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
$('pm-more').onclick=()=>{S.skip+=25;folder(true)};
init();
})();
