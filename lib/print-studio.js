/* Studio Stampa: business card, A5 flyer, A4/A3 poster, A4 letterhead and A4 three-panel roll-fold brochure, as PDF.
   No AI: pick a format, fill the fields (prefilled from the project profile, its brand kit profile.identityKit and the
   contacts found in its facts; texts can be pasted from the Studio Testi), see the live preview, download the PDF.
   One layout (items in mm on the trim, origin top-left) feeds both the SVG preview and a small vector PDF writer:
   - «per la tipografia»: page = trim + 3 mm bleed per side (MediaBox = BleedBox, TrimBox = trim), crop marks in the bleed
     corners (and fold marks for the brochure), safe-area check (text and logo at least 4 mm from trim and folds);
   - «per il web»: page = trim, no bleed, no marks.
   Text is set in Helvetica / Helvetica-Bold, the PDF standard fonts (not embedded: the kit's Google Fonts cannot be
   embedded from the browser), with the real Helvetica widths for wrapping. The logo is drawn as vectors when its SVG uses
   only shapes, paths and text; with gradients or clip paths it is rasterised at 300 dpi in the browser (JPEG on the
   colour behind it). Colours are RGB: the print shop converts them to CMYK.
   «Salva nel progetto» saves the format, the texts, the colours and the checks as a document in the Art Director's thread
   (the PDF itself is downloaded, not stored). Pure part (formats, layout, checks, PDF bytes) runs in Node for the tests. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixPrintStudio=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const MM=72/25.4,BLEED=3,SAFE=4,DPI=300,AGENT='art-director',FIELD_MAX=200,TEXT_MAX=1500;
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
const FORMATS=[
 {id:'biglietto',title:'Biglietto da visita',size:'85 × 55 mm, fronte e retro',w:85,h:55,pages:['Fronte','Retro'],margin:5,fields:['name','payoff','person','role',...CONTACTS]},
 {id:'flyer',title:'Flyer A5',size:'148 × 210 mm',w:148,h:210,pages:['Fronte'],margin:10,fields:POSTER},
 {id:'locandina-a4',title:'Locandina A4',size:'210 × 297 mm',w:210,h:297,pages:['Fronte'],margin:12,fields:POSTER},
 {id:'locandina-a3',title:'Locandina A3',size:'297 × 420 mm',w:297,h:420,pages:['Fronte'],margin:16,fields:POSTER},
 {id:'carta',title:'Carta intestata A4',size:'210 × 297 mm',w:210,h:297,pages:['Pagina'],margin:15,fields:['name','payoff',...CONTACTS,'vat']},
 // Roll fold: outside [inner flap 97 | back 100 | cover 100], inside [100 | 100 | 97]; folds at 97/197 and 100/200 mm.
 {id:'brochure',title:'Brochure pieghevole A4 a 3 ante',size:'297 × 210 mm aperta, 100 × 210 mm piegata, fronte e retro',w:297,h:210,pages:['Esterno','Interno'],margin:8,panels:[[97,100,100],[100,100,97]],
  fields:['name','payoff','flapTitle','flapText','p1Title','p1Text','p2Title','p2Text','p3Title','p3Text','closing',...CONTACTS]}
];
const format=id=>FORMATS.find(f=>f.id===id)||null;
const need=id=>{const f=format(id);if(!f)throw Error('Formato sconosciuto: '+id);return f};
// Page size of the print PDF (trim + bleed) and of the web PDF (trim), in mm and pt.
function pageSize(id,mode){const f=need(id),b=mode==='web'?0:BLEED,w=f.w+2*b,h=f.h+2*b;return {w,h,wPt:mmToPt(w),hPt:mmToPt(h),bleed:b}}

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
function textWidth(s,size,bold){const W=bold?W_BOLD:W_REG;return codes(s).reduce((a,c)=>a+(W[c-32]||556),0)*size/1000}// pt
const widthMm=(s,size,bold)=>ptToMm(textWidth(s,size,bold));
// Greedy wrap on spaces; a word longer than the line is broken by characters.
function wrap(text,size,width,bold){const out=[];
 for(const para of String(text||'').split('\n')){const words=clean(para).split(' ').filter(Boolean);if(!words.length){out.push('');continue}let line='';
  for(let w of words){const t=line?line+' '+w:w;if(widthMm(t,size,bold)<=width){line=t;continue}if(line)out.push(line);line='';
   while(widthMm(w,size,bold)>width&&w.length>1){let i=w.length-1;while(i>1&&widthMm(w.slice(0,i),size,bold)>width)i--;out.push(w.slice(0,i));w=w.slice(i)}line=w}
  out.push(line)}
 while(out.length&&out[out.length-1]==='')out.pop();return out}

// ---- layout ----
const capMm=size=>ptToMm(size*ASCENT),descMm=size=>ptToMm(size*DESCENT);
function builder(f,brand,values,margin){const warnings=[];
 const b={f,brand,v:values,m:margin,items:null,warnings,pal:brand.palette,
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
  // The logo fitted (contain) in a box, else the name as a bold wordmark.
  logo(x,y,w,h,o={}){const vb=viewBox(brand.logo);
   if(brand.logo&&vb){const s=Math.min(w/vb[2],h/vb[3]),lw=vb[2]*s,lh=vb[3]*s,lx=o.align==='left'?x:o.align==='right'?x+w-lw:x+(w-lw)/2;
    b.items.push({t:'logo',x:lx,y:y+(h-lh)/2,w:lw,h:lh,svg:brand.logo,vb,bg:o.bg||b.pal.light,label:'Logo',area:o.area});return}
   const name=clean(values.name)||'Il tuo nome';let size=Math.min(mmToPt(h)*.62,60);while(size>6&&widthMm(name,size,true)>w)size-=.5;
   const tw=widthMm(name,size,true),lx=o.align==='left'?x:o.align==='right'?x+w-tw:x+(w-tw)/2;
   b.items.push({t:'text',x:lx,y:y+h/2+capMm(size)/2,s:name,size,bold:true,fill:ink(o.bg||b.pal.light,b.pal,b.pal.primary,b.pal.dark),label:'Nome (logotipo)',area:o.area,wordmark:true})}};
 return b}
const contactLines=v=>CONTACTS.map(k=>clean(v[k])).filter(Boolean);
function businessCard(b){const {f,pal,v,m}=b,w=f.w,h=f.h,front=[],back=[];
 b.items=front;b.rect(-BLEED,-BLEED,w+2*BLEED,h+2*BLEED,pal.light);b.rect(-BLEED,h-3,w+2*BLEED,3+BLEED,pal.accent);
 const pay=clean(v.payoff),payBase=h-Math.max(m,5)-1.2,logoBottom=pay?payBase-capMm(7.5)-2:h-m-2;
 b.logo(m,m,w-2*m,logoBottom-m);if(pay)b.text(m,payBase,w-2*m,pay,{size:7.5,fill:ink(pal.light,pal,pal.dark),align:'center',label:'Payoff'});
 b.items=back;const bg=pal.primary,t=ink(bg,pal,pal.light,pal.dark);b.rect(-BLEED,-BLEED,w+2*BLEED,h+2*BLEED,bg);
 const who=clean(v.person)||clean(v.name);let y=m+capMm(11);if(who){b.text(m,y,w-2*m,who,{size:11,bold:true,fill:t,label:clean(v.person)?'Nome e cognome':'Nome'});y+=ptToMm(11*1.25)}
 if(clean(v.role))b.text(m,y,w-2*m,v.role,{size:8,fill:t,label:'Ruolo'});
 const lines=contactLines(v),lead=ptToMm(7.5*1.35);let cy=h-m-descMm(7.5)-(lines.length-1)*lead;
 for(const [i,l] of lines.entries())b.text(m,cy+i*lead,w-2*m,l,{size:7.5,fill:t,label:FIELDS[CONTACTS.filter(k=>clean(v[k]))[i]].label});
 b.items=null;return [front,back]}
function poster(b){const {f,pal,v,m}=b,w=f.w,h=f.h,s=w/148,page=[];b.items=page;
 b.rect(-BLEED,-BLEED,w+2*BLEED,h+2*BLEED,pal.light);
 const band=46*s,bandTop=h-band;b.rect(-BLEED,bandTop,w+2*BLEED,band+BLEED,pal.primary);b.rect(-BLEED,bandTop-3*s,w+2*BLEED,3*s,pal.accent);
 const inner=w-2*m;b.logo(m,m,inner*.55,26*s,{align:'left'});
 let y=m+26*s+(clean(v.payoff)?0:4*s);
 if(clean(v.payoff))y=b.para(m,y+3*s,inner,v.payoff,{size:10*s,fill:ink(pal.light,pal,pal.secondary,pal.dark),label:'Payoff',maxY:bandTop-6*s})+4*s;
 y=b.para(m,y+4*s,inner,v.headline,{size:30*s,lead:1.1,bold:true,fill:ink(pal.light,pal,pal.primary,pal.dark),label:'Titolo',maxY:bandTop-8*s,after:6*s});
 b.para(m,y,inner,v.body,{size:11*s,lead:1.4,fill:ink(pal.light,pal,pal.dark),label:'Testo',maxY:bandTop-3*s-m*.6});
 const t=ink(pal.primary,pal,pal.light,pal.dark),bm=Math.min(m,band/4);let cy=bandTop+Math.max(bm,6*s);
 if(clean(v.cta))cy=b.para(m,cy,inner,v.cta,{size:16*s,lead:1.15,bold:true,fill:t,label:'Invito all’azione',maxY:h-m-12*s,after:3*s});
 b.para(m,cy,inner,contactLines(v).join('  ·  '),{size:9*s,lead:1.35,fill:t,label:'Contatti',maxY:h-m});
 b.items=null;return [page]}
function letterhead(b){const {f,pal,v,m}=b,w=f.w,h=f.h,page=[];b.items=page;const white='#FFFFFF';
 b.rect(-BLEED,-BLEED,w+2*BLEED,4+BLEED,pal.primary);b.rect(-BLEED,4,w+2*BLEED,1.2,pal.accent);
 const top=Math.max(m,9);b.logo(m,top,70,22,{align:'left',bg:white});
 if(clean(v.payoff))b.text(m,top+22+capMm(8)+2,90,v.payoff,{size:8,fill:ink(white,pal,pal.secondary,pal.dark),label:'Payoff'});
 const lines=contactLines(v),lead=ptToMm(8*1.4);lines.forEach((l,i)=>b.text(w-m-90,top+capMm(8)+1+i*lead,90,l,{size:8,align:'right',fill:ink(white,pal,pal.dark),label:'Contatti'}));
 const fy=h-m-descMm(7)-(clean(v.vat)?ptToMm(7*1.4):0);b.line(m,fy-capMm(8)-3,w-m,fy-capMm(8)-3,pal.accent,.6);
 b.text(m,fy,w-2*m,[clean(v.name),clean(v.address)].filter(Boolean).join('  ·  '),{size:8,bold:true,align:'center',fill:ink(white,pal,pal.primary,pal.dark),label:'Piè di pagina'});
 if(clean(v.vat))b.text(m,fy+ptToMm(7*1.4),w-2*m,v.vat,{size:7,align:'center',fill:ink(white,pal,pal.secondary,pal.dark),label:'P. IVA e dati societari'});
 b.items=null;return [page]}
function brochure(b){const {f,pal,v,m}=b,h=f.h,pages=[];const area=(x,w)=>({x,y:0,w,h});
 // outside: flap | back | cover
 let page=[];b.items=page;const [a,bk]=f.panels[0];b.rect(-BLEED,-BLEED,f.w+2*BLEED,h+2*BLEED,pal.light);
 const head=ink(pal.light,pal,pal.primary,pal.dark),txt=ink(pal.light,pal,pal.dark);
 let ar=area(0,a),y=m;y=b.para(m,y+2,a-2*m,v.flapTitle,{size:15,lead:1.15,bold:true,fill:head,label:'Aletta interna · titolo',maxY:h-m,area:ar,after:3});b.para(m,y,a-2*m,v.flapText,{size:9.5,lead:1.4,fill:txt,label:'Aletta interna · testo',maxY:h-m,area:ar});
 ar=area(a,bk);const bx=a+m,bw=bk-2*m;y=m+2;
 y=b.para(bx,y,bw,v.closing,{size:10.5,lead:1.35,bold:true,fill:head,label:'Retro · testo di chiusura',maxY:h-m-60,area:ar,after:5});
 contactLines(v).forEach(l=>{y=b.para(bx,y,bw,l,{size:9,lead:1.3,fill:txt,label:'Contatti',maxY:h-m-34,area:ar,after:1.5})});
 b.logo(bx,h-m-28,bw,24,{area:ar});
 const cx=a+bk,cw=f.w-cx;ar=area(cx,cw);const band=h*.3;b.rect(cx,h-band,cw+BLEED,band+BLEED,pal.primary);b.rect(cx,h-band-3,cw+BLEED,3,pal.accent);
 b.logo(cx+m,h*.16,cw-2*m,h*.24,{area:ar});y=h*.16+h*.24+8;
 y=b.para(cx+m,y,cw-2*m,b.brand.logo&&!/<text\b/i.test(b.brand.logo)?v.name:'',{size:20,lead:1.1,bold:true,fill:head,align:'center',label:'Nome',maxY:h-band-8,area:ar,after:3});
 b.para(cx+m,y,cw-2*m,v.payoff,{size:11,lead:1.3,fill:txt,align:'center',label:'Payoff',maxY:h-band-6,area:ar});
 if(clean(v.website))b.text(cx+m,h-m-descMm(10),cw-2*m,v.website,{size:10,bold:true,align:'center',fill:ink(pal.primary,pal,pal.light,pal.dark),label:'Sito web',area:ar});
 pages.push(page);
 // inside: three panels
 page=[];b.items=page;b.rect(-BLEED,-BLEED,f.w+2*BLEED,h+2*BLEED,pal.light);b.rect(-BLEED,-BLEED,f.w+2*BLEED,6+BLEED,pal.primary);
 let x=0;f.panels[1].forEach((pw,i)=>{const ar=area(x,pw),k='p'+(i+1);let yy=6+m+2;
  yy=b.para(x+m,yy,pw-2*m,v[k+'Title'],{size:14,lead:1.15,bold:true,fill:head,label:FIELDS[k+'Title'].label,maxY:h-m,area:ar,after:3});
  b.para(x+m,yy,pw-2*m,v[k+'Text'],{size:9.5,lead:1.4,fill:txt,label:FIELDS[k+'Text'].label,maxY:h-m,area:ar});x+=pw});
 pages.push(page);b.items=null;return pages}
function viewBox(svg){const m=/<svg\b[^>]*\bviewBox="\s*(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/i.exec(String(svg||''));
 if(m){const v=m.slice(1).map(Number);return v[2]>0&&v[3]>0?v:null}
 const w=/<svg\b[^>]*\bwidth="([\d.]+)/i.exec(String(svg||'')),h=/<svg\b[^>]*\bheight="([\d.]+)/i.exec(String(svg||''));return w&&h?[0,0,+w[1],+h[1]]:null}
const folds=f=>(f.panels||[]).map(p=>p.slice(0,-1).map((_,i)=>p.slice(0,i+1).reduce((a,x)=>a+x,0)));
// The whole document: {format, title, pages:[{label,w,h,items,folds}], warnings}.
function layout(id,values,brand,opts={}){const f=need(id),v={};for(const k of f.fields)v[k]=String((values||{})[k]==null?'':values[k]).slice(0,FIELDS[k].max);
 const raw=opts.margin!=null?opts.margin:(values||{}).margin,margin=raw===''||raw==null||!isFinite(+raw)?f.margin:Math.max(0,Math.min(40,+raw)),br=brand||brandOf({},v.name),b=builder(f,br,v,margin);
 const pages=(f.id==='biglietto'?businessCard:f.id==='carta'?letterhead:f.id==='brochure'?brochure:poster)(b);
 const fl=folds(f);const doc={format:f.id,title:f.title+(clean(v.name)?' · '+clean(v.name):''),margin,brand:br,values:v,
  pages:pages.map((items,i)=>({label:f.pages[i],w:f.w,h:f.h,items,folds:fl[i]||[]})),warnings:b.warnings};
 doc.warnings=doc.warnings.concat(safeArea(doc),glyphs(doc));return doc}
// Text and logo closer than SAFE mm to the trim (or to a fold, on the brochure panels).
function bbox(it){if(it.t==='text'){const w=widthMm(it.s,it.size,it.bold);return {x0:it.x,x1:it.x+w,y0:it.y-capMm(it.size),y1:it.y+descMm(it.size)}}
 if(it.t==='logo')return {x0:it.x,x1:it.x+it.w,y0:it.y,y1:it.y+it.h};return null}
function safeArea(doc,safe=SAFE){const out=[],seen=new Set();
 doc.pages.forEach((p,pi)=>p.items.forEach(it=>{const bb=bbox(it);if(!bb)return;const a=it.area||{x:0,y:0,w:p.w,h:p.h};
  const d=Math.min(bb.x0-a.x,a.x+a.w-bb.x1,bb.y0-a.y,a.y+a.h-bb.y1);if(d>=safe-1e-6)return;
  const edge=it.area&&(Math.abs(bb.x0-a.x)<safe&&a.x>0||Math.abs(a.x+a.w-bb.x1)<safe&&a.x+a.w<p.w)?'dalla piega':'dal bordo di taglio',key=pi+'|'+(it.label||it.t)+'|'+edge;if(seen.has(key))return;seen.add(key);
  out.push({kind:'safe',page:pi,label:it.label,distance:Math.round(Math.max(d,-99)*10)/10,
   text:p.label+': «'+(it.t==='logo'?'Logo':it.label||'Testo')+'» è a '+(d<0?'meno di 0':mmText(Math.max(0,d)))+' mm '+edge+' (servono almeno '+safe+' mm): può essere tagliato.'})}));
 return out}
function glyphs(doc){const bad=new Set();doc.pages.forEach(p=>p.items.forEach(it=>{if(it.t==='text')unsupported(it.s).forEach(c=>bad.add(c))}));
 return bad.size?[{kind:'glyph',text:'Questi caratteri non esistono in Helvetica e nel PDF diventano «?»: '+[...bad].slice(0,10).join(' ')+'.'}]:[]}
// Crop marks (in the bleed corners: 2 mm long, 1 mm away from the trim corner) and fold marks, in mm on the print page
// (origin top-left of the trim + bleed page).
function marks(page,bleed=BLEED){const out=[],W=page.w+2*bleed,H=page.h+2*bleed,gap=1,len=bleed-gap;
 for(const x of [bleed,bleed+page.w])for(const [y0,y1] of [[0,len],[H-len,H]])out.push({kind:'crop',x1:x,y1:y0,x2:x,y2:y1});
 for(const y of [bleed,bleed+page.h])for(const [x0,x1] of [[0,len],[W-len,W]])out.push({kind:'crop',x1:x0,y1:y,x2:x1,y2:y});
 for(const f of page.folds||[])for(const [y0,y1] of [[0,len],[H-len,H]])out.push({kind:'fold',x1:bleed+f,y1:y0,x2:bleed+f,y2:y1});
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
function svgOps(svg,gs){const r=parseSvg(svg);if(!r)return '';const defs={},out=[];
 (function collect(n){if(n.attrs&&n.attrs.id)defs[n.attrs.id]=n;(n.children||[]).forEach(collect)})(r);
 const INH=['fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','stroke-miterlimit','stroke-dasharray','fill-rule','fill-opacity','stroke-opacity','font-family','font-size','font-weight','text-anchor','letter-spacing','dominant-baseline'];
 function walk(n,st){if(n.tag==='#text'||/^(defs|title|desc|lineargradient|radialgradient|stop|clippath|metadata|style|script)$/.test(n.tag))return;
  const s={...st};for(const k of INH)if(n.attrs[k]!=null&&n.attrs[k]!=='inherit')s[k]=n.attrs[k];s.opacity=(st.opacity==null?1:st.opacity)*(n.attrs.opacity!=null?Math.max(0,Math.min(1,+n.attrs.opacity||0)):1);
  const T=n.attrs.transform?transform(n.attrs.transform):null;if(T)out.push('q '+T.map(num).join(' ')+' cm');
  if(n.tag==='g'||n.tag==='svg')n.children.forEach(c=>walk(c,s));else if(n.tag==='text')text(n,s);else shape(n,s);
  if(T)out.push('Q')}
 function paint(geom,s,closedOnly){const fill=closedOnly?null:colour(s.fill==null?'#000000':s.fill,defs),stroke=colour(s.stroke,defs),sw=s['stroke-width']==null?1:len(s['stroke-width']);
  if(!fill&&!(stroke&&sw>0))return;const fa=s.opacity*(s['fill-opacity']!=null?+s['fill-opacity']:1),sa=s.opacity*(s['stroke-opacity']!=null?+s['stroke-opacity']:1);
  out.push('q');if(fa<1||sa<1)out.push('/'+gs(fill?fa:1,stroke?sa:1)+' gs');if(fill)out.push(rgb(fill)+' rg');
  if(stroke&&sw>0){out.push(rgb(stroke)+' RG',num(sw)+' w');const cap={round:1,square:2}[s['stroke-linecap']],join={round:1,bevel:2}[s['stroke-linejoin']];if(cap)out.push(cap+' J');if(join)out.push(join+' j');
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
  out.push('q'+(fa<1?' /'+gs(fa,1)+' gs':'')+' '+rgb(fill)+' rg BT /'+(bold?'F2':'F1')+' 1 Tf '+(ls?num(ls/size)+' Tc ':'')+[size,0,0,-size,x,y].map(num).join(' ')+' Tm '+hexStr(str)+' Tj ET Q')}
 walk(r,{opacity:1});return out.join('\n')}

// ---- PDF writer (PDF 1.4, uncompressed content, standard fonts with WinAnsiEncoding) ----
const hexStr=s=>'<'+codes(s).map(c=>c.toString(16).padStart(2,'0')).join('').toUpperCase()+'>';
const pdfText=s=>'('+codes(s).map(c=>c===40||c===41||c===92?'\\'+String.fromCharCode(c):c<32||c>126?'\\'+c.toString(8).padStart(3,'0'):String.fromCharCode(c)).join('')+')';
function pdfDate(d){const p=n=>String(n).padStart(2,'0');return 'D:'+d.getUTCFullYear()+p(d.getUTCMonth()+1)+p(d.getUTCDate())+p(d.getUTCHours())+p(d.getUTCMinutes())+p(d.getUTCSeconds())+'Z'}
const latin1=s=>{const b=new Uint8Array(s.length);for(let i=0;i<s.length;i++)b[i]=s.charCodeAt(i)&255;return b};
// doc: layout(); mode 'print' (bleed + marks) or 'web' (trim only). A logo item may carry raster {w,h,jpeg:Uint8Array} (browser).
function pdf(doc,{mode='print',date=new Date()}={}){const print=mode!=='web',bl=print?BLEED:0,objs=[],alpha={};
 const add=o=>{objs.push(o);return objs.length};const ref=n=>n+' 0 R';
 const catalog=add(null),pages=add(null),f1=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),f2=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
 const gs=(ca,CA)=>{const k='GS'+Math.round(ca*100)+'_'+Math.round(CA*100);if(!alpha[k])alpha[k]=add('<< /Type /ExtGState /ca '+num(ca)+' /CA '+num(CA)+' >>');return k};
 const kids=[];
 for(const p of doc.pages){const W=p.w+2*bl,H=p.h+2*bl,X=x=>num((x+bl)*MM),Y=y=>num((H-(y+bl))*MM),ops=[],images={};
  if(!print)ops.push('0 0 '+num(W*MM)+' '+num(H*MM)+' re W n');
  for(const it of p.items){
   if(it.t==='rect')ops.push(rgb(it.fill)+' rg '+X(it.x)+' '+Y(it.y+it.h)+' '+num(it.w*MM)+' '+num(it.h*MM)+' re f');
   else if(it.t==='line')ops.push(rgb(it.stroke)+' RG '+num(it.width)+' w '+X(it.x1)+' '+Y(it.y1)+' m '+X(it.x2)+' '+Y(it.y2)+' l S');
   else if(it.t==='text')ops.push('BT /'+(it.bold?'F2':'F1')+' '+num(it.size)+' Tf '+rgb(it.fill)+' rg '+X(it.x)+' '+Y(it.y)+' Td '+hexStr(it.s)+' Tj ET');
   else if(it.t==='logo'){if(it.raster){const name='Im'+(Object.keys(images).length+1),d=it.raster;
     images[name]=add({dict:'<< /Type /XObject /Subtype /Image /Width '+d.w+' /Height '+d.h+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+d.jpeg.length+' >>',stream:d.jpeg});
     ops.push('q '+num(it.w*MM)+' 0 0 '+num(it.h*MM)+' '+X(it.x)+' '+Y(it.y+it.h)+' cm /'+name+' Do Q')}
    else{const [vx,vy,vw,vh]=it.vb,k=it.w/vw*MM,ky=it.h/vh*MM;ops.push('q '+[k,0,0,-ky,(it.x+bl)*MM-vx*k,(H-(it.y+bl))*MM+vy*ky].map(num).join(' ')+' cm '+'0 0 0 rg','% logo',svgOps(it.svg,gs),'Q')}}}
  if(print)for(const mk of marks(p,bl)){const seg=X(mk.x1-bl)+' '+Y(mk.y1-bl)+' m '+X(mk.x2-bl)+' '+Y(mk.y2-bl)+' l S';
   ops.push('q 1 1 1 RG 0.9 w '+seg+' Q','q 0 0 0 RG 0.3 w '+(mk.kind==='fold'?'[1.5 1] 0 d ':'')+seg+' Q')}
  const content=ops.join('\n'),c=add({dict:'<< /Length '+content.length+' >>',stream:content});
  const gsDict=Object.keys(alpha).length?' /ExtGState << '+Object.entries(alpha).map(([k,n])=>'/'+k+' '+ref(n)).join(' ')+' >>':'',xo=Object.keys(images).length?' /XObject << '+Object.entries(images).map(([k,n])=>'/'+k+' '+ref(n)).join(' ')+' >>':'';
  const box='[0 0 '+num(W*MM)+' '+num(H*MM)+']',trim='['+num(bl*MM)+' '+num(bl*MM)+' '+num((bl+p.w)*MM)+' '+num((bl+p.h)*MM)+']';
  kids.push(add('<< /Type /Page /Parent '+ref(pages)+' /MediaBox '+box+' /BleedBox '+box+' /TrimBox '+trim+' /Resources << /Font << /F1 '+ref(f1)+' /F2 '+ref(f2)+' >>'+gsDict+xo+' >> /Contents '+ref(c)+' >>'))}
 objs[catalog-1]='<< /Type /Catalog /Pages '+ref(pages)+' >>';objs[pages-1]='<< /Type /Pages /Kids ['+kids.map(ref).join(' ')+'] /Count '+kids.length+' >>';
 const info=add('<< /Title '+pdfText(doc.title+(print?' · tipografia':' · web'))+' /Producer (RADIX Studio Stampa) /Creator (RADIX) /CreationDate ('+pdfDate(date)+') >>');
 const chunks=[],offsets=[];let pos=0;const push=x=>{const b=typeof x==='string'?latin1(x):x;chunks.push(b);pos+=b.length};
 push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
 objs.forEach((o,i)=>{offsets.push(pos);if(o&&o.stream!=null){push((i+1)+' 0 obj\n'+o.dict+'\nstream\n');push(o.stream);push('\nendstream\nendobj\n')}else push((i+1)+' 0 obj\n'+o+'\nendobj\n')});
 const xref=pos;push('xref\n0 '+(objs.length+1)+'\n0000000000 65535 f \n'+offsets.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join(''));
 push('trailer\n<< /Size '+(objs.length+1)+' /Root '+ref(catalog)+' /Info '+ref(info)+' >>\nstartxref\n'+xref+'\n%%EOF\n');
 const out=new Uint8Array(pos);let o=0;for(const c of chunks){out.set(c,o);o+=c.length}return out}

// ---- SVG preview (same items; Helvetica-compatible fonts) ----
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const svgUrl=svg=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
// guides: bleed shown greyed, trim line, safe area (dashed), folds.
let clipId=0;
function previewSvg(doc,pageIndex,{guides=true,safe=SAFE}={}){const p=doc.pages[pageIndex],bl=guides?BLEED:0,W=p.w+2*bl,H=p.h+2*bl,o=[];
 o.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+[-bl,-bl,W,H].map(num).join(' ')+'" width="'+num(W)+'mm" height="'+num(H)+'mm" role="img" aria-label="'+esc(p.label)+'">');
 const cid='pr-trim-'+(++clipId);if(!guides)o.push('<defs><clipPath id="'+cid+'"><rect x="0" y="0" width="'+num(p.w)+'" height="'+num(p.h)+'"/></clipPath></defs><g clip-path="url(#'+cid+')">');else o.push('<g>');
 for(const it of p.items){if(it.t==='rect')o.push('<rect x="'+num(it.x)+'" y="'+num(it.y)+'" width="'+num(it.w)+'" height="'+num(it.h)+'" fill="'+it.fill+'"/>');
  else if(it.t==='line')o.push('<line x1="'+num(it.x1)+'" y1="'+num(it.y1)+'" x2="'+num(it.x2)+'" y2="'+num(it.y2)+'" stroke="'+it.stroke+'" stroke-width="'+num(ptToMm(it.width))+'"/>');
  else if(it.t==='text')o.push('<text x="'+num(it.x)+'" y="'+num(it.y)+'" font-family="Helvetica, Arial, \'Liberation Sans\', sans-serif" font-size="'+num(ptToMm(it.size))+'"'+(it.bold?' font-weight="700"':'')+' fill="'+it.fill+'" xml:space="preserve">'+esc(it.s)+'</text>');
  else if(it.t==='logo')o.push('<image x="'+num(it.x)+'" y="'+num(it.y)+'" width="'+num(it.w)+'" height="'+num(it.h)+'" preserveAspectRatio="none" href="'+esc(svgUrl(it.svg))+'"/>')}
 o.push('</g>');
 if(guides){o.push('<path fill="#ffffff" fill-opacity=".55" fill-rule="evenodd" d="M'+-bl+' '+-bl+'h'+W+'v'+H+'h'+-W+'z M0 0v'+p.h+'h'+p.w+'v'+-p.h+'z"/>');
  o.push('<rect x="0" y="0" width="'+num(p.w)+'" height="'+num(p.h)+'" fill="none" stroke="#e5484d" stroke-width=".25"/>');
  const areas=p.folds.length?[0,...p.folds,p.w].slice(0,-1).map((x,i,a)=>[x,(p.folds[i]!=null?p.folds[i]:p.w)-x]):[[0,p.w]];
  for(const [x,w] of areas)o.push('<rect x="'+num(x+safe)+'" y="'+num(safe)+'" width="'+num(w-2*safe)+'" height="'+num(p.h-2*safe)+'" fill="none" stroke="#2f80ed" stroke-width=".2" stroke-dasharray="1 .8"/>');
  for(const f of p.folds)o.push('<line x1="'+num(f)+'" y1="'+-bl+'" x2="'+num(f)+'" y2="'+num(p.h+bl)+'" stroke="#8a8f98" stroke-width=".25" stroke-dasharray="2 1.2"/>');
  for(const mk of marks(p,bl))o.push('<line x1="'+num(mk.x1-bl)+'" y1="'+num(mk.y1-bl)+'" x2="'+num(mk.x2-bl)+'" y2="'+num(mk.y2-bl)+'" stroke="#000" stroke-width=".12"/>')}
 o.push('</svg>');return o.join('')}

// ---- saved in the project ----
const slug=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50);
const filename=(doc,mode)=>'stampa-'+doc.format+'-'+(slug(doc.values.name)||'progetto')+'-'+(mode==='web'?'web':'tipografia')+'.pdf';
const ROLE_LABEL={primary:'Primario',secondary:'Secondario',accent:'Accento',dark:'Neutro scuro',light:'Neutro chiaro'};
function notes(doc){const b=doc.brand,out=['Colori in RGB: la tipografia li converte in CMYK, quindi possono cambiare un poco (soprattutto i colori molto accesi). Chiedi una prova colore se conta.',
  'Testo in Helvetica, uno dei font standard del PDF (non incorporato)'+(b.fonts.heading?': i font del kit ('+[...new Set([b.fonts.heading,b.fonts.body].filter(Boolean))].join(' e ')+') non si possono incorporare da qui':'')+'. Se la tipografia vuole tutti i font incorporati, fai rifinire il file da un grafico.'];
 const logo=doc.pages.flatMap(p=>p.items).find(i=>i.t==='logo');
 out.push(!logo?'Nessun logo nel kit: al suo posto c’è il nome come logotipo.':needsRaster(logo.svg)?'Il logo usa sfumature o maschere: nel PDF è un’immagine a '+DPI+' dpi.':'Logo vettoriale (le scritte del logo sono in Helvetica).');
 if(!b.fromKit)out.push('Nessun kit identità nel progetto: colori neutri. Crea il Kit identità per usare i colori del brand.');return out}
function toMarkdown(doc,{date}={}){const f=need(doc.format),day=date||new Date().toISOString().slice(0,10),L=['# Stampa · '+doc.title,''];
 L.push('Formato: '+f.title+' · '+f.size+' · PDF per la tipografia '+mmText(f.w+2*BLEED)+' × '+mmText(f.h+2*BLEED)+' mm (abbondanza '+BLEED+' mm per lato, segni di taglio) · margine '+mmText(doc.margin)+' mm · '+day,'');
 L.push('## Testi','');for(const k of f.fields){const v=block(doc.values[k]);if(v)L.push('- **'+FIELDS[k].label+'**: '+v.replace(/\n+/g,' / '))}
 L.push('','## Colori (RGB)','',...Object.entries(doc.brand.palette).map(([r,h])=>'- '+ROLE_LABEL[r]+': '+h),'');
 if(doc.warnings.length)L.push('## Da controllare','',...doc.warnings.map(w=>'- '+w.text),'');
 L.push('## Note per la stampa','',...notes(doc).map(n=>'- '+n));return L.join('\n')}
const MAX_KEPT=60;
function savedEntry(doc,md,{by,at}={}){const when=at||new Date().toISOString(),f=need(doc.format);
 return [{role:'user',content:f.title+' preparato nello Studio Stampa del pannello Marketing.',display:f.title+' preparato nello Studio Stampa',by:by||'Pannello Marketing',at:when,source:'print-studio'},
  {role:'assistant',agent:AGENT,content:'Ecco i dati del materiale da stampare, salvati nel progetto (il PDF si scarica dallo Studio Stampa).\n\n---DOCUMENTO: Stampa · '+doc.title+'---\n'+md+'\n---FINE DOCUMENTO---',at:when,source:'print-studio',print:{format:doc.format,margin:doc.margin,values:doc.values}}]}
async function saveToProject(ws,projectId,doc,opts={}){if(!ws||typeof ws.bind!=='function')throw Error('Archivio del progetto non disponibile.');
 const d=ws.bind(projectId,'agents'),md=toMarkdown(doc);
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
// Logos with gradients or clip paths → JPEG at 300 dpi on the colour behind them (browser canvas).
async function rasterize(doc){for(const p of doc.pages)for(const it of p.items){if(it.t!=='logo'||!needsRaster(it.svg))continue;
 const w=Math.max(1,Math.round(it.w/25.4*DPI)),h=Math.max(1,Math.round(it.h/25.4*DPI)),img=new root.Image();img.src=svgUrl(it.svg);await img.decode();
 const c=dom().createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle=it.bg||'#FFFFFF';x.fillRect(0,0,w,h);x.drawImage(img,0,0,w,h);
 const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.92));it.raster={w,h,jpeg:new Uint8Array(await blob.arrayBuffer())}}
 return doc}
// ctx: {project (profileFor summary), profile (raw project profile, with identityKit), projectName, projectId, workspace, agentsUrl, by}
function printStudio(ctx={}){const n=++counter,brand=brandOf(ctx.profile,ctx.projectName),values={...prefill(ctx.profile,{projectName:ctx.projectName,summary:ctx.project}),margin:''};
 let fmt='biglietto',guides=true,last=null;
 const wrap=el('div',undefined,'tool photo-studio print-studio'),steps=el('ol',undefined,'ps-steps');['Il formato','I testi','Anteprima e PDF'].forEach((t,i)=>{const li=el('li',(i+1)+' · '+t);li.dataset.step=String(i+1);steps.append(li)});
 const setStep=k=>[...steps.children].forEach(li=>li.dataset.state=+li.dataset.step<k?'done':+li.dataset.step===k?'current':'todo');
 const formats=el('fieldset',undefined,'pr-formats');formats.append(el('legend','Cosa stampi'));
 FORMATS.forEach(f=>{const l=el('label',undefined,'ps-chip pr-format'),r=el('input');r.type='radio';r.name='pr-format-'+n;r.value=f.id;r.checked=f.id===fmt;r.onchange=()=>{fmt=f.id;setStep(2);fields();update()};
  l.append(r,el('b',' '+f.title),el('small',f.size,'muted'));formats.append(l)});
 const brandLine=el('p',brand.fromKit?'Colori e logo dal Kit identità'+(brand.direction?' «'+brand.direction+'»':'')+(brand.logo?'':' (senza logo: uso il nome come logotipo)')+'.':'Nessun Kit identità nel progetto: uso colori neutri e il nome come logotipo. Puoi crearlo dalla card «Kit identità».','pr-brand');
 const sw=el('span',undefined,'pr-swatches');Object.entries(brand.palette).forEach(([r,h])=>{const s=el('i');s.style.background=h;s.title=ROLE_LABEL[r]+' '+h;sw.append(s)});brandLine.prepend(sw);
 const grid=el('div',undefined,'pr-fields'),inputs={};
 const paste=el('details',undefined,'pr-paste'),ta=el('textarea'),use=button('Usa questo testo'),pick=el('select'),pst=el('span','','muted');
 paste.append(el('summary','Incolla un testo dallo Studio Testi'));ta.rows=5;ta.placeholder='Incolla qui il testo scelto nello Studio Testi (brochure, testi per il sito…): titoli e sezioni vanno nei campi giusti.';
 pick.hidden=true;pick.setAttribute('aria-label','Testi salvati nel progetto');const pb=el('div',undefined,'ps-actions');pb.append(pick,use,pst);paste.append(ta,pb);
 paste.addEventListener('toggle',async()=>{if(!paste.open||pick.dataset.loaded||!ctx.workspace||!ctx.projectId)return;pick.dataset.loaded='1';
  try{const list=savedCopies(await ctx.workspace.bind(ctx.projectId,'agents').load());if(!list.length)return;
   pick.replaceChildren(new root.Option('Oppure scegli un testo salvato…',''),...list.slice(0,20).map((c,i)=>new root.Option(c.title,String(i))));pick.hidden=false;pick.onchange=()=>{const c=list[+pick.value];if(c)ta.value=c.md}}catch(e){}});
 use.onclick=()=>{const r=fromCopy(fmt,parseCopy(ta.value),values);Object.assign(values,r.values);fields();update();pst.textContent=r.used?'Testo distribuito in '+r.used+' campi: controlla l’anteprima.'+(r.notes.length?' '+r.notes.join(' '):''):r.notes.join(' ')};
 function fields(){const f=need(fmt);grid.replaceChildren();for(const k of f.fields){const d=FIELDS[k],l=el('label',d.label,d.rows?'pr-wide':''),i=el(d.rows?'textarea':'input');if(d.rows)i.rows=d.rows;else i.type='text';
   i.maxLength=d.max;i.placeholder=d.ph||'';i.value=values[k]||'';i.oninput=()=>{values[k]=i.value;setStep(3);update()};l.append(i);grid.append(l);inputs[k]=i}
  const ml=el('label','Margine dal bordo (mm)'),mi=el('input');mi.type='number';mi.min='0';mi.max='40';mi.step='0.5';mi.placeholder=String(f.margin);mi.value=values.margin;mi.oninput=()=>{values.margin=mi.value;update()};ml.append(mi);grid.append(ml)}
 const view=el('div',undefined,'pr-preview'),gl=el('label',undefined,'ps-chip'),gc=el('input');gc.type='checkbox';gc.checked=true;gc.onchange=()=>{guides=gc.checked;update()};gl.append(gc,dom().createTextNode(' Mostra abbondanza, area sicura e pieghe'));
 const warn=el('ul',undefined,'pr-warn'),note=el('ul',undefined,'pr-notes'),st=el('p','','tool-status');st.setAttribute('role','status');
 const dp=button('Scarica PDF per la tipografia','primary'),dw=button('Scarica PDF per il web'),acts=el('div',undefined,'ps-actions');acts.append(dp,dw);
 const go=async mode=>{const doc=layout(fmt,values,brand);try{await rasterize(doc)}catch(e){st.textContent='Logo non convertito in immagine ('+e.message+'): nel PDF uso i suoi colori pieni.'}
  const bytes=pdf(doc,{mode}),name=download(filename(doc,mode),bytes,'application/pdf');const s=pageSize(fmt,mode);
  st.textContent='Scaricato: '+name+' · '+doc.pages.length+(doc.pages.length>1?' pagine':' pagina')+' da '+mmText(s.w)+' × '+mmText(s.h)+' mm'+(mode==='web'?'.':' (formato + '+BLEED+' mm di abbondanza per lato, segni di taglio).')+(doc.warnings.some(w=>w.kind==='safe'||w.kind==='overflow')?' Attenzione: ci sono punti da controllare.':'')};
 dp.onclick=()=>go('print');dw.onclick=()=>go('web');
 if(ctx.workspace&&ctx.projectId){const sv=button('Salva nel progetto');acts.append(sv);
  sv.onclick=async()=>{sv.disabled=true;st.textContent='Salvo i dati nel progetto…';
   try{await saveToProject(ctx.workspace,ctx.projectId,last||layout(fmt,values,brand),{by:ctx.by});st.replaceChildren(dom().createTextNode('Salvato nel progetto: formato, testi, colori e controlli sono tra i documenti dell’Art Director (il PDF lo scarichi da qui). '));
    if(ctx.agentsUrl){const a=el('a','Apri in Agenti AI →');a.href=ctx.agentsUrl;st.append(a)}}catch(e){st.textContent='Non salvato: '+e.message}finally{sv.disabled=false}}}
 let raf=0;function update(){if(raf)return;const run=()=>{raf=0;const doc=last=layout(fmt,values,brand);
  view.replaceChildren(...doc.pages.map((p,i)=>{const fig=el('figure',undefined,'pr-page');fig.dataset.format=fmt;const holder=el('div',undefined,'pr-svg');holder.innerHTML=previewSvg(doc,i,{guides});fig.append(holder,el('figcaption',p.label+' · '+mmText(p.w)+' × '+mmText(p.h)+' mm'));return fig}));
  warn.replaceChildren(...(doc.warnings.length?doc.warnings.map(w=>{const li=el('li',w.text);li.dataset.kind=w.kind;return li}):[el('li','Testi e logo stanno nell’area sicura ('+SAFE+' mm dal taglio'+(need(fmt).panels?' e dalle pieghe':'')+').','pr-ok')]));
  warn.dataset.warn=String(doc.warnings.length>0);note.replaceChildren(...notes(doc).map(t=>el('li',t)))};
  raf=root.requestAnimationFrame?root.requestAnimationFrame(run):(run(),0)}
 wrap.append(steps,formats,brandLine,paste,grid,gl,view,warn,acts,st,note);setStep(1);fields();update();return wrap}

return Object.freeze({MM,BLEED,SAFE,DPI,AGENT,FIELDS,FORMATS,format,mmToPt,ptToMm,pageSize,brandOf,contrast,ink,prefill,contactsIn,parseCopy,fromCopy,winAnsi,textWidth,wrap,layout,safeArea,marks,viewBox,needsRaster,parseSvg,pathOps,arcToCubics,svgOps,pdf,previewSvg,notes,toMarkdown,filename,savedEntry,saveToProject,savedCopies,printStudio});
});
