/* Marketing Orbit page: draws the planets (links to «Cosa vuoi fare oggi?» filtered on each area) around the brand core,
   the sky on a canvas, and the section cards with the counts the registry really has. Pure part: agency/orbit-core.js.
   The orbit stops with prefers-reduced-motion, with the pause button, while a planet has the pointer or the focus, when
   the tab is hidden and when the stage is off screen. On phones the planets become a static list under the core. */
(function(){'use strict';
const $=id=>document.getElementById(id),O=window.RadixOrbit,ws=window.RadixWorkspace;
const stage=$('moStage'),sky=$('moSky'),list=$('moPlanets'),pauseBtn=$('moPause'),ctx=sky.getContext&&sky.getContext('2d');
const still=window.matchMedia?matchMedia('(prefers-reduced-motion: reduce)'):{matches:false},phone=window.matchMedia?matchMedia('(max-width: 640px)'):{matches:false};
function node(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n}
const planets=O.planets();
const els=planets.map(p=>{const li=node('li','mo-orbiter'),a=node('a','mo-planet');a.href=p.href;a.style.setProperty('--c',p.color);
 a.setAttribute('aria-label',p.group+': '+p.count+(p.count===1?' servizio':' servizi')+' ('+p.services.join(', ')+')');a.title=p.services.join(' · ');
 const txt=node('span');txt.append(node('b','',p.group),node('small','',p.count+(p.count===1?' servizio':' servizi')));
 a.append(node('i','',p.icon),txt);li.append(a);list.append(li);return li});
// Sections
const cards=new Map();
$('moSections').replaceChildren(...O.SECTIONS.map(s=>{
 const li=node('li','mo-card'),head=node('a','mo-card-head');li.dataset.section=s.id;head.href=s.href;
 head.append(node('i','',s.icon),node('h3','',s.title));li.append(head);
 const n=node('strong','mo-count');n.hidden=true;li.append(n,node('p','',s.line));if(s.count)cards.set(s.count,{el:n,unit:s.unit});
 if(s.links){const ul=node('ul','mo-links');s.links.forEach(l=>{const x=node('li'),a=node('a','',l.label);a.href=l.href;x.append(a);ul.append(x)});li.append(ul)}
 return li}));
function showCounts(c){for(const [k,{el,unit}] of cards){const t=O.countText(c[k],unit);el.textContent=t;el.hidden=!t}}
showCounts(O.counts({}));
// Sky: stars, rings, particles along the rings and faint lines to the planets.
let W=0,H=0,dpr=1,stars=[],motes=[],t0=performance.now(),paused=false,held=false,visible=true,raf=0,frozenAt=0;
function size(){const r=stage.getBoundingClientRect();dpr=Math.min(2,window.devicePixelRatio||1);W=Math.max(1,r.width);H=Math.max(1,r.height);
 if(ctx){sky.width=Math.round(W*dpr);sky.height=Math.round(H*dpr)}
 const seed=n=>{let x=Math.sin(n*9301+49297)*233280;return x-Math.floor(x)};
 stars=Array.from({length:Math.round(W*H/5200)},(_,i)=>({x:seed(i)*W,y:seed(i+.5)*H,r:.4+seed(i+.25)*1.2,ph:seed(i+.75)*6.3}));
 motes=Array.from({length:26},(_,i)=>({ring:i%2,a:seed(i+3.1)*6.3,v:.12+seed(i+7.7)*.18,c:planets[i%planets.length].color}))}
// On phones the core sits in the top 210px of the stage (orbit.css), so the rings are drawn around it there.
const skyH=()=>phone.matches?Math.min(H,210):H,ring=n=>O.orbitPoint(n,planets.length,0,W,skyH());
function draw(t){
 if(!ctx)return;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
 for(const s of stars){ctx.globalAlpha=.25+.55*(.5+.5*Math.sin(s.ph+t*.8));ctx.fillStyle='#dfe6ff';ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,6.283);ctx.fill()}
 ctx.globalAlpha=1;const cx=W/2,cy=skyH()/2,rings=[ring(0),ring(1)];
 rings.forEach((r,i)=>{ctx.strokeStyle=i?'rgba(166,139,255,.38)':'rgba(255,95,162,.32)';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(cx,cy,r.rx,r.ry,r.tilt,0,6.283);ctx.stroke()});
 const glow=ctx.createRadialGradient(cx,cy,0,cx,cy,Math.min(W,skyH())*.6);glow.addColorStop(0,'rgba(255,95,162,.22)');glow.addColorStop(.45,'rgba(166,139,255,.10)');glow.addColorStop(1,'rgba(5,10,28,0)');
 ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);
 for(const m of motes){const r=rings[m.ring],a=m.a+t*m.v*(m.ring?1.3:1),x0=Math.cos(a)*r.rx,y0=Math.sin(a)*r.ry,x=cx+x0*Math.cos(r.tilt)-y0*Math.sin(r.tilt),y=cy+x0*Math.sin(r.tilt)+y0*Math.cos(r.tilt);
  ctx.globalAlpha=.35+.45*(Math.sin(a)+1)/2;ctx.fillStyle=m.c;ctx.shadowColor=m.c;ctx.shadowBlur=8;ctx.beginPath();ctx.arc(x,y,1.6,0,6.283);ctx.fill()}
 ctx.shadowBlur=0;ctx.globalAlpha=1;
 if(!phone.matches)planets.forEach((p,i)=>{const q=O.orbitPoint(i,planets.length,t,W,H),g=ctx.createLinearGradient(cx,cy,q.x,q.y);g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(1,p.color);
  ctx.globalAlpha=.10+.12*(q.depth+1)/2;ctx.strokeStyle=g;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(q.x,q.y);ctx.stroke()});
 ctx.globalAlpha=1;
}
function place(t){
 if(phone.matches){els.forEach(li=>{li.style.transform='';li.style.zIndex=''});return}
 els.forEach((li,i)=>{const q=O.orbitPoint(i,planets.length,t,W,H);li.style.transform='translate('+q.x.toFixed(1)+'px,'+q.y.toFixed(1)+'px) translate(-50%,-50%) scale('+q.scale.toFixed(3)+')';
  li.style.zIndex=q.depth>0?'6':'2';li.dataset.depth=q.depth>0?'front':'back'})}
