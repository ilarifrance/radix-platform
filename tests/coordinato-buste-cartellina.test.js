'use strict';
// «Coordinato aziendale», the remaining stationery (B5): envelopes DL, C5 and C4 with or without a window, the folder with
// its pocket and its die line in a separate PDF, the dashed lines of the PDF writer, the Word and PowerPoint templates
// (.dotx, .potx), the signature on a white plate for dark mode, and the options kept in the saved record.
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../lib/coordinato-studio.js'),PS=require('../lib/print-studio.js'),PX=require('../lib/pptx-lite.js'),ZIP=require('../lib/zip-lite.js');

const LOGO='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 96"><circle cx="48" cy="48" r="30" fill="#2F5D50"/><circle cx="60" cy="38" r="10" fill="#E3B448"/><text x="92" y="60" font-family="Fraunces, serif" font-size="34" font-weight="700" fill="#1C1C1E">Forno Aurora</text></svg>';
const KIT={brand:'Forno Aurora',direction:'Bottega di quartiere',palette:[{role:'primary',hex:'#2F5D50'},{role:'secondary',hex:'#A0522D'},{role:'accent',hex:'#E3B448'},{role:'dark',hex:'#1C1C1E'},{role:'light',hex:'#FAF6EE'}],fonts:[{heading:'Fraunces',body:'Inter'}],logo:LOGO};
const PROFILE={identityKit:KIT};
const COMPANY={ragione:'Forno Aurora S.r.l.',piva:'01234567897',indirizzo:'Via Nizza 12, 10125 Torino',telefono:'011 555 1234',email:'ciao@fornoaurora.it',sito:'www.fornoaurora.it',payoff:'Pane a lievito madre dal 1987',altri:'REA TO-123456'};
const PEOPLE=[{nome:'Giulia Rossi',ruolo:'Titolare',email:'giulia@fornoaurora.it',telefono:''}];
const model=(o={})=>C.modelOf({direction:'classico',company:COMPANY,people:PEOPLE,...o},PROFILE,{projectName:'Forno Aurora'});
const DATE=new Date('2026-10-22T10:00:00Z');
const PNG=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);
const latin=b=>Buffer.from(b).toString('latin1');
const boxes=bytes=>[...latin(bytes).matchAll(/\/MediaBox \[([^\]]+)\] \/BleedBox \[([^\]]+)\] \/TrimBox \[([^\]]+)\]/g)].map(m=>m.slice(1).map(x=>x.split(' ').map(Number)));
const near=(a,b,msg)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<.01,msg+': '+a.join(' ')+' ≠ '+b.join(' ')));
const inside=(bb,z)=>bb.x1>z.x&&bb.x0<z.x+z.w&&bb.y1>z.y&&bb.y0<z.y+z.h;
const boxOf=it=>it.t==='text'?{x0:it.x,x1:it.x+PS.ptToMm(PS.textWidth(it.s,it.size,it.bold)),y0:it.y-PS.ptToMm(it.size*.718),y1:it.y+PS.ptToMm(it.size*.207)}:it.t==='logo'?{x0:it.x,x1:it.x+it.w,y0:it.y,y1:it.y+it.h}:null;

