'use strict';
// Dati strutturati, robots.txt, sitemap.xml e llms.txt dei siti (lib/site-seo.js, W3 GEO parte S): no AI, only project facts.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const SEO=require('../lib/site-seo.js'),S=require('../lib/site-studio.js'),L=require('../lib/site-legal.js'),SS=require('../lib/seo-studio.js');
const pub=require('../api/_site_publish.js'),auth=require('../api/_auth.js');
const root=path.join(__dirname,'..');
const LOGO='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 80"><circle cx="40" cy="40" r="30" fill="#9A3412"/><text x="80" y="50">Forno</text></svg>';
const PROFILE={notes:'Ragione sociale: Forno Bianchi srl\nP. IVA: 01234567897\nSede legale: Via Roma 12, 24121 Bergamo (BG)\nOrari: mar-sab 7-13, 16-19:30; dom 7-12; lun chiuso\nCoordinate: 45.6983, 9.6773',
 links:'https://fornobianchi.it\nhttps://www.instagram.com/fornobianchi\nhttps://www.facebook.com/fornobianchi',identityKit:{brand:'Forno Bianchi',logo:LOGO}};
const PROJECT={name:'Forno Bianchi',kind:'Panificio artigianale',summary:'Pane a lievito madre e torte su ordinazione a Bergamo'};
const PROP={name:'Il pane',headline:'Pane vero, ogni mattina',sub:'Lievito madre e farine macinate a pietra.',cta:'Passa a trovarci',
 sections:[{title:'Servizi',text:'- Pane a lievito madre: sfornato ogni mattina alle 7\n- Torte su ordinazione: con 48 ore di anticipo\n- [da completare: altro servizio]'},
  {title:'FAQ',text:'Fate consegne a domicilio?\nSì, in centro a Bergamo il sabato mattina.\nAvete pane senza glutine?\n[da completare: risposta vera]\nSi può ordinare per telefono? Sì, chiamando entro le 18 del giorno prima.'},
  {title:'Contatti',text:'Vieni in negozio.'}]};
const FACTS=()=>SEO.siteFacts({profile:PROFILE,project:PROJECT,name:'Forno Bianchi',place:'Via Roma 12, 24121 Bergamo (BG)',contacts:'035 123456 · info@fornobianchi.it'});
const nodes=d=>d['@graph'];
const byType=(d,t)=>nodes(d).find(n=>n['@type']===t);
const byId=(d,id)=>nodes(d).find(n=>String(n['@id']||'').endsWith(id));
const scripts=h=>(String(h).match(/<script type="application\/ld\+json">/g)||[]).length;

test('type of business: the most specific schema.org type from the project words, LocalBusiness otherwise',()=>{
 const t=(kind,summary)=>SEO.businessType(kind,summary).type;
 assert.equal(t('Panificio artigianale'),'Bakery');assert.equal(t('Forno a legna'),'Bakery');assert.equal(t('Pasticceria'),'Bakery');
 assert.equal(t('Ristorante di pesce'),'Restaurant');assert.equal(t('Pizzeria al taglio'),'Restaurant');assert.equal(t('Gelateria'),'IceCreamShop');
 assert.equal(t('Studio di fisioterapia'),'Physiotherapy');assert.equal(t('Studio dentistico'),'Dentist');assert.equal(t('Poliambulatorio'),'MedicalClinic');
 assert.equal(t('Psicologa'),'MedicalBusiness');assert.equal(t('Bar e caffetteria'),'CafeOrCoffeeShop');assert.equal(t('Barbiere'),'HairSalon','barbiere is not a bar');
 assert.equal(t('B&B in collina'),'BedAndBreakfast');assert.equal(t('Hotel 3 stelle'),'Hotel');assert.equal(t('Palestra CrossFit'),'ExerciseGym');
 assert.equal(t('Studio legale'),'LegalService');assert.equal(t('Commercialista'),'AccountingService');assert.equal(t('Agenzia immobiliare'),'RealEstateAgent');
 assert.equal(t('Idraulico'),'Plumber');assert.equal(t('Carrozzeria'),'AutoBodyShop');assert.equal(t('Autofficina'),'AutoRepair');assert.equal(t('Centro estetico'),'BeautySalon');
 assert.equal(t('Progetto Agency','studio di fisioterapia a Bergamo'),'Physiotherapy','a generic kind falls back to the summary');
 assert.equal(t('Personal brand',''),'LocalBusiness');assert.equal(t('Consulenza aziendale srl','')==='ProfessionalService',true);
 const none=SEO.businessType('Produzione di droni','');assert.deepEqual(none,{type:'LocalBusiness',label:'attività locale',matched:false,from:''});
 assert.equal(SEO.businessType('Bakery?','').matched,false,'only Italian words of the table');
 for(const [re,type,label] of SEO.TYPES){assert.ok(re instanceof RegExp);assert.match(type,/^[A-Z][A-Za-z]+$/);assert.ok(label)}
});

