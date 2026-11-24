'use strict';
// Studio «Animazione del logo» (lib/logo-motion.js): the keyframe engine (tracks, easings, timeline, the static logo on
// the first/last frame, determinism), the parts of the logo, the empty state without a Kit identità, the payoff never
// invented, background from the palette only, the checks, the animated SVG with reduced motion, the GIF writer (LZW,
// header, frames, decoded back by an independent decoder), the saved key logoMotion, the card and no AI call.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const M=require('../lib/logo-motion.js'),ZIP=require('../lib/zip-lite.js');
const crea=require('../agency/crea-core.js'),look=require('../agency/marketing-look.js');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');

const LOGO='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 96"><circle cx="48" cy="48" r="30" fill="#2F5D50"/><circle cx="60" cy="38" r="10" fill="#E3B448"/><text x="92" y="60" font-family="Fraunces, serif" font-size="34" font-weight="700" fill="#1C1C1E">Forno Aurora</text></svg>';
const WORD_ONLY='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 60"><text x="0" y="44" font-family="Inter" font-size="40" font-weight="700" fill="#2F5D50">Aurora</text></svg>';
const PAL=[{role:'primary',hex:'#2F5D50'},{role:'secondary',hex:'#A0522D'},{role:'accent',hex:'#E3B448'},{role:'dark',hex:'#1C1C1E'},{role:'light',hex:'#FAF6EE'}];
const KIT={brand:'Forno Aurora',direction:'Bottega di quartiere',palette:PAL,fonts:[{heading:'Fraunces',body:'Inter'}],logo:LOGO};
const PROFILE={identityKit:KIT,payoff:'Pane a lievito madre dal 1987'};
const model=(o={},profile=PROFILE)=>M.modelOf({proposal:'disegno',...o},profile,{projectName:'Forno Aurora'});
const state=(checks,id)=>(checks.find(c=>c.id===id)||{}).state;
const VERSI=['entrata','uscita','ciclo'];

// ---- an independent GIF decoder (not the encoder's code): blocks, LZW, frames composited on the canvas ----
function decodeGif(bytes){const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);let p=0;const u8=()=>b[p++],u16=()=>{const v=b[p]|(b[p+1]<<8);p+=2;return v};
 const sig=String.fromCharCode(...b.subarray(0,6));p=6;const w=u16(),h=u16(),pk=u8(),bgIndex=u8();u8();
 let gct=null;if(pk&0x80){const n=1<<((pk&7)+1);gct=[];for(let i=0;i<n;i++){gct.push([b[p],b[p+1],b[p+2]]);p+=3}}
 const frames=[],canvas=new Int16Array(w*h).fill(-1);let loop=null,gce=null;
 while(p<b.length){const k=u8();
  if(k===0x3B)break;
  if(k===0x21){const label=u8();const blocks=[];for(let n=u8();n;n=u8()){blocks.push(b.subarray(p,p+n));p+=n}
   if(label===0xF9){const d=blocks[0];gce={disposal:(d[0]>>2)&7,transparent:d[0]&1?d[3]:-1,delay:d[1]|(d[2]<<8)}}
   if(label===0xFF&&String.fromCharCode(...blocks[0])==='NETSCAPE2.0')loop=blocks[1][1]|(blocks[1][2]<<8);continue}
  if(k===0x2C){const x=u16(),y=u16(),fw=u16(),fh=u16(),fpk=u8();if(fpk&0x80)throw Error('local table not expected');
   const min=u8(),data=[];for(let n=u8();n;n=u8()){for(let i=0;i<n;i++)data.push(b[p+i]);p+=n}
   const idx=lzwDecode(min,data,fw*fh);const before=canvas.slice();
   for(let yy=0;yy<fh;yy++)for(let xx=0;xx<fw;xx++){const v=idx[yy*fw+xx];if(gce&&v===gce.transparent)continue;canvas[(y+yy)*w+x+xx]=v}
   frames.push({x,y,w:fw,h:fh,delay:gce?gce.delay:0,disposal:gce?gce.disposal:0,transparent:gce?gce.transparent:-1,pixels:Array.from(canvas)});
   if(gce&&gce.disposal===2)for(let yy=0;yy<fh;yy++)for(let xx=0;xx<fw;xx++)canvas[(y+yy)*w+x+xx]=-1;
   else if(gce&&gce.disposal===3)canvas.set(before);gce=null;continue}
  throw Error('unknown block 0x'+k.toString(16)+' at '+(p-1))}
 return {sig,w,h,gct,bgIndex,loop,frames}}
