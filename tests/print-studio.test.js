'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../lib/print-studio.js'),cs=require('../lib/copy-studio.js');

const LOGO='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 96"><circle cx="48" cy="48" r="30" fill="#2F5D50"/><path d="M10 10 a20 10 0 1 0 40 0 Q 60 5 70 20 z" fill="#E3B448" opacity=".7"/><text x="92" y="60" font-size="34" font-weight="700" fill="#1C1C1E">Forno Bianchi</text></svg>';
const PROFILE={identityKit:{brand:'Forno Bianchi',direction:'Bottega di quartiere',palette:[{role:'primary',hex:'#2F5D50'},{role:'secondary',hex:'#A0522D'},{role:'accent',hex:'#E3B448'},{role:'dark',hex:'#1C1C1E'},{role:'light',hex:'#F7F5F0'}],fonts:[{heading:'Fraunces',body:'Inter'}],logo:LOGO},
 links:'info@fornobianchi.it · 035 123 4567 · https://www.fornobianchi.it/',notes:'Sede: Via Roma 12, 24121 Bergamo'};
const VALUES={name:'Forno Bianchi',payoff:'Pane buono, ogni mattina',person:'Anna Bianchi',role:'Titolare',phone:'035 123 4567',email:'info@fornobianchi.it',website:'fornobianchi.it',address:'Via Roma 12, 24121 Bergamo',
 headline:'Apriamo in via Roma!',body:'Pane, focacce e dolci ogni mattina dalle 7.',cta:'Vieni sabato 12',vat:'Forno Bianchi srl · P. IVA 01234567890',flapTitle:'Chi siamo',flapText:'Tre generazioni di fornai.',
 p1Title:'Il pane',p1Text:'Lievito madre.',p2Title:'I dolci',p2Text:'Crostate.',p3Title:'Orari',p3Text:'Lun–Sab 7–19.',closing:'Ti aspettiamo!'};
const brand=P.brandOf(PROFILE);
const pt=mm=>Math.round(mm*72/25.4*1000)/1000;
const ascii=b=>Buffer.from(b).toString('latin1');
// A small PDF reader: header, xref offsets pointing at their objects, trailer, pages.
function parse(bytes){const s=ascii(bytes);assert.ok(s.startsWith('%PDF-1.4\n'),'header');assert.ok(s.trimEnd().endsWith('%%EOF'),'eof');
 const sx=+/startxref\n(\d+)\n%%EOF\s*$/.exec(s)[1];assert.equal(s.slice(sx,sx+5),'xref\n','startxref points to the xref table');
 const [,first,count]=/^xref\n(\d+) (\d+)\n/.exec(s.slice(sx)).map(Number);assert.equal(first,0);
 const rows=s.slice(sx).split('\n').slice(2,2+count);assert.equal(rows[0],'0000000000 65535 f ');
 rows.slice(1).forEach((r,i)=>{assert.match(r,/^\d{10} 00000 n $/);const off=+r.slice(0,10);assert.equal(s.slice(off,off+String(i+1).length+6),(i+1)+' 0 obj','object '+(i+1)+' at its offset')});
 assert.match(s,new RegExp('trailer\\n<< /Size '+count+' /Root 1 0 R /Info \\d+ 0 R >>'));
 const pages=[...s.matchAll(/\/Type \/Page \/Parent [^\n]*?\/MediaBox \[([^\]]+)\] \/BleedBox \[([^\]]+)\] \/TrimBox \[([^\]]+)\]/g)].map(m=>({media:m[1].split(' ').map(Number),bleed:m[2].split(' ').map(Number),trim:m[3].split(' ').map(Number)}));
 const n=+/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(s)[1];assert.equal(pages.length,n,'page objects = /Count');return {s,pages,count:n}}

test('mm → pt: 72 pt per inch of 25.4 mm, and back',()=>{
 assert.equal(P.mmToPt(25.4),72);assert.equal(Math.round(P.mmToPt(85)*1000)/1000,240.945);assert.equal(Math.round(P.mmToPt(210)*100)/100,595.28);
 assert.ok(Math.abs(P.ptToMm(P.mmToPt(3))-3)<1e-12);assert.equal(P.BLEED,3);assert.equal(P.SAFE,4);
});

