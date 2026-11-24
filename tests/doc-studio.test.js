'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const D=require('../lib/doc-studio.js'),PS=require('../lib/print-studio.js'),PX=require('../lib/pptx-lite.js'),ZIP=require('../lib/zip-lite.js'),cs=require('../lib/copy-studio.js');
const root=path.join(__dirname,'..');

// «Forno Bianchi», kit «Bottega di quartiere»: the texts as the Studio Testi saves them (copy-studio toMarkdown).
const LOGO='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 96"><circle cx="48" cy="48" r="30" fill="#2F5D50"/><path d="M30 52 Q48 20 66 52 Z" fill="#E3B448"/><text x="92" y="60" font-size="34" font-weight="700" fill="#1C1C1E">Forno Bianchi</text></svg>';
const PROFILE={identityKit:{brand:'Forno Bianchi',direction:'Bottega di quartiere',palette:[{role:'primary',hex:'#2F5D50'},{role:'secondary',hex:'#A0522D'},{role:'accent',hex:'#E3B448'},{role:'dark',hex:'#1C1C1E'},{role:'light',hex:'#F7F5F0'}],fonts:[{heading:'Fraunces',body:'Inter'}],logo:LOGO}};
const brand=PS.brandOf(PROFILE,'Forno Bianchi');
const CONTACTS={address:'Via Roma 12, 24121 Bergamo',phone:'035 123 4567',email:'info@fornobianchi.it',website:'www.fornobianchi.it'};
const OPT={project:{name:'Forno Bianchi'},answers:{},date:'2026-10-21'},DATE=new Date('2026-10-21T10:00:00Z');
const SECTIONS='### Chi siamo\nSiamo un forno di quartiere a Bergamo. Ogni notte impastiamo farine macinate a pietra e lievito madre.\n\nLa bottega è piccola, ma il banco è sempre pieno.\n\n### Il nostro pane\nPane a lievitazione naturale.\n- Pagnotta di semola rimacinata\n- Filone ai cereali\n\n### Dolci\nCrostate e biscotti di frolla.\n\n### Per uffici e locali\nConsegniamo a bar e uffici. Il listino è da verificare.';
const BROCHURE=cs.toMarkdown('brochure',{title:'Il pane di quartiere',sections:{cover:'Forno Bianchi\nIl pane di quartiere, ogni mattina',pages:SECTIONS,close:'Ti aspettiamo in bottega.'},issues:[]},OPT);
const DECK=cs.toMarkdown('presentazione',{title:'Per i negozi',sections:{slides:'Slide 1 · Forno Bianchi per i negozi\n- Pane fresco ogni mattina\nNota: Presentarsi.\n\nSlide 2 · Chi siamo\n- Forno di quartiere a Bergamo\n- Lievito madre\nNota: Raccontare la storia\nin poche frasi.\n\nSlide 3 · Cosa offriamo\nNota: Introdurre i prodotti.\n\nSlide 4 · I prodotti\n- Pagnotta\n- Filone\n- Segale\n- Focaccia\n- Grissini\n- Crostate\n\nSlide 5 · Grazie\n- info@fornobianchi.it'},issues:[]},OPT);
const SHEET=cs.toMarkdown('scheda',{title:'Essenziale',sections:{intro:'Pagnotta a lievitazione naturale.',specs:['Nome prodotto: Pagnotta di semola','Codice: FB-PS-01','Peso: 1,05 kg','Lievitazione: 24 ore','Allergeni: glutine','Shelf life: n.d.'],missing:['Valori nutrizionali','Certificazioni']},issues:[{kind:'number',text:'22'}]},OPT);
const ascii=b=>Buffer.from(b).toString('latin1');
const textsOf=doc=>doc.pages.map(p=>p.items.filter(i=>i.t==='text').map(i=>i.s));
// The PDF reader of tests/print-studio.test.js: header, xref offsets at their objects, trailer, /Count = page objects.
function parsePdf(bytes){const s=ascii(bytes);assert.ok(s.startsWith('%PDF-1.4\n'));assert.ok(s.trimEnd().endsWith('%%EOF'));
 const sx=+/startxref\n(\d+)\n%%EOF\s*$/.exec(s)[1];assert.equal(s.slice(sx,sx+5),'xref\n');const [,first,count]=/^xref\n(\d+) (\d+)\n/.exec(s.slice(sx)).map(Number);assert.equal(first,0);
 s.slice(sx).split('\n').slice(3,2+count).forEach((r,i)=>{const off=+r.slice(0,10);assert.equal(s.slice(off,off+String(i+1).length+6),(i+1)+' 0 obj')});
 const n=+/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(s)[1];assert.equal((s.match(/\/Type \/Page \/Parent/g)||[]).length,n);
 return {s,count:n,media:[...s.matchAll(/\/MediaBox \[([^\]]+)\]/g)].map(m=>m[1].split(' ').map(Number))}}
