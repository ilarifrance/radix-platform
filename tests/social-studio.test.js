'use strict';
// Studio «Grafica profili e template social» (lib/social-studio.js): the size table, the empty state without a Kit
// identità, data never invented, every piece inside its safe area and circle crop, AA contrast, readable text on a phone,
// palette colours only, placeholders, the photo slot, file names, LEGGIMI with the upload steps, the zip, the saved key
// socialKit that agents-page.js keeps, the card in «Cosa vuoi fare» and no AI or image generation call.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const S=require('../lib/social-studio.js'),PS=require('../lib/print-studio.js'),ZIP=require('../lib/zip-lite.js');
const crea=require('../agency/crea-core.js'),look=require('../agency/marketing-look.js');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');

const LOGO='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 96"><circle cx="48" cy="48" r="30" fill="#2F5D50"/><circle cx="60" cy="38" r="10" fill="#E3B448"/><text x="92" y="60" font-family="Fraunces, serif" font-size="34" font-weight="700" fill="#1C1C1E">Forno Aurora</text></svg>';
const KIT={brand:'Forno Aurora',direction:'Bottega di quartiere',palette:[{role:'primary',hex:'#2F5D50'},{role:'secondary',hex:'#A0522D'},{role:'accent',hex:'#E3B448'},{role:'dark',hex:'#1C1C1E'},{role:'light',hex:'#FAF6EE'}],fonts:[{heading:'Fraunces',body:'Inter'}],logo:LOGO};
const PROFILE={identityKit:KIT,payoff:'Pane a lievito madre dal 1987',contacts:{website:'https://www.fornoaurora.it/'}};
const ALL=['instagram','facebook','linkedin','linkedin-persona','youtube','x','tiktok'];
const PHOTO={src:'data:image/jpeg;base64,/9j/AAAA',w:2160,h:1620,name:'pane.jpg'};
const TEXTS={offerta:{title:'Focaccia a 3 € il martedì',body:'Tutte le focacce del giorno, fino alle 13',meta:'Fino al 30 novembre',cta:'Passa in negozio'},
 recensione:{title:'Il pane più buono del quartiere, croccante e profumato.',meta:'Giulia · Recensione Google',stars:5},
 evento:{title:'Laboratorio del pane per bambini',meta:'Sabato 15 novembre · ore 10',body:'In negozio, via Nizza 12',cta:'Prenota'},
 prodotto:{title:'Panettone al farro',body:'Lievito madre, 36 ore di lievitazione',meta:'24 €'},
 consiglio:{title:'Il pane si conserva in un sacchetto di carta',body:'Mai in frigorifero: diventa raffermo prima'},
 annuncio:{title:'Dal 1° dicembre apriamo anche la domenica',body:'Dalle 8 alle 13',meta:'Da dicembre'}};
const model=(o={})=>S.modelOf({direction:'chiaro',channels:ALL,payoff:'Pane a lievito madre dal 1987',sito:'www.fornoaurora.it',texts:TEXTS,...o},PROFILE,{projectName:'Forno Aurora'});
const state=(checks,id)=>(checks.find(c=>c.id===id)||{}).state;
const PNG=new Uint8Array([137,80,78,71,13,10,26,10]);
const DATE=new Date('2026-10-23T10:00:00Z');

