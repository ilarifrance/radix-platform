'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os'),zlib=require('zlib'),{execFileSync}=require('child_process');
const C=require('../lib/seo-results-core.js'),Z=require('../lib/zip-lite.js'),R=require('../lib/seo-results.js'),S=require('../lib/seo-studio.js');
const root=path.join(__dirname,'..');
const hasZip=(()=>{try{execFileSync('zip',['-v'],{stdio:'ignore'});return true}catch(e){return false}})();

// ---- fake Search Console exports (no real data) ----
const QUERY_IT=['"Query principali","Clic","Impressioni","CTR","Posizione"',
 'dentista bergamo,120,"2.400","5%","3,2"',
 'impianti dentali bergamo,30,"3.000","1%","7,4"',
 'ortodonzia invisibile prezzo,8,"1.800","0,44%","14,6"',
 'dentista aperto sabato,2,"900","0,22%","18,1"',
 'studio sorriso,90,"300","30%","1,1"',
 'studiosorriso bergamo,40,"150","26,67%","1,0"',
 'pulizia denti costo,1,40,"2,5%","25"',
 'riga vuota,,,,'].join('\n');
const PAGES_EN=['Top pages,Clicks,Impressions,CTR,Position',
 'https://www.studiosorriso.it/,200,3000,6.67%,2.1',
 'https://www.studiosorriso.it/impianti/,25,4000,0.63%,6.9',
 'https://www.studiosorriso.it/ortodonzia/,10,1500,0.67%,12.4',
 'https://www.studiosorriso.it/blog/igiene/,3,200,1.5%,9.0'].join('\n');
const days=(from,n,clicks,impr,pos)=>Array.from({length:n},(_,i)=>{const d=new Date(Date.parse(from+'T12:00:00Z')+i*86400000).toISOString().slice(0,10);return d+','+clicks(i)+','+impr(i)+',"'+String(Math.round(clicks(i)*10000/impr(i))/100).replace('.',',')+'%","'+String(pos).replace('.',',')+'"'});
const DATES_IT=['Data,Clic,Impressioni,CTR,Posizione',...days('2026-09-01',30,i=>10+i%3,i=>400+i*2,8.5)].join('\n');
const COUNTRIES_IT='Paese,Clic,Impressioni,CTR,Posizione\nItalia,290,8000,"3,63%","8,1"\nSvizzera,5,300,"1,67%","12"';
const DEVICES_IT='Dispositivo,Clic,Impressioni,CTR,Posizione\nDispositivi mobili,200,6000,"3,33%","8,4"\nComputer,95,2300,"4,13%","7,6"';
const FILTERS='Filtro,Valore\nTipo di ricerca,Web\nData,Ultimi 3 mesi';
const GA4=['# ----------------------------------------','# Pagine di destinazione','# 20260901-20260930','','Pagina di destinazione + stringa di query,Sessioni,Utenti attivi,Eventi chiave','/,1.200,1.000,35','/impianti/,300,280,12'].join('\n');
const FILES_IT=[{name:'Query.csv',text:QUERY_IT},{name:'Pagine.csv',text:PAGES_EN},{name:'Paesi.csv',text:COUNTRIES_IT},{name:'Dispositivi.csv',text:DEVICES_IT},{name:'Date.csv',text:DATES_IT},{name:'Filtri.csv',text:FILTERS}];

// A deflate zip like the one Search Console hands out (zlib here; the browser path uses DecompressionStream).
function deflateZip(files){const enc=new TextEncoder(),locals=[],centrals=[];let offset=0;
 for(const f of files){const name=enc.encode(f.name),data=enc.encode(f.text),comp=zlib.deflateRawSync(data),crc=Z.crc32(data);
  const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt16LE(0x0800,6);h.writeUInt16LE(8,8);h.writeUInt32LE(crc,14);h.writeUInt32LE(comp.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(name.length,26);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x0800,8);c.writeUInt16LE(8,10);c.writeUInt32LE(crc,16);c.writeUInt32LE(comp.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(offset,42);
  locals.push(h,name,comp);centrals.push(c,name);offset+=30+name.length+comp.length}
 const cd=Buffer.concat(centrals),end=Buffer.alloc(22),comment=Buffer.from('export');end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);end.writeUInt16LE(comment.length,20);
 return new Uint8Array(Buffer.concat([...locals,cd,end,comment]))}

