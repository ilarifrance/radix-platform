'use strict';
// Studio Negozio online (lib/shop-studio.js): fake data only (the invented shop «Filo Chiaro», DATI DI ESEMPIO), no AI.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const S=require('../lib/shop-studio.js'),CSV=require('../sales/crm-csv-core.js'),Z=require('../lib/zip-lite.js');
const root=path.join(__dirname,'..');
const SET=S.SAMPLE_SETTINGS;
const sheet=()=>S.sampleSheet();
const build=(proposal='essenziale',overrides={},settings=SET)=>{const sh=sheet(),m=S.detectMapping(sh.headers,sh.rows),b=S.buildProducts(sh.rows,m,settings);return {m,b,products:S.finalize(b.products,proposal,overrides,settings)}};
const parseCsv=text=>{const out=[];let row=[],cell='',q=false;const t=text.replace(/^﻿/,'');
 for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'&&t[i+1]==='"'){cell+='"';i++}else if(c==='"')q=false;else cell+=c}
  else if(c==='"')q=true;else if(c===','){row.push(cell);cell=''}else if(c==='\r'){}else if(c==='\n'){row.push(cell);out.push(row);row=[];cell=''}else cell+=c}
 if(cell||row.length){row.push(cell);out.push(row)}return out};
const asObjects=text=>{const [h,...rows]=parseCsv(text);return {headers:h,rows:rows.map(r=>Object.fromEntries(h.map((x,i)=>[x,r[i]])))}};

test('columns are matched from Italian headers; the model code groups the variants',()=>{
 const {m,b}=build();
 assert.equal(m.group,'Codice modello');assert.equal(m.sku,'SKU');assert.equal(m.price,'Prezzo');assert.equal(m.compareAt,'Prezzo pieno');assert.equal(m.size,'Taglia');assert.equal(m.color,'Colore');assert.equal(m.images,'Immagini');
 assert.deepEqual(S.missingColumns(m),[]);assert.deepEqual(S.missingColumns({}),['Nome prodotto','Prezzo di vendita']);
 assert.deepEqual(b.products.map(p=>[p.handle,p.variants.length]),[['t-shirt-onda',5],['felpa-riva',2],['cappello-faro',1],['borsa-molo',1],['sciarpa-alba',1]]);
 assert.equal(b.variants,10);
 const ts=b.products[0];assert.deepEqual(ts.sizes,['S','M','L']);assert.deepEqual(ts.colors,['Blu','Bianco']);assert.equal(ts.images.length,2);
 // without the model code the rows with the same name still group
 const sh=sheet(),m2={...S.detectMapping(sh.headers,sh.rows),group:''};assert.equal(S.buildProducts(sh.rows,m2,SET).products.length,5);
 // English headers too
 assert.deepEqual(Object.entries(S.detectMapping(['Title','Variant SKU','Variant Price','Size','Image Src'],[])).filter(([,v])=>v).map(([k])=>k).sort(),['images','name','price','size','sku']);
});

test('values: weights to grams, stock as integers, image lists',()=>{
 assert.equal(S.parseWeight('0,18 kg','kg'),180);assert.equal(S.parseWeight('180 g','kg'),180);assert.equal(S.parseWeight('2','kg'),2000);assert.equal(S.parseWeight('250','g'),250);
 assert.equal(S.parseWeight('',''),null);assert.ok(Number.isNaN(S.parseWeight('circa un etto')));
 assert.equal(S.parseStock('12'),12);assert.equal(S.parseStock(''),null);assert.ok(Number.isNaN(S.parseStock('tanti')));
 assert.deepEqual(S.splitImages('https://a.it/1.jpg | https://a.it/2.jpg;https://a.it/3.jpg'),['https://a.it/1.jpg','https://a.it/2.jpg','https://a.it/3.jpg']);
 assert.deepEqual(S.splitImages('https://a.it/1.jpg, https://a.it/2.jpg'),['https://a.it/1.jpg','https://a.it/2.jpg']);
});