test('opening hours: Italian text → OpeningHoursSpecification; anything not understood gives no hours',()=>{
 const h=SEO.parseHours('lun-ven 9-13, 15-19; sab 9:30-12:30; dom chiuso');
 assert.deepEqual(h,[{'@type':'OpeningHoursSpecification',dayOfWeek:['Monday','Tuesday','Wednesday','Thursday','Friday'],opens:'09:00',closes:'13:00'},
  {'@type':'OpeningHoursSpecification',dayOfWeek:['Monday','Tuesday','Wednesday','Thursday','Friday'],opens:'15:00',closes:'19:00'},
  {'@type':'OpeningHoursSpecification',dayOfWeek:['Saturday'],opens:'09:30',closes:'12:30'}]);
 assert.deepEqual(SEO.parseHours('Orari: da lunedì a venerdì dalle 9 alle 18').map(x=>[x.dayOfWeek.length,x.opens,x.closes]),[[5,'09:00','18:00']]);
 assert.deepEqual(SEO.parseHours('tutti i giorni 7-24')[0].dayOfWeek.length,7);assert.equal(SEO.parseHours('tutti i giorni 7-24')[0].closes,'23:59');
 assert.deepEqual(SEO.parseHours('lun, mer e ven 8.30-12.30').map(x=>x.dayOfWeek),[['Monday','Wednesday','Friday']]);
 for(const bad of ['','su appuntamento','lun-ven su appuntamento','lun-ven 9-13 e festivi','sab-lun 9-12','lun 19-2','lun 9-25','aperti sempre','lun-ven 9-13; chiamare prima','marzo-ottobre 9-18'])
  assert.deepEqual(SEO.parseHours(bad),[],bad);
 assert.equal(SEO.hoursText(h),'lun, mar, mer, gio, ven 09:00-13:00; lun, mar, mer, gio, ven 15:00-19:00; sab 09:30-12:30');
});

test('facts: read from the project only; address split, geo only when written, social links as sameAs',()=>{
 const f=FACTS();
 assert.equal(f.name,'Forno Bianchi');assert.equal(f.type.type,'Bakery');assert.equal(f.legalName,'Forno Bianchi srl');assert.equal(f.vat,'01234567897');
 assert.equal(f.telephone,'035 123456');assert.equal(f.email,'info@fornobianchi.it');assert.equal(f.website,'https://fornobianchi.it');
 assert.deepEqual(f.sameAs,['https://www.instagram.com/fornobianchi','https://www.facebook.com/fornobianchi']);
 assert.deepEqual(f.geo,{'@type':'GeoCoordinates',latitude:45.6983,longitude:9.6773});assert.equal(f.hours.length,3);assert.equal(f.logo,LOGO);
 assert.deepEqual(SEO.postalAddress('Via Roma 12, 24121 Bergamo (BG)'),{'@type':'PostalAddress',streetAddress:'Via Roma 12',postalCode:'24121',addressLocality:'Bergamo',addressRegion:'BG',addressCountry:'IT'});
 assert.deepEqual(SEO.postalAddress('Corso Italia 3 - 20122 Milano'),{'@type':'PostalAddress',streetAddress:'Corso Italia 3',postalCode:'20122',addressLocality:'Milano'},'no country without province or «Italia»');
 assert.deepEqual(SEO.postalAddress('Piazza Vecchia, centro storico'),{'@type':'PostalAddress',streetAddress:'Piazza Vecchia, centro storico'});
 assert.equal(SEO.postalAddress('[da completare: sede legale (indirizzo completo)]'),null);
 const bare=SEO.siteFacts({profile:{notes:'P. IVA: 01234567897'},project:{name:'X'}});
 assert.equal(bare.telephone,'','a VAT number is not a phone number');assert.equal(bare.geo,null);assert.deepEqual(bare.hours,[]);assert.deepEqual(bare.sameAs,[]);assert.equal(bare.website,'');assert.equal(bare.logo,'');
 assert.equal(SEO.siteFacts({profile:{notes:'Orari: su appuntamento'},project:{name:'X'}}).hoursUnread,true);
 assert.equal(SEO.siteFacts({profile:{notes:'Coordinate: 145.2, 9.1'},project:{name:'X'}}).geo,null,'out of range');
 assert.equal(SEO.siteFacts({profile:{identityKit:{logo:'<svg onload="alert(1)"></svg>'}},project:{name:'X'}}).logo,'','an unsafe logo is not used');
 assert.equal(SEO.safeLogo('<svg><script>x()</script></svg>'),'');assert.equal(SEO.safeLogo('<svg><a href="https://x.it">x</a></svg>'),'');
 assert.equal(SEO.baseUrl('www.esempio.it/'),'https://www.esempio.it');assert.equal(SEO.baseUrl('https://u:p@x.it'),'');assert.equal(SEO.baseUrl('javascript:alert(1)'),'');
});

