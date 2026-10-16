'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {handler}=require('../tools/linkedin-local-agent/index');
test('localhost serves read-only domain and provider planner scripts without an account',async()=>{
 const server=http.createServer(handler);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const base='http://127.0.0.1:'+server.address().port;
  for(const pathname of ['/lead-domain-suggestions.js','/lead-provider-waterfall.js']){
   const response=await fetch(base+pathname);
   assert.equal(response.status,200);
   assert.match(response.headers.get('content-type')||'',/application\/javascript/);
   assert.match(response.headers.get('content-security-policy')||'',/script-src 'self'/);
   const text=await response.text();
   assert.match(text,/offline|Offline/);
  }
 }finally{await new Promise(resolve=>server.close(resolve))}
});
