'use strict';
/* Lead Intelligence «Newsletter» tab. Guided flow: recipients (CRM contacts from the lead pipeline, its session
   segments or the CRM's saved segments), four questions, «Proponimi 3 versioni» (one AI call), dynamic fields with
   fallbacks, the AI-written opening line per recipient (batches of 10, one confirmation), a preview per recipient,
   and sending through the CRM machinery: unsubscribe link and click tracking from /api/sales, «Invia a tutti» with
   bulkQueue (≤200 per round, one confirmation) and /api/send-email only when Gmail is configured.
   Nothing is read from the CRM, asked to the AI or sent before a click. Logic: sales/lead-newsletter-core.js. */
(()=>{
 const N=window.RadixLeadNewsletter,C=window.RadixLeadBulkCrm,K=window.RadixCrmCampaignCore;if(!N||!C||!K)return;
 const $=id=>document.getElementById(id);if(!$('lead-newsletter'))return;
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n};
 const say=(id,msg,bad)=>{const n=$(id);n.textContent=msg||'';n.classList.toggle('lp-nl-bad',Boolean(bad))};
 const PAGE=100,MAX_PAGES=20;
 const state={audienceAuto:'',ws:'',wsName:'',rows:[],companies:[],segments:[],clicks:null,recipients:[],skipped:{consent:0,email:0},missing:[],hooks:new Map(),at:0,plan:null,sent:new Set(),busy:false,stop:false,gmail:null};

 // ---- CRM (same endpoints and headers as lead-pipeline.js and crm-campaigns.js) ----
 async function get(params){
  const r=await fetch('/api/sales?'+new URLSearchParams(params),{credentials:'same-origin',cache:'no-store'}),d=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(d.error||'CRM non raggiungibile (HTTP '+r.status+')');return d;
 }
 async function post(entity,action,data){
  const r=await fetch('/api/sales',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','x-radix-sales':'1'},body:JSON.stringify({workspace:state.ws,entity,action,data})});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Errore del CRM (HTTP '+r.status+')');return d;
 }
 async function rowsOf(entity){const out=[];for(let p=0;p<MAX_PAGES;p++){const d=await get({entity,workspace:state.ws,offset:String(out.length)});const s=Array.isArray(d.rows)?d.rows:[];out.push(...s);if(s.length<PAGE)break}return out}
 async function gmailReady(){
  if(state.gmail!==null)return state.gmail;
  try{const r=await fetch('/api/integrations/status',{credentials:'same-origin',cache:'no-store'});const d=r.ok?await r.json():{};state.gmail=!!(d.items||[]).find(i=>i.id==='email'&&i.configured)}catch{state.gmail=false}
  return state.gmail;
 }
 async function ai(content){
  const r=await fetch('/api/chat',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({role:'comm-email-outreach',messages:[{role:'user',content}]})});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'errore '+r.status);return String(d.reply||'');
 }

 // ---- step 1: recipients ----
 async function load(){
  if(state.busy)return;state.busy=true;$('nl-load').disabled=true;say('nl-who-status','Leggo il CRM…');
  try{
   if(!$('nl-workspace').options.length||$('nl-workspace').disabled){
    const all=(await get({entity:'workspaces'})).rows||[],ok=all.filter(w=>['owner','admin','member'].includes(w.role));
    if(!ok.length)throw Error('nessun workspace CRM in cui puoi scrivere');
    $('nl-workspace').replaceChildren(...ok.map(w=>{const o=el('option',w.name||w.id);o.value=w.id;return o}));$('nl-workspace').disabled=false;
   }
   state.ws=$('nl-workspace').value;state.wsName=$('nl-workspace').selectedOptions[0]?.textContent||'';
   const [contacts,companies,segments]=await Promise.all([get({entity:'export',subject:'contacts',workspace:state.ws}),get({entity:'export',subject:'companies',workspace:state.ws}),rowsOf('segments').catch(()=>[])]);
   state.companies=companies.rows||[];state.rows=N.joinCompanies(contacts.rows||[],state.companies);state.segments=segments;state.clicks=null;state.plan=null;
   sources();await compute();
  }catch(e){say('nl-who-status','CRM non disponibile: '+e.message,true)}
  finally{state.busy=false;$('nl-load').disabled=false;$('nl-load').lastChild.textContent=' Rileggi il CRM'}
 }
 function sources(){
  const sel=$('nl-source'),cur=sel.value,lp=window.RadixLeadPipeline,opts=[];
  const add=(v,t,group)=>opts.push([v,t,group]);
  if(lp){const n=lp.targets().length,s=lp.selected();add('pipeline',s?'Lead selezionati nella pipeline ('+s+')':'Lead in elenco nella pipeline ('+n+')','Lead pipeline');for(const s of lp.segments())add('lp:'+s,'Segmento «'+s+'»','Lead pipeline')}
  for(const s of state.segments)add('crm:'+s.id,s.name,'Segmenti del CRM');
  add('consent','Tutti i contatti CRM con consenso','CRM');
  const groups=new Map();for(const [v,t,g] of opts){if(!groups.has(g)){const og=document.createElement('optgroup');og.label=g;groups.set(g,og)}const o=el('option',t);o.value=v;groups.get(g).append(o)}
  sel.replaceChildren(...groups.values());sel.disabled=false;
  const n=lp?(lp.selected()||lp.targets().length):0;
  sel.value=N.defaultSource([...sel.options].map(o=>o.value),cur,n);
 }
 async function compute(){
  const v=$('nl-source').value,lp=window.RadixLeadPipeline;let rows=[],segment='',note='';state.missing=[];
  if(v==='pipeline'||v.startsWith('lp:')){
   const name=v.startsWith('lp:')?v.slice(3):'',leads=v==='pipeline'?lp.targets():lp.leads().filter(l=>lp.segmentOf(l.key)===name);
   const m=N.matchLeads(leads,state.rows,state.companies,C);rows=m.found.map(x=>x.row);state.missing=m.missing;segment=name;
   const by=new Map(m.found.map(x=>[x.row.id,lp.segmentOf(x.lead.key)]));rows.segmentOf=id=>by.get(id)||'';
  }else if(v.startsWith('crm:')){
   const s=state.segments.find(x=>x.id===v.slice(4)),f=N.segmentFilter(s?.filters);segment=s?.name||'';
   if(f.needsClicks&&!state.clicks)state.clicks=await get({entity:'email_clicks',workspace:state.ws});
   rows=state.rows.filter(N.segmentFilter(s?.filters,state.clicks).test);
   if(f.unsupported.length)note='Filtri del segmento non applicati qui: '+f.unsupported.map(k=>k==='min_score'?'punteggio minimo':'giorni senza contatto').join(', ')+'. Per quelli usa il CRM.';
  }else rows=state.rows;
  const e=N.eligible(rows);state.skipped=e.skipped;
  state.recipients=e.ok.map(r=>({contact:r,fields:N.fieldsOf(r,r.companyRow),segment:rows.segmentOf?rows.segmentOf(r.id):segment}));
  state.at=0;state.plan=null;state.sent.clear();
  const aud=N.audienceFor($('nl-audience').value,state.audienceAuto,segment);$('nl-audience').value=aud.value;state.audienceAuto=aud.auto;
  const box=$('nl-who');box.replaceChildren();
  const stat=(n,t)=>{const d=el('div');d.append(el('strong',n),el('span',t));box.append(d)};
  stat(state.recipients.length,'pronti a ricevere');stat(state.skipped.consent,'senza consenso');stat(state.skipped.email,'senza email valida');
  if(v==='pipeline'||v.startsWith('lp:'))stat(state.missing.length,'non ancora nel CRM');
  $('nl-missing').hidden=!state.missing.length;
  $('nl-missing-text').textContent=state.missing.length?state.missing.length+(state.missing.length===1?' lead non è':' lead non sono')+' ancora nel CRM: portali con «Porta nel CRM», dai il consenso ai referenti che l’hanno dato, poi premi «Rileggi il CRM».':'';
  const inCrm=state.recipients.length||v==='consent'?0:N.eligible(state.rows).ok.length;
  say('nl-who-status',(state.recipients.length?'Workspace «'+state.wsName+'».':inCrm?'Nessun destinatario pronto in questa scelta. Nel CRM '+(inCrm===1?'c’è 1 contatto pronto':'ci sono '+inCrm+' contatti pronti')+': scegli «Tutti i contatti CRM con consenso».':'Nessun destinatario pronto: servono referenti nel CRM con consenso ed email.')+(note?' '+note:''));
  refresh();
 }

 // ---- step 2: questions and the three proposals ----
 function chips(id,list,name){const fs=$(id);list.forEach(([label],i)=>{const l=el('label',null,'lp-nl-chip'),r=el('input');r.type='radio';r.name=name;r.value=label;r.checked=i===0;l.append(r,document.createTextNode(' '+label));fs.append(l)})}
 const val=name=>document.querySelector('input[name="'+name+'"]:checked')?.value||'';
 const answers=()=>({goal:val('nl-goal'),tone:val('nl-tone'),audience:$('nl-audience').value.trim(),cta:$('nl-cta').value.trim(),ctaUrl:$('nl-cta-url').value.trim(),facts:$('nl-facts').value.trim(),indications:$('nl-indications').value.trim()});
 async function proposals(){if(state.busy)return;if(!window.confirm('Chiedere 3 versioni all’AI?\nÈ una sola chiamata AI e consuma crediti API.'))return;
  state.busy=true;$('nl-propose').disabled=true;$('nl-cards').replaceChildren();say('nl-propose-status','L’AI scrive tre versioni…');
  try{
   const list=N.parseProposals(await ai(N.proposalsPrompt(answers())));if(!list.length)throw Error('risposta senza versioni leggibili, riprova');
   list.forEach((p,i)=>{
    const c=el('article',null,'lp-nl-card');c.append(el('strong',p.angle||'Versione '+(i+1)),el('p',p.subject,'lp-nl-subj'),el('p',p.body,'lp-nl-body'));
    const bad=N.unknownTags(p.subject+' '+p.body);if(bad.length)c.append(el('p','Campi da sistemare: '+bad.join(', '),'lp-nl-warn'));
    const use=el('button','Usa questa','lp-btn');use.type='button';
    use.onclick=()=>{$('nl-subject').value=p.subject;$('nl-body').value=p.body;for(const x of $('nl-cards').children)x.dataset.chosen=String(x===c);refresh();say('nl-propose-status','Versione nel passo 3: correggila come vuoi.');$('nl-step-text').scrollIntoView?.({block:'start',behavior:'smooth'})};
    c.append(use);$('nl-cards').append(c);
   });
   say('nl-propose-status','Scegli la versione migliore.');
  }catch(e){say('nl-propose-status','Proposte non disponibili: '+e.message,true)}
  finally{state.busy=false;$('nl-propose').disabled=false}
 }
 function useProject(){
  const p=window.radixLeadGrowthProject;if(!p?.payload)return;const f=N.projectFacts(p.payload);
  if(($('nl-facts').value.trim()||$('nl-indications').value.trim())&&!window.confirm('Sostituire fatti e indicazioni con quelli del progetto «'+(p.title||'')+'»?'))return;
  $('nl-facts').value=f.facts;$('nl-indications').value=f.indications;if(f.ctaUrl&&!$('nl-cta-url').value)$('nl-cta-url').value=f.ctaUrl;
 }

 // ---- step 3: text, tags and fallbacks ----
 function insertTag(tag){const t=document.activeElement===$('nl-subject')?$('nl-subject'):$('nl-body'),s=t.selectionStart??t.value.length,e=t.selectionEnd??s,x='{{'+tag+'}}';t.value=t.value.slice(0,s)+x+t.value.slice(e);t.focus();t.setSelectionRange?.(s+x.length,s+x.length);refresh()}
 function fallbacks(){const out={};for(const i of $('nl-fallbacks').querySelectorAll('input[data-tag]'))out[i.dataset.tag]=i.value.trim();return out}
 const draft=()=>({subject:$('nl-subject').value.trim(),body:$('nl-body').value.trim(),fallbacks:fallbacks()});

 // ---- step 4: AI-written opening line per recipient ----
 async function hooks(){if(state.busy)return;const todo=state.recipients.filter(r=>!state.hooks.has(r.contact.id)),calls=N.callsFor(todo.length,N.HOOK_BATCH);if(!todo.length){say('nl-hooks-status','Ogni destinatario ha già la sua frase.');return}if(!window.confirm('Scrivere la frase d’apertura per '+todo.length+(todo.length===1?' destinatario':' destinatari')+'?\nSaranno '+calls+(calls===1?' chiamata AI':' chiamate AI')+' (una ogni '+N.HOOK_BATCH+'), che consumano crediti API.'))return;
  state.busy=true;state.stop=false;$('nl-hooks').disabled=true;$('nl-hooks-stop').hidden=false;const bar=$('nl-hooks-progress');bar.hidden=false;bar.max=calls;bar.value=0;
  let done=0,lines=0,empty=0;
  try{
   for(const batch of N.batches(todo,N.HOOK_BATCH)){
    if(state.stop)break;say('nl-hooks-status','Chiamata '+(done+1)+' di '+calls+'…');
    const got=N.parseHooks(await ai(N.hooksPrompt(answers(),batch)),batch.length);
    batch.forEach((r,i)=>{if(got.has(i)){state.hooks.set(r.contact.id,got.get(i));lines++}else empty++});
    bar.value=++done;refresh();
   }
   say('nl-hooks-status',lines+(lines===1?' frase scritta':' frasi scritte')+(empty?' · '+empty+' senza frase utilizzabile: useranno la frase di riserva':'')+(state.stop&&done<calls?' · fermato dopo '+done+' chiamate di '+calls:'')+'.');
  }catch(e){say('nl-hooks-status','Interrotto alla chiamata '+(done+1)+': '+e.message+'. Le frasi già scritte restano; premi di nuovo per continuare.',true)}
  finally{state.busy=false;$('nl-hooks-stop').hidden=true;refresh()}
 }

 // ---- step 5: preview per recipient ----
 function preview(){
  const n=state.recipients.length,d=draft();state.at=Math.max(0,Math.min(state.at,n-1));
  $('nl-prev').disabled=n<2;$('nl-next').disabled=n<2;
  if(!n){$('nl-pos').textContent='Nessun destinatario';$('nl-pv-to').textContent='—';$('nl-pv-subject').textContent=d.subject||'—';$('nl-pv-body').textContent=d.body||'Scegli i destinatari e il testo per vedere l’anteprima.';$('nl-pv-missing').textContent='';$('nl-pv-hook-wrap').hidden=true;return}
  const r=state.recipients[state.at],m=N.buildEmails([r],d,state.hooks)[0];
  $('nl-pos').textContent='Destinatario '+(state.at+1)+' di '+n;
  $('nl-pv-to').textContent=(r.contact.name||'')+' · '+m.to;$('nl-pv-subject').textContent=m.subject||'(oggetto vuoto)';$('nl-pv-body').textContent=m.body||'(testo vuoto)';
  $('nl-pv-missing').textContent=m.missing.length?'Dati mancanti, uso il testo di riserva: '+m.missing.map(k=>N.LABELS[k]||k).join(', ')+'.':'Tutti i campi usati hanno un valore.';
  const uses=/\{\{\s*gancio/i.test(d.subject+d.body);$('nl-pv-hook-wrap').hidden=!uses;if(uses&&document.activeElement!==$('nl-pv-hook'))$('nl-pv-hook').value=state.hooks.get(r.contact.id)||'';
 }
 function refresh(){
  const d=draft(),bad=N.unknownTags(d.subject+' '+d.body);
  $('nl-unknown').hidden=!bad.length;$('nl-unknown').textContent=bad.length?'Campi sconosciuti, partirebbero così: '+bad.join(', '):'';
  $('nl-hooks').disabled=state.busy||!state.recipients.length||!/\{\{\s*gancio/i.test(d.subject+d.body);
  const todo=state.recipients.filter(r=>!state.hooks.has(r.contact.id)).length;
  $('nl-hooks').textContent=todo&&state.recipients.length?'✦ Scrivi le frasi con l’AI ('+todo+' · '+N.callsFor(todo,N.HOOK_BATCH)+(N.callsFor(todo,N.HOOK_BATCH)===1?' chiamata)':' chiamate)'):'✦ Scrivi le frasi con l’AI';
  $('nl-prepare').disabled=state.busy||!state.recipients.length||!d.subject||!d.body||bad.length>0;
  if(state.plan){state.plan=null;$('nl-send').hidden=true;say('nl-send-status','Testo o destinatari cambiati: premi di nuovo «Prepara gli invii».')}
  preview();
 }

 // ---- step 6: sending through the CRM campaign machinery ----
 async function prepare(){
  if(state.busy)return;const d=draft();if(!d.subject||!d.body||!state.recipients.length)return;
  state.busy=true;$('nl-prepare').disabled=true;$('nl-send').hidden=true;say('nl-send-status','Preparo gli invii…');
  try{
   const emails=N.buildEmails(state.recipients,d,state.hooks),urls=K.urlsIn(d.body),campaign=N.campaignName(d.subject),ids=emails.map(e=>e.contact.id),links={},clicks={};
   for(let i=0;i<ids.length;i+=300){const r=await post('unsubscribe_links','create',{contacts:ids.slice(i,i+300),...(urls.length?{campaign,urls}:{})});Object.assign(links,r.links||{});Object.assign(clicks,r.clicks||{})}
   const plan=K.withUnsubscribe(K.withTracking({emails,skipped:{}},clicks,urls,campaign,location.origin),links,location.origin);
   const gmail=await gmailReady();state.plan=plan;state.sent.clear();
   const tracked=plan.emails.filter(e=>e.tracked).length;
   say('nl-send-status',plan.emails.length+(plan.emails.length===1?' email pronta':' email pronte')+(plan.skipped.link?' · '+plan.skipped.link+' senza link di disiscrizione, escluse':'')+(tracked?' · link tracciati in '+tracked+' email («'+campaign+'»)':urls.length?' · link non tracciati':'')+(gmail?'.':' · invio non configurato: manca Gmail nelle integrazioni.'),!gmail);
   $('nl-send').hidden=!gmail||!plan.emails.length;$('nl-send').disabled=false;$('nl-send').textContent='Invia a tutti ('+plan.emails.length+')';
  }catch(e){say('nl-send-status','Preparazione non riuscita: '+e.message,true)}
  finally{state.busy=false;$('nl-prepare').disabled=false}
 }
 async function sendAll(){const plan=state.plan;if(state.busy||!plan||!state.gmail)return;const q=K.bulkQueue(plan.emails,state.sent);if(!q.now.length){say('nl-send-status','Tutte le email sono già state inviate.');return}if(!window.confirm('Inviare ora '+q.now.length+(q.now.length===1?' email':' email')+' dal tuo indirizzo?\nOggetto, per '+(q.now[0].contact.name||q.now[0].to)+': '+q.now[0].subject+(q.later?'\nNe restano '+q.later+' per un secondo giro (limite di '+K.BULK_MAX+' per volta).':'')+'\nL’invio non si può annullare.'))return;
  state.busy=true;$('nl-send').disabled=true;$('nl-prepare').disabled=true;const bar=$('nl-send-progress');bar.hidden=false;bar.max=q.now.length;bar.value=0;let k=0,err='';
  try{
   for(const e of q.now){
    say('nl-send-status','Invio '+(k+1)+' di '+q.now.length+' · '+e.to+'…');
    const r=await fetch('/api/send-email',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({to:e.to,subject:e.subject,body:e.body,unsubscribeUrl:e.unsubscribeUrl,confirm:true})});
    const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw Error(d.error||'Invio non riuscito ('+r.status+').');
    state.sent.add(e.to);k++;bar.value=k;
    try{await post('interactions','create',{title:('Newsletter: '+e.subject).slice(0,200),kind:'email',occurred_at:new Date().toISOString().slice(0,19)+'Z',body:e.body.slice(0,4000),contact_id:e.contact.id,company_id:e.contact.company_id||null})}catch(_){}
    if(k<q.now.length)await new Promise(res=>setTimeout(res,1200));
   }
  }catch(e){err=e.message}
  const left=plan.emails.length-state.sent.size;
  say('nl-send-status',err?'Inviate '+k+' di '+q.now.length+', poi errore: '+err+' Premi di nuovo «Invia a tutti» per riprendere.':k+(k===1?' email inviata':' email inviate')+'.'+(left?' Ne restano '+left+': premi di nuovo «Invia a tutti».':' Ogni invio è registrato nella cronologia del referente.'),Boolean(err));
  $('nl-send').textContent=left?'Invia a tutti ('+left+')':'Tutte inviate';$('nl-send').disabled=!left;state.busy=false;$('nl-prepare').disabled=false;
 }

 // ---- wiring ----
 chips('nl-goal',N.GOALS,'nl-goal');chips('nl-tone',N.TONES,'nl-tone');
 $('nl-cta-list').replaceChildren(...N.CTAS.map(x=>{const o=el('option');o.value=x;return o}));
 for(const t of N.TAGS){const b=el('button','{{'+t+'}}','lp-nl-tag');b.type='button';b.title=N.LABELS[t];b.addEventListener('mousedown',e=>e.preventDefault());b.addEventListener('click',()=>insertTag(t));$('nl-tags').append(b)}
 for(const t of N.TAGS){const l=el('label',t==='gancio'?'Frase di riserva al posto della frase AI':N.LABELS[t]+' mancante'),i=el('input');i.maxLength=120;i.dataset.tag=t;i.value=N.FALLBACKS[t];i.placeholder=t==='gancio'?'Es. Le scrivo per una novità che riguarda il suo lavoro.':'(niente)';i.addEventListener('input',refresh);l.append(i);$('nl-fallbacks').append(l)}
 $('nl-load').addEventListener('click',load);
 $('nl-workspace').addEventListener('change',()=>{state.hooks.clear();load()});
 $('nl-source').addEventListener('change',()=>{compute().catch(e=>say('nl-who-status',e.message,true))});
 $('nl-to-crm').addEventListener('click',()=>{$('lp-crm')?.click();$('bulk-crm')?.scrollIntoView?.({block:'start',behavior:'smooth'})});
 $('nl-propose').addEventListener('click',proposals);
 $('nl-project').addEventListener('click',useProject);
 const showProject=()=>{$('nl-project').hidden=!window.radixLeadGrowthProject?.payload};showProject();window.addEventListener('radix:lead-growth-project',showProject);
 for(const id of ['nl-subject','nl-body'])$(id).addEventListener('input',refresh);
 $('nl-hooks').addEventListener('click',hooks);$('nl-hooks-stop').addEventListener('click',()=>{state.stop=true;say('nl-hooks-status','Mi fermo dopo la chiamata in corso…')});
 $('nl-prev').addEventListener('click',()=>{const n=state.recipients.length;if(n){state.at=(state.at-1+n)%n;preview()}});
 $('nl-next').addEventListener('click',()=>{const n=state.recipients.length;if(n){state.at=(state.at+1)%n;preview()}});
 $('nl-pv-hook').addEventListener('input',()=>{const r=state.recipients[state.at];if(!r)return;const v=$('nl-pv-hook').value.replace(/\s+/g,' ').trim();v?state.hooks.set(r.contact.id,v):state.hooks.delete(r.contact.id);refresh()});
 $('nl-prepare').addEventListener('click',prepare);$('nl-send').addEventListener('click',sendAll);
 // Pipeline changes (selection, segments) update the recipient choices once the CRM has been read.
 for(const ev of ['radix:lead-contacts-updated','radix:lead-list-updated'])window.addEventListener(ev,()=>{if(state.ws)sources()});
 refresh();
})();
