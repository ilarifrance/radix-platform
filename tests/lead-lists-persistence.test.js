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
