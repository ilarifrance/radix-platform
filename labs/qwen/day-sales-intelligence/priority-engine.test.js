'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {rankOpportunities,calculatePriority}=require('./priority-engine');
const now='2026-10-13T10:00:00Z';
const base={stage:'qualified',status:'open',value:5000,lastContactAt:'2026-10-10T10:00:00Z',nextActionAt:'2026-10-15T10:00:00Z',createdAt:'2026-10-01T10:00:00Z'};
test('UUID ties are deterministic and do not use numeric subtraction',()=>{
 const a={...base,id:'c3caaf43-11e7-4ce9-aed9-299999999999'},b={...base,id:'17c08311-11e7-4ce9-aed9-299999999999'};
 assert.deepEqual(rankOpportunities([a,b],now).map(x=>x.id),[b.id,a.id]);
 assert.deepEqual(rankOpportunities([b,a],now).map(x=>x.id),[b.id,a.id]);
});
test('numeric IDs retain natural order',()=>{
 const rows=[{...base,id:10},{...base,id:2}];
 assert.deepEqual(rankOpportunities(rows,now).map(x=>x.id),[2,10]);
});
test('invalid collection and date are rejected without throwing',()=>{
 assert.deepEqual(rankOpportunities({},now),[]);
 assert.deepEqual(rankOpportunities([base],'invalid'),[]);
 assert.equal(calculatePriority(null,now).score,0);
});
test('priority ranking does not mutate caller input',()=>{
 const rows=[{...base,id:'z'},{...base,id:'a'}],before=JSON.stringify(rows);
 rankOpportunities(rows,now);assert.equal(JSON.stringify(rows),before);
});
