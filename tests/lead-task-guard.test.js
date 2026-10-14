'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),guard=require('../sales/lead-task-guard');
const a={company_id:'co-1',title:'Primo contatto · Alfa'},b={company_id:'co-2',title:a.title};
test('finds a matching CRM task and stops reading',async()=>{
 let count=0;const row=await guard.findExisting({companyId:a.company_id,title:a.title,fetchPage:async()=>{count++;return [a]}});assert.equal(row,a);assert.equal(count,1);
});
test('ignores tasks from another company and finishes complete scan',async()=>{
 const x=await guard.findExisting({companyId:a.company_id,title:a.title,fetchPage:async()=>[b]});assert.equal(x,null);
});
test('finds duplicate on a later page of 100',async()=>{
 const offsets=[];const x=await guard.findExisting({companyId:a.company_id,title:a.title,fetchPage:async offset=>{offsets.push(offset);return offset===0?Array.from({length:100},(_,i)=>({company_id:'other',title:'Task '+i})):[a]}});assert.equal(x,a);assert.deepEqual(offsets,[0,100]);
});
test('fails closed on unknown pages, malformed results and incomplete scan',async()=>{
 await assert.rejects(()=>guard.findExisting({companyId:a.company_id,title:a.title,fetchPage:async()=>({rows:[]})}),/non valida/);
 await assert.rejects(()=>guard.findExisting({companyId:a.company_id,title:a.title,fetchPage:async()=>Array.from({length:100},()=>b)}),/incompleta/);
});
test('requires a scoped lookup function and identified task',async()=>{
 await assert.rejects(()=>guard.findExisting({companyId:'',title:a.title,fetchPage:async()=>[]}),/non valida/);
 await assert.rejects(()=>guard.findExisting({companyId:a.company_id,title:a.title}),/non valida/);
});
