/* Marketing Agency home (agency/orbit.html, light layout «B»): the project header with its switcher, the command bar
   «Cosa vuoi fare oggi?» with suggestions from the project's real state next to «Aspettano te» (steps, drafts and
   approvals waiting for a person), the KPI tiles (sparklines only where the data has dates), the service areas, the
   open Agency tasks, the agents, the globe with the eight areas (smaller, in the side column), the workflow and
   every section.
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
// ---- Phone: long lists show three items (the phase to do now with its neighbours) and «Mostra … (N)»; the rest is one
// press away. The rules live in the phone block of orbit.css: on a computer everything shows and the buttons do not. ----
const opened=new Set();
function setFold(id,box,n,what){const b=$(id),open=opened.has(id),many=n>3;b.dataset.n=String(n);b.dataset.what=what;b.hidden=!many;
 box.dataset.collapsed=String(many&&!open);b.setAttribute('aria-expanded',String(many&&open));b.textContent=open?'Mostra meno':'Mostra '+what+' ('+n+')'}
[['moWaitMore','moWait'],['moFlowMore','moFlow'],['moJobsMore','moJobs']].forEach(([id,box])=>$(id).addEventListener('click',()=>{
 opened.has(id)?opened.delete(id):opened.add(id);const b=$(id);setFold(id,$(box),+b.dataset.n,b.dataset.what)}));
$('moAskIcon').innerHTML=L.svg('spark');$('moAskGoIcon').innerHTML=L.svg('arrow');$('moNewJobIcon').innerHTML=L.svg('spark');$('moSwitchIcon').innerHTML=L.svg('folder');
$('moLead').textContent='Scrivi cosa ti serve o scegli un servizio qui sotto: '+plural((C.listed?C.listed():C.CARDS).length,'servizio','servizi')+' in '+planets.length+' aree. Ogni lavoro arriva in 3 proposte e niente parte senza la tua conferma.';
try{const d=new Date().toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'});$('moCrumb').textContent='Marketing Agency · '+d.charAt(0).toUpperCase()+d.slice(1)}catch(e){}

// ---- Command bar: a combobox whose listbox of suggestions stays open under it. ----
const input=$('moAsk'),list=$('moSuggest'),form=$('moAskForm');
let items=[],cursor=-1;
function suggestions(){
 // What waits for a person is in «Aspettano te» beside the bar: here only the services.
 items=O.suggest({query:input.value,project:state.project,journey:state.journey,tasks:state.tasks}).filter(x=>x.kind!=='step');cursor=-1;
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

// ---- Header: the project the page is about (name, client, kind, phases) and the switcher between active projects. ----
const KIND={agency:'Progetto Agency',brand:'Brand',internal:'Progetto interno',personal:'Personal brand'};
function header(){
 const box=$('moProject'),p=state.project,title=$('moTitle');box.replaceChildren();
 title.textContent=p?String(p.name||'Progetto'):'Marketing Agency';
 $('moNewJob').href=p?'/agency/crea.html?project='+encodeURIComponent(p.id):'/agency/crea.html';
 const live=Array.isArray(state.projects)?state.projects.filter(x=>x&&x.status!=='archived'):[],sw=$('moSwitch');
 $('moSwitchBox').hidden=live.length<2;
 if(live.length>1){sw.replaceChildren(...live.slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'it')).map(x=>{const o=node('option','',x.name||x.id);o.value=x.id;return o}));if(p)sw.value=p.id}
 if(state.signed===false||!p){if(state.projects&&!p)box.append(node('span','mo-chip mo-chip--muted','Nessun progetto attivo'));return}
 const kind=p.profile&&p.profile.kind||p.profile&&p.profile.brief&&p.profile.brief.industry||KIND[p.kind]||'';
 const chips=[p.client_name&&p.client_name!==p.name?p.client_name:'',kind].filter(Boolean);
 chips.forEach(t=>box.append(node('span','mo-chip',String(t).slice(0,60))));
 const pp=O.phaseProgress(state.journey);if(pp)box.append(node('span','mo-chip mo-chip--ok',pp.done+' di '+pp.total+' fasi fatte'));
 const open=node('a','mo-chip mo-chip--link','Apri il progetto');open.href='/agency/project-workspace.html?id='+encodeURIComponent(p.id);box.append(open);
}
$('moSwitch').addEventListener('change',e=>{const p=(state.projects||[]).find(x=>x&&x.id===e.target.value);if(!p)return;
 try{localStorage.setItem(KEY,p.id)}catch(err){}choose(p);render();
 if(!state.plans.has(p.id)&&ws)ws.documents.load(p.id,'agency-workspace').then(d=>{if(d&&d.data)state.plans.set(p.id,d.data);if(state.project===p){choose(p);render()}}).catch(()=>{});
});
function choose(p){state.project=p||null;state.journey=p&&p.journey||null;const plan=p&&state.plans.get(p.id);state.tasks=p?(plan&&Array.isArray(plan.tasks)?plan.tasks:[]):null}

// ---- «Aspettano te»: what waits for a person, from the project state, the agents' plans and the Command Center. ----
function waitingPanel(){
 const box=$('moWait'),count=$('moWaitCount');setFold('moWaitMore',box,0,'tutti');
 if(state.signed===false){count.textContent='';box.replaceChildren(node('li','mo-wait-empty','Accedi dal Command Center per vedere cosa aspetta te.'));return}
 if(!state.projects){count.textContent='';box.replaceChildren(node('li','mo-wait-empty','Caricamento…'));return}
 const w=O.waiting({project:state.project,journey:state.journey,projects:state.projects,plans:state.plans,approvals:state.dashboard&&state.dashboard.approvals,roles:state.roles});
 count.textContent=w.total?' · '+w.total:'';
 if(!w.items.length){box.replaceChildren(node('li','mo-wait-empty','Niente da decidere adesso: bozze, approvazioni e passi da confermare compaiono qui.'));return}
 box.replaceChildren(...w.items.map(it=>{const li=node('li'),a=node('a','mo-wait-item');a.href=it.href;a.dataset.kind=it.kind;
  const t=node('span','mo-wait-text');t.append(node('b','',it.label));if(it.hint)t.append(node('small','',it.hint));
  a.append(ico(it.icon,'mo-wait-icon'),t,node('span','mo-wait-go','Apri'));li.append(a);return li}));
 setFold('moWaitMore',box,w.items.length,'tutti');
}

// ---- KPI tiles: only numbers the registry and the Command Center gave; «—» with the reason otherwise. ----
// The sparkline: drawn from the tested path, parsed as inline SVG (no namespace URL in the page).
function spark(series,label){const p=O.sparkPath(series,96,28);if(!p)return null;
 const box=node('span','mo-spark');box.setAttribute('role','img');box.setAttribute('aria-label',label+', ultimi 14 giorni: '+series.join(', '));
 box.innerHTML='<svg viewBox="0 0 96 28" aria-hidden="true"><path class="mo-spark-area" d="'+p.area+'"/><path class="mo-spark-line" d="'+p.line+'"/></svg>';return box}
function kpis(c){
 const tiles=O.kpis({projects:state.projects,plans:state.plans,dashboard:state.dashboard,approvals:c.approvazioni});
 $('moKpis').replaceChildren(...tiles.map(k=>{const d=node('div','ma-glass mo-kpi');d.dataset.kpi=k.id;
  const txt=node('div','mo-kpi-text');txt.append(node('span','mo-kpi-label',k.label),node('strong','mo-kpi-value',k.value==null?'—':String(k.value)),node('span','mo-kpi-sub',k.sub));d.append(txt);
  const g=k.series&&spark(k.series,k.label);if(g)d.append(g);
  else if(k.bar){const bar=node('span','ma-bar mo-kpi-bar'),fill=node('span');fill.style.width=Math.round(k.bar.done/k.bar.total*100)+'%';bar.append(fill);bar.setAttribute('role','img');bar.setAttribute('aria-label',k.bar.done+' di '+k.bar.total+' incarichi approvati');d.append(bar)}
  return d}));
}

// ---- Area cards: number, icon, how many services, the first four as links, the rest behind «+N». ----
function areas(){
 const pid=state.project&&state.project.id;
 $('moAreasCount').textContent=plural((C.listed?C.listed():C.CARDS).length,'servizio','servizi')+' in '+plural(planets.length,'area','aree');$('moOrbitCount').textContent=plural(planets.length,'area','aree');
 $('moAreas').replaceChildren(...planets.map((p,i)=>{
  const li=node('li','ma-glass ma-area');li.style.setProperty('--c',p.color);li.dataset.area=p.slug;
  const head=node('div','ma-area-head');head.append(ico(p.icon,'ma-area-icon'),node('span','ma-area-num',String(i+1).padStart(2,'0')),node('span','ma-pill ma-pill--count',plural(p.count,'servizio','servizi')));
  const h=node('h3');const a=node('a','ma-area-title',p.group);a.href=p.href;h.append(a);
  const ul=node('ul','ma-area-services');
  C.inGroup(p.group).slice(0,4).forEach(card=>{const x=node('li'),l=node('a','',card.title);l.href=O.serviceHref(card,pid);l.append(ico('chev','ma-area-go'));x.append(l);ul.append(x)});
  if(p.count>4){const x=node('li'),l=node('a','ma-more','+'+plural(p.count-4,'altro servizio','altri servizi'));l.href=p.href;l.append(ico('arrow','ma-area-go'));x.append(l);ul.append(x)}
  li.append(head,h,node('p','ma-area-line',O.AREA_LINE[p.slug]||''),ul);return li}));
}

// ---- Work in progress: the open Agency tasks of the team projects, drafts to review first, as a list. ----
function jobsTable(){
 const box=$('moJobs'),count=$('moJobsCount');setFold('moJobsMore',box,0,'tutti');
 if(state.signed===false){count.textContent='';box.replaceChildren(empty('Accedi dal Command Center per vedere i lavori del team.','Vai al Command Center','/control-center-v2.html'));return null}
 if(!state.projects){count.textContent='';box.replaceChildren(node('p','ma-empty-line','Caricamento dei lavori…'));return null}
 const j=O.jobs(state.projects,state.plans,{roles:state.roles,status:DV?DV.STATUS:{}});
 count.textContent=j.total?plural(j.total,'aperto','aperti'):'';
 if(!j.rows.length){box.replaceChildren(empty('Nessun lavoro in corso','Inizia un lavoro','/agency/crea.html',state.projects.length?'Scegli un servizio qui sopra: gli incarichi degli agenti compaiono qui.':'Crea un progetto, poi scegli un servizio: gli incarichi compaiono qui.'));return j}
 const ul=node('ul','mo-job-list');
 j.rows.forEach(r=>{const li=node('li','mo-job'),a=node('a','mo-job-link');a.href=r.href;
  const top=node('span','mo-job-top');top.append(node('b','mo-job-title',r.title),node('span','ma-pill ma-pill--'+r.tone,r.label));
  const meta=node('small','mo-job-meta',r.project.name+' · '+r.agent);
  const bar=node('span','ma-bar'),fill=node('span');fill.style.width=(r.progress.total?Math.round(r.progress.done/r.progress.total*100):0)+'%';bar.append(fill);
  bar.setAttribute('role','img');bar.setAttribute('aria-label',r.progress.done+' di '+r.progress.total+' incarichi approvati nel progetto');
  a.append(top,meta,bar);li.append(a);ul.append(li)});
 box.replaceChildren(ul);setFold('moJobsMore',box,j.rows.length,'tutti');return j;
}
function empty(title,cta,href,line){const d=node('div','ma-empty');d.append(ico('layers','ma-empty-icon'),node('b','',title));if(line)d.append(node('p','',line));if(cta){const a=node('a','ma-btn ma-btn--ghost',cta);a.href=href;d.append(a)}return d}

// ---- Workflow: the nine phases of the project with their real state; without a project, the flow itself. ----
const STATE_WORD={done:'fatto',active:'in corso',waiting:'tocca a te',todo:'da fare'};
// The phase to work on now (the first waiting for a person, else the first not done) gets what to do and where:
// the next action of the project is one click from the home, above the services.
const WHERE={workspace:id=>'/agency/project-workspace.html?id='+encodeURIComponent(id),ped:id=>'/project-editorial.html?project='+encodeURIComponent(id)+'#ped'};
function flow(){
 // Same source and count as the header chip (O.phaseProgress): «N di 9 fasi fatte» agrees with the steps below.
 const pp=O.phaseProgress(state.journey),ph=pp?pp.phases:null;
 const now=ph?(ph.find(p=>p.state==='waiting')||ph.find(p=>p.state!=='done')||null):null;
 $('moFlowTitle').textContent=ph?'Il percorso del progetto':'Flusso di lavoro';
 $('moFlowFor').textContent=ph?'Le fasi di '+state.project.name+', dallo stato salvato: '+pp.done+' di '+pp.total+' fatte.':'Le fasi di ogni progetto: brief, proposte, la tua scelta, la pubblicazione.';
 // On a phone three phases show: the one before, the one to do now and the next (or the first three).
 const steps=ph||O.FLOW.map(label=>({label})),k=now?steps.indexOf(now):-1,from=k<0?0:Math.max(0,Math.min(k-1,steps.length-3));
 $('moFlow').replaceChildren(...steps.map((p,i)=>{
  const li=node('li','ma-step'+(p.state?' is-'+p.state:'')+(p===now?' is-now':'')+(i>=from&&i<from+3?' is-near':'')+(i===from+2?' is-near-end':''));const n=node('span','ma-step-n');
  if(p.state==='done')n.append(ico('check'));else n.textContent=String(i+1);n.setAttribute('aria-hidden','true');
  const t=node('div','ma-step-text');t.append(node('b','',p.label));if(p.state){const w=STATE_WORD[p.state],d=String(p.detail||'');t.append(node('small','',d&&d.toLowerCase()!==w?w+' · '+d:w))}
  if(p===now&&p.action&&WHERE[p.where]&&state.project){const a=node('a','ma-btn ma-btn--primary mo-now',p.actor==='you'?p.action:'Apri · '+p.action);a.href=WHERE[p.where](state.project.id);t.append(a)}
  li.append(n,t);return li}));
 setFold('moFlowMore',$('moFlow'),steps.length,'tutte le fasi');
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
 // A roster where nobody has work only repeats the agents page: the card shows when an agent has an open task.
 $('moAgents').closest('section').hidden=!order.some(r=>r.n);
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
 const r=stage.getBoundingClientRect(),W=Math.max(1,Math.round(r.width)),H=Math.max(1,Math.round(r.height)),compact=phone.matches||W<440;
 stage.classList.toggle('is-compact',compact);
 // In the narrow side column and on phones the labels are a picture: the area cards are the links (44px taps).
 els.forEach(({a},i)=>{if(compact){a.removeAttribute('href');a.setAttribute('aria-hidden','true')}else{a.href=planets[i].href;a.removeAttribute('aria-hidden')}});
 input.placeholder=phone.matches?'Cosa vuoi fare oggi?':'Es. «i post per il pane di Natale, dal 1° dicembre»';
 // measured shown: a label hidden by an earlier layout (the folded globe on a phone measured 0) counts its real size
 const sizes=els.map(({li})=>{li.hidden=false;li.style.transform='';return {w:Math.ceil(li.offsetWidth)+1,h:Math.ceil(li.offsetHeight)}});
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
// On a phone the globe is a picture (the area rows are the links): folded under its title, one press shows it.
const orbitBox=stage.closest('section'),orbitFold=$('moOrbitFold');
function showGlobe(open){orbitBox.dataset.open=String(open);orbitFold.setAttribute('aria-expanded',String(open));orbitFold.textContent=open?'Nascondi':'Mostra il globo'}
showGlobe(!phone.matches);orbitFold.addEventListener('click',()=>showGlobe(orbitBox.dataset.open!=='true'));

// ---- First paint without data, then the registry. ----
function render(){const c=O.counts({clients:state.clients,projects:state.projects,dashboard:state.dashboard});showCounts(c);header();waitingPanel();areas();jobsTable();kpis(c);flow();agents();suggestions()}
render();
async function live(){
 const note=$('moNote'),set=(t,s)=>{note.textContent=t;note.dataset.state=s};
 fetch('/agency/catalog.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(c=>{if(c&&c.roles&&typeof c.roles==='object'){state.roles=c.roles;agents();if(state.projects){jobsTable();waitingPanel()}}}).catch(()=>{});
 if(!ws){set('Registro del team non caricato: ricarica la pagina.','error');return}
 try{
  if(!(await ws.ready())){state.signed=false;render();set('Accedi dal Command Center per vedere clienti, progetti e lavori.','off');return}
  state.signed=true;
  const [clients,projects,dashboard]=await Promise.all([ws.clients.list().catch(()=>null),ws.projects.journey().catch(()=>ws.projects.list().catch(()=>null)),
   fetch('/api/state?view=dashboard',{credentials:'same-origin',cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null)]);
  Object.assign(state,{clients,projects,dashboard});
  const activeList=Array.isArray(projects)?projects.filter(p=>p&&p.status!=='archived'):[];
  const recent=activeList.slice().sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||''))).slice(0,12);
  await Promise.all(recent.map(p=>ws.documents.load(p.id,'agency-workspace').then(d=>{if(d&&d.data)state.plans.set(p.id,d.data)}).catch(()=>{})));
  state.projects=projects?recent.concat(activeList.filter(p=>!recent.includes(p))):null;
  choose(O.currentProject(activeList,remembered()));
  render();
  if(projects==null)set('Progetti non disponibili in questo momento.','partial');
  else set(activeList.length?'Dati dal registro del team.':'Nessun progetto ancora: crea il primo con «Nuovo progetto».','live');
 }catch(e){set('Registro non raggiungibile: '+e.message,'error')}
}
live();
})();
