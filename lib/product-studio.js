/* Studio Schede prodotto e feed: product copy for a whole sheet of products and the Google Merchant Center feed.
   1) The sheet (.xlsx or CSV, read by the CRM import readers like lib/catalog-studio.js) or the built-in example; the
      columns are matched by header (Italian and English) and, for links, images and GTINs, by their content; every match
      is editable. Questions: tone, channel (site, Amazon-style marketplace, Google Shopping), language (Italian), default
      brand, currency, condition, availability and Google category for the cells that are empty.
   2) Three styles (Essenziale, Racconto, Tecnico) tried on three sample products: ONE AI call to the Content e UX Writer,
      behind a confirmation dialog that states products, calls and the cost note. The person picks the style.
   3) Every other product in batches of 10 (one AI call each): one confirmation states products and calls up front;
      progress, pause and resume between batches, retry of the failed ones; each product can be edited or regenerated
      (one call, its own confirmation). Grounding: the texts may only use the row's own cells. Any number, material,
      certification or claim, size or colour that is not in the row is flagged and the product is «da verificare» until
      the text is fixed or the person says it was checked. Titles: at most 150 characters (brand + type + key attribute,
      the key words in the first 70), no prices, promotions, «!» or ALL CAPS; descriptions at most 5000 characters.
   4) The feed: a deterministic validator of the main Google Merchant Center product data rules (id, title, description,
      link, image_link, availability, price as «12.90 EUR», condition, brand, gtin or mpn or identifier_exists, https
      links, lengths, repeated ids, GTIN check digit), errors and warnings per product and a summary.
   5) Exports: the feed as TSV and as RSS 2.0 XML with the g: namespace, the texts as CSV for the site (generic, WooCommerce,
      Shopify; columns documented in LEGGIMI.txt), the check report, everything in one zip; save in the project (the
      «agents» document, key productSheets, every other key kept).
   RADIX does not upload anything to Merchant Center or to the shop. Pure part (columns, products, checks, prompts,
   parsing, batches, feed, files, saved records) runs in Node for the tests; productStudio() is the browser widget. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixProductStudio=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
// The styled RADIX confirmation (lib/radix-confirm.js) before every paid step; root.confirm only if it is missing.
const askConfirm=o=>{const C=root.RadixConfirm||(typeof require==='function'?require('./radix-confirm.js'):null);return C?C.ask(o):Promise.resolve(!!root.confirm([o.title,o.cost,o.message].filter(Boolean).join('\n')))};
const AGENT='web-content',BATCH=10,SAMPLES=3,MAX_PRODUCTS=500,MAX_SAVED=3,SAVE_BUDGET=450000,VALUE_MAX=600;
const LIMITS=Object.freeze({title:150,titleKey:70,description:5000,id:50,meta:155,alt:125,bullet:200,bullets:5,seoTitle:70});
// The other RADIX modules: the page's globals, or require() in Node.
function lib(name,file){if(root[name])return root[name];try{return typeof require==='function'?require(file):null}catch(e){return null}}
const copyLib=()=>lib('RadixCopyStudio','./copy-studio.js'),csvLib=()=>lib('RadixCrmCsv','../sales/crm-csv-core.js'),zipLib=()=>lib('RadixZip','./zip-lite.js');
const clean=s=>String(s==null?'':s).replace(/[\s ]+/g,' ').trim();
const block=s=>String(s==null?'':s).replace(/\r/g,'').replace(/[ \t ]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
const chars=s=>[...String(s==null?'':s)].length;
const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const words=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9%]+/g,' ').trim();
const slug=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60);

// ---- questions ----
const TONES=[['Semplice','semplice e chiaro, frasi brevi'],['Caldo','caldo e vicino, accogliente'],['Tecnico','preciso e concreto, da esperti'],['Elegante','elegante e misurato']];
const CHANNELS=[
 {id:'site',label:'Sito o negozio online',sub:'Paragrafi brevi e punti chiave per la pagina prodotto',words:'per la pagina prodotto del sito o del negozio online: 2-3 paragrafi brevi (in tutto circa 80-160 parole) e da 3 a 5 punti chiave'},
 {id:'amazon',label:'Marketplace stile Amazon',sub:'5 punti elenco e una descrizione più lunga',words:'per un marketplace in stile Amazon: 5 punti elenco concreti (massimo 200 caratteri ciascuno) e una descrizione di 120-250 parole'},
 {id:'google',label:'Google Shopping',sub:'Testo semplice per il feed, l’essenziale nelle prime righe',words:'per Google Shopping: una descrizione in testo semplice di 60-150 parole con le informazioni più importanti nelle prime righe, e 3 punti chiave'}];
const STYLES=[
 {id:'essenziale',label:'Essenziale',sub:'Frasi brevi, solo l’utile',words:'essenziale: frasi brevi, solo le informazioni utili, nessun aggettivo superfluo'},
 {id:'racconto',label:'Racconto',sub:'L’occasione e l’uso, con i soli fatti',words:'racconto: evoca l’uso, l’occasione e la sensazione del prodotto, sempre e solo con i fatti dei dati'},
 {id:'tecnico',label:'Tecnico',sub:'Dati in ordine e linguaggio preciso',words:'tecnico: caratteristiche, formato e composizione in ordine, linguaggio preciso e misurato'}];
const LANGUAGES=[['it','Italiano']];
const CURRENCIES=['EUR','USD','GBP','CHF','SEK','NOK','DKK','PLN','CZK','HUF','RON','BGN','JPY','CAD','AUD'];
const AVAILABILITY=['in_stock','out_of_stock','preorder','backorder'],CONDITIONS=['new','refurbished','used'];
const AVAILABILITY_LABEL={in_stock:'Disponibile',out_of_stock:'Esaurito',preorder:'Preordine',backorder:'Su ordinazione'},CONDITION_LABEL={new:'Nuovo',refurbished:'Ricondizionato',used:'Usato'};
const tone=t=>TONES.find(x=>x[0]===t)||TONES[0],channel=c=>CHANNELS.find(x=>x.id===c)||CHANNELS[0],style=s=>STYLES.find(x=>x.id===s)||null;
// The answers with every default: unknown values fall back to the first option.
function normalizeSettings(s){const x=s||{};return {tone:tone(x.tone)[0],channel:channel(x.channel).id,language:'it',brand:clean(x.brand).slice(0,70),
 currency:CURRENCIES.includes(String(x.currency||'').toUpperCase())?String(x.currency).toUpperCase():'EUR',condition:CONDITIONS.includes(x.condition)?x.condition:'new',
 availability:AVAILABILITY.includes(x.availability)?x.availability:'in_stock',googleCategory:clean(x.googleCategory).slice(0,250),shopUrl:clean(x.shopUrl).slice(0,300)}}

// ---- columns ----
// Order matters for the «contains» pass: sale price before price, image before link, Google category before category.
const FIELDS=[
 {id:'id',label:'ID / codice',need:true,aliases:['id','codice','cod','sku','codicearticolo','codart','articolo','itemid','productid','idprodotto','ref','riferimento','code','itemcode','productcode','variantsku']},
 {id:'title',label:'Titolo / nome',need:true,aliases:['titolo','nome','nomeprodotto','prodotto','denominazione','title','name','productname','product','item','nomearticolo']},
 {id:'description',label:'Descrizione',aliases:['descrizione','description','dettagli','desc','descrizionebreve','descrizionelunga','descrizioneprodotto','caratteristiche','details','shortdescription','longdescription','bodyhtml','body']},
 {id:'salePrice',label:'Prezzo scontato',aliases:['prezzoscontato','saleprice','prezzopromo','prezzoofferta','prezzosaldo','prezzoinofferta']},
 {id:'price',label:'Prezzo',need:true,aliases:['prezzo','price','prezzolistino','listino','prezzounitario','prezzoivato','prezzovendita','prezzoalpubblico','importo','regularprice','variantprice']},
 {id:'currency',label:'Valuta',aliases:['valuta','currency','divisa']},
 {id:'availability',label:'Disponibilità',aliases:['disponibilita','availability','stock','giacenza','scorte','quantita','qty','quantity','magazzino','instock','stockstatus','inventory']},
 {id:'brand',label:'Marca',aliases:['marca','brand','marchio','produttore','manufacturer','vendor']},
 {id:'gtin',label:'GTIN / EAN',aliases:['gtin','ean','ean13','codiceean','barcode','codiceabarre','upc','isbn','variantbarcode','gtin13']},
 {id:'mpn',label:'MPN',aliases:['mpn','codiceproduttore','partnumber','codicefornitore','manufacturerpartnumber']},
 {id:'image',label:'Link immagine',aliases:['imagelink','immagine','image','foto','urlimmagine','immagineurl','linkimmagine','imageurl','imagesrc','picture','photo','images','immagini','fotoprincipale']},
 {id:'link',label:'Link prodotto',aliases:['link','url','productlink','linkprodotto','urlprodotto','pagina','paginaprodotto','permalink','producturl','linkpagina']},
 {id:'googleCategory',label:'Categoria Google',aliases:['googleproductcategory','categoriagoogle','googlecategory','categoriaprodottogoogle']},
 {id:'category',label:'Categoria',aliases:['categoria','category','producttype','tipoprodotto','tipo','reparto','famiglia','collezione','categories','type','linea']},
 {id:'condition',label:'Condizione',aliases:['condizione','condition','statoprodotto','stato']},
 {id:'size',label:'Taglia / misure',aliases:['taglia','size','misura','misure','formato','dimensioni','dimensione']},
 {id:'color',label:'Colore',aliases:['colore','color','colour','tinta']},
 {id:'material',label:'Materiale',aliases:['materiale','material','materiali','composizione','tessuto']},
 {id:'weight',label:'Peso / contenuto',aliases:['peso','weight','pesonetto','contenuto','grammatura','quantitanetta','netto']}];
const field=id=>FIELDS.find(f=>f.id===id)||null;
const IMAGE_URL=/^https?:\/\/\S+\.(?:jpe?g|png|gif|webp|avif|bmp|tiff?)(?:[?#]\S*)?$/i,URL_RE=/^https?:\/\/\S+$/i;
// Headers (and the first rows) → {field: header}: exact alias first, then a header that contains an alias, then the
// content (image links, page links and GTINs) for the columns still unmatched. Each header is used once.
function detectMapping(headers,rows){const hs=(headers||[]).map(h=>String(h||'')),used=new Set(),out={};
 for(const f of FIELDS){const i=hs.findIndex(h=>h&&!used.has(h)&&f.aliases.includes(norm(h)));if(i>=0){out[f.id]=hs[i];used.add(hs[i])}}
 for(const f of FIELDS){if(out[f.id])continue;const i=hs.findIndex(h=>h&&!used.has(h)&&f.aliases.some(a=>a.length>3&&norm(h).includes(a)));if(i>=0){out[f.id]=hs[i];used.add(hs[i])}}
 const sample=(rows||[]).slice(0,25),share=(h,test)=>{const vs=sample.map(r=>clean(r&&r[h])).filter(Boolean);return vs.length?vs.filter(test).length/vs.length:0};
 const byContent=[['image',v=>IMAGE_URL.test(v)],['link',v=>URL_RE.test(v)&&!IMAGE_URL.test(v)],['gtin',v=>gtinCheck(v).ok]];
 for(const [id,test] of byContent){if(out[id])continue;const h=hs.find(h=>h&&!used.has(h)&&share(h,test)>=.8);if(h){out[id]=h;used.add(h)}}
 for(const f of FIELDS)if(!out[f.id])out[f.id]='';
 return out}
// The required columns still without a match.
const missingColumns=mapping=>FIELDS.filter(f=>f.need&&!(mapping||{})[f.id]).map(f=>f.label);

// ---- values ----
function parsePrice(v){if(typeof v==='number')return isFinite(v)?v:null;let s=clean(v).replace(/€|\$|£|\b(?:eur(?:o)?|usd|gbp|chf)\b/gi,'').replace(/\s/g,'');if(!/^-?[\d.,]+$/.test(s)||!/\d/.test(s))return null;
 const d=s.lastIndexOf(','),p=s.lastIndexOf('.');
 if(d>=0&&p>=0)s=d>p?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');
 else if(d>=0)s=(s.match(/,/g).length>1?s.replace(/,/g,''):s.replace(',','.'));
 else if(p>=0&&(s.match(/\./g).length>1||/^-?\d{1,3}\.\d{3}$/.test(s)&&!/^-?0\./.test(s)))s=s.replace(/\./g,'');
 const n=Number(s);return isFinite(n)?n:null}
function currencyIn(v){const s=String(v||'');if(/€|\beur(?:o)?\b/i.test(s))return 'EUR';if(/\$|\busd\b/i.test(s))return 'USD';if(/£|\bgbp\b/i.test(s))return 'GBP';if(/\bchf\b/i.test(s))return 'CHF';return ''}
// «12.90 EUR», the format of the feed.
const feedPrice=(n,cur)=>n==null||!isFinite(n)?'':n.toFixed(2)+' '+cur;
const AVAIL_WORDS={in_stock:['instock','disponibile','disponibili','si','yes','true','inmagazzino','prontaconsegna','pronto','available','inassortimento'],
 out_of_stock:['outofstock','esaurito','esaurita','esauriti','nondisponibile','no','false','terminato','soldout','unavailable'],
 preorder:['preorder','preordine','prenotabile','inprenotazione','prenotazione'],backorder:['backorder','suordinazione','inarrivo','ordinabile','surichiesta','suprenotazione']};
// A cell → in_stock, out_of_stock, preorder or backorder; a quantity counts (0 = out of stock); '' when not understood.
function availabilityOf(v){const raw=clean(v);if(!raw)return '';if(/^-?\d+(?:[.,]0+)?$/.test(raw))return parseFloat(raw.replace(',','.'))>0?'in_stock':'out_of_stock';const s=norm(raw);
 for(const k of AVAILABILITY)if(k.replace(/_/g,'')===s||AVAIL_WORDS[k].includes(s))return k;return ''}
function conditionOf(v){const s=norm(v);if(!s)return '';if(['new','nuovo','nuova','nuovi'].includes(s))return 'new';if(['used','usato','usata','usati','secondamano'].includes(s))return 'used';
 if(['refurbished','ricondizionato','ricondizionata','rigenerato','rigenerata'].includes(s))return 'refurbished';return ''}
// GTIN-8, -12, -13 or -14 with its check digit; GTIN-13 starting with 2 is for internal use (shops, weighed goods).
function gtinCheck(v){const s=String(v==null?'':v).replace(/[\s-]/g,'');if(!s)return {ok:false,why:'vuoto'};if(!/^\d+$/.test(s))return {ok:false,why:'solo cifre'};
 if(![8,12,13,14].includes(s.length))return {ok:false,why:s.length+' cifre: servono 8, 12, 13 o 14'};if(/^0+$/.test(s))return {ok:false,why:'tutti zeri'};
 const d=s.split('').map(Number),check=d.pop();let sum=0;d.reverse().forEach((x,i)=>{sum+=x*(i%2===0?3:1)});
 if((10-sum%10)%10!==check)return {ok:false,why:'cifra di controllo errata (dovrebbe finire con '+(10-sum%10)%10+')'};
 if(s.length===13&&s[0]==='2')return {ok:false,why:'prefisso 2: codice a uso interno del negozio, non valido per Google'};
 return {ok:true,gtin:s}}
const isUrl=v=>{try{const u=new URL(String(v));return /^https?:$/.test(u.protocol)&&/\./.test(u.hostname)}catch(e){return false}};

// ---- products ----
// rows: [{header: value}] (crm-csv-core shape). Rows with neither id nor title are skipped; over MAX_PRODUCTS are cut.
// key: a stable internal key (the sheet row), because two rows may share the same id.
function toProducts(rows,mapping,settings,{limit=MAX_PRODUCTS}={}){const m=mapping||{},s=normalizeSettings(settings),get=(r,k)=>m[k]?clean(r[m[k]]):'',out=[];let skipped=0;
 (rows||[]).forEach((r,i)=>{const p={key:'R'+(i+2),row:i+2,id:get(r,'id'),name:get(r,'title'),description:m.description?block(r[m.description]):'',price:get(r,'price'),salePrice:get(r,'salePrice'),
   currencyRaw:get(r,'currency'),availabilityRaw:get(r,'availability'),brand:get(r,'brand'),gtin:get(r,'gtin').replace(/[\s-]/g,''),mpn:get(r,'mpn'),image:get(r,'image'),link:get(r,'link'),
   category:get(r,'category'),googleCategory:get(r,'googleCategory')||s.googleCategory,conditionRaw:get(r,'condition'),size:get(r,'size'),color:get(r,'color'),material:get(r,'material'),weight:get(r,'weight'),defaults:[]};
  if(!p.id&&!p.name){skipped++;return}
  p.priceValue=parsePrice(p.price);p.salePriceValue=p.salePrice?parsePrice(p.salePrice):null;
  const cur=String(p.currencyRaw||'').toUpperCase();p.currency=/^[A-Z]{3}$/.test(cur)?cur:currencyIn(p.price)||s.currency;if(p.currencyRaw&&!/^[A-Z]{3}$/.test(cur))p.currencyBad=p.currencyRaw;
  p.availability=availabilityOf(p.availabilityRaw);if(!p.availabilityRaw){p.availability=s.availability;p.defaults.push('availability')}
  p.condition=conditionOf(p.conditionRaw);if(!p.conditionRaw){p.condition=s.condition;p.defaults.push('condition')}
  if(!p.brand&&s.brand){p.brand=s.brand;p.defaults.push('brand')}
  p.facts=factsOf(r,m,p);out.push(p)});
 return {products:out.slice(0,limit),skipped,cut:Math.max(0,out.length-limit),total:out.length}}
// Every non-empty cell of the row (links left out: they are not facts to write about), plus the default brand.
function factsOf(r,m,p){const out=[],seen=new Set();
 for(const [h,v] of Object.entries(r||{})){const t=block(v);if(!h||!t||URL_RE.test(t)||seen.has(h))continue;seen.add(h);out.push([clean(h).slice(0,60),t.slice(0,VALUE_MAX)])}
 if(p&&p.defaults.includes('brand'))out.push(['Marca',p.brand]);
 return out}
const factsText=p=>(p&&p.facts||[]).map(([k,v])=>k+': '+v).join('\n');
// Three sample products for the styles: the most complete rows, from different categories when possible.
function pickSamples(products,n=SAMPLES){const list=(products||[]).filter(p=>p.name).map((p,i)=>({p,i,score:p.facts.length+(p.description?2:0)+(p.priceValue!=null?1:0)}));
 list.sort((a,b)=>b.score-a.score||a.i-b.i);const out=[],cats=new Set();
 for(const x of list){if(out.length>=n)break;const c=norm(x.p.category);if(c&&cats.has(c))continue;cats.add(c);out.push(x.p)}
 for(const x of list){if(out.length>=n)break;if(!out.includes(x.p))out.push(x.p)}
 return out.sort((a,b)=>a.row-b.row)}

// ---- grounding: only the row's facts ----
const CLAIMS=[[/\bbio\b|\bbiologic[oaie]\b|\borganic\b/i,'biologico'],[/\bd\.?o\.?p\.?(?=\W|$)/i,'DOP'],[/\bi\.?g\.?p\.?(?=\W|$)/i,'IGP'],[/\bdocg?\b/i,'DOC o DOCG'],[/\bstg\b/i,'STG'],
 [/\bvegan[oaie]?\b/i,'vegano'],[/\bvegetarian[oaie]?\b/i,'vegetariano'],[/\bsenza glutine\b|\bgluten[- ]?free\b|\bcelia/i,'senza glutine'],[/\bsenza lattosio\b|\blactose[- ]?free\b/i,'senza lattosio'],
 [/\bsenza (?:zuccheri aggiunti|zucchero)\b/i,'senza zucchero'],[/\bsenza conservanti\b/i,'senza conservanti'],[/\bsenza (?:olio di )?palma\b/i,'senza olio di palma'],[/\bsenza uova\b/i,'senza uova'],
 [/\bmade in italy\b|\bprodott[oaie] in italia\b|\b100\s?% italian[oaie]\b|\bitalian[oaie] al 100\b/i,'origine italiana'],[/\bkm ?0\b|\bchilometro zero\b/i,'km 0'],[/\bhalal\b/i,'halal'],[/\bkosher\b/i,'kosher'],
 [/\bfatt[oaie] a mano\b|\bhandmade\b/i,'fatto a mano'],[/\bartigian(?:al[ei]|ato|at[aei])\b/i,'artigianale'],[/\bcertificat[oaie]\b|\bcertificazione\b|\bfsc\b|\biso ?\d{3,5}\b/i,'certificazione'],
 [/\bpremiat[oaie]\b|\bpremio\b|\bmedaglia\b/i,'premio'],[/\bgaranzia\b|\bgarantit[oaie]\b/i,'garanzia'],[/\bipoallergenic[oaie]\b|\bdermatologicamente\b/i,'ipoallergenico'],
 [/\bnatural[ei] al 100\b|\b100\s?% natural[ei]\b/i,'100% naturale'],[/\blievito madre\b|\bpasta madre\b/i,'lievito madre'],[/\bintegral[ei]\b/i,'integrale'],[/\bimpermeabil[ei]\b|\bwaterproof\b/i,'impermeabile'],
 [/\blavabil[ei] in lavatrice\b|\blavastoviglie\b/i,'lavabile']];
const MATERIALS=['cotone','lino','seta','lana','cashmere','pelle','cuoio','camoscio','legno','faggio','rovere','castagno','bambu','vimini','rattan','juta','canapa','sughero','acciaio','inox','ferro','ghisa',
 'alluminio','ottone','rame','argento','vetro','cristallo','ceramica','porcellana','gres','terracotta','marmo','plastica','silicone','poliestere','nylon','velluto','latta','cartone','feltro','resina','ardesia'];
const COLOURS=['rosso','blu','verde','giallo','nero','bianco','grigio','rosa','viola','arancione','marrone','beige','azzurro','celeste','turchese','bordeaux','avorio','fucsia','lilla','senape','ocra','oro','argento','crema'];
// «ceramica» also matches «ceramiche», «legno» «legni»; «inox» only itself.
const wordRe=w=>new RegExp('(?:^| )'+(/[aeio]$/.test(w)?w.slice(0,-1)+'[aeio]':w)+'(?= |$)');
function groundingFlags(text,product){const facts=factsText(product)+'\n'+[product&&product.name,product&&product.brand,product&&product.category].join('\n'),t=String(text||''),tw=' '+words(t)+' ',fw=' '+words(facts)+' ',out=[];
 const C=copyLib(),nums=C&&typeof C.unverifiedNumbers==='function'?C.unverifiedNumbers(t,facts):[];nums.forEach(n=>out.push({kind:'number',text:n}));
 for(const [re,label] of CLAIMS)if(re.test(t)&&!re.test(facts))out.push({kind:'claim',text:label});
 for(const m of MATERIALS){const re=wordRe(m);if(re.test(tw)&&!re.test(fw))out.push({kind:'material',text:m})}
 if(product&&product.color)for(const c of COLOURS){const re=wordRe(c);if(re.test(tw)&&!re.test(fw))out.push({kind:'colour',text:c})}
 const sizes=new Set();(t.match(/\btaglia\s+([a-z0-9]{1,5})\b/gi)||[]).forEach(x=>sizes.add(x.split(/\s+/)[1]));(t.match(/\b(?:xxs|xs|xl|xxl|xxxl)\b/gi)||[]).forEach(x=>sizes.add(x));
 for(const sz of sizes)if(!new RegExp('(?:^| )'+words(sz)+'(?= |$)').test(fw))out.push({kind:'size',text:sz});
 return out}
const FLAG_LABEL={number:'numero',claim:'dichiarazione',material:'materiale',colour:'colore',size:'taglia'};
const flagText=f=>f.kind==='number'?'Il numero «'+f.text+'» non è nella riga del foglio.':f.kind==='claim'?'«'+f.text+'» non è scritto nella riga del foglio.'
 :f.kind==='material'?'Il materiale «'+f.text+'» non è nella riga del foglio.':f.kind==='colour'?'Il colore «'+f.text+'» non è nella riga del foglio.':'La taglia «'+f.text+'» non è nella riga del foglio.';

// ---- title and text rules ----
const PROMO=/\b(?:scont[oiate]+|offert[ae]|promo(?:zion[ei])?|saldi|gratis|gratuit[aoie]|spedizion[ei] gratuit[ae]|free shipping|black friday|cyber monday|outlet|imperdibil[ei]|occasione|best ?seller|solo oggi|prezzo (?:speciale|bomba)|compra ora|acquista ora|miglior prezzo)\b|-\s?\d+\s?%|\b\d+\s?%\s?(?:di sconto|off)\b|[€$£]|\b\d+(?:[.,]\d{2})\s?(?:eur|euro)\b/i;
// Words of 4+ letters written in capitals, unless the brand is written that way.
function capsWords(text,brand){const ok=new Set(String(brand||'').split(/\s+/).filter(Boolean));return (String(text||'').match(/\b[A-ZÀ-Ý]{4,}\b/g)||[]).filter(w=>!ok.has(w))}
function titleIssues(title,product){const t=clean(title),out=[];if(!t)return [{kind:'empty',msg:'Titolo vuoto.'}];
 if(chars(t)>LIMITS.title)out.push({kind:'length',msg:'Titolo di '+chars(t)+' caratteri: Google ne accetta al massimo '+LIMITS.title+'.'});
 const promo=PROMO.exec(t);if(promo)out.push({kind:'promo',msg:'Niente prezzi né promozioni nel titolo («'+clean(promo[0])+'»).'});
 if(/!/.test(t))out.push({kind:'promo',msg:'Niente punti esclamativi nel titolo.'});
 const caps=capsWords(t,product&&product.brand);if(caps.length)out.push({kind:'caps',msg:'Niente parole TUTTE MAIUSCOLE nel titolo: '+caps.slice(0,3).join(', ')+'.'});
 const b=product&&product.brand;if(b&&!words(t.slice(0,LIMITS.titleKey*2)).includes(words(b)))out.push({kind:'brand',soft:true,msg:'Metti la marca «'+b+'» nel titolo, meglio all’inizio.'});
 return out}
// Over a limit: cut at the end of the last sentence that fits when it keeps most of the text, else at the last word.
function fit(s,max){const t=[...String(s)];if(t.length<=max)return String(s);const cut=t.slice(0,max).join('');
 const end=Math.max(...['. ','! ','? ','.\n'].map(p=>cut.lastIndexOf(p)));if(end>=max*.6)return cut.slice(0,end+1);
 const sp=Math.max(cut.lastIndexOf(' '),cut.lastIndexOf('\n'));return (sp>max/2?cut.slice(0,sp):cut).replace(/[\s,;:–—-]+$/,'')}
// A title from the sheet alone (no AI): brand + name + the key attribute, at most 150 characters, capitals tamed.
// Promotional words are left in place: the checks point them out, the person decides.
function buildTitle(p){const name=clean(p&&p.name),brand=clean(p&&p.brand),caps=/[A-ZÀ-Ý]/.test(name)&&name===name.toUpperCase();
 const tame=s=>caps?s.charAt(0)+s.slice(1).toLowerCase():s.replace(/\b[A-ZÀ-Ý]{4,}\b/g,w=>brand.split(/\s+/).includes(w)?w:w.charAt(0)+w.slice(1).toLowerCase());
 const parts=[];if(brand&&!words(name).includes(words(brand)))parts.push(brand);parts.push(tame(name));
 for(const k of ['weight','size','color','material']){const v=clean(p&&p[k]);if(v&&!words(parts.join(' ')).includes(words(v))){parts.push(v);break}}
 return fit(parts.filter(Boolean).join(' ').replace(/\s+/g,' '),LIMITS.title)}

// ---- prompts ----
const RULES=['Regola più importante: per ogni prodotto usa SOLO i dati scritti nella sua scheda qui sotto. Non inventare numeri, misure, pesi, quantità, materiali, ingredienti, certificazioni (bio, DOP, IGP…), origine, premi, garanzie, taglie o colori. Se un dato non c’è, non scriverlo e non dire che manca.',
 'Titolo per Google: massimo 150 caratteri, le parole chiave nei primi 70; schema «Marca + tipo di prodotto + attributo chiave» (peso, formato, taglia, colore o materiale, solo se è nei dati). Niente prezzi, sconti, promozioni, punti esclamativi o parole TUTTE MAIUSCOLE.',
 'Descrizione: al massimo 5000 caratteri, senza prezzi, sconti, spedizioni o promozioni, senza link, senza HTML e senza Markdown; paragrafi separati da una riga vuota.',
 'Punti chiave: frasi brevi, massimo 200 caratteri ciascuno. Meta description: una frase entro 155 caratteri. Alt dell’immagine: cosa si vede nella foto del prodotto, entro 125 caratteri, senza «immagine di».',
 'Ogni prodotto ha testi suoi: non ripetere le stesse frasi tra prodotti diversi.','Italiano corretto e naturale, niente emoji.'];
function productBlock(p){const L=['### CHIAVE: '+p.key+(p.id?' · codice '+clean(p.id).slice(0,50):'')];
 const facts=p.facts.filter(([k])=>!/^(?:link|url|immagine|image|foto)/i.test(k));L.push(...facts.map(([k,v])=>'- '+k+': '+clean(v).slice(0,VALUE_MAX)));return L.join('\n')}
const SHAPE={chiave:'la CHIAVE del prodotto',titolo:'titolo per Google, max 150 caratteri',descrizione:'la descrizione',punti:['punto chiave'],meta:'meta description, max 155 caratteri',alt:'alt della foto, max 125 caratteri'};
function head(settings,project){const s=normalizeSettings(settings),p=project||{},L=[];
 L.push('Scrivi le schede prodotto'+(p.name?' per «'+clean(p.name).slice(0,80)+'»':'')+' in '+LANGUAGES[0][1].toLowerCase()+'.');
 L.push('Tono: '+tone(s.tone)[1]+'.','Canale: '+channel(s.channel).words+'.');return L}
// The three styles on the sample products: ONE call, JSON back.
function stylesPrompt(samples,settings,project){const list=(samples||[]).slice(0,SAMPLES);if(!list.length)throw Error('Nessun prodotto da provare: carica il foglio.');
 const L=head(settings,project);L.push('Prova '+STYLES.length+' stili diversi sugli stessi '+list.length+' prodotti, così si può scegliere quello da usare per tutto il catalogo:');
 STYLES.forEach(x=>L.push('- '+x.label+': '+x.words+'.'));L.push(...RULES,'','I prodotti:','',...list.map(productBlock),'');
 L.push('Rispondi solo con JSON valido, senza testo prima o dopo:\n'+JSON.stringify({stili:STYLES.map(x=>({stile:x.label,prodotti:[SHAPE]}))}));
 return L.join('\n')}
// One batch in the chosen style: ONE call, JSON back.
function batchPrompt(products,styleId,settings,project){const list=products||[],st=style(styleId)||STYLES[0];if(!list.length)throw Error('Nessun prodotto nel lotto.');
 const L=head(settings,project);L.push('Stile scelto: '+st.words+'.',...RULES,'','I '+list.length+' prodotti di questo lotto:','',...list.map(productBlock),'');
 L.push('Rispondi solo con JSON valido, senza testo prima o dopo, con un oggetto per prodotto e la sua CHIAVE:\n'+JSON.stringify({prodotti:[SHAPE]}));
 return L.join('\n')}

// ---- parsing ----
function parseJson(text){const raw=String(text||'').replace(/\r/g,''),f=/```(?:json)?\s*\n?([\s\S]*?)```/i.exec(raw),body=f?f[1]:raw,s=body.search(/[[{]/),e=Math.max(body.lastIndexOf('}'),body.lastIndexOf(']'));
 if(s<0||e<=s)return null;const t=body.slice(s,e+1);for(const x of [t,t.replace(/,\s*([}\]])/g,'$1').replace(/[“”]/g,'"')]){try{return JSON.parse(x)}catch(err){}}return null}
function pickKey(o,keys){if(!o||typeof o!=='object'||Array.isArray(o))return undefined;const ks=Object.keys(o);for(const k of keys){const hit=ks.find(x=>norm(x)===norm(k));if(hit!==undefined)return o[hit]}return undefined}
const listOf=v=>Array.isArray(v)?v:typeof v==='string'?v.split('\n'):[];
const stripBullet=s=>clean(String(s==null?'':s).replace(/^\s*(?:[-*•–·]|\d{1,2}[.)])\s+/,'').replace(/\*\*|__|`/g,''));
const plain=s=>block(String(s==null?'':s).replace(/<\/p>\s*<p[^>]*>/gi,'\n\n').replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]{1,200}>/g,'').replace(/\*\*|__|`|^#+\s*/gm,''));
// A raw AI object → the item of one product, trimmed to the limits and checked against the row.
function itemFrom(raw,product,styleId){if(!raw||typeof raw!=='object')return null;
 const it={key:product.key,style:styleId||'',title:clean(stripBullet(pickKey(raw,['titolo','title','titolo_google','titolo google']))),description:plain(pickKey(raw,['descrizione','description','testo'])),
  bullets:listOf(pickKey(raw,['punti','punti_chiave','punti chiave','bullets','bullet_points','highlights'])).map(x=>stripBullet(typeof x==='string'?x:x&&(x.testo||x.text)||'')).filter(x=>x.length>1).slice(0,LIMITS.bullets),
  meta:clean(pickKey(raw,['meta','meta_description','metadescription'])),alt:clean(pickKey(raw,['alt','alt_immagine','alt_text','testo_alternativo'])).replace(/^(?:immagine|foto) di\s+/i,'')};
 if(!it.title&&!it.description)return null;return finishItem(it,product)}