test('envelope options: DL by default, C5 and C4 on request, window none / right / left; unknown values fall back',()=>{
 assert.deepEqual(C.ENVELOPES.map(e=>[e.id,e.w,e.h]),[['dl',220,110],['c5',229,162],['c4',229,324]]);
 assert.deepEqual(model().envelope,{formats:['dl'],window:'nessuna'});
 assert.deepEqual(C.envelopeOf({formats:['c4','x','dl'],window:'sopra'}),{formats:['dl','c4'],window:'nessuna'},'ordered, unknown dropped');
 assert.deepEqual(C.envelopeOf({formats:[]}).formats,['dl'],'never no envelope when the piece is chosen');
 assert.deepEqual(C.folderOf(),{pocket:true});assert.deepEqual(C.folderOf({pocket:false}),{pocket:false});
 // the window: 90 × 45 mm, 20 mm from the side, 50 mm from the top (where the recipient sits on the letter)
 assert.deepEqual(C.windowRect(C.ENVELOPES[0],'destra'),{x:110,y:50,w:90,h:45});
 assert.deepEqual(C.windowRect(C.ENVELOPES[2],'sinistra'),{x:20,y:50,w:90,h:45});
 assert.equal(C.windowRect(C.ENVELOPES[0],'nessuna'),null);
 assert.deepEqual(C.addressZone(C.ENVELOPES[0],'nessuna'),C.ENVELOPE.address,'without a window: the address zone of the DL');
 assert.deepEqual(C.addressZone(C.ENVELOPES[1],'destra'),{x:116,y:47,w:96,h:51},'the window plus 3 mm: the letter moves');
 assert.equal(C.envelopeName('c5','destra'),'busta-c5-finestra-destra.pdf');assert.equal(C.envelopeName('dl','nessuna'),'busta-dl.pdf');
});

test('envelopes: every format and window keeps sender and logo out of the window, all checks green',async()=>{
 for(const window of ['nessuna','destra','sinistra'])for(const d of ['classico','moderno','audace']){
  const m=model({direction:d,envelope:{formats:['dl','c5','c4'],window}}),docs=C.printDocs(m).filter(x=>x.id==='busta');
  assert.deepEqual(docs.map(x=>x.doc.envelope),['dl','c5','c4']);
  for(const x of docs){const z=x.doc.zone;assert.deepEqual(x.doc.warnings,[],x.name);
   for(const it of x.doc.pages[0].items){const bb=boxOf(it);if(bb)assert.ok(!inside(bb,z),window+' '+d+' '+x.name+': «'+it.label+'» in the free zone')}
   if(window!=='nessuna')assert.deepEqual(x.doc.window,C.windowRect(C.ENVELOPES.find(e=>e.id===x.doc.envelope),window))}
  const cs=C.checksOf(m);assert.deepEqual(cs.filter(c=>c.state!=='ok').map(c=>c.id),[],window+' '+d+': '+JSON.stringify(cs.filter(c=>c.state!=='ok')))}
 // a logo in the window is caught and blocks the export
 const m=model({envelope:{formats:['dl'],window:'destra'}}),built=C.build(m),env=built.docs.find(x=>x.id==='busta').doc;
 env.pages[0].items.push({t:'logo',x:120,y:60,w:30,h:10,label:'Logo'});
 const safe=C.checksOf(m,built).find(c=>c.id==='safe');assert.equal(safe.state,'fail');assert.ok(safe.issues.some(x=>/Busta DL: «Logo» entra nella finestra/.test(x)));
 // the PDFs: right sizes with bleed, one per format, the window is not printed
 const files=await C.kitFiles(model({pieces:['busta'],envelope:{formats:['dl','c5','c4'],window:'destra'}}),{date:DATE});
 assert.deepEqual(files.map(f=>f.name),['coordinato/stampa/busta-dl-finestra-destra.pdf','coordinato/stampa/busta-c5-finestra-destra.pdf','coordinato/stampa/busta-c4-finestra-destra.pdf','coordinato/LEGGIMI.txt']);
 for(const [f,[w,h]] of [[files[0],[220,110]],[files[1],[229,162]],[files[2],[229,324]]]){assert.deepEqual(PS.checkPdf(f.data),[],f.name);const [media,bleed,trim]=boxes(f.data)[0],want=C.pdfBoxes(w,h);near(media,want.media,f.name);near(bleed,want.bleed,f.name);near(trim,want.trim,f.name)}
 const readme=files.at(-1).data;assert.match(readme,/Finestra a destra: 90 × 45 mm, a 20 mm dal bordo destro e 50 mm dall’alto/);assert.match(readme,/confronta la sagoma con le buste del fornitore/);assert.match(readme,/C4 229 × 324 mm \(A4 non piegato\)/);
});

