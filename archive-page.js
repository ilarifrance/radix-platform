/* Archivio v3.7: reads the old shared state (/api/state), shows each agent's saved conversation,
   exports it and copies it into a registry project's Agenti AI conversation. Nothing in v3.7 changes. */
(function(){
'use strict';
const $=id=>document.getElementById(id),rt=window.RadixAgents,ar=window.RadixV37Archive,ws=window.RadixWorkspace;
const say=t=>{$('status').textContent=t};
let state=null,rows=[],current=null,projects=[];
const label=id=>{const a=rt.agent(id);return a?a.name:id};
function node(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n}
function renderList(){$('agents').replaceChildren(...rows.map(r=>{const b=node('button',undefined,'agent');b.type='button';b.setAttribute('aria-current',String(current===r.agentId));b.append(node('strong',r.label),node('small',r.count+' messaggi'+(r.flows?' · '+r.flows+' flussi':'')+(r.last?' · '+new Date(r.last).toLocaleDateString('it-IT'):'')));b.onclick=()=>open(r.agentId);return b}));if(!rows.length)$('agents').append(node('p','Nessuna conversazione salvata nella v3.7.'))}
function open(id){current=id;renderList();const msgs=state.history[id]||[];$('agentName').textContent=label(id);$('md').disabled=$('word').disabled=false;$('import').disabled=!$('project').value;$('openAgents').hidden=true;
 $('thread').replaceChildren(...msgs.filter(m=>m&&typeof m.content==='string'&&!m.hidden&&!m.pending).map(m=>{const d=node('div',undefined,'msg '+m.role);d.append(node('div',(m.role==='user'?(m.by||'Utente'):m.role==='error'?'Errore':label(id))+(m.at?' · '+new Date(m.at).toLocaleString('it-IT'):''),'meta'));const body=node('div',undefined,'md');if(m.role==='assistant')body.innerHTML=rt.renderMarkdown(m.content,1);else body.textContent=m.role==='user'?(m.display||m.content):m.content;d.append(body);return d}));say(rows.find(r=>r.agentId===id).count+' messaggi in sola lettura.')}
async function copyToProject(){const pid=$('project').value;if(!pid||!current)return;const p=projects.find(x=>x.id===pid);
 if(!confirm('Copiare la conversazione v3.7 con '+label(current)+' nel progetto «'+p.name+'»? Sarà visibile al team in Agenti AI; la v3.7 resta invariata.'))return;
 $('import').disabled=true;say('Copia in corso…');
 try{const doc=ws.bind(pid,'agents');let added=0;for(let i=0;i<3;i++){const cur=(await doc.load())||{};const r=ar.mergeInto(cur.conversations,current,state.history[current]);added=r.added;if(!added)break;try{await doc.save({schemaVersion:1,conversations:r.conversations});break}catch(e){if(!(e instanceof ws.ConflictError)||i===2)throw e}}
  const link=$('openAgents');link.href='/agents.html?agent='+encodeURIComponent(current)+'&project='+encodeURIComponent(pid);link.hidden=false;
  say(added?added+' messaggi copiati nel progetto «'+p.name+'».':'Questa conversazione era già stata copiata nel progetto «'+p.name+'».')}
 catch(e){say('Copia non riuscita: '+e.message)}finally{$('import').disabled=false}}
async function boot(){
 try{const user=await ws.ready();if(!user)throw Error('Accedi dal Command Center e riprova.');
  const r=await fetch('/api/state',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('Archivio non disponibile · HTTP '+r.status);
  state=(await r.json()).state||{history:{}};state.history=state.history||{};rows=ar.summarize(state,label);renderList();
  say(rows.length?rows.length+' agenti con conversazioni salvate.':'Nessuna conversazione salvata nella v3.7.');
  projects=(await ws.projects.list()).filter(p=>p.status!=='archived');const sel=$('project');sel.replaceChildren(node('option','Scegli un progetto'),...projects.map(p=>{const o=node('option',p.name+(p.client_name?' · '+p.client_name:''));o.value=p.id;return o}));sel.firstChild.value='';sel.disabled=false;
  sel.onchange=()=>{$('import').disabled=!sel.value||!current};
  const wanted=new URLSearchParams(location.search).get('agent');if(wanted&&state.history[wanted])open(wanted);
 }catch(e){say(e.message)}}
$('md').onclick=()=>rt.exportMarkdown('archivio-v37-'+current,ar.toMarkdown(label(current),state.history[current]));
$('word').onclick=()=>rt.exportWord('Archivio v3.7 · '+label(current),ar.toMarkdown(label(current),state.history[current]));
$('import').onclick=copyToProject;
boot();
})();
