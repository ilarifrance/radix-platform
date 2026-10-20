/* «Cosa vuoi fare oggi?»: renders the service cards of agency/crea-core.js for the chosen project.
   Cards open the existing tools; Immagini opens the Studio Foto (lib/image-studio.js) right here. Nothing is generated
   on load: every paid step asks for confirmation inside the tool it opens. */
(function(){'use strict';
const $=id=>document.getElementById(id),ws=window.RadixWorkspace,core=window.RadixCrea,KEY='radix-crea-project';
let projects=[],current=null,openCard='';
function node(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n}
function say(t){$('crMessage').textContent=t||''}
function remember(id){try{localStorage.setItem(KEY,id)}catch(e){}}
function remembered(){try{return localStorage.getItem(KEY)||''}catch(e){return ''}}
function render(){
 const pid=current?current.id:'';
 $('crCards').replaceChildren(...core.CARDS.map(c=>{
  const li=node('li','cr-card');li.dataset.card=c.id;li.dataset.open=String(openCard===c.id);
  const top=node('div','cr-top'),badge=node('span','cr-badge',c.state==='ready'?'Guidato':'Con l’agente');badge.dataset.state=c.state;
  top.append(node('i','cr-icon',c.icon),badge);
  li.append(top,node('h2','',c.title),node('p','',c.line),node('span','cr-cost',c.cost));
  if(c.hint)li.append(node('span','cr-hint',c.hint));
  const href=core.linkFor(c,pid);let go;
  if(c.inline){go=node('button','cr-go',c.action+' →');go.type='button';go.addEventListener('click',()=>openInline(c))}
  else{go=node('a','cr-go',c.action+' →');if(href)go.href=href;else{go.setAttribute('aria-disabled','true');go.title='Scegli prima un progetto'}}
  li.append(go);return li}));
}
function closePanel(){openCard='';$('crPanel').hidden=true;$('crPanelBody').replaceChildren();render()}
function openInline(c){
 if(!current){say('Scegli prima un progetto: l’immagine usa i suoi colori e i suoi fatti.');return}
 const S=window.RadixImageStudio,rt=window.RadixAgents;
 if(!S||!rt){say('Lo Studio Foto non si è caricato: ricarica la pagina.');return}
 openCard=c.id;render();
 $('crPanelTitle').textContent=c.title+' · '+current.name;
 $('crPanelBody').replaceChildren(S.photoStudio({project:rt.profileFor(current),memoryScope:{projectId:current.id,clientId:String(current.client_id||''),agentId:'art-director'},concept:'',headline:''}));
 $('crPanel').hidden=false;$('crPanel').scrollIntoView({behavior:'smooth',block:'start'});
}
async function choose(id){
 if(!id){current=null;render();return}
 try{current=await ws.projects.get(id);remember(id);say('')}catch(e){current=null;say('Progetto non disponibile: '+e.message)}
 if(openCard)closePanel();else render();
}
async function load(){
 render();
 try{
  if(!(await ws.ready())){say('Accedi dal Command Center e riprova.');return}
  projects=(await ws.projects.list()).filter(p=>p.status!=='archived');
  const sel=$('crProject');
  if(!projects.length){sel.replaceChildren(new Option('Nessun progetto','')); say('Nessun progetto: Strategia ti fa crearne uno.');return}
  sel.replaceChildren(...projects.map(p=>new Option(p.name+(p.client_name?' · '+p.client_name:''),p.id)));sel.disabled=false;
  const want=new URLSearchParams(location.search).get('project')||remembered();
  sel.value=projects.some(p=>p.id===want)?want:projects[0].id;
  sel.addEventListener('change',()=>choose(sel.value));
  await choose(sel.value);
 }catch(e){say(e.message)}
}
$('crClose').addEventListener('click',closePanel);
load();
})();
