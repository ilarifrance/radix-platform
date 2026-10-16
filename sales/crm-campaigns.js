'use strict';
/* CRM sequences and email campaigns, on top of sales.js (window.RadixSalesApp) and the segment
   filter of crm-tools.js. Sequences create real CRM tasks (one per step and contact). Campaigns
   prepare one personalised email per contact with marketing consent; each email is sent one at a
   time after its own confirmation (/api/send-email requires it) or opened in the mail client,
   and is then recorded as an «email» interaction. Nothing is sent automatically. */
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
// Pure: one email per contact with consent and an address.
function planCampaign(subject,body,contacts){
 const ok=[],skipped={consent:0,email:0};
 for(const c of contacts){if(!c.marketing_consent){skipped.consent++;continue}if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(c.email||''))){skipped.email++;continue}
  ok.push({contact:c,to:c.email,subject:fill(subject,c).slice(0,200),body:fill(body,c).slice(0,4000)})}
 return {emails:ok,skipped};
}
const core={SEQUENCES,planSequence,planCampaign,fill};
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
 const sel=E('select');sel.setAttribute('aria-label','Sequenza');SEQUENCES.forEach(s=>{const o=E('option',s.name+' ('+s.steps.map(x=>'g'+x.day+' '+KIND[x.kind].toLowerCase()).join(', ')+')');o.value=s.id;sel.append(o)});
 const consent=E('input');consent.type='checkbox';consent.checked=true;const cl=E('label');cl.append(consent,E('span',' Passi email solo a chi ha dato il consenso'));
 const go=B('Avvia sulla selezione del segmento',()=>startSequence(SEQUENCES.find(s=>s.id===sel.value),consent.checked,filterOf));
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
 const prep=B('Prepara gli invii',()=>prepare());
 const row=E('div',undefined,'actions');row.append(ai,prep);
 box.append(ls,lb,row,out,E('p','Si invia una email alla volta, ognuna con la sua conferma. Solo contatti con consenso marketing ed email valida. Ogni invio viene registrato come interazione.','muted'));
 async function prepare(){
  if(!subject.value.trim()||!body.value.trim()){app().error('Scrivi oggetto e testo.');return}
  let plan,configured=false;
  if(!await run('Preparo gli invii…',async()=>{plan=planCampaign(subject.value.trim(),body.value.trim(),await segmentContacts(filterOf));configured=await emailConfigured()}))return;
  out.replaceChildren(E('p',plan.emails.length+' email pronte'+(plan.skipped.consent?' · '+plan.skipped.consent+' senza consenso escluse':'')+(plan.skipped.email?' · '+plan.skipped.email+' senza email valida':'')+(configured?'':' · invio diretto non configurato (manca Gmail): usa «Apri nel programma email»'),'muted'));
  const csv=B('Esporta per stampa unione (CSV)',()=>{const C=window.RadixCrmCsv;if(!C)return;const t=C.toCsv(plan.emails.map(e=>({to:e.to,name:e.contact.name,subject:e.subject,body:e.body})),[{label:'Email',key:'to'},{label:'Nome',key:'name'},{label:'Oggetto',key:'subject'},{label:'Testo',key:'body'}]);const a=E('a');a.href=URL.createObjectURL(new Blob([t],{type:'text/csv;charset=utf-8'}));a.download='campagna-'+new Date().toISOString().slice(0,10)+'.csv';document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)});
  out.append(csv);
  for(const e of plan.emails){
   const item=E('div',undefined,'crm-campaign-item');item.append(E('strong',e.contact.name+' · '+e.to),E('p',e.subject,'muted'));
   const pre=E('details');pre.append(E('summary','Anteprima'),E('p',e.body,'interaction-body'));item.append(pre);
   const acts=E('div',undefined,'actions');
   const record=async()=>{await post('interactions','create',{title:('Email: '+e.subject).slice(0,200),kind:'email',occurred_at:new Date().toISOString().slice(0,19)+'Z',body:e.body.slice(0,4000),contact_id:e.contact.id,company_id:e.contact.company_id||null});acts.replaceChildren(E('span','Registrata come inviata','muted'))};
   if(configured)acts.append(B('Invia',async()=>{if(!window.confirm('Inviare ora a '+e.to+'?\nOggetto: '+e.subject))return;
    await run('Invio in corso…',async()=>{const r=await fetch('/api/send-email',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({to:e.to,subject:e.subject,body:e.body,confirm:true})});const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw new Error(d.error||'Invio non riuscito ('+r.status+').');await record()});app().notice('Email inviata a '+e.to+'.')}));
   const mail=E('a','Apri nel programma email');mail.href='mailto:'+encodeURIComponent(e.to)+'?subject='+encodeURIComponent(e.subject)+'&body='+encodeURIComponent(e.body);
   acts.append(mail,B('Segna come inviata',async()=>{if(await run('Registro l’invio…',record))app().notice('Invio registrato per '+e.contact.name+'.')}));
   item.append(acts);out.append(item);
  }
 }
 return box;
}
root.RadixCrmCampaigns={panel(filterOf){const box=E('details',undefined,'panel crm-campaigns');box.append(E('summary','Sequenze e campagne email sul segmento'));if(app().writable('tasks'))box.append(sequencePanel(filterOf));if(app().writable('interactions'))box.append(campaignPanel(filterOf));return box}};
})(typeof globalThis!=='undefined'?globalThis:this);
