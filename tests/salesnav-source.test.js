'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),S=require('../lib/salesnav-source');
test('allows Sales Navigator people search and people lists only',()=>{
 const src='https://www.linkedin.com/sales/search/people?query=saved%20search';
 assert.equal(S.validate(src),src);
 assert.equal(S.validate('https://www.linkedin.com/sales/lists/people/123').includes('/sales/lists/people/'),true);
});
test('rejects credentials, unrelated URLs and forged domains',()=>{
 for(const s of ['https://linkedin.com.evil.com/sales/search/people','https://www.linkedin.com/in/mario','https://www.linkedin.com/sales/search/company','http://www.linkedin.com/sales/search/people','https://u:p@www.linkedin.com/sales/search/people']){
  assert.throws(()=>S.validate(s));
 }
});
test('preparation quantity bounds do not start paid jobs',()=>{
 assert.equal(S.quantity('500'),500);
 for(const bad of [0,-1,5001,'5.5','x'])assert.throws(()=>S.quantity(bad));
});
