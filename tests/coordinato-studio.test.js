'use strict';
// Studio «Coordinato aziendale» (lib/coordinato-studio.js): company data never invented, the three deterministic layouts,
// the print PDFs (sizes in points, bleed boxes, PDF/X-1a-style re-read), the safe areas (print, envelope address zone,
// social covers), contrast and palette colours, the email signature rules, the .docx and .pptx packages, the zip, the
// saved key coordinato that agents-page.js keeps, and the card in «Cosa vuoi fare».
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const C=require('../lib/coordinato-studio.js'),PS=require('../lib/print-studio.js'),PX=require('../lib/pptx-lite.js'),ZIP=require('../lib/zip-lite.js');
const crea=require('../agency/crea-core.js'),look=require('../agency/marketing-look.js');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');

const LOGO='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 96"><circle cx="48" cy="48" r="30" fill="#2F5D50"/><circle cx="60" cy="38" r="10" fill="#E3B448"/><text x="92" y="60" font-family="Fraunces, serif" font-size="34" font-weight="700" fill="#1C1C1E">Forno Aurora</text></svg>';
const KIT={brand:'Forno Aurora',direction:'Bottega di quartiere',palette:[{role:'primary',hex:'#2F5D50'},{role:'secondary',hex:'#A0522D'},{role:'accent',hex:'#E3B448'},{role:'dark',hex:'#1C1C1E'},{role:'light',hex:'#FAF6EE'}],fonts:[{heading:'Fraunces',body:'Inter'}],logo:LOGO};
const PROFILE={identityKit:KIT,contacts:{phone:'011 555 1234',email:'ciao@fornoaurora.it',website:'www.fornoaurora.it',address:'Via Nizza 12, 10125 Torino'},piva:'IT 01234567897'};
const COMPANY={ragione:'Forno Aurora S.r.l.',piva:'01234567897',indirizzo:'Via Nizza 12, 10125 Torino',telefono:'011 555 1234',email:'ciao@fornoaurora.it',sito:'www.fornoaurora.it',payoff:'Pane a lievito madre dal 1987',altri:'REA TO-123456'};
const PEOPLE=[{nome:'Giulia Rossi',ruolo:'Titolare',email:'giulia@fornoaurora.it',telefono:''},{nome:'Marco Bianchi',ruolo:'Laboratorio',email:'',telefono:'333 123 4567'}];
const model=(o={})=>C.modelOf({direction:'classico',company:COMPANY,people:PEOPLE,...o},PROFILE,{projectName:'Forno Aurora'});
const DATE=new Date('2026-10-22T10:00:00Z');
const PNG=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);
const fakeLogo=async()=>({data:PNG,w:480,h:144,dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='});
const latin=b=>Buffer.from(b).toString('latin1');
const boxes=(bytes)=>[...latin(bytes).matchAll(/\/MediaBox \[([^\]]+)\] \/BleedBox \[([^\]]+)\] \/TrimBox \[([^\]]+)\]/g)].map(m=>m.slice(1).map(x=>x.split(' ').map(Number)));
const near=(a,b,msg)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<.01,msg+': '+a.join(' ')+' ≠ '+b.join(' ')));

test('P. IVA: 11 digits, «IT» or spaces in front are fine, the check digit is verified',()=>{
 assert.equal(C.pivaOf('IT 012 345 678 97'),'01234567897');assert.equal(C.pivaOf('P. IVA 01234567897 · REA'),'01234567897');assert.equal(C.pivaOf('123'),'');assert.equal(C.pivaOf('012345678971'),'','12 digits are not a P. IVA');
 assert.equal(C.pivaValid('01234567897'),true);assert.equal(C.pivaValid('01234567890'),false);assert.equal(C.pivaValid('00000000000'),false);assert.equal(C.pivaValid('abc'),false);
});

