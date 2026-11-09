'use strict';
// Studio «Menu e listino», the table formats (P7): DL long, A3 folded into four A4 faces (imposed on two A3 sheets),
// the A3 placemat on one face, the table tent with the upper face upside down; coperto and servizio; the refinement
// after the choice of a style (density, dotted leaders, descriptions); the catalogue's sheet reader; the menu page
// published with the site as menu.html. No AI anywhere in these paths; prices and allergens are never invented.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const M=require('../lib/menu-studio.js'),PS=require('../lib/print-studio.js'),Q=require('../lib/qr-lite.js'),CAT=require('../lib/catalog-studio.js');
const pub=require('../api/_site_publish.js'),seo=require('../lib/site-seo.js');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

const LOGO='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 96"><circle cx="48" cy="48" r="32" fill="#7A2E2E"/><rect x="94" y="30" width="220" height="36" fill="#2B2B2B"/></svg>';
const KIT={brand:'Trattoria Aurora',palette:[{role:'primary',hex:'#7A2E2E'},{role:'secondary',hex:'#5C4A3A'},{role:'accent',hex:'#C9A227'},{role:'dark',hex:'#2B2B2B'},{role:'light',hex:'#FBF7F0'}],logo:LOGO};
const PROFILE={identityKit:KIT};
const TEXT=['ANTIPASTI','Bruschetta - pane casereccio, pomodoro e basilico (1) [vegano] 6,00','Fritto di calamari* (1, 14) 14','Tagliere di salumi (nessuno) 12',
 'PRIMI','Carbonara - guanciale, uova, pecorino (1, 3, 7) 12','Risotto ai funghi (7, 9) 13','SECONDI','Tagliata di manzo (nessuno) 18','Branzino al forno (4) 19',
 'DOLCI','Tiramisù (1, 3, 7) 6,50','Panna cotta (7) 5'].join('\n');
const DATE=new Date('2026-10-23T10:00:00Z');
const URL_='https://www.trattoria-aurora.it/menu.html';
const model=(o={})=>M.modelOf({type:'ristorante',direction:'moderno',items:M.fromText(TEXT).items,url:URL_,cover:2.5,service:'10%',contacts:{address:'Via Roma 1, Torino',phone:'011 555 1234'},...o},PROFILE,{projectName:'Trattoria Aurora'});
const texts=p=>p.items.filter(i=>i.t==='text');
const latin=b=>Buffer.from(b).toString('latin1');
const boxes=bytes=>[...latin(bytes).matchAll(/\/MediaBox \[([^\]]+)\] \/BleedBox \[([^\]]+)\] \/TrimBox \[([^\]]+)\]/g)].map(m=>m.slice(1).map(x=>x.split(' ').map(Number)));
const near=(a,b,msg)=>{assert.equal(a.length,b.length,msg);a.forEach((x,i)=>assert.ok(Math.abs(x-b[i])<.01,msg+': '+a.join(' ')+' ≠ '+b.join(' ')))};
const many=n=>Array.from({length:n},(_,i)=>({section:'Sezione '+(1+i%6),name:'Piatto numero '+(i+1),description:'descrizione del piatto con ingredienti scelti e cotti con cura',price:8+i%5,declared:true}));

test('the formats: A4, A3, A5 as before by default, plus DL, folded A3, placemat and table tent on request',()=>{
 assert.deepEqual(M.FORMATS.map(f=>f.id),['a4','a3','a5','dl','a3-piegato','tovaglietta','segnatavolo']);
 assert.deepEqual([...M.DEFAULT_FORMATS],['a4','a3','a5']);
 assert.deepEqual(M.modelOf({items:[{name:'A',price:1}]},{},{}).formats,['a4','a3','a5'],'the default is unchanged');
 assert.deepEqual(M.modelOf({items:[{name:'A',price:1}],formats:['segnatavolo','dl','boh']},{},{}).formats,['dl','segnatavolo'],'known ids only, in order');
 const dl=M.FORMATS.find(f=>f.id==='dl');assert.deepEqual([dl.w,dl.h],[99,210]);
 assert.ok(M.FORMATS.filter(f=>f.qr).map(f=>f.id).join()==='a5,dl,a3-piegato,tovaglietta,segnatavolo','every table format carries the QR');
});

