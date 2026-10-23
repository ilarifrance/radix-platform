'use strict';
/* Fixture of «Confronto con i siti dei concorrenti» (lib/competitor-studio.js): four small public sites written here as
   HTML — the client Forno Aurora and three competitors — served by a fake DNS and a fake request() that the crawler of
   api/_site_audit.js takes as dependencies. No network. Also used by the screenshots, behind a local fake server.
   - www.fornoaurora.it (cliente): Bakery in JSON-LD, Instagram, telephone, email, contact form, no prices, no shop, no
     booking, last article dated 10/03/2025.
   - www.panificioverdi.it: prices in the text and in the JSON-LD offers, cart and checkout (WooCommerce), aggregate
     rating 4,6 on 128 reviews, Facebook, Instagram and TikTok, WhatsApp, newsletter form, article of 01/10/2026,
     «dal 1952», organic flours.
   - www.fornobianchi.it: «Prenota la torta» with a booking form (date field), Facebook only, no JSON-LD, no blog, free
     delivery and low prices; robots.txt keeps /riservato/ out.
   - www.pasticceriarossa.it: robots.txt asks every crawler to stay out (Disallow: /): nothing is read. */
const TODAY='2026-10-23T09:00:00.000Z';
const page=({title,description='',body,head='',nav})=>`<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>${description?`<meta name="description" content="${description}">`:''}${head}</head>
<body><header><nav>${nav}</nav></header><main>${body}</main></body></html>`;
const ld=o=>`<script type="application/ld+json">${JSON.stringify(o)}</script>`;
const fill=(n,seed)=>Array.from({length:n},(_,i)=>['pane','farina','forno','impasto','crosta','mollica','grano','acqua','sale','tempo','mani','bottega','quartiere','mattina','profumo'][(i*7+seed)%15]).join(' ');

const AURORA='https://www.fornoaurora.it';
const auroraNav='<a href="/">Home</a> <a href="/chi-siamo">Chi siamo</a> <a href="/prodotti">Prodotti</a> <a href="/blog/lievito-madre">Blog</a> <a href="/contatti">Contatti</a>';
const auroraFoot='<footer><p>Forno Aurora snc · Via Nizza 10, 10125 Torino · Tel. <a href="tel:+390115551234">011 555 1234</a> · <a href="mailto:info@fornoaurora.it">info@fornoaurora.it</a> · Capitale sociale 10.000 € i.v.</p><a href="https://www.instagram.com/fornoaurora/">Instagram</a> <a href="https://www.facebook.com/sharer/sharer.php?u=x">Condividi</a></footer>';
const AURORA_PAGES={
 '/':page({title:'Forno Aurora | Panificio a Torino',description:'Pane a lievito madre cotto nel forno a legna a San Salvario, Torino.',nav:auroraNav,
  head:ld({'@context':'https://schema.org','@type':'Bakery',name:'Forno Aurora',telephone:'+39 011 555 1234',url:AURORA+'/',address:{'@type':'PostalAddress',streetAddress:'Via Nizza 10',addressLocality:'Torino',postalCode:'10125'},openingHours:'Tu-Su 07:00-19:30',sameAs:['https://www.instagram.com/fornoaurora']}),
  body:`<h1>Il pane a lievito madre di San Salvario</h1><p>Facciamo il pane a mano con il lievito madre e lo cuociamo nel forno a legna. ${fill(80,1)}.</p><h2>I nostri prodotti</h2><h3>Pane a lievito madre</h3><p>${fill(20,2)}.</p><h3>Torte su ordinazione</h3><p>${fill(20,3)}.</p><h3>Grissini stirati a mano</h3>${auroraFoot}`}),
 '/chi-siamo':page({title:'Chi siamo - Forno Aurora',nav:auroraNav,body:`<h1>Chi siamo</h1><p>Siamo una famiglia di fornai dal 1987, con la passione per le farine piemontesi. ${fill(60,4)}.</p>${auroraFoot}`}),
 '/prodotti':page({title:'Prodotti - Forno Aurora',nav:auroraNav,body:`<h1>Prodotti</h1><h2>Pane a lievito madre</h2><p>${fill(30,5)}.</p><h2>Focaccia genovese</h2><h2>Torte su ordinazione</h2><h2>Contatti</h2>${auroraFoot}`}),
 '/contatti':page({title:'Contatti - Forno Aurora',nav:auroraNav,body:`<h1>Contatti</h1><form action="/invia" method="post"><input type="text" name="nome"><input type="email" name="email"><textarea name="messaggio"></textarea><button type="submit">Invia</button></form><p><a href="https://www.google.com/maps/place/Forno+Aurora">Come arrivare</a></p>${auroraFoot}`}),
 '/blog/lievito-madre':page({title:'Perché il lievito madre - Forno Aurora',nav:auroraNav,head:'<meta property="og:type" content="article"><meta property="article:published_time" content="2025-03-10T08:00:00+01:00">',
  body:`<article><h1>Perché il lievito madre</h1><time datetime="2025-03-10">10 marzo 2025</time><p>${fill(120,6)}.</p></article>${auroraFoot}`})};

