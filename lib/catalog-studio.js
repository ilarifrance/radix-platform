/* Studio Catalogo: a product catalogue from an Excel (.xlsx) or CSV sheet, as PDF. No AI.
   The sheet is read by the CRM import reader (sales/crm-csv-core.js readFile / fromRows, lib/lead-xlsx-parser.js readRows,
   here with formulas taken as the values Excel saved). The columns are matched to codice, nome, descrizione, prezzo,
   categoria, immagine and note (Italian and English headers, editable). Options: 2, 4 or 6 products per A4 portrait page,
   grouped by category (every category starts on a new page, its name on top of each of its pages), sorted as in the sheet,
   by name or by code, cover (title, logo and payoff of the brand kit), back page with the contacts, page numbers, prices on
   or off with the «Prezzi IVA esclusa» note. Up to 500 products; long names and descriptions are cut with «…» and listed.
   Photos: files picked together with the sheet (matched by file name) or same-origin URLs; other sites' images cannot be
   read by the browser (CORS), so they get a placeholder and are listed. Each photo goes in the PDF as a JPEG at its placed
   size, at most 300 dpi. Layout, preview and PDF (print: bleed, slug and marks; web: trim) come from lib/print-studio.js.
   Pure part (mapping, prices, grouping, pagination, layout) runs in Node for the tests; catalogStudio() is the widget. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixCatalogStudio=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const PS=root.RadixPrintStudio||(typeof require==='function'?require('./print-studio.js'):null);
const MAX_PRODUCTS=500,PER_PAGE=[2,4,6],PAGE={w:210,h:297},MARGIN=14,PREVIEW_PAGES=4,NO_CATEGORY='Altri prodotti';
const clean=s=>String(s==null?'':s).replace(/[ \t ]+/g,' ').trim();
const block=s=>String(s==null?'':s).replace(/\r/g,'').split('\n').map(clean).join('\n').replace(/\n{2,}/g,'\n').trim();

// ---- columns ----
const FIELDS=[
 {id:'code',label:'Codice',aliases:['codice','cod','codart','codicearticolo','articolo','sku','code','itemcode','productcode','ref','riferimento','id']},
 {id:'name',label:'Nome',aliases:['nome','nomeprodotto','prodotto','denominazione','titolo','name','product','productname','title','item']},
 {id:'description',label:'Descrizione',aliases:['descrizione','descrizionebreve','dettagli','caratteristiche','description','desc','details','shortdescription']},
 {id:'price',label:'Prezzo',aliases:['prezzo','prezzolistino','listino','prezzounitario','importo','costo','euro','price','unitprice','listprice','cost']},
 {id:'category',label:'Categoria',aliases:['categoria','famiglia','gruppo','linea','reparto','collezione','category','group','family','collection','type','tipo']},
 {id:'image',label:'Immagine (URL o nome file)',aliases:['immagine','foto','fotografia','img','immagineurl','urlimmagine','fileimmagine','image','picture','photo','imageurl','imagefile']},
 {id:'note',label:'Note',aliases:['note','nota','info','annotazioni','notes','remarks']}
];
const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
// Headers → {field: header}: exact alias first, then a header that contains an alias; each header used once.
function detectMapping(headers){const hs=(headers||[]).map(h=>String(h||'')),used=new Set(),out={};
 for(const f of FIELDS){const i=hs.findIndex(h=>!used.has(h)&&h&&f.aliases.includes(norm(h)));if(i>=0){out[f.id]=hs[i];used.add(hs[i])}}
 for(const f of FIELDS){if(out[f.id])continue;const i=hs.findIndex(h=>!used.has(h)&&h&&f.aliases.some(a=>a.length>3&&norm(h).includes(a)));out[f.id]=i>=0?hs[i]:'';if(i>=0)used.add(hs[i])}
 return out}

// ---- prices (it-IT: 1.234,50 €) ----
// «€ 1.234,50», «1234.5», «1,234.50», «12» → number; text such as «su richiesta» → null.
function parsePrice(v){if(typeof v==='number')return isFinite(v)?v:null;let s=clean(v).replace(/€|eur(o)?/gi,'').replace(/\s/g,'');if(!/^-?[\d.,]+$/.test(s)||!/\d/.test(s))return null;
 const d=s.lastIndexOf(','),p=s.lastIndexOf('.');
 if(d>=0&&p>=0)s=d>p?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');
 else if(d>=0)s=(s.match(/,/g).length>1?s.replace(/,/g,''):s.replace(',','.'));
 else if(p>=0&&(s.match(/\./g).length>1||/^-?\d{1,3}\.\d{3}$/.test(s)&&!/^-?0\./.test(s)))s=s.replace(/\./g,'');
 const n=Number(s);return isFinite(n)?n:null}
function formatPrice(n){if(n==null||!isFinite(n))return '';const neg=n<0,[i,dec]=Math.abs(n).toFixed(2).split('.');return (neg?'-':'')+i.replace(/\B(?=(\d{3})+(?!\d))/g,'.')+','+dec+' €'}
const priceText=p=>p.priceValue!=null?formatPrice(p.priceValue):clean(p.price);

// ---- products ----
// rows: [{header: value}] (crm-csv-core shape). Rows with neither name nor code are skipped; over MAX_PRODUCTS are cut.
function toProducts(rows,mapping,{limit=MAX_PRODUCTS}={}){const m=mapping||{},get=(r,k)=>m[k]?clean(r[m[k]]):'',out=[];let skipped=0;
 (rows||[]).forEach((r,i)=>{const p={row:i+2,code:get(r,'code'),name:get(r,'name'),description:m.description?block(r[m.description]):'',price:get(r,'price'),category:get(r,'category'),image:get(r,'image'),note:get(r,'note')};
  if(!p.name&&!p.code){skipped++;return}p.priceValue=parsePrice(p.price);out.push(p)});
 return {products:out.slice(0,limit),skipped,cut:Math.max(0,out.length-limit),total:out.length}}
const cmp=(a,b)=>String(a).localeCompare(String(b),'it',{numeric:true,sensitivity:'base'});
// → [{category, products}]: categories in order of first appearance (no category last), products sorted inside.
function groupProducts(products,{group=true,sort='sheet'}={}){const list=(products||[]).slice();
 if(sort==='name')list.sort((a,b)=>cmp(a.name||a.code,b.name||b.code));else if(sort==='code')list.sort((a,b)=>cmp(a.code||'￿',b.code||'￿')||cmp(a.name,b.name));
 if(!group)return [{category:'',products:list}];const map=new Map();
 for(const p of list){const c=p.category||NO_CATEGORY;if(!map.has(c))map.set(c,[]);map.get(c).push(p)}
 const order=[...new Set((products||[]).map(p=>p.category||NO_CATEGORY))].filter(c=>c!==NO_CATEGORY);if(map.has(NO_CATEGORY))order.push(NO_CATEGORY);
 return order.map(c=>({category:c,products:map.get(c)}))}
// Every section starts on a new page: ceil(n / perPage) pages each. → [{category, products, first, part, parts}]
function paginate(sections,perPage){const n=PER_PAGE.includes(+perPage)?+perPage:4,out=[];
 for(const s of sections||[]){const parts=Math.max(1,Math.ceil(s.products.length/n));for(let i=0;i<parts;i++)out.push({category:s.category,products:s.products.slice(i*n,i*n+n),first:i===0,part:i+1,parts})}
 return out}
const grid=n=>n===2?{cols:1,rows:2}:n===6?{cols:2,rows:3}:{cols:2,rows:2};
// The page count of a catalogue: cover + product pages + back.
const pageCount=(products,o={})=>(o.cover!==false?1:0)+paginate(groupProducts(products,o),o.perPage||4).length+(o.back!==false?1:0);

// ---- images ----
// «https://…» same origin or «/…» → url; another site → external (not readable: CORS); a bare name → a picked file.
function imageSource(v,origin){const s=clean(v);if(!s)return {kind:'none',key:''};
 if(/^data:image\//i.test(s))return {kind:'url',key:s};
 if(/^https?:\/\//i.test(s)){let o='';try{o=new URL(s).origin}catch(e){return {kind:'external',key:s}}return o===origin?{kind:'url',key:s}:{kind:'external',key:s}}
 if(s.startsWith('/'))return {kind:'url',key:s};
 return {kind:'file',key:s.split(/[\\/]/).pop().toLowerCase()}}

// ---- layout ----
// opts: {title, payoff, perPage, group, sort, cover, back, prices, vatNote, pageNumbers, contacts:{phone,email,website,address}, origin}
// images: Map key → {w, h, src} of the photos that could be read. Returns the print-studio doc.
function layout(products,opts={},brand,images){const o={perPage:4,group:true,sort:'sheet',cover:true,back:true,prices:true,vatNote:true,pageNumbers:true,...opts},img=images||new Map();
 const br=brand||PS.brandOf({},o.name),pal=br.palette,m=MARGIN,W=PAGE.w,H=PAGE.h,B=PS.BLEED,name=clean(o.name||br.name),title=clean(o.title)||'Catalogo prodotti';
 const values={name,payoff:clean(o.payoff)},f={id:'catalogo',w:W,h:H},b=PS.builder(f,br,values,m),pages=[],cut={name:[],description:[]},missing={external:[],file:[],url:[]};
 const page=label=>{const items=[];b.items=items;pages.push({label,w:W,h:H,items,folds:[]});return items};
 const head=PS.ink(pal.light,pal,pal.primary,pal.dark),txt=PS.ink('#FFFFFF',pal,pal.dark),muted=PS.ink('#FFFFFF',pal,pal.secondary,pal.dark);
 const contacts=['address','phone','email','website'].map(k=>clean((o.contacts||{})[k])).filter(Boolean);
 if(o.cover){page('Copertina');b.rect(-B,-B,W+2*B,H+2*B,pal.light);b.rect(-B,H-62,W+2*B,62+B,pal.primary);b.rect(-B,H-65,W+2*B,3,pal.accent);
  b.logo(m+10,62,W-2*m-20,56);let y=b.para(m,140,W-2*m,title,{size:30,lead:1.1,bold:true,fill:head,align:'center',label:'Titolo',maxY:200,after:5});
  if(values.payoff)b.para(m,y,W-2*m,values.payoff,{size:14,lead:1.3,fill:PS.ink(pal.light,pal,pal.dark),align:'center',label:'Payoff',maxY:H-75});
  const t=PS.ink(pal.primary,pal,pal.light,pal.dark);if(clean((o.contacts||{}).website))b.text(m,H-m-PS.ptToMm(12*.2)-10,W-2*m,o.contacts.website,{size:12,bold:true,align:'center',fill:t,label:'Sito web'})}
 const g=grid(PER_PAGE.includes(+o.perPage)?+o.perPage:4),top=m+16,bottom=H-m-10,gap=8,cw=(W-2*m-gap*(g.cols-1))/g.cols,ch=(bottom-top-gap*(g.rows-1))/g.rows;
 const big=g.cols===1,nameSize=big?14:11,descSize=big?10:8.5,priceSize=big?14:12;
 for(const sp of paginate(groupProducts(products,o),+o.perPage||4)){page(sp.category||title);const n=pages.length;
  b.rect(-B,-B,W+2*B,B+3,pal.primary);
  b.text(m,m+PS.ptToMm(16*.718)+2,W-2*m-30,(sp.category||title)+(sp.first?'':' · segue'),{size:sp.first?16:12,bold:true,fill:head,label:'Categoria'});
  b.line(m,m+11,W-m,m+11,pal.accent,.8);
  const fy=H-m-PS.ptToMm(7*.207);b.line(m,H-m-6,W-m,H-m-6,'#CCCCCC',.4);b.text(m,fy,70,name,{size:7.5,bold:true,fill:muted,label:'Piè di pagina'});
  if(o.prices&&o.vatNote)b.text(m+70,fy,W-2*m-100,'Prezzi IVA esclusa',{size:7.5,align:'center',fill:muted,label:'Nota prezzi'});
  if(o.pageNumbers)b.text(W-m-30,fy,30,String(n),{size:8,align:'right',fill:muted,label:'Numero di pagina'});
  sp.products.forEach((p,i)=>{const cx=m+(i%g.cols)*(cw+gap),cy=top+Math.floor(i/g.cols)*(ch+gap),ih=ch*(big?.52:.46),label=p.code||p.name;
   const src=imageSource(p.image,o.origin),info=src.key&&img.get(src.key);
   if(info&&info.w>0&&info.h>0){const s=Math.min(cw/info.w,ih/info.h),w=info.w*s,h=info.h*s;b.items.push({t:'image',x:cx+(cw-w)/2,y:cy+(ih-h)/2,w,h,src:info.src,key:src.key,label:'Foto '+label})}
   else{b.rect(cx,cy,cw,ih,'#EDEDED');b.text(cx,cy+ih/2+1,cw,src.kind==='none'?'Senza foto':'Foto non disponibile',{size:8,align:'center',fill:'#6B6B6B',label:'Foto'});
    if(src.kind!=='none'&&!missing[src.kind].includes(src.key))missing[src.kind].push(src.key)}
   const priceH=o.prices&&priceText(p)?PS.ptToMm(priceSize*1.25)+1:0,noteH=p.note?PS.ptToMm(8*1.3)+1:0,end=cy+ch;
   const before=b.warnings.length;let y=b.para(cx,cy+ih+3,cw,p.name||p.code,{size:nameSize,lead:1.15,bold:true,fill:txt,label:'Nome',maxY:Math.min(end-priceH-noteH,cy+ih+3+PS.ptToMm(nameSize*1.15)*2+.5),after:1});
   if(b.warnings.length>before){cut.name.push(label);b.warnings.length=before}
   if(p.code&&p.name)y=b.para(cx,y,cw,'Cod. '+p.code,{size:7.5,fill:muted,label:'Codice',maxY:end-priceH-noteH,after:1.5});
   if(p.description){const w0=b.warnings.length;y=b.para(cx,y,cw,p.description,{size:descSize,lead:1.3,fill:txt,label:'Descrizione',maxY:end-priceH-noteH-1,after:1});if(b.warnings.length>w0){cut.description.push(label);b.warnings.length=w0}}
   if(p.note){const w0=b.warnings.length;b.text(cx,end-priceH-PS.ptToMm(8*.207)-1,cw,p.note,{size:8,fill:muted,label:'Note'});b.warnings.length=w0}
   if(priceH)b.text(cx,end-PS.ptToMm(priceSize*.207),cw,priceText(p),{size:priceSize,bold:true,align:'right',fill:head,label:'Prezzo'})})}
 if(o.back){page('Retro');b.rect(-B,-B,W+2*B,H+2*B,pal.light);b.rect(-B,H-40,W+2*B,40+B,pal.primary);b.logo(m+20,50,W-2*m-40,40);
  let y=b.para(m,112,W-2*m,'Contatti',{size:18,bold:true,fill:head,align:'center',label:'Contatti',after:4});
  for(const c of contacts)y=b.para(m,y,W-2*m,c,{size:12,lead:1.35,fill:PS.ink(pal.light,pal,pal.dark),align:'center',label:'Contatti',after:1.5});
  if(o.prices){const notes=[o.vatNote?'Prezzi IVA esclusa.':'',o.date?'Listino aggiornato al '+o.date+'.':''].filter(Boolean).join(' ');if(notes)b.para(m,y+6,W-2*m,notes,{size:9,fill:PS.ink(pal.light,pal,pal.secondary,pal.dark),align:'center',label:'Nota prezzi'})}}
 const doc={format:'catalogo',title:title+(name?' · '+name:''),margin:m,brand:br,values,pages,warnings:b.warnings,cut,missing};
 if(cut.name.length)doc.warnings.push({kind:'cut',text:'Nome accorciato con «…» per '+cut.name.length+' prodott'+(cut.name.length>1?'i':'o')+': '+list(cut.name)+'.'});
 if(cut.description.length)doc.warnings.push({kind:'cut',text:'Descrizione accorciata con «…» per '+cut.description.length+' prodott'+(cut.description.length>1?'i':'o')+': '+list(cut.description)+'. Accorciala nel foglio o scegli meno prodotti per pagina.'});
 if(missing.external.length)doc.warnings.push({kind:'image',text:'Foto su altri siti: il browser non può leggerle (CORS), al loro posto c’è un riquadro. Scaricale e sceglile insieme al foglio: '+list(missing.external)+'.'});
 if(missing.file.length)doc.warnings.push({kind:'image',text:'Foto non trovate tra i file scelti: '+list(missing.file)+'.'});
 if(missing.url.length)doc.warnings.push({kind:'image',text:'Foto non lette da questo sito: '+list(missing.url)+'.'});
 doc.warnings=doc.warnings.concat(PS.safeArea(doc),PS.glyphs(doc));return doc}
const list=xs=>xs.slice(0,8).join(', ')+(xs.length>8?' e altri '+(xs.length-8):'');
const slug=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50);
const filename=(doc,mode)=>'catalogo-'+(slug(doc.values.name)||'prodotti')+'-'+(mode==='web'?'web':'tipografia')+'.pdf';
// Saddle stitching needs a multiple of 4 pages: said, not forced.
function notes(doc){const n=doc.pages.length,out=PS.notes(doc).filter(x=>!/^Nessun logo/.test(x));
 if(n%4)out.push('Il catalogo ha '+n+' pagine: per la rilegatura a punto metallico la tipografia chiede un multiplo di 4 ('+(n+4-n%4)+'). Chiedi se aggiungere pagine bianche.');return out}

// ---- reading the sheet (browser; the readers of the CRM import) ----
async function readSheet(file){const csv=root.RadixCrmCsv;if(!csv)throw Error('Lettore dei fogli non disponibile: ricarica la pagina.');
 if(/\.xlsx$/i.test(file.name)){if(file.size>3e6)throw Error('File troppo grande: massimo 3 MB per Excel.');const X=root.RadixLeadXlsx;if(!X||!X.readRows)throw Error('Lettore Excel non disponibile: ricarica la pagina.');
  try{return csv.fromRows(await X.readRows(await file.arrayBuffer(),{maxRows:csv.MAX_ROWS,formulas:true}))}catch(e){throw Error(/massimo \d+/.test(e.message)?'Il foglio ha più di '+csv.MAX_ROWS+' righe: dividilo in più file.':e.message)}}
 return csv.readFile(file)}
const isSheet=f=>/\.(xlsx|csv|xls)$/i.test(f.name);
async function loadImage(url){const i=new root.Image();i.decoding='async';i.src=url;await i.decode();return i}

// ---- browser widget ----
let counter=0;
const dom=()=>root.document;
const el=(tag,text,cls)=>{const n=dom().createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
const button=(text,cls)=>{const b=el('button',text,cls||'');b.type='button';return b};
// ctx: {profile (raw project profile, with identityKit), project (profileFor summary), projectName}
function catalogStudio(ctx={}){const n=++counter,brand=PS.brandOf(ctx.profile,ctx.projectName),pre=PS.prefill(ctx.profile,{projectName:ctx.projectName,summary:ctx.project});
 const opts={title:'Catalogo prodotti '+new Date().getFullYear(),payoff:pre.payoff,name:pre.name,perPage:4,group:true,sort:'sheet',cover:true,back:true,prices:true,vatNote:true,pageNumbers:true,
  contacts:{address:pre.address,phone:pre.phone,email:pre.email,website:pre.website},origin:root.location&&root.location.origin,date:new Date().toLocaleDateString('it-IT')};
 let sheet=null,mapping={},files=new Map(),images=new Map(),guides=true,last=null,info=null;
 const wrap=el('div',undefined,'tool photo-studio print-studio catalog-studio'),steps=el('ol',undefined,'ps-steps');['Il foglio','Colonne e opzioni','Anteprima e PDF'].forEach((t,i)=>{const li=el('li',(i+1)+' · '+t);li.dataset.step=String(i+1);steps.append(li)});
 const setStep=k=>[...steps.children].forEach(li=>li.dataset.state=+li.dataset.step<k?'done':+li.dataset.step===k?'current':'todo');
 const pick=el('label',undefined,'ct-pick'),inp=el('input');inp.type='file';inp.multiple=true;inp.accept='.xlsx,.csv,image/jpeg,image/png,image/webp';
 pick.append(el('b','Scegli il foglio prodotti (Excel .xlsx o CSV) e, se vuoi, le foto insieme'),inp,el('small','Una riga per prodotto; colonne come Codice, Nome, Descrizione, Prezzo, Categoria, Immagine, Note. Le foto sono abbinate per nome file (es. «pane.jpg» nella colonna Immagine). Fino a '+MAX_PRODUCTS+' prodotti.','muted'));
 const more=el('label',undefined,'ct-more'),inp2=el('input');inp2.type='file';inp2.multiple=true;inp2.accept='image/jpeg,image/png,image/webp';more.append(el('span','Aggiungi altre foto'),inp2);more.hidden=true;
 const sheetInfo=el('p','','tool-status'),mapBox=el('div',undefined,'ct-map'),optBox=el('div',undefined,'ct-opts'),count=el('p','','ct-count');sheetInfo.setAttribute('role','status');
 const brandLine=el('p',brand.fromKit?'Copertina con il logo e i colori del Kit identità'+(brand.direction?' «'+brand.direction+'»':'')+'.':'Nessun Kit identità nel progetto: colori neutri e il nome come logotipo.','pr-brand');
 const view=el('div',undefined,'pr-preview'),gl=el('label',undefined,'ps-chip'),gc=el('input');gc.type='checkbox';gc.checked=true;gc.onchange=()=>{guides=gc.checked;update()};gl.append(gc,dom().createTextNode(' Mostra abbondanza e area sicura'));
 const warn=el('ul',undefined,'pr-warn'),note=el('ul',undefined,'pr-notes'),st=el('p','','tool-status');st.setAttribute('role','status');
 const dp=button('Scarica PDF per la tipografia','primary'),dw=button('Scarica PDF per il web'),acts=el('div',undefined,'ps-actions');acts.append(dp,dw);
 const after=[mapBox,optBox,brandLine,count,gl,view,warn,acts,st,note];after.forEach(x=>x.hidden=true);
 wrap.append(steps,pick,more,sheetInfo,...after);setStep(1);
 async function addImages(list){for(const f of list){const k=f.name.toLowerCase();if(files.has(k))continue;files.set(k,f)}}
 inp.onchange=async()=>{const all=[...inp.files],sh=all.filter(isSheet);await addImages(all.filter(f=>/^image\//.test(f.type)));
  if(!sh.length){if(sheet){await loadImages();update()}else sheetInfo.textContent='Manca il foglio: scegli un file .xlsx o .csv (puoi selezionarlo insieme alle foto).';return}
  sheetInfo.textContent='Leggo '+sh[0].name+'…';
  try{sheet=await readSheet(sh[0]);if(!sheet.rows.length)throw Error('il foglio non ha righe di prodotti');mapping=detectMapping(sheet.headers);
   sheetInfo.textContent=sh[0].name+': '+sheet.rows.length+' righe, '+sheet.headers.filter(Boolean).length+' colonne'+(files.size?' · '+files.size+' foto scelte':'')+'.';
   after.forEach(x=>x.hidden=false);more.hidden=false;setStep(2);renderMap();renderOpts();await loadImages();update()}
  catch(e){sheet=null;after.forEach(x=>x.hidden=true);sheetInfo.textContent='Foglio non letto: '+e.message}};
 inp2.onchange=async()=>{await addImages([...inp2.files]);await loadImages();update()};
 function renderMap(){mapBox.replaceChildren(el('h4','Colonne del foglio'));const g=el('div',undefined,'ct-map-grid');
  for(const f of FIELDS){const l=el('label',f.label),s=el('select');s.append(new root.Option('— nessuna —',''),...sheet.headers.filter(Boolean).map(h=>new root.Option(h,h)));s.value=mapping[f.id]||'';
   s.onchange=async()=>{mapping[f.id]=s.value;if(f.id==='image')await loadImages();update()};l.append(s);g.append(l)}
  mapBox.append(g);if(!mapping.name&&!mapping.code)mapBox.append(el('p','Scegli almeno la colonna del nome o del codice.','ct-need'))}
 function renderOpts(){optBox.replaceChildren(el('h4','Il catalogo'));const g=el('div',undefined,'ct-opt-grid');
  const txt=(label,get,set)=>{const l=el('label',label),i=el('input');i.type='text';i.value=get()||'';i.maxLength=120;i.oninput=()=>{set(i.value);update()};l.append(i);g.append(l)};
  txt('Titolo in copertina',()=>opts.title,v=>opts.title=v);txt('Payoff',()=>opts.payoff,v=>opts.payoff=v);txt('Nome nel piè di pagina',()=>opts.name,v=>opts.name=v);
  for(const k of ['address','phone','email','website'])txt({address:'Indirizzo',phone:'Telefono',email:'Email',website:'Sito web'}[k],()=>opts.contacts[k],v=>opts.contacts[k]=v);
  const per=el('fieldset',undefined,'ct-per');per.append(el('legend','Prodotti per pagina (A4 verticale)'));PER_PAGE.forEach(v=>{const l=el('label',undefined,'ps-chip'),r=el('input');r.type='radio';r.name='ct-per-'+n;r.value=String(v);r.checked=v===opts.perPage;r.onchange=()=>{opts.perPage=v;update()};l.append(r,dom().createTextNode(' '+v));per.append(l)});
  const sl=el('label','Ordine'),so=el('select');[['sheet','Come nel foglio'],['name','Per nome'],['code','Per codice']].forEach(([v,t])=>so.append(new root.Option(t,v)));so.value=opts.sort;so.onchange=()=>{opts.sort=so.value;update()};sl.append(so);
  const checks=el('div',undefined,'ct-checks'),chk=(k,t)=>{const l=el('label',undefined,'ps-chip'),c=el('input');c.type='checkbox';c.checked=!!opts[k];c.onchange=()=>{opts[k]=c.checked;update()};l.append(c,dom().createTextNode(' '+t));checks.append(l)};
  chk('group','Raggruppa per categoria (ogni categoria da una nuova pagina)');chk('cover','Copertina');chk('back','Retro con i contatti');chk('pageNumbers','Numeri di pagina');chk('prices','Prezzi');chk('vatNote','Nota «Prezzi IVA esclusa»');
  optBox.append(g,per,sl,checks)}
 // Photos: picked files and same-origin URLs, read once; external URLs are not fetched.
 async function loadImages(){if(!sheet||!mapping.image)return;const srcs=new Map();
  for(const r of sheet.rows){const s=imageSource(r[mapping.image],opts.origin);if(s.kind==='file'||s.kind==='url')srcs.set(s.key,s.kind)}
  for(const [k,kind] of srcs){if(images.has(k))continue;const file=kind==='file'&&files.get(k),url=file?root.URL.createObjectURL(file):kind==='url'?k:'';if(!url)continue;
   try{const i=await loadImage(url);images.set(k,{w:i.naturalWidth,h:i.naturalHeight,src:url,img:i})}catch(e){}}}
 const optsNow=()=>({...opts});
 let raf=0;function update(){if(raf||!sheet)return;const run=()=>{raf=0;info=toProducts(sheet.rows,mapping);const doc=last=layout(info.products,optsNow(),brand,images);setStep(3);
  count.textContent=info.products.length+' prodotti · '+doc.pages.length+' pagine A4'+(info.skipped?' · '+info.skipped+' righe senza nome né codice saltate':'')+(info.cut?' · '+info.cut+' prodotti oltre il limite di '+MAX_PRODUCTS+' esclusi: dividi il catalogo in più file':'')+'.';
  const shown=doc.pages.slice(0,PREVIEW_PAGES);view.replaceChildren(...shown.map((p,i)=>{const fig=el('figure',undefined,'pr-page');fig.dataset.format='catalogo';const h=el('div',undefined,'pr-svg');h.innerHTML=PS.previewSvg(doc,i,{guides});fig.append(h,el('figcaption',(i+1)+' · '+p.label));return fig}));
  if(doc.pages.length>PREVIEW_PAGES)view.append(el('p','Anteprima delle prime '+PREVIEW_PAGES+' pagine su '+doc.pages.length+': il PDF le contiene tutte.','muted ct-more-pages'));
  warn.replaceChildren(...(doc.warnings.length?doc.warnings.map(w=>{const li=el('li',w.text);li.dataset.kind=w.kind;return li}):[el('li','Nessun testo accorciato, tutte le foto lette, testi nell’area sicura.','pr-ok')]));warn.dataset.warn=String(doc.warnings.length>0);
  note.replaceChildren(...notes(doc).map(t=>el('li',t)));dp.disabled=dw.disabled=!info.products.length};raf=root.requestAnimationFrame?root.requestAnimationFrame(run):(run(),0)}
 // Photos at their placed size, at most 300 dpi, JPEG on white.
 async function rasterPhotos(doc){const cache=new Map();for(const p of doc.pages)for(const it of p.items){if(it.t!=='image')continue;const im=images.get(it.key);if(!im)continue;
  const w=Math.max(1,Math.min(im.w,Math.round(it.w/25.4*PS.DPI))),h=Math.max(1,Math.min(im.h,Math.round(it.h/25.4*PS.DPI))),ck=it.key+'|'+w+'x'+h;
  if(!cache.has(ck)){const c=dom().createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle='#FFFFFF';x.fillRect(0,0,w,h);x.imageSmoothingQuality='high';x.drawImage(im.img,0,0,w,h);
   const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.88));cache.set(ck,{w,h,jpeg:new Uint8Array(await blob.arrayBuffer())})}it.raster=cache.get(ck)}}
 const go=async mode=>{if(!sheet)return;dp.disabled=dw.disabled=true;st.textContent='Preparo il PDF…';
  try{const doc=layout(toProducts(sheet.rows,mapping).products,optsNow(),brand,images);await PS.rasterize(doc);await rasterPhotos(doc);
   const bytes=PS.pdf(doc,{mode}),name=PS.download(filename(doc,mode),bytes,'application/pdf');
   st.textContent='Scaricato: '+name+' · '+doc.pages.length+' pagine'+(mode==='web'?' A4.':' A4 con '+PS.BLEED+' mm di abbondanza e segni di taglio nel margine esterno.')+' '+Math.round(bytes.length/1024)+' KB.'}
  catch(e){st.textContent='PDF non creato: '+e.message}finally{dp.disabled=dw.disabled=false}};
 dp.onclick=()=>go('print');dw.onclick=()=>go('web');
 return wrap}

return Object.freeze({FIELDS,MAX_PRODUCTS,PER_PAGE,PAGE,MARGIN,NO_CATEGORY,detectMapping,parsePrice,formatPrice,toProducts,groupProducts,paginate,grid,pageCount,imageSource,layout,filename,notes,readSheet,catalogStudio});
});
