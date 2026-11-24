'use strict';
// A fake website for the «Analisi del sito» tests: www.fornoaurora.it, a bakery in Turin with the usual problems
// (a long title, duplicate titles, a page without description, two H1, a broken link, a redirect, an image without alt,
// an http:// image, a different phone number on the contacts page, a JSON-LD block that does not parse, GPTBot blocked).
// No network: fakeSite() returns the lookup() and request() the crawler takes as dependencies, and records every call.
const ORIGIN='https://www.fornoaurora.it';
const page=({title,description,h1=[],body='',head='',lang='it'})=>`<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">${title!=null?`<title>${title}</title>`:''}${description!=null?`<meta name="description" content="${description}">`:''}${head}</head>
<body><header><nav><a href="/">Home</a> <a href="/chi-siamo">Chi siamo</a> <a href="/prodotti">Prodotti</a> <a href="/torte">Torte</a> <a href="/contatti">Contatti</a> <a href="/blog/pane-lievito-madre">Blog</a></nav></header>
<main>${h1.map(h=>`<h1>${h}</h1>`).join('')}${body}</main>
<footer><p>Forno Aurora snc · Via Nizza 10, 10125 Torino · Tel. <a href="tel:+390115551234">011 555 1234</a> · <a href="mailto:info@fornoaurora.it">info@fornoaurora.it</a> · P.IVA 01234567890</p>
<a href="https://www.instagram.com/fornoaurora">Instagram</a> <a href="/privacy">Privacy</a></footer></body></html>`;
const words=(n,seed)=>Array.from({length:n},(_,i)=>['pane','lievito','madre','forno','legna','farine','piemontesi','torte','colazioni','quartiere','San','Salvario','Torino','grissini','focaccia'][(i*7+seed)%15]).join(' ');
const LD_HOME=JSON.stringify({'@context':'https://schema.org','@graph':[{'@type':'Bakery','name':'Forno Aurora','telephone':'+39 011 555 1234','url':ORIGIN+'/',
 'address':{'@type':'PostalAddress','streetAddress':'Via Nizza 10','addressLocality':'Torino','postalCode':'10125','addressCountry':'IT'},'openingHours':'Tu-Su 07:00-19:30','sameAs':['https://www.instagram.com/fornoaurora']},
 {'@type':'WebSite','name':'Forno Aurora','url':ORIGIN+'/'}]});