test('prefill: from the project and the client, never invented; missing fields are listed',()=>{
 const p=C.prefill(PROFILE,{projectName:'Forno Aurora',clientName:'Forno Aurora S.r.l.'});
 assert.deepEqual(p.values,{ragione:'Forno Aurora S.r.l.',piva:'01234567897',indirizzo:'Via Nizza 12, 10125 Torino',telefono:'011 555 1234',email:'ciao@fornoaurora.it',sito:'www.fornoaurora.it',payoff:'',altri:''});
 assert.equal(p.from.ragione,'cliente');assert.equal(p.from.telefono,'progetto');
 // contacts written in the project notes are found; nothing else is made up
 const q=C.prefill({identityKit:KIT,notes:'Via Roma 3, Bergamo. Tel 035 123 4567'},{projectName:'Forno'});
 assert.equal(q.values.telefono,'035 123 4567');assert.match(q.values.indirizzo,/^Via Roma 3/);
 for(const k of ['ragione','piva','email','sito'])assert.equal(q.values[k],'',k+' left blank');
 assert.deepEqual(C.missing(C.company(q.values)),['ragione','piva','email','sito']);
 const empty=C.prefill({},{});for(const k of Object.keys(empty.values))assert.equal(empty.values[k],'',k);
 assert.equal(C.hasKit(PROFILE),true);assert.equal(C.hasKit({}),false,'no kit: the studio shows its empty state');assert.equal(C.hasKit({identityKit:{brand:'X'}}),false,'a kit without palette is not enough');
});

test('three deterministic layouts: Classico, Moderno, Audace from the print-studio variants; same input, same output',()=>{
 assert.deepEqual(C.DIRECTIONS.map(d=>[d.id,d.title,d.print]),[['classico','Classico','classic'],['moderno','Moderno','minimal'],['audace','Audace','bold']]);
 const sig=d=>JSON.stringify(C.build(model({direction:d})));
 for(const d of ['classico','moderno','audace'])assert.equal(sig(d),sig(d),d+' is deterministic');
 assert.notEqual(sig('classico'),sig('moderno'));assert.notEqual(sig('moderno'),sig('audace'));
 const m=model({direction:'audace'}),docs=C.printDocs(m);
 assert.deepEqual(docs.map(x=>x.name),['biglietto-giulia-rossi.pdf','biglietto-marco-bianchi.pdf','carta-intestata-a4.pdf','busta-dl.pdf','cartellina-a4.pdf'],'one business card per person');
 for(const x of docs)assert.equal(x.doc.variant,'bold');
 // the person's direct contacts win on the card, the company's fill the rest
 const giulia=docs[0].doc.pages[1].items.filter(i=>i.t==='text').map(i=>i.s),marco=docs[1].doc.pages[1].items.filter(i=>i.t==='text').map(i=>i.s);
 assert.ok(giulia.includes('giulia@fornoaurora.it')&&giulia.includes('011 555 1234'));assert.ok(marco.includes('333 123 4567')&&marco.includes('ciao@fornoaurora.it'));
 // no person: one company card
 assert.deepEqual(C.printDocs(model({people:[]})).filter(x=>x.id==='biglietto').map(x=>x.name),['biglietto.pdf']);
 // pieces can be left out
 assert.deepEqual(C.printDocs(model({pieces:['carta','firma']})).map(x=>x.id),['carta']);
});

test('print PDFs: sizes in points with 3 mm bleed and crop marks, front and back, CMYK PDF/X-1a-style re-read',async()=>{
 const m=model({direction:'moderno'}),files=await C.kitFiles(m,{date:DATE});
 const pdf=n=>files.find(f=>f.name==='coordinato/stampa/'+n).data;
 // business card 85 × 55 mm: page = trim + 3 mm bleed + 6 mm slug per side = 103 × 73 mm
 const card=boxes(pdf('biglietto-giulia-rossi.pdf'));assert.equal(card.length,2,'front and back');
 for(const [media,bleed,trim] of card){near(media,[0,0,291.969,206.929],'MediaBox');near(bleed,[17.008,17.008,274.961,189.921],'BleedBox');near(trim,[25.512,25.512,266.457,181.417],'TrimBox')}
 near([trimW(card[0][2]),trimH(card[0][2])],[240.945,155.906],'85 × 55 mm in points');
 const expect={'carta-intestata-a4.pdf':[210,297,1],'busta-dl.pdf':[220,110,1],'cartellina-a4.pdf':[440,310,2]};
 for(const [n,[w,h,pages]] of Object.entries(expect)){const b=boxes(pdf(n)),want=C.pdfBoxes(w,h);assert.equal(b.length,pages,n);for(const [media,bleed,trim] of b){near(media,want.media,n);near(bleed,want.bleed,n);near(trim,want.trim,n)}}
 near(C.pdfBoxes(220,110).media,[0,0,674.646,362.835],'DL envelope page');
 for(const f of files.filter(f=>/\.pdf$/.test(f.name))){assert.deepEqual(PS.checkPdf(f.data),[],f.name);const s=latin(f.data);assert.ok(!/\/Font\b/.test(s),'texts as outlines');assert.match(s,/GTS_PDFX/);
  const crops=(s.match(/0\.25 w /g)||[]).length;assert.ok(crops>=8,'crop marks: '+f.name)}
 // the folder carries fold marks (dashed) on its fold
 assert.match(latin(pdf('cartellina-a4.pdf')),/\[2 1\] 0 d/);
 // the logo stays vector: its circle is drawn with curves, no image
 assert.ok(!/\/Subtype \/Image/.test(latin(pdf('biglietto-giulia-rossi.pdf'))));
});
const trimW=t=>t[2]-t[0],trimH=t=>t[3]-t[1];

