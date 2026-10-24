'use strict';
// «Confronto con i siti dei concorrenti» (agency job S3): the facts of one page (lib/competitor-extract.js) on fixture
// HTML, the crawler of «Analisi del sito» in «concorrenza» mode against four fake sites (api/_site_audit.js, fake DNS and
// requests: no network), the questions, the facts of each site with the page of every value, the matrix, the rules for
// gaps and opportunities, the three angles, the grounding of the optional AI summary, CSV, PDF, the saved key
// competitorSites that agents-page.js keeps, the card in «Cosa vuoi fare» and the link from the brief.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const X=require('../lib/competitor-extract.js'),S=require('../lib/competitor-studio.js'),A=require('../api/_site_audit.js'),auth=require('../api/_auth.js'),F=require('./fixtures/concorrenza-forno.js');
const crea=require('../agency/crea-core.js'),look=require('../agency/marketing-look.js');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const latin=b=>Buffer.from(b).toString('latin1');
const pdfText=bytes=>[...latin(bytes).matchAll(/<([0-9A-F]+)> Tj/g)].map(m=>Buffer.from(m[1],'hex').toString('latin1')).join('\n');
const Q={client:{name:'Forno Aurora',url:'www.fornoaurora.it'},rivals:F.SITE_LIST.slice(1).map(({name,url})=>({name,url}))};
let cache=null;
async function data(topics){if(!cache)cache=await F.crawls(A);const q=S.validate({...Q,topics});return S.gather({sites:S.sitesOf(q),crawls:cache.crawls,topics:q.topics,today:F.TODAY,projectName:'Forno Aurora'})}
const site=(d,name)=>d.sites.find(s=>s.name===name);
const BRAND=S.brandFor(F.PROFILE,'Forno Aurora');

// ---- one page, no network ----
test('a page: prices in euro with their line, never share capital or a shipping threshold; JSON-LD offers once',()=>{
 const m=X.extractMarket(`<html><head><script type="application/ld+json">{"@type":"Product","name":"Box colazione","offers":{"@type":"Offer","price":"18.00","priceCurrency":"EUR"}}</script></head><body>
  <ul><li>Pane di grano duro al kg: € 3,80</li><li>Focaccia – 12,50 €</li><li>Torta per 24 persone 1.250,00 euro</li><li>Box colazione 18,00 €</li></ul>
  <p>Consegna gratuita sopra i 30 €. Grissini a 2.90 EUR</p><footer>Capitale sociale 10.000 € i.v. · P.IVA 01234567890</footer></body></html>`,'https://www.esempio.it/listino');
 assert.deepEqual(m.prices.map(p=>[p.value,p.context]),[[3.8,'Pane di grano duro al kg'],[12.5,'Focaccia'],[1250,'Torta per 24 persone'],[18,'Box colazione'],[2.9,'Grissini a']]);
 assert.deepEqual(m.prices.map(p=>p.text),['3,80 €','12,50 €','1.250 €','18 €','2,90 €']);
 assert.equal(X.amount('1.250,00'),1250);assert.equal(X.amount('3.80'),3.8);assert.equal(X.amount('0'),null);assert.equal(X.amount('abc'),null);
 assert.deepEqual(m.items,['Box colazione'],'the JSON-LD Product name is a listed product');
 const only=X.extractMarket('<body><p>Prezzo su richiesta, chiamaci.</p></body>','https://a.it/');assert.deepEqual(only.prices,[],'no amount, no price');
});

