'use strict';
// «Analisi del sito»: the crawler (api/_site_audit.js) against a fake site and fake DNS — no network, no AI — and the
// studio (lib/site-audit.js): checks, scores, the grounded plan prompt and its parsing, CSV, report and the saved key.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),{Readable}=require('node:stream');
const A=require('../api/_site_audit.js'),S=require('../lib/site-audit.js'),auth=require('../api/_auth.js'),F=require('./fixtures/site-audit-forno.js');
const root=path.join(__dirname,'..');
const crawlForno=(opts={})=>{const site=F.fakeSite(opts);return A.crawl(opts.start||'fornoaurora.it',{lookup:site.lookup,request:site.request,env:opts.env||{},fetch:opts.fetch,now:opts.now,limits:opts.limits}).then(c=>({c,site}))};
const ANS={url:'fornoaurora.it',goal:'locale',services:['Torte su ordinazione','Catering per uffici','Corsi di panificazione'],city:'Torino'};

// ---- SSRF guards ----
test('private, loopback, link-local, metadata and reserved addresses are refused; public ones pass',()=>{
 for(const ip of ['10.0.0.1','10.255.255.255','127.0.0.1','127.8.9.1','169.254.169.254','169.254.0.1','172.16.5.4','172.31.0.1','192.168.1.1','100.64.0.1','100.100.100.200','0.0.0.0','224.0.0.1','255.255.255.255','192.0.2.10','198.18.0.1',
  '::1','::','fe80::1','fc00::1','fd00:ec2::254','ff02::1','::ffff:127.0.0.1','::ffff:10.0.0.1','::ffff:a9fe:a9fe','64:ff9b::a9fe:a9fe','2002:7f00:1::1','2001:db8::1','2001::1','::127.0.0.1','not-an-ip',''])
  assert.equal(A.isBlockedIp(ip),true,ip);
 for(const ip of ['93.184.216.34','8.8.8.8','172.32.0.1','100.128.0.1','2606:4700:4700::1111','2a00:1450:4002:402::200e','::ffff:8.8.8.8','64:ff9b::808:808'])assert.equal(A.isBlockedIp(ip),false,ip);
});
test('only https on port 443, a public domain name, no credentials; http:// typed by the person becomes https://',()=>{
 const bad=[['http://fornoaurora.it/','not-https'],['ftp://fornoaurora.it/','not-https'],['https://127.0.0.1/','ip-literal'],['https://[::1]/','ip-literal'],['https://169.254.169.254/latest/meta-data','ip-literal'],
  ['https://localhost/','reserved'],['https://printer.local/','reserved'],['https://db.internal/','reserved'],['https://a.home.arpa/','reserved'],['https://user:pw@fornoaurora.it/','credentials'],['https://fornoaurora.it:8443/','port'],['javascript:alert(1)','not-https']];
 for(const [u,code] of bad)assert.throws(()=>A.checkUrl(u),e=>e instanceof A.AuditError&&e.code===code,u);
 assert.equal(A.startUrl('http://www.fornoaurora.it/x').href,'https://www.fornoaurora.it/x');
 assert.equal(A.startUrl('fornoaurora.it').href,'https://fornoaurora.it/');
 assert.throws(()=>A.checkUrl('https://evil.com/','fornoaurora.it'),e=>e.code==='offsite');
 assert.equal(A.checkUrl('https://shop.fornoaurora.it/','fornoaurora.it').hostname,'shop.fornoaurora.it','same registrable domain');
});
test('registrable domain: one label more on shared hosts and second-level suffixes',()=>{
 assert.equal(A.registrable('www.fornoaurora.it'),'fornoaurora.it');assert.equal(A.registrable('a.b.example.co.uk'),'example.co.uk');
 assert.equal(A.registrable('cliente-a.vercel.app'),'cliente-a.vercel.app');assert.notEqual(A.registrable('a.altervista.org'),A.registrable('b.altervista.org'));
});
test('a domain that resolves to a private address is never contacted (also when only one of its addresses is private)',async()=>{
 for(const addrs of [['10.0.0.5'],['127.0.0.1'],['169.254.169.254'],['93.184.216.34','192.168.0.10'],['::1'],['fd00:ec2::254']]){
  const site=F.fakeSite({hosts:{'fornoaurora.it':addrs}});
  await assert.rejects(A.crawl('fornoaurora.it',{lookup:site.lookup,request:site.request,env:{}}),e=>e instanceof A.AuditError&&e.status===403&&e.code==='private-ip',addrs.join());
  assert.equal(site.calls.length,0,'no request at all: '+addrs.join())}
});
test('redirects: to a private host, to another site or to http:// stop there; every hop is checked again',async()=>{
 const toPrivate=F.fakeSite({hosts:{'intranet.fornoaurora.it':['10.1.2.3']},routes:{'https://fornoaurora.it/':{status:302,headers:{location:'https://intranet.fornoaurora.it/admin'}}}});
 await assert.rejects(A.crawl('fornoaurora.it',{lookup:toPrivate.lookup,request:toPrivate.request,env:{}}),e=>e.status===403&&e.code==='private-ip');
 assert.ok(!toPrivate.calls.some(c=>c.url.includes('intranet')),'the private host is never requested');assert.ok(toPrivate.dnsCalls.includes('intranet.fornoaurora.it'),'but it was resolved and checked');
 const offsite=F.fakeSite({routes:{'https://fornoaurora.it/':{status:301,headers:{location:'https://evil.com/'}}}});
 await assert.rejects(A.crawl('fornoaurora.it',{lookup:offsite.lookup,request:offsite.request,env:{}}),e=>e.status===422&&e.code==='redirect-offsite'&&/altro dominio/.test(e.message));
 assert.ok(!offsite.calls.some(c=>c.url.includes('evil.com'))&&!offsite.dnsCalls.includes('evil.com'));
 const downgrade=F.fakeSite({routes:{'https://fornoaurora.it/':{status:301,headers:{location:'http://www.fornoaurora.it/'}}}});
 await assert.rejects(A.crawl('fornoaurora.it',{lookup:downgrade.lookup,request:downgrade.request,env:{}}),e=>e.code==='redirect-http');
 const loop=F.fakeSite({routes:{'https://fornoaurora.it/':{status:301,headers:{location:'/'}}}});
 await assert.rejects(A.crawl('fornoaurora.it',{lookup:loop.lookup,request:loop.request,env:{}}),e=>e.code==='redirect-loop');
 assert.ok(loop.calls.length<=A.LIMITS.maxRedirects+3);
});
test('the connection goes to the address that was checked (pinned), every host resolved once',async()=>{
 const {site}=await crawlForno();
 assert.ok(site.calls.length>5);for(const c of site.calls)assert.equal(c.address,'93.184.216.34',c.url);
 assert.deepEqual([...new Set(site.dnsCalls)].sort(),['fornoaurora.it','www.fornoaurora.it']);assert.equal(site.dnsCalls.length,2,'cached for the crawl');
 assert.ok(site.calls.every(c=>c.url.startsWith('https://')));assert.ok(!site.calls.some(c=>/instagram|google\.com|cdn\.fornoaurora/.test(c.url)),'other sites and resources are not fetched');
});

