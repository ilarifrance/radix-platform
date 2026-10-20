'use strict';
/* Scheda del record, inside Customer360 (sales.js calls RadixCrmRecord.mount):
   - «Riepilogo AI»: one click on «Genera riepilogo» = one request to the Copilota (/api/chat),
     with only this record's data in the message (no crmScope, so the server adds no workspace
     snapshot). Nothing is requested on open.
   - «Registra un’attività»: Email · Chiamata · Evento · Attività. Each form creates one existing
     entity through POST /api/sales (interactions or tasks), linked to the record.
     Email only registers, unless direct sending is configured: then «Invia e registra» uses
     /api/send-email (one message, after an explicit confirmation), like the ticket replies. */
(()=>{
const core=window.RadixCrmRecordCore;if(!core)return;
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n};
const B=(text,fn,cls)=>{const b=E('button',text,cls);b.type='button';b.addEventListener('click',fn);return b};
const app=()=>window.RadixSalesApp;
// Summaries live here, not in the DOM: sales.js rebuilds Customer360 on every render.
const summaries=new Map(),boxes=new Map(),tabs=new Map();
let emailReady=null;
async function emailConfigured(){if(emailReady!==null)return emailReady;try{const r=await fetch('/api/integrations/status',{credentials:'same-origin',cache:'no-store'});const d=r.ok?await r.json():{};emailReady=!!(d.items||[]).find(i=>i.id==='email'&&i.configured)}catch{emailReady=false}return emailReady}
const keyOf=ctx=>[app().state.workspace,ctx.subject,ctx.id].join(':');
const recordOf=ctx=>(ctx.rows||[]).find(x=>x.entity===ctx.subject&&x.record&&x.record.id===ctx.id)?.record||null;

/* ---------- Riepilogo AI ---------- */
function paint(out,entry){
 out.replaceChildren();if(!entry)return;
 if(entry.status==='busy'){out.append(E('p','Sto leggendo la scheda…','crm-rec-wait'));return}
 if(entry.status==='error'){out.append(E('p',entry.error,'notice'));return}
 const s=entry.summary;
 if(s.complete){for(const [k,label] of [['situation','Situazione'],['risks','Rischi'],['next','Prossimo passo consigliato']]){const b=E('div',undefined,'crm-rec-part crm-rec-'+k);b.append(E('h4',label),E('p',s[k]));out.append(b)}}
 else out.append(E('p',s.raw,'crm-rec-raw'));
 out.append(E('p','Generato da AI: verifica prima di usarlo.','crm-rec-warn'));
 out.append(E('small','Generato alle '+new Date(entry.at).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})+' dai dati di questa scheda.','crm-rec-meta'));
}
function repaint(key){for(const out of boxes.get(key)||[]){if(out.isConnected)paint(out,summaries.get(key));else boxes.get(key).delete(out)}const btn=document.querySelector('.crm-rec-ai[data-key="'+CSS.escape(key)+'"] .crm-rec-generate');if(btn)label(btn,summaries.get(key))}
function label(btn,entry){btn.textContent=entry&&entry.status==='done'?'Rigenera riepilogo':'Genera riepilogo';btn.disabled=!!entry&&entry.status==='busy';btn.setAttribute('aria-busy',String(!!entry&&entry.status==='busy'))}
async function generate(ctx){
 const a=app(),key=keyOf(ctx),prev=summaries.get(key);if(prev&&prev.status==='busy')return;
 const facts=core.summaryFacts(ctx.subject,ctx.id,ctx.rows,{stages:a.rows('stages'),members:a.rows('members'),now:Date.now()});
 if(!facts){summaries.set(key,{status:'error',error:'Dati della scheda non caricati: premi Riprova Customer360.'});repaint(key);return}
 summaries.set(key,{status:'busy'});repaint(key);
 let entry;
 try{
  const r=await fetch('/api/chat',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({role:'crm-copilot',messages:[{role:'user',content:core.summaryPrompt(facts)}]})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||'AI non disponibile ('+r.status+').');
  if(typeof d.reply!=='string'||!d.reply.trim())throw new Error('Risposta vuota: riprova.');
  entry={status:'done',summary:core.parseSummary(d.reply),at:Date.now()};
 }catch(e){entry=prev&&prev.status==='done'?{...prev,note:e.message}:{status:'error',error:e.message||String(e)};if(prev&&prev.status==='done')a.error(e.message)}
 summaries.set(key,entry);repaint(key);
}
function summaryPanel(ctx){
 const key=keyOf(ctx),box=E('section',undefined,'crm-rec-ai');box.dataset.key=key;box.setAttribute('aria-labelledby','crm-rec-ai-title');
 const head=E('div',undefined,'crm-rec-head');const h=E('h3','✦ Riepilogo AI');h.id='crm-rec-ai-title';
 const btn=B('Genera riepilogo',()=>generate(ctx),'primary crm-rec-generate');label(btn,summaries.get(key));head.append(h,btn);
 box.append(head,E('p','Riassume solo i dati di questa scheda: campi, attività, interazioni, opportunità e ticket collegati. Ogni clic è una richiesta all’AI; nulla viene modificato.','muted'));
 const out=E('div',undefined,'crm-rec-out');out.setAttribute('aria-live','polite');paint(out,summaries.get(key));
 if(!boxes.has(key))boxes.set(key,new Set());boxes.get(key).add(out);box.append(out);return box;
}

