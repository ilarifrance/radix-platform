'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeDomain,companyKey,assessProspect,deduplicateCompanies,proposeOutreach}=require('../lib/prospect-engine');
test('normalizes company domain and prefers it to name',()=>{
 assert.equal(normalizeDomain('https://www.Example.it/contatti'),'example.it');
 assert.equal(companyKey({domain:'WWW.Example.it',name:'Different'}),'domain:example.it');
 assert.equal(normalizeDomain('not a domain'),null);
});
test('scores only observed ICP dimensions, without inventing intent',()=>{
 const p=assessProspect({name:'A',country:'Italia',industry:'Macchine',companySize:'PMI',contactRole:'CEO',source:'manual'},{countries:['Italia'],industries:['Macchine'],companySizes:['PMI'],roles:['CEO']});
 assert.equal(p.score,100);assert.equal(p.qualification,'high_fit');assert.equal(p.canAutoSend,false);assert.equal(p.dataProvenance,'manual');assert.equal(p.scoreKind,'rules_based_icp_fit');
});
test('missing fields reduce coverage rather than being treated as negative',()=>{
 const p=assessProspect({country:'Italia'},{countries:['Italia'],industries:['IT']});
 assert.equal(p.score,100);assert.equal(p.coverage,25);assert.deepEqual(p.unknownFields,['industry']);
});
test('no criteria or evidence results in needs_review',()=>{
 const p=assessProspect({name:'A'},{countries:['IT']});
 assert.equal(p.score,null);assert.equal(p.qualification,'needs_review');
});
test('duplicates are suggestions, not auto-merges',()=>{
 const r=deduplicateCompanies([{name:'A',country:'IT'},{name:' a ',country:'it'},{name:'Unknown'}]);
 assert.equal(r.duplicateGroups.length,1);assert.deepEqual(r.duplicateGroups[0].indexes,[0,1]);assert.equal(r.duplicateGroups[0].autoMerged,false);assert.equal(r.pendingReview.length,1);
});
test('outreach never sends messages',()=>{
 const r=proposeOutreach({name:'A',country:'Italia'});
 assert.equal(r.status,'draft_only');assert.equal(r.delivery,'disabled');assert.equal(r.requiresLawfulBasisCheck,true);
});
