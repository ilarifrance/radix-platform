/* Studio Traduzione e localizzazione (L1): site, catalogue, product sheets, posts or free text, from Italian into
   English, German, French and Spanish.
   1) The questions: target languages [EN · DE · FR · ES] (more than one), the material [Sito · Catalogo · Schede · Post
      · Testo libero] and its source (a .xlsx or CSV sheet read by the CRM import readers, as lib/catalog-studio.js and
      lib/product-studio.js; the product sheets saved by the Studio Schede prodotto, key productSheets; the posts of the
      PED, the saved HTML newsletters and the texts of the Studio Testi; or pasted text), the glossary (terms not to
      translate, forced translations per language), notes on tone and market, and «testi tecnici o legali».
   2) Three tones (Fedele, Naturale, Marketing) on the first 3 items: ONE AI call to the Copywriter, behind the RADIX
      confirmation (lib/radix-confirm.js). The person picks the tone.
   3) Every other item in batches (at most 10 items and about 12,000 characters × languages per call): ONE confirmation
      states items, languages, characters and calls up front, then exactly one AI call per batch; pause, resume, retry.
      Before anything is sent, links, emails, phone numbers, codes, SKUs, EANs and merge tags are swapped for
      placeholders (⟦1⟧) and put back after: they never reach the AI and come back identical. Columns that hold personal
      data (email, phone, names of people, addresses, tax codes, IBAN) cannot be chosen; nothing comes from the CRM.
   4) Deterministic checks for every text and language: numbers, prices and dates with the same values (only the format
      follows the language), codes/SKUs/links/emails identical, length within the field limit (Merchant titles 150,
      meta descriptions 155, SEO titles 70, alt 125, email subject 60…) and a warning over +30% of the original, the
      glossary respected, the language formats (decimals, € position, dates). Technical and legal texts are flagged for
      a native-speaker review.
   5) Export in the format that came in: a sheet → CSV with one column per language next to each translated column;
      product sheets → translated copies (one CSV per language) and the CSV with the languages side by side; posts,
      newsletters and text → Markdown per language. Plus glossario.csv, controlli.csv, LEGGIMI.txt and one zip. Saved in
      the project in the «agents» document, key translations (every other key kept).
   Pure part runs in Node for the tests; translationStudio() is the browser widget. Nothing is generated on load. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixTranslationStudio=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
// The styled RADIX confirmation (lib/radix-confirm.js) before every paid step; root.confirm only if it is missing.
const askConfirm=o=>{const C=root.RadixConfirm||(typeof require==='function'?require('./radix-confirm.js'):null);return C?C.ask(o):Promise.resolve(!!root.confirm([o.title,o.cost,o.message].filter(Boolean).join('\n')))};
const AGENT='copywriter',WHO='Copywriter',SAMPLES=3,BATCH_ITEMS=10,BATCH_CHARS=12000,MAX_ITEMS=500,UNIT_MAX=4000,TEXT_MAX=60000,MAX_SAVED=5,SAVE_BUDGET=450000,EXPANSION=.3,GLOSSARY_MAX=80;
function lib(name,file){if(root[name])return root[name];try{return typeof require==='function'?require(file):null}catch(e){return null}}
const csvLib=()=>lib('RadixCrmCsv','../sales/crm-csv-core.js'),zipLib=()=>lib('RadixZip','./zip-lite.js'),productLib=()=>lib('RadixProductStudio','./product-studio.js');
const str=v=>v==null?'':String(v);
const clean=s=>str(s).replace(/[\s ]+/g,' ').trim();
const block=s=>str(s).replace(/\r/g,'').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
const chars=s=>[...str(s)].length;
const norm=s=>str(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const slug=s=>str(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50);
const esc=s=>str(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

// ---- the questions ----
// Languages: what the prompt says about the market and the formats that follow the language.
const LANGS=[
 {id:'en',code:'EN',label:'Inglese',words:'inglese britannico (Regno Unito e mercati internazionali)',dec:'.',cur:'before',dateSep:'/',formats:'decimali con il punto (4.50), migliaia con la virgola (1,200), il simbolo € prima dell’importo (€4.50), date gg/mm/aaaa (12/11/2026) o con il mese in lettere'},
 {id:'de',code:'DE',label:'Tedesco',words:'tedesco (Germania e Austria)',dec:',',cur:'after',dateSep:'.',formats:'decimali con la virgola (4,50), migliaia con il punto (1.200), il simbolo € dopo l’importo con uno spazio (4,50 €), date gg.mm.aaaa (12.11.2026)'},
 {id:'fr',code:'FR',label:'Francese',words:'francese (Francia)',dec:',',cur:'after',dateSep:'/',formats:'decimali con la virgola (4,50), migliaia con lo spazio (1 200), il simbolo € dopo l’importo con uno spazio (4,50 €), date gg/mm/aaaa (12/11/2026)'},
 {id:'es',code:'ES',label:'Spagnolo',words:'spagnolo (Spagna)',dec:',',cur:'after',dateSep:'/',formats:'decimali con la virgola (4,50), migliaia con il punto (1.200), il simbolo € dopo l’importo con uno spazio (4,50 €), date gg/mm/aaaa (12/11/2026)'}];
const lang=id=>LANGS.find(l=>l.id===id)||null;
const MATERIALS=[
 {id:'sito',label:'Sito',sub:'Pagine, titoli SEO e meta description',sources:['text','sheet']},
 {id:'catalogo',label:'Catalogo',sub:'Il foglio dei prodotti, colonna per colonna',sources:['sheet']},
 {id:'schede',label:'Schede',sub:'Le schede prodotto salvate o un foglio',sources:['sheets','sheet']},
 {id:'post',label:'Post',sub:'Post del piano, newsletter e testi salvati',sources:['saved','text']},
 {id:'testo',label:'Testo libero',sub:'Incolli il testo, lo traduco a sezioni',sources:['text']}];
const material=id=>MATERIALS.find(m=>m.id===id)||MATERIALS[0];
const SOURCES={text:'Incolla il testo',sheet:'Foglio .xlsx o .csv',sheets:'Schede prodotto salvate',saved:'Testi salvati nel progetto'};
const STYLES=[
 {id:'fedele',label:'Fedele',sub:'Vicina all’originale, frase per frase',words:'fedele: resta vicino all’originale frase per frase, senza aggiungere né togliere nulla'},
 {id:'naturale',label:'Naturale',sub:'Come scritta da un madrelingua',words:'naturale: suona come scritto da un madrelingua, riorganizza le frasi quando serve, stesso contenuto'},
 {id:'marketing',label:'Marketing',sub:'Adattata al mercato, più persuasiva',words:'marketing: adatta modi di dire e richiami al mercato di arrivo, più persuasivo, ma con gli stessi fatti, numeri e promesse dell’originale'}];
const style=id=>STYLES.find(s=>s.id===id)||null;
// The answers with every default: at least one language (English), a known material.
function normalizeSettings(s){const x=s||{},langs=LANGS.map(l=>l.id).filter(id=>(x.langs||[]).includes(id));
 return {langs:langs.length?langs:['en'],material:material(x.material).id,glossary:str(x.glossary).slice(0,4000),notes:str(x.notes).slice(0,1000),technical:!!x.technical}}

// ---- the glossary: one term per line ----
// «Forno Aurora» → never translated. «lievito madre = EN: sourdough; DE: Sauerteig» → forced per language.
// «grissini = grissini» → the same word in every language.
function parseGlossary(text){const out=[],seen=new Set();
 for(const raw of str(text).split(/\r?\n/)){const line=raw.replace(/^\s*[-*•]\s*/,'').trim();if(!line||line.startsWith('#'))continue;
  const m=/^(.+?)\s*(?:=|→|->|:=)\s*(.+)$/.exec(line);const term=clean(m?m[1]:line).replace(/^[«"“]|[»"”]$/g,'').slice(0,80);if(!term||seen.has(term.toLowerCase()))continue;
  let forced=null;
  if(m){forced={};const right=m[2],parts=right.split(/\s*[;|]\s*/).map(p=>/^(EN|DE|FR|ES)\s*[:=]\s*(.+)$/i.exec(p.trim())).filter(Boolean);
   if(parts.length)parts.forEach(p=>{forced[p[1].toLowerCase()]=clean(p[2]).replace(/^[«"“]|[»"”]$/g,'').slice(0,80)});
   else{const v=clean(right).replace(/^[«"“]|[»"”]$/g,'').slice(0,80);if(v)forced.all=v}
   if(!Object.keys(forced).length)forced=null}
  seen.add(term.toLowerCase());out.push({term,forced});if(out.length>=GLOSSARY_MAX)break}
 return out}
const forcedFor=(e,l)=>e&&e.forced?(e.forced[l]||e.forced.all||''):'';
// A term as a whole word or phrase, accents and case kept apart from letters around it.
const wordRe=(t,flags)=>new RegExp('(?<![\\p{L}\\p{N}])'+esc(t)+'(?![\\p{L}\\p{N}])',flags||'iu');
const hasTerm=(text,t)=>!!t&&wordRe(t).test(str(text));

// ---- protected pieces: never sent to the AI, back identical ----
// Merge tags, links, emails, phone numbers, codes/SKUs (letters and digits with - _ / or a prefix like SKU123) and long
// digit runs (EAN/GTIN).
const PROTECT=[
 ['tag',/\{\{[^{}\n]{1,40}\}\}|\{[a-zà_]{2,20}\}/gi],
 ['url',/\bhttps?:\/\/[^\s<>"«»]+|\bwww\.[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s<>"«»]*)?/gi],
 ['email',/\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g],
 ['phone',/(?:\+\d{1,3}[\s.]?)?\b(?:0\d{1,4}|3\d{2})[\s./-]?\d{3,4}[\s./-]?\d{3,4}\b/g],
 ['code',/\b(?=[A-Za-z0-9]*\d)(?=[A-Za-z0-9]*[A-Za-z])[A-Za-z0-9]+(?:[-_/][A-Za-z0-9]+)+\b|\b(?=[A-Za-z0-9-]*[A-Za-z])[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*-\d+\b|\b[A-Z]{1,5}\d{2,}[A-Z0-9]*\b|\b\d{8,14}\b/g]];
const KIND_LABEL={tag:'campo',url:'link',email:'email',phone:'telefono',code:'codice'};
// [{kind,value,start,end}] without overlaps, in text order.
function protectedIn(text){const t=str(text),out=[];
 for(const [kind,re] of PROTECT){re.lastIndex=0;let m;while((m=re.exec(t))){let v=m[0];if(kind==='url'||kind==='email')v=v.replace(/[.,;:!?)\]»]+$/,'');if(!v)continue;
  const s=m.index,e=s+v.length;if(kind==='phone'&&(v.replace(/\D/g,'').length<8||/^\d{4}$/.test(v.trim())))continue;
  if(out.some(o=>s<o.end&&e>o.start))continue;out.push({kind,value:v,start:s,end:e})}}
 return out.sort((a,b)=>a.start-b.start)}
// The text sent to the AI: each protected piece swapped for ⟦n⟧.
function mask(text){const t=str(text),ps=protectedIn(t);let out='',at=0;ps.forEach((p,i)=>{out+=t.slice(at,p.start)+'⟦'+(i+1)+'⟧';at=p.end});out+=t.slice(at);
 return {text:out,tokens:ps.map(p=>p.value)}}
// Back from the AI: ⟦n⟧ (also [[n]] or ⟦ n ⟧) → the original piece.
function unmask(text,tokens){return str(text).replace(/⟦\s*(\d{1,3})\s*⟧|\[\[\s*(\d{1,3})\s*\]\]/g,(m,a,b)=>{const v=(tokens||[])[+(a||b)-1];return v==null?m:v})}
const EMAIL_RE=/\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+/,PHONE_RE=/(?:\+\d{1,3}[\s.]?)?\b(?:0\d{1,4}|3\d{2})[\s./-]?\d{3,4}[\s./-]?\d{3,4}\b/;
// Nothing personal in what is sent: no email, no phone number (the masked text never has them).
const personalIn=text=>{const t=str(text);return EMAIL_RE.test(t)||(PHONE_RE.test(t)&&t.match(PHONE_RE)[0].replace(/\D/g,'').length>=8)};

