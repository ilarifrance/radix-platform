'use strict';
// Studio Stampa, PDF for the print shop: CMYK only, PDF/X-1a-style structure (OutputIntent FOGRA39, TrimBox/BleedBox,
// Trapped, GTS_PDFXVersion, /ID), total ink, text as outlines, images in CMYK at the dpi they need, three layouts for every
// format, roll-up and three-panel brochure geometry.
const test=require('node:test'),assert=require('node:assert/strict'),zlib=require('zlib');
const P=require('../lib/print-studio.js'),G=require('../lib/print-glyphs.js'),BP=require('../lib/brand-package.js');

const LOGO='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 96"><circle cx="48" cy="48" r="30" fill="#2F5D50"/><path d="M10 10 a20 10 0 1 0 40 0 Q 60 5 70 20 z" fill="#E3B448" opacity=".7"/><text x="92" y="60" font-size="34" font-weight="700" fill="#1C1C1E">Forno Bianchi</text></svg>';
const PROFILE={identityKit:{brand:'Forno Bianchi',palette:[{role:'primary',hex:'#2F5D50'},{role:'secondary',hex:'#A0522D'},{role:'accent',hex:'#E3B448'},{role:'dark',hex:'#1C1C1E'},{role:'light',hex:'#F7F5F0'}],fonts:[{heading:'Fraunces',body:'Inter'}],logo:LOGO}};
const VALUES={name:'Forno Bianchi',payoff:'Pane buono, ogni mattina',person:'Anna Bianchi',role:'Titolare',phone:'035 123 4567',email:'info@fornobianchi.it',website:'fornobianchi.it',address:'Via Roma 12, 24121 Bergamo',
 headline:'Apriamo in via Roma!',body:'Pane, focacce e dolci ogni mattina dalle 7.',cta:'Vieni sabato 12',vat:'Forno Bianchi srl · P. IVA 01234567890',flapTitle:'Chi siamo',flapText:'Tre generazioni di fornai.',
 p1Title:'Il pane',p1Text:'Lievito madre.',p2Title:'I dolci',p2Text:'Crostate.',p3Title:'Orari',p3Text:'Lun–Sab 7–19.',closing:'Ti aspettiamo!'};
const brand=P.brandOf(PROFILE),DATE=new Date(Date.UTC(2026,9,21));
const pt=mm=>Math.round(mm*72/25.4*1000)/1000;
const ascii=b=>Buffer.from(b).toString('latin1');
// Content streams only (not images, not glyph forms): the page drawing.
const contents=s=>[...s.matchAll(/<< \/Length (\d+) >>\nstream\n/g)].map(m=>s.substr(m.index+m[0].length,+m[1]));
const forms=s=>[...s.matchAll(/<< \/Type \/XObject \/Subtype \/Form [^\n]*\/Length (\d+) >>\nstream\n/g)].map(m=>s.substr(m.index+m[0].length,+m[1]));
// A tiny CMYK raster as prepareImages makes it in the browser.
function raster(w,h,dpi,rgba){const px=rgba||new Uint8Array(w*h*4).map((_,i)=>i%4===3?255:(i*53)%256),c=P.rgbaToCmyk(px);return {w,h,cmyk:new Uint8Array(zlib.deflateSync(c.data)),tac:c.tac,dpi}}
const withRasters=(doc,dpi=320)=>{for(const p of doc.pages)for(const it of p.items)if(it.photo)it.raster=raster(8,6,dpi);return doc};
const PHOTO={src:'data:image/jpeg;base64,AAAA',w:12000,h:9000};
function boxes(s){return [...s.matchAll(/\/Type \/Page \/Parent [^\n]*?\/MediaBox \[([^\]]+)\] \/BleedBox \[([^\]]+)\] \/TrimBox \[([^\]]+)\]/g)].map(m=>({media:m[1].split(' ').map(Number),bleed:m[2].split(' ').map(Number),trim:m[3].split(' ').map(Number)}))}

