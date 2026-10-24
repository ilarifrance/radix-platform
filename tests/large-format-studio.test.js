'use strict';
// Studio Stampa · Grande formato (lib/large-format-studio.js): formats, page boxes per scale, slug notes, eyelets, the
// text size for the viewing distance, placeholders that block the export, valid PDF/X-1a-style bytes.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const L=require('../lib/large-format-studio.js'),P=require('../lib/print-studio.js');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');

const LOGO='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 96"><circle cx="48" cy="48" r="30" fill="#8C3B1F"/><text x="92" y="60" font-size="34" font-weight="700" fill="#2B1D14">Forno Aurora</text></svg>';
const PROFILE={identityKit:{brand:'Forno Aurora',direction:'Bottega calda',palette:[{role:'primary',hex:'#8C3B1F'},{role:'secondary',hex:'#6B4E3D'},{role:'accent',hex:'#E8B04B'},{role:'dark',hex:'#2B1D14'},{role:'light',hex:'#FBF6EE'}],logo:LOGO},
 links:'www.fornoaurora.it · 011 555 1234',notes:'Sede: Via Nizza 12, 10125 Torino'};
const brand=L.brandFor(PROFILE);
const VALUES={...L.prefill(PROFILE),headline:'Pane caldo dalle 7',cta:'Aperti tutti i giorni',payoff:'Il forno di quartiere'};
const DATE=new Date(Date.UTC(2026,9,23));
const MM=72/25.4,pt=mm=>Math.round(mm*MM*1000)/1000,ascii=b=>Buffer.from(b).toString('latin1');
const boxes=s=>[...s.matchAll(/\/MediaBox \[([^\]]+)\] \/BleedBox \[([^\]]+)\] \/TrimBox \[([^\]]+)\]/g)].map(m=>({media:m[1].split(' ').map(Number),bleed:m[2].split(' ').map(Number),trim:m[3].split(' ').map(Number)}));
const round=a=>a.map(v=>Math.round(v*100)/100);
// The PDF reader of tests/print-studio.test.js: header, xref offsets at their objects, trailer, /Count = page objects.
function parse(bytes){const s=ascii(bytes);assert.ok(s.startsWith('%PDF-1.4\n'));assert.ok(s.trimEnd().endsWith('%%EOF'));
 const sx=+/startxref\n(\d+)\n%%EOF\s*$/.exec(s)[1];assert.equal(s.slice(sx,sx+5),'xref\n');
 const [,first,count]=/^xref\n(\d+) (\d+)\n/.exec(s.slice(sx)).map(Number);assert.equal(first,0);
 s.slice(sx).split('\n').slice(3,2+count).forEach((r,i)=>{const off=+r.slice(0,10);assert.equal(s.slice(off,off+String(i+1).length+6),(i+1)+' 0 obj','object '+(i+1)+' at its offset')});
 assert.match(s,/trailer\n<< \/Size \d+ \/Root 1 0 R \/Info \d+ 0 R \/ID \[<[0-9A-F]{32}> <[0-9A-F]{32}>\] >>/);return s}