test('the size table: the current sizes, safe areas inside the image, the readable size on a phone',()=>{
 const c=Object.fromEntries(S.SIZES.covers.map(x=>[x.id,[x.w,x.h]]));
 assert.deepEqual(c,{facebook:[1640,624],linkedin:[1128,191],'linkedin-persona':[1584,396],youtube:[2560,1440],x:[1500,500]});
 const yt=S.SIZES.covers.find(x=>x.id==='youtube');assert.deepEqual([yt.safe.w,yt.safe.h],[1546,423],'YouTube: the area seen on every device');
 assert.equal(yt.safe.x*2+yt.safe.w,2560);assert.equal(S.SIZES.covers.find(x=>x.id==='facebook').safe.w,1108,'Facebook: the centre the phone shows');
 for(const x of S.SIZES.covers.concat(S.SIZES.posts)){assert.ok(x.safe.x>=0&&x.safe.y>=0&&x.safe.x+x.safe.w<=x.w&&x.safe.y+x.safe.h<=x.h,x.id);assert.ok(x.seen>0,x.id)}
 assert.deepEqual(S.SIZES.posts.map(p=>[p.id,p.w,p.h]),[['quadrato',1080,1080],['verticale',1080,1350],['storia',1080,1920]]);
 const story=S.SIZES.posts[2];assert.ok(story.safe.y>=1920*.14-1&&1920-(story.safe.y+story.safe.h)>=1920*.2-1,'story: 14% top and 20% bottom free');
 assert.deepEqual([S.SIZES.highlight.w,S.SIZES.highlight.h],[1080,1920]);
 assert.deepEqual(S.SIZES.profile.map(p=>[p.channel,p.w]),[['instagram',1080],['facebook',1080],['linkedin',400],['youtube',800],['x',400],['tiktok',1080]]);
 assert.equal(S.minText(1080),34);assert.equal(S.minText(390),12);assert.match(S.SIZES.checked,/^\d{4}-\d{2}$/);
});

test('without a Kit identità: the empty state, nothing invented, the export blocked',()=>{
 assert.equal(S.hasKit(PROFILE),true);assert.equal(S.hasKit({}),false);assert.equal(S.hasKit({identityKit:{brand:'X'}}),false,'a kit without palette is not enough');
 const m=S.modelOf({},{contacts:{phone:'011'}},{projectName:'Forno'});assert.equal(state(S.checksOf(m),'kit'),'fail');
 return assert.rejects(S.files(m,{png:async()=>PNG}),/kit identità/i);
});

test('prefill: payoff and site from the project only; empty stays empty',()=>{
 assert.deepEqual(S.prefill(PROFILE,{projectName:'Forno Aurora'}).values,{payoff:'Pane a lievito madre dal 1987',sito:'www.fornoaurora.it'});
 assert.deepEqual(S.prefill({identityKit:KIT},{projectName:'Forno Aurora'}).values,{payoff:'',sito:''});
 const m=model({payoff:'',sito:''}),L=S.coverLayout(S.SIZES.covers[0],m);
 assert.deepEqual(L.items.filter(i=>i.t==='text'),[],'no payoff or site: the cover shows only the logo');
 const c=S.checksOf(m).find(x=>x.id==='copertine');assert.match(c.detail,/non li inventa/);
 assert.match(S.readme(m,S.checksOf(m),S.exportList(m)),/DATI NON PRESENTI[\s\S]*Payoff[\s\S]*Sito web/);
});

test('what gets made follows the channels: covers, profile images, highlights only for Instagram, stories only where they exist',()=>{
 let m=model({channels:['linkedin-persona']});
 assert.deepEqual(S.coversOf(m).map(c=>c.id),['linkedin-persona']);assert.deepEqual(S.profilesOf(m),[],'a personal profile keeps the person’s photo');
 assert.deepEqual(S.highlightsOf(m),[]);assert.deepEqual(S.postFormatsOf(m).map(f=>f.id),['quadrato','verticale'],'no stories on LinkedIn');
 m=model({channels:['tiktok']});assert.deepEqual(S.coversOf(m),[]);assert.deepEqual(S.profilesOf(m).map(p=>p.channel),['tiktok']);assert.deepEqual(S.postFormatsOf(m),[]);
 m=model();assert.deepEqual(S.highlightsOf(m).map(h=>h.id),['menu','chi-siamo','prodotti','recensioni','contatti']);
 const b=S.build(m);assert.equal(b.filter(L=>L.kind==='post').length,6*3);assert.equal(b.filter(L=>L.kind==='copertina').length,5);assert.equal(b.filter(L=>L.kind==='profilo').length,1);
 m=model({pieces:['evidenza'],channels:['facebook']});assert.equal(state(S.checksOf(m),'vuoto'),'fail','highlights exist only on Instagram');
});

