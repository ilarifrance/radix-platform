// Studio «Fotoritocco» (lib/retouch-studio.js): histogram analysis and auto levels, white balance, curves, unsharp
// mask, crops and sizes (never enlarged), consistency of a batch, metadata stripping, names, the settings saved in the
// project (never the photos) and the card in «Cosa vuoi fare». Fake photos only (tests/fixtures/fotoritocco-forno.js).
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const R=require('../lib/retouch-studio.js'),F=require('../tests/fixtures/fotoritocco-forno.js'),Z=require('../lib/zip-lite.js');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const fill=(w,h,f)=>{const img=R.image(w,h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const c=f(x,y),i=(y*w+x)*4;img.data[i]=c[0];img.data[i+1]=c[1];img.data[i+2]=c[2];img.data[i+3]=255}return img};
const px=(img,x,y)=>Array.from(img.data.slice((y*img.width+x)*4,(y*img.width+x)*4+3));
const mae=(a,b)=>{let s=0;for(let i=0;i<a.data.length;i+=4)s+=Math.abs(a.data[i]-b.data[i])+Math.abs(a.data[i+1]-b.data[i+1])+Math.abs(a.data[i+2]-b.data[i+2]);return s/(a.data.length/4*3)};
const sd=v=>{const m=v.reduce((s,x)=>s+x,0)/v.length;return Math.sqrt(v.reduce((s,x)=>s+(x-m)*(x-m),0)/v.length)};
const SET=F.SET.map(e=>({e,...F.shopPhoto(e,{scale:.25})}));

test('the questions: formats 1:1, 4:5, 16:9, 9:16, uses with their sizes, the sliders and 3 looks, upscaling only named',()=>{
 assert.deepEqual(R.FORMATS.map(f=>f.id),['originale','1x1','4x5','16x9','9x16']);assert.deepEqual(R.FORMATS.map(f=>f.ratio),[0,1,.8,16/9,9/16]);
 assert.deepEqual(R.USES.map(u=>u.id),['social','sito','stampa','originale']);assert.equal(R.USES[2].long,3508);
 assert.deepEqual(R.FITS.map(f=>f.id),['crop','white','brand']);
 assert.deepEqual(R.ADJUST.map(a=>a.id),Object.keys(R.ZERO));
 assert.deepEqual(R.LOOKS.map(l=>l.label),['Naturale','Luminoso','Caldo da vetrina']);
 assert.match(R.UPSCALE_NOTE,/con fornitore, da collegare/);assert.equal(R.MAX_PHOTOS,50);
});

test('analysis: histogram percentiles, clipping, contrast, resolution and the issues in Italian',()=>{
 const grad=fill(256,40,x=>[x,x,x]),a=R.analyze(grad);
 assert.equal(a.hist.reduce((s,v)=>s+v,0),a.samples);assert.ok(Math.abs(a.median-128)<=2,'median of a ramp');assert.ok(a.p05<=14&&a.p95>=241);
 assert.ok(a.clipHigh>0&&a.clipHigh<.02);assert.equal(a.cast.temp,0);
 const dark=R.analyze(fill(400,300,(x,y)=>{const v=20+((x*7+y*3)%60);return [v,v,v]}));assert.ok(dark.issues.some(i=>i.id==='scura'),'dark found');assert.ok(dark.issues.some(i=>i.id==='piccola'),'small found');
 const burnt=R.analyze(fill(400,300,x=>x<120?[255,255,255]:[90,90,90]));assert.ok(burnt.clipHigh>.25);assert.ok(burnt.issues.some(i=>i.id==='bruciate'));
 const flat=R.analyze(fill(1600,1200,(x,y)=>{const v=110+((x+y)%40);return [v,v,v]}));assert.ok(flat.issues.some(i=>i.id==='piatta'));assert.equal(flat.megapixels,1.9);
 const good=R.analyze(SET[0].truth);assert.ok(!good.issues.some(i=>i.id==='scura'),'the true photo is not dark');
});