const VERDI='https://www.panificioverdi.it';
const verdiNav='<a href="/">Home</a> <a href="/negozio">Negozio online</a> <a href="/listino">Listino prezzi</a> <a href="/blog">Blog</a> <a href="/carrello">Carrello</a>';
const verdiFoot='<footer><p>Panificio Verdi · Corso Vittorio 5, Torino · <a href="tel:0115550000">011 555 0000</a> · <a href="mailto:ordini@panificioverdi.it">ordini@panificioverdi.it</a></p><p><a href="https://www.facebook.com/panificioverdi">Facebook</a> <a href="https://instagram.com/panificioverdi">Instagram</a> <a href="https://www.tiktok.com/@panificioverdi">TikTok</a> <a href="https://wa.me/393331234567">Scrivici su WhatsApp</a></p><form class="newsletter"><input type="email" name="email" placeholder="La tua email"><button>Iscriviti alla newsletter</button></form></footer>';
const VERDI_PAGES={
 '/':page({title:'Panificio Verdi | Pane biologico a Torino dal 1952',description:'Pane con farine biologiche e consegna a domicilio a Torino.',nav:verdiNav,
  head:ld({'@context':'https://schema.org','@type':'Bakery',name:'Panificio Verdi',telephone:'011 555 0000',priceRange:'€',url:VERDI+'/',address:{'@type':'PostalAddress',streetAddress:'Corso Vittorio 5',addressLocality:'Torino'},aggregateRating:{'@type':'AggregateRating',ratingValue:'4.6',reviewCount:'128'},sameAs:['https://www.facebook.com/panificioverdi']})+'<link rel="stylesheet" href="/wp-content/plugins/woocommerce/assets/css/woocommerce.css">',
  body:`<h1>Pane biologico dal 1952</h1><p>Dal 1952 facciamo il pane solo con farine biologiche del territorio. Consegna a domicilio in giornata in tutta Torino. ${fill(70,7)}.</p>${verdiFoot}`}),
 '/listino':page({title:'Listino prezzi - Panificio Verdi',nav:verdiNav,body:`<h1>Listino prezzi</h1><ul><li>Pane di grano duro al kg: € 3,80</li><li>Focaccia ligure al kg – 12,50 €</li><li>Grissini torinesi 250 g € 2,90</li><li>Torta di nocciole 1.250,00 euro per evento (24 porzioni)</li></ul>${verdiFoot}`}),
 '/negozio':page({title:'Negozio online - Panificio Verdi',nav:verdiNav,
  head:ld({'@context':'https://schema.org','@type':'Product',name:'Box colazione',offers:{'@type':'Offer',price:'18.00',priceCurrency:'EUR'}}),
  body:`<h1>Negozio online</h1><h2>Box colazione</h2><p>Prezzo 18,00 €</p><button class="single_add_to_cart_button">Aggiungi al carrello</button><h2>Panettone artigianale</h2><a href="/checkout">Vai alla cassa</a>${verdiFoot}`}),
 '/blog':page({title:'Blog - Panificio Verdi',nav:verdiNav,body:`<h1>Blog</h1><a href="/blog/2026/10/farine-nuove">Le farine nuove</a>${verdiFoot}`}),
 '/blog/2026/10/farine-nuove':page({title:'Le farine nuove - Panificio Verdi',nav:verdiNav,head:'<meta property="og:type" content="article">'+ld({'@context':'https://schema.org','@type':'BlogPosting',headline:'Le farine nuove',datePublished:'2026-10-01'}),
  body:`<article><h1>Le farine nuove</h1><p>${fill(150,8)}.</p></article>${verdiFoot}`}),
 '/carrello':page({title:'Carrello - Panificio Verdi',nav:verdiNav,body:'<h1>Carrello</h1><p>Il carrello è vuoto.</p>'+verdiFoot})};

const BIANCHI='https://www.fornobianchi.it';
const bianchiNav='<a href="/">Home</a> <a href="/servizi">Servizi</a> <a href="/prenota">Prenota la torta</a> <a href="/riservato/area">Area clienti</a>';
const bianchiFoot='<footer><p>Forno Bianchi · Via Roma 1, Moncalieri · Tel. 011 640 1234</p><a href="https://www.facebook.com/fornobianchi">Facebook</a></footer>';
const BIANCHI_PAGES={
 '/':page({title:'Forno Bianchi - Moncalieri',nav:bianchiNav,body:`<h1>Il forno di Moncalieri</h1><p>Prezzi bassi tutti i giorni e consegna gratuita sopra i 30 euro. ${fill(40,9)}.</p><h2>I nostri servizi</h2><h3>Torte per feste</h3><h3>Catering per uffici</h3>${bianchiFoot}`}),
 '/servizi':page({title:'Servizi - Forno Bianchi',nav:bianchiNav,body:`<h1>Servizi</h1><h2>Torte per feste</h2><h2>Catering per uffici</h2><h2>Pane per ristoranti</h2>${bianchiFoot}`}),
 '/prenota':page({title:'Prenota la torta - Forno Bianchi',nav:bianchiNav,body:`<h1>Prenota la torta</h1><form action="/prenota/invia"><input type="text" name="nome"><input type="date" name="giorno"><input type="tel" name="telefono"><button type="submit">Prenota</button></form>${bianchiFoot}`}),
 '/riservato/area':page({title:'Area clienti',nav:bianchiNav,body:'<h1>Area riservata</h1>'})};

