'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('tools/linkedin-local-agent/index.html','utf8');
const server=fs.readFileSync('tools/linkedin-local-agent/index.js','utf8');
test('whole-lot company lookup is an explicit, stoppable user action',()=>{
 assert.match(html,/id="free-bulk"/);
 assert.match(html,/id="free-stop"/);
 assert.match(html,/id="free-bulk-progress"/);
 assert.match(html,/id="free-bulk-rows"/);
 assert.match(html,/\$\('free-bulk'\)\.onclick=/);
 assert.match(html,/\$\('free-stop'\)\.onclick=/);
});
test('whole-lot scan deduplicates company lookups and never auto-accepts results',()=>{
 assert.match(html,/const groups=new Map\(\)/);
 assert.match(html,/groups\.has\(key\)/);
 assert.match(html,/\.slice\(0,50\)/);
 assert.match(html,/freeBulkStop/);
 assert.match(html,/setTimeout\(resolve,900\)/);
 assert.match(html,/Nessun salvataggio automatico|nessun dato salvato automaticamente/i);
 const buttonAction=html.indexOf("const button=document.createElement('button')");
 const confirm=html.indexOf('window.confirm(',buttonAction);
 const accept=html.indexOf("'/api/free-accept'",buttonAction);
 assert.ok(buttonAction>0&&confirm>buttonAction&&accept>confirm);
});
test('bulk lookup delegates only to the bounded, local free endpoint',()=>{
 assert.match(html,/call\('\/api\/free-lookup'/);
 assert.match(server,/PublicLookup\.lookup\(\{name:contact\.companyName\}\)/);
 assert.doesNotMatch(server,/CAPTAIN_DATA_API_KEY|HUNTER_API_KEY|DROPCONTACT_API_KEY/);
});
