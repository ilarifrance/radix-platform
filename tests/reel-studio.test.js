'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const R=require('../lib/reel-studio.js'),Z=require('../lib/zip-lite.js');
const root=path.join(__dirname,'..');
const tenths=list=>list.reduce((s,x)=>s+Math.round(x*10),0);

test('questions: goals, formats capped at 1080×1920 with the 9:16 safe zones, lengths and scene counts',()=>{
 assert.deepEqual(R.GOALS.map(g=>g[1]),['Lancio prodotto','Promo','Dietro le quinte','Tutorial','Testimonianza']);
 assert.deepEqual(R.FORMATS.map(f=>[f.id,f.w,f.h]),[['9x16',1080,1920],['1x1',1080,1080],['16x9',1920,1080]]);
 for(const f of R.FORMATS){assert.ok(Math.max(f.w,f.h)<=1920&&f.w*f.h<=1080*1920,f.id)}
 assert.deepEqual(R.format('9x16').safe,{top:.14,bottom:.22,left:.06,right:.14});
 assert.deepEqual(R.DURATIONS,[15,30,45,60]);assert.deepEqual(Object.keys(R.SCENES).map(Number),R.DURATIONS);
 assert.deepEqual(R.normalize({goal:'promo',duration:'30',format:'boh'}),{goal:'promo',format:'9x16',duration:30,style:'box',quality:'full',cta:'Scrivici ora'});
 assert.equal(R.normalize({cta:'  Prenota   ora '}).cta,'Prenota ora');
 assert.deepEqual(R.renderSize('9x16','full'),{w:1080,h:1920,scale:1});assert.deepEqual(R.renderSize('9x16','light'),{w:720,h:1280,scale:2/3});
 assert.deepEqual(R.renderSize('16x9','light'),{w:1280,h:720,scale:2/3});
 assert.equal(R.FPS,30);
});

test('timeline maths: scenes + closing card add up to the chosen length exactly, every scene at least 1,5 s',()=>{
 for(const total of R.DURATIONS)for(const durs of [[3,3,3,3],[1,1,20],[0,'x',-2,5,7],[9,9,9,9,9,9,9,9],[2.37,4.11,3.3]]){
  const tl=R.timeline(durs,total);
  assert.equal(tenths(tl.scenes.map(s=>s.dur))+Math.round(tl.end.dur*10),total*10,total+' '+durs);
  assert.equal(tl.end.end,total);assert.equal(tl.scenes[0].start,0);
  tl.scenes.forEach((s,i)=>{assert.ok(s.dur>=R.SCENE_MIN,'min '+s.dur);if(i)assert.equal(s.start,tl.scenes[i-1].end)});
  assert.equal(tl.end.start,tl.scenes[tl.scenes.length-1].end)}
 assert.equal(R.timeline([1,1,1],15).end.dur,2.5);assert.equal(R.timeline([1,1,1],30).end.dur,3);assert.equal(R.timeline([1],15,9).end.dur,4,'closing card 2-4 s');
 // proportional to the weights
 assert.deepEqual(R.timeline([2,4,6],15).scenes.map(s=>s.dur),[2.1,4.2,6.2]);
 assert.deepEqual(R.share([1,1,1],10,0),[4,3,3]);assert.deepEqual(R.share([1,1,100],60,15),[15,15,30]);assert.deepEqual(R.share([],10,1),[]);
 // one scene set by hand: the others share the rest, the total does not move
 const durs=[3,3,3,3.5],next=R.setDuration(durs,1,6,15);assert.equal(next[1],6);assert.equal(tenths(next),125);next.forEach(d=>assert.ok(d>=1.5));
 assert.equal(R.setDuration(durs,0,99,15)[0],12.5-3*1.5,'clamped so the others keep their minimum');assert.equal(R.setDuration(durs,2,.2,15)[2],1.5);
 assert.deepEqual(R.move(['a','b','c'],0,1),['b','a','c']);assert.deepEqual(R.move(['a','b'],0,-1),['a','b']);
});