test('white balance: the cast is read from the neutral tones, named, and removed; a colourful subject is not «corrected»',()=>{
 // a grey card scene (greys of several lights) under a blue light
 const grey=fill(300,200,(x,y)=>{const v=60+Math.floor(x/300*170);return [v,v,v]}),blue=F.degrade(grey,{gains:[.8,1,1.25]}),a=R.analyze(blue);
 assert.ok(a.cast.temp<-.2,'blue cast seen: '+a.cast.temp);assert.equal(R.castName(a.cast),'fredda (blu)');assert.ok(a.issues.some(i=>i.id==='dominante'&&/blu/.test(i.label)));
 const rc=R.plan(a,'naturale',R.ZERO),out=R.apply(blue,rc);
 for(const x of [40,150,260]){const [r,g,b]=px(out,x,100),before=px(blue,x,100);assert.ok(Math.abs(r-b)<Math.abs(before[0]-before[2])/3,'neutral again at '+x+': '+[r,g,b]+' was '+before)}
 assert.match(R.describe(rc,a),/dominante fredda tolta/);
 for(const [gains,name] of [[[1.25,1,.78],'calda (arancio)'],[[.92,1.15,.92],'verde'],[[1.12,.88,1.12],'magenta']])assert.equal(R.castName(R.analyze(F.degrade(grey,{gains})).cast),name);
 // a close-up of a warm loaf with no neutral area: weak confidence, gentle gains
 const loaf=fill(300,200,(x,y)=>[200-(y%50),130-(y%50)/2,60]),la=R.analyze(loaf);assert.ok(la.cast.strength<.3,'low confidence: '+la.cast.strength);
 const g=R.plan(la,'naturale',R.ZERO).gains;assert.ok(Math.max(...g)/Math.min(...g)<1.15,'the loaf keeps its colour: '+g);
 // temperature and tint keep the light: luminance-weighted gains sum to 1
 for(const [t,k] of [[50,0],[-50,0],[0,50],[30,-30]]){const gg=R.tempTintGains(t,k);assert.ok(Math.abs(R.lumaOf(...gg)-1)<1e-9)}
 assert.ok(R.tempTintGains(40,0)[0]>R.tempTintGains(40,0)[2],'warmer = more red than blue');
});

test('auto levels and curves: black and white points stretched, curves monotonic with fixed ends, shoulder without clipping',()=>{
 const flat=fill(300,200,(x,y)=>{const v=60+Math.floor(x/300*120);return [v,v,v]}),a=R.analyze(flat),au=R.autoFor(a,'naturale');
 assert.equal(au.black,36,'black point: 48 at most, at 75%');assert.ok(au.white<=190&&au.white>=180,'white point '+au.white);
 const out=R.analyze(R.apply(flat,{black:au.black,white:au.white}));assert.ok(out.p95-out.p05>a.p95-a.p05+50,'range widened');
 for(const s of [{},{contrast:50},{contrast:-50},{highlights:100,shadows:100},{highlights:-100,shadows:-100},{contrast:50,highlights:-100,shadows:100}]){
  let prev=-1;for(let i=0;i<=1000;i++){const y=R.toneCurve(i/1000,s);assert.ok(y>=prev-1e-12,'monotonic '+JSON.stringify(s));prev=y}
  assert.equal(R.toneCurve(0,s),0);assert.ok(Math.abs(R.toneCurve(1,s)-1)<1e-12)}
 assert.ok(R.toneCurve(.25,{contrast:40})<.25&&R.toneCurve(.75,{contrast:40})>.75,'contrast is an S');assert.ok(Math.abs(R.toneCurve(.5,{contrast:40})-.5)<1e-12);
 assert.ok(R.toneCurve(1/3,{shadows:60})>1/3,'shadows open');assert.ok(R.toneCurve(2/3,{highlights:-60})<2/3,'highlights come down');
 for(const G of [1.2,2,3.5]){const f=R.shoulder(G);assert.ok(Math.abs(f(G)-1)<1e-9,'brightest input lands on white');assert.equal(f(.5),.5,'below the knee untouched');let p=0;for(let x=0;x<=G;x+=G/500){assert.ok(f(x)>=p-1e-12);p=f(x)}}
 const [lr,lg,lb]=R.luts({});for(let v=0;v<256;v++){assert.equal(lr[v],v);assert.equal(lg[v],v);assert.equal(lb[v],v)}
 // brightening a dark photo by 1.5 EV does not push its light tones into clipping
 const dk=F.degrade(SET[0].truth,{ev:-1.5}),b=R.analyze(R.apply(dk,{exposure:1.5}));assert.ok(b.clipHigh<.01,'no clipping: '+b.clipHigh);
});

