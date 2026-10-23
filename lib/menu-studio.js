/* Studio «Menu e listino» (agency job P7): the dishes or products of a restaurant, bar or bakery become a print menu, a
   table version and a phone page with a QR, with NO AI and no cost (one optional, confirmed AI call rewrites the
   descriptions only).
   1. The project's identity kit (none: an honest note, a neutral style and a link to the Kit identità studio), the type
      (menu ristorante, listino bar, listino prodotti), the voices by paste (free text or a pasted sheet), a CSV or Excel
      file (the CRM readers: sales/crm-csv-core.js, lib/lead-xlsx-parser.js) or by hand in a table: section, name,
      description, price, the 14 EU allergens of Reg. UE 1169/2011 (Annex II; numbered checkboxes and legend), tags
      (vegetariano, vegano, senza glutine, piccante) and notes («surgelato» puts the * on the voice). Prices in € it-IT.
   2. Three layout directions built here, deterministically (Classico, Moderno, Lavagna), shown as the first A4 page;
      the person picks one («Scelta»).
   3. The checks: every voice has a price (or is flagged), allergens declared for every voice (or flagged: never
      invented), the numbered allergen legend whenever an allergen is used, the legal note when a voice is frozen, tags
      that contradict the allergens, the text fitting the pages (automatic pagination in columns, nothing cut or out of
      the page), AA contrast, glyphs, total ink and the QR address.
   4. One zip (lib/zip-lite.js): A4 and A3 menus and the A5 «tavolo» version as print PDFs (CMYK, 3 mm bleed, crop marks,
      texts as outlines: the PDF writer of lib/print-studio.js) plus an A4 PDF for screens, a responsive single-file
      HTML page (no external request, light and dark, allergen and diet filters), the QR (lib/qr-lite.js, PNG and SVG)
      to the address the person gives, the cleaned list as CSV and a LEGGIMI.
   Table formats (on request): DL long, A3 folded into four A4 faces (cover, inside, back with the QR; imposed on two A3
   sheets with fold marks), A3 placemat on one face, table tent (A5 folded in half, the upper face printed upside down).
   Coperto and servizio have their own line (asked for a restaurant, never guessed). After the choice of a style, the
   «Rifinitura»: density, dotted leaders up to the price, descriptions on or off. Sheets go through the catalogue's
   reader (lib/catalog-studio.js). The last saved menu can go online with the site as menu.html (lib/site-studio.js).
   «Migliora le descrizioni»: one /api/chat call to the Copywriter after RadixConfirm; it rewrites existing descriptions
   only and a grounding check rejects any new ingredient, allergen, number or price.
   The work is saved in the project: the «agents» document under the key menu (agents-page.js keeps it).
   Pure part runs in Node for the tests; menuStudio() is the browser widget. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixMenuStudio=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const askConfirm=o=>{const C=root.RadixConfirm||(typeof require==='function'?require('./radix-confirm.js'):null);return C?C.ask(o):Promise.resolve(!!root.confirm([o.title,o.cost,o.message].filter(Boolean).join('\n')))};
function lib(name,file){if(root[name])return root[name];try{return typeof require==='function'?require(file):null}catch(e){return null}}
const PS=()=>lib('RadixPrintStudio','./print-studio.js'),ZIP=()=>lib('RadixZip','./zip-lite.js'),QR=()=>lib('RadixQr','./qr-lite.js'),CSV=()=>lib('RadixCrmCsv','../sales/crm-csv-core.js'),CAT=()=>lib('RadixCatalogStudio','./catalog-studio.js');
const AGENT='copywriter',MAX_ITEMS=300,MAX_SAVED=8,MIN_PT=6,URL_MAX=200;
const clean=s=>String(s==null?'':s).replace(/[\s ]+/g,' ').trim();
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const slug=s=>norm(s).replace(/ /g,'-').slice(0,40);
const up=h=>String(h||'').toUpperCase();
const list=(xs,n=6)=>xs.slice(0,n).join(', ')+(xs.length>n?' e altre '+(xs.length-n):'');

// ---- the 14 allergens of Reg. UE 1169/2011, Annex II (numbered as on Italian menus) ----
const ALLERGENS=Object.freeze([
 [1,'Cereali contenenti glutine','Glutine',['glutine','cereali','frumento','grano','segale','orzo','avena','farro','kamut']],
 [2,'Crostacei','Crostacei',['crostacei','crostaceo','gamberi','gambero','gamberetti','scampi','aragosta','astice','granchio','mazzancolle']],
 [3,'Uova','Uova',['uova','uovo','tuorlo','albume']],
 [4,'Pesce','Pesce',['pesce','acciughe','alici','tonno','salmone','merluzzo','baccala','branzino','orata','sgombro']],
 [5,'Arachidi','Arachidi',['arachidi','arachide']],
 [6,'Soia','Soia',['soia']],
 [7,'Latte e derivati (lattosio)','Latte',['latte','lattosio','latticini','burro','panna','formaggio','formaggi','mozzarella','ricotta','parmigiano','pecorino','yogurt','mascarpone','stracchino','burrata','fiordilatte']],
 [8,'Frutta a guscio','Frutta a guscio',['frutta a guscio','noci','noce','nocciole','nocciola','mandorle','mandorla','pistacchi','pistacchio','anacardi','macadamia','noci pecan']],
 [9,'Sedano','Sedano',['sedano']],
 [10,'Senape','Senape',['senape']],
 [11,'Semi di sesamo','Sesamo',['sesamo']],
 [12,'Anidride solforosa e solfiti (oltre 10 mg/kg)','Solfiti',['solfiti','anidride solforosa','solforosa']],
 [13,'Lupini','Lupini',['lupini','lupino']],
 [14,'Molluschi','Molluschi',['molluschi','mollusco','cozze','vongole','calamari','polpo','seppie','ostriche','totani','moscardini']]
].map(([n,label,short,words])=>Object.freeze({n,label,short,words:Object.freeze(words)})));
const allergen=n=>ALLERGENS[n-1]||null;
const TAGS=Object.freeze([
 {id:'vegetariano',code:'V',label:'Vegetariano',words:['vegetariano','vegetariana','vegetariani','veg']},
 {id:'vegano',code:'VG',label:'Vegano',words:['vegano','vegana','vegani','vegan']},
 {id:'senza-glutine',code:'SG',label:'Senza glutine',words:['senza glutine','gluten free','glutenfree','sg']},
 {id:'piccante',code:'P',label:'Piccante',words:['piccante','piccanti','hot']}].map(Object.freeze));
const TAG_IDS=TAGS.map(t=>t.id);
const tag=id=>TAGS.find(t=>t.id===id)||null;
// Tags that cannot hold with some allergens: [tag, allergen numbers].
const CONFLICTS=Object.freeze([['senza-glutine',[1]],['vegano',[2,3,4,7,14]],['vegetariano',[2,4,14]]]);
const TYPES=Object.freeze([
 {id:'ristorante',title:'Menu ristorante',heading:'Menu',line:'Antipasti, primi, secondi e dolci: piatti con la loro descrizione.'},
 {id:'bar',title:'Listino bar',heading:'Listino bar',line:'Caffetteria, aperitivi, panini: tante voci brevi, su due colonne.'},
 {id:'prodotti',title:'Listino prodotti',heading:'Listino prezzi',line:'Panetteria, pasticceria, gastronomia: prezzi al pezzo o al kg.'}].map(Object.freeze));
const type=id=>TYPES.find(t=>t.id===id)||TYPES[0];
const DIRECTIONS=Object.freeze([
 {id:'classico',title:'Classico',line:'Tutto centrato, cornice sottile e filetti nel colore d’accento: la trattoria elegante.'},
 {id:'moderno',title:'Moderno',line:'Allineato a sinistra, prezzi in colonna, fascia di colore in alto: chiaro e veloce da leggere.'},
 {id:'lavagna',title:'Lavagna',line:'Fondo scuro come una lavagna, titoli e prezzi nel colore d’accento.'}].map(Object.freeze));
const direction=id=>DIRECTIONS.find(d=>d.id===id)||DIRECTIONS[0];
// A4 and A3 for the shop, A5 for the table; scale of the type sizes, margins in mm. The table formats (P7): DL long, A3
// folded into four A4 faces (cover, two inside pages, back with the QR), the A3 placemat on three columns (one face) and
// the table tent (an A5 folded in half: two 148 × 105 faces, the upper one printed upside down). kind: flow (voices in
// columns), folded (four A4 faces imposed on two A3 sheets), tent (the QR card). qr: the format carries the QR.
const FORMATS=Object.freeze([
 {id:'a4',title:'A4',w:210,h:297,margin:16,scale:1,file:'menu-a4',kind:'flow',barCols:2},
 {id:'a3',title:'A3',w:297,h:420,margin:20,scale:1.22,file:'menu-a3',kind:'flow',cols:2},
 {id:'a5',title:'A5 «tavolo»',w:148,h:210,margin:12,scale:.84,file:'menu-a5-tavolo',kind:'flow',qr:true},
 {id:'dl',title:'DL lungo',w:99,h:210,margin:9,scale:.8,file:'menu-dl',kind:'flow',qr:true,line:'99 × 210 mm, stretto e lungo: dolci, vini, menu del giorno.'},
 {id:'a3-piegato',title:'A3 piegato in A4',w:420,h:297,margin:16,scale:1,file:'menu-a3-piegato',kind:'folded',qr:true,faces:4,line:'4 facciate A4: copertina, due pagine interne, retro con il QR.'},
 {id:'tovaglietta',title:'Tovaglietta A3',w:420,h:297,margin:14,scale:.92,file:'menu-tovaglietta-a3',kind:'flow',cols:3,qr:true,onePage:true,line:'A3 orizzontale su 3 colonne, una sola facciata.'},
 {id:'segnatavolo',title:'Segnatavolo',w:148,h:210,margin:10,scale:.9,file:'segnatavolo',kind:'tent',qr:true,face:105,line:'A5 piegato a metà: due facce 148 × 105 mm con il QR.'}].map(Object.freeze));
const FORMAT_IDS=FORMATS.map(f=>f.id);
const DEFAULT_FORMATS=Object.freeze(['a4','a3','a5']);
const format=id=>FORMATS.find(f=>f.id===id)||FORMATS[0];
// The refinement after the choice of a style: density, dotted leaders up to the price, descriptions shown or not.
const DENSITIES=Object.freeze({compatta:{k:.93,g:.62,title:'Compatta'},normale:{k:1,g:1,title:'Normale'},ariosa:{k:1.05,g:1.4,title:'Ariosa'}});
const refineOf=r=>{const o=r&&typeof r==='object'?r:{};return {density:DENSITIES[o.density]?o.density:'normale',leaders:!!o.leaders,descriptions:o.descriptions!==false}};

// ---- reading: allergens, tags, prices ----
const NONE=/^(nessuno|nessuna|nessun allergene|nessun|niente|no|0|n a|senza allergeni)$/;
const hasWord=(text,w)=>new RegExp('(^| )'+w.replace(/ /g,' ')+'( |$)').test(text);
// «1, 3, 7», «glutine, latte», «uova e sedano», «nessuno» → {list, declared, unknown}.
function parseAllergens(v){const raw=Array.isArray(v)?v.join(','):String(v==null?'':v),t=norm(raw);if(!t)return {list:[],declared:false,unknown:[]};
 if(NONE.test(t)||/^[-–—]+$/.test(clean(raw)))return {list:[],declared:true,unknown:[]};
 const out=new Set(),unknown=[];
 for(const part of raw.split(/[,;\/+|]|\s+e\s+|\s+-\s+/i)){const p=norm(part);if(!p)continue;
  const nums=p.match(/^(?:all(?:ergeni)? )?((?:\d{1,2} ?)+)$/);if(nums){nums[1].trim().split(' ').map(Number).forEach(n=>n>=1&&n<=14?out.add(n):unknown.push(String(n)));continue}
  if(/senza/.test(p)){unknown.push(clean(part));continue}
  const a=ALLERGENS.find(x=>norm(x.label)===p||norm(x.short)===p||x.words.some(w=>hasWord(p,w)));if(a)out.add(a.n);else unknown.push(clean(part))}
 return {list:[...out].sort((a,b)=>a-b),declared:out.size>0,unknown}}
function parseTags(v){const raw=Array.isArray(v)?v.join(','):String(v==null?'':v),out=new Set(),unknown=[];
 for(const part of raw.split(/[,;\/+|]/)){const p=norm(part);if(!p)continue;const t=TAGS.find(x=>x.id===p.replace(/ /g,'-')||norm(x.label)===p||x.words.some(w=>p===w||hasWord(p,w)&&w.length>3));if(t)out.add(t.id);else unknown.push(clean(part))}
 return {list:TAG_IDS.filter(id=>out.has(id)),unknown}}
const FROZEN=/surgelat|congelat|abbattut/i;
// «12», «12,50 €», «€ 1.200», «4,50/kg», «3 al pezzo», «s.q.» → {price, unit, note}; text that is not a price → note.
const UNIT=/\s*(?:\/|\bal\b|\balla\b|\bper\b)\s*(kg|chilo|hg|etto|100 ?g|pz|pezzo|porzione|l|litro|lt|cad\.?|calice|bicchiere|bottiglia)\.?\s*$/i;
const UNITS={chilo:'kg',etto:'hg','100g':'100 g',pezzo:'pz',litro:'l',lt:'l','cad.':'cad.',cad:'cad.'};
const SQ=/^(s\.? ?q\.?|secondo quotazione|prezzo di mercato|su richiesta|a peso)$/i;
function number(s){s=String(s).replace(/€|eur(o)?/gi,'').replace(/\s/g,'');if(!/^[\d.,]+$/.test(s)||!/\d/.test(s))return null;
 const d=s.lastIndexOf(','),p=s.lastIndexOf('.');
 if(d>=0&&p>=0)s=d>p?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');
 else if(d>=0)s=(s.match(/,/g).length>1?s.replace(/,/g,''):s.replace(',','.'));
 else if(p>=0&&(s.match(/\./g).length>1||/^\d{1,3}\.\d{3}$/.test(s)))s=s.replace(/\./g,'');
 const n=Number(s);return isFinite(n)?n:null}
function parsePrice(v){if(typeof v==='number')return {price:isFinite(v)&&v>=0?v:null,unit:'',note:''};let s=clean(v);if(!s)return {price:null,unit:'',note:''};
 if(SQ.test(s))return {price:null,unit:'',note:s.toLowerCase()};let unit='';const u=UNIT.exec(s);
 if(u){const k=u[1].toLowerCase().replace(/ /g,'');unit=UNITS[k]||k;s=s.slice(0,u.index)}
 const n=number(s);return n==null?{price:null,unit:'',note:''}:{price:n,unit,note:''}}
function formatEuro(n){if(n==null||!isFinite(n))return '';const [i,d]=Math.abs(n).toFixed(2).split('.');return (n<0?'-':'')+i.replace(/\B(?=(\d{3})+(?!\d))/g,'.')+','+d+' €'}
const priceLabel=it=>it.price!=null?formatEuro(it.price)+(it.unit?'/'+it.unit:''):clean(it.priceNote);

// ---- the voices ----
let uid=0;
const newId=()=>'v'+(++uid).toString(36);
// Every field cut to its length; allergens 1-14, tags of TAGS; nothing added.
function item(x){const o=x||{},al=Array.isArray(o.allergens)?[...new Set(o.allergens.map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=14))].sort((a,b)=>a-b):[];
 const price=typeof o.price==='number'&&isFinite(o.price)&&o.price>=0?Math.round(o.price*100)/100:null;
 return {id:clean(o.id).slice(0,40)||newId(),section:clean(o.section).slice(0,60),name:clean(o.name).slice(0,90),description:clean(o.description).slice(0,300),price,unit:price!=null?clean(o.unit).slice(0,12):'',priceNote:price==null?clean(o.priceNote).slice(0,30):'',
  allergens:al,declared:al.length>0||!!o.declared,tags:TAG_IDS.filter(t=>Array.isArray(o.tags)&&o.tags.includes(t)),frozen:!!o.frozen,notes:clean(o.notes).slice(0,120)}}
// The columns of a sheet: [field, aliases (normalised headers)].
const FIELDS=Object.freeze([
 ['section',['sezione','categoria','reparto','gruppo','portata','tipo','section','category','course']],
 ['name',['nome','piatto','prodotto','voce','articolo','denominazione','titolo','name','dish','item','product']],
 ['description',['descrizione','ingredienti','dettagli','descrizione breve','description','ingredients','details']],
 ['price',['prezzo','prezzo euro','euro','costo','importo','listino','price','cost']],
 ['unit',['unita','unita di misura','um','u m','unit','per']],
 ['allergens',['allergeni','allergeni ue','allergene','allergens','allergeni numeri']],
 ['tags',['tag','tags','etichette','dieta','caratteristiche','diet']],
 ['notes',['note','nota','annotazioni','notes']]]);
function detectColumns(headers){const hs=(headers||[]).map(String),used=new Set(),out={};
 for(const [f,al] of FIELDS){const i=hs.findIndex(h=>!used.has(h)&&al.includes(norm(h)));if(i>=0){out[f]=hs[i];used.add(hs[i])}}
 for(const [f,al] of FIELDS){if(out[f])continue;const i=hs.findIndex(h=>!used.has(h)&&al.some(a=>a.length>3&&norm(h).includes(a)));if(i>=0){out[f]=hs[i];used.add(hs[i])}}
 // what is still missing, from the catalogue's mapping (lib/catalog-studio.js): a price list made for the catalogue
 // (Famiglia, Linea, Prezzo listino, Note…) is read here as it is
 const C=CAT();if(C&&typeof C.detectMapping==='function'){const c=C.detectMapping(hs);
  for(const [f,k] of [['name','name'],['section','category'],['description','description'],['price','price'],['notes','note']])if(!out[f]&&c[k]&&!used.has(c[k])){out[f]=c[k];used.add(c[k])}}
 return out}
// One row of a sheet → a voice and what could not be read.
function fromCells(get,row){const issues=[],name=clean(get('name'));const pr=parsePrice(get('price'));
 if(clean(get('price'))&&pr.price==null&&!pr.note)issues.push('riga '+row+': prezzo «'+clean(get('price')).slice(0,20)+'» non letto');
 const al=parseAllergens(get('allergens'));al.unknown.forEach(u=>issues.push('riga '+row+': allergene «'+u.slice(0,30)+'» non riconosciuto'));
 const tg=parseTags(get('tags'));tg.unknown.forEach(u=>issues.push('riga '+row+': tag «'+u.slice(0,30)+'» non riconosciuto'));
 const notes=clean(get('notes')),frozen=FROZEN.test(notes)||/^\*$/.test(notes)||/\*\s*$/.test(name),unit=clean(get('unit')).replace(/^\//,'');
 return {item:item({section:get('section'),name:name.replace(/\s*\*+\s*$/,''),description:get('description'),price:pr.price,unit:pr.unit||(pr.price!=null?(UNITS[norm(unit).replace(/ /g,'')]||unit):''),priceNote:pr.note,allergens:al.list,declared:al.declared,tags:tg.list,frozen,notes:/^(\*|surgelat[oaie]|congelat[oaie])$/i.test(notes)?'':notes}),issues}}
// {headers, rows:[{header:value}]} (crm-csv-core shape) → {items, skipped, issues, columns}.
function fromSheet(sheet,{columns}={}){const cols=columns||detectColumns(sheet&&sheet.headers),items=[],issues=[];let skipped=0;
 if(!cols.name)return {items,skipped:(sheet&&sheet.rows||[]).length,issues:['Manca la colonna del nome (Nome, Piatto o Prodotto).'],columns:cols};
 (sheet.rows||[]).forEach((r,i)=>{const get=k=>cols[k]?r[cols[k]]:'';if(!clean(get('name'))){skipped++;return}const x=fromCells(get,i+2);items.push(x.item);issues.push(...x.issues)});
 const cut=Math.max(0,items.length-MAX_ITEMS);if(cut)issues.push(cut+' voci oltre il limite di '+MAX_ITEMS+' non lette: dividi il menu.');
 return {items:items.slice(0,MAX_ITEMS),skipped,issues,columns:cols}}
// Free text: one voice per line «Nome - descrizione (1, 3, 7) [vegano] 12,00»; sections in CAPITALS, with a final «:» or
// a «#» in front; a line starting in lower case continues the description above. A pasted sheet (a header with Nome
// and Prezzo, separated by tabs, semicolons or commas) is read as a sheet.
const PRICE_END=/(?:^|[\s.…\-–—|:])(?:€\s*)?(\d{1,5}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)\s*(?:€|euro)?(\s*(?:\/|\bal\b|\bper\b)\s*(?:kg|hg|etto|100 ?g|pz|pezzo|porzione|l|litro|calice|bicchiere|bottiglia)\.?)?\s*$/i;
const SQ_END=/(?:^|\s)(s\.? ?q\.?|secondo quotazione|prezzo di mercato|su richiesta)\s*$/i;
function looksLikeSheet(first){const d=/\t/.test(first)?'\t':/;/.test(first)?';':/,/.test(first)?',':'';if(!d)return false;const cols=detectColumns(first.split(d).map(s=>s.trim()));return !!(cols.name&&(cols.price||cols.allergens||cols.section))}
function groupsOf(text){const out={allergens:[],tags:[],frozen:false,declared:false,unknown:[]};
 const rest=text.replace(/[([]([^()[\]]{1,80})[)\]]/g,(m,inner)=>{const t=norm(inner),parts=inner.split(/[,;\/]|\s+e\s+/).map(norm).filter(Boolean);let used=0;
   if(/^(all(ergeni)?\b|allergeni:)/i.test(inner.trim())||parts.length&&parts.every(p=>/^\d{1,2}$/.test(p)||/^(all|allergeni)( \d{1,2})+$/.test(p)||ALLERGENS.some(a=>a.words.includes(p)||norm(a.short)===p||norm(a.label)===p)||TAGS.some(x=>x.words.includes(p)||norm(x.label)===p)||FROZEN.test(p)||NONE.test(p))){
    for(const p of parts){const pt=parseTags(p);if(pt.list.length){out.tags.push(...pt.list);used++;continue}if(FROZEN.test(p)){out.frozen=true;used++;continue}
     const pa=parseAllergens(p.replace(/^(allergeni|all) ?/,''));if(pa.declared){out.declared=true;out.allergens.push(...pa.list);used++}else out.unknown.push(p)}
    return used?' ':m}
   return t?m:' '});
 return {rest:clean(rest.replace(/\b(?:allergeni|all\.)\s*:?\s*((?:\d{1,2}\s*[,;e ]\s*)*\d{1,2})\b/i,(m,nums)=>{nums.split(/[^\d]+/).filter(Boolean).map(Number).forEach(n=>{if(n>=1&&n<=14){out.allergens.push(n);out.declared=true}});return ' '})),...out}}
function fromText(text){const lines=String(text||'').replace(/\r/g,'').split('\n'),first=(lines.find(l=>clean(l))||'');
 if(looksLikeSheet(first)&&CSV())return {...fromSheet(CSV().parse(lines.join('\n'))),sheet:true};
 const items=[],issues=[];let section='';
 lines.forEach((line,i)=>{const t=clean(line);if(!t)return;
  const isHead=/^#+\s*/.test(t)||/:$/.test(t)&&!PRICE_END.test(t.slice(0,-1))||(/[A-ZÀ-Ý]/.test(t)&&t===t.toUpperCase()&&!/\d/.test(t)&&t.length<=40);
  if(isHead){const s=t.replace(/^#+\s*/,'').replace(/:$/,'').trim();section=s===s.toUpperCase()?s.charAt(0)+s.slice(1).toLowerCase():s;return}
  let body=t,price=null,unit='',note='';const sq=SQ_END.exec(body);
  if(sq){note=sq[1].toLowerCase();body=body.slice(0,sq.index)}
  else{const m=PRICE_END.exec(body);if(m&&clean(body.slice(0,m.index))){const pr=parsePrice(m[1]+(m[2]||''));if(pr.price!=null){price=pr.price;unit=pr.unit;body=body.slice(0,m.index)}}}
  body=body.replace(/[\s.…\-–—|:]+$/,'');
  const g=groupsOf(body);g.unknown.forEach(u=>issues.push('riga '+(i+1)+': «'+u.slice(0,30)+'» non riconosciuto'));
  // a continuation line: lower case start, no price
  if(price==null&&!note&&items.length&&/^[a-zàèéìòù(]/.test(g.rest||t)){const last=items[items.length-1];last.description=clean(last.description+' '+g.rest).slice(0,300);
   if(g.declared){last.allergens=[...new Set(last.allergens.concat(g.allergens))].sort((a,b)=>a-b);last.declared=true}last.tags=TAG_IDS.filter(x=>last.tags.includes(x)||g.tags.includes(x));if(g.frozen)last.frozen=true;return}
  let name=g.rest,desc='';const sp=/\s+[-–—|]\s+|:\s+/.exec(name);if(sp){desc=name.slice(sp.index+sp[0].length);name=name.slice(0,sp.index)}
  const star=/\*+\s*$/.test(name);name=name.replace(/\s*\*+\s*$/,'');if(!clean(name))return;
  items.push(item({section,name,description:desc,price,unit,priceNote:note,allergens:g.allergens,declared:g.declared,tags:g.tags,frozen:g.frozen||star}))});
 const cut=Math.max(0,items.length-MAX_ITEMS);if(cut)issues.push(cut+' voci oltre il limite di '+MAX_ITEMS+' non lette.');
 return {items:items.slice(0,MAX_ITEMS),skipped:0,issues,sheet:false}}
