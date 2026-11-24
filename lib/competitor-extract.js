/* «Confronto con i siti dei concorrenti» (agency job S3): what one public HTML page shows about an offer, read without AI.
   extractMarket(html,url) is pure and small: api/_site_audit.js runs it on every page of a crawl in «concorrenza» mode
   (the same crawler, limits and robots.txt of «Analisi del sito»), lib/competitor-studio.js reads its output.
   It keeps only what is written in the page, never a guess:
   - nav: the labels of the first <nav> (or <header>) links: the sections of the site;
   - items: the services or products listed: names of JSON-LD Product, Service, MenuItem and OfferCatalog entries, the
     h2/h3 of a page whose address or title says servizi, prodotti, menu, listino, trattamenti, catalogo, shop…, and the
     h3 under an h2 that says so on other pages;
   - prices: the amounts in euro written in the visible text («€ 3,80», «12,50 euro») with the line they are in, and the
     prices of JSON-LD offers; lines about share capital («capitale sociale», «i.v.») are skipped;
   - forms: how many <form> and of which kind (contatto, newsletter, prenotazione, ricerca, accesso, altro);
   - booking: links and buttons that say «prenota», «prenotazione», «book now» or point at a booking service (TheFork,
     Calendly, Treatwell…), and forms with a date or time field;
   - shop: «aggiungi al carrello», «add to cart», links to a cart or a checkout, the e-commerce platform in the code
     (Shopify, WooCommerce, PrestaShop, Magento) and JSON-LD Product with an offer;
   - social: links to the profiles on Facebook, Instagram, TikTok, LinkedIn, YouTube, X, Pinterest, Tripadvisor (share
     buttons are not profiles); whatsapp: links to wa.me or WhatsApp; maps: links to Google Maps;
   - dates: the dates of the page from article:published_time / modified_time, <time datetime>, JSON-LD datePublished
     and dateModified, and /2026/10/ in the address (only the month when the address has no day: «2026-10»); article: whether the page is an article (og:type, JSON-LD type or
     the address);
   - ld: the schema.org types with their fields, the products with their offers, the aggregate rating if published;
   - prices skip shipping thresholds («consegna gratuita sopra i 30 €»);
   - claims and tone: sentences of 6 words or more that make a claim (storia, artigianale, qualità, naturale, prezzo, servizio, primato,
     famiglia, innovazione, esclusivo: fixed word lists in CLAIMS) and how many sentences use each group.
   Every list is capped: a page gives at most a few kilobytes. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixCompetitorExtract=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const clean=s=>String(s==null?'':s).replace(/[\s ]+/g,' ').trim();
const cut=(s,n)=>{const a=[...String(s||'')];return a.length>n?a.slice(0,n-1).join('').trimEnd()+'…':String(s||'')};
const ENT={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',agrave:'à',aacute:'á',egrave:'è',eacute:'é',igrave:'ì',iacute:'í',ograve:'ò',oacute:'ó',ugrave:'ù',uacute:'ú',
 rsquo:'’',lsquo:'‘',ldquo:'“',rdquo:'”',ndash:'–',mdash:'—',hellip:'…',laquo:'«',raquo:'»',copy:'©',reg:'®',euro:'€',middot:'·',bull:'•',deg:'°'};
const decode=s=>String(s==null?'':s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi,(m,e)=>{const k=e.toLowerCase();
 if(k[0]==='#'){const n=k[1]==='x'?parseInt(k.slice(2),16):parseInt(k.slice(1),10);return n>0&&n<0x110000?String.fromCodePoint(n):''}
 return Object.prototype.hasOwnProperty.call(ENT,k)?ENT[k]:Object.prototype.hasOwnProperty.call(ENT,e)?ENT[e]:m});
const ATTR=/([^\s=\/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
function attrsOf(s){const out={};let m;ATTR.lastIndex=0;while((m=ATTR.exec(s||''))){const k=m[1].toLowerCase();if(!(k in out))out[k]=decode(m[2]!=null?m[2]:m[3]!=null?m[3]:m[4]!=null?m[4]:'')}return out}
const textOf=s=>clean(decode(String(s||'').replace(/<[^>]*>/g,' ')));
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');

// ---- word lists (fixed, shown in the method note of the studio) ----
const SOCIAL=Object.freeze([['facebook','Facebook',/(?:^|\.)(?:facebook|fb)\.com$/],['instagram','Instagram',/(?:^|\.)instagram\.com$/],['tiktok','TikTok',/(?:^|\.)tiktok\.com$/],
 ['linkedin','LinkedIn',/(?:^|\.)linkedin\.com$/],['youtube','YouTube',/(?:^|\.)youtube\.com$|^youtu\.be$/],['x','X',/(?:^|\.)(?:twitter|x)\.com$/],
 ['pinterest','Pinterest',/(?:^|\.)pinterest\.[a-z.]+$/],['tripadvisor','Tripadvisor',/(?:^|\.)tripadvisor\.[a-z.]+$/]].map(Object.freeze));
const SHARE=/sharer|\/share\b|\/share\?|intent\/|\/dialog\/|sharearticle|\/plugins\/|\/hashtag\//i;
const BOOKING_HOSTS=/(?:^|\.)(?:thefork\.[a-z.]+|quandoo\.[a-z.]+|opentable\.[a-z.]+|booking\.com|calendly\.com|treatwell\.[a-z.]+|fresha\.com|uala\.[a-z.]+|miodottore\.it|doctolib\.[a-z.]+|setmore\.com|simplybook\.[a-z.]+|youcanbook\.me|acuityscheduling\.com|planity\.com|resy\.com|sevenrooms\.com|zenchef\.com|bookinglab\.[a-z.]+)$/;
const BOOKING_WORDS=/\bprenot(?:a|i|are|azione|azioni)\b|\bbook now\b|\bbook a table\b|\bfissa (?:un |l’|l')appuntamento\b|\bappuntamento online\b/i;
const CART_WORDS=/aggiungi al carrello|add to cart|aggiungi alla borsa|acquista ora|compra ora|buy now|vai alla cassa|procedi all.ordine/i;
const CART_PATH=/(?:^|\/)(?:cart|carrello|checkout|cassa|basket)(?:\/|$)/i;
const PLATFORMS=Object.freeze([['Shopify',/cdn\.shopify\.com|shopify\.theme|myshopify\.com/i],['WooCommerce',/woocommerce|wc-ajax|wc-block/i],['PrestaShop',/prestashop/i],['Magento',/mage\/cookies|magento/i],['Wix Stores',/wixstores|wix-ecommerce/i]].map(Object.freeze));
const LISTING=/serviz|prodott|\bmenu\b|listino|trattament|catalog|\bshop\b|negozio online|offert|specialit|cosa facciamo|le nostre (?:torte|proposte)|prezzi|tariff/i;
const NOT_ITEM=/^(?:contatt|chi siamo|dove siamo|orari|seguici|newsletter|iscriv|faq|domande|recension|cookie|privacy|blog|news|home)/i;
const THRESHOLD=/(?:sopra|oltre|superior[ei] a|spesa minima|minimo d.ordine|ordini? (?:da|sopra|oltre|superiori)|a partire da (?:un|una) (?:spesa|ordine))\s*(?:i|di|a|ai)?\s*$/i;
const CAPITAL=/capitale sociale|\bi\.\s?v\.|interamente versato|\bp\.?\s?iva\b|codice fiscale|\brea\b/i;
const CLAIMS=Object.freeze([
 ['storia','Storia e anni di attività',/\bdal (?:19|20)\d\d\b|\bda (?:oltre |più di |piu di )?\d{1,3} anni\b|\bgenerazion|\bfondat[oa] nel\b/i],
 ['artigianale','Artigianale e fatto a mano',/artigian|fatt[oaie] a mano|fatto in casa|lievito madre|forno a legna|lavorazione manuale/i],
 ['qualita','Qualità e materie prime',/qualit[aà]|eccellen|selezionat|materie prime|ingredienti (?:freschi|scelti|migliori)/i],
 ['naturale','Naturale, bio e territorio',/biologic|\bbio\b|natural[ei]|km ?0|chilometro zero|filiera|sostenibil|del territorio|a km/i],
 ['prezzo','Prezzo e convenienza',/prezz[oi] (?:bass|conven|onest|access|imbattibil)|convenien|scont[oi]|risparmi|offert[ae] (?:speciale|del giorno|della settimana)|sottocosto/i],
 ['servizio','Servizio e consegna',/consegna (?:gratuita|a domicilio|in giornata|rapida)|spedizion[ei] gratuit|a domicilio|su misura|personalizzat|su ordinazione|in 24 ?ore|garanzi|assistenza/i],
 ['primato','Primati, premi e certificazioni',/\bleader\b|\bn[°º.]? ?1\b|numero uno|il migliore|la migliore|i migliori|premiat|\bpremio\b|certificat|award/i],
 ['famiglia','Famiglia, passione, tradizione',/famigli|passione|tradizion|con amore|\bcuore\b/i],
 ['innovazione','Innovazione e tecnologia',/innovativ|innovazion|tecnologi|all.avanguardia/i],
 ['esclusivo','Esclusivo e di lusso',/esclusiv|lusso|\bpremium\b|raffinat|eleganz/i]].map(Object.freeze));
const BUSINESS_SKIP=/^(?:WebSite|WebPage|BreadcrumbList|ListItem|SearchAction|ImageObject|Person|PostalAddress|GeoCoordinates|OpeningHoursSpecification|ContactPoint|EntryPoint|Offer|AggregateOffer|AggregateRating|Rating|Review|Answer|Question|FAQPage|ItemList|SiteNavigationElement|CollectionPage|ReadAction|WPHeader|WPFooter|Thing|Product|Service|MenuItem|Menu|MenuSection|OfferCatalog|Article|BlogPosting|NewsArticle|Blog)$/;
const ARTICLE_TYPES=/^(?:Article|BlogPosting|NewsArticle|Blog|Report)$/;

// «3,80» «1.250,00» «3.80» «12» → number, or null
function amount(s){let t=String(s||'').trim();if(!t)return null;
 if(/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(t))t=t.replace(/\./g,'').replace(',','.');else if(/^\d+,\d{1,2}$/.test(t))t=t.replace(',','.');else if(!/^\d+(?:\.\d{1,2})?$/.test(t))return null;
 const n=Number(t);return Number.isFinite(n)&&n>0&&n<100000?Math.round(n*100)/100:null}
const PRICE=/(?:€|\bEUR\b)\s?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?![\d])|(?<![\d.,])(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s?(?:€|euro\b|\bEUR\b)/gi;
const fmtEuro=v=>{const [i,f]=v.toFixed(2).split('.');return i.replace(/\B(?=(\d{3})+(?!\d))/g,'.')+(f==='00'?'':','+f)+' €'};
function isoDay(v){const s=String(v||'').trim(),m=/^(\d{4})-(\d{2})-(\d{2})/.exec(s);if(!m)return '';const y=+m[1],mo=+m[2],d=+m[3];if(y<2000||y>2100||mo<1||mo>12||d<1||d>31)return '';return m[1]+'-'+m[2]+'-'+m[3]}

// html: the page as fetched; url: where it was fetched. → the facts, all capped.
function extractMarket(html,url){let base;try{base=new URL(url)}catch(e){base=null}
 const abs=h=>{try{const u=new URL(String(h||'').trim(),base||undefined);u.hash='';return u}catch(e){return null}};
 let src=String(html||'').replace(/<!--[\s\S]*?-->/g,'');const raw=src;
 const ld=[];src=src.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi,(m,a,body)=>{if(/ld\+json/i.test(attrsOf(a).type||''))ld.push(body);return ' '});
 src=src.replace(/<(style|noscript|template|svg|iframe)\b[\s\S]*?<\/\1\s*>/gi,' ');
 const metas=[];src.replace(/<meta\b([^>]*)>/gi,(m,a)=>{metas.push(attrsOf(a));return m});
 const meta=k=>{const x=metas.find(m=>String(m.property||m.name||'').toLowerCase()===k);return x?clean(x.content):''};
 const titleTag=textOf((/<title[^>]*>([\s\S]*?)<\/title\s*>/i.exec(src)||[])[1]||'');
 const body=(/<body[\s>][\s\S]*$/i.exec(src)||[src])[0];
 const path=base?base.pathname.toLowerCase():'';
 // anchors and buttons, with their text
 const anchors=[];body.replace(/<(a|button)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi,(m,tag,a,inner)=>{const at=attrsOf(a);anchors.push({tag:tag.toLowerCase(),href:String(at.href||'').trim(),text:cut(textOf(inner)||clean(at['aria-label']||at.title||''),80),cls:String(at.class||'')});return m});
 body.replace(/<input\b([^>]*)>/gi,(m,a)=>{const at=attrsOf(a);if(/^(?:submit|button)$/i.test(at.type||''))anchors.push({tag:'button',href:'',text:cut(clean(at.value||''),80),cls:String(at.class||'')});return m});
 // nav: the first <nav>, else the <header>
 const navHtml=(/<nav\b[^>]*>([\s\S]*?)<\/nav\s*>/i.exec(body)||/<header\b[^>]*>([\s\S]*?)<\/header\s*>/i.exec(body)||[])[1]||'';
 const nav=[];navHtml.replace(/<a\b[^>]*>([\s\S]*?)<\/a\s*>/gi,(m,inner)=>{const t=cut(textOf(inner),40);if(t&&!nav.includes(t)&&nav.length<20)nav.push(t);return m});
 // social, whatsapp, maps, booking and shop links
 const social=[],booking=[],shop=[];let whatsapp='',maps='';
 const addEv=(list,ev)=>{if(list.length<5&&!list.some(x=>x.text===ev.text&&x.href===ev.href))list.push(ev)};
 for(const a of anchors){const u=a.href&&!/^(?:#|javascript:|mailto:|tel:)/i.test(a.href)?abs(a.href):null,host=u&&/^https?:$/.test(u.protocol)?u.hostname.toLowerCase().replace(/^www\./,''):'';
  if(/^whatsapp:/i.test(a.href)||/^(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)$/.test(host)){if(!whatsapp)whatsapp=cut(a.href,200);continue}
  if(host&&(/^(?:google\.[a-z.]+|maps\.google\.[a-z.]+|goo\.gl|maps\.app\.goo\.gl)$/.test(host))&&/maps|goo\.gl/.test(u.href)){if(!maps)maps=cut(u.href,200);continue}
  const net=host&&SOCIAL.find(s=>s[2].test(host));
  if(net){if(!SHARE.test(u.pathname+u.search)&&u.pathname.replace(/\/+$/,'')!==''&&social.length<12){const href=cut(u.origin+u.pathname.replace(/\/+$/,''),200);if(!social.some(s=>s.href===href))social.push({network:net[0],href})}continue}
  const bookHost=host&&BOOKING_HOSTS.test(host);
  if((u||a.tag==='button')&&(bookHost||BOOKING_WORDS.test(a.text)))addEv(booking,{text:a.text||host,href:u?cut(u.href,200):''});
  if(CART_WORDS.test(a.text)||(u&&base&&u.hostname===base.hostname&&CART_PATH.test(u.pathname)))addEv(shop,{text:a.text||u.pathname,href:u?cut(u.href,200):''})}
 for(const [name,re] of PLATFORMS)if(re.test(raw)){addEv(shop,{text:'Piattaforma '+name,href:''});break}
 // forms
 const forms=[];body.replace(/<form\b([^>]*)>([\s\S]*?)<\/form\s*>/gi,(m,a,inner)=>{const inputs=[];inner.replace(/<(input|textarea|select)\b([^>]*)>/gi,(x,t,ia)=>{const at=attrsOf(ia);inputs.push({tag:t.toLowerCase(),type:String(at.type||'text').toLowerCase(),name:String(at.name||at.id||'').toLowerCase()});return x});
  const words=norm(textOf(inner)+' '+(attrsOf(a).action||'')+' '+(attrsOf(a).class||'')+' '+(attrsOf(a).id||'')),visible=inputs.filter(i=>!/^(?:hidden|submit|button)$/.test(i.type));
  const kind=visible.some(i=>i.type==='password')?'accesso':visible.some(i=>/^(?:date|datetime-local|time)$/.test(i.type))||/prenot/.test(words)?'prenotazione':
   visible.some(i=>i.type==='search'||/^(?:q|s|search|query|cerca)$/.test(i.name))&&!visible.some(i=>i.tag==='textarea')?'ricerca':
   visible.some(i=>i.tag==='textarea')||/messaggi|contatt|richiest|preventiv/.test(words)?'contatto':
   visible.some(i=>i.type==='email'||/mail/.test(i.name))&&visible.length<=3&&/newsletter|iscriv|subscribe/.test(words)?'newsletter':'altro';
  if(forms.length<8)forms.push(kind);if(kind==='prenotazione')addEv(booking,{text:'Modulo di prenotazione',href:base?cut(base.href,200):''});return m});
 // JSON-LD: types with their fields, products and offers, rating, dates
 const types=[],items=[],offers=[],dates=[];let rating=null,isArticle=false,business=null;
 const walk=(x,d)=>{if(!x||typeof x!=='object'||d>8)return;if(Array.isArray(x)){x.forEach(y=>walk(y,d+1));return}
  const t=[].concat(x['@type']||[]).map(String).filter(Boolean);
  if(t.length){const fields=Object.keys(x).filter(k=>!/^@/.test(k)).slice(0,24);if(types.length<12)types.push({type:t[0],fields});
   if(!business&&!t.every(v=>BUSINESS_SKIP.test(v)))business={type:t.find(v=>!BUSINESS_SKIP.test(v)),fields,priceRange:cut(clean(x.priceRange),40)};
   if(t.some(v=>ARTICLE_TYPES.test(v)))isArticle=true;
   if(t.some(v=>/^(?:Product|Service|MenuItem)$/.test(v))){const n=cut(textOf(x.name||(x.itemOffered&&x.itemOffered.name)||''),80);if(n&&items.length<30&&!items.includes(n))items.push(n);
    for(const o of [].concat(x.offers||[])){if(!o||typeof o!=='object')continue;const v=amount(String(o.price!=null?o.price:o.lowPrice!=null?o.lowPrice:'').replace(/^(\d+)\.(\d{1,2})$/,'$1,$2'));
     if(v!=null&&offers.length<20)offers.push({name:n,value:v,currency:clean(o.priceCurrency||'EUR').slice(0,4)})}}
   ['datePublished','dateModified','uploadDate'].forEach(k=>{const iso=isoDay(x[k]);if(iso&&dates.length<6)dates.push({iso,source:'json-ld '+k})})}
  const ar=x.aggregateRating;if(ar&&typeof ar==='object'&&!rating){const v=Number(String(ar.ratingValue).replace(',','.')),c=Number(ar.reviewCount!=null?ar.reviewCount:ar.ratingCount);if(Number.isFinite(v)&&v>0)rating={value:Math.round(v*10)/10,count:Number.isFinite(c)?c:null,best:Number(ar.bestRating)||5}}
  if(t.includes('OfferCatalog')||t.includes('ItemList')){for(const e of [].concat(x.itemListElement||[])){const it=e&&typeof e==='object'?(e.item||e.itemOffered||e):null;const n=it&&cut(textOf(it.name||''),80);if(n&&items.length<30&&!items.includes(n)&&t.includes('OfferCatalog'))items.push(n)}}
  for(const [k,v] of Object.entries(x))if(k!=='@context'&&v&&typeof v==='object')walk(v,d+1)};
 let ldErrors=0;for(const s of ld){let j;try{j=JSON.parse(String(s).trim().replace(/^<!\[CDATA\[|\]\]>$/g,''))}catch(e){ldErrors++;continue}walk(j,0)}
 // dates of the page
 ['article:published_time','article:modified_time','og:updated_time'].forEach(k=>{const iso=isoDay(meta(k));if(iso&&dates.length<8)dates.push({iso,source:k})});
 body.replace(/<time\b([^>]*)>/gi,(m,a)=>{const iso=isoDay(attrsOf(a).datetime);if(iso&&dates.length<8)dates.push({iso,source:'time'});return m});
 const um=/\/(20\d\d)\/(0[1-9]|1[0-2])(?:\/(0[1-9]|[12]\d|3[01]))?\//.exec(path);if(um&&dates.length<8)dates.push({iso:um[1]+'-'+um[2]+(um[3]?'-'+um[3]:''),source:'indirizzo'});
 if(/^article$/i.test(meta('og:type'))||/(?:^|\/)(?:blog|news|notizie|articoli?|magazine)\/[^/]+/.test(path))isArticle=true;
 // headings in order: services and products listed
 const heads=[];body.replace(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi,(m,l,inner)=>{const t=cut(textOf(inner),80);if(t)heads.push({level:+l,text:t});return m});
 const listingPage=LISTING.test(path.replace(/[-_/]/g,' '))||LISTING.test(titleTag)||heads.some(h=>h.level===1&&LISTING.test(h.text));
 const pushItem=t=>{if(t&&!NOT_ITEM.test(norm(t))&&!/\?$/.test(t)&&items.length<30&&!items.includes(t))items.push(t)};
 if(listingPage)heads.filter(h=>h.level>1&&!LISTING.test(h.text)).forEach(h=>pushItem(h.text));
 else{let inList=false;for(const h of heads){if(h.level<=2){inList=h.level===2&&LISTING.test(h.text);continue}if(inList)pushItem(h.text)}}
 // the visible text, line by line: prices, claims, tone
 const lines=decode(body.replace(/<(?:br|\/p|\/li|\/h\d|\/div|\/td|\/tr|\/section|\/article|\/dd|\/dt|\/figcaption|\/option|\/button|\/a)\b[^>]*>/gi,'\n').replace(/<[^>]*>/g,' ')).split('\n').map(clean).filter(Boolean);
 const prices=[];
 for(const line of lines){if(CAPITAL.test(line))continue;PRICE.lastIndex=0;let m;
  while((m=PRICE.exec(line))&&prices.length<20){const v=amount(m[1]||m[2]);if(v==null)continue;const before=clean(line.slice(0,m.index).replace(/[:\-–—·|]+\s*$/,''));if(THRESHOLD.test(before))continue;
   const ctx=clean(before.split(/[.!?;]\s+/).pop()||'');prices.push({value:v,text:fmtEuro(v),context:cut(ctx||before||line,90)})}}
 offers.forEach(o=>{if(prices.length<24&&/^EUR$/i.test(o.currency)&&!prices.some(p=>p.value===o.value))prices.push({value:o.value,text:fmtEuro(o.value),context:cut(o.name||'Offerta nel JSON-LD',90),source:'json-ld'})});
 const sentences=lines.flatMap(l=>l.split(/(?<=[.!?])\s+/)).map(clean).filter(s=>s.length>=12);
 const tone={},claims=[];
 for(const s of sentences){if(s.length>220||s.split(' ').length<6)continue;const groups=CLAIMS.filter(c=>c[2].test(s)).map(c=>c[0]);groups.forEach(id=>{tone[id]=(tone[id]||0)+1});
  if(groups.length&&claims.length<12&&!claims.some(c=>c.text===s))claims.push({group:groups[0],groups,text:cut(s,180)})}
 const words=sentences.join(' ').split(' ').filter(w=>/[\p{L}\p{N}]/u.test(w)).length;
 return {title:cut(titleTag,120),nav,items,prices,forms,booking,shop,social,whatsapp,maps,dates,article:isArticle,
  ld:{types,business,rating,errors:ldErrors},claims,tone,words}}

return Object.freeze({SOCIAL,CLAIMS,BOOKING_HOSTS,PLATFORMS,LISTING,amount,fmtEuro,isoDay,decode,extractMarket});
});