function lzwDecode(min,data,count){const clear=1<<min,eoi=clear+1,out=[];let size=min+1,dict=[],prev=null,bit=0;
 const reset=()=>{dict=[];for(let i=0;i<clear;i++)dict[i]=[i];dict[clear]=[];dict[eoi]=[];size=min+1;prev=null};reset();
 const read=()=>{let v=0;for(let i=0;i<size;i++,bit++){if((bit>>3)>=data.length)return -1;v|=((data[bit>>3]>>(bit&7))&1)<<i}return v};
 for(;;){const code=read();if(code<0||code===eoi)break;if(code===clear){reset();continue}
  let entry;if(code<dict.length&&dict[code])entry=dict[code];else if(code===dict.length&&prev)entry=prev.concat([prev[0]]);else throw Error('bad code '+code);
  out.push(...entry);if(prev){dict.push(prev.concat([entry[0]]));if(dict.length===(1<<size)&&size<12)size++}prev=entry}
 if(out.length<count)throw Error('short image data: '+out.length+' of '+count);return out.slice(0,count)}

test('keyframes: interpolation, eases, before and after the keys, the overshoot of «rimbalzo» still ends on the value',()=>{
 const tr=[[.2,0],[.6,10,'lineare'],[1,4,'user']];
 assert.equal(M.valueAt(tr,0,'lineare'),0);assert.equal(M.valueAt(tr,.2,'lineare'),0);assert.ok(Math.abs(M.valueAt(tr,.4,'lineare')-5)<1e-12);assert.equal(M.valueAt(tr,.6,'lineare'),10);
 assert.equal(M.valueAt(tr,1,'morbida'),4);assert.equal(M.valueAt(tr,2,'morbida'),4);assert.equal(M.valueAt([],.5),undefined);
 for(const [k,e] of Object.entries(M.EASES)){assert.equal(e.f(0),0,k);assert.ok(Math.abs(e.f(1)-1)<1e-12,k)}
 const peak=Math.max(...Array.from({length:101},(_,i)=>M.EASES.rimbalzo.f(i/100)));assert.ok(peak>1.05,'rimbalzo overshoots');
 assert.ok(M.EASES.decisa.f(.3)>M.EASES.lineare.f(.3)&&M.EASES.morbida.f(.2)<.2,'decisa starts fast, morbida slow');
 // every track of every proposal ends on the identity
 for(const p of M.PROPOSALS)for(const [part,tracks] of Object.entries(p.tracks))for(const [k,t] of Object.entries(tracks)){if(k==='mask'||k==='behind')continue;
  assert.equal(t[t.length-1][1],M.IDENTITY[k],p.id+' '+part+' '+k);for(let i=1;i<t.length;i++)assert.ok(t[i][0]>=t[i-1][0],p.id+' '+part+' '+k+' sorted')}
});

