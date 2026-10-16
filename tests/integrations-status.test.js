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
