'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('tools/linkedin-local-agent/index.html','utf8');
const server=fs.readFileSync('tools/linkedin-local-agent/index.js','utf8');
test('bulk UI loads reconciler and quote planner from same-origin localhost',()=>{
 assert.match(html,/<script src="\/lead-domain-suggestions\.js"><\/script>/);
 assert.match(html,/<script src="\/lead-provider-waterfall\.js"><\/script>/);
 assert.match(server,/pathname==='\/lead-domain-suggestions\.js'/);
 assert.match(server,/pathname==='\/lead-provider-waterfall\.js'/);
});
test('bulk UI reconciles observed public proposals before offering manual save',()=>{
 assert.match(html,/engine\.reconcile\(records,evidence\)/);
 assert.match(html,/item\?\.status==='review'/);
 assert.match(html,/item\.proposals\.some/);
 assert.match(html,/country:\s*group\.country/);
 assert.match(html,/window\.confirm\(/);
 assert.match(html,/freeBulkStop/);
 assert.match(html,/\.slice\(0,50\)/);
 assert.match(html,/nessun dato salvato automaticamente/i);
});
test('provider UI is purely a quote, never executes or persists API credentials',()=>{
 assert.match(html,/planner\.quote\(receiverRecords,prices,/);
 assert.match(html,/id="waterfall-plan"/);
 assert.match(html,/Chiamate reali: 0/);
 assert.doesNotMatch(html,/\b(?:apiKey|secret|password)\s*=\s*\$\('wf-/i);
 assert.doesNotMatch(server,/\/api\/(?:hunter|dropcontact|findymail|brave-search)/);
});
test('updated inline dashboard JavaScript parses with existing local scripts',()=>{
 const src=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(s=>s.trim());
 assert.ok(src.length>=1);
 for(const js of src)assert.doesNotThrow(()=>new vm.Script(js));
});
