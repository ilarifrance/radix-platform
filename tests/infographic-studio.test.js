// Studio «Infografica» (lib/infographic-studio.js): fake data only («Forno Aurora», a made-up bakery) and a FAKE agent
// runtime: no network, no credits.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const I=require('../lib/infographic-studio.js'),PS=require('../lib/print-studio.js'),Z=require('../lib/zip-lite.js'),F=require('./fixtures/mockup-forno-aurora.js');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const close=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<=e,a+' ≈ '+b);
const brand=I.brandFor(F.PROFILE,'Forno Aurora');

const NUMERI=`Un anno di Forno Aurora in numeri
Dati di esempio, inventati per la prova

- Pagnotte sfornate: 12.500
- Clienti abituali: 1.240
- +18% di ordini online rispetto al 2024
- 4,8 stelle su Google (312 recensioni)
- Torte su prenotazione: 860
- 38 anni di lievito madre
- 96% di farine dal Piemonte
Fonte: gestionale del forno, 2025 (dati di esempio)`;
const PROCESSO=`Come nasce la nostra pagnotta
1. Rinfresco del lievito madre: ogni sera alle 18, con farina di tipo 1
2. Impasto lento: acqua fredda e poco lievito
3. Riposo di 24 ore in cella a 4 gradi
4. Formatura a mano, una pagnotta alla volta
5. Cottura nel forno a legna a 250 gradi`;
const TIMELINE=`La nostra storia
1987: apertura in via Nizza 12, Torino
1995: arriva il forno a legna
2008: il laboratorio di pasticceria
2024: ordini online e ritiro in negozio
Fonte: archivio di famiglia`;
const TABELLA=`Vendite per prodotto (pezzi)
Prodotto;2024;2025
Pane a lievito madre;5.200;6.100
Focaccia;2.100;2.900
Torte;640;860
Biscotti;1.800;1.650
Fonte: cassa del negozio, dati di esempio`;
const LUNGO='Le nostre 12 farine\n'+[['Tipo 1 del Piemonte',34],['Integrale macinata a pietra',18],['Farro monococco',9],['Segale',7],['Semola rimacinata',8],['Manitoba',6],
 ['Grano tenero tipo 0',5],['Mais per polenta',4],['Grano saraceno',3],['Kamut',2],['Avena',2],['Orzo',2]].map(([l,v])=>'- '+l+': '+v+'%').join('\n')+'\nFonte: ordini al mulino 2025';
const model=(text,o={})=>{const m=I.newModel({projectName:'Forno Aurora',today:'2026-10-23T09:00:00Z'});m.input.text=text;if(o.goal)m.input.goal=o.goal;I.structure(m);if(o.palette)m.palette=o.palette;return m};
const bars=sc=>sc.nodes.filter(n=>n.t==='path'&&n.role==='bar');

// ---- numbers, the Italian way ----
test('numbers are read and written it-IT: thousands with a dot, decimals with a comma',()=>{
 assert.equal(I.readNumber('12.500'),12500);assert.equal(I.readNumber('4,8'),4.8);assert.equal(I.readNumber('1.234.567,25'),1234567.25);assert.equal(I.readNumber('abc'),null);
 assert.equal(I.fmtNum(12500),'12.500');assert.equal(I.fmtNum(1234),'1.234');assert.equal(I.fmtNum(4.8,1),'4,8');assert.equal(I.fmtNum(-1500.5,1),'-1.500,5');assert.equal(I.fmtNum(-0.01,0),'0');
 assert.equal(I.display(18,{unit:'%',sign:'+'}),'+18%');assert.equal(I.display(1250,{unit:'€'}),'1.250 €');assert.equal(I.display(4.8,{dec:1}),'4,8');assert.equal(I.display(NaN),'');
 const t=I.tokens('Ricavi € 1.250, +18% e 4,8 stelle');assert.deepEqual(t.map(x=>[x.value,x.unit,x.sign]),[[1250,'€',''],[18,'%','+'],[4.8,'','']]);
});