const SITES={
 'www.fornoaurora.it':{origin:AURORA,pages:AURORA_PAGES,robots:'User-agent: *\nDisallow:\n'},
 'www.panificioverdi.it':{origin:VERDI,pages:VERDI_PAGES,robots:'User-agent: *\nDisallow: /wp-admin/\nSitemap: '+VERDI+'/sitemap.xml\n',sitemap:['/','/listino','/negozio','/blog']},
 'www.fornobianchi.it':{origin:BIANCHI,pages:BIANCHI_PAGES,robots:'User-agent: *\nDisallow: /riservato/\n'},
 'www.pasticceriarossa.it':{origin:'https://www.pasticceriarossa.it',pages:{'/':page({title:'Pasticceria Rossa',nav:'<a href="/">Home</a>',body:'<h1>Pasticceria Rossa</h1><p>Prezzi da 2,00 €</p>'})},robots:'User-agent: *\nDisallow: /\n'}};
const ADDRESSES={'www.fornoaurora.it':'93.184.216.34','www.panificioverdi.it':'93.184.216.35','www.fornobianchi.it':'93.184.216.36','www.pasticceriarossa.it':'93.184.216.37'};
const html=b=>({status:200,headers:{'content-type':'text/html; charset=utf-8'},body:Buffer.from(b)});
// The whole web of the fixture: URL → response. Bare domains redirect to www.
function routes(){const R={};
 for(const [host,s] of Object.entries(SITES)){for(const [p,b] of Object.entries(s.pages))R[s.origin+p]=html(b);
  R[s.origin+'/robots.txt']={status:200,headers:{'content-type':'text/plain'},body:Buffer.from(s.robots)};
  if(s.sitemap)R[s.origin+'/sitemap.xml']={status:200,headers:{'content-type':'application/xml'},body:Buffer.from('<?xml version="1.0"?><urlset>'+s.sitemap.map(p=>'<url><loc>'+s.origin+p+'</loc></url>').join('')+'</urlset>')};
  const bare='https://'+host.replace(/^www\./,'');R[bare+'/']={status:301,headers:{location:s.origin+'/'}};R[bare+'/robots.txt']={status:301,headers:{location:s.origin+'/robots.txt'}}}
 return R}
// lookup() and request() for api/_site_audit.js crawl(); records the calls.
function fakeWeb({extra}={}){const calls=[],R={...routes(),...(extra||{})};
 const lookup=async host=>{const h=String(host).replace(/^www\./,'');const a=ADDRESSES[host]||ADDRESSES['www.'+h];if(!a){const e=new Error('ENOTFOUND');e.code='ENOTFOUND';throw e}return [{address:a,family:4}]};
 const request=async(url,opts)=>{calls.push({url,method:opts.method||'GET'});let r=R[url];if(typeof r==='function')r=r(url,opts);
  if(!r)r={status:404,headers:{'content-type':'text/html'},body:Buffer.from('<html><body><h1>Pagina non trovata</h1></body></html>')};
  return {transferBytes:r.body?r.body.length:0,truncated:false,...r,body:(opts.method==='HEAD'||!r.body)?Buffer.alloc(0):r.body}};
 return {lookup,request,calls,routes:R}}
// The four crawls the studio reads, in «concorrenza» mode, with a fixed clock.
async function crawls(A){const web=fakeWeb(),out=[];let t=Date.parse(TODAY);const now=()=>(t+=40);
 for(const u of ['www.fornoaurora.it','www.panificioverdi.it','www.fornobianchi.it','www.pasticceriarossa.it'])out.push(await A.crawl(u,{lookup:web.lookup,request:web.request,env:{},now,mode:'concorrenza'}));
 return {web,crawls:out}}
const SITE_LIST=[{name:'Forno Aurora',url:'www.fornoaurora.it',role:'cliente'},{name:'Panificio Verdi',url:'www.panificioverdi.it',role:'concorrente'},
 {name:'Forno Bianchi',url:'https://www.fornobianchi.it',role:'concorrente'},{name:'Pasticceria Rossa',url:'pasticceriarossa.it',role:'concorrente'}];
// The Kit identità of the monthly report's fixture (logo and palette), with the project's own site among the links.
const PROFILE={...require('../report-studio-fixtures.js').PROFILE,links:'Sito: https://www.fornoaurora.it · Instagram: https://instagram.com/fornoaurora'};
module.exports={TODAY,SITES,ADDRESSES,AURORA,VERDI,BIANCHI,fakeWeb,routes,crawls,SITE_LIST,PROFILE,page};