test('timeline: the segments add up to the duration; entrata, uscita and ciclo; hold, speed and the limits',()=>{
 for(const v of VERSI)for(const D of M.DURATIONS)for(const hold of M.HOLDS)for(const speed of Object.keys(M.SPEEDS)){const tl=M.timeline({duration:D,hold,speed,verso:v});
  assert.ok(Math.abs(tl.segs.reduce((a,s)=>a+s.len,0)-D)<1e-9,v+D);assert.ok(Math.abs(tl.segs[tl.segs.length-1].to-D)<1e-9);assert.ok(tl.motion>=.8*M.SPEEDS[speed].k-1e-9,'motion at least 0.8 s × speed')}
 const e=M.timeline({duration:3,hold:1,speed:'lenta',verso:'entrata'});assert.deepEqual(e.segs.map(s=>s.kind),['entra','fermo']);
 assert.equal(M.progressAt(e,0).u,0);assert.equal(M.progressAt(e,1).u,.5);assert.equal(M.progressAt(e,2.5).u,1);assert.equal(M.progressAt(e,99).u,1);
 const n=M.timeline({duration:3,hold:1,speed:'normale',verso:'entrata'});assert.deepEqual(n.segs.map(s=>s.kind),['vuoto','entra','fermo']);assert.ok(Math.abs(n.segs[0].len-.4)<1e-9);
 const u=M.timeline({duration:4,hold:1.5,speed:'rapida',verso:'uscita'});assert.equal(M.progressAt(u,0).u,1);assert.equal(M.progressAt(u,4).u,0);assert.equal(u.segs[0].kind,'fermo');
 const c=M.timeline({duration:4,hold:1,verso:'ciclo'});assert.deepEqual(c.segs.map(s=>s.kind),['fermo','esce','vuoto','entra','fermo']);assert.equal(M.progressAt(c,0).u,1);assert.equal(M.progressAt(c,4).u,1);
 assert.ok(M.progressAt(c,2).u<1,'ciclo leaves in the middle');
 assert.equal(M.timeline({duration:9}).D,5);assert.equal(M.timeline({duration:1}).D,2);assert.ok(Math.abs(M.timeline({duration:2,hold:2}).hold-1.2)<1e-9,'hold leaves 0.8 s of motion');
 assert.equal(M.frameTime(0,60,20,3),0);assert.equal(M.frameTime(59,60,20,3),3,'the last frame is the end of the timeline');
});

test('the frame state: the static logo where it must be, nothing at u = 0, the same input gives the same frames',()=>{
 for(const p of M.PROPOSALS)for(const v of VERSI){const m=model({proposal:p.id,verso:v,duration:3});
  const edges=v==='entrata'?[m.tl.D]:v==='uscita'?[0]:[0,m.tl.D];
  for(const t of edges){const f=M.frameAt(m,t);assert.ok(f.still,p.id+' '+v+' '+t);assert.ok(f.parts.every(M.isIdentity),p.id+' '+v+' identity at '+t);assert.equal(f.payoff.opacity,1)}
  const empty=v==='entrata'?0:v==='uscita'?m.tl.D:m.tl.D/2,f0=M.frameAt(m,empty);assert.equal(f0.u,0,p.id+' '+v);assert.equal(f0.payoff.opacity,0);
  for(const s of f0.parts){const hidden=s.opacity===0||s.scale===0||(s.draw===0&&s.fill===0)||(s.clip&&(s.clip.x1-s.clip.x0<=(s.box.x1-s.box.x0)*.07))||(s.clip&&s.box.y0+s.dy>=s.clip.y1-1e-9);assert.ok(hidden,p.id+' '+v+' '+s.id+' hidden at u=0')}
  assert.equal(JSON.stringify(Array.from({length:13},(_,i)=>M.frameAt(m,i/4))),JSON.stringify(Array.from({length:13},(_,i)=>M.frameAt(model({proposal:p.id,verso:v,duration:3}),i/4))),'deterministic')}
 // mid-animation: the parts really move
 const pop=model({proposal:'pop',ease:'lineare'}),mid=M.frameAt(pop,pop.tl.segs.find(s=>s.kind==='entra').from+pop.tl.motion*.4);
 const sym=mid.parts.find(s=>s.id==='symbol'),word=mid.parts.find(s=>s.id==='word');assert.ok(sym.scale>0&&sym.scale<1);assert.ok(word.dx<0,'the name slides from the left');assert.ok(word.clip&&word.clip.x0>sym.box.x1-1,'from behind the symbol');
 const [a,,,,e,f]=M.matrixOf({...sym,scale:.5,dx:3,dy:0});assert.equal(a,.5);assert.equal(e,48-.5*48+3);assert.equal(f,48-.5*48);
});

