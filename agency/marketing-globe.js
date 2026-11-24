/* Marketing home globe, light («B chiaro»): a pale porcelain earth lit from the top left on the white page, its land drawn
   as indigo dots from the shared land mask of sales/orbit-globe.js (window.RadixGlobeLand, Natural Earth 1:50m, public
   domain), three thin tilted orbits and one node per service area in its own colour. Geometry (where the earth, the
   orbits, the nodes and the labels go) comes from agency/orbit-core.js globeLayout(); this file only paints.
   window.RadixMarketingGlobe.create(canvas) returns {size(W,H,dpr), paint(layout,rot,{colors,active})}. No timers here:
   the page decides when to paint. */
(function(root){'use strict';
const TILT=.38,ct=Math.cos(TILT),st=Math.sin(TILT);
const LIGHT=(()=>{const L=[-.62,.55,.56],n=Math.hypot(...L);return L.map(v=>v/n)})();
const ORBIT_LOOK=[{c:'79,70,229',o:.42,w:1.3},{c:'109,40,217',o:.26,w:1.1},{c:'29,78,216',o:.2,w:1}];
let land=null;
// The land points on a Fibonacci sphere, built once from the shared mask: [x,y,z,hash].
function points(){
 if(land)return land;const src=root.RadixGlobeLand;land=[];if(!src||!src.LAND)return land;
 const raw=root.atob(src.LAND),N=src.N,ga=Math.PI*(3-Math.sqrt(5));
 for(let i=0;i<N;i++){if(!(raw.charCodeAt(i>>3)>>(i&7)&1))continue;const y=1-(i+.5)/N*2,r=Math.sqrt(1-y*y),t=ga*i,h=Math.sin(i*12.9898)*43758.5453;
  land.push([Math.cos(t)*r,y,-Math.sin(t)*r,h-Math.floor(h)])}
 return land;
}
function create(canvas){
 const ctx=canvas.getContext&&canvas.getContext('2d');let W=1,H=1,dpr=1,stars=[];
 function size(w,h,ratio){W=Math.max(1,w);H=Math.max(1,h);dpr=Math.min(2,ratio||1);if(!ctx)return;canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);
  let s=7;const rnd=()=>(s=(s*16807)%2147483647)/2147483647;
  stars=Array.from({length:Math.round(W*H/5200)},()=>({x:rnd()*W,y:rnd()*H,a:rnd()*.14+.05,r:rnd()<.15?2:1.4}))}
 const circ=(cx,cy,r)=>{ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2)};
 function orbit(o,k,cx,cy,front){const l=ORBIT_LOOK[k%ORBIT_LOOK.length];ctx.save();ctx.lineWidth=l.w;ctx.strokeStyle='rgba('+l.c+','+l.o+')';
  ctx.beginPath();ctx.ellipse(cx,cy,o.rx,o.ry,o.a,front?0:Math.PI,front?Math.PI:2*Math.PI);ctx.stroke();ctx.restore()}
 function earth(cx,cy,R,rot){
  const at=ctx.createRadialGradient(cx,cy,R*.95,cx,cy,R*1.32);at.addColorStop(0,'rgba(79,70,229,.10)');at.addColorStop(1,'rgba(79,70,229,0)');
  ctx.fillStyle=at;circ(cx,cy,R*1.32);ctx.fill();
  const sea=ctx.createRadialGradient(cx-R*.42,cy-R*.45,R*.05,cx-R*.1,cy-R*.1,R*1.15);sea.addColorStop(0,'#ffffff');sea.addColorStop(.45,'#f1f0fd');sea.addColorStop(.8,'#e2e0f8');sea.addColorStop(1,'#d3d0f2');
  ctx.save();ctx.shadowColor='rgba(29,26,39,.16)';ctx.shadowBlur=36;ctx.shadowOffsetY=14;ctx.fillStyle=sea;circ(cx,cy,R);ctx.fill();ctx.restore();
  ctx.save();circ(cx,cy,R);ctx.clip();
  const ds=Math.max(.8,R/92),cr=Math.cos(rot),sr=Math.sin(rot);
  for(const p of points()){const x=p[0]*cr-p[2]*sr,z=p[0]*sr+p[2]*cr,y=p[1],yy=y*ct-z*st,zz=y*st+z*ct;if(zz<-.02)continue;
   const px=cx+x*R,py=cy-yy*R,lit=Math.max(0,x*LIGHT[0]+yy*LIGHT[1]+zz*LIGHT[2]),edge=Math.min(1,zz*3+.15),day=.25+.75*lit;
   if(lit>.08){ctx.fillStyle='rgba('+Math.round(96-40*day)+','+Math.round(88-40*day)+','+Math.round(236-20*day)+','+((.3+.5*day)*edge).toFixed(3)+')';ctx.fillRect(px-ds,py-ds,ds*2,ds*2)}
   else{ctx.fillStyle='rgba(79,70,229,'+(.22*edge).toFixed(3)+')';ctx.fillRect(px-ds*.8,py-ds*.8,ds*1.6,ds*1.6)}}
  const nx=cx-LIGHT[0]*R*.9,ny=cy+LIGHT[1]*R*.9,sh=ctx.createRadialGradient(nx,ny,R*.3,nx,ny,R*2);
  sh.addColorStop(0,'rgba(29,26,39,0)');sh.addColorStop(.7,'rgba(49,46,129,.05)');sh.addColorStop(1,'rgba(49,46,129,.14)');ctx.fillStyle=sh;circ(cx,cy,R);ctx.fill();
  const sp=ctx.createRadialGradient(cx-R*.45,cy-R*.5,0,cx-R*.45,cy-R*.5,R*.6);sp.addColorStop(0,'rgba(255,255,255,.7)');sp.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=sp;circ(cx,cy,R);ctx.fill();
  ctx.restore();
  ctx.save();ctx.lineWidth=1;ctx.strokeStyle='rgba(79,70,229,.28)';circ(cx,cy,R);ctx.stroke();ctx.restore();
 }
 function nodeAt(x,y,color,on){const r=on?6:4.5;
  ctx.save();ctx.globalAlpha=.18;ctx.fillStyle=color;circ(x,y,r+(on?7:5));ctx.fill();ctx.restore();
  ctx.fillStyle='#fff';circ(x,y,r+2);ctx.fill();ctx.fillStyle=color;circ(x,y,r);ctx.fill();
  if(on){ctx.strokeStyle=color;ctx.lineWidth=1.4;circ(x,y,r+6);ctx.stroke()}}
 function paint(L,rot,{colors=[],active=-1}={}){
  if(!ctx)return;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
  for(const s of stars){ctx.fillStyle='rgba(79,70,229,'+s.a.toFixed(2)+')';ctx.fillRect(s.x,s.y,s.r,s.r)}
  if(!L)return;
  L.orbits.forEach((o,k)=>orbit(o,k,L.cx,L.cy,false));
  earth(L.cx,L.cy,L.R,rot);
  L.orbits.forEach((o,k)=>orbit(o,k,L.cx,L.cy,true));
  L.nodes.forEach((n,i)=>nodeAt(n.x,n.y,colors[i]||'#4f46e5',i===active));
 }
 return {size,paint,get ready(){return !!ctx}};
}
root.RadixMarketingGlobe={create};
})(typeof window!=='undefined'?window:globalThis);