test('subtitle cues: at most 2 lines of the format width, inside their scene, contiguous, nothing over the closing card',()=>{
 assert.deepEqual(R.wrapLines('Il pane di semola rimacinata con lievito madre e 24 ore di lievitazione',32),['Il pane di semola rimacinata con','lievito madre e 24 ore di','lievitazione']);
 assert.deepEqual(R.wrapLines('x'.repeat(70),32).map(l=>l.length),[32,32,6]);
 assert.deepEqual(R.cueChunks('Lo impastiamo a mano, ogni giorno',32),[['Lo impastiamo a mano,','ogni giorno']],'two balanced lines');
 assert.equal(R.cueChunks('uno due tre quattro cinque sei sette otto nove dieci undici dodici tredici',20).length,3);
 const scenes=[{subs:['Ogni mattina alle cinque','accendiamo il forno']},{subs:[]},{subs:['Semola rimacinata, lievito madre e tanta pazienza: il pane come una volta, ogni giorno']}];
 const tl=R.timeline([3,3,6],15),list=R.cues(scenes,tl,32);
 assert.equal(list.length,4);assert.deepEqual(list.map(c=>c.scene),[0,0,2,2]);
 for(const c of list){const w=tl.scenes[c.scene];assert.ok(c.start>=w.start-1e-9&&c.end<=w.end+1e-9&&c.end>c.start);assert.ok(c.lines.length<=2&&c.lines.every(l=>l.length<=32));assert.ok(c.end<=tl.end.start)}
 assert.equal(list[0].start,0,'the first cue is on screen from the first frame');assert.equal(list[1].start,list[0].end);assert.equal(list[3].end,tl.scenes[2].end);
 assert.equal(R.cueAt(list,.1),list[0]);assert.equal(R.cueAt(list,tl.end.start+.5),null);
 assert.ok(R.cps({start:0,end:1,lines:['x'.repeat(30)]})>R.CPS_MAX);
});

test('SRT and VTT: numbered cues, the right time stamps, lines kept',()=>{
 const list=[{start:0,end:1.2,lines:['Ogni mattina','alle cinque']},{start:1.2,end:3.456,lines:['accendiamo il forno']},{start:3725.5,end:3727,lines:['fine']}];
 assert.equal(R.stamp(3725.5,','),'01:02:05,500');assert.equal(R.stamp(1.0005,'.'),'00:00:01.001');
 assert.equal(R.srt(list),'1\n00:00:00,000 --> 00:00:01,200\nOgni mattina\nalle cinque\n\n2\n00:00:01,200 --> 00:00:03,456\naccendiamo il forno\n\n3\n01:02:05,500 --> 01:02:07,000\nfine\n');
 const v=R.vtt(list);assert.ok(v.startsWith('WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.200\nOgni mattina\nalle cinque\n\n'));assert.match(v,/\n2\n00:00:01\.200 --> 00:00:03\.456\naccendiamo il forno\n/);
 for(const block of R.srt(list).trim().split('\n\n'))assert.match(block,/^\d+\n\d\d:\d\d:\d\d,\d{3} --> \d\d:\d\d:\d\d,\d{3}\n.+/);
 assert.equal(R.vtt([]),'WEBVTT\n\n');
});

test('safe-zone layout: text, subtitles and the closing card inside the safe area, nothing overlapping',()=>{
 const S=R.safeArea(R.format('9x16'));assert.deepEqual(S,{x:65,y:269,w:864,h:1229});
 assert.equal(1920-(S.y+S.h),Math.round(1920*.22),'bottom: caption and buttons');assert.equal(1080-(S.x+S.w),Math.round(1080*.14),'right: the TikTok column');
 for(const f of R.FORMATS){const L=R.layout(f),boxes=[L.title,L.subs,...Object.values(L.end)];
  for(const b of boxes){assert.ok(R.inside(b,L.safe),f.id+' '+JSON.stringify(b)+' not in '+JSON.stringify(L.safe));assert.ok(b.w>0&&b.h>0)}
  assert.ok(!R.overlap(L.title,L.subs),f.id+' title and subtitles');
  const e=Object.values(L.end);for(let i=0;i<e.length;i++)for(let j=i+1;j<e.length;j++)assert.ok(!R.overlap(e[i],e[j]),f.id+' end '+i+' '+j);
  // 2 subtitle lines of the format width fit their box
  assert.ok(L.sizes.subLine*2+L.sizes.pad*2<=L.subs.h);assert.ok(f.lineMax*L.sizes.sub*.56<=L.safe.w+1,f.id)}
});

