'use strict';
/* «Caselle email» and «Coda invii» in the CRM (api/_sales_mailboxes.js, migration sales 016).
   - Panel «Caselle email» (Impostazioni › Caselle email, shell/settings.js): up to 5 sending mailboxes per workspace, Gmail with a
     «password per le app» or any SMTP server; «Prova invio» sends one email to your own address after a
     confirmation; pause, resume, delete. Only owner and admin change them; the password is never shown again.
   - «Metti in coda» in the campaign panel (sales/crm-campaigns.js): the server plans the segment with the
     campaign rules (consent, unsubscribe link, tracked links), a confirmation shows recipients, skipped,
     mailboxes and days; only then the emails enter the queue, sent by the worker in working hours.
   - «Stato della coda»: per campaign in coda / inviate / fallite, with «Annulla» for what is still waiting. */
(function(root){
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n};
const B=(text,fn,cls)=>{const b=E('button',text,cls);b.type='button';b.addEventListener('click',fn);return b};
const app=()=>root.RadixSalesApp;
const post=(entity,action,data)=>app().api(entity,{body:{workspace:app().state.workspace,entity,action,data}});
async function run(label,fn){const a=app();if(a.state.busy)return false;a.lock(true);a.error('');a.notice(label);let ok=false;try{await fn();ok=true}catch(e){a.error(e.message||String(e))}finally{a.lock(false)}return ok}
const when=t=>t?new Date(t).toLocaleString('it-IT',{weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Rome'}):'—';
const STATUS={active:'Attiva',paused:'In pausa',error:'Ferma per errore'};
const n=(k,one,many)=>k+' '+(k===1?one:many);
const field=(label,input,hint)=>{const l=E('label',undefined,'crm-mb-field');l.append(E('span',label),input);if(hint)l.append(E('small',hint,'muted'));return l};
const input=(type,attrs)=>Object.assign(E('input'),{type,...attrs});

// ---- Panel «Caselle email» ----
function panel(){
 const box=E('details',undefined,'panel crm-mailboxes');box.append(E('summary','Caselle email'));
 const intro=E('p','Le campagne in coda partono da queste caselle, a orari scaglionati tra le 8:30 e le 18:30 (lun-ven), al massimo 50 email al giorno per casella. Una casella nuova parte piano: 10 al giorno i primi 3 giorni, 25 fino al settimo, poi il suo limite.','muted');
 const list=E('div',undefined,'crm-mb-list'),form=E('div',undefined,'crm-mb-form');
 box.append(intro,list,form);
 box.addEventListener('toggle',()=>{if(box.open)refresh()});
 box.refresh=refresh;
 async function refresh(){
  let d;try{d=await app().api('mailboxes',{})}catch(e){list.replaceChildren(E('p',e.message,'notice'));return}
  render(d);
 }
 function render(d){
  list.replaceChildren();form.replaceChildren();
  if(!d.rows.length)list.append(E('p','Nessuna casella collegata.'+(d.can_manage?' Aggiungine una qui sotto.':' Chiedi a un owner o admin del workspace di collegarne una.'),'muted'));
  for(const m of d.rows)list.append(card(m,d.can_manage));
  if(!d.can_manage)return;
  if(!d.encryption)form.append(E('p','Il server non ha ancora la chiave di cifratura delle password (MAILBOX_ENC_KEY): finché non viene impostata, le caselle non si possono salvare.','notice'));
  if(d.rows.length>=d.max){form.append(E('p','Hai collegato '+d.max+' caselle, il massimo per workspace.','muted'));return}
  form.append(addForm());
 }
 function card(m,manage){
  const c=E('div',undefined,'crm-mb-card');c.dataset.status=m.status;
  const head=E('div',undefined,'crm-mb-head');head.append(E('strong',m.label),E('span',STATUS[m.status]||m.status,'crm-mb-badge'));
  c.append(head,E('p',(m.from_name?m.from_name+' · ':'')+m.from_email+' · '+m.smtp_host+':'+m.smtp_port,'muted'));
  c.append(E('p','Oggi: '+m.today_planned+' di '+m.today_limit+' email'+(m.today_limit<m.daily_limit?' (riscaldamento, poi '+m.daily_limit+' al giorno)':' al giorno')+' · password salvata: '+(m.password_saved?'sì':'no'),'crm-mb-meta'));
  if(m.last_error)c.append(E('p','Ultimo errore: '+m.last_error,'crm-mb-error'));
  if(!manage)return c;
  const acts=E('div',undefined,'actions');
  acts.append(B('Prova invio',()=>testSend(m)));
  if(m.status==='active')acts.append(B('Metti in pausa',()=>act(m,'pause','Mettere in pausa «'+m.label+'»? Le email in coda per questa casella aspettano finché non la riattivi.')));
  else acts.append(B('Riattiva',()=>act(m,'resume','Riattivare «'+m.label+'»? Le email in coda ripartono dal prossimo giro (ogni 10 minuti).')));
  acts.append(B('Cambia password',()=>{if(c.querySelector('.crm-mb-pass'))return;const f=E('div',undefined,'actions crm-mb-pass'),p=input('password',{maxLength:200,autocomplete:'new-password',placeholder:'Nuova password per le app'});p.setAttribute('aria-label','Nuova password per le app di '+m.label);
   f.append(p,B('Salva password',async()=>{if(p.value.trim()&&await save('update',{id:m.id,password:p.value},'Password di «'+m.label+'» aggiornata.'))p.value=''},'primary'),B('Annulla',()=>f.remove()));c.append(f);p.focus()}));
  acts.append(B('Elimina',()=>act(m,'delete','Eliminare la casella «'+m.label+'»? Le email in coda per questa casella verranno annullate (quelle già inviate restano nello storico).'),'danger'));
  c.append(acts);return c;
 }
 async function act(m,action,question){
  if(!window.confirm(question))return;let r;
  if(await run('Aggiorno la casella…',async()=>{r=(await post('mailboxes',action,{id:m.id})).rows[0]}))app().notice(action==='delete'?'Casella eliminata'+(r.cancelled?': '+n(r.cancelled,'email in coda annullata','email in coda annullate'):'')+'.':action==='pause'?'Casella in pausa.':'Casella riattivata.');
  refresh();
 }
 async function testSend(m){
  if(!window.confirm('Inviare una email di prova da «'+m.from_email+'» al tuo indirizzo?\nArriva solo a te: serve a verificare che la casella funzioni.'))return;
  let r;if(!await run('Invio la prova…',async()=>{r=(await post('mailboxes','test',{id:m.id,confirm:true})).rows[0]}))return;
  if(r.ok)app().notice('Prova inviata a '+r.to+': controlla la posta in arrivo.');else app().error('Prova non riuscita: '+r.error);
  refresh();
 }
 async function save(action,data,done){if(await run('Salvo la casella…',()=>post('mailboxes',action,data))){app().notice(done);refresh();return true}return false}
 function addForm(){
  const wrap=E('div',undefined,'crm-mb-add');wrap.append(E('h4','Aggiungi una casella'));
  const kind=E('select');for(const [v,t] of [['gmail','Gmail o Google Workspace'],['smtp','Altro server SMTP']]){const o=E('option',t);o.value=v;kind.append(o)}
  const label=input('text',{maxLength:60,placeholder:'Ad esempio: Commerciale Anna'}),fromName=input('text',{maxLength:80,placeholder:'Anna Rossi · RADIX'}),from=input('email',{maxLength:254,placeholder:'anna@azienda.it',autocomplete:'off'});
  const host=input('text',{maxLength:253,value:'smtp.gmail.com'}),port=E('select');for(const p of [465,587,25,2525]){const o=E('option',String(p));o.value=String(p);port.append(o)}
  const user=input('text',{maxLength:254,placeholder:'di solito uguale all’email mittente',autocomplete:'off'}),pass=input('password',{maxLength:200,autocomplete:'new-password',placeholder:'16 lettere, ad esempio abcd efgh ijkl mnop'});
  const limit=input('number',{min:1,max:50,value:50});
  const help=E('div',undefined,'crm-mb-help');
  help.append(E('strong','Come ottenere la password per le app di Gmail'));
  const ol=E('ol');for(const s of ['Attiva la verifica in due passaggi sul tuo account Google.','Apri myaccount.google.com › Sicurezza › Password per le app.','Crea una password con nome «RADIX» e copia le 16 lettere.','Incollala qui: non usare la password normale di Gmail.'])ol.append(E('li',s));help.append(ol);
  const smtp=E('div',undefined,'crm-mb-grid');smtp.append(field('Server SMTP',host),field('Porta',port,'465 = connessione sicura (SSL); 587 = STARTTLS'),field('Utente SMTP',user));
  const sync=()=>{const g=kind.value==='gmail';help.hidden=!g;smtp.hidden=g;if(g){host.value='smtp.gmail.com';port.value='465'}};kind.addEventListener('change',sync);
  const grid=E('div',undefined,'crm-mb-grid');grid.append(field('Tipo',kind),field('Nome della casella',label),field('Nome mittente',fromName,'Facoltativo: come appare a chi riceve'),field('Email mittente',from),field('Password per le app',pass,'Viene cifrata e non sarà più mostrata.'),field('Limite al giorno',limit,'Da 1 a 50.'));
  const addB=B('Salva casella',async()=>{
   const data={label:label.value,from_email:from.value.trim(),smtp_host:host.value.trim(),smtp_port:Number(port.value),smtp_secure:Number(port.value)===465,smtp_user:(kind.value==='gmail'||!user.value.trim()?from.value:user.value).trim(),password:pass.value,daily_limit:Number(limit.value)};
   if(fromName.value.trim())data.from_name=fromName.value;
   if(await save('add',data,'Casella «'+label.value.trim()+'» salvata. Usa «Prova invio» per verificarla.'))pass.value='';
  },'primary');
  wrap.append(grid,smtp,help,E('div',undefined,'actions'));wrap.lastChild.append(addB);sync();
  return wrap;
 }
 return box;
}

// ---- «Metti in coda» (from the campaign panel) ----
// input: {campaign, subject, body, contacts:[ids]} and, for «Prospezione B2B», mode:'b2b', step, base, include_unverified.
async function enqueue(input){
 const a=app(),data={campaign:input.campaign,subject:input.subject,body:input.body,contacts:input.contacts,origin:location.origin};
 if(input.mode==='b2b'){data.mode='b2b';data.step=input.step||0;if(data.step)data.base=input.base;data.include_unverified=!!input.include_unverified}
 let p;if(!await run('Preparo la coda…',async()=>{p=(await post('send_queue','plan',data)).rows[0]}))return null;
 a.notice('');
 if(!p.active_mailboxes){a.error('Nessuna casella attiva: collegane una in Impostazioni › Caselle email prima di mettere in coda.');return null}
 if(p.mode==='b2b'&&!p.issuer_ready){a.error('Prospezione B2B: compila prima l’intestazione in Impostazioni › Documenti (ragione sociale e indirizzo), che compare in fondo a ogni email.');return null}
 if(!p.recipients){a.notice('Nessuna email da mettere in coda'+skippedText(p)+'.');return null}
 const lines=['Mettere in coda «'+p.campaign+'»?',''];
 if(p.mode==='b2b'){
  lines.push(n(p.recipients,'destinatario','destinatari')+' in prospezione B2B ('+(p.step?'follow-up '+p.step+' di 2':'primo contatto')+'): email aziendali della persona, senza consenso marketing, non disiscritti'+(p.step?', senza risposta registrata':', non contattati negli ultimi 90 giorni')+'.');
  lines.push('Ogni email chiude con questo piè di pagina, che non si può togliere:','',p.footer_preview,'');
 }else lines.push(n(p.recipients,'destinatario','destinatari')+' con consenso marketing ed email valida.');
 if(p.skipped.consent)lines.push(n(p.skipped.consent,'contatto escluso','contatti esclusi')+' perché senza consenso.');
 const other=skippedText(p,true);if(other)lines.push(other);
 lines.push('Caselle: '+p.mailboxes.map(m=>m.label+' ('+m.emails+')').join(', ')+'.');
 lines.push('Tempo stimato: '+n(p.days,'giorno lavorativo','giorni lavorativi')+', dal '+when(p.first_at)+' al '+when(p.last_at)+'.');
 if(p.unplanned)lines.push('Attenzione: '+p.unplanned+' email non entrano nei prossimi mesi con le caselle attive.');
 lines.push('','Gli invii partono da soli in orario di lavoro; puoi annullare quelli non ancora partiti da «Stato della coda».');
 if(!window.confirm(lines.join('\n')))return null;
 let r;if(!await run('Metto in coda…',async()=>{r=(await post('send_queue','enqueue',{...data,confirm:true})).rows[0]}))return null;
 r.message=n(r.queued,'email messa in coda','email messe in coda')+' per «'+r.campaign+'»'+(r.first_at?': la prima parte '+when(r.first_at):'')+'.';a.notice(r.message);
 return r;
}
function skippedText(p,only){
 const s=p.skipped||{},parts=[];
 if(!only&&s.consent)parts.push(s.consent+' senza consenso');
 if(s.optout)parts.push(s.optout+' disiscritti');
 if(s.email)parts.push(s.email+' senza email valida');
 if(s.business)parts.push(s.business+' con email non aziendale (webmail o PEC)');
 if(s.generic)parts.push(s.generic+' con un indirizzo generico (info@, commerciale@ …)');
 if(s.unverified)parts.push(s.unverified+' con email da verificare o non verificata');
 if(s.recent)parts.push(s.recent+' già contattati negli ultimi 90 giorni');
 if(s.previous)parts.push(s.previous+' senza il passo precedente inviato');
 if(s.early)parts.push(s.early+' con il passo precedente inviato da meno di 3 giorni');
 if(s.replied)parts.push(s.replied+' che hanno risposto');
 if(s.duplicate)parts.push(s.duplicate+' con un indirizzo già presente');
 if(s.already)parts.push(s.already+' già in coda per questa campagna');
 if(s.link)parts.push(s.link+' senza link di disiscrizione');
 if(s.missing)parts.push(s.missing+' non più nel CRM');
 return parts.length?(only?'Esclusi anche: ':' · ')+parts.join(', ')+(only?'.':''):'';
}
// ---- «Stato della coda» ----
// message: what to leave in the status line once the list is loaded.
async function showStatus(out,message){
 let d;if(!await run('Carico lo stato della coda…',async()=>{d=await app().api('send_queue',{})}))return;app().notice(message||'');
 out.replaceChildren(E('h4','Coda invii'));
 if(!d.rows.length){out.append(E('p','Nessuna campagna in coda. Prepara una campagna e premi «Metti in coda».','muted'));return}
 const can=app().writable('interactions');
 for(const c of d.rows){
  const row=E('div',undefined,'crm-mb-queue');row.append(E('strong','«'+c.campaign+'»'));
  const stats=E('div',undefined,'crm-mb-stats');
  for(const [k,one,many] of [['queued','in coda','in coda'],['sent','inviata','inviate'],['failed','fallita','fallite'],['skipped','saltata','saltate'],['cancelled','annullata','annullate']])if(c[k]||['queued','sent','failed'].includes(k)){const s=E('span',n(c[k],one,many),'crm-mb-stat');s.dataset.kind=k;stats.append(s)}
  row.append(stats);
  if(c.queued)row.append(E('p','Prossimo invio '+when(c.next_at)+' · ultimo previsto '+when(c.last_at),'muted'));
  if(c.last_sent_at)row.append(E('p','Ultimo inviato '+when(c.last_sent_at),'muted'));
  if(c.last_error)row.append(E('p','Ultimo errore: '+c.last_error,'crm-mb-error'));
  if(can&&c.queued)row.append(B('Annulla quelle in coda',async()=>{
   if(!window.confirm('Annullare le '+c.queued+' email di «'+c.campaign+'» non ancora inviate?\nQuelle già partite restano inviate.'))return;
   let r;if(await run('Annullo…',async()=>{r=(await post('send_queue','cancel',{campaign:c.campaign})).rows[0]}))showStatus(out,n(r.cancelled,'email annullata','email annullate')+' per «'+c.campaign+'».')
  },'danger'));
  out.append(row);
 }
 out.append(E('p','Il server controlla la coda ogni 10 minuti: prima di ogni invio verifica di nuovo consenso ed email del contatto. Chi si disiscrive nel frattempo viene saltato.','muted'));
}
root.RadixCrmMailboxes={panel,enqueue,showStatus};
})(typeof globalThis!=='undefined'?globalThis:this);