test('formats and page sizes: print page = trim + 3 mm bleed + 6 mm slug per side, bleed box = trim + 3 mm; web = trim',()=>{
 assert.deepEqual(P.FORMATS.map(f=>[f.id,f.w,f.h,f.pages.length]),[['biglietto',85,55,2],['flyer',148,210,1],['locandina-a4',210,297,1],['locandina-a3',297,420,1],['carta',210,297,1],['brochure',297,210,2]]);
 const b=P.pageSize('biglietto','print');assert.deepEqual([b.w,b.h,b.bleedW,b.bleedH,b.bleed,b.slug],[103,73,91,61,3,6]);assert.equal(Math.round(b.wPt*100)/100,291.97);
 assert.deepEqual([P.pageSize('biglietto','web').w,P.pageSize('biglietto','web').h],[85,55]);
 assert.deepEqual([P.pageSize('locandina-a3','print').bleedW,P.pageSize('locandina-a3','print').bleedH],[303,426]);
 assert.deepEqual([P.pageSize('brochure','print').w,P.pageSize('brochure','print').h],[315,228]);
 assert.deepEqual(P.format('brochure').panels.map(p=>p.reduce((a,x)=>a+x,0)),[297,297],'panels fill the sheet');
 assert.throws(()=>P.pageSize('boh'),/Formato sconosciuto/);
});

test('crop and fold marks sit in the slug: on the trim lines and folds, from the page edge to 1 mm before the bleed edge',()=>{
 const doc=P.layout('biglietto',VALUES,brand),m=P.marks(doc.pages[0]);
 assert.equal(P.SLUG,6);assert.equal(m.length,8);assert.ok(m.every(x=>x.kind==='crop'));
 const v=m.filter(x=>x.x1===x.x2),h=m.filter(x=>x.y1===x.y2);
 assert.deepEqual([...new Set(v.map(x=>x.x1))],[9,94],'vertical marks on the left and right trim lines (slug 6 + bleed 3)');
 assert.deepEqual([...new Set(h.map(x=>x.y1))],[9,64],'horizontal marks on the top and bottom trim lines');
 assert.deepEqual(v.map(x=>[x.y1,x.y2]),[[0,5],[68,73],[0,5],[68,73]],'outside the bleed box (6–67 mm), 1 mm gap');
 assert.deepEqual(h.map(x=>[x.x1,x.x2]),[[0,5],[98,103],[0,5],[98,103]],'outside the bleed box (6–97 mm), 1 mm gap');
 for(const x of m){const inBleed=(a,b,lo,hi)=>Math.max(a,b)>lo&&Math.min(a,b)<hi;assert.ok(!(inBleed(x.x1,x.x2,6,97)&&inBleed(x.y1,x.y2,6,67)),'no mark over the artwork')}
 const br=P.layout('brochure',VALUES,brand);
 assert.deepEqual(br.pages.map(p=>p.folds),[[97,197],[100,200]],'roll fold: outside and inside folds mirror');
 assert.deepEqual(P.marks(br.pages[0]).filter(x=>x.kind==='fold').map(x=>[x.x1,x.y1,x.y2]),[[106,0,5],[106,223,228],[206,0,5],[206,223,228]]);
 assert.deepEqual(P.marks(br.pages[1]).filter(x=>x.kind==='fold').map(x=>x.x1),[109,109,209,209]);
});

test('safe area: the default layouts keep text 4 mm from trim and folds; smaller margins and long lines are flagged',()=>{
 for(const f of P.FORMATS){const d=P.layout(f.id,VALUES,brand);assert.deepEqual(d.warnings,[],f.id);assert.equal(d.pages.length,f.pages.length)}
 const tight=P.layout('biglietto',{...VALUES,margin:2},brand),safe=tight.warnings.filter(w=>w.kind==='safe');
 assert.ok(safe.length>=2);assert.ok(safe.every(w=>w.distance<4));assert.match(safe[0].text,/^(Fronte|Retro): «.+» è a \d+(,\d)? mm dal bordo di taglio \(servono almeno 4 mm\)/);
 const long=P.layout('biglietto',{...VALUES,email:'amministrazione.ordini.ingrosso.consegne.fatture@fornobianchi-bergamo-centro-storico.it'},brand);
 assert.ok(long.warnings.some(w=>w.kind==='safe'&&w.label==='Email'),'an email too long for the card');
 const fold=P.layout('brochure',{...VALUES,margin:2},brand).warnings;assert.ok(fold.some(w=>/dalla piega/.test(w.text)),'brochure panels check the folds');
 const over=P.layout('biglietto',{...VALUES,margin:0},brand);assert.ok(P.safeArea(over).length>0);
 const flood=P.layout('flyer',{...VALUES,body:'Pane fresco ogni giorno. '.repeat(200)},brand);
 assert.ok(flood.warnings.some(w=>w.kind==='overflow'&&/«Testo» non entra tutto/.test(w.text)));
 assert.ok(flood.pages[0].items.some(i=>i.t==='text'&&/…$/.test(i.s)),'cut with an ellipsis');
});

