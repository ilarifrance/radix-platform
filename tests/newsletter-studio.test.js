'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const N=require('../lib/newsletter-studio.js'),LN=require('../sales/lead-newsletter-core.js'),CRM=require('../sales/crm-campaigns.js'),CS=require('../lib/copy-studio.js');
const root=path.join(__dirname,'..');
const KIT={identityKit:{brand:'Forno Aurora',direction:'Crosta dorata',palette:[{role:'primary',hex:'#7A3B1D'},{role:'secondary',hex:'#C26A3A'},{role:'accent',hex:'#E9B44C'},{role:'dark',hex:'#2A1A12'},{role:'light',hex:'#FBF6EE'}],
 fonts:[{heading:'Playfair Display',body:'Inter'}],logo:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 40"><rect width="160" height="40" fill="#7A3B1D"/></svg>'}};
const BRAND=N.brandOf({name:'Forno Aurora — Torino'},KIT);
const SRC={subject:'{{nome}}, da lunedì apriamo anche la domenica',preheader:'Pane caldo dalle 8 alle 13: ti aspettiamo con le novità di stagione',
 body:'Aperti la domenica\n\nCiao {{nome}},\nda lunedì il forno è aperto anche la domenica mattina, dalle 8 alle 13.\n\n- Pane a lievito madre\n- Torte su ordinazione',cta:'Scopri gli orari'};
const SENDER={name:'Forno Aurora',address:'Via Nizza 10, 10125 Torino'};
const LOGO={src:'https://www.fornoaurora.it/logo.png',width:160,height:40};
const docOf=(tid,over={})=>({...SRC,template:tid,brand:BRAND,blocks:N.blocksFor(tid,SRC,{goal:'news',ctaUrl:'https://www.fornoaurora.it/orari'},SENDER),logo:LOGO,...over});

test('brand: the Kit identità first, then the profile’s «Identità visiva», then neutral colours',()=>{
 assert.equal(BRAND.source,'kit');assert.equal(BRAND.name,'Forno Aurora');assert.equal(BRAND.colors.primary,'#7A3B1D');assert.deepEqual(BRAND.fonts,{heading:'Playfair Display',body:'Inter'});assert.match(BRAND.logo,/^<svg/);assert.match(BRAND.label,/Crosta dorata/);
 const media={styleGuide:p=>p&&p.visual?{cover:'#123456',page:'#FAFAFA',key:'#336699',accent:'#FFAA00',text:'#111111',font:'Lato'}:null};
 const v=N.brandOf({name:'Studio',visual:'Copertina #123456'},{},'Studio',{media});assert.equal(v.source,'visual');assert.equal(v.colors.primary,'#123456');assert.equal(v.fonts.heading,'Lato');assert.equal(v.logo,'');
 const d=N.brandOf({name:'Nuovo'},{},'Nuovo',{media:{styleGuide:()=>null}});assert.equal(d.source,'default');assert.match(d.label,/Kit identità/);
 assert.equal(N.brandOf({},{identityKit:{palette:[{role:'primary',hex:'nope'}],logo:'<script>'}},'X').source,'default','bad kit ignored');
 assert.equal(N.fontStack('Playfair Display'),"'Playfair Display',Georgia,'Times New Roman',serif");assert.equal(N.fontStack('Inter'),"'Inter',Helvetica,Arial,sans-serif");
 assert.equal(N.fontStack('Arial'),'Helvetica,Arial,sans-serif');assert.equal(N.fontStack('Bad"Font;'),'Helvetica,Arial,sans-serif','unsafe names dropped');
});

test('source text: a Newsletter saved by the Studio Testi is imported section by section; pasted text too',()=>{
 const svc=CS.service('newsletter'),p={title:'Domenica aperti',sections:{subject:'Da lunedì apriamo anche la domenica',preheader:'Pane caldo dalle 8 alle 13',body:'Ciao,\nda lunedì siamo aperti.\n\nVi aspettiamo.',cta:'Scopri gli orari'},issues:[]};
 const md=CS.toMarkdown('newsletter',p,{project:{name:'Forno'},answers:{},date:'2026-10-21'});
 const parsed=N.parseCopyMarkdown(md);
 assert.deepEqual({...parsed},{name:'Domenica aperti',subject:'Da lunedì apriamo anche la domenica',preheader:'Pane caldo dalle 8 alle 13',body:'Ciao,\nda lunedì siamo aperti.\n\nVi aspettiamo.',cta:'Scopri gli orari'});
 const agents={conversations:{copywriter:[...CS.savedEntry('newsletter',p,md,{at:'2026-10-20T10:00:00Z'}),{role:'assistant',content:'altro'},...CS.savedEntry('testi',{title:'Chi siamo',sections:{}},'# Testi',{at:'2026-10-21T10:00:00Z'})]}};
 assert.ok(svc);const list=N.savedCopies(agents);assert.equal(list.length,1);assert.equal(list[0].subject,'Da lunedì apriamo anche la domenica');assert.equal(list[0].at,'2026-10-20T10:00:00Z');
 assert.deepEqual(N.savedCopies({}),[]);assert.deepEqual(N.savedCopies(null),[]);
 const q=N.parsePasted('Oggetto: Ciao {{nome}}\nAnteprima: Novità di ottobre per te e la tua famiglia\nPulsante: Prenota\n\nTesto della mail.');
 assert.deepEqual({subject:q.subject,preheader:q.preheader,cta:q.cta,body:q.body},{subject:'Ciao {{nome}}',preheader:'Novità di ottobre per te e la tua famiglia',cta:'Prenota',body:'Testo della mail.'});
 assert.equal(N.parsePasted('Solo testo.').body,'Solo testo.');assert.equal(N.parsePasted(md).subject,'Da lunedì apriamo anche la domenica','pasted Markdown of the Studio Testi');
});

test('three templates from the same text: header, text, button, footer; a short first line becomes the headline',()=>{
 assert.deepEqual(N.TEMPLATES.map(t=>t.id),['editoriale','promo','minimal']);
 const e=N.blocksFor('editoriale',SRC,{goal:'news',ctaUrl:'https://x.it/a'},SENDER);
 assert.deepEqual(e.map(b=>b.type),['header','text','button','divider','footer']);
 assert.equal(e[1].heading,'Aperti la domenica');assert.ok(e[1].body.startsWith('Ciao {{nome}},'));assert.equal(e[2].label,'Scopri gli orari');assert.equal(e[2].url,'https://x.it/a');
 assert.equal(e[4].sender,'Forno Aurora');assert.match(e[4].reason,/comunicazioni di Forno Aurora/);
 assert.deepEqual(N.blocksFor('minimal',SRC,{},SENDER).map(b=>b.type),['header','text','button','footer']);
 assert.equal(N.blocksFor('promo',{...SRC,cta:''},{goal:'promo'},SENDER)[2].label,'Approfitta dell’offerta','goal default label');
 assert.equal(N.headlineOf({subject:'{{nome}}, novità!',body:'Ciao {{nome}}, ecco le novità.'}).heading,'novità!','the subject without merge tags');
});

test('blocks editor: reorder, delete, add; the footer stays last and cannot go',()=>{
 let b=N.blocksFor('editoriale',SRC,{},SENDER);const [h,t,btn]=b,foot=b[b.length-1];
 b=N.moveBlock(b,btn.id,-1);assert.deepEqual(b.slice(0,3).map(x=>x.id),[h.id,btn.id,t.id]);
 assert.deepEqual(N.moveBlock(b,h.id,-1).map(x=>x.id),b.map(x=>x.id),'top stays');
 assert.equal(N.moveBlock(b,foot.id,-1).at(-1).id,foot.id,'footer does not move');
 assert.equal(N.moveBlock(b,b[b.length-2].id,1).at(-1).id,foot.id,'nothing goes below the footer');
 assert.equal(N.removeBlock(b,foot.id).at(-1).id,foot.id);assert.equal(N.removeBlock(b,h.id).length,b.length-1);
 b=N.addBlock(b,'columns');assert.equal(b.at(-2).type,'columns');assert.equal(b.at(-1).type,'footer');assert.equal(N.addBlock(b,'footer').length,b.length,'only addable types');
 assert.deepEqual(N.normalizeBlocks([{type:'footer',id:'f'},{type:'text',id:'t'},{type:'evil'}]).map(x=>x.id),['t','f']);
 assert.equal(N.normalizeBlocks([]).at(-1).type,'footer','a footer is always there');
});

test('HTML for email clients: tables, 600 px, inline styles, bulletproof button, preheader, fonts with fallbacks, dark mode',()=>{
 for(const t of N.TEMPLATES){const h=N.buildHtml(docOf(t.id));
  assert.match(h,/^<!DOCTYPE html>/);assert.match(h,/<table role="presentation" class="nl-container" width="600"[^>]*style="width:100%;max-width:600px;/);
  assert.match(h,/<!--\[if mso\]><table role="presentation" width="600" align="center"/,'Outlook ghost table');
  assert.doesNotMatch(h,/<div[^>]*class="[^"]*(row|grid|flex)/);assert.doesNotMatch(h,/display:\s*(flex|grid)/,'no flex or grid');
  assert.doesNotMatch(h,/<script|<svg|position:\s*(absolute|fixed)/i,'no scripts, no SVG, no positioning');
  // every visible text element carries its own inline style
  for(const m of h.matchAll(/<(p|h1|h2|h3|a|td)\b[^>]*>/g))if(!/^<td\b(?![^>]*style=)[^>]*valign|^<td>$/.test(m[0]))assert.match(m[0],/style="[^"]+"/,m[0].slice(0,80));
  assert.match(h,/<v:roundrect [^>]*href="https:\/\/www\.fornoaurora\.it\/orari"[^>]*fillcolor="#[0-9A-F]{6}"><w:anchorlock\/><center[^>]*>Scopri gli orari<\/center><\/v:roundrect>/,'VML button for Outlook');
  assert.match(h,/<!--\[if !mso\]><!--><table role="presentation"[^>]*class="nl-btn"[^>]*><tr><td align="center" bgcolor="#[0-9A-F]{6}" style="border-radius:\d+px;background-color:#[0-9A-F]{6};[^"]*"><a href="https:\/\/www\.fornoaurora\.it\/orari" target="_blank" style="display:inline-block;padding:/,'HTML button');
  assert.match(h,/<div style="display:none;[^"]*mso-hide:all;">Pane caldo dalle 8 alle 13: ti aspettiamo con le novità di stagione(&#8199;&#847;&zwnj;&nbsp;)+<\/div>/,'hidden preheader with filler');
  assert.match(h,/font-family:'Playfair Display',Georgia,'Times New Roman',serif/);assert.match(h,/font-family:'Inter',Helvetica,Arial,sans-serif/);
  assert.match(h,/<!--\[if mso\]><style>table,td,p,a,h1,h2,h3,li,center\{font-family:Arial,Helvetica,sans-serif!important\}<\/style><!\[endif\]-->/);
  assert.match(h,/family=Playfair\+Display:wght@400;700&amp;family=Inter:wght@400;700&amp;display=swap/);
  assert.match(h,/<meta name="color-scheme" content="light dark">/);assert.match(h,/@media \(prefers-color-scheme:dark\)\{[^\n]*\.nl-card\{background-color:#1A1D23!important\}/);assert.match(h,/\[data-ogsc\] \.nl-text/);
  assert.match(h,/@media screen and \(max-width:620px\)\{\.nl-container\{width:100%!important\}/);
  assert.match(h,/<img src="https:\/\/www\.fornoaurora\.it\/logo\.png" width="160" height="40" alt="Forno Aurora"/);
  assert.match(h,/<title>\{\{nome\}\}, da lunedì apriamo anche la domenica<\/title>/);
  assert.match(h,/&bull;<\/td><td class="nl-text"[^>]*>Pane a lievito madre<\/td>/,'bullets as a table');
  assert.match(h,/<h1 class="nl-h[^"]*" style="[^"]*">Aperti la domenica<\/h1>/);
  assert.ok(N.bytes(h)<20*1024,t.id+' weighs '+N.bytes(h))}
 assert.match(N.buildHtml(docOf('promo')),/class="nl-band nl-pad"[^>]*style="background-color:#7A3B1D;/,'Promo: the headline on a colour band');
 assert.match(N.buildHtml(docOf('minimal')),/border:2px solid #[0-9A-F]{6};"><a [^>]*color:#[0-9A-F]{6};/,'Minimal: outlined button');
 const x=N.buildHtml(docOf('editoriale',{subject:'<b>"x"</b>',blocks:[N.makeBlock('text',{heading:'<script>alert(1)</script>',body:'a & b https://example.com/p?q=1&r=2.'})]}));
 assert.doesNotMatch(x,/<script>|<b>/);assert.match(x,/&lt;script&gt;/);assert.match(x,/<a href="https:\/\/example\.com\/p\?q=1&amp;r=2" target="_blank" class="nl-link"/,'links made clickable, & escaped');
});

test('blocks render: image with alt and size, two columns that stack on phones, divider, no logo means a wordmark',()=>{
 const blocks=[N.makeBlock('header'),N.makeBlock('hero',{url:'https://cdn.example.com/a.jpg',alt:'Il bancone',w:1200,h:800,href:'https://x.it'}),N.makeBlock('columns',{left:{heading:'Pane',body:'Ogni mattina.'},right:{heading:'Torte',body:'Su ordinazione.'}}),N.makeBlock('divider'),N.makeBlock('footer',{sender:'Forno'})];
 const h=N.buildHtml({...SRC,template:'editoriale',brand:BRAND,blocks});
 assert.match(h,/<a href="https:\/\/x\.it" target="_blank"><img src="https:\/\/cdn\.example\.com\/a\.jpg" width="600" height="400" alt="Il bancone" class="nl-img" style="display:block;[^"]*width:100%;max-width:600px;height:auto;">/);
 assert.match(h,/<div class="nl-col" style="display:inline-block;width:100%;max-width:270px;vertical-align:top;">/);assert.match(h,/<td width="270" valign="top"><!\[endif\]-->/);
 assert.match(h,/class="nl-rule" style="border-top:1px solid #[0-9A-F]{6};/);
 assert.match(h,/<p class="nl-h" style="[^"]*">Forno Aurora<\/p>/,'wordmark without a logo');
 assert.equal(N.imagesIn(h).length,1);
 assert.doesNotMatch(N.buildHtml({...SRC,template:'editoriale',brand:BRAND,blocks:[N.makeBlock('hero'),N.makeBlock('columns')]}),/<img|class="nl-col"/,'empty blocks leave nothing');
 assert.deepEqual(N.logoBox('<svg viewBox="0 0 160 40">'),{width:160,height:40});assert.deepEqual(N.logoBox('<svg viewBox="0 0 400 40">'),{width:200,height:20});assert.deepEqual(N.logoBox('<svg width="40" height="40">'),{width:40,height:40});
});

test('unsubscribe placeholder and merge tags work with the CRM: withUnsubscribe link, lead-newsletter render',()=>{
 const d=docOf('editoriale'),h=N.buildHtml(d),t=N.toText(d);
 assert.match(h,/<a href="\{\{link_disiscrizione\}\}" target="_blank" class="nl-muted"[^>]*>Disiscriviti<\/a>/);assert.match(t,/Disiscriviti: \{\{link_disiscrizione\}\}\n$/);
 const plan=CRM.withUnsubscribe(CRM.planCampaign('Oggetto','x',[{id:'c1',name:'Anna Rossi',email:'anna@example.com',marketing_consent:true}]),{c1:'A'.repeat(64)},'https://radix.example');
 const filled=N.fillUnsubscribe(h,plan.emails[0].unsubscribeUrl);
 assert.ok(filled.includes('href="https://radix.example/api/sales?unsubscribe='+'A'.repeat(64)+'"'));assert.ok(!filled.includes(N.UNSUB_TAG));
 assert.throws(()=>N.fillUnsubscribe(h,'javascript:alert(1)'),/non valido/);
 assert.deepEqual([...N.TAGS],[...LN.TAGS],'same merge tags as the CRM newsletter');
 const r=LN.render(h,{nome:'Anna'});assert.ok(r.text.includes('<title>Anna, da lunedì apriamo anche la domenica</title>'));assert.ok(r.text.includes('Ciao Anna,'));assert.ok(r.text.includes(N.UNSUB_TAG),'unknown to the renderer: left for the send step');
 const crm=N.toCrmDraft({...d,subject:'{{nome}} e {{cognome|amici}}'},'Forno Aurora',1);
 assert.equal(crm.draft.subject,'{nome} e amici');assert.deepEqual(crm.lost,['{{cognome}}']);assert.match(crm.draft.body,/Ciao \{nome\},/);
 assert.doesNotMatch(crm.draft.body,/Disiscriviti|link_disiscrizione/,'the CRM adds its own unsubscribe line');assert.equal(crm.draft.source,'Newsletter HTML · Forno Aurora');assert.ok(crm.draft.body.length<=4000);
 assert.equal(CRM.fill(crm.draft.subject,{name:'Anna Rossi'}),'Anna e amici','the CRM fills it');
 assert.equal(N.toCrmDraft({...d,blocks:[N.makeBlock('text',{body:'x'.repeat(5000)})]},'F').cut,true);
});

test('plain-text version from the same blocks',()=>{
 const blocks=[N.makeBlock('header'),N.makeBlock('hero',{url:'https://c.it/a.jpg',alt:'Il forno'}),N.makeBlock('text',{heading:'Titolo',body:'Uno.\n\n• due\n• tre'}),N.makeBlock('button',{label:'Vai',url:'https://x.it'}),N.makeBlock('columns',{left:{heading:'A',body:'a'},right:{heading:'B',body:'b'}}),N.makeBlock('divider'),N.makeBlock('footer',{sender:'Forno',address:'Via Nizza 10',reason:'Sei cliente.'})];
 assert.equal(N.toText({brand:BRAND,blocks}),'FORNO AURORA\n\nTitolo\n\nUno.\n\n- due\n- tre\n\nVai: https://x.it\n\nA\na\n\nB\nb\n\n————\n\n————\nForno · Via Nizza 10\nSei cliente.\nDisiscriviti: {{link_disiscrizione}}\n');
});

test('checks: all pass on a good email; each one fails for its own reason',()=>{
 const good=docOf('editoriale'),list=N.checks(good);
 assert.deepEqual(list.map(c=>c.id),['size','alt','contrast','links','subject','preheader','unsubscribe','tags','ratio','text']);
 assert.deepEqual(list.filter(c=>c.state!=='ok'),[],JSON.stringify(list.filter(c=>c.state!=='ok')));
 assert.deepEqual(N.summary(list),{ok:10,warn:0,fail:0,total:10});
 const one=(over,id)=>N.checks({...good,...over}).find(c=>c.id===id);
 // size: Gmail clips at 102 KB; embedded images are flagged and the hosted size estimated
 const big=N.makeBlock('hero',{src:'data:image/jpeg;base64,'+'A'.repeat(120*1024),alt:'Foto',w:1200,h:600});
 const bigDoc={...good,blocks:[big,...good.blocks]};
 const s=N.checks(bigDoc);assert.equal(s.find(c=>c.id==='size').state,'fail');assert.match(s.find(c=>c.id==='size').detail,/Gmail taglierebbe[\s\S]*scende a circa/);assert.equal(s.find(c=>c.id==='hosted').state,'warn');
 assert.equal(one({blocks:[N.makeBlock('text',{body:'x '.repeat(32*1024)}),...good.blocks]},'size').state,'warn','over 60 KB: warning');
 assert.equal(one({blocks:[N.makeBlock('hero',{url:'https://c.it/a.jpg',alt:''}),...good.blocks]},'alt').state,'fail');
 assert.equal(one({logo:{src:'https://c.it/l.png',width:100,height:40},brand:{...BRAND,name:''}},'alt').state,'ok','brand fallback name as alt');
 const pale=N.brandOf({},{identityKit:{palette:[{role:'primary',hex:'#FFE9F0'},{role:'dark',hex:'#FFFFFF'},{role:'light',hex:'#FFFFFF'},{role:'accent',hex:'#FFF2CC'},{role:'secondary',hex:'#FFFFFF'}]}});
 assert.equal(N.checks({...good,brand:pale}).find(c=>c.id==='contrast').state,'ok','pale kits are corrected to readable colours');
 for(const th of N.TEMPLATES.map(t=>N.theme(t.id,pale)))for(const [l,a,b,need] of N.contrastPairs(th))assert.ok(N.contrast(a,b)>=need,l+' '+a+' on '+b);
 const noUrl=good.blocks.map(b=>b.type==='button'?{...b,url:''}:b);assert.match(one({blocks:noUrl},'links').detail,/pulsante senza link/);
 const http=good.blocks.map(b=>b.type==='button'?{...b,url:'http://x.it'}:b);assert.equal(one({blocks:http},'links').state,'fail');
 assert.equal(N.validLink('https://www.x.it/a?b=1'),true);assert.equal(N.validLink('https://localhost'),false);assert.equal(N.validLink('javascript:alert(1)'),false);assert.equal(N.validLink('{{link_disiscrizione}}'),true);assert.equal(N.validLink('mailto:a@b.it'),true);
 assert.equal(one({subject:'x'.repeat(61)},'subject').state,'warn');assert.equal(one({subject:''},'subject').state,'fail');assert.equal(one({subject:'x'.repeat(60)},'subject').state,'ok');
 assert.equal(one({preheader:'breve'},'preheader').state,'warn');assert.equal(one({preheader:'x'.repeat(111)},'preheader').state,'warn');assert.equal(one({preheader:''},'preheader').state,'fail');assert.equal(one({preheader:'x'.repeat(40)},'preheader').state,'ok');
 assert.equal(N.checks(good,N.buildHtml(good).replace(/\{\{link_disiscrizione\}\}/g,'https://x.it'),N.toText(good)).find(c=>c.id==='unsubscribe').state,'fail');
 assert.match(one({subject:'Ciao {{nomee}}'},'tags').detail,/\{\{nomee\}\}/);assert.equal(one({subject:'Ciao {{nomee}}'},'tags').state,'fail');
 assert.equal(one({subject:'Ciao {nome}'},'tags').state,'warn','single braces of the CRM campaign');
 assert.equal(one({subject:'Ciao {{città|amico}} {{azienda}}'},'tags').state,'ok');
 const heavy={...good,blocks:[N.makeBlock('hero',{url:'https://c.it/a.jpg',alt:'Foto',w:600,h:1400}),N.makeBlock('text',{body:'Poche parole.'}),N.makeBlock('footer',{sender:'F'})]};
 assert.equal(N.checks(heavy).find(c=>c.id==='ratio').state,'warn');
 assert.equal(N.checks(good).find(c=>c.id==='ratio').state,'ok');
});

test('saved in the project: newsletters key in the agents document, other keys kept, embedded images left out',async()=>{
 const d=docOf('promo',{blocks:[N.makeBlock('hero',{src:'data:image/jpeg;base64,AAAA',alt:'x'}),...docOf('promo').blocks]});
 const rec=N.savedRecord(d,{goal:'promo',ctaUrl:'https://x.it',logoUrl:'http://insecure.it/l.png',by:'Anna',at:'2026-10-21T10:11:12.000Z'});
 assert.equal(rec.id,'nl-20261021101112-da-lunedi-apriamo-anche-');assert.equal(rec.template,'promo');assert.equal(rec.goal,'promo');assert.equal(rec.logoUrl,'','only https logo addresses');
 assert.equal(rec.blocks[0].src,'');assert.equal(rec.blocks[0].hadImage,true);assert.ok(!JSON.stringify(rec).includes('data:'));
 let stored={conversations:{copywriter:[1]},adCreatives:{items:[1]},siteAudit:{x:1}},rev=0,conflicts=1;
 const ws={ConflictError:class extends Error{},bind:()=>({load:async()=>JSON.parse(JSON.stringify(stored)),save:async next=>{if(conflicts-->0)throw new ws.ConflictError('conflict');stored=next;rev++;return {revision:rev}}})};
 const s=await N.saveToProject(ws,'p1',rec);assert.equal(s.items.length,1);assert.deepEqual(stored.adCreatives,{items:[1]});assert.deepEqual(stored.siteAudit,{x:1});assert.deepEqual(stored.conversations,{copywriter:[1]});
 await N.saveToProject(ws,'p1',{...rec,subject:'Nuovo'});assert.equal(stored.newsletters.items.length,1,'same id replaces');assert.equal(stored.newsletters.items[0].subject,'Nuovo');
 let st=N.readStore({});for(let i=0;i<25;i++)st=N.addRecord(st,{...rec,id:'n'+i});assert.equal(st.items.length,20);
 await assert.rejects(N.saveToProject(null,'p',rec),/non disponibile/);
 assert.equal(N.filename(d,'html'),'newsletter-da-lunedi-apriamo-anche-la-domenica.html');
});

test('the panel: card in Social e contenuti, inline studio, no AI, never sends',()=>{
 const core=require('../agency/crea-core.js'),look=require('../agency/marketing-look.js'),c=core.card('emailhtml');
 assert.equal(c.group,'Social e contenuti');assert.equal(c.inline,'mail');assert.equal(core.linkFor(c,'forno'),null);assert.match(c.cost,/^Nessuna chiamata AI/);assert.ok(look.has(look.CARDS.emailhtml));
 const js=fs.readFileSync(path.join(root,'agency/crea.js'),'utf8');assert.match(js,/mail:\{global:'RadixNewsletterStudio'/);assert.match(js,/S\.newsletterStudio\(\{project,profile:current\.profile,projectName:current\.name,projectId:current\.id,workspace:ws\}\)/);
 const html=fs.readFileSync(path.join(root,'agency/crea.html'),'utf8');assert.ok(html.indexOf('/lib/newsletter-studio.js')>0&&html.indexOf('/lib/newsletter-studio.js')<html.indexOf('/agency/crea.js'));
 const src=fs.readFileSync(path.join(root,'lib/newsletter-studio.js'),'utf8');
 assert.doesNotMatch(src,/\/api\/send-email|RadixAgents\.reply|api\/chat|fetch\(/,'no sending, no AI, no network');
 assert.match(src,/radix-crm-campaign-draft/);assert.match(src,/root\.confirm\('Passare oggetto e versione testo/);
 assert.match(src,/sandbox','allow-same-origin'/,'previews run no scripts');
 const css=fs.readFileSync(path.join(root,'shell/crea.css'),'utf8');assert.match(css,/\.cr-panel \.nl-props\{/);assert.match(css,/@media \(max-width:640px\)\{\n  \.cr-panel \.nl-studio \.nl-goals/);
});