test('unsharp mask: edges get crisper, flat areas and colours stay put',()=>{
 const step=fill(40,20,x=>x<20?[80,80,80]:[170,170,170]),s=R.unsharp(step,{amount:1,radius:1.2,threshold:3});
 assert.ok(px(s,19,10)[0]<80&&px(s,20,10)[0]>170,'overshoot on both sides of the edge');assert.deepEqual(px(s,3,10),[80,80,80]);assert.deepEqual(px(s,36,10),[170,170,170]);
 const col=fill(40,20,x=>x<20?[200,60,40]:[60,90,200]),c=R.unsharp(col,{amount:1,radius:1}),d0=px(c,19,10).map((v,k)=>v-px(col,19,10)[k]);
 assert.ok(d0[0]===d0[1]||Math.min(...px(c,19,10))===0,'same delta on R, G and B: no coloured halo');
 const noise=fill(60,40,(x,y)=>{const v=120+((x*13+y*7)%3);return [v,v,v]}),n=R.unsharp(noise,{amount:1,radius:1,threshold:6});assert.ok(mae(n,noise)<.8,'noise below the threshold barely moves');
 const k=R.gaussKernel(1.5);assert.ok(Math.abs(k.reduce((a,b)=>a+b,0)-1)<1e-6);assert.equal(k.length,11);
 assert.equal(R.radiusFor(900),.6);assert.equal(R.radiusFor(3400),2);
});

test('crops: every format keeps its ratio, stays inside and follows the focal point; fit on a background never crops',()=>{
 for(const [w,h] of [[4000,3000],[3000,4000],[1080,1080],[1920,1080],[731,3001]])for(const f of R.FORMATS.filter(f=>f.ratio))for(const focus of [{x:.5,y:.5},{x:0,y:0},{x:1,y:1},{x:.2,y:.9}]){
  const r=R.cropRect(w,h,f.ratio,focus);assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=w&&r.y+r.h<=h,JSON.stringify([w,h,f.id,r]));assert.ok(Math.abs(r.w/r.h-f.ratio)<2/Math.min(r.w,r.h)+1e-9,'ratio '+f.id);
  assert.ok(r.w===w||r.h===h,'largest crop')}
 assert.deepEqual(R.cropRect(4000,3000,1),{x:500,y:0,w:3000,h:3000},'centre');assert.deepEqual(R.cropRect(4000,3000,1,{x:0,y:.5}),{x:0,y:0,w:3000,h:3000});assert.deepEqual(R.cropRect(4000,3000,1,{x:.9,y:.5}),{x:1000,y:0,w:3000,h:3000});
 assert.deepEqual(R.cropRect(4000,3000,9/16,{x:.3}),{x:356,y:0,w:1688,h:3000});assert.deepEqual(R.cropRect(4000,3000,0),{x:0,y:0,w:4000,h:3000},'original: no crop');
 const L=R.padLayout(1000,600,1);assert.equal(L.W,L.H);assert.ok(L.x>0&&L.y>0&&L.w===1000&&L.h===600);
 const img=fill(50,30,()=>[120,60,30]),p=R.pad(img,4/5,'#FFFFFF');assert.ok(Math.abs(p.width/p.height-.8)<.02);assert.deepEqual(px(p,0,0),[255,255,255]);assert.deepEqual(px(p,Math.floor(p.width/2),Math.floor(p.height/2)),[120,60,30]);
 const out=R.render(fill(400,300,()=>[100,100,100]),{recipe:{},formatId:'4x5',fit:'white'});assert.deepEqual(px(out,0,0),[255,255,255],'the background is exactly white: it does not go through the edit');
 const c=R.render(fill(400,300,(x)=>[x%256,0,0]),{recipe:{},formatId:'1x1',focus:{x:0,y:.5}});assert.deepEqual([c.width,c.height],[300,300]);assert.equal(px(c,0,0)[0],0,'crop from the left edge');
 const s=R.resize(fill(40,40,(x,y)=>(x+y)%2?[255,255,255]:[0,0,0]),20,20);assert.ok(Math.abs(px(s,5,5)[0]-128)<2,'area average');
});

