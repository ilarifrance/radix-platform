/* Marketing Orbit (agency/orbit.html): the entry page of the Marketing Agency. A core (the brand) with one planet per
   service area of «Cosa vuoi fare oggi?» (the groups of agency/crea-core.js), and below it the cards of every section.
   Pure part (planets, sections, counts, orbit geometry) runs in Node for the tests; the page lives in agency/orbit.js.
   Counts come only from the registry (clients, projects) and the Command Center summary (approvals awaiting a
   decision): a missing number stays missing, never estimated. The home «A» (globe, command bar, work in progress) adds
   its pure parts below: suggestions from the typed text and the project's real state (no AI reads anything), the
   open Agency tasks, and the globe layout where labels never touch an orbit, the earth or each other. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixOrbit=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const node=typeof module==='object'&&module.exports;
const crea=()=>node?require('./crea-core.js'):root.RadixCrea;
// One colour and one line icon per area (agency/marketing-look.js); pink is Marketing's colour in the Command Center.
const AREA_LOOK=(node?require('./marketing-look.js'):root.RadixMarketingLook).AREAS;
const LOOK=Object.fromEntries(Object.entries(AREA_LOOK).map(([k,v])=>[k,[v.color,v.icon]]));
const CREA='/agency/crea.html';
// The planets: one per group that has services, in the panel's order, each opening the panel filtered on it.
function planets(core){
 const c=core||crea();
 return c.groups().map(group=>{const slug=c.areaOf(group),cards=c.inGroup(group),look=LOOK[slug]||['#a68bff','spark'];
  return {slug,group,color:look[0],icon:look[1],count:cards.length,services:cards.map(x=>x.title),href:CREA+'?area='+encodeURIComponent(slug)}});
}
// The studios and where each one starts: the avatar has its own page, the others open inline in the panel.
const STUDIOS=[['Avatar','/agency/avatar.html'],['Immagini',CREA+'?open=images'],['Video',CREA+'?open=video'],['Sito',CREA+'?open=site'],
 ['SEO e GEO',CREA+'?open=seo'],['Identità',CREA+'?open=identita'],['Stampa',CREA+'?open=stampa'],['Catalogo',CREA+'?open=catalogo'],['Documenti',CREA+'?open=documenti']].map(([label,href])=>({label,href}));
// count: the key of counts() shown on the card, with its label; no key, no number.
const SECTIONS=[
 {id:'servizi',icon:'wand',title:'Cosa vuoi fare',line:'Tutti i servizi guidati: poche domande, tre proposte, scegli tu.',href:CREA,count:'servizi',unit:['servizio','servizi']},
 {id:'clienti',icon:'users',title:'Clienti',line:'Le aziende per cui lavori, con i loro progetti.',href:'/agency/clients.html',count:'clienti',unit:['cliente','clienti']},
 {id:'progetti',icon:'folder',title:'Progetti',line:'Brief, incarichi, output e approvazioni di ogni progetto.',href:'/agency/projects.html',count:'progetti',unit:['progetto attivo','progetti attivi']},
 {id:'ped',icon:'calendar',title:'Piano editoriale',line:'Calendario, testi e grafiche dei post; pubblichi solo con il tuo clic.',href:'/project-editorial.html#ped'},
 {id:'studi',icon:'layers',title:'Studi',line:'Gli strumenti guidati, uno per tipo di lavoro.',href:CREA,links:STUDIOS},
 {id:'risultati',icon:'chart',title:'Risultati',line:'Come stanno andando i contenuti pubblicati e la ricerca su Google.',href:'/project-editorial.html#results',
  links:[{label:'Risultati del piano editoriale',href:'/project-editorial.html#results'},{label:'Risultati SEO',href:CREA+'?open=seo'}]},
 {id:'approvazioni',icon:'check',title:'Approvazioni',line:'Strategie, piani e contenuti in attesa di una decisione.',href:'/control-center-v2.html#approvals',count:'approvazioni',unit:['in attesa','in attesa']},
 {id:'memoria',icon:'book',title:'Memoria',line:'Decisioni, fatti confermati e risultati che gli agenti ricordano.',href:'/agency/memory.html'}
];
const num=v=>Number.isInteger(v)&&v>=0?v:null;
// {servizi, clienti, progetti, approvazioni}: a number only where the source answered; null otherwise.
function counts({core,clients,projects,dashboard}={}){
 const c=core||crea(),d=dashboard&&typeof dashboard==='object'?dashboard:null;
 return {
  servizi:c.CARDS.length,
  clienti:Array.isArray(clients)?clients.length:null,
  progetti:Array.isArray(projects)?projects.filter(p=>p&&p.status!=='archived').length:null,
  approvazioni:d&&d.approvalsSupported===true&&d.metrics?num(d.metrics.approvals):null
 };
}
const countText=(n,unit)=>n==null?'':n+' '+(n===1?unit[0]:unit[1]);
// The orbit: the planets sit still on one ring around the core, evenly spaced from the top, each with its label
// centred under it, so labels never cross (only a slow float and the sky move). Sizes in px; the label box is the
// widest label the stage allows (orbit.css .mo-planet-label: max-width 148px, two lines of 13–14px at most 40px).
const SIZE=Object.freeze({planet:56,label:{w:148,h:40,gap:10},core:64,pad:16});
function ring(n,w,h){
 const S=SIZE,a=i=>-Math.PI/2+i*2*Math.PI/n,angles=Array.from({length:n},(_,i)=>a(i));
 const cx=w/2,cy=h/2-(S.label.gap+S.label.h)/2;
 const below=S.planet/2+S.label.gap+S.label.h,maxSin=Math.max(...angles.map(Math.sin),.01);
 const rx=Math.max(120,Math.min(330,w/2-S.label.w/2-S.pad));
 const ry=Math.max(100,Math.min(220,rx*.72,cy-S.planet/2-S.pad,(h-S.pad-below-cy)/maxSin));
 const planets=angles.map(t=>{const x=cx+Math.cos(t)*rx,y=cy+Math.sin(t)*ry;
  return {x,y,angle:t,depth:Math.sin(t),sphere:{x:x-S.planet/2,y:y-S.planet/2,w:S.planet,h:S.planet},
   label:{x:x-S.label.w/2,y:y+S.planet/2+S.label.gap,w:S.label.w,h:S.label.h}}});
 return {cx,cy,rx,ry,core:S.core,planets};
}
// True when two boxes {x,y,w,h} share any area.
const hit=(a,b)=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;
// Distance from the core centre to the nearest point of a box.
const reach=(cx,cy,b)=>Math.hypot(Math.max(b.x-cx,0,cx-b.x-b.w),Math.max(b.y-cy,0,cy-b.y-b.h));
// ---- Home «A»: the globe with the areas in orbit, the command bar and its suggestions, the work in progress. ----
// One line per area under its name on the area cards (what the area is for; no numbers).
const AREA_LINE=Object.freeze({brand:'Nome, identità visiva e tono di voce.',strategia:'Obiettivi, pubblico, concorrenti e lanci.',
 web:'Sito, SEO, annunci e schede prodotto.',social:'Piano editoriale, testi, PR ed eventi.',email:'Newsletter, sequenze e SMS.',
 stampa:'PDF per tipografia, cataloghi, slide.',immagini:'Foto per post e sito, 3 proposte.',video:'Avatar, video parlati e reel prodotto.'});
// Where a service opens: its own page for the project (crea-core linkFor), else «Cosa vuoi fare» with the studio open.
function serviceHref(card,projectId,core){
 const c=core||crea(),pid=/^[a-z0-9-]{1,80}$/i.test(String(projectId||''))?String(projectId):'';
 const direct=c.linkFor(card,pid);if(direct)return direct;
 if(!card.inline&&card.href&&!pid)return card.href.replace(/[?&]project=\{p\}/,'').replace('.html&','.html?');
 return CREA+'?open='+encodeURIComponent(card.id)+(pid?'&project='+encodeURIComponent(pid):'');
}
// Adds query parameters to a same-site href, before its #hash.
function withParams(href,params){
 const [base,hash]=String(href).split('#'),q=Object.entries(params).filter(([,v])=>v!=null&&v!=='').map(([k,v])=>k+'='+encodeURIComponent(v)).join('&');
 return q?base+(base.includes('?')?'&':'?')+q+(hash!=null?'#'+hash:''):String(href);
}
// Text matching for the command bar: one source, agency/crea-core.js (words, synonyms, scores), shared with
// «Cosa vuoi fare oggi?» so the home and the panel pick the same service for the same text.
const words=s=>crea().words(s);
const SYNONYMS=crea().SYNONYMS;
// The services that match the typed text, best first: [{card,score}]; score 0 is never returned.
function matchServices(query,core){const c=core||crea();return crea().matchServices(query,c.CARDS)}
// What a waiting project step asks of a person, with where it is done.
const STEP_HREF=Object.freeze({brief:'/project-editorial.html?project={p}#brief',ped:'/project-editorial.html?project={p}#ped',tasks:'/agency/project-workspace.html?id={p}',pm:'/radix-pm-concept.html?project={p}'});
const STEP_ASK=Object.freeze({brief:'Approva la strategia',ped:'Approva i contenuti del piano',tasks:'Rivedi le bozze degli agenti',pm:'Rivedi le attività in revisione'});
const stepHref=(id,pid)=>STEP_HREF[id]?STEP_HREF[id].replace('{p}',encodeURIComponent(pid)):'';
const FIRST=['strategy','identita','social','site'],FILL=['newsletter','images','seo','site','video','identita'];
// The suggestions under «Cosa vuoi fare oggi?», derived only from what is typed and from the project's real state
// (its journey and its Agency tasks). Same input, same list. [{id,kind,label,hint,icon,href}], at most `limit`.
function suggest({query='',project=null,journey=null,tasks=null,core,limit=5}={}){
 const c=core||crea(),pid=project&&project.id||'',look=(node?require('./marketing-look.js'):root.RadixMarketingLook).CARDS;
 const svc=(card,label,hint)=>({id:'svc-'+card.id,kind:'service',label,hint,icon:look[card.id]||'spark',href:serviceHref(card,pid,c)});
 const q=String(query||'').trim();
 if(q)return matchServices(q,c).slice(0,limit).map(({card})=>svc(card,card.title,card.group));
 const out=[];
 if(pid){
  const drafts=(Array.isArray(tasks)?tasks:[]).filter(t=>t&&t.status==='done').length;
  if(drafts)out.push({id:'review',kind:'step',label:'Rivedi '+drafts+(drafts===1?' bozza da approvare':' bozze da approvare'),hint:project.name,icon:'check',href:stepHref('tasks',pid)});
  const steps=journey&&Array.isArray(journey.steps)?journey.steps:[];
  const wait=steps.find(s=>s&&s.state==='waiting'&&STEP_ASK[s.id]&&!(s.id==='tasks'&&drafts));
  if(wait)out.push({id:'step-'+wait.id,kind:'step',label:STEP_ASK[wait.id],hint:String(wait.detail||project.name),icon:'check',href:stepHref(wait.id,pid)});
 }
 const st=id=>{const s=journey&&Array.isArray(journey.steps)?journey.steps.find(x=>x&&x.id===id):null;return s?s.state:null};
 const ids=[];
 if(!pid)ids.push(...FIRST);
 else{
  if(st('brief')!=='done')ids.push('strategy');
  ids.push(st('ped')&&st('ped')!=='todo'?'graphics':'social');
 }
 for(const id of [...ids,...FILL]){if(out.length>=limit)break;const card=c.card(id);if(card&&!out.some(x=>x.id==='svc-'+id))out.push(svc(card,card.action,card.title))}
 return out.slice(0,limit);
}
// Where the bar goes on Enter with no suggestion picked: the best matching service with the text, else the panel.
function resolve(query,{projectId='',core}={}){
 const c=core||crea(),q=String(query||'').trim().slice(0,200),best=q?matchServices(q,c)[0]:null,pid=/^[a-z0-9-]{1,80}$/i.test(String(projectId||''))?String(projectId):'';
 if(best&&best.score>=3)return withParams(serviceHref(best.card,pid,c),{q});
 return withParams(CREA,{q,project:pid});
}
// Agency tasks of the team projects (agency-workspace documents): the open ones, the drafts to review first.
const TASK_TONE=Object.freeze({done:'review',error:'error',changes_requested:'review',running:'progress',proposed:'todo'});
const TASK_RANK=Object.freeze({done:0,error:1,changes_requested:2,running:3,proposed:4});
function jobs(projects,plans,{roles={},status={},limit=8}={}){
 const list=[],get=id=>plans instanceof Map?plans.get(id):plans&&plans[id];
 for(const p of Array.isArray(projects)?projects:[]){
  if(!p||p.status==='archived')continue;
  const all=(get(p.id)&&Array.isArray(get(p.id).tasks)?get(p.id).tasks:[]).filter(t=>t&&typeof t==='object');
  const approved=all.filter(t=>t.status==='approved').length;
  for(const t of all){if(!(t.status in TASK_RANK))continue;
   list.push({project:{id:p.id,name:String(p.name||''),client:p.client_name||''},title:String(t.instruction||t.title||'Incarico').replace(/\s+/g,' ').trim().slice(0,140),
    role:String(t.role||''),agent:roles[t.role]||String(t.role||'—'),status:t.status,label:status[t.status]||t.status,tone:TASK_TONE[t.status],
    progress:{done:approved,total:all.length},href:'/agency/project-workspace.html?id='+encodeURIComponent(p.id),updated:p.updated_at||''})}
 }
 list.sort((a,b)=>TASK_RANK[a.status]-TASK_RANK[b.status]||String(b.updated).localeCompare(String(a.updated))||a.project.name.localeCompare(b.project.name));
 return {total:list.length,review:list.filter(j=>j.status==='done').length,rows:list.slice(0,limit)};
}
// The nine phases of the agency flow (lib/project-journey.js PHASES), shown when no project has its own.
const FLOW=Object.freeze(['Brief','Ricerca','Strategia','Approvazione strategia','PED','Produzione','Revisione','Pubblicazione','Risultati']);
// The project shown in the hero: the one chosen in «Cosa vuoi fare» if still active, else the most recently updated.
function currentProject(projects,remembered){
 const live=(Array.isArray(projects)?projects:[]).filter(p=>p&&p.status!=='archived');
 return live.find(p=>p.id===remembered)||live.slice().sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||'')))[0]||null;
}
// The globe: three tilted orbits around the earth (radii in units of the earth radius R), one node per area on an
// orbit, and each area's label in free space next to its node. A label never touches an orbit line, the earth with its
// glow, a node or another label; when they do not fit, the earth gets smaller. Pure: the page measures the labels.
const ORBITS=Object.freeze([{rx:1.78,ry:.44,a:-.30},{rx:1.5,ry:.76,a:.50},{rx:1.9,ry:.6,a:.08}]);
const GLOBE=Object.freeze({halo:1.14,pad:6,gap:6,node:7,spread:40,cell:4,step:8,samples:360,minR:34,maxTurn:.75});
function orbitPoint(o,cx,cy,R,t){const ex=Math.cos(t)*o.rx*R,ey=Math.sin(t)*o.ry*R;return {x:cx+ex*Math.cos(o.a)-ey*Math.sin(o.a),y:cy+ex*Math.sin(o.a)+ey*Math.cos(o.a),front:Math.sin(t)>0}}
// Distance from a point to the nearest point of a box.
const toBox=(x,y,b)=>Math.hypot(Math.max(b.x-x,0,x-b.x-b.w),Math.max(b.y-y,0,y-b.y-b.h));
function globeLayout(W,H,sizes,opts={}){
 const G={...GLOBE,...opts},n=sizes.length,C=G.cell,cols=Math.ceil(W/C),rows=Math.ceil(H/C);
 const maxR=Math.min((W-2*G.pad)/2/1.95,(H-2*G.pad)/2/1.0,opts.maxR||Infinity);
 const mark=(grid,x0,y0,x1,y1)=>{for(let j=Math.max(0,Math.floor(y0/C));j<=Math.min(rows-1,Math.floor(y1/C));j++)for(let i=Math.max(0,Math.floor(x0/C));i<=Math.min(cols-1,Math.floor(x1/C));i++)grid[j*cols+i]=1};
 // Summed-area table of the blocked cells: «is this box free?» in four reads.
 const table=grid=>{const S=new Uint32Array((cols+1)*(rows+1));for(let j=0;j<rows;j++){let run=0;for(let i=0;i<cols;i++){run+=grid[j*cols+i];S[(j+1)*(cols+1)+i+1]=S[j*(cols+1)+i+1]+run}}return S};
 const target=k=>-Math.PI/2+k*2*Math.PI/n;let fallback=null;
 for(let R=maxR;R>=G.minR;R*=.93){
  const cx=W/2,cy=H/2,base=new Uint8Array(cols*rows);
  const samples=ORBITS.map((o,k)=>Array.from({length:G.samples},(_,s)=>({...orbitPoint(o,cx,cy,R,s/G.samples*2*Math.PI),orbit:k})));
  for(const list of samples)for(const p of list)mark(base,p.x-G.pad,p.y-G.pad,p.x+G.pad,p.y+G.pad);
  const halo=R*G.halo+G.pad;mark(base,cx-halo,cy-halo,cx+halo,cy+halo);// the earth's square: labels stay off the glow
  for(const b of opts.blocked||[])mark(base,b.x-G.gap,b.y-G.gap,b.x+b.w+G.gap,b.y+b.h+G.gap);// controls drawn on the stage (the pause button)
  // One placement in a given order; cost = how far, in angle, each label ended from its own side of the earth.
  const attempt=order=>{
   const grid=base.slice(),labels=new Array(n),nodes=new Array(n);let S=table(grid),cost=0,worst=0;
   const free=b=>{if(b.x<0||b.y<0||b.x+b.w>W||b.y+b.h>H)return false;const i0=Math.floor(b.x/C),j0=Math.floor(b.y/C),i1=Math.min(cols-1,Math.floor((b.x+b.w)/C))+1,j1=Math.min(rows-1,Math.floor((b.y+b.h)/C))+1,c1=cols+1;
    return S[j1*c1+i1]-S[j0*c1+i1]-S[j1*c1+i0]+S[j0*c1+i0]===0};
   for(const k of order){
    const {w,h}=sizes[k],th=target(k),tx=cx+Math.cos(th)*W*.46,ty=cy+Math.sin(th)*H*.46;let best=null;
    for(let y=0;y+h<=H;y+=G.step)for(let x=0;x+w<=W;x+=G.step){const b={x,y,w,h};if(!free(b))continue;
     // Stay on the area's side of the earth first (angle, in stage proportions), then close to its spot.
     const ang=Math.atan2((y+h/2-cy)/H,(x+w/2-cx)/W),da=Math.abs(Math.atan2(Math.sin(ang-th),Math.cos(ang-th)));
     const d=da*Math.max(W,H)*.6+Math.hypot(x+w/2-tx,y+h/2-ty)*.5;if(!best||d<best.d)best={b,d,da}}
    if(!best)return null;
    // The node: the closest orbit point to the label beside the earth, apart from the other nodes and labels.
    let nb=null;for(const list of samples)for(const p of list){
     if(Math.hypot(p.x-cx,p.y-cy)<R*G.halo+G.node)continue;if(nodes.some(q=>q&&Math.hypot(q.x-p.x,q.y-p.y)<G.spread))continue;
     const d=toBox(p.x,p.y,best.b);if(d<G.node+G.gap||labels.some(l=>l&&toBox(p.x,p.y,l)<G.node+G.gap)||(opts.blocked||[]).some(b=>toBox(p.x,p.y,b)<G.node+G.gap))continue;
     if(!nb||d<nb.d)nb={p,d}}
    if(!nb)return null;
    labels[k]=best.b;nodes[k]={x:nb.p.x,y:nb.p.y,orbit:nb.p.orbit,front:nb.p.front};cost+=best.da+nb.d/Math.max(W,H);worst=Math.max(worst,best.da);
    mark(grid,best.b.x-G.gap,best.b.y-G.gap,best.b.x+best.b.w+G.gap,best.b.y+best.b.h+G.gap);
    mark(grid,nb.p.x-G.node-G.gap,nb.p.y-G.node-G.gap,nb.p.x+G.node+G.gap,nb.p.y+G.node+G.gap);S=table(grid);
   }
   return {labels,nodes,cost,worst};
  };
  // Every starting label, both ways round: the greedy order changes who gets the contested spots.
  // A layout is good when every label is on its own side and they go round the earth in the areas' order.
  const inOrder=ls=>{const a=ls.map(b=>Math.atan2((b.y+b.h/2-cy)/H,(b.x+b.w/2-cx)/W));let turn=0;
   for(let k=0;k<n;k++){let d=a[(k+1)%n]-a[k];while(d<=0)d+=2*Math.PI;turn+=d}return Math.abs(turn-2*Math.PI)<1e-6};
  const good=r=>r&&r.worst<=G.maxTurn&&inOrder(r.labels);
  let best=null;const idx=Array.from({length:n},(_,i)=>i);
  for(let s=0;s<n&&!good(best);s++)for(const dir of [1,-1]){const r=attempt(idx.map(i=>((s+dir*i)%n+n)%n));if(r&&(!best||(good(r)&&!good(best))||(good(r)===good(best)&&r.cost<best.cost)))best=r;if(good(best))break}
  if(!best)continue;
  const out={cx,cy,R,orbits:ORBITS.map(o=>({rx:o.rx*R,ry:o.ry*R,a:o.a})),labels:best.labels,nodes:best.nodes};
  // Every label on its own side of the earth (within maxTurn radians), else a smaller earth leaves more room.
  if(good(best))return out;if(!fallback)fallback=out;
 }
 return fallback;
}
// Label size estimate for the tests and before the fonts load: dot, name at 13px/600, count under it.
const labelSize=(name,compact)=>compact?{w:Math.ceil(18+String(name).length*6.4),h:30}:{w:Math.ceil(28+String(name).length*7.3),h:42};
return Object.freeze({LOOK,STUDIOS,SECTIONS,SIZE,planets,counts,countText,ring,hit,reach,
 AREA_LINE,SYNONYMS,STEP_HREF,FLOW,ORBITS,GLOBE,serviceHref,withParams,words,matchServices,suggest,resolve,jobs,currentProject,orbitPoint,toBox,globeLayout,labelSize});
});
