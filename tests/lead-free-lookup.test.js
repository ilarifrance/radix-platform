'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const Lookup=require('../api/_lead_public_lookup');
const {handler}=require('../tools/linkedin-local-agent/index');
test('public lookup suggests a domain but never silently persists it',async()=>{
 const mock=async url=>({ok:true,headers:{get:()=>null},text:async()=>{
  if(url.includes('wbsearchentities'))return JSON.stringify({search:[{id:'Q123',label:'Example Srl'}]});
  return JSON.stringify({entities:{Q123:{claims:{P856:[{mainsnak:{datavalue:{value:'https://www.example.com/'}}}]}}}}});
 }});
 const result=await Lookup.lookup({name:'Example Srl'},mock);
 assert.equal(result.suggestions[0].value,'example.com');
 assert.equal(result.suggestions[0].verified,false);
 assert.match(result.suggestions[0].source,/Q123/);
});
test('ambiguous company names do not generate a free-domain suggestion',async()=>{
 const mock=async()=>({ok:true,headers:{get:()=>null},text:async()=>JSON.stringify({search:[{id:'Q1',label:'Example Srl'},{id:'Q2',label:'Example Srl'}]})});
 const result=await Lookup.lookup({name:'Example Srl'},mock);
 assert.deepEqual(result.suggestions,[]);
});
test('invalid local free lookup request does not trigger paid or public search',async()=>{
 const server=http.createServer(handler);await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 try{
  const base='http://127.0.0.1:'+server.address().port;
  const response=await fetch(base+'/api/free-lookup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jobId:'not-a-job',profileUrl:'https://www.linkedin.com/in/test'})});
  assert.equal(response.status,400);
  const page=await(await fetch(base+'/')).text();
  assert.match(page,/Ricerca gratuita/);
 }finally{server.close()}
});
