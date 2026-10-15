'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../lib/lead-enrichment-plan');
test('offline budget limits calls and never creates private contact fields',()=>{
 const rows=[
  {fullName:'Andrea Test',companyName:'Example Srl',jobTitle:'Proprietario',profileUrl:'https://www.linkedin.com/sales/lead/1'},
  {fullName:'Alba Test',companyName:'Example Srl',jobTitle:'Direttore',profileUrl:'https://www.linkedin.com/sales/lead/2'},
  {fullName:'Alba Test',companyName:'Example Srl',jobTitle:'Direttore',profileUrl:'https://www.linkedin.com/sales/lead/2?trk=x'},
  {fullName:'Marco Test',companyName:'',jobTitle:'Owner',profileUrl:'https://www.linkedin.com/sales/lead/3'}
 ];
 const x=E.plan(rows,{unitCost:0.2,budget:0.2});
 assert.equal(x.total,3);assert.equal(x.eligible,2);assert.equal(x.plannedCalls,1);
 assert.equal(x.estimatedCost,0.2);assert.equal(x.needReview,1);
 assert.equal('email' in x.queue[0],false);
 assert.equal(E.plan(rows,{unitCost:0.2,budget:0}).plannedCalls,0);
});
test('suspicious employer description is queued for review instead of paid lookup',()=>{
 const x=E.plan([{fullName:'Nicolò',jobTitle:'Direttore',companyName:'Intertex February 2027'}],{unitCost:0.01,budget:2});
 assert.equal(x.needReview,1);assert.equal(x.eligible,0);
});
test('rejects nonsensical prices and oversized work batches',()=>{
 assert.throws(()=>E.plan([],{unitCost:-1}),/Costo/);
 assert.throws(()=>E.plan([],{budget:Infinity}),/Costo/);
 assert.throws(()=>E.plan(Array(5001).fill({})),/Lotto/);
});