// ---- robots.txt ----
test('robots.txt: groups, longest match, Allow on ties, wildcards and $, the RADIX agent or *',()=>{
 const r=A.parseRobots('# commento\nUser-agent: *\nDisallow: /privato/\nAllow: /privato/pubblico\nDisallow: /*.pdf$\nDisallow: /cerca?\n\nUser-agent: GPTBot\nUser-agent: CCBot\nDisallow: /\n\nUser-agent: radix\nDisallow: /lento/\nCrawl-delay: 2\nSitemap: https://x.it/sm.xml');
 assert.equal(r.groups.length,3);assert.deepEqual(r.groups[1].agents,['gptbot','ccbot']);assert.deepEqual(r.sitemaps,['https://x.it/sm.xml']);
 assert.equal(A.robotsAllows(r,'/lento/x'),false,'RADIX group');assert.equal(A.robotsAllows(r,'/privato/x'),true,'RADIX has its own group: * does not apply');
 assert.equal(A.robotsAllows(r,'/privato/x',['googlebot']),false);assert.equal(A.robotsAllows(r,'/privato/pubblico/a',['googlebot']),true,'longer Allow wins');
 assert.equal(A.robotsAllows(r,'/menu.pdf',['googlebot']),false);assert.equal(A.robotsAllows(r,'/menu.pdf?x=1',['googlebot']),true,'$ anchors the end');
 assert.equal(A.robotsAllows(r,'/cerca?q=pane',['googlebot']),false);assert.equal(A.robotsAllows(r,'/',['gptbot']),false);assert.equal(A.robotsAllows(r,'/',['ccbot']),false);
 assert.equal(A.robotsAllows(A.parseRobots('User-agent: *\nDisallow:'),'/x'),true,'empty Disallow allows everything');
 assert.equal(A.robotsAllows(A.parseRobots('User-agent: *\nDisallow: /a\nAllow: /a'),'/a'),true,'tie: Allow');
 assert.equal(A.robotsAllows(A.parseRobots(''),'/x'),true);
});
test('the crawl respects robots.txt: disallowed pages are skipped, AI crawlers reported, a full block stops the crawl',async()=>{
 const {c,site}=await crawlForno();
 assert.ok(!site.calls.some(x=>x.url.includes('/area-riservata/')),'Disallow respected');assert.deepEqual(c.skipped.robots,['https://www.fornoaurora.it/area-riservata/ordini']);
 assert.deepEqual(c.robots.aiBlocked.map(b=>b.agent),['gptbot']);assert.equal(c.robots.blocksGoogle,false);assert.equal(c.sitemap.listedInRobots,true);
 const closed=F.fakeSite({routes:{[F.ORIGIN+'/robots.txt']:{status:200,headers:{'content-type':'text/plain'},body:Buffer.from('User-agent: *\nDisallow: /\n')}}});
 const r=await A.crawl('www.fornoaurora.it',{lookup:closed.lookup,request:closed.request,env:{}});
 assert.equal(r.pages.length,0);assert.equal(r.robots.blocksAll,true);assert.equal(r.robots.blocksGoogle,true);assert.match(r.notes[0],/robots\.txt/);
 assert.ok(!closed.calls.some(x=>/\/(chi-siamo|prodotti)?$/.test(new URL(x.url).pathname)&&!/robots|sitemap|llms/.test(x.url)),'no page requested');
 const audit=S.analyze(r,ANS);assert.ok(audit.issues.some(i=>i.id==='T-robots-block'&&i.severity==='alta'));
});

