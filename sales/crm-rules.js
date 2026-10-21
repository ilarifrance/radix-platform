'use strict';
/* CRM «Automazioni» panel of the Attività view (mounted by sales/crm-tools.js): the rules in force, each with what it
   proposes now; «Regole» lets owners and admins switch rules on or off and add their own from the closed list of
   sales/crm-rules-core.js; «Registro» shows what each rule has proposed and what was confirmed, from the rows already
   loaded. A rule only proposes: tasks are created after a confirmation, an email is a draft in the follow-up box
   (sales/crm-follow-up.js) with «Copia» and «Segna come inviata», never sent from here. */
(function(root){
const R=root.RadixCrmRules;if(!R)return;
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n};
const B=(text,fn,cls)=>{const b=E('button',text,cls);b.type='button';b.addEventListener('click',fn);return b};
const app=()=>root.RadixSalesApp;
const post=(entity,action,data)=>app().api(entity,{body:{workspace:app().state.workspace,entity,action,data}});
async function run(label,fn){const a=app();if(a.state.busy)return false;a.lock(true);a.error('');a.notice(label);let ok=false;try{await fn();ok=true}catch(e){a.error(e.message||String(e));a.notice('Operazione non completata.')}finally{a.lock(false)}return ok}
const canEdit=()=>['owner','admin'].includes(app().role());
const field=(label,input,hint)=>{const l=E('label',label,'crm-rules-field');l.append(input);if(hint)l.append(E('small',hint,'muted'));return l};
const select=(choices,value)=>{const s=E('select');for(const [v,t] of choices){const o=E('option',t);o.value=String(v);s.append(o)}if(value!==undefined)s.value=String(value);return s};
const num=(value,min,max)=>{const i=E('input');i.type='number';i.min=String(min);i.max=String(max);i.step='1';i.value=String(value);i.inputMode='numeric';return i};
const text=(value,max)=>{const i=E('input');i.maxLength=max;i.value=value||'';return i};
const plural=(n,one,many)=>n+' '+(n===1?one:many);

// The rules row (and the quotes a «preventivo accettato» rule needs), read once per workspace and shared by this
// panel and the home «Suggerimenti per oggi» (dashboard-view.js). fresh: read again (after a save).
// → {row,list,loaded,quotes,quoteNote,error}; a failed read is not kept, so the next call tries again.
let shared=null;
function load(fresh){
 const a=app(),ws=a&&a.state.workspace;if(!ws)return Promise.resolve(null);
 if(!fresh&&shared&&shared.ws===ws)return shared.promise;
 const promise=(async()=>{const out={row:null,list:[],loaded:false,quotes:[],quoteNote:'',error:''};
  try{const d=await a.api('segments',{subject:'rules'});out.row=(d.rows||[])[0]||null;out.list=out.row&&out.row.filters&&Array.isArray(out.row.filters.rules)?out.row.filters.rules:[];out.loaded=true}
  catch(e){out.error=e.message||String(e)}
  if(R.effective(out.list).some(r=>r.on&&!r.builtin&&r.when.type==='quote-accepted')){
   try{const q=new URLSearchParams({entity:'documents',workspace:ws,kind:'quote'});const r=await fetch('/api/sales?'+q,{credentials:'same-origin',cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'errore '+r.status);out.quotes=d.rows||[]}
   catch(e){out.quoteNote='Preventivi non leggibili ('+(e.message||e)+'): la regola sui preventivi accettati non propone nulla.'}}
  if(!out.loaded&&shared&&shared.promise===promise)shared=null;
  return out})();
 shared={ws,promise};return promise;
}
R.load=load;
function panel(){
 const st={row:null,list:[],loaded:false,quotes:[],quoteNote:'',tab:'regole',editing:null,openDrafts:new Set(),drafts:new Map()};
 const box=E('details',undefined,'panel crm-automations crm-rules');box.append(E('summary','Automazioni'));
 const intro=E('p','Le regole propongono attività e bozze email dai dati caricati: nulla parte da solo, confermi tu. Le attività all’ingresso in una fase si impostano anche sulla fase della pipeline.','muted');
 const tabs=E('div',undefined,'crm-rules-tabs');tabs.setAttribute('role','tablist');
 const body=E('div',undefined,'crm-rules-body');
 box.append(intro,tabs,body);
 const data=()=>{const a=app();return {opportunities:a.rows('opportunities'),tasks:a.rows('tasks'),tickets:a.rows('tickets'),contacts:a.rows('contacts'),companies:a.rows('companies'),interactions:a.rows('interactions'),stages:a.rows('stages'),leads:a.rows('leads'),quotes:st.quotes}};
 const opts=()=>({now:Date.now(),assignee:app().state.me||null,score:root.RadixCrmScore&&root.RadixCrmScore.score});
 async function load(fresh){
  const r=await R.load(fresh);Object.assign(st,{row:null,list:[],loaded:false,quotes:[],quoteNote:''},r?{row:r.row,list:r.list,loaded:r.loaded,quotes:r.quotes,quoteNote:r.quoteNote}:{});
  if(r&&r.error)app().error('Regole del workspace non disponibili: valgono le regole predefinite. '+r.error);
 }
 async function save(list,done){
  const v=R.validateSet(list);if(!v.ok){app().error(v.error);return false}
  const a=app(),empty=!list.length;
  const ok=await run('Salvo le regole…',async()=>{
   if(st.row&&empty)await post('segments','delete',{id:st.row.id,version:st.row.version});
   else if(st.row)await post('segments','update',{id:st.row.id,version:st.row.version,filters:{rules:list}});
   else if(!empty)await post('segments','create',{name:R.RESERVED,filters:{rules:list}});
  });
  if(ok){await load(true);a.notice(done||'Regole salvate.');draw()}else{await load(true);draw()}
  return ok;
 }
 function drawTabs(){tabs.replaceChildren();for(const [id,label] of [['regole','Regole'],['registro','Registro']]){const b=B(label,()=>{st.tab=id;st.editing=null;draw()},'crm-rules-tab');b.setAttribute('role','tab');b.setAttribute('aria-selected',String(st.tab===id));tabs.append(b)}}
 function draw(){drawTabs();body.replaceChildren();
  if(st.editing){body.append(editor(st.editing));return}
  if(st.tab==='registro'){body.append(registro());return}
  body.append(rulesList());
 }
 function rulesList(){
  const wrap=E('div',undefined,'crm-rules-list'),runs=R.evaluate(st.list,data(),opts()),edit=canEdit();
  if(st.quoteNote)wrap.append(E('p',st.quoteNote,'notice'));
  if(!st.loaded)wrap.append(E('p','Regole personalizzate non lette: sono attive le sei regole predefinite.','muted'));
  for(const runOne of runs){const rule=runOne.rule,n=runOne.items.length,email=!rule.builtin&&rule.do.type==='email';
   const row=E('div',undefined,'crm-rule'+(rule.on?'':' is-off'));row.dataset.rule=rule.id;
   const head=E('div',undefined,'crm-rule-head');head.append(E('strong',rule.name),E('span',rule.builtin?'predefinita':'personalizzata','crm-rule-kind'));
   const desc=E('span',rule.builtin?rule.description:R.describe(rule,data()),'muted crm-rule-desc');
   const count=E('span',!rule.on?'Disattivata':n?(email?plural(n,'bozza email','bozze email'):plural(n,'attività da creare','attività da creare')):'Niente da fare','crm-rule-count');
   if(runOne.skipped.length)desc.append(' · '+plural(runOne.skipped.length,'record già coperto','record già coperti')+' da un’altra regola.');
   const acts=E('div',undefined,'crm-rule-acts');
   const toggle=E('input');toggle.type='checkbox';toggle.checked=rule.on;toggle.disabled=!edit||!st.loaded;
   toggle.addEventListener('change',()=>{if(!window.confirm((toggle.checked?'Attivare':'Disattivare')+' la regola «'+rule.name+'» per tutto il workspace?')){toggle.checked=!toggle.checked;return}save(R.setOn(st.list,rule.id,toggle.checked),'Regola «'+rule.name+'» '+(toggle.checked?'attivata.':'disattivata.'))});
   const sw=E('label',undefined,'crm-rule-switch');sw.append(toggle,E('span','Attiva'));sw.title=edit?'Attiva o disattiva per tutto il workspace':'Solo owner e admin cambiano le regole';
   acts.append(sw);
   if(email){const b=B(st.openDrafts.has(rule.id)?'Chiudi bozze':'Vedi bozze',()=>{st.openDrafts.has(rule.id)?st.openDrafts.delete(rule.id):st.openDrafts.add(rule.id);draw()});b.disabled=!rule.on||!n;acts.append(b)}
   else{const b=B('Applica',()=>apply(rule.id),'primary');b.disabled=!rule.on||!n;acts.append(b)}
   if(edit&&!rule.builtin&&st.loaded){acts.append(B('Modifica',()=>{st.editing={...rule};draw()}),B('Elimina',()=>{if(window.confirm('Eliminare la regola «'+rule.name+'»? Le attività già create restano.'))save(R.remove(st.list,rule.id),'Regola eliminata.')},'danger'))}
   row.append(head,count,desc,acts);
   if(email&&rule.on&&st.openDrafts.has(rule.id))row.append(drafts(rule,runOne.items));
   wrap.append(row)}
  if(edit&&st.loaded){const add=B('Nuova regola',()=>{st.editing={id:R.newId(st.list),name:'',on:true,when:{type:'deal-stale',days:14},do:{type:'task',kind:'call',title:'',days:1,to:'owner'}};draw()},'primary');const bar=E('div',undefined,'actions crm-rules-add');bar.append(add,E('span','Massimo '+R.MAX_RULES+' regole personalizzate, da un elenco chiuso di eventi e azioni.','muted'));wrap.append(bar)}
  else if(!edit)wrap.append(E('p','Le regole si configurano da owner e admin del workspace; tu puoi applicarne le proposte.','muted'));
  return wrap;
 }
 async function apply(id){
  const a=app(),runOne=R.evaluate(st.list,data(),opts()).find(x=>x.rule.id===id);if(!runOne||!runOne.items.length){draw();return}
  const items=runOne.items.filter(x=>x.task);if(!items.length)return;
  if(!window.confirm('«'+runOne.rule.name+'»: creare '+items.length+' attività?\n'+items.slice(0,10).map(x=>'• '+x.task.title).join('\n')+(items.length>10?'\n…':'')))return;
  let done=0;const failed=[];
  await run('Applico la regola…',async()=>{for(const x of items){try{await post('tasks','create',x.task);done++}catch(e){failed.push(e.message)}}});
  await a.refresh(false);a.notice('«'+runOne.rule.name+'»: '+done+' attività create.');if(failed.length)a.error('Non create: '+failed.length+' · '+failed[0]);
 }
 // Email drafts: the follow-up box without «Invia»; «Segna come inviata» records the email interaction (so it is not proposed again).
 function drafts(rule,items){
  const list=E('div',undefined,'crm-rule-drafts');const F=root.RadixCrmFollowUp;
  for(const it of items.slice(0,20)){const m=it.email,key=rule.id+':'+it.key;
   if(!st.drafts.has(key))st.drafts.set(key,{subject:m.subject,body:m.body,nextStep:{title:'',due:''},contact:m.contact,sent:null});
   const entry=st.drafts.get(key),item=E('div',undefined,'crm-rule-draft');
   item.append(E('strong',(m.contact?m.contact.name+(m.contact.email?' · '+m.contact.email:' · senza email'):'Nessun contatto collegato')+(it.entity==='contacts'?'':' — '+(it.record.title||it.record.name||''))));
   const mark=B('Segna come inviata',async()=>{if(!window.confirm('Registrare l’email «'+entry.subject+'» come inviata da te (fuori da RADIX)?\nVerrà salvata come interazione «email» e la regola non la riproporrà.'))return;
    if(await run('Registro l’email…',()=>post('interactions','create',{...m.log,body:String(entry.body||'').slice(0,4000),occurred_at:new Date().toISOString().slice(0,19)+'Z'}))){st.drafts.delete(key);await app().refresh(false);app().notice('Email registrata.')}});
   mark.disabled=!app().writable('interactions');
   const inter={id:'regola:'+key,title:rule.name,contact_id:m.links.contact_id||null,company_id:m.links.company_id||null,opportunity_id:m.links.opportunity_id||null};
   if(F&&F.draft)item.append(F.draft(inter,entry,{send:false,note:'Bozza dal modello della regola, non dall’AI: controllala e inviala dal tuo programma di posta. RADIX non invia nulla da qui.',extra:[mark]}));
   else{const t=E('textarea');t.rows=6;t.value='Oggetto: '+entry.subject+'\n\n'+entry.body;item.append(t,mark)}
   list.append(item)}
  if(items.length>20)list.append(E('p','Altre '+(items.length-20)+' bozze: segna come inviate queste per vedere le successive.','muted'));
  return list;
 }
 function editor(r){
  const a=app(),form=E('form',undefined,'crm-rule-editor');form.noValidate=true;
  const fresh=!st.list.some(x=>x.id===r.id);form.append(E('h3',fresh?'Nuova regola':'Modifica «'+r.name+'»'));
  const name=text(r.name,40);name.required=true;
  const when=select(Object.entries(R.TRIGGERS).map(([k,v])=>[k,v.label]),r.when.type);
  const whenBox=E('div',undefined,'crm-rules-params');
  const stages=a.rows('stages'),procs=a.rows('processes');
  const stageSel=select([['','Scegli la fase…'],...stages.map(s=>[s.id,((procs.find(p=>p.id===s.process_id)||{}).title?((procs.find(p=>p.id===s.process_id)||{}).title+' · '):'')+s.title])],r.when.stage||'');
  const days=num(r.when.days||14,1,365),hours=num(r.when.hours||24,1,720),source=text(r.when.source||'',80);
  const dl=E('datalist');dl.id='crm-rules-sources';for(const s of [...new Set(a.rows('leads').map(l=>String(l.source||'').trim()).filter(Boolean))].slice(0,40)){const o=E('option');o.value=s;dl.append(o)}source.setAttribute('list',dl.id);
  const paintWhen=()=>{whenBox.replaceChildren();const t=when.value;
   if(t==='stage')whenBox.append(field('Fase',stageSel));
   else if(t==='deal-stale'||t==='contact-idle')whenBox.append(field('Da quanti giorni',days));
   else if(t==='ticket-high')whenBox.append(field('Aperto da almeno (ore)',hours));
   else if(t==='lead-source')whenBox.append(field('Fonte',source,'Vuota: qualsiasi fonte. Confronto senza maiuscole.'),dl);
   whenBox.append(E('p',R.TRIGGERS[t].help,'muted'));preview()};
  const action=select(Object.entries(R.ACTIONS),r.do.type);const doBox=E('div',undefined,'crm-rules-params');
  const kind=select(Object.entries(R.KINDS),r.do.kind||'call'),ttl=text(r.do.title||'',120),due=num(r.do.days??1,0,365);
  const members=a.rows('members');const to=select([['owner','Proprietario del record (o chi applica)'],...members.map(m=>[m.id,m.name||m.email||('Membro '+m.id)])],r.do.to||'owner');
  const prio=select([['normal','Normale'],['high','Alta'],['urgent','Urgente'],['low','Bassa']],r.do.priority||'normal');
  const subj=text(r.do.subject||'',120),bodyT=E('textarea');bodyT.rows=5;bodyT.maxLength=600;bodyT.value=r.do.body||'';
  const paintDo=()=>{doBox.replaceChildren();
   if(action.value==='task')doBox.append(field('Tipo',kind),field('Titolo',ttl,'Il titolo finale aggiunge il nome della regola e del record.'),field('Scadenza (+ giorni)',due),field('Assegnatario',to),field('Priorità',prio));
   else doBox.append(field('Oggetto',subj),field('Testo',bodyT,'Segnaposto: '+R.PLACEHOLDERS.join(' ')+'. Massimo 600 caratteri. Solo bozza: non viene inviata.'));
   preview()};
  const out=E('p','','crm-rule-preview');out.setAttribute('role','status');
  const build=()=>{const w={type:when.value};
   if(w.type==='stage')w.stage=stageSel.value;else if(w.type==='deal-stale'||w.type==='contact-idle')w.days=Number(days.value);else if(w.type==='ticket-high')w.hours=Number(hours.value);else if(w.type==='lead-source')w.source=source.value.trim();
   const d=action.value==='task'?{type:'task',kind:kind.value,title:ttl.value.trim(),days:Number(due.value),to:to.value==='owner'?'owner':Number(to.value),...(prio.value!=='normal'?{priority:prio.value}:{})}:{type:'email',subject:subj.value.trim(),body:bodyT.value.trim()};
   return {id:r.id,name:name.value.trim(),on:r.on!==false,when:w,do:d}};
  function preview(){const rule=build(),err=R.ruleError(rule);
   if(err){out.textContent=err;out.className='crm-rule-preview is-error';return}
   const n=R.planCustom(rule,data(),opts()).items.length;out.className='crm-rule-preview';out.textContent=R.describe(rule,data())+' Oggi proporrebbe '+(rule.do.type==='email'?plural(n,'bozza','bozze'):plural(n,'attività','attività'))+'.'}
  when.addEventListener('change',paintWhen);action.addEventListener('change',paintDo);form.addEventListener('input',preview);form.addEventListener('change',preview);
  const acts=E('div',undefined,'actions');
  acts.append(B('Salva regola',async()=>{const rule=build(),err=R.ruleError(rule);if(err){a.error(err);return}
   if(!window.confirm('Salvare la regola «'+rule.name+'» per tutto il workspace?\n'+R.describe(rule,data())+'\nLa regola propone soltanto: ogni attività o email resta da confermare.'))return;
   if(await save(R.upsert(st.list,rule),'Regola «'+rule.name+'» salvata.')){st.editing=null;draw()}},'primary'),
   B('Annulla',()=>{st.editing=null;draw()}));
  const grid=E('div',undefined,'crm-rules-grid');
  const q=E('fieldset');q.append(E('legend','Quando'),field('Evento',when),whenBox);
  const y=E('fieldset');y.append(E('legend','Allora'),field('Azione',action),doBox);
  grid.append(q,y);
  form.append(field('Nome della regola',name),grid,out,acts);
  form.addEventListener('submit',e=>e.preventDefault());
  paintWhen();paintDo();setTimeout(()=>name.focus(),0);
  return form;
 }
 function registro(){
  const wrap=E('div',undefined,'crm-rules-log'),rows=R.registro(st.list,data(),opts());
  wrap.append(E('p','Per ogni regola: cosa propone adesso e cosa è stato confermato (attività e email con l’etichetta «[Auto · nome]» tra quelle caricate). Nessuno storico separato: si ricalcola dai dati.','muted'));
  const table=E('table',undefined,'crm-rules-table');const thead=E('thead'),tr=E('tr');
  for(const h of ['Regola','Stato','Da confermare','Già coperte','Create','Aperte','Completate','Email registrate'])tr.append(E('th',h));thead.append(tr);table.append(thead);
  const tb=E('tbody');
  for(const r of rows){const t=E('tr');t.dataset.rule=r.rule.id;
   const nameCell=E('td');nameCell.append(E('strong',r.rule.name));
   if(r.proposed.length||r.recent.length){const d=E('details');d.append(E('summary','Dettaglio'));const ul=E('ul');
    for(const p of r.proposed.slice(0,8))ul.append(E('li','Proposta: '+(p.task?p.task.title:'Bozza email «'+p.email.subject+'» · '+(p.record.title||p.record.name||''))));
    for(const s of r.skipped.slice(0,4))ul.append(E('li','Saltata: '+(s.record.title||s.record.name||'')+' (già proposta da «'+s.by+'»)'));
    for(const x of r.recent)ul.append(E('li',(x.kind==='task'?(x.status==='done'?'Completata: ':'Creata: '):'Email registrata: ')+x.title));
    d.append(ul);nameCell.append(d)}
   t.append(nameCell,E('td',r.off?'Disattivata':'Attiva'),E('td',String(r.proposed.length)),E('td',String(r.skipped.length)),E('td',String(r.confirmed.tasks)),E('td',String(r.confirmed.open)),E('td',String(r.confirmed.done)),E('td',String(r.confirmed.emails)));
   tb.append(t)}
  table.append(tb);const scroll=E('div',undefined,'crm-rules-scroll');scroll.append(table);wrap.append(scroll);
  return wrap;
 }
 box.addEventListener('toggle',async()=>{if(!box.open)return;body.replaceChildren(E('p','Carico le regole…','muted'));await load();draw()});
 return box;
}
R.panel=panel;
})(typeof globalThis!=='undefined'?globalThis:this);
