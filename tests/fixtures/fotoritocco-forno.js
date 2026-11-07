/* Fake shop photos for the Fotoritocco tests and screenshots (no real photo, no person): a made-up bakery «Forno
   Aurora». Each scene is drawn in code as a well-exposed «true» image, then degraded the way phone photos go wrong:
   too dark, a colour cast (tungsten orange, shade blue, green fluorescent), flat and veiled. Deterministic: same
   arguments, same pixels. Runs in Node (tests) and in the browser (screenshots: window.RadixRetouchFixture). */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixRetouchFixture=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const hash=(x,y,s)=>{let h=(x*374761393+y*668265263+s*982451653)|0;h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296};
const mix=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const mul=(c,k)=>[c[0]*k,c[1]*k,c[2]*k];
// e: ellipse test → {d (0 centre .. 1 edge), dy (−1 top .. 1 bottom)} or null
const ell=(u,v,cx,cy,rx,ry)=>{const dx=(u-cx)/rx,dy=(v-cy)/ry,d=dx*dx+dy*dy;return d<=1?{d,dx,dy}:null};
const SCENES={
 pane(u,v,a){let c=mix([238,230,216],[214,202,184],v);// wall
  if(v>.6){const g=Math.sin(u*90+3*Math.sin(v*24))*.5+.5;c=mix([158,110,70],[128,86,52],g*.7);c=mul(c,1-.25*(v-.6))}// counter
  if(v>.63&&v<.77&&u>.1&&u<.9)c=[246,245,240];// paper
  for(const [cx,cy] of [[.28,.6],[.52,.565],[.76,.605]]){const s=ell(u,v,cx,cy+.05,.17,.03);if(s&&!ell(u,v,cx,cy,.16,.105))c=mul(c,.72+.28*s.d)}// shadow
  for(const [cx,cy] of [[.28,.6],[.52,.565],[.76,.605]]){const e=ell(u,v,cx,cy,.16,.105*a);if(!e)continue;
   let k=mix([206,140,66],[124,72,32],clamp(e.d*.8+e.dy*.35,0,1));const stripe=((u-cx)*9+(v-cy)*6+10)%1;if(stripe<.12&&e.d<.65)k=mix(k,[236,204,140],.8);
   c=mul(k,1.08-.3*e.d*e.d)}
  return c},
 cornetti(u,v,a){let c=mix([214,214,216],[196,196,200],v);const vein=Math.abs(Math.sin(u*14+v*9+Math.sin(u*31)*1.4));if(vein<.05)c=mul(c,.86);
  const p=ell(u,v,.5,.56,.36,.36*a);if(p){c=p.d>.82?mix([252,252,252],[226,226,228],(p.d-.82)/.18):[250,250,248]}
  for(const [cx,cy,rot] of [[.4,.5,.5],[.6,.52,-.4],[.5,.66,.1]]){const du=u-cx,dv=(v-cy)/a,x=du*Math.cos(rot)+dv*Math.sin(rot),y=-du*Math.sin(rot)+dv*Math.cos(rot);
   const e=ell(x,y,0,0,.15,.06);if(!e)continue;const seg=Math.abs(Math.sin(x*60));c=mul(mix([222,158,74],[160,92,36],clamp(e.d*.9+y*6,0,1)),1.05-.2*seg*e.d)}
  return c},
 vetrina(u,v,a){let c=mix([72,58,48],[52,42,36],v);
  for(const sy of [.36,.62,.88])if(Math.abs(v-sy)<.018)c=[176,132,92];
  const cols=[[232,124,152],[92,56,36],[240,210,82],[152,192,104],[246,240,228]];
  for(const [ri,sy] of [[0,.36],[1,.62],[2,.88]])for(let i=0;i<7;i++){const cx=.1+i*.133,e=ell(u,v,cx,sy-.07,.05,.065*a);if(!e)continue;let k=cols[(i+ri*2)%5];
   if(e.dx<-.2&&e.dy<-.2&&e.d<.35)k=mix(k,[255,255,255],.5);c=mul(k,1.05-.25*e.d)}
  const band=(u+v*.6)%1;if(band>.62&&band<.7)c=c.map(x=>x+28);
  return c},
 torta(u,v,a){let c=mix([52,55,60],[40,42,46],v);if(hash(Math.floor(u*300),Math.floor(v*300),3)<.08)c=mul(c,1.15);
  const cx=.5,top=ell(u,v,cx,.42,.28,.08*a),inSide=Math.abs(u-cx)<.28&&v>.42&&v<.42+.3;const bot=ell(u,v,cx,.72,.28,.08*a);
  if(inSide||bot){const layer=((v-.42)/.3*3)%1;c=layer>.45&&layer<.55?[214,120,140]:[240,232,220];c=mul(c,1-.3*Math.pow(Math.abs(u-cx)/.28,3))}
  if(top)c=mul([250,247,240],1-.08*top.d);
  for(let i=0;i<9;i++){const ang=i/9*6.283,bx=cx+Math.cos(ang)*.17,by=.42+Math.sin(ang)*.045,e=ell(u,v,bx,by,.022,.022*a);if(e){c=e.d<.15&&e.dx<0?[255,200,200]:mul([192,28,48],1-.3*e.d)}}
  const leaf=ell(u,v,.5,.41,.04,.015*a);if(leaf)c=[70,150,80];
  return c}};