test('sizes: the use decides the file size, RADIX never enlarges and says so; print at 300 dpi',()=>{
 assert.deepEqual(R.outputSize(4000,3000,'sito'),{w:2000,h:1500,want:{w:2000,h:1500},small:false,scale:.5});
 assert.deepEqual(R.outputSize(3000,3750,'social'),{w:1080,h:1350,want:{w:1080,h:1350},small:false,scale:.36});
 const sm=R.outputSize(720,540,'sito');assert.equal(sm.small,true);assert.deepEqual([sm.w,sm.h],[720,540]);assert.deepEqual(sm.want,{w:2000,h:1500});
 assert.deepEqual(R.outputSize(8000,6000,'originale'),{w:6000,h:4500,want:{w:6000,h:4500},small:false,scale:.75},'capped');
 const a=R.analyze(SET[0].photo),list=R.checks({before:a,after:a,out:R.outputSize(1600,1200,'stampa'),useId:'stampa'});const m=list.find(c=>c.id==='misura');
 assert.equal(m.level,'fail');assert.match(m.msg,/non la ingrandisce/);assert.match(m.msg,/13,5 × 10,2 cm/);assert.match(m.msg,/da collegare/);
 assert.equal(R.checks({before:a,after:a,out:R.outputSize(4000,3000,'sito'),useId:'sito'}).find(c=>c.id==='misura').level,'ok');
 assert.equal(R.checks({before:a,after:a,out:R.outputSize(500,400,'originale'),useId:'originale'}).find(c=>c.id==='risoluzione').level,'fail');
});

test('checks after the edit: clipping added by the edit is caught, clipping already in the photo is not blamed on it',()=>{
 const img=SET[1].truth,a=R.analyze(img),hot=R.analyze(R.apply(img,{exposure:1.6,highlights:60}));
 const l=R.checks({before:a,after:hot,out:R.outputSize(1200,1500,'sito'),useId:'sito'}).find(c=>c.id==='luci');assert.notEqual(l.level,'ok',l.msg);
 const burnt=fill(200,200,x=>x<80?[255,255,255]:[120,110,100]),b=R.analyze(burnt),same=R.checks({before:b,after:R.analyze(R.apply(burnt,{})),out:{w:200,h:200,small:false},useId:'originale'});
 assert.equal(same.find(c=>c.id==='luci').level,'ok');assert.match(same.find(c=>c.id==='luci').msg,/Già bruciate/);
 assert.equal(R.worst([{level:'ok'},{level:'warn'}]),'warn');assert.equal(R.worst([{level:'fail'},{level:'warn'}]),'fail');
 const strong=R.checks({before:a,after:a,out:{w:2000,h:1500},useId:'sito',recipe:{gains:[.75,1,1.4]}});assert.equal(strong.find(c=>c.id==='colore').level,'warn');
});

