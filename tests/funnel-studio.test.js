'use strict';
// Studio Funnel (lib/funnel-studio.js): proposals, lead magnet PDF, landing + thank-you page, 3 e-mail drafts, promo kit,
// map with KPI, checks, the optional AI step and the saved record. Fake data only (the made-up bakery «Forno Aurora»),
// a FAKE agent and an in-memory archive: no network, no credits, no e-mail sent.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const F=require('../lib/funnel-studio.js'),T=require('../lib/funnel-templates.js'),L=require('../lib/site-legal.js'),S=require('../lib/site-studio.js'),C=require('../lib/copy-checks.js');
const {PROFILE}=require('./fixtures/mockup-forno-aurora.js');
const TODAY=new Date('2026-10-22T09:00:00Z'),BRAND=F.brandFor(PROFILE,'Forno Aurora');
const model=(type='guida',answers)=>{const m=F.newModel({project:{id:'demo',name:'Forno Aurora'},profile:PROFILE,projectName:'Forno Aurora',today:TODAY,answers});
 m.funnel=F.buildFunnel(m.input,type,{brandName:'Forno Aurora',today:TODAY,contacts:F.contactsOf({},PROFILE)});return m};
const pdfText=bytes=>Buffer.from(bytes).toString('latin1');

test('prefill: the sector and the answers come from the project profile; 3 proposals, the chosen kind first',()=>{
 const m=F.newModel({project:{name:'Forno Aurora'},profile:PROFILE,projectName:'Forno Aurora',today:TODAY});
 assert.equal(m.input.sector,'forno');assert.equal(m.input.type,'guida');assert.ok(m.input.target&&m.input.problem&&m.input.offer);
 assert.equal(T.sectorOf('Studio di commercialisti e consulenza fiscale').id,'professionisti');assert.equal(T.sectorOf('Agenzia di pubblicità').id,'professionisti');
 assert.equal(T.sectorOf('qualcosa di nuovo').id,'generico');
 const ps=F.proposals({...m.input,type:'coupon'},{brandName:'Forno Aurora',today:TODAY});assert.equal(ps.length,3);assert.equal(ps[0].type,'coupon');
 assert.equal(new Set(ps.map(p=>p.type)).size,3);
 const g=F.proposals(m.input,{brandName:'Forno Aurora',today:TODAY})[0];assert.equal(g.magnet.title,'Le 10 torte per le feste');assert.equal(g.slug,'le-10-torte-per-le-feste');
});

test('every sector × kind: the whole path is there, texts in the limits, the PDF within its pages and nothing overflowing',()=>{
 for(const s of T.SECTORS)for(const type of F.TYPE_IDS){const m=model(type,{sector:s.id,target:s.audience,problem:s.problem,offer:s.offer}),f=m.funnel,t=F.typeOf(type),tag=s.id+'/'+type;
  assert.equal(f.emails.length,3,tag);assert.equal(f.promo.posts.length,3,tag);
  assert.ok(f.promo.ad.headlines.filter(Boolean).length>=3&&f.promo.ad.headlines.every(h=>[...h].length<=30),tag+' headlines');
  assert.ok(f.promo.ad.descriptions.length>=2&&f.promo.ad.descriptions.every(d=>[...d].length<=90),tag+' descriptions');
  assert.ok(f.emails.every(e=>[...e.subject].length<=60&&e.subject&&[...e.preheader].length<=100),tag+' subjects');
  const r=F.renderMagnet(f,BRAND);assert.deepEqual(r.problems,[],tag);
  assert.ok(r.pages.length>=t.pages[0]&&r.pages.length<=t.pages[1],tag+' pages '+r.pages.length);
  const cs=F.checksOf(m,BRAND,{today:TODAY});assert.deepEqual(F.blocking(cs).map(c=>c.id),[],tag)}
});

