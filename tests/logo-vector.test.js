'use strict';
// Studio «Logo in vettoriale» (lib/logo-vector-studio.js) and its tracing core (lib/logo-trace.js): the card in «Cosa vuoi
// fare» (Brand), background detection, colour quantisation, speck removal, tracing synthetic bitmaps (a filled circle and
// a square) into closed paths, Ramer-Douglas-Peucker, holes and mono versions, the SVG well formed and unchanged by the
// sanitizer of lib/identity-studio.js, the export file list (SVG, PNG, favicon, PDF, LEGGIMI), the saved key «logoVector»
// that agents-page.js keeps, the logo set in the Kit identità. No AI and no network. Fake data only (DATI DI ESEMPIO).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const T=require('../lib/logo-trace.js'),S=require('../lib/logo-vector-studio.js'),IS=require('../lib/identity-studio.js'),PS=require('../lib/print-studio.js'),ZIP=require('../lib/zip-lite.js');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const DATE=new Date('2026-10-23T09:00:00Z');
// A bitmap drawn by a function of the pixel centre: [r,g,b] or [r,g,b,a].
function bitmap(w,h,f){const d=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const c=f(x+.5,y+.5),i=(y*w+x)*4;d[i]=c[0];d[i+1]=c[1];d[i+2]=c[2];d[i+3]=c[3]==null?255:c[3]}return {width:w,height:h,data:d}}
const ORANGE=[220,90,30],BROWN=[40,30,30],CREAM=[255,240,200],WHITE=[255,255,255],CLEAR=[0,0,0,0];
// circle r=40 at (60,60) and a 60×60 square from (120,30), on white
const circleSquare=(bg=WHITE)=>bitmap(200,120,(x,y)=>Math.hypot(x-60,y-60)<40?ORANGE:x>120&&x<180&&y>30&&y<90?BROWN:bg);
// «Forno Aurora» mark: an orange ring with a cream sun inside, a brown bar for the wordmark, transparent background
const mark=()=>bitmap(300,160,(x,y)=>{const r=Math.hypot(x-80,y-80);if(r<30)return CREAM;if(r<60)return ORANGE;if(x>160&&x<280&&y>50&&y<110)return BROWN;return CLEAR});
const hexNear=(h,c,tol=12)=>T.rgbOf(h).every((v,i)=>Math.abs(v-c[i])<=tol);
// Every tag opened is closed, in order, and only svg, title and path appear.
function wellFormed(svg){const st=[];for(const m of svg.matchAll(/<(\/?)([a-zA-Z]+)[^>]*?(\/?)>/g)){if(m[3])continue;if(m[1]){if(st.pop()!==m[2])return false}else st.push(m[2])}return st.length===0}

