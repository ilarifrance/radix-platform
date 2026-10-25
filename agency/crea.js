/* «Cosa vuoi fare oggi?» (Marketing look «A», agency/crea.css on shell/marketing-a.css): the command box with its
   suggestions, the kits, the area tabs and the service cards of agency/crea-core.js for the chosen project.
   Cards open the existing tools; Immagini opens the Studio Foto (lib/image-studio.js), Foto prodotto the Studio Foto prodotto (lib/product-photo-studio.js: cut-out in the browser, white or brand background for free, AI scenes only behind the product, with confirmation), Video the Studio Video
   (lib/video-studio.js), Reel e video prodotto the Studio Reel (lib/reel-studio.js: one AI call for the storyboards, video rendered in the browser), Sito web the Studio Sito (lib/site-studio.js) and SEO e GEO the Studio SEO
   (lib/seo-studio.js), Analisi del sito the site audit (lib/site-audit.js: free crawl, optional AI plan), Confronto con i siti dei concorrenti the Studio Concorrenza (lib/competitor-studio.js: the site-audit crawler on the client's and the competitors' public sites, the matrix with the page of every fact, rules for gaps and opportunities, PDF and CSV; one optional confirmed AI call for the summary), Budget e KPI della strategia the Studio Budget e KPI (lib/strategy-budget.js: the budget typed by the person split by fixed rules, KPI from the project data, PDF, PowerPoint and CSV, no AI), Campagne Google Ads Search the Studio Google Ads (lib/search-ads-studio.js: one AI call for 3 structures, live checks, CSV for Google Ads Editor and the client summary built here), Creatività per annunci the Studio Creatività (lib/ad-studio.js), Scheda Google e recensioni the Studio Scheda Google (lib/gbp-studio.js), Schede prodotto e feed the Studio Schede prodotto (lib/product-studio.js: AI in batches with confirmation, free feed checks), Traduzione e localizzazione the Studio Traduzione (lib/translation-studio.js: 3 tones, then batches with one confirmation, deterministic checks), Newsletter HTML the Studio Newsletter HTML (lib/newsletter-studio.js, no AI, never sends), Kit identità the Studio Identità (lib/identity-studio.js), Coordinato aziendale the Studio Coordinato (lib/coordinato-studio.js: the saved kit → stationery, signature, covers and Office templates, no AI), Stampa e documenti the Studio Stampa (lib/print-studio.js, no AI), Report mensile al cliente the Studio Report (lib/report-studio.js: the project's own numbers of the month, branded PDF and HTML, no AI but one optional confirmed call for the comment), Audit di comunicazione the Studio Audit (lib/audit-studio.js: scores and 10 actions by fixed rules, branded PDF and HTML, no AI but one optional confirmed call to rewrite the actions), Menu e listino the Studio Menu (lib/menu-studio.js: allergens, print PDFs, phone page and QR, no AI but one optional confirmed call for the descriptions), Etichette e packaging the Studio Packaging (lib/packaging-studio.js: labels, lids, boxes and bag toppers from the kit, EAN-13 checked, die line apart, the legal checklist «da verificare», no AI), Logo in vettoriale the Studio Logo in vettoriale (lib/logo-vector-studio.js: the client's raster logo traced into SVG in the browser by lib/logo-trace.js, 3 proposals, mono versions, zip with SVG, PNG, favicon and the scheda logo PDF, no AI), Catalogo prodotti the Studio Catalogo (lib/catalog-studio.js, no AI), Documenti impaginati the Studio Documenti (lib/doc-studio.js, no AI), Evento o fiera the Studio Evento (lib/event-studio.js: one AI call, the kit files built here) and the text services («copy:<service>») the Studio Testi (lib/copy-studio.js) right here.
   The area tabs show one group at a time (remembered in this browser); ?area= and ?open= (from the Marketing home,
   agency/orbit.html) pick the group and open a studio; ?q= prefills the command box and preselects the best matching
   service (crea-core fromAsk, the same matching as the home), ?project= picks the project. Nothing is generated on
   load: every paid step asks for confirmation (RadixConfirm) inside the tool it opens. */
