'use strict';
/* «Messaggio LinkedIn» on a contact with a LinkedIn profile (contact cards and Customer360 through
   RadixCrmTools.card, the contact sheet of contacts-view.js, the «Oggi» tasks). A small panel:
   purpose + notes → «Prepara bozza con l’AI» (one /api/chat request after a confirmation, the same
   Copilota path as crm-follow-up.js: crmScope, the server adds the workspace snapshot) or «Usa un
   modello» (no AI). The text is editable with a live counter; «Copia e apri LinkedIn» copies it and
   opens the profile in a new tab; «Segna come inviato» records one «nota» interaction after a
   confirmation. RADIX never sends anything on LinkedIn. Rules in crm-linkedin-message-core.js. */
(function(root){
const core=root.RadixCrmLinkedInCore;if(!core||!root.document)return;
const doc=root.document;
const E=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n};
const B=(text,fn,cls)=>{const b=E('button',text,cls);b.type='button';b.addEventListener('click',fn);return b};
const app=()=>root.RadixSalesApp;
// Drafts live here, not in the DOM: sales.js rebuilds the cards on every render, and a draft costs an AI call.
const drafts=new Map();
let ui=null;

async function related(contact){
 const a=app(),out={companies:[...a.rows('companies')],interactions:[...a.rows('interactions')]};
 // A failed read only means fewer facts: the draft still has the contact itself.
 let d={};try{d=await a.api('customer360',{subject:'contacts',id:contact.id})}catch{}
 for(const x of d.rows||[])if(out[x.entity]&&x.record&&!out[x.entity].some(r=>r.id===x.record.id))out[x.entity].push(x.record);
 return out;
}
async function copy(text,area){
 try{if(!root.navigator?.clipboard?.writeText)throw new Error('no clipboard');await root.navigator.clipboard.writeText(text);return true}
 catch{try{area.focus();area.select();if(doc.execCommand&&doc.execCommand('copy'))return true}catch{}return false}
}
function openTab(url){const l=E('a');l.href=url;l.target='_blank';l.rel='noopener noreferrer';l.hidden=true;doc.body.append(l);l.click();l.remove()}

function build(){
 const d=E('dialog',undefined,'li-sheet');d.id='linkedin-message';d.setAttribute('aria-labelledby','li-title');
 const f=E('form');f.method='dialog';f.noValidate=true;
 const head=E('div',undefined,'li-head');const h=E('h2','Messaggio LinkedIn');h.id='li-title';
 const x=B('Chiudi',()=>{if(!app()?.state.busy)d.close()},'li-close');x.setAttribute('aria-label','Chiudi');head.append(h,x);
 const who=E('p',undefined,'li-who');
 const fs=E('fieldset',undefined,'li-purpose');fs.append(E('legend','Scopo del messaggio'));
 const radios={};
 for(const [k,p] of Object.entries(core.PURPOSES)){const l=E('label');const r=E('input');r.type='radio';r.name='li-purpose';r.value=k;radios[k]=r;
  const t=E('span');t.append(E('b',p.label),E('small',k==='primo'?'nota di collegamento · max '+p.limit+' caratteri':'max '+p.limit+' caratteri'));l.append(r,t);fs.append(l)}
 const nl=E('label','Note per la bozza (facoltative)','li-notes');const notes=E('textarea');notes.rows=2;notes.maxLength=600;nl.append(notes);
 const gen=E('div',undefined,'actions li-gen');
 const ai=B('Prepara bozza con l’AI',()=>draftAi(),'primary');const tpl=B('Usa un modello',()=>useTemplate(''));gen.append(ai,tpl);
 const draft=E('div',undefined,'li-draft');draft.hidden=true;
 const dh=E('div',undefined,'li-draft-head');const ml=E('label','Messaggio');ml.htmlFor='li-text';const tag=E('span','', 'li-tag');dh.append(ml,tag);
 const area=E('textarea');area.id='li-text';area.rows=7;area.maxLength=3800;
 const cnt=E('p','','li-count');cnt.setAttribute('aria-live','polite');cnt.id='li-count';area.setAttribute('aria-describedby','li-count');
 const acts=E('div',undefined,'actions li-acts');
 const go=B('Copia e apri LinkedIn',()=>copyOpen(),'primary');const sent=B('Segna come inviato',()=>markSent());acts.append(go,sent);
 const link=E('a','Apri il profilo LinkedIn','li-link');link.target='_blank';link.rel='noopener noreferrer';
 draft.append(dh,area,cnt,acts,link);
 const status=E('p','','li-status');status.setAttribute('role','status');
 const err=E('p','','notice li-error');err.setAttribute('role','alert');err.hidden=true;
 const foot=E('p','RADIX non invia nulla su LinkedIn: copi il testo, lo incolli sul profilo e lo invii tu. «Segna come inviato» lo registra tra le attività del contatto.','li-foot');
 f.append(head,who,fs,nl,gen,err,draft,status,foot);d.append(f);doc.body.append(d);
 d.addEventListener('cancel',e=>{if(app()?.state.busy)e.preventDefault()});
 f.addEventListener('submit',e=>e.preventDefault());
 const u={d,who,radios,notes,ai,tpl,draft,tag,area,cnt,go,sent,link,status,err,contact:null,url:null};
 for(const r of Object.values(radios))r.addEventListener('change',()=>{const e=entry();e.purpose=r.value;paintCount();paintPlaceholder()});
 notes.addEventListener('input',()=>{entry().notes=notes.value});
 area.addEventListener('input',()=>{entry().text=area.value;paintCount()});
 return u;
}
const entry=()=>{const id=ui.contact.id;if(!drafts.has(id))drafts.set(id,{purpose:'primo',notes:'',text:'',source:'',sent:false});return drafts.get(id)};
function say(msg,isErr){if(isErr){ui.err.textContent=msg;ui.err.hidden=false;ui.status.textContent=''}else{ui.err.hidden=true;ui.err.textContent='';ui.status.textContent=msg}}
function paintPlaceholder(){const p=entry().purpose;ui.notes.placeholder=p==='evento'?'Nome, data e link dell’evento: l’AI non li inventa':p==='followup'?'Cosa vi siete detti, prossimo passo concordato…':p==='primo'?'Perché vuoi collegarti (es. stesso settore, segnalato da…)':'Cosa vuoi dire'}
function paintCount(){const e=entry(),c=core.counter(ui.area.value,e.purpose);ui.cnt.textContent=c.label+(c.over&&e.purpose==='primo'?' — LinkedIn non accetta note di collegamento più lunghe':'');ui.cnt.classList.toggle('over',c.over)}
function paint(){
 const e=entry(),a=app(),c=ui.contact;
 ui.who.replaceChildren(E('b',c.name||'Contatto'));const sub=[c.title||c.role,(a.rows('companies').find(x=>x.id===c.company_id)||{}).name||c.company].filter(Boolean).join(' · ');if(sub)ui.who.append(E('small',sub));
 ui.radios[e.purpose].checked=true;ui.notes.value=e.notes;paintPlaceholder();
 ui.draft.hidden=!e.text&&!e.source;ui.area.value=e.text;ui.tag.textContent=e.source==='ai'?'Bozza AI · controllala':e.source==='template'?'modello, non AI':'';
 ui.tag.dataset.source=e.source||'';ui.link.href=ui.url;
 ui.sent.hidden=!a.writable('interactions');ui.sent.disabled=!!e.sent;ui.sent.textContent=e.sent?'Registrato come inviato':'Segna come inviato';
 paintCount();
}
async function run(label,fn){const a=app();if(a.state.busy)return false;a.lock(true);a.error('');say(label);let ok=false;try{await fn();ok=true}catch(e){say(e.message||String(e),true)}finally{a.lock(false)}return ok}

async function draftAi(){
 const a=app(),c=ui.contact,e=entry();e.purpose=core.purposeOf(e.purpose);
 if(!root.confirm('Preparare la bozza del messaggio LinkedIn con l’AI?\nUna chiamata AI, consuma crediti API. Nulla viene inviato o salvato.'))return;
 const ok=await run('L’AI sta scrivendo il messaggio…',async()=>{const data=await related(c);const f=core.facts(c,data);
  const r=await fetch('/api/chat',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({role:'crm-copilot',crmScope:{workspace:a.state.workspace},messages:[{role:'user',content:core.prompt(f,e.purpose,e.notes)}]})});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'AI non disponibile ('+r.status+').');
  const out=core.parse(d.reply,e.purpose);if(!out)throw new Error('Risposta dell’AI senza un messaggio leggibile.');
  Object.assign(e,{text:out.text,source:'ai',sent:false});e.trimmed=out.trimmed});
 if(ok){paint();say(e.trimmed?'Bozza pronta, accorciata al limite di '+core.limitOf(e.purpose)+' caratteri: rileggila.':'Bozza pronta: controlla i fatti e completa le parti tra parentesi quadre.');ui.area.focus();return}
 // AI not available: offer the plain template, clearly labelled.
 if(!e.text){useTemplate(ui.err.textContent+' Ti propongo un modello senza AI.');ui.err.hidden=false}
}
function useTemplate(msg){
 const e=entry();if(e.text&&e.source!=='template'&&!root.confirm('Sostituire il testo attuale con il modello?'))return;
 const data={companies:app().rows('companies'),interactions:[]};
 Object.assign(e,{text:core.template(e.purpose,ui.contact,data),source:'template',sent:false});paint();
 if(msg)say(msg,true);else say('Modello compilato con i dati del contatto: completa le parti tra parentesi quadre.');ui.area.focus();
}
async function copyOpen(){
 const e=entry(),c=core.counter(ui.area.value,e.purpose),text=ui.area.value.trim();
 if(!text){say('Il messaggio è vuoto.',true);return}
 if(/\[DA COMPLETARE/i.test(text)&&!root.confirm('Il messaggio contiene ancora parti [DA COMPLETARE]. Copiarlo comunque?'))return;
 if(c.over&&!root.confirm('Il messaggio supera '+c.limit+' caratteri: LinkedIn potrebbe non accettarlo. Copiarlo comunque?'))return;
 const ok=await copy(text,ui.area);openTab(ui.url);
 say(ok?'Testo copiato. Incollalo su LinkedIn e invialo da lì; poi premi «Segna come inviato».':'Copia non riuscita: il testo è selezionato, copialo con Ctrl+C (o tieni premuto sul telefono). Il profilo è aperto in una nuova scheda.',!ok);
}
async function markSent(){
 const a=app(),e=entry(),c=ui.contact,p=core.sentPlan(c,e.purpose,ui.area.value);
 if(p.error){say(p.error,true);return}
 if(!root.confirm('Registrare il messaggio LinkedIn a '+(c.name||'questo contatto')+' come inviato?\nSi salva una nota con il testo tra le attività del contatto. RADIX non invia nulla su LinkedIn.'))return;
 if(await run('Registro il messaggio…',()=>a.api('interactions',{body:{workspace:a.state.workspace,entity:'interactions',action:'create',data:p.data}}))){
  e.sent=true;paint();say('Registrato tra le attività di '+(c.name||'questo contatto')+'.');root.RadixCrmData?.reset?.();await a.refresh(false);a.notice('Messaggio LinkedIn registrato.')}
}

// Opens the panel for a contact (row as sales.js loaded it).
function open(contact){
 const a=app(),url=core.profileUrl(contact&&contact.linkedin_url);if(!a||!url)return false;
 if(!ui)ui=build();ui.contact=contact;ui.url=url;ui.err.hidden=true;ui.status.textContent='';paint();
 if(!ui.d.open)ui.d.showModal();return true;
}
// The button, or null when the contact has no LinkedIn profile.
function button(contact,cls){
 if(!core.profileUrl(contact&&contact.linkedin_url))return null;
 const b=B('Messaggio LinkedIn',()=>open(contact),cls);b.setAttribute('aria-haspopup','dialog');return b;
}
// Card block (crm-tools.js): one button on contacts with a LinkedIn profile.
function mount(c,contact){const b=button(contact);if(!b)return false;const bar=E('div',undefined,'actions crm-linkedin');bar.append(b);c.append(bar);return true}
root.RadixCrmLinkedIn={open,button,mount};
})(typeof globalThis!=='undefined'?globalThis:this);
