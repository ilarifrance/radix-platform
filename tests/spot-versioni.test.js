'use strict';
// Versioni spot dello studio Reel: 6 s (bumper), 15 s e 30 s dallo storyboard scelto, senza chiamate AI. Dati finti.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const R=require('../lib/reel-studio.js'),Z=require('../lib/zip-lite.js');
const root=path.join(__dirname,'..');
const tenths=list=>list.reduce((s,x)=>s+Math.round(x*10),0);

// A 30 s storyboard of a fake bakery: scene 2 has no picture and no on-screen text, scene 6 is the offer.
const board=()=>({id:'s1',name:'Il pane all’alba',idea:'Dal forno al banco',mood:'calma',scenes:[
 {text:'Il pane delle cinque del mattino',subs:['Ogni mattina alle cinque accendiamo il forno'],dur:3,photo:0,motion:'zoom-in'},
 {text:'',subs:['Semola rimacinata e lievito madre, ventiquattro ore di pazienza'],dur:5,photo:-1,motion:'fade'},
 {text:'Lievito madre',subs:['Impastiamo a mano','e lasciamo riposare la pasta tutta la notte'],dur:6,photo:1,motion:'pan-left'},
 {text:'Crosta che canta',subs:['Una crosta che scrocchia'],dur:5,photo:2,motion:'zoom-out'},
 {text:'In via Roma 12',subs:['Ti aspettiamo in negozio a Torino'],dur:5,photo:3,motion:'slide'},
 {text:'Ordina online',subs:['Lo prenoti online e lo ritiri caldo'],dur:3,photo:-1,motion:'zoom-in'}],
 end:{title:'Forno Aurora',cta:'Prenota il pane',sub:'Torino, via Roma 12',logo:false},issues:[]});
const ALL={lengths:[6,15,30],formats:['9x16','1x1','16x9']};

test('every version: hook first from 0 s, closing card with logo and call to action, exact length, scenes at least 1,5 s',()=>{
 const list=R.spotVersions(board(),ALL,{duration:30});
 assert.equal(list.length,9);assert.deepEqual(list.map(v=>v.id).slice(0,3),['6s-9x16','15s-9x16','30s-9x16'],'9:16 first, short to long');
 for(const v of list){const p=R.spotPlan(v,{format:v.format,style:'box'});
  assert.equal(v.kept[0],0,v.id+' keeps the hook');assert.equal(v.board.scenes[0].text,'Il pane delle cinque del mattino');assert.equal(p.tl.scenes[0].start,0);
  assert.ok(p.tl.scenes[0].dur>=R.HOOK_SECONDS||v.board.scenes.length===1,v.id+' hook readable for 2 s');
  assert.equal(tenths(p.tl.scenes.map(s=>s.dur))+Math.round(p.tl.end.dur*10),v.length*10,v.id+' adds up');assert.equal(p.tl.total,v.length);
  p.tl.scenes.forEach(s=>assert.ok(s.dur>=R.SCENE_MIN,v.id+' min '+s.dur));
  assert.equal(v.board.end.logo,true,'logo forced on even if the reel had it off');assert.equal(v.board.end.cta,'Prenota il pane');
  assert.deepEqual(v.kept.slice().sort((a,b)=>a-b),v.kept,'original order kept');assert.deepEqual([...v.kept,...v.dropped].sort((a,b)=>a-b),[0,1,2,3,4,5]);
  for(const c of p.cues){assert.ok(R.cps(c)<=R.CPS_MAX,v.id+' cue at '+R.cps(c)+' cps');assert.ok(c.end<=p.tl.end.start+1e-9,'no subtitle over the closing card')}
  assert.equal(p.answers.duration,v.length);assert.equal(p.fmt.id,v.format)}
});