// ---- the rules ----
test('a list of numbers: title, subtitle, source and one block per line, with labels and details',()=>{
 const c=I.parseInput(NUMERI);assert.equal(c.title,'Un anno di Forno Aurora in numeri');assert.equal(c.subtitle,'Dati di esempio, inventati per la prova');
 assert.equal(c.source,'gestionale del forno, 2025 (dati di esempio)');assert.equal(c.blocks.length,7);assert.equal(c.kind,'numeri');assert.equal(I.recommended(c,'risultati'),'numeri');
 const by=l=>c.blocks.find(b=>b.label.includes(l));
 assert.equal(by('Pagnotte').value,12500);assert.equal(by('ordini online').value,18);assert.equal(by('ordini online').sign,'+');assert.equal(by('ordini online').unit,'%');
 const st=by('stelle');assert.equal(st.value,4.8);assert.equal(st.dec,1);assert.equal(st.detail,'312 recensioni');
 assert.equal(by('lievito').value,38);assert.equal(by('farine').unit,'%');
});
test('steps keep their numbers as text; a timeline gets its dates and no value from an address',()=>{
 const p=I.parseInput(PROCESSO,{goal:'processo'});assert.equal(p.kind,'processo');assert.equal(p.title,'Come nasce la nostra pagnotta');
 assert.ok(p.blocks.every(b=>b.kind==='passo'&&b.value==null));assert.match(p.blocks[2].label,/24 ore/);assert.equal(I.recommended(p,'processo'),'percorso');
 const t=I.parseInput(TIMELINE,{goal:'storia'});assert.equal(t.kind,'timeline');assert.deepEqual(t.blocks.map(b=>b.when),['1987','1995','2008','2024']);
 assert.equal(t.blocks[0].value,null,'«via Nizza 12» is not a value');assert.match(t.blocks[0].label,/via Nizza 12/);
 assert.equal(I.parseLine('Tipo 1 del Piemonte: 34%').value,34,'the number after the colon');
 const mo=I.parseLine('Febbraio: 1.450');assert.deepEqual([mo.kind,mo.label,mo.value,mo.src],['numero','Febbraio',1450,'tempo'],'a month with its value');
 const vs=I.parseLine('Ordini online: 120 vs 180');assert.equal(vs.value,120);assert.equal(vs.value2,180);
});
test('a table pasted from Excel or a CSV: header with years on top, two series, comparison',()=>{
 const c=I.parseInput(TABELLA,{goal:'confronto'});assert.equal(c.title,'Vendite per prodotto (pezzi)');assert.deepEqual(c.series,['2024','2025']);
 assert.deepEqual(c.blocks.map(b=>[b.label,b.value,b.value2]),[['Pane a lievito madre',5200,6100],['Focaccia',2100,2900],['Torte',640,860],['Biscotti',1800,1650]]);
 assert.equal(c.kind,'confronto');assert.equal(I.recommended(c,'confronto'),'confronto');
 const tab=I.parseInput('Mese\tVisite\nGennaio\t1.200\nFebbraio\t1.450\nMarzo\t1.610');assert.deepEqual(tab.blocks.map(b=>b.value),[1200,1450,1610]);assert.ok(tab.blocks.every(b=>b.src==='tempo'));
});