test('the parts: symbol and name split from the kit logo; a logo with no separate symbol moves as one piece',()=>{
 const m=model();assert.equal(m.parts.split,true);assert.equal(m.parts.orientation,'horizontal');assert.deepEqual(m.parts.list.map(p=>p.id),['symbol','word']);
 assert.match(m.parts.list[0].svg,/<circle/);assert.doesNotMatch(m.parts.list[0].svg,/<text/);assert.match(m.parts.list[1].svg,/Forno Aurora/);
 const one=model({proposal:'pop'},{identityKit:{...KIT,logo:WORD_ONLY}});assert.equal(one.parts.split,false);assert.deepEqual(one.parts.list.map(p=>p.id),['logo']);
 const f=M.frameAt(one,0);assert.equal(f.parts[0].scale,0);assert.ok(M.frameAt(one,one.tl.D).parts.every(M.isIdentity));
 assert.match(M.checksOf(one).find(c=>c.id==='kit').detail,/si muove tutto insieme/);
 // draw-on: lengths and the dash of the outline
 assert.ok(Math.abs(M.lengthOf({tag:'circle',attrs:{r:'10'}})-2*Math.PI*10)<1e-9);assert.equal(M.lengthOf({tag:'rect',attrs:{width:'4',height:'3'}}),14);
 assert.ok(Math.abs(M.lengthOf({tag:'path',attrs:{d:'M0 0 L3 4 L3 0 Z'}})-12)<1e-9);assert.ok(Math.abs(M.lengthOf({tag:'path',attrs:{d:'M0 0 C0 0 10 0 10 0'}})-10)<1e-6);
 const ol=M.outlineSvg(m.parts.list[0],m,.5);assert.match(ol,/fill="none"/);assert.match(ol,/stroke="#2F5D50"/);assert.match(ol,/stroke-dasharray="94\.248 189\.496"/);
});

test('without a Kit identità or without a logo: nothing invented, the checks block',()=>{
 assert.equal(M.hasKit({}),false);assert.equal(M.hasKit({identityKit:{brand:'X'}}),false);assert.equal(M.hasKit(PROFILE),true);
 const none=model({},{contacts:{phone:'011'}});assert.equal(none.logo,'');assert.equal(state(M.checksOf(none),'kit'),'fail');assert.equal(M.blocking(M.checksOf(none)).length,1);
 const nologo=model({},{identityKit:{...KIT,logo:''}});assert.equal(state(M.checksOf(nologo),'kit'),'fail');assert.match(M.checksOf(nologo)[0].detail,/non ha un logo/);
 assert.equal(M.blocking(M.checksOf(model())).length,0);
});

test('payoff only from the project; background from the palette only; the logo in one readable colour on a dark fill',()=>{
 const m=model();assert.equal(m.payoffText,'Pane a lievito madre dal 1987');assert.ok(M.layout(m,1920,1080).payoff);
 const off=model({payoff:false});assert.equal(off.payoffText,'');assert.equal(M.layout(off,1920,1080).payoff,null);
 const none=model({},{identityKit:KIT});assert.equal(none.hasPayoff,false);assert.equal(none.payoffText,'');assert.equal(M.checksOf(none).find(c=>c.id==='payoff'),undefined);
 assert.match(M.readme(none,M.checksOf(none),[]),/DATI NON PRESENTI[\s\S]*Payoff/);
 assert.equal(M.normalize({bg:'#FF0000'}).bg,'light','a free colour is not accepted');assert.deepEqual(M.BGS,['primary','secondary','accent','dark','light','trasparente']);
 for(const r of M.ROLES)assert.equal(model({bg:r}).bgHex,PAL.find(c=>c.role===r).hex);assert.equal(model({bg:'trasparente'}).bgHex,null);
 const dark=model({bg:'primary'});assert.ok(dark.mono);assert.notEqual(dark.logo,LOGO);assert.equal(state(M.checksOf(dark),'contrasto'),'ok');
 const light=model({bg:'light'});assert.equal(light.logo,LOGO);assert.equal(light.mono,'');
 assert.equal(state(M.checksOf(model({bg:'trasparente'})),'contrasto'),'warn');
 const acc=model({bg:'accent'});assert.ok(['ok','warn'].includes(state(M.checksOf(acc),'contrasto')));
 // the payoff stays readable on a phone: at least 12 CSS px when the frame fills a 390 px screen
 for(const f of M.FORMATS){const L=M.layout(model({format:f.id}),f.w,f.h);assert.ok(L.payoff.size>=Math.ceil(12*f.w/390),f.id);assert.ok(L.box.x>=0&&L.box.x+L.box.w<=f.w&&L.box.y>=0,f.id)}
});

