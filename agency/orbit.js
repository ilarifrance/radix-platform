/* Marketing Orbit page: draws the planets (links to «Cosa vuoi fare oggi?» filtered on each area) around the brand core,
   the sky on a canvas, and the section cards with the counts the registry really has. Pure part: agency/orbit-core.js,
   icons and colours: agency/marketing-look.js. The planets sit still on one ring (orbit-core ring(): labels never
   cross); only a slow float, the light along the ring and the stars move. Motion stops with prefers-reduced-motion,
   with the pause button, while a planet has the pointer or the focus, when the tab is hidden and when the stage is
   off screen. On phones the planets become a list under the core. */
(function(){'use strict';
const $=id=>document.getElementById(id),O=window.RadixOrbit,L=window.RadixMarketingLook,ws=window.RadixWorkspace;
const stage=$('moStage'),sky=$('moSky'),list=$('moPlanets'),pauseBtn=$('moPause'),ctx=sky.getContext&&sky.getContext('2d');
const still=window.matchMedia?matchMedia('(prefers-reduced-motion: reduce)'):{matches:false},phone=window.matchMedia?matchMedia('(max-width: 640px)'):{matches:false};
function node(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n}
const servizi=n=>n+(n===1?' servizio':' servizi');
const planets=O.planets();
let active=-1;
const els=planets.map((p,i)=>{const li=node('li','mo-orbiter'),a=node('a','mo-planet');a.href=p.href;a.style.setProperty('--c',p.color);
 a.setAttribute('aria-label',p.group+': '+servizi(p.count)+' ('+p.services.join(', ')+')');a.title=p.services.join(' · ');
 const txt=node('span','mo-planet-label');txt.append(node('b','',p.group),node('small','',servizi(p.count)));
 a.append(L.icon(p.icon,'mo-orb'),txt,L.icon('chev','mo-planet-go'));li.append(a);list.append(li);
 a.addEventListener('pointerenter',()=>{active=i;paint()});a.addEventListener('pointerleave',()=>{active=-1;paint()});
 a.addEventListener('focus',()=>{active=i;paint()});a.addEventListener('blur',()=>{active=-1;paint()});
 return li});
// Sections: the whole card opens its page; the studio and result links inside stay their own links.
const cards=new Map();
$('moSections').replaceChildren(...O.SECTIONS.map(s=>{
 const li=node('li','mo-card'),head=node('a','mo-card-head');li.dataset.section=s.id;head.href=s.href;
 head.append(L.icon(s.icon,'mo-card-icon'),node('h3','',s.title),L.icon('arrow','mo-card-go'));li.append(head);
 const n=node('strong','mo-count');n.hidden=true;li.append(n,node('p','',s.line));if(s.count)cards.set(s.count,{el:n,unit:s.unit});
 if(s.links){const ul=node('ul','mo-links');s.links.forEach(l=>{const x=node('li'),a=node('a','',l.label);a.href=l.href;x.append(a);ul.append(x)});li.append(ul)}
 return li}));
function showCounts(c){for(const [k,{el,unit}] of cards){const t=O.countText(c[k],unit);el.textContent=t;el.hidden=!t}}
showCounts(O.counts({}));
// Sky: stars, the ring with light running along it, faint spokes from the core to each planet.
let W=0,H=0,dpr=1,stars=[],motes=[],geo=null,t0=performance.now(),paused=false,held=false,visible=true,raf=0,frozenAt=0;
const PHONE_SKY=220;
function size(){const r=stage.getBoundingClientRect();dpr=Math.min(2,window.devicePixelRatio||1);W=Math.max(1,r.width);H=Math.max(1,r.height);
 if(ctx){sky.width=Math.round(W*dpr);sky.height=Math.round(H*dpr)}
 const seed=n=>{let x=Math.sin(n*9301+49297)*233280;return x-Math.floor(x)};
 stars=Array.from({length:Math.round(W*H/7000)},(_,i)=>({x:seed(i)*W,y:seed(i+.5)*H,r:.35+seed(i+.25)*.9,ph:seed(i+.75)*6.3}));
 motes=Array.from({length:14},(_,i)=>({a:seed(i+3.1)*6.3,v:.05+seed(i+7.7)*.06,c:planets[i%planets.length].color}));
 geo=phone.matches?null:O.ring(planets.length,W,H)}
// On phones the core sits in the top of the stage (orbit.css), with its rings drawn around it.
function shape(){if(geo)return {cx:geo.cx,cy:geo.cy,rx:geo.rx,ry:geo.ry};const cy=PHONE_SKY/2;return {cx:W/2,cy,rx:Math.min(W/2-24,150),ry:62}}
function draw(t){
 if(!ctx)return;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
 for(const s of stars){ctx.globalAlpha=.18+.4*(.5+.5*Math.sin(s.ph+t*.6));ctx.fillStyle='#dfe6ff';ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,6.283);ctx.fill()}
 const {cx,cy,rx,ry}=shape();
 const glow=ctx.createRadialGradient(cx,cy,0,cx,cy,Math.max(rx,ry)*1.1);glow.addColorStop(0,'rgba(255,95,162,.16)');glow.addColorStop(.5,'rgba(166,139,255,.06)');glow.addColorStop(1,'rgba(5,10,28,0)');
 ctx.globalAlpha=1;ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);
 // Rings: the planets' ring, a wider faint one and a dashed one close to the core.
 const line=ctx.createLinearGradient(cx-rx,cy,cx+rx,cy);line.addColorStop(0,'rgba(166,139,255,.34)');line.addColorStop(.5,'rgba(255,95,162,.42)');line.addColorStop(1,'rgba(66,220,247,.30)');
 ctx.lineWidth=1;ctx.strokeStyle=line;ctx.beginPath();ctx.ellipse(cx,cy,rx,ry,0,0,6.283);ctx.stroke();
 ctx.strokeStyle='rgba(166,139,255,.10)';ctx.beginPath();ctx.ellipse(cx,cy,rx*1.16,ry*1.2,0,0,6.283);ctx.stroke();
 ctx.setLineDash([2,6]);ctx.strokeStyle='rgba(255,190,225,.22)';ctx.beginPath();ctx.ellipse(cx,cy,rx*.48,ry*.52,0,0,6.283);ctx.stroke();ctx.setLineDash([]);
 for(const m of motes){const a=m.a+t*m.v,x=cx+Math.cos(a)*rx,y=cy+Math.sin(a)*ry;
  ctx.globalAlpha=.25+.35*(Math.sin(a)+1)/2;ctx.fillStyle=m.c;ctx.shadowColor=m.c;ctx.shadowBlur=6;ctx.beginPath();ctx.arc(x,y,1.4,0,6.283);ctx.fill()}
 ctx.shadowBlur=0;
 if(geo)geo.planets.forEach((q,i)=>{const on=i===active,g=ctx.createLinearGradient(cx,cy,q.x,q.y);g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(1,planets[i].color);
  ctx.globalAlpha=on?.55:.12;ctx.lineWidth=on?1.4:1;ctx.strokeStyle=g;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(q.x,q.y+bob(i,t));ctx.stroke()});
 ctx.globalAlpha=1;ctx.lineWidth=1;
}
const bob=(i,t)=>still.matches?0:Math.sin(t*.55+i*.9)*3;
function place(t){
 if(!geo){els.forEach(li=>{li.style.transform=''});return}
 els.forEach((li,i)=>{const q=geo.planets[i];li.style.transform='translate('+(q.x-q.label.w/2).toFixed(1)+'px,'+(q.y-q.sphere.h/2+bob(i,t)).toFixed(1)+'px)';li.dataset.depth=q.depth>0?'front':'back'})}
