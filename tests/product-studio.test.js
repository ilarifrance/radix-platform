'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const P=require('../lib/product-studio.js'),Z=require('../lib/zip-lite.js'),CSV=require('../sales/crm-csv-core.js');
const root=path.join(__dirname,'..');
const SAMPLE=P.sampleSheet(),MAP=P.detectMapping(SAMPLE.headers,SAMPLE.rows),SET={brand:'Forno Aurora'};
const PRODUCTS=P.toProducts(SAMPLE.rows,MAP,SET).products;
const byId=id=>PRODUCTS.find(p=>p.id===id);
// The shape a well-behaved AI returns for a product: only facts of its row.
const goodItem=p=>({chiave:p.key,titolo:'Forno Aurora '+p.name+(p.weight?' '+p.weight:''),descrizione:p.name+' di Forno Aurora.'+(p.weight?' Confezione da '+p.weight+'.':'')+'\n\nCategoria: '+p.category+'.',punti:['Categoria '+p.category,p.weight?'Peso '+p.weight:'Dal Forno Aurora'],meta:p.name+' di Forno Aurora.',alt:p.name+' su un tavolo'});

// A tiny XML reader for the tests: well-formedness (balanced tags, escaped text) and the items' g: fields.
function readXml(xml){const tags=/<\?[^>]*\?>|<!--[\s\S]*?-->|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>/g,stack=[],items=[];let m,last=0,cur=null,text='';
 while((m=tags.exec(xml))){const between=xml.slice(last,m.index);if(/<|&(?!(?:amp|lt|gt|quot|apos|#\d+);)/.test(between))throw Error('unescaped text: '+between.slice(0,40));text+=between;last=tags.lastIndex;
  if(m[0].startsWith('<?')||m[0].startsWith('<!--'))continue;const [,close,name,attrs,self]=m;
  if(close){const open=stack.pop();if(open!==name)throw Error('mismatched </'+name+'> for <'+open+'>');if(name==='item'){items.push(cur);cur=null}else if(cur&&name.startsWith('g:'))cur[name.slice(2)]=text.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');text='';continue}
  if(!self){stack.push(name);text='';if(name==='item')cur={};if(name==='rss')assert.match(attrs,/xmlns:g="http:\/\/base\.google\.com\/ns\/1\.0"/)}}
 if(stack.length)throw Error('unclosed: '+stack.join(','));if(/\S/.test(xml.slice(last)))throw Error('trailing text');return items}

test('columns: Italian, Shopify and Google headers are matched, links and GTINs also by their content',()=>{
 assert.deepEqual({id:MAP.id,title:MAP.title,description:MAP.description,price:MAP.price,availability:MAP.availability,brand:MAP.brand,gtin:MAP.gtin,image:MAP.image,link:MAP.link,category:MAP.category,weight:MAP.weight,material:MAP.material,size:MAP.size},
  {id:'Codice',title:'Nome prodotto',description:'Descrizione',price:'Prezzo',availability:'Disponibilità',brand:'Marca',gtin:'EAN',image:'Immagine',link:'Link prodotto',category:'Categoria',weight:'Peso',material:'Materiale',size:'Dimensioni'});
 assert.equal(MAP.mpn,'');assert.equal(MAP.salePrice,'');assert.deepEqual(P.missingColumns(MAP),[]);
 const shop=P.detectMapping(['Handle','Title','Body (HTML)','Vendor','Variant SKU','Variant Price','Variant Barcode','Image Src','Prezzo scontato']);
 assert.equal(shop.title,'Title');assert.equal(shop.description,'Body (HTML)');assert.equal(shop.brand,'Vendor');assert.equal(shop.id,'Variant SKU');assert.equal(shop.price,'Variant Price');assert.equal(shop.gtin,'Variant Barcode');assert.equal(shop.image,'Image Src');assert.equal(shop.salePrice,'Prezzo scontato');
 const g=P.detectMapping(['id','title','description','link','image_link','availability','price','sale_price','brand','gtin','mpn','condition','google_product_category','product_type','color','size','material']);
 assert.deepEqual([g.id,g.link,g.image,g.salePrice,g.googleCategory,g.category,g.condition,g.color],['id','link','image_link','sale_price','google_product_category','product_type','condition','color']);
 // unnamed columns: found by what is inside them
 const rows=[{A:'P1',B:'Pane',C:'https://x.it/img/p1.jpg',D:'https://x.it/p/p1',E:'8034560003708'},{A:'P2',B:'Torta',C:'https://x.it/img/p2.png',D:'https://x.it/p/p2',E:'8034560007409'}];
 const c=P.detectMapping(['A','B','C','D','E'],rows);assert.equal(c.image,'C');assert.equal(c.link,'D');assert.equal(c.gtin,'E');
 assert.deepEqual(P.missingColumns(c),['ID / codice','Titolo / nome','Prezzo']);
 const used=Object.values(P.detectMapping(['Codice','Codice EAN','Nome','Prezzo','Stato disponibilità'])).filter(Boolean);assert.equal(new Set(used).size,used.length,'each header once');
 assert.equal(P.detectMapping(['Codice EAN','Codice']).gtin,'Codice EAN');assert.equal(P.detectMapping(['Codice EAN','Codice']).id,'Codice');
});

test('values: prices, availability, condition and the GTIN check digit',()=>{
 assert.equal(P.parsePrice('4,50'),4.5);assert.equal(P.parsePrice('€ 1.234,50'),1234.5);assert.equal(P.parsePrice('12.90 EUR'),12.9);assert.equal(P.parsePrice('su richiesta'),null);assert.equal(P.parsePrice(7),7);
 assert.equal(P.feedPrice(4.5,'EUR'),'4.50 EUR');assert.equal(P.feedPrice(null,'EUR'),'');
 assert.equal(P.availabilityOf('Disponibile'),'in_stock');assert.equal(P.availabilityOf('in stock'),'in_stock');assert.equal(P.availabilityOf('12'),'in_stock');assert.equal(P.availabilityOf('0'),'out_of_stock');
 assert.equal(P.availabilityOf('esaurito'),'out_of_stock');assert.equal(P.availabilityOf('preordine'),'preorder');assert.equal(P.availabilityOf('su ordinazione'),'backorder');assert.equal(P.availabilityOf('chiedere in negozio'),'');
 assert.equal(P.conditionOf('Nuovo'),'new');assert.equal(P.conditionOf('ricondizionato'),'refurbished');assert.equal(P.conditionOf('usato'),'used');assert.equal(P.conditionOf('boh'),'');
 assert.ok(P.gtinCheck('8034560003708').ok,'EAN-13');assert.ok(P.gtinCheck('036000291452').ok,'UPC-A');assert.ok(P.gtinCheck('96385074').ok,'EAN-8');assert.ok(P.gtinCheck('10012345678902').ok,'GTIN-14');assert.ok(P.gtinCheck('978-0-306-40615-7').ok,'ISBN with dashes');
 assert.match(P.gtinCheck('8034560040704').why,/cifra di controllo errata \(dovrebbe finire con 3\)/);assert.ok(P.gtinCheck('8034560040703').ok);
 assert.match(P.gtinCheck('12345').why,/8, 12, 13 o 14/);assert.match(P.gtinCheck('80345600037A8').why,/solo cifre/);assert.match(P.gtinCheck('2000000000008').why,/uso interno/);assert.match(P.gtinCheck('00000000').why,/zeri/);
});

test('products: one per row with a stable key, defaults only in empty cells, the row\'s facts without links',()=>{
 assert.equal(PRODUCTS.length,30);assert.equal(new Set(PRODUCTS.map(p=>p.key)).size,30,'two rows share AUR-006 but not the key');
 const p=byId('AUR-001');assert.equal(p.key,'R2');assert.equal(p.priceValue,4.5);assert.equal(p.currency,'EUR');assert.equal(p.availability,'in_stock');assert.equal(p.condition,'new');assert.deepEqual(p.defaults,['condition']);
 assert.ok(p.facts.some(([k,v])=>k==='Peso'&&v==='1 kg'));assert.ok(!p.facts.some(([,v])=>/^https?:/.test(v)),'links are not facts');
 const t=byId('AUR-029');assert.equal(t.brand,'Forno Aurora');assert.ok(t.defaults.includes('brand'));assert.ok(t.facts.some(([k,v])=>k==='Marca'&&v==='Forno Aurora'));
 assert.equal(byId('AUR-007'),undefined);assert.equal(PRODUCTS.filter(x=>x.id==='AUR-006').length,2);assert.equal(byId('AUR-020').priceValue,null);
 const r=P.toProducts([{N:'A',P:'1'},{N:'',P:'2'},{N:'B',P:'3,50 $',S:'si'}],{title:'N',price:'P',availability:'S'},{availability:'out_of_stock'});
 assert.equal(r.skipped,1);assert.equal(r.products[0].availability,'out_of_stock','default when the column is empty');assert.equal(r.products[1].currency,'USD');assert.equal(r.products[1].availability,'in_stock');
 assert.equal(P.toProducts(SAMPLE.rows,MAP,SET,{limit:10}).cut,20);
 const samples=P.pickSamples(PRODUCTS);assert.equal(samples.length,3);assert.equal(new Set(samples.map(s=>s.category)).size,3,'three categories');
});

test('grounding: numbers, claims, materials, colours and sizes not in the row are flagged and the product is «da verificare»',()=>{
 const p=byId('AUR-004');
 assert.deepEqual(P.groundingFlags('Focaccia genovese di Forno Aurora, 300 g, con olio extravergine di oliva.',p),[]);
 const f=P.groundingFlags('Focaccia genovese da 500 g, biologica e senza glutine, in vaschetta di vetro, taglia XL.',p).map(x=>x.kind+':'+x.text);
 assert.ok(f.includes('number:500'));assert.ok(f.includes('claim:biologico'));assert.ok(f.includes('claim:senza glutine'));assert.ok(f.includes('material:vetro'));assert.ok(f.includes('size:XL'));
 assert.deepEqual(P.groundingFlags('Lievitazione di 36 ore con lievito madre.',byId('AUR-005')),[],'in the row: no flag');
 assert.deepEqual(P.groundingFlags('Scatola di latta con baci di dama.',byId('AUR-009')),[],'material in the row');
 assert.deepEqual(P.groundingFlags('Un pane bianco e soffice.',byId('AUR-001')),[],'colours only checked when the sheet has a colour column');
 const shirt={key:'R2',name:'Maglia',brand:'X',color:'blu',facts:[['Nome','Maglia'],['Colore','blu'],['Taglia','M']]};
 assert.deepEqual(P.groundingFlags('Maglia rossa, taglia L.',shirt).map(x=>x.kind+':'+x.text),['colour:rosso','size:L']);
 const it=P.itemFrom({chiave:p.key,titolo:'Focaccia genovese Forno Aurora 500 g',descrizione:'Focaccia da 500 g.',punti:['Bio'],meta:'Focaccia.',alt:'Focaccia'},p,'essenziale');
 assert.equal(it.status,'verify');assert.ok(it.flags.length>=2);
 it.verified=true;P.finishItem(it,p);assert.equal(it.status,'ok','the person checked the data');
 const ok=P.itemFrom(goodItem(p),p,'essenziale');assert.equal(ok.status,'ok');assert.deepEqual(ok.flags,[]);
 assert.match(P.flagText({kind:'number',text:'500'}),/«500» non è nella riga/);
});

test('title rules: at most 150, no promotions, prices, «!» or ALL CAPS; long texts are trimmed and noted',()=>{
 const kinds=t=>P.titleIssues(t,{brand:'Forno Aurora'}).map(i=>i.kind);
 assert.deepEqual(kinds('Forno Aurora Panettone classico 1 kg'),[]);
 assert.deepEqual(kinds('Forno Aurora Tavoletta fondente 70% 100 g'),[],'a percentage of cocoa is not a promotion');
 assert.ok(kinds('PANETTONE AL CIOCCOLATO OFFERTA -20% SPEDIZIONE GRATIS').includes('promo'));assert.ok(kinds('PANETTONE AL CIOCCOLATO').includes('caps'));
 assert.ok(kinds('Forno Aurora Panettone a 28,00 €').includes('promo'));assert.ok(kinds('Forno Aurora Panettone!').includes('promo'));assert.ok(kinds('Forno Aurora Panettone sconto 20%').includes('promo'));
 assert.deepEqual(kinds('Panettone classico'),['brand']);assert.ok(P.titleIssues('Panettone',{brand:'Forno Aurora'})[0].soft);
 assert.deepEqual(P.capsWords('LAVAZZA Qualità Rossa','LAVAZZA'),[],'a brand written in capitals is fine');
 const p=byId('AUR-001'),long=P.itemFrom({chiave:p.key,titolo:'Forno Aurora Pagnotta '+'di semola rimacinata '.repeat(10),descrizione:'Pagnotta. '.repeat(600),punti:['x'.repeat(260)],meta:'m '.repeat(100),alt:'a '.repeat(80)},p,'tecnico');
 assert.ok([...long.title].length<=150);assert.ok([...long.description].length<=5000);assert.ok([...long.meta].length<=155);assert.ok([...long.alt].length<=125);assert.ok(long.bullets[0].length<=200);
 assert.equal(long.issues.filter(i=>i.kind==='length').length,4);
 assert.equal(P.buildTitle(byId('AUR-026')),'Forno Aurora Panettone al cioccolato offerta -20% spedizione gratis 1 kg','capitals tamed, the promotion stays for the checks');
 assert.equal(P.buildTitle(byId('AUR-001')),'Forno Aurora Pagnotta di semola rimacinata 1 kg');
});

test('prompts: three styles on three products in one call, then one call per batch, only the rows\' facts',()=>{
 const samples=P.pickSamples(PRODUCTS),s=P.stylesPrompt(samples,{tone:'Caldo',channel:'google'},{name:'Forno Aurora — Torino'});
 for(const x of P.STYLES)assert.ok(s.includes(x.label));for(const p of samples)assert.ok(s.includes('CHIAVE: '+p.key));
 assert.match(s,/usa SOLO i dati scritti nella sua scheda/);assert.match(s,/massimo 150 caratteri/);assert.match(s,/Google Shopping/);assert.match(s,/caldo e vicino/);assert.match(s,/"stili"/);
 assert.ok(!/https?:\/\//.test(s),'no links in the prompt');assert.match(s,/- Peso: /);
 const b=P.batchPrompt(PRODUCTS.slice(0,10),'racconto',{channel:'amazon'});assert.equal((b.match(/### CHIAVE: /g)||[]).length,10);assert.match(b,/Stile scelto: racconto/);assert.match(b,/5 punti elenco/);assert.match(b,/"prodotti"/);
 assert.throws(()=>P.stylesPrompt([],{}),/carica il foglio/);assert.throws(()=>P.batchPrompt([],'tecnico',{}),/Nessun prodotto/);
 assert.deepEqual(P.normalizeSettings({tone:'boh',channel:'x',currency:'usd',condition:'used',availability:'nope'}),{tone:'Semplice',channel:'site',language:'it',brand:'',currency:'USD',condition:'used',availability:'in_stock',googleCategory:'',shopUrl:''});
});

test('parsing: by key, by code, by position; fenced JSON; missing products; the three styles by name',()=>{
 const list=PRODUCTS.slice(0,3),reply='Ecco:\n```json\n'+JSON.stringify({prodotti:[goodItem(list[1]),goodItem(list[0])]})+'\n```';
 const r=P.parseBatch(reply,list,'essenziale');assert.deepEqual([...r.items.keys()].sort(),[list[0].key,list[1].key].sort());assert.deepEqual(r.missing,[list[2].key]);
 const it=r.items.get(list[0].key);assert.equal(it.style,'essenziale');assert.ok(it.title.startsWith('Forno Aurora'));assert.equal(it.bullets.length,2);
 const byCode=P.parseBatch(JSON.stringify([{codice:'AUR-001',titolo:'Forno Aurora Pagnotta di semola 1 kg',descrizione:'Pagnotta di semola rimacinata.'}]),list,'tecnico');assert.ok(byCode.items.has('R2'));
 const dup=PRODUCTS.filter(p=>p.id==='AUR-006'),amb=P.parseBatch(JSON.stringify({prodotti:[{codice:'AUR-006',titolo:'Pandoro',descrizione:'Pandoro.'}]}),dup.concat(list),'tecnico');assert.equal(amb.items.size,0,'a repeated code is not used to match');
 const pos=P.parseBatch(JSON.stringify({prodotti:list.map(p=>({titolo:'T '+p.name,descrizione:'D '+p.name}))}),list,'tecnico');assert.equal(pos.items.size,3);assert.equal(pos.items.get(list[2].key).title,'T '+list[2].name);
 assert.equal(P.parseBatch('non è JSON',list).items.size,0);
 const html=P.itemFrom({chiave:'R2',titolo:'**Pagnotta**',descrizione:'<p>Uno</p><p>Due</p>',punti:'- uno\n- due'},list[0]);assert.equal(html.title,'Pagnotta');assert.equal(html.description,'Uno\n\nDue');assert.deepEqual(html.bullets,['uno','due']);
 const samples=P.pickSamples(PRODUCTS),stylesReply=JSON.stringify({stili:[{stile:'Tecnico',prodotti:samples.map(goodItem)},{stile:'Essenziale',prodotti:samples.map(goodItem)},{stile:'Racconto',prodotti:samples.map(goodItem).slice(0,2)}]});
 const st=P.parseStyles(stylesReply,samples);assert.deepEqual(st.map(s=>s.style),['essenziale','racconto','tecnico']);assert.equal(st[1].items.size,2);assert.equal(st[0].items.get(samples[0].key).style,'essenziale');
 assert.deepEqual(P.parseStyles('{}',samples),[]);
});

test('duplicates: the same description on two products is noted on both',()=>{
 const a=P.itemFrom({titolo:'A',descrizione:'Un prodotto buono del nostro forno, fatto ogni giorno con cura e passione.'},PRODUCTS[0]),b=P.itemFrom({titolo:'B',descrizione:'Un prodotto buono del nostro forno, fatto ogni giorno con cura e passione.'},PRODUCTS[1]),c=P.itemFrom(goodItem(PRODUCTS[2]),PRODUCTS[2]);
 assert.equal(P.markDuplicates([a,b,c]),2);assert.ok(a.issues.some(i=>i.kind==='duplicate'));assert.ok(!c.issues.some(i=>i.kind==='duplicate'));
 b.description='Altro testo, tutto diverso dal primo, per un altro prodotto del forno.';assert.equal(P.markDuplicates([a,b,c]),0);assert.ok(!a.issues.some(i=>i.kind==='duplicate'));
});

test('batches: 27 products in 10+10+7, pause between batches, resume, a failed batch goes on, a fatal error stops, retry',async()=>{
 const items=new Map(P.pickSamples(PRODUCTS).map(p=>[p.key,{}]));const plan=P.planBatches(PRODUCTS,items);
 assert.deepEqual(plan.map(b=>b.length),[10,10,7]);assert.ok(!plan.flat().some(k=>items.has(k)),'samples already written are skipped');assert.deepEqual(P.planBatches(PRODUCTS,items,{size:20}).map(b=>b.length),[20,7]);
 const run=P.newRun(plan),seen=[];let n=0;
 const call=async keys=>{seen.push(keys.length);n++;if(n===1)run.paused=true;if(n===3)throw Error('rete')};
 assert.equal(await P.runBatches(run,{call}),'paused');assert.deepEqual(P.runCounts(run),{total:3,done:1,error:0,todo:2,products:27,productsDone:10});
 run.paused=false;assert.equal(await P.runBatches(run,{call}),'done');assert.deepEqual(seen,[10,10,7]);assert.equal(P.runCounts(run).error,1);assert.equal(run.batches[2].error,'rete');
 assert.equal(P.retryFailed(run),1);assert.equal(await P.runBatches(run,{call:async()=>{}}),'done');assert.equal(P.runCounts(run).done,3);
 const r2=P.newRun([['a'],['b'],['c']]);const fatal=Object.assign(Error('Credito API esaurito'),{fatal:true});let k=0;
 assert.equal(await P.runBatches(r2,{call:async()=>{if(++k===2)throw fatal}}),'stopped');assert.deepEqual(r2.batches.map(b=>b.status),['done','error','todo']);assert.ok(P.FATAL.test(fatal.message));
 const updates=[];await P.runBatches(P.newRun([['x']]),{call:async()=>{},onUpdate:r=>updates.push(r.batches[0].status)});assert.deepEqual(updates.slice(0,2),['running','done']);
});

test('feed validator: the main Merchant Center rules, per product and in a summary',()=>{
 const rows=P.feedRows(PRODUCTS,new Map()),check=P.validateFeed(rows),of=id=>check.items.filter(x=>x.id===id),err=(x,f)=>x.issues.filter(i=>i.level==='error'&&i.field===f).map(i=>i.msg);
 assert.equal(check.summary.total,30);assert.equal(check.summary.ready,false);
 assert.deepEqual(of('AUR-006').map(x=>err(x,'id').length),[1,1],'both rows with the repeated id');assert.match(err(of('AUR-006')[0],'id')[0],/la riga 8/);
 assert.match(err(of('AUR-011')[0],'gtin')[0],/cifra di controllo errata/);assert.match(err(of('AUR-014')[0],'link')[0],/http/);assert.match(err(of('AUR-017')[0],'image_link')[0],/mancante/);
 assert.match(err(of('AUR-020')[0],'price')[0],/«su richiesta» non valido/);assert.match(err(of('AUR-023')[0],'availability')[0],/«chiedere in negozio» non riconosciuta/);
 assert.match(err(of('AUR-026')[0],'title')[0],/promozioni/);assert.ok(of('AUR-026')[0].issues.some(i=>i.field==='title'&&i.level==='warning'&&/MAIUSCOLE/.test(i.msg))===false,'buildTitle tamed the capitals');
 assert.ok(of('AUR-029')[0].issues.some(i=>i.field==='identifier_exists'&&i.level==='warning'));assert.ok(of('AUR-029')[0].issues.some(i=>i.field==='brand'&&/predefinita/.test(i.msg)));
 assert.ok(of('AUR-006')[1].issues.some(i=>i.field==='availability'&&/availability_date/.test(i.msg)),'preorder needs a date');
 assert.ok(check.summary.fields.length&&check.summary.fields[0].errors>=check.summary.fields[1].errors,'fields sorted by errors');
 // a clean product passes without remarks
 const items=new Map([[byId('AUR-001').key,P.itemFrom({...goodItem(byId('AUR-001')),descrizione:'Pagnotta di semola rimacinata di Forno Aurora: crosta croccante e mollica gialla, profumata. Confezione da 1 kg in sacchetto di carta.'},byId('AUR-001'),'essenziale')]]);
 const one=P.validateFeed(P.feedRows([byId('AUR-001')],items));assert.deepEqual(one.items[0].issues,[]);assert.equal(one.summary.ready,true);assert.equal(one.summary.ok,1);
 const base={key:'k',row:2,id:'X1',title:'Marca Prodotto',description:'Una descrizione lunga abbastanza per non avere avvisi, con tutti i dati utili al cliente.',link:'https://x.it/p',image_link:'https://x.it/p.jpg',availability:'in_stock',price:'10.00 EUR',condition:'new',brand:'Marca',gtin:'8034560003708',mpn:'',identifier_exists:'',_p:{defaults:[]}};
 const e=over=>P.validateRow({...base,...over},{}).filter(i=>i.level==='error').map(i=>i.field);
 assert.deepEqual(e({}),[]);assert.deepEqual(e({price:'0.00 EUR'}),['price']);assert.deepEqual(e({price:'10.00 XYZ'}),['price']);assert.deepEqual(e({sale_price:'12.00 EUR'}),['sale_price']);
 assert.deepEqual(e({id:'x'.repeat(51)}),['id']);assert.deepEqual(e({title:'a '.repeat(80)}),['title']);assert.deepEqual(e({description:'a'.repeat(5001)}),['description']);assert.deepEqual(e({condition:'nuovo'}),['condition']);
 assert.deepEqual(e({brand:''}),['brand']);assert.deepEqual(e({link:'www.x.it'}),['link']);assert.deepEqual(e({image_link:'',link:''}),['link','image_link']);assert.deepEqual(e({availability:''}),['availability']);
 assert.deepEqual(e({id:'',title:'',description:''}),['id','title','description']);
});

test('TSV and XML: the feed in both formats, optional columns only when used, everything escaped',()=>{
 const items=new Map([[PRODUCTS[0].key,P.itemFrom({...goodItem(PRODUCTS[0]),descrizione:'Prima riga & seconda < terza\tcon tab.\n\nSecondo paragrafo "virgolette".'},PRODUCTS[0],'essenziale')]]);
 const rows=P.feedRows(PRODUCTS,items),tsv=P.toTsv(rows),lines=tsv.trimEnd().split('\n'),head=lines[0].split('\t');
 assert.deepEqual(head,['id','title','description','link','image_link','availability','price','condition','brand','gtin','identifier_exists','product_type','size','material']);
 assert.equal(lines.length,31);for(const l of lines)assert.equal(l.split('\t').length,head.length);
 const first=Object.fromEntries(head.map((h,i)=>[h,lines[1].split('\t')[i]]));assert.equal(first.price,'4.50 EUR');assert.equal(first.availability,'in_stock');assert.equal(first.description,'Prima riga & seconda < terza con tab. Secondo paragrafo "virgolette".');
 assert.ok(!head.includes('mpn')&&!head.includes('sale_price')&&!head.includes('color'),'unused optional columns left out');
 const xml=P.toXml(rows,{title:'Prodotti Forno & Co',link:'https://www.fornoaurora.it/'});assert.match(xml,/^<\?xml version="1\.0" encoding="UTF-8"\?>\n<rss version="2\.0" xmlns:g="http:\/\/base\.google\.com\/ns\/1\.0">/);
 const parsed=readXml(xml);assert.equal(parsed.length,30);assert.equal(parsed[0].id,'AUR-001');assert.equal(parsed[0].price,'4.50 EUR');assert.equal(parsed[0].description,'Prima riga & seconda < terza\tcon tab.\n\nSecondo paragrafo "virgolette".');
 assert.equal(parsed.find(x=>x.id==='AUR-029').identifier_exists,'no');assert.equal(parsed.find(x=>x.id==='AUR-029').gtin,undefined,'empty values are left out');assert.match(xml,/<title>Prodotti Forno &amp; Co<\/title>/);
 assert.ok(!/[\u0000-\u0008]/.test(P.toXml([{...rows[0],title:'Ctrl\u0007 char'}])),'control characters removed');assert.equal(readXml(P.toXml([])).length,0);
});

test('files for the site: generic CSV, WooCommerce, Shopify, report, readme and the zip',()=>{
 const p=byId('AUR-001'),items=new Map([[p.key,P.itemFrom(goodItem(p),p,'essenziale')]]),rows=P.feedRows(PRODUCTS,items),check=P.validateFeed(rows);
 const sheet=P.sheetCsv(rows);assert.ok(sheet.startsWith('﻿id,nome,titolo_google,descrizione,descrizione_html,punti_chiave,meta_description,alt_immagine,stato,da_verificare,link,immagine\r\n'));
 const parsed=CSV.parse(sheet.replace(/^﻿/,''));assert.equal(parsed.rows.length,30);assert.equal(parsed.rows[0].stato,'ok');assert.equal(parsed.rows[1].stato,'da generare');assert.match(parsed.rows[0].descrizione_html,/^<p>Pagnotta di semola rimacinata di Forno Aurora\. Confezione da 1 kg\.<\/p><p>Categoria: Pane\.<\/p><ul><li>Categoria Pane<\/li>/);
 assert.equal(parsed.rows[0].punti_chiave,'Categoria Pane | Peso 1 kg');
 const woo=CSV.parse(P.wooCsv(rows).replace(/^﻿/,''));assert.deepEqual(woo.headers,['SKU','Name','Short description','Description']);assert.equal(woo.rows[0].SKU,'AUR-001');assert.equal(woo.rows[0].Name,'Pagnotta di semola rimacinata');
 const sh=CSV.parse(P.shopifyCsv(rows).replace(/^﻿/,''));assert.deepEqual(sh.headers,['Handle','Title','Body (HTML)','SEO Title','SEO Description']);assert.equal(sh.rows[0].Handle,'pagnotta-di-semola-rimacinata');assert.ok(sh.rows[0]['SEO Title'].length<=70);
 const evil=P.sheetCsv([{...rows[1],id:'=HYPERLINK("x")'}]);assert.match(evil,/\n"'=HYPERLINK\(""x""\)"/,'formula kept as text');
 const rep=CSV.parse(P.reportCsv(check).replace(/^﻿/,''));assert.deepEqual(rep.headers,['id','riga','livello','campo','problema']);assert.ok(rep.rows.some(r=>r.campo==='gtin'&&r.livello==='errore'));
 const files=Z.unzip(P.exportZip(rows,check,{name:'Forno Aurora',date:'2026-10-22',styleLabel:'Essenziale'}));
 assert.deepEqual(files.map(f=>f.name),Object.values(P.FILES));const readme=new TextDecoder().decode(files.find(f=>f.name==='LEGGIMI.txt').data);
 for(const col of ['titolo_google','descrizione_html','punti_chiave','meta_description','alt_immagine','da_verificare'])assert.ok(readme.includes(col),col);
 assert.match(readme,/WooCommerce → Prodotti → Importa/);assert.match(readme,/Shopify → Prodotti → Importa/);assert.match(readme,/non carica nulla/);assert.match(readme,/stile: Essenziale/);
 assert.equal(P.zipName('Forno Aurora'),'schede-feed-forno-aurora.zip');
});

test('saved in the project: productSheets in the agents document, other keys kept, reopened with the checks',async()=>{
 const p=byId('AUR-004'),items=new Map([[p.key,P.itemFrom({chiave:p.key,titolo:'Forno Aurora Focaccia genovese 300 g',descrizione:'Focaccia da 500 g.'},p,'racconto')]]);
 const rec=P.savedRecord({fileName:SAMPLE.name,sheet:SAMPLE,mapping:MAP,settings:SET,styleId:'racconto',items},{by:'Anna',at:'2026-10-22T10:00:00Z'});
 assert.equal(rec.id,'ps-20261022100000');assert.equal(rec.rows.length,30);assert.equal(rec.headers.length,SAMPLE.headers.length);assert.equal(rec.items.length,1);assert.equal(rec.style,'racconto');
 class ConflictError extends Error{}let stored={conversations:{copywriter:[1]},newsletters:{items:[1]},adCreatives:{items:[2]},gbp:{listings:[]},siteAudit:{x:1},prefs:{a:1}},conflicts=1;
 const ws={ConflictError,bind:()=>({load:async()=>JSON.parse(JSON.stringify(stored)),save:async d=>{if(conflicts-->0)throw new ConflictError('x');stored=JSON.parse(JSON.stringify(d))}})};
 const s=await P.saveToProject(ws,'forno',rec);assert.equal(s.items.length,1);
 assert.deepEqual(stored.conversations,{copywriter:[1]});assert.deepEqual(stored.newsletters,{items:[1]});assert.deepEqual(stored.adCreatives,{items:[2]});assert.deepEqual(stored.siteAudit,{x:1});assert.deepEqual(stored.prefs,{a:1});
 await P.saveToProject(ws,'forno',{...rec,fileName:'nuovo.csv'});assert.equal(stored.productSheets.items.length,1,'same id replaced');assert.equal(stored.productSheets.items[0].fileName,'nuovo.csv');
 for(let i=0;i<4;i++)await P.saveToProject(ws,'forno',{...rec,id:'ps-'+i});assert.equal(stored.productSheets.items.length,3,'only the last 3');
 const back=P.fromRecord(rec);assert.equal(back.products.length,30);assert.equal(back.style,'racconto');assert.equal(back.items.get(p.key).status,'verify','flags recomputed against the row');assert.equal(back.items.get(p.key).flags[0].text,'500');
 assert.deepEqual(P.readStore({productSheets:'boh'}),{schemaVersion:1,items:[]});
 const big=new Map(PRODUCTS.map(x=>[x.key,{key:x.key,title:'t',description:'x'.repeat(16000),bullets:[]}]));
 assert.throws(()=>P.savedRecord({fileName:'a',sheet:SAMPLE,mapping:MAP,settings:SET,styleId:'tecnico',items:big}),/scarica lo zip/);
 await assert.rejects(()=>P.saveToProject(null,'x',rec),/Archivio del progetto non disponibile/);
 const page=fs.readFileSync(path.join(root,'agents-page.js'),'utf8');
 assert.match(page,/if\(d\.productSheets\)out\.productSheets=d\.productSheets;/);assert.match(page,/if\(d\.newsletters\)out\.newsletters=d\.newsletters;/);
 assert.match(page,/data\.siteAudit=fresh\.siteAudit;data\.newsletters=fresh\.newsletters;data\.productSheets=fresh\.productSheets;/);assert.match(page,/data\.newsletters=fresh\.newsletters;data\.productSheets=fresh\.productSheets;data\.siteAudit=fresh\.siteAudit;data\.seoResults/);
});

test('a whole run with a fake AI: styles, choice, batches, edits; only the confirmed calls',async()=>{
 const calls=[];const fake=async prompt=>{calls.push(prompt);const keys=[...prompt.matchAll(/### CHIAVE: (R\d+)/g)].map(m=>m[1]),list=keys.map(k=>PRODUCTS.find(p=>p.key===k));
  if(/"stili"/.test(prompt))return {text:JSON.stringify({stili:P.STYLES.map(s=>({stile:s.label,prodotti:list.map(goodItem)}))})};
  return {text:JSON.stringify({prodotti:list.map(p=>p.id==='AUR-013'?{...goodItem(p),descrizione:'Torta di nocciole bio da 800 g.'}:goodItem(p))})}};
 const samples=P.pickSamples(PRODUCTS),styles=P.parseStyles((await fake(P.stylesPrompt(samples,SET))).text,samples);assert.equal(styles.length,3);
 const items=new Map(styles[1].items);const run=P.newRun(P.planBatches(PRODUCTS,items));assert.equal(run.batches.length,3);
 await P.runBatches(run,{call:async keys=>{const list=keys.map(k=>PRODUCTS.find(p=>p.key===k)),r=P.parseBatch((await fake(P.batchPrompt(list,'racconto',SET))).text,list,'racconto');for(const [k,it] of r.items)items.set(k,it)}});
 assert.equal(calls.length,4,'1 for the styles + 3 batches');assert.equal(items.size,30);
 const torta=items.get(byId('AUR-013').key);assert.equal(torta.status,'verify');assert.deepEqual(torta.flags.map(f=>f.kind+':'+f.text).sort(),['claim:biologico','number:800']);
 torta.description='Torta di nocciole Piemonte IGP, 600 g.';torta.edited=true;P.finishItem(torta,byId('AUR-013'));assert.equal(torta.status,'ok','fixed by hand');
 const check=P.validateFeed(P.feedRows(PRODUCTS,items));assert.ok(!check.items.some(x=>x.issues.some(i=>i.field==='description'&&i.level==='error')),'every product now has a description');
 assert.ok(check.summary.error>0,'the sheet mistakes are still there: ids, GTIN, links, price, availability');
});

test('the example sheet as CSV reads back the same through the CRM reader',()=>{
 const parsed=CSV.parse(P.sampleCsv());assert.deepEqual(parsed.headers,SAMPLE.headers);assert.equal(parsed.rows.length,30);assert.deepEqual(parsed.rows[25],SAMPLE.rows[25]);
 assert.deepEqual(P.detectMapping(parsed.headers,parsed.rows),MAP);
});

test('the panel card, the icon and the page wiring',()=>{
 const core=require('../agency/crea-core.js'),look=require('../agency/marketing-look.js'),c=core.card('schede');
 assert.equal(c.group,'Web e annunci');assert.equal(c.inline,'feed');assert.equal(core.linkFor(c,'forno'),null);assert.match(c.cost,/una ogni 10 prodotti/);assert.match(c.cost,/con conferma/);assert.ok(look.has(look.CARDS.schede));
 const html=fs.readFileSync(path.join(root,'agency/crea.html'),'utf8'),js=fs.readFileSync(path.join(root,'agency/crea.js'),'utf8');
 assert.match(html,/<script src="\/lib\/catalog-studio\.js"><\/script><script src="\/lib\/product-studio\.js"><\/script>/);assert.ok(html.indexOf('zip-lite.js')<html.indexOf('product-studio.js'));assert.ok(html.indexOf('crm-csv-core.js')<html.indexOf('product-studio.js'));
 assert.match(js,/feed:\{global:'RadixProductStudio'/);assert.match(js,/S\.productStudio\(\{project,projectName:current\.name,memoryScope,projectId:current\.id,workspace:ws/);
 const css=fs.readFileSync(path.join(root,'shell/crea.css'),'utf8');assert.match(css,/\.pf-studio/);assert.doesNotMatch(css,/\.pf-dialog/,'the shared RADIX confirmation replaces the own dialog');
 const lib=fs.readFileSync(path.join(root,'lib/product-studio.js'),'utf8');assert.match(lib,/function confirmCalls\(host,\{title,rows,note,ok\}\)\{return askConfirm\(\{title,facts:rows,cost:note/);assert.match(html,/<script src="\/lib\/radix-confirm\.js"><\/script>/);
});
