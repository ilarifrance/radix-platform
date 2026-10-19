'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('guided browser import is explicit, no credentials or auto-collection',()=>{const html=fs.readFileSync('lead-intelligence.html','utf8'),code=fs.readFileSync('sales/lead-intake.js','utf8');assert.match(html,/id="li-agent-open"/);assert.match(code,/window\.open\(link\.url/);assert.match(code,/window\.confirm/);assert.match(html,/Non c'è lettura automatica della sessione LinkedIn/);assert.doesNotMatch(html,/type="password"/);});
