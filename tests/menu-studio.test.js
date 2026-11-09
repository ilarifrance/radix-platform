'use strict';
// Studio «Menu e listino» (lib/menu-studio.js): reading the voices (pasted text, sheets), the 14 allergens of
// Reg. UE 1169/2011 and their numbered legend, the frozen note, the automatic pagination (sections continued, columns,
// QR), the print PDFs (sizes in points, bleed boxes), the phone page with no external request, the checks that stop
// an export, the clean CSV, the zip, the optional AI call (one confirmation, grounded), the saved key menu that
// agents-page.js keeps, and the card in «Cosa vuoi fare».
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const M=require('../lib/menu-studio.js'),PS=require('../lib/print-studio.js'),ZIP=require('../lib/zip-lite.js'),Q=require('../lib/qr-lite.js');
const crea=require('../agency/crea-core.js'),look=require('../agency/marketing-look.js');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');

const LOGO='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 96"><circle cx="48" cy="48" r="32" fill="#2F5D50"/><circle cx="48" cy="34" r="7" fill="#E3B448"/><text x="94" y="58" font-family="Fraunces, serif" font-size="34" font-weight="700" fill="#1C1C1E">Forno Aurora</text></svg>';
const KIT={brand:'Forno Aurora',direction:'Bottega di quartiere',palette:[{role:'primary',hex:'#2F5D50'},{role:'secondary',hex:'#A0522D'},{role:'accent',hex:'#E3B448'},{role:'dark',hex:'#1C1C1E'},{role:'light',hex:'#FAF6EE'}],fonts:[{heading:'Fraunces',body:'Inter'}],logo:LOGO};
const PROFILE={identityKit:KIT};
const TEXT=['PANE',
 'Pagnotta di grano antico - lievito madre, farina di grano tenero tipo 1 (1) [vegano] 4,80/kg',
 'Pane di segale e noci - segale, noci, lievito madre (1, 8) 7,90/kg',
 'Grissini al sesamo (1, 11) [vegano] 2,50',
 'Pane senza glutine* - mix di farine di riso e grano saraceno (3) [senza glutine] 3,90',
 '','FOCACCE:',
 'Focaccia farcita con mortadella e stracchino (1, 7) 4,50',
 'Burrata pugliese (con burrata) (7) 9,00',
 '# Dolci',
 'Bignè alla crema - farcito da noi (1, 3, 7) [surgelato] 1,80',
 'Torta della domenica - su ordinazione',
 'chiedi in negozio (1, 3, 7)',
 'Pesce del giorno - secondo il mercato (4) s.q.',
 'Biscotti al cacao 16,00/kg',
 'BEVANDE',
 'Caffè espresso (nessuno) € 1,20',
 'Cappuccino (allergeni: 7) 1.600,00',
 'Acqua del rubinetto (nessuno) 0,00'].join('\n');
const DATE=new Date('2026-10-22T10:00:00Z');
const voices=()=>M.fromText(TEXT).items;
const model=(o={})=>M.modelOf({type:'prodotti',direction:'classico',items:voices(),url:'https://www.fornoaurora.it/menu',subtitle:'Pane a lievito madre dal 1987',...o},PROFILE,{projectName:'Forno Aurora'});
const latin=b=>Buffer.from(b).toString('latin1');
const boxes=(bytes)=>[...latin(bytes).matchAll(/\/MediaBox \[([^\]]+)\] \/BleedBox \[([^\]]+)\] \/TrimBox \[([^\]]+)\]/g)].map(m=>m.slice(1).map(x=>x.split(' ').map(Number)));
const near=(a,b,msg)=>{assert.equal(a.length,b.length,msg);a.forEach((x,i)=>assert.ok(Math.abs(x-b[i])<.01,msg+': '+a.join(' ')+' ≠ '+b.join(' ')))};
const many=(n,o={})=>Array.from({length:n},(_,i)=>({section:'Sezione '+(1+Math.floor(i/12)),name:'Piatto numero '+(i+1),description:'Descrizione del piatto con ingredienti scelti e cotti con cura, servito caldo',price:8+i%7,allergens:[1+i%14],declared:true,...o}));