test('checks: all green with complete data; missing data is a warning and stays blank, never invented',()=>{
 for(const d of ['classico','moderno','audace']){const cs=C.checksOf(model({direction:d}));
  assert.deepEqual(cs.filter(c=>c.state!=='ok').map(c=>c.id),[],d+': '+JSON.stringify(cs.filter(c=>c.state!=='ok')));
  assert.deepEqual(cs.map(c=>c.id),['dati','piva','bleed','safe','size','fonts','colours','contrast','ink','firma','logo'])}
 const m=model({company:{...COMPANY,piva:'',email:'',sito:''}}),cs=C.checksOf(m),by=id=>cs.find(c=>c.id===id);
 assert.equal(by('dati').state,'warn');assert.deepEqual(by('dati').issues,['Partita IVA','Email','Sito web']);assert.equal(by('piva').state,'warn');
 assert.deepEqual(C.blocking(cs),[],'missing data does not block: a warning before the export');
 const letter=C.letterDoc(m).pages[0].items.filter(i=>i.t==='text').map(i=>i.s).join(' | ');
 assert.ok(!/P\. IVA/.test(letter),'no P. IVA invented');assert.ok(!/@/.test(letter.replace('ciao@','')),'no email invented');
 assert.equal(by('dati').detail.includes('non li inventa'),true);
 // a P. IVA with the wrong check digit is flagged
 assert.match(C.checksOf(model({company:{...COMPANY,piva:'01234567890'}})).find(c=>c.id==='dati').detail,/cifra finale/);
 // fonts: the fallback is named
 assert.match(cs.find(c=>c.id==='fonts').detail,/Helvetica[^]*Fraunces e Inter[^]*Arial, Helvetica, sans-serif/);
});