test('folder with pocket: the sheet grows by the pocket flap, colour only on the flap, inside mirrored; without pocket as before',()=>{
 for(const d of ['classico','moderno','audace']){const doc=C.folderDoc(model({direction:d}));
  assert.equal(doc.pocket,true);assert.deepEqual(doc.pages.map(p=>[p.w,p.h]),[[440,410],[440,410]]);assert.deepEqual(doc.pages[0].folds,[220]);
  assert.deepEqual(doc.warnings,[],d);assert.deepEqual(PS.bleedProblems(doc),[],d);
  // nothing but colour on the flap (it is seen upside down from the inside)
  for(const it of doc.pages[0].items){if(it.t==='rect')continue;const bb=boxOf(it);assert.ok(bb.y1<=310,d+': «'+it.label+'» on the pocket flap')}
  assert.ok(doc.pages[0].items.some(it=>it.t==='rect'&&it.x===12&&it.w===196&&it.y+it.h>=413),d+': the accent strip at the pocket mouth, to the bleed');
  const plain=C.folderDoc(model({direction:d,folder:{pocket:false}}));assert.deepEqual(plain.pages.map(p=>[p.w,p.h]),[[440,310],[440,310]]);assert.equal(plain.pocket,false)}
 assert.deepEqual(C.printDocs(model({folder:{pocket:false}})).filter(x=>/cartellina/.test(x.name)).map(x=>x.name),['cartellina-a4.pdf'],'no die line without the pocket');
});

test('die line: a closed outline on the sheet, creases dashed, magenta 100 %, its own PDF that passes the print checks',async()=>{
 const d=C.folderDie();assert.equal(d.w,440);assert.equal(d.h,410);
 // the outer cut is one closed path: every end point is shared by exactly two outline segments
 const outer=d.cut.slice(0,8),key=(x,y)=>x+','+y,deg={};for(const [x1,y1,x2,y2] of outer){deg[key(x1,y1)]=(deg[key(x1,y1)]||0)+1;deg[key(x2,y2)]=(deg[key(x2,y2)]||0)+1}
 assert.ok(Object.values(deg).every(n=>n===2),'closed outline');
 for(const [x1,y1,x2,y2] of d.cut.concat(d.crease))for(const [x,y] of [[x1,y1],[x2,y2]])assert.ok(x>=0&&x<=440&&y>=0&&y<=410,'inside the sheet');
 assert.ok(d.crease.some(l=>l[0]===220&&l[2]===220&&l[1]===0&&l[3]===310),'the spine crease');assert.ok(d.crease.some(l=>l[1]===310&&l[3]===310),'the pocket crease');
 const doc=C.folderDieDoc(model());assert.equal(doc.guide,true);
 const lines=doc.pages[0].items.filter(i=>i.t==='line');assert.ok(lines.every(l=>l.stroke===C.DIE));assert.ok(lines.filter(l=>l.dash).length===d.crease.length);
 assert.deepEqual(PS.inkFor(C.DIE,'line'),[0,100,0,0],'pure magenta');
 const files=await C.kitFiles(model({pieces:['cartellina']}),{date:DATE}),pdf=files.find(f=>f.name.endsWith('cartellina-fustella.pdf')).data,s=latin(pdf);
 assert.deepEqual(PS.checkPdf(pdf),[]);assert.match(s,/q \[4 2\] 0 d 0 1 0 0 K 0\.5 w /,'creases dashed in magenta');assert.ok(!/\/Font\b/.test(s));
 const [media]=boxes(pdf)[0];near(media,C.pdfBoxes(440,410).media,'same sheet as the artwork');
 // the die line is a guide: kept out of the palette, contrast and text checks
 const cs=C.checksOf(model({pieces:['cartellina']}));assert.deepEqual(cs.filter(c=>c.state!=='ok').map(c=>c.id),[]);
 const readme=files.find(f=>f.name.endsWith('LEGGIMI.txt')).data;assert.match(readme,/foglio aperto 440 × 410 mm/);assert.match(readme,/linea continua = taglio, tratteggio = cordonatura/);
});