test('card in Crea (Brand), studio wired, agents doc keeps «logoVector»',()=>{
 const core=require('../agency/crea-core.js'),card=core.CARDS.find(c=>c.id==='logovettoriale');
 assert.equal(card.title,'Logo in vettoriale');assert.equal(card.group,'Brand');assert.equal(card.inline,'logovector');assert.match(card.cost,/Nessuna chiamata AI/);
 assert.deepEqual(core.inGroup('Brand').map(c=>c.id),['naming','identita','logovettoriale','tono','coordinato','icone']);
 assert.equal(core.fromAsk('?q=vettorializzare il logo').match,'logovettoriale');assert.equal(core.fromAsk('?q=logo e colori').match,'identita');
 const html=read('agency/crea.html');assert.ok(html.indexOf('/lib/logo-trace.js')>0&&html.indexOf('/lib/logo-trace.js')<html.indexOf('/lib/logo-vector-studio.js'));assert.ok(html.indexOf('/lib/identity-studio.js')<html.indexOf('/lib/logo-vector-studio.js'));
 assert.match(read('agency/crea.js'),/logovector:\{global:'RadixLogoVectorStudio'/);assert.match(read('agency/crea.js'),/S\.logoVectorStudio\(\{/);
 assert.match(read('agency/marketing-look.js'),/logovettoriale:'logoVector'/);
 const ap=read('agents-page.js');assert.equal((ap.match(/data\.logoVector=fresh\.logoVector/g)||[]).length,2);assert.match(ap,/if\(d\.logoVector\)out\.logoVector=d\.logoVector/);
 assert.equal(typeof S.logoVectorStudio,'function');
 const w=read('lib/logo-vector-studio.js');assert.match(w,/pf-drop lv-drop/);assert.match(w,/'cs-note'/);assert.match(read('shell/crea.css'),/\.logo-vector-studio \.lv-stage \.lv-after\{clip-path/);
});

test('no AI and no network in the studio or the tracer',()=>{
 for(const f of ['lib/logo-trace.js','lib/logo-vector-studio.js']){const w=read(f);
  for(const re of [/fetch\(/,/XMLHttpRequest/,/\/api\//,/RadixAI|askClaude|runtime\.(chat|complete)/,/claude-[a-z0-9]|gpt-\d/,/https?:\/\/(?!www\.w3\.org)/])assert.doesNotMatch(w,re,f+' '+re)}
});

test('background: solid colour, transparent, or none',()=>{
 const b=T.background(circleSquare());assert.equal(b.kind,'solid');assert.deepEqual(b.color,[255,255,255]);
 assert.equal(T.background(mark()).kind,'transparent');
 assert.equal(T.background(bitmap(40,40,(x,y)=>[(x*6)%255,(y*6)%255,(x*y)%255])).kind,'none');
 assert.throws(()=>T.background({width:2,height:2,data:new Uint8Array(4)}),/non valida/);
});

test('quantisation: the logo colours, the background apart, anti-aliased pixels to the nearest colour, 1–6 colours',()=>{
 // a soft edge: half-way pixels between orange and white
 const img=bitmap(200,120,(x,y)=>{const r=Math.hypot(x-60,y-60);if(r<39)return ORANGE;if(r<41)return [238,172,142];return x>120&&x<180&&y>30&&y<90?BROWN:WHITE});
 assert.equal(T.suggestColors(img),2);
 const q=T.quantize(img,{colors:2});assert.equal(q.bgIndex,0);assert.equal(q.centers.length,3);
 assert.ok(q.centers.slice(1).some(c=>hexNear(T.hexOf(c),ORANGE,16))&&q.centers.slice(1).some(c=>hexNear(T.hexOf(c),BROWN,16)),JSON.stringify(q.centers));
 const at=(x,y)=>q.labels[y*200+x];assert.equal(at(60,60),at(60,61));assert.notEqual(at(60,60),at(150,60));assert.equal(at(2,2),0,'the background keeps index 0');
 const edge=at(60+40,60);assert.ok(edge===at(60,60)||edge===0,'soft pixels fall on orange or white');
 assert.equal(T.quantize(img,{colors:99}).centers.length<=7,true);assert.equal(T.quantize(img,{colors:0}).centers.length,2,'at least one logo colour');
 const tq=T.quantize(mark(),{colors:3});assert.equal(tq.bgIndex,-1);assert.equal(tq.labels[0],255,'transparent pixels are 255');assert.equal(tq.centers.length,3);
 assert.equal(T.suggestColors(mark()),3);
});

test('speck removal: regions under the minimum area take the colour around them, larger ones stay',()=>{
 const img=bitmap(60,60,(x,y)=>x>5&&x<8&&y>5&&y<8?BROWN:x>30&&x<40&&y>30&&y<40?BROWN:WHITE);
 const q=T.quantize(img,{colors:1}),L=q.labels,at=(x,y)=>L[y*60+x];
 assert.notEqual(at(6,6),0);assert.equal(T.removeSpecks(q,20),1);assert.equal(at(6,6),0,'the 2×2 speck became background');assert.notEqual(at(35,35),0,'the 9×9 square stays');
 assert.equal(T.removeSpecks(q,0),0);
 // a pinhole in a shape is filled too
 const ring=bitmap(40,40,(x,y)=>x>5&&x<35&&y>5&&y<35&&!(x>19&&x<21&&y>19&&y<21)?BROWN:WHITE),qr=T.quantize(ring,{colors:1});T.removeSpecks(qr,5);assert.notEqual(qr.labels[20*40+20],0);
});

test('RDP: collinear points go, the corners stay; on a closed outline too',()=>{
 const line=Array.from({length:11},(_,i)=>[i,0]);assert.deepEqual(T.rdp(line,.5),[[0,0],[10,0]]);
 const zig=Array.from({length:11},(_,i)=>[i,i%2?.2:0]);assert.equal(T.rdp(zig,.5).length,2);assert.equal(T.rdp(zig,.1).length,11);
 const sq=[];for(let i=0;i<10;i++)sq.push([i,0]);for(let i=0;i<10;i++)sq.push([10,i]);for(let i=10;i>0;i--)sq.push([i,10]);for(let i=10;i>0;i--)sq.push([0,i]);
 const s=T.rdpClosed(sq,.5);assert.equal(s.length,4);assert.deepEqual(s.map(p=>p.join(',')).sort(),['0,0','0,10','10,0','10,10']);
 assert.equal(Math.abs(T.area(s)),100);
});

test('tracing a filled circle and a square: two closed paths, true area, square corners exact',()=>{
 const r=T.trace(circleSquare(),{colors:2,detail:80,smooth:50});
 assert.equal(r.background,'solid');assert.deepEqual(r.viewBox,[20,20,160,80],'cropped to the shapes');assert.equal(r.layers.length,2);
 const [c,s]=r.layers;assert.ok(hexNear(c.color,ORANGE)&&hexNear(s.color,BROWN),'largest area at the bottom');
 assert.equal(c.loops.length,1);assert.equal(s.loops.length,1);
 const ac=Math.abs(T.area(c.loops[0]));assert.ok(Math.abs(ac-Math.PI*40*40)/(Math.PI*40*40)<.03,'circle area '+ac);
 assert.ok(c.loops[0].length>=8&&c.loops[0].length<60,'a circle, not a pixel staircase: '+c.loops[0].length);
 assert.deepEqual(s.loops[0].map(p=>p.join(',')).sort(),['120,30','120,90','180,30','180,90']);
 // every outline closed in the path data, curves on the circle, straight lines on the square
 const svg=T.svgOf(r);const ds=[...svg.matchAll(/ d="([^"]+)"/g)].map(m=>m[1]);assert.equal(ds.length,2);
 for(const d of ds){assert.match(d,/^M[\d.]+ [\d.]+/);assert.match(d,/Z$/);assert.equal((d.match(/M/g)||[]).length,(d.match(/Z/g)||[]).length)}
 assert.match(ds[0],/Q/);assert.equal(ds[1],'M100 10L160 10L160 70L100 70Z');assert.equal(s.nodes,4);
 // smooth 0: a polygon, no curves
 assert.doesNotMatch(T.svgOf(T.trace(circleSquare(),{colors:2,detail:80,smooth:0})),/Q/);
 // the full-image viewBox for the before/after overlay keeps the pixel coordinates
 assert.match(T.svgOf(r,{full:true}),/viewBox="0 0 200 120"/);
 // keep the background: a rectangle under the layers, the whole picture as viewBox
 const k=T.trace(circleSquare([250,246,236]),{colors:2,background:'keep'});assert.equal(k.keepBg,true);assert.deepEqual(k.viewBox,[0,0,200,120]);assert.match(T.svgOf(k),/<path fill="#FAF6EC" d="M0 0H200V120H0Z"\/>/);
});

test('holes, stacked layers and mono versions: the light inside of a ring is «paper»',()=>{
 const r=T.trace(mark(),{colors:3,detail:80,smooth:40});assert.equal(r.background,'transparent');assert.equal(r.layers.length,3);
 const ring=r.layers.find(l=>hexNear(l.color,ORANGE)),sun=r.layers.find(l=>hexNear(l.color,CREAM)),bar=r.layers.find(l=>hexNear(l.color,BROWN));
 assert.equal(sun.paper,true);assert.equal(ring.paper,false);assert.equal(bar.paper,false);
 assert.equal(ring.loops.length,2,'outer edge and hole');assert.ok(r.layers.indexOf(ring)<r.layers.indexOf(sun),'the ring is under the sun');
 // the hole of the ring is a little smaller than the sun: the layers overlap, no hairline gap
 const hole=Math.min(...ring.loops.map(l=>Math.abs(T.area(l)))),sunA=Math.abs(T.area(sun.loops[0]));assert.ok(hole<sunA,hole+' < '+sunA);
 assert.equal(r.mono.loops.length,3,'ring (2 loops) and bar');
 const black=T.svgOf(r,{variant:'black'}),white=T.svgOf(r,{variant:'white'});assert.match(black,/fill="#000000" fill-rule="evenodd"/);assert.match(white,/fill="#FFFFFF"/);assert.equal((black.match(/<path/g)||[]).length,1);
 // forcing the sun to «full» fills the hole in the mono version
 const f=T.trace(mark(),{colors:3,detail:80,smooth:40,paper:[null,null,false]});assert.equal(f.mono.loops.length,2);
 // recolour by layer
 const rc=T.trace(mark(),{colors:3,recolor:['#123456','','not-a-colour']});assert.equal(rc.layers[0].color,'#123456');assert.ok(T.isHex(rc.layers[2].color)&&rc.layers[2].color===rc.layers[2].original);
});

test('the three proposals: Pulito has fewer nodes than Fedele, Essenziale fewer colours',()=>{
 const img=mark(),p=Object.fromEntries(T.PROPOSALS.map(x=>[x.id,T.trace(img,T.proposalSettings(x.id,{colors:3,type:'entrambi'}))]));
 assert.deepEqual(T.PROPOSALS.map(x=>x.title),['Fedele','Pulito','Essenziale']);
 assert.ok(p.pulito.nodes<p.fedele.nodes,p.pulito.nodes+' < '+p.fedele.nodes);assert.equal(p.essenziale.layers.length,2);assert.equal(p.fedele.layers.length,3);
 assert.ok(T.proposalSettings('fedele',{type:'scritta'}).detail>T.proposalSettings('fedele',{type:'simbolo'}).detail,'text keeps more detail');
 assert.deepEqual(T.settingsOf({colors:9,detail:-4,smooth:400,background:'x',type:'?'}),{colors:6,detail:0,smooth:100,background:'drop',type:'entrambi',recolor:[],paper:[]});
});

test('SVG: well formed, only svg/title/path, unchanged by the identity sanitizer, the title escaped',()=>{
 const r=T.trace(mark(),{colors:3});
 for(const v of ['color','black','white']){const svg=T.svgOf(r,{variant:v,title:'Forno <Aurora> & co'});
  assert.ok(wellFormed(svg),v);assert.match(svg,/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 [\d.]+ [\d.]+">/);assert.match(svg,/<title>Forno &lt;Aurora&gt; &amp; co<\/title>/);
  assert.deepEqual([...new Set([...svg.matchAll(/<([a-z]+)/g)].map(m=>m[1]))].sort(),['path','svg','title']);
  assert.equal(IS.sanitizeSvg(svg),svg,'sanitizer keeps it as it is');assert.doesNotMatch(svg,/script|on\w+=|href|url\(/i)}
 const sq=T.svgOf(r,{box:T.squareBox(r),width:32,height:32});const vb=/viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(sq);assert.equal(vb[1],vb[2],'square favicon box');assert.match(sq,/width="32" height="32"/);
 // the clear-space preview: the logo with a quarter of the short side around it
 assert.equal(S.clearSpace(r),Math.min(r.viewBox[2],r.viewBox[3])/4);assert.match(S.safeSvg(r),/stroke-dasharray/);assert.ok(wellFormed(S.safeSvg(r)));
});

test('an uploaded SVG is sanitised before it is drawn: no scripts, external refs or event attributes',()=>{
 const evil='<?xml version="1.0"?><!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 120 60" onload="alert(1)" width="12">'
  +'<script>alert(2)</script><style>@import url(https://x.test/a.css)</style><image href="https://x.test/p.png"/><use xlink:href="https://x.test/s.svg#a"/>'
  +'<foreignObject><iframe src="javascript:alert(3)"></iframe></foreignObject><a href="javascript:alert(4)"><rect width="9" height="9"/></a>'
  +'<circle cx="30" cy="30" r="20" fill="#DC5A1E" onclick="alert(5)" style="fill:url(https://x.test/f)"/><rect x="60" y="15" width="50" height="30" fill="url(https://x.test/g)"/><text x="5" y="55">Forno</text></svg>';
 const c=IS.sanitizeSvg(evil),sized=S.sizedSvg(c);
 for(const s of [c,sized]){assert.doesNotMatch(s,/script|onload|onclick|href|https?:\/\/x\.test|javascript|foreignObject|iframe|<image|<use|<style|@import/i);assert.match(s,/<circle cx="30" cy="30" r="20" fill="#DC5A1E"\/>/)}
 assert.match(sized,/^<svg width="1000" height="500" xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 120 60">/,'one width and height, for the canvas');
 assert.equal(S.sizedSvg('not svg'),'');
 assert.deepEqual(S.traceSize(200,100),[600,300]);assert.deepEqual(S.traceSize(1200,1200),[900,900]);assert.deepEqual(S.traceSize(3000,200),[1600,107]);
});

test('export: the file list, the PNG sizes, the scheda logo PDF with vector paths, LEGGIMI about fonts, the zip',async()=>{
 const r=T.trace(mark(),T.proposalSettings('fedele',{colors:3})),pngs=[];
 const list=await S.files(r,{name:'Forno Aurora (DATI DI ESEMPIO)',proposal:'fedele',date:DATE,png:async(svg,w,h)=>{pngs.push([w,h,IS.sanitizeSvg(svg)===svg]);return new Uint8Array([137,80,78,71,w&255])}});
 assert.deepEqual(list.map(f=>f.name),['logo.svg','logo-mono-nero.svg','logo-mono-bianco.svg','favicon/favicon.svg','png/logo-512.png','png/logo-1024.png','png/logo-2048.png','favicon/favicon-32.png','favicon/apple-touch-icon-180.png','scheda-logo.pdf','LEGGIMI.txt']);
 assert.deepEqual(pngs.map(p=>Math.max(p[0],p[1])),[512,1024,2048,32,180]);assert.ok(pngs.every(p=>p[2]),'every PNG drawn from a clean SVG');assert.deepEqual(pngs[3].slice(0,2),[32,32]);
 for(const f of list)assert.ok(f.label,f.name);
 const pdf=Buffer.from(list.find(f=>f.name==='scheda-logo.pdf').data).toString('latin1');assert.match(pdf,/^%PDF-1\.4/);assert.match(pdf,/%%EOF\n$/);assert.match(pdf,/ c /,'curves as Bézier operators');assert.match(pdf,/f\*/,'even-odd fill for the holes');
 assert.match(pdf,/\(Scheda logo/);assert.doesNotMatch(pdf,/\/Subtype \/Image/,'no raster: vector paths only');
 const txt=list.find(f=>f.name==='LEGGIMI.txt').data;assert.match(txt,/ricalcate come forme, non come testo/);assert.match(txt,/font/);assert.match(txt,/grafico/);for(const f of list)assert.ok(txt.includes(f.name),f.name+' in LEGGIMI');
 // without a PNG renderer (Node) the vector files are still there; a cleaned SVG upload adds originale-pulito.svg
 const lite=await S.files(r,{name:'x',date:DATE,original:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>'});assert.deepEqual(lite.map(f=>f.name),['logo.svg','logo-mono-nero.svg','logo-mono-bianco.svg','originale-pulito.svg','favicon/favicon.svg','scheda-logo.pdf','LEGGIMI.txt']);
 const z=S.bundle(list,{date:DATE});assert.deepEqual(ZIP.unzip(z).map(e=>e.name),list.map(f=>f.name));assert.equal(S.zipName('Forno Aurora'),'logo-vettoriale-forno-aurora.zip');
 await assert.rejects(S.files({...r,layers:[]},{}),/Nessuna forma/);
 // the PDF page: logo paths inside the A4 page, colours with RGB and CMYK
 const doc=S.schedaDoc(r,{name:'Forno Aurora',date:DATE}),items=doc.pages[0].items;assert.equal(doc.pages[0].w,210);assert.ok(items.filter(i=>i.t==='path'&&i.label==='Logo').length>=3*2+1);
 assert.ok(items.some(i=>i.t==='text'&&/^CMYK /.test(i.s)));assert.ok(items.filter(i=>i.t==='text').every(i=>i.x>=0&&i.y<=297));
});

test('fitSvg: the lightest detail that fits; the Kit identità gets the logo, the rest of the kit stays',async()=>{
 const img=mark(),full=T.svgOf(T.trace(img,{colors:3,detail:100})),fit=T.fitSvg(img,{colors:3,detail:100},Math.floor(full.length*.6));
 assert.ok(fit&&fit.svg.length<=full.length*.6);assert.equal(T.fitSvg(img,{colors:3},10),null);
 const r=T.trace(img,{colors:3}),svg=T.svgOf(r,{title:'Forno Aurora'});
 const kept=S.kitWithLogo({identityKit:{brand:'Forno Aurora',direction:'Calore',palette:[{role:'primary',hex:'#AA3300'}],logo:'<svg/>'}},svg,r.layers,'Forno Aurora',{at:'2026-10-23T09:00:00Z'});
 assert.equal(kept.direction,'Calore');assert.deepEqual(kept.palette,[{role:'primary',hex:'#AA3300'}]);assert.equal(kept.logo,svg);assert.equal(kept.logoSource,'logo-vettoriale');
 const fresh=S.kitWithLogo({},svg,r.layers,'Forno Aurora',{at:'2026-10-23T09:00:00Z'});assert.deepEqual(fresh.palette.map(c=>c.role),['primary','secondary','accent','dark','light']);
 assert.ok(hexNear(fresh.palette[0].hex,ORANGE),'the largest colourful layer is the primary');const b=PS.brandOf({identityKit:fresh},'x');assert.equal(b.fromKit,true);assert.equal(b.logo,svg);
 // saved through the project registry, retried on a conflict
 class ConflictError extends Error{}let project={revision:1,profile:{visual:'Copertina: #111111.',identityKit:{brand:'Forno Aurora',palette:[{role:'primary',hex:'#AA3300'}]}}},conflicts=1;
 const ws={ConflictError,projects:{get:async()=>JSON.parse(JSON.stringify(project)),update:async(id,rev,patch)=>{if(conflicts-->0)throw new ConflictError('x');assert.equal(id,'forno');project={revision:rev+1,profile:patch.profile};return project}}};
 const res=await S.useInKit(ws,'forno',svg,r.layers,'Forno Aurora');assert.equal(res.project.profile.identityKit.logo,svg);assert.equal(res.project.profile.visual,'Copertina: #111111.','the visual identity text stays');
 await assert.rejects(S.useInKit(ws,'forno','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1">'+'<path d="M0 0L1 1"/>'.repeat(1500)+'</svg>',r.layers,'x'),/troppo pesante/);
 // the Kit palette matched to the layers, one colour each
 const pal=[{hex:'#E06020'},{hex:'#202020'},{hex:'#FFF4D0'}];assert.deepEqual(S.matchPalette(r.layers,pal),r.layers.map(l=>hexNear(l.original,ORANGE)?'#E06020':hexNear(l.original,BROWN)?'#202020':'#FFF4D0'));
 assert.deepEqual(S.kitPalette({identityKit:{palette:[{role:'primary',hex:'#aa3300'},{hex:'bad'}]}}),[{role:'primary',name:'',hex:'#AA3300'}]);
});

test('saved in the project: key logoVector in the agents document, other keys kept, SVG capped; agents-page keeps it',async()=>{
 const r=T.trace(mark(),{colors:3}),svg=T.svgOf(r,{title:'Forno Aurora'});
 let stored={schemaVersion:1,conversations:{copywriter:[{role:'user',content:'ciao'}]},prefs:{a:1},packaging:{schemaVersion:1,items:[{id:'pk'}]}},conflicts=1;
 class ConflictError extends Error{}
 const ws={ConflictError,bind:(pid,name)=>{assert.equal(name,'agents');return {load:async()=>JSON.parse(JSON.stringify(stored)),save:async d=>{if(conflicts-->0)throw new ConflictError('x');stored=d}}}};
 const rec=S.savedRecord(r,{name:'Forno Aurora',proposal:'pulito',svg,source:'logo.png',by:'Ilaria',at:'2026-10-23T09:00:00Z'});
 assert.equal(rec.id,'logo-forno-aurora');assert.equal(rec.svg,svg);assert.equal(rec.svgTooBig,false);assert.equal(rec.settings.colors,3);assert.ok(!('img' in rec)&&!JSON.stringify(rec).includes('data:image'),'never the picture');
 await S.saveStore(ws,'forno',S.withRecord(rec));assert.deepEqual(stored.logoVector.items.map(x=>x.id),['logo-forno-aurora']);assert.deepEqual(stored.packaging,{schemaVersion:1,items:[{id:'pk'}]});assert.deepEqual(stored.prefs,{a:1});
 for(let i=0;i<9;i++)await S.saveStore(ws,'forno',S.withRecord({...rec,id:'logo-'+i}));assert.equal(stored.logoVector.items.length,S.MAX_SAVED);
 const big=S.savedRecord(r,{name:'x',svg:'x'.repeat(S.SVG_SAVE_MAX+1)});assert.equal(big.svg,'');assert.equal(big.svgTooBig,true);
 assert.deepEqual(S.readStore({logoVector:'boh'}),{schemaVersion:1,items:[]});
 const src=read('agents-page.js'),fn=/function clean\(d\)\{[^\n]*\}/.exec(src)[0],ctx={MAX_KEPT:40};vm.createContext(ctx);vm.runInContext(fn+';this.clean=clean',ctx);
 assert.deepEqual(JSON.parse(JSON.stringify(ctx.clean(stored).logoVector)),stored.logoVector,'logoVector kept by agents-page clean()');
 assert.match(src,/if\(fresh&&data\)\{[^}]*data\.logoVector=fresh\.logoVector;/,'and when the tab comes back');
});
