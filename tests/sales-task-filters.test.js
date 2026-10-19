'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHandler}=require('../api/_sales');const {createStore}=require('../api/_sales_store');
const W='11111111-1111-4111-8111-111111111111';
async function request(query,role='viewer',uid=7){let seen,calls=0;const res={setHeader(){},status(n){this.code=n;return this;},json(v){this.body=v;}};await createHandler({getSessionUser:()=>uid?{uid}:null,getStore:()=>({membership:async()=>role?{role}:null,read:async(c,u)=>{calls++;seen={c,u};return [];}})})({method:'GET',query:{workspace:W,entity:'tasks',...query}},res);return {res,seen,calls};}
test('task due filters validate closed enum and preserve tenant pagination for viewer',async()=>{
 for(const due of ['all','overdue','upcoming','unscheduled']){const r=await request({due,offset:'100'});assert.equal(r.res.code,200);assert.deepEqual(r.seen,{c:{workspace:W,entity:'tasks',offset:100,due},u:7});}
 for(const due of ['',null,['overdue'],{},'__proto__',"overdue' OR TRUE"]){const r=await request({due});assert.equal(r.res.code,400);assert.equal(r.calls,0);}
 for(const entity of ['companies','opportunities','workspaces','dashboard','customer360'])assert.equal((await request({entity,due:'overdue'})).res.code,400);
 assert.equal(Object.hasOwn((await request({})).seen.c,'due'),false);
});
test('task filters deny unauthenticated and missing unknown memberships before read',async()=>{
 assert.equal((await request({due:'overdue'},'member',null)).res.code,401);
 for(const role of [null,'unknown']){const r=await request({due:'upcoming'},role);assert.equal(r.res.code,403);assert.equal(r.calls,0);}
});
test('STATIC SQL task buckets use server time open status fixed duration and filter before pagination',async()=>{
 const queries={};const store=createStore(async(q,p)=>{queries.current=q;assert.deepEqual(p,[W,7,100]);return [];});
 for(const due of ['all','overdue','upcoming','unscheduled']){await store.read({workspace:W,entity:'tasks',offset:100,due},7);queries[due]=queries.current;assert.ok(queries.current.includes('t.workspace_id=$1'));assert.ok(queries.current.includes('m.user_id=$2'));assert.match(queries.current,/JOIN users/);assert.ok(queries.current.endsWith('ORDER BY t.due_at NULLS LAST,t.id LIMIT 100 OFFSET $3'));}
 assert.match(queries.overdue,/t.due_at<now()/);assert.ok(queries.upcoming.includes("t.due_at>=now() AND t.due_at<now()+interval '168 hours'"));assert.match(queries.unscheduled,/t.due_at IS NULL/);
 for(const due of ['overdue','upcoming','unscheduled'])assert.ok(queries[due].includes("t.status<> 'done'"));assert.ok(queries.all.includes('AND (TRUE)'));
 await assert.rejects(store.read({workspace:W,entity:'tasks',offset:100,due:'constructor'},7));await assert.rejects(store.read({workspace:W,entity:'opportunities',offset:100,due:'all'},7));
});
