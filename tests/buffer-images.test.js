'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createPost}=require('../api/_buffer.js');

test('createPost sends the images as an ordered list of { image: { url } }, https only',async()=>{
 const seen=[];const orig=global.fetch;
 global.fetch=async(url,opts)=>{seen.push(JSON.parse(opts.body));return {ok:true,status:200,json:async()=>({data:{createPost:{post:{id:'p1',text:'t',dueAt:null}}}})}};
 try{
  const r=await createPost('k',{channelId:'c',text:'Ciao',images:['https://x.test/a.jpg','http://bad/b.jpg','https://x.test/c.jpg?s="q"']});
  assert.equal(r.postId,'p1');
  assert.match(seen[0].query,/assets: \[\{ image: \{ url: "https:\/\/x\.test\/a\.jpg" \} \}, \{ image: \{ url: "https:\/\/x\.test\/c\.jpg\?s=\\"q\\"" \} \}\]/);
  assert.doesNotMatch(seen[0].query,/http:\/\/bad/);
  await createPost('k',{channelId:'c',text:'Ciao'});assert.doesNotMatch(seen[1].query,/assets/);
 }finally{global.fetch=orig}
});

test('putPublic uploads a PED image to Vercel Blob and returns its public https url',async()=>{
 const {putPublic}=require('../api/_blob.js');const seen=[];const orig=global.fetch;
 global.fetch=async(url,opts)=>{seen.push({url,opts});return {ok:true,status:200,json:async()=>({url:'https://store.public.blob.vercel-storage.com/radix-media/a-x1.png'})}};
 try{
  const id='0f8b2c1e-1111-4222-8333-944455556666';
  assert.equal(await putPublic('tok',{name:id,mime:'image/png',data:Buffer.from('x')}),'https://store.public.blob.vercel-storage.com/radix-media/a-x1.png');
  assert.equal(seen[0].url,'https://blob.vercel-storage.com/radix-media/'+id+'.png');assert.equal(seen[0].opts.method,'PUT');
  assert.equal(seen[0].opts.headers.authorization,'Bearer tok');assert.equal(seen[0].opts.headers['x-content-type'],'image/png');
  await assert.rejects(putPublic('tok',{name:'../x',mime:'image/png',data:Buffer.from('x')}),/Nome file/);
  await assert.rejects(putPublic('tok',{name:id,mime:'text/html',data:Buffer.from('x')}),/Formato/);
  global.fetch=async()=>({ok:false,status:403,json:async()=>({})});
  await assert.rejects(putPublic('tok',{name:id,mime:'image/jpeg',data:Buffer.from('x')}),/403/);
 }finally{global.fetch=orig}
});

test('publishing uploads images to Blob only when BLOB_READ_WRITE_TOKEN is set',()=>{
 const src=require('node:fs').readFileSync(__dirname+'/../api/_registry-handler.js','utf8');
 assert.match(src,/process\.env\.BLOB_READ_WRITE_TOKEN/);assert.match(src,/putBlob:require\('\.\/_blob'\)\.putPublic/);
 assert.match(src,/else images=images\.map\(mid=>base\+mediaUrl\(mid\)\)/);
});
