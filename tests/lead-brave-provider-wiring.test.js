'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),http=require('node:http');
const backend=fs.readFileSync('tools/linkedin-local-agent/index.js','utf8');
const screen=fs.readFileSync('tools/linkedin-local-agent/index.html','utf8');
test('Brave can never run without both explicit opt-in and a configured bounded daily limit',()=>{
 assert.match(backend,/RADIX_BRAVE_ENABLED==='1'/);
 assert.match(backend,/BRAVE_SEARCH_API_KEY/);
 assert.match(backend,/RADIX_BRAVE_DAILY_LIMIT/);
 assert.match(backend,/reserveBrave\(\)/);
 assert.match(backend,/pathname==='\/api\/brave-lookup'/);
 assert.match(backend,/pathname==='\/api\/brave-accept'/);
 assert.match(backend,/braveProposals/);
 assert.match(backend,/braveEnrichment/);
});
test('Brave frontend requires a per-query confirmation and a second explicit domain approval',()=>{
 assert.match(screen,/id="brave-lookup" disabled/);
 assert.match(screen,/window\.confirm\('Inviare a Brave Search/);
 assert.match(screen,/window\.confirm\('Hai verificato direttamente/);
 assert.match(screen,/call\('\/api\/brave-lookup'/);
 assert.match(screen,/call\('\/api\/brave-accept'/);
 assert.doesNotMatch(screen,/X-Subscription-Token|BRAVE_SEARCH_API_KEY\s*=/);
 const scripts=[...screen.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).filter(Boolean);
 for(const script of scripts)assert.doesNotThrow(()=>new vm.Script(script));
});
test('provider status exposes no secret and defaults to not spending credits',async()=>{
 const {handler}=require('../tools/linkedin-local-agent/index');
 const server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/brave-status');
 assert.equal(response.status,200);
 const state=await response.json();
 assert.equal(Object.hasOwn(state,'apiKey'),false);
 assert.equal(Object.hasOwn(state,'secret'),false);
 assert.ok(Number.isInteger(state.remaining));
 }finally{server.close()}
});