test('numbers: Italian decimal comma, thousands, % signs and empty cells',()=>{
 assert.equal(C.num('2.400'),2400);assert.equal(C.num('3,2'),3.2);assert.equal(C.num('0,44%'),0.44);assert.equal(C.num('6.67%'),6.67);
 assert.equal(C.num('1.234,5'),1234.5);assert.equal(C.num('1,234'),1234);assert.equal(C.num(''),null);assert.equal(C.num('—'),null);assert.equal(C.num('abc'),null);
});

test('one CSV: the table kind from the headers (Italian or English) or the file name, CTR from the counts',()=>{
 const q=C.readTable(QUERY_IT,{name:'Query.csv'});
 assert.equal(q.kind,'queries');assert.equal(q.rows.length,7);assert.equal(q.skipped,1);
 assert.deepEqual(q.rows[1],{key:'impianti dentali bergamo',clicks:30,impressions:3000,ctr:1,position:7.4});
 const p=C.readTable(PAGES_EN);assert.equal(p.kind,'pages');assert.equal(p.rows[1].ctr,0.63);assert.equal(p.rows[1].position,6.9);
 const semi=C.readTable('Query principali;Clic;Impressioni;CTR;Posizione\nscarpe running;12;1.500;0,8%;9,3');
 assert.deepEqual(semi.rows[0],{key:'scarpe running',clicks:12,impressions:1500,ctr:0.8,position:9.3});
 const share=C.readTable('Query,Impressions,CTR,Position\nshoes,1000,0.034,4.5');assert.equal(share.rows[0].ctr,3.4,'a share without % becomes a percent');
 assert.equal(C.readTable(DATES_IT).kind,'dates');assert.equal(C.readTable('Date,Clicks,Impressions\n09/30/2026,4,100',{name:'Chart.csv'}).rows[0].key,'2026-09-30');
 assert.equal(C.readTable(COUNTRIES_IT).kind,'countries');assert.equal(C.readTable(DEVICES_IT).kind,'devices');
 const ga=C.readTable(GA4);assert.equal(ga.kind,'landing');assert.deepEqual(ga.rows[0],{key:'/',sessions:1200,users:1000,keyEvents:35});
 assert.match(C.readTable('Nome,Email\nAnna,a@b.it').error,/Search Console/);
 assert.equal(C.isoDate('30/09/2026'),'2026-09-30');assert.equal(C.isoDate('20260930'),'2026-09-30');assert.equal(C.isoDate('boh'),'');
});

test('an import from the CSVs: tables, date range, ignored filters file, warnings, nothing readable → error',()=>{
 const imp=C.importFiles(FILES_IT.concat([{name:'__MACOSX/._Query.csv',text:'x'},{name:'note.pdf',text:'x'},{name:'Altro.csv',text:'Nome\nx'}]),{at:'2026-10-01T10:00:00Z'});
 assert.deepEqual(imp.range,{from:'2026-09-01',to:'2026-09-30'});assert.equal(imp.id,'gsc-2026-09-01_2026-09-30');
 assert.deepEqual(imp.files,['Query.csv','Pagine.csv','Paesi.csv','Dispositivi.csv','Date.csv']);
 assert.equal(imp.queries[0].key,'impianti dentali bergamo','sorted by impressions');assert.equal(imp.dates.length,30);
 assert.ok(imp.warnings.some(w=>/Altro\.csv/.test(w)));assert.ok(imp.warnings.some(w=>/1 righe senza numeri/.test(w)));
 assert.throws(()=>C.importFiles([{name:'Filtri.csv',text:FILTERS}]),/Nessun dato leggibile/);
 const many=C.importFiles([{name:'Query.csv',text:'Query,Clicks,Impressions\n'+Array.from({length:400},(_,i)=>'q'+i+','+i+','+(i*10)).join('\n')}]);
 assert.equal(many.queries.length,C.CAPS.queries);assert.equal(many.queries[0].key,'q399');assert.equal(many.range,null);
});