test('a page: forms by kind, booking (words, booking services, date fields — not a phone link), shop and platform',()=>{
 const m=X.extractMarket(`<body><nav><a href="/">Home</a><a href="/menu">Menu</a><a href="/prenota">Prenota un tavolo</a></nav>
  <a href="https://www.thefork.it/ristorante/x">Il nostro profilo</a><a href="tel:0115551234">Telefona per prenotare</a>
  <form action="/contatti"><input name="nome"><textarea name="messaggio"></textarea></form>
  <form class="newsletter"><input type="email" name="email"><button>Iscriviti alla newsletter</button></form>
  <form role="search"><input type="search" name="s"></form><form><input type="date" name="giorno"><input name="persone"></form><form><input type="password" name="pw"></form>
  <button class="add">Aggiungi al carrello</button><a href="/checkout/">Cassa</a><script src="https://cdn.shopify.com/s/x.js"></script></body>`,'https://www.osteria.it/');
 assert.deepEqual(m.nav,['Home','Menu','Prenota un tavolo']);
 assert.deepEqual(m.forms,['contatto','newsletter','ricerca','prenotazione','accesso']);
 assert.deepEqual(m.booking.map(b=>b.text),['Prenota un tavolo','Il nostro profilo','Modulo di prenotazione']);
 assert.ok(!m.booking.some(b=>/Telefona/.test(b.text)),'a phone call is not online booking');
 assert.deepEqual(m.shop.map(s=>s.text),['Aggiungi al carrello','Cassa','Piattaforma Shopify']);
 const none=X.extractMarket('<body><p>Il nostro negozio è in via Roma.</p><a href="/negozio">Il negozio</a></body>','https://a.it/');assert.deepEqual([none.shop,none.booking,none.forms],[[],[],[]]);
});

test('a page: social profiles (not share buttons), WhatsApp, maps, dates of an article, JSON-LD types, fields and rating',()=>{
 const m=X.extractMarket(`<html><head><meta property="og:type" content="article"><meta property="article:published_time" content="2026-09-30T08:00:00+02:00">
  <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"X"},{"@type":"Bakery","name":"Forno X","telephone":"011","priceRange":"€€","aggregateRating":{"@type":"AggregateRating","ratingValue":"4,6","reviewCount":"128"}},{"@type":"BlogPosting","datePublished":"2026-09-30"}]}</script><script type="application/ld+json">{broken</script></head>
  <body><a href="https://www.facebook.com/fornox/">Facebook</a><a href="https://www.facebook.com/sharer/sharer.php?u=x">Condividi</a><a href="https://twitter.com/intent/tweet?text=x">Tweet</a><a href="https://instagram.com/">Instagram</a>
  <a href="https://wa.me/39333">WhatsApp</a><a href="https://www.google.com/maps/place/X">Mappa</a><time datetime="2026-09-30">30 settembre</time></body></html>`,'https://www.fornox.it/blog/2026/09/nuovo-pane/');
 assert.deepEqual(m.social,[{network:'facebook',href:'https://www.facebook.com/fornox'}],'share links and a bare domain are not profiles');
 assert.equal(m.whatsapp,'https://wa.me/39333');assert.equal(m.maps,'https://www.google.com/maps/place/X');
 assert.equal(m.article,true);assert.deepEqual([...new Set(m.dates.map(x=>x.iso))],['2026-09-30','2026-09'],'the address gives only the month: no day is invented');assert.ok(m.dates.some(x=>x.source==='indirizzo'));
 assert.deepEqual(m.ld.types.map(t=>t.type),['WebSite','Bakery','AggregateRating','BlogPosting']);assert.equal(m.ld.business.type,'Bakery');assert.deepEqual(m.ld.business.fields,['name','telephone','priceRange','aggregateRating']);
 assert.equal(m.ld.business.priceRange,'€€');assert.deepEqual(m.ld.rating,{value:4.6,count:128,best:5});assert.equal(m.ld.errors,1);
});

test('a page: services listed (listing pages and h3 under a services h2), claims of 6 words or more with their groups',()=>{
 const home=X.extractMarket(`<body><h1>Benvenuti</h1><h2>I nostri servizi</h2><h3>Torte per feste</h3><h3>Catering per uffici</h3><h2>Chi siamo</h2><h3>La storia</h3>
  <p>Dal 1952 facciamo il pane con farine biologiche del territorio. Torte su ordinazione. Prezzi bassi tutti i giorni per tutte le famiglie del quartiere!</p></body>`,'https://www.forno.it/');
 assert.deepEqual(home.items,['Torte per feste','Catering per uffici'],'only the h3 under the services h2');
 assert.deepEqual(home.claims.map(c=>c.groups),[['storia','naturale'],['prezzo','famiglia']],'«Torte su ordinazione» is three words: a product name, not a claim');
 assert.deepEqual(home.tone,{storia:1,naturale:1,prezzo:1,famiglia:1});
 const list=X.extractMarket('<body><h1>Prodotti</h1><h2>Pane</h2><h2>Focaccia</h2><h2>Contatti</h2><h2>Domande frequenti?</h2></body>','https://www.forno.it/prodotti');
 assert.deepEqual(list.items,['Pane','Focaccia']);
});