// ---- numbers, prices and dates ----
const DATE_RE=/\b(\d{4})-(\d{2})-(\d{2})\b|\b(\d{1,2})([/.-])(\d{1,2})\5(\d{4})\b/g;
function datesIn(text){const out=[];str(text).replace(DATE_RE,(m,y,mo,d,d2,sep,mo2,y2)=>{const dd=+(d||d2),mm=+(mo||mo2),yy=+(y||y2);if(dd>=1&&dd<=31&&mm>=1&&mm<=12)out.push({raw:m,iso:yy+'-'+String(mm).padStart(2,'0')+'-'+String(dd).padStart(2,'0'),day:dd,year:yy,sep:sep||'-'});return m});return out}
const NUM_RE=/\d{1,2}:\d{2}(?!\d)|\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d+)?(?!\d)|\d+(?:[.,]\d+)*/g;
// «4,50» and «4.50» are the same price; «1.200» may be 1200 or 1.2: every reading is kept.
function numValues(raw){const s=str(raw).replace(/[\s\u00a0\u202f']/g,''),out=new Set(),put=x=>{const n=Number(x);if(isFinite(n))out.add(String(n))};
 if(/^\d{1,2}:\d{2}$/.test(s)){const [h,m]=s.split(':');put(+h+ +m/100);return [...out]}
 const d=s.lastIndexOf(','),p=s.lastIndexOf('.');
 if(d>=0&&p>=0){if(d>p)put(s.replace(/\./g,'').replace(',','.'));else put(s.replace(/,/g,''))}
 else if(d>=0||p>=0){const parts=s.split(d>=0?',':'.');
  if(parts.length>2)put(parts.join(''));else{put(parts[0]+'.'+parts[1]);if(parts[1].length===3&&/^[1-9]\d{0,2}$/.test(parts[0]))put(parts.join(''))}}
 else put(s);
 return [...out]}
// The numbers of a text, protected pieces and dates left out (they have their own checks).
function numbersIn(text){let t=str(text);const ps=protectedIn(t);for(let i=ps.length-1;i>=0;i--)t=t.slice(0,ps[i].start)+' '+t.slice(ps[i].end);
 t=t.replace(/⟦\s*\d+\s*⟧/g,' ').replace(DATE_RE,' ');return (t.match(NUM_RE)||[]).map(raw=>({raw:raw.trim(),values:numValues(raw)}))}
const sameNumber=(a,b)=>a.values.some(v=>b.values.includes(v));
// {missing:[raw], extra:[raw]}: each number of the original once in the translation, nothing added.
function numberDiff(src,tgt){const S=numbersIn(src),T=numbersIn(tgt),used=new Set(),missing=[];
 // a date of the original written with the month in words: its day and year are not extra numbers
 for(const d of datesIn(src))for(const v of [d.day,d.year]){const i=T.findIndex((t,k)=>!used.has(k)&&t.values.includes(String(v)));if(i>=0&&!S.some(s=>s.values.includes(String(v))))used.add(i)}
 for(const s of S){const i=T.findIndex((t,k)=>!used.has(k)&&sameNumber(s,t));if(i<0)missing.push(s.raw);else used.add(i)}
 return {missing,extra:T.filter((t,k)=>!used.has(k)).map(t=>t.raw)}}
// A date written with digits: the same date in digits, or its day and year next to the month in words.
function dateDiff(src,tgt){const T=datesIn(tgt),nums=numbersIn(str(tgt).replace(DATE_RE,' ')).flatMap(n=>n.values);
 return datesIn(src).filter(d=>!T.some(t=>t.iso===d.iso)&&!(nums.includes(String(d.day))&&nums.includes(String(d.year)))).map(d=>d.raw)}

// ---- field limits ----
// Per field, from the column name or the saved field: the layout limits of the channels RADIX already checks.
const LIMITS=Object.freeze({title:150,meta:155,seoTitle:70,alt:125,bullet:200,description:5000,subject:60,preheader:110,sms:160});
function limitFor(name){const n=norm(name);if(!n)return null;
 if(/meta/.test(n)&&/desc/.test(n))return LIMITS.meta;
 if(/seo/.test(n)&&/tit/.test(n)||n==='metatitle'||n==='titletag')return LIMITS.seoTitle;
 if(/^alt|alttext|altimmagine|testoalternativo/.test(n))return LIMITS.alt;
 if(/^(?:punto|punti|bullet|puntochiave|puntichiave)/.test(n))return LIMITS.bullet;
 if(/^(?:oggetto|subject)$/.test(n))return LIMITS.subject;
 if(/^(?:anteprima|preheader)$/.test(n))return LIMITS.preheader;
 if(/^(?:sms|testosms)$/.test(n))return LIMITS.sms;
 if(/^(?:titolo|title|nome|name|nomeprodotto|productname|titologoogle|titolomerchant)$/.test(n))return LIMITS.title;
 if(/^(?:descrizione|description|descrizioneprodotto|descrizionelunga|longdescription)$/.test(n))return LIMITS.description;
 return null}
// The channel limits of a post.
const CHANNEL_MAX=[[/instagram|tiktok/i,2200],[/linkedin/i,3000],[/twitter|^x$|\bx\b/i,280],[/threads/i,500]];
const channelMax=ch=>{const hit=CHANNEL_MAX.find(([re])=>re.test(str(ch)));return hit?hit[1]:null};

// ---- the checks of one text in one language ----
const CHECKS=[['numbers','Numeri, prezzi e date uguali all’originale'],['codes','Codici, SKU, link ed email identici'],['length','Lunghezze nei limiti del layout'],['glossary','Glossario rispettato'],['format','Formati della lingua (decimali, €, date)']];
// [{kind, level:'fail'|'warn', msg}] for a unit {text, max} translated as `tgt` into language `l`.
function checkText(unit,tgt,l,glossary){const src=str(unit&&unit.text),t=str(tgt),out=[],L=lang(l)||LANGS[0],add=(kind,level,msg)=>out.push({kind,level,msg});
 if(!clean(t)){add('empty','fail','Traduzione vuota.');return out}
 const nd=numberDiff(src,t);nd.missing.forEach(n=>add('numbers','fail','Il numero «'+n+'» dell’originale manca o è cambiato.'));nd.extra.forEach(n=>add('numbers','fail','Il numero «'+n+'» non c’è nell’originale.'));
 dateDiff(src,t).forEach(d=>add('numbers','fail','La data «'+d+'» manca o è cambiata.'));
 const T=protectedIn(t).map(p=>p.value),pool=T.slice();
 for(const p of protectedIn(src)){const i=pool.indexOf(p.value);if(i>=0)pool.splice(i,1);else add('codes','fail',(KIND_LABEL[p.kind]||'codice').replace(/^./,c=>c.toUpperCase())+' «'+p.value+'» non è identico all’originale.')}
 if(/⟦\s*\d+\s*⟧/.test(t))add('codes','fail','È rimasto un segnaposto ⟦n⟧: il codice non è tornato al suo posto.');
 const n=chars(t),s=chars(src),max=unit&&unit.max;
 if(max&&n>max)add('length','fail',n+' caratteri su '+max+': oltre il limite del campo.');
 else if(s>=20&&n>s*(1+EXPANSION))add('length','warn','+'+Math.round((n/s-1)*100)+'% rispetto all’originale ('+n+' caratteri contro '+s+'): controlla che stia nel layout.');
 for(const g of glossary||[]){if(!hasTerm(src,g.term))continue;const f=forcedFor(g,l);
  if(!g.forced){const as=wordRe(g.term).exec(src)[0];if(!wordRe(as,'u').test(t))add('glossary','fail','«'+as+'» non va tradotto: deve restare identico.')}
  // a forced word may sit inside a compound (DE «Sauerteigbrot»): found anywhere, case aside
  else if(f&&!t.toLowerCase().includes(f.toLowerCase()))add('glossary','fail','Per «'+g.term+'» usa «'+f+'».')}
 // the formats of the language, on prices and numeric dates
 const money=t.match(/(?:€\s?\d[\d.,\u00a0\u202f]*|\d[\d.,\u00a0\u202f]*\s?(?:€|EUR\b|euro\b))/gi)||[];
 for(const m of money){const num=(m.match(/\d[\d.,]*/)||[''])[0];
  if(L.dec==='.'&&/,\d{2}$/.test(num))add('format','warn','In '+L.label.toLowerCase()+' i decimali si scrivono con il punto: «'+m.trim()+'».');
  if(L.dec===','&&/\.\d{2}$/.test(num))add('format','warn','In '+L.label.toLowerCase()+' i decimali si scrivono con la virgola: «'+m.trim()+'».');
  if(L.cur==='before'&&/\d\s?€/.test(m))add('format','warn','In '+L.label.toLowerCase()+' il simbolo € va prima dell’importo: «'+m.trim()+'».');
  if(L.cur==='after'&&/€\s?\d/.test(m))add('format','warn','In '+L.label.toLowerCase()+' il simbolo € va dopo l’importo: «'+m.trim()+'».')}
 for(const d of datesIn(t))if(d.sep!=='-'&&d.sep!==L.dateSep)add('format','warn','In '+L.label.toLowerCase()+' la data si scrive «'+d.raw.split(d.sep).join(L.dateSep)+'».');
 return out}
const levelOf=issues=>issues.some(i=>i.level==='fail')?'fail':issues.length?'warn':'ok';

// ---- native-speaker review: technical and legal texts ----
const LEGAL=/\b(?:privacy|gdpr|informativa|termini e condizioni|condizioni (?:generali|di vendita|d['’]uso)|recesso|garanzia legale|responsabilit[àa]|contratto|ai sensi|d\.\s?lgs|decreto|regolamento \(ue\)|art\.\s?\d|clausol[ae]|foro competente|cookie)\b/i;
const TECH=/\b(?:istruzioni|avvertenz[ae]|sicurezza|allergen[ie]|ingredienti|composizione|tensione|potenza|watt|volt|\d+\s?(?:mm|cm|kw|w|v|hz|bar|°c)\b|specifiche|scheda tecnica|manutenzione|installazione|dosaggio|conservazione|valori nutrizionali|certificazion[ei]|norma (?:en|iso|uni))\b/i;
function reviewReason(item,settings){if(settings&&settings.technical)return 'Hai indicato testi tecnici o legali: falli rileggere a un madrelingua prima di pubblicarli.';
 const t=(item&&item.units||[]).map(u=>u.text).join('\n');if(LEGAL.test(t))return 'Testo legale (privacy, condizioni, garanzia…): serve la revisione di un madrelingua.';
 if(TECH.test(t))return 'Testo tecnico (istruzioni, ingredienti, misure, sicurezza…): serve la revisione di un madrelingua.';return ''}

// ---- the sources → items of units ----
// item: {key, name, units:[{k, item, field, label, text, max, prefix}]}. A unit is one text to translate.
const unit=(itemKey,field,label,text,max,prefix)=>({k:itemKey+'|'+field,item:itemKey,field,label:clean(label).slice(0,80),text:block(text).slice(0,UNIT_MAX),max:max||null,prefix:prefix||''});
// Pasted text: «# Titolo» / «## Sezione» start an item, «Titolo SEO:» and «Meta description:» lines get Google's limits,
// lists keep their marker; without headings each paragraph is an item.
function fromText(text,{name}={}){const lines=block(str(text).slice(0,TEXT_MAX)).split('\n'),items=[];let cur=null,para=[],n=0;
 const head=/^(#{1,4})\s+(.+)$/,meta=/^(titolo seo|seo title|title tag|meta title|meta description|meta descrizione|descrizione meta)\s*:\s*(.+)$/i,list=/^(\s*(?:[-*•]|\d{1,2}[.)])\s+)(.+)$/;
 const newItem=title=>{n++;cur={key:'S'+n,name:clean(title||'').slice(0,80)||'Sezione '+n,units:[]};items.push(cur);return cur};
 const flush=()=>{if(!para.length)return;if(!cur)newItem(clean(para.join(' ')).slice(0,60));cur.units.push(unit(cur.key,'p'+cur.units.length,'Paragrafo',para.join('\n')));para=[]};
 const hasHeads=lines.some(l=>head.test(l));
 for(const raw of lines){const l=raw.trimEnd();
  if(!l.trim()){flush();if(!hasHeads)cur=null;continue}
  let m=head.exec(l);if(m){flush();newItem(m[2]);cur.units.push(unit(cur.key,'h','Titolo',m[2],null,m[1]+' '));continue}
  m=meta.exec(l.trim());if(m){flush();if(!cur)newItem(m[2]);const seo=/titolo|title/i.test(m[1])&&!/desc/i.test(m[1]);cur.units.push(unit(cur.key,(seo?'seo':'meta')+cur.units.length,seo?'Titolo SEO':'Meta description',m[2],seo?LIMITS.seoTitle:LIMITS.meta,m[1]+': '));continue}
  m=list.exec(l);if(m){flush();if(!cur)newItem(m[2]);cur.units.push(unit(cur.key,'li'+cur.units.length,'Punto elenco',m[2],null,m[1]));continue}
  para.push(l)}
 flush();return items.filter(it=>it.units.length).slice(0,MAX_ITEMS).map(it=>({...it,source:name||'testo'}))}

// Sheets: columns with personal data can never be chosen.
const PERSONAL_EXACT=/^(?:e?mail|pec|tel|telefono|cell|cellulare|phone|mobilephone|fax|cognome|surname|lastname|firstname|nomecognome|nomeecognome|nominativo|referente|contatto|contatti|persona|cliente|indirizzo|address|via|cap|zip|zipcode|citta|city|provincia|codicefiscale|codfisc|cf|partitaiva|piva|vat|vatnumber|iban|datadinascita|nascita|birthday|birthdate|eta|sesso|gender|consenso|privacy)$/;
const PERSONAL_PART=/email|telefono|cellulare|codicefiscale|partitaiva|iban|indirizzo|cognome|datadinascita|referente/;
const isPersonal=(header,values)=>{const h=norm(header);if(PERSONAL_EXACT.test(h)||PERSONAL_PART.test(h))return true;const vs=(values||[]).filter(Boolean);return vs.length>0&&vs.filter(v=>personalIn(v)).length/vs.length>=.5};
const TEXT_COLUMNS=['titolo','nome','nomeprodotto','prodotto','title','name','productname','descrizione','description','descrizionebreve','descrizionelunga','descrizioneprodotto','shortdescription','longdescription','dettagli','caratteristiche','details',
 'ingredienti','ingredients','categoria','category','producttype','confezione','materiale','material','metadescription','metadescrizione','titoloseo','seotitle','metatitle','alt','altimmagine','alttext','punti','puntichiave','bullet','bullets','highlights',
 'testo','text','body','bodyhtml','caption','didascalia','slogan','claim','headline','sottotitolo','subtitle','oggetto','subject','anteprima','preheader','note','notes','colore','color','colour'];
const NAME_COLUMNS=['titolo','nome','nomeprodotto','prodotto','title','name','productname','denominazione'];
const URLISH=/^(?:https?:\/\/|www\.)\S+$/i;
// {headers:[{name, personal, text, auto, max}]}: which columns are text to translate (auto-chosen) and which are personal.
function sheetColumns(sheet){const rows=(sheet&&sheet.rows||[]).slice(0,40);
 return (sheet&&sheet.headers||[]).filter(Boolean).map(h=>{const vs=rows.map(r=>clean(r[h])).filter(Boolean),personal=isPersonal(h,vs);
  const texty=vs.filter(v=>/\p{L}{2,}/u.test(v)&&!URLISH.test(v)&&!/^[\d\s.,€%+-]+$/.test(v)&&!protectedIn(v).some(p=>p.value===v));
  const share=vs.length?texty.length/vs.length:0,avg=texty.length?texty.reduce((n,v)=>n+v.length,0)/texty.length:0;
  const text=!personal&&share>=.6,alias=TEXT_COLUMNS.includes(norm(h));
  return {name:h,personal,text,auto:text&&(alias||avg>=25),max:limitFor(h)}})}
function nameColumn(headers){const hs=headers||[];return hs.find(h=>NAME_COLUMNS.includes(norm(h)))||hs.find(h=>/^(?:id|codice|sku|code)$/i.test(norm(h)))||''}
// The chosen columns of every row → items (one per row, key R<row of the sheet>); personal columns are dropped.
function fromSheet(sheet,columns,{name}={}){const cols=sheetColumns(sheet),ok=new Set(cols.filter(c=>!c.personal&&(columns||[]).includes(c.name)).map(c=>c.name)),nc=nameColumn(sheet&&sheet.headers);
 const max=h=>(cols.find(c=>c.name===h)||{}).max||null,items=[];
 (sheet&&sheet.rows||[]).forEach((r,i)=>{const key='R'+(i+2),us=[...ok].filter(h=>clean(r[h])).map(h=>unit(key,'c:'+h,h,r[h],max(h)));if(!us.length)return;
  items.push({key,row:i+2,name:clean(nc&&r[nc]||'Riga '+(i+2)).slice(0,80),units:us,source:name||'foglio'})});
 return items.slice(0,MAX_ITEMS)}

// Saved product sheets (lib/product-studio.js records): title, description, key points, meta and alt of every product.
function fromProductSheet(rec){const P=productLib(),items=[];let byKey=new Map();
 try{if(P&&P.fromRecord){const back=P.fromRecord(rec);byKey=new Map(back.products.map(p=>[p.key,p]))}}catch(e){}
 for(const it of rec&&rec.items||[]){if(!it||!it.key)continue;const p=byKey.get(it.key)||{},key='P'+it.key,us=[];
  if(clean(it.title))us.push(unit(key,'title','Titolo',it.title,LIMITS.title));
  if(clean(it.description))us.push(unit(key,'description','Descrizione',it.description,LIMITS.description));
  (it.bullets||[]).forEach((b,i)=>{if(clean(b))us.push(unit(key,'bullet'+i,'Punto chiave '+(i+1),b,LIMITS.bullet))});
  if(clean(it.meta))us.push(unit(key,'meta','Meta description',it.meta,LIMITS.meta));
  if(clean(it.alt))us.push(unit(key,'alt','Alt dell’immagine',it.alt,LIMITS.alt));
  if(us.length)items.push({key,productKey:it.key,id:clean(p.id),name:clean(it.title||p.name||it.key).slice(0,80),units:us,source:clean(rec.fileName)||'schede'})}
 return items.slice(0,MAX_ITEMS)}

// Saved texts of the project, newest first: PED posts (the «editorial» document), HTML newsletters (key newsletters) and
// the documents of the Studio Testi (the «---DOCUMENTO---» blocks of the agents' threads).
const DOC_RE=/---DOCUMENTO: ([^\n]*?)---\n([\s\S]*?)\n---FINE DOCUMENTO---/g;
function savedTexts(agentsDoc,editorialDoc){const out=[];
 for(const c of (editorialDoc&&Array.isArray(editorialDoc.contents)?editorialDoc.contents:[]).slice(-30).reverse()){if(!c||!clean(c.copy))continue;
  out.push({id:'post:'+clean(c.id),kind:'post',title:clean(c.title||'Post').slice(0,80),meta:[c.channel,c.date].filter(Boolean).join(' · '),fields:[['copy','Testo del post'+(c.channel?' ('+clean(c.channel)+')':''),block(c.copy),channelMax(c.channel)]].concat(clean(c.title)?[['title','Titolo',clean(c.title),null]]:[])})}
 for(const r of (agentsDoc&&agentsDoc.newsletters&&Array.isArray(agentsDoc.newsletters.items)?agentsDoc.newsletters.items:[]).slice().reverse()){if(!r)continue;const f=[];
  if(clean(r.subject))f.push(['subject','Oggetto',clean(r.subject),LIMITS.subject]);if(clean(r.preheader))f.push(['preheader','Anteprima',clean(r.preheader),LIMITS.preheader]);
  (r.blocks||[]).forEach((b,i)=>{if(!b)return;const add=(k,l,v)=>{if(clean(v))f.push(['b'+i+k,l,block(v),null])};
   if(b.type==='text'){add('h','Titolo del blocco',b.heading);add('t','Testo',b.body)}else if(b.type==='button')add('l','Pulsante',b.label);else if(b.type==='hero')add('a','Alt dell’immagine',b.alt);
   else if(b.type==='columns'){add('lh','Colonna sinistra · titolo',b.left&&b.left.heading);add('lb','Colonna sinistra',b.left&&b.left.body);add('rh','Colonna destra · titolo',b.right&&b.right.heading);add('rb','Colonna destra',b.right&&b.right.body)}});
  if(f.length)out.push({id:'nl:'+clean(r.id),kind:'newsletter',title:clean(r.subject||'Newsletter').slice(0,80),meta:'Newsletter HTML'+(r.at?' · '+str(r.at).slice(0,10):''),fields:f})}
 const docs=[];for(const list of Object.values(agentsDoc&&agentsDoc.conversations||{})){if(!Array.isArray(list))continue;
  for(const m of list){if(!m||m.role!=='assistant'||typeof m.content!=='string')continue;DOC_RE.lastIndex=0;let d;
   while((d=DOC_RE.exec(m.content))){docs.push({at:str(m.at),name:clean(d[1]),body:d[2]})}}}
 docs.sort((a,b)=>b.at.localeCompare(a.at)).slice(0,20).forEach((d,i)=>out.push({id:'doc:'+i+':'+slug(d.name),kind:'doc',title:d.name.slice(0,80),meta:'Studio Testi'+(d.at?' · '+d.at.slice(0,10):''),markdown:d.body}));
 return out}
// The chosen saved texts → items: posts and newsletters field by field, documents section by section.
function fromSaved(list){const items=[];let n=0;
 for(const s of list||[]){n++;const key='T'+n;
  if(s.markdown){fromText(s.markdown,{name:s.title}).forEach((it,i)=>items.push({...it,key:key+'.'+(i+1),name:(i?s.title+' · '+it.name:s.title).slice(0,80),units:it.units.map(u=>({...u,k:key+'.'+(i+1)+'|'+u.field,item:key+'.'+(i+1)})),group:s.title}));continue}
  const us=(s.fields||[]).map(([f,l,v,max])=>unit(key,f,l,v,max));if(us.length)items.push({key,name:s.title,units:us,source:s.kind,group:s.title})}
 return items.slice(0,MAX_ITEMS)}

// ---- the prompts ----
// The rules shared by the tones and the batches; the glossary and the notes as the person wrote them.
function rules(settings,glossary){const s=normalizeSettings(settings),G=glossary||parseGlossary(s.glossary),L=[];
 L.push('Traduci dall’italiano in: '+s.langs.map(id=>{const l=lang(id);return l.code+' = '+l.words}).join('; ')+'.');
 L.push('Regole:');
 L.push('- I segnaposto come ⟦1⟧ sono codici, link, email, numeri di telefono o campi: copiali identici, senza tradurli, toglierli o aggiungerne.');
 L.push('- Numeri, prezzi, quantità, misure, percentuali e date: stessi valori dell’originale, non arrotondare, non convertire le unità metriche. Adatta solo il formato alla lingua:');
 s.langs.forEach(id=>{const l=lang(id);L.push('  · '+l.code+': '+l.formats+'.')});
 L.push('- Non aggiungere informazioni, promesse o dati che non sono nell’originale; non togliere nulla.');
 L.push('- Lunghezza: se un testo ha "max", resta entro quei caratteri; altrimenti resta entro il 30% in più dell’originale.');
 L.push('- Titoli Markdown, elenchi e a capo: stessa struttura dell’originale.');
 const keep=G.filter(g=>!g.forced).map(g=>'«'+g.term+'»'),forced=G.filter(g=>g.forced);
 if(keep.length)L.push('- Non tradurre, scrivi identici: '+keep.join(', ')+'.');
 if(forced.length){L.push('- Traduzioni obbligatorie:');forced.forEach(g=>L.push('  · «'+g.term+'» → '+s.langs.map(id=>{const f=forcedFor(g,id);return f?lang(id).code+' «'+f+'»':''}).filter(Boolean).join(', ')))}
 if(clean(s.notes))L.push('- Note su tono e mercato: '+clean(s.notes).slice(0,1000));
 return L}
// One call's texts: short ids (t1, t2…) and the masked texts. Never an email or a phone number.
function prepareCall(items){const list=[],map=new Map();let n=0;
 for(const it of items||[])for(const u of it.units){n++;const id='t'+n,m=mask(u.text);map.set(id,{unit:u,tokens:m.tokens});const x={id,testo:m.text};if(u.max)x.max=u.max;list.push(x)}
 return {list,map}}
const shapeOf=langs=>Object.assign({id:'t1'},...langs.map(id=>({[id]:'testo in '+lang(id).label.toLowerCase()})));
function proposalsPrompt(items,settings,glossary){const s=normalizeSettings(settings),call=prepareCall((items||[]).slice(0,SAMPLES));if(!call.list.length)throw Error('Non c’è nessun testo da tradurre: scegli o incolla il materiale.');
 const L=rules(s,glossary);L.push('','Traduci gli stessi testi in '+STYLES.length+' toni diversi, così si può scegliere quello per tutto il materiale:');STYLES.forEach(x=>L.push('- '+x.label+': '+x.words+'.'));
 L.push('','I testi (JSON):',JSON.stringify(call.list),'','Rispondi solo con JSON valido, senza testo prima o dopo:',JSON.stringify({toni:STYLES.map(x=>({tono:x.label,traduzioni:[shapeOf(s.langs)]}))}));
 return {prompt:L.join('\n'),call}}
function batchPrompt(items,styleId,settings,glossary){const s=normalizeSettings(settings),st=style(styleId)||STYLES[1],call=prepareCall(items);if(!call.list.length)throw Error('Nessun testo nel lotto.');
 const L=rules(s,glossary);L.push('- Tono scelto: '+st.words+'.','','I testi di questo lotto (JSON):',JSON.stringify(call.list),'','Rispondi solo con JSON valido, senza testo prima o dopo, con un oggetto per testo e il suo id:',JSON.stringify({traduzioni:[shapeOf(s.langs)]}));
 return {prompt:L.join('\n'),call}}

// ---- reading the replies ----
function parseJson(text){const raw=str(text).replace(/\r/g,''),f=/```(?:json)?\s*\n?([\s\S]*?)```/i.exec(raw),body=f?f[1]:raw,s=body.search(/[[{]/),e=Math.max(body.lastIndexOf('}'),body.lastIndexOf(']'));
 if(s<0||e<=s)return null;const t=body.slice(s,e+1);for(const x of [t,t.replace(/,\s*([}\]])/g,'$1')]){try{return JSON.parse(x)}catch(err){}}return null}
const pick=(o,keys)=>{if(!o||typeof o!=='object'||Array.isArray(o))return undefined;const ks=Object.keys(o);for(const k of keys){const hit=ks.find(x=>norm(x)===norm(k));if(hit!==undefined)return o[hit]}return undefined};
const LANG_KEYS={en:['en','inglese','english'],de:['de','tedesco','german','deutsch'],fr:['fr','francese','french','francais'],es:['es','spagnolo','spanish','espanol']};
// A list of translations → Map unit k → {lang: text}, the protected pieces put back.
function readList(arr,call,langs){const out=new Map();if(!Array.isArray(arr))return out;
 const ids=[...call.map.keys()],loose=[];
 arr.forEach(x=>{if(!x||typeof x!=='object')return;const id=str(pick(x,['id','k','chiave'])).trim(),hit=call.map.get(id);if(!hit){loose.push(x);return}put(hit,x)});
 if(!out.size&&loose.length===ids.length)loose.forEach((x,i)=>put(call.map.get(ids[i]),x));
 function put(hit,x){const o={};for(const l of langs){const v=pick(x,LANG_KEYS[l]||[l]);if(typeof v==='string'&&clean(v))o[l]=block(unmask(v,hit.tokens))}if(Object.keys(o).length)out.set(hit.unit.k,o)}
 return out}
function parseTranslations(text,call,langs){const d=parseJson(text);const arr=Array.isArray(d)?d:pick(d,['traduzioni','translations','testi']);return readList(arr,call,langs)}
// The tones reply → [{style, label, sub, out: Map}] in STYLES order.
function parseProposals(text,call,langs){const d=parseJson(text);let arr=Array.isArray(d)?d:pick(d,['toni','tones','stili','styles','proposte']);if(!Array.isArray(arr))return [];const out=[];
 arr.slice(0,6).forEach((x,i)=>{if(!x||typeof x!=='object')return;const name=norm(pick(x,['tono','tone','stile','style','nome','name']));
  const st=STYLES.find(s=>name&&(norm(s.label)===name||name.startsWith(norm(s.id).slice(0,5))))||(!name?STYLES[i]:null);if(!st||out.some(o=>o.style===st.id))return;
  const m=readList(pick(x,['traduzioni','translations','testi']),call,langs);if(m.size)out.push({style:st.id,label:st.label,sub:st.sub,out:m})});
 return out.sort((a,b)=>STYLES.findIndex(s=>s.id===a.style)-STYLES.findIndex(s=>s.id===b.style))}

// ---- batches ----
const itemChars=it=>(it&&it.units||[]).reduce((n,u)=>n+chars(u.text),0);
// An item is done when every unit has every language.
const itemDone=(it,out,langs)=>it.units.every(u=>{const o=out&&(out instanceof Map?out.get(u.k):out[u.k]);return o&&langs.every(l=>clean(o[l]))});
// The items still to translate in batches: at most `maxItems` items and `maxChars` characters × languages per call
// (an item bigger than that goes alone).
function planBatches(items,langs,out,{maxItems=BATCH_ITEMS,maxChars=BATCH_CHARS}={}){const n=Math.max(1,(langs||[]).length),todo=(items||[]).filter(it=>!itemDone(it,out,langs||[])),batches=[];let cur=[],load=0;
 for(const it of todo){const c=itemChars(it)*n;if(cur.length&&(cur.length>=maxItems||load+c>maxChars)){batches.push(cur);cur=[];load=0}cur.push(it.key);load+=c}
 if(cur.length)batches.push(cur);return batches}
// What the confirmation states: items, languages, characters, calls; no prices invented here.
function planFacts(batches,items,langs){const byKey=new Map((items||[]).map(it=>[it.key,it])),keys=(batches||[]).flat(),nChars=keys.reduce((n,k)=>n+itemChars(byKey.get(k)),0);
 return {calls:(batches||[]).length,items:keys.length,chars:nChars,
  facts:[['Elementi',String(keys.length)],['Lingue',(langs||[]).map(l=>lang(l).code).join(' · ')],['Testo da tradurre','circa '+nChars.toLocaleString('it-IT')+' caratteri × '+(langs||[]).length+' lingu'+((langs||[]).length===1?'a':'e')],['Chiamate AI',(batches||[]).length+' al '+WHO+', una per lotto']],
  cost:(batches||[]).length===1?'È una sola chiamata AI: usa crediti API.':'Sono '+(batches||[]).length+' chiamate AI, una per lotto: usano crediti API.'}}
const newRun=batches=>({batches:(batches||[]).map((keys,i)=>({n:i+1,keys:keys.slice(),status:'todo',error:''})),paused:false,running:false,calls:0});
const runCounts=run=>{const b=run?run.batches:[],c=s=>b.filter(x=>x.status===s).length;return {total:b.length,done:c('done'),error:c('error'),todo:c('todo')}};
const FATAL=/credito|crediti|chiave api|sessione scaduta|accedi di nuovo|billing|quota|rate limit|overloaded|too many requests/i;
// Runs the batches still to do, one call each; a pause takes effect between batches; a failed batch is marked and the
// run goes on (a fatal error stops it). Resolves 'done', 'paused' or 'stopped'.
async function runBatches(run,call,onUpdate){if(run.running)return 'running';run.running=true;const up=()=>{try{onUpdate&&onUpdate(run)}catch(e){}};
 try{for(const b of run.batches){if(b.status!=='todo')continue;if(run.paused){up();return 'paused'}b.status='running';up();
   try{run.calls++;await call(b.keys,b);b.status='done';b.error=''}catch(e){b.status='error';b.error=(e&&e.message)||'Errore imprevisto';if(e&&(e.fatal||FATAL.test(b.error))){up();return 'stopped'}}up()}
  return run.paused&&run.batches.some(b=>b.status==='todo')?'paused':'done'}
 finally{run.running=false;up()}}
function retryFailed(run){let k=0;(run&&run.batches||[]).forEach(b=>{if(b.status==='error'){b.status='todo';b.error='';k++}});return k}

// ---- the paid steps: the confirmation first, then exactly the calls it states ----
const replyOf=(rt,prompt,project)=>{if(!rt||typeof rt.reply!=='function')throw Error('Gli agenti non si sono caricati: ricarica la pagina.');
 return rt.reply({role:AGENT,project:project&&project.name?{id:project.id,name:project.name}:undefined,messages:[{role:'user',content:prompt}]})};
// Three tones on the first 3 items: ONE confirmation, ONE call. {proposals, samples} or {cancelled:true}.
async function requestProposals({items,settings,rt,confirm,project,onStart}={}){const s=normalizeSettings(settings),samples=(items||[]).slice(0,SAMPLES),G=parseGlossary(s.glossary),{prompt,call}=proposalsPrompt(samples,s,G);
 if(!rt||typeof rt.reply!=='function')throw Error('Gli agenti non si sono caricati: ricarica la pagina.');
 const ok=await (confirm||askConfirm)({title:'Provo 3 toni sui primi '+samples.length+' elementi?',cost:'È una sola chiamata AI: usa crediti API.',
  facts:[['Elementi',samples.map(x=>x.name).join(', ')],['Lingue',s.langs.map(l=>lang(l).code).join(' · ')],['Toni','Fedele, Naturale, Marketing'],['Chiamate AI','1, al '+WHO]],
  message:'Codici, link, email e numeri di telefono non vengono inviati: tornano identici. Scelto il tono, prima di tradurre il resto ti dico quante chiamate servono.',ok:'Prova i 3 toni'});
 if(!ok)return {cancelled:true};if(onStart)onStart();
 const r=await replyOf(rt,prompt,project),proposals=parseProposals(r&&r.text,call,s.langs);if(!proposals.length)throw Error('la risposta non contiene traduzioni leggibili. Riprova.');
 return {proposals,samples}}
// Everything still to translate: ONE confirmation that states the calls, then one call per batch. {run, status} or
// {cancelled:true} (no call) or {nothing:true}.
async function requestBatches({items,settings,styleId,out,rt,confirm,project,onStart,onUpdate,plan}={}){const s=normalizeSettings(settings),G=parseGlossary(s.glossary),batches=plan||planBatches(items,s.langs,out);
 if(!batches.length)return {nothing:true};if(!rt||typeof rt.reply!=='function')throw Error('Gli agenti non si sono caricati: ricarica la pagina.');
 const f=planFacts(batches,items,s.langs);
 const ok=await (confirm||askConfirm)({title:'Traduco gli altri '+f.items+' elementi in '+f.calls+' lott'+(f.calls===1?'o':'i')+'?',cost:f.cost,facts:f.facts.concat([['Tono',(style(styleId)||STYLES[1]).label]]),
  message:'Tra un lotto e l’altro puoi mettere in pausa. Codici, link, email e numeri di telefono non vengono inviati.',ok:f.calls===1?'Traduci (1 chiamata)':'Traduci ('+f.calls+' chiamate)'});
 if(!ok)return {cancelled:true};if(onStart)onStart();
 const run=newRun(batches),status=await runBatches(run,keysCall({items,settings:s,styleId,glossary:G,out,rt,project}),onUpdate);return {run,status}}
// The call of one batch: the prompt of its items, one rt.reply, the translations stored in `out` (a Map).
function keysCall({items,settings,styleId,glossary,out,rt,project}){const byKey=new Map((items||[]).map(it=>[it.key,it]));
 return async keys=>{const list=keys.map(k=>byKey.get(k)).filter(Boolean),{prompt,call}=batchPrompt(list,styleId,settings,glossary);
  let r;try{r=await replyOf(rt,prompt,project)}catch(e){if(FATAL.test(e&&e.message||''))e.fatal=true;throw e}
  const got=parseTranslations(r&&r.text,call,settings.langs);for(const [k,o] of got){const cur=out.get(k)||{};const edited=cur._edited||{};for(const l of Object.keys(o))if(!edited[l])cur[l]=o[l];out.set(k,cur)}
  const missing=list.filter(it=>!itemDone(it,out,settings.langs));if(missing.length)throw Error(missing.length+' element'+(missing.length===1?'o':'i')+' senza traduzione completa nella risposta');}}

// ---- results and checks ----
// Every unit × language: {item, unit, lang, text, issues, level}.
function results(items,out,settings){const s=normalizeSettings(settings),G=parseGlossary(s.glossary),rows=[];
 for(const it of items||[])for(const u of it.units)for(const l of s.langs){const o=out&&(out instanceof Map?out.get(u.k):out[u.k]),t=o&&o[l]||'';
  const issues=t?checkText(u,t,l,G):[];rows.push({item:it,unit:u,lang:l,text:t,issues,level:t?levelOf(issues):'todo'})}
 return rows}
// The summary for the checks box and the report: per check, how many texts fail or warn.
function summary(items,out,settings){const rs=results(items,out,settings),done=rs.filter(r=>r.text),s=normalizeSettings(settings),G=parseGlossary(s.glossary);
 const checks=CHECKS.map(([id,label])=>{const hit=done.flatMap(r=>r.issues.filter(i=>i.kind===id||(id==='numbers'&&i.kind==='empty')).map(i=>({...i,item:r.item.name,field:r.unit.label,lang:r.lang})));
  const applies=id!=='glossary'||G.length>0,fail=hit.filter(i=>i.level==='fail').length,warn=hit.length-fail;
  return {id,label,applies,fail,warn,state:!applies?'off':fail?'fail':warn?'warn':'ok',issues:hit}});
 const items_=(items||[]).map(it=>{const r=rs.filter(x=>x.item===it),lv=r.some(x=>x.level==='todo')?'todo':r.some(x=>x.level==='fail')?'fail':r.some(x=>x.level==='warn')?'warn':'ok';return {key:it.key,level:lv,review:reviewReason(it,s)}});
 return {total:rs.length,done:done.length,checks,items:items_,review:items_.filter(x=>x.review).length,
  counts:{ok:items_.filter(x=>x.level==='ok').length,warn:items_.filter(x=>x.level==='warn').length,fail:items_.filter(x=>x.level==='fail').length,todo:items_.filter(x=>x.level==='todo').length}}}

// ---- export: the same format that came in ----
const csvEsc=v=>{const C=csvLib(),s=C&&C.safe?C.safe(v):(/^[=+\-@\t\r]/.test(str(v))?"'"+str(v):str(v));return /[;"\n\r,]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
const csvOf=(head,rows)=>'﻿'+[head.map(csvEsc).join(';'),...rows.map(r=>r.map(csvEsc).join(';'))].join('\r\n')+'\r\n';
const textOf=(out,k,l)=>{const o=out&&(out instanceof Map?out.get(k):out[k]);return o&&o[l]||''};
const colName=(h,l)=>h+' ('+lang(l).code+')';
// The sheet as it came, with «Colonna (EN)», «Colonna (DE)»… right after each translated column.
function sheetCsv(sheet,columns,out,langs){const hs=(sheet&&sheet.headers||[]).filter(Boolean),chosen=new Set(columns||[]),head=[];
 hs.forEach(h=>{head.push(h);if(chosen.has(h))langs.forEach(l=>head.push(colName(h,l)))});
 const rows=(sheet&&sheet.rows||[]).map((r,i)=>{const key='R'+(i+2),row=[];hs.forEach(h=>{row.push(str(r[h]));if(chosen.has(h))langs.forEach(l=>row.push(clean(r[h])?textOf(out,key+'|c:'+h,l):''))});return row});
 return csvOf(head,rows)}
// Product sheets: one row per product, each field followed by its languages.
const PRODUCT_FIELDS=[['title','Titolo'],['description','Descrizione'],['bullets','Punti chiave'],['meta','Meta description'],['alt','Alt immagine']];
function productValue(it,f,out,l){if(f==='bullets')return it.units.filter(u=>/^bullet\d+$/.test(u.field)).map(u=>l?textOf(out,u.k,l):u.text).filter(Boolean).join('\n');
 const u=it.units.find(x=>x.field===f);return u?(l?textOf(out,u.k,l):u.text):''}
function productCsv(items,out,langs){const head=['Chiave','Codice'];PRODUCT_FIELDS.forEach(([,label])=>{head.push(label);langs.forEach(l=>head.push(colName(label,l)))});
 return csvOf(head,(items||[]).map(it=>{const r=[it.productKey||it.key,it.id||''];PRODUCT_FIELDS.forEach(([f])=>{r.push(productValue(it,f,null,''));langs.forEach(l=>r.push(productValue(it,f,out,l)))});return r}))}
// The translated copies of the product sheets, one per language (same fields as the Studio Schede prodotto).
function productCopies(items,out,langs){return langs.map(l=>({lang:l,items:(items||[]).map(it=>({key:it.productKey||it.key,id:it.id||'',title:productValue(it,'title',out,l),description:productValue(it,'description',out,l),
 bullets:productValue(it,'bullets',out,l).split('\n').filter(Boolean),meta:productValue(it,'meta',out,l),alt:productValue(it,'alt',out,l)}))}))}
function productCopyCsv(copy){return csvOf(['Chiave','Codice','Titolo','Descrizione','Punti chiave','Meta description','Alt immagine'],copy.items.map(x=>[x.key,x.id,x.title,x.description,x.bullets.join('\n'),x.meta,x.alt]))}
// Text, posts and newsletters: Markdown per language, the structure of the original (headings, lists, «Meta description:»).
function textMd(items,out,l,{title}={}){const L=['# '+(title||'Traduzione')+' · '+lang(l).label,''];let group='';
 for(const it of items||[]){if(it.group&&it.group!==group){group=it.group;if(!it.units.some(u=>u.field==='h'))L.push('## '+it.group,'')}
  else if(!it.group&&!it.units.some(u=>u.field==='h')&&it.units.length>1)L.push('## '+it.name,'');
  for(const u of it.units){const t=textOf(out,u.k,l)||'['+'da tradurre'+'] '+u.text;
   if(u.prefix)L.push(u.prefix+t.replace(/\n/g,' '));else if(it.source==='post'||it.source==='newsletter')L.push('**'+u.label+'**',t);else L.push(t);L.push('')}}
 return L.join('\n').replace(/\n{3,}/g,'\n\n').trim()+'\n'}
// The glossary file: every term with its rule and its words per language.
function glossaryCsv(glossary,langs){return csvOf(['Termine','Regola',...langs.map(l=>lang(l).code)],(glossary||[]).map(g=>[g.term,g.forced?'traduzione obbligatoria':'non tradurre',...langs.map(l=>g.forced?forcedFor(g,l):g.term)]))}
function reportCsv(items,out,settings){const rs=results(items,out,settings),rows=[];
 for(const r of rs){if(!r.text){rows.push([r.item.name,r.unit.label,lang(r.lang).code,'traduzione','da fare','Non ancora tradotto.']);continue}
  for(const i of r.issues)rows.push([r.item.name,r.unit.label,lang(r.lang).code,(CHECKS.find(c=>c[0]===i.kind)||['', 'Traduzione'])[1],i.level==='fail'?'da sistemare':'avviso',i.msg])}
 const s=normalizeSettings(settings);(items||[]).forEach(it=>{const why=reviewReason(it,s);if(why)rows.push([it.name,'',s.langs.map(l=>lang(l).code).join(' '),'Revisione madrelingua','avviso',why])});
 return csvOf(['Elemento','Campo','Lingua','Controllo','Livello','Messaggio'],rows)}
const FILES={glossary:'glossario.csv',report:'controlli.csv',readme:'LEGGIMI.txt'};
// Every file of the delivery, by the kind of source.
function exportFiles(m){const s=normalizeSettings(m.settings),G=parseGlossary(s.glossary),base=slug(m.name)||'traduzione',files=[];
 if(m.kind==='sheet'){files.push({name:base+'-tradotto.csv',label:'Foglio con una colonna per lingua',data:sheetCsv(m.sheet,m.columns,m.out,s.langs)})}
 else if(m.kind==='sheets'){files.push({name:base+'-lingue.csv',label:'Schede con una colonna per lingua',data:productCsv(m.items,m.out,s.langs)});
  productCopies(m.items,m.out,s.langs).forEach(c=>files.push({name:'schede-prodotto-'+c.lang+'.csv',label:'Copia tradotta · '+lang(c.lang).label,data:productCopyCsv(c)}))}
 else s.langs.forEach(l=>files.push({name:base+'-'+l+'.md',label:'Testo tradotto · '+lang(l).label,data:textMd(m.items,m.out,l,{title:m.name})}));
 files.push({name:FILES.glossary,label:'Glossario',data:glossaryCsv(G,s.langs)},{name:FILES.report,label:'Controlli',data:reportCsv(m.items,m.out,s)},{name:FILES.readme,label:'Leggimi',data:readme(m)});
 return files}
function readme(m){const s=normalizeSettings(m.settings),sum=summary(m.items,m.out,s),L=['Traduzione e localizzazione · RADIX','',
 'Materiale: '+material(s.material).label+' · '+clean(m.name),'Lingue: '+s.langs.map(l=>lang(l).label).join(', '),'Tono: '+((style(m.style)||{}).label||'—'),'',
 'Controlli automatici ('+sum.done+' testi tradotti su '+sum.total+'):'];
 sum.checks.forEach(c=>L.push('['+(c.state==='off'?'—':c.state==='ok'?'ok':c.state==='warn'?'avviso':'da sistemare')+'] '+c.label+(c.fail||c.warn?' · '+c.fail+' da sistemare, '+c.warn+' avvisi':'')));
 if(sum.review)L.push('','Revisione di un madrelingua consigliata per '+sum.review+' element'+(sum.review===1?'o':'i')+' (testi tecnici o legali): vedi controlli.csv.');
 L.push('','File:',m.kind==='sheet'?'- il foglio di partenza con una colonna per lingua accanto a ogni colonna tradotta (CSV con il punto e virgola, apribile in Excel)':m.kind==='sheets'?'- le schede con una colonna per lingua e una copia tradotta per lingua (stesse colonne dello Studio Schede prodotto)':'- un file Markdown per lingua, con la struttura dell’originale',
  '- glossario.csv: i termini da non tradurre e le traduzioni obbligatorie','- controlli.csv: ogni controllo non superato, testo per testo','',
  'Codici, SKU, link, email e numeri di telefono non sono stati inviati all’AI: sono tornati identici. RADIX non pubblica nulla.');
 return L.join('\n')+'\n'}
function exportZip(m){const Z=zipLib();if(!Z)throw Error('Archivio zip non disponibile: ricarica la pagina.');return Z.zip(exportFiles(m).map(f=>({name:f.name,data:f.data})))}
const zipName=m=>'traduzione-'+(slug(m&&m.name)||'testi')+'-'+normalizeSettings(m&&m.settings).langs.join('-')+'.zip';

// ---- saved in the project: the «agents» document, key translations ----
const emptyStore=()=>({schemaVersion:1,items:[]});
function readStore(d){const s=d&&d.translations;return s&&typeof s==='object'&&Array.isArray(s.items)?{schemaVersion:1,items:s.items.filter(x=>x&&typeof x==='object')}:emptyStore()}
// The answers, the source texts, the translations and (for a sheet) the sheet itself; over SAVE_BUDGET bytes it is
// refused: the zip holds everything.
function savedRecord(m,{by,at,id}={}){const when=at||new Date().toISOString(),s=normalizeSettings(m.settings),out={};
 for(const it of m.items||[])for(const u of it.units){const o=m.out instanceof Map?m.out.get(u.k):(m.out||{})[u.k];if(o){out[u.k]={};s.langs.forEach(l=>{if(o[l])out[u.k][l]=o[l]})}}
 const rec={id:id||'tr-'+when.replace(/\D/g,'').slice(0,14)+'-'+(slug(m.name)||'testi').slice(0,24),at:when,by:clean(by).slice(0,80),kind:m.kind||'text',name:clean(m.name).slice(0,120),settings:s,style:style(m.style)?m.style:'',
  items:(m.items||[]).map(it=>({key:it.key,name:it.name,id:it.id||'',productKey:it.productKey||'',group:it.group||'',source:it.source||'',row:it.row||0,units:it.units.map(u=>({k:u.k,field:u.field,label:u.label,text:u.text,max:u.max||null,prefix:u.prefix||''}))})),
  out,review:(m.items||[]).filter(it=>reviewReason(it,s)).map(it=>it.key),checks:summary(m.items,m.out,s).checks.map(c=>({id:c.id,state:c.state,fail:c.fail,warn:c.warn}))};
 if(m.kind==='sheet'){const hs=(m.sheet&&m.sheet.headers||[]).slice(0,80);rec.columns=(m.columns||[]).filter(c=>hs.includes(c));rec.headers=hs;rec.rows=(m.sheet&&m.sheet.rows||[]).slice(0,MAX_ITEMS).map(r=>hs.map(h=>str(r[h]).slice(0,4000)))}
 const size=new TextEncoder().encode(JSON.stringify(rec)).length;if(size>SAVE_BUDGET){const e=Error('Troppi testi per salvarli nel progetto ('+Math.round(size/1024)+' KB, massimo '+Math.round(SAVE_BUDGET/1024)+' KB): scarica lo zip, che li contiene tutti.');e.tooBig=true;throw e}
 return rec}
function fromRecord(rec){const r=rec||{},hs=r.headers||[],out=new Map(Object.entries(r.out||{}).map(([k,v])=>[k,{...v}]));
 const items=(r.items||[]).map(it=>({key:it.key,name:it.name,id:it.id||'',productKey:it.productKey||'',group:it.group||'',source:it.source||'',row:it.row||0,units:(it.units||[]).map(u=>({...u,item:it.key}))}));
 return {kind:r.kind||'text',name:r.name||'',settings:normalizeSettings(r.settings),style:r.style||'',items,out,columns:r.columns||[],sheet:r.kind==='sheet'?{headers:hs,rows:(r.rows||[]).map(a=>Object.fromEntries(hs.map((h,i)=>[h,a[i]==null?'':a[i]])))}:null}}
function addRecord(store,rec){const s=readStore({translations:store});return {schemaVersion:1,items:s.items.filter(x=>x.id!==rec.id).concat([rec]).slice(-MAX_SAVED)}}
async function saveToProject(ws,projectId,rec){if(!ws||typeof ws.bind!=='function')throw Error('Archivio del progetto non disponibile.');
 const d=ws.bind(projectId,'agents');
 for(let i=0;i<3;i++){const cur=(await d.load())||{},next=addRecord(readStore(cur),rec);
  try{await d.save({...cur,schemaVersion:1,conversations:cur.conversations||{},translations:next});return next}catch(e){if(!(ws.ConflictError&&e instanceof ws.ConflictError)||i===2)throw e}}}

// ---- the examples ----
const SAMPLE_TEXT=['# Il nostro pane','Ogni notte impastiamo la Pagnotta di semola con lievito madre: 24 ore di lievitazione e cottura nel forno a legna.','Titolo SEO: Forno Aurora · pane a lievito madre a Torino','Meta description: Pane, focacce e dolci a lievito madre dal 1960. Ordina online su www.fornoaurora.it o chiamaci allo 011 123 4567.',
 '## Prezzi e ordini','La Pagnotta di semola (codice AUR-001) costa 4,50 € al chilo; il Panettone classico 28,00 €.','- Ordini entro le 18:00 per il giorno dopo','- Consegna gratuita sopra i 30 €','',
 '## Natale','Il Panettone si prenota fino al 12/12/2026: scrivi a ordini@fornoaurora.it.','## Allergeni','Ingredienti: farina di frumento, burro, uova, zucchero. Può contenere tracce di frutta a guscio.'].join('\n');
const SAMPLE_GLOSSARY='Forno Aurora\nPanettone\nlievito madre = EN: sourdough; DE: Sauerteig; FR: levain; ES: masa madre';
function sampleSheet(){const P=productLib();if(P&&P.sampleSheet){const s=P.sampleSheet();return {name:s.name,headers:s.headers,rows:s.rows}}
 const headers=['Codice','Nome prodotto','Descrizione','Prezzo'],rows=[['AUR-001','Pagnotta di semola','Crosta croccante e mollica gialla, 1 kg.','4,50'],['AUR-002','Filone integrale','Farina integrale e lievito madre, 750 g.','3,80'],['AUR-003','Grissini stirati a mano','Friabili, 250 g.','3,20']];
 return {name:'esempio-forno-aurora.csv',headers,rows:rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]])))}}
async function readSheet(file){const C=csvLib();if(!C)throw Error('Lettore dei fogli non disponibile: ricarica la pagina.');
 if(/\.xlsx$/i.test(file.name)){if(file.size>3e6)throw Error('File troppo grande: massimo 3 MB per Excel.');const X=root.RadixLeadXlsx;if(!X||!X.readRows)throw Error('Lettore Excel non disponibile: ricarica la pagina.');
  return C.fromRows(await X.readRows(await file.arrayBuffer(),{maxRows:C.MAX_ROWS+1}))}
 return C.readFile(file)}

// ---- the widget (browser) ----
let counter=0;
const dom=()=>root.document;
const el=(tag,text,cls)=>{const x=dom().createElement(tag);if(text!=null)x.textContent=text;if(cls)x.className=cls;return x};
const button=(text,cls)=>{const b=el('button',text,cls||'');b.type='button';return b};
const pill=(text,state)=>{const p=el('span',text,'pf-pill');if(state)p.dataset.state=state;return p};
const LEVEL_PILL={ok:['Pronto','ok'],warn:['Con avvisi','warn'],fail:['Da sistemare','fail'],todo:['Da tradurre','']};
const MIME={csv:'text/csv;charset=utf-8',md:'text/markdown;charset=utf-8',txt:'text/plain;charset=utf-8',zip:'application/zip'};
function download(name,data){const a=el('a');a.href=root.URL.createObjectURL(new root.Blob([data],{type:MIME[name.split('.').pop()]||'application/octet-stream'}));a.download=name;dom().body.append(a);a.click();a.remove();setTimeout(()=>root.URL.revokeObjectURL(a.href),2000)}
function autosize(t){const go=()=>{if(!t.isConnected)return;t.style.height='auto';t.style.height=(t.scrollHeight+2)+'px'};t.addEventListener('input',go);(root.requestAnimationFrame||setTimeout)(go);return go}
// ctx: {project (profileFor summary), projectName, projectId, workspace, by}
function translationStudio(ctx={}){const n=++counter,project=ctx.project||{};
 const st={settings:normalizeSettings({langs:['en'],material:'sito'}),source:'text',text:'',sheet:null,fileName:'',columns:[],records:[],recordId:'',saved:[],savedPick:new Set(),
  items:[],kind:'text',name:'',samples:[],proposals:[],style:'',out:new Map(),run:null,view:'',filter:'all',shown:15,open:new Set(),busy:false,saveId:''};
 const wrap=el('div',undefined,'tool photo-studio pf-studio translation-studio');
 const steps=el('ol',undefined,'ps-steps');['Le domande','Scegli il tono','Traduzioni e controlli','Export'].forEach((t,i)=>{const li=el('li',(i+1)+' · '+t);li.dataset.step=String(i+1);steps.append(li)});
 const setStep=k=>[...steps.children].forEach(li=>li.dataset.state=+li.dataset.step<k?'done':+li.dataset.step===k?'current':'todo');
 const note=el('p','Codici, SKU, link, email e numeri di telefono non vengono mai inviati all’AI: tornano identici. Le colonne con dati personali non si possono scegliere e nulla arriva dal CRM.','pf-note');
 const savedBox=el('div',undefined,'ad-saved pf-saved');savedBox.hidden=true;
 const form=el('div',undefined,'ps-form pf-form tr-form');
 // languages and material
 const qCard=el('section',undefined,'pf-card tr-questions'),qHead=el('div',undefined,'pf-card-head');qHead.append(el('h4','Lingue e materiale'),el('p','Traduco dall’italiano in una o più lingue, adattando numeri, valuta e date al mercato.','muted'));
 const langFs=el('fieldset',undefined,'tr-langs');langFs.append(el('legend','Lingue *'));
 LANGS.forEach(l=>{const lab=el('label',undefined,'ps-chip tr-lang'),c=el('input');c.type='checkbox';c.name='tr-lang-'+n;c.value=l.id;c.checked=st.settings.langs.includes(l.id);
  c.onchange=()=>{const on=[...langFs.querySelectorAll('input')].filter(x=>x.checked).map(x=>x.value);if(!on.length){c.checked=true;return}st.settings=normalizeSettings({...st.settings,langs:on});goInfo()};
  const t=el('span',undefined,'tr-lang-text');t.append(el('b',l.code),el('span',l.label));lab.append(c,t);langFs.append(lab)});
 const matFs=el('fieldset',undefined,'tr-materials');matFs.append(el('legend','Materiale *'));
 MATERIALS.forEach(m=>{const lab=el('label',undefined,'ps-chip ad-tile pf-tile'),r=el('input');r.type='radio';r.name='tr-mat-'+n;r.value=m.id;r.checked=st.settings.material===m.id;
  r.onchange=()=>{st.settings=normalizeSettings({...st.settings,material:m.id});st.source=m.sources[0];renderSource()};const t=el('span',undefined,'ad-tile-text');t.append(el('strong',m.label),el('small',m.sub));lab.append(r,t);matFs.append(lab)});
 qCard.append(qHead,langFs,matFs);
 // the source
 const srcCard=el('section',undefined,'pf-card tr-source');
 const inp=el('input');inp.type='file';inp.accept='.xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
 const ta=el('textarea');ta.rows=9;ta.maxLength=TEXT_MAX;ta.placeholder='Incolla qui il testo. «# Titolo» per le sezioni, «Titolo SEO:» e «Meta description:» per i testi di Google.';ta.setAttribute('aria-label','Il testo da tradurre');ta.oninput=()=>{st.text=ta.value;goInfo()};
 // glossary and notes
 const gCard=el('section',undefined,'pf-card tr-gloss'),gHead=el('div',undefined,'pf-card-head');gHead.append(el('h4','Glossario e tono'),el('p','Un termine per riga. Da solo: non si traduce. Con «=»: la traduzione obbligatoria, per lingua.','muted'));
 const gGrid=el('div',undefined,'tr-gloss-grid'),gl=el('label',undefined,'pf-field'),gTa=el('textarea');gTa.rows=4;gTa.maxLength=4000;gTa.placeholder='Forno Aurora\nlievito madre = EN: sourdough; DE: Sauerteig';gl.append(el('span','Glossario (facoltativo)'),gTa);
 const nl=el('label',undefined,'pf-field'),nTa=el('textarea');nTa.rows=4;nTa.maxLength=1000;nTa.placeholder='Es. DE: dare del Sie; FR: dare del vous; niente slang';nl.append(el('span','Note su tono e mercato (facoltative)'),nTa);
 gGrid.append(gl,nl);const gInfo=el('p','','tr-gloss-info muted');
 const techL=el('label',undefined,'ps-switch tr-tech'),tech=el('input');tech.type='checkbox';tech.onchange=()=>{st.settings.technical=tech.checked};techL.append(tech,el('span','Testi tecnici o legali: segna tutto per la revisione di un madrelingua'));
 gTa.oninput=()=>{st.settings.glossary=gTa.value;const G=parseGlossary(gTa.value);const a=G.filter(g=>!g.forced).length,b=G.length-a;gInfo.textContent=G.length?a+(a===1?' termine':' termini')+' da non tradurre · '+b+(b===1?' traduzione obbligatoria':' traduzioni obbligatorie'):''};
 nTa.oninput=()=>{st.settings.notes=nTa.value};
 gCard.append(gHead,gGrid,gInfo,techL);
 const go=button('Prova 3 toni sui primi 3','primary'),cost=el('span','Una chiamata AI al '+WHO+': ti chiedo conferma prima.','muted'),bar=el('div',undefined,'ps-actions pf-go');bar.append(go,cost);
 const goLine=el('p','','tr-go-info muted');
 form.append(qCard,srcCard,gCard,goLine,bar);
 const status=el('p','','tool-status');status.setAttribute('role','status');
 const propBox=el('section',undefined,'pf-step tr-props'),resBox=el('section',undefined,'pf-step tr-results'),expBox=el('section',undefined,'pf-step tr-export');[propBox,resBox,expBox].forEach(x=>x.hidden=true);
 wrap.append(steps,note,savedBox,form,status,propBox,resBox,expBox);setStep(1);
 // ---- source panel ----
 function renderSource(){const m=material(st.settings.material);if(!m.sources.includes(st.source))st.source=m.sources[0];
  const head=el('div',undefined,'pf-card-head');head.append(el('h4','Cosa traduco'),el('p',m.label+': '+m.sub.toLowerCase()+'.','muted'));
  const parts=[head];
  if(m.sources.length>1){const seg=el('div',undefined,'ad-seg pf-seg tr-src-seg');seg.setAttribute('role','group');seg.setAttribute('aria-label','Da dove');
   m.sources.forEach(s=>{const b=button(SOURCES[s]);b.setAttribute('aria-pressed',String(st.source===s));b.onclick=()=>{st.source=s;renderSource()};seg.append(b)});parts.push(seg)}
  if(st.source==='text'){ta.value=st.text;const ex=button('Usa l’esempio: la pagina di un forno','pf-sample-btn tr-sample');ex.onclick=()=>{st.text=ta.value=SAMPLE_TEXT;if(!gTa.value){gTa.value=SAMPLE_GLOSSARY;gTa.oninput()}goInfo();autosize(ta)()};
   const row=el('div',undefined,'tr-text-row');row.append(ta,ex);parts.push(row);autosize(ta)}
  if(st.source==='sheet'){const drop=el('label',undefined,'pf-drop'),dt=el('span',undefined,'pf-drop-text');dt.append(el('strong',st.fileName||'Scegli il foglio'),el('small','.xlsx o .csv · una riga per prodotto o per pagina'));drop.append(inp,dt);
   const ex=button('Usa l’esempio: 30 prodotti di un forno','pf-sample-btn');ex.onclick=()=>{const s=sampleSheet();loadSheet(s,s.name);if(!gTa.value){gTa.value=SAMPLE_GLOSSARY;gTa.oninput()}};
   const row=el('div',undefined,'pf-src-row');row.append(drop,ex);parts.push(row);if(st.sheet)parts.push(columnsBox())}
  if(st.source==='sheets'){if(!st.records.length)parts.push(el('p',ctx.workspace&&ctx.projectId?'Nessuna scheda prodotto salvata nel progetto: creale con «Schede prodotto e feed» oppure usa un foglio.':'Apri un progetto per vedere le schede salvate.','muted tr-empty'));
   else{const list=el('div',undefined,'tr-picklist');st.records.slice().reverse().forEach(r=>{const lab=el('label',undefined,'tr-pick'),c=el('input');c.type='radio';c.name='tr-rec-'+n;c.checked=st.recordId===r.id;c.onchange=()=>{st.recordId=r.id;goInfo()};
     const t=el('span',undefined,'tr-pick-text');t.append(el('strong',clean(r.fileName)||'Schede prodotto'),el('small',(r.items||[]).length+' schede · '+str(r.at).slice(0,10)));lab.append(c,t);list.append(lab)});parts.push(list)}}
  if(st.source==='saved'){if(!st.saved.length)parts.push(el('p',ctx.workspace&&ctx.projectId?'Nessun post, newsletter o testo salvato nel progetto: incolla il testo.':'Apri un progetto per vedere i testi salvati.','muted tr-empty'));
   else{const list=el('div',undefined,'tr-picklist');st.saved.forEach(s=>{const lab=el('label',undefined,'tr-pick'),c=el('input');c.type='checkbox';c.checked=st.savedPick.has(s.id);c.onchange=()=>{c.checked?st.savedPick.add(s.id):st.savedPick.delete(s.id);goInfo()};
     const t=el('span',undefined,'tr-pick-text');t.append(el('strong',s.title),el('small',{post:'Post',newsletter:'Newsletter',doc:'Testo'}[s.kind]+' · '+s.meta));lab.append(c,t);list.append(lab)});parts.push(list)}}
  srcCard.replaceChildren(...parts);goInfo()}
 function columnsBox(){const box=el('div',undefined,'tr-cols'),cols=sheetColumns(st.sheet);box.append(el('p',st.fileName+': '+st.sheet.rows.length+' righe. Scegli le colonne da tradurre:','pf-sheet-info'));
  const g=el('div',undefined,'tr-cols-grid');cols.forEach(c=>{const lab=el('label',undefined,'ps-chip tr-col'),x=el('input');x.type='checkbox';x.checked=st.columns.includes(c.name);x.disabled=c.personal;
   x.onchange=()=>{st.columns=x.checked?st.columns.concat(c.name):st.columns.filter(y=>y!==c.name);goInfo()};lab.append(x,el('span',c.name));if(c.max)lab.append(el('small','max '+c.max,'tr-col-max'));
   if(c.personal){lab.dataset.personal='true';lab.title='Dati personali: non si traducono e non vengono inviati';lab.append(el('small','dati personali','tr-col-max'))}g.append(lab)});
  box.append(g);const pers=cols.filter(c=>c.personal).length;if(pers)box.append(el('p',pers+' colonn'+(pers===1?'a':'e')+' con dati personali esclus'+(pers===1?'a':'e')+': restano nel file ma non vanno all’AI.','muted'));return box}
 function loadSheet(sheet,name){if(!sheet||!sheet.rows||!sheet.rows.length)throw Error('il foglio non ha righe');st.sheet=sheet;st.fileName=name;st.columns=sheetColumns(sheet).filter(c=>c.auto).map(c=>c.name);renderSource()}
 inp.onchange=async()=>{const f=inp.files&&inp.files[0];if(!f)return;status.textContent='Leggo '+f.name+'…';try{loadSheet(await readSheet(f),f.name);status.textContent=''}catch(e){status.textContent='Foglio non letto: '+e.message}};
 // the items of the current answers
 function build(){const s=st.source;
  if(s==='text'){st.text=ta.value;return {kind:'text',name:(/^#+\s+(.+)$/m.exec(st.text)||[])[1]||'testo',items:fromText(st.text)}}
  if(s==='sheet')return st.sheet?{kind:'sheet',name:st.fileName.replace(/\.[^.]+$/,''),items:fromSheet(st.sheet,st.columns,{name:st.fileName})}:{kind:'sheet',name:'',items:[]};
  if(s==='sheets'){const r=st.records.find(x=>x.id===st.recordId);return {kind:'sheets',name:r?clean(r.fileName).replace(/\.[^.]+$/,'')||'schede':'',items:r?fromProductSheet(r):[]}}
  const pickd=st.saved.filter(x=>st.savedPick.has(x.id));return {kind:'saved',name:pickd.length===1?pickd[0].title:'testi-salvati',items:fromSaved(pickd)}}
 function goInfo(){const b=build(),nc=b.items.reduce((k,it)=>k+itemChars(it),0);
  goLine.textContent=b.items.length?b.items.length+' element'+(b.items.length===1?'o':'i')+' · circa '+nc.toLocaleString('it-IT')+' caratteri · '+st.settings.langs.map(l=>lang(l).code).join(' · ')+(b.items.length>SAMPLES?(k=>' · dopo la prova, circa '+k+' chiamat'+(k===1?'a':'e')+' per il resto')(planBatches(b.items.slice(SAMPLES),st.settings.langs,null).length):''):'';}
 async function loadProject(){if(!ctx.workspace||!ctx.projectId){renderSource();return}
  try{const a=(await ctx.workspace.bind(ctx.projectId,'agents').load())||{};let e={};try{e=(await ctx.workspace.bind(ctx.projectId,'editorial').load())||{}}catch(err){}
   const P=a.productSheets&&Array.isArray(a.productSheets.items)?a.productSheets.items:[];st.records=P.filter(x=>x&&Array.isArray(x.items));if(st.records.length)st.recordId=st.records[st.records.length-1].id;
   st.saved=savedTexts(a,e);renderSaved(readStore(a).items)}catch(err){}
  renderSource()}
 function renderSaved(list){if(!list||!list.length){savedBox.hidden=true;return}savedBox.replaceChildren(el('h4','Traduzioni salvate nel progetto'));const row=el('div',undefined,'ad-saved-row');
  list.slice(-4).reverse().forEach(r=>{const b=button(clean(r.name)||'Traduzione','ad-saved-item');b.append(el('small',' · '+(r.settings&&r.settings.langs||[]).map(x=>x.toUpperCase()).join(' ')+' · '+str(r.at).slice(0,10)));
   b.onclick=()=>{const m=fromRecord(r);Object.assign(st,{items:m.items,kind:m.kind,name:m.name,style:m.style,out:m.out,sheet:m.sheet||st.sheet,columns:m.columns,proposals:[],run:null,saveId:r.id});st.settings=m.settings;
    propBox.hidden=true;renderResults();renderExport();status.textContent='Riaperta la traduzione salvata: nessuna nuova chiamata AI.'};row.append(b)});savedBox.append(row);savedBox.hidden=false}
 renderSource();loadProject();
 const lock=on=>{st.busy=on;go.disabled=on;form.querySelectorAll('input,textarea,button').forEach(x=>{if(x!==go)x.disabled=on||(x.type==='checkbox'&&x.closest('[data-personal]')!=null)})};
 // ---- step 2: three tones on the first 3 ----
 go.onclick=async()=>{if(st.busy)return;const b=build();if(!b.items.length){status.textContent=st.source==='sheet'&&st.sheet?'Scegli almeno una colonna da tradurre.':'Scegli o incolla il materiale da tradurre.';return}
  st.settings=normalizeSettings({...st.settings,glossary:gTa.value,notes:nTa.value,technical:tech.checked});
  lock(true);
  try{const r=await requestProposals({items:b.items,settings:st.settings,rt:root.RadixAgents,project,onStart:()=>{setStep(2);propBox.hidden=false;propBox.replaceChildren(el('h3','Scegli il tono'),skeleton());status.textContent='Il '+WHO+' prova i 3 toni…'}});
   if(r.cancelled){status.textContent='Nessuna chiamata fatta.';return}
   Object.assign(st,{items:b.items,kind:b.kind,name:b.name,samples:r.samples,proposals:r.proposals,style:'',out:new Map(),run:null,saveId:''});resBox.hidden=expBox.hidden=true;renderProps();go.textContent='Prova di nuovo i 3 toni';
   status.textContent=(r.proposals.length<STYLES.length?'Sono arrivati '+r.proposals.length+' toni su '+STYLES.length+'. ':'')+'Confronta i toni sugli stessi testi e scegli quello per tutto il materiale.'}
  catch(e){status.textContent='Toni non preparati: '+e.message;if(!st.proposals.length){propBox.hidden=true;setStep(1)}else renderProps()}
  finally{lock(false)}};
 const skeleton=()=>{const g=el('div',undefined,'pf-styles');for(let i=0;i<3;i++)g.append(el('div',undefined,'pf-style pf-skeleton'));return g};
 function renderProps(){const head=el('div',undefined,'pf-step-head'),t=el('div');t.append(el('h3','Scegli il tono'),el('p','Gli stessi '+st.samples.length+' elementi tradotti in '+st.proposals.length+' toni. I controlli automatici sono già fatti.','muted'));head.append(t);
  const g=el('div',undefined,'pf-styles tr-tones');
  st.proposals.forEach(p=>{const c=el('article',undefined,'pf-style tr-tone');c.dataset.chosen=String(st.style===p.style);const h=el('header',undefined,'pf-style-head');h.append(el('h4',p.label),el('p',p.sub,'muted'));c.append(h);
   let fails=0,warns=0;
   for(const it of st.samples){const box=el('div',undefined,'pf-sample tr-sample-item');box.append(el('span',it.name,'pf-sample-name'));
    for(const l of st.settings.langs){const line=el('div',undefined,'tr-line'),txt=it.units.map(u=>textOf(p.out,u.k,l)).filter(Boolean).join(' · ');
     const iss=it.units.flatMap(u=>{const t=textOf(p.out,u.k,l);return t?checkText(u,t,l,parseGlossary(st.settings.glossary)):[{level:'fail',kind:'empty',msg:'manca'}]});fails+=iss.filter(i=>i.level==='fail').length;warns+=iss.filter(i=>i.level==='warn').length;
     line.append(el('b',lang(l).code,'tr-code'),el('span',txt||'Non arrivato.','tr-text'));line.dataset.level=levelOf(iss);box.append(line)}
    c.append(box)}
   const use=button(st.style===p.style?'Tono scelto':'Usa il tono '+p.label,'primary');use.onclick=()=>chooseStyle(p.style);
   const foot=el('footer',undefined,'pf-style-foot');foot.append(pill(fails?fails+' da sistemare':warns?warns+(warns===1?' avviso':' avvisi'):'Controlli superati',fails?'fail':warns?'warn':'ok'),use);c.append(foot);g.append(c)});
  propBox.replaceChildren(head,g)}
 function chooseStyle(id){st.style=id;const p=st.proposals.find(x=>x.style===id);
  for(const [k,o] of p.out){const cur=st.out.get(k)||{},ed=cur._edited||{};const next={...cur};for(const l of Object.keys(o))if(!ed[l])next[l]=o[l];st.out.set(k,next)}
  renderProps();renderResults();renderExport();status.textContent='Tono «'+style(id).label+'» scelto: '+st.samples.length+' elementi già tradotti.';resBox.scrollIntoView&&resBox.scrollIntoView({behavior:'smooth',block:'start'})}
 // ---- step 3: everything, in batches, with the checks ----
 async function startRun(ask){const rt=root.RadixAgents;
  if(ask){const r=await requestBatches({items:st.items,settings:st.settings,styleId:st.style,out:st.out,rt,project,onStart:()=>{status.textContent='Il '+WHO+' traduce a lotti…'},onUpdate:run=>{st.run=run;renderResults()}});
   if(r.cancelled){status.textContent='Nessuna chiamata fatta.';return}if(r.nothing){status.textContent='È già tutto tradotto.';return}st.run=r.run;after(r.status);return}
  const s=await runBatches(st.run,keysCall({items:st.items,settings:st.settings,styleId:st.style,glossary:parseGlossary(st.settings.glossary),out:st.out,rt,project}),run=>{st.run=run;renderResults()});after(s)}
 function after(s){const rc=runCounts(st.run);renderResults();renderExport();
  status.textContent=s==='paused'?'In pausa: '+rc.done+' lotti su '+rc.total+' fatti.':s==='stopped'?'Traduzione fermata: '+((st.run.batches.find(b=>b.status==='error')||{}).error||'errore'):rc.error?rc.error+' lott'+(rc.error===1?'o non riuscito':'i non riusciti')+': puoi riprovarl'+(rc.error===1?'o':'i')+'.':'Traduzione completa: controlla gli avvisi e scarica.'}
 function renderResults(){if(!st.style&&!st.saveId)return;setStep(expBox.hidden?3:4);resBox.hidden=false;const sum=summary(st.items,st.out,st.settings),run=st.run,rc=runCounts(run),todo=planBatches(st.items,st.settings.langs,st.out);
  const head=el('div',undefined,'pf-step-head'),t=el('div');t.append(el('h3','Traduzioni e controlli'+(style(st.style)?' · tono '+style(st.style).label:'')),el('p',st.items.length+' elementi in '+st.settings.langs.map(l=>lang(l).label.toLowerCase()).join(', ')+'. Ogni testo è controllato appena arriva e dopo ogni modifica.','muted'));head.append(t);
  const pills=el('div',undefined,'pf-sum');pills.append(pill(st.items.length+' elementi'),pill(sum.counts.ok+' pronti','ok'),pill(sum.counts.warn+' con avvisi',sum.counts.warn?'warn':''),pill(sum.counts.fail+' da sistemare',sum.counts.fail?'fail':''),pill(sum.counts.todo+' da tradurre'),...(sum.review?[pill(sum.review+' per il madrelingua','warn')]:[]));
  const checks=el('div',undefined,'tr-checks');checks.append(el('h4','Controlli automatici'));
  sum.checks.forEach(c=>{const row=el('div',undefined,'tr-check');row.dataset.state=c.state;row.append(el('span',c.state==='off'?'Nessun glossario':c.state==='ok'?'OK':c.state==='warn'?c.warn+' avvis'+(c.warn===1?'o':'i'):c.fail+' da sistemare','tr-check-badge'),el('strong',c.label));
   if(c.issues.length){const ul=el('ul');c.issues.slice(0,4).forEach(i=>ul.append(el('li',i.item+' · '+i.field+' · '+lang(i.lang).code+': '+i.msg)));if(c.issues.length>4)ul.append(el('li','E altri '+(c.issues.length-4)+': li trovi nell’elenco e in controlli.csv.'));row.append(ul)}checks.append(row)});
  const prog=el('div',undefined,'pf-progress'),barEl=el('div',undefined,'pf-bar'),fill=el('i'),done=st.items.length-sum.counts.todo;fill.style.width=(st.items.length?Math.round(done/st.items.length*100):0)+'%';barEl.append(fill);
  barEl.setAttribute('role','progressbar');barEl.setAttribute('aria-valuemin','0');barEl.setAttribute('aria-valuemax',String(st.items.length));barEl.setAttribute('aria-valuenow',String(done));barEl.setAttribute('aria-label','Elementi tradotti');
  prog.dataset.running=String(!!(run&&run.running));prog.append(barEl,el('p',run&&run.running?'Lotto '+(run.batches.findIndex(b=>b.status==='running')+1)+' di '+rc.total+' in corso · '+done+' di '+st.items.length+' elementi'+(run.paused?' · pausa dopo questo lotto':''):done+' di '+st.items.length+' elementi tradotti','pf-progress-text'));
  const acts=el('div',undefined,'ps-actions tr-run');
  if(run&&run.running){const p=button(run.paused?'Pausa dopo questo lotto…':'Pausa');p.disabled=run.paused;p.onclick=()=>{run.paused=true;renderResults()};acts.append(p)}
  else if(run&&run.paused&&rc.todo){const r=button('Riprendi','primary');r.onclick=()=>{run.paused=false;startRun(false)};acts.append(r,el('span','I '+rc.todo+' lotti che restano sono già confermati.','muted'))}
  else if(todo.length&&st.style){const k=todo.flat().length,g=button('Traduci gli altri '+k+' element'+(k===1?'o':'i'),'primary');g.onclick=()=>startRun(true);acts.append(g,el('span',todo.length+' chiamat'+(todo.length===1?'a':'e')+' AI, una per lotto: ti chiedo conferma prima.','muted'))}
  if(run&&!run.running&&rc.error){const r=button('Riprova i lotti non riusciti');r.onclick=async()=>{const bad=run.batches.filter(b=>b.status==='error');
   if(!(await askConfirm({title:'Riprovo i lotti non riusciti?',cost:bad.length===1?'È una sola chiamata AI: usa crediti API.':'Sono '+bad.length+' chiamate AI: usano crediti API.',facts:[['Lotti',String(bad.length)],['Elementi',String(bad.reduce((k,b)=>k+b.keys.length,0))]],ok:'Riprova'})))return;retryFailed(run);startRun(false)};acts.append(r)}
  const segL=el('div',undefined,'ad-seg pf-seg');segL.setAttribute('role','group');segL.setAttribute('aria-label','Lingua');if(!st.settings.langs.includes(st.view))st.view=st.settings.langs[0];
  st.settings.langs.forEach(l=>{const b=button(lang(l).code+' · '+lang(l).label);b.setAttribute('aria-pressed',String(st.view===l));b.onclick=()=>{st.view=l;renderResults()};segL.append(b)});
  const segF=el('div',undefined,'ad-seg pf-seg');segF.setAttribute('role','group');segF.setAttribute('aria-label','Mostra');
  [['all','Tutti',st.items.length],['fail','Da sistemare',sum.counts.fail],['warn','Con avvisi',sum.counts.warn],['todo','Da tradurre',sum.counts.todo]].forEach(([k,lab,v])=>{const b=button(lab+' · '+v);b.setAttribute('aria-pressed',String(st.filter===k));b.onclick=()=>{st.filter=k;st.shown=15;renderResults()};segF.append(b)});
  const segs=el('div',undefined,'tr-segs');segs.append(segL,segF);
  const keep=resBox.contains(dom().activeElement)&&dom().activeElement.closest&&dom().activeElement.closest('.tr-unit');
  if(keep){const swap=(sel,node)=>{const o=resBox.querySelector(sel);if(o)o.replaceWith(node)};swap('.pf-sum',pills);swap('.tr-checks',checks);swap('.pf-progress',prog);swap('.tr-run',acts);return}
  const byLevel=new Map(sum.items.map(x=>[x.key,x])),list=el('div',undefined,'pf-list'),shown=st.items.filter(it=>st.filter==='all'||byLevel.get(it.key).level===st.filter);
  shown.slice(0,st.shown).forEach(it=>list.append(itemCard(it,byLevel.get(it.key))));if(!shown.length)list.append(el('p','Nessun elemento qui.','muted pf-empty'));
  const more=shown.length>st.shown?button('Mostra altri '+Math.min(15,shown.length-st.shown)+' (ne restano '+(shown.length-st.shown)+')','pf-more'):null;if(more)more.onclick=()=>{st.shown+=15;renderResults()};
  resBox.replaceChildren(head,pills,checks,prog,acts,segs,list,...(more?[more]:[]))}
 function itemCard(it,info){const c=el('article',undefined,'pf-prod tr-item'),lv=info.level;c.dataset.status=lv==='ok'?'ok':lv==='todo'?'':lv==='warn'?'verify':'error';
  const h=button('','pf-prod-head');h.setAttribute('aria-expanded',String(st.open.has(it.key)));const nm=el('span',undefined,'pf-prod-names');
  const first=it.units[0],tx=first?textOf(st.out,first.k,st.view):'';nm.append(el('span',(it.id?it.id+' · ':'')+it.units.length+' test'+(it.units.length===1?'o':'i'),'pf-prod-id'),el('strong',it.name),el('small',tx||'Non ancora tradotto in '+lang(st.view).label.toLowerCase()));
  const pl=el('span',undefined,'tr-item-pills');pl.append(pill(...LEVEL_PILL[lv]));if(info.review)pl.append(pill('Madrelingua','warn'));h.append(nm,pl);
  h.onclick=()=>{st.open.has(it.key)?st.open.delete(it.key):st.open.add(it.key);c.replaceWith(itemCard(it,summary([it],st.out,st.settings).items[0]))};c.append(h);
  if(st.open.has(it.key)){const body=el('div',undefined,'pf-prod-body');if(info.review)body.append(el('p',info.review,'tr-review'));it.units.forEach(u=>body.append(unitRow(it,u)));c.append(body)}
  return c}
 function unitRow(it,u){const l=st.view,row=el('div',undefined,'tr-unit'),top=el('div',undefined,'pf-field-top'),t=textOf(st.out,u.k,l),count=el('span','','pf-count');
  top.append(el('span',u.label+(u.max?' · max '+u.max:'')),count);const src=el('p',u.text,'tr-src');src.lang='it';
  const x=el('textarea');x.rows=Math.min(8,Math.max(2,Math.ceil(chars(t||u.text)/70)));x.value=t;x.lang=l;x.setAttribute('aria-label',u.label+' in '+lang(l).label.toLowerCase());const ul=el('ul',undefined,'pf-issues');
  const paint=()=>{const v=x.value,iss=v?checkText(u,v,l,parseGlossary(st.settings.glossary)):[];count.textContent=chars(v)+(u.max?'/'+u.max:'')+' · originale '+chars(u.text);count.dataset.over=String(!!(u.max&&chars(v)>u.max));
   ul.replaceChildren(...iss.map(i=>{const li=el('li',i.msg);li.dataset.soft=String(i.level==='warn');return li}));ul.hidden=!iss.length};
  x.oninput=()=>{const cur=st.out.get(u.k)||{};cur[l]=x.value;cur._edited={...(cur._edited||{}),[l]:true};st.out.set(u.k,cur);paint();clearTimeout(row._t);row._t=setTimeout(()=>{renderResults();renderExport()},400)};
  paint();autosize(x);row.append(top,src,x,ul);return row}
 // ---- step 4: export ----
 const model=()=>({kind:st.kind==='saved'?'text':st.kind,name:st.name,settings:st.settings,style:st.style,items:st.items,out:st.out,sheet:st.sheet,columns:st.columns});
 function renderExport(){const sum=summary(st.items,st.out,st.settings);if(!sum.done){expBox.hidden=true;return}expBox.hidden=false;setStep(4);
  const head=el('div',undefined,'pf-step-head'),t=el('div');t.append(el('h3','Export'),el('p',st.kind==='sheet'?'Lo stesso foglio, con una colonna per lingua accanto a ogni colonna tradotta.':st.kind==='sheets'?'Le schede con le lingue affiancate e una copia tradotta per lingua.':'Un file Markdown per lingua, con la struttura dell’originale.','muted'));head.append(t);
  const grid=el('div',undefined,'pf-export-grid');let files=[];try{files=exportFiles(model())}catch(e){}
  const zipB=button('','pf-exp primary');zipB.append(el('strong','Scarica tutto (.zip)'),el('small',files.length+' file · '+zipName(model())));zipB.onclick=()=>{try{download(zipName(model()),exportZip(model()))}catch(e){status.textContent=e.message}};grid.append(zipB);
  files.forEach(f=>{const b=button('','pf-exp');b.append(el('strong',f.label),el('small',f.name));b.onclick=()=>download(f.name,f.data);grid.append(b)});
  const saveB=button('Salva nel progetto'),sStatus=el('p','','tool-status');sStatus.setAttribute('role','status');const acts=el('div',undefined,'ps-actions pf-save');acts.append(saveB,el('span','Nessuna chiamata AI: si salva nel progetto e lo riapri da qui.','muted'));
  saveB.onclick=async()=>{if(!ctx.workspace||!ctx.projectId){sStatus.textContent='Apri un progetto per salvare la traduzione.';return}saveB.disabled=true;
   try{const rec=savedRecord(model(),{by:ctx.by,id:st.saveId||undefined});st.saveId=rec.id;const s=await saveToProject(ctx.workspace,ctx.projectId,rec);renderSaved(s.items);sStatus.textContent='Traduzione salvata nel progetto.'}catch(e){sStatus.textContent='Salvataggio non riuscito: '+e.message}finally{saveB.disabled=false}};
  expBox.replaceChildren(head,grid,acts,sStatus)}
 return wrap}

return Object.freeze({AGENT,SAMPLES,BATCH_ITEMS,BATCH_CHARS,MAX_ITEMS,EXPANSION,LIMITS,LANGS,MATERIALS,SOURCES,STYLES,CHECKS,FILES,
 normalizeSettings,parseGlossary,protectedIn,mask,unmask,personalIn,datesIn,numValues,numbersIn,numberDiff,dateDiff,limitFor,channelMax,checkText,levelOf,reviewReason,
 fromText,isPersonal,sheetColumns,nameColumn,fromSheet,fromProductSheet,savedTexts,fromSaved,rules,prepareCall,proposalsPrompt,batchPrompt,parseJson,parseTranslations,parseProposals,
 itemChars,itemDone,planBatches,planFacts,newRun,runCounts,runBatches,retryFailed,requestProposals,requestBatches,keysCall,results,summary,
 sheetCsv,productCsv,productCopies,productCopyCsv,textMd,glossaryCsv,reportCsv,exportFiles,exportZip,zipName,readme,
 readStore,savedRecord,fromRecord,addRecord,saveToProject,SAMPLE_TEXT,SAMPLE_GLOSSARY,sampleSheet,readSheet,translationStudio});
});
