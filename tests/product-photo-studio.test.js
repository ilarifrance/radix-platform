// Studio Foto prodotto (lib/product-photo-studio.js + lib/product-photo-segment.js): compositing math, white
// background pixels, halo and coverage checks, the one confirmation before the OpenAI backgrounds, the segmentation
// module mocked (no model download), saving in the project and the card in «Cosa vuoi fare». Never a real call.
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const P=require('../lib/product-photo-studio.js'),SEG=require('../lib/product-photo-segment.js');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');

// A synthetic product photo: a red-ish bottle (rectangle with a label stripe) on a green backdrop, and its exact mask.
function photo(w=200,h=160,box={x:60,y:30,w:60,h:100}){const rgba=new Uint8ClampedArray(w*h*4),mask=new Uint8Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,inside=x>=box.x&&x<box.x+box.w&&y>=box.y&&y<box.y+box.h,label=inside&&y>=box.y+40&&y<box.y+60;
  const c=inside?(label?[250,240,30]:[200,30,40]):[40,170,60];rgba.set([c[0],c[1],c[2],255],i*4);mask[i]=inside?255:0}
 return {w,h,rgba,mask,box}}
const px=(d,W,x,y)=>Array.from(d.slice((y*W+x)*4,(y*W+x)*4+4));
function dilate(m,w,h,r){const o=new Uint8Array(m);for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(m[y*w+x])for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&yy>=0&&xx<w&&yy<h)o[yy*w+xx]=255}return o}

test('questions: three uses, three backgrounds, the marketplace sizes and JPG/PNG/WebP',()=>{
 assert.deepEqual(P.FORMATS.map(f=>[f.w,f.h]),[[2000,2000],[1200,1200],[1080,1350]]);
 assert.deepEqual(P.USES.map(u=>u.id),['shop','social','catalogo']);assert.equal(P.USES[0].bg,'white');assert.equal(P.USES[0].fill,.85);
 assert.deepEqual(P.BACKGROUNDS.map(b=>b.id),['white','brand','scene']);assert.deepEqual(P.TYPES.map(t=>t.mime),['image/jpeg','image/png','image/webp']);
 assert.deepEqual(P.SCENE_QUESTIONS.map(q=>q.id),['ambiente','luce','superficie','stile']);assert.equal(P.SCENE_COUNT,3);
 assert.ok(P.FORMATS.every(f=>Math.max(f.w,f.h)>=P.MIN_LONG_SIDE),'every format is zoomable (≥1000 px)');
});

test('fitRect: the product fills ≥85% of the frame on its long relative side, keeps its proportions and stays inside',()=>{
 for(const box of [{w:60,h:100},{w:300,h:80},{w:500,h:500},{w:17,h:913},{w:1999,h:3}])for(const f of P.FORMATS){
  const r=P.fitRect(box,f.w,f.h,{fill:.85});
  assert.ok(P.fillRatio(r,f.w,f.h)>=.85-1/f.w,JSON.stringify([box,f.id,r]));assert.ok(P.fillRatio(r,f.w,f.h)<=.86,'not more than asked');
  assert.ok(Math.abs(box.w/box.h-r.w/r.h)/(box.w/box.h)<.02||Math.min(r.w,r.h)<60,'proportions kept');
  assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=f.w&&r.y+r.h<=f.h,'inside the frame')}
 const c=P.fitRect({w:100,h:200},2000,2000,{fill:.85});assert.deepEqual([c.x,c.y,c.w,c.h],[575,150,850,1700],'centred');
 const tl=P.fitRect({w:100,h:200},2000,2000,{fill:.5,x:0,y:0}),br=P.fitRect({w:100,h:200},2000,2000,{fill:.5,x:1,y:1});
 assert.deepEqual([tl.x,tl.y],[0,0]);assert.deepEqual([br.x+br.w,br.y+br.h],[2000,2000]);
 const out=P.fitRect({w:100,h:200},2000,2000,{fill:.5,x:9,y:-3});assert.deepEqual([out.x,out.y],[2000-out.w,0],'positions clamped into the frame');
 assert.deepEqual(P.coverRect(1536,1024,1080,1350),{sx:358.4,sy:0,sw:819.2,sh:1024},'scene cover-cropped, never stretched');
});

