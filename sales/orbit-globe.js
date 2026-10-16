'use strict';
/* Sales Orbit globe: draws the earth, orbits, pedestal and the links to the
   relation nodes on one canvas behind the scene. Purely decorative: the CRM
   data and the nodes themselves come from orbit-higgsfield.js.
   LAND is a bitmask over a Fibonacci sphere of N points (1 = land), built
   from Natural Earth 1:50m land polygons (public domain, via world-atlas). */
(()=>{
const N=30000,LAND='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FaCCAFAQiApAQQAoCFUFoCAQFaCCAFAQigpQQQAoAAUFoCAQFaCCAFQAigpQUSAqQAUBoCgUFaCiQFQACgpAQSAqQAUBoAAUFYCCQFQACgpAQSgqQAWBqAAUFYCCQFSECgpAASgqQkWFqAgUFICCQFSEigJAASgqQAWFqAgUFYACUFSACgpRESgoQgWBqAgUFYACUFSACgpRASgoAgWEqAgVFYACUFCECgpRESgqQgWEqAAVFIICUlCECghBASgqAgWkoAgVFIICUFAECghRESgqBgWkoAgVEIICcFAECghBASooBgWkoAgUEIICUFAMCghBASogBgWkqAgUEIICUFQMCshBASogBgWkoAgUEIICUEAMCkhBESogBkWkoBgUEIICUEAMCkhBESogRAWgoBgVkIICUEAMCkhBESogBAWgoBgVkIIiUEAMCkhBESggBEWggBAVkIIiUEAICkBRISggRQWgiBgUkKIiUECICkABISggBQWggBgUgIICUEAMCkABISggBQWggBgUgKICUEAKCkABISgABQWggBgUgIJCUEAKCkABISgABQWggBAUgAJCUAAKCkABISgABQWgiBQUgAJCUAAKikABISgABYSgCBQUgAJCUAAKCkARKSgABYSgKBQUgQJCUAAKCkARKCgABYSgCBQUgSJSUAAKCEBRKCgABYSgABQUgCJQUACKCEFRKCgCRaSgABQUgKJQUAAKCEEBKCgCRaCgABQRgKJQUASKCEEBKCgCRaGgABQRgqJQUASKSEEBKCIARaGgABQRgiJQUASKQkEBKDIARaGgCBSVgCJQRASKQkEBKCIARaCoCBSFgiJQRACKQkERKCoARaCICBSFgiJQRACKQBERKCoBRaCICBSFgiJQRACKQBERKAoBRaCIABSBIiJQVACKQBERKAoFRaCIABSBIiJQFAKKQBERKApFRKCIABSBIiJQFIKKQBERKAJFRKAoABSBIiJQFIqIQhERKAJFRKAoABWBIiJQBIqIQFEQKgJFRKAoBBWBIiJUBIqIQFEAKgJFRKAIFBGBoiBUBIqIQFEAKgJFRKgIFBGBoiBUBIqIQFEoKgJFQKgIFBGBoiBUBIqAUBEoIgJFQagIFAGBomBUBIqAUBEoIgJFQagIFAGBIlBEBIqAUBEoAgJFQIgIFAGhIlAEBIqAUBEoAgJFwIgIFAGhIlAEBIqAEBEoAgJFoIgIFAGhIlAEBIqAEREoAkJFoAgIFAGhIlAEBIqAEREoAkJFoAgIFAEhIlAEBIpAERAoAkJFoAgIFAEjIlAEhIpAERAoAkJEoAgIFAEjIFAEhIpAERAoAkZEoAgIFAEiIFAEhIhAERAoAkZAoAgIFYEiIFAEhIhAERAoAkRAoAgIEYEiIFAEjIBAERAoAkRAoAAIEYEiIFAEiIBAERAiAkVAoAAYAYECIEAAiIBAARAiAkVAoAAQAYECIEAEiIBAARACAgVAgAAQAYECIEQECoAAASACAgVAgAAQAAECIAQACoAAACAAAgRAAAAQAAECQAAECIAAACAQAgRAAAAQAAECQAAECIAAACAAAgSAAAAQAAECQAAECIAAACAAAgSAAAAQAAEAQAAECIABACAAAgSAAAAQAAEAQCAECAABACAQAgCAAAAQAAAAQCAAAAABACAAAACAQAAAAAIAQAAAAAABAAAAAACAQAAAAAIAQAAAAAABAAAABACAAAAAAAIAQAAAAACBAAAABAAAAAgAAAIBAAAAAAABAAAABAIAAAgAAAIAAAAAAAABAAAABAIAAAgAAAIAAAAIBAAAEAAABAAAAAAAAAIAAAAIBAAAAAAABAAAABAIAAAAAAAIAAAAIBAABAAAABAAAAAAAAAIAAAAIBAAAAAAABAAAABAIAAAAAAAIAAAAAAAABAAAABAAAAAAAAAIAAAAAAAABAAAABAAAAAAAAAIAAAAIAAABAAAABAAAAAAAAAIAAAAIAAAAAAAABAAAAAAAEAAAAAAIAAAAAAAABAAAAAAAEAAAAAAIAAAAAAAAAAAAAAAAEAAAAAAIAAAAAAAAAAAAAIAAEAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAACAEAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAgEAAAoAQAgIAQAlIAQEBAiQkpACAkpESElpISElICSElICQkpASSkpGSUlpLSUlJCSUlI6SkpKaSkpPaWlpTSUltbS01p6T0tr6SgtvaWntfSentbTU3p+T0/p6S09reen/Pyen/Pze37ez+/5eT2/7+f9/L6e3/Pzfn/fz+v5fb2/5+f1/v6f3/P7f37f7+/9/b////f///7/////////';
const stage=document.querySelector('.orbit-stage');if(!stage||!window.HTMLCanvasElement)return;
const cv=document.createElement('canvas');cv.className='orbit-canvas';cv.setAttribute('aria-hidden','true');
const ctx=cv.getContext('2d');if(!ctx)return;
stage.insertBefore(cv,stage.firstChild);document.documentElement.classList.add('so-globe');

/* land points as unit vectors */
const raw=atob(LAND),ga=Math.PI*(3-Math.sqrt(5)),pts=[];
for(let i=0;i<N;i++){if(!(raw.charCodeAt(i>>3)>>(i&7)&1))continue;const y=1-(i+.5)/N*2,r=Math.sqrt(1-y*y),t=ga*i;
  /* deterministic hash: about 1 point in 9 is a "city light" */
  const h=Math.sin(i*12.9898)*43758.5453,f=h-Math.floor(h);pts.push([Math.cos(t)*r,y,-Math.sin(t)*r,f<.11?1:0,f])}
/* a few arcs between city lights, drawn as great circles */
const cities=pts.filter(p=>p[3]);const arcs=[];for(let k=0;k<14&&cities.length>2;k++){const a=cities[(k*977)%cities.length],b=cities[(k*1531+311)%cities.length];arcs.push([a,b])}

const reduce=matchMedia('(prefers-reduced-motion: reduce)');
let W=0,H=0,dpr=1,rot=.35;const tilt=.36,ct=Math.cos(tilt),st=Math.sin(tilt);
function size(){const r=cv.getBoundingClientRect();dpr=Math.min(2,window.devicePixelRatio||1);W=r.width;H=r.height;cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr)}
function geo(){const narrow=W<760;const cx=W*(narrow?.5:.53),cy=narrow?200:H*.43,R=narrow?Math.min(W*.3,130):Math.min(W*.18,H*.25);return{cx,cy,R}}
function proj(p,g){const cr=Math.cos(rot),sr=Math.sin(rot);let x=p[0]*cr-p[2]*sr,z=p[0]*sr+p[2]*cr,y=p[1];const y2=y*ct-z*st,z2=y*st+z*ct;return[g.cx+x*g.R,g.cy-y2*g.R,z2]}
function slerp(a,b,t){const d=Math.acos(Math.max(-1,Math.min(1,a[0]*b[0]+a[1]*b[1]+a[2]*b[2])))||1e-6,s=Math.sin(d),k1=Math.sin((1-t)*d)/s,k2=Math.sin(t*d)/s;const h=1+.12*Math.sin(Math.PI*t);return[(a[0]*k1+b[0]*k2)*h,(a[1]*k1+b[1]*k2)*h,(a[2]*k1+b[2]*k2)*h]}
const orbits=[{rx:2.25,ry:.62,a:-.2,c:'54,237,189',w:1.1,o:.55,s:.00011},{rx:1.95,ry:.95,a:.42,c:'54,237,189',w:.9,o:.35,s:-.00008},{rx:2.5,ry:.78,a:.12,c:'242,184,75',w:1,o:.45,s:.00006},{rx:1.62,ry:1.32,a:-.75,c:'84,203,218',w:.8,o:.28,s:.0001}];

function ellipse(g,o,from,to){ctx.beginPath();ctx.ellipse(g.cx,g.cy,o.rx*g.R,o.ry*g.R,o.a,from,to)}
function drawOrbits(g,t,front){for(const o of orbits){ctx.lineWidth=o.w;ctx.strokeStyle='rgba('+o.c+','+o.o+')';ctx.shadowColor='rgba('+o.c+',.8)';ctx.shadowBlur=6;
  /* the back half of each orbit goes behind the globe */
  ellipse(g,o,front?0:Math.PI,front?Math.PI:Math.PI*2);ctx.stroke();ctx.shadowBlur=0;
  for(let k=0;k<5;k++){const a=(t*o.s*(k%2?1:-1)+k*1.257+o.a*3)%(Math.PI*2),ang=(a+Math.PI*2)%(Math.PI*2);if(front!==(ang<Math.PI))continue;
    const ex=Math.cos(ang)*o.rx*g.R,ey=Math.sin(ang)*o.ry*g.R,x=g.cx+ex*Math.cos(o.a)-ey*Math.sin(o.a),y=g.cy+ex*Math.sin(o.a)+ey*Math.cos(o.a);
    const gr=ctx.createRadialGradient(x,y,0,x,y,9);gr.addColorStop(0,'rgba(255,240,200,.95)');gr.addColorStop(.25,'rgba('+o.c+',.8)');gr.addColorStop(1,'rgba('+o.c+',0)');ctx.fillStyle=gr;ctx.fillRect(x-9,y-9,18,18)}}}
function drawPedestal(g,t){const px=g.cx,py=g.cy+g.R*1.62,rx=g.R*1.25;
  const beam=ctx.createLinearGradient(0,g.cy+g.R*.6,0,py);beam.addColorStop(0,'rgba(80,255,220,0)');beam.addColorStop(1,'rgba(80,255,220,.35)');
  ctx.fillStyle=beam;ctx.beginPath();ctx.moveTo(px-g.R*.42,g.cy+g.R*.75);ctx.lineTo(px+g.R*.42,g.cy+g.R*.75);ctx.lineTo(px+5,py);ctx.lineTo(px-5,py);ctx.fill();
  for(let i=0;i<7;i++){const k=1-i*.13;ctx.beginPath();ctx.ellipse(px,py,rx*k,rx*k*.2,0,0,Math.PI*2);ctx.strokeStyle=i===2?'rgba(242,184,75,.45)':'rgba(84,240,210,'+(.18+i*.07)+')';ctx.lineWidth=i%3?1:2;
    ctx.setLineDash(i%2?[2,6+i]:[]);ctx.lineDashOffset=-t*.01*(i%2?1:-1);ctx.stroke()}ctx.setLineDash([]);
  const core=ctx.createRadialGradient(px,py,0,px,py,rx*.45);core.addColorStop(0,'rgba(220,255,245,.95)');core.addColorStop(.12,'rgba(80,255,220,.6)');core.addColorStop(1,'rgba(80,255,220,0)');
  ctx.save();ctx.translate(px,py);ctx.scale(1,.22);ctx.translate(-px,-py);ctx.fillStyle=core;ctx.beginPath();ctx.arc(px,py,rx*.45,0,Math.PI*2);ctx.fill();ctx.restore()}
function drawGlobe(g){const{cx,cy,R}=g;
  const at=ctx.createRadialGradient(cx,cy,R*.9,cx,cy,R*1.35);at.addColorStop(0,'rgba(60,255,210,.35)');at.addColorStop(.3,'rgba(40,220,190,.12)');at.addColorStop(1,'rgba(40,220,190,0)');ctx.fillStyle=at;ctx.beginPath();ctx.arc(cx,cy,R*1.35,0,Math.PI*2);ctx.fill();
  const sea=ctx.createRadialGradient(cx-R*.35,cy-R*.4,R*.05,cx,cy,R);sea.addColorStop(0,'#0f5d60');sea.addColorStop(.4,'#073a43');sea.addColorStop(.85,'#031d27');sea.addColorStop(1,'#02121a');ctx.fillStyle=sea;ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.fill();
  const s=Math.max(1,R/150);
  for(const p of pts){const q=proj(p,g);if(q[2]<0)continue;const l=.25+.75*q[2];
    if(p[3]){ctx.fillStyle='rgba(255,'+(190+Math.round(p[4]*400))+',110,'+(.55+.45*l)+')';ctx.fillRect(q[0]-s*.8,q[1]-s*.8,s*1.7,s*1.7)}
    else{ctx.fillStyle='rgba(120,255,220,'+(.22+.7*l)+')';ctx.fillRect(q[0]-s*.75,q[1]-s*.75,s*1.5,s*1.5)}}
  ctx.lineWidth=.8;for(const[a,b]of arcs){ctx.beginPath();let on=false;for(let i=0;i<=24;i++){const q=proj(slerp(a,b,i/24),g);if(q[2]<.05){on=false;continue}on?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]);on=true}ctx.strokeStyle='rgba(120,255,225,.35)';ctx.stroke()}
  const sh=ctx.createRadialGradient(cx-R*.45,cy-R*.5,R*.1,cx,cy,R*1.02);sh.addColorStop(0,'rgba(190,255,240,.16)');sh.addColorStop(.55,'rgba(0,0,0,0)');sh.addColorStop(1,'rgba(0,10,16,.55)');ctx.fillStyle=sh;ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.fill();
  ctx.lineWidth=2;ctx.strokeStyle='rgba(110,255,220,.85)';ctx.shadowColor='rgba(70,255,210,1)';ctx.shadowBlur=18;ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0}
