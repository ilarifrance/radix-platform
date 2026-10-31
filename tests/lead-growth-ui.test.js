'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('commercial project wizard is navigable, complete and connected to API',()=>{
 const html=fs.readFileSync('sales-growth-projects.html','utf8'),js=fs.readFileSync('sales/growth-projects.js','utf8');
 for(let i=0;i<7;i++)assert.match(html,new RegExp('data-step-panel="'+i+'"'));
 for(const name of ['growth-workspace','growth-existing','growth-save','growth-export','growth-import','growth-review','growth-approved'])assert.ok(html.includes('id="'+name+'"'),name);
 assert.doesNotThrow(()=>new vm.Script(js));assert.match(js,/lead_growth_projects/);
 assert.match(js,/growth-go-leads/);assert.match(js,/growth-go-campaigns/);
 // Browser storage holds only the last workspace id (shared with the CRM), never project data.
 assert.doesNotMatch(js.replace(/localStorage\.(?:get|set)Item\('radix\.workspace'/g,''),/localStorage|sessionStorage/);
 assert.doesNotMatch(html,/<(?:input|textarea)[^>]*(?:name|id)="[^"]*(?:cookie|password|session)/i);
});
test('campaign page offers editing and no automatic sending',()=>{
 const html=fs.readFileSync('sales-growth-campaigns.html','utf8'),js=fs.readFileSync('sales/growth-campaigns.js','utf8');
 for(const field of ['campaign-project','campaign-workspace','campaign-save','campaign-delete','campaign-credit-total','campaign-list'])assert.ok(html.includes('id="'+field+'"'));
 assert.doesNotThrow(()=>new vm.Script(js));assert.match(js,/lead_growth_projects/);assert.match(html,/id="campaign-import-file"/);assert.match(html,/id="campaign-export-file"/);assert.match(js,/localOnly/);assert.match(js,/safeImport/);assert.doesNotMatch(js,/sendEmail|smtp\.send|fetch\('https:\/\/www\.linkedin/);
});
test('Lead Intelligence applies linked ICP only with user confirmation',()=>{
 const html=fs.readFileSync('lead-intelligence.html','utf8'),script=fs.readFileSync('sales/lead-growth-context.js','utf8');
 assert.match(html,/id="lead-growth-context"/);assert.match(html,/id="lead-growth-import-file"/);assert.match(script,/window\.confirm/);
 assert.match(script,/entity:'lead_growth_projects'/);assert.match(script,/lead-growth-apply-icp/);
});
