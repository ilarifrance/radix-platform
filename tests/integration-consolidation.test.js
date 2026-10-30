'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const aliases=['buffer','heygen','higgsfield','openai-image','send-email'];
test('legacy integration URLs point to one function and keep their public paths',()=>{
 const config=JSON.parse(fs.readFileSync('vercel.json','utf8'));
 for(const name of aliases){
  assert.ok(config.rewrites.some(r=>r.source==='/api/'+name&&r.destination==='/api/integrations/'+name));
  assert.ok(fs.existsSync('api/_'+name+'.js'));
  assert.ok(!fs.existsSync('api/'+name+'.js'));
 }
});
test('dispatcher preserves target handler identity and rejects unknown services',async()=>{
 const fn=path.resolve('api/integrations/[service].js');
 const original=Module._load,called=[];
 Module._load=function(request,parent,isMain){
  if(parent && parent.filename===fn && aliases.includes(request.slice(4)) && request.startsWith('../_')){
    const name=request.slice(4);
    return async(req,res)=>{called.push({name,query:req.query,method:req.method});return res.status(207).json({name})};
  }
  return original.apply(this,arguments);
 };
 const res=()=>({code:200,status(n){this.code=n;return this},json(v){this.body=v;return this}});
 try{
  delete require.cache[fn];const route=require(fn);
  for(const name of aliases){const reply=res();await route({method:'POST',query:{service:name,action:'test'}},reply);assert.equal(reply.code,207);assert.equal(reply.body.name,name)}
  assert.equal(called.length,aliases.length);
  for(const invalid of ['other','__proto__',['buffer'],undefined]){const reply=res();await route({query:{service:invalid}},reply);assert.equal(reply.code,404)}
 }finally{Module._load=original;delete require.cache[fn]}
});
test('all provider handlers retain authentication and original confirmation gates',()=>{
 for(const name of aliases)assert.match(fs.readFileSync('api/_'+name+'.js','utf8'),/getSessionUser/);
 assert.match(fs.readFileSync('api/_send-email.js','utf8'),/confirm !== true/);
 assert.match(fs.readFileSync('api/_buffer.js','utf8'),/action === 'create'/);
});
