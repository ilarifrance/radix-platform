/* Dati strutturati e file per motori di ricerca e assistenti AI dei siti dello Studio Sito (lavoro W3 «GEO», parte S).
   Tutto senza AI, dai soli fatti del progetto: profilo (nome, tipo di attività, note e link), dati societari di
   lib/site-legal.js, contatti e indirizzo scritti nello studio, Kit identità (logo) e le sezioni della pagina generata.
   - JSON-LD in ogni pagina: Organization, il tipo di attività più preciso di schema.org (TYPES: Bakery, Restaurant,
     Physiotherapy…; LocalBusiness quando nessuna voce corrisponde), WebSite, BreadcrumbList, FAQPage quando la pagina ha
     domande e risposte nella sezione FAQ, i servizi della sezione Servizi come Service.
   - Un dato che manca non si inventa e non diventa un segnaposto: il campo non c'è. I dati obbligatori del sito (ragione
     sociale, P. IVA, sede) li chiede il riquadro «Da completare» dello studio; dopo «Applica» il JSON-LD si riscrive.
   - Il JSON va nella pagina come <script type="application/ld+json"> con <, >, & e i separatori di riga scritti come
     \uXXXX: nessun testo può chiudere lo script. È un blocco di dati, non un programma (la CSP della pagina non cambia).
   - siteBundle(): il pacchetto da pubblicare o scaricare. Gli indirizzi diventano assoluti quando l'indirizzo del sito è
     noto (alla pubblicazione lo decide api/_site_publish.js) e si aggiungono robots.txt, sitemap.xml (solo con
     l'indirizzo) e llms.txt (riassunto dei fatti e pagine principali).
   - report(): il riquadro «Dati strutturati» dello Studio SEO e GEO (campi presenti e mancanti, anteprima del JSON-LD).
   Funzioni pure: girano nel browser (RadixSiteSeo) e in Node per i test e per il server. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixSiteSeo=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const Legal=root.RadixSiteLegal||(typeof require==='function'?require('./site-legal.js'):null);
const clean=s=>String(s==null?'':s).replace(/\s+/g,' ').trim();
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9&]+/g,' ').trim();
const RICH_RESULTS='https://search.google.com/test/rich-results';
const TODO_RE=/\[da completare:/i;

// ---- the type of business: the most specific schema.org type, from the project's own words ----
// [pattern on the normalized text, schema.org type, what it means in Italian]. Order matters: specific before general.
const TYPES=Object.freeze([
 [/fisioterap/,'Physiotherapy','fisioterapia'],
 [/dentist|odontoiatr|ortodonz/,'Dentist','studio dentistico'],
 [/veterinar/,'VeterinaryCare','veterinario'],
 [/\bfarmaci[ae]\b|parafarmaci/,'Pharmacy','farmacia'],
 [/\bottic[oai]\b|\bottica\b|optometr/,'Optician','ottico'],
 [/poliambulator|\bclinica\b|centro medico/,'MedicalClinic','poliambulatorio o clinica'],
 [/\bmedic[oi]\b|pediatr|dermatolog|cardiolog|ginecolog|oculist|ortoped/,'Physician','studio medico'],
 [/psicolog|psicoterap|nutrizionist|dietist|logoped|osteopat|podolog/,'MedicalBusiness','attività sanitaria'],
 [/gelateri/,'IceCreamShop','gelateria'],
 [/panific|panetteri|\bforn[oi]\b|pasticceri/,'Bakery','panificio, forno o pasticceria'],
 [/pizzeri|ristorant|trattori|osteri|sushi|bistrot|tavola calda|rosticceri|agriturism.*ristor/,'Restaurant','ristorante o pizzeria'],
 [/barbier|parrucchier|acconciat|hair stylist/,'HairSalon','parrucchiere o barbiere'],
 [/estetist|centro estetico|\bestetica\b|nail|onicotec/,'BeautySalon','centro estetico'],
 [/centro benessere|day spa/,'DaySpa','centro benessere'],
 [/birrifici/,'Brewery','birrificio'],
 [/\bcantina\b|vinicol|aziend[ae] vitivinicol/,'Winery','cantina'],
 [/\bpub\b|birreri|wine bar|cocktail bar|\benotec/,'BarOrPub','pub o enoteca'],
 [/caffetteri|torrefazion|\bcaffe\b|\bbar\b/,'CafeOrCoffeeShop','bar o caffetteria'],
 [/\bhotel\b|albergo/,'Hotel','hotel'],
 [/\bb ?& ?b\b|bed and breakfast/,'BedAndBreakfast','bed and breakfast'],
 [/campeggio|camping/,'Campground','campeggio'],
 [/agriturism|affittacamer|ostello|casa vacanz|residence/,'LodgingBusiness','struttura ricettiva'],
 [/palestra|fitness|crossfit|pilates|\byoga\b/,'ExerciseGym','palestra'],
 [/avvocat|studio legale/,'LegalService','studio legale'],
 [/commercialist|contabil|consulent[ei] del lavoro/,'AccountingService','commercialista'],
 [/\bnotai[ol]?\b|\bnotaio\b/,'Notary','notaio'],
 [/immobiliar/,'RealEstateAgent','agenzia immobiliare'],
 [/assicuraz/,'InsuranceAgency','agenzia assicurativa'],
 [/idraulic/,'Plumber','idraulico'],
 [/elettricist|impianti elettric/,'Electrician','elettricista'],
 [/imbianchin|tinteggiat/,'HousePainter','imbianchino'],
 [/\bfabbro\b|serrature/,'Locksmith','fabbro'],
 [/impresa edile|ediliz|ristrutturazion|costruzion/,'GeneralContractor','impresa edile'],
 [/serrament|falegnam|infiss/,'HomeAndConstructionBusiness','casa e costruzioni'],
 [/carrozzeri/,'AutoBodyShop','carrozzeria'],
 [/autolavaggi/,'AutoWash','autolavaggio'],
 [/officina|meccanic|gommist|elettrauto/,'AutoRepair','officina'],
 [/concessionari|autosalone/,'AutoDealer','concessionaria'],
 [/fiorai|fioreri|fioraio/,'Florist','fioraio'],
 [/librer/,'BookStore','libreria'],
 [/gioiell|orefic/,'JewelryStore','gioielleria'],
 [/calzatur|\bscarpe\b/,'ShoeStore','calzature'],
 [/abbigliament|boutique/,'ClothingStore','abbigliamento'],
 [/ferramenta/,'HardwareStore','ferramenta'],
 [/pet shop|toelettatur|negozio (?:per |di )?animali/,'PetStore','negozio per animali'],
 [/alimentari|supermercat|minimarket|macelleri|salumeri|gastronomi|ortofrutt/,'GroceryStore','alimentari'],
 [/elettronica/,'ElectronicsStore','elettronica'],
 [/arredament|\bmobili\b/,'FurnitureStore','arredamento'],
 [/agenzia (?:di )?viagg|tour operator/,'TravelAgency','agenzia viaggi'],
 [/tatuag|tattoo/,'TattooParlor','studio di tatuaggi'],
 [/lavanderi|tintori/,'DryCleaningOrLaundry','lavanderia'],
 [/asilo nido|baby parking/,'ChildCare','asilo nido'],
 [/agenzia (?:di )?(?:comunicazione|marketing|pubblicit)|web agency|studio grafico|consulenz/,'ProfessionalService','servizi professionali'],
 [/negozio|bottega|emporio/,'Store','negozio']]);
const GENERIC_KIND=/^(?:progett|personal brand)/i;
// The kind of business first (profile «tipo di attività»), then the summary. {type, label, matched, from}.
function businessType(kind,summary){
 for(const [from,text] of [['kind',GENERIC_KIND.test(clean(kind))?'':kind],['summary',summary]]){const t=norm(text);if(!t)continue;
  for(const [re,type,label] of TYPES)if(re.test(t))return {type,label,matched:true,from}}
 return {type:'LocalBusiness',label:'attività locale',matched:false,from:''}}

// ---- opening hours: Italian text → OpeningHoursSpecification. Anything not understood: no hours at all ----
const DAYS=[['lun','Monday','lunedi'],['mar','Tuesday','martedi'],['mer','Wednesday','mercoledi'],['gio','Thursday','giovedi'],['ven','Friday','venerdi'],['sab','Saturday','sabato'],['dom','Sunday','domenica']];
const DAY_RE=/\b(lun(?:edi)?|mar(?:tedi)?|mer(?:coledi)?|gio(?:vedi)?|ven(?:erdi)?|sab(?:ato)?|dom(?:enica)?)(?![a-z])\.?/g;
const dayIndex=w=>DAYS.findIndex(d=>w.startsWith(d[0]));
const hhmm=(h,m)=>String(h).padStart(2,'0')+':'+String(m||0).padStart(2,'0');
/* «lun-ven 9-13, 15-19; sab 9:30-12:30; dom chiuso», «da lunedì a venerdì dalle 9 alle 18», «tutti i giorni 7-20».
   Returns [] when the text is empty or any part of it is not understood (never a guess). */
