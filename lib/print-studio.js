/* Studio Stampa: business card, A5 flyer, A4 flyer/poster, A3 and A2 posters, roll-up 85 × 200 cm, A4 letterhead and A4
   three-panel roll-fold brochure, as PDF, each in three layouts (Classico, Deciso, Minimal) built from the brand kit.
   No AI: pick a format and a layout, fill the fields (prefilled from the project profile, its brand kit
   profile.identityKit and the contacts found in its facts; texts can be pasted from the Studio Testi), add a photo if
   you like, check the CMYK values and the prepress checklist, download the PDF.
   One layout (items in mm on the trim, origin top-left) feeds both the SVG preview and a small vector PDF writer:
   - «per la tipografia»: the usual prepress page: MediaBox = trim + 3 mm bleed + 6 mm slug per side, BleedBox = trim + 3 mm,
     TrimBox = trim; artwork up to the bleed edge only; crop marks (and the brochure fold marks) in the slug, 1 mm away from
     the bleed edge, 0.25 pt in registration colour; safe-area check (text and logo at least 4 mm from trim and folds,
     and out of the 100 mm at the bottom of the roll-up that stays in its base).
     It is written PDF/X-1a-style: DeviceCMYK only (the palette converted with the plain formula of the brand package,
     each colour overridable by hand; near-black as pure K100 for text and lines, rich black C60 M40 Y40 K100 for large
     areas if chosen), total ink checked against 300 %, no transparency (logo opacity flattened on the colour behind it),
     photos and raster logos converted to CMYK and Flate-compressed at no more than the dpi they need, every text
     converted to vector outlines (lib/print-glyphs.js, a Helvetica-metric sans: no font to embed), /OutputIntents with
     GTS_PDFX and the registered condition FOGRA39 «Coated FOGRA39 (ISO 12647-2:2004)» named by its identifier (no ICC
     profile is embedded: we ship none and download nothing), /TrimBox and /BleedBox on every page, /Trapped /False and
     /GTS_PDFXVersion in the Info, a document /ID. checkPdf() re-reads the bytes before the download. It is «pronto per la
     tipografia (PDF/X-1a, verifica preflight)»: the print shop still runs its own preflight.
   - «per il web»: page = trim, no bleed, no marks, RGB, Helvetica as text (lib/brand-package.js and lib/catalog-studio.js
     use this writer in RGB too).
   «Salva nel progetto» saves the format, the layout, the texts, the colours (with the CMYK) and the checks as a document
   in the Art Director's thread (the PDF itself is downloaded, not stored). Pure part (formats, layouts, colours, checks,
   PDF bytes) runs in Node for the tests. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixPrintStudio=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const MM=72/25.4,BLEED=3,SLUG=6,MARK_GAP=1,SAFE=4,DPI=300,AGENT='art-director',FIELD_MAX=200,TEXT_MAX=1500;
// Prepress: total area coverage limit, the area (mm²) from which a dark fill counts as a large area, the blacks.
const INK_LIMIT=300,AREA_MIN=400,RICH_BLACK=Object.freeze([60,40,40,100]),PURE_K=Object.freeze([0,0,0,100]),REGISTRATION=Object.freeze([100,100,100,100]);
const OUTPUT_INTENT=Object.freeze({id:'FOGRA39',condition:'Coated FOGRA39 (ISO 12647-2:2004)',registry:'http://www.color.org'});
const PDFX=Object.freeze({version:'PDF/X-1:2003',conformance:'PDF/X-1a:2003',label:'pronto per la tipografia (PDF/X-1a, verifica preflight)'});
const mmToPt=mm=>mm*MM,ptToMm=pt=>pt/MM;
const clean=s=>String(s==null?'':s).replace(/[ \t ]+/g,' ').trim();
const block=s=>String(s==null?'':s).replace(/\r/g,'').split('\n').map(clean).join('\n').replace(/\n{3,}/g,'\n\n').trim();
const num=n=>{const v=Math.round(n*1000)/1000;return Object.is(v,-0)?'0':String(v)};
const mmText=n=>String(Math.round(n*10)/10).replace('.',',');

// ---- formats and fields ----
const FIELDS={
 name:{label:'Nome dell’attività',max:80,ph:'Es. Forno Bianchi'},payoff:{label:'Payoff (la frase sotto il nome)',max:120,ph:'Es. Pane buono, ogni mattina'},
 person:{label:'Nome e cognome',max:60,ph:'Es. Anna Bianchi'},role:{label:'Ruolo',max:60,ph:'Es. Titolare'},
 headline:{label:'Titolo',max:90,ph:'Es. Apriamo in via Roma!'},body:{label:'Testo',rows:5,max:TEXT_MAX,ph:'Il messaggio: poche frasi chiare.'},cta:{label:'Invito all’azione',max:90,ph:'Es. Vieni a trovarci sabato 12'},
 flapTitle:{label:'Aletta interna · titolo',max:60},flapText:{label:'Aletta interna · testo',rows:4,max:TEXT_MAX},
 p1Title:{label:'Interno 1 · titolo',max:60},p1Text:{label:'Interno 1 · testo',rows:4,max:TEXT_MAX},
 p2Title:{label:'Interno 2 · titolo',max:60},p2Text:{label:'Interno 2 · testo',rows:4,max:TEXT_MAX},
 p3Title:{label:'Interno 3 · titolo',max:60},p3Text:{label:'Interno 3 · testo',rows:4,max:TEXT_MAX},
 closing:{label:'Retro · testo di chiusura',rows:3,max:600,ph:'Es. Ti aspettiamo: chiamaci o passa in negozio.'},
 phone:{label:'Telefono',max:40},email:{label:'Email',max:80},website:{label:'Sito web',max:80},address:{label:'Indirizzo',max:FIELD_MAX,ph:'Es. Via Roma 12, 24121 Bergamo'},
 vat:{label:'P. IVA e dati societari',max:FIELD_MAX,ph:'Es. Forno Bianchi srl · P. IVA 01234567890'}
};
const CONTACTS=['phone','email','website','address'];
const POSTER=['name','payoff','headline','body','cta',...CONTACTS];
// photo: the format can hold a photo. dpi: the effective resolution the photos need (large format is seen from afar).
// hidden.bottom: mm at the bottom that end up inside the roll-up base (background only).
const FORMATS=[
 {id:'biglietto',title:'Biglietto da visita',size:'85 × 55 mm, fronte e retro',w:85,h:55,pages:['Fronte','Retro'],margin:5,fields:['name','payoff','person','role',...CONTACTS]},
 {id:'flyer',title:'Flyer A5',size:'148 × 210 mm',w:148,h:210,pages:['Fronte'],margin:10,photo:true,fields:POSTER},
 {id:'locandina-a4',title:'Flyer o locandina A4',size:'210 × 297 mm',w:210,h:297,pages:['Fronte'],margin:12,photo:true,fields:POSTER},
 {id:'locandina-a3',title:'Locandina A3',size:'297 × 420 mm',w:297,h:420,pages:['Fronte'],margin:16,photo:true,fields:POSTER},
 {id:'locandina-a2',title:'Locandina A2',size:'420 × 594 mm',w:420,h:594,pages:['Fronte'],margin:22,photo:true,fields:POSTER},
 {id:'rollup',title:'Roll-up 85 × 200 cm',size:'850 × 2000 mm, gli ultimi 100 mm in basso entrano nella base',w:850,h:2000,pages:['Fronte'],margin:40,photo:true,dpi:150,hidden:{bottom:100},fields:POSTER},
 {id:'carta',title:'Carta intestata A4',size:'210 × 297 mm',w:210,h:297,pages:['Pagina'],margin:15,fields:['name','payoff',...CONTACTS,'vat']},
 // Roll fold: outside [inner flap 97 | back 100 | cover 100], inside [100 | 100 | 97]; folds at 97/197 and 100/200 mm.
 {id:'brochure',title:'Brochure pieghevole A4 a 3 ante',size:'297 × 210 mm aperta, 100 × 210 mm piegata, fronte e retro',w:297,h:210,pages:['Esterno','Interno'],margin:8,photo:true,panels:[[97,100,100],[100,100,97]],
  fields:['name','payoff','flapTitle','flapText','p1Title','p1Text','p2Title','p2Text','p3Title','p3Text','closing',...CONTACTS]}
];
const VARIANTS=[
 {id:'classic',title:'Classico',line:'Logo in alto e fascia di colore: ordinato e sicuro.'},
 {id:'bold',title:'Deciso',line:'Colore del brand a tutta pagina e titolo grande.'},
 {id:'minimal',title:'Minimal',line:'Molto bianco, logo piccolo, linee sottili.'}
];
const variantOf=v=>VARIANTS.some(x=>x.id===v)?v:'classic';
const format=id=>FORMATS.find(f=>f.id===id)||null;
const need=id=>{const f=format(id);if(!f)throw Error('Formato sconosciuto: '+id);return f};
// Page size of the print PDF (trim + bleed) and of the web PDF (trim), in mm and pt.
// Print: the page (MediaBox) is trim + bleed + slug, the BleedBox trim + bleed. Web: both are the trim.
function pageSize(id,mode){const f=need(id),web=mode==='web',b=web?0:BLEED,sl=web?0:SLUG,w=f.w+2*(b+sl),h=f.h+2*(b+sl);
 return {w,h,wPt:mmToPt(w),hPt:mmToPt(h),bleed:b,slug:sl,bleedW:f.w+2*b,bleedH:f.h+2*b}}

// ---- brand: the kit in the profile, else a neutral palette and a wordmark ----
const HEX=/^#[0-9a-f]{6}$/i;
function hex(v){const s=clean(v).replace(/^#?/,'#');const m=/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s);return (m?'#'+m[1]+m[1]+m[2]+m[2]+m[3]+m[3]:s).toUpperCase()}
function luminance(h){const x=hex(h).slice(1);return [0,2,4].map(i=>{const v=parseInt(x.slice(i,i+2),16)/255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0)}
function contrast(a,b){const x=luminance(a),y=luminance(b);return Math.round((Math.max(x,y)+.05)/(Math.min(x,y)+.05)*100)/100}
const NEUTRAL={primary:'#2F3A45',secondary:'#5B6B7A',accent:'#C9A227',dark:'#1C1C1E',light:'#FFFFFF'};
function brandOf(profile,projectName){const p=profile||{},k=p.identityKit&&typeof p.identityKit==='object'?p.identityKit:null,pal={...NEUTRAL};let fromKit=false;
 if(k&&Array.isArray(k.palette))for(const c of k.palette){const h=hex(c&&c.hex);if(c&&NEUTRAL[c.role]&&HEX.test(h)){pal[c.role]=h;fromKit=true}}
 const f=k&&Array.isArray(k.fonts)&&k.fonts[0]||{},logo=k&&typeof k.logo==='string'&&/^<svg\b/.test(k.logo.trim())&&k.logo.length<20000?k.logo.trim():'';
 return {palette:pal,fromKit,logo,fonts:{heading:clean(f.heading),body:clean(f.body)},name:clean(k&&k.brand)||clean(String(projectName||p.name||'').split(/\s[—–-]\s/)[0]),direction:clean(k&&k.direction)}}
// The readable colour for text on `bg`: the first preferred one with contrast ≥ 4.5, else the best neutral.
function ink(bg,pal,...prefer){for(const c of prefer)if(c&&contrast(c,bg)>=4.5)return c;return [pal.dark,pal.light,'#000000','#FFFFFF'].reduce((a,c)=>contrast(c,bg)>contrast(a,bg)?c:a)}
const rgbOf=h=>[1,3,5].map(i=>parseInt(hex(h).slice(i,i+2),16));
const hexOf=a=>'#'+a.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('').toUpperCase();
const mixHex=(fg,bg,a)=>{const x=rgbOf(fg),y=rgbOf(bg);return hexOf(x.map((v,i)=>v*a+y[i]*(1-a)))};

// ---- CMYK ----
// The plain formula of lib/brand-package.js (no ICC profile): K = 1 − max(R,G,B), C = (1 − R − K) / (1 − K)… whole percent.
function cmykOf(h){const [r,g,b]=rgbOf(h).map(v=>v/255),k=1-Math.max(r,g,b);if(k>=.9999)return [0,0,0,100];return [(1-r-k)/(1-k),(1-g-k)/(1-k),(1-b-k)/(1-k),k].map(v=>Math.round(v*100))}
const tac=c=>Math.round((c[0]+c[1]+c[2]+c[3])*100)/100;// total area coverage, %
const blackish=c=>c[3]>=80&&Math.max(c[0],c[1],c[2])<=20;
const validCmyk=c=>Array.isArray(c)&&c.length===4&&c.every(v=>typeof v==='number'&&isFinite(v)&&v>=0&&v<=100);
// settings: {overrides:{'#HEX':[c,m,y,k]}, richBlack:true}. use: 'area' (fill of at least AREA_MIN mm²), 'text', 'line',
// 'small' (a small fill), 'logo'. A hand-set value always wins; a near-black becomes K100, or the rich black on large areas.
function inkFor(h,use,settings={}){const H=hex(h),o=settings.overrides&&settings.overrides[H];if(validCmyk(o))return o.slice();
 const c=cmykOf(H);if(!blackish(c))return c;return use==='area'&&settings.richBlack!==false?RICH_BLACK.slice():PURE_K.slice()}
// The palette roles with their HEX, the computed CMYK, the value used (hand-set or computed) and its total ink.
function paletteInks(pal,settings={}){return Object.entries(pal||{}).map(([role,h])=>{const H=hex(h),auto=cmykOf(H),o=settings.overrides&&settings.overrides[H],used=validCmyk(o)?o.slice():auto;
 return {role,label:ROLE_LABEL[role]||role,hex:H,auto,cmyk:used,custom:validCmyk(o),tac:tac(used)}})}
// Overrides by role (as the studio saves them) → by HEX (as inkFor reads them).
function overridesFrom(pal,byRole){const out={};for(const [role,c] of Object.entries(byRole||{}))if(pal&&pal[role]&&validCmyk(c))out[hex(pal[role])]=c.map(v=>Math.round(v*10)/10);return out}

// ---- prefill from the project ----
function contactsIn(text){const t=String(text||''),out={};
 const e=t.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/);if(e)out.email=e[0];
 const ph=t.match(/(?:\+39[\s.]?)?\b(?:0\d|3\d{2})[\d\s.]{5,12}\d\b/);if(ph)out.phone=clean(ph[0]);
 const w=t.match(/\bhttps?:\/\/[^\s,;)<>"']+|\bwww\.[\w-]+(?:\.[\w-]+)+[^\s,;)<>"']*/i);if(w)out.website=w[0].replace(/[.]+$/,'').replace(/^https?:\/\//i,'').replace(/\/$/,'');
 const a=t.match(/\b(?:via|viale|piazza|piazzale|corso|largo|vicolo|strada|contrada|località)\s+[^\n;]{3,80}/i),line=t.match(/^\s*(?:sede|indirizzo)\s*:\s*(.+)$/im);
 const addr=clean(a?a[0]:line?line[1]:'').replace(/[.,]+$/,'');if(addr)out.address=addr.slice(0,FIELD_MAX);return out}
// profile: the raw project profile (with identityKit), plus the project name and the profileFor summary of the agents runtime.
function prefill(profile,{projectName,summary}={}){const p=profile||{},s=summary||{},b=brandOf(p,projectName);
 const c=p.contacts&&typeof p.contacts==='object'?p.contacts:{},text=[typeof p.contacts==='string'?p.contacts:'',p.links,p.notes,p.decisions,s.links,s.notes,s.decisions,s.summary].map(x=>Array.isArray(x)?x.join('\n'):String(x||'')).join('\n'),found=contactsIn(text);
 const v={name:b.name.slice(0,80),payoff:clean(p.payoff||p.slogan||p.tagline).slice(0,120)};
 for(const k of CONTACTS)v[k]=clean(c[k]||c[{phone:'telefono',email:'mail',website:'sito',address:'indirizzo'}[k]]||found[k]||'').slice(0,FIELDS[k].max);
 v.vat=clean(p.vat||p.piva||c.vat||'').slice(0,FIELD_MAX);return v}

