'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHandler}=require('../api/_sales');
const {createStore}=require('../api/_sales_store');
const W='11111111-1111-4111-8111-111111111111';
test('read statement rechecks allowed role after membership preflight (revocation race)',async()=>{
 const calls=[];const store=createStore(async(q,p)=>{calls.push([q,p]);return [];});
 for(const c of [{entity:'companies'},{entity:'contacts',search:'x'},{entity:'tasks',due:'overdue'},{entity:'opportunities'},{entity:'members'},{entity:'dashboard'},{entity:'customer360',subject:'opportunities',id:W}])await store.read({workspace:W,offset:0,...c},7);
 await store.workspaces(7);
 for(const [q] of calls)assert.ok(q.includes("m.role IN ('owner','admin','member','viewer')"));
});
test('session user outside PostgreSQL integer range denied before store access',async()=>{
 for(const uid of [2147483648,Number.MAX_SAFE_INTEGER]){
 let calls=0;const res={setHeader(){},status(n){this.code=n;return this;},json(){}};
 await createHandler({getSessionUser:()=>({uid}),getStore:()=>{calls++;throw Error('must not run');}})({method:'GET',query:{entity:'workspaces'}},res);
 assert.equal(res.code,401);assert.equal(calls,0);
 }
});