// ---- grounding ----
test('grounding: a text is grounded only when every number is in the input',()=>{
 const allowed=I.allowedNumbers(NUMERI);
 assert.ok(I.groundedText('Pagnotte sfornate: 12.500',allowed));assert.ok(I.groundedText('4,8 stelle',allowed));assert.ok(I.groundedText('Nessun numero',allowed));
 assert.equal(I.groundedText('Clienti soddisfatti 99%',allowed),false);assert.equal(I.groundedText('12.501 pagnotte',allowed),false);
});
test('parseAi keeps the grounded blocks and drops (and lists) every block, title or subtitle with an invented number',()=>{
 const reply='Ecco: '+JSON.stringify({titolo:'Il 2025 di Forno Aurora: 99 motivi',sottotitolo:'Dati di esempio',serie:null,blocchi:[
  {tipo:'numero',etichetta:'Pagnotte sfornate',valore:'12.500',unita:''},{tipo:'numero',etichetta:'Clienti soddisfatti',valore:'99%',unita:'%'},
  {tipo:'numero',etichetta:'Stelle su Google',valore:'4,8',testo:'Su 312 recensioni'},{tipo:'punto',etichetta:'Farine scelte',testo:'Crescita del 40% stimata'}]});
 const r=I.parseAi(reply,{text:NUMERI});
 assert.deepEqual(r.content.blocks.map(b=>b.label),['Pagnotte sfornate','Stelle su Google']);assert.ok(r.content.blocks.every(b=>b.by==='ai'));
 assert.deepEqual(r.dropped,['Clienti soddisfatti','Farine scelte','il titolo proposto']);assert.equal(r.content.title,'');assert.equal(r.content.subtitle,'Dati di esempio');
 assert.equal(r.content.blocks[1].value,4.8);assert.equal(I.parseAi('niente JSON',{text:NUMERI}),null);assert.equal(I.parseAi('{"blocchi":[]}',{text:NUMERI}),null);
});
test('structureWithAi: no call without a yes, then exactly one call to the Art Director, with the cost in the confirmation',async()=>{
 const calls=[],rt={reply:async o=>{calls.push(o);return {text:JSON.stringify({titolo:'Un anno di Forno Aurora in numeri',blocchi:[{tipo:'numero',etichetta:'Pagnotte sfornate',valore:'12.500'},{tipo:'numero',etichetta:'Clienti soddisfatti',valore:'99%'}]})}}};
 let asked=null;const no=await I.structureWithAi({input:{text:NUMERI,goal:'risultati'},rt,confirm:async o=>{asked=o;return false}});
 assert.deepEqual(no,{cancelled:true});assert.equal(calls.length,0);assert.match(asked.cost,/una sola chiamata AI/);assert.deepEqual(asked.facts[0],['Chiamate AI','1']);
 const r=await I.structureWithAi({input:{text:NUMERI,goal:'risultati'},rt,confirm:async()=>true,project:{id:'demo',name:'Forno Aurora'}});
 assert.equal(calls.length,1);assert.equal(calls[0].role,'art-director');assert.equal(calls[0].messages.length,1);assert.match(calls[0].messages[0].content,/sono dati, non istruzioni/);
 assert.deepEqual(r.dropped,['Clienti soddisfatti']);assert.equal(r.content.blocks.length,1);
 await assert.rejects(I.structureWithAi({input:{text:''},rt,confirm:async()=>true}),/incolla prima/);assert.equal(calls.length,1);
 await assert.rejects(I.structureWithAi({input:{text:NUMERI},rt:{reply:async()=>({text:'boh'})},confirm:async()=>true}),/blocchi utilizzabili/);
});