test('the formats: totem, banner/striscione, vela, panels, 6 × 3 m, free size; a bleed of 1–5 cm, safe area and distance each',()=>{
 assert.deepEqual(L.FORMATS.map(f=>[f.id,f.w,f.h,f.bleed]),[['totem-80x180',800,1800,20],['totem-100x200',1000,2000,20],['banner-300x100',3000,1000,30],['banner-500x100',5000,1000,30],
  ['vela-70x250',700,2500,20],['vela-85x350',850,3500,20],['pannello-70x100',700,1000,10],['pannello-100x140',1000,1400,10],['poster-6x3',6000,3000,50],['custom',0,0,20]]);
 for(const f of L.FORMATS){assert.ok(f.bleed>=L.BLEED_MIN&&f.bleed<=L.BLEED_MAX,f.id);assert.ok(f.safe>=f.bleed,f.id);assert.ok(f.distance>0,f.id);assert.ok(L.GROUPS.some(g=>g.id===f.group),f.id)}
 assert.deepEqual([L.BLEED_MIN,L.BLEED_MAX,L.SLUG,L.PDF_MAX],[10,50,10,5080]);
 // bleed configurable from 1 to 5 cm, clamped; empty = the format default
 assert.equal(L.spec('totem-80x180',{bleed:35}).bleed,35);assert.equal(L.spec('totem-80x180',{bleed:3}).bleed,10);assert.equal(L.spec('totem-80x180',{bleed:90}).bleed,50);assert.equal(L.spec('totem-80x180',{bleed:''}).bleed,20);
 // panels turn; the free size in cm, clamped
 const p=L.spec('pannello-70x100',{landscape:true});assert.deepEqual([p.w,p.h,p.title],[1000,700,'Pannello 100 × 70 cm']);
 const c=L.spec('custom',{customW:'250',customH:'120'});assert.deepEqual([c.w,c.h,c.title],[2500,1200,'Misura libera 250 × 120 cm']);
 assert.deepEqual([L.spec('custom',{customW:5,customH:99999}).w,L.spec('custom',{customW:5,customH:99999}).h],[300,10000]);
 assert.throws(()=>L.spec('boh'),/Formato sconosciuto/);
});

test('page box math: trim + bleed + 10 mm slug per side at 1:1; everything a tenth at 1:10 except the slug',()=>{
 const t=L.pageBox(L.spec('totem-80x180'));assert.equal(t.scale,1);assert.deepEqual([t.trim.w,t.trim.h,t.bleed,t.bleedBox.w,t.bleedBox.h,t.media.w,t.media.h],[800,1800,20,840,1840,860,1860]);
 const b=L.pageBox(L.spec('banner-300x100'));assert.deepEqual([b.media.w,b.media.h,b.bleedBox.w],[3080,1080,3060]);
 // 500 × 100 cm + 3 cm bleed + 1 cm slug = 5080 mm: exactly the PDF page limit (14 400 pt), still 1:1
 const s5=L.pageBox(L.spec('banner-500x100'));assert.equal(s5.scale,1);assert.equal(s5.media.w,5080);assert.equal(Math.round(s5.pt.w),14400);
 // one more centimetre of bleed and the page would not fit: 1:10, with a note
 const big=L.spec('banner-500x100',{bleed:40});assert.equal(big.scale,10);assert.match(big.notes[0],/scala 1:10/);
 const bb=L.pageBox(big);assert.deepEqual(round([bb.trim.w,bb.trim.h,bb.bleed,bb.media.w,bb.media.h]),[500,100,4,528,128]);
 // the 6 × 3 m poster is always delivered at 1:10: 600 × 300 mm + 5 mm bleed + 10 mm slug
 const pp=L.pageBox(L.spec('poster-6x3'));assert.equal(pp.scale,10);assert.deepEqual(round([pp.trim.w,pp.trim.h,pp.bleed,pp.media.w,pp.media.h]),[600,300,5,630,330]);
 assert.equal(L.spec('poster-6x3',{scale:'1'}).scale,10,'1:1 does not fit a PDF page: back to 1:10');
 // 1:10 on request for any piece
 const tt=L.pageBox(L.spec('totem-100x200',{scale:'10'}));assert.deepEqual(round([tt.trim.w,tt.trim.h,tt.bleed,tt.media.w,tt.media.h]),[100,200,2,124,224]);
 for(const f of L.FORMATS){const x=L.pageBox(L.spec(f.id));assert.ok(Math.max(x.media.w,x.media.h)<=L.PDF_MAX,f.id+' fits a PDF page')}
});

