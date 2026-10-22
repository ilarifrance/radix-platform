/* Studio Documenti («Documenti impaginati»): the last mile of the Studio Testi. A company profile, a multipage brochure, a
   presentation or a technical sheet written there (or pasted) becomes a designed document, with NO AI and no cost:
   1. questions: the document, the text (a copy saved in the project by lib/copy-studio.js, or pasted), the brand from the
      Kit identità (profile.identityKit: palette, logo, fonts; neutral palette and the name as wordmark when missing);
   2. three layouts (Editoriale, Deciso, Minimal) shown as real thumbnails of their first pages or slides;
   3. refinement: sections (or slides, or data rows) edited, reordered, added or removed, the cover swapped, photos uploaded
      by the person (no generated image), the page count always in view;
   4. outputs: A4 PDF for the screen (RGB) with cover, back cover, grid, typographic hierarchy, page numbers and a table of
      contents from 6 pages; the CMYK PDF for the print shop through lib/print-studio.js (PDF/X-1a style, text as outlines);
      the presentation as a real .pptx 16:9 (lib/pptx-lite.js: native editable text boxes, brand theme colours and fonts,
      title/section/content/two-column/closing layouts, speaker notes) plus a PDF of the slides; the technical sheet as a
      1–2 page PDF with the data table where a missing value is printed «da verificare», never filled in.
   «Salva nel progetto» keeps the edited text, the layout and the page count in the Art Director's thread (files are
   downloaded, not stored); «Scarica tutto» is one zip (lib/zip-lite.js).
   One layout (print-studio items in mm) feeds the SVG preview, the PDF and, for the slides, the PPTX shapes.
   Pure part (parsing, models, layouts, PPTX deck, Markdown, zip list) runs in Node for the tests; docStudio() is the widget. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixDocStudio=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const req=(g,f)=>root[g]||(typeof require==='function'?require(f):null);
const PS=req('RadixPrintStudio','./print-studio.js'),PX=req('RadixPptx','./pptx-lite.js'),ZIP=req('RadixZip','./zip-lite.js');
const AGENT='art-director',A4=Object.freeze({w:210,h:297}),SLIDE=Object.freeze({w:254,h:142.875}),MISSING='da verificare',TOC_FROM=6,MAX_SHEET_PAGES=2,SLIDE_WORDS=40;
const WARN_INK='#9A3A00';
const TYPES=Object.freeze([
 {id:'profile',title:'Company profile',kicker:'Company profile',line:'Chi siete, storia, servizi, valori e contatti, pagina per pagina.',out:'A4 multipagina · PDF',copy:'brochure'},
 {id:'brochure',title:'Brochure multipagina',kicker:'Brochure',line:'Prodotti o servizi raccontati sezione per sezione.',out:'A4 multipagina · PDF',copy:'brochure'},
 {id:'presentazione',title:'Presentazione',kicker:'Presentazione',line:'Slide 16:9 con le note del relatore, modificabili in PowerPoint.',out:'PowerPoint .pptx + PDF',copy:'presentazione'},
 {id:'scheda',title:'Scheda tecnica',kicker:'Scheda tecnica',line:'Tabella dei dati in 1–2 pagine; quelli mancanti restano «da verificare».',out:'A4 1–2 pagine · PDF',copy:'scheda'}]);
const STYLES=Object.freeze([
 {id:'editorial',title:'Editoriale',line:'Colonna laterale con numero e titolo, testo arioso su una colonna.'},
 {id:'bold',title:'Deciso',line:'Fasce nel colore del brand, titoli grandi, testo su due colonne.'},
 {id:'minimal',title:'Minimal',line:'Molto bianco, linee sottili, una colonna stretta.'}]);
const COVERS=Object.freeze([{id:'brand',title:'Logo e colori'},{id:'photo',title:'Con la foto'},{id:'title',title:'Solo il titolo'}]);
const SLIDE_LAYOUTS=Object.freeze([{id:'title',title:'Titolo'},{id:'section',title:'Sezione'},{id:'content',title:'Contenuto'},{id:'two',title:'Due colonne'},{id:'closing',title:'Chiusura'}]);
const typeOf=id=>TYPES.find(t=>t.id===id)||TYPES[0];
const styleOf=id=>STYLES.some(s=>s.id===id)?id:'editorial';
const coverOf=id=>COVERS.some(c=>c.id===id)?id:'brand';
const clean=s=>String(s==null?'':s).replace(/[ \t ]+/g,' ').trim();
const block=s=>String(s==null?'':s).replace(/\r/g,'').split('\n').map(clean).join('\n').replace(/\n{3,}/g,'\n\n').trim();
const inline=s=>clean(String(s||'').replace(/\*\*([^*]+)\*\*/g,'$1').replace(/__([^_]+)__/g,'$1').replace(/(^|\s)\*([^*\n]+)\*/g,'$1$2').replace(/`([^`]+)`/g,'$1').replace(/^#+\s*/,'').replace(/\s\(\d+\/\d+\)\s*$/,''));
const pad2=n=>String(n).padStart(2,'0');
const ptMm=pt=>PS.ptToMm(pt),cap=size=>ptMm(size*.718),desc=size=>ptMm(size*.207);
const rgbOf=h=>[1,3,5].map(i=>parseInt(String(h).slice(i,i+2),16)||0);
const mix=(a,b,t)=>'#'+rgbOf(a).map((v,i)=>Math.round(v+(rgbOf(b)[i]-v)*t).toString(16).padStart(2,'0')).join('').toUpperCase();
const words=s=>(String(s||'').match(/[\p{L}\p{N}][\p{L}\p{N}'’.,%-]*/gu)||[]).length;

// ---- the text from the Studio Testi (lib/copy-studio.js toMarkdown) or pasted ----
const COPY_TITLES={'brochure e company profile':'brochure','presentazione':'presentazione','scheda tecnica':'scheda'};
// Markdown → {title, kind, groups:[{title,text,subs:[{title,text}]}], checks, plain}. The meta line under the title, the
// closing note after «---» and «Da controllare» (kept apart as checks) are not content.
function parseSource(md){const lines=String(md||'').replace(/\r/g,'').split('\n'),out={title:'',kind:'',groups:[],checks:[],plain:true};let g=null,sub=null,meta=false,checks=false;
 for(const raw of lines){const l=raw.trimEnd();let m;
  if((m=/^#\s+(.+)/.exec(l))&&!out.title){out.plain=false;const t=inline(m[1]),i=t.indexOf(' · '),k=i>0&&COPY_TITLES[t.slice(0,i).toLowerCase()];out.kind=k||'';out.title=k?t.slice(i+3):t;meta=true;continue}
  if(meta&&l.trim()){meta=false;if(/ · /.test(l)&&/\d{4}-\d{2}-\d{2}\s*$/.test(l))continue}
  if(/^---+\s*$/.test(l)){if(out.groups.length)break;continue}
  if((m=/^##\s+(.+)/.exec(l))){out.plain=false;const t=inline(m[1]);checks=/^da controllare$/i.test(t);sub=null;g=checks?null:{title:t,text:'',subs:[]};if(g)out.groups.push(g);continue}
  if((m=/^###+\s+(.+)/.exec(l))){out.plain=false;if(checks)continue;if(!g){g={title:'',text:'',subs:[]};out.groups.push(g)}sub={title:inline(m[1]),text:''};g.subs.push(sub);continue}
  if(checks){const t=inline(l.replace(/^\s*[-*•]\s+/,''));if(t)out.checks.push(t);continue}
  if(!g){if(!l.trim())continue;g={title:'',text:'',subs:[]};out.groups.push(g)}
  (sub||g).text+=l+'\n'}
 out.groups.forEach(x=>{x.text=block(x.text);x.subs.forEach(s=>s.text=block(s.text))});return out}
// Plain text: blank-line blocks; a short first line without a full stop is the block's title.
function plainSections(text){const out=[];let pending='';
 for(const b of block(text).split(/\n\s*\n/)){const ls=b.split('\n').map(clean).filter(Boolean);if(!ls.length)continue;
  const head=ls[0].length<=70&&!/[.!?;:,]$/.test(ls[0])&&!/^[-*•]/.test(ls[0]);
  if(head&&ls.length===1){pending=pending?pending+' · '+ls[0]:ls[0];continue}
  if(head){out.push({title:pending||ls[0],text:ls.slice(pending?0:1).join('\n')});pending='';continue}
  if(pending){out.push({title:pending,text:ls.join('\n')});pending='';continue}
  if(out.length)out[out.length-1].text+='\n\n'+ls.join('\n');else out.push({title:'',text:ls.join('\n')})}
 if(pending)out.push({title:pending,text:''});return out}
const isCover=t=>/^(copertina|cover)\b/i.test(t),isClose=t=>/^(chiusura|contatti|conclusione|conclusioni|closing)\b/i.test(t);
// The sections of a brochure-like source: «### » blocks inside their «## » group, else the groups themselves.
function sectionsOf(p){const out=[];
 for(const g of p.groups){if(isCover(g.title)||isClose(g.title))continue;
  if(g.subs.length){if(g.text)out.push({title:/^sezioni$/i.test(g.title)?'':g.title,text:g.text});g.subs.forEach(s=>out.push({title:s.title,text:s.text}))}
  else if(g.title||g.text)out.push({title:/^sezioni$/i.test(g.title)?'':g.title,text:g.text})}
 return out.filter(s=>s.title||s.text)}
// Slides written as «Slide n · Titolo», «- punto», «Nota: cosa dire».
function parseSlides(text){const out=[];let cur=null,mode='';
 for(const raw of String(text||'').replace(/\r/g,'').split('\n')){const l=raw.trim();if(!l)continue;let m;
  if((m=/^(?:#{1,4}\s*)?(?:\*\*)?\s*slide\s*(\d{1,2})\s*(?:[·:.\-–—)|]\s*)?(.*?)\s*(?:\*\*)?$/i.exec(l))){cur={title:inline(m[2])||'Slide '+m[1],bullets:[],note:''};out.push(cur);mode='';continue}
  if(!cur){cur={title:inline(l),bullets:[],note:''};out.push(cur);continue}
  if((m=/^(?:[-*•–]\s*)?(?:\*\*)?(?:nota|note|note del relatore|cosa dire|speaker notes?)(?:\*\*)?\s*:\s*(.*)$/i.exec(l))){mode='note';cur.note=block((cur.note?cur.note+'\n':'')+inline(m[1]));continue}
  m=/^(?:[-*•–]|\d{1,2}[.)])\s+(.*)$/.exec(l);
  if(mode==='note'){cur.note=(cur.note?cur.note+' ':'')+inline(m?m[1]:l);continue}
  cur.bullets.push(inline(m?m[1]:l))}
 return out.map(s=>({...s,bullets:s.bullets.filter(Boolean)}))}
// Sentences of a paragraph (for slides made from a brochure text): never rewritten, only split.
const sentences=t=>block(t).replace(/\n+/g,' ').split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý«"0-9])/).map(clean).filter(Boolean);
// A value that says «we do not know»: printed as «da verificare».
const isMissing=v=>!clean(v)||/^(?:-+|—|–|\?+|n\.?\s?d\.?|n\/d|n\/a|tbd|da verificare\.?|da definire\.?|da confermare\.?|mancante)$/i.test(clean(v));
function specRow(line){const t=inline(String(line||'').replace(/^\s*(?:[-*•–]|\d{1,2}[.)])\s+/,''));if(!t)return null;
 const m=/^([^:]{1,80}?)\s*[:=]\s*(.*)$/.exec(t)||/^(.{1,60}?)\s+[–—]\s+(.*)$/.exec(t);if(!m)return {label:t.replace(/[.:;]+$/,''),value:''};
 const v=clean(m[2]);return {label:clean(m[1]),value:isMissing(v)?'':v}}
function slideLayouts(slides){const n=slides.length;return slides.map((s,i)=>{const chars=s.bullets.join(' ').length;
 const layout=s.layout&&SLIDE_LAYOUTS.some(l=>l.id===s.layout)?s.layout:i===0?'title':i===n-1&&n>1&&/grazie|contatt|domande|conclusion|chiusura|prossimi passi|thank/i.test(s.title)?'closing':!s.bullets.length?'section':s.bullets.length>=5||chars>300?'two':'content';
 return {...s,layout}})}
// md → the editable model of one document type. opts: {name (brand), payoff, contacts:{phone,email,website,address}}.
function modelFrom(type,md,opts={}){const t=typeOf(type).id,p=parseSource(md),name=clean(opts.name),c=opts.contacts||{};
 const contacts=['address','phone','email','website'].map(k=>clean(c[k])).filter(Boolean);
 const model={type:t,title:'',subtitle:'',sections:[],closing:{title:'',text:''},slides:[],product:'',intro:'',specs:[],checks:p.checks.slice(0,20),source:p.kind||(p.plain?'testo':'markdown'),name,contacts};
 const cover=p.groups.find(g=>isCover(g.title)),close=p.groups.find(g=>isClose(g.title));
 const secs=p.plain?plainSections(md):sectionsOf(p);
 if(t==='profile'||t==='brochure'){
  const cl=cover?cover.text.split('\n').map(clean).filter(Boolean):[];
  model.title=cl[0]||(p.kind==='brochure'?'':p.title)||name||typeOf(t).title;model.subtitle=cl.slice(1).join(' ')||(cl.length?'':clean(opts.payoff));
  if(p.kind==='presentazione'){const sl=parseSlides((p.groups.find(g=>/^slide/i.test(g.title))||{text:md}).text);model.sections=sl.map(s=>({title:s.title,text:s.bullets.map(b=>'- '+b).join('\n'),photo:null}))}
  else model.sections=secs.map(s=>({title:s.title,text:s.text,photo:null}));
  model.closing={title:close&&!isClose(close.title)?close.title:'',text:close?close.text:''}}
 else if(t==='presentazione'){const g=p.groups.find(x=>/^slide/i.test(x.title)),raw=g?g.text:p.plain?md:'';let sl=/(^|\n)\s*(?:#{1,4}\s*)?(?:\*\*)?\s*slide\s*\d/i.test(raw)?parseSlides(raw):[];
  model.title=(p.kind==='presentazione'?'':p.title)||name||'Presentazione';
  if(!sl.length){const ct=cover?cover.text.split('\n').map(clean).filter(Boolean):[];if(ct[0])model.title=ct[0];
   sl=[{title:model.title,bullets:[ct.slice(1).join(' ')||clean(opts.payoff)].filter(Boolean),note:''}];
   for(const s of secs){const ss=sentences(s.text);if(!ss.length&&!s.title)continue;const parts=[];for(let i=0;i<Math.max(1,ss.length);i+=4)parts.push(ss.slice(i,i+4));
    parts.forEach((b,k)=>sl.push({title:(s.title||'Punto '+sl.length)+(k?' (segue)':''),bullets:b,note:k?'':block(s.text)}))}
   if(close&&close.text)sl.push({title:'Grazie',bullets:close.text.split('\n').map(inline).filter(Boolean),note:''})}
  else if(sl[0]&&/^titolo$|^copertina$/i.test(sl[0].title)&&sl[0].bullets.length){sl[0]={...sl[0],title:sl[0].bullets[0],bullets:sl[0].bullets.slice(1)}}
  const last=sl[sl.length-1];if(sl.length&&!/grazie|contatt|domande|conclusion|chiusura|thank/i.test(last.title))sl.push({title:'Grazie',bullets:contacts.length?contacts:[name].filter(Boolean),note:'',auto:true});
  model.slides=slideLayouts(sl).map(s=>({layout:s.layout,title:s.title,bullets:s.bullets,note:s.note||''}));if(model.slides[0])model.title=model.slides[0].title}
 else{const intro=p.groups.find(g=>/descrizione|introduzione|intro/i.test(g.title)),specG=p.groups.filter(g=>/caratteristic|dati tecnici|specific|scheda/i.test(g.title)),miss=p.groups.find(g=>/da verificare|mancan/i.test(g.title));
  model.product=(p.kind==='scheda'?'':p.title)||'Prodotto';model.intro=intro?intro.text:'';
  const rows=[];const add=r=>{if(!r||!r.label)return;const k=r.label.toLowerCase(),i=rows.findIndex(x=>x.label.toLowerCase()===k);if(i<0)rows.push(r);else if(!rows[i].value&&r.value)rows[i]=r};
  if(specG.length)specG.forEach(g=>[g.text,...g.subs.map(s=>s.text)].join('\n').split('\n').forEach(l=>add(specRow(l))));
  else if(p.plain||!p.groups.length){const other=[];block(md).split('\n').forEach(l=>{if(/[:=]/.test(l)&&l.length<200)add(specRow(l));else if(clean(l))other.push(clean(l))});if(!model.intro)model.intro=other.join(' ')}
  if(miss)miss.text.split('\n').forEach(l=>{const r=specRow(l);if(r)add({label:r.label,value:''})});
  for(const r of rows){const n=/^(?:nome(?: del)? prodotto|prodotto|modello|articolo)$/i.exec(r.label);if(n&&r.value&&model.product==='Prodotto')model.product=r.value}
  model.specs=rows.slice(0,60)}
 return model}
// How full the model is, for the «Prepara 3 impaginazioni» check.
function emptyReason(m){if(m.type==='scheda')return m.specs.length?'':'Nel testo non trovo dati tecnici («Voce: valore», uno per riga).';
 if(m.type==='presentazione')return m.slides.length>1?'':'Nel testo non trovo slide («Slide 1 · Titolo», punti con «- »).';
 return m.sections.some(s=>s.text)?'':'Nel testo non trovo sezioni da impaginare.'}

// ---- paragraphs of a section ----
// text → [{kind:'p'|'bullet'|'sub', text, mark}]: blank lines separate paragraphs, «- » and «1.» are bullets, «#### » subheads.
function blocks(text){const out=[];let para=[];const flush=()=>{if(para.length){out.push({kind:'p',text:para.join(' ')});para=[]}};
 for(const raw of String(text||'').replace(/\r/g,'').split('\n')){const l=raw.trim();let m;if(!l){flush();continue}
  if((m=/^#{2,6}\s+(.+)/.exec(l))){flush();out.push({kind:'sub',text:inline(m[1])});continue}
  if((m=/^([-*•–])\s+(.+)/.exec(l))||(m=/^(\d{1,2}[.)])\s+(.+)/.exec(l))){flush();out.push({kind:'bullet',text:inline(m[2]),mark:/\d/.test(m[1])?m[1].replace(')','.'):'•'});continue}
  para.push(inline(l))}
 flush();return out.filter(b=>b.text)}

// ---- the logo on a coloured background ----
// Full colour when every colour of the logo stays visible on bg; otherwise on a light plate (never a one-colour blob of
// overlapping shapes). Without a logo the name is set as a wordmark in `on`. → shapes [{t:'rect'}?, {t:'logo'}].
function logoShapes(br,x,y,w,h,{align,bg,on}={}){const svg=br.logo,vb=svg&&PS.viewBox(svg);
 if(!svg||!vb)return [{t:'logo',x,y,w,h,align,mono:on,bg}];
 const clash=PS.svgColours(svg,bg).some(c=>PS.contrast(c,bg)<1.6);if(!clash)return [{t:'logo',x,y,w,h,align,bg}];
 const sc=Math.min(w/vb[2],h/vb[3]),lw=vb[2]*sc,lh=vb[3]*sc,lx=align==='left'?x:align==='right'?x+w-lw:x+(w-lw)/2,ly=y+(h-lh)/2,pad=Math.max(2.5,lh*.28),plate=PS.contrast('#FFFFFF',bg)>=1.6?'#FFFFFF':br.palette.light;
 return [{t:'rect',x:lx-pad,y:ly-pad,w:lw+2*pad,h:lh+2*pad,fill:plate,name:'Fondo del logo'},{t:'logo',x:lx,y:ly,w:lw,h:lh,align:'left',bg:plate}]}
const drawShapes=(b,list)=>list.forEach(x=>x.t==='rect'?b.rect(x.x,x.y,x.w,x.h,x.fill):b.logo(x.x,x.y,x.w,x.h,{align:x.align,mono:x.mono,bg:x.bg}));

// ---- A4 documents (company profile, brochure) ----
const M=18,FOOT=13,BODY_BOTTOM=A4.h-26;
function paletteFor(brand,style){const pal=brand.palette,bg=style==='minimal'?'#FFFFFF':pal.light;
 return {pal,bg,head:PS.ink(bg,pal,pal.primary,pal.dark),txt:PS.ink(bg,pal,pal.dark),soft:PS.ink(bg,pal,pal.secondary,pal.dark),acc:PS.ink(bg,pal,pal.accent,pal.primary,pal.dark),
  rule:mix(pal.secondary,bg,.72),tint:mix(pal.primary,bg,.92),on:PS.ink(pal.primary,pal,pal.light,'#FFFFFF',pal.dark),onAcc:PS.ink(pal.primary,pal,pal.accent,pal.light,'#FFFFFF')}}
const TYPO={editorial:{body:10.5,lead:1.52,first:13,firstLead:1.42,sub:11.5},bold:{body:9.8,lead:1.5,first:12,firstLead:1.4,sub:11},minimal:{body:10,lead:1.62,first:12,firstLead:1.5,sub:11}};
// photos: {cover:{src,w,h}, sections:[{src,w,h}|null]} (same order as model.sections).
function layoutDoc(model,brand,opts={}){const style=styleOf(opts.style),coverKind=coverOf(opts.cover),photos=opts.photos||{},W=A4.w,H=A4.h,B=PS.BLEED;
 const br=brand||PS.brandOf({},model.name),C=paletteFor(br,style),pal=C.pal,ty=TYPO[style],kicker=typeOf(model.type).kicker.toUpperCase();
 const values={name:clean(model.name||br.name)},b=PS.builder({id:'documento',w:W,h:H},br,values,M),pages=[];
 const page=(label,kind)=>{const items=[];b.items=items;const p={label,w:W,h:H,items,folds:[],kind};pages.push(p);return p};
 const bg=(fill)=>b.rect(-B,-B,W+2*B,H+2*B,fill||C.bg);
 const usePhoto=(ph,x,y,w,h,o)=>{if(!ph||!ph.src||!(ph.w>0))return false;b.photoSrc=ph;const r=b.photo(x,y,w,h,o);b.photoSrc=null;return r};
 const line=(x,y,s,size,o={})=>{b.items.push({t:'text',x:o.align==='right'?x-PS.textWidth(s,size,o.bold)/72*25.4:x,y,s,size,bold:!!o.bold,fill:o.fill||C.txt,label:o.label||'Testo'})};
 const title=clean(model.title)||values.name||typeOf(model.type).title,subtitle=clean(model.subtitle),sections=(model.sections||[]).filter(s=>clean(s.title)||clean(s.text));
 // cover
 page('Copertina','cover');const cph=photos.cover&&photos.cover.src?photos.cover:null,kind=coverKind==='photo'&&!cph?'brand':coverKind;
 if(coverKind==='photo'&&!cph)b.warnings.push({kind:'photo',text:'Copertina con la foto: carica una foto, intanto uso «Logo e colori».'});
 if(style==='bold'){
  if(kind==='photo'){bg(pal.primary);usePhoto(cph,-B,-B,W+2*B,182+B,{bg:pal.primary});b.rect(-B,182,W+2*B,4,pal.accent);
   drawShapes(b,logoShapes(br,M,196,70,18,{align:'left',on:C.on,bg:pal.primary}));let y=b.para(M,226,W-2*M,title,{size:30,lead:1.06,bold:true,fill:C.on,label:'Titolo',maxY:H-30,after:3});
   b.para(M,y,W-2*M,subtitle,{size:12,lead:1.35,fill:C.on,label:'Sottotitolo',maxY:H-M})}
  else{const back=kind==='title'?pal.dark:pal.primary,on=PS.ink(back,pal,pal.light,'#FFFFFF');bg(back);
   drawShapes(b,kind==='brand'?logoShapes(br,M+30,M+10,W-2*M-60,48,{on,bg:back}):logoShapes(br,M,M,60,16,{align:'left',on,bg:back}));
   b.rect(M,kind==='title'?118:150,28,2.4,pal.accent);b.text(M,(kind==='title'?118:150)-6,W-2*M,kicker,{size:9.5,bold:true,fill:on,label:'Tipo di documento'});
   let y=b.para(M,(kind==='title'?126:160),W-2*M,title,{size:kind==='title'?44:36,lead:1.04,bold:true,fill:on,label:'Titolo',maxY:H-50,after:5});
   b.para(M,y,W-2*M-20,subtitle,{size:13,lead:1.4,fill:on,label:'Sottotitolo',maxY:H-36});
   b.rect(-B,H-16,W+2*B,16+B,pal.accent);if(br.name||values.name)b.text(M,H-6,W-2*M,values.name,{size:8.5,bold:true,fill:PS.ink(pal.accent,pal,pal.dark,'#000000'),label:'Nome'})}}
 else if(style==='minimal'){bg('#FFFFFF');
  if(kind==='photo'){usePhoto(cph,M,M+18,W-2*M,150);b.logo(M,M,44,12,{align:'left'});b.text(M,192,W-2*M,kicker,{size:8.5,bold:true,fill:C.acc,label:'Tipo di documento'});
   let y=b.para(M,198,W-2*M,title,{size:28,lead:1.08,bold:true,fill:C.txt,label:'Titolo',maxY:H-36,after:4});b.para(M,y,W-2*M,subtitle,{size:11.5,lead:1.45,fill:C.soft,label:'Sottotitolo',maxY:H-24})}
  else if(kind==='title'){b.logo(M,M,40,12,{align:'left'});b.text(M,150,W-2*M,kicker,{size:8.5,bold:true,fill:C.acc,label:'Tipo di documento'});
   let y=b.para(M,158,W-2*M,title,{size:40,lead:1.04,bold:true,fill:C.txt,label:'Titolo',maxY:H-50,after:5});b.rect(M,y,16,.7,pal.accent);b.para(M,y+6,W-2*M-30,subtitle,{size:12,lead:1.45,fill:C.soft,label:'Sottotitolo',maxY:H-26})}
  else{b.logo(M+30,96,W-2*M-60,30);b.text(M,148,W-2*M,kicker,{size:8.5,bold:true,fill:C.acc,align:'center',label:'Tipo di documento'});
   let y=b.para(M+10,155,W-2*M-20,title,{size:26,lead:1.1,bold:true,fill:C.txt,align:'center',label:'Titolo',maxY:H-60,after:4});b.rect(W/2-8,y,16,.7,pal.accent);
   b.para(M+16,y+6,W-2*M-32,subtitle,{size:11.5,lead:1.45,fill:C.soft,align:'center',label:'Sottotitolo',maxY:H-40})}
  const site=clean((model.contacts||[]).find(x=>/\.\w{2,}$/.test(x)&&!/@/.test(x))||'');if(site)b.text(M,H-M,W-2*M,site,{size:8,fill:C.soft,align:'center',label:'Sito web'})}
 else{bg(C.bg);b.rect(-B,-B,14+B,H+2*B,pal.primary);b.rect(14,-B,1.6,H+2*B,pal.accent);const x0=30,w0=W-x0-M;
  if(kind==='photo'){usePhoto(cph,15.6,-B,W-15.6+B,170+B);b.logo(x0,182,64,18,{align:'left'});b.text(x0,214,w0,kicker,{size:9,bold:true,fill:C.acc,label:'Tipo di documento'});
   let y=b.para(x0,220,w0,title,{size:30,lead:1.08,bold:true,fill:C.head,label:'Titolo',maxY:H-30,after:4});b.para(x0,y,w0,subtitle,{size:12,lead:1.45,fill:C.soft,label:'Sottotitolo',maxY:H-M})}
  else{b.logo(x0,M+4,kind==='title'?50:84,kind==='title'?14:26,{align:'left'});const ty0=kind==='title'?120:150;b.text(x0,ty0,w0,kicker,{size:9,bold:true,fill:C.acc,label:'Tipo di documento'});
   let y=b.para(x0,ty0+6,w0,title,{size:kind==='title'?46:36,lead:1.04,bold:true,fill:C.head,label:'Titolo',maxY:H-50,after:4});b.rect(x0,y,18,1,pal.accent);
   b.para(x0,y+7,w0-20,subtitle,{size:13,lead:1.45,fill:C.soft,label:'Sottotitolo',maxY:H-36});
   b.line(x0,H-24,W-M,H-24,C.rule,.5);b.text(x0,H-17,w0,[values.name,String(new Date(opts.date||Date.now()).getFullYear())].filter(Boolean).join('  ·  '),{size:8,fill:C.soft,label:'Nome'})}}
 // sections: one continuous flow. A section starts on a new page when its title, photo and first lines would not fit
 // in what is left, when it has a photo in «Deciso», or always with opts.breaks; long sections go on («segue»).
 const starts=[],bgPage=style==='minimal'?'#FFFFFF':C.bg,TOPY=style==='bold'?26:M+8,GAP=style==='minimal'?16:13;
 const colGeo=y0=>{if(style==='bold'){const cw=(W-2*M-8)/2;return [{x:M,w:cw,y:y0,bottom:BODY_BOTTOM},{x:M+cw+8,w:cw,y:y0,bottom:BODY_BOTTOM}]}
  return [{x:style==='editorial'?M+50:M+24,w:style==='editorial'?W-2*M-50:W-2*M-48,y:y0,bottom:BODY_BOTTOM}]};
 const prep=(bl,w)=>{let firstP=true;return bl.map(k=>{const s=k.kind==='p'&&firstP&&style!=='bold'?{size:ty.first,lead:ty.firstLead,bold:false,fill:style==='minimal'?C.txt:C.head}:k.kind==='sub'?{size:ty.sub,lead:1.3,bold:true,fill:C.head}:{size:ty.body,lead:ty.lead,bold:false,fill:C.txt};
  if(k.kind==='p')firstP=false;const ind=k.kind==='bullet'?4.2:0;return {k,s,ind,ls:PS.wrap(k.text,s.size,w-ind,s.bold),lh:ptMm(s.size*s.lead)}})};
 const gapAfter=o=>o.k.kind==='bullet'?o.lh*.18:o.k.kind==='sub'?o.lh*.15:o.lh*.55,heightOf=list=>list.reduce((a,o)=>a+o.ls.length*o.lh+gapAfter(o),0);
 const boldTitle=(st,atTop)=>PS.wrap(st,atTop?26:21,W-2*M,true).slice(0,3);
 // How tall the section's head is (for the «does it fit here» test).
 const headH=(st,ph,atTop)=>{if(style==='editorial')return Math.max(ph?88:0,cap(30)+6+PS.wrap(st,14,40,true).length*ptMm(14*1.18)+6);
  if(style==='bold'){const tl=boldTitle(st,atTop);return 12+cap(11)+5+tl.length*ptMm((atTop?26:21)*1.06)+12}
  return 5+PS.wrap(st,22,W-2*M-48,true).length*ptMm(22*1.12)+14+(ph?80:0)};
 // The head of a section at y0 → {bodyY, sideEnd}.
 const sectionHead=(num,st,ph,y0,atTop)=>{
  if(style==='editorial'){const sx=M,sw=40,mx=M+50,mw=W-2*M-50;b.text(sx,y0+cap(30),sw,num,{size:30,bold:true,fill:C.acc,label:'Numero'});
   const yy=b.para(sx,y0+cap(30)+6,sw,st,{size:14,lead:1.18,bold:true,fill:C.head,label:'Titolo della sezione',maxY:BODY_BOTTOM,after:3});b.rect(sx,yy+1,12,.9,pal.accent);
   let top=y0;if(usePhoto(ph,mx,top,mw,80))top+=88;return {bodyY:top,sideEnd:yy+4}}
  if(style==='bold'){let top=atTop?-B:y0;if(atTop&&usePhoto(ph,-B,-B,W+2*B,96+B,{bg:pal.primary}))top=96;
   const size=atTop?26:21,tl=boldTitle(st,atTop),inner=12+cap(11)+5+tl.length*ptMm(size*1.06)+10,bandH=atTop&&top<0?Math.max(64+B,inner+30):inner;
   b.rect(-B,top,W+2*B,bandH,pal.primary);b.rect(-B,top+bandH,W+2*B,2.4,pal.accent);const ty0=top+bandH-10-tl.length*ptMm(size*1.06);
   b.text(M,ty0-5,W-2*M,num,{size:11,bold:true,fill:C.onAcc,label:'Numero'});b.para(M,ty0,W-2*M,st,{size,lead:1.06,bold:true,fill:C.on,label:'Titolo della sezione',maxY:top+bandH-4,after:0});
   return {bodyY:top+bandH+2.4+11,sideEnd:0}}
  const x=M+24,w=W-2*M-48;b.text(x,y0+cap(9),w,num+' —',{size:9,bold:true,fill:C.acc,label:'Numero'});let yy=b.para(x,y0+5,w,st,{size:22,lead:1.12,bold:true,fill:C.txt,label:'Titolo della sezione',maxY:BODY_BOTTOM,after:4});
  b.rect(x,yy,14,.6,pal.accent);yy+=10;if(usePhoto(ph,x,yy,w,72))yy+=80;return {bodyY:yy,sideEnd:0}};
 const contHead=(num,st)=>{if(style==='editorial'){b.text(M,TOPY+cap(8),40,num+' · '+st,{size:8,bold:true,fill:C.soft,label:'Titolo della sezione'});b.text(M,TOPY+cap(8)+ptMm(8*1.4),40,'segue',{size:8,fill:C.soft,label:'Segue'});return TOPY}
  if(style==='bold'){b.rect(-B,-B,W+2*B,14+B,pal.primary);b.text(M,9,W-2*M,num+' · '+st+' · segue',{size:8,bold:true,fill:C.on,label:'Titolo della sezione'});return TOPY}
  b.text(M+24,M+14,W-2*M-48,num+' — '+st+' (segue)',{size:8,fill:C.soft,label:'Titolo della sezione'});return M+24};
 let pageEnd=null;
 sections.forEach((sec,i)=>{const n=i+1,num=pad2(n),st=clean(sec.title)||'Sezione '+n,ph=(photos.sections||[])[i]||sec.photo||null,bl=blocks(sec.text);
  if(!bl.length)b.warnings.push({kind:'empty',text:'La sezione «'+st+'» non ha testo.'});
  const est=headH(st,ph,false)+3*ptMm(ty.body*ty.lead),atTop=pageEnd==null||!!opts.breaks||(!!ph&&style==='bold')||pageEnd+GAP+est>BODY_BOTTOM;
  if(atTop){page(st,'section');bg(bgPage)}
  const y0=atTop?TOPY:pageEnd+GAP;starts.push({title:st,page:pages.length,num});
  const h=sectionHead(num,st,ph,y0,atTop);let cols=colGeo(h.bodyY),ci=0,y=h.bodyY,maxY=Math.max(h.sideEnd,h.bodyY);
  const items=prep(bl,cols[0].w);
  if(style==='bold'){const tot=heightOf(items);if(tot>6*ptMm(ty.body*ty.lead)&&tot<=2*(BODY_BOTTOM-h.bodyY)-ptMm(ty.body*ty.lead))cols[0].bottom=Math.min(BODY_BOTTOM,h.bodyY+tot/2+ptMm(ty.body*ty.lead)*.6)}
  const next=()=>{ci++;if(ci<cols.length){y=cols[ci].y;return}page(st+' (segue)','section');bg(bgPage);const yc=contHead(num,st);cols=colGeo(yc);ci=0;y=yc;maxY=yc};
  for(const o of items){if(o.k.kind==='sub'&&y+cap(o.s.size)+o.lh*2.5>cols[ci].bottom)next();
   o.ls.forEach((s,li)=>{if(y+cap(o.s.size)+desc(o.s.size)>cols[ci].bottom)next();const c=cols[ci],base=y+cap(o.s.size);
    if(li===0&&o.k.kind==='bullet')line(c.x,base,o.k.mark,o.s.size,{fill:C.acc,bold:true,label:'Elenco'});
    if(s)line(c.x+o.ind,base,s,o.s.size,{fill:o.s.fill,bold:o.s.bold,label:'Testo · '+st});y+=o.lh;maxY=Math.max(maxY,y)});
   y+=gapAfter(o)}
  pageEnd=maxY});
 // closing page (back cover)
 const contactLines=(model.contacts||[]).slice(0,6),closeText=block(model.closing&&model.closing.text);
 const back=page('Retro','back');
 if(style==='bold'){bg(pal.primary);drawShapes(b,logoShapes(br,M+30,64,W-2*M-60,40,{on:C.on,bg:pal.primary}));let y=130;
  if(clean(model.closing&&model.closing.title))y=b.para(M,y,W-2*M,model.closing.title,{size:20,lead:1.15,bold:true,fill:C.on,align:'center',label:'Chiusura',maxY:H-60,after:4});
  y=b.para(M+10,y,W-2*M-20,closeText,{size:12,lead:1.45,fill:C.on,align:'center',label:'Chiusura',maxY:H-70,after:10});b.rect(W/2-12,y,24,1.4,pal.accent);y+=10;
  contactLines.forEach(c=>{y=b.para(M,y,W-2*M,c,{size:11,lead:1.35,fill:C.on,align:'center',label:'Contatti',maxY:H-M,after:1.5})})}
 else if(style==='minimal'){bg('#FFFFFF');b.logo(M+50,92,W-2*M-100,22);let y=136;
  if(clean(model.closing&&model.closing.title))y=b.para(M,y,W-2*M,model.closing.title,{size:16,bold:true,fill:C.txt,align:'center',label:'Chiusura',after:4});
  y=b.para(M+20,y,W-2*M-40,closeText,{size:11,lead:1.55,fill:C.soft,align:'center',label:'Chiusura',maxY:H-70,after:10});b.line(W/2-10,y,W/2+10,y,pal.accent,.6);y+=8;
  contactLines.forEach(c=>{y=b.para(M,y,W-2*M,c,{size:10,lead:1.4,fill:C.txt,align:'center',label:'Contatti',maxY:H-M,after:1})})}
 else{bg(C.bg);b.rect(-B,H-62,W+2*B,62+B,pal.primary);b.rect(-B,H-65,W+2*B,3,pal.accent);b.logo(M+30,60,W-2*M-60,34);let y=118;
  if(clean(model.closing&&model.closing.title))y=b.para(M,y,W-2*M,model.closing.title,{size:18,lead:1.15,bold:true,fill:C.head,align:'center',label:'Chiusura',maxY:H-80,after:4});
  b.para(M+12,y,W-2*M-24,closeText,{size:12,lead:1.5,fill:C.txt,align:'center',label:'Chiusura',maxY:H-76});
  let cy=H-62+12;contactLines.forEach(c=>{cy=b.para(M,cy,W-2*M,c,{size:10.5,lead:1.3,fill:C.on,align:'center',label:'Contatti',maxY:H-M,after:1})})}
 if(!contactLines.length)b.warnings.push({kind:'contacts',text:'Nessun contatto nel profilo del progetto: il retro ha solo il logo e la chiusura. Aggiungili nel profilo (telefono, email, sito, indirizzo).'});
 // table of contents from TOC_FROM pages
 pages.pop();const contentPages=pages.splice(1);const total=1+contentPages.length+1;let toc=null;
 if(total+1>=TOC_FROM&&starts.length>1){toc=page('Indice','toc');pages.pop()}
 pages.push(...(toc?[toc]:[]),...contentPages);
 // notes pages to a multiple of 4 (saddle stitching), if asked
 const filler=[];if(opts.pad4){while((pages.length+1+filler.length)%4){const p=page('Note','notes');pages.pop();bg(style==='minimal'?'#FFFFFF':C.bg);b.text(M,M+14,W-2*M,'Note',{size:16,bold:true,fill:C.head,label:'Note'});for(let y=M+30;y<BODY_BOTTOM;y+=9)b.line(M,y,W-M,y,C.rule,.4);filler.push(p)}}
 pages.push(...filler,back);
 if(toc){b.items=toc.items;bg(style==='minimal'?'#FFFFFF':C.bg);const off=1;let y;
  if(style==='bold'){b.rect(-B,-B,W+2*B,62+B,pal.primary);b.text(M,48,W-2*M,'Indice',{size:30,bold:true,fill:C.on,label:'Indice'});y=82}
  else{b.text(style==='minimal'?M+24:M,M+14+cap(28),W-2*M,'Indice',{size:28,bold:true,fill:style==='minimal'?C.txt:C.head,label:'Indice'});y=M+40;if(style==='editorial')b.rect(M,M+40-8,18,1,pal.accent)}
  const x0=style==='minimal'?M+24:M,x1=style==='minimal'?W-M-24:W-M,rows=starts.length,rh=Math.max(9,Math.min(15,(BODY_BOTTOM-y)/rows));
  starts.forEach(s=>{const pn=String(s.page+off);const base=y+rh/2+cap(12)/2;b.text(x0,base,12,s.num,{size:11,bold:true,fill:C.acc,label:'Indice · numero'});
   const tw=x1-x0-30;let t=s.title;while(PS.textWidth(t,12,false)/72*25.4>tw&&t.length>4)t=t.slice(0,-2).trimEnd()+'…';b.text(x0+14,base,tw,t,{size:12,fill:C.txt,label:'Indice · titolo'});
   b.text(x1-14,base,14,pn,{size:12,bold:true,fill:C.head,align:'right',label:'Indice · pagina'});b.line(x0,y+rh,x1,y+rh,C.rule,.4);y+=rh})}
 // footers: name and page number on every inner page
 pages.forEach((p,i)=>{if(p.kind==='cover'||p.kind==='back')return;b.items=p.items;const n=String(i+1),fy=A4.h-FOOT;
  const onBand=false,fc=onBand?C.on:C.soft;
  if(style!=='minimal')b.line(M,fy-cap(8)-3.2,W-M,fy-cap(8)-3.2,C.rule,.4);
  b.text(M,fy,W-2*M-20,values.name+(style==='minimal'||title===values.name?'':'  ·  '+title),{size:7.5,fill:fc,label:'Piè di pagina'});
  b.text(W-M-14,fy,14,n,{size:8.5,bold:true,fill:C.head,align:'right',label:'Numero di pagina'})});
 b.items=null;
 const doc={format:'documento',type:model.type,style,cover:kind,title:typeOf(model.type).title+' · '+title,margin:M,brand:br,values,dpi:300,pages,warnings:b.warnings,toc:!!toc,starts};
 doc.warnings=dedupe(doc.warnings.concat(PS.safeArea(doc),PS.glyphs(doc)));
 if(pages.length%4)doc.warnings.push({kind:'pages',text:'Il documento ha '+pages.length+' pagine: per la rilegatura a punto metallico serve un multiplo di 4 ('+(pages.length+4-pages.length%4)+'). Puoi aggiungere pagine «Note» o chiedere alla tipografia.'});
 return doc}
const dedupe=list=>{const seen=new Set();return list.filter(w=>{const k=w.kind+'|'+w.text;if(seen.has(k))return false;seen.add(k);return true})};

// ---- technical sheet ----
function layoutSheet(model,brand,opts={}){const style=styleOf(opts.style),W=A4.w,H=A4.h,B=PS.BLEED,br=brand||PS.brandOf({},model.name),C=paletteFor(br,style),pal=C.pal,ph=opts.photos&&opts.photos.cover;
 const values={name:clean(model.name||br.name)},b=PS.builder({id:'documento',w:W,h:H},br,values,M),pages=[],product=clean(model.product)||'Prodotto';
 const date=new Date(opts.date||Date.now()),day=pad2(date.getDate())+'/'+pad2(date.getMonth()+1)+'/'+date.getFullYear();
 const page=label=>{const items=[];b.items=items;const p={label,w:W,h:H,items,folds:[],kind:'sheet'};pages.push(p);b.rect(-B,-B,W+2*B,H+2*B,style==='minimal'?'#FFFFFF':C.bg);return p};
 const usePhoto=(x,y,w,h,o)=>{if(!ph||!ph.src||!(ph.w>0))return false;b.photoSrc=ph;const r=b.photo(x,y,w,h,o);b.photoSrc=null;return r};
 const rows=(model.specs||[]).filter(r=>clean(r.label)),missing=rows.filter(r=>isMissing(r.value));
 const header=first=>{let y;
  if(style==='bold'){const bandH=first?74:30;b.rect(-B,-B,W+2*B,bandH+B,pal.primary);b.rect(-B,bandH,W+2*B,2.2,pal.accent);drawShapes(b,logoShapes(br,M,M-4,54,16,{align:'left',on:C.on,bg:pal.primary}));
   b.text(W-M-80,M+6,80,'SCHEDA TECNICA',{size:9,bold:true,fill:C.onAcc,align:'right',label:'Tipo di documento'});
   if(first){const pw=ph&&ph.src?W-2*M-56:W-2*M;b.para(M,40,pw,product,{size:24,lead:1.08,bold:true,fill:C.on,label:'Prodotto',maxY:bandH-4,after:0});if(ph&&ph.src)usePhoto(W-M-48,M-2,48,48)}
   else b.text(M,bandH-6,W-2*M-60,product+' · segue',{size:11,bold:true,fill:C.on,label:'Prodotto'});y=bandH+12}
  else if(style==='minimal'){b.logo(M,M,40,12,{align:'left'});b.text(W-M-80,M+8,80,'SCHEDA TECNICA',{size:8.5,bold:true,fill:C.acc,align:'right',label:'Tipo di documento'});
   if(first){const pw=ph&&ph.src?W-2*M-60:W-2*M;let yy=b.para(M,M+26,pw,product,{size:22,lead:1.1,bold:true,fill:C.txt,label:'Prodotto',maxY:110,after:3});b.rect(M,yy,14,.6,pal.accent);
    if(ph&&ph.src){usePhoto(W-M-52,M+22,52,52);yy=Math.max(yy,M+22+52)}y=yy+8}
   else{b.text(M,M+24,W-2*M,product+' · segue',{size:11,bold:true,fill:C.txt,label:'Prodotto'});y=M+34}}
  else{b.rect(-B,-B,W+2*B,6+B,pal.primary);b.logo(M,M-2,58,17,{align:'left'});b.text(W-M-80,M+8,80,'SCHEDA TECNICA',{size:9,bold:true,fill:C.acc,align:'right',label:'Tipo di documento'});
   b.line(M,M+20,W-M,M+20,C.rule,.5);
   if(first){const pw=ph&&ph.src?W-2*M-62:W-2*M;let yy=b.para(M,M+30,pw,product,{size:24,lead:1.08,bold:true,fill:C.head,label:'Prodotto',maxY:120,after:2});
    if(ph&&ph.src){usePhoto(W-M-54,M+28,54,54);yy=Math.max(yy,M+28+54)}y=yy+6}
   else{b.text(M,M+30,W-2*M,product+' · segue',{size:11,bold:true,fill:C.head,label:'Prodotto'});y=M+40}}
  return y};
 page('Pagina 1');let y=header(true);
 if(clean(model.intro)){y=b.para(M,y,W-2*M,model.intro,{size:10.5,lead:1.5,fill:C.txt,label:'Descrizione',maxY:150,after:8})}
 if(!rows.length)b.warnings.push({kind:'empty',text:'La scheda non ha dati: aggiungi le voci della tabella.'});
 const LW=62,pad=2.6,size=9.5,lead=ptMm(size*1.35),vx=M+LW+4,vw=W-M-vx-2,bottom=BODY_BOTTOM-(missing.length?10:0);
 const headRow=()=>{const fill=style==='bold'?pal.dark:style==='minimal'?null:pal.primary,on=fill?PS.ink(fill,pal,'#FFFFFF',pal.light):C.soft;if(fill)b.rect(M,y,W-2*M,9,fill);else b.line(M,y+9,W-M,y+9,C.txt,.6);
  b.text(M+3,y+6.1,LW,'Caratteristica',{size:8.5,bold:true,fill:on,label:'Intestazione'});b.text(vx,y+6.1,vw,'Valore',{size:8.5,bold:true,fill:on,label:'Intestazione'});y+=9};
 headRow();let shown=0;
 for(let i=0;i<rows.length;i++){const r=rows[i],miss=isMissing(r.value),lab=PS.wrap(clean(r.label),size,LW-4,true),val=miss?[MISSING]:PS.wrap(clean(r.value),size,vw-(0),false),h=Math.max(lab.length,val.length)*lead+2*pad;
  if(y+h>bottom){if(pages.length>=MAX_SHEET_PAGES)break;page('Pagina '+(pages.length+1));y=header(false);headRow()}
  const zebra=style!=='minimal'&&i%2===0;if(zebra)b.rect(M,y,W-2*M,h,C.tint);if(style==='minimal')b.line(M,y+h,W-M,y+h,C.rule,.35);
  lab.forEach((s,k)=>b.text(M+3,y+pad+cap(size)+k*lead,LW-4,s,{size,bold:true,fill:C.txt,label:'Voce · '+r.label}));
  if(miss){const wc=PS.ink(zebra?C.tint:C.bg,pal,WARN_INK);b.rect(vx,y+pad+cap(size)-2.2,2.2,2.2,wc);b.text(vx+3.6,y+pad+cap(size),vw-4,MISSING,{size,bold:true,fill:wc,label:'Da verificare · '+r.label})}
  else val.forEach((s,k)=>b.text(vx,y+pad+cap(size)+k*lead,vw,s,{size,fill:C.txt,label:'Valore · '+r.label}));
  y+=h;shown++}
 if(shown<rows.length)b.warnings.push({kind:'overflow',text:'La tabella non entra in '+MAX_SHEET_PAGES+' pagine: '+(rows.length-shown)+' voci escluse. Accorcia i valori o dividi la scheda.'});
 if(missing.length){const wc=PS.ink(style==='minimal'?'#FFFFFF':C.bg,pal,WARN_INK);y+=5;b.rect(M,y+cap(8.5)-2.2,2.2,2.2,wc);
  b.text(M+3.6,y+cap(8.5),W-2*M-4,missing.length+(missing.length>1?' dati':' dato')+' «'+MISSING+'»: non forniti, da completare prima di stampare o pubblicare.',{size:8.5,bold:true,fill:wc,label:'Legenda'})}
 pages.forEach((p,i)=>{b.items=p.items;const fy=H-FOOT;b.line(M,fy-cap(8)-3.2,W-M,fy-cap(8)-3.2,C.rule,.4);
  b.text(M,fy,W-2*M-30,[values.name,'Scheda tecnica · revisione del '+day].filter(Boolean).join('  ·  '),{size:7.5,fill:C.soft,label:'Piè di pagina'});
  b.text(W-M-20,fy,20,(i+1)+'/'+pages.length,{size:8.5,bold:true,fill:C.head,align:'right',label:'Numero di pagina'})});
 b.items=null;const doc={format:'documento',type:'scheda',style,title:'Scheda tecnica · '+product,margin:M,brand:br,values,dpi:300,pages,warnings:b.warnings,missing:missing.map(r=>r.label),rows:shown};
 doc.warnings=dedupe(doc.warnings.concat(PS.safeArea(doc),PS.glyphs(doc)));return doc}

// ---- presentation: one slide model → shapes (mm) for the preview/PDF and the .pptx ----
// Text fitting: lines from Helvetica metrics, line height 1.2 × size (PowerPoint single spacing); shrinks to 60 %.
function measure(paras,w,scale){let h=0;const out=paras.map((p,i)=>{const size=p.size*scale,ind=p.bullet?Math.max(4,size*.22):0,lines=PS.wrap(p.text,size,w-ind,p.bold),lead=ptMm(size*1.2),before=i?ptMm((p.spcBef||0)*scale):0;h+=before+Math.max(1,lines.length)*lead;return {p,size,ind,lines,lead,before}});return {h,out}}
function fitText(s){let scale=1,m=measure(s.paras,s.w,1);while(m.h>s.h&&scale>.6){scale=Math.round((scale-.05)*100)/100;m=measure(s.paras,s.w,scale)}s.scale=scale;s.fits=m.h<=s.h+.01;s.measured=m;return s}
function deckFrom(model,brand,opts={}){const style=styleOf(opts.style),br=brand||PS.brandOf({},model.name),pal=br.palette,W=SLIDE.w,H=SLIDE.h,ph=opts.photos&&opts.photos.cover&&opts.photos.cover.src?opts.photos.cover:null;
 const light=style==='minimal'?'#FFFFFF':pal.light,dark=PS.ink(light,pal,pal.dark),head=PS.ink(light,pal,pal.primary,pal.dark),soft=PS.ink(light,pal,pal.secondary,pal.dark),acc=PS.ink(light,pal,pal.accent,pal.primary,pal.dark);
 const onP=PS.ink(pal.primary,pal,pal.light,'#FFFFFF',pal.dark),onPA=PS.ink(pal.primary,pal,pal.accent,pal.light,'#FFFFFF'),name=clean(model.name||br.name),slides=(model.slides||[]).filter(s=>clean(s.title)||(s.bullets||[]).length),n=slides.length,warnings=[];
 let secN=0;
 const out=slides.map((s,i)=>{const L=SLIDE_LAYOUTS.some(l=>l.id===s.layout)?s.layout:'content',sh=[],bul=(s.bullets||[]).map(clean).filter(Boolean),idx=i+1;let bg=light;
  const T=(o)=>{const x={t:'text',anchor:'t',...o};sh.push(fitText(x));if(!x.fits)warnings.push({kind:'overflow',text:'Slide '+idx+': il testo non entra tutto, accorcialo.'});return x};
  const para=(text,size,o={})=>({text,size,bold:!!o.bold,color:o.color||dark,align:o.align||'l',bullet:!!o.bullet,font:o.font||'minor',spcBef:o.spcBef||0});
  const footer=(c)=>{sh.push(fitText({t:'text',name:'Piè di pagina',x:16,y:H-10,w:150,h:5,anchor:'b',paras:[para(name,9,{color:c||soft})]}));sh.push(fitText({t:'text',name:'Numero',x:W-46,y:H-10,w:30,h:5,anchor:'b',paras:[para(String(idx),9,{color:c||soft,align:'r',bold:true})]}))};
  if(L==='title'){
   if(style==='bold'){bg=pal.primary;if(ph)sh.push({t:'photo',x:W*.56,y:0,w:W*.44,h:H});sh.push({t:'rect',x:16,y:58,w:22,h:1.6,fill:pal.accent});
    T({ph:'ctrTitle',name:'Titolo',x:16,y:62,w:ph?W*.56-26:W-32,h:44,anchor:'t',paras:[para(s.title,40,{bold:true,color:onP,font:'major'})]});
    if(bul.length)T({ph:'subTitle',idx:1,name:'Sottotitolo',x:16,y:110,w:ph?W*.56-26:W-32,h:20,paras:bul.slice(0,2).map((b,k)=>para(b,16,{color:onP,spcBef:k?4:0}))});
    sh.push(...logoShapes(br,16,16,60,18,{align:'left',on:onP,bg:pal.primary}))}
   else if(style==='minimal'){bg='#FFFFFF';sh.push({t:'logo',x:24,y:18,w:46,h:14,align:'left',bg:'#FFFFFF'});if(ph)sh.push({t:'photo',x:W-24-78,y:18,w:78,h:H-36});const tw=ph?W-48-86:W-48;
    T({ph:'ctrTitle',name:'Titolo',x:24,y:44,w:tw,h:50,anchor:'b',paras:[para(s.title,36,{bold:true,color:dark,font:'major'})]});sh.push({t:'rect',x:24,y:99,w:16,h:.7,fill:pal.accent});
    if(bul.length)T({ph:'subTitle',idx:1,name:'Sottotitolo',x:24,y:105,w:tw,h:20,paras:bul.slice(0,2).map((b,k)=>para(b,15,{color:soft,spcBef:k?4:0}))})}
   else{bg=light;sh.push({t:'rect',x:0,y:0,w:92,h:H,fill:pal.primary});sh.push({t:'rect',x:92,y:0,w:1.6,h:H,fill:pal.accent});
    if(ph)sh.push({t:'photo',x:0,y:0,w:92,h:H});else sh.push(...logoShapes(br,14,H/2-16,64,32,{on:onP,bg:pal.primary}));
    T({name:'Marca',x:108,y:30,w:W-124,h:7,paras:[para(name.toUpperCase(),10,{bold:true,color:acc})]});
    T({ph:'ctrTitle',name:'Titolo',x:108,y:40,w:W-124,h:46,anchor:'b',paras:[para(s.title,34,{bold:true,color:head,font:'major'})]});sh.push({t:'rect',x:108,y:91,w:18,h:1.2,fill:pal.accent});
    if(bul.length)T({ph:'subTitle',idx:1,name:'Sottotitolo',x:108,y:97,w:W-124,h:28,paras:bul.slice(0,2).map((b,k)=>para(b,15,{color:soft,spcBef:k?4:0}))})}}
  else if(L==='section'){secN++;const num=pad2(secN);
   if(style==='bold'){bg=pal.primary;T({name:'Numero',x:16,y:20,w:120,h:40,paras:[para(num,72,{bold:true,color:onPA,font:'major'})]});
    T({ph:'title',name:'Titolo',x:16,y:66,w:W-32,h:36,anchor:'t',paras:[para(s.title,34,{bold:true,color:onP,font:'major'})]});if(bul[0])T({ph:'body',idx:1,name:'Testo',x:16,y:106,w:W-32,h:22,paras:[para(bul.join(' '),16,{color:onP})]})}
   else if(style==='minimal'){bg='#FFFFFF';T({name:'Numero',x:24,y:42,w:80,h:8,paras:[para(num+' —',12,{bold:true,color:acc})]});
    T({ph:'title',name:'Titolo',x:24,y:54,w:W-48,h:34,anchor:'t',paras:[para(s.title,30,{bold:true,color:dark,font:'major'})]});if(bul[0])T({ph:'body',idx:1,name:'Testo',x:24,y:92,w:W-48,h:26,paras:[para(bul.join(' '),15,{color:soft})]});footer()}
   else{T({name:'Numero',x:20,y:22,w:100,h:36,paras:[para(num,64,{bold:true,color:acc,font:'major'})]});sh.push({t:'rect',x:20,y:62,w:18,h:1.2,fill:pal.accent});
    T({ph:'title',name:'Titolo',x:20,y:68,w:W-40,h:32,anchor:'t',paras:[para(s.title,32,{bold:true,color:head,font:'major'})]});if(bul[0])T({ph:'body',idx:1,name:'Testo',x:20,y:104,w:W-40,h:22,paras:[para(bul.join(' '),15,{color:soft})]});footer()}}
  else if(L==='closing'){
   const back=style==='bold'?pal.dark:style==='minimal'?'#FFFFFF':pal.primary,on=style==='minimal'?dark:PS.ink(back,pal,pal.light,'#FFFFFF');bg=back;const al=style==='minimal'?'ctr':'l',x=style==='minimal'?24:20,w=W-2*x;
   if(style!=='minimal')sh.push({t:'rect',x,y:48,w:22,h:1.6,fill:pal.accent});
   T({ph:'title',name:'Titolo',x,y:style==='minimal'?36:52,w,h:30,anchor:'t',paras:[para(s.title,38,{bold:true,color:on,font:'major',align:al})]});
   if(bul.length)T({ph:'body',idx:1,name:'Testo',x,y:style==='minimal'?72:88,w,h:34,paras:bul.map((b,k)=>para(b,15,{color:style==='minimal'?soft:on,align:al,spcBef:k?3:0}))});
   sh.push(...(style==='minimal'?[{t:'logo',x:W/2-25,y:H-30,w:50,h:14,bg:back}]:logoShapes(br,W-20-56,H-30,56,16,{align:'right',on,bg:back})))}
  else{const two=L==='two',band=style==='bold',x=style==='minimal'?24:16,w=W-2*x,top=band?40:46,bh=H-top-16,gap=10;
   if(band){sh.push({t:'rect',x:0,y:0,w:W,h:30,fill:pal.primary});sh.push({t:'rect',x:0,y:30,w:W,h:1.4,fill:pal.accent});
    T({ph:'title',name:'Titolo',x,y:6,w,h:20,anchor:'ctr',paras:[para(s.title,26,{bold:true,color:onP,font:'major'})]})}
   else{T({ph:'title',name:'Titolo',x,y:style==='minimal'?16:12,w,h:style==='minimal'?20:22,anchor:'b',paras:[para(s.title,style==='minimal'?24:26,{bold:true,color:style==='minimal'?dark:head,font:'major'})]});
    sh.push({t:'rect',x,y:style==='minimal'?39:37,w:style==='minimal'?10:14,h:style==='minimal'?.6:1,fill:pal.accent})}
   if(bul.length){const P=b=>para(b,20,{bullet:true,color:dark,spcBef:8});
    if(two){const half=Math.ceil(bul.length/2),cw=(w-gap)/2;T({ph:'body',idx:1,sz:'half',name:'Colonna 1',x,y:top,w:cw,h:bh,paras:bul.slice(0,half).map(P)});T({ph:'body',idx:2,sz:'half',name:'Colonna 2',x:x+cw+gap,y:top,w:cw,h:bh,paras:bul.slice(half).map(P)})}
    else T({ph:'body',idx:1,name:'Testo',x,y:top,w,h:bh,paras:bul.map(P)})}
   footer()}
  const wc=words([s.title,...bul].join(' '));if(wc>SLIDE_WORDS&&L!=='closing')warnings.push({kind:'words',text:'Slide '+idx+': '+wc+' parole, meglio entro '+SLIDE_WORDS+' (un’idea per slide: il resto va nelle note).'});
  return {layout:L,bg,shapes:sh,notes:block(s.note),title:s.title,label:'Slide '+idx+' · '+(SLIDE_LAYOUTS.find(l=>l.id===L)||{}).title}});
 if(!out.length)warnings.push({kind:'empty',text:'Nessuna slide: aggiungine almeno una.'});
 if(!ph&&opts.photos&&opts.photos.wanted)warnings.push({kind:'photo',text:'Nessuna foto caricata per la slide del titolo.'});
 return {style,title:clean(model.title)||name||'Presentazione',name,slides:out,warnings:dedupe(warnings)}}
// The slides as print-studio pages (preview and PDF of the slides, 254 × 142,875 mm).
function slideDoc(deck,brand){const br=brand||PS.brandOf({},deck.name),b=PS.builder({id:'slide',w:SLIDE.w,h:SLIDE.h},br,{name:deck.name},0),pages=[];
 deck.slides.forEach(s=>{const items=[];b.items=items;pages.push({label:s.label,w:SLIDE.w,h:SLIDE.h,items,folds:[]});b.rect(-PS.BLEED,-PS.BLEED,SLIDE.w+2*PS.BLEED,SLIDE.h+2*PS.BLEED,s.bg);
  for(const x of s.shapes){if(x.t==='rect')b.rect(x.x,x.y,x.w,x.h,x.fill);
   else if(x.t==='logo')b.logo(x.x,x.y,x.w,x.h,{align:x.align,mono:x.mono,bg:x.bg});
   else if(x.t==='photo'){const p=deck.photo;if(p&&p.src)items.push({t:'image',photo:true,x:x.x,y:x.y,w:x.w,h:x.h,src:p.src,px:{w:p.w,h:p.h},bg:s.bg,label:'Foto'})}
   else if(x.t==='text'){const m=x.measured,top=x.anchor==='b'?x.y+x.h-m.h:x.anchor==='ctr'?x.y+(x.h-m.h)/2:x.y;let y=top;
    m.out.forEach(o=>{y+=o.before;o.lines.forEach((l,k)=>{const base=y+o.lead*.8,tw=PS.textWidth(l,o.size,o.p.bold)/72*25.4,al=o.p.align,left=al==='ctr'?x.x+(x.w-tw)/2:al==='r'?x.x+x.w-tw:x.x+o.ind;
     if(k===0&&o.p.bullet)items.push({t:'text',x:x.x,y:base,s:'•',size:o.size,bold:true,fill:o.p.color,label:'Elenco'});
     if(l)items.push({t:'text',x:left,y:base,s:l,size:o.size,bold:o.p.bold,fill:o.p.color,label:x.name||'Testo'});y+=o.lead})})}}});
 b.items=null;return {format:'slide',type:'presentazione',style:deck.style,title:'Presentazione · '+deck.title,margin:0,brand:br,values:{name:deck.name},dpi:200,pages,warnings:deck.warnings.slice()}}
// The theme of the .pptx from the brand: colours as the scheme, the kit fonts as major/minor fonts (Arial when missing).
function themeFor(brand){const p=brand.palette,f=brand.fonts||{};
 return {name:clean(brand.name)||'Brand',colors:{dk1:p.dark,lt1:'#FFFFFF',dk2:p.primary,lt2:p.light,accent1:p.primary,accent2:p.secondary,accent3:p.accent,accent4:p.dark,accent5:mix(p.primary,'#FFFFFF',.4),accent6:mix(p.secondary,'#FFFFFF',.4),hlink:p.primary,folHlink:p.secondary},
  fonts:{major:clean(f.heading)||'Arial',minor:clean(f.body)||clean(f.heading)||'Arial'}}}
// deck → the pptx-lite input. media: {logo:{type,data,w,h}, 'logo:#HEX':…(one-colour logo), photo:{type,data,w,h}} prepared in
// the browser; without a logo image the name goes in as an editable wordmark text box.
function pptxDeck(deck,brand,media={},opts={}){const br=brand||PS.brandOf({},deck.name),used={};
 const slides=deck.slides.map(s=>{const shapes=[];
  for(const x of s.shapes){
   if(x.t==='rect')shapes.push({t:'rect',x:x.x,y:x.y,w:x.w,h:x.h,fill:x.fill,name:x.name});
   else if(x.t==='text')shapes.push({t:'text',ph:x.ph,idx:x.idx,sz:x.sz,name:x.name,x:x.x,y:x.y,w:x.w,h:x.h,anchor:x.anchor,paras:x.paras.map(p=>({...p,size:Math.round(p.size*(x.scale||1)*2)/2,spcBef:(p.spcBef||0)*(x.scale||1)}))});
   else if(x.t==='photo'){const m=media.photo;if(m&&m.data&&m.w>0){const r=x.w/x.h,ir=m.w/m.h,crop=ir>r?{l:(1-r/ir)/2,r:(1-r/ir)/2}:{t:(1-ir/r)/2,b:(1-ir/r)/2};shapes.push({t:'image',media:'photo',name:'Foto',x:x.x,y:x.y,w:x.w,h:x.h,crop});used.photo=m}}
   else if(x.t==='logo'){const key=x.mono?'logo:'+String(x.mono).toUpperCase():'logo',m=media[key]||(!x.mono&&media.logo);
    if(m&&m.data&&m.w>0){const s2=Math.min(x.w/m.w,x.h/m.h),w=m.w*s2,h=m.h*s2,lx=x.align==='left'?x.x:x.align==='right'?x.x+x.w-w:x.x+(x.w-w)/2;shapes.push({t:'image',media:key,name:'Logo',x:lx,y:x.y+(x.h-h)/2,w,h});used[key]=m}
    else if(deck.name){const col=x.mono||PS.ink(x.bg||'#FFFFFF',br.palette,br.palette.primary,br.palette.dark),t=fitText({t:'text',name:'Logo (nome)',x:x.x,y:x.y,w:x.w,h:x.h,anchor:'ctr',paras:[{text:deck.name,size:Math.min(28,x.h*1.6),bold:true,color:col,font:'major',align:x.align==='left'?'l':x.align==='right'?'r':'ctr'}]});
     shapes.push({...t,paras:t.paras.map(p=>({...p,size:Math.round(p.size*t.scale*2)/2}))})}}}
  return {layout:s.layout,bg:s.bg,shapes,notes:s.notes}});
 return PX.build({title:deck.title,author:opts.author||deck.name||'RADIX',date:opts.date,size:SLIDE,theme:themeFor(br),slides,media:used})}

// ---- outputs ----
// One entry point: the doc (print-studio pages) of a model with a style.
function render(model,brand,opts={}){if(model.type==='presentazione'){const deck=deckFrom(model,brand,opts);deck.photo=opts.photos&&opts.photos.cover||null;const d=slideDoc(deck,brand);d.deck=deck;return d}
 return model.type==='scheda'?layoutSheet(model,brand,opts):layoutDoc(model,brand,opts)}
// The three proposals: the same text in the three styles.
const proposals=(model,brand,opts={})=>STYLES.map(s=>({style:s.id,title:s.title,line:s.line,doc:render(model,brand,{...opts,style:s.id})}));
const pdfWeb=(doc,opts={})=>PS.pdf(doc,{mode:'web',date:opts.date,title:doc.title,producer:'RADIX Studio Documenti'});
const pdfPrint=(doc,opts={})=>PS.pdf(doc,{mode:'print',pdfx:true,date:opts.date,cmyk:opts.cmyk||{},title:doc.title+' · tipografia',producer:'RADIX Studio Documenti'});
const slug=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50);
const baseName=m=>({profile:'company-profile',brochure:'brochure',presentazione:'presentazione',scheda:'scheda-tecnica'}[m.type]||'documento')+'-'+(slug(m.type==='scheda'?m.product:m.name||m.title)||'progetto');
// The edited text as Markdown (what «Salva nel progetto» keeps and the zip carries).
function toMarkdown(model,{style,cover,pages,date}={}){const t=typeOf(model.type),st=STYLES.find(s=>s.id===style),day=date||new Date().toISOString().slice(0,10),L=[];
 L.push('# Documento · '+t.title+' · '+(model.type==='scheda'?clean(model.product):clean(model.title)||clean(model.name)),'',['Impaginazione: '+(st?st.title:'Editoriale'),model.type==='profile'||model.type==='brochure'?'copertina: '+(COVERS.find(c=>c.id===cover)||COVERS[0]).title:'',pages?pages+(model.type==='presentazione'?' slide':' pagine'):'',day].filter(Boolean).join(' · '),'');
 if(model.type==='presentazione')model.slides.forEach((s,i)=>{L.push('## Slide '+(i+1)+' · '+clean(s.title)+' ('+((SLIDE_LAYOUTS.find(l=>l.id===s.layout)||{}).title||'Contenuto')+')','');(s.bullets||[]).forEach(b=>L.push('- '+b));if(clean(s.note))L.push('','Nota: '+block(s.note));L.push('')});
 else if(model.type==='scheda'){L.push('## '+clean(model.product),'');if(clean(model.intro))L.push(block(model.intro),'');L.push('| Caratteristica | Valore |','|---|---|',...model.specs.filter(r=>clean(r.label)).map(r=>'| '+clean(r.label).replace(/\|/g,'/')+' | '+(isMissing(r.value)?MISSING:clean(r.value).replace(/\|/g,'/'))+' |'),'')}
 else{if(clean(model.subtitle))L.push(clean(model.subtitle),'');model.sections.forEach((s,i)=>{L.push('## '+pad2(i+1)+' · '+(clean(s.title)||'Sezione '+(i+1)),'',block(s.text),'')});
  if(model.closing&&(clean(model.closing.title)||clean(model.closing.text)))L.push('## Chiusura','',[clean(model.closing.title),block(model.closing.text)].filter(Boolean).join('\n'),'')}
 if(model.checks&&model.checks.length)L.push('## Da controllare (dallo Studio Testi)','',...model.checks.map(c=>'- '+c),'');
 return L.join('\n').trim()+'\n'}
function readme(model,{style,files,pages}={}){const t=typeOf(model.type),st=STYLES.find(s=>s.id===style)||STYLES[0];
 return ['RADIX · Studio Documenti','',t.title+' · impaginazione «'+st.title+'»'+(pages?' · '+pages+(model.type==='presentazione'?' slide':' pagine'):''),'','FILE',...files.map(f=>'- '+f),'',
  'NOTE',...notes(model).map(n=>'- '+n),''].join('\r\n')}
function notes(model){const out=[];
 if(model.type==='presentazione')out.push('PowerPoint 16:9 con testi modificabili, colori e font del Kit identità nel tema e le note del relatore. Se i font del kit non sono installati sul computer, PowerPoint ne usa uno simile: installali da Google Fonts per vederli uguali.','Il PDF delle slide usa Helvetica: è un’anteprima fedele dell’impaginazione, non dei font del kit.');
 else out.push('PDF per lo schermo in RGB con testo in Helvetica (i font del kit non si possono incorporare da qui).','PDF per la tipografia in CMYK (FOGRA39 indicato per nome, testi in tracciati, 3 mm di abbondanza e segni di taglio): la tipografia fa comunque il suo preflight.');
 if(model.type==='scheda')out.push('I dati scritti «'+MISSING+'» non sono stati forniti: RADIX non li inventa. Completali prima di stampare o pubblicare.');
 out.push('Testi, colori e logo vengono dal progetto: rileggi tutto prima di consegnare.');return out}
// The zip: PDFs, PPTX, the text and a read-me. parts: {pdf, print, slidesPdf, pptx} (Uint8Array, optional).
function bundle(model,parts,{style,pages,date}={}){const base=baseName(model),files=[];
 if(parts.pptx)files.push({name:base+'.pptx',data:parts.pptx});if(parts.pdf)files.push({name:base+(model.type==='presentazione'?'-slide':'')+'.pdf',data:parts.pdf});
 if(parts.print)files.push({name:base+'-tipografia.pdf',data:parts.print});files.push({name:base+'-testo.md',data:toMarkdown(model,{style,pages,date})});
 files.push({name:'LEGGIMI.txt',data:readme(model,{style,pages,files:files.map(f=>f.name)})});return files}
const MAX_KEPT=60;
// Saved in the project: the edited text, layout and page count in the Art Director's thread (no binaries, no photos).
function savedEntry(model,md,{by,at,style,cover,pages}={}){const when=at||new Date().toISOString(),t=typeOf(model.type),name=t.title+' · '+(model.type==='scheda'?clean(model.product):clean(model.title)||clean(model.name));
 const keep={...model,sections:(model.sections||[]).map(s=>({title:s.title,text:s.text}))};
 return [{role:'user',content:t.title+' impaginato nello Studio Documenti del pannello Marketing.',display:t.title+' impaginato nello Studio Documenti',by:by||'Pannello Marketing',at:when,source:'doc-studio'},
  {role:'assistant',agent:AGENT,content:'Ecco il documento impaginato, salvato nel progetto (PDF e PowerPoint si scaricano dallo Studio Documenti).\n\n---DOCUMENTO: Documento · '+name+'---\n'+md+'\n---FINE DOCUMENTO---',at:when,source:'doc-studio',
   document:{type:model.type,style:styleOf(style),cover:coverOf(cover),pages:pages||0,model:keep}}]}
async function saveToProject(ws,projectId,model,opts={}){if(!ws||typeof ws.bind!=='function')throw Error('Archivio del progetto non disponibile.');
 const d=ws.bind(projectId,'agents'),md=toMarkdown(model,opts);
 for(let i=0;i<3;i++){const cur=(await d.load())||{},conv={...(cur.conversations||{})};conv[AGENT]=(Array.isArray(conv[AGENT])?conv[AGENT]:[]).concat(savedEntry(model,md,opts)).slice(-MAX_KEPT);
  try{return await d.save({...cur,schemaVersion:1,conversations:conv})}catch(e){if(!(ws.ConflictError&&e instanceof ws.ConflictError)||i===2)throw e}}}
// Saved copies of the Studio Testi that fit a document type first (brochure for profile and brochure, and so on).
function sourcesFor(type,copies){const want=typeOf(type).copy,kind=c=>{const k=String(c.title||'').toLowerCase();return k.startsWith('brochure e company profile')?'brochure':k.startsWith('presentazione')?'presentazione':k.startsWith('scheda tecnica')?'scheda':'altro'};
 return (copies||[]).map(c=>({...c,kind:kind(c)})).sort((a,b)=>(b.kind===want)-(a.kind===want))}

// ---- browser widget ----
let counter=0;
const dom=()=>root.document;
const el=(tag,text,cls)=>{const n=dom().createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
const button=(text,cls)=>{const b=el('button',text,cls||'');b.type='button';return b};
const fileUrl=f=>new Promise((res,rej)=>{const r=new root.FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(Error('File non leggibile'));r.readAsDataURL(f)});
async function readPhoto(file){if(!/^image\/(jpeg|png|webp)$/.test(file.type))throw Error('usa una foto JPEG, PNG o WebP');if(file.size>25e6)throw Error('foto troppo grande (massimo 25 MB)');
 const src=await fileUrl(file),img=new root.Image();img.src=src;await img.decode();return {src,w:img.naturalWidth,h:img.naturalHeight,name:file.name}}
// Canvas → bytes (PNG for logos, JPEG for photos).
async function canvasBytes(c,type,q){const blob=await new Promise(r=>c.toBlob(r,type,q));return new Uint8Array(await blob.arrayBuffer())}
async function logoImage(svg,maxW){const vb=PS.viewBox(svg);if(!vb)return null;const s=Math.min(4,maxW/vb[2]),w=Math.max(1,Math.round(vb[2]*s)),h=Math.max(1,Math.round(vb[3]*s)),img=new root.Image();img.src=PS.svgUrl(svg);await img.decode();
 const c=dom().createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);return {type:'png',data:await canvasBytes(c,'image/png'),w,h}}
async function photoImage(p,maxPx=2000){const img=new root.Image();img.src=p.src;await img.decode();const s=Math.min(1,maxPx/Math.max(img.naturalWidth,img.naturalHeight)),w=Math.round(img.naturalWidth*s),h=Math.round(img.naturalHeight*s);
 const c=dom().createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);return {type:'jpeg',data:await canvasBytes(c,'image/jpeg',.88),w,h}}
async function deckMedia(deck,brand){const media={},need=new Set();for(const s of deck.slides)for(const x of s.shapes){if(x.t==='logo')need.add(x.mono?'logo:'+String(x.mono).toUpperCase():'logo');if(x.t==='photo')need.add('photo')}
 for(const k of need){try{if(k==='photo'){if(deck.photo&&deck.photo.src)media.photo=await photoImage(deck.photo)}else if(brand.logo){const svg=k==='logo'?brand.logo:PS.monoSvg(brand.logo,k.slice(5));media[k]=await logoImage(svg,1200)}}catch(e){/* the wordmark takes its place */}}
 return media}
function download(name,bytes,type){const a=el('a');a.href=root.URL.createObjectURL(new root.Blob([bytes],{type}));a.download=name;dom().body.append(a);a.click();a.remove();setTimeout(()=>root.URL.revokeObjectURL(a.href),2000);return name}
const svgOf=(doc,i)=>PS.previewSvg(doc,i,{guides:false});

// ctx: {project (profileFor summary), profile (raw project profile, with identityKit), projectName, projectId, workspace, agentsUrl, by}
function docStudio(ctx={}){const n=++counter,brand=PS.brandOf(ctx.profile,ctx.projectName),pre=PS.prefill(ctx.profile,{projectName:ctx.projectName,summary:ctx.project});
 const contacts={address:pre.address,phone:pre.phone,email:pre.email,website:pre.website};
 let type='profile',madeType=null,model=null,style='editorial',cover='brand',pad4=false,busy=false,copies=null,last=null;const photos={cover:null,sections:[]};
 const wrap=el('div',undefined,'tool photo-studio print-studio doc-studio'),steps=el('ol',undefined,'ps-steps');['Le domande','Scegli l’impaginazione','Rifinisci','Scarica e salva'].forEach((t,i)=>{const li=el('li',(i+1)+' · '+t);li.dataset.step=String(i+1);steps.append(li)});
 const setStep=k=>[...steps.children].forEach(li=>li.dataset.state=+li.dataset.step<k?'done':+li.dataset.step===k?'current':'todo');
 // 1 · questions
 const form=el('div',undefined,'ps-form ds-ask'),types=el('fieldset',undefined,'ds-types');types.append(el('legend','Che documento'));
 TYPES.forEach(t=>{const l=el('label',undefined,'ds-type'),r=el('input');r.type='radio';r.name='ds-type-'+n;r.value=t.id;r.checked=t.id===type;r.onchange=()=>{type=t.id;fillSources();reset()};
  const tx=el('span',undefined,'ds-type-text');tx.append(el('b',t.title),el('small',t.line),el('em',t.out));l.append(r,tx);l.dataset.type=t.id;types.append(l)});
 const src=el('fieldset',undefined,'ds-source');src.append(el('legend','Il testo'));
 const pick=el('select'),ta=el('textarea'),srcNote=el('p','','ds-hint');pick.setAttribute('aria-label','Testi salvati nel progetto');ta.rows=7;ta.setAttribute('aria-label','Testo da impaginare');
 ta.placeholder='Incolla il testo scelto nello Studio Testi (brochure, presentazione, scheda tecnica) o un tuo testo: titoli e sezioni diventano pagine.';
 const pickWrap=el('label','Dai testi salvati nel progetto',''),pasteWrap=el('label','Oppure incolla il testo','');pickWrap.append(pick);pasteWrap.append(ta);src.append(pickWrap,pasteWrap,srcNote);
 pick.onchange=()=>{const c=copies&&copies[+pick.value];if(!c)return;ta.value=c.md;if(c.kind!=='altro'&&c.kind!==typeOf(type).copy){const t=TYPES.find(x=>x.copy===c.kind);if(t&&!(t.copy==='brochure'&&typeOf(type).copy==='brochure')){type=t.id;types.querySelectorAll('input').forEach(i=>i.checked=i.value===type)}}reset()};
 ta.oninput=()=>reset();
 const brandLine=el('p','','pr-brand ds-brand'),sw=el('span',undefined,'pr-swatches');Object.entries(brand.palette).forEach(([r,h])=>{const s=el('i');s.style.background=h;s.title=r+' '+h;sw.append(s)});
 const f=brand.fonts.heading?' · font '+[...new Set([brand.fonts.heading,brand.fonts.body].filter(Boolean))].join(' e '):'';
 brandLine.append(sw,dom().createTextNode(brand.fromKit?'Colori, logo e font dal Kit identità'+(brand.direction?' «'+brand.direction+'»':'')+f+(brand.logo?'':' (senza logo: uso il nome come logotipo)')+'.':'Nessun Kit identità nel progetto: uso colori neutri e il nome come logotipo. Puoi crearlo dalla card «Kit identità».'));
 const go=button('Prepara 3 impaginazioni','primary'),cost=el('span','Nessuna chiamata AI: si impagina qui, senza costi.','muted'),bar=el('div',undefined,'ps-actions');bar.append(go,cost);
 form.append(types,src,brandLine,bar);
 const st=el('p','','tool-status');st.setAttribute('role','status');
 // 2 · three layouts
 const choose=el('section',undefined,'ds-choose'),cards=el('div',undefined,'ds-styles');choose.append(el('h3','Scegli l’impaginazione'),cards);choose.hidden=true;
 // 3 · refine
 const refine=el('section',undefined,'ds-refine');refine.hidden=true;
 const refineHead=el('div',undefined,'ds-refine-head'),count=el('p','','ds-count');count.setAttribute('aria-live','polite');refineHead.append(el('h3','Rifinisci'),count);
 const opts=el('div',undefined,'ds-opts'),editor=el('div',undefined,'ds-editor'),view=el('div',undefined,'pr-preview ds-preview'),warn=el('ul',undefined,'pr-warn'),noteList=el('ul',undefined,'pr-notes');
 refine.append(refineHead,opts,editor,el('h4','Anteprima di tutte le pagine','ds-sub'),view,warn);
 // 4 · outputs
 const out=el('section',undefined,'ds-out'),acts=el('div',undefined,'ps-actions'),ost=el('p','','tool-status');ost.setAttribute('role','status');out.hidden=true;out.append(el('h3','Scarica e salva'),acts,ost,noteList);
 wrap.append(steps,form,st,choose,refine,out);setStep(1);
 function reset(){if(model){model=null;choose.hidden=refine.hidden=out.hidden=true;setStep(1)}}
 async function loadCopies(){if(copies||!ctx.workspace||!ctx.projectId){fillSources();return}try{copies=PS.savedCopies(await ctx.workspace.bind(ctx.projectId,'agents').load())}catch(e){copies=[]}fillSources()}
 function fillSources(){const list=sourcesFor(type,copies||[]);copies=list;const want=typeOf(type).copy;
  pick.replaceChildren(new root.Option(list.length?'Scegli un testo salvato…':'Nessun testo salvato nel progetto',''),...list.slice(0,30).map((c,i)=>new root.Option(c.title+(c.kind===want?' ✓':''),String(i))));pick.disabled=!list.length;
  srcNote.textContent=list.some(c=>c.kind===want)?'I testi con ✓ sono fatti per questo documento.':'Scrivi prima il testo con la card «'+({brochure:'Brochure e company profile',presentazione:'Presentazione',scheda:'Scheda tecnica'}[want])+'» e salvalo nel progetto, oppure incollalo qui.'}
 const docNow=(s)=>render(model,brand,{style:s||style,cover,photos:{cover:photos.cover,sections:photos.sections,wanted:false},pad4});
 go.onclick=()=>{const text=ta.value.trim();if(text.length<30){st.textContent='Scegli un testo salvato o incolla il testo da impaginare (almeno qualche riga).';ta.focus();return}
  model=modelFrom(type,text,{name:pre.name||brand.name,payoff:pre.payoff,contacts});const why=emptyReason(model);if(why){st.textContent=why;model=null;return}
  if(madeType!==type){photos.cover=null;if(cover==='photo')cover='brand'}madeType=type;// a new kind of document starts without the photos of the previous one
  photos.sections=model.sections.map(()=>null);st.textContent='';showChoices();setStep(2)};
 function showChoices(){cards.replaceChildren(...proposals(model,brand,{cover,photos,pad4}).map(p=>{const c=el('article',undefined,'ds-style');c.dataset.style=p.style;c.dataset.chosen=String(p.style===style&&!refine.hidden);
  const strip=el('div',undefined,'ds-thumbs');strip.dataset.kind=model.type==='presentazione'?'slides':'pages';p.doc.pages.slice(0,3).forEach((pg,i)=>{const t=el('div',undefined,'ds-thumb');t.innerHTML=svgOf(p.doc,i);t.setAttribute('role','img');t.setAttribute('aria-label',p.title+': '+pg.label);strip.append(t)});
  const pick=button('Scegli «'+p.title+'»','primary'),meta=el('p',p.doc.pages.length+(model.type==='presentazione'?' slide':' pagine'),'ds-meta');
  pick.onclick=()=>{style=p.style;cards.querySelectorAll('.ds-style').forEach(x=>x.dataset.chosen=String(x===c));openRefine()};
  const head=el('div',undefined,'ds-style-head');head.append(el('h4',p.title),meta);c.append(strip,head,el('p',p.line,'ds-line'),pick);return c}));choose.hidden=false;choose.scrollIntoView&&choose.scrollIntoView({behavior:'smooth',block:'start'})}
 function openRefine(){refine.hidden=out.hidden=false;setStep(3);buildOpts();buildEditor();update();buildActions();refine.scrollIntoView&&refine.scrollIntoView({behavior:'smooth',block:'start'})}
 // options: style, cover, photo, multiple of 4
 function photoInput(label,get,set){const box=el('div',undefined,'ds-photo'),lab=el('label',label),inp=el('input'),info=el('span','','ds-photo-info'),del=button('Togli');inp.type='file';inp.accept='image/jpeg,image/png,image/webp';lab.append(inp);
  const show=()=>{const p=get();info.textContent=p?p.name+' · '+p.w+' × '+p.h+' px':'';del.hidden=!p};del.onclick=()=>{set(null);inp.value='';show();update()};
  inp.onchange=async()=>{const file=inp.files&&inp.files[0];if(!file)return;try{set(await readPhoto(file));show();update()}catch(e){info.textContent='Foto non letta: '+e.message}};show();box.append(lab,del,info);return box}
 function chips(name,list,cur,on){const fs=el('fieldset',undefined,'ds-chips');fs.append(el('legend',name));list.forEach(o=>{const l=el('label',undefined,'ps-chip'),r=el('input');r.type='radio';r.name='ds-'+name+'-'+n;r.value=o.id;r.checked=o.id===cur;r.onchange=()=>on(o.id);l.append(r,dom().createTextNode(o.title));fs.append(l)});return fs}
 function buildOpts(){opts.replaceChildren();opts.append(chips('Impaginazione',STYLES,style,v=>{style=v;update()}));
  if(model.type==='profile'||model.type==='brochure'){opts.append(chips('Copertina',COVERS,cover,v=>{cover=v;update()}),photoInput('Foto di copertina (facoltativa)',()=>photos.cover,p=>{photos.cover=p;if(p&&cover!=='photo'){cover='photo';buildOpts()}}));
   const l=el('label',undefined,'ps-chip ds-pad'),c=el('input');c.type='checkbox';c.checked=pad4;c.onchange=()=>{pad4=c.checked;update()};l.append(c,dom().createTextNode(' Arriva a un multiplo di 4 pagine con pagine «Note» (punto metallico)'));opts.append(l)}
  else if(model.type==='presentazione')opts.append(photoInput('Foto per la slide del titolo (facoltativa)',()=>photos.cover,p=>photos.cover=p));
  else opts.append(photoInput('Foto o disegno del prodotto (facoltativo)',()=>photos.cover,p=>photos.cover=p))}
 const field=(label,value,on,rows,cls)=>{const l=el('label',label,cls||''),i=el(rows?'textarea':'input');if(rows)i.rows=rows;else i.type='text';i.value=value||'';i.oninput=()=>{on(i.value);update()};l.append(i);return l};
 const moveBtns=(list,i,after)=>{const box=el('div',undefined,'ds-row-acts'),up=button('↑'),dn=button('↓'),rm=button('Togli');up.setAttribute('aria-label','Sposta su');dn.setAttribute('aria-label','Sposta giù');rm.setAttribute('aria-label','Togli');
  up.disabled=i===0;dn.disabled=i===list.length-1;const sw=(a,b)=>{[list[a],list[b]]=[list[b],list[a]];if(list===model.sections)[photos.sections[a],photos.sections[b]]=[photos.sections[b],photos.sections[a]]};
  up.onclick=()=>{sw(i,i-1);after()};dn.onclick=()=>{sw(i,i+1);after()};rm.onclick=()=>{list.splice(i,1);if(list===model.sections)photos.sections.splice(i,1);after()};box.append(up,dn,rm);return box};
 function buildEditor(){editor.replaceChildren();const rebuild=()=>{buildEditor();update()};
  if(model.type==='profile'||model.type==='brochure'){const head=el('div',undefined,'ds-grid2');head.append(field('Titolo in copertina',model.title,v=>model.title=v),field('Sottotitolo',model.subtitle,v=>model.subtitle=v));editor.append(head);
   const list=el('ol',undefined,'ds-rows');model.sections.forEach((s,i)=>{const li=el('li',undefined,'ds-row'),top=el('div',undefined,'ds-row-top');top.append(el('span',pad2(i+1),'ds-num'),field('Titolo della sezione',s.title,v=>s.title=v,0,'ds-grow'),moveBtns(model.sections,i,rebuild));
    li.append(top,field('Testo',s.text,v=>s.text=v,5,'ds-wide'),photoInput('Foto della sezione (facoltativa)',()=>photos.sections[i],p=>photos.sections[i]=p));list.append(li)});
   const add=button('+ Aggiungi una sezione');add.onclick=()=>{model.sections.push({title:'Nuova sezione',text:''});photos.sections.push(null);rebuild()};
   editor.append(el('h4','Sezioni · una o più pagine ciascuna','ds-sub'),list,add,field('Retro · testo di chiusura',model.closing.text,v=>model.closing.text=v,3,'ds-wide'))}
  else if(model.type==='presentazione'){const list=el('ol',undefined,'ds-rows');model.slides.forEach((s,i)=>{const li=el('li',undefined,'ds-row'),top=el('div',undefined,'ds-row-top'),sel=el('select');sel.setAttribute('aria-label','Tipo di slide');
    SLIDE_LAYOUTS.forEach(l=>sel.append(new root.Option(l.title,l.id,false,l.id===s.layout)));sel.value=s.layout;sel.onchange=()=>{s.layout=sel.value;update()};
    top.append(el('span',pad2(i+1),'ds-num'),field('Titolo',s.title,v=>s.title=v,0,'ds-grow'),sel,moveBtns(model.slides,i,rebuild));
    const g=el('div',undefined,'ds-grid2');g.append(field('Punti (uno per riga)',(s.bullets||[]).join('\n'),v=>s.bullets=v.split('\n').map(clean).filter(Boolean),4),field('Note del relatore',s.note,v=>s.note=v,4));li.append(top,g);list.append(li)});
   const add=button('+ Aggiungi una slide');add.onclick=()=>{model.slides.splice(Math.max(1,model.slides.length-1),0,{layout:'content',title:'Nuova slide',bullets:[],note:''});rebuild()};
   editor.append(el('h4','Slide','ds-sub'),list,add)}
  else{const head=el('div',undefined,'ds-grid2');head.append(field('Nome del prodotto',model.product,v=>model.product=v),field('Descrizione breve',model.intro,v=>model.intro=v,3));editor.append(head);
   const list=el('ol',undefined,'ds-rows ds-specs');model.specs.forEach((r,i)=>{const li=el('li',undefined,'ds-row ds-spec'),v=field('Valore',r.value,x=>r.value=x,0,'ds-grow');v.querySelector('input').placeholder=MISSING;
    li.append(field('Voce',r.label,x=>r.label=x,0,'ds-grow'),v,moveBtns(model.specs,i,rebuild));li.dataset.missing=String(isMissing(r.value));list.append(li)});
   const add=button('+ Aggiungi una voce');add.onclick=()=>{model.specs.push({label:'Nuova voce',value:''});rebuild()};
   editor.append(el('h4','Dati della tabella · lascia vuoto ciò che non sai: stampa «'+MISSING+'»','ds-sub'),list,add)}
  if(model.checks.length){const w=el('div',undefined,'ds-checks');w.append(el('b','Da controllare (dallo Studio Testi)'));const ul=el('ul');model.checks.forEach(c=>ul.append(el('li',c)));w.append(ul);editor.append(w)}}
 let raf=0;function update(){if(raf||!model)return;const run=()=>{raf=0;const doc=last=docNow(),many=doc.pages.length,isDeck=model.type==='presentazione';
  view.dataset.kind=isDeck?'slides':'pages';view.replaceChildren(...doc.pages.map((p,i)=>{const fig=el('figure',undefined,'pr-page ds-page');const h=el('div',undefined,'pr-svg');h.innerHTML=svgOf(doc,i);fig.append(h,el('figcaption',(isDeck?'':'Pagina '+(i+1)+' · ')+p.label));return fig}));
  count.textContent=isDeck?many+' slide · 16:9':many+(many===1?' pagina':' pagine')+' A4'+(doc.toc?' · con indice':'')+(model.type==='scheda'?'':many%4?' · non multiplo di 4':' · multiplo di 4 ✓');count.dataset.ok=String(isDeck||model.type==='scheda'||many%4===0);
  const ws=doc.warnings.filter(w=>w.kind!=='pages'||!isDeck);warn.dataset.warn=String(ws.length>0);
  warn.replaceChildren(...(ws.length?ws.map(w=>{const li=el('li',w.text);li.dataset.kind=w.kind;return li}):[el('li','Tutto in ordine: testi nell’area sicura'+(isDeck?', nessuna slide troppo piena.':'.'),'pr-ok')]));
  editor.querySelectorAll('.ds-spec').forEach((li,i)=>{const r=model.specs[i];if(r)li.dataset.missing=String(isMissing(r.value))});
  noteList.replaceChildren(...notes(model).map(t=>el('li',t)))};raf=root.requestAnimationFrame?root.requestAnimationFrame(run):(run(),0)}
 function buildActions(){acts.replaceChildren();const isDeck=model.type==='presentazione';
  const b1=button(isDeck?'Scarica PowerPoint (.pptx)':'Scarica PDF','primary'),b2=button(isDeck?'PDF delle slide':'PDF per la tipografia (CMYK)'),bz=button('Scarica tutto (.zip)');acts.append(b1,b2,bz);
  const run=async(label,fn)=>{if(busy)return;busy=true;acts.querySelectorAll('button').forEach(x=>x.disabled=true);ost.textContent=label;setStep(4);try{const r=await fn();if(typeof r==='string')ost.textContent=r;else ost.replaceChildren(r)}catch(e){ost.textContent='Non riuscito: '+e.message}finally{busy=false;acts.querySelectorAll('button').forEach(x=>x.disabled=false)}};
  const pages=()=>docNow().pages.length;
  const webPdf=async()=>{const d=docNow();d.dpi=200;await PS.prepareImages(d,{pdfx:false});return pdfWeb(d)};
  const printPdf=async()=>{const d=docNow();const low=PS.imagesReport(d).filter(x=>!x.ok);if(low.length)throw Error('foto sotto i 300 dpi alla misura di stampa ('+low.map(x=>x.dpi+' dpi').join(', ')+'): usa foto più grandi per la tipografia, oppure scarica il PDF per lo schermo.');
   await PS.loadGlyphs();await PS.prepareImages(d,{pdfx:true});const bytes=pdfPrint(d),probs=PS.checkPdf(bytes);if(probs.length)throw Error(probs.join(' '));return bytes};
  const pptx=async()=>{const d=docNow(),media=await deckMedia(d.deck,brand),bytes=pptxDeck(d.deck,brand,media,{author:brand.name}),chk=PX.inspect(bytes);if(chk.problems.length)throw Error('file PowerPoint non valido: '+chk.problems[0]);return bytes};
  const base=baseName(model);
  b1.onclick=()=>run(isDeck?'Preparo il PowerPoint…':'Preparo il PDF…',async()=>{if(isDeck){const name=download(base+'.pptx',await pptx(),'application/vnd.openxmlformats-officedocument.presentationml.presentation');return 'Scaricato: '+name+' · '+pages()+' slide 16:9 modificabili, con le note del relatore.'}
   const name=download(base+'.pdf',await webPdf(),'application/pdf');const k=pages();return 'Scaricato: '+name+' · '+k+(k===1?' pagina':' pagine')+' A4 per lo schermo (RGB).'});
  b2.onclick=()=>run(isDeck?'Preparo il PDF delle slide…':'Preparo il PDF per la tipografia: colori in CMYK e testi in tracciati…',async()=>{if(isDeck){const name=download(base+'-slide.pdf',await webPdf(),'application/pdf');return 'Scaricato: '+name+'.'}
   const name=download(base+'-tipografia.pdf',await printPdf(),'application/pdf');return 'Scaricato: '+name+' · CMYK, 3 mm di abbondanza e segni di taglio, testi in tracciati. La tipografia fa comunque il suo preflight.'});
  bz.onclick=()=>run('Preparo lo zip…',async()=>{const parts={};const skipped=[];
   if(isDeck){parts.pptx=await pptx();parts.pdf=await webPdf()}else{parts.pdf=await webPdf();try{parts.print=await printPdf()}catch(e){skipped.push('PDF per la tipografia ('+e.message+')')}}
   const files=bundle(model,parts,{style,pages:pages()}),name=download(base+'.zip',ZIP.zip(files),'application/zip');return 'Scaricato: '+name+' · '+files.map(f=>f.name).join(', ')+'.'+(skipped.length?' Non incluso: '+skipped.join('; '):'')});
  if(ctx.workspace&&ctx.projectId){const sv=button('Salva nel progetto');acts.append(sv);
   sv.onclick=()=>run('Salvo nel progetto…',async()=>{await saveToProject(ctx.workspace,ctx.projectId,model,{by:ctx.by,style,cover,pages:pages()});sv.textContent='Salvato ✓';
    const msg=dom().createDocumentFragment();msg.append('Salvato nel progetto: testo, impaginazione e numero di pagine sono tra i documenti dell’Art Director (i file li scarichi da qui). ');
    if(ctx.agentsUrl){const a=el('a','Apri in Agenti AI →');a.href=ctx.agentsUrl;msg.append(a)}return msg})}}
 loadCopies();return wrap}

return Object.freeze({AGENT,A4,SLIDE,MISSING,TOC_FROM,TYPES,STYLES,COVERS,SLIDE_LAYOUTS,parseSource,plainSections,parseSlides,specRow,isMissing,modelFrom,emptyReason,blocks,
 layoutDoc,layoutSheet,deckFrom,slideDoc,fitText,themeFor,pptxDeck,render,proposals,pdfWeb,pdfPrint,baseName,toMarkdown,notes,bundle,savedEntry,saveToProject,sourcesFor,docStudio});
});
