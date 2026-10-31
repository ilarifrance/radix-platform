'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const C=require('../lib/catalog-studio.js'),P=require('../lib/print-studio.js'),csv=require('../sales/crm-csv-core.js');

const HEAD=['Codice','Nome prodotto','Descrizione','Prezzo €','Categoria','Foto','Note'];
const ROWS=Array.from({length:30},(_,i)=>({Codice:'P'+(i+1),'Nome prodotto':'Prodotto '+(i+1),Descrizione:'Pane a lievitazione naturale.','Prezzo €':(i*3.5+1).toFixed(2).replace('.',','),Categoria:['Pane','Dolci','Focacce'][i%3],Foto:'p'+(i+1)+'.jpg',Note:''}));
const brand=P.brandOf({identityKit:{brand:'Forno Bianchi',palette:[{role:'primary',hex:'#2F5D50'},{role:'accent',hex:'#E3B448'}]}});
const ascii=b=>Buffer.from(b).toString('latin1');
const count=b=>+/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(ascii(b))[1];

test('column mapping: Italian and English headers, each header used once, editable afterwards',()=>{
 assert.deepEqual(C.detectMapping(HEAD),{code:'Codice',name:'Nome prodotto',description:'Descrizione',price:'Prezzo €',category:'Categoria',image:'Foto',note:'Note'});
 assert.deepEqual(C.detectMapping(['SKU','Product name','Description','Unit price','Category','Image URL','Notes']),{code:'SKU',name:'Product name',description:'Description',price:'Unit price',category:'Category',image:'Image URL',note:'Notes'});
 assert.deepEqual(C.detectMapping(['Articolo','Denominazione','Prezzo listino','Famiglia']),{code:'Articolo',name:'Denominazione',description:'',price:'Prezzo listino',category:'Famiglia',image:'',note:''});
 const m=C.detectMapping(['Nome','Nome']);assert.equal(m.name,'Nome');assert.equal(m.code,'');
 assert.deepEqual(C.FIELDS.map(f=>f.id),['code','name','description','price','category','image','note']);
});

test('prices: parsed from Italian and English writing, formatted it-IT with the euro sign',()=>{
 assert.deepEqual(['€ 1.234,50','1234.5','1,234.50','12','12,5','1.234','0.5','3.000.000','-4,2','su richiesta','',12.3].map(C.parsePrice),[1234.5,1234.5,1234.5,12,12.5,1234,.5,3000000,-4.2,null,null,12.3]);
 assert.equal(C.formatPrice(1234.5),'1.234,50\u00a0€');assert.equal(C.formatPrice(3),'3,00\u00a0€');assert.equal(C.formatPrice(1234567.891),'1.234.567,89\u00a0€');assert.equal(C.formatPrice(-0.5),'-0,50\u00a0€');assert.equal(C.formatPrice(null),'');
 assert.equal(P.winAnsi('\u00a0'),0xA0);assert.equal(P.winAnsi('€'),0x80,'both exist in Helvetica WinAnsi');
});

test('products: rows without name and code skipped, at most 500, text prices kept as written',()=>{
 const r=C.toProducts([...ROWS,{Codice:'',"Nome prodotto":'',Descrizione:'solo testo'},{Codice:'X','Nome prodotto':'Torta','Prezzo €':'su richiesta'}],C.detectMapping(HEAD));
 assert.equal(r.products.length,31);assert.equal(r.skipped,1);assert.equal(r.cut,0);
 const t=r.products.find(p=>p.code==='X');assert.equal(t.priceValue,null);assert.equal(t.price,'su richiesta');assert.equal(t.row,33);
 const many=C.toProducts(Array.from({length:620},(_,i)=>({Nome:'N'+i})),{name:'Nome'});assert.equal(many.products.length,C.MAX_PRODUCTS);assert.equal(many.cut,120);assert.equal(many.total,620);
});

test('grouping and sorting: categories in order of first appearance, no category last; sort by sheet, name or code',()=>{
 const ps=[{code:'B10',name:'Zucca',category:'Verdura'},{code:'B2',name:'Arancia',category:'Frutta'},{code:'A1',name:'mela',category:''},{code:'B1',name:'Banana',category:'Frutta'},{code:'C3',name:'Carota',category:'Verdura'}];
 const g=C.groupProducts(ps);assert.deepEqual(g.map(s=>s.category),['Verdura','Frutta',C.NO_CATEGORY]);assert.deepEqual(g[1].products.map(p=>p.code),['B2','B1']);
 assert.deepEqual(C.groupProducts(ps,{sort:'name'})[1].products.map(p=>p.name),['Arancia','Banana']);
 assert.deepEqual(C.groupProducts(ps,{sort:'code',group:false})[0].products.map(p=>p.code),['A1','B1','B2','B10','C3'],'numeric-aware code order');
 assert.deepEqual(C.groupProducts(ps,{group:false,sort:'name'})[0].products.map(p=>p.name),['Arancia','Banana','Carota','mela','Zucca'],'case-insensitive');
});