test('6 s bumper: hook + one product shot (a scene with a picture) + 2 s closing card, no line under the button',()=>{
 const v=R.spotVersion(board(),6,'9x16',{duration:30}),p=R.spotPlan(v,{});
 assert.deepEqual(v.kept,[0,2],'scene 2 has no picture: the product shot is scene 3');assert.equal(v.product,2);
 assert.deepEqual(p.tl.scenes.map(s=>s.dur),[2,2]);assert.deepEqual(p.tl.end,{start:4,dur:2,end:6});
 assert.equal(v.board.end.sub,'');assert.equal(v.board.end.title,'Forno Aurora');
 // subtitles only as far as they fit: the second line goes, the first is cut without ending on «il»
 assert.deepEqual(v.board.scenes[1].subs,['Impastiamo a mano']);assert.ok(!/\s(il|di|a)$/.test(v.board.scenes[0].subs[0]||''),v.board.scenes[0].subs[0]);
 assert.ok(v.notes.length>=1&&v.notes.every(n=>n.kind==='short'||n.kind==='nosubs'));
 // a storyboard with no picture: the best other scene (the last one, with text: often the offer)
 const b=board();b.scenes.forEach(s=>s.photo=-1);assert.deepEqual(R.spotVersion(b,6,'9x16').kept,[0,5]);
 // a one-scene storyboard: hook + closing card
 const one=board();one.scenes=one.scenes.slice(0,1);const v1=R.spotVersion(one,6,'1x1'),p1=R.spotPlan(v1,{});assert.deepEqual(v1.kept,[0]);assert.equal(p1.tl.scenes[0].dur,4);
 assert.throws(()=>R.spotVersion({scenes:[]},6,'9x16'),/non ha scene/);
});

test('15 and 30 s: scenes by priority, at most 4 and 6, the 30 s keeps everything when the reel is 30 s',()=>{
 const b=board(),n=b.scenes.length;
 assert.equal(R.scenePriority(b.scenes[0],0,n),Infinity);
 assert.ok(R.scenePriority(b.scenes[3],3,n)>R.scenePriority(b.scenes[1],1,n),'picture and text beat a bare scene');
 assert.ok(R.scenePriority(b.scenes[5],5,n)>R.scenePriority({subs:[]},5,n)-1e-9);
 const v15=R.spotVersion(b,15,'9x16',{duration:30});assert.equal(v15.kept.length,4);assert.deepEqual(v15.kept,[0,2,3,4]);assert.deepEqual(v15.dropped,[1,5]);
 const v30=R.spotVersion(b,30,'9x16',{duration:30});assert.deepEqual(v30.kept,[0,1,2,3,4,5]);assert.deepEqual(R.spotPlan(v30,{}).tl.scenes.map(s=>s.dur),[3,5,6,5,5,3],'same timing as the reel');
 assert.equal(v30.notes.length,0);assert.equal(v30.stretched,false);
 // a 15 s reel asked as 30 s: same scenes, longer, flagged
 const short=board();short.scenes=short.scenes.slice(0,4);const s30=R.spotVersion(short,30,'9x16',{duration:15});assert.equal(s30.stretched,true);assert.equal(s30.kept.length,4);
 // deterministic: same input, same output
 assert.deepEqual(R.spotVersion(board(),15,'16x9',{duration:30}),R.spotVersion(board(),15,'16x9',{duration:30}));
 // the input board is not changed
 const before=JSON.stringify(b);R.spotVersions(b,ALL,{duration:30});assert.equal(JSON.stringify(b),before);
});