test('coperto and servizio: read from what is typed, written in every file, asked for a restaurant, never guessed',()=>{
 assert.deepEqual(['2,50','€ 3','Coperto 2','nessuno','no','0','0,00','','due euro','2/kg'].map(M.parseCover),
  [{cover:2.5,noCover:false},{cover:3,noCover:false},{cover:2,noCover:false},{cover:null,noCover:true},{cover:null,noCover:true},{cover:null,noCover:true},{cover:null,noCover:true},{cover:null,noCover:false},null,null]);
 assert.equal(M.coverLine(model()),'Coperto 2,50 € · Servizio 10%');
 assert.equal(M.coverLine(model({cover:null,noCover:true,service:'servizio incluso'})),'Nessun coperto · Servizio incluso');
 assert.equal(M.coverLine(model({cover:0,service:''})),'Nessun coperto','0 means no coperto');
 assert.equal(M.coverLine(model({cover:null,service:''})),'');
 const m=model({formats:['a4','dl','a3-piegato','tovaglietta']}),b=M.build(m),c=M.checksOf(m,b),by=id=>c.find(x=>x.id===id);
 for(const d of b.docs)assert.ok(d.doc.pages.some(p=>texts(p).some(i=>i.label==='Coperto e servizio'&&i.s==='Coperto 2,50 € · Servizio 10%')),d.id+': the coperto line');
 assert.ok(b.html.includes('<p class="cv">Coperto 2,50 € · Servizio 10%</p>'),'and on the phone page');
 assert.equal(by('coperto').state,'ok');
 // a restaurant menu without coperto: a warning, nothing written for it
 const none=model({cover:null,service:''}),nc=M.checksOf(none);assert.equal(nc.find(x=>x.id==='coperto').state,'warn');assert.match(nc.find(x=>x.id==='coperto').detail,/RADIX non lo inventa/);
 assert.ok(!M.build(none).docs.some(d=>d.doc.pages.some(p=>texts(p).some(i=>/Coperto/.test(i.s)))),'no coperto text when none is given');
 // a price list for a shop: no question about coperto
 assert.equal(M.checksOf(model({type:'prodotti',cover:null,service:''})).find(x=>x.id==='coperto'),undefined);
 // saved and reopened with the menu
 const rec=M.savedRecord(m,{at:'2026-10-23T10:00:00.000Z'}),back=M.fromRecord(rec,PROFILE,{projectName:'Trattoria Aurora'});
 assert.equal(M.coverLine(back),M.coverLine(m));assert.deepEqual(back.refine,m.refine);assert.deepEqual(back.contacts,{address:'Via Roma 1, Torino',phone:'011 555 1234'});
});