test('the PDF boxes match the math: MediaBox, BleedBox and TrimBox in points, 1:1 and 1:10',()=>{
 const t=ascii(L.exportPdf(L.layout('totem-80x180',VALUES,brand),{date:DATE})),bt=boxes(t)[0];
 assert.deepEqual(bt.media,[0,0,pt(860),pt(1860)]);assert.deepEqual(bt.bleed,[pt(10),pt(10),pt(850),pt(1850)]);assert.deepEqual(bt.trim,[pt(30),pt(30),pt(830),pt(1830)]);
 const p=ascii(L.exportPdf(L.layout('poster-6x3',VALUES,brand),{date:DATE})),bp=boxes(p)[0];
 assert.deepEqual(bp.media,[0,0,pt(630),pt(330)]);assert.deepEqual(bp.bleed,[pt(10),pt(10),pt(620),pt(320)]);assert.deepEqual(bp.trim,[pt(15),pt(15),pt(615),pt(315)]);
 const s5=ascii(L.exportPdf(L.layout('banner-500x100',VALUES,brand),{date:DATE}));assert.equal(boxes(s5)[0].media[2],14400);
});

test('the scale is written in the slug: «SCALA 1:10 · stampare al 1000%» with the real size, or «SCALA 1:1»',()=>{
 const s=L.spec('poster-6x3');assert.equal(L.scaleNote(s),'SCALA 1:10 · stampare al 1000% · misura reale 600 × 300 cm');
 assert.equal(L.scaleNote(L.spec('banner-300x100')),'SCALA 1:1 · misura reale 300 × 100 cm');
 const doc=L.layout('poster-6x3',VALUES,brand),slug=L.slugTexts(doc,L.pageBox(doc.spec));
 assert.equal(slug[0].s,L.scaleNote(doc.spec));assert.ok(slug[0].bold);assert.ok(slug[0].y<L.SLUG,'top slug');assert.ok(slug[1].y>L.pageBox(doc.spec).media.h-L.SLUG,'bottom slug');
 assert.match(slug[1].s,/rifilo 600 × 300 cm · abbondanza 5 cm per lato · area sicura 10 cm · CMYK FOGRA39/);
 const bx=L.pageBox(doc.spec);for(const t of slug)assert.ok(t.x>=bx.offset&&t.x+P.textWidth(t.s,t.size,t.bold)/MM<=bx.offset+bx.trim.w+1e-6,'between the crop marks');
 // in the PDF the notes are outlines in K100, and the markdown and the notes say it too
 const pdf=ascii(L.exportPdf(doc,{date:DATE}));assert.match(pdf,/q 0 0 0 1 k 1 0 0 1 [\d.]+ [\d.]+ cm q 7 0 0 7 0 0 cm \/B83 Do Q/,'«S» of SCALA, bold 7 pt');
 assert.match(L.toMarkdown(doc,{date:'2026-10-23'}),/SCALA 1:10 · stampare al 1000%/);assert.ok(L.notes(doc).some(n=>/ingrandire al 1000%/.test(n)));
 assert.match(L.filename(doc),/^grande-formato-poster-6x3-forno-aurora-scala-1-10\.pdf$/);
 // everything is drawn at a tenth: the title size too
 const big=doc.pages[0].items.find(i=>i.label==='Titolo'),small=L.forPdf(doc).pages[0].items.find(i=>i.label==='Titolo');assert.ok(Math.abs(small.size-big.size/10)<1e-9);assert.ok(Math.abs(small.x-big.x/10)<1e-9);
});