test('motion: Ken Burns, pan, slide and fade always cover the frame; entries and the frame at any time',()=>{
 for(const [m] of R.MOTIONS)for(const p of [0,.1,.25,.5,.75,.9,1])for(const [iw,ih] of [[4000,3000],[1080,1920],[800,800],[300,2000]])for(const f of R.FORMATS){
  const r=R.drawRect(iw,ih,f.w,f.h,R.motionAt(m,p));assert.ok(r.x<=1e-6&&r.y<=1e-6&&r.x+r.w>=f.w-1e-6&&r.y+r.h>=f.h-1e-6,m+' '+p+' '+iw+'x'+ih+' '+f.id)}
 assert.equal(R.motionAt('zoom-in',0).scale,1);assert.ok(Math.abs(R.motionAt('zoom-in',1).scale-1.16)<1e-9);assert.ok(R.motionAt('zoom-out',0).scale>R.motionAt('zoom-out',1).scale);
 assert.equal(R.motionAt('pan-left',0).x,1);assert.equal(R.motionAt('pan-left',1).x,-1);assert.ok(Math.abs(R.motionAt('pan-right',.5).x)<1e-9);
 assert.equal(R.ease(0),0);assert.equal(R.ease(1),1);assert.ok(Math.abs(R.ease(.5)-.5)<1e-9);
 assert.deepEqual(R.entry('fade',0,0),{alpha:1,dx:0},'the first scene is on screen at once');assert.equal(R.entry('fade',0,2).alpha,0);assert.equal(R.entry('fade',R.TRANS,2).alpha,1);
 assert.equal(R.entry('slide',0,1).dx,1);assert.equal(R.entry('slide',R.TRANS*2,1).dx,0);assert.deepEqual(R.entry('zoom-in',0,3),{alpha:1,dx:0});
 const tl=R.timeline([3,3,3,3.5],15),mo=['zoom-in','fade','slide','pan-left'];
 const f0=R.frameAt(tl,mo,0);assert.equal(f0.i,0);assert.equal(f0.title,1,'the hook is readable in the first frame');assert.equal(f0.prev,-1);
 const f1=R.frameAt(tl,mo,tl.scenes[1].start+.1);assert.equal(f1.i,1);assert.equal(f1.prev,0);assert.ok(f1.alpha>0&&f1.alpha<1);
 const f2=R.frameAt(tl,mo,tl.scenes[2].start+.1);assert.ok(f2.dx>0&&f2.dx<1);assert.equal(R.frameAt(tl,mo,tl.scenes[3].start+.01).prev,-1,'a cut');
 const fe=R.frameAt(tl,mo,tl.end.start+.1);assert.equal(fe.end,true);assert.ok(fe.fade>0&&fe.fade<1);assert.equal(R.frameAt(tl,mo,99).end,true);assert.ok(R.frameAt(tl,mo,99).p>.999);
});

const FAKE={storyboard:[
 {nome:'Il forno all’alba',idea:'Dal buio del mattino al pane sul banco.',musica:'Calma, acustica',scene:[
  {durata:3,foto:2,movimento:'zoom-in',testo:'Il pane nasce alle 5 del mattino',sottotitoli:['Ogni mattina accendiamo il forno']},
  {durata:4,foto:1,movimento:'dissolvenza',testo:'Semola e lievito madre',sottotitoli:['Semola rimacinata e lievito madre','24 ore di lievitazione']},
  {durata:5,foto:9,movimento:'panoramica',testo:'Sul banco ogni giorno',sottotitoli:'Lo trovi in via Roma 12'}],chiusura:{titolo:'Forno Aurora',sottotitolo:'Via Roma 12, Torino'}},
 {nome:'Il migliore',musica:'energica',scene:[
  {durata:2,foto:1,testo:'Garanzia 100%: il pane più amato di Torino da sempre e per sempre',sottotitoli:['Oltre 5000 clienti soddisfatti','Il migliore di Torino']},
  {durata:2,foto:3,testo:'Sconto del 30%',sottotitoli:['«Il pane più buono che abbia mai mangiato» dice Giulia']},
  {durata:2,testo:'',sottotitoli:[]},{durata:2,foto:2,sottotitoli:['Solo oggi']}],chiusura:{titolo:'Corri'}},
 {nome:'Una sola scena',scene:[{testo:'x'}]},
 {nome:'Senza testo in apertura',musica:'xyz',scene:[{sottotitoli:['Il gancio arriva dai sottotitoli della prima scena']},{testo:'Seconda',movimento:'boh'}]},
 {nome:'Quinta',scene:[{testo:'a'},{testo:'b'}]}]};