test('white background export: every border pixel is exactly #FFFFFF, the product pixels are copied untouched',()=>{
 const p=photo(),cut=P.cutout(p.rgba,p.mask,p.w,p.h,P.bbox(p.mask,p.w,p.h));
 assert.deepEqual([cut.w,cut.h],[60,100]);
 // scale 1: the product is placed pixel for pixel
 const rect={x:20,y:10,w:60,h:100},out=P.composite({W:100,H:120,bg:{color:'#FFFFFF'},fg:{data:cut.data},rect});
 for(let y=0;y<100;y++)for(let x=0;x<60;x++)assert.deepEqual(px(out,100,20+x,10+y),px(cut.data,60,x,y),'pixel '+x+','+y);
 assert.deepEqual(px(out,100,0,0),[255,255,255,255]);assert.deepEqual(P.whiteBorder(out,100,120),{ok:true,off:0,checked:2*(100*2)+2*2*(120-4)});
 // the full marketplace render: 2000×2000, fill 85%, white ring, label colours intact in the middle of the stripe
 const item={cut},r=P.render(item,{W:2000,H:2000,bg:{color:'#FFFFFF'},fill:.85,x:.5,y:.5,shadow:0,tone:0});
 assert.equal(r.data.length,2000*2000*4);assert.ok(P.whiteBorder(r.data,2000,2000,4).ok);
 assert.ok(P.fillRatio(r.rect,2000,2000)>=.85);
 const midLabel=px(r.data,2000,r.rect.x+Math.round(r.rect.w/2),r.rect.y+Math.round(r.rect.h*.5));assert.deepEqual(midLabel,[250,240,30,255],'the label keeps its colour');
 let nonWhite=0;for(let y=0;y<2000;y+=7)for(let x=0;x<2000;x+=7){const i=(y*2000+x)*4,inRect=x>=r.rect.x&&x<r.rect.x+r.rect.w&&y>=r.rect.y&&y<r.rect.y+r.rect.h;if(!inRect&&(r.data[i]!==255||r.data[i+1]!==255||r.data[i+2]!==255))nonWhite++}
 assert.equal(nonWhite,0,'outside the product everything is pure white');
 // a single grey pixel on the border is caught
 const bad=new Uint8ClampedArray(out);bad[(119*100+50)*4]=254;assert.deepEqual(P.whiteBorder(bad,100,120),{ok:false,off:1,checked:864});
 // brand colour background
 const b=P.composite({W:10,H:10,bg:{color:'#F6EFE6'},fg:null,rect:{x:0,y:0,w:0,h:0}});assert.deepEqual(px(b,10,5,5),[246,239,230,255]);
});

test('contact shadow stays under the product and off the border; tone 0 leaves the product exact, tone >0 only nudges colour',()=>{
 const p=photo(),cut=P.cutout(p.rgba,p.mask,p.w,p.h,P.bbox(p.mask,p.w,p.h)),W=400,H=400;
 const r=P.render({cut},{W,H,bg:{color:'#FFFFFF'},fill:.85,x:.5,y:.5,shadow:.3,tone:0});
 assert.ok(P.whiteBorder(r.data,W,H).ok,'shadow never reaches the border');
 const under=px(r.data,W,Math.round(r.rect.x+r.rect.w/2),Math.min(H-3,r.rect.y+r.rect.h+1));assert.ok(under[0]<255,'a soft shadow at the base');
 // a warm scene: gains bounded, alpha and geometry untouched
 const bg=new Uint8ClampedArray(W*H*4);for(let i=0;i<bg.length;i+=4){bg[i]=230;bg[i+1]=170;bg[i+2]=110;bg[i+3]=255}
 const g=P.toneGains(bg,W,H,r.rect,1);assert.ok(g[0]>1&&g[2]<1,'warmer');assert.ok(g.every(v=>v>=.82&&v<=1.19),'±8% colour, ±10% light');
 assert.deepEqual(P.toneGains(bg,W,H,r.rect,0),[1,1,1]);
 const flat=P.render({cut},{W,H,bg:{data:bg},fill:.6,x:.5,y:.8,shadow:0,tone:0}),toned=P.render({cut},{W,H,bg:{data:bg},fill:.6,x:.5,y:.8,shadow:0,tone:.5});
 assert.deepEqual(flat.rect,toned.rect,'same geometry');
 const c=[Math.round(flat.rect.x+flat.rect.w/2),Math.round(flat.rect.y+10)];assert.deepEqual(px(flat.data,W,...c),[200,30,40,255],'tone 0: the photo pixel');
 const t=px(toned.data,W,...c);assert.ok(Math.abs(t[0]-200)<=24&&Math.abs(t[2]-40)<=6,'tone 0.5: a gentle shift '+t);
});

