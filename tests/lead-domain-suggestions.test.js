'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../lib/lead-domain-suggestions');
const row=(name,country='IT',domain='')=>({companyName:name,country,companyDomain:domain,fullName:'Never exported',email:'private@example.com'});
const hint=(companyName,domain,provider='wikidata',country='IT',sourceUrl='https://www.wikidata.org/wiki/Q123')=>({companyName,domain,provider,country,sourceUrl});
test('same domain from independent sources is one unverified proposal, without personal data',()=>{
 const result=S.reconcile([row('Alfa Srl'),row('Alfa Srl')],[hint('Alfa Srl','https://www.alfa.it/'),hint('Alfa Srl','alfa.it','brave-search','IT','https://example.org/result')]);
 assert.equal(result.totalCompanies,1);assert.equal(result.companies[0].contactCount,2);
 assert.equal(result.companies[0].status,'review');assert.equal(result.companies[0].proposals.length,1);
 assert.equal(result.companies[0].proposals[0].sourceCount,2);
 assert.equal(result.companies[0].proposals[0].verified,false);
 assert.doesNotMatch(JSON.stringify(result),/private@example.com|Never exported/);
});
test('contradictory domains remain in conflict and cannot be auto-applied',()=>{
 const r=S.reconcile([row('Alfa')],[hint('Alfa','alfa.it'),hint('Alfa','alfa.com','brave-search','IT','https://example.org/r')]);
 assert.equal(r.companies[0].status,'conflict');assert.equal(r.companies[0].proposals.length,2);
 assert.equal('approved' in r.companies[0],false);
});
test('populated domain is preserved and conflicting existing values are highlighted',()=>{
 const r=S.reconcile([row('Alfa','IT','alfa.it'),row('Alfa','IT','alfa.com')],[hint('Alfa','other.org')]);
 assert.equal(r.companies[0].status,'existing_conflict');
 const single=S.reconcile([row('Alfa','IT','alfa.it')],[hint('Alfa','other.org')]);
 assert.equal(single.companies[0].status,'already_present');assert.deepEqual(single.companies[0].proposals,[]);
});
test('same company name in different countries is not merged',()=>{
 const r=S.reconcile([row('Alfa','IT'),row('Alfa','UK')],[hint('Alfa','alfa.it')]);
 assert.equal(r.totalCompanies,2);assert.equal(r.companies[1].status,'no_suggestion');
});
test('unsafe URLs and invalid hosts are rejected without external requests',()=>{
 assert.equal(S.domain('https://user:secret@example.com'),'');
 assert.equal(S.domain('http://127.0.0.1'),'');
 assert.equal(S.domain('http://localhost'),'');
 assert.equal(S.domain('http://-bad.example'),'');
 const r=S.reconcile([row('Alfa')],[hint('Alfa','localhost'),hint('Alfa','alfa.it','brave-search','IT','javascript:alert(1)'),hint('Alfa','alfa.it','unknown')]);
 assert.equal(r.invalidEvidence,3);assert.equal(r.companies[0].status,'no_suggestion');
});
test('bounded arrays fail closed',()=>{
 assert.throws(()=>S.reconcile(Array(5001).fill(row('Alfa')),[]),/Lotto/);
 assert.throws(()=>S.reconcile([],Array(10001).fill({})),/Lotto/);
});
