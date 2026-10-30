/* RADIX Meeting page (meeting.html): record → transcribe → proposals → «Crea in RADIX».
   Rules in lib/meeting-core.js, audio and local archive in lib/meeting-recorder.js, PM rules in lib/pm-demo.js,
   registry in lib/radix-workspace-client.js, the analyst through lib/radix-agent-runtime.js. Paid calls (transcription,
   analysis) start only from a button and after the RadixConfirm with the estimated cost. */
(function(){
'use strict';
const core=window.RadixMeeting,rec=window.RadixMeetingRecorder,ws=window.RadixWorkspace,pm=window.RadixPM,agents=window.RadixAgents,confirmBox=window.RadixConfirm;
const $=id=>document.getElementById(id);
const E=(t,x,c)=>{const n=document.createElement(t);if(x!=null)n.textContent=x;if(c)n.className=c;return n};
const today=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)};
const itDate=d=>d?d.split('-').reverse().join('/'):'';
let user=null,projects=[],current=null,recorder=null,busy=false,tick=null,support=rec.support(),phoneReady=null,calling=null,fromCrm=null;

function say(id,text,tone){const el=$(id);el.textContent=text||'';el.classList.toggle('is-warn',tone==='warn');el.classList.toggle('is-ok',tone==='ok')}
// Live waveform: the last 40 levels as bars (the recorder gives one level every few frames).
const WAVE=40,levels=[];
function wave(v){const box=$('mt-wave');if(!box)return;
 if(!box.children.length)for(let i=0;i<WAVE;i++)box.append(E('i'));
 if(v==null)levels.length=0;else{levels.push(Math.max(0,Math.min(1,v)));if(levels.length>WAVE)levels.shift()}
 const pad=WAVE-levels.length;[...box.children].forEach((b,i)=>b.style.setProperty('--h',i<pad?0:levels[i-pad]))}
// The 1-2-3 strip at the top follows the open meeting.
function step(){const m=current,s=!m?'record':m.status==='saved'?'done':m.proposal?'confirm':['recorded','transcribing','transcribed','analysed'].includes(m.status)?'analyse':'record';
 document.body.dataset.mtStep=s;const order=['record','analyse','confirm'],at=s==='done'?3:order.indexOf(s);
 document.querySelectorAll('#mt-steps li').forEach((li,i)=>{li.classList.toggle('is-done',i<at);li.classList.toggle('is-now',i===at);if(i===at)li.setAttribute('aria-current','step');else li.removeAttribute('aria-current')})}
function clock(s){s=Math.max(0,Math.floor(s));const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return (h?h+':'+String(m).padStart(2,'0'):String(m).padStart(2,'0'))+':'+String(x).padStart(2,'0')}
const source=()=>(document.querySelector('input[name="mt-source"]:checked')||{}).value||'room';

// ---- install as an app ----
let installEvent=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvent=e;$('mt-install').hidden=false;$('mt-install-btn').hidden=false});
$('mt-install-btn').onclick=async()=>{if(!installEvent)return;installEvent.prompt();try{await installEvent.userChoice}catch(e){}installEvent=null;$('mt-install').hidden=true};
(function(){const standalone=window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches||navigator.standalone;
 if(!standalone&&/iPhone|iPad|iPod/i.test(navigator.userAgent)){$('mt-install').hidden=false;$('mt-install-text').textContent='Per averla come app: tocca Condividi e poi «Aggiungi alla schermata Home».'}})();