// ---- extraction ----
test('extraction from HTML: title, meta, H1, canonical, robots, hreflang, lang, OG, Twitter, JSON-LD, alt, words, links, mixed content, phones',()=>{
 const home=A.extractPage(F.PAGES['/'],F.ORIGIN+'/');
 assert.equal(home.title,'Forno Aurora | Panificio artigianale a Torino con forno a legna dal 1987');assert.equal(home.titleLength,72);assert.equal(home.descriptionLength,146);
 assert.deepEqual(home.h1,['Il pane a lievito madre di San Salvario']);assert.equal(home.canonical,F.ORIGIN+'/');assert.equal(home.lang,'it');assert.equal(home.viewport,true);
 assert.equal(home.og.title,'Forno Aurora');assert.equal(home.og.image,F.ORIGIN+'/og.jpg');assert.equal(home.twitter.card,'summary_large_image');
 assert.deepEqual(home.jsonld.types.sort(),['Bakery','PostalAddress','WebSite']);assert.equal(home.jsonld.org.name,'Forno Aurora');assert.equal(home.jsonld.org.address.city,'Torino');assert.equal(home.jsonld.org.hasHours,true);
 assert.deepEqual(home.jsonld.sameAs,['https://www.instagram.com/fornoaurora']);
 assert.equal(home.images.total,3);assert.equal(home.images.withoutAlt,1);assert.equal(home.mixed.passive,1);assert.equal(home.mixed.active,1-1);
 assert.ok(home.words>300);assert.ok(home.links.internal.includes(F.ORIGIN+'/chi-siamo'));assert.ok(!home.links.internal.some(u=>u.includes('instagram')));assert.deepEqual(home.links.externalHosts.sort(),['www.google.com','www.instagram.com']);
 assert.deepEqual(home.phones,['0115551234'],'tel: link, text and JSON-LD agree; the P.IVA is not a phone');assert.deepEqual(home.emails,['info@fornoaurora.it']);assert.equal(home.telLinks,1);assert.equal(home.hasAddress,true);assert.equal(home.kind,'home');
 const x=A.extractPage(`<html><head><title>A &amp; B &egrave; ok</title><meta name="robots" content="NOINDEX, nosnippet"><link rel="alternate" hreflang="en" href="/en/"><link rel="alternate" hreflang="it-IT" href="/"><base href="https://x.it/sub/">
  <script src="http://x.it/a.js"></script><link rel="stylesheet" href="http://x.it/a.css"><script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"A?"},{"@type":"Question","name":"B?"}]}</script><script type="application/ld+json">{bad json}</script></head>
  <body><h1>Uno</h1><h1>Due</h1><h2>Come si fa?</h2><!-- <a href="/commento">no</a> --><a href="rel">relativo</a><a href="tel:+39 333 1234567">x</a><img src="a.png" alt=""><script>var t="<a href='/script'>no</a>"</script></body></html>`,'https://x.it/pagina');
 assert.equal(x.title,'A & B è ok');assert.equal(x.noindex,true);assert.equal(x.nosnippet,true);assert.equal(x.lang,null);assert.equal(x.viewport,false);assert.equal(x.h1Count,2);assert.equal(x.questions,1);
 assert.deepEqual(x.hreflang.map(h=>h.lang),['en','it-IT']);assert.equal(x.jsonld.blocks,2);assert.equal(x.jsonld.errors,1);assert.equal(x.jsonld.faqQuestions,2);
 assert.deepEqual(x.links.internal,['https://x.it/sub/rel'],'base href; comments and scripts ignored');assert.equal(x.mixed.active,2);assert.equal(x.images.withoutAlt,0);assert.equal(x.images.emptyAlt,1);assert.deepEqual(x.phones,['3331234567']);
 const spa=A.extractPage('<html><head><title>App</title><script src="/a.js"></script></head><body><div id="root"></div></body></html>','https://x.it/');assert.equal(spa.jsOnly,true);
});
test('sitemap: urlset and sitemap index; the crawl opens the first child of an index',async()=>{
 const s=A.parseSitemap(F.SITEMAP);assert.equal(s.isIndex,false);assert.equal(s.urls.length,7);
 const idx='<sitemapindex><sitemap><loc>'+F.ORIGIN+'/sm-pages.xml</loc></sitemap><sitemap><loc>'+F.ORIGIN+'/sm-posts.xml</loc></sitemap></sitemapindex>';
 assert.deepEqual(A.parseSitemap(idx),{isIndex:true,urls:[F.ORIGIN+'/sm-pages.xml',F.ORIGIN+'/sm-posts.xml'],total:2});
 assert.deepEqual(A.parseSitemap('<urlset><url><loc><![CDATA[https://x.it/a?b=1&amp;c=2]]></loc></url></urlset>').urls,['https://x.it/a?b=1&c=2']);
 const site=F.fakeSite({routes:{[F.ORIGIN+'/sitemap.xml']:{status:200,headers:{'content-type':'application/xml'},body:Buffer.from(idx)},[F.ORIGIN+'/sm-pages.xml']:{status:200,headers:{'content-type':'application/xml'},body:Buffer.from(F.SITEMAP)}}});
 const c=await A.crawl('fornoaurora.it',{lookup:site.lookup,request:site.request,env:{}});
 assert.equal(c.sitemap.isIndex,true);assert.equal(c.sitemap.urls,7);assert.ok(!site.calls.some(x=>x.url.endsWith('sm-posts.xml')),'only the first child');
});
test('the full crawl of the fixture: pages, statuses, redirects, broken links, llms.txt',async()=>{
 const {c}=await crawlForno();
 assert.equal(c.finalUrl,F.ORIGIN+'/');assert.equal(c.pages[0].redirects.length,1,'apex → www');
 const paths=c.pages.map(p=>new URL(p.url).pathname).sort();
 assert.deepEqual(paths,['/','/blog/pane-lievito-madre','/chi-siamo','/contatti','/pagina-rotta','/privacy','/prodotti','/servizi/catering','/torte']);
 assert.deepEqual(c.brokenLinks.map(b=>[new URL(b.url).pathname,b.status]),[['/pagina-rotta',404]]);
 assert.deepEqual(c.redirectedLinks.map(r=>new URL(r.url).pathname),['/old-prodotti']);
 assert.equal(c.llms.found,false);assert.equal(c.pagespeed.measured,false);assert.match(c.pagespeed.reason,/non misurati/);
 assert.ok(c.pages.every(p=>!('requested' in p)));assert.ok(JSON.stringify(c).length<400000,'the response stays small');
});