test('pasted text: sections, prices in euro, units, allergens by number or name, tags, the frozen asterisk, continuation lines',()=>{
 const r=M.fromText(TEXT),by=n=>r.items.find(x=>x.name===n);
 assert.equal(r.sheet,false);
 assert.deepEqual(M.sections(r.items).map(s=>s.title),['Pane','Focacce','Dolci','Bevande']);
 const p=by('Pagnotta di grano antico');assert.equal(p.description,'lievito madre, farina di grano tenero tipo 1');assert.equal(p.price,4.8);assert.equal(p.unit,'kg');assert.deepEqual(p.allergens,[1]);assert.deepEqual(p.tags,['vegano']);
 assert.deepEqual(by('Pane di segale e noci').allergens,[1,8]);assert.deepEqual(by('Grissini al sesamo').allergens,[1,11]);
 const sg=by('Pane senza glutine');assert.equal(sg.frozen,true,'the asterisk marks it frozen');assert.deepEqual(sg.tags,['senza-glutine']);
 assert.equal(by('Burrata pugliese (con burrata)').price,9,'words in brackets that are not allergens stay in the name');assert.deepEqual(by('Burrata pugliese (con burrata)').allergens,[7]);
 assert.equal(by('Bignè alla crema').frozen,true);assert.deepEqual(by('Bignè alla crema').allergens,[1,3,7]);
 const t=by('Torta della domenica');assert.equal(t.price,null,'no price invented');assert.equal(t.description,'su ordinazione chiedi in negozio');assert.deepEqual(t.allergens,[1,3,7]);
 const f=by('Pesce del giorno');assert.equal(f.price,null);assert.equal(f.priceNote,'s.q.');assert.equal(M.priceLabel(f),'s.q.');
 const b=by('Biscotti al cacao');assert.equal(b.declared,false,'allergens not written: not declared, never guessed');assert.deepEqual(b.allergens,[]);
 const c=by('Caffè espresso');assert.equal(c.price,1.2);assert.equal(c.declared,true);assert.deepEqual(c.allergens,[]);
 assert.equal(by('Cappuccino').name,'Cappuccino','the allergen group leaves nothing behind');assert.equal(by('Cappuccino').price,1600);assert.deepEqual(by('Cappuccino').allergens,[7]);assert.equal(by('Acqua del rubinetto').price,0);
});

test('prices and allergen words: Italian formats, € it-IT, every one of the 14 allergens by its name',()=>{
 assert.deepEqual(['12','12,5','12.50','€ 1.250,00','1,250.00','3,90 €','4,80/kg','2 euro al pezzo','s.q.','boh',''].map(x=>{const p=M.parsePrice(x);return [p.price,p.unit,p.note]}),
  [[12,'',''],[12.5,'',''],[12.5,'',''],[1250,'',''],[1250,'',''],[3.9,'',''],[4.8,'kg',''],[2,'pz',''],[null,'','s.q.'],[null,'',''],[null,'','']]);
 assert.deepEqual([0,1.2,12.5,1250,1234567.891].map(M.formatEuro),['0,00 €','1,20 €','12,50 €','1.250,00 €','1.234.567,89 €']);
 assert.equal(M.ALLERGENS.length,14);assert.deepEqual(M.ALLERGENS.map(a=>a.n),[1,2,3,4,5,6,7,8,9,10,11,12,13,14]);
 for(const a of M.ALLERGENS){assert.deepEqual(M.parseAllergens(a.label).list,[a.n],a.label);assert.deepEqual(M.parseAllergens(a.short.toLowerCase()).list,[a.n],a.short)}
 assert.deepEqual(M.parseAllergens('1, 3 e 7').list,[1,3,7]);assert.deepEqual(M.parseAllergens('glutine; latte / uova').list,[1,3,7]);
 const none=M.parseAllergens('nessuno');assert.deepEqual([none.list,none.declared],[[],true]);
 const empty=M.parseAllergens('');assert.equal(empty.declared,false);
 assert.deepEqual(M.parseAllergens('15, pepe').unknown,['15','pepe'],'unknown allergens are reported, not dropped silently');
 assert.deepEqual(M.parseTags('Vegano, piccante').list,['vegano','piccante']);assert.deepEqual(M.parseTags('gluten free').list,['senza-glutine']);
});