// ---- new meeting ----
function refreshForm(){
 const s=source(),recording=!!recorder&&recorder.state!=='stopped';
 $('mt-hint-call').hidden=s!=='call';$('mt-hint-mobile').hidden=!support.mobile||s==='file'||s==='phone';
 $('mt-recorder').hidden=(s==='file'||s==='phone')&&!recording;$('mt-file-box').hidden=s!=='file'||recording;$('mt-phone-box').hidden=s!=='phone'||recording;
 // Recording needs only the consent: the audio stays on the device. Transcribing needs the RADIX session.
 const ok=$('mt-consent').checked&&!busy;
 $('mt-rec').disabled=!ok||!support.record||recording;$('mt-file').disabled=!ok;
 $('mt-call').disabled=!ok||!user||phoneReady!==true||!!calling;
 if(s==='phone'&&phoneReady===false)say('mt-rec-status','Telefonate da attivare: servono le chiavi Twilio su Vercel (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_NUMBER).','warn');
 if(!support.record&&s!=='file')say('mt-rec-status','Questo browser non registra audio: usa Chrome, Edge o Safari aggiornati, oppure carica un file.','warn');
}
function setupSources(){
 const call=$('mt-source-call'),input=call.querySelector('input');
 if(!support.call){input.disabled=true;call.classList.add('is-off');call.querySelector('small').textContent=support.mobile?'Solo dal computer: il telefono non dà l’audio delle chiamate.':'Questo browser non condivide l’audio delle schede: usa Chrome o Edge.'}
 document.querySelectorAll('input[name="mt-source"]').forEach(r=>r.onchange=refreshForm);$('mt-consent').onchange=refreshForm;
}
function newMeeting(){return {id:rec.newId(),title:$('mt-title').value.trim(),date:$('mt-date').value||today(),projectId:$('mt-project').value,source:source(),createdAt:new Date().toISOString(),consent:true,segments:[],seconds:0,status:'recording',by:user?String(user.name||user.email||''):'',crm:fromCrm&&fromCrm.crm||null}}

$('mt-rec').onclick=async()=>{
 if(!$('mt-consent').checked)return;
 const m=newMeeting();busy=true;refreshForm();say('mt-rec-status',m.source==='call'?'Scegli la scheda della call e spunta «Condividi audio».':'Consenti l’uso del microfono…');
 recorder=rec.createRecorder({source:m.source,meeting:m,
  onLevel:v=>{$('mt-level').style.setProperty('--lv',v);wave(v)},
  onState:s=>{$('mt-time').textContent=clock(s.seconds);if(s.state==='recording')say('mt-rec-status','Registrazione in corso · salvata su questo dispositivo ogni pochi secondi'+(s.segments>1?' · parte '+s.segments:'')+'.','ok');if(s.state==='paused')say('mt-rec-status','In pausa.');if(s.state==='stopped')finishRecording(m)},
  onError:err=>say('mt-rec-status','Attenzione: '+(err&&err.message||err),'warn')});
 try{await recorder.start();$('mt-rec').classList.add('is-on');$('mt-rec-label').textContent='REC';$('mt-pause').hidden=false;$('mt-stop').hidden=false;
  tick=setInterval(()=>{if(recorder&&recorder.state==='recording')$('mt-time').textContent=clock(recorder.seconds())},500)}
 catch(err){recorder=null;say('mt-rec-status',(err&&err.name==='NotAllowedError')?'Accesso al microfono negato: consentilo nelle impostazioni del browser e riprova.':(err&&err.message||'Registrazione non avviata.'),'warn')}
 finally{busy=false;refreshForm()}
};
$('mt-pause').onclick=()=>{if(!recorder)return;if(recorder.state==='recording'){recorder.pause();$('mt-pause').textContent='Riprendi';$('mt-rec').classList.remove('is-on')}else if(recorder.state==='paused'){recorder.resume();$('mt-pause').textContent='Pausa';$('mt-rec').classList.add('is-on')}};
$('mt-stop').onclick=async()=>{if(!recorder)return;$('mt-stop').disabled=true;say('mt-rec-status','Chiudo la registrazione…');
 try{await recorder.stop()}catch(err){say('mt-rec-status','Errore alla chiusura: '+err.message,'warn')}finally{$('mt-stop').disabled=false}};
function resetRecorder(){clearInterval(tick);tick=null;recorder=null;$('mt-rec').classList.remove('is-on');$('mt-rec-label').textContent='Registra';$('mt-pause').hidden=true;$('mt-pause').textContent='Pausa';$('mt-stop').hidden=true;$('mt-time').textContent='00:00';$('mt-level').style.setProperty('--lv',0);wave(null);refreshForm()}
// Also when the browser bar «Interrompi condivisione» ends the call audio: the recorder stops itself and says so.
function finishRecording(m){if(!recorder)return;resetRecorder();
 if(!m.segments.length){say('mt-rec-status','Nessun audio registrato.','warn');rec.store.remove(m.id);return}
 say('mt-rec-status','Registrati '+core.duration(m.seconds)+'. Ora puoi trascriverla.','ok');$('mt-title').value='';renderPast();openMeeting(m.id)}