const model=(type,md)=>D.modelFrom(type,md,{name:'Forno Bianchi',contacts:CONTACTS});

test('the Studio Testi markdown becomes the model: cover, sections (### inside ##), closing, checks apart',()=>{
 const p=D.parseSource(BROCHURE);assert.equal(p.kind,'brochure');assert.equal(p.title,'Il pane di quartiere');assert.equal(p.plain,false);
 const m=model('profile',BROCHURE);assert.equal(m.title,'Forno Bianchi');assert.equal(m.subtitle,'Il pane di quartiere, ogni mattina');
 assert.deepEqual(m.sections.map(s=>s.title),['Chi siamo','Il nostro pane','Dolci','Per uffici e locali']);
 assert.match(m.sections[0].text,/^Siamo un forno[\s\S]*\n\nLa bottega/);assert.equal(m.closing.text,'Ti aspettiamo in bottega.');
 assert.deepEqual(m.contacts,['Via Roma 12, 24121 Bergamo','035 123 4567','info@fornobianchi.it','www.fornobianchi.it']);
 assert.equal(D.emptyReason(m),'');
 const withChecks=D.parseSource('# Scheda tecnica · X\n\n## Caratteristiche tecniche\n\n- Peso: 2 kg\n\n## Da controllare\n\n- Il numero «2» non compare\n\n---\nNota finale');
 assert.deepEqual(withChecks.checks,['Il numero «2» non compare']);assert.ok(!withChecks.groups.some(g=>/controllare|nota/i.test(g.title+g.text)));
});

test('a pasted plain text: short lines without a full stop are section titles; blocks and bullets',()=>{
 const m=model('brochure','Chi siamo\nUn forno di quartiere.\n\nI prodotti\n- Pane\n- Dolci\n\nUn paragrafo senza titolo che continua la sezione.');
 assert.deepEqual(m.sections.map(s=>s.title),['Chi siamo','I prodotti']);assert.match(m.sections[1].text,/Pane[\s\S]*continua la sezione/);
 assert.deepEqual(D.blocks('Primo\nsecondo rigo\n\n- uno\n2) due\n#### Sotto\nfine').map(b=>[b.kind,b.text,b.mark||'']),[['p','Primo secondo rigo',''],['bullet','uno','•'],['bullet','due','2.'],['sub','Sotto',''],['p','fine','']]);
 assert.match(D.emptyReason(model('brochure','')),/sezioni/);
});

test('slides: «Slide n · Titolo», bullets, multi-line notes; layouts by content; closing kept, not duplicated',()=>{
 const m=model('presentazione',DECK);
 assert.deepEqual(m.slides.map(s=>[s.layout,s.title]),[['title','Forno Bianchi per i negozi'],['content','Chi siamo'],['section','Cosa offriamo'],['two','I prodotti'],['closing','Grazie']]);
 assert.equal(m.slides[1].note,'Raccontare la storia in poche frasi.');assert.deepEqual(m.slides[1].bullets,['Forno di quartiere a Bergamo','Lievito madre']);
 const added=model('presentazione','Slide 1 · Titolo\n- sotto\n\nSlide 2 · Punto\n- a');assert.equal(added.slides.at(-1).layout,'closing');assert.deepEqual(added.slides.at(-1).bullets,Object.values(CONTACTS).slice(0,0).concat(['Via Roma 12, 24121 Bergamo','035 123 4567','info@fornobianchi.it','www.fornobianchi.it']));
 // a brochure text as a presentation: sentences split (never rewritten), at most 4 bullets a slide, the section as notes
 const fromBrochure=model('presentazione',BROCHURE);assert.equal(fromBrochure.slides[0].layout,'title');
 const chi=fromBrochure.slides.find(s=>s.title==='Chi siamo');assert.deepEqual(chi.bullets,['Siamo un forno di quartiere a Bergamo.','Ogni notte impastiamo farine macinate a pietra e lievito madre.','La bottega è piccola, ma il banco è sempre pieno.']);
 assert.match(chi.note,/Siamo un forno/);assert.equal(fromBrochure.slides.at(-1).title,'Grazie');
});

