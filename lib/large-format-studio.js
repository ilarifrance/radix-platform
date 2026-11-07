/* Studio «Grande formato» (agency job P6), a step of the Studio Stampa (lib/print-studio.js): totem, banner and striscioni,
   vele and bandiere, forex/dibond panels, the 6 × 3 m road poster and a free size in cm, as PDF for the print shop. No AI.
   1. Questions: the piece and its size, the distance it is read from, the texts (prefilled from the project and its brand
      kit, never invented: an empty required text stays a placeholder that blocks the export), the contacts, a photo.
   2. Three layouts built here from the Kit identità (profile.identityKit) or the colours of profile.visual: Classico,
      Deciso, Minimal, each for upright (totem, vela, panel) and wide (banner, poster) pieces. The person picks one.
   3. Refine: bleed (1–5 cm, a default per format), safe area, scale, eyelet marks, distance; the checks update live.
   4. Export: the PDF writer of lib/print-studio.js (PDF/X-1a-style, DeviceCMYK, texts as outlines, vector logo), with:
      - page = trim + bleed + a 10 mm slug per side; crop marks in the slug; TrimBox and BleedBox;
      - scale 1:1, or 1:10 when the page would pass 5080 mm (200 in = 14 400 pt, the page limit of PDF readers) or when
        asked (the 6 × 3 m poster is always delivered at 1:10): everything (trim, bleed, texts, logo, photo) is drawn at a
        tenth and the slug says «SCALA 1:10 · stampare al 1000%» with the real size;
      - eyelet marks (banners): a circle and a cross every ≤ 50 cm, 2,5 cm from the trim, under the eyelets;
      - the vela pole pocket (6 cm on the left) kept free of texts and logo.
   Checks: required texts present (placeholders block), bleed, safe area (and pocket, eyelets, texts that do not fit),
   text size for the viewing distance (a practice estimate: title cap height ≥ distance / 35, so ~8,6 cm at 3 m, other
   texts ≥ distance / 250; a warning), photos at the effective dpi the format needs (150 dpi at the real size; 30 dpi for
   the 6 × 3 m poster, i.e. 300 dpi in the 1:10 file; a warning), total ink ≤ 300 %, characters Helvetica can draw.
   Pure part runs in Node for the tests; largeFormatStudio() is the browser widget mounted by the Studio Stampa. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixLargeFormatStudio=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
function lib(name,file){if(root[name])return root[name];try{return typeof require==='function'?require(file):null}catch(e){return null}}
const PS=()=>lib('RadixPrintStudio','./print-studio.js');
const MM=72/25.4,ASCENT=.718,DESCENT=.207,SLUG=10,PDF_MAX=5080,BLEED_MIN=10,BLEED_MAX=50,TITLE_RATIO=35,TEXT_RATIO=250,EYELET_R=5,AGENT='art-director',MAX_KEPT=60;
const clean=s=>String(s==null?'':s).replace(/\s+/g,' ').trim();
const num=n=>{const v=Math.round(n*1000)/1000;return Object.is(v,-0)?'0':String(v)};
const cm=mm=>String(Math.round(mm/10*10)/10).replace('.',',');// mm → «12,5» (cm)
const mmText=n=>String(Math.round(n*10)/10).replace('.',',');
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const ptToMm=pt=>pt/MM,capOf=size=>ptToMm(size*ASCENT),sizeFor=cap=>cap*MM/ASCENT;

// ---- formats ----
const GROUPS=Object.freeze([
 {id:'totem',title:'Totem'},{id:'banner',title:'Banner e striscioni'},{id:'vela',title:'Vele e bandiere'},
 {id:'pannello',title:'Pannelli forex e dibond'},{id:'poster',title:'Manifesto 6 × 3 m'},{id:'custom',title:'Misura libera'}]);
// w, h: trim in mm; bleed, safe: mm; distance: m (where it is read from); dpi: effective dpi at the real size;
// scale: the delivery scale (10 = 1:10); eyelets: {step, offset} mm; pocket: mm on the left (pole sleeve of the vela).
const FORMATS=Object.freeze([
 {id:'totem-80x180',group:'totem',title:'Totem 80 × 180 cm',w:800,h:1800,bleed:20,safe:30,distance:3,contacts:true,line:'Cartone o forex autoportante, ingressi e fiere.'},
 {id:'totem-100x200',group:'totem',title:'Totem 100 × 200 cm',w:1000,h:2000,bleed:20,safe:30,distance:3,contacts:true,line:'Più visibile, per spazi grandi.'},
 {id:'banner-300x100',group:'banner',title:'Banner 300 × 100 cm',w:3000,h:1000,bleed:30,safe:50,distance:5,contacts:true,eyelets:{step:500,offset:25},line:'PVC con occhielli, per recinzioni e facciate.'},
 {id:'banner-500x100',group:'banner',title:'Striscione 500 × 100 cm',w:5000,h:1000,bleed:30,safe:50,distance:8,contacts:true,eyelets:{step:500,offset:25},line:'Per strade, campi sportivi, cantieri.'},
 {id:'vela-70x250',group:'vela',title:'Vela 70 × 250 cm',w:700,h:2500,bleed:20,safe:30,distance:5,contacts:false,pocket:60,line:'Bandiera con asta: tasca di 6 cm a sinistra.'},
 {id:'vela-85x350',group:'vela',title:'Vela 85 × 350 cm',w:850,h:3500,bleed:20,safe:30,distance:6,contacts:false,pocket:60,line:'La misura grande, per esterni.'},
 {id:'pannello-70x100',group:'pannello',title:'Pannello 70 × 100 cm',w:700,h:1000,bleed:10,safe:20,distance:3,contacts:true,rotate:true,line:'Forex o dibond, verticale o orizzontale.'},
 {id:'pannello-100x140',group:'pannello',title:'Pannello 100 × 140 cm',w:1000,h:1400,bleed:10,safe:20,distance:3,contacts:true,rotate:true,line:'Insegne interne, vetrine, cantieri.'},
 {id:'poster-6x3',group:'poster',title:'Manifesto 6 × 3 m',w:6000,h:3000,bleed:50,safe:100,distance:15,contacts:true,scale:10,dpi:30,line:'Affissione stradale: file in scala 1:10.'},
 {id:'custom',group:'custom',title:'Misura libera',w:0,h:0,bleed:20,safe:30,distance:5,contacts:true,custom:true,line:'Larghezza e altezza in centimetri.'}]);
const CUSTOM={minCm:30,maxWCm:2000,maxHCm:1000,w:2000,h:1000};
const format=id=>FORMATS.find(f=>f.id===id)||null;
const need=id=>{const f=format(id);if(!f)throw Error('Formato sconosciuto: '+id);return f};
const FIELDS=Object.freeze({
 name:{label:'Nome dell’attività',max:80,ph:'Dal Kit identità o dal progetto'},payoff:{label:'Payoff (facoltativo)',max:90,ph:'La frase sotto il nome'},
 headline:{label:'Titolo',max:60,ph:'Poche parole, si legge da lontano'},body:{label:'Testo (facoltativo)',rows:3,max:240,ph:'Una o due righe al massimo'},
 cta:{label:'Invito all’azione (facoltativo)',max:60,ph:'Es. Aperti tutti i giorni dalle 7'},
 phone:{label:'Telefono',max:40},website:{label:'Sito web',max:80},email:{label:'Email',max:80},address:{label:'Indirizzo',max:160}});
const FIELD_IDS=Object.keys(FIELDS),CONTACTS=['phone','website','email','address'];
// The texts each piece cannot go without (the name or the logo always): empty → placeholder, export blocked.
const REQUIRED=Object.freeze({totem:['headline'],banner:['headline'],vela:[],pannello:['headline'],poster:['headline'],custom:['headline']});
const VARIANTS=Object.freeze([
 {id:'classic',title:'Classico',line:'Logo in evidenza e una fascia di colore con i contatti.'},
 {id:'bold',title:'Deciso',line:'Colore del brand a tutto campo, titolo grandissimo.'},
 {id:'minimal',title:'Minimal',line:'Fondo chiaro, tanto spazio, una linea d’accento.'}]);
const variantOf=v=>VARIANTS.some(x=>x.id===v)?v:'classic';

// The size, bleed, safe area, scale and marks of a piece. opts: {bleed (mm), safe (mm), distance (m), scale ('auto'|1|10),
// eyelets (bool), eyeletStep (mm), eyeletOffset (mm), landscape (bool, panels), customW, customH (cm)}.
function spec(id,opts={}){const f=need(id),notes=[];let w=f.w,h=f.h;
 if(f.custom){const cw=+opts.customW,ch=+opts.customH;w=Math.round(clamp(isFinite(cw)&&cw>0?cw:CUSTOM.w/10,CUSTOM.minCm,CUSTOM.maxWCm)*10);h=Math.round(clamp(isFinite(ch)&&ch>0?ch:CUSTOM.h/10,CUSTOM.minCm,CUSTOM.maxHCm)*10)}
 if(f.rotate&&opts.landscape){const t=w;w=h;h=t}
 const bv=+opts.bleed,bleed=opts.bleed!==''&&opts.bleed!=null&&isFinite(bv)?clamp(Math.round(bv),BLEED_MIN,BLEED_MAX):f.bleed;
 const sv=+opts.safe,safe=opts.safe!==''&&opts.safe!=null&&isFinite(sv)?clamp(Math.round(sv),10,Math.round(Math.min(w,h)/4)):f.safe;
 const dv=+opts.distance,distance=opts.distance!==''&&opts.distance!=null&&isFinite(dv)&&dv>0?clamp(Math.round(dv*10)/10,1,100):f.distance;
 const eyelets=f.group==='banner'||f.custom?(opts.eyelets==null?!!f.eyelets:!!opts.eyelets):false;
 const ey=eyelets?{step:clamp(+opts.eyeletStep||(f.eyelets&&f.eyelets.step)||500,300,1000),offset:clamp(+opts.eyeletOffset||(f.eyelets&&f.eyelets.offset)||25,15,50),r:EYELET_R}:null;
 const fits=k=>Math.max(w,h)/k+2*(bleed/k+SLUG)<=PDF_MAX+1e-9;
 const want=String(opts.scale)==='10'?10:String(opts.scale)==='1'?1:(f.scale||1);let scale=want;
 if(scale===1&&!fits(1)){scale=10;notes.push('Alla misura reale la pagina supererebbe '+cm(PDF_MAX)+' cm, il limite dei PDF: il file è in scala 1:10.')}
 // the safe area grows to keep texts away from the eyelets
 const safeEff=ey?Math.max(safe,ey.offset+ey.r+10):safe;
 return {id:f.id,group:f.group,title:f.custom?'Misura libera '+cm(w)+' × '+cm(h)+' cm':f.rotate&&w>h?f.title.replace(/(\d+) × (\d+)/,'$2 × $1'):f.title,
  w,h,bleed,safe,safeEff,distance,dpi:f.dpi||150,scale,eyelets:ey,hidden:{left:f.pocket||0},contacts:opts.contacts==null?f.contacts:!!opts.contacts,notes}}
// The PDF page of a spec, in mm on the page (after the scale): trim, bleed box, media box.
function pageBox(s){const k=1/s.scale,tw=s.w*k,th=s.h*k,b=s.bleed*k,o=b+SLUG;
 return {scale:s.scale,trim:{w:tw,h:th},bleed:b,bleedBox:{w:tw+2*b,h:th+2*b},slug:SLUG,media:{w:tw+2*o,h:th+2*o},pt:{w:(tw+2*o)*MM,h:(th+2*o)*MM},offset:o}}
const scaleNote=s=>s.scale===10?'SCALA 1:10 · stampare al 1000% · misura reale '+cm(s.w)+' × '+cm(s.h)+' cm':'SCALA 1:1 · misura reale '+cm(s.w)+' × '+cm(s.h)+' cm';
// Eyelet centres (mm on the trim): the corners at `offset` from the edges, then evenly spaced at most `step` apart.
function eyelets(s){const e=s&&s.eyelets;if(!e)return [];const out=[],o=e.offset,W=s.w,H=s.h;
 const along=len=>{const span=len-2*o,n=Math.max(1,Math.ceil(span/e.step-1e-9));return Array.from({length:n+1},(_,i)=>o+span*i/n)};
 for(const x of along(W)){out.push({x,y:o,r:e.r});out.push({x,y:H-o,r:e.r})}
 for(const y of along(H).slice(1,-1)){out.push({x:o,y,r:e.r});out.push({x:W-o,y,r:e.r})}
 return out}
// Text size for the viewing distance (m → mm of cap height): a practice estimate, no standard behind it.
const minCaps=distance=>({title:distance*1000/TITLE_RATIO,text:distance*1000/TEXT_RATIO});

// ---- brand: the kit, else the colours written in profile.visual, else neutral (as lib/report-studio.js) ----
function brandFor(profile,projectName){const P=PS(),b=P.brandOf(profile,projectName);if(b.fromKit)return {...b,source:'kit'};
 const hs=String(profile&&profile.visual||'').match(/#[0-9a-f]{6}\b/gi)||[];if(!hs.length)return {...b,source:'default'};
 const pal={...b.palette,primary:hs[0].toUpperCase()};if(hs[1])pal.secondary=hs[1].toUpperCase();if(hs[2])pal.accent=hs[2].toUpperCase();
 return {...b,palette:pal,source:'visual'}}
// The fields from the project: name and payoff from the kit/profile, contacts from the profile and its facts.
function prefill(profile,{projectName,summary}={}){const p=PS().prefill(profile,{projectName,summary}),v={};for(const k of FIELD_IDS)v[k]=clean(p[k]||'').slice(0,FIELDS[k].max);return v}
const valuesOf=values=>{const v={};for(const k of FIELD_IDS)v[k]=String((values||{})[k]==null?'':values[k]).replace(/\r/g,'').slice(0,FIELDS[k].max);return v};
function contactList(v,s){const keys=s.w>s.h||s.group==='vela'?['website','phone']:['website','phone','address'];return keys.map(k=>clean(v[k])).filter(Boolean)}
// What is missing: [{key,label}] (the name only when there is no logo either).
function missing(values,s,brand){const v=valuesOf(values),out=[];if(!(brand&&brand.logo)&&!clean(v.name))out.push({key:'name',label:'Logo o nome'});
 for(const k of REQUIRED[s.group]||[])if(!clean(v[k]))out.push({key:k,label:FIELDS[k].label});
 if(s.contacts&&!contactList(v,s).length)out.push({key:'contacts',label:'Contatti (sito o telefono)'});return out}

// ---- layout (items in mm on the real trim, origin top-left: the lib/print-studio.js document shape) ----
// photo: {src,w,h} or null.
function layout(id,values,brand,opts={}){const P=PS(),s=spec(id,opts),v=valuesOf(values),br=brand||brandFor({},v.name),variant=variantOf(opts.variant);
 const W=s.w,H=s.h,bl=s.bleed,pal=br.palette,hidL=s.hidden.left,sf=s.safeEff,x0=hidL+sf,x1=W-sf,y0=sf,y1=H-sf,iw=x1-x0,U=Math.min(W,H),mc=minCaps(s.distance);
 const items=[],holders=[],b=P.builder({id:s.id,w:W,h:H},br,v,sf,{variant,photo:opts.photo||null});b.items=items;
 const miss=new Set(missing(v,s,br).map(m=>m.key)),gap=Math.max(U*.035,sf*.6);
 const full=fill=>b.rect(-bl,-bl,W+2*bl,H+2*bl,fill);
 const holder=(x,y,w,h,label)=>{const it={t:'placeholder',x,y,w,h,label,text:'['+label+': da completare]'};items.push(it);holders.push(it);return y+h};
 // the largest cap height ≤ want whose longest word fits the width
 const fit=(text,want,width,bold)=>{let c=want;const words=clean(text).split(' ');while(c>2&&words.some(w=>P.textWidth(w,sizeFor(c),bold)/MM>width))c*=.94;return c};
 const lines=(text,cap,width,bold)=>P.wrap(text,sizeFor(cap),width,bold).length;
 const heightOf=(text,cap,width,bold,lead=1.15)=>{const n=lines(text,cap,width,bold);return n?capOf(sizeFor(cap))+(n-1)*ptToMm(sizeFor(cap)*lead)+ptToMm(sizeFor(cap)*DESCENT):0};
 // a text block from its top: the value, or a placeholder when required and empty
 const put=(key,x,y,w,cap,o={})=>{const t=key==='contacts'?(s.contacts?contactList(v,s).join('   ·   '):''):clean(v[key]);
  if(!t){if(miss.has(key)){const h=cap*1.6;return holder(x,y,w,h,key==='contacts'?'Contatti':FIELDS[key].label)+gap*.6}return y}
  let c=key==='headline'||o.fit?fit(t,cap,w,o.bold):cap;const lead=o.lead||1.15;
  if(key==='headline'&&o.maxY!=null)while(c>2&&heightOf(t,c,w,true,lead)>o.maxY-y)c*=.94;// the title shrinks to fit (the size check then warns)
  const size=sizeFor(c);
  return b.para(x,y,w,t,{size,lead,bold:!!o.bold,fill:o.fill,align:o.align,label:o.label,maxY:o.maxY,after:o.after==null?gap*.5:o.after})};
 const logo=(x,y,w,h,o={})=>{if(br.logo||clean(v.name)){b.logo(x,y,w,h,{...o,scale:1000});return}holder(x,y+h*.2,w,h*.6,'Logo o nome')};
 const caps={title:Math.max(mc.title,U*.09),payoff:Math.max(mc.text,U*.032),body:Math.max(mc.text,U*.026),cta:Math.max(mc.text*1.4,U*.042),contact:Math.max(mc.text,U*.03)};
 const ink=(bg,...p)=>P.ink(bg,pal,...p),light=pal.light;
 const bottomBlock=(x,w,bottom,fill,align,o={})=>{// cta + contacts, bottom-aligned at `bottom`; returns the top
  const ct=s.contacts?(contactList(v,s).join('   ·   ')||(miss.has('contacts')?'x':'')):'',cta=clean(v.cta);
  const hC=ct?(contactList(v,s).length?heightOf(ct,caps.contact,w,false,1.3):caps.contact*1.6):0,hA=cta?heightOf(cta,caps.cta,w,true):0,top=bottom-hC-(hA?hA+gap*.4:0);
  let y=top;if(cta)y=put('cta',x,y,w,caps.cta,{bold:true,fill,align,label:'Invito all’azione',maxY:bottom,after:gap*.4});
  if(ct)put('contacts',x,y,w,caps.contact,{fill,align,label:'Contatti',maxY:bottom+.5,lead:1.3,after:0,fit:true});return top};
 // moves what was drawn from item i on by half the free space down to `limit` (vertical centring of the text block)
 const centre=(i,yEnd,limit)=>{const dy=(limit-yEnd)/2;if(!(dy>1))return;for(const it of items.slice(i)){if(it.t==='line'){it.y1+=dy;it.y2+=dy}else it.y+=dy}};
 const portrait=H>=W,vela=s.group==='vela';
 if(portrait){
  if(variant==='bold'){full(pal.primary);const on=ink(pal.primary,light,pal.dark);let y=y0;
   if(b.photo(-bl,-bl,W+2*bl,H*.34+bl,{bg:pal.primary}))y=H*.34+gap;
   const lh=Math.min((H-y)*.12,iw*.32);logo(x0,y,iw*.7,lh,{align:'left',mono:on,bg:pal.primary});y+=lh+gap;
   const band=H*(vela?.12:.2),bandTop=H-band,i=items.length;
   y=put('payoff',x0,y,iw,caps.payoff,{fill:on,label:'Payoff',maxY:bandTop-gap});
   y=put('headline',x0,y,iw,caps.title*1.1,{bold:true,fill:on,label:'Titolo',maxY:bandTop-gap,lead:1.05,after:gap*.7});
   y=put('body',x0,y,iw,caps.body,{fill:on,label:'Testo',maxY:bandTop-gap,lead:1.3});centre(i,y,bandTop-gap);
   b.rect(-bl,bandTop,W+2*bl,band+bl,pal.accent);bottomBlock(x0,iw,y1,ink(pal.accent,pal.dark,light),'left')}
  else if(variant==='minimal'){full(light);const head=ink(light,pal.primary,pal.dark),txt=ink(light,pal.dark),soft=ink(light,pal.secondary,pal.dark);let y=y0;
   const lh=Math.min(H*.07,iw*.3);logo(x0,y,iw*.5,lh,{align:'left'});y+=lh+gap*1.5;
   if(b.photo(x0,y,iw,H*.3))y+=H*.3+gap*1.2;else y+=H*.08;
   const bottom=y1,line=bottomBlock(x0,iw,bottom,soft,'left')-gap;b.line(x0,line,x1,line,pal.secondary,Math.max(2,U*.008));
   b.rect(x0,y,Math.min(iw*.25,U*.12),Math.max(3,U*.008),pal.accent);y+=Math.max(3,U*.008)+gap;
   y=put('headline',x0,y,iw,caps.title,{bold:true,fill:head,label:'Titolo',maxY:line-gap,after:gap*.6});
   y=put('payoff',x0,y,iw,caps.payoff,{fill:soft,label:'Payoff',maxY:line-gap});
   put('body',x0,y,iw,caps.body,{fill:txt,label:'Testo',maxY:line-gap,lead:1.35})}
  else{full(light);const head=ink(light,pal.primary,pal.dark),txt=ink(light,pal.dark),soft=ink(light,pal.secondary,pal.dark);let y=y0;
   const band=H*(vela?.12:.22),bandTop=H-band;b.rect(-bl,bandTop,W+2*bl,band+bl,pal.primary);b.rect(-bl,bandTop-Math.max(6,U*.012),W+2*bl,Math.max(6,U*.012),pal.accent);
   const lh=Math.min(H*.11,iw*.4);logo(x0,y,iw,lh);y+=lh+gap*.8;
   y=put('payoff',x0,y,iw,caps.payoff,{fill:soft,align:'center',label:'Payoff',maxY:bandTop-gap});
   if(b.photo(-bl,y,W+2*bl,H*.26))y+=H*.26+gap;else y+=gap;const i=items.length;
   y=put('headline',x0,y,iw,caps.title,{bold:true,fill:head,align:'center',label:'Titolo',maxY:bandTop-gap*1.5,after:gap*.6});
   y=put('body',x0,y,iw,caps.body,{fill:txt,align:'center',label:'Testo',maxY:bandTop-gap*1.5,lead:1.3});centre(i,y,bandTop-gap*1.5);
   bottomBlock(x0,iw,y1,ink(pal.primary,light,pal.dark),'center')}}
 else{// wide: banner, poster, wide panels
  const ih=y1-y0;
  if(variant==='bold'){full(pal.primary);const on=ink(pal.primary,light,pal.dark);let tx=x0;
   const pw=Math.min(W*.3,H*1.1);if(b.photo(-bl,-bl,pw+bl,H+2*bl,{bg:pal.primary}))tx=pw+sf;const tw=x1-tx;
   const band=H*.24,bandTop=H-band;b.rect(-bl,bandTop,W+2*bl,band+bl,pal.accent);
   let y=y0;const lh=Math.min(ih*.16,tw*.25);logo(tx,y,tw*.4,lh,{align:'left',mono:on,bg:pal.primary});y+=lh+gap*.6;const i=items.length;
   y=put('headline',tx,y,tw,caps.title*1.1,{bold:true,fill:on,label:'Titolo',maxY:bandTop-gap*.6,lead:1.02,after:gap*.4});
   y=put('body',tx,y,tw,caps.body,{fill:on,label:'Testo',maxY:bandTop-gap*.6,lead:1.25});centre(i,y,bandTop-gap*.6);
   const t=ink(pal.accent,pal.dark,light),cta=clean(v.cta);
   if(cta){const cw=tw*.48;put('cta',tx,bandTop+(band-sf-caps.cta)/2,cw,caps.cta,{bold:true,fill:t,label:'Invito all’azione',maxY:y1,fit:true,after:0});
    if(s.contacts)put('contacts',tx+cw+gap,bandTop+(band-sf-caps.contact)/2,tw-cw-gap,caps.contact,{fill:t,align:'right',label:'Contatti',maxY:y1,fit:true,after:0})}
   else if(s.contacts)put('contacts',tx,bandTop+(band-sf-caps.contact)/2,tw,caps.contact,{fill:t,label:'Contatti',maxY:y1,fit:true,after:0})}
  else if(variant==='minimal'){full(light);const head=ink(light,pal.primary,pal.dark),txt=ink(light,pal.dark),soft=ink(light,pal.secondary,pal.dark);
   let tx=x0,tr=x1;const pw=Math.min(W*.28,H*1.1);if(b.photo(W-pw,-bl,pw+bl,H+2*bl))tr=W-pw-sf;const tw=tr-tx;
   const lh=Math.min(ih*.14,tw*.22);logo(tx,y0,tw*.35,lh,{align:'left'});let y=y0+lh+gap;
   const line=bottomBlock(tx,tw,y1,soft,'left')-gap*.6;b.line(tx,line,tr,line,pal.secondary,Math.max(1,U*.003)*2);
   b.rect(tx,y,Math.min(tw*.12,U*.2),Math.max(3,U*.01),pal.accent);y+=Math.max(3,U*.01)+gap*.6;
   y=put('headline',tx,y,tw,caps.title,{bold:true,fill:head,label:'Titolo',maxY:line-gap*.5,after:gap*.4});
   y=put('payoff',tx,y,tw,caps.payoff,{fill:soft,label:'Payoff',maxY:line-gap*.5});
   put('body',tx,y,tw,caps.body,{fill:txt,label:'Testo',maxY:line-gap*.5,lead:1.3})}
  else{full(light);const head=ink(light,pal.primary,pal.dark),txt=ink(light,pal.dark),soft=ink(light,pal.secondary,pal.dark);
   const cw=Math.min(W*.3,H*1.05);b.rect(-bl,-bl,cw+bl,H+2*bl,pal.primary);b.rect(cw,-bl,Math.max(6,U*.015),H+2*bl,pal.accent);
   logo(x0,y0+ih*.15,cw-x0-gap,ih*.5,{mono:ink(pal.primary,light,pal.dark),bg:pal.primary});
   const onP=ink(pal.primary,light,pal.dark);if(clean(v.payoff))put('payoff',x0,y0+ih*.7,cw-x0-gap,caps.payoff,{fill:onP,align:'center',label:'Payoff',maxY:y1,fit:true});
   let tx=cw+Math.max(6,U*.015)+sf,tr=x1;const pw=Math.min(W*.24,H*.9);if(b.photo(W-pw,-bl,pw+bl,H+2*bl))tr=W-pw-sf;const tw=tr-tx;
   const top=bottomBlock(tx,tw,y1,head,'left');let y=y0;const i=items.length;
   y=put('headline',tx,y,tw,caps.title,{bold:true,fill:head,label:'Titolo',maxY:top-gap*.6,lead:1.05,after:gap*.4});
   y=put('body',tx,y,tw,caps.body,{fill:txt,label:'Testo',maxY:top-gap*.6,lead:1.25});centre(i,y,top-gap*.6);void soft}}
 const doc={format:s.id,variant,spec:s,title:s.title+(clean(v.name)?' · '+clean(v.name):''),brand:br,values:v,dpi:s.dpi,bleed:bl,
  pages:[{label:'Fronte',w:W,h:H,items,folds:[],hidden:s.hidden,eyelets:eyelets(s)}],placeholders:holders,warnings:b.warnings.slice()};
 doc.warnings=doc.warnings.concat(P.glyphs(doc));return doc}

// ---- checks ----
function bbox(it){const P=PS();if(it.t==='text'){const w=P.textWidth(it.s,it.size,it.bold)/MM;return {x0:it.x,x1:it.x+w,y0:it.y-capOf(it.size),y1:it.y+ptToMm(it.size*DESCENT)}}
 if(it.t==='logo'||it.t==='placeholder')return {x0:it.x,x1:it.x+it.w,y0:it.y,y1:it.y+it.h};return null}
const nameOf=it=>it.t==='logo'?'Logo':it.label||'Testo';
// Texts and logo closer than the safe area to the trim, in the vela pocket or among the eyelets.
function safeProblems(doc){const s=doc.spec,p=doc.pages[0],out=[],seen=new Set(),hidL=s.hidden.left||0,need=s.safeEff;
 for(const it of p.items){const bb=bbox(it);if(!bb||it.t==='placeholder')continue;const key=nameOf(it);if(seen.has(key))continue;
  if(hidL&&bb.x0<hidL+need-1e-6){seen.add(key);out.push('«'+key+'» entra nella tasca dell’asta o è a meno di '+cm(need)+' cm da lei ('+cm(hidL)+' cm a sinistra): spostalo a destra.');continue}
  const d=Math.min(bb.x0,p.w-bb.x1,bb.y0,p.h-bb.y1);if(d>=need-1e-6)continue;seen.add(key);
  out.push('«'+key+'» è a '+(d<0?'meno di 0':cm(Math.max(0,d)))+' cm dal taglio: servono almeno '+cm(need)+' cm'+(s.eyelets?' (area sicura e occhielli)':'')+'.')}
 return out}
// Backgrounds and photos that touch the trim must run on to the bleed edge.
function bleedProblems(doc){const out=[],e=.01,B=doc.bleed;for(const p of doc.pages)for(const it of p.items){if(it.t!=='rect'&&it.t!=='image')continue;const x0=it.x,x1=it.x+it.w,y0=it.y,y1=it.y+it.h,sides=[];
 if(x0<=e&&x0>-B+e&&y1>0&&y0<p.h)sides.push('a sinistra');if(x1>=p.w-e&&x1<p.w+B-e&&y1>0&&y0<p.h)sides.push('a destra');
 if(y0<=e&&y0>-B+e&&x1>0&&x0<p.w)sides.push('in alto');if(y1>=p.h-e&&y1<p.h+B-e&&x1>0&&x0<p.w)sides.push('in basso');
 if(sides.length)out.push((it.t==='image'?'La foto':'Un fondo colorato')+' tocca il taglio '+sides.join(', ')+' senza arrivare all’abbondanza.')}return out}
// Texts smaller than the viewing distance asks: [{label, cap, need}] (mm of cap height), the smallest per label.
function sizeProblems(doc){const mc=minCaps(doc.spec.distance),by={};
 for(const it of doc.pages[0].items){if(it.t!=='text')continue;const cap=capOf(it.size),title=it.label==='Titolo',needCap=title?mc.title:mc.text;
  if(cap>=needCap-1e-6)continue;const k=it.label||'Testo';if(!by[k]||cap<by[k].cap)by[k]={label:k,cap,need:needCap,title}}
 return Object.values(by)}
// The checklist: state ok / warn (shown, does not block) / fail (blocks the PDF).
function checks(doc,settings={}){const P=PS(),s=doc.spec,out=[],add=(id,label,state,detail,issues=[])=>out.push({id,label,state,detail,issues});
 const miss=doc.placeholders.map(h=>h.label);
 add('content','Testi del progetto',miss.length?'fail':'ok',miss.length?'Mancano: '+[...new Set(miss)].join(', ')+'. Scrivili qui sopra: RADIX non li inventa e senza di loro il PDF non si scarica.':'Tutti i testi necessari ci sono: nessun segnaposto.',[...new Set(miss)]);
 const bp=bleedProblems(doc);add('bleed','Abbondanza '+cm(s.bleed)+' cm per lato',bp.length?'fail':'ok',bp.length?bp.join(' '):'Fondi e foto arrivano a '+cm(s.bleed)+' cm oltre il taglio; i segni di taglio sono nel margine esterno.',bp);
 const sp=safeProblems(doc),over=doc.warnings.filter(w=>w.kind==='overflow').map(w=>w.text),safeAll=sp.concat(over);
 add('safe','Area sicura',safeAll.length?'fail':'ok',safeAll.length?safeAll.join(' '):'Testi e logo ad almeno '+cm(s.safeEff)+' cm dal taglio'+(s.hidden.left?', fuori dalla tasca dell’asta':'')+(s.eyelets?', lontani dagli occhielli':'')+'; tutti i testi entrano.',safeAll);
 const mc=minCaps(s.distance),small=sizeProblems(doc);
 add('size','Leggibile a '+mmText(s.distance)+' m',small.length?'warn':'ok',(small.length?small.map(x=>'«'+x.label+'»: lettere maiuscole alte '+cm(x.cap)+' cm, ne servono circa '+cm(x.need)+' cm.').join(' ')+' Accorcia il testo o avvicina la distanza.':'Titolo alto almeno '+cm(mc.title)+' cm, gli altri testi almeno '+cm(mc.text)+' cm (altezza delle maiuscole).')+' Stima di pratica: titolo ≥ distanza ÷ '+TITLE_RATIO+', altri testi ≥ distanza ÷ '+TEXT_RATIO+'.',small.map(x=>x.label));
 const imgs=P.imagesReport(doc),low=imgs.filter(x=>!x.ok);
 add('dpi','Foto ≥ '+s.dpi+' dpi alla misura reale',low.length?'warn':'ok',!imgs.length?'Nessuna foto: logo e testi sono vettoriali.':low.length?low.map(x=>'«'+x.label+'» a '+x.dpi+' dpi alla misura reale ('+cm(x.mm.w)+' × '+cm(x.mm.h)+' cm): ne servono '+x.need+'. Si vedrà sgranata da vicino: usa una foto più grande.').join(' '):imgs.map(x=>'«'+x.label+'» '+x.dpi+' dpi').join(', ')+' alla misura reale.',low.map(x=>x.label));
 const ink=P.inkReport(doc,settings);add('ink','Inchiostro totale ≤ '+P.INK_LIMIT+'%',ink.ok?'ok':'fail',ink.ok?'Massimo '+Math.round(ink.max)+'%.':'Troppo inchiostro: '+ink.list.filter(x=>x.tac>P.INK_LIMIT).map(x=>(x.hex||x.label||'immagine')+' '+Math.round(x.tac)+'%').join(', ')+'.');
 const gw=doc.warnings.filter(w=>w.kind==='glyph');add('fonts','Caratteri',gw.length?'fail':'ok',gw.length?gw.map(w=>w.text).join(' '):'Testi convertiti in tracciati: nessun font da incorporare.');
 const bx=pageBox(s);add('scale','Scala '+(s.scale===10?'1:10':'1:1'),'ok',(s.scale===10?'Il file è un decimo della misura reale: pagina '+mmText(bx.media.w)+' × '+mmText(bx.media.h)+' mm, la tipografia lo stampa al 1000%. ':'File alla misura reale: pagina '+mmText(bx.media.w/10)+' × '+mmText(bx.media.h/10)+' cm. ')+'La scala è scritta nel margine del PDF.'+(s.notes.length?' '+s.notes.join(' '):''));
 add('cmyk','CMYK','ok','Colori in CMYK, profilo FOGRA39 indicato per nome: per il grande formato molte tipografie usano un loro profilo (per esempio FOGRA51 o quello del supporto). Chiedilo e correggi i valori CMYK se serve.');
 return out}
const blocking=list=>list.filter(c=>c.state==='fail');

// ---- the PDF ----
// The document drawn at the delivery scale: everything × 1/scale, the eyelets and the notes in the slug.
function forPdf(doc){const s=doc.spec,k=1/s.scale,bx=pageBox(s),sc=v=>v*k;
 const it2=it=>{switch(it.t){case 'rect':return {...it,x:sc(it.x),y:sc(it.y),w:sc(it.w),h:sc(it.h)};case 'line':return {...it,x1:sc(it.x1),y1:sc(it.y1),x2:sc(it.x2),y2:sc(it.y2),width:it.width*k};
  case 'text':return {...it,x:sc(it.x),y:sc(it.y),size:it.size*k};case 'image':case 'logo':return {...it,x:sc(it.x),y:sc(it.y),w:sc(it.w),h:sc(it.h)};default:return null}};
 return {...doc,bleed:s.bleed*k,slug:SLUG,pages:doc.pages.map(p=>({label:p.label,w:sc(p.w),h:sc(p.h),folds:[],items:p.items.map(it2).filter(Boolean),eyelets:(p.eyelets||[]).map(e=>({x:sc(e.x),y:sc(e.y),r:sc(e.r)})),slugTexts:slugTexts(doc,bx)}))}}
// The notes in the slug (mm on the PDF page, baseline): the scale on top, the specs at the bottom; shrunk to fit the trim width.
function slugTexts(doc,bx){const P=PS(),s=doc.spec,o=bx.offset,width=bx.trim.w-8,out=[];
 const line=(text,y,bold)=>{let size=7;while(size>3&&P.textWidth(text,size,bold)/MM>width)size-=.25;let t=text;while(t.length>4&&P.textWidth(t,size,bold)/MM>width)t=t.slice(0,-2);if(t!==text)t=t.replace(/\s*\S?$/,'')+'…';
  out.push({s:t,x:o+4,y:y+capOf(size)/2,size,bold:!!bold})};
 line(scaleNote(s),SLUG/2,true);
 line([s.title,'rifilo '+cm(s.w)+' × '+cm(s.h)+' cm','abbondanza '+cm(s.bleed)+' cm per lato','area sicura '+cm(s.safeEff)+' cm',s.eyelets?'occhielli ogni '+cm(s.eyelets.step)+' cm max, a '+cm(s.eyelets.offset)+' cm dal bordo':'',s.hidden.left?'tasca asta '+cm(s.hidden.left)+' cm a sinistra':'','CMYK FOGRA39','RADIX'].filter(Boolean).join(' · '),bx.media.h-SLUG/2,false);
 return out}
// Bytes of the print PDF. Refuses while a check is red; re-reads the bytes (lib/print-studio.js checkPdf).
function exportPdf(doc,{date=new Date(),cmyk={}}={}){const P=PS(),bad=blocking(checks(doc,cmyk));if(bad.length)throw Error('Prima sistema: '+bad.map(c=>c.label.toLowerCase()).join(', ')+'.');
 const bytes=P.pdf(forPdf(doc),{mode:'print',pdfx:true,date,cmyk,title:doc.title+' · tipografia',producer:'RADIX Studio Stampa · Grande formato'}),probs=P.checkPdf(bytes);
 if(probs.length)throw Error('PDF non valido: '+probs.join(' '));return bytes}
const slugify=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40);
const filename=doc=>'grande-formato-'+slugify(doc.format==='custom'?'misura-'+cm(doc.spec.w)+'x'+cm(doc.spec.h):doc.format)+'-'+(slugify(doc.values.name)||'progetto')+(doc.spec.scale===10?'-scala-1-10':'')+'.pdf';

// ---- notes and the saved summary ----
function notes(doc){const s=doc.spec,out=[];
 out.push('PDF per la tipografia: formato '+cm(s.w)+' × '+cm(s.h)+' cm + '+cm(s.bleed)+' cm di abbondanza per lato, segni di taglio nel margine esterno, CMYK, testi in tracciati, logo vettoriale. La tipografia fa comunque il suo preflight.');
 if(s.scale===10)out.push('In scala 1:10: la tipografia deve ingrandire al 1000%. Lo dice anche il margine del PDF; scrivilo nell’ordine.');
 if(s.group==='poster')out.push('Il manifesto 6 × 3 m si stampa in più fogli: li divide la tipografia. Chiedi se vogliono un’altra scala o un’altra abbondanza.');
 if(s.eyelets)out.push('Segni per gli occhielli ogni '+cm(s.eyelets.step)+' cm al massimo, a '+cm(s.eyelets.offset)+' cm dal bordo: finiscono sotto gli occhielli. Se la tipografia li mette da sé, togli i segni.');
 if(s.hidden.left)out.push('Vela: la tasca per l’asta ('+cm(s.hidden.left)+' cm a sinistra) resta senza testi. Le vele a goccia o a falce hanno una sagoma: chiedi alla tipografia il suo modello.');
 out.push('Foto: per questo formato bastano '+s.dpi+' dpi alla misura reale'+(s.scale===10?' (cioè '+s.dpi*10+' dpi nel file in scala 1:10)':'')+'. Il logo e i testi sono vettoriali.');
 if(doc.brand.source==='visual')out.push('Colori dall’identità visiva del progetto: crea il Kit identità per usare anche il logo.');else if(doc.brand.source!=='kit')out.push('Nessun kit identità nel progetto: colori neutri. Crea il Kit identità per usare i colori e il logo del brand.');
 return out}
function toMarkdown(doc,{date}={}){const s=doc.spec,day=date||new Date().toISOString().slice(0,10),vt=VARIANTS.find(x=>x.id===doc.variant),L=['# Grande formato · '+doc.title,''];
 L.push('Formato: '+s.title+' · layout '+(vt?vt.title:'Classico')+' · abbondanza '+cm(s.bleed)+' cm · area sicura '+cm(s.safeEff)+' cm · '+scaleNote(s)+' · letto da '+mmText(s.distance)+' m · '+day,'');
 L.push('## Testi','');for(const k of FIELD_IDS){const t=clean(doc.values[k]);if(t)L.push('- **'+FIELDS[k].label+'**: '+t)}
 L.push('','## Controlli','',...checks(doc).map(c=>'- '+({ok:'OK',warn:'Attenzione',fail:'Da sistemare'}[c.state])+' · '+c.label+': '+c.detail),'','## Note per la stampa','',...notes(doc).map(n=>'- '+n));return L.join('\n')}
function savedEntry(doc,md,{by,at}={}){const when=at||new Date().toISOString();
 return [{role:'user',content:doc.spec.title+' preparato nello Studio Stampa (grande formato).',display:doc.spec.title+' · grande formato',by:by||'Pannello Marketing',at:when,source:'large-format-studio'},
  {role:'assistant',agent:AGENT,content:'Ecco i dati del grande formato, salvati nel progetto (il PDF si scarica dallo Studio Stampa).\n\n---DOCUMENTO: Grande formato · '+doc.title+'---\n'+md+'\n---FINE DOCUMENTO---',at:when,source:'large-format-studio',
   largeFormat:{format:doc.format,variant:doc.variant,values:doc.values,spec:{w:doc.spec.w,h:doc.spec.h,bleed:doc.spec.bleed,safe:doc.spec.safe,distance:doc.spec.distance,scale:doc.spec.scale,eyelets:!!doc.spec.eyelets}}}]}
async function saveToProject(ws,projectId,doc,opts={}){if(!ws||typeof ws.bind!=='function')throw Error('Archivio del progetto non disponibile.');const d=ws.bind(projectId,'agents'),md=toMarkdown(doc);
 for(let i=0;i<3;i++){const cur=(await d.load())||{},conv={...(cur.conversations||{})};conv[AGENT]=(Array.isArray(conv[AGENT])?conv[AGENT]:[]).concat(savedEntry(doc,md,opts)).slice(-MAX_KEPT);
  try{return await d.save({...cur,schemaVersion:1,conversations:conv})}catch(e){if(!(ws.ConflictError&&e instanceof ws.ConflictError)||i===2)throw e}}}

// ---- SVG preview (real size in mm; guides: bleed, trim, safe area, pocket, eyelets) ----
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function previewSvg(doc,{guides=true}={}){const p=doc.pages[0],s=doc.spec,bl=guides?s.bleed:0,W=p.w+2*bl,H=p.h+2*bl,o=[],U=Math.min(p.w,p.h),sw=num(Math.max(1,U/400));
 o.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+[-bl,-bl,W,H].map(num).join(' ')+'" width="'+num(W/10)+'mm" height="'+num(H/10)+'mm" role="img" aria-label="'+esc(s.title)+'">');
 o.push('<defs><clipPath id="lf-clip-'+s.id+'-'+doc.variant+'"><rect x="'+num(-bl)+'" y="'+num(-bl)+'" width="'+num(W)+'" height="'+num(H)+'"/></clipPath></defs><g clip-path="url(#lf-clip-'+s.id+'-'+doc.variant+')">');
 for(const it of p.items){
  if(it.t==='rect')o.push('<rect x="'+num(it.x)+'" y="'+num(it.y)+'" width="'+num(it.w)+'" height="'+num(it.h)+'" fill="'+it.fill+'"/>');
  else if(it.t==='line')o.push('<line x1="'+num(it.x1)+'" y1="'+num(it.y1)+'" x2="'+num(it.x2)+'" y2="'+num(it.y2)+'" stroke="'+it.stroke+'" stroke-width="'+num(ptToMm(it.width))+'"/>');
  else if(it.t==='text')o.push('<text x="'+num(it.x)+'" y="'+num(it.y)+'" font-family="Helvetica, Arial, \'Liberation Sans\', sans-serif" font-size="'+num(ptToMm(it.size))+'"'+(it.bold?' font-weight="700"':'')+' fill="'+it.fill+'" xml:space="preserve">'+esc(it.s)+'</text>');
  else if(it.t==='image'&&it.src)o.push('<image x="'+num(it.x)+'" y="'+num(it.y)+'" width="'+num(it.w)+'" height="'+num(it.h)+'" preserveAspectRatio="xMidYMid slice" href="'+esc(it.src)+'"/>');
  else if(it.t==='logo')o.push('<image x="'+num(it.x)+'" y="'+num(it.y)+'" width="'+num(it.w)+'" height="'+num(it.h)+'" preserveAspectRatio="none" href="'+esc(PS().svgUrl(it.svg))+'"/>');
  else if(it.t==='placeholder'){const fs=Math.min(it.h*.42,it.w/Math.max(8,it.text.length)*1.7);
   o.push('<g class="lf-placeholder"><rect x="'+num(it.x)+'" y="'+num(it.y)+'" width="'+num(it.w)+'" height="'+num(it.h)+'" fill="#FFF7E6" fill-opacity=".92" stroke="#B45309" stroke-width="'+sw+'" stroke-dasharray="'+num(U/60)+' '+num(U/90)+'"/>'+
    '<text x="'+num(it.x+it.w/2)+'" y="'+num(it.y+it.h/2+fs*.35)+'" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="'+num(fs)+'" font-weight="700" fill="#92400E">'+esc(it.text)+'</text></g>')}}
 o.push('</g>');
 if(guides){const hid=s.hidden.left||0,dash=num(U/70);
  o.push('<path fill="#ffffff" fill-opacity=".55" fill-rule="evenodd" d="M'+num(-bl)+' '+num(-bl)+'h'+num(W)+'v'+num(H)+'h'+num(-W)+'z M0 0v'+num(p.h)+'h'+num(p.w)+'v'+num(-p.h)+'z"/>');
  o.push('<rect x="0" y="0" width="'+num(p.w)+'" height="'+num(p.h)+'" fill="none" stroke="#e5484d" stroke-width="'+sw+'"/>');
  o.push('<rect x="'+num(hid+s.safeEff)+'" y="'+num(s.safeEff)+'" width="'+num(p.w-hid-2*s.safeEff)+'" height="'+num(p.h-2*s.safeEff)+'" fill="none" stroke="#2f80ed" stroke-width="'+sw+'" stroke-dasharray="'+dash+' '+dash+'"/>');
  if(hid)o.push('<rect x="0" y="0" width="'+num(hid)+'" height="'+num(p.h)+'" fill="#e5484d" fill-opacity=".16" stroke="#e5484d" stroke-width="'+sw+'" stroke-dasharray="'+dash+' '+dash+'"/>');
  for(const e of p.eyelets||[])o.push('<circle cx="'+num(e.x)+'" cy="'+num(e.y)+'" r="'+num(Math.max(e.r,U/120))+'" fill="#ffffff" stroke="#1C1C1E" stroke-width="'+sw+'"/>')}
 o.push('</svg>');return o.join('')}

// ---- the widget (browser), mounted by the Studio Stampa ----
let counter=0;
const dom=()=>root.document;
const E=(tag,text,cls)=>{const n=dom().createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
const button=(text,cls)=>{const b=E('button',text,cls||'');b.type='button';return b};
const svgImg=(svg,alt)=>{const i=E('img');i.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);i.alt=alt||'';i.decoding='async';return i};
const fileUrl=f=>new Promise((res,rej)=>{const r=new root.FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(Error('File non leggibile'));r.readAsDataURL(f)});
// ctx: {project (profileFor summary), profile (with identityKit / visual), projectName, projectId, workspace, agentsUrl, by}
function largeFormatStudio(ctx={}){const P=PS(),n=++counter,brand=brandFor(ctx.profile,ctx.projectName),pre=prefill(ctx.profile,{projectName:ctx.projectName,summary:ctx.project});
 const st={fmt:'totem-80x180',values:{...pre},opts:{},variant:'',photo:null,busy:false};
 const wrap=E('div',undefined,'large-format-studio'),steps=E('ol',undefined,'ps-steps');['Le domande','3 layout','Rifinisci e controlla','PDF'].forEach((t,i)=>{const li=E('li',(i+1)+' · '+t);li.dataset.step=String(i+1);steps.append(li)});
 const setStep=k=>[...steps.children].forEach(li=>li.dataset.state=+li.dataset.step<k?'done':+li.dataset.step===k?'current':'todo');
 const docOf=variant=>layout(st.fmt,st.values,brand,{...st.opts,variant,photo:st.photo});
 // 1. questions
 const q=E('div',undefined,'lf-questions'),fmts=E('fieldset',undefined,'lf-formats');fmts.append(E('legend','1. Cosa stampi'));
 for(const g of GROUPS){const box=E('div',undefined,'lf-group');box.append(E('h4',g.title));
  for(const f of FORMATS.filter(x=>x.group===g.id)){const l=E('label',undefined,'ps-chip lf-format'),r=E('input');r.type='radio';r.name='lf-format-'+n;r.value=f.id;r.checked=f.id===st.fmt;
   r.onchange=()=>{st.fmt=f.id;st.opts={customW:st.opts.customW,customH:st.opts.customH};syncFormat();changed()};l.append(r,E('b',' '+f.title),E('small',f.line,'muted'));box.append(l)}
  fmts.append(box)}
 const size=E('div',undefined,'lf-size');const numIn=(label,key,o)=>{const l=E('label',label),i=E('input');i.type='number';i.min=String(o.min);i.max=String(o.max);i.step=String(o.step||1);i.name='lf-'+key+'-'+n;i.inputMode='decimal';
  i.oninput=()=>{st.opts[key]=i.value;changed()};l.append(i);return {l,i}};
 const cw=numIn('Larghezza (cm)','customW',{min:CUSTOM.minCm,max:CUSTOM.maxWCm}),ch=numIn('Altezza (cm)','customH',{min:CUSTOM.minCm,max:CUSTOM.maxHCm});cw.i.placeholder=String(CUSTOM.w/10);ch.i.placeholder=String(CUSTOM.h/10);
 const rot=E('label',undefined,'ps-switch lf-rotate'),roti=E('input');roti.type='checkbox';roti.onchange=()=>{st.opts.landscape=roti.checked;changed()};rot.append(roti,dom().createTextNode(' Orizzontale'));
 const dist=numIn('2. Da quanti metri si legge?','distance',{min:1,max:100,step:.5});size.append(cw.l,ch.l,rot,dist.l);
 const brandLine=E('p',undefined,'pr-brand lf-brand'),sw=E('span',undefined,'pr-swatches');Object.values(brand.palette).forEach(h=>{const i=E('i');i.style.background=h;sw.append(i)});
 brandLine.append(sw,dom().createTextNode(brand.source==='kit'?'Colori e logo dal Kit identità'+(brand.direction?' «'+brand.direction+'»':'')+(brand.logo?'.':' (senza logo: uso il nome).'):brand.source==='visual'?'Colori dall’identità visiva del progetto (nessun logo: uso il nome).':'Nessun Kit identità: colori neutri e il nome al posto del logo. Puoi crearlo dalla card «Kit identità».'));
 const grid=E('div',undefined,'pr-fields lf-fields'),inputs={};grid.append(E('h4','3. I testi (dal progetto: controlla e completa)','pr-wide'));
 for(const k of FIELD_IDS){const d=FIELDS[k],l=E('label',undefined,d.rows?'pr-wide':''),sp=E('span',d.label),i=E(d.rows?'textarea':'input');if(d.rows)i.rows=d.rows;else i.type='text';i.maxLength=d.max;i.placeholder=d.ph||'';i.value=st.values[k]||'';i.name='lf-'+k+'-'+n;
  i.oninput=()=>{st.values[k]=i.value;changed()};l.dataset.key=k;l.append(sp,i);if(pre[k])l.append(E('small','Dal progetto','lf-from'));inputs[k]=i;grid.append(l)}
 const ctl=E('label',undefined,'ps-switch lf-contacts'),cti=E('input');cti.type='checkbox';cti.onchange=()=>{st.opts.contacts=cti.checked;changed()};ctl.append(cti,dom().createTextNode(' Metti i contatti (sito e telefono)'));
 const photoBox=E('div',undefined,'pr-photo lf-photo'),pin=E('input'),pinfo=E('span','','muted'),pdel=button('Togli la foto');pin.type='file';pin.accept='image/jpeg,image/png';pdel.hidden=true;
 const plab=E('label',undefined,'pf-drop pr-drop'),ptxt=E('span',undefined,'pf-drop-text');ptxt.append(E('strong','4. Foto (facoltativa)'),E('small','JPEG o PNG · trascinala qui o fai clic'));plab.append(pin,ptxt);photoBox.append(plab,pdel,pinfo);
 pin.onchange=async()=>{const f=pin.files&&pin.files[0];if(!f)return;try{const src=await fileUrl(f),img=new root.Image();img.src=src;await img.decode();st.photo={src,w:img.naturalWidth,h:img.naturalHeight,name:f.name};pdel.hidden=false;changed()}catch(e){pinfo.textContent='Foto non leggibile: '+e.message}};
 pdel.onclick=()=>{st.photo=null;pin.value='';pdel.hidden=true;changed()};
 const go=button('Prepara 3 layout','primary'),bar=E('div',undefined,'ps-actions');bar.append(go,E('span','Nessuna chiamata AI: layout, controlli e PDF si creano qui, senza costi.','muted'));
 q.append(fmts,size,brandLine,grid,ctl,photoBox,bar);
 // 2. three layouts, 3. refine + checks, 4. export
 const dirs=E('div',undefined,'ad-dirs lf-dirs'),result=E('div',undefined,'ad-result lf-result'),status=E('p','','tool-status');status.setAttribute('role','status');dirs.hidden=result.hidden=true;
 wrap.append(steps,q,status,dirs,result);setStep(1);
 function syncFormat(){const f=need(st.fmt),s=spec(st.fmt,st.opts);cw.l.hidden=ch.l.hidden=!f.custom;rot.hidden=!f.rotate;roti.checked=!!st.opts.landscape;dist.i.placeholder=String(f.distance);dist.i.value=st.opts.distance||'';cti.checked=s.contacts;
  for(const k of FIELD_IDS){const l=inputs[k].parentNode,req=(REQUIRED[f.group]||[]).includes(k);l.dataset.required=String(req);l.firstChild.textContent=FIELDS[k].label+(req?' *':'')}}
 let timer=0;function changed(){if(dirs.hidden)return;clearTimeout(timer);timer=setTimeout(()=>{renderDirs();if(st.variant)renderResult()},250)}
 go.onclick=()=>{renderDirs();status.textContent='Ecco 3 layout con il tuo kit: scegli quello da usare. I segnaposto arancioni sono testi che mancano.';dirs.scrollIntoView&&dirs.scrollIntoView({behavior:'smooth',block:'start'})};
 function renderDirs(){setStep(st.variant?3:2);dirs.hidden=false;
  dirs.replaceChildren(...VARIANTS.map(vt=>{const d=docOf(vt.id),card=E('article',undefined,'ad-dir lf-dir');card.dataset.chosen=String(st.variant===vt.id);card.dataset.variant=vt.id;
   const head=E('div',undefined,'ad-dir-head');head.append(E('span','Layout','ad-angle'),E('h3',vt.title),E('p',vt.line,'ad-idea'));
   const fig=E('figure',undefined,'lf-thumb');fig.dataset.shape=d.spec.w>d.spec.h?'wide':'tall';fig.append(svgImg(previewSvg(d,{guides:false}),vt.title+' · '+d.spec.title));
   const pick=button(st.variant===vt.id?'Layout scelto':'Scegli questo layout','primary');pick.onclick=()=>{st.variant=vt.id;renderDirs();renderResult();result.scrollIntoView&&result.scrollIntoView({behavior:'smooth',block:'start'})};
   card.append(head,fig,pick);return card}))}
 function checkRow(c){const row=E('div',undefined,'co-check lf-check');row.dataset.state=c.state;row.dataset.check=c.id;
  row.append(E('span',{ok:'OK',warn:'Attenzione',fail:'Da sistemare'}[c.state],'co-check-badge'),E('strong',c.label),E('p',c.detail,'co-check-detail'));return row}
 function renderResult(){const doc=docOf(st.variant),s=doc.spec,list=checks(doc),fails=blocking(list),bx=pageBox(s);setStep(fails.length?3:4);result.hidden=false;
  const head=E('div',undefined,'ad-result-head'),hd=E('div');hd.append(E('span','Layout '+VARIANTS.find(x=>x.id===st.variant).title,'ad-angle'),E('h3',s.title),E('p','Rifinisci qui sotto: anteprima e controlli si aggiornano. I testi li cambi nelle domande sopra.','ad-idea'));head.append(hd);
  const ref=E('fieldset',undefined,'lf-refine');ref.append(E('legend','Rifinitura per la tipografia'));
  const field=(label,key,o,val)=>{const l=E('label',label),i=E('input');i.type='number';i.min=String(o.min);i.max=String(o.max);i.step=String(o.step||1);i.value=val;i.name='lf-r-'+key+'-'+n;i.onchange=()=>{st.opts[key]=o.toMm?String(+i.value*10):i.value;renderResult();renderDirs()};l.append(i);if(o.hint)l.append(E('small',o.hint,'muted'));return l};
  ref.append(field('Abbondanza (cm per lato)','bleed',{min:1,max:5,step:.5,toMm:true,hint:'Da 1 a 5 cm: chiedi alla tipografia.'},s.bleed/10),field('Area sicura (cm)','safe',{min:1,max:Math.floor(Math.min(s.w,s.h)/40),step:.5,toMm:true},s.safe/10),field('Distanza di lettura (m)','distance',{min:1,max:100,step:.5},s.distance));
  const sl=E('label','Scala del file'),ss=E('select');[['auto','Automatica'],['1','1:1 (misura reale)'],['10','1:10 (la tipografia ingrandisce al 1000%)']].forEach(([v,t])=>ss.append(new root.Option(t,v)));ss.value=st.opts.scale||'auto';ss.name='lf-scale-'+n;ss.onchange=()=>{st.opts.scale=ss.value;renderResult()};sl.append(ss);ref.append(sl);
  if(s.group==='banner'||s.group==='custom'){const el=E('label',undefined,'ps-switch lf-eyelets'),ei=E('input');ei.type='checkbox';ei.checked=!!s.eyelets;ei.onchange=()=>{st.opts.eyelets=ei.checked;renderResult();renderDirs()};el.append(ei,dom().createTextNode(' Segni per gli occhielli'));ref.append(el);
   if(s.eyelets)ref.append(field('Occhielli ogni (cm, al massimo)','eyeletStep',{min:30,max:100,step:5,toMm:true},s.eyelets.step/10),field('Occhielli dal bordo (cm)','eyeletOffset',{min:1.5,max:5,step:.5,toMm:true},s.eyelets.offset/10))}
  const spec1=E('p',undefined,'lf-spec');spec1.append(E('b',scaleNote(s)),dom().createTextNode(' · pagina PDF '+mmText(bx.media.w)+' × '+mmText(bx.media.h)+' mm (rifilo '+mmText(bx.trim.w)+' × '+mmText(bx.trim.h)+' mm + '+mmText(bx.bleed)+' mm di abbondanza + '+SLUG+' mm di margine per i segni).'));
  const fig=E('figure',undefined,'lf-preview');fig.dataset.shape=s.w>s.h?'wide':'tall';fig.append(svgImg(previewSvg(doc,{guides:true}),'Anteprima '+s.title),E('figcaption','Rosso: taglio · tratteggio blu: area sicura'+(s.hidden.left?' · rosa: tasca dell’asta':'')+(s.eyelets?' · cerchi: occhielli':'')+' · fuori dal rosso: abbondanza.'));
  const imgs=P.imagesReport(doc).filter(x=>x.label==='Foto');pinfo.textContent=st.photo?st.photo.name+' · '+st.photo.w+' × '+st.photo.h+' px'+(imgs.length?' · '+imgs.map(x=>x.dpi+' dpi alla misura reale'+(x.ok?'':': ne servono '+x.need)).join('; '):' · questo layout non usa la foto'):'';
  const box=E('div',undefined,'co-checks lf-checks');box.append(E('h4','Controlli prima del PDF'),...list.map(checkRow));
  const nt=E('ul',undefined,'pr-notes');notes(doc).forEach(t=>nt.append(E('li',t)));
  const dl=button('Scarica il PDF per la tipografia','primary'),acts=E('div',undefined,'ps-actions lf-actions'),rs=E('p','','tool-status');rs.setAttribute('role','status');acts.append(dl);
  if(fails.length){dl.disabled=true;dl.title='Si attiva quando i controlli in rosso sono sistemati.';rs.textContent='Prima sistema: '+fails.map(c=>c.label.toLowerCase()).join(', ')+'.'}
  dl.onclick=async()=>{if(st.busy)return;st.busy=true;dl.disabled=true;rs.textContent='Preparo il PDF: colori e foto in CMYK, testi in tracciati…';
   try{const d=docOf(st.variant);await P.loadGlyphs();await P.prepareImages(d,{pdfx:true});const bytes=exportPdf(d),name=P.download(filename(d),bytes,'application/pdf');
    rs.textContent='Scaricato: '+name+' · '+scaleNote(d.spec)+'. Mandalo alla tipografia e chiedi il loro preflight.';setStep(4)}
   catch(e){rs.textContent='PDF non creato: '+e.message}finally{st.busy=false;dl.disabled=!!blocking(checks(docOf(st.variant))).length}};
  if(ctx.workspace&&ctx.projectId){const sv=button('Salva nel progetto');acts.append(sv);sv.onclick=async()=>{sv.disabled=true;rs.textContent='Salvo nel progetto…';
   try{await saveToProject(ctx.workspace,ctx.projectId,docOf(st.variant),{by:ctx.by});rs.replaceChildren(dom().createTextNode('Salvato tra i documenti dell’Art Director (il PDF lo scarichi da qui). '));if(ctx.agentsUrl){const a=E('a','Apri in Agenti AI →');a.href=ctx.agentsUrl;rs.append(a)}}
   catch(e){rs.textContent='Non salvato: '+e.message}finally{sv.disabled=false}}}
  acts.append(E('span','Nessuna chiamata AI: il PDF si crea qui, senza costi.','muted'));
  result.replaceChildren(head,ref,spec1,fig,box,acts,rs,nt)}
 syncFormat();return wrap}

return Object.freeze({SLUG,PDF_MAX,BLEED_MIN,BLEED_MAX,TITLE_RATIO,TEXT_RATIO,EYELET_R,GROUPS,FORMATS,FIELDS,REQUIRED,VARIANTS,CUSTOM,format,spec,pageBox,scaleNote,eyelets,minCaps,brandFor,prefill,missing,
 layout,safeProblems,bleedProblems,sizeProblems,checks,blocking,forPdf,slugTexts,exportPdf,filename,notes,toMarkdown,savedEntry,saveToProject,previewSvg,largeFormatStudio});
});
