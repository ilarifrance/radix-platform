/* Logo in vettoriale · the tracing core (no DOM, no network, no AI): a raster logo as an ImageData-like object
   {width, height, data: RGBA bytes} becomes clean SVG paths.
   1. Background: transparent (most of the border has alpha < 128), a solid colour (most of the border is one colour) or
      none (the artwork bleeds to the edges).
   2. Colours: the opaque pixels go in a 32-level-per-channel histogram; a weighted k-means on its bins (seeded with the
      background colour, then the heaviest bins far from the seeds) gives 1-6 logo colours. Every pixel takes the colour
      of its bin: anti-aliased edges fall on the nearest colour.
   3. Specks: connected regions (4-neighbours) smaller than a minimum area take the colour that surrounds them most.
   4. Layers: one per colour, largest area at the bottom. Each layer is its own pixels plus a 2 px band under the layers
      above it, so neighbouring colours overlap a little and no hairline gap shows between them.
   5. Tracing: the outline of each mask is followed along the pixel edges (foreground on the right, diagonal neighbours
      joined), the midpoints of those unit edges give a marching-squares outline, Ramer-Douglas-Peucker removes the
      points within `eps` pixels of the line, and the vertices that turn gently become quadratic Bézier curves (sharp
      corners stay corners). Holes are kept with fill-rule evenodd.
   6. Mono versions: the pixels of the «ink» layers traced as one shape (black or white). A layer is «paper» (left empty
      in the mono versions) only when it is lighter than the layer around it and hardly touches the outside: the white
      inside of a letter, a light window in a dark badge.
   Output SVG uses only svg, title and path (fill, fill-rule, d): lib/identity-studio.js sanitizeSvg keeps it as it is. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixLogoTrace=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const ALPHA_MIN=128,MAX_COLORS=6,DILATE=2;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const hexOf=c=>'#'+c.slice(0,3).map(v=>clamp(Math.round(v),0,255).toString(16).padStart(2,'0')).join('').toUpperCase();
const rgbOf=h=>{const s=String(h||'').trim().replace(/^#/,'');const f=/^[0-9a-f]{3}$/i.test(s)?s.split('').map(c=>c+c).join(''):s;return /^[0-9a-f]{6}$/i.test(f)?[0,2,4].map(i=>parseInt(f.slice(i,i+2),16)):[0,0,0]};
const isHex=h=>/^#[0-9a-f]{6}$/i.test(String(h||''));
function luminance(c){const [r,g,b]=(typeof c==='string'?rgbOf(c):c).map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});return .2126*r+.7152*g+.0722*b}
// Perceptual-ish distance: green counts more than red, red more than blue.
const dist2=(a,b)=>{const r=a[0]-b[0],g=a[1]-b[1],bl=a[2]-b[2];return 2*r*r+4*g*g+3*bl*bl};
const SAME=2*24*24+4*24*24+3*24*24;// «same colour» for the background test

function check(img){if(!img||!(img.width>0)||!(img.height>0)||!img.data||img.data.length<img.width*img.height*4)throw Error('Immagine non valida.')}

// ---- 1. background ----
function background(img){check(img);const {width:w,height:h,data:d}=img,idx=[];
 for(let x=0;x<w;x++){idx.push(x,(h-1)*w+x)}for(let y=1;y<h-1;y++){idx.push(y*w,y*w+w-1)}
 let clear=0;const bins=new Map();
 for(const i of idx){if(d[i*4+3]<ALPHA_MIN){clear++;continue}const k=(d[i*4]>>4)<<8|(d[i*4+1]>>4)<<4|(d[i*4+2]>>4);bins.set(k,(bins.get(k)||0)+1)}
 if(clear>=idx.length*.5)return {kind:'transparent',color:null,share:clear/idx.length};
 let best=-1,bn=0;for(const [k,n] of bins)if(n>bn){bn=n;best=k}
 if(best<0)return {kind:'none',color:null,share:0};
 // mean of the border pixels close to the most common bin
 const ref=[((best>>8)&15)*16+8,((best>>4)&15)*16+8,(best&15)*16+8],sum=[0,0,0];let n=0;
 for(const i of idx){if(d[i*4+3]<ALPHA_MIN)continue;const c=[d[i*4],d[i*4+1],d[i*4+2]];if(dist2(c,ref)<=SAME){sum[0]+=c[0];sum[1]+=c[1];sum[2]+=c[2];n++}}
 const share=n/idx.length;if(share<.5)return {kind:'none',color:null,share};
 return {kind:'solid',color:sum.map(v=>Math.round(v/n)),share}}

// ---- 2. colours: weighted k-means on the histogram bins ----
const binKey=(r,g,b)=>(r>>3)<<10|(g>>3)<<5|(b>>3);
function histogram(img){const {data:d}=img,n=img.width*img.height,cnt=new Float64Array(32768),sr=new Float64Array(32768),sg=new Float64Array(32768),sb=new Float64Array(32768);let opaque=0;
 for(let p=0;p<n;p++){const a=d[p*4+3];if(a<ALPHA_MIN)continue;const r=d[p*4],g=d[p*4+1],b=d[p*4+2],k=binKey(r,g,b);cnt[k]++;sr[k]+=r;sg[k]+=g;sb[k]+=b;opaque++}
 const bins=[];for(let k=0;k<32768;k++)if(cnt[k])bins.push({k,w:cnt[k],c:[sr[k]/cnt[k],sg[k]/cnt[k],sb[k]/cnt[k]]});return {bins,opaque}}
function kmeans(bins,K,fixed){if(!bins.length)return [];const total=bins.reduce((a,b)=>a+b.w,0),centers=[];
 if(fixed)centers.push(fixed.slice());else{const top=bins.reduce((a,b)=>b.w>a.w?b:a);centers.push(top.c.slice())}
 const minW=total*.0005;
 while(centers.length<K){let best=null,bs=0;for(const b of bins){if(b.w<minW)continue;let m=Infinity;for(const c of centers){const q=dist2(b.c,c);if(q<m)m=q}const s=m*b.w;if(s>bs){bs=s;best=b}}
  if(!best||bs<=0)break;centers.push(best.c.slice())}
 const lab=new Int32Array(bins.length);
 for(let it=0;it<16;it++){let moved=false;
  bins.forEach((b,i)=>{let bi=0,bd=Infinity;centers.forEach((c,j)=>{const q=dist2(b.c,c);if(q<bd){bd=q;bi=j}});if(lab[i]!==bi){lab[i]=bi;moved=true}});
  const acc=centers.map(()=>[0,0,0,0]);bins.forEach((b,i)=>{const a=acc[lab[i]];a[0]+=b.c[0]*b.w;a[1]+=b.c[1]*b.w;a[2]+=b.c[2]*b.w;a[3]+=b.w});
  centers.forEach((c,j)=>{const a=acc[j];if(a[3]&&!(fixed&&j===0)){c[0]=a[0]/a[3];c[1]=a[1]/a[3];c[2]=a[2]/a[3]}});
  if(!moved&&it)break}
 return centers}
// How many logo colours the image seems to have (1-6): clusters that hold at least 1.5 % of the logo pixels and are
// clearly apart from each other.
function suggestColors(img,bg){check(img);const b=bg||background(img),{bins}=histogram(img),fixed=b.kind==='solid'?b.color:null;
 const centers=kmeans(bins,MAX_COLORS+(fixed?1:0),fixed),share=new Float64Array(centers.length);
 for(const x of bins){let bi=0,bd=Infinity;centers.forEach((c,j)=>{const q=dist2(x.c,c);if(q<bd){bd=q;bi=j}});share[bi]+=x.w}
 const fg=centers.map((c,j)=>({c,w:share[j]})).filter((x,j)=>!(fixed&&j===0));const tot=fg.reduce((a,x)=>a+x.w,0)||1;
 const kept=[],ref=()=>kept.map(k=>k.c).concat(fixed?[fixed]:[]);
 for(const x of fg.filter(x=>x.w/tot>=.015).sort((a,b)=>b.w-a.w)){if(kept.some(k=>dist2(k.c,x.c)<SAME*2))continue;if(x.w/tot<.08&&blend(x.c,ref()))continue;kept.push(x)}
 return clamp(kept.length,1,MAX_COLORS)}
// A small cluster whose colour lies between two others (the soft edge between orange and white) is a blend, not a logo
// colour (a large one is a real colour, e.g. a cream disc inside an orange ring on white).
function blend(c,list){for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){const a=list[i],b=list[j],ab=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],l=ab[0]*ab[0]+ab[1]*ab[1]+ab[2]*ab[2];if(!l)continue;
 const t=((c[0]-a[0])*ab[0]+(c[1]-a[1])*ab[1]+(c[2]-a[2])*ab[2])/l;if(t<.1||t>.9)continue;if(dist2(c,[a[0]+t*ab[0],a[1]+t*ab[1],a[2]+t*ab[2]])<SAME/2)return true}return false}
// labels: one byte per pixel, the colour index; 255 = transparent. bgIndex 0 when the background is a solid colour.
function quantize(img,{colors=3,bg}={}){check(img);const b=bg||background(img),K=clamp(Math.round(colors)||1,1,MAX_COLORS),fixed=b.kind==='solid'?b.color:null;
 const {bins,opaque}=histogram(img),centers=kmeans(bins,K+(fixed?1:0),fixed),binLabel=new Uint8Array(32768).fill(255);
 for(const x of bins){let bi=0,bd=Infinity;centers.forEach((c,j)=>{const q=dist2(x.c,c);if(q<bd){bd=q;bi=j}});binLabel[x.k]=bi}
 const n=img.width*img.height,labels=new Uint8Array(n),d=img.data;
 for(let p=0;p<n;p++)labels[p]=d[p*4+3]<ALPHA_MIN?255:binLabel[binKey(d[p*4],d[p*4+1],d[p*4+2])];
 return {width:img.width,height:img.height,labels,centers:centers.map(c=>c.map(Math.round)),bgIndex:fixed?0:-1,background:b,opaque}}

// ---- 3. specks ----
// Regions (4-connected, same label, transparent included) under minArea pixels take the label they touch most.
function removeSpecks(q,minArea){const {width:w,height:h,labels:L}=q,n=w*h,comp=new Int32Array(n).fill(-1),stack=new Int32Array(n),starts=[],sizes=[],order=new Int32Array(n);let removed=0;
 if(!(minArea>1))return 0;
 for(let pass=0;pass<2;pass++){comp.fill(-1);starts.length=sizes.length=0;let pos=0;
  for(let s=0;s<n;s++){if(comp[s]>=0)continue;const id=starts.length,lab=L[s];starts.push(pos);let sp=0;stack[sp++]=s;comp[s]=id;
   while(sp){const p=stack[--sp];order[pos++]=p;const x=p%w;
    if(x>0&&comp[p-1]<0&&L[p-1]===lab){comp[p-1]=id;stack[sp++]=p-1}if(x<w-1&&comp[p+1]<0&&L[p+1]===lab){comp[p+1]=id;stack[sp++]=p+1}
    if(p>=w&&comp[p-w]<0&&L[p-w]===lab){comp[p-w]=id;stack[sp++]=p-w}if(p<n-w&&comp[p+w]<0&&L[p+w]===lab){comp[p+w]=id;stack[sp++]=p+w}}
   sizes.push(pos-starts[id])}
  const small=sizes.map((s,i)=>i).filter(i=>sizes[i]<minArea).sort((a,b)=>sizes[a]-sizes[b]);let changed=0;
  for(const id of small){const a=starts[id],z=a+sizes[id],own=L[order[a]],votes=new Map();
   for(let i=a;i<z;i++){const p=order[i],x=p%w;for(const nb of [x>0?p-1:-1,x<w-1?p+1:-1,p>=w?p-w:-1,p<n-w?p+w:-1]){if(nb<0)continue;const l=L[nb];if(l!==own)votes.set(l,(votes.get(l)||0)+1)}}
   let best=-1,bv=0;for(const [l,v] of votes)if(v>bv){bv=v;best=l}
   if(best>=0){for(let i=a;i<z;i++)L[order[i]]=best;changed++}}
  removed+=changed;if(!changed)break}
 return removed}

// ---- 4. masks ----
function dilate(mask,w,h,r){if(r<=0)return mask;const t=new Uint8Array(w*h),o=new Uint8Array(w*h);
 for(let y=0;y<h;y++){const row=y*w;let last=-1e9;for(let x=0;x<w;x++){if(mask[row+x])last=x;if(x-last<=r)t[row+x]=1}last=1e9;for(let x=w-1;x>=0;x--){if(mask[row+x])last=x;if(last-x<=r)t[row+x]=1}}
 for(let x=0;x<w;x++){let last=-1e9;for(let y=0;y<h;y++){if(t[y*w+x])last=y;if(y-last<=r)o[y*w+x]=1}last=1e9;for(let y=h-1;y>=0;y--){if(t[y*w+x])last=y;if(last-y<=r)o[y*w+x]=1}}
 return o}

// ---- 5. tracing ----
// Closed outlines of a 0/1 mask, as lists of [x, y] in pixel units (pixel (i, j) covers [i, i+1] × [j, j+1]).
const DX=[1,0,-1,0],DY=[0,1,0,-1];// E S W N (y down)
function traceMask(mask,w,h){const W=w+1,edge=new Uint8Array(W*(h+1)*4),at=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&mask[y*w+x];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(!mask[y*w+x])continue;
  if(!at(x,y-1))edge[(y*W+x)*4]=1;if(!at(x+1,y))edge[(y*W+x+1)*4+1]=1;if(!at(x,y+1))edge[((y+1)*W+x+1)*4+2]=1;if(!at(x-1,y))edge[((y+1)*W+x)*4+3]=1}
 const loops=[];
 for(let e=0;e<edge.length;e++){if(edge[e]!==1)continue;const v0=e>>2,d0=e&3,pts=[];let v=v0,d=d0;
  for(let guard=0;guard<edge.length;guard++){edge[v*4+d]=2;const x=v%W,y=(v-x)/W;pts.push([x,y]);const nx=x+DX[d],ny=y+DY[d],nv=ny*W+nx;
   let nd=-1;for(const c of [(d+3)&3,d,(d+1)&3])if(edge[nv*4+c]===1){nd=c;break}
   if(nd<0)break;v=nv;d=nd}
  if(pts.length>=4)loops.push(mid(pts))}
 return loops}
// The midpoints of the unit edges: staircases become 45° lines (the marching-squares outline). A real corner (at
// least 3 straight edges on both sides) keeps its pixel corner, so squares stay square.
function mid(pts){const n=pts.length,dir=new Int8Array(n),run=new Int32Array(n),out=[];
 for(let i=0;i<n;i++){const a=pts[i],b=pts[(i+1)%n];dir[i]=b[0]>a[0]?0:b[1]>a[1]?1:b[0]<a[0]?2:3}
 let s=0;while(s<n&&dir[s]===dir[(s+n-1)%n])s++;if(s===n)s=0;
 for(let k=0;k<n;){let j=k;while(j<n&&dir[(s+j)%n]===dir[(s+k)%n])j++;for(let i=k;i<j;i++)run[(s+i)%n]=j-k;k=j}
 for(let i=0;i<n;i++){const a=pts[i],b=pts[(i+1)%n],nx=(i+1)%n;out.push([(a[0]+b[0])/2,(a[1]+b[1])/2]);if(dir[nx]!==dir[i]&&run[i]>=3&&run[nx]>=3)out.push([b[0],b[1]])}
 return out}
function area(pts){let s=0;for(let i=0,n=pts.length;i<n;i++){const a=pts[i],b=pts[(i+1)%n];s+=a[0]*b[1]-b[0]*a[1]}return s/2}
function segDist2(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy;let t=l?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l:0;t=clamp(t,0,1);const x=a[0]+t*dx-p[0],y=a[1]+t*dy-p[1];return x*x+y*y}
// Ramer-Douglas-Peucker on an open polyline (first and last kept).
function rdp(pts,eps){const n=pts.length;if(n<3)return pts.slice();const keep=new Uint8Array(n),e2=eps*eps,st=[[0,n-1]];keep[0]=keep[n-1]=1;
 while(st.length){const [a,b]=st.pop();let bi=-1,bd=e2;for(let i=a+1;i<b;i++){const q=segDist2(pts[i],pts[a],pts[b]);if(q>bd){bd=q;bi=i}}if(bi>0){keep[bi]=1;st.push([a,bi],[bi,b])}}
 return pts.filter((p,i)=>keep[i])}
// On a closed outline: split at the point farthest from the first one, simplify both halves.
function rdpClosed(pts,eps){const n=pts.length;if(n<4)return pts.slice();
 let s=0;for(let i=1;i<n;i++)if(pts[i][0]<pts[s][0]||pts[i][0]===pts[s][0]&&pts[i][1]<pts[s][1])s=i;// start at an extreme point: it is a vertex
 if(s)pts=pts.slice(s).concat(pts.slice(0,s));let far=0,fd=-1;for(let i=1;i<n;i++){const dx=pts[i][0]-pts[0][0],dy=pts[i][1]-pts[0][1],q=dx*dx+dy*dy;if(q>fd){fd=q;far=i}}
 const a=rdp(pts.slice(0,far+1),eps),b=rdp(pts.slice(far).concat([pts[0]]),eps);return a.concat(b.slice(1,-1))}

// ---- 6. path data ----
const fmt=(v,dec)=>{const k=Math.pow(10,dec),x=Math.round(v*k)/k;return String(Object.is(x,-0)?0:x)};
// smooth 0..1: 0 = polygon; vertices that turn less than 30° + 70° × smooth become curves, rounded over at most
// `radius` px on each side. t: {k (scale), ox, oy (subtracted before scaling), x, y (added after)}, dec: decimals.
function loopPath(pts,{smooth=0,radius=12,t={},dec=1}={}){const n=pts.length;if(n<3)return {d:'',nodes:0};const k=t.k||1,X=x=>fmt((x-(t.ox||0))*k+(t.x||0),dec),Y=y=>fmt((y-(t.oy||0))*k+(t.y||0),dec),P=p=>X(p[0])+' '+Y(p[1]);
 const lim=smooth>0?(30+70*clamp(smooth,0,1))*Math.PI/180:-1,A=[],B=[],S=[];
 for(let i=0;i<n;i++){const p=pts[(i+n-1)%n],v=pts[i],q=pts[(i+1)%n],ax=v[0]-p[0],ay=v[1]-p[1],bx=q[0]-v[0],by=q[1]-v[1],la=Math.hypot(ax,ay),lb=Math.hypot(bx,by);
  const turn=la&&lb?Math.acos(clamp((ax*bx+ay*by)/(la*lb),-1,1)):0,sm=turn<lim&&la>0&&lb>0;S.push(sm);
  if(sm){const ta=Math.min(.5,radius/la),tb=Math.min(.5,radius/lb);A.push([v[0]-ax*ta,v[1]-ay*ta]);B.push([v[0]+bx*tb,v[1]+by*tb])}else{A.push(v);B.push(v)}}
 const out=['M'+P(B[0])];let nodes=1,cur=P(B[0]);
 for(let j=1;j<=n;j++){const i=j%n;const a=P(A[i]);if(S[i]){if(a!==cur){out.push('L'+a);nodes++}const b=P(B[i]);out.push('Q'+P(pts[i])+' '+b);nodes++;cur=b}else{if(i===0)break;if(a!==cur){out.push('L'+a);nodes++;cur=a}}}
 out.push('Z');return {d:out.join(''),nodes}}
function pathOf(loops,o){let nodes=0;const ds=[];for(const l of loops){const r=loopPath(l,o);if(r.d){ds.push(r.d);nodes+=r.nodes}}return {d:ds.join(''),nodes}}

// ---- settings ----
const TYPES=Object.freeze(['simbolo','scritta','entrambi']);
const lerp=(a,b,t)=>a+(b-a)*t;
// detail 0..100 (100 = closest to the pixels), smooth 0..100. Returns the numbers the pipeline uses.
function params(s,pixels){const d=clamp(+s.detail||0,0,100)/100,m=clamp(+s.smooth||0,0,100)/100;
 return {eps:lerp(2.4,.35,d),minArea:Math.max(2,Math.round(pixels*lerp(.00012,.000005,d))),smooth:m,radius:lerp(4,22,m)}}
function settingsOf(x){const o=x&&typeof x==='object'?x:{};return {colors:clamp(Math.round(+o.colors)||3,1,MAX_COLORS),detail:clamp(Math.round(+(o.detail!=null?o.detail:70)),0,100),smooth:clamp(Math.round(+(o.smooth!=null?o.smooth:50)),0,100),
 background:o.background==='keep'?'keep':'drop',type:TYPES.includes(o.type)?o.type:'entrambi',recolor:Array.isArray(o.recolor)?o.recolor.slice(0,MAX_COLORS).map(h=>isHex(h)?String(h).toUpperCase():''):[],
 paper:Array.isArray(o.paper)?o.paper.slice(0,MAX_COLORS).map(v=>v===true?true:v===false?false:null):[]}}
// The three proposals: Fedele (close to the pixels), Pulito (fewer nodes, smoother), Essenziale (fewer colours, flat).
const PROPOSALS=Object.freeze([
 {id:'fedele',title:'Fedele',line:'Il più vicino all’originale: tutti i colori, i dettagli piccoli restano.'},
 {id:'pulito',title:'Pulito',line:'Stessi colori, meno nodi e curve più morbide: più leggero e regolare.'},
 {id:'essenziale',title:'Essenziale',line:'Meno colori e forme piatte: il segno ridotto all’essenziale.'}]);
function proposalSettings(id,{colors=3,type='entrambi',background='drop'}={}){const k=clamp(Math.round(colors)||1,1,MAX_COLORS),txt=type==='scritta'?1:type==='simbolo'?-1:0;
 const base=id==='pulito'?{colors:k,detail:45,smooth:75}:id==='essenziale'?{colors:Math.max(1,Math.ceil(k/2)),detail:35,smooth:20}:{colors:k,detail:85,smooth:35};
 return settingsOf({...base,detail:base.detail+10*txt,smooth:base.smooth-12*txt,background,type})}

// ---- the whole pipeline ----
// Returns {width, height, viewBox:[x,y,w,h], background, bgColor, layers:[{color, original, area, loops, paper}], mono:{loops}, nodes, settings, params}
function trace(img,settings){check(img);const s=settingsOf(settings),w=img.width,h=img.height,n=w*h,bg=background(img),q=quantize(img,{colors:s.colors,bg}),pr=params(s,n);
 const specks=removeSpecks(q,pr.minArea),L=q.labels,count=new Float64Array(256);for(let p=0;p<n;p++)count[L[p]]++;
 const ids=q.centers.map((c,i)=>i).filter(i=>i!==q.bgIndex&&count[i]>0).sort((a,b)=>count[b]-count[a]||a-b),rank=new Int16Array(256).fill(-1);ids.forEach((id,r)=>rank[id]=r);
 // content box: every pixel that is not background or transparent
 let x0=w,y0=h,x1=-1,y1=-1;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const l=L[y*w+x];if(l===255||l===q.bgIndex)continue;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}
 const empty=x1<0,keepBg=s.background==='keep'&&bg.kind==='solid';
 const viewBox=keepBg||empty?[0,0,w,h]:[x0,y0,x1-x0+1,y1-y0+1];
 const outline=mask=>traceMask(mask,w,h).map(l=>rdpClosed(l,pr.eps)).filter(l=>l.length>=3&&Math.abs(area(l))>=Math.max(1,pr.minArea/2));
 const layers=ids.map((id,r)=>{const own=new Uint8Array(n),up=new Uint8Array(n);for(let p=0;p<n;p++){const k=rank[L[p]];if(k===r)own[p]=1;else if(k>r)up[p]=1}
  const grown=dilate(own,w,h,DILATE);for(let p=0;p<n;p++)if(up[p]&&grown[p])own[p]=1;
  const col=hexOf(q.centers[id]),rc=s.recolor[r];return {id,color:isHex(rc)?rc:col,original:col,area:count[id],loops:outline(own)}});
 // mono: which layers are «paper»
 const paperAuto=paperLayers(q,ids,rank);layers.forEach((l,r)=>{const forced=s.paper[r];l.paperAuto=paperAuto[r];l.paper=forced===true||forced===false?forced:paperAuto[r]});
 const ink=new Uint8Array(n);for(let p=0;p<n;p++){const r=rank[L[p]];if(r>=0&&!layers[r].paper)ink[p]=1}
 const mono={loops:outline(ink)};
 const o={smooth:pr.smooth,radius:pr.radius};let nodes=0;for(const l of layers){l.nodes=pathOf(l.loops,o).nodes;nodes+=l.nodes}mono.nodes=pathOf(mono.loops,o).nodes;
 return {width:w,height:h,viewBox,background:bg.kind,bgColor:bg.color?hexOf(bg.color):null,keepBg,layers,mono,nodes,specks,settings:s,params:pr}}
function paperLayers(q,ids,rank){const {width:w,height:h,labels:L}=q,n=w*h,m=ids.length,out=new Float64Array(m),touch=ids.map(()=>new Float64Array(m)),tot=new Float64Array(m);
 for(let p=0;p<n;p++){const r=rank[L[p]];if(r<0)continue;const x=p%w;for(const nb of [x>0?p-1:-1,x<w-1?p+1:-1,p>=w?p-w:-1,p<n-w?p+w:-1]){if(nb<0){out[r]++;tot[r]++;continue}const o=rank[L[nb]];if(o===r)continue;tot[r]++;if(o<0)out[r]++;else touch[r][o]++}}
 return ids.map((id,r)=>{if(m<2||!tot[r])return false;if(out[r]/tot[r]>.25)return false;let bo=-1,bv=0;touch[r].forEach((v,o)=>{if(v>bv){bv=v;bo=o}});if(bo<0)return false;
  return luminance(q.centers[id])>luminance(q.centers[ids[bo]])+.15})}

// ---- SVG ----
const escText=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
// variant: 'color' | 'black' | 'white'. full: the whole image as viewBox (for the before/after overlay).
// box: [x,y,w,h] to use as viewBox instead (e.g. a padded square for the favicon). colors: overrides by layer index.
function svgOf(r,{variant='color',full=false,box=null,title='',dec=1,width=0,height=0,background=''}={}){
 const vb=box||(full?[0,0,r.width,r.height]:r.viewBox),o={smooth:r.params.smooth,radius:r.params.radius,dec,t:{ox:vb[0],oy:vb[1]}},W=vb[2],H=vb[3];
 const attrs=' viewBox="0 0 '+fmt(W,2)+' '+fmt(H,2)+'"'+(width?' width="'+fmt(width,2)+'" height="'+fmt(height||width*H/W,2)+'"':'');
 const parts=['<svg xmlns="http://www.w3.org/2000/svg"'+attrs+'>'];if(title)parts.push('<title>'+escText(String(title).slice(0,120))+'</title>');
 if(background)parts.push('<path fill="'+background+'" d="M0 0H'+fmt(W,2)+'V'+fmt(H,2)+'H0Z"/>');
 if(variant==='color'){if(r.keepBg&&r.bgColor&&!background)parts.push('<path fill="'+r.bgColor+'" d="M0 0H'+fmt(W,2)+'V'+fmt(H,2)+'H0Z"/>');
  for(const l of r.layers){const p=pathOf(l.loops,o);if(p.d)parts.push('<path fill="'+l.color+'" fill-rule="evenodd" d="'+p.d+'"/>')}}
 else{const p=pathOf(r.mono.loops,o);if(p.d)parts.push('<path fill="'+(variant==='white'?'#FFFFFF':'#000000')+'" fill-rule="evenodd" d="'+p.d+'"/>')}
 parts.push('</svg>');return parts.join('')}
// A square box around the logo with `pad` (share of the side) of air: favicons and avatars.
function squareBox(r,pad=.08){const [x,y,w,h]=r.viewBox,S=Math.max(w,h)*(1+2*pad);return [x+w/2-S/2,y+h/2-S/2,S,S]}
// The paths of a variant placed in a box of the PDF page (mm): [{d, fill}] for lib/print-studio.js path items.
function pdfPaths(r,{x,y,w,h,variant='color'}){const [vx,vy,vw,vh]=r.viewBox,k=Math.min(w/vw,h/vh),dx=x+(w-vw*k)/2,dy=y+(h-vh*k)/2,o={smooth:r.params.smooth,radius:r.params.radius,dec:3,t:{k,ox:vx,oy:vy,x:dx,y:dy}};
 const out=[];if(variant==='color'){if(r.keepBg&&r.bgColor)out.push({d:'M'+fmt(dx,3)+' '+fmt(dy,3)+'h'+fmt(vw*k,3)+'v'+fmt(vh*k,3)+'h'+fmt(-vw*k,3)+'Z',fill:r.bgColor});for(const l of r.layers){const p=pathOf(l.loops,o);if(p.d)out.push({d:p.d,fill:l.color})}}
 else{const p=pathOf(r.mono.loops,o);if(p.d)out.push({d:p.d,fill:variant==='white'?'#FFFFFF':'#000000'})}
 return {paths:out,box:{x:dx,y:dy,w:vw*k,h:vh*k}}}
// The lightest-detail trace whose colour SVG fits in `max` characters (the Kit identità keeps logos under 20 000):
// first fewer decimals, then less detail. Returns {svg, settings} or null.
function fitSvg(img,settings,max,{title=''}={}){let s=settingsOf(settings);for(let i=0;i<8;i++){const r=trace(img,s);for(const dec of [1,0]){const svg=svgOf(r,{title,dec});if(svg.length<=max)return {svg,settings:s,result:r}}
  if(s.detail<=0)break;s={...s,detail:Math.max(0,s.detail-15)}}return null}

return Object.freeze({ALPHA_MIN,MAX_COLORS,TYPES,PROPOSALS,hexOf,rgbOf,isHex,luminance,background,histogram,kmeans,suggestColors,quantize,removeSpecks,dilate,traceMask,mid,area,rdp,rdpClosed,loopPath,pathOf,
 params,settingsOf,proposalSettings,trace,paperLayers,svgOf,squareBox,pdfPaths,fitSvg});
});