test('safe areas: text and logo inside the print safe area, the envelope address zone free, covers inside the visible area',()=>{
 const m=model();
 for(const x of C.printDocs(m))assert.deepEqual(x.doc.warnings,[],x.name);
 // a contact line too long for the card is caught (safe area or text under 6 pt)
 const long=C.checksOf(model({people:[{nome:'Giulia',ruolo:'Titolare',email:'amministrazione.ufficio.ordini.e.consegne@fornoaurora-panificio-artigianale.it'}]}));
 assert.ok(long.some(c=>(c.id==='safe'||c.id==='size')&&c.state==='fail'),'long text flagged');
 // envelope: nothing in the address zone
 const z=C.ENVELOPE.address;for(const d of ['classico','moderno','audace'])for(const it of C.envelopeDoc(model({direction:d})).pages[0].items){if(it.t!=='text'&&it.t!=='logo')continue;const x1=it.t==='logo'?it.x+it.w:it.x+PS.ptToMm(PS.textWidth(it.s,it.size,it.bold));assert.ok(x1<=z.x||it.y<z.y-2,d+' '+it.label)}
 // covers: logo and every text inside the safe area, also with a long payoff; a moved item is flagged
 assert.deepEqual(C.COVERS.map(c=>[c.id,c.w,c.h]),[['linkedin',1584,396],['facebook',1640,624],['youtube',2560,1440]]);
 assert.deepEqual(C.COVERS.find(c=>c.id==='youtube').safe,{x:507,y:508,w:1546,h:423},'YouTube: 1546 × 423 centred');
 for(const d of ['classico','moderno','audace'])for(const payoff of ['',COMPANY.payoff,'Pane a lievito madre, focacce e torte su ordinazione ogni giorno dal 1987 nel cuore di San Salvario'])for(const spec of C.COVERS){
  const L=C.coverLayout(spec,model({direction:d,company:{...COMPANY,payoff}}));assert.deepEqual(C.coverProblems(L),[],d+' '+spec.id+' «'+payoff+'»');
  assert.ok(L.items.some(i=>i.t==='logo'),'the logo is on the cover')}
 const L=C.coverLayout(C.COVERS[0],m);const moved={...L,items:L.items.map(i=>i.t==='logo'?{...i,x:10}:i)};
 assert.equal(C.coverProblems(moved).length,1,'the logo under the LinkedIn profile photo is flagged');
 assert.match(C.coverSvg(L),/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 1584 396"/);assert.match(C.coverSvg(L,{guides:true}),/stroke-dasharray/);
});

test('contrast AA and palette colours: every text readable on its background, only the kit colours plus black and white',()=>{
 const issues=C.contrastIssues([{t:'rect',x:0,y:0,w:100,h:100,fill:'#FAF6EE'},{t:'text',x:5,y:20,s:'Ciao',size:9,bold:false,fill:'#E3B448',label:'Testo'}],{box:it=>({x0:it.x,x1:it.x+10,y0:it.y-3,y1:it.y+1})});
 assert.equal(issues.length,1);assert.equal(issues[0].need,4.5);assert.ok(issues[0].ratio<3);
 const big=C.contrastIssues([{t:'text',x:5,y:20,s:'Titolo',size:24,bold:true,fill:'#767676',label:'Titolo'}],{box:it=>({x0:it.x,x1:it.x+10,y0:it.y-3,y1:it.y+1})});
 assert.deepEqual(big,[],'large text needs 3:1 only');
 const m=model();assert.deepEqual(C.offPalette([{t:'rect',fill:'#2f5d50'},{t:'text',fill:'#000000'},{t:'line',stroke:'#FFFFFF'}],m.brand),[]);
 assert.deepEqual(C.offPalette([{t:'rect',fill:'#FF0000'}],m.brand),['#FF0000']);
 // a palette whose primary is light: the texts on it switch to the dark neutral and stay AA
 const pale={...PROFILE,identityKit:{...KIT,palette:KIT.palette.map(c=>c.role==='primary'?{...c,hex:'#F3D9A4'}:c)}};
 for(const d of ['classico','moderno','audace']){const mm=C.modelOf({direction:d,company:COMPANY,people:PEOPLE},pale,{});const cs=C.checksOf(mm);assert.equal(cs.find(c=>c.id==='contrast').state,'ok',d);assert.equal(cs.find(c=>c.id==='colours').state,'ok',d)}
});

test('email signature: tables and inline styles, ≤ 600 px, readable without images, no external URL except the site',()=>{
 const m=model();
 for(const d of ['classico','moderno','audace'])for(const logo of [null,{src:'data:image/png;base64,iVBORw0KGgo=',w:480,h:144}])for(const p of [null,PEOPLE[0],PEOPLE[1]]){
  const html=C.signatureHtml(model({direction:d}),p,{logo});assert.deepEqual(C.signatureProblems(html,m),[],d+' '+(logo?'logo':'testo'));
  assert.match(html,/<table role="presentation"/);assert.ok(!/<style|class=|<script|<link/i.test(html));
  const urls=[...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map(x=>x[1].replace(/&amp;/g,'&'));
  for(const u of urls)assert.ok(/^(mailto:|tel:\+\d+$|data:image\/png;base64,|https:\/\/www\.fornoaurora\.it$)/.test(u),'only the site link: '+u);
  for(const w of [...html.matchAll(/width(?:="(\d+)|:(\d+)px)/g)].map(x=>+(x[1]||x[2])))assert.ok(w<=600,'width '+w);
  const text=html.replace(/<[^>]+>/g,' ');assert.ok(text.includes('Forno Aurora'),'the name is text, not only the logo');if(p)assert.ok(text.includes(p.nome))}
 // the HTML file: a plain page around the fragment
 const page=C.signaturePage(C.signatureHtml(m,PEOPLE[0]),'Firma');assert.match(page,/^<!doctype html>/);assert.deepEqual(C.signatureProblems(page,m),[]);
 // the hosted logo is used only when it is https on the client's own site
 const png={w:480,h:144,dataUrl:'data:image/png;base64,AAAA'};
 assert.equal(C.logoSource(model({logoUrl:'https://www.fornoaurora.it/img/logo-firma.png'}),png).hosted,true);
 assert.equal(C.logoSource(model({logoUrl:'https://cdn.altrosito.com/logo.png'}),png).src,png.dataUrl,'another domain: the data URI stays');
 assert.equal(C.logoSource(model({logoUrl:'http://www.fornoaurora.it/logo.png'}),png).src,png.dataUrl,'no plain http');
 assert.equal(C.logoSource(model(),null),null,'no PNG, no hosted logo: text only');
 const hosted=C.signatureHtml(model({logoUrl:'https://www.fornoaurora.it/logo-firma.png'}),null,{logo:C.logoSource(model({logoUrl:'https://www.fornoaurora.it/logo-firma.png'}),png)});
 assert.deepEqual(C.signatureProblems(hosted,m),[]);
 // what the rules catch
 assert.ok(C.signatureProblems('<table><tr><td><img src="https://tracker.example.com/p.gif" alt="x">Forno Aurora</td></tr></table>',m).some(x=>/esterno/.test(x)));
 assert.ok(C.signatureProblems('<table width="700"><tr><td>Forno Aurora</td></tr></table>',m).some(x=>/700/.test(x)));
 assert.ok(C.signatureProblems('<style>td{}</style><table><tr><td>Forno Aurora</td></tr></table>',m).length);
 assert.ok(C.signatureProblems('<table><tr><td><img src="data:image/png;base64,AA=="></td></tr></table>',m).some(x=>/alternativo|nome/.test(x)));
 assert.match(C.signatureText(m,PEOPLE[0]),/^-- \nGiulia Rossi\nTitolare · Forno Aurora\n/);
});

test('Word letterhead: a minimal OOXML package, well formed, header with the logo, footer with the company data',()=>{
 const m=model();
 const bytes=C.docxLetterhead(m,{logo:{data:PNG,w:480,h:144},date:DATE}),r=C.docxInspect(bytes);
 assert.deepEqual(r.problems,[]);assert.equal(r.parts[0],'[Content_Types].xml');
 assert.deepEqual(r.parts.slice().sort(),['[Content_Types].xml','_rels/.rels','docProps/app.xml','docProps/core.xml','word/_rels/document.xml.rels','word/_rels/header1.xml.rels','word/document.xml','word/footer1.xml','word/header1.xml','word/media/logo.png','word/styles.xml']);
 assert.equal(r.logo,true);assert.match(r.header,/<wp:inline\b[^]*r:embed="rId1"/);assert.match(r.header,/011 555 1234/);
 assert.match(r.footer,/Forno Aurora S\.r\.l\. · P\. IVA 01234567897 · REA TO-123456/);
 assert.ok(r.texts.includes('[Testo della lettera]'));assert.ok(r.texts.includes('Giulia Rossi'),'the first person signs the template');
 const files=ZIP.unzip(bytes),styles=new TextDecoder().decode(files.find(f=>f.name==='word/styles.xml').data);assert.match(styles,/w:ascii="Inter"/);assert.match(styles,/w:sz w:val="21"/);
 const doc=new TextDecoder().decode(files.find(f=>f.name==='word/document.xml').data);assert.match(doc,/<w:pgSz w:w="11906" w:h="16838"\/>/,'A4');
 // without the PNG (no browser): the name as text, no media part, still valid
 const plain=C.docxInspect(C.docxLetterhead(m,{date:DATE}));assert.deepEqual(plain.problems,[]);assert.equal(plain.logo,false);assert.match(plain.header,/Forno Aurora/);
 // the checker sees a broken package
 const broken=ZIP.zip(ZIP.unzip(bytes).filter(f=>f.name!=='word/footer1.xml'));assert.ok(C.docxInspect(broken).problems.some(p=>/footer1/.test(p)));
});

test('PowerPoint template: the kit theme and three slides',()=>{
 const r=PX.inspect(C.pptxTemplate(model(),{logo:{data:PNG,w:480,h:144},date:DATE}));
 assert.deepEqual(r.problems,[]);assert.equal(r.slides,3);assert.equal(r.media.length,1);
 assert.ok(r.texts[2].includes('Grazie')&&r.texts[2].includes('www.fornoaurora.it'));
});

test('the zip: stationery, signature with its PNG and instructions, covers, Office templates, LEGGIMI',async()=>{
 const m=model(),files=await C.kitFiles(m,{date:DATE,logoPng:fakeLogo,png:async(svg,w,h)=>new Uint8Array([w>>8,w&255,h>>8,h&255])});
 const names=files.map(f=>f.name);
 assert.deepEqual(names,['coordinato/stampa/biglietto-giulia-rossi.pdf','coordinato/stampa/biglietto-marco-bianchi.pdf','coordinato/stampa/carta-intestata-a4.pdf','coordinato/stampa/busta-dl.pdf','coordinato/stampa/cartellina-a4.pdf',
  'coordinato/firma-email/firma-giulia-rossi.html','coordinato/firma-email/firma-giulia-rossi.txt','coordinato/firma-email/firma-marco-bianchi.html','coordinato/firma-email/firma-marco-bianchi.txt','coordinato/firma-email/logo-firma.png',
  'coordinato/social/linkedin-1584x396.svg','coordinato/social/linkedin-1584x396.png','coordinato/social/facebook-1640x624.svg','coordinato/social/facebook-1640x624.png','coordinato/social/youtube-2560x1440.svg','coordinato/social/youtube-2560x1440.png',
  'coordinato/modelli-office/carta-intestata.docx','coordinato/modelli-office/presentazione.pptx','coordinato/LEGGIMI.txt']);
 const sig=files.find(f=>f.name.endsWith('firma-giulia-rossi.html')).data;assert.match(sig,/src="data:image\/png;base64,/);assert.deepEqual(C.signatureProblems(sig,m),[]);
 const readme=files.find(f=>f.name.endsWith('LEGGIMI.txt')).data;assert.match(readme,/data URI\)\. Gmail e alcune caselle tolgono queste immagini/);assert.match(readme,/logo-firma\.png/);assert.match(readme,/\.dotx/);assert.match(readme,/\[ok\] Contrasto AA/);
 const zip=C.bundle(files,{date:DATE});assert.deepEqual(ZIP.unzip(zip).map(f=>f.name),names);
 assert.equal(C.zipName(m),'coordinato-forno-aurora-classico.zip');
 // missing data: listed in LEGGIMI, the export still works, nothing invented
 const gap=await C.kitFiles(model({company:{...COMPANY,piva:''},pieces:['carta']}),{date:DATE});
 assert.match(gap.find(f=>f.name.endsWith('LEGGIMI.txt')).data,/DATI MANCANTI[^]*- Partita IVA/);
 // only the chosen pieces
 assert.deepEqual((await C.kitFiles(model({pieces:['firma'],people:[]}),{date:DATE})).map(f=>f.name),['coordinato/firma-email/firma.html','coordinato/firma-email/firma.txt','coordinato/LEGGIMI.txt']);
});

test('saved in the project: key coordinato in the agents document, every other key kept, retried on a conflict; agents-page keeps it',async()=>{
 const m=model();let stored={schemaVersion:1,conversations:{'art-director':[{role:'user',content:'ciao'}]},prefs:{a:1},events:{schemaVersion:1,items:[{id:'e'}]},coordinato:{schemaVersion:1,items:[{id:'old'}]}},conflicts=1;
 class ConflictError extends Error{}
 const ws={ConflictError,bind:(pid,name)=>{assert.equal(pid,'forno');assert.equal(name,'agents');return {load:async()=>JSON.parse(JSON.stringify(stored)),save:async d=>{if(conflicts-->0)throw new ConflictError('x');stored=d}}}};
 const rec=C.savedRecord(m,{by:'Ilaria',at:'2026-10-22T10:00:00.000Z'});
 assert.equal(rec.id,'coordinato-20261022100000');assert.equal(rec.direction,'classico');assert.deepEqual(rec.people.map(p=>p.nome),['Giulia Rossi','Marco Bianchi']);assert.ok(rec.checks.every(c=>c.state==='ok'));
 await C.saveToProject(ws,'forno',rec);
 assert.deepEqual(stored.coordinato.items.map(x=>x.id),['old',rec.id]);assert.deepEqual(stored.events,{schemaVersion:1,items:[{id:'e'}]});assert.deepEqual(stored.prefs,{a:1});assert.equal(stored.conversations['art-director'].length,1);
 for(let i=0;i<12;i++)await C.saveToProject(ws,'forno',{...rec,id:'c'+i});assert.equal(stored.coordinato.items.length,10,'only the last 10');
 assert.deepEqual(C.readStore({coordinato:'boh'}),{schemaVersion:1,items:[]});
 const back=C.fromRecord(rec,PROFILE,{projectName:'Forno Aurora'});assert.deepEqual(back.company,m.company);assert.equal(JSON.stringify(C.build(back)),JSON.stringify(C.build(m)),'reopened as it was');
 const src=read('agents-page.js'),fn=/function clean\(d\)\{[^\n]*\}/.exec(src)[0],ctx={MAX_KEPT:40};vm.createContext(ctx);vm.runInContext(fn+';this.clean=clean',ctx);
 const kept=ctx.clean({...stored,conversations:{a:[{role:'user',content:'x'},{role:'assistant',content:'…',pending:true}]}});
 assert.deepEqual(JSON.parse(JSON.stringify(kept.coordinato)),stored.coordinato,'coordinato kept by agents-page clean()');assert.equal(kept.conversations.a.length,1);
 assert.match(src,/\n\s+data\.coordinato=fresh\.coordinato;data\.seoResults=fresh\.seoResults;/,'kept after a save conflict');
 assert.match(src,/if\(fresh&&data\)\{[^}]*data\.coordinato=fresh\.coordinato;/,'and when the tab comes back');
});

test('the card in «Cosa vuoi fare»: Brand, inline studio, free, a kit, its icon, its script and its styles',()=>{
 const c=crea.card('coordinato');assert.equal(c.group,'Brand');assert.equal(c.title,'Coordinato aziendale');assert.equal(c.inline,'coordinato');assert.equal(crea.linkFor(c,'forno'),null);
 assert.match(c.cost,/^Nessuna chiamata AI/);assert.deepEqual(crea.costBadge(c),{tone:'free',label:'Gratis, senza AI'});assert.match(c.hint,/non li inventa/);
 assert.ok(crea.kits().some(k=>k.id==='coordinato'));assert.equal(crea.best('carta intestata e busta'),'coordinato');assert.ok(look.has(look.CARDS.coordinato));
 const js=read('agency/crea.js');assert.match(js,/coordinato:\{global:'RadixCoordinatoStudio'[^}]*agent:'art-director'\}/);
 assert.match(js,/S\.coordinatoStudio\(\{project,profile:current\.profile,projectName:current\.name,clientName:current\.client_name\|\|''[^\n]*openIdentity:\(\)=>openInline\(core\.card\('identita'\)\)/,'the empty state opens the Kit identità studio');
 const html=read('agency/crea.html');assert.ok(html.indexOf('/lib/coordinato-studio.js')>html.indexOf('/lib/print-studio.js')&&html.indexOf('/lib/coordinato-studio.js')<html.indexOf('/agency/crea.js'));
 const css=read('shell/crea.css');assert.match(css,/\.cr-panel \.coordinato-studio \.co-check\[data-state=fail\]/);assert.match(css,/\.coordinato-studio \.co-person\{display:grid/);
 const src=read('lib/coordinato-studio.js');assert.match(src,/'ad-dir co-dir'/,'the three layouts get the «Scelta» ring');assert.ok(!/RadixAgents|\/api\/chat|reply\(/.test(src),'no AI call anywhere');
 assert.match(src,/sandbox','allow-same-origin'/,'the signature preview runs no script');
});