test('Helvetica metrics and WinAnsi: widths, accents, euro, wrapping',()=>{
 assert.equal(Math.round(P.textWidth('Hello',10)*100)/100,22.78);assert.ok(P.textWidth('Hello',10,true)>P.textWidth('Hello',10));
 assert.deepEqual(['è','€','’','«','A','ő','✓'].map(P.winAnsi),[0xE8,0x80,0x92,0xAB,65,111,63]);
 const lines=P.wrap('Pane, focacce e dolci ogni mattina dalle sette, tutti i giorni.',10,40);assert.ok(lines.length>1);
 for(const l of lines)assert.ok(P.textWidth(l,10)/P.MM<=40+1e-9,l);
 assert.ok(P.layout('flyer',{...VALUES,headline:'Pane ✓'},brand).warnings.some(w=>w.kind==='glyph'));
});

test('PDF for the print shop: %PDF, valid xref, MediaBox with slug, BleedBox = trim + bleed, TrimBox = trim, crop marks in the slug, Helvetica not embedded',()=>{
 const doc=P.layout('biglietto',VALUES,brand),{s,pages,count}=parse(P.pdf(doc,{mode:'print',date:new Date(Date.UTC(2026,9,21))}));
 assert.equal(count,2);
 for(const p of pages){assert.deepEqual(p.media,[0,0,103,73].map(pt));assert.deepEqual(p.bleed,[6,6,97,67].map(pt));assert.deepEqual(p.trim,[9,9,94,64].map(pt))}
 assert.match(s,new RegExp('^q '+[6,6,91,61].map(pt).join(' ').replace(/\\./g,'\\.')+' re W n','m'),'artwork clipped to the bleed box');
 assert.match(s,/\/BaseFont \/Helvetica \/Encoding \/WinAnsiEncoding/);assert.match(s,/\/BaseFont \/Helvetica-Bold/);assert.ok(!/FontFile/.test(s),'standard fonts, not embedded');
 assert.match(s,/q 0 0 0 RG 0\.25 w [\d. ]+ m [\d. ]+ l S Q/,'crop marks drawn, 0.25 pt black');assert.equal((s.match(/q 0 0 0 RG 0\.25 w /g)||[]).length,16,'8 marks per page');assert.ok(!/1 1 1 RG/.test(s),'no white underlay');
 const first=/q 0 0 0 RG 0\.25 w ([\d.]+) ([\d.]+) m ([\d.]+) ([\d.]+) l S Q/.exec(s).slice(1).map(Number);assert.deepEqual(first,[9,73,9,68].map(pt),'first mark: left trim line, top slug');
 assert.match(s,/\/Title \(Biglietto da visita \\267 Forno Bianchi \\267 tipografia\)/,'title in WinAnsi');
 assert.match(s,/\/CreationDate \(D:20261021000000Z\)/);
 // text is real text (vector), the colours RGB
 assert.match(s,/BT \/F2 11 Tf [\d. ]+ rg [\d. ]+ Td <[0-9A-F]+> Tj ET/);assert.match(s,/0\.184 0\.365 0\.314 rg/,'primary #2F5D50 in RGB');
});

test('PDF for the web: page = trim, no bleed, no marks; brochure has 2 pages',()=>{
 const {s,pages}=parse(P.pdf(P.layout('biglietto',VALUES,brand),{mode:'web'}));
 assert.deepEqual(pages[0].media,[0,0,240.945,155.906]);assert.deepEqual(pages[0].trim,pages[0].media);assert.ok(!/0\.25 w /.test(s),'no marks');assert.match(s,/re W n/,'clipped to the trim');
 const br=P.layout('brochure',VALUES,brand),print=parse(P.pdf(br)),web=parse(P.pdf(br,{mode:'web'}));
 assert.equal(print.count,2);assert.equal(web.count,2);assert.deepEqual(print.pages[0].media,[0,0,315,228].map(pt));assert.deepEqual(print.pages[0].bleed,[6,6,309,222].map(pt));assert.deepEqual(web.pages[1].media,[0,0,841.89,595.276]);
 assert.equal((print.s.match(/\[2 1\] 0 d/g)||[]).length,8,'4 fold marks per page, dashed');
 for(const f of ['flyer','locandina-a4','locandina-a3','carta'])assert.equal(parse(P.pdf(P.layout(f,VALUES,brand))).count,1,f);
});