test('technical sheet: data rows kept exactly as written; missing values stay empty and print «da verificare»',()=>{
 const m=model('scheda',SHEET);assert.equal(m.product,'Pagnotta di semola');assert.equal(m.intro,'Pagnotta a lievitazione naturale.');
 assert.deepEqual(m.specs.map(r=>[r.label,r.value]),[['Nome prodotto','Pagnotta di semola'],['Codice','FB-PS-01'],['Peso','1,05 kg'],['Lievitazione','24 ore'],['Allergeni','glutine'],['Shelf life',''],['Valori nutrizionali',''],['Certificazioni','']]);
 for(const v of ['','-','—','?','n.d.','N/D','da verificare','TBD','da definire'])assert.ok(D.isMissing(v),v);for(const v of ['0','1 kg','no'])assert.ok(!D.isMissing(v),v);
 assert.deepEqual(m.checks,['Il numero «22» non compare nei dati che hai scritto: verificalo o toglilo.']);
 for(const style of ['editorial','bold','minimal']){const doc=D.layoutSheet(m,brand,{style,date:DATE}),t=textsOf(doc).flat();
  assert.equal(doc.pages.length,1,style);assert.equal(t.filter(x=>x===D.MISSING).length,3,style+': one «da verificare» per missing row');
  assert.ok(t.includes('1,05 kg')&&!t.some(x=>/1\.05|1,1 kg/.test(x)),'value as written');assert.deepEqual(doc.missing,['Shelf life','Valori nutrizionali','Certificazioni']);
  // nothing invented: every number on the page comes from the input (or the date, page counter and title)
  const input=SHEET+' 21/10/2026 1/1 300';for(const x of t)for(const n of x.match(/\d+(?:[.,]\d+)*/g)||[])assert.ok(input.includes(n),style+': number '+n);
  assert.deepEqual(doc.warnings.filter(w=>w.kind==='safe'),[],style)}
 // too many rows: at most 2 pages, the excluded rows said
 const big={...m,specs:Array.from({length:60},(_,i)=>({label:'Voce '+i,value:'Valore lungo '.repeat(6)+i}))},d=D.layoutSheet(big,brand,{});
 assert.equal(d.pages.length,2);assert.ok(d.warnings.some(w=>w.kind==='overflow'&&/voci escluse/.test(w.text)));assert.ok(textsOf(d)[1].includes('Caratteristica'),'header row repeated');
});

