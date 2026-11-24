/* Studio Negozio online («Prepara il negozio online»): the client's product list turned into files ready to import in
   Shopify and WooCommerce. No store API, no account, no purchase: RADIX prepares the files, the person imports them.
   1) The platform (Shopify, WooCommerce or both) and the shop basics: name, currency (EUR), prices with VAT included
      or not, a shipping note, products published or left as drafts, the unit of bare weights.
   2) The products: a sheet (.xlsx or CSV, read by the CRM import readers through lib/product-studio.js readSheet, as
      lib/catalog-studio.js does), the sheet saved in the project by the Studio Schede prodotto (key productSheets) or
      the built-in example (DATI DI ESEMPIO). Columns matched by header (Italian and English), every match editable.
      Rows with the same «codice modello» (or, without it, the same name) become one product with its variants
      (option 1 Taglia, option 2 Colore).
   3) Three fixed presentations, deterministic and without AI: Essenziale, Descrittivo, Vetrina. They differ in the title
      pattern, the description template and how tags and collections are derived; every word comes from the sheet
      (or the shipping note typed in step 1).
   4) Each product can be refined: title, handle, description, tags, images, SEO title (≤70), meta description (≤160),
      alt text, option names and per variant SKU, price, compare-at price, stock and weight. Checks: missing price,
      duplicate SKU or handle, over-long SEO fields, variants without SKU or without option values, image links not
      https, and data in the texts that are not in the sheet (lib/product-studio.js groundingFlags).
   5) The files: the Shopify product CSV (classic importer headers, one row per variant, extra image rows), the
      WooCommerce product CSV (built-in importer: simple, variable and variation rows), the SEO and alt texts, the
      checks and LEGGIMI.txt with the import steps and the checklist before opening (payments, shipping, EU legal
      pages), in one zip (lib/zip-lite.js); save in the project (the «agents» document, key shop, every other key kept).
   Optional: ONE AI call to improve the descriptions, behind RadixConfirm, grounded on the sheet; a proposal with data
   that are not in the sheet (numbers, materials, claims) is dropped. Pure part runs in Node for the tests; shopStudio()
   is the browser widget. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixShopStudio=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
// The styled RADIX confirmation (lib/radix-confirm.js) before the paid step; root.confirm only if it is missing.
const askConfirm=o=>{const C=root.RadixConfirm||(typeof require==='function'?require('./radix-confirm.js'):null);return C?C.ask(o):Promise.resolve(!!root.confirm([o.title,o.cost,o.message].filter(Boolean).join('\n')))};
function lib(name,file){if(root[name])return root[name];try{return typeof require==='function'?require(file):null}catch(e){return null}}
const prodLib=()=>lib('RadixProductStudio','./product-studio.js'),csvLib=()=>lib('RadixCrmCsv','../sales/crm-csv-core.js'),zipLib=()=>lib('RadixZip','./zip-lite.js');
const AGENT='web-content',MAX_ROWS=1000,MAX_SAVED=3,SAVE_BUDGET=450000,AI_MAX=40;
const LIMITS=Object.freeze({title:255,seoTitle:70,seoDescription:160,alt:125,handle:100,short:400});
const clean=s=>String(s==null?'':s).replace(/[\s ]+/g,' ').trim();
const block=s=>String(s==null?'':s).replace(/\r/g,'').replace(/[ \t ]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
const chars=s=>[...String(s==null?'':s)].length;
const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const slug=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,LIMITS.handle).replace(/-$/,'');
const uniq=list=>{const seen=new Set(),out=[];for(const x of list){const v=clean(x),k=norm(v);if(v&&!seen.has(k)){seen.add(k);out.push(v)}}return out};
const cap=s=>{const t=clean(s);return t?t.charAt(0).toUpperCase()+t.slice(1):''};
const URL_RE=/^https?:\/\/\S+$/i;
// Over a limit: cut at the last sentence that keeps most of the text, else at the last word (lib/product-studio.js fit).
const fit=(s,max)=>{const P=prodLib();if(P&&P.fit)return P.fit(clean(s),max);const t=[...clean(s)];return t.length<=max?clean(s):t.slice(0,max).join('').replace(/\s+\S*$/,'')};

// ---- step 1: platform and shop basics ----
const PLATFORMS=[{id:'shopify',label:'Shopify',sub:'Il CSV prodotti di Shopify: Prodotti → Importa'},{id:'woocommerce',label:'WooCommerce',sub:'Il CSV dell’importatore di WooCommerce: Prodotti → Importa'},
 {id:'both',label:'Entrambi',sub:'I due file, per scegliere dopo o per due negozi'}];
const STATUSES=[['draft','Bozza: li controlli e li pubblichi tu'],['active','Pubblicati subito']];
const WEIGHT_UNITS=[['kg','kg'],['g','grammi']];
function normalizeSettings(s){const x=s||{};return {platform:PLATFORMS.some(p=>p.id===x.platform)?x.platform:'shopify',shopName:clean(x.shopName).slice(0,80),currency:'EUR',vatIncluded:x.vatIncluded!==false,
 shippingNote:clean(x.shippingNote).slice(0,240),status:x.status==='active'?'active':'draft',weightUnit:x.weightUnit==='g'?'g':'kg'}}
const wantsShopify=s=>normalizeSettings(s).platform!=='woocommerce',wantsWoo=s=>normalizeSettings(s).platform!=='shopify';

// ---- step 2: columns ----
// Order matters: the model code before the SKU (both may be «codice…»), the compare-at price before the price.
const FIELDS=[
 {id:'group',label:'Codice modello (unisce le varianti)',aliases:['codicemodello','modello','codicepadre','padre','parent','parentsku','skupadre','gruppo','handle','urlhandle','articolopadre','stylecode','modelcode']},
 {id:'sku',label:'SKU / codice',aliases:['sku','codice','cod','codicearticolo','codart','variantsku','articolo','ref','riferimento','code','itemcode','productcode','codicevariante','id']},
 {id:'name',label:'Nome prodotto',need:true,aliases:['nome','nomeprodotto','prodotto','titolo','denominazione','title','name','productname','product','nomearticolo']},
 {id:'description',label:'Descrizione',aliases:['descrizione','description','dettagli','desc','descrizionebreve','descrizionelunga','descrizioneprodotto','details','shortdescription','bodyhtml','body']},
 {id:'compareAt',label:'Prezzo pieno (barrato)',aliases:['prezzopieno','prezzobarrato','prezzooriginale','compareatprice','variantcompareatprice','prezzoprimadellosconto','prezzodilistino']},
 {id:'price',label:'Prezzo di vendita',need:true,aliases:['prezzo','price','prezzovendita','prezzodivendita','prezzoivato','prezzoalpubblico','variantprice','prezzounitario','importo']},
 {id:'stock',label:'Quantità in magazzino',aliases:['quantita','qty','quantity','giacenza','scorte','stock','magazzino','disponibilita','inventory','inventoryqty','variantinventoryqty','pezzi']},
 {id:'weight',label:'Peso',aliases:['peso','weight','pesonetto','pesolordo','grams','grammi','variantgrams','pesokg','pesog','pesoing','pesoinkg']},
 {id:'size',label:'Taglia (variante 1)',aliases:['taglia','size','misura','taglie','formato']},
 {id:'color',label:'Colore (variante 2)',aliases:['colore','color','colour','tinta','colori']},
 {id:'category',label:'Categoria',aliases:['categoria','category','categories','reparto','collezione','linea','tipo','tipoprodotto','type','producttype']},
 {id:'vendor',label:'Marca',aliases:['marca','brand','marchio','vendor','produttore']},
 {id:'material',label:'Materiale',aliases:['materiale','material','materiali','composizione','tessuto']},
 {id:'barcode',label:'EAN / codice a barre',aliases:['ean','ean13','gtin','barcode','variantbarcode','codiceabarre','upc']},
 {id:'images',label:'Link delle foto',aliases:['immagini','immagine','images','image','foto','imagesrc','imageurl','urlimmagine','linkimmagine','linkfoto','picture','photo','fotoprodotto']},
 {id:'tags',label:'Tag',aliases:['tag','tags','etichette','parolechiave','keywords']}];
const field=id=>FIELDS.find(f=>f.id===id)||null;
// Headers (and the first rows) → {field: header}: exact alias, then a header that contains an alias, then image links by
// content. Each header is used once; every field gets a key ('' when unmatched).
function detectMapping(headers,rows){const hs=(headers||[]).map(h=>String(h||'')),used=new Set(),out={};
 for(const f of FIELDS){const i=hs.findIndex(h=>h&&!used.has(h)&&f.aliases.includes(norm(h)));if(i>=0){out[f.id]=hs[i];used.add(hs[i])}}
 for(const f of FIELDS){if(out[f.id])continue;const i=hs.findIndex(h=>h&&!used.has(h)&&f.aliases.some(a=>a.length>3&&norm(h).includes(a)));if(i>=0){out[f.id]=hs[i];used.add(hs[i])}}
 if(!out.images){const sample=(rows||[]).slice(0,25),h=hs.find(h=>{if(!h||used.has(h))return false;const vs=sample.map(r=>clean(r&&r[h])).filter(Boolean);return vs.length&&vs.filter(v=>URL_RE.test(v.split(/[\s|;]+/)[0])).length/vs.length>=.8});if(h){out.images=h;used.add(h)}}
 for(const f of FIELDS)if(!out[f.id])out[f.id]='';
 return out}
const missingColumns=mapping=>FIELDS.filter(f=>f.need&&!(mapping||{})[f.id]).map(f=>f.label);

// ---- values ----
function parsePrice(v){const P=prodLib();if(P&&P.parsePrice)return P.parsePrice(v);const n=Number(String(v).replace(',','.'));return clean(v)&&isFinite(n)?n:null}
// «12», «12,0» → 12; '' → null; anything else → NaN (a word such as «disponibile» is not a quantity).
function parseStock(v){const s=clean(v);if(!s)return null;if(/^-?\d+(?:[.,]0+)?$/.test(s))return parseInt(s,10);return NaN}
// «0,18 kg», «180 g», «180gr» → grams; a bare number uses the unit chosen in step 1; '' → null; unreadable → NaN.
function parseWeight(v,unit){const s=clean(v).toLowerCase();if(!s)return null;const m=/^(\d+(?:[.,]\d+)?)\s*(kg|chili|chilogrammi|g|gr|grammi)?\.?$/.exec(s);if(!m)return NaN;
 const n=parsePrice(m[1]);if(n==null)return NaN;const u=m[2]?(/^k|^c/.test(m[2])?'kg':'g'):(unit==='g'?'g':'kg');return Math.round(u==='kg'?n*1000:n)}
// One cell → its image links (separated by «|», «;», new lines or spaces; a comma only before another link).
const splitImages=v=>String(v==null?'':v).split(/\s*[|;\n]\s*|\s+|,(?=\s*https?:)/).map(x=>x.trim().replace(/,$/,'')).filter(Boolean);
const splitTags=v=>uniq(String(v==null?'':v).split(/[,;|]/));
const money=n=>n==null||!isFinite(n)?'':n.toFixed(2);

// ---- products and variants ----
// rows: [{header: value}] (crm-csv-core shape). Rows with neither name nor SKU are skipped. Rows with the same model
// code (or, without that column, the same name) are the variants of one product.
function buildProducts(rows,mapping,settings,{limit=MAX_ROWS}={}){const m=mapping||{},s=normalizeSettings(settings),get=(r,k)=>m[k]?clean(r[m[k]]):'',groups=new Map();let skipped=0,used=0;
 const mapped=new Set(Object.values(m).filter(Boolean));
 (rows||[]).forEach((r,i)=>{const v={key:'R'+(i+2),row:i+2,sku:get(r,'sku'),name:get(r,'name'),price:get(r,'price'),compareAt:get(r,'compareAt'),stock:get(r,'stock'),weight:get(r,'weight'),
   size:get(r,'size'),color:get(r,'color'),barcode:get(r,'barcode').replace(/\s/g,''),images:splitImages(m.images?r[m.images]:'')};
  if(!v.name&&!v.sku){skipped++;return}if(used>=limit)return;used++;
  const g=get(r,'group'),gk=g?'g:'+norm(g):'n:'+norm(v.name||v.sku);
  let p=groups.get(gk);if(!p){p={key:'P'+v.row,row:v.row,group:g,name:'',description:'',category:'',vendor:'',material:'',sheetTags:[],extra:[],facts:[],variants:[],defaults:[]};groups.set(gk,p)}
  if(!p.name)p.name=v.name;if(!p.description&&m.description)p.description=block(r[m.description]);
  for(const k of ['category','vendor','material'])if(!p[k])p[k]=get(r,k);p.sheetTags=uniq(p.sheetTags.concat(splitTags(get(r,'tags'))));
  // the other columns of the sheet: facts the texts may use (links left out)
  for(const [h,val] of Object.entries(r||{})){const t=clean(val);if(!h||!t||mapped.has(h)||URL_RE.test(t))continue;const e=p.extra.find(x=>x[0]===clean(h));if(!e)p.extra.push([clean(h),[t]]);else if(!e[1].includes(t))e[1].push(t)}
  for(const [h,val] of Object.entries(r||{})){const t=block(val);if(!h||!t||URL_RE.test(t.split(/\s/)[0]))continue;if(!p.facts.some(f=>f[0]===clean(h)&&f[1]===t))p.facts.push([clean(h),t])}
  p.variants.push(v)});
 const out=[...groups.values()];
 for(const p of out){if(!p.vendor&&s.shopName){p.vendor=s.shopName;p.defaults.push('vendor')}
  if(s.shippingNote)p.facts.push(['Spedizione',s.shippingNote]);if(p.defaults.includes('vendor'))p.facts.push(['Marca',p.vendor]);
  p.sizes=uniq(p.variants.map(v=>v.size));p.colors=uniq(p.variants.map(v=>v.color));p.images=uniq(p.variants.flatMap(v=>v.images))}
 // handles: from the model code when it already is one, else from the name; repeated ones get -2, -3…
 const taken=new Set();for(const p of out){const base=(p.group&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.group)?p.group:slug(p.name||p.group||p.variants[0].sku))||'prodotto';let h=base,k=2;while(taken.has(h))h=base+'-'+k++;taken.add(h);p.handle=h}
 return {products:out,skipped,variants:used,cut:Math.max(0,(rows||[]).length-skipped-used)}}

// ---- step 3: three fixed presentations (no AI) ----
const PROPOSALS=[
 {id:'essenziale',label:'Essenziale',sub:'Il nome pulito, la descrizione del foglio, una collezione per categoria.'},
 {id:'descrittivo',label:'Descrittivo',sub:'Nome e materiale, descrizione con le caratteristiche in elenco, tag per materiale e colore.'},
 {id:'vetrina',label:'Vetrina',sub:'Marca e nome, descrizione a sezioni con taglie, colori e spedizione, collezioni per colore.'}];
const proposal=id=>PROPOSALS.find(p=>p.id===id)||null;
// Names written all in capitals get sentence case; anything else stays as written.
const tame=s=>{const t=clean(s);return /[A-ZÀ-Ý]{2}/.test(t)&&t===t.toUpperCase()?t.charAt(0)+t.slice(1).toLowerCase():t};
const has=(text,part)=>norm(text).includes(norm(part));
const weightText=p=>{const ws=uniq(p.variants.map(v=>v.weight));return ws.length===1?ws[0]:''};
// The facts of the product as «Etichetta: valore» lines, from the sheet only.
function factLines(p,{options=true}={}){const L=[];if(p.material)L.push('Materiale: '+p.material);
 for(const [h,vals] of p.extra)L.push(cap(h)+': '+vals.join(', '));const w=weightText(p);if(w)L.push('Peso: '+w);
 if(options){if(p.sizes.length)L.push((p.sizes.length>1?'Taglie':'Taglia')+': '+p.sizes.join(', '));if(p.colors.length)L.push((p.colors.length>1?'Colori':'Colore')+': '+p.colors.join(', '))}
 return L}
const leadOf=p=>p.description||(tame(p.name)+(p.material&&!has(p.name,p.material)?' in '+p.material.toLowerCase():'')+'.');
const shopSuffix=(title,shop,extra)=>{for(const t of [[title,extra,shop],[title,shop],[title]].map(x=>x.filter(Boolean).join(' | ')))if(chars(t)<=LIMITS.seoTitle)return t;return fit(title,LIMITS.seoTitle)};
// A product and a presentation → {title, description (plain text: paragraphs, «- » lists, «## » headings), tags,
// collections, seoTitle, seoDescription, alt}.
function present(p,id,settings){const s=normalizeSettings(settings),pr=proposal(id)?id:'essenziale',name=tame(p.name),cat=p.category,mat=p.material;
 let title,description,tags,collections,seoTitle,alt;
 if(pr==='essenziale'){title=name;description=leadOf(p);tags=uniq([cat,...p.sheetTags]);collections=uniq([cat]);seoTitle=fit(title,LIMITS.seoTitle);alt=name}
 else if(pr==='descrittivo'){title=mat&&!has(name,mat)?name+' in '+mat.toLowerCase():name;const L=factLines(p);
  description=[leadOf(p),L.length?'## Caratteristiche\n'+L.map(x=>'- '+x).join('\n'):''].filter(Boolean).join('\n\n');
  tags=uniq([cat,mat,...p.colors,...p.sheetTags]);collections=uniq([cat,cat&&mat?cat+' > '+cap(mat):'']);seoTitle=shopSuffix(title,s.shopName);alt=[name,mat&&!has(name,mat)?'in '+mat.toLowerCase():''].filter(Boolean).join(' ')+(p.colors.length===1?', colore '+p.colors[0].toLowerCase():'')}
 else{title=p.vendor&&!has(name,p.vendor)?p.vendor+' · '+name:name;const L=factLines(p,{options:false}),O=[];
  if(p.sizes.length)O.push('- '+(p.sizes.length>1?'Taglie disponibili':'Taglia')+': '+p.sizes.join(', '));if(p.colors.length)O.push('- '+(p.colors.length>1?'Colori disponibili':'Colore')+': '+p.colors.join(', '));
  description=[leadOf(p),L.length?'## Dettagli\n'+L.map(x=>'- '+x).join('\n'):'',O.length?'## Taglie e colori\n'+O.join('\n'):'',s.shippingNote?'## Spedizione\n'+s.shippingNote:''].filter(Boolean).join('\n\n');
  tags=uniq([cat,mat,...p.colors,...p.sizes.map(x=>'Taglia '+x),p.vendor,...p.sheetTags]);collections=uniq([cat,...p.colors.map(c=>'Colori > '+cap(c))]);seoTitle=shopSuffix(name,s.shopName,cat&&!has(name,cat)?cat:'');
  alt=[p.vendor&&!has(name,p.vendor)?p.vendor:'',name,mat&&!has(name,mat)?'in '+mat.toLowerCase():''].filter(Boolean).join(' ')+(p.colors.length===1?', colore '+p.colors[0].toLowerCase():'')}
 const plain=plainText(description),first=plain.split(/\n+/)[0]||title;
 const seoDescription=fit(pr==='essenziale'?first:pr==='descrittivo'?[first,p.sizes.length>1?'Taglie '+p.sizes.join(', ')+'.':'',p.colors.length>1?'Colori '+p.colors.join(', ')+'.':''].filter(Boolean).join(' ')
  :[first,s.shippingNote].filter(Boolean).join(' '),LIMITS.seoDescription);
 return {title:fit(title,LIMITS.title),description,tags,collections,seoTitle,seoDescription,alt:fit(alt,LIMITS.alt)}}
// The mini markup of the descriptions → plain text (for meta and checks) and HTML (for the shops).
const plainText=t=>block(t).split('\n').map(l=>l.replace(/^##\s+/,'').replace(/^-\s+/,'')).join('\n');
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function toHtml(text){return block(text).split(/\n{2,}/).map(b=>{const lines=b.split('\n').map(x=>x.trim()).filter(Boolean),out=[];let list=[],para=[];
  const flushL=()=>{if(list.length)out.push('<ul>'+list.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>');list=[]},flushP=()=>{if(para.length)out.push('<p>'+para.map(esc).join('<br>')+'</p>');para=[]};
  for(const l of lines){if(/^##\s+/.test(l)){flushL();flushP();out.push('<h3>'+esc(l.replace(/^##\s+/,''))+'</h3>')}else if(/^-\s+/.test(l)){flushP();list.push(l.replace(/^-\s+/,''))}else{flushL();para.push(l)}}
  flushL();flushP();return out.join('')}).join('')}
// The first paragraph as plain text: WooCommerce's short description.
const shortOf=text=>fit((block(text).split(/\n{2,}/).find(b=>!/^##|^-\s/.test(b.trim()))||'').replace(/\n/g,' '),LIMITS.short);

// ---- step 4: the final products (presentation + the person's changes) ----
const OPTION_NAMES=['Taglia','Colore'];
// overrides: {productKey: {title, handle, description, tags, images, seoTitle, seoDescription, alt, optionNames,
// variants: {variantKey: {sku, price, compareAt, stock, weight, size, color}}}}: every value as typed.
function finalize(base,proposalId,overrides,settings){const s=normalizeSettings(settings),o=overrides||{};
 return (base||[]).map(p=>{const pr=present(p,proposalId,s),x=o[p.key]||{},pick=(k,d)=>x[k]!=null?x[k]:d;
  const variants=p.variants.map(v=>{const y=(x.variants||{})[v.key]||{},val=k=>clean(y[k]!=null?y[k]:v[k]);const out={key:v.key,row:v.row,sku:val('sku'),price:val('price'),compareAt:val('compareAt'),stock:val('stock'),weight:val('weight'),size:val('size'),color:val('color'),barcode:v.barcode,images:v.images};
   out.priceValue=out.price?parsePrice(out.price):null;out.compareValue=out.compareAt?parsePrice(out.compareAt):null;out.qty=parseStock(out.stock);out.grams=parseWeight(out.weight,s.weightUnit);return out});
  const names=(x.optionNames||[]).length?x.optionNames.map(clean):OPTION_NAMES,images=x.images?uniq(x.images.map(clean)):p.images;
  const options=[['size',names[0]||OPTION_NAMES[0]],['color',names[1]||OPTION_NAMES[1]]].filter(([k])=>variants.some(v=>v[k])).map(([k,name])=>({key:k,name,values:uniq(variants.map(v=>v[k]))}));
  if(x.images)for(const v of variants)v.images=v.images.filter(u=>images.includes(u));
  return {key:p.key,row:p.row,base:p,group:p.group,title:clean(pick('title',pr.title)),handle:clean(pick('handle',p.handle)),description:block(pick('description',pr.description)),
   tags:x.tags?uniq(x.tags):pr.tags,collections:pr.collections,seoTitle:clean(pick('seoTitle',pr.seoTitle)),seoDescription:clean(pick('seoDescription',pr.seoDescription)),alt:clean(pick('alt',pr.alt)),
   vendor:p.vendor,type:p.category?p.category.split('>').pop().trim():'',images,options,variants,edited:!!o[p.key],
   parentSku:clean(p.group)||(variants.length>1?p.handle.toUpperCase():variants[0].sku)}})}
// What the person changed, kept only where it differs from the presentation.
function setOverride(overrides,product,patch){const o={...(overrides||{})},cur={...(o[product.key]||{})};
 for(const [k,v] of Object.entries(patch||{})){if(k==='variants'){cur.variants={...(cur.variants||{})};for(const [vk,vp] of Object.entries(v||{}))cur.variants[vk]={...(cur.variants[vk]||{}),...vp}}else cur[k]=v}
 o[product.key]=cur;return o}
const resetOverride=(overrides,key)=>{const o={...(overrides||{})};delete o[key];return o};

// ---- checks ----
const HANDLE_RE=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// The sheet facts the grounding check compares with (lib/product-studio.js groundingFlags).
const groundOf=p=>({facts:p.base.facts.concat([['Taglie',p.base.sizes.join(', ')],['Colori',p.base.colors.join(', ')]]),name:p.base.name,brand:p.vendor,category:p.base.category,color:p.base.colors.join(', ')});
function inventedFlags(p){const P=prodLib();if(!P||!P.groundingFlags)return [];const g=groundOf(p);
 const text=[p.title,plainText(p.description),p.seoTitle,p.seoDescription,p.alt].join('\n');return P.groundingFlags(text,g)}
const flagLine=f=>{const P=prodLib();return P&&P.flagText?P.flagText(f):'«'+f.text+'» non è nel foglio.'};
// Every product → {key, title, handle, issues:[{level:'error'|'warn', field, msg, sku?}], errors, warnings}; summary.
function checkAll(products,settings){const s=normalizeSettings(settings),items=[],skus=new Map(),handles=new Map();
 for(const p of products||[]){handles.set(p.handle,(handles.get(p.handle)||0)+1);for(const v of p.variants)if(v.sku){const k=v.sku.toLowerCase();skus.set(k,(skus.get(k)||0)+1)}
  if(wantsWoo(s)&&p.variants.length>1&&p.parentSku){const k=p.parentSku.toLowerCase();skus.set(k,(skus.get(k)||0)+1)}}
 for(const p of products||[]){const L=[],add=(level,f,msg,sku)=>L.push({level,field:f,msg,...(sku?{sku}:{})});
  if(!p.title)add('error','title','Titolo vuoto.');else if(chars(p.title)>LIMITS.title)add('error','title','Titolo di '+chars(p.title)+' caratteri: al massimo '+LIMITS.title+'.');
  if(!p.handle)add('error','handle','Handle vuoto: serve per l’indirizzo del prodotto.');else if(!HANDLE_RE.test(p.handle))add('error','handle','Handle «'+p.handle+'»: solo lettere minuscole, numeri e trattini.');
  if(p.handle&&handles.get(p.handle)>1)add('error','handle','Handle «'+p.handle+'» usato da più prodotti: Shopify li unirebbe in uno.');
  const multi=p.variants.length>1,combos=new Set();
  for(const v of p.variants){const who=v.sku||'riga '+v.row;
   if(!v.price)add('error','price','Prezzo mancante ('+who+').',v.sku);else if(v.priceValue==null)add('error','price','Prezzo «'+v.price+'» non leggibile ('+who+').',v.sku);else if(v.priceValue<=0)add('error','price','Prezzo zero o negativo ('+who+').',v.sku);
   if(v.compareAt&&v.compareValue==null)add('warn','compareAt','Prezzo pieno «'+v.compareAt+'» non leggibile ('+who+').',v.sku);
   else if(v.compareValue!=null&&v.priceValue!=null&&v.compareValue<=v.priceValue)add('warn','compareAt','Il prezzo pieno ('+money(v.compareValue)+') non è più alto del prezzo di vendita ('+money(v.priceValue)+'): non lo metto nei file ('+who+').',v.sku);
   if(!v.sku)add('warn','sku',multi?'Variante senza SKU (riga '+v.row+'): il magazzino non la distingue.':'Prodotto senza SKU: consigliato per magazzino e aggiornamenti.');
   else if(skus.get(v.sku.toLowerCase())>1)add('error','sku','SKU «'+v.sku+'» ripetuto: ogni variante e ogni prodotto devono avere il suo.',v.sku);
   if(Number.isNaN(v.qty))add('warn','stock','Quantità «'+v.stock+'» non è un numero intero ('+who+'): la lascio vuota.',v.sku);
   if(Number.isNaN(v.grams))add('warn','weight','Peso «'+v.weight+'» non leggibile ('+who+'): scrivilo come «0,2 kg» o «200 g».',v.sku);
   for(const img of v.images)if(!p.images.includes(img)&&!/^https:\/\//i.test(img))add('error','images','Foto non https: «'+img+'».',v.sku);
   if(p.options.length){const miss=p.options.filter(o=>!v[o.key]);if(miss.length)add('error','options','Variante senza '+miss.map(o=>o.name.toLowerCase()).join(' e ')+' ('+who+'): ogni variante deve avere un valore per ogni opzione.',v.sku);
    const c=p.options.map(o=>norm(v[o.key])).join('|');if(combos.has(c))add('error','options','Due varianti con le stesse opzioni ('+p.options.map(o=>v[o.key]).filter(Boolean).join(', ')+').',v.sku);combos.add(c)}}
  if(multi&&!p.options.length)add('error','options','Più righe con lo stesso modello ma senza taglia né colore: Shopify non può distinguere le varianti.');
  if(wantsWoo(s)&&multi&&!clean(p.group))add('warn','sku','SKU del prodotto padre per WooCommerce creato dall’handle: '+p.parentSku+'.');
  if(!p.images.length)add('warn','images','Nessuna foto: il prodotto si importa lo stesso, aggiungile dopo.');
  for(const img of p.images){if(!URL_RE.test(img))add('error','images','Link foto non valido: «'+img+'».');else if(!/^https:\/\//i.test(img))add('error','images','Foto non https: «'+img+'». Usa un link https pubblico.')}
  if(!plainText(p.description))add('warn','description','Descrizione vuota.');
  if(!p.seoTitle)add('warn','seoTitle','Titolo SEO vuoto.');else if(chars(p.seoTitle)>LIMITS.seoTitle)add('warn','seoTitle','Titolo SEO di '+chars(p.seoTitle)+' caratteri: Google ne mostra circa '+LIMITS.seoTitle+'.');
  if(!p.seoDescription)add('warn','seoDescription','Meta description vuota.');else if(chars(p.seoDescription)>LIMITS.seoDescription)add('warn','seoDescription','Meta description di '+chars(p.seoDescription)+' caratteri: al massimo '+LIMITS.seoDescription+'.');
  if(p.images.length&&!p.alt)add('warn','alt','Testo alternativo delle foto vuoto.');else if(chars(p.alt)>LIMITS.alt)add('warn','alt','Testo alternativo di '+chars(p.alt)+' caratteri: meglio entro '+LIMITS.alt+'.');
  for(const f of inventedFlags(p))add('error','description',flagLine(f)+' Nei testi solo i dati del foglio.');
  const errors=L.filter(x=>x.level==='error').length;items.push({key:p.key,row:p.row,title:p.title,handle:p.handle,issues:L,errors,warnings:L.length-errors})}
 const summary={products:items.length,variants:(products||[]).reduce((k,p)=>k+p.variants.length,0),error:items.filter(x=>x.errors).length,warn:items.filter(x=>!x.errors&&x.warnings).length,ok:items.filter(x=>!x.issues.length).length};
 summary.ready=!summary.error;return {items,summary}}

// ---- step 5: the files ----
// Shopify's product CSV, classic importer headers (the importer also reads its newer template names).
const SHOPIFY_COLUMNS=['Handle','Title','Body (HTML)','Vendor','Product Category','Type','Tags','Published','Option1 Name','Option1 Value','Option2 Name','Option2 Value','Option3 Name','Option3 Value',
 'Variant SKU','Variant Grams','Variant Inventory Tracker','Variant Inventory Qty','Variant Inventory Policy','Variant Fulfillment Service','Variant Price','Variant Compare At Price','Variant Requires Shipping','Variant Taxable','Variant Barcode',
 'Image Src','Image Position','Image Alt Text','Gift Card','SEO Title','SEO Description','Variant Image','Variant Weight Unit','Cost per item','Status'];
const WOO_COLUMNS=['Type','SKU','Name','Published','Is featured?','Visibility in catalog','Short description','Description','Tax status','In stock?','Stock','Backorders allowed?','Weight (kg)',
 'Sale price','Regular price','Categories','Tags','Images','Parent','Attribute 1 name','Attribute 1 value(s)','Attribute 1 visible','Attribute 1 global','Attribute 2 name','Attribute 2 value(s)','Attribute 2 visible','Attribute 2 global'];
const qtyOf=v=>Number.isInteger(v.qty)?v.qty:null,gramsOf=v=>Number.isInteger(v.grams)?v.grams:null;
const compareOf=v=>v.compareValue!=null&&v.priceValue!=null&&v.compareValue>v.priceValue?v.compareValue:null;
const isHttps=u=>/^https:\/\/\S+$/i.test(u);
const shopifyTags=p=>uniq(p.tags.concat(p.collections.map(c=>c.split('>').pop().trim()))).join(', ');
// One row per variant (the first with the product fields), then one row per extra image; a product with no options
// gets Shopify's «Title / Default Title».
function shopifyRows(products,settings){const s=normalizeSettings(settings),out=[];
 for(const p of products||[]){const imgs=p.images.filter(isHttps),multi=p.variants.length>1;
  p.variants.forEach((v,i)=>{const r={Handle:p.handle};
   if(i===0)Object.assign(r,{Title:p.title,'Body (HTML)':toHtml(p.description),Vendor:p.vendor,'Product Category':'',Type:p.type,Tags:shopifyTags(p),Published:s.status==='active'?'TRUE':'FALSE','Gift Card':'FALSE',
    'SEO Title':p.seoTitle,'SEO Description':p.seoDescription,Status:s.status});
   if(p.options.length)p.options.forEach((o,k)=>{if(i===0)r['Option'+(k+1)+' Name']=o.name;r['Option'+(k+1)+' Value']=v[o.key]});else{if(i===0)r['Option1 Name']='Title';r['Option1 Value']='Default Title'}
   const q=qtyOf(v),g=gramsOf(v),c=compareOf(v),vimg=multi?(v.images.find(isHttps)||''):'';
   Object.assign(r,{'Variant SKU':v.sku,'Variant Grams':g==null?'':String(g),'Variant Inventory Tracker':q==null?'':'shopify','Variant Inventory Qty':q==null?'':String(q),'Variant Inventory Policy':'deny','Variant Fulfillment Service':'manual',
    'Variant Price':money(v.priceValue),'Variant Compare At Price':c==null?'':money(c),'Variant Requires Shipping':'TRUE','Variant Taxable':'TRUE','Variant Barcode':v.barcode,'Variant Image':vimg,'Variant Weight Unit':s.weightUnit});
   if(imgs[i])Object.assign(r,{'Image Src':imgs[i],'Image Position':String(i+1),'Image Alt Text':altFor(p,imgs[i])});out.push(r)});
  for(let i=p.variants.length;i<imgs.length;i++)out.push({Handle:p.handle,'Image Src':imgs[i],'Image Position':String(i+1),'Image Alt Text':altFor(p,imgs[i])})}
 return out}
// The alt of one photo: the product's, plus the colour when the photo belongs to variants of one colour.
function altFor(p,img){const cs=uniq(p.variants.filter(v=>v.images.includes(img)).map(v=>v.color));return p.base.colors.length>1&&cs.length===1&&!has(p.alt,cs[0])?fit(p.alt+', colore '+cs[0].toLowerCase(),LIMITS.alt):p.alt}
// WooCommerce: a simple row, or a variable parent with one variation row per variant (Parent = the parent's SKU).
function wooRows(products,settings){const s=normalizeSettings(settings),pub=s.status==='active'?'1':'-1',out=[];
 const priceCols=v=>{const c=compareOf(v);return c!=null?{'Regular price':money(c),'Sale price':money(v.priceValue)}:{'Regular price':money(v.priceValue),'Sale price':''}};
 const stockCols=v=>{const q=qtyOf(v);return {'In stock?':q==null||q>0?'1':'0',Stock:q==null?'':String(q),'Backorders allowed?':'0'}};
 const kg=v=>{const g=gramsOf(v);return g==null?'':String(+(g/1000).toFixed(3))};
 for(const p of products||[]){const imgs=p.images.filter(isHttps),cats=p.collections.join(', '),tags=p.tags.join(', ');
  const common={Name:p.title,Published:pub,'Is featured?':'0','Visibility in catalog':'visible','Short description':shortOf(p.description),Description:toHtml(p.description),'Tax status':'taxable',Categories:cats,Tags:tags,Images:imgs.join(', ')};
  const attrs=(vals,parent)=>{const r={};p.options.forEach((o,k)=>{const n='Attribute '+(k+1);r[n+' name']=o.name;r[n+' value(s)']=parent?o.values.join(', '):vals[o.key]||'';r[n+' visible']=parent?'1':'';r[n+' global']='1'});return r};
  if(p.variants.length===1){const v=p.variants[0];out.push({Type:'simple',SKU:v.sku,...common,...stockCols(v),'Weight (kg)':kg(v),...priceCols(v),Parent:'',...attrs(v,true)});continue}
  out.push({Type:'variable',SKU:p.parentSku,...common,'In stock?':'1',Stock:'','Backorders allowed?':'0','Weight (kg)':'','Regular price':'','Sale price':'',Parent:'',...attrs(null,true)});
  for(const v of p.variants){const label=p.options.map(o=>v[o.key]).filter(Boolean).join(', ');
   out.push({Type:'variation',SKU:v.sku,Name:p.title+(label?' - '+label:''),Published:'1','Is featured?':'0','Visibility in catalog':'visible','Short description':'',Description:'','Tax status':'taxable',...stockCols(v),'Weight (kg)':kg(v),...priceCols(v),
    Categories:'',Tags:'',Images:(v.images.find(isHttps)||''),Parent:p.parentSku,...attrs(v,false)})}}
 return out}
// CSV with commas, cells with commas, quotes or new lines quoted, formula-looking cells kept as text (crm-csv-core safe).
function csv(rows,cols,{bom=false}={}){const C=csvLib(),safe=C&&C.safe?C.safe:v=>{const s=v==null?'':String(v);return /^[=+\-@\t\r]/.test(s)?"'"+s:s};
 const q=v=>{const s=/^-?\d+(?:\.\d+)?$/.test(String(v))?String(v):safe(v);return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
 return (bom?'﻿':'')+[cols.map(q).join(','),...(rows||[]).map(r=>cols.map(c=>q(r[c]==null?'':r[c])).join(','))].join('\r\n')+'\r\n'}
const shopifyCsv=(products,settings)=>csv(shopifyRows(products,settings),SHOPIFY_COLUMNS);
const wooCsv=(products,settings)=>csv(wooRows(products,settings),WOO_COLUMNS);
const SEO_COLUMNS=['handle','sku','titolo','titolo_seo','meta_description','alt_foto'];
const seoCsv=products=>csv((products||[]).map(p=>({handle:p.handle,sku:p.variants.length>1?p.parentSku:p.variants[0].sku,titolo:p.title,titolo_seo:p.seoTitle,meta_description:p.seoDescription,alt_foto:p.alt})),SEO_COLUMNS,{bom:true});
const CHECK_COLUMNS=['handle','titolo','sku','livello','campo','problema'];
const checksCsv=check=>csv(check.items.flatMap(x=>x.issues.map(i=>({handle:x.handle,titolo:x.title,sku:i.sku||'',livello:i.level==='error'?'errore':'avviso',campo:i.field,problema:i.msg}))),CHECK_COLUMNS,{bom:true});
const FILES=Object.freeze({shopify:'shopify-prodotti.csv',woo:'woocommerce-prodotti.csv',seo:'seo-e-alt.csv',checks:'controlli.csv',readme:'LEGGIMI.txt'});
function readme(products,check,settings,{name,date,proposalLabel,sample,aiUsed}={}){const s=normalizeSettings(settings),c=check.summary,L=[],shop=wantsShopify(s),woo=wantsWoo(s);
 L.push('NEGOZIO ONLINE · PRODOTTI DA IMPORTARE'+(name?' · '+clean(name):'')+' · '+(date||new Date().toISOString().slice(0,10)));
 if(sample)L.push('DATI DI ESEMPIO: negozio e prodotti inventati, solo per provare l’importazione.');
 L.push('','Prodotti: '+c.products+' · varianti: '+c.variants+' · pronti: '+c.ok+' · con avvisi: '+c.warn+' · con errori: '+c.error+(proposalLabel?' · presentazione: '+proposalLabel:''),
  'Testi: solo dai dati del foglio'+(aiUsed?' (descrizioni migliorate con 1 chiamata AI, approvate a mano)':' · nessuna chiamata AI')+'. Valuta: '+s.currency+'. Prezzi '+(s.vatIncluded?'IVA inclusa':'IVA esclusa')+'. Stato dei prodotti: '+(s.status==='active'?'pubblicati':'bozza')+'.','');
 L.push('RADIX prepara solo i file: non crea il negozio, non si collega a Shopify o WooCommerce, non configura i pagamenti e non pubblica nulla. L’importazione la fai tu.','');
 L.push('FILE');if(shop)L.push('- '+FILES.shopify+': il CSV prodotti di Shopify, una riga per variante (la prima con i dati del prodotto) e una riga per ogni foto in più.');
 if(woo)L.push('- '+FILES.woo+': il CSV dell’importatore di WooCommerce: prodotti semplici, prodotti variabili (Type variable) e le loro varianti (Type variation, colonna Parent = SKU del padre).');
 L.push('- '+FILES.seo+': titolo SEO, meta description e testo alternativo delle foto, un prodotto per riga'+(woo?' (WooCommerce non li importa da solo: copiali nel plugin SEO, per esempio Yoast o Rank Math)':'')+'.','- '+FILES.checks+': i controlli, un problema per riga.','');
 if(shop)L.push('IMPORTARE IN SHOPIFY','1. Prova prima su un negozio di sviluppo o con 2-3 prodotti.','2. Pannello Shopify → Prodotti → Importa → Aggiungi file → scegli '+FILES.shopify+'.',
  '3. Lascia spenta «Sovrascrivi i prodotti con lo stesso handle» al primo caricamento; accendila solo per aggiornare prodotti già importati.','4. Carica e controlla l’anteprima → Importa prodotti. Shopify ti manda un’email a importazione finita.',
  '5. Le foto: Shopify le scarica dai link https del file; un link che non risponde lascia il prodotto senza foto.','6. Le quantità vanno nella sede predefinita: controlla Prodotti → Inventario dopo l’importazione.',
  '7. IVA: Impostazioni → Imposte e dazi → «Includi le imposte nei prezzi» '+(s.vatIncluded?'ATTIVA (i prezzi del file sono IVA inclusa).':'SPENTA (i prezzi del file sono IVA esclusa).'),
  '8. Categoria prodotto (tassonomia Shopify): il file la lascia vuota, sceglila tu nella scheda prodotto. Il campo Tipo viene dalla categoria del foglio.',
  '9. Collezioni: il CSV di Shopify non le crea. Crea una collezione automatica per ognuna con la condizione «Tag del prodotto è uguale a …»: '+(uniq(products.flatMap(p=>p.collections.map(x=>x.split('>').pop().trim()))).join(', ')||'nessuna')+'.',
  '10. Stato: '+(s.status==='active'?'i prodotti sono attivi e pubblicati nel negozio online.':'i prodotti arrivano in bozza: controllali e mettili «Attivi» quando sei pronto.'),'');
 if(woo)L.push('IMPORTARE IN WOOCOMMERCE','1. Prova prima su un sito di test (staging) con 2-3 prodotti; fai un backup del sito.','2. Bacheca WordPress → Prodotti → Importa → Scegli file → '+FILES.woo+' → Continua.',
  '3. Le colonne hanno i nomi dell’importatore di WooCommerce e si abbinano da sole: controlla l’abbinamento → Esegui l’importazione.','4. Le varianti si agganciano al prodotto padre dallo SKU della colonna Parent: lo SKU del padre deve essere unico.',
  '5. Peso in kg: WooCommerce → Impostazioni → Prodotti → Unità di peso «kg».','6. IVA: WooCommerce → Impostazioni → Imposta → «Prezzi inseriti comprensivi di imposta»: '+(s.vatIncluded?'Sì.':'No.')+' Attiva le imposte e imposta le aliquote.',
  '7. Le foto vengono scaricate nella Libreria media dai link https: con molte foto l’importazione è lenta, è normale.','8. Categorie e tag si creano da soli («Padre > Figlia» crea la sottocategoria).',
  '9. Stato: '+(s.status==='active'?'i prodotti sono pubblicati.':'i prodotti arrivano in bozza (Published -1): pubblicali quando sei pronto.'),'');
 L.push('PRIMA DI APRIRE IL NEGOZIO (checklist)','[ ] Pagamenti: attivali tu (per esempio '+(shop&&woo?'Shopify Payments, PayPal, Stripe':shop?'Shopify Payments o PayPal':'Stripe o PayPal per WooCommerce')+'). RADIX non configura pagamenti né conti.',
  '[ ] Spedizioni: zone, tariffe, tempi e costi indicati prima dell’ordine'+(s.shippingNote?'. Nota dal brief: '+s.shippingNote.replace(/[.\s]+$/,''):'')+'.',
  '[ ] Diritto di recesso: 14 giorni dalla consegna per i consumatori (Codice del Consumo, artt. 52 e seguenti), con il modulo tipo di recesso.',
  '[ ] Condizioni generali di vendita: chi vende, prezzi, pagamenti, consegna, recesso, garanzia legale di conformità (24 mesi), reclami.',
  '[ ] Informativa privacy (GDPR) per ordini, account e newsletter.','[ ] Cookie policy e banner dei cookie con consenso prima dei cookie non tecnici.',
  '[ ] Dati dell’impresa nel sito: ragione sociale, sede, partita IVA, contatti (email o PEC).',
  '[ ] Prezzi ai consumatori mostrati IVA inclusa'+(s.vatIncluded?'.':': il file ha prezzi IVA esclusa, imposta il negozio in modo che li mostri IVA inclusa.'),
  '[ ] Fai controllare i testi legali a un consulente: RADIX non li scrive e questa lista non è un parere legale.','[ ] Un ordine di prova completo (pagamento, email, spedizione) prima di aprire.','');
 if(c.error)L.push('ATTENZIONE: '+c.error+' prodott'+(c.error===1?'o ha':'i hanno')+' errori (vedi '+FILES.checks+'). Correggili prima di importare, o importa e sistemali nel negozio.','');
 return L.join('\n')+'\n'}
function exportFiles(products,check,settings,meta={}){const s=normalizeSettings(settings),out=[];
 if(wantsShopify(s))out.push({name:FILES.shopify,data:shopifyCsv(products,s)});if(wantsWoo(s))out.push({name:FILES.woo,data:wooCsv(products,s)});
 out.push({name:FILES.seo,data:seoCsv(products)},{name:FILES.checks,data:checksCsv(check)},{name:FILES.readme,data:readme(products,check,s,meta)});return out}
function exportZip(products,check,settings,meta){const Z=zipLib();if(!Z)throw Error('Archivio zip non disponibile: ricarica la pagina.');return Z.zip(exportFiles(products,check,settings,meta))}
const zipName=name=>'negozio-'+(slug(name)||'prodotti')+'.zip';

// ---- optional AI: the descriptions only, grounded on the sheet ----
function aiPrompt(products,{shopName}={}){const rows=products.map(p=>({chiave:p.key,nome:p.base.name,dati:p.base.facts.map(([k,v])=>k+': '+clean(v).slice(0,300)),descrizione_attuale:p.description}));
 return 'Sei il content writer del negozio online'+(clean(shopName)?' «'+clean(shopName)+'»':'')+'. Migliora SOLO le descrizioni di questi prodotti, in italiano, chiare e invitanti, da 40 a 120 parole ciascuna.\n'+
  'Regole obbligatorie:\n- usa solo i dati del prodotto: non aggiungere numeri, misure, pesi, materiali, certificazioni, origine, garanzie, taglie, colori o promesse che non sono nei dati;\n- niente prezzi, sconti né promozioni, niente emoji, niente HTML;\n'+
  '- formato: paragrafi separati da una riga vuota; un elenco ha righe che iniziano con «- »; un titoletto inizia con «## »;\n- se una descrizione va già bene, riscrivila uguale.\n'+
  'Rispondi solo con un array JSON nella forma [{"chiave":"...","descrizione":"..."}], senza altro testo.\n\nProdotti:\n'+JSON.stringify(rows)}
function parseAi(text){const s=String(text||''),a=s.indexOf('['),z=s.lastIndexOf(']');if(a<0||z<a)return [];
 try{const arr=JSON.parse(s.slice(a,z+1));return Array.isArray(arr)?arr.filter(x=>x&&typeof x==='object').map(x=>({key:clean(x.chiave!=null?x.chiave:x.key),text:block(x.descrizione!=null?x.descrizione:x.description)})):[]}catch(e){return []}}
// A proposal against the sheet: dropped when it adds data (numbers, materials, claims, colours, sizes) or prices.
function aiCheck(p,text){const reasons=[];const t=block(text);if(!t)reasons.push('descrizione vuota');if(/<[a-z][^>]*>/i.test(t))reasons.push('contiene HTML');
 if(/€|\beur(?:o)?\b|\bscont[oi]\b|\bpromo/i.test(t))reasons.push('parla di prezzi o sconti');
 const P=prodLib();if(P&&P.groundingFlags)for(const f of P.groundingFlags(plainText(t),groundOf(p)))reasons.push(flagLine(f));return {ok:!reasons.length,reasons}}
// ONE confirmation, ONE call: {proposals:[{key,title,before,after,ok,reasons}]} or {cancelled:true}; nothing changes until applied.
async function improveDescriptions({products,rt,confirm,project,shopName,onStart}={}){const todo=(products||[]).slice(0,AI_MAX);
 if(!todo.length)return {nothing:true};if(!rt||typeof rt.reply!=='function')throw Error('Gli agenti non si sono caricati: ricarica la pagina.');
 const ok=await (confirm||askConfirm)({title:'Miglioro le descrizioni di '+todo.length+' prodott'+(todo.length===1?'o':'i')+'?',cost:'È una sola chiamata AI al Content e UX Writer: usa crediti API.',
  facts:[['Prodotti',String(todo.length)+((products||[]).length>todo.length?' (i primi '+AI_MAX+' di '+products.length+')':'')],['Chiamate AI','1'],['Cosa cambia','Solo le descrizioni, dopo che le approvi']],
  message:'Titoli, prezzi, varianti e foto non cambiano. RADIX scarta le descrizioni che aggiungono numeri, materiali, colori, taglie o dichiarazioni che non sono nel foglio.',ok:'Migliora (1 chiamata)'});
 if(!ok)return {cancelled:true};if(typeof onStart==='function')onStart();
 const r=await rt.reply({role:AGENT,project:project&&project.name?{id:project.id,name:project.name}:undefined,messages:[{role:'user',content:aiPrompt(todo,{shopName})}]});
 const got=new Map(parseAi(r&&r.text).map(x=>[x.key,x.text]));if(!got.size)throw Error('la risposta non contiene descrizioni leggibili. Riprova.');
 return {proposals:todo.map(p=>{const after=got.get(p.key)||'',g=after?aiCheck(p,after):{ok:false,reasons:['nessuna proposta']},same=block(after)===block(p.description);return {key:p.key,title:p.title,before:p.description,after,ok:g.ok&&!same,same,reasons:g.reasons}})}}
function applyAi(overrides,products,proposals,keys){let o=overrides||{};const byKey=new Map((products||[]).map(p=>[p.key,p]));
 for(const x of proposals||[])if(x.ok&&(!keys||keys.includes(x.key))&&byKey.has(x.key))o=setOverride(o,byKey.get(x.key),{description:x.after});return o}

// ---- saved in the project: the «agents» document, key shop ----
const emptyStore=()=>({schemaVersion:1,items:[]});
function readStore(d){const s=d&&d.shop;return s&&typeof s==='object'&&Array.isArray(s.items)?{schemaVersion:1,items:s.items.filter(x=>x&&typeof x==='object')}:emptyStore()}
function savedRecord({fileName,sheet,mapping,settings,proposal:pid,overrides,sample,aiUsed},{by,at,id}={}){const when=at||new Date().toISOString(),hs=(sheet&&sheet.headers||[]).slice(0,80);
 const rec={id:id||'shop-'+when.replace(/\D/g,'').slice(0,14),at:when,by:clean(by).slice(0,80),fileName:clean(fileName).slice(0,120),sample:!!sample,aiUsed:!!aiUsed,settings:normalizeSettings(settings),proposal:proposal(pid)?pid:'',
  mapping:Object.fromEntries(FIELDS.map(f=>[f.id,hs.includes((mapping||{})[f.id])?mapping[f.id]:''])),headers:hs,rows:(sheet&&sheet.rows||[]).slice(0,MAX_ROWS).map(r=>hs.map(h=>String(r[h]==null?'':r[h]).slice(0,2000))),overrides:JSON.parse(JSON.stringify(overrides||{}))};
 const size=new TextEncoder().encode(JSON.stringify(rec)).length;if(size>SAVE_BUDGET){const e=Error('Troppi dati per salvarli nel progetto ('+Math.round(size/1024)+' KB, massimo '+Math.round(SAVE_BUDGET/1024)+' KB): scarica lo zip, che li contiene tutti.');e.tooBig=true;throw e}
 return rec}
const sheetOf=rec=>{const hs=rec&&rec.headers||[];return {headers:hs.slice(),rows:(rec&&rec.rows||[]).map(a=>Object.fromEntries(hs.map((h,i)=>[h,a[i]==null?'':a[i]])))}};
function fromRecord(rec){return {sheet:sheetOf(rec),fileName:rec&&rec.fileName||'',mapping:{...(rec&&rec.mapping||{})},settings:normalizeSettings(rec&&rec.settings),proposal:rec&&rec.proposal||'',overrides:{...(rec&&rec.overrides||{})},sample:!!(rec&&rec.sample),aiUsed:!!(rec&&rec.aiUsed)}}
function addRecord(store,rec){const s=readStore({shop:store});return {schemaVersion:1,items:s.items.filter(x=>x.id!==rec.id).concat([rec]).slice(-MAX_SAVED)}}
async function saveToProject(ws,projectId,rec){if(!ws||typeof ws.bind!=='function')throw Error('Archivio del progetto non disponibile.');
 const d=ws.bind(projectId,'agents');
 for(let i=0;i<3;i++){const cur=(await d.load())||{},next=addRecord(readStore(cur),rec);
  try{await d.save({...cur,schemaVersion:1,conversations:cur.conversations||{},shop:next});return next}catch(e){if(!(ws.ConflictError&&e instanceof ws.ConflictError)||i===2)throw e}}}
// The sheets saved by the Studio Schede prodotto (key productSheets): their headers and rows can be loaded here.
function savedSheets(doc){const P=prodLib();return P&&P.readStore?P.readStore(doc).items.filter(r=>Array.isArray(r.headers)&&Array.isArray(r.rows)&&r.rows.length):[]}

// ---- the example: DATI DI ESEMPIO, a small invented clothing shop, with a few deliberate mistakes for the checks ----
const SAMPLE_SHOP='Filo Chiaro';
const SAMPLE_HEADERS=['Codice modello','SKU','Nome','Descrizione','Prezzo','Prezzo pieno','Quantità','Peso','Taglia','Colore','Categoria','Marca','Materiale','Vestibilità','Lavaggio','Immagini'];
const IMG='https://example.com/filo-chiaro/';
const SAMPLE_ROWS=[
 ['TS-ONDA','TS-ONDA-S-BLU','T-shirt Onda','T-shirt a girocollo con maniche corte e orlo dritto.','24,00','','12','0,18 kg','S','Blu','T-shirt','Filo Chiaro','cotone','Regolare','In lavatrice a 30 °C',IMG+'ts-onda-blu.jpg'],
 ['TS-ONDA','TS-ONDA-M-BLU','T-shirt Onda','','24,00','','8','0,18 kg','M','Blu','T-shirt','Filo Chiaro','cotone','Regolare','In lavatrice a 30 °C',IMG+'ts-onda-blu.jpg'],
 ['TS-ONDA','TS-ONDA-L-BLU','T-shirt Onda','','24,00','','0','0,18 kg','L','Blu','T-shirt','Filo Chiaro','cotone','Regolare','In lavatrice a 30 °C',IMG+'ts-onda-blu.jpg'],
 ['TS-ONDA','TS-ONDA-S-BIA','T-shirt Onda','','24,00','','5','0,18 kg','S','Bianco','T-shirt','Filo Chiaro','cotone','Regolare','In lavatrice a 30 °C',IMG+'ts-onda-bianco.jpg'],
 ['TS-ONDA','TS-ONDA-M-BIA','T-shirt Onda','','24,00','','7','0,18 kg','M','Bianco','T-shirt','Filo Chiaro','cotone','Regolare','In lavatrice a 30 °C',IMG+'ts-onda-bianco.jpg'],
 ['FE-RIVA','FE-RIVA-M','Felpa Riva','Felpa con cappuccio e tasca a marsupio.','49,00','59,00','4','0,45 kg','M','Grigio','Felpe','Filo Chiaro','cotone felpato','Ampia','In lavatrice a 30 °C',IMG+'fe-riva-1.jpg | '+IMG+'fe-riva-2.jpg'],
 ['FE-RIVA','FE-RIVA-L','Felpa Riva','','49,00','59,00','3','0,45 kg','L','Grigio','Felpe','Filo Chiaro','cotone felpato','Ampia','In lavatrice a 30 °C',IMG+'fe-riva-1.jpg'],
 ['CA-FARO','CA-FARO','Cappello Faro','Cappello in tela con visiera corta.','19,00','','15','0,1 kg','','Sabbia','Accessori','Filo Chiaro','tela di cotone','','Lavaggio a mano',IMG+'ca-faro.jpg'],
 ['BO-MOLO','BO-MOLO','Borsa Molo','Borsa a tracolla con chiusura a zip.','','','6','0,6 kg','','Nero','Accessori','Filo Chiaro','tela cerata','','Pulire con un panno umido','http://example.com/filo-chiaro/bo-molo.jpg'],
 ['SC-ALBA','FE-RIVA-L','Sciarpa Alba','Sciarpa leggera con frange.','22,00','','10','0,12 kg','','Ecru','Accessori','Filo Chiaro','lino','','Lavaggio a mano',IMG+'sc-alba.jpg']];
const sampleSheet=()=>({name:'esempio-filo-chiaro.csv',headers:SAMPLE_HEADERS.slice(),rows:SAMPLE_ROWS.map(r=>Object.fromEntries(SAMPLE_HEADERS.map((h,i)=>[h,r[i]])))});
const SAMPLE_SETTINGS=Object.freeze({platform:'both',shopName:SAMPLE_SHOP,vatIncluded:true,shippingNote:'Spedizione in Italia con corriere in 2-4 giorni lavorativi.',status:'draft',weightUnit:'kg'});
function sampleCsv(){const q=v=>/[;"\n]/.test(v)?'"'+String(v).replace(/"/g,'""')+'"':v;return [SAMPLE_HEADERS.map(q).join(';'),...SAMPLE_ROWS.map(r=>r.map(q).join(';'))].join('\r\n')+'\r\n'}
// Reading a sheet: the CRM import readers, through the Studio Schede prodotto (xlsx with formulas as saved values).
async function readSheet(file){const P=prodLib();if(!P||!P.readSheet)throw Error('Lettore dei fogli non disponibile: ricarica la pagina.');return P.readSheet(file)}

// ---- browser widget ----
let counter=0;
const dom=()=>root.document;
const el=(tag,text,cls)=>{const x=dom().createElement(tag);if(text!=null)x.textContent=text;if(cls)x.className=cls;return x};
const button=(text,cls)=>{const b=el('button',text,cls||'');b.type='button';return b};
const pill=(text,state)=>{const p=el('span',text,'pf-pill');if(state)p.dataset.state=state;return p};
function download(name,data,type){const a=el('a');a.href=root.URL.createObjectURL(new root.Blob([data],{type}));a.download=name;dom().body.append(a);a.click();a.remove();setTimeout(()=>root.URL.revokeObjectURL(a.href),2000)}
const moreText=n=>n<=20?'Mostra gli altri '+n:'Mostra altri 20 (ne restano '+n+')';
// ctx: {project (profileFor summary), projectName, projectId, workspace, rt, agentsUrl, by}
function shopStudio(ctx={}){const n=++counter,project=ctx.project||{},brand=clean(String(project.name||ctx.projectName||'').split(/\s[—–-]\s/)[0]).slice(0,80);
 const st={settings:normalizeSettings({shopName:brand}),sheet:null,fileName:'',sample:false,mapping:{},auto:{},info:null,base:[],proposal:'',overrides:{},products:[],check:null,
  open:new Set(),filter:'all',shown:20,ai:null,aiUsed:false,busy:false,recordId:'',saved:[],sheets:[]};
 const wrap=el('div',undefined,'tool photo-studio pf-studio ns-studio');
 const steps=el('ol',undefined,'ps-steps');['Piattaforma','I prodotti','La presentazione','Rifinisci','Esporta'].forEach((t,i)=>{const li=el('li',(i+1)+' · '+t);li.dataset.step=String(i+1);steps.append(li)});
 const setStep=k=>[...steps.children].forEach(li=>li.dataset.state=+li.dataset.step<k?'done':+li.dataset.step===k?'current':'todo');
 const note=el('p','RADIX prepara i file da importare: non crea il negozio, non si collega a Shopify o WooCommerce e non configura i pagamenti.','pf-note');
 const flag=el('p','DATI DI ESEMPIO · negozio e prodotti inventati','ns-sample-flag');flag.hidden=true;
 const savedBox=el('div',undefined,'ad-saved pf-saved');savedBox.hidden=true;
 const platBox=el('section',undefined,'pf-card ns-platform'),srcBox=el('section',undefined,'pf-card pf-source'),mapBox=el('section',undefined,'pf-card pf-map'),prevBox=el('section',undefined,'pf-card pf-preview');
 const propBox=el('section',undefined,'pf-step ns-proposals'),refBox=el('section',undefined,'pf-step ns-refine'),expBox=el('section',undefined,'pf-step ns-export');
 const status=el('p','','tool-status');status.setAttribute('role','status');
 [mapBox,prevBox,propBox,refBox,expBox].forEach(x=>x.hidden=true);
 wrap.append(steps,note,flag,savedBox,platBox,srcBox,mapBox,prevBox,status,propBox,refBox,expBox);setStep(1);
 const recompute=()=>{st.products=finalize(st.base,st.proposal||'essenziale',st.overrides,st.settings);st.check=checkAll(st.products,st.settings)};
 const rebuild=()=>{if(!st.sheet)return;st.info=buildProducts(st.sheet.rows,st.mapping,st.settings);st.base=st.info.products;const keys=new Set(st.base.map(p=>p.key));for(const k of Object.keys(st.overrides))if(!keys.has(k))delete st.overrides[k];recompute()};
 const refreshAll=()=>{rebuild();renderPreview();if(!propBox.hidden)renderProposals();if(!refBox.hidden)renderRefine();if(!expBox.hidden)renderExport()};
 // ---- step 1 ----
 function renderPlatform(){const s=st.settings,h=el('div',undefined,'pf-card-head');h.append(el('h4','Dove vendi'),el('p','Scegli la piattaforma del negozio e le regole di base: valgono per tutti i prodotti.','muted'));
  const fs=el('fieldset',undefined,'pf-channels ns-platforms');fs.append(el('legend','Piattaforma'));
  PLATFORMS.forEach(p=>{const l=el('label',undefined,'ps-chip ad-tile pf-tile'),r=el('input');r.type='radio';r.name='ns-plat-'+n;r.checked=s.platform===p.id;r.onchange=()=>{s.platform=p.id;refreshAll()};
   const t=el('span',undefined,'ad-tile-text');t.append(el('strong',p.label),el('small',p.sub));l.append(r,t);fs.append(l)});
  const defs=el('div',undefined,'pf-defaults'),fld=(label,node,wide)=>{const l=el('label',undefined,'pf-field'+(wide?' pf-wide':''));l.append(el('span',label),node);defs.append(l);return node};
  const sel=(opts,v)=>{const x=el('select');opts.forEach(([val,t])=>x.append(new root.Option(t,val)));x.value=v;return x};
  const name=el('input');name.type='text';name.maxLength=80;name.value=s.shopName;name.placeholder='Es. Filo Chiaro';fld('Nome del negozio (marca se manca nel foglio)',name);
  const cur=fld('Valuta',sel([['EUR','Euro (EUR)']],'EUR'));cur.disabled=true;
  const vat=fld('I prezzi del foglio sono',sel([['yes','IVA inclusa'],['no','IVA esclusa']],s.vatIncluded?'yes':'no'));
  const stt=fld('Stato dei prodotti importati',sel(STATUSES,s.status)),wu=fld('Peso senza unità nel foglio',sel(WEIGHT_UNITS,s.weightUnit));
  const ship=el('input');ship.type='text';ship.maxLength=240;ship.value=s.shippingNote;ship.placeholder='Es. Spedizione in Italia con corriere in 2-4 giorni lavorativi.';fld('Nota sulla spedizione (facoltativa, entra nella proposta Vetrina)',ship,true);
  const upd=()=>{Object.assign(s,normalizeSettings({...s,shopName:name.value,vatIncluded:vat.value==='yes',status:stt.value,weightUnit:wu.value,shippingNote:ship.value}));refreshAll()};
  [name,ship].forEach(x=>x.addEventListener('change',upd));[vat,stt,wu].forEach(x=>x.onchange=upd);
  platBox.replaceChildren(h,fs,defs)}
 // ---- step 2 ----
 const sheetInfo=el('p','','pf-sheet-info');sheetInfo.setAttribute('role','status');
 const fromSchede=el('div',undefined,'ns-from');fromSchede.hidden=true;
 (function renderSource(){const h=el('div',undefined,'pf-card-head');h.append(el('h4','I prodotti'),el('p','Un foglio Excel (.xlsx) o CSV, una riga per prodotto o per variante (taglia, colore), fino a '+MAX_ROWS+' righe. Le colonne le trovo da solo.','muted'));
  const drop=el('label',undefined,'pf-drop'),inp=el('input');inp.type='file';inp.accept='.xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const dt=el('span',undefined,'pf-drop-text');dt.append(el('strong','Scegli il foglio prodotti'),el('small','.xlsx o .csv · nome, prezzo, SKU, taglia, colore, quantità, peso, foto…'));drop.append(inp,dt);
  const sample=button('Usa l’esempio: un piccolo negozio di abbigliamento (DATI DI ESEMPIO)','pf-sample-btn');
  const row=el('div',undefined,'pf-src-row');row.append(drop,sample);
  inp.onchange=async()=>{const f=inp.files&&inp.files[0];if(!f)return;try{load(await readSheet(f),f.name,false)}catch(e){sheetInfo.textContent='Foglio non letto: '+e.message;sheetInfo.dataset.state='fail'}};
  sample.onclick=()=>{Object.assign(st.settings,normalizeSettings({...SAMPLE_SETTINGS}));renderPlatform();const s=sampleSheet();load(s,s.name,true)};
  srcBox.replaceChildren(h,row,fromSchede,sheetInfo)})();
 function renderFromSchede(){if(!st.sheets.length){fromSchede.hidden=true;return}fromSchede.replaceChildren(el('span','Oppure il foglio già caricato in Schede prodotto:','ad-tool-label'));
  st.sheets.slice().reverse().forEach(r=>{const b=button((r.fileName||'Foglio')+' · '+r.rows.length+' righe','ad-saved-item');b.onclick=()=>{const s=sheetOf(r);load(s,r.fileName||'schede-prodotto',false)};fromSchede.append(b)});fromSchede.hidden=false}
 function load(sheet,name,sample){if(!sheet||!sheet.rows||!sheet.rows.length){sheetInfo.textContent='Il foglio non ha righe di prodotti.';sheetInfo.dataset.state='fail';return}
  Object.assign(st,{sheet,fileName:name,sample:!!sample,mapping:detectMapping(sheet.headers,sheet.rows),overrides:{},proposal:'',ai:null,aiUsed:false,recordId:'',filter:'all',shown:20});st.auto={...st.mapping};st.open.clear();
  rebuild();flag.hidden=!st.sample;mapBox.hidden=prevBox.hidden=propBox.hidden=false;refBox.hidden=expBox.hidden=true;
  sheetInfo.textContent=name+': '+sheet.rows.length+' righe → '+st.base.length+' prodotti, '+st.info.variants+' varianti'+(st.info.skipped?' · '+st.info.skipped+' righe senza nome né SKU saltate':'')+(st.info.cut?' · '+st.info.cut+' righe oltre le '+MAX_ROWS+' escluse':'')+'.';sheetInfo.dataset.state='ok';
  renderMap();renderPreview();renderProposals();setStep(3);status.textContent=''}
 function renderMap(){const grid=el('div',undefined,'pf-map-grid'),miss=missingColumns(st.mapping),h=el('div',undefined,'pf-card-head');
  h.append(el('h4','Le colonne'),el('p','Abbinate da sole dal nome: controlla e cambia se serve. Le righe con lo stesso codice modello diventano varianti dello stesso prodotto.','muted'));
  for(const f of FIELDS){const l=el('label',undefined,'pf-mapf'),top=el('span',undefined,'pf-mapf-top'),s=el('select');s.name='ns-map-'+f.id+'-'+n;
   s.append(new root.Option('— nessuna —',''),...st.sheet.headers.filter(Boolean).map(x=>new root.Option(x,x)));s.value=st.mapping[f.id]||'';
   const b=el('span','','pf-badge');if(st.mapping[f.id]&&st.mapping[f.id]===st.auto[f.id]){b.textContent='trovata';b.dataset.state='ok'}else if(st.mapping[f.id]){b.textContent='scelta da te';b.dataset.state='ok'}else if(f.need){b.textContent='obbligatoria';b.dataset.state='warn'}else b.textContent='facoltativa';
   top.append(el('span',f.label),b);s.onchange=()=>{st.mapping[f.id]=s.value;st.overrides={};renderMap();refreshAll()};l.append(top,s);l.dataset.set=String(!!st.mapping[f.id]);grid.append(l)}
  mapBox.replaceChildren(h,grid);if(miss.length)mapBox.append(el('p','Mancano colonne necessarie: '+miss.join(', ')+'. Sceglile qui sopra o aggiungile al foglio.','pf-need'))}
 function renderPreview(){const t=el('table',undefined,'pf-table'),thead=el('thead'),tr=el('tr');['Prodotto','Varianti','Opzioni','Prezzo','Foto'].forEach(x=>tr.append(el('th',x)));thead.append(tr);const tb=el('tbody');
  st.products.slice(0,6).forEach(p=>{const row=el('tr'),pr=uniq(p.variants.map(v=>v.priceValue!=null?money(v.priceValue)+' €':v.price||'—'));
   [p.base.name||'—',String(p.variants.length),p.options.map(o=>o.name+': '+o.values.join(', ')).join(' · ')||'—',pr.join(' / '),String(p.images.length)].forEach((v,i)=>{const td=el('td',v);if(i===0)td.className='pf-td-title';row.append(td)});tb.append(row)});
  t.append(thead,tb);const w=el('div',undefined,'pf-tablewrap');w.tabIndex=0;w.setAttribute('role','region');w.setAttribute('aria-label','Come leggo i prodotti');w.append(t);
  const h=el('div',undefined,'pf-card-head');h.append(el('h4','Come leggo i prodotti'),el('p',st.products.length+' prodotti e '+st.check.summary.variants+' varianti.'+(st.products.length>6?' Qui i primi 6.':''),'muted'));prevBox.replaceChildren(h,w)}
 // ---- step 3 ----
 const samplesOf=()=>{const list=st.base.slice().sort((a,b)=>b.variants.length-a.variants.length||b.facts.length-a.facts.length);return list.slice(0,2)};
 function renderProposals(){const head=el('div',undefined,'pf-step-head'),t=el('div');t.append(el('h3','Scegli la presentazione'),el('p','Tre modi fissi di scrivere titolo, descrizione, tag e collezioni, senza AI: ogni parola viene dal foglio. La scelta vale per tutti i prodotti; dopo rifinisci uno per uno.','muted'));head.append(t);
  const g=el('div',undefined,'pf-styles'),samples=samplesOf();
  PROPOSALS.forEach(pr=>{const c=el('article',undefined,'pf-style');c.dataset.chosen=String(st.proposal===pr.id);const h=el('header',undefined,'pf-style-head');h.append(el('h4',pr.label),el('p',pr.sub,'muted'));c.append(h);
   for(const p of samples){const x=present(p,pr.id,st.settings),box=el('div',undefined,'pf-sample');
    const tt=el('p',undefined,'pf-sample-title');tt.append(el('strong',x.title),el('span',chars(x.seoTitle)+'/'+LIMITS.seoTitle+' SEO','pf-count'));
    const d=el('div',undefined,'ns-desc');d.innerHTML=toHtml(x.description);const tags=el('p',undefined,'ns-tags');x.tags.slice(0,6).forEach(tg=>tags.append(el('span',tg,'ns-tag')));
    box.append(tt,d,tags);if(x.collections.length)box.append(el('p','Collezioni: '+x.collections.join(' · '),'muted ns-coll'));c.append(box)}
   const use=button(st.proposal===pr.id?'Presentazione scelta':'Usa «'+pr.label+'»','primary');use.onclick=()=>choose(pr.id);
   const foot=el('footer',undefined,'pf-style-foot');foot.append(pill('Solo dati del foglio','ok'),use);c.append(foot);g.append(c)});
  propBox.replaceChildren(head,g)}
 function choose(id){st.proposal=id;recompute();renderProposals();refBox.hidden=expBox.hidden=false;renderRefine();renderExport();setStep(4);status.textContent='Presentazione «'+proposal(id).label+'» per '+st.products.length+' prodotti. Le modifiche fatte a mano restano.';refBox.scrollIntoView&&refBox.scrollIntoView({behavior:'smooth',block:'start'})}
 // ---- step 4 ----
 const stateOf=key=>{const x=st.check.items.find(i=>i.key===key);return !x?'ok':x.errors?'fail':x.warnings?'warn':'ok'};
 const stateText=key=>{const x=st.check.items.find(i=>i.key===key);return !x||!x.issues.length?'pronto':x.errors?x.errors+' da correggere':x.warnings+' avvis'+(x.warnings===1?'o':'i')};
 const sumPills=()=>{const s=st.check.summary;return [pill(s.products+' prodotti'),pill(s.variants+' varianti'),pill(s.ok+' pronti','ok'),pill(s.warn+' con avvisi',s.warn?'warn':''),pill(s.error+' da correggere',s.error?'fail':'')]};
 function renderRefine(){const head=el('div',undefined,'pf-step-head'),t=el('div');t.append(el('h3','Rifinisci i prodotti'+(st.proposal?' · '+proposal(st.proposal).label:'')),el('p','Apri un prodotto per cambiare testi, foto e varianti. Nelle descrizioni: «- » a inizio riga fa un elenco, «## » un titoletto.','muted'));head.append(t);
  const sum=el('div',undefined,'pf-sum');sum.append(...sumPills());
  const seg=el('div',undefined,'ad-seg pf-seg');seg.setAttribute('role','group');seg.setAttribute('aria-label','Mostra');const s=st.check.summary;
  [['all','Tutti',s.products],['fail','Da correggere',s.error],['warn','Con avvisi',s.warn],['ok','Pronti',s.ok]].forEach(([k,lab,v])=>{const b=button(lab+' · '+v);b.setAttribute('aria-pressed',String(st.filter===k));b.onclick=()=>{st.filter=k;st.shown=20;renderRefine()};seg.append(b)});
  const ai=aiBox();
  const list=el('div',undefined,'pf-list'),items=st.products.filter(p=>st.filter==='all'||stateOf(p.key)===st.filter);items.slice(0,st.shown).forEach(p=>list.append(prodCard(p)));if(!items.length)list.append(el('p','Nessun prodotto qui.','muted pf-empty'));
  const more=items.length>st.shown?button(moreText(items.length-st.shown),'pf-more'):null;if(more)more.onclick=()=>{st.shown+=20;renderRefine()};
  refBox.replaceChildren(head,sum,seg,ai,list,...(more?[more]:[]))}
 const productOf=k=>st.products.find(p=>p.key===k);
 function prodCard(p){const c=el('article',undefined,'pf-prod ns-prod');c.dataset.key=p.key;c.dataset.status=stateOf(p.key);
  const h=button('','pf-prod-head');h.setAttribute('aria-expanded',String(st.open.has(p.key)));const nm=el('span',undefined,'pf-prod-names');
  nm.append(el('span',p.handle+' · '+p.variants.length+' variant'+(p.variants.length===1?'e':'i')+(p.edited?' · modificato':''),'pf-prod-id'),el('strong',p.title||'—'),el('small',shortOf(p.description).slice(0,140)));
  h.append(nm,pill(stateText(p.key),stateOf(p.key)));h.onclick=()=>{st.open.has(p.key)?st.open.delete(p.key):st.open.add(p.key);c.replaceWith(prodCard(productOf(p.key)))};c.append(h);
  if(st.open.has(p.key))c.append(prodBody(p,c));return c}
 // After a change: the products again, then only this card's head, issues and the summary (the focus stays).
 function changed(key,card,issues){recompute();const p=productOf(key);card.dataset.status=stateOf(key);const hp=card.querySelector('.pf-prod-head .pf-pill');if(hp)hp.replaceWith(pill(stateText(key),stateOf(key)));
  const strong=card.querySelector('.pf-prod-names strong');if(strong)strong.textContent=p.title||'—';const id=card.querySelector('.pf-prod-id');if(id)id.textContent=p.handle+' · '+p.variants.length+' variant'+(p.variants.length===1?'e':'i')+' · modificato';
  paintIssues(p,issues);const sum=refBox.querySelector('.pf-sum');if(sum)sum.replaceChildren(...sumPills());if(!expBox.hidden)renderExport()}
 function paintIssues(p,ul){const x=st.check.items.find(i=>i.key===p.key);ul.replaceChildren(...(x?x.issues:[]).map(i=>{const li=el('li',i.msg);li.dataset.soft=String(i.level!=='error');return li}));ul.hidden=!ul.children.length}
 function prodBody(p,card){const b=el('div',undefined,'pf-prod-body'),iss=el('ul',undefined,'pf-issues');
  const facts=el('details',undefined,'pf-facts');facts.append(el('summary','I dati del foglio ('+p.base.facts.length+')'));const dl=el('dl');p.base.facts.forEach(([k,v])=>{const r=el('div');r.append(el('dt',k),el('dd',v));dl.append(r)});facts.append(dl);
  const grid=el('div',undefined,'pf-edit ns-edit'),patch=obj=>{st.overrides=setOverride(st.overrides,p,obj);changed(p.key,card,iss)};
  const fld=(label,node,max,wide)=>{const l=el('label',undefined,'pf-field'+(wide?' pf-wide':'')),top=el('span',undefined,'pf-field-top');top.append(el('span',label));
   if(max){const cnt=el('span','','pf-count'),upd=()=>{const k=chars(node.value);cnt.textContent=k+'/'+max;cnt.dataset.over=String(k>max)};node.addEventListener('input',upd);upd();top.append(cnt)}l.append(top,node);grid.append(l);return node};
  const inp=(v,k,max,label,wide,map)=>{const i=el('input');i.type='text';i.value=v;fld(label,i,max,wide);i.addEventListener('change',()=>patch({[k]:map?map(i.value):i.value}));return i};
  const area=(v,k,label,rows,map)=>{const t=el('textarea');t.rows=Math.min(18,Math.max(rows,String(v).split('\n').length+1));t.value=v;fld(label,t,null,true);t.addEventListener('change',()=>patch({[k]:map?map(t.value):t.value}));return t};
  inp(p.title,'title',null,'Titolo',true);inp(p.handle,'handle',null,'Handle (indirizzo: /products/…)');inp(p.tags.join(', '),'tags',null,'Tag (separati da virgola)',false,splitTags);
  area(p.description,'description','Descrizione',7);inp(p.seoTitle,'seoTitle',LIMITS.seoTitle,'Titolo SEO');inp(p.seoDescription,'seoDescription',LIMITS.seoDescription,'Meta description');
  inp(p.alt,'alt',LIMITS.alt,'Testo alternativo delle foto',true);area(p.images.join('\n'),'images','Link delle foto (uno per riga, https)',3,v=>v.split(/\n+/).map(clean).filter(Boolean));
  // variants
  const vt=el('div',undefined,'ns-variants'),names=el('div',undefined,'ns-optnames');
  const curNames=(st.overrides[p.key]&&st.overrides[p.key].optionNames)||OPTION_NAMES.slice();
  ['Nome opzione 1','Nome opzione 2'].forEach((lab,i)=>{const l=el('label',undefined,'pf-field'),x=el('input');x.type='text';x.value=curNames[i]||OPTION_NAMES[i];x.maxLength=40;l.append(el('span',lab),x);
   x.addEventListener('change',()=>{const nn=curNames.slice();nn[i]=clean(x.value)||OPTION_NAMES[i];curNames[i]=nn[i];patch({optionNames:nn})});names.append(l)});
  const tw=el('div',undefined,'pf-tablewrap ns-vwrap');tw.tabIndex=0;tw.setAttribute('role','region');tw.setAttribute('aria-label','Varianti');
  const t=el('table',undefined,'pf-table ns-vtable'),hr=el('tr');['Taglia','Colore','SKU','Prezzo','Prezzo pieno','Quantità','Peso'].forEach(x=>hr.append(el('th',x)));const th=el('thead');th.append(hr);const tb=el('tbody');
  p.variants.forEach(v=>{const r=el('tr');['size','color','sku','price','compareAt','stock','weight'].forEach(k=>{const td=el('td'),i=el('input');i.type='text';i.value=v[k];i.setAttribute('aria-label',k+' riga '+v.row);i.className='ns-vin ns-vin-'+k;
   i.addEventListener('change',()=>patch({variants:{[v.key]:{[k]:i.value}}}));td.append(i);r.append(td)});tb.append(r)});t.append(th,tb);tw.append(t);vt.append(el('span','Varianti','ad-tool-label'),names,tw);
  const acts=el('div',undefined,'ps-actions pf-prod-actions');if(st.overrides[p.key]){const rs=button('Torna alla presentazione «'+proposal(st.proposal||'essenziale').label+'»');rs.onclick=()=>{st.overrides=resetOverride(st.overrides,p.key);recompute();card.replaceWith(prodCard(productOf(p.key)));const sum=refBox.querySelector('.pf-sum');if(sum)sum.replaceChildren(...sumPills());renderExport()};acts.append(rs)}
  b.append(iss,grid,vt,facts,acts);paintIssues(p,iss);return b}
 // ---- the optional AI call ----
 function aiBox(){const box=el('div',undefined,'pf-card ns-ai'),h=el('div',undefined,'pf-card-head');h.append(el('h4','Facoltativo: descrizioni migliorate con l’AI'),el('p','Una sola chiamata AI per le descrizioni di '+Math.min(AI_MAX,st.products.length)+' prodotti, con conferma prima. Scarto le proposte con dati che non sono nel foglio; scegli tu quali usare.','muted'));
  const go=button(st.ai?'Chiedi di nuovo le proposte':'Migliora le descrizioni (1 chiamata AI)'),out=el('p','','tool-status');out.setAttribute('role','status');const res=el('div',undefined,'ns-ai-res');
  go.disabled=st.busy;go.onclick=async()=>{if(st.busy)return;st.busy=true;go.disabled=true;
   try{const r=await improveDescriptions({products:st.products,rt:ctx.rt||root.RadixAgents,project,shopName:st.settings.shopName,onStart:()=>{out.textContent='Il Content e UX Writer riscrive le descrizioni…'}});
    if(r.cancelled){out.textContent='Nessuna chiamata: annullato.';return}if(r.nothing){out.textContent='Nessun prodotto da migliorare.';return}st.ai=r;show()}
   catch(e){out.textContent='Descrizioni non migliorate: '+e.message}finally{st.busy=false;go.disabled=false}};
  function show(){if(!st.ai){res.replaceChildren();return}const ok=st.ai.proposals.filter(x=>x.ok),bad=st.ai.proposals.filter(x=>!x.ok&&!x.same&&x.after),none=st.ai.proposals.filter(x=>!x.after).length;out.textContent=ok.length+' proposte da valutare'+(bad.length?' · '+bad.length+' scartate perché aggiungevano dati':'')+(none?' · '+none+' senza proposta: restano come sono':'')+'.';
   const chosen=new Set(ok.map(x=>x.key)),list=el('div',undefined,'ns-ai-list');
   st.ai.proposals.filter(x=>!x.same&&x.after).forEach(x=>{const c=el('article',undefined,'pf-check');c.dataset.state=x.ok?'ok':'fail';const hd=el('header');hd.append(el('strong',x.title));
    if(x.ok){const l=el('label',undefined,'ps-chip'),cb=el('input');cb.type='checkbox';cb.checked=true;cb.onchange=()=>{cb.checked?chosen.add(x.key):chosen.delete(x.key)};l.append(cb,dom().createTextNode('Usa'));hd.append(l)}else hd.append(pill('scartata','fail'));
    const d=el('div',undefined,'ns-desc');d.innerHTML=toHtml(x.after||'');c.append(hd,d);if(!x.ok){const ul=el('ul');x.reasons.slice(0,4).forEach(r=>ul.append(el('li',r)));c.append(ul)}list.append(c)});
   const apply=button('Usa le proposte scelte','primary');apply.disabled=!ok.length;apply.onclick=()=>{st.overrides=applyAi(st.overrides,st.products,st.ai.proposals,[...chosen]);st.aiUsed=st.aiUsed||chosen.size>0;st.ai=null;recompute();renderRefine();renderExport();status.textContent=chosen.size+' descrizioni aggiornate.'};
   const drop=button('Lascia le descrizioni come sono');drop.onclick=()=>{st.ai=null;renderRefine()};const a=el('div',undefined,'ps-actions');a.append(apply,drop);res.replaceChildren(list,a)}
  box.append(h,go,out,res);show();return box}
 // ---- step 5 ----
 function renderExport(){const s=st.check.summary,head=el('div',undefined,'pf-step-head'),t=el('div');
  t.append(el('h3','Esporta i file'),el('p',(wantsShopify(st.settings)&&wantsWoo(st.settings)?'Shopify e WooCommerce':wantsShopify(st.settings)?'Shopify':'WooCommerce')+': file con le colonne dell’importatore, più testi SEO, controlli e LEGGIMI con i passi e la checklist prima di aprire.','muted'));
  head.append(t,pill(s.ready?'Pronto da importare':s.error+' prodott'+(s.error===1?'o':'i')+' da correggere',s.ready?'ok':'fail'));
  const tiles=el('div',undefined,'pf-tiles');[['Prodotti',s.products,''],['Varianti',s.variants,''],['Con avvisi',s.warn,'warn'],['Da correggere',s.error,'fail']].forEach(([k,v,state])=>{const d=el('div',undefined,'pf-stat');d.dataset.state=state;d.append(el('strong',String(v)),el('span',k));tiles.append(d)});
  const box=el('div',undefined,'pf-card pf-export'),grid=el('div',undefined,'pf-export-grid'),out=el('p','','tool-status');out.setAttribute('role','status');
  const meta={name:st.settings.shopName||brand,proposalLabel:proposal(st.proposal)?proposal(st.proposal).label:'',sample:st.sample,aiUsed:st.aiUsed},files=()=>exportFiles(st.products,st.check,st.settings,meta);
  const guard=async()=>!s.error||askConfirm({title:'Esportare con '+s.error+' prodott'+(s.error===1?'o':'i')+' da correggere?',message:'I problemi sono elencati in '+FILES.checks+'. Puoi correggerli qui, oppure importare e sistemarli nel negozio.',ok:'Esporta lo stesso',cancel:'Torna ai prodotti'});
  const item=(title,sub,fn,primary)=>{const b=button('','pf-exp'+(primary?' primary':''));b.append(el('strong',title),el('small',sub));b.onclick=async()=>{try{if(!(await guard()))return;fn()}catch(e){out.textContent='Non scaricato: '+e.message}};grid.append(b)};
  const one=(key,type)=>()=>{const f=files().find(x=>x.name===FILES[key]);download(f.name,f.data,type);out.textContent='Scaricato '+f.name+'.'};
  item('Tutto in uno zip','CSV per il negozio, SEO, controlli e LEGGIMI',()=>{const z=exportZip(st.products,st.check,st.settings,meta),name=zipName(meta.name);download(name,z,'application/zip');out.textContent='Scaricato '+name+'.'},true);
  if(wantsShopify(st.settings))item('Shopify',FILES.shopify,one('shopify','text/csv;charset=utf-8'));if(wantsWoo(st.settings))item('WooCommerce',FILES.woo,one('woo','text/csv;charset=utf-8'));
  item('LEGGIMI',FILES.readme+' · passi e checklist',one('readme','text/plain;charset=utf-8'));
  const acts=el('div',undefined,'ps-actions pf-save');
  if(ctx.workspace&&ctx.projectId){const sv=button(st.recordId?'Aggiorna nel progetto':'Salva nel progetto');sv.onclick=async()=>{sv.disabled=true;out.textContent='Salvo nel progetto…';
   try{const rec=savedRecord({fileName:st.fileName,sheet:st.sheet,mapping:st.mapping,settings:st.settings,proposal:st.proposal,overrides:st.overrides,sample:st.sample,aiUsed:st.aiUsed},{by:ctx.by,id:st.recordId||undefined});st.recordId=rec.id;
    const saved=await saveToProject(ctx.workspace,ctx.projectId,rec);st.saved=saved.items;renderSaved();sv.textContent='Salvato nel progetto';out.textContent='Salvato nel progetto: foglio, presentazione e modifiche, da riaprire qui.'}
   catch(e){out.textContent='Non salvato: '+e.message;sv.disabled=false}};acts.append(sv)}
  acts.append(el('span','Pagamenti, spedizioni e pagine legali li configuri tu nel negozio: la checklist è nel LEGGIMI.','muted'));
  box.append(grid,acts,out);expBox.replaceChildren(head,tiles,box)}
 // ---- saved in the project ----
 function renderSaved(){if(!st.saved.length){savedBox.hidden=true;return}savedBox.replaceChildren(el('h4','Negozi preparati nel progetto'));const row=el('div',undefined,'ad-saved-row');
  st.saved.slice().reverse().forEach(r=>{const b=button((r.fileName||'Prodotti')+' · '+(proposal(r.proposal)?proposal(r.proposal).label:'—')+' · '+new Date(r.at).toLocaleDateString('it-IT'),'ad-saved-item');b.onclick=()=>reopen(r);row.append(b)});savedBox.append(row);savedBox.hidden=false}
 function reopen(r){const x=fromRecord(r);Object.assign(st,{sheet:x.sheet,fileName:x.fileName,sample:x.sample,aiUsed:x.aiUsed,settings:x.settings,mapping:x.mapping,overrides:x.overrides,proposal:x.proposal,recordId:r.id,ai:null,filter:'all',shown:20});st.auto={...x.mapping};st.open.clear();
  rebuild();renderPlatform();flag.hidden=!st.sample;mapBox.hidden=prevBox.hidden=propBox.hidden=false;sheetInfo.textContent=x.fileName+': riaperto dal progetto.';sheetInfo.dataset.state='ok';renderMap();renderPreview();renderProposals();
  if(st.proposal){refBox.hidden=expBox.hidden=false;renderRefine();renderExport();setStep(4)}else{refBox.hidden=expBox.hidden=true;setStep(3)}status.textContent='Riaperto: '+x.fileName+'.'}
 renderPlatform();
 (async()=>{if(!ctx.workspace||!ctx.projectId)return;try{const d=await ctx.workspace.bind(ctx.projectId,'agents').load();st.saved=readStore(d).items;st.sheets=savedSheets(d);renderSaved();renderFromSchede()}catch(e){}})();
 return wrap}
return Object.freeze({AGENT,MAX_ROWS,AI_MAX,LIMITS,PLATFORMS,FIELDS,PROPOSALS,OPTION_NAMES,SHOPIFY_COLUMNS,WOO_COLUMNS,FILES,SAMPLE_SETTINGS,
 normalizeSettings,field,detectMapping,missingColumns,parseStock,parseWeight,splitImages,buildProducts,present,plainText,toHtml,shortOf,finalize,setOverride,resetOverride,checkAll,
 shopifyRows,wooRows,shopifyCsv,wooCsv,seoCsv,checksCsv,readme,exportFiles,exportZip,zipName,aiPrompt,parseAi,aiCheck,improveDescriptions,applyAi,
 readStore,savedRecord,fromRecord,addRecord,saveToProject,savedSheets,sampleSheet,sampleCsv,readSheet,shopStudio});
});
