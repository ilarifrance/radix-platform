/* Studio «Logo in vettoriale» (agency job B7, the free part): the logo the client already has, as a PNG, JPG or WebP
   (or an SVG, cleaned first), redrawn as a clean SVG in the browser, with NO AI, no network and no cost. The image never
   leaves the computer.
   1. Upload and three questions: what the logo is (simbolo, scritta, entrambi), how many colours (automatic: the ones
      found), keep or drop the background. An SVG is cleaned with the sanitizer of lib/identity-studio.js (no scripts,
      no external links, no event attributes, no foreignObject) and then traced like a picture; the cleaned original also
      goes in the zip.
   2. Three proposals traced here (lib/logo-trace.js): «Fedele», «Pulito» (fewer nodes, smoother), «Essenziale» (fewer
      colours, flat), side by side with their node count and a before/after overlay on the original.
   3. Refinement: colours, detail and smoothing sliders, the background, each layer recoloured by hand or with the colours
      of the Kit identità, which layers stay full or empty in the mono versions; previews in colour, mono black, mono
      white on dark, the clear space and the small-size test at 16, 32 and 64 px.
   4. Export, one zip: logo.svg, logo-mono-nero.svg, logo-mono-bianco.svg, PNG at 512, 1024 and 2048 px, favicon 32 px and
      the 180 px Apple icon, a one-page «scheda logo» PDF with vector paths (lib/print-studio.js writer, RGB for the web),
      LEGGIMI.txt: text in the logo is traced as shapes, a designer should check the font when editable type is needed.
   Saved in the project: the «agents» document under the key logoVector (agents-page.js keeps it): settings and the SVG
   (capped in size), never the picture. «Usa nel Kit identità» puts the SVG as the logo of profile.identityKit, the same
   field lib/identity-studio.js writes and the other studios read (the other fields of the kit stay).
   Pure part runs in Node for the tests; logoVectorStudio() is the browser widget. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixLogoVectorStudio=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const askConfirm=o=>{const C=root.RadixConfirm||(typeof require==='function'?require('./radix-confirm.js'):null);return C?C.ask(o):Promise.resolve(!!root.confirm([o.title,o.message].filter(Boolean).join('\n')))};
function lib(name,file){if(root[name])return root[name];try{return typeof require==='function'?require(file):null}catch(e){return null}}
const T=()=>lib('RadixLogoTrace','./logo-trace.js'),PS=()=>lib('RadixPrintStudio','./print-studio.js'),ZIP=()=>lib('RadixZip','./zip-lite.js'),IS=()=>lib('RadixIdentityStudio','./identity-studio.js');
const AGENT='art-director',MAX_SAVED=6,SVG_SAVE_MAX=40000,KIT_MAX=19000,FILE_MAX=15e6,SVG_FILE_MAX=2e6,PNG_SIZES=Object.freeze([512,1024,2048]);
const clean=s=>String(s==null?'':s).replace(/[ \t ]+/g,' ').trim();
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const slug=s=>norm(s).replace(/ /g,'-').slice(0,40);
const clamp=(v,a,b)=>v<a?a:v>b?b:v;

// ---- the questions ----
const TYPES=Object.freeze([
 {id:'simbolo',title:'Simbolo',line:'Un disegno, un marchio, un’icona.'},
 {id:'scritta',title:'Scritta',line:'Solo il nome, in lettere.'},
 {id:'entrambi',title:'Simbolo e scritta',line:'Il disegno con il nome accanto o sotto.'}]);
const typeOf=id=>TYPES.find(t=>t.id===id)||TYPES[2];
// The size the picture is traced at: the long side between 600 and 900 px (small logos are enlarged smoothly first),
// the short side at least 160 px when the long one can stay under 1600.
function traceSize(w,h){w=Math.max(1,+w||1);h=Math.max(1,+h||1);const long=Math.max(w,h),short=Math.min(w,h);let s=clamp(long,600,900)/long;
 if(short*s<160)s=Math.max(s,Math.min(160/short,1600/long));return [Math.max(1,Math.round(w*s)),Math.max(1,Math.round(h*s))]}
// The root of a cleaned SVG with a width and height (long side `side`), so the browser can draw it on a canvas.
function sizedSvg(svg,side=1000){const s=String(svg||''),m=/^<svg\b[^>]*>/.exec(s);if(!m)return '';const vb=/viewBox="([^"]+)"/.exec(m[0]),n=vb?vb[1].trim().split(/[\s,]+/).map(Number):[];
 const vw=n[2]>0?n[2]:240,vh=n[3]>0?n[3]:80,k=side/Math.max(vw,vh),tag=m[0].replace(/\s(width|height)="[^"]*"/g,'').replace(/^<svg\b/,'<svg width="'+Math.round(vw*k)+'" height="'+Math.round(vh*k)+'"');
 return tag+s.slice(m[0].length)}

// ---- files ----
const dateText=d=>(d||new Date()).toISOString().slice(0,10);
const rgbText=h=>T().rgbOf(h).join(' ');
const cmykText=h=>{const P=PS();return P&&P.cmykOf?P.cmykOf(h).join(' '):''};
const proposalOf=id=>T().PROPOSALS.find(p=>p.id===id)||null;
const brandName=(name,fallback)=>clean(name)||clean(fallback)||'Logo';
const zipName=name=>'logo-vettoriale-'+(slug(name)||'logo')+'.zip';
// The PNG sizes: the long side at 512, 1024 and 2048 px.
function pngSize(r,side){const [,,w,h]=r.viewBox,k=side/Math.max(w,h);return [Math.max(1,Math.round(w*k)),Math.max(1,Math.round(h*k))]}
// The clear space: a quarter of the short side of the logo, all around.
const clearSpace=r=>Math.min(r.viewBox[2],r.viewBox[3])/4;
// The clear-space preview: the logo, the free area around it (light blue) and its edge (dashed).
function safeSvg(r){const L=T(),m=clearSpace(r),[x,y,w,h]=r.viewBox,box=[x-m,y-m,w+2*m,h+2*m],base=L.svgOf(r,{box,width:600,height:Math.round(600*box[3]/box[2])}),n=v=>Math.round(v*10)/10,sw=n(Math.max(w,h)/240);
 const under='<path fill="#EAF2FC" d="M0 0H'+n(box[2])+'V'+n(box[3])+'H0Z"/><path fill="none" stroke="#2F7FD8" stroke-width="'+sw+'" stroke-dasharray="'+n(sw*4)+' '+n(sw*3)+'" d="M'+n(m)+' '+n(m)+'H'+n(m+w)+'V'+n(m+h)+'H'+n(m)+'Z"/>';
 return base.replace(/^(<svg[^>]*>)/,'$1'+under)}
function readme(r,{name,proposal,date,files,original}={}){const p=proposalOf(proposal),s=r.settings,L=[];
 L.push('LOGO IN VETTORIALE · '+brandName(name),'Creato con RADIX il '+dateText(date)+': ricalco automatico nel browser, senza AI e senza costi. L’immagine di partenza non è stata caricata da nessuna parte.','');
 L.push('Proposta: '+(p?p.title:'su misura')+' · '+r.layers.length+(r.layers.length===1?' colore':' colori')+' · '+r.nodes+' nodi · dettaglio '+s.detail+'/100 · morbidezza '+s.smooth+'/100'+(r.keepBg?' · con lo sfondo':' · sfondo trasparente'),'');
 L.push('FILE');for(const f of files||[])L.push('- '+f.name+(f.label?': '+f.label:''));L.push('');
 L.push('COLORI (dal basso verso l’alto)');r.layers.forEach((l,i)=>L.push('- '+l.color+' · RGB '+rgbText(l.color)+' · CMYK '+cmykText(l.color)+' (indicativo)'+(l.color!==l.original?' · ricolorato (era '+l.original+')':'')));
 if(r.keepBg&&r.bgColor)L.push('- Sfondo '+r.bgColor+' · RGB '+rgbText(r.bgColor));L.push('');
 L.push('IMPORTANTE');
 L.push('- Le scritte del logo sono state ricalcate come forme, non come testo: non si modificano con la tastiera e il font non è incluso. Se ti serve il testo modificabile, o il logo va ridisegnato con il font originale, fai verificare a un grafico quale font è stato usato.');
 L.push('- Il ricalco segue i pixel dell’immagine di partenza: sfumature, ombre e bordi sfocati diventano colori pieni, i dettagli più piccoli di un pixel si perdono. Guarda il logo ingrandito prima di stamparlo in grande.');
 L.push('- I valori CMYK sono una conversione indicativa: per la stampa chiedi la prova colore alla tipografia.');
 L.push('- Area di rispetto: lascia libero intorno al logo almeno un quarto del suo lato corto. Misura minima consigliata: 20 mm di larghezza in stampa, 120 px sullo schermo (prova a 16 e 32 px se lo usi come icona).');
 if(original)L.push('- originale-pulito.svg è il tuo file SVG di partenza, ripulito da script, link esterni e attributi evento.');
 L.push('- Il marchio resta tuo: RADIX non lo registra né ne verifica la disponibilità (UIBM, TMview, WIPO).');
 return L.join('\r\n')+'\r\n'}
// The «scheda logo»: one A4 page with vector paths (lib/print-studio.js items in mm, origin top left).
function schedaDoc(r,{name,date}={}){const L=T(),P=PS(),M=18,W=210,items=[],grey='#6B6F80',ink='#1D1A27',txt=(s,x,y,size,bold,fill)=>items.push({t:'text',x,y,s,size,bold:!!bold,fill:fill||ink});
 const put=(variant,box)=>{for(const p of L.pdfPaths(r,{...box,variant}).paths)items.push({t:'path',d:p.d,fill:p.fill,evenodd:true,label:'Logo'})};
 const frame=(x,y,w,h)=>items.push({t:'path',d:'M'+x+' '+y+'h'+w+'v'+h+'h'+(-w)+'Z',stroke:'#D9D6E2',width:.6,label:'Riquadro'});
 txt('SCHEDA LOGO',M,20,8,true,grey);const nm=brandName(name);let size=22;while(size>12&&P.ptToMm(P.textWidth(nm,size,true))>W-2*M)size--;txt(nm.slice(0,60),M,31,size,true);txt('Ricalcato in vettoriale con RADIX il '+dateText(date)+' · '+r.layers.length+(r.layers.length===1?' colore':' colori')+' · '+r.nodes+' nodi',M,38,8.5,false,grey);
 items.push({t:'rect',x:M,y:46,w:W-2*M,h:86,fill:r.keepBg&&r.bgColor?'#FFFFFF':'#F4F4F7',label:'Fondo'});put('color',{x:M+12,y:56,w:W-2*M-24,h:66});txt('A colori',M,137.5,8,true,grey);
 const bw=(W-2*M-6)/2;items.push({t:'rect',x:M,y:142,w:bw,h:50,fill:'#FFFFFF'});frame(M,142,bw,50);put('black',{x:M+8,y:150,w:bw-16,h:34});
 items.push({t:'rect',x:M+bw+6,y:142,w:bw,h:50,fill:'#1C1C1E'});put('white',{x:M+bw+14,y:150,w:bw-16,h:34});txt('Mono nero',M,197.5,8,true,grey);txt('Mono bianco',M+bw+6,197.5,8,true,grey);
 txt('Colori',M,208,10,true);const cols=r.layers.map(l=>l.color).concat(r.keepBg&&r.bgColor?[r.bgColor]:[]).slice(0,6),cw=(W-2*M)/Math.max(3,cols.length);
 cols.forEach((h,i)=>{const x=M+i*cw;items.push({t:'rect',x,y:212,w:10,h:10,fill:h});frame(x,212,10,10);txt(h,x+12,215.5,8,true);txt('RGB '+rgbText(h),x+12,219.2,6.5,false,grey);txt('CMYK '+cmykText(h),x+12,222.7,6.5,false,grey)});
 txt('Area di rispetto e misura minima',M,234,10,true);
 const m=clearSpace(r),[,,vw,vh]=r.viewBox,k=Math.min(64/(vw+2*m),34/(vh+2*m)),ow=(vw+2*m)*k,oh=(vh+2*m)*k;items.push({t:'rect',x:M,y:239,w:ow,h:oh,fill:'#EAF2FC',label:'Area di rispetto'});
 put('color',{x:M+m*k,y:239+m*k,w:vw*k,h:vh*k});items.push({t:'path',d:'M'+(M+m*k)+' '+(239+m*k)+'h'+vw*k+'v'+vh*k+'h'+(-vw*k)+'Z',stroke:'#2F7FD8',width:.5,dash:[2,1.5],label:'Area di rispetto'});
 const tx=M+Math.max(ow,40)+8;['Lascia libero intorno al logo almeno un quarto del suo lato corto','(la fascia azzurra). Niente testi, bordi o altre immagini lì dentro.','Misura minima consigliata: 20 mm di larghezza in stampa,','120 px sullo schermo. Per le icone prova a 16 e 32 px.'].forEach((s,i)=>txt(s,tx,243+i*4.6,7.5,false,ink));
 ['Le scritte del logo sono forme tracciate, non testo: per un testo modificabile serve il font originale (da verificare con un grafico).','Ricalco automatico dai pixel dell’immagine di partenza: controlla il logo ingrandito prima della stampa in grande formato.'].forEach((s,i)=>txt(s,M,281+i*4,6.5,false,grey));
 return {title:'Scheda logo · '+brandName(name),pages:[{w:210,h:297,label:'Scheda logo',items}]}}
// Every file of the zip: [{name, data, label}]. opts.png(svg, w, h) → PNG bytes (the browser canvas); without it the PNG
// files are left out (Node tests pass a stub).
async function files(r,{name,proposal,date=new Date(),png,original}={}){const L=T(),P=PS(),title=brandName(name),out=[],add=(n,data,label)=>out.push({name:n,data,label});
 if(!r||!r.layers||!r.layers.length)throw Error('Nessuna forma da esportare: prova con più colori o più dettaglio.');
 add('logo.svg',L.svgOf(r,{title}),'Logo a colori, vettoriale'+(r.keepBg?' con lo sfondo':', sfondo trasparente'));
 add('logo-mono-nero.svg',L.svgOf(r,{variant:'black',title:title+' · mono nero'}),'Una sola tinta nera, per timbri, fax, incisioni e fondi chiari');
 add('logo-mono-bianco.svg',L.svgOf(r,{variant:'white',title:title+' · mono bianco'}),'Bianco, per fondi scuri e foto');
 if(original)add('originale-pulito.svg',original,'Il tuo SVG di partenza, ripulito (niente script, link esterni o attributi evento)');
 const box=L.squareBox(r);add('favicon/favicon.svg',L.svgOf(r,{box,title}),'Icona quadrata vettoriale per il sito');
 if(png){for(const side of PNG_SIZES){const [w,h]=pngSize(r,side);add('png/logo-'+side+'.png',await png(L.svgOf(r,{title,width:w,height:h}),w,h),'PNG '+w+' × '+h+' px'+(r.keepBg?'':', sfondo trasparente'))}
  add('favicon/favicon-32.png',await png(L.svgOf(r,{box,width:32,height:32}),32,32),'Favicon 32 × 32 px');
  add('favicon/apple-touch-icon-180.png',await png(L.svgOf(r,{box,width:180,height:180,background:r.keepBg&&r.bgColor?r.bgColor:'#FFFFFF'}),180,180),'Icona 180 × 180 px per iPhone e iPad (fondo pieno)')}
 const doc=schedaDoc(r,{name,date});add('scheda-logo.pdf',P.pdf(doc,{mode:'web',date,title:doc.title,producer:'RADIX Logo in vettoriale'}),'Scheda logo in una pagina: versioni, colori, area di rispetto');
 add('LEGGIMI.txt',readme(r,{name,proposal,date,files:out.concat([{name:'LEGGIMI.txt',label:'Queste note'}]),original}),'Note: scritte come forme, colori, misure');
 return out}
const bundle=(list,{date}={})=>ZIP().zip(list.map(x=>({name:x.name,data:x.data})),{date:date||new Date()});

// ---- brand colours: the Kit identità palette, matched to the layers ----
function kitPalette(profile){const k=profile&&profile.identityKit;if(!k||!Array.isArray(k.palette))return [];return k.palette.filter(c=>c&&T().isHex(c.hex)).map(c=>({role:String(c.role||''),name:clean(c.name),hex:String(c.hex).toUpperCase()}))}
// Each layer takes the nearest colour of the palette; two layers never take the same colour while another is free.
function matchPalette(layers,palette){const pal=palette.map(c=>c.hex),L=T(),used=new Set(),d=(a,b)=>{const x=L.rgbOf(a),y=L.rgbOf(b);return 2*(x[0]-y[0])**2+4*(x[1]-y[1])**2+3*(x[2]-y[2])**2};
 if(!pal.length)return layers.map(l=>l.color);
 return layers.map(l=>{const free=pal.filter(h=>!used.has(h)),list=free.length?free:pal,best=list.reduce((a,h)=>d(h,l.original)<d(a,l.original)?h:a,list[0]);used.add(best);return best})}

// ---- Kit identità: the traced SVG as the kit's logo ----
const ROLES=['primary','secondary','accent','dark','light'];
// A palette from the logo's colours when the project has no kit yet: the largest colourful layers first.
function paletteFromLayers(layers){const L=T(),cols=layers.map(l=>l.color),lum=h=>L.luminance(h),dark=cols.filter(h=>lum(h)<.06).sort((a,b)=>lum(a)-lum(b))[0]||'#1C1C1E',light=cols.filter(h=>lum(h)>.85)[0]||'#FFFFFF';
 const vivid=cols.filter(h=>h!==dark&&h!==light);const pick=i=>vivid[i]||vivid[0]||dark;
 const v={primary:pick(0),secondary:pick(1),accent:pick(2),dark,light};return ROLES.map(r=>({role:r,name:'Dal logo',hex:v[r]}))}
function kitWithLogo(profile,svg,layers,brand,{at}={}){const when=at||new Date().toISOString(),prev=profile&&profile.identityKit&&typeof profile.identityKit==='object'?profile.identityKit:null;
 if(prev)return {...prev,logo:svg,logoSource:'logo-vettoriale',logoAt:when};
 return {brand:clean(brand),direction:'Logo esistente ricalcato',rationale:'',palette:paletteFromLayers(layers),fonts:[{heading:'Inter',body:'Inter'}],tone:[],keywords:[],logo:svg,logoSource:'logo-vettoriale',logoAt:when,savedAt:when}}
async function useInKit(ws,projectId,svg,layers,brand,opts={}){if(!ws||!ws.projects)throw Error('Archivio del progetto non disponibile.');
 const s=IS()?IS().sanitizeSvg(svg):svg;if(!s||s.length>KIT_MAX+1000)throw Error('Il logo è troppo pesante per il Kit identità: abbassa il dettaglio.');
 const retry=e=>ws.ConflictError&&e instanceof ws.ConflictError;
 for(let i=0;i<3;i++){const p=await ws.projects.get(projectId),profile={...(p.profile||{}),identityKit:kitWithLogo(p.profile,s,layers,brand,opts)};
  try{return {project:await ws.projects.update(projectId,p.revision,{profile})}}catch(e){if(!retry(e)||i===2)throw e}}}

// ---- saved in the project: the «agents» document, key logoVector ({items}) ----
const emptyStore=()=>({schemaVersion:1,items:[]});
function readStore(doc){const s=doc&&doc.logoVector;if(!s||typeof s!=='object')return emptyStore();return {schemaVersion:1,items:Array.isArray(s.items)?s.items.filter(x=>x&&typeof x==='object'&&x.settings):[]}}
function savedRecord(r,{name,proposal,svg,source,by,at}={}){const L=T(),s=L.settingsOf(r.settings),out=String(svg||''),fits=out.length<=SVG_SAVE_MAX;
 return {id:'logo-'+(slug(name)||'logo'),at:at||new Date().toISOString(),by:clean(by).slice(0,80),name:clean(name).slice(0,80),proposal:proposalOf(proposal)?proposal:'',settings:s,
  colors:r.layers.map(l=>l.color),nodes:r.nodes,size:[r.viewBox[2],r.viewBox[3]].map(v=>Math.round(v)),source:clean(source).slice(0,120),svg:fits?out:'',svgTooBig:!fits}}
async function saveStore(ws,projectId,patch){if(!ws||typeof ws.bind!=='function')throw Error('Archivio del progetto non disponibile.');const doc=ws.bind(projectId,'agents');
 for(let i=0;i<3;i++){const cur=(await doc.load())||{},next=patch(readStore(cur));
  try{await doc.save({...cur,schemaVersion:1,conversations:cur.conversations||{},logoVector:next});return next}catch(e){if(!(ws.ConflictError&&e instanceof ws.ConflictError)||i===2)throw e}}}
const withRecord=rec=>s=>({...s,items:s.items.filter(x=>x.id!==rec.id).concat([rec]).slice(-MAX_SAVED)});

// ---- the widget (browser) ----
const dom=()=>root.document;
const E=(tag,text,cls)=>{const x=dom().createElement(tag);if(text!=null)x.textContent=text;if(cls)x.className=cls;return x};
const button=(text,cls)=>{const b=E('button',text,cls||'');b.type='button';return b};
const svgUrl=svg=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
const svgImg=(svg,alt)=>{const i=E('img');i.src=svgUrl(svg);i.alt=alt||'';i.decoding='async';return i};
const note=text=>E('p',text,'cs-note');
function field(label,value,on,{max=80,ph='',help=''}={}){const l=E('label',undefined,'rp-field'),x=E('input');x.type='text';x.maxLength=max;x.value=value||'';x.placeholder=ph;l.append(E('span',label),x);if(help)l.append(E('small',help,'rp-help'));x.oninput=()=>on(x.value);return l}
function choice(legend,items,cur,onchange,{name,cls=''}={}){const fs=E('fieldset',undefined,'ig-choice lv-choice '+cls);fs.append(E('legend',legend));
 items.forEach(it=>{const l=E('label',undefined,'ps-chip ig-chip'),x=E('input');x.type='radio';x.name=name;x.value=it.id;x.checked=it.id===cur;x.disabled=!!it.disabled;x.onchange=()=>{if(x.checked)onchange(it.id)};
  const t=E('span',undefined,'ig-chip-text');t.append(E('b',it.label));if(it.small)t.append(E('small',it.small));l.append(x,t);l.dataset.value=it.id;if(it.disabled)l.dataset.disabled='true';fs.append(l)});return fs}
function slider(label,value,min,max,on,{unit='',help=''}={}){const l=E('label',undefined,'rp-field lv-slider'),top=E('span',undefined,'lv-slider-top'),out=E('output',String(value)+unit),x=E('input');
 x.type='range';x.min=String(min);x.max=String(max);x.step='1';x.value=String(value);top.append(E('span',label),out);l.append(top,x);if(help)l.append(E('small',help,'rp-help'));
 x.oninput=()=>{out.textContent=x.value+unit;on(+x.value,false)};x.onchange=()=>on(+x.value,true);return l}
const MIME={zip:'application/zip',svg:'image/svg+xml',pdf:'application/pdf'};
function svgToPng(svg,w,h){return new Promise((res,rej)=>{const img=new root.Image();img.onload=()=>{try{const c=E('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.clearRect(0,0,w,h);g.imageSmoothingQuality='high';g.drawImage(img,0,0,w,h);
  c.toBlob(b=>b?b.arrayBuffer().then(x=>res(new Uint8Array(x)),rej):rej(Error('PNG non creato')),'image/png')}catch(e){rej(e)}};img.onerror=()=>rej(Error('Logo non disegnabile'));img.src=svgUrl(svg)})}
const isSvgFile=f=>/svg/i.test(f.type||'')||/\.svg$/i.test(f.name||'');
// The file → the pixels to trace (ImageData at traceSize), a PNG of them for the before/after, the cleaned SVG if any.
async function loadLogo(file){const svg=isSvgFile(file);
 if(!svg&&!/^image\/(png|jpeg|webp)$/.test(file.type))throw Error(file.name+': servono PNG, JPG, WebP o SVG.');
 if(file.size>(svg?SVG_FILE_MAX:FILE_MAX))throw Error(file.name+': massimo '+(svg?'2':'15')+' MB.');
 let cleaned='',url='',revoke=false;
 if(svg){const text=await file.text();cleaned=IS()?IS().sanitizeSvg(text):'';if(!cleaned||!/<(path|rect|circle|ellipse|polygon|polyline|line|text)\b/i.test(cleaned))throw Error(file.name+': SVG senza forme leggibili.');url=svgUrl(sizedSvg(cleaned))}
 else{url=root.URL.createObjectURL(file);revoke=true}
 try{const im=new root.Image();im.decoding='async';im.src=url;await im.decode();const nw=im.naturalWidth||1000,nh=im.naturalHeight||1000,[w,h]=traceSize(nw,nh);
  const c=E('canvas');c.width=w;c.height=h;const g=c.getContext('2d',{willReadFrequently:true});g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.drawImage(im,0,0,w,h);
  const d=g.getImageData(0,0,w,h);return {img:{width:w,height:h,data:d.data},before:c.toDataURL('image/png'),name:file.name,kind:svg?'svg':'raster',w:nw,h:nh,cleaned}}
 finally{if(revoke)setTimeout(()=>root.URL.revokeObjectURL(url),1000)}}
const tick=()=>new Promise(r=>setTimeout(r,16));
const BG_TEXT={transparent:'sfondo già trasparente',solid:'sfondo a tinta unita',none:'nessuno sfondo uniforme'};
// ctx: {project, profile, projectName, projectId, workspace, agentsUrl, identityUrl, openIdentity, today, by, onSaved(project)}
function logoVectorStudio(ctx={}){const L=T(),P=PS(),today=()=>ctx.today?new Date(ctx.today):new Date();let profile=ctx.profile||{};
 const brand0=(P&&P.brandOf?P.brandOf(profile,ctx.projectName).name:'')||clean(ctx.projectName);
 const st={src:null,ans:{type:'entrambi',colors:'auto',background:'drop',name:brand0},props:null,choice:'',settings:null,result:null,files:null,busy:false,store:emptyStore(),pending:null};
 const wrap=E('div',undefined,'tool photo-studio ad-studio report-studio infographic-studio funnel-studio media-kit-studio logo-vector-studio');
 const steps=E('ol',undefined,'ps-steps');['Carica','Proposte','Rifinisci','Esporta'].forEach((t,i)=>{const li=E('li',(i+1)+' · '+t);li.dataset.step=String(i+1);steps.append(li)});
 const setStep=k=>[...steps.children].forEach(li=>li.dataset.state=+li.dataset.step<k?'done':+li.dataset.step===k?'current':'todo');setStep(1);
 const saved=E('div',undefined,'ad-saved rp-saved');saved.hidden=true;const status=E('p','','tool-status');status.setAttribute('role','status');
 const form=E('div',undefined,'ps-form lv-form'),dirs=E('div',undefined,'ad-dirs lv-dirs'),refine=E('div',undefined,'rp-result lv-refine'),result=E('div',undefined,'rp-result lv-export');dirs.hidden=refine.hidden=result.hidden=true;
 wrap.append(steps,saved,form,status,dirs,refine,result);
 const scroll=x=>x.scrollIntoView&&x.scrollIntoView({behavior:'smooth',block:'start'});
 const colorsFor=()=>st.ans.colors==='auto'?st.src.suggested:+st.ans.colors;
 // before/after: the original under, the trace over it, clipped from the left by the slider
 function compare(r,label){const fig=E('figure',undefined,'lv-compare'),stage=E('div',undefined,'lv-stage');stage.style.aspectRatio=r.width+' / '+r.height;
  const a=E('img');a.src=st.src.before;a.alt='Originale';a.className='lv-before';const b=svgImg(L.svgOf(r,{full:true}),label);b.className='lv-after';stage.style.setProperty('--cut','50%');stage.append(a,b);
  const tag1=E('span','Originale','lv-tag lv-tag-a'),tag2=E('span','Vettoriale','lv-tag lv-tag-b');stage.append(tag1,tag2);
  const range=E('input');range.type='range';range.min='0';range.max='100';range.value='50';range.className='lv-range';range.setAttribute('aria-label','Confronto: a sinistra l’originale, a destra il vettoriale');range.oninput=()=>stage.style.setProperty('--cut',range.value+'%');
  fig.append(stage,range);return fig}
 const swatches=r=>{const s=E('span',undefined,'ad-swatches lv-swatches');r.layers.forEach(l=>{const i=E('i');i.style.background=l.color;i.title=l.color;s.append(i)});return s};
 const stats=r=>r.layers.length+(r.layers.length===1?' colore':' colori')+' · '+r.nodes.toLocaleString('it-IT')+' nodi';
 // 1. upload and questions
 function renderForm(){form.replaceChildren();const a=st.ans,src=st.src;
  form.append(note('Carica il logo che hai già: lo ridisegno in vettoriale qui nel browser, senza AI e senza costi. Il file non lascia il tuo computer.'));
  const pick=E('label',undefined,'pf-drop lv-drop'),inp=E('input');inp.type='file';inp.accept='image/png,image/jpeg,image/webp,image/svg+xml,.svg';const pt=E('span',undefined,'pf-drop-text');
  pt.append(E('strong',src?'Cambia immagine':'Carica il logo'),E('small','PNG, JPG, WebP o SVG · trascinalo qui o fai clic · meglio almeno 500 px, a colori pieni e senza ombre'));pick.append(inp,pt);
  inp.onchange=async()=>{const f=inp.files[0];if(!f)return;status.textContent='Leggo l’immagine…';
   try{const s=await loadLogo(f);s.bg=L.background(s.img);s.suggested=L.suggestColors(s.img,s.bg);st.src=s;st.props=null;st.result=null;st.files=null;st.choice='';dirs.hidden=refine.hidden=result.hidden=true;setStep(1);
    if(s.bg.kind!=='solid')a.background='drop';if(!clean(a.name))a.name=f.name.replace(/\.[a-z0-9]+$/i,'').replace(/[-_]+/g,' ');status.textContent='';renderForm()}
   catch(e){status.textContent='Immagine non letta: '+e.message}finally{inp.value=''}};
  form.append(pick);
  if(src){const row=E('div',undefined,'lv-source'),fig=E('div',undefined,'lv-thumb'),im=E('img');im.src=src.before;im.alt='Il logo caricato';fig.append(im);
   const info=E('div',undefined,'lv-source-text');info.append(E('strong',src.name),E('span',src.w+' × '+src.h+' px · '+BG_TEXT[src.bg.kind]+(src.bg.kind==='solid'?' ('+L.hexOf(src.bg.color)+')':'')+' · '+src.suggested+(src.suggested===1?' colore trovato':' colori trovati')));
   if(src.kind==='svg')info.append(E('small','Era già un SVG: l’ho ripulito (niente script, link esterni o attributi evento). L’originale ripulito va nello zip; le proposte lo ridisegnano con forme più semplici.','rp-help'));
   if(Math.max(src.w,src.h)<300)info.append(E('small','L’immagine è piccola: il ricalco sarà meno preciso. Se hai un file più grande, usa quello.','rp-help lv-warn'));
   row.append(fig,info);form.append(row);
   form.append(choice('Che logo è',TYPES.map(t=>({id:t.id,label:t.title,small:t.line})),a.type,id=>{a.type=id},{name:'lv-type',cls:'lv-types'}));
   form.append(choice('Quanti colori',[{id:'auto',label:'Automatico · '+src.suggested,small:'quelli trovati'}].concat([1,2,3,4,5,6].map(n=>({id:String(n),label:String(n),small:n===1?'una tinta':'colori'}))),a.colors,id=>{a.colors=id},{name:'lv-colors',cls:'lv-colors'}));
   const solid=src.bg.kind==='solid';
   form.append(choice('Lo sfondo',[{id:'drop',label:'Toglilo',small:'logo su trasparente'},{id:'keep',label:'Tienilo',small:solid?'come rettangolo pieno':'non c’è uno sfondo da tenere',disabled:!solid}],a.background,id=>{a.background=id},{name:'lv-bg',cls:'lv-bgs'}));
   const g=E('div',undefined,'rp-fields lv-name');g.append(field('Nome del marchio',a.name,v=>{a.name=v},{max:60,ph:'Es. Forno Aurora',help:'Va nei nomi dei file e nella scheda logo.'}));form.append(g)}
  const go=button(st.props?'Rifai le 3 proposte':'Prepara 3 proposte','primary'),bar=E('div',undefined,'ps-actions');go.disabled=!src;bar.append(go,E('span','Nessuna chiamata AI: il ricalco avviene qui, senza costi.','muted'));
  go.onclick=async()=>{if(!st.src||st.busy)return;st.busy=true;go.disabled=true;status.textContent='Ricalco le 3 proposte…';
   try{st.props={};for(const p of L.PROPOSALS){await tick();const s=st.pending&&st.pending.proposal===p.id?{...L.proposalSettings(p.id,{colors:colorsFor(),type:a.type,background:a.background}),...st.pending.settings}:L.proposalSettings(p.id,{colors:colorsFor(),type:a.type,background:a.background});st.props[p.id]=L.trace(st.src.img,s)}
    status.textContent='';st.files=null;refine.hidden=result.hidden=true;st.choice='';renderDirs();scroll(dirs)}
   catch(e){status.textContent='Ricalco non riuscito: '+e.message}finally{st.busy=false;go.disabled=false}};
  form.append(bar)}
 // 2. three proposals
 function renderDirs(){setStep(st.choice?3:2);dirs.hidden=false;
  dirs.replaceChildren(...L.PROPOSALS.map(p=>{const r=st.props[p.id],card=E('article',undefined,'ad-dir lv-dir');card.dataset.proposal=p.id;card.dataset.chosen=String(st.choice===p.id);
   const hd=E('div',undefined,'ad-dir-head');hd.append(E('span',stats(r),'ad-angle'),E('h3',p.title),E('p',p.line,'ad-idea'));
   const pick=button(st.choice===p.id?'Proposta scelta':'Scegli «'+p.title+'»','primary');pick.onclick=()=>{st.choice=p.id;st.settings={...r.settings,recolor:[],paper:[]};st.result=r;st.files=null;result.hidden=true;result.replaceChildren();renderDirs();renderRefine();scroll(refine)};
   card.append(hd,compare(r,p.title),swatches(r),pick);return card}))}
 // 3. refine
 let timer=0;
 function retrace(now){clearTimeout(timer);const run=()=>{try{st.result=L.trace(st.src.img,st.settings);st.files=null;drawPreview();renderLayers();if(!result.hidden)renderResult(true)}catch(e){status.textContent='Ricalco non riuscito: '+e.message}};if(now)run();else timer=setTimeout(run,220)}
 const pv=E('div',undefined,'ig-preview lv-preview'),layersBox=E('div',undefined,'lv-layers');
 function drawPreview(){const r=st.result,head=E('div',undefined,'ig-preview-head');head.append(E('h4','Anteprima'),E('span',stats(r),'lv-stat'));
  const vers=E('div',undefined,'lv-versions');[['color','A colori','lv-v-light'],['black','Mono nero','lv-v-light'],['white','Mono bianco','lv-v-dark']].forEach(([v,label,cls])=>{const f=E('figure',undefined,'lv-version '+cls);f.append(svgImg(L.svgOf(r,{variant:v}),label),E('figcaption',label));vers.append(f)});
  const safe=E('figure',undefined,'lv-safe');safe.append(svgImg(safeSvg(r),'Area di rispetto'),E('figcaption','Area di rispetto: un quarto del lato corto, tutto intorno (in azzurro).'));
  const small=E('div',undefined,'lv-small'),box=L.squareBox(r),sq=L.svgOf(r,{box});
  for(const bg of ['light','dark']){const row=E('div',undefined,'lv-small-row lv-small-'+bg);[16,32,64].forEach(px=>{const f=E('figure'),i=svgImg(bg==='dark'?L.svgOf(r,{box,variant:'white'}):sq,'Logo a '+px+' px');i.width=px;i.height=px;f.append(i,E('figcaption',px+' px'));row.append(f)});small.append(row)}
  const sh=E('h5','Prova in piccolo');pv.replaceChildren(head,compare(r,'Vettoriale'),E('h5','Versioni'),vers,E('h5','Area di rispetto'),safe,sh,small,note(r.layers.length&&L.svgOf(r).length>KIT_MAX?'A 16 px si legge ancora? Se no, per la favicon tieni solo il simbolo. Il file è pesante: per il Kit identità abbasserò un po’ il dettaglio.':'A 16 px si legge ancora? Se no, per la favicon tieni solo il simbolo.'))}
 function renderLayers(){const r=st.result,s=st.settings,pal=kitPalette(profile);layersBox.replaceChildren();
  const tot=r.layers.reduce((a,l)=>a+l.area,0)||1,ul=E('ul',undefined,'lv-layer-list');
  r.layers.forEach((l,i)=>{const li=E('li'),c=E('input');c.type='color';c.value=l.color.toLowerCase();c.setAttribute('aria-label','Colore del livello '+(i+1));c.oninput=()=>{s.recolor[i]=c.value.toUpperCase();retrace()};
   const t=E('span',undefined,'lv-layer-text');t.append(E('b',l.color),E('small','Livello '+(i+1)+' · '+Math.round(l.area/tot*100)+'%'+(l.color!==l.original?' · era '+l.original:'')));
   const sel=E('select');sel.setAttribute('aria-label','Livello '+(i+1)+' nelle versioni mono');[['auto','Mono: '+(l.paperAuto?'vuoto':'pieno')+' (auto)'],['ink','Mono: pieno'],['paper','Mono: vuoto']].forEach(([v,tx])=>{const o=E('option',tx);o.value=v;o.selected=(s.paper[i]===true?'paper':s.paper[i]===false?'ink':'auto')===v;sel.append(o)});
   sel.onchange=()=>{s.paper[i]=sel.value==='paper'?true:sel.value==='ink'?false:null;retrace(true)};li.append(c,t,sel);ul.append(li)});
  const acts=E('div',undefined,'lv-layer-acts');
  if(pal.length){const k=button('Usa i colori del Kit identità','ig-move');k.onclick=()=>{s.recolor=matchPalette(r.layers,pal);retrace(true)};acts.append(k)}
  else if(ctx.openIdentity||ctx.identityUrl){const a=E('a','Nessun Kit identità: crealo →','lv-kit-link');a.href=ctx.identityUrl||'#';a.onclick=e=>{if(ctx.openIdentity){e.preventDefault();ctx.openIdentity()}};acts.append(a)}
  const o=button('Colori originali','ig-move');o.disabled=!s.recolor.some(Boolean);o.onclick=()=>{s.recolor=[];retrace(true)};acts.append(o);
  layersBox.append(ul,acts)}
 function renderRefine(){setStep(3);refine.hidden=false;const s=st.settings,box=E('div',undefined,'ig-work lv-work'),edit=E('div',undefined,'ig-edit');
  const head=E('div',undefined,'fn-refine-head');head.append(E('h3','«'+(proposalOf(st.choice)||{title:'Su misura'}).title+'» · '+brandName(st.ans.name)),E('p','Muovi i cursori e guarda l’anteprima: ogni modifica rifà il ricalco qui nel browser.','ad-idea'));
  const fs=E('fieldset',undefined,'rp-refine lv-fs');fs.append(E('legend','Forme'));const g=E('div',undefined,'lv-sliders');
  g.append(slider('Colori',s.colors,1,L.MAX_COLORS,(v,done)=>{if(done){s.colors=v;s.recolor=[];s.paper=[];retrace(true)}},{help:'Quante tinte piene: le sfumature finiscono nella più vicina.'}),
   slider('Dettaglio',s.detail,0,100,(v,done)=>{s.detail=v;if(done)retrace(true)},{help:'Più alto: segue meglio i pixel, con più nodi. Più basso: forme più semplici, puntini tolti.'}),
   slider('Morbidezza',s.smooth,0,100,(v,done)=>{s.smooth=v;if(done)retrace(true)},{help:'0: solo segmenti dritti e angoli vivi. Più alto: curve morbide, gli angoli netti restano.'}));fs.append(g);
  if(st.src.bg.kind==='solid'){const l=E('label',undefined,'lv-check'),x=E('input');x.type='checkbox';x.checked=s.background==='keep';x.onchange=()=>{s.background=x.checked?'keep':'drop';retrace(true)};l.append(x,E('span','Tieni lo sfondo ('+L.hexOf(st.src.bg.color)+') come rettangolo pieno'));fs.append(l)}
  const fl=E('fieldset',undefined,'rp-refine lv-fs');fl.append(E('legend','Colori dei livelli'),layersBox);
  const next=button('Controlla ed esporta','primary'),nb=E('div',undefined,'ps-actions');nb.append(next,E('span','SVG, PNG, favicon e scheda PDF si creano qui, senza AI e senza costi.','muted'));next.onclick=()=>{renderResult();scroll(result)};
  edit.append(head,fs,fl,note('Le scritte del logo diventano forme, non testo: per modificarle con la tastiera serve il font originale, da far verificare a un grafico.'),nb);
  box.append(edit,pv);refine.replaceChildren(box);renderLayers();drawPreview()}
 // 4. export
 function renderResult(quiet){if(!quiet)setStep(4);result.hidden=false;const r=st.result;
  const what=E('div',undefined,'mk-what lv-what');what.append(E('h4','Nello zip'));const ul=E('ul');
  ['logo.svg a colori, logo-mono-nero.svg e logo-mono-bianco.svg','PNG a 512, 1024 e 2048 px'+(r.keepBg?'':' con lo sfondo trasparente'),'Favicon: 32 px, 180 px per iPhone e iPad, SVG quadrato','scheda-logo.pdf: versioni, colori con RGB e CMYK indicativo, area di rispetto','LEGGIMI.txt: le scritte sono forme, misure minime, note per la stampa'].concat(st.src.kind==='svg'?['originale-pulito.svg: il tuo SVG di partenza ripulito']:[]).forEach(t=>ul.append(E('li',t)));what.append(ul);
  const mk=button('Crea i file','primary'),svgB=button('Solo logo.svg'),saveB=button('Salva nel progetto'),kitB=button('Usa nel Kit identità'),acts=E('div',undefined,'ps-actions rp-actions'),rs=E('p','','tool-status');rs.setAttribute('role','status');const out=E('div',undefined,'ig-out');
  acts.append(mk,svgB,saveB,kitB);
  const name=brandName(st.ans.name);
  svgB.onclick=()=>{P.download((slug(name)||'logo')+'.svg',L.svgOf(st.result,{title:name}),MIME.svg);rs.textContent='Scaricato logo.svg.'};
  mk.onclick=async()=>{if(st.busy)return;st.busy=true;mk.disabled=true;rs.textContent='Preparo SVG, PNG, favicon e scheda…';
   try{st.files=await files(st.result,{name,proposal:st.choice,date:today(),png:svgToPng,original:st.src.kind==='svg'?st.src.cleaned:''});renderFiles(out,rs);rs.textContent='Pronti '+st.files.length+' file.';scroll(out)}
   catch(e){rs.textContent='File non creati: '+e.message}finally{st.busy=false;mk.disabled=false}};
  const compact=()=>{const f=L.fitSvg(st.src.img,st.result.settings,KIT_MAX,{title:name});return f?f.svg:''};
  saveB.onclick=async()=>{if(!ctx.workspace||!ctx.projectId){rs.textContent='Apri un progetto per salvare.';return}saveB.disabled=true;
   try{let svg=L.svgOf(st.result,{title:name});if(svg.length>SVG_SAVE_MAX)svg=compact();st.store=await saveStore(ctx.workspace,ctx.projectId,withRecord(savedRecord(st.result,{name,proposal:st.choice,svg,source:st.src.name,by:ctx.by})));
    rs.textContent='Salvato nel progetto: impostazioni e SVG (l’immagine di partenza resta sul tuo computer).';renderSaved()}
   catch(e){rs.textContent='Salvataggio non riuscito: '+e.message}finally{saveB.disabled=false}};
  kitB.onclick=async()=>{if(!ctx.workspace||!ctx.projectId){rs.textContent='Apri un progetto per usarlo nel Kit identità.';return}
   const has=profile&&profile.identityKit&&profile.identityKit.logo;
   if(!await askConfirm({title:has?'Sostituire il logo del Kit identità?':'Usare questo logo nel Kit identità?',message:has?'Il Kit identità del progetto ha già un logo. Lo sostituisco con questo ricalco; colori, font e il resto del kit restano come sono.':'Il progetto non ha ancora un Kit identità: ne creo uno con questo logo e i suoi colori. Gli altri studi (coordinato, stampati, etichette…) lo useranno.',ok:has?'Sostituisci il logo':'Usa nel Kit'}))return;
   kitB.disabled=true;rs.textContent='Preparo il logo per il Kit…';
   try{await tick();const svg=compact();if(!svg)throw Error('il logo resta troppo pesante anche semplificato: abbassa colori o dettaglio.');
    const res=await useInKit(ctx.workspace,ctx.projectId,svg,st.result.layers,name);if(res.project){profile=res.project.profile||profile;if(ctx.onSaved)ctx.onSaved(res.project)}
    kitB.textContent='Nel Kit identità ✓';rs.textContent='Fatto: è il logo del Kit identità del progetto'+(svg.length<L.svgOf(st.result,{title:name}).length?' (in una versione un po’ più leggera)':'')+'.'}
   catch(e){rs.textContent='Kit non aggiornato: '+e.message}finally{kitB.disabled=false}};
  result.replaceChildren(what,acts,rs,out);if(st.files)renderFiles(out,rs)}
 function renderFiles(out,rs){const list=st.files||[],name=brandName(st.ans.name),hd=E('div',undefined,'co-kit-head ig-files-head');hd.append(E('h3','I file del logo sono pronti'),E('p',list.length+' file: scarica lo zip o i singoli file. Prima di stampare in grande, guarda il logo ingrandito.','ad-idea'));
  const btns=E('div',undefined,'ps-actions'),zipB=button('Scarica tutto (.zip)','primary');zipB.onclick=()=>{P.download(zipName(name),bundle(list,{date:today()}),MIME.zip);rs.textContent='Zip scaricato: '+list.length+' file.'};btns.append(zipB);
  const pdf=list.find(x=>x.name==='scheda-logo.pdf');if(pdf){const b=button('Scheda logo (PDF)');b.onclick=()=>P.download('scheda-logo-'+(slug(name)||'logo')+'.pdf',pdf.data,MIME.pdf);btns.append(b)}
  const gal=E('div',undefined,'lv-gallery');list.filter(x=>/\.png$/.test(x.name)&&!/2048|1024/.test(x.name)).forEach(x=>{const f=E('figure'),im=E('img');im.src=root.URL.createObjectURL(new root.Blob([x.data],{type:'image/png'}));im.alt=x.label;f.append(im,E('figcaption',x.name));gal.append(f)});
  const ul=E('ul',undefined,'ig-file-list');list.forEach(x=>{const li=E('li');li.append(E('code',x.name),E('small',x.label));ul.append(li)});out.replaceChildren(hd,btns,gal,ul)}
 function renderSaved(){const items=st.store.items;if(!items.length){saved.hidden=true;return}saved.replaceChildren(E('h4','Loghi ricalcati salvati nel progetto'));const row=E('div',undefined,'ad-saved-row');
  items.slice(-4).reverse().forEach(r=>{const b=button((r.name||'Logo')+' · '+((proposalOf(r.proposal)||{}).title||'su misura')+' · '+String(r.at||'').slice(0,10),'ad-saved-item');
   b.onclick=()=>{if(r.svg){P.download((slug(r.name)||'logo')+'.svg',r.svg,MIME.svg)}st.pending={proposal:r.proposal,settings:r.settings};st.ans.name=r.name||st.ans.name;renderForm();
    status.textContent=(r.svg?'Scaricato l’SVG salvato. ':'')+'Per rifinirlo ricarica l’immagine di partenza ('+(r.source||'il file originale')+'): le impostazioni salvate valgono per la proposta «'+((proposalOf(r.proposal)||{}).title||'Fedele')+'».'};row.append(b)});
  saved.append(row);saved.hidden=false}
 async function loadSaved(){if(!ctx.workspace||!ctx.projectId)return;try{st.store=readStore(await ctx.workspace.bind(ctx.projectId,'agents').load());renderSaved()}catch(e){/* works without */}}
 renderForm();loadSaved();return wrap}

return Object.freeze({AGENT,MAX_SAVED,SVG_SAVE_MAX,KIT_MAX,PNG_SIZES,TYPES,typeOf,traceSize,sizedSvg,pngSize,clearSpace,safeSvg,readme,schedaDoc,files,bundle,zipName,kitPalette,matchPalette,
 paletteFromLayers,kitWithLogo,useInKit,readStore,savedRecord,saveStore,withRecord,logoVectorStudio});
});
