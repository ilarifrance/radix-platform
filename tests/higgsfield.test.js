'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const hf=require('../api/_higgsfield.js'),auth=require('../api/_auth.js');
const res=()=>({code:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(v){this.body=v;return this}});
const ID='3f0c2c9e-6b1d-4c55-9a51-1f2e3d4c5b6a';

test('credentials accept ID:SECRET in one value or split across two variables',()=>{
 assert.equal(hf.credentials({}),'');
 assert.equal(hf.credentials({HIGGSFIELD_API_KEY:' id:sec '}),'id:sec');
 assert.equal(hf.credentials({HIGGSFIELD_API_KEY:'id',HIGGSFIELD_API_SECRET:'sec'}),'id:sec');
 assert.equal(hf.credentials({HIGGSFIELD_API_KEY:'id:sec',HIGGSFIELD_API_SECRET:'other'}),'id:sec');
 assert.equal(hf.credentials({HIGGSFIELD_API_KEY:'onlykey'}),'onlykey');
});

test('model path is overridable but never an arbitrary URL',()=>{
 assert.equal(hf.modelPath({}),'higgsfield-ai/soul/standard');
 assert.equal(hf.modelPath({HIGGSFIELD_IMAGE_MODEL:'/higgsfield-ai/soul/v2/standard'}),'higgsfield-ai/soul/v2/standard');
 for(const bad of ['https://evil.example/x','../requests/x','a b/c','single'])assert.equal(hf.modelPath({HIGGSFIELD_IMAGE_MODEL:bad}),'higgsfield-ai/soul/standard');
});

test('generate body validates prompt and aspect ratio',()=>{
 assert.throws(()=>hf.generateBody({prompt:'  '}),/prompt/);
 assert.throws(()=>hf.generateBody({prompt:'x'.repeat(2001)}),/troppo lungo/);
 assert.deepEqual(hf.generateBody({prompt:' lago ',aspectRatio:'9:16'}),{prompt:'lago',aspect_ratio:'9:16',num_images:1});
 assert.equal(hf.generateBody({prompt:'x',aspectRatio:'7:3'}).aspect_ratio,'4:5');
});

test('status summary keeps only https image URLs and explains nsfw',()=>{
 const s=hf.summarize({status:'completed',request_id:ID,images:[{url:'https://cdn.example/a.png'},{url:'javascript:alert(1)'},null]});
 assert.deepEqual(s,{requestId:ID,status:'completed',done:true,images:['https://cdn.example/a.png'],error:null});
 assert.equal(hf.summarize({status:'in_progress'}).done,false);
 assert.match(hf.summarize({status:'nsfw'}).error,/filtro/);
});

test('route needs a session and a key, then calls Higgsfield with the Key header',async()=>{
 const origUser=auth.getSessionUser,origFetch=global.fetch,origKey=process.env.HIGGSFIELD_API_KEY,origSecret=process.env.HIGGSFIELD_API_SECRET,calls=[];
 try{
  auth.getSessionUser=()=>null;let r=res();await hf({method:'GET',query:{}},r);assert.equal(r.code,401);
  auth.getSessionUser=()=>({uid:1});delete process.env.HIGGSFIELD_API_KEY;delete process.env.HIGGSFIELD_API_SECRET;r=res();await hf({method:'GET',query:{}},r);assert.equal(r.code,503);
  process.env.HIGGSFIELD_API_KEY='kid:ksecret';
  global.fetch=async(url,opts)=>{calls.push({url,opts});const body=/status$/.test(url)?{status:'completed',request_id:ID,images:[{url:'https://cdn.example/i.png'}]}:{status:'queued',request_id:ID};return {ok:true,status:200,json:async()=>body}};
  r=res();await hf({method:'POST',query:{},body:JSON.stringify({action:'generate',prompt:'lago',aspectRatio:'1:1',requestKey:ID})},r);
  assert.equal(r.code,200);assert.equal(r.body.requestId,ID);assert.equal(r.body.done,false);
  assert.equal(calls[0].url,'https://api.higgsfield.ai/higgsfield-ai/soul/standard');
  assert.equal(calls[0].opts.headers.authorization,'Key kid:ksecret');assert.equal(calls[0].opts.headers['idempotency-key'],ID);
  assert.deepEqual(JSON.parse(calls[0].opts.body),{prompt:'lago',aspect_ratio:'1:1',num_images:1});
  r=res();await hf({method:'GET',query:{action:'status',id:ID}},r);
  assert.equal(calls[1].url,'https://api.higgsfield.ai/requests/'+ID+'/status');assert.deepEqual(r.body.images,['https://cdn.example/i.png']);
  r=res();await hf({method:'GET',query:{action:'status',id:'../x'}},r);assert.equal(r.code,400);assert.equal(calls.length,2);
  global.fetch=async()=>({ok:false,status:402,json:async()=>({detail:'no balance'})});
  r=res();await hf({method:'POST',query:{},body:{action:'generate',prompt:'x'}},r);assert.equal(r.code,402);assert.match(r.body.error,/saldo/);
  assert.ok(!JSON.stringify(r.body).includes('ksecret'));
 }finally{auth.getSessionUser=origUser;global.fetch=origFetch;if(origKey===undefined)delete process.env.HIGGSFIELD_API_KEY;else process.env.HIGGSFIELD_API_KEY=origKey;if(origSecret!==undefined)process.env.HIGGSFIELD_API_SECRET=origSecret}
});

test('art director output offers the Higgsfield image tool with a prompt from the text',()=>{
 const media=require('../lib/radix-agent-media.js');
 const p=media.imagePrompt('Idea visiva: ritratto in ufficio\n---SLIDES---\n1|#000|#fff|x\n---FINE---',{summary:'Consulenza per PMI'});
 assert.match(p,/ritratto in ufficio/);assert.match(p,/Consulenza per PMI/);assert.ok(!/SLIDES/.test(p));
 assert.equal(typeof media.imageTool,'function');
});

