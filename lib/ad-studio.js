/* Studio Creatività per annunci: the ad creatives drawn in every platform format. A few questions (goal, platforms, offer,
   audience, call to action, image), ONE AI call to the Paid Media Specialist that returns three creative directions as
   JSON (benefit, proof, invitation), each with the texts on the image and the copy of every chosen platform. RADIX checks
   the character limits (over a limit the text is trimmed and flagged, never silently kept), flags numbers and claims
   that are not in the brief or in the confirmed facts, and draws each direction on canvas in every format of the chosen
   platforms with the client's style guide (Kit identità in the profile, else the «Identità visiva» text, else neutral
   colours): Meta 1:1, 4:5 and 9:16 (text out of the top 14% and the bottom 20%), Google Display 1,91:1, 1:1, 300×250 and
   728×90 (text-light), LinkedIn 1200×627. Each format shows the safe zones on request, the share of the image covered by
   text and the WCAG contrast of every text measured on the pixels behind it.
   The person picks one direction, edits the texts, swaps the image and the layout (3), then downloads everything as one
   zip (a PNG per format plus testi.txt and testi.csv with the copy per platform, lib/zip-lite.js) or saves it in the
   project: the «agents» document under the key adCreatives, keeping every other key as it is.
   Pure part (questions, formats, limits, layout math, contrast, prompt, parsing, checks, files, saved record) runs in Node
   for the tests; adStudio() is the browser widget. Paid steps, each from a click with confirmation: the AI call, and the
   optional AI photo (one Higgsfield generation). Uploaded photos, project photos and the brand background cost nothing. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixAdStudio=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
// The styled RADIX confirmation (lib/radix-confirm.js) before every paid step; root.confirm only if it is missing.
const askConfirm=o=>{const C=root.RadixConfirm||(typeof require==='function'?require('./radix-confirm.js'):null);return C?C.ask(o):Promise.resolve(!!root.confirm([o.title,o.cost,o.message].filter(Boolean).join('\n')))};
const AGENT='paid-media',COUNT=3,FIELD_MAX=400,FACTS_MAX=4000,MAX_SAVED=20;
// The other RADIX modules: the page's globals, or require() in Node.
function lib(name,file){if(root[name])return root[name];try{return typeof require==='function'?require(file):null}catch(e){return null}}
const copyLib=()=>lib('RadixCopyStudio','./copy-studio.js'),mediaLib=()=>lib('RadixAgentMedia','./radix-agent-media.js'),identityLib=()=>lib('RadixIdentityStudio','./identity-studio.js'),zipLib=()=>lib('RadixZip','./zip-lite.js');
const clean=s=>String(s==null?'':s).replace(/\s+/g,' ').trim();
const block=s=>String(s==null?'':s).replace(/\r/g,'').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
const chars=s=>[...String(s)].length;
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const slug=s=>norm(s).replace(/ /g,'-').slice(0,40);

// ---- questions ----
// Label → words for the prompt.
const GOALS=[['Vendite','vendere un prodotto o un servizio'],['Contatti','ricevere richieste, chiamate e contatti'],['Traffico','portare visite al sito'],['Notorietà','far conoscere il marchio a nuove persone'],['Evento','far partecipare a un evento']];
// Call to action: the button label (Meta and LinkedIn have a fixed list of buttons; these are on both).
const CTAS=['Scopri di più','Acquista ora','Richiedi info','Prenota ora','Iscriviti','Contattaci'];
const CTA_FOR={Vendite:'Acquista ora',Contatti:'Richiedi info',Traffico:'Scopri di più','Notorietà':'Scopri di più',Evento:'Iscriviti'};
// Where the image comes from. Only «ai» spends credits (one Higgsfield generation, from its own click with confirmation).
const IMAGES=[['upload','Foto del cliente','La carichi dal computer'],['project','Dal progetto','Una foto scelta per i post del PED'],['brand','Sfondo del brand','Colori e forme del kit, senza foto'],['ai','Genera con AI','1 generazione Higgsfield, con conferma']];
const PLATFORMS=[
 {id:'meta-feed',label:'Meta feed',sub:'Facebook e Instagram · 1:1 e 4:5',copy:'meta'},
 {id:'meta-stories',label:'Meta stories e reels',sub:'9:16 con zone sicure',copy:'meta'},
 {id:'google-display',label:'Google Display',sub:'1,91:1 · 1:1 · 300×250 · 728×90',copy:'google'},
 {id:'linkedin',label:'LinkedIn',sub:'Immagine singola 1200×627',copy:'linkedin'}];
// The formats, per platform. `safe`: share of the height to keep free of text (Meta stories and reels: interface on top
// and at the bottom). `light`: small banner, text-light variant (title and button only).
const FORMATS=[
 {id:'meta-1x1',platform:'meta-feed',label:'Feed quadrato',w:1080,h:1080,ratio:'1:1'},
 {id:'meta-4x5',platform:'meta-feed',label:'Feed verticale',w:1080,h:1350,ratio:'4:5'},
 {id:'meta-9x16',platform:'meta-stories',label:'Stories e reels',w:1080,h:1920,ratio:'9:16',safe:{top:.14,bottom:.2}},
 {id:'gd-191',platform:'google-display',label:'Orizzontale',w:1200,h:628,ratio:'1,91:1'},
 {id:'gd-1x1',platform:'google-display',label:'Quadrato',w:1200,h:1200,ratio:'1:1'},
 {id:'gd-300x250',platform:'google-display',label:'Rettangolo medio',w:300,h:250,ratio:'6:5',light:true},
 {id:'gd-728x90',platform:'google-display',label:'Leaderboard',w:728,h:90,ratio:'8:1',light:true},
 {id:'li-191',platform:'linkedin',label:'Immagine singola',w:1200,h:627,ratio:'1,91:1'}];
// The copy of each direction, per group. `max` is the platform limit in characters (spaces included), `list` how many
// items a list keeps; `keys` are the names the AI may use. Over `max` the text is trimmed at a whole word and flagged.
const COPY={
 visual:{label:'Sull’immagine',keys:['immagine','visual','image','creativita'],fields:[
  {key:'headline',label:'Titolo',max:40,keys:['titolo','headline','title']},
  {key:'sub',label:'Sottotitolo',max:70,keys:['sottotitolo','sub','subtitle','sottotitolo_breve']},
  {key:'cta',label:'Pulsante',max:22,keys:['pulsante','cta','button','bottone']}]},
 meta:{label:'Meta',keys:['meta','facebook','instagram'],fields:[
  {key:'primary',label:'Testo principale',max:125,keys:['testo_principale','testo','primary','primary_text']},
  {key:'headline',label:'Titolo',max:40,keys:['titolo','headline']},
  {key:'description',label:'Descrizione',max:30,keys:['descrizione','description']}]},
 google:{label:'Google Display',keys:['google','google_display','display'],fields:[
  {key:'headlines',label:'Titoli brevi',max:30,list:5,keys:['titoli','titoli_brevi','headlines','titolo']},
  {key:'longHeadline',label:'Titolo lungo',max:90,keys:['titolo_lungo','long_headline','longheadline']},
  {key:'descriptions',label:'Descrizioni',max:90,list:5,keys:['descrizioni','descriptions','descrizione']},
  {key:'business',label:'Nome dell’attività',max:25,keys:['nome_attivita','business','business_name']}]},
 linkedin:{label:'LinkedIn',keys:['linkedin'],fields:[
  {key:'intro',label:'Testo introduttivo',max:150,keys:['testo_introduttivo','testo','intro','introductory_text']},
  {key:'headline',label:'Titolo',max:70,keys:['titolo','headline']}]}};
const ANGLES={beneficio:'Beneficio',prova:'Prova',invito:'Invito'};
const LAYOUTS=[['banda','Foto e banda'],['piena','Foto piena'],['tipografico','Tipografico']];

const platform=id=>PLATFORMS.find(p=>p.id===id)||null;
const format=id=>FORMATS.find(f=>f.id===id)||null;
// Valid answers with defaults: the panel always has a complete set.
function normalize(answers){const a=answers||{},goal=GOALS.some(g=>g[0]===a.goal)?a.goal:'Contatti';
 const platforms=PLATFORMS.map(p=>p.id).filter(id=>Array.isArray(a.platforms)&&a.platforms.includes(id));
 return {goal,platforms:platforms.length?platforms:['meta-feed'],cta:CTAS.includes(a.cta)?a.cta:CTA_FOR[goal],image:IMAGES.some(i=>i[0]===a.image)?a.image:'brand'}}
const formatsFor=platforms=>FORMATS.filter(f=>(platforms||[]).includes(f.platform));
// The copy groups for the chosen platforms: the texts on the image always, then Meta, Google, LinkedIn.
function groupsFor(platforms){const g=['visual'];PLATFORMS.forEach(p=>{if((platforms||[]).includes(p.id)&&!g.includes(p.copy))g.push(p.copy)});return g}

// ---- colours and contrast (WCAG 2.x) ----
const HEX=/^#[0-9a-f]{6}$/i;
function hex(v){const s=clean(v).replace(/^#?/,'#');const m=/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s);const h=(m?'#'+m[1]+m[1]+m[2]+m[2]+m[3]+m[3]:s).toUpperCase();return HEX.test(h)?h:null}
const rgbOf=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const toHex=(r,g,b)=>'#'+[r,g,b].map(x=>Math.max(0,Math.min(255,Math.round(x))).toString(16).padStart(2,'0')).join('').toUpperCase();
function lumRgb(r,g,b){return [r,g,b].map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0)}
const luminance=h=>lumRgb(...rgbOf(hex(h)||'#000000'));
const ratioOf=(a,b)=>(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
function contrast(a,b){return Math.round(ratioOf(luminance(a),luminance(b))*100)/100}
// AA: 4.5:1 for normal text, 3:1 for large text (the headline of an ad is large text).
const needOf=large=>large?3:4.5;
const level=(r,large)=>r>=(large?4.5:7)?'AAA':r>=needOf(large)?'AA':'Insufficiente';
// The most readable text colour on a background among the candidates (brand colours first, then white and near-black).
function bestText(bg,candidates){const list=[...(candidates||[]),'#FFFFFF','#111111'].map(hex).filter(Boolean);let best=list[0],r=0;
 for(const c of list){const x=contrast(c,bg);if(x>=4.5)return c;if(x>r){r=x;best=c}}return best}
// The contrast of a text colour on what is really behind it: the samples are [r,g,b] pixels under the text; the
// result is the 10th percentile (a light patch of a photo counts, a few stray pixels do not).
function measuredContrast(textHex,samples){const t=luminance(textHex),rs=(samples||[]).map(([r,g,b])=>ratioOf(t,lumRgb(r,g,b))).sort((a,b)=>a-b);
 if(!rs.length)return null;return Math.round(rs[Math.floor(rs.length*.1)]*100)/100}
function mix(a,b,t){const x=rgbOf(hex(a)||'#000000'),y=rgbOf(hex(b)||'#000000');return toHex(...x.map((v,i)=>v+(y[i]-v)*t))}

// ---- the client's style guide ----
const DEFAULT={primary:'#14342B',secondary:'#3E6B5A',accent:'#E2B649',dark:'#151816',light:'#F7F5F0'};
const FAMILY=/^[A-Za-z0-9 ]{2,40}$/;
const family=f=>FAMILY.test(clean(f))?clean(f):'';
function finish(b){const c=b.colors;for(const k of Object.keys(DEFAULT))c[k]=hex(c[k])||null;
 c.primary=c.primary||DEFAULT.primary;c.dark=c.dark||(luminance(c.primary)<.2?c.primary:DEFAULT.dark);c.light=c.light||DEFAULT.light;
 c.secondary=c.secondary||mix(c.primary,c.light,.35);c.accent=c.accent||(b.source==='default'?DEFAULT.accent:c.secondary);
 if(contrast(c.dark,c.light)<7){if(luminance(c.dark)>.05)c.dark='#111111';if(contrast(c.dark,c.light)<7)c.light='#FFFFFF'}
 b.font.heading=family(b.font.heading)||'Inter';b.font.body=family(b.font.body)||b.font.heading;return b}
// project: the profile for the AI (RadixAgents.profileFor), with .visual; profile: the registry profile, with .identityKit.
function brandOf(project,profile){const pr=profile||{},kit=pr.identityKit&&typeof pr.identityKit==='object'?pr.identityKit:null;
 const name=clean(String((kit&&kit.brand)||(project&&project.name)||'').split(/\s[—–-]\s/)[0]).slice(0,40)||'Il tuo brand';
 if(kit&&Array.isArray(kit.palette)&&kit.palette.length){const by=r=>(kit.palette.find(x=>x&&x.role===r)||{}).hex,f=Array.isArray(kit.fonts)&&kit.fonts[0]||{};
  const logo=typeof kit.logo==='string'&&kit.logo.length<=12000&&/^\s*<svg[\s>]/i.test(kit.logo)?kit.logo:null;
  return finish({name,source:'kit',label:'Dal Kit identità'+(kit.direction?' «'+clean(kit.direction).slice(0,40)+'»':''),colors:{primary:by('primary'),secondary:by('secondary'),accent:by('accent'),dark:by('dark'),light:by('light')},font:{heading:f.heading,body:f.body},logo,palette:kit.palette})}
 const M=mediaLib(),g=M&&typeof M.styleGuide==='function'?M.styleGuide(project):null;
 if(g)return finish({name,source:'visual',label:'Dall’identità visiva del profilo',colors:{primary:g.cover,secondary:g.key,accent:g.accent,dark:g.text,light:g.page},font:{heading:g.font,body:g.font},logo:null});
 return finish({name,source:'default',label:'Colori neutri: crea il Kit identità per usare i tuoi',colors:{},font:{},logo:null})}

// ---- layout math ----
// The area where text may go: a margin all round plus, for stories and reels, the top and bottom zones.
function safeArea(f){const m=Math.round(Math.min(f.w,f.h)*(f.h<=120?.11:f.w<=400?.06:.065)),s=f.safe||{},top=Math.max(m,Math.round(f.h*(s.top||0))),bottom=Math.max(m,Math.round(f.h*(s.bottom||0)));
 return {x:m,y:top,w:f.w-2*m,h:f.h-top-bottom,m}}
function shapeOf(f){const a=f.w/f.h;return a>3?'strip':f.w<=400?'small':a>1.4?'wide':a<.85?'tall':'square'}
const R=(x,y,w,h)=>({x:Math.round(x),y:Math.round(y),w:Math.round(w),h:Math.round(h)});
// The boxes of one format in one layout. image: where the photo (or the brand background) goes; panel: a solid colour;
// scrim: a dark gradient on the photo; frame: the photo is a rounded card; logo, text (headline, sub and button flow in it,
// aligned by `align`) and, for the leaderboard only, a separate cta box. Every text box is inside safeArea().
function layout(f,id){const L=LAYOUTS.some(x=>x[0]===id)?id:'banda',S=safeArea(f),W=f.w,H=f.h,shape=shapeOf(f),u=Math.min(W,H),gap=Math.round(u*.035);
 const o={id:L,shape,safe:S,image:null,panel:null,scrim:null,frame:false,logo:null,text:null,cta:null,align:'center',light:!!f.light},bottom=S.y+S.h;
 if(shape==='strip'){const ctaW=Math.round(W*.2);o.cta=R(W-S.m-ctaW,S.y,ctaW,S.h);
  if(L==='tipografico'){o.panel=R(0,0,W,H);o.logo=R(S.x,S.y,H*1.3,S.h)}
  else if(L==='piena'){o.image=R(0,0,W,H);o.scrim={...R(0,0,W,H),dir:'full'};o.logo=R(S.x,S.y,H*1.3,S.h)}
  else{o.image=R(0,0,H*1.7,H);o.panel=R(o.image.w,0,W-o.image.w,H)}
  const x0=o.logo?o.logo.x+o.logo.w+S.m:o.image.w+S.m;o.text=R(x0,S.y,o.cta.x-S.m-x0,S.h);return o}
 if(shape==='wide'){const lh=Math.round(H*.075);o.logo=R(S.x,S.y,W*.3,lh);const ty=S.y+lh+gap*1.4;
  if(L==='banda'){const pw=Math.round(W*.46);o.panel=R(0,0,pw,H);o.image=R(pw,0,W-pw,H);o.text=R(S.x,ty,pw-S.x-S.m,bottom-ty)}
  else if(L==='piena'){o.image=R(0,0,W,H);o.scrim={...R(0,0,W*.72,H),dir:'right'};o.text=R(S.x,ty,W*.5,bottom-ty)}
  else{const fx=Math.round(W*.56);o.panel=R(0,0,W,H);o.image=R(fx,S.y,S.x+S.w-fx,S.h);o.frame=true;o.text=R(S.x,ty,fx-S.x-gap*1.5,bottom-ty)}
  return o}
 if(shape==='small'){const lh=Math.round(H*.1);o.logo=R(S.x,S.y,S.w*.5,lh);
  if(L==='banda'){const by=Math.round(H*.5);o.image=R(0,0,W,by);o.panel=R(0,by,W,H-by);const ty=by+Math.round(gap*.8);o.text=R(S.x,ty,S.w,bottom-ty)}
  else if(L==='piena'){o.image=R(0,0,W,H);o.scrim={...R(0,H*.25,W,H*.75),dir:'down'};o.text=R(S.x,S.y+S.h*.42,S.w,S.h*.58);o.align='bottom'}
  else{o.panel=R(0,0,W,H);const ty=S.y+lh+gap;o.text=R(S.x,ty,S.w,bottom-ty)}
  return o}
 // square and tall
 const lh=Math.round(u*.075);o.logo=R(S.x,S.y,S.w*.4,lh);
 if(L==='banda'){const share=f.safe?.5:shape==='tall'?.42:.44,py=Math.round(H*(1-share));o.image=R(0,0,W,py);o.panel=R(0,py,W,H-py);const ty=Math.max(py+Math.round(gap*1.6),S.y);o.text=R(S.x,ty,S.w,bottom-ty)}
 else if(L==='piena'){o.image=R(0,0,W,H);o.scrim={...R(0,H*.3,W,H*.7),dir:'down'};o.text=R(S.x,S.y+S.h*.46,S.w,S.h*.54);o.align='bottom'}
 else{o.panel=R(0,0,W,H);const ty=S.y+lh+gap*1.5,th=Math.round(S.h*(f.safe?.42:.44));o.text=R(S.x,ty,S.w,th);o.align='top';const iy=ty+th+gap;o.image=R(S.x,iy,S.w,bottom-iy);o.frame=true}
 return o}
const inside=(r,S)=>r.x>=S.x&&r.y>=S.y&&r.x+r.w<=S.x+S.w&&r.y+r.h<=S.y+S.h;
// The boxes that may hold text in a layout (for the safe-zone check).
const textBoxes=lay=>[lay.logo,lay.text,lay.cta].filter(Boolean);
// Share of the image covered by text: the drawn line boxes and the button, over the whole area.
function textRatio(rects,f){const a=(rects||[]).reduce((s,r)=>s+Math.max(0,r.w)*Math.max(0,r.h),0);return Math.round(a/(f.w*f.h)*1000)/1000}
const TEXT_SHARE_WARN=.2;
// The «little text on the image» guidance is Meta's and LinkedIn's; the small Google banners are text by design.
const ratioWarn=(f,ratio)=>!f.light&&ratio>TEXT_SHARE_WARN;

// ---- the AI call ----
// Confirmed facts of the project (the profile lines the Studio Testi uses) plus the client's facts sheet.
function factsText(project,profile){const C=copyLib(),out=C?C.projectFacts(project):[],b=(profile&&profile.brief)||{};
 if(clean(b.facts))out.push('Scheda fatti del cliente:\n'+block(b.facts));if(clean(b.cases))out.push('Casi reali:\n'+block(b.cases));
 return out.join('\n').slice(0,FACTS_MAX)}
// What the numbers and claims of the directions are checked against.
const inputText=values=>{const v=values||{};return [v.offer,v.audience,v.facts].map(x=>String(x||'')).join('\n')};
function directionsPrompt(answers,values={}){const a=normalize(answers),v=values||{},p=v.project||{},offer=block(v.offer).slice(0,FIELD_MAX*2),aud=clean(v.audience).slice(0,FIELD_MAX);
 if(offer.length<10)throw Error('Scrivi l’offerta o il messaggio chiave (almeno 10 caratteri).');
 const groups=groupsFor(a.platforms),L=[];
 L.push('Prepara '+COUNT+' direzioni creative per un annuncio'+(p.name?' del progetto «'+clean(p.name).slice(0,80)+'»':'')+'. Le tre direzioni devono essere davvero diverse:',
  '1) beneficio: cosa ottiene chi risponde all’annuncio;','2) prova: i fatti concreti scritti qui; se non ce ne sono, come funziona in pratica, senza numeri;','3) invito: una ragione per agire adesso solo se una scadenza o un’offerta è scritta qui, altrimenti un invito semplice e diretto.');
 L.push('Obiettivo: '+GOALS.find(g=>g[0]===a.goal)[1]+'.','Piattaforme: '+a.platforms.map(id=>platform(id).label).join(', ')+'.','Offerta o messaggio chiave: «'+offer+'».');
 if(aud)L.push('Pubblico: «'+aud+'».');
 L.push('Pulsante scelto (call to action): «'+a.cta+'».');
 const facts=clean(v.facts)?block(v.facts).slice(0,FACTS_MAX):'';if(facts)L.push('Fatti confermati del progetto:\n'+facts);
 L.push('Regole:','- Rispetta i limiti di caratteri indicati, spazi compresi: contali. Un testo più lungo viene tagliato.',
  '- Usa solo i fatti scritti qui e i fatti confermati. Non inventare numeri, prezzi, sconti, scadenze, garanzie, premi, recensioni, primati o risultati.',
  '- Il titolo sull’immagine si legge in un secondo sul telefono; il sottotitolo lo completa, non lo ripete.',
  '- Italiano semplice, niente emoji, niente frasi tutte in maiuscolo, al massimo un punto esclamativo.',
  '- «foto»: descrivi in una frase la scena reale da fotografare, senza testo né loghi.');
 const shape={nome:'2-4 parole',angolo:'beneficio | prova | invito',idea:'una frase: cosa comunica',foto:'la scena della foto ideale, una frase',immagine:{titolo:'max 40 caratteri',sottotitolo:'max 70 caratteri',pulsante:'max 22 caratteri'}};
 if(groups.includes('meta'))shape.meta={testo_principale:'max 125 caratteri',titolo:'max 40 caratteri',descrizione:'max 30 caratteri'};
 if(groups.includes('google'))shape.google={titoli:['da 3 a 5 titoli, max 30 caratteri ciascuno'],titolo_lungo:'max 90 caratteri',descrizioni:['da 2 a 5 descrizioni, max 90 caratteri ciascuna']};
 if(groups.includes('linkedin'))shape.linkedin={testo:'max 150 caratteri',titolo:'max 70 caratteri'};
 L.push('Rispondi solo con JSON valido, senza testo prima o dopo, con 3 oggetti in "direzioni":\n{"direzioni":['+JSON.stringify(shape)+',{…},{…}]}');
 return L.join('\n')}

// ---- parsing and checks ----
function parseJson(text){const raw=String(text||'').replace(/\r/g,''),f=/```(?:json)?\s*\n?([\s\S]*?)```/i.exec(raw),body=f?f[1]:raw,s=body.search(/[[{]/),e=Math.max(body.lastIndexOf('}'),body.lastIndexOf(']'));
 if(s<0||e<=s)return null;const t=body.slice(s,e+1);for(const x of [t,t.replace(/,\s*([}\]])/g,'$1').replace(/[“”]/g,'"')]){try{return JSON.parse(x)}catch(err){}}return null}
function pickKey(o,keys){if(!o||typeof o!=='object'||Array.isArray(o))return undefined;const ks=Object.keys(o);
 for(const k of keys){const hit=ks.find(x=>norm(x).replace(/ /g,'_')===k);if(hit!==undefined)return o[hit]}return undefined}
const stripBullet=s=>String(s==null?'':s).replace(/^\s*(?:[-*•–·]|\d{1,2}[.)])\s+/,'').replace(/^[«"“]|[»"”]$/g,'');
// Over a limit: cut at the end of the last sentence or clause that fits when it keeps most of the text, else at the last
// whole word; no dangling punctuation and no trailing article, preposition or conjunction («… il lievito madre, il»).
const WEAK=/\s+(?:il|lo|la|i|gli|le|l’|un|uno|una|un’|di|a|da|in|con|su|per|tra|fra|e|ed|o|che|del|dello|della|dei|degli|delle|al|allo|alla|ai|agli|alle|dal|dalla|nel|nella|sul|sulla|ma|se|come|ogni|più|molto|nostro|nostra|tuo|tua)$/i;
function fit(s,max){const t=[...String(s)];if(t.length<=max)return String(s);const cut=t.slice(0,max).join('');
 const end=Math.max(...['. ','! ','? '].map(p=>cut.lastIndexOf(p)));if(end>=max*.6)return cut.slice(0,end+1);
 const clause=Math.max(...[', ','; ',': ',' – ',' — '].map(p=>cut.lastIndexOf(p)));let out;
 if(clause>=max*.6)out=cut.slice(0,clause);else{const sp=cut.lastIndexOf(' ');out=sp>max/2?cut.slice(0,sp):cut}
 for(let i=0;i<3&&WEAK.test(out);i++)out=out.replace(WEAK,'');return out.replace(/[\s,;:–—-]+$/,'')}
// Every text over its limit is trimmed and listed; nothing over a limit is kept.
function limitIssues(d){const issues=[];
 for(const g of Object.keys(d.copy)){const grp=COPY[g];if(!grp)continue;
  for(const f of grp.fields){const fix=v=>{const n=chars(v);if(n<=f.max)return v;const cut=fit(v,f.max);issues.push({kind:'length',group:g,field:f.key,label:grp.label+' · '+f.label,text:v,length:n,max:f.max,trimmed:cut});return cut};
   const v=d.copy[g][f.key];if(Array.isArray(v))d.copy[g][f.key]=v.map(fix);else if(v)d.copy[g][f.key]=fix(v)}}
 return issues}
// Claims an ad must not make unless the brief or the facts say so.
const CLAIMS=[[/\bgratis\b|\bgratuit[aoie]\b/i,'gratis'],[/\bgaranti(?:t[aoie]|sce|amo)\b|\bgaranzia\b/i,'garanzia'],[/\b(?:il|la|i|le) miglior[ei]\b/i,'«il migliore»'],
 [/\bn(?:umero|\.)\s?1\b|\bleader\b|\bprimi in\b|\bprimo in\b/i,'«numero 1» o «leader»'],[/\bscont[oi]\b|\bscontat[aoie]\b|\bin offerta\b|\bpromozione\b/i,'sconto o promozione'],
 [/\bsolo oggi\b|\bultimi (?:posti|pezzi|giorni)\b|\bscade\b|\bposti limitati\b|\btempo limitato\b|\bfino a esaurimento\b/i,'scadenza o disponibilità limitata'],
 [/\bcertificat[oaie]\b|\bpremiat[oaie]\b|\bpremio\b/i,'certificazione o premio'],[/\brecensioni\b|\bstelle\b|\bclienti soddisfatti\b/i,'recensioni o soddisfazione']];
const textsOf=d=>Object.values(d.copy).flatMap(o=>Object.entries(o).filter(([k])=>k!=='business').flatMap(([,v])=>Array.isArray(v)?v:[v])).filter(Boolean);
// Numbers that are not in what the person wrote or in the confirmed facts, and claims (free, guaranteed, the best, a
// deadline…) that the brief does not make. The direction stays usable; the card says what to check.
function groundIssues(d,input){const C=copyLib(),text=textsOf(d).join('\n'),out=[];
 const nums=C&&typeof C.unverifiedNumbers==='function'?C.unverifiedNumbers(text,input):[];nums.forEach(n=>out.push({kind:'number',text:n}));
 for(const [re,label] of CLAIMS)if(re.test(text)&&!re.test(String(input||'')))out.push({kind:'claim',text:label});
 return out}
const angleOf=(v,n)=>{const x=norm(v);return Object.keys(ANGLES).find(k=>x.startsWith(k.slice(0,5)))||Object.keys(ANGLES)[(n-1)%3]};
function direction(x,n,ctx){if(!x||typeof x!=='object'||Array.isArray(x))return null;
 const d={id:'d'+n,name:clean(pickKey(x,['nome','name','titolo_direzione'])).replace(/[«»"]/g,'').slice(0,60)||'Direzione '+n,angle:angleOf(pickKey(x,['angolo','angle','tipo']),n),
  idea:clean(pickKey(x,['idea','concetto','concept'])).slice(0,240),photo:clean(pickKey(x,['foto','photo','scena'])).slice(0,300),copy:{}};
 const vs=pickKey(x,COPY.visual.keys);
 for(const g of ctx.groups){const src=g==='visual'?(vs&&typeof vs==='object'?vs:x):pickKey(x,COPY[g].keys)||{},o={};
  for(const f of COPY[g].fields){let v=pickKey(src,f.keys);
   o[f.key]=f.list?(Array.isArray(v)?v:typeof v==='string'?v.split('\n'):[]).map(t=>clean(stripBullet(t))).filter(t=>t.length>1).slice(0,f.list):clean(stripBullet(Array.isArray(v)?v[0]:typeof v==='object'?'':v))}
  d.copy[g]=o}
 if(!d.copy.visual.headline)return null;
 if(!d.copy.visual.cta)d.copy.visual.cta=ctx.cta;
 if(d.copy.google)d.copy.google.business=clean(ctx.business);
 d.issues=limitIssues(d).concat(groundIssues(d,ctx.input));return d}
// The reply → up to three directions; [] when nothing usable is there (the widget says so).
// ctx: {answers, input (inputText), business (name for Google)}.
function parseDirections(text,ctx={}){const a=normalize(ctx.answers),d=parseJson(text);if(!d)return [];
 const list=Array.isArray(d)?d:d.direzioni||d.directions||d.proposte||d.creativita||[],c={groups:groupsFor(a.platforms),cta:a.cta,business:ctx.business||'',input:ctx.input||''},out=[];
 (Array.isArray(list)?list:[]).forEach(x=>{if(out.length>=COUNT)return;const it=direction(x,out.length+1,c);if(it)out.push(it)});return out}
// After an edit: limits and grounding again on the edited copy (trims anything over a limit).
function recheck(d,input){d.issues=limitIssues(d).concat(groundIssues(d,input));return d}
const issueText=i=>i.kind==='number'?'Il numero «'+i.text+'» non compare nel brief né nei fatti: verificalo o toglilo.'
 :i.kind==='claim'?'Promessa da verificare: '+i.text+'. Nel brief non c’è: toglila o confermala.'
 :i.label+': '+i.length+' caratteri su '+i.max+', accorciato. Rileggilo.';

// ---- the files ----
const pngName=f=>f.id+'-'+f.w+'x'+f.h+'.png';
function textsTxt(d,{answers,brand,date}={}){const a=normalize(answers),day=date||new Date().toISOString().slice(0,10),L=[];
 L.push('CREATIVITÀ PER ANNUNCI · '+clean(brand&&brand.name||''),'Direzione: '+d.name+' ('+ANGLES[d.angle]+')','Obiettivo: '+a.goal+' · Pulsante: '+a.cta+' · '+day,'');
 for(const g of Object.keys(d.copy)){const grp=COPY[g];if(!grp)continue;L.push(grp.label.toUpperCase());
  for(const f of grp.fields){const v=d.copy[g][f.key];if(!v||!v.length)continue;(Array.isArray(v)?v:[v]).forEach((t,i)=>L.push('- '+f.label+(Array.isArray(v)&&v.length>1?' '+(i+1):'')+' ('+chars(t)+'/'+f.max+'): '+t))}
  if(g==='meta'||g==='linkedin')L.push('- Pulsante: '+a.cta);L.push('')}
 L.push('FORMATI',...formatsFor(a.platforms).map(f=>'- '+pngName(f)+': '+platform(f.platform).label+' · '+f.label+' '+f.w+'×'+f.h+(f.safe?' (testo fuori dal 14% in alto e dal 20% in basso)':'')),'');
 if(d.issues&&d.issues.length)L.push('DA CONTROLLARE',...d.issues.map(i=>'- '+issueText(i)),'');
 L.push('NOTE','RADIX prepara le creatività: le campagne si creano nel tuo account Meta, Google Ads o LinkedIn, con il tuo budget.','Se l’immagine è generata con l’AI, segnalalo dove la piattaforma lo chiede.');
 return L.join('\n')+'\n'}
const csvCell=v=>{const s=String(v==null?'':v);return /[",;\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
function textsCsv(d,{answers}={}){const a=normalize(answers),rows=[['piattaforma','campo','testo','caratteri','limite']];
 for(const g of Object.keys(d.copy)){const grp=COPY[g];if(!grp)continue;
  for(const f of grp.fields){const v=d.copy[g][f.key];(Array.isArray(v)?v:v?[v]:[]).forEach(t=>rows.push([grp.label,f.label,t,chars(t),f.max]))}
  if(g==='meta'||g==='linkedin')rows.push([grp.label,'Pulsante',a.cta,chars(a.cta),''])}
 return '﻿'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n')+'\r\n'}
// The zip contents: one PNG per format (bytes from the canvases) plus the copy. pngs: {formatId: Uint8Array}.
function bundleFiles(d,pngs,opts={}){const a=normalize(opts.answers),files=[];
 formatsFor(a.platforms).forEach(f=>{if(pngs&&pngs[f.id])files.push({name:pngName(f),data:pngs[f.id]})});
 files.push({name:'testi.txt',data:textsTxt(d,opts)},{name:'testi.csv',data:textsCsv(d,opts)});return files}
const zipName=(d,brand)=>'annunci-'+(slug(brand&&brand.name)||'brand')+'-'+(slug(d&&d.name)||'direzione')+'.zip';

// ---- saved in the project: the «agents» document, key adCreatives ----
const emptyStore=()=>({schemaVersion:1,items:[]});
function readStore(doc){const s=doc&&doc.adCreatives;return s&&typeof s==='object'&&Array.isArray(s.items)?{schemaVersion:1,items:s.items.filter(x=>x&&typeof x==='object')}:emptyStore()}
function savedRecord(d,{answers,layout:lay,image,by,at}={}){const a=normalize(answers),when=at||new Date().toISOString();
 return {id:'ad-'+when.replace(/\D/g,'').slice(0,14)+'-'+(slug(d.name)||'direzione').slice(0,24),at:when,by:clean(by).slice(0,80),name:d.name,angle:d.angle,idea:d.idea||'',photo:d.photo||'',
  goal:a.goal,platforms:a.platforms,cta:a.cta,layout:LAYOUTS.some(x=>x[0]===lay)?lay:'banda',image:IMAGES.some(x=>x[0]===image)?image:'brand',
  formats:formatsFor(a.platforms).map(f=>f.id),copy:JSON.parse(JSON.stringify(d.copy)),issues:(d.issues||[]).map(issueText).slice(0,20)}}
// One record per direction id: saving again replaces it; only the last MAX_SAVED are kept.
function addRecord(store,rec){const s=readStore({adCreatives:store});return {schemaVersion:1,items:s.items.filter(x=>x.id!==rec.id).concat([rec]).slice(-MAX_SAVED)}}
async function saveToProject(ws,projectId,rec){if(!ws||typeof ws.bind!=='function')throw Error('Archivio del progetto non disponibile.');
 const doc=ws.bind(projectId,'agents');
 for(let i=0;i<3;i++){const cur=(await doc.load())||{},next=addRecord(readStore(cur),rec);
  try{await doc.save({...cur,schemaVersion:1,conversations:cur.conversations||{},adCreatives:next});return next}catch(e){if(!(ws.ConflictError&&e instanceof ws.ConflictError)||i===2)throw e}}}
// A saved record back as a direction the widget can draw and edit.
const fromRecord=r=>({id:r.id,name:r.name,angle:ANGLES[r.angle]?r.angle:'beneficio',idea:r.idea||'',photo:r.photo||'',copy:JSON.parse(JSON.stringify(r.copy||{visual:{headline:r.name}})),issues:[]});
// The Higgsfield prompt for the optional AI photo of a direction.
function photoPrompt(d,values,brand){const v=values||{},scene=clean(d&&(d.photo||d.idea))||clean(v.offer);
 return ('Professional advertising photograph for a social and display ad, authentic and not stock-like. Scene: “'+scene.slice(0,400)+'”. Context: '+clean(v.offer).slice(0,300)+
  '. Colour palette coherent with '+[brand.colors.primary,brand.colors.accent,brand.colors.light].join(', ')+'. Natural light, clean composition with calm areas where a headline can sit. No text, no letters, no logos, no watermark.').slice(0,2000)}

// ---- drawing (browser) ----
const doc=()=>root.document;
function roundRect(ctx,r,rad){const k=Math.min(rad||0,r.w/2,r.h/2);ctx.beginPath();if(!k){ctx.rect(r.x,r.y,r.w,r.h);return}
 ctx.moveTo(r.x+k,r.y);ctx.arcTo(r.x+r.w,r.y,r.x+r.w,r.y+r.h,k);ctx.arcTo(r.x+r.w,r.y+r.h,r.x,r.y+r.h,k);ctx.arcTo(r.x,r.y+r.h,r.x,r.y,k);ctx.arcTo(r.x,r.y,r.x+r.w,r.y,k);ctx.closePath()}
const rgba=(h,a)=>{const [r,g,b]=rgbOf(hex(h)||'#000000');return 'rgba('+r+','+g+','+b+','+a+')'};
function seedOf(s){let h=2166136261;for(const ch of String(s))h=Math.imul(h^ch.charCodeAt(0),16777619);return h>>>0}
// The brand background: the primary colour with soft glows of the accent and the secondary and a few thin arcs.
function brandArt(ctx,r,b,seed,rad){const c=b.colors,u=Math.min(r.w,r.h),big=Math.max(r.w,r.h),s=seed||0,flip=s%2;ctx.save();roundRect(ctx,r,rad);ctx.clip();
 const lg=ctx.createLinearGradient(r.x,r.y,r.x+r.w,r.y+r.h);lg.addColorStop(0,mix(c.primary,c.light,.08));lg.addColorStop(1,mix(c.primary,c.dark,.45));ctx.fillStyle=lg;ctx.fillRect(r.x,r.y,r.w,r.h);
 const gx=r.x+r.w*(flip?.18:.84),gy=r.y+r.h*.16,g1=ctx.createRadialGradient(gx,gy,0,gx,gy,big*.75);g1.addColorStop(0,rgba(c.accent,.62));g1.addColorStop(.45,rgba(c.accent,.16));g1.addColorStop(1,rgba(c.accent,0));ctx.fillStyle=g1;ctx.fillRect(r.x,r.y,r.w,r.h);
 const hx=r.x+r.w*(flip?.9:.08),hy=r.y+r.h*.96,g2=ctx.createRadialGradient(hx,hy,0,hx,hy,big*.7);g2.addColorStop(0,rgba(c.secondary,.7));g2.addColorStop(1,rgba(c.secondary,0));ctx.fillStyle=g2;ctx.fillRect(r.x,r.y,r.w,r.h);
 ctx.strokeStyle=rgba(c.light,.16);ctx.lineWidth=Math.max(1,u*.004);const cx=r.x+r.w*(flip?.1:.92),cy=r.y+r.h*.98;
 for(let i=1;i<=5;i++){ctx.beginPath();ctx.arc(cx,cy,u*(.18+i*.13),0,Math.PI*2);ctx.stroke()}
 ctx.fillStyle=rgba(c.light,.12);const step=Math.max(8,Math.round(u*.045));for(let y=r.y+step;y<r.y+r.h*.42;y+=step)for(let x=r.x+(flip?r.w*.62:step);x<r.x+(flip?r.w-step:r.w*.38);x+=step){ctx.beginPath();ctx.arc(x,y,Math.max(1,u*.0035),0,Math.PI*2);ctx.fill()}
 ctx.restore()}
function cover(ctx,img,r,rad){const iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height;if(!iw||!ih)return;const s=Math.max(r.w/iw,r.h/ih),w=iw*s,h=ih*s;
 ctx.save();roundRect(ctx,r,rad);ctx.clip();ctx.drawImage(img,r.x+(r.w-w)/2,r.y+(r.h-h)/2,w,h);ctx.restore()}
const fontOf=(w,size,fam)=>w+' '+Math.round(size)+'px "'+fam+'", Inter, system-ui, sans-serif';
function linesOf(ctx,text,maxW){const out=[];let line='';String(text).split(/\s+/).filter(Boolean).forEach(w=>{const t=line?line+' '+w:w;if(ctx.measureText(t).width>maxW&&line){out.push(line);line=w}else line=t});if(line)out.push(line);return out}
// The biggest size (from start down to min) at which the text fits maxW in at most maxLines; at min the last line is cut.
function fitLines(ctx,text,weight,fam,maxW,maxLines,start,min){let size=start,lines=[];
 for(;size>=min;size-=Math.max(1,start*.04)){ctx.font=fontOf(weight,size,fam);lines=linesOf(ctx,text,maxW);if(lines.length<=maxLines&&lines.every(l=>ctx.measureText(l).width<=maxW))return {size,lines}}
 size=min;ctx.font=fontOf(weight,size,fam);lines=linesOf(ctx,text,maxW);if(lines.length>maxLines){lines=lines.slice(0,maxLines);lines[maxLines-1]=lines[maxLines-1].replace(/\s*\S*$/,'')+'…'}return {size,lines}}
// Logo: the kit's SVG (negative on dark backgrounds) or the brand name as a wordmark. Returns the text rect, if any.
function drawLogo(ctx,box,b,assets,onDark,chip){if(!box)return null;const img=onDark?(assets.logoNeg||assets.logo):assets.logo;let rect=null;
 if(chip){const pad=Math.round(box.h*.32);let w;if(img){const s=box.h/(img.naturalHeight||img.height||1);w=Math.min(box.w,(img.naturalWidth||img.width)*s)}else{ctx.font=fontOf(700,box.h*.5,b.font.heading);w=Math.min(box.w,ctx.measureText(b.name.toUpperCase()).width)}
  ctx.fillStyle=rgba(b.colors.light,.94);roundRect(ctx,{x:box.x-pad,y:box.y-pad*.6,w:w+pad*2,h:box.h+pad*1.2},box.h*.3);ctx.fill();onDark=false}
 const draw=onDark?(assets.logoNeg||assets.logo):assets.logo;
 if(draw){const s=box.h/(draw.naturalHeight||draw.height||1),w=Math.min(box.w,(draw.naturalWidth||draw.width)*s),h=w/((draw.naturalWidth||draw.width)/(draw.naturalHeight||draw.height||1));ctx.drawImage(draw,box.x,box.y+(box.h-h)/2,w,h)}
 else{const name=b.name.toUpperCase();let size=box.h*.5;ctx.font=fontOf(700,size,b.font.heading);while(ctx.measureText(name).width>box.w&&size>8){size-=1;ctx.font=fontOf(700,size,b.font.heading)}
  ctx.fillStyle=onDark?b.colors.light:b.colors.dark;ctx.textBaseline='middle';ctx.fillText(name,box.x,box.y+box.h/2);ctx.textBaseline='top';rect={x:box.x,y:box.y+box.h/2-size/2,w:ctx.measureText(name).width,h:size}}
 return rect}
// The pixels behind a rect, sampled on a grid, from a snapshot of the background (before any text is drawn).
function sampleRect(snap,r,scale){if(!snap)return [];const out=[],x0=Math.max(0,Math.floor(r.x*scale)),y0=Math.max(0,Math.floor(r.y*scale)),x1=Math.min(snap.width-1,Math.ceil((r.x+r.w)*scale)),y1=Math.min(snap.height-1,Math.ceil((r.y+r.h)*scale));
 const sx=Math.max(1,Math.floor((x1-x0)/24)),sy=Math.max(1,Math.floor((y1-y0)/8));
 for(let y=y0;y<=y1;y+=sy)for(let x=x0;x<=x1;x+=sx){const i=(y*snap.width+x)*4;out.push([snap.data[i],snap.data[i+1],snap.data[i+2]])}return out}
// One creative. assets: {image (an <img> or canvas, null = brand background), logo, logoNeg}. Returns the text rects,
// their share of the image and the measured contrast of each text.
function paint(ctx,f,lay,d,b,assets,scale){const W=f.w,H=f.h,c=b.colors,u=Math.min(W,H),v=d.copy.visual||{},seed=seedOf(d.id+d.name),rects=[],checks=[];ctx.textBaseline='top';
 const panelBg=lay.id==='tipografico'?(contrast(c.primary,c.light)>=4.5||contrast(c.primary,'#FFFFFF')>=4.5?c.primary:c.dark):(contrast(c.primary,c.light)>=4.5?c.primary:c.dark);
 ctx.fillStyle=panelBg;ctx.fillRect(0,0,W,H);
 if(lay.image){const rad=lay.frame?Math.round(u*(lay.shape==='small'?.03:.035)):0;
  if(lay.frame){ctx.save();ctx.shadowColor='rgba(0,0,0,.35)';ctx.shadowBlur=u*.04;ctx.shadowOffsetY=u*.012;ctx.fillStyle=panelBg;roundRect(ctx,lay.image,rad);ctx.fill();ctx.restore()}
  if(assets.image)cover(ctx,assets.image,lay.image,rad);else brandArt(ctx,lay.image,b,seed,rad)}
 if(lay.panel&&lay.image&&!lay.frame){ctx.fillStyle=panelBg;ctx.fillRect(lay.panel.x,lay.panel.y,lay.panel.w,lay.panel.h)}
 if(lay.scrim){const s=lay.scrim,dark=luminance(c.dark)<.03?c.dark:'#0B0C0E';let g;
  if(s.dir==='right'){g=ctx.createLinearGradient(s.x,0,s.x+s.w,0);g.addColorStop(0,rgba(dark,.88));g.addColorStop(.6,rgba(dark,.62));g.addColorStop(1,rgba(dark,0))}
  else if(s.dir==='full'){g=ctx.createLinearGradient(0,0,W,0);g.addColorStop(0,rgba(dark,.84));g.addColorStop(1,rgba(dark,.6))}
  else{g=ctx.createLinearGradient(0,s.y,0,s.y+s.h);g.addColorStop(0,rgba(dark,0));g.addColorStop(.45,rgba(dark,.6));g.addColorStop(1,rgba(dark,.9))}
  ctx.fillStyle=g;ctx.fillRect(s.x,s.y,s.w,s.h)}
 // the background as it is, for the contrast measure
 let snap=null;try{snap=ctx.getImageData(0,0,Math.round(W*scale),Math.round(H*scale))}catch(e){snap=null}
 const onPhoto=lay.id==='piena',textBg=onPhoto?'#0B0C0E':panelBg,fg=onPhoto?(contrast(c.light,'#0B0C0E')>=7?c.light:'#FFFFFF'):bestText(panelBg,[c.light,c.dark]);
 const logoOnImage=lay.image&&!lay.frame&&lay.logo&&lay.image.y<=lay.logo.y&&lay.image.x<=lay.logo.x&&lay.id!=='piena';
 const lr=drawLogo(ctx,lay.logo,b,assets,luminance(onPhoto?'#0B0C0E':panelBg)<.3,logoOnImage);if(lr&&!logoOnImage)rects.push(lr);
 // the button colours: the accent, unless it disappears on the background
 let btn=c.accent;if(contrast(btn,textBg)<1.6)btn=fg;const btnFg=bestText(btn,[c.dark,c.light]);
 const strip=lay.shape==='strip',small=lay.shape==='small'||strip,T=lay.text,hd=b.font.heading,bd=b.font.body;
 const hStart=strip?Math.min(30,T.h*.42):small?26:lay.shape==='wide'?H*.098:u*(f.safe?.092:.088),maxLines=strip||small?2:3,subStart=lay.shape==='wide'?H*.044:u*.038;
 const ctaBase=strip?Math.min(16,T.h*.26):small?12.5:lay.shape==='wide'?H*.034:u*.032,ctaLabel=v.cta||'';
 const accentBar=!strip&&lay.id!=='piena'&&!small,barH=Math.max(3,Math.round(u*.007)),barGap=Math.round(u*.03);
 // headline, sub and button at a common scale k: the biggest that fits the text box (the sub goes first if nothing fits)
 const flow=(k,withSub)=>{const head=fitLines(ctx,v.headline||'',800,hd,T.w,maxLines,hStart*k,Math.max(strip?14:small?14:20,hStart*k*.6)),hl=Math.round(head.size*1.1);
  const sub=withSub?fitLines(ctx,v.sub,400,bd,T.w*.96,2,subStart*k,subStart*k*.8):null,sl=sub?Math.round(sub.size*1.32):0,ctaSize=ctaBase*Math.max(.8,k),ctaH=Math.round(ctaSize*2.5);
  const gapS=Math.round(head.size*.42),gapC=Math.round(u*(small?.06:.045)*k),total=(accentBar?barH+barGap:0)+head.lines.length*hl+(sub?gapS+sub.lines.length*sl:0)+(strip?0:gapC+ctaH);
  return {head,hl,sub,sl,ctaSize,ctaH,gapS,gapC,total}};
 const canSub=!lay.light&&!!v.sub;let F=flow(1,canSub);
 for(let k=.94;!strip&&F.total>T.h&&k>=.6;k-=.06)F=flow(k,canSub);
 if(!strip&&F.total>T.h&&canSub){F=flow(1,false);for(let k=.94;F.total>T.h&&k>=.6;k-=.06)F=flow(k,false)}
 const {head,hl,sub,sl,ctaSize,ctaH,gapS,gapC,total}=F;ctx.font=fontOf(700,ctaSize,bd);
 const ctaW=Math.min(strip?lay.cta.w:T.w,Math.round(ctx.measureText(ctaLabel).width+ctaSize*2.6));
 let y=strip?T.y+(T.h-head.lines.length*hl)/2:lay.align==='top'?T.y:lay.align==='bottom'?T.y+T.h-total:T.y+Math.max(0,(T.h-total)/2);
 if(accentBar){ctx.fillStyle=c.accent&&contrast(c.accent,textBg)>=1.6?c.accent:fg;ctx.fillRect(T.x,y,Math.round(u*.09),barH);y+=barH+barGap}
 const hRects=[];ctx.fillStyle=fg;ctx.font=fontOf(800,head.size,hd);head.lines.forEach(l=>{ctx.fillText(l,T.x,y);const r={x:T.x,y,w:ctx.measureText(l).width,h:hl};hRects.push(r);rects.push(r);y+=hl});
 const sRects=[];if(sub){y+=gapS;ctx.fillStyle=onPhoto?rgba(fg,.92):rgba(fg,.86);ctx.font=fontOf(400,sub.size,bd);sub.lines.forEach(l=>{ctx.fillText(l,T.x,y);const r={x:T.x,y,w:ctx.measureText(l).width,h:sl};sRects.push(r);rects.push(r);y+=sl})}
 let br=null;if(ctaLabel){br=strip?{x:lay.cta.x+lay.cta.w-ctaW,y:lay.cta.y+(lay.cta.h-ctaH)/2,w:ctaW,h:ctaH}:{x:T.x,y:y+gapC,w:ctaW,h:ctaH};
  ctx.fillStyle=btn;roundRect(ctx,br,ctaH/2);ctx.fill();ctx.fillStyle=btnFg;ctx.font=fontOf(700,ctaSize,bd);ctx.textBaseline='middle';ctx.textAlign='center';ctx.fillText(ctaLabel,br.x+br.w/2,br.y+br.h/2+ctaSize*.04,br.w-ctaSize);ctx.textAlign='left';ctx.textBaseline='top';rects.push(br)}
 const measure=(label,colour,rs,large)=>{if(!rs.length)return;const samples=rs.flatMap(r=>sampleRect(snap,r,scale)),ratio=measuredContrast(colour,samples)??contrast(colour,textBg);checks.push({label,ratio,need:needOf(large),ok:ratio>=needOf(large),level:level(ratio,large)})};
 measure('Titolo',fg,hRects,!small||head.size>=18.66);measure('Sottotitolo',fg,sRects,false);
 if(br){const r=contrast(btnFg,btn);checks.push({label:'Pulsante',ratio:r,need:4.5,ok:r>=4.5,level:level(r,false)})}
 return {rects,ratio:textRatio(rects,f),checks}}
// A creative on a new canvas; scale < 1 for previews (the math stays in the format's pixels).
function renderCreative(f,d,b,assets,opts={}){const scale=opts.scale||1,c=doc().createElement('canvas');c.width=Math.round(f.w*scale);c.height=Math.round(f.h*scale);const ctx=c.getContext('2d');ctx.scale(scale,scale);
 const lay=layout(f,opts.layout),res=paint(ctx,f,lay,d,b,assets||{},scale);return {canvas:c,layout:lay,...res}}

// ---- browser widget ----
let counter=0;
const el=(tag,text,cls)=>{const n=doc().createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
const button=(text,cls)=>{const b=el('button',text,cls||'');b.type='button';return b};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function json(res,fallback){const d=await res.json().catch(()=>({}));if(!res.ok)throw Error(d.error||fallback);return d}
function loadImage(src){return new Promise((ok,ko)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>ko(Error('Immagine non leggibile'));i.src=src})}
async function blobImage(blob){const url=root.URL.createObjectURL(blob);try{return await loadImage(url)}finally{setTimeout(()=>root.URL.revokeObjectURL(url),60000)}}
const svgData=svg=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
async function logoAssets(b){if(!b.logo)return {};const I=identityLib(),out={};
 try{out.logo=await loadImage(svgData(b.logo))}catch(e){return {}}
 try{if(I&&b.palette&&typeof I.negativeLogo==='function')out.logoNeg=await loadImage(svgData(I.negativeLogo(b.logo,b.palette)))}catch(e){}
 return out}
// A Higgsfield photo (no generation): the same-origin proxy of an existing request.
async function higgsImage(requestId){const r=await root.fetch('/api/higgsfield?action=image&id='+encodeURIComponent(requestId),{credentials:'same-origin'});if(!r.ok){const d=await r.json().catch(()=>({}));throw Error(d.error||'Foto non scaricabile')}return blobImage(await r.blob())}
// The photos the project already has: the Higgsfield photos chosen for the PED posts (Studio Foto → «Usa nel post»).
async function projectPhotos(ws,projectId){if(!ws||typeof ws.bind!=='function'||!projectId)return [];const d=(await ws.bind(projectId,'editorial').load())||{};
 return (Array.isArray(d.contents)?d.contents:[]).filter(c=>c&&c.photo&&/^[0-9a-f-]{36}$/i.test(String(c.photo.requestId||''))).slice(-8).reverse().map(c=>({requestId:c.photo.requestId,title:clean(c.title||c.photo.headline||'Post del PED').slice(0,60)}))}
const uuid=()=>root.crypto&&root.crypto.randomUUID?root.crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,ch=>{const r=Math.random()*16|0;return (ch==='x'?r:(r&3|8)).toString(16)});
// ONE Higgsfield generation (paid): called only after the confirmation in the widget.
async function generatePhoto(prompt,onState){
 const d=await json(await root.fetch('/api/higgsfield',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({action:'generate',prompt,aspectRatio:'1:1',requestKey:uuid()})}),'Errore avvio generazione');
 let s=d;for(let i=0;!s.done&&i<=75;i++){onState&&onState('La foto è in preparazione… '+i*4+' s');await wait(i?4000:1500);s=await json(await root.fetch('/api/higgsfield?action=status&id='+encodeURIComponent(d.requestId),{credentials:'same-origin'}),'Errore stato immagine')}
 if(!s.done)throw Error('ci sta mettendo troppo: riprova più tardi.');if(s.status!=='completed'||!s.images||!s.images.length)throw Error(s.error||'nessuna immagine (stato: '+s.status+').');
 return {requestId:d.requestId,image:await higgsImage(d.requestId)}}
const toBytes=canvas=>new Promise((ok,ko)=>canvas.toBlob(b=>b?b.arrayBuffer().then(x=>ok(new Uint8Array(x)),ko):ko(Error('PNG non creato')),'image/png'));
function download(name,data,type){const a=el('a');a.href=root.URL.createObjectURL(new root.Blob([data],{type}));a.download=name;doc().body.append(a);a.click();a.remove();setTimeout(()=>root.URL.revokeObjectURL(a.href),2000)}
const pct=x=>Math.round(x*100)+'%';
const num=r=>String(r).replace('.',',');
// The small glyph of a format (its proportions) for the platform tiles and the format cards.
function glyph(f){const s=el('span',undefined,'ad-glyph'),k=Math.min(18/f.w,24/f.h);s.style.width=Math.max(4,Math.round(f.w*k))+'px';s.style.height=Math.max(3,Math.round(f.h*k))+'px';s.setAttribute('aria-hidden','true');return s}
// ctx: {project (profile for the AI), profile (registry profile: identityKit, brief), memoryScope, projectId, workspace, agentsUrl, by}
function adStudio(ctx={}){const n=++counter,project=ctx.project||{},brand=brandOf(project,ctx.profile),wrap=el('div',undefined,'tool photo-studio ad-studio');
 const answers=normalize({platforms:['meta-feed','meta-stories','google-display']});let ctaTouched=false;
 const st={preview:'',dirs:[],chosen:null,layout:'banda',pic:{kind:'brand',img:null,label:'Sfondo del brand'},assets:{},safe:false,values:{},timer:0};
 logoAssets(brand).then(a=>{st.assets=a;if(st.dirs.length)renderCards();if(st.chosen)renderFormats()});
 const steps=el('ol',undefined,'ps-steps');['Le domande','Scegli la direzione','Formati e rifinitura'].forEach((t,i)=>{const li=el('li',(i+1)+' · '+t);li.dataset.step=String(i+1);steps.append(li)});
 const setStep=k=>[...steps.children].forEach(li=>li.dataset.state=+li.dataset.step<k?'done':+li.dataset.step===k?'current':'todo');
 // the style guide in use
 const bx=el('div',undefined,'ad-brand');bx.dataset.source=brand.source;const sw=el('span',undefined,'ad-swatches');
 ['primary','secondary','accent','dark','light'].forEach(k=>{const i=el('i');i.style.background=brand.colors[k];i.title=k+' '+brand.colors[k];sw.append(i)});
 const bt=el('span',undefined,'ad-brand-text');bt.append(el('strong',brand.name),el('span',brand.label+' · '+brand.font.heading));
 bx.append(sw,bt);if(brand.logo){const li=el('img',undefined,'ad-brand-logo');li.src=svgData(brand.logo);li.alt='Logo';bx.append(li)}
 const form=el('div',undefined,'ps-form'),qs=el('div',undefined,'ps-questions ad-questions');
 const chips=(id,label,opts,multi,cls)=>{const fs=el('fieldset',undefined,cls||'');fs.append(el('legend',label));opts.forEach(([v,text,sub])=>{const l=el('label',undefined,'ps-chip'+(sub?' ad-tile':'')),r=el('input');r.type=multi?'checkbox':'radio';r.name='ad-'+id+'-'+n;r.value=v;
   r.checked=multi?answers[id].includes(v):answers[id]===v;l.append(r);if(sub){const t=el('span',undefined,'ad-tile-text');t.append(el('strong',text),el('small',sub));l.append(t)}else l.append(doc().createTextNode(text));fs.append(l)});return fs};
 const goalFs=chips('goal','Obiettivo',GOALS.map(g=>[g[0],g[0]]));
 const platFs=chips('platforms','Piattaforme',PLATFORMS.map(p=>[p.id,p.label,p.sub]),true,'ad-wide ad-plats');
 platFs.querySelectorAll('.ad-tile').forEach((l,i)=>{const g=el('span',undefined,'ad-glyphs');formatsFor([PLATFORMS[i].id]).forEach(f=>g.append(glyph(f)));l.prepend(g)});
 const ctaFs=chips('cta','Pulsante',CTAS.map(c=>[c,c]));
 const imgFs=chips('image','Immagine',IMAGES.map(([v,t,s])=>[v,t,s]),false,'ad-wide ad-imgs');
 const fields=el('div',undefined,'ad-fields'),offL=el('label','Offerta o messaggio chiave *',''),offer=el('textarea'),audL=el('label','Pubblico',''),aud=el('input');
 offer.rows=2;offer.maxLength=FIELD_MAX*2;offer.placeholder='Es. corso di panificazione il sabato mattina a Torino, 4 incontri, posti per 10 persone';aud.type='text';aud.maxLength=FIELD_MAX;aud.value=clean(project.audience).slice(0,FIELD_MAX);aud.placeholder='Es. appassionati di cucina in città, 30-55 anni';
 offL.append(offer);audL.append(aud);fields.append(offL,audL);
 const imgBox=el('div',undefined,'ad-imgbox');
 qs.append(goalFs,ctaFs,platFs,imgFs);form.append(bx,qs,fields,imgBox);
 const go=button('Prepara 3 direzioni','primary'),cost=el('span','Una chiamata AI al Paid Media Specialist: ti chiedo conferma prima. Le immagini si compongono qui, senza costi.','muted'),bar=el('div',undefined,'ps-actions');bar.append(go,cost);form.append(bar);
 const status=el('p','','tool-status');status.setAttribute('role','status');
 const saved=el('div',undefined,'ad-saved');saved.hidden=true;
 const grid=el('div',undefined,'ad-dirs'),result=el('div',undefined,'ad-result');grid.hidden=result.hidden=true;
 const tabs=el('div',undefined,'ad-tabs');tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Formato dell’anteprima');tabs.hidden=true;
 wrap.append(steps,form,saved,status,tabs,grid,result);setStep(1);
 // answers
 wrap.addEventListener('change',e=>{const t=e.target;if(!t||!t.name||!t.name.startsWith('ad-'))return;const id=t.name.slice(3).replace(/-\d+$/,'');
  if(id==='platforms'){const on=[...platFs.querySelectorAll('input:checked')].map(x=>x.value);if(!on.length){t.checked=true;status.textContent='Scegli almeno una piattaforma.';return}answers.platforms=on}
  else if(id==='goal'){answers.goal=t.value;if(!ctaTouched){answers.cta=CTA_FOR[t.value];ctaFs.querySelectorAll('input').forEach(x=>x.checked=x.value===answers.cta)}}
  else if(id==='cta'){answers.cta=t.value;ctaTouched=true}
  else if(id==='image'){answers.image=t.value;renderImgBox()}});
 // the image chosen in the questions
 const fileInput=el('input');fileInput.type='file';fileInput.accept='image/png,image/jpeg,image/webp';fileInput.className='ad-file';
 fileInput.onchange=async()=>{const file=fileInput.files&&fileInput.files[0];if(!file)return;if(file.size>15e6){status.textContent='La foto supera 15 MB: usane una più leggera.';return}
  try{setPic({kind:'upload',img:await blobImage(file),label:file.name})}catch(e){status.textContent='Foto non leggibile: prova un JPG o un PNG.'}};
 function setPic(p){st.pic=p;const note=imgBox.querySelector('.ad-picked');if(note)note.textContent='Immagine: '+p.label;status.textContent=p.kind==='brand'?'':'Immagine pronta: '+p.label+'.';if(st.dirs.length)renderCards();if(st.chosen)renderFormats()}
 async function projectPicker(box){box.replaceChildren(el('p','Cerco le foto del progetto…','muted'));let list=[];
  try{list=await projectPhotos(ctx.workspace,ctx.projectId)}catch(e){box.replaceChildren(el('p','Foto del progetto non disponibili: '+e.message,'muted'));return}
  if(!list.length){box.replaceChildren(el('p','Nel progetto non ci sono ancora foto: quelle scelte nello Studio Foto per i post del PED compaiono qui. Intanto uso lo sfondo del brand.','muted'));return}
  const row=el('div',undefined,'ad-thumbs');box.replaceChildren(row);
  list.forEach(it=>{const b=button('','ad-thumb');b.setAttribute('aria-label','Usa la foto di «'+it.title+'»');b.append(el('span','…','ad-thumb-ph'),el('small',it.title));row.append(b);
   let img=null;higgsImage(it.requestId).then(i=>{img=i;const t=el('img');t.src=i.src;t.alt='';b.querySelector('.ad-thumb-ph').replaceWith(t)}).catch(()=>{b.querySelector('.ad-thumb-ph').textContent='Non disponibile';b.disabled=true});
   b.onclick=()=>{if(!img)return;row.querySelectorAll('.ad-thumb').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));setPic({kind:'project',img,label:'foto di «'+it.title+'»'})}})}
 function renderImgBox(){const k=answers.image;imgBox.replaceChildren();imgBox.dataset.kind=k;
  if(k==='upload'){const l=el('label',undefined,'pf-drop ad-drop'),lt=el('span',undefined,'pf-drop-text');lt.append(el('strong','Scegli la foto'),el('small','JPG, PNG o WebP fino a 15 MB · trascinala qui o fai clic'));l.append(fileInput,lt);imgBox.append(l,el('p',st.pic.kind==='upload'?'Immagine: '+st.pic.label:'Nessuna foto ancora: finché non la scegli uso lo sfondo del brand.','muted ad-picked'))}
  else if(k==='project'){const b=el('div');imgBox.append(b);projectPicker(b)}
  else if(k==='ai')imgBox.append(el('p','La foto AI si genera dopo la scelta della direzione, con il pulsante «Genera con AI»: 1 generazione Higgsfield, ti chiedo conferma prima. Nelle anteprime intanto c’è lo sfondo del brand.','muted ad-note'));
  else imgBox.append(el('p','Lo sfondo usa i colori del brand: nessuna foto, nessun costo.','muted ad-note'));
  if(k!=='project'&&k!=='upload'&&(st.pic.kind==='upload'||st.pic.kind==='project'))setPic({kind:'brand',img:null,label:'Sfondo del brand'})}
 renderImgBox();
 // saved creatives: reopen without a new AI call
 async function loadSaved(){if(!ctx.workspace||!ctx.projectId)return;try{const s=readStore(await ctx.workspace.bind(ctx.projectId,'agents').load());if(!s.items.length)return;
  saved.replaceChildren(el('h4','Creatività salvate nel progetto'));const row=el('div',undefined,'ad-saved-row');
  s.items.slice(-4).reverse().forEach(r=>{const b=button(r.name+' · '+new Date(r.at).toLocaleDateString('it-IT'),'ad-saved-item');b.onclick=()=>{Object.assign(answers,normalize(r));st.layout=r.layout;st.dirs=[];grid.hidden=true;choose(fromRecord(r));status.textContent='Riaperta «'+r.name+'»: scegli di nuovo la foto se serve.'};row.append(b)});
  saved.append(row);saved.hidden=false}catch(e){}}
 loadSaved();
 const lock=on=>{go.disabled=on;form.querySelectorAll('input,textarea').forEach(x=>x.disabled=on)};
 go.onclick=async()=>{const values={offer:offer.value,audience:aud.value,project,facts:factsText(project,ctx.profile)};let prompt;
  try{prompt=directionsPrompt(answers,values)}catch(e){status.textContent=e.message;offer.focus();return}
  const rt=root.RadixAgents;if(!rt||typeof rt.reply!=='function'){status.textContent='Gli agenti non si sono caricati: ricarica la pagina.';return}
  if(!await askConfirm({title:'Preparare 3 direzioni creative con il Paid Media Specialist AI?',cost:'È una sola chiamata AI: usa crediti API.',message:'Le immagini poi si compongono qui, senza altri costi.',ok:'Prepara le direzioni'}))return;
  st.values=values;lock(true);setStep(2);tabs.hidden=true;status.textContent='Il Paid Media Specialist prepara le 3 direzioni…';grid.hidden=false;grid.replaceChildren(...[0,1,2].map(()=>el('div',undefined,'ad-dir ad-skeleton')));result.hidden=true;
  try{const r=await rt.reply({role:AGENT,project,memoryScope:ctx.memoryScope,messages:[{role:'user',content:prompt}]});
   const list=parseDirections(r&&r.text,{answers,input:inputText(values),business:brand.name});if(!list.length)throw Error('la risposta non contiene direzioni leggibili. Riprova.');
   st.dirs=list;st.chosen=null;renderCards();go.textContent='Prepara altre 3 direzioni';
   status.textContent=(list.length<COUNT?'Sono arrivate '+list.length+' direzioni su '+COUNT+'. ':'')+'Confrontale nei formati e scegli quella da rifinire.'+(list.some(d=>d.issues.length)?' Alcune hanno punti da controllare.':'')}
  catch(e){status.textContent='Direzioni non preparate: '+e.message;setStep(1);grid.hidden=true;tabs.hidden=!st.dirs.length}
  finally{lock(false)}};
 const assets=()=>({image:st.pic.img,logo:st.assets.logo,logoNeg:st.assets.logoNeg});
 function heroFormat(){const fs=formatsFor(answers.platforms),cur=fs.find(f=>f.id===st.preview);return cur||fs.find(f=>f.id==='meta-4x5')||fs.find(f=>f.id==='meta-1x1')||fs.find(f=>f.id==='gd-1x1')||fs[0]}
 // One switcher above the three cards: the same format in every direction, to compare them.
 function renderTabs(){const hero=heroFormat();tabs.replaceChildren(el('span','Anteprima','ad-tool-label'),...formatsFor(answers.platforms).map(f=>{const b=button('','ad-tab');b.setAttribute('aria-pressed',String(f===hero));b.title=platform(f.platform).label+' · '+f.label+' '+f.w+'×'+f.h;
  b.append(glyph(f),el('span',f.w/f.h>3?'728×90':f.w<=400?'300×250':(f.platform==='linkedin'?'LinkedIn ':'')+f.ratio));b.onclick=()=>{st.preview=f.id;renderCards()};return b}));tabs.hidden=false}
 function copyList(d){const box=el('div',undefined,'ad-copy');
  for(const g of Object.keys(d.copy)){if(g==='visual')continue;const grp=COPY[g],det=el('details'),cnt=grp.fields.reduce((k,f)=>{const v=d.copy[g][f.key];return k+(Array.isArray(v)?v.length:v?1:0)},0),over=(d.issues||[]).some(i=>i.group===g);det.append(el('summary',grp.label+' · '+cnt+' testi'+(over?' · accorciati':'')));const ul=el('ul');
   for(const f of grp.fields){const v=d.copy[g][f.key];(Array.isArray(v)?v:v?[v]:[]).forEach(t=>{const li=el('li');li.append(el('span',f.label,'ad-k'),el('span',t,'ad-v'),el('span',chars(t)+'/'+f.max,'ad-count'));ul.append(li)})}
   det.append(ul);box.append(det)}
  return box}
 function issuesList(d){const ul=el('ul',undefined,'ad-issues');d.issues.slice(0,6).forEach(i=>ul.append(el('li',issueText(i))));if(d.issues.length>6)ul.append(el('li','E altri '+(d.issues.length-6)+' punti.'));return ul}
 function renderCards(){const hero=heroFormat();setStep(st.chosen?3:2);renderTabs();
  grid.replaceChildren(...st.dirs.map((d,i)=>{const card=el('article',undefined,'ad-dir');card.dataset.chosen=String(!!st.chosen&&st.chosen.id===d.id);
   const head=el('div',undefined,'ad-dir-head');head.append(el('span',(i+1)+' · '+ANGLES[d.angle],'ad-angle'),el('h3',d.name));if(d.idea)head.append(el('p',d.idea,'ad-idea'));
   const stage=el('div',undefined,'ad-stage');stage.dataset.shape=shapeOf(hero);const r=renderCreative(hero,d,brand,assets(),{layout:st.layout,scale:Math.min(1,(shapeOf(hero)==='strip'?900:640)/hero.w)});r.canvas.className='ad-canvas';r.canvas.setAttribute('role','img');r.canvas.setAttribute('aria-label','Anteprima '+platform(hero.platform).label+' '+hero.label+': '+(d.copy.visual.headline||''));stage.append(r.canvas);
   const fl=el('p',platform(hero.platform).label+' · '+hero.label+' '+hero.w+'×'+hero.h+' · in tutto '+formatsFor(answers.platforms).length+' formati','ad-meta');
   const use=button('Scegli questa','primary');use.onclick=()=>choose(d);
   card.append(head,stage,fl,copyList(d));if(d.issues.length)card.append(issuesList(d));card.append(use);return card}))}
 function choose(d){st.chosen=JSON.parse(JSON.stringify(d));grid.querySelectorAll('.ad-dir').forEach(x=>x.dataset.chosen='false');
  const i=st.dirs.findIndex(x=>x.id===d.id);if(i>=0)grid.children[i].dataset.chosen='true';setStep(3);result.hidden=false;renderResult();result.scrollIntoView&&result.scrollIntoView({behavior:'smooth',block:'start'})}
 // step 3: the chosen direction in every format, the controls, the texts and the actions
 const formatsBox=el('div',undefined,'ad-formats'),sum=el('p','','ad-summary'),rStatus=el('p','','tool-status');rStatus.setAttribute('role','status');
 function renderResult(){const d=st.chosen,head=el('div',undefined,'ad-result-head'),t=el('div');t.append(el('span',ANGLES[d.angle],'ad-angle'),el('h3','La direzione scelta · '+d.name));head.append(t);
  // layout
  const tools=el('div',undefined,'ad-tools'),seg=el('div',undefined,'ad-seg');seg.setAttribute('role','group');seg.setAttribute('aria-label','Impaginazione');
  LAYOUTS.forEach(([id,label])=>{const b=button(label);b.setAttribute('aria-pressed',String(st.layout===id));b.onclick=()=>{st.layout=id;seg.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderFormats()};seg.append(b)});
  const lg=el('div',undefined,'ad-tool');lg.append(el('span','Impaginazione','ad-tool-label'),seg);
  // image
  const ig=el('div',undefined,'ad-tool'),ib=el('div',undefined,'ad-imgbtns'),up=button('Carica foto'),pj=button('Dal progetto'),br=button('Sfondo del brand'),ai=button('Genera con AI');ai.className='ad-ai';
  const upIn=el('input');upIn.type='file';upIn.accept='image/png,image/jpeg,image/webp';upIn.hidden=true;up.onclick=()=>upIn.click();
  upIn.onchange=async()=>{const file=upIn.files&&upIn.files[0];if(!file)return;try{setPic({kind:'upload',img:await blobImage(file),label:file.name});answers.image='upload'}catch(e){rStatus.textContent='Foto non leggibile: prova un JPG o un PNG.'}};
  const pbox=el('div',undefined,'ad-pbox');pbox.hidden=true;pj.onclick=()=>{pbox.hidden=!pbox.hidden;if(!pbox.hidden)projectPicker(pbox)};
  br.onclick=()=>{setPic({kind:'brand',img:null,label:'Sfondo del brand'});answers.image='brand'};
  ai.onclick=async()=>{if(!await askConfirm({title:'Generare 1 foto con Higgsfield per «'+d.name+'»?',cost:'È 1 generazione: consuma il saldo API di Higgsfield (il costo per immagine dipende dal tuo piano).',message:'Nessun’altra spesa.',ok:'Genera la foto'}))return;
   ai.disabled=true;rStatus.textContent='Higgsfield prepara la foto…';
   try{const r=await generatePhoto(photoPrompt(d,st.values,brand),t=>{rStatus.textContent=t});setPic({kind:'ai',img:r.image,label:'foto generata con AI'});answers.image='ai';rStatus.textContent='Foto AI pronta: è in tutti i formati. Ricorda di segnalarla come contenuto AI dove la piattaforma lo chiede.'}
   catch(e){rStatus.textContent='Foto non generata: '+e.message}finally{ai.disabled=false}};
  ib.append(up,pj,br,ai,upIn);ig.append(el('span','Immagine','ad-tool-label'),ib);
  // safe zones
  const sg=el('label',undefined,'ad-switch'),sc=el('input');sc.type='checkbox';sc.checked=st.safe;sc.onchange=()=>{st.safe=sc.checked;wrap.dataset.safe=String(st.safe)};sg.append(sc,el('span','Zone sicure'));wrap.dataset.safe=String(st.safe);
  tools.append(lg,ig,sg);
  const aiHint=answers.image==='ai'&&st.pic.kind!=='ai'?el('p','Hai scelto una foto AI: premi «Genera con AI» quando vuoi (1 generazione Higgsfield, con conferma). Intanto le creatività usano lo sfondo del brand.','ad-callout'):null;
  // texts
  const edit=el('div',undefined,'ad-edit');edit.append(el('h4','Testi'),textEditor(d));
  // actions
  const acts=el('div',undefined,'ps-actions ad-actions'),dl=button('Scarica tutto (.zip)','primary');dl.onclick=()=>downloadAll(dl);acts.append(dl);
  if(ctx.workspace&&ctx.projectId){const sv=button('Salva nel progetto');sv.onclick=()=>saveAll(sv);acts.append(sv)}
  acts.append(el('span','PNG per ogni formato, più testi.txt e testi.csv con i testi per piattaforma.','muted'));
  const body=el('div',undefined,'ad-body'),left=el('div',undefined,'ad-left');left.append(sum,formatsBox);body.append(left,edit);
  result.replaceChildren(...[head,tools,pbox,aiHint,body,acts,rStatus].filter(Boolean));renderFormats()}
 function textEditor(d){const box=el('div',undefined,'ad-fields-edit');
  for(const g of Object.keys(d.copy)){const grp=COPY[g],fs=el('fieldset');fs.append(el('legend',grp.label));
   for(const f of grp.fields){const v=d.copy[g][f.key],vals=f.list?(v&&v.length?v:['']):[v||''];
    vals.forEach((t,i)=>{const l=el('label',undefined,'ad-field'),top=el('span',undefined,'ad-field-top'),cnt=el('span','','ad-count'),long=f.max>60,inp=el(long?'textarea':'input');if(long)inp.rows=f.max>100?4:3;else inp.type='text';
     inp.maxLength=f.max;inp.value=t;const upd=()=>{cnt.textContent=chars(inp.value)+'/'+f.max;cnt.dataset.near=String(chars(inp.value)>f.max*.9)};upd();
     top.append(el('span',f.label+(f.list&&vals.length>1?' '+(i+1):'')),cnt);l.append(top,inp);fs.append(l);
     inp.oninput=()=>{upd();if(f.list){d.copy[g][f.key]=[...fs.querySelectorAll('[data-field="'+f.key+'"]')].map(x=>clean(x.value)).filter(Boolean)}else d.copy[g][f.key]=clean(inp.value);
      clearTimeout(st.timer);st.timer=setTimeout(()=>{recheck(d,inputText(st.values));if(g==='visual')renderFormats();else renderSummary()},180)};inp.dataset.field=f.key})}
   box.append(fs)}
  return box}
 function renderSummary(checks){const d=st.chosen,issues=d.issues||[];if(checks)st.lastChecks=checks;const c=st.lastChecks||[],bad=c.filter(x=>!x.ok);
  sum.replaceChildren(el('span',formatsFor(answers.platforms).length+' formati','ad-pill'),el('span',bad.length?'Contrasto da rivedere in '+bad.length+' formati':'Contrasto AA in tutti i formati','ad-pill'+(bad.length?' warn':' ok')),el('span',issues.length?issues.length+' punti da controllare nei testi':'Testi nei limiti','ad-pill'+(issues.length?' warn':' ok')));
  sum.title=issues.map(issueText).join('\n')}
 function renderFormats(){const d=st.chosen;if(!d)return;const frames=[],worst=[];
  for(const f of formatsFor(answers.platforms)){const p=platform(f.platform),shape=shapeOf(f),scale=Math.min(2,(shape==='strip'?1456:f.w<=400?600:760)/f.w),r=renderCreative(f,d,brand,assets(),{layout:st.layout,scale});
   const fig=el('figure',undefined,'ad-frame');fig.dataset.shape=shape;fig.dataset.format=f.id;fig.style.setProperty('--ar',f.w+'/'+f.h);fig.style.setProperty('--ratio',String(f.w/f.h));
   if(f.light)fig.style.setProperty('--h',f.h+'px');
   const cv=el('div',undefined,'ad-canvas-wrap');r.canvas.className='ad-canvas';r.canvas.setAttribute('role','img');r.canvas.setAttribute('aria-label',p.label+' '+f.label+' '+f.w+'×'+f.h);cv.append(r.canvas);
   const S=safeArea(f),ov=el('div',undefined,'ad-safe');ov.setAttribute('aria-hidden','true');ov.style.setProperty('--t',pct(S.y/f.h));ov.style.setProperty('--b',pct(1-(S.y+S.h)/f.h));ov.style.setProperty('--l',pct(S.x/f.w));ov.style.setProperty('--r',pct(1-(S.x+S.w)/f.w));
   if(f.safe){ov.dataset.zones='true';ov.append(el('span','Interfaccia · 14%','ad-zone top'),el('span','Interfaccia · 20%','ad-zone bottom'))}
   ov.append(el('span',undefined,'ad-margin'));cv.append(ov);
   const cap=el('figcaption'),name=el('span',undefined,'ad-fname');name.append(el('span',p.label,'ad-plat-name'),el('strong',f.label),el('span',f.w+'×'+f.h,'ad-size'));
   const badges=el('span',undefined,'ad-badges'),low=r.checks.reduce((m,x)=>!m||x.ratio/x.need<m.ratio/m.need?x:m,null),okC=r.checks.every(x=>x.ok),warnT=ratioWarn(f,r.ratio);
   const tb=el('span','Testo '+Math.round(r.ratio*100)+'%','ad-badge'+(warnT?' warn':''));tb.title=warnT?'Il testo copre più del 20% dell’immagine: Meta e LinkedIn consigliano immagini con poco testo.':'Il testo copre il '+Math.round(r.ratio*100)+'% dell’immagine.';
   const cb=el('span',okC?'Contrasto AA':'Contrasto '+num(low.ratio)+':1','ad-badge'+(okC?' ok':' warn'));cb.title=r.checks.map(x=>x.label+': '+num(x.ratio)+':1 ('+x.level+', serve '+num(x.need)+':1)').join('\n');
   badges.append(tb,cb);if(f.safe)badges.append(el('span','Zone sicure libere','ad-badge ok'));if(f.light)badges.append(el('span','Versione leggera','ad-badge'));
   cap.append(name,badges);fig.append(cv,cap);frames.push(fig);worst.push(...r.checks.filter(x=>!x.ok))}
  formatsBox.replaceChildren(...frames);renderSummary(worst)}
 async function renders(){const d=st.chosen,out={};for(const f of formatsFor(answers.platforms))out[f.id]=await toBytes(renderCreative(f,d,brand,assets(),{layout:st.layout,scale:1}).canvas);return out}
 async function downloadAll(b){const Z=zipLib();if(!Z){rStatus.textContent='Lo zip non si è caricato: ricarica la pagina.';return}b.disabled=true;rStatus.textContent='Preparo i PNG in tutti i formati…';
  try{const d=st.chosen;recheck(d,inputText(st.values));const files=bundleFiles(d,await renders(),{answers,brand}),name=zipName(d,brand);download(name,Z.zip(files),'application/zip');rStatus.textContent='Scaricato '+name+': '+(files.length-2)+' PNG, testi.txt e testi.csv.'}
  catch(e){rStatus.textContent='Zip non creato: '+e.message+(/taint|insecure|security/i.test(e.message)?' La foto non si può esportare: caricala dal computer.':'')}finally{b.disabled=false}}
 async function saveAll(b){b.disabled=true;rStatus.textContent='Salvo le creatività nel progetto…';
  try{const d=st.chosen;recheck(d,inputText(st.values));await saveToProject(ctx.workspace,ctx.projectId,savedRecord(d,{answers,layout:st.layout,image:st.pic.kind,by:ctx.by}));b.textContent='Salvato';
   rStatus.replaceChildren(doc().createTextNode('Salvate nel progetto: testi, formati e impaginazione. Le riapri da qui, in «Creatività salvate». '));if(ctx.agentsUrl){const a=el('a','Apri il Paid Media Specialist →');a.href=ctx.agentsUrl;rStatus.append(a)}loadSaved()}
  catch(e){rStatus.textContent='Non salvate: '+e.message;b.disabled=false}}
 return wrap}

return Object.freeze({AGENT,COUNT,GOALS,CTAS,CTA_FOR,IMAGES,PLATFORMS,FORMATS,COPY,ANGLES,LAYOUTS,TEXT_SHARE_WARN,ratioWarn,platform,format,normalize,formatsFor,groupsFor,
 hex,contrast,level,needOf,bestText,measuredContrast,brandOf,safeArea,shapeOf,layout,inside,textBoxes,textRatio,factsText,inputText,directionsPrompt,parseJson,parseDirections,
 fit,limitIssues,groundIssues,recheck,issueText,pngName,textsTxt,textsCsv,bundleFiles,zipName,readStore,savedRecord,addRecord,saveToProject,fromRecord,photoPrompt,projectPhotos,renderCreative,adStudio});
});
