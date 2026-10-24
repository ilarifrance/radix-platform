'use strict';
/* CRM sequences and email campaigns, on top of sales.js (window.RadixSalesApp) and the segment
   filter of crm-tools.js. Sequences create real CRM tasks (one per step and contact). Campaigns
   prepare one personalised email per contact with marketing consent; each email is sent after a
   confirmation (/api/send-email requires it), one at a time or all together with «Invia a tutti» (one
   confirmation, up to 200 per round, one every 1.2 s, stops at the first error), or opened in the mail client,
   always with the contact's own unsubscribe link (api/_sales_unsubscribe.js), and is then recorded as an «email» interaction. Nothing is sent without a confirmation.
   «Metti in coda» (sales/crm-mailboxes.js) hands the same subject, text and segment to the server queue: same rules, sent
   by the connected mailboxes in working hours within their daily limits, after one confirmation.
   «Risultati e report campagne» opens the per-campaign report (crm-campaign-report.js); without it, the plain click list. */
(function(root){
const DAY=864e5;
const SEQUENCES=Object.freeze([
 {id:'nuovo',name:'Nuovo contatto · 3 tocchi',steps:[{day:0,kind:'email',title:'Email di primo contatto'},{day:3,kind:'call',title:'Telefonata di follow-up'},{day:7,kind:'email',title:'Secondo invio con un caso concreto'}]},
 {id:'riattiva',name:'Riattivazione',steps:[{day:0,kind:'email',title:'Email «Ci risentiamo?»'},{day:5,kind:'call',title:'Telefonata di riattivazione'}]},
 {id:'incontro',name:'Dopo l’incontro',steps:[{day:1,kind:'email',title:'Riepilogo dell’incontro'},{day:7,kind:'task',title:'Invia la proposta'},{day:14,kind:'call',title:'Telefonata sulla proposta'}]}
]);
const KIND={email:'Email',call:'Telefonata',task:'Attività'};
// Pure: the tasks a sequence would create, skipping contacts already in it and, for email steps, contacts without consent.
function planSequence(seq,contacts,openTasks,opts){
 const start=new Date(opts.now+DAY);start.setUTCHours(9,0,0,0);const tag='['+seq.name+']';
 const inSeq=new Set(openTasks.filter(t=>t.status!=='done'&&String(t.title).startsWith(tag)).map(t=>t.contact_id));
 const tasks=[],skipped={already:0,consent:0};
 for(const c of contacts){
  if(inSeq.has(c.id)){skipped.already++;continue}
  for(const s of seq.steps){
   if(s.kind==='email'&&opts.consentOnly&&!c.marketing_consent){skipped.consent++;continue}
   tasks.push({title:(tag+' '+KIND[s.kind]+': '+s.title+' · '+c.name).slice(0,200),contact_id:c.id,company_id:c.company_id||null,assignee_id:opts.assignee||null,priority:'normal',status:'todo',due_at:new Date(start.getTime()+s.day*DAY).toISOString().slice(0,19)+'Z'});
  }
 }
 return {tasks,skipped};
}
const fill=(t,c)=>String(t).replace(/\{nome\}/g,String(c.name||'').split(/\s+/)[0]||'').replace(/\{nome_completo\}/g,c.name||'').replace(/\{azienda\}/g,c.company||'').replace(/\{ruolo\}/g,c.role||'');
// Pure: one email per contact with consent and an address. A contact whose notes record an opt-out («Disiscrizione…»)
// counts as without consent even if the flag was ticked again by hand (sales/crm-prospecting-core.js, same rule).
const OPTED_OUT=/disiscrizione/i;
function planCampaign(subject,body,contacts){
 const ok=[],skipped={consent:0,email:0};
 for(const c of contacts){if(!c.marketing_consent||c.opted_out===true||OPTED_OUT.test(String(c.notes||''))){skipped.consent++;continue}if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(c.email||''))){skipped.email++;continue}
  ok.push({contact:c,to:c.email,subject:fill(subject,c).slice(0,200),body:fill(body,c).slice(0,4000)})}
 return {emails:ok,skipped};
}
// Pure: every marketing email ends with the contact's own unsubscribe link (links: {contactId: token}).
// An email whose link is missing is left out rather than sent without a way to opt out.
const UNSUB='\n\n—\nNon vuoi più ricevere queste email? Disiscriviti qui: ';
function withUnsubscribe(plan,links,origin){
 const emails=[];let missing=0;
 for(const e of plan.emails){const t=links&&links[e.contact.id];if(!t){missing++;continue}
  const url=origin+'/api/sales?unsubscribe='+t,foot=UNSUB+url;emails.push({...e,body:e.body.slice(0,4000-foot.length)+foot,unsubscribeUrl:url})}
 return {emails,skipped:{...plan.skipped,link:missing}};
}
// Pure: the distinct http(s) links of an email text (max 10), trailing punctuation left out.
function urlsIn(text){return [...new Set(String(text).match(/https?:\/\/[^\s<>"'()]*[^\s<>"'().,;:!?]/g)||[])].filter(u=>u.length<=2000).slice(0,10)}
// Pure: every link of each email goes through its signed click link (clicks: {contactId:[token per url]}).
// An email without tokens, or that would grow past 4000 characters, keeps its plain links.
function withTracking(plan,clicks,urls,campaign,origin){
 if(!urls||!urls.length||!clicks)return plan;
 const emails=plan.emails.map(e=>{const t=clicks[e.contact.id];if(!t||t.length!==urls.length)return e;
  let body=e.body;const order=urls.map((u,i)=>[u,i]).sort((a,b)=>b[0].length-a[0].length);
  for(const [u,i] of order)body=body.split(u).join('\u0000'+i+'\u0000');
  body=body.replace(/\u0000(\d+)\u0000/g,(_,i)=>origin+'/api/sales?click='+t[i]+'&k='+encodeURIComponent(campaign)+'&u='+encodeURIComponent(urls[i]));
  return body.length>3700?e:{...e,body,tracked:true}});
 return {...plan,emails};
}
// «Invia a tutti»: the emails not yet sent, at most BULK_MAX per round (Gmail daily limits), in list order.
const BULK_MAX=200,BULK_GAP_MS=1200;
function bulkQueue(emails,sent,max){const done=sent instanceof Set?sent:new Set(sent||[]);const todo=(emails||[]).filter(e=>e&&!done.has(e.to));const n=Math.max(1,Math.min(BULK_MAX,Number(max)||BULK_MAX));return {now:todo.slice(0,n),later:Math.max(0,todo.length-n)}}
// Pure: campaign name for click tracking and the queue (≤80 characters, no placeholders).
function campaignName(subject,today){return String(subject).trim().replace(/\{[a-z_]+\}/g,'').replace(/\s+/g,' ').trim().replace(/^[,;:.!?\-–—\s]+/,'').slice(0,80)||'Campagna '+today}
const core={SEQUENCES,planSequence,planCampaign,withUnsubscribe,withTracking,urlsIn,fill,bulkQueue,BULK_MAX,campaignName};
if(typeof module==='object'&&module.exports){module.exports=core;return}
root.RadixCrmCampaignCore=core;

const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n};
const B=(text,fn,cls)=>{const b=E('button',text,cls);b.type='button';b.addEventListener('click',fn);return b};
const app=()=>root.RadixSalesApp;
const post=(entity,action,data)=>app().api(entity,{body:{workspace:app().state.workspace,entity,action,data}});
async function run(label,fn){const a=app();if(a.state.busy)return false;a.lock(true);a.error('');a.notice(label);let ok=false;try{await fn();ok=true}catch(e){a.error(e.message||String(e))}finally{a.lock(false)}return ok}
async function exportRows(subject){return (await app().api('export',{subject})).rows||[]}
// Segment contacts with their company id (the export carries the company name).
async function segmentContacts(filterOf){
 const f=await filterOf(),[contacts,companies]=await Promise.all([exportRows('contacts'),exportRows('companies')]);
 const byName=new Map(companies.map(c=>[String(c.name).trim().toLowerCase(),c.id]));
 return contacts.filter(f).filter(c=>c.name!=='Contatto anonimizzato').map(c=>({...c,company_id:c.company?byName.get(String(c.company).trim().toLowerCase())||null:null}));
}
let emailReady=null;
async function emailConfigured(){if(emailReady!==null)return emailReady;try{const r=await fetch('/api/integrations/status',{credentials:'same-origin',cache:'no-store'});const d=r.ok?await r.json():{};emailReady=!!(d.items||[]).find(i=>i.id==='email'&&i.configured)}catch{emailReady=false}return emailReady}
function sequencePanel(filterOf){
 const box=E('div',undefined,'crm-sequence');box.append(E('h3','Sequenze automatiche'));
 const sel=E('select');sel.setAttribute('aria-label','Sequenza');const custom=[];
 const option=s=>{const o=E('option',s.name+' ('+s.steps.map(x=>'g'+x.day+' '+KIND[x.kind].toLowerCase()).join(', ')+')');o.value=s.id;sel.append(o)};SEQUENCES.forEach(option);
 // A sequence made with «3 proposte guidate» (crm-sequence-ideas.js) joins the list for this session and is selected.
 box.addSequence=s=>{custom.push(s);option(s);sel.value=s.id};
 const consent=E('input');consent.type='checkbox';consent.checked=true;const cl=E('label');cl.append(consent,E('span',' Passi email solo a chi ha dato il consenso'));
 const go=B('Avvia sulla selezione del segmento',()=>startSequence(SEQUENCES.concat(custom).find(s=>s.id===sel.value),consent.checked,filterOf));
 const row=E('div',undefined,'actions');row.append(sel,go);box.append(row,cl,E('p','Ogni passo diventa un’attività con scadenza nel CRM, assegnata a te. I contatti già in questa sequenza vengono saltati.','muted'));return box;
}
async function startSequence(seq,consentOnly,filterOf){
 const a=app();let plan,people=0;
 if(!await run('Preparo la sequenza…',async()=>{const contacts=await segmentContacts(filterOf);people=contacts.length;plan=planSequence(seq,contacts,a.rows('tasks'),{now:Date.now(),consentOnly,assignee:a.state.me||null})}))return;
 if(!plan.tasks.length){a.notice('Nessuna attività da creare: '+people+' contatti nel segmento'+(plan.skipped.already?', '+plan.skipped.already+' già in sequenza':'')+'.');return}
 if(!window.confirm('Avviare «'+seq.name+'» e creare '+plan.tasks.length+' attività per '+people+' contatti?'+(plan.skipped.already?'\n'+plan.skipped.already+' contatti sono già in questa sequenza.':'')+(plan.skipped.consent?'\n'+plan.skipped.consent+' passi email saltati: contatti senza consenso.':'')))return;
 let done=0;const failed=[];
 await run('Creo le attività della sequenza…',async()=>{for(const t of plan.tasks){try{await post('tasks','create',t);done++}catch(e){failed.push(e.message)}}});
 await a.refresh(false);a.notice('Sequenza avviata: '+done+' attività create.');if(failed.length)a.error('Non create: '+failed.length+' · '+failed[0]);
}
function campaignPanel(filterOf){
 const box=E('div',undefined,'crm-campaign');box.append(E('h3','Campagna email'));
 const subject=Object.assign(E('input'),{maxLength:200,placeholder:'Oggetto, ad esempio: {nome}, una proposta per {azienda}'});
 const body=Object.assign(E('textarea'),{maxLength:4000,rows:6,placeholder:'Testo. Segnaposto: {nome}, {nome_completo}, {azienda}, {ruolo}'});
 const ls=E('label','Oggetto');ls.append(subject);const lb=E('label','Testo');lb.append(body);
 const out=E('div',undefined,'crm-campaign-queue');
 const ai=B('Scrivi con l’AI',()=>{if(!window.RadixCrmCopilot){app().error('Copilota non disponibile su questa pagina.');return}RadixCrmCopilot.open('Scrivi una email commerciale breve per una campagna ai contatti del segmento che ho selezionato. Dammi oggetto e testo, usa i segnaposto {nome} e {azienda}, tono professionale e concreto, una sola call to action.'+(body.value.trim()?' Parti da questa bozza: «'+body.value.trim().slice(0,1500)+'»':''))});
 // A newsletter written in the Piano Editoriale arrives here ready to send (editorial-workspace.js, «Prepara la campagna nel CRM»).
 try{const d=JSON.parse(localStorage.getItem('radix-crm-campaign-draft')||'null');localStorage.removeItem('radix-crm-campaign-draft');
  if(d&&Date.now()-Number(d.at)<864e5){subject.value=String(d.subject||'').slice(0,200);body.value=String(d.body||'').slice(0,4000);box.dataset.fromPed=String(d.source||'Piano Editoriale')}}catch{}
 const prep=B('Prepara gli invii',()=>prepare());
 const row=E('div',undefined,'actions');row.append(ai,prep);
 // «Prospezione B2B» (sales/crm-prospecting-core.js): only through «Metti in coda», with its own rules and fixed footer.
 const b2b=root.RadixCrmMailboxes&&root.RadixCrmProspectingCore?modeSwitch(prep):null;
 const results=E('div',undefined,'crm-campaign-results');
 row.append(B('Risultati e report campagne',()=>window.RadixCrmCampaignReport?RadixCrmCampaignReport.render(results):showClicks(results)));
 // «Metti in coda»: the server sends it from the «Caselle email» in working hours, with daily limits.
 if(root.RadixCrmMailboxes){
  const queue=B('Metti in coda',async()=>{
   if(!subject.value.trim()||!body.value.trim()){app().error('Scrivi oggetto e testo.');return}
   let ids=[];if(!await run('Leggo il segmento…',async()=>{ids=(await segmentContacts(filterOf)).map(c=>c.id)}))return;
   if(!ids.length){app().notice('Nessun contatto nel segmento.');return}
   if(ids.length>5000){app().error('Segmento troppo grande per una coda: massimo 5000 contatti.');return}
   const r=await RadixCrmMailboxes.enqueue({campaign:campaignName(subject.value,new Date().toISOString().slice(0,10)),subject:subject.value.trim(),body:body.value.trim(),contacts:ids,...(b2b?b2b.values():{})});if(r)RadixCrmMailboxes.showStatus(results,r.message)});
  queue.classList.add('crm-queue-button');
  row.insertBefore(queue,prep.nextSibling);row.append(B('Stato della coda',()=>RadixCrmMailboxes.showStatus(results)));
 }
 box.append(ls,lb,...(b2b?[b2b.el]:[]),row,out,results,E('p','Si invia una email alla volta, ognuna con la sua conferma, oppure tutte insieme con «Invia a tutti» (una conferma, al massimo 200 per volta), oppure con «Metti in coda»: partono da sole dalle «Caselle email», in orario di lavoro e entro il limite giornaliero di ogni casella. Solo contatti con consenso marketing ed email valida; ogni email chiude con il link personale di disiscrizione. Ogni invio viene registrato come interazione.','muted'));
 async function prepare(){
  if(!subject.value.trim()||!body.value.trim()){app().error('Scrivi oggetto e testo.');return}
  let plan,configured=false;
  if(!await run('Preparo gli invii…',async()=>{plan=planCampaign(subject.value.trim(),body.value.trim(),await segmentContacts(filterOf));
   const ids=plan.emails.map(e=>e.contact.id),links={},clicks={},urls=urlsIn(body.value),campaign=campaignName(subject.value,new Date().toISOString().slice(0,10));
   for(let i=0;i<ids.length;i+=300){const d=await app().api('unsubscribe_links',{body:{workspace:app().state.workspace,entity:'unsubscribe_links',action:'create',data:{contacts:ids.slice(i,i+300),...(urls.length?{campaign,urls}:{})}}});Object.assign(links,d.links||{});Object.assign(clicks,d.clicks||{})}
   plan=withUnsubscribe(withTracking(plan,clicks,urls,campaign,location.origin),links,location.origin);configured=await emailConfigured()}))return;
  out.replaceChildren(E('p',plan.emails.length+' email pronte'+(plan.skipped.consent?' · '+plan.skipped.consent+' senza consenso escluse':'')+(plan.skipped.email?' · '+plan.skipped.email+' senza email valida':'')+(plan.skipped.link?' · '+plan.skipped.link+' senza link di disiscrizione, escluse':'')+(plan.emails.some(e=>e.tracked)?' · i link sono tracciati: chi clicca compare nei risultati e nella sua cronologia':'')+(configured?'':' · invio diretto non configurato (manca Gmail): usa «Apri nel programma email»'),'muted'));
  const csv=B('Esporta per stampa unione (CSV)',()=>{const C=window.RadixCrmCsv;if(!C)return;const t=C.toCsv(plan.emails.map(e=>({to:e.to,name:e.contact.name,subject:e.subject,body:e.body})),[{label:'Email',key:'to'},{label:'Nome',key:'name'},{label:'Oggetto',key:'subject'},{label:'Testo',key:'body'}]);const a=E('a');a.href=URL.createObjectURL(new Blob([t],{type:'text/csv;charset=utf-8'}));a.download='campagna-'+new Date().toISOString().slice(0,10)+'.csv';document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)});
  out.append(csv);
  const sent=new Set(),marks=new Map();
  const deliver=async e=>{const r=await fetch('/api/send-email',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({to:e.to,subject:e.subject,body:e.body,unsubscribeUrl:e.unsubscribeUrl,confirm:true})});const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw new Error(d.error||'Invio non riuscito ('+r.status+').');sent.add(e.to);await marks.get(e)()};
  if(configured&&plan.emails.length){const all=B('Invia a tutti ('+plan.emails.length+')',async()=>{
   const q=bulkQueue(plan.emails,sent);if(!q.now.length){app().notice('Tutte le email sono già state inviate.');return}
   if(!window.confirm('Inviare ora '+q.now.length+' email dal tuo indirizzo?\nOggetto: '+subject.value.trim()+(q.later?'\nNe restano '+q.later+' per un secondo giro (limite di '+BULK_MAX+' per volta).':'')+'\nL’invio non si può annullare.'))return;
   let k=0;const ok=await run('Invio 1 di '+q.now.length+'…',async()=>{for(const e of q.now){app().notice('Invio '+(k+1)+' di '+q.now.length+' · '+e.to+'…');await deliver(e);k++;if(k<q.now.length)await new Promise(r=>setTimeout(r,BULK_GAP_MS))}});
   const left=plan.emails.length-sent.size;
   if(ok)app().notice(k+(k===1?' email inviata':' email inviate')+'.'+(left?' Ne restano '+left+': premi di nuovo «Invia a tutti».':''));else app().notice('Inviate '+k+' di '+q.now.length+' prima dell’errore. Premi di nuovo «Invia a tutti» per riprendere da dove si è fermato.');
   all.textContent=left?'Invia a tutti ('+left+')':'Tutte inviate';all.disabled=!left});all.classList.add('primary');out.append(all)}
  for(const e of plan.emails){
   const item=E('div',undefined,'crm-campaign-item');item.append(E('strong',e.contact.name+' · '+e.to),E('p',e.subject,'muted'));
   const pre=E('details');pre.append(E('summary','Anteprima'),E('p',e.body,'interaction-body'));item.append(pre);
   const acts=E('div',undefined,'actions');
   const record=async()=>{await post('interactions','create',{title:('Email: '+e.subject).slice(0,200),kind:'email',occurred_at:new Date().toISOString().slice(0,19)+'Z',body:e.body.slice(0,4000),contact_id:e.contact.id,company_id:e.contact.company_id||null});acts.replaceChildren(E('span','Registrata come inviata','muted'))};
   marks.set(e,record);
   if(configured)acts.append(B('Invia',async()=>{if(!window.confirm('Inviare ora a '+e.to+'?\nOggetto: '+e.subject))return;
    if(await run('Invio in corso…',()=>deliver(e)))app().notice('Email inviata a '+e.to+'.')}));
   const mail=E('a','Apri nel programma email');mail.href='mailto:'+encodeURIComponent(e.to)+'?subject='+encodeURIComponent(e.subject)+'&body='+encodeURIComponent(e.body);
   acts.append(mail,B('Segna come inviata',async()=>{if(await run('Registro l’invio…',async()=>{await record();sent.add(e.to)}))app().notice('Invio registrato per '+e.contact.name+'.')}));
   item.append(acts);out.append(item);
  }
 }
 return box;
}
// Mode of the campaign: «Solo con consenso» (default) or «Prospezione B2B». values() → extra fields for the queue.
function modeSwitch(prep){
 const PC=root.RadixCrmProspectingCore,el=E('fieldset',undefined,'crm-campaign-mode');el.append(E('legend','A chi scrivi'));
 const radio=(v,label,hint)=>{const l=E('label',undefined,'crm-mode-option'),i=E('input');i.type='radio';i.name='crm-campaign-mode-'+Math.random().toString(36).slice(2,8);i.value=v;l.append(i,E('span',label));if(hint)l.append(E('small',hint,'muted'));return [l,i]};
 const [l1,consent]=radio('consent','Solo con consenso marketing','Newsletter e promozioni: solo chi ha dato il consenso.');
 const [l2,pro]=radio('b2b','Prospezione B2B','Email 1:1 di lavoro a contatti senza consenso, con regole strette.');pro.name=consent.name;consent.checked=true;
 const opts=E('div',undefined,'crm-b2b');opts.hidden=true;
 const step=E('select');for(const [v,t] of [['0','Primo contatto'],['1','Follow-up 1'],['2','Follow-up 2 (ultimo)']]){const o=E('option',t);o.value=v;step.append(o)}
 const ls=E('label','Passo');ls.append(step);
 const base=Object.assign(E('input'),{maxLength:80,placeholder:'Nome della campagna del primo contatto'});const lb=E('label','Campagna di partenza');lb.append(base);lb.hidden=true;
 const unv=E('input');unv.type='checkbox';const lu=E('label',undefined,'crm-b2b-check');lu.append(unv,E('span',' Includi anche email «da verificare» o catch-all (sconsigliato: più rimbalzi)'));
 const rules=E('ul',undefined,'crm-b2b-rules');
 for(const t of ['Solo l’email aziendale della persona: niente webmail, PEC o indirizzi generici (info@, commerciale@ …).','Mai chi si è disiscritto (anche da altre campagne) e mai due primi contatti alla stessa persona in 90 giorni.','Al massimo 2 follow-up, almeno 3 giorni dopo il passo precedente; si fermano se registri una risposta sul contatto.','Testo semplice 1:1, senza link tracciati né pixel; stessi limiti giornalieri delle caselle.'])rules.append(E('li',t));
 const foot=E('pre',PC.footer({issuer:{name:'{ragione sociale}',street:'{indirizzo}',city:'{città}'},sender:{from_name:'{mittente della casella}'},contact:{company:'{azienda}',linkedin_url:'x'},url:'{link personale di disiscrizione}'}).replace(/^\n+/,''),'crm-b2b-footer');
 opts.append(ls,lb,lu,rules,E('p','Piè di pagina fisso, aggiunto dal server in fondo a ogni email (dati da Impostazioni › Documenti):','muted'),foot);
 el.append(l1,l2,opts);
 const sync=()=>{const on=pro.checked;opts.hidden=!on;lb.hidden=step.value==='0';prep.disabled=on;prep.title=on?'La prospezione B2B parte solo con «Metti in coda».':''};
 for(const x of [consent,pro,step])x.addEventListener('change',sync);
 return {el,values:()=>pro.checked?{mode:'b2b',step:Number(step.value),base:base.value.trim(),include_unverified:unv.checked}:{}};
}
async function showClicks(out){
 let d;if(!await run('Carico i clic…',async()=>{d=await app().api('email_clicks',{})}))return;
 const when=t=>new Date(t).toLocaleString('it-IT',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
 out.replaceChildren(E('h4','Clic sulle campagne'));
 if(!(d.campaigns||[]).length){out.append(E('p','Ancora nessun clic. I link delle prossime campagne vengono tracciati in automatico.','muted'));app().notice('');return}
 for(const c of d.campaigns)out.append(E('p','«'+c.campaign+'» · '+c.people+(c.people===1?' persona':' persone')+' · '+c.clicks+(c.clicks===1?' clic':' clic')+' · ultimo '+when(c.last_at)));
 const list=E('ul');for(const p of d.people||[])list.append(E('li',p.name+' · «'+p.campaign+'» · '+p.clicks+' clic · '+when(p.last_at)));out.append(list,E('p','Il primo clic di ogni persona su una campagna entra nella sua cronologia, alza il punteggio del contatto e crea un’attività «Richiama» per domani a chi gli ha scritto per ultimo. Alcuni filtri antivirus aprono i link da soli: un clic isolato subito dopo l’invio può non essere una persona.','muted'));app().notice('');
}
root.RadixCrmCampaigns={panel(filterOf){const box=E('details',undefined,'panel crm-campaigns');box.append(E('summary','Sequenze e campagne email sul segmento'));if(app().writable('tasks'))box.append(sequencePanel(filterOf));if(app().writable('interactions')){const c=campaignPanel(filterOf);box.append(c);if(c.dataset.fromPed){box.open=true;c.insertBefore(E('p','Newsletter arrivata dal '+c.dataset.fromPed+': scegli il segmento qui sopra (ad esempio «Solo con consenso») e premi «Prepara gli invii». I link vengono tracciati.','notice'),c.children[1]||null)}}return box}};
})(typeof globalThis!=='undefined'?globalThis:this);
