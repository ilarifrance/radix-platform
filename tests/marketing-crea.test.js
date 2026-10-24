'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const core=require('../agency/crea-core.js');
const root=path.join(__dirname,'..');

test('the panel has the services of the approved proposal plus the text services',()=>{
 assert.deepEqual(core.CARDS.map(c=>c.title),['Strategia di marketing','Buyer persona','Analisi della concorrenza','Confronto con i siti dei concorrenti','Audit di comunicazione','Budget e KPI della strategia','Piano annuale e budget','Piano di lancio prodotto','Report mensile al cliente','Nome e slogan','Kit identità','Logo in vettoriale','Tono di voce per canale','Coordinato aziendale','Social e post','Post grafici','Grafica profili e template social','Testi per sito, blog e prodotti','Comunicato stampa','Media kit e cartella stampa','Brief per influencer','Evento o fiera','Newsletter','Newsletter HTML','Sequenze email','SMS','Firma email','Foto e immagini con l’AI','Foto prodotto','Fotoritocco','Mockup','Infografica','Avatar','Video con l’avatar','Reel e video prodotto','Animazione del logo','Sito web','Analisi del sito','SEO e GEO','Scheda Google e recensioni','Funnel con lead magnet','Campagne Google Ads Search','Testi per annunci Google e Meta','Creatività per annunci','Schede prodotto e feed','Traduzione e localizzazione','Negozio online','Stampati e grande formato','Catalogo prodotti','Menu e listino','Etichette e packaging','Brochure e company profile','Presentazione','Scheda tecnica','Documenti impaginati']);
 for(const c of core.CARDS)assert.ok(c.cost&&c.action&&c.line,c.id);
 assert.equal(new Set(core.CARDS.map(c=>c.id)).size,core.CARDS.length,'unique ids');
});

test('every card has one of the 8 groups; the filters list only groups with cards',()=>{
 assert.deepEqual(core.GROUPS,['Brand','Strategia','Web e annunci','Social e contenuti','Email e SMS','Stampa e documenti','Immagini','Video']);
 for(const c of core.CARDS)assert.ok(core.GROUPS.includes(c.group),c.id+' '+c.group);
 const by=g=>core.CARDS.filter(c=>c.group===g).map(c=>c.id);
 assert.deepEqual(by('Strategia'),['strategy','persona','concorrenza','concorrenzasiti','auditcom','budget','pianoannuale','lancio','report']);assert.deepEqual(by('Brand'),['naming','identita','logovettoriale','tono','coordinato']);
 assert.deepEqual(by('Social e contenuti'),['social','graphics','socialgrafica','testi','comunicato','mediakit','influencer','evento']);
 assert.deepEqual(by('Email e SMS'),['newsletter','emailhtml','sequenze','sms','firma']);
 assert.deepEqual(by('Web e annunci'),['site','analisi','seo','google','funnel','searchads','annunci','creativita','schede','traduzione','negozio']);assert.deepEqual(by('Stampa e documenti'),['stampa','catalogo','menu','packaging','brochure','presentazione','scheda','documenti']);
 assert.deepEqual(by('Immagini'),['images','fotoprodotto','fotoritocco','mockup','infografica']);assert.deepEqual(by('Video'),['avatar','video','reel','logoanimato']);
 assert.deepEqual(core.groups(),core.GROUPS);
 assert.deepEqual(core.inGroup('Brand').map(c=>c.id),['naming','identita','logovettoriale','tono','coordinato']);
 assert.equal(core.inGroup('').length,core.CARDS.length,'«Tutti»');assert.equal(core.inGroup('boh').length,core.CARDS.length,'unknown group: all');
});

