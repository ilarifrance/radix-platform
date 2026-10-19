'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const B=require('../lib/lead-contact-batches');
const V=require('../api/_lead_contact_jobs');
const workspace='11111111-1111-4111-8111-111111111111',source='https://example.org/authorized-export';
test('archives 600 people in three batches with workspace and versioned command',()=>{
 let work=B.start(source);
 for(let k=0;k<3;k++){const rows=Array.from({length:200},(_,i)=>({fullName:'Person '+(k*200+i),profileUrl:'https://example.org/person/'+(k*200+i),companyName:'Company'}));work=B.add(work,rows,'lot-'+k)}
 work.providerRunUid='run123';
 const valid=V.payload(work);
 assert.equal(valid.records.length,600);assert.equal(valid.batches.length,3);assert.equal(valid.providerRunUid,'run123');
 const command=V.command({workspace,entity:'lead_contact_jobs',action:'create',data:{title:'Verifica',payload:work}});
 assert.ok(command.data.id);assert.equal(command.data.payload.total,600);
});
test('rejects absent sources, unexpected fields and conflicting batch IDs',()=>{
 assert.throws(()=>V.payload({...B.start(''),records:[],total:0}),/Fonte HTTPS/);
 const v=B.add(B.start(source),[{fullName:'Test'}],'lot-1');
 assert.throws(()=>V.payload({...v,batches:[...v.batches,v.batches[0]]}),/duplicato/);
 assert.throws(()=>V.payload({...v,unexpected:'hidden'}),/Schema/);
});