test('sheets: columns found by Italian or English headers, frozen in the notes, issues per row, the 300 limit',()=>{
 const sheet={headers:['Categoria','Piatto','Ingredienti','Prezzo €','Allergeni','Dieta','Note'],rows:[
  {'Categoria':'Primi','Piatto':'Carbonara','Ingredienti':'guanciale, uova, pecorino','Prezzo €':'12,00','Allergeni':'1, 3, 7','Dieta':'','Note':''},
  {'Categoria':'Primi','Piatto':'Gnocchi al pomodoro','Ingredienti':'','Prezzo €':'','Allergeni':'glutine','Dieta':'vegetariano','Note':'surgelato'},
  {'Categoria':'Dolci','Piatto':'','Ingredienti':'','Prezzo €':'5','Allergeni':'','Dieta':'','Note':''},
  {'Categoria':'Dolci','Piatto':'Tiramisù','Ingredienti':'','Prezzo €':'sei euro','Allergeni':'1,3,7,pepe','Dieta':'boh','Note':''}]};
 const cols=M.detectColumns(sheet.headers);assert.deepEqual(cols,{section:'Categoria',name:'Piatto',description:'Ingredienti',price:'Prezzo €',allergens:'Allergeni',tags:'Dieta',notes:'Note'});
 const r=M.fromSheet(sheet);assert.equal(r.items.length,3);assert.equal(r.skipped,1,'a row without name is skipped');
 assert.equal(r.items[0].price,12);assert.deepEqual(r.items[0].allergens,[1,3,7]);assert.equal(r.items[1].frozen,true);assert.equal(r.items[1].notes,'');assert.equal(r.items[1].price,null);
 assert.deepEqual(r.issues,['riga 5: prezzo «sei euro» non letto','riga 5: allergene «pepe» non riconosciuto','riga 5: tag «boh» non riconosciuto']);
 assert.match(M.fromSheet({headers:['Prezzo'],rows:[{Prezzo:'1'}]}).issues[0],/Manca la colonna del nome/);
 const big=M.fromSheet({headers:['Nome','Prezzo'],rows:Array.from({length:305},(_,i)=>({Nome:'V'+i,Prezzo:'1'}))});assert.equal(big.items.length,M.MAX_ITEMS);assert.match(big.issues[0],/5 voci oltre il limite di 300/);
 // a pasted sheet (tabs) is read as a sheet
 const pasted=M.fromText('Nome\tPrezzo\tAllergeni\nCarbonara\t12\t1,3,7\nAcqua\t2\tnessuno');assert.equal(pasted.sheet,true);assert.deepEqual(pasted.items.map(x=>[x.name,x.price,x.allergens,x.declared]),[['Carbonara',12,[1,3,7],true],['Acqua',2,[],true]]);
 // item() keeps only what is valid
 const it=M.item({name:'  X  ',price:-3,allergens:[7,7,99,'3'],tags:['vegano','boh']});assert.deepEqual([it.name,it.price,it.allergens,it.tags,it.declared],['X',null,[3,7],['vegano'],true]);
});

test('the allergen legend: numbered 1-14 with the regulation in every PDF and in the web page, only when used; markers on each voice',()=>{
 const m=model(),b=M.build(m);
 for(const d of b.docs){const texts=d.doc.pages.flatMap(p=>p.items.filter(i=>i.t==='text').map(i=>i.s)).join('\n');
  assert.ok(texts.includes(M.LEGEND_TITLE),d.id);const lg=d.doc.pages.flatMap(p=>p.items.filter(i=>i.t==='text'&&i.label==='Legenda allergeni').map(i=>i.s));
  assert.deepEqual(lg.slice(1,29).filter((x,i)=>i%2===0),M.ALLERGENS.map(a=>String(a.n)),d.id+' the 14, numbered, in order');
  lg.slice(1,29).filter((x,i)=>i%2===1).forEach((x,i)=>{const a=M.ALLERGENS[i];assert.ok(x===a.label||x.startsWith(a.short),d.id+' '+x)});
  assert.ok(texts.includes(M.FROZEN_NOTE),d.id+' frozen note');assert.ok(texts.includes('Allergeni: chiedi al personale'),'a voice without allergens says so')}
 assert.ok(b.html.includes(M.LEGEND_TITLE));for(const a of M.ALLERGENS)assert.ok(b.html.includes('<li value="'+a.n+'">'+a.label.replace(/&/g,'&amp;')),a.label);
 assert.deepEqual(M.usedAllergens(m.items),[1,3,4,7,8,11]);
 assert.equal(M.markersOf(M.item({name:'x',allergens:[1,7],tags:['vegetariano','piccante'],notes:'Su richiesta senza glutine'})),'All. 1, 7  ·  V P  ·  Su richiesta senza glutine');
 // no allergen marked anywhere: no numbered legend, only the note to ask the staff
 const plain=model({items:[{name:'Acqua',price:2},{name:'Pane',price:1}]}),pb=M.build(plain),txt=pb.docs[0].doc.pages[0].items.filter(i=>i.t==='text').map(i=>i.s).join('\n');
 assert.ok(!txt.includes(M.LEGEND_TITLE));assert.ok(txt.includes(M.INFO_NOTE));assert.ok(!pb.html.includes(M.LEGEND_TITLE));
});