test('the logo goes in as vectors (shapes, arcs, text in Helvetica); gradients need the 300 dpi raster, which goes in as JPEG',()=>{
 const ops=P.svgOps(LOGO,()=>'GS1');
 assert.match(ops,/ c\n/);assert.match(ops,/\/GS1 gs/,'opacity via ExtGState');assert.match(ops,/BT \/F2 1 Tf 34 0 0 -34 92 60 Tm <466F726E6F204269616E636869> Tj ET/);
 assert.ok(P.arcToCubics(0,0,10,10,0,false,true,20,0).length>=2);
 assert.equal(P.needsRaster(LOGO),false);assert.equal(P.needsRaster('<svg viewBox="0 0 10 10"><defs><linearGradient id="g"><stop stop-color="#f00"/></linearGradient></defs><rect width="10" height="10" fill="url(#g)"/></svg>'),true);
 assert.match(P.svgOps('<svg viewBox="0 0 10 10"><defs><linearGradient id="g"><stop stop-color="#f00"/></linearGradient></defs><rect width="10" height="10" fill="url(#g)"/></svg>',()=>''),/1 0 0 rg/,'gradient drawn with its first colour without a canvas');
 const doc=P.layout('biglietto',VALUES,brand),logo=doc.pages[0].items.find(i=>i.t==='logo');assert.ok(logo);assert.equal(Math.round(logo.w/logo.h*1000),Math.round(320/96*1000),'aspect kept');
 const {s}=parse(P.pdf(doc));assert.match(s,/% logo/);assert.match(s,/\/ExtGState/);
 logo.raster={w:4,h:2,jpeg:new Uint8Array([0xFF,0xD8,0xFF,0xD9])};const r=parse(P.pdf(doc));
 assert.match(r.s,/\/Subtype \/Image \/Width 4 \/Height 2 \/ColorSpace \/DeviceRGB \/BitsPerComponent 8 \/Filter \/DCTDecode \/Length 4/);assert.match(r.s,/\/Im1 Do/);
});

test('brand: the kit from the profile, else neutral colours and the name as wordmark; prefill finds the contacts',()=>{
 assert.equal(brand.fromKit,true);assert.equal(brand.palette.primary,'#2F5D50');assert.equal(brand.logo,LOGO);assert.equal(brand.fonts.heading,'Fraunces');
 const none=P.brandOf({},'Bottega Rossi — PED');assert.equal(none.fromKit,false);assert.equal(none.logo,'');assert.equal(none.name,'Bottega Rossi');
 const d=P.layout('biglietto',{name:'Bottega Rossi'},none);assert.ok(d.pages[0].items.some(i=>i.wordmark&&i.s==='Bottega Rossi'));
 assert.ok(P.notes(d).some(n=>/colori neutri/.test(n)));assert.ok(P.notes(d).some(n=>/RGB: la tipografia li converte in CMYK/.test(n)));
 const v=P.prefill(PROFILE,{projectName:'Forno Bianchi — PED'});
 assert.deepEqual(v,{name:'Forno Bianchi',payoff:'',phone:'035 123 4567',email:'info@fornobianchi.it',website:'www.fornobianchi.it',address:'Via Roma 12, 24121 Bergamo',vat:''});
 assert.equal(P.prefill({contacts:{telefono:'02 1234567'}}).phone,'02 1234567');
 assert.ok(P.contrast('#1C1C1E','#F7F5F0')>=4.5);assert.equal(P.ink('#2F5D50',brand.palette,'#F7F5F0'),'#F7F5F0');
});

test('texts from the Studio Testi: the brochure sections go in the panels, the flyer gets title, text and call to action',()=>{
 const md=cs.toMarkdown('brochure',{title:'Bottega',sections:{cover:'Il pane di quartiere\nDal 1962 a Bergamo',pages:'### Chi siamo\nTre generazioni.\n\n### Il pane\nLievito **madre**.\n\n### I dolci\nCrostate.\n\n### Orari\nDal lunedì al sabato.\n\n### Dove\nVia Roma 12.',close:'Vieni a trovarci.'},issues:[]},{project:{name:'Forno'},answers:{}});
 const parsed=P.parseCopy(md);assert.equal(parsed.title,'Bottega');assert.deepEqual(parsed.sections.map(s=>s.title),['Copertina','Chi siamo','Il pane','I dolci','Orari','Dove','Chiusura']);
 const b=P.fromCopy('brochure',parsed,{});
 assert.equal(b.values.payoff,'Il pane di quartiere');assert.equal(b.values.flapTitle,'Chi siamo');assert.equal(b.values.p1Text,'Lievito madre.');assert.equal(b.values.p3Title,'Orari');
 assert.match(b.values.p3Text,/Dal lunedì al sabato\.\n\nDove\nVia Roma 12\./);assert.equal(b.values.closing,'Vieni a trovarci.');assert.match(b.notes[0],/più sezioni che ante/);
 const f=P.fromCopy('flyer',parsed,{payoff:'Il mio payoff'});assert.equal(f.values.headline,'Il pane di quartiere');assert.equal(f.values.payoff,'Il mio payoff');
 assert.match(f.values.body,/^Dal 1962 a Bergamo\n\nTre generazioni\./);assert.equal(f.values.cta,'Vieni a trovarci.');
 assert.equal(P.fromCopy('carta',P.parseCopy('ciao'),{}).used,0);
});