// ---- limits ----
test('limits: at most 25 pages, 4 requests at a time, 2 MB and 8 s per request, the time budget',async()=>{
 const many={};for(let i=0;i<80;i++)many[F.ORIGIN+'/p'+i]={status:200,headers:{'content-type':'text/html'},body:Buffer.from(F.page({title:'Pagina '+i,description:'d',h1:['P'+i],body:'<p>'+F.words(50,i)+'</p>'+Array.from({length:6},(_,k)=>'<a href="/p'+(i*6+k+1)+'">x</a>').join('')}))};
 many[F.ORIGIN+'/']={status:200,headers:{'content-type':'text/html'},body:Buffer.from(F.page({title:'Home',h1:['Home'],body:Array.from({length:30},(_,k)=>'<a href="/p'+k+'">x</a>').join('')}))};
 const site=F.fakeSite({routes:many,delayMs:3});
 const c=await A.crawl('www.fornoaurora.it',{lookup:site.lookup,request:site.request,env:{}});
 assert.equal(c.pages.length,A.LIMITS.maxPages);assert.ok(c.skipped.limit>0);assert.ok(site.maxActive<=4&&site.maxActive>1,'parallel but capped: '+site.maxActive);
 assert.ok(site.calls.filter(x=>x.method==='HEAD').length<=A.LIMITS.linkChecks);
 for(const x of site.calls){assert.ok(x.timeoutMs<=8000&&x.timeoutMs>0);assert.ok(x.maxBytes<=2*1024*1024)}
 const clock=F.fakeClock();const slow=F.fakeSite({routes:many,now:clock});
 const b=await A.crawl('www.fornoaurora.it',{lookup:slow.lookup,request:slow.request,env:{},now:clock,limits:{budgetMs:3000}});
 assert.equal(b.budgetHit,true);assert.ok(b.pages.length<A.LIMITS.maxPages);assert.ok(b.notes.some(n=>/Tempo/.test(n)));
 assert.ok(A.LIMITS.budgetMs+5000<60000,'below the function limit');
});
test('response bodies stop at the byte limit, also when compressed (no decompression bomb)',async()=>{
 const big=zlib.gzipSync(Buffer.alloc(5*1024*1024,97));assert.ok(big.length<20000);
 const r=await A.collect(Readable.from([big]),{encoding:'gzip',maxBytes:2*1024*1024});assert.equal(r.truncated,true);assert.equal(r.body.length,2*1024*1024);
 const ok=await A.collect(Readable.from([zlib.brotliCompressSync(Buffer.from('<html>ciao</html>'))]),{encoding:'br',maxBytes:1024});assert.equal(ok.body.toString(),'<html>ciao</html>');assert.equal(ok.truncated,false);
 const plain=await A.collect(Readable.from([Buffer.alloc(3000),Buffer.alloc(3000)]),{encoding:'',maxBytes:4000});assert.equal(plain.body.length,4000);assert.equal(plain.truncated,true);
});
test('PageSpeed Insights only with the key; the key never reaches the response',async()=>{
 const KEY='AIza_SECRET_KEY_123';let asked='';
 const psi={loadingExperience:{metrics:{LARGEST_CONTENTFUL_PAINT_MS:{percentile:3100},INTERACTION_TO_NEXT_PAINT:{percentile:180},CUMULATIVE_LAYOUT_SHIFT_SCORE:{percentile:27}}},lighthouseResult:{categories:{performance:{score:.58}},audits:{'largest-contentful-paint':{numericValue:4200}}}};
 const {c}=await crawlForno({env:{PAGESPEED_API_KEY:KEY},fetch:async u=>{asked=u;return {ok:true,status:200,json:async()=>psi}}});
 assert.match(asked,/^https:\/\/www\.googleapis\.com\/pagespeedonline\/v5\/runPagespeed\?url=https%3A%2F%2Ffornoaurora\.it%2F&strategy=mobile/);
 assert.deepEqual(c.pagespeed.field,{lcpMs:3100,inpMs:180,cls:.27});assert.equal(c.pagespeed.lab.score,58);assert.ok(!JSON.stringify(c).includes(KEY));
 const audit=S.analyze(c,ANS);assert.equal(audit.issues.find(i=>i.id==='T-cwv-lcpMs').severity,'media');assert.equal(audit.issues.find(i=>i.id==='T-cwv-cls').severity,'alta');assert.ok(!audit.issues.some(i=>i.id==='T-cwv-inpMs'));
 const err=await A.pagespeed('https://x.it/',{env:{PAGESPEED_API_KEY:KEY},fetchFn:async()=>({ok:false,status:400,json:async()=>({error:{message:'bad key '+KEY}})}),timeoutMs:1000});
 assert.equal(err.measured,false);assert.ok(!JSON.stringify(err).includes(KEY));
});