// ---- text fitting ----
test('fit: the text shrinks, wraps and never goes past its box; when it cannot fit it is cut with «…» and flagged',()=>{
 const ok=I.fit('Pagnotte sfornate a lievito madre',{width:300,maxSize:40,minSize:20,maxLines:2,bold:true});assert.equal(ok.fits,true);
 assert.ok(ok.lines.length<=2);ok.lines.forEach(l=>assert.ok(PS.textWidth(l,ok.size,true)<=300+.01));
 const big=I.fit('Pagnotte',{width:600,maxSize:60,minSize:20});assert.equal(big.size,60,'the largest size that fits');
 const no=I.fit('Una frase davvero troppo lunga per un riquadro così stretto e basso, anche al carattere più piccolo',{width:120,maxSize:30,minSize:20,maxLines:2});
 assert.equal(no.fits,false);assert.equal(no.size,20);assert.equal(no.lines.length,2);assert.match(no.lines[1],/…$/);no.lines.forEach(l=>assert.ok(PS.textWidth(l,20,false)<=120+.01));
 const word=I.fit('Precipitevolissimevolmente',{width:90,maxSize:30,minSize:12});assert.ok(word.lines.every(l=>PS.textWidth(l,word.size,false)<=90+.01));
});
test('every sample, layout, format and palette: no text out of its box, every text at least 4,5:1',()=>{
 const cases=[[NUMERI,'risultati'],[PROCESSO,'processo'],[TIMELINE,'storia'],[TABELLA,'confronto'],[LUNGO,'confronto']];
 for(const [text,goal] of cases)for(const palette of ['brand','neutro','contrasto']){const m=model(text,{goal,palette});m.content.kicker='Dati di esempio';
  for(const fmt of I.FORMAT_IDS)for(const L of ['numeri','percorso','confronto']){const r=I.render(m,brand,fmt,L),tag=goal+' '+palette+' '+fmt+' '+L;
   assert.deepEqual(r.problems,[],tag);
   for(const sc of r.pages){assert.deepEqual(I.contrastProblems(sc),[],tag);
    for(const n of sc.nodes.filter(n=>n.t==='text')){assert.ok(n.box[0]-.5<=n.left&&n.left+n.width<=n.box[1]+.5,tag+': «'+n.s+'» out of its box');assert.ok(n.left>=0&&n.left+n.width<=sc.W,tag+': «'+n.s+'» off the page')}}}}
});
test('overflowProblems reports a text that does not fit; the export checks warn about it',()=>{
 const m=model(NUMERI);m.content.blocks[0].label='Pagnotte '.repeat(40);m.content.blocks[0].detail='Lievito madre '.repeat(30);
 const r=I.render(m,brand,'post','numeri');assert.ok(r.problems.length>0);assert.ok(r.problems.every(p=>p.kind==='fit'));
 const c=I.checksOf(m,brand).find(x=>x.id==='testi');assert.equal(c.state,'warn');assert.ok(c.issues.length>0);
});
test('palettes: text colours reach 4,5:1 even from a pale brand colour; the second series has its own colour',()=>{
 const pale=I.paletteOf('brand',{palette:{primary:'#F5E9A8',secondary:'#FCE4EC',accent:'#FFF59D',dark:'#EEEEEE',light:'#FFFFFF'}});
 for(const pal of [pale,...['brand','neutro','contrasto'].map(id=>I.paletteOf(id,brand))]){
  for(const k of ['ink','ink2','accent'])for(const g of [pal.bg,pal.surface])assert.ok(PS.contrast(pal[k],g)>=4.5,pal.id+' '+k+' on '+g);
  assert.ok(PS.contrast(pal.onBand,pal.band)>=4.5);assert.ok(PS.contrast(pal.bar,pal.surface)>=3,'bars ≥ 3:1');assert.notEqual(pal.bar,pal.bar2)}
});

// ---- scales ----
test('bars: proportional, from zero, one scale for every slide of a carousel',()=>{
 const m=model(LUNGO,{goal:'confronto'}),r=I.render(m,brand,'post','confronto');assert.ok(r.pages.length>=2,'a carousel');
 const all=r.pages.flatMap(bars);assert.equal(all.length,12);const maxes=new Set(all.map(b=>b.max));assert.deepEqual([...maxes],[100],'shares of 100: one scale, 0–100');
 for(const b of all){close(b.w,b.track*b.value/b.max,1e-6);assert.ok(b.value>=0&&b.w<=b.track+1e-9)}
 // ranked from the largest
 const vals=all.map(b=>b.value);assert.deepEqual(vals,[...vals].sort((a,b)=>b-a));
 // pieces: the max is the largest value on every page
 const t=model(TABELLA,{goal:'confronto'}),rt=I.render(t,brand,'a4','confronto'),tb=rt.pages.flatMap(bars);assert.equal(tb.length,8,'two bars per row');
 assert.ok(tb.every(b=>b.max===6100));const x0=new Set(tb.map(b=>Math.round(b.x)));assert.equal(x0.size,1,'every bar starts at the same zero');
 for(const b of tb)close(b.w/b.track,b.value/6100,1e-9);
});
test('no bar compares unlike measures; negative values give no bars',()=>{
 const m=model(NUMERI),g=I.chartGroup(I.visible(m),{goal:'risultati'});assert.equal(g,null,'12.500 pagnotte and 4,8 stelle are not one scale');
 const r=I.render(m,brand,'post','numeri'),b=r.pages.flatMap(bars);assert.deepEqual(b.map(x=>[x.value,x.max]),[[96,100]],'only the share of 100');
 const neg=model('Risultati\n- Gennaio: -5%\n- Febbraio: 12%\n- Marzo: 8%',{goal:'confronto'});const gn=I.chartGroup(I.visible(neg),{goal:'confronto'});assert.equal(gn.negative,true);
 assert.equal(I.render(neg,brand,'post','confronto').pages.flatMap(bars).length,0);assert.equal(I.checksOf(neg,brand).find(c=>c.id==='scala').state,'warn');
});