test('preview SVG: same items, bleed veil, trim line, dashed safe areas per panel, no script; web preview clipped to the trim',()=>{
 const br=P.layout('brochure',VALUES,brand),svg=P.previewSvg(br,0);
 assert.match(svg,/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="-3 -3 303 216"/);assert.equal((svg.match(/stroke="#2f80ed"/g)||[]).length,3,'one safe area per panel');
 assert.match(svg,/<rect x="0" y="0" width="297" height="210" fill="none" stroke="#e5484d"/);assert.ok(!/<script/i.test(svg));
 assert.match(P.previewSvg(br,1,{guides:false}),/viewBox="0 0 297 210"[\s\S]*clip-path="url\(#pr-trim-\d+\)"/);
 const xss=P.previewSvg(P.layout('flyer',{...VALUES,headline:'<img src=x onerror=alert(1)>'},brand),0);assert.ok(!/<img/.test(xss));assert.match(xss,/&lt;img/);
});

test('saved in the project: one exchange in the Art Director thread, with format, texts, colours, checks and print notes',async()=>{
 const doc=P.layout('biglietto',{...VALUES,margin:2},brand),md=P.toMarkdown(doc,{date:'2026-10-21'});
 assert.match(md,/^# Stampa · Biglietto da visita · Forno Bianchi/);assert.match(md,/PDF per la tipografia: formato \+ 3 mm di abbondanza per lato \(91 × 61 mm\), segni di taglio fuori dall’abbondanza \(pagina 103 × 73 mm\) · margine 2 mm · 2026-10-21/);
 assert.match(md,/- \*\*Nome e cognome\*\*: Anna Bianchi/);assert.match(md,/## Colori \(RGB\)\n\n- Primario: #2F5D50/);assert.match(md,/## Da controllare\n\n- (Fronte|Retro): /);assert.match(md,/Helvetica/);
 assert.equal(P.filename(doc,'print'),'stampa-biglietto-forno-bianchi-tipografia.pdf');assert.equal(P.filename(doc,'web'),'stampa-biglietto-forno-bianchi-web.pdf');
 class ConflictError extends Error{}let saved=null,tries=0;
 const ws={ConflictError,bind:(id,name)=>{assert.equal(id,'forno');assert.equal(name,'agents');return {load:async()=>({schemaVersion:1,conversations:{'art-director':[{role:'user',content:'prima'}]}}),save:async x=>{if(!tries++)throw new ConflictError('conflitto');saved=x;return x}}}};
 await P.saveToProject(ws,'forno',doc,{by:'Anna',at:'2026-10-21T10:00:00Z'});
 const t=saved.conversations['art-director'];assert.equal(t.length,3);assert.equal(t[1].by,'Anna');assert.equal(t[2].agent,'art-director');assert.equal(t[2].source,'print-studio');
 assert.match(t[2].content,/---DOCUMENTO: Stampa · Biglietto da visita · Forno Bianchi---\n# Stampa/);assert.equal(t[2].print.format,'biglietto');assert.equal(t[2].print.values.person,'Anna Bianchi');
 await assert.rejects(P.saveToProject(null,'forno',doc),/Archivio del progetto non disponibile/);
 const copies=P.savedCopies({conversations:{copywriter:[{role:'assistant',source:'copy-studio',at:'2026-10-20',content:'Ecco.\n\n---DOCUMENTO: Brochure · Bottega---\n# Brochure\n## Copertina\nCiao\n---FINE DOCUMENTO---'},{role:'assistant',content:'altro'}]}});
 assert.deepEqual(copies.map(c=>c.title),['Brochure · Bottega']);assert.match(copies[0].md,/## Copertina/);
});