test('three fixed presentations: different titles, descriptions and tags, only from the sheet, deterministic',()=>{
 const {b}=build(),p=b.products[0];
 const e=S.present(p,'essenziale',SET),d=S.present(p,'descrittivo',SET),v=S.present(p,'vetrina',SET);
 assert.equal(e.title,'T-shirt Onda');assert.equal(d.title,'T-shirt Onda in cotone');assert.equal(v.title,'Filo Chiaro · T-shirt Onda');
 assert.equal(e.description,'T-shirt a girocollo con maniche corte e orlo dritto.');
 assert.match(d.description,/## Caratteristiche\n- Materiale: cotone/);assert.match(d.description,/- Taglie: S, M, L/);
 assert.match(v.description,/## Taglie e colori\n- Taglie disponibili: S, M, L\n- Colori disponibili: Blu, Bianco/);assert.match(v.description,/## Spedizione\nSpedizione in Italia/);
 assert.deepEqual(e.tags,['T-shirt']);assert.deepEqual(d.tags,['T-shirt','cotone','Blu','Bianco']);assert.ok(v.tags.includes('Taglia S'));
 assert.deepEqual(e.collections,['T-shirt']);assert.deepEqual(d.collections,['T-shirt','T-shirt > Cotone']);assert.deepEqual(v.collections,['T-shirt','Colori > Blu','Colori > Bianco']);
 for(const x of [e,d,v]){assert.ok(x.seoTitle.length<=70);assert.ok(x.seoDescription.length<=160)}
 assert.deepEqual(S.present(p,'vetrina',SET),v,'same input, same output');
 assert.deepEqual(S.PROPOSALS.map(x=>x.id),['essenziale','descrittivo','vetrina']);
 // the presentations raise no grounding flag on the example
 for(const id of ['essenziale','descrittivo','vetrina'])for(const x of S.checkAll(build(id).products,SET).items)assert.ok(!x.issues.some(i=>i.field==='description'),id+' '+x.handle);
 assert.equal(S.toHtml('Uno.\n\n## Dettagli\n- a <b>\n- c'),'<p>Uno.</p><h3>Dettagli</h3><ul><li>a &lt;b&gt;</li><li>c</li></ul>');
});

test('checks: missing price, duplicate SKU, non-https image; edits fix them; SEO, handle, options and invented data',()=>{
 const {products}=build('vetrina'),c=S.checkAll(products,SET),by=h=>c.items.find(x=>x.handle===h);
 assert.equal(c.summary.products,5);assert.equal(c.summary.variants,10);assert.equal(c.summary.error,3);assert.equal(c.summary.ready,false);
 assert.ok(by('borsa-molo').issues.some(i=>i.field==='price'&&/Prezzo mancante/.test(i.msg)));
 assert.ok(by('borsa-molo').issues.some(i=>i.field==='images'&&/non https/.test(i.msg)));
 assert.ok(by('felpa-riva').issues.some(i=>i.field==='sku'&&/ripetuto/.test(i.msg)));assert.ok(by('sciarpa-alba').issues.some(i=>/FE-RIVA-L/.test(i.msg)));
 // the person's fixes
 let o={};const P=k=>products.find(p=>p.handle===k);
 o=S.setOverride(o,P('borsa-molo'),{variants:{[P('borsa-molo').variants[0].key]:{price:'59,00'}},images:['https://example.com/filo-chiaro/bo-molo.jpg']});
 o=S.setOverride(o,P('sciarpa-alba'),{variants:{[P('sciarpa-alba').variants[0].key]:{sku:'SC-ALBA'}}});
 const fixed=S.checkAll(build('vetrina',o).products,SET);assert.equal(fixed.summary.error,0);assert.equal(fixed.summary.ready,true);
 // over-long SEO, bad handle, duplicate handle, invented claim, variant without SKU and without option value
 const t=P('t-shirt-onda');let o2=S.setOverride({},t,{seoTitle:'x'.repeat(71),seoDescription:'y'.repeat(161),handle:'T-Shirt Onda',description:'T-shirt in cotone biologico certificato, 100% made in Italy.'});
 o2=S.setOverride(o2,t,{variants:{[t.variants[1].key]:{sku:'',size:''}}});o2=S.setOverride(o2,P('felpa-riva'),{handle:'cappello-faro'});
 const bad=S.checkAll(build('vetrina',o2).products,SET),ti=bad.items[0].issues,f=k=>ti.filter(i=>i.field===k);
 assert.ok(f('seoTitle').some(i=>/71 caratteri/.test(i.msg)));assert.ok(f('seoDescription').some(i=>/161 caratteri/.test(i.msg)));assert.ok(f('handle').some(i=>/solo lettere minuscole/.test(i.msg)));
 assert.ok(f('description').some(i=>/biologico/.test(i.msg))&&f('description').some(i=>/100/.test(i.msg)),'invented claims and numbers are errors');
 assert.ok(f('sku').some(i=>/Variante senza SKU/.test(i.msg)));assert.ok(f('options').some(i=>/senza taglia/.test(i.msg)));
 assert.ok(bad.items.find(x=>x.key===P('felpa-riva').key).issues.some(i=>/usato da più prodotti/.test(i.msg)));
 // reset
 assert.deepEqual(S.resetOverride(o2,t.key)[t.key],undefined);
});

test('Shopify CSV: official headers, one row per variant, product fields on the first row, extra image rows',()=>{
 const {products}=build('descrittivo'),text=S.shopifyCsv(products,SET),{headers,rows}=asObjects(text);
 assert.deepEqual(headers,S.SHOPIFY_COLUMNS);
 for(const h of ['Handle','Title','Body (HTML)','Vendor','Product Category','Type','Tags','Published','Option1 Name','Option1 Value','Option2 Name','Option2 Value','Option3 Name','Option3 Value','Variant SKU','Variant Grams','Variant Inventory Qty','Variant Price','Variant Compare At Price','Image Src','Image Position','Image Alt Text','SEO Title','SEO Description','Variant Image','Status'])assert.ok(headers.includes(h),h);
 assert.ok(!text.startsWith('﻿'),'no BOM in the import file');
 const ts=rows.filter(r=>r.Handle==='t-shirt-onda');assert.equal(ts.length,5,'one row per variant');
 assert.equal(ts[0].Title,'T-shirt Onda in cotone');assert.match(ts[0]['Body (HTML)'],/^<p>T-shirt a girocollo/);assert.equal(ts[0]['Option1 Name'],'Taglia');assert.equal(ts[0]['Option2 Name'],'Colore');
 assert.equal(ts[0].Status,'draft');assert.equal(ts[0].Published,'FALSE');assert.equal(ts[0].Vendor,'Filo Chiaro');assert.equal(ts[0].Type,'T-shirt');
 for(const r of ts.slice(1)){assert.equal(r.Title,'');assert.equal(r['Option1 Name'],'');assert.ok(r['Option1 Value']&&r['Option2 Value'])}
 assert.deepEqual(ts.map(r=>r['Option1 Value']+'/'+r['Option2 Value']),['S/Blu','M/Blu','L/Blu','S/Bianco','M/Bianco']);
 assert.deepEqual(ts.map(r=>r['Variant Price']),['24.00','24.00','24.00','24.00','24.00']);assert.equal(ts[0]['Variant Grams'],'180');assert.equal(ts[2]['Variant Inventory Qty'],'0');
 assert.equal(ts[0]['Image Src'],'https://example.com/filo-chiaro/ts-onda-blu.jpg');assert.equal(ts[1]['Image Position'],'2');assert.equal(ts[3]['Variant Image'],'https://example.com/filo-chiaro/ts-onda-bianco.jpg');
 assert.match(ts[1]['Image Alt Text'],/colore bianco$/);
 const fe=rows.filter(r=>r.Handle==='felpa-riva');assert.equal(fe[0]['Variant Compare At Price'],'59.00');assert.equal(fe[0]['Variant Price'],'49.00');
 // a product with more photos than variants gets image-only rows
 const extra=S.setOverride({},products[2],{images:['https://example.com/a.jpg','https://example.com/b.jpg','https://example.com/c.jpg']});
 const r2=asObjects(S.shopifyCsv(build('descrittivo',extra).products,SET)).rows.filter(r=>r.Handle==='cappello-faro');
 assert.equal(r2.length,3);assert.equal(r2[2]['Variant SKU'],'');assert.equal(r2[2]['Image Src'],'https://example.com/c.jpg');assert.equal(r2[2]['Image Position'],'3');
 // no options: Shopify's Title / Default Title; http photos never go in the file
 const sh=sheet(),m={...S.detectMapping(sh.headers,sh.rows),size:'',color:''};const plain=S.finalize(S.buildProducts(sh.rows.slice(7,9),m,SET).products,'essenziale',{},SET);
 const r3=S.shopifyRows(plain,SET);assert.equal(r3[0]['Option1 Name'],'Title');assert.equal(r3[0]['Option1 Value'],'Default Title');assert.ok(!r3.some(r=>/^http:/.test(r['Image Src']||'')));
 assert.equal(S.shopifyRows(plain,{...SET,status:'active'})[0].Status,'active');
});

test('WooCommerce CSV: importer headers, simple, variable and variation rows linked by Parent',()=>{
 const {products}=build('vetrina'),{headers,rows}=asObjects(S.wooCsv(products,SET));
 assert.deepEqual(headers,S.WOO_COLUMNS);
 for(const h of ['Type','SKU','Name','Published','Short description','Description','Regular price','Sale price','Stock','Categories','Tags','Images','Parent','Attribute 1 name','Attribute 1 value(s)','Attribute 1 visible','Attribute 1 global'])assert.ok(headers.includes(h),h);
 const parent=rows.find(r=>r.SKU==='TS-ONDA');assert.equal(parent.Type,'variable');assert.equal(parent['Attribute 1 value(s)'],'S, M, L');assert.equal(parent['Attribute 2 value(s)'],'Blu, Bianco');assert.equal(parent['Attribute 1 visible'],'1');
 assert.equal(parent.Published,'-1','draft, not escaped as text');assert.equal(parent['Regular price'],'');assert.match(parent.Images,/ts-onda-blu\.jpg, https:\/\/example\.com\/filo-chiaro\/ts-onda-bianco\.jpg/);
 assert.equal(parent.Categories,'T-shirt, Colori > Blu, Colori > Bianco');
 const vars=rows.filter(r=>r.Parent==='TS-ONDA');assert.equal(vars.length,5);for(const v of vars){assert.equal(v.Type,'variation');assert.ok(v.SKU);assert.equal(v['Attribute 1 value(s)'].split(',').length,1)}
 assert.equal(vars[0].Name,'Filo Chiaro · T-shirt Onda - S, Blu');assert.equal(vars[0]['Regular price'],'24.00');assert.equal(vars[0]['Weight (kg)'],'0.18');assert.equal(vars[2]['In stock?'],'0');
 const fe=rows.filter(r=>r.Parent==='FE-RIVA');assert.equal(fe[0]['Regular price'],'59.00');assert.equal(fe[0]['Sale price'],'49.00');
 const cap=rows.find(r=>r.SKU==='CA-FARO');assert.equal(cap.Type,'simple');assert.equal(cap.Parent,'');assert.equal(cap.Stock,'15');assert.equal(cap['Attribute 1 name'],'Colore');
 // variations come right after their parent
 const iP=rows.indexOf(parent);assert.deepEqual(rows.slice(iP+1,iP+6).map(r=>r.Type),Array(5).fill('variation'));
 assert.equal(S.wooRows(products,{...SET,status:'active'})[0].Published,'1');
});

test('files and zip by platform; LEGGIMI with the steps and the checklist; DATI DI ESEMPIO',()=>{
 const {products}=build('vetrina'),check=S.checkAll(products,SET);
 assert.deepEqual(S.exportFiles(products,check,{...SET,platform:'shopify'}).map(f=>f.name),['shopify-prodotti.csv','seo-e-alt.csv','controlli.csv','LEGGIMI.txt']);
 assert.deepEqual(S.exportFiles(products,check,{...SET,platform:'woocommerce'}).map(f=>f.name),['woocommerce-prodotti.csv','seo-e-alt.csv','controlli.csv','LEGGIMI.txt']);
 const files=S.exportFiles(products,check,SET,{name:'Filo Chiaro',sample:true,proposalLabel:'Vetrina',date:'2026-10-24'});assert.equal(files.length,5);
 const rd=files.find(f=>f.name==='LEGGIMI.txt').data;
 for(const re of [/DATI DI ESEMPIO/,/IMPORTARE IN SHOPIFY/,/IMPORTARE IN WOOCOMMERCE/,/14 giorni/,/Condizioni generali di vendita/,/privacy/i,/[Cc]ookie/,/RADIX non configura pagamenti/,/IVA inclusa/,/Includi le imposte nei prezzi/])assert.match(rd,re);
 assert.match(files.find(f=>f.name==='controlli.csv').data,/Prezzo mancante/);
 const z=S.exportZip(products,check,SET,{name:'Filo Chiaro'});const names=Z.unzip?Z.unzip(z).map(f=>f.name):null;if(names)assert.deepEqual(names,files.map(f=>f.name));
 assert.equal(S.zipName('Filo Chiaro'),'negozio-filo-chiaro.zip');
});

test('the optional AI call: one confirmation, one call, invented data dropped, never called without a yes',async()=>{
 const {products}=build('essenziale');let calls=0;
 const rt={reply:async({role,messages})=>{calls++;assert.equal(role,'web-content');assert.match(messages[0].content,/solo i dati del prodotto/);
  return {text:JSON.stringify([{chiave:products[0].key,descrizione:'T-shirt a girocollo in cotone, maniche corte e orlo dritto.'},{chiave:products[2].key,descrizione:'Cappello in cotone biologico con protezione UV 50+.'}])}}};
 const no=await S.improveDescriptions({products,rt,confirm:async()=>false});assert.deepEqual(no,{cancelled:true});assert.equal(calls,0);
 let asked=null;const r=await S.improveDescriptions({products,rt,confirm:async o=>{asked=o;return true}});assert.equal(calls,1);assert.match(asked.cost,/una sola chiamata AI/i);
 const a=r.proposals.find(x=>x.key===products[0].key),b=r.proposals.find(x=>x.key===products[2].key);assert.equal(a.ok,true);assert.equal(b.ok,false);assert.ok(b.reasons.some(x=>/50/.test(x))&&b.reasons.some(x=>/biologico/.test(x)));
 const o=S.applyAi({},products,r.proposals);assert.equal(o[products[0].key].description,a.after);assert.equal(o[products[2].key],undefined);
 assert.deepEqual(S.parseAi('niente'),[]);
});

test('saved in the agents doc under «shop», every other key kept; sheets of Schede prodotto can be loaded',async()=>{
 const sh=sheet(),m=S.detectMapping(sh.headers,sh.rows),o={P2:{title:'Maglia Onda'}};
 const rec=S.savedRecord({fileName:sh.name,sheet:sh,mapping:m,settings:SET,proposal:'vetrina',overrides:o,sample:true},{at:'2026-10-24T10:00:00Z'});
 assert.equal(rec.id,'shop-20261024100000');assert.equal(rec.rows.length,10);assert.equal(rec.proposal,'vetrina');
 const back=S.fromRecord(rec);assert.deepEqual(back.sheet,{headers:sh.headers,rows:sh.rows});assert.equal(S.finalize(S.buildProducts(back.sheet.rows,back.mapping,back.settings).products,back.proposal,back.overrides,back.settings)[0].title,'Maglia Onda');
 let doc={schemaVersion:1,conversations:{x:1},productSheets:{schemaVersion:1,items:[{id:'ps-1',headers:['Nome','Prezzo'],rows:[['A','1']]}]},other:{keep:true}};
 const ws={bind:()=>({load:async()=>doc,save:async d=>{doc=d}})};
 await S.saveToProject(ws,'p',rec);assert.deepEqual(doc.other,{keep:true});assert.deepEqual(doc.conversations,{x:1});assert.equal(doc.productSheets.items.length,1);assert.equal(doc.shop.items.length,1);
 for(let i=0;i<4;i++)await S.saveToProject(ws,'p',{...rec,id:'shop-'+i});assert.equal(doc.shop.items.length,3,'at most 3 kept');
 assert.equal(S.savedSheets(doc).length,1);assert.deepEqual(S.readStore({}),{schemaVersion:1,items:[]});
});

test('the example reads back through the CRM CSV reader',()=>{
 const parsed=CSV.parse(S.sampleCsv());assert.deepEqual(parsed.headers,sheet().headers);assert.deepEqual(parsed.rows,sheet().rows);
});

test('the panel card, the icon and the page wiring',()=>{
 const core=require('../agency/crea-core.js'),look=require('../agency/marketing-look.js'),c=core.card('negozio');
 assert.equal(c.group,'Web e annunci');assert.equal(c.inline,'shop');assert.equal(core.linkFor(c,'filo'),null);assert.deepEqual(core.costBadge(c),{tone:'free',label:'Gratis · AI facoltativa'});
 assert.ok(look.has(look.CARDS.negozio));assert.equal(core.best('prodotti per shopify'),'negozio');
 const html=fs.readFileSync(path.join(root,'agency/crea.html'),'utf8'),js=fs.readFileSync(path.join(root,'agency/crea.js'),'utf8');
 assert.match(html,/<script src="\/lib\/product-studio\.js"><\/script><script src="\/lib\/shop-studio\.js"><\/script>/);assert.ok(html.indexOf('zip-lite.js')<html.indexOf('shop-studio.js'));
 assert.match(js,/shop:\{global:'RadixShopStudio'/);assert.match(js,/S\.shopStudio\(\{project,projectName:current\.name,projectId:current\.id,workspace:ws,rt/);
 assert.match(fs.readFileSync(path.join(root,'shell/crea.css'),'utf8'),/\.ns-studio/);
 const lib=fs.readFileSync(path.join(root,'lib/shop-studio.js'),'utf8');assert.doesNotMatch(lib,/fetch\(/,'no store API');
});