// ---- texts from the Studio Testi (lib/copy-studio.js toMarkdown) ----
function strip(s){return String(s||'').replace(/\*\*([^*]+)\*\*/g,'$1').replace(/(^|\s)\*([^*\n]+)\*/g,'$1$2').replace(/`([^`]+)`/g,'$1').replace(/^\s*[-*]\s+/gm,'• ').replace(/\s\(\d+\/\d+\)\s*$/gm,'')}
// Markdown → {title, sections:[{title,text}]}: «##» blocks, and the «###» blocks inside them; meta line, «Da controllare» and the closing note dropped.
function parseCopy(md){const lines=String(md||'').replace(/\r/g,'').split('\n'),out={title:'',sections:[]};let cur=null,parent='',skip=false;
 for(let raw of lines){const l=raw.trimEnd();
  if(/^---+\s*$/.test(l)){if(out.sections.length||cur)break;continue}
  let m;if((m=/^#\s+(.+)/.exec(l))){out.title=clean(strip(m[1]).replace(/^.*?·\s*/,''));continue}
  if((m=/^##\s+(.+)/.exec(l))){parent=clean(strip(m[1]));skip=/^da controllare$/i.test(parent);cur=skip?null:{title:parent,text:'',group:parent};if(cur)out.sections.push(cur);continue}
  if((m=/^###+\s+(.+)/.exec(l))){if(skip)continue;if(cur&&cur.group===parent&&!cur.text.trim()&&cur.title===parent)out.sections.pop();cur={title:clean(strip(m[1])),text:'',group:parent};out.sections.push(cur);continue}
  if(skip)continue;if(!cur){if(/^Progetto:|^\s*$/.test(l)||!out.title&&!l.trim())continue;cur={title:'',text:'',group:''};out.sections.push(cur)}
  cur.text+=strip(l)+'\n'}
 out.sections=out.sections.map(s=>({title:s.title,text:block(s.text),group:s.group})).filter(s=>s.text||s.title&&s.title!==s.group);return out}
const firstLine=s=>clean(String(s||'').split('\n').find(x=>clean(x))||'');
const restLines=s=>{const L=String(s||'').split('\n');const i=L.findIndex(x=>clean(x));return block(L.slice(i+1).join('\n'))};
// Puts a parsed copy in the fields of a format. Returns {values, used, notes}.
function fromCopy(id,parsed,values){const f=need(id),v={...(values||{})},secs=(parsed&&parsed.sections||[]).slice(),notes=[];
 const take=re=>{const i=secs.findIndex(s=>re.test(s.group+' '+s.title));return i<0?null:secs.splice(i,1)[0]};
 const cover=take(/copertina|cover/i),close=take(/chiusura|contatti|conclusion/i),has=k=>f.fields.includes(k);let used=0;
 if(cover&&has('payoff')&&!has('headline')){const t=cover.title&&!/copertina/i.test(cover.title)?cover.title:firstLine(cover.text);if(t){v.payoff=t.slice(0,FIELDS.payoff.max);used++}}
 if(id==='brochure'){const slots=[['flapTitle','flapText'],['p1Title','p1Text'],['p2Title','p2Text'],['p3Title','p3Text']];
  secs.forEach((s,i)=>{const [t,x]=slots[Math.min(i,3)];if(i<4){v[t]=clean(s.title).slice(0,FIELDS[t].max);v[x]=s.text.slice(0,TEXT_MAX)}else v[x]=(v[x]+'\n\n'+(s.title?s.title+'\n':'')+s.text).slice(0,TEXT_MAX);used++});
  if(secs.length>4)notes.push('Ci sono più sezioni che ante: le ultime sono finite nell’Interno 3, accorciale.');
  if(close){v.closing=block((close.title&&!/chiusura/i.test(close.title)?close.title+'\n':'')+close.text).slice(0,FIELDS.closing.max);used++}}
 else if(has('headline')){const head=cover?firstLine(cover.text)||parsed.title:secs[0]&&secs[0].title||parsed.title;if(head){v.headline=clean(head).slice(0,FIELDS.headline.max);used++}
  const body=[cover?restLines(cover.text):'',...secs.map(s=>s.text)].filter(Boolean).join('\n\n');if(body){v.body=body.slice(0,TEXT_MAX);used++}
  if(close){v.cta=firstLine(close.text||close.title).slice(0,FIELDS.cta.max);used++}}
 if(!used)notes.push('Nel testo incollato non ho trovato sezioni da usare per questo formato.');return {values:v,used,notes}}

// ---- Helvetica (PDF standard font) widths, WinAnsi codes 32–255, per 1000 em ----
const W_REG='278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,350,556,350,222,556,333,1000,556,556,333,1000,667,333,1000,350,611,350,350,222,222,333,333,350,556,1000,333,1000,500,333,944,350,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500'.split(',').map(Number);
const W_BOLD='278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,350,556,350,278,556,500,1000,556,556,333,1000,667,333,1000,350,611,350,350,278,278,500,500,350,556,1000,333,1000,556,333,944,350,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556'.split(',').map(Number);
const ASCENT=.718,DESCENT=.207;
const CP1252={0x20AC:0x80,0x201A:0x82,0x0192:0x83,0x201E:0x84,0x2026:0x85,0x2020:0x86,0x2021:0x87,0x02C6:0x88,0x2030:0x89,0x0160:0x8A,0x2039:0x8B,0x0152:0x8C,0x017D:0x8E,0x2018:0x91,0x2019:0x92,0x201C:0x93,0x201D:0x94,0x2022:0x95,0x2013:0x96,0x2014:0x97,0x02DC:0x98,0x2122:0x99,0x0161:0x9A,0x203A:0x9B,0x0153:0x9C,0x017E:0x9E,0x0178:0x9F};
// A character → its WinAnsi code; accents outside WinAnsi lose the accent, anything else becomes «?».
function winAnsi(ch){const c=ch.codePointAt(0);if(c>=32&&c<127||c>=160&&c<=255)return c;if(CP1252[c])return CP1252[c];if(c===9)return 32;
 const base=ch.normalize('NFD').replace(/[̀-ͯ]/g,'');if(base&&base!==ch&&base.length===1)return winAnsi(base);return 63}
const codes=s=>Array.from(String(s||'')).map(winAnsi);
const unsupported=s=>Array.from(String(s||'')).filter(ch=>winAnsi(ch)===63&&ch!=='?');
const advance=(c,bold)=>((bold?W_BOLD:W_REG)[c-32]||556);
function textWidth(s,size,bold){return codes(s).reduce((a,c)=>a+advance(c,bold),0)*size/1000}// pt
const widthMm=(s,size,bold)=>ptToMm(textWidth(s,size,bold));
// Greedy wrap on spaces; a word longer than the line is broken by characters.
function wrap(text,size,width,bold){const out=[];
 for(const para of String(text||'').split('\n')){const words=clean(para).split(' ').filter(Boolean);if(!words.length){out.push('');continue}let line='';
  for(let w of words){const t=line?line+' '+w:w;if(widthMm(t,size,bold)<=width){line=t;continue}if(line)out.push(line);line='';
   while(widthMm(w,size,bold)>width&&w.length>1){let i=w.length-1;while(i>1&&widthMm(w.slice(0,i),size,bold)>width)i--;out.push(w.slice(0,i));w=w.slice(i)}line=w}
  out.push(line)}
 while(out.length&&out[out.length-1]==='')out.pop();return out}

// ---- logo recoloured in one colour (on a coloured background) ----
function monoSvg(svg,h){const c=hex(h);if(!HEX.test(c))return svg;let s=String(svg||'');
 s=s.replace(/\b(fill|stroke|stop-color)\s*=\s*"(?!none")[^"]*"/gi,(m,a)=>a+'="'+c+'"').replace(/\b(fill|stroke|stop-color)\s*=\s*'(?!none')[^']*'/gi,(m,a)=>a+'="'+c+'"');
 s=s.replace(/\b(fill|stroke|stop-color)\s*:\s*(?!none)[^;"']+/gi,(m,a)=>a+':'+c);
 if(!/^<svg\b[^>]*\sfill\s*=/i.test(s))s=s.replace(/^<svg\b/i,'<svg fill="'+c+'"');return s}

// ---- layout ----
const capMm=size=>ptToMm(size*ASCENT),descMm=size=>ptToMm(size*DESCENT);
// photo: {src, w, h} (pixels) or null; variant: one of VARIANTS.
function builder(f,brand,values,margin,{variant='classic',photo=null}={}){const warnings=[];
 const b={f,brand,v:values,m:margin,items:null,warnings,pal:brand.palette,variant:variantOf(variant),photoSrc:photo&&photo.src&&photo.w>0&&photo.h>0?photo:null,
  rect(x,y,w,h,fill){if(fill)b.items.push({t:'rect',x,y,w,h,fill})},
  line(x1,y1,x2,y2,stroke,width){b.items.push({t:'line',x1,y1,x2,y2,stroke,width:width||.5})},
  // One line in [x, x+w], left/center/right; shrinks to 85 % before letting it run long (the safe-area check then says so).
  text(x,y,w,s,o={}){s=clean(s);if(!s)return y;let size=o.size||10;const min=size*.85;while(widthMm(s,size,o.bold)>w&&size>min)size=Math.max(min,size-.25);
   const tw=widthMm(s,size,o.bold),left=o.align==='center'?x+(w-tw)/2:o.align==='right'?x+w-tw:x;
   b.items.push({t:'text',x:left,y,s,size,bold:!!o.bold,fill:o.fill,label:o.label||'',area:o.area});return y},
  // A wrapped block from its top; stops at maxY with «…» and a warning. Returns the y under it.
  para(x,top,w,s,o={}){const size=o.size||10,lead=ptToMm(size*(o.lead||1.3)),lines=wrap(block(s),size,w,o.bold);if(!lines.length)return top;
   let y=top+capMm(size),shown=0;
   for(let i=0;i<lines.length;i++){if(o.maxY!=null&&y+descMm(size)>o.maxY){const last=b.items[b.items.length-1];if(shown&&last&&last.t==='text'){last.s=last.s.replace(/\s*\S{0,3}$/,'')+'…'}
     warnings.push({kind:'overflow',label:o.label,text:'«'+o.label+'» non entra tutto nello spazio: accorcialo ('+shown+' righe su '+lines.length+').'});break}
    if(lines[i]){const tw=widthMm(lines[i],size,o.bold),left=o.align==='center'?x+(w-tw)/2:o.align==='right'?x+w-tw:x;b.items.push({t:'text',x:left,y,s:lines[i],size,bold:!!o.bold,fill:o.fill,label:o.label||'',area:o.area});shown++;y+=lead}
    else y+=lead*.5}
   return y-lead+descMm(size)+(o.after==null?lead*.4:o.after)},
  // The logo fitted (contain) in a box, else the name as a bold wordmark. o.mono: the logo in one colour (on a coloured background).
  logo(x,y,w,h,o={}){const vb=viewBox(brand.logo),bg=o.bg||b.pal.light;
   if(brand.logo&&vb){const s=Math.min(w/vb[2],h/vb[3]),lw=vb[2]*s,lh=vb[3]*s,lx=o.align==='left'?x:o.align==='right'?x+w-lw:x+(w-lw)/2;
    b.items.push({t:'logo',x:lx,y:y+(h-lh)/2,w:lw,h:lh,svg:o.mono?monoSvg(brand.logo,o.mono):brand.logo,vb,bg,label:'Logo',area:o.area});return}
   const name=clean(values.name)||'Il tuo nome';let size=Math.min(mmToPt(h)*.62,60*(o.scale||1));while(size>6&&widthMm(name,size,true)>w)size-=.5;
   const tw=widthMm(name,size,true),lx=o.align==='left'?x:o.align==='right'?x+w-tw:x+(w-tw)/2;
   b.items.push({t:'text',x:lx,y:y+h/2+capMm(size)/2,s:name,size,bold:true,fill:o.mono||ink(bg,b.pal,b.pal.primary,b.pal.dark),label:'Nome (logotipo)',area:o.area,wordmark:true})},
  // The photo, cropped to fill the box (cover); false when there is none.
  photo(x,y,w,h,o={}){const p=b.photoSrc;if(!p||w<=0||h<=0)return false;b.items.push({t:'image',photo:true,x,y,w,h,src:p.src,px:{w:p.w,h:p.h},bg:o.bg||b.pal.light,label:'Foto',area:o.area});return true}};
 return b}
const contactLines=v=>CONTACTS.map(k=>clean(v[k])).filter(Boolean);
const contactKeys=v=>CONTACTS.filter(k=>clean(v[k]));
const fullBleed=(b,w,h,fill)=>b.rect(-BLEED,-BLEED,w+2*BLEED,h+2*BLEED,fill);
// The contact lines, bottom-aligned at `bottom`; returns the y of the top of the block.
function contactsAt(b,x,bottom,width,size,fill,align){const lines=contactLines(b.v),keys=contactKeys(b.v),lead=ptToMm(size*1.35),cy=bottom-descMm(size)-(lines.length-1)*lead;
 lines.forEach((l,i)=>b.text(x,cy+i*lead,width,l,{size,fill,align,label:FIELDS[keys[i]].label}));return cy-capMm(size)}
function businessCard(b){const {f,pal,v,m,variant}=b,w=f.w,h=f.h,front=[],back=[],pay=clean(v.payoff);
 const who=clean(v.person)||clean(v.name),whoLabel=clean(v.person)?'Nome e cognome':'Nome';
 if(variant==='bold'){
  b.items=front;fullBleed(b,w,h,pal.primary);const on=ink(pal.primary,pal,pal.light,pal.dark),payBase=h-m-1.2;
  b.logo(m,m+2,w-2*m,(pay?payBase-capMm(7.5)-3:h-m-2)-(m+2),{mono:on,bg:pal.primary});
  if(pay)b.text(m,payBase,w-2*m,pay,{size:7.5,bold:true,fill:on,align:'center',label:'Payoff'});
  b.items=back;fullBleed(b,w,h,pal.light);b.rect(-BLEED,-BLEED,7+BLEED,h+2*BLEED,pal.accent);
  const x=7+m,tw=w-x-m,head=ink(pal.light,pal,pal.primary,pal.dark),txt=ink(pal.light,pal,pal.dark);let y=m+capMm(12);
  if(who){b.text(x,y,tw,who,{size:12,bold:true,fill:head,label:whoLabel});y+=ptToMm(12*1.25)}
  if(clean(v.role))b.text(x,y,tw,v.role,{size:8,fill:txt,label:'Ruolo'});
  contactsAt(b,x,h-m,tw,7.5,txt);b.items=null;return [front,back]}
 if(variant==='minimal'){
  b.items=front;fullBleed(b,w,h,pal.light);const soft=ink(pal.light,pal,pal.secondary,pal.dark),txt=ink(pal.light,pal,pal.dark),head=ink(pal.light,pal,pal.primary,pal.dark);
  b.logo(m+1,m+1,(w-2*m)*.55,14,{align:'left'});
  if(pay){b.text(m+1,h-m-1-descMm(7),w-2*m-2,pay,{size:7,fill:soft,label:'Payoff'});b.rect(m+1,h-m-1-descMm(7)-capMm(7)-3,10,.6,pal.accent)}
  b.items=back;fullBleed(b,w,h,pal.light);let y=m+1+capMm(9.5);
  if(who){b.text(m+1,y,w-2*m-2,who,{size:9.5,bold:true,fill:head,label:whoLabel});y+=ptToMm(9.5*1.3)}
  if(clean(v.role)){b.text(m+1,y,w-2*m-2,v.role,{size:7,fill:soft,label:'Ruolo'});y+=ptToMm(7*1.3)}
  const top=contactsAt(b,m+1,h-m-1,w-2*m-2,7,txt);b.line(m+1,top-2.5,m+15,top-2.5,pal.accent,.5);
  b.items=null;return [front,back]}
 b.items=front;fullBleed(b,w,h,pal.light);b.rect(-BLEED,h-3,w+2*BLEED,3+BLEED,pal.accent);
 const payBase=h-Math.max(m,5)-1.2,logoBottom=pay?payBase-capMm(7.5)-2:h-m-2;
 b.logo(m,m,w-2*m,logoBottom-m);if(pay)b.text(m,payBase,w-2*m,pay,{size:7.5,fill:ink(pal.light,pal,pal.dark),align:'center',label:'Payoff'});
 b.items=back;const bg=pal.primary,t=ink(bg,pal,pal.light,pal.dark);fullBleed(b,w,h,bg);
 let y=m+capMm(11);if(who){b.text(m,y,w-2*m,who,{size:11,bold:true,fill:t,label:whoLabel});y+=ptToMm(11*1.25)}
 if(clean(v.role))b.text(m,y,w-2*m,v.role,{size:8,fill:t,label:'Ruolo'});
 contactsAt(b,m,h-m,w-2*m,7.5,t);
 b.items=null;return [front,back]}
// Flyer A5, flyer/poster A4, posters A3 and A2: the A5 design scaled by the width (s).
function poster(b){const {f,pal,v,m,variant}=b,w=f.w,h=f.h,s=w/148,page=[],inner=w-2*m;b.items=page;
 if(variant==='bold'){
  fullBleed(b,w,h,pal.primary);const on=ink(pal.primary,pal,pal.light,pal.dark),band=40*s,bandTop=h-band;let y=m;
  if(b.photo(-BLEED,-BLEED,w+2*BLEED,h*.4+BLEED,{bg:pal.primary}))y=h*.4+7*s;
  const lh=(b.photoSrc?14:24)*s;b.logo(m,y,inner*.5,lh,{align:'left',mono:on,bg:pal.primary});y+=lh+6*s;
  if(clean(v.payoff))y=b.para(m,y,inner,v.payoff,{size:10*s,fill:on,label:'Payoff',maxY:bandTop-10*s})+3*s;
  y=b.para(m,y,inner,v.headline,{size:(b.photoSrc?30:38)*s,lead:1.04,bold:true,fill:on,label:'Titolo',maxY:bandTop-10*s,after:5*s});
  b.para(m,y,inner,v.body,{size:11*s,lead:1.4,fill:on,label:'Testo',maxY:bandTop-6*s});
  b.rect(-BLEED,bandTop,w+2*BLEED,band+BLEED,pal.accent);const t=ink(pal.accent,pal,pal.dark,pal.light);let cy=bandTop+Math.max(Math.min(m,band/4),6*s);
  if(clean(v.cta))cy=b.para(m,cy,inner,v.cta,{size:15*s,lead:1.15,bold:true,fill:t,label:'Invito all’azione',maxY:h-m-11*s,after:3*s});
  b.para(m,cy,inner,contactLines(v).join('  ·  '),{size:9*s,lead:1.35,fill:t,label:'Contatti',maxY:h-m});
  b.items=null;return [page]}
 if(variant==='minimal'){
  fullBleed(b,w,h,pal.light);const head=ink(pal.light,pal,pal.primary,pal.dark),txt=ink(pal.light,pal,pal.dark),soft=ink(pal.light,pal,pal.secondary,pal.dark);
  b.logo(m,m,inner*.4,14*s,{align:'left'});let y=m+14*s+10*s;
  if(b.photo(m,y,inner,h*.34))y+=h*.34+10*s;else y+=h*.14;
  const ly=h-m-22*s;b.rect(m,y,14*s,1*s,pal.accent);y+=6*s;
  y=b.para(m,y,inner,v.headline,{size:26*s,lead:1.08,bold:true,fill:head,label:'Titolo',maxY:ly-30*s,after:4*s});
  if(clean(v.payoff))y=b.para(m,y,inner,v.payoff,{size:10*s,fill:soft,label:'Payoff',maxY:ly-24*s,after:4*s});
  b.para(m,y,inner,v.body,{size:10*s,lead:1.45,fill:txt,label:'Testo',maxY:ly-14*s});
  if(clean(v.cta))b.text(m,ly-4*s,inner,v.cta,{size:12*s,bold:true,fill:head,label:'Invito all’azione'});
  b.line(m,ly,w-m,ly,pal.secondary,.5*s);
  b.para(m,ly+4*s,inner,contactLines(v).join('  ·  '),{size:8.5*s,lead:1.35,fill:soft,label:'Contatti',maxY:h-m});
  b.items=null;return [page]}
 fullBleed(b,w,h,pal.light);
 const band=46*s,bandTop=h-band;b.rect(-BLEED,bandTop,w+2*BLEED,band+BLEED,pal.primary);b.rect(-BLEED,bandTop-3*s,w+2*BLEED,3*s,pal.accent);
 b.logo(m,m,inner*.55,26*s,{align:'left'});
 let y=m+26*s+(clean(v.payoff)?0:4*s);
 if(clean(v.payoff))y=b.para(m,y+3*s,inner,v.payoff,{size:10*s,fill:ink(pal.light,pal,pal.secondary,pal.dark),label:'Payoff',maxY:bandTop-6*s})+4*s;
 if(b.photoSrc){const ph=Math.min(h*.3,bandTop-y-62*s);if(ph>20*s&&b.photo(-BLEED,y+2*s,w+2*BLEED,ph))y+=ph+4*s}
 y=b.para(m,y+4*s,inner,v.headline,{size:30*s,lead:1.1,bold:true,fill:ink(pal.light,pal,pal.primary,pal.dark),label:'Titolo',maxY:bandTop-8*s,after:6*s});
 b.para(m,y,inner,v.body,{size:11*s,lead:1.4,fill:ink(pal.light,pal,pal.dark),label:'Testo',maxY:bandTop-3*s-m*.6});
 const t=ink(pal.primary,pal,pal.light,pal.dark),bm=Math.min(m,band/4);let cy=bandTop+Math.max(bm,6*s);
 if(clean(v.cta))cy=b.para(m,cy,inner,v.cta,{size:16*s,lead:1.15,bold:true,fill:t,label:'Invito all’azione',maxY:h-m-12*s,after:3*s});
 b.para(m,cy,inner,contactLines(v).join('  ·  '),{size:9*s,lead:1.35,fill:t,label:'Contatti',maxY:h-m});
 b.items=null;return [page]}
// Roll-up 850 × 2000 mm: the bottom 100 mm go into the base, so only the background runs there; seen from metres away.
function rollup(b){const {f,pal,v,m,variant}=b,w=f.w,h=f.h,vis=h-f.hidden.bottom,s=w/148,inner=w-2*m,page=[];b.items=page;
 if(variant==='bold'){
  fullBleed(b,w,h,pal.primary);const on=ink(pal.primary,pal,pal.light,pal.dark);let y=m+20;
  if(b.photo(-BLEED,-BLEED,w+2*BLEED,760+BLEED,{bg:pal.primary}))y=810;
  const lh=b.photoSrc?120:200;b.logo(m,y,inner*.6,lh,{align:'left',mono:on,bg:pal.primary,scale:s});y+=lh+40;
  if(clean(v.payoff))y=b.para(m,y,inner,v.payoff,{size:10*s,fill:on,label:'Payoff',maxY:vis-560})+20;
  y=b.para(m,y,inner,v.headline,{size:32*s,lead:1.05,bold:true,fill:on,label:'Titolo',maxY:vis-480,after:30});
  b.para(m,y,inner,v.body,{size:10*s,lead:1.4,fill:on,label:'Testo',maxY:vis-430});
  b.rect(-BLEED,vis-400,w+2*BLEED,400+f.hidden.bottom+BLEED,pal.accent);const t=ink(pal.accent,pal,pal.dark,pal.light);let cy=vis-400+60;
  if(clean(v.cta))cy=b.para(m,cy,inner,v.cta,{size:14*s,lead:1.12,bold:true,fill:t,label:'Invito all’azione',maxY:vis-170,after:30});
  b.para(m,cy,inner,contactLines(v).join('  ·  '),{size:8*s,lead:1.35,fill:t,label:'Contatti',maxY:vis-m});
  b.items=null;return [page]}
 if(variant==='minimal'){
  fullBleed(b,w,h,pal.light);const head=ink(pal.light,pal,pal.primary,pal.dark),txt=ink(pal.light,pal,pal.dark),soft=ink(pal.light,pal,pal.secondary,pal.dark);
  b.logo(m,m+20,inner*.45,110,{align:'left',scale:s});let y;
  if(b.photo(m,m+190,inner,640))y=m+190+640+90;else y=vis*.32;
  b.rect(m,y,90,6,pal.accent);y+=50;
  y=b.para(m,y,inner,v.headline,{size:26*s,lead:1.08,bold:true,fill:head,label:'Titolo',maxY:vis-430,after:24});
  if(clean(v.payoff))y=b.para(m,y,inner,v.payoff,{size:9.5*s,fill:soft,label:'Payoff',maxY:vis-380,after:24});
  b.para(m,y,inner,v.body,{size:9*s,lead:1.45,fill:txt,label:'Testo',maxY:vis-340});
  if(clean(v.cta))b.text(m,vis-280,inner,v.cta,{size:11*s,bold:true,fill:head,label:'Invito all’azione'});
  b.line(m,vis-250,w-m,vis-250,pal.secondary,3);
  b.para(m,vis-225,inner,contactLines(v).join('  ·  '),{size:7.5*s,lead:1.35,fill:soft,label:'Contatti',maxY:vis-m});
  b.items=null;return [page]}
 fullBleed(b,w,h,pal.light);let y=m+30;
 b.logo(m,y,inner,220,{scale:s});y+=220+30;
 if(clean(v.payoff))y=b.para(m,y,inner,v.payoff,{size:11*s,fill:ink(pal.light,pal,pal.secondary,pal.dark),align:'center',label:'Payoff',maxY:vis-620,after:30});
 if(b.photo(-BLEED,y+10,w+2*BLEED,560))y+=10+560+50;else y+=60;
 y=b.para(m,y,inner,v.headline,{size:30*s,lead:1.08,bold:true,fill:ink(pal.light,pal,pal.primary,pal.dark),align:'center',label:'Titolo',maxY:vis-500,after:30});
 b.para(m,y,inner,v.body,{size:10*s,lead:1.4,fill:ink(pal.light,pal,pal.dark),align:'center',label:'Testo',maxY:vis-450});
 const top=vis-420;b.rect(-BLEED,top-14,w+2*BLEED,14,pal.accent);b.rect(-BLEED,top,w+2*BLEED,h-top+BLEED,pal.primary);
 const t=ink(pal.primary,pal,pal.light,pal.dark);let cy=top+60;
 if(clean(v.cta))cy=b.para(m,cy,inner,v.cta,{size:15*s,lead:1.12,bold:true,fill:t,align:'center',label:'Invito all’azione',maxY:vis-170,after:30});
 b.para(m,cy,inner,contactLines(v).join('  ·  '),{size:8.5*s,lead:1.35,fill:t,align:'center',label:'Contatti',maxY:vis-m});
 b.items=null;return [page]}
function letterhead(b){const {f,pal,v,m,variant}=b,w=f.w,h=f.h,page=[];b.items=page;const white='#FFFFFF';
 const lines=contactLines(v),soft=ink(white,pal,pal.secondary,pal.dark),txt=ink(white,pal,pal.dark),head=ink(white,pal,pal.primary,pal.dark);
 const footer=(x0,x1,ruleColour)=>{const fy=h-m-descMm(7)-(clean(v.vat)?ptToMm(7*1.4):0);b.line(x0,fy-capMm(8)-3,x1,fy-capMm(8)-3,ruleColour,.6);
  b.text(x0,fy,x1-x0,[clean(v.name),clean(v.address)].filter(Boolean).join('  ·  '),{size:8,bold:true,align:'center',fill:head,label:'Piè di pagina'});
  if(clean(v.vat))b.text(x0,fy+ptToMm(7*1.4),x1-x0,v.vat,{size:7,align:'center',fill:soft,label:'P. IVA e dati societari'})};
 if(variant==='bold'){
  b.rect(-BLEED,-BLEED,12+BLEED,h+2*BLEED,pal.primary);b.rect(12,-BLEED,1.5,h+2*BLEED,pal.accent);
  const x0=Math.max(m,22),top=Math.max(m,12);b.logo(x0,top,64,22,{align:'left',bg:white});
  if(clean(v.payoff))b.text(x0,top+22+capMm(8)+2,90,v.payoff,{size:8,fill:soft,label:'Payoff'});
  const lead=ptToMm(8*1.4);lines.forEach((l,i)=>b.text(w-m-80,top+capMm(8)+1+i*lead,80,l,{size:8,bold:i===0,align:'right',fill:i===0?head:txt,label:'Contatti'}));
  footer(x0,w-m,pal.primary);b.items=null;return [page]}
 if(variant==='minimal'){
  const top=Math.max(m,12);b.logo(m,top,w-2*m,16,{bg:white});
  if(clean(v.payoff))b.text(m,top+16+capMm(7.5)+2.5,w-2*m,v.payoff,{size:7.5,align:'center',fill:soft,label:'Payoff'});
  const fy=h-m-descMm(7)-(clean(v.vat)?ptToMm(7*1.4):0);b.line(w/2-12,fy-capMm(7.5)-4,w/2+12,fy-capMm(7.5)-4,pal.accent,.6);
  b.text(m,fy,w-2*m,lines.join('  ·  '),{size:7.5,align:'center',fill:txt,label:'Contatti'});
  if(clean(v.vat))b.text(m,fy+ptToMm(7*1.4),w-2*m,v.vat,{size:7,align:'center',fill:soft,label:'P. IVA e dati societari'});
  b.items=null;return [page]}
 b.rect(-BLEED,-BLEED,w+2*BLEED,4+BLEED,pal.primary);b.rect(-BLEED,4,w+2*BLEED,1.2,pal.accent);
 const top=Math.max(m,9);b.logo(m,top,70,22,{align:'left',bg:white});
 if(clean(v.payoff))b.text(m,top+22+capMm(8)+2,90,v.payoff,{size:8,fill:soft,label:'Payoff'});
 const lead=ptToMm(8*1.4);lines.forEach((l,i)=>b.text(w-m-90,top+capMm(8)+1+i*lead,90,l,{size:8,align:'right',fill:txt,label:'Contatti'}));
 footer(m,w-m,pal.accent);b.items=null;return [page]}
function brochure(b){const {f,pal,v,m,variant}=b,h=f.h,W=f.w,pages=[];const area=(x,w)=>({x,y:0,w,h});
 const head=ink(pal.light,pal,pal.primary,pal.dark),txt=ink(pal.light,pal,pal.dark),[a,bk]=f.panels[0],cx=a+bk,cw=W-cx;
 // outside: flap | back | cover
 let page=[];b.items=page;fullBleed(b,W,h,pal.light);
 const flap=(bg,tColour,xColour)=>{const ar=area(0,a);let y=m;if(bg)b.rect(-BLEED,-BLEED,a+BLEED,h+2*BLEED,bg);
  y=b.para(m,y+2,a-2*m,v.flapTitle,{size:15,lead:1.15,bold:true,fill:tColour,label:'Aletta interna · titolo',maxY:h-m,area:ar,after:3});
  if(variant==='minimal'&&clean(v.flapTitle)){b.rect(m,y,12,.6,pal.accent);y+=4}
  b.para(m,y,a-2*m,v.flapText,{size:9.5,lead:1.4,fill:xColour,label:'Aletta interna · testo',maxY:h-m,area:ar})};
 const back=()=>{const ar=area(a,bk),bx=a+m,bw=bk-2*m;let y=m+2;
  y=b.para(bx,y,bw,v.closing,{size:10.5,lead:1.35,bold:true,fill:head,label:'Retro · testo di chiusura',maxY:h-m-60,area:ar,after:5});
  contactLines(v).forEach(l=>{y=b.para(bx,y,bw,l,{size:9,lead:1.3,fill:txt,label:'Contatti',maxY:h-m-34,area:ar,after:1.5})});
  b.logo(bx,h-m-28,bw,variant==='minimal'?16:24,{area:ar})};
 const nameShown=b.brand.logo&&!/<text\b/i.test(b.brand.logo)?v.name:'';
 if(variant==='bold'){const sec=pal.secondary,onSec=ink(sec,pal,pal.light,pal.dark);flap(sec,onSec,onSec);back();
  const ar=area(cx,cw),on=ink(pal.primary,pal,pal.light,pal.dark);b.rect(cx,-BLEED,cw+BLEED,h+2*BLEED,pal.primary);let ly=h*.2;
  if(b.photo(cx,-BLEED,cw+BLEED,h*.42+BLEED,{bg:pal.primary,area:ar}))ly=h*.42+10;
  b.logo(cx+m,ly,cw-2*m,h*.2,{area:ar,mono:on,bg:pal.primary});let y=ly+h*.2+8;
  y=b.para(cx+m,y,cw-2*m,nameShown,{size:20,lead:1.1,bold:true,fill:on,align:'center',label:'Nome',maxY:h-m-16,area:ar,after:3});
  b.para(cx+m,y,cw-2*m,v.payoff,{size:11,lead:1.3,fill:on,align:'center',label:'Payoff',maxY:h-m-14,area:ar});
  if(clean(v.website))b.text(cx+m,h-m-descMm(10),cw-2*m,v.website,{size:10,bold:true,align:'center',fill:on,label:'Sito web',area:ar})}
 else if(variant==='minimal'){flap(null,head,txt);back();const ar=area(cx,cw);let ly=h*.3;
  if(b.photo(cx+m,m,cw-2*m,h*.36,{area:ar}))ly=m+h*.36+12;
  b.logo(cx+m,ly,cw-2*m,h*.14,{area:ar});let y=ly+h*.14+8;
  y=b.para(cx+m,y,cw-2*m,nameShown,{size:16,lead:1.1,bold:true,fill:head,align:'center',label:'Nome',maxY:h-m-20,area:ar,after:3});
  b.para(cx+m,y,cw-2*m,v.payoff,{size:10,lead:1.3,fill:ink(pal.light,pal,pal.secondary,pal.dark),align:'center',label:'Payoff',maxY:h-m-16,area:ar});
  b.line(cx+cw/2-8,h-m-12,cx+cw/2+8,h-m-12,pal.accent,.6);
  if(clean(v.website))b.text(cx+m,h-m-descMm(9),cw-2*m,v.website,{size:9,align:'center',fill:head,label:'Sito web',area:ar})}
 else{flap(null,head,txt);back();
  const ar=area(cx,cw),band=h*.3;b.rect(cx,h-band,cw+BLEED,band+BLEED,pal.primary);b.rect(cx,h-band-3,cw+BLEED,3,pal.accent);
  let ly=h*.16,lh=h*.24;if(b.photo(cx,-BLEED,cw+BLEED,h*.36+BLEED,{area:ar})){ly=h*.36+6;lh=h*.13}
  b.logo(cx+m,ly,cw-2*m,lh,{area:ar});let y=ly+lh+8;
  y=b.para(cx+m,y,cw-2*m,nameShown,{size:20,lead:1.1,bold:true,fill:head,align:'center',label:'Nome',maxY:h-band-8,area:ar,after:3});
  b.para(cx+m,y,cw-2*m,v.payoff,{size:11,lead:1.3,fill:txt,align:'center',label:'Payoff',maxY:h-band-6,area:ar});
  if(clean(v.website))b.text(cx+m,h-m-descMm(10),cw-2*m,v.website,{size:10,bold:true,align:'center',fill:ink(pal.primary,pal,pal.light,pal.dark),label:'Sito web',area:ar})}
 pages.push(page);
 // inside: three panels
 page=[];b.items=page;fullBleed(b,W,h,pal.light);
 if(variant==='classic')b.rect(-BLEED,-BLEED,W+2*BLEED,6+BLEED,pal.primary);
 let x=0;f.panels[1].forEach((pw,i)=>{const ar=area(x,pw),k='p'+(i+1),x0=i===0?-BLEED:x,x1=i===2?x+pw+BLEED:x+pw;let yy;
  if(variant==='bold'){const on=ink(pal.primary,pal,pal.light,pal.dark);b.rect(x0,-BLEED,x1-x0,34+BLEED,pal.primary);
   const lines=wrap(clean(v[k+'Title']),14,pw-2*m,true).slice(0,2),top=34-m-(lines.length?(lines.length-1)*ptToMm(14*1.15)+capMm(14)+descMm(14):0);
   b.para(x+m,Math.max(m,top),pw-2*m,v[k+'Title'],{size:14,lead:1.15,bold:true,fill:on,label:FIELDS[k+'Title'].label,maxY:34-m+1,area:ar,after:0});yy=34+m}
  else{yy=(variant==='classic'?6:0)+m+2;
   yy=b.para(x+m,yy,pw-2*m,v[k+'Title'],{size:14,lead:1.15,bold:true,fill:head,label:FIELDS[k+'Title'].label,maxY:h-m,area:ar,after:3});
   if(variant==='minimal'&&clean(v[k+'Title'])){b.rect(x+m,yy,12,.6,pal.accent);yy+=4}}
  b.para(x+m,yy,pw-2*m,v[k+'Text'],{size:9.5,lead:1.4,fill:txt,label:FIELDS[k+'Text'].label,maxY:h-m,area:ar});x+=pw});
 pages.push(page);b.items=null;return pages}
function viewBox(svg){const m=/<svg\b[^>]*\bviewBox="\s*(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/i.exec(String(svg||''));
 if(m){const v=m.slice(1).map(Number);return v[2]>0&&v[3]>0?v:null}
 const w=/<svg\b[^>]*\bwidth="([\d.]+)/i.exec(String(svg||'')),h=/<svg\b[^>]*\bheight="([\d.]+)/i.exec(String(svg||''));return w&&h?[0,0,+w[1],+h[1]]:null}
const folds=f=>(f.panels||[]).map(p=>p.slice(0,-1).map((_,i)=>p.slice(0,i+1).reduce((a,x)=>a+x,0)));
// The whole document: {format, variant, title, pages:[{label,w,h,items,folds,hidden}], warnings}.
// opts: {margin, variant, photo:{src,w,h}}; the variant can also come from values.variant.
function layout(id,values,brand,opts={}){const f=need(id),v={};for(const k of f.fields)v[k]=String((values||{})[k]==null?'':values[k]).slice(0,FIELDS[k].max);
 const raw=opts.margin!=null?opts.margin:(values||{}).margin,margin=raw===''||raw==null||!isFinite(+raw)?f.margin:Math.max(0,Math.min(f.id==='rollup'?120:40,+raw)),br=brand||brandOf({},v.name);
 const variant=variantOf(opts.variant||(values||{}).variant),b=builder(f,br,v,margin,{variant,photo:f.photo?opts.photo:null});
 const pages=(f.id==='biglietto'?businessCard:f.id==='carta'?letterhead:f.id==='brochure'?brochure:f.id==='rollup'?rollup:poster)(b);
 const fl=folds(f);const doc={format:f.id,variant,title:f.title+(clean(v.name)?' · '+clean(v.name):''),margin,brand:br,values:v,dpi:f.dpi||DPI,
  pages:pages.map((items,i)=>({label:f.pages[i],w:f.w,h:f.h,items,folds:fl[i]||[],hidden:f.hidden||null})),warnings:b.warnings};
 doc.warnings=doc.warnings.concat(safeArea(doc),glyphs(doc));return doc}
// Text and logo closer than SAFE mm to the trim (or to a fold, on the brochure panels), or in the hidden base of the roll-up.
// rot 180 (the upside-down face of a table tent, lib/menu-studio.js): the text runs to the left of x, its cap height under y.
function bbox(it){if(it.t==='text'){const w=widthMm(it.s,it.size,it.bold);return it.rot===180?{x0:it.x-w,x1:it.x,y0:it.y-descMm(it.size),y1:it.y+capMm(it.size)}:{x0:it.x,x1:it.x+w,y0:it.y-capMm(it.size),y1:it.y+descMm(it.size)}}
 if(it.t==='logo')return {x0:it.x,x1:it.x+it.w,y0:it.y,y1:it.y+it.h};return null}
function safeArea(doc,safe=SAFE){const out=[],seen=new Set();
 doc.pages.forEach((p,pi)=>p.items.forEach(it=>{const bb=bbox(it);if(!bb)return;const a=it.area||{x:0,y:0,w:p.w,h:p.h},hid=p.hidden&&p.hidden.bottom||0;
  const d=Math.min(bb.x0-a.x,a.x+a.w-bb.x1,bb.y0-a.y,a.y+a.h-bb.y1);
  if(hid&&bb.y1>p.h-hid-safe+1e-6){const key=pi+'|'+(it.label||it.t)+'|base';if(seen.has(key))return;seen.add(key);
   out.push({kind:'safe',page:pi,label:it.label,distance:Math.round((p.h-hid-bb.y1)*10)/10,text:p.label+': «'+(it.t==='logo'?'Logo':it.label||'Testo')+'» scende nei '+hid+' mm in basso che entrano nella base del roll-up: non si vedrà. Tienilo almeno '+safe+' mm più in alto.'});return}
  if(d>=safe-1e-6)return;
  const edge=it.area&&(Math.abs(bb.x0-a.x)<safe&&a.x>0||Math.abs(a.x+a.w-bb.x1)<safe&&a.x+a.w<p.w)?'dalla piega':'dal bordo di taglio',key=pi+'|'+(it.label||it.t)+'|'+edge;if(seen.has(key))return;seen.add(key);
  out.push({kind:'safe',page:pi,label:it.label,distance:Math.round(Math.max(d,-99)*10)/10,
   text:p.label+': «'+(it.t==='logo'?'Logo':it.label||'Testo')+'» è a '+(d<0?'meno di 0':mmText(Math.max(0,d)))+' mm '+edge+' (servono almeno '+safe+' mm): può essere tagliato.'})}));
 return out}
function glyphs(doc){const bad=new Set();doc.pages.forEach(p=>p.items.forEach(it=>{if(it.t==='text')unsupported(it.s).forEach(c=>bad.add(c))}));
 return bad.size?[{kind:'glyph',text:'Questi caratteri non esistono in Helvetica e nel PDF diventano «?»: '+[...bad].slice(0,10).join(' ')+'.'}]:[]}
// Backgrounds and photos that touch the trim must run on to the bleed edge (else a white hairline after the cut).
function bleedProblems(doc){const out=[],e=.01;
 doc.pages.forEach(p=>p.items.forEach(it=>{if(it.t!=='rect'&&it.t!=='image')return;const x0=it.x,x1=it.x+it.w,y0=it.y,y1=it.y+it.h,sides=[];
  if(x0<=e&&x0>-BLEED+e&&y1>0&&y0<p.h)sides.push('a sinistra');if(x1>=p.w-e&&x1<p.w+BLEED-e&&y1>0&&y0<p.h)sides.push('a destra');
  if(y0<=e&&y0>-BLEED+e&&x1>0&&x0<p.w)sides.push('in alto');if(y1>=p.h-e&&y1<p.h+BLEED-e&&x1>0&&x0<p.w)sides.push('in basso');
  if(sides.length)out.push(p.label+': '+(it.t==='image'?'la foto':'un fondo colorato')+' tocca il taglio '+sides.join(', ')+' senza arrivare all’abbondanza.')}));
 return out}
// Crop marks on the trim lines and fold marks on the folds, drawn in the slug: from the page edge to 1 mm before the bleed
// edge (5 mm long), in mm on the print page (origin top-left of the MediaBox).
function marks(page,bleed=BLEED,slug=SLUG){const o=slug+bleed,W=page.w+2*o,H=page.h+2*o,len=slug-MARK_GAP,out=[];
 for(const x of [o,o+page.w])for(const [y0,y1] of [[0,len],[H-len,H]])out.push({kind:'crop',x1:x,y1:y0,x2:x,y2:y1});
 for(const y of [o,o+page.h])for(const [x0,x1] of [[0,len],[W-len,W]])out.push({kind:'crop',x1:x0,y1:y,x2:x1,y2:y});
 for(const f of page.folds||[])for(const [y0,y1] of [[0,len],[H-len,H]])out.push({kind:'fold',x1:o+f,y1:y0,x2:o+f,y2:y1});
 for(const f of page.foldsY||[])for(const [x0,x1] of [[0,len],[W-len,W]])out.push({kind:'fold',x1:x0,y1:o+f,x2:x1,y2:o+f});// horizontal folds (table tent)
 return out}

// ---- images: resolution ----
// The effective resolution of a photo of px.w × px.h pixels filling (cover) a box of w × h mm.
function effectiveDpi(px,w,h){if(!px||!(px.w>0)||!(px.h>0)||!(w>0)||!(h>0))return 0;const mmPerPx=Math.max(w/px.w,h/px.h);return Math.round(25.4/mmPerPx)}
// Every raster in the document: photos (from their source pixels, or the prepared raster) and raster logos.
function imagesReport(doc){const need=doc.dpi||DPI,out=[];
 doc.pages.forEach(p=>p.items.forEach(it=>{let dpi=0;
  if(it.t==='image'&&it.photo)dpi=it.raster&&it.raster.dpi?it.raster.dpi:effectiveDpi(it.px,it.w,it.h);
  else if((it.t==='image'||it.t==='logo')&&it.raster)dpi=Math.round(it.raster.w/(it.w/25.4));else return;
  out.push({page:p.label,label:it.label||(it.t==='logo'?'Logo':'Immagine'),dpi,need,ok:dpi>=need-.5,px:it.px||(it.raster?{w:it.raster.w,h:it.raster.h}:null),mm:{w:Math.round(it.w),h:Math.round(it.h)}})}));
 return out}

// ---- logo SVG → PDF vector operators ----
function decode(s){return String(s).replace(/&#x([0-9a-f]+);/gi,(m,h)=>String.fromCodePoint(parseInt(h,16))).replace(/&#(\d+);/g,(m,d)=>String.fromCodePoint(+d)).replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')}
function parseSvg(src){const rootNode={tag:'#root',attrs:{},children:[]},stack=[rootNode],re=/<(\/?)([a-zA-Z][\w:.-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>|([^<]+)|<[^>]*>/g;let m;
 const s=String(src||'').replace(/<!--[\s\S]*?-->/g,'').replace(/<\?[\s\S]*?\?>/g,'').replace(/<!DOCTYPE[^>]*>/gi,'');
 while((m=re.exec(s))){const top=stack[stack.length-1];if(m[5]!=null){top.children.push({tag:'#text',text:decode(m[5])});continue}if(!m[2])continue;
  const tag=m[2].toLowerCase().replace(/^svg:/,'');if(m[1]){const i=stack.map(n=>n.tag).lastIndexOf(tag);if(i>0)stack.length=i;continue}
  const attrs={},ar=/([^\s=>\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;let a;while((a=ar.exec(m[3]||'')))attrs[a[1].toLowerCase()]=decode(a[2]!=null?a[2]:a[3]!=null?a[3]:'');
  const n={tag,attrs,children:[]};top.children.push(n);if(!m[4])stack.push(n)}
 return rootNode.children.find(n=>n.tag==='svg')||null}
const NAMED={black:'#000000',white:'#FFFFFF',red:'#FF0000',green:'#008000',blue:'#0000FF',gray:'#808080',grey:'#808080',orange:'#FFA500',yellow:'#FFFF00',navy:'#000080',purple:'#800080',teal:'#008080',silver:'#C0C0C0',maroon:'#800000'};
function colour(v,defs){const s=clean(v).toLowerCase();if(!s||s==='none'||s==='transparent')return null;
 const u=/^url\(#([\w-]+)\)/.exec(s);if(u){const g=defs[u[1]];const st=g&&g.children.find(c=>c.tag==='stop');return st?colour(st.attrs['stop-color']||'#000000',defs):null}
 if(NAMED[s])return NAMED[s];const r=/^rgba?\(\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?/.exec(s);if(r)return '#'+r.slice(1,4).map(x=>Math.max(0,Math.min(255,Math.round(+x))).toString(16).padStart(2,'0')).join('');
 const h=hex(s);return HEX.test(h)?h:s==='currentcolor'?'#000000':null}
const rgb=h=>[1,3,5].map(i=>num(parseInt(h.slice(i,i+2),16)/255)).join(' ');
const cmykOps=(c,stroke)=>c.map(v=>num(v/100)).join(' ')+(stroke?' K':' k');
const mul=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
function transform(t){let M=[1,0,0,1,0,0];const re=/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/gi;let m;
 while((m=re.exec(String(t||'')))){const a=(m[2].match(/-?[\d.]+(?:e-?\d+)?/gi)||[]).map(Number),k=m[1].toLowerCase();let T=[1,0,0,1,0,0];
  if(k==='matrix'&&a.length===6)T=a;else if(k==='translate')T=[1,0,0,1,a[0]||0,a[1]||0];else if(k==='scale')T=[a[0]==null?1:a[0],0,0,a[1]==null?(a[0]==null?1:a[0]):a[1],0,0];
  else if(k==='rotate'){const r=(a[0]||0)*Math.PI/180,c=Math.cos(r),s=Math.sin(r);T=[c,s,-s,c,0,0];if(a.length===3)T=mul(mul([1,0,0,1,a[1],a[2]],T),[1,0,0,1,-a[1],-a[2]])}
  else if(k==='skewx')T=[1,0,Math.tan((a[0]||0)*Math.PI/180),1,0,0];else if(k==='skewy')T=[1,Math.tan((a[0]||0)*Math.PI/180),0,1,0,0];M=mul(M,T)}
 return M}
// SVG arc → cubic Béziers (endpoint parameterisation, F.6 of the SVG spec).
function arcToCubics(x1,y1,rx,ry,phi,fa,fs,x2,y2){if(!rx||!ry)return [[x1,y1,x2,y2,x2,y2]];rx=Math.abs(rx);ry=Math.abs(ry);const p=phi*Math.PI/180,c=Math.cos(p),s=Math.sin(p);
 const dx=(x1-x2)/2,dy=(y1-y2)/2,xp=c*dx+s*dy,yp=-s*dx+c*dy;let l=xp*xp/(rx*rx)+yp*yp/(ry*ry);if(l>1){rx*=Math.sqrt(l);ry*=Math.sqrt(l)}
 const sign=fa===fs?-1:1,num2=rx*rx*ry*ry-rx*rx*yp*yp-ry*ry*xp*xp,co=sign*Math.sqrt(Math.max(0,num2/(rx*rx*yp*yp+ry*ry*xp*xp)));
 const cxp=co*rx*yp/ry,cyp=-co*ry*xp/rx,cx=c*cxp-s*cyp+(x1+x2)/2,cy=s*cxp+c*cyp+(y1+y2)/2;
 const ang=(ux,uy,vx,vy)=>{const a=Math.atan2(ux*vy-uy*vx,ux*vx+uy*vy);return a};let t1=ang(1,0,(xp-cxp)/rx,(yp-cyp)/ry),dt=ang((xp-cxp)/rx,(yp-cyp)/ry,(-xp-cxp)/rx,(-yp-cyp)/ry);
 if(!fs&&dt>0)dt-=2*Math.PI;else if(fs&&dt<0)dt+=2*Math.PI;const n=Math.ceil(Math.abs(dt)/(Math.PI/2)-1e-9)||1,d=dt/n,k=4/3*Math.tan(d/4),out=[];
 const pt=(t)=>[cx+rx*Math.cos(t)*c-ry*Math.sin(t)*s,cy+rx*Math.cos(t)*s+ry*Math.sin(t)*c],dv=(t)=>[-rx*Math.sin(t)*c-ry*Math.cos(t)*s,-rx*Math.sin(t)*s+ry*Math.cos(t)*c];
 for(let i=0;i<n;i++){const a=t1+i*d,b=a+d,[ax,ay]=pt(a),[bx,by]=pt(b),[dax,day]=dv(a),[dbx,dby]=dv(b);out.push([ax+k*dax,ay+k*day,bx-k*dbx,by-k*dby,bx,by])}return out}
function pathOps(d){const t=String(d||'').match(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/g)||[],out=[];let i=0,cmd='',x=0,y=0,sx=0,sy=0,lc=null,lq=null;
 const n=()=>+t[i++],isNum=()=>i<t.length&&!/^[a-z]$/i.test(t[i]),f=v=>num(v);
 while(i<t.length){if(/^[a-z]$/i.test(t[i]))cmd=t[i++];else if(!cmd)break;const rel=cmd===cmd.toLowerCase(),C=cmd.toUpperCase();
  if(C==='Z'){out.push('h');x=sx;y=sy;lc=lq=null;continue}
  if(!isNum())continue;
  if(C==='M'){x=(rel?x:0)+n();y=(rel?y:0)+n();sx=x;sy=y;out.push(f(x)+' '+f(y)+' m');cmd=rel?'l':'L';lc=lq=null}
  else if(C==='L'){x=(rel?x:0)+n();y=(rel?y:0)+n();out.push(f(x)+' '+f(y)+' l');lc=lq=null}
  else if(C==='H'){x=(rel?x:0)+n();out.push(f(x)+' '+f(y)+' l');lc=lq=null}
  else if(C==='V'){y=(rel?y:0)+n();out.push(f(x)+' '+f(y)+' l');lc=lq=null}
  else if(C==='C'||C==='S'){let x1,y1;if(C==='C'){x1=(rel?x:0)+n();y1=(rel?y:0)+n()}else{x1=lc?2*x-lc[0]:x;y1=lc?2*y-lc[1]:y}const x2=(rel?x:0)+n(),y2=(rel?y:0)+n(),ex=(rel?x:0)+n(),ey=(rel?y:0)+n();
   out.push([x1,y1,x2,y2,ex,ey].map(f).join(' ')+' c');lc=[x2,y2];lq=null;x=ex;y=ey}
  else if(C==='Q'||C==='T'){let qx,qy;if(C==='Q'){qx=(rel?x:0)+n();qy=(rel?y:0)+n()}else{qx=lq?2*x-lq[0]:x;qy=lq?2*y-lq[1]:y}const ex=(rel?x:0)+n(),ey=(rel?y:0)+n();
   out.push([x+2/3*(qx-x),y+2/3*(qy-y),ex+2/3*(qx-ex),ey+2/3*(qy-ey),ex,ey].map(f).join(' ')+' c');lq=[qx,qy];lc=null;x=ex;y=ey}
  else if(C==='A'){const rx=n(),ry=n(),ph=n(),fa=n(),fs=n(),ex=(rel?x:0)+n(),ey=(rel?y:0)+n();for(const c of arcToCubics(x,y,rx,ry,ph,!!fa,!!fs,ex,ey))out.push(c.map(f).join(' ')+' c');x=ex;y=ey;lc=lq=null}
  else i++}
 return out}
const K=.5522847498;
function ellipseOps(cx,cy,rx,ry){const f=num;return [f(cx+rx)+' '+f(cy)+' m',[cx+rx,cy+ry*K,cx+rx*K,cy+ry,cx,cy+ry].map(f).join(' ')+' c',[cx-rx*K,cy+ry,cx-rx,cy+ry*K,cx-rx,cy].map(f).join(' ')+' c',
 [cx-rx,cy-ry*K,cx-rx*K,cy-ry,cx,cy-ry].map(f).join(' ')+' c',[cx+rx*K,cy-ry,cx+rx,cy-ry*K,cx+rx,cy].map(f).join(' ')+' c','h']}
function rectOps(x,y,w,h,rx,ry){if(!rx&&!ry)return [[x,y,w,h].map(num).join(' ')+' re'];rx=Math.min(rx||ry,w/2);ry=Math.min(ry||rx,h/2);const f=num,kx=rx*K,ky=ry*K;
 return [f(x+rx)+' '+f(y)+' m',f(x+w-rx)+' '+f(y)+' l',[x+w-rx+kx,y,x+w,y+ry-ky,x+w,y+ry].map(f).join(' ')+' c',f(x+w)+' '+f(y+h-ry)+' l',[x+w,y+h-ry+ky,x+w-rx+kx,y+h,x+w-rx,y+h].map(f).join(' ')+' c',
  f(x+rx)+' '+f(y+h)+' l',[x+rx-kx,y+h,x,y+h-ry+ky,x,y+h-ry].map(f).join(' ')+' c',f(x)+' '+f(y+ry)+' l',[x,y+ry-ky,x+rx-kx,y,x+rx,y].map(f).join(' ')+' c','h']}
const nums=s=>(String(s||'').match(/-?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi)||[]).map(Number);
const len=v=>{const x=parseFloat(v);return isFinite(x)?x:0};
// Whether the logo needs the raster fallback: gradients or clip paths (drawn as their first colour in vectors).
const needsRaster=svg=>/url\(#|clip-path=/i.test(String(svg||''))||/<(lineargradient|radialgradient|clippath)\b/i.test(String(svg||''));
// The logo as PDF operators in its own SVG user space (the caller sets the matrix). gs(alpha) registers an ExtGState.
// o (print PDF): {fill(hex)→ops, stroke(hex)→ops, text(str,bold,size,track)→outline ops at the origin (y up), bg}: colours
// in CMYK, opacity flattened on o.bg (no transparency), texts as outlines.
function svgOps(svg,gs,o){const r=parseSvg(svg);if(!r)return '';const defs={},out=[],X=!!o;
 const fillOp=h=>X?o.fill(h):rgb(h)+' rg',strokeOp=h=>X?o.stroke(h):rgb(h)+' RG';
 (function collect(n){if(n.attrs&&n.attrs.id)defs[n.attrs.id]=n;(n.children||[]).forEach(collect)})(r);
 const INH=['fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-miterlimit','stroke-dasharray','fill-rule','fill-opacity','stroke-opacity','font-family','font-size','font-weight','text-anchor','letter-spacing','dominant-baseline'];
 function walk(n,st){if(n.tag==='#text'||/^(defs|title|desc|lineargradient|radialgradient|stop|clippath|metadata|style|script)$/.test(n.tag))return;
  const s={...st};for(const k of INH)if(n.attrs[k]!=null&&n.attrs[k]!=='inherit')s[k]=n.attrs[k];s.opacity=(st.opacity==null?1:st.opacity)*(n.attrs.opacity!=null?Math.max(0,Math.min(1,+n.attrs.opacity||0)):1);
  const T=n.attrs.transform?transform(n.attrs.transform):null;if(T)out.push('q '+T.map(num).join(' ')+' cm');
  if(n.tag==='g'||n.tag==='svg')n.children.forEach(c=>walk(c,s));else if(n.tag==='text')text(n,s);else shape(n,s);
  if(T)out.push('Q')}
 const flat=(h,a)=>a<1&&X?mixHex(h,o.bg||'#FFFFFF',Math.max(0,a)):h;
 function paint(geom,s,closedOnly){let fill=closedOnly?null:colour(s.fill==null?'#000000':s.fill,defs),stroke=colour(s.stroke,defs);const sw=s['stroke-width']==null?1:len(s['stroke-width']);
  if(!fill&&!(stroke&&sw>0))return;const fa=s.opacity*(s['fill-opacity']!=null?+s['fill-opacity']:1),sa=s.opacity*(s['stroke-opacity']!=null?+s['stroke-opacity']:1);
  if(X){if(fill&&fa<=0)fill=null;if(stroke&&sa<=0)stroke=null;if(!fill&&!(stroke&&sw>0))return}
  out.push('q');if(!X&&(fa<1||sa<1))out.push('/'+gs(fill?fa:1,stroke?sa:1)+' gs');if(fill)out.push(fillOp(flat(fill,fa)));
  if(stroke&&sw>0){out.push(strokeOp(flat(stroke,sa)),num(sw)+' w');const cap={round:1,square:2}[s['stroke-linecap']],join={round:1,bevel:2}[s['stroke-linejoin']];if(cap)out.push(cap+' J');if(join)out.push(join+' j');
   const da=nums(s['stroke-dasharray']).filter(x=>x>=0);if(da.length&&da.some(x=>x>0))out.push('['+da.map(num).join(' ')+'] 0 d')}
  out.push(...geom);const eo=s['fill-rule']==='evenodd';out.push(fill&&stroke&&sw>0?(eo?'B*':'B'):fill?(eo?'f*':'f'):'S');out.push('Q')}
 function shape(n,s){const a=n.attrs;let g=null,open=false;
  if(n.tag==='path')g=pathOps(a.d);else if(n.tag==='rect'){const w=len(a.width),h=len(a.height);if(w>0&&h>0)g=rectOps(len(a.x),len(a.y),w,h,len(a.rx),len(a.ry))}
  else if(n.tag==='circle'){const r=len(a.r);if(r>0)g=ellipseOps(len(a.cx),len(a.cy),r,r)}else if(n.tag==='ellipse'){const rx=len(a.rx),ry=len(a.ry);if(rx>0&&ry>0)g=ellipseOps(len(a.cx),len(a.cy),rx,ry)}
  else if(n.tag==='line'){g=[num(len(a.x1))+' '+num(len(a.y1))+' m',num(len(a.x2))+' '+num(len(a.y2))+' l'];open=true}
  else if(n.tag==='polyline'||n.tag==='polygon'){const p=nums(a.points);if(p.length>=4){g=[];for(let i=0;i+1<p.length;i+=2)g.push(num(p[i])+' '+num(p[i+1])+(i?' l':' m'));if(n.tag==='polygon')g.push('h')}}
  if(g&&g.length)paint(g,s,open)}
 function text(n,s){const str=clean((function all(x){return x.tag==='#text'?x.text:(x.children||[]).map(all).join('')})(n));if(!str)return;
  const fill=colour(s.fill==null?'#000000':s.fill,defs);if(!fill)return;const size=len(s['font-size'])||16,w=String(s['font-weight']||''),bold=/bold|[6-9]00/.test(w),ls=len(s['letter-spacing']);
  let x=nums(n.attrs.x)[0]||0,y=nums(n.attrs.y)[0]||0;x+=nums(n.attrs.dx)[0]||0;y+=nums(n.attrs.dy)[0]||0;
  const tw=textWidth(str,size,bold)+ls*Math.max(0,Array.from(str).length-1);if(s['text-anchor']==='middle')x-=tw/2;else if(s['text-anchor']==='end')x-=tw;
  if(/middle|central/.test(s['dominant-baseline']||''))y+=size*.35;else if(/hanging|text-before-edge/.test(s['dominant-baseline']||''))y+=size*ASCENT;
  const fa=s.opacity*(s['fill-opacity']!=null?+s['fill-opacity']:1);
  if(X){if(fa<=0)return;out.push('q '+fillOp(flat(fill,fa))+' 1 0 0 -1 '+num(x)+' '+num(y)+' cm',o.text(str,bold,size,ls),'Q');return}
  out.push('q'+(fa<1?' /'+gs(fa,1)+' gs':'')+' '+rgb(fill)+' rg BT /'+(bold?'F2':'F1')+' 1 Tf '+(ls?num(ls/size)+' Tc ':'')+[size,0,0,-size,x,y].map(num).join(' ')+' Tm '+hexStr(str)+' Tj ET Q')}
 walk(r,{opacity:1});return out.join('\n')}
// The colours a logo paints with ([{hex, use:'logo'}]), for the ink check.
function svgColours(svg,bg){const seen=new Set(),hit=h=>{seen.add(hex(h));return ''};svgOps(svg,null,{fill:hit,stroke:hit,text:()=>'',bg});return [...seen]}

// ---- text as outlines (print PDF): lib/print-glyphs.js, loaded on demand in the browser ----
function glyphData(){const g=root.RadixPrintGlyphs||(typeof require==='function'&&typeof module==='object'?require('./print-glyphs.js'):null);
 if(!g||!g.UPM)throw Error('Contorni dei caratteri non caricati: ricarica la pagina e riprova.');return g}
let glyphLoad=null;
function loadGlyphs(src='/lib/print-glyphs.js'){if(root.RadixPrintGlyphs)return Promise.resolve(root.RadixPrintGlyphs);if(typeof require==='function'&&typeof module==='object')return Promise.resolve(glyphData());
 if(!glyphLoad)glyphLoad=new Promise((res,rej)=>{const s=dom().createElement('script');s.src=src;s.onload=()=>root.RadixPrintGlyphs?res(root.RadixPrintGlyphs):rej(Error('Contorni dei caratteri non caricati.'));s.onerror=()=>{glyphLoad=null;rej(Error('Contorni dei caratteri non caricati: controlla la connessione.'))};dom().head.append(s)});
 return glyphLoad}
// A glyph path (font units, y up: M L Q Z) → PDF path operators, quadratics as cubics.
function outlineOps(d){const t=String(d||'').match(/[MLQZ]|-?\d+(?:\.\d+)?/g)||[],out=[];let i=0,x=0,y=0;const n=()=>+t[i++];
 while(i<t.length){const c=t[i++];
  if(c==='M'){x=n();y=n();out.push(x+' '+y+' m')}else if(c==='L'){x=n();y=n();out.push(x+' '+y+' l')}
  else if(c==='Q'){const qx=n(),qy=n(),ex=n(),ey=n();out.push([x+2/3*(qx-x),y+2/3*(qy-y),ex+2/3*(qx-ex),ey+2/3*(qy-ey),ex,ey].map(num).join(' ')+' c');x=ex;y=ey}
  else if(c==='Z')out.push('h')}
 return out.join('\n')}

// ---- PDF writer (PDF 1.4, uncompressed content) ----
const hexStr=s=>'<'+codes(s).map(c=>c.toString(16).padStart(2,'0')).join('').toUpperCase()+'>';
const pdfText=s=>'('+codes(s).map(c=>c===40||c===41||c===92?'\\'+String.fromCharCode(c):c<32||c>126?'\\'+c.toString(8).padStart(3,'0'):String.fromCharCode(c)).join('')+')';
function pdfDate(d){const p=n=>String(n).padStart(2,'0');return 'D:'+d.getUTCFullYear()+p(d.getUTCMonth()+1)+p(d.getUTCDate())+p(d.getUTCHours())+p(d.getUTCMinutes())+p(d.getUTCSeconds())+'Z'}
const latin1=s=>{const b=new Uint8Array(s.length);for(let i=0;i<s.length;i++)b[i]=s.charCodeAt(i)&255;return b};
// 16 bytes of FNV-1a over the document's strings, for the trailer /ID (PDF/X wants one).
function docId(parts){let out='';for(const seed of [0x811c9dc5,0x01000193,0x5bd1e995,0x27d4eb2d]){let h=seed>>>0;for(const p of parts){const s=String(p);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0}}out+=h.toString(16).padStart(8,'0')}return out.toUpperCase()}
// doc: layout(); mode 'print' (bleed + marks) or 'web' (trim only).
// RGB writer (default): a logo item may carry raster {w,h,jpeg:Uint8Array} (browser); images {w,h,jpeg} or {w,h,rgb,alpha}.
// pdfx:true (print only): the PDF/X-1a-style file for the print shop: DeviceCMYK colours from inkFor(cmyk settings), text as
// outlines, rasters as {w,h,cmyk} (zlib-compressed 8-bit CMYK, see prepareImages): an RGB raster or an unprepared photo throws.
// Large format (lib/large-format-studio.js): doc.bleed and doc.slug (mm on the PDF page) replace the 3 mm and 6 mm; a page may
// carry eyelets [{x,y,r}] (trim mm, drawn as a circle and a cross in K100 over the artwork) and slugTexts [{s,x,y,size,bold}]
// (mm on the MediaBox, origin top-left, baseline y: notes in the slug, K100).
function pdf(doc,{mode='print',date=new Date(),title,producer,pdfx=false,cmyk:settings={}}={}){// title/producer: other studios' own document info (lib/brand-package.js)
 const print=mode!=='web',X=print&&!!pdfx,bl=print?(doc.bleed!=null?doc.bleed:BLEED):0,slugMm=doc.slug!=null?doc.slug:SLUG,objs=[],alpha={};
 const add=o=>{objs.push(o);return objs.length};const ref=n=>n+' 0 R';
 const catalog=add(null),pages=add(null),f1=X?0:add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),f2=X?0:add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
 const gs=(ca,CA)=>{if(X)throw Error('Trasparenza non ammessa nel PDF per la tipografia.');const k='GS'+Math.round(ca*100)+'_'+Math.round(CA*100);if(!alpha[k])alpha[k]=add('<< /Type /ExtGState /ca '+num(ca)+' /CA '+num(CA)+' >>');return k};
 const kids=[],G=X?glyphData():null,glyphObj={};
 // One Form XObject per glyph used, in em units (/Matrix 1/UPM): placed with «size 0 0 size x y cm», painted in the current colour.
 const glyph=(bold,c)=>{const set=bold?G.B:G.R,code=set[c]?c:63,k=(bold?'B':'R')+code;
  if(!glyphObj[k]){const d=outlineOps(set[code][1]||'')+(set[code][1]?'\nf':'');
   glyphObj[k]=add({dict:'<< /Type /XObject /Subtype /Form /BBox [-2048 -2048 6144 4096] /Matrix ['+(1/G.UPM)+' 0 0 '+(1/G.UPM)+' 0 0] /Resources << >> /Length '+d.length+' >>',stream:d})}
  return k};
 // A row of glyphs from the origin (baseline, y up); `used` collects the XObject names for the page resources.
 const run=(s,bold,size,track,used)=>{let x=0;const out=[];for(const c of codes(s)){if(c!==32&&c!==160){const k=glyph(bold,c);used.add(k);out.push('q '+num(size)+' 0 0 '+num(size)+' '+num(x)+' 0 cm /'+k+' Do Q')}x+=advance(c,bold)*size/1000+(track||0)}return out.join(' ')};
 const fillOf=(h,use)=>X?cmykOps(inkFor(h,use,settings)):rgb(h)+' rg',strokeOf=(h,use)=>X?cmykOps(inkFor(h,use,settings),true):rgb(h)+' RG';
 // A raster: {w,h,jpeg} (opaque JPEG), {w,h,rgb,alpha} (zlib-compressed 8-bit RGB and its alpha as a soft mask, e.g. the
 // wordmark of a logo set in its web font over vector shapes: lib/brand-package.js) or {w,h,cmyk} (print PDF).
 const image=d=>{const head=cs=>'<< /Type /XObject /Subtype /Image /Width '+d.w+' /Height '+d.h+' /ColorSpace /'+cs+' /BitsPerComponent 8 ';
  if(X){if(!d.cmyk)throw Error('Immagine in RGB nel PDF per la tipografia: va convertita in CMYK (prepareImages).');return add({dict:head('DeviceCMYK')+'/Filter /FlateDecode /Length '+d.cmyk.length+' >>',stream:d.cmyk})}
  if(d.jpeg)return add({dict:head('DeviceRGB')+'/Filter /DCTDecode /Length '+d.jpeg.length+' >>',stream:d.jpeg});
  const mask=d.alpha?add({dict:head('DeviceGray')+'/Filter /FlateDecode /Length '+d.alpha.length+' >>',stream:d.alpha}):0;
  return add({dict:head('DeviceRGB')+'/Filter /FlateDecode'+(mask?' /SMask '+ref(mask):'')+' /Length '+d.rgb.length+' >>',stream:d.rgb})};
 for(const p of doc.pages){const sl=print?slugMm:0,o=bl+sl,W=p.w+2*o,H=p.h+2*o,Xp=x=>num((x+o)*MM),Y=y=>num((H-(y+o))*MM),ops=[],images={},used=new Set();
  ops.push('q '+num(sl*MM)+' '+num(sl*MM)+' '+num((p.w+2*bl)*MM)+' '+num((p.h+2*bl)*MM)+' re W n');// artwork up to the bleed edge only
  // rot 180: the same box, upside down (the back face of a table tent).
  const placeImage=(it)=>{const name='Im'+(Object.keys(images).length+1);images[name]=image(it.raster);ops.push(it.rot===180?'q '+num(-it.w*MM)+' 0 0 '+num(-it.h*MM)+' '+Xp(it.x+it.w)+' '+Y(it.y)+' cm /'+name+' Do Q':'q '+num(it.w*MM)+' 0 0 '+num(it.h*MM)+' '+Xp(it.x)+' '+Y(it.y+it.h)+' cm /'+name+' Do Q')};
  for(const it of p.items){
   if(it.t==='rect')ops.push(fillOf(it.fill,it.w*it.h>=AREA_MIN?'area':'small')+' '+Xp(it.x)+' '+Y(it.y+it.h)+' '+num(it.w*MM)+' '+num(it.h*MM)+' re f');
   else if(it.t==='line'){const seg=strokeOf(it.stroke,'line')+' '+num(it.width)+' w '+Xp(it.x1)+' '+Y(it.y1)+' m '+Xp(it.x2)+' '+Y(it.y2)+' l S';// dash: [on, off] in pt (die lines, creases)
    ops.push(Array.isArray(it.dash)&&it.dash.length===2?'q ['+it.dash.map(num).join(' ')+'] 0 d '+seg+' Q':seg)}
   else if(it.t==='path'){const g=pathOps(it.d),sw=!!(it.stroke&&it.width>0);if(!g.length||!it.fill&&!sw)continue;// a shape in mm (round labels, die lines, curved flaps): SVG path syntax on the trim, width and dash in pt
    ops.push('q '+[MM,0,0,-MM,o*MM,(H-o)*MM].map(num).join(' ')+' cm'+(it.fill?' '+fillOf(it.fill,it.big?'area':'small'):'')+(sw?' '+strokeOf(it.stroke,'line')+' '+num(it.width/MM)+' w'+(Array.isArray(it.dash)&&it.dash.length===2?' ['+it.dash.map(d=>num(d/MM)).join(' ')+'] 0 d':''):''),g.join(' ')+' '+(it.fill&&sw?'B':it.fill?(it.evenodd?'f*':'f'):'S')+' Q')}
   else if(it.t==='text'){const r=it.rot===180;if(X)ops.push('q '+fillOf(it.fill,'text')+(r?' -1 0 0 -1 ':' 1 0 0 1 ')+Xp(it.x)+' '+Y(it.y)+' cm '+run(it.s,it.bold,it.size,it.track||0,used)+' Q');
    else ops.push('BT /'+(it.bold?'F2':'F1')+' '+num(it.size)+' Tf '+(it.track?num(it.track)+' Tc ':'')+rgb(it.fill)+' rg '+(r?'-1 0 0 -1 '+Xp(it.x)+' '+Y(it.y)+' Tm ':Xp(it.x)+' '+Y(it.y)+' Td ')+hexStr(it.s)+' Tj '+(it.track?'0 Tc ':'')+'ET')}// track: letter spacing in pt; rot 180: upside down from (x, y)
   else if(it.t==='image'){if(it.raster)placeImage(it);// a photo (lib/catalog-studio.js, the poster photo): at its placed size; none = the layout drew a placeholder
    else if(X&&it.photo)throw Error('Foto non preparata per la stampa (prepareImages).')}
   else if(it.t==='logo'){if(it.raster)placeImage(it);
    else{const [vx,vy,vw,vh]=it.vb,k=it.w/vw*MM,ky=it.h/vh*MM,body=X?svgOps(it.svg,null,{fill:h=>fillOf(h,'logo'),stroke:h=>strokeOf(h,'logo'),text:(s,b,size,ls)=>run(s,b,size,ls,used),bg:it.bg}):svgOps(it.svg,gs);
     ops.push('q '+(it.rot===180?[-k,0,0,ky,(it.x+o+it.w)*MM+vx*k,(H-(it.y+it.h+o))*MM-vy*ky]:[k,0,0,-ky,(it.x+o)*MM-vx*k,(H-(it.y+o))*MM+vy*ky]).map(num).join(' ')+' cm '+(X?cmykOps(PURE_K):'0 0 0 rg'),'% logo',body,'Q')}}}
  ops.push('Q');
  if(print)for(const mk of marks(p,bl,sl))ops.push('q '+(X?cmykOps(REGISTRATION,true):'0 0 0 RG')+' 0.25 w '+(mk.kind==='fold'?'[2 1] 0 d ':'')+Xp(mk.x1-o)+' '+Y(mk.y1-o)+' m '+Xp(mk.x2-o)+' '+Y(mk.y2-o)+' l S Q');
  for(const e of print&&p.eyelets||[]){const cx=(e.x+o)*MM,cy=(H-(e.y+o))*MM,r=e.r*MM;
   ops.push('q '+(X?cmykOps(PURE_K,true):'0 0 0 RG')+' 0.5 w '+ellipseOps(cx,cy,r,r).join(' ')+' S '+num(cx-r*1.5)+' '+num(cy)+' m '+num(cx+r*1.5)+' '+num(cy)+' l S '+num(cx)+' '+num(cy-r*1.5)+' m '+num(cx)+' '+num(cy+r*1.5)+' l S Q')}
  for(const t of print&&p.slugTexts||[]){const tx=num(t.x*MM),ty=num((H-t.y)*MM);
   if(X)ops.push('q '+cmykOps(PURE_K)+' 1 0 0 1 '+tx+' '+ty+' cm '+run(t.s,!!t.bold,t.size,0,used)+' Q');
   else ops.push('BT /'+(t.bold?'F2':'F1')+' '+num(t.size)+' Tf 0 0 0 rg '+tx+' '+ty+' Td '+hexStr(t.s)+' Tj ET')}
  const content=ops.join('\n'),c=add({dict:'<< /Length '+content.length+' >>',stream:content});
  const gsDict=Object.keys(alpha).length?' /ExtGState << '+Object.entries(alpha).map(([k,n])=>'/'+k+' '+ref(n)).join(' ')+' >>':'',xobj=Object.entries(images).map(([k,n])=>'/'+k+' '+ref(n)).concat([...used].sort().map(k=>'/'+k+' '+ref(glyphObj[k]))),xo=xobj.length?' /XObject << '+xobj.join(' ')+' >>':'';
  const r4=(a,b,c,d)=>'['+[a,b,c,d].map(v=>num(v*MM)).join(' ')+']',box=r4(0,0,W,H),bleed=r4(sl,sl,sl+p.w+2*bl,sl+p.h+2*bl),trim=r4(o,o,o+p.w,o+p.h);
  kids.push(add('<< /Type /Page /Parent '+ref(pages)+' /MediaBox '+box+' /BleedBox '+bleed+' /TrimBox '+trim+' /Resources << '+(X?'':'/Font << /F1 '+ref(f1)+' /F2 '+ref(f2)+' >>')+gsDict+xo+' >> /Contents '+ref(c)+' >>'))}
 const intent=X?add('<< /Type /OutputIntent /S /GTS_PDFX /OutputConditionIdentifier '+pdfText(OUTPUT_INTENT.id)+' /OutputCondition '+pdfText(OUTPUT_INTENT.condition)+' /RegistryName '+pdfText(OUTPUT_INTENT.registry)+' /Info '+pdfText(OUTPUT_INTENT.condition)+' >>'):0;
 objs[catalog-1]='<< /Type /Catalog /Pages '+ref(pages)+(X?' /OutputIntents ['+ref(intent)+']':'')+' >>';objs[pages-1]='<< /Type /Pages /Kids ['+kids.map(ref).join(' ')+'] /Count '+kids.length+' >>';
 const when=pdfDate(date),docTitle=title!=null?title:doc.title+(print?' · tipografia':' · web');
 const info=add('<< /Title '+pdfText(docTitle)+' /Producer '+pdfText(producer||'RADIX Studio Stampa')+' /Creator (RADIX) /CreationDate ('+when+')'+(X?' /ModDate ('+when+') /Trapped /False /GTS_PDFXVersion '+pdfText(PDFX.version)+' /GTS_PDFXConformance '+pdfText(PDFX.conformance):'')+' >>');
 const id=X?docId([docTitle,when,objs.length,...objs.map(o=>o&&o.stream!=null?o.dict+o.stream.length:String(o))]):'';
 const chunks=[],offsets=[];let pos=0;const push=x=>{const b=typeof x==='string'?latin1(x):x;chunks.push(b);pos+=b.length};
 push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
 objs.forEach((o,i)=>{offsets.push(pos);if(o&&o.stream!=null){push((i+1)+' 0 obj\n'+o.dict+'\nstream\n');push(o.stream);push('\nendstream\nendobj\n')}else push((i+1)+' 0 obj\n'+o+'\nendobj\n')});
 const xref=pos;push('xref\n0 '+(objs.length+1)+'\n0000000000 65535 f \n'+offsets.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join(''));
 push('trailer\n<< /Size '+(objs.length+1)+' /Root '+ref(catalog)+' /Info '+ref(info)+(X?' /ID [<'+id+'> <'+id+'>]':'')+' >>\nstartxref\n'+xref+'\n%%EOF\n');
 const out=new Uint8Array(pos);let o=0;for(const c of chunks){out.set(c,o);o+=c.length}return out}

// ---- prepress checks ----
// Every colour the print PDF will use, as CMYK, with its total ink (images: the highest of their pixels).
function inkReport(doc,settings={}){const map=new Map(),put=(h,use,where)=>{const c=inkFor(h,use,settings),k=hex(h)+'|'+use+'|'+c.join(',');if(!map.has(k))map.set(k,{hex:hex(h),use,cmyk:c,tac:tac(c),where})};
 for(const p of doc.pages)for(const it of p.items){
  if(it.t==='rect')put(it.fill,it.w*it.h>=AREA_MIN?'area':'small',p.label);else if(it.t==='line')put(it.stroke,'line',p.label);
  else if(it.t==='path'){if(it.fill)put(it.fill,it.big?'area':'small',p.label);if(it.stroke&&it.width>0)put(it.stroke,'line',p.label)}else if(it.t==='text')put(it.fill,'text',p.label);
  else if(it.t==='logo'&&!it.raster)for(const h of svgColours(it.svg,it.bg))put(h,'logo',p.label)}
 const list=[...map.values()];
 for(const p of doc.pages)for(const it of p.items)if(it.raster&&it.raster.cmyk&&it.raster.tac!=null)list.push({hex:'',use:'image',cmyk:null,tac:it.raster.tac,where:p.label,label:it.label});
 const max=list.reduce((a,x)=>Math.max(a,x.tac),0);return {list,max,ok:max<=INK_LIMIT+1e-9,limit:INK_LIMIT}}
// The checklist before «Scarica PDF per la tipografia»: every item must be green.
function preflight(doc,settings={}){const checks=[],f=need(doc.format),hid=f.hidden&&f.hidden.bottom;
 const bp=bleedProblems(doc);checks.push({id:'bleed',label:'Abbondanza '+BLEED+' mm',ok:!bp.length,detail:bp.length?bp.join(' '):'Fondi e foto arrivano a '+BLEED+' mm oltre il taglio; segni di taglio'+(f.panels?' e di piega':'')+' fuori dall’abbondanza.'});
 const sw=doc.warnings.filter(w=>w.kind==='safe'||w.kind==='overflow');
 checks.push({id:'safe',label:'Area sicura',ok:!sw.length,detail:sw.length?sw.map(w=>w.text).join(' '):'Testi e logo ad almeno '+SAFE+' mm dal taglio'+(f.panels?' e dalle pieghe':'')+(hid?' e fuori dai '+hid+' mm della base':'')+'; tutti i testi entrano.'});
 const rgbImg=doc.pages.some(p=>p.items.some(it=>(it.t==='image'||it.t==='logo')&&it.raster&&!it.raster.cmyk&&!it.src&&!(it.t==='logo'&&it.svg)));
 checks.push({id:'cmyk',label:'Solo CMYK',ok:!rgbImg,detail:rgbImg?'C’è un’immagine in RGB che non posso convertire: caricala di nuovo.':'Colori in CMYK (FOGRA39), nessun RGB, nessuna trasparenza: le foto e i loghi raster sono convertiti al download.'});
 const ink=inkReport(doc,settings),over=ink.list.filter(x=>x.tac>INK_LIMIT);
 checks.push({id:'ink',label:'Inchiostro totale ≤ '+INK_LIMIT+'%',ok:ink.ok,detail:ink.ok?'Massimo '+Math.round(ink.max)+'%.':'Troppo inchiostro: '+over.map(x=>(x.hex||x.label||'immagine')+' '+Math.round(x.tac)+'%').join(', ')+'. Abbassa i valori CMYK (massimo '+INK_LIMIT+'%).'});
 const imgs=imagesReport(doc),low=imgs.filter(x=>!x.ok),needDpi=doc.dpi||DPI;
 checks.push({id:'dpi',label:'Immagini ≥ '+needDpi+' dpi',ok:!low.length,detail:!imgs.length?'Nessuna immagine raster: tutto vettoriale.':low.length?low.map(x=>'«'+x.label+'» ('+x.page+') a '+x.dpi+' dpi alla misura di stampa: servono almeno '+x.need+' dpi. Usa una foto più grande o togli la foto.').join(' '):imgs.map(x=>'«'+x.label+'» '+x.dpi+' dpi').join(', ')+' alla misura di stampa.'});
 const gw=doc.warnings.filter(w=>w.kind==='glyph');
 checks.push({id:'fonts',label:'Font',ok:!gw.length,detail:gw.length?gw.map(w=>w.text).join(' '):'Testi convertiti in tracciati vettoriali: nessun font da incorporare.'});
 return {ok:checks.every(c=>c.ok),checks}}
// Re-reads the bytes of a print PDF: the structure PDF/X-1a asks for, no RGB, no font, no transparency, ink ≤ 300 %.
// Returns the list of problems (empty = good).
// Bytes → a latin-1 string (TextDecoder when there is one: fast on large files).
function latin1Text(bytes){const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);if(typeof root.TextDecoder==='function'){try{return new root.TextDecoder('latin1').decode(b)}catch(e){/* below */}}
 let s='';for(let i=0;i<b.length;i+=32768)s+=String.fromCharCode.apply(null,b.subarray(i,i+32768));return s}
function checkPdf(bytes){const s=typeof bytes==='string'?bytes:latin1Text(bytes),out=[];
 if(!/^%PDF-1\.[34]\n/.test(s))out.push('Intestazione PDF mancante.');
 const intent=/\/Type \/OutputIntent \/S \/GTS_PDFX \/OutputConditionIdentifier \(([^)]*)\)/.exec(s);if(!intent)out.push('Manca l’OutputIntent GTS_PDFX.');
 if(!/\/Catalog [^\n]*\/OutputIntents \[\d+ 0 R\]/.test(s))out.push('Il catalogo non punta all’OutputIntent.');
 if(!/\/GTS_PDFXVersion \(PDF\/X-1(a)?:20\d\d\)/.test(s))out.push('Manca /GTS_PDFXVersion nelle informazioni del documento.');
 if(!/\/Trapped \/False/.test(s))out.push('Manca /Trapped /False.');
 if(!/trailer\n<<[^\n]*\/ID \[<[0-9A-F]{32}> <[0-9A-F]{32}>\]/.test(s))out.push('Manca l’/ID del documento.');
 const pages=s.match(/\/Type \/Page \/Parent [^\n]*/g)||[];if(!pages.length)out.push('Nessuna pagina.');
 pages.forEach((p,i)=>{const box=k=>{const m=new RegExp('/'+k+' \\[([^\\]]+)\\]').exec(p);return m?m[1].split(' ').map(Number):null},M=box('MediaBox'),B=box('BleedBox'),T=box('TrimBox');
  if(!B||!T){out.push('Pagina '+(i+1)+': mancano TrimBox o BleedBox.');return}
  const inside=(a,b)=>a[0]>=b[0]-1e-6&&a[1]>=b[1]-1e-6&&a[2]<=b[2]+1e-6&&a[3]<=b[3]+1e-6;if(!inside(T,B)||!inside(B,M))out.push('Pagina '+(i+1)+': TrimBox dentro BleedBox dentro MediaBox non rispettato.')});
 if(/\/DeviceRGB|\/CalRGB|\/ICCBased/.test(s))out.push('C’è uno spazio colore RGB.');
 if(/\/Font\b|\/FontFile/.test(s))out.push('C’è un font: nel PDF per la tipografia i testi devono essere tracciati.');
 if(/\/SMask|\/ExtGState|\/Group\s*<</.test(s))out.push('C’è una trasparenza.');
 if(/\/Encrypt|\/JavaScript|\/Annots/.test(s))out.push('Contenuti non ammessi (cifratura, JavaScript o annotazioni).');
 let maxInk=0;const re=/<<([^\n]*?)\/Length (\d+) >>\nstream\n/g;let m;
 while((m=re.exec(s))){const dict=m[1],body=s.substr(re.lastIndex,+m[2]);if(/\/Subtype \/Image/.test(dict))continue;
  if(/(^|[\s\]])(rg|RG|g|G|sc|SC|scn|SCN|cs|CS)(?=\s|$)/m.test(body))out.push('Colore non CMYK in un flusso di contenuto.');
  for(const k of body.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) (k|K)(?=\s|$)/g)){const v=k.slice(1,5).map(Number);if(k[5]==='K'&&v.every(x=>x===1))continue;maxInk=Math.max(maxInk,Math.round(v.reduce((a,x)=>a+x,0)*100))}}
 if(maxInk>INK_LIMIT)out.push('Inchiostro totale al '+maxInk+'%: il limite è '+INK_LIMIT+'%.');
 return [...new Set(out)]}

// ---- images: CMYK conversion (pure) and preparation (browser) ----
// RGBA pixels → 8-bit CMYK (the plain formula), alpha flattened on bg; tac: the highest total ink of the pixels, %.
function rgbaToCmyk(data,bg='#FFFFFF'){const [br,bgc,bb]=rgbOf(bg),n=data.length>>2,out=new Uint8Array(n*4);let max=0;
 for(let i=0;i<n;i++){const a=data[4*i+3]/255,r=(data[4*i]*a+br*(1-a))/255,g=(data[4*i+1]*a+bgc*(1-a))/255,b=(data[4*i+2]*a+bb*(1-a))/255,k=1-Math.max(r,g,b);
  let c=0,m=0,y=0;if(k<.9999){c=(1-r-k)/(1-k);m=(1-g-k)/(1-k);y=(1-b-k)/(1-k)}
  const C=Math.round(c*255),M=Math.round(m*255),Y=Math.round(y*255),Kk=Math.round(k*255);out[4*i]=C;out[4*i+1]=M;out[4*i+2]=Y;out[4*i+3]=Kk;const t=C+M+Y+Kk;if(t>max)max=t}
 return {data:out,tac:Math.round(max/255*1000)/10}}
async function deflate(bytes){if(typeof root.CompressionStream==='function'){const r=new root.Response(new root.Blob([bytes]).stream().pipeThrough(new root.CompressionStream('deflate')));return new Uint8Array(await r.arrayBuffer())}
 if(typeof require==='function')return new Uint8Array(require('zlib').deflateSync(bytes));throw Error('Compressione non disponibile in questo browser.')}
// A CMYK raster for the print PDF from RGBA pixels.
async function cmykRaster(rgba,w,h,bg,extra={}){const c=rgbaToCmyk(rgba,bg);return {w,h,cmyk:await deflate(c.data),tac:c.tac,...extra}}
const MAX_PX=64e6;
// Photos cropped to their box (cover) and resampled to at most the dpi the format needs (never upsampled); for the print PDF
// converted to CMYK and Flate-compressed, for the web PDF JPEG. Raster logos (gradients) too. Browser only (canvas).
async function prepareImages(doc,{pdfx=false}={}){const cap=doc.dpi||DPI;
 for(const p of doc.pages)for(const it of p.items){
  if(it.t==='image'&&it.photo&&it.src){const img=new root.Image();img.src=it.src;await img.decode();const pw=img.naturalWidth,ph=img.naturalHeight,s=Math.max(it.w/pw,it.h/ph),cw=it.w/s,ch=it.h/s;
   let tw=Math.max(1,Math.round(Math.min(cw,it.w/25.4*cap))),th=Math.max(1,Math.round(Math.min(ch,it.h/25.4*cap)));if(tw*th>MAX_PX){const k=Math.sqrt(MAX_PX/(tw*th));tw=Math.round(tw*k);th=Math.round(th*k)}
   const c=dom().createElement('canvas');c.width=tw;c.height=th;const x=c.getContext('2d');x.fillStyle=it.bg||'#FFFFFF';x.fillRect(0,0,tw,th);x.drawImage(img,(pw-cw)/2,(ph-ch)/2,cw,ch,0,0,tw,th);
   const dpi=Math.round(Math.min(tw/(it.w/25.4),th/(it.h/25.4)));
   if(pdfx)it.raster=await cmykRaster(x.getImageData(0,0,tw,th).data,tw,th,it.bg,{dpi});
   else{const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.9));it.raster={w:tw,h:th,jpeg:new Uint8Array(await blob.arrayBuffer()),dpi}}}}
 return rasterize(doc,{pdfx})}
// Logos with gradients or clip paths → 300 dpi raster on the colour behind them (browser canvas): JPEG, or CMYK for the print PDF.
async function rasterize(doc,{pdfx=false}={}){for(const p of doc.pages)for(const it of p.items){if(it.t!=='logo'||!needsRaster(it.svg))continue;
 const w=Math.max(1,Math.round(it.w/25.4*DPI)),h=Math.max(1,Math.round(it.h/25.4*DPI)),img=new root.Image();img.src=svgUrl(it.svg);await img.decode();
 const c=dom().createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle=it.bg||'#FFFFFF';x.fillRect(0,0,w,h);x.drawImage(img,0,0,w,h);
 if(pdfx){it.raster=await cmykRaster(x.getImageData(0,0,w,h).data,w,h,it.bg);continue}
 const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.92));it.raster={w,h,jpeg:new Uint8Array(await blob.arrayBuffer())}}
 return doc}

// ---- SVG preview (same items; Helvetica-compatible fonts) ----
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const svgUrl=svg=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
// guides: bleed shown greyed, trim line, safe area (dashed), folds, the roll-up base.
let clipId=0;
function previewSvg(doc,pageIndex,{guides=true,safe=SAFE}={}){const p=doc.pages[pageIndex],bl=guides?BLEED:0,W=p.w+2*bl,H=p.h+2*bl,o=[];
 o.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+[-bl,-bl,W,H].map(num).join(' ')+'" width="'+num(W)+'mm" height="'+num(H)+'mm" role="img" aria-label="'+esc(p.label)+'">');
 const cid='pr-trim-'+(++clipId);if(!guides)o.push('<defs><clipPath id="'+cid+'"><rect x="0" y="0" width="'+num(p.w)+'" height="'+num(p.h)+'"/></clipPath></defs><g clip-path="url(#'+cid+')">');else o.push('<g>');
 for(const it of p.items)o.push(itemSvg(it));
 o.push('</g>');
 if(guides){o.push('<path fill="#ffffff" fill-opacity=".55" fill-rule="evenodd" d="M'+-bl+' '+-bl+'h'+W+'v'+H+'h'+-W+'z M0 0v'+p.h+'h'+p.w+'v'+-p.h+'z"/>');
  o.push('<rect x="0" y="0" width="'+num(p.w)+'" height="'+num(p.h)+'" fill="none" stroke="#e5484d" stroke-width="'+num(Math.max(.25,p.w/600))+'"/>');
  const hid=p.hidden&&p.hidden.bottom||0,sw=num(Math.max(.2,p.w/700)),dash=Math.max(1,p.w/150);
  const areas=p.folds.length?[0,...p.folds,p.w].slice(0,-1).map((x,i,a)=>[x,(p.folds[i]!=null?p.folds[i]:p.w)-x]):[[0,p.w]];
  const fy=p.foldsY||[],rows=fy.length?[0,...fy,p.h-hid].slice(0,-1).map((y,i)=>[y,(fy[i]!=null?fy[i]:p.h-hid)-y]):[[0,p.h-hid]];// horizontal folds: one safe area per panel
  for(const [x,w] of areas)for(const [y,h] of rows)o.push('<rect x="'+num(x+safe)+'" y="'+num(y+safe)+'" width="'+num(w-2*safe)+'" height="'+num(h-2*safe)+'" fill="none" stroke="#2f80ed" stroke-width="'+sw+'" stroke-dasharray="'+num(dash)+' '+num(dash*.8)+'"/>');
  for(const f of p.folds)o.push('<line x1="'+num(f)+'" y1="'+-bl+'" x2="'+num(f)+'" y2="'+num(p.h+bl)+'" stroke="#8a8f98" stroke-width=".25" stroke-dasharray="2 1.2"/>');
  for(const f of fy)o.push('<line x1="'+-bl+'" y1="'+num(f)+'" x2="'+num(p.w+bl)+'" y2="'+num(f)+'" stroke="#8a8f98" stroke-width=".25" stroke-dasharray="2 1.2"/>');
  if(hid){o.push('<rect x="0" y="'+num(p.h-hid)+'" width="'+num(p.w)+'" height="'+num(hid)+'" fill="#e5484d" fill-opacity=".18" stroke="#e5484d" stroke-width="'+sw+'" stroke-dasharray="'+num(dash)+' '+num(dash*.8)+'"/>');
   o.push('<text x="'+num(p.w/2)+'" y="'+num(p.h-hid/2+6)+'" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="#b42318">Base: '+hid+' mm non visibili</text>')}}
 o.push('</svg>');return o.join('')}
// One layout item as SVG markup (mm units), the same drawing as the PDF: lib/packaging-studio.js builds its own previews with it.
function itemSvg(it){
 {if(it.t==='rect')return '<rect x="'+num(it.x)+'" y="'+num(it.y)+'" width="'+num(it.w)+'" height="'+num(it.h)+'" fill="'+it.fill+'"/>';
  if(it.t==='path')return '<path d="'+esc(it.d)+'" fill="'+(it.fill||'none')+'"'+(it.evenodd?' fill-rule="evenodd"':'')+(it.stroke&&it.width>0?' stroke="'+it.stroke+'" stroke-width="'+num(ptToMm(it.width))+'"'+(Array.isArray(it.dash)&&it.dash.length===2?' stroke-dasharray="'+it.dash.map(d=>num(ptToMm(d))).join(' ')+'"':''):'')+'/>';
  if(it.t==='line')return ('<line x1="'+num(it.x1)+'" y1="'+num(it.y1)+'" x2="'+num(it.x2)+'" y2="'+num(it.y2)+'" stroke="'+it.stroke+'" stroke-width="'+num(ptToMm(it.width))+'"'+(Array.isArray(it.dash)&&it.dash.length===2?' stroke-dasharray="'+it.dash.map(d=>num(ptToMm(d))).join(' ')+'"':'')+'/>');
  if(it.t==='text')return ('<text x="'+num(it.x)+'" y="'+num(it.y)+'" font-family="Helvetica, Arial, \'Liberation Sans\', sans-serif" font-size="'+num(ptToMm(it.size))+'"'+(it.bold?' font-weight="700"':'')+' fill="'+it.fill+'"'+(it.rot===180?' transform="rotate(180 '+num(it.x)+' '+num(it.y)+')"':'')+' xml:space="preserve">'+esc(it.s)+'</text>');
  if(it.t==='image'&&it.src)return ('<image x="'+num(it.x)+'" y="'+num(it.y)+'" width="'+num(it.w)+'" height="'+num(it.h)+'" preserveAspectRatio="'+(it.photo?'xMidYMid slice':'none')+'" href="'+esc(it.src)+'"/>');
  if(it.t==='logo')return ('<image x="'+num(it.x)+'" y="'+num(it.y)+'" width="'+num(it.w)+'" height="'+num(it.h)+'" preserveAspectRatio="none"'+(it.rot===180?' transform="rotate(180 '+num(it.x+it.w/2)+' '+num(it.y+it.h/2)+')"':'')+' href="'+esc(svgUrl(it.svg))+'"/>');
 return ''}}

// ---- saved in the project ----
const slug=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50);
const filename=(doc,mode)=>'stampa-'+doc.format+'-'+(slug(doc.values.name)||'progetto')+'-'+(mode==='web'?'web':'tipografia')+'.pdf';
const ROLE_LABEL={primary:'Primario',secondary:'Secondario',accent:'Accento',dark:'Neutro scuro',light:'Neutro chiaro'};
// The print notes. Other studios (lib/catalog-studio.js) write RGB PDFs with Helvetica and keep their own wording.
function notes(doc){const b=doc.brand,ours=!!format(doc.format),fonts=b.fonts.heading?' (i font del kit, '+[...new Set([b.fonts.heading,b.fonts.body].filter(Boolean))].join(' e ')+', non si possono incorporare da qui)':'';
 const out=ours?['PDF per la tipografia in CMYK, '+PDFX.label+': profilo di destinazione '+OUTPUT_INTENT.id+' «'+OUTPUT_INTENT.condition+'» indicato per nome (nessun profilo ICC incorporato). Prima di stampare la tipografia deve fare il suo preflight.',
   'I valori CMYK nascono da una conversione semplice, senza profilo ICC: correggili nei campi CMYK se la tipografia o il brand book ne indicano altri. Per i colori che contano chiedi una prova colore.',
   'Testi convertiti in tracciati vettoriali con un carattere tipo Helvetica'+fonts+': nessun font da incorporare. Il PDF per il web resta in RGB con il testo in Helvetica.']
  :['Colori in RGB: la tipografia li converte in CMYK, quindi possono cambiare un poco (soprattutto i colori molto accesi). Chiedi una prova colore se conta.',
   'Testo in Helvetica, uno dei font standard del PDF (non incorporato)'+(b.fonts.heading?': i font del kit ('+[...new Set([b.fonts.heading,b.fonts.body].filter(Boolean))].join(' e ')+') non si possono incorporare da qui':'')+'. Se la tipografia vuole tutti i font incorporati, fai rifinire il file da un grafico.'];
 const logo=doc.pages.flatMap(p=>p.items).find(i=>i.t==='logo');
 out.push(!logo?'Nessun logo nel kit: al suo posto c’è il nome come logotipo.':needsRaster(logo.svg)?'Il logo usa sfumature o maschere: nel PDF è un’immagine a '+DPI+' dpi.':'Logo vettoriale'+(ours?' (le sue scritte diventano tracciati).':' (le scritte del logo sono in Helvetica).'));
 const f=format(doc.format);
 if(f&&f.hidden)out.push('Roll-up: gli ultimi '+f.hidden.bottom+' mm in basso entrano nella base e non si vedono, lì c’è solo lo sfondo. Per il grande formato le foto bastano a '+f.dpi+' dpi alla misura reale: chiedi conferma alla tipografia.');
 if(f&&f.panels)out.push('Pieghevole a rullo: l’anta che si chiude dentro è di '+f.panels[0][0]+' mm, le altre di '+f.panels[0][1]+' mm; i segni di piega sono tratteggiati fuori dall’abbondanza.');
 if(!b.fromKit)out.push('Nessun kit identità nel progetto: colori neutri. Crea il Kit identità per usare i colori del brand.');return out}
function toMarkdown(doc,{date,cmyk:settings={}}={}){const f=need(doc.format),day=date||new Date().toISOString().slice(0,10),L=['# Stampa · '+doc.title,''],vt=VARIANTS.find(x=>x.id===doc.variant);
 L.push('Formato: '+f.title+' · '+f.size+' · layout '+(vt?vt.title:'Classico')+' · PDF per la tipografia: formato + '+BLEED+' mm di abbondanza per lato ('+mmText(f.w+2*BLEED)+' × '+mmText(f.h+2*BLEED)+' mm), segni di taglio fuori dall’abbondanza (pagina '+mmText(f.w+2*(BLEED+SLUG))+' × '+mmText(f.h+2*(BLEED+SLUG))+' mm), '+PDFX.label+' · margine '+mmText(doc.margin)+' mm · '+day,'');
 L.push('## Testi','');for(const k of f.fields){const v=block(doc.values[k]);if(v)L.push('- **'+FIELDS[k].label+'**: '+v.replace(/\n+/g,' / '))}
 L.push('','## Colori (HEX e CMYK)','',...paletteInks(doc.brand.palette,settings).map(c=>'- '+c.label+': '+c.hex+' · CMYK '+c.cmyk.join(' ')+(c.custom?' (impostato a mano)':' (calcolato)')+' · inchiostro '+Math.round(c.tac)+'%'),
  '- Nero: K100 per testi e linee'+(settings.richBlack!==false?', nero ricco C60 M40 Y40 K100 per le grandi aree scure':''),'');
 if(doc.warnings.length)L.push('## Da controllare','',...doc.warnings.map(w=>'- '+w.text),'');
 L.push('## Note per la stampa','',...notes(doc).map(n=>'- '+n));return L.join('\n')}
const MAX_KEPT=60;
function savedEntry(doc,md,{by,at,cmyk}={}){const when=at||new Date().toISOString(),f=need(doc.format);
 return [{role:'user',content:f.title+' preparato nello Studio Stampa del pannello Marketing.',display:f.title+' preparato nello Studio Stampa',by:by||'Pannello Marketing',at:when,source:'print-studio'},
  {role:'assistant',agent:AGENT,content:'Ecco i dati del materiale da stampare, salvati nel progetto (il PDF si scarica dallo Studio Stampa).\n\n---DOCUMENTO: Stampa · '+doc.title+'---\n'+md+'\n---FINE DOCUMENTO---',at:when,source:'print-studio',
   print:{format:doc.format,variant:doc.variant,margin:doc.margin,values:doc.values,cmyk:cmyk&&cmyk.byRole?{byRole:cmyk.byRole,richBlack:cmyk.richBlack!==false}:undefined}}]}
async function saveToProject(ws,projectId,doc,opts={}){if(!ws||typeof ws.bind!=='function')throw Error('Archivio del progetto non disponibile.');
 const d=ws.bind(projectId,'agents'),md=toMarkdown(doc,{cmyk:opts.cmyk&&{overrides:overridesFrom(doc.brand.palette,opts.cmyk.byRole),richBlack:opts.cmyk.richBlack}});
 for(let i=0;i<3;i++){const cur=(await d.load())||{},conv={...(cur.conversations||{})};conv[AGENT]=(Array.isArray(conv[AGENT])?conv[AGENT]:[]).concat(savedEntry(doc,md,opts)).slice(-MAX_KEPT);
  try{return await d.save({...cur,schemaVersion:1,conversations:conv})}catch(e){if(!(ws.ConflictError&&e instanceof ws.ConflictError)||i===2)throw e}}}
// The texts saved by the Studio Testi in the project (agents document), newest first: [{title, md}].
function savedCopies(agentsDoc){const out=[];for(const list of Object.values((agentsDoc&&agentsDoc.conversations)||{}))for(const e of Array.isArray(list)?list:[]){
 if(!e||e.role!=='assistant'||e.source!=='copy-studio')continue;const m=/---DOCUMENTO:\s*([^\n]*?)---\n([\s\S]*?)\n---FINE DOCUMENTO---/.exec(String(e.content||''));if(m)out.push({title:clean(m[1]),md:m[2],at:e.at||''})}
 return out.sort((a,b)=>String(b.at).localeCompare(String(a.at)))}

// ---- browser widget ----
let counter=0;
const dom=()=>root.document;
const el=(tag,text,cls)=>{const n=dom().createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
const button=(text,cls)=>{const b=el('button',text,cls||'');b.type='button';return b};
function download(name,bytes,type){const a=el('a');a.href=root.URL.createObjectURL(new root.Blob([bytes],{type}));a.download=name;dom().body.append(a);a.click();a.remove();setTimeout(()=>root.URL.revokeObjectURL(a.href),2000);return name}
const fileUrl=f=>new Promise((res,rej)=>{const r=new root.FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(Error('File non leggibile'));r.readAsDataURL(f)});
// ctx: {project (profileFor summary), profile (raw project profile, with identityKit), projectName, projectId, workspace, agentsUrl, by}
function printStudio(ctx={}){const n=++counter,brand=brandOf(ctx.profile,ctx.projectName),values={...prefill(ctx.profile,{projectName:ctx.projectName,summary:ctx.project}),margin:''};
 let fmt='biglietto',variant='classic',guides=true,last=null,photo=null,busy=false;const byRole={},cmykState={richBlack:true};
 const settings=()=>({overrides:overridesFrom(brand.palette,byRole),richBlack:cmykState.richBlack});
 const wrap=el('div',undefined,'tool photo-studio print-studio'),steps=el('ol',undefined,'ps-steps');['Il formato','Layout e testi','Colori e controlli','PDF'].forEach((t,i)=>{const li=el('li',(i+1)+' · '+t);li.dataset.step=String(i+1);steps.append(li)});
 const setStep=k=>[...steps.children].forEach(li=>li.dataset.state=+li.dataset.step<k?'done':+li.dataset.step===k?'current':'todo');
 const formats=el('fieldset',undefined,'pr-formats');formats.append(el('legend','Cosa stampi'));
 FORMATS.forEach(f=>{const l=el('label',undefined,'ps-chip pr-format'),r=el('input');r.type='radio';r.name='pr-format-'+n;r.value=f.id;r.checked=f.id===fmt;r.onchange=()=>{fmt=f.id;setStep(2);fields();update()};
  l.append(r,el('b',' '+f.title),el('small',f.size,'muted'));formats.append(l)});
 const brandLine=el('p',brand.fromKit?'Colori e logo dal Kit identità'+(brand.direction?' «'+brand.direction+'»':'')+(brand.logo?'':' (senza logo: uso il nome come logotipo)')+'.':'Nessun Kit identità nel progetto: uso colori neutri e il nome come logotipo. Puoi crearlo dalla card «Kit identità».','pr-brand');
 const sw=el('span',undefined,'pr-swatches');Object.entries(brand.palette).forEach(([r,h])=>{const s=el('i');s.style.background=h;s.title=ROLE_LABEL[r]+' '+h;sw.append(s)});brandLine.prepend(sw);
 // the three layouts, each with its thumbnail
 const variants=el('fieldset',undefined,'pr-variants');variants.append(el('legend','Layout'));const thumbs={};
 VARIANTS.forEach(vt=>{const l=el('label',undefined,'pr-variant'),r=el('input'),th=el('div',undefined,'pr-thumb');r.type='radio';r.name='pr-variant-'+n;r.value=vt.id;r.checked=vt.id===variant;
  r.onchange=()=>{variant=vt.id;setStep(2);update()};thumbs[vt.id]=th;const t=el('span',undefined,'pr-variant-text');t.append(el('b',vt.title),el('small',vt.line));l.append(r,th,t);variants.append(l)});
 const grid=el('div',undefined,'pr-fields'),inputs={};
 const paste=el('details',undefined,'pr-paste'),ta=el('textarea'),use=button('Usa questo testo'),pick=el('select'),pst=el('span','','muted');
 paste.append(el('summary','Incolla un testo dallo Studio Testi'));ta.rows=5;ta.placeholder='Incolla qui il testo scelto nello Studio Testi (brochure, testi per il sito…): titoli e sezioni vanno nei campi giusti.';
 pick.hidden=true;pick.setAttribute('aria-label','Testi salvati nel progetto');const pb=el('div',undefined,'ps-actions');pb.append(pick,use,pst);paste.append(ta,pb);
 paste.addEventListener('toggle',async()=>{if(!paste.open||pick.dataset.loaded||!ctx.workspace||!ctx.projectId)return;pick.dataset.loaded='1';
  try{const list=savedCopies(await ctx.workspace.bind(ctx.projectId,'agents').load());if(!list.length)return;
   pick.replaceChildren(new root.Option('Oppure scegli un testo salvato…',''),...list.slice(0,20).map((c,i)=>new root.Option(c.title,String(i))));pick.hidden=false;pick.onchange=()=>{const c=list[+pick.value];if(c)ta.value=c.md}}catch(e){}});
 use.onclick=()=>{const r=fromCopy(fmt,parseCopy(ta.value),values);Object.assign(values,r.values);fields();update();pst.textContent=r.used?'Testo distribuito in '+r.used+' campi: controlla l’anteprima.'+(r.notes.length?' '+r.notes.join(' '):''):r.notes.join(' ')};
 // the photo (posters, roll-up, brochure)
 const photoBox=el('div',undefined,'pr-photo'),pin=el('input'),pinfo=el('span','','muted'),pdel=button('Togli la foto');pin.type='file';pin.accept='image/jpeg,image/png';pdel.hidden=true;
 const plab=el('label',undefined,'pf-drop pr-drop'),ptxt=el('span',undefined,'pf-drop-text');ptxt.append(el('strong','Foto (facoltativa)'),el('small','JPEG o PNG · trascinala qui o fai clic'));plab.append(pin,ptxt);photoBox.append(plab,pdel,pinfo);
 pin.onchange=async()=>{const f=pin.files&&pin.files[0];if(!f)return;try{const src=await fileUrl(f),img=new root.Image();img.src=src;await img.decode();photo={src,w:img.naturalWidth,h:img.naturalHeight,name:f.name};pdel.hidden=false;setStep(2);update()}catch(e){pinfo.textContent='Foto non leggibile: '+e.message}};
 pdel.onclick=()=>{photo=null;pin.value='';pdel.hidden=true;update()};
 function fields(){const f=need(fmt);grid.replaceChildren();for(const k of f.fields){const d=FIELDS[k],l=el('label',d.label,d.rows?'pr-wide':''),i=el(d.rows?'textarea':'input');if(d.rows)i.rows=d.rows;else i.type='text';
   i.maxLength=d.max;i.placeholder=d.ph||'';i.value=values[k]||'';i.oninput=()=>{values[k]=i.value;setStep(2);update()};l.append(i);grid.append(l);inputs[k]=i}
  const ml=el('label','Margine dal bordo (mm)'),mi=el('input');mi.type='number';mi.min='0';mi.max=f.id==='rollup'?'120':'40';mi.step='0.5';mi.placeholder=String(f.margin);mi.value=values.margin;mi.oninput=()=>{values.margin=mi.value;update()};ml.append(mi);grid.append(ml);
  photoBox.hidden=!f.photo}
 // CMYK: one row per palette colour, the computed value as placeholder, hand-set values override it
 const inks=el('fieldset',undefined,'pr-inks');inks.append(el('legend','Colori per la stampa (CMYK)'));
 const inkRows=el('div',undefined,'pr-ink-rows'),rb=el('label',undefined,'ps-switch pr-rich'),rbi=el('input');rbi.type='checkbox';rbi.checked=true;rbi.onchange=()=>{cmykState.richBlack=rbi.checked;setStep(3);update()};
 rb.append(rbi,dom().createTextNode(' Nero ricco C60 M40 Y40 K100 per le grandi aree scure (i testi piccoli restano in solo nero K100)'));
 inks.append(el('p','Calcolati con una conversione semplice (senza profilo ICC). Se la tipografia o il brand book indicano altri valori, scrivili qui.','pr-inks-note'),inkRows,rb);
 const inkTotal={};
 Object.entries(brand.palette).forEach(([role,h])=>{const row=el('div',undefined,'pr-ink'),auto=cmykOf(h),sq=el('i');sq.style.background=h;
  const name=el('span',undefined,'pr-ink-name');name.append(sq,el('b',ROLE_LABEL[role]),el('small',hex(h),'muted'));row.append(name);const ins=[];
  ['C','M','Y','K'].forEach((ch,i)=>{const l=el('label',ch),x=el('input');x.type='number';x.min='0';x.max='100';x.step='1';x.placeholder=String(auto[i]);x.setAttribute('aria-label',ROLE_LABEL[role]+' '+ch);
   x.oninput=()=>{const vals=ins.map((y,j)=>y.value===''?auto[j]:Math.max(0,Math.min(100,+y.value||0)));if(ins.every(y=>y.value===''))delete byRole[role];else byRole[role]=vals;setStep(3);update()};ins.push(x);l.append(x);row.append(l)});
  const tot=el('span','','pr-ink-tac');inkTotal[role]=tot;const reset=button('Ripristina','pr-ink-reset');reset.onclick=()=>{ins.forEach(y=>y.value='');delete byRole[role];update()};row.append(tot,reset);inkRows.append(row)});
 const view=el('div',undefined,'pr-preview'),gl=el('label',undefined,'ps-switch pr-guides'),gc=el('input');gc.type='checkbox';gc.checked=true;gc.onchange=()=>{guides=gc.checked;update()};gl.append(gc,dom().createTextNode(' Mostra abbondanza, area sicura e pieghe'));
 const warn=el('ul',undefined,'pr-warn'),note=el('ul',undefined,'pr-notes'),st=el('p','','tool-status');st.setAttribute('role','status');
 const pre=el('section',undefined,'pr-preflight'),preHead=el('h4','Controllo prestampa'),preList=el('ul',undefined,'pr-checks');pre.append(preHead,preList);pre.setAttribute('aria-live','polite');
 const dp=button('Scarica PDF per la tipografia','primary'),dw=button('Scarica PDF per il web'),acts=el('div',undefined,'ps-actions');acts.append(dp,dw);
 const label=el('p','',"pr-pdfx");label.append(el('b','PDF/X-1a · CMYK FOGRA39: '),dom().createTextNode(PDFX.label+'. La tipografia deve comunque fare il suo preflight prima di stampare.'));
 const docNow=()=>layout(fmt,values,brand,{variant,photo});
 const go=async mode=>{if(busy)return;busy=true;dp.disabled=dw.disabled=true;const X=mode==='print';st.textContent=X?'Preparo il PDF per la tipografia: converto colori e immagini in CMYK e i testi in tracciati…':'Preparo il PDF per il web…';
  try{const doc=docNow();
   if(X){const pf0=preflight(doc,settings());if(!pf0.ok){st.textContent='Prima sistema i punti in rosso del controllo prestampa.';return}
    await loadGlyphs();await prepareImages(doc,{pdfx:true});const pf=preflight(doc,settings());if(!pf.ok){renderChecks(pf);st.textContent='Dopo la conversione qualcosa non va: guarda il controllo prestampa.';return}}
   else{try{await prepareImages(doc,{pdfx:false})}catch(e){st.textContent='Immagine non convertita ('+e.message+').'}}
   const bytes=pdf(doc,{mode,pdfx:X,cmyk:settings()});
   if(X){const probs=checkPdf(bytes);if(probs.length){st.textContent='PDF non scaricato: '+probs.join(' ');return}}
   const name=download(filename(doc,mode),bytes,'application/pdf'),s=pageSize(fmt,mode);
   st.textContent='Scaricato: '+name+' · '+doc.pages.length+(doc.pages.length>1?' pagine':' pagina')+' da '+mmText(s.w)+' × '+mmText(s.h)+' mm'+(mode==='web'?' (RGB, per lo schermo).':': formato + '+BLEED+' mm di abbondanza per lato ('+mmText(s.bleedW)+' × '+mmText(s.bleedH)+' mm), segni di taglio nel margine esterno, CMYK, testi in tracciati. '+PDFX.label[0].toUpperCase()+PDFX.label.slice(1)+'.')}
  catch(e){st.textContent='PDF non creato: '+e.message}finally{busy=false;dw.disabled=false;update()}};
 dp.onclick=()=>go('print');dw.onclick=()=>go('web');
 if(ctx.workspace&&ctx.projectId){const sv=button('Salva nel progetto');acts.append(sv);
  sv.onclick=async()=>{sv.disabled=true;st.textContent='Salvo i dati nel progetto…';
   try{await saveToProject(ctx.workspace,ctx.projectId,last||docNow(),{by:ctx.by,cmyk:{byRole:{...byRole},richBlack:cmykState.richBlack}});st.replaceChildren(dom().createTextNode('Salvato nel progetto: formato, layout, testi, colori CMYK e controlli sono tra i documenti dell’Art Director (il PDF lo scarichi da qui). '));
    if(ctx.agentsUrl){const a=el('a','Apri in Agenti AI →');a.href=ctx.agentsUrl;st.append(a)}}catch(e){st.textContent='Non salvato: '+e.message}finally{sv.disabled=false}}}
 function renderChecks(pf){preList.replaceChildren(...pf.checks.map(c=>{const li=el('li');li.dataset.ok=String(c.ok);li.dataset.check=c.id;const mark=el('span',c.ok?'✓':'✕','pr-check-mark');mark.setAttribute('aria-hidden','true');
   const t=el('span');t.append(el('b',c.label+(c.ok?'':' · da sistemare')),el('small',c.detail));li.append(mark,t);return li}));pre.dataset.ok=String(pf.ok);
  dp.disabled=busy||!pf.ok;dp.title=pf.ok?'':'Si attiva quando tutti i controlli sono verdi.'}
 let raf=0;function update(){if(raf)return;const run=()=>{raf=0;const doc=last=docNow(),S=settings();
  view.replaceChildren(...doc.pages.map((p,i)=>{const fig=el('figure',undefined,'pr-page');fig.dataset.format=fmt;const holder=el('div',undefined,'pr-svg');holder.innerHTML=previewSvg(doc,i,{guides});fig.append(holder,el('figcaption',p.label+' · '+mmText(p.w)+' × '+mmText(p.h)+' mm'));return fig}));
  for(const vt of VARIANTS){const d=vt.id===variant?doc:layout(fmt,values,brand,{variant:vt.id,photo});thumbs[vt.id].innerHTML=previewSvg(d,0,{guides:false});thumbs[vt.id].dataset.format=fmt}
  warn.replaceChildren(...(doc.warnings.length?doc.warnings.map(w=>{const li=el('li',w.text);li.dataset.kind=w.kind;return li}):[el('li','Testi e logo stanno nell’area sicura ('+SAFE+' mm dal taglio'+(need(fmt).panels?' e dalle pieghe':'')+(need(fmt).hidden?' e sopra la base del roll-up':'')+').','pr-ok')]));
  warn.dataset.warn=String(doc.warnings.length>0);note.replaceChildren(...notes(doc).map(t=>el('li',t)));
  for(const c of paletteInks(brand.palette,S)){const t=inkTotal[c.role];if(!t)continue;t.textContent='Inchiostro '+Math.round(c.tac)+'%';t.dataset.over=String(c.tac>INK_LIMIT)}
  const imgs=imagesReport(doc).filter(x=>x.label==='Foto');pinfo.textContent=photo?photo.name+' · '+photo.w+' × '+photo.h+' px'+(imgs.length?' · '+imgs.map(x=>x.dpi+' dpi alla misura di stampa ('+x.mm.w+' × '+x.mm.h+' mm)'+(x.ok?'':': servono '+x.need+' dpi')).join('; '):' · questo layout non usa la foto'):'';
  pinfo.dataset.low=String(imgs.some(x=>!x.ok));renderChecks(preflight(doc,S))};
  raf=root.requestAnimationFrame?root.requestAnimationFrame(run):(run(),0)}
 const std=el('div',undefined,'pr-standard');std.append(steps,formats,brandLine,variants,paste,grid,photoBox,inks,gl,view,warn,pre,label,acts,st,note);
 // Grande formato (lib/large-format-studio.js, when loaded): totem, banner, vele, pannelli, 6 × 3 m and free sizes, as a step of this studio.
 const LF=root.RadixLargeFormatStudio;
 if(LF&&typeof LF.largeFormatStudio==='function'){const bar=el('div',undefined,'pr-modes'),a=button('Formati standard'),g=button('Grande formato');let big=null;bar.setAttribute('role','group');bar.setAttribute('aria-label','Che cosa stampi');
  const set=large=>{a.setAttribute('aria-pressed',String(!large));g.setAttribute('aria-pressed',String(large));std.hidden=large;if(large&&!big){big=LF.largeFormatStudio(ctx);wrap.append(big)}if(big)big.hidden=!large};
  a.onclick=()=>set(false);g.onclick=()=>set(true);bar.append(a,g,el('small','Grande formato: totem, banner e striscioni, vele, pannelli forex e dibond, manifesto 6 × 3 m e misura libera.','muted'));wrap.append(bar,std);set(!!ctx.large)}
 else wrap.append(std);
 setStep(1);fields();update();return wrap}

return Object.freeze({MM,BLEED,SLUG,SAFE,DPI,AGENT,INK_LIMIT,AREA_MIN,RICH_BLACK,PURE_K,REGISTRATION,OUTPUT_INTENT,PDFX,FIELDS,FORMATS,VARIANTS,format,mmToPt,ptToMm,pageSize,brandOf,contrast,ink,prefill,contactsIn,parseCopy,fromCopy,winAnsi,textWidth,wrap,
 layout,builder,glyphs,svgUrl,rasterize,prepareImages,download,safeArea,bleedProblems,marks,viewBox,needsRaster,monoSvg,parseSvg,transform,pathOps,arcToCubics,svgOps,svgColours,outlineOps,loadGlyphs,
 cmykOf,tac,inkFor,paletteInks,overridesFrom,inkReport,effectiveDpi,imagesReport,preflight,checkPdf,rgbaToCmyk,cmykRaster,pdf,previewSvg,itemSvg,notes,toMarkdown,filename,savedEntry,saveToProject,savedCopies,printStudio});
});
