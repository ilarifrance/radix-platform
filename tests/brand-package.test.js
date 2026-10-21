'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const B=require('../lib/brand-package.js'),S=require('../lib/identity-studio.js'),Z=require('../lib/zip-lite.js'),zlib=require('zlib');

const PAL=S.palette([{role:'primary',hex:'#2F5D50',name:'Salvia'},{role:'secondary',hex:'#A0522D',name:'Crosta'},{role:'accent',hex:'#E3B448',name:'Grano'},{role:'dark',hex:'#1C1C1E',name:'Forno'},{role:'light',hex:'#F7F5F0',name:'Farina'}]);
const H='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 96"><circle cx="48" cy="48" r="30" fill="#2F5D50"/><path d="M33 52 Q48 24 63 52 Z" fill="#E3B448"/><text x="92" y="60" font-family="Fraunces, serif" font-size="32" font-weight="700" fill="#1C1C1E">Forno Bianchi</text></svg>';
const MONO='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 96"><rect x="18" y="18" width="60" height="60" rx="14" fill="#7A3E2B"/><text x="48" y="60" text-anchor="middle" font-family="Georgia, serif" font-size="30" fill="#F7F5F0">FB</text><text x="94" y="60" font-family="Georgia, serif" font-size="30" fill="#1C1C1E">Forno Bianchi</text></svg>';
const STACKED='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 160"><polygon points="70,70 100,10 130,70" fill="#24435C"/><text x="100" y="120" text-anchor="middle" font-size="30" font-weight="700" fill="#24435C">forno</text></svg>';
const KIT=(logo,extra)=>({name:'Bottega di quartiere',rationale:'Il pane come rito quotidiano.',palette:PAL,checks:S.contrastChecks(PAL),fonts:[{heading:'Fraunces',body:'Inter'}],logo:S.sanitizeSvg(logo),keywords:['farina','legno'],images:['Mani che impastano'],tone:['Caldo','Diretto','Di quartiere'],...extra});

test('split: symbol and wordmark from the logo; a monogram text stays in the symbol; orientation detected',()=>{
 const a=B.split(S.sanitizeSvg(H));assert.equal(a.orientation,'horizontal');assert.deepEqual(a.generated,{symbol:false,word:false});
 assert.ok(a.symbol.box.x1<=79&&a.symbol.box.x0>=17,'symbol = circle');assert.ok(a.word.box.x0>=91,'wordmark = the name');
 const b=B.split(S.sanitizeSvg(MONO));const leaves=B.leaves(b.symbol.tree);assert.equal(leaves.filter(l=>l.kind==='text').length,1,'«FB» belongs to the symbol');
 assert.equal(B.split(S.sanitizeSvg(STACKED)).orientation,'stacked');
 const t=B.split('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 50"><text x="0" y="40" font-size="30">Solo nome</text></svg>',{name:'Solo Nome',palette:PAL});
 assert.equal(t.generated.symbol,true,'monogram created');assert.match(B.serialize(t.symbol.tree),/>SN</);
});