test('the default proposals improve dark, cast and flat photos (closer to the true scene), without burning',()=>{
 const an=SET.map(s=>R.analyze(s.photo)),props=R.proposals(an);assert.deepEqual(props.map(p=>p.id),['naturale','luminoso','vetrina']);
 for(const p of props){for(const a of R.ADJUST)assert.ok(p.adjust[a.id]>=a.min&&p.adjust[a.id]<=a.max,p.id+' '+a.id);assert.ok(p.why.length>20)}
 assert.match(props[0].why,/schiarisce|dominanti/);
 SET.forEach((s,i)=>{const out=R.apply(s.photo,R.plan(an[i],'naturale',props[0].adjust)),o=R.analyze(out);
  assert.ok(mae(out,s.truth)<mae(s.photo,s.truth)*.85,s.e.name+' ('+s.e.why+'): '+mae(out,s.truth).toFixed(1)+' vs '+mae(s.photo,s.truth).toFixed(1));
  assert.ok(o.clipHigh<.02,s.e.name+' clipping '+o.clipHigh)});
 // the dark one gets lighter, the blue one loses its blue
 const d=R.analyze(R.apply(SET[0].photo,R.plan(an[0],'naturale',props[0].adjust)));assert.ok(d.median>an[0].median+30);
 const b=R.analyze(R.apply(SET[1].photo,R.plan(an[1],'naturale',props[0].adjust)));assert.ok(Math.abs(b.cast.temp)<Math.abs(an[1].cast.temp)/2.5,'blue cast '+an[1].cast.temp+' → '+b.cast.temp);
 // «Luminoso» is lighter than «Naturale», «Caldo da vetrina» warmer
 const med=(look,i)=>R.analyze(R.apply(SET[i].photo,R.plan(an[i],look,props.find(p=>p.id===look).adjust)));
 assert.ok(med('luminoso',3).mean>med('naturale',3).mean);assert.ok(med('vetrina',1).cast.temp>med('naturale',1).cast.temp);
 // a product on a white backdrop is never darkened to the look's target
 const hk=fill(400,300,(x,y)=>Math.abs(x-200)<60&&Math.abs(y-150)<80?[180,40,50]:[248,248,248]),ha=R.analyze(hk);assert.ok(R.plan(ha,'naturale',R.ZERO).exposure>=0);
});

test('a batch comes out consistent: one look, the same light and neutral colour for every photo',()=>{
 const an=SET.map(s=>R.analyze(s.photo)),p=R.proposals(an)[0],outs=SET.map((s,i)=>R.analyze(R.apply(s.photo,R.plan(an[i],p.id,p.adjust))));
 const castOf=a=>Math.hypot(a.cast.temp,a.cast.tint),truthCast=SET.map(s=>castOf(R.analyze(s.truth)));
 assert.ok(sd(outs.map(castOf))<sd(an.map(castOf))*.6,'casts converge: '+sd(an.map(castOf)).toFixed(3)+' → '+sd(outs.map(castOf)).toFixed(3));
 assert.ok(outs.map(castOf).reduce((s,v)=>s+v,0)<an.map(castOf).reduce((s,v)=>s+v,0)*.6,'less cast overall');assert.ok(truthCast.length===5);
 // same pictures under different faults: after the edit they look alike
 const t=SET[0].truth,faults=[{ev:-1.2,gains:[1.15,1,.75]},{ev:-.2,gains:[.85,1,1.2]},{ev:.3,flat:[40,215]}],ph=faults.map(f=>F.degrade(t,f)),pa=ph.map(R.analyze);
 const fixed=ph.map((x,i)=>R.apply(x,R.plan(pa[i],'naturale',p.adjust)));const pair=(a,b)=>mae(a,b);
 const before=pair(ph[0],ph[1])+pair(ph[1],ph[2])+pair(ph[0],ph[2]),after=pair(fixed[0],fixed[1])+pair(fixed[1],fixed[2])+pair(fixed[0],fixed[2]);
 assert.ok(after<before*.4,'the three versions match: '+before.toFixed(1)+' → '+after.toFixed(1));
 // the shared sliders reach every photo; the per-photo offsets only one
 const base=R.plan(an[0],'naturale',p.adjust),more=R.plan(an[0],'naturale',{...p.adjust,exposure:.5}),own=R.plan(an[0],'naturale',p.adjust,{exposure:-.3,temp:10});
 assert.ok(Math.abs(more.exposure-base.exposure-.5)<1e-9);assert.ok(Math.abs(own.exposure-base.exposure+.3)<1e-9);assert.equal(own.temp,base.temp+10);
 assert.deepEqual(R.setStats(an).count,5);assert.ok(R.setStats(an).dark>=1&&R.setStats(an).cast>=2);
});