// ---- the HTTP route ----
const res=()=>({code:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(v){this.body=v;return this}});
async function call(method,body,user,deps={}){const orig=auth.getSessionUser;auth.getSessionUser=()=>user;const r=res();try{await A.handle({method,query:{},body,headers:{}},r,deps)}finally{auth.getSessionUser=orig}return r}
test('the route needs a RADIX session, checks the input and is wired with a literal require',async()=>{
 const site=F.fakeSite();
 assert.equal((await call('POST',{action:'crawl',url:'fornoaurora.it'},null,{lookup:site.lookup,request:site.request})).code,401);assert.equal(site.calls.length,0);
 const g=await call('GET',null,{uid:1},{env:{}});assert.equal(g.code,200);assert.equal(g.body.pagespeed,false);assert.equal(g.body.limits.maxPages,25);
 const ok=await call('POST',{action:'crawl',url:'fornoaurora.it'},{uid:1},{lookup:site.lookup,request:site.request,env:{}});assert.equal(ok.code,200);assert.equal(ok.headers['Cache-Control'],'no-store');assert.equal(ok.body.pages.length,9);
 assert.equal((await call('POST',{action:'crawl',url:'https://10.0.0.1/'},{uid:1},{})).code,400);
 assert.equal((await call('POST',{action:'altro'},{uid:1},{})).code,400);assert.equal((await call('PUT',{},{uid:1},{})).code,405);
 const priv=F.fakeSite({hosts:{'fornoaurora.it':['192.168.1.1']}});const p=await call('POST',{url:'fornoaurora.it'},{uid:1},{lookup:priv.lookup,request:priv.request,env:{}});assert.equal(p.code,403);assert.match(p.body.error,/privato/);
 const route=fs.readFileSync(path.join(root,'api/integrations/[service].js'),'utf8');assert.match(route,/'site-audit': \(\) => require\('\.\.\/_site_audit'\)/);
 assert.match(fs.readFileSync(path.join(root,'api/_site_audit.js'),'utf8'),/getSessionUser/);
});

