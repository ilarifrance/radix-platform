'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const studio=require('../lib/avatar-studio.js');
const res=()=>({code:200,status(n){this.code=n;return this},json(v){this.body=v;return this}});

test('answers become the HeyGen photo-avatar request, defaults first, nothing invented',()=>{
 const p=studio.designPayload({appearance:'Giacca blu, ufficio luminoso, sorriso cordiale'},'Francesco');
 assert.deepEqual(p,{name:'Francesco',gender:'Man',age:'Early Middle Age',ethnicity:'White',style:'Realistic',pose:'half_body',orientation:'vertical',appearance:'Giacca blu, ufficio luminoso, sorriso cordiale'});
 assert.equal(studio.designPayload({gender:'Woman',age:'Senior',appearance:'x'.repeat(1200)}).appearance.length,1000);
 assert.throws(()=>studio.designPayload({appearance:'corto'}),/Descrivi/);
 assert.throws(()=>studio.designPayload({gender:'Robot',appearance:'Giacca blu, ufficio luminoso'}),/Uomo o donna/);
 for(const q of studio.QUESTIONS)assert.ok(q.options.length>=3&&q.options.every(o=>o[0]&&o[1]),q.id);
 assert.match(studio.appearanceHint({kind:'Consulenza commerciale',voice:'Diretto e concreto. Niente gergo.'}),/contesto: Consulenza commerciale.*tono: Diretto e concreto$/);
});

test('three voices: Italian first, same gender preferred; three examples at most; saved avatar needs avatar and voice',()=>{
 const voices=[{id:'1',name:'Anna',language:'Italian',gender:'female'},{id:'2',name:'John',language:'English',gender:'male'},{id:'3',name:'Marco',language:'Italian',gender:'male'},{id:'4',name:'Luca',language:'Italian',gender:'male'},{id:'5',name:'Sara',language:'Italian',gender:'female'}];
 assert.deepEqual(studio.pickVoices(voices,{gender:'Man'}).map(v=>v.name),['Marco','Luca','Anna']);
 assert.deepEqual(studio.pickVoices([{id:'9',name:'Only',language:'English'}],{}).map(v=>v.id),['9'],'no Italian voice: still proposes');
 assert.equal(studio.examples([{url:'https://a',key:'k1'},{url:'https://b',key:'k2'},{url:'https://c'},{url:'https://d',key:'k4'},{url:'https://e',key:'k5'}]).length,3);
 assert.throws(()=>studio.avatarRecord({id:'a1'}),/voce/);
 const r=studio.avatarRecord({type:'talking_photo',id:'a1',name:'Fra',voiceId:'v1',voiceName:'Marco',imageUrl:'javascript:alert(1)',createdAt:'2026-10-18T00:00:00Z'});
 assert.deepEqual(r,{type:'talking_photo',id:'a1',name:'Fra',voiceId:'v1',voiceName:'Marco',imageUrl:'',groupId:'',createdAt:'2026-10-18T00:00:00Z'});
 assert.equal(studio.savedAvatar({avatar:r}),r);assert.equal(studio.savedAvatar({avatar:{id:'x'}}),null);
});

test('HeyGen route: design and avatar creation need confirmation, upload goes to the asset endpoint, talking photos speak',async()=>{
 const auth=require('../api/_auth.js'),orig=auth.getSessionUser,realFetch=globalThis.fetch,key=process.env.HEYGEN_API_KEY;const calls=[];
 auth.getSessionUser=()=>({uid:1});process.env.HEYGEN_API_KEY='test-key';delete require.cache[require.resolve('../api/_heygen.js')];
 const handler=require('../api/_heygen.js');
 globalThis.fetch=async(u,o)=>{calls.push({u:String(u),o});const J=d=>new Response(JSON.stringify(d),{status:200,headers:{'content-type':'application/json'}});
  if(/photo\/generate$/.test(u))return J({error:null,data:{generation_id:'gen123456'}});
  if(/generation\/gen123456$/.test(u))return J({data:{status:'success',image_url_list:['https://i/1','https://i/2','https://i/3','https://i/4'],image_key_list:['image/a/original','image/b/original','image/c/original','image/d/original']}});
  if(/upload\.heygen\.com/.test(u))return J({data:{image_key:'image/up1/original',url:'https://u/1'}});
  if(/avatar_group\/create$/.test(u))return J({data:{id:'look1',group_id:'group1',image_url:'https://i/look1'}});
  if(/photo_avatar\/train$/.test(u))return J({data:{code:100}});
  if(/video\/generate$/.test(u))return J({data:{video_id:'vid1'}});
  return new Response('{}',{status:404})};
 try{
  let r=res();await handler({method:'POST',body:{action:'design',answers:{appearance:'Giacca blu, ufficio luminoso'}}},r);assert.equal(r.code,400);assert.match(r.body.error,/Conferma/);
  r=res();await handler({method:'POST',body:{action:'design',confirm:true,name:'Fra',answers:{appearance:'Giacca blu, ufficio luminoso'}}},r);assert.equal(r.body.generationId,'gen123456');
  assert.equal(JSON.parse(calls.at(-1).o.body).pose,'half_body');assert.equal(calls.at(-1).o.headers['x-api-key'],'test-key');
  r=res();await handler({method:'GET',query:{action:'generation',id:'gen123456'}},r);assert.equal(r.body.status,'success');assert.deepEqual(r.body.images.map(i=>i.key),['image/a/original','image/b/original','image/c/original']);
  r=res();await handler({method:'POST',body:{action:'upload',dataUrl:'data:text/html;base64,PGI+'}},r);assert.equal(r.code,400);
  r=res();await handler({method:'POST',body:{action:'upload',dataUrl:'data:image/jpeg;base64,/9j/4AAQ'}},r);assert.equal(r.body.imageKey,'image/up1/original');
  assert.equal(calls.at(-1).o.headers['Content-Type'],'image/jpeg');assert.ok(Buffer.isBuffer(calls.at(-1).o.body));
  r=res();await handler({method:'POST',body:{action:'createAvatar',imageKey:'image/a/original'}},r);assert.equal(r.code,400);
  r=res();await handler({method:'POST',body:{action:'createAvatar',confirm:true,imageKey:'../../etc'}},r);assert.equal(r.code,400);
  r=res();await handler({method:'POST',body:{action:'createAvatar',confirm:true,imageKey:'image/a/original',name:'Fra'}},r);
  assert.deepEqual(r.body,{avatarId:'look1',groupId:'group1',imageUrl:'https://i/look1',trainError:null});assert.match(calls.at(-1).u,/photo_avatar\/train$/);
  r=res();await handler({method:'POST',body:{action:'generate',script:'Ciao',voiceId:'v1',talkingPhotoId:'look1'}},r);assert.equal(r.body.videoId,'vid1');
  assert.deepEqual(JSON.parse(calls.at(-1).o.body).video_inputs[0].character,{type:'talking_photo',talking_photo_id:'look1'});
 }finally{globalThis.fetch=realFetch;auth.getSessionUser=orig;if(key===undefined)delete process.env.HEYGEN_API_KEY;else process.env.HEYGEN_API_KEY=key;delete require.cache[require.resolve('../api/_heygen.js')]}
});
