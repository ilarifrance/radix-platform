'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),http=require('node:http');
const lead=fs.readFileSync('lead-intelligence.html','utf8');
const agent=fs.readFileSync('tools/linkedin-local-agent/index.html','utf8');
const server=fs.readFileSync('tools/linkedin-local-agent/index.js','utf8');
test('local backup and matching CRM frontend modules are linked in the Lead page',()=>{
 assert.match(lead,/src="\/lib\/lead-local-handoff\.js"/);
 assert.match(lead,/src="\/lib\/lead-contact-crm-stage\.js"/);
 assert.match(lead,/src="\/lib\/lead-contact-crm-stage-ui\.js"/);
 assert.match(lead,/id="local-handoff-file"/);
 assert.match(lead,/id="local-crm-contact-select"/);
 assert.match(lead,/id="local-crm-contact-apply"[^>]*disabled/);
 assert.ok(lead.indexOf('lead-contact-crm-stage.js')<lead.indexOf('lead-contact-crm-stage-ui.js'));
});
test('local agent exposes explicit correction controls and a review-only API',()=>{
 assert.match(agent,/id="manual-review-save"[^>]*disabled/);
 assert.match(agent,/selectManualReview\(row\)/);
 assert.match(agent,/window\.confirm\('Confermi la revisione manuale/);
 assert.match(agent,/call\('\/api\/contact-review',input\)/);
 assert.match(server,/pathname==='\/api\/contact-review'/);
 assert.match(server,/ContactReview\.review\(record,input\)/);
 assert.match(server,/job\.manualReviews\.push/);
});
test('local agent inline scripts remain parseable after the review UI change',()=>{
 const sources=[...agent.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).filter(x=>x.trim());
 assert.ok(sources.length);for(const content of sources)assert.doesNotThrow(()=>new vm.Script(content));
});
test('visible workbench only suggests contacts, never preapproves or writes CRM',()=>{
 const src=fs.readFileSync('lib/lead-contact-crm-stage-ui.js','utf8');
 assert.match(src,/radix:lead-local-handoff-staged/);
 assert.match(src,/window\.confirm\(/);
 assert.match(src,/dispatchEvent\(new Event\('input'/);
 assert.doesNotMatch(src,/\/api\/sales|out-approve'\)\.click|out-checked'\)\.checked\s*=\s*true/);
});
test('localhost correction route refuses unsupported cross-site Origin',async()=>{
 const {handler}=require('../tools/linkedin-local-agent/index');
 const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const uri='http://127.0.0.1:'+server.address().port+'/api/contact-review';
  const response=await fetch(uri,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://outside.example'},body:'{}'});
  assert.equal(response.status,403);
 }finally{server.close()}
});
