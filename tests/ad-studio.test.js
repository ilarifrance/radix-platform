'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const A=require('../lib/ad-studio.js'),Z=require('../lib/zip-lite.js');
const root=path.join(__dirname,'..');

test('specs table: every platform format at its exact size, stories with the 14% / 20% safe zones',()=>{
 const size=Object.fromEntries(A.FORMATS.map(f=>[f.id,[f.w,f.h]]));
 assert.deepEqual(size,{'meta-1x1':[1080,1080],'meta-4x5':[1080,1350],'meta-9x16':[1080,1920],'gd-191':[1200,628],'gd-1x1':[1200,1200],'gd-300x250':[300,250],'gd-728x90':[728,90],'li-191':[1200,627]});
 assert.deepEqual(A.PLATFORMS.map(p=>p.id),['meta-feed','meta-stories','google-display','linkedin']);
 for(const f of A.FORMATS)assert.ok(A.platform(f.platform),f.id);
 assert.deepEqual(A.format('meta-9x16').safe,{top:.14,bottom:.2});
 assert.deepEqual(A.FORMATS.filter(f=>f.light).map(f=>f.id),['gd-300x250','gd-728x90'],'small banners are text-light');
 assert.deepEqual(A.formatsFor(['linkedin','meta-stories']).map(f=>f.id),['meta-9x16','li-191']);
 assert.deepEqual(A.groupsFor(['google-display','meta-feed','meta-stories']),['visual','meta','google']);
 assert.equal(A.IMAGES.length,4);assert.ok(A.IMAGES.find(i=>i[0]==='ai')[2].includes('con conferma'));
 const n=A.normalize({goal:'Evento',platforms:['boh']});assert.deepEqual(n,{goal:'Evento',platforms:['meta-feed'],cta:'Iscriviti',image:'brand'});
 // the platform limits
 const max=(g,k)=>A.COPY[g].fields.find(f=>f.key===k).max;
 assert.equal(max('meta','primary'),125);assert.equal(max('meta','headline'),40);assert.equal(max('google','headlines'),30);assert.equal(max('google','longHeadline'),90);
 assert.equal(max('google','descriptions'),90);assert.equal(max('google','business'),25);assert.equal(max('linkedin','intro'),150);assert.equal(max('linkedin','headline'),70);
});

test('safe-zone layout math: in every format and layout the text boxes stay inside the safe area',()=>{
 const s=A.safeArea(A.format('meta-9x16'));
 assert.equal(s.y,Math.round(1920*.14));assert.equal(1920-(s.y+s.h),Math.round(1920*.2));assert.ok(s.x>0&&s.x+s.w<1080);
 for(const f of A.FORMATS)for(const [id] of A.LAYOUTS){const lay=A.layout(f,id),S=A.safeArea(f);
  assert.equal(lay.id,id);
  for(const b of A.textBoxes(lay)){assert.ok(A.inside(b,S),f.id+' '+id+' '+JSON.stringify(b)+' not in '+JSON.stringify(S));assert.ok(b.w>0&&b.h>0,f.id+' '+id)}
  assert.ok(lay.text.h>=(f.h<=120?40:f.w<=400?60:150),f.id+' '+id+' text box too small: '+lay.text.h)}
 assert.equal(A.layout(A.format('gd-728x90'),'banda').shape,'strip');assert.ok(A.layout(A.format('gd-728x90'),'banda').cta,'the leaderboard has its own button box');
 assert.equal(A.layout(A.format('meta-1x1'),'zzz').id,'banda','unknown layout → default');
 // stories: the band reaches the bottom edge, the text stops above the 20% zone
 const lay=A.layout(A.format('meta-9x16'),'banda');assert.equal(lay.panel.y+lay.panel.h,1920);assert.ok(lay.text.y+lay.text.h<=1920*.8);
 assert.equal(A.textRatio([{x:0,y:0,w:108,h:108}],A.format('meta-1x1')),.01);
 assert.equal(A.ratioWarn(A.format('meta-1x1'),.25),true);assert.equal(A.ratioWarn(A.format('gd-728x90'),.25),false,'banners are text by design');
});