// Limits (trimmed and noted), title rules, grounding flags and the status. Runs again after every manual edit.
function finishItem(it,product){const issues=[],trim=(k,max,label)=>{const v=it[k];if(chars(v)>max){it[k]=fit(v,max);issues.push({kind:'length',msg:label+' di '+chars(v)+' caratteri accorciato a '+max+': rileggilo.'})}};
 trim('title',LIMITS.title,'Titolo');trim('description',LIMITS.description,'Descrizione');trim('meta',LIMITS.meta,'Meta description');trim('alt',LIMITS.alt,'Alt dell’immagine');
 it.bullets=(it.bullets||[]).map(b=>chars(b)>LIMITS.bullet?fit(b,LIMITS.bullet):b);
 titleIssues(it.title,product).forEach(i=>{if(i.kind!=='length')issues.push(i)});
 if(!it.description)issues.push({kind:'empty',msg:'Descrizione vuota.'});
 it.issues=issues.concat((it.issues||[]).filter(i=>i.kind==='duplicate'));
 it.flags=groundingFlags([it.title,it.description,...it.bullets,it.meta,it.alt].join('\n'),product);
 it.status=it.flags.length&&!it.verified?'verify':'ok';return it}
// The reply of a batch → {items: Map key → item, missing: [keys]}. By CHIAVE, then by the product's code when it is
// unique, then by position when the reply has exactly one object per product and no keys.
function parseBatch(text,products,styleId){const d=text&&typeof text==='object'?text:parseJson(text),list=products||[],items=new Map();
 let arr=Array.isArray(d)?d:d&&typeof d==='object'?pickKey(d,['prodotti','products','schede','items']):null;if(!Array.isArray(arr))arr=[];
 const byKey=new Map(list.map(p=>[norm(p.key),p])),ids=new Map();list.forEach(p=>{const k=norm(p.id);if(!k)return;ids.set(k,ids.has(k)?null:p)});
 const loose=[];arr.forEach(x=>{if(!x||typeof x!=='object')return;const k=norm(pickKey(x,['chiave','key'])),c=norm(pickKey(x,['codice','id','sku']));
  const p=byKey.get(k)||(c&&ids.get(c))||null;if(p&&!items.has(p.key)){const it=itemFrom(x,p,styleId);if(it)items.set(p.key,it)}else if(!p)loose.push(x)});
 if(!items.size&&loose.length===list.length)loose.forEach((x,i)=>{const it=itemFrom(x,list[i],styleId);if(it)items.set(list[i].key,it)});
 return {items,missing:list.filter(p=>!items.has(p.key)).map(p=>p.key)}}
