/* Marketing home globe: a navy earth lit from the top left, its land drawn as dots from the shared land mask of
   sales/orbit-globe.js (window.RadixGlobeLand, Natural Earth 1:50m, public domain), three tilted orbits and one glowing
   node per service area. Geometry (where the earth, the orbits, the nodes and the labels go) comes from
   agency/orbit-core.js globeLayout(); this file only paints. window.RadixMarketingGlobe.create(canvas) returns
   {size(W,H,dpr), paint(layout,rot,{colors,active})}. No timers here: the page decides when to paint. */
(function(root){'use strict';
const TILT=.38,ct=Math.cos(TILT),st=Math.sin(TILT);
const LIGHT=(()=>{const L=[-.62,.55,.56],n=Math.hypot(...L);return L.map(v=>v/n)})();
const ORBIT_LOOK=[{c:'56,211,255',o:.7,w:1.3},{c:'150,130,255',o:.5,w:1.1},{c:'110,150,255',o:.34,w:1}];
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
  stars=Array.from({length:Math.round(W*H/2600)},()=>({x:rnd()*W,y:rnd()*H,a:rnd()*.45+.1,r:rnd()<.1?1.6:1}))}
 const circ=(cx,cy,r)=>{ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2)};
 function orbit(o,k,cx,cy,front){const l=ORBIT_LOOK[k%ORBIT_LOOK.length];ctx.save();ctx.lineWidth=l.w;ctx.strokeStyle='rgba('+l.c+','+l.o+')';ctx.shadowColor='rgba('+l.c+',.85)';ctx.shadowBlur=8;
  ctx.beginPath();ctx.ellipse(cx,cy,o.rx,o.ry,o.a,front?0:Math.PI,front?Math.PI:2*Math.PI);ctx.stroke();ctx.restore()}
 function earth(cx,cy,R,rot){
  const at=ctx.createRadialGradient(cx,cy,R*.92,cx,cy,R*1.4);at.addColorStop(0,'rgba(90,120,255,.5)');at.addColorStop(.25,'rgba(80,100,255,.16)');at.addColorStop(1,'rgba(80,100,255,0)');
  ctx.fillStyle=at;circ(cx,cy,R*1.4);ctx.fill();
  const sea=ctx.createRadialGradient(cx-R*.42,cy-R*.45,R*.05,cx-R*.1,cy-R*.1,R*1.15);sea.addColorStop(0,'#2c4fd8');sea.addColorStop(.35,'#16288a');sea.addColorStop(.75,'#0a1450');sea.addColorStop(1,'#050a2a');
  ctx.fillStyle=sea;circ(cx,cy,R);ctx.fill();
  ctx.save();circ(cx,cy,R);ctx.clip();
  const ds=Math.max(.8,R/92),cr=Math.cos(rot),sr=Math.sin(rot);
  for(const p of points()){const x=p[0]*cr-p[2]*sr,z=p[0]*sr+p[2]*cr,y=p[1],yy=y*ct-z*st,zz=y*st+z*ct;if(zz<-.02)continue;
   const px=cx+x*R,py=cy-yy*R,lit=Math.max(0,x*LIGHT[0]+yy*LIGHT[1]+zz*LIGHT[2]),edge=Math.min(1,zz*3+.15),day=.25+.75*lit;
   if(lit>.08){ctx.fillStyle='rgba('+Math.round(110+90*day)+','+Math.round(140+80*day)+',255,'+((.3+.6*day)*edge).toFixed(3)+')';ctx.fillRect(px-ds,py-ds,ds*2,ds*2)}
   else{ctx.fillStyle='rgba(90,110,220,'+(.35*edge).toFixed(3)+')';ctx.fillRect(px-ds*.8,py-ds*.8,ds*1.6,ds*1.6);
    if(p[3]<.16){ctx.fillStyle='rgba(255,'+(200+Math.round(p[3]*300))+',150,'+(.9*edge).toFixed(3)+')';ctx.fillRect(px-.7,py-.7,1.4,1.4)}}}
  const nx=cx-LIGHT[0]*R*.9,ny=cy+LIGHT[1]*R*.9,sh=ctx.createRadialGradient(nx,ny,R*.2,nx,ny,R*2);
  sh.addColorStop(0,'rgba(0,0,0,0)');sh.addColorStop(.55,'rgba(2,4,24,.15)');sh.addColorStop(.85,'rgba(2,4,24,.55)');sh.addColorStop(1,'rgba(2,4,24,.75)');ctx.fillStyle=sh;circ(cx,cy,R);ctx.fill();
  const sp=ctx.createRadialGradient(cx-R*.45,cy-R*.5,0,cx-R*.45,cy-R*.5,R*.7);sp.addColorStop(0,'rgba(200,220,255,.22)');sp.addColorStop(1,'rgba(200,220,255,0)');ctx.fillStyle=sp;circ(cx,cy,R);ctx.fill();
  ctx.restore();
  ctx.save();ctx.lineWidth=1.6;const rg=ctx.createLinearGradient(cx-R,cy-R,cx+R,cy+R);rg.addColorStop(0,'rgba(150,200,255,.95)');rg.addColorStop(.5,'rgba(120,110,255,.5)');rg.addColorStop(1,'rgba(80,90,255,.1)');
  ctx.strokeStyle=rg;ctx.shadowColor='rgba(110,140,255,.9)';ctx.shadowBlur=14;circ(cx,cy,R);ctx.stroke();ctx.restore();
 }
 function nodeAt(x,y,color,on){const r=on?14:10,g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.28,color);g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.globalAlpha=1;ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);if(on){ctx.strokeStyle=color;ctx.lineWidth=1.2;circ(x,y,9);ctx.stroke()}}
 function paint(L,rot,{colors=[],active=-1}={}){
  if(!ctx)return;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
  for(const s of stars){ctx.fillStyle='rgba(190,205,255,'+s.a.toFixed(2)+')';ctx.fillRect(s.x,s.y,s.r,s.r)}
  if(!L)return;
  L.orbits.forEach((o,k)=>orbit(o,k,L.cx,L.cy,false));
  earth(L.cx,L.cy,L.R,rot);
  L.orbits.forEach((o,k)=>orbit(o,k,L.cx,L.cy,true));
  L.nodes.forEach((n,i)=>nodeAt(n.x,n.y,colors[i]||'#7f6dff',i===active));
 }
 return {size,paint,get ready(){return !!ctx}};
}
root.RadixMarketingGlobe={create};
})(typeof window!=='undefined'?window:globalThis);