test('the Search Console zip (deflate, with a comment and a filters file) is read in Node, also through DecompressionStream',async()=>{
 const bytes=deflateZip(FILES_IT);
 assert.throws(()=>Z.unzip(bytes),/compresso/,'the store-only reader says so');
 const files=await Z.unzipAsync(bytes);assert.deepEqual(files.map(f=>f.name),FILES_IT.map(f=>f.name));
 assert.equal(new TextDecoder().decode(files[0].data),QUERY_IT);
 const viaZlib=await Z.unzipAsync(bytes,{inflate:async d=>new Uint8Array(zlib.inflateRawSync(d))});assert.equal(viaZlib.length,6);
 const imp=await C.importZip(bytes,Z,{at:'2026-10-01T10:00:00Z'});assert.equal(imp.queries.length,7);assert.equal(imp.pages.length,4);assert.deepEqual(imp.range,{from:'2026-09-01',to:'2026-09-30'});
 const stored=Z.zip(FILES_IT.slice(0,2).map(f=>({name:'export/'+f.name,data:f.text})));assert.equal((await C.importZip(stored,Z)).queries.length,7,'store entries and folders work too');
 await assert.rejects(C.importZip(bytes,null),/zip/);
 const bad=deflateZip([{name:'Query.csv',text:QUERY_IT}]);bad[40]^=0xff;await assert.rejects(Z.unzipAsync(bad));
});

test('a zip made by the system zip tool reads back',{skip:!hasZip&&'zip non disponibile'},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'seo-zip-'));
 try{for(const f of FILES_IT)fs.writeFileSync(path.join(dir,f.name),f.text);execFileSync('zip',['-q','-9','gsc.zip',...FILES_IT.map(f=>f.name)],{cwd:dir});
  const imp=await C.importZip(new Uint8Array(fs.readFileSync(path.join(dir,'gsc.zip'))),Z);assert.equal(imp.dates.length,30);assert.equal(imp.devices.length,2)}
 finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('KPIs from the daily table (impression-weighted position), else from pages; comparison between two imports',()=>{
 const imp=C.importFiles(FILES_IT);const k=C.kpis(imp);
 assert.equal(k.source,'dates');assert.equal(k.days,30);assert.equal(k.clicks,330);assert.equal(k.impressions,12870);assert.equal(k.ctr,2.56);assert.equal(k.position,8.5);
 const noDates=C.kpis(C.importFiles([FILES_IT[0],FILES_IT[1]]));assert.equal(noDates.source,'pages');assert.equal(noDates.clicks,238);assert.equal(noDates.position,C.weightedPosition(C.readTable(PAGES_EN).rows));
 const prev=C.importFiles([{name:'Date.csv',text:['Data,Clic,Impressioni,CTR,Posizione',...days('2026-08-01',30,()=>8,()=>400,9.5)].join('\n')}]);
 const c=C.compare(imp,prev);assert.deepEqual(c.clicks,{abs:90,pct:37.5});assert.equal(c.position.abs,-1);assert.deepEqual(c.previous,{from:'2026-08-01',to:'2026-08-30'});
});

test('brand terms from the project and the site; brand vs non-brand split',()=>{
 const terms=C.brandTerms({name:'Studio Sorriso',links:'Sito: https://www.studiosorriso.it. IG @sorriso'},'Dott. Rossi; studio');
 assert.deepEqual(terms,['studio sorriso','studiosorriso','dott rossi']);
 assert.ok(C.isBrand('studio sorriso orari',terms));assert.ok(C.isBrand('studiosorriso bergamo',terms));assert.ok(C.isBrand('Studio-Sorriso',terms));assert.ok(!C.isBrand('dentista bergamo',terms));
 const b=C.brandSplit(C.importFiles(FILES_IT),terms);
 assert.deepEqual(b.brand,{queries:2,clicks:130,impressions:450});assert.equal(b.nonBrand.queries,5);assert.equal(b.brandShare,44.7);
 assert.equal(C.brandSplit(C.importFiles(FILES_IT),[]),null);
});

