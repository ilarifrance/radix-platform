'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../lib/lead-intake-core');
const source='https://www.linkedin.com/sales/search/people?query=x';
const good={version:1,sourceUrl:source,companies:[{name:'Alpha',domain:'alpha.it',country:'Italia'}]};
test('agent export is normalized and source-matched',()=>{const rows=core.fromAgentExport(good,source);assert.equal(rows[0].name,'Alpha');assert.ok(rows[0].source.includes('linkedin.com/sales/search/people'));});
test('agent export rejects cross-source, arbitrary keys and malformed rows',()=>{assert.throws(()=>core.fromAgentExport({...good,sourceUrl:'https://example.com'},source));assert.throws(()=>core.fromAgentExport({...good,token:'secret'},source));assert.throws(()=>core.fromAgentExport({...good,companies:[{name:'A',cookies:'secret'}]},source));assert.throws(()=>core.fromAgentExport({...good,companies:[]},source));});