test('every direction, with and without a photo: safe areas, circle crops, AA contrast, readable size, palette colours',()=>{
 for(const direction of ['chiaro','pieno','fascia'])for(const photo of [null,PHOTO])for(const avatar of ['simbolo','logo','iniziali']){
  const m=model({direction,photo,avatar}),c=S.checksOf(m),tag=direction+(photo?'+foto':'')+' '+avatar;
  for(const id of ['kit','safe','contrasto','misura','colori'])assert.equal(state(c,id),'ok',tag+' '+id+': '+JSON.stringify(c.find(x=>x.id===id)));
  assert.equal(state(c,'testi'),'ok',tag);assert.equal(state(c,'foto'),'ok',tag);
  for(const L of S.build(m)){const photos=L.items.filter(i=>i.t==='photo');if(L.kind==='post')assert.equal(photos.length,photo?1:0,tag+' '+L.spec.id);else assert.equal(photos.length,0)}}
});

test('the profile image: the kit symbol inside the circle; the whole wide logo is flagged; initials from the name',()=>{
 let L=S.avatarLayout(model({avatar:'simbolo'}));const sym=L.items.find(i=>i.t==='logo');assert.equal(sym.label,'Simbolo');assert.ok(!/Forno Aurora<\/text>/.test(sym.svg),'the symbol without the wordmark');
 assert.deepEqual(S.safeProblems(L),[]);
 const wide=S.checksOf(model({avatar:'logo'})).find(c=>c.id==='profilo');assert.equal(wide.state,'warn');assert.match(wide.detail,/Simbolo del logo/);
 L=S.avatarLayout(model({avatar:'iniziali'}));assert.equal(L.items.find(i=>i.t==='text').s,'FA');assert.equal(S.initials('Forno Aurora S.r.l.'),'FA');assert.equal(S.initials('Bar Roma di Rossi'),'BR');
 // a box outside the circle is caught
 L.items.push({t:'logo',x:0,y:0,w:200,h:200,svg:LOGO,label:'Logo'});assert.match(S.safeProblems(L)[0],/ritaglio rotondo/);
});

test('covers: logo and texts inside the safe area, decorations never under the text, a text that cannot be read is left out',()=>{
 for(const direction of ['chiaro','pieno','fascia'])for(const spec of S.SIZES.covers){const L=S.coverLayout(spec,model({direction}));
  assert.deepEqual(S.safeProblems(L),[],direction+' '+spec.id);
  const boxes=L.items.filter(i=>i.t==='text'||i.t==='logo').map(S.boxOf);
  for(const c of L.items.filter(i=>i.t==='circle'))for(const b of boxes){const dx=Math.max(b.x0-c.cx,0,c.cx-b.x1),dy=Math.max(b.y0-c.cy,0,c.cy-b.y1);assert.ok(Math.hypot(dx,dy)>=c.r,direction+' '+spec.id+' circle over a text')}
  for(const t of L.items.filter(i=>i.t==='text'))assert.ok(t.size>=S.minText(spec.seen)-.01,spec.id+' '+t.label+' '+t.size)}
 const long=model({payoff:'Pane, focacce, grissini, biscotti e torte con farine macinate a pietra da mulini piemontesi'}),L=S.coverLayout(S.SIZES.covers.find(c=>c.id==='linkedin'),long);
 assert.ok(!L.items.some(i=>i.label==='Payoff'));assert.match(L.notes[0],/payoff non entra/);assert.equal(state(S.checksOf(long),'copertine'),'warn');
});

