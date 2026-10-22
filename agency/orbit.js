/* Marketing Agency home (agency/orbit.html, direction «A»): the command bar «Cosa vuoi fare oggi?» with suggestions
   from the project's real state, the globe with the eight service areas in orbit, the numbers of the team registry,
   the area cards, the open Agency tasks as a table, the project's workflow, the agents and every section.
   Pure parts: agency/orbit-core.js (suggestions, jobs, globe layout); painter: agency/marketing-globe.js; icons and
   area colours: agency/marketing-look.js. Nothing here calls an AI: suggestions are rules over what is typed and
   what the registry says, and every service asks its own confirmation before spending. Only the earth turns (labels
   and nodes stay still); it stops with prefers-reduced-motion, the pause button, a hidden tab or off screen. */
(function(){'use strict';
const $=id=>document.getElementById(id),O=window.RadixOrbit,L=window.RadixMarketingLook,C=window.RadixCrea,ws=window.RadixWorkspace,DV=window.RadixAgencyDivisions;
const still=window.matchMedia?matchMedia('(prefers-reduced-motion: reduce)'):{matches:false},phone=window.matchMedia?matchMedia('(max-width: 640px)'):{matches:false};
function node(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n}
const ico=(name,cls)=>{const s=node('span',cls||'ma-ico');s.setAttribute('aria-hidden','true');s.innerHTML=L.svg(name);return s};
const plural=(n,one,many)=>n+' '+(n===1?one:many);
const KEY='radix-crea-project';
const remembered=()=>{try{return localStorage.getItem(KEY)||''}catch(e){return ''}};
const planets=O.planets();
const state={project:null,journey:null,tasks:null,projects:null,plans:new Map(),roles:{},signed:null};
$('moAskIcon').innerHTML=L.svg('spark');$('moAskGoIcon').innerHTML=L.svg('arrow');
$('moLead').textContent=plural(C.CARDS.length,'servizio','servizi')+' in '+planets.length+' aree, con un team di agenti AI. Ogni lavoro arriva in 3 proposte: scegli tu, e niente parte senza la tua conferma.';

// ---- Command bar: a combobox whose listbox of suggestions stays open under it. ----
const input=$('moAsk'),list=$('moSuggest'),form=$('moAskForm');
let items=[],cursor=-1;
function suggestions(){
 items=O.suggest({query:input.value,project:state.project,journey:state.journey,tasks:state.tasks});cursor=-1;
 const q=input.value.trim();
 $('moSuggestHead').textContent=q?(items.length?'Servizi per «'+q.slice(0,40)+'»':'Nessun servizio con queste parole: Invio apre «Cosa vuoi fare» con il testo'):state.project?'Suggeriti per '+state.project.name:'Suggeriti per iniziare';
 list.replaceChildren(...items.map((s,i)=>{const li=node('li','ma-option'),a=node('a','ma-option-link');li.setAttribute('role','none');
  a.id='moOpt'+i;a.href=s.href;a.setAttribute('role','option');a.setAttribute('aria-selected','false');a.tabIndex=-1;
  const t=node('span','ma-option-text');t.append(node('b','',s.label),node('small','',s.hint));
  a.append(ico(s.icon,'ma-option-icon'),t,ico('chev','ma-option-go'));li.append(a);return li}));
 input.setAttribute('aria-expanded',String(items.length>0));input.removeAttribute('aria-activedescendant');
}
function move(to){
 if(!items.length)return;cursor=(to+items.length)%items.length;
 list.querySelectorAll('.ma-option-link').forEach((a,i)=>a.setAttribute('aria-selected',String(i===cursor)));
 const a=$('moOpt'+cursor);input.setAttribute('aria-activedescendant',a.id);a.scrollIntoView({block:'nearest'});
}
input.addEventListener('input',suggestions);
input.addEventListener('keydown',e=>{
 if(e.key==='ArrowDown'){e.preventDefault();move(cursor+1)}
 else if(e.key==='ArrowUp'){e.preventDefault();move(cursor<0?items.length-1:cursor-1)}
 else if(e.key==='Home'&&cursor>=0){e.preventDefault();move(0)}else if(e.key==='End'&&cursor>=0){e.preventDefault();move(items.length-1)}
 else if(e.key==='Escape'){if(cursor>=0){cursor=-1;suggestions()}else if(input.value){input.value='';suggestions()}}
});
form.addEventListener('submit',e=>{e.preventDefault();
 const go=cursor>=0&&items[cursor]?items[cursor].href:O.resolve(input.value,{projectId:state.project&&state.project.id});
 location.assign(go);
});
suggestions();

// ---- Project strip under the bar: the project the suggestions are for, with its real numbers. ----
function projectStrip(){
 const box=$('moProject'),p=state.project;box.replaceChildren();
 if(state.signed===false)return;
 if(!p){if(state.projects){box.append(node('span','mo-project-empty','Nessun progetto attivo.'));const a=node('a','ma-btn ma-btn--ghost','Nuovo progetto');a.href='/agency/new-project.html';a.prepend(ico('folder','ma-btn-icon'));box.append(a)}return}
 const who=node('a','mo-project-name');who.href='/agency/project-workspace.html?id='+encodeURIComponent(p.id);
 const ini=node('i','mo-project-mark',String(p.name||'?').split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase());ini.setAttribute('aria-hidden','true');
 who.append(ini,node('span','',p.name));box.append(who);
 if(p.client_name&&p.client_name!==p.name)box.append(node('span','mo-project-client',p.client_name));
 const open=(state.tasks||[]).filter(t=>t&&t.status in {proposed:1,running:1,done:1,changes_requested:1,error:1}).length,review=(state.tasks||[]).filter(t=>t&&t.status==='done').length;
 const fact=(n,text)=>{const s=node('span','mo-project-fact');const b=node('b','',String(n));s.append(b,' '+text);return s};
 if(state.tasks){box.append(node('span','mo-sep'),fact(open,open===1?'incarico aperto':'incarichi aperti'));if(review)box.append(node('span','mo-sep'),fact(review,'da rivedere'))}
 if(state.journey&&Number.isInteger(state.journey.done))box.append(node('span','mo-sep'),fact(state.journey.done+' di '+state.journey.total,'fasi'));
}

// ---- KPIs: only numbers the registry gave; «—» with the reason otherwise. ----
function kpis(c,j){
 const tiles=[['Incarichi aperti',j?j.total:null,'negli ultimi progetti del team'],['Bozze da rivedere',j?j.review:null,'aspettano la tua scelta'],
  ['Progetti attivi',c.progetti,'nel registro del team'],['Approvazioni',c.approvazioni,'in attesa nel Command Center']];
 $('moKpis').replaceChildren(...tiles.map(([label,v,sub])=>{const d=node('div','ma-kpi');d.append(node('span','ma-kpi-label',label));
  const n=node('strong','ma-kpi-value',v==null?'—':String(v));d.append(n,node('span','ma-kpi-sub',v==null?'non disponibile':sub));return d}));
}

// ---- Area cards: number, icon, how many services, the first four as links, the rest behind «+N». ----
function areas(){
 const pid=state.project&&state.project.id;
 $('moAreasCount').textContent=plural(C.CARDS.length,'servizio','servizi');
 $('moAreas').replaceChildren(...planets.map((p,i)=>{
  const li=node('li','ma-glass ma-area');li.style.setProperty('--c',p.color);li.dataset.area=p.slug;
  const head=node('div','ma-area-head');head.append(ico(p.icon,'ma-area-icon'),node('span','ma-area-num',String(i+1).padStart(2,'0')),node('span','ma-pill ma-pill--count',plural(p.count,'servizio','servizi')));
  const h=node('h3');const a=node('a','ma-area-title',p.group);a.href=p.href;h.append(a);
  const ul=node('ul','ma-area-services');
  C.inGroup(p.group).slice(0,4).forEach(card=>{const x=node('li'),l=node('a','',card.title);l.href=O.serviceHref(card,pid);l.append(ico('chev','ma-area-go'));x.append(l);ul.append(x)});
  if(p.count>4){const x=node('li'),l=node('a','ma-more','+'+plural(p.count-4,'altro servizio','altri servizi'));l.href=p.href;l.append(ico('arrow','ma-area-go'));x.append(l);ul.append(x)}
  li.append(head,h,node('p','ma-area-line',O.AREA_LINE[p.slug]||''),ul);return li}));
}

// ---- Work in progress: the open Agency tasks of the team projects, as a dense table. ----
function jobsTable(){
 const box=$('moJobs'),count=$('moJobsCount');
 if(state.signed===false){count.textContent='';box.replaceChildren(empty('Accedi dal Command Center per vedere i lavori del team.','Vai al Command Center','/control-center-v2.html'));return null}
 if(!state.projects){count.textContent='';box.replaceChildren(node('p','ma-empty-line','Caricamento dei lavori…'));return null}
 const j=O.jobs(state.projects,state.plans,{roles:state.roles,status:DV?DV.STATUS:{}});
 count.textContent=j.total?plural(j.total,'aperto','aperti'):'';
 if(!j.rows.length){box.replaceChildren(empty('Nessun lavoro in corso','Inizia un lavoro','/agency/crea.html',state.projects.length?'Scegli un servizio qui sopra: gli incarichi degli agenti compaiono qui.':'Crea un progetto, poi scegli un servizio: gli incarichi compaiono qui.'));return j}
 const t=node('table','ma-table'),cap=node('caption','ma-sr','Incarichi aperti degli agenti, le bozze da rivedere per prime');t.append(cap);
 const head=node('thead'),hr=node('tr');['Stato','Lavoro','Agente','Avanzamento progetto',''].forEach((h,i)=>{const th=node('th','',h);th.scope='col';if(i===4)th.append(node('span','ma-sr','Apri'));hr.append(th)});head.append(hr);
 const body=node('tbody');
 j.rows.forEach(r=>{const tr=node('tr');
  const s=node('td','ma-td-status');s.append(node('span','ma-pill ma-pill--'+r.tone,r.label));
  const w=node('td','ma-td-work');const a=node('a','ma-row-link',r.title);a.href=r.href;w.append(a,node('small','',r.project.name+(r.project.client&&r.project.client!==r.project.name?' · '+r.project.client:'')));
  const ag=node('td','ma-td-agent',r.agent);
  const pr=node('td','ma-td-progress'),bar=node('span','ma-bar'),fill=node('span');fill.style.width=(r.progress.total?Math.round(r.progress.done/r.progress.total*100):0)+'%';bar.append(fill);
  bar.setAttribute('role','img');bar.setAttribute('aria-label',r.progress.done+' di '+r.progress.total+' incarichi approvati');pr.append(bar,node('small','',r.progress.done+' di '+r.progress.total+' approvati'));
  const go=node('td','ma-td-go');go.append(ico('chev'));
  tr.append(s,w,ag,pr,go);body.append(tr)});
 t.append(head,body);box.replaceChildren(t);return j;
}
function empty(title,cta,href,line){const d=node('div','ma-empty');d.append(ico('layers','ma-empty-icon'),node('b','',title));if(line)d.append(node('p','',line));if(cta){const a=node('a','ma-btn ma-btn--ghost',cta);a.href=href;d.append(a)}return d}

// ---- Workflow: the nine phases of the project with their real state; without a project, the flow itself. ----
const STATE_WORD={done:'fatto',active:'in corso',waiting:'tocca a te',todo:'da fare'};
function flow(){
 const ph=state.journey&&Array.isArray(state.journey.phases)&&state.journey.phases.length?state.journey.phases:null;
 $('moFlowFor').textContent=ph?'Le fasi di '+state.project.name+', dallo stato salvato.':'Le fasi di ogni progetto: brief, proposte, la tua scelta, la pubblicazione.';
 $('moFlow').replaceChildren(...(ph||O.FLOW.map(label=>({label}))).map((p,i)=>{
  const li=node('li','ma-step'+(p.state?' is-'+p.state:''));const n=node('span','ma-step-n');
  if(p.state==='done')n.append(ico('check'));else n.textContent=String(i+1);n.setAttribute('aria-hidden','true');
  const t=node('div','ma-step-text');t.append(node('b','',p.label));if(p.state){const w=STATE_WORD[p.state],d=String(p.detail||'');t.append(node('small','',d&&d.toLowerCase()!==w?w+' · '+d:w))}
  li.append(n,t);return li}));
}

// ---- Agents: the catalogue roles, the ones with open work first. ----
const ROLE_ICON={'marketing-orchestrator':'flow','brand-strategist':'spark',strategist:'target',copywriter:'doc','art-director':'palette','ai-specialist':'wand','social-media-manager':'chat','seo-geo':'search','web-content':'type','video-producer':'video','paid-media':'megaphone',analytics:'chart',orchestrator:'calendar','web-developer':'browser'};
function agents(){
 const roles=Object.entries(state.roles);const box=$('moAgents');
 if(!roles.length){$('moAgentsCount').textContent='';box.replaceChildren(node('li','ma-empty-line','Catalogo agenti non disponibile.'));return}
 $('moAgentsCount').textContent=plural(roles.length,'ruolo','ruoli');
 const open={};for(const [,plan] of state.plans)for(const t of (plan&&Array.isArray(plan.tasks)?plan.tasks:[]))if(t&&t.role&&t.status!=='approved')open[t.role]=(open[t.role]||0)+1;
 const order=roles.map(([id,name],i)=>({id,name,i,n:open[id]||0})).sort((a,b)=>b.n-a.n||a.i-b.i).slice(0,6);
 box.replaceChildren(...order.map(r=>{const li=node('li'),a=node('a','ma-row');a.href='/agents.html?agent='+encodeURIComponent(r.id)+(state.project?'&project='+encodeURIComponent(state.project.id):'');
  const t=node('span','ma-row-text');t.append(node('b','',r.name),node('small','',r.n?plural(r.n,'incarico aperto','incarichi aperti'):'Nessun incarico aperto'));
  a.append(ico(ROLE_ICON[r.id]||'user','ma-row-icon'),t,ico('chev','ma-row-go'));li.append(a);return li}));
}

// ---- Every section of the Agency, with the counts of the registry. ----
const counted=new Map();
$('moSections').replaceChildren(...O.SECTIONS.map(s=>{const li=node('li'),a=node('a','ma-row');a.href=s.href;li.dataset.section=s.id;
 const t=node('span','ma-row-text');t.append(node('b','',s.title),node('small','',s.line));
 const n=node('span','ma-pill ma-pill--count');n.hidden=true;if(s.count)counted.set(s.count,{el:n,unit:s.unit});
 a.append(ico(s.icon,'ma-row-icon'),t,n,ico('chev','ma-row-go'));li.append(a);return li}));
function showCounts(c){for(const [k,{el,unit}] of counted){const t=O.countText(c[k],unit);el.textContent=t;el.hidden=!t}}

// ---- Globe: labels are links to each area, measured, then placed by globeLayout() so nothing crosses. ----
const stage=$('moStage'),sky=$('moSky'),labels=$('moPlanets'),pauseBtn=$('moPause'),painter=window.RadixMarketingGlobe?window.RadixMarketingGlobe.create(sky):null;
let active=-1,layout=null,rot=2.15,last=0,raf=0,paused=false,visible=true;
const els=planets.map((p,i)=>{const li=node('li','mo-gl-item'),a=node('a','mo-gl');a.href=p.href;a.style.setProperty('--c',p.color);
 a.setAttribute('aria-label',p.group+': '+plural(p.count,'servizio','servizi')+' ('+p.services.join(', ')+')');
 const dot=node('i','mo-gl-dot');dot.setAttribute('aria-hidden','true');const t=node('span','mo-gl-text');t.append(node('b','',p.group),node('small','',plural(p.count,'servizio','servizi')));
 a.append(dot,t);li.append(a);labels.append(li);
 const on=()=>{active=i;paint()},off=()=>{if(active===i){active=-1;paint()}};
 a.addEventListener('pointerenter',on);a.addEventListener('pointerleave',off);a.addEventListener('focus',on);a.addEventListener('blur',off);
 return {li,a}});
function place(){
 const r=stage.getBoundingClientRect(),W=Math.max(1,Math.round(r.width)),H=Math.max(1,Math.round(r.height)),compact=phone.matches;
 stage.classList.toggle('is-compact',compact);
 // On phones the labels are a picture: the area cards right below are the links (44px taps).
 els.forEach(({a},i)=>{if(compact){a.removeAttribute('href');a.setAttribute('aria-hidden','true')}else{a.href=planets[i].href;a.removeAttribute('aria-hidden')}});
 input.placeholder=compact?'Cosa vuoi fare oggi?':'Cosa vuoi fare oggi? Es. «i post per il pane di Natale»';
 const sizes=els.map(({li})=>{li.style.transform='';return {w:Math.ceil(li.offsetWidth)+1,h:Math.ceil(li.offsetHeight)}});
 const pr=pauseBtn.hidden?null:pauseBtn.getBoundingClientRect(),blocked=pr&&pr.width?[{x:pr.left-r.left,y:pr.top-r.top,w:pr.width,h:pr.height}]:[];
 layout=O.globeLayout(W,H,sizes,{blocked});
 stage.classList.toggle('is-bare',!layout);
 els.forEach(({li},i)=>{const b=layout&&layout.labels[i];li.hidden=!b;if(b)li.style.transform='translate('+b.x+'px,'+b.y+'px)'});
 if(painter)painter.size(W,H,window.devicePixelRatio||1);
}
const colors=planets.map(p=>p.color);
function paint(){if(painter)painter.paint(layout,rot,{colors,active})}
const moving=()=>!still.matches&&!paused&&visible&&!document.hidden;
function frame(ms){raf=0;if(!moving())return;if(ms-last>=33){rot+=Math.min(.1,(ms-last)/1000*.06);last=ms;paint()}raf=requestAnimationFrame(frame)}
function run(){if(raf||!moving())return;last=performance.now();raf=requestAnimationFrame(frame)}
function stop(){if(raf){cancelAnimationFrame(raf);raf=0}}
let resizeT=0;function refresh(){stop();place();paint();run()}
const pauseLabel=node('span','mo-pause-label'),pauseIcon=node('span','mo-pause-icon');pauseIcon.setAttribute('aria-hidden','true');
function showPause(){pauseIcon.innerHTML=L.svg(paused?'play':'pause');pauseLabel.textContent=paused?'Riprendi l’animazione':'Ferma l’animazione'}
pauseBtn.replaceChildren(pauseIcon,pauseLabel);showPause();pauseBtn.hidden=still.matches;
pauseBtn.addEventListener('click',()=>{paused=!paused;pauseBtn.setAttribute('aria-pressed',String(paused));showPause();paused?stop():run()});
document.addEventListener('visibilitychange',()=>{document.hidden?stop():run()});
if(window.IntersectionObserver)new IntersectionObserver(es=>{visible=es[0].isIntersecting;visible?run():stop()}).observe(stage);
const later=()=>{clearTimeout(resizeT);resizeT=setTimeout(refresh,120)};
if(window.ResizeObserver)new ResizeObserver(later).observe(stage);else window.addEventListener('resize',later);
[still,phone].forEach(m=>m.addEventListener&&m.addEventListener('change',()=>{pauseBtn.hidden=still.matches;refresh()}));
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(refresh);
refresh();

// ---- First paint without data, then the registry. ----
function render(){const c=O.counts({clients:state.clients,projects:state.projects,dashboard:state.dashboard});showCounts(c);projectStrip();areas();const j=jobsTable();kpis(c,j);flow();agents();suggestions()}
render();
async function live(){
 const note=$('moNote'),set=(t,s)=>{note.textContent=t;note.dataset.state=s};
 fetch('/agency/catalog.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(c=>{if(c&&c.roles&&typeof c.roles==='object'){state.roles=c.roles;agents();if(state.projects)jobsTable()}}).catch(()=>{});
 if(!ws){set('Registro del team non caricato: ricarica la pagina.','error');return}
 try{
  if(!(await ws.ready())){state.signed=false;render();set('Accedi dal Command Center per vedere clienti, progetti e lavori.','off');return}
  state.signed=true;
  const [clients,projects,dashboard]=await Promise.all([ws.clients.list().catch(()=>null),ws.projects.journey().catch(()=>ws.projects.list().catch(()=>null)),
   fetch('/api/state?view=dashboard',{credentials:'same-origin',cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null)]);
  Object.assign(state,{clients,projects,dashboard});
  const activeList=Array.isArray(projects)?projects.filter(p=>p&&p.status!=='archived'):[];
  state.project=O.currentProject(activeList,remembered());state.journey=state.project&&state.project.journey||null;
  const recent=activeList.slice().sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||''))).slice(0,12);
  await Promise.all(recent.map(p=>ws.documents.load(p.id,'agency-workspace').then(d=>{if(d&&d.data)state.plans.set(p.id,d.data)}).catch(()=>{})));
  state.projects=projects?recent.concat(activeList.filter(p=>!recent.includes(p))):null;
  const plan=state.project&&state.plans.get(state.project.id);state.tasks=state.project?(plan&&Array.isArray(plan.tasks)?plan.tasks:[]):null;
  render();
  if(projects==null)set('Progetti non disponibili in questo momento.','partial');
  else set(activeList.length?'Dati dal registro del team.':'Nessun progetto ancora: crea il primo con «Nuovo progetto».','live');
 }catch(e){set('Registro non raggiungibile: '+e.message,'error')}
}
live();
})();