const ANS={goal:'lancio',format:'9x16',duration:15,cta:'Passa a trovarci'};
const INPUT=R.inputText({facts:'Pane di semola rimacinata con lievito madre, 24 ore di lievitazione. Apriamo alle 5. Forno Aurora, via Roma 12, Torino.',cta:'Passa a trovarci'});

test('prompt: one call, the photos by number, the facts, hook in 2 s, scene counts, no invented claims; facts and photos required',()=>{
 const p=R.storyboardPrompt(ANS,{facts:'Pane di semola, lievito madre',project:{name:'Forno Aurora'},photos:[{name:'forno.jpg',kind:'image'},{name:'banco.mp4',kind:'video'}],projectFacts:'Aperto dal 1987.'});
 assert.match(p,/3 storyboard diversi/);assert.match(p,/senza avatar e senza voce/);assert.match(p,/«Forno Aurora»/);assert.match(p,/1\. foto «forno\.jpg»\n2\. clip video «banco\.mp4»/);
 assert.match(p,/entro i primi 2 secondi/);assert.match(p,/Da 3 a 4 scene/);assert.match(p,/Durata totale: 15 secondi/);assert.match(p,/Aperto dal 1987/);assert.match(p,/Non inventare numeri, prezzi, sconti/);
 assert.match(p,/RADIX non genera musica/);assert.match(p,/Invito finale scelto \(pulsante\): «Passa a trovarci»/);assert.match(p,/"storyboard"/);assert.match(p,/al massimo 56 caratteri ciascuna/);
 assert.match(R.storyboardPrompt({...ANS,goal:'testimonianza'},{facts:'«Il pane più buono» — Giulia',photos:[{name:'a'}]}),/solo le parole del cliente/);
 assert.throws(()=>R.storyboardPrompt(ANS,{facts:'corto',photos:[{}]}),/almeno 10 caratteri/);
 assert.throws(()=>R.storyboardPrompt(ANS,{facts:'Pane di semola, lievito madre',photos:[]}),/almeno una foto/);
});

test('parse: up to 3 storyboards, photos assigned to scenes, motions read, limits trimmed, hook, numbers, claims and quotes flagged',()=>{
 const list=R.parseStoryboards('Ecco:\n```json\n'+JSON.stringify(FAKE)+'\n```',{answers:ANS,photos:3,input:INPUT});
 assert.equal(list.length,3,'the one with one scene is dropped');assert.deepEqual(list.map(b=>b.name),['Il forno all’alba','Il migliore','Senza testo in apertura']);
 const [a,b,c]=list;
 assert.deepEqual(a.scenes.map(s=>s.photo),[1,0,2],'foto 9 does not exist: round robin');assert.deepEqual(a.scenes.map(s=>s.motion),['zoom-in','fade','pan-right']);
 assert.deepEqual(a.scenes[2].subs,['Lo trovi in via Roma 12']);assert.equal(a.mood,'calma');assert.equal(a.end.cta,'Passa a trovarci','the button is the CTA the person chose');
 assert.deepEqual(a.issues,[],'every number is in the facts: '+JSON.stringify(a.issues));assert.equal(a.adjusted,false);
 assert.equal(b.scenes.length,3,'the empty scene is dropped');assert.ok(b.scenes[0].text.length<=R.TEXT_MAX);
 const kinds=b.issues.map(i=>i.kind+':'+(i.text||i.label||''));
 for(const k of ['number:5000','number:30','number:100','claim:«il migliore»','claim:garanzia','claim:sconto o promozione','claim:scadenza o disponibilità limitata','claim:recensioni o soddisfazione'])assert.ok(kinds.includes(k),k+' in '+kinds.join(' | '));
 assert.ok(b.issues.some(i=>i.kind==='length'&&/Scena 1/.test(i.label)));assert.ok(b.issues.some(i=>i.kind==='quote'&&/più buono/.test(i.text)));
 assert.equal(c.issues[0].kind,'hook');assert.equal(c.scenes[0].text,'Il gancio arriva dai sottotitoli','from the first subtitle, cut at a whole word');
 assert.equal(c.mood,'xyz');assert.equal(c.scenes[1].motion,'pan-right','unknown motion: the cycle');
 assert.match(R.issueText(c.issues[0]),/nei primi 2 secondi/);assert.match(R.issueText({kind:'number',text:'5000'}),/«5000» non compare nei fatti/);
 // the testimonial quoted word for word is fine
 const t=R.parseStoryboards(JSON.stringify({storyboard:[{nome:'T',scene:[{testo:'Dicono di noi',sottotitoli:['«Il pane più buono che abbia mai mangiato»']},{testo:'Giulia, cliente'}]}]}),{answers:{...ANS,goal:'testimonianza'},photos:1,input:'«Il pane più buono che abbia mai mangiato» — Giulia'});
 assert.deepEqual(t[0].issues,[]);assert.deepEqual(t[0].scenes.map(s=>s.photo),[0,0]);
 assert.deepEqual(R.parseStoryboards('niente JSON',{answers:ANS}),[]);
 // fast subtitles are flagged
 const fast=R.parseStoryboards(JSON.stringify({storyboard:[{nome:'F',scene:[{durata:1,testo:'Uno',sottotitoli:['Una frase molto lunga che nessuno riesce a leggere in un secondo e mezzo']},{durata:30,testo:'Due'}]}]}),{answers:ANS,photos:1,input:''});
 assert.ok(fast[0].issues.some(i=>i.kind==='fast'&&i.scene===0),JSON.stringify(fast[0].issues));assert.equal(fast[0].adjusted,true);
});

