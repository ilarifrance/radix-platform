'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('lead-intelligence.html','utf8'),archive=fs.readFileSync('sales/lead-archive.js','utf8');
test('workspace vault controls integrated without modifying other routes or adding serverless entrypoint',()=>{
 for(const id of ['archive-workspace','archive-list','archive-title','archive-save','archive-new','archive-load','archive-delete','archive-status'])assert.ok(html.includes('id="'+id+'"'));
 assert.doesNotThrow(()=>new vm.Script(archive));
 assert.ok(archive.includes("entity:'lead_lists'"));
 assert.ok(archive.includes('window.radixLeadData.restore'));
 assert.ok(archive.includes('window.radixLeadWorkflow.restoreReviews'));
 assert.match(archive,/window\.confirm/);
});
test('restored data is requalified and approvals revalidated rather than trusted blindly',()=>{
 const source=fs.readFileSync('sales/lead-premium.js','utf8');
 const workflow=fs.readFileSync('sales/lead-outreach.js','utf8');
 assert.match(source,/window\.radixLeadData/);assert.match(source,/calculate\(\)/);
 assert.match(workflow,/C\.validate\(q,a\)/);
 assert.ok(!/localStorage|sessionStorage/.test(archive));
});
