'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {payload,command}=require('../api/_lead_lists');
const {createLeadListStore}=require('../api/_lead_lists_store');
const w='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
const prospect={name:'Alpha',domain:'alpha.it',country:'Italia',industry:'Industria',companySize:'PMI',contactRole:'CEO',source:'https://alpha.it/team'};
const icp={country:'Italia',industry:'Industria',size:'PMI',role:'CEO'};
const approval={index:0,contact:'Mario',email:'mario@alpha.it',source:'https://alpha.it/team',basis:'consent',notes:'',checked:true,privacy:true,draft:{subject:'Ciao',body:'Messaggio'},plan:[]};
const data={icp,prospects:[prospect],reviews:[approval]};
test('well-formed lists are validated and generate IDs',()=>{
 const c=command({workspace:w,entity:'lead_lists',action:'create',data:{title:'Lead Milano',payload:data}});
 assert.match(c.data.id,/^[0-9a-f-]{36}$/);assert.equal(c.data.payload.prospects[0].domain,'alpha.it');
});
test('rejects unreviewed and demo contacts, bad input, oversized payload, cross-index',()=>{
 assert.throws(()=>payload({...data,reviews:[{...approval,checked:false}]}),/Revisione/);
 assert.throws(()=>payload({...data,prospects:[{...prospect,domain:'alpha.example'}]}),/dimostrativi/);
 assert.throws(()=>payload({...data,reviews:[{...approval,index:1}]}),/senza prospect/);
 assert.throws(()=>command({workspace:w,entity:'lead_lists',action:'update',data:{id,version:0,title:'x',payload:data}}),/versione|Versione/i);
 assert.throws(()=>payload({...data,unexpected:1}),/Archivio/);
});
test('workspace-scoped SQL uses user membership, version CAS and bounded list',async()=>{
 const queries=[],raw=async(sql,args)=>{queries.push({sql,args});return [{id,title:'Lead Milano',version:1}]};
 const s=createLeadListStore(raw),c={workspace:w,entity:'lead_lists',action:'update',data:{id,version:1,title:'Lead Milano',payload:data}};
 await s.command(c,8);assert.match(queries[0].sql,/m\.user_id=\$2/);assert.match(queries[0].sql,/t\.version=\$4/);
 assert.equal(queries[0].args[1],8);assert.equal(queries[0].args[0],w);
 await s.read({workspace:w,offset:0},8);assert.match(queries[1].sql,/t\.workspace_id=\$1/);
});
test('stale version errors fail closed with a conflict',async()=>{
 const store=createLeadListStore(async()=>[]);
 await assert.rejects(()=>store.command({workspace:w,entity:'lead_lists',action:'delete',data:{id,version:1}},8),e=>e.status===409);
});

test('isolated vault membership and workspace listing require a matching logged-in uid',async()=>{
 const observed=[],user=42,workspace=w;
 const vault=createLeadListStore(async(sql,args)=>{observed.push({sql,args});return [{id:workspace,name:'Lead Preview',role:'owner'}]});
 assert.equal((await vault.membership(workspace,user)).role,'owner');
 assert.equal((await vault.workspaces(user))[0].name,'Lead Preview');
 assert.deepEqual(observed[0].args,[workspace,user]);assert.deepEqual(observed[1].args,[user]);
 assert.match(observed[0].sql,/sales_memberships/);
 assert.match(observed[1].sql,/sales_workspaces/);
});
test('signed session accesses only isolated membership on lead archive routes',async()=>{
 const {createHandler}=require('../api/_sales');
 const calls=[];
 const iso={membership:async()=>{calls.push('isolated-member');return {role:'owner'};},workspaces:async()=>{calls.push('isolated-workspaces');return [{id:w,name:'Test',role:'owner'}]},read:async()=>{calls.push('isolated-read');return []}};
 const original={membership:async()=>{throw Error('Shared DB must not be used for lead archive')},workspaces:async()=>{throw Error('Shared DB must not be used for lead archive')},leadLists:iso};
 const run=async query=>{const res={setHeader(){},status(s){this.statusCode=s;return this},json(data){this.result=data;return this}};await createHandler({getSessionUser:()=>({uid:42}),getStore:()=>original})({method:'GET',headers:{},query},res);return res};
 const wks=await run({entity:'lead_workspaces'});assert.equal(wks.statusCode,200);
 const lists=await run({entity:'lead_lists',workspace:w,offset:'0'});assert.equal(lists.statusCode,200);
 assert.deepEqual(calls,['isolated-workspaces','isolated-member','isolated-read']);
});
test('viewer is forbidden to write archive but can read it',async()=>{
 const {createHandler}=require('../api/_sales');
 const res={setHeader(){},status(s){this.statusCode=s;return this},json(data){this.result=data;return this}};
 const vault={membership:async()=>({role:'viewer'})},original={membership:async()=>{throw Error('Shared CRM DB access forbidden')},leadLists:vault};
 const cmd={workspace:w,entity:'lead_lists',action:'delete',data:{id,version:1}};
 await createHandler({getSessionUser:()=>({uid:42}),getStore:()=>original})({method:'POST',headers:{'x-radix-sales':'1','content-type':'application/json'},body:cmd},res);
 assert.equal(res.statusCode,403);
});