$('mt-file').onchange=async e=>{const file=e.target.files&&e.target.files[0];if(!file)return;
 const m=newMeeting();m.source='file';m.fileName=file.name.slice(0,120);if(!m.title)m.title=file.name.replace(/\.[^.]+$/,'').slice(0,120);
 busy=true;refreshForm();
 try{await rec.store.put(m);await rec.fromFile(file,m,t=>say('mt-rec-status',t));say('mt-rec-status','File pronto: '+core.duration(m.seconds)+'.','ok');renderPast();openMeeting(m.id)}
 catch(err){await rec.store.remove(m.id).catch(()=>{});say('mt-rec-status','File non usabile: '+err.message,'warn')}
 finally{busy=false;e.target.value='';refreshForm()}};

// ---- one meeting ----
async function openMeeting(id){current=await rec.store.get(id);if(!current)return;render();renderPast();$('mt-work').hidden=false;$('mt-work').scrollIntoView({behavior:'smooth',block:'start'})}
$('mt-close').onclick=()=>{current=null;$('mt-work').hidden=true;step()};
function untranscribed(m){return (m.segments||[]).filter(s=>!s.text&&!s.empty)}

// ---- phone calls through the RADIX number (api/_twilio_call.js) ----
const ME_KEY='radix.meeting.me';
try{$('mt-me').value=localStorage.getItem(ME_KEY)||''}catch(e){}
$('mt-me').oninput=()=>{try{localStorage.setItem(ME_KEY,$('mt-me').value.trim())}catch(e){}};
const perMin=core.callEstimate(1);
$('mt-call-cost').textContent='Circa '+perMin.perMinute.toFixed(2).replace('.',',')+' € al minuto di telefonata, più la trascrizione.';
async function callApi(method,body,query){const res=await fetch('/api/integrations/call'+(query?'?'+new URLSearchParams(query):''),{method,credentials:'same-origin',cache:'no-store',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
 let data={};try{data=await res.json()}catch(e){}if(res.status===401)throw Error('sessione scaduta: accedi di nuovo a RADIX');if(!res.ok){const e=Error(data.error||'telefonata non disponibile ('+res.status+')');e.status=res.status;throw e}return data}
$('mt-call').onclick=async()=>{const to=$('mt-to').value.trim(),me=$('mt-me').value.trim();
 if(!to||!me){say('mt-rec-status','Scrivi il numero da chiamare e il tuo cellulare.','warn');(to?$('mt-me'):$('mt-to')).focus();return}
 const ok=await confirmBox.ask({title:'Chiamare '+to+' da RADIX?',facts:[['Squilla prima','il tuo cellulare '+me],['Costo della telefonata','circa '+perMin.perMinute.toFixed(2).replace('.',',')+' € al minuto'],['Trascrizione','dopo, con la sua conferma']],message:'RADIX ti chiama dal suo numero; quando rispondi collega l’altra persona, che sente l’avviso di registrazione.',ok:'Sì, chiama'});
 if(!ok)return;
 const m=newMeeting();m.source='phone';m.to=to;if(m.crm&&to.replace(/\D/g,'')!==fromCrm.to.replace(/\D/g,''))m.crm=null;m.status='calling';if(!m.title)m.title='Telefonata con '+to;
 busy=true;refreshForm();say('mt-rec-status','Avvio la chiamata…');
 try{const r=await callApi('POST',{action:'start',to,me,confirm:true});m.callSid=r.sid;m.announced=r.announced;await rec.store.put(m);
  say('mt-rec-status','Squilla il tuo cellulare: rispondi e RADIX collega '+to+'.'+(r.announced?'':' Ricordati di dire che registri.'),'ok');renderPast();watchCall(m)}
 catch(err){say('mt-rec-status','Chiamata non partita: '+err.message,'warn')}
 finally{busy=false;refreshForm()}};
const CALL_STATES={queued:'In partenza…',ringing:'Squilla il tuo cellulare…','in-progress':'Telefonata in corso: registrazione attiva.',completed:'Telefonata finita: preparo la registrazione…',busy:'Occupato.','no-answer':'Nessuna risposta.',failed:'Chiamata non riuscita.',canceled:'Chiamata annullata.'};
async function watchCall(m){if(calling&&calling.id===m.id)return;calling=m;refreshForm();let tries=0;
 while(calling===m&&tries++<2400){
  let st;try{st=await callApi('GET',null,{sid:m.callSid})}catch(e){if(e.status&&e.status<500){say('mt-rec-status','Stato della chiamata non leggibile: '+e.message,'warn');break}await new Promise(r=>setTimeout(r,5000));continue}
  say('mt-rec-status',CALL_STATES[st.status]||st.status,'ok');
  if(['busy','no-answer','failed','canceled'].includes(st.status)||(st.status==='completed'&&!st.recording&&!st.processing&&tries>20)){m.status='empty';await rec.store.put(m);say('mt-rec-status',(CALL_STATES[st.status]||'')+' Nessuna registrazione.','warn');break}
  if(st.status==='completed'&&st.recording){m.seconds=st.recording.seconds;m.segments=[{n:0,mime:'audio/mpeg',bytes:1,seconds:st.recording.seconds,text:'',remote:true}];m.status='recorded';await rec.store.put(m);
   say('mt-rec-status','Telefonata registrata: '+core.duration(m.seconds)+'. Ora puoi trascriverla.','ok');calling=null;refreshForm();renderPast();openMeeting(m.id);return}
  await new Promise(r=>setTimeout(r,3000))}
 if(calling===m)calling=null;refreshForm();renderPast()}
function render(){const m=current;step();if(!m)return;
 $('mt-work-h').textContent=m.title||'Meeting senza titolo';
 $('mt-work-meta').textContent=itDate(m.date)+' · '+core.duration(m.seconds)+' · '+({call:'call online',file:'file audio',phone:'telefonata'+(m.to?' con '+m.to:'')}[m.source]||'di persona')+(m.status==='saved'&&m.saved?' · salvato in «'+m.saved.projectName+'»':'');
 const todo=untranscribed(m),text=core.transcript(m.segments);
 $('mt-go').hidden=m.status==='saved';
 $('mt-go').textContent=todo.length?'Trascrivi e analizza':m.proposal?'Rifai l’analisi':'Analizza';
 const est=core.estimate(todo.reduce((a,s)=>a+s.seconds,0),{transcriptChars:text.length||undefined});
 $('mt-cost').textContent=m.status==='saved'?'':todo.length?'Costo stimato '+est.text.total:'Costo stimato '+est.text.analysis;
 $('mt-transcript-box').hidden=!text;$('mt-transcript').textContent=text;
 $('mt-proposal').hidden=!m.proposal||m.status==='saved';
 if(m.proposal&&m.status!=='saved')renderProposal(m.proposal);
 const r=$('mt-result');r.hidden=!(m.status==='saved'&&m.saved);r.replaceChildren();
 if(m.status==='saved'&&m.saved){const p=E('p');p.append('Fatto: '+m.saved.summary+' ');const a=E('a','Apri nel Project Manager');a.href='/radix-pm-concept.html?project='+encodeURIComponent(m.saved.projectId);p.append(a);r.append(p);
  // The PM's «Progetto da brief o da meeting» breaks the archived meeting down into tasks for people, agents and tools.
  const b=E('a','Scomponi nel Project Manager','mt-btn mt-primary mt-brief');b.href='/radix-pm-concept.html?brief=meeting&from='+encodeURIComponent(m.saved.projectId)+'&meeting='+encodeURIComponent(m.id);r.append(b);
  if(m.saved.note)r.append(E('p',m.saved.note,'mt-muted'));
  const row=E('div',null,'mt-row'),c=E('button','Copia il verbale','mt-btn'),d=E('button','Scarica il verbale','mt-btn');c.type=d.type='button';c.onclick=copyMinutes;d.onclick=downloadMinutes;row.append(c,d);r.append(row)}
}
function check(item,on){const c=E('input');c.type='checkbox';c.checked=item.selected!==false;c.onchange=()=>{item.selected=c.checked;save()};if(on)c.setAttribute('aria-label',on);return c}
function renderProposal(p){
 $('mt-summary').value=p.summary||'';$('mt-summary').oninput=()=>{p.summary=$('mt-summary').value;save()};
 const dec=$('mt-decisions');dec.replaceChildren();(p.decisions||[]).forEach(d=>dec.append(E('li',d,'mt-item')));if(!(p.decisions||[]).length)dec.append(E('li','Nessuna decisione presa.','mt-muted'));
 $('mt-memory-box').hidden=!(p.decisions||[]).length;
 const crm=current&&current.crm;$('mt-crm-box').hidden=!crm||!!current.crmSaved;if(crm)$('mt-crm-name').textContent=crm.name||'questo cliente';
 const list=$('mt-tasks');list.replaceChildren();$('mt-tasks-empty').hidden=!!(p.tasks||[]).length;
 (p.tasks||[]).forEach((t,i)=>{const li=E('li',null,'mt-item'),box=E('div',null,'mt-task');
  const title=E('input');title.value=t.title;title.maxLength=120;title.setAttribute('aria-label','Attività '+(i+1));title.oninput=()=>{t.title=title.value;save()};
  const meta=E('div',null,'mt-task-meta');const owner=E('input');owner.value=t.owner;owner.placeholder='Responsabile';owner.maxLength=80;owner.setAttribute('aria-label','Responsabile');owner.oninput=()=>{t.owner=owner.value;save()};
  const due=E('input');due.type='date';due.value=t.due;due.setAttribute('aria-label','Scadenza');due.oninput=()=>{t.due=due.value;save()};
  const ms=E('label'),mc=E('input');mc.type='checkbox';mc.checked=t.milestone;mc.onchange=()=>{t.milestone=mc.checked;save()};ms.append(mc,'Scadenza importante');
  meta.append(owner,due,ms);box.append(title,meta);if(t.details)box.append(E('small',t.details,'mt-muted'));if(!t.due)box.append(E('small','Data non detta: se la lasci vuota la metto tra 7 giorni, da confermare.','mt-muted'));
  li.append(check(t,'Crea questa attività'),box);list.append(li)});
 const up=$('mt-updates');up.replaceChildren();$('mt-updates-box').hidden=!(p.updates||[]).length;
 (p.updates||[]).forEach(u=>{const li=E('li',null,'mt-item'),box=E('div',null,'mt-task');box.append(E('b',u.title));
  box.append(E('small',[u.due?'nuova scadenza '+itDate(u.due):'',u.status?'stato → '+u.status:'',u.note].filter(Boolean).join(' · '),'mt-muted'));li.append(check(u,'Applica questo aggiornamento'),box);up.append(li)});
 const q=$('mt-questions');q.replaceChildren();$('mt-questions-box').hidden=!(p.questions||[]).length;(p.questions||[]).forEach(x=>q.append(E('li',x,'mt-item')));
 renderTarget(p);
}
function renderTarget(p){const sel=$('mt-target');sel.replaceChildren();
 const chosen=current.projectId&&projects.find(x=>x.id===current.projectId),guess=chosen||core.matchProject(projects,p.project&&p.project.existing);
 projects.forEach(x=>{const o=E('option',x.name);o.value=x.id;sel.append(o)});
 const n=E('option','+ Nuovo progetto');n.value='__new';sel.append(n);
 sel.value=current.target||(guess?guess.id:'__new');
 $('mt-newname').value=current.newName||(p.project&&p.project.new)||p.title||current.title||'';
 const sync=()=>{current.target=sel.value;$('mt-newname-box').hidden=sel.value!=='__new';save()};sel.onchange=sync;$('mt-newname').oninput=()=>{current.newName=$('mt-newname').value;save()};
 $('mt-newname-box').hidden=sel.value!=='__new';
}
let saveTimer=null;function save(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{if(current)rec.store.put(current).catch(()=>{})},300)}

// ---- transcription and analysis (paid, after the confirmation) ----
async function postSegment(m,seg){const blob=await rec.store.audio(m.id,seg.n);if(!blob)throw Error('audio della parte '+(seg.n+1)+' non trovato su questo dispositivo');
 const audio=await rec.base64(blob);
 const res=await fetch('/api/integrations/transcribe',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({confirm:true,audio,mime:seg.mime||blob.type,language:'it',n:seg.n,prompt:core.contextFor(m.segments,seg.n)})});
 let data={};try{data=await res.json()}catch(e){}
 if(res.status===401)throw Error('sessione scaduta: accedi di nuovo a RADIX');
 if(!res.ok)throw Error(data.error||'trascrizione non riuscita ('+res.status+')');
 return String(data.text||'')}