test('A4 layout: cover first, back last, page numbers on inner pages, index from 6 pages, all inside the safe area',()=>{
 const m=model('profile',BROCHURE);
 for(const style of D.STYLES.map(s=>s.id)){const doc=D.layoutDoc(m,brand,{style,date:DATE});
  assert.equal(doc.pages[0].kind,'cover');assert.equal(doc.pages.at(-1).kind,'back');assert.ok(doc.pages.every(p=>p.w===210&&p.h===297));
  doc.pages.forEach((p,i)=>{if(p.kind==='cover'||p.kind==='back')return;assert.ok(p.items.some(it=>it.label==='Numero di pagina'&&it.s===String(i+1)),style+' page '+(i+1))});
  assert.deepEqual(doc.warnings.filter(w=>w.kind==='safe'||w.kind==='overflow'||w.kind==='glyph'),[],style);
  const all=textsOf(doc).flat().join(' ');for(const s of m.sections)assert.ok(all.includes(s.title),s.title);assert.ok(all.includes('Pagnotta di semola rimacinata'))}
 // one section per page → more pages → table of contents, its page numbers where the sections start
 const doc=D.layoutDoc(m,brand,{style:'editorial',breaks:true});assert.ok(doc.pages.length>=6);assert.equal(doc.pages[1].kind,'toc');assert.ok(doc.toc);
 const toc=doc.pages[1].items.filter(i=>i.label==='Indice · pagina').map(i=>+i.s);assert.deepEqual(toc,doc.starts.map(s=>s.page+1));
 toc.forEach((n,i)=>assert.ok(doc.pages[n-1].items.some(it=>it.s===m.sections[i].title),'section '+i+' on page '+n));
 assert.ok(!D.layoutDoc(m,brand,{}).toc,'short documents have no index');
 // multiple of 4 on request, with «Note» pages before the back cover
 const p4=D.layoutDoc(m,brand,{breaks:true,pad4:true});assert.equal(p4.pages.length%4,0);assert.equal(p4.pages.at(-2).kind,'notes');assert.ok(!p4.warnings.some(w=>w.kind==='pages'));
 assert.ok(doc.pages.length%4===0||doc.warnings.some(w=>w.kind==='pages'));
 // a long section continues on the next page
 const long={...m,sections:[{title:'Storia',text:Array.from({length:40},(_,i)=>'Paragrafo '+i+' con un testo abbastanza lungo da occupare due righe nella colonna del documento.').join('\n\n')}]};
 const ld=D.layoutDoc(long,brand,{style:'bold'});assert.ok(ld.pages.filter(p=>p.kind==='section').length>=2);assert.ok(textsOf(ld).flat().some(t=>/segue/.test(t)));
 assert.ok(textsOf(ld).flat().includes('Paragrafo 39 con un testo abbastanza lungo da occupare due righe nella'.split(' ').slice(0,1)[0])||textsOf(ld).flat().some(t=>t.startsWith('Paragrafo 39')),'nothing lost');
});

test('covers: logo and colours, photo, title only; photo cover without a photo falls back and says so',()=>{
 const m=model('profile',BROCHURE),photo={src:'data:image/jpeg;base64,AAAA',w:3000,h:2000};
 for(const style of ['editorial','bold','minimal']){
  const withPhoto=D.layoutDoc(m,brand,{style,cover:'photo',photos:{cover:photo}});assert.equal(withPhoto.cover,'photo');assert.ok(withPhoto.pages[0].items.some(i=>i.t==='image'&&i.photo));
  const none=D.layoutDoc(m,brand,{style,cover:'photo'});assert.equal(none.cover,'brand');assert.ok(none.warnings.some(w=>w.kind==='photo'));
  const t=D.layoutDoc(m,brand,{style,cover:'title'});assert.equal(t.cover,'title');assert.ok(t.pages[0].items.some(i=>i.label==='Titolo'))}
 // a logo whose colours vanish on the brand colour sits on a light plate, never as a one-colour blob
 const bold=D.layoutDoc(m,brand,{style:'bold'}),logo=bold.pages[0].items.find(i=>i.t==='logo');assert.equal(logo.svg,LOGO);assert.ok(bold.pages[0].items.some(i=>i.t==='rect'&&i.fill==='#FFFFFF'));
 // no kit: neutral palette and the name as wordmark
 const plain=D.layoutDoc(m,PS.brandOf({},'Forno Bianchi'),{});assert.ok(plain.pages[0].items.some(i=>i.wordmark));
});

test('three proposals: the same text in Editoriale, Deciso and Minimal, really different',()=>{
 for(const type of ['profile','presentazione','scheda']){const ps=D.proposals(model(type,type==='profile'?BROCHURE:type==='scheda'?SHEET:DECK),brand,{});
  assert.deepEqual(ps.map(p=>p.title),['Editoriale','Deciso','Minimal']);const sig=ps.map(p=>JSON.stringify(p.doc.pages[0].items.filter(i=>i.t==='rect').map(i=>[i.x,i.y,i.w,i.h,i.fill])));
  assert.equal(new Set(sig).size,3,type);for(const p of ps)assert.ok(PS.previewSvg(p.doc,0,{guides:false}).startsWith('<svg'))}
});