// ---- the studio: checks and scores ----
test('checks: every problem has area, severity, evidence, pages and a fix; the fixture problems are found',async()=>{
 const {c}=await crawlForno();const au=S.analyze(c,ANS),ids=au.issues.map(i=>i.id);
 for(const i of au.issues){assert.ok(S.AREAS.some(a=>a.id===i.area),i.id);assert.ok(S.SEVERITY[i.severity],i.id);assert.ok(i.title&&i.fix&&i.evidence,i.id);assert.ok(Array.isArray(i.pages),i.id)}
 for(const id of ['T-broken','T-mixed','T-redirect-links','C-title-dup','C-desc','C-thin','C-alt','C-title-long','C-h1-many','C-services','D-errors','L-nap','D-faq','G-ai-train'])assert.ok(ids.includes(id),id);
 for(const id of ['T-sitemap','T-robots','D-none','D-org','L-phone','L-address','L-city','L-contact','G-about','G-faq','T-viewport','C-title','T-noindex'])assert.ok(!ids.includes(id),'not a problem here: '+id);
 const broken=au.issues.find(i=>i.id==='T-broken');assert.equal(broken.severity,'alta');assert.deepEqual(broken.pages,[F.ORIGIN+'/']);assert.match(broken.evidence,/\/pagina-rotta → 404/);
 assert.deepEqual(au.issues.find(i=>i.id==='C-services').services,['Corsi di panificazione']);assert.deepEqual(au.issues.find(i=>i.id==='L-nap').phones.sort(),['0115551234','0115559999']);
 assert.ok(!au.issues.some(i=>i.pages.includes(F.ORIGIN+'/privacy')&&i.area==='contenuti'),'noindex legal pages are not content');
 assert.deepEqual(au.issues.map(i=>S.SEVERITY[i.severity].rank),au.issues.map(i=>S.SEVERITY[i.severity].rank).slice().sort((a,b)=>a-b),'sorted by severity');
 assert.ok(au.notes.some(n=>/llms\.txt/.test(n.text)&&/non incide/.test(n.text)),'llms.txt informative only');assert.ok(au.notes.some(n=>/non misurati/i.test(n.text)));
});
test('scores: 0-100 per area, overall weighted by goal, fewer problems never score lower; llms.txt does not count',async()=>{
 const {c}=await crawlForno();const au=S.analyze(c,ANS);
 for(const a of S.AREAS){const v=au.scores.areas[a.id];assert.ok(Number.isInteger(v)&&v>=0&&v<=100,a.id)}
 assert.ok(au.scores.overall>=60&&au.scores.overall<85,'the fixture is «da migliorare»: '+au.scores.overall);assert.equal(au.grade.label,'Da migliorare');
 for(const g of Object.keys(S.WEIGHTS))assert.ok(Math.abs(Object.values(S.WEIGHTS[g]).reduce((s,x)=>s+x,0)-1)<1e-9,g);
 const fewer=S.scores(au.issues.filter(i=>i.severity!=='alta'),c,ANS);assert.ok(fewer.areas.tecnico>au.scores.areas.tecnico);
 const withLlms=S.analyze({...c,llms:{found:true,status:200}},ANS);assert.equal(withLlms.scores.overall,au.scores.overall);
 const local=S.analyze(c,{...ANS,goal:'locale'}),ai=S.analyze(c,{...ANS,goal:'ai'});assert.deepEqual(local.scores.areas,ai.scores.areas);
 const empty=S.analyze({url:'https://x.it/',pages:[],robots:{found:false,status:404},sitemap:{found:false}},ANS);assert.ok(empty.issues.some(i=>i.id==='T-home'&&i.severity==='alta'));
 assert.ok(S.grade(90).id==='good'&&S.grade(70).id==='fair'&&S.grade(30).id==='poor');
});
test('the questions: address, goal, services as chips and city',()=>{
 assert.equal(S.siteUrl('www.fornoaurora.it'),'https://www.fornoaurora.it/');assert.equal(S.siteUrl('http://fornoaurora.it/chi-siamo'),'https://fornoaurora.it/chi-siamo');
 for(const bad of ['','forno aurora','http://','192.168.1.1','localhost'])assert.throws(()=>S.siteUrl(bad),bad);
 assert.deepEqual(S.serviceList('Torte, Catering\nTorte;  ;x'),['Torte','Catering']);assert.equal(S.serviceList(Array.from({length:20},(_,i)=>'s'+i)).length,8);
 assert.deepEqual(S.normalize({goal:'boh'}).goal,'contatti');assert.equal(S.validate({url:'fornoaurora.it'}).url,'https://fornoaurora.it/');
 assert.equal(S.prefill({links:'Sito: https://www.fornoaurora.it, Instagram'}).url,'https://www.fornoaurora.it');
});

// ---- the plan: grounded prompt, parse with a fake AI reply ----
test('plan prompt: only crawl data, problem ids, the pages, the limits, no invented numbers',async()=>{
 const {c}=await crawlForno();const au=S.analyze(c,ANS),p=S.planPrompt(au,{project:{name:'Forno Aurora'}});
 assert.match(p,/Usa SOLO questi dati/);assert.match(p,/Non inventare posizioni su Google, volumi di ricerca, traffico/);assert.match(p,/da_verificare/);assert.match(p,/60 caratteri/);assert.match(p,/155/);
 const data=JSON.parse(p.split('DATI:\n')[1].split('\n\n')[0]);assert.deepEqual(data.problemi.map(x=>x.id),au.issues.slice(0,30).map(i=>i.id));
 assert.ok(data.pagine.length<=6&&data.pagine[0].url===F.ORIGIN+'/');assert.ok(data.pagine.every(x=>c.pages.some(q=>q.url===x.url)));assert.equal(data.core_web_vitals,'non misurati');
 assert.deepEqual(data.non_misurato,['backlink','posizioni su Google','volumi di ricerca','traffico']);assert.ok(!p.includes('privacy'),'noindex legal pages are not sent');
 assert.throws(()=>S.planPrompt(null));
});
const FAKE_PLAN={sintesi:'Il sito è solido ma perde contatti per un link rotto e titoli duplicati.',piano:{
 '30':[{azione:'Correggere il link «Offerte» della home',perche:'Porta a una pagina 404.',problemi:['T-broken'],pagine:['/'],impatto:'alto',sforzo:'basso'},
  {azione:'Unificare il numero di telefono',perche:'Due numeri diversi confondono Google.',problemi:['L-nap'],pagine:['/contatti'],impatto:'medio',sforzo:'basso'},
  {azione:'Aumentare il traffico del 40% con nuovi backlink',perche:'Più autorevolezza.',problemi:['X-99'],pagine:['/backlink-nuovi'],impatto:'alto',sforzo:'alto'}],
 '60':[{azione:'Title diversi per Prodotti e Torte',perche:'Sono duplicati.',problemi:['C-title-dup'],pagine:['https://www.fornoaurora.it/torte'],impatto:'medio',sforzo:'basso'}],
 '90':[{azione:'Scrivere la pagina Corsi di panificazione',perche:'Il servizio non ha spazio.',problemi:[],pagine:[],impatto:'medio',sforzo:'medio'}]},
 pagine:[{url:'https://www.fornoaurora.it/',title:'Panificio a Torino con forno a legna e lievito madre | Forno Aurora San Salvario',meta:'Pane a lievito madre, torte su ordinazione e colazioni a San Salvario, Torino.',motivo:'Title oltre 60 caratteri.'},
  {url:'/torte',title:'Torte su ordinazione a Torino · Forno Aurora',meta:'Torte per compleanni e ricorrenze: il 93% dei clienti torna. Ordina con due giorni di anticipo.',motivo:'Title duplicato.'},
  {url:'/inventata',title:'X',meta:'Y'}],da_verificare:['Quale numero di telefono è quello principale.']};
