'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {dashboard}=require('../api/_dashboard');const {withRegistry}=require('../api/_dashboard_registry');
const now=1800000000000;

test('Command Center summary uses registry projects, approvals, activity and Agenti AI flows',()=>{
 const base=dashboard({data:{projects:[{id:'radix',name:'RADIX v3.7'},{id:'old',name:'Solo v3.7'}],history:{}}},{name:'Anna'},now);
 const reg={
  projects:[{id:'radix',name:'RADIX',kind:'brand',summary:'Studio',client_name:null,modules:['editorial']},{id:'acme-1',name:'Lancio Acme',kind:'agency',client_name:'Acme',modules:['agents','pm']}],
  approvals:[{id:'a1',project_id:'acme-1',subject_type:'strategy',summary:'Strategia v1',state:'approved',requested_by:'user:1',reviewer_name:'Bruno',self_review:false,project_name:'Lancio Acme',requested_at:new Date(now-5000),decided_at:new Date(now-4000)},
   {id:'a2',project_id:'acme-1',subject_type:'content',summary:'Post',state:'awaiting_approval',requested_by:'agent:copywriter',project_name:'Lancio Acme',requested_at:new Date(now-3000)}],
  activity:[{id:7,project_id:'acme-1',action:'document.saved',subject:'pm',at:new Date(now-1000),actor:'Anna',project_name:'Lancio Acme'}],
  agentDocs:[{project_id:'acme-1',data:{conversations:{'marketing-orchestrator':[{role:'user',content:'x'},{role:'assistant',content:'PRIVATE_PLAN',flow:{status:'done',task:'Lancio',startedAt:now-9000,endedAt:now-2000,nodes:[{role:'copywriter',status:'done',subtask:'Post',output:'PRIVATE_OUTPUT'}],log:[{t:now-2000,k:'done',x:'PRIVATE_LOG'}]}}]}}}]
 };
 const d=withRegistry(base,reg,now);
 assert.deepEqual(d.projects.map(p=>p.id),['radix','acme-1','old']);assert.equal(d.projects[1].client,'Acme');assert.equal(d.projects[1].registryKind,'agency');
 assert.equal(d.approvalsSupported,true);assert.equal(d.metrics.approvals,1);assert.equal(d.approvals[0].status,'Approvata');
 assert.match(d.approvals[1].reason,/richiesta da Copywriter/);assert.ok(d.attention.some(a=>a.id==='a2'));
 assert.equal(d.workflows[0].projectId,'acme-1');assert.equal(d.workflows[0].orchestrator,'Orchestratore Marketing');assert.equal(d.workflows[0].source,'agents-page');
 assert.equal(d.agentStatus.copywriter.status,'done');
 assert.match(d.activity[0].text,/Anna ha salvato il piano di progetto/);assert.equal(d.activity[0].orchestrator,'Lancio Acme');
 assert.doesNotMatch(JSON.stringify(d),/PRIVATE_/);
});

test('state API adds the registry when it exists and keeps working without it',()=>{
 const src=fs.readFileSync('api/state.js','utf8');
 assert.match(src,/registry\.withRegistry\(summary, await registry\.loadRegistry\(client\)\)/);
 assert.match(src,/catch \(_\) \{ \/\* registry not migrated yet/);
 assert.match(fs.readFileSync('control-center-v2.html','utf8'),/Agenti AI sul progetto/);
});