test('post templates: the texts the person writes, placeholders flagged, stars only when given, too long text blocks the export',()=>{
 const m=model({texts:{}}),c=S.checksOf(m);assert.equal(state(c,'testi'),'warn');assert.match(c.find(x=>x.id==='testi').issues.join(' '),/Offerta: titolo dell’offerta/);
 const tx=S.postTexts(m,'recensione');assert.equal(tx.stars,0,'no stars unless written');assert.equal(tx.kicker,'Dicono di noi');assert.match(tx.title,/^\[/);
 const r=S.postTexts(model(),'recensione');assert.equal(r.title,'«Il pane più buono del quartiere, croccante e profumato.»');assert.equal(r.stars,5);
 assert.equal(S.postLayout('recensione',S.SIZES.posts[0],model()).items.filter(i=>i.t==='star').length,5);
 assert.equal(S.modelOf({texts:{recensione:{stars:9}}},PROFILE).texts.recensione.stars,0,'stars outside 1-5 are dropped');
 const off=S.postLayout('offerta',S.SIZES.posts[0],model());assert.ok(off.items.some(i=>i.t==='text'&&i.s==='Passa in negozio'));assert.ok(off.items.some(i=>i.label==='Pulsante'));
 // the field limits keep the texts inside even at the smallest size; past them (an old saved record) the check blocks
 const ok=model({types:['consiglio'],texts:{consiglio:{title:'Parola '.repeat(14),body:'Una spiegazione molto lunga '.repeat(6)}}});assert.equal(state(S.checksOf(ok),'misura'),'ok');
 const huge=model({types:['consiglio']});huge.texts.consiglio={kicker:'Consiglio',title:'Parola lunghissima '.repeat(20),body:'Una spiegazione molto lunga '.repeat(12)};
 const hc=S.checksOf(huge);assert.equal(state(hc,'misura'),'fail');assert.match(hc.find(x=>x.id==='misura').issues[0],/troppo lungo/);
 return assert.rejects(S.files(huge,{png:async()=>PNG}),/testo leggibile/);
});

test('contrast and photo: text on a photo or a weak colour is caught; a small photo is flagged',()=>{
 const L={kind:'post',spec:{id:'x',title:'Prova',w:100,h:100,safe:{x:0,y:0,w:100,h:100}},bg:'#FFFFFF',items:[{t:'photo',x:0,y:0,w:100,h:50,src:'data:'},{t:'text',x:5,y:30,s:'Ciao',size:12,bold:false,fill:'#000000',label:'Titolo'},{t:'text',x:5,y:80,s:'Ciao',size:12,bold:false,fill:'#BBBBBB',label:'Testo'}]};
 const p=S.contrastProblems(L);assert.match(p[0],/sopra la foto/);assert.match(p[1],/serve 4,5:1/);
 const small=S.checksOf(model({photo:{...PHOTO,w:600,h:450}}));assert.equal(state(small,'foto'),'warn');assert.match(small.find(c=>c.id==='foto').detail,/sgranare/);
 assert.equal(S.modelOf({photo:{src:'https://example.com/a.jpg',w:10,h:10}},PROFILE).photo,null,'only a photo read in the browser');
 const bad={...L,items:[{t:'rect',x:0,y:0,w:10,h:10,fill:'#123456'}]};assert.deepEqual(S.colourProblems(bad,model().brand),['#123456']);
});

test('the files: PNG and SVG per piece with platform and size in the name, LEGGIMI with the upload steps, the zip',async()=>{
 const m=model({photo:PHOTO}),calls=[];const list=await S.files(m,{png:async(svg,w,h)=>{calls.push([w,h,svg.slice(0,120)]);return PNG},date:DATE});
 const names=list.map(f=>f.name);const base='social-forno-aurora/';
 for(const n of ['profilo/instagram-profilo-1080x1080.png','profilo/linkedin-profilo-400x400.png','profilo/youtube-profilo-800x800.png','profilo/x-profilo-400x400.png','profilo/tiktok-profilo-1080x1080.png',
  'copertine/facebook-copertina-1640x624.png','copertine/linkedin-copertina-1128x191.png','copertine/linkedin-persona-copertina-1584x396.png','copertine/youtube-copertina-2560x1440.png','copertine/x-copertina-1500x500.png',
  'in-evidenza/instagram-in-evidenza-menu-1080x1920.png','post/offerta-quadrato-1080x1080.png','post/recensione-verticale-1080x1350.png','post/annuncio-storia-1080x1920.png','LEGGIMI.txt'])assert.ok(names.includes(base+n),n);
 assert.ok(names.includes(base+'post/offerta-quadrato-1080x1080.svg'));
 for(const [w,h,svg] of calls)assert.match(svg,new RegExp('width="'+w+'" height="'+h+'"'),'the SVG is drawn at the PNG size');
 const readme=list.find(f=>f.name.endsWith('LEGGIMI.txt')).data;
 for(const w of ['INSTAGRAM','Modifica copertina','FACEBOOK (PAGINA)','LINKEDIN (PAGINA AZIENDALE)','YouTube Studio › Personalizzazione › Branding','X','TIKTOK','telefono e dal computer','Contrasto AA'])assert.ok(readme.includes(w),w);
 assert.match(readme,/nessuna chiamata AI/);
 const zip=S.bundle(list,{date:DATE}),back=ZIP.unzip(zip);assert.equal(back.length,list.length);assert.equal(S.zipName(m),'social-forno-aurora-chiaro.zip');
 const svg=list.find(f=>f.name.endsWith('offerta-quadrato-1080x1080.svg')).data;assert.match(svg,/clip-path="url\(#sc-clip-1\)"/);assert.match(svg,/Focaccia a 3 € il martedì/);
 assert.ok(!/https?:\/\//.test(svg.replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g,'')),'no external address in the images');
});

test('saved in the project under socialKit: choices and texts, never the photo; agents-page keeps the key',async()=>{
 const rec=S.savedRecord(model({photo:PHOTO,direction:'pieno'}),{by:'Ilari',at:'2026-10-23T10:00:00.000Z'});
 assert.equal(rec.id,'social-20261023100000');assert.deepEqual(rec.photo,{name:'pane.jpg',w:2160,h:1620});assert.ok(!JSON.stringify(rec).includes('base64'));
 assert.equal(S.modelOf(S.inputOf(rec),PROFILE).direction,'pieno');assert.equal(S.modelOf(S.inputOf(rec),PROFILE).texts.offerta.title,TEXTS.offerta.title);
 let doc={schemaVersion:1,conversations:{a:[]},firme:{items:[1]}};const ws={bind:()=>({load:async()=>doc,save:async d=>{doc=d}})};
 await S.saveToProject(ws,'p1',rec);assert.equal(doc.socialKit.items.length,1);assert.deepEqual(doc.firme,{items:[1]},'other keys kept');
 const ap=read('agents-page.js');assert.match(ap,/data\.socialKit=fresh\.socialKit/);assert.match(ap,/if\(d\.socialKit\)out\.socialKit=d\.socialKit/);
});

test('the card in «Cosa vuoi fare», the page scripts, and no AI or image generation call',()=>{
 const c=crea.card('socialgrafica');assert.equal(c.inline,'socialkit');assert.equal(c.group,'Social e contenuti');assert.match(c.cost,/^Nessuna chiamata AI/);assert.equal(crea.costBadge(c).tone,'free');
 assert.equal(crea.best('copertine in evidenza instagram'),'socialgrafica');assert.ok(look.CARDS.socialgrafica);
 const html=read('agency/crea.html'),i=s=>html.indexOf('<script src="/lib/'+s+'"></script>');
 assert.ok(i('print-studio.js')>=0&&i('identity-studio.js')>=0&&i('coordinato-studio.js')>=0);assert.ok(i('brand-package.js')>i('print-studio.js')&&i('brand-package.js')>i('identity-studio.js')&&i('social-studio.js')>i('brand-package.js'));
 assert.match(read('agency/crea.js'),/c\.inline==='socialkit'\s*\?S\.socialStudio\(/);
 const src=read('lib/social-studio.js');for(const w of ['RadixAgents','fetch(','higgsfield','openai','/api/'])assert.ok(!src.toLowerCase().includes(w.toLowerCase()),w);
 assert.match(read('shell/crea.css'),/\.cr-panel \.social-studio \.sc-sample/);
});