test('contrast: WCAG ratios, AA thresholds and the measured percentile',()=>{
 assert.equal(A.contrast('#000000','#FFFFFF'),21);assert.equal(A.contrast('#FFF','#FFF'),1);
 assert.equal(A.contrast('#777777','#FFFFFF'),4.48);
 assert.equal(A.level(4.48,false),'Insufficiente');assert.equal(A.level(4.48,true),'AA');assert.equal(A.level(7.2,false),'AAA');
 assert.equal(A.needOf(true),3);assert.equal(A.needOf(false),4.5);
 assert.equal(A.bestText('#14342B',['#F7F5F0','#151816']),'#F7F5F0');assert.equal(A.bestText('#F7F5F0',['#F7F5F0','#151816']),'#151816');
 // white text: on a mostly dark background with a few light pixels the 10th percentile still sees the light patch
 const dark=Array(80).fill([20,20,20]),light=Array(20).fill([240,240,240]);
 assert.ok(A.measuredContrast('#FFFFFF',dark)>15);assert.ok(A.measuredContrast('#FFFFFF',dark.concat(light))<1.2);
 assert.equal(A.measuredContrast('#FFFFFF',[]),null);
});

test('brand: Kit identità first, then the «Identità visiva» text, then neutral colours',()=>{
 const kit={brand:'Forno Aurora',direction:'Crosta',palette:[{role:'primary',hex:'#2B1D16'},{role:'accent',hex:'#E8A33D'},{role:'dark',hex:'#1A1410'},{role:'light',hex:'#F7F1E8'}],fonts:[{heading:'Playfair Display',body:'Inter'}],logo:'<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>'};
 const b=A.brandOf({name:'Forno Aurora — Torino'},{identityKit:kit});
 assert.equal(b.source,'kit');assert.equal(b.colors.primary,'#2B1D16');assert.equal(b.font.heading,'Playfair Display');assert.ok(b.logo);assert.equal(b.name,'Forno Aurora');assert.ok(b.colors.secondary,'missing roles are filled');
 assert.equal(A.brandOf({name:'X',visual:'Copertina e chiusura: #0F2D24. Pagine interne: #FAF9F6. Testi su fondo chiaro: #1F1F1F. Font: Lora'},{}).source,'visual');
 const d=A.brandOf({name:'X'},{});assert.equal(d.source,'default');assert.ok(A.contrast(d.colors.dark,d.colors.light)>=7);
 assert.equal(A.brandOf({},{identityKit:{...kit,logo:'<script>x</script>'}}).logo,null,'only an svg logo');
});

const FAKE={direzioni:[
 {nome:'Le mani in pasta',angolo:'beneficio',idea:'Il piacere del pane fatto da te.',foto:'Mani infarinate su un tavolo di legno',immagine:{titolo:'Il tuo pane, fatto da te',sottotitolo:'4 sabati mattina in forno',pulsante:'Iscriviti'},
  meta:{testo_principale:'Impara il lievito madre nel nostro forno di Torino: 4 incontri il sabato mattina.',titolo:'Corso di pane a lievito madre',descrizione:'Gruppi da 10 persone'},
  google:{titoli:['Corso di pane a Torino','Impara il lievito madre','Il sabato in forno','Gruppi da 10','Pane a lievito madre','Uno in più'],titolo_lungo:'Corso di pane a lievito madre a Torino',descrizioni:'Piccoli gruppi da 10 persone.'},
  linkedin:{testo:'Un sabato diverso per il tuo team.',titolo:'Corso di panificazione'}},
 {nome:'La prova',angolo:'prova',immagine:{titolo:'Il migliore pane di Torino, da sempre: provalo adesso con noi',sottotitolo:'Oltre 5000 clienti, sconto del 30%',pulsante:'Iscriviti subito al corso di oggi'},
  meta:{testo_principale:'x'.repeat(10)+' '+'parola '.repeat(30),titolo:'Titolo',descrizione:'Descr'},google:{titoli:['Corso con chi fa il pane ogni giorno da sempre'],titolo_lungo:'Lungo',descrizioni:['Desc']},linkedin:{testo:'Testo',titolo:'Titolo'}},
 {nome:'Senza titolo',angolo:'invito',immagine:{sottotitolo:'manca il titolo'}},
 {nome:'Quarta',immagine:{titolo:'Non serve'}}]};
const ANS={goal:'Contatti',platforms:['meta-feed','meta-stories','google-display','linkedin'],cta:'Richiedi info'};
const INPUT=A.inputText({offer:'Corso di panificazione: 4 incontri il sabato mattina, gruppi da 10 persone.',audience:'Famiglie a Torino'});