async function planOf(projectId){if(!projectId)return null;try{const d=await ws.documents.load(projectId,'pm');return d&&d.data?pm.validateState(d.data):null}catch(e){return null}}
$('mt-go').onclick=async()=>{const m=current;if(!m||busy)return;
 if(!user){say('mt-work-status','Accedi a RADIX per trascrivere: l’audio resta qui intanto.','warn');return}
 const todo=untranscribed(m),text=core.transcript(m.segments);
 const est=core.estimate(todo.reduce((a,s)=>a+s.seconds,0),{transcriptChars:text.length||undefined});
 const facts=[['Durata',core.duration(m.seconds)]];if(todo.length)facts.push(['Trascrizione (OpenAI)',est.text.transcribe]);facts.push(['Analisi (agente RADIX)',est.text.analysis]);
 const ok=await confirmBox.ask({title:todo.length?'Trascrivere e analizzare il meeting?':'Analizzare di nuovo il meeting?',facts,cost:'Totale stimato: '+(todo.length?est.text.total:est.text.analysis),message:'L’audio va a OpenAI solo per la trascrizione e non viene conservato sul server. Niente viene creato in RADIX finché non premi «Crea in RADIX».',ok:todo.length?'Sì, trascrivi':'Sì, analizza'});
 if(!ok)return;
 busy=true;$('mt-go').disabled=true;const bar=$('mt-progress');bar.hidden=false;const set=v=>bar.firstElementChild.style.setProperty('--p',v);set(0);
 try{
  for(let i=0;i<todo.length;i++){const seg=todo[i];say('mt-work-status','Trascrivo la parte '+(i+1)+' di '+todo.length+'…');
   if(seg.remote){const r=await callApi('POST',{action:'transcribe',sid:m.callSid,confirm:true,language:'it'});seg.text=r.text;seg.seconds=r.seconds||seg.seconds;m.recordingDeleted=!!r.deleted}
   else seg.text=await postSegment(m,seg);
   if(!seg.text)seg.empty=true;m.status='transcribing';await rec.store.put(m);set((i+1)/(todo.length+1));render()}
  const full=core.transcript(m.segments);if(!full.trim())throw Error('nella registrazione non si sente parlare nessuno');
  m.status='transcribed';await rec.store.put(m);
  say('mt-work-status','L’agente legge la riunione e prepara le proposte…');
  const state=await planOf(m.projectId),chosen=projects.find(x=>x.id===m.projectId);
  const r=await agents.reply({role:'meeting-analyst',memoryScope:m.projectId?{projectId:m.projectId,agentId:'meeting-analyst'}:undefined,messages:[{role:'user',content:core.prompt({title:m.title,date:m.date,today:today(),text:full,project:chosen&&chosen.name,state,projects:projects.map(x=>x.name)})}]});
  const proposal=core.parse(r.text,{state,today:today()});if(!proposal)throw Error('risposta dell’agente non leggibile: premi di nuovo «Analizza»');
  if(!m.title&&proposal.title)m.title=proposal.title;
  m.proposal=proposal;m.status='analysed';m.target='';await rec.store.put(m);set(1);
  say('mt-work-status','Controlla le proposte, togli la spunta a quello che non serve e premi «Crea in RADIX».','ok');render();renderPast()}
 catch(err){say('mt-work-status','Interrotto: '+err.message+'. Quello già fatto resta salvato: premi di nuovo per continuare.','warn');render()}
 finally{busy=false;$('mt-go').disabled=false;bar.hidden=true}};