test('eyelet marks: corners at the offset, at most `step` apart, drawn in K100 under the eyelets; the safe area keeps texts away',()=>{
 const s=L.spec('banner-300x100'),e=L.eyelets(s);
 assert.deepEqual(s.eyelets,{step:500,offset:25,r:L.EYELET_R});
 const top=e.filter(p=>p.y===25).map(p=>Math.round(p.x*10)/10);assert.equal(top.length,7);assert.equal(top[0],25);assert.equal(top[6],2975);
 for(let i=1;i<top.length;i++)assert.ok(top[i]-top[i-1]<=500+1e-9);
 assert.equal(e.filter(p=>p.y===975).length,7);assert.deepEqual(e.filter(p=>p.x===25).map(p=>p.y).sort((a,b)=>a-b),[25,500,975]);assert.equal(e.length,16);
 assert.equal(s.safeEff,Math.max(s.safe,25+5+10));
 assert.equal(L.eyelets(L.spec('banner-300x100',{eyelets:false})).length,0,'the option turns them off');assert.equal(L.spec('totem-80x180',{eyelets:true}).eyelets,null,'only banners and free sizes');
 assert.ok(L.spec('custom',{eyelets:true}).eyelets);
 const pdf=ascii(L.exportPdf(L.layout('banner-300x100',VALUES,brand),{date:DATE}));
 assert.equal((pdf.match(/q 0 0 0 1 K 0\.5 w [^\n]* c h S [\d.]+ [\d.]+ m [\d.]+ [\d.]+ l S [\d.]+ [\d.]+ m [\d.]+ [\d.]+ l S Q/g)||[]).length,16,'a circle and a cross per eyelet');
 assert.equal((pdf.match(/q 1 1 1 1 K 0\.25 w /g)||[]).length,8,'8 crop marks in registration');
 const off=ascii(L.exportPdf(L.layout('banner-300x100',VALUES,brand,{eyelets:false}),{date:DATE}));assert.doesNotMatch(off,/0\.5 w [^\n]* c h S/);
 // a text in the eyelet strip fails the safe area
 const doc=L.layout('banner-300x100',VALUES,brand);doc.pages[0].items.push({t:'text',x:100,y:30,s:'Occhiello',size:40,bold:false,fill:'#2B1D14',label:'Prova'});
 const safe=L.checks(doc).find(c=>c.id==='safe');assert.equal(safe.state,'fail');assert.match(safe.detail,/«Prova» .*occhielli/);
});

test('minimum text size for the viewing distance: title ≥ distance / 35, other texts ≥ distance / 250 (a warning)',()=>{
 assert.deepEqual(L.minCaps(3),{title:3000/35,text:12});assert.ok(Math.abs(L.minCaps(3).title-85.714)<.001,'~8,6 cm at 3 m (the practice estimate of the P6 card)');
 const ok=L.layout('totem-80x180',VALUES,brand),c=L.checks(ok).find(x=>x.id==='size');assert.equal(c.state,'ok');assert.match(c.label,/Leggibile a 3 m/);
 const t=ok.pages[0].items.find(i=>i.label==='Titolo');assert.ok(P.ptToMm(t.size*.718)>=85.7,'the layout sizes the title for the distance');
 // a long title at 30 m shrinks to fit the totem: the check warns and says how much is needed, and the export still works
 const far=L.layout('totem-80x180',{...VALUES,headline:'Pane caldo, focacce e dolci ogni mattina'},brand,{distance:30}),sz=L.checks(far).find(x=>x.id==='size');
 assert.equal(sz.state,'warn');assert.match(sz.detail,/«Titolo»: lettere maiuscole alte [\d,]+ cm, ne servono circa 85,7 cm/);assert.ok(L.sizeProblems(far).some(x=>x.title));
 assert.ok(!L.blocking(L.checks(far)).some(x=>x.id==='size'),'a warning, not a block');
 const n=L.sizeProblems({spec:L.spec('totem-80x180'),pages:[{items:[{t:'text',s:'x',size:P.mmToPt(10)/.718,label:'Contatti'},{t:'text',s:'y',size:P.mmToPt(13)/.718,label:'Testo'}]}]});
 assert.deepEqual(n.map(x=>[x.label,Math.round(x.cap*10)/10,x.need]),[['Contatti',10,12]]);
});

