'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateEnvelope,projectOpportunity}=require('../api/_sales_intelligence');
const W='11111111-1111-4111-8111-111111111111',O='22222222-2222-4222-8222-222222222222',A='33333333-3333-4333-8333-333333333333';
function input(){return {workspace:W,opportunityId:O,asOf:'2026-10-12T09:30:00.000Z',rows:[{entity:'opportunities',record:{workspace_id:W,id:O,version:1,company_id:null,contact_id:null,process_id:A,stage_id:O,amount_cents:0,owner_id:null,expected_close:null}},{entity:'tasks',record:{workspace_id:W,id:A,version:1,opportunity_id:O,company_id:null,contact_id:null,title:'Task',status:'todo',assignee_id:null,priority:'normal',due_at:null}},{entity:'interactions',record:{workspace_id:W,id:A,version:1,opportunity_id:O,company_id:null,contact_id:null,title:'Call',kind:'call',occurred_at:'2026-10-12T09:00:00Z',body:'PRIVATE'}}]};}
test('runtime projection minimizes fields and preserves unknowns without mutating input',()=>{
 const source=input(),before=structuredClone(source),v=projectOpportunity(source);
 assert.ok(validateEnvelope(v));assert.deepEqual(source,before);assert.equal(v.amount,0);assert.equal(v.activities.length,2);assert.equal(v.dataQuality.activitiesComplete,false);assert.equal(v.dataQuality.completeness,'partial');assert.ok(!JSON.stringify(v).includes('PRIVATE'));
 for(const k of v.dataQuality.missingFields)assert.equal(v[k],null);
});
test('runtime validates all closed objects and all required properties',()=>{
 const good=projectOpportunity(input());
 for(const path of [[],['stage'],['dataQuality'],['activities',0],['activities',1]]){
 const get=v=>path.reduce((a,k)=>a[k],v);
 for(const k of Object.keys(get(good))){const v=structuredClone(good);delete get(v)[k];assert.equal(validateEnvelope(v),false,path+':'+k);}
 const v=structuredClone(good);get(v).execute='untrusted';assert.equal(validateEnvelope(v),false);
 }
 for(const v of [null,[],{},'x'])assert.equal(validateEnvelope(v),false);
});
test('runtime asserts calendar timestamp UUID integer and null-only semantics',()=>{
 for(const [k,values] of Object.entries({asOf:['0000-01-01T00:00:00Z','2026-02-29T00:00:00Z','2026-10-12T00:00:00+00:00'],closeDate:['2026-02-29','0000-01-01','2026-10-14T00:00:00Z'],ownerId:[0,2147483648,'1'],recordVersion:[0,1.1,2147483648],amount:[-1,9000000000001,'0',NaN],organizationId:['x'],currency:['EUR'],probability:[0],nextAction:[{}],contractVersion:['2.0.0']})){
  for(const value of values){const v=projectOpportunity(input());v[k]=value;assert.equal(validateEnvelope(v),false,k+':'+value);}
 }
 const s=input();s.rows[0].record.expected_close='2024-02-29';s.rows[0].record.owner_id=2147483647;assert.ok(validateEnvelope(projectOpportunity(s)));
});
test('runtime rejects inconsistent completeness and missing-field declarations',()=>{
 for(const mutate of [v=>v.dataQuality.missingFields.pop(),v=>v.dataQuality.missingFields.push('clientId'),v=>v.dataQuality.activitiesComplete=true,v=>v.dataQuality.issues=[],v=>v.activities.push(v.activities[0]),v=>v.activities[0].title='  ',v=>v.activities[0].dueAt='2026-04-31T00:00:00Z',v=>v.activities[1].occurredAt='invalid']){const v=projectOpportunity(input());mutate(v);assert.equal(validateEnvelope(v),false);}
});
test('projection rejects foreign tenant root relationship and unsupported entity without leaking values',()=>{
 for(const mutate of [s=>s.workspace=A,s=>s.opportunityId=A,s=>s.rows.shift(),s=>s.rows.push(s.rows[0]),s=>s.rows[1].record.workspace_id=A,s=>s.rows[1].record.opportunity_id=A,s=>s.rows[1].record.company_id=A,s=>s.rows[1].record.contact_id=A,s=>s.rows[1].entity='leads',s=>delete s.rows[0].record.owner_id,s=>s.rows.push({entity:'companies',record:{workspace_id:W,id:A}})]){
 const s=input();mutate(s);assert.throws(()=>projectOpportunity(s),/^Error: Sales intelligence input unavailable or invalid.$/);
 }
});
test('projection deduplicates identical activities and rejects competing versions',()=>{
 const s=input();s.rows.push(structuredClone(s.rows[1]));const v=projectOpportunity(s);assert.equal(v.activities.length,2);assert.ok(v.dataQuality.issues.includes('duplicate_activities'));
 s.rows.at(-1).record.version=2;assert.throws(()=>projectOpportunity(s));
});
test('projection caps activity export explicitly and validates beyond truncated boundary',()=>{
 const s=input(),template=s.rows[1];s.rows=s.rows.slice(0,1);
 for(let i=0;i<1001;i++)s.rows.push({entity:'tasks',record:{...template.record,id:'33333333-3333-4333-8333-'+String(i).padStart(12,'0')}});
 const v=projectOpportunity(s);assert.equal(v.activities.length,1000);assert.ok(v.dataQuality.issues.includes('activity_limit_exceeded'));assert.equal(v.dataQuality.activitiesComplete,false);
 s.rows.at(-1).record.title='';assert.throws(()=>projectOpportunity(s));
 s.rows=Array(1101).fill(template);assert.throws(()=>projectOpportunity(s));
});