(function(){'use strict';
const $=id=>document.getElementById(id),ws=window.RadixWorkspace,core=window.RadixCrea,O=window.RadixOrbit,KEY='radix-crea-project',GROUP_KEY='radix-crea-group',RECENT_KEY='radix-crea-recent';
const asked=core.fromQuery(location.search),ask=core.fromAsk(location.search);
let projects=[],current=null,openCard='',group=asked.group||remembered(GROUP_KEY),picked=ask.match;if(asked.group)remember(asked.group,GROUP_KEY);
// A preselected service shows its area, unless the link asked for one.
if(picked&&!asked.group)group=core.card(picked).group;
function node(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n}
function say(t){$('crMessage').textContent=t||''}
function remember(id,key){try{localStorage.setItem(key||KEY,id)}catch(e){}}
function remembered(key){try{return localStorage.getItem(key||KEY)||''}catch(e){return ''}}
const plural=(n,one,many)=>n+' '+(n===1?one:many);
// Icons and area colours: agency/marketing-look.js.
const L=window.RadixMarketingLook,look=c=>L.AREAS[core.areaOf(c.group)]||{color:'#a68bff',icon:'spark'};
const ico=(name,cls)=>L.icon(name,cls||'ma-ico');
$('crAskIcon').innerHTML=L.svg('spark');$('crAskGoIcon').innerHTML=L.svg('arrow');
const FREE=core.listed().filter(c=>core.costBadge(c).tone==='free').length;
$('crLead').textContent=plural(core.listed().length,'servizio guidato','servizi guidati')+' in '+core.groups().length+' aree: poche domande, tre proposte, scegli tu. Il costo è sulla scheda e prima di ogni chiamata AI ti chiedo conferma.';
$('crFacts').replaceChildren(...[['Servizi',core.listed().length],['Aree',core.groups().length],['Senza AI',FREE]].map(([k,v])=>{const d=node('div','cp-fact');d.append(node('dt','',k),node('dd','',String(v)));return d}));

// ---- What a card does when chosen: a studio here, or the page of its tool. ----
// The services opened from this browser, newest first (a convenience of this viewer only: «Usati di recente»).
function recent(){try{const v=JSON.parse(localStorage.getItem(RECENT_KEY)||'[]');return Array.isArray(v)?v.filter(id=>{const c=core.card(id);return c&&!c.merged}).slice(0,4):[]}catch(e){return []}}
function used(c){if(!c)return;const id=c.merged||c.id;try{localStorage.setItem(RECENT_KEY,JSON.stringify([id,...recent().filter(x=>x!==id)].slice(0,4)))}catch(e){}}
function act(c){
 if(!c)return;used(c);
 if(c.inline){openInline(c);return}
 const href=core.linkFor(c,current?current.id:'');
 if(href)location.assign(href);else say('Scegli prima un progetto: '+c.title+' lavora sui suoi dati.');
}
function goButton(c,cls,label){
 const href=core.linkFor(c,current?current.id:'');let go;
 if(c.inline){go=node('button',cls);go.type='button';go.addEventListener('click',()=>{picked=c.id;openInline(c)})}
 else{go=node('a',cls);if(href){go.href=href;go.addEventListener('click',()=>used(c))}else{go.setAttribute('aria-disabled','true');go.title='Scegli prima un progetto';go.addEventListener('click',e=>{e.preventDefault();say('Scegli prima un progetto: '+c.title+' lavora sui suoi dati.')})}}
 go.append(node('span','',label||c.action),ico('arrow','cp-go-icon'));return go;
}
// The badge: the full label, and a few letters for the one-line rows of a phone (agency/crea.css shows one of the two).
function badge(c){const b=core.costBadge(c),s=node('span','cp-cost-badge');s.dataset.tone=b.tone;s.title=c.cost;
 s.append(node('span','cp-badge-full',b.label),node('span','cp-badge-short',core.costShort(c)));return s}

// ---- Command box: a combobox whose list of suggestions stays open under it (the home's pattern). ----
const input=$('crAsk'),list=$('crSuggest');
let items=[],cursor=-1;
// A placeholder that fits the phone's bar without being cut.
const phone=window.matchMedia?matchMedia('(max-width: 640px)'):{matches:false},hint=()=>{input.placeholder=phone.matches?'Es. «un volantino per l’open day»':'Descrivi cosa ti serve. Es. «un volantino per l’open day»'};
hint();if(phone.addEventListener)phone.addEventListener('change',hint);
function suggestions(keep){
 const q=input.value.trim();
 items=O?O.suggest({query:q,project:current,limit:phone.matches&&!q?3:5}):core.matchServices(q).slice(0,5).map(({card})=>({id:'svc-'+card.id,kind:'service',label:card.title,hint:card.group,icon:L.CARDS[card.id]||'spark',href:''}));
 cursor=-1;
 $('crSuggestHead').textContent=q?(items.length?'Servizi per «'+q.slice(0,40)+'»':'Nessun servizio con queste parole: prova con «post», «sito», «volantino» o scegli qui sotto'):current?'Suggeriti per '+current.name:'Suggeriti per iniziare';
 list.replaceChildren(...items.map((s,i)=>{const li=node('li','ma-option'),a=node('a','ma-option-link');li.setAttribute('role','none');
  const c=s.kind==='service'&&core.card(s.id.slice(4));
  a.id='crOpt'+i;a.href=s.href||'#';a.setAttribute('role','option');a.setAttribute('aria-selected','false');a.tabIndex=-1;
  const t=node('span','ma-option-text');t.append(node('b','',s.label),node('small','',c&&s.hint===s.label?c.action:s.hint));// «Stampa e documenti» is also its area: say what it does instead
  a.append(ico(s.icon,'ma-option-icon'),t);if(c)a.append(badge(c));a.append(ico('chev','ma-option-go'));
  a.addEventListener('click',e=>{if(c){e.preventDefault();choosePick(c)}});li.append(a);return li}));
 input.setAttribute('aria-expanded',String(items.length>0));input.removeAttribute('aria-activedescendant');
 if(keep&&picked){const i=items.findIndex(s=>s.id==='svc-'+picked);if(i>=0)move(i)}
}
function move(to){
 if(!items.length)return;cursor=(to+items.length)%items.length;
 list.querySelectorAll('.ma-option-link').forEach((a,i)=>a.setAttribute('aria-selected',String(i===cursor)));
 const a=$('crOpt'+cursor);input.setAttribute('aria-activedescendant',a.id);
}
// A service chosen from the box: its tab, its card marked, then the studio (or its page). A studio opens only on a
// person's choice, never on load.
function choosePick(c){picked=c.id;group=c.group;render();act(c)}
input.addEventListener('input',()=>{suggestions()});
input.addEventListener('keydown',e=>{
 if(e.key==='ArrowDown'){e.preventDefault();move(cursor+1)}
 else if(e.key==='ArrowUp'){e.preventDefault();move(cursor<0?items.length-1:cursor-1)}
 else if(e.key==='Home'&&cursor>=0){e.preventDefault();move(0)}else if(e.key==='End'&&cursor>=0){e.preventDefault();move(items.length-1)}
 else if(e.key==='Escape'){if(cursor>=0){cursor=-1;suggestions()}else if(input.value){input.value='';suggestions()}}
});
$('crAskForm').addEventListener('submit',e=>{e.preventDefault();
 const s=cursor>=0?items[cursor]:null;
 if(s&&s.kind!=='service'){location.assign(s.href);return}
 const c=s?core.card(s.id.slice(4)):core.card(core.best(input.value));
 if(c)choosePick(c);else say(input.value.trim()?'Nessun servizio con queste parole: scegli un’area qui sotto.':'Scrivi cosa ti serve, o scegli un servizio qui sotto.');
});

// ---- Area tabs: «Tutti» and the groups with cards, numbered as on the home; an unknown group falls back to «Tutti». ----
function renderFilters(hits){
 if(!core.groups().includes(group))group='';
 const had=document.activeElement&&document.activeElement.closest&&document.activeElement.closest('#crFilters .cp-tab'),focusGroup=had?had.dataset.group:null;
 const count=g=>core.inGroup(g).filter(c=>!hits||hits.includes(c)).length;
 $('crFilters').replaceChildren(...[['','Tutti']].concat(core.groups().map(g=>[g,g])).map(([g,t])=>{const b=node('button','cp-tab');b.type='button';b.dataset.group=g;b.setAttribute('aria-pressed',String(group===g));
  if(g){b.style.setProperty('--c',(L.AREAS[core.areaOf(g)]||{}).color||'');b.append(node('span','cp-tab-num',core.areaNumber(g)))}
  b.append(node('span','cp-tab-name',t),node('span','cp-tab-n',String(count(g))));if(hits&&g&&!count(g))b.dataset.empty='true';
  b.addEventListener('click',()=>{group=g;remember(g,GROUP_KEY);render()});return b}));
 // A chip re-drawn under the keyboard keeps the focus; the chosen one scrolls into the row on a phone.
 if(focusGroup!=null){const b=$('crFilters').querySelector('.cp-tab[data-group="'+focusGroup+'"]');if(b)b.focus({preventScroll:true})}
 const on=$('crFilters').querySelector('.cp-tab[aria-pressed=true]');if(on&&on.scrollIntoView&&$('crFilters').scrollWidth>$('crFilters').clientWidth)on.scrollIntoView({block:'nearest',inline:'nearest'});
}
// One service card: icon in its area colour, cost badge, what it does (a short line for the «Tutti» index, the full line
// for one area), the full cost line, the hint, the action. agency/crea.css shows the short or the full parts by view.
const KIT_OF=Object.fromEntries(core.kits().map(k=>[k.id,k]));
function cardEl(c){
 const li=node('li','ma-glass cp-card');li.dataset.service=c.id;li.dataset.open=String(openCard===c.id);li.dataset.match=String(picked===c.id);li.style.setProperty('--c',look(c).color);
 const top=node('div','cp-card-top');top.append(ico(L.CARDS[c.id]||look(c).icon,'cp-card-icon'));
 if(picked===c.id&&ask.q&&ask.match===c.id)top.append(node('span','cp-match','Il più adatto'));
 top.append(badge(c));
 const h=node('h4','cp-card-title',c.title);
 const cost=node('p','cp-cost');cost.append(ico(core.costBadge(c).tone==='free'?'check':'coin','cp-meta-icon'),node('span','',c.cost));
 li.append(top,h,node('p','cp-line',c.line),cost);
 if(c.short)h.after(node('p','cp-short',c.short));
 // A kit (several coordinated files in one flow) says so on its own card: no separate «Kit completi» row repeating it.
 const kit=KIT_OF[c.id];if(kit){const f=node('p','cp-kit-line');f.title=kit.files;const t=node('span','','Kit completo');t.append(node('span','cp-kit-more',': tutti i file in un solo flusso'));f.append(ico('layers','cp-meta-icon'),t);(li.querySelector('.cp-short')||h).after(f)}
 if(c.hint){const p=node('p','cp-hint');p.append(ico('info','cp-meta-icon'),node('span','',c.hint));li.append(p)}
 li.append(goButton(c,'cp-go'));return li;
}
// «Tutti»: the index by area (number, icon, name, line, count) as compact one-line rows; one area: its cards in full.
// The filter box narrows both, live, by core.filterServices (the same synonyms as the command box). On a phone each
// area of the index shows its first PEEK rows and «Mostra tutti (N)» (agency/crea.css hides the rest; on a computer
// every row is shown and the button is hidden). «Usati di recente» (this browser) comes first when there is any.
const PEEK=3,expanded=new Set();
const find=$('crFind'),findClear=$('crFindClear');
$('crFindIcon').innerHTML=L.svg('search')||L.svg('spark');
const query=()=>find.value.replace(/\s+/g,' ').trim();
function areaEl(g,cards,{collapsible}){
 const sec=node('section','cp-area'),slug=core.areaOf(g),a=L.AREAS[slug]||{color:'#a68bff',icon:'spark'};sec.style.setProperty('--c',a.color);sec.dataset.area=slug;
 const head=node('div','cp-area-head');const id='crArea-'+slug;
 const h=node('h3','cp-area-title');h.id=id;h.append(node('span','cp-area-num',core.areaNumber(g)),node('span','',g));
 head.append(ico(a.icon,'ma-area-icon cp-area-icon'),h,node('span','cp-area-line',O&&O.AREA_LINE?O.AREA_LINE[slug]||'':''),node('span','ma-pill ma-pill--count',plural(cards.length,'servizio','servizi')));
 sec.setAttribute('aria-labelledby',id);
 const ul=node('ul','cp-grid');ul.id='crList-'+slug;ul.append(...cards.map(cardEl));sec.append(head,ul);
 // The area of the card whose studio is open is never folded.
 if(collapsible&&cards.length>PEEK){
  const open=expanded.has(g)||cards.some(c=>c.id===openCard);sec.dataset.collapsed=String(!open);
  const more=node('button','cp-more');more.type='button';more.setAttribute('aria-controls',ul.id);more.setAttribute('aria-expanded',String(open));
  more.append(node('span','',open?'Mostra meno':'Mostra tutti ('+cards.length+')'),ico('chev','cp-more-icon'));
  more.addEventListener('click',()=>{if(open)expanded.delete(g);else expanded.add(g);render();const b=document.querySelector('.cp-area[data-area="'+slug+'"] .cp-more');if(b)b.focus({preventScroll:true})});
  sec.append(more);
 }
 return sec;
}
function render(){
 const q=query(),hits=q?core.filterServices(q):null,shown=c=>!hits||hits.includes(c);
 renderFilters(hits);
 $('crCards').dataset.view=group?'area':'index';
 $('crCards').dataset.filter=String(!!q);findClear.hidden=!q;
 const groups=(group?[group]:core.groups()).filter(g=>core.inGroup(g).some(shown));
 const n=core.inGroup(group).filter(shown).length;
 $('crCount').textContent=q?(n?plural(n,'servizio','servizi')+' per «'+q.slice(0,40)+'»'+(group?' in '+group:''):'Nessun servizio per «'+q.slice(0,40)+'»'+(group?' in '+group:''))
  :plural(n,'servizio','servizi')+(group?' in '+group:' in '+core.groups().length+' aree');
 const out=[];
 const last=!group&&!q?recent():[];
 if(last.length){const sec=node('section','cp-area cp-recent');sec.setAttribute('aria-labelledby','crRecentTitle');
  const head=node('div','cp-area-head'),h=node('h3','cp-area-title','Usati di recente');h.id='crRecentTitle';head.append(ico('check','ma-area-icon cp-area-icon'),h);
  const ul=node('ul','cp-grid');ul.append(...last.map(id=>cardEl(core.card(id))));sec.append(head,ul);out.push(sec)}
 out.push(...groups.map(g=>areaEl(g,core.inGroup(g).filter(shown),{collapsible:!group&&!q})));
 if(q&&!groups.length){const p=node('div','cp-empty');p.append(node('p','','Nessun servizio con queste parole'+(group?' in '+group:'')+'. Prova con «post», «sito», «volantino» o «logo».'));
  const b=node('button','cp-empty-clear','Mostra tutti i servizi');b.type='button';b.addEventListener('click',()=>{find.value='';group='';render();find.focus()});p.append(b);out.push(p)}
 $('crCards').replaceChildren(...out);
}
find.addEventListener('input',()=>render());
find.addEventListener('keydown',e=>{if(e.key==='Escape'&&find.value){e.preventDefault();find.value='';render()}});
findClear.addEventListener('click',()=>{find.value='';render();find.focus()});
// The filter box and the chips stay under the page bar while the list scrolls (agency/crea.css: position sticky):
// the bar's height is read, never guessed.
(()=>{const bar=()=>[...document.querySelectorAll('.rx-topbar,.rx-pagetop')].find(b=>/^(sticky|fixed)$/.test(getComputedStyle(b).position));const set=()=>{const b=bar(),h=b?Math.max(0,Math.round(b.getBoundingClientRect().height)):0;document.documentElement.style.setProperty('--cp-stick',h+'px')};
 set();addEventListener('resize',set);if(window.ResizeObserver){const ro=new ResizeObserver(set);const w=()=>{const b=bar();if(b)ro.observe(b);else setTimeout(w,300)};w()}})();
// From the Chiudi button (an event) the focus goes back to the card that opened the studio.
function closePanel(e){const was=openCard;openCard='';$('crPanel').hidden=true;$('crPanelBody').replaceChildren();render();
 const back=was&&document.querySelector('.cp-card[data-service="'+was+'"] .cp-go');if(e&&back)back.focus({preventScroll:true})}
// The inline studios: which module, what it needs a project for, and whose memory the AI call uses.
const STUDIOS={
 photo:{global:'RadixImageStudio',name:'Lo Studio Foto',need:'l’immagine usa i suoi colori e i suoi fatti',agent:'art-director'},
 productphoto:{global:'RadixProductPhotoStudio',name:'Lo Studio Foto prodotto',need:'gli sfondi usano il suo Kit identità e le foto si salvano nel progetto',agent:'art-director'},
 video:{global:'RadixVideoStudio',name:'Lo Studio Video',need:'il video usa il suo avatar e i suoi fatti',agent:'video-producer'},
 retouch:{global:'RadixRetouchStudio',name:'Lo Studio Fotoritocco',need:'le impostazioni si salvano nel progetto (le foto restano sul tuo computer)',agent:'art-director'},
 mediakit:{global:'RadixMediaKitStudio',name:'Lo Studio Media kit',need:'il media kit usa i colori e il logo del Kit identità, il profilo e l’ultimo comunicato del progetto e si salva lì',agent:'copywriter'},
 survey:{global:'RadixSurveyStudio',name:'Lo Studio Sondaggio',need:'il questionario usa i colori e il logo del Kit identità del progetto e si salva lì; le risposte arrivano nel CRM',agent:'analytics'},
 funnel:{global:'RadixFunnelStudio',name:'Lo Studio Funnel',need:'il funnel usa i colori e il logo del Kit identità del progetto e si salva lì',agent:'copywriter'},
 infographic:{global:'RadixInfographicStudio',name:'Lo Studio Infografica',need:'l’infografica usa i colori e il logo del Kit identità del progetto e si salva lì',agent:'art-director'},
 mockup:{global:'RadixMockupStudio',name:'Lo Studio Mockup',need:'i mockup mettono in scena i materiali salvati nel progetto',agent:'art-director'},
 logomotion:{global:'RadixLogoMotion',name:'Lo Studio Logo animato',need:'l’animazione parte dal logo e dai colori del Kit identità del progetto',agent:'art-director'},
 reel:{global:'RadixReelStudio',name:'Lo Studio Reel',need:'il reel usa i suoi colori, il suo logo e i suoi fatti confermati',agent:'video-producer'},
 site:{global:'RadixSiteStudio',name:'Lo Studio Sito',need:'il sito parte dai suoi fatti confermati e dai suoi colori',agent:'web-developer'},
 seo:{global:'RadixSeoStudio',name:'Lo Studio SEO e GEO',need:'la strategia parte dai suoi fatti confermati',agent:'seo-geo'},
 audit:{global:'RadixSiteAudit',name:'L’Analisi del sito',need:'l’analisi si salva nel progetto e il piano parte dai suoi fatti',agent:'seo-geo'},
 searchads:{global:'RadixSearchAdsStudio',name:'Lo Studio Campagne Google Ads',need:'le campagne partono dai servizi, dal sito e dai fatti confermati del progetto e si salvano lì',agent:'paid-media'},
 ads:{global:'RadixAdStudio',name:'Lo Studio Creatività',need:'le creatività usano i suoi colori, il suo logo e i suoi fatti confermati',agent:'paid-media'},
 gbp:{global:'RadixGbpStudio',name:'Lo Studio Scheda Google',need:'la scheda parte dai suoi fatti confermati e le risposte si firmano col suo nome',agent:'seo-geo'},
 translate:{global:'RadixTranslationStudio',name:'Lo Studio Traduzione',need:'le traduzioni partono dai testi e dalle schede salvate nel progetto e si salvano lì',agent:'copywriter'},
 shop:{global:'RadixShopStudio',name:'Lo Studio Negozio online',need:'i file partono dal foglio dei prodotti e si salvano nel progetto',agent:'web-content'},
 feed:{global:'RadixProductStudio',name:'Lo Studio Schede prodotto',need:'le schede partono dal foglio dei prodotti e si salvano nel progetto',agent:'web-content'},
 mail:{global:'RadixNewsletterStudio',name:'Lo Studio Newsletter HTML',need:'la newsletter usa il kit identità e i testi salvati del progetto',agent:'copywriter'},
 identity:{global:'RadixIdentityStudio',name:'Lo Studio Identità',need:'il kit parte dal nome e dai fatti del progetto e si salva nel suo profilo',agent:'brand-strategist'},
 icons:{global:'RadixIconStudio',name:'Lo Studio Set di icone',need:'le icone usano i colori del Kit identità e i servizi del progetto e si salvano lì',agent:'art-director'},
 coordinato:{global:'RadixCoordinatoStudio',name:'Lo Studio Coordinato',need:'il coordinato parte dal Kit identità, dal nome e dai contatti del progetto',agent:'art-director'},
 socialkit:{global:'RadixSocialStudio',name:'Lo Studio Grafica social',need:'la grafica social parte dal Kit identità e dal nome del progetto',agent:'art-director'},
 firma:{global:'RadixFirmaStudio',name:'Lo Studio Firma email',need:'la firma parte dal Kit identità, dal nome e dai contatti del progetto',agent:'art-director'},
 print:{global:'RadixPrintStudio',name:'Lo Studio Stampa',need:'i materiali partono dal nome, dai contatti e dal kit identità del progetto',agent:'art-director'},
 concorrenzasiti:{global:'RadixCompetitorStudio',name:'Lo Studio Concorrenza',need:'il confronto parte dal sito del progetto e si salva lì',agent:'brand-strategist'},
 pianoannuale:{global:'RadixAnnualPlan',name:'Lo Studio Piano annuale',need:'il piano parte dal budget, dalla strategia e dal profilo del progetto e si salva lì',agent:'strategist'},
 budget:{global:'RadixStrategyBudget',name:'Lo Studio Budget e KPI',need:'budget e KPI partono dalla strategia approvata e dai dati del progetto e si salvano lì',agent:'strategist'},
 auditcom:{global:'RadixAuditStudio',name:'Lo Studio Audit',need:'l’audit legge analisi del sito, scheda Google, social, Search Console e Kit identità del progetto e si salva lì',agent:'strategist'},
 report:{global:'RadixReportStudio',name:'Lo Studio Report',need:'il report legge contenuti, risultati e attività del progetto e si salva lì',agent:'analytics'},
 logovector:{global:'RadixLogoVectorStudio',name:'Lo Studio Logo in vettoriale',need:'il logo ricalcato si salva nel progetto e può diventare il logo del suo Kit identità',agent:'art-director'},
 packaging:{global:'RadixPackagingStudio',name:'Lo Studio Etichette e packaging',need:'le etichette usano i colori e il logo del Kit identità del progetto e si salvano lì',agent:'art-director'},
 menu:{global:'RadixMenuStudio',name:'Lo Studio Menu e listino',need:'il menu usa il nome, i contatti e il kit identità del progetto e si salva lì',agent:'copywriter'},
 catalog:{global:'RadixCatalogStudio',name:'Lo Studio Catalogo',need:'il catalogo usa il nome, i contatti e il kit identità del progetto',agent:''},
 docs:{global:'RadixDocStudio',name:'Lo Studio Documenti',need:'i documenti usano i testi salvati, i contatti e il kit identità del progetto',agent:'art-director'},
 event:{global:'RadixEventStudio',name:'Lo Studio Evento',need:'il kit usa il nome, i contatti, il kit identità e i fatti confermati del progetto',agent:'brand-strategist'},
 copy:{global:'RadixCopyStudio',name:'Lo Studio Testi',need:'i testi partono dai suoi fatti confermati',agent:''}
};
function openInline(c){
 const [kind,service]=String(c.inline).split(':'),st=STUDIOS[kind];if(!st)return;
 if(!current){say('Scegli prima un progetto: '+st.need+'.');return}
 const S=window[st.global],rt=window.RadixAgents;
 const svc=service&&S&&S.service(service);
 if(!S||!rt||(service&&!svc)){say(st.name+' non si è caricato: ricarica la pagina.');return}
 const agent=svc?svc.role:st.agent;
 openCard=c.id;used(c);render();
 $('crPanelTitle').textContent=c.title;$('crPanelEyebrow').textContent='Per '+current.name;
 $('crPanelIcon').replaceChildren(L.icon(L.CARDS[c.id]||look(c).icon));$('crPanel').style.setProperty('--c',look(c).color);
 const project=rt.profileFor(current),memoryScope={projectId:current.id,clientId:String(current.client_id||''),agentId:agent},pid=encodeURIComponent(current.id);
 $('crPanelBody').replaceChildren(c.inline==='video'
  ?S.videoStudio({project,memoryScope,avatar:S.savedAvatar(current.profile),avatarUrl:'/agency/avatar.html?project='+pid})
  :c.inline==='reel'
  ?S.reelStudio({project,profile:current.profile,memoryScope,projectId:current.id,workspace:ws,agentsUrl:'/agents.html?agent=video-producer&project='+pid})
  :c.inline==='retouch'
  ?S.retouchStudio({project,profile:current.profile,projectName:current.name,projectId:current.id,workspace:ws,agentsUrl:'/agents.html?agent=art-director&project='+pid})
  :c.inline==='mockup'
  ?S.mockupStudio({project,profile:current.profile,projectName:current.name,projectId:current.id,workspace:ws,agentsUrl:'/agents.html?agent=art-director&project='+pid,openStudio:id=>{const card=core.card(id);if(card)openInline(card)},studioUrl:id=>'/agency/crea.html?project='+pid+'&open='+encodeURIComponent(id)})
  :c.inline==='infographic'
  ?S.infographicStudio({project,profile:current.profile,projectName:current.name,projectId:current.id,workspace:ws,rt,agentsUrl:'/agents.html?agent=art-director&project='+pid,openIdentity:()=>openInline(core.card('identita')),identityUrl:'/agency/crea.html?project='+pid+'&open=identita'})
  :c.inline==='logovector'
  ?S.logoVectorStudio({project,profile:current.profile,projectName:current.name,projectId:current.id,workspace:ws,agentsUrl:'/agents.html?agent=art-director&project='+pid,openIdentity:()=>openInline(core.card('identita')),identityUrl:'/agency/crea.html?project='+pid+'&open=identita',onSaved:p=>{current={...current,...p}}})
  :c.inline==='packaging'
  ?S.packagingStudio({project,profile:current.profile,projectName:current.name,projectId:current.id,workspace:ws,agentsUrl:'/agents.html?agent=art-director&project='+pid,openIdentity:()=>openInline(core.card('identita')),identityUrl:'/agency/crea.html?project='+pid+'&open=identita'})
  :c.inline==='mediakit'
  ?S.mediaKitStudio({project,profile:current.profile,projectName:current.name,projectId:current.id,workspace:ws,rt,agentsUrl:'/agents.html?agent=copywriter&project='+pid,openStudio:id=>{const card=core.card(id);if(card)openInline(card)},studioUrl:id=>'/agency/crea.html?project='+pid+'&open='+encodeURIComponent(id)})
  :c.inline==='funnel'
  ?S.funnelStudio({project,profile:current.profile,projectName:current.name,projectId:current.id,workspace:ws,rt,agentsUrl:'/agents.html?agent=copywriter&project='+pid,openStudio:id=>{const card=core.card(id);if(card)openInline(card)},studioUrl:id=>'/agency/crea.html?project='+pid+'&open='+encodeURIComponent(id),pedUrl:'/project-editorial.html?project='+pid,crmUrl:'/radix-sales.html#leads'})
  :c.inline==='survey'
  ?S.surveyStudio({project,profile:current.profile,projectName:current.name,projectId:current.id,workspace:ws,rt,agentsUrl:'/agents.html?agent=analytics&project='+pid,crmUrl:'/radix-sales.html#contacts'})
  :c.inline==='logomotion'
  ?S.logoMotionStudio({project,profile:current.profile,projectName:current.name,projectId:current.id,workspace:ws,agentsUrl:'/agents.html?agent=art-director&project='+pid,openIdentity:()=>openInline(core.card('identita')),identityUrl:'/agency/crea.html?project='+pid+'&open=identita'})
  :c.inline==='site'
  ?S.siteStudio({project,profile:current.profile,memoryScope,projectId:current.id,workspace:ws,agentsUrl:'/agents.html?agent=web-developer&project='+pid})
  :c.inline==='seo'
  ?S.seoStudio({project,profile:current.profile,memoryScope,projectId:current.id,workspace:ws,agentsUrl:'/agents.html?agent=seo-geo&project='+pid})
  :c.inline==='audit'
  ?S.siteAudit({project,memoryScope,projectId:current.id,workspace:ws,agentsUrl:'/agents.html?agent=seo-geo&project='+pid})
  :c.inline==='searchads'
  ?S.searchAdsStudio({project,profile:current.profile,projectName:current.name,memoryScope,projectId:current.id,workspace:ws,rt,agentsUrl:'/agents.html?agent=paid-media&project='+pid})
  :c.inline==='ads'
  ?S.adStudio({project,profile:current.profile,memoryScope,projectId:current.id,workspace:ws,agentsUrl:'/agents.html?agent=paid-media&project='+pid})
  :c.inline==='gbp'
  ?S.gbpStudio({project,profile:current.profile,memoryScope,replyScope:{...memoryScope,agentId:'copywriter'},projectId:current.id,workspace:ws,agentsUrl:'/agents.html?agent=seo-geo&project='+pid})
  :c.inline==='feed'
  ?S.productStudio({project,projectName:current.name,memoryScope,projectId:current.id,workspace:ws,agentsUrl:'/agents.html?agent=web-content&project='+pid})
  :c.inline==='shop'
  ?S.shopStudio({project,projectName:current.name,projectId:current.id,workspace:ws,rt,agentsUrl:'/agents.html?agent=web-content&project='+pid})
  :c.inline==='productphoto'
  ?S.productPhotoStudio({project,profile:current.profile,projectName:current.name,projectId:current.id,workspace:ws})
  :c.inline==='translate'
  ?S.translationStudio({project,projectName:current.name,projectId:current.id,workspace:ws})
  :c.inline==='mail'
  ?S.newsletterStudio({project,profile:current.profile,projectName:current.name,projectId:current.id,workspace:ws})
  :c.inline==='identity'
  ?S.identityStudio({project,memoryScope,projectId:current.id,workspace:ws,visual:project.visual,agentsUrl:'/agents.html?agent=brand-strategist&project='+pid,onSaved:p=>{current={...current,...p}}})
  :c.inline==='icons'
  ?S.iconStudio({project,profile:current.profile,projectName:current.name,projectId:current.id,workspace:ws,agentsUrl:'/agents.html?agent=art-director&project='+pid,openIdentity:()=>openInline(core.card('identita')),identityUrl:'/agency/crea.html?project='+pid+'&open=identita'})
  :c.inline==='coordinato'
  ?S.coordinatoStudio({project,profile:current.profile,projectName:current.name,clientName:current.client_name||'',projectId:current.id,workspace:ws,agentsUrl:'/agents.html?agent=art-director&project='+pid,openIdentity:()=>openInline(core.card('identita')),identityUrl:'/agency/crea.html?project='+pid+'&open=identita'})
  :c.inline==='socialkit'
  ?S.socialStudio({project,profile:current.profile,projectName:current.name,projectId:current.id,workspace:ws,agentsUrl:'/agents.html?agent=art-director&project='+pid,openIdentity:()=>openInline(core.card('identita')),identityUrl:'/agency/crea.html?project='+pid+'&open=identita'})
  :c.inline==='firma'
  ?S.firmaStudio({project,profile:current.profile,projectName:current.name,clientName:current.client_name||'',projectId:current.id,workspace:ws,agentsUrl:'/agents.html?agent=art-director&project='+pid,openIdentity:()=>openInline(core.card('identita')),identityUrl:'/agency/crea.html?project='+pid+'&open=identita'})
  :c.inline==='print'
  ?S.printStudio({project,profile:current.profile,projectName:current.name,projectId:current.id,workspace:ws,agentsUrl:'/agents.html?agent=art-director&project='+pid})
  :c.inline==='report'
  ?S.reportStudio({project,profile:current.profile,projectName:current.name,projectId:current.id,workspace:ws,rt,agentsUrl:'/agents.html?agent=analytics&project='+pid})
  :c.inline==='concorrenzasiti'
  ?S.competitorStudio({project,profile:current.profile,projectName:current.name,projectId:current.id,workspace:ws,rt,briefUrl:'/project-editorial.html?project='+pid+'#brief',agentsUrl:'/agents.html?agent=brand-strategist&project='+pid})
  :c.inline==='budget'
  ?S.strategyBudgetStudio({project,profile:current.profile,projectName:current.name,projectId:current.id,workspace:ws,briefUrl:'/project-editorial.html?project='+pid+'#brief',agentsUrl:'/agents.html?agent=strategist&project='+pid})
  :c.inline==='pianoannuale'
  ?S.annualPlanStudio({project,profile:current.profile,projectName:current.name,projectId:current.id,workspace:ws,rt,openBudget:()=>openInline(core.card('budget')),budgetUrl:'/agency/crea.html?project='+pid+'&open=budget',agentsUrl:'/agents.html?agent=strategist&project='+pid})
  :c.inline==='auditcom'
  ?S.auditStudio({project,profile:current.profile,projectName:current.name,projectId:current.id,workspace:ws,rt,agentsUrl:'/agents.html?agent=strategist&project='+pid})
  :c.inline==='menu'
  ?S.menuStudio({project,profile:current.profile,projectName:current.name,projectId:current.id,workspace:ws,rt,agentsUrl:'/agents.html?agent=copywriter&project='+pid,openIdentity:()=>openInline(core.card('identita')),identityUrl:'/agency/crea.html?project='+pid+'&open=identita'})
  :c.inline==='catalog'
  ?S.catalogStudio({project,profile:current.profile,projectName:current.name})
  :c.inline==='docs'
  ?S.docStudio({project,profile:current.profile,projectName:current.name,projectId:current.id,workspace:ws,agentsUrl:'/agents.html?agent=art-director&project='+pid})
  :c.inline==='event'
  ?S.eventStudio({project,profile:current.profile,projectName:current.name,memoryScope,projectId:current.id,workspace:ws,crmUrl:'/radix-sales.html#contacts',agentsUrl:'/agents.html?agent=brand-strategist&project='+pid})
  :kind==='copy'
  ?S.copyStudio({service,project,memoryScope,projectId:current.id,workspace:ws,agentsUrl:'/agents.html?agent='+agent+'&project='+pid})
  :S.photoStudio({project,memoryScope,concept:'',headline:''}));
 $('crPanel').hidden=false;$('crPanel').scrollIntoView({behavior:'smooth',block:'start'});
}
async function choose(id){
 if(!id){current=null;render();suggestions(true);return}
 try{current=await ws.projects.get(id);remember(id);say('')}catch(e){current=null;say('Progetto non disponibile: '+e.message)}
 if(openCard)closePanel();else render();
 suggestions(true);
}
async function load(){
 input.value=ask.q;render();suggestions(true);
 try{
  if(!(await ws.ready())){say('Accedi dal Command Center e riprova.');return}
  projects=(await ws.projects.list()).filter(p=>p.status!=='archived');
  const sel=$('crProject');
  if(!projects.length){sel.replaceChildren(new Option('Nessun progetto','')); say('Nessun progetto: Strategia ti fa crearne uno.');return}
  sel.replaceChildren(...projects.map(p=>new Option(p.name+(p.client_name?' · '+p.client_name:''),p.id)));sel.disabled=false;
  const want=ask.project||remembered();
  sel.value=projects.some(p=>p.id===want)?want:projects[0].id;
  sel.addEventListener('change',()=>choose(sel.value));
  await choose(sel.value);
  if(asked.open&&current)openInline(core.card(asked.open));
 }catch(e){say(e.message)}
}
$('crClose').addEventListener('click',closePanel);
// Every drop zone of the studios (.pf-drop: a label over a transparent file input, so a click or a drop both work) says
// which files were chosen, and lights up while a file is dragged over it. Capture phase: before a studio empties the input.
(()=>{const body=$('crPanelBody'),zone=t=>t&&t.closest&&t.closest('.pf-drop');
 body.addEventListener('change',e=>{const t=e.target,z=zone(t);if(!z||t.type!=='file')return;const text=z.querySelector('.pf-drop-text')||z;
  let line=text.querySelector('.pf-drop-file');if(!line){line=node('small','pf-drop-file');text.append(line)}line.textContent=core.fileSummary(t.files);line.hidden=!line.textContent;z.removeAttribute('data-over')},true);
 for(const [ev,on] of [['dragenter',true],['dragover',true],['dragleave',false],['drop',false]])body.addEventListener(ev,e=>{const z=zone(e.target);if(!z)return;if(on)z.dataset.over='true';else if(ev==='drop'||!z.contains(e.relatedTarget))z.removeAttribute('data-over')})})();
load();
})();