test('CMYK: the brand package formula, total ink, near-black as K100 for text and rich black for large areas, hand-set values win',()=>{
 for(const h of ['#2F5D50','#A0522D','#E3B448','#1C1C1E','#F7F5F0','#000000','#FFFFFF','#123456'])assert.deepEqual(P.cmykOf(h),BP.cmyk(h),h);
 assert.equal(P.tac([60,40,40,100]),240);assert.equal(P.tac([100,100,100,100]),400);assert.equal(P.INK_LIMIT,300);
 assert.deepEqual(P.inkFor('#1C1C1E','text'),[0,0,0,100],'small text: pure black only');
 assert.deepEqual(P.inkFor('#1C1C1E','area'),[60,40,40,100],'large dark area: rich black');
 assert.deepEqual(P.inkFor('#1C1C1E','area',{richBlack:false}),[0,0,0,100],'rich black off');
 assert.deepEqual(P.inkFor('#000000','line'),[0,0,0,100]);assert.deepEqual(P.inkFor('#2F5D50','area'),[49,0,14,64],'colours are not touched');
 assert.deepEqual(P.inkFor('#2F5D50','text',{overrides:{'#2F5D50':[80,20,55,40]}}),[80,20,55,40],'hand-set value');
 assert.deepEqual(P.overridesFrom(brand.palette,{primary:[80,20,55,40],accent:[1,2,'x',4]}),{'#2F5D50':[80,20,55,40]},'invalid values ignored');
 const inks=P.paletteInks(brand.palette,{overrides:{'#2F5D50':[80,20,55,40]}});assert.deepEqual(inks.find(c=>c.role==='primary'),{role:'primary',label:'Primario',hex:'#2F5D50',auto:[49,0,14,64],cmyk:[80,20,55,40],custom:true,tac:195});
 const doc=P.layout('biglietto',VALUES,brand),r=P.inkReport(doc);assert.ok(r.ok);assert.ok(r.max<=300);
 assert.ok(r.list.some(x=>x.hex==='#1C1C1E'&&x.use==='text'&&x.cmyk.join()==='0,0,0,100'),'the dark text as K100');
 const heavy=P.inkReport(doc,{overrides:{'#2F5D50':[100,100,100,100]}});assert.equal(heavy.ok,false);assert.equal(heavy.max,400);
 const pf=P.preflight(doc,{overrides:{'#2F5D50':[100,100,100,100]}});assert.equal(pf.ok,false);assert.match(pf.checks.find(c=>c.id==='ink').detail,/#2F5D50 400%/);
 assert.deepEqual(P.checkPdf(P.pdf(doc,{pdfx:true,cmyk:{overrides:{'#2F5D50':[100,100,100,100]}},date:DATE})),['Inchiostro totale al 400%: il limite è 300%.'],'the bytes are checked too');
});

test('print PDF: DeviceCMYK operators only (k/K), no rg/RG, no RGB space, no font, no transparency; registration marks',()=>{
 const doc=P.layout('biglietto',VALUES,brand),bytes=P.pdf(doc,{pdfx:true,date:DATE}),s=ascii(bytes),cs=contents(s);
 assert.equal(cs.length,2,'one content stream per page');
 for(const c of cs){assert.doesNotMatch(c,/(^|\s)(rg|RG|g|G|sc|scn|SC|SCN|cs|CS)(\s|$)/m);assert.match(c,/ k\b/);assert.doesNotMatch(c,/\bBT\b|\bTj\b/,'no text operators: outlines')}
 assert.match(cs[1],/^0\.49 0 0\.14 0\.64 k /m,'back: primary #2F5D50 as C49 M0 Y14 K64');
 assert.match(cs[0],/q 0 0 0 1 k 1 0 0 1 [\d.]+ [\d.]+ cm q 7\.5 0 0 7\.5 0 0 cm \/R80 Do Q/,'payoff in K100, «P» outline placed at 7.5 pt');
 assert.equal((s.match(/q 1 1 1 1 K 0\.25 w /g)||[]).length,16,'8 crop marks per page in registration colour');
 assert.doesNotMatch(s,/\/DeviceRGB|\/Font|\/FontFile|\/ExtGState|\/SMask|\/Group/);
 assert.deepEqual(P.checkPdf(bytes),[]);
 // the RGB writer is unchanged for the web and for the other studios
 const web=ascii(P.pdf(doc,{mode:'web'}));assert.match(web,/ rg /);assert.match(web,/\/BaseFont \/Helvetica/);assert.doesNotMatch(web,/OutputIntent/);
 assert.ok(P.checkPdf(P.pdf(doc,{mode:'print'})).length>0,'the RGB print file fails the check');
});

test('PDF/X-1a structure: OutputIntent GTS_PDFX FOGRA39, Info with Trapped and GTS_PDFXVersion, /ID, boxes in points',()=>{
 const s=ascii(P.pdf(P.layout('flyer',VALUES,brand),{pdfx:true,date:DATE}));
 assert.match(s,/^%PDF-1\.4\n/);
 assert.match(s,/<< \/Type \/OutputIntent \/S \/GTS_PDFX \/OutputConditionIdentifier \(FOGRA39\) \/OutputCondition \(Coated FOGRA39 \\\(ISO 12647-2:2004\\\)\) \/RegistryName \(http:\/\/www\.color\.org\) \/Info \(Coated FOGRA39 \\\(ISO 12647-2:2004\\\)\) >>/);
 const intent=/(\d+) 0 obj\n<< \/Type \/OutputIntent/.exec(s)[1];assert.match(s,new RegExp('1 0 obj\\n<< /Type /Catalog /Pages 2 0 R /OutputIntents \\['+intent+' 0 R\\] >>'));
 assert.doesNotMatch(s,/DestOutputProfile/,'no ICC profile embedded: registered condition by identifier');
 assert.match(s,/\/Title \(Flyer A5 \\267 Forno Bianchi \\267 tipografia\) \/Producer \(RADIX Studio Stampa\) \/Creator \(RADIX\) \/CreationDate \(D:20261021000000Z\) \/ModDate \(D:20261021000000Z\) \/Trapped \/False \/GTS_PDFXVersion \(PDF\/X-1:2003\) \/GTS_PDFXConformance \(PDF\/X-1a:2003\)/);
 assert.match(s,/trailer\n<< \/Size \d+ \/Root 1 0 R \/Info \d+ 0 R \/ID \[<([0-9A-F]{32})> <\1>\] >>/);
 const b=boxes(s)[0];assert.deepEqual(b.media,[0,0,166,228].map(pt));assert.deepEqual(b.bleed,[6,6,160,222].map(pt));assert.deepEqual(b.trim,[9,9,157,219].map(pt));
 assert.equal(P.PDFX.label,'pronto per la tipografia (PDF/X-1a, verifica preflight)');
 const again=ascii(P.pdf(P.layout('flyer',VALUES,brand),{pdfx:true,date:DATE}));assert.equal(/\/ID \[<(\w+)>/.exec(again)[1],/\/ID \[<(\w+)>/.exec(s)[1],'same document, same ID');
});

test('fonts: every text is vector outlines from the glyph forms (Helvetica metrics), the logo text too; missing glyphs are flagged',()=>{
 assert.equal(G.UPM,2048);for(let c=32;c<=126;c++){assert.ok(G.R[c]&&G.B[c],'glyph '+c)}for(const c of [0x80,0x92,0xAB,0xE0,0xE8,0xE9,0xEC,0xF2,0xF9,0xB7])assert.ok(G.R[c]&&G.B[c],'glyph '+c.toString(16));
 assert.ok(Math.abs(G.R[97][0]*1000/G.UPM-556)<1,'«a» advance matches Helvetica 556');assert.ok(Math.abs(G.B[65][0]*1000/G.UPM-722)<1);
 assert.equal(P.outlineOps('M0 0L10 0Q20 0 20 10Z'),'0 0 m\n10 0 l\n16.667 0 20 3.333 20 10 c\nh');
 const doc=P.layout('biglietto',VALUES,brand),s=ascii(P.pdf(doc,{pdfx:true,date:DATE})),fm=forms(s);
 assert.ok(fm.length>20,'one form per glyph used');assert.ok(fm.every(f=>/ f$/.test(f.replace(/\n/g,' '))),'each glyph is a filled path');
 assert.match(s,/\/Subtype \/Form \/BBox \[-2048 -2048 6144 4096\] \/Matrix \[0\.00048828125 0 0 0\.00048828125 0 0\]/);
 // «Hello» at 10 pt: glyphs placed at the Helvetica advances
 const one={...doc,pages:[{label:'T',w:50,h:20,folds:[],items:[{t:'text',x:5,y:10,s:'Hello',size:10,bold:false,fill:'#1C1C1E'}]}]},c=contents(ascii(P.pdf(one,{pdfx:true,date:DATE})))[0];
 const xs=[...c.matchAll(/q 10 0 0 10 ([\d.]+) 0 cm \/R(\d+) Do Q/g)].map(m=>[+m[1],+m[2]]);
 assert.deepEqual(xs.map(x=>x[1]),[72,101,108,108,111]);assert.deepEqual(xs.map(x=>x[0]),[0,7.22,12.78,15,17.22]);
 const logo=contents(s)[0].split('% logo')[1];assert.match(logo,/q 0 0 0 1 k 1 0 0 -1 92 60 cm\nq 34 0 0 34 0 0 cm \/B70 Do Q q 34 0 0 34 20\.774 0 cm \/B111 Do Q/,'logo wordmark as outlines, K100, flipped back up in the SVG space');
 assert.match(logo,/\n0 0\.14 0\.48 0\.09 k\n/,'logo leaf #E3B448 at 70 % flattened on the paper #F7F5F0 (#E9C87A), no transparency');
 assert.ok(P.preflight(P.layout('flyer',{...VALUES,headline:'Pane ✓'},brand)).checks.find(c=>c.id==='fonts').ok===false);
 assert.deepEqual(P.preflight(doc).checks.find(c=>c.id==='fonts'),{id:'fonts',label:'Font',ok:true,detail:'Testi convertiti in tracciati vettoriali: nessun font da incorporare.'});
});

test('images: effective dpi of a photo filling its box, warnings below 300 dpi (150 on the roll-up), CMYK conversion, no RGB in the print PDF',()=>{
 assert.equal(P.effectiveDpi({w:1000,h:1000},84.667,84.667),300);assert.equal(P.effectiveDpi({w:3000,h:1000},100,100),254,'cover: the short side decides');
 assert.equal(P.effectiveDpi({w:1748,h:2480},148,210),300,'A5 at 300 dpi');assert.equal(P.effectiveDpi(null,10,10),0);
 const small={src:'data:x',w:800,h:600},doc=P.layout('flyer',VALUES,brand,{photo:small}),rep=P.imagesReport(doc);
 assert.equal(rep.length,1);assert.equal(rep[0].label,'Foto');assert.ok(rep[0].dpi<300);assert.equal(rep[0].ok,false);
 const pf=P.preflight(doc);assert.equal(pf.ok,false);assert.match(pf.checks.find(c=>c.id==='dpi').detail,/«Foto» \(Fronte\) a \d+ dpi alla misura di stampa: servono almeno 300 dpi/);
 assert.ok(P.preflight(P.layout('flyer',VALUES,brand,{photo:PHOTO})).ok,'a big photo passes');
 const roll=P.layout('rollup',VALUES,brand,{photo:{src:'data:x',w:5200,h:3500}});assert.equal(roll.dpi,150);const rr=P.imagesReport(roll)[0];assert.ok(rr.dpi>=150&&rr.dpi<300);assert.ok(rr.ok,'roll-up: 150 dpi are enough');
 assert.equal(P.layout('biglietto',VALUES,brand,{photo:PHOTO}).pages.flatMap(p=>p.items).some(i=>i.photo),false,'no photo on the card');
 // pixels → CMYK
 const px=new Uint8Array([255,255,255,255,0,0,0,255,255,0,0,255,0,0,0,0,10,20,30,128]),c=P.rgbaToCmyk(px);
 assert.deepEqual([...c.data.slice(0,16)],[0,0,0,0,0,0,0,255,0,255,255,0,0,0,0,0],'white, black, red, transparent on white');assert.equal(c.tac,200);
 assert.deepEqual([...P.rgbaToCmyk(new Uint8Array([0,0,0,0]),'#000000').data],[0,0,0,255],'flattened on the colour behind');
 // in the PDF
 const withPhoto=P.layout('flyer',VALUES,brand,{photo:PHOTO});assert.throws(()=>P.pdf(withPhoto,{pdfx:true}),/Foto non preparata/);
 withRasters(withPhoto);const s=ascii(P.pdf(withPhoto,{pdfx:true,date:DATE}));assert.match(s,/\/Subtype \/Image \/Width 8 \/Height 6 \/ColorSpace \/DeviceCMYK \/BitsPerComponent 8 \/Filter \/FlateDecode/);assert.deepEqual(P.checkPdf(s),[]);
 withPhoto.pages[0].items.find(i=>i.photo).raster={w:4,h:2,jpeg:new Uint8Array([0xFF,0xD8,0xFF,0xD9])};assert.throws(()=>P.pdf(withPhoto,{pdfx:true}),/Immagine in RGB/);
 assert.match(P.previewSvg(withPhoto,0),/preserveAspectRatio="xMidYMid slice" href="data:image\/jpeg;base64,AAAA"/);
});

test('three layouts for every format: valid PDF/X files, all prepress checks green, with and without a photo',()=>{
 assert.deepEqual(P.VARIANTS.map(v=>v.id),['classic','bold','minimal']);
 for(const f of P.FORMATS)for(const v of P.VARIANTS)for(const photo of [null,PHOTO]){const tag=f.id+'/'+v.id+(photo?'/foto':'');
  const doc=withRasters(P.layout(f.id,VALUES,brand,{variant:v.id,photo}));assert.equal(doc.variant,v.id);assert.deepEqual(doc.warnings,[],tag);
  const pf=P.preflight(doc);assert.ok(pf.ok,tag+': '+pf.checks.filter(c=>!c.ok).map(c=>c.detail).join(' '));assert.deepEqual(pf.checks.map(c=>c.id),['bleed','safe','cmyk','ink','dpi','fonts']);
  const bytes=P.pdf(doc,{pdfx:true,date:DATE}),s=ascii(bytes);assert.deepEqual(P.checkPdf(bytes),[],tag);
  const sx=+/startxref\n(\d+)\n%%EOF\s*$/.exec(s)[1];assert.equal(s.slice(sx,sx+5),'xref\n',tag);
  const bx=boxes(s);assert.equal(bx.length,f.pages.length,tag);for(const b of bx){assert.deepEqual(b.trim,[9,9,9+f.w,9+f.h].map(pt),tag);assert.deepEqual(b.bleed,[6,6,12+f.w,12+f.h].map(pt),tag)}}
 const variants=P.VARIANTS.map(v=>JSON.stringify(P.layout('flyer',VALUES,brand,{variant:v.id}).pages[0].items.map(i=>[i.t,Math.round(i.x),Math.round(i.y)])));
 assert.equal(new Set(variants).size,3,'three different layouts');
 assert.equal(P.layout('flyer',{...VALUES,variant:'bold'},brand).variant,'bold','the variant can come with the values');assert.equal(P.layout('flyer',VALUES,brand,{variant:'boh'}).variant,'classic');
 const bold=P.layout('flyer',VALUES,brand,{variant:'bold'}).pages[0].items.find(i=>i.t==='logo');assert.match(bold.svg,/^<svg fill="#F7F5F0"/);assert.doesNotMatch(bold.svg,/#2F5D50|#E3B448/,'logo in one colour on the brand colour');
 assert.equal(P.monoSvg('<svg viewBox="0 0 1 1" fill="red"><rect style="fill:#123;stroke:none" stroke="blue"/><path fill="none"/></svg>','#ffffff'),'<svg viewBox="0 0 1 1" fill="#FFFFFF"><rect style="fill:#FFFFFF;stroke:none" stroke="#FFFFFF"/><path fill="none"/></svg>');
});

test('bleed and safe-area checks: a background stopping at the trim and text in the roll-up base are flagged',()=>{
 const doc=P.layout('flyer',VALUES,brand);doc.pages[0].items.push({t:'rect',x:0,y:100,w:148,h:110,fill:'#2F5D50'});
 const bp=P.bleedProblems(doc);assert.equal(bp.length,1);assert.match(bp[0],/un fondo colorato tocca il taglio a sinistra, a destra, in basso senza arrivare all’abbondanza/);
 assert.equal(P.preflight(doc).checks[0].ok,false);
 const roll=P.layout('rollup',VALUES,brand);assert.deepEqual(roll.warnings,[]);roll.pages[0].items.push({t:'text',x:100,y:1950,s:'Sotto',size:60,bold:false,fill:'#1C1C1E',label:'Prova'});
 const w=P.safeArea(roll);assert.equal(w.length,1);assert.match(w[0].text,/^Fronte: «Prova» scende nei 100 mm in basso che entrano nella base del roll-up: non si vedrà/);
});

test('roll-up 850 × 2000 mm: page size, 100 mm base kept for background only, preview shows the base, notes say it',()=>{
 const f=P.format('rollup');assert.deepEqual([f.w,f.h,f.hidden.bottom,f.dpi,f.margin],[850,2000,100,150,40]);
 const s=P.pageSize('rollup','print');assert.deepEqual([s.w,s.h,s.bleedW,s.bleedH],[868,2018,856,2006]);assert.ok(s.hPt<14400,'within the PDF page size limit');
 for(const v of P.VARIANTS){const doc=P.layout('rollup',VALUES,brand,{variant:v.id}),p=doc.pages[0];assert.deepEqual(p.hidden,{bottom:100});
  const texts=p.items.filter(i=>i.t==='text'||i.t==='logo');assert.ok(texts.every(i=>(i.t==='text'?i.y+i.size*.207/P.MM:i.y+i.h)<=1900-4),v.id+': nothing in the base');
  assert.ok(p.items.some(i=>i.t==='rect'&&i.y+i.h>=2000+P.BLEED-1e-6&&i.x<=-P.BLEED&&i.x+i.w>=850+P.BLEED),v.id+': the background runs through the base to the bleed')}
 const svg=P.previewSvg(P.layout('rollup',VALUES,brand),0);assert.match(svg,/<rect x="0" y="1900" width="850" height="100" fill="#e5484d" fill-opacity="\.18"/);assert.match(svg,/Base: 100 mm non visibili/);
 const b=boxes(ascii(P.pdf(P.layout('rollup',VALUES,brand),{pdfx:true,date:DATE})))[0];assert.deepEqual(b.media,[0,0,868,2018].map(pt));assert.deepEqual(b.trim,[9,9,859,2009].map(pt));
 assert.ok(P.notes(P.layout('rollup',VALUES,brand)).some(n=>/ultimi 100 mm in basso entrano nella base[^]*150 dpi/.test(n)));
});

test('brochure A4 three panels (roll fold): inner flap 97 mm, outside and inside spreads mirrored, fold marks dashed in the slug for every layout',()=>{
 const f=P.format('brochure');assert.deepEqual(f.panels,[[97,100,100],[100,100,97]]);assert.deepEqual(f.pages,['Esterno','Interno']);
 for(const v of P.VARIANTS){const doc=P.layout('brochure',VALUES,brand,{variant:v.id});assert.deepEqual(doc.pages.map(p=>p.folds),[[97,197],[100,200]]);
  const s=ascii(P.pdf(doc,{pdfx:true,date:DATE})),cs=contents(s);assert.equal(cs.length,2);
  const folds=cs.map(c=>[...c.matchAll(/q 1 1 1 1 K 0\.25 w \[2 1\] 0 d ([\d.]+) ([\d.]+) m ([\d.]+) ([\d.]+) l S Q/g)].map(m=>m.slice(1).map(Number)));
  assert.deepEqual(folds[0].map(x=>x[0]),[106,106,206,206].map(pt),v.id+': outside folds at 97 and 197 mm');assert.deepEqual(folds[1].map(x=>x[0]),[109,109,209,209].map(pt),v.id+': inside folds at 100 and 200 mm');
  for(const x of folds.flat())assert.ok(x[1]>=pt(223)-1e-6&&x[3]<=pt(228)+1e-6||x[1]<=pt(5)+1e-6&&x[3]>=-1e-6,'fold marks in the slug only');
  // panel texts keep 4 mm from the folds
  for(const [pi,p] of doc.pages.entries())for(const it of p.items.filter(i=>i.t==='text'&&i.area)){const w=P.textWidth(it.s,it.size,it.bold)/P.MM;assert.ok(it.x>=it.area.x+4-1e-6&&it.x+w<=it.area.x+it.area.w-4+1e-6,v.id+' page '+pi+' «'+it.s+'»')}}
 assert.ok(P.notes(P.layout('brochure',VALUES,brand)).some(n=>/anta che si chiude dentro è di 97 mm/.test(n)));
});

test('saved with the layout and the CMYK settings; glyph outlines load in Node; preflight checklist shape',async()=>{
 const doc=P.layout('locandina-a2',VALUES,brand,{variant:'minimal'}),cm={byRole:{primary:[80,20,55,40]},richBlack:false};
 const e=P.savedEntry(doc,P.toMarkdown(doc,{date:'2026-10-21',cmyk:{overrides:P.overridesFrom(brand.palette,cm.byRole),richBlack:false}}),{at:'2026-10-21T10:00:00Z',cmyk:cm});
 assert.deepEqual(e[1].print.cmyk,{byRole:{primary:[80,20,55,40]},richBlack:false});assert.equal(e[1].print.variant,'minimal');assert.equal(e[1].print.format,'locandina-a2');
 assert.match(e[1].content,/- Primario: #2F5D50 · CMYK 80 20 55 40 \(impostato a mano\) · inchiostro 195%/);assert.match(e[1].content,/layout Minimal/);assert.doesNotMatch(e[1].content,/nero ricco/);
 assert.equal((await P.loadGlyphs()).UPM,2048);
 const pf=P.preflight(doc);assert.equal(pf.ok,true);assert.deepEqual(pf.checks.map(c=>c.label),['Abbondanza 3 mm','Area sicura','Solo CMYK','Inchiostro totale ≤ 300%','Immagini ≥ 300 dpi','Font']);
 assert.equal(pf.checks.find(c=>c.id==='dpi').detail,'Nessuna immagine raster: tutto vettoriale.');
});