// Sections in order of first appearance, voices in their order.
function sections(items){const map=new Map();for(const it of items||[]){const k=it.section||'';if(!map.has(k))map.set(k,[]);map.get(k).push(it)}return [...map].map(([title,items])=>({title,items}))}

// ---- the model ----
function modelOf(input,profile,{projectName}={}){const i=input||{},P=PS(),t=type(i.type);
 const formats=(Array.isArray(i.formats)?i.formats:DEFAULT_FORMATS).filter(x=>FORMAT_IDS.includes(x));
 // coperto: a number in euro (0 = «nessun coperto»), or not said (null); never guessed
 const cv=typeof i.cover==='number'&&isFinite(i.cover)&&i.cover>=0?Math.round(i.cover*100)/100:null;
 return {type:t.id,direction:direction(i.direction).id,title:clean(i.title).slice(0,60)||t.heading,subtitle:clean(i.subtitle).slice(0,90),footnote:clean(i.footnote).slice(0,200),url:clean(i.url).slice(0,URL_MAX),
  cover:cv?cv:null,noCover:cv===0||cv==null&&!!i.noCover,service:clean(i.service).slice(0,60),refine:refineOf(i.refine),
  formats:formats.length?FORMAT_IDS.filter(x=>formats.includes(x)):DEFAULT_FORMATS.slice(),items:(Array.isArray(i.items)?i.items:[]).slice(0,MAX_ITEMS).map(item).filter(x=>x.name),brand:P.brandOf(profile,projectName),contacts:i.contacts||{}}}
// «Coperto 2,50 € · Servizio 10%», «Nessun coperto», '' when nothing was said.
function coverLine(m){const o=m||{},parts=[];if(o.cover!=null&&o.cover>0)parts.push('Coperto '+formatEuro(o.cover));else if(o.noCover)parts.push('Nessun coperto');
 const s=clean(o.service);if(s)parts.push(/servizio/i.test(s)?s.charAt(0).toUpperCase()+s.slice(1):'Servizio '+s);return parts.join(' · ')}
