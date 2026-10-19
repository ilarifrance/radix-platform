'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {buildProspectReview,createProspectReviewCsv}=require('../lib/prospect-review');
const icp={countries:['Italia'],industries:['Macchine'],companySizes:['PMI'],roles:['CEO']};
const valid={name:'Alfa',domain:'alfa.it',country:'Italia',industry:'Macchine',companySize:'PMI',contactRole:'CEO',source:'manual'};
test('qualifies complete evidence without any execution permission',()=>{
 const r=buildProspectReview([valid],icp);
 assert.equal(r.status,'preview_only');assert.equal(r.queue[0].recommendation,'prioritize');
 assert.equal(r.queue[0].coveragePercent,100);
 assert.equal(r.canAutoSend,false);assert.equal(r.canAutoSync,false);
 assert.equal(r.queue[0].humanReviewRequired,true);
});
test('missing ICP evidence must never be silently prioritized',()=>{
 const r=buildProspectReview([{...valid,industry:undefined}],icp);
 assert.equal(r.queue[0].recommendation,'investigate');assert.equal(r.queue[0].coveragePercent,70);
 assert.ok(r.queue[0].reviewReasons.includes('missing_icp_fields'));
});
test('missing provenance forces investigation even with high ICP fit',()=>{
 const r=buildProspectReview([{...valid,source:undefined}],icp);
 assert.equal(r.queue[0].recommendation,'investigate');
 assert.ok(r.queue[0].reviewReasons.includes('missing_data_provenance'));
});
test('duplicates only flag review, never merge',()=>{
 const r=buildProspectReview([valid,{...valid,name:'Different'}],icp);
 assert.equal(r.queue.length,2);
 assert.equal(r.duplicates.duplicateGroups[0].autoMerged,false);
 assert.ok(r.queue.every(x=>x.reviewReasons.includes('possible_duplicate')));
});
test('missing identity must be reviewed',()=>{
 const r=buildProspectReview([{country:'Italia',industry:'Macchine',companySize:'PMI',contactRole:'CEO',source:'manual'}],icp);
 assert.equal(r.queue[0].recommendation,'investigate');
 assert.ok(r.queue[0].reviewReasons.includes('missing_company_identity'));
});
test('no evidence yields review and not fake scores',()=>{
 const r=buildProspectReview([{domain:'one.it'}],icp);
 assert.equal(r.queue[0].score,null);
 assert.equal(r.queue[0].recommendation,'investigate');
});
test('CSV exported via existing hardened exporter',()=>{
 const csv=createProspectReviewCsv([{...valid,name:'=malicious'}],icp);
 assert.ok(csv.startsWith('\uFEFF'));
 assert.ok(csv.includes('anteprima_non_sincronizzata'));
 assert.ok(csv.includes('obbligatoria'));
 assert.ok(!csv.includes('CEO;Italia'));
});
test('oversize queue cannot bypass exporter cap',()=>{
 assert.throws(()=>buildProspectReview(Array.from({length:251},()=>valid),icp),/250/);
});
test('bad ICP raises validation error',()=>{
 assert.throws(()=>buildProspectReview([valid],{countries:['']}),/ICP values/);
});