const moving=()=>!still.matches&&!paused&&!held&&visible&&!document.hidden;
function now(){return frozenAt}
function frame(ms){raf=0;frozenAt=(ms-t0)/1000;draw(frozenAt);place(frozenAt);if(moving())raf=requestAnimationFrame(frame)}
function run(){if(raf)return;if(moving()){t0=performance.now()-frozenAt*1000;raf=requestAnimationFrame(frame)}else{draw(now());place(now())}}
function stop(){if(raf){cancelAnimationFrame(raf);raf=0}}
function refresh(){stop();size();draw(now());place(now());run()}
pauseBtn.hidden=still.matches;
pauseBtn.addEventListener('click',()=>{paused=!paused;pauseBtn.setAttribute('aria-pressed',String(paused));pauseBtn.textContent=paused?'Riprendi l’animazione':'Ferma l’animazione';paused?stop():run()});
els.forEach(li=>{li.addEventListener('pointerenter',()=>{held=true;stop()});li.addEventListener('pointerleave',()=>{held=false;run()})});
list.addEventListener('focusin',()=>{held=true;stop()});list.addEventListener('focusout',e=>{if(!list.contains(e.relatedTarget)){held=false;run()}});
document.addEventListener('visibilitychange',()=>{document.hidden?stop():run()});
if(window.IntersectionObserver)new IntersectionObserver(es=>{visible=es[0].isIntersecting;visible?run():stop()}).observe(stage);
if(window.ResizeObserver)new ResizeObserver(refresh).observe(stage);else window.addEventListener('resize',refresh);
[still,phone].forEach(m=>m.addEventListener&&m.addEventListener('change',()=>{pauseBtn.hidden=still.matches;refresh()}));
refresh();
// Live counts: registry (clients, projects) and the Command Center summary (approvals awaiting a decision).
async function live(){
 const note=$('moNote');
 if(!ws){note.textContent='Registro del team non caricato: ricarica la pagina.';return}
 try{
  if(!(await ws.ready())){note.textContent='Accedi dal Command Center per vedere clienti, progetti e approvazioni.';return}
  const [clients,projects,dashboard]=await Promise.all([ws.clients.list().catch(()=>null),ws.projects.list().catch(()=>null),
   fetch('/api/state?view=dashboard',{credentials:'same-origin',cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null)]);
  const c=O.counts({clients,projects,dashboard});showCounts(c);
  note.textContent=c.progetti==null?'Progetti non disponibili in questo momento.':c.progetti?'Dati dal registro del team.':'Nessun progetto ancora: crea il primo con «Nuovo progetto».';
 }catch(e){note.textContent='Registro non raggiungibile: '+e.message}
}
live();
})();
