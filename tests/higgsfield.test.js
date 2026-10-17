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