test('files: video, cover, SRT, VTT and the storyboard text in one zip',()=>{
 const [b]=R.parseStoryboards(JSON.stringify(FAKE),{answers:ANS,photos:3,input:INPUT});
 const files=R.bundleFiles(b,{webm:new Uint8Array([0x1a,0x45,0xdf,0xa3]),mp4:new Uint8Array([0,0,0,24]),cover:new Uint8Array([137,80,78,71])},{answers:ANS,brand:{name:'Forno Aurora'},date:'2026-10-22'});
 const back=Z.unzip(Z.zip(files));
 assert.deepEqual(back.map(f=>f.name),['reel-forno-aurora-il-forno-all-alba.mp4','reel-forno-aurora-il-forno-all-alba.webm','copertina.png','sottotitoli.srt','sottotitoli.vtt','storyboard.txt']);
 const srt=new TextDecoder().decode(back[3].data),vtt=new TextDecoder().decode(back[4].data),txt=new TextDecoder().decode(back[5].data);
 assert.match(srt,/^1\n00:00:00,000 --> 00:00:0\d,\d{3}\nOgni mattina\naccendiamo il forno\n/);assert.ok(vtt.startsWith('WEBVTT\n\n'));
 assert.match(txt,/REEL · Forno Aurora/);assert.match(txt,/SCENA 1 · 0–\d,\d s · Zoom avanti · immagine 2/);assert.match(txt,/CHIUSURA · 12,5–15 s/);assert.match(txt,/Pulsante: Passa a trovarci/);assert.match(txt,/RADIX non genera musica/);
 assert.deepEqual(R.bundleFiles(b,{},{answers:ANS}).map(f=>f.name),['sottotitoli.srt','sottotitoli.vtt','storyboard.txt'],'no video yet: only the texts');
 // MediaRecorder types: WebM first, MP4 when the browser can
 assert.deepEqual(R.pickMimes(t=>/^video\/webm;codecs=vp8,opus$|^video\/mp4;codecs=avc1$/.test(t)),[{ext:'webm',mime:'video/webm;codecs=vp8,opus'},{ext:'mp4',mime:'video/mp4;codecs=avc1'}]);
 assert.deepEqual(R.pickMimes(t=>t==='video/webm'||t==='video/mp4'),[{ext:'webm',mime:'video/webm'}],'no MP4 without H.264');assert.deepEqual(R.pickMimes(()=>{throw Error('x')}),[]);
});