const contactLinesOf=m=>['address','phone','email','website'].map(k=>clean(((m&&m.contacts)||{})[k]).replace(/^https?:\/\//i,'').replace(/\/$/,'')).filter(Boolean);
// What the person typed in «Coperto»: «2,50» → {cover:2.5}, «nessuno», «no», «0» → {noCover:true}, '' → nothing, else null.
function parseCover(v){const t=clean(v);if(!t)return {cover:null,noCover:false};if(/^(no|nessuno|nessun coperto|niente|senza|0([.,]0+)?\s*€?)$/i.test(t))return {cover:null,noCover:true};
 const p=parsePrice(t.replace(/^coperto\s*/i,''));return p.price==null||p.unit?null:p.price===0?{cover:null,noCover:true}:{cover:p.price,noCover:false}}
const hasKit=profile=>!!(profile&&profile.identityKit&&typeof profile.identityKit==='object'&&PS().brandOf(profile).fromKit);
const usedAllergens=items=>[...new Set((items||[]).flatMap(x=>x.allergens))].sort((a,b)=>a-b);
const usedTags=items=>TAG_IDS.filter(t=>(items||[]).some(x=>x.tags.includes(t)));
const anyFrozen=items=>(items||[]).some(x=>x.frozen);
// The QR address: https:// (or http://) and a host; '' when empty, null when not valid.
function qrUrl(s){const t=clean(s);if(!t)return '';const u=/^https?:\/\//i.test(t)?t:'https://'+t.replace(/^\/+/,'');try{const x=new URL(u);if(!/^https?:$/.test(x.protocol)||!/\./.test(x.hostname)||/\s/.test(u))return null;return u.length>URL_MAX?null:u}catch(e){return null}}
const FROZEN_NOTE='* Prodotto surgelato o congelato (all’origine o in loco).';
const INFO_NOTE='Per informazioni su allergeni e intolleranze rivolgiti al personale.';
const LEGEND_TITLE='Allergeni (Reg. UE 1169/2011)';
const markersOf=(it)=>{const a=it.declared?(it.allergens.length?'All. '+it.allergens.join(', '):''):'Allergeni: chiedi al personale',t=it.tags.map(x=>tag(x).code).join(' ');return [a,t,it.notes].filter(Boolean).join('  ·  ')};

// ---- layout (items in mm on the trim, origin top-left: the print-studio document shape) ----
const ASC=.718,DESC=.207;
const P_=()=>PS();
const wmm=(s,size,bold)=>P_().ptToMm(P_().textWidth(s,size,bold));
const cap=size=>P_().ptToMm(size*ASC),dsc=size=>P_().ptToMm(size*DESC),lead=(size,f)=>P_().ptToMm(size*f);
// Lines stacked from top 0 in a box of width w: [{s,size,bold,fill,label,align,lead}] → {items,h}.
function stack(lines,w){const items=[];let base=null,last=null;
 for(const L of lines){base=base==null?cap(L.size):base+lead(L.size,L.lead||1.3);const tw=wmm(L.s,L.size,L.bold),x=L.align==='center'?(w-tw)/2:L.align==='right'?w-tw:0;
  items.push({t:'text',x,y:base,s:L.s,size:L.size,bold:!!L.bold,fill:L.fill,label:L.label||'',flow:true});last=L}
 return {items,h:base==null?0:base+dsc(last.size)}}
const wrapL=(text,size,w,bold)=>P_().wrap(text,size,Math.max(5,w),bold).filter(x=>x!=='');
function move(it,dx,dy){const o={...it};if(o.t==='line'){o.x1+=dx;o.x2+=dx;o.y1+=dy;o.y2+=dy}else{o.x+=dx;o.y+=dy}return o}
// The colours of a direction: every text colour readable on its background (ink: ≥ 4.5:1, else the best neutral).
function styleOf(dir,pal){const P=P_(),W='#FFFFFF';
 if(dir==='lavagna'){const bg=pal.dark;return {bg,align:'left',upper:true,head:P.ink(bg,pal,pal.accent,pal.light,W),name:P.ink(bg,pal,pal.light,W),desc:P.ink(bg,pal,pal.light,W),price:P.ink(bg,pal,pal.accent,pal.light,W),mark:P.ink(bg,pal,pal.light,W),rule:pal.accent,frame:P.ink(bg,pal,pal.light,W),mono:P.ink(bg,pal,pal.light,W)}}
 if(dir==='moderno'){const bg=W;return {bg,align:'left',upper:false,head:P.ink(bg,pal,pal.primary,pal.dark),name:P.ink(bg,pal,pal.dark),desc:P.ink(bg,pal,pal.secondary,pal.dark),price:P.ink(bg,pal,pal.primary,pal.dark),mark:P.ink(bg,pal,pal.secondary,pal.dark),rule:pal.accent,band:pal.primary,frame:null,mono:null}}
 const bg=pal.light;return {bg,align:'center',upper:false,head:P.ink(bg,pal,pal.primary,pal.dark),name:P.ink(bg,pal,pal.dark),desc:P.ink(bg,pal,pal.secondary,pal.dark),price:P.ink(bg,pal,pal.primary,pal.dark),mark:P.ink(bg,pal,pal.secondary,pal.dark),rule:pal.accent,frame:pal.primary,mono:null}}
function sizesOf(F,t,refine){const ref=refineOf(refine),D=DENSITIES[ref.density],k=F.scale,kt=k*D.k,bar=t==='bar',z=v=>Math.max(MIN_PT,Math.round(v*kt*100)/100);
 return {title:z(bar?22:24),sub:z(10.5),section:z(bar?12.5:14),name:z(bar?9.6:11),desc:z(bar?7.8:8.6),price:z(bar?9.6:11),mark:z(7.2),legendTitle:z(8.4),legend:z(7),foot:z(7),gap:(bar?2.4:3.6)*k*D.g,before:(bar?4.2:6)*k*D.g,ref}}
// One voice as a block of width w (positions from 0,0).
function itemBlock(x,w,st,S){const ref=S.ref||refineOf(),it=ref.descriptions?x:{...x,description:''},pr=priceLabel(it),mk=markersOf(it),name=it.name+(it.frozen?'*':'');
 if(st.align==='center'){const L=[...wrapL(name,S.name,w,true).map(s=>({s,size:S.name,bold:true,fill:st.name,label:'Nome',align:'center',lead:1.18})),
   ...wrapL(it.description,S.desc,w*.92,false).map(s=>({s,size:S.desc,fill:st.desc,label:'Descrizione',align:'center',lead:1.32})),
   ...(pr?[{s:pr,size:S.price,bold:true,fill:st.price,label:'Prezzo',align:'center',lead:1.35}]:[]),
   ...wrapL(mk,S.mark,w,false).map(s=>({s,size:S.mark,fill:st.mark,label:'Allergeni e note',align:'center',lead:1.35}))];
  const r=stack(L,w);return {kind:'item',id:it.id,items:r.items,h:r.h+S.gap}}
 const pw=pr?wmm(pr,S.price,true)+3:0,inner=w-pw;
 const L=[...wrapL(st.upper?name:name,S.name,inner,true).map(s=>({s,size:S.name,bold:true,fill:st.name,label:'Nome',lead:1.18})),
  ...wrapL(it.description,S.desc,inner,false).map(s=>({s,size:S.desc,fill:st.desc,label:'Descrizione',lead:1.32})),
  ...wrapL(mk,S.mark,inner,false).map(s=>({s,size:S.mark,fill:st.mark,label:'Allergeni e note',lead:1.38}))];
 const r=stack(L,w);if(pr){const px=w-wmm(pr,S.price,true),y=r.items[0].y;r.items.push({t:'text',x:px,y,s:pr,size:S.price,bold:true,fill:st.price,label:'Prezzo',flow:true});
  // dotted leaders from the end of the name's first line to the price (refinement «Puntini fino al prezzo»)
  if(ref.leaders){const x1=r.items[0].x+wmm(r.items[0].s,S.name,true)+1.4,x2=px-1.4;if(x2-x1>=4)r.items.push({t:'line',x1,y1:y-.25,x2,y2:y-.25,stroke:st.mark,width:.7,dash:[.7,1.6],label:'Puntini'})}}
 return {kind:'item',id:it.id,items:r.items,h:r.h+S.gap}}
function sectionBlock(title,w,st,S,dir,cont){const s=(st.upper?title.toUpperCase():title)+(cont?' · segue':''),items=[];
 if(dir==='classico'){const r=stack(wrapL(s,S.section,w,true).map(x=>({s:x,size:S.section,bold:true,fill:st.head,label:'Sezione',align:'center',lead:1.2})),w);items.push(...r.items);
  const y=r.h+2.2;items.push({t:'line',x1:w/2-9,y1:y,x2:w/2+9,y2:y,stroke:st.rule,width:.8});return {kind:'section',items,h:y+4}}
 if(dir==='moderno'){const r=stack(wrapL(s,S.section,w-5,true).map(x=>({s:x,size:S.section,bold:true,fill:st.head,label:'Sezione',lead:1.2})),w);r.items.forEach(i=>i.x+=4.5);
  items.push({t:'rect',x:0,y:r.items[0].y-cap(S.section),w:2.2,h:cap(S.section),fill:st.rule},...r.items);const y=r.h+2.2;items.push({t:'line',x1:0,y1:y,x2:w,y2:y,stroke:st.rule,width:.5});return {kind:'section',items,h:y+3.6}}
 const r=stack(wrapL(s,S.section,w,true).map(x=>({s:x,size:S.section,bold:true,fill:st.head,label:'Sezione',lead:1.2})),w);items.push(...r.items);const y=r.h+2;
 items.push({t:'line',x1:0,y1:y,x2:14,y2:y,stroke:st.rule,width:1});return {kind:'section',items,h:y+3.6}}
// The legend: numbered allergens (when one is used), tags, the frozen note, the staff note and the footnote.
function legendBlock(m,w,st,S){const items=[],al=usedAllergens(m.items),tg=usedTags(m.items),fr=anyFrozen(m.items);let y=0;
 items.push({t:'line',x1:0,y1:0,x2:w,y2:0,stroke:st.rule,width:.5});y=2.4;
 const head=(s,label='Legenda allergeni')=>{const r=stack(wrapL(s,S.legendTitle,w,true).map(x=>({s:x,size:S.legendTitle,bold:true,fill:st.head,label,lead:1.3})),w);r.items.forEach(i=>{i.y+=y;items.push(i)});y+=r.h+1.6};
 const cl=coverLine(m);if(cl){head(cl,'Coperto e servizio');y+=.6}
 if(al.length){head(LEGEND_TITLE);const lc=Math.max(1,Math.min(3,Math.floor(w/56))),rows=Math.ceil(14/lc),cw=w/lc,lh=lead(S.legend,1.42),nw=wmm('14',S.legend,true)+1.6;
  ALLERGENS.forEach((a,i)=>{const c=Math.floor(i/rows),r=i%rows,bx=c*cw,by=y+cap(S.legend)+r*lh,room=cw-nw-2,paren=/\(([^)]+)\)$/.exec(a.label),mid=paren?a.short+' ('+paren[1]+')':a.short,label=[a.label,mid,a.short].find(x=>wmm(x,S.legend,false)<=room)||a.short;
   items.push({t:'text',x:bx+nw-1.6-wmm(String(a.n),S.legend,true),y:by,s:String(a.n),size:S.legend,bold:true,fill:st.head,label:'Legenda allergeni',flow:true},{t:'text',x:bx+nw,y:by,s:label,size:S.legend,bold:false,fill:st.mark,label:'Legenda allergeni',flow:true})});
  y+=rows*lh+1.2}
 const extra=[];
 if(tg.length)extra.push(tg.map(id=>tag(id).code+' '+tag(id).label.toLowerCase()).join('  ·  '));
 if(fr)extra.push(FROZEN_NOTE);
 extra.push(INFO_NOTE);if(clean(m.footnote))extra.push(clean(m.footnote));
 const L=extra.flatMap(s=>wrapL(s,S.legend,w,false).map(x=>({s:x,size:S.legend,fill:st.mark,label:s===FROZEN_NOTE?'Nota surgelati':s===INFO_NOTE?'Nota allergeni':'Note',lead:1.42})));
 const r=stack(L,w);r.items.forEach(i=>{i.y+=y;items.push(i)});y+=r.h;
 return {kind:'legend',items,h:y+1}}
// The QR on the table version: white square with its quiet zone, then two lines and the address.
// The QR: a white square with its quiet zone and, beside it (below it when `big`: a page of its own), two lines and the address.
function qrBlock(qr,url,w,st,S,k,big){const side=big?Math.min(62*k,w*.62):Math.min(26*k+2,w*.4),n=qr.size+2*QR().QUIET,mod=side/n,x0=big?(w-side)/2:0,items=[{t:'rect',x:x0,y:0,w:side,h:side,fill:'#FFFFFF'}];
 for(const [x,y,ww,hh] of QR().rects(qr))items.push({t:'rect',x:x0+(x+QR().QUIET)*mod,y:(y+QR().QUIET)*mod,w:ww*mod,h:hh*mod,fill:'#000000',qr:true});
 const tw=big?w:w-side-4,align=big?'center':'left',L=[{s:'Il menu sul telefono',size:big?S.section:S.legendTitle+1,bold:true,fill:st.head,label:'QR',lead:1.2,align},
  ...wrapL('Inquadra il codice: allergeni e filtri per vegetariani, vegani e senza glutine.',big?S.desc:S.legend,tw,false).map(s=>({s,size:big?S.desc:S.legend,fill:st.mark,label:'QR',lead:1.45,align})),
  ...wrapL(url.replace(/^https?:\/\//,''),big?S.desc:S.legend,tw,false).map(s=>({s,size:big?S.desc:S.legend,bold:true,fill:st.mark,label:'QR',lead:1.45,align}))];
 const r=stack(L,tw);if(big){r.items.forEach(i=>{i.y+=side+6*k;items.push(i)});return {kind:'qr',items,h:side+6*k+r.h+1}}
 r.items.forEach(i=>{i.x+=side+4;i.y+=Math.max(0,(side-r.h)/2);items.push(i)});return {kind:'qr',items,h:Math.max(side,r.h)+1}}
// The whole menu in one format: header, voices flowing in columns (never split), a section's title kept with its first
// voice and repeated «· segue» on a new page, legend (and QR) at the end, footer with page numbers on every page.
// opts.face: the page format when it is not the sheet (the A4 faces of the folded A3); opts.cover: page 1 is a cover
// (logo, title, subtitle, coperto); opts.pad: the number of faces to fill (blank faces added, the QR big on the last one).
function flowMenu(m,formatId,{qr=null,qrFirst=false,limit=0,face=null,cover=false,pad=0}={}){const P=P_(),F=face||format(formatId),t=type(m.type).id,dir=direction(m.direction).id,pal=m.brand.palette,st=styleOf(dir,pal),S=sizesOf(F,t,m.refine),W=F.w,H=F.h,M=F.margin,B=P.BLEED,k=F.scale;
 const name=clean(m.brand.name)||'Menu',values={name},b=P.builder({id:'menu-'+F.id,w:W,h:H},m.brand,values,M,{variant:dir==='moderno'?'minimal':dir==='lavagna'?'bold':'classic'});
 const cols=F.cols||(t==='bar'&&F.barCols)||1,gap=8*k,cw=(W-2*M-gap*(cols-1))/cols,footY=H-Math.max(5.5,M*.5),bottom=footY-cap(S.foot)-4*k;
 const pages=[],warnings=[];let page=null,col=0,y=0,top=0;
 const decorate=(items,first)=>{b.items=items;items.push({t:'rect',x:-B,y:-B,w:W+2*B,h:H+2*B,fill:st.bg,bg:true});
  if(dir==='moderno')items.push({t:'rect',x:-B,y:-B,w:W+2*B,h:B+(first?7:4)*k,fill:st.band,band:true});
  if(st.frame){const i=6*k;items.push({t:'line',x1:i,y1:i,x2:W-i,y2:i,stroke:st.frame,width:dir==='lavagna'?.9:.6},{t:'line',x1:i,y1:H-i,x2:W-i,y2:H-i,stroke:st.frame,width:dir==='lavagna'?.9:.6},{t:'line',x1:i,y1:i,x2:i,y2:H-i,stroke:st.frame,width:dir==='lavagna'?.9:.6},{t:'line',x1:W-i,y1:i,x2:W-i,y2:H-i,stroke:st.frame,width:dir==='lavagna'?.9:.6})}};
 const header=(items,first)=>{let yy=M+(dir==='moderno'?3*k:1*k);const align=st.align;
  if(first){const lh=(dir==='moderno'?14:17)*k;b.logo(M,yy,align==='center'?W-2*M:Math.min(70*k,W-2*M),lh,{align:align==='center'?'center':'left',bg:st.bg,mono:st.mono||undefined});yy+=lh+5*k;
   const tl=stack([...wrapL(st.upper?m.title.toUpperCase():m.title,S.title,W-2*M,true).map(s=>({s,size:S.title,bold:true,fill:st.head,label:'Titolo',align,lead:1.1})),
    ...wrapL(m.subtitle,S.sub,W-2*M,false).map(s=>({s,size:S.sub,fill:st.desc,label:'Sottotitolo',align,lead:1.5}))],W-2*M);tl.items.forEach(i=>{items.push(move({...i,flow:false},M,yy))});yy+=tl.h+3.5*k;
   const rw=align==='center'?24*k:16*k,rx=align==='center'?(W-rw)/2:M;items.push({t:'line',x1:rx,y1:yy,x2:rx+rw,y2:yy,stroke:st.rule,width:1.2});return yy+6*k}
  const r=stack([{s:name,size:S.foot+1,bold:true,fill:st.head,label:'Intestazione',align}],W-2*M);r.items.forEach(i=>items.push(move({...i,flow:false},M,yy)));yy+=r.h+2.4;items.push({t:'line',x1:M,y1:yy,x2:W-M,y2:yy,stroke:st.rule,width:.5});return yy+5*k};
 const newPage=()=>{const items=[],first=!pages.length;decorate(items,first);const decor=items.length;top=header(items,first);page={label:'Pagina '+(pages.length+1),w:W,h:H,items,folds:[],hidden:null,contentTop:top,contentBottom:bottom,margin:M,decor};pages.push(page);col=0;y=top};
 const colX=()=>M+col*(cw+gap);
 const ends=[],next=()=>{col++;if(col>=cols){ends[pages.length-1]=y;newPage()}else y=top};
 const fits=(h,before)=>y+(y>top+.01?before:0)+h<=bottom-limit+1e-6;
 const put=(bl,before)=>{const pre=y>top+.01?before:0;for(const it of bl.items)page.items.push(move(it,colX(),y+pre));y+=pre+bl.h};
 newPage();
 const contactsBl=(w,align)=>stack(contactLinesOf(m).map(s=>({s,size:S.desc,fill:st.desc,label:'Contatti',align,lead:1.5})),w);
 if(cover){// the cover: logo, title and subtitle lowered to the optical centre, the coperto line and the contacts at the foot
  const p0=page,dy=Math.max(0,(H-2*M-(top-M))*.3);p0.items=p0.items.slice(0,p0.decor).concat(p0.items.slice(p0.decor).map(i=>move(i,0,dy)));
  const cb=contactsBl(W-2*M,st.align==='center'?'center':'left');cb.items.forEach(i=>p0.items.push(move({...i,flow:false},M,H-M-6*k-cb.h)));
  p0.cover=true;newPage()}
 if(qr&&qrFirst){put(qrBlock(qr.qr,qr.url,cw,st,S,k),0);y+=S.before}
 const room=bottom-top-14*k,placed=[];let lastSection=null,legendPage=0;
 const shrink=(bl,it)=>{// a voice taller than a whole column: its description is cut with «…» and said
  const st2={...it,description:it.description};let d=st2.description;while(bl.h>room&&d.length>10){d=d.slice(0,Math.floor(d.length*.85)).replace(/\s+\S*$/,'')+'…';bl=itemBlock({...it,description:d},cw,st,S)}
  warnings.push({kind:'cut',text:'«'+it.name+'»: descrizione accorciata per stare nella colonna ('+F.title+').'});return bl};
 for(const s of sections(m.items)){let head=s.title?sectionBlock(s.title,cw,st,S,dir,false):null;
  s.items.forEach((it,i)=>{let bl=itemBlock(it,cw,st,S);if(bl.h>room)bl=shrink(bl,it);
   if(i===0&&head){if(!fits(head.h+bl.h,S.before))next();put(head,S.before);lastSection=pages.length}
   else if(!fits(bl.h,0)){const before=pages.length;next();if(s.title&&pages.length>before)put(sectionBlock(s.title,cw,st,S,dir,true),0)}
   put(bl,0);placed.push(it.id)})}
 const legend=legendBlock(m,cw,st,S);if(!fits(legend.h,S.before))next();put(legend,S.before);legendPage=pages.length;
 let qrAlone=false;const qrBack=!!(qr&&!qrFirst&&pad&&pages.length<pad);
 if(qr&&!qrFirst&&!qrBack){const q=qrBlock(qr.qr,qr.url,cw,st,S,k);
  if(fits(q.h,S.before))put(q,S.before);
  else{// in the room left at the end of an earlier page (its last column), else on a page of its own
   const i=ends.findIndex(e=>e!=null&&e+S.before+q.h<=bottom-limit+1e-6);
   if(i>=0){for(const it of q.items)pages[i].items.push(move(it,M+(cols-1)*(cw+gap),ends[i]+S.before));ends[i]+=S.before+q.h}else{next();qrAlone=true;const qb=qrBlock(qr.qr,qr.url,cw,st,S,k,true);y=top+Math.max(0,(bottom-top-qb.h)/3);put(qb,0)}}}
 // the faces still empty (folded A3): blank, the last one with the QR big and the contacts (the back of the menu)
 const natural=pages.length;while(pad&&pages.length<pad){col=cols;next()}
 if(qrBack){const qb=qrBlock(qr.qr,qr.url,cw,st,S,k,true),cb=contactsBl(cw,'center');col=0;y=top+Math.max(0,(bottom-top-qb.h-cb.h-8*k)/3);put(qb,0);if(cb.items.length){y+=8*k;put({items:cb.items.map(i=>({...i,flow:true})),h:cb.h},0)}}
 // footers: name, «legenda a pagina N» on the other pages, page numbers (none on a cover)
 const n=pages.length,hasAl=usedAllergens(m.items).length>0;
 pages.forEach((p,i)=>{if(p.cover)return;const it=(s,x,align,bold)=>{const w=wmm(s,S.foot,bold);p.items.push({t:'text',x:align==='right'?W-M-w:align==='center'?(W-w)/2:x,y:footY,s,size:S.foot,bold:!!bold,fill:st.mark,label:'Piè di pagina'})};
  it(name,M,'left',true);if(n>1)it((i+1)+' / '+n,0,'right',false);if(hasAl&&n>1&&i+1!==legendPage)it('Allergeni: legenda a pagina '+legendPage,0,'center',false)});
 const doc={format:'menu-'+F.id,formatId:F.id,title:m.title+' · '+name+' · '+F.title,variant:dir,margin:M,brand:m.brand,values,dpi:300,pages,warnings,placed,total:m.items.length,legendPage,cols,qrAlone,qrFirst:!!qrFirst,natural};
 doc.warnings=doc.warnings.concat(P.safeArea(doc),P.glyphs(doc));return doc}
// The menu in one format: the QR goes first when at the end it would sit alone on a page; a one-page menu in columns
// is balanced (the lowest column bottom that keeps it on one page).
function layoutMenu(m,formatId,opts={}){let doc=flowMenu(m,formatId,opts);
 if(doc.qrAlone){const alt=flowMenu(m,formatId,{...opts,qrFirst:true});if(alt.pages.length<doc.pages.length)doc=alt}
 if(doc.cols>1&&doc.pages.length===1){const p=doc.pages[0];let lo=0,hi=Math.max(0,p.contentBottom-p.contentTop-20),best=doc;
  for(let i=0;i<12&&hi-lo>1;i++){const mid=(lo+hi)/2,d=flowMenu(m,formatId,{...opts,qrFirst:doc.qrFirst,limit:mid});if(d.pages.length===1){best=d;lo=mid}else hi=mid}doc=best}
 return doc}
// ---- the folded A3: four A4 faces (1 cover, 2-3 inside, 4 back with the QR), imposed on two A3 sheets ----
// Outside sheet: face 4 on the left, face 1 (the cover) on the right; inside sheet: faces 2 and 3. Fold in the middle,
// printed front and back turning on the long edge.
const SHEETS=Object.freeze([{label:'Esterno: facciate 4 e 1',faces:[3,0]},{label:'Interno: facciate 2 e 3',faces:[1,2]}]);
function impose(reading,F){const P=P_(),B=P.BLEED,fw=reading.pages[0].w,bg=reading.pages[0].items.find(i=>i.t==='rect'&&i.bg===true);
 const pages=SHEETS.map(sh=>{const items=[{t:'rect',x:-B,y:-B,w:F.w+2*B,h:F.h+2*B,fill:bg?bg.fill:'#FFFFFF',bg:true}];
  sh.faces.forEach((fi,side)=>{for(const it of reading.pages[fi].items){if(it.t==='rect'&&it.bg===true)continue;let o=move(it,side*fw,0);if(it.band)o={...o,x:side?fw:-B,w:fw+B};items.push(o)}});
  return {label:sh.label,w:F.w,h:F.h,items,folds:[fw],hidden:null,margin:reading.margin,contentTop:0,contentBottom:F.h}});
 return {...reading,format:'menu-'+F.id,formatId:F.id,pages,reading}}
function layoutFolded(m,{qr=null}={}){const F=format('a3-piegato'),face={...format('a4'),id:F.id,title:F.title,file:F.file};
 let reading=flowMenu(m,F.id,{qr,face,cover:true,pad:F.faces});
 // the voices spread over both inside faces (the shortest column that keeps them on faces 2 and 3)
 if(reading.natural<=F.faces-1){const p=reading.pages[1];let lo=0,hi=Math.max(0,p.contentBottom-p.contentTop-30),best=null;
  for(let i=0;i<14&&hi-lo>1;i++){const mid=(lo+hi)/2,d=flowMenu(m,F.id,{qr,face,cover:true,pad:F.faces,limit:mid});if(d.natural<=F.faces-1){best=d;lo=mid}else hi=mid}
  if(best&&best.natural===F.faces-1)reading=best}
 if(reading.pages.length!==F.faces)return {...reading,faceCount:reading.pages.length,tooMany:true};
 return {...impose(reading,F),faceCount:F.faces}}
// ---- the table tent: an A5 folded in half, two 148 × 105 faces with the QR; the upper face is upside down ----
function layoutTent(m,{qr=null}={}){const P=P_(),F=format('segnatavolo'),dir=direction(m.direction).id,pal=m.brand.palette,st=styleOf(dir,pal),W=F.w,H=F.h,fh=F.face,M=F.margin,B=P.BLEED;
 const name=clean(m.brand.name)||'Menu',values={name},b=P.builder({id:'menu-'+F.id,w:W,h:H},m.brand,values,M,{variant:dir==='moderno'?'minimal':dir==='lavagna'?'bold':'classic'}),cl=coverLine(m);
 let k=F.scale,face=[];
 for(let tries=0;tries<5;tries++){face=[];b.items=face;const z=v=>Math.max(MIN_PT,Math.round(v*k*100)/100);
  const side=qr?Math.min(fh-2*M-2,58):0,qx=W-M-side,qy=(fh-side)/2,tw=qr?qx-M-6:W-2*M;
  if(qr){const n=qr.qr.size+2*QR().QUIET,mod=side/n;face.push({t:'rect',x:qx,y:qy,w:side,h:side,fill:'#FFFFFF'});
   for(const [x,y,ww,hh] of QR().rects(qr.qr))face.push({t:'rect',x:qx+(x+QR().QUIET)*mod,y:qy+(y+QR().QUIET)*mod,w:ww*mod,h:hh*mod,fill:'#000000',qr:true})}
  const lh=13*k;b.logo(M,M,tw,lh,{align:'left',bg:st.bg,mono:st.mono||undefined});
  const L=[{s:qr?'Il menu sul telefono':'Il nostro menu',size:z(14),bold:true,fill:st.head,label:'Segnatavolo',lead:1.2},
   ...wrapL(qr?'Inquadra il QR: prezzi, allergeni e filtri per vegetariani, vegani e senza glutine.':'Chiedi il menu al personale.',z(8.4),tw,false).map(s=>({s,size:z(8.4),fill:st.desc,label:'Segnatavolo',lead:1.4})),
   ...(cl?wrapL(cl,z(8.8),tw,true).map(s=>({s,size:z(8.8),bold:true,fill:st.price,label:'Coperto e servizio',lead:1.6})):[]),
   ...(qr?wrapL(qr.url.replace(/^https?:\/\//,''),z(7.4),tw,true).map(s=>({s,size:z(7.4),bold:true,fill:st.mark,label:'Indirizzo del menu',lead:1.6})):[]),
   ...wrapL(INFO_NOTE,z(6.6),tw,false).map(s=>({s,size:z(6.6),fill:st.mark,label:'Nota allergeni',lead:1.6}))];
  const r=stack(L,tw),top=M+lh+4*k;r.items.forEach(i=>face.push(move(i,M,top)));
  if(top+r.h<=fh-M+1e-6)break;k*=.9}
 // the lower face as it is, the upper one turned by 180° (it reads right once the card stands folded)
 const lower={x:0,y:fh,w:W,h:fh},upper={x:0,y:0,w:W,h:fh};
 const turn=it=>it.t==='rect'?{...it,x:W-it.x-it.w,y:fh-it.y-it.h}:it.t==='line'?{...it,x1:W-it.x1,y1:fh-it.y1,x2:W-it.x2,y2:fh-it.y2}:it.t==='text'?{...it,x:W-it.x,y:fh-it.y,rot:180}:{...it,x:W-it.x-it.w,y:fh-it.y-it.h,rot:180};
 const items=[{t:'rect',x:-B,y:-B,w:W+2*B,h:H+2*B,fill:st.bg,bg:true},...face.map(it=>({...turn(it),area:upper})),...face.map(it=>({...move(it,0,fh),area:lower}))];
 if(st.frame)for(const y0 of [0,fh]){const i=5,a=y0+i,c=y0+fh-i;items.push({t:'line',x1:i,y1:a,x2:W-i,y2:a,stroke:st.frame,width:.6},{t:'line',x1:i,y1:c,x2:W-i,y2:c,stroke:st.frame,width:.6},{t:'line',x1:i,y1:a,x2:i,y2:c,stroke:st.frame,width:.6},{t:'line',x1:W-i,y1:a,x2:W-i,y2:c,stroke:st.frame,width:.6})}
 const page={label:'Segnatavolo: piega a metà sulla linea tratteggiata',w:W,h:H,items,folds:[],foldsY:[fh],hidden:null,margin:M,contentTop:0,contentBottom:H};
 const doc={format:'menu-'+F.id,formatId:F.id,title:m.title+' · '+name+' · '+F.title,variant:dir,margin:M,brand:m.brand,values,dpi:300,pages:[page],warnings:[],placed:[],total:0,legendPage:0,cols:1,tent:true,hasQr:!!qr};
 doc.warnings=P.safeArea(doc).concat(P.glyphs(doc));return doc}
// Every format by its kind.
function layoutFormat(m,id,opts={}){const F=format(id);return F.kind==='folded'?layoutFolded(m,opts):F.kind==='tent'?layoutTent(m,opts):layoutMenu(m,id,opts)}
// The box of a text item (rot 180: to the left of x, above y upside down).
const textBox=it=>{const w=wmm(it.s,it.size,it.bold);return it.rot===180?{x0:it.x-w,x1:it.x,y0:it.y-dsc(it.size),y1:it.y+cap(it.size)}:{x0:it.x,x1:it.x+w,y0:it.y-cap(it.size),y1:it.y+dsc(it.size)}};
// Text outside the column area or the page: [{page, label, text}]. The folded A3 is checked on its A4 faces; the tent
// face by face (nothing across the fold).
function fitProblems(doc){if(doc.tent){const out=[];doc.pages.forEach((p,pi)=>p.items.forEach(it=>{if(it.t!=='text'||!it.area)return;const b=textBox(it),a=it.area;
  if(b.x0<a.x-.05||b.x1>a.x+a.w+.05||b.y0<a.y-.05||b.y1>a.y+a.h+.05)out.push({page:pi+1,label:it.label,text:'Segnatavolo: «'+it.s.slice(0,40)+'» passa sulla piega o esce dalla faccia.'})}));return out}
 if(doc.reading)doc=doc.reading;
 const out=[];doc.pages.forEach((p,pi)=>p.items.forEach(it=>{if(it.t!=='text'||!it.flow)return;const w=wmm(it.s,it.size,it.bold),x0=it.x,x1=it.x+w,y0=it.y-cap(it.size),y1=it.y+dsc(it.size);
 if(x0<p.margin-.05||x1>p.w-p.margin+.05||y0<p.contentTop-.05||y1>p.contentBottom+.05)out.push({page:pi+1,label:it.label,text:'Pagina '+(pi+1)+': «'+it.s.slice(0,40)+'» esce dall’area del testo.'})}));
 if(doc.placed.length!==doc.total)out.push({page:0,label:'Voci',text:(doc.total-doc.placed.length)+' voci non impaginate.'});return out}
// Page sizes of the print PDF in points (MediaBox: trim + bleed + slug).
function pdfBoxes(w,h){const P=P_(),o=P.BLEED+P.SLUG,pt=x=>Math.round(P.mmToPt(x)*1000)/1000;
 return {media:[0,0,pt(w+2*o),pt(h+2*o)],bleed:[pt(P.SLUG),pt(P.SLUG),pt(P.SLUG+w+2*P.BLEED),pt(P.SLUG+h+2*P.BLEED)],trim:[pt(o),pt(o),pt(o+w),pt(o+h)]}}

// ---- the phone page: one HTML file, no external request ----
function logoData(svg){const s=String(svg||'');if(!s||/(?:href|src)\s*=\s*["']?\s*(?:https?:|\/\/)|url\(\s*["']?(?:https?:|\/\/)|@import/i.test(s))return '';
 const bytes=new TextEncoder().encode(s);let bin='';for(let i=0;i<bytes.length;i+=8192)bin+=String.fromCharCode.apply(null,bytes.subarray(i,i+8192));
 const b64=typeof root.btoa==='function'?root.btoa(bin):Buffer.from(bytes).toString('base64');return 'data:image/svg+xml;base64,'+b64}
function htmlColours(m){const P=P_(),pal=m.brand.palette,L=pal.light,D=pal.dark,W='#FFFFFF';
 return {light:{bg:L,card:W,text:P.ink(L,pal,pal.dark),soft:P.ink(L,pal,pal.secondary,pal.dark),head:P.ink(L,pal,pal.primary,pal.dark),price:P.ink(W,pal,pal.primary,pal.dark),line:'rgba(0,0,0,.12)',chip:P.ink(W,pal,pal.primary,pal.dark),chipText:P.ink(P.ink(W,pal,pal.primary,pal.dark),pal,W,L)},
  dark:{bg:D,card:'#000000',text:P.ink(D,pal,pal.light,W),soft:P.ink(D,pal,pal.light,W),head:P.ink(D,pal,pal.accent,pal.light,W),price:P.ink('#000000',pal,pal.accent,pal.light,W),line:'rgba(255,255,255,.16)',chip:P.ink(D,pal,pal.accent,pal.light,W),chipText:P.ink(P.ink(D,pal,pal.accent,pal.light,W),pal,D,'#000000')}}}
function htmlPage(m,{date=new Date()}={}){const c=htmlColours(m),dir=direction(m.direction).id,name=clean(m.brand.name)||'Menu',secs=sections(m.items),al=usedAllergens(m.items),tg=usedTags(m.items),logo=logoData(m.brand.logo);
 const vars=o=>'--bg:'+o.bg+';--card:'+o.card+';--text:'+o.text+';--soft:'+o.soft+';--head:'+o.head+';--price:'+o.price+';--line:'+o.line+';--chip:'+o.chip+';--chip-text:'+o.chipText+';';
 const font=f=>/^[A-Za-z0-9 ]{2,40}$/.test(clean(f))?'"'+clean(f)+'",':'';
 const css=':root{'+vars(c.light)+'color-scheme:light dark}@media (prefers-color-scheme:dark){:root:not([data-theme=light]){'+vars(c.dark)+'}}:root[data-theme=dark]{'+vars(c.dark)+'}:root[data-theme=light]{'+vars(c.light)+'}'+
  '*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 '+font(m.brand.fonts.body)+'system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}'+
  'h1,h2,h3{font-family:'+font(m.brand.fonts.heading)+'Georgia,"Times New Roman",serif;color:var(--head);line-height:1.2;margin:0}main{max-width:760px;margin:0 auto;padding:16px 16px 48px}'+
  'header{display:flex;flex-direction:column;align-items:'+(dir==='moderno'?'flex-start':'center')+';gap:8px;padding:20px 0 12px;text-align:'+(dir==='moderno'?'left':'center')+'}header img{max-width:220px;max-height:72px;width:auto;height:auto}'+
  'header h1{font-size:30px}header p{margin:0;color:var(--soft)}.bar{position:sticky;top:0;z-index:2;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 0;background:var(--bg);border-bottom:1px solid var(--line)}'+
  '.bar details{flex:1 1 auto}.bar summary{cursor:pointer;min-height:44px;display:flex;align-items:center;font-weight:600}fieldset{border:0;margin:0;padding:6px 0;display:flex;flex-wrap:wrap;gap:6px}legend{font-size:14px;color:var(--soft);padding:0 0 4px}'+
  'label.f{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 12px;border:1px solid var(--line);border-radius:999px;font-size:14px;cursor:pointer}label.f input{width:18px;height:18px;margin:0;accent-color:var(--head)}'+
  'button{font:inherit;min-height:44px;padding:0 14px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--text);cursor:pointer}nav{display:flex;flex-wrap:wrap;gap:6px 14px;padding:12px 0}nav a{color:var(--head);font-weight:600;text-decoration:none;min-height:44px;display:inline-flex;align-items:center}'+
  'section{padding:18px 0 6px}section h2{font-size:22px;padding-bottom:6px;border-bottom:2px solid var(--line);'+(dir==='lavagna'?'text-transform:uppercase;letter-spacing:.04em;':'')+'}ul{list-style:none;margin:0;padding:0}'+
  'li.v{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 16px;padding:12px 0;border-bottom:1px solid var(--line)}li.v[hidden]{display:none}.n{font-weight:700}.p{font-weight:700;color:var(--price);white-space:nowrap;text-align:right}'+
  '.d{grid-column:1/-1;margin:0;color:var(--soft);font-size:15px}.m{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;font-size:13px}.m span{padding:2px 8px;border-radius:999px;border:1px solid var(--line)}.m .t{background:var(--chip);color:var(--chip-text);border-color:transparent}'+
  '.m .ask{border-style:dashed}#status{min-height:24px;margin:8px 0 0;color:var(--soft);font-size:14px}.legend{margin-top:28px;padding:16px;border:1px solid var(--line);border-radius:14px;background:var(--card)}'+
  '.legend ol{margin:8px 0;padding-left:28px;columns:2;column-gap:24px}.legend li{break-inside:avoid;font-size:14px}.legend p{margin:6px 0;font-size:14px;color:var(--soft)}footer{margin-top:24px;text-align:center;color:var(--soft);font-size:14px}'+
  '@media (max-width:520px){header h1{font-size:26px}.legend ol{columns:1}}';
 const allergenChips=it=>it.declared?it.allergens.map(n=>'<span title="'+esc(allergen(n).label)+'">'+n+' '+esc(allergen(n).short)+'</span>').join(''):'<span class="ask">Allergeni: chiedi al personale</span>';
 const li=it=>'<li class="v" data-a="'+it.allergens.join(' ')+'" data-d="'+(it.declared?1:0)+'" data-t="'+it.tags.join(' ')+'"><span class="n">'+esc(it.name)+(it.frozen?'*':'')+'</span><span class="p">'+esc(priceLabel(it))+'</span>'+
  (it.description?'<p class="d">'+esc(it.description)+'</p>':'')+'<div class="m">'+allergenChips(it)+it.tags.map(x=>'<span class="t">'+esc(tag(x).label)+'</span>').join('')+(it.notes?'<span>'+esc(it.notes)+'</span>':'')+'</div></li>';
 const secHtml=secs.map((s,i)=>'<section id="s'+(i+1)+'" aria-labelledby="h'+(i+1)+'">'+(s.title?'<h2 id="h'+(i+1)+'">'+esc(s.title)+'</h2>':'<h2 id="h'+(i+1)+'" class="sr">'+esc(m.title)+'</h2>')+'<ul>'+s.items.map(li).join('')+'</ul></section>').join('');
 const filters='<div class="bar"><details><summary>Filtra per allergeni e dieta</summary>'+(al.length?'<fieldset><legend>Nascondi i piatti con</legend>'+al.map(n=>'<label class="f"><input type="checkbox" name="no" value="'+n+'">'+esc(allergen(n).short)+'</label>').join('')+'</fieldset>':'')+
  (tg.filter(x=>x!=='piccante').length?'<fieldset><legend>Mostra solo</legend>'+tg.filter(x=>x!=='piccante').map(x=>'<label class="f"><input type="checkbox" name="only" value="'+x+'">'+esc(tag(x).label)+'</label>').join('')+'</fieldset>':'')+'</details><button type="button" id="theme" aria-label="Tema chiaro o scuro">Tema: auto</button><p id="status" role="status"></p></div>';
 const cl=coverLine(m);
 const legend='<aside class="legend" aria-labelledby="lg"><h3 id="lg">'+(al.length?esc(LEGEND_TITLE):'Note')+'</h3>'+(cl?'<p class="cv">'+esc(cl)+'</p>':'')+(al.length?'<ol>'+ALLERGENS.map(a=>'<li value="'+a.n+'">'+esc(a.label)+'</li>').join('')+'</ol>':'')+
  (tg.length?'<p>'+tg.map(x=>esc(tag(x).code+' '+tag(x).label.toLowerCase())).join(' · ')+'</p>':'')+(anyFrozen(m.items)?'<p>'+esc(FROZEN_NOTE)+'</p>':'')+'<p>'+esc(INFO_NOTE)+'</p>'+(clean(m.footnote)?'<p>'+esc(m.footnote)+'</p>':'')+'</aside>';
 const contacts=['address','phone','email','website'].map(k=>clean((m.contacts||{})[k]).replace(/^https?:\/\//i,'')).filter(Boolean);
 const js='(function(){var root=document.documentElement,b=document.getElementById("theme"),modes=["auto","light","dark"],names={auto:"auto",light:"chiaro",dark:"scuro"},mode="auto";try{mode=localStorage.getItem("menu-theme")||"auto"}catch(e){}'+
  'function setMode(x){mode=modes.indexOf(x)<0?"auto":x;if(mode==="auto")root.removeAttribute("data-theme");else root.setAttribute("data-theme",mode);b.textContent="Tema: "+names[mode];try{localStorage.setItem("menu-theme",mode)}catch(e){}}setMode(mode);b.onclick=function(){setMode(modes[(modes.indexOf(mode)+1)%3])};'+
  'var st=document.getElementById("status");function apply(){var no=[].map.call(document.querySelectorAll("input[name=no]:checked"),function(i){return i.value}),only=[].map.call(document.querySelectorAll("input[name=only]:checked"),function(i){return i.value}),hid=0,ask=0;'+
  '[].forEach.call(document.querySelectorAll("li.v"),function(li){var a=li.getAttribute("data-a").split(" ").filter(Boolean),t=li.getAttribute("data-t").split(" "),ok=true;if(no.length&&li.getAttribute("data-d")!=="1"){ok=false;ask++}else if(no.some(function(n){return a.indexOf(n)>=0}))ok=false;if(only.some(function(x){return t.indexOf(x)<0}))ok=false;li.hidden=!ok;if(!ok)hid++});'+
  '[].forEach.call(document.querySelectorAll("main section"),function(s){s.hidden=!s.querySelector("li.v:not([hidden])")});st.textContent=hid?hid+(hid===1?" voce nascosta":" voci nascoste")+(ask?" (di cui "+ask+" senza allergeni indicati: chiedi al personale)":"")+".":""}'+
  'document.addEventListener("change",function(e){if(e.target.name==="no"||e.target.name==="only")apply()})})();';
 return '<!doctype html>\n<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="generator" content="RADIX Menu e listino '+date.toISOString().slice(0,10)+'">'+
  '<title>'+esc(m.title+' · '+name)+'</title><style>'+css+'p.cv{font-weight:700;color:var(--text)}.legend p.cv{color:var(--text)}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}</style></head><body><main>'+
  '<header>'+(logo?'<img src="'+logo+'" alt="'+esc(name)+'">':'<p class="n" style="font-size:22px;color:var(--head)">'+esc(name)+'</p>')+'<h1>'+esc(m.title)+'</h1>'+(m.subtitle?'<p>'+esc(m.subtitle)+'</p>':'')+(cl?'<p class="cv">'+esc(cl)+'</p>':'')+'</header>'+filters+
  (secs.filter(s=>s.title).length>1?'<nav aria-label="Sezioni">'+secs.map((s,i)=>s.title?'<a href="#s'+(i+1)+'">'+esc(s.title)+'</a>':'').join('')+'</nav>':'')+secHtml+legend+
  '<footer><p><strong>'+esc(name)+'</strong>'+(contacts.length?'<br>'+contacts.map(esc).join(' · '):'')+'</p></footer></main><script>'+js+'</script></body></html>\n'}
// Every address the page would load or link outside itself (must be empty).
function externalRefs(html){const s=String(html||''),out=[];
 for(const m of s.matchAll(/\b(?:src|href|action|poster|data)\s*=\s*["']?([^"'\s>]+)/gi)){const u=m[1];if(/^(#|data:|tel:|mailto:)/i.test(u))continue;out.push(u)}
 for(const m of s.matchAll(/url\(\s*["']?([^"')]+)/gi))if(!/^data:/i.test(m[1]))out.push(m[1]);
 if(/@import/i.test(s))out.push('@import');for(const m of s.matchAll(/https?:\/\/[^\s"'<>)]+/gi))out.push(m[0]);
 if(/\bfetch\(|XMLHttpRequest|new\s+WebSocket|navigator\.sendBeacon/.test(s))out.push('richiesta di rete nello script');
 return [...new Set(out)]}

// ---- the cleaned list as CSV (Excel in Italian: semicolons, BOM, formulas kept as text) ----
const cell=v=>{let s=String(v==null?'':v);if(/^[=+\-@\t\r]/.test(s))s="'"+s;return /[;"\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
function toCsv(items){const head=['Sezione','Nome','Descrizione','Prezzo','Unità','Allergeni (numeri)','Allergeni','Tag','Surgelato','Note'];
 const rows=(items||[]).map(it=>[it.section,it.name,it.description,it.price!=null?it.price.toFixed(2).replace('.',','):it.priceNote,it.unit,it.declared?(it.allergens.length?it.allergens.join(', '):'nessuno'):'',it.allergens.map(n=>allergen(n).short).join(', '),it.tags.map(t=>tag(t).label.toLowerCase()).join(', '),it.frozen?'sì':'',it.notes]);
 return '﻿'+[head,...rows].map(r=>r.map(cell).join(';')).join('\r\n')+'\r\n'}

// ---- checks ----
const isLarge=(pt,bold)=>pt>=18||(bold&&pt>=14);
function contrastIssues(items){const P=P_(),out=[],rects=[];
 for(const it of items){if(it.t==='rect'){if(!it.qr)rects.push(it);continue}if(it.t!=='text')continue;const bb=textBox(it),cx=(bb.x0+bb.x1)/2,cy=(bb.y0+bb.y1)/2;
  let bg='#FFFFFF';for(let i=rects.length-1;i>=0;i--){const r=rects[i];if(cx>=r.x&&cx<=r.x+r.w&&cy>=r.y&&cy<=r.y+r.h){bg=r.fill;break}}
  const ratio=P.contrast(it.fill,bg),need=isLarge(it.size,it.bold)?3:4.5;if(ratio<need)out.push({label:it.label,fg:up(it.fill),bg:up(bg),ratio,need})}
 return out}
// Everything built for the checks and the previews (no PDF bytes yet).
function build(m){const url=qrUrl(m.url),qr=url?{qr:QR().encode(url,{level:'M'}),url}:null;
 const docs=m.formats.map(id=>({id,doc:layoutFormat(m,id,{qr:format(id).qr?qr:null})}));return {docs,qr,url,html:htmlPage(m)}}
// [{id, label, state:'ok'|'warn'|'fail', detail, issues:[...]}]
function checksOf(m,built){const P=P_(),b=built||build(m),out=[],add=(id,label,state,detail,issues=[])=>out.push({id,label,state,detail,issues});const its=m.items,n=its.length;
 if(!n){add('voci','Voci del menu','fail','Non ci sono voci: incolla il testo, carica un foglio o aggiungile a mano.');return out}
 const noPrice=its.filter(x=>x.price==null&&!x.priceNote),odd=its.filter(x=>x.price!=null&&(x.price<=0||x.price>5000));
 add('prezzi','Prezzi',noPrice.length||odd.length?'warn':'ok',noPrice.length?noPrice.length+' voc'+(noPrice.length>1?'i':'e')+' senza prezzo: restano senza, RADIX non lo inventa. Scrivilo, oppure «s.q.» se è a quotazione.':odd.length?'Prezzi da verificare: '+list(odd.map(x=>x.name+' '+priceLabel(x)))+'.':'Tutte le '+n+' voci hanno il prezzo (in euro, formato italiano).',noPrice.map(x=>x.name).concat(odd.map(x=>x.name+': '+priceLabel(x))));
 const und=its.filter(x=>!x.declared);
 add('allergeni','Allergeni indicati',und.length?'warn':'ok',und.length?und.length+' voc'+(und.length>1?'i':'e')+' senza allergeni indicati: nel menu compare «chiedi al personale». Spunta gli allergeni o «Nessun allergene».':'Indicati per tutte le '+n+' voci (anche quando sono «nessuno»).',und.map(x=>x.name));
 const lists=b.docs.filter(d=>!d.doc.tent);// the formats that list the voices (the table tent carries the QR only)
 const al=usedAllergens(its),miss=lists.filter(d=>al.length&&!d.doc.pages.some(p=>p.items.some(i=>i.t==='text'&&i.s===LEGEND_TITLE)));const htmlLegend=!al.length||b.html.includes(esc(LEGEND_TITLE));
 add('legenda','Legenda degli allergeni',miss.length||!htmlLegend?'fail':'ok',al.length?(miss.length||!htmlLegend?'La legenda numerata manca in: '+miss.map(d=>format(d.id).title).concat(htmlLegend?[]:['pagina web']).join(', ')+'.':'Legenda numerata dei 14 allergeni (Reg. UE 1169/2011) in ogni PDF e nella pagina web; usati: '+al.join(', ')+'.'):'Nessun allergene segnato: niente legenda numerata, resta la nota «rivolgiti al personale».');
 const fr=its.filter(x=>x.frozen),frMiss=fr.length?lists.filter(d=>!d.doc.pages.some(p=>p.items.some(i=>i.t==='text'&&i.label==='Nota surgelati'))):[];
 add('surgelati','Prodotti surgelati',frMiss.length||fr.length&&!b.html.includes(esc(FROZEN_NOTE))?'fail':'ok',fr.length?(frMiss.length?'Manca la nota sui surgelati in: '+frMiss.map(d=>format(d.id).title).join(', ')+'.':fr.length+' voc'+(fr.length>1?'i':'e')+' con l’asterisco e la nota «'+FROZEN_NOTE+'» in ogni file.'):'Nessuna voce segnata come surgelata.',fr.map(x=>x.name));
 // coperto and servizio: asked for a restaurant menu, written in every file when given, never guessed
 const cl=coverLine(m);if(m.type==='ristorante'||cl){const cMiss=cl?lists.filter(d=>!d.doc.pages.some(p=>p.items.some(i=>i.t==='text'&&i.label==='Coperto e servizio'))).map(d=>format(d.id).title).concat(b.html.includes(esc(cl))?[]:['pagina web']):[];
  add('coperto','Coperto e servizio',cMiss.length?'fail':cl?'ok':'warn',cMiss.length?'La riga «'+cl+'» manca in: '+cMiss.join(', ')+'.':cl?'«'+cl+'» in ogni PDF e nella pagina web.':'Coperto non indicato: scrivi l’importo o «nessuno» (e il servizio, se c’è). RADIX non lo inventa e non lo deduce.')}
 const bad=[];for(const it of its)for(const [t,ns] of CONFLICTS)if(it.tags.includes(t)){const hit=ns.filter(x=>it.allergens.includes(x));if(hit.length)bad.push(it.name+': «'+tag(t).label.toLowerCase()+'» ma con '+hit.map(x=>allergen(x).short.toLowerCase()).join(', '))}
 add('coerenza','Tag e allergeni coerenti',bad.length?'fail':'ok',bad.length?'Alcuni tag contraddicono gli allergeni: correggi l’uno o l’altro.':'Vegetariano, vegano e senza glutine non contraddicono gli allergeni.',bad);
 const fit=b.docs.flatMap(d=>fitProblems(d.doc).map(x=>format(d.id).title+' · '+x.text)),cut=b.docs.flatMap(d=>d.doc.warnings.filter(w=>w.kind==='cut'||w.kind==='overflow').map(w=>w.text)),safe=b.docs.flatMap(d=>d.doc.warnings.filter(w=>w.kind==='safe').map(w=>format(d.id).title+' · '+w.text));
 add('pagine','Testo nelle pagine',fit.length||safe.length?'fail':cut.length?'warn':'ok',fit.length||safe.length?'Qualcosa esce dalla pagina o dall’area sicura.':cut.length?'Tutto impaginato, ma qualche descrizione è stata accorciata.':'Tutto impaginato in automatico, nessuna voce divisa tra due colonne: '+b.docs.map(d=>format(d.id).title+' '+d.doc.pages.length+(d.doc.pages.length===1?' pagina':' pagine')).join(', ')+'.',fit.concat(safe,cut));
 // the table formats have fixed faces: the folded A3 four, the placemat one, the tent needs the QR; the DL is front and back
 const tf=b.docs.filter(d=>['dl','a3-piegato','tovaglietta','segnatavolo'].includes(d.id));if(tf.length){const fails=[],warns=[],okays=[];
  for(const d of tf){const F=format(d.id),n=d.doc.pages.length;
   if(d.id==='a3-piegato'){if(d.doc.tooMany)fails.push(F.title+': le voci chiedono '+d.doc.faceCount+' facciate, il pieghevole ne ha 4. Togli voci, scegli «Compatta» nella rifinitura o usa A4/A3.');else okays.push(F.title+': copertina, 2 facciate interne, retro'+(b.qr?' con il QR':'')+', su 2 fogli A3 da piegare')}
   else if(d.id==='tovaglietta'){if(n>1)fails.push(F.title+': le voci chiedono '+n+' facciate, la tovaglietta ne ha 1. Togli voci, nascondi le descrizioni o scegli «Compatta».');else okays.push(F.title+': una facciata su 3 colonne')}
   else if(d.id==='segnatavolo'){if(!d.doc.hasQr)fails.push(F.title+': serve l’indirizzo della pagina del menu per il QR.');else okays.push(F.title+': 2 facce con il QR, piega a metà')}
   else if(n>2)warns.push(F.title+': '+n+' facciate; di solito è fronte e retro (2).');else okays.push(F.title+': '+(n===1?'una facciata':'fronte e retro'))}
  add('formati','Formati da tavolo',fails.length?'fail':warns.length?'warn':'ok',fails.length?'Alcuni formati non contengono il menu: correggi o togli il formato.':warns.length?'Formati pronti, uno da verificare.':okays.join(' · ')+'.',fails.concat(warns))}
 const small=b.docs.flatMap(d=>d.doc.pages.flatMap(p=>p.items.filter(i=>i.t==='text'&&i.size<MIN_PT-1e-9)));
 add('size','Testo di almeno '+MIN_PT+' pt',small.length?'fail':'ok',small.length?'Testi troppo piccoli.':'Il testo più piccolo è di '+String(Math.round(Math.min(...b.docs.flatMap(d=>d.doc.pages.flatMap(p=>p.items.filter(i=>i.t==='text').map(i=>i.size))),99)*10)/10).replace('.',',')+' pt.');
 const ci=b.docs.flatMap(d=>d.doc.pages.flatMap((p,i)=>contrastIssues(p.items).map(x=>format(d.id).title+' p. '+(i+1)+': «'+x.label+'» '+x.fg+' su '+x.bg+' '+String(x.ratio).replace('.',',')+':1 (serve '+String(x.need).replace('.',',')+':1)')));
 const hc=htmlColours(m),hcI=[['light','text','bg'],['light','soft','bg'],['light','head','bg'],['light','price','card'],['dark','text','bg'],['dark','soft','bg'],['dark','head','bg'],['dark','price','card']].filter(([mode,fg,bg])=>P.contrast(hc[mode][fg],hc[mode][bg])<4.5).map(([mode,fg])=>'Pagina web ('+(mode==='light'?'chiaro':'scuro')+'): '+fg);
 add('contrast','Contrasto AA',ci.length||hcI.length?'fail':'ok',ci.length||hcI.length?'Testi poco leggibili sul loro fondo.':'Ogni testo ha almeno 4,5:1 sul suo fondo (3:1 per i titoli grandi), nei PDF e nella pagina web chiara e scura.',[...new Set(ci.concat(hcI))]);
 const gl=[...new Set(b.docs.flatMap(d=>d.doc.warnings.filter(w=>w.kind==='glyph').map(w=>w.text)))];
 add('glifi','Caratteri',gl.length?'fail':'ok',gl.length?'Alcuni caratteri non esistono nel carattere del PDF.':'Tutti i caratteri esistono nel carattere dei PDF (testi convertiti in tracciati).',gl);
 if(b.docs.length){const ink=b.docs.map(d=>P.inkReport(d.doc)),max=Math.max(...ink.map(r=>r.max));add('ink','Inchiostro totale ≤ '+P.INK_LIMIT+'%',ink.every(r=>r.ok)?'ok':'fail','Massimo '+Math.round(max)+'%; CMYK FOGRA39, nessuna trasparenza.')}
 const ext=externalRefs(b.html);add('web','Pagina web autonoma',ext.length?'fail':'ok',ext.length?'La pagina carica qualcosa da fuori.':'Un solo file HTML: nessuna richiesta esterna, tema chiaro e scuro, filtri per allergeni e dieta.',ext);
 const u=qrUrl(m.url);add('qr','QR del menu',u===null?'fail':u?'ok':'warn',u===null?'L’indirizzo «'+clean(m.url).slice(0,60)+'» non è valido: scrivi un indirizzo web completo.':u?'QR verso '+u+' (versione '+b.qr.qr.version+', correzione M), anche sulla versione da tavolo. Pubblica menu.html a questo indirizzo prima di stampare.':'Senza indirizzo non creo il QR: scrivi dove pubblicherai la pagina del menu.');
 add('kit','Kit identità',m.brand.fromKit?'ok':'warn',m.brand.fromKit?'Colori e logo del Kit identità'+(m.brand.direction?' «'+m.brand.direction+'»':'')+'.':'Il progetto non ha un Kit identità: uso uno stile neutro e il nome come logotipo.');
 return out}
const blocking=checks=>checks.filter(c=>c.state==='fail');

// ---- optional AI: the descriptions only, grounded ----
// Words that name an ingredient or a claim: a rewritten description may only use those already in the voice.
const INGREDIENTS=Object.freeze([...new Set(ALLERGENS.flatMap(a=>a.words).concat(['pane','pasta','farina','semola','pangrattato','burro','pomodoro','pomodorini','basilico','aglio','cipolla','scalogno','porri','funghi','porcini','tartufo','zafferano',
 'prosciutto','speck','pancetta','guanciale','salame','salsiccia','mortadella','manzo','maiale','pollo','tacchino','agnello','vitello','coniglio','anatra','olive','capperi','rucola','spinaci','zucca','zucchine','melanzane','peperoni','patate','carciofi','asparagi',
 'limone','arancia','miele','cioccolato','zucchero','vaniglia','cannella','caffe','peperoncino','nduja','pistacchio','tartare','crudo','cotto','affumicato','fritto','fritta','grigliato','olio','aceto','balsamico','vino','birra','rum','liquore','alcol',
 'vegano','vegana','vegetariano','vegetariana','senza glutine','biologico','bio','km 0','dop','igp','artigianale','fatto in casa','della casa','fresco','fresca','surgelato']))]);
function claimWords(text){const t=' '+norm(text)+' ';return INGREDIENTS.filter(w=>t.includes(' '+w+' '))}
// A rewritten description against the voice: {ok, reasons}.
function groundCheck(it,text){const t=clean(text),reasons=[],orig=it.name+' '+it.description;
 if(!t)reasons.push('descrizione vuota');if(t.length>220)reasons.push('troppo lunga ('+t.length+' caratteri)');
 const nums=(t.match(/\d+(?:[.,]\d+)?/g)||[]).filter(x=>!(orig.match(/\d+(?:[.,]\d+)?/g)||[]).includes(x));if(nums.length)reasons.push('numeri nuovi: '+nums.join(', '));
 if(/€|\beur(o)?\b|\bprezz/i.test(t)&&!/€|\beur(o)?\b|\bprezz/i.test(orig))reasons.push('parla di prezzi');
 const have=new Set(claimWords(orig)),fresh=claimWords(t).filter(w=>!have.has(w));
 const allerg=fresh.filter(w=>ALLERGENS.some(a=>a.words.includes(w))&&!it.allergens.includes(ALLERGENS.find(a=>a.words.includes(w)).n));
 if(allerg.length)reasons.push('allergeni nuovi: '+allerg.join(', '));const other=fresh.filter(w=>!allerg.includes(w));if(other.length)reasons.push('ingredienti o diciture nuove: '+other.join(', '));
 return {ok:!reasons.length,reasons}}
function aiPrompt(items,{name}={}){const rows=items.map(it=>({id:it.id,nome:it.name,descrizione:it.description}));
 return 'Sei il copywriter di '+(clean(name)||'un locale')+'. Riscrivi SOLO le descrizioni di queste voci del menu, in italiano, per renderle più invitanti e chiare: al massimo 140 caratteri ciascuna.\n'+
  'Regole obbligatorie:\n- usa solo gli ingredienti e le parole già presenti nel nome o nella descrizione: non aggiungere ingredienti, allergeni, provenienze, certificazioni, cotture, quantità, numeri o prezzi;\n- non togliere ingredienti;\n- niente superlativi vuoti né emoji;\n- se una descrizione va già bene, riscrivila uguale.\n'+
  'Rispondi solo con un array JSON, una riga per voce, nella forma [{"id":"...","descrizione":"..."}], senza altro testo.\n\nVoci:\n'+JSON.stringify(rows)}
function parseAi(text){const s=String(text||''),a=s.indexOf('['),z=s.lastIndexOf(']');if(a<0||z<a)return [];try{const arr=JSON.parse(s.slice(a,z+1));return Array.isArray(arr)?arr.filter(x=>x&&typeof x==='object').map(x=>({id:clean(x.id),text:clean(x.descrizione!=null?x.descrizione:x.description)})):[]}catch(e){return []}}
// ONE confirmation, ONE call. {proposals:[{id,name,before,after,ok,reasons}]} or {cancelled:true}; nothing changes until applied.
async function improveDescriptions({items,rt,confirm,project,name,onStart}={}){const todo=(items||[]).filter(x=>clean(x.description));
 if(!todo.length)return {nothing:true};if(!rt||typeof rt.reply!=='function')throw Error('Gli agenti non si sono caricati: ricarica la pagina.');
 const ok=await (confirm||askConfirm)({title:'Miglioro le '+todo.length+' descrizioni?',cost:'È una sola chiamata AI al Copywriter: usa crediti API.',facts:[['Voci con descrizione',String(todo.length)],['Chiamate AI','1'],['Cosa cambia','Solo le descrizioni, dopo che le approvi']],
  message:'Nomi, prezzi e allergeni non cambiano. RADIX scarta le descrizioni che aggiungono ingredienti, allergeni, numeri o prezzi.',ok:'Migliora (1 chiamata)'});
 if(!ok)return {cancelled:true};if(typeof onStart==='function')onStart();
 const r=await rt.reply({role:AGENT,project:project&&project.name?{id:project.id,name:project.name}:undefined,messages:[{role:'user',content:aiPrompt(todo,{name})}]});
 const got=new Map(parseAi(r&&r.text).map(x=>[x.id,x.text]));if(!got.size)throw Error('la risposta non contiene descrizioni leggibili. Riprova.');
 return {proposals:todo.map(it=>{const after=got.get(it.id)||'';const g=after?groundCheck(it,after):{ok:false,reasons:['nessuna proposta']};return {id:it.id,name:it.name,before:it.description,after,ok:g.ok&&after!==it.description,same:after===it.description,reasons:g.reasons}})}}
function applyDescriptions(items,proposals,ids){const ok=new Map((proposals||[]).filter(p=>p.ok&&(!ids||ids.includes(p.id))).map(p=>[p.id,p.after]));return (items||[]).map(it=>ok.has(it.id)?{...it,description:ok.get(it.id).slice(0,300)}:it)}

// ---- the files ----
const ROOT='menu';
const zipName=m=>'menu-'+(slug(m.brand.name)||'locale')+'-'+direction(m.direction).id+'.zip';
function readme(m,checks,files,{date=new Date(),url=''}={}){const d=direction(m.direction),t=type(m.type),L=[];
 L.push((t.title+' · '+(clean(m.brand.name)||m.title)).toUpperCase(),'Stile: '+d.title+' · '+m.items.length+' voci in '+sections(m.items).length+' sezioni','Preparato con RADIX il '+date.toISOString().slice(0,10)+(m.aiUsed?' · descrizioni migliorate con 1 chiamata AI, approvate a mano':' · nessuna chiamata AI'),'');
 L.push('FILE',...files.map(f=>'- '+f.name+(f.label?': '+f.label:'')),'');
 L.push('STAMPA','- PDF in CMYK FOGRA39 in stile PDF/X-1a: formato + 3 mm di abbondanza per lato, segni di taglio fuori dall’abbondanza, testi in tracciati.','- A4 e A3 per la vetrina o la sala, A5 «tavolo» da plastificare o mettere nel portamenu. La tipografia fa comunque il suo preflight.',
  ...(m.formats.includes('dl')?['- DL lungo (99 × 210 mm): una facciata per pagina del PDF, fronte e retro se le pagine sono 2.']:[]),
  ...(m.formats.includes('a3-piegato')?['- A3 piegato in A4: 2 fogli A3 orizzontali, fronte (esterno: facciate 4 e 1) e retro (interno: facciate 2 e 3), girando sul lato lungo; piega al centro, i segni di piega sono tratteggiati fuori dal formato.']:[]),
  ...(m.formats.includes('tovaglietta')?['- Tovaglietta A3 orizzontale: una sola facciata, carta da 80-100 g o da plastificare.']:[]),
  ...(m.formats.includes('segnatavolo')?['- Segnatavolo: foglio A5 su cartoncino da 300-350 g, cordonato e piegato a metà sulla linea tratteggiata; la faccia di sopra è stampata capovolta, così si legge da entrambi i lati.']:[]),'- digitale/menu-a4.pdf è per lo schermo e per l’email (RGB, senza abbondanza): non mandarlo in tipografia.','');
 L.push('PAGINA WEB E QR','- web/menu.html è un solo file: nessun collegamento esterno, funziona anche offline, con tema chiaro e scuro e i filtri per allergeni e dieta.',url?'- Pubblica menu.html all’indirizzo '+url+' (il QR punta lì): caricalo sul tuo sito o chiedilo a chi lo gestisce. Prova il QR con il telefono prima di stampare.':'- Non c’è il QR: nello studio scrivi l’indirizzo dove pubblicherai menu.html.','- Quando cambi un prezzo, aggiorna menu.html allo stesso indirizzo: il QR resta valido.','');
 const cl=coverLine(m);L.push('COPERTO E SERVIZIO',cl?'- «'+cl+'» in ogni file.':'- Non indicati: RADIX non li scrive al posto tuo. Se li applichi vanno dichiarati nel menu.','');
 L.push('ALLERGENI','- I numeri accanto alle voci rimandano alla legenda dei 14 allergeni del Reg. UE 1169/2011. Le voci senza allergeni indicati riportano «chiedi al personale»: RADIX non li deduce dagli ingredienti.','- Tieni a disposizione dei clienti la documentazione completa sugli allergeni, come richiede la normativa.','');
 L.push('CONTROLLI',...checks.map(x=>'- ['+({ok:'ok',warn:'da completare',fail:'da sistemare'}[x.state])+'] '+x.label+': '+x.detail+(x.issues.length?'\n'+x.issues.slice(0,20).map(i=>'    · '+i).join('\n'):'')),'');
 return L.join('\n')+'\n'}
// Every file. opts (browser): glyphs(), prepare(doc,{pdfx}), rasterize(doc), date.
async function menuFiles(m,opts={}){const P=P_(),date=opts.date||new Date(),out=[],add=(name,data,label)=>out.push({name:ROOT+'/'+name,data,label});
 const built=build(m),checks=checksOf(m,built);if(built.docs.length&&opts.glyphs)await opts.glyphs();
 for(const x of built.docs){const F=format(x.id);if(x.doc.tooMany)throw Error(F.title+': il menu non sta nelle '+F.faces+' facciate.');if(opts.prepare)await opts.prepare(x.doc,{pdfx:true});const bytes=P.pdf(x.doc,{mode:'print',pdfx:true,date,title:m.title+' '+F.title+' · tipografia',producer:'RADIX Menu e listino'}),probs=P.checkPdf(bytes);
  if(probs.length)throw Error(F.title+': '+probs.join(' '));add('stampa/'+F.file+'-tipografia.pdf',bytes,(F.kind==='tent'?'':'Menu ')+F.title+' per la tipografia ('+(F.kind==='folded'?'2 fogli A3, fronte e retro':F.kind==='tent'?'1 foglio A5 da piegare':x.doc.pages.length+(x.doc.pages.length===1?' pagina':' pagine'))+')')}
 const a4=built.docs.find(x=>x.id==='a4')||null;if(a4){const doc=layoutMenu(m,'a4');if(opts.rasterize)await opts.rasterize(doc);add('digitale/menu-a4.pdf',P.pdf(doc,{mode:'web',date,title:m.title+' · '+(clean(m.brand.name)||''),producer:'RADIX Menu e listino'}),'Menu A4 per schermo ed email (RGB)')}
 add('web/menu.html',htmlPage(m,{date}),'Pagina del menu per il telefono (un solo file)');
 if(built.qr){add('qr/menu-qr.svg',QR().toSvg(built.qr.qr,{title:'QR del menu: '+built.url}),'QR verso '+built.url+' (SVG, per la stampa)');add('qr/menu-qr.png',QR().toPng(built.qr.qr,{scale:12}),'QR verso '+built.url+' (PNG)')}
 add('menu-pulito.csv',toCsv(m.items),'La lista pulita (Excel, separatore punto e virgola)');
 add('LEGGIMI.txt',readme(m,checks,out.map(f=>({name:f.name.slice(ROOT.length+1),label:f.label})),{date,url:built.url||''}),'Istruzioni e controlli');
 return out}
const bundle=(files,{date}={})=>ZIP().zip(files.map(f=>({name:f.name,data:f.data})),{date:date||new Date()});

// ---- saved in the project: the «agents» document, key menu ----
const emptyStore=()=>({schemaVersion:1,items:[]});
function readStore(doc){const s=doc&&doc.menu;return s&&typeof s==='object'&&Array.isArray(s.items)?{schemaVersion:1,items:s.items.filter(x=>x&&typeof x==='object')}:emptyStore()}
function savedRecord(m,{by,at,checks}={}){const when=at||new Date().toISOString();
 return {id:'menu-'+when.replace(/\D/g,'').slice(0,14),at:when,by:clean(by).slice(0,80),type:m.type,direction:m.direction,title:m.title,subtitle:m.subtitle,footnote:m.footnote,url:m.url,cover:m.cover,noCover:m.noCover,service:m.service,refine:{...m.refine},contacts:Object.fromEntries(['address','phone','email','website'].map(k=>[k,clean((m.contacts||{})[k]).slice(0,160)]).filter(x=>x[1])),formats:m.formats.slice(),items:m.items.map(x=>({...x,allergens:x.allergens.slice(),tags:x.tags.slice()})),
  kit:{brand:clean(m.brand.name),direction:clean(m.brand.direction)},checks:(checks||checksOf(m)).map(c=>({id:c.id,state:c.state}))}}
function addRecord(store,rec){const s=readStore({menu:store});return {schemaVersion:1,items:s.items.filter(x=>x.id!==rec.id).concat([rec]).slice(-MAX_SAVED)}}
async function saveToProject(ws,projectId,rec){if(!ws||typeof ws.bind!=='function')throw Error('Archivio del progetto non disponibile.');
 const d=ws.bind(projectId,'agents');
 for(let i=0;i<3;i++){const cur=(await d.load())||{},next=addRecord(readStore(cur),rec);
  try{await d.save({...cur,schemaVersion:1,conversations:cur.conversations||{},menu:next});return next}catch(e){if(!(ws.ConflictError&&e instanceof ws.ConflictError)||i===2)throw e}}}
const fromRecord=(r,profile,opts)=>modelOf({type:r.type,direction:r.direction,title:r.title,subtitle:r.subtitle,footnote:r.footnote,url:r.url,cover:r.cover,noCover:r.noCover,service:r.service,refine:r.refine,formats:r.formats,items:r.items,contacts:r.contacts},profile,opts);
// The phone page of the project's last saved menu, for the Studio Sito (published as menu.html with the site): {html,
// record} or null. The QR of the printed menu points to <site>/menu.html.
function sitePage(agentsDoc,profile,opts={}){const s=readStore(agentsDoc),r=s.items[s.items.length-1];if(!r||!Array.isArray(r.items)||!r.items.length)return null;
 const m=fromRecord(r,profile,opts);if(!m.items.length)return null;return {html:htmlPage(m,{date:opts.date||new Date()}),record:r,items:m.items.length,title:m.title}}

// ---- the widget (browser) ----
let counter=0;
const doc=()=>root.document;
const E=(tag,text,cls)=>{const n=doc().createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
const button=(text,cls)=>{const b=E('button',text,cls||'');b.type='button';return b};
const svgImg=(svg,alt)=>{const i=E('img');i.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);i.alt=alt||'';i.decoding='async';return i};
const MIME={pdf:'application/pdf',html:'text/html;charset=utf-8',txt:'text/plain;charset=utf-8',svg:'image/svg+xml',png:'image/png',zip:'application/zip',csv:'text/csv;charset=utf-8'};
const save=(name,data)=>P_().download(name.split('/').pop(),data,MIME[name.split('.').pop()]||'application/octet-stream');
// The sheet through the catalogue's reader (lib/catalog-studio.js readSheet: CSV, or .xlsx with the values Excel saved),
// the same one the Studio Catalogo uses for its price lists; its own copy only when the catalogue is not loaded.
async function readSheetFile(file){const C=CAT();if(C&&typeof C.readSheet==='function'&&root.RadixCrmCsv)return C.readSheet(file);
 const csv=root.RadixCrmCsv;if(!csv)throw Error('Lettore dei fogli non disponibile: ricarica la pagina.');
 if(/\.xlsx$/i.test(file.name)){if(file.size>3e6)throw Error('File troppo grande: massimo 3 MB per Excel.');const X=root.RadixLeadXlsx;if(!X||!X.readRows)throw Error('Lettore Excel non disponibile: ricarica la pagina.');
  return csv.fromRows(await X.readRows(await file.arrayBuffer(),{maxRows:csv.MAX_ROWS,formulas:true}))}
 return csv.readFile(file)}
// ctx: {project (profileFor summary), profile, projectName, projectId, workspace, agentsUrl, by, openIdentity(), identityUrl, rt}
function menuStudio(ctx={}){const n=++counter,P=P_(),profile=ctx.profile||{},wrap=E('div',undefined,'tool photo-studio ad-studio menu-studio');
 const steps=E('ol',undefined,'ps-steps');['Il menu','Scegli lo stile','Rifinitura e controlli','Export'].forEach((t,i)=>{const li=E('li',(i+1)+' · '+t);li.dataset.step=String(i+1);steps.append(li)});
 const setStep=k=>[...steps.children].forEach(li=>li.dataset.state=+li.dataset.step<k?'done':+li.dataset.step===k?'current':'todo');wrap.append(steps);setStep(1);
 const brand=P.brandOf(profile,ctx.projectName),pre=P.prefill(profile,{projectName:ctx.projectName,summary:ctx.project}),kit=hasKit(profile);
 const st={type:'ristorante',title:'',subtitle:'',footnote:'',url:'',coverText:'',cover:null,noCover:false,service:'',refine:refineOf(),items:[],formats:DEFAULT_FORMATS.slice(),direction:'',files:[],busy:false,ai:null,aiUsed:false};
 const contacts={address:pre.address,phone:pre.phone,email:pre.email,website:pre.website};
 const model=()=>({...modelOf({type:st.type,direction:st.direction||'classico',title:st.title,subtitle:st.subtitle,footnote:st.footnote,url:st.url,cover:st.cover,noCover:st.noCover,service:st.service,refine:st.refine,formats:st.formats,items:st.items,contacts},profile,{projectName:ctx.projectName}),aiUsed:st.aiUsed});
 // the kit (or the honest note)
 const bx=E('div',undefined,'ad-brand mn-brand');bx.dataset.source=kit?'kit':'default';const sw=E('span',undefined,'ad-swatches');
 ['primary','secondary','accent','dark','light'].forEach(k=>{const i=E('i');i.style.background=brand.palette[k];i.title=k+' '+brand.palette[k];sw.append(i)});
 const bt=E('span',undefined,'ad-brand-text');bt.append(E('strong',brand.name||'Il tuo locale'),E('span',kit?'Dal Kit identità'+(brand.direction?' «'+brand.direction+'»':'')+(brand.logo?'':' · senza logo: uso il nome come logotipo'):'Nessun Kit identità nel progetto: uso uno stile neutro e il nome come logotipo. RADIX non inventa colori o logo.'));
 bx.append(sw,bt);if(brand.logo){const li=svgImg(brand.logo,'Logo del kit');li.className='ad-brand-logo';bx.append(li)}
 if(!kit){const go=ctx.openIdentity?button('Crea il Kit identità'):E('a','Crea il Kit identità','mn-link');if(ctx.openIdentity)go.onclick=()=>ctx.openIdentity();else go.href=ctx.identityUrl||'/agency/crea.html?open=identita';bx.append(go)}
 const form=E('div',undefined,'ps-form');
 // the type
 const tfs=E('fieldset',undefined,'ad-wide mn-types');tfs.append(E('legend','Che cosa prepari'));
 TYPES.forEach(t=>{const l=E('label',undefined,'ps-chip ad-tile'),r=E('input');r.type='radio';r.name='mn-type-'+n;r.value=t.id;r.checked=t.id===st.type;
  r.onchange=()=>{st.type=t.id;if(!st.title)titleI.placeholder=t.heading;changed()};const tx=E('span',undefined,'ad-tile-text');tx.append(E('strong',t.title),E('small',t.line));l.append(r,tx);tfs.append(l)});
 // title, subtitle, footnote, QR address
 const ofs=E('fieldset',undefined,'mn-opts');ofs.append(E('legend','Intestazione, note e QR'));const og=E('div',undefined,'mn-fields');
 const field=(label,key,ph,max,typeAttr='text',wide=false,help='')=>{const l=E('label',undefined,'mn-field'+(wide?' mn-wide':'')),i=E('input');i.type=typeAttr;i.maxLength=max;i.placeholder=ph;i.name='mn-'+key;i.value=st[key]||'';i.oninput=()=>{st[key]=i.value;changed()};l.append(E('span',label),i);if(help)l.append(E('small',help,'mn-help'));og.append(l);return i};
 const titleI=field('Titolo','title',type(st.type).heading,60);field('Sottotitolo (facoltativo)','subtitle','Es. Autunno 2026 · Cucina aperta 12-15 e 19-23',90);
 // coperto and servizio: their own line in every file; what is not written stays unsaid (never guessed)
 const coverI=field('Coperto','coverText','Es. 2,50 oppure «nessuno»',20,'text',false,'Per il ristorante va dichiarato. Vuoto: non lo scrivo.');coverI.inputMode='decimal';
 coverI.oninput=()=>{st.coverText=coverI.value;const p=parseCover(coverI.value);if(p){st.cover=p.cover;st.noCover=p.noCover;coverI.setCustomValidity('')}else{st.cover=null;st.noCover=false;coverI.setCustomValidity('Scrivi un importo (2,50) oppure «nessuno».')}changed()};
 field('Servizio (facoltativo)','service','Es. 10% oppure «incluso»',60);
 field('Nota in fondo (facoltativa)','footnote','Es. Acqua microfiltrata · Pane fatto da noi',200,'text',true);
 const urlI=field('Indirizzo della pagina del menu, per il QR','url','https://www.tuosito.it/menu.html',URL_MAX,'url',true,'Il QR punta qui: pubblica a questo indirizzo il file menu.html che trovi nello zip, oppure mettilo online con il sito (Studio Sito, riquadro «Menu del locale»).');ofs.append(og);
 // the project's site already online: its address + /menu.html, offered (not filled in on its own)
 if(ctx.workspace&&ctx.workspace.sites&&ctx.projectId&&typeof ctx.workspace.sites.info==='function')ctx.workspace.sites.info(ctx.projectId).then(r=>{const s=r&&r.site,u=s&&(s.domain&&s.domain.verified&&s.domain.name?'https://'+s.domain.name:s.url);if(!u||!/^https:\/\//.test(u))return;
  const target=u.replace(/\/+$/,'')+'/menu.html',b=button('Usa '+target.replace(/^https:\/\//,''),'mn-use-site');b.onclick=()=>{urlI.value=target;st.url=target;changed()};urlI.parentNode.append(b)}).catch(()=>{});
 // the voices: paste, file, by hand
 const sfs=E('fieldset',undefined,'mn-sources');sfs.append(E('legend','Le voci: incolla, carica un foglio o scrivi a mano'));const srow=E('div',undefined,'mn-source-row');
 const pasteBox=E('div',undefined,'mn-source');const ta=E('textarea');ta.name='mn-paste';ta.rows=7;ta.maxLength=60000;ta.placeholder='ANTIPASTI\nBruschetta - pane casereccio, pomodoro e basilico (1) [vegano] 6,00\nFritto di calamari* (1, 14) 14\n\nDOLCI\nTiramisù (1, 3, 7) 6,50';
 const readB=button('Leggi il testo');pasteBox.append(E('strong','Incolla il menu'),E('small','Una voce per riga: nome - descrizione (allergeni 1, 3, 7) [tag] prezzo. Sezioni in MAIUSCOLO o con i due punti. Va bene anche un foglio copiato da Excel.','mn-help'),ta,readB);
 const fileBox=E('label',undefined,'mn-source mn-file');const fi=E('input');fi.type='file';fi.accept='.csv,.xlsx,text/csv';fi.name='mn-file';
 fileBox.append(E('strong','Carica un foglio'),E('small','CSV o Excel .xlsx, una riga per voce: Sezione, Nome, Descrizione, Prezzo, Allergeni (numeri o nomi), Tag, Note. Fino a '+MAX_ITEMS+' voci.','mn-help'),fi);
 srow.append(pasteBox,fileBox);const importInfo=E('p','','tool-status mn-import');importInfo.setAttribute('role','status');
 const tableHead=E('div',undefined,'mn-table-head'),count=E('h4','Le voci (0)'),addB=button('Aggiungi una voce','mn-add'),clearB=button('Svuota','mn-clear');tableHead.append(count,addB,clearB);
 const rows=E('div',undefined,'mn-rows');const dl=E('datalist');dl.id='mn-sections-'+n;
 sfs.append(srow,importInfo,tableHead,rows,dl);
 // formats
 const ffs=E('fieldset',undefined,'mn-formats');ffs.append(E('legend','Formati da stampare'));
 const sizeOf=f=>f.kind==='folded'?'4 facciate A4':f.kind==='tent'?'2 facce 148 × '+f.face+' mm':f.w+' × '+f.h+' mm';
 const fgroup=(title,ids)=>{const g=E('div',undefined,'mn-format-group');g.append(E('span',title,'mn-format-title'));
  FORMATS.filter(f=>ids.includes(f.id)).forEach(f=>{const l=E('label',undefined,'ps-chip'),c=E('input');c.type='checkbox';c.value=f.id;c.checked=st.formats.includes(f.id);c.name='mn-format-'+n;if(f.line)l.title=f.line;
   c.onchange=()=>{st.formats=FORMAT_IDS.filter(x=>x===f.id?c.checked:st.formats.includes(x));changed()};l.append(c,doc().createTextNode(' '+f.title+' · '+sizeOf(f)));g.append(l)});ffs.append(g)};
 fgroup('Sala e vetrina',['a4','a3']);fgroup('Da tavolo, con il QR',['a5','dl','a3-piegato','tovaglietta','segnatavolo']);
 const go=button('Prepara 3 stili','primary'),bar=E('div',undefined,'ps-actions');bar.append(go,E('span','Nessuna chiamata AI: stili, controlli, PDF, pagina web e QR si creano qui, senza costi.','muted'));
 form.append(bx,tfs,sfs,ofs,ffs,bar);
 const status=E('p','','tool-status');status.setAttribute('role','status');
 const saved=E('div',undefined,'ad-saved mn-saved');saved.hidden=true;
 const dirs=E('div',undefined,'ad-dirs mn-dirs'),refine=E('section',undefined,'mn-refine'),result=E('div',undefined,'ad-result mn-result'),out=E('div',undefined,'mn-out');dirs.hidden=refine.hidden=result.hidden=out.hidden=true;
 wrap.append(saved,form,status,dirs,refine,result,out);
 let timer=0;function changed(){if(dirs.hidden)return;clearTimeout(timer);timer=setTimeout(()=>{renderDirs();if(st.direction)renderResult()},350)}
 // «Rifinitura»: after the choice of a style, density, dotted leaders and descriptions; previews and checks follow
 function renderRefine(){refine.hidden=!st.direction;if(refine.hidden)return;const r=st.refine,centered=styleOf(st.direction,brand.palette).align==='center';
  const dens=E('fieldset',undefined,'mn-refine-row');dens.append(E('legend','Densità'));
  Object.entries(DENSITIES).forEach(([id,d])=>{const l=E('label',undefined,'ps-chip'),x=E('input');x.type='radio';x.name='mn-density-'+n;x.value=id;x.checked=r.density===id;x.onchange=()=>{st.refine={...st.refine,density:id};renderRefine();renderResult()};l.append(x,doc().createTextNode(' '+d.title));dens.append(l)});
  const opts=E('fieldset',undefined,'mn-refine-row');opts.append(E('legend','Voci'));
  const box=(key,label,disabled,help)=>{const l=E('label',undefined,'ps-chip'),x=E('input');x.type='checkbox';x.name='mn-'+key+'-'+n;x.checked=!!r[key];x.disabled=!!disabled;if(help)l.title=help;x.onchange=()=>{st.refine={...st.refine,[key]:x.checked};renderResult()};l.append(x,doc().createTextNode(' '+label));opts.append(l)};
  box('leaders','Puntini fino al prezzo',centered,centered?'Nello stile Classico il prezzo sta sotto il nome: i puntini servono negli stili Moderno e Lavagna.':'');box('descriptions','Mostra le descrizioni');
  refine.replaceChildren(E('h4','Rifinitura'),E('p','Densità, puntini e descrizioni valgono per tutti i formati. Quando il menu non sta nelle facciate di un formato da tavolo, prova «Compatta» o togli le descrizioni.','ad-idea'),dens,opts)}
 // the table of voices
 function renderRows(){count.textContent='Le voci ('+st.items.length+')';dl.replaceChildren(...[...new Set(st.items.map(x=>x.section).filter(Boolean))].map(s=>{const o=E('option');o.value=s;return o}));
  rows.replaceChildren(...st.items.map((it,i)=>rowOf(it,i)));if(!st.items.length)rows.append(E('p','Nessuna voce ancora: incolla il menu, carica un foglio o premi «Aggiungi una voce».','mn-empty'))}
 function rowOf(it,i){const r=E('div',undefined,'mn-row');r.dataset.id=it.id;const flag=()=>{r.dataset.noPrice=String(it.price==null&&!it.priceNote);r.dataset.noAllergens=String(!it.declared)};flag();
  const inp=(label,key,max,cls,typeAttr='text')=>{const l=E('label',undefined,'mn-cell '+cls),x=E('input');x.type=typeAttr;x.maxLength=max;x.name='mn-'+key+'-'+i;x.setAttribute('aria-label',label+' · voce '+(i+1));
   if(key==='price'){x.value=it.price!=null?String(it.price.toFixed(2)).replace('.',',')+(it.unit?'/'+it.unit:''):it.priceNote;x.inputMode='decimal';x.placeholder='12,00';x.onchange=()=>{const p=parsePrice(x.value);it.price=p.price;it.unit=p.unit;it.priceNote=p.note;if(clean(x.value)&&p.price==null&&!p.note)x.setCustomValidity('Prezzo non letto');else x.setCustomValidity('');flag();changed()}}
   else{x.value=it[key]||'';if(key==='section')x.setAttribute('list',dl.id);x.oninput=()=>{it[key]=x.value;if(key==='section'&&!x.value)it.section='';changed()};x.onchange=()=>{if(key==='section')renderRows()}}
   l.append(E('span',label),x);return l};
  const al=E('details',undefined,'mn-al'),sum=E('summary');const sumText=()=>{sum.textContent=it.declared?(it.allergens.length?'Allergeni '+it.allergens.join(', '):'Nessun allergene'):'Allergeni da indicare'};sumText();
  const grid=E('div',undefined,'mn-al-grid');const none=E('label',undefined,'mn-al-none'),nc=E('input');nc.type='checkbox';nc.checked=it.declared&&!it.allergens.length;none.append(nc,doc().createTextNode(' Nessun allergene'));
  const boxes=ALLERGENS.map(a=>{const l=E('label',undefined,'mn-al-item'),c=E('input');c.type='checkbox';c.value=String(a.n);c.checked=it.allergens.includes(a.n);l.title=a.label;l.append(c,E('b',String(a.n)),doc().createTextNode(' '+a.short));
   c.onchange=()=>{it.allergens=ALLERGENS.filter((x,j)=>boxes[j].querySelector('input').checked).map(x=>x.n);it.declared=it.allergens.length>0||nc.checked;if(it.allergens.length)nc.checked=false;sumText();flag();changed()};grid.append(l);return l});
  nc.onchange=()=>{if(nc.checked){boxes.forEach(b=>b.querySelector('input').checked=false);it.allergens=[]}it.declared=nc.checked||it.allergens.length>0;sumText();flag();changed()};
  al.append(sum,none,grid);
  const tg=E('div',undefined,'mn-tags');TAGS.forEach(t=>{const l=E('label',undefined,'mn-tag'),c=E('input');c.type='checkbox';c.checked=it.tags.includes(t.id);c.onchange=()=>{it.tags=TAG_IDS.filter(x=>x===t.id?c.checked:it.tags.includes(x));changed()};l.append(c,doc().createTextNode(' '+t.label));tg.append(l)});
  const fz=E('label',undefined,'mn-tag mn-frozen'),fc=E('input');fc.type='checkbox';fc.checked=it.frozen;fc.onchange=()=>{it.frozen=fc.checked;changed()};fz.append(fc,doc().createTextNode(' Surgelato *'));tg.append(fz);
  const del=button('Togli','mn-del');del.setAttribute('aria-label','Togli la voce '+(it.name||i+1));del.onclick=()=>{st.items.splice(i,1);renderRows();changed()};
  r.append(inp('Sezione','section',60,'mn-c-section'),inp('Nome','name',90,'mn-c-name'),inp('Descrizione','description',300,'mn-c-desc'),inp('Prezzo','price',20,'mn-c-price'),inp('Note','notes',120,'mn-c-notes'),al,tg,del);return r}
 renderRows();
 addB.onclick=()=>{if(st.items.length>=MAX_ITEMS)return;const last=st.items[st.items.length-1];st.items.push(item({section:last?last.section:'',name:''}));st.items[st.items.length-1].name='';renderRows();const x=rows.lastElementChild&&rows.lastElementChild.querySelector('.mn-c-name input');if(x)x.focus()};
 clearB.onclick=async()=>{if(!st.items.length)return;if(!await askConfirm({title:'Svuoto la lista delle voci?',message:'Le '+st.items.length+' voci tornano vuote. Non si può annullare.',ok:'Svuota',cancel:'Tieni le voci',tone:'danger'}))return;st.items=[];renderRows();changed()};
 const report=(r,src)=>{const its=r.items.map(x=>({...x})),noP=its.filter(x=>x.price==null&&!x.priceNote).length,noA=its.filter(x=>!x.declared).length;
  importInfo.textContent=src+': '+its.length+' voci in '+sections(its).length+' sezioni'+(r.skipped?' · '+r.skipped+' righe senza nome saltate':'')+(noP?' · '+noP+' senza prezzo':'')+(noA?' · '+noA+' senza allergeni indicati':'')+(r.issues.length?' · da controllare: '+list(r.issues,4):'')+'. Controlla la tabella qui sotto.';return its};
 readB.onclick=()=>{const t=ta.value;if(!clean(t)){importInfo.textContent='Incolla prima il testo del menu.';return}const r=fromText(t);if(!r.items.length){importInfo.textContent='Nessuna voce letta: '+(r.issues[0]||'una voce per riga, con il nome e il prezzo.');return}
  st.items=st.items.concat(report(r,r.sheet?'Foglio incollato':'Testo')).slice(0,MAX_ITEMS);renderRows();changed()};
 fi.onchange=async()=>{const f=fi.files&&fi.files[0];if(!f)return;importInfo.textContent='Leggo '+f.name+'…';
  try{const sheet=await readSheetFile(f);const r=fromSheet(sheet);if(!r.items.length)throw Error(r.issues[0]||'nessuna voce con il nome');st.items=st.items.concat(report(r,f.name)).slice(0,MAX_ITEMS);renderRows();changed()}
  catch(e){importInfo.textContent='Foglio non letto: '+e.message}finally{fi.value=''}};
 // saved menus
 async function loadSaved(){if(!ctx.workspace||!ctx.projectId)return;try{const s=readStore(await ctx.workspace.bind(ctx.projectId,'agents').load());if(!s.items.length)return;
  saved.replaceChildren(E('h4','Menu salvati nel progetto'));const row=E('div',undefined,'ad-saved-row');
  s.items.slice(-4).reverse().forEach(r=>{const b=button(type(r.type).title+' · '+direction(r.direction).title+' · '+String(r.at||'').slice(0,10),'ad-saved-item');b.onclick=()=>{const m=fromRecord(r,profile,{projectName:ctx.projectName});
   Object.assign(st,{type:m.type,direction:m.direction,title:r.title&&r.title!==type(r.type).heading?r.title:'',subtitle:m.subtitle,footnote:m.footnote,url:m.url,cover:m.cover,noCover:m.noCover,coverText:m.cover!=null?m.cover.toFixed(2).replace('.',','):m.noCover?'nessuno':'',service:m.service,refine:m.refine,formats:m.formats,items:m.items});
   tfs.querySelectorAll('input').forEach(x=>x.checked=x.value===st.type);ffs.querySelectorAll('input').forEach(x=>x.checked=st.formats.includes(x.value));for(const k of ['title','subtitle','footnote','url','coverText','service']){const x=og.querySelector('input[name="mn-'+k+'"]');if(x)x.value=st[k]||''}
   renderRows();renderDirs();renderRefine();renderResult();status.textContent='Riaperto il menu salvato: controlla le voci e scarica di nuovo i file.'};row.append(b)});
  saved.append(row);saved.hidden=false}catch(e){}}
 loadSaved();
 go.onclick=()=>{if(!st.items.filter(x=>clean(x.name)).length){status.textContent='Prima aggiungi le voci: incolla il menu, carica un foglio o scrivile a mano.';return}if(!st.formats.length){status.textContent='Scegli almeno un formato.';return}
  renderDirs();status.textContent='Ecco i 3 stili con le tue voci: scegli quello da usare.';dirs.scrollIntoView&&dirs.scrollIntoView({behavior:'smooth',block:'start'})};
 function renderDirs(){setStep(st.direction?3:2);dirs.hidden=false;
  dirs.replaceChildren(...DIRECTIONS.map(d=>{const m={...model(),direction:d.id};const docA4=layoutMenu(m,'a4');
   const card=E('article',undefined,'ad-dir mn-dir');card.dataset.chosen=String(st.direction===d.id);card.dataset.direction=d.id;
   const head=E('div',undefined,'ad-dir-head');head.append(E('span','Stile','ad-angle'),E('h3',d.title),E('p',d.line,'ad-idea'));
   const fig=E('figure',undefined,'mn-fig mn-dir-fig');fig.append(svgImg(P.previewSvg(docA4,0,{guides:false}),d.title+' · prima pagina A4'),E('figcaption','A4 · pagina 1 di '+docA4.pages.length));
   const pick=button(st.direction===d.id?'Stile scelto':'Scegli questo stile','primary');pick.onclick=()=>{st.direction=d.id;renderDirs();renderRefine();renderResult();refine.scrollIntoView&&refine.scrollIntoView({behavior:'smooth',block:'start'})};
   card.append(head,fig,pick);return card}))}
 function checkRow(c){const row=E('div',undefined,'mn-check');row.dataset.state=c.state;row.dataset.check=c.id;
  row.append(E('span',{ok:'OK',warn:'Da completare',fail:'Da sistemare'}[c.state],'mn-check-badge'),E('strong',c.label),E('p',c.detail,'mn-check-detail'));
  if(c.issues.length){const ul=E('ul');c.issues.slice(0,8).forEach(i=>ul.append(E('li',i)));if(c.issues.length>8)ul.append(E('li','e altre '+(c.issues.length-8)));row.append(ul)}return row}
 function aiBox(m){const box=E('section',undefined,'mn-ai');box.append(E('h4','Migliora le descrizioni (facoltativo)'));const withDesc=m.items.filter(x=>clean(x.description)).length;
  const b=button('Migliora le descrizioni'),acts=E('div',undefined,'ps-actions');acts.append(b,E('span','Una chiamata AI al Copywriter, con conferma. Riscrive solo le descrizioni che ci sono: ingredienti, allergeni e prezzi restano i tuoi.','muted'));box.append(acts);
  const res=E('div',undefined,'mn-ai-res'),as=E('p','','tool-status');as.setAttribute('role','status');box.append(as,res);if(!withDesc){b.disabled=true;as.textContent='Nessuna voce ha una descrizione da migliorare.'}
  const show=()=>{res.replaceChildren();if(!st.ai)return;const ok=st.ai.proposals.filter(p=>p.ok),ul=E('ul',undefined,'mn-ai-list');
   st.ai.proposals.forEach(p=>{const li=E('li',undefined,'mn-ai-item');li.dataset.ok=String(p.ok);const top=E('div',undefined,'mn-ai-top');
    if(p.ok){const l=E('label',undefined,'mn-tag'),c=E('input');c.type='checkbox';c.checked=true;c.value=p.id;l.append(c,doc().createTextNode(' Usa'));top.append(l)}else top.append(E('span',p.same?'Uguale':'Scartata','mn-ai-badge'));
    top.append(E('strong',p.name));li.append(top,E('p','Prima: '+p.before,'mn-ai-before'),E('p','Dopo: '+(p.after||'—'),'mn-ai-after'));if(!p.ok&&p.reasons.length)li.append(E('p','Scartata da RADIX: '+p.reasons.join('; ')+'.','mn-ai-why'));ul.append(li)});
   const apply=button('Applica le descrizioni scelte','primary');apply.disabled=!ok.length;apply.onclick=()=>{const ids=[...ul.querySelectorAll('input:checked')].map(x=>x.value);st.items=applyDescriptions(st.items,st.ai.proposals,ids);st.aiUsed=st.aiUsed||ids.length>0;st.ai=null;renderRows();renderDirs();renderResult();status.textContent=ids.length+' descrizioni aggiornate: controllale nella tabella.'};
   res.append(E('p',ok.length+' proposte su '+st.ai.proposals.length+' passano il controllo: nessun ingrediente, allergene o prezzo nuovo.','mn-ai-sum'),ul,apply)};
  b.onclick=async()=>{if(st.busy)return;st.busy=true;b.disabled=true;
   try{const r=await improveDescriptions({items:model().items,rt:ctx.rt||root.RadixAgents,project:ctx.project,name:brand.name,onStart:()=>{as.textContent='Il Copywriter riscrive le descrizioni…'}});
    if(r.cancelled){as.textContent='Nessuna chiamata: annullato.';return}if(r.nothing){as.textContent='Nessuna descrizione da migliorare.';return}st.ai=r;as.textContent='Ecco le proposte: scegli quali usare.';show()}
   catch(e){as.textContent='Descrizioni non migliorate: '+e.message}finally{st.busy=false;b.disabled=!withDesc}};
  show();return box}
 function renderResult(){const m=model(),built=build(m),checks=checksOf(m,built),fails=blocking(checks);setStep(3);result.hidden=false;out.hidden=true;
  const head=E('div',undefined,'ad-result-head'),hd=E('div');hd.append(E('span','Stile '+direction(m.direction).title,'ad-angle'),E('h3',type(m.type).title+' · '+(m.brand.name||m.title)),E('p','Tutte le pagine dei formati scelti. Le voci le cambi nella tabella qui sopra: anteprime e controlli si aggiornano.','ad-idea'));head.append(hd);
  const noP=m.items.filter(x=>x.price==null&&!x.priceNote),noA=m.items.filter(x=>!x.declared),warn=E('div',undefined,'mn-missing');warn.hidden=!(noP.length||noA.length);
  if(!warn.hidden){warn.setAttribute('role','alert');warn.append(E('strong','Dati mancanti: RADIX non li inventa'));if(noP.length)warn.append(E('p','Senza prezzo: '+list(noP.map(x=>x.name))+'.'));if(noA.length)warn.append(E('p','Senza allergeni indicati: '+list(noA.map(x=>x.name))+'. Nel menu compare «chiedi al personale».'))}
  const checksBox=E('div',undefined,'mn-checks');checksBox.append(E('h4','Controlli prima dell’export'),...checks.map(checkRow));
  const gallery=E('div',undefined,'mn-gallery');
  for(const x of built.docs){const F=format(x.id),sec=E('section',undefined,'mn-piece');sec.dataset.format=x.id;const np=x.doc.pages.length;
   sec.append(E('h4',(F.kind==='tent'?'':'Menu ')+F.title+' · '+(F.kind==='folded'&&!x.doc.tooMany?'2 fogli A3, 4 facciate':F.kind==='tent'?'1 foglio A5, 2 facce':np+(np===1?' pagina':' pagine'))));
   if(F.line)sec.append(E('p',F.line+(F.kind==='folded'&&!x.doc.tooMany?' In anteprima i fogli come li stampa la tipografia: la linea grigia tratteggiata è la piega.':F.kind==='tent'?' La faccia di sopra è capovolta: si legge quando il cartoncino sta in piedi.':''),'ad-meta'));
   const row=E('div',undefined,'mn-pages');
   x.doc.pages.forEach((p,i)=>{const f=E('figure',undefined,'mn-fig mn-page-'+x.id);f.append(svgImg(P.previewSvg(x.doc,i,{guides:true}),(F.kind==='tent'?'':'Menu ')+F.title+' · '+(F.kind==='flow'||x.doc.tooMany?'pagina '+(i+1):p.label)),E('figcaption',F.kind==='flow'||x.doc.tooMany?'Pagina '+(i+1)+' · '+p.w+' × '+p.h+' mm':p.label+' · '+p.w+' × '+p.h+' mm'));row.append(f)});sec.append(row);gallery.append(sec)}
  const web=E('section',undefined,'mn-piece mn-web');web.dataset.format='web';web.append(E('h4','Pagina per il telefono'));const wr=E('div',undefined,'mn-web-row');
  const fr=E('iframe',undefined,'mn-web-frame');fr.setAttribute('sandbox','allow-scripts');fr.title='Anteprima della pagina del menu';fr.srcdoc=built.html;wr.append(fr);
  if(built.qr){const q=E('figure',undefined,'mn-fig mn-qr');q.append(svgImg(QR().toSvg(built.qr.qr,{title:'QR del menu'}),'QR verso '+built.url),E('figcaption','QR verso '+built.url));wr.append(q)}
  web.append(wr,E('p','Anteprima del file menu.html: filtri per allergeni e dieta, tema chiaro e scuro, nessun collegamento esterno.','ad-meta'));gallery.append(web);
  const make=button('Crea lo zip del menu','primary'),saveB=button('Salva nel progetto'),acts=E('div',undefined,'ps-actions mn-actions'),rs=E('p','','tool-status');rs.setAttribute('role','status');
  acts.append(make,saveB,E('span','Nessuna chiamata AI: i file si creano qui, senza costi.','muted'));
  if(fails.length){make.disabled=true;make.title='Si attiva quando i controlli in rosso sono sistemati.';rs.textContent='Prima sistema: '+fails.map(c=>c.label.toLowerCase()).join(', ')+'.'}
  make.onclick=async()=>{if(st.busy)return;const mm=model(),cs=checksOf(mm);if(blocking(cs).length){rs.textContent='Prima sistema i controlli in rosso.';return}
   const warns=cs.filter(c=>c.state==='warn');
   if(warns.length&&!await askConfirm({title:'Esportare con dati da completare?',message:warns.map(c=>c.label+': '+c.detail).join('\n'),ok:'Esporta lo stesso',cancel:'Torna alle voci'}))return;
   st.busy=true;make.disabled=true;rs.textContent='Creo i file: PDF per la tipografia, pagina web e QR…';
   try{st.files=await menuFiles(mm,{glyphs:()=>P.loadGlyphs(),prepare:(d,o)=>P.prepareImages(d,o),rasterize:d=>P.rasterize(d)});renderOut(mm);rs.textContent='Pronti '+st.files.length+' file.';out.scrollIntoView&&out.scrollIntoView({behavior:'smooth',block:'start'})}
   catch(e){rs.textContent='File non creati: '+e.message}finally{st.busy=false;make.disabled=false}};
  saveB.onclick=async()=>{if(!ctx.workspace||!ctx.projectId){rs.textContent='Apri un progetto per salvare il menu.';return}saveB.disabled=true;
   try{await saveToProject(ctx.workspace,ctx.projectId,savedRecord(model(),{by:ctx.by}));rs.replaceChildren(doc().createTextNode('Menu salvato nel progetto: voci, stile e formati. Lo riapri da qui. '));if(ctx.agentsUrl){const a=E('a','Apri in Agenti AI →');a.href=ctx.agentsUrl;rs.append(a)}loadSaved()}
   catch(e){rs.textContent='Salvataggio non riuscito: '+e.message}finally{saveB.disabled=false}};
  result.replaceChildren(head,warn,checksBox,aiBox(m),gallery,acts,rs)}
 function renderOut(m){setStep(4);out.hidden=false;const top=E('div',undefined,'mn-out-head');top.append(E('h3','Il menu è pronto'),E('p',st.files.length+' file: PDF per la tipografia, PDF per lo schermo, pagina web, QR e lista pulita, con le istruzioni.','ad-idea'));
  const zipB=button('Scarica tutto (.zip)','primary');zipB.onclick=()=>save(zipName(m),bundle(st.files));
  const groups=[['stampa/','Stampa'],['digitale/','Schermo ed email'],['web/','Pagina web'],['qr/','QR'],['','Lista e istruzioni']],cols=E('div',undefined,'mn-files');
  for(const [pfx,label] of groups){const ls=st.files.filter(f=>{const rel=f.name.slice(ROOT.length+1);return pfx?rel.startsWith(pfx):!rel.includes('/')});if(!ls.length)continue;
   const sec=E('section',undefined,'mn-group');sec.append(E('h5',label));const ul=E('ul');ls.forEach(f=>{const li=E('li'),b=button('Scarica','mn-dl');b.setAttribute('aria-label','Scarica '+f.name.split('/').pop());b.onclick=()=>save(f.name,f.data);const t=E('span',undefined,'mn-file-name');t.append(E('strong',f.label),E('small',f.name.split('/').pop()));li.append(t,b);ul.append(li)});sec.append(ul);cols.append(sec)}
  const acts=E('div',undefined,'ps-actions');acts.append(zipB);out.replaceChildren(top,acts,cols)}
 return wrap}

return Object.freeze({AGENT,MAX_ITEMS,ALLERGENS,TAGS,TYPES,DIRECTIONS,FORMATS,DEFAULT_FORMATS,DENSITIES,SHEETS,FROZEN_NOTE,INFO_NOTE,LEGEND_TITLE,MIN_PT,
 parseAllergens,parseTags,parsePrice,formatEuro,priceLabel,item,detectColumns,fromSheet,fromText,sections,modelOf,hasKit,usedAllergens,qrUrl,markersOf,coverLine,parseCover,refineOf,
 layoutFormat,layoutFolded,layoutTent,impose,sitePage,
 styleOf,layoutMenu,fitProblems,pdfBoxes,htmlPage,externalRefs,toCsv,contrastIssues,build,checksOf,blocking,groundCheck,aiPrompt,parseAi,improveDescriptions,applyDescriptions,
 readme,menuFiles,bundle,zipName,readStore,savedRecord,addRecord,saveToProject,fromRecord,menuStudio});
});