test('the checks: first and last frame, Outlook, loops, reduced motion, sizes',()=>{
 const c=M.checksOf(model({use:'video',verso:'entrata'}));assert.equal(state(c,'fotogrammi'),'ok');assert.match(c.find(x=>x.id==='fotogrammi').detail,/L’ultimo fotogramma è il logo statico esatto/);
 assert.equal(state(M.checksOf(model({use:'email',verso:'entrata',gifLoop:'una'})),'outlook'),'warn');assert.equal(M.checksOf(model({use:'email',verso:'ciclo',gifLoop:'una'})).find(x=>x.id==='outlook'),undefined);
 assert.equal(state(M.checksOf(model({use:'email',verso:'ciclo',gifLoop:'sempre'})),'movimento'),'warn');
 assert.equal(state(M.checksOf(model({use:'loader',verso:'entrata'})),'ciclo'),'warn');assert.equal(M.checksOf(model({use:'loader',verso:'ciclo'})).find(x=>x.id==='ciclo'),undefined);
 assert.equal(state(M.checksOf(model({use:'loader'})),'movimento'),'ok');
 assert.equal(M.normalize({use:'sticker'}).verso,'ciclo');assert.equal(M.normalize({use:'email'}).gifLoop,'una');assert.equal(M.normalize({use:'loader'}).format,'1:1');
 const big=M.checksOf(model({use:'email',verso:'ciclo',gifLoop:'una'}),{sizes:{'a.gif':1.4e6}});assert.equal(state(big,'peso'),'warn');assert.match(big.find(x=>x.id==='peso').detail,/1 MB/);
 assert.equal(state(M.checksOf(model({use:'video'}),{sizes:{'a.gif':6e5,'a.webm':2e6}}),'peso'),'ok');assert.equal(state(M.checksOf(model({use:'loader',verso:'ciclo'}),{sizes:{'logo-animato.svg':8e4}}),'peso'),'warn');
});