test('prompt: the chosen platforms with their limits, the facts, no invented claims; offer required',()=>{
 const p=A.directionsPrompt(ANS,{offer:'Corso di panificazione il sabato a Torino',audience:'famiglie',project:{name:'Forno Aurora'},facts:'Scheda fatti del cliente:\nForno aperto dal 1987.'});
 assert.match(p,/3 direzioni creative/);assert.match(p,/beneficio[\s\S]*prova[\s\S]*invito/);assert.match(p,/«Forno Aurora»/);assert.match(p,/Pulsante scelto \(call to action\): «Richiedi info»/);
 assert.match(p,/Forno aperto dal 1987/);assert.match(p,/Non inventare numeri, prezzi, sconti, scadenze/);
 for(const k of ['"meta"','"google"','"linkedin"','max 125 caratteri','max 30 caratteri','max 150 caratteri','"titolo_lungo"'])assert.ok(p.includes(k),k);
 const meta=A.directionsPrompt({platforms:['meta-feed']},{offer:'Corso di panificazione il sabato'});
 assert.ok(!meta.includes('"google"')&&!meta.includes('"linkedin"')&&meta.includes('"meta"'));
 assert.throws(()=>A.directionsPrompt(ANS,{offer:'corto'}),/almeno 10 caratteri/);
});

test('parse: fenced JSON → at most 3 directions, limits trimmed and flagged, numbers and claims grounded',()=>{
 const list=A.parseDirections('Ecco:\n```json\n'+JSON.stringify(FAKE)+'\n```',{answers:ANS,input:INPUT,business:'Forno Aurora artigianale di Torino'});
 assert.equal(list.length,3,'the one without a headline is dropped, the fourth takes its place');assert.equal(list[2].name,'Quarta');
 const [a,b]=list;
 assert.equal(a.angle,'beneficio');assert.equal(a.copy.visual.headline,'Il tuo pane, fatto da te');assert.equal(a.copy.google.headlines.length,5,'Google keeps 5 headlines');
 assert.deepEqual(a.copy.google.descriptions,['Piccoli gruppi da 10 persone.'],'a single description becomes a list');
 assert.equal(a.copy.google.business,'Forno Aurora artigianale','business name trimmed to 25');
 assert.ok(a.issues.some(i=>i.kind==='length'&&i.field==='business'));
 assert.ok(!a.issues.some(i=>i.kind==='number'),'4 and 10 are in the brief: '+JSON.stringify(a.issues));
 // every text within its limit after parsing, never silently over
 for(const d of list)for(const g of Object.keys(d.copy))for(const f of A.COPY[g].fields){const v=d.copy[g][f.key];for(const t of Array.isArray(v)?v:[v||''])assert.ok([...t].length<=f.max,g+'.'+f.key+' '+t.length)}
 const lengths=b.issues.filter(i=>i.kind==='length').map(i=>i.group+'.'+i.field);
 assert.ok(lengths.includes('visual.headline')&&lengths.includes('visual.cta')&&lengths.includes('meta.primary')&&lengths.includes('google.headlines'),lengths.join());
 const tr=b.issues.find(i=>i.field==='headlines');assert.equal(tr.trimmed,'Corso con chi fa il pane','no dangling «ogni»');
 assert.ok(b.issues.some(i=>i.kind==='number'&&i.text==='5000'),JSON.stringify(b.issues));assert.ok(b.issues.some(i=>i.kind==='number'&&i.text==='30'));
 const claims=b.issues.filter(i=>i.kind==='claim').map(i=>i.text);assert.ok(claims.includes('«il migliore»')&&claims.includes('sconto o promozione'),claims.join());
 // the same claim is fine when the brief makes it
 const ok=A.parseDirections(JSON.stringify(FAKE),{answers:ANS,input:INPUT+'\nSconto del 30% per chi si iscrive entro marzo. 5000 clienti.'});assert.ok(!ok[1].issues.some(i=>i.kind==='number'||i.text==='sconto o promozione'),JSON.stringify(ok[1].issues));
 // only the chosen platforms are kept; missing CTA falls back to the chosen one
 const m=A.parseDirections(JSON.stringify({directions:[{name:'x',visual:{headline:'Ciao'},meta:{primary:'Testo'}}]}),{answers:{platforms:['meta-feed'],cta:'Contattaci'}});
 assert.deepEqual(Object.keys(m[0].copy),['visual','meta']);assert.equal(m[0].copy.visual.cta,'Contattaci');
 assert.deepEqual(A.parseDirections('niente JSON qui',{answers:ANS}),[]);
 assert.match(A.issueText(tr),/46 caratteri su 30, accorciato/);
 // an edit over the limit is trimmed again
 a.copy.meta.headline='y'.repeat(60);A.recheck(a,INPUT);assert.equal(a.copy.meta.headline.length,40);assert.ok(a.issues.some(i=>i.field==='headline'&&i.group==='meta'));
});