test('JSON-LD of the home: LocalBusiness subtype, Organization, WebSite, BreadcrumbList, FAQPage and services; valid and complete',()=>{
 const html=S.buildPage(PROP,{name:'Forno Bianchi',place:'Via Roma 12, 24121 Bergamo (BG)',contacts:'035 123456 · info@fornobianchi.it',structured:FACTS()});
 assert.equal(scripts(html),1);assert.ok(html.indexOf('application/ld+json')<html.indexOf('</head>'),'in the head');
 const d=SEO.readJsonLd(html);assert.deepEqual(SEO.validate(d),[]);assert.equal(d['@context'],'https://schema.org');
 assert.deepEqual(nodes(d).map(n=>n['@type']),['Organization','Bakery','WebSite','BreadcrumbList','FAQPage']);
 const org=byId(d,'#organization'),biz=byId(d,'#business');
 assert.equal(org.legalName,'Forno Bianchi srl');assert.equal(org.vatID,'IT01234567897');assert.equal(org.address.postalCode,'24121');
 assert.equal(biz.name,'Forno Bianchi');assert.equal(biz.telephone,'035 123456');assert.equal(biz.email,'info@fornobianchi.it');
 assert.equal(biz.description,'Lievito madre e farine macinate a pietra.','the description is the page’s own');
 assert.deepEqual(biz.geo,{'@type':'GeoCoordinates',latitude:45.6983,longitude:9.6773});
 assert.deepEqual(biz.openingHoursSpecification.map(x=>[x.dayOfWeek.join(','),x.opens,x.closes]),[['Tuesday,Wednesday,Thursday,Friday,Saturday','07:00','13:00'],['Tuesday,Wednesday,Thursday,Friday,Saturday','16:00','19:30'],['Sunday','07:00','12:00']],'Monday closed: not listed');
 assert.deepEqual(biz.sameAs,['https://www.instagram.com/fornobianchi','https://www.facebook.com/fornobianchi']);
 assert.deepEqual(biz.parentOrganization,{'@id':'#organization'});
 assert.deepEqual(biz.hasOfferCatalog.itemListElement.map(x=>[x.itemOffered['@type'],x.itemOffered.name,x.itemOffered.description]),[['Service','Pane a lievito madre','sfornato ogni mattina alle 7'],['Service','Torte su ordinazione','con 48 ore di anticipo']],'the placeholder item is left out');
 const faq=byType(d,'FAQPage');
 assert.deepEqual(faq.mainEntity.map(q=>[q.name,q.acceptedAnswer.text]),[['Fate consegne a domicilio?','Sì, in centro a Bergamo il sabato mattina.'],['Si può ordinare per telefono?','Sì, chiamando entro le 18 del giorno prima.']],'the unanswered question is left out');
 for(const q of faq.mainEntity)assert.ok(html.includes(S.escapeHtml(q.name)),'every question is visible in the page');
 assert.deepEqual(byType(d,'BreadcrumbList').itemListElement,[{'@type':'ListItem',position:1,name:'Home'}],'no address yet: no url, never a placeholder');
 assert.ok(!('url' in biz)&&!('logo' in biz),'url and logo only with the site address');
 assert.ok(!/da completare/.test(JSON.stringify(d)));
 // Rewriting replaces the block, never duplicates it.
 assert.equal(scripts(SEO.withStructuredData(html,FACTS())),1);assert.equal(SEO.withStructuredData(html,FACTS()),html);
});