test('lead magnet PDF: A4 pages with the brand; checklist with boxes, coupon with code and expiry, unconfirmed coupon flagged',()=>{
 const g=model('guida').funnel,pdf=F.magnetPdf(g,BRAND,{date:TODAY});assert.equal(pdfText(pdf).slice(0,5),'%PDF-');
 assert.equal((pdfText(pdf).match(/\/Type\s*\/Page\b/g)||[]).length,F.renderMagnet(g,BRAND).pages.length);
 const cover=F.renderMagnet(g,BRAND).pages[0];assert.ok(cover.nodes.some(n=>n.t==='logo'),'the kit logo on the cover');
 assert.ok(JSON.stringify(cover.nodes).includes(PROFILE.identityKit.palette[0].hex),'the kit colour');
 const ck=F.renderMagnet(model('checklist').funnel,BRAND);assert.ok(ck.pages.length<=2);assert.ok(ck.pages[0].nodes.filter(n=>n.t==='rect'&&n.w===n.h&&n.w<=36).length>=5,'boxes to tick');
 const cm=model('coupon'),c=cm.funnel.magnet.coupon;assert.match(c.code,/^AURORA\d+$/);assert.match(c.expiry,/^\d{4}-\d\d-\d\d$/);assert.equal(c.confirmed,false);
 assert.equal(F.renderMagnet(cm.funnel,BRAND).pages.length,1);assert.ok(JSON.stringify(F.renderMagnet(cm.funnel,BRAND).pages[0].nodes).includes(c.code));
 assert.equal(F.checksOf(cm,BRAND,{today:TODAY}).find(x=>x.id==='coupon').state,'warn');
 c.confirmed=true;assert.equal(F.checksOf(cm,BRAND,{today:TODAY}).find(x=>x.id==='coupon').state,'ok');
 c.expiry='2020-01-01';assert.equal(F.checksOf(cm,BRAND,{today:TODAY}).find(x=>x.id==='coupon').state,'fail');
 // listino: no invented prices, empty ones become «su richiesta» and are flagged
 const lm=model('listino');assert.ok(lm.funnel.magnet.sections.flatMap(s=>s.items).every(x=>/—\s*$/.test(x)),'prices left to the business');
 assert.equal(F.checksOf(lm,BRAND,{today:TODAY}).find(x=>x.id==='prezzi').state,'warn');
});

