/* Studio Foto prodotto (schede I2/I3 dell'analisi «2.6 Immagini»): le foto VERE del prodotto, scontornate,
   su fondo bianco puro per Amazon e Google, su un colore del brand o ambientate.
   - Scontorno nel browser con un modello open source (lib/product-photo-segment.js, serve WebGPU): 0 crediti, la foto
     non esce dal computer. Senza WebGPU, o per foto su fondo tinta unita, «Fondo uniforme» (plainBackgroundMask): nessun
     download. Bordo regolabile (soglia, sfumatura, restringi) e pennello per cancellare o ripristinare.
   - Fondo bianco e colore: composizione qui, pixel per pixel (#FFFFFF esatto, prodotto all'85% dell'inquadratura),
     export JPG, PNG o WebP a 2000×2000, 1200×1200, 1080×1350.
   - Ambientazione: OpenAI disegna SOLO lo sfondo (/api/openai-image, 3 proposte = 3 generazioni con una conferma);
     RADIX ci appoggia sopra il prodotto vero, con scala, posizione, ombra di contatto e un leggero adattamento del
     tono di luce: forma, colori ed etichette non passano mai dall'AI. Gli sfondi si riusano per tutte le foto (lotto).
   - Controlli deterministici: copertura della maschera, prodotto ≥85% sul bianco, bordo #FFFFFF, risoluzione,
     alone sui bordi, forma uguale all'originale.
   - Salvataggio nel progetto: immagini nell'archivio media del progetto (/api/workspace?resource=media) e la scheda
     nel documento 'agents' sotto productPhotos (agents-page.js la conserva).
   La parte pura (formati, maschere, composizione, controlli, prompt, conferma) gira in Node per i test. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixProductPhotoStudio=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
// The styled RADIX confirmation (lib/radix-confirm.js) before every paid step; root.confirm only if it is missing.
const askConfirm=o=>{const C=root.RadixConfirm||(typeof require==='function'?require('./radix-confirm.js'):null);return C?C.ask(o):Promise.resolve(!!root.confirm([o.title,o.cost,o.message].filter(Boolean).join('\n')))};
const lib=(g,p)=>root[g]||(typeof require==='function'?(()=>{try{return require(p)}catch(e){return null}})():null);
const zipLib=()=>lib('RadixZip','./zip-lite.js'),segLib=()=>lib('RadixProductPhotoSegment','./product-photo-segment.js'),mediaLib=()=>lib('RadixAgentMedia','./radix-agent-media.js');

// ---- the questions ----
const FORMATS=Object.freeze([
 {id:'sq2000',label:'2000 × 2000',sub:'Amazon e shop, con zoom',w:2000,h:2000,shape:'square'},
 {id:'sq1200',label:'1200 × 1200',sub:'Google Shopping e sito',w:1200,h:1200,shape:'square'},
 {id:'p1080',label:'1080 × 1350',sub:'Social 4:5',w:1080,h:1350,shape:'portrait'}]);
const USES=Object.freeze([
 {id:'shop',label:'Shop e Amazon',sub:'Foto principale su bianco',bg:'white',format:'sq2000',fill:.85,shadow:false},
 {id:'social',label:'Social',sub:'Foto ambientata',bg:'scene',format:'p1080',fill:.6,shadow:true},
 {id:'catalogo',label:'Catalogo',sub:'Fondo uniforme',bg:'white',format:'sq1200',fill:.8,shadow:true}]);
const BACKGROUNDS=Object.freeze([
 {id:'white',label:'Bianco puro',sub:'#FFFFFF, come chiedono Amazon e Google'},
 {id:'brand',label:'Colore del brand',sub:'Tinta unita, dal Kit identità'},
 {id:'scene',label:'Ambientato',sub:'3 sfondi AI, il prodotto resta la tua foto'}]);
const TYPES=Object.freeze([{id:'jpg',mime:'image/jpeg',label:'JPG'},{id:'png',mime:'image/png',label:'PNG'},{id:'webp',mime:'image/webp',label:'WebP'}]);
// Italian label → words for the scene prompt. First entry is the default.
const SCENE_QUESTIONS=Object.freeze([
 {id:'ambiente',label:'Ambiente',options:[['Cucina','a bright modern kitchen'],['Soggiorno','a calm contemporary living room'],['Ufficio','a tidy modern office'],['Bagno','a clean spa-like bathroom'],['Esterno','an outdoor terrace with soft greenery'],['Negozio','an elegant boutique interior'],['Studio fotografico','a seamless photo studio set']]},
 {id:'luce',label:'Luce',options:[['Naturale morbida','soft natural window daylight from the left'],['Calda, tramonto','warm golden-hour sunlight'],['Luminosa da studio','bright, even studio lighting'],['Contrastata','moody directional light with soft long shadows']]},
 {id:'superficie',label:'Superficie',options:[['Legno chiaro','a light oak wooden tabletop'],['Marmo','a white marble countertop'],['Cemento','a smooth grey concrete surface'],['Tessuto','a neutral linen cloth'],['Pietra','a natural stone slab']]},
 {id:'stile',label:'Stile',options:[['Dal Kit identità','brand'],['Minimal','minimal and airy, very few props'],['Caldo e accogliente','warm and cozy, natural materials'],['Lusso','premium and elegant, refined materials']]}]);
const SCENE_VARIANTS=Object.freeze([['Essenziale','a very clean composition with almost no props'],['Con dettagli ai lati','a few small context props only at the far left and right edges, softly out of focus'],['Più profondità','a deeper background with strong bokeh and atmospheric depth']]);
const SCENE_COUNT=SCENE_VARIANTS.length,MAX_PRODUCTS=10,MAX_SIDE=2400,MAX_SAVED=10,PROMPT_MAX=3000;
const MIN_LONG_SIDE=1000,FILL_MIN=.85;
const str=v=>v==null?'':String(v).replace(/\s+/g,' ').trim();
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const pickScene=(id,v)=>{const q=SCENE_QUESTIONS.find(x=>x.id===id),o=q.options.find(x=>x[1]===v||x[0]===v);return (o||q.options[0])[1]};
const format=id=>FORMATS.find(f=>f.id===id)||FORMATS[0];
const use=id=>USES.find(u=>u.id===id)||USES[0];
const type=id=>TYPES.find(t=>t.id===id)||TYPES[0];

// The brand for the scenes and the colour background: the Kit identità first, else the colours in the profile.
function brandOf(project,profile){const kit=profile&&profile.identityKit&&typeof profile.identityKit==='object'?profile.identityKit:null,hex=/^#[0-9a-f]{6}$/i;
 if(kit&&Array.isArray(kit.palette)&&kit.palette.length){const by=r=>(kit.palette.find(x=>x&&x.role===r)||{}).hex,cols=kit.palette.map(x=>x&&x.hex).filter(h=>hex.test(h||''));
  return {source:'kit',label:'Dal Kit identità'+(kit.direction?' «'+str(kit.direction).slice(0,40)+'»':''),colors:cols.slice(0,5),light:hex.test(by('light')||'')?by('light'):cols[cols.length-1],keywords:(Array.isArray(kit.keywords)?kit.keywords:[]).map(str).filter(Boolean).slice(0,5),tone:str(kit.tone).slice(0,120)}}
 const M=mediaLib(),g=M&&typeof M.styleGuide==='function'?M.styleGuide(project):null;
 if(g)return {source:'visual',label:'Dall’identità visiva del profilo',colors:[g.cover,g.page,g.key,g.accent].filter((h,i,a)=>h&&a.indexOf(h)===i),light:g.page,keywords:[],tone:''};
 return {source:'default',label:'Colori neutri: crea il Kit identità per usare i tuoi',colors:[],light:'#F3F1EC',keywords:[],tone:''}}

// ---- the scenes: only the background, never the product ----
// answers: {ambiente,luce,superficie,stile} (Italian labels or prompt words); brand from brandOf; fill: how much of the
// frame height the product will take, so the empty area is the right size.
function scenePrompts(answers,{brand,fill=.6,formatId}={}){const a=answers||{},b=brand||{colors:[],keywords:[]},f=format(formatId);
 const style=pickScene('stile',a.stile)==='brand'?(b.colors&&b.colors.length?'colour accents and props in harmony with the brand palette '+b.colors.join(', ')+(b.keywords&&b.keywords.length?', mood: '+b.keywords.join(', '):''):'sober, professional and natural'):pickScene('stile',a.stile);
 const base='Photorealistic empty background plate for a product photograph, '+(f.shape==='square'?'square':'vertical 4:5')+' frame, camera at product height with a 50mm lens. '+
  'Scene: '+pickScene('ambiente',a.ambiente)+'. Surface: '+pickScene('superficie',a.superficie)+' in the foreground, across the whole lower part of the frame. Light: '+pickScene('luce',a.luce)+'. Style: '+style+'. '+
  'Leave the centre of the surface completely EMPTY and in sharp focus: a real product will be placed there later, standing on the surface in the middle, about '+Math.round(clamp(fill,.2,.95)*100)+'% of the frame height. '+
  'Do NOT draw any product, bottle, jar, box, package, label or object in the centre. No text, no letters, no logos, no watermark, no people, no hands.';
 return SCENE_VARIANTS.map(([label,frame])=>({label,prompt:(base+' Composition: '+frame+'.').slice(0,PROMPT_MAX)}))}
// The one confirmation before the scenes: how many generations, what they cost, that products add none.
function sceneConfirm(count,products){const p=Math.max(0,products|0);
 return {title:'Generare '+count+' sfondi con OpenAI?',cost:'Sono '+count+' generazioni di immagini OpenAI a qualità media: consumano il saldo API di OpenAI. Scontorno, fondo bianco e composizione restano gratuiti.',
  facts:[['Generazioni',count+' sfondi, uno per proposta'],['Foto prodotto',(p?p+(p===1?' foto':' foto')+': ':'')+'ogni sfondo si riusa per tutte, nessuna generazione in più'],['Il prodotto','resta la tua foto vera: l’AI disegna solo lo sfondo']],
  message:'Poi scegli lo sfondo e RADIX ci appoggia sopra il prodotto, con ombra e luce adattate.',ok:'Genera '+count+' sfondi'}}
async function postImage(body){const r=await root.fetch('/api/openai-image',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Sfondo non generato');if(!d.image)throw Error('Risposta senza immagine');return d}
// prompts from scenePrompts; request(body) posts one generation (default: /api/openai-image); confirm overrides askConfirm.
// Returns null on «Annulla» (no call), else one entry per prompt with .image or .error: exactly prompts.length calls.
async function generateScenes({prompts,shape='square',references,products=0,request,confirm}={}){const list=(prompts||[]).slice(0,SCENE_COUNT);if(!list.length)throw Error('Nessuno sfondo da generare.');
 const ask=confirm||askConfirm;if(!await ask(sceneConfirm(list.length,products)))return null;
 const send=request||postImage,refs=(references||[]).filter(r=>/^data:image\/(png|jpeg|webp);base64,/.test(String(r))).slice(0,2);
 return Promise.all(list.map(async p=>{const body={prompt:p.prompt,shape,quality:'medium'};if(refs.length)body.references=refs;
  try{const d=await send(body);return {...p,image:d.image}}catch(e){return {...p,error:e&&e.message||String(e)}}}))}

// ---- masks: Uint8Array 0..255, w×h ----
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
function erode(src,w,h,r){if(r<1)return src;let a=src,b=new Uint8Array(src.length);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let m=255;for(let k=-r;k<=r;k++){const xx=x+k;const v=xx<0||xx>=w?0:a[y*w+xx];if(v<m)m=v}b[y*w+x]=m}
 const c=new Uint8Array(src.length);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let m=255;for(let k=-r;k<=r;k++){const yy=y+k;const v=yy<0||yy>=h?0:b[yy*w+x];if(v<m)m=v}c[y*w+x]=m}return c}
function boxBlur(src,w,h,r){if(r<1)return src;const tmp=new Float32Array(src.length),out=new Uint8Array(src.length),n=2*r+1;
 for(let y=0;y<h;y++){let s=0;for(let k=-r;k<=r;k++)s+=src[y*w+clamp(k,0,w-1)];for(let x=0;x<w;x++){tmp[y*w+x]=s/n;s+=src[y*w+clamp(x+r+1,0,w-1)]-src[y*w+clamp(x-r,0,w-1)]}}
 for(let x=0;x<w;x++){let s=0;for(let k=-r;k<=r;k++)s+=tmp[clamp(k,0,h-1)*w+x];for(let y=0;y<h;y++){out[y*w+x]=Math.round(s/n);s+=tmp[clamp(y+r+1,0,h-1)*w+x]-tmp[clamp(y-r,0,h-1)*w+x]}}
 return out}
// The edge controls: threshold (0.2–0.8, where the edge falls), choke (px the edge moves in, against halos),
// feather (px of softness). Same settings, same mask: deterministic.
const REFINE_DEFAULT=Object.freeze({threshold:.5,feather:1,choke:0});
function refineMask(raw,w,h,opts={}){const t=clamp(+opts.threshold||REFINE_DEFAULT.threshold,.05,.95),band=.12,out=new Uint8Array(raw.length);
 for(let i=0;i<raw.length;i++)out[i]=Math.round(255*smooth(t-band,t+band,raw[i]/255));
 return boxBlur(erode(out,w,h,clamp(opts.choke|0,0,6)),w,h,clamp(opts.feather|0,0,6))}
// The brush: +1 restores, -1 erases, 0 leaves the model's mask. edits is an Int8Array w×h.
function paintBrush(edits,w,h,cx,cy,r,mode){const v=mode==='restore'?1:mode==='erase'?-1:0,R=Math.max(1,r),r2=R*R;
 for(let y=Math.max(0,Math.floor(cy-R));y<=Math.min(h-1,Math.ceil(cy+R));y++)for(let x=Math.max(0,Math.floor(cx-R));x<=Math.min(w-1,Math.ceil(cx+R));x++){const dx=x-cx,dy=y-cy;if(dx*dx+dy*dy<=r2)edits[y*w+x]=v}return edits}
function applyEdits(mask,edits){if(!edits)return mask;const out=new Uint8Array(mask);for(let i=0;i<out.length;i++)if(edits[i])out[i]=edits[i]>0?255:0;return out}
// «Fondo uniforme»: the free cut-out for photos on a plain backdrop (studio sweep, white or grey sheet), in every
// browser, with no download. The backdrop colour is read per row from the photo's sides (so a gradient is fine, with
// the border median where the product touches a side); background is what is connected to the border and within the
// tolerance, so a backdrop-coloured area inside the product (a white label) stays.
function plainBackgroundMask(rgba,w,h,{tolerance=32}={}){const tol=clamp(+tolerance||32,6,120),N=w*h,med=[0,1,2].map(k=>{const v=[];for(let x=0;x<w;x++){v.push(rgba[x*4+k],rgba[((h-1)*w+x)*4+k])}for(let y=0;y<h;y++){v.push(rgba[(y*w)*4+k],rgba[(y*w+w-1)*4+k])}v.sort((a,b)=>a-b);return v[v.length>>1]});
 const ref=new Float32Array(h*3),dist=(i,r,g,b)=>Math.hypot(rgba[i*4]-r,rgba[i*4+1]-g,rgba[i*4+2]-b);
 for(let y=0;y<h;y++){let r=0,g=0,b=0,n=0;for(const x of [0,1,w-2,w-1]){if(x<0||x>=w)continue;const i=y*w+x;if(dist(i,...med)>tol*3)continue;r+=rgba[i*4];g+=rgba[i*4+1];b+=rgba[i*4+2];n++}
  ref.set(n?[r/n,g/n,b/n]:med,y*3)}
 const bg=new Uint8Array(N),queue=new Int32Array(N);let qh=0,qt=0;const like=i=>{const y=(i/w)|0;return dist(i,ref[y*3],ref[y*3+1],ref[y*3+2])<=tol};
 const seed=i=>{if(!bg[i]&&like(i)){bg[i]=1;queue[qt++]=i}};for(let x=0;x<w;x++){seed(x);seed((h-1)*w+x)}for(let y=0;y<h;y++){seed(y*w);seed(y*w+w-1)}
 while(qh<qt){const i=queue[qh++],x=i%w;if(x>0)seed(i-1);if(x<w-1)seed(i+1);if(i>=w)seed(i-w);if(i<N-w)seed(i+w)}
 const out=new Uint8Array(N);for(let i=0;i<N;i++)out[i]=bg[i]?0:255;return out}
function bbox(alpha,w,h,cut=24){let x0=w,y0=h,x1=-1,y1=-1;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(alpha[y*w+x]>=cut){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}
 return x1<0?null:{x:x0,y:y0,w:x1-x0+1,h:y1-y0+1}}
const coverage=alpha=>{let n=0;for(let i=0;i<alpha.length;i++)if(alpha[i]>=128)n++;return alpha.length?n/alpha.length:0};
// The share of each side of the photo the product touches: a cut-off product touches it a lot.
function borderTouch(alpha,w,h){let n=0;const ok=i=>alpha[i]>=128;for(let x=0;x<w;x++){if(ok(x))n++;if(ok((h-1)*w+x))n++}for(let y=1;y<h-1;y++){if(ok(y*w))n++;if(ok(y*w+w-1))n++}return n/(2*w+2*(h-2))}
// The cut-out: the photo's pixels inside the box, with the mask as alpha. The RGB values are the photo's, untouched.
function cutout(rgba,alpha,w,h,box){const out=new Uint8ClampedArray(box.w*box.h*4);
 for(let y=0;y<box.h;y++)for(let x=0;x<box.w;x++){const s=(box.y+y)*w+box.x+x,d=(y*box.w+x)*4;out[d]=rgba[s*4];out[d+1]=rgba[s*4+1];out[d+2]=rgba[s*4+2];out[d+3]=alpha[s]}
 return {w:box.w,h:box.h,data:out}}

// ---- layout ----
// The product box scaled to fill `fill` of the frame on its long relative side, placed at (x,y) ∈ [0,1] of the free space.
function fitRect(box,W,H,{fill=FILL_MIN,x=.5,y=.5}={}){const f=clamp(+fill||FILL_MIN,.1,.98),s=Math.min(W*f/box.w,H*f/box.h),w=Math.max(1,Math.round(box.w*s)),h=Math.max(1,Math.round(box.h*s));
 return {x:Math.round((W-w)*clamp(x,0,1)),y:Math.round((H-h)*clamp(y,0,1)),w,h,scale:s}}
const fillRatio=(rect,W,H)=>Math.max(rect.w/W,rect.h/H);
// Cover: the source rectangle of an image of sw×sh that fills W×H without distortion (centred crop).
function coverRect(sw,sh,W,H){const s=Math.max(W/sw,H/sh),w=W/s,h=H/s;return {sx:(sw-w)/2,sy:(sh-h)/2,sw:w,sh:h}}

// ---- pixels ----
// Resample straight-alpha RGBA: box average when shrinking, bilinear when enlarging, in premultiplied alpha so the
// edge never picks up the colour of the removed background. Fully opaque pixels at scale 1 come back identical.
function scaleRGBA(src,sw,sh,dw,dh){if(sw===dw&&sh===dh)return new Uint8ClampedArray(src);const out=new Uint8ClampedArray(dw*dh*4);
 if(dw<=sw&&dh<=sh){const xs=new Int32Array(dw+1),ys=new Int32Array(dh+1);for(let i=0;i<=dw;i++)xs[i]=Math.min(sw,Math.floor(i*sw/dw));for(let i=0;i<=dh;i++)ys[i]=Math.min(sh,Math.floor(i*sh/dh));
  for(let y=0;y<dh;y++){const y0=ys[y],y1=Math.max(y0+1,ys[y+1]);for(let x=0;x<dw;x++){const x0=xs[x],x1=Math.max(x0+1,xs[x+1]);let r=0,g=0,b=0,a=0,n=0;
   for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++){const i=(yy*sw+xx)*4,al=src[i+3];r+=src[i]*al;g+=src[i+1]*al;b+=src[i+2]*al;a+=al;n++}
   const d=(y*dw+x)*4;if(a>0){out[d]=r/a;out[d+1]=g/a;out[d+2]=b/a}out[d+3]=a/n}}return out}
 for(let y=0;y<dh;y++){const fy=clamp((y+.5)*sh/dh-.5,0,sh-1),y0=Math.floor(fy),y1=Math.min(sh-1,y0+1),ty=fy-y0;
  for(let x=0;x<dw;x++){const fx=clamp((x+.5)*sw/dw-.5,0,sw-1),x0=Math.floor(fx),x1=Math.min(sw-1,x0+1),tx=fx-x0;let r=0,g=0,b=0,a=0;
   for(const [xx,yy,wt] of [[x0,y0,(1-tx)*(1-ty)],[x1,y0,tx*(1-ty)],[x0,y1,(1-tx)*ty],[x1,y1,tx*ty]]){const i=(yy*sw+xx)*4,al=src[i+3]*wt;r+=src[i]*al;g+=src[i+1]*al;b+=src[i+2]*al;a+=al}
   const d=(y*dw+x)*4;if(a>0){out[d]=r/a;out[d+1]=g/a;out[d+2]=b/a}out[d+3]=a}}return out}
const hexRgb=h=>{const m=/^#?([0-9a-f]{6})$/i.exec(String(h||''));const n=m?parseInt(m[1],16):0xffffff;return [n>>16&255,n>>8&255,n&255]};
// The soft contact shadow under the product: an ellipse at its base, darker in the middle.
function drawShadow(out,W,H,rect,opacity){const op=clamp(+opacity||0,0,.6);if(!op)return out;
 const cx=rect.x+rect.w/2,ry=Math.max(3,rect.h*.045),cy=rect.y+rect.h-ry*.4,rx=rect.w*.42;
 for(let y=Math.max(2,Math.floor(cy-ry*1.6));y<=Math.min(H-3,Math.ceil(cy+ry*1.6));y++)for(let x=Math.max(2,Math.floor(cx-rx*1.3));x<=Math.min(W-3,Math.ceil(cx+rx*1.3));x++){
  const dx=(x-cx)/rx,dy=(y-cy)/ry,d=dx*dx+dy*dy;if(d>2.6)continue;const k=1-op*Math.exp(-d*2.2),i=(y*W+x)*4;out[i]*=k;out[i+1]*=k;out[i+2]*=k}
 return out}
// Light colour match: gentle per-channel gains from the scene around the product (±8% colour, ±10% brightness).
// strength 0 = the product exactly as photographed.
function toneGains(bg,W,H,rect,strength){const s=clamp(+strength||0,0,1);if(!s)return [1,1,1];const pad=Math.round(Math.max(rect.w,rect.h)*.2);let r=0,g=0,b=0,n=0;
 for(let y=Math.max(0,rect.y-pad);y<Math.min(H,rect.y+rect.h+pad);y+=3)for(let x=Math.max(0,rect.x-pad);x<Math.min(W,rect.x+rect.w+pad);x+=3){if(x>=rect.x&&x<rect.x+rect.w&&y>=rect.y&&y<rect.y+rect.h)continue;const i=(y*W+x)*4;r+=bg[i];g+=bg[i+1];b+=bg[i+2];n++}
 if(!n)return [1,1,1];r/=n;g/=n;b/=n;const lum=(r+g+b)/3||1,bright=clamp(1+s*(lum-140)/140*.15,.9,1.1);
 return [r,g,b].map(c=>+(clamp(1+s*(c/lum-1)*.6,.92,1.08)*bright).toFixed(4))}
// The final picture: background (colour or scene pixels W×H), optional shadow, the product (already scaled to rect.w×rect.h)
// blended on top. Where the product is opaque and the tone is 0, its pixels are copied exactly.
function composite({W,H,bg,fg,rect,shadow=0,tone=0}){const out=new Uint8ClampedArray(W*H*4);
 if(bg&&bg.data){out.set(bg.data)}else{const [r,g,b]=hexRgb(bg&&bg.color||'#FFFFFF');for(let i=0;i<out.length;i+=4){out[i]=r;out[i+1]=g;out[i+2]=b;out[i+3]=255}}
 const gains=bg&&bg.data?toneGains(bg.data,W,H,rect,tone):[1,1,1];
 if(shadow)drawShadow(out,W,H,rect,shadow);
 if(fg)for(let y=0;y<rect.h;y++){const oy=rect.y+y;if(oy<0||oy>=H)continue;for(let x=0;x<rect.w;x++){const ox=rect.x+x;if(ox<0||ox>=W)continue;const s=(y*rect.w+x)*4,a=fg.data[s+3];if(!a)continue;const d=(oy*W+ox)*4;
  if(a===255){out[d]=fg.data[s]*gains[0];out[d+1]=fg.data[s+1]*gains[1];out[d+2]=fg.data[s+2]*gains[2]}
  else{const t=a/255;out[d]=fg.data[s]*gains[0]*t+out[d]*(1-t);out[d+1]=fg.data[s+1]*gains[1]*t+out[d+1]*(1-t);out[d+2]=fg.data[s+2]*gains[2]*t+out[d+2]*(1-t)}}}
 return out}
// The whole render for one product: the settings decide the rect, the background and the blend.
function render(item,{W,H,bg,fill,x,y,shadow,tone}){const c=item.cut,rect=fitRect({w:c.w,h:c.h},W,H,{fill,x,y});
 return {rect,data:composite({W,H,bg,fg:{data:scaleRGBA(c.data,c.w,c.h,rect.w,rect.h)},rect,shadow,tone})}}

// ---- checks (deterministic) ----
// Every pixel of the outer ring (default 2 px) exactly 255,255,255.
function whiteBorder(data,W,H,ring=2){let off=0,n=0;const chk=(x,y)=>{const i=(y*W+x)*4;n++;if(data[i]!==255||data[i+1]!==255||data[i+2]!==255)off++};
 for(let k=0;k<ring;k++){for(let x=0;x<W;x++){chk(x,k);chk(x,H-1-k)}for(let y=ring;y<H-ring;y++){chk(k,y);chk(W-1-k,y)}}return {ok:off===0,off,checked:n}}
// Halo: edge pixels kept fully opaque that look like the removed background (closer to it than to the product just
// inside). Half-transparent edge pixels are a normal blend and are not counted.
function haloScore(rgba,alpha,w,h){let br=0,bg=0,bb=0,bn=0;for(let i=0;i<alpha.length;i+=7)if(alpha[i]<16){br+=rgba[i*4];bg+=rgba[i*4+1];bb+=rgba[i*4+2];bn++}
 if(bn<20)return {score:0,edge:0};br/=bn;bg/=bn;bb/=bn;
 const dist=(i,r,g,b)=>Math.hypot(rgba[i*4]-r,rgba[i*4+1]-g,rgba[i*4+2]-b),D=[[1,0],[-1,0],[0,1],[0,-1]];let edge=0,halo=0;
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;if(alpha[i]<128)continue;const d=D.find(([dx,dy])=>alpha[i+dy*w+dx]<128);if(!d)continue;
  const ix=x-d[0]*3,iy=y-d[1]*3;if(ix<0||iy<0||ix>=w||iy>=h)continue;const j=iy*w+ix;if(alpha[j]<200)continue;edge++;
  const toBg=dist(i,br,bg,bb),inner=[rgba[j*4],rgba[j*4+1],rgba[j*4+2]],toIn=dist(i,...inner),innerBg=Math.hypot(inner[0]-br,inner[1]-bg,inner[2]-bb);
  if(alpha[i]>=230&&innerBg>40&&toBg<toIn&&toBg<50)halo++}
 return {score:edge?halo/edge:0,edge}}
const LEVELS={ok:0,warn:1,fail:2};
// One product, one output: the list of checks with plain-Italian messages. out: {data,W,H}, a render of the output
// (full size or a preview with the same layout) for the white border; W,H: the output format.
function qualityChecks({photo,alpha,cutBox,rect,W,H,bgKind,useId,out,halo}){const list=[],add=(id,label,level,msg)=>list.push({id,label,level,msg});
 const cov=coverage(alpha);
 if(!cutBox||cov<.01)add('coverage','Scontorno','fail','Non trovo il prodotto nella foto: ripristina con il pennello o usa una foto con il prodotto più grande.');
 else if(cov>.95)add('coverage','Scontorno','fail','Lo sfondo non è stato tolto: la maschera copre quasi tutta la foto.');
 else if(cov>.85)add('coverage','Scontorno','warn','La maschera copre il '+Math.round(cov*100)+'% della foto: controlla che lo sfondo sia stato tolto.');
 else if(cov<.03)add('coverage','Scontorno','warn','Il prodotto occupa solo il '+(cov*100).toFixed(1)+'% della foto: controlla che sia tutto.');
 else add('coverage','Scontorno','ok','Maschera plausibile: '+Math.round(cov*100)+'% della foto.');
 const touch=photo?borderTouch(alpha,photo.w,photo.h):0;if(touch>.08)add('cropped','Prodotto intero','warn','Il prodotto tocca il bordo della foto: potrebbe essere tagliato.');
 if(rect&&cutBox){const f=fillRatio(rect,W,H);
  if(bgKind==='white'&&useId==='shop')add('fill','Occupazione ≥ 85%',f>=FILL_MIN-.001?'ok':'fail',f>=FILL_MIN-.001?'Il prodotto occupa il '+Math.round(f*100)+'% dell’inquadratura.':'Il prodotto occupa solo il '+Math.round(f*100)+'%: per Amazon serve almeno l’85%.');
  else add('fill','Occupazione','ok','Il prodotto occupa il '+Math.round(f*100)+'% dell’inquadratura.');
  const up=rect.scale;add('resolution','Risoluzione',up>2?'fail':up>1.15?'warn':'ok',up>1.15?'Il prodotto viene ingrandito '+up.toFixed(1)+' volte: per una foto nitida serve una foto con il prodotto di almeno '+Math.max(rect.w,rect.h)+' px.':'Nessun ingrandimento oltre la foto originale.');
  const ar=cutBox.w/cutBox.h,ar2=rect.w/rect.h;add('shape','Forma originale',Math.abs(ar-ar2)/ar<.02?'ok':'fail',Math.abs(ar-ar2)/ar<.02?'Proporzioni identiche alla foto: niente deformazioni.':'Le proporzioni non corrispondono alla foto.')}
 if(Math.max(W,H)<MIN_LONG_SIDE)add('size','Lato lungo ≥ 1000 px','fail','Il formato ha il lato lungo sotto i 1000 px: lo zoom di Amazon non funziona.');
 if(out&&out.data&&bgKind==='white'){const wb=whiteBorder(out.data,out.W||W,out.H||H);add('white','Fondo #FFFFFF',wb.ok?'ok':'fail',wb.ok?'Bordo esattamente bianco puro (255,255,255).':wb.off+' pixel del bordo non sono bianco puro.')}
 if(halo&&halo.edge>20)add('halo','Bordi puliti',halo.score>.3?'warn':'ok',halo.score>.3?'Alone dello sfondo sul '+Math.round(halo.score*100)+'% del bordo: alza la soglia o restringi il bordo di 1–2 px.':'Nessun alone visibile sui bordi.');
 return list}
const worst=list=>(list||[]).reduce((m,c)=>LEVELS[c.level]>LEVELS[m]?c.level:m,'ok');

// ---- names, record, saving ----
const slug=s=>str(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50);
function fileName(name,i,{formatId,bg,typeId,scene}={}){const f=format(formatId);return (slug(String(name||'').replace(/\.[a-z0-9]+$/i,''))||'prodotto-'+(i+1))+'-'+(bg==='scene'?'ambientata'+(scene?'-'+slug(scene):''):bg==='brand'?'colore':'bianco')+'-'+f.w+'x'+f.h+'.'+type(typeId).id}
const stamp=at=>String(at).replace(/[^0-9]/g,'').slice(0,14);
function savedRecord(m,{by,at=new Date().toISOString()}={}){const f=format(m.formatId);
 return {id:'fp-'+stamp(at),at,by:str(by)||'',use:use(m.useId).id,background:m.bg,format:{id:f.id,w:f.w,h:f.h},type:type(m.typeId).id,
  scene:m.scene?{label:str(m.scene.label),prompt:str(m.scene.prompt).slice(0,PROMPT_MAX)}:null,settings:{fill:+(+m.fill).toFixed(3),x:+(+m.x).toFixed(3),y:+(+m.y).toFixed(3),shadow:+(+m.shadow||0).toFixed(2),tone:+(+m.tone||0).toFixed(2),color:m.bg==='brand'?str(m.color):''},
  products:(m.products||[]).slice(0,MAX_PRODUCTS).map(p=>({name:str(p.name).slice(0,120),file:str(p.file),url:str(p.url),checks:(p.checks||[]).map(c=>({id:c.id,level:c.level}))}))}}
function readStore(doc){const s=doc&&doc.productPhotos;return s&&Array.isArray(s.items)?{schemaVersion:1,items:s.items}:{schemaVersion:1,items:[]}}
function addRecord(store,rec){const s=readStore({productPhotos:store});return {schemaVersion:1,items:s.items.filter(x=>x.id!==rec.id).concat([rec]).slice(-MAX_SAVED)}}
async function saveToProject(ws,projectId,rec){if(!ws||typeof ws.bind!=='function')throw Error('Archivio del progetto non disponibile.');const d=ws.bind(projectId,'agents');
 for(let i=0;i<3;i++){const cur=(await d.load())||{},next=addRecord(readStore(cur),rec);
  try{await d.save({...cur,schemaVersion:1,conversations:cur.conversations||{},productPhotos:next});return next}catch(e){if(!(ws.ConflictError&&e instanceof ws.ConflictError)||i===2)throw e}}}
// One image in the project's media archive (PNG or JPEG data URL, at most ~3 MB): returns its signed URL.
async function uploadImage({projectId,contentId,slot,dataUrl},fetchImpl){const f=fetchImpl||root.fetch;
 const r=await f('/api/workspace?resource=media',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({projectId,contentId,slot,dataUrl})});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Immagine non salvata');return d.url}

// ---- the widget (browser) ----
let counter=0;
const dom=()=>root.document;
const el=(tag,text,cls)=>{const x=dom().createElement(tag);if(text!=null)x.textContent=text;if(cls)x.className=cls;return x};
const button=(text,cls)=>{const b=el('button',text,cls||'');b.type='button';return b};
const canvasOf=(w,h)=>{const c=el('canvas');c.width=w;c.height=h;return c};
function toCanvas(data,w,h){const c=canvasOf(w,h),x=c.getContext('2d'),img=x.createImageData(w,h);img.data.set(data);x.putImageData(img,0,0);return c}
const blobOf=(c,mime,q)=>new Promise((ok,ko)=>c.toBlob(b=>b?ok(b):ko(Error('Export non riuscito')),mime,q));
function download(name,blob){const a=el('a');a.href=root.URL.createObjectURL(blob);a.download=name;dom().body.append(a);a.click();a.remove();setTimeout(()=>root.URL.revokeObjectURL(a.href),4000)}
function loadImg(src){return new Promise((ok,ko)=>{const i=new root.Image();i.onload=()=>ok(i);i.onerror=()=>ko(Error('Immagine non leggibile'));i.src=src})}
// A photo file → its pixels, at most MAX_SIDE px on the long side (EXIF orientation applied by the browser).
async function readPhoto(file){let src;try{src=root.createImageBitmap?await root.createImageBitmap(file,{imageOrientation:'from-image'}):null}catch(e){src=null}
 if(!src){const u=root.URL.createObjectURL(file);try{src=await loadImg(u)}finally{setTimeout(()=>root.URL.revokeObjectURL(u),2000)}}
 const sw=src.width||src.naturalWidth,sh=src.height||src.naturalHeight,s=Math.min(1,MAX_SIDE/Math.max(sw,sh)),w=Math.max(1,Math.round(sw*s)),h=Math.max(1,Math.round(sh*s));
 const c=canvasOf(w,h),x=c.getContext('2d');x.imageSmoothingQuality='high';x.drawImage(src,0,0,w,h);return {canvas:c,w,h,data:x.getImageData(0,0,w,h).data}}
// ctx: {project, profile, projectName, projectId, workspace, by, segmenter}
function productPhotoStudio(ctx={}){const n=++counter,brand=brandOf(ctx.project,ctx.profile);
 const st={useId:'shop',bg:'white',formatId:'sq2000',typeId:'jpg',fill:.85,x:.5,y:.5,shadow:0,tone:.35,color:brand.light||'#F3F1EC',answers:{},refs:[],items:[],active:-1,scenes:[],scene:-1,brush:'off',size:24,busy:false,sceneCache:new Map()};
 const wrap=el('div',undefined,'tool photo-studio pf-studio product-photo-studio');
 const steps=el('ol',undefined,'ps-steps');['Foto e uso','Scontorno','Sfondo','Controlli ed export'].forEach((t,i)=>{const li=el('li',(i+1)+' · '+t);li.dataset.step=String(i+1);steps.append(li)});
 const setStep=k=>[...steps.children].forEach(li=>li.dataset.state=+li.dataset.step<k?'done':+li.dataset.step===k?'current':'todo');
 const note=el('p','Il prodotto resta la tua foto vera: lo scontorno avviene sul tuo computer, gratis, e l’AI disegna al massimo lo sfondo. Forma, colori ed etichette non cambiano.','pf-note');
 const status=el('p','','tool-status');status.setAttribute('role','status');
 const say=t=>{status.textContent=t||''};
 // 1 · photos and use
 const qCard=el('section',undefined,'pf-card fp-questions'),qHead=el('div',undefined,'pf-card-head');qHead.append(el('h4','Le foto e l’uso'),el('p','Fino a '+MAX_PRODUCTS+' foto dello stesso lotto: stesso sfondo e stesso formato per tutte.','muted'));
 const inp=el('input');inp.type='file';inp.multiple=true;inp.accept='image/jpeg,image/png,image/webp';
 const drop=el('label',undefined,'pf-drop'),dt=el('span',undefined,'pf-drop-text');dt.append(el('strong','Carica le foto del prodotto'),el('small','JPG, PNG o WebP · anche in blocco · meglio con il prodotto intero e ben illuminato'));drop.append(inp,dt);
 const thumbs=el('div',undefined,'fp-thumbs');
 const chips=(name,list,get,set,cls)=>{const fs=el('fieldset',undefined,'fp-chips '+(cls||''));fs.append(el('legend',name));
  list.forEach(o=>{const lab=el('label',undefined,'ps-chip ad-tile pf-tile'),r=el('input');r.type='radio';r.name='fp-'+cls+'-'+n;r.value=o.id;r.checked=get()===o.id;r.onchange=()=>{set(o.id);sync()};
   const t=el('span',undefined,'ad-tile-text');t.append(el('strong',o.label),el('small',o.sub||''));lab.append(r,t);fs.append(lab)});return fs};
 const useFs=chips('Uso',USES,()=>st.useId,v=>{const u=use(v);st.useId=v;st.bg=u.bg;st.formatId=u.format;st.fill=u.fill;st.shadow=u.shadow?(u.bg==='scene'?.32:.18):0;st.y=u.bg==='scene'?.82:.5;st.x=.5;refreshChoices()},'use');
 let bgFs,fmtFs;
 const typeSel=el('select');TYPES.forEach(t=>{const o=el('option',t.label);o.value=t.id;typeSel.append(o)});typeSel.value=st.typeId;typeSel.onchange=()=>{st.typeId=typeSel.value;renderExport()};
 const typeL=el('label',undefined,'pf-field fp-type');typeL.append(el('span','File'),typeSel);
 const colorIn=el('input');colorIn.type='color';colorIn.value=st.color;colorIn.oninput=()=>{st.color=colorIn.value;redraw()};
 const colorL=el('label',undefined,'pf-field fp-color');colorL.append(el('span','Colore di fondo · '+brand.label),colorIn);
 const choiceBox=el('div',undefined,'fp-choices');
 function refreshChoices(){bgFs=chips('Sfondo',BACKGROUNDS,()=>st.bg,v=>{st.bg=v;if(v==='scene'&&st.fill>.75)st.fill=.6;if(v==='scene'){st.y=.82;if(!st.shadow)st.shadow=.32}else st.y=.5;if(v==='white'&&st.useId==='shop')st.fill=Math.max(st.fill,FILL_MIN)},'bg');
  fmtFs=chips('Formato',FORMATS,()=>st.formatId,v=>{st.formatId=v;st.sceneCache.clear()},'format');
  choiceBox.replaceChildren(useFs,bgFs,fmtFs);[...useFs.querySelectorAll('input')].forEach(r=>r.checked=r.value===st.useId)}
 refreshChoices();
 const extras=el('div',undefined,'fp-extras');extras.append(typeL,colorL);
 qCard.append(qHead,drop,thumbs,choiceBox,extras);
 // 2 · cut-out
 const cutCard=el('section',undefined,'pf-card fp-cut'),cutHead=el('div',undefined,'pf-card-head');
 const seg=segLib(),sizes=seg&&seg.plan?seg.plan():{mb:115};
 const gpu=!!(seg&&seg.hasGpu&&seg.hasGpu())||!!ctx.segmenter;st.method=gpu?'model':'plain';
 const methodNote=el('p','','muted fp-method-note');
 const methods=el('div',undefined,'ad-seg pf-seg fp-method');methods.setAttribute('role','group');methods.setAttribute('aria-label','Metodo di scontorno');
 const METHODS=[['model','Modello AI'],['plain','Fondo uniforme']];
 const setMethod=m=>{st.method=m;[...methods.children].forEach((b,i)=>b.setAttribute('aria-pressed',String(METHODS[i][0]===m)));
  methodNote.textContent=m==='model'?(gpu?'Gratis e privato: la prima volta scarico il modello di scontorno open source (circa '+sizes.mb+' MB, poi resta nel browser). Funziona con qualsiasi sfondo.':(seg&&seg.NO_GPU)||'Questo browser non ha WebGPU.'):'Per foto su fondo tinta unita (bianco, grigio, telo): immediato, senza download. Regola la tolleranza se resta un po’ di fondo.'};
 METHODS.forEach(([m,t])=>{const b=button(t);b.onclick=()=>setMethod(m);methods.append(b)});setMethod(st.method);
 cutHead.append(el('h4','Scontorno nel browser'),methods,methodNote);
 const cutGo=button('Scontorna le foto','primary'),cutBar=el('div',undefined,'ps-actions pf-go');cutBar.append(cutGo,el('span','Nessun credito: fa tutto il tuo computer.','muted'));
 const prog=el('div',undefined,'fp-progress'),progBar=el('progress');progBar.max=1;progBar.value=0;const progText=el('span','','muted');prog.append(progBar,progText);prog.hidden=true;
 const editor=el('div',undefined,'fp-editor');editor.hidden=true;
 const lic=el('p',undefined,'fp-license muted');(seg&&seg.LICENSES||[]).forEach((l,i)=>{if(i)lic.append(' · ');const a=el('a',l.part+' ('+l.license+')');a.href=l.url;a.target='_blank';a.rel='noopener noreferrer';lic.append(a)});
 cutCard.append(cutHead,cutBar,prog,editor,lic);
 // 3 · background
 const bgCard=el('section',undefined,'pf-card fp-bg');
 // 4 · checks and export
 const expCard=el('section',undefined,'pf-card fp-export');expCard.hidden=true;
 wrap.append(steps,note,qCard,cutCard,bgCard,status,expCard);setStep(1);
 const ready=()=>st.items.filter(it=>it.cut);
 function sync(){thumbsRender();renderBg();renderExport();setStep(!st.items.length?1:!ready().length?2:st.bg==='scene'&&st.scene<0?3:4)}
 // --- photos ---
 inp.onchange=async()=>{const files=[...(inp.files||[])].filter(f=>/^image\/(jpeg|png|webp)$/.test(f.type||''));if(!files.length){say('Scegli foto JPG, PNG o WebP.');return}
  const room=MAX_PRODUCTS-st.items.length;if(files.length>room)say('Tengo le prime '+room+' foto: al massimo '+MAX_PRODUCTS+' per lotto.');
  for(const f of files.slice(0,Math.max(0,room))){try{const photo=await readPhoto(f);st.items.push({id:'p'+Date.now()+Math.random().toString(16).slice(2,6),name:f.name,photo,raw:null,edits:null,refine:{...REFINE_DEFAULT},alpha:null,box:null,cut:null,halo:null,state:'todo'})}catch(e){say('«'+f.name+'» non si legge: '+e.message)}}
  if(st.active<0&&st.items.length)st.active=0;inp.value='';sync()};
 function thumbsRender(){thumbs.replaceChildren(...st.items.map((it,i)=>{const b=button('','fp-thumb');b.setAttribute('aria-pressed',String(i===st.active));b.setAttribute('aria-label','Foto '+(i+1)+': '+it.name);
  const c=it.thumb||(it.thumb=(()=>{const s=96/Math.max(it.photo.w,it.photo.h),c=canvasOf(Math.max(1,Math.round(it.photo.w*s)),Math.max(1,Math.round(it.photo.h*s)));c.getContext('2d').drawImage(it.photo.canvas,0,0,c.width,c.height);return c})());
  const img=el('img');img.alt='';try{img.src=it.thumbUrl||(it.thumbUrl=c.toDataURL('image/jpeg',.7))}catch(e){}
  b.append(img,el('small',it.state==='ok'?'Scontornata':it.state==='busy'?'In corso…':it.state==='error'?'Da rifare':'Da scontornare'));b.dataset.state=it.state;
  b.onclick=()=>{st.active=i;sync();renderEditor()};
  const x=button('×','fp-thumb-x');x.setAttribute('aria-label','Togli '+it.name);x.onclick=e=>{e.stopPropagation&&e.stopPropagation();st.items.splice(i,1);st.active=Math.min(st.active,st.items.length-1);sync();renderEditor()};
  const w=el('div',undefined,'fp-thumb-wrap');w.append(b,x);return w}));
  cutGo.disabled=st.busy||!st.items.some(it=>!it.cut);const left=st.items.filter(it=>!it.cut).length;cutGo.textContent=!st.items.length?'Scontorna le foto':left?'Scontorna '+left+' foto':'Tutte scontornate ✓'}
 // --- segmentation ---
 cutGo.onclick=async()=>{const todo=st.items.filter(it=>!it.cut);if(!todo.length)return;
  if(st.method==='plain'){todo.forEach(it=>{it.refine.tolerance=it.refine.tolerance||32;it.method='plain';it.raw=plainBackgroundMask(it.photo.data,it.photo.w,it.photo.h,{tolerance:it.refine.tolerance});it.state='ok';updateCut(it)});
   say('Scontorno «Fondo uniforme» fatto: controlla i bordi e, se serve, usa il pennello.');if(st.active<0)st.active=0;sync();renderEditor();return}
  const S=ctx.segmenter||segLib();if(!S){say('Il modulo di scontorno non si è caricato: ricarica la pagina.');return}
  st.busy=true;cutGo.disabled=true;prog.hidden=false;progBar.removeAttribute('value');progText.textContent='Preparo il modello di scontorno…';
  try{await S.load({onProgress:p=>{if(p.ready){progBar.value=1;progText.textContent='Modello pronto.';return}if(p.total){progBar.value=p.ratio;progText.textContent='Scarico il modello: '+Math.round(p.loaded/1048576)+' di '+Math.round(p.total/1048576)+' MB'}}})}
  catch(e){st.busy=false;prog.hidden=true;if(e&&e.noGpu){setMethod('plain');say(e.message)}else say('Il modello di scontorno non si scarica: '+e.message+'. Controlla la connessione e riprova.');thumbsRender();return}
  let i=0;for(const it of todo){i++;it.state='busy';thumbsRender();progText.textContent='Scontorno '+i+' di '+todo.length+'…';progBar.value=(i-1)/todo.length;
   try{const m=await S.segment(it.photo.canvas);if(m.width!==it.photo.w||m.height!==it.photo.h)throw Error('maschera di misura diversa');it.raw=m.data;it.method='model';it.state='ok';updateCut(it)}catch(e){it.state='error';say('«'+it.name+'»: scontorno non riuscito ('+e.message+').')}}
  progBar.value=1;progText.textContent='Scontorno fatto: '+st.items.filter(x=>x.cut).length+' di '+st.items.length+'.';st.busy=false;if(st.active<0)st.active=0;sync();renderEditor()};
 function updateCut(it){const {w,h,data}=it.photo;it.alpha=applyEdits(refineMask(it.raw,w,h,it.refine),it.edits);it.box=bbox(it.alpha,w,h);it.cut=it.box?cutout(data,it.alpha,w,h,it.box):null;it.halo=haloScore(data,it.alpha,w,h);it.prev=null}
 // --- the editor: edge sliders and the brush, on the active photo ---
 function slider(label,min,max,step,get,set,fmt){const l=el('label',undefined,'pf-field fp-slider'),i=el('input'),v=el('output');i.type='range';i.min=min;i.max=max;i.step=step;i.value=get();v.textContent=fmt(get());
  i.oninput=()=>{set(+i.value);v.textContent=fmt(+i.value)};const top=el('span');top.append(el('span',label),v);l.append(top,i);return l}
 let raf=0;const later=f=>{if(raf)return;raf=(root.requestAnimationFrame||setTimeout)(()=>{raf=0;f()})};
 function renderEditor(){const it=st.items[st.active];if(!it||!it.raw){editor.hidden=true;return}editor.hidden=false;
  const D=Math.min(1,560/Math.max(it.photo.w,it.photo.h)),cw=Math.max(1,Math.round(it.photo.w*D)),ch=Math.max(1,Math.round(it.photo.h*D)),view=canvasOf(cw,ch);view.className='fp-mask-view';
  const small=canvasOf(cw,ch);small.getContext('2d').drawImage(it.photo.canvas,0,0,cw,ch);const px=small.getContext('2d').getImageData(0,0,cw,ch).data;
  const paint=()=>{const out=new Uint8ClampedArray(cw*ch*4);for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){const a=it.alpha[Math.min(it.photo.h-1,Math.floor(y/D))*it.photo.w+Math.min(it.photo.w-1,Math.floor(x/D))]/255,d=(y*cw+x)*4,chk=((x>>3)+(y>>3))&1?236:252;
    const ghost=st.brush==='restore'?.28:.1;for(let k=0;k<3;k++)out[d+k]=px[d+k]*Math.max(a,ghost)+chk*(1-Math.max(a,ghost));out[d+3]=255}
   const c=view.getContext('2d'),img=c.createImageData(cw,ch);img.data.set(out);c.putImageData(img,0,0)};
  paint();
  const refresh=()=>later(()=>{updateCut(it);paint();redraw()});
  const s1=slider('Soglia del bordo',.2,.8,.02,()=>it.refine.threshold,v=>{it.refine.threshold=v;refresh()},v=>Math.round(v*100)+'%');
  const s2=slider('Sfumatura',0,4,1,()=>it.refine.feather,v=>{it.refine.feather=v;refresh()},v=>v+' px');
  const s3=slider('Restringi il bordo',0,4,1,()=>it.refine.choke,v=>{it.refine.choke=v;refresh()},v=>v+' px');
  const s0=it.method==='plain'?slider('Tolleranza del fondo',8,90,2,()=>it.refine.tolerance||32,v=>{it.refine.tolerance=v;later(()=>{it.raw=plainBackgroundMask(it.photo.data,it.photo.w,it.photo.h,{tolerance:v});updateCut(it);paint();redraw()})},v=>String(v)):null;
  const modes=el('div',undefined,'ad-seg pf-seg fp-brush');modes.setAttribute('role','group');modes.setAttribute('aria-label','Pennello');
  [['off','Sposta'],['erase','Cancella'],['restore','Ripristina']].forEach(([m,t])=>{const b=button(t);b.setAttribute('aria-pressed',String(st.brush===m));b.onclick=()=>{st.brush=m;[...modes.children].forEach(x=>x.setAttribute('aria-pressed',String(x===b)));view.dataset.brush=m;paint()};modes.append(b)});
  view.dataset.brush=st.brush;
  const s4=slider('Pennello',6,80,2,()=>st.size,v=>{st.size=v},v=>v+' px');
  const reset=button('Annulla i ritocchi','fp-reset');reset.onclick=()=>{it.edits=null;it.refine={...REFINE_DEFAULT};if(it.method==='plain')it.raw=plainBackgroundMask(it.photo.data,it.photo.w,it.photo.h,{tolerance:32});updateCut(it);renderEditor();redraw()};
  let down=false;const at=e=>{const r=view.getBoundingClientRect(),sx=cw/(r.width||cw),sy=ch/(r.height||ch);return [((e.clientX-r.left)*sx)/D,((e.clientY-r.top)*sy)/D]};
  const stroke=e=>{if(st.brush==='off')return;const [x,y]=at(e);it.edits=it.edits||new Int8Array(it.photo.w*it.photo.h);paintBrush(it.edits,it.photo.w,it.photo.h,x,y,st.size/2/D,st.brush);later(()=>{updateCut(it);paint();redraw()})};
  view.addEventListener('pointerdown',e=>{if(st.brush==='off')return;down=true;view.setPointerCapture&&view.setPointerCapture(e.pointerId);stroke(e)});
  view.addEventListener('pointermove',e=>{if(down)stroke(e)});['pointerup','pointercancel','pointerleave'].forEach(t=>view.addEventListener(t,()=>{down=false}));
  const tools=el('div',undefined,'fp-tools');tools.append(el('h5','Rifinisci il bordo'),...(s0?[s0]:[]),s1,s2,s3,el('h5','Ritocco a mano'),modes,s4,reset);
  const vw=el('div',undefined,'fp-mask-wrap');vw.append(view,el('small','«'+it.name+'»: a scacchi quello che viene tolto. Con «Ripristina» vedi in trasparenza la foto originale.','muted'));
  editor.replaceChildren(vw,tools)}
 // --- background ---
 const answers=st.answers;
 function sceneBg(i,W,H){const k=i+'|'+W+'x'+H;if(st.sceneCache.has(k))return st.sceneCache.get(k);const sc=st.scenes[i];if(!sc||!sc.img)return null;
  const c=canvasOf(W,H),x=c.getContext('2d'),r=coverRect(sc.img.naturalWidth||sc.img.width,sc.img.naturalHeight||sc.img.height,W,H);x.imageSmoothingQuality='high';x.drawImage(sc.img,r.sx,r.sy,r.sw,r.sh,0,0,W,H);
  const bg={data:x.getImageData(0,0,W,H).data};st.sceneCache.set(k,bg);return bg}
 function bgFor(W,H,sceneIdx){return st.bg==='white'?{color:'#FFFFFF'}:st.bg==='brand'?{color:st.color}:sceneBg(sceneIdx==null?st.scene:sceneIdx,W,H)}
 function settings(W,H,sceneIdx){return {W,H,bg:bgFor(W,H,sceneIdx),fill:st.fill,x:st.x,y:st.y,shadow:st.shadow,tone:st.bg==='scene'?st.tone:0}}
 function preview(it,max,sceneIdx){try{return previewOf(it,max,sceneIdx)}catch(e){return el('p','Anteprima non disponibile: '+e.message,'muted')}}
 function previewOf(it,max,sceneIdx){const f=format(st.formatId),k=max/Math.max(f.w,f.h),W=Math.round(f.w*k),H=Math.round(f.h*k),s=settings(W,H,sceneIdx);
  if(!s.bg)return null;if(!it||!it.cut){const c=toCanvas(composite({W,H,bg:s.bg,fg:null,rect:{x:0,y:0,w:0,h:0}}),W,H);c.className='fp-canvas';return c}
  const c=toCanvas(render(it,s).data,W,H);c.className='fp-canvas';return c}
 const sceneGrid=el('div',undefined,'fp-scenes'),bgView=el('div',undefined,'fp-bg-view'),place=el('div',undefined,'fp-place');
 const sceneForm=el('div',undefined,'fp-scene-form');
 SCENE_QUESTIONS.forEach(q=>{const fs=el('fieldset',undefined,'fp-q');fs.append(el('legend',q.label));q.options.forEach(([label,v],i)=>{const l=el('label',undefined,'ps-chip'),r=el('input');r.type='radio';r.name='fp-'+q.id+'-'+n;r.value=label;r.checked=i===0;r.onchange=()=>{answers[q.id]=label};l.append(r,root.document.createTextNode(' '+(q.id==='stile'&&i===0?label+(brand.source==='default'?' (neutro)':''):label)));fs.append(l)});sceneForm.append(fs)});
 const refIn=el('input');refIn.type='file';refIn.accept='image/jpeg,image/png,image/webp';const refL=el('label',undefined,'pf-field fp-ref');refL.append(el('span','Foto di riferimento dello stile (facoltativa, non del prodotto)'),refIn);
 refIn.onchange=async()=>{const f=refIn.files&&refIn.files[0];st.refs=[];if(!f)return;try{const p=await readPhoto(f),s=Math.min(1,1024/Math.max(p.w,p.h)),c=canvasOf(Math.round(p.w*s),Math.round(p.h*s));c.getContext('2d').drawImage(p.canvas,0,0,c.width,c.height);st.refs=[c.toDataURL('image/jpeg',.85)]}catch(e){say('Riferimento non leggibile: '+e.message)}};
 const sceneGo=button('Genera '+SCENE_COUNT+' sfondi','primary'),sceneBar=el('div',undefined,'ps-actions pf-go');sceneBar.append(sceneGo,el('span',SCENE_COUNT+' generazioni OpenAI: ti chiedo conferma prima.','muted'));
 sceneForm.append(refL,sceneBar);
 sceneGo.onclick=async()=>{if(st.busy)return;const f=format(st.formatId);
  let res;st.busy=true;sceneGo.disabled=true;
  try{res=await generateScenes({prompts:scenePrompts(answers,{brand,fill:st.fill,formatId:st.formatId}),shape:f.shape,references:st.refs,products:st.items.length,request:ctx.imageRequest})}
  catch(e){say(e.message)}finally{st.busy=false;sceneGo.disabled=false}
  if(!res)return;say('Carico gli sfondi…');
  st.scenes=await Promise.all(res.map(async s=>{if(!s.image)return s;try{return {...s,img:await loadImg(s.image)}}catch(e){return {...s,error:e.message}}}));st.scene=-1;st.sceneCache.clear();
  const ok=st.scenes.filter(s=>s.img).length;say(ok?'Scegli lo sfondo: il prodotto è la tua foto vera, appoggiata sopra.':'Nessuno sfondo pronto: '+((st.scenes.find(s=>s.error)||{}).error||'riprova')+'.');sceneGo.textContent='Rigenera '+SCENE_COUNT+' sfondi';sync()};
 function placeControls(){const f=fmt=>Math.round(fmt*100)+'%';
  const min=st.bg==='white'&&st.useId==='shop'?FILL_MIN:.3;
  const parts=[slider('Dimensione del prodotto',min,.95,.01,()=>st.fill,v=>{st.fill=v;later(redraw)},f),slider('Posizione orizzontale',0,1,.01,()=>st.x,v=>{st.x=v;later(redraw)},f),slider('Posizione verticale',0,1,.01,()=>st.y,v=>{st.y=v;later(redraw)},f),
   slider('Ombra di contatto',0,.6,.02,()=>st.shadow,v=>{st.shadow=v;later(redraw)},f)];
  if(st.bg==='scene')parts.push(slider('Adatta la luce',0,1,.05,()=>st.tone,v=>{st.tone=v;later(redraw)},f));
  place.replaceChildren(el('h5','Posizione e luce'),...parts)}
 function redraw(){const it=st.items[st.active]||ready()[0];
  if(st.bg==='scene'){[...sceneGrid.querySelectorAll('.fp-scene')].forEach((card,i)=>{const v=card.querySelector('.fp-scene-view');if(!v)return;const c=preview(it,360,i);if(c)v.replaceChildren(c)})}
  const c=preview(it,560);bgView.replaceChildren(...(c?[c]:[]));renderExportLater()}
 function renderBg(){const head=el('div',undefined,'pf-card-head');
  if(st.bg!=='scene'){head.append(el('h4',st.bg==='white'?'Fondo bianco puro':'Fondo a tinta unita'),el('p',st.bg==='white'?'#FFFFFF esatto, prodotto centrato. Per Amazon: almeno l’85% dell’inquadratura e niente testi aggiunti.':'Il colore viene dal Kit identità: lo puoi cambiare qui sopra.','muted'));
   colorL.hidden=st.bg!=='brand';placeControls();const two=el('div',undefined,'fp-two');two.append(bgView,place);bgCard.replaceChildren(head,two);redraw();return}
  colorL.hidden=true;head.append(el('h4','Ambientazione'),el('p','OpenAI disegna solo lo sfondo vuoto; RADIX ci appoggia la tua foto scontornata, identica, con ombra e luce adattate. Gli sfondi valgono per tutte le foto del lotto.','muted'));
  const parts=[head,sceneForm];
  if(st.scenes.length){sceneGrid.replaceChildren(...st.scenes.map((s,i)=>{const f=el('figure',undefined,'fp-scene ps-card');f.dataset.chosen=String(i===st.scene);const v=el('div',s.error?'Non riuscito: '+s.error:'…','fp-scene-view ps-ph');f.style.setProperty('--ratio',format(st.formatId).w+'/'+format(st.formatId).h);
    f.append(v,el('figcaption',s.label));if(s.img){const b=button(i===st.scene?'Sfondo scelto':'Scegli questo',i===st.scene?'':'primary');b.onclick=()=>{st.scene=i;sync()};f.append(b)}return f}));parts.push(sceneGrid)}
  if(st.scene>=0){placeControls();const two=el('div',undefined,'fp-two');two.append(bgView,place);parts.push(two)}
  bgCard.replaceChildren(...parts);redraw()}
 // --- checks and export ---
 let expRaf=0;function renderExportLater(){if(expRaf)return;expRaf=setTimeout(()=>{expRaf=0;renderExport()},250)}
 function checksFor(it,W,H,out,rect){return qualityChecks({photo:it.photo,alpha:it.alpha,cutBox:it.box,rect,W,H,bgKind:st.bg,useId:st.useId,out,halo:it.halo})}
 function finalRender(it){const f=format(st.formatId),s=settings(f.w,f.h);if(!s.bg)throw Error('Scegli prima lo sfondo.');const r=render(it,s);return {...r,W:f.w,H:f.h,checks:checksFor(it,f.w,f.h,{data:r.data,W:f.w,H:f.h},r.rect)}}
 async function exportBlob(it,typeId){const r=finalRender(it),t=type(typeId||st.typeId);return {blob:await blobOf(toCanvas(r.data,r.W,r.H),t.mime,t.id==='png'?undefined:.92),checks:r.checks,W:r.W,H:r.H,data:r.data}}
 const nameFor=(it,i,typeId)=>fileName(it.name,i,{formatId:st.formatId,bg:st.bg,typeId:typeId||st.typeId,scene:st.scene>=0&&st.scenes[st.scene]?st.scenes[st.scene].label:''});
 function renderExport(){const list=ready();if(!list.length||(st.bg==='scene'&&st.scene<0)){expCard.hidden=true;return}expCard.hidden=false;
  const f=format(st.formatId),head=el('div',undefined,'pf-card-head');head.append(el('h4','Controlli ed export'),el('p',list.length+(list.length===1?' foto':' foto')+' · '+f.w+' × '+f.h+' · '+type(st.typeId).label+'. I controlli sono calcolati sui pixel del file finale.','muted'));
  const rows=list.map(it=>{const i=st.items.indexOf(it),row=el('div',undefined,'fp-row'),k=Math.min(1,400/Math.max(f.w,f.h)),W=Math.round(f.w*k),H=Math.round(f.h*k),s=settings(W,H);
   const r=render(it,s),c=toCanvas(r.data,W,H);c.className='fp-canvas';
   // fill, resolution and shape on the full-size layout; the white border on this preview (same layout math);
   // the export checks the full-size pixels again.
   const checks=checksFor(it,f.w,f.h,{data:r.data,W,H},fitRect({w:it.box.w,h:it.box.h},f.w,f.h,{fill:st.fill,x:st.x,y:st.y}));
   const ul=el('ul',undefined,'fp-checks');checks.forEach(ch=>{const li=el('li',undefined,'fp-check');li.dataset.level=ch.level;li.append(el('strong',ch.label),el('span',ch.msg));ul.append(li)});
   const dl=button('Scarica '+type(st.typeId).label);dl.onclick=async()=>{dl.disabled=true;try{const e=await exportBlob(it);download(nameFor(it,i),e.blob);const bad=e.checks.filter(c=>c.level==='fail');say(bad.length?'Scaricata, ma da sistemare: '+bad.map(c=>c.label).join(', ')+'.':'Scaricata: '+nameFor(it,i)+'.')}catch(e){say('Export non riuscito: '+e.message)}dl.disabled=false};
   const info=el('div',undefined,'fp-row-info');info.append(el('h5',it.name),ul,dl);row.dataset.level=worst(checks);row.append(c,info);return row});
  const acts=el('div',undefined,'ps-actions fp-export-acts'),zipB=button('Scarica tutto (.zip)','primary'),saveB=button('Salva nel progetto'),done=el('span','','muted');
  zipB.onclick=async()=>{const Z=zipLib();if(!Z){say('Archivio zip non disponibile: ricarica la pagina.');return}zipB.disabled=true;say('Preparo lo zip…');
   try{const files=[];for(const it of list){const i=st.items.indexOf(it),e=await exportBlob(it);files.push({name:nameFor(it,i),data:new Uint8Array(await e.blob.arrayBuffer())})}
    download('foto-prodotto-'+f.w+'x'+f.h+'.zip',new root.Blob([Z.zip(files)],{type:'application/zip'}));say('Zip pronto: '+files.length+' foto.')}catch(e){say('Zip non riuscito: '+e.message)}zipB.disabled=false};
  saveB.disabled=!(ctx.workspace&&ctx.projectId);if(saveB.disabled)saveB.title='Apri un progetto per salvare';
  saveB.onclick=async()=>{saveB.disabled=true;done.textContent='Salvo le immagini nel progetto…';const at=new Date().toISOString(),rid='fp-'+stamp(at);
   try{const products=[];let slot=0;for(const it of list){const i=st.items.indexOf(it),e=await exportBlob(it,'jpg'),dataUrl=await new Promise((ok,ko)=>{const r=new root.FileReader();r.onload=()=>ok(r.result);r.onerror=()=>ko(Error('File non leggibile'));r.readAsDataURL(e.blob)});
     const url=await uploadImage({projectId:ctx.projectId,contentId:rid,slot:slot++,dataUrl});products.push({name:it.name,file:nameFor(it,i,'jpg'),url,checks:e.checks})}
    const sc=st.bg==='scene'?st.scenes[st.scene]:null;
    await saveToProject(ctx.workspace,ctx.projectId,{...savedRecord({useId:st.useId,bg:st.bg,formatId:st.formatId,typeId:st.typeId,scene:sc,fill:st.fill,x:st.x,y:st.y,shadow:st.shadow,tone:st.tone,color:st.color,products},{by:ctx.by,at}),id:rid});
    done.textContent='✓ Salvate nel progetto: '+products.length+' foto.'}catch(e){done.textContent='Non salvate: '+e.message}saveB.disabled=false};
  acts.append(zipB,saveB,done);expCard.replaceChildren(head,...rows,acts)}
 thumbsRender();renderBg();
 // for the page's tests and the screenshots: the state, read-only
 wrap.radixState=()=>({items:st.items.length,ready:ready().length,bg:st.bg,formatId:st.formatId,scenes:st.scenes.length,scene:st.scene});
 return wrap}

return Object.freeze({FORMATS,USES,BACKGROUNDS,TYPES,SCENE_QUESTIONS,SCENE_VARIANTS,SCENE_COUNT,MAX_PRODUCTS,MIN_LONG_SIDE,FILL_MIN,REFINE_DEFAULT,
 brandOf,scenePrompts,sceneConfirm,generateScenes,plainBackgroundMask,refineMask,paintBrush,applyEdits,bbox,coverage,borderTouch,cutout,fitRect,fillRatio,coverRect,scaleRGBA,drawShadow,toneGains,composite,render,
 whiteBorder,haloScore,qualityChecks,worst,fileName,savedRecord,readStore,addRecord,saveToProject,uploadImage,productPhotoStudio});
});