test('pagination: everything placed, nothing outside the text area, sections continued with «· segue», legend page in the footers',()=>{
 const m=model({type:'ristorante',items:many(70),formats:['a4','a3','a5']}),b=M.build(m);
 for(const d of b.docs){assert.equal(d.doc.placed.length,70,d.id);assert.deepEqual(M.fitProblems(d.doc),[],d.id);assert.ok(d.doc.pages.length>1,d.id);
  const n=d.doc.pages.length;d.doc.pages.forEach((p,i)=>{const t=p.items.filter(x=>x.t==='text').map(x=>x.s);assert.ok(t.includes((i+1)+' / '+n),d.id+' page number');
   if(i+1!==d.doc.legendPage)assert.ok(t.includes('Allergeni: legenda a pagina '+d.doc.legendPage),d.id+' legend pointer')});
  assert.equal(d.doc.legendPage,n,'the legend comes last');
  assert.ok(d.doc.pages.some(p=>p.items.some(x=>x.t==='text'&&/· segue$/.test(x.s))),d.id+' a section continued')}
 assert.equal(b.docs.find(d=>d.id==='a3').doc.cols,2);assert.equal(b.docs.find(d=>d.id==='a4').doc.cols,1);
 assert.ok(b.docs.find(d=>d.id==='a5').doc.pages.length>b.docs.find(d=>d.id==='a4').doc.pages.length,'A5 needs more pages than A4');
 // a bar list goes on two columns in A4; one page is balanced (the columns end close to each other)
 const bar=M.layoutMenu(model({type:'bar',items:many(24).map(x=>({...x,description:''}))}),'a4');assert.equal(bar.cols,2);assert.equal(bar.pages.length,1);
 const p=bar.pages[0],mid=210/2,flow=p.items.filter(i=>i.t==='text'&&i.flow),lowL=Math.max(...flow.filter(i=>i.x<mid).map(i=>i.y)),lowR=Math.max(...flow.filter(i=>i.x>=mid).map(i=>i.y));
 assert.ok(Math.abs(lowL-lowR)<40,'balanced columns: '+lowL.toFixed(1)+' / '+lowR.toFixed(1));
 // a voice with a very long description is shortened and said, never cut off silently
 const long=M.layoutMenu(model({items:[{name:'Lunga',price:5,declared:true,description:('parola lunga '.repeat(40)).trim()}],formats:['a5']}),'a5');assert.deepEqual(M.fitProblems(long),[]);
 // type sizes never below 6 pt, even in A5
 for(const d of b.docs)for(const pg of d.doc.pages)for(const it of pg.items)if(it.t==='text')assert.ok(it.size>=M.MIN_PT,d.id+' '+it.size);
});

test('the QR on the table version: a valid symbol to the given address, alone on a page only when nothing else fits',()=>{
 const m=model({formats:['a5']}),b=M.build(m);assert.equal(b.url,'https://www.fornoaurora.it/menu');assert.equal(b.qr.qr.version,Q.encode(b.url).version);
 const qrItems=b.docs[0].doc.pages.flatMap(p=>p.items.filter(i=>i.t==='rect'&&i.qr));assert.ok(qrItems.length>20,'the QR modules are drawn');
 assert.ok(b.docs[0].doc.pages.some(p=>p.items.some(i=>i.t==='text'&&i.s==='Il menu sul telefono')));
 assert.deepEqual(['', 'fornoaurora.it/menu','http://x.it','ftp://x.it','non è un indirizzo','https://'+'a'.repeat(300)+'.it'].map(M.qrUrl),['','https://fornoaurora.it/menu','http://x.it',null,null,null]);
 assert.equal(M.build(model({formats:['a4']})).docs[0].doc.pages.some(p=>p.items.some(i=>i.qr)),false,'the QR is only on the table version');
});