test('PDF: screen version valid (A4, every page), print version passes the PDF/X-1a checker of the Studio Stampa',()=>{
 const m=model('profile',BROCHURE),doc=D.layoutDoc(m,brand,{breaks:true});
 const web=parsePdf(D.pdfWeb(doc,{date:DATE}));assert.equal(web.count,doc.pages.length);assert.ok(web.media.every(b=>Math.abs(b[2]-595.276)<.01&&Math.abs(b[3]-841.89)<.01));
 assert.match(web.s,/\/Title \(Company profile · Forno Bianchi\)|\/Title \(Company profile \x95 Forno Bianchi\)|\/Title \(Company profile \\267 Forno Bianchi\)/);assert.match(web.s,/\/Producer \(RADIX Studio Documenti\)/);
 for(const style of ['editorial','bold','minimal']){const d=D.layoutDoc(m,brand,{style}),bytes=D.pdfPrint(d,{date:DATE});assert.deepEqual(PS.checkPdf(bytes),[],style);parsePdf(bytes)}
 const sheet=D.layoutSheet(model('scheda',SHEET),brand,{});assert.deepEqual(PS.checkPdf(D.pdfPrint(sheet,{date:DATE})),[]);assert.equal(parsePdf(D.pdfWeb(sheet)).count,1);
 const slides=D.render(model('presentazione',DECK),brand,{}),sp=parsePdf(D.pdfWeb(slides));assert.equal(sp.count,5);assert.ok(sp.media.every(b=>Math.abs(b[2]-720)<.01&&Math.abs(b[3]-405)<.01),'16:9, 10 × 5.625 in');
});

test('slide engine: text fitted in its box (shrinks, then warns), 40-word rule, notes carried',()=>{
 const s=D.fitText({t:'text',x:0,y:0,w:100,h:20,paras:[{text:'parola '.repeat(60),size:20}]});assert.ok(s.scale<1);assert.equal(s.fits,false);
 const ok=D.fitText({t:'text',x:0,y:0,w:200,h:40,paras:[{text:'Breve',size:20}]});assert.equal(ok.scale,1);assert.ok(ok.fits);
 const m=model('presentazione',DECK);m.slides[1].bullets.push('parola '.repeat(50));const deck=D.deckFrom(m,brand,{});
 assert.ok(deck.warnings.some(w=>w.kind==='words'&&/^Slide 2: \d+ parole/.test(w.text)));assert.equal(deck.slides[1].notes,'Raccontare la storia in poche frasi.');
 for(const style of ['editorial','bold','minimal'])for(const sl of D.deckFrom(model('presentazione',DECK),brand,{style}).slides)for(const x of sl.shapes){assert.ok(x.x>=-.01&&x.y>=-.01&&x.x+x.w<=D.SLIDE.w+.01&&x.y+x.h<=D.SLIDE.h+.01,style+' '+sl.label+' '+(x.name||x.t));if(x.t==='text')assert.ok(x.fits,style+' '+sl.label+' '+x.name)}
});

