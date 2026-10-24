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

test('bufferGraphQL says plainly when the Buffer key is rejected',async()=>{
 const {bufferGraphQL}=require('../api/_buffer.js');const orig=global.fetch;
 try{
  global.fetch=async()=>({ok:false,status:401,json:async()=>({error:'unauthorized'})});
  await assert.rejects(bufferGraphQL('k','query { account { id } }'),e=>/chiave Buffer sul server non è valida o è scaduta/.test(e.message)&&/401/.test(e.message)&&e.status===401);
  global.fetch=async()=>({ok:false,status:500,json:async()=>({})});
  await assert.rejects(bufferGraphQL('k','query { account { id } }'),e=>!/chiave Buffer/.test(e.message)&&/500/.test(e.message));
 }finally{global.fetch=orig}
});

test('createPost and the channel list use inline literals, not String! variables Buffer rejects',async()=>{
 const seen=[];const orig=global.fetch;
 global.fetch=async(url,opts)=>{seen.push(JSON.parse(opts.body));const q=seen[seen.length-1].query;
  return {ok:true,status:200,json:async()=>(/account/.test(q)?{data:{account:{organizations:[{id:'org1',name:'O'}]}}}:/channels/.test(q)?{data:{channels:[{id:'ch1',name:'LinkedIn',service:'linkedin'}]}}:{data:{createPost:{post:{id:'p1',text:'t',dueAt:'2026-10-21T06:00:00Z'}}}})}};
 try{
  const {createPost}=require('../api/_buffer.js');
  await createPost('k',{channelId:'ch1',text:'Riga "uno"\nriga due',dueAt:'2026-10-21T06:00:00.000Z'});
  const q=seen[0].query;assert.doesNotMatch(q,/\$/);assert.deepEqual(seen[0].variables,{});
  assert.match(q,/text: "Riga \\"uno\\"\\nriga due", channelId: "ch1", schedulingType: automatic, mode: customScheduled, dueAt: "2026-10-21T06:00:00.000Z"/);
  const handler=require('../api/_buffer.js');const auth=require('../api/_auth.js');const origUser=auth.getSessionUser;
  process.env.BUFFER_ACCESS_TOKEN='k';let out;
  const res={status(c){this.code=c;return this},json(b){out=b}};
  require.cache[require.resolve('../api/_auth.js')].exports.getSessionUser=()=>({id:'u'});
  delete require.cache[require.resolve('../api/_buffer.js')];
  await require('../api/_buffer.js')({method:'GET',query:{action:'channels'},headers:{}},res);
  require.cache[require.resolve('../api/_auth.js')].exports.getSessionUser=origUser;
  assert.deepEqual(out,{channels:[{id:'ch1',name:'LinkedIn',service:'linkedin'}]});
  const cq=seen.find(x=>/channels/.test(x.query)).query;assert.doesNotMatch(cq,/\$/);assert.match(cq,/organizationId: "org1"/);
 }finally{global.fetch=orig;delete process.env.BUFFER_ACCESS_TOKEN}
});