test('variants: 8 clean SVGs with viewBox, no external references; layouts and colours as expected',()=>{
 const v=B.variants(KIT(H),'Forno Bianchi').list;assert.deepEqual(v.map(x=>x.id),['orizzontale','verticale','simbolo','logotipo','nero','bianco','monocolore','negativo']);
 for(const x of v){assert.ok(B.svgClean(x.svg),x.id+' clean');assert.match(x.svg,/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="[-\d. ]+"[^>]* width="[\d.]+" height="[\d.]+">/);assert.doesNotMatch(x.svg,/href|script|url\(|<image/);assert.equal(S.sanitizeSvg(x.svg),x.svg)}
 const by=id=>v.find(x=>x.id===id);assert.ok(by('orizzontale').w>by('orizzontale').h*3,'horizontal is wide');assert.ok(by('verticale').h>by('verticale').w*.3&&by('verticale').w<by('orizzontale').w,'stacked is narrower');
 assert.doesNotMatch(by('simbolo').svg,/<text/);assert.doesNotMatch(by('logotipo').svg,/<circle|<path/);
 const fills=s=>[...new Set((s.match(/fill="(#[0-9A-F]{6})"/g)||[]).map(x=>x.slice(6,-1)))].sort();
 assert.deepEqual(fills(by('nero').svg),['#000000','#FFFFFF'],'black, with the knockout in white');assert.deepEqual(fills(by('bianco').svg),['#1C1C1E','#FFFFFF']);
 assert.deepEqual(fills(by('monocolore').svg),['#2F5D50','#FFFFFF']);assert.match(by('nero').svg,/<path d="M33 52 Q48 24 63 52 Z" fill="#FFFFFF"/,'the shape over the circle is knocked out');
 assert.equal(by('bianco').dark,true);assert.equal(by('negativo').bg,'#1C1C1E');
 const dirty=B.variants(KIT('<svg viewBox="0 0 100 40" onload="x()"><script>x()</script><image href="https://evil.example/a.png"/><circle cx="20" cy="20" r="15" fill="#2F5D50"/><text x="40" y="28" font-size="18">Ok</text></svg>'),'Ok').list;
 for(const x of dirty)assert.doesNotMatch(x.svg,/evil|script|onload|<image/);
});

test('clear space and minimum sizes come from the box and the smallest text',()=>{
 assert.deepEqual(B.clearSpace({w:300,h:60,word:24}),{x:12,ratio:.2,box:{x:-12,y:-12,w:324,h:84}});
 assert.equal(B.clearSpace({w:80,h:80,word:0,sym:80}).x,20,'no wordmark: a quarter of the symbol');
 assert.deepEqual(B.minSize({w:300,minText:30},[25,100]),{mm:25,px:100},'big text: the base');
 assert.deepEqual(B.minSize({w:300,minText:10},[25,100]),{mm:64,px:272},'6 pt ≥ 2,117 mm → 300/10 × 2,117 = 63,5 → 64 mm; 9 px → 270 → 272');
 assert.deepEqual(B.minSize({w:50,minText:Infinity},[6,16]),{mm:6,px:16});
 const v=B.variants(KIT(H),'Forno Bianchi').list,h=v[0];
 assert.ok(Math.abs(h.clear.x-B.split(S.sanitizeSvg(H)).word.box.y1/2+B.split(S.sanitizeSvg(H)).word.box.y0/2)<.01,'X = half the wordmark height');
 assert.ok(h.min.mm>=25&&v.find(x=>x.id==='simbolo').min.px>=16);
});

test('CMYK approximation, RGB and accessible pairs (WCAG)',()=>{
 assert.deepEqual(B.cmyk('#000000'),[0,0,0,100]);assert.deepEqual(B.cmyk('#FFFFFF'),[0,0,0,0]);assert.deepEqual(B.cmyk('#FF0000'),[0,100,100,0]);
 assert.deepEqual(B.cmyk('#2F5D50'),[49,0,14,64]);assert.deepEqual(B.rgbOf('#2F5D50'),[47,93,80]);
 const pairs=B.contrastPairs(PAL);assert.ok(pairs.length>=4);assert.ok(pairs.every(p=>p.ratio>=3));assert.ok(pairs.every((p,i)=>!i||pairs[i-1].ratio>=p.ratio),'sorted');
 const top=pairs[0];assert.equal(top.fg,'dark');assert.equal(top.bg,'light');assert.equal(top.level,'AAA');assert.equal(top.aa,true);
 assert.ok(pairs.filter(p=>p.aa).every(p=>S.contrast(p.fgHex,p.bgHex)>=4.5));assert.ok(!pairs.some(p=>p.fg==='accent'&&p.bg==='light'),'yellow on ivory (< 3:1) is not offered');
});

const parsePdf=bytes=>{const s=Buffer.from(bytes).toString('latin1');return {s,count:+/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(s)[1],boxes:s.match(/\/MediaBox \[[^\]]+\]/g)}};
test('brand book: 14 A4 landscape pages, standard fonts, vector logo, every section',()=>{
 const p=B.build(KIT(H),'Forno Bianchi',{date:'2026-10-21'}),doc=B.bookDoc(p,{contacts:{email:'ciao@fornobianchi.it'}});
 assert.equal(doc.pages.length,B.BOOK_PAGES);assert.equal(doc.pages.length,14);
 assert.deepEqual(doc.pages.map(x=>x.label).slice(0,3),['Copertina','Indice','Essenza']);
 const {s,count,boxes}=parsePdf(B.bookPdf(doc,{date:new Date(Date.UTC(2026,9,21))}));
 assert.equal(count,14);assert.equal(boxes.length,14);assert.ok(boxes.every(b=>b==='/MediaBox [0 0 841.89 595.276]'),boxes[0]);
 assert.match(s,/\/BaseFont \/Helvetica \/Encoding \/WinAnsiEncoding/);assert.match(s,/\/BaseFont \/Helvetica-Bold/);assert.doesNotMatch(s,/FontFile/);
 assert.match(s,/% logo/);assert.match(s,/\/Title <|\/Title \(Brand book/);assert.match(s,/\/Producer \(RADIX Kit identit/);assert.match(s,/^%PDF-1\.4/);assert.match(s,/%%EOF\n$/);
 assert.match(s,/ Tc /,'tracked labels');
 const texts=doc.pages.flatMap(pg=>pg.items.filter(i=>i.t==='text').map(i=>i.s)).join('\n');
 for(const t of ['Area di rispetto','Usi scorretti','CMYK*','UIBM','WIPO','ciao@fornobianchi.it','Abbinamenti accessibili','Titolo display','Biglietto da visita','approssimato'])assert.ok(texts.includes(t),t);
 for(const c of p.colours)assert.ok(texts.includes(c.hex),c.hex+' hex');
 for(const c of p.colours)assert.ok(texts.includes(c.hex)&&texts.includes(c.cmyk.join(' ')),c.hex);
 assert.ok(doc.pages.every(pg=>pg.items.every(i=>i.t!=='text'||(i.x>=0&&i.x<=297&&i.y>0&&i.y<=210))),'texts on the page');
 assert.match(B.bookSvg(doc,0),/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 297 210"/);
});

test('soft-masked images (alpha) in the PDF writer',()=>{
 const p=B.build(KIT(H),'Forno Bianchi'),doc=B.bookDoc(p);const rgb=zlib.deflateSync(Buffer.alloc(12)),alpha=zlib.deflateSync(Buffer.alloc(4,255));
 doc.pages[0].items.push({t:'image',x:10,y:10,w:20,h:10,raster:{w:2,h:2,rgb:new Uint8Array(rgb),alpha:new Uint8Array(alpha)}});
 const {s}=parsePdf(B.bookPdf(doc));assert.match(s,/\/ColorSpace \/DeviceGray \/BitsPerComponent 8 \/Filter \/FlateDecode/);assert.match(s,/\/ColorSpace \/DeviceRGB \/BitsPerComponent 8 \/Filter \/FlateDecode \/SMask \d+ 0 R/);
});

test('package: file plan, favicon.ico, README and manifest; zip holds every folder',()=>{
 const p=B.build(KIT(H),'Forno Bianchi',{date:'2026-10-21'}),pl=B.plan(p),paths=pl.map(f=>f.path);
 assert.equal(pl.filter(f=>f.kind==='png'&&f.path.startsWith('logo/png/')).length,24,'8 variants × 3 sizes');
 assert.ok(paths.includes('logo/svg/forno-bianchi-orizzontale.svg')&&paths.includes('logo/png/forno-bianchi-simbolo-2048.png'));
 for(const f of ['favicon/favicon-16.png','favicon/favicon-32.png','favicon/favicon-48.png','favicon/apple-touch-icon.png','favicon/android-chrome-192.png','favicon/android-chrome-512.png','favicon/favicon.ico','favicon/site.webmanifest','favicon/favicon.svg','social/forno-bianchi-avatar-1080-chiaro.png','brand-book.pdf','LEGGIMI.txt','colori/palette.css'])assert.ok(paths.includes(f),f);
 assert.equal(new Set(paths).size,paths.length,'no duplicates');
 const big=pl.find(f=>f.path==='logo/png/forno-bianchi-orizzontale-2048.png');assert.equal(big.w,2048);assert.ok(big.h<2048);
 const fav=pl.find(f=>f.path==='favicon/apple-touch-icon.png');assert.equal(fav.w,180);assert.match(fav.svg,/<rect width="180" height="180" fill="#F7F5F0"\/>/,'opaque for iOS');
 const av=p.avatars[0];assert.match(av.svg,/viewBox="0 0 1080 1080"/);
 // the symbol stays inside the safe circle
 const m=/translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)/.exec(av.svg),vb=B.variants(KIT(H),'Forno Bianchi').list.find(v=>v.id==='simbolo');const s=+m[3],w=vb.w*s,h=vb.h*s;assert.ok(Math.hypot(w,h)/2<=540*.62+.5);
 const ico=B.ico([{size:16,data:new Uint8Array([1,2,3])},{size:32,data:new Uint8Array([4,5])}]);assert.deepEqual([...ico.slice(0,6)],[0,0,1,0,2,0]);assert.equal(ico[6],16);assert.equal(new DataView(ico.buffer).getUint32(6+12,true),38);assert.equal(ico.length,38+5);
 const rd=B.readme(p);for(const t of ['UIBM, TMview e WIPO','CMYK approssimato','AREA DI RISPETTO','<link rel="icon"','Misura minima'])assert.ok(rd.includes(t),t);
 const files=pl.map(f=>({name:f.path,data:f.data!=null?f.data:new Uint8Array([0])}));const names=Z.unzip(Z.zip(files)).map(f=>f.name);
 for(const dir of ['logo/svg/','logo/png/','favicon/','social/','colori/'])assert.ok(names.some(n=>n.startsWith(dir)),dir);assert.ok(names.includes('brand-book.pdf')&&names.includes('LEGGIMI.txt'));
 const man=B.manifest(p,'2026-10-21T10:00:00.000Z');const json=JSON.stringify(man);assert.ok(json.length<12000,'small: '+json.length);assert.doesNotMatch(json,/<svg|base64|%PDF/);
 assert.equal(man.files.length,pl.length);assert.equal(man.brandBook.pages,14);assert.equal(man.colours[0].cmykApprox,true);assert.equal(man.variants.length,8);
});

test('saving keeps the other identityKit fields and stores the package manifest only',async()=>{
 const k=S.parseDirections('{"directions":['+JSON.stringify({name:'Bottega di quartiere',palette:PAL.map(c=>({role:c.role,hex:c.hex})),fonts:[{heading:'Fraunces',body:'Inter'}],logo:H})+']}','Forno Bianchi')[0];
 const man=B.manifest(B.build(k,'Forno Bianchi'));let updates=[];
 const ws={ConflictError:class extends Error{},bind:()=>({load:async()=>({}),save:async x=>x}),projects:{get:async id=>({id,revision:3,profile:{audience:'famiglie',identityKit:{direction:'Vecchia',custom:'tenere',package:{version:1,direction:'Vecchia'}}}}),update:async(id,rev,ch)=>{updates.push(ch);return {id,revision:rev+1,...ch}}}};
 await S.saveToProject(ws,'p1',k,'Forno Bianchi',{package:man});let kit=updates[0].profile.identityKit;
 assert.equal(kit.custom,'tenere','other fields kept');assert.equal(kit.direction,'Bottega di quartiere');assert.match(kit.logo,/^<svg/);assert.equal(kit.package.zip,man.zip);assert.equal(updates[0].profile.audience,'famiglie');
 assert.doesNotMatch(JSON.stringify(kit.package),/<svg/);
 updates=[];await S.saveToProject(ws,'p1',k,'Forno Bianchi',{});kit=updates[0].profile.identityKit;assert.equal(kit.package,undefined,'a package of another direction is dropped');assert.equal(kit.custom,'tenere');
 assert.equal(S.kitWithPackage({identityKit:{direction:'Bottega di quartiere',package:{v:1}}},k,'Forno Bianchi').package.v,1,'same direction: kept');
});
