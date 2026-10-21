'use strict';
/* «Detta»: the salesperson speaks (or types) a note and the CRM fields fill themselves.
   1. Speech to text in the browser (Web Speech API, it-IT, interim text live, «Ferma»). Where the browser has no
      speech recognition (e.g. Firefox) the same box takes a typed or pasted note. RADIX never receives audio.
   2. «Compila i campi»: after a confirmation, ONE request to the Copilota (/api/chat, no crmScope: only the
      dictation and the field list travel) that answers with the JSON of crm-dictation-core.js.
   3. Review: every proposed field with old → new value, a tick per field, editable values. Nothing is saved
      until «Salva», which uses the same create / update commands of the forms (POST /api/sales).
      From an open form («Detta i campi»), the ticked values go into the form, and its own «Conferma e salva» saves.
   Opens from the Copilota (window.RadixCrmDictation.open()) and from the record forms (sales.js → editor()). */
(()=>{
const core=window.RadixCrmDictationCore;if(!core)return;
const app=()=>window.RadixSalesApp;
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n};
const B=(text,fn,cls)=>{const b=E('button',text,cls);b.type='button';b.addEventListener('click',fn);return b};
const SR=()=>window.SpeechRecognition||window.webkitSpeechRecognition||null;
const SUBJECT={companies:'companies',contacts:'contacts',opportunities:'opportunities'};
let dlg=null,ui={},fixed=null,cards=null,ctx=null,rec=null,listening=false,base='';

function context(){const a=app(),rows={};for(const e of ['companies','contacts','opportunities','interactions','stages','processes'])rows[e]=[...a.rows(e)];
 return {rows,custom:window.RadixCrmCustom?.defs?.()||[],now:Date.now(),fixed}}
function say(text,kind){ui.msg.textContent=text||'';ui.msg.className='cd-msg'+(kind?' cd-msg-'+kind:'');ui.msg.hidden=!text}

/* ---------- speech ---------- */
const MIC_ERR={'not-allowed':'Microfono non autorizzato: consentilo dal lucchetto nella barra degli indirizzi, oppure scrivi la nota.','service-not-allowed':'Dettatura vocale non consentita da questo browser: scrivi la nota.','no-speech':'Non ho sentito nulla: riprova o scrivi la nota.','audio-capture':'Nessun microfono trovato: scrivi la nota.','network':'Il riconoscimento vocale del browser non è raggiungibile: scrivi la nota.','language-not-supported':'Il browser non riconosce l’italiano: scrivi la nota.'};
function paintMic(){if(!ui.mic)return;ui.mic.textContent=listening?'■ Ferma':'🎙 Detta';ui.mic.setAttribute('aria-pressed',String(listening));ui.mic.classList.toggle('cd-live',listening);ui.live.hidden=!listening}
function start(){
 const C=SR();if(!C||listening)return;
 try{rec=new C()}catch{say('Dettatura vocale non disponibile: scrivi la nota.','err');return}
 rec.lang='it-IT';rec.interimResults=true;rec.continuous=true;rec.maxAlternatives=1;
 base=ui.text.value.replace(/\s+$/,'');
 rec.onresult=e=>{let fin='',mid='';for(let i=e.resultIndex;i<e.results.length;i++){const r=e.results[i];if(r.isFinal)fin+=r[0].transcript;else mid+=r[0].transcript}
  if(fin.trim()){base=(base?base+' ':'')+fin.trim();ui.text.value=base;ui.text.dispatchEvent(new Event('input'))}ui.interim.textContent=mid.trim()};
 rec.onerror=e=>{say(MIC_ERR[e.error]||'Dettatura interrotta: '+(e.error||'errore')+'. Puoi scrivere la nota.','err')};
 rec.onend=()=>{listening=false;rec=null;ui.interim.textContent='';paintMic()};
 try{rec.start();listening=true;say('');paintMic()}catch(e){rec=null;say('Dettatura vocale non avviata: scrivi la nota.','err')}
}
function stop(){if(rec){try{rec.stop()}catch{}}}

/* ---------- dialog ---------- */
function build(){
 dlg=E('dialog',undefined,'cd-panel');dlg.setAttribute('aria-labelledby','cd-title');
 const head=E('div',undefined,'cd-head');ui.title=E('h2','Detta');ui.title.id='cd-title';head.append(ui.title,B('Chiudi',()=>dlg.close(),'cd-close'));
 const note=E('p','Parla o scrivi come lo racconteresti a un collega: «Ho sentito Laura Bianchi di Ferri, vuole un preventivo da 12 mila euro entro il 15 novembre». L’AI propone i campi, tu scegli cosa salvare.','cd-note');
 const privacy=E('p','RADIX non registra e non carica l’audio: il testo lo scrive il riconoscimento vocale del browser (in Chrome ed Edge passa dal servizio vocale del browser). All’AI arriva solo il testo.','cd-privacy');
 const mic=E('div',undefined,'cd-mic');
 if(SR()){ui.mic=B('🎙 Detta',()=>listening?stop():start(),'cd-mic-btn');ui.mic.setAttribute('aria-pressed','false');ui.live=E('span','In ascolto… parla, poi premi «Ferma».','cd-live-note');ui.live.hidden=true;mic.append(ui.mic,ui.live)}
 else mic.append(E('p','La dettatura vocale non è disponibile in questo browser: scrivi o incolla la nota qui sotto, il resto funziona uguale.','cd-fallback'));
 const lab=E('label','Testo della nota');ui.text=E('textarea');ui.text.rows=5;ui.text.maxLength=6000;ui.text.id='cd-text';ui.text.placeholder='Detta o scrivi qui…';lab.htmlFor='cd-text';
 ui.interim=E('p','','cd-interim');ui.interim.setAttribute('aria-hidden','true');
 const acts=E('div',undefined,'actions cd-actions');ui.compile=B('Compila i campi',compile,'primary cd-compile');ui.clear=B('Svuota',()=>{stop();ui.text.value='';base='';cards=null;ui.review.replaceChildren();ui.result.replaceChildren();say('');ui.text.focus();sync()},'cd-clear');acts.append(ui.compile,ui.clear);
 ui.msg=E('p','','cd-msg');ui.msg.setAttribute('role','status');ui.msg.hidden=true;
 ui.review=E('div',undefined,'cd-review');ui.result=E('div',undefined,'cd-result');ui.result.setAttribute('aria-live','polite');
 ui.text.addEventListener('input',sync);
 dlg.append(head,note,privacy,mic,lab,ui.text,ui.interim,acts,ui.msg,ui.review,ui.result);
 dlg.addEventListener('close',()=>{stop()});
 dlg.addEventListener('cancel',e=>{if(app()?.state.busy)e.preventDefault()});
 document.body.append(dlg);
}
function sync(){if(ui.compile)ui.compile.disabled=!ui.text.value.trim()||!!app()?.state.busy}
// opts: {entity,row,form} from an open record form; nothing from the Copilota.
function open(opts){
 if(!app()){return}
 if(!dlg)build();
 const o=opts||{};const next=o.entity?{entity:o.entity,row:o.row||null,form:o.form||null}:null;
 const changed=JSON.stringify([fixed?.entity,fixed?.row?.id])!==JSON.stringify([next?.entity,next?.row?.id]);
 fixed=next;
 if(changed){ui.text.value='';base='';cards=null;ui.review.replaceChildren();ui.result.replaceChildren();say('')}
 ui.title.textContent=fixed?'Detta · '+(fixed.row?'Modifica ':'Nuov'+(fixed.entity==='contacts'?'o ':'a '))+core.TYPE_NAME[fixed.entity].toLowerCase()+(fixed.row?' «'+(fixed.row.name||fixed.row.title||'')+'»':''):'Detta';
 sync();if(!dlg.open)dlg.showModal();ui.text.focus();
}

/* ---------- the AI call ---------- */
async function compile(){
 const a=app(),text=ui.text.value.trim();if(!text){say('Detta o scrivi prima la nota.','err');return}
 if(a.state.busy)return;if(!a.state.workspace){say('Scegli prima un workspace CRM.','err');return}
 if(!window.confirm('Compilare i campi con l’AI?\nÈ una chiamata AI: usa crediti API.\nNulla viene salvato finché non premi «Salva».'))return;
 stop();ui.compile.disabled=true;ui.compile.setAttribute('aria-busy','true');say('L’AI sta leggendo la nota…');ui.review.replaceChildren();ui.result.replaceChildren();cards=null;
 try{
  try{await window.RadixCrmCustom?.load?.()}catch{}
  ctx=context();
  const r=await fetch('/api/chat',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({role:'crm-copilot',messages:[{role:'user',content:core.prompt(text,ctx)}]})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||'AI non disponibile ('+r.status+').');
  const parsed=core.parseReply(d.reply,ctx);if(!parsed)throw new Error('Risposta dell’AI senza dati leggibili: riprova.');
  cards=core.propose(parsed,ctx);
  if(!cards.length){say(fixed?'Nella nota non ho trovato dati per questa scheda.':'Nella nota non ho trovato dati da salvare nel CRM.','err');return}
  say('Controlla i campi proposti: sono spuntati solo quelli sicuri che non sostituiscono un valore già compilato.');renderReview();
  ui.review.querySelector('.cd-card')?.scrollIntoView({block:'start',behavior:'auto'});
 }catch(e){say(e.message||String(e),'err')}
 finally{ui.compile.removeAttribute('aria-busy');sync()}
}

/* ---------- review ---------- */
function control(card,f,refresh){
 let c;
 if(f.type==='select'||f.type==='stage'){
  c=E('select');const opts=f.type==='stage'?stageOptions():f.options||[];
  if(f.type==='stage'){for(const [v,t] of opts)c.append(new Option(t,v));if(f.input&&!opts.some(([v])=>v===f.input))c.append(new Option(String(f.input)+' (non è una fase)',String(f.input)));c.value=f.input}
  else{c.append(new Option('— scegli —',''));for(const [v,t] of opts)c.append(new Option(t,v));if(f.input&&!opts.some(([v])=>v===f.input))c.append(new Option(String(f.input)+' (non in elenco)',String(f.input)));c.value=f.input??''}
 }else if(f.type==='area'){c=E('textarea');c.rows=3;c.value=f.input??''}
 else{c=E('input');c.type='text';c.value=f.input??'';if(f.type==='ref'){const id='cd-dl-'+f.target;c.setAttribute('list',id);ensureList(f.target,id)}}
 c.className='cd-value';c.setAttribute('aria-label','Nuovo valore · '+f.label);
 c.addEventListener('input',()=>{f.input=c.value;refresh(true)});c.addEventListener('change',()=>{f.input=c.value;refresh(true)});
 return c;
}
// Stages by title (the value the dictation core reads), with the pipeline name when there are several.
function stageOptions(){const r=ctx.rows;const procs=(r.processes||[]).filter(p=>p.kind==='opportunity');return procs.flatMap(p=>(r.stages||[]).filter(s=>s.process_id===p.id).sort((x,y)=>x.position-y.position).map(s=>[s.title,s.title+(procs.length>1?' · '+p.title:'')]))}
function ensureList(target,id){if(document.getElementById(id))return;const dl=E('datalist');dl.id=id;for(const r of ctx.rows[target]||[]){const o=E('option');o.value=r.name||r.title||'';dl.append(o)}ui.review.append(dl)}
function fieldRow(card,f,idx){
 const row=E('div',undefined,'cd-field');const id='cd-f-'+idx;
 const box=E('input');box.type='checkbox';box.id=id;box.checked=!!f.checked;
 const lab=E('label',f.label,'cd-label');lab.htmlFor=id;
 const old=E('span',f.old||'—','cd-old'+(f.overwrite?' cd-old-over':''));old.title='Valore attuale';
 const arrow=E('span','→','cd-arrow');arrow.setAttribute('aria-hidden','true');
 const info=E('p','','cd-info');
 const spec=()=>core.specs(card.entity,ctx,card.action).find(s=>s.key===f.key);
 const refresh=edited=>{info.replaceChildren();const sp=spec();let r={};if(sp)r=core.check(card.entity,sp,f.input,{...ctx,created:pendingNames()},{current:card.target?(sp.custom?card.target.custom?.[sp.custom]:card.target[sp.key]):null});
  f.error=r.error||'';if(edited){f.warn=r.warn||'';f.note=r.note||(f.derived?f.note:'')}
  if(f.error){box.checked=false;f.checked=false}
  if(f.error)info.append(E('span','✕ '+f.error,'cd-err'));else{if(f.overwrite)info.append(E('span','⚠ Sostituisce «'+f.old+'».','cd-warn'));if(f.warn&&f.warn.indexOf('Sostituisce')!==0)info.append(E('span','⚠ '+f.warn,'cd-warn'));if(f.note)info.append(E('span',f.note,'cd-note-i'))}
  if(r.show&&!f.error&&r.show!==f.input&&f.type!=='select'&&f.type!=='stage')info.append(E('span','Sarà salvato: '+r.show,'cd-note-i'));
  row.classList.toggle('cd-off',!box.checked);count()};
 box.addEventListener('change',()=>{f.checked=box.checked;if(box.checked&&f.error){box.checked=false;f.checked=false}row.classList.toggle('cd-off',!box.checked);count()});
 const val=E('div',undefined,'cd-val');val.append(old,arrow,control(card,f,refresh));
 const top=E('div',undefined,'cd-top');top.append(box,lab);
 row.append(top,val,info);refresh(false);return row;
}
function pendingNames(){return (cards||[]).filter(c=>c.action==='create').map(c=>({entity:c.entity,name:(c.fields.find(f=>f.key===(c.entity==='companies'||c.entity==='contacts'?'name':'title'))||{}).input||''})).filter(x=>x.name)}
function count(){if(!ui.save)return;const n=(cards||[]).reduce((s,c)=>s+(c.error?0:c.fields.filter(f=>f.checked).length),0);ui.save.disabled=!n||!!app().state.busy;ui.count.textContent=n?n+(n===1?' campo spuntato':' campi spuntati'):'Nessun campo spuntato'}
function renderReview(){
 ui.review.replaceChildren();let idx=0;
 const a=app();
 for(const card of cards){
  const sec=E('section',undefined,'cd-card');sec.append(E('h3',card.title));
  if(card.notice)sec.append(E('p',card.notice,'cd-notice'));
  if(card.error)sec.append(E('p',card.error,'cd-err-box'));
  if(!fixed&&!a.writable(card.entity))sec.append(E('p','Sola lettura: il tuo ruolo non può salvare '+core.TYPE_NAME[card.entity].toLowerCase()+'.','cd-err-box'));
  if(!card.fields.length)sec.append(E('p','Nessun campo nuovo da salvare.','muted'));
  for(const f of card.fields)sec.append(fieldRow(card,f,idx++));
  if(card.ignored.length)sec.append(E('p','Ignorati (non sono campi del CRM): '+card.ignored.join(', ')+'.','cd-ignored'));
  ui.review.append(sec);
 }
 const bar=E('div',undefined,'actions cd-save-bar');
 ui.save=B(fixed?'Inserisci nel modulo':'Salva',fixed?fill:save,'primary cd-save');ui.count=E('span','','cd-count');
 bar.append(ui.save,ui.count);
 bar.append(E('p',fixed?'I valori spuntati vanno nel modulo aperto: si salvano con il suo «Conferma e salva».':'Si salvano solo i campi spuntati, con gli stessi comandi dei moduli.','cd-foot'));
 ui.review.append(bar);count();
}

/* ---------- save ---------- */
// The Customer360 a saved record opens: itself, or (an activity) its contact, company or deal.
function subjectOf(entity,rec){if(SUBJECT[entity])return [entity,rec];
 for(const [k,e] of [['contact_id','contacts'],['company_id','companies'],['opportunity_id','opportunities']])if(rec[k]){const r=app().rows(e).find(x=>x.id===rec[k]);return [e,r||{id:rec[k],name:core.TYPE_NAME[e]}]}
 return null}
async function save(){
 const a=app();if(a.state.busy||!cards)return;
 const todo=cards.filter(c=>!c.error&&c.fields.some(f=>f.checked));
 if(!todo.length){say('Nessun campo spuntato.','err');return}
 for(const c of todo)if(!a.writable(c.entity)){say('Il tuo ruolo non può salvare '+core.TYPE_NAME[c.entity].toLowerCase()+'.','err');return}
 // Dry run first: a mistake in the last card must not leave the first ones saved alone.
 const fake=[];for(const c of todo){const p=core.plan(c,{...ctx,created:fake});if(p.error){say(core.TYPE_NAME[c.entity]+': '+p.error,'err');return}if(p.action==='create')fake.push({entity:p.entity,name:p.data.name||p.data.title,id:'00000000-0000-4000-8000-000000000000'})}
 const n=todo.reduce((s,c)=>s+c.fields.filter(f=>f.checked).length,0);
 if(!window.confirm('Salvare '+n+(n===1?' campo':' campi')+' ('+todo.map(c=>c.title).join('; ')+') nel workspace corrente?'))return;
 a.lock(true);a.error('');a.notice('Salvataggio sul server…');
 const created=[],done=[];let fail=null;
 try{
  for(const c of todo){
   const p=core.plan(c,{...ctx,created});if(p.error){fail=core.TYPE_NAME[c.entity]+': '+p.error;break}
   const r=await a.api(p.entity,{body:{workspace:a.state.workspace,entity:p.entity,action:p.action,data:p.data}});
   const saved=(r&&r.rows&&r.rows[0])||{...(c.target||{}),...p.data};
   if(p.action==='create')created.push({entity:p.entity,name:p.data.name||p.data.title,id:saved.id});
   done.push({label:p.label,entity:p.entity,record:saved});
  }
 }catch(e){fail=e.message||String(e)}
 finally{a.lock(false)}
 cards=null;ui.review.replaceChildren();
 await a.refresh(false);
 showResult(done,fail);sync();
}
function showResult(done,fail){
 const a=app();ui.result.replaceChildren();
 if(done.length){const box=E('div',undefined,'cd-done');box.append(E('h3','Salvato'));const ul=E('ul');
  for(const d of done){const li=E('li');li.append(E('span','✓ '+d.label+' '));const s=subjectOf(d.entity,d.record);
   if(s&&s[1].id&&a.openCustomer){const name=s[1].name||s[1].title||d.record.name||d.record.title||'';li.append(B('Apri la scheda',()=>{dlg.close();a.openCustomer(s[0],{...s[1],name:s[1].name||name})},'cd-link'))}
   ul.append(li)}
  box.append(ul);ui.result.append(box)}
 if(fail)ui.result.append(E('p','Non salvato: '+fail+(done.length?' Quello elencato sopra è già salvato: non ripeterlo.':''),'cd-err-box'));
 say(fail?'':'Fatto. Puoi dettare un’altra nota.',fail?'err':'ok');
 a.notice(done.length?done.map(d=>d.label).join(' · ')+'.':'Nulla salvato.');
}

/* ---------- open form ---------- */
function fill(){
 const card=cards&&cards[0],form=fixed&&fixed.form;if(!card||!form){say('Il modulo non è più aperto.','err');return}
 if(card.error){say(card.error,'err');return}
 const v=core.formValues(card,ctx);if(v.error){say(v.error,'err');return}
 const set=(name,value)=>{const c=form.elements[name];if(!c||c.disabled)return false;
  if(c.tagName==='SELECT'&&value&&![...c.options].some(o=>o.value===value))return false;
  c.value=value;c.dispatchEvent(new Event('input',{bubbles:true}));c.dispatchEvent(new Event('change',{bubbles:true}));return true};
 const done=[],skipped=[];const label=k=>(card.fields.find(f=>f.key===k||(k==='process_id'&&f.key==='stage_id'))||{}).label||k;
 const entries=Object.entries(v.values);const order=entries.sort(([a],[b])=>(a==='process_id'?-1:b==='process_id'?1:0));
 for(const [k,val] of order){if(set(k,val)){if(k!=='process_id')done.push(label(k))}else skipped.push(label(k))}
 form.querySelector('.cd-filled')?.remove();
 const p=E('p',(done.length?'Dalla dettatura: '+done.join(', ')+'. Controlla e premi «Conferma e salva».':'')+(skipped.length?' Non inseriti (campo non disponibile nel modulo): '+skipped.join(', ')+'.':''),'cd-filled');p.setAttribute('role','status');
 const bar=form.querySelector('.cd-editor-bar');if(bar)bar.after(p);else form.prepend(p);
 dlg.close();(form.elements[order.find(([k])=>k!=='process_id')?.[0]]||form.querySelector('input'))?.focus?.();
}
// Record form (sales.js openEditor): a «Detta i campi» bar on top of the fields.
function editor(entity,row,fields){
 if(!core.ENTITIES.includes(entity)||!fields)return false;
 const form=fields.closest('form');const bar=E('div',undefined,'cd-editor-bar');
 bar.append(B('🎙 Detta i campi',()=>open({entity,row,form}),'cd-editor-btn'),E('small','Parla o scrivi: l’AI propone i campi, tu scegli cosa inserire.','cd-editor-hint'));
 fields.prepend(bar);return true;
}
window.RadixCrmDictation={open,editor,available:()=>!!app()};
})();