test('the text cards open the Studio Testi inline, one service each, with the role of the service',()=>{
 const cs=require('../lib/copy-studio.js');
 const copy=core.CARDS.filter(c=>/^copy:/.test(c.inline));
 assert.deepEqual(copy.map(c=>c.inline.slice(5)).sort(),cs.SERVICES.map(s=>s.id).sort());
 for(const c of copy){const s=cs.service(c.inline.slice(5));assert.equal(core.linkFor(c,'radix'),null,c.id);assert.equal(c.title,s.title);assert.match(c.cost,/^Una chiamata AI [^,]+, con conferma\.$/);
  assert.ok(c.cost.includes(cs.whoOf(s.id,'a')),c.id)}
 const js=fs.readFileSync(path.join(root,'agency/crea.js'),'utf8');
 assert.match(js,/copy:\{global:'RadixCopyStudio'/);
 assert.match(js,/const agent=svc\?svc\.role:st\.agent;/);
 assert.match(js,/S\.copyStudio\(\{service,project,memoryScope,projectId:current\.id,workspace:ws,agentsUrl:'\/agents\.html\?agent='\+agent\+'&project='\+pid\}\)/);
 assert.match(js,/GROUP_KEY='radix-crea-group'/);assert.match(js,/try\{localStorage\.setItem/);
 const html=fs.readFileSync(path.join(root,'agency/crea.html'),'utf8');
 assert.ok(html.indexOf('id="crFilters"')<html.indexOf('id="crCards"'),'filters above the cards');
 assert.ok(html.indexOf('/lib/copy-studio.js')>0&&html.indexOf('/lib/copy-studio.js')<html.indexOf('/agency/crea.js'));
 const css=fs.readFileSync(path.join(root,'shell/crea.css'),'utf8');
 assert.match(fs.readFileSync(path.join(root,'agency/crea.css'),'utf8'),/\.cp-tab\[aria-pressed=true\]/);assert.match(css,/\.cr-panel \.copy-studio \.cs-grid/);
});

test('links point to pages that exist and carry the project',()=>{
 for(const c of core.CARDS){const l=core.linkFor(c,'radix');if(!l)continue;const file=l.split(/[?#]/)[0];assert.ok(fs.existsSync(path.join(root,file)),file);}
 assert.equal(core.linkFor(core.card('social'),'doc-capital'),'/project-editorial.html?project=doc-capital#ped');
 assert.equal(core.linkFor(core.card('avatar'),'radix'),'/agency/avatar.html?project=radix');
 assert.equal(core.linkFor(core.card('images'),'radix'),null,'images open inline');
 assert.equal(core.linkFor(core.card('video'),'radix'),null,'video opens inline');
 assert.equal(core.card('video').inline,'video');assert.equal(core.card('video').hint,undefined,'no «avatar first» hint: the studio says it');
});

test('without a project only strategy leads somewhere (new project); no card goes to an agent any more',()=>{
 assert.equal(core.linkFor(core.card('strategy'),''),'/agency/new-project.html');
 assert.equal(core.linkFor(core.card('social'),''),null);
 assert.equal(core.linkFor(core.card('social'),'bad id!'),null);
 assert.deepEqual(core.CARDS.filter(c=>c.state!=='ready').map(c=>c.id),[],'every card is guided');
 assert.deepEqual(core.CARDS.filter(c=>c.inline&&!/^copy:/.test(c.inline)).map(c=>c.inline),['concorrenzasiti','auditcom','budget','pianoannuale','report','identity','logovector','coordinato','socialkit','mediakit','event','mail','firma','photo','productphoto','retouch','mockup','infographic','video','reel','logomotion','site','audit','seo','gbp','funnel','searchads','ads','feed','translate','shop','print','catalog','menu','packaging','docs']);
 // an agent card would still open the agent with the request prefilled, never sent on its own
 assert.match(core.linkFor({agent:'web-developer',ask:'ciao'},'radix'),/^\/agents\.html\?agent=web-developer&project=radix&q=ciao$/);
 assert.match(fs.readFileSync(path.join(root,'agents-page.js'),'utf8'),/prefilled, never sent on its own/);
});

test('the page comes right after the Marketing Orbit in the Marketing Agency menu',()=>{
 const shell=fs.readFileSync(path.join(root,'shell/radix-shell.js'),'utf8');
 assert.match(shell,/group: 'agency'[^\n]*\n\s*\{ id: 'agency-orbit', text: 'Marketing Orbit', href: '\/agency\/orbit\.html'[^\n]*\n\s*\{ id: 'agency-crea', text: 'Cosa vuoi fare', href: '\/agency\/crea\.html'/);
 const html=fs.readFileSync(path.join(root,'agency/crea.html'),'utf8');
 assert.match(html,/data-shell-page="agency-crea"/);
 for(const s of ['/lib/product-photo-segment.js','/lib/product-photo-studio.js','/lib/copy-studio.js','/lib/print-studio.js','/lib/catalog-studio.js','/lib/lead-xlsx-parser.js','/sales/crm-csv-core.js','/lib/zip-lite.js','/lib/identity-studio.js','/lib/image-studio.js','/lib/video-studio.js','/lib/site-studio.js','/lib/seo-studio.js','/agency/crea-core.js','/agency/crea.js'])assert.ok(html.includes(s),s);
});

test('the Video card opens the Studio Video with the project avatar and the Video Producer memory',()=>{
 const js=fs.readFileSync(path.join(root,'agency/crea.js'),'utf8');
 assert.match(js,/videoStudio\(\{project,memoryScope,avatar:S\.savedAvatar\(current\.profile\),avatarUrl:'\/agency\/avatar\.html\?project='/);
 assert.match(js,/video:\{global:'RadixVideoStudio'[^}]*agent:'video-producer'\}/);
 assert.match(js,/photo:\{global:'RadixImageStudio'[^}]*agent:'art-director'\}/);
 assert.match(js,/agentId:agent\}/);
});

test('the SEO e GEO card opens the Studio SEO inline with the specialist memory and the project to save in',()=>{
 const seo=core.card('seo');
 assert.equal(seo.inline,'seo');assert.equal(seo.state,'ready');assert.equal(seo.agent,undefined,'no agent link any more');
 assert.equal(core.linkFor(seo,'radix'),null);
 assert.match(seo.line,/3 strategie/);assert.match(seo.cost,/Una chiamata AI[^.]*con conferma/);
 const js=fs.readFileSync(path.join(root,'agency/crea.js'),'utf8');
 assert.match(js,/seo:\{global:'RadixSeoStudio'[^}]*agent:'seo-geo'\}/);
 assert.match(js,/S\.seoStudio\(\{project,profile:current\.profile,memoryScope,projectId:current\.id,workspace:ws,agentsUrl:'\/agents\.html\?agent=seo-geo&project='\+pid\}\)/);
 const html=fs.readFileSync(path.join(root,'agency/crea.html'),'utf8');
 assert.ok(!/Sito web ha ancora|SEO\/GEO hanno/.test(html),'no «still being built» note');
 assert.ok(html.indexOf('/lib/seo-studio.js')<html.indexOf('/agency/crea.js'),'the studio loads before the page script');
 assert.match(fs.readFileSync(path.join(root,'shell/crea.css'),'utf8'),/\.cr-panel \.seo-studio \.ss-grid/);
});

test('the Sito web card opens the Studio Sito inline with the Web Developer memory and the project to save in',()=>{
 const site=core.card('site');
 assert.equal(site.inline,'site');assert.equal(site.state,'ready');assert.equal(site.agent,undefined,'no agent link any more');
 assert.equal(core.linkFor(site,'radix'),null);
 assert.match(site.line,/3 proposte con anteprima/);assert.match(site.cost,/Una chiamata AI al Web Developer, con conferma/);
 const js=fs.readFileSync(path.join(root,'agency/crea.js'),'utf8');
 assert.match(js,/site:\{global:'RadixSiteStudio'[^}]*agent:'web-developer'\}/);
 assert.match(js,/S\.siteStudio\(\{project,profile:current\.profile,memoryScope,projectId:current\.id,workspace:ws,agentsUrl:'\/agents\.html\?agent=web-developer&project='\+pid\}\)/);
 const html=fs.readFileSync(path.join(root,'agency/crea.html'),'utf8');
 assert.match(html,/<p class="cr-note cp-foot">Tutti i servizi ora sono guidati\. La pubblicazione online del sito arriverà più avanti, sempre con la tua conferma\.<\/p>/);
 assert.ok(html.indexOf('/lib/site-studio.js')<html.indexOf('/agency/crea.js'),'the studio loads before the page script');
 const css=fs.readFileSync(path.join(root,'shell/crea.css'),'utf8');
 assert.match(css,/\.cr-panel \.site-studio \.st-thumb iframe\{[^}]*pointer-events:none/);assert.match(css,/\.st-view\[data-mode=mobile\] iframe\{width:390px;max-width:100%/);
});

test('the Kit identità card opens the Studio Identità inline with the Stratega di Marca memory, the zip writer and the project to save in',()=>{
 const k=core.card('identita');
 assert.equal(k.group,'Brand');assert.equal(k.inline,'identity');assert.equal(k.state,'ready');assert.equal(core.linkFor(k,'radix'),null);
 assert.match(k.line,/3 direzioni/);assert.match(k.cost,/^Una chiamata AI allo Stratega di Marca, con conferma\.$/);assert.match(k.hint,/UIBM, TMview e WIPO/);
 const js=fs.readFileSync(path.join(root,'agency/crea.js'),'utf8');
 assert.match(js,/identity:\{global:'RadixIdentityStudio'[^}]*agent:'brand-strategist'\}/);
 assert.match(js,/S\.identityStudio\(\{project,memoryScope,projectId:current\.id,workspace:ws,visual:project\.visual,agentsUrl:'\/agents\.html\?agent=brand-strategist&project='\+pid,onSaved:/);
 const html=fs.readFileSync(path.join(root,'agency/crea.html'),'utf8'),at=s=>html.indexOf(s);
 assert.ok(at('/lib/zip-lite.js')>0&&at('/lib/zip-lite.js')<at('/lib/identity-studio.js')&&at('/lib/identity-studio.js')<at('/agency/crea.js'),'zip writer and studio load before the page script');
 assert.match(fs.readFileSync(path.join(root,'shell/crea.css'),'utf8'),/\.cr-panel \.identity-studio \.is-swatches/);
});

test('the Stampa e documenti card opens the Studio Stampa inline: no AI, the raw profile with the kit, the Art Director thread to save in',()=>{
 const k=core.card('stampa');
 assert.equal(k.group,'Stampa e documenti');assert.equal(k.inline,'print');assert.equal(k.state,'ready');assert.equal(core.linkFor(k,'radix'),null);
 assert.match(k.line,/tipografia/);assert.match(k.cost,/Nessuna chiamata AI/);assert.match(k.hint,/PDF\/X-1a in CMYK FOGRA39[^.]*preflight/);
 const js=fs.readFileSync(path.join(root,'agency/crea.js'),'utf8');
 assert.match(js,/print:\{global:'RadixPrintStudio'[^}]*agent:'art-director'\}/);
 assert.match(js,/S\.printStudio\(\{project,profile:current\.profile,projectName:current\.name,projectId:current\.id,workspace:ws,agentsUrl:'\/agents\.html\?agent=art-director&project='\+pid\}\)/);
 const html=fs.readFileSync(path.join(root,'agency/crea.html'),'utf8'),at=s=>html.indexOf(s);
 assert.ok(at('/lib/print-studio.js')>0&&at('/lib/print-studio.js')<at('/agency/crea.js'),'the studio loads before the page script');
 assert.match(fs.readFileSync(path.join(root,'shell/crea.css'),'utf8'),/\.cr-panel \.print-studio \.pr-preview/);
 assert.ok(!/RadixAgents|reply\(|fetch\(/.test(fs.readFileSync(path.join(root,'lib/print-studio.js'),'utf8')),'no AI call in the studio');
});

test('the Catalogo prodotti card opens the Studio Catalogo inline: no AI, the CRM sheet readers loaded before it',()=>{
 const k=core.card('catalogo');
 assert.equal(k.group,'Stampa e documenti');assert.equal(k.inline,'catalog');assert.equal(k.state,'ready');assert.equal(core.linkFor(k,'radix'),null);
 assert.match(k.line,/Excel o CSV/);assert.match(k.cost,/Nessuna chiamata AI/);assert.match(k.hint,/500 prodotti/);
 const js=fs.readFileSync(path.join(root,'agency/crea.js'),'utf8');
 assert.match(js,/catalog:\{global:'RadixCatalogStudio'/);assert.match(js,/S\.catalogStudio\(\{project,profile:current\.profile,projectName:current\.name\}\)/);
 const html=fs.readFileSync(path.join(root,'agency/crea.html'),'utf8'),at=s=>html.indexOf(s);
 assert.ok(at('/lib/print-studio.js')<at('/lib/catalog-studio.js')&&at('/lib/lead-xlsx-parser.js')<at('/lib/catalog-studio.js')&&at('/sales/crm-csv-core.js')<at('/lib/catalog-studio.js')&&at('/lib/catalog-studio.js')<at('/agency/crea.js'));
 assert.match(fs.readFileSync(path.join(root,'shell/crea.css'),'utf8'),/\.cr-panel \.catalog-studio \.ct-map-grid/);
 assert.ok(!/RadixAgents|reply\(/.test(fs.readFileSync(path.join(root,'lib/catalog-studio.js'),'utf8')),'no AI call in the studio');
});

test('rifinitura: a short line per card for the «Tutti» index, no card named like its area, every free card marked free',()=>{
 for(const c of core.CARDS){assert.ok(c.short&&c.short.length<=72,c.id+' short line');assert.notEqual(c.short,c.line,c.id);assert.notEqual(c.title,c.group,c.id+' title is not its area')}
 assert.equal(new Set(core.CARDS.map(c=>c.short)).size,core.CARDS.length,'short lines differ');
 assert.deepEqual(core.costBadge(core.card('fotoprodotto')),{tone:'free',label:'Gratis · AI facoltativa'},'cut-out and white background are free');
 for(const c of core.CARDS)if(/^[^.]*(Nessuna chiamata AI|senza chiamate AI)/.test(c.cost))assert.equal(core.costBadge(c).tone,'free',c.id);
 const js=fs.readFileSync(path.join(root,'agency/crea.js'),'utf8'),css=fs.readFileSync(path.join(root,'agency/crea.css'),'utf8');
 assert.match(js,/\$\('crCards'\)\.dataset\.view=group\?'area':'index';/);assert.match(js,/h\.after\(node\('p','cp-short',c\.short\)\)/);
 assert.match(js,/\$\('crPanelTitle'\)\.textContent=c\.title;\$\('crPanelEyebrow'\)\.textContent='Per '\+current\.name;/,'the project in the eyebrow, the title on its own');
 assert.match(css,/\.cp-index\[data-view=index\] \.cp-line,\.cp-index\[data-view=index\] \.cp-cost,\.cp-index\[data-view=index\] \.cp-hint\{display:none\}/);
 assert.match(css,/\.cp-kit-row\{[^}]*grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/,'five kits in one row');
 assert.match(css,/\.cp-hint\{color:var\(--ma-tx2\)\}/,'hints are notes, not warnings');
 const studio=fs.readFileSync(path.join(root,'shell/crea.css'),'utf8');
 assert.ok(!/background:var\(--ink\);color:#0a1026/.test(studio),'no ink-on-ink selected segment');
 assert.match(studio,/fieldset\.co-company,\.cr-panel \.coordinato-studio fieldset\.co-people\{align-items:stretch\}/);
 const look=require('../agency/marketing-look.js');assert.notEqual(look.svg('mockup'),look.svg('layers'),'mockup and coordinato icons differ');
});
