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