function parseHours(text){
 let t=String(text||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[–—]/g,'-').replace(/\s+/g,' ').trim();
 t=t.replace(/^\s*(?:orari(?: di apertura)?|aperti|apertura)\s*:?\s*/,'');if(!t)return [];
 t=t.replace(/\btutti i giorni\b|\b7 giorni su 7\b/g,'lun-dom');
 const toks=[];let m;DAY_RE.lastIndex=0;while((m=DAY_RE.exec(t)))toks.push({i:m.index,end:m.index+m[0].length,d:dayIndex(m[1])});
 if(!toks.length)return [];
 if(!/^[\s,;:.·|/-]*(?:da\s*)?$/.test(t.slice(0,toks[0].i)))return [];
 // Day words joined only by «-», «a», «al», «,», «e», «/» form one group of days.
 const groups=[];let g=null;
 toks.forEach((k,j)=>{const between=j?t.slice(toks[j-1].end,k.i):null;
  if(g&&/^\s*(?:-|a|al|alla|,|e|ed|\/|&)\s*$/.test(between)){g.parts.push({d:k.d,range:/^\s*(?:-|a|al|alla)\s*$/.test(between)});g.end=k.end}
  else{g={start:k.i,end:k.end,parts:[{d:k.d,range:false}]};groups.push(g)}});
 const out=[];
 for(let j=0;j<groups.length;j++){const gr=groups[j],days=[];
  gr.parts.forEach((p,k)=>{if(p.range&&k){const from=gr.parts[k-1].d;if(p.d<from)return days.push(NaN);for(let x=from+1;x<=p.d;x++)days.push(x)}else days.push(p.d)});
  if(days.some(Number.isNaN))return [];
  let rest=t.slice(gr.end,j+1<groups.length?groups[j+1].start:t.length).replace(/\bda\s*$/,'');
  if(/chius/.test(rest)){if(!/^[\s,;:.·|/-]*chius[oai]?[\s,;:.·|/-]*$/.test(rest))return [];continue}
  const ranges=[];const RANGE=/(?:dalle\s*|ore\s*|h\s*)?(\d{1,2})(?:[:.](\d{2}))?\s*(?:-|alle|a)\s*(\d{1,2})(?:[:.](\d{2}))?/g;let r;
  while((r=RANGE.exec(rest))){const oh=+r[1],om=+(r[2]||0),ch=+r[3],cm=+(r[4]||0);
   if(oh>23||ch>24||om>59||cm>59||(ch===24&&cm))return [];const o=oh*60+om,c=ch*60+cm;if(c<=o)return [];
   ranges.push([hhmm(oh,om),ch===24?'23:59':hhmm(ch,cm)])}
  if(!ranges.length)return [];
  if(rest.replace(RANGE,' ').replace(/\b(?:e|ed|ore|orario continuato|continuato)\b/g,' ').replace(/[\s,;:.·|/-]/g,'')!=='')return [];
  for(const d of [...new Set(days)])for(const [opens,closes] of ranges)out.push({d,opens,closes})}
 // One OpeningHoursSpecification per time range, with all its days in week order.
 const by=new Map();for(const x of out){const k=x.opens+'-'+x.closes;if(!by.has(k))by.set(k,new Set());by.get(k).add(x.d)}
 return [...by.entries()].map(([k,ds])=>({'@type':'OpeningHoursSpecification',dayOfWeek:[...ds].sort((a,b)=>a-b).map(d=>DAYS[d][1]),opens:k.split('-')[0],closes:k.split('-')[1]}))}