/* ---------- Registra un’attività ---------- */
function field(form,label,control,hint){const l=E('label',label);l.append(control);form.append(l);if(hint)form.append(E('small',hint));return control}
function input(name,type,value,max){const i=E('input');i.name=name;i.type=type;if(value!=null)i.value=value;if(max)i.maxLength=max;return i}
function area(name,rows,placeholder){const t=E('textarea');t.name=name;t.rows=rows;t.maxLength=4000;if(placeholder)t.placeholder=placeholder;return t}
function values(form){const o={};for(const [k,v] of new FormData(form))o[k]=v;return o}
async function save(ctx,rec,plan){
 const a=app();if(a.state.busy)return;
 if(plan.send){
  if(!await emailConfigured()){a.error('Invio diretto non configurato: usa «Registra email».');return}
  if(!window.confirm('Inviare ora l’email a '+plan.send.to+'?\nOggetto: '+plan.send.subject+'\nL’invio non si può annullare.'))return;
 }else if(!window.confirm('Registrare «'+plan.data.title+'» su «'+ctx.title+'»?'))return;
 a.lock(true);a.error('');a.notice(plan.send?'Invio in corso…':'Salvataggio sul server…');
 let sent=false,ok=false;
 try{
  if(plan.send){
   const r=await fetch('/api/send-email',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({to:plan.send.to,subject:plan.send.subject,body:plan.send.body,confirm:true})});
   const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw new Error(d.error||'Invio non riuscito ('+r.status+').');sent=true;
  }
  await a.api(plan.entity,{body:{workspace:a.state.workspace,entity:plan.entity,action:'create',data:plan.data}});ok=true;
 }catch(e){a.error((sent?'Email inviata, ma non registrata nel CRM: ':'')+(e.message||String(e))+(sent?' Registrala con «Registra email» senza reinviarla.':''));a.notice('Operazione non completata.')}
 finally{a.lock(false)}
 if(!ok)return;
 await a.refresh(false);
 await a.openCustomer?.(ctx.subject,{id:ctx.id,name:ctx.title});
 a.notice(plan.label+' su «'+ctx.title+'».');
}
function form(ctx,rec,tab,writableTasks){
 const f=E('form',undefined,'crm-rec-form');f.noValidate=true;
 const actions=E('div',undefined,'actions');
 const submit=(extra={})=>{const plan=core.composerPlan(tab,{...values(f),...extra},ctx.subject,rec,Date.now(),ctx.rows);if(plan.error){app().error(plan.error);return}app().error('');save(ctx,rec,plan)};
 if(tab==='email'){
  const to=core.recipientFor(ctx.subject,rec,ctx.rows);
  f.append(E('p',to?'Destinatario: '+to:'Nessuna email valida su questa scheda: l’email si può solo registrare.','crm-rec-to'));
  if(to)f.append(input('to','hidden',to));
  field(f,'Oggetto *',input('subject','text','',180));field(f,'Testo *',area('body',5,'Cosa hai scritto o cosa vuoi scrivere.'));
  const reg=E('button','Registra email');reg.type='submit';actions.append(reg);
  const note=E('p','Registra un’email già inviata da un altro programma. Nessun messaggio parte.','muted');
  if(to){const send=B('Invia e registra',()=>submit({send:'1'}),'primary');
   emailConfigured().then(ready=>{if(!f.isConnected)return;if(ready){send.disabled=!!app().state.busy;actions.prepend(send)}note.textContent=ready?'«Invia e registra» manda un solo messaggio dalla casella Gmail configurata, dopo una conferma. «Registra email» lo segna soltanto.':'Invio diretto non configurato: l’email si registra soltanto.'})}
  f.append(actions,note);
 }else if(tab==='call'||tab==='meeting'){
  field(f,'Titolo',input('title','text','',200)).placeholder=(tab==='call'?'Chiamata con ':'Riunione con ')+(core.counterpart(ctx.subject,rec,ctx.rows)||ctx.title);
  field(f,tab==='call'?'Quando (vuoto = adesso)':'Data e ora *',input('when','datetime-local',tab==='call'?core.localInput():''));
  field(f,tab==='call'?'Esito e note':'Note',area('body',4,tab==='call'?'Cosa vi siete detti, cosa avete deciso.':'Ordine del giorno, luogo, partecipanti.'));
  const ok=E('button',tab==='call'?'Registra chiamata':'Registra evento','primary');ok.type='submit';actions.append(ok);
  f.append(actions,E('p',tab==='call'?'Diventa un’interazione «telefonata» della scheda.':'Diventa un’interazione «incontro» e compare nel calendario CRM come riunione. Nessun invito viene inviato.','muted'));
 }else{
  if(!writableTasks){f.append(E('p','Il tuo ruolo non può creare attività.','muted'));return f}
  field(f,'Cosa fare *',input('title','text','',200)).placeholder='Es. Inviare il preventivo';
  field(f,'Scadenza (opzionale)',input('due','datetime-local',''));
  const pr=E('select');pr.name='priority';for(const [v,t] of [['normal','Normale'],['low','Bassa'],['high','Alta'],['urgent','Urgente']])pr.append(new Option(t,v));field(f,'Priorità',pr);
  const as=E('select');as.name='assignee_id';as.append(new Option('Non assegnata',''));for(const m of app().rows('members'))as.append(new Option(m.name+(m.id===app().state.me?' (tu)':''),String(m.id)));as.value=app().state.me?String(app().state.me):'';field(f,'Assegnata a',as);
  const ok=E('button','Crea attività','primary');ok.type='submit';actions.append(ok);
  f.append(actions,E('p','Compare tra le Attività e nel calendario CRM alla scadenza.','muted'));
 }
 f.addEventListener('submit',e=>{e.preventDefault();submit()});
 return f;
}
function composerPanel(ctx){
 const a=app(),key=keyOf(ctx),rec=recordOf(ctx);
 const box=E('section',undefined,'crm-rec-composer');box.setAttribute('aria-labelledby','crm-rec-cmp-title');
 const h=E('h3','Registra un’attività');h.id='crm-rec-cmp-title';box.append(h);
 if(!a.writable('interactions')){box.append(E('p','Sola lettura: il tuo ruolo non può registrare attività.','muted'));return box}
 if(!rec){box.append(E('p','Scheda non caricata: premi Riprova Customer360.','muted'));return box}
 const bar=E('div',undefined,'crm-rec-tabs');bar.setAttribute('role','tablist');bar.setAttribute('aria-label','Tipo di attività');
 const body=E('div',undefined,'crm-rec-tabpanel');body.setAttribute('role','tabpanel');
 const show=tab=>{tabs.set(key,tab);for(const b of bar.children){const on=b.dataset.tab===tab;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1}body.replaceChildren(form(ctx,rec,tab,a.writable('tasks')))};
 core.TABS.forEach(([tab,name])=>{const b=B(name,()=>show(tab));b.setAttribute('role','tab');b.dataset.tab=tab;bar.append(b)});
 bar.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;const list=[...bar.children],i=list.indexOf(document.activeElement);if(i<0)return;const n=list[(i+(e.key==='ArrowRight'?1:list.length-1))%list.length];n.click();n.focus()});
 box.append(bar,body);show(tabs.get(key)||'email');return box;
}

function mount(panel,ctx){
 if(!app()||!ctx||!core.SUBJECT_LABEL[ctx.subject])return;
 const wrap=E('div',undefined,'crm-rec');wrap.append(summaryPanel(ctx),composerPanel(ctx));panel.append(wrap);
}
window.RadixCrmRecord={mount};
})();