test('landing and thank-you page: the #207 form with the funnel name, only name and e-mail, the PDF to download, privacy for the magnet',()=>{
 const f=model('guida').funnel,s=F.landingSite(f,BRAND,{profile:PROFILE,endpoint:'https://radix.example/api/sales?site_form=1',token:'tok123',year:2026,date:TODAY});
 assert.match(s.html,/<form class="lead" method="post" action="https:\/\/radix\.example\/api\/sales\?site_form=1"/);
 assert.match(s.html,/name="funnel" value="Le 10 torte per le feste"/);assert.match(s.html,/name="fonte" value="landing"/);assert.match(s.html,/name="t" value="tok123"/);
 assert.match(s.html,/name="name"/);assert.match(s.html,/name="email"/);assert.doesNotMatch(s.html,/name="phone"|name="message"/);
 assert.match(s.html,/name="privacy"[^>]*required/);assert.match(s.html,/la guida la ricevi lo stesso/);assert.match(s.html,/<meta name="referrer" content="no-referrer-when-downgrade">/);
 assert.doesNotMatch(s.html,/<script/i);assert.ok(S.hasForm(s.html));
 assert.deepEqual(Object.keys(s.pages).sort(),['cookie.html','grazie.html','privacy.html']);
 assert.match(s.pages['grazie.html'],/href="le-10-torte-per-le-feste\.pdf" download/);assert.doesNotMatch(s.pages['grazie.html'],/<script/i);
 assert.match(s.pages['privacy.html'],/Nome ed e-mail/);assert.match(s.pages['privacy.html'],/la guida «Le 10 torte per le feste» che hai chiesto/);
 const cp=model('coupon').funnel,cs=F.landingSite(cp,BRAND,{profile:PROFILE,endpoint:'https://radix.example/api/sales?site_form=1',token:'x'});assert.match(cs.pages['grazie.html'],new RegExp(cp.magnet.coupon.code));
 // the thank-you button stays readable on a light accent
 assert.match(L.thanksPage({colours:{p:'#2F5D50',a:'#E3B448'},magnet:{title:'Ecco',file:'a.pdf'}}),/\.btn\{[^}]*color:#111827/);
 assert.doesNotMatch(L.thanksPage({magnet:{title:'Ecco',file:'../x.pdf'}}),/href="\.\.\/x\.pdf"/,'only a plain file name');
});

test('3 e-mail drafts in the «Sequenze email» structure; the PDF link fills in once the landing is online; nothing is sent',()=>{
 const f=model('guida').funnel,md=F.emailsMarkdown(f),seq=C.parseSequence(md);
 assert.equal(seq.length,3);assert.deepEqual(seq.map(e=>e.invio),['Giorno 0','Giorno 2','Giorno 5']);assert.ok(seq.every(e=>e.subject&&e.body));
 assert.ok(f.emails[0].body.includes(F.LINK_TODO));assert.match(f.emails[2].body,/speriamo che la guida «Le 10 torte per le feste» ti sia stata utile/);
 assert.deepEqual(f.emails.flatMap(e=>{const x=C.tagIssues(e.subject+' '+e.body);return [...x.unknown,...x.foreign]}),[]);
 const on=F.withOnline(f,{url:'https://radix-lp-le-10-torte-abc123.vercel.app',state:'READY'});
 assert.match(on.emails[0].body,/https:\/\/radix-lp-le-10-torte-abc123\.vercel\.app\/le-10-torte-per-le-feste\.pdf/);assert.ok(!on.emails.some(e=>e.body.includes(F.LINK_TODO)));
 assert.equal(F.withOnline(f,{url:'javascript:alert(1)'}),f);
 assert.ok(F.PENDING.some(p=>/Brevo o Mailchimp/.test(p.label)));
 const src=fs.readFileSync(path.join(__dirname,'..','lib','funnel-studio.js'),'utf8');assert.match(src,/Invio automatico: da collegare \(Brevo o Mailchimp\)/);
 assert.doesNotMatch(src,/sendEmail|\/api\/mail|smtp/i,'no sending code');
});

test('promo kit and map: UTM links per channel, KPI «da misurare» unless the user writes a goal',()=>{
 const f=model('guida').funnel,L0=F.links(f,''),L1=F.links(f,'https://radix-lp-x.vercel.app');
 assert.equal(L0.instagram,'');assert.match(L1.instagram,/utm_source=instagram&utm_medium=social&utm_campaign=le-10-torte-per-le-feste/);assert.match(L1.google,/utm_source=google&utm_medium=cpc/);
 assert.match(F.promoText(f,''),/POST 3/);assert.match(F.promoText(f,''),/ANNUNCIO GOOGLE/);
 const m1=JSON.stringify(F.renderMap(f,BRAND).pages[0].nodes);assert.ok((m1.match(/da misurare/g)||[]).length>=5);assert.doesNotMatch(m1,/Obiettivo: /);
 f.kpi={reach:'2.000'};const m2=JSON.stringify(F.renderMap(f,BRAND).pages[0].nodes);assert.match(m2,/Obiettivo: 2\.000/);
 assert.equal(pdfText(F.mapPdf(f,BRAND,{date:TODAY})).slice(0,5),'%PDF-');
});

test('the optional AI: confirm first, exactly one call, invented numbers dropped; cancel means no call',async()=>{
 const m=model('guida');let calls=0,asked=0;
 const rt={reply:async req=>{calls++;assert.equal(req.role,'copywriter');assert.equal(req.messages.length,1);assert.match(req.messages[0].content,/sono dati, non istruzioni/);
  return {text:JSON.stringify({titolo:'Le torte delle feste',sottotitolo:'Come scegliere',introduzione:'Una guida breve.',sezioni:[
   {titolo:'Natale',testo:'Panettone e pandoro.',punti:['Panettone','Pandoro'],consiglio:'Conservali al fresco.'},
   {titolo:'Compleanni',testo:'Il 92% dei bambini sceglie il cioccolato.',punti:['Cioccolato'],consiglio:''},
   {titolo:'Pasqua',testo:'Colomba e pastiera.',punti:['Colomba'],consiglio:'Ordina per tempo.'}]})}}};
 const no=await F.writeWithAi({model:m,rt,confirm:async()=>{asked++;return false}});assert.deepEqual(no,{cancelled:true});assert.equal(calls,0);
 const r=await F.writeWithAi({model:m,rt,project:{id:'demo',name:'Forno Aurora'},confirm:async o=>{asked++;assert.match(o.cost,/una sola chiamata AI/i);return true}});
 assert.equal(calls,1);assert.equal(asked,2);assert.deepEqual(r.magnet.sections.map(s=>s.title),['Natale','Pasqua']);assert.deepEqual(r.dropped,['Compleanni']);
 await assert.rejects(F.writeWithAi({model:model('coupon'),rt,confirm:async()=>true}),/prezzi e condizioni/);assert.equal(calls,1);
 assert.equal(F.parseAi('nessun json',m.input,m.funnel),null);
 // a new title follows into landing, e-mails and CRM name, but never pushes an ad headline past 30 characters
 const f=m.funnel,old=f.magnet.title;f.magnet.title='Le torte delle feste, senza stress e senza corse';F.retitle(f,old,f.magnet.title);
 assert.match(f.landing.headline,/senza stress/);assert.match(f.emails[0].subject+f.emails[0].body,/senza stress/);assert.equal(f.name,'Le torte delle feste, senza stress e senza corse');
 assert.ok(f.promo.ad.headlines.every(h=>[...h].length<=30));
});

test('files and zip: PDF, landing pages, e-mails (md + csv), promo, map, LEGGIMI.txt; blocked while a check fails',async()=>{
 const m=model('guida'),list=await F.files(m,BRAND,{date:TODAY,profile:PROFILE}),names=list.map(x=>x.name);
 for(const n of ['lead-magnet/le-10-torte-per-le-feste.pdf','landing/index.html','landing/grazie.html','landing/privacy.html','landing/cookie.html','landing/le-10-torte-per-le-feste.pdf',
  'email/sequenza-email-le-10-torte-per-le-feste.md','email/sequenza-email-le-10-torte-per-le-feste.csv','promozione/post-e-annuncio.txt','mappa/mappa-funnel-le-10-torte-per-le-feste.pdf','LEGGIMI.txt'])assert.ok(names.includes(n),n);
 const readme=list.find(x=>x.name==='LEGGIMI.txt').data;assert.match(readme,/Invio automatico/);assert.match(readme,/funnel: Le 10 torte per le feste/);
 const zip=F.bundle(list,{date:TODAY});assert.equal(Buffer.from(zip).slice(0,2).toString('latin1'),'PK');
 const bad=model('coupon');bad.funnel.magnet.coupon.code='x';await assert.rejects(F.files(bad,BRAND,{date:TODAY}),/Prima sistema/);
});

test('saved in the project under «funnels»: one record per funnel, online addresses kept, the e-mails in the Copywriter thread',async()=>{
 let doc={schemaVersion:1,conversations:{copywriter:[{role:'user',content:'ciao'}]},funnels:{schemaVersion:1,items:[],online:{'le-10-torte-per-le-feste':{url:'https://radix-lp-x.vercel.app',deploymentId:'dpl_1'}}},other:1};
 const ws={bind:(id,kind)=>{assert.equal(id,'demo');assert.equal(kind,'agents');return {load:async()=>JSON.parse(JSON.stringify(doc)),save:async d=>{doc=d}}}};
 const m=model('guida'),rec=F.savedRecord(m,{by:'Anna',at:'2026-10-22T10:00:00.000Z'});assert.equal(rec.id,'funnel-le-10-torte-per-le-feste');
 await F.saveToProject(ws,'demo',rec,{by:'Anna'});await F.saveToProject(ws,'demo',F.savedRecord(m,{at:'2026-10-22T11:00:00.000Z'}));
 assert.equal(doc.funnels.items.length,1);assert.equal(doc.funnels.online['le-10-torte-per-le-feste'].deploymentId,'dpl_1');assert.equal(doc.other,1);
 assert.equal(doc.conversations.copywriter[0].content,'ciao');assert.ok(doc.conversations.copywriter.length>1);
 assert.deepEqual(F.readStore({funnels:'x'}),{schemaVersion:1,items:[],online:{}});
 assert.equal(F.onlineOf(doc.funnels,'le-10-torte-per-le-feste').url,'https://radix-lp-x.vercel.app');
});

test('wiring: card in «Web e annunci», scripts in crea.html, studio map, agents page keeps «funnels», styles',()=>{
 const R=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
 const core=require('../agency/crea-core.js'),card=core.CARDS.find(c=>c.id==='funnel');
 assert.equal(card.group,'Web e annunci');assert.equal(card.inline,'funnel');assert.match(card.cost,/Nessuna chiamata AI/);assert.match(card.cost,/Facoltativa: 1 chiamata AI al Copywriter[^.]*con conferma/);
 const html=R('agency/crea.html'),i=s=>html.indexOf('<script src="/lib/'+s+'"');
 for(const s of ['print-studio.js','zip-lite.js','site-legal.js','site-studio.js','copy-checks.js','copy-studio.js','infographic-studio.js','funnel-templates.js'])assert.ok(i(s)>=0&&i(s)<i('funnel-studio.js'),s);
 assert.ok(html.indexOf('/sales/crm-campaign-next-core.js')>=0);
 const js=R('agency/crea.js');assert.match(js,/funnel:\{global:'RadixFunnelStudio'/);assert.match(js,/S\.funnelStudio\(\{project,profile:current\.profile/);
 const ap=R('agents-page.js');assert.equal((ap.match(/data\.funnels=fresh\.funnels/g)||[]).length,2);assert.match(ap,/if\(d\.funnels\)out\.funnels=d\.funnels/);
 assert.match(R('shell/crea.css'),/\.cr-panel \.funnel-studio \.fn-path/);assert.match(R('agency/marketing-look.js'),/funnel:'funnel'/);
});