test('A3 folded into A4: cover, two inside faces, back with the QR; imposed 4|1 outside and 2|3 inside, fold at 210 mm',async()=>{
 const m=model({formats:['a3-piegato']}),d=M.build(m).docs[0].doc,r=d.reading;
 assert.equal(r.pages.length,4);assert.equal(d.pages.length,2);assert.equal(d.faceCount,4);
 assert.ok(r.pages[0].cover,'face 1 is the cover');assert.ok(texts(r.pages[0]).some(i=>i.label==='Titolo'));assert.ok(r.pages[0].items.some(i=>i.t==='logo'),'the logo on the cover');
 assert.ok(!texts(r.pages[0]).some(i=>i.label==='Piè di pagina'),'no page number on the cover');
 assert.ok(texts(r.pages[1]).some(i=>i.label==='Nome')&&texts(r.pages[2]).some(i=>i.label==='Nome'),'a short menu is spread over both inside faces');
 assert.ok(r.pages[3].items.some(i=>i.qr),'the QR on the back');assert.ok(texts(r.pages[3]).some(i=>i.s==='Via Roma 1, Torino'),'and the contacts');
 assert.deepEqual(M.SHEETS.map(s=>s.faces),[[3,0],[1,2]]);
 const [outside,inside]=d.pages;for(const s of d.pages){assert.equal(s.w,420);assert.equal(s.h,297);assert.deepEqual(s.folds,[210])}
 const side=(p,i)=>p.items.filter(x=>x.t==='text'&&x.label==='Piè di pagina'&&/\d \/ 4/.test(x.s)).map(x=>[x.s,x.x<210?'L':'R']);
 assert.deepEqual(side(outside),[['4 / 4','L']],'outside: face 4 on the left (face 1 has no number)');
 assert.ok(texts(outside).some(i=>i.label==='Titolo'&&i.x>210),'outside: the cover on the right');
 assert.deepEqual(side(inside).sort(),[['2 / 4','L'],['3 / 4','R']],'inside: faces 2 and 3');
 assert.equal(outside.items.filter(i=>i.t==='rect'&&i.bg===true).length,1,'one background over the whole sheet');
 assert.deepEqual(M.fitProblems(d),[],'checked on the A4 faces');
 const c=M.checksOf(m);assert.equal(c.find(x=>x.id==='formati').state,'ok');assert.deepEqual(M.blocking(c),[]);
 // the print PDF: two A3 sheets, bleed, crop and dashed fold marks
 const files=await M.menuFiles(m,{date:DATE}),pdf=files.find(f=>f.name==='menu/stampa/menu-a3-piegato-tipografia.pdf').data,bx=boxes(pdf),want=M.pdfBoxes(420,297);
 assert.equal(bx.length,2);for(const [media,bleed,trim] of bx){near(media,want.media,'MediaBox');near(bleed,want.bleed,'BleedBox');near(trim,want.trim,'TrimBox')}
 assert.deepEqual(PS.checkPdf(pdf),[]);assert.ok((latin(pdf).match(/\[2 1\] 0 d/g)||[]).length>=4,'fold marks, dashed, top and bottom of each sheet');
 assert.match(files.find(f=>f.name==='menu/LEGGIMI.txt').data,/esterno: facciate 4 e 1[^\n]*interno: facciate 2 e 3/);
 // too many voices: said, blocking, and no file
 const big=model({items:many(90),formats:['a3-piegato']}),bd=M.build(big).docs[0].doc,bc=M.checksOf(big),f=bc.find(x=>x.id==='formati');
 assert.equal(bd.tooMany,true);assert.ok(bd.faceCount>4);assert.equal(f.state,'fail');assert.match(f.issues[0],/il pieghevole ne ha 4/);
 await assert.rejects(M.menuFiles(big,{date:DATE}),/non sta nelle 4 facciate/);
});

test('the A3 placemat: one landscape face on three balanced columns with the QR; more than one face blocks',()=>{
 const m=model({formats:['tovaglietta']}),d=M.build(m).docs[0].doc;
 assert.equal(d.cols,3);assert.equal(d.pages.length,1);assert.deepEqual([d.pages[0].w,d.pages[0].h],[420,297]);assert.ok(d.pages[0].items.some(i=>i.qr),'the QR');
 assert.deepEqual(M.fitProblems(d),[]);assert.equal(M.checksOf(m).find(x=>x.id==='formati').state,'ok');
 const xs=[...new Set(texts(d.pages[0]).filter(i=>i.label==='Nome').map(i=>Math.round(i.x/140)))];assert.ok(xs.length>=2,'voices in more than one column');
 const big=model({items:many(80),formats:['tovaglietta']}),f=M.checksOf(big).find(x=>x.id==='formati');assert.equal(f.state,'fail');assert.match(f.issues.join(),/la tovaglietta ne ha 1/);
});

test('DL long: 99 × 210 mm, one column, the QR at the end, pages front and back',async()=>{
 const m=model({formats:['dl']}),d=M.build(m).docs[0].doc;assert.equal(d.cols,1);assert.ok(d.pages.length<=2);assert.ok(d.pages.some(p=>p.items.some(i=>i.qr)));
 assert.deepEqual(M.fitProblems(d),[]);for(const p of d.pages)for(const t of texts(p))assert.ok(t.size>=M.MIN_PT,t.s+' '+t.size);
 const files=await M.menuFiles(m,{date:DATE}),pdf=files.find(f=>f.name==='menu/stampa/menu-dl-tipografia.pdf').data;
 for(const [media,,trim] of boxes(pdf)){near(media,M.pdfBoxes(99,210).media,'DL MediaBox');near(trim,M.pdfBoxes(99,210).trim,'DL TrimBox')}
 const long=M.checksOf(model({items:many(60),formats:['dl']})).find(x=>x.id==='formati');assert.equal(long.state,'warn');assert.match(long.issues[0],/di solito è fronte e retro/);
});