test('PPTX: a real PresentationML package; every part typed, every relationship target present, texts and notes editable',()=>{
 const deck=D.deckFrom(model('presentazione',DECK),brand,{style:'editorial'}),png=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13]);
 const bytes=D.pptxDeck(deck,brand,{logo:{type:'png',data:png,w:640,h:192}},{date:DATE}),r=PX.inspect(bytes);
 assert.deepEqual(r.problems,[]);assert.equal(r.slides,5);assert.equal(r.parts[0],'[Content_Types].xml');
 assert.deepEqual(r.layouts,['Titolo','Contenuto','Sezione','Due colonne','Chiusura']);
 assert.deepEqual(r.texts[1].slice(0,3),['Chi siamo','Forno di quartiere a Bergamo','Lievito madre']);assert.ok(r.texts[3].includes('Grissini'));assert.ok(r.texts[4].includes('info@fornobianchi.it'));
 assert.equal(r.notes[0],'Presentarsi.');assert.equal(r.notes[1],'Raccontare la storia in poche frasi.');assert.deepEqual(r.media,['ppt/media/image1.png']);
 const files=Object.fromEntries(ZIP.unzip(bytes).map(f=>[f.name,new TextDecoder().decode(f.data)]));
 assert.match(files['ppt/presentation.xml'],/<p:sldSz cx="9144000" cy="5143500"\/>/);
 assert.match(files['ppt/theme/theme1.xml'],/<a:accent1><a:srgbClr val="2F5D50"\/><\/a:accent1>/);assert.match(files['ppt/theme/theme1.xml'],/<a:majorFont><a:latin typeface="Fraunces"\/>/);assert.match(files['ppt/theme/theme1.xml'],/<a:minorFont><a:latin typeface="Inter"\/>/);
 assert.match(files['ppt/slides/slide1.xml'],/<p:ph type="ctrTitle"\/>/);assert.match(files['ppt/slides/slide4.xml'],/<p:ph sz="half" idx="2"\/>/);assert.match(files['ppt/slides/slide2.xml'],/<a:buChar char="•"\/>/);
 assert.match(files['ppt/slides/slide1.xml'],/r:embed="rId3"/);assert.match(files['ppt/slides/_rels/slide1.xml.rels'],/Target="\.\.\/media\/image1\.png"/);
 for(const [n,x] of Object.entries(files))if(/^ppt\/slides\/slide\d+\.xml$/.test(n))assert.ok(!(x.match(/<p:pic>[\s\S]*?<\/p:pic>/g)||[]).some(p=>/<a:t>/.test(p))&&/<a:t>/.test(x),n+': text is text, not a picture');
 assert.match(files['[Content_Types].xml'],/<Override PartName="\/ppt\/notesSlides\/notesSlide5\.xml" ContentType="application\/vnd\.openxmlformats-officedocument\.presentationml\.notesSlide\+xml"\/>/);
 // without logo bytes the name is an editable wordmark text box
 const plain=PX.inspect(D.pptxDeck(deck,brand,{},{date:DATE}));assert.deepEqual(plain.problems,[]);assert.deepEqual(plain.media,[]);assert.ok(plain.texts[0].includes('Forno Bianchi'));
 for(const style of ['bold','minimal'])assert.deepEqual(PX.inspect(D.pptxDeck(D.deckFrom(model('presentazione',DECK),brand,{style}),brand,{})).problems,[]);
});

test('PPTX checker: it catches a missing part, a broken XML, an untyped part',()=>{
 const good=ZIP.unzip(PX.build({slides:[{layout:'content',shapes:[{t:'text',ph:'title',x:10,y:10,w:100,h:20,paras:[{text:'A & <b>',size:20}]}],notes:'n'}]}));
 assert.deepEqual(PX.inspect(ZIP.zip(good)).problems,[]);
 const without=good.filter(f=>f.name!=='ppt/slideLayouts/slideLayout3.xml');assert.ok(PX.inspect(ZIP.zip(without)).problems.some(p=>/slideLayout3\.xml/.test(p)));
 const broken=good.map(f=>f.name==='ppt/slides/slide1.xml'?{name:f.name,data:new TextDecoder().decode(f.data).replace('</p:sld>','')}:f);assert.ok(PX.inspect(ZIP.zip(broken)).problems.some(p=>/slide1\.xml/.test(p)));
 const extra=good.concat({name:'ppt/strano.bin',data:'x'});assert.ok(PX.inspect(ZIP.zip(extra)).problems.some(p=>/senza content type/.test(p)));
 assert.equal(PX.xmlText('a\u0001<b>&'),'a&lt;b&gt;&amp;');assert.throws(()=>PX.build({slides:[]}),/Nessuna slide/);
});