const PAGES={
 '/':page({title:'Forno Aurora | Panificio artigianale a Torino con forno a legna dal 1987',description:'Pane a lievito madre cotto nel forno a legna, torte su ordinazione e colazioni a Torino, quartiere San Salvario. Aperti anche la domenica mattina.',
  h1:['Il pane a lievito madre di San Salvario'],head:`<link rel="canonical" href="${ORIGIN}/"><meta property="og:title" content="Forno Aurora"><meta property="og:description" content="Panificio artigianale a Torino"><meta property="og:image" content="${ORIGIN}/og.jpg"><meta name="twitter:card" content="summary_large_image"><script type="application/ld+json">${LD_HOME}</script>`,
  body:`<p>${words(320,1)}</p><img src="/img/forno.jpg" alt="Il forno a legna"><img src="/img/pane.jpg"><img src="http://cdn.fornoaurora.it/vetrina.jpg" alt="Vetrina">
  <a href="/old-prodotti">Vecchi prodotti</a> <a href="/pagina-rotta">Offerte</a> <a href="/area-riservata/ordini">Area riservata</a> <a href="https://www.google.com/maps">Mappa</a> <a href="/menu.pdf">Listino PDF</a><script src="/app.js"></script>`}),
 '/chi-siamo':page({title:'Chi siamo - Forno Aurora',h1:['Chi siamo','La nostra storia'],head:`<link rel="canonical" href="${ORIGIN}/chi-siamo">`,body:`<p>${words(260,2)}</p>`}),
 '/prodotti':page({title:'Prodotti - Forno Aurora',description:'I nostri prodotti.',h1:['Prodotti'],head:`<link rel="canonical" href="${ORIGIN}/prodotti">`,body:`<p>${words(90,3)}</p><img src="/img/a.jpg"><img src="/img/b.jpg">`}),
 '/torte':page({title:'Prodotti - Forno Aurora',description:'Torte su ordinazione per compleanni e ricorrenze a Torino, da ordinare con due giorni di anticipo.',h1:['Torte su ordinazione'],head:`<link rel="canonical" href="${ORIGIN}/torte"><script type="application/ld+json">{"@type": "Product", broken</script>`,body:`<p>${words(300,4)}</p>`}),
 '/contatti':page({title:'Contatti - Forno Aurora',description:'Dove siamo e come contattarci: Via Nizza 10, Torino.',h1:['Contatti'],head:`<link rel="canonical" href="${ORIGIN}/contatti">`,body:`<p>Chiamaci al <a href="tel:0115559999">011 555 9999</a> oppure scrivi. ${words(120,5)}</p>`}),
 '/blog/pane-lievito-madre':page({title:'Perché il pane a lievito madre dura di più - Forno Aurora',description:'Lievito madre e lievitazioni lunghe: cosa cambia nel pane, quanto si conserva e come conservarlo a casa.',h1:['Perché il pane a lievito madre dura di più'],
  head:`<link rel="canonical" href="${ORIGIN}/blog/pane-lievito-madre"><meta name="author" content="Luca Bianchi"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":"Perché il pane a lievito madre dura di più","author":{"@type":"Person","name":"Luca Bianchi"}}</script>`,
  body:`<h2>Quanto si conserva il pane a lievito madre?</h2><p>${words(200,6)}</p><h2>Come si conserva a casa?</h2><p>${words(200,7)}</p><h2>Il lievito madre è più digeribile?</h2><p>${words(150,8)}</p>`}),
 '/servizi/catering':page({title:'Catering per uffici - Forno Aurora',description:'Vassoi di focaccia e grissini per riunioni e eventi in ufficio a Torino.',h1:['Catering per uffici'],head:`<link rel="canonical" href="${ORIGIN}/servizi/catering">`,body:`<p>${words(280,9)}</p>`}),
 '/privacy':page({title:'Privacy - Forno Aurora',description:'Informativa privacy.',h1:['Privacy'],head:'<meta name="robots" content="noindex, follow">',body:`<p>${words(400,10)}</p>`})
};
const ROBOTS='User-agent: *\nDisallow: /area-riservata/\n\nUser-agent: GPTBot\nDisallow: /\n\nSitemap: '+ORIGIN+'/sitemap.xml\n';
const SITEMAP='<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+['/','/chi-siamo','/prodotti','/torte','/contatti','/servizi/catering','/blog/pane-lievito-madre'].map(p=>'<url><loc>'+ORIGIN+p+'</loc></url>').join('')+'</urlset>';
const html=b=>({status:200,headers:{'content-type':'text/html; charset=utf-8','strict-transport-security':'max-age=31536000'},body:Buffer.from(b)});
// hosts: name → addresses (all public unless a test says otherwise); routes: URL → response or function.
function fakeSite({hosts,routes,delayMs=0,now}={}){const calls=[],dnsCalls=[];let active=0,maxActive=0;
 const H={'www.fornoaurora.it':['93.184.216.34'],'fornoaurora.it':['93.184.216.34'],...(hosts||{})};
 const R={};for(const [p,b] of Object.entries(PAGES))R[ORIGIN+p]=html(b);
 Object.assign(R,{[ORIGIN+'/robots.txt']:{status:200,headers:{'content-type':'text/plain'},body:Buffer.from(ROBOTS)},
  [ORIGIN+'/sitemap.xml']:{status:200,headers:{'content-type':'application/xml'},body:Buffer.from(SITEMAP)},
  [ORIGIN+'/old-prodotti']:{status:301,headers:{location:'/prodotti'}},
  ['https://fornoaurora.it/']:{status:301,headers:{location:ORIGIN+'/'}},
  ['https://fornoaurora.it/robots.txt']:{status:301,headers:{location:ORIGIN+'/robots.txt'}},
  [ORIGIN+'/menu.pdf']:{status:200,headers:{'content-type':'application/pdf'},body:Buffer.alloc(0)}},routes||{});
 const lookup=async host=>{dnsCalls.push(host);const a=H[host];if(!a){const e=new Error('ENOTFOUND');e.code='ENOTFOUND';throw e}return a.map(address=>({address,family:address.includes(':')?6:4}))};
 const request=async(url,opts)=>{calls.push({url,...opts});active++;maxActive=Math.max(maxActive,active);
  try{if(delayMs)await new Promise(r=>setTimeout(r,delayMs));if(now)now.advance(opts.method==='HEAD'?50:300);
   let r=R[url];if(typeof r==='function')r=r(url,opts);if(!r)r={status:404,headers:{'content-type':'text/html'},body:Buffer.from('<html><body><h1>Pagina non trovata</h1></body></html>')};
   return {transferBytes:r.body?r.body.length:0,truncated:false,...r,body:opts.method==='HEAD'?Buffer.alloc(0):r.body}}
  finally{active--}};
 return {lookup,request,calls,dnsCalls,get maxActive(){return maxActive},routes:R}}
// A clock the fake site moves forward, so the time budget can be tested without waiting.
function fakeClock(start=Date.UTC(2026,9,21,9,0,0)){let t=start;const f=()=>t;f.advance=ms=>{t+=ms};return f}
module.exports={ORIGIN,PAGES,ROBOTS,SITEMAP,fakeSite,fakeClock,page,words};
