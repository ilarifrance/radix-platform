'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('LinkedIn hub has provider verification and URL validation but no cookie inputs',()=>{
 const html=fs.readFileSync('sales-linkedin.html','utf8'),js=fs.readFileSync('sales/linkedin-hub.js','utf8');
 assert.doesNotThrow(()=>new vm.Script(js));
 for(const id of ['linkedin-check','linkedin-test','linkedin-search-url','linkedin-prepare','linkedin-workspace','linkedin-connection-pill'])assert.ok(html.includes('id="'+id+'"'));
 assert.match(js,/lead_provider_status/);
 assert.match(js,/RadixSalesnavSource/);
 assert.match(js,/sessionStorage\.setItem/);
 assert.doesNotMatch(html,/<(?:input|textarea)[^>]*(?:name|id)="[^"]*(?:password|cookie|session)/i);
 assert.doesNotMatch(js,/salesnavigator-search-people\/run|CAPTAIN_DATA_API_KEY/);
});
test('Lead Intelligence receives pending source locally without a LinkedIn request',()=>{
 const html=fs.readFileSync('lead-intelligence.html','utf8'),js=fs.readFileSync('sales/lead-salesnav-prefill.js','utf8');
 assert.match(html,/lead-salesnav-prefill\.js/);assert.match(html,/salesnav-source\.js/);
 assert.doesNotThrow(()=>new vm.Script(js));
 assert.match(js,/sessionStorage\.removeItem/);
 assert.doesNotMatch(js,/fetch\(/);
});