test('zip, Markdown and «Salva nel progetto» (Art Director thread, no binaries)',async()=>{
 const m=model('scheda',SHEET),files=D.bundle(m,{pdf:new Uint8Array([1]),print:new Uint8Array([2])},{style:'bold',pages:1});
 assert.deepEqual(files.map(f=>f.name),['scheda-tecnica-pagnotta-di-semola.pdf','scheda-tecnica-pagnotta-di-semola-tipografia.pdf','scheda-tecnica-pagnotta-di-semola-testo.md','LEGGIMI.txt']);
 assert.equal(ZIP.unzip(ZIP.zip(files)).length,4);const md=files[2].data;assert.match(md,/\| Shelf life \| da verificare \|/);assert.match(md,/Impaginazione: Deciso · 1 pagine/);
 assert.deepEqual(D.bundle(model('presentazione',DECK),{pptx:new Uint8Array([1]),pdf:new Uint8Array([1])}).map(f=>f.name),['presentazione-forno-bianchi.pptx','presentazione-forno-bianchi-slide.pdf','presentazione-forno-bianchi-testo.md','LEGGIMI.txt']);
 let saved=null;const ws={bind:()=>({load:async()=>({schemaVersion:1,conversations:{'art-director':[{role:'user',content:'prima'}]}}),save:async d=>{saved=d;return {revision:2}}})};
 const p=model('profile',BROCHURE);p.sections[0].photo={src:'data:image/jpeg;base64,AAAA'};await D.saveToProject(ws,'forno',p,{style:'minimal',cover:'title',pages:4,by:'Anna'});
 const th=saved.conversations['art-director'];assert.equal(th.length,3);assert.equal(th[2].agent,'art-director');assert.equal(th[2].source,'doc-studio');
 assert.match(th[2].content,/---DOCUMENTO: Documento · Company profile · Forno Bianchi---\n# Documento · Company profile · Forno Bianchi/);assert.deepEqual(th[2].document.style,'minimal');assert.equal(th[2].document.pages,4);
 assert.ok(!JSON.stringify(saved).includes('data:image'),'no photos in the project');
 assert.deepEqual(D.sourcesFor('scheda',[{title:'Brochure e company profile · A'},{title:'Scheda tecnica · B'}]).map(c=>c.kind),['scheda','brochure']);
});

test('the panel: card in «Stampa e documenti», studio wired with project, kit and save; scripts loaded; no AI',()=>{
 const core=require('../agency/crea-core.js'),c=core.card('documenti');assert.equal(c.group,'Stampa e documenti');assert.equal(c.inline,'docs');assert.match(c.cost,/^Nessuna chiamata AI/);
 const js=fs.readFileSync(path.join(root,'agency/crea.js'),'utf8');assert.match(js,/docs:\{global:'RadixDocStudio'[^}]*agent:'art-director'\}/);
 assert.match(js,/S\.docStudio\(\{project,profile:current\.profile,projectName:current\.name,projectId:current\.id,workspace:ws,agentsUrl:/);
 const html=fs.readFileSync(path.join(root,'agency/crea.html'),'utf8'),i=k=>html.indexOf(k);
 assert.ok(i('/lib/zip-lite.js')<i('/lib/pptx-lite.js')&&i('/lib/print-studio.js')<i('/lib/doc-studio.js')&&i('/lib/pptx-lite.js')<i('/lib/doc-studio.js')&&i('/lib/doc-studio.js')<i('/agency/crea.js'));
 const src=fs.readFileSync(path.join(root,'lib/doc-studio.js'),'utf8')+fs.readFileSync(path.join(root,'lib/pptx-lite.js'),'utf8');
 assert.ok(!/RadixAgents|\.reply\(|fetch\(|https?:\/\/(?!schemas\.openxmlformats|purl\.org|www\.w3\.org)/.test(src),'no AI call, no network');
 const css=fs.readFileSync(path.join(root,'shell/crea.css'),'utf8');assert.match(css,/\.cr-panel \.doc-studio \.ds-styles\{display:grid/);assert.match(css,/@media \(max-width:640px\)\{\n \.cr-panel \.doc-studio/);
 assert.equal(require('../agency/marketing-look.js').CARDS.documenti,'pages');
});
