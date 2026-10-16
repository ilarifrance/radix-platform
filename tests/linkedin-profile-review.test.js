'use strict';const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../lib/linkedin-profile-review');
const link='https://www.linkedin.com/sales/lead/ABC123';
const base={fullName:'José Rossi',jobTitle:'',companyName:'',profileUrl:link,sourceUrl:'https://www.linkedin.com/sales/search/people'};
test('selects only missing details for visible LinkedIn profile URLs with maximum 20',()=>{
 const rows=[base,{...base,profileUrl:link+'?tracking=1'},{...base,profileUrl:'https://linkedin.com.evil.test/in/a'},{...base,companyName:'ACME',jobTitle:'CEO',profileUrl:'https://www.linkedin.com/in/abc'}];
 assert.deepEqual(S.select(rows),[{index:0,profileUrl:link}]);
 assert.deepEqual(S.select([base],{attempted:[link]}),[]);
 assert.throws(()=>S.select(rows,{limit:21}),/Lotto/);
});
test('accepts only matching visible name and explicit role/company/location, never rewrites existing fields',()=>{
 const result=S.apply(base,{fullName:'Jose Rossi',roleText:'CEO · Azienda Uno',companyText:'',location:'Milano'});
 assert.equal(result.changed,true);assert.deepEqual(result.fields,['jobTitle','companyName','location']);
 assert.equal(result.record.companyName,'Azienda Uno');assert.equal(result.record.jobTitle,'CEO');
 assert.equal(result.record.email,undefined);assert.equal(result.record.sourceUrl,base.sourceUrl);
 assert.equal(S.apply({...base,companyName:'Original'}, {fullName:'José Rossi',companyText:'Replacement',roleText:'CEO'}).record.companyName,'Original');
});
test('rejects mismatched identity and UI filler without guessed employer',()=>{
 assert.equal(S.apply(base,{fullName:'Another Person',companyText:'ACME'}).changed,false);
 const x=S.apply(base,{fullName:base.fullName,roleText:'See more',companyText:'',lines:['CEO · Fictional Employer']});
 assert.equal(x.record.companyName,'');assert.equal(x.changed,false);
});
