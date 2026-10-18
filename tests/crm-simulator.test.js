'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {simBaseline,simulate}=require('../sales/analytics-view.js');
const now=new Date('2026-10-18T12:00:00Z');
test('simBaseline reads win rate, average won deal, new per month and cycle from the CRM',()=>{
  const b=simBaseline([
    {outcome:'won',amount_cents:100000,created_at:'2026-06-01T00:00:00Z',closed_at:'2026-07-01T00:00:00Z'},
    {outcome:'won',amount_cents:300000,created_at:'2026-05-01T00:00:00Z',closed_at:'2026-07-20T00:00:00Z'},
    {outcome:'lost',amount_cents:50000,created_at:'2026-09-01T00:00:00Z',closed_at:'2026-09-10T00:00:00Z'},
    {outcome:'open',amount_cents:200000,created_at:'2026-10-01T00:00:00Z'},
    {outcome:'open',amount_cents:400000,created_at:'2026-08-01T00:00:00Z'}],now);
  assert.equal(b.winRate,67);assert.equal(b.closed,3);assert.equal(b.avgDeal,200000);assert.equal(b.avgFrom,'won');
  assert.equal(b.openTotal,600000);assert.equal(b.openCount,2);
  assert.equal(b.newPerMonth,1);// 3 created in the last 90 days
  assert.equal(b.cycleMonths,2);// median of 30 and 80 days = 55 → 2 months
});
test('simBaseline leaves unknown values null instead of inventing them',()=>{
  const b=simBaseline([{outcome:'open',amount_cents:0}],now);
  assert.equal(b.winRate,null);assert.equal(b.avgDeal,null);assert.equal(b.newPerMonth,null);assert.equal(b.cycleMonths,null);
  const o=simBaseline([{outcome:'open',amount_cents:5000,created_at:'2026-10-01'}],now);assert.equal(o.avgDeal,5000);assert.equal(o.avgFrom,'open');
});
test('simulate spreads the open pipeline over the cycle and closes new deals one cycle later',()=>{
  const r=simulate({openTotal:1000000,winRate:50,avgDeal:100000,newPerMonth:2,cycleMonths:2,months:6});
  assert.deepEqual(r.monthly.map(x=>x.pipeline),[250000,250000,0,0,0,0]);
  assert.deepEqual(r.monthly.map(x=>x.fresh),[0,0,100000,100000,100000,100000]);
  assert.equal(r.fromPipeline,500000);assert.equal(r.fromNew,400000);assert.equal(r.total,900000);assert.equal(r.deals,4);
});
test('simulate counts only the part of the pipeline inside a short horizon and clamps inputs',()=>{
  const r=simulate({openTotal:1200000,winRate:150,avgDeal:-5,newPerMonth:3,cycleMonths:6,months:3});
  assert.equal(r.fromPipeline,600000);assert.equal(r.fromNew,0);assert.equal(r.deals,0);
});