test('subtitles over CPS_MAX are shortened (lines first, then words, after a comma when possible) and flagged',()=>{
 assert.deepEqual(R.fitSubs(['Ciao a tutti'],2,28),['Ciao a tutti'],'short enough: untouched');
 assert.deepEqual(R.fitSubs(['Uno breve','e un secondo troppo lungo per due secondi di scena'],2,28),['Uno breve']);
 assert.deepEqual(R.fitSubs(['Semola rimacinata e lievito madre, ventiquattro ore di pazienza'],2,28),['Semola rimacinata e lievito madre']);
 assert.deepEqual(R.fitSubs(['Supercalifragilistichespiralidoso straordinariamente'],.5,28),[],'nothing fits: no subtitle');
 assert.deepEqual(R.fitSubs([],3,28),[]);
 for(const [d,lm] of [[1.5,28],[2,36],[3.3,42]]){const out=R.fitSubs(['Semola rimacinata e lievito madre, ventiquattro ore di pazienza e un forno a legna acceso alle cinque'],d,lm);
  R.cues([{subs:out}],{scenes:[{start:0,dur:d,end:d}]},lm).forEach(c=>assert.ok(R.cps(c)<=R.CPS_MAX))}
 const v=R.spotVersion(board(),6,'9x16');const note=v.notes.find(x=>x.scene===2);assert.equal(note.kind,'short');assert.match(R.spotNoteText(note),/^Scena 3: sottotitoli accorciati da «Impastiamo a mano \/ e lasciamo/);
 assert.match(R.spotNoteText({kind:'nosubs',scene:0,from:'troppo',to:''}),/sottotitoli tolti/);
});

test('formats: the safe-zone layout of each format, subtitles wrapped at its width',()=>{
 for(const f of R.FORMATS){const v=R.spotVersion(board(),15,f.id,{duration:30}),p=R.spotPlan(v,{format:'9x16'});
  assert.equal(p.fmt.id,f.id,'the version format wins over the reel format');assert.deepEqual(p.L,R.layout(f));
  p.cues.forEach(c=>c.lines.forEach(l=>assert.ok([...l].length<=f.lineMax)));
  for(const r of [p.L.title,p.L.subs,p.L.end.logo,p.L.end.button])assert.ok(R.inside(r,p.L.safe),f.id)}
});

test('selection: lengths × formats or only the ticked cells; settings saved in the reels record, no media',()=>{
 assert.deepEqual(R.SPOT_DEFAULT,{lengths:[6,15,30],formats:['9x16']});
 assert.deepEqual(R.spotSelection({lengths:['30',6,45],formats:['16x9','boh','9x16']}),{lengths:[6,30],formats:['9x16','16x9']});
 const sel={lengths:[6,15],formats:['9x16','1x1'],pairs:['6s-9x16','15s-1x1','30s-9x16','x']};
 assert.deepEqual(R.spotSelection(sel).pairs,['6s-9x16','15s-1x1']);
 assert.deepEqual(R.spotVersions(board(),sel).map(v=>v.id),['6s-9x16','15s-1x1']);
 assert.deepEqual(R.spotVersions(board(),{lengths:[],formats:['9x16']}),[]);
 const rec=R.savedRecord(board(),{answers:{duration:30},photos:[{name:'pane.jpg'}],at:'2026-10-23T09:00:00.000Z',spot:sel});
 assert.deepEqual(rec.spot,{lengths:[6,15],formats:['9x16','1x1'],pairs:['6s-9x16','15s-1x1'],at:'2026-10-23T09:00:00.000Z'});
 assert.ok(!/webm|mp4|data:/i.test(JSON.stringify(rec.spot)));
 assert.equal(R.savedRecord(board(),{at:'2026-10-23T09:00:00.000Z'}).spot,undefined,'no spot key when nothing was chosen');
 // saving again with the same id replaces the record instead of adding one
 const again=R.savedRecord(board(),{id:rec.id,spot:{lengths:[30],formats:['16x9']}});assert.equal(again.id,rec.id);
 const store=R.addRecord(R.addRecord({items:[]},rec),again);assert.equal(store.items.length,1);assert.deepEqual(store.items[0].spot.lengths,[30]);
 assert.notEqual(R.savedRecord(board(),{id:'../x'}).id,'../x','a strange id is not used');
 // reopened from the project: the choices come back
 assert.deepEqual(R.fromRecord(rec,4).spot,{lengths:[6,15],formats:['9x16','1x1'],pairs:['6s-9x16','15s-1x1']});
 assert.equal(R.fromRecord(R.savedRecord(board(),{}),4).spot,undefined);
});