test('opportunities: a step from page one, low CTR titles to rewrite, pages losing clicks',()=>{
 const terms=['studio sorriso','studiosorriso'],cur=C.importFiles(FILES_IT);
 const prev=C.importFiles([{name:'Pagine.csv',text:PAGES_EN.replace('/impianti/,25,','/impianti/,60,').replace('/ortodonzia/,10,','/ortodonzia/,11,')+'\nhttps://www.studiosorriso.it/vecchia/,30,500,6%,5'}]);
 const o=C.opportunities(cur,prev,{brand:terms});
 assert.deepEqual(o.nearFirstPage.map(r=>r.key),['impianti dentali bergamo','ortodonzia invisibile prezzo','dentista aperto sabato'],'4-20, impressions over the median; position 3.2 and the 40-impression query are out');
 assert.match(o.nearFirstPage[0].note,/prima pagina/);assert.match(o.nearFirstPage[1].note,/a un passo dalla prima/);
 assert.deepEqual(o.lowCtr.map(r=>r.key),['https://www.studiosorriso.it/impianti/','https://www.studiosorriso.it/ortodonzia/']);assert.equal(o.lowCtr[0].type,'pagina');assert.equal(o.lowCtr[0].siteCtr,2.56);
 assert.deepEqual(o.losingPages.map(r=>[r.key,r.previousClicks,r.clicks,r.changePct]),[['https://www.studiosorriso.it/impianti/',60,25,-58.3],['https://www.studiosorriso.it/vecchia/',30,0,-100]],'a small dip (11 → 10) is not listed');
 assert.deepEqual(C.opportunities(cur,null).losingPages,[]);
 const qOnly=C.opportunities(C.importFiles([FILES_IT[0]]),null,{brand:terms});assert.ok(qOnly.lowCtr.every(r=>r.type==='query'&&!C.isBrand(r.key,terms)));
});

test('storage: compact rows in the agents document, same period replaced, last 6 kept, conflicts retried',async()=>{
 let store=C.readStore(null);assert.deepEqual(store,{schemaVersion:1,imports:[],brandTerms:[],advice:null});
 const imp=C.importFiles(FILES_IT);store=C.addImport(store,imp);
 assert.deepEqual(store.imports[0].queries[0],['impianti dentali bergamo',30,3000,7.4],'packed rows');
 const back=C.sortedImports(store)[0];assert.deepEqual(back.queries[2],{key:'ortodonzia invisibile prezzo',clicks:8,impressions:1800,ctr:0.44,position:14.6});
 store=C.addImport(store,{...imp,id:'other-id'});assert.equal(store.imports.length,1,'same period replaces');
 for(let m=1;m<=8;m++){const mm=String(m).padStart(2,'0');store=C.addImport(store,C.importFiles([{name:'Date.csv',text:'Data,Clic,Impressioni\n2025-'+mm+'-01,1,10\n2025-'+mm+'-28,1,10'}]))}
 assert.equal(store.imports.length,C.MAX_IMPORTS);assert.equal(C.sortedImports(store).at(-1).id,'other-id','sorted by period end');
 const big=C.importFiles([{name:'Query.csv',text:'Query,Clicks,Impressions,Position\n'+Array.from({length:2000},(_,i)=>'una query di ricerca abbastanza lunga numero '+i+','+i+','+(i*10)+',12.3').join('\n')}]);
 assert.ok(Buffer.byteLength(JSON.stringify(C.addImport(C.readStore(null),big)))<40000,'capped import stays small');
 store=C.removeImport({...store,advice:{importId:'other-id'}},'other-id');assert.equal(store.advice,null);assert.ok(!store.imports.some(x=>x.id==='other-id'));
 // updateStore keeps the conversations and other keys, retries on a conflict
 class ConflictError extends Error{}
 let stored={schemaVersion:1,conversations:{'seo-geo':[{role:'user',content:'ciao'}]},prefs:{a:1}},conflicts=1,saves=0;
 const ws={ConflictError,bind:(pid,mod)=>{assert.equal(pid,'radix');assert.equal(mod,'agents');return {load:async()=>JSON.parse(JSON.stringify(stored)),save:async next=>{saves++;if(conflicts-->0){stored.prefs={a:2};throw new ConflictError('conflitto')}stored=next;return {revision:2}}}}};
 const next=await C.updateStore(ws,'radix',s=>C.addImport(s,imp));
 assert.equal(saves,2);assert.equal(next.imports.length,1);assert.deepEqual(stored.conversations,{'seo-geo':[{role:'user',content:'ciao'}]});assert.deepEqual(stored.prefs,{a:2},'the newer copy is kept');assert.equal(stored.seoResults.imports.length,1);
 await assert.rejects(C.updateStore(null,'radix',s=>s),/non disponibile/);
});