// ---- the crawler in «concorrenza» mode ----
test('the crawl in «concorrenza» mode: same guards and robots.txt, facts on every page, no link checks',async()=>{
 const {web,crawls}=await F.crawls(A);const [aurora,verdi,bianchi,rossa]=crawls;
 assert.equal(aurora.mode,'concorrenza');assert.ok(aurora.pages.filter(p=>p.status===200).every(p=>p.market&&Array.isArray(p.market.prices)));
 assert.equal(web.calls.filter(c=>c.method==='HEAD').length,0,'no link checks on the sites read');assert.deepEqual(aurora.linkChecks,{checked:0,total:aurora.linkChecks.total});
 assert.ok(!web.calls.some(c=>/fornobianchi\.it\/riservato/.test(c.url)),'robots.txt Disallow: /riservato/ respected');
 assert.equal(rossa.pages.length,0);assert.ok(!web.calls.some(c=>/pasticceriarossa\.it\/(?!robots\.txt|sitemap\.xml|llms\.txt)/.test(c.url)),'robots.txt Disallow: / → only robots, sitemap and llms.txt');
 assert.match(rossa.notes[0],/robots\.txt/);
 assert.ok(web.calls.every(c=>/^https:\/\//.test(c.url)));
 const plain=await A.crawl('www.fornoaurora.it',{lookup:F.fakeWeb().lookup,request:F.fakeWeb().request,env:{}});assert.equal(plain.mode,undefined);assert.ok(plain.pages.every(p=>!('market' in p)),'the plain «Analisi del sito» is unchanged');
 const few=await A.crawl('www.panificioverdi.it',{...F.fakeWeb(),env:{},mode:'concorrenza',limits:{maxPages:2}});assert.ok(few.pages.length<=2,'the page limit holds');
 const bad=await A.crawl('www.fornoaurora.it',{...F.fakeWeb(),env:{},mode:'tutto'});assert.equal(bad.mode,undefined,'an unknown mode is ignored');
 assert.ok(verdi.pages.length>0&&bianchi.pages.length>0);
});

test('the route passes the mode; it still needs a RADIX session',async()=>{
 const res=()=>({code:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(v){this.body=v;return this}});
 const call=async(body,user,deps)=>{const orig=auth.getSessionUser;auth.getSessionUser=()=>user;const r=res();try{await A.handle({method:'POST',query:{},body,headers:{}},r,deps)}finally{auth.getSessionUser=orig}return r};
 const web=F.fakeWeb();assert.equal((await call({action:'crawl',url:'www.panificioverdi.it',mode:'concorrenza'},null,{...web,env:{}})).code,401);assert.equal(web.calls.length,0);
 const ok=await call({action:'crawl',url:'www.panificioverdi.it',mode:'concorrenza'},{uid:7},{...web,env:{}});assert.equal(ok.code,200);assert.equal(ok.body.mode,'concorrenza');assert.ok(ok.body.pages[0].market);
});

// ---- the questions ----
test('questions: the client site and 2-5 competitor sites typed by the person, never guessed',()=>{
 const q=S.validate(Q);assert.equal(q.client.url,'https://www.fornoaurora.it/');assert.deepEqual(q.rivals.map(r=>[r.name,r.url]),[['Panificio Verdi','https://www.panificioverdi.it/'],['Forno Bianchi','https://www.fornobianchi.it/'],['Pasticceria Rossa','https://pasticceriarossa.it/']]);
 assert.deepEqual(q.topics,S.TOPICS.map(t=>t[0]));
 assert.throws(()=>S.validate({client:Q.client,rivals:[Q.rivals[0]]}),/almeno 2 concorrenti/);
 assert.throws(()=>S.validate({client:Q.client,rivals:Array.from({length:6},(_,i)=>({url:'www.forno'+i+'.it'}))}),/Al massimo 5/);
 assert.throws(()=>S.validate({client:Q.client,rivals:[{url:'fornoaurora.it'},{url:'b.it'}]}),/sito del cliente/);
 assert.throws(()=>S.validate({client:Q.client,rivals:[{url:'b.it'},{url:'https://www.b.it/chi-siamo'}]}),/due volte/);
 assert.throws(()=>S.validate({client:Q.client,rivals:[{name:'Senza sito'},{url:'b.it'}]}),/Manca l’indirizzo/);
 assert.throws(()=>S.validate({client:Q.client,rivals:[{url:'non un sito'},{url:'b.it'}]}),/non sembra un indirizzo/);
 assert.throws(()=>S.validate({...Q,topics:[]}),/almeno una cosa/);
 assert.equal(S.validate({client:Q.client,rivals:[{url:'http://b.it'},{url:'c.it'}]}).rivals[0].url,'https://b.it/','http becomes https');
 assert.equal(S.validate({client:Q.client,rivals:[{url:'b.it'},{url:'c.it'}]}).rivals[1].name,'c.it','no name: the domain');
 const pre=S.prefill({name:'Forno Aurora — panificio',links:'Sito: https://www.fornoaurora.it.'},F.PROFILE);assert.deepEqual(pre,{client:{name:'Forno Aurora',url:'https://www.fornoaurora.it'},rivals:[],topics:S.TOPICS.map(t=>t[0])},'the project gives its own site, never a competitor');
});

// ---- the facts and the matrix ----
test('facts of each site: observed values with the page they come from, «non trovato» in N pages, «non letto» with the reason',async()=>{
 const d=await data(),a=site(d,'Forno Aurora'),v=site(d,'Panificio Verdi'),b=site(d,'Forno Bianchi'),r=site(d,'Pasticceria Rossa');
 assert.equal(a.role,'cliente');assert.equal(a.pagesRead,5);assert.equal(v.pagesRead,6);assert.equal(b.pagesRead,3);
 assert.equal(v.dims.prezzi.value,'5 prezzi, da 2,90 € a 1.250 €');assert.deepEqual(v.dims.prezzi.evidence.map(e=>e.url),[F.VERDI+'/negozio',F.VERDI+'/listino']);
 assert.equal(a.dims.prezzi.state,'no');assert.equal(a.dims.prezzi.value,S.NOT_FOUND);assert.match(a.dims.prezzi.detail,/in 5 pagine lette/);assert.deepEqual(a.dims.prezzi.evidence,[]);
 assert.ok(!a.dims.prezzi.detail.includes('10.000'),'the share capital is not a price');
 assert.equal(b.dims.prezzi.state,'no','«consegna gratuita sopra i 30 euro» is a threshold, not a price');
 assert.equal(v.dims.ecommerce.state,'si');assert.match(v.dims.ecommerce.value,/Aggiungi al carrello/);assert.match(v.dims.ecommerce.value,/WooCommerce/);
 assert.equal(b.dims.prenotazione.state,'si');assert.match(b.dims.prenotazione.value,/Prenota la torta/);assert.ok(b.dims.prenotazione.evidence.some(e=>e.url===F.BIANCHI+'/prenota'));
 assert.equal(a.dims.contatti.value,'telefono, email, modulo di contatto, indirizzo, mappa');assert.equal(v.dims.contatti.value,'telefono, email, WhatsApp, indirizzo');
 assert.equal(a.dims.dati.value,'Bakery · 6 campi');assert.equal(v.dims.dati.value,'Bakery · 7 campi · valutazione 4,6 su 5 (128 recensioni)');assert.equal(b.dims.dati.state,'no');
 assert.equal(v.dims.social.value,'Facebook, Instagram, TikTok');assert.equal(a.dims.social.value,'Instagram','the share button of Facebook is not a profile');
 assert.equal(a.dims.blog.last,'2025-03-10');assert.equal(a.dims.blog.age,592);assert.equal(v.dims.blog.last,'2026-10-01');assert.equal(b.dims.blog.state,'no');
 assert.deepEqual(a.dims.servizi.items,['Pane a lievito madre','Torte su ordinazione','Grissini stirati a mano','Focaccia genovese']);
 assert.match(v.dims.claims.value,/Dal 1952 facciamo il pane solo con farine biologiche del territorio/);assert.deepEqual(Object.keys(b.dims.tono.groups).sort(),['prezzo','servizio']);
 assert.match(a.dims.seo.value,/^punteggio \d+\/100 · title in home · meta description in home · sitemap no · risposta media/);assert.ok(Number.isInteger(a.dims.seo.score));
 assert.equal(r.read,false);assert.match(r.reason,/robots\.txt/);assert.ok(Object.values(r.dims).every(c=>c.state==='na'&&c.value===S.NOT_READ));
 // every fact found has its page; every page is a page of that site
 for(const s of d.sites.filter(x=>x.read))for(const [id,c] of Object.entries(s.dims))if(c.state==='si'){assert.ok(c.evidence.length,s.name+' '+id);for(const e of c.evidence)assert.equal(new URL(e.url).hostname,s.host,s.name+' '+id+' '+e.url)}
 const failed=S.gather({sites:S.sitesOf(S.validate(Q)),crawls:[{error:'Dominio non trovato'}],today:F.TODAY});assert.ok(failed.sites.every(s=>!s.read));assert.match(failed.sites[0].reason,/Dominio non trovato/);assert.deepEqual(failed.findings,[]);
});

test('the matrix: one row per fact of the topics chosen, one column per site, client first',async()=>{
 const m=S.matrix(await data());assert.deepEqual(m.sites.map(s=>[s.name,s.role,s.read]),[['Forno Aurora','cliente',true],['Panificio Verdi','concorrente',true],['Forno Bianchi','concorrente',true],['Pasticceria Rossa','concorrente',false]]);
 assert.deepEqual(m.rows.map(r=>r.id),S.DIMS.map(x=>x.id));assert.ok(m.rows.every(r=>r.cells.length===4));
 const only=S.matrix(await data(['offerta']));assert.deepEqual(only.rows.map(r=>r.id),['servizi','prezzi','ecommerce']);
});

// ---- the rules ----
test('gaps and opportunities by fixed rules, each with its evidence and pages',async()=>{
 const d=await data(),f=d.findings,by=(rule,kind)=>f.filter(x=>x.rule===rule&&(!kind||x.kind===kind));
 assert.deepEqual(f.map(x=>x.id),f.map((_,i)=>'G'+(i+1)));assert.deepEqual([...new Set(f.map(x=>x.kind))],['gap','forza','spunto'],'gaps first');
 assert.equal(by('prezzi','gap')[0].title,'I concorrenti pubblicano i prezzi, il cliente no');assert.deepEqual(by('prezzi')[0].urls,[F.VERDI+'/negozio',F.VERDI+'/listino']);
 assert.equal(by('ecommerce','gap')[0].title,'Panificio Verdi vende online, il cliente no');assert.equal(by('prenotazione','gap')[0].title,'Forno Bianchi fa prenotare online, il cliente no');
 assert.equal(by('whatsapp','gap').length,1);assert.match(by('social','gap')[0].evidence,/Facebook \(Panificio Verdi e Forno Bianchi\); TikTok \(Panificio Verdi\)/);
 assert.match(by('dati','gap')[0].evidence,/4,6 su 128 recensioni/);assert.equal(by('dati').length,1,'the client has its Bakery type: only the rating gap');
 assert.match(by('blog','gap')[0].evidence,/10\/03\/2025, 592 giorni prima; Panificio Verdi: 01\/10\/2026/);
 assert.match(by('messaggi','forza')[0].title,/artigianale/);assert.deepEqual(by('messaggi','spunto').map(x=>x.title),['Messaggi che usano tutti i concorrenti: servizio e consegna','Messaggi dei concorrenti che il cliente non usa: naturale, bio e territorio, prezzo e convenienza'],'a crowded group is not repeated as a hint');
 assert.ok(f.every(x=>x.evidence&&x.action&&KINDS.includes(x.kind)));
 assert.deepEqual((await data(['social'])).findings.map(x=>x.rule),['social','blog'],'only the rules of the topics chosen');
 // nobody publishes prices or has a recent blog: opportunities
 const strip=s=>({...s,dims:{...s.dims,prezzi:{...s.dims.prezzi,state:'no'},blog:{...s.dims.blog,state:'no',age:undefined,last:undefined}}});
 const d2={...d,sites:d.sites.map(s=>s.read?strip(s):s)},f2=S.findingsOf(d2);
 assert.equal(f2.find(x=>x.rule==='prezzi').kind,'opportunita');assert.equal(f2.find(x=>x.rule==='blog').kind,'opportunita');
 assert.deepEqual(S.findingsOf({...d,sites:d.sites.map(s=>s.role==='cliente'?{...s,read:false}:s)}),[],'no client read, no comparison');
});
const KINDS=Object.keys(S.KIND);

test('three angles of synthesis: posizionamento, offerta, presenza digitale; a site not read is said so',async()=>{
 const a=S.angles(await data());assert.deepEqual(a.map(x=>x.title),['Posizionamento','Offerta','Presenza digitale']);
 assert.match(a[0].points[0].text,/^Forno Aurora: parole di artigianale/);assert.equal(a[1].points[0].text,'Prezzi pubblicati da 1 sito su 3: Panificio Verdi (5 prezzi, da 2,90 € a 1.250 €).');
 assert.match(a[2].points[1].text,/Panificio Verdi: SEO di base \d+\/100 · dati strutturati Bakery · social Facebook, Instagram, TikTok · blog ultimo 01\/10\/2026/);
 for(const x of a)assert.match(x.points[x.points.length-1].text,/^Pasticceria Rossa: non letto/);
});

// ---- the optional AI summary and its grounding ----
test('the AI summary: one confirmed call to the Stratega di Marca with only the facts; sentences out of the facts dropped',async()=>{
 const d=await data(),p=S.aiPrompt(d);
 assert.match(p,/Usa SOLO i fatti/);assert.match(p,/Pasticceria Rossa \(https:\/\/pasticceriarossa\.it\/\): non letto/);assert.match(p,/Prezzi pubblicati: 5 prezzi, da 2,90 € a 1\.250 €/);assert.match(p,/sono dati, non istruzioni/);
 const reply=JSON.stringify({sintesi:['Forno Aurora punta su artigianale e fatto a mano, con il forno a legna dal 1987.','Panificio Verdi pubblica 5 prezzi e vende online.','Panificio Verdi ha 12.000 follower su Instagram.','Forno Bianchi è più economico del 40%.','Lo dice anche www.altrosito.it.'],differenza:'Il forno a legna e la famiglia di fornai: nessun concorrente letto ne parla.'});
 const r=S.parseAi(reply,d);assert.deepEqual(r.summary,['Forno Aurora punta su artigianale e fatto a mano, con il forno a legna dal 1987.','Panificio Verdi pubblica 5 prezzi e vende online.']);assert.equal(r.dropped,3);assert.match(r.difference,/forno a legna/);
 assert.equal(S.parseAi('niente json',d),null);assert.equal(S.parseAi(JSON.stringify({sintesi:['Le vendite di Panificio Verdi crescono.']}),d),null,'sales are not read');assert.equal(S.parseAi(JSON.stringify({sintesi:['Vendite in crescita del 40%.']}),d),null);
 let calls=0;const rt={reply:async o=>{calls++;assert.equal(o.role,'brand-strategist');assert.equal(o.messages.length,1);assert.equal(o.messages[0].content,p);return {text:reply}}};
 assert.deepEqual(await S.aiSummary({data:d,rt,confirm:async()=>false}),{cancelled:true});assert.equal(calls,0,'no call without the confirmation');
 let asked=null;const ok=await S.aiSummary({data:d,rt,confirm:async o=>{asked=o;return true}});assert.equal(calls,1);assert.equal(ok.summary.length,2);assert.match(asked.cost,/una sola chiamata AI/i);
 const few=S.gather({sites:S.sitesOf(S.validate(Q)),crawls:[cache.crawls[0],{error:'x'},{error:'y'},{error:'z'}],today:F.TODAY});assert.deepEqual(await S.aiSummary({data:few,rt,confirm:async()=>true}),{nothing:true});assert.equal(calls,1);
 assert.equal(S.AGENT,'brand-strategist');assert.match(read('lib/radix-agent-runtime.js'),/id:'brand-strategist'/);
});

// ---- checks, CSV, PDF ----
test('checks: the client must be read, every fact found has its page, numbers typed are in the facts',async()=>{
 const d=await data(),st=id=>S.checksOf(d,{}).find(c=>c.id===id).state;
 assert.deepEqual(S.checksOf(d,{}).map(c=>c.state),['ok','ok','ok','ok','ok']);
 assert.equal(S.checksOf(d,{note:'Verdi ha 999 clienti'}).find(c=>c.id==='numeri').state,'warn');
 const noClient=S.gather({sites:S.sitesOf(S.validate(Q)),crawls:[{error:'x'},...cache.crawls.slice(1)],today:F.TODAY});assert.equal(S.blocking(S.checksOf(noClient,{}))[0].id,'cliente');
 const lost=JSON.parse(JSON.stringify(d));lost.sites[1].dims.prezzi.evidence=[];assert.equal(S.checksOf(lost,{}).find(c=>c.id==='fonti').state,'fail');assert.equal(st('fonti'),'ok');
});

test('the CSV of the matrix: one row per fact and site, with its URL, safe for Excel',async()=>{
 const d=await data(),csv=S.matrixCsv(d),lines=csv.replace(/^﻿/,'').split('\r\n');
 assert.equal(lines[0],'voce;sito;ruolo;indirizzo del sito;stato;valore;dettaglio;fonte (URL);note sulla fonte;letto il');
 assert.equal(lines.length,1+S.DIMS.length*4);
 const row=lines.find(l=>l.startsWith('Prezzi pubblicati;Panificio Verdi;'));assert.match(row,/;trovato;"5 prezzi, da 2,90 € a 1\.250 €";/);assert.match(row,/https:\/\/www\.panificioverdi\.it\/negozio https:\/\/www\.panificioverdi\.it\/listino/);assert.match(row,/;23\/10\/2026$/);
 assert.match(lines.find(l=>l.startsWith('Prezzi pubblicati;Forno Aurora;')),/;non trovato;non trovato;Nessun prezzo in euro scritto in 5 pagine lette\.;;;23\/10\/2026$/);
 assert.match(lines.find(l=>l.startsWith('Prezzi pubblicati;Pasticceria Rossa;')),/;non letto;non letto;/);
 const evil=JSON.parse(JSON.stringify(d));evil.sites[1].dims.prezzi.value='=HYPERLINK("x")';assert.match(S.matrixCsv(evil),/;"'=HYPERLINK\(""x""\)";/);
});

test('the PDF: A4 pages that fit, the grid, the three angles, the gaps and every fact with its page',async()=>{
 const d=await data(),o={note:'Letti i siti pubblici di ottobre.',summary:['Forno Aurora punta su artigianale e fatto a mano.'],difference:'Il forno a legna.',aiUsed:true};
 const doc=S.layoutComparison(d,o,BRAND);assert.ok(doc.pages.length>=4&&doc.pages.length<=9,String(doc.pages.length));assert.deepEqual(S.fitProblems(doc),[]);
 const bytes=S.comparisonPdf(d,o,BRAND,{doc,date:new Date(F.TODAY)});assert.equal(latin(bytes).slice(0,5),'%PDF-');
 const t=pdfText(bytes);for(const s of ['Confronto con i siti dei concorrenti','I siti letti','Colpo d','Posizionamento','Offerta','Presenza digitale','Lacune e opportunit','Ogni fatto con la sua pagina','https://www.panificioverdi.it/listino','Dove distinguersi: Il forno a legna.','Sintesi scritta con l','robots.txt'])assert.ok(t.includes(s),s);
 assert.equal(S.fileBase(d,BRAND),'concorrenza-forno-aurora-2026-10-23');
});

// ---- saving, the panel, the brief ----
test('saved in the project under competitorSites, the rest of the agents document kept; agents-page.js keeps it',async()=>{
 const d=await data(),o={note:'Ottobre'};
 let stored={schemaVersion:1,conversations:{'brand-strategist':[{role:'user',content:'ciao'}]},audits:{schemaVersion:1,items:[{id:'a'}]},strategyBudget:{schemaVersion:1,items:[]}},conflicts=1;
 class ConflictError extends Error{}
 const ws={ConflictError,bind:(pid,name)=>{assert.equal(pid,'forno-aurora');assert.equal(name,'agents');return {load:async()=>JSON.parse(JSON.stringify(stored)),save:async x=>{if(conflicts-->0)throw new ConflictError('x');stored=x}}}};
 const rec=S.savedRecord(d,o,{by:'Giulia',at:'2026-10-23T10:00:00.000Z'});assert.equal(rec.id,'concorrenza-20261023100000');assert.deepEqual(rec.sites.map(s=>s.read),[true,true,true,false]);assert.equal(rec.findings,d.findings.length);
 await S.saveToProject(ws,'forno-aurora',rec);assert.deepEqual(stored.competitorSites.items.map(x=>x.id),[rec.id]);assert.deepEqual(stored.audits,{schemaVersion:1,items:[{id:'a'}]});assert.equal(stored.conversations['brand-strategist'].length,1);
 for(let i=0;i<10;i++)await S.saveToProject(ws,'forno-aurora',{...rec,id:'c'+i});assert.equal(stored.competitorSites.items.length,8,'only the last 8');
 assert.deepEqual(S.readStore({competitorSites:'boh'}),{schemaVersion:1,items:[]});assert.deepEqual(S.readStore({competitorSites:{items:[{id:'x'}]}}).items,[]);
 const back=S.fromRecord(rec);assert.deepEqual(S.matrixCsv(back.data),S.matrixCsv(d),'reopened with the facts as they were read');
 const l=S.latest(stored);assert.equal(l.id,'c9');assert.equal(l.sites.length,4);assert.equal(S.latest({}),null);
 const src=read('agents-page.js'),fn=/function clean\(d\)\{[^\n]*\}/.exec(src)[0],ctx={MAX_KEPT:40};vm.createContext(ctx);vm.runInContext(fn+';this.clean=clean',ctx);
 assert.deepEqual(JSON.parse(JSON.stringify(ctx.clean(stored).competitorSites)),stored.competitorSites,'kept by agents-page clean()');
 assert.equal((src.match(/data\.competitorSites=fresh\.competitorSites/g)||[]).length,2,'kept after a save conflict and on return to the page');
});

test('the card in «Cosa vuoi fare», the studio wired in the page, the link from the brief',()=>{
 const c=crea.card('concorrenzasiti');assert.equal(c.group,'Strategia');assert.equal(c.inline,'concorrenzasiti');assert.equal(c.title,'Confronto con i siti dei concorrenti');assert.match(c.cost,/Nessuna chiamata AI/);assert.match(c.hint,/li scrivi tu/);
 assert.equal(crea.linkFor(c,'p1'),null);assert.ok(look.has(look.CARDS.concorrenzasiti));assert.deepEqual(crea.fromQuery('?open=concorrenzasiti'),{group:'Strategia',open:'concorrenzasiti'});
 assert.ok(crea.matchServices('benchmark dei concorrenti').some(x=>x.id==='concorrenzasiti'||x.card&&x.card.id==='concorrenzasiti')||crea.SYNONYMS.benchmark.includes('concorrenzasiti'));
 const html=read('agency/crea.html');assert.ok(html.indexOf('/lib/competitor-extract.js')<html.indexOf('/lib/competitor-studio.js')&&html.indexOf('/lib/competitor-studio.js')<html.indexOf('/agency/crea.js'));
 const js=read('agency/crea.js');assert.match(js,/concorrenzasiti:\{global:'RadixCompetitorStudio'/);assert.match(js,/S\.competitorStudio\(\{project,profile:current\.profile,projectName:current\.name,projectId:current\.id,workspace:ws,rt,/);
 assert.match(read('project-editorial.html'),/id="rivalsLink" href="\/agency\/crea\.html\?open=concorrenzasiti"/);assert.match(read('editorial-workspace.js'),/\$\('rivalsLink'\)\.href='\/agency\/crea\.html\?project='\+encodeURIComponent\(projectId\)\+'&open=concorrenzasiti'/);
 assert.match(read('api/_site_audit.js'),/require\('\.\.\/lib\/competitor-extract\.js'\)/);
 assert.match(read('shell/crea.css'),/\.competitor-studio \.cc-matrix-wrap\{[^}]*overflow-x:auto/);
});
