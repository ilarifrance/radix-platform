/* Studio «Analisi del sito»: the SEO and GEO audit of the client's existing website, as a guided flow.
   1) Three questions (address, goal, main services and city).
   2) The crawl, free and without AI: api/_site_audit.js reads robots.txt, the first sitemap, llms.txt, the home page and up
      to 24 more pages, checks the internal links and, when the server has the key, Core Web Vitals from PageSpeed Insights.
      Here the data becomes a score per area (Tecnico, Contenuti, Dati strutturati, SEO locale, GEO · pronti per le AI) and a
      list of problems, each with its severity (alta, media, bassa), the pages, the evidence and how to fix it. Nothing is
      invented: what was not measured (Core Web Vitals without the key, backlinks, rankings) is said so.
   3) Optional: ONE AI call, confirmed, to the SEO and GEO specialist, who turns the problems into a 30/60/90-day plan and
      rewrites title and meta description of the main pages. The prompt carries only the crawl data; every action must cite
      the problems it comes from, pages outside the crawl and numbers that are not in the data are flagged here.
   Export: CSV of the problems (and of the plan), a report to print or save as PDF (HTML print view). Save: the «agents»
   document of the project, key siteAudit (a summary per audit, every other key kept, also by the Agenti AI page).
   Pure part (questions, checks, scores, prompt, parsing, CSV, report, saved records) runs in Node for the tests;
   siteAudit() is the browser widget. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixSiteAudit=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const AGENT='seo-geo',ENDPOINT='/api/integrations/site-audit',MAX_AUDITS=6,MAX_SERVICES=8,FIELD_MAX=120,PLAN_PAGES=6;
function lib(name,file){if(root[name])return root[name];try{return typeof require==='function'?require(file):null}catch(e){return null}}
const copyLib=()=>lib('RadixCopyStudio','./copy-studio.js'),adLib=()=>lib('RadixAdStudio','./ad-studio.js'),csvLib=()=>lib('RadixCrmCsv','../sales/crm-csv-core.js');
const clean=s=>String(s==null?'':s).replace(/\s+/g,' ').trim();
const chars=s=>[...String(s==null?'':s)].length;
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const slug=s=>norm(s).replace(/ /g,'-').slice(0,48);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// ---- 1) the questions ----
const GOALS=Object.freeze([['contatti','Più contatti','più chiamate, richieste e contatti dal sito'],['locale','Visibilità locale','farsi trovare da chi cerca nella propria zona (ricerche locali e Google Maps)'],
 ['ai','Citati dalle AI','essere citati nelle risposte degli assistenti AI e nelle risposte AI di Google'],['ecommerce','Vendere online','vendere prodotti online']]);
const goalOf=v=>GOALS.find(g=>g[0]===v)?v:'contatti';
const goalLabel=v=>GOALS.find(g=>g[0]===goalOf(v))[1];
// The address the person typed: «esempio.it», «www.esempio.it/x» or a full URL; http:// becomes https://. Throws when it is not one.
function siteUrl(v){let s=clean(v);if(!s)throw Error('Scrivi l’indirizzo del sito (es. www.esempio.it).');
 if(/^http:\/\//i.test(s))s='https://'+s.slice(7);else if(!/^https:\/\//i.test(s))s='https://'+s;
 let u;try{u=new URL(s)}catch(e){u=null}
 if(!u||!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(u.hostname)||/^\d+(\.\d+){3}$/.test(u.hostname)||/\s/.test(clean(v)))throw Error('L’indirizzo del sito non sembra valido (es. www.esempio.it).');
 return u.origin+(u.pathname==='/'?'/':u.pathname)}
const serviceList=v=>[...new Set((Array.isArray(v)?v:String(v||'').split(/\n|,|;/)).map(x=>clean(x).slice(0,FIELD_MAX)).filter(x=>x.length>=2))].slice(0,MAX_SERVICES);
function normalize(answers){const a=answers||{};return {url:clean(a.url).slice(0,300),goal:goalOf(a.goal),services:serviceList(a.services),city:clean(a.city).slice(0,FIELD_MAX)}}
function validate(answers){const a=normalize(answers);a.url=siteUrl(a.url);return a}
// The project (RadixAgents.profileFor) → the first site among its links, and a city when the profile names one of the usual words.
function prefill(project){const p=project||{},link=(String(p.links||'').match(/https?:\/\/[^\s,;)<>"']+/i)||[''])[0].replace(/[.]+$/,'');
 const text=[p.summary,p.positioning,p.audience,p.notes].join(' '),city=(/\b(?:a|di|in|zona)\s+([A-ZÀ-Ü][a-zà-ü]+(?:\s+[A-ZÀ-Ü][a-zà-ü]+)?)\b/.exec(text)||[])[1]||'';
 return {url:link,goal:/local|quartier|negozio|zona|citt/i.test(text)?'locale':'contatti',services:[],city:/^(?:Il|La|Lo|Le|Gli|I|Un|Una)$/.test(city)?'':city}}

// ---- 2) the checks ----
const AREAS=Object.freeze([{id:'tecnico',label:'Tecnico',hint:'Indicizzazione, robots, sitemap, link, HTTPS, velocità'},{id:'contenuti',label:'Contenuti',hint:'Title, meta description, H1, testi, alt delle immagini'},
 {id:'dati',label:'Dati strutturati',hint:'schema.org in JSON-LD: attività, articoli, FAQ, breadcrumb'},{id:'locale',label:'SEO locale',hint:'Nome, indirizzo e telefono, città, pagina contatti'},
 {id:'geo',label:'GEO · pronti per le AI',hint:'Chi siamo, FAQ, autori, entità chiara, crawler AI'}]);
const SEVERITY=Object.freeze({alta:{label:'Alta',weight:20,rank:0},media:{label:'Media',weight:9,rank:1},bassa:{label:'Bassa',weight:3.5,rank:2}});
// Weight of each area in the overall score, by goal.
const WEIGHTS=Object.freeze({contatti:{tecnico:.3,contenuti:.25,dati:.15,locale:.15,geo:.15},locale:{tecnico:.25,contenuti:.2,dati:.15,locale:.25,geo:.15},
 ai:{tecnico:.25,contenuti:.2,dati:.2,locale:.1,geo:.25},ecommerce:{tecnico:.35,contenuti:.3,dati:.15,locale:.05,geo:.15}});
const LIMITS=Object.freeze({titleMax:60,titleMin:20,descMax:155,descMin:70,thinWords:250,slowMs:2000,heavyHtml:500*1024,deepLinks:2});
// Core Web Vitals «good» at the 75th percentile (web.dev): LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1; «poor» above 4 s, 500 ms, 0.25.
const CWV=Object.freeze({lcpMs:{good:2500,poor:4000,label:'LCP',unit:'s'},inpMs:{good:200,poor:500,label:'INP',unit:'ms'},cls:{good:.1,poor:.25,label:'CLS',unit:''}});
const cwvRating=(k,v)=>v==null?null:v<=CWV[k].good?'buono':v<=CWV[k].poor?'da migliorare':'scarso';
const cwvText=(k,v)=>v==null?'—':k==='lcpMs'?(v/1000).toLocaleString('it-IT',{maximumFractionDigits:1})+' s':k==='inpMs'?Math.round(v)+' ms':(Math.round(v*100)/100).toLocaleString('it-IT');
const SEARCH_AI=['oai-searchbot','chatgpt-user','perplexitybot'];
const nPages=k=>k===1?'1 pagina':k+' pagine';
const pathOf=u=>{try{const x=new URL(u);return (x.pathname||'/')+x.search}catch(e){return String(u||'')}};
const htmlPages=crawl=>((crawl&&crawl.pages)||[]).filter(p=>p&&p.status>=200&&p.status<300&&typeof p.words==='number');
const contentPages=crawl=>htmlPages(crawl).filter(p=>!p.noindex&&p.kind!=='legal');
const has=(text,needle)=>{const t=' '+norm(text)+' ',n=norm(needle);return !!n&&t.includes(' '+n)};
function groupsBy(list,key){const m=new Map();for(const p of list){const k=key(p);if(!k)continue;if(!m.has(k))m.set(k,[]);m.get(k).push(p)}return [...m.values()].filter(g=>g.length>1)}
const LANG=/^(?:x-default|[a-z]{2,3}(?:-[A-Za-z]{4})?(?:-(?:[A-Za-z]{2}|\d{3}))?)$/i;
// Each check: {id, area, severity, title, evidence, pages:[url], fix}. Pure: crawl data in, problems out.
function checks(crawl,answers){const a=normalize(answers),out=[],all=htmlPages(crawl),pages=contentPages(crawl),robots=crawl.robots||{},sm=crawl.sitemap||{};
 const home=(crawl.pages||[]).find(p=>p.depth===0)||null,homeOk=home&&home.status>=200&&home.status<300&&typeof home.words==='number';
 const add=(id,area,severity,title,evidence,list,fix,extra)=>out.push({id,area,severity,title,evidence,pages:(list||[]).map(p=>typeof p==='string'?p:p.url).filter(Boolean).slice(0,40),count:(list||[]).length,fix,...(extra||{})});
 const local=a.goal==='locale';
 // ---- tecnico ----
 if(!homeOk)add('T-home','tecnico','alta','La home non risponde correttamente',home?'Risposta '+(home.status||home.error||'assente')+' per '+home.url:'Home non raggiungibile',home?[home.url]:[],'Controlla hosting e redirect: la home deve rispondere 200 su https.');
 if(robots.blocksGoogle||robots.blocksAll)add('T-robots-block','tecnico','alta','robots.txt blocca i motori di ricerca','«Disallow: /» per '+(robots.blocksGoogle?'Googlebot':'tutti i crawler')+' in '+robots.url,[],'Togli «Disallow: /» dal gruppo di Googlebot o da «User-agent: *»: oggi il sito non può essere letto da Google.');
 else if(robots.found===false&&!robots.error)add('T-robots','tecnico','bassa','Manca il file robots.txt','Risposta '+(robots.status||'assente')+' per '+(robots.url||'/robots.txt'),[],'Pubblica un robots.txt semplice con la riga «Sitemap:» che punta alla sitemap.');
 if(!sm.found)add('T-sitemap','tecnico','media','Manca la sitemap XML','Nessuna sitemap leggibile in '+(sm.url||'/sitemap.xml')+(sm.status?' (risposta '+sm.status+')':''),[],'Genera la sitemap (quasi tutti i CMS lo fanno: WordPress con Yoast o Rank Math) e inviala in Search Console.');
 else if(!sm.listedInRobots)add('T-sitemap-robots','tecnico','bassa','La sitemap non è indicata in robots.txt','Sitemap trovata in '+sm.url+' ma non elencata in robots.txt',[],'Aggiungi a robots.txt la riga «Sitemap: '+sm.url+'».');
 const broken=crawl.brokenLinks||[];
 if(broken.length)add('T-broken','tecnico','alta',broken.length===1?'1 link interno non funziona':broken.length+' link interni non funzionano',broken.slice(0,5).map(b=>pathOf(b.url)+' → '+(b.status||b.error)).join(' · '),[...new Set(broken.flatMap(b=>b.from||[]))],'Correggi o togli i link, oppure fai un redirect 301 dalla pagina sparita alla più simile.',{links:broken.slice(0,20).map(b=>({url:b.url,status:b.status||0}))});
 const errors=all.length?[]:[];(crawl.pages||[]).forEach(p=>{if(p.status>=500)errors.push(p)});
 if(errors.length)add('T-5xx','tecnico','alta','Errori del server','Risposta '+errors.map(p=>p.status).join(', '),errors,'Il server ha risposto con un errore: controlla i log dell’hosting o del CMS.');
 const chains=(crawl.pages||[]).filter(p=>(p.redirects||[]).length>=2);
 if(chains.length)add('T-chain','tecnico','media','Catene di redirect',chains.map(p=>p.redirects.length+' passaggi verso '+pathOf(p.url)).slice(0,3).join(' · '),chains,'Fai puntare ogni redirect direttamente all’indirizzo finale (un solo passaggio).');
 const redLinks=crawl.redirectedLinks||[];
 if(redLinks.length)add('T-redirect-links','tecnico','bassa','Link interni che passano da un redirect',redLinks.slice(0,3).map(r=>pathOf(r.url)+' → '+pathOf(r.to)).join(' · '),[...new Set(redLinks.flatMap(r=>r.from||[]))],'Aggiorna i link perché puntino subito all’indirizzo finale.');
 if(homeOk&&home.noindex)add('T-noindex-home','tecnico','alta','La home è esclusa da Google (noindex)','robots: «'+home.robots+'»',[home],'Togli «noindex» dal meta robots (o dall’intestazione X-Robots-Tag) della home.');
 const noidx=all.filter(p=>p.noindex&&p.depth!==0&&p.kind!=='legal');
 if(noidx.length)add('T-noindex','tecnico','media','Pagine escluse da Google (noindex)',nPages(noidx.length)+' con noindex',noidx,'Verifica che sia voluto: se la pagina deve comparire su Google togli «noindex».');
 const noCanon=pages.filter(p=>!p.canonical);
 if(noCanon.length)add('T-canonical','tecnico','media','Manca il tag canonical',nPages(noCanon.length)+' su '+pages.length,noCanon,'Aggiungi in ogni pagina <link rel="canonical"> con il suo indirizzo definitivo (https, con o senza www come il resto del sito).');
 const otherCanon=pages.filter(p=>{if(!p.canonical)return false;try{const c=new URL(p.canonical),u=new URL(p.url);return c.hostname!==u.hostname}catch(e){return true}});
 if(otherCanon.length)add('T-canonical-host','tecnico','media','Il canonical punta a un altro dominio',otherCanon.slice(0,3).map(p=>pathOf(p.url)+' → '+p.canonical).join(' · '),otherCanon,'Fai puntare il canonical allo stesso dominio del sito (stessa versione con o senza www).');
 const active=all.filter(p=>p.mixed&&p.mixed.active>0),passive=all.filter(p=>p.mixed&&p.mixed.passive>0&&!(p.mixed.active>0));
 if(active.length)add('T-mixed-active','tecnico','alta','Script o fogli di stile caricati in http://',active[0].mixed.samples.slice(0,2).join(' · '),active,'Carica script, CSS e iframe in https://: i browser li bloccano e la pagina può rompersi.');
 if(passive.length)add('T-mixed','tecnico','media','Immagini caricate in http:// (contenuto misto)',passive[0].mixed.samples.slice(0,2).join(' · '),passive,'Cambia gli indirizzi delle immagini in https:// (o in percorsi relativi).');
 const noViewport=all.filter(p=>!p.viewport);
 if(noViewport.length)add('T-viewport','tecnico','alta','Pagine non adatte al mobile (manca il viewport)',nPages(noViewport.length)+' senza <meta name="viewport">',noViewport,'Aggiungi <meta name="viewport" content="width=device-width, initial-scale=1"> nell’head del tema.');
 const noLang=all.filter(p=>!p.lang);
 if(noLang.length)add('T-lang','tecnico','bassa','Manca la lingua della pagina',nPages(noLang.length)+' senza lang nel tag <html>',noLang,'Imposta <html lang="it"> nel tema.');
 const jsOnly=all.filter(p=>p.jsOnly);
 if(jsOnly.length)add('T-js','tecnico','alta','Testo visibile solo con JavaScript',nPages(jsOnly.length)+' con meno di 40 parole nell’HTML',jsOnly,'Fai generare il testo lato server (rendering o pre-rendering): motori e assistenti AI leggono male le pagine vuote senza JavaScript.');
 const slow=all.filter(p=>p.ms>LIMITS.slowMs);
 if(slow.length)add('T-slow','tecnico','media','Il server risponde lentamente',slow.slice(0,3).map(p=>pathOf(p.url)+' in '+(p.ms/1000).toLocaleString('it-IT',{maximumFractionDigits:1})+' s').join(' · ')+' (misurato dal server RADIX)',slow,'Attiva cache di pagina e compressione, controlla hosting e plugin: oltre 2 secondi solo per l’HTML è tanto.');
 const heavy=all.filter(p=>p.truncated||p.bytes>LIMITS.heavyHtml);
 if(heavy.length)add('T-heavy','tecnico','bassa','HTML molto pesante',heavy.slice(0,3).map(p=>pathOf(p.url)+' '+Math.round(p.bytes/1024)+' KB'+(p.truncated?' (oltre 2 MB)':'')).join(' · '),heavy,'Riduci l’HTML: codice inline, builder e script di terze parti appesantiscono ogni pagina.');
 if(homeOk&&home.hsts===false)add('T-hsts','tecnico','bassa','Manca HSTS','La home non invia Strict-Transport-Security',[home],'Attiva HSTS sul server o sul CDN: il browser userà sempre https.');
 const badLang=all.filter(p=>(p.hreflang||[]).some(h=>!LANG.test(h.lang)));
 if(badLang.length)add('T-hreflang','tecnico','bassa','Codici hreflang non validi',badLang[0].hreflang.filter(h=>!LANG.test(h.lang)).map(h=>h.lang).slice(0,4).join(', '),badLang,'Usa codici lingua ISO (it, en, de-CH…) o x-default.');
 const ps=crawl.pagespeed||{};
 if(ps.measured&&ps.field){for(const k of Object.keys(CWV)){const v=ps.field[k],r=cwvRating(k,v);if(r&&r!=='buono')add('T-cwv-'+k,'tecnico',r==='scarso'?'alta':'media',CWV[k].label+' '+r+' su mobile',CWV[k].label+' '+cwvText(k,v)+' al 75° percentile ('+(ps.fieldSource==='pagina'?'dati reali della home':'dati reali del sito')+'); buono ≤ '+cwvText(k,CWV[k].good),homeOk?[home]:[],
  k==='lcpMs'?'Alleggerisci l’immagine o il blocco principale in alto, precarica il font e riduci gli script che bloccano il caricamento.':k==='inpMs'?'Riduci il JavaScript che gira ai clic (chat, tracciamenti, slider): spezza i compiti lunghi e carica in differita.':'Dai larghezza e altezza a immagini, banner e iframe e riserva lo spazio ai contenuti che arrivano dopo (cookie, annunci).')}}
 else if(ps.measured&&ps.lab&&typeof ps.lab.score==='number'&&ps.lab.score<50)add('T-speed','tecnico','media','Prestazioni mobile basse (test di laboratorio)','Punteggio Lighthouse '+ps.lab.score+'/100 sulla home; dati reali degli utenti non disponibili',homeOk?[home]:[],'Ottimizza immagini, font e script: misura di nuovo su pagespeed.web.dev dopo gli interventi.');
 // ---- contenuti ----
 const noTitle=pages.filter(p=>!p.title);if(noTitle.length)add('C-title','contenuti','alta','Pagine senza title',nPages(noTitle.length),noTitle,'Scrivi un title unico per pagina: servizio o argomento + città o marca, entro 60 caratteri.');
 const longT=pages.filter(p=>p.title&&p.titleLength>LIMITS.titleMax);if(longT.length)add('C-title-long','contenuti','bassa','Title troppo lunghi',longT.slice(0,3).map(p=>p.titleLength+' caratteri: «'+p.title+'»').join(' · '),longT,'Accorcia entro 60 caratteri: Google taglia il resto. Metti all’inizio le parole importanti.');
 const shortT=pages.filter(p=>p.title&&p.titleLength<LIMITS.titleMin);if(shortT.length)add('C-title-short','contenuti','bassa','Title troppo brevi',shortT.slice(0,3).map(p=>'«'+p.title+'»').join(' · '),shortT,'Aggiungi cosa offre la pagina e dove (es. «Torte su ordinazione a Torino · Forno Aurora»).');
 const dupT=groupsBy(pages.filter(p=>p.title),p=>norm(p.title));if(dupT.length)add('C-title-dup','contenuti','media','Title duplicati',dupT.slice(0,3).map(g=>'«'+g[0].title+'» su '+g.length+' pagine').join(' · '),dupT.flat(),'Ogni pagina deve avere un title diverso, che dica di cosa parla proprio quella pagina.');
 const noDesc=pages.filter(p=>!p.description);if(noDesc.length)add('C-desc','contenuti','media','Manca la meta description',nPages(noDesc.length)+' su '+pages.length,noDesc,'Scrivi una descrizione di 120-155 caratteri: cosa trova chi clicca e un invito all’azione.');
 const longD=pages.filter(p=>p.description&&p.descriptionLength>LIMITS.descMax);if(longD.length)add('C-desc-long','contenuti','bassa','Meta description troppo lunghe',longD.slice(0,3).map(p=>p.descriptionLength+' caratteri').join(' · '),longD,'Stai entro 155 caratteri.');
 const shortD=pages.filter(p=>p.description&&p.descriptionLength<LIMITS.descMin);if(shortD.length)add('C-desc-short','contenuti','bassa','Meta description troppo brevi',shortD.slice(0,3).map(p=>'«'+p.description+'»').join(' · '),shortD,'Porta la descrizione a 120-155 caratteri con servizio, luogo e invito all’azione.');
 const dupD=groupsBy(pages.filter(p=>p.description),p=>norm(p.description));if(dupD.length)add('C-desc-dup','contenuti','bassa','Meta description duplicate',dupD.length+' gruppi di pagine con la stessa descrizione',dupD.flat(),'Scrivi una descrizione diversa per ogni pagina.');
 const noH1=pages.filter(p=>!p.h1Count);if(noH1.length)add('C-h1','contenuti','media','Manca il titolo H1',nPages(noH1.length)+' senza H1',noH1,'Dai a ogni pagina un solo H1 che dica l’argomento (può essere simile al title).');
 const manyH1=pages.filter(p=>p.h1Count>1);if(manyH1.length)add('C-h1-many','contenuti','bassa','Più di un H1 nella stessa pagina',manyH1.slice(0,3).map(p=>pathOf(p.url)+': '+p.h1Count+' H1').join(' · '),manyH1,'Tieni un solo H1 per pagina; gli altri titoli diventano H2.');
 const thin=pages.filter(p=>p.words<LIMITS.thinWords&&p.kind!=='contact'&&!p.jsOnly);if(thin.length)add('C-thin','contenuti','media','Pagine con poco testo',thin.slice(0,3).map(p=>pathOf(p.url)+': '+p.words+' parole').join(' · '),thin,'Arricchisci con quello che il cliente chiede davvero: cosa, per chi, come, dove, tempi, domande frequenti. Almeno 300 parole utili.');
 const alt=all.filter(p=>p.images&&p.images.withoutAlt>0),altN=alt.reduce((n,p)=>n+p.images.withoutAlt,0);
 if(altN)add('C-alt','contenuti','media',altN===1?'1 immagine senza testo alternativo':altN+' immagini senza testo alternativo','In '+nPages(alt.length),alt,'Aggiungi l’attributo alt che descrive l’immagine (vuoto solo per le immagini decorative).');
 if(homeOk&&(!home.og||!home.og.title||!home.og.image))add('C-og','contenuti','bassa','Anteprima social incompleta (Open Graph)','Mancano '+[!home.og||!home.og.title?'og:title':'',!home.og||!home.og.image?'og:image':''].filter(Boolean).join(' e ')+' sulla home',[home],'Aggiungi og:title, og:description e og:image (1200×630): i link condivisi su social e chat avranno titolo e immagine.');
 const corpus=all.map(p=>[p.title,p.description,(p.h1||[]).join(' '),(p.headings||[]).join(' '),p.textSample].join(' ')).join(' ');
 const missing=a.services.filter(s=>!norm(s).split(' ').filter(w=>w.length>3).every(w=>has(corpus,w)));
 if(missing.length&&all.length)add('C-services','contenuti','media',missing.length===1?'Un servizio principale non ha spazio sul sito':missing.length+' servizi principali non hanno spazio sul sito',missing.map(s=>'«'+s+'»').join(', ')+' non compare nelle pagine analizzate',[],'Dedica a ogni servizio principale una pagina (o almeno una sezione con H2) con il suo nome, per chi è e dove.',{services:missing});
 // ---- dati strutturati ----
 const ldPages=all.filter(p=>p.jsonld&&p.jsonld.blocks>0),types=new Set(all.flatMap(p=>(p.jsonld&&p.jsonld.types)||[]));
 const org=(all.find(p=>p.jsonld&&p.jsonld.org)||{jsonld:{}}).jsonld.org||null;
 if(!ldPages.length&&all.length)add('D-none','dati','alta','Nessun dato strutturato (schema.org)','Nessun blocco JSON-LD nelle '+all.length+' pagine',[],'Aggiungi in JSON-LD almeno Organization o LocalBusiness (nome, logo, indirizzo, telefono, orari, sameAs) e WebSite nella home.');
 else if(!org&&all.length)add('D-org','dati',local?'alta':'media','Manca la scheda dell’attività (Organization o LocalBusiness)','Tipi trovati: '+([...types].slice(0,6).join(', ')||'nessuno'),homeOk?[home]:[],'Aggiungi nella home un JSON-LD LocalBusiness (o il tipo più preciso: Bakery, Dentist…) con nome, indirizzo, telefono, orari, logo e sameAs, uguali al testo visibile.');
 const ldErr=all.filter(p=>p.jsonld&&p.jsonld.errors>0);if(ldErr.length)add('D-errors','dati','media','Dati strutturati non leggibili',ldErr.length+(ldErr.length===1?' pagina con JSON-LD non valido':' pagine con JSON-LD non valido'),ldErr,'Correggi il JSON (virgolette, virgole) e verificalo con il Test dei risultati multimediali di Google.');
 if(org&&(!org.address||!org.telephone))add('D-org-nap','dati','media','Scheda attività senza '+[!org.address?'indirizzo':'',!org.telephone?'telefono':''].filter(Boolean).join(' e '),'Tipo '+org.type+(org.name?' «'+org.name+'»':''),homeOk?[home]:[],'Completa address (PostalAddress) e telephone, identici a quelli scritti nel sito e nella scheda Google.');
 const posts=pages.filter(p=>p.kind==='post'),noArticle=posts.filter(p=>!((p.jsonld&&p.jsonld.types)||[]).some(t=>/Article|BlogPosting|NewsArticle/.test(t)));
 if(noArticle.length)add('D-article','dati','bassa','Articoli senza schema Article',noArticle.length+' articoli',noArticle,'Aggiungi BlogPosting o Article con headline, autore, data di pubblicazione e immagine.');
 const qPages=pages.filter(p=>p.questions>=2&&!((p.jsonld&&p.jsonld.types)||[]).includes('FAQPage'));
 if(qPages.length)add('D-faq','dati','bassa','Domande e risposte senza markup FAQ',qPages.slice(0,3).map(p=>pathOf(p.url)+': '+p.questions+' domande').join(' · '),qPages,'Il markup FAQPage, uguale al testo, rende esplicite domande e risposte per motori e assistenti AI. Su Google i risultati FAQ arricchiti oggi compaiono solo per pochi siti: non aspettarti il riquadro.');
 const deep=pages.filter(p=>pathOf(p.url).split('/').filter(Boolean).length>=LIMITS.deepLinks&&!(p.jsonld&&p.jsonld.breadcrumb));
 if(deep.length)add('D-breadcrumb','dati','bassa','Pagine interne senza breadcrumb',nPages(deep.length)+' a due o più livelli',deep,'Aggiungi il percorso (Home › Sezione › Pagina) visibile e il markup BreadcrumbList.');
 // ---- locale ----
 const phoneSets=all.map(p=>({p,phones:p.phones||[]})),phones=[...new Set(phoneSets.flatMap(x=>x.phones))];
 if(!phones.length&&all.length)add('L-phone','locale',local?'alta':'media','Nessun numero di telefono sul sito','Nessun telefono trovato nel testo, nei link tel: o nei dati strutturati',[],'Metti il telefono in ogni pagina (intestazione o piè di pagina) come link tel: cliccabile.');
 else if(phones.length>1){const where=phones.map(n=>n+' ('+phoneSets.filter(x=>x.phones.includes(n)).length+' pag.)');add('L-nap','locale','media','Numeri di telefono diversi tra le pagine',where.slice(0,4).join(' · '),phoneSets.filter(x=>x.phones.length&&x.phones.some(n=>n!==phones[0])).map(x=>x.p),'Verifica che sia voluto: nome, indirizzo e telefono devono essere identici su sito, scheda Google e directory. Usa un solo numero principale.',{phones})}
 const hasAddr=all.some(p=>p.hasAddress)||!!(org&&org.address&&(org.address.street||org.address.city));
 if(!hasAddr&&all.length)add('L-address','locale',local?'alta':'media','Indirizzo non trovato','Nessun indirizzo (via, piazza…) nel testo o nei dati strutturati',[],'Scrivi l’indirizzo completo nel piè di pagina e nella pagina contatti, identico alla scheda Google.');
 const cityParts=a.city.split(/,|\/|\be\b/).map(clean).filter(x=>x.length>=2);
 if(cityParts.length&&homeOk&&!cityParts.some(c=>has([home.title,home.description,(home.h1||[]).join(' '),home.textSample].join(' '),c)))add('L-city','locale',local?'alta':'media','La home non nomina la città','«'+a.city+'» non compare in title, description, H1 o testo della home',[home],'Nomina la città (o la zona) nel title, nell’H1 o nel primo paragrafo della home.');
 const contact=all.some(p=>p.kind==='contact')||all.some(p=>(p.links&&p.links.internal||[]).some(u=>/contatt|contact|dove-siamo/i.test(pathOf(u))));
 if(!contact&&all.length)add('L-contact','locale','media','Manca una pagina contatti','Nessuna pagina «Contatti» o «Dove siamo» tra quelle trovate',[],'Crea la pagina Contatti con indirizzo, mappa, orari, telefono e modulo.');
 if(phones.length&&!all.some(p=>p.telLinks>0))add('L-tel','locale','bassa','Telefono non cliccabile','Il numero c’è ma non è un link tel:',[],'Rendi il numero un link <a href="tel:+39…">: da mobile si chiama con un tocco.');
 if(local&&!(org&&org.hasHours)&&!/\borari\b|\borario\b|\baperti\b|\bapertura\b/i.test(all.map(p=>p.textSample).join(' ')))add('L-hours','locale','bassa','Orari non indicati','Nessun orario nel testo o nei dati strutturati',[],'Scrivi gli orari nel sito (e openingHoursSpecification nel JSON-LD), uguali alla scheda Google.');
 // ---- GEO ----
 const about=all.some(p=>p.kind==='about')||all.some(p=>(p.links&&p.links.internal||[]).some(u=>/chi-?siamo|about|azienda|storia/i.test(pathOf(u))));
 if(!about&&all.length)add('G-about','geo','media','Manca la pagina «Chi siamo»','Nessuna pagina su chi siete tra quelle trovate',[],'Crea «Chi siamo» con storia, persone, competenze, anni di attività, dove siete: gli assistenti AI citano chi si presenta in modo chiaro e verificabile.');
 const faq=all.some(p=>p.kind==='faq'||((p.jsonld&&p.jsonld.types)||[]).includes('FAQPage'))||all.reduce((n,p)=>n+(p.questions||0),0)>=3;
 if(!faq&&all.length)add('G-faq','geo','media','Nessuna pagina di domande frequenti','Né pagina FAQ né titoli in forma di domanda',[],'Scrivi le 10 domande che i clienti fanno davvero, con risposte brevi e precise: sono il formato che assistenti AI e risposte di Google riprendono più spesso.');
 const noAuthor=posts.filter(p=>!p.author&&!(p.jsonld&&p.jsonld.author));
 if(noAuthor.length)add('G-author','geo','bassa','Articoli senza autore',noAuthor.length+' articoli',noAuthor,'Firma gli articoli con nome e ruolo (e una breve bio): rende chiaro chi parla e con quale competenza.');
 if(org&&!(org.sameAs||[]).length&&!(all.find(p=>p.jsonld&&p.jsonld.sameAs&&p.jsonld.sameAs.length)))add('G-sameas','geo','bassa','L’attività non è collegata ai suoi profili','Nessun sameAs nei dati strutturati',homeOk?[home]:[],'Aggiungi sameAs con scheda Google, social e directory: aiuta motori e AI a riconoscere che sono la stessa entità.');
 const aiBlocked=robots.aiBlocked||[],searchBlocked=aiBlocked.filter(b=>SEARCH_AI.includes(b.agent)),trainBlocked=aiBlocked.filter(b=>!SEARCH_AI.includes(b.agent));
 if(searchBlocked.length)add('G-ai-search','geo','media','robots.txt blocca la ricerca degli assistenti AI',searchBlocked.map(b=>b.label).join(', '),[],'Se volete essere citati nelle risposte di ChatGPT o Perplexity, togli il blocco per questi crawler (è una scelta del cliente).');
 if(trainBlocked.length)add('G-ai-train','geo','bassa','robots.txt blocca crawler AI di addestramento',trainBlocked.map(b=>b.label).join(', '),[],'Scelta legittima: non toglie il sito da Google né dalle risposte AI di Google. Verifica solo che sia una decisione presa.');
 const nosnip=pages.filter(p=>p.nosnippet);if(nosnip.length)add('G-nosnippet','geo','media','Pagine che vietano l’anteprima (nosnippet)',nPages(nosnip.length),nosnip,'Togli nosnippet o max-snippet:0: Google le usa per decidere cosa mostrare, anche nelle risposte AI.');
 if(homeOk&&(home.words<150||!home.description))add('G-entity','geo','media','La home non spiega chi siete, cosa fate e dove',home.words+' parole'+(home.description?'':', senza meta description'),[home],'Apri la home con una frase chiara: chi siete, cosa offrite, a chi e dove. Poi i servizi con un paragrafo ciascuno.');
 return out.sort((x,y)=>SEVERITY[x.severity].rank-SEVERITY[y.severity].rank||AREAS.findIndex(a=>a.id===x.area)-AREAS.findIndex(a=>a.id===y.area))}
// What was not measured or is informative only: shown, never scored.
function notes(crawl){const out=[],ps=crawl.pagespeed||{};
 out.push(ps.measured?{id:'cwv',text:'Core Web Vitals da PageSpeed Insights (mobile)'+(ps.field?', dati reali degli utenti ('+(ps.fieldSource==='pagina'?'home':'tutto il sito')+').':': dati reali non disponibili, solo test di laboratorio.')}:{id:'cwv',text:ps.reason||'Core Web Vitals non misurati.'});
 out.push({id:'llms',text:crawl.llms&&crawl.llms.found?'llms.txt presente. È informativo: Google dice che per le sue funzioni AI non servono file speciali.':'llms.txt assente. Solo informativo: Google dice che per le sue funzioni AI non servono file speciali, e non incide sul punteggio.'});
 const sk=crawl.skipped||{};if(sk.robots&&sk.robots.length)out.push({id:'robots',text:(sk.robots.length===1?'1 pagina non letta':sk.robots.length+' pagine non lette')+' perché robots.txt lo chiede.'});
 if(sk.limit)out.push({id:'limit',text:'Lette '+htmlPages(crawl).length+' pagine (limite '+((crawl.limits||{}).maxPages||25)+'): altre '+sk.limit+' trovate ma non analizzate.'});
 if(crawl.budgetHit)out.push({id:'budget',text:'Tempo dell’analisi esaurito: alcune pagine o alcuni link non sono stati controllati.'});
 out.push({id:'scope',text:'Non misurati qui: backlink, posizioni su Google, volumi di ricerca, traffico. Servono Search Console («Risultati SEO») o strumenti dedicati.'});
 (crawl.notes||[]).forEach((t,i)=>out.push({id:'n'+i,text:t}));
 return out}
// 0-100 per area: each problem takes its severity's weight, scaled by how many pages it touches; overall = goal-weighted.
function scores(issues,crawl,answers){const a=normalize(answers),n=Math.max(1,contentPages(crawl).length||htmlPages(crawl).length),areas={};
 for(const ar of AREAS){let loss=0;for(const i of issues.filter(x=>x.area===ar.id)){const spread=i.count&&i.pages.length?.7+.3*Math.min(1,i.count/n):1;loss+=SEVERITY[i.severity].weight*spread}
  areas[ar.id]=Math.max(0,Math.min(100,Math.round(100-loss)))}
 const w=WEIGHTS[a.goal];const overall=Math.round(AREAS.reduce((s,ar)=>s+areas[ar.id]*w[ar.id],0));
 return {overall,areas,weights:w}}
const grade=s=>s>=85?{id:'good',label:'Buono'}:s>=60?{id:'fair',label:'Da migliorare'}:{id:'poor',label:'Critico'};
// The whole audit from the crawl data: problems, scores, notes, counts.
function analyze(crawl,answers){const a=normalize(answers),issues=checks(crawl||{},a),sc=scores(issues,crawl||{},a);
 const counts={alta:0,media:0,bassa:0};issues.forEach(i=>counts[i.severity]++);
 const pages=htmlPages(crawl||{});
 return {url:crawl.finalUrl||crawl.url,host:crawl.host,at:crawl.startedAt,answers:a,issues,scores:sc,grade:grade(sc.overall),counts,notes:notes(crawl||{}),
  facts:{pages:pages.length,fetched:(crawl.pages||[]).length,robots:!!(crawl.robots&&crawl.robots.found),sitemap:!!(crawl.sitemap&&crawl.sitemap.found),sitemapUrls:(crawl.sitemap&&crawl.sitemap.urls)||0,
   llms:!!(crawl.llms&&crawl.llms.found),broken:(crawl.brokenLinks||[]).length,linkChecks:crawl.linkChecks||null,durationMs:crawl.durationMs||0,aiBlocked:((crawl.robots&&crawl.robots.aiBlocked)||[]).map(b=>b.label)},
  pagespeed:crawl.pagespeed||{measured:false},crawl}}
const issuesFor=(audit,url)=>audit.issues.filter(i=>i.pages.includes(url));
// The pages worth rewriting first: home, then the most linked kinds (about, contact, services), then by depth; content only.
function topPages(audit,max){const pages=contentPages(audit.crawl||{}),rank=p=>p.depth===0?0:p.kind==='page'?1:p.kind==='about'?2:p.kind==='contact'?3:p.kind==='faq'?3:p.kind==='post'?4:5;
 return pages.slice().sort((x,y)=>rank(x)-rank(y)||(x.depth||0)-(y.depth||0)).slice(0,max||PLAN_PAGES)}

// ---- 3) the plan: one AI call, grounded on the crawl ----
function planData(audit){const a=audit.answers;
 return {sito:audit.url,obiettivo:goalLabel(a.goal),servizi:a.services,citta:a.city||null,punteggio:audit.scores.overall,aree:audit.scores.areas,
  problemi:audit.issues.slice(0,30).map(i=>({id:i.id,area:i.area,gravita:i.severity,problema:i.title,evidenza:String(i.evidence||'').slice(0,240),pagine:i.pages.slice(0,4).map(pathOf),n_pagine:i.count})),
  pagine:topPages(audit).map(p=>({url:p.url,tipo:p.kind,title:p.title||null,title_caratteri:p.titleLength,description:p.description||null,description_caratteri:p.descriptionLength,h1:(p.h1||[])[0]||null,parole:p.words,inizio_testo:String(p.textSample||'').slice(0,400)})),
  core_web_vitals:audit.pagespeed&&audit.pagespeed.measured?{dati_reali:audit.pagespeed.field||null,laboratorio:audit.pagespeed.lab||null}:'non misurati',
  non_misurato:['backlink','posizioni su Google','volumi di ricerca','traffico']}}
// What a number in the plan may come from: the texts of the data (titles, evidence, word counts, services, city) and the
// thresholds named in the prompt; not the scores or the character counts, so a «93%» cannot hide behind a score of 93.
function groundText(audit){const d=planData(audit);delete d.punteggio;delete d.aree;d.pagine=d.pagine.map(({title_caratteri,description_caratteri,...x})=>x);
 return JSON.stringify(d)+'\n30 60 90 giorni 60 155 caratteri 250 parole 2,5 200 0,1'}
function planPrompt(audit,{project}={}){if(!audit||!audit.issues)throw Error('Prima analizza il sito.');const p=project||{},d=planData(audit),L=[];
 L.push('Sei lo Specialista SEO e GEO. Trasforma l’analisi tecnica del sito qui sotto in un piano operativo a 30, 60 e 90 giorni e riscrivi title e meta description delle pagine principali'+(p.name?' per il progetto «'+clean(p.name).slice(0,80)+'»':'')+'.');
 L.push('Usa SOLO questi dati (crawl di RADIX, '+audit.facts.pages+' pagine). Non hai visitato il sito: non descrivere nulla che non sia nei dati. Non inventare posizioni su Google, volumi di ricerca, traffico, percentuali di crescita, tempi garantiti o altri numeri. Se un dato serve e manca, mettilo in «da_verificare».');
 L.push('Regole del piano: ogni azione cita in «problemi» gli id dei problemi da cui nasce (solo id dell’elenco); prima i problemi di gravità alta e quelli che toccano più pagine; 30 giorni = correzioni tecniche e di base, 60 = contenuti e dati strutturati, 90 = GEO, autorevolezza e misura. Da 3 a 6 azioni per fase, concrete (chi fa cosa, dove). Impatto e sforzo: alto, medio o basso.');
 L.push('Regole per title e meta: solo le pagine dell’elenco «pagine» (stesso url); title al massimo 60 caratteri, meta description al massimo 155, in italiano, con il servizio e'+(d.citta?' la città «'+d.citta+'»':' il luogo se è nei dati')+'; niente promesse, prezzi o numeri non presenti nei dati; niente maiuscole urlate né emoji.');
 L.push('DATI:\n'+JSON.stringify(d));
 L.push('Rispondi solo con un JSON valido, senza testo prima o dopo, in questa forma:');
 L.push('{"sintesi":"2-3 frasi","piano":{"30":[{"azione":"","perche":"","problemi":["T-..."],"pagine":["/percorso"],"impatto":"alto|medio|basso","sforzo":"alto|medio|basso"}],"60":[],"90":[]},"pagine":[{"url":"","title":"","meta":"","motivo":""}],"da_verificare":[""]}');
 return L.join('\n\n')}
function parseJson(text){const A=adLib();if(A&&typeof A.parseJson==='function')return A.parseJson(text);
 const raw=String(text||''),f=/```(?:json)?\s*\n?([\s\S]*?)```/i.exec(raw),body=f?f[1]:raw,s=body.indexOf('{'),e=body.lastIndexOf('}');if(s<0||e<=s)return null;try{return JSON.parse(body.slice(s,e+1))}catch(x){return null}}
function fit(s,max){const A=adLib();if(A&&typeof A.fit==='function')return A.fit(s,max);const t=[...String(s)];if(t.length<=max)return String(s);const c=t.slice(0,max).join(''),sp=c.lastIndexOf(' ');return (sp>max/2?c.slice(0,sp):c).replace(/[\s,;:–—-]+$/,'')}
// A title over the limit: first drop the last «| Marca» / «· Marca» / «- Marca» part when what is left fits, else cut.
function fitTitle(s,max){const t=clean(s);if(chars(t)<=max)return t;const m=/^(.*\S)\s+[|·•–—-]\s+[^|·•–—-]+$/.exec(t);if(m&&chars(m[1])<=max&&chars(m[1])>=max*.5)return m[1];return fit(t,max)}
function unverified(text,input){const C=copyLib();return C&&typeof C.unverifiedNumbers==='function'?C.unverifiedNumbers(text,input):[]}
// Phone numbers of the site written in any spacing («011 555 1234») are data, not invented numbers: removed before the check.
const PHONE=/(?:(?:\+|00)39[\s.\-/]?)?\d{2,4}(?:[\s.\-/]?\d{2,4}){1,3}/g;
function sitePhones(text,audit){const known=new Set(htmlPages(audit.crawl||{}).flatMap(p=>p.phones||[]));if(!known.size)return text;
 return String(text||'').replace(PHONE,m=>{const k=m.replace(/[^\d+]/g,'').replace(/^(?:\+|00)39/,'');return known.has(k)?' ':m})}
const level=v=>{const x=norm(v);return /^alt|^high/.test(x)?'alto':/^bass|^low/.test(x)?'basso':'medio'};
const PHASES=Object.freeze(['30','60','90']);
// The reply → {summary, phases:{30,60,90}, pages, toVerify, flags}; null when nothing usable is there.
// Grounding: problem ids not in the audit, pages not crawled and numbers that are not in the data are flagged on the item.
function parsePlan(text,audit){const d=parseJson(text);if(!d||typeof d!=='object')return null;
 const ids=new Set(audit.issues.map(i=>i.id)),byPath=new Map();htmlPages(audit.crawl||{}).forEach(p=>{byPath.set(pathOf(p.url),p.url);byPath.set(p.url,p.url)});
 const known=groundText(audit),pageOf=v=>{const s=clean(v);if(!s)return null;if(byPath.has(s))return byPath.get(s);try{const u=new URL(s,audit.url);return byPath.get(u.href)||byPath.get(pathOf(u.href))||null}catch(e){return null}};
 const planIn=d.piano||d.plan||d;const phases={};let total=0;
 for(const k of PHASES){const raw=planIn[k]||planIn['giorni_'+k]||planIn[k+'_giorni']||planIn[k+' giorni']||planIn['d'+k]||[];
  phases[k]=(Array.isArray(raw)?raw:[]).filter(x=>x&&typeof x==='object').slice(0,8).map(x=>{const flags=[],action=clean(x.azione||x.action||x.titolo).slice(0,300),why=clean(x.perche||x.perché||x.why||x.motivo).slice(0,400);
   const refsIn=[].concat(x.problemi||x.issues||x.problems||[]).map(r=>clean(r)),refs=refsIn.filter(r=>ids.has(r)),bad=refsIn.filter(r=>r&&!ids.has(r));
   if(!refsIn.length)flags.push('Non cita nessun problema dell’analisi: non nei dati.');if(bad.length)flags.push('Problemi non nell’analisi: '+bad.join(', ')+'.');
   const pin=[].concat(x.pagine||x.pages||[]).map(clean).filter(Boolean),pagesOk=pin.map(pageOf).filter(Boolean),pagesBad=pin.filter(v=>!pageOf(v));
   if(pagesBad.length)flags.push('Pagine non analizzate: '+pagesBad.slice(0,3).join(', ')+'.');
   const nums=unverified(sitePhones(action+'\n'+why,audit),known);if(nums.length)flags.push('Numeri non presenti nei dati: '+nums.join(', ')+'.');
   return {action,why,refs,pages:[...new Set(pagesOk)],impact:level(x.impatto||x.impact),effort:level(x.sforzo||x.effort),flags}}).filter(x=>x.action);total+=phases[k].length}
 const pagesIn=Array.isArray(d.pagine||d.pages)?(d.pagine||d.pages):[],seen=new Set(),pages=[];
 for(const x of pagesIn){if(!x||typeof x!=='object')continue;const flags=[],url=pageOf(x.url||x.pagina);
  if(!url){flags.push('Pagina non analizzata: '+clean(x.url||x.pagina).slice(0,120)+'.');continue}if(seen.has(url))continue;seen.add(url);
  let title=clean(x.title||x.titolo),meta=clean(x.meta||x.description||x.meta_description);const p=htmlPages(audit.crawl||{}).find(q=>q.url===url)||{};
  if(chars(title)>LIMITS.titleMax){flags.push('Title accorciato da '+chars(title)+' a '+LIMITS.titleMax+' caratteri.');title=fitTitle(title,LIMITS.titleMax)}
  if(chars(meta)>LIMITS.descMax){flags.push('Meta description accorciata da '+chars(meta)+' a '+LIMITS.descMax+' caratteri.');meta=fit(meta,LIMITS.descMax)}
  const nums=unverified(sitePhones(title+'\n'+meta,audit),known);if(nums.length)flags.push('Numeri non presenti nei dati: '+nums.join(', ')+'.');
  const TODO=/\[[^\]\n]{2,60}\]/;if(TODO.test(title+meta))flags.push('Contiene parti da completare tra parentesi quadre.');
  pages.push({url,oldTitle:p.title||'',oldMeta:p.description||'',title,meta,why:clean(x.motivo||x.why).slice(0,300),flags});if(pages.length>=PLAN_PAGES)break}
 if(!total&&!pages.length)return null;
 return {summary:clean(d.sintesi||d.summary).slice(0,700),phases,pages,toVerify:(Array.isArray(d.da_verificare)?d.da_verificare:Array.isArray(d.to_verify)?d.to_verify:[]).map(clean).filter(Boolean).slice(0,10),
  flags:PHASES.reduce((n,k)=>n+phases[k].filter(x=>x.flags.length).length,0)+pages.filter(x=>x.flags.length).length}}
// Title and meta rewritten by hand: the same limits and checks again.
function recheckPage(pg,audit){const flags=[];if(chars(pg.title)>LIMITS.titleMax)flags.push('Title oltre '+LIMITS.titleMax+' caratteri.');if(chars(pg.meta)>LIMITS.descMax)flags.push('Meta description oltre '+LIMITS.descMax+' caratteri.');
 if(!clean(pg.title))flags.push('Title vuoto.');const nums=unverified(sitePhones(pg.title+'\n'+pg.meta,audit),groundText(audit));if(nums.length)flags.push('Numeri non presenti nei dati: '+nums.join(', ')+'.');return flags}

// ---- export ----
const csvApi=()=>{const C=csvLib();if(C)return C;const safe=v=>{const s=v==null?'':String(v);return /^[=+\-@\t\r]/.test(s)?"'"+s:s};
 return {toCsv:(rows,cols)=>'﻿'+[cols.map(c=>c.label).join(';'),...rows.map(r=>cols.map(c=>{const s=safe(typeof c.value==='function'?c.value(r):r[c.key]);return /[";\n\r,]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}).join(';'))].join('\r\n')}};
const areaLabel=id=>(AREAS.find(a=>a.id===id)||{label:id}).label;
function issuesCsv(audit,plan){const rows=audit.issues.map(i=>({tipo:'problema',gravita:SEVERITY[i.severity].label,area:areaLabel(i.area),voce:i.title,dettaglio:i.evidence,pagine:i.pages.join(' '),come:i.fix,id:i.id}));
 if(plan){PHASES.forEach(k=>plan.phases[k].forEach(x=>rows.push({tipo:'piano '+k+' giorni',gravita:'',area:'',voce:x.action,dettaglio:x.why,pagine:x.pages.join(' '),come:'Impatto '+x.impact+', sforzo '+x.effort+(x.flags.length?' · Da verificare: '+x.flags.join(' '):''),id:x.refs.join(' ')})));
  plan.pages.forEach(p=>rows.push({tipo:'title e meta',gravita:'',area:'',voce:p.title,dettaglio:p.meta,pagine:p.url,come:p.why,id:''}))}
 return csvApi().toCsv(rows,[{label:'tipo',key:'tipo'},{label:'gravità',key:'gravita'},{label:'area',key:'area'},{label:'voce',key:'voce'},{label:'dettaglio',key:'dettaglio'},{label:'pagine',key:'pagine'},{label:'come risolvere',key:'come'},{label:'riferimento',key:'id'}])}
const fileName=(audit,ext)=>'analisi-sito-'+(slug(audit.host||'')||'sito')+'.'+ext;
// The report to print or save as PDF: a standalone light page (no external resources), Italian, A4.
function reportHtml(audit,{plan,brand,date,by}={}){const day=date||new Date().toISOString().slice(0,10),d=new Date(day+'T12:00:00Z').toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'});
 const ps=audit.pagespeed||{},g=audit.grade,L=[];
 const ring=(v,size)=>{const r=size/2-6,c=2*Math.PI*r,col=v>=85?'#0f9d63':v>=65?'#c98a12':'#d64545';return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 '+size+' '+size+'" aria-hidden="true"><circle cx="'+size/2+'" cy="'+size/2+'" r="'+r+'" fill="none" stroke="#e7e9f2" stroke-width="8"/><circle cx="'+size/2+'" cy="'+size/2+'" r="'+r+'" fill="none" stroke="'+col+'" stroke-width="8" stroke-linecap="round" stroke-dasharray="'+(c*v/100).toFixed(1)+' '+c.toFixed(1)+'" transform="rotate(-90 '+size/2+' '+size/2+')"/><text x="50%" y="54%" text-anchor="middle" font-size="'+Math.round(size*.3)+'" font-weight="700" fill="#141a33">'+v+'</text></svg>'};
 L.push('<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Analisi del sito · '+esc(audit.host)+'</title><style>');
 L.push('@page{size:A4;margin:16mm 14mm}*{box-sizing:border-box}body{margin:0;font:13px/1.5 Inter,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#141a33;background:#fff}main{max-width:900px;margin:0 auto;padding:32px 28px}'+
  'h1{font-size:26px;margin:4px 0 2px;letter-spacing:-.02em}h2{font-size:17px;margin:30px 0 10px;padding-bottom:6px;border-bottom:2px solid #141a33;break-after:avoid}h3{font-size:14px;margin:0}'+
  '.eyebrow{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#c2185b;font-weight:700}.muted{color:#5a6280}.head{display:flex;justify-content:space-between;gap:24px;align-items:center}'+
  '.areas{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:16px}.area{border:1px solid #e1e4ef;border-radius:10px;padding:10px;text-align:center}.area b{display:block;font-size:22px}.area span{font-size:11px;color:#5a6280}'+
  '.facts{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:14px;font-size:12px;color:#3b4366}.issue{border:1px solid #e1e4ef;border-left:4px solid #999;border-radius:8px;padding:10px 12px;margin:8px 0;break-inside:avoid}'+
  '.issue[data-s=alta]{border-left-color:#d64545}.issue[data-s=media]{border-left-color:#d9a21b}.issue[data-s=bassa]{border-left-color:#7b86a8}.sev{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:2px 7px;border-radius:99px;background:#f0f1f7;margin-right:6px}'+
  '.issue[data-s=alta] .sev{background:#fde8e8;color:#b42323}.issue[data-s=media] .sev{background:#fdf3dc;color:#8a5d00}.fix{margin:4px 0 0}.pages{font-size:11.5px;color:#5a6280;word-break:break-all}'+
  'table{width:100%;border-collapse:collapse;font-size:11.5px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e7e9f2;vertical-align:top}th{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:#5a6280}td.n{text-align:right;font-variant-numeric:tabular-nums}.bad{color:#b42323;font-weight:600}.warn{color:#8a5d00;font-weight:600}'+
  '.phase{border:1px solid #e1e4ef;border-radius:10px;padding:12px;margin:10px 0;break-inside:avoid}.phase li{margin:6px 0}.flag{color:#8a5d00;font-size:11.5px}.note{font-size:12px;color:#3b4366;margin:4px 0}'+
  '@media print{main{padding:0}a{color:inherit;text-decoration:none}}</style></head><body><main>');
 L.push('<div class="head"><div><div class="eyebrow">Analisi SEO e GEO del sito'+(brand?' · '+esc(brand):'')+'</div><h1>'+esc(audit.host)+'</h1><div class="muted">'+esc(d)+' · '+audit.facts.pages+' pagine analizzate · obiettivo: '+esc(goalLabel(audit.answers.goal))+(audit.answers.city?' · '+esc(audit.answers.city):'')+'</div></div>'+
  '<div style="text-align:center">'+ring(audit.scores.overall,108)+'<div style="font-weight:700">'+esc(g.label)+'</div></div></div>');
 L.push('<div class="areas">'+AREAS.map(a=>'<div class="area"><b>'+audit.scores.areas[a.id]+'</b><span>'+esc(a.label)+'</span></div>').join('')+'</div>');
 L.push('<div class="facts"><span>Problemi: <b>'+audit.counts.alta+'</b> alta · <b>'+audit.counts.media+'</b> media · <b>'+audit.counts.bassa+'</b> bassa</span><span>robots.txt: '+(audit.facts.robots?'sì':'no')+'</span><span>Sitemap: '+(audit.facts.sitemap?audit.facts.sitemapUrls+' URL':'no')+'</span><span>Link interni non funzionanti: '+audit.facts.broken+'</span><span>llms.txt: '+(audit.facts.llms?'sì':'no')+' (informativo)</span></div>');
 if(plan&&plan.summary)L.push('<h2>In sintesi</h2><p>'+esc(plan.summary)+'</p>');
 L.push('<h2>Core Web Vitals (mobile)</h2>');
 if(ps.measured&&ps.field)L.push('<table><tr><th>Metrica</th><th>Valore (75° percentile)</th><th>Soglia «buono»</th><th>Esito</th></tr>'+Object.keys(CWV).map(k=>'<tr><td>'+CWV[k].label+'</td><td>'+cwvText(k,ps.field[k])+'</td><td>≤ '+cwvText(k,CWV[k].good)+'</td><td'+(cwvRating(k,ps.field[k])==='scarso'?' class="bad"':cwvRating(k,ps.field[k])==='da migliorare'?' class="warn"':'')+'>'+(cwvRating(k,ps.field[k])||'—')+'</td></tr>').join('')+'</table><p class="note">Fonte: PageSpeed Insights, dati reali degli utenti Chrome ('+(ps.fieldSource==='pagina'?'home':'tutto il sito')+').</p>');
 else if(ps.measured)L.push('<p class="note">Dati reali degli utenti non disponibili. Test di laboratorio: punteggio '+(ps.lab&&ps.lab.score!=null?ps.lab.score+'/100':'—')+(ps.lab&&ps.lab.lcpMs!=null?', LCP '+cwvText('lcpMs',ps.lab.lcpMs):'')+'.</p>');
 else L.push('<p class="note">'+esc(ps.reason||'Non misurati.')+'</p>');
 L.push('<h2>Problemi e come risolverli</h2>');
 for(const i of audit.issues)L.push('<div class="issue" data-s="'+i.severity+'"><h3><span class="sev">'+SEVERITY[i.severity].label+'</span>'+esc(i.title)+' <span class="muted" style="font-weight:400">· '+esc(areaLabel(i.area))+'</span></h3>'+(i.evidence?'<div class="muted">'+esc(i.evidence)+'</div>':'')+'<p class="fix"><b>Come risolvere:</b> '+esc(i.fix)+'</p>'+(i.pages.length?'<div class="pages">'+i.pages.slice(0,6).map(esc).join(' · ')+(i.count>6?' · e altre '+(i.count-6):'')+'</div>':'')+'</div>');
 if(!audit.issues.length)L.push('<p>Nessun problema trovato nelle pagine analizzate.</p>');
 if(plan){L.push('<h2>Piano a 30, 60 e 90 giorni</h2>');
  for(const k of PHASES){if(!plan.phases[k].length)continue;L.push('<div class="phase"><h3>Entro '+k+' giorni</h3><ol>'+plan.phases[k].map(x=>'<li><b>'+esc(x.action)+'</b>'+(x.why?' — '+esc(x.why):'')+'<div class="muted">Impatto '+x.impact+' · sforzo '+x.effort+(x.refs.length?' · risolve: '+x.refs.map(r=>esc((audit.issues.find(i=>i.id===r)||{title:r}).title)).join('; '):'')+(x.pages.length?' · '+x.pages.map(p=>esc(pathOf(p))).join(', '):'')+'</div>'+(x.flags.length?'<div class="flag">Da verificare: '+x.flags.map(esc).join(' ')+'</div>':'')+'</li>').join('')+'</ol></div>')}
  if(plan.pages.length){L.push('<h2>Title e meta description riscritti</h2><table><tr><th>Pagina</th><th>Title</th><th>Meta description</th></tr>'+plan.pages.map(p=>'<tr><td>'+esc(pathOf(p.url))+'</td><td>'+esc(p.title)+' <span class="muted">('+chars(p.title)+')</span>'+(p.oldTitle?'<div class="muted">Prima: '+esc(p.oldTitle)+'</div>':'')+'</td><td>'+esc(p.meta)+' <span class="muted">('+chars(p.meta)+')</span>'+(p.flags.length?'<div class="flag">'+p.flags.map(esc).join(' ')+'</div>':'')+'</td></tr>').join('')+'</table>')}
  if(plan.toVerify.length)L.push('<h2>Da verificare</h2><ul>'+plan.toVerify.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul>')}
 const pages=htmlPages(audit.crawl||{});
 L.push('<h2>Pagine analizzate</h2><table><tr><th>Pagina</th><th>Stato</th><th>Title</th><th>Meta</th><th>H1</th><th>Parole</th></tr>'+(audit.crawl.pages||[]).map(p=>'<tr><td>'+esc(pathOf(p.url))+'</td><td class="n'+(p.status>=400||!p.status?' bad':'')+'">'+(p.status||'—')+'</td><td class="n'+(p.titleLength>LIMITS.titleMax||(!p.title&&pages.includes(p))?' bad':'')+'">'+(typeof p.words==='number'?p.titleLength||0:'')+'</td><td class="n'+(p.descriptionLength>LIMITS.descMax||(pages.includes(p)&&!p.description&&!p.noindex)?' bad':'')+'">'+(typeof p.words==='number'?p.descriptionLength||0:'')+'</td><td class="n'+(p.h1Count!==1&&typeof p.words==='number'?' bad':'')+'">'+(typeof p.words==='number'?p.h1Count:'')+'</td><td class="n">'+(typeof p.words==='number'?p.words:'')+'</td></tr>').join('')+'</table>');
 L.push('<h2>Metodo e limiti</h2>'+audit.notes.map(n=>'<p class="note">'+esc(n.text)+'</p>').join('')+'<p class="note">Crawl leggero di RADIX: robots.txt, sitemap, fino a '+((audit.crawl.limits||{}).maxPages||25)+' pagine dello stesso sito, link interni controllati. Le soglie: title ≤ 60 caratteri, meta description ≤ 155, un solo H1, Core Web Vitals «buoni» con LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1 (web.dev).</p>'+(by?'<p class="note">Preparato da '+esc(by)+' con RADIX.</p>':''));
 L.push('</main></body></html>');return L.join('')}

// ---- saved in the project: the «agents» document, key siteAudit ----
const emptyStore=()=>({schemaVersion:1,audits:[]});
function readStore(doc){const s=doc&&doc.siteAudit;if(!s||typeof s!=='object')return emptyStore();return {schemaVersion:1,audits:Array.isArray(s.audits)?s.audits.filter(x=>x&&typeof x==='object'):[]}}
function auditRecord(audit,{plan,by,at}={}){const when=at||new Date().toISOString(),ps=audit.pagespeed||{};
 return {id:'audit-'+when.replace(/\D/g,'').slice(0,14),at:when,by:clean(by).slice(0,80),url:audit.url,host:audit.host,goal:audit.answers.goal,services:audit.answers.services.slice(),city:audit.answers.city,
  overall:audit.scores.overall,areas:{...audit.scores.areas},counts:{...audit.counts},pages:audit.facts.pages,broken:audit.facts.broken,
  cwv:ps.measured&&ps.field?{lcpMs:ps.field.lcpMs,inpMs:ps.field.inpMs,cls:ps.field.cls}:null,
  issues:audit.issues.slice(0,40).map(i=>({id:i.id,area:i.area,severity:i.severity,title:i.title,evidence:String(i.evidence||'').slice(0,240),pages:i.pages.slice(0,5),count:i.count,fix:i.fix})),
  plan:plan?{summary:plan.summary,phases:Object.fromEntries(PHASES.map(k=>[k,plan.phases[k].map(x=>({action:x.action,why:x.why,refs:x.refs,pages:x.pages,impact:x.impact,effort:x.effort,flags:x.flags}))])),pages:plan.pages.map(p=>({url:p.url,title:p.title,meta:p.meta,flags:p.flags})),toVerify:plan.toVerify.slice()}:null}}
function addAudit(store,rec){const s=readStore({siteAudit:store});return {...s,audits:s.audits.filter(x=>x.id!==rec.id).concat([rec]).slice(-MAX_AUDITS)}}
// The previous saved audit of the same site, to show the change in score.
function previous(store,host,beforeId){const s=readStore({siteAudit:store});return s.audits.filter(x=>x.host===host&&x.id!==beforeId).slice(-1)[0]||null}
// Load, change only siteAudit, save; on a conflict (someone saved meanwhile) load again and retry, keeping every other key.
async function saveToProject(ws,projectId,rec){if(!ws||typeof ws.bind!=='function')throw Error('Archivio del progetto non disponibile.');
 const doc=ws.bind(projectId,'agents');
 for(let i=0;i<3;i++){const cur=(await doc.load())||{},next=addAudit(readStore(cur),rec);
  try{await doc.save({...cur,schemaVersion:1,conversations:cur.conversations||{},siteAudit:next});return next}catch(e){if(!(ws.ConflictError&&e instanceof ws.ConflictError)||i===2)throw e}}}

// ---- the crawl request ----
async function runCrawl(url,{fetch:f}={}){const fx=f||(root.fetch&&root.fetch.bind(root));if(!fx)throw Error('Rete non disponibile.');
 let r;try{r=await fx(ENDPOINT,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'crawl',url})})}catch(e){throw Error('Server non raggiungibile: riprova.')}
 const d=await r.json().catch(()=>null);if(!r.ok)throw Error(d&&d.error||(r.status===401?'Accedi a RADIX e riprova.':'Analisi non riuscita ('+r.status+').'));
 if(!d||!Array.isArray(d.pages))throw Error('Risposta del server non leggibile.');return d}

// ---- browser widget ----
const doc=()=>root.document;
let counter=0;
const el=(tag,text,cls)=>{const n=doc().createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
const button=(text,cls)=>{const b=el('button',text,cls||'');b.type='button';return b};
function download(name,data,type){const a=el('a');a.href=root.URL.createObjectURL(new root.Blob([data],{type}));a.download=name;doc().body.append(a);a.click();a.remove();setTimeout(()=>root.URL.revokeObjectURL(a.href),2000)}
async function copyText(t){try{await root.navigator.clipboard.writeText(t);return true}catch(e){const ta=el('textarea');ta.value=t;ta.style.position='fixed';ta.style.opacity='0';doc().body.append(ta);ta.select();let ok=false;try{ok=doc().execCommand('copy')}catch(x){}ta.remove();return ok}}
function copyButton(get,label){const b=button(label||'Copia','sa-copy');b.onclick=async()=>{const ok=await copyText(get());const was=label||'Copia';b.textContent=ok?'Copiato':'Copia non riuscita';b.dataset.done=String(ok);setTimeout(()=>{b.textContent=was;delete b.dataset.done},1600)};return b}
const pill=(text,state,cls)=>{const p=el('span',text,'sa-pill'+(cls?' '+cls:''));if(state)p.dataset.state=state;return p};
const SVGNS='http://www.w3.org/2000/svg';
function ringEl(value,size){const s=doc().createElementNS(SVGNS,'svg'),r=size/2-7,c=2*Math.PI*r;s.setAttribute('viewBox','0 0 '+size+' '+size);s.setAttribute('width',size);s.setAttribute('height',size);s.setAttribute('aria-hidden','true');s.classList.add('sa-ring');
 const mk=(cls,dash)=>{const k=doc().createElementNS(SVGNS,'circle');k.setAttribute('cx',size/2);k.setAttribute('cy',size/2);k.setAttribute('r',r);k.setAttribute('class',cls);if(dash!=null){k.setAttribute('stroke-dasharray',dash+' '+c);k.setAttribute('transform','rotate(-90 '+size/2+' '+size/2+')')}return k};
 s.append(mk('sa-ring-bg'),mk('sa-ring-fg',(c*value/100).toFixed(1)));s.dataset.grade=grade(value).id;return s}
// ctx: {project (profile for the AI), memoryScope, projectId, workspace, agentsUrl, by, fetch}
function siteAudit(ctx={}){const n=++counter,project=ctx.project||{},brand=clean(String(project.name||'').split(/\s[—–-]\s/)[0]).slice(0,100),pre=prefill(project);
 const st={answers:{...pre,services:pre.services.slice()},crawl:null,audit:null,plan:null,filter:{severity:'',area:''},saved:null};
 const wrap=el('div',undefined,'tool photo-studio site-audit');
 const note=el('p',undefined,'sa-note');note.append(el('span','L’analisi legge il sito come un motore di ricerca: robots.txt, sitemap e fino a 25 pagine, con i link interni controllati. È gratuita e senza AI; il piano 30/60/90 è facoltativo.'));
 const steps=el('ol',undefined,'ps-steps');['Il sito','L’analisi','Il piano 30/60/90'].forEach((t,i)=>{const li=el('li',(i+1)+' · '+t);li.dataset.step=String(i+1);steps.append(li)});
 const setStep=k=>[...steps.children].forEach(li=>li.dataset.state=+li.dataset.step<k?'done':+li.dataset.step===k?'current':'todo');
 const saved=el('div',undefined,'sa-saved');saved.hidden=true;
 // step 1: the questions
 const form=el('div',undefined,'ps-form sa-form'),grid=el('div',undefined,'sa-fields');
 const urlL=el('label',undefined,'sa-field sa-url'),url=el('input');url.type='text';url.inputMode='url';url.spellcheck=false;url.autocapitalize='off';url.autocomplete='url';url.placeholder='www.esempio.it';url.value=pre.url||'';url.name='sa-url-'+n;url.maxLength=300;urlL.append(el('span','Indirizzo del sito *'),url);
 const cityL=el('label',undefined,'sa-field'),city=el('input');city.type='text';city.placeholder='Es. Torino, San Salvario';city.value=pre.city||'';city.name='sa-city-'+n;city.maxLength=FIELD_MAX;cityL.append(el('span','Città o zona'),city);
 grid.append(urlL,cityL);
 const goalFs=el('fieldset',undefined,'sa-goal');goalFs.append(el('legend','Obiettivo'));GOALS.forEach(([id,label])=>{const l=el('label',undefined,'ps-chip'),r=el('input');r.type='radio';r.name='sa-goal-'+n;r.value=id;r.checked=st.answers.goal===id;r.onchange=()=>{st.answers.goal=id};l.append(r,doc().createTextNode(label));goalFs.append(l)});
 const svcBox=el('div',undefined,'sa-services'),svcTop=el('div',undefined,'sa-field-top');svcTop.append(el('span','Servizi principali','sa-label-strong'),el('span','Scrivi e premi Invio · fino a '+MAX_SERVICES,'sa-hint'));
 const chips=el('div',undefined,'sa-chips'),svcIn=el('input');svcIn.type='text';svcIn.placeholder='Es. torte su ordinazione';svcIn.name='sa-svc-'+n;svcIn.maxLength=FIELD_MAX;svcIn.setAttribute('aria-label','Aggiungi un servizio');
 const addSvc=button('Aggiungi','sa-add');
 const renderChips=()=>{chips.replaceChildren(...st.answers.services.map((s,i)=>{const c=el('span',undefined,'sa-chip');c.append(el('span',s));const x=button('×','sa-chip-x');x.setAttribute('aria-label','Togli '+s);x.onclick=()=>{st.answers.services.splice(i,1);renderChips()};c.append(x);return c}),svcIn,addSvc);svcIn.disabled=addSvc.disabled=st.answers.services.length>=MAX_SERVICES};
 const pushSvc=()=>{const v=serviceList(svcIn.value);if(!v.length)return;st.answers.services=serviceList(st.answers.services.concat(v));svcIn.value='';renderChips();svcIn.focus()};
 svcIn.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===','){e.preventDefault();pushSvc()}else if(e.key==='Backspace'&&!svcIn.value&&st.answers.services.length){st.answers.services.pop();renderChips();svcIn.focus()}});addSvc.onclick=pushSvc;
 svcBox.append(svcTop,chips);renderChips();
 const rules=el('ul',undefined,'sa-checks');AREAS.forEach(a=>{const li=el('li');li.append(el('strong',a.label),el('span',a.hint));rules.append(li)});
 const rulesBox=el('div',undefined,'sa-checksbox');rulesBox.append(el('span','Cosa controllo','sa-label'),rules);
 const go=button('Analizza il sito','primary'),cost=el('span','Gratis, senza AI: circa 20-40 secondi.','muted'),bar=el('div',undefined,'ps-actions');bar.append(go,cost);
 form.append(grid,goalFs,svcBox,rulesBox,bar);
 const status=el('p','','tool-status');status.setAttribute('role','status');
 const progress=el('div',undefined,'sa-progress');progress.hidden=true;
 const result=el('div',undefined,'sa-result');result.hidden=true;
 const planBox=el('div',undefined,'sa-plan');planBox.hidden=true;
 wrap.append(note,steps,saved,form,status,progress,result,planBox);setStep(1);
 const lock=on=>{go.disabled=on;form.querySelectorAll('input,button').forEach(x=>{if(x!==go)x.disabled=on})};
 go.onclick=async()=>{if(svcIn.value.trim())pushSvc();st.answers.url=url.value;st.answers.city=city.value;let a;
  try{a=validate(st.answers)}catch(e){status.textContent=e.message;url.focus();return}
  url.value=a.url.replace(/^https:\/\//,'').replace(/\/$/,'');lock(true);setStep(2);status.textContent='';result.hidden=true;planBox.hidden=true;st.plan=null;
  progress.hidden=false;const msgs=['Leggo robots.txt e la sitemap…','Leggo la home e le pagine collegate…','Estraggo title, meta, H1, dati strutturati…','Controllo i link interni…','Calcolo i punteggi…'];let k=0;
  const line=el('p',msgs[0],'sa-progress-line'),barP=el('div',undefined,'sa-progress-bar');barP.append(el('i'));progress.replaceChildren(el('span',a.url.replace(/^https:\/\//,'').replace(/\/$/,''),'sa-progress-host'),line,barP);
  const tick=setInterval(()=>{k=Math.min(msgs.length-1,k+1);line.textContent=msgs[k]},6000);
  try{const crawl=await runCrawl(a.url,{fetch:ctx.fetch});st.crawl=crawl;st.audit=analyze(crawl,a);st.filter={severity:'',area:''};renderResult();
   status.textContent='Analisi pronta: '+st.audit.facts.pages+' pagine lette in '+Math.max(1,Math.round(st.audit.facts.durationMs/1000))+' secondi.';
   result.hidden=false;result.scrollIntoView&&result.scrollIntoView({behavior:'smooth',block:'start'})}
  catch(e){status.textContent='Analisi non riuscita: '+e.message;setStep(1)}
  finally{clearInterval(tick);progress.hidden=true;lock(false)}};
 function renderResult(){const au=st.audit;setStep(st.plan?3:2);
  const prev=st.saved?previous(st.saved,au.host,null):null;
  // the head: overall score, the five areas, the facts
  const head=el('div',undefined,'sa-head'),score=el('div',undefined,'sa-score');score.append(ringEl(au.scores.overall,132));
  const scoreTxt=el('div',undefined,'sa-score-text');scoreTxt.append(el('strong',String(au.scores.overall),'sa-score-n'),el('span','/100','sa-score-of'));score.append(scoreTxt);
  const who=el('div',undefined,'sa-who');who.append(el('span','Analisi del sito','sa-label'),el('h3',au.host));
  const sub=el('p',undefined,'sa-sub');sub.append(pill(au.grade.label,au.grade.id),doc().createTextNode(' '+au.facts.pages+' pagine · obiettivo '+goalLabel(au.answers.goal).toLowerCase()+(au.answers.city?' · '+au.answers.city:'')));
  if(prev)sub.append(pill((au.scores.overall-prev.overall>=0?'+':'')+(au.scores.overall-prev.overall)+' rispetto al '+new Date(prev.at).toLocaleDateString('it-IT'),au.scores.overall>=prev.overall?'good':'poor','sa-delta'));
  const counts=el('div',undefined,'sa-counts');['alta','media','bassa'].forEach(s=>{const b=button('','sa-count');b.dataset.sev=s;b.setAttribute('aria-pressed',String(st.filter.severity===s));b.append(el('strong',String(au.counts[s])),el('span','gravità ','sa-count-g'),el('span',s));b.setAttribute('aria-label',au.counts[s]+' problemi di gravità '+s);b.onclick=()=>{st.filter.severity=st.filter.severity===s?'':s;renderResult()};counts.append(b)});
  who.append(sub,counts);head.append(score,who);
  const areas=el('div',undefined,'sa-areas');AREAS.forEach(a=>{const v=au.scores.areas[a.id],list=au.issues.filter(i=>i.area===a.id),b=button('','sa-area');b.dataset.grade=grade(v).id;b.setAttribute('aria-pressed',String(st.filter.area===a.id));
   const top=el('span',undefined,'sa-area-top');top.append(el('span',a.label,'sa-area-name'),el('strong',String(v),'sa-area-n'));
   const meter=el('span',undefined,'sa-meter');const fill=el('i');fill.style.width=v+'%';meter.append(fill);
   b.append(top,meter,el('span',list.length?list.length+(list.length===1?' problema':' problemi')+(list.some(i=>i.severity==='alta')?' · '+list.filter(i=>i.severity==='alta').length+(list.filter(i=>i.severity==='alta').length===1?' grave':' gravi'):''):'Nessun problema','sa-area-meta'));
   b.title=a.hint;b.onclick=()=>{st.filter.area=st.filter.area===a.id?'':a.id;renderResult()};areas.append(b)});
  // facts and Core Web Vitals
  const facts=el('div',undefined,'sa-facts');const fact=(label,value,state,tip)=>{const f=el('div',undefined,'sa-fact');f.dataset.state=state||'';f.append(el('span',label,'sa-fact-label'),el('strong',value));if(tip)f.title=tip;facts.append(f)};
  fact('robots.txt',au.facts.robots?'Presente':'Assente',au.facts.robots?'ok':'warn');fact('Sitemap',au.facts.sitemap?au.facts.sitemapUrls+' URL':'Assente',au.facts.sitemap?'ok':'warn');
  fact('Link interni rotti',String(au.facts.broken),au.facts.broken?'bad':'ok');fact('Crawler AI bloccati',au.facts.aiBlocked.length?String(au.facts.aiBlocked.length):'Nessuno',au.facts.aiBlocked.length?'warn':'ok',au.facts.aiBlocked.join(', '));
  fact('llms.txt',au.facts.llms?'Presente':'Assente','info','Informativo: non incide sul punteggio');
  const cwv=el('div',undefined,'sa-cwv'),ps=au.pagespeed||{};const cwvHead=el('div',undefined,'sa-cwv-head');cwvHead.append(el('h4','Core Web Vitals · mobile'));cwv.append(cwvHead);
  if(ps.measured&&ps.field){cwvHead.append(pill(ps.fieldSource==='pagina'?'Dati reali della home':'Dati reali del sito','ok'));const row=el('div',undefined,'sa-cwv-row');
   Object.keys(CWV).forEach(k=>{const v=ps.field[k],r=cwvRating(k,v),c=el('div',undefined,'sa-cwv-m');c.dataset.rating=r==='buono'?'good':r==='scarso'?'poor':r?'fair':'none';c.append(el('span',CWV[k].label,'sa-cwv-k'),el('strong',cwvText(k,v)),el('span',r||'non disponibile','sa-cwv-r'),el('span','buono ≤ '+cwvText(k,CWV[k].good),'sa-cwv-t'));row.append(c)});cwv.append(row)}
  else if(ps.measured){cwvHead.append(pill('Solo laboratorio','warn'));cwv.append(el('p','Dati reali degli utenti non disponibili per questo sito. Test di laboratorio: '+(ps.lab&&ps.lab.score!=null?'punteggio '+ps.lab.score+'/100':'—')+(ps.lab&&ps.lab.lcpMs!=null?', LCP '+cwvText('lcpMs',ps.lab.lcpMs):'')+'.','sa-cwv-note'))}
  else{cwvHead.append(pill('Non misurati','info'));const p=el('p',undefined,'sa-cwv-note');p.append(doc().createTextNode((ps.reason||'Non misurati.').replace(/ Misurali a mano.*$/,'')+' '));const a=el('a','Misura su PageSpeed ↗');a.href='https://pagespeed.web.dev/analysis?url='+encodeURIComponent(au.url);a.target='_blank';a.rel='noopener noreferrer';p.append(a);cwv.append(p)}
  // problems, filtered
  const list=au.issues.filter(i=>(!st.filter.severity||i.severity===st.filter.severity)&&(!st.filter.area||i.area===st.filter.area));
  const issuesHead=el('div',undefined,'sa-issues-head');issuesHead.append(el('h4','Problemi da risolvere'),el('span',list.length+' di '+au.issues.length+(st.filter.severity||st.filter.area?' · filtro: '+[st.filter.severity&&'gravità '+st.filter.severity,st.filter.area&&areaLabel(st.filter.area)].filter(Boolean).join(', '):''),'sa-hint'));
  if(st.filter.severity||st.filter.area){const x=button('Mostra tutti','sa-clear');x.onclick=()=>{st.filter={severity:'',area:''};renderResult()};issuesHead.append(x)}
  const ul=el('ol',undefined,'sa-issues');
  list.forEach(i=>{const li=el('li',undefined,'sa-issue');li.dataset.sev=i.severity;
   const top=el('div',undefined,'sa-issue-top');top.append(pill(SEVERITY[i.severity].label,i.severity,'sa-sev'),el('span',areaLabel(i.area),'sa-issue-area'));
   li.append(top,el('h5',i.title));if(i.evidence)li.append(el('p',i.evidence,'sa-evidence'));
   const fix=el('p',undefined,'sa-fix');fix.append(el('strong','Come risolvere '),doc().createTextNode(i.fix));li.append(fix);
   if(i.pages.length){const pg=el('div',undefined,'sa-pages');i.pages.slice(0,3).forEach(u=>{const a=el('a',pathOf(u));a.href=u;a.target='_blank';a.rel='noopener noreferrer';pg.append(a)});if(i.count>3)pg.append(el('span','e altre '+(i.count-3),'sa-more'));li.append(pg)}
   ul.append(li)});
  if(!list.length)ul.append(el('li','Nessun problema con questo filtro.','sa-empty'));
  // the pages
  const det=el('details',undefined,'sa-table');det.append(el('summary','Le '+(au.crawl.pages||[]).length+' pagine lette'));const tw=el('div',undefined,'sa-table-wrap'),tb=el('table');
  const hr=el('tr');['Pagina','Stato','Title','Meta','H1','Parole','Problemi'].forEach(h=>hr.append(el('th',h)));tb.append(hr);
  (au.crawl.pages||[]).forEach(p=>{const tr=el('tr'),isPage=typeof p.words==='number',bad=(c,on)=>{if(on)c.dataset.bad='true';return c};
   const td0=el('td');const a=el('a',pathOf(p.url));a.href=p.url;a.target='_blank';a.rel='noopener noreferrer';td0.append(a);if(p.noindex)td0.append(pill('noindex','warn'));
   tr.append(td0,bad(el('td',String(p.status||'—'),'n'),!p.status||p.status>=400),bad(el('td',isPage?String(p.titleLength||0):'','n'),isPage&&(!p.title||p.titleLength>LIMITS.titleMax)),
    bad(el('td',isPage?String(p.descriptionLength||0):'','n'),isPage&&!p.noindex&&p.kind!=='legal'&&(!p.description||p.descriptionLength>LIMITS.descMax)),bad(el('td',isPage?String(p.h1Count):'','n'),isPage&&p.h1Count!==1),
    el('td',isPage?String(p.words):'','n'),el('td',String(issuesFor(au,p.url).length),'n'));tb.append(tr)});
  tw.append(tb);det.append(tw);
  const notesEl=el('ul',undefined,'sa-notes');au.notes.forEach(x=>notesEl.append(el('li',x.text)));
  // actions
  const acts=el('div',undefined,'ps-actions sa-actions');
  const planBtn=button(st.plan?'Rifai il piano con l’AI':'Prepara il piano 30/60/90 con l’AI','primary');planBtn.onclick=()=>makePlan(planBtn);
  const csv=button('Esporta CSV');csv.onclick=()=>download(fileName(au,'csv'),issuesCsv(au,st.plan),'text/csv;charset=utf-8');
  const pdf=button('Report PDF');pdf.onclick=()=>openReport();
  const save=button('Salva nel progetto');save.onclick=()=>saveAudit(save);
  acts.append(planBtn,el('span','Una chiamata AI allo Specialista SEO e GEO, con conferma: piano e title riscritti partono solo da questi dati.','muted sa-plan-cost'),csv,pdf,save);
  const body=el('div',undefined,'sa-body'),main=el('div',undefined,'sa-main'),side=el('aside',undefined,'sa-side');
  main.append(issuesHead,ul,det);side.append(facts,cwv,el('h4','Metodo e limiti'),notesEl);body.append(main,side);
  result.replaceChildren(head,areas,body,acts)}
 async function makePlan(btn){const au=st.audit;let prompt;try{prompt=planPrompt(au,{project})}catch(e){status.textContent=e.message;return}
  const rt=root.RadixAgents;if(!rt||typeof rt.reply!=='function'){status.textContent='Gli agenti non si sono caricati: ricarica la pagina.';return}
  if(!root.confirm('Preparare il piano 30/60/90 e i title riscritti con lo Specialista SEO e GEO AI? È una sola chiamata AI: usa crediti API. Il piano parte solo dai dati dell’analisi.'))return;
  btn.disabled=true;setStep(3);planBox.hidden=false;planBox.replaceChildren(el('div',undefined,'sa-plan-skeleton'));status.textContent='Lo Specialista SEO e GEO prepara il piano…';
  try{const r=await rt.reply({role:AGENT,project,memoryScope:ctx.memoryScope,messages:[{role:'user',content:prompt}]});
   const plan=parsePlan(r&&r.text,au);if(!plan)throw Error('la risposta non contiene un piano leggibile. Riprova.');
   st.plan=plan;renderPlan();renderResult();status.textContent=plan.flags?'Piano pronto: '+plan.flags+(plan.flags===1?' voce da verificare':' voci da verificare')+' (in giallo).':'Piano pronto: ogni azione cita i problemi dell’analisi.';
   planBox.scrollIntoView&&planBox.scrollIntoView({behavior:'smooth',block:'start'})}
  catch(e){status.textContent='Piano non preparato: '+e.message;if(!st.plan){planBox.hidden=true;setStep(2)}else renderPlan()}
  finally{btn.disabled=false}}
 function renderPlan(){const p=st.plan,au=st.audit,byId=new Map(au.issues.map(i=>[i.id,i]));
  const head=el('div',undefined,'sa-plan-head'),ht=el('div');ht.append(el('span','Piano dello Specialista SEO e GEO','sa-label'),el('h3','Il piano a 30, 60 e 90 giorni'));head.append(ht);
  if(p.flags)head.append(pill(p.flags+(p.flags===1?' voce da verificare':' voci da verificare'),'warn'));else head.append(pill('Ogni azione cita l’analisi','good'));
  const out=[head];if(p.summary)out.push(el('p',p.summary,'sa-summary'));
  const cols=el('div',undefined,'sa-phases');
  PHASES.forEach((k,i)=>{const col=el('section',undefined,'sa-phase');col.dataset.phase=k;const h=el('div',undefined,'sa-phase-head');h.append(el('span',String(i+1),'sa-phase-n'),el('h4','Entro '+k+' giorni'),el('span',p.phases[k].length+' azioni','sa-hint'));col.append(h);
   const ol=el('ol',undefined,'sa-actions-list');p.phases[k].forEach(x=>{const li=el('li',undefined,'sa-action');if(x.flags.length)li.dataset.flag='true';li.append(el('strong',x.action));if(x.why)li.append(el('p',x.why,'sa-why'));
    const meta=el('div',undefined,'sa-action-meta');meta.append(pill('Impatto '+x.impact,x.impact==='alto'?'good':x.impact==='basso'?'info':'',''),pill('Sforzo '+x.effort,x.effort==='alto'?'warn':'info'));
    x.refs.forEach(r=>{const iss=byId.get(r);const c=el('span',iss?iss.title:r,'sa-ref');c.dataset.sev=iss?iss.severity:'';c.title=r;meta.append(c)});li.append(meta);
    if(x.pages.length){const pg=el('div',undefined,'sa-pages');x.pages.slice(0,3).forEach(u=>pg.append(el('span',pathOf(u))));li.append(pg)}
    if(x.flags.length){const f=el('ul',undefined,'sa-flags');x.flags.forEach(t=>f.append(el('li',t)));li.append(f)}ol.append(li)});
   if(!p.phases[k].length)ol.append(el('li','Nessuna azione per questa fase.','sa-empty'));col.append(ol);cols.append(col)});
  out.push(cols);
  if(p.pages.length){const sec=el('section',undefined,'sa-rewrites');const sh=el('div',undefined,'sa-issues-head');sh.append(el('h4','Title e meta description riscritti'),el('span','Modificali qui: limiti e controlli si aggiornano.','sa-hint'));sec.append(sh);
   const grid=el('div',undefined,'sa-rewrite-grid');
   p.pages.forEach(pg=>{const card=el('article',undefined,'sa-rewrite');const top=el('div',undefined,'sa-rewrite-top');const a=el('a',pathOf(pg.url));a.href=pg.url;a.target='_blank';a.rel='noopener noreferrer';top.append(a,copyButton(()=>'Title: '+pg.title+'\nMeta description: '+pg.meta,'Copia'));card.append(top);
    const field=(label,key,max,old,rows)=>{const l=el('label',undefined,'sa-field'),t=el('span',undefined,'sa-field-top'),cnt=el('span','','sa-countc'),inp=el(rows?'textarea':'input');if(rows)inp.rows=rows;else inp.type='text';inp.value=pg[key];
     const upd=()=>{const c=chars(inp.value);cnt.textContent=c+'/'+max;cnt.dataset.state=c>max?'over':c>max*.92?'near':'ok'};inp.oninput=()=>{pg[key]=inp.value;upd();pg.flags=recheckPage(pg,au);flags()};upd();
     t.append(el('span',label),cnt);l.append(t,inp);if(old)l.append(el('span','Ora: '+old+' ('+chars(old)+')','sa-old'));else l.append(el('span','Ora: assente','sa-old'));return l};
    const fl=el('ul',undefined,'sa-flags');const flags=()=>{fl.replaceChildren(...pg.flags.map(t=>el('li',t)));fl.hidden=!pg.flags.length};
    card.append(field('Title','title',LIMITS.titleMax,pg.oldTitle,2),field('Meta description','meta',LIMITS.descMax,pg.oldMeta,4));if(pg.why)card.append(el('p',pg.why,'sa-why'));card.append(fl);flags();grid.append(card)});
   sec.append(grid);out.push(sec)}
  if(p.toVerify.length){const v=el('div',undefined,'sa-verify');v.append(el('span','Da verificare','sa-label'));const ul=el('ul');p.toVerify.forEach(t=>ul.append(el('li',t)));v.append(ul);out.push(v)}
  planBox.replaceChildren(...out);planBox.hidden=false;setStep(3)}
 function openReport(){const html=reportHtml(st.audit,{plan:st.plan,brand,by:ctx.by});const w=root.open('','_blank');
  if(!w){download(fileName(st.audit,'html'),html,'text/html;charset=utf-8');status.textContent='Il browser ha bloccato la finestra: ho scaricato il report in HTML, aprilo e stampalo in PDF.';return}
  w.document.open();w.document.write(html);w.document.close();setTimeout(()=>{try{w.focus();w.print()}catch(e){}},400)}
 async function saveAudit(btn){if(!ctx.workspace||!ctx.projectId){status.textContent='Scegli un progetto per salvare l’analisi.';return}
  btn.disabled=true;btn.textContent='Salvo…';
  try{const rec=auditRecord(st.audit,{plan:st.plan,by:ctx.by});st.saved=await saveToProject(ctx.workspace,ctx.projectId,rec);btn.textContent='Salvata';status.textContent='Analisi salvata nel progetto'+(st.plan?' con il piano':'')+'.';renderSaved()}
  catch(e){btn.disabled=false;btn.textContent='Salva nel progetto';status.textContent='Salvataggio non riuscito: '+e.message}}
 function renderSaved(){const s=readStore({siteAudit:st.saved});if(!s.audits.length){saved.hidden=true;return}
  saved.replaceChildren(el('span','Nel progetto','sa-label'));s.audits.slice(-3).reverse().forEach(r=>{const b=button(r.host+' · '+r.overall+'/100 · '+new Date(r.at).toLocaleDateString('it-IT'),'sa-saved-item');b.title='Usa questo indirizzo';
   b.onclick=()=>{url.value=String(r.url||'').replace(/^https:\/\//,'').replace(/\/$/,'');st.answers.goal=r.goal||st.answers.goal;st.answers.services=(r.services||[]).slice();city.value=r.city||'';renderChips();goalFs.querySelectorAll('input').forEach(x=>x.checked=x.value===st.answers.goal);url.focus()};saved.append(b)});saved.hidden=false}
 wrap.loadSaved=async()=>{if(!ctx.workspace||!ctx.projectId)return;try{st.saved=readStore(await ctx.workspace.bind(ctx.projectId,'agents').load());renderSaved();
  const last=st.saved.audits.slice(-1)[0];if(last&&!url.value)url.value=String(last.url||'').replace(/^https:\/\//,'').replace(/\/$/,'')}catch(e){}};
 wrap.loadSaved();
 return wrap}

return Object.freeze({AGENT,ENDPOINT,GOALS,AREAS,SEVERITY,WEIGHTS,LIMITS,CWV,PHASES,MAX_AUDITS,siteUrl,serviceList,normalize,validate,prefill,checks,notes,scores,grade,analyze,topPages,
 planData,groundText,planPrompt,parsePlan,fitTitle,sitePhones,recheckPage,issuesCsv,reportHtml,fileName,readStore,auditRecord,addAudit,previous,saveToProject,runCrawl,cwvRating,siteAudit});
});