test('print-studio: a dashed line in the print PDF and in the preview, solid lines unchanged',()=>{
 const doc={format:'x',title:'t',margin:0,brand:model().brand,values:{},dpi:300,warnings:[],pages:[{label:'P',w:50,h:50,folds:[],items:[{t:'line',x1:0,y1:0,x2:50,y2:50,stroke:'#000000',width:.5,dash:[3,1]},{t:'line',x1:0,y1:50,x2:50,y2:0,stroke:'#000000',width:.5}]}]};
 const s=latin(PS.pdf(doc,{mode:'print',pdfx:true,date:DATE}));assert.equal((s.match(/q \[3 1\] 0 d /g)||[]).length,1);assert.deepEqual(PS.checkPdf(s),[]);
 const svg=PS.previewSvg(doc,0,{guides:false});assert.equal((svg.match(/stroke-dasharray="1\.058 0\.353"/g)||[]).length,1);
});

test('Office templates: .dotx and .potx next to .docx and .pptx, with the template content types',async()=>{
 const m=model(),dotx=C.docxLetterhead(m,{logo:{data:PNG,w:480,h:144},date:DATE,template:true}),r=C.docxInspect(dotx);assert.deepEqual(r.problems,[]);
 const ct=new TextDecoder().decode(ZIP.unzip(dotx).find(f=>f.name==='[Content_Types].xml').data);assert.match(ct,/wordprocessingml\.template\.main\+xml/);assert.ok(!/wordprocessingml\.document\.main/.test(ct));
 const potx=PX.inspect(C.pptxTemplate(m,{date:DATE,template:true}));assert.deepEqual(potx.problems,[]);assert.equal(potx.template,true);assert.equal(potx.slides,3);
 assert.equal(PX.inspect(C.pptxTemplate(m,{date:DATE})).template,false);
 const files=await C.kitFiles(model({pieces:['office']}),{date:DATE});
 assert.deepEqual(files.map(f=>f.name),['coordinato/modelli-office/carta-intestata.docx','coordinato/modelli-office/carta-intestata.dotx','coordinato/modelli-office/presentazione.pptx','coordinato/modelli-office/presentazione.potx','coordinato/LEGGIMI.txt']);
 assert.match(files.at(-1).data,/\.dotx e presentazione\.potx sono gli stessi file come modelli/);
});

test('signature: white plate for dark mode by default; the logo PNG for the signature is asked on white',async()=>{
 const m=model();for(const d of ['classico','moderno','audace']){const html=C.signatureHtml(model({direction:d}),PEOPLE[0]);assert.deepEqual(C.darkModeProblems(html),[],d);assert.match(html,/^<!--[^>]*--><table role="presentation" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="[^"]*max-width:520px;background-color:#FFFFFF"/)}
 assert.equal(C.darkModeProblems(C.signatureHtml(m,null,{style:{darkSafe:false}})).length,1);
 const asked=[];const files=await C.kitFiles(model({pieces:['firma','office']}),{date:DATE,logoPng:async(svg,o)=>{asked.push(o&&o.bg||'trasparente');return {data:PNG,w:480,h:144,dataUrl:'data:image/png;base64,iVBORw0KGgo='}}});
 assert.deepEqual(asked.sort(),['#FFFFFF','trasparente'],'Office gets the transparent logo, the signature the one on white');
 assert.ok(files.some(f=>f.name.endsWith('logo-firma.png')));
});

test('saved record keeps the envelope and folder options and reopens them',()=>{
 const m=model({envelope:{formats:['c5','c4'],window:'sinistra'},folder:{pocket:false}}),rec=C.savedRecord(m,{at:'2026-10-22T10:00:00.000Z'});
 assert.deepEqual(rec.envelope,{formats:['c5','c4'],window:'sinistra'});assert.deepEqual(rec.folder,{pocket:false});
 const back=C.fromRecord(rec,PROFILE,{projectName:'Forno Aurora'});assert.deepEqual(back.envelope,m.envelope);assert.deepEqual(back.folder,m.folder);
 assert.deepEqual(C.fromRecord({direction:'classico',company:COMPANY},PROFILE,{}).envelope,{formats:['dl'],window:'nessuna'},'older records: the DL without window, as before');
});