test('pagination: n products per page, every category starts on a new page, cover and back counted',()=>{
 const sec=(c,n)=>({category:c,products:Array.from({length:n},(_,i)=>({name:c+i}))});
 const p=C.paginate([sec('A',9),sec('B',1),sec('C',4)],4);
 assert.deepEqual(p.map(x=>[x.category,x.products.length,x.first,x.part,x.parts]),[['A',4,true,1,3],['A',4,false,2,3],['A',1,false,3,3],['B',1,true,1,1],['C',4,true,1,1]]);
 assert.equal(C.paginate([sec('A',13)],6).length,3);assert.equal(C.paginate([sec('A',13)],2).length,7);assert.equal(C.paginate([sec('A',3)],5).length,1,'unknown n falls back to 4');
 assert.deepEqual([2,4,6].map(n=>C.grid(n)),[{cols:1,rows:2},{cols:2,rows:2},{cols:2,rows:3}]);
 const products=C.toProducts(ROWS,C.detectMapping(HEAD)).products;
 assert.equal(C.pageCount(products,{perPage:4}),1+3*3+1,'3 categories of 10 → 3 pages each');assert.equal(C.pageCount(products,{perPage:6,group:false,cover:false,back:false}),5);
 const doc=C.layout(products,{perPage:4},brand);assert.equal(doc.pages.length,11);assert.deepEqual(doc.pages.map(p=>p.label).slice(0,5),['Copertina','Pane','Pane','Pane','Dolci']);
 assert.ok(doc.pages[2].items.some(i=>i.t==='text'&&i.s==='Pane · segue'),'continuation pages say so');
 assert.ok(doc.pages[1].items.some(i=>i.t==='text'&&i.s==='2'&&i.label==='Numero di pagina'),'page numbers count the cover');
 assert.ok(!C.layout(products,{perPage:4,pageNumbers:false},brand).pages[1].items.some(i=>i.label==='Numero di pagina'));
});

test('prices on or off, with the «Prezzi IVA esclusa» note; long names and descriptions cut with «…» and listed',()=>{
 const products=C.toProducts(ROWS.slice(0,4),C.detectMapping(HEAD)).products;
 const on=C.layout(products,{perPage:4,cover:false,back:false},brand),texts=on.pages[0].items.filter(i=>i.t==='text').map(i=>i.s);
 assert.ok(texts.includes('1,00 €')&&texts.includes('Prezzi IVA esclusa'),'price on one line');
 const off=C.layout(products,{perPage:4,cover:false,back:false,prices:false},brand).pages[0].items.filter(i=>i.t==='text').map(i=>i.s);
 assert.ok(!off.some(s=>/€|IVA/.test(s)));
 assert.ok(!C.layout(products,{perPage:4,cover:false,back:false,vatNote:false},brand).pages[0].items.some(i=>i.s==='Prezzi IVA esclusa'));
 const long=C.layout([{code:'L1',name:'Pagnotta '.repeat(30),description:'Farina di grano tenero tipo 1, acqua, lievito madre, sale. '.repeat(30),price:'4',priceValue:4,category:'',image:'',note:''}],{perPage:6,cover:false,back:false},brand);
 assert.deepEqual(long.cut,{name:['L1'],description:['L1']});assert.ok(long.warnings.some(w=>/^Descrizione accorciata con «…» per 1 prodotto: L1\./.test(w.text)));
 assert.ok(long.pages[0].items.filter(i=>i.t==='text'&&/…$/.test(i.s)).length>=2);assert.ok(!long.warnings.some(w=>w.kind==='overflow'),'one summary, not one warning per field');
});