test('the plan saved by the Studio SEO e GEO is found in the seo-geo thread',()=>{
 const st={title:'Primi nella zona',focus:'locale',keywords:['dentista bergamo'],pages:['FAQ'],geo:[],steps:[]},md=S.toMarkdown(st,{date:'2026-10-01'});
 const doc={conversations:{'seo-geo':S.savedEntry(st,md,{at:'2026-10-01T10:00:00Z'})}};
 const plan=C.savedPlan(doc);assert.equal(plan.title,'Piano SEO e GEO · Primi nella zona');assert.match(plan.text,/dentista bergamo/);
 assert.equal(C.savedPlan({conversations:{}}),null);assert.equal(C.savedPlan(null),null);
});

const analysed=()=>{let s=C.addImport(C.readStore(null),C.importFiles([{name:'Pagine.csv',text:PAGES_EN.replace('/impianti/,25,','/impianti/,60,')},{name:'Date.csv',text:['Data,Clic,Impressioni',...days('2026-08-01',31,()=>8,()=>400,9).map(l=>l.split(',').slice(0,3).join(','))].join('\n')}]));
 s=C.addImport(s,C.importFiles(FILES_IT.concat([{name:'landing.csv',text:GA4}])));return C.analyse({...s,brandTerms:['studio sorriso','studiosorriso']})};

test('the AI prompt carries only the computed numbers and the plan, and asks for 5 grounded actions in JSON',()=>{
 const a=analysed();assert.equal(a.current.id,'gsc-2026-09-01_2026-09-30');assert.equal(a.previous.id,'gsc-2026-08-01_2026-08-31');
 const p=C.nextStepsPrompt(a,{plan:{title:'Piano SEO e GEO · Primi nella zona',text:'## Parole chiave\n- dentista bergamo'}});
 assert.match(p,/^Sei lo Specialista SEO e GEO/);assert.match(p,/Periodo: 2026-09-01 → 2026-09-30\. Totale: clic 330 · impressioni 12870 · CTR 2\.56% · posizione media 8\.5/);
 assert.match(p,/Rispetto al periodo precedente \(2026-08-01 → 2026-08-31\): clic \+82 \(\+33\.1%\)/);
 assert.match(p,/quota brand dei clic 44\.7%/);assert.match(p,/a un passo dalla prima pagina[^\n]*\n- «impianti dentali bergamo» · clic 30 · impressioni 3000 · CTR 1% · posizione 7\.4/);
 assert.match(p,/Pagine con molte impressioni e CTR basso/);assert.match(p,/«https:\/\/www\.studiosorriso\.it\/impianti\/» · clic 60 → 25 \(-58\.3%\)/);
 assert.match(p,/Pagine di destinazione da Google Analytics 4/);assert.match(p,/«Piano SEO e GEO · Primi nella zona»/);
 assert.match(p,/esattamente 5 azioni/);assert.match(p,/Non inventare numeri/);assert.match(p,/"da_misurare"/);
 assert.match(C.nextStepsPrompt(a),/Nessun piano SEO e GEO salvato/);assert.throws(()=>C.nextStepsPrompt(null),/Importa prima/);
});