test('never invent: empty required texts stay placeholders and block the export; contacts and name/logo too',()=>{
 const doc=L.layout('totem-80x180',{...VALUES,headline:''},brand);
 assert.deepEqual(doc.placeholders.map(p=>p.label),['Titolo']);assert.equal(doc.placeholders[0].text,'[Titolo: da completare]');
 assert.ok(!doc.pages[0].items.some(i=>i.t==='text'&&/Titolo/.test(i.s)),'no made-up title');
 const c=L.checks(doc).find(x=>x.id==='content');assert.equal(c.state,'fail');assert.match(c.detail,/Mancano: Titolo\. .*non li inventa/);
 assert.throws(()=>L.exportPdf(doc),/Prima sistema: testi del progetto/);
 assert.match(L.previewSvg(doc),/class="lf-placeholder"[^]*\[Titolo: da completare\]/);
 // no logo and no name, no contacts
 const bare=L.brandFor({},'');const d2=L.layout('banner-300x100',{headline:'Saldi'},bare);
 assert.deepEqual(L.missing({headline:'Saldi'},d2.spec,bare).map(m=>m.key),['name','contacts']);assert.deepEqual(d2.placeholders.map(p=>p.label).sort(),['Contatti','Logo o nome']);
 assert.throws(()=>L.exportPdf(d2),/testi del progetto/);
 // contacts off: no placeholder for them; the vela needs only the name or the logo
 assert.deepEqual(L.layout('banner-300x100',{headline:'Saldi',name:'Forno Aurora'},bare,{contacts:false}).placeholders,[]);
 assert.deepEqual(L.layout('vela-70x250',{},brand).placeholders,[]);
 // nothing is filled in by the studio: prefill takes only what the project says
 const pre=L.prefill(PROFILE);assert.deepEqual([pre.name,pre.headline,pre.cta,pre.body],['Forno Aurora','','','']);assert.equal(pre.website,'www.fornoaurora.it');assert.equal(pre.phone,'011 555 1234');
 assert.deepEqual(L.prefill({}),{name:'',payoff:'',headline:'',body:'',cta:'',phone:'',website:'',email:'',address:''});
});

