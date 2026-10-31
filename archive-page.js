/* Archivio v3.7: reads the old shared state (/api/state), shows each agent's saved conversation, the last
   Pipeline post run and the v3.3 project profiles, exports them and copies them into a registry project
   (Agenti AI conversations, profile fields left empty). Nothing in v3.7 changes. */
(function(){
'use strict';
const $=id=>document.getElementById(id),rt=window.RadixAgents,ar=window.RadixV37Archive,ws=window.RadixWorkspace;
const say=t=>{$('status').textContent=t};
// The one RADIX confirmation (lib/radix-confirm.js); the browser confirm only if that script is missing.
const askConfirm=o=>window.RadixConfirm?window.RadixConfirm.ask(o):Promise.resolve(!!window.confirm([o.title,o.cost,o.message].filter(Boolean).join('\n')));
const PIPE='__pipeline',PROF='__profiles';
let state=null,rows=[],current=null,projects=[],run=null,profs=[];
const label=id=>{const a=rt.agent(id);return a?a.name:id};
const FIELD_LABELS={kind:'Tipo',summary:'Descrizione',audience:'Pubblico',positioning:'Posizionamento',voice:'Voce e tono',channels:'Canali',visual:'Identità visiva',links:'Riferimenti',notes:'Note'};
function node(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n}
function entry(id,title,sub){const b=node('button',undefined,'agent');b.type='button';b.setAttribute('aria-current',String(current===id));b.append(node('strong',title),node('small',sub));b.onclick=()=>open(id);return b}
function renderList(){
 const list=[];
 if(run)list.push(entry(PIPE,'🧩 Ultima Pipeline post',run.steps.length+' passi'+(run.task?' · '+run.task.slice(0,60):'')));
 if(profs.length)list.push(entry(PROF,'🗂 Profili progetto',profs.length+(profs.length===1?' profilo':' profili')));
 list.push(...rows.map(r=>entry(r.agentId,r.label,r.count+' messaggi'+(r.flows?' · '+r.flows+' flussi':'')+(r.last?' · '+new Date(r.last).toLocaleDateString('it-IT'):''))));
 $('agents').replaceChildren(...list);if(!list.length)$('agents').append(node('p','Nessun dato salvato nella v3.7.'));
}
function msgEl(who,body,md){const d=node('div',undefined,'msg '+(md?'assistant':'user'));d.append(node('div',who,'meta'));const b=node('div',undefined,'md');if(md)b.innerHTML=rt.renderMarkdown(body,1);else b.textContent=body;d.append(b);return d}
function markdownOf(id){return id===PIPE?ar.pipelineMarkdown(run,label):ar.toMarkdown(label(id),state.history[id])}
function open(id){
 current=id;renderList();$('openAgents').hidden=true;const isProf=id===PROF;
 $('md').disabled=$('word').disabled=isProf;$('import').hidden=isProf;$('import').disabled=!$('project').value;
 if(id===PIPE){
  $('agentName').textContent='Ultima Pipeline post';$('import').textContent='Copia la pipeline';
  $('thread').replaceChildren(...(run.task?[msgEl('Brief',run.task,false)]:[]),...run.steps.map((s,i)=>msgEl('#'+(i+1)+' '+(s.label||label(s.role))+(s.status==='stale'?' · da aggiornare':''),s.output,true)));
  say(run.steps.length+' passi in sola lettura. Copiata in un progetto diventa una Pipeline post modificabile in Agenti AI.');return;
 }
 if(isProf){
  $('agentName').textContent='Profili progetto v3.7';
  $('thread').replaceChildren(...profs.map((p,i)=>{
   const d=node('div',undefined,'msg profile');d.append(node('div',p.name||'Profilo senza nome','meta'));
   const dl=node('dl');Object.keys(FIELD_LABELS).forEach(f=>{const v=String(p[f]||'').trim();if(v)dl.append(node('dt',FIELD_LABELS[f]),node('dd',v))});d.append(dl);
   const b=node('button','Completa il profilo del progetto scelto');b.type='button';b.dataset.profile=i;b.onclick=()=>fillProfile(p,b);d.append(b);return d}));
  say('Scegli un progetto qui sopra: vengono riempiti solo i campi vuoti del suo profilo, nulla di quanto scritto dal team viene sostituito.');return;
 }
 $('import').textContent='Copia la conversazione';
 const msgs=state.history[id]||[];$('agentName').textContent=label(id);
 $('thread').replaceChildren(...msgs.filter(m=>m&&typeof m.content==='string'&&!m.hidden&&!m.pending).map(m=>msgEl((m.role==='user'?(m.by||'Utente'):m.role==='error'?'Errore':label(id))+(m.at?' · '+new Date(m.at).toLocaleString('it-IT'):''),m.role==='user'?(m.display||m.content):m.content,m.role==='assistant')));
 say(rows.find(r=>r.agentId===id).count+' messaggi in sola lettura.');
}
async function saveAgents(pid,merge){
 const doc=ws.bind(pid,'agents');
 for(let i=0;i<3;i++){const cur=(await doc.load())||{};const r=merge(cur.conversations);if(!r.added)return 0;
  try{await doc.save({...cur,schemaVersion:1,conversations:r.conversations,prefs:ar.mergePrefs(cur.prefs,state)});return r.added}catch(e){if(!(e instanceof ws.ConflictError)||i===2)throw e}}
 return 0;
}
async function copyToProject(){
 const pid=$('project').value;if(!pid||!current||current===PROF)return;const p=projects.find(x=>x.id===pid),pipe=current===PIPE,agent=pipe?'orchestrator':current;
 if(!await askConfirm({title:(pipe?'Copiare l’ultima Pipeline post della v3.7':'Copiare la conversazione v3.7 con '+label(current))+'?',facts:[['Nel progetto',p.name]],message:'Sarà visibile al team in Agenti AI; la v3.7 resta invariata.',ok:'Copia nel progetto'}))return;
 $('import').disabled=true;say('Copia in corso…');
 try{
  const added=await saveAgents(pid,conv=>pipe?ar.mergePipeline(conv,run,label):ar.mergeInto(conv,current,state.history[current]));
  const link=$('openAgents');link.href='/agents.html?agent='+encodeURIComponent(agent)+'&project='+encodeURIComponent(pid);link.hidden=false;
  say(added?(pipe?'Pipeline copiata':added+' messaggi copiati')+' nel progetto «'+p.name+'».':(pipe?'Questa pipeline era':'Questa conversazione era')+' già stata copiata nel progetto «'+p.name+'».');
 }catch(e){say('Copia non riuscita: '+e.message)}finally{$('import').disabled=false}
}
async function fillProfile(v37,b){
 const pid=$('project').value;if(!pid){say('Scegli prima il progetto da completare.');$('project').focus();return}
 b.disabled=true;
 try{
  for(let i=0;i<3;i++){
   const pr=await ws.projects.get(pid),{changes,filled}=ar.profileFill(v37,pr);
   if(!filled.length){say('Il profilo di «'+pr.name+'» ha già tutti questi campi: nulla da copiare.');return}
   if(i===0&&!await askConfirm({title:'Completare il profilo di «'+pr.name+'»?',facts:[['Dal profilo v3.7',v37.name||'senza nome'],['Campi',filled.map(f=>FIELD_LABELS[f]).join(', ')]],message:'I campi già compilati restano come sono.',ok:'Completa il profilo'}))return;
   try{await ws.projects.update(pid,pr.revision,changes);say('Profilo di «'+pr.name+'» completato: '+filled.map(f=>FIELD_LABELS[f]).join(', ')+'.');
    const link=$('openAgents');link.href='/project-profile.html?id='+encodeURIComponent(pid);link.textContent='Apri il profilo ↗';link.hidden=false;return}
   catch(e){if(!(e instanceof ws.ConflictError)||i===2)throw e}
  }
 }catch(e){say('Non riuscito: '+e.message)}finally{b.disabled=false}
}
async function boot(){
 try{const user=await ws.ready();if(!user)throw Error('Accedi dal Command Center e riprova.');
  const r=await fetch('/api/state',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('Archivio non disponibile · HTTP '+r.status);
  state=(await r.json()).state||{history:{}};state.history=state.history||{};rows=ar.summarize(state,label);run=ar.pipelineRun(state);profs=ar.profiles(state);renderList();
  say(rows.length||run||profs.length?[rows.length&&rows.length+' agenti con conversazioni salvate',run&&'l’ultima Pipeline post',profs.length&&profs.length+(profs.length===1?' profilo progetto':' profili progetto')].filter(Boolean).join(', ')+'.':'Nessun dato salvato nella v3.7.');
  projects=(await ws.projects.list()).filter(p=>p.status!=='archived');const sel=$('project');sel.replaceChildren(node('option','Scegli un progetto'),...projects.map(p=>{const o=node('option',p.name+(p.client_name?' · '+p.client_name:''));o.value=p.id;return o}));sel.firstChild.value='';sel.disabled=false;
  sel.onchange=()=>{$('import').disabled=!sel.value||!current};
  const wanted=new URLSearchParams(location.search).get('agent');if(wanted&&state.history[wanted])open(wanted);
 }catch(e){say(e.message)}}
$('md').onclick=()=>rt.exportMarkdown(current===PIPE?'archivio-v37-pipeline':'archivio-v37-'+current,markdownOf(current));
$('word').onclick=()=>rt.exportWord('Archivio v3.7 · '+(current===PIPE?'Pipeline post':label(current)),markdownOf(current));
$('import').onclick=copyToProject;
boot();
})();
