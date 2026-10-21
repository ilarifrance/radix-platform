/* «Cosa vuoi fare oggi?»: renders the service cards of agency/crea-core.js for the chosen project.
   Cards open the existing tools; Immagini opens the Studio Foto (lib/image-studio.js), Video the Studio Video
   (lib/video-studio.js), Sito web the Studio Sito (lib/site-studio.js) and SEO e GEO the Studio SEO
   (lib/seo-studio.js), Analisi del sito the site audit (lib/site-audit.js: free crawl, optional AI plan), Creatività per annunci the Studio Creatività (lib/ad-studio.js), Scheda Google e recensioni the Studio Scheda Google (lib/gbp-studio.js), Kit identità the Studio Identità (lib/identity-studio.js), Stampa e documenti the Studio Stampa (lib/print-studio.js, no AI), Catalogo prodotti the Studio Catalogo (lib/catalog-studio.js, no AI) and the text services («copy:<service>») the Studio Testi (lib/copy-studio.js) right here.
   The filter chips above the cards show one group at a time (remembered in this browser); ?area= and ?open= (from the
   Marketing Orbit, agency/orbit.html) pick the group and open a studio. Nothing is generated
   on load: every paid step asks for confirmation inside the tool it opens. */
(function(){'use strict';
const $=id=>document.getElementById(id),ws=window.RadixWorkspace,core=window.RadixCrea,KEY='radix-crea-project',GROUP_KEY='radix-crea-group';
const asked=core.fromQuery(location.search);
let projects=[],current=null,openCard='',group=asked.group||remembered(GROUP_KEY);if(asked.group)remember(asked.group,GROUP_KEY);
function node(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n}
function say(t){$('crMessage').textContent=t||''}
function remember(id,key){try{localStorage.setItem(key||KEY,id)}catch(e){}}
function remembered(key){try{return localStorage.getItem(key||KEY)||''}catch(e){return ''}}
// «Tutti» plus the groups that have cards, each with how many services it holds; an unknown remembered group falls
// back to «Tutti». Icons and area colours: agency/marketing-look.js.
const L=window.RadixMarketingLook,look=c=>L.AREAS[core.areaOf(c.group)]||{color:'#a68bff'};
function renderFilters(){
 if(!core.groups().includes(group))group='';
 $('crFilters').replaceChildren(...[['','Tutti']].concat(core.groups().map(g=>[g,g])).map(([g,t])=>{const b=node('button','cr-filter');b.type='button';b.dataset.group=g;b.setAttribute('aria-pressed',String(group===g));
  if(g)b.style.setProperty('--c',(L.AREAS[core.areaOf(g)]||{}).color||'');
  b.append(node('span','',t),node('span','cr-filter-n',String(core.inGroup(g).length)));
  b.addEventListener('click',()=>{group=g;remember(g,GROUP_KEY);render()});return b}));
}
function render(){
 const pid=current?current.id:'';renderFilters();
 $('crCards').replaceChildren(...core.inGroup(group).map(c=>{
  const li=node('li','cr-card');li.dataset.card=c.id;li.dataset.open=String(openCard===c.id);li.style.setProperty('--c',look(c).color);
  const top=node('div','cr-top'),badge=c.state==='ready'?node('span','cr-group',c.group):node('span','cr-badge','Con l’agente');badge.dataset.state=c.state;
  top.append(L.icon(L.CARDS[c.id]||look(c).icon,'cr-icon'),badge);
  const cost=node('p','cr-cost');cost.append(L.icon(/^Nessuna chiamata AI/.test(c.cost)?'check':'coin','cr-meta-icon'),node('span','',c.cost));
  li.append(top,node('h2','',c.title),node('p','cr-line',c.line),cost);
  if(c.hint){const h=node('p','cr-hint');h.append(L.icon('info','cr-meta-icon'),node('span','',c.hint));li.append(h)}
  const href=core.linkFor(c,pid);let go;
  if(c.inline){go=node('button','cr-go',c.action+' →');go.type='button';go.addEventListener('click',()=>openInline(c))}
  else{go=node('a','cr-go',c.action+' →');if(href)go.href=href;else{go.setAttribute('aria-disabled','true');go.title='Scegli prima un progetto'}}
  li.append(go);return li}));
}
// From the Chiudi button (an event) the focus goes back to the card that opened the studio.
function closePanel(e){const was=openCard;openCard='';$('crPanel').hidden=true;$('crPanelBody').replaceChildren();render();
 const back=was&&document.querySelector('.cr-card[data-card="'+was+'"] .cr-go');if(e&&back)back.focus({preventScroll:true})}
// The inline studios: which module, what it needs a project for, and whose memory the AI call uses.
const STUDIOS={
 photo:{global:'RadixImageStudio',name:'Lo Studio Foto',need:'l’immagine usa i suoi colori e i suoi fatti',agent:'art-director'},
 video:{global:'RadixVideoStudio',name:'Lo Studio Video',need:'il video usa il suo avatar e i suoi fatti',agent:'video-producer'},
 site:{global:'RadixSiteStudio',name:'Lo Studio Sito',need:'il sito parte dai suoi fatti confermati e dai suoi colori',agent:'web-developer'},
 seo:{global:'RadixSeoStudio',name:'Lo Studio SEO e GEO',need:'la strategia parte dai suoi fatti confermati',agent:'seo-geo'},
 audit:{global:'RadixSiteAudit',name:'L’Analisi del sito',need:'l’analisi si salva nel progetto e il piano parte dai suoi fatti',agent:'seo-geo'},
 ads:{global:'RadixAdStudio',name:'Lo Studio Creatività',need:'le creatività usano i suoi colori, il suo logo e i suoi fatti confermati',agent:'paid-media'},
 gbp:{global:'RadixGbpStudio',name:'Lo Studio Scheda Google',need:'la scheda parte dai suoi fatti confermati e le risposte si firmano col suo nome',agent:'seo-geo'},
 identity:{global:'RadixIdentityStudio',name:'Lo Studio Identità',need:'il kit parte dal nome e dai fatti del progetto e si salva nel suo profilo',agent:'brand-strategist'},
 print:{global:'RadixPrintStudio',name:'Lo Studio Stampa',need:'i materiali partono dal nome, dai contatti e dal kit identità del progetto',agent:'art-director'},
 catalog:{global:'RadixCatalogStudio',name:'Lo Studio Catalogo',need:'il catalogo usa il nome, i contatti e il kit identità del progetto',agent:''},
 copy:{global:'RadixCopyStudio',name:'Lo Studio Testi',need:'i testi partono dai suoi fatti confermati',agent:''}
};
function openInline(c){
 const [kind,service]=String(c.inline).split(':'),st=STUDIOS[kind];if(!st)return;
 if(!current){say('Scegli prima un progetto: '+st.need+'.');return}
 const S=window[st.global],rt=window.RadixAgents;
 const svc=service&&S&&S.service(service);
 if(!S||!rt||(service&&!svc)){say(st.name+' non si è caricato: ricarica la pagina.');return}
 const agent=svc?svc.role:st.agent;
 openCard=c.id;render();
 $('crPanelTitle').textContent=c.title+' · '+current.name;
 $('crPanelIcon').replaceChildren(L.icon(L.CARDS[c.id]||look(c).icon));$('crPanel').style.setProperty('--c',look(c).color);
 const project=rt.profileFor(current),memoryScope={projectId:current.id,clientId:String(current.client_id||''),agentId:agent},pid=encodeURIComponent(current.id);
 $('crPanelBody').replaceChildren(c.inline==='video'
  ?S.videoStudio({project,memoryScope,avatar:S.savedAvatar(current.profile),avatarUrl:'/agency/avatar.html?project='+pid})
  :c.inline==='site'
  ?S.siteStudio({project,memoryScope,projectId:current.id,workspace:ws,agentsUrl:'/agents.html?agent=web-developer&project='+pid})
  :c.inline==='seo'
  ?S.seoStudio({project,memoryScope,projectId:current.id,workspace:ws,agentsUrl:'/agents.html?agent=seo-geo&project='+pid})
  :c.inline==='audit'
  ?S.siteAudit({project,memoryScope,projectId:current.id,workspace:ws,agentsUrl:'/agents.html?agent=seo-geo&project='+pid})
  :c.inline==='ads'
  ?S.adStudio({project,profile:current.profile,memoryScope,projectId:current.id,workspace:ws,agentsUrl:'/agents.html?agent=paid-media&project='+pid})
  :c.inline==='gbp'
  ?S.gbpStudio({project,profile:current.profile,memoryScope,replyScope:{...memoryScope,agentId:'copywriter'},projectId:current.id,workspace:ws,agentsUrl:'/agents.html?agent=seo-geo&project='+pid})
  :c.inline==='identity'
  ?S.identityStudio({project,memoryScope,projectId:current.id,workspace:ws,visual:project.visual,agentsUrl:'/agents.html?agent=brand-strategist&project='+pid,onSaved:p=>{current={...current,...p}}})
  :c.inline==='print'
  ?S.printStudio({project,profile:current.profile,projectName:current.name,projectId:current.id,workspace:ws,agentsUrl:'/agents.html?agent=art-director&project='+pid})
  :c.inline==='catalog'
  ?S.catalogStudio({project,profile:current.profile,projectName:current.name})
  :kind==='copy'
  ?S.copyStudio({service,project,memoryScope,projectId:current.id,workspace:ws,agentsUrl:'/agents.html?agent='+agent+'&project='+pid})
  :S.photoStudio({project,memoryScope,concept:'',headline:''}));
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
  if(asked.open&&current)openInline(core.card(asked.open));
 }catch(e){say(e.message)}
}
$('crClose').addEventListener('click',closePanel);
load();
})();