test('three layouts from the kit (or profile.visual): every format, every variant passes the checks with real texts',()=>{
 for(const f of L.FORMATS)for(const v of L.VARIANTS){const doc=L.layout(f.id,VALUES,brand,{variant:v.id}),cs=L.checks(doc);
  assert.deepEqual(L.blocking(cs).map(c=>c.id+': '+c.detail),[],f.id+' '+v.id);assert.equal(doc.variant,v.id);
  const items=doc.pages[0].items;assert.ok(items.some(i=>i.t==='logo'),'kit logo '+f.id);assert.ok(items.some(i=>i.label==='Titolo'||f.group==='vela'));
  assert.ok(items.filter(i=>i.t==='rect').every(r=>/^#[0-9A-F]{6}$/.test(r.fill)&&Object.values(brand.palette).includes(r.fill)),'only kit colours')}
 const vis=L.brandFor({visual:'Colori: #0B5D4B e #F2C14E, sfondo crema'},'Bottega Verde');assert.equal(vis.source,'visual');assert.equal(vis.palette.primary,'#0B5D4B');assert.equal(vis.palette.secondary,'#F2C14E');
 assert.equal(L.brandFor({},'X').source,'default');assert.equal(brand.source,'kit');
 // the vela pocket: no text or logo in the left 6 cm (+ safe area)
 for(const v of L.VARIANTS){const d=L.layout('vela-85x350',VALUES,brand,{variant:v.id});for(const it of d.pages[0].items)if(it.t==='text'||it.t==='logo')assert.ok(it.x>=60+30-1e-6,v.id+' '+it.label)}
 // same input, same output
 assert.equal(L.previewSvg(L.layout('banner-300x100',VALUES,brand,{variant:'bold'})),L.previewSvg(L.layout('banner-300x100',VALUES,brand,{variant:'bold'})));
});

test('bleed and safe area checks; low-resolution photos warn at 150 dpi of the real size (30 for the 6 × 3 m)',()=>{
 const doc=L.layout('pannello-70x100',VALUES,brand);doc.pages[0].items.push({t:'rect',x:0,y:0,w:100,h:100,fill:brand.palette.accent});
 const b=L.checks(doc).find(c=>c.id==='bleed');assert.equal(b.state,'fail');assert.match(b.detail,/tocca il taglio a sinistra, in alto senza arrivare all’abbondanza/);
 // a 3000 × 2000 px photo on the totem: well under 150 dpi at 80 cm wide → warning, export not blocked
 const photo={src:'data:image/jpeg;base64,AA==',w:3000,h:2000};const t=L.layout('totem-80x180',VALUES,brand,{photo});
 const d=L.checks(t).find(c=>c.id==='dpi');assert.equal(d.state,'warn');assert.match(d.label,/150 dpi/);assert.match(d.detail,/«Foto» a \d+ dpi alla misura reale/);
 const ok=L.layout('totem-80x180',VALUES,brand,{photo:{...photo,w:12000,h:8000}});assert.equal(L.checks(ok).find(c=>c.id==='dpi').state,'ok');
 assert.equal(L.spec('poster-6x3').dpi,30);assert.ok(L.notes(L.layout('poster-6x3',VALUES,brand)).some(n=>/30 dpi alla misura reale \(cioè 300 dpi nel file in scala 1:10\)/.test(n)));
 const cmyk=L.checks(t).find(c=>c.id==='cmyk');assert.equal(cmyk.state,'ok');assert.match(cmyk.detail,/FOGRA39[^]*FOGRA51/);
 // overflow blocks
 const over=L.layout('pannello-70x100',{...VALUES,body:'Lorem '.repeat(40)},brand,{distance:20});assert.equal(L.checks(over).find(c=>c.id==='safe').state,'fail');
});

test('valid PDF bytes: xref, PDF/X-1a-style structure, CMYK only, outlines, for every format',()=>{
 for(const f of L.FORMATS){const bytes=L.exportPdf(L.layout(f.id,VALUES,brand,{variant:'bold'}),{date:DATE}),s=parse(bytes);
  assert.deepEqual(P.checkPdf(bytes),[],f.id);assert.doesNotMatch(s,/\/DeviceRGB|\/Font|\/SMask|\/ExtGState/);assert.match(s,/\/GTS_PDFXVersion \(PDF\/X-1:2003\)/);
  assert.match(s,/\/Producer \(RADIX Studio Stampa \\267 Grande formato\)/)}
 const a=L.exportPdf(L.layout('custom',VALUES,brand,{customW:400,customH:200}),{date:DATE}),b=L.exportPdf(L.layout('custom',VALUES,brand,{customW:400,customH:200}),{date:DATE});
 assert.deepEqual(Buffer.from(a),Buffer.from(b),'deterministic');
 const bx=boxes(ascii(a))[0];assert.deepEqual(bx.trim,[pt(30),pt(30),pt(4030),pt(2030)]);
});

test('the print studio mounts the large format step; the page loads it; no AI, no fetch',()=>{
 const ps=read('lib/print-studio.js');assert.match(ps,/root\.RadixLargeFormatStudio/);assert.match(ps,/'Grande formato'/);assert.match(ps,/LF\.largeFormatStudio\(ctx\)/);
 const src=read('lib/large-format-studio.js');assert.ok(!/RadixAgents|reply\(|fetch\(|XMLHttpRequest/.test(src),'no AI call, no network');
 const html=read('agency/crea.html'),at=s=>html.indexOf(s);assert.ok(at('/lib/print-studio.js')>0&&at('/lib/print-studio.js')<at('/lib/large-format-studio.js')&&at('/lib/large-format-studio.js')<at('/agency/crea.js'));
 const css=read('shell/crea.css');assert.match(css,/\.cr-panel \.large-format-studio \.lf-thumb/);assert.match(css,/\.cr-panel \.print-studio \.pr-modes button\[aria-pressed=true\]\{background:var\(--ma-soft\)/);
 const core=require('../agency/crea-core.js');assert.match(core.card('stampa').line,/grande formato \(totem, banner, vele, pannelli, 6 × 3 m, misura libera\)/);
 assert.equal(core.fromAsk('?q=un totem 80x180').match,'stampa');assert.equal(core.fromAsk('?q=uno striscione 5 metri').match,'stampa');
 // saved in the Art Director thread, like the other print documents
 const e=L.savedEntry(L.layout('totem-80x180',VALUES,brand),'md',{by:'Anna',at:'2026-10-23T10:00:00Z'});assert.equal(e[1].agent,'art-director');assert.equal(e[1].source,'large-format-studio');assert.equal(e[1].largeFormat.format,'totem-80x180');
});