const moving=()=>!still.matches&&!paused&&!held&&visible&&!document.hidden;
function paint(){if(!raf){draw(frozenAt);place(frozenAt)}}
function frame(ms){raf=0;frozenAt=(ms-t0)/1000;draw(frozenAt);place(frozenAt);if(moving())raf=requestAnimationFrame(frame)}
function run(){if(raf)return;if(moving()){t0=performance.now()-frozenAt*1000;raf=requestAnimationFrame(frame)}else paint()}
function stop(){if(raf){cancelAnimationFrame(raf);raf=0}}
function refresh(){stop();size();paint();run()}
// The pause button: an icon and its label; the label says what a press does.
const pauseLabel=node('span','mo-pause-label','Ferma l’animazione'),pauseIcon=node('span','mo-pause-icon');pauseIcon.setAttribute('aria-hidden','true');
function showPause(){pauseIcon.innerHTML=L.svg(paused?'play':'pause');pauseLabel.textContent=paused?'Riprendi l’animazione':'Ferma l’animazione'}
pauseBtn.replaceChildren(pauseIcon,pauseLabel);showPause();
pauseBtn.hidden=still.matches;
pauseBtn.addEventListener('click',()=>{paused=!paused;pauseBtn.setAttribute('aria-pressed',String(paused));showPause();paused?stop():run()});
els.forEach(li=>{li.addEventListener('pointerenter',()=>{held=true;stop()});li.addEventListener('pointerleave',()=>{held=false;run()})});
list.addEventListener('focusin',()=>{held=true;stop()});list.addEventListener('focusout',e=>{if(!list.contains(e.relatedTarget)){held=false;run()}});
document.addEventListener('visibilitychange',()=>{document.hidden?stop():run()});
if(window.IntersectionObserver)new IntersectionObserver(es=>{visible=es[0].isIntersecting;visible?run():stop()}).observe(stage);
if(window.ResizeObserver)new ResizeObserver(refresh).observe(stage);else window.addEventListener('resize',refresh);
[still,phone].forEach(m=>m.addEventListener&&m.addEventListener('change',()=>{pauseBtn.hidden=still.matches;refresh()}));
refresh();
// Live counts: registry (clients, projects) and the Command Center summary (approvals awaiting a decision).
async function live(){
 const note=$('moNote'),set=(t,state)=>{note.textContent=t;note.dataset.state=state};
 if(!ws){set('Registro del team non caricato: ricarica la pagina.','error');return}
 try{
  if(!(await ws.ready())){set('Accedi dal Command Center per vedere clienti, progetti e approvazioni.','off');return}
  const [clients,projects,dashboard]=await Promise.all([ws.clients.list().catch(()=>null),ws.projects.list().catch(()=>null),
   fetch('/api/state?view=dashboard',{credentials:'same-origin',cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null)]);
  const c=O.counts({clients,projects,dashboard});showCounts(c);
  if(c.progetti==null)set('Progetti non disponibili in questo momento.','partial');
  else set(c.progetti?'Dati dal registro del team.':'Nessun progetto ancora: crea il primo con «Nuovo progetto».','live');
 }catch(e){set('Registro non raggiungibile: '+e.message,'error')}
}
live();
})();
