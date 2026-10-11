'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {forecastScenarios}=require('../lib/sales-intelligence/forecast.js');
test('separates currency and calculates one probability weight',()=>{
 const a=forecastScenarios([{status:'open',stage:'qualified',value:1000,currency:'EUR'},{status:'open',stage:'proposal',value:2000,currency:'USD'}]);
 assert.equal(a.base.EUR,300);assert.equal(a.base.USD,1000);
 assert.equal(a.conservative.EUR,210);assert.equal(a.optimistic.USD,1200);
});
test('does not count closed, invalid, or unsupported opportunities',()=>{
 const a=forecastScenarios([{status:'won',stage:'proposal',value:500,currency:'EUR'},{status:'lost',stage:'proposal',value:700,currency:'EUR'},{status:'open',stage:'invalid',value:900,currency:'EUR'},{status:'open',stage:'proposal',value:-10,currency:'EUR'}]);
 assert.deepEqual(a,{conservative:{},base:{},optimistic:{}});
});
test('rejects invalid input and handles empty pipeline',()=>{
 assert.throws(()=>forecastScenarios(null),TypeError);
 assert.deepEqual(forecastScenarios([]),{conservative:{},base:{},optimistic:{}});
});
test('clamps optimistic probability at 100%',()=>{
 const a=forecastScenarios([{status:'open',stage:'late',value:100,currency:'EUR'}],{late:.99});
 assert.equal(a.optimistic.EUR,100);
});
