/* Studio «Mockup» (agency job I4): the materials the project already has, placed on believable scenes drawn in code with
   canvas 2D, with NO AI, no image generation and no credits. The drawing of a material is never redone: its own SVG (or
   the page of the site) is put in perspective as it is.
   1. The materials: read from the project (the Kit identità in profile.identityKit, the «agents» document: coordinato,
      socialKit and menu records, the Studio Stampa and grande formato entries, the saved site page). Only what exists is
      offered; what is missing is listed with the studio that makes it. Nothing is invented: no company data, no texts.
   2. Three scene proposals among those the materials allow: desk from above (letterhead, envelope, cards, folder), a
      stack of business cards, a phone on the table (post, story, profile with the cover, or the site), a laptop with the
      site, a shop sign on a wall (a grande formato panel or a plate with the kit logo), a roll-up in a room, the menu on
      a table. The person picks one.
   3. The refinement: background tone (neutral or a palette colour of the kit), angle, shadow strength, which items.
   4. The checks: the materials of the scene present (missing ones named with their studio), proportions kept (every
      item is a 3D rectangle with the real size of the material: nothing stretched), source resolution for the export,
      placeholders still inside a material, nothing invented.
   5. The files: PNG 2400 px wide for the chosen scene (and the other two proposals with the same tone), a contact sheet
      PDF written by lib/print-studio.js, LEGGIMI.txt, all in one zip (lib/zip-lite.js).
   The engine: a tiny camera (look-at, perspective) projects the 3D rectangles of the scene; the material is mapped on
   its projected quad with a homography (projective transform from 4 point pairs), drawn as a mesh of subdivided
   triangles, each an affine drawImage clipped to the triangle. Soft shadows (blurred footprints), paper grain, a global
   light gradient and a vignette finish the picture.
   The choice is saved in the project: the «agents» document under the key mockups (agents-page.js keeps it).
   Pure part (geometry, inventory, scenes, plans, checks, contact sheet layout) runs in Node for the tests;
   mockupStudio() is the browser widget. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixMockupStudio=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
function lib(name,file){if(root[name])return root[name];try{return typeof require==='function'?require(file):null}catch(e){return null}}
const PS=()=>lib('RadixPrintStudio','./print-studio.js'),CO=()=>lib('RadixCoordinatoStudio','./coordinato-studio.js'),LF=()=>lib('RadixLargeFormatStudio','./large-format-studio.js'),
 MN=()=>lib('RadixMenuStudio','./menu-studio.js'),SO=()=>lib('RadixSocialStudio','./social-studio.js'),ZIP=()=>lib('RadixZip','./zip-lite.js');
const AGENT='art-director',MAX_SAVED=10,EXPORT_W=2400,EXPORT_H=1600,PREVIEW_W=720,PREVIEW_H=480;
const clean=s=>String(s==null?'':s).replace(/\s+/g,' ').trim();
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const slug=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const comma=x=>String(x).replace('.',',');
const kb=n=>n<1e6?Math.max(1,Math.round(n/1e3))+' KB':comma((n/1e6).toFixed(1)).replace(/,0$/,'')+' MB';
const RAD=Math.PI/180,PAPER='#FDFCFA';

// ---- colours ----
const rgbOf=h=>{const x=String(h||'#000000').replace('#','');return [0,2,4].map(i=>parseInt(x.slice(i,i+2),16)||0)};
const hexOf=a=>'#'+a.map(v=>Math.round(clamp(v,0,255)).toString(16).padStart(2,'0')).join('').toUpperCase();
const mix=(a,b,t)=>{const x=rgbOf(a),y=rgbOf(b);return hexOf(x.map((v,i)=>v+(y[i]-v)*t))};
const lum=h=>{const [r,g,b]=rgbOf(h).map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});return .2126*r+.7152*g+.0722*b};
const rgba=(h,a)=>{const [r,g,b]=rgbOf(h);return 'rgba('+r+','+g+','+b+','+Math.round(clamp(a,0,1)*1000)/1000+')'};

// ---- projective geometry ----
// Solve A x = b (n × n) by Gaussian elimination with partial pivoting; null when singular.
function solve(A,b){const n=b.length,M=A.map((r,i)=>r.slice().concat([b[i]]));
 for(let c=0;c<n;c++){let p=c;for(let r=c+1;r<n;r++)if(Math.abs(M[r][c])>Math.abs(M[p][c]))p=r;if(Math.abs(M[p][c])<1e-12)return null;[M[c],M[p]]=[M[p],M[c]];
  for(let r=0;r<n;r++){if(r===c)continue;const f=M[r][c]/M[c][c];if(f)for(let k=c;k<=n;k++)M[r][k]-=f*M[c][k]}}
 return M.map((r,i)=>r[n]/r[i])}
// The homography H (3 × 3, row-major, H[8] = 1) that maps the 4 points src[i] to dst[i]; null for degenerate quads.
function homography(src,dst){const A=[],b=[];
 for(let i=0;i<4;i++){const [x,y]=src[i],[u,v]=dst[i];A.push([x,y,1,0,0,0,-u*x,-u*y]);b.push(u);A.push([0,0,0,x,y,1,-v*x,-v*y]);b.push(v)}
 const h=solve(A,b);return h?h.concat([1]):null}
function apply(H,x,y){const w=H[6]*x+H[7]*y+H[8];return [(H[0]*x+H[1]*y+H[2])/w,(H[3]*x+H[4]*y+H[5])/w]}
function invert(H){const [a,b,c,d,e,f,g,h,i]=H,A=e*i-f*h,B=-(d*i-f*g),C=d*h-e*g,det=a*A+b*B+c*C;if(Math.abs(det)<1e-15)return null;
 const out=[A,-(b*i-c*h),b*f-c*e,B,a*i-c*g,-(a*f-c*d),C,-(a*h-b*g),a*e-b*d].map(v=>v/det);const k=out[8];return Math.abs(k)>1e-15?out.map(v=>v/k):out}
// The affine transform [a,b,c,d,e,f] (canvas setTransform order) that maps triangle s onto triangle d.
function affine(s,d){const A=[[s[0][0],s[0][1],1],[s[1][0],s[1][1],1],[s[2][0],s[2][1],1]],x=solve(A,d.map(p=>p[0])),y=solve(A,d.map(p=>p[1]));
 return x&&y?[x[0],y[0],x[1],y[1],x[2],y[2]]:null}
// The mesh: an n × n grid over a w × h source, each cell split in two triangles, with the projected points.
function mesh(w,h,H,n){const N=Math.max(1,Math.round(n)),P=[],out=[];
 for(let j=0;j<=N;j++){const row=[];for(let i=0;i<=N;i++){const s=[w*i/N,h*j/N];row.push({s,d:apply(H,s[0],s[1])})}P.push(row)}
 for(let j=0;j<N;j++)for(let i=0;i<N;i++){const a=P[j][i],b=P[j][i+1],c=P[j+1][i+1],d=P[j+1][i];out.push({s:[a.s,b.s,c.s],d:[a.d,b.d,c.d]},{s:[a.s,c.s,d.s],d:[a.d,c.d,d.d]})}
 return out}
// The local scale of H at (x, y): how many destination px one source unit becomes along x and y (to size the sources).
function localScale(H,x,y,e=1){const p=apply(H,x,y),qx=apply(H,x+e,y),qy=apply(H,x,y+e);return {sx:Math.hypot(qx[0]-p[0],qx[1]-p[1])/e,sy:Math.hypot(qy[0]-p[0],qy[1]-p[1])/e}}
const area2=poly=>{let s=0;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];s+=a[0]*b[1]-b[0]*a[1]};return s/2};

// ---- a small 3D camera ----
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],mul=(a,k)=>[a[0]*k,a[1]*k,a[2]*k];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l]};
// World: x right, y away from the viewer, z up (mm). pitch: degrees above the horizontal (90 = straight down), yaw:
// degrees the camera turns around the target (positive = from the left). fov: vertical field of view.
function camera({target=[0,0,0],pitch=60,yaw=0,dist=1000,fov=28,W=1200,H=800}={}){const ph=pitch*RAD,ya=yaw*RAD;
 const back=[-Math.sin(ya)*Math.cos(ph),-Math.cos(ya)*Math.cos(ph),Math.sin(ph)],C=add(target,mul(back,dist)),f=norm(sub(target,C));
 const hint=Math.abs(f[2])>.999?[Math.sin(ya),Math.cos(ya),0]:[0,0,1],r=norm(cross(f,hint)),u=cross(r,f),focal=(H/2)/Math.tan(fov*RAD/2);
 return {C,f,r,u,focal,W,H,project(p){const d=sub(p,C),z=dot(d,f);return [W/2+dot(d,r)*focal/z,H/2-dot(d,u)*focal/z]},depth(p){return dot(sub(p,C),f)},
  faces(center,normal){return dot(normal,sub(C,center))>0}}}
// A rectangle in 3D: centre c, U along its width, V towards its top edge; corners TL, TR, BR, BL (the image's order).
function rect3(c,U,V,w,h){const hw=w/2,hh=h/2;return [add(add(c,mul(U,-hw)),mul(V,hh)),add(add(c,mul(U,hw)),mul(V,hh)),add(add(c,mul(U,hw)),mul(V,-hh)),add(add(c,mul(U,-hw)),mul(V,-hh))]}
// A rounded rectangle in 3D as a polygon (seg points per corner).
function round3(c,U,V,w,h,r,seg=6){const out=[],hw=w/2,hh=h/2,R=Math.min(r,hw,hh),cs=[[hw-R,hh-R,0],[hw-R,-hh+R,-90],[-hw+R,-hh+R,180],[-hw+R,hh-R,90]];
 for(const [x,y,a0] of cs)for(let k=0;k<=seg;k++){const a=(a0+90-90*k/seg)*RAD,px=x+R*Math.cos(a),py=y+R*Math.sin(a);out.push(add(add(c,mul(U,px)),mul(V,py)))}
 return out}
// Lying flat on the table at height z, rotated by deg (counter-clockwise seen from above).
const flat=(x,y,z,deg)=>{const a=deg*RAD;return {c:[x,y,z],U:[Math.cos(a),Math.sin(a),0],V:[-Math.sin(a),Math.cos(a),0],N:[0,0,1]}};
// Upright, facing the viewer (the -y side), on a plane at depth y.
const upright=(x,y,z)=>({c:[x,y,z],U:[1,0,0],V:[0,0,1],N:[0,-1,0]});
function hull(pts){const p=pts.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);if(p.length<3)return p;const cr=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]),lo=[],hi=[];
 for(const q of p){while(lo.length>=2&&cr(lo[lo.length-2],lo[lo.length-1],q)<=0)lo.pop();lo.push(q)}
 for(let i=p.length-1;i>=0;i--){const q=p[i];while(hi.length>=2&&cr(hi[hi.length-2],hi[hi.length-1],q)<=0)hi.pop();hi.push(q)}
 return lo.slice(0,-1).concat(hi.slice(0,-1))}

// ---- the materials of the project ----
// kind → what it is, its real size (mm, or px for screens) and the studio that makes it (a card of agency/crea-core.js).
const KINDS=Object.freeze({
 logo:{title:'Logo del Kit identità',studio:'identita',studioName:'Kit identità'},
 'biglietto-fronte':{title:'Biglietto da visita · fronte',studio:'coordinato',studioName:'Coordinato aziendale',thick:.45},
 'biglietto-retro':{title:'Biglietto da visita · retro',studio:'coordinato',studioName:'Coordinato aziendale',thick:.45},
 carta:{title:'Carta intestata A4',studio:'coordinato',studioName:'Coordinato aziendale',thick:.12},
 busta:{title:'Busta',studio:'coordinato',studioName:'Coordinato aziendale',thick:.35},
 cartellina:{title:'Cartellina · copertina',studio:'coordinato',studioName:'Coordinato aziendale',thick:.6},
 rollup:{title:'Roll-up 85 × 200 cm',studio:'stampa',studioName:'Stampa (roll-up)'},
 totem:{title:'Totem o vela',studio:'stampa',studioName:'Stampa (grande formato)'},
 pannello:{title:'Insegna, pannello o banner',studio:'stampa',studioName:'Stampa (grande formato)'},
 menu:{title:'Menu · prima pagina',studio:'menu',studioName:'Menu e listino',thick:.3},
 post:{title:'Post social',studio:'socialgrafica',studioName:'Grafica profili e template social'},
 storia:{title:'Storia social',studio:'socialgrafica',studioName:'Grafica profili e template social'},
 copertina:{title:'Copertina social',studio:'socialgrafica',studioName:'Grafica profili e template social'},
 profilo:{title:'Immagine del profilo social',studio:'socialgrafica',studioName:'Grafica profili e template social'},
 'sito-desktop':{title:'Sito · computer',studio:'site',studioName:'Sito web'},
 'sito-mobile':{title:'Sito · telefono',studio:'site',studioName:'Sito web'}});
// The groups shown as «missing» when none of their kinds exists.
const GROUPS=Object.freeze([
 {id:'kit',title:'Logo e colori (Kit identità)',kinds:['logo'],studio:'identita',why:'Senza Kit identità RADIX non ha logo e colori: non li inventa.'},
 {id:'biglietto',title:'Biglietto da visita',kinds:['biglietto-fronte'],studio:'coordinato',why:'Non c’è un biglietto salvato: si fa nel Coordinato aziendale (o nello Studio Stampa).'},
 {id:'carta',title:'Carta intestata',kinds:['carta'],studio:'coordinato',why:'Non c’è una carta intestata salvata: si fa nel Coordinato aziendale (o nello Studio Stampa).'},
 {id:'busta',title:'Busta',kinds:['busta'],studio:'coordinato',why:'Il coordinato salvato non ha la busta, o non c’è un coordinato salvato.'},
 {id:'cartellina',title:'Cartellina',kinds:['cartellina'],studio:'coordinato',why:'Il coordinato salvato non ha la cartellina, o non c’è un coordinato salvato.'},
 {id:'grande',title:'Roll-up, totem, insegna o banner',kinds:['rollup','totem','pannello'],studio:'stampa',why:'Non c’è un roll-up o un grande formato salvato nello Studio Stampa.'},
 {id:'menu',title:'Menu',kinds:['menu'],studio:'menu',why:'Non c’è un menu salvato nello studio Menu e listino.'},
 {id:'social',title:'Post, storie e copertine social',kinds:['post','storia','copertina'],studio:'socialgrafica',why:'Non c’è una grafica social salvata nello studio Grafica profili e template social.'},
 {id:'sito',title:'Sito',kinds:['sito-desktop','sito-mobile'],studio:'site',why:'Non c’è un sito salvato nello Studio Sito.'}]);
const PLACEHOLDER=/\[[^\]]{1,80}\]|da completare/i;
// The saved entries of the conversations with a given source, newest first.
function entries(agentsDoc,source){const out=[];for(const list of Object.values((agentsDoc&&agentsDoc.conversations)||{}))for(const e of Array.isArray(list)?list:[])if(e&&e.role==='assistant'&&e.source===source)out.push(e);
 return out.sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')))}
const latest=(doc,key)=>{const s=doc&&doc[key];const items=s&&Array.isArray(s.items)?s.items.filter(x=>x&&typeof x==='object'):[];return items.sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')))[0]||null};
// The html of the last site saved by the Studio Sito ('' when none).
function siteHtml(agentsDoc){for(const e of entries(agentsDoc,'site-studio')){const m=/---DOCUMENTO:\s*([^\n]*?)---\n([\s\S]*?)\n---FINE DOCUMENTO---/.exec(String(e.content||''));if(m&&/<html|<body|<main|<section/i.test(m[2]))return {html:m[2],name:clean(m[1]),at:e.at||''}}return null}
const pagePlaceholders=page=>page.items.filter(it=>it.t==='placeholder'||(it.t==='text'&&PLACEHOLDER.test(it.s))).map(it=>clean(it.text||it.s)).slice(0,6);
// A material from a print document page (print-studio items): its SVG preview, no guides, cropped when asked.
function fromPage(kind,doc,i,{from,crop,title,svgOf}={}){const p=doc.pages[i];if(!p)return null;const P=PS(),c=crop||{x:0,y:0,w:p.w,h:p.h};
 return {id:kind,kind,title:title||KINDS[kind].title,from,studio:KINDS[kind].studio,unit:'mm',w:c.w,h:c.h,page:{w:p.w,h:p.h},crop:c,thick:KINDS[kind].thick||0,
  source:{type:'svg',svg:svgOf?svgOf(doc):P.previewSvg(doc,i,{guides:false}),w:p.w,h:p.h,vector:true},placeholders:pagePlaceholders(p)}}
function svgMaterial(kind,svg,w,h,{from,title,unit='px',placeholders=[]}={}){return {id:kind,kind,title:title||KINDS[kind].title,from,studio:KINDS[kind].studio,unit,w,h,page:{w,h},crop:{x:0,y:0,w,h},thick:0,source:{type:'svg',svg,w,h,vector:true},placeholders}}
// The plate of the shop sign made from the kit: the logo on the kit's light colour (a composition, no new data).
function logoPlate(brand){const P=PS(),vb=P.viewBox(brand.logo)||[0,0,300,100],H=450,lh=H*.5,lw=lh*vb[2]/vb[3],maxW=1500,k=Math.min(1,(maxW-2*H*.32)/lw),w=Math.max(900,Math.round(lw*k+2*H*.36)),bg=brand.palette.light||'#FFFFFF';
 const x=(w-lw*k)/2,y=(H-lh*k)/2;
 return {w,h:H,svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+w+' '+H+'" width="'+w+'" height="'+H+'"><rect width="'+w+'" height="'+H+'" fill="'+bg+'"/><image x="'+x.toFixed(2)+'" y="'+y.toFixed(2)+'" width="'+(lw*k).toFixed(2)+'" height="'+(lh*k).toFixed(2)+'" href="'+esc(P.svgUrl(brand.logo))+'"/></svg>'}}
// Every material the project has, and the groups that are missing.
// profile: the project profile; agentsDoc: the «agents» document (or null). Returns {brand, list, byKind, missing, notes}.
function inventory(profile,agentsDoc,{projectName}={}){const P=PS(),brand=P.brandOf(profile||{},projectName),list=[],notes=[],put=m=>{if(m&&!list.some(x=>x.kind===m.kind))list.push(m)};
 const tryIt=(label,fn)=>{try{fn()}catch(e){notes.push(label+': non letto ('+e.message+')')}};
 if(brand.fromKit&&brand.logo){const pl=logoPlate(brand);put({...svgMaterial('logo',pl.svg,pl.w,pl.h,{from:'Kit identità'+(brand.direction?' «'+brand.direction+'»':''),unit:'mm'}),logo:brand.logo})}
 // coordinato: card front and back, letterhead, envelope, folder cover
 tryIt('Coordinato',()=>{const r=latest(agentsDoc,'coordinato'),C=CO();if(!r||!C)return;const m=C.fromRecord(r,profile||{},{projectName}),from='Coordinato aziendale del '+String(r.at||'').slice(0,10);
  const pieces=new Set(m.pieces);
  if(pieces.has('biglietto')){const d=C.cardDoc(m,m.people[0]||null);put(fromPage('biglietto-fronte',d,0,{from}));put(fromPage('biglietto-retro',d,1,{from}))}
  if(pieces.has('carta'))put(fromPage('carta',C.letterDoc(m),0,{from}));
  if(pieces.has('busta')){const id=m.envelope.formats[0]||'dl',d=C.envelopeDoc(m,id);put(fromPage('busta',d,0,{from,title:'Busta '+id.toUpperCase()}))}
  if(pieces.has('cartellina')){const d=C.folderDoc(m);put(fromPage('cartellina',d,0,{from,crop:{x:220,y:0,w:220,h:310}}))}});
 // Studio Stampa: business card, letterhead and roll-up when the coordinato has none
 tryIt('Studio Stampa',()=>{for(const e of entries(agentsDoc,'print-studio')){const pr=e.print;if(!pr||!pr.format)continue;const from='Studio Stampa del '+String(e.at||'').slice(0,10);
  const doc=()=>P.layout(pr.format,pr.values||{},brand,{variant:pr.variant,margin:pr.margin});
  if(pr.format==='biglietto'&&!list.some(x=>x.kind==='biglietto-fronte')){const d=doc();put(fromPage('biglietto-fronte',d,0,{from}));put(fromPage('biglietto-retro',d,1,{from}))}
  else if(pr.format==='carta'&&!list.some(x=>x.kind==='carta'))put(fromPage('carta',doc(),0,{from}));
  else if(pr.format==='rollup'&&!list.some(x=>x.kind==='rollup')){const d=doc();put(fromPage('rollup',d,0,{from,crop:{x:0,y:0,w:850,h:1900}}))}}});
 // grande formato: upright pieces (totem, vela) and wide ones (banner, panel, poster)
 tryIt('Grande formato',()=>{const L=LF();if(!L)return;for(const e of entries(agentsDoc,'large-format-studio')){const g=e.largeFormat;if(!g||!g.format||!L.format(g.format))continue;
  const s=g.spec||{},d=L.layout(g.format,g.values||{},L.brandFor(profile||{},projectName),{variant:g.variant,bleed:s.bleed,safe:s.safe,distance:s.distance,eyelets:s.eyelets,customW:s.w/10,customH:s.h/10,landscape:s.w>s.h&&L.format(g.format).rotate});
  const p=d.pages[0],tall=p.h>p.w*1.25,kind=tall?'totem':'pannello';if(list.some(x=>x.kind===kind))continue;
  const hid=d.spec&&d.spec.hidden||{},cx=hid.left||0;
  put(fromPage(kind,d,0,{from:'Grande formato del '+String(e.at||'').slice(0,10),title:clean(d.spec&&d.spec.title)||KINDS[kind].title,crop:{x:cx,y:0,w:p.w-cx,h:p.h},svgOf:dd=>L.previewSvg(dd,{guides:false})}))}});
 // menu: the first page of the A4 (or of the first flowing format)
 tryIt('Menu',()=>{const r=latest(agentsDoc,'menu'),M=MN();if(!r||!M)return;const m=M.fromRecord(r,profile||{},{projectName});if(!m.items.length)return;const b=M.build(m);
  const x=b.docs.find(d=>d.id==='a4')||b.docs.find(d=>d.doc.pages[0]&&d.doc.pages[0].w<d.doc.pages[0].h)||b.docs[0];if(!x)return;const pg=x.doc.pages[0];
  put({...fromPage('menu',x.doc,0,{from:'Menu e listino del '+String(r.at||'').slice(0,10),title:'Menu · '+(clean(m.title)||'prima pagina')}),thick:.3,w:pg.w,h:pg.h})});
 // social: a post without placeholders when there is one, the story, the cover, the profile image
 tryIt('Grafica social',()=>{const r=latest(agentsDoc,'socialKit'),S=SO();if(!r||!S)return;const m=S.modelOf(S.inputOf(r),profile||{},{projectName}),all=S.build(m),from='Grafica social del '+String(r.at||'').slice(0,10);
  const posts=all.filter(L=>L.kind==='post'),ph=L=>(L.placeholders||[]).length;
  const pick=list=>list.slice().sort((a,b)=>ph(a)-ph(b))[0];
  const sq=pick(posts.filter(L=>L.spec.format!=='storia')),st=pick(posts.filter(L=>L.spec.format==='storia')),cv=all.find(L=>L.kind==='copertina'&&L.spec.id==='facebook')||all.find(L=>L.kind==='copertina'),av=all.find(L=>L.kind==='profilo');
  const mk=(kind,L)=>L&&put({...svgMaterial(kind,S.toSvg(L),L.spec.w,L.spec.h,{from,title:KINDS[kind].title+' · '+clean(L.spec.title).split(' ').slice(0,4).join(' '),placeholders:(L.placeholders||[]).map(x=>'['+x+']')}),grid:kind==='post'?posts.filter(x=>x.spec.format===L.spec.format).slice(0,6).map(x=>S.toSvg(x)):null});
  mk('post',sq);mk('storia',st);mk('copertina',cv);mk('profilo',av)});
 // the site: the saved page, drawn by the browser at computer and phone width
 tryIt('Sito',()=>{const s=siteHtml(agentsDoc);if(!s)return;const ph=(s.html.match(/\[da completare:[^\]]{0,80}\]/g)||[]).slice(0,6),from='Studio Sito: '+(s.name||'pagina salvata');
  put({id:'sito-desktop',kind:'sito-desktop',title:KINDS['sito-desktop'].title,from,studio:'site',unit:'px',w:1440,h:900,page:{w:1440,h:900},crop:{x:0,y:0,w:1440,h:900},thick:0,source:{type:'html',html:s.html,w:1440,h:900,vector:false,scale:2},placeholders:ph});
  put({id:'sito-mobile',kind:'sito-mobile',title:KINDS['sito-mobile'].title,from,studio:'site',unit:'px',w:390,h:844,page:{w:390,h:844},crop:{x:0,y:0,w:390,h:844},thick:0,source:{type:'html',html:s.html,w:390,h:844,vector:false,scale:3},placeholders:ph})});
 const byKind=Object.fromEntries(list.map(m=>[m.kind,m]));
 const missing=GROUPS.filter(g=>!g.kinds.some(k=>byKind[k])).map(g=>({id:g.id,title:g.title,why:g.why,studio:g.studio,studioName:(KINDS[g.kinds[0]]||{}).studioName}));
 return {brand,list,byKind,missing,notes}}

// ---- the scenes ----
// slots: {id, kinds (first available wins), required}; min: how many slots must be filled; family: to vary the proposals.
const SCENES=Object.freeze([
 {id:'scrivania',title:'Scrivania dall’alto',line:'Carta intestata, busta e biglietti appoggiati sul piano, luce morbida da sinistra.',family:'carta',base:10,min:2,angle:'frontale',surface:'table',
  slots:[{id:'cartellina',kinds:['cartellina']},{id:'carta',kinds:['carta']},{id:'busta',kinds:['busta']},{id:'retro',kinds:['biglietto-retro']},{id:'fronte',kinds:['biglietto-fronte']}]},
 {id:'portatile',title:'Portatile con il sito',line:'Il sito sullo schermo di un portatile, il telefono accanto.',family:'schermi',base:9,min:1,angle:'leggera',surface:'table',
  slots:[{id:'schermo',kinds:['sito-desktop'],required:true},{id:'telefono',kinds:['sito-mobile','post','storia']}]},
 {id:'telefono',title:'Telefono sul tavolo',line:'Il post, la storia, il profilo o il sito su un telefono appoggiato, con il biglietto accanto.',family:'schermi',base:8,min:1,angle:'leggera',surface:'table',
  slots:[{id:'schermo',kinds:['post','storia','copertina','sito-mobile'],required:true},{id:'fronte',kinds:['biglietto-fronte']}]},
 {id:'menu',title:'Menu sul tavolo',line:'La prima pagina del menu sul tavolo, il biglietto accanto.',family:'carta',base:8,min:1,angle:'leggera',surface:'table',
  slots:[{id:'menu',kinds:['menu'],required:true},{id:'fronte',kinds:['biglietto-fronte']}]},
 {id:'biglietti',title:'Pila di biglietti',line:'Una pila di biglietti da visita in prospettiva, con il retro accanto: si vede lo spessore della carta.',family:'carta',base:7,min:1,angle:'marcata',surface:'table',
  slots:[{id:'pila',kinds:['biglietto-fronte'],required:true},{id:'retro',kinds:['biglietto-retro']}]},
 {id:'rollup',title:'Roll-up in sala',line:'Il roll-up (o il totem) in piedi davanti a una parete, con la base e l’ombra sul pavimento.',family:'ambienti',base:7,min:1,angle:'leggera',surface:'room',
  slots:[{id:'rollup',kinds:['rollup','totem'],required:true}]},
 {id:'insegna',title:'Insegna sul muro',line:'L’insegna sopra la vetrina: il pannello del grande formato o una targa con il logo del kit.',family:'ambienti',base:6,min:1,angle:'leggera',surface:'wall',
  slots:[{id:'insegna',kinds:['pannello','logo'],required:true}]}]);
const scene=id=>SCENES.find(s=>s.id===id)||null;
const ANGLES=Object.freeze({frontale:{title:'Frontale'},leggera:{title:'Leggera'},marcata:{title:'Marcata'}});
const SHADOWS=Object.freeze({morbida:{title:'Morbida',k:.6},media:{title:'Media',k:1},forte:{title:'Forte',k:1.5}});
const TONES=Object.freeze(['neutro','light','primary','secondary','accent','dark']);
const TONE_LABEL=Object.freeze({neutro:'Neutro',light:'Chiaro del kit',primary:'Primario',secondary:'Secondario',accent:'Accento',dark:'Scuro'});
// The material in each slot of a scene: {slotId: material} (only what exists and is not switched off).
function fill(sc,inv,off={},pref={}){const out={};for(const s of sc.slots){if(off[s.id])continue;const kinds=pref[s.id]&&s.kinds.includes(pref[s.id])?[pref[s.id]].concat(s.kinds):s.kinds;const k=kinds.find(k=>inv.byKind[k]);if(k)out[s.id]=inv.byKind[k]}return out}
function possible(sc,inv){const f=fill(sc,inv);return sc.slots.every(s=>!s.required||f[s.id])&&Object.keys(f).length>=sc.min}
// The three proposals: the possible scenes, the most complete first, varied across families.
function proposals(inv,n=3){const cand=SCENES.filter(s=>possible(s,inv)).map(s=>{const f=fill(s,inv);let score=s.base+Object.keys(f).length;if(s.id==='insegna'&&!inv.byKind.pannello)score-=2;return {s,score}});
 const out=[],fam=new Set();while(out.length<n&&cand.length){cand.forEach(c=>{c.eff=c.score-(fam.has(c.s.family)?4:0)});cand.sort((a,b)=>b.eff-a.eff);const c=cand.shift();out.push(c.s.id);fam.add(c.s.family)}
 return out}

// ---- the plan of a scene: 2D drawing operations, in px of a W × H picture ----
// opts: {angle, shadow, tone, off:{slot:true}, pref:{slot:kind}}. Every texture op carries the 3D size of its rectangle
// (rect, mm or the material's units) so the checks can prove the proportions are the material's own.
const PHONE={w:71.5,h:146.7,t:7.8,r:10.5,inset:3.4,sr:7.6};
const LAPTOP={w:304,d:212,t:9,lidH:205,lidT:5,bezel:{side:9,top:9,bottom:17},open:16};
function normalize(i={},sc){const s=sc||scene(i.scene)||SCENES[0];return {scene:s.id,angle:ANGLES[i.angle]?i.angle:s.angle,shadow:SHADOWS[i.shadow]?i.shadow:'media',tone:TONES.includes(i.tone)?i.tone:'neutro',
 off:Object.fromEntries(Object.entries(i.off||{}).filter(([k,v])=>v&&s.slots.some(x=>x.id===k&&!x.required))),pref:Object.fromEntries(Object.entries(i.pref||{}).filter(([k,v])=>s.slots.some(x=>x.id===k&&x.kinds.includes(v))))}}
const CAMS=Object.freeze({
 scrivania:{frontale:{pitch:90,yaw:0},leggera:{pitch:62,yaw:-10},marcata:{pitch:42,yaw:-22}},
 biglietti:{frontale:{pitch:88,yaw:0},leggera:{pitch:58,yaw:-14},marcata:{pitch:38,yaw:-24}},
 telefono:{frontale:{pitch:90,yaw:0},leggera:{pitch:60,yaw:-12},marcata:{pitch:40,yaw:-24}},
 menu:{frontale:{pitch:90,yaw:0},leggera:{pitch:58,yaw:-10},marcata:{pitch:38,yaw:-20}},
 portatile:{frontale:{pitch:18,yaw:0},leggera:{pitch:24,yaw:-22},marcata:{pitch:30,yaw:-40}},
 insegna:{frontale:{pitch:-4,yaw:0},leggera:{pitch:-7,yaw:-20},marcata:{pitch:-9,yaw:-38}},
 rollup:{frontale:{pitch:3,yaw:0},leggera:{pitch:5,yaw:-18},marcata:{pitch:7,yaw:-34}}});
function toneColours(tone,brand){const pal=brand.palette,base=tone==='neutro'||!pal[tone]?'#E6E2DB':pal[tone];
 const table=tone==='neutro'?base:mix(base,lum(base)<.12?'#2A2A2A':'#EEEBE6',lum(base)<.12?.18:.38);
 const wall=tone==='neutro'?'#E9E5DE':mix(base,'#F1EEE9',lum(base)<.12?.08:.42),floor=mix(mix(wall,'#B9AB98',.55),'#5E544A',.18);
 return {table,wall,floor,dark:lum(table)<.18}}
// Build the plan. inv: inventory(); W, H: the picture in px.
function plan(input,inv,{W=EXPORT_W,H=EXPORT_H}={}){const sc=scene(input.scene)||SCENES[0],o=normalize(input,sc),f=fill(sc,inv,o.off,o.pref),cam0=(CAMS[sc.id]||{})[o.angle]||{pitch:60,yaw:0};
 const sh=SHADOWS[o.shadow].k,col=toneColours(o.tone,inv.brand),ops=[],focus=[],items=[];
 // 1. the 3D objects of the scene, then the camera, then the 2D ops
 const objs=[];const sheet=(slot,mat,pose,extra={})=>{if(!mat)return;const w=mat.unit==='mm'?mat.w:extra.w,h=mat.unit==='mm'?mat.h:extra.h;objs.push({type:'sheet',slot,mat,pose,w,h,t:extra.t!=null?extra.t:(mat.thick||.2),lift:extra.lift||0})};
 let target=[0,0,0],extent=420;
 if(sc.id==='scrivania'){const n=Object.keys(f).length;
  const fo=!!f.cartellina,ca=!!f.carta;
  sheet('cartellina',f.cartellina,flat(-200,28,0,4));
  sheet('carta',f.carta,flat(fo?-15:-80,fo?-6:10,fo?.6:0,-4));
  sheet('busta',f.busta,flat(ca?218:40,ca?118:60,0,5));
  sheet('retro',f.retro,flat(ca?250:60,ca?-26:-20,0,15));
  sheet('fronte',f.fronte,flat(ca?162:-30,ca?-112:-60,0,-10));
  target=[f.carta?0:10,0,0];extent=n>3?560:460}
 else if(sc.id==='biglietti'&&f.pila){const jit=[[0,0,0],[.9,-.6,1.1],[-.7,.8,-.9],[1.2,.4,1.8],[-.4,-.9,-1.2],[.5,.7,.6]];
  jit.forEach(([dx,dy,da],i)=>sheet('pila',f.pila,flat(dx-10,dy,i*.46,-8+da),{t:.45}));
  sheet('retro',f.retro,flat(70,72,0,17),{t:.45});
  sheet('fronte2',f.pila,flat(-58,-74,0,-21),{t:.45});target=[0,0,0];extent=230}
 else if(sc.id==='menu'&&f.menu){sheet('menu',f.menu,flat(-30,0,0,-5));sheet('fronte',f.fronte,flat(120,-95,.3,11));target=[20,0,0];extent=400}
 else if(sc.id==='telefono'&&f.schermo){objs.push({type:'phone',slot:'schermo',mat:f.schermo,pose:flat(-25,0,0,-9)});sheet('fronte',f.fronte,flat(75,-52,0,14));target=[20,0,0];extent=230}
 else if(sc.id==='portatile'&&f.schermo){objs.push({type:'laptop',slot:'schermo',mat:f.schermo,pose:flat(0,0,0,0)});if(f.telefono)objs.push({type:'phone',slot:'telefono',mat:f.telefono,pose:flat(232,-70,0,-16)});target=[f.telefono?50:0,40,90];extent=f.telefono?620:480}
 else if(sc.id==='insegna'&&f.insegna){const m=f.insegna,real=m.unit==='mm'?m:{w:1200,h:400},k=Math.min(1,3200/real.w),w=real.w*k,h=real.h*k;
  objs.push({type:'sign',slot:'insegna',mat:m,w,h,t:20,stand:30,z:2700+h/2});target=[0,0,2700+h/2-h*.45];extent=Math.max(w,h*2.2)*1.15}
 else if(sc.id==='rollup'&&f.rollup){const m=f.rollup,k=1900/Math.max(1,m.h),w=m.w*k;objs.push({type:'rollup',slot:'rollup',mat:m,w,h:1900,y:-450});target=[0,-450,1000];extent=2300}
 const cam=camera({target,pitch:cam0.pitch,yaw:cam0.yaw,dist:extent*3.2,fov:26,W,H});
 const P=p=>cam.project(p),poly=pts=>pts.map(P);
 // shadows in mm at the object, turned into px with the local scale; light from the top left
 const pxmm=(c,U)=>{const a=P(c),b=P(add(c,U));return Math.hypot(b[0]-a[0],b[1]-a[1])};
 const shadow=(footprint,c,U,e,{alpha=1,spread=1}={})=>{const k=pxmm(c,U);
  ops.push({op:'shadow',poly:footprint,blur:k*(5+e*1.4)*spread,dx:k*(1.6+e*.55)*.42,dy:k*(1.6+e*.55),alpha:.2*sh*alpha});
  ops.push({op:'shadow',poly:footprint,blur:k*(.9+e*.2),dx:k*.25,dy:k*(.35+e*.1),alpha:.32*sh*alpha})};
 const tex=(slot,mat,corners3,{clip=null,rect,screen=null}={})=>{const q=poly(corners3),need={w:Math.max(dist(q[0],q[1]),dist(q[3],q[2])),h:Math.max(dist(q[0],q[3]),dist(q[1],q[2]))};
  ops.push({op:'texture',slot,mat:mat.id,quad:q,clip,crop:mat.crop,rect,need,screen});items.push({slot,mat:mat.id,need,rect,screen})};
 const sides=(bot,top,c,fillCol,dark)=>{for(let i=0;i<4;i++){const j=(i+1)%4,mid=mul(add(add(bot[i],bot[j]),add(top[i],top[j])),.25),n=sub(mid,c);if(cam.faces(mid,[n[0],n[1],0])||cam.faces(mid,n))ops.push({op:'poly',poly:poly([bot[i],bot[j],top[j],top[i]]),fill:dark&&i%2?dark:fillCol})}};
 // background
 if(sc.surface==='table')ops.push({op:'surface',kind:'table',colour:col.table});
 else if(sc.surface==='wall')ops.push({op:'surface',kind:'wall',colour:col.wall});
 else{const L=poly([[-9000,0,0],[9000,0,0]]),hz=P([0,-450,0]);ops.push({op:'surface',kind:'room',colour:col.wall,floor:col.floor,line:L,ground:hz})}
 for(const ob of objs){
  if(ob.type==='sheet'){const {c,U,V}=ob.pose,top=add(c,[0,0,ob.t]),corners=rect3(top,U,V,ob.w,ob.h),bot=rect3(c,U,V,ob.w,ob.h);
   shadow(poly(bot),c,U,ob.t+(ob.lift||0),{alpha:ob.t>.3?1:.85});if(ob.t>=.3)sides(bot,corners,c,'#F2EFE9','#DCD8D0');
   tex(ob.slot,ob.mat,corners,{rect:{w:ob.w,h:ob.h}});ops.push({op:'edge',poly:poly(corners)});focus.push(...poly(bot),...poly(corners))}
  else if(ob.type==='phone'){const {c,U,V}=ob.pose,top=add(c,[0,0,PHONE.t]),b=round3(c,U,V,PHONE.w,PHONE.h,PHONE.r,6),t=round3(top,U,V,PHONE.w,PHONE.h,PHONE.r,6);
   shadow(poly(b),c,U,PHONE.t,{spread:1.1});ops.push({op:'poly',poly:hull(poly(b.concat(t))),fill:'#8E8E93',grad:['#C7C7CC','#5A5A5E']});ops.push({op:'poly',poly:poly(t),fill:'#151517',stroke:'rgba(255,255,255,.22)'});
   const sw=PHONE.w-2*PHONE.inset,shh=PHONE.h-2*PHONE.inset,sc3=add(top,[0,0,.05]),scr=rect3(sc3,U,V,sw,shh),clip=poly(round3(sc3,U,V,sw,shh,PHONE.sr,6));
   tex(ob.slot,ob.mat,scr,{clip,rect:{w:sw,h:shh},screen:{kind:ob.mat.kind,w:sw,h:shh}});
   const isl=round3(add(sc3,add(mul(V,shh/2-5.2),[0,0,.02])),U,V,21,6.2,3.1,4);ops.push({op:'poly',poly:poly(isl),fill:'#000000'});
   ops.push({op:'gloss',poly:clip});focus.push(...poly(b),...poly(t))}
  else if(ob.type==='laptop'){const {c,U,V}=ob.pose,L=LAPTOP,top=add(c,[0,0,L.t]),bot=rect3(c,U,V,L.w,L.d),tp=rect3(top,U,V,L.w,L.d);
   shadow(poly(bot),c,U,L.t,{spread:1.3});sides(bot,tp,c,'#A6A8AC','#8C8E92');ops.push({op:'poly',poly:poly(tp),fill:'#D3D5D8',grad:['#E4E6E9','#BFC1C5']});
   // keyboard well, keys, trackpad
   const kc=add(top,add(mul(V,L.d/2-70),[0,0,.05]));ops.push({op:'poly',poly:poly(rect3(kc,U,V,276,104)),fill:'#B4B6BA'});
   const gap=2.1,kw=(276-10-13*gap)/14,kh=15.4;for(let r=0;r<6;r++){const hh=r===0?8:kh,yy=104/2-4-(r===0?hh/2:8+gap+(r-1)*(kh+gap)+kh/2);for(let i=0;i<14;i++){const xx=-276/2+5+i*(kw+gap)+kw/2;ops.push({op:'poly',poly:poly(rect3(add(kc,add(mul(U,xx),add(mul(V,yy),[0,0,.05]))),U,V,kw,hh)),fill:'#26272A'})}}
   ops.push({op:'poly',poly:poly(rect3(add(top,add(mul(V,-L.d/2+50),[0,0,.05])),U,V,124,78)),fill:'#C9CBCF',stroke:'#B3B5B9'});
   // the lid, hinged at the back edge, tilted back
   const a=L.open*RAD,LV=norm(add(mul(V,Math.sin(a)),[0,0,Math.cos(a)])),LN=norm(cross(LV,U)),hinge=add(top,mul(V,L.d/2-2)),lc=add(hinge,mul(LV,L.lidH/2));
   const front=rect3(add(lc,mul(LN,L.lidT/2)),U,LV,L.w,L.lidH),back=rect3(add(lc,mul(LN,-L.lidT/2)),U,LV,L.w,L.lidH);
   ops.push({op:'poly',poly:hull(poly(round3(add(lc,mul(LN,L.lidT/2)),U,LV,L.w,L.lidH,9,5).concat(round3(add(lc,mul(LN,-L.lidT/2)),U,LV,L.w,L.lidH,9,5)))),fill:'#9C9EA2',grad:['#B9BBBF','#86888C']});ops.push({op:'poly',poly:poly(round3(add(lc,mul(LN,L.lidT/2+.05)),U,LV,L.w-1,L.lidH-1,9,5)),fill:'#0D0D0F'});
   const dw=L.w-2*L.bezel.side,dh=L.lidH-L.bezel.top-L.bezel.bottom,dc=add(add(lc,mul(LN,L.lidT/2+.1)),mul(LV,(L.bezel.bottom-L.bezel.top)/2)),disp=rect3(dc,U,LV,dw,dh);
   tex(ob.slot,ob.mat,disp,{rect:{w:dw,h:dh},screen:{kind:ob.mat.kind,w:dw,h:dh}});ops.push({op:'gloss',poly:poly(disp),soft:true});
   focus.push(...poly(bot),...poly(front))}
  else if(ob.type==='sign'){const z=ob.z,face=upright(0,-(ob.stand+ob.t),z),backP=upright(0,-ob.stand,z),fr=rect3(face.c,face.U,face.V,ob.w,ob.h),bk=rect3(backP.c,backP.U,backP.V,ob.w,ob.h);
   // the shop window under the sign: dark glass in a thin frame (architecture only, no data)
   const gw=Math.max(ob.w*1.02,1800),gh=2400,gz=z-ob.h/2-260-gh/2,frame=rect3([0,-6,gz],[1,0,0],[0,0,1],gw+90,gh+90),glass=rect3([0,-7,gz],[1,0,0],[0,0,1],gw,gh);
   ops.push({op:'poly',poly:poly(frame),fill:'#3A3734'});ops.push({op:'glass',poly:poly(glass)});
   const bar=(x,zc,w,h)=>ops.push({op:'poly',poly:poly(rect3([x,-8,zc],[1,0,0],[0,0,1],w,h)),fill:'#3A3734'});
   bar(-gw/6,gz,55,gh);bar(gw/6,gz,55,gh);bar(0,gz+gh/2-420,gw,45);
   const k=pxmm(face.c,face.U),wallSh=poly(rect3([ob.stand*.9,-1,z-ob.stand*1.2],[1,0,0],[0,0,1],ob.w,ob.h));
   ops.push({op:'shadow',poly:wallSh,blur:k*48*sh,dx:0,dy:0,alpha:.30*sh});ops.push({op:'shadow',poly:wallSh,blur:k*10,dx:0,dy:0,alpha:.22*sh});
   sides(bk,fr,mul(add(face.c,backP.c),.5),'#D9D6D0','#B9B6B0');tex(ob.slot,ob.mat,fr,{rect:{w:ob.w,h:ob.h}});ops.push({op:'edge',poly:poly(fr)});
   focus.push(...poly(fr),...poly(rect3([0,-50,z-ob.h*.9],[1,0,0],[0,0,1],ob.w,ob.h)))}
  else if(ob.type==='rollup'){const y=ob.y,bw=ob.w+14,bd=230,bh=70,base=[0,y,0],bt=rect3(add(base,[0,0,bh]),[1,0,0],[0,1,0],bw,bd),bb=rect3(base,[1,0,0],[0,1,0],bw,bd);
   const face=upright(0,y-8,bh+ob.h/2),fr=rect3(face.c,face.U,face.V,ob.w,ob.h);
   // shadows: on the wall behind (soft, offset) and the base on the floor
   const k=pxmm(face.c,face.U),ws=poly(rect3([140,-1,bh+ob.h/2-60],[1,0,0],[0,0,1],ob.w,ob.h));ops.push({op:'shadow',poly:ws,blur:k*140*sh,dx:0,dy:0,alpha:.16*sh});
   ops.push({op:'shadow',poly:poly(rect3([60,y+170,0],[1,0,0],[0,1,0],ob.w*1.05,420)),blur:k*90*sh,dx:0,dy:0,alpha:.22*sh});
   shadow(poly(bb),base,[1,0,0],10,{spread:4});
   tex(ob.slot,ob.mat,fr,{rect:{w:ob.w,h:ob.h}});ops.push({op:'edge',poly:poly(fr)});
   const bar=rect3(add(face.c,[0,-6,ob.h/2+9]),[1,0,0],[0,0,1],ob.w+10,18);ops.push({op:'poly',poly:poly(bar),fill:'#BFC1C4',grad:['#E2E3E5','#9A9C9F']});
   sides(bb,bt,base,'#A9ABAE','#8E9093');ops.push({op:'poly',poly:poly(bt),fill:'#C8CACD',grad:['#DADBDD','#B3B5B8']});
   const slot=rect3(add(base,[0,-8,bh+.5]),[1,0,0],[0,1,0],ob.w+4,8);ops.push({op:'poly',poly:poly(slot),fill:'#5D5F62'});
   focus.push(...poly(fr),...poly(bb),...poly(bt))}}
 // 2. fit the objects in the frame (uniform scale + move: the perspective is kept)
 const fx=focus.map(p=>p[0]),fy=focus.map(p=>p[1]),x0=Math.min(...fx),x1=Math.max(...fx),y0=Math.min(...fy),y1=Math.max(...fy);
 const fitW=sc.surface==='table'?.8:.62,fitH=sc.surface==='table'?.8:.84,s=focus.length?Math.min(W*fitW/(x1-x0),H*fitH/(y1-y0)):1,cx=(x0+x1)/2,cy=(y0+y1)/2;
 const T=p=>[W/2+(p[0]-cx)*s,H/2+(p[1]-cy)*s+(sc.surface==='wall'?-H*.04:0)];
 for(const op of ops){for(const k of ['poly','quad','clip','line'])if(op[k])op[k]=op[k].map(T);if(op.ground)op.ground=T(op.ground);for(const k of ['blur','dx','dy'])if(op[k]!=null)op[k]*=s;if(op.need)op.need={w:op.need.w*s,h:op.need.h*s}}
 for(const it of items)it.need={w:it.need.w*s,h:it.need.h*s};
 return {scene:sc.id,title:sc.title,input:o,W,H,colours:col,ops,items,filled:Object.fromEntries(Object.entries(f).map(([k,m])=>[k,m.id])),camera:{pitch:cam0.pitch,yaw:cam0.yaw}}}
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);

// ---- checks ----
// sources: {materialId: {w, h, vector}} the px the browser drew (or can draw) for each material.
function checksOf(pl,inv,{sources={}}={}){const out=[],add=(id,label,state,detail,issues=[])=>out.push({id,label,state,detail,issues:issues.slice(0,8)});const sc=scene(pl.scene),o=pl.input;
 const used=Object.entries(pl.filled).map(([slot,id])=>inv.byKind[id]).filter(Boolean),req=sc.slots.filter(s=>s.required&&!pl.filled[s.id]);
 const empty=sc.slots.filter(s=>!pl.filled[s.id]&&!o.off[s.id]);
 const lack=empty.map(s=>{const k=s.kinds[0],K=KINDS[k];return K.title+' manca: '+(GROUPS.find(g=>g.kinds.includes(k))||{why:'si fa nello studio '+K.studioName}).why})
 add('materiali','Materiali della scena',req.length||!used.length?'fail':empty.length?'warn':'ok',req.length||!used.length?'Per questa scena manca '+req.map(s=>KINDS[s.kinds[0]].title.toLowerCase()).join(', ')+': RADIX non lo disegna al suo posto.':empty.length?'La scena usa '+used.length+' materiali; quelli che mancano restano fuori.':'Tutti i materiali della scena ci sono: '+used.map(m=>m.title.toLowerCase()).join(', ')+'.',
  used.map(m=>m.title+' · da '+m.from).concat(lack));
 // proportions: every texture is a 3D rectangle with the material's own aspect (screens: the screen, filled without stretching)
 const bad=pl.items.filter(it=>{const m=inv.byKind[it.mat];if(!m||it.screen)return false;const a=m.crop.w/m.crop.h,b=it.rect.w/it.rect.h;return Math.abs(a/b-1)>.005});
 add('proporzioni','Proporzioni e testi',bad.length?'fail':'ok',bad.length?'Un materiale sarebbe deformato: '+bad.map(b=>b.slot).join(', ')+'.':'Ogni materiale è un rettangolo con la sua misura vera visto in prospettiva: niente testo stirato o schiacciato. Sugli schermi la pagina si adatta in larghezza.');
 // resolution at the export size
 const res=[];let worst=Infinity;for(const it of pl.items){const m=inv.byKind[it.mat];if(!m)continue;const k=EXPORT_W/pl.W,need={w:Math.ceil(it.need.w*k),h:Math.ceil(it.need.h*k)},src=sources[m.id]||{vector:m.source.vector,w:m.source.vector?Infinity:m.source.w*(m.source.scale||1),h:m.source.vector?Infinity:m.source.h*(m.source.scale||1)};
  const ratio=Math.min(src.w/(need.w*(it.screen?1:m.crop.w/m.crop.w)),src.h/need.h);worst=Math.min(worst,src.vector?Infinity:ratio);
  res.push(m.title+': servono '+need.w+' × '+need.h+' px, '+(src.vector?'vettoriale (si disegna alla misura giusta)':'sorgente '+Math.round(src.w)+' × '+Math.round(src.h)+' px'))}
 add('risoluzione','Risoluzione per l’export',worst<.75?'fail':worst<1?'warn':'ok',worst<.75?'Una sorgente è troppo piccola per '+EXPORT_W+' px: si vedrebbe sgranata.':worst<1?'Una sorgente è appena sotto la misura: a '+EXPORT_W+' px si ammorbidisce un poco.':'Tutte le sorgenti bastano per il PNG largo '+EXPORT_W+' px.',res);
 const ph=used.filter(m=>m.placeholders&&m.placeholders.length);
 add('segnaposto','Testi da completare',ph.length?'warn':'ok',ph.length?'Alcuni materiali hanno ancora testi da completare: il mockup li mostra così. Completali nel loro studio prima di farlo vedere.':'Nessun segnaposto nei materiali usati.',ph.map(m=>m.title+': '+m.placeholders.slice(0,3).join(', ')));
 add('dati','Niente di inventato','ok','Loghi, testi e dati vengono solo dai materiali salvati nel progetto. Il resto della scena (piano, parete, telefono, portatile, vetrina) è disegnato in codice, senza marchi.'+(pl.filled.insegna==='logo'?' La targa dell’insegna è il logo del kit sul suo colore chiaro.':''));
 return out}
const blocking=c=>c.filter(x=>x.state==='fail');

// ---- contact sheet (PDF through lib/print-studio.js, web mode) ----
// shots: [{title, caption, w, h}] → print-studio doc; image items get their raster in the browser (JPEG).
function contactSheet(shots,brand,{date}={}){const d=(date||new Date()).toISOString().slice(0,10),W=297,H=210,M=14,pages=[],P=PS(),name=clean(brand&&brand.name)||'Brand';
 for(let i=0;i<shots.length;i+=4){const chunk=shots.slice(i,i+4),items=[];
  items.push({t:'rect',x:0,y:0,w:W,h:H,fill:'#FFFFFF'});
  items.push({t:'text',x:M,y:M+5,s:'Mockup · '+name,size:15,bold:true,fill:'#1C1C1E',label:'Titolo'});
  items.push({t:'text',x:M,y:M+11,s:'Preparati con RADIX il '+d+' dai materiali del progetto, disegnati in codice (nessuna AI). Pagina '+(i/4+1)+' di '+Math.ceil(shots.length/4)+'.',size:8,fill:'#5F5B66',label:'Sottotitolo'});
  const one=chunk.length===1,cw=one?222:110,ch=cw*2/3,gx=12,gy=14,cols=one?1:2,x0=(W-(cols*cw+(cols-1)*gx))/2,y0=one?34:32;
  chunk.forEach((s,j)=>{const x=x0+(j%cols)*(cw+gx),y=y0+Math.floor(j/cols)*(ch+gy),k=Math.min(cw/s.w,ch/s.h),iw=s.w*k,ih=s.h*k;
   items.push({t:'image',x:x+(cw-iw)/2,y,w:iw,h:ih,photo:false,label:'Mockup',shot:i+j});
   items.push({t:'text',x,y:y+ih+4.6,s:clean(s.title).slice(0,80),size:8.5,bold:true,fill:'#1C1C1E',label:'Scena'});
   if(s.caption)items.push({t:'text',x,y:y+ih+8.6,s:clean(s.caption).slice(0,110),size:7,fill:'#5F5B66',label:'Materiali'})});
  pages.push({label:'Mockup '+(i/4+1),w:W,h:H,items,folds:[],hidden:null})}
 return {format:'mockup-provini',variant:'classic',title:'Mockup · '+name,margin:M,brand:brand||P.brandOf({}),values:{name},dpi:150,pages,warnings:[]}}

// ---- the files ----
const baseName=(inv,sceneId)=>'mockup-'+(slug(inv.brand.name)||'brand')+'-'+sceneId;
function caption(pl,inv){return Object.values(pl.filled).map(id=>inv.byKind[id]).filter(Boolean).map(m=>m.title).join(' · ')}
function readme(inv,shots,checks,{date}={}){const d=(date||new Date()).toISOString().slice(0,10),L=['MOCKUP · '+(inv.brand.name||'Brand'),'Preparati con RADIX il '+d+': i materiali del progetto messi in scena in prospettiva, disegnati in codice. Nessuna chiamata AI, nessun credito.',''];
 L.push('FILE',...shots.map(s=>'- '+s.name+' · '+s.title+' · '+EXPORT_W+' × '+EXPORT_H+' px · '+s.caption),'- mockup-provini.pdf · i mockup su fogli A4 orizzontali, da mandare o stampare','');
 L.push('COME USARLI','- Per presentare i materiali al cliente prima di stamparli o pubblicarli.','- Nei post e nel sito come «anteprima»: non sono foto, sono disegni dei file veri. Il disegno dei materiali è identico ai file per la stampa.','- Confrontali col materiale stampato quando arriva: colori della carta e luce reale cambiano un poco.','');
 L.push('CONTROLLI',...checks.map(c=>'- '+c.label+': '+({ok:'OK',warn:'da guardare',fail:'da sistemare'})[c.state]+'. '+c.detail),'');
 if(inv.missing.length)L.push('MATERIALI CHE NON CI SONO ANCORA (RADIX non li inventa)',...inv.missing.map(m=>'- '+m.title+': '+m.why),'');
 return L.join('\n')+'\n'}
const bundle=(list,{date}={})=>ZIP().zip(list.map(f=>({name:f.name,data:f.data})),{date:date||new Date()});

// ---- saved in the project: the «agents» document, key mockups ----
const emptyStore=()=>({schemaVersion:1,items:[]});
function readStore(doc){const s=doc&&doc.mockups;return s&&typeof s==='object'&&Array.isArray(s.items)?{schemaVersion:1,items:s.items.filter(x=>x&&typeof x==='object')}:emptyStore()}
function savedRecord(pl,inv,{by,at,checks}={}){const when=at||new Date().toISOString(),o=pl.input;
 return {id:'mockup-'+when.replace(/\D/g,'').slice(0,14),at:when,by:clean(by).slice(0,80),scene:pl.scene,angle:o.angle,shadow:o.shadow,tone:o.tone,off:{...o.off},pref:{...o.pref},
  materials:Object.fromEntries(Object.entries(pl.filled).map(([k,id])=>[k,{kind:id,from:clean((inv.byKind[id]||{}).from)}])),kit:{brand:clean(inv.brand.name)},checks:(checks||checksOf(pl,inv)).map(c=>({id:c.id,state:c.state}))}}
function addRecord(store,rec){const s=readStore({mockups:store});return {schemaVersion:1,items:s.items.filter(x=>x.id!==rec.id).concat([rec]).slice(-MAX_SAVED)}}
async function saveToProject(ws,projectId,rec){if(!ws||typeof ws.bind!=='function')throw Error('Archivio del progetto non disponibile.');const d=ws.bind(projectId,'agents');
 for(let i=0;i<3;i++){const cur=(await d.load())||{},next=addRecord(readStore(cur),rec);
  try{await d.save({...cur,schemaVersion:1,conversations:cur.conversations||{},mockups:next});return next}catch(e){if(!(ws.ConflictError&&e instanceof ws.ConflictError)||i===2)throw e}}}
const inputOf=r=>({scene:r.scene,angle:r.angle,shadow:r.shadow,tone:r.tone,off:r.off||{},pref:r.pref||{}});

// ---- drawing (browser) ----
const doc=()=>root.document;
const canvas=(w,h)=>{const c=doc().createElement('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));return c};
const loadImg=url=>new Promise((ok,ko)=>{const i=new root.Image();i.onload=()=>ok(i);i.onerror=()=>ko(Error('immagine non caricata'));i.src=url});
const svgUrl=svg=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
// The site page as an image: its own HTML and styles in an SVG foreignObject, no scripts, no external files.
function siteSvg(html,w,h,scale=2){const D=new root.DOMParser().parseFromString(String(html||''),'text/html');D.querySelectorAll('script,link,iframe,object,embed,noscript').forEach(n=>n.remove());
 D.querySelectorAll('img').forEach(n=>{if(!/^data:/.test(n.getAttribute('src')||''))n.removeAttribute('src')});
 D.querySelectorAll('*').forEach(n=>[...n.attributes].forEach(a=>{if(/^on/i.test(a.name))n.removeAttribute(a.name)}));
 const css=[...D.querySelectorAll('style')].map(s=>s.textContent).join('\n').replace(/@import[^;]+;/g,'');D.querySelectorAll('style').forEach(s=>s.remove());
 const X=new root.XMLSerializer(),body=X.serializeToString(D.body).replace(/^<body/,'<div class="rx-site-body"').replace(/<\/body>$/,'</div>');
 const style='<style>'+css.replace(/\bhtml\b/g,'.rx-site').replace(/\bbody\b/g,'.rx-site-body').replace(/</g,'\\3c ')+'.rx-site{width:'+w+'px;height:'+h+'px;overflow:hidden;background:#fff}</style>';
 return '<svg xmlns="http://www.w3.org/2000/svg" width="'+w*scale+'" height="'+h*scale+'" viewBox="0 0 '+w+' '+h+'"><foreignObject x="0" y="0" width="'+w+'" height="'+h+'"><div xmlns="http://www.w3.org/1999/xhtml" class="rx-site">'+style+body+'</div></foreignObject></svg>'}
// A source canvas for a material at (at least) need px, cropped; cached.
async function sourceOf(mat,need,cache){const k=Math.max(need.w/mat.crop.w,need.h/mat.crop.h)*1.15,key=mat.id+'@'+(mat.source.vector?Math.ceil(k*mat.crop.w/64):'r');if(cache&&cache.has(key))return cache.get(key);
 let c;if(mat.source.type==='html'){const s=mat.source,img=await loadImg(svgUrl(siteSvg(s.html,s.w,s.h,s.scale||2)));c=canvas(s.w*(s.scale||2),s.h*(s.scale||2));const x=c.getContext('2d');x.fillStyle='#FFFFFF';x.fillRect(0,0,c.width,c.height);x.drawImage(img,0,0,c.width,c.height);c._px={w:c.width,h:c.height,vector:false}}
 else{const kk=Math.min(k,4096/Math.max(mat.crop.w,mat.crop.h)),img=await loadImg(svgUrl(mat.source.svg)),pw=mat.page.w*kk,ph=mat.page.h*kk;c=canvas(mat.crop.w*kk,mat.crop.h*kk);const x=c.getContext('2d');
  if(mat.unit==='mm'){x.fillStyle=PAPER;x.fillRect(0,0,c.width,c.height)}// the paper under the print: white stock where the layout prints nothing
  x.drawImage(img,-mat.crop.x*kk,-mat.crop.y*kk,pw,ph);c._px={w:c.width,h:c.height,vector:true}}
 if(cache)cache.set(key,c);return c}
let grainTile=null;
function grain(){if(grainTile)return grainTile;const c=canvas(256,256),x=c.getContext('2d'),d=x.createImageData(256,256);let s=12345;const rnd=()=>{s=(s*1103515245+12345)&0x7fffffff;return s/0x7fffffff};
 for(let i=0;i<d.data.length;i+=4){const v=118+rnd()*20;d.data[i]=d.data[i+1]=d.data[i+2]=v;d.data[i+3]=255}x.putImageData(d,0,0);grainTile=c;return c}
const path=(ctx,poly)=>{ctx.beginPath();poly.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath()};
// Map src (a canvas, sw × sh) onto quad with a triangle mesh; clip: optional polygon.
// Each triangle is clipped a little larger than itself (1.6 px from the centroid) so neighbours overlap and no seam shows;
// the whole quad (or the screen) is the outer clip, so nothing spills over the edge of the material.
function warp(ctx,src,quad,{clip,n=12}={}){const sw=src.width,sh=src.height,H=homography([[0,0],[sw,0],[sw,sh],[0,sh]],quad);if(!H)return;
 ctx.save();path(ctx,clip||quad);ctx.clip();
 for(const t of mesh(sw,sh,H,n)){const A=affine(t.s,t.d);if(!A)continue;const c=[(t.d[0][0]+t.d[1][0]+t.d[2][0])/3,(t.d[0][1]+t.d[1][1]+t.d[2][1])/3],grow=p=>{const dx=p[0]-c[0],dy=p[1]-c[1],l=Math.hypot(dx,dy)||1;return [p[0]+dx/l*1.6,p[1]+dy/l*1.6]};
  ctx.save();path(ctx,t.d.map(grow));ctx.clip();ctx.setTransform(...A);ctx.drawImage(src,0,0);ctx.restore()}
 ctx.restore()}
function shadowOp(ctx,op){const off=1e5;ctx.save();ctx.shadowColor='rgba(18,14,10,'+op.alpha+')';ctx.shadowBlur=Math.max(0,op.blur);ctx.shadowOffsetX=op.dx+off;ctx.shadowOffsetY=op.dy;
 path(ctx,op.poly.map(p=>[p[0]-off,p[1]]));ctx.fillStyle='#000';ctx.fill();ctx.restore()}
function surfaceOp(ctx,op,W,H){ctx.fillStyle=op.colour;ctx.fillRect(0,0,W,H);
 if(op.kind==='room'){const [a,b]=op.line;const ext=(p,q,x)=>p[1]+(q[1]-p[1])*(x-p[0])/(q[0]-p[0]||1),yl=ext(a,b,0),yr=ext(a,b,W);
  const fl=ctx.createLinearGradient(0,Math.min(yl,yr),0,H);fl.addColorStop(0,mix(op.floor,'#FFFFFF',.08));fl.addColorStop(1,mix(op.floor,'#000000',.22));ctx.fillStyle=fl;ctx.beginPath();ctx.moveTo(0,yl);ctx.lineTo(W,yr);ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.closePath();ctx.fill();
  // skirting board along the wall
  const sk=Math.max(4,H*.016);ctx.fillStyle=mix(op.colour,'#FFFFFF',.55);ctx.beginPath();ctx.moveTo(0,yl);ctx.lineTo(W,yr);ctx.lineTo(W,yr-sk);ctx.lineTo(0,yl-sk);ctx.closePath();ctx.fill();
  ctx.strokeStyle='rgba(0,0,0,.10)';ctx.lineWidth=Math.max(1,H/900);ctx.beginPath();ctx.moveTo(0,yl);ctx.lineTo(W,yr);ctx.stroke();
  // floor boards, faint
  ctx.save();ctx.beginPath();ctx.moveTo(0,yl);ctx.lineTo(W,yr);ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.closePath();ctx.clip();ctx.strokeStyle='rgba(60,45,30,.06)';ctx.lineWidth=Math.max(1,H/1000);
  for(let i=1;i<14;i++){const y=Math.min(yl,yr)+(H-Math.min(yl,yr))*Math.pow(i/14,1.6);ctx.beginPath();ctx.moveTo(0,y+(yl-Math.min(yl,yr))*(1-i/14));ctx.lineTo(W,y+(yr-Math.min(yl,yr))*(1-i/14));ctx.stroke()}ctx.restore()}
 if(op.kind==='wall'||op.kind==='room'){ctx.save();ctx.globalAlpha=.06;ctx.globalCompositeOperation='multiply';ctx.fillStyle=ctx.createPattern(grain(),'repeat');ctx.fillRect(0,0,W,H);ctx.restore()}
 if(op.kind==='wall'){const g=ctx.createRadialGradient(W*.5,-H*.25,H*.1,W*.5,-H*.25,H*1.5);g.addColorStop(0,'rgba(255,250,240,.22)');g.addColorStop(1,'rgba(0,0,0,.10)');ctx.fillStyle=g;ctx.fillRect(0,0,W,H)}}
function polyOp(ctx,op){path(ctx,op.poly);if(op.grad){const xs=op.poly.map(p=>p[0]),ys=op.poly.map(p=>p[1]),g=ctx.createLinearGradient(Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys));g.addColorStop(0,op.grad[0]);g.addColorStop(1,op.grad[1]);ctx.fillStyle=g}else ctx.fillStyle=op.fill;ctx.fill();
 if(op.stroke){ctx.strokeStyle=op.stroke;ctx.lineWidth=1;ctx.stroke()}}
function glassOp(ctx,op){const xs=op.poly.map(p=>p[0]),ys=op.poly.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
 path(ctx,op.poly);const g=ctx.createLinearGradient(0,y0,0,y1);g.addColorStop(0,'#2B3036');g.addColorStop(1,'#14171A');ctx.fillStyle=g;ctx.fill();
 ctx.save();path(ctx,op.poly);ctx.clip();const r=ctx.createLinearGradient(x0,y0,x1,y1);r.addColorStop(0,'rgba(255,255,255,0)');r.addColorStop(.42,'rgba(255,255,255,0)');r.addColorStop(.5,'rgba(255,255,255,.10)');r.addColorStop(.62,'rgba(255,255,255,0)');ctx.fillStyle=r;ctx.fillRect(x0,y0,x1-x0,y1-y0);ctx.restore()}
function glossOp(ctx,op){const xs=op.poly.map(p=>p[0]),ys=op.poly.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
 ctx.save();path(ctx,op.poly);ctx.clip();const g=ctx.createLinearGradient(x0,y0,x1,y1);g.addColorStop(0,'rgba(255,255,255,'+(op.soft?.10:.16)+')');g.addColorStop(.45,'rgba(255,255,255,.03)');g.addColorStop(.46,'rgba(255,255,255,0)');g.addColorStop(1,'rgba(255,255,255,0)');
 ctx.fillStyle=g;ctx.fillRect(x0,y0,x1-x0,y1-y0);ctx.restore()}
function edgeOp(ctx,op,W){path(ctx,op.poly);ctx.strokeStyle='rgba(0,0,0,.10)';ctx.lineWidth=Math.max(.6,W/2400);ctx.stroke()}
// The screens: the site cut to the screen (full width, from the top), the story on black, the post or the profile in a
// neutral feed made only of the materials and the kit name.
async function screenSource(mat,inv,need,cache,scr){const S=mat.kind,w=Math.round(Math.max(need.w,need.h*scr.w/scr.h)*1.15),h=Math.round(w*scr.h/scr.w),c=canvas(w,h),x=c.getContext('2d'),font="Helvetica, Arial, 'Liberation Sans', sans-serif";
 const draw=async(m,dx,dy,dw)=>{const src=await sourceOf(m,{w:dw,h:dw*m.crop.h/m.crop.w},cache);x.drawImage(src,dx,dy,dw,dw*src.height/src.width);return dw*src.height/src.width};
 if(S==='sito-desktop'||S==='sito-mobile'){x.fillStyle='#FFFFFF';x.fillRect(0,0,w,h);const src=await sourceOf(mat,{w,h},cache);const sh=src.width*h/w;x.drawImage(src,0,0,src.width,Math.min(sh,src.height),0,0,w,Math.min(sh,src.height)*w/src.width);c._px={w:src.width,h:src.height,vector:false,fullW:true};return c}
 if(S==='storia'){x.fillStyle='#000';x.fillRect(0,0,w,h);const hh=w*mat.crop.h/mat.crop.w,y=Math.max(h*.06,(h-hh)/2);await draw(mat,0,y,w);
  x.fillStyle='rgba(255,255,255,.85)';const bw=(w*.9-8)/3;for(let i=0;i<3;i++){x.globalAlpha=i===0?.95:.45;x.fillRect(w*.05+i*(bw+4),y+h*.012,bw,Math.max(2,h*.0028))}x.globalAlpha=1;return c}
 x.fillStyle='#FFFFFF';x.fillRect(0,0,w,h);const pad=w*.045,top=h*.065,name=inv.brand.name||'',logo=inv.byKind.logo,av=inv.byKind.profilo;
 const avatar=async(cx,cy,r)=>{x.save();x.beginPath();x.arc(cx,cy,r,0,7);x.closePath();x.fillStyle='#F2F2F2';x.fill();x.clip();if(av)await draw(av,cx-r,cy-r,2*r);else if(logo){const L=logo;await draw(L,cx-r*1.6,cy-r*1.6*L.h/L.w,3.2*r)}x.restore();x.strokeStyle='rgba(0,0,0,.08)';x.lineWidth=Math.max(1,w/600);x.beginPath();x.arc(cx,cy,r,0,7);x.stroke()};
 if(S==='copertina'){const ch=await draw(mat,0,top,w),r=w*.11;await avatar(pad+r,top+ch,r);x.fillStyle='#111';x.font='700 '+Math.round(w*.052)+'px '+font;x.fillText(name,pad,top+ch+r+w*.085);
  const posts=(inv.byKind.post&&inv.byKind.post.grid)||[],g=w*.008,cell=(w-2*g)/3,y0=top+ch+r+w*.14;x.fillStyle='#E9E9EB';x.fillRect(0,y0-g*3,w,g);
  for(let i=0;i<9;i++){const cx=(i%3)*(cell+g),cy=y0+Math.floor(i/3)*(cell*1.25+g);if(cy>h)break;if(posts[i]){const img=await loadImg(svgUrl(posts[i]));const sc=Math.max(cell/img.width,cell*1.25/img.height);x.save();x.beginPath();x.rect(cx,cy,cell,cell*1.25);x.clip();x.drawImage(img,cx+(cell-img.width*sc)/2,cy+(cell*1.25-img.height*sc)/2,img.width*sc,img.height*sc);x.restore()}else{x.fillStyle='#F1F1F3';x.fillRect(cx,cy,cell,cell*1.25)}}
  return c}
 // the post in a neutral feed
 const r=w*.045,hy=top+r+w*.02;await avatar(pad+r,hy,r);x.fillStyle='#111';x.font='700 '+Math.round(w*.04)+'px '+font;x.textBaseline='middle';x.fillText(name,pad+2*r+w*.03,hy);x.textBaseline='alphabetic';
 x.fillStyle='#8E8E93';for(let i=0;i<3;i++){x.beginPath();x.arc(w-pad-i*w*.022,hy,w*.007,0,7);x.fill()}
 const py=hy+r+w*.035,ph=await draw(mat,0,py,w);let y=py+ph+w*.05;
 x.strokeStyle='#1C1C1E';x.lineWidth=Math.max(1.5,w*.006);for(let i=0;i<3;i++){x.beginPath();x.arc(pad+w*.03+i*w*.09,y,w*.022,0,7);x.stroke()}
 y+=w*.075;x.fillStyle='#E4E4E7';[.82,.64,.38].forEach((k,i)=>{x.beginPath();const yy=y+i*w*.05,hh=w*.022;x.roundRect?x.roundRect(pad,yy,(w-2*pad)*k,hh,hh/2):x.rect(pad,yy,(w-2*pad)*k,hh);x.fill()});
 // the next post of the feed: another template of the project, or an empty grey tile
 const ny=y+w*.2,next=(mat.grid||[])[1];if(next){const img=await loadImg(svgUrl(next));x.drawImage(img,0,ny,w,w*img.height/img.width)}else{x.fillStyle='#F1F1F3';x.fillRect(0,ny,w,w)}
 return c}
// Draw the whole plan on ctx (its canvas is pl.W × pl.H). cache: Map of the source canvases. Returns {sources}.
async function render(ctx,pl,inv,{cache}={}){const W=pl.W,H=pl.H,sources={};cache=cache||new Map();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
 for(const op of pl.ops){
  if(op.op==='surface')surfaceOp(ctx,op,W,H);
  else if(op.op==='shadow')shadowOp(ctx,op);
  else if(op.op==='poly')polyOp(ctx,op);
  else if(op.op==='glass')glassOp(ctx,op);
  else if(op.op==='gloss')glossOp(ctx,op);
  else if(op.op==='edge')edgeOp(ctx,op,W);
  else if(op.op==='texture'){const m=inv.byKind[op.mat];if(!m)continue;const src=op.screen?await screenSource(m,inv,op.need,cache,op.screen):await sourceOf(m,op.need,cache);
   sources[m.id]=src._px||(op.screen?{w:Infinity,h:Infinity,vector:true}:{w:src.width,h:src.height,vector:!!m.source.vector});
   warp(ctx,src,op.quad,{clip:op.clip,n:pl.W>1500?14:10});
   if(!op.screen){ctx.save();path(ctx,op.quad);ctx.clip();ctx.globalAlpha=.05;ctx.globalCompositeOperation='multiply';ctx.fillStyle=ctx.createPattern(grain(),'repeat');ctx.fillRect(0,0,W,H);ctx.restore()}}}
 // the light of the room: brighter top left, a soft vignette, a little grain over everything
 const L=ctx.createRadialGradient(W*.18,H*.02,0,W*.18,H*.02,Math.hypot(W,H)*.95);L.addColorStop(0,'rgba(255,252,246,.16)');L.addColorStop(.55,'rgba(255,252,246,0)');L.addColorStop(1,'rgba(30,22,14,.10)');ctx.fillStyle=L;ctx.fillRect(0,0,W,H);
 const V=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*.45,W/2,H/2,Math.hypot(W,H)*.62);V.addColorStop(0,'rgba(0,0,0,0)');V.addColorStop(1,'rgba(0,0,0,'+(pl.colours.dark?.28:.16)+')');ctx.fillStyle=V;ctx.fillRect(0,0,W,H);
 ctx.save();ctx.globalAlpha=pl.colours.dark?.05:.035;ctx.globalCompositeOperation='overlay';ctx.fillStyle=ctx.createPattern(grain(),'repeat');ctx.fillRect(0,0,W,H);ctx.restore();
 return {sources}}
const toBlobBytes=(c,type,q)=>new Promise((ok,ko)=>{try{c.toBlob(b=>b?b.arrayBuffer().then(x=>ok(new Uint8Array(x)),ko):ko(Error('file non creato')),type,q)}catch(e){ko(Error('il browser non permette di salvare questa immagine ('+e.message+')'))}});
// One mockup as a PNG (and a JPEG for the contact sheet).
async function shoot(input,inv,{cache,W=EXPORT_W,H=EXPORT_H}={}){const pl=plan(input,inv,{W,H}),c=canvas(W,H),ctx=c.getContext('2d');const r=await render(ctx,pl,inv,{cache});
 const png=await toBlobBytes(c,'image/png'),jc=canvas(1200,800);jc.getContext('2d').drawImage(c,0,0,1200,800);const jpeg=await toBlobBytes(jc,'image/jpeg',.88);return {plan:pl,png,jpeg,sources:r.sources,w:W,h:H}}

// ---- the widget (browser) ----
let counter=0;
const E=(tag,text,cls)=>{const n=doc().createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
const button=(text,cls)=>{const b=E('button',text,cls||'');b.type='button';return b};
const MIME={png:'image/png',pdf:'application/pdf',txt:'text/plain;charset=utf-8',zip:'application/zip'};
const save=(name,data)=>PS().download(name.split('/').pop(),typeof data==='string'?new TextEncoder().encode(data):data,MIME[name.split('.').pop()]||'application/octet-stream');
// ctx: {project, profile, projectName, projectId, workspace, agentsUrl, by, agentsDoc (tests), openStudio(cardId), studioUrl(cardId)}
function mockupStudio(ctx={}){const n=++counter,P=PS(),profile=ctx.profile||{},wrap=E('div',undefined,'tool photo-studio ad-studio coordinato-studio social-studio mockup-studio');
 const steps=E('ol',undefined,'ps-steps');['I materiali','3 scene','Rifinitura e controlli','Scarica i file'].forEach((t,i)=>{const li=E('li',(i+1)+' · '+t);li.dataset.step=String(i+1);steps.append(li)});
 const setStep=k=>[...steps.children].forEach(li=>li.dataset.state=+li.dataset.step<k?'done':+li.dataset.step===k?'current':'todo');wrap.append(steps);setStep(1);
 const status=E('p','Leggo i materiali del progetto…','tool-status');status.setAttribute('role','status');wrap.append(status);
 const studioLink=(card,label)=>{const go=ctx.openStudio?button(label,'mk-go'):E('a',label,'co-link mk-go');if(ctx.openStudio)go.onclick=()=>ctx.openStudio(card);else go.href=ctx.studioUrl?ctx.studioUrl(card):'/agency/crea.html?open='+encodeURIComponent(card);return go};
 const cache=new Map();let inv=null;const st={proposals:[],scene:'',angle:'',shadow:'media',tone:'neutro',off:{},pref:{},files:[],busy:false};
 (async()=>{let agentsDoc=ctx.agentsDoc||null;if(!agentsDoc&&ctx.workspace&&ctx.projectId){try{agentsDoc=await ctx.workspace.bind(ctx.projectId,'agents').load()}catch(e){agentsDoc=null}}
  inv=inventory(profile,agentsDoc,{projectName:ctx.projectName});status.textContent='';start()})();
 const form=E('div',undefined,'ps-form mk-form'),dirs=E('div',undefined,'ad-dirs co-dirs mk-dirs'),result=E('div',undefined,'ad-result co-result mk-result'),out=E('div',undefined,'co-kit mk-out'),saved=E('div',undefined,'ad-saved co-saved');
 dirs.hidden=result.hidden=out.hidden=saved.hidden=true;wrap.append(form,saved,dirs,result,out);
 function thumb(m){const f=E('figure',undefined,'mk-thumb');f.dataset.kind=m.kind;const img=E('img');img.alt=m.title;img.loading='lazy';
  if(m.source.type==='svg'){const s=m.crop.x||m.crop.y||m.crop.w!==m.page.w||m.crop.h!==m.page.h?m.source.svg.replace(/viewBox="[^"]*"/,'viewBox="'+[m.crop.x,m.crop.y,m.crop.w,m.crop.h].join(' ')+'"').replace(/ width="[^"]*" height="[^"]*"/,' width="'+m.crop.w+'" height="'+m.crop.h+'"'):m.source.svg;img.src=svgUrl(s)}
  else{img.src=svgUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100"><rect width="160" height="100" rx="6" fill="#F3F1F6"/><rect x="14" y="16" width="132" height="10" rx="3" fill="#D9D5E0"/><rect x="14" y="36" width="90" height="8" rx="3" fill="#E6E2EC"/><rect x="14" y="52" width="110" height="8" rx="3" fill="#E6E2EC"/><text x="80" y="86" font-family="Helvetica, Arial, sans-serif" font-size="11" text-anchor="middle" fill="#6E6A78">pagina del sito</text></svg>')}
  f.append(img,E('figcaption',m.title));const s=E('small',m.from);f.append(s);if(m.placeholders.length){const w=E('span','Con testi da completare','mk-flag');f.append(w)}return f}
 function start(){if(!inv.list.length){const box=E('div',undefined,'co-empty');box.dataset.empty='materiali';box.append(E('h3','Prima servono i materiali'),E('p','I mockup mettono in scena i materiali che il progetto ha già: biglietti, carta intestata, roll-up, menu, post, sito. Questo progetto non ne ha ancora, e RADIX non li inventa.','ad-idea'));
   const ul=E('ul',undefined,'mk-missing');inv.missing.forEach(m=>{const li=E('li');li.append(E('strong',m.title),E('span',m.why),studioLink(m.studio,'Apri '+m.studioName));ul.append(li)});box.append(ul);form.append(box);return}
  const head=E('div',undefined,'ad-brand co-brand mk-have');head.append(E('h4','I materiali del progetto ('+inv.list.length+')'),E('p','Questi si possono mettere in scena. Il disegno resta identico ai file: si mette in prospettiva, non si rifà.','ad-note'));
  const grid=E('div',undefined,'mk-thumbs');inv.list.forEach(m=>grid.append(thumb(m)));head.append(grid);form.append(head);
  if(inv.missing.length){const box=E('details',undefined,'mk-missing-box');box.open=inv.list.length<4;box.append(E('summary','Materiali che non ci sono ancora ('+inv.missing.length+')'));const ul=E('ul',undefined,'mk-missing');
   inv.missing.forEach(m=>{const li=E('li');li.dataset.group=m.id;li.append(E('strong',m.title),E('span',m.why),studioLink(m.studio,'Apri '+m.studioName));ul.append(li)});box.append(ul);form.append(box)}
  st.proposals=proposals(inv);
  const go=button('Proponi '+(st.proposals.length===1?'la scena':st.proposals.length+' scene'),'primary'),bar=E('div',undefined,'ps-actions');bar.append(go,E('span','Nessuna chiamata AI e nessun credito: le scene si disegnano qui, in codice.','muted'));form.append(bar);
  if(st.proposals.length<3)form.append(E('p',st.proposals.length?'Con i materiali di oggi si possono fare '+st.proposals.length+' scen'+(st.proposals.length===1?'a':'e')+'. Biglietti, carta intestata, post o sito ne aprono altre.':'Nessuna scena è possibile con i materiali di oggi.','ad-note mk-few'));
  go.onclick=()=>{renderDirs();dirs.scrollIntoView&&dirs.scrollIntoView({behavior:'smooth',block:'start'})};loadSaved()}
 async function loadSaved(){if(!ctx.workspace||!ctx.projectId)return;try{const s=readStore(await ctx.workspace.bind(ctx.projectId,'agents').load());if(!s.items.length)return;
  saved.replaceChildren(E('h4','Mockup salvati nel progetto'));const row=E('div',undefined,'ad-saved-row');
  s.items.slice(-4).reverse().forEach(r=>{const sc=scene(r.scene);if(!sc||!possible(sc,inv))return;const b=button(sc.title+' · '+String(r.at||'').slice(0,10),'ad-saved-item');b.onclick=()=>{Object.assign(st,inputOf(r));renderDirs();renderResult()};row.append(b)});
  if(row.children.length){saved.append(row);saved.hidden=false}}catch(e){}}
 const input=id=>({scene:id||st.scene,angle:id&&id!==st.scene?'':st.angle,shadow:st.shadow,tone:st.tone,off:id&&id!==st.scene?{}:st.off,pref:id&&id!==st.scene?{}:st.pref});
 async function paint(cv,pl){const x=cv.getContext('2d');try{await render(x,pl,inv,{cache})}catch(e){x.fillStyle='#F3F1F6';x.fillRect(0,0,cv.width,cv.height);x.fillStyle='#6E6A78';x.font='16px Helvetica, Arial, sans-serif';x.fillText('Anteprima non disegnata: '+e.message,20,40)}}
 async function renderDirs(){setStep(st.scene?3:2);dirs.hidden=false;
  dirs.replaceChildren(...st.proposals.map(id=>{const sc=scene(id),pl=plan(input(id),inv,{W:PREVIEW_W,H:PREVIEW_H});
   const card=E('article',undefined,'ad-dir co-dir mk-dir');card.dataset.scene=id;card.dataset.chosen=String(st.scene===id);
   const hd=E('div',undefined,'ad-dir-head');hd.append(E('span','Scena','ad-angle'),E('h3',sc.title),E('p',sc.line,'ad-idea'));
   const cv=canvas(PREVIEW_W,PREVIEW_H);cv.className='mk-canvas';cv.setAttribute('role','img');cv.setAttribute('aria-label','Mockup «'+sc.title+'»: '+caption(pl,inv));paint(cv,pl);
   const used=E('p',caption(pl,inv),'mk-used');
   const pick=button(st.scene===id?'Scena scelta':'Scegli questa scena','primary');pick.onclick=()=>{if(st.scene!==id){st.angle='';st.off={};st.pref={}}st.scene=id;st.files=[];renderDirs();renderResult();result.scrollIntoView&&result.scrollIntoView({behavior:'smooth',block:'start'})};
   card.append(hd,cv,used,pick);return card}))}
 const chips=(legend,key,list,{onPick}={})=>{const fs=E('fieldset',undefined,'fs-choice mk-choice');fs.dataset.key=key;fs.append(E('legend',legend));
  list.forEach(([id,label,swatch])=>{const l=E('label',undefined,'ps-chip'+(swatch?' fs-swatch':'')),x=E('input');x.type='radio';x.name='mk-'+key+'-'+n;x.value=id;x.checked=String(st[key])===String(id);
   x.onchange=()=>{st[key]=id;if(onPick)onPick(id);st.files=[];out.hidden=true;renderResult()};l.append(x);if(swatch){const i=E('i');i.style.background=swatch;l.append(i)}l.append(E('span',label));fs.append(l)});return fs};
 function checkRow(c){const row=E('div',undefined,'co-check');row.dataset.state=c.state;row.dataset.check=c.id;
  row.append(E('span',{ok:'OK',warn:'Da guardare',fail:'Da sistemare'}[c.state],'co-check-badge'),E('strong',c.label),E('p',c.detail,'co-check-detail'));
  if(c.issues.length){const ul=E('ul');c.issues.forEach(i=>ul.append(E('li',i)));row.append(ul)}return row}
 let lastSources={};
 async function renderResult(){const sc=scene(st.scene);if(!sc)return;setStep(st.files.length?4:3);result.hidden=false;const pl=plan(input(),inv,{W:1200,H:800});if(!st.angle)st.angle=pl.input.angle;
  const head=E('div',undefined,'ad-result-head'),hd=E('div');hd.append(E('span','Scena '+sc.title,'ad-angle'),E('h3','Il mockup di '+(inv.brand.name||'il tuo brand')),E('p','Rifinisci fondo, angolazione, ombre e oggetti: anteprima e controlli si aggiornano.','ad-idea'));head.append(hd);
  const cv=canvas(1200,800);cv.className='mk-canvas mk-big';cv.setAttribute('role','img');cv.setAttribute('aria-label','Mockup «'+sc.title+'»: '+caption(pl,inv));
  const ref=E('div',undefined,'fs-refine sc-refine mk-refine');
  ref.append(chips('Fondo','tone',TONES.filter(t=>t==='neutro'||inv.brand.fromKit).map(t=>[t,TONE_LABEL[t],t==='neutro'?'#E6E2DB':inv.brand.palette[t]])),chips('Angolazione','angle',Object.entries(ANGLES).map(([k,v])=>[k,v.title])),chips('Ombre','shadow',Object.entries(SHADOWS).map(([k,v])=>[k,v.title])));
  const opt=sc.slots.filter(s=>s.kinds.some(k=>inv.byKind[k]));if(opt.length){const fs=E('fieldset',undefined,'fs-choice mk-items');fs.append(E('legend','Oggetti nella scena'));
   opt.forEach(s=>{const kinds=s.kinds.filter(k=>inv.byKind[k]),cur=pl.filled[s.id];
    if(s.required&&kinds.length>1){kinds.forEach(k=>{const l=E('label',undefined,'ps-chip'),x=E('input');x.type='radio';x.name='mk-pref-'+s.id+'-'+n;x.value=k;x.checked=cur===k;x.onchange=()=>{st.pref={...st.pref,[s.id]:k};st.files=[];renderResult()};l.append(x,E('span',KINDS[k].title));fs.append(l)});return}
    const l=E('label',undefined,'ps-chip'),x=E('input');x.type='checkbox';x.name='mk-item-'+s.id+'-'+n;x.checked=!st.off[s.id];x.disabled=!!s.required;x.onchange=()=>{st.off={...st.off,[s.id]:!x.checked};if(!Object.keys(fill(sc,inv,st.off)).length){st.off={...st.off,[s.id]:false};x.checked=true}st.files=[];renderResult()};
    l.append(x,E('span',KINDS[cur||kinds[0]].title+(s.required?' (serve)':'')));fs.append(l);
    if(!s.required&&kinds.length>1&&!st.off[s.id])kinds.forEach(k=>{if(k===cur)return;const b=button('Usa '+KINDS[k].title.toLowerCase(),'mk-swap');b.onclick=()=>{st.pref={...st.pref,[s.id]:k};renderResult()};fs.append(b)})});
   ref.append(fs)}
  const cb=E('div',undefined,'co-checks');const box=E('section',undefined,'mk-export');
  result.replaceChildren(head,cv,ref,cb,box);
  const drawn=await render(cv.getContext('2d'),pl,inv,{cache}).catch(e=>({sources:{},error:e}));lastSources=drawn.sources||{};
  const checks=checksOf(pl,inv,{sources:lastSources});cb.replaceChildren(E('h4','Controlli prima di scaricare'),...checks.map(checkRow));exportBox(box,pl,checks)}
 function exportBox(box,pl,checks){box.replaceChildren(E('h4','I file'));const fails=blocking(checks),others=E('label',undefined,'ps-chip mk-others'),oc=E('input');oc.type='checkbox';oc.checked=st.proposals.length>1;oc.name='mk-others-'+n;
  others.append(oc,E('span','Anche le altre '+(st.proposals.length-1)+' scene, con lo stesso fondo e le stesse ombre'));
  const go=button('Crea PNG '+EXPORT_W+' px, provini PDF e zip','primary'),rs=E('p','','tool-status');rs.setAttribute('role','status');const acts=E('div',undefined,'ps-actions');acts.append(go);if(st.proposals.length>1)box.append(others);
  box.append(acts,E('p','Il PNG è largo '+EXPORT_W+' px ('+EXPORT_W+' × '+EXPORT_H+'); i provini sono un PDF A4 orizzontale con tutti i mockup.','ad-note'),rs);
  go.onclick=async()=>{if(fails.length){rs.textContent='Prima sistema: '+fails.map(c=>c.label.toLowerCase()).join(', ')+'.';return}if(st.busy)return;st.busy=true;go.disabled=true;
   try{const ids=[st.scene].concat(oc.checked?st.proposals.filter(id=>id!==st.scene):[]),shots=[];
    for(const [i,id] of ids.entries()){rs.textContent='Disegno '+scene(id).title.toLowerCase()+'… ('+(i+1)+' di '+ids.length+')';const inp=id===st.scene?input():{scene:id,shadow:st.shadow,tone:st.tone};
     const s=await shoot(inp,inv,{cache});shots.push({...s,id,title:scene(id).title,caption:caption(s.plan,inv),name:baseName(inv,id)+'.png'})}
    rs.textContent='Preparo i provini…';const date=new Date(),sheet=contactSheet(shots.map(s=>({title:s.title,caption:s.caption,w:s.w,h:s.h})),inv.brand,{date});
    for(const p of sheet.pages)for(const it of p.items)if(it.t==='image'){const s=shots[it.shot];it.raster={w:1200,h:800,jpeg:s.jpeg}}
    const pdf=P.pdf(sheet,{mode:'web',date,title:sheet.title,producer:'RADIX Mockup'}),checks2=checksOf(shots[0].plan,inv,{sources:shots[0].sources});
    st.files=shots.map(s=>({name:s.name,data:s.png,label:s.title+' · PNG '+EXPORT_W+' px'})).concat([{name:'mockup-provini.pdf',data:pdf,label:'Provini PDF'},{name:'LEGGIMI.txt',data:readme(inv,shots,checks2,{date}),label:'Istruzioni'}]);
    rs.textContent='';renderOut(shots)}catch(e){rs.textContent='File non creati: '+e.message}finally{st.busy=false;go.disabled=false}}}
 const saveB=button('Salva nel progetto');
 saveB.onclick=async()=>{const rs=out.querySelector('.tool-status');if(!ctx.workspace||!ctx.projectId){rs.textContent='Apri un progetto per salvare.';return}saveB.disabled=true;
  try{const pl=plan(input(),inv,{W:1200,H:800});await saveToProject(ctx.workspace,ctx.projectId,savedRecord(pl,inv,{by:ctx.by,checks:checksOf(pl,inv,{sources:lastSources})}));rs.replaceChildren(doc().createTextNode('Salvato nel progetto: scena e scelte (le immagini no, si rifanno da qui). '));if(ctx.agentsUrl){const a=E('a','Apri in Agenti AI →');a.href=ctx.agentsUrl;rs.append(a)}loadSaved()}
  catch(e){rs.textContent='Salvataggio non riuscito: '+e.message}finally{saveB.disabled=false}};
 function renderOut(shots){setStep(4);out.hidden=false;const zipName=baseName(inv,'scene')+'.zip';
  const top=E('div',undefined,'co-kit-head');top.append(E('h3','I mockup'),E('p','Scarica le immagini, i provini o tutto insieme con LEGGIMI.txt.','ad-idea'));
  const gal=E('div',undefined,'mk-gallery');shots.forEach(s=>{const f=E('figure'),img=E('img');img.alt=s.title;img.src=root.URL.createObjectURL(new root.Blob([s.jpeg],{type:'image/jpeg'}));f.append(img,E('figcaption',s.title));gal.append(f)});
  const ul=E('ul');st.files.forEach(f=>{const li=E('li'),t=E('span',undefined,'co-file'),size=typeof f.data==='string'?new TextEncoder().encode(f.data).length:f.data.length;t.append(E('strong',f.label),E('small',f.name+' · '+kb(size)));const b=button('Scarica','co-dl');b.onclick=()=>save(f.name,f.data);li.append(t,b);ul.append(li)});
  const g=E('div',undefined,'co-group');g.append(ul);const cols=E('div',undefined,'co-files');cols.append(g);
  const zipB=button('Scarica tutto (.zip)','primary'),acts=E('div',undefined,'ps-actions'),rs=E('p','','tool-status');rs.setAttribute('role','status');
  zipB.onclick=()=>save(zipName,bundle(st.files.map(f=>({name:baseName(inv,'scene')+'/'+f.name,data:f.data}))));acts.append(zipB,saveB,E('span',st.files.length+' file.','muted'));
  out.replaceChildren(top,gal,acts,cols,rs);out.scrollIntoView&&out.scrollIntoView({behavior:'smooth',block:'start'})}
 return wrap}

return Object.freeze({AGENT,EXPORT_W,EXPORT_H,KINDS,GROUPS,SCENES,ANGLES,SHADOWS,TONES,CAMS,PHONE,LAPTOP,
 solve,homography,apply,invert,affine,mesh,localScale,area2,camera,rect3,round3,flat,upright,hull,
 entries,siteHtml,logoPlate,inventory,scene,fill,possible,proposals,normalize,toneColours,plan,checksOf,blocking,contactSheet,caption,baseName,readme,bundle,
 readStore,savedRecord,addRecord,saveToProject,inputOf,siteSvg,sourceOf,screenSource,warp,render,shoot,mockupStudio});
});