test('metadata: EXIF, XMP and comments are stripped from JPEG and WebP, the image data kept',()=>{
 const seg=(m,body)=>{const b=Buffer.from(body);return Buffer.concat([Buffer.from([0xFF,m,(b.length+2)>>8,(b.length+2)&255]),b])};
 const jpg=new Uint8Array(Buffer.concat([Buffer.from([0xFF,0xD8]),seg(0xE0,'JFIF\0\x01\x01\0\0\x01\0\x01\0\0'),seg(0xE1,'Exif\0\0GPS 45.07N 7.68E iPhone 15'),seg(0xE1,'http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>'),seg(0xFE,'scattata in negozio'),seg(0xDB,'Q'.repeat(65)),seg(0xC0,'SOF0data'),Buffer.from([0xFF,0xDA,0,4,1,2,9,9,9,0xFF,0xD9])]));
 assert.equal(R.hasMetadata(jpg),true);const s=R.stripJpeg(jpg),txt=Buffer.from(s).toString('latin1');
 assert.equal(R.hasMetadata(s),false);assert.doesNotMatch(txt,/GPS|iPhone|xmpmeta|negozio/);assert.match(txt,/JFIF/);assert.match(txt,/SOF0data/);assert.deepEqual(Array.from(s.slice(-5)),[9,9,9,0xFF,0xD9]);
 assert.deepEqual(R.stripJpeg(s),s,'idempotent');
 const ch=(id,body)=>{const b=Buffer.from(body),l=Buffer.alloc(4);l.writeUInt32LE(b.length);return Buffer.concat([Buffer.from(id),l,b,b.length&1?Buffer.from([0]):Buffer.alloc(0)])};
 const vp8x=Buffer.alloc(10);vp8x[0]=0x08|0x04;const body=Buffer.concat([Buffer.from('WEBP'),ch('VP8X',vp8x),ch('VP8 ','pixels!'),ch('EXIF','GPS 45N'),ch('XMP ','<x:xmpmeta/>')]),hd=Buffer.alloc(8);hd.write('RIFF');hd.writeUInt32LE(body.length,4);
 const webp=new Uint8Array(Buffer.concat([hd,body]));assert.equal(R.hasMetadata(webp),true);const w=R.stripWebp(webp),wt=Buffer.from(w);
 assert.equal(R.hasMetadata(w),false);assert.doesNotMatch(wt.toString('latin1'),/GPS|xmpmeta/);assert.match(wt.toString('latin1'),/pixels!/);assert.equal(wt.readUInt32LE(4),w.length-8,'RIFF size');assert.equal(wt[20]&0x0C,0,'VP8X flags cleared');
});