// The «true» photo: w×h RGBA, a little sensor grain.
function scene(kind,w,h,{seed=1}={}){const f=SCENES[kind]||SCENES.pane,d=new Uint8ClampedArray(w*h*4),a=w/h;
 for(let y=0;y<h;y++){const v=y/h;for(let x=0;x<w;x++){const c=f(x/w,v,a),n=(hash(x,y,seed)-.5)*7,i=(y*w+x)*4;d[i]=c[0]+n;d[i+1]=c[1]+n;d[i+2]=c[2]+n;d[i+3]=255}}
 return {width:w,height:h,data:d}}
const toLin=v=>{v=clamp(v/255,0,1);return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)};
const toS=x=>{x=clamp(x,0,1);return 255*(x<=.0031308?x*12.92:1.055*Math.pow(x,1/2.4)-.055)};
// How phone photos go wrong: ev (exposure stops), gains (a cast, in linear light), flat [lo,hi] (veil: tones squeezed).
function degrade(img,{ev=0,gains=[1,1,1],flat=null}={}){const L=new Float32Array(256);for(let i=0;i<256;i++)L[i]=toLin(i);const k=Math.pow(2,ev),out=new Uint8ClampedArray(img.data.length),lut=[0,1,2].map(c=>{const t=new Float32Array(256);for(let v=0;v<256;v++){let y=toS(L[v]*k*gains[c]);if(flat)y=flat[0]+y*(flat[1]-flat[0])/255;t[v]=y}return t});
 for(let i=0;i<out.length;i+=4){out[i]=lut[0][img.data[i]];out[i+1]=lut[1][img.data[i+1]];out[i+2]=lut[2][img.data[i+2]];out[i+3]=255}return {width:img.width,height:img.height,data:out}}
// The set used by the tests and the screenshots: what was wrong with each photo.
const SET=Object.freeze([
 {name:'IMG_2041.jpg',kind:'pane',w:1600,h:1200,fault:{ev:-1.4,gains:[1.18,1,.72]},why:'scura, luce calda della lampada'},
 {name:'IMG_2044.jpg',kind:'cornetti',w:1200,h:1500,fault:{ev:-.3,gains:[.84,.98,1.24]},why:'dominante blu, all’ombra'},
 {name:'IMG_2050.jpg',kind:'vetrina',w:1600,h:1200,fault:{ev:-.2,flat:[46,196]},why:'velata e piatta, attraverso il vetro'},
 {name:'IMG_2057.jpg',kind:'torta',w:1200,h:1200,fault:{ev:-.6,gains:[.94,1.12,.92]},why:'scura, verde del neon'},
 {name:'IMG_2063.jpg',kind:'pane',w:720,h:540,fault:{ev:-.9,gains:[1.05,1,.9],flat:[18,236]},why:'piccola e un po’ scura'}]);
function shopPhoto(entry,{scale=1}={}){const w=Math.round(entry.w*scale),h=Math.round(entry.h*scale),truth=scene(entry.kind,w,h,{seed:entry.name.length});return {truth,photo:degrade(truth,entry.fault)}}
return Object.freeze({SCENES:Object.keys(SCENES),SET,scene,degrade,shopPhoto});
});
