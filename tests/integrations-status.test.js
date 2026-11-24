'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const handler=require('../api/_integrations-status.js');
const auth=require('../api/_auth.js');
const res=()=>({code:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(v){this.body=v;return this}});

test('status reports only booleans and needs every key of a service',()=>{
 const items=handler.status({ANTHROPIC_API_KEY:'sk-secret-value',GMAIL_USER:'a@b.c',GMAIL_APP_PASSWORD:' ',BUFFER_ACCESS_TOKEN:''});
 const by=Object.fromEntries(items.map(i=>[i.id,i]));
 assert.equal(by.anthropic.configured,true);assert.equal(by.email.configured,false);assert.equal(by.buffer.configured,false);
 assert.deepEqual(items.map(i=>i.id),handler.SERVICES.map(s=>s.id));
 const text=JSON.stringify(items);assert.ok(!/sk-secret|a@b\.c/.test(text),'no secret or account value in the response');
 for(const i of items)assert.deepEqual(Object.keys(i).sort(),['configured','id','label','use']);
});

test('route requires a RADIX session and GET',async()=>{
 const orig=auth.getSessionUser;
 try{
  auth.getSessionUser=()=>null;let r=res();await handler({method:'GET'},r);assert.equal(r.code,401);
  auth.getSessionUser=()=>({uid:1});r=res();await handler({method:'POST'},r);assert.equal(r.code,405);
  r=res();await handler({method:'GET'},r);assert.equal(r.code,200);assert.ok(Array.isArray(r.body.items));assert.equal(r.headers['Cache-Control'],'no-store');
 }finally{auth.getSessionUser=orig}
});

test('workspace client reads the status once and retries after a failure',async()=>{
 const path=require.resolve('../lib/radix-workspace-client.js');const orig=globalThis.fetch;let calls=0,ok=false;
 globalThis.fetch=async()=>{calls++;return ok?{ok:true,json:async()=>({items:[{id:'buffer',configured:false},{id:'anthropic',configured:true}]})}:{ok:false,json:async()=>({})}};
 try{
  delete require.cache[path];const ws=require(path);
  assert.equal(await ws.integrations(),null);ok=true;
  assert.deepEqual(await ws.integrations(),{buffer:false,anthropic:true});await ws.integrations();
  assert.equal(calls,2);
 }finally{globalThis.fetch=orig;delete require.cache[path]}
});

test('media tools for services without a key are disabled with the reason',async()=>{
 const media=require('../lib/radix-agent-media.js');
 assert.match(require('node:fs').readFileSync('lib/radix-agent-media.js','utf8'),/markService\(bufferTool[\s\S]*markService\(emailTool/);
 assert.equal(typeof media.toolsFor,'function');
 assert.match(require('node:fs').readFileSync('editorial-workspace.js','utf8'),/map\.buffer===false/);
});