const DAY_IT={Monday:'lun',Tuesday:'mar',Wednesday:'mer',Thursday:'gio',Friday:'ven',Saturday:'sab',Sunday:'dom'};
const hoursText=spec=>(spec||[]).map(s=>s.dayOfWeek.map(d=>DAY_IT[d]||d).join(', ')+' '+s.opens+'-'+s.closes).join('; ');

// ---- address: «Via Roma 12, 24121 Bergamo (BG)» → PostalAddress; the country only when the text says it ----
const STREET=/^(?:via|viale|v\.le|piazza|p\.za|piazzale|corso|c\.so|largo|vicolo|strada|contrada|localita|loc\.|borgo|lungomare|salita|frazione|fraz\.)\b/i;
function postalAddress(text){const s=clean(text).replace(/[.;]+$/,'');if(!s||TODO_RE.test(s))return null;
 const m=/^(.+?)\s*[,\-–]\s*(\d{5})\s+([^,()\d]+?)(?:\s*\(?\b([A-Z]{2})\b\)?)?(?:\s*[,\-–]\s*(italia|italy))?$/i.exec(s);
 if(m){const a={'@type':'PostalAddress',streetAddress:clean(m[1]),postalCode:m[2],addressLocality:clean(m[3])};
  if(m[4])a.addressRegion=m[4].toUpperCase();if(m[4]||m[5])a.addressCountry='IT';return a}
 const a={'@type':'PostalAddress',streetAddress:s};if(/\b(italia|italy)\s*$/i.test(s))a.addressCountry='IT';return a}
const structuredAddress=a=>!!(a&&a.postalCode&&a.addressLocality);
const looksLikeStreet=s=>STREET.test(clean(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''))||/\b\d{5}\b/.test(String(s||''));