test('print PDFs: A4 and A3 with 3 mm bleed and crop marks, A5 table, sizes in points; the screen PDF without bleed',async()=>{
 const files=await M.menuFiles(model(),{date:DATE}),get=n=>files.find(f=>f.name===n).data;
 assert.deepEqual(files.map(f=>f.name),['menu/stampa/menu-a4-tipografia.pdf','menu/stampa/menu-a3-tipografia.pdf','menu/stampa/menu-a5-tavolo-tipografia.pdf','menu/digitale/menu-a4.pdf','menu/web/menu.html','menu/qr/menu-qr.svg','menu/qr/menu-qr.png','menu/menu-pulito.csv','menu/LEGGIMI.txt']);
 for(const [n,w,h] of [['a4',210,297],['a3',297,420],['a5-tavolo',148,210]]){const bytes=get('menu/stampa/menu-'+n+'-tipografia.pdf'),b=boxes(bytes),want=M.pdfBoxes(w,h);assert.ok(b.length>=1,n);
  for(const [media,bleed,trim] of b){near(media,want.media,n+' MediaBox');near(bleed,want.bleed,n+' BleedBox');near(trim,want.trim,n+' TrimBox')}
  assert.deepEqual(PS.checkPdf(bytes),[],n);assert.match(latin(bytes),/\/OutputIntent|\/GTS_PDFX/,n+' print intent')}
 near(M.pdfBoxes(210,297).media,[0,0,646.299,892.913],'A4 + 2×(3 mm bleed + 6 mm slug)');
 near(M.pdfBoxes(210,297).trim.slice(2).map((x,i)=>x-M.pdfBoxes(210,297).trim[i]),[595.276,841.89],'A4 trim');
 near(M.pdfBoxes(297,420).trim.slice(2).map((x,i)=>x-M.pdfBoxes(297,420).trim[i]),[841.89,1190.551],'A3 trim');
 near(M.pdfBoxes(148,210).trim.slice(2).map((x,i)=>x-M.pdfBoxes(148,210).trim[i]),[419.528,595.276],'A5 trim');
 near(M.pdfBoxes(210,297).bleed.slice(2).map((x,i)=>x-M.pdfBoxes(210,297).bleed[i]),[612.283,858.898],'A4 + 3 mm bleed');
 const web=latin(get('menu/digitale/menu-a4.pdf'));assert.match(web,/\/MediaBox \[0 0 595\.27\d* 841\.8\d*\]/,'screen A4 in points');assert.match(web,/\/BleedBox \[0 0 595\.276 841\.89\] \/TrimBox \[0 0 595\.276 841\.89\]/,'no bleed on screen');
 // the files are the same for the same input
 const again=await M.menuFiles(model(),{date:DATE});assert.deepEqual(again.map(f=>Buffer.from(f.data).length),files.map(f=>Buffer.from(f.data).length));
});

