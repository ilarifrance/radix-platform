/* Profilo del progetto: the fields RadixAgents.profileFor sends at the top of every agent call.
   Saved on the registry project (rx_projects.profile) with its revision, so a colleague's edit is never overwritten. */
(function(){
'use strict';
const ws=window.RadixWorkspace,rt=window.RadixAgents,$=id=>document.getElementById(id);
const FIELDS=['audience','positioning','voice','channels','visual','links','notes'];
const LABELS={kind:'Tipo',summary:'Sintesi',audience:'Pubblico',positioning:'Posizionamento',voice:'Tone of voice',channels:'Canali',visual:'Identità visiva',links:'Link',notes:'Note'};
let projects=[],project=null,dirty=false;
const say=t=>{$('status').textContent=t};
const node=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n};
function draft(){const pr={...(project.profile||{})};for(const f of FIELDS){const v=$(f).value.trim();if(v)pr[f]=v;else delete pr[f]}return {...project,name:$('name').value.trim()||project.name,summary:$('summary').value.trim(),profile:pr}}
function renderPreview(){
 const p=rt.profileFor(draft()),dl=$('preview');dl.replaceChildren();
 for(const k of Object.keys(LABELS)){if(!p[k])continue;dl.append(node('dt',LABELS[k]),node('dd',p[k]))}
 if(!dl.children.length)dl.append(node('dd','Nessun dato: gli agenti ricevono solo il nome del progetto.'));
 const hex=(p.visual||'').match(/#[0-9a-fA-F]{6}\b/g)||[];$('swatches').replaceChildren(...hex.slice(0,8).map(h=>{const s=node('span');s.style.background=h;s.title=h;return s}));
}
function fill(){
 const pr=project.profile||{},from=rt.profileFor({...project,profile:{...pr,...Object.fromEntries(FIELDS.map(f=>[f,'']))}});
 $('title').textContent='Profilo · '+project.name;$('name').value=project.name||'';$('summary').value=project.summary||'';
 for(const f of FIELDS){$(f).value=typeof pr[f]==='string'?pr[f]:'';$(f).placeholder=from[f]?'Dal brief: '+String(from[f]).slice(0,180):''}
 const id=encodeURIComponent(project.id),box=$('links-out');box.replaceChildren();
 for(const [href,text] of [['/agents.html?project='+id,'Agenti AI'],['/project-editorial.html?project='+id,'Piano editoriale'],['/radix-pm-concept.html?project='+id,'Project manager'],['/agency/memory.html?id='+id,'Memoria']]){const a=node('a',text+' ↗');a.href=href;box.append(a)}
 $('nav-agents').href='/agents.html?project='+id;$('nav-ped').href='/project-editorial.html?project='+id;$('nav-pm').href='/radix-pm-concept.html?project='+id;$('nav-memory').href='/agency/memory.html?id='+id;
 $('form').hidden=false;$('reload').hidden=true;dirty=false;renderPreview();
 const u=new URL(location.href);u.searchParams.set('id',project.id);history.replaceState(null,'',u);
}
async function open(id){project=await ws.projects.get(id);$('project').value=project.id;fill();say('Ultima modifica: '+(project.updated_at?new Date(project.updated_at).toLocaleString('it-IT'):'—')+' · versione '+project.revision+'.')}
$('form').oninput=()=>{dirty=true;renderPreview()};
$('form').onsubmit=async e=>{e.preventDefault();if(!$('form').reportValidity())return;const d=draft();$('save').disabled=true;say('Salvataggio…');
 try{const saved=await ws.projects.update(project.id,project.revision,{name:d.name,summary:d.summary,profile:d.profile});project={...project,...saved};fill();say('Profilo salvato: dal prossimo compito ogni agente riceve questi dati.')}
 catch(err){if(err instanceof ws.ConflictError){$('reload').hidden=false;say('Un collega ha modificato il profilo nel frattempo. Le tue modifiche sono ancora nel modulo: ricarica la versione del team e riapplicale.')}else say('Profilo non salvato: '+err.message)}
 finally{$('save').disabled=false}};
$('reload').onclick=()=>{if(!dirty||confirm('Scartare le modifiche non salvate e caricare la versione del team?'))open(project.id).catch(e=>say(e.message))};
$('project').onchange=()=>{if(dirty&&!confirm('Lasciare le modifiche non salvate?')){$('project').value=project.id;return}open($('project').value).catch(e=>say(e.message))};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
(async()=>{
 try{const user=await ws.ready();if(!user){say('');const p=node('p','Accedi a RADIX dal Command Center per modificare il profilo. ');const a=node('a','Vai al Command Center');a.href='/control-center-v2.html';p.append(a);$('status').replaceWith(p);return}
  projects=(await ws.projects.list()).filter(p=>p.status!=='archived');if(!projects.length){say('Nessun progetto nell’archivio del team.');return}
  $('project').replaceChildren(...projects.map(p=>{const o=node('option',p.name+(p.client_name?' · '+p.client_name:''));o.value=p.id;return o}));$('project').disabled=false;
  const q=new URLSearchParams(location.search),want=(q.get('id')||q.get('project')||'').toLowerCase();
  await open(projects.some(p=>p.id===want)?want:projects[0].id);
 }catch(e){say(e.message)}
})();
})();