// ---- links ----
const SOCIAL=/^(?:[a-z0-9-]+\.)*(?:facebook\.com|fb\.com|instagram\.com|linkedin\.com|youtube\.com|tiktok\.com|x\.com|twitter\.com|pinterest\.[a-z.]+|threads\.net|tripadvisor\.[a-z.]+|yelp\.[a-z.]+|wikipedia\.org|wikidata\.org|g\.page|maps\.app\.goo\.gl)$/i;
const isMaps=u=>/^https?:\/\/(?:www\.)?google\.[a-z.]+\/maps\b/i.test(u);
const urlsIn=t=>(String(t||'').match(/https?:\/\/[^\s,;)<>"'«»]+/gi)||[]).map(u=>u.replace(/[.,]+$/,''));
const hostOf=u=>{try{return new URL(u).hostname.toLowerCase()}catch(e){return ''}};
// A site address: https URL without user/port, a real host name. '' otherwise.
function baseUrl(v){const s=clean(v);if(!s)return '';let u;try{u=new URL(/^https?:\/\//i.test(s)?s:'https://'+s)}catch(e){return ''}
 if(!/^https?:$/.test(u.protocol)||u.username||u.password||u.port||!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(u.hostname))return '';
 return (u.protocol+'//'+u.hostname.toLowerCase()+u.pathname).replace(/\/+$/,'')}

// ---- the facts of the project ----
const EMAIL_RE=/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const PHONE_RE=/(?:\+\d{1,3}[\s.]?)?\b(?:0\d|3\d{2})[\d\s.]{5,12}\d\b/;
const safeLogo=s=>{const v=String(s||'').trim();return v.length<=100000&&/^<svg\b/i.test(v)&&/<\/svg>\s*$/i.test(v)&&!/<script|<foreignobject|<!entity|<!doctype|<iframe|<image|\son[a-z]+\s*=|javascript:|(?:xlink:)?href\s*=\s*["'](?!#)/i.test(v)?v:''};
const textOf=x=>Array.isArray(x)?x.join('\n'):typeof x==='string'?x:'';
const lineIn=(text,re)=>{const m=String(text||'').match(re);return m?clean(m[1]):''};
function geoOf(p,text){const g=p.geo||p.coordinates||p.coordinate,lat=g&&+((g.lat!=null?g.lat:g.latitude)),lng=g&&+((g.lng!=null?g.lng:g.lon!=null?g.lon:g.longitude));
 let pair=Number.isFinite(lat)&&Number.isFinite(lng)?[lat,lng]:null;
 if(!pair){const m=/^\s*(?:coordinate|coordinates|gps|geo)\s*:\s*(-?\d{1,2}\.\d{3,})\s*[,;\s]\s*(-?\d{1,3}\.\d{3,})\s*$/im.exec(text);if(m)pair=[+m[1],+m[2]]}
 if(!pair||Math.abs(pair[0])>90||Math.abs(pair[1])>180||(pair[0]===0&&pair[1]===0))return null;
 return {'@type':'GeoCoordinates',latitude:pair[0],longitude:pair[1]}}
/* Everything the structured data may say, from what is written in the project. Never a guess: a fact that is not there is ''.
   o: {profile (registry profile: identityKit, legal fields, hours, geo, links, notes), project (RadixAgents.profileFor),
   name (as shown in the page), place and contacts (the studio fields shown in the page; default: read from the profile)}. */
function siteFacts(o={}){const p=o.profile&&typeof o.profile==='object'?o.profile:{},pj=o.project&&typeof o.project==='object'?o.project:{};
 const pc=p.contacts&&typeof p.contacts==='object'?p.contacts:{};
 const text=[pj.links,pj.notes,pj.decisions,p.links,p.notes,p.decisions].map(textOf).join('\n');
 // A VAT number (11 digits with a valid check digit) is not a phone number.
 const phones=(text.match(new RegExp(PHONE_RE.source,'g'))||[]).map(clean).filter(x=>!(Legal&&/^\d{11}$/.test(x.replace(/[\s.]/g,''))&&Legal.vatNumber(x)));
 const contacts=o.contacts!=null?String(o.contacts):[(text.match(new RegExp(EMAIL_RE.source,'g'))||[]).join(' · '),phones.join(' · ')].filter(Boolean).join(' · ');
 const place=clean(o.place!=null?o.place:lineIn(text,/^\s*(?:indirizzo|sede operativa|dove)\s*:\s*(.+)$/im)||(text.match(/\b(?:via|viale|piazza|piazzale|corso|largo|vicolo|strada)\s+[^\n;]{3,80}/i)||[''])[0]).replace(/[.,]+$/,'').slice(0,200);
 const legal=Legal?Legal.legalFacts(p,{contacts}):{legalName:'',vat:'',address:'',email:''};
 const parts=clean(contacts).split(/\s*[·|;,]\s*|\s{2,}/).filter(Boolean);
 const telephone=(parts.map(x=>(x.match(PHONE_RE)||[''])[0]).find(Boolean)||'').trim();
 const email=(parts.map(x=>(x.match(EMAIL_RE)||[''])[0]).find(Boolean)||'');
 // Hours: an explicit field, an «Orari: …» line, or a contact item that is only hours.
 let hoursSource=clean(p.hours||p.orari||pc.hours||pc.orari||lineIn(text,/^\s*orari(?: di apertura)?\s*:\s*(.+)$/im));
 if(!hoursSource){const h=parts.find(x=>parseHours(x).length);if(h)hoursSource=h}
 const hours=parseHours(hoursSource);
 const allUrls=[...new Set(urlsIn(text+'\n'+contacts))];
 const sameAs=allUrls.filter(u=>SOCIAL.test(hostOf(u))||isMaps(u)).slice(0,10);
 const website=baseUrl(p.website||p.sito||pc.website||'')||baseUrl(allUrls.find(u=>!SOCIAL.test(hostOf(u))&&!isMaps(u))||'');
 const kit=p.identityKit&&typeof p.identityKit==='object'?p.identityKit:{};
 const name=clean(o.name!=null?o.name:pj.name||kit.brand||'').slice(0,80);
 const type=businessType(p.kind||pj.kind,pj.summary||p.summary||'');
 return {name:TODO_RE.test(name)?'':name,type,description:clean(pj.summary||'').slice(0,300),legalName:legal.legalName,vat:legal.vat,legalAddress:legal.address,
  place:looksLikeStreet(place)?place:'',telephone,email,hours,hoursSource:hours.length?hoursSource:'',hoursUnread:!!hoursSource&&!hours.length,
  geo:geoOf(p,text),sameAs:sameAs.filter(u=>!website||!u.startsWith(website)),website,logo:safeLogo(kit.logo)}}
// The values typed in «Da completare» → the facts they complete (company data and the name only).
function withFilled(facts,values){const f={...(facts||{})},map={legalName:'legalName',vat:'vat',address:'legalAddress'};
 for(const [key,raw] of Object.entries(values||{})){const v=clean(raw);if(!v)continue;
  for(const k of Object.keys(map))if(Legal&&key===Legal.marker(k))f[map[k]]=k==='vat'?(Legal.vatNumber(v)||''):v;
  if(/^\[da completare: nome dell.attivit.\]$/.test(key))f.name=v.slice(0,80)}
 return f}

// ---- the page: sections of the template of lib/site-studio.js, read back as plain text ----
const unesc=s=>String(s).replace(/&(amp|lt|gt|quot|#39);/g,(m,k)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[k]));
const plain=h=>clean(unesc(String(h||'').replace(/<[^>]*>/g,' ')));
function readPage(html){const h=String(html||''),sections=[];
 const re=/<section id="(s\d+[^"]*)" class="sec[^"]*"><div class="wrap"><h2>([\s\S]*?)<\/h2>([\s\S]*?)<\/div><\/section>/g;let m;
 while((m=re.exec(h))){const body=m[3].split(/<div class=|<form\b/)[0],blocks=[];let b;const bre=/<(p|li)>([\s\S]*?)<\/\1>/g;
  while((b=bre.exec(body)))blocks.push({kind:b[1],text:plain(b[2])});
  sections.push({id:m[1],title:plain(m[2]),blocks})}
 const meta=(h.match(/<meta name="description" content="([^"]*)">/)||['',''])[1],title=(h.match(/<title>([^<]*)<\/title>/)||['',''])[1];
 return {sections,description:unesc(meta),title:unesc(title),noindex:/<meta name="robots" content="[^"]*noindex/i.test(h)}}
// Questions (a line ending with «?») and the answers after them, only from a FAQ section; pairs with a placeholder are left out.
function faqFrom(sections){const sec=(sections||[]).find(s=>/\bfaq\b|domande/i.test(s.title));if(!sec)return [];const out=[];let cur=null;
 for(const b of sec.blocks){const t=b.text.replace(/^(?:d|domanda)\s*[:.]\s*/i,'');const q=/^(.{5,200}?\?)\s*(.*)$/.exec(t);
  if(q){cur={q:q[1],a:q[2].replace(/^(?:r|risposta)\s*[:.]\s*/i,'')};out.push(cur)}
  else if(cur)cur.a=clean(cur.a+' '+t.replace(/^(?:r|risposta)\s*[:.]\s*/i,''))}
 return out.filter(x=>x.q&&x.a&&!TODO_RE.test(x.q+x.a)).slice(0,20).map(x=>({q:x.q.slice(0,200),a:x.a.slice(0,1000)}))}
// The items listed in the Servizi section: «Nome: descrizione» or «Nome – descrizione». Prose paragraphs are not services.
function servicesFrom(sections){const sec=(sections||[]).find(s=>/serviz|trattament|prestazion/i.test(s.title));if(!sec)return [];
 return sec.blocks.filter(b=>b.kind==='li'&&!TODO_RE.test(b.text)).map(b=>{const m=/^([^:–—]{2,80}?)\s*(?::|\s[–—-]\s)\s*(.+)$/.exec(b.text);
  return m?{name:clean(m[1]),description:clean(m[2]).slice(0,300)}:b.text.length<=80?{name:b.text}:null}).filter(Boolean).slice(0,20)}

// ---- the JSON-LD ----
// Drops every empty value (''/null/undefined, [] and {} with nothing left): a missing fact is never written.
function prune(v){if(Array.isArray(v)){const a=v.map(prune).filter(x=>x!==undefined);return a.length?a:undefined}
 if(v&&typeof v==='object'){const o={};for(const [k,x] of Object.entries(v)){const y=prune(x);if(y!==undefined)o[k]=y}return Object.keys(o).some(k=>k!=='@type'&&k!=='@id')||v['@id']&&Object.keys(o).length===1?o:undefined}
 if(typeof v==='string'){const s=v.trim();return s?s:undefined}
 if(typeof v==='number')return Number.isFinite(v)?v:undefined;
 return v==null?undefined:v}
const PAGE_NAMES=Object.freeze({'index.html':'Home','privacy.html':'Informativa privacy','cookie.html':'Cookie policy','grazie.html':'Grazie','menu.html':'Menu'});
const ids={org:'#organization',biz:'#business',site:'#website'};
/* The @graph for one page. facts: siteFacts(). o: {page (file name), html (the page, for the FAQ, the services and the
   description), base (the site address, when known: absolute url fields)}. */
function graph(facts,o={}){const f=facts||{},page=o.page||'index.html',home=page==='index.html',base=baseUrl(o.base);
 const read=readPage(o.html),at=x=>base?base+'/'+x:undefined,id=x=>base?base+'/'+x:x;
 const url=at(''),logo=f.logo&&base?at('logo.svg'):undefined,nodes=[];
 const legalAddr=postalAddress(f.legalAddress),placeAddr=f.place?postalAddress(f.place):null,email=f.email&&EMAIL_RE.test(f.email)?f.email:undefined;
 if(f.name||f.legalName)nodes.push({'@type':'Organization','@id':id(ids.org),name:f.name||f.legalName,legalName:f.legalName,vatID:f.vat?'IT'+f.vat:undefined,url,logo,email,telephone:f.telephone,address:legalAddr,sameAs:f.sameAs});
 const description=home?(TODO_RE.test(read.description)?'':read.description)||f.description:undefined;
 if(f.name&&(placeAddr||legalAddr)){const services=home?servicesFrom(read.sections):[];
  nodes.push({'@type':(f.type&&f.type.type)||'LocalBusiness','@id':id(ids.biz),name:f.name,legalName:f.legalName,vatID:f.vat?'IT'+f.vat:undefined,description,url,logo,image:logo,
   telephone:f.telephone,email,address:placeAddr&&structuredAddress(placeAddr)?placeAddr:legalAddr&&structuredAddress(legalAddr)?legalAddr:placeAddr||legalAddr,geo:f.geo||undefined,
   openingHoursSpecification:Array.isArray(f.hours)&&f.hours.length?f.hours:undefined,sameAs:f.sameAs,parentOrganization:{'@id':id(ids.org)},
   hasOfferCatalog:services.length?{'@type':'OfferCatalog',name:'Servizi',itemListElement:services.map(s=>({'@type':'Offer',itemOffered:{'@type':'Service',name:s.name,description:s.description,provider:{'@id':id(ids.biz)}}}))}:undefined})}
 if(f.name)nodes.push({'@type':'WebSite','@id':id(ids.site),url,name:f.name,inLanguage:'it-IT',description:home?description:undefined,publisher:nodes.length?{'@id':id(ids.org)}:undefined});
 nodes.push({'@type':'BreadcrumbList',itemListElement:(home?['index.html']:['index.html',page]).map((x,i)=>({'@type':'ListItem',position:i+1,name:PAGE_NAMES[x]||x,item:at(x==='index.html'?'':x)}))});
 const faq=home?faqFrom(read.sections):[];
 if(faq.length)nodes.push({'@type':'FAQPage',mainEntity:faq.map(x=>({'@type':'Question',name:x.q,acceptedAnswer:{'@type':'Answer',text:x.a}}))});
 return prune({'@context':'https://schema.org','@graph':nodes})}
// Problems of a JSON-LD value: empty strings, empty lists or objects, non-finite numbers, nodes without @type. [] when valid.
function validate(data){const out=[];
 const walk=(v,path)=>{if(v==null)out.push(path+': vuoto');else if(typeof v==='string'){if(!v.trim())out.push(path+': testo vuoto');if(TODO_RE.test(v))out.push(path+': segnaposto')}
  else if(typeof v==='number'){if(!Number.isFinite(v))out.push(path+': numero non valido')}
  else if(Array.isArray(v)){if(!v.length)out.push(path+': lista vuota');v.forEach((x,i)=>walk(x,path+'['+i+']'))}
  else if(typeof v==='object'){const ks=Object.keys(v);if(!ks.length)out.push(path+': oggetto vuoto');if(path!=='$'&&!v['@type']&&!v['@id'])out.push(path+': manca @type');ks.forEach(k=>walk(v[k],path+'.'+k))}
  else if(typeof v!=='boolean')out.push(path+': tipo non valido')};
 if(!data||typeof data!=='object'||data['@context']!=='https://schema.org')out.push('$: manca @context schema.org');else walk(data,'$');
 return out}
// JSON safe inside <script>: no «<», «>», «&» or line separators can close the block or start a comment.
const safeJson=data=>JSON.stringify(data).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
const scriptOf=data=>'<script type="application/ld+json">'+safeJson(data)+'</script>';
const LD_RE=/\n?<script type="application\/ld\+json">[\s\S]*?<\/script>/g;
function readJsonLd(html){const m=/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(String(html||''));if(!m)return null;try{return JSON.parse(m[1])}catch(e){return null}}
// The page with its JSON-LD (rewritten when already there), just before </head>.
function withStructuredData(html,facts,o={}){const h=String(html||'').replace(LD_RE,'');if(!/<\/head>/.test(h))return h;
 const data=graph(facts,{...o,html:h});return h.replace('</head>',scriptOf(data)+'\n</head>')}

// ---- the files around the pages ----
const xmlEsc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function robotsTxt(base){const b=baseUrl(base);
 return ['# robots.txt del sito, preparato da RADIX','User-agent: *','Allow: /',...(b?['','Sitemap: '+b+'/sitemap.xml']:[]),''].join('\n')}
// The pages that may be indexed (no «noindex»), the home first. '' without the site address: a sitemap needs full URLs.
function sitemapXml(base,files,{date}={}){const b=baseUrl(base);if(!b)return '';
 const day=/^\d{4}-\d{2}-\d{2}$/.test(String(date||''))?date:new Date().toISOString().slice(0,10);
 const list=Object.entries(files||{}).filter(([k,v])=>/\.html$/.test(k)&&!readPage(v).noindex).map(([k])=>k).sort((a,c)=>(a==='index.html'?-1:c==='index.html'?1:a.localeCompare(c)));
 return ['<?xml version="1.0" encoding="UTF-8"?>','<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',...list.map(k=>'  <url><loc>'+xmlEsc(b+'/'+(k==='index.html'?'':k))+'</loc><lastmod>'+day+'</lastmod></url>'),'</urlset>',''].join('\n')}
const md=s=>clean(s).replace(/[\[\]]/g,'');
const addressText=a=>a?[a.streetAddress,[a.postalCode,a.addressLocality].filter(Boolean).join(' '),a.addressRegion?'('+a.addressRegion+')':''].filter(Boolean).join(', ').replace(', (',' ('):'';
// llms.txt: what the site says, from its own JSON-LD and pages, for assistants that read it. Informative (Google does not use it).
function llmsTxt(base,files){const b=baseUrl(base),home=String((files||{})['index.html']||''),data=readJsonLd(home)||{},nodes=Array.isArray(data['@graph'])?data['@graph']:[];
 const byId=k=>nodes.find(n=>String(n['@id']||'').endsWith(k)),org=byId(ids.org)||{},biz=byId(ids.biz)||{},site=byId(ids.site)||{},faq=nodes.find(n=>n['@type']==='FAQPage');
 const page=readPage(home),name=biz.name||org.name||site.name||page.title,L=['# '+md(name||'Sito')];
 const desc=biz.description||site.description||page.description;if(desc&&!TODO_RE.test(desc))L.push('','> '+md(desc));
 const facts=[];const add=(k,v)=>{if(v)facts.push('- '+k+': '+md(v))};
 if(biz['@type']&&biz['@type']!=='LocalBusiness')add('Tipo di attività (schema.org)',biz['@type']);
 add('Indirizzo',addressText(biz.address||org.address));add('Telefono',biz.telephone||org.telephone);add('E-mail',biz.email||org.email);
 add('Orari',hoursText(biz.openingHoursSpecification));
 add('Ragione sociale',org.legalName);add('Partita IVA',org.vatID);
 if(Array.isArray(org.sameAs)&&org.sameAs.length)add('Profili',org.sameAs.join(' '));
 if(facts.length)L.push('','## Fatti',...facts);
 const services=biz.hasOfferCatalog&&Array.isArray(biz.hasOfferCatalog.itemListElement)?biz.hasOfferCatalog.itemListElement.map(x=>x.itemOffered||{}):[];
 if(services.length)L.push('','## Servizi',...services.map(s=>'- '+md(s.name)+(s.description?': '+md(s.description):'')));
 if(faq&&Array.isArray(faq.mainEntity))L.push('','## Domande frequenti',...faq.mainEntity.map(q=>'- '+md(q.name)+' '+md(q.acceptedAnswer&&q.acceptedAnswer.text)));
 const pages=Object.keys(files||{}).filter(k=>/\.html$/.test(k)&&k!=='grazie.html').sort((a,c)=>(a==='index.html'?-1:c==='index.html'?1:a.localeCompare(c)));
 L.push('','## Pagine',...pages.map(k=>'- ['+(PAGE_NAMES[k]||k)+']('+(b?b+'/'+(k==='index.html'?'':k):k)+')'+(k==='index.html'&&page.title?': '+md(page.title):'')));
 return L.join('\n')+'\n'}
// JSON-LD with absolute addresses for one page: rebuilt from the page's own graph (ids, url, logo, breadcrumb items).
function absolutize(data,base,page,hasLogo){const b=baseUrl(base);if(!b||!data)return data;
 const fix=v=>{if(Array.isArray(v))return v.map(fix);if(!v||typeof v!=='object')return v;const o={};
  for(const [k,x] of Object.entries(v))o[k]=k==='@id'&&typeof x==='string'&&x.startsWith('#')?b+'/'+x:fix(x);return o};
 const out=fix(data);
 for(const n of out['@graph']||[]){const id=String(n['@id']||'');
  if(id.endsWith(ids.org)||id.endsWith(ids.biz)||id.endsWith(ids.site))n.url=n.url||b+'/';
  if(hasLogo&&(id.endsWith(ids.org)||id.endsWith(ids.biz))){n.logo=b+'/logo.svg';if(id.endsWith(ids.biz))n.image=b+'/logo.svg'}
  if(n['@type']==='BreadcrumbList')(n.itemListElement||[]).forEach((li,i)=>{li.item=b+'/'+(i===0?'':page==='index.html'?'':page)})}
 return out}
/* The bundle that goes online or into the .zip: every page with absolute JSON-LD (when base is known), the pages as they
   are, and robots.txt, sitemap.xml (only with base) and llms.txt. → {html, pages} where pages adds the generated files. */
function siteBundle(html,pages,{base,date}={}){const b=baseUrl(base),src={...(pages||{})},hasLogo=typeof src['logo.svg']==='string'&&!!safeLogo(src['logo.svg']);
 if(!hasLogo)delete src['logo.svg'];
 const fix=(k,h)=>{const d=readJsonLd(h);if(!d||!b)return h;return String(h).replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/,()=>scriptOf(absolutize(d,b,k,hasLogo)))};
 const index=fix('index.html',html),out={};for(const [k,v] of Object.entries(src))out[k]=/\.html$/.test(k)?fix(k,v):v;
 const all={'index.html':index,...out};
 out['robots.txt']=robotsTxt(b);const sm=sitemapXml(b,all,{date});if(sm)out['sitemap.xml']=sm;out['llms.txt']=llmsTxt(b,all);
 return {html:index,pages:out}}

// ---- the «Dati strutturati» panel of the Studio SEO e GEO ----
/* What is there and what is missing, with where to write it. o: {html (the saved site, for FAQ and services), base}.
   → {type, checks:[{id,label,ok,value,hint,optional}], data, json, problems, testUrl} */
function report(facts,o={}){const f=facts||{},data=graph(f,{page:'index.html',html:o.html,base:o.base||f.website}),read=readPage(o.html);
 const faq=faqFrom(read.sections),services=servicesFrom(read.sections),addr=postalAddress(f.place||f.legalAddress);
 const PROFILE='scrivilo nel profilo del progetto';
 const checks=[
  {id:'name',label:'Nome dell’attività',ok:!!f.name,value:f.name,hint:'Il nome del progetto.'},
  {id:'type',label:'Tipo di attività (schema.org)',ok:!!(f.type&&f.type.matched),value:f.type?f.type.type+(f.type.matched?' · '+f.type.label:''):'LocalBusiness',hint:'Non riconosciuto: uso LocalBusiness. Scrivi il tipo di attività nel profilo (es. «panificio», «studio di fisioterapia»).',optional:true},
  {id:'legalName',label:'Ragione sociale',ok:!!f.legalName,value:f.legalName,hint:'Si chiede nel riquadro «Da completare» dello Studio Sito, o '+PROFILE+' («Ragione sociale: …»).'},
  {id:'vat',label:'Partita IVA (vatID)',ok:!!f.vat,value:f.vat?'IT'+f.vat:'',hint:'Si chiede nel riquadro «Da completare» dello Studio Sito, o '+PROFILE+' («P. IVA: …»).'},
  {id:'address',label:'Indirizzo (PostalAddress)',ok:structuredAddress(addr),value:addressText(addr),hint:addr?'Scrivilo come «Via Roma 12, 24121 Bergamo (BG)» per dividerlo in via, CAP, città e provincia.':'Sede legale nel riquadro «Da completare», o «Indirizzo: …» nel profilo.'},
  {id:'telephone',label:'Telefono',ok:!!f.telephone,value:f.telephone,hint:'Il numero tra i contatti del sito o nei link del profilo.'},
  {id:'email',label:'E-mail',ok:!!f.email,value:f.email,hint:'L’e-mail tra i contatti del sito o nei link del profilo.'},
  {id:'url',label:'Indirizzo del sito (url)',ok:!!(o.base||f.website),value:o.base||f.website,hint:'Si aggiunge da solo quando il sito va online (o scrivi il sito nei link del profilo).'},
  {id:'hours',label:'Orari (openingHoursSpecification)',ok:!!(f.hours&&f.hours.length),value:hoursText(f.hours),hint:f.hoursUnread?'Orari scritti ma non leggibili: usa la forma «Orari: lun-ven 9-13, 15-19; sab 9-12».':'Facoltativo: «Orari: lun-ven 9-13, 15-19; sab 9-12» nel profilo.',optional:true},
  {id:'geo',label:'Coordinate (geo)',ok:!!f.geo,value:f.geo?f.geo.latitude+', '+f.geo.longitude:'',hint:'Facoltativo: «Coordinate: 45.6983, 9.6773» nel profilo. Non le calcolo dall’indirizzo.',optional:true},
  {id:'sameAs',label:'Profili social (sameAs)',ok:!!(f.sameAs&&f.sameAs.length),value:(f.sameAs||[]).join(' · '),hint:'Facoltativo: i link a Facebook, Instagram, LinkedIn… nei link del profilo.',optional:true},
  {id:'logo',label:'Logo (dal Kit identità)',ok:!!f.logo,value:f.logo?'logo.svg':'',hint:'Facoltativo: prepara il Kit identità del progetto.',optional:true},
  {id:'services',label:'Servizi (Service)',ok:services.length>0,value:services.map(s=>s.name).join(' · '),hint:o.html?'La sezione Servizi del sito non ha un elenco «- Nome: descrizione».':'Si leggono dalla sezione Servizi del sito salvato dallo Studio Sito.',optional:true},
  {id:'faq',label:'Domande frequenti (FAQPage)',ok:faq.length>0,value:faq.length?faq.length+' domande':'',hint:o.html?'La sezione FAQ del sito non ha domande che finiscono con «?».':'Si leggono dalla sezione FAQ del sito salvato dallo Studio Sito.',optional:true}];
 const url=baseUrl(o.base||f.website);
 return {type:f.type||businessType('',''),checks,data,json:JSON.stringify(data,null,2),problems:validate(data),testUrl:url?RICH_RESULTS+'?url='+encodeURIComponent(url+'/'):RICH_RESULTS}}

return Object.freeze({TYPES,RICH_RESULTS,businessType,parseHours,hoursText,postalAddress,baseUrl,siteFacts,withFilled,readPage,faqFrom,servicesFrom,graph,prune,validate,safeJson,scriptOf,readJsonLd,withStructuredData,robotsTxt,sitemapXml,llmsTxt,absolutize,siteBundle,safeLogo,report});
});
