'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const pv=require('../lib/ped-views.js'),Z=require('../lib/zip-lite.js');
const names=files=>files.map(f=>f.name),text=(files,n)=>{const f=files.find(x=>x.name===n);return f&&String(f.data)};

test('the zip name is project, date and channel, sanitised',()=>{
 assert.equal(pv.postBundleName({date:'2026-10-20',channel:'LinkedIn'},'Città Verde — Srl'),'citta-verde-srl-2026-10-20-linkedin.zip');
 assert.equal(pv.postBundleName({date:'',channel:'../Insta/gram?'},''),'progetto-senza-data-insta-gram.zip');
 assert.equal(pv.postBundleName({date:'20/10',channel:''},'<b>X</b>'),'b-x-b-senza-data-canale.zip');
});

test('a carousel bundle has the text with hashtags, CTA, channel and date, and one PNG per slide',()=>{
 const item={id:'c1',title:'Tre errori',channel:'Instagram',date:'2026-10-20',time:'18:30',cta:'Prenota una call',hashtags:['marketing','#pmi'],copy:'Primo errore… #Marketing #pmi\n#crescita',slides:'---SLIDES---\n1|#000000|#FFFFFF|Uno\n---FINE---'};
 const png=new Uint8Array([137,80,78,71]),files=pv.postBundle(item,{project:'Radix',timezone:'Europe/Rome',slides:[png,png,png]});
 assert.deepEqual(names(files),['testo.txt','slide-01.png','slide-02.png','slide-03.png','LEGGIMI.txt']);
 const t=text(files,'testo.txt');
 assert.match(t,/^Progetto: Radix\nTitolo: Tre errori\nCanale: Instagram\nData: 2026-10-20 18:30 \(Europe\/Rome\)\nCTA: Prenota una call\nHashtag: #marketing #pmi #Marketing #crescita\n/);
 assert.match(t,/---\n\nPrimo errore… #Marketing #pmi\n#crescita\n$/);assert.equal(files[1].data,png);
 assert.match(text(files,'LEGGIMI.txt'),/- slide-03\.png/);assert.doesNotMatch(text(files,'LEGGIMI.txt'),/Note:/);
 assert.equal(Z.unzip(Z.zip(files)).length,5);
});

test('a single image is grafica.png; the Studio Foto photo is added with its type, or noted when it could not be fetched',()=>{
 const item={title:'Post',channel:'LinkedIn',date:'2026-10-21',copy:'Testo',photo:{requestId:'r1',headline:'Titolo'}};
 const ok=pv.postBundle(item,{slides:[new Uint8Array([1])],photo:{data:new Uint8Array([2]),type:'image/png'},photoPost:new Uint8Array([3])});
 assert.deepEqual(names(ok),['testo.txt','grafica.png','foto.png','foto-con-titolo.png','LEGGIMI.txt']);
 const ko=pv.postBundle(item,{photoError:'HTTP 502'});
 assert.deepEqual(names(ko),['testo.txt','LEGGIMI.txt']);assert.match(text(ko,'LEGGIMI.txt'),/Note:\n- La foto di Studio Foto non è stata scaricata \(HTTP 502\)/);
 assert.equal(names(pv.postBundle(item,{photo:{data:new Uint8Array([2]),type:'application/octet-stream'}}))[1],'foto.jpg');
});

test('a video gets only a link file with the https URL, never the video',()=>{
 const item={title:'Video',channel:'YouTube',date:'2026-10-22',copy:'Script del video',video:{url:'https://cdn.heygen.test/v.mp4'}};
 const files=pv.postBundle(item,{});
 assert.deepEqual(names(files),['testo.txt','video.url.txt','LEGGIMI.txt']);assert.equal(text(files,'video.url.txt'),'https://cdn.heygen.test/v.mp4\n');
 const none=pv.postBundle({...item,video:{url:'http://insecure/v.mp4'}},{});
 assert.deepEqual(names(none),['testo.txt','LEGGIMI.txt']);assert.match(text(none,'LEGGIMI.txt'),/link del video non è salvato/);
});

test('an empty content still gives a readable text file and slide markers never leak into it',()=>{
 const f=pv.postBundle({title:'Idea',channel:'Blog',copy:'Corpo\n---SLIDES---\n1|#000000|#FFFFFF|x\n---FINE---'},{notes:['Grafica non disegnata']});
 assert.equal(text(f,'testo.txt'),'Titolo: Idea\nCanale: Blog\nData: senza data\n\n---\n\nCorpo\n');assert.match(text(f,'LEGGIMI.txt'),/- Grafica non disegnata/);
 assert.match(text(pv.postBundle({title:'X',channel:'Blog',copy:''},{}),'testo.txt'),/\(testo non ancora scritto\)/);
});

test('a video URL survives a new version of the content',()=>{
 const core=require('../editorial-core.js'),s=core.create({id:'p1',summary:'O'});s.briefApproved=true;s.strategyRevision=1;
 core.updateContent(s,{id:'v',title:'Video',channel:'YouTube',date:'2026-10-22',copy:'Script',video:{url:'https://cdn.heygen.test/v.mp4',at:'2026-10-21T10:00:00Z'}});
 core.updateContent(s,{id:'v',title:'Video',channel:'YouTube',date:'2026-10-22',copy:'Script nuovo'});
 assert.equal(s.contents[0].video.url,'https://cdn.heygen.test/v.mp4');
 core.updateContent(s,{id:'w',title:'Altro',channel:'YouTube',copy:'x',video:{url:'javascript:alert(1)'}});assert.equal(s.contents[1].video,undefined);
});
