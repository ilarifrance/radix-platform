'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('xlsx client parser is static, local, bounded, and formula-safe',()=>{
 const s=fs.readFileSync('lib/lead-xlsx-parser.js','utf8');
 assert.doesNotThrow(()=>new vm.Script(s));
 assert.match(s,/DecompressionStream/);assert.match(s,/LIMIT_UNCOMPRESSED/);assert.match(s,/if\(first\(c,'f'\)\)fail/);
 assert.ok(!s.includes('fetch('));assert.ok(!s.includes('localStorage'));
});
test('manual xls opt-in reuses already authorized parser without new Vercel function',()=>{
 const js=fs.readFileSync('sales/lead-premium.js','utf8'),html=fs.readFileSync('lead-intelligence.html','utf8');
 assert.match(js,/window\.confirm\('Il formato \.xls/);
 assert.match(js,/fetch\('\/api\/parse-file'/);
 assert.match(js,/RadixLeadXlsx\.parseXlsx/);
 assert.match(html,/\.xlsx,\.xls/);
 assert.match(html,/lead-xlsx-parser\.js/);
 assert.doesNotThrow(()=>new vm.Script(js));
});
