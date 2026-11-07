'use strict';
// Studio «Etichette e packaging» (lib/packaging-studio.js): the card in «Cosa vuoi fare», the 14 allergens in bold
// (with the false friends), the EAN-13 checked and never invented, the linear nutrition declaration, the geometry and
// die lines of every format, the x-height measured on the drawn texts, the net quantity figures, the print PDFs with
// bleed and crop marks, the die line on its own PDF, the zip, no AI and no network, the saved key «packaging» that
// agents-page.js keeps. Fake data only (Forno Aurora, DATI DI ESEMPIO).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const K=require('../lib/packaging-studio.js'),PS=require('../lib/print-studio.js'),ZIP=require('../lib/zip-lite.js');
const F=require('./fixtures/packaging-forno-aurora.js');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const DATE=new Date('2026-10-23T09:00:00Z'),BRAND=K.brandFor(F.PROFILE,'Forno Aurora');
const latin=b=>Buffer.from(b).toString('latin1');
const model=(over={})=>K.modelOf(JSON.parse(JSON.stringify({...F.BAG,...over})));
const textOf=doc=>doc.pages[0].items.filter(it=>it.t==='text').map(it=>it.s).join(' ');

test('card in Crea (Stampa e documenti), studio wired, agents doc keeps «packaging»',()=>{
 const core=require('../agency/crea-core.js'),card=core.CARDS.find(c=>c.id==='packaging');
 assert.equal(card.title,'Etichette e packaging');assert.equal(card.group,'Stampa e documenti');assert.equal(card.inline,'packaging');assert.match(card.cost,/Nessuna chiamata AI/);
 assert.ok(read('agency/crea.html').includes('/lib/packaging-studio.js'));assert.match(read('agency/crea.js'),/RadixPackagingStudio/);
 const ap=read('agents-page.js');assert.match(ap,/data\.packaging=fresh\.packaging/);assert.match(ap,/if\(d\.packaging\)out\.packaging=d\.packaging/);
 assert.equal(typeof K.packagingStudio,'function');
 const w=read('lib/packaging-studio.js');assert.match(w,/pf-drop pk-drop/);assert.match(w,/'cs-note'/);assert.match(read('shell/crea.css'),/\.packaging-studio \.pk-legal-list/);
});

