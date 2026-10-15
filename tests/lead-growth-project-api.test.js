'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createHandler}=require('../api/_sales');
const ws='11111111-1111-4111-8111-111111111111';
function setup(role='owner'){const called=[],store={leadLists:{membership:async()=>({role})},growthProjects:{read:async c=>{called.push('read');return[{id:ws}]},command:async c=>{called.push('write');return{id:ws}}}};
 const handle=createHandler({getSessionUser:()=>({uid:1}),getStore:()=>store});
 const response=()=>({code:null,body:null,setHeader(){},status(n){this.code=n;return this},json(x){this.body=x;return this}});
 return{handle,response,called};}
test('growth projects GET is workspace-authorized and read-only',async()=>{
 const x=setup(),r=x.response();await x.handle({method:'GET',headers:{},query:{entity:'lead_growth_projects',workspace:ws}},r);
 assert.equal(r.code,200);assert.deepEqual(x.called,['read']);
});
test('growth project write requires membership and client authorization headers',async()=>{
 const x=setup('viewer'),r=x.response();await x.handle({method:'POST',headers:{'x-radix-sales':'1','content-type':'application/json'},body:{workspace:ws,entity:'lead_growth_projects',action:'delete',data:{id:ws,version:1}}},r);
 assert.equal(r.code,403);assert.deepEqual(x.called,[]);
});