test('plan parse: phases, ids and pages checked against the crawl, numbers not in the data flagged, limits enforced',async()=>{
 const {c}=await crawlForno();const au=S.analyze(c,ANS);
 const plan=S.parsePlan('Ecco il piano:\n```json\n'+JSON.stringify(FAKE_PLAN)+'\n```',au);
 assert.ok(S.planPrompt(au).includes('"locale":'+au.scores.areas.locale),'the scores go to the AI');assert.ok(!S.groundText(au).includes('"aree"'),'but do not ground numbers');
 assert.equal(plan.summary,FAKE_PLAN.sintesi);assert.deepEqual(S.PHASES.map(k=>plan.phases[k].length),[3,1,1]);
 const [a1,a2,a3]=plan.phases['30'];
 assert.deepEqual(a1.refs,['T-broken']);assert.deepEqual(a1.pages,[F.ORIGIN+'/']);assert.deepEqual(a1.flags,[]);assert.equal(a1.impact,'alto');assert.equal(a1.effort,'basso');
 assert.deepEqual(a2.pages,[F.ORIGIN+'/contatti'],'path resolved against the site');
 assert.ok(a3.flags.some(f=>/Problemi non nell’analisi: X-99/.test(f)));assert.ok(a3.flags.some(f=>/Pagine non analizzate: \/backlink-nuovi/.test(f)));assert.ok(a3.flags.some(f=>/Numeri non presenti nei dati: .*40/.test(f)));
 assert.ok(plan.phases['90'][0].flags.some(f=>/non nei dati/.test(f)),'an action citing no problem is flagged');
 assert.equal(plan.pages.length,2,'the invented page is dropped');const [home,torte]=plan.pages;
 assert.ok([...home.title].length<=60);assert.ok(home.flags.some(f=>/Title accorciato da \d+ a 60/.test(f)));assert.equal(home.oldTitle,c.pages[0].title);
 assert.equal(torte.url,F.ORIGIN+'/torte');assert.ok(torte.flags.some(f=>/93/.test(f)),'«93%» is not in the data');
 assert.equal(plan.flags,4);assert.deepEqual(plan.toVerify,['Quale numero di telefono è quello principale.']);
 assert.equal(S.parsePlan('nessun json',au),null);assert.equal(S.parsePlan('{"piano":{}}',au),null);
 assert.deepEqual(S.recheckPage({title:'x'.repeat(61),meta:'ok'},au).length,1);
 assert.equal(S.fitTitle('Panificio a Torino, lievito madre e forno a legna | Forno Aurora',60),'Panificio a Torino, lievito madre e forno a legna','the brand goes first, no half brand');
 assert.equal(S.fitTitle('Breve | Marca',60),'Breve | Marca');assert.ok([...S.fitTitle('x '.repeat(50),60)].length<=60);
 assert.equal(S.sitePhones('Usa lo 011 555 1234 ovunque',au).includes('1234'),false,'a phone of the site is data');assert.match(S.sitePhones('chiama 02 1234 5678',au),/1234 5678/,'another number stays to be checked');
});

