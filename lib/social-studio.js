/* Studio «Grafica profili e template social» (agency job C5): the graphics of the social profiles drawn in code from the
   saved identity kit (profile.identityKit: logo, palette), with NO AI, no image generation and no cost.
   1. The questions: the channels (Instagram, Facebook, LinkedIn page, LinkedIn personal profile, YouTube, X, TikTok), the
      pieces (profile image, covers, Instagram highlight covers, post templates), which highlights, which post types and
      formats, the payoff and the site (prefilled from the project, never invented: what is missing is left out).
   2. Three visual directions built here, deterministically (Chiaro, Colore pieno, Fascia); the person picks one.
   3. The refinement: background and accent colour (palette roles only), profile image with the logo or the initials,
      the texts of every post template, an optional photo for the photo slot of the templates (resized in the browser,
      never uploaded anywhere), the safe areas over the previews.
   4. The checks: kit present and used (logo, palette only), text and logo inside the safe areas of every platform, the
      logo inside the circle crop of the profile image and of the highlights, WCAG AA contrast (4.5:1 text, 3:1 large text
      and icons), text size readable on a phone, placeholders still in the templates, photo resolution.
   5. The zip: one PNG per piece with the platform and the size in its name (plus the editable SVG), and LEGGIMI.txt with
      the upload steps for every platform.
   SIZES is the table of the platform sizes used here (checked 2026-10): change it here when a platform changes.
   The choice is saved in the project: the «agents» document under the key socialKit (agents-page.js keeps it); the photo
   is not saved. Pure part runs in Node for the tests; socialStudio() is the browser widget. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixSocialStudio=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
function lib(name,file){if(root[name])return root[name];try{return typeof require==='function'?require(file):null}catch(e){return null}}
const PS=()=>lib('RadixPrintStudio','./print-studio.js'),BP=()=>lib('RadixBrandPackage','./brand-package.js'),CO=()=>lib('RadixCoordinatoStudio','./coordinato-studio.js'),ZIP=()=>lib('RadixZip','./zip-lite.js');
const AGENT='art-director',MAX_SAVED=10,ROOT='social',FIELD_MAX=160,PHONE_CSS=390,MIN_CSS=12,PHOTO_MAX=2160;
const clean=s=>String(s==null?'':s).replace(/\s+/g,' ').trim();
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const slug=s=>norm(s).replace(/ /g,'-').slice(0,40);
const up=h=>String(h||'').toUpperCase();
const n2=x=>Math.round(x*100)/100;
// The smallest text (px on the image) that still reads at 12 CSS px when `seen` image pixels fill a 390 px wide phone.
const minText=seen=>Math.ceil(MIN_CSS*seen/PHONE_CSS);

// ---- the sizes of every platform (checked 2026-10; verify: true = to re-check on the live platform) ----
// covers: safe = the area every device shows (no crop on phone or desktop, not under the profile photo or the buttons);
// seen = the image width that fills the phone screen (for the readable text size).
const SIZES=Object.freeze({
 checked:'2026-10',
 profile:Object.freeze([
  {channel:'instagram',w:1080,h:1080,shown:110,note:'Instagram la mostra rotonda a 110 px sul telefono.'},
  {channel:'facebook',w:1080,h:1080,shown:176,note:'Facebook la mostra rotonda (176 px su computer, 196 px sul telefono).',verify:true},
  {channel:'linkedin',w:400,h:400,shown:72,note:'Logo della pagina LinkedIn: 400 × 400, mostrato quadrato.'},
  {channel:'youtube',w:800,h:800,shown:98,note:'YouTube la mostra rotonda a 98 px.'},
  {channel:'x',w:400,h:400,shown:134,note:'X la mostra rotonda (quadrata solo per gli account aziendali verificati).',verify:true},
  {channel:'tiktok',w:1080,h:1080,shown:96,note:'TikTok la mostra rotonda; minimo 200 × 200.'}]),
 covers:Object.freeze([
  {id:'facebook',channel:'facebook',title:'Facebook · copertina della pagina',w:1640,h:624,safe:{x:266,y:48,w:1108,h:528},seen:1108,note:'Sul telefono si vede solo la parte centrale (1108 px su 1640): logo e testi stanno lì.',verify:true},
  {id:'linkedin',channel:'linkedin',title:'LinkedIn · copertina della pagina aziendale',w:1128,h:191,safe:{x:240,y:18,w:850,h:155},seen:1128,note:'In basso a sinistra c’è il logo della pagina e il telefono taglia un po’ i lati: logo e testi stanno al centro e a destra.',verify:true},
  {id:'linkedin-persona',channel:'linkedin-persona',title:'LinkedIn · sfondo del profilo personale',w:1584,h:396,safe:{x:568,y:40,w:976,h:316},seen:1584,note:'In basso a sinistra c’è la foto della persona e il telefono taglia i lati: logo e testi stanno a destra.'},
  {id:'youtube',channel:'youtube',title:'YouTube · banner del canale',w:2560,h:1440,safe:{x:507,y:508,w:1546,h:423},seen:1546,note:'Su computer e telefono si vede solo il centro 1546 × 423 px; il resto appare sulle TV. File al massimo 6 MB.'},
  {id:'x',channel:'x',title:'X · intestazione',w:1500,h:500,safe:{x:400,y:60,w:1040,h:380},seen:1500,note:'In basso a sinistra c’è la foto del profilo e alcuni schermi tagliano sopra e sotto: logo e testi stanno a destra, lontano dai bordi.',verify:true}]),
 // Highlights: a story image 1080 × 1920; Instagram shows a circle cut from the centre (the person can move it).
 highlight:Object.freeze({w:1080,h:1920,cx:540,cy:960,circle:330,icon:420,note:'Instagram ritaglia un cerchio al centro: l’icona sta in un cerchio di 660 px.'}),
 posts:Object.freeze([
  {id:'quadrato',title:'Post quadrato',w:1080,h:1080,ratio:'1:1',safe:{x:70,y:70,w:940,h:940},seen:1080},
  {id:'verticale',title:'Post verticale',w:1080,h:1350,ratio:'4:5',safe:{x:70,y:70,w:940,h:1210},seen:1080},
  {id:'storia',title:'Storia',w:1080,h:1920,ratio:'9:16',safe:{x:70,y:270,w:940,h:1266},seen:1080,note:'Il 14% in alto e il 20% in basso restano liberi: lì Instagram e Facebook mettono nome, risposte e pulsanti.'}])});

// ---- what can be made ----
const CHANNELS=Object.freeze([
 {id:'instagram',title:'Instagram'},{id:'facebook',title:'Facebook (pagina)'},{id:'linkedin',title:'LinkedIn (pagina aziendale)'},{id:'linkedin-persona',title:'LinkedIn (profilo personale)'},
 {id:'youtube',title:'YouTube'},{id:'x',title:'X'},{id:'tiktok',title:'TikTok'}]);
const CHANNEL_IDS=CHANNELS.map(c=>c.id);
const PIECES=Object.freeze([
 {id:'profilo',title:'Immagine del profilo',line:'Il simbolo del logo (o le iniziali) per ogni canale, dentro il ritaglio rotondo.'},
 {id:'copertine',title:'Copertine',line:'Facebook, LinkedIn, YouTube e X con le aree visibili su ogni dispositivo.'},
 {id:'evidenza',title:'Copertine «in evidenza»',line:'Le icone dei momenti in evidenza di Instagram nei colori del brand.'},
 {id:'post',title:'Template dei post',line:'Offerta, recensione, evento, novità, consiglio e annuncio, con i tuoi testi.'}]);
const PIECE_IDS=PIECES.map(p=>p.id);
// The icons are drawn here on a 24 grid (stroke), no external set.
const HIGHLIGHTS=Object.freeze([
 {id:'menu',title:'Menu',d:['M7 3.5v17','M4.5 3.5v4.5a2.5 2.5 0 0 0 5 0V3.5','M17 20.5V3.5c-2.4 1.6-3.4 4.6-3.4 8.5H17']},
 {id:'chi-siamo',title:'Chi siamo',d:['M3.5 11 12 4l8.5 7','M5.8 9.4v11.1h12.4V9.4','M10 20.5v-5.5h4v5.5']},
 {id:'prodotti',title:'Prodotti',d:['M5 8.5h14l-1.3 12H6.3L5 8.5Z','M9 8.5V7a3 3 0 0 1 6 0v1.5']},
 {id:'recensioni',title:'Recensioni',d:['M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8Z']},
 {id:'contatti',title:'Contatti',d:['M6.6 3.5h2.9l1.5 4-2 1.3a10 10 0 0 0 6.2 6.2l1.3-2 4 1.5v2.9a2 2 0 0 1-2.2 2A16.6 16.6 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2Z']},
 {id:'offerte',title:'Offerte',d:['M3.5 11.6V5A1.5 1.5 0 0 1 5 3.5h6.6l8.9 8.9-8.1 8.1-8.9-8.9Z','M8.2 7a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z']},
 {id:'eventi',title:'Eventi',d:['M4 6.5h16v14H4Z','M4 10.5h16','M8 3.5v5','M16 3.5v5']},
 {id:'orari',title:'Orari',d:['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Z','M12 7.5V12l3 2']},
 {id:'dove-siamo',title:'Dove siamo',d:['M12 20.5s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z','M12 7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z']},
 {id:'faq',title:'Domande',d:['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Z','M9.6 9.6a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2-2.4 3.6','M12 17.2v.1']},
 {id:'lavori',title:'Lavori',d:['M4 5h16v14H4Z','M4 15.5l4.5-4.5 4 4 2.5-2.5 5 5','M15.5 8.2a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6Z']}]);
const HIGHLIGHT_DEFAULT=['menu','chi-siamo','prodotti','recensioni','contatti'];
// Post types: fields [key, label, max, placeholder shown in the template while empty]; the kicker default is a generic word.
const TYPES=Object.freeze([
 {id:'offerta',title:'Offerta',kicker:'Offerta',fields:[['kicker','Etichetta',30,'Offerta'],['title','Titolo dell’offerta',80,'[Titolo dell’offerta]'],['body','Dettaglio',160,'[Cosa comprende]'],['meta','Validità',60,'[Fino al …]'],['cta','Invito',30,'']]},
 {id:'recensione',title:'Citazione o recensione',kicker:'Dicono di noi',fields:[['kicker','Etichetta',30,'Dicono di noi'],['title','Citazione',160,'[La frase del cliente]'],['meta','Autore e fonte',60,'[Nome · Recensione Google]'],['stars','Stelle (da 1 a 5, solo se vere)',1,'']]},
 {id:'evento',title:'Evento',kicker:'Evento',fields:[['kicker','Etichetta',30,'Evento'],['title','Nome dell’evento',80,'[Nome dell’evento]'],['meta','Data e ora',60,'[Giorno · ora]'],['body','Luogo',100,'[Dove]'],['cta','Invito',30,'']]},
 {id:'prodotto',title:'Nuovo prodotto',kicker:'Novità',fields:[['kicker','Etichetta',30,'Novità'],['title','Nome del prodotto',80,'[Nome del prodotto]'],['body','Descrizione breve',160,'[Perché provarlo]'],['meta','Prezzo (facoltativo)',30,''],['cta','Invito',30,'']]},
 {id:'consiglio',title:'Consiglio',kicker:'Consiglio',fields:[['kicker','Etichetta',30,'Consiglio'],['title','Il consiglio',90,'[Il consiglio in una frase]'],['body','Spiegazione',160,'[Come si fa]']]},
 {id:'annuncio',title:'Annuncio',kicker:'Avviso',fields:[['kicker','Etichetta',30,'Avviso'],['title','Annuncio',90,'[Cosa cambia]'],['body','Dettaglio',160,'[Da quando, per chi]'],['meta','Data (facoltativa)',60,'']]}]);
const TYPE_IDS=TYPES.map(t=>t.id);
const type=id=>TYPES.find(t=>t.id===id)||TYPES[0];
// The three directions: the same kit, three ways of laying it out.
const DIRECTIONS=Object.freeze([
 {id:'chiaro',title:'Chiaro',line:'Fondo chiaro, colore del brand nei titoli e in una barra: ordinato e leggero.',colors:{fondo:'light',accento:'primary'}},
 {id:'pieno',title:'Colore pieno',line:'Il colore primario a tutto campo, testi chiari e un cerchio di accento.',colors:{fondo:'primary',accento:'accent'}},
 {id:'fascia',title:'Fascia',line:'La foto (o il fondo) in alto e una fascia piena di colore con i testi.',colors:{fondo:'light',accento:'primary'}}]);
const direction=id=>DIRECTIONS.find(d=>d.id===id)||DIRECTIONS[0];
const ROLES=Object.freeze(['primary','secondary','accent','dark','light']);
const ROLE_LABEL=Object.freeze({primary:'Primario',secondary:'Secondario',accent:'Accento',dark:'Scuro',light:'Chiaro'});
const AVATAR=Object.freeze({simbolo:'Simbolo del logo',logo:'Logo intero',iniziali:'Iniziali del nome'});

// ---- the model ----
function hasKit(profile){const P=PS();return !!(profile&&profile.identityKit&&typeof profile.identityKit==='object'&&P.brandOf(profile).fromKit)}
// Payoff and site from the project (never invented): {values:{payoff,sito}, from:{key:'progetto'}}.
function prefill(profile,{projectName}={}){const P=PS(),pre=P.prefill(profile||{},{projectName}),v={payoff:clean(pre.payoff).slice(0,120),sito:clean(pre.website).replace(/^https?:\/\//i,'').replace(/\/+$/,'').slice(0,80)},from={};
 for(const k of Object.keys(v))if(v[k])from[k]='progetto';return {values:v,from}}
const pick=(list,all,def)=>{const l=(Array.isArray(list)?list:def).filter(x=>all.includes(x));return all.filter(x=>l.includes(x))};
function textsOf(x){const out={};for(const t of TYPES){const s=x&&x[t.id]&&typeof x[t.id]==='object'?x[t.id]:{},o={};
 for(const [k,,max] of t.fields){if(k==='stars'){const v=Math.round(+s.stars||0);o.stars=v>=1&&v<=5?v:0;continue}o[k]=clean(s[k]).slice(0,max)}
 if(!('kicker' in s))o.kicker=t.kicker;out[t.id]=o}return out}
function colorsOf(c,dir){const d=direction(dir).colors,o=c&&typeof c==='object'?c:{};return {fondo:ROLES.includes(o.fondo)?o.fondo:d.fondo,accento:ROLES.includes(o.accento)?o.accento:d.accento}}
// input: {direction, channels, pieces, highlights, types, formats, payoff, sito, avatar, colors, texts, photo:{src,w,h}}
function modelOf(input,profile,{projectName}={}){const i=input||{},P=PS(),dir=direction(i.direction).id;
 const channels=pick(i.channels,CHANNEL_IDS,['instagram','facebook','linkedin']),pieces=pick(i.pieces,PIECE_IDS,PIECE_IDS);
 const ph=i.photo&&typeof i.photo==='object'&&typeof i.photo.src==='string'&&/^data:image\/(png|jpeg|webp);base64,/.test(i.photo.src)&&+i.photo.w>0&&+i.photo.h>0?{src:i.photo.src,w:+i.photo.w,h:+i.photo.h,name:clean(i.photo.name).slice(0,80)}:null;
 return {direction:dir,channels:channels.length?channels:['instagram'],pieces:pieces.length?pieces:PIECE_IDS.slice(),highlights:pick(i.highlights,HIGHLIGHTS.map(h=>h.id),HIGHLIGHT_DEFAULT),
  types:pick(i.types,TYPE_IDS,TYPE_IDS),formats:pick(i.formats,SIZES.posts.map(f=>f.id),['quadrato','verticale','storia']),
  payoff:clean(i.payoff).slice(0,120),sito:clean(i.sito).replace(/^https?:\/\//i,'').replace(/\/+$/,'').slice(0,80),avatar:AVATAR[i.avatar]?i.avatar:'simbolo',
  colors:colorsOf(i.colors,dir),texts:textsOf(i.texts),photo:ph,brand:P.brandOf(profile,projectName)}}
const has=(m,id)=>m.pieces.includes(id);
const coversOf=m=>has(m,'copertine')?SIZES.covers.filter(c=>m.channels.includes(c.channel)):[];
const profilesOf=m=>has(m,'profilo')?SIZES.profile.filter(p=>m.channels.includes(p.channel)):[];
const highlightsOf=m=>has(m,'evidenza')&&m.channels.includes('instagram')?HIGHLIGHTS.filter(h=>m.highlights.includes(h.id)):[];
// Stories only where they exist (Instagram, Facebook); feed posts on Instagram, Facebook and LinkedIn.
function postFormatsOf(m){if(!has(m,'post'))return [];const feed=m.channels.some(c=>['instagram','facebook','linkedin','linkedin-persona'].includes(c)),story=m.channels.some(c=>['instagram','facebook'].includes(c));
 return SIZES.posts.filter(f=>m.formats.includes(f.id)&&(f.id==='storia'?story:feed))}

// ---- colours ----
function scheme(m){const P=PS(),pal=m.brand.palette,fondo=pal[m.colors.fondo],acc=pal[m.colors.accento],d=m.direction;
 const head=P.ink(fondo,pal,acc,pal.primary,pal.dark,pal.light),body=P.ink(fondo,pal,pal.dark,pal.light),onAcc=P.ink(acc,pal,pal.light,pal.dark);
 // the decoration colour: accent, unless it is the background itself
 const deco=acc!==fondo?acc:[pal.secondary,pal.accent,pal.primary].find(c=>c!==fondo)||pal.dark;
 return {d,pal,fondo,acc,head,body,onAcc,deco}}
// The symbol of the kit logo (lib/brand-package.js splits the logo into symbol and wordmark): {svg, generated} or null.
const symCache=new Map();
function symbolOf(m){const b=m.brand;if(!b.logo)return null;if(symCache.has(b.logo))return symCache.get(b.logo);let out=null;
 try{const B=BP();if(B){const kit={palette:ROLES.map(r=>({role:r,hex:b.palette[r]})),fonts:[{heading:b.fonts.heading||'Inter',body:b.fonts.body||'Inter'}],logo:b.logo},v=B.variants(kit,b.name),sym=v.list.find(x=>x.id==='simbolo');
  if(sym&&sym.svg)out={svg:sym.svg,generated:!!(v.parts&&v.parts.generated&&v.parts.generated.symbol)}}}catch(e){out=null}
 symCache.set(b.logo,out);return out}
// The logo as drawn on `bg`: the original on the kit's light colour or white, else in one readable colour.
function logoOn(m,bg,svg){const P=PS(),pal=m.brand.palette,src=svg||m.brand.logo;if(!src)return null;if(up(bg)===up(pal.light)||up(bg)==='#FFFFFF')return {svg:src,mono:''};
 const c=P.ink(bg,pal,pal.light,pal.dark),B=BP();let svg2='';try{svg2=B?B.mono(src,c,up(bg)):''}catch(e){svg2=''}return {svg:svg2||P.monoSvg(src,c),mono:c}}

// ---- text ----
const ASC=.718,DESC=.207;
const wPx=(s,size,bold)=>PS().textWidth(s,size,bold);
function wrapPx(text,size,width,bold){const words=clean(text).split(' ').filter(Boolean),out=[];let line='';
 for(const w of words){const t=line?line+' '+w:w;if(wPx(t,size,bold)<=width||!line){line=t;continue}out.push(line);line=w}if(line)out.push(line);return out}
const fits=(lines,size,width,bold)=>lines.every(l=>wPx(l,size,bold)<=width+.5);
const initials=name=>{const w=clean(name).split(' ').filter(x=>/^[A-Za-zÀ-ÿ0-9]/.test(x)&&!/^(di|da|del|della|e|il|la|lo|le|srl|s\.r\.l\.|snc|spa|sas)$/i.test(x));return (w.length>1?w[0][0]+w[1][0]:w.length?w[0].slice(0,2):'').toUpperCase()};
// Boxes of the drawn items (px).
function boxOf(it){if(it.t==='text')return {x0:it.x,x1:it.x+wPx(it.s,it.size,it.bold),y0:it.y-it.size*ASC,y1:it.y+it.size*DESC};
 if(it.t==='logo'||it.t==='icon'||it.t==='photo')return {x0:it.x,x1:it.x+it.w,y0:it.y,y1:it.y+it.h};if(it.t==='star')return {x0:it.cx-it.r,x1:it.cx+it.r,y0:it.cy-it.r,y1:it.cy+it.r};return null}
const rect=(items,x,y,w,h,fill,o={})=>items.push({t:'rect',x,y,w,h,fill,...o});
const circle=(items,cx,cy,r,fill)=>items.push({t:'circle',cx,cy,r,fill});
// Decorative circles never touch logo and texts: each shrinks to keep a gap from every box (and goes when too small).
function clearDecor(items,gap){const boxes=items.map(boxOf).filter(Boolean);
 return items.filter(it=>{if(it.t!=='circle')return true;for(const b of boxes){const dx=Math.max(b.x0-it.cx,0,it.cx-b.x1),dy=Math.max(b.y0-it.cy,0,it.cy-b.y1),d=Math.hypot(dx,dy);it.r=Math.min(it.r,d-gap)}return it.r>=gap})}
function logoItem(items,m,box,bg,{align='left',label='Logo',svg=null}={}){const P=PS(),l=logoOn(m,bg,svg);if(!l){const name=clean(m.brand.name)||'Brand';let size=box.h*.62;while(size>8&&wPx(name,size,true)>box.w)size-=1;
  const c=P.ink(bg,m.brand.palette,m.brand.palette.primary,m.brand.palette.dark),w=wPx(name,size,true);items.push({t:'text',x:align==='center'?box.x+(box.w-w)/2:align==='right'?box.x+box.w-w:box.x,y:box.y+box.h/2+size*ASC/2,s:name,size,bold:true,fill:c,label:'Nome (senza logo)'});return}
 const vb=P.viewBox(l.svg)||[0,0,3,1],k=Math.min(box.w/vb[2],box.h/vb[3]),w=vb[2]*k,h=vb[3]*k;
 items.push({t:'logo',x:align==='center'?box.x+(box.w-w)/2:align==='right'?box.x+box.w-w:box.x,y:box.y+(box.h-h)/2,w,h,svg:l.svg,mono:l.mono,label})}

// ---- profile image ----
// The logo (or the initials) inside the circle: a box whose corners stay within 80% of the radius.
function avatarLayout(m,spec={w:1080,h:1080,channel:'master'}){const P=PS(),S=scheme(m),pal=S.pal,W=spec.w,items=[],r=W/2,R=r*.8;
 const bg=m.direction==='chiaro'?pal.light:m.direction==='pieno'?S.fondo:S.acc;rect(items,0,0,W,W,bg);
 if(m.direction==='chiaro')items.push({t:'ring',cx:r,cy:r,r:r*.93,w:Math.max(2,W*.018),stroke:S.acc});
 const sym=m.avatar==='simbolo'?symbolOf(m):null,svg=sym?sym.svg:m.brand.logo,vb=svg?P.viewBox(svg):null,R2=sym?R*.78:R;
 if((m.avatar==='logo'||sym)&&vb){const a=vb[2]/vb[3],hh=R2/Math.sqrt(a*a+1),ww=hh*a;logoItem(items,m,{x:r-ww,y:r-hh,w:2*ww,h:2*hh},bg,{align:'center',svg,label:sym?'Simbolo':'Logo'})}
 else{const s=initials(m.brand.name)||'?';let size=W*.42;const c=P.ink(bg,pal,m.direction==='chiaro'?S.acc:pal.light,pal.dark,pal.light);while(size>10&&Math.hypot(wPx(s,size,true)/2,size*ASC/2)>R)size-=2;
  items.push({t:'text',x:r-wPx(s,size,true)/2,y:r+size*ASC/2,s,size,bold:true,fill:c,label:'Iniziali'})}
 return {kind:'profilo',spec:{...spec,id:'profilo-'+spec.channel,title:'Immagine del profilo'+(spec.channel!=='master'?' · '+channelTitle(spec.channel):''),h:W,circle:{cx:r,cy:r,r:R}},bg,items}}
const channelTitle=id=>(CHANNELS.find(c=>c.id===id)||{title:id}).title;

// ---- covers ----
function coverLayout(spec,m){const S=scheme(m),pal=S.pal,s=spec.safe,W=spec.w,H=spec.h,items=[],min=minText(spec.seen),notes=[];
 let bg;
 if(m.direction==='pieno'){bg=S.fondo;rect(items,0,0,W,H,bg);circle(items,s.x+s.w+H*.15,H*.05,H*.55,S.deco);circle(items,s.x-H*.25,H*1.02,H*.42,pal.secondary!==bg?pal.secondary:S.deco)}
 else if(m.direction==='fascia'){bg=S.fondo;rect(items,0,0,W,H,bg);const bh=Math.max(4,Math.min(Math.round(H*.16),H-(s.y+s.h)-2));rect(items,0,H-bh,W,bh,S.acc);rect(items,0,0,Math.min(Math.round(W*.04),Math.max(0,s.x-4)),H-bh,S.deco)}
 else{bg=S.fondo;rect(items,0,0,W,H,bg);rect(items,0,H-Math.max(6,Math.round(H*.035)),W,Math.max(6,Math.round(H*.035)),S.acc)}
 // inside the safe area: the logo on the left, payoff and site on the right (or the logo alone, centred)
 const head=S.head,soft=S.body,pad=Math.round(Math.min(s.h*.1,s.w*.04));let payoff=m.payoff,url=m.sito;
 const tx=s.x+s.w*.42,tw=s.x+s.w-pad-tx;let lines=[],size=0;
 if(payoff){for(size=Math.round(s.h*.24);size>=min;size-=2){lines=wrapPx(payoff,size,tw,true);if(lines.length<=2&&fits(lines,size,tw,true))break}
  if(size<min){notes.push('il payoff non entra leggibile (almeno '+min+' px): lasciato fuori');payoff='';lines=[]}}
 let us=Math.max(min,Math.round(lines.length?size*.5:s.h*.18));if(url){while(us>min&&wPx(url,us,false)>tw)us--;if(wPx(url,us,false)>tw){notes.push('il sito non entra leggibile: lasciato fuori');url=''}}
 const text=!!(payoff||url);
 const lb=text?{x:s.x+pad,y:s.y+pad,w:s.w*.38-pad,h:s.h-2*pad}:{x:s.x+s.w*.15,y:s.y+pad,w:s.w*.7,h:s.h-2*pad};
 logoItem(items,m,lb,bg,{align:text?'left':'center'});
 if(text){const lead=size*1.12,block=(lines.length?(lines.length-1)*lead+size*(ASC+DESC):0)+(url?(lines.length?us*.7:0)+us*(ASC+DESC):0);let y=s.y+(s.h-block)/2+(lines.length?size*ASC:us*ASC);
  lines.forEach((l,i)=>items.push({t:'text',x:tx,y:y+i*lead,s:l,size,bold:true,fill:head,label:'Payoff'}));
  if(url)items.push({t:'text',x:tx,y:lines.length?y+(lines.length-1)*lead+size*DESC+us*.7+us*ASC:y,s:url,size:us,bold:false,fill:lines.length?soft:head,label:'Sito web'})}
 return {kind:'copertina',spec,bg,items:clearDecor(items,Math.round(spec.h*.04)),notes,min}}

// ---- highlight covers ----
function highlightLayout(h,m){const S=scheme(m),pal=S.pal,H=SIZES.highlight,items=[];let bg=m.direction==='chiaro'?pal.light:m.direction==='pieno'?S.fondo:S.acc;
 rect(items,0,0,H.w,H.h,bg);let under=bg;
 if(m.direction==='chiaro'){circle(items,H.cx,H.cy,H.circle,S.acc);under=S.acc}
 const P=PS(),stroke=P.ink(under,pal,m.direction==='fascia'?pal.dark:pal.light,pal.light,pal.dark),sz=H.icon;
 items.push({t:'icon',x:H.cx-sz/2,y:H.cy-sz/2,w:sz,h:sz,d:h.d,stroke,sw:1.7,label:'Icona «'+h.title+'»'});
 return {kind:'evidenza',spec:{id:'evidenza-'+h.id,title:'In evidenza · '+h.title,w:H.w,h:H.h,circle:{cx:H.cx,cy:H.cy,r:H.circle}},bg,items,highlight:h}}

// ---- post templates ----
function postTexts(m,typeId){const t=type(typeId),v=m.texts[t.id]||{},ph={},out={placeholders:[]};
 for(const [k,label,,p] of t.fields){if(k==='stars'){out.stars=v.stars||0;continue}const val=clean(v[k]);if(val){out[k]=val;continue}if(p&&k!=='kicker'){out[k]=p;out.placeholders.push(label)}else out[k]=k==='kicker'?'':''}
 if(t.id==='recensione'&&out.title&&!/^\[/.test(out.title))out.title='«'+out.title.replace(/^[«"“]+|[»"”]+$/g,'')+'»';
 return out}
// Text block: kicker, title, body, meta, cta (pill), stars; fitted into box from the largest size down. align left|center.
function textBlock(items,box,tx,S,{bg,align='left',title0,min,photo=false}){const P=PS(),pal=S.pal,out={overflow:false};
 const head=P.ink(bg,pal,S.acc,pal.primary,pal.dark,pal.light),body=P.ink(bg,pal,pal.dark,pal.light),kc=P.ink(bg,pal,S.acc,pal.secondary,pal.dark,pal.light);
 const btn=[S.acc,pal.accent,pal.primary,pal.secondary,pal.dark,pal.light].find(c=>up(c)!==up(bg)&&P.contrast(c,bg)>=3)||P.ink(bg,pal,pal.light,pal.dark),onBtn=P.ink(btn,pal,pal.light,pal.dark);
 const stars=tx.stars||0;let plan=null;
 for(let T=title0;T>=min;T-=2){const k=Math.max(min,Math.round(T*.4)),b=Math.max(min,Math.round(T*.5)),mt=Math.max(min,Math.round(T*.42)),c=Math.max(min,Math.round(T*.4));
  const tl=tx.title?wrapPx(tx.title,T,box.w,true):[],bl=tx.body?wrapPx(tx.body,b,box.w,false):[],ml=tx.meta?wrapPx(tx.meta,mt,box.w,true):[];
  if(tl.length>4||bl.length>5||ml.length>2)continue;if(!fits(tl,T,box.w,true)||!fits(bl,b,box.w,false)||!fits(ml,mt,box.w,true))continue;
  const gap=T*.42,cw=tx.cta?wPx(tx.cta,c,true)+c*1.6:0,parts=[];
  if(stars)parts.push(['stars',T*.62]);if(tx.kicker)parts.push(['kicker',k*(ASC+DESC)]);if(tl.length)parts.push(['title',(tl.length-1)*T*1.1+T*(ASC+DESC)]);
  if(bl.length)parts.push(['body',(bl.length-1)*b*1.3+b*(ASC+DESC)]);if(ml.length)parts.push(['meta',(ml.length-1)*mt*1.25+mt*(ASC+DESC)]);if(tx.cta)parts.push(['cta',c*2.1]);
  const total=parts.reduce((a,p)=>a+p[1],0)+gap*(parts.length-1);if(total>box.h||cw>box.w)continue;plan={T,k,b,mt,c,tl,bl,ml,gap,parts,total,cw};break}
 if(!plan){out.overflow=true;const T=min;plan={T,k:min,b:min,mt:min,c:min,tl:tx.title?wrapPx(tx.title,T,box.w,true).slice(0,4):[],bl:tx.body?wrapPx(tx.body,T,box.w,false).slice(0,5):[],ml:tx.meta?wrapPx(tx.meta,T,box.w,true).slice(0,2):[],gap:T*.4,cw:tx.cta?wPx(tx.cta,T,true)+T*1.6:0};
  plan.parts=[stars?['stars',T*.62]:0,tx.kicker?['kicker',T]:0,plan.tl.length?['title',plan.tl.length*T*1.1]:0,plan.bl.length?['body',plan.bl.length*T*1.3]:0,plan.ml.length?['meta',plan.ml.length*T*1.25]:0,tx.cta?['cta',T*2.1]:0].filter(Boolean);plan.total=box.h}
 const X=(w)=>align==='center'?box.x+(box.w-w)/2:box.x;let y=box.y+Math.max(0,(box.h-plan.total)/(photo?4:2));
 for(const [kind,h] of plan.parts){
  if(kind==='stars'){const r=plan.T*.3,sp=r*2.4,w=sp*(stars-1)+2*r;for(let i=0;i<stars;i++)items.push({t:'star',cx:X(w)+r+i*sp,cy:y+r,r,fill:btn,label:'Stelle'})}
  if(kind==='kicker'){const s=tx.kicker.toUpperCase();items.push({t:'text',x:X(wPx(s,plan.k,true)),y:y+plan.k*ASC,s,size:plan.k,bold:true,fill:kc,label:'Etichetta'})}
  if(kind==='title')plan.tl.forEach((l,i)=>items.push({t:'text',x:X(wPx(l,plan.T,true)),y:y+plan.T*ASC+i*plan.T*1.1,s:l,size:plan.T,bold:true,fill:head,label:'Titolo'}));
  if(kind==='body')plan.bl.forEach((l,i)=>items.push({t:'text',x:X(wPx(l,plan.b,false)),y:y+plan.b*ASC+i*plan.b*1.3,s:l,size:plan.b,bold:false,fill:body,label:'Testo'}));
  if(kind==='meta')plan.ml.forEach((l,i)=>items.push({t:'text',x:X(wPx(l,plan.mt,true)),y:y+plan.mt*ASC+i*plan.mt*1.25,s:l,size:plan.mt,bold:true,fill:body,label:'Dettagli'}));
  if(kind==='cta'){const bx=X(plan.cw),bh=plan.c*2.1;rect(items,bx,y,plan.cw,bh,btn,{rx:bh/2,label:'Pulsante'});items.push({t:'text',x:bx+plan.c*.8,y:y+bh/2+plan.c*ASC/2-plan.c*.02,s:tx.cta,size:plan.c,bold:true,fill:onBtn,label:'Invito'})}
  y+=h+plan.gap}
 return out}
function postLayout(typeId,fmt,m){const S=scheme(m),pal=S.pal,W=fmt.w,H=fmt.h,s=fmt.safe,items=[],min=minText(fmt.seen),tx=postTexts(m,typeId),photo=m.photo,story=fmt.id==='storia';
 const base={square:84,portrait:92,story:104}[story?'story':fmt.id==='verticale'?'portrait':'square'],logoH=Math.round(W*.085);
 let bg=S.fondo,textBox,align='left',panel=bg,res;
 // the logo row at the bottom of the safe area
 const logoBox={x:s.x,y:s.y+s.h-logoH,w:s.w*.4,h:logoH};
 if(m.direction==='pieno'){rect(items,0,0,W,H,bg);circle(items,W-W*.04,W*.04,W*.2,S.deco);align='center';
  if(photo){const ph=Math.round((s.h-logoH)*(story?.46:.48));items.push({t:'photo',x:s.x,y:s.y,w:s.w,h:ph,r:W*.03,src:photo.src,pw:photo.w,ph:photo.h,label:'Foto'});textBox={x:s.x,y:s.y+ph+W*.05,w:s.w,h:s.h-ph-W*.05-logoH-W*.04}}
  else textBox={x:s.x+s.w*.04,y:s.y+W*.2,w:s.w*.92,h:s.h-W*.2-logoH-W*.04};
  logoBox.x=s.x+s.w*.3;logoBox.w=s.w*.4;res=textBlock(items,textBox,tx,S,{bg,align,title0:base,min,photo:!!photo});logoItem(items,m,logoBox,bg,{align:'center'})}
 else if(m.direction==='fascia'){const top=photo?Math.round(H*(story?.5:fmt.id==='verticale'?.5:.46)):Math.round(H*(story?.36:.3));
  rect(items,0,0,W,H,bg);if(photo)items.push({t:'photo',x:0,y:0,w:W,h:top,r:0,src:photo.src,pw:photo.w,ph:photo.h,label:'Foto'});else{circle(items,W*.18,top*.55,top*.36,S.deco);rect(items,W*.5,top*.3,W*.42,Math.max(10,W*.018),S.deco)}
  panel=S.acc;rect(items,0,top,W,H-top,panel);textBox={x:s.x,y:Math.max(top+W*.06,s.y),w:s.w,h:s.y+s.h-logoH-W*.04-Math.max(top+W*.06,s.y)};
  res=textBlock(items,textBox,tx,S,{bg:panel,title0:base,min,photo:true});logoItem(items,m,logoBox,panel)}
 else{rect(items,0,0,W,H,bg);rect(items,0,0,W,Math.max(10,Math.round(W*.014)),S.acc);
  if(photo){const ph=Math.round(H*(story?.48:fmt.id==='verticale'?.5:.46));items.push({t:'photo',x:0,y:Math.max(10,Math.round(W*.014)),w:W,h:ph-Math.max(10,Math.round(W*.014)),r:0,src:photo.src,pw:photo.w,ph:photo.h,label:'Foto'});
   const ty=Math.max(ph+W*.06,s.y);textBox={x:s.x,y:ty,w:s.w,h:s.y+s.h-logoH-W*.04-ty}}
  else{rect(items,s.x,s.y+W*.02,Math.max(8,W*.012),s.h-logoH-W*.08,S.deco);textBox={x:s.x+W*.05,y:s.y,w:s.w-W*.05,h:s.h-logoH-W*.04}}
  res=textBlock(items,textBox,tx,S,{bg,title0:base,min,photo:!!photo});logoItem(items,m,logoBox,bg)}
 return {kind:'post',items:clearDecor(items,Math.round(W*.03)),spec:{...fmt,id:'post-'+typeId+'-'+fmt.id,title:type(typeId).title+' · '+fmt.title+' '+fmt.w+'×'+fmt.h,type:typeId,format:fmt.id},bg,min,overflow:res.overflow,placeholders:tx.placeholders,photo:!!photo}}

// ---- everything ----
function build(m){const out=[];
 if(has(m,'profilo')&&profilesOf(m).length)out.push(avatarLayout(m));
 for(const c of coversOf(m))out.push(coverLayout(c,m));
 for(const h of highlightsOf(m))out.push(highlightLayout(h,m));
 for(const f of postFormatsOf(m))for(const t of m.types)out.push(postLayout(t,f,m));
 return out}
// The preview of one direction: avatar, the first cover, one post, three highlights.
function sample(m){const all=build(m);return [all.find(L=>L.kind==='profilo'),all.find(L=>L.kind==='copertina'),all.find(L=>L.kind==='post'),...all.filter(L=>L.kind==='evidenza').slice(0,3)].filter(Boolean)}

// ---- SVG ----
const FONT="Helvetica, Arial, 'Liberation Sans', sans-serif";
function toSvg(L,{guides=false,scale=1}={}){const P=PS(),{w,h}=L.spec,o=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+w+' '+h+'" width="'+Math.round(w*scale)+'" height="'+Math.round(h*scale)+'">'];let clip=0;
 for(const it of L.items){
  if(it.t==='rect')o.push('<rect x="'+n2(it.x)+'" y="'+n2(it.y)+'" width="'+n2(it.w)+'" height="'+n2(it.h)+'"'+(it.rx?' rx="'+n2(it.rx)+'"':'')+' fill="'+it.fill+'"/>');
  else if(it.t==='circle')o.push('<circle cx="'+n2(it.cx)+'" cy="'+n2(it.cy)+'" r="'+n2(it.r)+'" fill="'+it.fill+'"/>');
  else if(it.t==='ring')o.push('<circle cx="'+n2(it.cx)+'" cy="'+n2(it.cy)+'" r="'+n2(it.r)+'" fill="none" stroke="'+it.stroke+'" stroke-width="'+n2(it.w)+'"/>');
  else if(it.t==='text')o.push('<text x="'+n2(it.x)+'" y="'+n2(it.y)+'" font-family="'+FONT+'" font-size="'+n2(it.size)+'"'+(it.bold?' font-weight="700"':'')+' fill="'+it.fill+'" xml:space="preserve">'+esc(it.s)+'</text>');
  else if(it.t==='logo')o.push('<image x="'+n2(it.x)+'" y="'+n2(it.y)+'" width="'+n2(it.w)+'" height="'+n2(it.h)+'" preserveAspectRatio="xMidYMid meet" href="'+esc(P.svgUrl(it.svg))+'"/>');
  else if(it.t==='photo'){const id='sc-clip-'+(++clip);o.push('<clipPath id="'+id+'"><rect x="'+n2(it.x)+'" y="'+n2(it.y)+'" width="'+n2(it.w)+'" height="'+n2(it.h)+'" rx="'+n2(it.r||0)+'"/></clipPath><image x="'+n2(it.x)+'" y="'+n2(it.y)+'" width="'+n2(it.w)+'" height="'+n2(it.h)+'" preserveAspectRatio="xMidYMid slice" clip-path="url(#'+id+')" href="'+esc(it.src)+'"/>')}
  else if(it.t==='icon'){const k=it.w/24;o.push('<g transform="translate('+n2(it.x)+' '+n2(it.y)+') scale('+n2(k)+')" fill="none" stroke="'+it.stroke+'" stroke-width="'+it.sw+'" stroke-linecap="round" stroke-linejoin="round">'+it.d.map(d=>'<path d="'+d+'"/>').join('')+'</g>')}
  else if(it.t==='star'){const pts=[];for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?it.r*.45:it.r;pts.push(n2(it.cx+r*Math.cos(a))+','+n2(it.cy+r*Math.sin(a)))}o.push('<polygon points="'+pts.join(' ')+'" fill="'+it.fill+'"/>')}}
 if(guides){const sw=Math.max(2,w/300),da=Math.round(w/80)+' '+Math.round(w/120);
  if(L.spec.safe){const s=L.spec.safe;o.push('<rect x="'+s.x+'" y="'+s.y+'" width="'+s.w+'" height="'+s.h+'" fill="none" stroke="#2f80ed" stroke-width="'+sw+'" stroke-dasharray="'+da+'"/>')}
  if(L.spec.circle){const c=L.spec.circle;o.push('<circle cx="'+c.cx+'" cy="'+c.cy+'" r="'+n2(c.r)+'" fill="none" stroke="#2f80ed" stroke-width="'+sw+'" stroke-dasharray="'+da+'"/>')}}
 o.push('</svg>');return o.join('')}

// ---- checks ----
const inside=(bb,s,e=.5)=>bb.x0>=s.x-e&&bb.y0>=s.y-e&&bb.x1<=s.x+s.w+e&&bb.y1<=s.y+s.h+e;
const inCircle=(bb,c,e=.5)=>[[bb.x0,bb.y0],[bb.x1,bb.y0],[bb.x0,bb.y1],[bb.x1,bb.y1]].every(([x,y])=>Math.hypot(x-c.cx,y-c.cy)<=c.r+e);
// The colour under a point: the last shape drawn there (a photo counts as «photo»).
function under(L,x,y,upto){let bg=L.bg;for(const it of L.items){if(it===upto)break;
 if(it.t==='rect'&&x>=it.x&&x<=it.x+it.w&&y>=it.y&&y<=it.y+it.h)bg=it.fill;else if(it.t==='circle'&&Math.hypot(x-it.cx,y-it.cy)<=it.r)bg=it.fill;else if(it.t==='photo'&&x>=it.x&&x<=it.x+it.w&&y>=it.y&&y<=it.y+it.h)bg='photo'}return bg}
function safeProblems(L){const out=[];
 for(const it of L.items){const bb=boxOf(it);if(!bb||it.t==='photo')continue;
  if(L.spec.circle&&(L.kind==='profilo'||L.kind==='evidenza')){if(!inCircle(bb,L.spec.circle))out.push(L.spec.title+': «'+it.label+'» esce dal ritaglio rotondo.')}
  else if(L.spec.safe&&!inside(bb,L.spec.safe))out.push(L.spec.title+': «'+it.label+'» esce dall’area visibile su tutti i dispositivi.')}
 return out}
function contrastProblems(L){const P=PS(),out=[];
 for(const it of L.items){if(!['text','icon','star'].includes(it.t))continue;const bb=boxOf(it),bg=under(L,(bb.x0+bb.x1)/2,(bb.y0+bb.y1)/2,it);
  if(bg==='photo'){out.push(L.spec.title+': «'+it.label+'» è sopra la foto.');continue}
  const fg=it.t==='icon'?it.stroke:it.fill,large=it.t!=='text'||it.size*.75>=18||(it.bold&&it.size*.75>=14),need=large?3:4.5,r=P.contrast(fg,bg);
  if(r<need)out.push(L.spec.title+': «'+it.label+'» '+up(fg)+' su '+up(bg)+' '+String(r).replace('.',',')+':1 (serve '+String(need).replace('.',',')+':1)')}
 return out}
const sizeProblems=L=>L.min?L.items.filter(it=>it.t==='text'&&it.size<L.min-.01).map(it=>L.spec.title+': «'+it.label+'» a '+Math.round(it.size)+' px, sul telefono serve almeno '+L.min+' px.'):[];
function colourProblems(L,brand){const ok=new Set(Object.values(brand.palette).map(up).concat(['#FFFFFF','#000000'])),bad=new Set();
 for(const it of L.items)for(const k of ['fill','stroke'])if(it[k]&&!ok.has(up(it[k])))bad.add(up(it[k]));
 for(const it of L.items)if(it.t==='logo'&&it.mono&&!ok.has(up(it.mono)))bad.add(up(it.mono));return [...bad]}
// The logo at the size the platform shows the profile image: under 16 px of height it does not read.
function avatarReadability(m){const L=avatarLayout(m),lg=L.items.find(it=>it.t==='logo');if(!lg)return null;const shown=Math.min(...(profilesOf(m).map(p=>p.shown).concat([110])));return {shown,px:Math.round(lg.h*shown/L.spec.w),wide:lg.w/lg.h>2.2,symbol:lg.label==='Simbolo'}}
const PL=(list,max=8)=>[...new Set(list)].slice(0,max);
// [{id, label, state:'ok'|'warn'|'fail', detail, issues:[...]}]
function checksOf(m,built){const b=built||build(m),out=[],add=(id,label,state,detail,issues=[])=>out.push({id,label,state,detail,issues:PL(issues)});
 const brand=m.brand,noLogo=!brand.logo;
 add('kit','Kit identità',!brand.fromKit?'fail':noLogo?'warn':'ok',!brand.fromKit?'Il progetto non ha un Kit identità salvato: RADIX non inventa colori e logo.':noLogo?'Il kit non ha un logo: al suo posto c’è il nome del brand scritto.':'Logo e palette del Kit identità'+(brand.direction?' «'+brand.direction+'»':'')+' in ogni immagine.'+(brand.fonts.heading?' Il font del kit ('+brand.fonts.heading+') non si incorpora nei PNG: i testi usano Helvetica o Arial.':''));
 if(!b.length){add('vuoto','Cosa preparare','fail','Scegli almeno un canale e un pezzo che esiste per quel canale (le copertine «in evidenza» sono solo per Instagram).');return out}
 const safe=b.flatMap(safeProblems);add('safe','Aree sicure',safe.length?'fail':'ok',safe.length?'Qualcosa rischia di essere tagliato o coperto.':'Logo e testi stanno nelle aree visibili su telefono e computer, dentro i ritagli rotondi e fuori dalle zone delle storie occupate dall’interfaccia.',safe);
 const con=b.flatMap(contrastProblems);add('contrasto','Contrasto AA',con.length?'fail':'ok',con.length?'Testi o icone poco leggibili sul loro fondo.':'Ogni testo ha almeno 4,5:1 sul suo fondo (3:1 i titoli grandi e le icone). Nessun testo sopra la foto.',con);
 const sz=b.flatMap(sizeProblems),over=b.filter(L=>L.overflow).map(L=>L.spec.title+': il testo è troppo lungo, accorcialo.');
 add('misura','Testo leggibile sul telefono',sz.length||over.length?'fail':'ok',sz.length||over.length?'Alcuni testi sono troppo piccoli o non entrano.':'Ogni testo resta almeno a '+MIN_CSS+' px sullo schermo di un telefono largo '+PHONE_CSS+' px.',over.concat(sz));
 const off=[...new Set(b.flatMap(L=>colourProblems(L,brand)))];add('colori','Colori della palette',off.length?'fail':'ok',off.length?'Colori fuori dalla palette: '+off.join(', ')+'.':'Solo i colori del Kit identità, più bianco e nero.',off);
 const ar=has(m,'profilo')&&m.avatar!=='iniziali'?avatarReadability(m):null;
 const sy=m.avatar==='simbolo'?symbolOf(m):null;
 if(has(m,'profilo'))add('profilo','Immagine del profilo',ar&&(ar.px<16||ar.wide)?'warn':'ok',ar?(ar.px<16||ar.wide?'Il logo intero è largo: nel cerchio da '+ar.shown+' px è alto solo '+ar.px+' px e il nome si legge male. Usa «Simbolo del logo» o «Iniziali del nome».':(ar.symbol?'Il simbolo del logo'+(sy&&sy.generated?' (il logo non ha un simbolo separato: è il monogramma del Kit)':''):'Il logo')+' nel cerchio da '+ar.shown+' px è alto '+ar.px+' px: si legge.'):m.avatar==='iniziali'?'Iniziali «'+(initials(brand.name)||'?')+'» dal nome del brand, dentro il ritaglio rotondo.':'Il kit non ha un logo: uso il nome del brand.');
 const ph=[...new Set(b.filter(L=>L.placeholders&&L.placeholders.length).map(L=>type(L.spec.type).title+': '+L.placeholders.join(', ').toLowerCase()))];
 if(has(m,'post'))add('testi','Testi dei template',ph.length?'warn':'ok',ph.length?'Alcuni template hanno ancora i segnaposto tra parentesi quadre: vanno bene come modelli, non da pubblicare così.':'Tutti i template hanno i tuoi testi.',ph);
 const notes=b.filter(L=>L.notes&&L.notes.length).map(L=>L.spec.title+': '+L.notes.join('; ')+'.');
 if(coversOf(m).length)add('copertine','Testi delle copertine',notes.length?'warn':'ok',!m.payoff&&!m.sito?'Payoff e sito non ci sono: le copertine mostrano solo il logo. RADIX non li inventa.':notes.length?'Su alcune copertine un testo non entra a una misura leggibile ed è rimasto fuori.':'Payoff e sito leggibili su ogni copertina.',notes);
 if(has(m,'post')&&postFormatsOf(m).length){const p=m.photo;let st='ok',d='Nessuna foto: i template usano solo i colori del brand. Puoi aggiungerne una nella rifinitura.';
  if(p){const need=Math.max(...b.filter(L=>L.kind==='post').flatMap(L=>L.items.filter(it=>it.t==='photo').map(it=>Math.max(it.w/p.w,it.h/p.h))),0);st=need>1.05?'warn':'ok';d=need>1.05?'La foto è piccola ('+p.w+' × '+p.h+' px): nei template viene ingrandita e può sgranare. Usa una foto di almeno 1080 px di lato.':'Foto '+p.w+' × '+p.h+' px: abbastanza grande per ogni formato.'}
  add('foto','Foto',st,d)}
 return out}
const blocking=c=>c.filter(x=>x.state==='fail');

// ---- the files ----
const brandSlug=m=>slug(m.brand.name)||'brand';
function fileName(L,ch){if(L.kind==='profilo')return 'profilo/'+ch.channel+'-profilo-'+ch.w+'x'+ch.h;if(L.kind==='copertina')return 'copertine/'+L.spec.id+'-copertina-'+L.spec.w+'x'+L.spec.h;
 if(L.kind==='evidenza')return 'in-evidenza/instagram-in-evidenza-'+L.highlight.id+'-'+L.spec.w+'x'+L.spec.h;return 'post/'+L.spec.type+'-'+L.spec.format+'-'+L.spec.w+'x'+L.spec.h}
// The pieces to export: [{name (no extension), layout, w, h, label}]: the profile image once per channel at its size.
function exportList(m,built){const b=built||build(m),out=[];
 for(const L of b){if(L.kind==='profilo'){for(const p of profilesOf(m))out.push({name:fileName(L,p),layout:L,w:p.w,h:p.h,label:'Immagine del profilo · '+channelTitle(p.channel)+' '+p.w+'×'+p.h});continue}
  out.push({name:fileName(L),layout:L,w:L.spec.w,h:L.spec.h,label:L.spec.title+(L.kind==='copertina'?' '+L.spec.w+'×'+L.spec.h:'')})}
 return out}
const UPLOAD=Object.freeze({
 instagram:['Immagine del profilo: Profilo › Modifica › Modifica immagine › Scegli dalla libreria: carica instagram-profilo-1080x1080.png.','Copertine «in evidenza»: salva prima i PNG nel rullino del telefono. Tieni premuto il momento in evidenza › Modifica momento in evidenza › Modifica copertina › icona della galleria › scegli il PNG e centra l’icona nel cerchio.','Template: pubblica il PNG come post (quadrato 1:1 o verticale 4:5) o come storia (9:16).'],
 facebook:['Immagine del profilo: sulla pagina tocca la foto del profilo › Scegli immagine del profilo › Carica foto: facebook-profilo-1080x1080.png.','Copertina: sulla pagina › Modifica › Carica foto › facebook-copertina-1640x624.png. Controlla l’anteprima sul telefono: si vede solo il centro.'],
 linkedin:['Logo: sulla pagina aziendale (vista amministratore) › Modifica pagina › Intestazione › Logo: linkedin-profilo-400x400.png.','Copertina: Modifica pagina › Intestazione › Immagine di copertina: linkedin-copertina-1128x191.png.'],
 'linkedin-persona':['Sfondo del profilo personale: Profilo › matita sull’immagine di sfondo › Carica foto: linkedin-persona-copertina-1584x396.png. La foto del profilo personale resta la tua foto, non il logo.'],
 youtube:['Banner: YouTube Studio › Personalizzazione › Branding › Immagine del banner › Carica: youtube-copertina-2560x1440.png (massimo 6 MB). Controlla l’anteprima «Computer», «TV» e «Dispositivi mobili».','Immagine del profilo: YouTube Studio › Personalizzazione › Branding › Immagine › Carica: youtube-profilo-800x800.png.'],
 x:['Intestazione: Profilo › Modifica profilo › icona della fotocamera sull’intestazione: x-copertina-1500x500.png.','Immagine del profilo: Modifica profilo › icona della fotocamera sulla foto: x-profilo-400x400.png.'],
 tiktok:['Immagine del profilo: Profilo › Modifica profilo › Cambia foto › Carica foto: tiktok-profilo-1080x1080.png. TikTok non ha copertina del profilo.']});
function readme(m,checks,list,{date}={}){const d=(date||new Date()).toISOString().slice(0,10),L=['GRAFICA PROFILI E TEMPLATE SOCIAL · '+(m.brand.name||'Brand'),'Direzione: '+direction(m.direction).title+' · fondo '+ROLE_LABEL[m.colors.fondo].toLowerCase()+', accento '+ROLE_LABEL[m.colors.accento].toLowerCase()+' · preparata con RADIX il '+d+', nessuna chiamata AI',''];
 L.push('FILE',...list.map(f=>'- '+f.name+'.png · '+f.label+' (stessa immagine in .svg, modificabile)'),'');
 L.push('COME CARICARLI');for(const c of m.channels){const u=UPLOAD[c];if(!u)continue;L.push(channelTitle(c).toUpperCase(),...u.map(x=>'- '+x),'')}
 L.push('DOPO IL CARICAMENTO','- Guarda ogni profilo dal telefono e dal computer: logo e testi devono restare interi, lontani dalla foto del profilo e dai pulsanti.','- Le piattaforme cambiano spesso misure e ritagli: misure di RADIX controllate a '+SIZES.checked+'. Se qualcosa viene tagliato, scrivilo: si corregge la tabella delle misure.','');
 const cv=coversOf(m);if(cv.length)L.push('MISURE DELLE COPERTINE',...cv.map(c=>'- '+c.title+': '+c.w+' × '+c.h+' px. '+c.note),'');
 if(postFormatsOf(m).some(f=>f.id==='storia'))L.push('STORIE','- '+SIZES.posts[2].note,'');
 L.push('CONTROLLI',...checks.map(c=>'- '+c.label+': '+({ok:'OK',warn:'da guardare',fail:'da sistemare'})[c.state]+'. '+c.detail),'');
 if(!m.payoff||!m.sito)L.push('DATI NON PRESENTI (RADIX non li inventa)',...(!m.payoff?['- Payoff']:[]),...(!m.sito?['- Sito web']:[]),'');
 return L.join('\n')+'\n'}
const zipName=m=>'social-'+brandSlug(m)+'-'+m.direction+'.zip';
// opts.png(svg,w,h) → Uint8Array (browser canvas). Throws when the checks block the export.
async function files(m,opts={}){const built=build(m),checks=checksOf(m,built),bl=blocking(checks);if(bl.length)throw Error('Prima sistema: '+bl.map(c=>c.label.toLowerCase()).join(', ')+'.');
 const list=exportList(m,built),out=[],root=ROOT+'-'+brandSlug(m),add=(name,data,label)=>out.push({name:root+'/'+name,data,label});
 for(const f of list){const svg=toSvg(f.layout,{scale:f.w/f.layout.spec.w});if(opts.png)add(f.name+'.png',await opts.png(svg,f.w,f.h),f.label+' (PNG)');add(f.name+'.svg',svg,f.label+' (SVG)')}
 add('LEGGIMI.txt',readme(m,checks,list,{date:opts.date}),'Come caricarle su ogni piattaforma');return out}
const bundle=(list,{date}={})=>ZIP().zip(list.map(f=>({name:f.name,data:f.data})),{date:date||new Date()});

// ---- saved in the project: the «agents» document, key socialKit (the photo is not saved) ----
const emptyStore=()=>({schemaVersion:1,items:[]});
function readStore(doc){const s=doc&&doc.socialKit;return s&&typeof s==='object'&&Array.isArray(s.items)?{schemaVersion:1,items:s.items.filter(x=>x&&typeof x==='object')}:emptyStore()}
function savedRecord(m,{by,at,checks}={}){const when=at||new Date().toISOString();
 return {id:'social-'+when.replace(/\D/g,'').slice(0,14),at:when,by:clean(by).slice(0,80),direction:m.direction,channels:m.channels.slice(),pieces:m.pieces.slice(),highlights:m.highlights.slice(),types:m.types.slice(),formats:m.formats.slice(),
  payoff:m.payoff,sito:m.sito,avatar:m.avatar,colors:{...m.colors},texts:JSON.parse(JSON.stringify(m.texts)),photo:m.photo?{name:m.photo.name,w:m.photo.w,h:m.photo.h}:null,
  kit:{brand:clean(m.brand.name),direction:clean(m.brand.direction)},checks:(checks||checksOf(m)).map(c=>({id:c.id,state:c.state}))}}
function addRecord(store,rec){const s=readStore({socialKit:store});return {schemaVersion:1,items:s.items.filter(x=>x.id!==rec.id).concat([rec]).slice(-MAX_SAVED)}}
async function saveToProject(ws,projectId,rec){if(!ws||typeof ws.bind!=='function')throw Error('Archivio del progetto non disponibile.');const d=ws.bind(projectId,'agents');
 for(let i=0;i<3;i++){const cur=(await d.load())||{},next=addRecord(readStore(cur),rec);
  try{await d.save({...cur,schemaVersion:1,conversations:cur.conversations||{},socialKit:next});return next}catch(e){if(!(ws.ConflictError&&e instanceof ws.ConflictError)||i===2)throw e}}}
const inputOf=r=>({direction:r.direction,channels:r.channels,pieces:r.pieces,highlights:r.highlights,types:r.types,formats:r.formats,payoff:r.payoff,sito:r.sito,avatar:r.avatar,colors:r.colors,texts:r.texts});

// ---- the widget (browser) ----
let counter=0;
const doc=()=>root.document;
const E=(tag,text,cls)=>{const n=doc().createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
const button=(text,cls)=>{const b=E('button',text,cls||'');b.type='button';return b};
const MIME={png:'image/png',svg:'image/svg+xml',txt:'text/plain;charset=utf-8',zip:'application/zip'};
const save=(name,data)=>PS().download(name.split('/').pop(),data,MIME[name.split('.').pop()]||'application/octet-stream');
// The photo for the templates: read in the browser, resized to at most PHOTO_MAX px, never sent anywhere.
function readPhoto(file){return new Promise((res,rej)=>{if(!file||!/^image\/(png|jpeg|webp)$/.test(file.type)){rej(Error('Scegli una foto JPG, PNG o WebP.'));return}
 const fr=new root.FileReader();fr.onerror=()=>rej(Error('Foto non leggibile.'));fr.onload=()=>{const img=new root.Image();img.onerror=()=>rej(Error('Foto non leggibile.'));img.onload=()=>{const w=img.naturalWidth,h=img.naturalHeight,k=Math.min(1,PHOTO_MAX/Math.max(w,h));
   if(k===1&&file.size<4e6){res({src:fr.result,w,h,name:file.name});return}const c=E('canvas');c.width=Math.round(w*k);c.height=Math.round(h*k);c.getContext('2d').drawImage(img,0,0,c.width,c.height);res({src:c.toDataURL('image/jpeg',.9),w:c.width,h:c.height,name:file.name})};img.src=fr.result};fr.readAsDataURL(file)})}
const svgImg=(svg,alt)=>{const i=E('img');i.src=PS().svgUrl(svg);i.alt=alt;i.loading='lazy';return i};
// ctx: {project, profile, projectName, projectId, workspace, agentsUrl, by, openIdentity(), identityUrl}
function socialStudio(ctx={}){const n=++counter,P=PS(),profile=ctx.profile||{},wrap=E('div',undefined,'tool photo-studio ad-studio coordinato-studio social-studio');
 const steps=E('ol',undefined,'ps-steps');['Le domande','3 direzioni','Rifinitura e controlli','Scarica lo zip'].forEach((t,i)=>{const li=E('li',(i+1)+' · '+t);li.dataset.step=String(i+1);steps.append(li)});
 const setStep=k=>[...steps.children].forEach(li=>li.dataset.state=+li.dataset.step<k?'done':+li.dataset.step===k?'current':'todo');
 wrap.append(steps);setStep(1);
 if(!hasKit(profile)){const box=E('div',undefined,'co-empty');box.dataset.empty='kit';box.append(E('h3','Prima serve il Kit identità'),E('p','Immagini del profilo, copertine e template si disegnano con il logo e i colori del Kit identità del progetto. Questo progetto non ne ha ancora uno salvato, e RADIX non inventa colori, logo o dati dell’azienda al suo posto.','ad-idea'));
  const go=ctx.openIdentity?button('Crea il Kit identità','primary'):E('a','Crea il Kit identità','co-link primary');if(ctx.openIdentity)go.onclick=()=>ctx.openIdentity();else go.href=ctx.identityUrl||'/agency/crea.html?open=identita';
  const acts=E('div',undefined,'ps-actions');acts.append(go,E('span','Il Kit identità è una chiamata AI con conferma; la grafica social poi è gratuita.','muted'));box.append(acts);wrap.append(box);return wrap}
 const brand=P.brandOf(profile,ctx.projectName),pre=prefill(profile,{projectName:ctx.projectName});
 const st={direction:'',channels:['instagram','facebook','linkedin'],pieces:PIECE_IDS.slice(),highlights:HIGHLIGHT_DEFAULT.slice(),types:TYPE_IDS.slice(),formats:['quadrato','verticale','storia'],payoff:pre.values.payoff,sito:pre.values.sito,avatar:'simbolo',colors:null,texts:{},photo:null,guides:false,showType:'offerta',busy:false,files:null};
 const input=dir=>({...st,direction:dir,colors:dir===st.direction?st.colors:null});
 const model=()=>modelOf(input(st.direction||'chiaro'),profile,{projectName:ctx.projectName});
 // the kit in use
 const bx=E('div',undefined,'ad-brand co-brand');bx.dataset.source='kit';const sw=E('span',undefined,'ad-swatches');
 ROLES.forEach(k=>{const i=E('i');i.style.background=brand.palette[k];i.title=ROLE_LABEL[k]+' '+brand.palette[k];sw.append(i)});
 const bt=E('span',undefined,'ad-brand-text');bt.append(E('strong',brand.name||'Il tuo brand'),E('span','Dal Kit identità'+(brand.direction?' «'+brand.direction+'»':'')+(brand.logo?'':' · senza logo: uso il nome scritto')));
 bx.append(sw,bt);if(brand.logo){const li=E('img');li.src=P.svgUrl(brand.logo);li.alt='Logo del kit';li.className='ad-brand-logo';bx.append(li)}
 const form=E('div',undefined,'ps-form');
 const chips=(legend,list,key,name,{note}={})=>{const fs=E('fieldset',undefined,'fs-choice sc-choice');fs.dataset.key=key;fs.append(E('legend',legend));
  list.forEach(([id,label,sub])=>{const l=E('label',undefined,'ps-chip co-opt'),c=E('input');c.type='checkbox';c.name='sc-'+name+'-'+n;c.value=id;c.checked=st[key].includes(id);
   c.onchange=()=>{st[key]=c.checked?[...new Set(st[key].concat(id))]:st[key].filter(x=>x!==id);changed()};l.append(c,E('span',label));if(sub)l.append(E('small',sub));fs.append(l)});
  if(note)fs.append(E('p',note,'ad-note'));return fs};
 const chFs=chips('Canali',CHANNELS.map(c=>[c.id,c.title]),'channels','ch',{note:'LinkedIn personale: solo lo sfondo, la foto del profilo resta quella della persona. TikTok: solo l’immagine del profilo.'});
 const pcFs=chips('Cosa preparare',PIECES.map(p=>[p.id,p.title,p.line]),'pieces','pc');
 const hlFs=chips('Copertine «in evidenza» (Instagram)',HIGHLIGHTS.map(h=>[h.id,h.title]),'highlights','hl');
 const tyFs=chips('Template dei post',TYPES.map(t=>[t.id,t.title]),'types','ty');
 const fmFs=chips('Formati dei post',SIZES.posts.map(f=>[f.id,f.title,f.w+' × '+f.h]),'formats','fm');
 const dataFs=E('fieldset',undefined,'co-company');dataFs.append(E('legend','Testi delle copertine'));const grid=E('div',undefined,'co-fields');
 [['payoff','Payoff (facoltativo)',120,'La frase sotto il nome'],['sito','Sito web (facoltativo)',80,'www.tuosito.it']].forEach(([k,label,max,ph])=>{const l=E('label',undefined,'co-field'),i=E('input');i.type='text';i.maxLength=max;i.placeholder=ph;i.value=st[k];i.name='sc-'+k;i.oninput=()=>{st[k]=i.value;changed()};
  l.append(E('span',label),i);if(pre.from[k])l.append(E('small','Dal progetto: controlla','co-from'));grid.append(l)});
 dataFs.append(grid,E('p','Se restano vuoti, le copertine mostrano solo il logo: RADIX non inventa payoff o indirizzi.','ad-note co-hint'));
 const go=button('Prepara 3 direzioni','primary'),bar=E('div',undefined,'ps-actions');bar.append(go,E('span','Nessuna chiamata AI e nessuna immagine generata: tutto si disegna qui dal tuo kit, senza costi.','muted'));
 form.append(bx,chFs,pcFs,hlFs,tyFs,fmFs,dataFs,bar);
 const status=E('p','','tool-status');status.setAttribute('role','status');
 const saved=E('div',undefined,'ad-saved co-saved');saved.hidden=true;
 const dirs=E('div',undefined,'ad-dirs co-dirs sc-dirs'),result=E('div',undefined,'ad-result co-result sc-result'),out=E('div',undefined,'co-kit sc-out');dirs.hidden=result.hidden=out.hidden=true;
 wrap.append(form,saved,status,dirs,result,out);
 let timer=0;function changed(){if(dirs.hidden)return;clearTimeout(timer);timer=setTimeout(()=>{renderDirs();if(st.direction)renderResult()},300)}
 async function loadSaved(){if(!ctx.workspace||!ctx.projectId)return;try{const s=readStore(await ctx.workspace.bind(ctx.projectId,'agents').load());if(!s.items.length)return;
  saved.replaceChildren(E('h4','Grafiche social salvate nel progetto'));const row=E('div',undefined,'ad-saved-row');
  s.items.slice(-4).reverse().forEach(r=>{const b=button(direction(r.direction).title+' · '+String(r.at||'').slice(0,10),'ad-saved-item');b.onclick=()=>{const i=inputOf(r);Object.assign(st,{...i,colors:i.colors||null,texts:i.texts||{}});st.direction=direction(r.direction).id;
   for(const fs of [chFs,pcFs,hlFs,tyFs,fmFs])fs.querySelectorAll('input').forEach(c=>{c.checked=(st[fs.dataset.key]||[]).includes(c.value)});grid.querySelectorAll('input').forEach(i=>{i.value=st[i.name.slice(3)]||''});
   renderDirs();renderResult();status.textContent='Riaperta la grafica salvata'+(r.photo?': ricarica la foto, non si salva nel progetto.':'.')};row.append(b)});
  saved.append(row);saved.hidden=false}catch(e){}}
 loadSaved();
 go.onclick=()=>{renderDirs();status.textContent='Ecco 3 direzioni fatte con il tuo kit: scegli quella da usare.';dirs.scrollIntoView&&dirs.scrollIntoView({behavior:'smooth',block:'start'})};
 const fig=(L,cls,{guides=false}={})=>{const f=E('figure',undefined,'co-fig sc-fig '+(cls||''));f.dataset.kind=L.kind;f.dataset.piece=L.spec.id;f.append(svgImg(toSvg(L,{guides,scale:Math.min(1,900/L.spec.w)}),L.spec.title),E('figcaption',/×/.test(L.spec.title)?L.spec.title:L.spec.title+' · '+L.spec.w+'×'+L.spec.h));return f};
 function renderDirs(){setStep(st.direction?3:2);dirs.hidden=false;
  dirs.replaceChildren(...DIRECTIONS.map(d=>{const m=modelOf(input(d.id),profile,{projectName:ctx.projectName}),smp=sample(m);
   const card=E('article',undefined,'ad-dir co-dir sc-dir');card.dataset.chosen=String(st.direction===d.id);card.dataset.direction=d.id;
   const head=E('div',undefined,'ad-dir-head');head.append(E('span','Direzione','ad-angle'),E('h3',d.title),E('p',d.line,'ad-idea'));
   const prev=E('div',undefined,'sc-sample');smp.forEach(L=>prev.append(fig(L,L.kind==='profilo'||L.kind==='evidenza'?'sc-round':'')));
   if(!smp.length)prev.append(E('p','Niente da mostrare: scegli almeno un canale e un pezzo.','co-hint'));
   const pick=button(st.direction===d.id?'Direzione scelta':'Scegli questa direzione','primary');pick.onclick=()=>{if(st.direction!==d.id)st.colors=null;st.direction=d.id;renderDirs();renderResult();result.scrollIntoView&&result.scrollIntoView({behavior:'smooth',block:'start'})};
   card.append(head,prev,pick);return card}))}
 function checkRow(c){const row=E('div',undefined,'co-check');row.dataset.state=c.state;row.dataset.check=c.id;
  row.append(E('span',{ok:'OK',warn:'Da guardare',fail:'Da sistemare'}[c.state],'co-check-badge'),E('strong',c.label),E('p',c.detail,'co-check-detail'));
  if(c.issues.length){const ul=E('ul');c.issues.forEach(i=>ul.append(E('li',i)));row.append(ul)}return row}
 function refine(m){const box=E('div',undefined,'fs-refine sc-refine'),pal=brand.palette;
  const role=(legend,key)=>{const fs=E('fieldset',undefined,'fs-choice');fs.append(E('legend',legend));ROLES.forEach(r=>{const l=E('label',undefined,'ps-chip fs-swatch'),x=E('input');x.type='radio';x.name='sc-'+key+'-'+n;x.value=r;x.checked=m.colors[key]===r;
   x.onchange=()=>{st.colors={...m.colors,[key]:r};renderResult()};const i=E('i');i.style.background=pal[r];l.append(x,i,E('span',ROLE_LABEL[r]));fs.append(l)});return fs};
  const av=E('fieldset',undefined,'fs-choice');av.append(E('legend','Immagine del profilo'));Object.entries(AVATAR).forEach(([k,label])=>{const l=E('label',undefined,'ps-chip'),x=E('input');x.type='radio';x.name='sc-avatar-'+n;x.value=k;x.checked=m.avatar===k;x.disabled=k!=='iniziali'&&!brand.logo;x.onchange=()=>{st.avatar=k;renderResult()};l.append(x,E('span',label));av.append(l)});
  const pf=E('fieldset',undefined,'fs-choice sc-photo');pf.append(E('legend','Foto dei template (facoltativa)'));const fi=E('input');fi.type='file';fi.accept='image/jpeg,image/png,image/webp';fi.name='sc-photo-'+n;fi.className='sc-file';
  const fl=E('label',undefined,'pf-drop sc-drop'),ft=E('span',undefined,'pf-drop-text');ft.append(E('strong',st.photo?'Cambia foto':'Carica una foto'),E('small','JPG, PNG o WebP · trascinala qui o fai clic'));fl.append(fi,ft);pf.append(fl);
  if(st.photo){const rm=button('Togli la foto','co-del');rm.onclick=()=>{st.photo=null;renderResult()};pf.append(E('small',st.photo.name+' · '+st.photo.w+'×'+st.photo.h,'muted'),rm)}
  pf.append(E('p','La foto resta nel tuo browser: va solo dentro i PNG.','ad-note'));
  fi.onchange=async()=>{const f=fi.files&&fi.files[0];if(!f)return;try{st.photo=await readPhoto(f);renderResult()}catch(e){status.textContent=e.message}};
  box.append(role('Colore di fondo','fondo'),role('Colore di accento','accento'),av,pf);return box}
 function textsEditor(m){const box=E('div',undefined,'sc-texts');if(!has(m,'post')||!m.types.length)return box;
  const tabs=E('div',undefined,'sc-tabs');tabs.setAttribute('role','tablist');if(!m.types.includes(st.showType))st.showType=m.types[0];
  m.types.forEach(id=>{const b=button(type(id).title,'sc-tab');b.setAttribute('role','tab');b.setAttribute('aria-selected',String(id===st.showType));b.onclick=()=>{st.showType=id;renderResult()};tabs.append(b)});
  const t=type(st.showType),v=m.texts[t.id],grid=E('div',undefined,'co-fields');
  t.fields.forEach(([k,label,max,ph])=>{const l=E('label',undefined,'co-field'+(k==='body'||k==='title'?' co-wide':''));l.dataset.key=k;let i;
   if(k==='stars'){i=E('select');[['0','Nessuna'],['5','5 stelle'],['4','4 stelle'],['3','3 stelle']].forEach(([val,lab])=>{const o=E('option',lab);o.value=val;i.append(o)});i.value=String(v.stars||0);i.onchange=()=>{st.texts={...st.texts,[t.id]:{...(st.texts[t.id]||v),stars:+i.value}};renderResult()}}
   else{i=E('input');i.type='text';i.maxLength=max;i.placeholder=ph.replace(/^\[|\]$/g,'');i.value=v[k]||'';i.oninput=()=>{st.texts={...st.texts,[t.id]:{...(st.texts[t.id]||v),[k]:i.value}};clearTimeout(timer);timer=setTimeout(renderPreview,300)}}
   i.name='sc-'+t.id+'-'+k;l.append(E('span',label),i);grid.append(l)});
  box.append(E('h4','Testi dei template'),tabs,grid,E('p','Scrivi solo cose vere: prezzi, date, recensioni e stelle li metti tu. Dove resta vuoto il template mostra un segnaposto tra parentesi quadre.','ad-note'));return box}
 const gallery=E('div',undefined,'sc-gallery'),checksBox=E('div',undefined,'co-checks');
 function renderPreview(){const m=model(),built=build(m),checks=checksOf(m,built);
  const groups=[['profilo','Immagine del profilo'],['copertina','Copertine'],['evidenza','Copertine «in evidenza»'],['post','Template dei post']];
  gallery.replaceChildren(...groups.map(([k,title])=>{const list=built.filter(L=>L.kind===k&&(k!=='post'||L.spec.type===st.showType));if(!list.length)return null;
   const sec=E('section',undefined,'co-piece sc-piece');sec.dataset.piece=k;sec.append(E('h4',title+(k==='post'?' · '+type(st.showType).title:'')));const row=E('div',undefined,'sc-row sc-row-'+k);
   list.forEach(L=>row.append(fig(L,k==='profilo'||k==='evidenza'?'sc-round':'',{guides:st.guides})));sec.append(row);return sec}).filter(Boolean));
  checksBox.replaceChildren(E('h4','Controlli prima di scaricare'),...checks.map(checkRow));
  const fails=blocking(checks);ready.disabled=!!fails.length;rs.textContent=fails.length?'Prima sistema: '+fails.map(c=>c.label.toLowerCase()).join(', ')+'.':''}
 const ready=button('Crea lo zip','primary'),saveB=button('Salva nel progetto'),acts=E('div',undefined,'ps-actions co-actions'),rs=E('p','','tool-status');rs.setAttribute('role','status');
 acts.append(ready,saveB,E('span','Nessuna chiamata AI: PNG e SVG si creano nel browser.','muted'));
 ready.onclick=async()=>{if(st.busy)return;const m=model();if(blocking(checksOf(m)).length){rs.textContent='Prima sistema i controlli in rosso.';return}
  st.busy=true;ready.disabled=true;rs.textContent='Disegno i PNG…';
  try{st.files=await files(m,{png:CO().svgToPng});renderOut(m);rs.textContent='Pronti '+st.files.length+' file.';out.scrollIntoView&&out.scrollIntoView({behavior:'smooth',block:'start'})}
  catch(e){rs.textContent='File non creati: '+e.message}finally{st.busy=false;ready.disabled=false}};
 saveB.onclick=async()=>{if(!ctx.workspace||!ctx.projectId){rs.textContent='Apri un progetto per salvare.';return}saveB.disabled=true;
  try{await saveToProject(ctx.workspace,ctx.projectId,savedRecord(model(),{by:ctx.by}));rs.replaceChildren(doc().createTextNode('Salvata nel progetto: direzione, colori, canali e testi (la foto no). La riapri da qui. '));if(ctx.agentsUrl){const a=E('a','Apri in Agenti AI →');a.href=ctx.agentsUrl;rs.append(a)}loadSaved()}
  catch(e){rs.textContent='Salvataggio non riuscito: '+e.message}finally{saveB.disabled=false}};
 function renderResult(){const m=model();if(!st.colors)st.colors={...m.colors};setStep(3);result.hidden=false;out.hidden=true;
  const head=E('div',undefined,'ad-result-head'),hd=E('div');hd.append(E('span','Direzione '+direction(m.direction).title,'ad-angle'),E('h3','La grafica social di '+(brand.name||'il tuo brand')),E('p','Rifinisci colori, immagine del profilo, testi e foto: anteprime e controlli si aggiornano.','ad-idea'));head.append(hd);
  const gl=E('label',undefined,'ad-switch sc-guides'),gc=E('input');gc.type='checkbox';gc.name='sc-guides-'+n;gc.checked=st.guides;gc.onchange=()=>{st.guides=gc.checked;renderPreview()};gl.append(gc,E('span','Mostra le aree sicure'));
  result.replaceChildren(head,refine(m),textsEditor(m),gl,gallery,checksBox,acts,rs);renderPreview()}
 function renderOut(m){setStep(4);out.hidden=false;const list=st.files||[];
  const top=E('div',undefined,'co-kit-head');top.append(E('h3','La grafica social è pronta'),E('p',list.filter(f=>/\.png$/.test(f.name)).length+' immagini PNG con il nome della piattaforma e la misura, le stesse in SVG modificabile, e LEGGIMI.txt con i passi per caricarle.','ad-idea'));
  const groups=[['/profilo/','Immagine del profilo'],['/copertine/','Copertine'],['/in-evidenza/','In evidenza'],['/post/','Template dei post'],['LEGGIMI','Istruzioni']],cols=E('div',undefined,'co-files');
  groups.forEach(([k,title])=>{const fs=list.filter(f=>f.name.includes(k)&&!/\.svg$/.test(f.name));if(!fs.length)return;const g=E('div',undefined,'co-group');g.append(E('h4',title));const ul=E('ul');
   fs.forEach(f=>{const li=E('li'),t=E('span',undefined,'co-file');t.append(E('strong',f.label),E('small',f.name.split('/').slice(1).join('/')));const b=button('Scarica','co-dl');b.onclick=()=>save(f.name,f.data);li.append(t,b);ul.append(li)});g.append(ul);cols.append(g)});
  const zipB=button('Scarica tutto (.zip)','primary'),acts=E('div',undefined,'ps-actions');zipB.onclick=()=>save(zipName(m),bundle(list));acts.append(zipB,E('span',list.length+' file.','muted'));
  const how=E('section',undefined,'fs-how');how.append(E('h4','Come caricarle'));
  m.channels.forEach((c,i)=>{const u=UPLOAD[c];if(!u)return;const d=E('details',undefined,'fs-client');if(i===0)d.open=true;d.append(E('summary',channelTitle(c)));const ul=E('ul');u.forEach(x=>ul.append(E('li',x)));d.append(ul);how.append(d)});
  how.append(E('p','Dopo il caricamento guarda ogni profilo dal telefono e dal computer: logo e testi devono restare interi.','co-hint'));
  out.replaceChildren(top,acts,cols,how)}
 return wrap}

return Object.freeze({AGENT,SIZES,CHANNELS,PIECES,HIGHLIGHTS,HIGHLIGHT_DEFAULT,TYPES,DIRECTIONS,ROLES,AVATAR,UPLOAD,PHONE_CSS,MIN_CSS,minText,hasKit,prefill,modelOf,scheme,initials,
 avatarLayout,coverLayout,highlightLayout,postLayout,postTexts,build,sample,toSvg,boxOf,safeProblems,contrastProblems,sizeProblems,colourProblems,avatarReadability,checksOf,blocking,
 coversOf,profilesOf,highlightsOf,postFormatsOf,exportList,readme,files,bundle,zipName,readStore,savedRecord,addRecord,saveToProject,inputOf,readPhoto,socialStudio});
});