test('images: picked files and same-origin URLs are placed, other sites get a placeholder and a warning',()=>{
 const O='https://radix.example';
 assert.deepEqual(C.imageSource('foto/Pane.JPG',O),{kind:'file',key:'pane.jpg'});assert.deepEqual(C.imageSource('C:\\foto\\a.png',O),{kind:'file',key:'a.png'});
 assert.deepEqual(C.imageSource('/img/a.jpg',O),{kind:'url',key:'/img/a.jpg'});assert.equal(C.imageSource(O+'/img/a.jpg',O).kind,'url');
 assert.equal(C.imageSource('https://cdn.altro.it/a.jpg',O).kind,'external');assert.equal(C.imageSource('',O).kind,'none');
 const ps=[{code:'1',name:'A',image:'a.jpg'},{code:'2',name:'B',image:'https://cdn.altro.it/b.jpg'},{code:'3',name:'C',image:'manca.jpg'},{code:'4',name:'D',image:''}].map(p=>({...p,category:'',description:'',price:'',note:''}));
 const doc=C.layout(ps,{perPage:4,cover:false,back:false,origin:O},brand,new Map([['a.jpg',{w:800,h:400,src:'blob:x'}]])),items=doc.pages[0].items;
 const img=items.filter(i=>i.t==='image');assert.equal(img.length,1);assert.equal(img[0].key,'a.jpg');assert.equal(Math.round(img[0].w/img[0].h*100),200,'aspect kept');
 assert.deepEqual(items.filter(i=>i.t==='text'&&/Foto non disponibile|Senza foto/.test(i.s)).map(i=>i.s),['Foto non disponibile','Foto non disponibile','Senza foto']);
 assert.deepEqual(doc.missing,{external:['https://cdn.altro.it/b.jpg'],file:['manca.jpg'],url:[]});
 assert.ok(doc.warnings.some(w=>/CORS/.test(w.text)&&/cdn\.altro\.it/.test(w.text)));assert.ok(doc.warnings.some(w=>/non trovate tra i file scelti: manca\.jpg/.test(w.text)));
 // in the PDF: no raster yet → nothing drawn there (the placeholder is the layout's); with a raster → JPEG XObject
 assert.ok(!/\/Subtype \/Image/.test(ascii(P.pdf(doc))));img[0].raster={w:8,h:4,jpeg:new Uint8Array([0xFF,0xD8,0xFF,0xD9])};
 assert.match(ascii(P.pdf(doc)),/\/Subtype \/Image \/Width 8 \/Height 4 [^>]*\/DCTDecode/);
 assert.match(P.previewSvg(doc,0),/<image [^>]*href="blob:x"/);
});

test('PDF: all pages, print with bleed, slug and marks as the Studio Stampa, web on the trim; even a cover-only sheet',()=>{
 const products=C.toProducts(ROWS,C.detectMapping(HEAD)).products,doc=C.layout(products,{perPage:6},brand);
 const pr=P.pdf(doc),web=P.pdf(doc,{mode:'web'}),s=ascii(pr);
 assert.ok(s.startsWith('%PDF-1.4'));assert.equal(count(pr),doc.pages.length);assert.equal(count(web),doc.pages.length);assert.equal(doc.pages.length,1+2*3+1);
 const pt=mm=>Math.round(mm*72/25.4*1000)/1000;
 assert.ok(s.includes('/MediaBox ['+[0,0,228,315].map(pt).join(' ')+'] /BleedBox ['+[6,6,222,309].map(pt).join(' ')+'] /TrimBox ['+[9,9,219,306].map(pt).join(' ')+']'));
 assert.equal((s.match(/q 0 0 0 RG 0\.25 w /g)||[]).length,8*doc.pages.length);assert.ok(!/0\.25 w /.test(ascii(web)));
 assert.equal(count(P.pdf(C.layout([],{},brand))),2,'cover and back');
 assert.equal(C.filename(doc,'print'),'catalogo-forno-bianchi-tipografia.pdf');
 assert.ok(!C.notes(doc).some(n=>/punto metallico/.test(n)),'8 pages: a multiple of 4');
 assert.ok(C.notes(C.layout(products,{perPage:4},brand)).some(n=>/Il catalogo ha 11 pagine: per la rilegatura a punto metallico[^]*multiplo di 4 \(12\)/.test(n)));
});

test('the sheet is read by the CRM import readers; Excel formulas are taken as their saved values only on request',()=>{
 const p=csv.parse('Codice;Nome;Prezzo\nP1;Pane;"1,50"\n');assert.deepEqual(C.toProducts(p.rows,C.detectMapping(p.headers)).products.map(x=>[x.code,x.name,x.priceValue]),[['P1','Pane',1.5]]);
 const src=fs.readFileSync(path.join(__dirname,'../lib/catalog-studio.js'),'utf8');
 assert.match(src,/X\.readRows\(await file\.arrayBuffer\(\),\{maxRows:csv\.MAX_ROWS,formulas:true\}\)/);assert.match(src,/return csv\.readFile\(file\)/);
 const xl=fs.readFileSync(path.join(__dirname,'../lib/lead-xlsx-parser.js'),'utf8');
 assert.match(xl,/async function readRows\(buffer,\{maxRows=250,formulas=false\}=\{\}\)/);assert.match(xl,/if\(first\(c,'f'\)&&!formulas\)fail\('contiene formule/);
 assert.match(xl,/const rows=await readRows\(buffer,\{maxRows\}\);/,'the lead import still refuses formulas');
});
