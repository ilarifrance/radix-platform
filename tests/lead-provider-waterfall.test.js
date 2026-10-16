'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Waterfall=require('../lib/lead-provider-waterfall');
const Domain=require('../lib/lead-domain-suggestions');
const Brave=require('../lib/lead-brave-domain');
const row=(name,domain,profileUrl,email='')=>({fullName:name,companyDomain:domain,profileUrl,email});
test('offline price sorting and worst-case fallback budget: never a real provider request',()=>{
 const rows=[row('Anna Verdi','acme.it','https://linkedin.com/in/anna'),row('Anna Verdi','acme.it','https://linkedin.com/in/anna?ref=1'),row('Paolo Rossi','beta.it','https://linkedin.com/in/paolo'),row('No domain','','https://linkedin.com/in/no')];
 const q=Waterfall.quote(rows,{hunter:0.04,dropcontact:0.03,snov:0.05},0.24);
 assert.deepEqual(q.tiers.map(x=>x.id),['dropcontact','hunter','snov']);
 assert.equal(q.eligible,2);assert.equal(q.missingIdentity,1);
 assert.equal(q.coveredContacts,2);assert.equal(q.maxPlannedCalls,6);
 assert.equal(q.worstCaseBudget,0.24);
 assert.equal(q.canExecute,false);assert.equal(q.executedCalls,0);assert.equal(q.actualSpend,0);
 assert.doesNotMatch(JSON.stringify(q),/Anna Verdi|Paolo Rossi|linkedin.com/);
});
test('fallback budget never exceeds user ceiling and prices are user supplied',()=>{
 const rows=[row('Alfa','alfa.it','1'),row('Beta','beta.it','2'),row('Gamma','gamma.it','3')];
 const q=Waterfall.quote(rows,{hunter:0.04,dropcontact:0.03},0.13);
 assert.equal(q.coveredContacts,1);assert.ok(q.worstCaseBudget<=0.13);
 assert.equal(Waterfall.quote(rows,{},1).maxPlannedCalls,0);
 assert.equal(Waterfall.quote(rows,{hunter:0.120001},0.12).coveredContacts,0);
 assert.equal(Waterfall.SERVICES.find(x=>x.id==='brave-search').status,'needs-api-key');
 assert.ok(Waterfall.SERVICES.filter(x=>x.kind==='email').every(x=>x.status==='disabled'));
});
test('invalid prices, keys, domains and oversized batches fail safely',()=>{
 const sample=[row('Alfa','alfa.it','1')];
 assert.throws(()=>Waterfall.quote(sample,{fake:0.01},1),/non valido/);
 assert.throws(()=>Waterfall.quote(sample,{hunter:-0.1},1),/non valido/);
 assert.throws(()=>Waterfall.quote(sample,{hunter:NaN},1),/non valido/);
 assert.throws(()=>Waterfall.quote(sample,{hunter:'0.01'},1),/non valido/);
 assert.throws(()=>Waterfall.quote(sample,{hunter:0.1},-1),/non valido/);
 assert.throws(()=>Waterfall.quote(Array(5001).fill(sample[0]),{},1),/Lotto/);
 assert.equal(Waterfall.quote([row('Alfa','https://localhost','1')],{hunter:0.1},1).eligible,0);
});
test('Brave response adapter proposes domains but never claims verification',()=>{
 const results=Brave.extract('Acme Srl',{web:{results:[
  {title:'Acme Srl - Sito ufficiale',url:'https://www.acme.it/about'},
  {title:'Acme Srl LinkedIn',url:'https://www.acme.it/careers'},
  {title:'Unrelated',url:'https://unrelated.it'},
  {title:'Acme Srl login',url:'https://example:secret@host.it/private'},
  {title:'Acme Srl backend',url:'http://acme.net'},
 ]}});
 assert.equal(results.length,1);
 assert.deepEqual(results.map(x=>x.domain),['acme.it']);
 assert.equal(results[0].provider,'brave-search');
 assert.equal(results[0].verified,false);
 const review=Domain.reconcile([{companyName:'Acme Srl',country:''}],results.map(x=>({...x,country:''})));
 assert.equal(review.companies[0].status,'review');
});
test('Brave adapter fails closed on malformed responses',()=>{
 assert.throws(()=>Brave.extract('Acme',{}),/non validi/);
 assert.throws(()=>Brave.extract('Acme',{web:{results:Array(51).fill({})}}),/non validi/);
 assert.throws(()=>Brave.extract('',{web:{results:[]}}),/non valida/);
});