// ---- carousel ----
test('split: balanced pages of at most «per»; a long list becomes a carousel of 1080×1350 slides',()=>{
 assert.deepEqual(I.split([1,2,3,4,5,6,7,8],7).map(p=>p.length),[4,4]);assert.deepEqual(I.split([1,2,3,4,5,6,7],7).map(p=>p.length),[7]);
 assert.deepEqual(I.split([...Array(15).keys()],7).map(p=>p.length),[5,5,5]);assert.deepEqual(I.split([],7).map(p=>p.length),[0]);
 const m=model(LUNGO,{goal:'confronto'}),r=I.render(m,brand,'post','confronto');assert.equal(r.pages.length,2);assert.ok(r.per<=I.PER_PAGE);
 r.pages.forEach((sc,i)=>{assert.equal(sc.W,1080);assert.equal(sc.H,1350);assert.ok(sc.nodes.some(n=>n.t==='text'&&n.s===(i+1)+' / 2'),'page number')});
 assert.ok(r.pages.every(sc=>bars(sc).length<=I.PER_PAGE));
});

// ---- checks ----
test('checks: no content blocks the export; numbers without a source and numbers not in the text are flagged',()=>{
 const empty=I.newModel({});empty.content={title:'',subtitle:'',source:'',blocks:[],series:null,kind:'elenco',notes:[]};
 const ce=I.checksOf(empty,brand);assert.equal(ce[0].id,'contenuti');assert.equal(ce[0].state,'fail');assert.equal(I.blocking(ce).length,1);
 const m=model(NUMERI);let c=I.checksOf(m,brand);for(const id of ['contenuti','testi','contrasto','fonte','numeri'])assert.equal(c.find(x=>x.id===id).state,'ok',id);
 m.content.source='';c=I.checksOf(m,brand);assert.equal(c.find(x=>x.id==='fonte').state,'warn');
 m.content.blocks[0].value=13000;c=I.checksOf(m,brand);const n=c.find(x=>x.id==='numeri');assert.equal(n.state,'warn');assert.deepEqual(n.issues,['Pagnotte sfornate']);
 assert.equal(I.blocking(c).length,0,'warnings ask, they do not block');
 const steps=model(PROCESSO,{goal:'processo'});assert.equal(I.checksOf(steps,brand).find(x=>x.id==='fonte').state,'ok','no numbers: the source is not required');
});
test('the text drawn is the text of the blocks, it-IT, and the hidden blocks are not drawn',()=>{
 const m=model(NUMERI);m.content.blocks.find(b=>b.value===38).hidden=true;const svg=I.render(m,brand,'post','numeri').pages.map(I.toSvg).join('');
 for(const s of ['12.500','1.240','+18%','4,8','96%','Fonte: gestionale del forno'])assert.ok(svg.includes(s),s);assert.ok(!svg.includes('>38<'));assert.ok(!/12500|4\.8/.test(svg));
 assert.match(svg,/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 1080 1350"/);
});

// ---- files ----
test('files: SVG and PNG for every size, a vector PDF for print, LEGGIMI.txt; the zip reads back',async()=>{
 const m=model(NUMERI);m.content.kicker='Dati di esempio';const pngs=[];const png=async(svg,w,h)=>{pngs.push([w,h]);return new Uint8Array([137,80,78,71,w%256,h%256])};
 const list=await I.files(m,brand,{png,date:new Date('2026-10-23T09:00:00Z'),sizes:['post','storia','a4','a3']});const names=list.map(f=>f.name);
 const base='infografica-un-anno-di-forno-aurora-in-numeri';
 for(const n of ['post-1080x1350/'+base+'-post-1080x1350.svg','post-1080x1350/'+base+'-post-1080x1350.png','storia-1080x1920/'+base+'-storia-1080x1920.png','a4/'+base+'-a4.pdf','a3/'+base+'-a3.pdf','a3/'+base+'-a3.png','LEGGIMI.txt'])assert.ok(names.includes(n),n);
 assert.deepEqual(pngs,[[1080,1350],[1080,1920],[2480,3508],[3508,4961]]);
 const pdf=Buffer.from(list.find(f=>f.name.endsWith('-a4.pdf')).data).toString('latin1');assert.match(pdf,/^%PDF-1\./);assert.match(pdf,/\/MediaBox \[0 0 595\.\d+ 841\.\d+\]/);assert.ok(pdf.includes('<'+Buffer.from('12.500').toString('hex').toUpperCase()+'>'),'12.500 as text in the PDF');
 const a3=Buffer.from(list.find(f=>f.name.endsWith('-a3.pdf')).data).toString('latin1');assert.match(a3,/\/MediaBox \[0 0 841\.\d+ 1190\.\d+\]/);
 const txt=list.find(f=>f.name==='LEGGIMI.txt').data;assert.match(txt,/letta da RADIX con regole fisse, senza AI/);assert.match(txt,/Fonte in calce: gestionale del forno/);assert.match(txt,/Etichetta in alto: «Dati di esempio»/);
 const back=Z.unzip(I.bundle(list,{date:new Date('2026-10-23T09:00:00Z')}));assert.deepEqual(back.map(f=>f.name),names);
 // a carousel: one file per slide
 const long=await I.files(model(LUNGO,{goal:'confronto'}),brand,{sizes:['post']});assert.deepEqual(long.filter(f=>f.name.endsWith('.svg')).map(f=>f.name.replace(/^.*-(\d)\.svg$/,'$1')),['1','2']);
 const empty=I.newModel({});empty.content={title:'',subtitle:'',source:'',blocks:[],series:null,kind:'elenco',notes:[]};await assert.rejects(I.files(empty,brand,{sizes:['post']}),/Prima sistema/);
 await assert.rejects(I.files(m,brand,{sizes:[]}),/almeno un formato/);
});

// ---- saved in the project ----
test('saved in the «agents» document under infographics, at most 12, and agents-page.js keeps the key',async()=>{
 let store={schemaVersion:1,conversations:{c1:{x:1}},prefs:{a:1}};const ws={bind:(id,name)=>{assert.equal(id,'demo');assert.equal(name,'agents');return {load:async()=>store,save:async d=>{store=d}}}};
 const m=model(NUMERI),rec=I.savedRecord(m,{by:'Giulia',at:'2026-10-23T09:00:00.000Z'});assert.equal(rec.id,'infografica-20261023090000');assert.equal(rec.blocks,7);assert.equal(rec.title,'Un anno di Forno Aurora in numeri');
 await I.saveToProject(ws,'demo',rec);assert.deepEqual(store.conversations,{c1:{x:1}});assert.equal(store.infographics.items.length,1);assert.equal(I.readStore(store).items[0].model.content.blocks.length,7);
 let s={schemaVersion:1,items:[]};for(let i=0;i<15;i++)s=I.addRecord(s,{...rec,id:'infografica-'+i});assert.equal(s.items.length,12);assert.equal(s.items[11].id,'infografica-14');
 assert.deepEqual(I.readStore({infographics:{items:[null,{id:'x'}]}}).items,[]);
 const ap=read('agents-page.js');assert.ok((ap.match(/data\.infographics=fresh\.infographics/g)||[]).length>=2);assert.match(ap,/if\(d\.infographics\)out\.infographics=d\.infographics/);
});

// ---- wiring ----
test('the card in «Cosa vuoi fare», the studio in crea.js and crea.html, the icon and the styles',()=>{
 const core=require('../agency/crea-core.js'),card=core.CARDS.find(c=>c.id==='infografica');assert.equal(card.group,'Immagini');assert.equal(card.inline,'infographic');assert.match(card.cost,/Nessuna chiamata AI/);assert.match(card.cost,/1 chiamata AI/);
 assert.match(read('agency/crea.js'),/infographic:\{global:'RadixInfographicStudio'/);assert.match(read('agency/crea.html'),/<script src="\/lib\/infographic-studio.js"><\/script>/);
 assert.match(read('agency/marketing-look.js'),/infografica:'infographic'/);assert.match(read('shell/crea.css'),/\.infographic-studio \.ig-work\{/);
});
test('the studio makes its one AI call only through rt.reply, never a direct fetch, and names no model',()=>{
 const src=read('lib/infographic-studio.js');assert.equal((src.match(/rt\.reply\(/g)||[]).length,1);assert.ok(!/\bfetch\(/.test(src));assert.ok(!/claude-|gpt-|sonnet|opus|haiku/i.test(src));
 assert.equal(I.AGENT,'art-director');assert.equal(I.MAX_BLOCKS,21);assert.equal(I.PER_PAGE,7);
});