test('fit: cuts at a sentence or clause when it keeps most of the text, never on an article',()=>{
 assert.equal(A.fit('Dal 1987 facciamo il pane. Ora apriamo il laboratorio a tutti voi e ai vostri amici',40),'Dal 1987 facciamo il pane.');
 assert.equal(A.fit('Impara il lievito madre, il più amato da tutti',30),'Impara il lievito madre');
 assert.equal(A.fit('breve',30),'breve');
});

test('zip bundle: a PNG per format of the chosen platforms plus testi.txt and testi.csv',()=>{
 const [d]=A.parseDirections(JSON.stringify(FAKE),{answers:ANS,input:INPUT,business:'Forno Aurora'});
 const pngs=Object.fromEntries(A.FORMATS.map(f=>[f.id,new Uint8Array([137,80,78,71,f.w%256])]));
 const files=A.bundleFiles(d,pngs,{answers:{...ANS,platforms:['meta-stories','google-display']},brand:{name:'Forno Aurora'},date:'2026-10-21'});
 const back=Z.unzip(Z.zip(files)),names=back.map(f=>f.name);
 assert.deepEqual(names,['meta-9x16-1080x1920.png','gd-191-1200x628.png','gd-1x1-1200x1200.png','gd-300x250-300x250.png','gd-728x90-728x90.png','testi.txt','testi.csv']);
 assert.equal(back[0].data[0],137);
 const txt=new TextDecoder().decode(back[5].data);
 assert.match(txt,/CREATIVITÀ PER ANNUNCI · Forno Aurora/);assert.match(txt,/Direzione: Le mani in pasta \(Beneficio\)/);assert.match(txt,/- Titolo \(24\/40\): Il tuo pane, fatto da te/);
 assert.match(txt,/meta-9x16-1080x1920\.png: Meta stories e reels · Stories e reels 1080×1920 \(testo fuori dal 14% in alto e dal 20% in basso\)/);assert.match(txt,/- Pulsante: Richiedi info/);
 const csv=new TextDecoder('utf-8',{ignoreBOM:true}).decode(back[6].data);assert.ok(csv.startsWith('﻿piattaforma,campo,testo,caratteri,limite\r\n'));
 assert.match(csv,/Google Display,Titoli brevi,Corso di pane a Torino,22,30/);assert.match(csv,/"Il tuo pane, fatto da te",24,40/,'commas quoted');
 assert.equal(A.zipName(d,{name:'Forno Aurora'}),'annunci-forno-aurora-le-mani-in-pasta.zip');
});

test('save: adCreatives in the agents document, every other key kept, retried on a conflict',async()=>{
 class ConflictError extends Error{}
 let stored={schemaVersion:1,conversations:{'paid-media':[{role:'user',content:'ciao'}]},prefs:{a:1},seoResults:{schemaVersion:1,imports:[{id:'i1'}]},adCreatives:{schemaVersion:1,items:[{id:'old',name:'Vecchia'}]}},conflicts=1;
 const ws={ConflictError,bind:(pid,mod)=>{assert.equal(pid,'forno');assert.equal(mod,'agents');return {load:async()=>JSON.parse(JSON.stringify(stored)),save:async x=>{if(conflicts-->0)throw new ConflictError('x');stored=x;return {revision:2}}}}};
 const [d]=A.parseDirections(JSON.stringify(FAKE),{answers:ANS,input:INPUT});
 const rec=A.savedRecord(d,{answers:ANS,layout:'piena',image:'upload',by:'Francesco',at:'2026-10-21T10:00:00.000Z'});
 assert.equal(rec.id,'ad-20261021100000-le-mani-in-pasta');assert.deepEqual(rec.formats,A.FORMATS.map(f=>f.id));assert.equal(rec.layout,'piena');assert.equal(rec.image,'upload');
 await A.saveToProject(ws,'forno',rec);
 assert.deepEqual(stored.conversations,{'paid-media':[{role:'user',content:'ciao'}]});assert.deepEqual(stored.prefs,{a:1});assert.deepEqual(stored.seoResults.imports,[{id:'i1'}]);
 assert.deepEqual(stored.adCreatives.items.map(x=>x.id),['old',rec.id]);
 await A.saveToProject(ws,'forno',{...rec,name:'Rinominata'});assert.equal(stored.adCreatives.items.length,2,'same id replaced');assert.equal(stored.adCreatives.items[1].name,'Rinominata');
 let s={schemaVersion:1,items:[]};for(let i=0;i<25;i++)s=A.addRecord(s,{id:'r'+i});assert.equal(s.items.length,20);assert.equal(s.items[0].id,'r5');
 const back=A.fromRecord(rec);assert.equal(back.copy.visual.headline,'Il tuo pane, fatto da te');assert.notEqual(back.copy,rec.copy);
 // the Agenti AI page keeps the key when it saves its own document
 const page=fs.readFileSync(path.join(root,'agents-page.js'),'utf8');
 assert.match(page,/if\(d\.adCreatives\)out\.adCreatives=d\.adCreatives;/);assert.match(page,/data\.adCreatives=fresh\.adCreatives/);
});