// ---- «Crea in RADIX» ----
$('mt-apply').onclick=async()=>{const m=current;if(!m||!m.proposal||busy)return;const p=m.proposal;
 const tasks=p.tasks.filter(t=>t.selected!==false&&String(t.title||'').trim()),updates=(p.updates||[]).filter(u=>u.selected!==false);
 const target=$('mt-target').value,newName=$('mt-newname').value.trim();
 if(target==='__new'&&newName.length<2){say('mt-work-status','Scrivi il nome del nuovo progetto.','warn');$('mt-newname').focus();return}
 busy=true;$('mt-apply').disabled=true;say('mt-work-status','Salvo in RADIX…');
 try{
  let project=projects.find(x=>x.id===target),fresh=false;
  if(!project){project=await ws.projects.create({name:newName,summary:('Dal meeting «'+(m.title||'Meeting')+'» del '+itDate(m.date)+'. '+(p.summary||'')).slice(0,500),kind:'internal'});projects.unshift(project);fresh=true}
  let result=null;
  for(let attempt=0;attempt<2&&!result;attempt++){
   const doc=ws.bind(project.id,'pm');let saved=null;try{saved=fresh?null:await doc.load()}catch(e){saved=null}
   const state=saved?pm.validateState(saved):null;
   const out=core.applyToPm(pm,state,{...p,tasks,updates},{projectName:project.name,today:today(),meetingTitle:m.title,meetingDate:m.date});
   try{await doc.save(out.state);result=out}catch(err){if(!(err instanceof ws.ConflictError)||attempt)throw err}}
  const notes=[];
  try{const entry=core.record({id:m.id,title:m.title,date:m.date,seconds:m.seconds,source:m.source,text:core.transcript(m.segments),proposal:p,created:result.created,updated:result.updated,by:m.by});
   const arch=await ws.documents.load(project.id,'meetings');await ws.documents.save(project.id,'meetings',core.addToArchive(arch&&arch.data,entry),arch&&arch.revision||0)}
  catch(e){notes.push('Il verbale resta su questo dispositivo: l’archivio meeting del progetto non è ancora attivo ('+e.message+').')}
  if($('mt-memory').checked&&p.decisions.length){try{await ws.memory.propose(core.memoryEntry({projectId:project.id,clientId:project.client_id||'',title:m.title,date:m.date,decisions:p.decisions}))}catch(e){notes.push('Decisioni non proposte alla memoria: '+e.message+'.')}}
  if(m.crm&&!m.crmSaved&&$('mt-crm').checked){const body=core.crmInteraction({crm:m.crm,source:m.source,title:m.title,date:m.date,seconds:m.seconds,summary:p.summary,decisions:p.decisions,tasks,questions:p.questions,occurredAt:m.createdAt});
   try{const r=await fetch('/api/sales',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-radix-sales':'1'},body:JSON.stringify(body)});
    if(!r.ok){let msg='errore '+r.status;try{msg=(await r.json()).error||msg}catch(e){}throw new Error(msg)}m.crmSaved=true}
   catch(e){notes.push('Telefonata non salvata nello storico CRM: '+e.message+'.')}}
  if(result.skipped.length)notes.push('Non applicate: '+result.skipped.map(s=>s.title+' ('+s.reason+')').join('; ')+'.');
  const parts=[];if(result.created.length)parts.push(result.created.length+(result.created.length===1?' attività creata':' attività create'));if(result.updated.length)parts.push(result.updated.length+(result.updated.length===1?' aggiornata':' aggiornate'));
  m.saved={projectId:project.id,projectName:project.name,summary:(parts.join(', ')||'verbale salvato')+' in «'+project.name+'»'+(m.crmSaved?'; salvato anche nello storico CRM di '+(m.crm.name||'cliente'):'')+'.',note:notes.join(' '),created:result.created,updated:result.updated,at:new Date().toISOString()};
  m.status='saved';await rec.store.put(m);
  try{await rec.store.dropAudio(m)}catch(e){}
  say('mt-work-status','Salvato.','ok');render();renderPast()}
 catch(err){say('mt-work-status','Non salvato: '+err.message,'warn')}
 finally{busy=false;$('mt-apply').disabled=false}};

function minutesText(){const m=current,p=m.proposal||{};return core.minutes({title:m.title,date:m.date,seconds:m.seconds,participants:p.participants,summary:p.summary,decisions:p.decisions,tasks:(p.tasks||[]).filter(t=>t.selected!==false),updates:(p.updates||[]).filter(u=>u.selected!==false),questions:p.questions,transcript:core.transcript(m.segments)})}
async function copyMinutes(){try{await navigator.clipboard.writeText(minutesText());say('mt-work-status','Verbale copiato.','ok')}catch(e){say('mt-work-status','Copia non riuscita: usa «Scarica il verbale».','warn')}}
function downloadMinutes(){const blob=new Blob([minutesText()],{type:'text/plain;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=('verbale-'+(current.date||today())+'-'+(current.title||'meeting')).toLowerCase().replace(/[^a-z0-9àèéìòù-]+/gi,'-').slice(0,80)+'.txt';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000)}
$('mt-copy').onclick=copyMinutes;$('mt-download').onclick=downloadMinutes;
$('mt-delete').onclick=async()=>{const m=current;if(!m)return;
 const ok=await confirmBox.ask({title:'Eliminare il meeting da questo dispositivo?',message:m.status==='saved'?'Attività e verbale già salvati in RADIX restano.':'Audio e trascrizione non ancora salvati in RADIX vanno persi.',ok:'Elimina',tone:'danger'});
 if(!ok)return;await rec.store.remove(m.id);current=null;$('mt-work').hidden=true;step();renderPast()};

// ---- the device's meetings ----
const LABELS={calling:'Telefonata in corso',recording:'Registrazione interrotta',recorded:'Da trascrivere',transcribing:'Trascrizione a metà',transcribed:'Da analizzare',analysed:'Da confermare',saved:'Salvato in RADIX',empty:'Vuoto'};
async function renderPast(){const box=$('mt-past');let list=[];try{list=await rec.store.list()}catch(e){box.replaceChildren(E('p',e.message,'mt-muted'));return}
 // A recording cut by a crash or a closed tab keeps what was saved: it becomes «Da trascrivere».
 for(const m of list)if(m.status==='recording'&&(!recorder||recorder.state==='stopped')){m.segments=(m.segments||[]).filter(s=>s.bytes>0);m.seconds=m.segments.reduce((a,s)=>a+(s.seconds||0),0);m.status=m.segments.length?'recorded':'empty';m.recovered=true;await rec.store.put(m)}
 box.replaceChildren();if(!list.length){box.append(E('p','Ancora nessun meeting.','mt-muted'));return}
 list.slice(0,50).forEach(m=>{const row=E('div',null,'mt-past'),info=E('div',null,'mt-past-info'),ico=E('span',null,'mt-past-ico');ico.dataset.source=['call','file','phone'].includes(m.source)?m.source:'room';ico.setAttribute('aria-hidden','true');
  if(current&&current.id===m.id)row.classList.add('is-open');
  const pill=E('span',LABELS[m.status]||m.status,'mt-pill');pill.dataset.status=m.status;
  info.append(E('b',m.title||'Meeting senza titolo'),E('small',itDate(m.date)+' · '+core.duration(m.seconds)+(m.recovered?' · recuperato dopo un’interruzione':'')),pill);
  const open=E('button','Apri','mt-btn mt-ghost');open.type='button';open.onclick=()=>openMeeting(m.id);row.append(ico,info,open);box.append(row)})}

// ---- start ----
async function boot(){
 $('mt-date').value=today();setupSources();step();wave(null);
 const pick=new URLSearchParams(location.search).get('source'),radio=pick&&document.querySelector('input[name="mt-source"][value="'+pick.replace(/[^a-z]/g,'')+'"]');if(radio&&!radio.disabled)radio.checked=true;
 refreshForm();renderPast();
 try{user=await ws.ready();if(!user){say('mt-session','Accedi a RADIX per usare Meeting: le attività vanno nel Project Manager del tuo team.','warn');refreshForm();return}
  say('mt-session','');
  projects=(await ws.projects.list()).filter(p=>p.status!=='archived');
  const sel=$('mt-project');projects.forEach(p=>{const o=E('option',p.name);o.value=p.id;sel.append(o)});
  const wanted=new URLSearchParams(location.search).get('project');
  // From the CRM («Chiama da RADIX» on a contact or company): ready to call, and the call goes back in the client's history.
  fromCrm=core.crmFromQuery(location.search);
  if(fromCrm){const r=document.querySelector('input[name="mt-source"][value="phone"]');if(r){r.checked=true}$('mt-to').value=fromCrm.to;if(!$('mt-title').value&&fromCrm.name)$('mt-title').value='Telefonata con '+fromCrm.name;
   if(fromCrm.crm)say('mt-rec-status','Dal CRM: a fine telefonata la salvo anche nello storico di '+(fromCrm.name||'questo cliente')+'.','ok');refreshForm()}if(wanted&&projects.some(p=>p.id===wanted))sel.value=wanted;
  ws.integrations().then(map=>{phoneReady=map?map.twilio===true:false;refreshForm();
   rec.store.list().then(list=>list.filter(x=>x.status==='calling'&&x.callSid).forEach(watchCall)).catch(()=>{});
   if(map&&map.transcribe===false)say('mt-session','La trascrizione non è ancora attiva su questo sito (manca la chiave OpenAI): puoi registrare, trascrivi quando è attiva.','warn')});
 }catch(err){say('mt-session','RADIX non raggiungibile: '+err.message+'. Puoi registrare lo stesso: l’audio resta su questo dispositivo.','warn')}
 refreshForm();
 const wantedMeeting=new URLSearchParams(location.search).get('meeting');if(wantedMeeting)openMeeting(wantedMeeting);
}
boot();
})();