// The reply of the styles call → [{style, label, items: Map}] in STYLES order (by name, else by position).
function parseStyles(text,samples){const d=parseJson(text);let arr=Array.isArray(d)?d:d&&typeof d==='object'?pickKey(d,['stili','styles','proposte']):null;if(!Array.isArray(arr))return [];
 const out=[];arr.slice(0,6).forEach((x,i)=>{if(!x||typeof x!=='object')return;const name=norm(pickKey(x,['stile','style','nome','name']));
  const st=STYLES.find(s=>name&&(norm(s.label)===name||name.startsWith(norm(s.label).slice(0,5))))||STYLES.find(s=>!out.some(o=>o.style===s.id)&&STYLES.indexOf(s)===i);
  if(!st||out.some(o=>o.style===st.id))return;const r=parseBatch({prodotti:pickKey(x,['prodotti','products'])||[]},samples,st.id);
  if(r.items.size)out.push({style:st.id,label:st.label,sub:st.sub,items:r.items})});
 return out.sort((a,b)=>STYLES.findIndex(s=>s.id===a.style)-STYLES.findIndex(s=>s.id===b.style))}
// The same description on two products: noted on both (Google and shops reward texts of their own).
function markDuplicates(items){const seen=new Map();for(const it of items){it.issues=(it.issues||[]).filter(i=>i.kind!=='duplicate');const k=words(it.description);if(k.length<40)continue;if(!seen.has(k))seen.set(k,[]);seen.get(k).push(it)}
 let n=0;for(const group of seen.values())if(group.length>1)group.forEach(it=>{n++;it.issues.push({kind:'duplicate',soft:true,msg:'La stessa descrizione è usata da '+(group.length-1)+' altr'+(group.length>2?'i prodotti':'o prodotto')+': rendila unica.'})});
 return n}

// ---- batches ----
// The products still without texts, in batches of `size`.
function planBatches(products,items,{size=BATCH}={}){const has=items instanceof Map?k=>items.has(k):k=>!!(items||{})[k],todo=(products||[]).filter(p=>!has(p.key)).map(p=>p.key),out=[];
 for(let i=0;i<todo.length;i+=size)out.push(todo.slice(i,i+size));return out}
const newRun=batches=>({batches:(batches||[]).map((keys,i)=>({n:i+1,keys:keys.slice(),status:'todo',error:''})),paused:false,running:false});
const runCounts=run=>{const b=run.batches,c=s=>b.filter(x=>x.status===s);return {total:b.length,done:c('done').length,error:c('error').length,todo:c('todo').length,
 products:b.reduce((n,x)=>n+x.keys.length,0),productsDone:c('done').reduce((n,x)=>n+x.keys.length,0)}};
// Runs the batches still to do, one at a time: call(keys) → resolves when that batch's items are stored. A pause takes
// effect between batches (the batch in flight finishes). A failed batch is marked and the run goes on.
// Resolves 'done', 'paused' or 'stopped' (call threw a fatal error with .fatal: credits, session).
async function runBatches(run,{call,onUpdate}={}){if(run.running)return 'running';run.running=true;const up=()=>{try{onUpdate&&onUpdate(run)}catch(e){}};
 try{for(const b of run.batches){if(b.status==='done'||b.status==='error')continue;if(run.paused){up();return 'paused'}
   b.status='running';up();
   try{await call(b.keys,b);b.status='done';b.error=''}catch(e){b.status='error';b.error=(e&&e.message)||'Errore imprevisto';if(e&&e.fatal){up();return 'stopped'}}
   up()}
  return run.paused&&run.batches.some(b=>b.status==='todo')?'paused':'done'}
 finally{run.running=false;up()}}
// «Riprova»: the failed batches go back to the queue.
function retryFailed(run){let k=0;run.batches.forEach(b=>{if(b.status==='error'){b.status='todo';b.error='';k++}});return k}
const FATAL=/credito|crediti|chiave api|sessione scaduta|accedi di nuovo|billing|quota|rate limit|overloaded|too many requests/i;

// ---- the feed ----
const FEED_COLUMNS=['id','title','description','link','image_link','availability','price','sale_price','condition','brand','gtin','mpn','identifier_exists','google_product_category','product_type','color','size','material'];
const REQUIRED_COLUMNS=['id','title','description','link','image_link','availability','price','condition','brand'];
// One feed row per product: the generated texts when there are, otherwise the sheet's description and a title built
// from the sheet (buildTitle).
function feedRows(products,items){const get=k=>items instanceof Map?items.get(k):(items||{})[k];
 return (products||[]).map(p=>{const it=get(p.key),useIt=it&&it.status!=='error';
  const r={key:p.key,row:p.row,id:clean(p.id),title:useIt&&it.title?clean(it.title):buildTitle(p),description:block(useIt&&it.description?it.description:p.description),link:clean(p.link),image_link:clean(p.image),
   availability:p.availability||clean(p.availabilityRaw),price:p.priceValue!=null?feedPrice(p.priceValue,p.currency):clean(p.price),sale_price:p.salePriceValue!=null?feedPrice(p.salePriceValue,p.currency):clean(p.salePrice),
   condition:p.condition||clean(p.conditionRaw),brand:clean(p.brand),gtin:clean(p.gtin),mpn:clean(p.mpn),identifier_exists:'',google_product_category:clean(p.googleCategory),product_type:clean(p.category),
   color:clean(p.color),size:clean(p.size),material:clean(p.material),_p:p,_it:useIt?it:null};
  if(!r.gtin&&!r.mpn)r.identifier_exists='no';return r})}
const LINK_HELP='un indirizzo completo che inizia con https://';
function linkIssue(v,label,attr){if(!v)return {field:attr,level:'error',msg:label+' mancante.'};if(!isUrl(v))return {field:attr,level:'error',msg:label+' non valido: serve '+LINK_HELP+'.'};
 if(!/^https:/i.test(v))return {field:attr,level:'error',msg:label+' in http: usa '+LINK_HELP+'.'};return null}