test('the AI reply: actions tied to queries or pages not in the data are dropped; at most 5; what to measure',()=>{
 const a=analysed();
 const reply='Ecco:\n```json\n'+JSON.stringify({azioni:[
  {titolo:'Pagina dedicata agli impianti',tipo:'query',oggetto:'Impianti dentali Bergamo',metrica:'posizione 7,4 con 3000 impressioni',come:'Ampliare la pagina https://www.studiosorriso.it/impianti/ con FAQ'},
  {titolo:'Riscrivere il title',tipo:'pagina',oggetto:'www.studiosorriso.it/impianti',metrica:'CTR 0,63%',come:'Title con prezzo e zona'},
  {titolo:'Inventata',tipo:'query',oggetto:'dentista milano',metrica:'1000 impressioni',come:'x'},
  {titolo:'Link a una pagina inventata',tipo:'query',oggetto:'ortodonzia invisibile prezzo',metrica:'posizione 14,6',come:'Collegare https://www.studiosorriso.it/prezzi/'},
  {titolo:'Recuperare la pagina persa',tipo:'pagina',oggetto:'https://www.studiosorriso.it/impianti/',metrica:'clic da 60 a 25',come:'Controllare i cambi'},
  {titolo:'Pagina ortodonzia',tipo:'pagina',oggetto:'https://www.studiosorriso.it/ortodonzia/',metrica:'CTR 0,67%',come:'Meta description'},
  {titolo:'Sabato',tipo:'query',oggetto:'dentista aperto sabato',metrica:'posizione 18,1',come:'Orari in evidenza'},
  {titolo:'Sesta valida',tipo:'query',oggetto:'dentista bergamo',metrica:'120 clic',come:'Tenere'},
  {titolo:'',oggetto:'dentista bergamo'}],
  da_misurare:['Posizione di «impianti dentali bergamo»','CTR della pagina impianti']})+'\n```';
 const r=C.parseAdvice(reply,a);
 assert.equal(r.actions.length,5);assert.deepEqual(r.actions.map(x=>x.titolo),['Pagina dedicata agli impianti','Riscrivere il title','Recuperare la pagina persa','Pagina ortodonzia','Sabato']);
 assert.equal(r.actions[1].tipo,'pagina');assert.equal(r.dropped,3,'invented query, invented page link, empty title');
 assert.deepEqual(r.measure,['Posizione di «impianti dentali bergamo»','CTR della pagina impianti']);
 assert.deepEqual(C.parseAdvice('non so',a),{actions:[],measure:[],dropped:0});
 const typeFix=C.parseAdvice('{"azioni":[{"titolo":"x","tipo":"query","oggetto":"https://www.studiosorriso.it/ortodonzia/","metrica":"m"}]}',a);assert.equal(typeFix.actions[0].tipo,'pagina');
 // the cache key follows the numbers and the plan
 assert.equal(C.adviceKey(a,null),C.adviceKey(analysed(),null));assert.notEqual(C.adviceKey(a,null),C.adviceKey(a,{text:'piano'}));
});