test('no AI and no network in the studio',()=>{
 const w=read('lib/packaging-studio.js');
 for(const re of [/fetch\(/,/XMLHttpRequest/,/\/api\/chat/,/RadixAI|askClaude|runtime\.(chat|complete)/,/claude-[a-z0-9]|gpt-\d/])assert.doesNotMatch(w,re,String(re));
});

test('allergens in bold: the 14 of Annex II, never the false friends, nothing after «senza»',()=>{
 const e=K.emphasize('Farina di frumento, burro, uova, latte intero, nocciole, semi di sesamo, senape, sedano, soia, arachidi, lupini, molluschi, crostacei, pesce, anidride solforosa');
 assert.equal(e.found.length,14);
 const bold=e.runs.filter(r=>r.bold).map(r=>r.s.toLowerCase());assert.ok(bold.includes('frumento')&&bold.includes('burro')&&bold.includes('uova'));
 const no=K.emphasize('Burro di cacao, latte di cocco, noce moscata, senza glutine');assert.deepEqual(no.found,[]);assert.ok(no.runs.every(r=>!r.bold));
 const forced=K.emphasize('Zucchero, **farro**');assert.ok(forced.runs.some(r=>r.bold&&r.s==='farro'));
});

test('EAN-13: check digit verified, bars only for a valid code, nothing invented',()=>{
 assert.equal(K.eanCheck('200123456789'),3);
 assert.equal(K.eanStatus('2001234567893').state,'ok');assert.equal(K.eanStatus('').state,'empty');
 const bad=K.eanStatus('2001234567890');assert.equal(bad.state,'bad');assert.match(bad.error,/dovrebbe essere 3/);
 assert.equal(K.eanStatus('12345').state,'bad');
 assert.equal(K.eanModules('2001234567893').bits.length,95);
 // a label with no code draws no bars; a wrong code blocks the export
 const none=model({variants:F.VARIANTS.map(v=>({...v,ean:''}))}),d=K.draw(none,BRAND,0);
 assert.ok(!d.pages[0].items.some(it=>/EAN|barre/i.test(it.label||'')));
 const wrong=model({variants:[{...F.VARIANTS[0],ean:'2001234567890'}]}),cs=K.checksOf(wrong,BRAND);
 assert.equal(cs.find(c=>c.id==='ean').state,'fail');assert.ok(K.blocking(cs).some(c=>c.id==='ean'));
 const ok=K.draw(model(),BRAND,0);assert.ok(ok.ean&&ok.ean.placed);assert.ok(ok.ean.scale>=K.EAN.MIN);
});

test('nutrition: linear text only when complete, the person’s numbers as typed',()=>{
 const n=K.nutrition(F.VARIANTS[0]);assert.equal(n.complete,true);assert.match(n.text,/2010 kJ \/ 480 kcal/);assert.match(n.text,/sale 0,30 g/);
 const part=K.nutrition({nutr:{kj:'1000',kcal:'240'}});assert.equal(part.complete,false);assert.equal(part.text,'');assert.equal(part.missing.length,6);
 const d=K.draw(model({variants:[{...F.VARIANTS[0],nutr:{kj:'1000'}}]}),BRAND,0);assert.doesNotMatch(textOf(d),/1000 kJ/);
});

test('every format and style: die line closed, texts in the safe area, mandatory texts present',()=>{
 for(const f of K.FORMATS)for(const s of K.STYLES){const m=model({format:f.id,size:f.def,style:s.id,infoOn:true});
  const g=K.geometry(f.id,f.def);assert.ok(g.cut.length>=1,f.id);assert.ok(g.w>0&&g.h>0);
  const docs=m.variants.map((v,i)=>K.draw(m,BRAND,i)),cs=K.checksOf(m,BRAND,{docs});
  assert.equal(cs.find(c=>c.id==='sicura').state,'ok',f.id+' '+s.id+' '+JSON.stringify(cs.find(c=>c.id==='sicura').issues));
  if(!f.lid)assert.match(textOf(docs[0]).replace(/\s+/g,' '),/Biscotti/,f.id);
  const die=K.dieDoc(m,BRAND);assert.ok(die.pages[0].items.every(it=>it.t!=='path'||it.stroke==='#FF00FF'),f.id)}
});

test('x-height measured on the drawn texts: 1,2 mm for food, small packs 0,9 mm',()=>{
 const tiny=model({format:'rettangolare',size:[70,50]}),cs=K.checksOf(tiny,BRAND);
 const x=cs.find(c=>c.id==='xheight');assert.equal(x.state,'fail');assert.match(x.detail,/Minimo 1,2 mm/);assert.ok(K.blocking(cs).some(c=>c.id==='xheight'));
 const big=model({format:'rettangolare',size:[148,105]}),d=K.draw(big,BRAND,0),ls=K.legalSize(d);
 assert.ok(ls.xh>=1.2,String(ls.xh));assert.equal(K.checksOf(big,BRAND).find(c=>c.id==='xheight').state,'ok');
 assert.ok(Math.abs(K.xHeightMm(10)-10*25.4/72*K.xRatio())<1e-9);
 // the sample bag topper passes at its real size
 assert.equal(K.checksOf(model(),BRAND).find(c=>c.id==='xheight').state,'ok');
});

test('net quantity: figures at least as tall as the legal table',()=>{
 assert.equal(K.netMinFigure(40),2);assert.equal(K.netMinFigure(150),3);assert.equal(K.netMinFigure(250),4);assert.equal(K.netMinFigure(1500),6);
 assert.equal(K.netOf('250 g').grams,250);assert.equal(K.netOf('0,75 l').grams,750);assert.equal(K.netOf('qb'),null);
 assert.equal(K.checksOf(model(),BRAND).find(c=>c.id==='netta').state,'ok');
});

test('legal checklist «da verificare»: food (1169/2011) and cosmetics (1223/2009)',()=>{
 const fm=model(),food=K.legalChecklist(fm,fm.variants.map((v,i)=>K.draw(fm,BRAND,i)));const ids=food.map(r=>r.id);
 for(const id of ['denominazione','ingredienti','allergeni','quid','netta','data','conservazione','operatore','lotto','nutrizionale','xheight'])assert.ok(ids.includes(id),id);
 const cm=K.modelOf(F.COSMETIC),cos=K.legalChecklist(cm,cm.variants.map((v,i)=>K.draw(cm,BRAND,i))).map(r=>r.id);for(const id of ['responsabile','contenuto','durata','precauzioni','lotto','funzione','inci'])assert.ok(cos.includes(id),id);
});

test('files: print PDFs per variant (PDF/X, bleed, crop marks), die line PDF, mockup SVG, LEGGIMI; zip',async()=>{
 const m=model(),list=await K.files(m,BRAND,{date:DATE}),names=list.map(x=>x.name);
 assert.deepEqual(names.filter(n=>/^stampa\//.test(n)).length,2);assert.ok(names.includes('fustella/fustella-cavaliere.pdf'));
 assert.equal(names.filter(n=>/^mockup\/.*\.svg$/.test(n)).length,2);assert.ok(names.includes('LEGGIMI.txt'));
 for(const x of list.filter(x=>/\.pdf$/.test(x.name))){assert.deepEqual(PS.checkPdf(x.data),[],x.name);const s=latin(x.data);
  assert.match(s,/\/TrimBox/,x.name);assert.match(s,/\/BleedBox/,x.name);assert.match(s,/\/OutputIntent|\/GTS_PDFX/,x.name)}
 const p=latin(list.find(x=>/^stampa\/.*classici\.pdf$/.test(x.name)).data);
 const tb=/\/TrimBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(p).slice(1).map(Number),mm=pt=>pt*25.4/72;
 assert.ok(Math.abs(mm(tb[2]-tb[0])-150)<.1&&Math.abs(mm(tb[3]-tb[1])-140)<.1,'sheet 150 × 140 mm (topper folded 150 × 70)');
 assert.ok(Math.abs(mm(tb[0])-(3+6))<.2||mm(tb[0])>=3,'bleed around the trim');
 const die=latin(list.find(x=>/^fustella/.test(x.name)).data),dtb=/\/TrimBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(die).slice(1).map(Number);assert.deepEqual(dtb,tb,'die line on the same page size');
 const svg=Buffer.from(list.find(x=>/^mockup\/.*classici/.test(x.name)).data).toString('utf8');assert.match(svg,/^<svg|<\?xml/);assert.match(svg,/FF00FF/i);
 const txt=Buffer.from(list.find(x=>x.name==='LEGGIMI.txt').data).toString('utf8');assert.match(txt,/da verificare/i);assert.match(txt,/DATI DI ESEMPIO/);assert.match(txt,/1169\/2011/);
 const z=K.bundle(list,{date:DATE}),back=ZIP.unzip(z);assert.equal(Object.keys(back).length,list.length);
});

test('saved under «packaging»: texts and settings, the illustration only by name',()=>{
 const m=model({illustration:{name:'spiga.png',w:1200,h:900,src:'data:image/png;base64,AAAA'}}),rec=K.savedRecord(m,{by:'Giulia QA',at:'2026-10-23T09:00:00.000Z'});
 assert.equal(rec.model.illustration.src,undefined);assert.equal(rec.model.illustration.name,'spiga.png');assert.equal(rec.variants,2);
 const s=K.withRecord(rec)(K.readStore({}));assert.equal(s.items.length,1);
 const again=K.readStore({packaging:s});assert.equal(again.items[0].model.name,'Biscotti di meliga');assert.deepEqual(K.readStore({packaging:'x'}).items,[]);
 const back=K.modelOf(again.items[0].model);assert.equal(back.variants[1].ean,F.VARIANTS[1].ean);
});

test('prefill: producer from the profile, never invented',()=>{
 const a=K.prefill({legal:{ragioneSociale:'Forno Aurora S.r.l.',address:'Via Nizza 12, 10125 Torino'}},{});assert.match(a.producer||'',/Forno Aurora S\.r\.l\..*Via Nizza 12/);
 const none=K.prefill({},{});assert.equal(none.producer||'','');
 const m=K.newModel({profile:{},projectName:'X'});assert.equal(m.variants[0].ingredients,'');assert.equal(m.variants[0].ean,'');assert.deepEqual(Object.values(m.variants[0].nutr||{}).filter(Boolean),[]);
});