test('the AI photo prompt asks for no text, and spends happen only behind a confirmation',()=>{
 const p=A.photoPrompt({photo:'Mani infarinate su un tavolo'},{offer:'Corso di pane'},A.brandOf({name:'X'},{}));
 assert.match(p,/Mani infarinate/);assert.match(p,/No text, no letters, no logos/);
 const src=fs.readFileSync(path.join(root,'lib/ad-studio.js'),'utf8');
 const confirms=src.split('if(!await askConfirm(').slice(1).map(x=>x.split('))return;')[0]);assert.equal(confirms.length,2);assert.ok(!src.includes('root.confirm(\''),'no native confirm left');
 assert.match(confirms[0],/Paid Media Specialist AI\?',cost:'È una sola chiamata AI: usa crediti API/);assert.match(confirms[1],/1 foto con Higgsfield.*cost:'È 1 generazione: consuma il saldo API di Higgsfield/);
 // the paid calls sit right after their confirmation
 assert.ok(src.indexOf("rt.reply({role:AGENT")>src.indexOf(confirms[0]));assert.ok(src.indexOf('generatePhoto(photoPrompt')>src.indexOf(confirms[1]));assert.equal(src.split('generatePhoto(').length,3,'defined once, called once');
 assert.equal((src.match(/action:'generate'/g)||[]).length,1);assert.ok(!/https?:\/\//.test(src),'no external URLs');
});

test('the card «Creatività per annunci» opens the studio inline in «Web e annunci»',()=>{
 const core=require('../agency/crea-core.js'),look=require('../agency/marketing-look.js'),c=core.card('creativita');
 assert.equal(c.group,'Web e annunci');assert.equal(c.inline,'ads');assert.equal(c.title,'Creatività per annunci');assert.match(c.cost,/Paid Media Specialist, con conferma.*1 generazione Higgsfield, con conferma a parte/);
 assert.equal(core.linkFor(c,'radix'),null);assert.ok(look.has(look.CARDS.creativita));
 assert.deepEqual(core.fromQuery('?open=creativita'),{group:'Web e annunci',open:'creativita'});
 const js=fs.readFileSync(path.join(root,'agency/crea.js'),'utf8');
 assert.match(js,/ads:\{global:'RadixAdStudio'[^}]*agent:'paid-media'\}/);
 assert.match(js,/S\.adStudio\(\{project,profile:current\.profile,memoryScope,projectId:current\.id,workspace:ws,agentsUrl:'\/agents\.html\?agent=paid-media&project='\+pid\}\)/);
 const html=fs.readFileSync(path.join(root,'agency/crea.html'),'utf8');
 assert.ok(html.indexOf('/lib/ad-studio.js')>html.indexOf('/lib/copy-studio.js')&&html.indexOf('/lib/ad-studio.js')<html.indexOf('/agency/crea.js'));
 assert.ok(html.indexOf('/lib/zip-lite.js')<html.indexOf('/lib/ad-studio.js'));
 const css=fs.readFileSync(path.join(root,'shell/crea.css'),'utf8');assert.match(css,/\.cr-panel \.ad-studio\[data-safe=true\] \.ad-safe\{opacity:1\}/);
});
