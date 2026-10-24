'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const pv=require('../lib/ped-views.js'),read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

test('placeholders: writer gaps are found, ordinary brackets are not',()=>{
 assert.deepEqual(pv.placeholders('Testo [caso reale da fornire: azienda] e [da verificare con Francesco: come] poi [link] e [1]'),['[caso reale da fornire: azienda]','[da verificare con Francesco: come]']);
 assert.deepEqual(pv.placeholders('Contratto per [NOME SOCIETÀ] del [DATA]'),['[NOME SOCIETÀ]','[DATA]']);
 assert.deepEqual(pv.placeholders('Nessun segnaposto qui.'),[]);
 assert.ok(pv.postProblems('Ho visto un caso: [caso reale da fornire]. Tu?','LinkedIn').some(p=>p.id==='placeholder'));
});

test('youtubeMeta: title within 100 characters, Education category, short description without gaps',()=>{
 const script='Quando un imprenditore mi dice che vuole delegare, chiedo chi ha firmato gli ultimi contratti.\n\n'+'Parto da un fatto concreto che ho visto. '.repeat(12)+'\n\n[caso reale da fornire: azienda]. Altro.\n\n'+'Terzo blocco. '.repeat(80)+'\n\n#venditaB2B #PMI';
 const m=pv.youtubeMeta({title:'Delegare la vendita: <da dove> parte un imprenditore',copy:script});
 assert.equal(m.title,'Delegare la vendita: da dove parte un imprenditore');assert.equal(m.categoryId,'27');
 assert.ok(m.description.length<=1100,'short');assert.doesNotMatch(m.description,/\[|da fornire/);assert.match(m.description,/^Quando un imprenditore/);assert.match(m.description,/#venditaB2B #PMI$/);
 assert.ok(pv.youtubeMeta({title:'x'.repeat(140),copy:'a'}).title.length<=100);
 const desc='Vuoi delegare la vendita?\n\n1. Primo\n2. Secondo\n\n'+'Contesto. '.repeat(60).trim()+'\n\nCheck-up gratuito: scrivimi su LinkedIn.\n\n#venditaB2B #PMI';
 assert.equal(pv.youtubeMeta({title:'T',copy:desc}).description,desc,'a short text written as a description goes out whole');
 assert.deepEqual(pv.youtubeMeta({title:'T',copy:'a',youtube:{title:'Titolo mio',description:'Descrizione mia',categoryId:'22'}}),{title:'Titolo mio',description:'Descrizione mia',categoryId:'22'});
});

test('createPost: YouTube metadata with title and categoryId goes inline in the mutation',async()=>{
 const {createPost}=require('../api/_buffer.js');let sent=null;const realFetch=global.fetch;
 global.fetch=async(u,o)=>{sent=JSON.parse(o.body);return {ok:true,status:200,json:async()=>({data:{createPost:{post:{id:'p1',dueAt:null}}}})}};
 try{await createPost('k',{channelId:'c',text:'Descrizione',video:'https://blob.test/v.mp4',youtube:{title:'Il "titolo"',categoryId:'27'}});
  assert.match(sent.query,/assets: \[\{ video: \{ url: "https:\/\/blob\.test\/v\.mp4" \} \}\], metadata: \{ youtube: \{ title: "Il \\"titolo\\"", categoryId: "27", madeForKids: false \} \}/);
  await createPost('k',{channelId:'c',text:'Post'});assert.doesNotMatch(sent.query,/metadata/)}
 finally{global.fetch=realFetch}
});

test('server: no publishing with open placeholders; YouTube gets title, category and short description',()=>{
 const src=read('api/_registry-handler.js'),send=src.indexOf('async function publications');
 const guard=src.indexOf('pv.placeholders(String(item.copy)',send),claim=src.indexOf('INSERT INTO rx_publications',send);
 assert.ok(guard>send&&guard<claim,'refused before anything is claimed or sent');
 assert.match(src,/const yt=\/youtube\/i\.test\(String\(item\.channel\|\|''\)\+' '\+String\(r\.channelName\|\|''\)\)\?pv\.youtubeMeta\(item\):null;/);
 assert.match(src,/text:yt\?yt\.description:String\(item\.copy\),dueAt:scheduledAt,video,youtube:yt/);
});

test('PED page: approval and avatar video blocked on open placeholders; Buffer channel follows the post',()=>{
 const src=read('editorial-workspace.js');
 assert.match(src,/function openGaps\(item\)\{return item\?pv\.placeholders\(String\(item\.copy\|\|''\)\+'\\n'\+String\(item\.script\|\|''\)\):\[\]\}/);
 assert.match(src,/if\(decision==='approve'\)\{\{const holes=openGaps\(/);assert.match(src,/try\{\{const holes=openGaps\(x\);if\(holes\.length\)throw/);
 assert.match(src,/const holes=pv\.placeholders\(script\);if\(holes\.length\)\{[^}]*pp-warn/);
 assert.match(src,/const own=pv\.bufferChannelFor\(item\.channel,bufferChannels,saved\);if\(own\)sel\.value=own\.id;/);
});

test('publish preview: a video post shows its video (or that it is missing), YouTube shows title and short description',()=>{
 const src=read('editorial-workspace.js'),fn=src.slice(src.indexOf('function channelPreview('),src.indexOf('function postPreview('));
 const video=fn.indexOf("if(pv.mediaKind(item)==='video')"),images=fn.indexOf("api('GET'");
 assert.ok(video>0&&video<images,'video posts never fall through to «Nessuna immagine allegata»');
 assert.match(fn,/pv\.youtubeMeta\(item\):null;if\(yt\)\{text\.textContent=yt\.description;/);
 assert.match(fn,/const v=document\.createElement\('video'\);v\.src=item\.video\.url;/);
 assert.match(fn,/Manca il video: generalo o collegalo qui sopra/);
});