test('the animated SVG for the site: keyframes from the engine, the static logo under reduced motion, nothing external',()=>{
 for(const p of M.PROPOSALS){const m=model({proposal:p.id,use:'loader',verso:'ciclo'}),svg=M.animatedSvg(m);
  assert.match(svg,/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" class="rxl" viewBox="0 0 [\d.]+ [\d.]+"/);assert.match(svg,/<title>Forno Aurora<\/title>/);
  assert.match(svg,/@media \(prefers-reduced-motion: reduce\)\{\.rxl \*\{animation:none!important\}\}/);assert.match(svg,/infinite/);
  assert.doesNotMatch(svg,/https?:\/\/(?!www\.w3\.org)/);assert.doesNotMatch(svg,/<script/i);
  // the end of every part's keyframes is the static logo (identity matrix, full opacity)
  for(const id of ['symbol','word']){const k=new RegExp('@keyframes rxl-'+id+'-m\\{.*?100%\\{transform:matrix\\(1,0,0,1,0,0\\);opacity:1;\\}\\}');assert.match(svg,k,p.id+' '+id)}
  assert.ok(svg.length<5e4,p.id+' under 50 KB');assert.match(svg,/Pane a lievito madre dal 1987/)}
 const d=M.animatedSvg(model({proposal:'disegno'}));assert.match(d,/pathLength="1"/);assert.match(d,/stroke-dashoffset/);assert.match(d,/\.rxl-symbol-ol\{opacity:0;/,'the outline is hidden when not animated');
 assert.match(M.animatedSvg(model({verso:'entrata'}),{loop:false}),/linear 1 both/);
 const html=M.loaderHtml(model({use:'loader'}),'<svg/>');assert.match(html,/prefers-reduced-motion/);assert.match(html,/background:#FAF6EE/);assert.match(html,/rx-loaded/);
});

test('GIF: LZW of a known minimal case, header, palette, loop, frames merged and decoded back exactly',()=>{
 // 2 × 2 all index 0, min code size 2: codes clear(4) 0 6 0 eoi(5) at 3 bits → 0x84 0x51
 assert.deepEqual(M.lzw(2,[0,0,0,0]),[0x84,0x51]);
 const g=M.gifEncode({w:2,h:2,palette:['#000000','#FFFFFF'],frames:[{indices:new Uint8Array([0,0,0,0]),delay:10},{indices:new Uint8Array([0,0,0,0]),delay:10},{indices:new Uint8Array([1,0,0,1]),delay:10}]});
 assert.equal(Buffer.from(g.subarray(0,6)).toString('latin1'),'GIF89a');assert.deepEqual([g[6]|(g[7]<<8),g[8]|(g[9]<<8)],[2,2]);assert.equal(g[10],0x80,'global table of 2 colours');assert.equal(g[g.length-1],0x3B);
 assert.deepEqual(Array.from(g.subarray(13,19)),[0,0,0,255,255,255]);assert.match(Buffer.from(g).toString('latin1'),/NETSCAPE2\.0/);
 const d=decodeGif(g);assert.equal(d.loop,0);assert.equal(d.frames.length,2,'identical frames merged');assert.equal(d.frames[0].delay,20);assert.deepEqual(d.frames[0].pixels,[0,0,0,0]);assert.deepEqual(d.frames[1].pixels,[1,0,0,1]);
 assert.deepEqual([d.frames[1].x,d.frames[1].y,d.frames[1].w,d.frames[1].h],[0,0,2,2]);
 // a bigger image: many codes, the table fills and restarts (clear code), changed area only on later frames
 const w=131,h=77,pal=Array.from({length:37},(_,i)=>'#'+[i*6,255-i*5,(i*53)%256].map(x=>x.toString(16).padStart(2,'0')).join('').toUpperCase()),frames=[];
 let seed=7;const rnd=()=>(seed=(seed*1103515245+12345)&0x7fffffff)%37;
 for(let f=0;f<4;f++){const a=new Uint8Array(w*h);for(let i=0;i<a.length;i++)a[i]=f===0?rnd():frames[f-1].indices[i];if(f>0)for(let y=20;y<40;y++)for(let x=30+f*10;x<70+f*10;x++)a[y*w+x]=rnd();frames.push({indices:a,delay:5})}
 const big=M.gifEncode({w,h,palette:pal,frames,loop:0}),db=decodeGif(big);assert.equal(db.frames.length,4);assert.equal(db.gct.length,64);
 frames.forEach((f,i)=>assert.deepEqual(db.frames[i].pixels,Array.from(f.indices),'frame '+i));
 assert.ok(db.frames[1].w<w&&db.frames[1].h<h,'later frames keep only the changed area');
 // transparent, play once (no NETSCAPE block), restore-to-background disposal
 const t=M.gifEncode({w:3,h:1,palette:['#000000','#2F5D50'],transparent:0,loop:null,frames:[{indices:new Uint8Array([0,1,0]),delay:5},{indices:new Uint8Array([1,1,1]),delay:5}]}),dt=decodeGif(t);
 assert.equal(dt.loop,null);assert.doesNotMatch(Buffer.from(t).toString('latin1'),/NETSCAPE/);assert.equal(dt.frames[0].transparent,0);assert.equal(dt.frames[0].disposal,2);assert.deepEqual(dt.frames[0].pixels,[-1,1,-1]);assert.deepEqual(dt.frames[1].pixels,[1,1,1]);
});

test('GIF palette from the kit and the logo; nearest colour; transparency',()=>{
 const pal=M.gifPalette(['#2F5D50','#E3B448','#1C1C1E'],'#FAF6EE');assert.equal(pal[0],'#FAF6EE');assert.ok(pal.includes('#2F5D50')&&pal.includes('#E3B448')&&pal.includes('#1C1C1E'));assert.ok(pal.length<=256&&new Set(pal).size===pal.length);
 assert.equal(pal.length,1+3+3*7+3*3,'background, colours, 7 blends each with the background, 3 between each pair');
 assert.deepEqual(M.logoColours(LOGO).sort(),['#1C1C1E','#2F5D50','#E3B448']);
 const q=M.quantize(new Uint8Array([250,246,238,255, 47,93,80,255, 50,90,82,255, 0,0,0,0]),pal,{transparent:-1});assert.deepEqual(Array.from(q.subarray(0,3)),[0,1,1]);
 const qt=M.quantize(new Uint8Array([47,93,80,255,9,9,9,10]),['#000000','#2F5D50'],{transparent:0});assert.deepEqual(Array.from(qt),[1,0]);
});

test('files, the saved key logoMotion that agents-page.js keeps, the card and no AI or media generation call',async()=>{
 const m=model({use:'video'});assert.equal(M.baseName(m),'logo-animato-forno-aurora-disegno-16x9');
 const r=M.readme(m,M.checksOf(m),[M.baseName(m)+'.webm',M.baseName(m)+'.gif'],{date:new Date('2026-10-23T10:00:00Z')});assert.match(r,/nessuna chiamata AI e nessun credito/);assert.match(r,/MP4/);assert.match(r,/2026-10-23/);
 const z=M.bundle([{name:'a/LEGGIMI.txt',data:r}],{date:new Date('2026-10-23T10:00:00Z')});assert.deepEqual(ZIP.unzip(z).map(f=>f.name),['a/LEGGIMI.txt']);
 const rec=M.savedRecord(m,{by:'Ilaria',at:'2026-10-23T10:00:00.000Z'});assert.equal(rec.id,'logo-20261023100000');assert.deepEqual(M.normalize(M.inputOf(rec)),M.normalize({...M.inputOf(rec)}));
 assert.equal(M.normalize(M.inputOf(rec)).proposal,'disegno');
 let doc={schemaVersion:1,conversations:{x:[]},firme:{items:[1]}};const ws={bind:()=>({load:async()=>doc,save:async d=>{doc=d}})};
 for(let i=0;i<12;i++)await M.saveToProject(ws,'p',M.savedRecord(m,{at:'2026-10-23T10:00:'+String(i).padStart(2,'0')+'.000Z'}));
 assert.equal(doc.logoMotion.items.length,10);assert.deepEqual(doc.firme,{items:[1]},'other keys kept');assert.deepEqual(doc.conversations,{x:[]});
 const ap=read('agents-page.js');assert.match(ap,/if\(d\.logoMotion\)out\.logoMotion=d\.logoMotion/);assert.match(ap,/data\.logoMotion=fresh\.logoMotion/);
 const card=crea.card('logoanimato');assert.equal(card.group,'Video');assert.equal(card.inline,'logomotion');assert.match(card.cost,/Nessuna chiamata AI/);assert.ok(look.has(look.CARDS.logoanimato));
 assert.ok(crea.matchServices('gif animata del logo').slice(0,3).some(x=>x.card.id==='logoanimato'));
 const html=read('agency/crea.html');assert.ok(html.indexOf('/lib/logo-motion.js')>html.indexOf('/lib/brand-package.js')&&html.indexOf('/lib/logo-motion.js')>html.indexOf('/lib/reel-studio.js'));
 assert.match(read('agency/crea.js'),/logomotion:\{global:'RadixLogoMotion'/);
 const src=read('lib/logo-motion.js');assert.doesNotMatch(src,/fetch\(|XMLHttpRequest|\/api\/|higgsfield|openai|heygen|anthropic/i);
});