function drawLinks(g){const cr=cv.getBoundingClientRect();ctx.lineWidth=1;
  for(const n of stage.querySelectorAll('.entity-node .circle')){const r=n.getBoundingClientRect();if(!r.width)continue;const x=r.left+r.width/2-cr.left,y=r.top+r.height/2-cr.top;
    const dx=g.cx-x,dy=g.cy-y,d=Math.hypot(dx,dy)||1,ex=g.cx-dx/d*g.R*.55,ey=g.cy-dy/d*g.R*.55,sx=x+dx/d*r.width*.62,sy=y+dy/d*r.width*.62;
    const lg=ctx.createLinearGradient(sx,sy,ex,ey);lg.addColorStop(0,'rgba(90,255,215,.75)');lg.addColorStop(1,'rgba(90,255,215,.08)');ctx.strokeStyle=lg;ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(ex,ey);ctx.stroke();
    ctx.fillStyle='rgba(150,255,230,.9)';ctx.beginPath();ctx.arc(sx,sy,2,0,Math.PI*2);ctx.fill()}}
function frame(t){if(!W)size();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);const g=geo();
  drawPedestal(g,t);drawOrbits(g,t,false);drawGlobe(g);drawOrbits(g,t,true);drawLinks(g)}
let last=0;function loop(t){if(!reduce.matches){rot+=Math.min(50,t-last)*.00006;last=t;frame(t);requestAnimationFrame(loop)}else frame(0)}
size();requestAnimationFrame(t=>{last=t;loop(t)});
new ResizeObserver(()=>{size();if(reduce.matches)frame(0)}).observe(cv);
reduce.addEventListener?.('change',()=>requestAnimationFrame(t=>{last=t;loop(t)}));
new MutationObserver(()=>{if(reduce.matches)frame(0)}).observe(stage,{childList:true,subtree:true});
})();