test('scaling in premultiplied alpha: the removed background never bleeds into the edge',()=>{
 // 4×1: two transparent green pixels, two opaque red pixels → 2×1
 const src=new Uint8ClampedArray([0,255,0,0, 0,255,0,0, 255,0,0,255, 255,0,0,255]);
 const d=P.scaleRGBA(src,4,1,2,1);assert.deepEqual(Array.from(d),[0,0,0,0,255,0,0,255]);
 const half=P.scaleRGBA(new Uint8ClampedArray([0,255,0,0, 255,0,0,255]),2,1,1,1);assert.deepEqual(Array.from(half),[255,0,0,128],'edge pixel keeps the product colour, half alpha');
 const up=P.scaleRGBA(new Uint8ClampedArray([0,255,0,0, 255,0,0,255]),2,1,4,1);for(let i=0;i<4;i++)if(up[i*4+3])assert.equal(up[i*4+1],0,'no green in the enlarged edge');
 assert.deepEqual(Array.from(P.scaleRGBA(src,4,1,4,1)),Array.from(src),'scale 1 is a copy');
});

test('edge refine and brush: threshold, choke and feather are deterministic; erase and restore win over the model',()=>{
 const w=20,h=20,raw=new Uint8Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)raw[y*w+x]=Math.round(255*x/(w-1)); // a horizontal ramp
 const hard=P.refineMask(raw,w,h,{threshold:.5,feather:0,choke:0});assert.equal(hard[10*w+0],0);assert.equal(hard[10*w+19],255);
 const hi=P.refineMask(raw,w,h,{threshold:.7,feather:0}),lo=P.refineMask(raw,w,h,{threshold:.3,feather:0});
 assert.ok(P.coverage(hi)<P.coverage(hard)&&P.coverage(hard)<P.coverage(lo),'higher threshold, smaller mask');
 const sq=new Uint8Array(w*h);for(let y=5;y<15;y++)for(let x=5;x<15;x++)sq[y*w+x]=255;
 const choked=P.refineMask(sq,w,h,{threshold:.5,feather:0,choke:2});assert.deepEqual(P.bbox(choked,w,h,128),{x:7,y:7,w:6,h:6},'choke moves the edge in by 2 px');
 const soft=P.refineMask(sq,w,h,{threshold:.5,feather:2,choke:0});assert.ok(soft[10*w+4]>0&&soft[10*w+4]<255,'feather softens the edge');
 assert.deepEqual(Array.from(P.refineMask(sq,w,h,{feather:2})),Array.from(soft),'same settings, same mask');
 const edits=new Int8Array(w*h);P.paintBrush(edits,w,h,10,10,2,'erase');P.paintBrush(edits,w,h,1,1,1,'restore');
 const fixed=P.applyEdits(sq,edits);assert.equal(fixed[10*w+10],0,'erased');assert.equal(fixed[1*w+1],255,'restored');assert.equal(fixed[6*w+6],255,'untouched');
 assert.equal(sq[10*w+10],255,'the model mask is not modified');
});

