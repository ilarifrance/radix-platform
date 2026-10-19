'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHandler}=require('../api/_sales'),{createStore}=require('../api/_sales_store');
const W='11111111-1111-4111-8111-111111111111';
async function request(query={},role='viewer',user={uid:7}){
 const calls=[];const res={setHeader(){},status(n){this.code=n;return this;},json(v){this.body=v;}};
 await createHandler({getSessionUser:()=>user,getStore:()=>({membership:async(w,u)=>{calls.push(['membership',w,u]);return role?{role}:null;},read:async(c,u)=>{calls.push(['read',c,u]);return [{id:'found',name:'Result'}];}})})({method:'GET',query:{workspace:W,entity:'companies',...query}},res);
 return {res,calls};
}
test('search accepts ordinary unicode names, trims and retains page, viewer read allowed',async()=>{
 for(const entity of ['companies','contacts'])for(const search of [' Nexus 01 ','Élodie','100%_\\','u0000']){
  const {res,calls}=await request({entity,search,offset:'100'});assert.equal(res.code,200,search);assert.deepEqual(calls[1],['read',{workspace:W,entity,offset:100,search:search.trim()},7]);
 }
});
test('search rejects controls, nonstrings, excessive length and unsupported resources before store',async()=>{
 for(const search of ['x'.repeat(201),'a\nb','a\tb','a\0b','a\x7fb',[],{},42]){const {res,calls}=await request({search});assert.equal(res.code,400);assert.equal(calls.length,0);}
 for(const entity of ['tasks','dashboard','members','workspaces','customer360']){const {res,calls}=await request({entity,search:'X'});assert.equal(res.code,400);assert.equal(calls.length,0);}
});
test('search requires session and recognized tenant membership',async()=>{
 for(const role of [null,'unknown']){const {res,calls}=await request({search:'Private'},role);assert.equal(res.code,403);assert.equal(calls.filter(c=>c[0]==='read').length,0);}
 const {res,calls}=await request({search:'Private'},'viewer',null);assert.equal(res.code,401);assert.equal(calls.length,0);
});
test('empty search valid and unfiltered request keeps existing shape',async()=>{
 const empty=await request({search:'   '});assert.equal(empty.res.code,200);assert.equal(empty.calls[1][1].search,'');
 const all=await request();assert.equal(Object.hasOwn(all.calls[1][1],'search'),false);
});
test('SQL search is literal parameterized tenant guarded before limit, no DB execution',async()=>{
 const calls=[],store=createStore(async(q,p)=>{calls.push([q,p]);return [];});
 for(const entity of ['companies','contacts'])await store.read({workspace:W,entity,offset:100,search:"%_\\'; DROP TABLE users;--"},7);
 for(const [q,p] of calls){assert.match(q,/t.workspace_id=\$1/);assert.match(q,/JOIN users/);assert.match(q,/user_id=\$2/);assert.match(q,/strpos\(lower\(t.name\),lower\(\$4::text\)\)>0 ORDER BY t.id LIMIT 100 OFFSET \$3/);assert.ok(!q.includes('DROP'));assert.deepEqual(p,[W,7,100,"%_\\'; DROP TABLE users;--"]);}
 await assert.rejects(store.read({workspace:W,entity:'tasks',search:'X'},7));
});