// A minimal live WebM like MediaRecorder writes: EBML header, Segment of unknown size, Info without Duration, a Cluster.
function liveWebm(){const ebml=[0x1A,0x45,0xDF,0xA3,0x84,0x42,0x82,0x81,0x77],info=[0x2A,0xD7,0xB1,0x83,0x0F,0x42,0x40,0x4D,0x80,0x84,0x52,0x41,0x44,0x58],cluster=[0x1F,0x43,0xB6,0x75,0x01,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xE7,0x81,0x00];
 return new Uint8Array([...ebml,0x18,0x53,0x80,0x67,0x01,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0x15,0x49,0xA9,0x66,0x80|info.length,...info,...cluster])}
test('WebM duration: written into Segment › Info of a live recording, replaced when present, untouched when not a WebM',()=>{
 const live=liveWebm();assert.equal(R.webmDurationOf(live),null);
 const fixed=R.webmDuration(live,15);assert.equal(R.webmDurationOf(fixed),15);assert.equal(fixed.length,live.length+11+7,'Duration element plus the 8-byte Info size');
 assert.deepEqual([...fixed.slice(-15)],[...live.slice(-15)],'the clusters are untouched');
 assert.equal(R.webmDurationOf(R.webmDuration(fixed,30.5)),30.5,'an existing duration is replaced in place');assert.equal(R.webmDuration(fixed,30.5).length,fixed.length);
 const junk=new Uint8Array([1,2,3]);assert.equal(R.webmDuration(junk,3),junk);
 // a known-size Segment grows by the same amount
 const known=liveWebm();known.set([0x01,0,0,0,0,0,0,known.length-9-12],13);const k2=R.webmDuration(known,15);assert.equal(R.webmDurationOf(k2),15);assert.equal(k2[20],known[20]+18);
});

test('save: reels in the agents document, every other key kept, retried on a conflict; reopened with the photos wrapped',async()=>{
 class ConflictError extends Error{}
 let stored={schemaVersion:1,conversations:{'video-producer':[{role:'user',content:'ciao'}]},prefs:{a:1},adCreatives:{schemaVersion:1,items:[{id:'ad'}]},productSheets:{schemaVersion:1,items:[{id:'ps'}]},reels:{schemaVersion:1,items:[{id:'old',name:'Vecchio'}]}},conflicts=1;
 const ws={ConflictError,bind:(pid,mod)=>{assert.equal(pid,'forno');assert.equal(mod,'agents');return {load:async()=>JSON.parse(JSON.stringify(stored)),save:async x=>{if(conflicts-->0)throw new ConflictError('x');stored=x;return {revision:2}}}}};
 const [b]=R.parseStoryboards(JSON.stringify(FAKE),{answers:ANS,photos:3,input:INPUT});
 const rec=R.savedRecord(b,{answers:{...ANS,style:'accent'},photos:[{name:'forno.jpg',kind:'image',img:{}},{name:'banco.mp4',kind:'video'}],by:'Francesco',at:'2026-10-22T10:00:00.000Z'});
 assert.equal(rec.id,'reel-20261022100000-il-forno-all-alba');assert.equal(rec.style,'accent');assert.deepEqual(rec.photos,[{name:'forno.jpg',kind:'image'},{name:'banco.mp4',kind:'video'}],'names only, never the pixels');
 assert.ok(!JSON.stringify(rec).includes('data:'),'no media in the record');
 await R.saveToProject(ws,'forno',rec);
 assert.deepEqual(stored.conversations,{'video-producer':[{role:'user',content:'ciao'}]});assert.deepEqual(stored.prefs,{a:1});assert.deepEqual(stored.adCreatives.items,[{id:'ad'}]);assert.deepEqual(stored.productSheets.items,[{id:'ps'}]);
 assert.deepEqual(stored.reels.items.map(x=>x.id),['old',rec.id]);
 await R.saveToProject(ws,'forno',{...rec,name:'Rinominato'});assert.equal(stored.reels.items.length,2,'same id replaced');
 let s={schemaVersion:1,items:[]};for(let i=0;i<25;i++)s=R.addRecord(s,{id:'r'+i});assert.equal(s.items.length,20);
 const back=R.fromRecord(rec,2);assert.deepEqual(back.scenes.map(x=>x.photo),[1,0,0],'photo 3 wraps onto the 2 photos uploaded now');assert.equal(back.end.cta,'Passa a trovarci');assert.equal(back.scenes[1].motion,'fade');
 assert.deepEqual(R.fromRecord(rec,0).scenes.map(x=>x.photo),[-1,-1,-1],'no photos: brand background');
 await assert.rejects(()=>R.saveToProject(null,'x',rec),/Archivio del progetto non disponibile/);
 const page=fs.readFileSync(path.join(root,'agents-page.js'),'utf8');
 assert.match(page,/if\(d\.reels\)out\.reels=d\.reels;/);assert.match(page,/data\.productSheets=fresh\.productSheets;data\.reels=fresh\.reels;/);assert.match(page,/data\.reels=fresh\.reels;data\.newsletters=fresh\.newsletters;/);
});

