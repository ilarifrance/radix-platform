'use strict';
// Studio «Set di icone» (lib/icon-core.js, lib/icon-studio.js, catalogue lib/icon-set.js): the card in «Cosa vuoi fare»
// (Brand) and its search words, the vendored Lucide catalogue with its licence, the Italian concept mapping («non trovata»
// with alternatives), the suggestions from the project, the three styles and the settings, the SVG of one icon, the
// checks (stroke, grid, contrast, 16 px), the sprite and the zip contents, the saved key «icons» that agents-page.js keeps.
// No AI and no network. Fake data only (DATI DI ESEMPIO).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const K=require('../lib/icon-core.js'),SET=require('../lib/icon-set.js'),ZIP=require('../lib/zip-lite.js'),W=require('../lib/icon-studio.js');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const DATE=new Date('2026-10-24T09:00:00Z');
// Every tag opened is closed, in order.
function wellFormed(svg){const st=[];for(const m of svg.matchAll(/<(\/?)([a-zA-Z]+)[^>]*?(\/?)>/g)){if(m[3])continue;if(m[1]){if(st.pop()!==m[2])return false}else st.push(m[2])}return st.length===0}

test('card in Crea (Brand), found by «icone», «icona», «pittogrammi», «icon set»; studio wired; agents doc keeps «icons»',()=>{
 const core=require('../agency/crea-core.js'),card=core.card('icone');
 assert.equal(card.title,'Set di icone');assert.equal(card.group,'Brand');assert.equal(card.inline,'icons');assert.match(card.cost,/^Nessuna chiamata AI/);
 assert.deepEqual(core.costBadge(card),{tone:'free',label:'Gratis, senza AI'});assert.match(card.line+card.hint,/mascotte/i);
 for(const q of ['icone','icona','pittogrammi','icon set','set di icone','mascotte','icone per il sito'])assert.equal(core.matchServices(q)[0].card.id,'icone',q);
 assert.equal(core.fromAsk('?q=icone').match,'icone');assert.equal(core.fromQuery('?open=icone').open,'icone');
 const html=read('agency/crea.html'),at=f=>html.indexOf('/lib/'+f);
 assert.ok(at('icon-set.js')>0&&at('icon-set.js')<at('icon-core.js')&&at('icon-core.js')<at('icon-studio.js')&&at('zip-lite.js')<at('icon-core.js')&&at('icon-studio.js')<html.indexOf('/agency/crea.js'));
 const js=read('agency/crea.js');assert.match(js,/icons:\{global:'RadixIconStudio'/);assert.match(js,/S\.iconStudio\(\{project,profile:current\.profile/);
 assert.match(read('agency/marketing-look.js'),/icone:'iconSet'/);assert.match(read('agency/marketing-look.js'),/ iconSet:'</);
 const ap=read('agents-page.js');assert.equal((ap.match(/data\.icons=fresh\.icons/g)||[]).length,2);assert.match(ap,/if\(d\.icons\)out\.icons=d\.icons/);
 assert.equal(typeof W.iconStudio,'function');assert.match(read('shell/crea.css'),/\.cr-panel \.icon-studio \.is-dirs\{/);
});

test('no AI, no network and no paid call in the studio, the core or the catalogue',()=>{
 for(const f of ['lib/icon-core.js','lib/icon-studio.js','lib/icon-set.js']){const w=read(f);
  for(const re of [/fetch\(/,/XMLHttpRequest/,/\/api\//,/RadixAI|askClaude|runtime\.(chat|complete)|rt\.run/,/claude-[a-z0-9]|gpt-\d|higgsfield/i,/https?:\/\/(?!www\.w3\.org)/])assert.doesNotMatch(w,re,f+' '+re)}
 assert.match(K.MASCOT.state,/da collegare/);
});

test('catalogue: about 300+ Lucide icons, exactly the names of the Italian table, clean elements, licence with it',()=>{
 const names=Object.keys(SET.icons);assert.ok(names.length>=300&&names.length<=420,names.length);
 assert.deepEqual(names,K.NAMES.slice(),'catalogue = table');assert.equal(new Set(K.NAMES).size,K.NAMES.length,'no icon twice in the table');
 for(const [n,g] of Object.entries(SET.icons)){assert.match(g,/^(<(path|circle|rect|line|ellipse|polyline|polygon)( [a-z][a-z0-9-]*="[^"<>]*")*\/>)+$/,n);assert.doesNotMatch(g.replace(/ fill="currentColor"/g,''),/stroke|fill|style|script|href/,n)}
 assert.match(SET.LICENSE,/^ISC License/);assert.match(SET.LICENSE,/Lucide Icons and Contributors/);assert.match(SET.LICENSE,/MIT License/);
 const lic=read('lib/icon-set.LICENSE.txt');assert.match(lic,/ISC License/);assert.match(lic,/lucide-static/);assert.match(read('lib/icon-set.js'),/^\/\* RADIX icon set: \d+ icons of Lucide v/);
 assert.ok(fs.statSync(path.join(root,'lib/icon-set.js')).size<130000,'size stays sane');
 assert.ok(fs.existsSync(path.join(root,'tools/icon-set/build.js')));
});

test('concept mapping: Italian words, plurals, accents and phrases; «non trovata» with alternatives',()=>{
 const icon=q=>K.mapConcept(q).icon;
 assert.equal(icon('Pizza'),'pizza');assert.equal(icon('pizze'),'pizza','plural');assert.equal(icon('Caffè'),'coffee','accent');
 assert.equal(icon('Consegna a domicilio'),'truck');assert.equal(icon('Spedizione gratuita'),'truck','the first word counts more');
 assert.equal(icon('Dove siamo'),'map-pin');assert.equal(icon('Orari'),'clock');assert.equal(icon('Telefono'),'phone');assert.equal(icon('Email'),'mail');
 assert.equal(icon('Senza glutine'),'wheat-off');assert.equal(icon('Wi-Fi'),'wifi');assert.equal(icon('Parcheggio'),'square-parking');assert.equal(icon('Assistenza clienti'),'headset');
 assert.equal(icon('house'),'house','English name too');
 const miss=K.mapConcept('Unicorno');assert.equal(miss.found,false);assert.equal(miss.icon,'');assert.equal(miss.alternatives.length,6);assert.ok(miss.alternatives.every(K.has));
 const hit=K.mapConcept('Prenotazione');assert.equal(hit.found,true);assert.ok(!hit.alternatives.includes(hit.icon));assert.ok(hit.alternatives.includes('calendar-check'));
 assert.equal(K.mapConcept('Resi').icon,'refresh-cw','a prefix alone («residenza») is not enough');
 assert.equal(K.mapConcept('  '+'x'.repeat(80)).label.length,K.MAX_LABEL);
 assert.deepEqual(K.findIcons(''),[]);
 assert.deepEqual(K.parseConcepts('Pizza, pizza\nAsporto;; \n Vino '),['Pizza','Asporto','Vino']);
 assert.equal(K.parseConcepts(Array.from({length:40},(_,i)=>'c'+i).join('\n')).length,24);
 assert.deepEqual(K.searchCatalogue('pane'),['croissant','wheat']);assert.deepEqual(K.searchCatalogue('house'),['house']);assert.equal(K.searchCatalogue('').length,K.NAMES.length);
 assert.ok(K.searchCatalogue('auto').includes('car'));
});

test('suggestions from the project: the sector, the words of its profile, the basics; no icon proposed twice',()=>{
 const s=K.suggestConcepts({name:'Forno Aurora (DATI DI ESEMPIO)',kind:'Panificio e pasticceria',summary:'Pane, dolci e caffè a Bologna'},{});
 assert.ok(s.includes('Caffè')&&s.includes('Pane')&&s.includes('Dolci'),s.join());assert.deepEqual(s.slice(-4),['Telefono','Email','Dove siamo','Orari']);assert.ok(s.length<=12);
 const icons=s.map(l=>K.mapConcept(l).icon).filter(Boolean);assert.equal(new Set(icons).size,icons.length);
 const h=K.suggestConcepts({name:'Hotel Lago'},{brief:{industry:'Albergo con piscina e ristorante'}});assert.ok(h.includes('Wi-Fi')&&h.includes('Piscina'),h.join());
 assert.deepEqual(K.suggestConcepts(null,null),['Telefono','Email','Dove siamo','Orari']);
});

test('colours from the Kit identità, the 3 styles and the settings within their ranges',()=>{
 const kit={identityKit:{palette:[{role:'primary',hex:'#c2410c'},{role:'dark',hex:'#1c1917'},{role:'light',hex:'#fff7ed'}]}};
 assert.deepEqual(K.kitPalette(kit).map(c=>c.hex),['#C2410C','#1C1917','#FFF7ED']);
 const c=K.colorsFrom(kit);assert.equal(c.fg,'#C2410C');assert.equal(c.fromKit,true);assert.ok(K.contrast(c.bg,'#FFFFFF')<1.3,'container is a light tint');
 assert.equal(K.colorsFrom({identityKit:{palette:[{role:'primary',hex:'#FDE68A'},{role:'dark',hex:'#222222'}]}}).fg,'#222222','too light on white: the dark');
 assert.equal(K.colorsFrom({}).fromKit,false);
 assert.deepEqual(K.STYLES.map(s=>s.id),['sottile','spesso','duotono']);
 const [a,b,d]=K.STYLES.map(s=>K.proposalSettings(s.id,c));assert.ok(a.stroke<b.stroke);assert.equal(a.shape,'none');assert.equal(d.shape,'rounded');assert.equal(d.fg,'#C2410C');
 assert.equal(K.advised(['app']),'spesso');assert.equal(K.advised(['social','sito']),'sottile','the first use in the list order');assert.equal(K.advised([]),'sottile');
 const s=K.settingsOf({stroke:9,grid:30,padding:-3,shape:'stella',corner:'x',fg:'zzz'});assert.deepEqual([s.stroke,s.grid,s.padding,s.shape,s.corner],[3,24,0,'none','round']);assert.match(s.fg,/^#[0-9A-F]{6}$/);
 assert.equal(K.settingsOf({stroke:1.6}).stroke,1.5);assert.equal(K.settingsOf({grid:48}).grid,48);
});

test('one icon: clean SVG with its viewBox, the glyph in the grid, fixed colours or currentColor',()=>{
 const s=K.settingsOf({stroke:2,grid:48,padding:4,shape:'circle',fg:'#C2410C',bg:'#FBE9E1'});
 const v=K.iconSvg('pizza',s,{title:'Pizza & co'});assert.ok(wellFormed(v));
 assert.match(v,/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="48" height="48" viewBox="0 0 48 48" fill="none"><title>Pizza &amp; co<\/title><circle cx="24" cy="24" r="24" fill="#FBE9E1"\/><g transform="translate\(8 8\) scale\(1\.333\)" color="#C2410C" stroke="#C2410C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">/);
 assert.ok(v.includes(SET.icons.pizza));assert.doesNotMatch(v,/script|on[a-z]+=|xlink|<image/);
 const cc=K.iconSvg('pizza',s,{currentColor:true});assert.match(cc,/stroke="currentColor"/);assert.match(cc,/fill="currentColor" fill-opacity="0.14"/);assert.doesNotMatch(cc,/#C2410C|#FBE9E1/);
 const sharp=K.iconSvg('house',{...s,corner:'sharp',shape:'square'});assert.match(sharp,/stroke-linecap="square" stroke-linejoin="miter"/);assert.match(sharp,/<rect width="48" height="48" fill=/);
 assert.match(K.iconSvg('house',{...s,shape:'none'},{size:512}),/width="512" height="512" viewBox="0 0 48 48"/);
 assert.throws(()=>K.iconSvg('non-esiste',s),/non nel catalogo/);
 assert.equal(K.strokeAt(K.settingsOf({stroke:1.5,padding:0}),16),1);assert.equal(K.strokeAt(K.settingsOf({stroke:2,padding:6}),16),.67);
});

test('checks: same stroke and grid read back from the SVGs, contrast 3:1, 16 px, dense, missing and repeated icons',()=>{
 const items=[{label:'Pizza',icon:'pizza'},{label:'Vino',icon:'wine'},{label:'Unicorno',icon:''},{label:'Torta',icon:'pizza'}];
 const by=(list,id)=>list.find(c=>c.id===id);
 const ok=K.checks(items,K.settingsOf({stroke:1.5,fg:'#4338CA',surface:'#FFFFFF'}));
 assert.equal(by(ok,'tratto').state,'ok');assert.equal(by(ok,'griglia').state,'ok');assert.equal(by(ok,'contrasto').state,'ok');assert.equal(by(ok,'piccolo').state,'ok');
 assert.equal(by(ok,'mancanti').state,'warn');assert.match(by(ok,'mancanti').text,/Unicorno/);assert.equal(by(ok,'doppioni').state,'warn');assert.match(by(ok,'doppioni').text,/«Pizza» e «Torta»/);
 const low=K.checks(items,K.settingsOf({fg:'#FDE68A',surface:'#FFFFFF'}));assert.equal(by(low,'contrasto').state,'fail');assert.match(by(low,'contrasto').text,/3:1/);
 const box=K.checks(items,K.settingsOf({fg:'#FFFFFF',bg:'#4338CA',shape:'rounded',padding:4,stroke:2.25}));assert.equal(by(box,'contrasto').state,'ok','icon against its container');assert.match(by(box,'contrasto').text,/contenitore/);
 assert.equal(by(K.checks(items,K.settingsOf({stroke:1,padding:6})),'piccolo').state,'fail');assert.equal(by(K.checks(items,K.settingsOf({stroke:1.25,padding:0})),'piccolo').state,'warn');
 const dense=K.NAMES.find(n=>{const d=K.detailOf(n);return d.els>=7||d.cmds>=60});assert.ok(dense,'some catalogue icon is dense');
 assert.equal(by(K.checks([{label:'X',icon:dense}],K.settingsOf({})),'dettagli').state,'warn');
 assert.deepEqual(K.checks([],{}).map(c=>[c.id,c.state]),[['set','fail']]);assert.equal(K.blocking(K.checks([],{})),true);assert.equal(K.blocking(ok),false);
 for(const st of K.STYLES){const r=K.checks([{label:'A',icon:'house'}],K.proposalSettings(st.id,K.colorsFrom({})));assert.ok(r.every(c=>c.state==='ok'),st.id+' '+JSON.stringify(r))}
});

test('sprite, preview sheet, example page and the zip: every file in its place, SVG clean, PNG at 64/128/512, licence',async()=>{
 const items=[{label:'Pizza',icon:'pizza'},{label:'Vino',icon:'wine'},{label:'Consegna a domicilio',icon:'truck'},{label:'Pizza al taglio',icon:'pizza'},{label:'Unicorno',icon:''}];
 const s=K.proposalSettings('duotono',K.colorsFrom({}));const set=K.setOf(items);
 assert.deepEqual(set.map(x=>x.slug),['pizza','vino','consegna-a-domicilio','pizza-al-taglio']);
 assert.deepEqual(K.setOf([{label:'Pizza',icon:'pizza'},{label:'pizza!',icon:'wine'}]).map(x=>x.slug),['pizza','pizza-2'],'unique file names');
 const sprite=K.spriteSvg(set,s);assert.ok(wellFormed(sprite));assert.equal((sprite.match(/<symbol id="icona-/g)||[]).length,4);assert.match(sprite,/<symbol id="icona-vino" viewBox="0 0 24 24"><title>Vino<\/title>/);assert.doesNotMatch(sprite,/#[0-9A-F]{6}/,'currentColor only');
 const pngCalls=[],png=async(svg,w,h)=>{pngCalls.push([w,h]);assert.match(svg,/^<svg /);return new Uint8Array([137,80,78,71,w&255,h&255])};
 const list=await K.files(items,s,{name:'Forno Aurora',date:DATE,png,uses:['sito','social']}),names=list.map(f=>f.name);
 for(const sl of ['pizza','vino','consegna-a-domicilio','pizza-al-taglio']){assert.ok(names.includes('svg/'+sl+'.svg'));assert.ok(names.includes('svg-currentcolor/'+sl+'.svg'));for(const px of [64,128,512])assert.ok(names.includes('png/'+px+'/'+sl+'.png'),sl+px)}
 for(const f of ['sprite.svg','esempio-sprite.html','anteprima.svg','anteprima.png','LEGGIMI.txt','LICENZA-lucide.txt'])assert.ok(names.includes(f),f);
 assert.equal(names.length,4*2+4*3+6);assert.equal(pngCalls.filter(([w,h])=>w===h&&[64,128,512].includes(w)).length,12);
 for(const f of list.filter(x=>/\.svg$/.test(x.name))){assert.ok(wellFormed(f.data),f.name);assert.doesNotMatch(f.data,/<script|on[a-z]+=|href="http/,f.name)}
 const one=list.find(f=>f.name==='svg/vino.svg').data;assert.match(one,/viewBox="0 0 24 24"/);assert.match(one,/<title>Vino<\/title>/);
 const sheet=list.find(f=>f.name==='anteprima.svg').data;assert.match(sheet,/Forno Aurora/);assert.match(sheet,/4 icone · Duotono in contenitore/);assert.match(sheet,/Prova in piccolo/);
 const ex=list.find(f=>f.name==='esempio-sprite.html').data;assert.match(ex,/<use href="sprite\.svg#icona-consegna-a-domicilio"\/>/);
 const lic=list.find(f=>f.name==='LICENZA-lucide.txt').data;assert.equal(lic,SET.LICENSE);
 const rd=list.find(f=>f.name==='LEGGIMI.txt').data;assert.match(rd,/SET DI ICONE · Forno Aurora/);assert.match(rd,/Lucide/);assert.match(rd,/ISC/);assert.match(rd,/LICENZA-lucide\.txt/);assert.match(rd,/Consegna a domicilio → consegna-a-domicilio\.svg \(Lucide «truck»\)/);
 assert.match(rd,/\[ATTENZIONE\] Icone mancanti: .*Unicorno/);assert.match(rd,/Uso previsto: sito web, social/);assert.match(rd,/MASCOTTE/);assert.match(rd,/\r\n/);
 const z=ZIP.unzip(K.bundle(list,{date:DATE}));assert.deepEqual(z.map(e=>e.name),names);assert.equal(new TextDecoder().decode(z.find(e=>e.name==='sprite.svg').data),sprite);
 assert.equal(K.zipName('Forno Aurora'),'icone-forno-aurora.zip');
 const noCC=await K.files(items,{...s,currentColor:false},{name:'X',date:DATE});assert.ok(!noCC.some(f=>f.name.startsWith('svg-currentcolor/')));assert.ok(!noCC.some(f=>/\.png$/.test(f.name)),'no png without a renderer');
 await assert.rejects(K.files([{label:'Unicorno',icon:''}],s,{}),/Nessuna icona/);
});

test('saved in the project: key «icons» in the agents document, other keys kept; agents-page keeps it',async()=>{
 let stored={schemaVersion:1,conversations:{copywriter:[{role:'user',content:'ciao'}]},prefs:{a:1},logoVector:{schemaVersion:1,items:[{id:'lv'}]}},conflicts=1;
 class ConflictError extends Error{}
 const ws={ConflictError,bind:(pid,name)=>{assert.equal(name,'agents');return {load:async()=>JSON.parse(JSON.stringify(stored)),save:async d=>{if(conflicts-->0)throw new ConflictError('x');stored=d}}}};
 const items=[{label:'Pizza',icon:'pizza',found:true,alternatives:['x']},{label:'Unicorno',icon:''},{label:'Finta',icon:'non-esiste'}];
 const rec=K.savedRecord(items,K.proposalSettings('spesso',K.colorsFrom({})),{name:'Forno Aurora',uses:['app','boh'],by:'Ilaria',at:'2026-10-24T09:00:00Z'});
 assert.equal(rec.id,'icone-forno-aurora');assert.deepEqual(rec.uses,['app']);assert.deepEqual(rec.concepts,[{label:'Pizza',icon:'pizza'},{label:'Unicorno',icon:''},{label:'Finta',icon:''}]);assert.equal(rec.settings.style,'spesso');
 await K.saveStore(ws,'forno',K.withRecord(rec));assert.deepEqual(stored.icons.items.map(x=>x.id),['icone-forno-aurora']);assert.deepEqual(stored.logoVector,{schemaVersion:1,items:[{id:'lv'}]});assert.deepEqual(stored.prefs,{a:1});
 for(let i=0;i<9;i++)await K.saveStore(ws,'forno',K.withRecord({...rec,id:'icone-'+i}));assert.equal(stored.icons.items.length,K.MAX_SAVED);
 assert.deepEqual(K.readStore({icons:'boh'}),{schemaVersion:1,items:[]});assert.deepEqual(K.readStore({icons:{items:[{id:'a'},rec]}}).items,[rec]);
 await assert.rejects(K.saveStore(null,'x',s=>s),/non disponibile/);
 const src=read('agents-page.js'),fn=/function clean\(d\)\{[^\n]*\}/.exec(src)[0],ctx={MAX_KEPT:40};vm.createContext(ctx);vm.runInContext(fn+';this.clean=clean',ctx);
 assert.deepEqual(JSON.parse(JSON.stringify(ctx.clean(stored).icons)),stored.icons,'icons kept by agents-page clean()');
 assert.match(src,/if\(fresh&&data\)\{[^}]*data\.icons=fresh\.icons;/,'and when the tab comes back');
});
