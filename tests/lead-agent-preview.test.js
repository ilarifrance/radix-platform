'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('agent capture review requires preview and explicit human approval',()=>{
 const ui=fs.readFileSync('sales/lead-intake.js','utf8'),html=fs.readFileSync('lead-intelligence.html','utf8');
 for(const id of ['li-agent-preview','li-agent-commit','li-agent-preview-rows'])assert.ok(html.includes('id="'+id+'"'));
 assert.match(html,/li-agent-commit" type="button" class="primary" disabled/);
 assert.match(ui,/C\.fromAgentExport\(raw,valid\.url\)/);
 assert.match(ui,/window\.confirm\('Confermi /);
 assert.match(ui,/JSON\.stringify\(current\(\)\)!==pendingAgent\.at/);
 assert.match(ui,/discardPreview\(\)/);
});