test('the only paid call sits behind its confirmation; image-to-video is a labelled TODO with no provider call',()=>{
 const src=fs.readFileSync(path.join(root,'lib/reel-studio.js'),'utf8');
 const confirms=src.split('root.confirm(').slice(1).map(x=>x.split('))return;')[0]);assert.equal(confirms.length,1);
 assert.match(confirms[0],/3 storyboard con il Video Producer AI\? È una sola chiamata AI: usa crediti API\. Il video poi si crea qui nel browser, senza crediti\./);
 assert.ok(src.indexOf('rt.reply({role:AGENT')>src.indexOf(confirms[0]));assert.equal(src.split('rt.reply(').length,2,'one AI call');
 assert.ok(!/\/api\/higgsfield|\/api\/heygen|\/api\/integrations|fetch\(/.test(src),'no provider or network call in the studio');
 assert.ok(!/https?:\/\//.test(src),'no external URLs');
 assert.match(src,/TODO\(higgsfield-i2v\): api\/_higgsfield\.js only exposes text → image/);
 assert.equal(R.AI_MOTION.available,false);assert.match(R.AI_MOTION.note,/non ancora collegato.*1 generazione video per scena, a pagamento, con conferma/);
 const hf=fs.readFileSync(path.join(root,'api/_higgsfield.js'),'utf8');assert.ok(!/image.?to.?video|i2v/i.test(hf),'the connector still has no image-to-video: keep the TODO until it does');
 assert.ok(!/speechSynthesis|SpeechSynthesis/.test(src),'no voice synthesis');
});

test('the card «Reel e video prodotto» opens the studio inline in «Video»',()=>{
 const core=require('../agency/crea-core.js'),look=require('../agency/marketing-look.js'),c=core.card('reel');
 assert.equal(c.group,'Video');assert.equal(c.inline,'reel');assert.equal(c.title,'Reel e video prodotto');assert.match(c.cost,/^Una chiamata AI al Video Producer per i 3 storyboard, con conferma\. Il video si crea nel browser, senza crediti\.$/);
 assert.match(c.hint,/non genera musica né voce/);assert.equal(core.linkFor(c,'radix'),null);assert.ok(look.has(look.CARDS.reel));
 assert.deepEqual(core.fromQuery('?open=reel'),{group:'Video',open:'reel'});
 const js=fs.readFileSync(path.join(root,'agency/crea.js'),'utf8');
 assert.match(js,/reel:\{global:'RadixReelStudio'[^}]*agent:'video-producer'\}/);
 assert.match(js,/S\.reelStudio\(\{project,profile:current\.profile,memoryScope,projectId:current\.id,workspace:ws,agentsUrl:'\/agents\.html\?agent=video-producer&project='\+pid\}\)/);
 const html=fs.readFileSync(path.join(root,'agency/crea.html'),'utf8'),at=s=>html.indexOf(s);
 assert.ok(at('/lib/ad-studio.js')>0&&at('/lib/ad-studio.js')<at('/lib/reel-studio.js')&&at('/lib/zip-lite.js')<at('/lib/reel-studio.js')&&at('/lib/copy-checks.js')<at('/lib/reel-studio.js')&&at('/lib/reel-studio.js')<at('/agency/crea.js'));
 const css=fs.readFileSync(path.join(root,'shell/crea.css'),'utf8');assert.match(css,/\.cr-panel \.rs-strip\{[^}]*overflow-x:auto/);assert.match(css,/\.cr-panel \.rs-body\{display:grid/);
});
