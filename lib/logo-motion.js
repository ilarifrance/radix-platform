/* Studio «Animazione del logo» (agency job V6): the SVG logo of the saved Kit identità (profile.identityKit) animated in
   the browser and exported as video, GIF, an animated SVG for the site and PNG frames, with NO AI, no media generation
   and no credits.
   1. The questions: the use (intro/outro of a video, social sticker, site loader, email), the background (a palette
      colour of the kit or transparent), the duration (2-5 s), the format (16:9, 1:1, 9:16) and how it ends (entrata,
      uscita, ciclo).
   2. Three proposals built here, deterministically and keyframed in code: «Disegno» (the outline of the symbol draws on,
      then fills; the name is wiped in), «Simbolo e nome» (the symbol pops, the name slides out from behind it),
      «Rivelazione» (the logo rises from an invisible line). The logo is split into symbol and name by
      lib/brand-package.js; a logo with no separate symbol moves as one piece.
   3. The refinement: speed, easing, background (palette only), the final hold, the payoff (only when the project has
      one), the GIF repeat.
   4. The checks: kit and logo present, the static logo exact on the first/last frame, contrast of the logo (3:1) and of
      the payoff (4.5:1) on the background, reduced motion (the site snippet stops under prefers-reduced-motion), the
      payoff readable on a phone, the sizes of the files once made.
   5. The files: WebM recorded from a canvas with MediaRecorder (and MP4 when the browser can write it), an animated GIF
      written here (LZW, palette from the kit and the logo), the animated SVG with CSS and the HTML of the site loader,
      the PNG frames in a zip, LEGGIMI.txt.
   The engine: a proposal is a set of keyframe tracks over the progress u (0 = nothing, 1 = the static logo); the
   timeline maps seconds to u (lead, motion, hold; reversed for «uscita», out-and-in for «ciclo»). Every track ends on
   the identity, so the frame at u = 1 is the logo as it is (and it is drawn from the original SVG).
   The choice is saved in the project: the «agents» document under the key logoMotion (agents-page.js keeps it).
   Pure part runs in Node for the tests; logoMotionStudio() is the browser widget. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixLogoMotion=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
function lib(name,file){if(root[name])return root[name];try{return typeof require==='function'?require(file):null}catch(e){return null}}
const PS=()=>lib('RadixPrintStudio','./print-studio.js'),BP=()=>lib('RadixBrandPackage','./brand-package.js'),ZIP=()=>lib('RadixZip','./zip-lite.js'),RS=()=>lib('RadixReelStudio','./reel-studio.js');
const AGENT='art-director',MAX_SAVED=10,PHONE_CSS=390,MIN_CSS=12,FPS_VIDEO=30,FPS_GIF=20,FPS_PNG=30,SVG_SAMPLES=48;
const clean=s=>String(s==null?'':s).replace(/\s+/g,' ').trim();
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const slug=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40);
const up=h=>String(h||'').toUpperCase();
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const n3=x=>{const v=Math.round(x*1000)/1000;return Object.is(v,-0)?'0':String(v)};
const comma=x=>String(x).replace('.',',');
const kb=n=>n<1e6?Math.max(1,Math.round(n/1e3))+' KB':comma((n/1e6).toFixed(1)).replace(/,0$/,'')+' MB';

// ---- the questions ----
const USES=Object.freeze([
 {id:'video',title:'Intro o outro di un video',line:'All’inizio o alla fine di un reel, di uno spot, di un video su YouTube.',format:'16:9',verso:'entrata',gifLoop:'sempre'},
 {id:'sticker',title:'Sticker o GIF per i social',line:'Una GIF che gira nelle storie, nei messaggi e nei commenti.',format:'1:1',verso:'ciclo',gifLoop:'sempre'},
 {id:'loader',title:'Caricamento del sito',line:'Il logo che si muove mentre la pagina si apre (SVG e CSS).',format:'1:1',verso:'ciclo',gifLoop:'sempre'},
 {id:'email',title:'Email e newsletter',line:'In testa alla newsletter o nella firma, come GIF leggera.',format:'16:9',verso:'ciclo',gifLoop:'una'}]);
const use=id=>USES.find(u=>u.id===id)||USES[0];
const FORMATS=Object.freeze([
 {id:'16:9',title:'Orizzontale 16:9',w:1920,h:1080,gif:[640,360],logoW:.46,logoH:.36},
 {id:'1:1',title:'Quadrato 1:1',w:1080,h:1080,gif:[480,480],logoW:.64,logoH:.34},
 {id:'9:16',title:'Verticale 9:16',w:1080,h:1920,gif:[360,640],logoW:.72,logoH:.22}]);
const format=id=>FORMATS.find(f=>f.id===id)||FORMATS[0];
const DURATIONS=Object.freeze([2,3,4,5]);
const VERSI=Object.freeze([
 {id:'entrata',title:'Entrata',line:'Il logo appare e resta fermo: per l’inizio di un video.'},
 {id:'uscita',title:'Uscita',line:'Il logo c’è e se ne va: per la fine di un video.'},
 {id:'ciclo',title:'Ciclo',line:'Parte e finisce col logo fermo: gira senza scatti (GIF, caricamento, email).'}]);
const verso=id=>VERSI.find(v=>v.id===id)||VERSI[0];
const SPEEDS=Object.freeze({lenta:{title:'Lenta',k:1},normale:{title:'Normale',k:.8},rapida:{title:'Rapida',k:.6}});
const HOLDS=Object.freeze([.5,1,1.5,2]);
const GIF_LOOPS=Object.freeze({sempre:'Sempre',una:'Una volta'});
const ROLES=Object.freeze(['primary','secondary','accent','dark','light']);
const ROLE_LABEL=Object.freeze({primary:'Primario',secondary:'Secondario',accent:'Accento',dark:'Scuro',light:'Chiaro',trasparente:'Trasparente'});
const BGS=Object.freeze(ROLES.concat(['trasparente']));

// ---- the keyframe engine ----
// Easings on t in [0,1] → [0,1] (rimbalzo overshoots and comes back: the value still ends exactly on 1).
const EASES=Object.freeze({
 lineare:{title:'Lineare',f:t=>t},
 morbida:{title:'Morbida',f:t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2},
 decisa:{title:'Decisa',f:t=>1-Math.pow(1-t,4)},
 rimbalzo:{title:'Con rimbalzo',f:t=>{if(t<=0)return 0;if(t>=1)return 1;const c1=1.70158,c3=c1+1;return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2)}}});
const easeOf=(name,user)=>(EASES[name==='user'?user:name]||EASES[user]||EASES.morbida).f;
// A track: [[u, value, ease?], …] sorted by u; the ease of a key shapes the segment that arrives at it ('user' = the
// chosen easing). Before the first key the first value holds, after the last the last value.
function valueAt(track,u,user){if(!Array.isArray(track)||!track.length)return undefined;if(u<=track[0][0])return track[0][1];const last=track[track.length-1];if(u>=last[0])return last[1];
 for(let i=1;i<track.length;i++){const a=track[i-1],b=track[i];if(u<=b[0]){const span=b[0]-a[0],t=span>0?(u-a[0])/span:1;return a[1]+(b[1]-a[1])*easeOf(b[2]||'lineare',user)(t)}}
 return last[1]}
// The identity of every property: what every track must end on.
const IDENTITY=Object.freeze({opacity:1,scale:1,slide:0,rise:0,wipe:1,draw:1,fill:1,outline:0});
// The three proposals. Parts: symbol, word (the name), logo (when the logo has no separate symbol), payoff.
const PAYOFF_TRACKS={opacity:[[.78,0],[1,1,'lineare']],rise:[[.78,.8],[1,0,'decisa']]};
const PROPOSALS=Object.freeze([
 {id:'disegno',title:'Disegno',line:'Il contorno del simbolo si disegna e si riempie di colore, poi il nome entra da sinistra.',ease:'morbida',
  tracks:{symbol:{draw:[[0,0],[.62,1,'user']],fill:[[.42,0],[.84,1,'user']],outline:[[0,1],[.7,1],[.92,0,'lineare']]},
   word:{wipe:[[.34,0],[.9,1,'user']]},
   logo:{draw:[[0,0],[.66,1,'user']],fill:[[.45,0],[.9,1,'user']],outline:[[0,1],[.74,1],[.95,0,'lineare']]},payoff:PAYOFF_TRACKS}},
 {id:'pop',title:'Simbolo e nome',line:'Il simbolo salta dentro, il nome scivola fuori da dietro il simbolo.',ease:'rimbalzo',
  tracks:{symbol:{scale:[[0,0],[.46,1,'user']],opacity:[[0,0],[.12,1,'lineare']]},
   word:{opacity:[[.3,0],[.62,1,'lineare']],slide:[[.3,-.45],[.86,0,'user']],behind:[[0,1]]},
   logo:{scale:[[0,0],[.62,1,'user']],opacity:[[0,0],[.18,1,'lineare']]},payoff:PAYOFF_TRACKS}},
 {id:'rivela',title:'Rivelazione',line:'Il logo sale da una linea invisibile, il nome subito dopo: pulito, da apertura.',ease:'decisa',
  tracks:{symbol:{rise:[[0,1.08],[.62,0,'user']],mask:[[0,1]]},
   word:{rise:[[.16,1.08],[.8,0,'user']],mask:[[0,1]]},
   logo:{rise:[[0,1.08],[.72,0,'user']],mask:[[0,1]]},payoff:PAYOFF_TRACKS}}]);
const proposal=id=>PROPOSALS.find(p=>p.id===id)||PROPOSALS[0];
// The timeline in seconds → segments with the progress u at their ends.
function timeline({duration,hold,speed,verso:v}={}){const D=clamp(+duration||3,2,5),H=clamp(+hold||1,.5,2),avail=Math.max(.8,D-H),k=(SPEEDS[speed]||SPEEDS.normale).k,hold2=D-avail;
 const segs=[],add=(kind,len,u0,u1)=>{if(len>1e-9)segs.push({kind,len,u0,u1})};
 if(v==='uscita'){const motion=avail*k;add('fermo',hold2,1,1);add('esce',motion,1,0);add('vuoto',avail-motion,0,0)}
 else if(v==='ciclo'){const motion=avail*k/2;add('fermo',hold2/2,1,1);add('esce',motion,1,0);add('vuoto',avail-2*motion,0,0);add('entra',motion,0,1);add('fermo',hold2/2,1,1)}
 else{const motion=avail*k;add('vuoto',avail-motion,0,0);add('entra',motion,0,1);add('fermo',hold2,1,1)}
 let t=0;for(const s of segs){s.from=t;t+=s.len;s.to=t}
 return {D,hold:hold2,motion:segs.filter(s=>s.kind==='entra'||s.kind==='esce').reduce((a,s)=>a+s.len,0),verso:v==='uscita'||v==='ciclo'?v:'entrata',segs}}
// The progress at t seconds: {u, phase}. Leaving («esce») plays the entrance backwards.
function progressAt(tl,t){const x=clamp(t,0,tl.D);for(const s of tl.segs){if(x<=s.to+1e-9||s===tl.segs[tl.segs.length-1]){const f=s.len>0?clamp((x-s.from)/s.len,0,1):1;return {u:s.u0+(s.u1-s.u0)*f,phase:s.kind}}}return {u:1,phase:'fermo'}}

// ---- the model ----
function hasKit(profile){const P=PS();return !!(profile&&profile.identityKit&&typeof profile.identityKit==='object'&&P.brandOf(profile).fromKit)}
// The payoff from the project (never invented).
function prefill(profile,{projectName}={}){const pre=PS().prefill(profile||{},{projectName});return {payoff:clean(pre.payoff).slice(0,120)}}
// The logo as drawn on the background: the original on the kit's light colour, white or transparent, else one readable colour.
function logoFor(brand,bgHex){const P=PS(),pal=brand.palette,src=brand.logo;if(!src)return {svg:'',mono:''};
 if(!bgHex||up(bgHex)===up(pal.light)||up(bgHex)==='#FFFFFF')return {svg:src,mono:''};
 const c=P.ink(bgHex,pal,pal.light,pal.dark),B=BP();let svg='';try{svg=B?B.mono(src,c,up(bgHex)):''}catch(e){svg=''}return {svg:svg||P.monoSvg(src,c),mono:c}}
const paletteArray=pal=>ROLES.map(r=>({role:r,hex:pal[r]}));
// The parts to animate: symbol and name when the logo has both, else the whole logo. Boxes in the logo's units.
function partsOf(svg,brand,{measure}={}){const B=BP();const all=()=>{const lv=B.leaves(B.tree(svg),{measure}),bx=lv.map(l=>l.box);return [{id:'logo',svg,box:bx.length?{x0:Math.min(...bx.map(b=>b.x0)),y0:Math.min(...bx.map(b=>b.y0)),x1:Math.max(...bx.map(b=>b.x1)),y1:Math.max(...bx.map(b=>b.y1))}:null}]};
 if(!svg)return {split:false,orientation:'other',list:[]};
 let p=null;try{p=B.split(svg,{name:brand.name,palette:paletteArray(brand.palette),font:brand.fonts.heading,measure})}catch(e){p=null}
 if(!p||p.generated.symbol||p.generated.word){const list=all();return {split:false,orientation:'other',list:list[0].box?list:[]}}
 return {split:true,orientation:p.orientation,list:[{id:'symbol',svg:B.serialize(p.symbol.tree),box:p.symbol.box},{id:'word',svg:B.serialize(p.word.tree),box:p.word.box}]}}
// input: {proposal, use, bg, duration, format, verso, speed, ease, hold, payoff (bool), gifLoop}
function normalize(i={}){const u=use(i.use),p=proposal(i.proposal);
 return {proposal:p.id,use:u.id,bg:BGS.includes(i.bg)?i.bg:'light',duration:DURATIONS.includes(+i.duration)?+i.duration:3,format:format(i.format||u.format).id,verso:verso(i.verso||u.verso).id,
  speed:SPEEDS[i.speed]?i.speed:'normale',ease:EASES[i.ease]?i.ease:p.ease,hold:HOLDS.includes(+i.hold)?+i.hold:1,payoff:i.payoff!==false,gifLoop:GIF_LOOPS[i.gifLoop]?i.gifLoop:u.gifLoop}}
const partCache=new Map();
function modelOf(input,profile,{projectName,measure}={}){const P=PS(),a=normalize(input),brand=P.brandOf(profile||{},projectName),pal=brand.palette;
 const bgHex=a.bg==='trasparente'?null:pal[a.bg],logo=logoFor(brand,bgHex),key=logo.svg+'|'+(measure?'m':'h');
 if(!partCache.has(key)){if(partCache.size>12)partCache.clear();partCache.set(key,partsOf(logo.svg,brand,{measure}))}
 const pre=prefill(profile,{projectName}),payoff=a.payoff?pre.payoff:'';
 return {...a,brand,bgHex,logo:logo.svg,mono:logo.mono,parts:partCache.get(key),payoffText:payoff,hasPayoff:!!pre.payoff,tl:timeline(a)}}

// ---- the state of a frame ----
// One part at progress u: {id, svg, box, opacity, scale, dx, dy (logo units), clip (box) or null, draw, fill, outline}.
function partState(m,part,u){const pr=proposal(m.proposal),tr=pr.tracks[part.id]||{},v=k=>{const x=valueAt(tr[k],u,m.ease);return x===undefined?IDENTITY[k]:x};
 const vb=PS().viewBox(m.logo)||[0,0,1,1],b=part.box,bw=b.x1-b.x0,bh=b.y1-b.y0,pad=Math.max(vb[2],vb[3])*.03;
 const st={id:part.id,svg:part.svg,box:b,opacity:v('opacity'),scale:v('scale'),dx:0,dy:v('rise')*(bh+2*pad),clip:null,draw:tr.draw?v('draw'):null,fill:tr.draw?v('fill'):1,outline:tr.draw?v('outline'):0};
 const slide=v('slide'),wipe=tr.wipe?v('wipe'):1,horiz=m.parts.orientation==='horizontal';
 if(slide){if(horiz||!m.parts.split)st.dx=slide*bw;else st.dy+=slide*bh}
 if(tr.wipe&&wipe<1)st.clip={x0:b.x0-pad,y0:b.y0-pad,x1:b.x0-pad+(bw+2*pad)*clamp(wipe,0,1),y1:b.y1+pad};
 if(tr.mask)st.clip={x0:b.x0-pad*4,y0:b.y0-pad*4,x1:b.x1+pad*4,y1:b.y1+pad};
 if(tr.behind&&m.parts.split){const s=m.parts.list.find(p=>p.id==='symbol').box;
  st.clip=horiz?{x0:(s.x1+b.x0)/2,y0:Math.min(b.y0,s.y0)-pad*4,x1:b.x1+bw+pad*4,y1:Math.max(b.y1,s.y1)+pad*4}:{x0:Math.min(b.x0,s.x0)-pad*4,y0:(s.y1+b.y0)/2,x1:Math.max(b.x1,s.x1)+pad*4,y1:b.y1+bh+pad*4}}
 return st}
// The whole frame at t seconds: {t, u, phase, still (the static logo), parts:[…], payoff:{opacity, rise}}.
function frameAt(m,t){const {u,phase}=progressAt(m.tl,t),pr=proposal(m.proposal);
 return {t,u,phase,still:u>=1,parts:m.parts.list.map(p=>partState(m,p,u)),payoff:{opacity:valueAt(pr.tracks.payoff.opacity,u,m.ease),rise:valueAt(pr.tracks.payoff.rise,u,m.ease)}}}
const isIdentity=s=>Math.abs(s.opacity-1)<1e-9&&Math.abs(s.scale-1)<1e-9&&Math.abs(s.dx)<1e-9&&Math.abs(s.dy)<1e-9&&(s.draw===null||Math.abs(s.draw-1)<1e-9)&&Math.abs(s.fill-1)<1e-9&&Math.abs(s.outline)<1e-9&&(!s.clip||clipCovers(s.clip,s.box));
const clipCovers=(c,b)=>c.x0<=b.x0&&c.y0<=b.y0&&c.x1>=b.x1&&c.y1>=b.y1;
// The matrix of a part: scale about the centre of its box, then the move.
function matrixOf(s){const cx=(s.box.x0+s.box.x1)/2,cy=(s.box.y0+s.box.y1)/2;return [s.scale,0,0,s.scale,cx-s.scale*cx+s.dx,cy-s.scale*cy+s.dy]}

// ---- the layout of a frame W × H px ----
const ASC=.718;
function layout(m,W,H){const P=PS(),f=format(m.format),vb=P.viewBox(m.logo)||[0,0,300,100],k=Math.min(W*f.logoW/vb[2],H*f.logoH/vb[3]),lw=vb[2]*k,lh=vb[3]*k,notes=[];
 const pal=m.brand.palette,bgRef=m.bgHex||pal.light,min=Math.ceil(MIN_CSS*W/PHONE_CSS);let pay=null;
 if(m.payoffText){const maxW=Math.max(lw*1.15,W*.72),color=P.ink(bgRef,pal,pal.dark,pal.primary,pal.light);let size=Math.max(min,Math.round(lh*.2)),lines=[];
  for(;size>=min;size-=1){lines=wrap(m.payoffText,size,maxW);if(lines.length<=2&&lines.every(l=>P.textWidth(l,size,false)<=maxW))break}
  if(size<min){notes.push('il payoff non entra leggibile (almeno '+min+' px): lasciato fuori');pay=null}else pay={lines,size,color,min,lead:size*1.22}}
 const gap=lh*.3,total=lh+(pay?gap+pay.size*ASC+(pay.lines.length-1)*pay.lead+pay.size*.25:0),y0=(H-total)/2;
 const box={x:(W-lw)/2,y:y0,w:lw,h:lh,k,vb};if(pay){pay.x=W/2;pay.y=y0+lh+gap+pay.size*ASC}
 return {W,H,box,payoff:pay,notes,min}}
function wrap(text,size,width){const P=PS(),words=clean(text).split(' ').filter(Boolean),out=[];let line='';
 for(const w of words){const t=line?line+' '+w:w;if(P.textWidth(t,size,false)<=width||!line){line=t;continue}out.push(line);line=w}if(line)out.push(line);return out}

// ---- path lengths (for the draw-on outline) ----
function lengthOf(n){const a=n.attrs,len=v=>{const x=parseFloat(v);return isFinite(x)?x:0},nums=s=>(String(s||'').match(/-?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi)||[]).map(Number);
 if(n.tag==='rect')return 2*(len(a.width)+len(a.height));
 if(n.tag==='circle')return 2*Math.PI*len(a.r);
 if(n.tag==='ellipse'){const x=len(a.rx),y=len(a.ry),h=Math.pow(x-y,2)/Math.pow(x+y||1,2);return Math.PI*(x+y)*(1+3*h/(10+Math.sqrt(4-3*h)))}
 if(n.tag==='line')return Math.hypot(len(a.x2)-len(a.x1),len(a.y2)-len(a.y1));
 if(n.tag==='polyline'||n.tag==='polygon'){const v=nums(a.points);let s=0;for(let i=2;i+1<v.length;i+=2)s+=Math.hypot(v[i]-v[i-2],v[i+1]-v[i-1]);if(n.tag==='polygon'&&v.length>=4)s+=Math.hypot(v[0]-v[v.length-2],v[1]-v[v.length-1]);return s}
 if(n.tag==='path'){let s=0,cur=[0,0],start=[0,0];for(const op of PS().pathOps(a.d)){const t=op.split(' '),k=t.pop(),v=t.map(Number);
  if(k==='m'){cur=[v[0],v[1]];start=cur}else if(k==='l'){s+=Math.hypot(v[0]-cur[0],v[1]-cur[1]);cur=[v[0],v[1]]}
  else if(k==='c'){let px=cur[0],py=cur[1];for(let i=1;i<=16;i++){const q=i/16,r=1-q,x=r*r*r*cur[0]+3*r*r*q*v[0]+3*r*q*q*v[2]+q*q*q*v[4],y=r*r*r*cur[1]+3*r*r*q*v[1]+3*r*q*q*v[3]+q*q*q*v[5];s+=Math.hypot(x-px,y-py);px=x;py=y}cur=[v[4],v[5]]}
  else if(k==='h'){s+=Math.hypot(start[0]-cur[0],start[1]-cur[1]);cur=start}}return s}
 return 0}
// The outline copy of a part: shapes stroked in their own colour, no fill, texts hidden; dash set per frame.
function outlineOf(part,m){if(part._outline)return part._outline;const B=BP(),t=B.tree(part.svg),vb=PS().viewBox(m.logo)||[0,0,100,100],sw=Math.max(vb[2],vb[3])*.012,nodes=[];
 for(const l of B.leaves(t)){const a=l.node.attrs;for(const k of ['opacity','fill-opacity','stroke-opacity'])delete a[k];
  if(l.kind==='text'){a.fill='none';a.stroke='none';continue}const col=typeof l.fill==='string'?l.fill:typeof l.stroke==='string'?l.stroke:m.brand.palette.dark;
  a.fill='none';a.stroke=col;a['stroke-width']=n3(Math.max(+a['stroke-width']||0,sw));a['stroke-linecap']='round';a['stroke-linejoin']='round';nodes.push({node:l.node,L:Math.max(1e-3,lengthOf(l.node))})}
 part._outline={tree:t,nodes,sw};return part._outline}
// The outline drawn up to p (0..1), as SVG markup in the logo's units.
function outlineSvg(part,m,p){const o=outlineOf(part,m);for(const x of o.nodes)x.node.attrs['stroke-dasharray']=n3(x.L*clamp(p,0,1))+' '+n3(x.L+1);return BP().serialize(o.tree)}

// ---- checks ----
// The colours of a logo SVG (fills and strokes, as #RRGGBB).
// Each colour of the logo with what is under it: the background, or the earlier filled shape it sits on (a dot on a disc).
function logoPairs(svg,bg){const B=BP();if(!svg)return [];const lv=B.leaves(B.tree(svg)),area=b=>Math.max(1e-9,(b.x1-b.x0)*(b.y1-b.y0)),ov=(a,b)=>Math.max(0,Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0))*Math.max(0,Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0)),seen=new Set(),out=[];
 for(const l of lv){const under=lv.filter(u=>u.order<l.order&&typeof u.fill==='string'&&ov(u.box,l.box)>.5*area(l.box)).pop(),on=under?up(under.fill):bg;
  for(const c of [l.fill,l.stroke])if(typeof c==='string'&&on){const k=up(c)+'|'+on;if(!seen.has(k)){seen.add(k);out.push({fg:up(c),bg:on,onShape:!!under})}}}
 return out}
function logoColours(svg){const B=BP();if(!svg)return [];const out=new Set();for(const l of B.leaves(B.tree(svg)))for(const c of [l.fill,l.stroke])if(typeof c==='string')out.add(up(c));return [...out]}
function edgeFrames(m){const tl=m.tl,first=progressAt(tl,0).u>=1,last=progressAt(tl,tl.D).u>=1;return {first,last}}
// [{id, label, state:'ok'|'warn'|'fail', detail, issues}]
function checksOf(m,{sizes}={}){const P=PS(),out=[],add=(id,label,state,detail,issues=[])=>out.push({id,label,state,detail,issues:issues.slice(0,8)});const b=m.brand,pal=b.palette;
 add('kit','Kit identità e logo',!b.fromKit||!b.logo?'fail':'ok',!b.fromKit?'Il progetto non ha un Kit identità salvato: RADIX non inventa logo e colori.':!b.logo?'Il Kit identità non ha un logo SVG da animare.':'Il logo del Kit identità'+(b.direction?' «'+b.direction+'»':'')+(m.mono?', in un colore solo ('+m.mono+') per leggersi sul fondo':'')+(m.parts.split?': simbolo e nome si muovono separati.':': il logo non ha simbolo e nome separati, si muove tutto insieme.'));
 if(!b.fromKit||!b.logo)return out;
 const e=edgeFrames(m),need=m.verso==='entrata'?['last']:m.verso==='uscita'?['first']:['first','last'],okEdges=need.every(k=>e[k]);
 add('fotogrammi','Logo fermo e identico',okEdges?'ok':'fail',okEdges?(m.verso==='entrata'?'L’ultimo fotogramma è':m.verso==='uscita'?'Il primo fotogramma è':'Il primo e l’ultimo fotogramma sono')+' il logo statico esatto, tenuto '+comma(m.tl.hold)+' s.':'Il logo statico non c’è dove serve.');
 const bg=m.bgHex,pairs=bg?logoPairs(m.logo,up(bg)):[],cols=pairs.filter(p=>!p.onShape).map(p=>p.fg),low=pairs.map(p=>[p,P.contrast(p.fg,p.bg)]).filter(([,r])=>r<3);
 if(!bg)add('contrasto','Contrasto','warn','Fondo trasparente: il contrasto dipende da dove metti la GIF o l’SVG. Il video usa il colore chiaro del kit.');
 else{const best=cols.length?Math.max(...cols.map(c=>P.contrast(c,bg))):0;const lay=layout(m,1080,1080),pr=lay.payoff?P.contrast(lay.payoff.color,bg):null;
  const st=!best||best<3?'fail':low.length||(pr!==null&&pr<4.5)?'warn':'ok';
  add('contrasto','Contrasto sul fondo',st,st==='fail'?'Il logo non si distingue dal fondo '+up(bg)+': scegli un altro colore di fondo.':st==='warn'?'Una parte si legge poco sul fondo '+up(bg)+'.':'Il logo ha almeno 3:1 sul fondo '+up(bg)+(pr!==null?', il payoff almeno 4,5:1.':'.'),
   low.map(([p,r])=>'Colore del logo '+p.fg+' su '+p.bg+(p.onShape?' (dentro il logo)':'')+': '+comma(r)+':1 (serve 3:1)').concat(pr!==null&&pr<4.5?['Payoff: '+comma(pr)+':1 (serve 4,5:1)']:[]))}
 const u=m.use;
 if(u==='loader')add('movimento','Movimento ridotto','ok','L’SVG per il sito si ferma sul logo statico quando il telefono o il computer chiede meno movimento (prefers-reduced-motion).');
 else if(u==='email'||u==='sticker'){const loop=m.gifLoop==='sempre';add('movimento','Movimento ridotto',u==='email'&&loop?'warn':'ok',u==='email'&&loop?'Una GIF non sa del movimento ridotto e qui si ripete all’infinito: in un’email distrae. Scegli «Una volta».':'Una GIF non sa del movimento ridotto: '+(loop?'gira come uno sticker, dura '+m.duration+' s e non lampeggia.':'si ferma dopo un giro di '+m.duration+' s.'))}
 else add('movimento','Movimento ridotto','ok','Il video parte solo quando lo avvia chi guarda: '+m.duration+' s, nessun lampo.');
 if(u==='email'&&!e.first)add('outlook','Outlook su computer','warn','Outlook su computer mostra solo il primo fotogramma della GIF, e qui è vuoto: scegli «Ciclo» o «Uscita».');
 if((u==='loader'||u==='sticker')&&m.verso!=='ciclo')add('ciclo','Ripetizione','warn','Gira in ciclo: con «'+verso(m.verso).title+'» ricomincia di scatto. «Ciclo» parte e finisce col logo fermo.');
 const lay=layout(m,format(m.format).w,format(m.format).h);
 if(m.payoff&&m.hasPayoff)add('payoff','Payoff',lay.payoff?'ok':'warn',lay.payoff?'«'+m.payoffText+'» dal progetto, a '+lay.payoff.size+' px: si legge sul telefono.':'Il payoff non entra a una misura leggibile: è rimasto fuori.');
 if(sizes){const iss=[],warn=[];for(const [name,n] of Object.entries(sizes)){const lim=/\.gif$/.test(name)?(u==='email'?1e6:u==='sticker'?8e6:4e6):/\.svg$/.test(name)?5e4:null;iss.push(name+': '+kb(n));if(lim&&n>lim)warn.push(name+' supera '+kb(lim)+(/\.gif$/.test(name)&&u==='email'?': molti client email la caricano lenta. Scegli 2-3 s o un formato più piccolo.':'.'))}
  add('peso','Peso dei file',warn.length?'warn':'ok',warn.length?warn.join(' '):'Pesi adatti all’uso'+(u==='email'?' (GIF sotto 1 MB)':u==='loader'?' (SVG sotto 50 KB)':'')+'.',iss)}
 return out}
const blocking=c=>c.filter(x=>x.state==='fail');

// ---- the animated SVG for the site (CSS keyframes sampled from the same engine) ----
const ROOT_SKIP=/^(xmlns|viewbox|width|height|preserveaspectratio|role|aria-label|id|x|y)$/i;
function inner(svg){const B=BP(),t=B.tree(svg);if(!t)return {attrs:'',body:''};return {attrs:Object.entries(t.attrs).filter(([k])=>!ROOT_SKIP.test(k)).map(([k,v])=>' '+k+'="'+esc(v)+'"').join(''),body:t.children.map(B.serialize).join('')}}
function pathLengthBody(part,m){const o=outlineOf(part,m);for(const x of o.nodes){x.node.attrs.pathLength='1';x.node.attrs['stroke-dasharray']='1 1'}const B=BP(),body=o.tree.children.map(B.serialize).join('');for(const x of o.nodes)delete x.node.attrs.pathLength;return body}
// opts.loop: repeat forever (the loader) or play once and stay on the last frame.
function animatedSvg(m,{loop=true}={}){const f=format(m.format),L=layout(m,f.w,f.h),bx=L.box,vb=bx.vb,label=esc(m.brand.name||'Logo');
 // the content box (logo + payoff) with room for the overshoot, viewBox from 0 0
 const pad=bx.h*.12,x0=Math.min(bx.x,L.payoff?L.payoff.x-Math.max(...L.payoff.lines.map(l=>PS().textWidth(l,L.payoff.size,false)))/2:bx.x)-pad,y0=bx.y-pad,x1=2*(f.w/2)-x0,y1=(L.payoff?L.payoff.y+(L.payoff.lines.length-1)*L.payoff.lead+L.payoff.size*.3:bx.y+bx.h)+pad;
 const W=x1-x0,H=y1-y0,D=m.tl.D,N=SVG_SAMPLES,frames=[];for(let i=0;i<=N;i++)frames.push(frameAt(m,D*i/N));
 const pct=i=>n3(i/N*100)+'%',css=[],body=[];
 const anim=(name,fn)=>{css.push('@keyframes '+name+'{'+frames.map((fr,i)=>pct(i)+'{'+fn(fr,i)+'}').join('')+'}')};
 const run=name=>'animation:'+name+' '+n3(D)+'s linear '+(loop?'infinite':'1 both')+';';
 const mat=s=>'transform:matrix('+matrixOf(s).map(n3).join(',')+');';
 body.push('<g transform="translate('+n3(bx.x-x0)+' '+n3(bx.y-y0)+') scale('+n3(bx.k)+') translate('+n3(-vb[0])+' '+n3(-vb[1])+')">');
 m.parts.list.forEach((part,j)=>{const id='rxl-'+part.id,inn=inner(part.svg),s0=frames[frames.length-1].parts[j];const tr=proposal(m.proposal).tracks[part.id]||{};
  const clip=frames.some(fr=>fr.parts[j].clip);let open='<g>';
  if(clip){const c=frames.map(fr=>fr.parts[j].clip).find(Boolean),full={x0:c.x0,y0:c.y0,x1:part.box.x1+(part.box.x0-c.x0),y1:c.y1};
   if(tr.wipe){body.push('<clipPath id="'+id+'-c" clipPathUnits="userSpaceOnUse"><rect class="'+id+'-cr" x="'+n3(full.x0)+'" y="'+n3(full.y0)+'" width="'+n3(full.x1-full.x0)+'" height="'+n3(full.y1-full.y0)+'"/></clipPath>');
    anim(id+'-w',fr=>{const c2=fr.parts[j].clip,w=c2?clamp((c2.x1-full.x0)/(full.x1-full.x0),0,1):1;return 'transform:matrix('+n3(w)+',0,0,1,'+n3(full.x0*(1-w))+',0);'});css.push('.'+id+'-cr{transform-box:view-box;transform-origin:0 0;'+run(id+'-w')+'}')}
   else body.push('<clipPath id="'+id+'-c" clipPathUnits="userSpaceOnUse"><rect x="'+n3(c.x0)+'" y="'+n3(c.y0)+'" width="'+n3(c.x1-c.x0)+'" height="'+n3(c.y1-c.y0)+'"/></clipPath>');
   open='<g clip-path="url(#'+id+'-c)">'}
  body.push(open,'<g class="'+id+'"'+inn.attrs+'>');
  anim(id+'-m',fr=>{const s=fr.parts[j];return mat(s)+'opacity:'+n3(s.opacity*(s.draw===null?1:s.fill))+';'});css.push('.'+id+'{transform-box:view-box;transform-origin:0 0;'+run(id+'-m')+'}');
  body.push(inn.body,'</g>');
  if(s0.draw!==null){body.push('<g class="'+id+'-ol"'+inn.attrs+'>'+pathLengthBody(part,m)+'</g>');
   anim(id+'-o',fr=>{const s=fr.parts[j];return mat(s)+'opacity:'+n3(s.opacity*s.outline)+';stroke-dashoffset:'+n3(1-clamp(s.draw,0,1))+';'});css.push('.'+id+'-ol{opacity:0;transform-box:view-box;transform-origin:0 0;'+run(id+'-o')+'}')}
  body.push('</g>')});
 body.push('</g>');
 if(L.payoff){const p=L.payoff;body.push('<g class="rxl-payoff"><text x="'+n3(p.x-x0)+'" y="'+n3(p.y-y0)+'" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="'+n3(p.size)+'" fill="'+p.color+'">'+p.lines.map((l,i)=>'<tspan x="'+n3(p.x-x0)+'" dy="'+(i?n3(p.lead):'0')+'">'+esc(l)+'</tspan>').join('')+'</text></g>');
  anim('rxl-p',fr=>'opacity:'+n3(fr.payoff.opacity)+';transform:translate(0px,'+n3(fr.payoff.rise*p.size)+'px);');css.push('.rxl-payoff{transform-box:view-box;transform-origin:0 0;'+run('rxl-p')+'}')}
 css.push('@media (prefers-reduced-motion: reduce){.rxl *{animation:none!important}}');
 return '<svg xmlns="http://www.w3.org/2000/svg" class="rxl" viewBox="0 0 '+n3(W)+' '+n3(H)+'" width="'+Math.round(W/4)+'" height="'+Math.round(H/4)+'" role="img" aria-label="'+label+'"><title>'+label+'</title><style>'+css.join('')+'</style>'+body.join('')+'</svg>'}
// The loader for the site: a full-page cover with the animated logo, gone when the page has loaded.
function loaderHtml(m,svg){const bg=m.bgHex||m.brand.palette.light;
 return ['<!-- Caricamento con il logo animato (RADIX). Incolla subito dopo <body>. Sparisce quando la pagina è caricata;',' con «riduci movimento» attivo resta il logo fermo. -->',
  '<style>.rx-loader{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:'+bg+';transition:opacity .35s ease,visibility .35s}.rx-loader svg{width:min(56vw,360px);height:auto}',
  'html.rx-loaded .rx-loader{opacity:0;visibility:hidden;pointer-events:none}@media (prefers-reduced-motion: reduce){.rx-loader{transition:none}}</style>',
  '<div class="rx-loader" aria-hidden="true">'+svg+'</div>',
  '<script>addEventListener(\'load\',function(){document.documentElement.classList.add(\'rx-loaded\')});setTimeout(function(){document.documentElement.classList.add(\'rx-loaded\')},6000);</script>'].join('\n')+'\n'}

// ---- GIF (89a) writer: LZW, global palette, NETSCAPE loop, frame differences ----
// The palette: background, the logo's and payoff's colours, their blends with the background (edges and fades) and
// with each other. No colour outside the kit and the logo. transparent → index 0 is reserved.
function gifPalette(colours,bg){const B=BP(),mix=B.mix,list=[],seen=new Set(),put=c=>{const h=up(c);if(/^#[0-9A-F]{6}$/.test(h)&&!seen.has(h)&&list.length<(bg?256:255)){seen.add(h);list.push(h)}};
 const base=[...new Set(colours.map(up))].filter(c=>/^#[0-9A-F]{6}$/.test(c)&&c!==up(bg||''));if(bg)put(bg);base.forEach(put);
 if(bg)for(const c of base)for(let i=1;i<8;i++)put(mix(bg,c,i/8));
 for(let i=0;i<base.length;i++)for(let j=i+1;j<base.length;j++)for(const t of [.25,.5,.75])put(mix(base[i],base[j],t));
 return list}
// RGBA pixels → palette indices (nearest colour; alpha < 128 → the transparent index when there is one).
function quantize(rgba,palette,{transparent=-1,cache}={}){const rgb=palette.map(h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16))),n=rgba.length/4,out=new Uint8Array(n),memo=cache||new Map();
 for(let i=0;i<n;i++){const a=rgba[i*4+3];if(transparent>=0&&a<128){out[i]=transparent;continue}const r=rgba[i*4],g=rgba[i*4+1],b=rgba[i*4+2],key=(r<<16)|(g<<8)|b;let idx=memo.get(key);
  if(idx===undefined){let best=1e12;idx=0;for(let k=0;k<rgb.length;k++){if(k===transparent)continue;const dr=r-rgb[k][0],dg=g-rgb[k][1],db=b-rgb[k][2],d=2*dr*dr+4*dg*dg+3*db*db;if(d<best){best=d;idx=k}}memo.set(key,idx)}
  out[i]=idx}
 return out}
// LZW for GIF: variable code size from minCode+1 up to 12 bits, clear code when the table is full.
function lzw(minCode,indices){const out=[];let acc=0,bits=0;const emit=(code,size)=>{acc|=code<<bits;bits+=size;while(bits>=8){out.push(acc&255);acc>>>=8;bits-=8}};
 const clear=1<<minCode,eoi=clear+1;let size=minCode+1,next=eoi+1,dict=new Map();emit(clear,size);
 if(!indices.length){emit(eoi,size);if(bits>0)out.push(acc&255);return out}
 let prefix=indices[0];
 for(let i=1;i<indices.length;i++){const k=indices[i],key=(prefix<<8)|k,c=dict.get(key);if(c!==undefined){prefix=c;continue}
  emit(prefix,size);
  if(next===4095){emit(clear,size);dict=new Map();size=minCode+1;next=eoi+1}else{if(next>=(1<<size))size++;dict.set(key,next++)}
  prefix=k}
 emit(prefix,size);emit(eoi,size);if(bits>0)out.push(acc&255);return out}
// frames: [{indices (w*h), delay (centiseconds)}]; identical frames are merged, opaque frames keep only the changed area.
// loop: 0 = forever, n = n more plays, null = play once (no NETSCAPE block).
function gifEncode({w,h,palette,frames,transparent=-1,loop=0}){const bitsN=Math.max(1,Math.ceil(Math.log2(Math.max(2,palette.length)))),tableSize=1<<bitsN,minCode=Math.max(2,bitsN),out=[];
 const u16=v=>out.push(v&255,(v>>8)&255),str=s=>{for(const ch of s)out.push(ch.charCodeAt(0))};
 str('GIF89a');u16(w);u16(h);out.push(0x80|((bitsN-1)<<4)|(bitsN-1),transparent>=0?transparent:0,0);
 for(let i=0;i<tableSize;i++){const c=palette[i]||'#000000';out.push(parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16))}
 if(loop!==null&&loop!==undefined){out.push(0x21,0xFF,11);str('NETSCAPE2.0');out.push(3,1);u16(loop);out.push(0)}
 // merge identical consecutive frames
 const list=[];for(const f of frames){const prev=list[list.length-1];if(prev&&sameArr(prev.indices,f.indices)){prev.delay+=f.delay;continue}list.push({indices:f.indices,delay:f.delay})}
 let prev=null;
 for(const f of list){let x0=0,y0=0,x1=w-1,y1=h-1;
  if(prev&&transparent<0){x0=w;y0=h;x1=-1;y1=-1;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(f.indices[i]!==prev[i]){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}}if(x1<0){x0=y0=x1=y1=0}}
  const fw=x1-x0+1,fh=y1-y0+1,px=new Uint8Array(fw*fh);for(let y=0;y<fh;y++)px.set(f.indices.subarray((y0+y)*w+x0,(y0+y)*w+x0+fw),y*fw);
  out.push(0x21,0xF9,4,((transparent>=0?2:1)<<2)|(transparent>=0?1:0));u16(Math.max(2,Math.round(f.delay)));out.push(transparent>=0?transparent:0,0);
  out.push(0x2C);u16(x0);u16(y0);u16(fw);u16(fh);out.push(0);
  out.push(minCode);const data=lzw(minCode,px);for(let i=0;i<data.length;i+=255){const n=Math.min(255,data.length-i);out.push(n);for(let j=0;j<n;j++)out.push(data[i+j])}out.push(0);
  prev=f.indices}
 out.push(0x3B);return new Uint8Array(out)}
function sameArr(a,b){if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true}

// ---- the files ----
const brandSlug=m=>slug(m.brand.name)||'brand';
const baseName=m=>'logo-animato-'+brandSlug(m)+'-'+m.proposal+'-'+m.format.replace(':','x');
function readme(m,checks,names,{date,recorded}={}){const d=(date||new Date()).toISOString().slice(0,10),f=format(m.format),L=['LOGO ANIMATO · '+(m.brand.name||'Brand'),
 'Proposta: '+proposal(m.proposal).title+' · '+verso(m.verso).title.toLowerCase()+' · '+m.duration+' s · '+f.title+' · fondo '+ROLE_LABEL[m.bg].toLowerCase()+' · velocità '+SPEEDS[m.speed].title.toLowerCase()+', movimento '+EASES[m.ease].title.toLowerCase()+', logo fermo '+comma(m.tl.hold)+' s',
 'Preparato con RADIX il '+d+' dal Kit identità, nessuna chiamata AI e nessun credito.',''];
 L.push('FILE',...names.map(n=>'- '+n+' · '+fileLabel(n,m)),'');
 L.push('COME USARLI');
 if(m.use==='video')L.push('- Video: metti il file all’inizio (entrata) o alla fine (uscita) del montaggio. Instagram, TikTok e molti programmi vogliono l’MP4; se hai solo il WebM, convertilo (per esempio con HandBrake, gratuito) o usa i fotogrammi PNG.','- Fotogrammi PNG: in CapCut, Premiere o DaVinci importali come sequenza a '+FPS_PNG+' fotogrammi al secondo.');
 if(m.use==='sticker')L.push('- Sticker: le GIF animate nelle storie di Instagram arrivano da GIPHY. Carica la GIF su un canale GIPHY verificato del brand; per WhatsApp e Telegram mandala come GIF.','- Per uno sticker vero serve il fondo trasparente.');
 if(m.use==='loader')L.push('- Sito: incolla caricamento.html subito dopo <body>. Il logo si ferma da solo se chi visita ha chiesto meno movimento.','- L’SVG si può usare anche da solo (<img src="logo-animato.svg">), ma le scritte del logo usano il font del kit solo dentro la pagina.');
 if(m.use==='email')L.push('- Email: inserisci la GIF come immagine, larga al massimo 600 px, con il testo alternativo «'+(m.brand.name||'Logo')+'». Outlook su computer mostra solo il primo fotogramma.');
 L.push('- Prova sempre il file sul telefono prima di usarlo.','');
 if(recorded)L.push('REGISTRAZIONE','- '+recorded,'');
 L.push('CONTROLLI',...checks.map(c=>'- '+c.label+': '+({ok:'OK',warn:'da guardare',fail:'da sistemare'})[c.state]+'. '+c.detail),'');
 if(!m.hasPayoff)L.push('DATI NON PRESENTI (RADIX non li inventa)','- Payoff: il progetto non ne ha uno.','');
 return L.join('\n')+'\n'}
function fileLabel(n,m){if(/\.mp4$/.test(n))return 'video MP4 '+format(m.format).w+'×'+format(m.format).h;if(/\.webm$/.test(n))return 'video WebM '+format(m.format).w+'×'+format(m.format).h;if(/\.gif$/.test(n))return 'GIF animata '+format(m.format).gif.join('×')+(m.gifLoop==='sempre'?', ripetuta':', un giro');
 if(/caricamento\.html$/.test(n))return 'caricamento del sito da incollare';if(/\.svg$/.test(n))return 'SVG animato con CSS (si ferma con «riduci movimento»)';if(/fotogrammi/.test(n))return 'fotogrammi PNG a '+FPS_PNG+' al secondo';return 'istruzioni'}
const bundle=(list,{date}={})=>ZIP().zip(list.map(f=>({name:f.name,data:f.data})),{date:date||new Date()});

// ---- saved in the project: the «agents» document, key logoMotion ----
const emptyStore=()=>({schemaVersion:1,items:[]});
function readStore(doc){const s=doc&&doc.logoMotion;return s&&typeof s==='object'&&Array.isArray(s.items)?{schemaVersion:1,items:s.items.filter(x=>x&&typeof x==='object')}:emptyStore()}
function savedRecord(m,{by,at,checks}={}){const when=at||new Date().toISOString();
 return {id:'logo-'+when.replace(/\D/g,'').slice(0,14),at:when,by:clean(by).slice(0,80),proposal:m.proposal,use:m.use,bg:m.bg,duration:m.duration,format:m.format,verso:m.verso,speed:m.speed,ease:m.ease,hold:m.hold,payoff:m.payoff,gifLoop:m.gifLoop,
  kit:{brand:clean(m.brand.name),direction:clean(m.brand.direction)},checks:(checks||checksOf(m)).map(c=>({id:c.id,state:c.state}))}}
function addRecord(store,rec){const s=readStore({logoMotion:store});return {schemaVersion:1,items:s.items.filter(x=>x.id!==rec.id).concat([rec]).slice(-MAX_SAVED)}}
async function saveToProject(ws,projectId,rec){if(!ws||typeof ws.bind!=='function')throw Error('Archivio del progetto non disponibile.');const d=ws.bind(projectId,'agents');
 for(let i=0;i<3;i++){const cur=(await d.load())||{},next=addRecord(readStore(cur),rec);
  try{await d.save({...cur,schemaVersion:1,conversations:cur.conversations||{},logoMotion:next});return next}catch(e){if(!(ws.ConflictError&&e instanceof ws.ConflictError)||i===2)throw e}}}
const inputOf=r=>({proposal:r.proposal,use:r.use,bg:r.bg,duration:r.duration,format:r.format,verso:r.verso,speed:r.speed,ease:r.ease,hold:r.hold,payoff:r.payoff,gifLoop:r.gifLoop});

// ---- drawing on a canvas (browser) ----
const doc=()=>root.document;
const canvas=(w,h)=>{const c=doc().createElement('canvas');c.width=w;c.height=h;return c};
// One frame on ctx (W × H px). opts.bg: false leaves the canvas transparent; R caches the offscreen canvas.
function drawFrame(ctx,m,t,R){const W=ctx.canvas.width,H=ctx.canvas.height,B=BP(),L=R&&R.L&&R.W===W&&R.H===H?R.L:layout(m,W,H);if(R){R.L=L;R.W=W;R.H=H}
 ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.clearRect(0,0,W,H);const bg=m.bgHex||(R&&R.opaque?m.brand.palette.light:null);if(bg){ctx.fillStyle=bg;ctx.fillRect(0,0,W,H)}
 const fr=frameAt(m,t),bx=L.box,base=c=>{c.setTransform(1,0,0,1,0,0);c.translate(bx.x,bx.y);c.scale(bx.k,bx.k);c.translate(-bx.vb[0],-bx.vb[1])};
 if(fr.still){ctx.save();base(ctx);B.draw(ctx,m.logo);ctx.restore()}
 else for(const s of fr.parts){const layers=[];if(s.draw===null)layers.push([s.svg,s.opacity]);else{layers.push([s.svg,s.opacity*s.fill]);if(s.outline>0&&s.draw>0)layers.push([outlineSvg(m.parts.list.find(p=>p.id===s.id),m,s.draw),s.opacity*s.outline])}
  for(const [svg,a] of layers){if(a<=.002)continue;let c=ctx;if(a<.998){if(!R)R={};if(!R.off||R.off.width!==W||R.off.height!==H)R.off=canvas(W,H);c=R.off.getContext('2d');c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.clearRect(0,0,W,H)}
   c.save();base(c);if(s.clip){c.beginPath();c.rect(s.clip.x0,s.clip.y0,s.clip.x1-s.clip.x0,s.clip.y1-s.clip.y0);c.clip()}const M=matrixOf(s);c.transform(...M);if(s.scale>1e-4)B.draw(c,svg);c.restore();
   if(c!==ctx){ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=a;ctx.drawImage(R.off,0,0);ctx.restore()}}}
 if(L.payoff&&fr.payoff.opacity>.002){const p=L.payoff;ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=clamp(fr.payoff.opacity,0,1);ctx.fillStyle=p.color;ctx.font='400 '+p.size+'px Helvetica, Arial, sans-serif';ctx.textAlign='center';ctx.textBaseline='alphabetic';
  p.lines.forEach((l,i)=>ctx.fillText(l,p.x,p.y+i*p.lead+fr.payoff.rise*p.size));ctx.restore()}
 return fr}
const toPng=c=>new Promise((ok,ko)=>c.toBlob(b=>b?b.arrayBuffer().then(x=>ok(new Uint8Array(x)),ko):ko(Error('PNG non creato')),'image/png'));
const pause=()=>new Promise(r=>setTimeout(r,0));
// The time of frame i of n at fps: on the grid, except the last one, which is the end of the timeline (the final frame).
const frameTime=(i,n,fps,D)=>i>=n-1?D:Math.min(D,i/fps);
// The fonts of the logo loaded before drawing (the kit's web fonts, at most 3 s).
async function fontsReady(m){const B=BP();try{await B.fontsReady((String(m.logo).match(/font-family="([^"]*)"/g)||[]).map(s=>s.slice(13,-1).replace(/&quot;|&#39;/g,'')).concat([m.brand.fonts.heading||'']))}catch(e){}}
// The GIF: frames at FPS_GIF in the GIF size of the format, palette from the kit and the logo.
async function makeGif(m,{onProgress}={}){await fontsReady(m);const [w,h]=format(m.format).gif,c=canvas(w,h),ctx=c.getContext('2d',{willReadFrequently:true}),R={},n=Math.round(m.tl.D*FPS_GIF),frames=[],cache=new Map();
 const L=layout(m,w,h),pal=gifPalette(logoColours(m.logo).concat(L.payoff?[L.payoff.color]:[]),m.bgHex),transparent=m.bgHex?-1:0,palette=transparent===0?['#000000'].concat(pal):pal;
 for(let i=0;i<n;i++){drawFrame(ctx,m,frameTime(i,n,FPS_GIF,m.tl.D),R);frames.push({indices:quantize(ctx.getImageData(0,0,w,h).data,palette,{transparent,cache}),delay:Math.round(100/FPS_GIF)});if(onProgress)onProgress((i+1)/n);if(i%8===0)await pause()}
 return gifEncode({w,h,palette,frames,transparent,loop:m.gifLoop==='sempre'?0:null})}
// The PNG frames at FPS_PNG in the full size of the format.
async function makeFrames(m,{onProgress}={}){await fontsReady(m);const f=format(m.format),c=canvas(f.w,f.h),ctx=c.getContext('2d'),R={},n=Math.round(m.tl.D*FPS_PNG),out=[];
 for(let i=0;i<n;i++){drawFrame(ctx,m,frameTime(i,n,FPS_PNG,m.tl.D),R);out.push({name:'fotogramma-'+String(i+1).padStart(4,'0')+'.png',data:await toPng(c)});if(onProgress)onProgress((i+1)/n)}
 return out}
// The video: recorded live from a canvas with MediaRecorder (WebM; MP4 too when the browser can write it).
function videoKinds(){const MR=root.MediaRecorder,R=RS();if(!MR||!R||!doc().createElement('canvas').captureStream)return [];return R.pickMimes(t=>MR.isTypeSupported(t))}
async function record(m,{onProgress}={}){const MR=root.MediaRecorder,RR=RS(),kinds=videoKinds();if(!kinds.length)throw Error('questo browser non registra video dal canvas: usa Chrome, Edge, Firefox o Safari aggiornati.');
 await fontsReady(m);const f=format(m.format),c=canvas(f.w,f.h),ctx=c.getContext('2d',{alpha:false}),R={opaque:true};drawFrame(ctx,m,0,R);
 const stream=c.captureStream(FPS_VIDEO),recs=kinds.map(k=>{const chunks=[],r=new MR(stream,{mimeType:k.mime,videoBitsPerSecond:RR.bitrate(f.w,f.h)});r.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data)};
  const done=new Promise(res=>{r.onstop=()=>res(new root.Blob(chunks,{type:k.mime}))});return {k,r,done}});
 const next=()=>new Promise(r=>(root.requestAnimationFrame||(fn=>setTimeout(fn,1000/FPS_VIDEO)))(r));
 recs.forEach(x=>x.r.start(500));const t0=root.performance.now();
 for(;;){const t=(root.performance.now()-t0)/1000;if(t>=m.tl.D)break;drawFrame(ctx,m,t,R);if(onProgress)onProgress(t/m.tl.D);await next()}
 drawFrame(ctx,m,m.tl.D,R);await next();await next();recs.forEach(x=>{try{x.r.stop()}catch(e){}});const blobs=await Promise.all(recs.map(x=>x.done));stream.getTracks().forEach(t=>t.stop());
 const out={width:f.w,height:f.h};for(let i=0;i<recs.length;i++){const b=new Uint8Array(await blobs[i].arrayBuffer());out[recs[i].k.ext]=recs[i].k.ext==='webm'?RR.webmDuration(b,m.tl.D):b;out[recs[i].k.ext+'Mime']=recs[i].k.mime}
 return out}

// ---- the widget (browser) ----
let counter=0;
const E=(tag,text,cls)=>{const n=doc().createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
const button=(text,cls)=>{const b=E('button',text,cls||'');b.type='button';return b};
const MIME={png:'image/png',svg:'image/svg+xml',txt:'text/plain;charset=utf-8',zip:'application/zip',gif:'image/gif',webm:'video/webm',mp4:'video/mp4',html:'text/html;charset=utf-8'};
const save=(name,data)=>PS().download(name.split('/').pop(),typeof data==='string'?new TextEncoder().encode(data):data,MIME[name.split('.').pop()]||'application/octet-stream');
const reduced=()=>{try{return !!(root.matchMedia&&root.matchMedia('(prefers-reduced-motion: reduce)').matches)}catch(e){return false}};
// A canvas that plays the animation: {el, canvas, play(), stop(), seek(t), onTime}.
function player(getModel,w,h,{label}={}){const c=canvas(w,h);c.className='lm-canvas';c.setAttribute('role','img');c.setAttribute('aria-label',label||'Anteprima del logo animato');const ctx=c.getContext('2d'),R={opaque:false};
 const p={canvas:c,t:0,playing:false,raf:0,onTime:null,draw(){const m=getModel();drawFrame(ctx,m,Math.min(p.t,m.tl.D),R);if(p.onTime)p.onTime(p.t,m.tl.D)},
  seek(t){p.t=t;p.draw()},stop(){p.playing=false;if(p.raf)(root.cancelAnimationFrame||clearTimeout)(p.raf);p.raf=0},
  play({loop=true}={}){p.stop();p.playing=true;let t0=null;const m0=getModel(),start=p.t>=m0.tl.D-.01?0:p.t;
   const step=now=>{if(!p.playing)return;if(t0===null)t0=now;const m=getModel();let t=start+(now-t0)/1000;if(t>=m.tl.D){if(loop){t0=now;t=0}else{p.t=m.tl.D;p.draw();p.stop();if(p.onEnd)p.onEnd();return}}p.t=t;p.draw();p.raf=(root.requestAnimationFrame||(f=>setTimeout(()=>f(root.performance.now()),33)))(step)};
   p.raf=(root.requestAnimationFrame||(f=>setTimeout(()=>f(root.performance.now()),33)))(step)}};
 return p}
// ctx: {project, profile, projectName, projectId, workspace, agentsUrl, by, openIdentity(), identityUrl}
function logoMotionStudio(ctx={}){const n=++counter,P=PS(),B=BP(),profile=ctx.profile||{},wrap=E('div',undefined,'tool photo-studio ad-studio coordinato-studio social-studio logo-motion');
 const steps=E('ol',undefined,'ps-steps');['Le domande','3 proposte','Rifinitura e controlli','Scarica i file'].forEach((t,i)=>{const li=E('li',(i+1)+' · '+t);li.dataset.step=String(i+1);steps.append(li)});
 const setStep=k=>[...steps.children].forEach(li=>li.dataset.state=+li.dataset.step<k?'done':+li.dataset.step===k?'current':'todo');
 wrap.append(steps);setStep(1);
 const brand=P.brandOf(profile,ctx.projectName);
 if(!hasKit(profile)||!brand.logo){const box=E('div',undefined,'co-empty');box.dataset.empty='kit';box.append(E('h3','Prima serve il Kit identità'),E('p',hasKit(profile)?'Il Kit identità di questo progetto non ha un logo SVG da animare. RADIX non disegna un logo al suo posto.':'Il logo animato parte dal logo SVG e dai colori del Kit identità del progetto. Questo progetto non ne ha ancora uno salvato, e RADIX non inventa logo, colori o dati dell’azienda al suo posto.','ad-idea'));
  const go=ctx.openIdentity?button('Crea il Kit identità','primary'):E('a','Crea il Kit identità','co-link primary');if(ctx.openIdentity)go.onclick=()=>ctx.openIdentity();else go.href=ctx.identityUrl||'/agency/crea.html?open=identita';
  const acts=E('div',undefined,'ps-actions');acts.append(go,E('span','Il Kit identità è una chiamata AI con conferma; l’animazione del logo poi è gratuita.','muted'));box.append(acts);wrap.append(box);return wrap}
 let measure=null;try{measure=B.canvasMeasure()}catch(e){measure=null}
 const pre=prefill(profile,{projectName:ctx.projectName});
 const st={use:'video',bg:'light',duration:3,format:'16:9',verso:'entrata',proposal:'',speed:'normale',ease:'',hold:1,payoff:true,gifLoop:'',files:[],sizes:null,busy:false,recorded:''};
 const input=pid=>({...st,proposal:pid||st.proposal||'disegno',ease:pid&&pid!==st.proposal?'':st.ease,gifLoop:st.gifLoop||use(st.use).gifLoop});
 const model=pid=>modelOf(input(pid),profile,{projectName:ctx.projectName,measure});
 // the kit in use
 const bx=E('div',undefined,'ad-brand co-brand');bx.dataset.source='kit';const sw=E('span',undefined,'ad-swatches');
 ROLES.forEach(k=>{const i=E('i');i.style.background=brand.palette[k];i.title=ROLE_LABEL[k]+' '+brand.palette[k];sw.append(i)});
 const bt=E('span',undefined,'ad-brand-text');bt.append(E('strong',brand.name||'Il tuo brand'),E('span','Dal Kit identità'+(brand.direction?' «'+brand.direction+'»':'')+(pre.payoff?' · payoff «'+pre.payoff+'»':' · nessun payoff nel progetto')));
 const li=E('img');li.src=P.svgUrl(brand.logo);li.alt='Logo del kit';li.className='ad-brand-logo';bx.append(sw,bt,li);
 const form=E('div',undefined,'ps-form');
 const radios=(legend,key,list,{note,onPick}={})=>{const fs=E('fieldset',undefined,'fs-choice lm-choice');fs.dataset.key=key;fs.append(E('legend',legend));
  list.forEach(([id,label,sub,swatch])=>{const l=E('label',undefined,'ps-chip co-opt'+(swatch?' fs-swatch':'')),c=E('input');c.type='radio';c.name='lm-'+key+'-'+n;c.value=String(id);c.checked=String(st[key])===String(id);
   c.onchange=()=>{st[key]=typeof st[key]==='number'?+id:id;if(onPick)onPick(id);changed()};l.append(c);if(swatch){const i=E('i');i.style.background=swatch;l.append(i)}l.append(E('span',label));if(sub)l.append(E('small',sub));fs.append(l)});
  if(note)fs.append(E('p',note,'ad-note'));return fs};
 const syncRadios=()=>form.querySelectorAll('fieldset[data-key] input').forEach(c=>{const k=c.closest('fieldset').dataset.key;c.checked=String(st[k])===String(c.value)});
 const useFs=radios('A cosa serve','use',USES.map(u=>[u.id,u.title,u.line]),{onPick:id=>{const u=use(id);st.format=u.format;st.verso=u.verso;st.gifLoop='';if(id==='sticker'&&st.bg!=='trasparente')st.bg='trasparente';syncRadios()}});
 const bgList=()=>BGS.map(r=>[r,ROLE_LABEL[r],r==='trasparente'?'GIF e SVG':brand.palette[r],r==='trasparente'?'transparent':brand.palette[r]]);
 const bgFs=radios('Fondo','bg',bgList(),{note:'Solo i colori del Kit identità. Il trasparente vale per GIF e SVG; il video usa il colore chiaro del kit.'});
 const durFs=radios('Durata','duration',DURATIONS.map(d=>[d,d+' secondi']));
 const fmtFs=radios('Formato','format',FORMATS.map(f=>[f.id,f.title,f.w+' × '+f.h]));
 const verFs=radios('Come finisce','verso',VERSI.map(v=>[v.id,v.title,v.line]));
 const go=button('Prepara 3 proposte','primary'),bar=E('div',undefined,'ps-actions');bar.append(go,E('span','Nessuna chiamata AI e nessun credito: il movimento è scritto in codice e si disegna qui dal tuo logo.','muted'));
 form.append(bx,useFs,bgFs,durFs,fmtFs,verFs,bar);
 const status=E('p','','tool-status');status.setAttribute('role','status');
 const saved=E('div',undefined,'ad-saved co-saved');saved.hidden=true;
 const dirs=E('div',undefined,'ad-dirs co-dirs lm-dirs'),result=E('div',undefined,'ad-result co-result lm-result'),out=E('div',undefined,'co-kit lm-out');dirs.hidden=result.hidden=out.hidden=true;
 wrap.append(form,saved,status,dirs,result,out);
 const players=[];const stopAll=()=>players.forEach(p=>p.stop());
 let timer=0;function changed(){st.files=[];st.sizes=null;if(dirs.hidden)return;clearTimeout(timer);timer=setTimeout(()=>{renderDirs();if(st.proposal)renderResult()},250)}
 async function loadSaved(){if(!ctx.workspace||!ctx.projectId)return;try{const s=readStore(await ctx.workspace.bind(ctx.projectId,'agents').load());if(!s.items.length)return;
  saved.replaceChildren(E('h4','Animazioni del logo salvate nel progetto'));const row=E('div',undefined,'ad-saved-row');
  s.items.slice(-4).reverse().forEach(r=>{const b=button(proposal(r.proposal).title+' · '+use(r.use).title+' · '+String(r.at||'').slice(0,10),'ad-saved-item');b.onclick=()=>{Object.assign(st,normalize(inputOf(r)));syncRadios();renderDirs();renderResult();status.textContent='Riaperta l’animazione salvata.'};row.append(b)});
  saved.append(row);saved.hidden=false}catch(e){}}
 loadSaved();
 go.onclick=()=>{renderDirs();status.textContent='Ecco 3 proposte fatte col tuo logo: guardale e scegli.';dirs.scrollIntoView&&dirs.scrollIntoView({behavior:'smooth',block:'start'})};
 // a strip of frames: the same animation, still (also for whoever asked for less motion)
 const STRIP=[.08,.3,.5,.72,1];
 // each frame cropped around the logo (and the payoff), so the movement reads even when small
 function strip(m,w){const f=format(m.format),L=layout(m,f.w,f.h),bx=L.box,pad=bx.h*.3,x0=Math.max(0,bx.x-pad),y0=Math.max(0,bx.y-pad),y1=Math.min(f.h,(L.payoff?L.payoff.y+(L.payoff.lines.length-1)*L.payoff.lead+L.payoff.size*.4:bx.y+bx.h)+pad);
  const k=w/(f.w-2*x0),h=Math.max(1,Math.round((y1-y0)*k)),full=canvas(Math.round(f.w*k),Math.round(f.h*k)),fx=full.getContext('2d'),row=E('div',undefined,'lm-strip'),R={};
  for(const q of STRIP){const t=Math.min(m.tl.D,m.verso==='entrata'?(m.tl.segs.find(s=>s.kind==='entra')||{from:0}).from+q*m.tl.motion:q*m.tl.D),fg=E('figure',undefined,'lm-frame'),c=canvas(w,h);c.setAttribute('aria-hidden','true');
   drawFrame(fx,m,t,R);c.getContext('2d').drawImage(full,Math.round(x0*k),Math.round(y0*k),w,h,0,0,w,h);fg.append(c,E('figcaption',comma(Math.round(t*10)/10)+' s'));row.append(fg)}
  return row}
 async function renderDirs(){setStep(st.proposal?3:2);dirs.hidden=false;stopAll();players.length=0;await fontsReady(model());
  dirs.replaceChildren(...PROPOSALS.map(pr=>{const m=model(pr.id),f=format(m.format);
   const card=E('article',undefined,'ad-dir co-dir lm-dir');card.dataset.chosen=String(st.proposal===pr.id);card.dataset.proposal=pr.id;
   const head=E('div',undefined,'ad-dir-head');head.append(E('span','Proposta','ad-angle'),E('h3',pr.title),E('p',pr.line+(m.parts.split||pr.id==='disegno'?'':' Il tuo logo non ha simbolo e nome separati: si muove tutto insieme.'),'ad-idea'));
   const pl=player(()=>model(pr.id),360,Math.round(360*f.h/f.w),{label:'Anteprima «'+pr.title+'»'});players.push(pl);pl.seek(m.tl.D);
   const stage=E('div',undefined,'lm-stage');stage.dataset.format=m.format;stage.dataset.bg=m.bg;stage.append(pl.canvas);
   const pb=button('▶ Guarda','lm-play');pb.onclick=()=>{stopAll();pl.t=0;pl.play({loop:false});pl.onEnd=()=>{pb.textContent='▶ Guarda di nuovo'}};
   const pick=button(st.proposal===pr.id?'Proposta scelta':'Scegli questa proposta','primary');pick.onclick=()=>{if(st.proposal!==pr.id)st.ease='';st.proposal=pr.id;renderDirs();renderResult();result.scrollIntoView&&result.scrollIntoView({behavior:'smooth',block:'start'})};
   card.append(head,stage,pb,strip(m,200),pick);return card}))}
 function checkRow(c){const row=E('div',undefined,'co-check');row.dataset.state=c.state;row.dataset.check=c.id;
  row.append(E('span',{ok:'OK',warn:'Da guardare',fail:'Da sistemare'}[c.state],'co-check-badge'),E('strong',c.label),E('p',c.detail,'co-check-detail'));
  if(c.issues.length){const ul=E('ul');c.issues.forEach(i=>ul.append(E('li',i)));row.append(ul)}return row}
 const chips=(legend,key,list,cls)=>{const fs=E('fieldset',undefined,'fs-choice '+(cls||''));fs.dataset.key=key;fs.append(E('legend',legend));
  list.forEach(([id,label,swatch])=>{const l=E('label',undefined,'ps-chip'+(swatch?' fs-swatch':'')),x=E('input');x.type='radio';x.name='lm-r-'+key+'-'+n;x.value=String(id);x.checked=String(st[key]||model()[key])===String(id);
   x.onchange=()=>{st[key]=id;if(key==='bg')syncRadios();st.files=[];st.sizes=null;out.hidden=true;renderResult()};l.append(x);if(swatch){const i=E('i');i.style.background=swatch;l.append(i)}l.append(E('span',label));fs.append(l)});return fs};
 let big=null;
 function renderResult(){const m=model();if(!st.ease)st.ease=m.ease;setStep(st.files.length?4:3);result.hidden=false;stopAll();
  const head=E('div',undefined,'ad-result-head'),hd=E('div');hd.append(E('span','Proposta '+proposal(m.proposal).title,'ad-angle'),E('h3','Il logo animato di '+(brand.name||'il tuo brand')),E('p','Rifinisci velocità, movimento, fondo e tenuta finale: anteprima e controlli si aggiornano.','ad-idea'));head.append(hd);
  const f=format(m.format),w=Math.min(720,f.w),pw=f.h>f.w?Math.round(w*.45):w;
  if(big)big.stop();big=player(()=>model(),pw,Math.round(pw*f.h/f.w),{label:'Anteprima del logo animato'});players.push(big);
  const stage=E('div',undefined,'lm-stage lm-big');stage.dataset.format=m.format;stage.dataset.bg=m.bg;stage.append(big.canvas);
  const ctl=E('div',undefined,'lm-controls'),pb=button('▶ Riproduci','lm-play'),rg=E('input');rg.type='range';rg.min='0';rg.max=String(m.tl.D);rg.step='0.01';rg.value=String(m.tl.D);rg.name='lm-time-'+n;rg.setAttribute('aria-label','Momento dell’animazione');
  const tm=E('span',comma(m.tl.D.toFixed(1))+' s','lm-time');big.onTime=(t,D)=>{rg.value=String(t);tm.textContent=comma(t.toFixed(1))+' / '+comma(D.toFixed(1))+' s'};
  pb.onclick=()=>{if(big.playing){big.stop();pb.textContent='▶ Riproduci'}else{big.play({loop:true});pb.textContent='❚❚ Pausa'}};rg.oninput=()=>{big.stop();pb.textContent='▶ Riproduci';big.seek(+rg.value)};
  ctl.append(pb,rg,tm);
  const ref=E('div',undefined,'fs-refine sc-refine lm-refine');
  ref.append(chips('Velocità','speed',Object.entries(SPEEDS).map(([k,v])=>[k,v.title])),chips('Movimento','ease',Object.entries(EASES).map(([k,v])=>[k,v.title])),
   chips('Fondo','bg',bgList().map(([r,l,,s])=>[r,l,s])),chips('Logo fermo alla fine','hold',HOLDS.map(h=>[h,comma(h)+' s'])));
  if(pre.payoff){const fs=E('fieldset',undefined,'fs-choice');fs.append(E('legend','Payoff'));const l=E('label',undefined,'ps-chip'),x=E('input');x.type='checkbox';x.name='lm-payoff-'+n;x.checked=st.payoff;x.onchange=()=>{st.payoff=x.checked;st.files=[];renderResult()};l.append(x,E('span','Mostra «'+pre.payoff+'»'));fs.append(l,E('p','Il payoff viene dal progetto.','ad-note'));ref.append(fs)}
  else{const fs=E('fieldset',undefined,'fs-choice');fs.append(E('legend','Payoff'),E('p','Il progetto non ha un payoff: l’animazione mostra solo il logo. RADIX non lo inventa.','ad-note'));ref.append(fs)}
  if(m.use!=='video'&&m.use!=='loader')ref.append(chips('La GIF si ripete','gifLoop',Object.entries(GIF_LOOPS)));
  const checks=checksOf(m,{sizes:st.sizes}),cb=E('div',undefined,'co-checks');cb.append(E('h4','Controlli prima di scaricare'),...checks.map(checkRow));
  const fails=blocking(checks);
  result.replaceChildren(head,stage,ctl,ref,cb,exportBox(m,fails));
  if(reduced())big.seek(m.tl.D);else if(!st.files.length){big.t=0;big.play({loop:true});pb.textContent='❚❚ Pausa'}else big.seek(m.tl.D)}
 function exportBox(m,fails){const box=E('section',undefined,'lm-export');box.append(E('h4','I file'));
  const kinds=videoKinds(),hasMp4=kinds.some(k=>k.ext==='mp4'),rs=E('p','','tool-status');rs.setAttribute('role','status');
  const vid=button('Registra il video ('+(kinds.length?kinds.map(k=>k.ext.toUpperCase()).join(' e '):'non disponibile')+')'),gif=button('Crea la GIF'),svg=button('Animazione per il sito (SVG e CSS)'),png=button('Fotogrammi PNG (.zip)');
  vid.disabled=!kinds.length;
  const note=E('p',!kinds.length?'Questo browser non registra video dal canvas: usa la GIF o i fotogrammi PNG, oppure apri RADIX in Chrome, Edge, Firefox o Safari aggiornati.':hasMp4?'Il tuo browser registra anche l’MP4, il formato che vogliono Instagram e TikTok. La registrazione dura '+m.duration+' s: lascia aperta la scheda.':'Il tuo browser registra solo il WebM: Instagram e TikTok vogliono l’MP4. Convertilo (per esempio con HandBrake) o usa i fotogrammi PNG nel programma di montaggio. Chrome e Safari aggiornati registrano anche l’MP4.','ad-note lm-honest');
  const primary=m.use==='loader'?svg:m.use==='video'?vid:gif;primary.className='primary';
  const acts=E('div',undefined,'ps-actions lm-actions');(m.use==='loader'?[svg,gif,vid,png]:m.use==='video'?[vid,gif,png,svg]:[gif,svg,vid,png]).forEach(b=>acts.append(b));
  const blocked=()=>{if(fails.length){rs.textContent='Prima sistema: '+fails.map(c=>c.label.toLowerCase()).join(', ')+'.';return true}return st.busy};
  const base=baseName(m),add=(name,data,label)=>{st.files=st.files.filter(x=>x.name!==name).concat([{name,data,label}]);st.sizes=Object.fromEntries(st.files.filter(x=>!/LEGGIMI/.test(x.name)).map(x=>[x.name,typeof x.data==='string'?new TextEncoder().encode(x.data).length:x.data.length]))};
  const run=async(btn,label,fn)=>{if(blocked())return;st.busy=true;acts.querySelectorAll('button').forEach(b=>b.disabled=true);stopAll();rs.textContent=label+'…';
   try{await fn(p=>{rs.textContent=label+'… '+Math.round(p*100)+'%'});renderResult();renderOut(m)}catch(e){rs.textContent='File non creato: '+e.message}finally{st.busy=false;acts.querySelectorAll('button').forEach(b=>b.disabled=b===vid&&!kinds.length)}};
  vid.onclick=()=>run(vid,'Registro il video',async prog=>{const r=await record(m,{onProgress:prog});if(r.mp4)add(base+'.mp4',r.mp4,'Video MP4');if(r.webm)add(base+'.webm',r.webm,'Video WebM');st.recorded='Video registrato dal browser con MediaRecorder: '+[r.mp4?'MP4 ('+r.mp4Mime+')':'',r.webm?'WebM ('+r.webmMime+')':''].filter(Boolean).join(' e ')+'.'});
  gif.onclick=()=>run(gif,'Creo la GIF',async prog=>{add(base+'.gif',await makeGif(m,{onProgress:prog}),'GIF animata')});
  svg.onclick=()=>run(svg,'Preparo l’SVG',async()=>{const s=animatedSvg(m,{loop:true});add('logo-animato.svg',s,'SVG animato');add('caricamento.html',loaderHtml(m,s),'Caricamento del sito')});
  png.onclick=()=>run(png,'Disegno i fotogrammi',async prog=>{const fr=await makeFrames(m,{onProgress:prog});add(base+'-fotogrammi.zip',bundle(fr.map(f=>({name:'fotogrammi/'+f.name,data:f.data}))),'Fotogrammi PNG')});
  box.append(acts,note,rs);return box}
 const saveB=button('Salva nel progetto');
 saveB.onclick=async()=>{const rs=out.querySelector('.tool-status')||status;if(!ctx.workspace||!ctx.projectId){rs.textContent='Apri un progetto per salvare.';return}saveB.disabled=true;
  try{await saveToProject(ctx.workspace,ctx.projectId,savedRecord(model(),{by:ctx.by}));rs.replaceChildren(doc().createTextNode('Salvata nel progetto: proposta e scelte (i file no, si rifanno da qui). '));if(ctx.agentsUrl){const a=E('a','Apri in Agenti AI →');a.href=ctx.agentsUrl;rs.append(a)}loadSaved()}
  catch(e){rs.textContent='Salvataggio non riuscito: '+e.message}finally{saveB.disabled=false}};
 function renderOut(m){setStep(4);out.hidden=false;const list=st.files.slice(),checks=checksOf(m,{sizes:st.sizes}),names=list.map(f=>f.name),readmeTxt=readme(m,checks,names,{recorded:st.recorded});
  const top=E('div',undefined,'co-kit-head');top.append(E('h3','I file del logo animato'),E('p','Scarica quelli che ti servono o tutto insieme, con LEGGIMI.txt che dice come usarli.','ad-idea'));
  const g=E('div',undefined,'co-group'),ul=E('ul');
  list.forEach(f=>{const li=E('li'),t=E('span',undefined,'co-file');t.append(E('strong',f.label),E('small',f.name+' · '+kb(st.sizes[f.name]||0)));const b=button('Scarica','co-dl');b.onclick=()=>save(f.name,f.data);li.append(t,b);ul.append(li)});
  g.append(ul);const cols=E('div',undefined,'co-files');cols.append(g);
  const media=list.find(f=>/\.(mp4|webm)$/.test(f.name))||list.find(f=>/\.gif$/.test(f.name));let view=null;
  if(media){const blob=new root.Blob([media.data],{type:MIME[media.name.split('.').pop()]}),url=root.URL.createObjectURL(blob);if(/\.gif$/.test(media.name)){view=E('img',undefined,'lm-result-media');view.alt='GIF del logo animato';view.src=url}else{view=E('video',undefined,'lm-result-media');view.controls=true;view.playsInline=true;view.muted=true;view.loop=true;view.autoplay=!reduced();view.src=url}}
  const zipB=button('Scarica tutto (.zip)','primary'),acts=E('div',undefined,'ps-actions');zipB.onclick=()=>save(baseName(m)+'.zip',bundle(list.map(f=>({name:baseName(m)+'/'+f.name,data:f.data})).concat([{name:baseName(m)+'/LEGGIMI.txt',data:readmeTxt}])));
  const rs=E('p','','tool-status');rs.setAttribute('role','status');acts.append(zipB,saveB,E('span',list.length+' file più LEGGIMI.txt.','muted'));
  out.replaceChildren(top,...(view?[view]:[]),acts,cols,rs);out.scrollIntoView&&out.scrollIntoView({behavior:'smooth',block:'start'})}
 return wrap}

return Object.freeze({AGENT,USES,FORMATS,DURATIONS,VERSI,SPEEDS,HOLDS,GIF_LOOPS,ROLES,BGS,EASES,IDENTITY,PROPOSALS,FPS_VIDEO,FPS_GIF,FPS_PNG,
 use,format,verso,proposal,valueAt,timeline,progressAt,hasKit,prefill,logoFor,partsOf,normalize,modelOf,partState,frameAt,isIdentity,matrixOf,layout,lengthOf,outlineSvg,
 logoColours,logoPairs,edgeFrames,checksOf,blocking,animatedSvg,loaderHtml,gifPalette,quantize,lzw,gifEncode,baseName,readme,bundle,frameTime,readStore,savedRecord,addRecord,saveToProject,inputOf,
 drawFrame,makeGif,makeFrames,videoKinds,record,player,logoMotionStudio});
});