// The main checks of the Google Merchant Center product data specification. → [{field, level: error|warning, msg}]
function validateRow(r,ctx={}){const out=[],e=(field,msg)=>out.push({field,level:'error',msg}),w=(field,msg)=>out.push({field,level:'warning',msg}),p=r._p||{};
 if(!r.id)e('id','ID mancante: ogni prodotto ne ha uno, unico e stabile.');else{if(chars(r.id)>LIMITS.id)e('id','ID di '+chars(r.id)+' caratteri: massimo '+LIMITS.id+'.');
  const dup=ctx.ids&&ctx.ids.get(r.id);if(dup&&dup.length>1){const o=dup.filter(x=>x!==r.row);e('id','ID ripetuto: lo usa anche '+(o.length===1?'la riga ':'le righe ')+o.join(', ')+' del foglio.')}}
 if(!r.title)e('title','Titolo mancante.');else{for(const i of titleIssues(r.title,{brand:r.brand}))if(i.kind==='length'||i.kind==='promo')e('title',i.msg);else if(i.kind!=='brand')w('title',i.msg)}
 if(!r.description)e('description','Descrizione mancante.');else{if(chars(r.description)>LIMITS.description)e('description','Descrizione di '+chars(r.description)+' caratteri: massimo '+LIMITS.description+'.');
  if(/https?:\/\//i.test(r.description))w('description','Niente link nella descrizione.');
  const pr=PROMO.exec(r.description);if(pr&&/scont|offert|promo|saldi|gratis|gratuit|spedizion|free|black|cyber|outlet|imperdibil|solo oggi|compra|acquista|%|€|\$|£/i.test(pr[0]))w('description','Niente promozioni o prezzi nella descrizione («'+clean(pr[0])+'»).');
  if(chars(r.description)<50)w('description','Descrizione molto corta: scrivi almeno 2-3 frasi utili.')}
 const l=linkIssue(r.link,'Link del prodotto','link');if(l)out.push(l);
 const im=linkIssue(r.image_link,'Link dell’immagine','image_link');if(im)out.push(im);else if(!IMAGE_URL.test(r.image_link)&&!/[?&]/.test(r.image_link))w('image_link','Il link non finisce con .jpg, .png, .webp o .gif: controlla che apra l’immagine.');
 if(!r.availability)e('availability','Disponibilità mancante.');else if(!AVAILABILITY.includes(r.availability))e('availability','Disponibilità «'+r.availability+'» non riconosciuta: usa in_stock, out_of_stock, preorder o backorder.');
 else{if(r.availability==='preorder'||r.availability==='backorder')w('availability','Con '+r.availability+' Google chiede anche availability_date (la data di arrivo): aggiungila in Merchant Center.');
  if(p.defaults&&p.defaults.includes('availability'))w('availability','Disponibilità non indicata nel foglio: messo «'+r.availability+'» come predefinito.')}
 if(!r.price)e('price','Prezzo mancante.');else if(!/^\d+(?:\.\d{1,2})? [A-Z]{3}$/.test(r.price))e('price','Prezzo «'+r.price+'» non valido: serve un numero, ad esempio «12.90 EUR».');
 else{const [n,cur]=r.price.split(' ');if(+n<=0)e('price','Prezzo a zero: Google non accetta prodotti gratuiti nel feed.');if(!CURRENCIES.includes(cur))e('price','Valuta «'+cur+'» non riconosciuta (codice ISO 4217, ad esempio EUR).');
  if(r.sale_price){const s=/^(\d+(?:\.\d{1,2})?) [A-Z]{3}$/.exec(r.sale_price);if(!s)e('sale_price','Prezzo scontato «'+r.sale_price+'» non valido.');else if(+s[1]>=+n)e('sale_price','Il prezzo scontato deve essere più basso del prezzo.')}}
 if(p.currencyBad)w('price','Valuta «'+p.currencyBad+'» non riconosciuta: usato '+p.currency+'.');
 if(!CONDITIONS.includes(r.condition))e('condition','Condizione «'+r.condition+'» non riconosciuta: usa new, refurbished o used.');
 if(!r.brand)e('brand','Marca mancante: Google la chiede per i prodotti nuovi (anche la tua, se li produci tu).');else if(p.defaults&&p.defaults.includes('brand'))w('brand','Marca vuota nel foglio: usata quella predefinita «'+r.brand+'».');
 if(r.gtin){const g=gtinCheck(r.gtin);if(!g.ok)e('gtin','GTIN «'+r.gtin+'» non valido: '+g.why+'.')}
 if(r.identifier_exists==='no')w('identifier_exists','Senza GTIN né MPN: nel feed va identifier_exists = no. Se il prodotto ha un codice a barre, aggiungilo: Google lo mostra di più.');
 const it=r._it;if(it&&it.status==='verify')w('description','Testi da verificare: '+it.flags.length+' dat'+(it.flags.length===1?'o':'i')+' non presenti nella riga del foglio.');
 return out}
// All rows: issues per product and the summary (counts, the fields with most problems, ready when no errors).
function validateFeed(rows){const ids=new Map();(rows||[]).forEach(r=>{if(!r.id)return;if(!ids.has(r.id))ids.set(r.id,[]);ids.get(r.id).push(r.row)});
 const items=(rows||[]).map(r=>{const issues=validateRow(r,{ids});return {key:r.key,row:r.row,id:r.id,title:r.title,issues,errors:issues.filter(i=>i.level==='error').length,warnings:issues.filter(i=>i.level==='warning').length}});
 const fields={};items.forEach(x=>x.issues.forEach(i=>{fields[i.field]=fields[i.field]||{field:i.field,errors:0,warnings:0};fields[i.field][i.level==='error'?'errors':'warnings']++}));
 const summary={total:items.length,ok:items.filter(x=>!x.errors&&!x.warnings).length,warn:items.filter(x=>!x.errors&&x.warnings).length,error:items.filter(x=>x.errors).length,
  errors:items.reduce((n,x)=>n+x.errors,0),warnings:items.reduce((n,x)=>n+x.warnings,0),fields:Object.values(fields).sort((a,b)=>b.errors-a.errors||b.warnings-a.warnings||a.field.localeCompare(b.field))};
 summary.ready=items.length>0&&summary.error===0;return {items,summary}}
// The columns that go in the files: every required one, the optional ones only when a product has a value.
const columnsOf=rows=>FEED_COLUMNS.filter(c=>REQUIRED_COLUMNS.includes(c)||(rows||[]).some(r=>r[c]));
const oneLineDesc=s=>block(s).replace(/\s*\n+\s*/g,' ');
// Tab-separated, header first; tabs and line breaks inside values become spaces (Google's TSV rule).
function toTsv(rows){const cols=columnsOf(rows),cell=v=>String(v==null?'':v).replace(/[\t\r\n]+/g,' ').trim();
 return [cols.join('\t'),...(rows||[]).map(r=>cols.map(c=>cell(c==='description'?oneLineDesc(r[c]):r[c])).join('\t'))].join('\n')+'\n'}
const xmlEsc=s=>String(s==null?'':s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
// RSS 2.0 with the g: namespace of Google Merchant Center.
function toXml(rows,{title,link,description}={}){const cols=columnsOf(rows),L=['<?xml version="1.0" encoding="UTF-8"?>','<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">','<channel>',
 '<title>'+xmlEsc(clean(title)||'Prodotti')+'</title>','<link>'+xmlEsc(isUrl(link)?link:'https://www.example.com/')+'</link>','<description>'+xmlEsc(clean(description)||'Feed prodotti per Google Merchant Center')+'</description>'];
 for(const r of rows||[]){L.push('<item>');for(const c of cols){const v=r[c];if(v==null||v==='')continue;L.push('<g:'+c+'>'+xmlEsc(c==='description'?block(v):clean(v))+'</g:'+c+'>')}L.push('</item>')}
 L.push('</channel>','</rss>');return L.join('\n')+'\n'}

// ---- texts for the site ----
const htmlEsc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function descHtml(text,bullets){const ps=block(text).split(/\n{2,}/).map(x=>x.trim()).filter(Boolean).map(x=>'<p>'+htmlEsc(x).replace(/\n/g,'<br>')+'</p>');
 const ul=(bullets||[]).length?'<ul>'+bullets.map(b=>'<li>'+htmlEsc(b)+'</li>').join('')+'</ul>':'';return ps.join('')+ul}
const bulletsHtml=b=>(b||[]).length?'<ul>'+b.map(x=>'<li>'+htmlEsc(x)+'</li>').join('')+'</ul>':'';
// CSV with commas (what WooCommerce and Shopify import), UTF-8 with BOM, formula-looking cells kept as text.
function csv(rows,cols){const C=csvLib(),safe=C&&C.safe?C.safe:v=>{const s=v==null?'':String(v);return /^[=+\-@\t\r]/.test(s)?"'"+s:s};
 const esc=v=>{const s=safe(v);return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
 return '﻿'+[cols.map(c=>esc(c.label)).join(','),...(rows||[]).map(r=>cols.map(c=>esc(c.value(r))).join(','))].join('\r\n')+'\r\n'}
const STATUS_LABEL={ok:'ok',verify:'da verificare',error:'non riuscita',todo:'da generare'};
const statusOf=it=>it?it.status:'todo';
const SHEET_COLUMNS=[
 {label:'id',value:r=>r.id,doc:'il codice del prodotto (colonna ID del foglio)'},{label:'nome',value:r=>r._p.name,doc:'il nome del prodotto come nel foglio'},
 {label:'titolo_google',value:r=>r.title,doc:'il titolo per Google Shopping (max 150 caratteri)'},{label:'descrizione',value:r=>r._it?r._it.description:r.description,doc:'la descrizione in testo semplice, paragrafi separati da una riga vuota'},
 {label:'descrizione_html',value:r=>r._it?descHtml(r._it.description,r._it.bullets):descHtml(r.description),doc:'la stessa descrizione in HTML (<p> e i punti chiave in <ul>), per il campo descrizione del sito'},
 {label:'punti_chiave',value:r=>r._it?r._it.bullets.join(' | '):'',doc:'i punti chiave separati da « | »'},{label:'meta_description',value:r=>r._it?r._it.meta:'',doc:'la meta description per Google (max 155 caratteri)'},
 {label:'alt_immagine',value:r=>r._it?r._it.alt:'',doc:'il testo alternativo della foto principale (max 125 caratteri)'},{label:'stato',value:r=>STATUS_LABEL[statusOf(r._it)],doc:'ok, da verificare, da generare'},
 {label:'da_verificare',value:r=>r._it&&r._it.status==='verify'?r._it.flags.map(flagText).join(' '):'',doc:'i dati scritti nei testi che non sono nella riga del foglio'},
 {label:'link',value:r=>r.link,doc:'il link della pagina prodotto'},{label:'immagine',value:r=>r.image_link,doc:'il link della foto principale'}];
const WOO_COLUMNS=[{label:'SKU',value:r=>r.id},{label:'Name',value:r=>r._p.name},{label:'Short description',value:r=>r._it?bulletsHtml(r._it.bullets):''},{label:'Description',value:r=>r._it?descHtml(r._it.description):descHtml(r.description)}];
const handleOf=r=>{const m=/\/products\/([^/?#]+)/.exec(r.link||'');return m?decodeURIComponent(m[1]):slug(r._p.name||r.id)};
const SHOPIFY_COLUMNS=[{label:'Handle',value:handleOf},{label:'Title',value:r=>r._p.name},{label:'Body (HTML)',value:r=>r._it?descHtml(r._it.description,r._it.bullets):descHtml(r.description)},
 {label:'SEO Title',value:r=>fit(r.title,LIMITS.seoTitle)},{label:'SEO Description',value:r=>r._it?r._it.meta:''}];
const REPORT_COLUMNS=[{label:'id',value:r=>r.id},{label:'riga',value:r=>r.row},{label:'livello',value:r=>r.level==='error'?'errore':'avviso'},{label:'campo',value:r=>r.field},{label:'problema',value:r=>r.msg}];
const sheetCsv=rows=>csv(rows,SHEET_COLUMNS),wooCsv=rows=>csv(rows.filter(r=>r.id),WOO_COLUMNS),shopifyCsv=rows=>csv(rows,SHOPIFY_COLUMNS);
const reportCsv=check=>csv(check.items.flatMap(x=>x.issues.map(i=>({id:x.id,row:x.row,...i}))),REPORT_COLUMNS);
const FILES={tsv:'feed-google-merchant.tsv',xml:'feed-google-merchant.xml',sheet:'schede-prodotto.csv',woo:'woocommerce-descrizioni.csv',shopify:'shopify-descrizioni.csv',report:'controlli-feed.csv',readme:'LEGGIMI.txt'};
function readme(check,{name,date,styleLabel}={}){const s=check.summary,L=[];
 L.push('SCHEDE PRODOTTO E FEED GOOGLE MERCHANT'+(name?' · '+clean(name):'')+' · '+(date||new Date().toISOString().slice(0,10)),'');
 L.push('Prodotti: '+s.total+' · pronti: '+s.ok+' · con avvisi: '+s.warn+' · con errori: '+s.error+(styleLabel?' · stile: '+styleLabel:''),'');
 L.push('FILE','- '+FILES.tsv+': il feed per Google Merchant Center, separato da tabulazioni. Merchant Center → Prodotti → Aggiungi prodotti → Carica un file.',
  '- '+FILES.xml+': lo stesso feed in XML (RSS 2.0 con lo spazio dei nomi g:). Usa uno dei due, non entrambi.',
  '- '+FILES.sheet+': tutti i testi, una riga per prodotto. Colonne:',...SHEET_COLUMNS.map(c=>'    '+c.label+': '+c.doc+'.'),
  '- '+FILES.woo+': per WooCommerce → Prodotti → Importa, con «Aggiorna prodotti esistenti» spuntato. Colonne SKU, Name, Short description (i punti chiave in HTML), Description (HTML). I prodotti sono riconosciuti dallo SKU.',
  '- '+FILES.shopify+': per Shopify → Prodotti → Importa, con «Sovrascrivi i prodotti con lo stesso handle». Colonne Handle (dal link /products/… o dal nome), Title, Body (HTML), SEO Title, SEO Description. Controlla che gli handle corrispondano ai tuoi prodotti.',
  '- '+FILES.report+': i controlli del feed, un problema per riga (id, riga del foglio, livello, campo, problema).','');
 L.push('PRIMA DI CARICARE','- Prova l’importazione su 2-3 prodotti, poi su tutti.','- I testi «da verificare» contengono dati che non sono nel foglio: correggili o confermali.',
  '- RADIX non carica nulla su Merchant Center né sul negozio: i file li carichi tu.','- Prezzi, disponibilità e link vengono dal foglio: tienili allineati con il sito, Google li confronta.');
 return L.join('\n')+'\n'}
// Every file of the export (feed, texts, report, readme) → [{name, data}], and the zip bytes.
function exportFiles(rows,check,meta={}){return [{name:FILES.tsv,data:toTsv(rows)},{name:FILES.xml,data:toXml(rows,meta)},{name:FILES.sheet,data:sheetCsv(rows)},{name:FILES.woo,data:wooCsv(rows)},
 {name:FILES.shopify,data:shopifyCsv(rows)},{name:FILES.report,data:reportCsv(check)},{name:FILES.readme,data:readme(check,meta)}]}
function exportZip(rows,check,meta){const Z=zipLib();if(!Z)throw Error('Archivio zip non disponibile: ricarica la pagina.');return Z.zip(exportFiles(rows,check,meta))}
const zipName=name=>'schede-feed-'+(slug(name)||'prodotti')+'.zip';

// ---- saved in the project: the «agents» document, key productSheets ----
const emptyStore=()=>({schemaVersion:1,items:[]});
function readStore(d){const s=d&&d.productSheets;return s&&typeof s==='object'&&Array.isArray(s.items)?{schemaVersion:1,items:s.items.filter(x=>x&&typeof x==='object')}:emptyStore()}
// The sheet (headers and rows as arrays), the column match, the answers, the style and the texts; flags are recomputed
// when it is reopened. Over SAVE_BUDGET bytes it is refused: the zip holds everything.
function savedRecord({fileName,sheet,mapping,settings,styleId,items},{by,at,id}={}){const when=at||new Date().toISOString(),hs=(sheet&&sheet.headers||[]).slice(0,80);
 const list=[...(items instanceof Map?items.values():Object.values(items||{}))].map(it=>({key:it.key,style:it.style||'',title:it.title,description:it.description,bullets:(it.bullets||[]).slice(),meta:it.meta||'',alt:it.alt||'',edited:!!it.edited,verified:!!it.verified}));
 const rec={id:id||'ps-'+when.replace(/\D/g,'').slice(0,14),at:when,by:clean(by).slice(0,80),fileName:clean(fileName).slice(0,120),style:style(styleId)?styleId:'',settings:normalizeSettings(settings),
  mapping:Object.fromEntries(FIELDS.map(f=>[f.id,hs.includes((mapping||{})[f.id])?mapping[f.id]:''])),headers:hs,rows:(sheet&&sheet.rows||[]).slice(0,MAX_PRODUCTS).map(r=>hs.map(h=>String(r[h]==null?'':r[h]).slice(0,2000))),items:list};
 const size=new TextEncoder().encode(JSON.stringify(rec)).length;if(size>SAVE_BUDGET){const e=Error('Troppi testi per salvarli nel progetto ('+Math.round(size/1024)+' KB, massimo '+Math.round(SAVE_BUDGET/1024)+' KB): scarica lo zip, che li contiene tutti.');e.tooBig=true;throw e}
 return rec}
// A saved record → the sheet ({headers, rows}) and the items as a Map (each checked again against its row).
function fromRecord(rec){const hs=rec&&rec.headers||[],sheet={headers:hs,rows:(rec&&rec.rows||[]).map(a=>Object.fromEntries(hs.map((h,i)=>[h,a[i]==null?'':a[i]])))};
 const settings=normalizeSettings(rec&&rec.settings),products=toProducts(sheet.rows,rec&&rec.mapping,settings).products,byKey=new Map(products.map(p=>[p.key,p])),items=new Map();
 for(const x of rec&&rec.items||[]){const p=byKey.get(x.key);if(!p)continue;items.set(p.key,finishItem({key:p.key,style:x.style,title:clean(x.title),description:block(x.description),bullets:(x.bullets||[]).map(clean).filter(Boolean),meta:clean(x.meta),alt:clean(x.alt),edited:!!x.edited,verified:!!x.verified},p))}
 markDuplicates([...items.values()]);return {sheet,mapping:{...(rec&&rec.mapping||{})},settings,style:rec&&rec.style||'',products,items,fileName:rec&&rec.fileName||''}}
function addRecord(store,rec){const s=readStore({productSheets:store});return {schemaVersion:1,items:s.items.filter(x=>x.id!==rec.id).concat([rec]).slice(-MAX_SAVED)}}
async function saveToProject(ws,projectId,rec){if(!ws||typeof ws.bind!=='function')throw Error('Archivio del progetto non disponibile.');
 const d=ws.bind(projectId,'agents');
 for(let i=0;i<3;i++){const cur=(await d.load())||{},next=addRecord(readStore(cur),rec);
  try{await d.save({...cur,schemaVersion:1,conversations:cur.conversations||{},productSheets:next});return next}catch(e){if(!(ws.ConflictError&&e instanceof ws.ConflictError)||i===2)throw e}}}

// ---- the example: 30 products of a bakery and gift shop, with a few deliberate mistakes for the checks ----
const SAMPLE_HEADERS=['Codice','Nome prodotto','Descrizione','Prezzo','Disponibilità','Marca','EAN','Immagine','Link prodotto','Categoria','Peso','Ingredienti','Confezione','Materiale','Dimensioni'];
const SHOP='https://www.fornoaurora.it';
const S=(code,name,desc,price,avail,ean,cat,weight,ingr,pack,extra={})=>{const sl=slug(name);return [code,name,desc,price,avail,extra.brand!=null?extra.brand:'Forno Aurora',ean,extra.img!=null?extra.img:SHOP+'/img/'+sl+'.jpg',extra.link||SHOP+'/prodotti/'+sl,cat,weight,ingr,pack,extra.material||'',extra.size||'']};
const SAMPLE_ROWS=[
 S('AUR-001','Pagnotta di semola rimacinata','Crosta croccante e mollica gialla, profumata.','4,50','disponibile','8034560003708','Pane','1 kg','semola rimacinata di grano duro, acqua, lievito madre, sale','Sacchetto di carta'),
 S('AUR-002','Filone integrale','','3,80','disponibile','8034560007409','Pane','750 g','farina integrale di grano tenero, acqua, lievito madre, sale','Sacchetto di carta'),
 S('AUR-003','Grissini stirati a mano','Stirati uno a uno, friabili.','3,20','disponibile','8034560011109','Grissini e snack','250 g','farina di grano tenero tipo 0, olio extravergine di oliva 8%, acqua, sale, lievito','Busta di carta'),
 S('AUR-004','Focaccia genovese','','2,50','disponibile','8034560014803','Focacce','300 g','farina di grano tenero tipo 0, acqua, olio extravergine di oliva, sale, lievito','Vaschetta'),
 S('AUR-005','Panettone classico','Lievitazione di 36 ore.','28,00','disponibile','8034560018504','Dolci delle feste','1 kg','farina di frumento, burro, uova, zucchero, uvetta, scorze d’arancia candite, lievito madre','Scatola di cartone'),
 S('AUR-006','Pandoro','','24,00','disponibile','8034560022204','Dolci delle feste','750 g','farina di frumento, burro, uova, zucchero, lievito madre, vaniglia','Scatola di cartone'),
 S('AUR-006','Colomba con glassa alle mandorle','','26,00','preordine','8034560025908','Dolci delle feste','1 kg','farina di frumento, burro, uova, zucchero, scorze d’arancia candite, glassa alle mandorle','Scatola di cartone'),
 S('AUR-008','Biscotti di meliga','Ricetta piemontese.','6,50','disponibile','8034560029609','Biscotti','300 g','farina di mais, farina di grano tenero, burro, zucchero, uova, limone','Sacchetto trasparente'),
 S('AUR-009','Baci di dama','','9,00','disponibile','8034560033309','Biscotti','250 g','nocciole Piemonte IGP 30%, farina di grano tenero, burro, zucchero, cioccolato fondente','Scatola di latta',{material:'latta'}),
 S('AUR-010','Torcetti al burro','','5,50','esaurito','8034560037000','Biscotti','250 g','farina di grano tenero, burro 20%, zucchero, lievito','Sacchetto trasparente'),
 S('AUR-011','Amaretti morbidi','','8,00','disponibile','8034560040704','Biscotti','200 g','mandorle 40%, zucchero, albume','Sacchetto trasparente'),
 S('AUR-012','Crostata di albicocche','','18,00','disponibile','8034560044404','Torte','800 g','farina di grano tenero, burro, zucchero, uova, confettura di albicocche 35%','Vassoio'),
 S('AUR-013','Torta di nocciole','Senza farina di grano.','16,00','disponibile','8034560048105','Torte','600 g','nocciole Piemonte IGP 35%, zucchero, uova, burro','Vassoio'),
 S('AUR-014','Focaccia dolce all’uva','','4,00','disponibile','8034560051808','Focacce','400 g','farina di grano tenero, uva fragola 25%, zucchero, olio extravergine di oliva, lievito','Vaschetta',{link:'http://www.fornoaurora.it/prodotti/focaccia-dolce-all-uva'}),
 S('AUR-015','Cesto regalo Piemonte','Cesto con i prodotti del forno.','45,00','disponibile','8034560055509','Confezioni regalo','','contiene: grissini stirati 250 g, biscotti di meliga 300 g, baci di dama 250 g, torta di nocciole 600 g','Cesto di vimini',{material:'vimini',size:'35 x 25 cm'}),
 S('AUR-016','Scatola regalo Dolci Torino','','32,00','disponibile','8034560059200','Confezioni regalo','','contiene: amaretti morbidi 200 g, torcetti al burro 250 g, gianduiotti 200 g','Scatola di latta decorata',{material:'latta',size:'30 x 20 x 8 cm'}),
 S('AUR-017','Taralli all’olio','','3,90','disponibile','8034560062903','Grissini e snack','300 g','farina di grano tenero, vino bianco, olio extravergine di oliva 15%, sale','Busta di carta',{img:''}),
 S('AUR-018','Crackers ai semi','','3,50','disponibile','8034560066604','Grissini e snack','200 g','farina di grano tenero, semi di girasole, semi di lino, semi di sesamo, olio extravergine di oliva, sale','Busta di carta'),
 S('AUR-019','Pane ai cereali','','4,20','disponibile','8034560070304','Pane','500 g','farina di grano tenero, farina di segale, fiocchi d’avena, semi di girasole, acqua, lievito madre, sale','Sacchetto di carta'),
 S('AUR-020','Torta di compleanno su misura','Decorata a richiesta per il tuo evento.','su richiesta','su ordinazione','8034560074005','Torte','','pan di spagna, crema pasticcera, frutta fresca','Vassoio'),
 S('AUR-021','Brioche al burro (6 pezzi)','','6,00','disponibile','8034560077709','Colazione','360 g','farina di grano tenero, burro 18%, uova, zucchero, latte, lievito madre','Vassoio'),
 S('AUR-022','Cornetti integrali (4 pezzi)','','4,80','disponibile','8034560081409','Colazione','280 g','farina integrale di grano tenero, burro, zucchero di canna, uova, lievito','Vassoio'),
 S('AUR-023','Box Bicerin','Il necessario per il bicerin a casa.','22,00','chiedere in negozio','8034560085100','Confezioni regalo','','contiene: cioccolato fondente 200 g, caffè macinato 250 g, 2 tazzine','Scatola di cartone',{material:'cartone, vetro'}),
 S('AUR-024','Gianduiotti','','12,00','disponibile','8034560088804','Cioccolato','200 g','zucchero, nocciole Piemonte IGP 30%, cacao, latte in polvere','Sacchetto di carta'),
 S('AUR-025','Tavoletta fondente 70%','','5,00','disponibile','8034560092504','Cioccolato','100 g','pasta di cacao, zucchero, burro di cacao; cacao 70% minimo','Astuccio di carta'),
 S('AUR-026','PANETTONE AL CIOCCOLATO OFFERTA -20% SPEDIZIONE GRATIS','','30,00','disponibile','8034560096205','Dolci delle feste','1 kg','farina di frumento, burro, uova, zucchero, gocce di cioccolato fondente 15%, lievito madre','Scatola di cartone'),
 S('AUR-027','Lievito madre essiccato','Per il pane fatto in casa.','4,00','disponibile','8034560099909','Dispensa','50 g','farina di grano tenero tipo 0, lievito madre essiccato','Busta richiudibile'),
 S('AUR-028','Farina tipo 1 macinata a pietra','','3,00','disponibile','8034560103606','Dispensa','1 kg','farina di grano tenero tipo 1','Sacchetto di carta'),
 S('AUR-029','Tagliere per il pane','','25,00','disponibile','','Accessori','','','Senza confezione',{brand:'',material:'legno di faggio',size:'40 x 25 cm'}),
 S('AUR-030','Sacchetto per il pane','Riutilizzabile, si chiude con un cordino.','9,00','disponibile','8034560111007','Accessori','','','Senza confezione',{material:'cotone',size:'30 x 40 cm'})];
const sampleSheet=()=>({name:'esempio-forno-aurora.csv',headers:SAMPLE_HEADERS.slice(),rows:SAMPLE_ROWS.map(r=>Object.fromEntries(SAMPLE_HEADERS.map((h,i)=>[h,r[i]])))});
// The example as CSV (semicolons, as the CRM reader expects from Italian Excel).
function sampleCsv(){const q=v=>/[;"\n]/.test(v)?'"'+String(v).replace(/"/g,'""')+'"':v;return [SAMPLE_HEADERS.map(q).join(';'),...SAMPLE_ROWS.map(r=>r.map(q).join(';'))].join('\r\n')+'\r\n'}

// ---- reading the sheet (browser; the readers of the CRM import, as lib/catalog-studio.js) ----
async function readSheet(file){const C=csvLib();if(!C)throw Error('Lettore dei fogli non disponibile: ricarica la pagina.');
 if(/\.xlsx$/i.test(file.name)){if(file.size>3e6)throw Error('File troppo grande: massimo 3 MB per Excel.');const X=root.RadixLeadXlsx;if(!X||!X.readRows)throw Error('Lettore Excel non disponibile: ricarica la pagina.');
  try{return C.fromRows(await X.readRows(await file.arrayBuffer(),{maxRows:C.MAX_ROWS,formulas:true}))}catch(e){throw Error(/massimo \d+/i.test(e.message)?'Il foglio ha più di '+C.MAX_ROWS+' righe: dividilo in più file.':e.message)}}
 return C.readFile(file)}

// ---- browser widget ----
let counter=0;
const dom=()=>root.document;
const el=(tag,text,cls)=>{const x=dom().createElement(tag);if(text!=null)x.textContent=text;if(cls)x.className=cls;return x};
const button=(text,cls)=>{const b=el('button',text,cls||'');b.type='button';return b};
const pill=(text,state)=>{const p=el('span',text,'pf-pill');if(state)p.dataset.state=state;return p};
const PILL_STATE={ok:'ok',verify:'warn',error:'fail',todo:''};
function download(name,data,type){const a=el('a');a.href=root.URL.createObjectURL(new root.Blob([data],{type}));a.download=name;dom().body.append(a);a.click();a.remove();setTimeout(()=>root.URL.revokeObjectURL(a.href),2000)}
function autosize(t,min){const go=()=>{if(!t.isConnected)return;t.style.height='auto';t.style.height=Math.max(min||0,t.scrollHeight+2)+'px'};t.addEventListener('input',go);(root.requestAnimationFrame||setTimeout)(go);return go}
// The confirmation before every AI call: what is written, how many calls, the cost note. Resolves true or false.
function moreText(n){return n<=20?'Mostra gli altri '+n:'Mostra altri 20 (ne restano '+n+')'}
function confirmCalls(host,{title,rows,note,ok}){return askConfirm({title,facts:rows,cost:note,ok:ok||'Conferma'})}
// ctx: {project (profileFor summary), projectName, memoryScope, projectId, workspace, agentsUrl, by}
function productStudio(ctx={}){const n=++counter,project=ctx.project||{},brand=clean(String(project.name||ctx.projectName||'').split(/\s[—–-]\s/)[0]).slice(0,70);
 const st={sheet:null,fileName:'',mapping:{},auto:{},settings:normalizeSettings({brand}),products:[],info:null,samples:[],styles:[],style:'',items:new Map(),run:null,filter:'all',shown:20,open:new Set(),feedFilter:'error',feedShown:20,recordId:'',saved:[]};
 const wrap=el('div',undefined,'tool photo-studio pf-studio');
 const steps=el('ol',undefined,'ps-steps');['Il foglio e le domande','Scegli lo stile','Tutte le schede','Feed ed export'].forEach((t,i)=>{const li=el('li',(i+1)+' · '+t);li.dataset.step=String(i+1);steps.append(li)});
 const setStep=k=>[...steps.children].forEach(li=>li.dataset.state=+li.dataset.step<k?'done':+li.dataset.step===k?'current':'todo');
 const note=el('p','RADIX scrive i testi solo dai dati del foglio e prepara il feed: non carica nulla su Merchant Center né sul negozio.','pf-note');
 const savedBox=el('div',undefined,'ad-saved pf-saved');savedBox.hidden=true;
 // ---- step 1: the sheet, the columns, the questions ----
 const form=el('div',undefined,'ps-form pf-form');
 const src=el('section',undefined,'pf-card pf-source'),srcHead=el('div',undefined,'pf-card-head');srcHead.append(el('h4','I prodotti'),el('p','Un foglio Excel (.xlsx) o CSV, una riga per prodotto, fino a '+MAX_PRODUCTS+' prodotti. Le colonne le trovo da solo.','muted'));
 const drop=el('label',undefined,'pf-drop'),inp=el('input');inp.type='file';inp.accept='.xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
 const dropText=el('span',undefined,'pf-drop-text');dropText.append(el('strong','Scegli il foglio prodotti'),el('small','.xlsx o .csv · ID, titolo, descrizione, prezzo, disponibilità, marca, EAN, link…'));drop.append(inp,dropText);
 const sampleBtn=button('Usa l’esempio: 30 prodotti di un forno','pf-sample-btn');
 const srcRow=el('div',undefined,'pf-src-row');srcRow.append(drop,sampleBtn);
 const sheetInfo=el('p','','pf-sheet-info');sheetInfo.setAttribute('role','status');
 src.append(srcHead,srcRow,sheetInfo);
 const mapBox=el('section',undefined,'pf-card pf-map'),prevBox=el('section',undefined,'pf-card pf-preview'),qBox=el('section',undefined,'pf-card pf-questions');
 const go=button('Prova 3 stili su 3 prodotti','primary'),cost=el('span','Una chiamata AI al Content e UX Writer: ti chiedo conferma prima.','muted'),free=button('Controlla il feed senza AI');
 const bar=el('div',undefined,'ps-actions pf-go');bar.append(go,cost,free);
 const after=[mapBox,prevBox,qBox,bar];after.forEach(x=>x.hidden=true);
 form.append(src,...after);
 const status=el('p','','tool-status');status.setAttribute('role','status');
 const stylesBox=el('section',undefined,'pf-step pf-styles-step'),bulk=el('section',undefined,'pf-step pf-bulk'),feed=el('section',undefined,'pf-step pf-feed');[stylesBox,bulk,feed].forEach(x=>x.hidden=true);
 wrap.append(steps,note,savedBox,form,status,stylesBox,bulk,feed);setStep(1);
 const byKey=k=>st.products.find(p=>p.key===k);
 function refresh(){st.info=toProducts(st.sheet.rows,st.mapping,st.settings);st.products=st.info.products;
  for(const [k,it] of st.items){const p=byKey(k);if(p)finishItem(it,p);else st.items.delete(k)}markDuplicates([...st.items.values()])}
 function loadSheet(sheet,name){if(!sheet||!sheet.rows||!sheet.rows.length)throw Error('il foglio non ha righe di prodotti');
  st.sheet=sheet;st.fileName=name;st.mapping=detectMapping(sheet.headers,sheet.rows);st.auto={...st.mapping};st.items=new Map();st.styles=[];st.style='';st.run=null;st.recordId='';st.open.clear();
  refresh();after.forEach(x=>x.hidden=false);[stylesBox,bulk,feed].forEach(x=>x.hidden=true);renderMap();renderPreview();renderQuestions();setStep(1);
  sheetInfo.textContent=name+': '+sheet.rows.length+' righe, '+sheet.headers.filter(Boolean).length+' colonne'+(st.info.skipped?' · '+st.info.skipped+' righe senza ID né titolo saltate':'')+(st.info.cut?' · '+st.info.cut+' prodotti oltre i '+MAX_PRODUCTS+' esclusi: dividi il foglio':'')+'.';sheetInfo.dataset.state='ok'}
 inp.onchange=async()=>{const f=inp.files&&inp.files[0];if(!f)return;sheetInfo.textContent='Leggo '+f.name+'…';sheetInfo.dataset.state='';
  try{loadSheet(await readSheet(f),f.name);status.textContent=''}catch(e){sheetInfo.textContent='Foglio non letto: '+e.message;sheetInfo.dataset.state='fail';after.forEach(x=>x.hidden=true)}};
 sampleBtn.onclick=()=>{const s=sampleSheet();loadSheet(s,s.name);status.textContent='Caricato l’esempio: 30 prodotti di un forno, con qualche errore voluto per vedere i controlli.'};
 function renderMap(){const grid=el('div',undefined,'pf-map-grid'),miss=missingColumns(st.mapping);
  const h=el('div',undefined,'pf-card-head');h.append(el('h4','Le colonne'),el('p','Abbinate da sole dal nome o dal contenuto: controlla e cambia se serve.','muted'));
  for(const f of FIELDS){const l=el('label',undefined,'pf-mapf'),top=el('span',undefined,'pf-mapf-top'),s=el('select');s.name='pf-map-'+f.id+'-'+n;
   s.append(new root.Option('— nessuna —',''),...st.sheet.headers.filter(Boolean).map(x=>new root.Option(x,x)));s.value=st.mapping[f.id]||'';
   const b=el('span','','pf-badge');if(st.mapping[f.id]&&st.mapping[f.id]===st.auto[f.id]){b.textContent='trovata';b.dataset.state='ok'}else if(st.mapping[f.id]){b.textContent='scelta da te';b.dataset.state='ok'}else if(f.need){b.textContent='obbligatoria';b.dataset.state='warn'}else b.textContent='facoltativa';
   top.append(el('span',f.label),b);s.onchange=()=>{st.mapping[f.id]=s.value;refresh();renderMap();renderPreview();if(!feed.hidden)renderFeed();if(!bulk.hidden)renderBulk()};l.append(top,s);l.dataset.set=String(!!st.mapping[f.id]);grid.append(l)}
  mapBox.replaceChildren(h,grid);if(miss.length)mapBox.append(el('p','Mancano colonne che Google chiede: '+miss.join(', ')+'. Sceglile qui sopra o aggiungile al foglio.','pf-need'))}
 function renderPreview(){const rows=feedRows(st.products.slice(0,5),new Map()),t=el('table',undefined,'pf-table'),thead=el('thead'),tr=el('tr');
  ['Riga','ID','Titolo','Prezzo nel feed','Disponibilità','Marca','GTIN'].forEach(x=>tr.append(el('th',x)));thead.append(tr);const tb=el('tbody');
  rows.forEach(r=>{const row=el('tr');[String(r.row),r.id||'—',r.title||'—',r.price||'—',r.availability||'—',r.brand||'—',r.gtin||(r.mpn?'MPN '+r.mpn:'—')].forEach((v,i)=>{const td=el('td',v);if(i===2)td.className='pf-td-title';row.append(td)});tb.append(row)});
  t.append(thead,tb);const w=el('div',undefined,'pf-tablewrap');w.tabIndex=0;w.setAttribute('role','region');w.setAttribute('aria-label','Come leggo i primi prodotti');w.append(t);
  const h=el('div',undefined,'pf-card-head');h.append(el('h4','Come leggo i primi prodotti'),el('p',st.products.length+' prodotti letti. Prezzo, disponibilità e marca sono già nel formato del feed.','muted'));prevBox.replaceChildren(h,w)}
 function renderQuestions(){const s=st.settings,h=el('div',undefined,'pf-card-head');h.append(el('h4','Le domande'),el('p','Valgono per tutte le schede. I valori predefiniti riempiono solo le celle vuote del foglio.','muted'));
  const toneFs=el('fieldset',undefined,'pf-tone');toneFs.append(el('legend','Tono'));TONES.forEach(([t])=>{const l=el('label',undefined,'ps-chip'),r=el('input');r.type='radio';r.name='pf-tone-'+n;r.checked=s.tone===t;r.onchange=()=>{s.tone=t};l.append(r,dom().createTextNode(t));toneFs.append(l)});
  const langFs=el('fieldset',undefined,'pf-lang');langFs.append(el('legend','Lingua'));LANGUAGES.forEach(([,t])=>{const l=el('label',undefined,'ps-chip'),r=el('input');r.type='radio';r.name='pf-lang-'+n;r.checked=true;l.append(r,dom().createTextNode(t));langFs.append(l)});
  const chFs=el('fieldset',undefined,'pf-channels');chFs.append(el('legend','Dove andranno i testi'));CHANNELS.forEach(c=>{const l=el('label',undefined,'ps-chip ad-tile pf-tile'),r=el('input');r.type='radio';r.name='pf-ch-'+n;r.checked=s.channel===c.id;r.onchange=()=>{s.channel=c.id};
   const t=el('span',undefined,'ad-tile-text');t.append(el('strong',c.label),el('small',c.sub));l.append(r,t);chFs.append(l)});
  const defs=el('div',undefined,'pf-defaults'),fld=(label,node,wide)=>{const l=el('label',undefined,'pf-field'+(wide?' pf-wide':''));l.append(el('span',label),node);defs.append(l);return node};
  const b=el('input');b.type='text';b.maxLength=70;b.value=s.brand;b.placeholder='Es. Forno Aurora';fld('Marca se la cella è vuota',b);
  const sel=(opts,v)=>{const x=el('select');opts.forEach(([val,t])=>x.append(new root.Option(t,val)));x.value=v;return x};
  const cur=fld('Valuta',sel(CURRENCIES.map(c=>[c,c]),s.currency)),cond=fld('Condizione se manca',sel(CONDITIONS.map(c=>[c,CONDITION_LABEL[c]+' · '+c]),s.condition)),av=fld('Disponibilità se manca',sel(AVAILABILITY.map(c=>[c,AVAILABILITY_LABEL[c]+' · '+c]),s.availability));
  const gc=el('input');gc.type='text';gc.maxLength=250;gc.value=s.googleCategory;gc.placeholder='Es. Alimenti, bevande e tabacco > Alimenti > Prodotti da forno';fld('Categoria Google (facoltativa)',gc,true);
  const upd=()=>{Object.assign(s,normalizeSettings({...s,brand:b.value,currency:cur.value,condition:cond.value,availability:av.value,googleCategory:gc.value}));refresh();renderPreview();if(!feed.hidden)renderFeed()};
  [b,gc].forEach(x=>x.addEventListener('change',upd));[cur,cond,av].forEach(x=>x.onchange=upd);
  const top=el('div',undefined,'pf-q-row');top.append(toneFs,langFs);qBox.replaceChildren(h,top,chFs,defs)}
 const rt=()=>{const r=root.RadixAgents;if(!r||typeof r.reply!=='function')throw Error('Gli agenti non si sono caricati: ricarica la pagina.');return r};
 const ask=prompt=>rt().reply({role:AGENT,project,memoryScope:ctx.memoryScope,messages:[{role:'user',content:prompt}]}).catch(e=>{if(FATAL.test(e&&e.message||''))e.fatal=true;throw e});
 const lockForm=on=>{[go,free,sampleBtn,inp].forEach(x=>x.disabled=on);form.querySelectorAll('select,input').forEach(x=>x.disabled=on)};
 // ---- step 2: three styles on three products ----
 go.onclick=async()=>{const miss=missingColumns(st.mapping).filter(x=>/ID|Titolo/.test(x));if(miss.length){status.textContent='Scegli prima la colonna '+miss.join(' e ')+'.';return}
  st.samples=pickSamples(st.products);let prompt;try{prompt=stylesPrompt(st.samples,st.settings,project);rt()}catch(e){status.textContent=e.message;return}
  const ok=await confirmCalls(wrap,{title:'Provo 3 stili su 3 prodotti',rows:[['Prodotti',st.samples.length+': '+st.samples.map(p=>p.name).join(', ')],['Stili','Essenziale, Racconto, Tecnico'],['Chiamate AI','1, al Content e UX Writer']],
   note:'Una sola chiamata AI: usa crediti API. Scelto lo stile, prima di scrivere gli altri '+Math.max(0,st.products.length-st.samples.length)+' prodotti ti dico quante chiamate servono.',ok:'Prova i 3 stili'});
  if(!ok){status.textContent='Nessuna chiamata fatta.';return}
  lockForm(true);setStep(2);stylesBox.hidden=false;stylesBox.replaceChildren(el('h3','Scegli lo stile'),skeleton(3));status.textContent='Il Content e UX Writer prova i 3 stili…';
  try{const r=await ask(prompt),list=parseStyles(r&&r.text,st.samples);if(!list.length)throw Error('la risposta non contiene stili leggibili. Riprova.');
   st.styles=list;st.style='';renderStyles();go.textContent='Prova di nuovo i 3 stili';status.textContent=(list.length<STYLES.length?'Sono arrivati '+list.length+' stili su '+STYLES.length+'. ':'')+'Confronta gli stili sugli stessi prodotti e scegli quello per tutto il catalogo.'}
  catch(e){status.textContent='Stili non preparati: '+e.message;if(!st.styles.length){stylesBox.hidden=true;setStep(1)}else renderStyles()}
  finally{lockForm(false)}};
 const skeleton=k=>{const g=el('div',undefined,'pf-styles');for(let i=0;i<k;i++)g.append(el('div',undefined,'pf-style pf-skeleton'));return g};
 function flagsList(it,max){const m=max||6,ul=el('ul',undefined,'pf-flags');it.flags.slice(0,m).forEach(f=>{const li=el('li');li.append(el('b',FLAG_LABEL[f.kind]),el('span',flagText(f)));ul.append(li)});if(it.flags.length>m)ul.append(el('li','E altri '+(it.flags.length-m)+'.'));return ul}
 function renderStyles(){const head=el('div',undefined,'pf-step-head'),t=el('div');t.append(el('h3','Scegli lo stile'),el('p','Gli stessi '+st.samples.length+' prodotti scritti in '+st.styles.length+' stili. I dati che non sono nel foglio sono segnalati.','muted'));head.append(t);
  const g=el('div',undefined,'pf-styles');
  st.styles.forEach(s=>{const c=el('article',undefined,'pf-style');c.dataset.chosen=String(st.style===s.style);const h=el('header',undefined,'pf-style-head');h.append(el('h4',s.label),el('p',s.sub,'muted'));c.append(h);
   let flags=0;for(const p of st.samples){const it=s.items.get(p.key),box=el('div',undefined,'pf-sample');box.append(el('span',p.name,'pf-sample-name'));
    if(!it){box.append(el('p','Non arrivato in questo stile.','muted'));c.append(box);continue}
    const tt=el('p',undefined,'pf-sample-title');tt.append(el('strong',it.title),el('span',chars(it.title)+'/'+LIMITS.title,'pf-count'));box.append(tt,el('p',it.description,'pf-sample-desc'));
    if(it.bullets.length){const ul=el('ul',undefined,'pf-sample-bullets');it.bullets.slice(0,3).forEach(b=>ul.append(el('li',b)));box.append(ul)}
    if(it.flags.length){flags+=it.flags.length;box.append(flagsList(it,3))}c.append(box)}
   const use=button(st.style===s.style?'Stile scelto':'Usa lo stile '+s.label,'primary');use.onclick=()=>chooseStyle(s.style);
   const foot=el('footer',undefined,'pf-style-foot');foot.append(pill(flags?flags+' da verificare':'Solo dati del foglio',flags?'warn':'ok'),use);c.append(foot);g.append(c)});
  stylesBox.replaceChildren(head,g)}
 function chooseStyle(id){st.style=id;const s=st.styles.find(x=>x.style===id);
  // the samples already written in this style become their products' texts (unless edited by hand)
  for(const [k,it] of s.items){const cur=st.items.get(k),p=byKey(k);if(p&&(!cur||!cur.edited))st.items.set(k,finishItem(JSON.parse(JSON.stringify({...it,issues:[]})),p))}
  markDuplicates([...st.items.values()]);renderStyles();setStep(3);bulk.hidden=false;renderBulk();status.textContent='Stile «'+style(id).label+'» scelto: '+s.items.size+' schede già pronte.';bulk.scrollIntoView&&bulk.scrollIntoView({behavior:'smooth',block:'start'})}
 // ---- step 3: every product, in batches ----
 const counts=()=>{const c={all:st.products.length,ok:0,verify:0,todo:0,error:0};st.products.forEach(p=>{c[statusOf(st.items.get(p.key))]++});return c};
 const sumPills=c=>[pill(c.all+' prodotti'),pill(c.ok+' pronte','ok'),pill(c.verify+' da verificare',c.verify?'warn':''),pill(c.todo+' da generare'),...(c.error?[pill(c.error+' non riuscite','fail')]:[])];
 function renderBulk(){const c=counts(),s=style(st.style),run=st.run,rc=run&&runCounts(run);
  const head=el('div',undefined,'pf-step-head'),t=el('div');t.append(el('h3','Tutte le schede'+(s?' · stile '+s.label:'')),el('p','Per ogni prodotto: titolo per Google, descrizione, punti chiave, meta description e alt della foto, solo dai dati della sua riga.','muted'));head.append(t);
  const sum=el('div',undefined,'pf-sum');sum.append(...sumPills(c));
  const prog=el('div',undefined,'pf-progress'),barEl=el('div',undefined,'pf-bar'),fill=el('i'),done=c.all-c.todo;fill.style.width=(c.all?Math.round(done/c.all*100):0)+'%';barEl.append(fill);
  barEl.setAttribute('role','progressbar');barEl.setAttribute('aria-valuemin','0');barEl.setAttribute('aria-valuemax',String(c.all));barEl.setAttribute('aria-valuenow',String(done));barEl.setAttribute('aria-label','Schede scritte');
  const ptxt=el('p','','pf-progress-text');
  ptxt.textContent=run&&run.running?'Lotto '+(run.batches.findIndex(b=>b.status==='running')+1)+' di '+rc.total+' in corso · '+done+' di '+c.all+' schede'+(run.paused?' · pausa dopo questo lotto':'')
   :run&&run.paused&&rc.todo?'In pausa · '+rc.done+' di '+rc.total+' lotti scritti · '+done+' di '+c.all+' schede'
   :done+' di '+c.all+' schede scritte'+(rc&&rc.error?' · '+rc.error+' lott'+(rc.error===1?'o non riuscito':'i non riusciti'):'');
  prog.dataset.running=String(!!(run&&run.running));prog.append(barEl,ptxt);
  const acts=el('div',undefined,'ps-actions pf-bulk-actions'),todo=planBatches(st.products,st.items).reduce((k,b)=>k+b.length,0);
  if(run&&run.running){const p=button(run.paused?'Pausa dopo questo lotto…':'Pausa');p.disabled=run.paused;p.onclick=()=>{run.paused=true;renderBulk()};acts.append(p)}
  else if(run&&run.paused&&rc.todo){const r=button('Riprendi','primary');r.onclick=()=>startRun(false);acts.append(r,el('span','I '+rc.todo+' lotti che restano sono già confermati.','muted'))}
  else if(todo){const g=button('Genera le altre '+todo+' schede','primary');g.onclick=()=>startRun(true);acts.append(g,el('span',Math.ceil(todo/BATCH)+' chiamate AI, una ogni '+BATCH+' prodotti: ti chiedo conferma prima.','muted'))}
  if(run&&!run.running&&rc.error){const r=button('Riprova i lotti non riusciti');r.onclick=async()=>{const bad=run.batches.filter(b=>b.status==='error');
   if(!(await confirmCalls(wrap,{title:'Riprovo i lotti non riusciti',rows:[['Lotti',bad.length],['Prodotti',bad.reduce((k,b)=>k+b.keys.length,0)],['Chiamate AI',bad.length]],note:'Ogni chiamata usa crediti API.',ok:'Riprova'})))return;retryFailed(run);startRun(false)};acts.append(r)}
  if(!(run&&run.running)){const toFeed=button('Vai al feed →');toFeed.onclick=()=>openFeed();acts.append(toFeed)}
  const seg=el('div',undefined,'ad-seg pf-seg');seg.setAttribute('role','group');seg.setAttribute('aria-label','Mostra');
  [['all','Tutte',c.all],['verify','Da verificare',c.verify],['ok','Pronte',c.ok],['todo','Da generare',c.todo+c.error]].forEach(([k,lab,v])=>{const b=button(lab+' · '+v);b.setAttribute('aria-pressed',String(st.filter===k));b.onclick=()=>{st.filter=k;st.shown=20;renderBulk()};seg.append(b)});
  const keep=bulk.contains(dom().activeElement)&&dom().activeElement.closest('.pf-prod-body')&&bulk.querySelector('.pf-sum');
  if(keep){bulk.querySelector('.pf-sum').replaceWith(sum);bulk.querySelector('.pf-progress').replaceWith(prog);bulk.querySelector('.pf-bulk-actions').replaceWith(acts);bulk.querySelector('.pf-seg').replaceWith(seg);return}
  const list=el('div',undefined,'pf-list'),items=st.products.filter(p=>{const x=statusOf(st.items.get(p.key));return st.filter==='all'||x===st.filter||(st.filter==='todo'&&x==='error')});
  items.slice(0,st.shown).forEach(p=>list.append(prodCard(p)));if(!items.length)list.append(el('p','Nessun prodotto qui.','muted pf-empty'));
  const more=items.length>st.shown?button(moreText(items.length-st.shown),'pf-more'):null;if(more)more.onclick=()=>{st.shown+=20;renderBulk()};
  bulk.replaceChildren(head,sum,prog,acts,seg,list,...(more?[more]:[]))}
 function prodCard(p){const it=st.items.get(p.key),s=statusOf(it),c=el('article',undefined,'pf-prod');c.dataset.status=s;c.dataset.key=p.key;
  const h=button('','pf-prod-head');h.setAttribute('aria-expanded',String(st.open.has(p.key)));const nm=el('span',undefined,'pf-prod-names');
  nm.append(el('span',(p.id||'senza ID')+' · riga '+p.row,'pf-prod-id'),el('strong',it&&it.title||p.name||'—'),el('small',it?(it.description||'').slice(0,140):(p.description?p.description.slice(0,90):'Testi non ancora scritti')));
  h.append(nm,pill(STATUS_LABEL[s],PILL_STATE[s]));h.onclick=()=>{st.open.has(p.key)?st.open.delete(p.key):st.open.add(p.key);c.replaceWith(prodCard(p))};c.append(h);
  if(st.open.has(p.key))c.append(prodBody(p,it,c));return c}
 function prodBody(p,it,card){const b=el('div',undefined,'pf-prod-body');
  const facts=el('details',undefined,'pf-facts');facts.append(el('summary','I dati della riga '+p.row+' del foglio ('+p.facts.length+')'));const dl=el('dl');p.facts.forEach(([k,v])=>{const r=el('div');r.append(el('dt',k),el('dd',v));dl.append(r)});facts.append(dl);
  if(!it){const g=button('Scrivi questa scheda');g.onclick=()=>regenerate(p);b.append(el('p','Questa scheda non è ancora scritta.','muted'),facts,g);return b}
  const fl=el('div',undefined,'pf-flagbox'),iss=el('ul',undefined,'pf-issues'),acts=el('div',undefined,'ps-actions pf-prod-actions'),vbtn=button('Ho verificato i dati'),rg=button('Rigenera');
  const paint=()=>{fl.replaceChildren();fl.hidden=!it.flags.length;if(it.flags.length)fl.append(el('p',it.verified?'Dati controllati da te:':'Da verificare: questi dati non sono nella riga del foglio. Correggi il testo o conferma di averli controllati.','pf-flag-head'),flagsList(it,10));
   iss.replaceChildren(...it.issues.map(i=>{const li=el('li',i.msg);li.dataset.soft=String(!!i.soft);return li}));iss.hidden=!it.issues.length;
   const s=statusOf(it),hp=card.querySelector('.pf-prod-head .pf-pill');card.dataset.status=s;if(hp)hp.replaceWith(pill(STATUS_LABEL[s],PILL_STATE[s]));const strong=card.querySelector('.pf-prod-names strong');if(strong)strong.textContent=it.title||p.name;
   vbtn.hidden=!it.flags.length||!!it.verified;updSum()};
  let timer=0;const recheck=()=>{clearTimeout(timer);timer=setTimeout(()=>{it.edited=true;finishItem(it,p);markDuplicates([...st.items.values()]);paint()},250)};
  const f=(label,max,get,set,rows)=>{const l=el('label',undefined,'pf-field'+(rows?' pf-wide':'')),top=el('span',undefined,'pf-field-top'),i=el(rows?'textarea':'input');if(rows)i.rows=rows;else i.type='text';i.value=get();
   const cnt=el('span','','pf-count'),upc=()=>{const k=chars(i.value);cnt.textContent=k+'/'+max;cnt.dataset.over=String(k>max)};upc();top.append(el('span',label),cnt);i.addEventListener('input',()=>{set(i.value);upc();recheck()});if(rows)autosize(i,rows*22);l.append(top,i);return l};
  const fields=el('div',undefined,'pf-edit');
  fields.append(f('Titolo per Google',LIMITS.title,()=>it.title,v=>{it.title=clean(v)}),f('Descrizione',LIMITS.description,()=>it.description,v=>{it.description=block(v)},6),
   f('Punti chiave · uno per riga',LIMITS.bullet*LIMITS.bullets,()=>it.bullets.join('\n'),v=>{it.bullets=v.split('\n').map(clean).filter(Boolean).slice(0,LIMITS.bullets)},4),
   f('Meta description',LIMITS.meta,()=>it.meta,v=>{it.meta=clean(v)}),f('Alt della foto',LIMITS.alt,()=>it.alt,v=>{it.alt=clean(v)}));
  vbtn.onclick=()=>{it.verified=true;finishItem(it,p);paint()};rg.onclick=()=>regenerate(p);acts.append(vbtn,rg,el('span','Rigenera: una chiamata AI, con conferma.','muted'));
  b.append(fl,iss,fields,facts,acts);paint();return b}
 function updSum(){const sum=bulk.querySelector('.pf-sum');if(sum)sum.replaceChildren(...sumPills(counts()))}
 async function regenerate(p){if(!st.style){status.textContent='Scegli prima uno stile.';return}
  if(!(await confirmCalls(wrap,{title:'Riscrivo la scheda di «'+p.name+'»',rows:[['Prodotto',(p.id?p.id+' · ':'')+p.name],['Stile',style(st.style).label],['Chiamate AI','1']],note:'Una chiamata AI: usa crediti API. Il testo attuale viene sostituito.',ok:'Riscrivi'})))return;
  status.textContent='Riscrivo «'+p.name+'»…';
  try{const r=await ask(batchPrompt([p],st.style,st.settings,project)),res=parseBatch(r&&r.text,[p],st.style),it=res.items.get(p.key);if(!it)throw Error('la risposta non contiene la scheda.');
   st.items.set(p.key,it);markDuplicates([...st.items.values()]);st.open.add(p.key);status.textContent='Scheda di «'+p.name+'» riscritta'+(it.status==='verify'?': ha dati da verificare.':'.');renderBulk()}
  catch(e){status.textContent='Scheda non riscritta: '+e.message}}
 async function startRun(fresh){if(fresh){const batches=planBatches(st.products,st.items);if(!batches.length){renderBulk();return}const k=batches.reduce((x,b)=>x+b.length,0);
   if(!(await confirmCalls(wrap,{title:'Scrivo le altre '+k+' schede',rows:[['Prodotti',k],['Lotti',batches.length+', da massimo '+BATCH+' prodotti'],['Chiamate AI',batches.length+', una per lotto'],['Stile',style(st.style).label],['Tono e canale',st.settings.tone+' · '+channel(st.settings.channel).label]],
    note:'Ogni chiamata usa crediti API: il costo cresce con il numero di prodotti. Puoi mettere in pausa tra un lotto e l’altro; i lotti già scritti restano.',ok:'Conferma '+batches.length+' chiamat'+(batches.length===1?'a':'e')})))return;
   st.run=newRun(batches)}else if(!st.run)return;
  const run=st.run;run.paused=false;status.textContent='Scrivo le schede a lotti di '+BATCH+'…';
  const result=await runBatches(run,{onUpdate:()=>renderBulk(),call:async keys=>{const list=keys.map(byKey).filter(Boolean),r=await ask(batchPrompt(list,st.style,st.settings,project)),res=parseBatch(r&&r.text,list,st.style);
   if(!res.items.size)throw Error('risposta senza schede leggibili');for(const [k,it] of res.items){const cur=st.items.get(k);if(!cur||!cur.edited)st.items.set(k,it)}markDuplicates([...st.items.values()])}});
  const c=counts(),rc=runCounts(run);
  status.textContent=result==='paused'?'In pausa: '+rc.done+' di '+rc.total+' lotti scritti. Premi «Riprendi» per continuare.'
   :result==='stopped'?'Fermato: '+(run.batches.find(b=>b.status==='error')||{}).error+'. I lotti già scritti restano.'
   :'Fatto: '+(c.all-c.todo-c.error)+' schede scritte'+(c.verify?', '+c.verify+' da verificare':'')+(rc.error?', '+rc.error+' lotti non riusciti: puoi riprovarli':'')+(c.todo&&!rc.error?', '+c.todo+' prodotti mancano nella risposta: scrivili dalla loro scheda':'')+'.';
  renderBulk();if(!feed.hidden)renderFeed()}
 // ---- step 4: the feed, its checks and the exports ----
 free.onclick=()=>openFeed();
 function openFeed(){if(!st.sheet)return;feed.hidden=false;if(!st.style)setStep(4);else setStep(4);renderFeed();feed.scrollIntoView&&feed.scrollIntoView({behavior:'smooth',block:'start'})}
 function renderFeed(){const rows=feedRows(st.products,st.items),check=validateFeed(rows),s=check.summary;
  const head=el('div',undefined,'pf-step-head'),t=el('div');t.append(el('h3','Il feed per Google Merchant Center'),el('p','Le regole principali dei dati prodotto di Google, controllate prima di caricare il file. '+(st.items.size?'Titoli e descrizioni vengono dalle schede scritte, per gli altri prodotti dal foglio.':'Titoli e descrizioni vengono dal foglio: nessuna scheda scritta.'),'muted'));head.append(t,pill(s.ready?'Pronto da caricare':s.error+' prodott'+(s.error===1?'o':'i')+' da correggere',s.ready?'ok':'fail'));
  const tiles=el('div',undefined,'pf-tiles');[['Prodotti',s.total,''],['Pronti',s.ok,'ok'],['Con avvisi',s.warn,'warn'],['Con errori',s.error,'fail']].forEach(([k,v,state])=>{const d=el('div',undefined,'pf-stat');d.dataset.state=state;d.append(el('strong',String(v)),el('span',k));tiles.append(d)});
  const fields=el('div',undefined,'pf-fieldsum');if(s.fields.length){fields.append(el('span','Per attributo del feed','ad-tool-label'));const ul=el('ul');s.fields.forEach(f=>{const li=el('li');li.dataset.state=f.errors?'fail':'warn';li.append(el('code',f.field),el('span',(f.errors?f.errors+' error'+(f.errors===1?'e':'i'):'')+(f.errors&&f.warnings?' · ':'')+(f.warnings?f.warnings+' avvis'+(f.warnings===1?'o':'i'):'')));ul.append(li)});fields.append(ul)}else fields.hidden=true;
  const seg=el('div',undefined,'ad-seg pf-seg');seg.setAttribute('role','group');seg.setAttribute('aria-label','Mostra');
  [['error','Con errori',s.error],['warn','Con avvisi',s.warn],['all','Tutti',s.total]].forEach(([k,lab,v])=>{const b=button(lab+' · '+v);b.setAttribute('aria-pressed',String(st.feedFilter===k));b.onclick=()=>{st.feedFilter=k;st.feedShown=20;renderFeed()};seg.append(b)});
  const list=el('div',undefined,'pf-checks'),shown=check.items.filter(x=>st.feedFilter==='all'||(st.feedFilter==='error'?x.errors:!x.errors&&x.warnings));
  shown.slice(0,st.feedShown).forEach(x=>{const c=el('article',undefined,'pf-check');c.dataset.state=x.errors?'fail':x.warnings?'warn':'ok';const h=el('header'),ids=el('div',undefined,'pf-check-ids');ids.append(el('span',(x.id||'senza ID')+' · riga '+x.row,'pf-prod-id'),el('strong',x.title||'(senza titolo)'));
   h.append(ids,pill(x.errors?x.errors+' error'+(x.errors===1?'e':'i'):x.warnings?x.warnings+' avvis'+(x.warnings===1?'o':'i'):'ok',x.errors?'fail':x.warnings?'warn':'ok'));c.append(h);
   if(x.issues.length){const ul=el('ul');x.issues.forEach(i=>{const li=el('li');li.dataset.level=i.level;li.append(el('code',i.field),el('span',i.msg));ul.append(li)});c.append(ul)}list.append(c)});
  if(!shown.length)list.append(el('p',st.feedFilter==='error'?'Nessun prodotto con errori.':'Nessun prodotto qui.','muted pf-empty'));
  const more=shown.length>st.feedShown?button(moreText(shown.length-st.feedShown),'pf-more'):null;if(more)more.onclick=()=>{st.feedShown+=20;renderFeed()};
  feed.replaceChildren(head,tiles,fields,seg,list,...(more?[more]:[]),exportBox(rows,check))}
 function exportBox(rows,check){const box=el('div',undefined,'pf-card pf-export'),h=el('div',undefined,'pf-card-head');h.append(el('h4','Scarica e salva'),el('p',check.summary.ready?'Il feed non ha errori: caricalo in Merchant Center → Prodotti → Aggiungi prodotti → Carica un file.':'I prodotti con errori verrebbero rifiutati da Google: correggili nel foglio o nelle schede, oppure scarica e sistemali dopo. Il file controlli-feed.csv li elenca tutti.','muted'));
  const meta={name:brand||project.name,title:'Prodotti '+(brand||clean(project.name)),link:(rows.find(r=>/^https:/.test(r.link)&&isUrl(r.link))||{}).link||'',styleLabel:style(st.style)?style(st.style).label:''};
  const grid=el('div',undefined,'pf-export-grid'),out=el('p','','tool-status');out.setAttribute('role','status');
  const files=exportFiles(rows,check,meta),fileOf=k=>files.find(f=>f.name===FILES[k]).data;
  const item=(title,sub,fn,primary)=>{const b=button('','pf-exp'+(primary?' primary':''));b.append(el('strong',title),el('small',sub));b.onclick=()=>{try{fn()}catch(e){out.textContent='Non scaricato: '+e.message}};grid.append(b);return b};
  const dl=(k,type)=>()=>{download(FILES[k],fileOf(k),type);out.textContent='Scaricato '+FILES[k]+'.'};
  item('Tutto in uno zip','Feed TSV e XML, testi CSV, controlli e LEGGIMI',()=>{const z=exportZip(rows,check,meta),name=zipName(meta.name);download(name,z,'application/zip');out.textContent='Scaricato '+name+' · '+files.length+' file.'},true);
  item('Feed TSV',FILES.tsv,dl('tsv','text/tab-separated-values;charset=utf-8'));item('Feed XML','RSS 2.0 con lo spazio dei nomi g:',dl('xml','application/xml;charset=utf-8'));
  item('Testi per il sito','CSV con tutte le colonne',dl('sheet','text/csv;charset=utf-8'));item('WooCommerce','CSV da importare per SKU',dl('woo','text/csv;charset=utf-8'));item('Shopify','CSV da importare per handle',dl('shopify','text/csv;charset=utf-8'));
  const acts=el('div',undefined,'ps-actions pf-save');
  if(ctx.workspace&&ctx.projectId){const sv=button(st.recordId?'Aggiorna nel progetto':'Salva nel progetto');sv.onclick=async()=>{sv.disabled=true;out.textContent='Salvo le schede nel progetto…';
   try{const rec=savedRecord({fileName:st.fileName,sheet:st.sheet,mapping:st.mapping,settings:st.settings,styleId:st.style,items:st.items},{by:ctx.by,id:st.recordId||undefined});st.recordId=rec.id;const s=await saveToProject(ctx.workspace,ctx.projectId,rec);st.saved=s.items;renderSaved();
    sv.textContent='Salvate nel progetto';out.replaceChildren(dom().createTextNode('Salvate nel progetto: '+rec.items.length+' schede e il foglio, da riaprire qui. '));if(ctx.agentsUrl){const a=el('a','Apri il Content e UX Writer →');a.href=ctx.agentsUrl;out.append(a)}}
   catch(e){out.textContent='Non salvate: '+e.message;sv.disabled=false}};acts.append(sv)}
  acts.append(el('span','Il caricamento su Merchant Center e sul negozio lo fai tu: RADIX non pubblica nulla.','muted'));
  box.append(h,grid,acts,out);return box}
 // ---- saved in the project ----
 function renderSaved(){if(!st.saved.length){savedBox.hidden=true;return}savedBox.replaceChildren(el('h4','Schede salvate nel progetto'));const row=el('div',undefined,'ad-saved-row');
  st.saved.slice().reverse().forEach(r=>{const b=button((r.fileName||'Schede')+' · '+(r.items||[]).length+' schede · '+new Date(r.at).toLocaleDateString('it-IT'),'ad-saved-item');b.onclick=()=>reopen(r);row.append(b)});savedBox.append(row);savedBox.hidden=false}
 function reopen(r){const x=fromRecord(r);Object.assign(st,{sheet:x.sheet,fileName:x.fileName,mapping:x.mapping,auto:{...x.mapping},settings:x.settings,items:x.items,style:x.style,styles:[],run:null,recordId:r.id});st.open.clear();
  refresh();after.forEach(e=>e.hidden=false);renderMap();renderPreview();renderQuestions();stylesBox.hidden=true;sheetInfo.textContent=(x.fileName||'Foglio salvato')+': '+st.products.length+' prodotti, riaperto dal progetto.';
  if(st.style){bulk.hidden=false;renderBulk()}feed.hidden=false;renderFeed();setStep(st.style?3:4);status.textContent='Riaperte le schede salvate il '+new Date(r.at).toLocaleDateString('it-IT')+': '+st.items.size+' schede.'}
 (async()=>{if(!ctx.workspace||!ctx.projectId)return;try{st.saved=readStore(await ctx.workspace.bind(ctx.projectId,'agents').load()).items;renderSaved()}catch(e){}})();
 return wrap}
return Object.freeze({AGENT,BATCH,SAMPLES,MAX_PRODUCTS,LIMITS,TONES,CHANNELS,STYLES,LANGUAGES,CURRENCIES,AVAILABILITY,CONDITIONS,FIELDS,FEED_COLUMNS,FILES,FLAG_LABEL,STATUS_LABEL,
 normalizeSettings,field,detectMapping,missingColumns,parsePrice,feedPrice,availabilityOf,conditionOf,gtinCheck,isUrl,toProducts,factsText,pickSamples,groundingFlags,flagText,titleIssues,capsWords,fit,buildTitle,
 stylesPrompt,batchPrompt,parseJson,itemFrom,finishItem,parseBatch,parseStyles,markDuplicates,planBatches,newRun,runCounts,runBatches,retryFailed,FATAL,
 feedRows,validateRow,validateFeed,columnsOf,toTsv,toXml,descHtml,sheetCsv,wooCsv,shopifyCsv,reportCsv,readme,exportFiles,exportZip,zipName,
 readStore,savedRecord,fromRecord,addRecord,saveToProject,sampleSheet,sampleCsv,readSheet,productStudio});
});
