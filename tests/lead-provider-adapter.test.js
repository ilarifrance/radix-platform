'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../lib/lead-intake-core');
globalThis.RadixLeadIntakeCore=core;
const adapter=require('../lib/lead-provider-adapter');
const source='https://www.linkedin.com/sales/search/people?query=test';
test('adapters map common provider fields to RADIX prospects',()=>{
 const raw={results:[{companyName:'Acme',companyWebsite:'acme.it',country:'Italia',jobTitle:'CEO',companyIndustry:'Manufacturing'}]};
 const output=adapter.convert(raw,'captain-data',source);
 assert.equal(output.received,1);assert.equal(output.rows[0].domain,'acme.it');assert.equal(output.rows[0].contactRole,'CEO');assert.equal(output.rows[0].industry,'Manufacturing');
 assert.match(output.rows[0].source,/linkedin.com/);
});
test('does not invent missing company identity or allow unsafe URL',()=>{
 assert.throws(()=>adapter.convert([{firstName:'Mario',lastName:'Rossi'}],'phantombuster',source),/senza azienda/);
 assert.throws(()=>adapter.convert([{companyName:'Acme'}],'fake',source),/Provider non riconosciuto/);
 assert.throws(()=>adapter.convert([{companyName:'Acme'}],'generic','https://evil.test'),/URL|LinkedIn/);
});