test('the table tent: an A5 folded in half, the QR on both faces, the upper face turned by 180°, nothing across the fold',async()=>{
 const m=model({formats:['segnatavolo']}),b=M.build(m),d=b.docs[0].doc,p=d.pages[0];
 assert.equal(d.tent,true);assert.deepEqual([p.w,p.h],[148,210]);assert.deepEqual(p.foldsY,[105]);assert.deepEqual(p.folds,[]);
 const up=texts(p).filter(i=>i.rot===180),down=texts(p).filter(i=>!i.rot);assert.ok(down.length>3);assert.equal(up.length,down.length,'the same texts on both faces');
 for(const t of down){const twin=up.find(u=>u.s===t.s&&Math.abs(u.x-(148-t.x))<1e-6&&Math.abs(u.y-(105-(t.y-105)))<1e-6);assert.ok(twin,'turned: '+t.s)}
 assert.ok(down.some(i=>i.s==='Il menu sul telefono'));assert.ok(down.some(i=>i.s==='Coperto 2,50 € · Servizio 10%'));assert.ok(down.some(i=>i.s==='www.trattoria-aurora.it/menu.html'));
 const qr=p.items.filter(i=>i.qr);assert.equal(qr.length,2*Q.rects(b.qr.qr).length,'one QR per face');
 assert.ok(qr.every(r=>r.y+r.h<=105-M.FORMATS.find(f=>f.id==='segnatavolo').margin+1e-6||r.y>=105+M.FORMATS.find(f=>f.id==='segnatavolo').margin-1e-6),'the QR stays off the fold');
 assert.ok(p.items.filter(i=>i.t==='logo').some(i=>i.rot===180),'the logo turned too');
 assert.deepEqual(M.fitProblems(d),[]);assert.deepEqual(d.warnings.filter(w=>w.kind==='safe'),[]);
 const c=M.checksOf(m);for(const id of ['legenda','surgelati','pagine','contrast','formati'])assert.equal(c.find(x=>x.id===id).state,'ok',id+': '+c.find(x=>x.id===id).detail);
 // print PDF: upside-down text (the cm matrix), horizontal fold marks in the slug
 const files=await M.menuFiles(m,{date:DATE}),pdf=latin(files.find(f=>f.name==='menu/stampa/segnatavolo-tipografia.pdf').data);
 assert.match(pdf,/ -1 0 0 -1 [\d.]+ [\d.]+ cm /);assert.ok((pdf.match(/\[2 1\] 0 d/g)||[]).length>=2);
 const svg=PS.previewSvg(d,0);assert.match(svg,/transform="rotate\(180 /);assert.match(svg,/<line x1="-3" y1="105" x2="151" y2="105"[^>]*stroke-dasharray/);
 // without the QR address: blocking, said
 const noUrl=M.checksOf(model({url:'',formats:['segnatavolo']})).find(x=>x.id==='formati');assert.equal(noUrl.state,'fail');assert.match(noUrl.issues[0],/serve l’indirizzo/);
});

test('print-studio: upside-down text box, horizontal fold marks, the screen PDF text matrix',()=>{
 const t={t:'text',x:100,y:50,s:'Menu',size:10,bold:false,fill:'#000000'},w=PS.ptToMm(PS.textWidth('Menu',10,false));
 assert.deepEqual(PS.safeArea({pages:[{label:'p',w:148,h:210,items:[{...t,rot:180,x:2+w,y:20}],folds:[]}]}).map(x=>x.kind),['safe'],'the turned text measured to the left of x');
 assert.deepEqual(PS.safeArea({pages:[{label:'p',w:148,h:210,items:[{...t,rot:180,x:20+w,y:20}],folds:[]}]}),[]);
 const mk=PS.marks({w:148,h:210,folds:[],foldsY:[105]}).filter(x=>x.kind==='fold');assert.equal(mk.length,2);assert.ok(mk.every(x=>x.y1===x.y2&&Math.abs(x.y1-(PS.BLEED+PS.SLUG+105))<1e-9));
 const web=latin(PS.pdf({title:'x',pages:[{label:'p',w:100,h:100,items:[{...t,rot:180}],folds:[]}],brand:{palette:{}}},{mode:'web'}));assert.match(web,/-1 0 0 -1 [\d.]+ [\d.]+ Tm /);
});

test('the refinement: density, dotted leaders up to the price, descriptions hidden; the checks still pass',()=>{
 assert.deepEqual(M.refineOf(),{density:'normale',leaders:false,descriptions:true});assert.deepEqual(M.refineOf({density:'boh',leaders:1,descriptions:false}),{density:'normale',leaders:true,descriptions:false});
 const size=(o)=>{const d=M.layoutMenu(model({refine:o}),'a4');return Math.max(...d.pages.flatMap(p=>texts(p).filter(i=>i.label==='Nome').map(i=>i.size)))};
 assert.ok(size({density:'compatta'})<size({})&&size({})<size({density:'ariosa'}),'compatta < normale < ariosa');
 const dots=M.layoutMenu(model({refine:{leaders:true}}),'a4'),lines=dots.pages.flatMap(p=>p.items.filter(i=>i.label==='Puntini'));
 assert.ok(lines.length>=8,'one row of dots per voice with room');assert.ok(lines.every(l=>Array.isArray(l.dash)&&l.y1===l.y2&&l.x2>l.x1));
 const prices=dots.pages.flatMap(p=>texts(p).filter(i=>i.label==='Prezzo'));assert.ok(lines.every(l=>prices.some(pr=>pr.x>l.x2&&Math.abs(pr.y-.25-l.y1)<1e-6)),'the dots end before their price');
 assert.equal(M.layoutMenu(model({direction:'classico',refine:{leaders:true}}),'a4').pages.flatMap(p=>p.items.filter(i=>i.label==='Puntini')).length,0,'centred style: no dots');
 const bare=M.layoutMenu(model({refine:{descriptions:false}}),'a4');assert.equal(bare.pages.flatMap(p=>texts(p).filter(i=>i.label==='Descrizione')).length,0);
 for(const refine of [{density:'compatta'},{density:'ariosa',leaders:true},{descriptions:false}])for(const direction of ['classico','moderno','lavagna']){
  const c=M.checksOf(model({direction,refine,formats:['a4','a5','dl','tovaglietta','a3-piegato','segnatavolo']}));assert.deepEqual(M.blocking(c).map(x=>x.id+': '+x.issues.slice(0,2).join(' | ')),[],direction+' '+JSON.stringify(refine))}
});

test('never invented: a voice without price prints no price, one without allergens says to ask, in every table format',()=>{
 const items=[M.item({section:'Primi',name:'Pasta del giorno',description:'chiedi al cameriere'}),M.item({section:'Primi',name:'Gnocchi',price:11,allergens:[1,7]})];
 const m=model({items,formats:['dl','tovaglietta','a3-piegato']}),b=M.build(m),c=M.checksOf(m,b);
 assert.equal(c.find(x=>x.id==='prezzi').state,'warn');assert.equal(c.find(x=>x.id==='allergeni').state,'warn');
 for(const d of b.docs){const all=(d.doc.reading||d.doc).pages.flatMap(texts);assert.equal(all.filter(i=>i.label==='Prezzo').length,1,d.id+': only the price that exists');
  assert.ok(all.some(i=>i.s==='Allergeni: chiedi al personale'),d.id)}
});

test('the sheet through the catalogue readers: a catalogue price list (Famiglia, Denominazione, Prezzo listino) is read as it is',()=>{
 const headers=['Codice','Denominazione','Famiglia','Prezzo listino','Allergeni','Note'];
 const cols=M.detectColumns(headers);assert.deepEqual(cols,{name:'Denominazione',price:'Prezzo listino',allergens:'Allergeni',notes:'Note',section:'Famiglia'});
 assert.equal(CAT.detectMapping(headers).category,'Famiglia','the catalogue mapping supplies the section');
 const r=M.fromSheet({headers,rows:[{Codice:'P1',Denominazione:'Pagnotta',Famiglia:'Pane','Prezzo listino':'4,80/kg',Allergeni:'1',Note:''},{Codice:'P2',Denominazione:'Cornetto',Famiglia:'Dolci','Prezzo listino':'1,30',Allergeni:'1, 3, 7',Note:'surgelato'}]});
 assert.deepEqual(r.items.map(x=>[x.section,x.name,x.price,x.unit,x.allergens.join(','),x.frozen]),[['Pane','Pagnotta',4.8,'kg','1',false],['Dolci','Cornetto',1.3,'','1,3,7',true]]);
 const src=read('lib/menu-studio.js');assert.match(src,/async function readSheetFile\(file\)\{const C=CAT\(\);if\(C&&typeof C\.readSheet==='function'&&root\.RadixCrmCsv\)return C\.readSheet\(file\);/);
 const html=read('agency/crea.html');assert.ok(html.indexOf('/lib/catalog-studio.js')<html.indexOf('/lib/menu-studio.js'),'the catalogue loads first');
});

test('the menu page with the site: menu.html from the last saved menu, accepted by the publisher, in the sitemap',()=>{
 const m=model(),rec=M.savedRecord(m,{at:'2026-10-23T10:00:00.000Z'}),pg=M.sitePage({menu:{schemaVersion:1,items:[{id:'old',items:[]},rec]}},PROFILE,{projectName:'Trattoria Aurora',date:DATE});
 assert.equal(pg.html,M.htmlPage(M.fromRecord(rec,PROFILE,{projectName:'Trattoria Aurora'}),{date:DATE}));assert.equal(pg.items,m.items.length);assert.deepEqual(M.externalRefs(pg.html),[]);
 assert.equal(M.sitePage({},PROFILE),null);assert.equal(M.sitePage({menu:{items:[{id:'x',items:[]}]}},PROFILE),null);
 const page='<!doctype html><html lang="it"><body>ok</body></html>',pages={'privacy.html':page,'cookie.html':page,'menu.html':pg.html};
 assert.ok(pub.PAGE_NAMES.includes('menu.html'));assert.equal(pub.checkSite(page,pages).pages['menu.html'],pg.html);
 assert.throws(()=>pub.checkSite(page,{...pages,'menu.html':pg.html.replace('</head>','<link rel="stylesheet" href="https://x.it/a.css"></head>')}),/carica file esterni/);
 assert.ok(pub.deploymentPayload('p',page,pages).files.some(f=>f.file==='menu.html'));
 const bundle=seo.siteBundle(page,pages,{base:'https://www.trattoria-aurora.it',date:'2026-10-23'});assert.match(bundle.pages['sitemap.xml'],/https:\/\/www\.trattoria-aurora\.it\/menu\.html/);assert.match(bundle.pages['llms.txt'],/\[Menu\]\(https:\/\/www\.trattoria-aurora\.it\/menu\.html\)/);
 const site=read('lib/site-studio.js');assert.match(site,/MS\.sitePage\(d,ctx\.profile/);assert.match(site,/pages=\{\.\.\.pages,'menu\.html':pg\.html\}/);assert.match(site,/\['menu\.html','Menu'\]/);
});

test('no AI in the table formats: the only model call stays the optional, confirmed one for the descriptions',()=>{
 const src=read('lib/menu-studio.js');assert.equal((src.match(/\.reply\(/g)||[]).length,1);assert.ok(!/\bfetch\(\s*['"`]|new XMLHttpRequest/.test(src));
 for(const fn of ['layoutFolded','layoutTent','impose','coverLine','parseCover','sitePage']){const body=new RegExp('function '+fn+'\\([^]*?\\n(?=function |const |//)').exec(src);assert.ok(body,fn);assert.ok(!/reply|askConfirm|\/api\//.test(body[0]),fn+' calls nothing')}
 const css=read('shell/crea.css');assert.match(css,/\.cr-panel \.menu-studio \.mn-refine\{/);assert.match(css,/\.cr-panel \.site-studio \.st-menu\{/);
});