test('the panel: 3-step guide, confirmation text, opened from the Studio SEO e GEO tab and the SEO card',()=>{
 assert.equal(R.GUIDE.length,3);assert.match(R.GUIDE[0],/Prestazioni/);assert.match(R.GUIDE[1],/Esporta[^.]*Scarica CSV/);assert.match(R.GUIDE[2],/\.zip/);
 assert.match(R.CONFIRM.message,/solo i numeri/);assert.match(R.CONFIRM.cost,/crediti API/);
 assert.deepEqual(S.RESULTS_SCRIPTS.map(x=>x[0]),['/lib/zip-lite.js','/lib/seo-results-core.js','/lib/seo-results.js']);assert.equal(S.RESULTS_CSS,'/shell/seo-results.css');
 for(const f of ['lib/seo-results.js','lib/seo-results-core.js','shell/seo-results.css'])assert.ok(fs.existsSync(path.join(root,f)),f);
 const studio=fs.readFileSync(path.join(root,'lib/seo-studio.js'),'utf8');assert.match(studio,/button\('Risultati SEO'\)/);assert.match(studio,/R\.seoResults\(\{project:ctx\.project,projectId:ctx\.projectId,workspace:ctx\.workspace/);
 const ui=fs.readFileSync(path.join(root,'lib/seo-results.js'),'utf8');
 assert.match(ui,/if\(!await askConfirm\(CONFIRM\)\)return;/);assert.ok(ui.indexOf('askConfirm(CONFIRM)')<ui.indexOf('rt.reply('),'confirm before the call');assert.ok(!ui.includes('root.confirm(\''),'no native confirm left');
 assert.match(ui,/rt\.reply\(\{role:C\.AGENT,messages:\[\{role:'user',content:prompt\}\]\}\)/,'no project profile or memory in the call');
 assert.equal(C.AGENT,'seo-geo');assert.match(require('../agency/crea-core.js').card('seo').line,/Risultati SEO/);
 assert.match(fs.readFileSync(path.join(root,'shell/seo-results.css'),'utf8'),/\.seo-results \.sr-tiles/);
});

test('the agents page and the verticals keep the saved results when they save their conversations',()=>{
 const page=fs.readFileSync(path.join(root,'agents-page.js'),'utf8');
 assert.match(page,/function clean\(d\)\{[^\n]*if\(d\.seoResults\)out\.seoResults=d\.seoResults;/);
 assert.match(page,/data\.seoResults=fresh\.seoResults;/);
 assert.match(fs.readFileSync(path.join(root,'verticals/studio.js'),'utf8'),/doc\.save\(\{\.\.\.cur,schemaVersion:1,conversations:conv\}\)/);
});

// ---- the widget on a tiny fake DOM, with a fake workspace and a fake AI (never a real call) ----
class FakeNode{constructor(tag){this.tagName=String(tag||'#text').toUpperCase();this.children=[];this.attributes={};this.dataset={};this.style={};this._text='';this.hidden=false;this.value='';this.disabled=false}
 get textContent(){return this.tagName==='#TEXT'?this._text:this._text+this.children.map(c=>c.textContent).join('')}
 set textContent(v){this._text=String(v);this.children=[]}
 get childElementCount(){return this.children.length}
 append(...n){n.forEach(x=>{if(x!=null)this.children.push(x)})}prepend(...n){this.children.unshift(...n)}replaceChildren(...n){this._text='';this.children=[];this.append(...n)}
 setAttribute(k,v){this.attributes[k]=String(v)}getAttribute(k){return this.attributes[k]}
 querySelectorAll(){return []}querySelector(){return null}remove(){}focus(){}select(){}scrollIntoView(){}}
const all=(n,out=[])=>{out.push(n);(n.children||[]).forEach(c=>all(c,out));return out};
const find=(n,pred)=>all(n).find(pred);
const tick=()=>new Promise(r=>setImmediate(r));

test('the panel end to end: zip upload saved in the project, tiles and tables, AI next steps after confirmation, then cached',async()=>{
 const keys=['document','Option','confirm','RadixZip','RadixSeoResultsCore','RadixAgents'],before=Object.fromEntries(keys.filter(k=>k in globalThis).map(k=>[k,globalThis[k]]));
 const doc={createElement:t=>new FakeNode(t),createElementNS:(ns,t)=>new FakeNode(t),createTextNode:t=>{const n=new FakeNode('#text');n._text=String(t);return n}};
 let confirms=0,calls=0,lastCall=null;
 Object.assign(globalThis,{document:doc,Option:function(text,value){const n=new FakeNode('option');n._text=text;n.value=value;return n},confirm:()=>{confirms++;return true},RadixZip:Z,RadixSeoResultsCore:C,
  RadixAgents:{reply:async req=>{calls++;lastCall=req;return {text:JSON.stringify({azioni:[{titolo:'Pagina impianti più completa',tipo:'query',oggetto:'impianti dentali bergamo',metrica:'posizione 7,4 con 3000 impressioni',come:'FAQ e link interni'},{titolo:'Inventata',tipo:'query',oggetto:'dentista roma',metrica:'x'}],da_misurare:['Posizione di impianti dentali bergamo']})}}}});
 try{
  class ConflictError extends Error{}
  const st={title:'Primi nella zona',focus:'locale',keywords:['dentista bergamo'],pages:['FAQ'],geo:[],steps:[]};
  let stored={schemaVersion:1,conversations:{'seo-geo':S.savedEntry(st,S.toMarkdown(st,{date:'2026-10-01'}),{at:'2026-10-01T10:00:00Z'})}};
  const ws={ConflictError,bind:()=>({load:async()=>JSON.parse(JSON.stringify(stored)),save:async next=>{stored=JSON.parse(JSON.stringify(next));return {revision:2}}})};
  const w=R.seoResults({project:{name:'Studio Sorriso',links:'https://www.studiosorriso.it'},projectId:'radix',workspace:ws,by:'Anna'});await tick();
  assert.match(w.textContent,/Come esportare da Search Console/);assert.match(w.textContent,/Nessun import ancora/);
  const brand=find(w,n=>n.tagName==='INPUT'&&n.type==='text');assert.equal(brand.value,'studio sorriso, studiosorriso');
  const file=find(w,n=>n.tagName==='INPUT'&&n.type==='file'),bytes=deflateZip(FILES_IT);
  file.files=[{name:'studiosorriso.it-Performance-on-Search-2026-10-01.zip',size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}];
  await file.onchange();await tick();
  assert.match(w.textContent,/Import riuscito \(1 set 26 – 30 set 26\): 7 query, 4 pagine, 30 giorni\. Salvato nel progetto\./);
  assert.equal(stored.seoResults.imports.length,1);assert.deepEqual(stored.seoResults.brandTerms,['studio sorriso','studiosorriso']);assert.equal(stored.conversations['seo-geo'].length,2,'the thread is untouched');
  assert.match(w.textContent,/Clic330/);assert.match(w.textContent,/A un passo dalla prima pagina · 3/);assert.match(w.textContent,/Titoli e meta da riscrivere/);assert.match(w.textContent,/Brand e non brand/);
  assert.ok(find(w,n=>n.tagName==='SVG'),'the daily chart');
  const go=()=>find(w,n=>n.tagName==='BUTTON'&&/Prossimi passi con l’AI|Chiedi di nuovo/.test(n.textContent));
  await go().onclick();await tick();
  assert.equal(confirms,1);assert.equal(calls,1);assert.equal(lastCall.role,'seo-geo');assert.equal(lastCall.project,undefined,'no profile sent');
  assert.match(lastCall.messages[0].content,/«Piano SEO e GEO · Primi nella zona»/);
  assert.match(w.textContent,/Pagina impianti più completa · query «impianti dentali bergamo»/);assert.match(w.textContent,/1 azione scartata/);assert.match(w.textContent,/Da misurare al prossimo import/);
  assert.equal(stored.seoResults.advice.actions.length,1);
  // a new panel on the same project shows the saved answer with no new call
  const w2=R.seoResults({project:{name:'Studio Sorriso'},projectId:'radix',workspace:ws});await tick();
  assert.match(w2.textContent,/Risposta salvata del \d{4}-\d{2}-\d{2}: stessi numeri, nessuna nuova chiamata/);assert.equal(calls,1);
  // declining the confirmation spends nothing
  globalThis.confirm=()=>false;await find(w2,n=>n.tagName==='BUTTON'&&/Chiedi di nuovo/.test(n.textContent)).onclick();assert.equal(calls,1);
 }finally{for(const k of keys)if(k in before)globalThis[k]=before[k];else delete globalThis[k]}
});