test('files: renamed and numbered, LEGGIMI says EXIF is gone and what was done, one zip',()=>{
 assert.equal(R.fileName('Forno Aurora',0,5,{formatId:'4x5'}),'forno-aurora-01-4x5.jpg');assert.equal(R.fileName('',11,120,{formatId:'originale',ext:'webp'}),'foto-012.webp');
 assert.equal(R.fileName('Pàne & Co.',8,9),'pane-co-09.jpg');
 const txt=R.readme({project:'Forno Aurora',look:'vetrina',adjust:{...R.ZERO,exposure:.3,contrast:16},formatId:'1x1',fit:'white',useId:'sito',quality:85,webp:true,rows:[{name:'forno-aurora-01-1x1.jpg',w:2000,h:2000,what:'schiarita +0,8 EV',checks:[{level:'warn',label:'Luci al limite'}]}],date:new Date('2026-10-23T10:00:00Z')});
 assert.match(txt,/FOTORITOCCO · Forno Aurora/);assert.match(txt,/Caldo da vetrina/);assert.match(txt,/EXIF tolti/);assert.match(txt,/nessuna AI/);assert.match(txt,/Esposizione 0,3 EV/);assert.match(txt,/fondo bianco #FFFFFF/);assert.match(txt,/Luci al limite/);assert.match(txt,/da collegare/);
 const z=R.bundle([{name:'a/1.jpg',data:new Uint8Array([1,2,3])},{name:'a/LEGGIMI.txt',data:txt}],{date:new Date('2026-10-23T10:00:00Z')});assert.deepEqual(Z.unzip(z).map(f=>f.name),['a/1.jpg','a/LEGGIMI.txt']);
});

test('the project keeps only the settings, never the photos, under retouch in the agents document',async()=>{
 const rec=R.settingsRecord({look:'luminoso',adjust:{...R.ZERO,exposure:.333,temp:-4,bogus:9},formatId:'9x16',fit:'brand',useId:'social',quality:200,webp:1,baseName:'Forno Aurora!',photos:20,items:[{pre:{data:[1,2,3]}}]},{by:'Ilaria',at:'2026-10-23T10:00:00.000Z'});
 assert.deepEqual(rec,{id:'ritocco-20261023100000',at:'2026-10-23T10:00:00.000Z',by:'Ilaria',look:'luminoso',adjust:{...R.ZERO,exposure:.33,temp:-4},formatId:'9x16',fit:'brand',useId:'social',quality:100,webp:true,baseName:'forno-aurora',photos:20});
 assert.ok(JSON.stringify(rec).length<500,'no pixels');
 let store={schemaVersion:1,conversations:{x:{messages:[]}},mockups:{schemaVersion:1,items:[{id:'m'}]}};const ws={bind:(p,k)=>{assert.equal(k,'agents');return {load:async()=>JSON.parse(JSON.stringify(store)),save:async d=>{store=d}}}};
 await R.saveToProject(ws,'demo',rec);await R.saveToProject(ws,'demo',{...rec,id:'b'});assert.deepEqual(store.retouch.items.map(x=>x.id),['ritocco-20261023100000','b']);assert.equal(store.mockups.items[0].id,'m');assert.ok(store.conversations.x);
 assert.deepEqual(R.readStore({}),{schemaVersion:1,items:[]});
 let s={schemaVersion:1,items:[]};for(let i=0;i<14;i++)s=R.addRecord(s,{id:'r'+i});assert.equal(s.items.length,10);assert.equal(s.items[0].id,'r4');
 assert.equal(R.brandColour({identityKit:{palette:[{role:'primary',hex:'#7A2E1F'},{role:'light',hex:'#F6EFE6'}]}}),'#F6EFE6');assert.equal(R.brandColour({}),'');
 const ap=read('agents-page.js');assert.match(ap,/if\(d\.retouch\)out\.retouch=d\.retouch/);assert.match(ap,/data\.retouch=fresh\.retouch/);assert.match(ap,/retouch \(lib\/retouch-studio\.js/);
});

test('no AI, no network, no upload: the studio never calls fetch or an API',()=>{
 const src=read('lib/retouch-studio.js');assert.doesNotMatch(src,/fetch\(|\/api\/|XMLHttpRequest|sendBeacon|openai|higgsfield/i);
 assert.match(src,/non vengono caricate da nessuna parte/);assert.match(src,/con fornitore, da collegare/);assert.match(src,/ub\.disabled=true/);
});

test('the card «Fotoritocco» in Immagini opens the studio inline, free',()=>{
 const core=require('../agency/crea-core.js'),c=core.card('fotoritocco');
 assert.equal(c.group,'Immagini');assert.equal(c.inline,'retouch');assert.equal(c.state,'ready');assert.match(c.cost,/Nessuna chiamata AI e nessun credito/);assert.match(c.hint,/da collegare/);
 assert.equal(core.linkFor(c,'radix'),null);
 assert.ok(core.matchServices('ritoccare le foto scure').slice(0,2).some(m=>m.card.id==='fotoritocco'),'found by words');
 const js=read('agency/crea.js');assert.match(js,/retouch:\{global:'RadixRetouchStudio'/);assert.match(js,/c\.inline==='retouch'\n\s+\?S\.retouchStudio\(\{project,profile:current\.profile,projectName:current\.name,projectId:current\.id,workspace:ws,agentsUrl:/);
 const html=read('agency/crea.html');assert.ok(html.indexOf('/lib/retouch-studio.js')>0&&html.indexOf('/lib/retouch-studio.js')<html.indexOf('/agency/crea.js'));
 assert.match(read('agency/marketing-look.js'),/fotoritocco:'retouch'/);
 const css=read('shell/crea.css');assert.match(css,/\.cr-panel \.retouch-studio \.rt-ba/);assert.match(css,/@media \(max-width:760px\)\{[^\n]*\.retouch-studio/);
});