test('«Fondo uniforme»: the backdrop connected to the border goes, a backdrop-coloured label inside the product stays',()=>{
 // grey gradient backdrop, dark bottle with a light-grey label the same colour as the backdrop
 const w=120,h=100,rgba=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,bottle=x>=40&&x<80&&y>=20&&y<90,label=bottle&&x>=48&&x<72&&y>=45&&y<60,g=200+Math.round(y*.3);
  const c=label?[g,g,g]:bottle?[30,70,40]:[g+((x*7)%5)-2,g,g+2];rgba.set([c[0],c[1],c[2],255],i)}
 const m=P.plainBackgroundMask(rgba,w,h,{tolerance:20});
 assert.equal(m[5*w+5],0,'backdrop');assert.equal(m[50*w+60],255,'the label inside stays');assert.equal(m[30*w+42],255,'the bottle');
 assert.deepEqual(P.bbox(m,w,h,128),{x:40,y:20,w:40,h:70});
 // a product standing on the bottom edge: still found
 for(let y=90;y<h;y++)for(let x=40;x<80;x++)rgba.set([30,70,40,255],(y*w+x)*4);
 assert.deepEqual(P.bbox(P.plainBackgroundMask(rgba,w,h,{tolerance:20}),w,h,128),{x:40,y:20,w:40,h:80});
 const src=read('lib/product-photo-studio.js');assert.match(src,/st\.method=gpu\?'model':'plain'/,'no WebGPU: the uniform background method is preselected');
});

test('checks: coverage sanity, cut-off product, fill ≥ 85% on white, resolution, shape, halo on the edge',()=>{
 const p=photo(),box=P.bbox(p.mask,p.w,p.h),W=2000,H=2000;
 const ok=P.qualityChecks({photo:{w:p.w,h:p.h},alpha:p.mask,cutBox:box,rect:P.fitRect(box,W,H,{fill:.85}),W,H,bgKind:'white',useId:'shop',out:{data:P.composite({W:50,H:50,bg:{color:'#FFFFFF'}}),W:50,H:50},halo:P.haloScore(p.rgba,p.mask,p.w,p.h)});
 const by=id=>ok.find(c=>c.id===id);
 assert.equal(by('coverage').level,'ok');assert.equal(by('fill').level,'ok');assert.equal(by('white').level,'ok');assert.equal(by('shape').level,'ok');assert.equal(by('halo').level,'ok');
 assert.equal(by('resolution').level,'fail','a 100 px product blown up to 1700 px');assert.match(by('resolution').msg,/ingrandito 17\.0 volte/);
 const small=P.qualityChecks({photo:{w:p.w,h:p.h},alpha:p.mask,cutBox:box,rect:P.fitRect(box,W,H,{fill:.7}),W,H,bgKind:'white',useId:'shop'});
 assert.equal(small.find(c=>c.id==='fill').level,'fail');assert.match(small.find(c=>c.id==='fill').msg,/almeno l’85%/);
 assert.equal(P.qualityChecks({photo:{w:p.w,h:p.h},alpha:p.mask,cutBox:box,rect:P.fitRect(box,W,H,{fill:.6}),W,H,bgKind:'scene',useId:'social'}).find(c=>c.id==='fill').level,'ok','scenes: no 85% rule');
 const empty=new Uint8Array(p.w*p.h),full=new Uint8Array(p.w*p.h).fill(255);
 assert.equal(P.qualityChecks({photo:{w:p.w,h:p.h},alpha:empty,cutBox:null,W,H}).find(c=>c.id==='coverage').level,'fail');
 const all=P.qualityChecks({photo:{w:p.w,h:p.h},alpha:full,cutBox:{x:0,y:0,w:p.w,h:p.h},W,H});
 assert.equal(all.find(c=>c.id==='coverage').level,'fail');assert.equal(all.find(c=>c.id==='cropped').level,'warn','touches the photo border');
 // halo: an exact mask has none; a mask 2 px too large carries the green backdrop around the product
 assert.ok(P.haloScore(p.rgba,p.mask,p.w,p.h).score<.05);
 const fat=dilate(p.mask,p.w,p.h,2),hs=P.haloScore(p.rgba,fat,p.w,p.h);assert.ok(hs.score>.8,'halo detected '+hs.score);
 const warn=P.qualityChecks({photo:{w:p.w,h:p.h},alpha:fat,cutBox:P.bbox(fat,p.w,p.h),W,H,halo:hs}).find(c=>c.id==='halo');assert.equal(warn.level,'warn');assert.match(warn.msg,/restringi il bordo/);
 // and choking the fat mask by 2 px removes it
 const fixed=P.refineMask(fat,p.w,p.h,{threshold:.5,feather:0,choke:2});assert.ok(P.haloScore(p.rgba,fixed,p.w,p.h).score<.05);
 assert.equal(P.worst(ok),'fail');assert.equal(P.worst([{level:'ok'},{level:'warn'}]),'warn');
});