test('missing facts are omitted, not invented: no empty strings, no placeholders, no node without its data',()=>{
 const min=SEO.graph({name:'Studio Rossi',type:SEO.businessType('',''),hours:[],sameAs:[]},{page:'index.html',html:S.buildPage({headline:'H',sections:[{title:'Chi siamo',text:'Testo.'}]},{name:'Studio Rossi'})});
 assert.deepEqual(SEO.validate(min),[]);assert.deepEqual(nodes(min).map(n=>n['@type']),['Organization','WebSite','BreadcrumbList'],'no LocalBusiness without an address, no FAQPage without questions');
 const org=byId(min,'#organization');assert.deepEqual(Object.keys(org).sort(),['@id','@type','name']);
 const json=JSON.stringify(min);for(const k of ['telephone','email','geo','openingHoursSpecification','vatID','legalName','sameAs','logo','address','""'])assert.ok(!json.includes(k),k);
 assert.deepEqual(nodes(SEO.graph({},{page:'index.html'})).map(n=>n['@type']),['BreadcrumbList'],'without a name only the breadcrumb');
 const todo=SEO.siteFacts({project:{name:'[da completare: nome dell’attività]'}});assert.equal(todo.name,'');
 assert.deepEqual(SEO.prune({a:'',b:'  ',c:[],d:{},e:{'@type':'X'},f:null,g:NaN,h:0,i:false,j:{'@id':'#x'}}),{h:0,i:false,j:{'@id':'#x'}});
 assert.ok(SEO.validate({'@context':'https://schema.org','@graph':[{'@type':'Thing',name:''}]}).length>0);
 assert.ok(SEO.validate({'@graph':[]}).length>0,'@context required');assert.ok(SEO.validate({'@context':'https://schema.org',x:{y:1}}).some(p=>/@type/.test(p)));
});

test('safe embedding: the JSON cannot close the script or open a comment, and reads back unchanged',()=>{
 const evil='Forno </script><script>alert(1)</script> & <!-- \u2028 «Bianchi»';
 const html=S.buildPage({headline:'H',sections:[{title:'Chi siamo',text:'t'}]},{name:evil,structured:{...FACTS(),name:evil}});
 const block=html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
 assert.ok(!/[<>&\u2028\u2029]/.test(block),'no raw < > & or line separators inside the block');
 assert.equal((html.match(/<\/script>/g)||[]).length,1,'only the block’s own closing tag');assert.ok(!/<script>/.test(html));
 assert.equal(byId(JSON.parse(block),'#business').name,evil,'valid JSON with the original text');
 assert.equal(SEO.safeJson({a:'</script>'}),'{"a":"\\u003c/script\\u003e"}');
});

test('legal pages carry their JSON-LD too (breadcrumb Home › page) and the kit logo ships as logo.svg',()=>{
 const facts=FACTS(),pages=S.sitePages({name:'Forno Bianchi',legal:L.legalFacts(PROFILE),form:{action:'https://radix.example/api/sales?site_form=1',token:''},structured:facts});
 assert.deepEqual(Object.keys(pages),['privacy.html','cookie.html','grazie.html','logo.svg']);assert.equal(pages['logo.svg'],LOGO);
 for(const k of ['privacy.html','cookie.html','grazie.html']){const d=SEO.readJsonLd(pages[k]);assert.deepEqual(SEO.validate(d),[],k);assert.equal(scripts(pages[k]),1);
  assert.deepEqual(byType(d,'BreadcrumbList').itemListElement.map(x=>x.name),['Home',{'privacy.html':'Informativa privacy','cookie.html':'Cookie policy','grazie.html':'Grazie'}[k]]);
  assert.ok(!byType(d,'FAQPage'));assert.ok(!byId(d,'#business').description,'the description belongs to the home')}
 const noKit=S.sitePages({name:'X',legal:{},structured:{...facts,logo:''}});assert.ok(!('logo.svg' in noKit));
 assert.ok(!('logo.svg' in S.sitePages({name:'X',legal:{}})),'without structured facts the pages are as before');
});