// ---- export and save ----
test('CSV and report: problems with pages and fixes, the plan, the method; no external resources; formulas neutralised',async()=>{
 const {c}=await crawlForno();const au=S.analyze(c,ANS),plan=S.parsePlan(JSON.stringify(FAKE_PLAN),au);
 const csv=S.issuesCsv(au,plan),rows=csv.split('\r\n');
 assert.equal(rows[0],'﻿tipo;gravità;area;voce;dettaglio;pagine;come risolvere;riferimento');assert.equal(rows.length,1+au.issues.length+5+2);
 assert.ok(rows.some(r=>r.startsWith('problema;Alta;Tecnico;1 link interno non funziona')));assert.ok(rows.some(r=>r.startsWith('piano 30 giorni;')));assert.ok(rows.some(r=>r.startsWith('title e meta;')));
 const evil=S.issuesCsv({...au,issues:[{...au.issues[0],title:'=HYPERLINK("x")'}]});assert.ok(evil.includes("'=HYPERLINK"));
 const html=S.reportHtml(au,{plan,brand:'Forno Aurora',date:'2026-10-21',by:'Anna'});
 assert.match(html,/^<!doctype html>/);assert.match(html,/21 ottobre 2026/);assert.match(html,/Problemi e come risolverli/);assert.match(html,/Piano a 30, 60 e 90 giorni/);assert.match(html,/Title e meta description riscritti/);assert.match(html,/Metodo e limiti/);
 assert.match(html,/Core Web Vitals non misurati/);assert.match(html,/@page\{size:A4/);assert.ok(!/<script|<link |src="http|@import/i.test(html),'standalone and printable');
 const xss=S.reportHtml({...au,host:'<img src=x onerror=alert(1)>'},{});assert.ok(!xss.includes('<img src=x'));
 assert.equal(S.fileName(au,'csv'),'analisi-sito-www-fornoaurora-it.csv');
});
test('save: siteAudit in the agents document, every other key kept, retried on a conflict, at most 6 audits',async()=>{
 const {c}=await crawlForno();const au=S.analyze(c,ANS),plan=S.parsePlan(JSON.stringify(FAKE_PLAN),au);
 class ConflictError extends Error{}
 const store={data:{schemaVersion:1,conversations:{'seo-geo':[{role:'user',content:'ciao'}]},prefs:{x:1},seoResults:{imports:[1]},adCreatives:{items:[1]},gbp:{listings:[1]},siteOnline:{url:'u'}},conflicts:1,saves:0};
 const ws={ConflictError,bind:(pid,mod)=>({load:async()=>JSON.parse(JSON.stringify(store.data)),save:async d=>{store.saves++;if(store.conflicts-->0){store.data.gbp={listings:[1,2]};throw new ConflictError('x')}store.data=JSON.parse(JSON.stringify(d))}})};
 const rec=S.auditRecord(au,{plan,by:'Anna',at:'2026-10-21T09:30:00.000Z'});
 assert.equal(rec.id,'audit-20261021093000');assert.equal(rec.host,'www.fornoaurora.it');assert.equal(rec.overall,au.scores.overall);assert.deepEqual(rec.areas,au.scores.areas);assert.ok(rec.issues.length<=40&&rec.issues[0].fix);
 assert.equal(rec.plan.phases['30'].length,3);assert.ok(!('crawl' in rec),'the raw crawl is not stored');assert.ok(JSON.stringify(rec).length<40000);
 await S.saveToProject(ws,'forno',rec);
 assert.equal(store.saves,2,'retried after the conflict');const d=store.data;
 assert.deepEqual(d.conversations,{'seo-geo':[{role:'user',content:'ciao'}]});assert.deepEqual(d.prefs,{x:1});assert.deepEqual(d.seoResults,{imports:[1]});assert.deepEqual(d.adCreatives,{items:[1]});assert.deepEqual(d.gbp,{listings:[1,2]},'the newer gbp is kept');assert.deepEqual(d.siteOnline,{url:'u'});
 assert.equal(d.siteAudit.audits.length,1);
 let s=d.siteAudit;for(let i=0;i<8;i++)s=S.addAudit(s,{...rec,id:'audit-'+i,overall:50+i});assert.equal(s.audits.length,6);
 assert.equal(S.previous(s,'www.fornoaurora.it','audit-7').id,'audit-6');assert.equal(S.previous(s,'altro.it'),null);
 assert.deepEqual(S.readStore({siteAudit:'x'}),{schemaVersion:1,audits:[]});
 const page=fs.readFileSync(path.join(root,'agents-page.js'),'utf8');
 assert.match(page,/if\(d\.siteAudit\)out\.siteAudit=d\.siteAudit;/);assert.match(page,/data\.gbp=fresh\.gbp;data\.siteAudit=fresh\.siteAudit;/);assert.match(page,/data\.siteAudit=fresh\.siteAudit;data\.seoResults/);
});
test('the card: «Analisi del sito» in Web e annunci, opens inline, free crawl and confirmed AI step; the crawl call',async()=>{
 const core=require('../agency/crea-core.js'),look=require('../agency/marketing-look.js'),c=core.card('analisi');
 assert.equal(c.group,'Web e annunci');assert.equal(c.inline,'audit');assert.equal(core.linkFor(c,'forno'),null);assert.match(c.cost,/^Nessuna chiamata AI/);assert.ok(look.has(look.CARDS.analisi));
 assert.deepEqual(core.fromQuery('?open=analisi'),{group:'Web e annunci',open:'analisi'});
 const html=fs.readFileSync(path.join(root,'agency/crea.html'),'utf8'),js=fs.readFileSync(path.join(root,'agency/crea.js'),'utf8'),lib=fs.readFileSync(path.join(root,'lib/site-audit.js'),'utf8');
 assert.match(html,/<script src="\/lib\/site-audit\.js"><\/script>/);assert.match(js,/audit:\{global:'RadixSiteAudit'/);assert.match(js,/S\.siteAudit\(/);
 assert.match(lib,/root\.confirm\('Preparare il piano 30\/60\/90/);assert.ok(!/https?:\/\/(?:cdn|unpkg|fonts)/.test(lib),'no external CDN');
 let sent=null;const d=await S.runCrawl('https://www.fornoaurora.it/',{fetch:async(u,o)=>{sent={u,o};return {ok:true,status:200,json:async()=>({pages:[]})}}});
 assert.equal(sent.u,'/api/integrations/site-audit');assert.equal(sent.o.method,'POST');assert.equal(sent.o.credentials,'same-origin');assert.deepEqual(JSON.parse(sent.o.body),{action:'crawl',url:'https://www.fornoaurora.it/'});assert.deepEqual(d,{pages:[]});
 await assert.rejects(S.runCrawl('x',{fetch:async()=>({ok:false,status:403,json:async()=>({error:'Il dominio punta a un indirizzo privato'})})}),/privato/);
});
