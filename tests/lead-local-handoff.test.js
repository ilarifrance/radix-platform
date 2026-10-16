'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const Bridge=require('../lib/lead-local-handoff');
const Source='https://www.linkedin.com/sales/search/people?query=test';
const person=(suffix='a')=>({fullName:'Ada '+suffix,jobTitle:'CEO',companyName:'Test Srl',profileUrl:'https://www.linkedin.com/in/'+suffix,sourceUrl:Source});
const job=(records)=>({id:'00000000-0000-4000-8000-000000000001',sourceUrl:Source,requested:20,data:{version:1,sourceUrl:Source,records,batches:[],total:records.length,duplicates:0}});
test('local checkpoint becomes RADIX version 1 backup without leaking unexpected keys',()=>{
 const raw=job([person('ada'),person('ada'),person('bruno')]);raw.cookie='session-secret';raw.data.records[0].accessToken='do-not-export';
 const {job:converted,report}=Bridge.parse(raw);
 assert.equal(converted.version,1);assert.equal(report.received,3);assert.equal(report.unique,2);assert.equal(report.duplicates,1);
 assert.equal(converted.records[0].fullName,'Ada ada');
 assert.doesNotMatch(JSON.stringify(converted),/session-secret|do-not-export|cookie|accessToken/);
});
test('domain approved locally remains in the normalized contact data, no invented email',()=>{
 const raw=job([person()]);raw.data.records[0].companyDomain='example.it';raw.freeEnrichment=[{field:'companyDomain',source:'https://www.wikidata.org/wiki/Q12',confirmedAt:'2026-10-16T12:00:00Z'}];
 const r=Bridge.parse(raw);
 assert.equal(r.job.records[0].companyDomain,'example.it');assert.equal(r.job.records[0].email,'');assert.equal(r.report.reviewedDomainCount,1);
});
test('reject malicious profile origins, malformed JSON and mismatched source',()=>{
 assert.throws(()=>Bridge.parse(job([{...person(),profileUrl:'https://linkedin.com.evil.test/in/a'}])),/profilo/);
 assert.throws(()=>Bridge.parse('{oops'),/JSON/);
 const raw=job([person()]);raw.data.sourceUrl='https://example.com';assert.throws(()=>Bridge.parse(raw),/fonte interna/);
 assert.throws(()=>Bridge.parse(job(Array(5001).fill(person()))),/numero contatti/);
});
test('company candidates are unique by domain and conflicts excluded, no raw personal fields',()=>{
 const p1={...person('a'),companyDomain:'acme.it',companyName:'ACME',country:'IT',industry:'Food'};
 const p2={...person('b'),companyDomain:'acme.it',companyName:'ACME',country:'IT'};
 const p3={...person('c'),companyDomain:'acme.it',companyName:'Another Firm',country:'IT'};
 const r=Bridge.toProspects([p1,p2,p3,{...person('d'),companyName:'',companyDomain:''}]);
 assert.equal(r.report.conflicts,1);assert.equal(r.report.noCompany,1);assert.equal(r.prospects.length,0);
 assert.doesNotMatch(JSON.stringify(r),/Ada/);
});
test('name-only company may be reviewed but identity is marked uncertain',()=>{
 const r=Bridge.toProspects([person('a'),person('b')]);
 assert.equal(r.prospects.length,1);assert.equal(r.report.identityUncertain,2);assert.equal(r.report.needsReview,1);
 assert.equal(r.prospects[0].contactRole,'CEO');assert.equal(r.prospects[0].source,'https://www.linkedin.com/sales/search/people');
});