test('«Da completare»: the company data typed completes the JSON-LD, the other markers stay out',()=>{
 const facts=SEO.siteFacts({project:{name:'Forno Bianchi',kind:'panificio'},place:'',contacts:''});
 assert.equal(facts.legalName,'');
 const html=S.buildPage(PROP,{name:'Forno Bianchi',legal:{},structured:facts});
 assert.ok(!byId(SEO.readJsonLd(html),'#business'),'no address yet: no LocalBusiness');
 const values={[L.marker('legalName')]:'Forno Bianchi srl',[L.marker('vat')]:'01234567897',[L.marker('address')]:'Via Roma 12, 24121 Bergamo (BG)','[da completare: altro servizio]':'Pane in cassetta'};
 const next=SEO.withFilled(facts,values);assert.equal(next.legalName,'Forno Bianchi srl');assert.equal(next.vat,'01234567897');assert.equal(next.legalAddress,'Via Roma 12, 24121 Bergamo (BG)');
 assert.equal(SEO.withFilled(facts,{[L.marker('vat')]:'123'}).vat,'','an invalid VAT never reaches the JSON-LD');
 const filled=SEO.withStructuredData(S.fillTodos(html,values),next,{page:'index.html'}),d=SEO.readJsonLd(filled),biz=byId(d,'#business');
 assert.equal(biz['@type'],'Bakery');assert.equal(biz.vatID,'IT01234567897');assert.equal(biz.address.addressLocality,'Bergamo');
 assert.deepEqual(biz.hasOfferCatalog.itemListElement.map(x=>x.itemOffered.name),['Pane a lievito madre','Torte su ordinazione','Pane in cassetta'],'the filled service joins the list');
 assert.equal(scripts(filled),1);assert.deepEqual(SEO.validate(d),[]);
 const src=fs.readFileSync(path.join(root,'lib/site-studio.js'),'utf8');
 assert.match(src,/asked\.structured=Seo\?Seo\.siteFacts\(\{profile:ctx\.profile,project:ctx\.project/);assert.match(src,/pages=restructure\(pages,asked\.structured\)/);
});

test('robots.txt, sitemap.xml and llms.txt: from the pages and their JSON-LD, absolute only with the site address',()=>{
 const facts=FACTS(),html=S.buildPage(PROP,{name:'Forno Bianchi',place:'Via Roma 12, 24121 Bergamo (BG)',contacts:'035 123456 · info@fornobianchi.it',structured:facts});
 const pages=S.sitePages({name:'Forno Bianchi',legal:L.legalFacts(PROFILE),structured:facts});
 const b=SEO.siteBundle(html,pages,{base:'https://www.fornobianchi.it/',date:'2026-10-23'});
 assert.deepEqual(Object.keys(b.pages),['privacy.html','cookie.html','logo.svg','robots.txt','sitemap.xml','llms.txt']);
 assert.equal(b.pages['robots.txt'],'# robots.txt del sito, preparato da RADIX\nUser-agent: *\nAllow: /\n\nSitemap: https://www.fornobianchi.it/sitemap.xml\n');
 assert.equal(b.pages['sitemap.xml'],'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://www.fornobianchi.it/</loc><lastmod>2026-10-23</lastmod></url>\n</urlset>\n','the noindex legal pages stay out');
 const llms=b.pages['llms.txt'];
 assert.match(llms,/^# Forno Bianchi\n\n> Lievito madre e farine macinate a pietra\.\n/);
 for(const line of ['- Tipo di attività (schema.org): Bakery','- Indirizzo: Via Roma 12, 24121 Bergamo (BG)','- Telefono: 035 123456','- E-mail: info@fornobianchi.it','- Ragione sociale: Forno Bianchi srl','- Partita IVA: IT01234567897',
  '## Servizi','- Pane a lievito madre: sfornato ogni mattina alle 7','## Domande frequenti','- Fate consegne a domicilio? Sì, in centro a Bergamo il sabato mattina.',
  '- [Home](https://www.fornobianchi.it/): Forno Bianchi · Pane vero, ogni mattina','- [Informativa privacy](https://www.fornobianchi.it/privacy.html)','- [Cookie policy](https://www.fornobianchi.it/cookie.html)'])assert.ok(llms.includes(line),line);
 assert.match(llms,/- Orari: mar, mer, gio, ven, sab 07:00-13:00; mar, mer, gio, ven, sab 16:00-19:30; dom 07:00-12:00/);assert.ok(!/da completare/.test(llms));
 // Absolute JSON-LD: ids, url, logo and breadcrumb items.
 const d=SEO.readJsonLd(b.html),biz=byId(d,'#business');assert.deepEqual(SEO.validate(d),[]);
 assert.equal(biz['@id'],'https://www.fornobianchi.it/#business');assert.equal(biz.url,'https://www.fornobianchi.it/');assert.equal(biz.logo,'https://www.fornobianchi.it/logo.svg');assert.equal(biz.image,biz.logo);
 assert.deepEqual(biz.parentOrganization,{'@id':'https://www.fornobianchi.it/#organization'});assert.equal(byId(d,'#website').url,'https://www.fornobianchi.it/');
 assert.equal(byType(d,'BreadcrumbList').itemListElement[0].item,'https://www.fornobianchi.it/');
 assert.deepEqual(byType(SEO.readJsonLd(b.pages['privacy.html']),'BreadcrumbList').itemListElement.map(x=>x.item),['https://www.fornobianchi.it/','https://www.fornobianchi.it/privacy.html']);
 assert.equal(scripts(b.html),1);
 // Without an address: no sitemap (it needs full URLs), robots.txt without the Sitemap line, relative links in llms.txt, JSON-LD as it was.
 const rel=SEO.siteBundle(html,pages,{});assert.ok(!('sitemap.xml' in rel.pages));assert.equal(rel.pages['robots.txt'],'# robots.txt del sito, preparato da RADIX\nUser-agent: *\nAllow: /\n');
 assert.match(rel.pages['llms.txt'],/- \[Home\]\(index\.html\)/);assert.equal(rel.html,html);
 // An unsafe logo never ships; the page then has no logo url.
 const bad=SEO.siteBundle(html,{...pages,'logo.svg':'<svg onload="x()"></svg>'},{base:'https://x.it'});assert.ok(!('logo.svg' in bad.pages));assert.ok(!byId(SEO.readJsonLd(bad.html),'#business').logo);
 assert.equal(SEO.sitemapXml('',{'index.html':html}),'');assert.match(SEO.sitemapXml('https://a.it',{'index.html':html,'x&y.html':'<html></html>'},{date:'2026-01-02'}),/<loc>https:\/\/a\.it\/x&amp;y\.html<\/loc>/);
});

// ---- publish: the server builds the bundle ----
const TOKEN='vcp_test_token',res=()=>({code:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(v){this.body=v;return this}});
function store(saved){const s={doc:{data:{schemaVersion:1,conversations:{},...(saved?{siteOnline:saved}:{})},revision:1},
 project:async id=>id==='forno-ab12cd34'?{id,name:'Forno Bianchi'}:null,load:async()=>JSON.parse(JSON.stringify(s.doc)),save:async(id,data,rev)=>{if(rev!==s.doc.revision)return false;s.doc={data,revision:rev+1};return true}};return s}
async function publish(body,{saved}={}){const calls=[],reply=(status,b)=>({ok:status<400,status,json:async()=>b});
 const fetch=async(url,opts)=>{calls.push({url,method:opts.method,body:opts.body?JSON.parse(opts.body):null});return reply(200,{id:'dpl_9',url:'radix-site-forno.vercel.app',readyState:'READY',alias:['radix-site-forno.vercel.app']})};
 const orig=auth.getSessionUser;auth.getSessionUser=()=>({uid:7,name:'Anna'});const r=res();
 try{await pub.handle({method:'POST',query:{},body:{action:'publish',projectId:'forno-ab12cd34',...body},headers:{}},r,{env:{VERCEL_SITES_TOKEN:TOKEN,JWT_SECRET:'x'},store:store(saved),fetch,sleep:async()=>{},now:()=>new Date('2026-10-23T09:00:00Z')})}finally{auth.getSessionUser=orig}
 return Object.assign(r,{calls})}
const SITE=()=>{const f=FACTS(),legal=L.legalFacts(PROFILE,{contacts:'info@fornobianchi.it'});return {html:S.buildPage(PROP,{name:'Forno Bianchi',place:'Via Roma 12, 24121 Bergamo (BG)',contacts:'035 123456 · info@fornobianchi.it',legal,structured:f}).replace(/\n?<mark class="todo">\[da completare:[^<]*<\/mark>/g,''),
 pages:S.sitePages({name:'Forno Bianchi',legal,structured:f})}};

test('publish: the bundle on Vercel has absolute JSON-LD, robots.txt, sitemap.xml, llms.txt and logo.svg',async()=>{
 const {html,pages}=SITE();assert.ok(!S.hasTodo(html));
 const r=await publish({html,pages});assert.equal(r.code,200,JSON.stringify(r.body));
 const files=Object.fromEntries(r.calls[0].body.files.map(f=>[f.file,f.data]));
 assert.deepEqual(Object.keys(files),['index.html','privacy.html','cookie.html','logo.svg','robots.txt','sitemap.xml','llms.txt']);
 const base='https://'+pub.projectName(pub.siteSlug('Forno Bianchi','forno-ab12cd34'))+'.vercel.app';
 assert.equal(byId(SEO.readJsonLd(files['index.html']),'#business').url,base+'/','first publication: the expected production address');
 assert.match(files['robots.txt'],new RegExp('Sitemap: '+base.replace(/\./g,'\\.')+'/sitemap\\.xml'));assert.match(files['sitemap.xml'],/<lastmod>2026-10-23<\/lastmod>/);
 assert.match(files['llms.txt'],/^# Forno Bianchi/);assert.equal(files['logo.svg'],LOGO);
 // Next time: the verified RADIX subdomain wins, then the address Vercel gave.
 assert.equal(pub.siteBase({url:'https://radix-site-forno.vercel.app',domain:{name:'forno-1.radixinnovationstudio.com',verified:true}},'p'),'https://forno-1.radixinnovationstudio.com');
 assert.equal(pub.siteBase({url:'https://radix-site-forno.vercel.app',domain:{name:'forno-1.radixinnovationstudio.com',verified:false}},'p'),'https://radix-site-forno.vercel.app');
 assert.equal(pub.siteBase(null,'radix-site-x'),'https://radix-site-x.vercel.app');
 const again=await publish({html,pages},{saved:{deploymentId:'dpl_1',project:'radix-site-forno',url:'https://radix-site-forno.vercel.app',state:'READY',domain:{name:'forno-1.radixinnovationstudio.com',verified:true}}});
 assert.equal(again.code,200);const f2=Object.fromEntries(again.calls[0].body.files.map(f=>[f.file,f.data]));
 assert.match(f2['sitemap.xml'],/<loc>https:\/\/forno-1\.radixinnovationstudio\.com\/<\/loc>/);
});

test('publish: robots.txt, sitemap.xml and llms.txt are never taken from the client; an unsafe logo is refused',async()=>{
 const {html,pages}=SITE();
 for(const k of pub.GENERATED){const r=await publish({html,pages:{...pages,[k]:'User-agent: *\nDisallow: /'}});assert.equal(r.code,400,k);assert.equal(r.calls.length,0)}
 const r=await publish({html,pages:{...pages,'logo.svg':'<svg><script>alert(1)</script></svg>'}});assert.equal(r.code,422);assert.match(r.body.error,/logo/);assert.equal(r.calls.length,0);
 const noLogo={...pages};delete noLogo['logo.svg'];const ok=await publish({html,pages:noLogo});assert.equal(ok.code,200);
 assert.ok(!ok.calls[0].body.files.some(f=>f.file==='logo.svg'));
});

test('prompt: services as a list and FAQ as questions with «?», so the page can be read back',()=>{
 const p=S.proposalsPrompt({sections:['services','faq','contacts']},{offer:'Panificio artigianale a Bergamo'});
 assert.match(p,/Nella sezione Servizi elenca i servizi uno per riga, nella forma «- Nome del servizio: una frase che lo descrive»\./);
 assert.match(p,/Nella sezione FAQ scrivi da 3 a 5 domande vere dei clienti: ogni domanda su una riga che finisce con «\?», la risposta nella riga dopo\./);
 const plain=S.proposalsPrompt({sections:['about']},{offer:'Panificio artigianale a Bergamo'});assert.ok(!/sezione Servizi|sezione FAQ/.test(plain));
});

test('Studio SEO e GEO «Dati strutturati»: present and missing fields, the JSON-LD preview and the Rich Results Test link',()=>{
 const html=S.buildPage(PROP,{name:'Forno Bianchi',place:'Via Roma 12, 24121 Bergamo (BG)',structured:FACTS()});
 const agents={conversations:{'web-developer':[...S.savedEntry({name:'Il pane'},html,{at:'2026-10-20T10:00:00Z'})]},siteOnline:{url:'https://radix-site-forno.vercel.app',deploymentId:'d',state:'READY'}};
 const saved=SS.savedSite(agents);assert.equal(saved.html,html);assert.equal(saved.url,'https://radix-site-forno.vercel.app');
 assert.deepEqual(SS.savedSite({}),{html:'',url:''});
 const r=SS.structuredReport({profile:PROFILE,project:PROJECT},saved);
 assert.equal(r.type.type,'Bakery');assert.equal(r.hasSite,true);assert.deepEqual(r.problems,[]);
 const c=Object.fromEntries(r.checks.map(x=>[x.id,x]));
 for(const k of ['name','type','legalName','vat','address','url','hours','geo','sameAs','logo','services','faq'])assert.equal(c[k].ok,true,k);
 assert.equal(c.telephone.ok,false,'no phone in the profile: shown as missing');assert.match(c.telephone.hint,/contatti/);
 assert.equal(c.faq.value,'2 domande');assert.equal(c.vat.value,'IT01234567897');
 assert.equal(r.testUrl,'https://search.google.com/test/rich-results?url='+encodeURIComponent('https://radix-site-forno.vercel.app/'));
 assert.equal(JSON.parse(r.json)['@context'],'https://schema.org');assert.equal(byId(JSON.parse(r.json),'#business').url,'https://radix-site-forno.vercel.app/');
 const empty=SS.structuredReport({profile:{},project:{name:'Nuovo progetto',kind:'Progetto'}},{html:'',url:''});
 assert.equal(empty.type.type,'LocalBusiness');assert.equal(empty.testUrl,'https://search.google.com/test/rich-results');
 const ce=Object.fromEntries(empty.checks.map(x=>[x.id,x]));for(const k of ['legalName','vat','address','telephone','email','url','hours','faq','services'])assert.equal(ce[k].ok,false,k);
 assert.match(ce.legalName.hint,/Da completare/);assert.match(ce.faq.hint,/Studio Sito/);assert.deepEqual(empty.problems,[]);
 assert.ok(!/""/.test(empty.json),'no empty strings in the preview');
 const src=fs.readFileSync(path.join(root,'lib/seo-studio.js'),'utf8');
 assert.match(src,/button\('Dati strutturati'\)/);assert.match(src,/'Prova nel Rich Results Test di Google'/);assert.match(src,/test\.rel='noopener noreferrer'/);
 assert.match(src,/el\('pre',r\.json,'sd-json'\)/,'the preview is text, never HTML');
 const crea=fs.readFileSync(path.join(root,'agency/crea.html'),'utf8');
 assert.ok(crea.indexOf('/lib/site-legal.js')<crea.indexOf('/lib/site-seo.js')&&crea.indexOf('/lib/site-seo.js')<crea.indexOf('/lib/site-studio.js'),'site-seo loads between the legal pages and the studios');
 assert.match(fs.readFileSync(path.join(root,'agency/crea.js'),'utf8'),/S\.seoStudio\(\{project,profile:current\.profile,/);
});