test('scenes: only the background, the centre left empty, the brand palette from the Kit identità; 3 different framings',()=>{
 const brand=P.brandOf({},{identityKit:{direction:'Terra',palette:[{role:'primary',hex:'#7A3E1D'},{role:'light',hex:'#F6EFE6'}],keywords:['artigianale','caldo']}});
 assert.equal(brand.source,'kit');assert.equal(brand.light,'#F6EFE6');
 const list=P.scenePrompts({ambiente:'Cucina',luce:'Calda, tramonto',superficie:'Marmo',stile:'Dal Kit identità'},{brand,fill:.6,formatId:'p1080'});
 assert.equal(list.length,3);assert.equal(new Set(list.map(x=>x.prompt)).size,3);assert.deepEqual(list.map(x=>x.label),['Essenziale','Con dettagli ai lati','Più profondità']);
 for(const x of list){assert.match(x.prompt,/empty background plate/);assert.match(x.prompt,/centre of the surface completely EMPTY/);assert.match(x.prompt,/Do NOT draw any product/);assert.match(x.prompt,/No text, no letters, no logos/);
  assert.match(x.prompt,/a bright modern kitchen/);assert.match(x.prompt,/white marble/);assert.match(x.prompt,/golden-hour/);assert.match(x.prompt,/#7A3E1D, #F6EFE6/);assert.match(x.prompt,/vertical 4:5/);assert.match(x.prompt,/about 60% of the frame height/)}
 const neutral=P.scenePrompts({},{brand:P.brandOf({},{})});assert.match(neutral[0].prompt,/sober, professional/);assert.match(neutral[0].prompt,/square frame/);
});

test('backgrounds: «Annulla» = 0 image calls; conferma = exactly the announced 3, whatever the number of products',async()=>{
 const prompts=P.scenePrompts({},{});let calls=[],asked=[];
 const request=async body=>{calls.push(body);return {image:'data:image/png;base64,AA=='}};
 assert.equal(await P.generateScenes({prompts,shape:'square',products:7,request,confirm:async o=>{asked.push(o);return false}}),null);
 assert.equal(calls.length,0,'nothing spent');assert.equal(asked.length,1);
 assert.equal(asked[0].title,'Generare 3 sfondi con OpenAI?');assert.match(asked[0].cost,/^Sono 3 generazioni di immagini OpenAI a qualità media: consumano il saldo API di OpenAI\./);
 assert.deepEqual(asked[0].facts[0],['Generazioni','3 sfondi, uno per proposta']);assert.match(asked[0].facts[1][1],/^7 foto: ogni sfondo si riusa per tutte, nessuna generazione in più$/);assert.equal(asked[0].ok,'Genera 3 sfondi');
 const res=await P.generateScenes({prompts,shape:'portrait',products:7,references:['data:image/jpeg;base64,AA==','https://evil.example/x.png'],request,confirm:async()=>true});
 assert.equal(calls.length,3,'exactly 3 for 7 products: the scenes are reused');assert.ok(res.every(r=>r.image&&r.label));
 assert.ok(calls.every(b=>b.shape==='portrait'&&b.quality==='medium'&&b.references.length===1&&b.references[0].startsWith('data:image/jpeg')),'only RADIX data URLs as references');
 // one failure does not stop the others, and is not retried behind the person's back
 let n=0;const flaky=async()=>{if(n++===1)throw Error('quota');return {image:'data:image/png;base64,AA=='}};
 const mixed=await P.generateScenes({prompts,request:flaky,confirm:async()=>true});assert.equal(n,3);assert.equal(mixed.filter(x=>x.error).length,1);assert.equal(mixed[1].error,'quota');
 await assert.rejects(P.generateScenes({prompts:[],request,confirm:async()=>true}),/Nessuno sfondo/);
 // the default request goes to the existing endpoint
 const src=read('lib/product-photo-studio.js');assert.deepEqual([...src.matchAll(/fetch\('([^']+)'/g)].map(m=>m[1]),['/api/openai-image']);assert.match(src,/f\('\/api\/workspace\?resource=media'/);
 const code=(src+read('lib/product-photo-segment.js')).replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');assert.ok(!/rmbg|briaai|@imgly|background-removal/i.test(code),'no non-commercial or AGPL remover in the code');
});

test('segmentation module: pinned runtime and weights with commercial licences, lazy, mocked in tests (no download)',async()=>{
 assert.equal(SEG.RUNTIME_URL,'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js');
 assert.match(SEG.REVISION,/^[0-9a-f]{40}$/,'weights at a fixed commit');assert.equal(SEG.MODEL,'onnx-community/BiRefNet_lite-ONNX');
 assert.deepEqual(SEG.LICENSES.map(l=>l.license),['Apache-2.0','MIT']);assert.ok(SEG.LICENSES.every(l=>/^https:\/\/(github\.com|huggingface\.co)\//.test(l.url)));
 assert.equal(SEG.status().ready,false,'nothing loaded at require time');
 const seen=[];const p=SEG.progressTracker(e=>seen.push(e));p({status:'progress',file:'a',loaded:5,total:10});p({status:'progress',file:'b',loaded:0,total:30});p({status:'done',file:'a'});
 assert.deepEqual(seen.map(e=>+e.ratio.toFixed(3)),[.5,.125,.25]);
 // a fake runtime: records the pipeline options and returns a mask
 const calls=[];globalThis.__radixTransformers={env:{},RawImage:{fromCanvas:c=>({w:c.width,h:c.height})},
  pipeline:async(task,model,opts)=>{calls.push({task,model,opts});opts.progress_callback({status:'progress',file:'onnx/model.onnx',loaded:50,total:100});
   return async img=>[{mask:{width:img.w,height:img.h,channels:1,data:new Uint8Array(img.w*img.h).fill(200)}}]}};
 const nav=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 try{// without WebGPU: a clear message, nothing downloaded (BiRefNet at 1024 px does not fit in WebAssembly memory)
  Object.defineProperty(globalThis,'navigator',{value:{},configurable:true,writable:true});
  await assert.rejects(SEG.load(),e=>e.noGpu===true&&/WebGPU/.test(e.message)&&/Fondo uniforme/.test(e.message));assert.equal(calls.length,0,'no runtime import without WebGPU');
  Object.defineProperty(globalThis,'navigator',{value:{gpu:{}},configurable:true,writable:true});
  const prog=[];const m=await SEG.segment({width:4,height:3},{onProgress:x=>prog.push(x)});
  assert.deepEqual([m.width,m.height,m.data.length,m.data[0]],[4,3,12,200]);
  assert.equal(calls.length,1);assert.equal(calls[0].task,'image-segmentation');assert.equal(calls[0].model,SEG.MODEL);assert.equal(calls[0].opts.revision,SEG.REVISION);
  assert.equal(calls[0].opts.device,'webgpu');assert.equal(calls[0].opts.dtype,'fp16');assert.equal(globalThis.__radixTransformers.env.allowLocalModels,false);
  assert.ok(prog.some(x=>x.ratio===.5)&&prog.some(x=>x.ready),'progress for the bar, then ready');
  await SEG.segment({width:2,height:2});assert.equal(calls.length,1,'the model loads once');
 }finally{delete globalThis.__radixTransformers;if(nav)Object.defineProperty(globalThis,'navigator',nav);else delete globalThis.navigator}
 // the studio loads it only from the button, never on open
 const src=read('lib/product-photo-studio.js');assert.match(src,/cutGo\.onclick=async\(\)=>\{[^\n]*\n[^\n]*\n[^\n]*\n\s*const S=ctx\.segmenter\|\|segLib\(\)/);assert.equal(src.split('S.load(').length-1,1);
});

test('batch: names per product and background, one record for the project with the media URLs',()=>{
 assert.equal(P.fileName('Bottiglia Olio 1L.JPG',0,{formatId:'sq2000',bg:'white',typeId:'jpg'}),'bottiglia-olio-1l-bianco-2000x2000.jpg');
 assert.equal(P.fileName('',3,{formatId:'p1080',bg:'scene',typeId:'webp',scene:'Più profondità'}),'prodotto-4-ambientata-piu-profondita-1080x1350.webp');
 assert.equal(P.fileName('a.png',1,{formatId:'sq1200',bg:'brand',typeId:'png'}),'a-colore-1200x1200.png');
 const rec=P.savedRecord({useId:'shop',bg:'white',formatId:'sq2000',typeId:'jpg',fill:.85,x:.5,y:.5,shadow:0,tone:.35,products:[{name:'olio.jpg',file:'olio-bianco-2000x2000.jpg',url:'/api/workspace?resource=file&id=x&s=y',checks:[{id:'fill',level:'ok',msg:'…'}]}]},{by:'Ilaria',at:'2026-10-22T10:00:00.000Z'});
 assert.equal(rec.id,'fp-20261022100000');assert.deepEqual(rec.format,{id:'sq2000',w:2000,h:2000});assert.deepEqual(rec.products[0].checks,[{id:'fill',level:'ok'}]);assert.equal(rec.scene,null);
});

test('saved in the project: key productPhotos in the agents document, every other key kept, retried on a conflict; agents-page keeps it',async()=>{
 const rec={id:'fp-1',products:[]};
 let stored={schemaVersion:1,conversations:{copywriter:[{role:'user',content:'ciao'}]},prefs:{a:1},translations:{schemaVersion:1,items:[{id:'tr'}]},productPhotos:{schemaVersion:1,items:[{id:'old'}]}},conflicts=1;
 class ConflictError extends Error{}
 const ws={ConflictError,bind:(pid,name)=>{assert.equal(pid,'forno');assert.equal(name,'agents');return {load:async()=>JSON.parse(JSON.stringify(stored)),save:async d=>{if(conflicts-->0)throw new ConflictError('x');stored=d}}}};
 await P.saveToProject(ws,'forno',rec);
 assert.deepEqual(stored.productPhotos.items.map(x=>x.id),['old','fp-1']);assert.deepEqual(stored.translations,{schemaVersion:1,items:[{id:'tr'}]});assert.deepEqual(stored.prefs,{a:1});assert.equal(stored.conversations.copywriter.length,1);
 for(let i=0;i<12;i++)await P.saveToProject(ws,'forno',{id:'fp-x'+i});assert.equal(stored.productPhotos.items.length,10,'only the last 10');
 assert.deepEqual(P.readStore({productPhotos:'boh'}),{schemaVersion:1,items:[]});
 // images go to the existing media archive of the project
 const posts=[];const url=await P.uploadImage({projectId:'forno',contentId:'fp-1',slot:0,dataUrl:'data:image/jpeg;base64,AA=='},async(u,o)=>{posts.push([u,JSON.parse(o.body)]);return {ok:true,json:async()=>({url:'/api/workspace?resource=file&id=1&s=2'})}});
 assert.equal(url,'/api/workspace?resource=file&id=1&s=2');assert.deepEqual(posts,[['/api/workspace?resource=media',{projectId:'forno',contentId:'fp-1',slot:0,dataUrl:'data:image/jpeg;base64,AA=='}]]);
 await assert.rejects(P.uploadImage({projectId:'x',contentId:'y',slot:0,dataUrl:'z'},async()=>({ok:false,json:async()=>({error:'Immagine non valida o troppo grande'})})),/troppo grande/);
 // agents-page.js: its own clean() keeps productPhotos; also after a save conflict and when the tab comes back
 const src=read('agents-page.js'),fn=/function clean\(d\)\{[^\n]*\}/.exec(src)[0],ctx={MAX_KEPT:40};vm.createContext(ctx);vm.runInContext(fn+';this.clean=clean',ctx);
 const kept=ctx.clean({...stored,conversations:{a:[{role:'user',content:'x'},{role:'assistant',content:'…',pending:true}]}});
 assert.deepEqual(JSON.parse(JSON.stringify(kept.productPhotos)),stored.productPhotos,'productPhotos kept by agents-page clean()');assert.equal(kept.conversations.a.length,1);
 assert.match(src,/data\.translations=fresh\.translations;data\.productPhotos=fresh\.productPhotos;\n/,'kept after a save conflict');
 assert.match(src,/if\(fresh&&data\)\{[^}]*data\.productPhotos=fresh\.productPhotos;/,'and when the tab comes back');
 // the media endpoint accepts what the studio sends (PNG/JPEG data URL, slot 0–19, at most 10 products)
 assert.match(read('api/_registry-handler.js'),/data:\(image\\\/\(\?:png\|jpeg\)\);base64/);assert.ok(P.MAX_PRODUCTS<=20);
});

test('the card in «Cosa vuoi fare»: Immagini, after the Studio Foto; loaded after the confirmation and the zip, opened inline',()=>{
 const crea=require('../agency/crea-core.js'),look=require('../agency/marketing-look.js'),c=crea.card('fotoprodotto');
 assert.equal(c.group,'Immagini');assert.equal(c.title,'Foto prodotto');assert.equal(c.inline,'productphoto');assert.equal(c.state,'ready');
 assert.match(c.cost,/senza chiamate AI, gratuiti\. Le ambientazioni sono facoltative: 3 generazioni OpenAI, con conferma\./);assert.match(c.hint,/L’AI disegna solo lo sfondo/);
 assert.equal(crea.linkFor(c,'radix'),null);assert.deepEqual(crea.fromQuery('?open=fotoprodotto'),{group:'Immagini',open:'fotoprodotto'});
 assert.equal(look.CARDS.fotoprodotto,'productPhoto');assert.ok(look.has('productPhoto'));
 const html=read('agency/crea.html'),at=s=>html.indexOf(s);
 assert.ok(at('/lib/radix-confirm.js')<at('/lib/product-photo-studio.js')&&at('/lib/zip-lite.js')<at('/lib/product-photo-studio.js')&&at('/lib/product-photo-segment.js')<at('/lib/product-photo-studio.js')&&at('/lib/product-photo-studio.js')<at('/agency/crea.js'));
 assert.ok(!/cdn\.jsdelivr|huggingface/.test(html),'nothing external loaded with the page: the model only on demand');
 const js=read('agency/crea.js');assert.match(js,/productphoto:\{global:'RadixProductPhotoStudio'/);assert.match(js,/c\.inline==='productphoto'\n\s+\?S\.productPhotoStudio\(\{project,profile:current\.profile,projectName:current\.name,projectId:current\.id,workspace:ws\}\)/);
 const css=read('shell/crea.css');assert.match(css,/\.cr-panel \.product-photo-studio \.fp-check\[data-level=fail\]/);assert.match(css,/@media \(max-width:640px\)\{\n \.cr-panel \.product-photo-studio \.fp-chips\{grid-template-columns:minmax\(0,1fr\)\}/);
 const src=read('lib/product-photo-studio.js');assert.equal(src.split('await ask(sceneConfirm(').length-1,1,'one confirmation before the generations');assert.ok(!/RadixAgents|reply\(/.test(src),'no chat AI call');
});