test('Studio Foto: answers become three framings of one prompt, brand colours from the identity, no faces by default',()=>{
 const studio=require('../lib/image-studio.js');
 assert.throws(()=>studio.prompts({},{concept:'corto'}),/comunicare/);
 const list=studio.prompts({light:'warm golden-hour light',ratio:'9:16'},{concept:'Il costo nascosto della delega mancata',project:{kind:'Consulenza per PMI'},guide:{cover:'#0B1F3A',page:'#F4F1EA',key:'#C8A96A',accent:'#C8A96A'}});
 assert.equal(list.length,3);assert.deepEqual(list.map(x=>x.label),studio.VARIANTS.map(v=>v[0]));
 for(const x of list){assert.match(x.prompt,/delega mancata/);assert.match(x.prompt,/#0B1F3A, #F4F1EA, #C8A96A/);assert.match(x.prompt,/No people at all/);assert.match(x.prompt,/golden-hour/);assert.match(x.prompt,/No text/);assert.ok(x.prompt.length<=2000)}
 assert.equal(new Set(list.map(x=>x.prompt)).size,3);
 assert.throws(()=>studio.prompts({people:'everyone smiling'},{concept:'Il costo nascosto della delega'}),/Persone/);
 assert.equal(studio.ratioOf({ratio:'9:16'}),'9:16');assert.equal(studio.ratioOf({}),'4:5');
 assert.match(studio.prompts({colors:'muted neutral tones'},{concept:'Il costo nascosto della delega'})[0].prompt,/Muted neutral tones/);
 assert.equal(studio.headlineFrom('Delegare non è perdere controllo. È guadagnare tempo.'),'Delegare non è perdere controllo.');
 assert.equal(studio.conceptFrom('Molti fanno tutto da soli. Poi crollano.\n---SLIDES---\n1|#000000|#ffffff|x\n---FINE---','Delega'),'Delega: Molti fanno tutto da soli.');
});

test('image action fetches the photo of a verified request, never a URL from the page',async()=>{
 const origUser=auth.getSessionUser,origFetch=global.fetch,origKey=process.env.HIGGSFIELD_API_KEY,calls=[];
 const bin=()=>({code:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(v){this.body=v;return this},send(b){this.body=b;return this}});
 try{
  auth.getSessionUser=()=>({uid:1});process.env.HIGGSFIELD_API_KEY='kid:ksecret';
  global.fetch=async(url)=>{calls.push(String(url));if(/status$/.test(url))return {ok:true,status:200,json:async()=>({status:'completed',request_id:ID,images:[{url:'https://cdn.example/i.jpg'}]})};
   return {ok:true,url:'https://cdn.example/i.jpg',headers:{get:()=>'image/jpeg'},arrayBuffer:async()=>new Uint8Array([255,216,255]).buffer}};
  let r=bin();await hf({method:'GET',query:{action:'image',id:ID,url:'http://169.254.169.254/'}},r);
  assert.equal(r.code,200);assert.equal(r.headers['Content-Type'],'image/jpeg');assert.equal(r.body.length,3);assert.deepEqual(calls,['https://api.higgsfield.ai/requests/'+ID+'/status','https://cdn.example/i.jpg']);
  global.fetch=async(url)=>/status$/.test(url)?{ok:true,status:200,json:async()=>({status:'completed',request_id:ID,images:[{url:'https://cdn.example/i.jpg'}]})}:{ok:true,url:'https://cdn.example/i.jpg',headers:{get:()=>'text/html'},arrayBuffer:async()=>new ArrayBuffer(1)};
  r=bin();await hf({method:'GET',query:{action:'image',id:ID}},r);assert.equal(r.code,502);
  global.fetch=async()=>({ok:true,status:200,json:async()=>({status:'in_progress',request_id:ID})});
  r=bin();await hf({method:'GET',query:{action:'image',id:ID}},r);assert.equal(r.code,409);
 }finally{auth.getSessionUser=origUser;global.fetch=origFetch;if(origKey===undefined)delete process.env.HIGGSFIELD_API_KEY;else process.env.HIGGSFIELD_API_KEY=origKey}
});

test('Art Director check: images first, then the request; reply parsed and bounded', () => {
  const S = require('../lib/image-studio.js');
  const m = S.reviewMessage([{ url: 'https://cdn.example/a.png' }, { url: 'https://cdn.example/b.png' }, null], { concept: 'Ordine nel caos', project: { name: 'Studio Rossi' } });
  assert.equal(m.role, 'user');
  assert.deepEqual(m.content.slice(0, 2).map((x) => x.source.url), ['https://cdn.example/a.png', 'https://cdn.example/b.png']);
  assert.match(m.content[2].text, /le 2 proposte/);
  assert.match(m.content[2].text, /Studio Rossi/);
  const r = S.parseReview('Ecco: {"best":2,"items":[{"n":1,"score":4,"issues":["scritte finte sul cartello"],"note":"testo nel fondo"},{"n":2,"score":11,"issues":[],"note":"pulita"},{"n":7,"score":9}]}', 2);
  assert.equal(r.best, 1);
  assert.deepEqual(r.items[0].issues, ['scritte finte sul cartello']);
  assert.equal(r.items[1].score, 10);
  assert.equal(r.items.length, 2);
  assert.equal(S.parseReview('{"items":[{"n":1,"score":3},{"n":2,"score":8}]}', 2).best, 1, 'best from scores when missing');
  assert.equal(S.parseReview('nessun json', 2), null);
});