test('the phone page: one file, no external URL or request, light and dark, allergen and diet filters, escaped text',()=>{
 const m=model({items:voices().concat([M.item({name:'<script>alert(1)</script>',price:1,declared:true})]),contacts:{website:'https://www.fornoaurora.it',phone:'011 555 1234'}}),html=M.htmlPage(m,{date:DATE});
 assert.deepEqual(M.externalRefs(html),[],'no external reference at all');
 assert.ok(!/<link |<img [^>]*src="http|<iframe|@import|fonts\.googleapis/i.test(html));
 assert.match(html,/prefers-color-scheme:dark/);assert.match(html,/:root\[data-theme=dark\]/);assert.match(html,/id="theme"/);
 assert.match(html,/Nascondi i piatti con/);for(const n of M.usedAllergens(m.items))assert.ok(html.includes('name="no" value="'+n+'"'),'filter '+n);
 assert.match(html,/data-a="1 3 7"/);assert.ok(!html.includes('<script>alert(1)'));assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
 assert.ok(html.includes('fornoaurora.it'),'the contacts, as text');assert.match(html,/<html lang="it"/);assert.match(html,/name="viewport"/);
 assert.match(html,/src="data:image\/svg\+xml;base64,/,'the logo inline');
 // the detector itself
 assert.deepEqual(M.externalRefs('<img src="https://x.it/a.png"><a href="//cdn.x/y">'),['https://x.it/a.png','//cdn.x/y']);
 assert.deepEqual(M.externalRefs('<style>@import "x.css"</style>'),['@import']);assert.deepEqual(M.externalRefs('<script>fetch("/a")</script>'),['richiesta di rete nello script']);
 assert.deepEqual(M.externalRefs('<a href="#s1">x</a><a href="tel:0115551234">t</a>'),[]);
 // a logo that loads something from outside is left out
 const bad=M.modelOf({items:[{name:'X',price:1}]},{identityKit:{...KIT,logo:'<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.example/x.png"/></svg>'}},{projectName:'Forno Aurora'});
 assert.deepEqual(M.externalRefs(M.htmlPage(bad)).filter(u=>!/^http:\/\/www\.w3\.org/.test(u)),[]);
});

test('the checks: missing prices and allergens flagged (never invented), conflicts and bad addresses stop the export',()=>{
 const m=model(),c=M.checksOf(m),by=id=>c.find(x=>x.id===id);
 assert.deepEqual(c.map(x=>x.id),['prezzi','allergeni','legenda','surgelati','coerenza','pagine','size','contrast','glifi','ink','web','qr','kit']);
 assert.equal(by('prezzi').state,'warn');assert.deepEqual(by('prezzi').issues,['Torta della domenica','Acqua del rubinetto: 0,00 €'],'missing, and zero to verify');assert.match(by('prezzi').detail,/RADIX non lo inventa/);
 assert.equal(by('allergeni').state,'warn');assert.deepEqual(by('allergeni').issues,['Biscotti al cacao']);
 for(const id of ['legenda','surgelati','coerenza','pagine','size','contrast','glifi','ink','web','qr','kit'])assert.equal(by(id).state,'ok',id+': '+by(id).detail+' '+by(id).issues.join(' | '));
 assert.deepEqual(M.blocking(c),[]);
 // a vegan voice with milk: blocking
 const bad=M.checksOf(model({items:[{name:'Torta vegana',price:4,allergens:[7],tags:['vegano']},{name:'Pane sg',price:2,allergens:[1],tags:['senza-glutine']}]}));
 assert.equal(bad.find(x=>x.id==='coerenza').state,'fail');assert.equal(bad.find(x=>x.id==='coerenza').issues.length,2);assert.ok(M.blocking(bad).length);
 assert.equal(M.checksOf(model({url:'non valido'})).find(x=>x.id==='qr').state,'fail');assert.equal(M.checksOf(model({url:''})).find(x=>x.id==='qr').state,'warn');
 const none=M.checksOf(model({items:[]}));assert.deepEqual(none.map(x=>[x.id,x.state]),[['voci','fail']]);
 // no kit: neutral style, said, not blocking
 const neutral=M.modelOf({items:voices(),url:''},{},{projectName:'Officine Lombarde'}),nc=M.checksOf(neutral);assert.equal(M.hasKit({}),false);assert.equal(M.hasKit(PROFILE),true);
 assert.equal(nc.find(x=>x.id==='kit').state,'warn');assert.equal(nc.find(x=>x.id==='contrast').state,'ok');assert.equal(neutral.brand.name,'Officine Lombarde');
 // each of the three styles passes contrast and fit with the kit
 for(const direction of ['classico','moderno','lavagna']){const cc=M.checksOf(model({direction}));for(const id of ['contrast','pagine','legenda','size'])assert.equal(cc.find(x=>x.id===id).state,'ok',direction+' '+id)}
});

test('the clean CSV, LEGGIMI and the zip: Excel-ready, formulas neutralised, every check written down',async()=>{
 const csv=M.toCsv([M.item({section:'Pane',name:'=SOMMA(A1)',description:'con "virgolette"; e punto e virgola',price:4.8,unit:'kg',allergens:[1,8],tags:['vegano'],frozen:true}),M.item({name:'Acqua',price:1,declared:true}),M.item({name:'Torta'})]);
 const lines=csv.replace(/^﻿/,'').split('\r\n');assert.ok(csv.startsWith('﻿'));
 assert.equal(lines[0],'Sezione;Nome;Descrizione;Prezzo;Unità;Allergeni (numeri);Allergeni;Tag;Surgelato;Note');
 assert.equal(lines[1],'Pane;\'=SOMMA(A1);"con ""virgolette""; e punto e virgola";4,80;kg;1, 8;Glutine, Frutta a guscio;vegano;sì;');
 assert.equal(lines[2],';Acqua;;1,00;;nessuno;;;;');assert.equal(lines[3],';Torta;;;;;;;;','no price, no allergens: left empty');
 const m=model(),files=await M.menuFiles(m,{date:DATE}),z=M.bundle(files,{date:DATE}),back=ZIP.unzip(z);
 assert.deepEqual(back.map(f=>f.name),files.map(f=>f.name));assert.equal(M.zipName(m),'menu-forno-aurora-classico.zip');
 const readme=files.find(f=>f.name==='menu/LEGGIMI.txt').data;assert.match(readme,/nessuna chiamata AI/);assert.match(readme,/\[da completare\] Prezzi[^\n]*\n\s+· /);assert.match(readme,/Pubblica menu\.html all’indirizzo https:\/\/www\.fornoaurora\.it\/menu/);
 assert.match(readme,/RADIX non li deduce dagli ingredienti/);
 const svg=files.find(f=>f.name==='menu/qr/menu-qr.svg').data;assert.match(svg,/QR del menu: https:\/\/www\.fornoaurora\.it\/menu/);
 assert.ok(!files.some(f=>f.name.includes('qr/'))===false);
 const noQr=await M.menuFiles(model({url:'',formats:['a4']}),{date:DATE});assert.deepEqual(noQr.map(f=>f.name),['menu/stampa/menu-a4-tipografia.pdf','menu/digitale/menu-a4.pdf','menu/web/menu.html','menu/menu-pulito.csv','menu/LEGGIMI.txt']);
});

test('the optional AI: one confirmation, one call to the copywriter, only descriptions, new allergens, prices, numbers or ingredients rejected',async()=>{
 const items=[M.item({id:'a',name:'Carbonara',description:'guanciale, uova, pecorino',price:12,allergens:[1,3,7]}),M.item({id:'b',name:'Focaccia',description:'olio e sale',price:3,allergens:[1]}),
  M.item({id:'c',name:'Tiramisù',description:'mascarpone e caffè',price:6,allergens:[1,3,7]}),M.item({id:'d',name:'Acqua',description:'',price:2}),M.item({id:'e',name:'Insalata',description:'verdure di stagione',price:7,declared:true})];
 // cancelled: no call
 let calls=0,asked=0;const rt={reply:async o=>{calls++;assert.equal(o.role,'copywriter');assert.equal(o.messages.length,1);assert.match(o.messages[0].content,/non aggiungere ingredienti, allergeni/);assert.ok(!o.messages[0].content.includes('12'),'prices are not sent');
  return {text:'Ecco: [{"id":"a","descrizione":"Guanciale croccante, uova e pecorino, come vuole la tradizione"},{"id":"b","descrizione":"Olio e sale, con burro"},{"id":"c","descrizione":"Mascarpone e caffè, 2 strati a 5 euro"},{"id":"e","descrizione":"Verdure di stagione con noci e tonno"}]'}}};
 assert.deepEqual(await M.improveDescriptions({items,rt,confirm:async()=>{asked++;return false}}),{cancelled:true});assert.equal(calls,0);assert.equal(asked,1);
 const r=await M.improveDescriptions({items,rt,confirm:async o=>{asked++;assert.match(o.title,/4 descrizioni/);assert.match(o.cost,/una sola chiamata AI/);return true},project:{id:'forno',name:'Forno Aurora'},name:'Forno Aurora'});
 assert.equal(calls,1);assert.equal(asked,2);assert.deepEqual(r.proposals.map(p=>p.id),['a','b','c','e'],'the voice without a description is not sent');
 const by=id=>r.proposals.find(p=>p.id===id);
 assert.equal(by('a').ok,true);
 assert.equal(by('b').ok,false);assert.match(by('b').reasons.join(),/allergeni nuovi: burro/);
 assert.equal(by('c').ok,false);assert.match(by('c').reasons.join(),/numeri nuovi: 2, 5/);assert.match(by('c').reasons.join(),/parla di prezzi/);
 assert.equal(by('e').ok,false);assert.match(by('e').reasons.join(),/allergeni nuovi: /);assert.deepEqual(by('e').reasons[0].replace('allergeni nuovi: ','').split(', ').sort(),['noci','tonno']);
 const applied=M.applyDescriptions(items,r.proposals);assert.equal(applied[0].description,'Guanciale croccante, uova e pecorino, come vuole la tradizione');
 assert.deepEqual(applied.slice(1).map(x=>x.description),items.slice(1).map(x=>x.description),'rejected proposals change nothing');
 assert.deepEqual(applied.map(x=>[x.name,x.price,x.allergens]),items.map(x=>[x.name,x.price,x.allergens]),'names, prices and allergens never change');
 assert.equal(M.applyDescriptions(items,r.proposals,['b'])[0].description,items[0].description,'only the approved ones');
 assert.deepEqual(M.groundCheck(items[1],'olio e sale, con prosciutto').reasons,['ingredienti o diciture nuove: prosciutto']);
 assert.deepEqual(await M.improveDescriptions({items:[items[3]],rt,confirm:async()=>true}),{nothing:true});
 await assert.rejects(M.improveDescriptions({items,rt:{reply:async()=>({text:'non so'})},confirm:async()=>true}),/descrizioni leggibili/);
});

test('saved in the project: key menu in the agents document, other keys kept, retried on a conflict; agents-page keeps it',async()=>{
 const m=model();let stored={schemaVersion:1,conversations:{copywriter:[{role:'user',content:'ciao'}]},prefs:{a:1},coordinato:{schemaVersion:1,items:[{id:'k'}]},menu:{schemaVersion:1,items:[{id:'old'}]}},conflicts=1;
 class ConflictError extends Error{}
 const ws={ConflictError,bind:(pid,name)=>{assert.equal(pid,'forno');assert.equal(name,'agents');return {load:async()=>JSON.parse(JSON.stringify(stored)),save:async d=>{if(conflicts-->0)throw new ConflictError('x');stored=d}}}};
 const rec=M.savedRecord(m,{by:'Ilaria',at:'2026-10-22T10:00:00.000Z'});assert.equal(rec.id,'menu-20261022100000');assert.equal(rec.items.length,m.items.length);assert.equal(rec.kit.brand,'Forno Aurora');
 await M.saveToProject(ws,'forno',rec);
 assert.deepEqual(stored.menu.items.map(x=>x.id),['old',rec.id]);assert.deepEqual(stored.coordinato,{schemaVersion:1,items:[{id:'k'}]});assert.deepEqual(stored.prefs,{a:1});assert.equal(stored.conversations.copywriter.length,1);
 for(let i=0;i<10;i++)await M.saveToProject(ws,'forno',{...rec,id:'m'+i});assert.equal(stored.menu.items.length,8,'only the last 8');
 assert.deepEqual(M.readStore({menu:'boh'}),{schemaVersion:1,items:[]});
 const back=M.fromRecord(rec,PROFILE,{projectName:'Forno Aurora'});assert.deepEqual(back.items,m.items);assert.equal(M.htmlPage(back,{date:DATE}),M.htmlPage(m,{date:DATE}),'reopened as it was');
 const src=read('agents-page.js'),fn=/function clean\(d\)\{[^\n]*\}/.exec(src)[0],ctx={MAX_KEPT:40};vm.createContext(ctx);vm.runInContext(fn+';this.clean=clean',ctx);
 const kept=ctx.clean({...stored,conversations:{a:[{role:'user',content:'x'},{role:'assistant',content:'…',pending:true}]}});
 assert.deepEqual(JSON.parse(JSON.stringify(kept.menu)),stored.menu,'menu kept by agents-page clean()');assert.equal(kept.conversations.a.length,1);
 assert.match(src,/\n\s+data\.coordinato=fresh\.coordinato;[^\n]*data\.menu=fresh\.menu;/,'kept after a save conflict');
 assert.match(src,/if\(fresh&&data\)\{[^}]*data\.menu=fresh\.menu;/,'and when the tab comes back');
});

test('the card in «Cosa vuoi fare»: Stampa e documenti, inline studio, free with an optional confirmed call, icon, script, styles',()=>{
 const c=crea.card('menu');assert.equal(c.group,'Stampa e documenti');assert.equal(c.title,'Menu e listino');assert.equal(c.inline,'menu');assert.equal(crea.linkFor(c,'forno'),null);
 assert.match(c.cost,/^Nessuna chiamata AI/);assert.match(c.cost,/con conferma/);
 assert.equal(crea.best('menu del ristorante con gli allergeni'),'menu');assert.ok(look.has(look.CARDS.menu));
 const js=read('agency/crea.js');assert.match(js,/menu:\{global:'RadixMenuStudio'[^}]*agent:'copywriter'\}/);
 assert.match(js,/S\.menuStudio\(\{project,profile:current\.profile,projectName:current\.name,[^\n]*rt,[^\n]*openIdentity:\(\)=>openInline\(core\.card\('identita'\)\)/,'the empty state opens the Kit identità studio');
 const html=read('agency/crea.html'),at=f=>html.indexOf(f);
 for(const f of ['/lib/print-studio.js','/lib/zip-lite.js','/lib/lead-xlsx-parser.js','/sales/crm-csv-core.js','/lib/qr-lite.js'])assert.ok(at(f)>=0&&at(f)<at('/lib/menu-studio.js'),f+' before menu-studio');
 assert.ok(at('/lib/menu-studio.js')<at('/agency/crea.js'));
 const css=read('shell/crea.css');assert.match(css,/\.cr-panel \.menu-studio \.mn-check\{/);
 const src=read('lib/menu-studio.js');assert.match(src,/'ad-dir mn-dir'/,'the three layouts get the «Scelta» ring');
 // the only AI path: improveDescriptions → rt.reply, after the confirmation
 assert.equal((src.match(/\.reply\(/g)||[]).length,1);assert.ok(!/\bfetch\(\s*['"`]|new XMLHttpRequest/.test(src),'no direct request');
 assert.ok(/const ok=await \(confirm\|\|askConfirm\)[^]*if\(!ok\)return \{cancelled:true\};[^]*rt\.reply\(/.test(src),'confirmation before the call');
});
