/* Studio «Fotoritocco» (agency job I3, the free part): light and colour of the client's own photos, one or up to 50 at
   once, in the browser, with NO AI, no credits and no upload: the photos never leave the computer.
   1. The photos: each one is read in the browser and analysed from its histogram: exposure (median and mean light),
      clipped highlights and shadows, contrast, colour cast (from the least saturated mid-tones, so a warm loaf does not
      count as a cast), saturation, resolution.
   2. Three proposals for the whole set, computed from the analysis: «Naturale», «Luminoso», «Caldo da vetrina». Each is
      one look applied the same way to every photo: every photo is first brought to the same light and to neutral
      colour (its own levels, white balance and exposure), then the shared look goes on top. So a batch shot at
      different times comes out consistent.
   3. The refinement, for the whole set: exposure, contrast, highlights, shadows, temperature, tint, saturation,
      vibrance, sharpening (unsharp mask on the light only, no colour fringes); per photo: exposure and temperature
      offsets and the focal point of the crop. Formats: original, 1:1, 4:5, 16:9, 9:16, cropped around the focal point
      or fitted on a white or brand-colour background (product shots). Before/after slider.
   4. The checks, on the edited pixels: clipping added by the edit, size too small for the chosen use (RADIX never
      enlarges: the file stays at its real size and the paid upscaling is named, not faked), strong cast corrections.
   5. The files: JPEG (quality to choose) and optionally WebP, renamed, in one zip with LEGGIMI.txt. The metadata (EXIF:
      GPS position, phone model, date) is removed: the canvas writes only pixels and RADIX also strips any APP1/EXIF/XMP
      segment from the bytes before zipping.
   Upscaling and restoration need a paid editing provider: shown only as «con fornitore, da collegare», disabled.
   The project keeps only the settings (look, sliders, format, use, export), never the photos: the «agents» document
   under the key retouch (agents-page.js keeps it).
   The image operations are pure functions on ImageData-like objects {width,height,data:Uint8ClampedArray RGBA}: they
   run in Node for the tests; retouchStudio() is the browser widget. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixRetouchStudio=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const lib=(g,p)=>root[g]||(typeof require==='function'?(()=>{try{return require(p)}catch(e){return null}})():null);
const ZIP=()=>lib('RadixZip','./zip-lite.js');

const MAX_PHOTOS=50,PREVIEW_SIDE=960,MAX_EXPORT_SIDE=6000,MAX_SAVED=10,MIN_SIDE=600;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const round=(v,d=0)=>{const k=Math.pow(10,d);return Math.round(v*k)/k};
const str=v=>v==null?'':String(v).replace(/\s+/g,' ').trim();

// ---- the questions ----
const FORMATS=Object.freeze([
 {id:'originale',label:'Originale',sub:'Come scattata',ratio:0},
 {id:'1x1',label:'1:1',sub:'Quadrata, feed e shop',ratio:1},
 {id:'4x5',label:'4:5',sub:'Verticale, feed Instagram',ratio:4/5},
 {id:'16x9',label:'16:9',sub:'Orizzontale, sito e YouTube',ratio:16/9},
 {id:'9x16',label:'9:16',sub:'Storie e reel',ratio:9/16}]);
// long: the long side the use wants (px); 0 = the photo's own size. print: 300 dpi on A4.
const USES=Object.freeze([
 {id:'social',label:'Social',sub:'1080 px di lato corto, come chiedono Instagram e Facebook',short:1080},
 {id:'sito',label:'Sito e shop',sub:'2000 px sul lato lungo, con lo zoom',long:2000},
 {id:'stampa',label:'Stampa A4',sub:'300 dpi: 3508 px sul lato lungo',long:3508,print:true},
 {id:'originale',label:'Dimensione originale',sub:'Tutti i pixel della foto',long:0}]);
const FITS=Object.freeze([
 {id:'crop',label:'Ritaglia',sub:'Riempie il formato intorno al punto scelto'},
 {id:'white',label:'Fondo bianco',sub:'Foto intera su #FFFFFF, per lo shop'},
 {id:'brand',label:'Fondo del brand',sub:'Foto intera sul colore del Kit identità'}]);
const ADJUST=Object.freeze([
 {id:'exposure',group:'Luce',label:'Esposizione',min:-2,max:2,step:.05,unit:'EV'},
 {id:'contrast',group:'Luce',label:'Contrasto',min:-50,max:50,step:1},
 {id:'highlights',group:'Luce',label:'Luci',min:-100,max:100,step:1},
 {id:'shadows',group:'Luce',label:'Ombre',min:-100,max:100,step:1},
 {id:'temp',group:'Colore',label:'Temperatura',min:-50,max:50,step:1},
 {id:'tint',group:'Colore',label:'Tinta',min:-50,max:50,step:1},
 {id:'saturation',group:'Colore',label:'Saturazione',min:-50,max:50,step:1},
 {id:'vibrance',group:'Colore',label:'Vividezza',min:-50,max:60,step:1},
 {id:'sharpen',group:'Dettaglio',label:'Nitidezza',min:0,max:100,step:1}]);
const ZERO=Object.freeze({exposure:0,contrast:0,highlights:0,shadows:0,temp:0,tint:0,saturation:0,vibrance:0,sharpen:0});
const OWN=Object.freeze({exposure:0,temp:0});
const UPSCALE_NOTE='Ingrandimento e restauro: con fornitore, da collegare. RADIX non ingrandisce le foto da solo.';

// ---- colour math ----
const LIN=new Float32Array(256);for(let i=0;i<256;i++){const v=i/255;LIN[i]=v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)}
const toLin=v=>{v=clamp(v,0,1);return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)};
const toSrgb=x=>{x=clamp(x,0,1);return x<=.0031308?x*12.92:1.055*Math.pow(x,1/2.4)-.055};
const W=[.2126,.7152,.0722];
const lumaOf=(r,g,b)=>W[0]*r+W[1]*g+W[2]*b;
const image=(width,height,data)=>({width,height,data:data||new Uint8ClampedArray(width*height*4)});
const copy=img=>image(img.width,img.height,new Uint8ClampedArray(img.data));
function pct(hist,count,p){const t=count*p;let acc=0;for(let i=0;i<256;i++){acc+=hist[i];if(acc>=t&&acc>0)return i}return 255}

// ---- 1 · analysis ----
// Samples at most ~260k pixels. The cast is read from the 15% least saturated mid-tones (a white wall, a plate, paper,
// a grey counter): its colour in linear light gives the white-balance gains; when even those pixels are clearly
// coloured (a close-up of a loaf), the confidence drops and so does the correction.
function analyze(img){const {width:w,height:h,data:d}=img,N=w*h,step=Math.max(1,Math.floor(Math.sqrt(N/260000)));
 const L=new Uint32Array(256),R=new Uint32Array(256),G=new Uint32Array(256),B=new Uint32Array(256),LR=new Float64Array(256),LG=new Float64Array(256),LB=new Float64Array(256),LN=new Uint32Array(256),CB=40,cn=new Float64Array(CB),cr=new Float64Array(CB),cg=new Float64Array(CB),cb=new Float64Array(CB);
 let n=0,sum=0,sum2=0,hiClip=0,loClip=0,sat=0,mid=0,lap=0,ln=0;
 for(let y=0;y<h;y+=step)for(let x=0;x<w;x+=step){const i=(y*w+x)*4,r=d[i],g=d[i+1],b=d[i+2],l=Math.round(lumaOf(r,g,b));
  L[l]++;R[r]++;G[g]++;B[b]++;n++;sum+=l;sum2+=l*l;if(r>=254||g>=254||b>=254)hiClip++;if(l<=2)loClip++;
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b),c=mx?(mx-mn)/mx:0;sat+=c;
  if(mx<250){LR[l]+=LIN[r];LG[l]+=LIN[g];LB[l]+=LIN[b];LN[l]++}
  if(l>=28&&l<=242&&mx<250){mid++;const k=Math.min(CB-1,Math.floor(c*CB));cn[k]++;cr[k]+=LIN[r];cg[k]+=LIN[g];cb[k]+=LIN[b]}
  if(x>0&&y>0&&x<w-1&&y<h-1){const lu=k=>lumaOf(d[k],d[k+1],d[k+2]);lap+=Math.abs(4*l-lu(i-4)-lu(i+4)-lu(i-w*4)-lu(i+w*4));ln++}}
 const mean=sum/n,sd=Math.sqrt(Math.max(0,sum2/n-mean*mean));
 // the neutral reference: lowest-chroma buckets up to 15% of the mid-tones
 let want=mid*.15,tr=0,tg=0,tb=0,tn=0,chroma=0;for(let k=0;k<CB&&tn<want;k++){if(!cn[k])continue;tr+=cr[k];tg+=cg[k];tb+=cb[k];tn+=cn[k];chroma+=cn[k]*(k+.5)/CB}
 let cast={r:1,g:1,b:1,temp:0,tint:0,chroma:0,share:0,strength:0};
 if(tn>=20){const ar=tr/tn,ag=tg/tn,ab=tb/tn,m=(ar+ag+ab)/3,ch=chroma/tn;
  let strength=clamp(1-(ch-.1)/.22,0,1);
  // the brightest unclipped tones (white wall, paper, plate): when they lean the same way, the cast is the light's,
  // not the subject's, and a strong cast is corrected with confidence.
  const p95=pct(L,n,.95);let br=0,bg=0,bb=0,bn=0;for(let k=Math.max(60,p95-12);k<256;k++){br+=LR[k];bg+=LG[k];bb+=LB[k];bn+=LN[k]}
  if(bn>=20){const m2=(br+bg+bb)/3,v1=[ar/m-1,ag/m-1,ab/m-1],v2=[br/m2-1,bg/m2-1,bb/m2-1],dot=v1[0]*v2[0]+v1[1]*v2[1]+v1[2]*v2[2],n1=Math.hypot(...v1),n2=Math.hypot(...v2),cos=n1&&n2?dot/(n1*n2):0;
   if(cos>.9&&n2>.04&&n2<.8)strength=Math.max(strength,clamp(.6+(cos-.9)*4,0,.9))}
  cast={r:ar/m,g:ag/m,b:ab/m,temp:round((ar-ab)/m,3),tint:round((ag-(ar+ab)/2)/m,3),chroma:round(ch,3),share:round(tn/n,3),strength:round(strength,2)}}
 const black=[pct(R,n,.003),pct(G,n,.003),pct(B,n,.003)],white=[pct(R,n,.997),pct(G,n,.997),pct(B,n,.997)];
 const a={width:w,height:h,megapixels:round(N/1e6,1),samples:n,hist:Array.from(L),channels:[Array.from(R),Array.from(G),Array.from(B)],mean:round(mean,1),median:pct(L,n,.5),p05:pct(L,n,.05),p95:pct(L,n,.95),black,white,
  contrast:round(sd/255,3),clipHigh:round(hiClip/n,4),clipLow:round(loClip/n,4),saturation:round(sat/n,3),sharpness:round(ln?lap/ln:0,1),cast};
 a.issues=issuesOf(a);return a}
const CAST_NAMES=[['temp',1,'calda (arancio)'],['temp',-1,'fredda (blu)'],['tint',1,'verde'],['tint',-1,'magenta']];
function castName(c){if(!c)return '';const t=Math.abs(c.temp),k=Math.abs(c.tint);if(Math.max(t,k*1.4)<.06)return '';return t>=k*1.4?(c.temp>0?CAST_NAMES[0][2]:CAST_NAMES[1][2]):(c.tint>0?CAST_NAMES[2][2]:CAST_NAMES[3][2])}
// What the analysis says, in plain Italian. level: warn (worth correcting) or info.
function issuesOf(a){const out=[],add=(id,label,detail,level='warn')=>out.push({id,label,detail,level});
 if(a.median<60)add('scura','Molto scura','Metà della foto è sotto il '+Math.round(a.median/2.55)+'% di luce.');
 else if(a.median<95&&a.p95<235)add('scura','Scura','Luce media bassa: si può schiarire senza bruciare le luci.');
 if(a.median>200&&a.p05>120)add('chiara','Slavata','Pochi neri: la foto sembra velata.');
 if(a.contrast<.14||a.p95-a.p05<110)add('piatta','Poco contrasto','I toni stanno tra '+a.p05+' e '+a.p95+' su 255.');
 const cn=castName(a.cast);if(cn&&a.cast.strength>.2)add('dominante','Dominante '+cn,'I grigi e i bianchi della foto tirano al '+cn.split(' ')[0]+'.');
 if(a.clipHigh>.02)add('bruciate','Luci bruciate',Math.round(a.clipHigh*1000)/10+'% dei pixel è già al bianco pieno: lì il dettaglio non si recupera.');
 if(a.clipLow>.03)add('chiuse','Ombre chiuse',Math.round(a.clipLow*1000)/10+'% dei pixel è nero pieno.');
 if(Math.max(a.width,a.height)<1080)add('piccola','Piccola',a.width+' × '+a.height+' px: va bene solo per usi piccoli.');
 if(!out.length)add('ok','Già buona','Luce e colore sono già in ordine: il ritocco sarà leggero.','info');
 return out}

// ---- 2 · the recipe and its curves ----
// recipe: {black, white, gains:[r,g,b], exposure (EV), temp, tint, contrast, highlights, shadows, saturation, vibrance,
// sharpen}. black/white: input levels (sRGB 0..255); gains: white balance in linear light; the rest are the sliders.
function tempTintGains(temp,tint){const t=clamp(+temp||0,-100,100)/100,k=clamp(+tint||0,-100,100)/100;
 const g=[1+.3*t,1-.22*k,1-.3*t],n=lumaOf(g[0],g[1],g[2]);return g.map(v=>v/n)}
// The shoulder: past the knee the light is compressed so that the brightest input (after the gain G) lands exactly on
// white, with no step in slope: brightening a dark photo does not burn what was already light.
function shoulder(G,knee=.75){if(G<=1.0001)return x=>x;const s=(G-knee)/(1-knee);let lo=1e-6,hi=60;for(let i=0;i<60;i++){const a=(lo+hi)/2;(a/(1-Math.exp(-a))<s?lo=a:hi=a)}const a=(lo+hi)/2,den=1-Math.exp(-a);
 return x=>x<=knee?x:knee+(1-knee)*(1-Math.exp(-a*clamp((x-knee)/(G-knee),0,1)))/den}
const bumpS=y=>6.75*y*(1-y)*(1-y),bumpH=y=>6.75*y*y*(1-y);
// The tone curve in sRGB (0..1): highlights and shadows as soft bumps, contrast as an S around the mid grey. Always
// monotonic for the slider ranges (tested), ends fixed at 0 and 1.
function toneCurve(y,{contrast=0,highlights=0,shadows=0}={}){const c=clamp(contrast,-100,100)/100*.45;
 y=y+clamp(shadows,-100,100)/100*.16*bumpS(y)+clamp(highlights,-100,100)/100*.14*bumpH(y);y=clamp(y,0,1);
 return clamp(y+c*2*y*(1-y)*(2*y-1),0,1)}
// Order: white balance and temperature/tint in linear light (so the cast goes away evenly from shadows to lights),
// then the levels on the balanced values (a veil is removed without colouring the shadows), then the exposure with
// its shoulder, then the tone curve.
function luts(rc){const r=normalize(rc),wb=tempTintGains(r.temp,r.tint).map((v,c)=>v*r.gains[c]),E=Math.pow(2,r.exposure),sh=shoulder(E),bw=Math.max(1,r.white-r.black);
 return [0,1,2].map(c=>{const t=new Uint8ClampedArray(256);for(let v=0;v<256;v++){const x=clamp((255*toSrgb(LIN[v]*wb[c])-r.black)/bw,0,1);t[v]=Math.round(255*toneCurve(toSrgb(sh(toLin(x)*E)),r))}return t})}
function normalize(rc={}){const o={black:0,white:255,gains:[1,1,1],...ZERO,...rc};o.gains=Array.isArray(rc.gains)&&rc.gains.length===3?rc.gains.map(v=>clamp(+v||1,.5,2)):[1,1,1];
 o.black=clamp(Math.round(+o.black||0),0,120);o.white=clamp(Math.round(o.white==null?255:+o.white),o.black+40,255);for(const k of Object.keys(ZERO))o[k]=+o[k]||0;return o}
// The neutral curve (gains 1) of a recipe, applied to a luma histogram: what the median becomes.
function mappedMedian(hist,rc,p=.5){const r=normalize({...rc,gains:[1,1,1],temp:0,tint:0}),t=luts(r)[1];const n=hist.reduce((s,v)=>s+v,0);let acc=0;
 for(let i=0;i<256;i++){acc+=hist[i];if(acc>=n*p)return t[i]}return t[255]}
// The exposure (EV) that brings the median of the photo to target after the rest of the recipe.
function solveExposure(hist,rc,target,p=.5){let lo=-1.5,hi=2.5;for(let i=0;i<28;i++){const m=(lo+hi)/2;(mappedMedian(hist,{...rc,exposure:m},p)<target?lo=m:hi=m)}return round((lo+hi)/2,2)}
// The most a photo may be brightened: the light tones (97th percentile) stay below 240, so a dark scene (a shop window
// at night, a cake on slate) is not pushed to grey and its whites do not burn.
const HIGH_CAP=242,WHITE_TO=240,WHITE_OUT=248;

// ---- 3 · the three proposals ----
// Each look: the median light every photo is brought to, then the shared sliders. Values adapt to the set: a flat set
// gets more contrast, a dull one more vibrance.
const LOOKS=Object.freeze([
 {id:'naturale',label:'Naturale',line:'Luce giusta e colori veri: come la vedevi dal vivo.',target:122,wb:.9},
 {id:'luminoso',label:'Luminoso',line:'Più aria e ombre aperte: fresco e pulito, per sito e social.',target:140,wb:.92},
 {id:'vetrina',label:'Caldo da vetrina',line:'Toni caldi e golosi, contrasto pieno: il prodotto «chiama».',target:126,wb:.85}]);
function setStats(list){const a=list.filter(Boolean),n=a.length||1,avg=f=>a.reduce((s,x)=>s+f(x),0)/n;
 return {count:a.length,median:round(avg(x=>x.median),1),contrast:round(avg(x=>x.contrast),3),saturation:round(avg(x=>x.saturation),3),
  dark:a.filter(x=>x.issues.some(i=>i.id==='scura')).length,flat:a.filter(x=>x.issues.some(i=>i.id==='piatta')).length,cast:a.filter(x=>x.issues.some(i=>i.id==='dominante')).length,
  highKey:a.filter(x=>x.median>185).length}}
function proposals(analyses){const s=setStats(analyses),flat=clamp((.2-s.contrast)*120,0,14),dull=clamp((.32-s.saturation)*60,0,12);
 const adj={
  naturale:{...ZERO,contrast:Math.round(6+flat),highlights:-10,shadows:8,vibrance:Math.round(8+dull),sharpen:30},
  luminoso:{...ZERO,contrast:Math.round(2+flat*.6),highlights:-28,shadows:34,vibrance:Math.round(14+dull),saturation:2,sharpen:28,temp:-2},
  vetrina:{...ZERO,contrast:Math.round(16+flat*.7),highlights:-14,shadows:6,temp:16,tint:2,saturation:6,vibrance:Math.round(20+dull),sharpen:40}};
 return LOOKS.map(l=>({...l,adjust:adj[l.id],why:whyOf(l,s)}))}
function whyOf(l,s){const p=[];if(s.dark)p.push(s.dark===s.count?'schiarisce le foto scure':'schiarisce le '+s.dark+' foto scure');if(s.cast)p.push('toglie le dominanti di colore');if(s.flat)p.push('ridà contrasto');
 const base=p.length?p.join(', '):'corregge leggermente luce e colore';
 return ({naturale:'Porta tutte le foto alla stessa luce e a colori neutri: ',luminoso:'Come Naturale, ma più chiaro e con le ombre aperte: ',vetrina:'Colori neutri e poi caldi, contrasto pieno: '})[l.id]+base+'.'}
// The per-photo correction: levels, neutral white balance and the exposure to the look's light, so the set matches.
// High-key photos (product on white) are never darkened to the target: only brightened if needed.
function autoFor(a,look){const l=typeof look==='string'?LOOKS.find(x=>x.id===look)||LOOKS[0]:look||LOOKS[0];
 const s=clamp(a.cast.strength*(l.wb==null?.9:l.wb),0,1);let gains=[1,1,1];
 if(s>0&&(Math.abs(a.cast.temp)>.015||Math.abs(a.cast.tint)>.015)){gains=[a.cast.r,a.cast.g,a.cast.b].map(v=>clamp(1+(1/v-1)*s,.72,1.4));const n=lumaOf(...gains);gains=gains.map(v=>round(v/n,4))}
 // levels read on the balanced channels: the darkest and lightest 0.3% of each, after the gains
 const ends=(p)=>[0,1,2].map(c=>{const h=a.channels?a.channels[c]:null;if(!h)return p<.5?a.black[c]:a.white[c];const m=new Float64Array(256);for(let v=0;v<256;v++)m[Math.round(255*toSrgb(LIN[v]*gains[c]))]+=h[v];return pct(m,a.samples,p)});
 const bl=Math.min(...ends(.003)),wh=Math.max(...ends(.997)),black=bl>3?Math.round(Math.min(bl,48)*.75):0,white=wh<252?Math.min(255,Math.round(black+(Math.max(wh,170)-black)*255/WHITE_OUT)):255;
 return {black,white,gains}}
function plan(a,look,adjust,own){const l=typeof look==='string'?LOOKS.find(x=>x.id===look)||LOOKS[0]:look||LOOKS[0],au=autoFor(a,l),ad={...ZERO,...(adjust||{})},o={...OWN,...(own||{})};
 const base={...au,...ad,exposure:0,temp:ad.temp+o.temp,tint:ad.tint};
 // exposure: towards the look's median light, never darker than the levels already made it (a darker photo is the
 // «Esposizione» slider's job), never past the highlight cap.
 const cap=mappedMedian(a.hist,base,.97)>=HIGH_CAP?0:solveExposure(a.hist,base,HIGH_CAP,.97);
 // and the light tones reach a clean white (99th percentile at WHITE_TO): a plate or a wall in the shade comes back white.
 const white=mappedMedian(a.hist,base,.99)>=WHITE_TO?0:solveExposure(a.hist,base,WHITE_TO,.99);
 const ev=clamp(Math.max(Math.min(solveExposure(a.hist,base,l.target),cap),white),0,1.9);
 // a dark scene the highlights do not let brighten (a cake on slate): the shadows open instead, up to the light the
 // photo had (or the look's), never darker than it came.
 const want=Math.min(l.target,a.median+l.target-100),has=mappedMedian(a.hist,{...base,exposure:ev});
 if(has<want-4&&Math.min(...a.black)<20){let lo=0,hi=70;for(let i=0;i<16;i++){const m=(lo+hi)/2;(mappedMedian(a.hist,{...base,exposure:ev,shadows:base.shadows+m})<want?lo=m:hi=m)}base.shadows=Math.round(base.shadows+hi);base.autoShadows=Math.round(hi)}
 return normalize({...base,exposure:round(ev+ad.exposure+o.exposure,2),autoExposure:ev})}
function describe(rc,a){const r=normalize(rc),p=[],ev=rc.autoExposure!=null?rc.autoExposure:r.exposure;
 if(Math.abs(ev)>=.1)p.push((ev>0?'schiarita ':'scurita ')+(ev>0?'+':'−')+String(Math.abs(round(ev,1))).replace('.',',')+' EV');
 if(r.black>0||r.white<255)p.push('toni '+r.black+'–'+r.white+' allargati a 0–255');
 if(rc.autoShadows>=5)p.push('ombre aperte +'+rc.autoShadows);
 const g=r.gains;if(Math.max(...g)-Math.min(...g)>.03){const cn=castName(a&&a.cast);p.push('dominante '+(cn?cn.split(' ')[0]:'di colore')+' tolta')};
 return p.length?p.join(' · '):'correzione leggera'}

// ---- 4 · applying ----
// Per pixel: the 3 curves (levels, white balance, exposure with shoulder, tone), highlight protection (near-white input
// stays neutral white, so a clipped backdrop does not turn blue or pink), saturation and vibrance (vibrance lifts the
// muted colours more than the strong ones), then the unsharp mask.
function apply(img,rc,{sharpRadius}={}){const r=normalize(rc),[tr,tg,tb]=luts(r),src=img.data,out=new Uint8ClampedArray(src.length),sat=r.saturation/100,vib=r.vibrance/100;
 for(let i=0;i<src.length;i+=4){const ir=src[i],ig=src[i+1],ib=src[i+2];let R=tr[ir],G=tg[ig],B=tb[ib];
  const mn=Math.min(ir,ig,ib);if(mn>236){const t=clamp((mn-236)/16,0,1),m=Math.max(R,G,B);R+=(m-R)*t;G+=(m-G)*t;B+=(m-B)*t}
  if(sat||vib){const l=lumaOf(R,G,B),mx=Math.max(R,G,B),c=mx?(mx-Math.min(R,G,B))/mx:0,f=1+sat+vib*(1-c)*(1-c)*1.2;if(f!==1){R=l+(R-l)*f;G=l+(G-l)*f;B=l+(B-l)*f}}
  out[i]=R;out[i+1]=G;out[i+2]=B;out[i+3]=src[i+3]}
 const res=image(img.width,img.height,out);
 return r.sharpen>0?unsharp(res,{amount:r.sharpen/100*1.1,radius:sharpRadius||radiusFor(Math.max(img.width,img.height)),threshold:3}):res}
const radiusFor=long=>round(clamp(long/1700,.6,2.2),2);
function gaussKernel(sigma){const r=Math.max(1,Math.ceil(sigma*3)),k=new Float32Array(2*r+1);let s=0;for(let i=-r;i<=r;i++){const v=Math.exp(-(i*i)/(2*sigma*sigma));k[i+r]=v;s+=v}for(let i=0;i<k.length;i++)k[i]/=s;return k}
function blurPlane(p,w,h,sigma){const k=gaussKernel(sigma),r=(k.length-1)/2,tmp=new Float32Array(p.length),out=new Float32Array(p.length);
 for(let y=0;y<h;y++){const o=y*w;for(let x=0;x<w;x++){let s=0;for(let j=-r;j<=r;j++)s+=p[o+clamp(x+j,0,w-1)]*k[j+r];tmp[o+x]=s}}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let s=0;for(let j=-r;j<=r;j++)s+=tmp[clamp(y+j,0,h-1)*w+x]*k[j+r];out[y*w+x]=s}return out}
// Unsharp mask on the light only: L' = L + amount·(L − blur(L)), with a soft threshold so flat areas and noise stay
// calm; the same delta goes on R, G and B, so edges get no coloured halos.
function unsharp(img,{amount=.5,radius=1,threshold=3}={}){const {width:w,height:h,data:d}=img,N=w*h,L=new Float32Array(N);
 for(let i=0;i<N;i++)L[i]=lumaOf(d[i*4],d[i*4+1],d[i*4+2]);const bl=blurPlane(L,w,h,Math.max(.3,radius)),out=new Uint8ClampedArray(d.length);
 for(let i=0;i<N;i++){let diff=L[i]-bl[i];const a=Math.abs(diff);if(a<threshold)diff*=a/threshold;const dl=amount*diff,j=i*4;out[j]=d[j]+dl;out[j+1]=d[j+1]+dl;out[j+2]=d[j+2]+dl;out[j+3]=d[j+3]}
 return image(w,h,out)}

// ---- 5 · crops, sizes, background ----
// The largest rectangle of the ratio inside the photo, centred on the focal point (0..1) and kept inside.
function cropRect(w,h,ratio,focus={x:.5,y:.5}){if(!ratio)return {x:0,y:0,w,h};const fx=clamp(focus&&focus.x!=null?+focus.x:.5,0,1),fy=clamp(focus&&focus.y!=null?+focus.y:.5,0,1);
 let cw,ch;if(w/h>ratio){ch=h;cw=Math.min(w,Math.round(h*ratio))}else{cw=w;ch=Math.min(h,Math.round(w/ratio))}
 return {x:Math.round(clamp(fx*w-cw/2,0,w-cw)),y:Math.round(clamp(fy*h-ch/2,0,h-ch)),w:cw,h:ch}}
// The canvas for «fit on a background»: the whole photo inside the ratio with a margin, never scaled up.
function padLayout(w,h,ratio,margin=.06){if(!ratio)ratio=w/h;const iw=w/(1-2*margin),ih=h/(1-2*margin);let W,H;if(iw/ih>ratio){W=Math.round(iw);H=Math.round(iw/ratio)}else{H=Math.round(ih);W=Math.round(ih*ratio)}
 return {W,H,x:Math.round((W-w)/2),y:Math.round((H-h)/2),w,h}}
// The size of the file for a use, from the source rectangle (crop or padded canvas). RADIX never enlarges: when the
// source is smaller than the use asks, the file keeps the source size and small says by how much.
function outputSize(sw,sh,useId){const u=USES.find(x=>x.id===useId)||USES[1];let tw=sw,th=sh;
 if(u.short){const s=u.short/Math.min(sw,sh);tw=Math.round(sw*s);th=Math.round(sh*s)}else if(u.long){const s=u.long/Math.max(sw,sh);tw=Math.round(sw*s);th=Math.round(sh*s)}
 const cap=MAX_EXPORT_SIDE/Math.max(tw,th);if(cap<1){tw=Math.round(tw*cap);th=Math.round(th*cap)}
 const small=tw>sw+1||th>sh+1;return {w:small?sw:tw,h:small?sh:th,want:{w:tw,h:th},small,scale:round(Math.min(1,tw/sw),4)}}
// Area-average resize (the browser uses drawImage; this one is for Node and the tests). Never used to enlarge.
function resize(img,dw,dh){const {width:sw,height:sh,data:s}=img;if(dw===sw&&dh===sh)return copy(img);const out=new Uint8ClampedArray(dw*dh*4),fx=sw/dw,fy=sh/dh;
 for(let y=0;y<dh;y++){const y0=y*fy,y1=Math.min(sh,(y+1)*fy);for(let x=0;x<dw;x++){const x0=x*fx,x1=Math.min(sw,(x+1)*fx);let r=0,g=0,b=0,a=0,wt=0;
  for(let yy=Math.floor(y0);yy<Math.ceil(y1);yy++){const wy=Math.min(y1,yy+1)-Math.max(y0,yy);for(let xx=Math.floor(x0);xx<Math.ceil(x1);xx++){const wx=Math.min(x1,xx+1)-Math.max(x0,xx),k=wx*wy,i=(yy*sw+xx)*4;r+=s[i]*k;g+=s[i+1]*k;b+=s[i+2]*k;a+=s[i+3]*k;wt+=k}}
  const o=(y*dw+x)*4;out[o]=r/wt;out[o+1]=g/wt;out[o+2]=b/wt;out[o+3]=a/wt}}
 return image(dw,dh,out)}
function crop(img,r){const out=new Uint8ClampedArray(r.w*r.h*4);for(let y=0;y<r.h;y++){const s=((r.y+y)*img.width+r.x)*4;out.set(img.data.subarray(s,s+r.w*4),y*r.w*4)}return image(r.w,r.h,out)}
const hexRgb=h=>{const m=/^#?([0-9a-f]{6})$/i.exec(String(h||''));const v=m?parseInt(m[1],16):0xffffff;return [v>>16&255,v>>8&255,v&255]};
function pad(img,ratio,colour,margin=.06){const L=padLayout(img.width,img.height,ratio,margin),[r,g,b]=hexRgb(colour),out=new Uint8ClampedArray(L.W*L.H*4);
 for(let i=0;i<out.length;i+=4){out[i]=r;out[i+1]=g;out[i+2]=b;out[i+3]=255}
 for(let y=0;y<L.h;y++)out.set(img.data.subarray(y*img.width*4,(y+1)*img.width*4),((L.y+y)*L.W+L.x)*4);return image(L.W,L.H,out)}
// The whole edit of one photo (Node and previews): crop or pad, resize, recipe.
function render(img,{recipe,formatId='originale',fit='crop',focus,colour='#FFFFFF',size}={}){const f=FORMATS.find(x=>x.id===formatId)||FORMATS[0];
 let src=img;if(fit==='crop'&&f.ratio)src=crop(img,cropRect(img.width,img.height,f.ratio,focus));
 if(size&&(size.w!==src.width||size.h!==src.height)&&fit==='crop')src=resize(src,size.w,size.h);
 const done=apply(src,recipe||{});if(fit!=='crop'){const bg=fit==='white'?'#FFFFFF':colour;return pad(done,f.ratio||done.width/done.height,bg)}return done}

// ---- 6 · checks ----
// before/after: analyses of the original and of the edited pixels; out: {w,h,small,want}; use: id.
function checks({before,after,out,useId,recipe,fit}={}){const list=[],add=(id,label,level,msg)=>list.push({id,label,level,msg});
 const added=after.clipHigh-before.clipHigh;
 if(after.clipHigh>.04&&added>.01)add('luci','Luci bruciate dal ritocco','fail',Math.round(after.clipHigh*1000)/10+'% dei pixel al bianco pieno (prima '+Math.round(before.clipHigh*1000)/10+'%): abbassa Luci o Esposizione.');
 else if(added>.012)add('luci','Luci al limite','warn','Il ritocco porta al bianco pieno '+Math.round(added*1000)/10+'% di pixel in più: guarda le parti chiare.');
 else add('luci','Luci','ok',before.clipHigh>.02?'Già bruciate nello scatto ('+Math.round(before.clipHigh*1000)/10+'%): il ritocco non le peggiora.':'Nessuna luce bruciata dal ritocco.');
 const addedLow=after.clipLow-before.clipLow;
 if(addedLow>.03)add('ombre','Ombre chiuse dal ritocco','warn',Math.round(after.clipLow*1000)/10+'% dei pixel nero pieno: alza Ombre o abbassa Contrasto.');else add('ombre','Ombre','ok','Le ombre hanno ancora dettaglio.');
 const u=USES.find(x=>x.id===useId)||USES[1];
 if(out&&out.small){const lvl=u.print?'fail':'warn';add('misura','Troppo piccola per «'+u.label+'»',lvl,'Servono '+out.want.w+' × '+out.want.h+' px, la foto ne ha '+out.w+' × '+out.h+': RADIX non la ingrandisce, la esporta così.'+(u.print?' A 300 dpi si stampa al massimo a '+cm(out.w)+' × '+cm(out.h)+' cm; per andare oltre serve l’ingrandimento con fornitore, da collegare.':''))}
 else if(out)add('misura','Misura','ok',out.w+' × '+out.h+' px'+(u.print?', A4 a 300 dpi.':', giusta per «'+u.label+'».'));
 if(out&&Math.max(out.w,out.h)<MIN_SIDE)add('risoluzione','Risoluzione bassa','fail','Meno di '+MIN_SIDE+' px sul lato lungo: si vedrà sgranata quasi ovunque.');
 if(recipe){const g=normalize(recipe).gains;if(Math.max(...g)/Math.min(...g)>1.4)add('colore','Correzione di colore forte','warn','La dominante era forte: controlla che il colore del prodotto sia quello vero.')}
 if(fit&&fit!=='crop')add('fondo','Fondo','ok',fit==='white'?'Fondo #FFFFFF pieno: il fondo non passa dal ritocco.':'Fondo pieno nel colore del brand.');
 return list}
const cm=px=>String(round(px/300*2.54,1)).replace('.',',');
const worst=list=>list.some(c=>c.level==='fail')?'fail':list.some(c=>c.level==='warn')?'warn':'ok';

// ---- 7 · files: names, metadata, readme, zip ----
const slug=s=>str(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48);
// base-01-4x5.jpg … numbers padded to the size of the set; the original name is not used (it often holds a date or place).
function fileName(base,i,total,{formatId='originale',ext='jpg'}={}){const b=slug(base)||'foto',pad=String(Math.max(total,1)).length<2?2:String(total).length;return b+'-'+String(i+1).padStart(pad,'0')+(formatId&&formatId!=='originale'?'-'+formatId:'')+'.'+ext}
// JPEG: keep SOI, APP0 (JFIF), the image segments; drop APP1..APP15 (EXIF, XMP, ICC, maker notes) and COM.
function stripJpeg(bytes){const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);if(b[0]!==0xFF||b[1]!==0xD8)return b;const parts=[b.subarray(0,2)];let i=2;
 while(i+4<=b.length){if(b[i]!==0xFF)return b;const m=b[i+1];if(m===0xD9){parts.push(b.subarray(i,i+2));break}if(m===0xDA){parts.push(b.subarray(i));break}
  const len=(b[i+2]<<8)|b[i+3],seg=b.subarray(i,i+2+len);if(!((m>=0xE1&&m<=0xEF)||m===0xFE))parts.push(seg);i+=2+len}
 const n=parts.reduce((s,p)=>s+p.length,0),out=new Uint8Array(n);let o=0;for(const p of parts){out.set(p,o);o+=p.length}return out}
// WebP: drop the EXIF and XMP chunks and clear their flags in VP8X; RIFF size fixed.
function stripWebp(bytes){const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),t=(o)=>String.fromCharCode(b[o],b[o+1],b[o+2],b[o+3]);if(b.length<12||t(0)!=='RIFF'||t(8)!=='WEBP')return b;
 const parts=[];let i=12;while(i+8<=b.length){const id=t(i),len=b[i+4]|b[i+5]<<8|b[i+6]<<16|b[i+7]<<24,end=Math.min(b.length,i+8+len+(len&1));if(id!=='EXIF'&&id!=='XMP '){const c=b.slice(i,end);if(id==='VP8X')c[8]&=~(0x08|0x04);parts.push(c)}i=end}
 const n=parts.reduce((s,p)=>s+p.length,0),out=new Uint8Array(12+n);out.set(b.subarray(0,12));const v=n+4;out[4]=v&255;out[5]=v>>8&255;out[6]=v>>16&255;out[7]=v>>24&255;let o=12;for(const p of parts){out.set(p,o);o+=p.length}return out}
function hasMetadata(bytes){const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 if(b[0]===0xFF&&b[1]===0xD8){let i=2;while(i+4<=b.length&&b[i]===0xFF){const m=b[i+1];if(m===0xDA||m===0xD9)break;if((m>=0xE1&&m<=0xEF)||m===0xFE)return true;i+=2+((b[i+2]<<8)|b[i+3])}return false}
 const s=String.fromCharCode(...b.subarray(0,Math.min(b.length,4096)));return /EXIF|XMP /.test(s.slice(12))}
const fmtNum=v=>String(v).replace('.',',');
function readme({project,look,adjust,formatId,fit,useId,quality,webp,rows,date}){const d=(date||new Date()).toISOString().slice(0,10),f=FORMATS.find(x=>x.id===formatId)||FORMATS[0],u=USES.find(x=>x.id===useId)||USES[1],l=LOOKS.find(x=>x.id===look)||LOOKS[0];
 const L=['FOTORITOCCO · '+(project||'Progetto'),'Preparato con RADIX il '+d+', nel browser: nessuna AI, nessun credito, le foto non sono state caricate da nessuna parte.','',
  'Look: '+l.label+' («'+l.line+'»)','Regolazioni comuni: '+ADJUST.map(a=>a.label+' '+fmtNum((adjust||{})[a.id]||0)+(a.unit?' '+a.unit:'')).join(', '),
  'Formato: '+f.label+(f.ratio?(fit==='crop'?' ritagliato intorno al punto scelto':' su '+(fit==='white'?'fondo bianco #FFFFFF':'fondo del brand')):''),'Uso: '+u.label+' ('+u.sub+')',
  'File: JPEG qualità '+quality+(webp?' e WebP':'')+'. Dati EXIF tolti (posizione GPS, modello del telefono, data e ora): i file contengono solo i pixel.','',
  'FOTO'];
 (rows||[]).forEach(r=>{const bad=(r.checks||[]).filter(c=>c.level!=='ok').map(c=>c.label);L.push('- '+r.name+' · '+r.w+' × '+r.h+' px · '+r.what+(bad.length?' · da guardare: '+bad.join(', '):''))});
 L.push('',UPSCALE_NOTE);return L.join('\n')+'\n'}
const bundle=(files,{date}={})=>ZIP().zip(files.map(f=>({name:f.name,data:f.data})),{date:date||new Date()});

// ---- 8 · the settings in the project (never the photos) ----
const emptyStore=()=>({schemaVersion:1,items:[]});
function readStore(doc){const s=doc&&doc.retouch;return s&&typeof s==='object'&&Array.isArray(s.items)?{schemaVersion:1,items:s.items.filter(x=>x&&typeof x==='object')}:emptyStore()}
function settingsRecord(s,{by,at}={}){const when=at||new Date().toISOString(),adj={};for(const k of Object.keys(ZERO))adj[k]=round(+((s.adjust||{})[k])||0,2);
 return {id:'ritocco-'+when.replace(/\D/g,'').slice(0,14),at:when,by:str(by).slice(0,80)||undefined,look:(LOOKS.find(x=>x.id===s.look)||LOOKS[0]).id,adjust:adj,
  formatId:(FORMATS.find(x=>x.id===s.formatId)||FORMATS[0]).id,fit:(FITS.find(x=>x.id===s.fit)||FITS[0]).id,useId:(USES.find(x=>x.id===s.useId)||USES[1]).id,
  quality:clamp(Math.round(+s.quality||85),50,100),webp:!!s.webp,baseName:slug(s.baseName).slice(0,40),photos:Math.max(0,s.photos|0)}}
function addRecord(store,rec){const s=readStore({retouch:store});return {schemaVersion:1,items:s.items.filter(x=>x.id!==rec.id).concat([rec]).slice(-MAX_SAVED)}}
async function saveToProject(ws,projectId,rec){if(!ws||typeof ws.bind!=='function')throw Error('Archivio del progetto non disponibile.');const d=ws.bind(projectId,'agents');
 const doc=(await d.load())||{schemaVersion:1,conversations:{}};doc.retouch=addRecord(doc.retouch,rec);await d.save(doc);return doc}
function brandColour(profile){const kit=profile&&profile.identityKit,hex=/^#[0-9a-f]{6}$/i;if(!kit||!Array.isArray(kit.palette))return '';
 const by=r=>(kit.palette.find(x=>x&&x.role===r)||{}).hex;return [by('light'),by('secondary'),by('primary'),...kit.palette.map(x=>x&&x.hex)].find(h=>hex.test(h||''))||''}

// ---- the widget (browser) ----
let counter=0;
const doc=()=>root.document;
const E=(tag,text,cls)=>{const n=doc().createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
const button=(text,cls)=>{const b=E('button',text,cls||'');b.type='button';return b};
const canvas=(w,h)=>{const c=E('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));return c};
const paint=(cv,img)=>{cv.width=img.width;cv.height=img.height;const x=cv.getContext('2d'),d=x.createImageData(img.width,img.height);d.data.set(img.data);x.putImageData(d,0,0);return cv};
const blobBytes=(c,type,q)=>new Promise((ok,ko)=>{try{c.toBlob(b=>b?b.arrayBuffer().then(x=>ok(new Uint8Array(x)),ko):ko(Error('il browser non scrive '+type)),type,q)}catch(e){ko(e)}});
function download(name,bytes,type){const a=E('a');a.href=root.URL.createObjectURL(new root.Blob([bytes],{type}));a.download=name;doc().body.append(a);a.click();a.remove();setTimeout(()=>root.URL.revokeObjectURL(a.href),4000)}
const kb=n=>n>1e6?fmtNum(round(n/1e6,1))+' MB':Math.max(1,Math.round(n/1024))+' kB';
async function decode(file){try{if(root.createImageBitmap)return await root.createImageBitmap(file,{imageOrientation:'from-image'})}catch(e){}
 const u=root.URL.createObjectURL(file);try{return await new Promise((ok,ko)=>{const i=new root.Image();i.onload=()=>ok(i);i.onerror=()=>ko(Error('immagine non leggibile'));i.src=u})}finally{setTimeout(()=>root.URL.revokeObjectURL(u),2000)}}
// The pixels of a rectangle of the source, drawn at w×h by the browser (high-quality smoothing, only ever smaller).
function pixels(src,r,w,h){const c=canvas(w,h),x=c.getContext('2d',{willReadFrequently:true});x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';x.drawImage(src,r.x,r.y,r.w,r.h,0,0,w,h);return image(w,h,x.getImageData(0,0,w,h).data)}

// ctx: {project, profile, projectName, projectId, workspace, by, agentsUrl}
function retouchStudio(ctx={}){const n=++counter,profile=ctx.profile||{},brand=brandColour(profile);
 const st={items:[],props:[],look:'',adjust:{...ZERO},formatId:'originale',fit:'crop',useId:'sito',quality:85,webp:false,baseName:slug(ctx.projectName)||'foto',active:0,split:50,busy:false,files:[]};
 const wrap=E('div',undefined,'tool photo-studio pf-studio retouch-studio');
 const steps=E('ol',undefined,'ps-steps');['Le foto','3 proposte','Rifinitura','Controlli e file'].forEach((t,i)=>{const li=E('li',(i+1)+' · '+t);li.dataset.step=String(i+1);steps.append(li)});
 const setStep=k=>[...steps.children].forEach(li=>li.dataset.state=+li.dataset.step<k?'done':+li.dataset.step===k?'current':'todo');setStep(1);
 const note=E('p','Le foto restano nel tuo browser: non vengono caricate da nessuna parte. Nessuna AI e nessun credito: luce e colore si correggono qui, in codice.','pf-note rt-note');
 const status=E('p','','tool-status');status.setAttribute('role','status');const say=t=>{status.textContent=t||''};
 // 1 · photos
 const up=E('section',undefined,'pf-card rt-up'),upHead=E('div',undefined,'pf-card-head');upHead.append(E('h4','Le foto'),E('p','Da 1 a '+MAX_PHOTOS+' foto dello stesso servizio: RADIX le analizza e propone un look unico per tutte.','muted'));
 const inp=E('input');inp.type='file';inp.multiple=true;inp.accept='image/jpeg,image/png,image/webp';inp.setAttribute('aria-label','Scegli le foto da ritoccare');
 const drop=E('label',undefined,'pf-drop'),dt=E('span',undefined,'pf-drop-text');dt.append(E('strong','Carica le foto'),E('small','JPG, PNG o WebP · anche 50 insieme · restano sul tuo computer'));drop.append(inp,dt);
 const prog=E('div',undefined,'fp-progress rt-progress'),pbar=E('progress'),ptext=E('span','','muted');pbar.max=1;pbar.value=0;prog.append(pbar,ptext);prog.hidden=true;
 const list=E('div',undefined,'rt-list');const goProps=button('Proponi 3 look','primary'),propsBar=E('div',undefined,'ps-actions');propsBar.append(goProps,E('span','Calcolati dall’analisi delle tue foto, senza AI.','muted'));propsBar.hidden=true;
 up.append(upHead,drop,prog,list,propsBar);
 const props=E('div',undefined,'rt-props'),refine=E('section',undefined,'pf-card rt-refine'),exp=E('section',undefined,'pf-card rt-export'),saved=E('div',undefined,'ad-saved rt-saved');props.hidden=refine.hidden=exp.hidden=saved.hidden=true;
 wrap.append(steps,note,status,saved,up,props,refine,exp);
 inp.onchange=()=>{const files=[...inp.files||[]];inp.value='';if(files.length)addFiles(files)};
 drop.addEventListener('dragover',e=>{e.preventDefault()});drop.addEventListener('drop',e=>{e.preventDefault();const f=[...(e.dataTransfer&&e.dataTransfer.files||[])].filter(x=>/^image\//.test(x.type));if(f.length)addFiles(f)});
 async function addFiles(files){if(st.busy)return;const room=MAX_PHOTOS-st.items.length;if(room<=0){say('Al massimo '+MAX_PHOTOS+' foto per volta.');return}
  if(files.length>room)say('Prendo le prime '+room+': al massimo '+MAX_PHOTOS+' foto per volta.');st.busy=true;prog.hidden=false;
  const take=files.slice(0,room);for(const [k,f] of take.entries()){pbar.value=k/take.length;ptext.textContent='Analizzo '+(k+1)+' di '+take.length+'…';
   try{const src=await decode(f),w=src.width||src.naturalWidth,h=src.height||src.naturalHeight,s=Math.min(1,PREVIEW_SIDE/Math.max(w,h)),pw=Math.max(1,Math.round(w*s)),ph=Math.max(1,Math.round(h*s));
    const pre=pixels(src,{x:0,y:0,w,h},pw,ph),a=analyze(pre);a.width=w;a.height=h;a.megapixels=round(w*h/1e6,1);a.issues=issuesOf(a);if(src.close)src.close();
    st.items.push({id:'f'+n+'-'+st.items.length+'-'+k,file:f,name:f.name,w,h,pre,analysis:a,own:{...OWN},focus:{x:.5,y:.5}})}
   catch(e){say('«'+f.name+'» non si legge: '+e.message)}}
  pbar.value=1;prog.hidden=true;st.busy=false;if(st.look)st.props=proposals(st.items.map(i=>i.analysis));renderList();if(st.look){renderProps();renderRefine()}}
 function badge(i){const s=E('span',i.label,'rt-badge');s.dataset.level=i.level;s.title=i.detail;return s}
 function renderList(){propsBar.hidden=!st.items.length;setStep(st.items.length?(st.look?3:2):1);
  goProps.textContent=st.look?'Ricalcola le 3 proposte':'Proponi 3 look';
  list.replaceChildren(...st.items.map((it,i)=>{const row=E('article',undefined,'rt-photo');row.dataset.photo=it.id;const cv=canvas(1,1);cv.className='rt-thumb';paint(cv,it.pre);cv.setAttribute('role','img');cv.setAttribute('aria-label',it.name);
   const info=E('div',undefined,'rt-photo-info'),a=it.analysis;info.append(E('strong',it.name,'rt-photo-name'),E('small',a.width+' × '+a.height+' px · luce media '+Math.round(a.median/2.55)+'% · contrasto '+Math.round(a.contrast*100),'rt-photo-meta'));
   const bs=E('div',undefined,'rt-badges');a.issues.forEach(x=>bs.append(badge(x)));info.append(bs);
   const x=button('×','fp-thumb-x rt-x');x.setAttribute('aria-label','Togli '+it.name);x.onclick=()=>{st.items.splice(i,1);st.active=Math.min(st.active,Math.max(0,st.items.length-1));if(!st.items.length){st.look='';props.hidden=refine.hidden=exp.hidden=true}renderList();if(st.look){st.props=proposals(st.items.map(t=>t.analysis));renderProps();renderRefine()}};
   row.append(cv,info,x);return row}))}
 goProps.onclick=()=>{if(!st.items.length)return;st.props=proposals(st.items.map(i=>i.analysis));renderProps();props.scrollIntoView&&props.scrollIntoView({behavior:'smooth',block:'start'})};
 const recipeOf=(it,look=st.look,adjust=st.adjust)=>plan(it.analysis,look,adjust,it.own);
 const fmt=()=>FORMATS.find(x=>x.id===st.formatId)||FORMATS[0];
 // the preview pixels of a photo with the format: crop around the focal point or pad on the background.
 function previewOf(it,recipe,{side}={}){let img=it.pre;if(side&&Math.max(img.width,img.height)>side){const s=side/Math.max(img.width,img.height);img=resize(img,Math.max(1,Math.round(img.width*s)),Math.max(1,Math.round(img.height*s)))}
  const out=recipe?render(img,{recipe,formatId:st.formatId,fit:st.fit,focus:it.focus,colour:brand||'#FFFFFF'}):render(img,{recipe:{},formatId:st.formatId,fit:st.fit,focus:it.focus,colour:brand||'#FFFFFF'});return out}
 function renderProps(){props.hidden=false;setStep(st.look?3:2);const shown=st.items.slice(0,4);
  const head=E('div',undefined,'pf-card-head rt-props-head');head.append(E('h4','3 proposte per '+(st.items.length===1?'la foto':'tutte le '+st.items.length+' foto')),E('p','Ogni proposta è un look unico: ogni foto prima va alla stessa luce e a colori neutri, poi riceve lo stesso stile. Così il servizio è coerente.','muted'));
  const grid=E('div',undefined,'rt-prop-grid');
  st.props.forEach(p=>{const card=E('article',undefined,'ad-dir rt-prop');card.dataset.look=p.id;card.dataset.chosen=String(st.look===p.id);
   const hd=E('div',undefined,'ad-dir-head');hd.append(E('span','Proposta','ad-angle'),E('h3',p.label),E('p',p.line,'ad-idea'));
   const strip=E('div',undefined,'rt-strip');strip.dataset.n=String(shown.length);shown.forEach(it=>{const cv=canvas(1,1);cv.className='rt-strip-img';paint(cv,previewOf(it,recipeOf(it,p.id,p.adjust),{side:320}));cv.setAttribute('role','img');cv.setAttribute('aria-label',it.name+' con «'+p.label+'»');strip.append(cv)});
   const why=E('p',p.why,'rt-why');const more=st.items.length>shown.length?E('small','e altre '+(st.items.length-shown.length)+' foto, con lo stesso look','muted'):null;
   const pick=button(st.look===p.id?'Proposta scelta':'Scegli «'+p.label+'»','primary');pick.onclick=()=>{st.look=p.id;st.adjust={...p.adjust};st.files=[];renderProps();renderRefine();refine.scrollIntoView&&refine.scrollIntoView({behavior:'smooth',block:'start'})};
   card.append(hd,strip,why);if(more)card.append(more);card.append(pick);grid.append(card)});
  props.replaceChildren(head,grid)}
 // 3 · refinement
 let raf=0;const later=fn=>{if(raf)return;raf=(root.requestAnimationFrame||setTimeout)(()=>{raf=0;fn()})};
 function renderRefine(){if(!st.look||!st.items.length){refine.hidden=true;return}refine.hidden=false;exp.hidden=false;setStep(st.files.length?4:3);st.active=clamp(st.active,0,st.items.length-1);const it=st.items[st.active],l=LOOKS.find(x=>x.id===st.look);
  const head=E('div',undefined,'pf-card-head');head.append(E('h4','Rifinitura · «'+l.label+'»'),E('p','Le regolazioni valgono per tutte le foto; esposizione, temperatura e punto del ritaglio anche foto per foto. Trascina la linea per vedere prima e dopo.','muted'));
  const pick=E('div',undefined,'rt-picks');pick.setAttribute('role','group');pick.setAttribute('aria-label','Foto da guardare');
  st.items.forEach((t,i)=>{const b=button(String(i+1),'rt-pick');b.setAttribute('aria-pressed',String(i===st.active));b.title=t.name;b.setAttribute('aria-label','Foto '+(i+1)+': '+t.name);b.onclick=()=>{st.active=i;renderRefine()};pick.append(b)});
  // before/after
  const ba=E('div',undefined,'rt-ba'),after=canvas(1,1),before=canvas(1,1);after.className='rt-after';before.className='rt-before';after.setAttribute('role','img');after.setAttribute('aria-label','Dopo: '+it.name);before.setAttribute('aria-hidden','true');
  const line=E('span',undefined,'rt-line'),lb=E('span','Prima','rt-tag rt-tag-before'),la=E('span','Dopo','rt-tag rt-tag-after'),rng=E('input');rng.type='range';rng.min='0';rng.max='100';rng.value=String(st.split);rng.className='rt-split';rng.setAttribute('aria-label','Prima e dopo: sposta la linea');
  const setSplit=v=>{st.split=+v;before.style.clipPath='inset(0 '+(100-st.split)+'% 0 0)';line.style.left=st.split+'%'};rng.oninput=()=>setSplit(rng.value);
  ba.append(after,before,line,lb,la,rng);setSplit(st.split);
  const what=E('p','','rt-what');
  const draw=()=>{const rc=recipeOf(it);paint(after,previewOf(it,rc));paint(before,previewOf(it,null));what.textContent='Questa foto: '+describe(rc,it.analysis)+'.';drawFrame();renderChecksLater()};
  // framing: the whole photo, the crop rectangle, a tap moves the focal point
  const frameBox=E('div',undefined,'rt-frame'),frame=canvas(1,1);frame.className='rt-frame-view';frame.setAttribute('role','img');frame.setAttribute('aria-label','Inquadratura: tocca il punto da tenere al centro');
  const centre=button('Al centro','rt-mini');centre.onclick=()=>{it.focus={x:.5,y:.5};st.files=[];draw()};const allFocus=button('Stesso punto per tutte','rt-mini');allFocus.onclick=()=>{st.items.forEach(t=>{t.focus={...it.focus}});st.files=[];say('Punto del ritaglio copiato su tutte le foto.')};
  function drawFrame(){const f=fmt(),img=it.pre;paint(frame,img);const x=frame.getContext('2d');frameBox.hidden=!(f.ratio&&st.fit==='crop');if(frameBox.hidden)return;
   const r=cropRect(img.width,img.height,f.ratio,it.focus);x.fillStyle='rgba(20,16,30,.55)';x.beginPath();x.rect(0,0,img.width,img.height);x.rect(r.x,r.y,r.w,r.h);x.fill('evenodd');
   x.strokeStyle='#fff';x.lineWidth=Math.max(2,img.width/300);x.strokeRect(r.x+1,r.y+1,r.w-2,r.h-2);const fx=it.focus.x*img.width,fy=it.focus.y*img.height;x.beginPath();x.arc(fx,fy,Math.max(6,img.width/60),0,7);x.stroke()}
  frame.onclick=e=>{const b=frame.getBoundingClientRect();it.focus={x:clamp((e.clientX-b.left)/b.width,0,1),y:clamp((e.clientY-b.top)/b.height,0,1)};st.files=[];draw()};
  frameBox.append(E('h5','Punto del ritaglio'),frame,(()=>{const r=E('div',undefined,'rt-mini-row');r.append(centre,allFocus);return r})());
  // sliders
  const slider=(a,get,set,cls)=>{const lab=E('label',undefined,'fp-slider rt-slider '+(cls||'')),top=E('span'),out=E('output'),x=E('input');x.type='range';x.min=String(a.min);x.max=String(a.max);x.step=String(a.step);x.value=String(get());
   const show=()=>{const v=+x.value;out.textContent=(v>0?'+':v<0?'−':'')+fmtNum(Math.abs(round(v,2)))+(a.unit?' '+a.unit:'')};show();lab.dataset.adjust=a.id;
   x.oninput=()=>{set(+x.value);show();st.files=[];later(draw)};top.append(E('span',a.label),out);lab.append(top,x);return lab};
  const groups=E('div',undefined,'rt-sliders');['Luce','Colore','Dettaglio'].forEach(g=>{const fs=E('fieldset',undefined,'rt-group');fs.append(E('legend',g));ADJUST.filter(a=>a.group===g).forEach(a=>fs.append(slider(a,()=>st.adjust[a.id],v=>{st.adjust[a.id]=v})));groups.append(fs)});
  const own=E('fieldset',undefined,'rt-group rt-own');own.append(E('legend','Solo la foto '+(st.active+1)));
  own.append(slider({...ADJUST[0],min:-1.5,max:1.5}, ()=>it.own.exposure,v=>{it.own.exposure=v}),slider({...ADJUST[4],min:-40,max:40},()=>it.own.temp,v=>{it.own.temp=v}));groups.append(own);
  const reset=button('Torna alla proposta','fp-reset');reset.onclick=()=>{const p=st.props.find(x=>x.id===st.look);st.adjust={...p.adjust};st.items.forEach(t=>{t.own={...OWN}});st.files=[];renderRefine()};
  // format and fit
  const chips=(legend,key,items,onPick)=>{const fs=E('fieldset',undefined,'fs-choice rt-choice');fs.dataset.key=key;fs.append(E('legend',legend));
   items.forEach(o=>{const l=E('label',undefined,'ps-chip'),x=E('input');x.type='radio';x.name='rt-'+key+'-'+n;x.value=o.id;x.checked=st[key]===o.id;x.disabled=!!o.disabled;x.onchange=()=>{st[key]=o.id;st.files=[];if(onPick)onPick();renderRefine()};l.append(x,E('span',o.label));if(o.sub)l.title=o.sub;fs.append(l)});return fs};
  const fmtFs=chips('Formato','formatId',FORMATS),fitFs=chips('Adattamento','fit',FITS.map(f=>f.id==='brand'&&!brand?{...f,label:f.label+' (serve il Kit identità)',disabled:true}:f));
  if(brand){const sw=E('i',undefined,'rt-swatch');sw.style.background=brand;const lab=fitFs.querySelector('input[value=brand]');if(lab)lab.parentNode.append(sw)}
  const view=E('div',undefined,'rt-view');view.append(pick,ba,what);
  const side=E('div',undefined,'rt-side');side.append(fmtFs,fitFs,frameBox,groups,reset);
  const body=E('div',undefined,'rt-body');body.append(view,side);
  refine.replaceChildren(head,body);draw();renderExport()}
 // 4 · checks and files
 let chkRaf=0;function renderChecksLater(){clearTimeout(chkRaf);chkRaf=setTimeout(renderChecks,200)}
 const chkBox=E('div',undefined,'rt-checks');
 function checksOf(it){const rc=recipeOf(it),f=fmt(),srcR=st.fit==='crop'?cropRect(it.w,it.h,f.ratio,it.focus):{x:0,y:0,w:it.w,h:it.h};
  const L=st.fit==='crop'?{W:srcR.w,H:srcR.h}:padLayout(srcR.w,srcR.h,f.ratio||srcR.w/srcR.h),out=outputSize(L.W,L.H,st.useId);
  const after=analyze(render(it.pre,{recipe:{...rc,sharpen:0},formatId:'originale'}));return {rc,out,list:checks({before:it.analysis,after,out,useId:st.useId,recipe:rc,fit:st.fit})}}
 function renderChecks(){if(exp.hidden)return;const rows=st.items.map((it,i)=>({it,i,...checksOf(it)}));
  const sum={ok:0,warn:0,fail:0};rows.forEach(r=>sum[worst(r.list)]++);
  chkBox.replaceChildren(E('h5','Controlli sui pixel ritoccati'),E('p',sum.ok+' a posto · '+sum.warn+' da guardare · '+sum.fail+' da sistemare','rt-sum'));
  const ul=E('ul',undefined,'rt-check-list');rows.forEach(r=>{const li=E('li',undefined,'rt-check-row');li.dataset.level=worst(r.list);const t=E('strong',(r.i+1)+' · '+r.it.name);
   const w=r.out;const meta=E('small',w.w+' × '+w.h+' px'+(w.small?' (non ingrandita)':''));const inner=E('ul',undefined,'fp-checks');
   r.list.filter(c=>c.level!=='ok'||c.id==='misura').forEach(c=>{const x=E('li',undefined,'fp-check');x.dataset.level=c.level;x.dataset.check=c.id;x.append(E('strong',c.label),E('span',c.msg));inner.append(x)});
   const go=button('Guarda','rt-mini');go.onclick=()=>{st.active=r.i;renderRefine();refine.scrollIntoView&&refine.scrollIntoView({behavior:'smooth',block:'start'})};
   li.append(t,meta,inner,go);ul.append(li)});chkBox.append(ul)}
 function renderExport(){const head=E('div',undefined,'pf-card-head');head.append(E('h4','Controlli e file'),E('p','Scegli l’uso: decide la misura dei file. RADIX non ingrandisce mai una foto piccola.','muted'));
  const uses=E('fieldset',undefined,'fs-choice rt-choice');uses.dataset.key='useId';uses.append(E('legend','Uso'));
  USES.forEach(u=>{const l=E('label',undefined,'ps-chip'),x=E('input');x.type='radio';x.name='rt-use-'+n;x.value=u.id;x.checked=st.useId===u.id;x.onchange=()=>{st.useId=u.id;st.files=[];renderChecks()};l.title=u.sub;l.append(x,E('span',u.label));uses.append(l)});
  const q=E('label',undefined,'fp-slider rt-slider rt-quality'),qt=E('span'),qo=E('output',String(st.quality)),qx=E('input');qx.type='range';qx.min='60';qx.max='95';qx.step='1';qx.value=String(st.quality);qx.oninput=()=>{st.quality=+qx.value;qo.textContent=qx.value;st.files=[]};qt.append(E('span','Qualità JPEG'),qo);q.append(qt,qx);
  const wb=E('label',undefined,'ps-chip rt-webp'),wx=E('input');wx.type='checkbox';wx.checked=st.webp;wx.onchange=()=>{st.webp=wx.checked;st.files=[]};wb.append(wx,E('span','Anche in WebP (più leggero, per il sito)'));
  const nm=E('label',undefined,'rt-name'),nx=E('input');nx.type='text';nx.value=st.baseName;nx.maxLength=40;nx.oninput=()=>{st.baseName=slug(nx.value)||'foto';ex.textContent='Es. '+fileName(st.baseName,0,st.items.length,{formatId:st.formatId});st.files=[]};
  const ex=E('small','Es. '+fileName(st.baseName,0,st.items.length,{formatId:st.formatId}),'muted');nm.append(E('span','Nome dei file'),nx,ex);
  const opts=E('div',undefined,'rt-opts');opts.append(q,nm,wb);
  const meta=E('p','Dati EXIF tolti: posizione GPS, modello del telefono, data e ora non finiscono nei file. Restano solo i pixel.','ad-note rt-exif');
  const up=E('div',undefined,'rt-upscale');const ub=button('Ingrandisci e restaura · con fornitore, da collegare','rt-upscale-btn');ub.disabled=true;ub.setAttribute('aria-disabled','true');up.append(ub,E('small','Upscaling per la stampa e restauro di foto rovinate richiedono un fornitore di editing a pagamento, non ancora collegato.','muted'));
  const go=button('Crea i file ('+st.items.length+(st.items.length===1?' foto':' foto')+')','primary'),acts=E('div',undefined,'ps-actions');const rs=E('p','','tool-status');rs.setAttribute('role','status');
  const saveB=button('Salva le impostazioni nel progetto');acts.append(go,saveB);
  const out=E('div',undefined,'rt-out');out.hidden=!st.files.length;
  go.onclick=()=>build(go,rs,out);
  saveB.onclick=async()=>{if(!ctx.workspace||!ctx.projectId){rs.textContent='Apri un progetto per salvare.';return}saveB.disabled=true;
   try{await saveToProject(ctx.workspace,ctx.projectId,settingsRecord({...st,photos:st.items.length},{by:ctx.by}));rs.replaceChildren(doc().createTextNode('Impostazioni salvate nel progetto (look, regolazioni, formato, uso). Le foto no: restano sul tuo computer. '));if(ctx.agentsUrl){const a=E('a','Apri in Agenti AI →');a.href=ctx.agentsUrl;rs.append(a)}loadSaved()}
   catch(e){rs.textContent='Salvataggio non riuscito: '+e.message}finally{saveB.disabled=false}};
  exp.replaceChildren(head,uses,chkBox,opts,meta,up,acts,rs,out);renderChecks();if(st.files.length)renderOut(out)}
 async function build(go,rs,out){if(st.busy)return;st.busy=true;go.disabled=true;const files=[],rows=[],f=fmt(),total=st.items.length,date=new Date();
  try{for(const [i,it] of st.items.entries()){rs.textContent='Preparo la foto '+(i+1)+' di '+total+'…';
    const src=await decode(it.file),w=src.width||src.naturalWidth,h=src.height||src.naturalHeight,rc=recipeOf(it);
    const r=st.fit==='crop'?cropRect(w,h,f.ratio,it.focus):{x:0,y:0,w,h},L=st.fit==='crop'?{W:r.w,H:r.h}:padLayout(r.w,r.h,f.ratio||r.w/r.h),o=outputSize(L.W,L.H,st.useId),k=o.w/L.W;
    const iw=Math.max(1,Math.round(r.w*k)),ih=Math.max(1,Math.round(r.h*k)),base=pixels(src,r,iw,ih);if(src.close)src.close();
    const before=analyze(base);let img=apply(base,rc,{sharpRadius:radiusFor(Math.max(iw,ih))});const after=analyze(img);
    if(st.fit!=='crop')img=pad(img,f.ratio||iw/ih,st.fit==='white'?'#FFFFFF':brand||'#FFFFFF');
    const cv=paint(canvas(1,1),img),name=fileName(st.baseName,i,total,{formatId:st.formatId,ext:'jpg'}),jpg=stripJpeg(await blobBytes(cv,'image/jpeg',st.quality/100));files.push({name,data:jpg,label:name,photo:i});
    if(st.webp){try{const wp=stripWebp(await blobBytes(cv,'image/webp',st.quality/100));files.push({name:name.replace(/\.jpg$/,'.webp'),data:wp,label:name.replace(/\.jpg$/,'.webp'),photo:i})}catch(e){}}
    rows.push({name,w:img.width,h:img.height,what:describe(rc,it.analysis),checks:checks({before,after,out:o,useId:st.useId,recipe:rc,fit:st.fit})});await new Promise(ok=>setTimeout(ok,0))}
   files.push({name:'LEGGIMI.txt',data:new TextEncoder().encode(readme({project:ctx.projectName,look:st.look,adjust:st.adjust,formatId:st.formatId,fit:st.fit,useId:st.useId,quality:st.quality,webp:st.webp,rows,date})),label:'Istruzioni'});
   st.files=files;rs.textContent='';setStep(4);renderOut(out)}
  catch(e){rs.textContent='File non creati: '+e.message}finally{st.busy=false;go.disabled=false}}
 function renderOut(out){out.hidden=false;const zipName=(st.baseName||'foto')+'-ritoccate.zip',size=st.files.reduce((s,f)=>s+f.data.length,0);
  const zb=button('Scarica tutto (.zip)','primary');zb.onclick=()=>download(zipName,bundle(st.files.map(f=>({name:(st.baseName||'foto')+'/'+f.name,data:f.data}))),'application/zip');
  const ul=E('ul',undefined,'rt-files');st.files.forEach(f=>{const li=E('li'),t=E('span',undefined,'co-file');t.append(E('strong',f.name),E('small',kb(f.data.length)));const b=button('Scarica','co-dl');b.onclick=()=>download(f.name,f.data,/\.webp$/.test(f.name)?'image/webp':/\.txt$/.test(f.name)?'text/plain;charset=utf-8':'image/jpeg');li.append(t,b);ul.append(li)});
  const acts=E('div',undefined,'ps-actions');acts.append(zb,E('span',st.files.length+' file · '+kb(size)+' · senza dati EXIF','muted'));out.replaceChildren(E('h5','I file'),acts,ul)}
 async function loadSaved(){if(!ctx.workspace||!ctx.projectId)return;try{const s=readStore(await ctx.workspace.bind(ctx.projectId,'agents').load());if(!s.items.length){saved.hidden=true;return}
  saved.replaceChildren(E('h4','Impostazioni salvate nel progetto'));const row=E('div',undefined,'ad-saved-row');
  s.items.slice(-4).reverse().forEach(r=>{const l=LOOKS.find(x=>x.id===r.look)||LOOKS[0],b=button(l.label+' · '+(FORMATS.find(x=>x.id===r.formatId)||FORMATS[0]).label+' · '+String(r.at||'').slice(0,10),'ad-saved-item');
   b.onclick=()=>{st.look=l.id;st.adjust={...ZERO,...(r.adjust||{})};st.formatId=r.formatId;st.fit=r.fit;st.useId=r.useId;st.quality=r.quality||85;st.webp=!!r.webp;if(r.baseName)st.baseName=r.baseName;
    say('Impostazioni «'+l.label+'» pronte: carica le foto'+(st.items.length?' o guarda la rifinitura':'')+'.');if(st.items.length){st.props=proposals(st.items.map(i=>i.analysis));renderProps();renderRefine()}};row.append(b)});
  saved.append(row);saved.hidden=false}catch(e){}}
 loadSaved();
 return wrap}

return Object.freeze({MAX_PHOTOS,PREVIEW_SIDE,MAX_EXPORT_SIDE,MIN_SIDE,FORMATS,USES,FITS,ADJUST,ZERO,OWN,LOOKS,UPSCALE_NOTE,
 toLin,toSrgb,lumaOf,image,analyze,issuesOf,castName,tempTintGains,shoulder,toneCurve,luts,normalize,mappedMedian,solveExposure,
 setStats,proposals,autoFor,plan,describe,apply,unsharp,gaussKernel,blurPlane,radiusFor,cropRect,padLayout,outputSize,resize,crop,pad,render,
 checks,worst,slug,fileName,stripJpeg,stripWebp,hasMetadata,readme,bundle,readStore,settingsRecord,addRecord,saveToProject,brandColour,retouchStudio});
});