test('files: one folder per version with videos, .srt and .vtt, plus the summary; the zip reads back',()=>{
 const list=R.spotVersions(board(),{lengths:[6,15],formats:['9x16','16x9']},{duration:30}),fake=new Uint8Array([26,69,223,163,1,2,3]);
 const media={'6s-9x16':{webm:fake,mp4:fake},'15s-9x16':{webm:fake},'6s-16x9':{webm:fake}};
 const files=R.spotFiles(list,media,{brand:{name:'Forno Aurora'},date:'2026-10-23'}),names=files.map(f=>f.name);
 assert.ok(names.includes('spot-6s-9x16/spot-forno-aurora-il-pane-all-alba-6s-9x16.mp4'),names.join('\n'));
 assert.ok(names.includes('spot-6s-9x16/spot-forno-aurora-il-pane-all-alba-6s-9x16.webm'));
 for(const v of list){assert.ok(names.includes('spot-'+v.id+'/sottotitoli.srt'));assert.ok(names.includes('spot-'+v.id+'/sottotitoli.vtt'))}
 assert.ok(!names.some(n=>/15s-16x9.*\.(webm|mp4)$/.test(n)),'no video file for a version not recorded');
 assert.equal(names[names.length-1],'versioni-spot.txt');
 const srt=files.find(f=>f.name==='spot-6s-9x16/sottotitoli.srt').data;assert.match(srt,/^1\n00:00:00,000 --> /);
 const last=srt.trim().split('\n\n').pop().split('\n')[1].split(' --> ')[1];assert.ok(last<='00:00:04,000','no cue after 4 s in the bumper: '+last);
 assert.ok(files.find(f=>f.name==='spot-6s-9x16/sottotitoli.vtt').data.startsWith('WEBVTT\n\n'));
 const txt=files.find(f=>f.name==='versioni-spot.txt').data;
 assert.match(txt,/^VERSIONI SPOT · Forno Aurora\nDallo storyboard «Il pane all’alba» · 2026-10-23/);assert.match(txt,/6 S · BUMPER · 9:16\n- 0–2 s · scena 1 \(gancio\)/);assert.match(txt,/\(prodotto\)/);
 assert.match(txt,/chiusura: logo e «Prenota il pane»/);assert.match(txt,/Scene tolte: 2, 4, 5, 6/);assert.match(txt,/VOCE\nDa collegare/);
 const back=Z.unzip(Z.zip(files));assert.equal(back.length,files.length);assert.deepEqual([...back.find(f=>/\.mp4$/.test(f.name)).data],[...fake]);
});

test('voice-over is shown as not wired, and the studio makes no AI call for the versions',()=>{
 assert.equal(R.VOICE.available,false);assert.match(R.VOICE.note,/^Da collegare: .*TTS.*a pagamento/);
 const src=fs.readFileSync(path.join(root,'lib','reel-studio.js'),'utf8'),ui=src.slice(src.indexOf('// ---- spot versions: 6 s, 15 s and 30 s from the chosen storyboard'));
 assert.ok(ui.length>1000,'the spot UI is there');
 assert.ok(!/rt\.reply|RadixAgents|askConfirm|fetch\(|speechSynthesis/.test(ui),'no AI call, no paid step, no fake voice in the spot block');
 for(const s of ['Versioni spot','Registra le versioni','Scarica tutto (.zip)','Salva le versioni nel progetto','da collegare','Annulla'])assert.ok(ui.includes(s),s);
 assert.match(ui,/record\(P,assets\(\)/,'the same MediaRecorder path as the reel');
 const css=fs.readFileSync(path.join(root,'shell','crea.css'),'utf8');for(const c of ['.sv-matrix','.sv-bar','.sv-card','.rs-spot[hidden]'])assert.ok(css.includes(c),c);
});
