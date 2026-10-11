'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {command,timestamp,createHandler}=require('../api/_sales');
const {createStore,normalize}=require('../api/_sales_store');
const W='11111111-1111-4111-8111-111111111111',ID='22222222-2222-4222-8222-222222222222';
const cmd=(entity,data,action='create')=>command({workspace:W,entity,action,data});
test('UTC rejects ambiguous timestamps invalid calendar and year zero',()=>{
 for(const v of ['0000-01-01T00:00:00Z','2026-10-10','2026-10-10T12:00:00','2026-10-10T12:00:00+02:00','2026-02-30T12:00:00Z','2026-10-10T24:00:00Z','infinity',null,123])assert.equal(timestamp(v),false,String(v));
 for(const v of ['2026-10-10T12:00:00Z','2024-02-29T12:00:00.123Z'])assert.equal(timestamp(v),true);
});
test('PostgreSQL nested JSON and native dates normalize to UTC milliseconds',()=>{
 const result=normalize([{record:{occurred_at:'2026-10-10T14:00:00.123456+02:00',due_at:null,created_at:new Date('2026-10-10T12:00:00Z')}}]);
 assert.equal(result[0].record.occurred_at,'2026-10-10T12:00:00.123Z');assert.equal(result[0].record.due_at,null);assert.ok(timestamp(result[0].record.created_at));assert.throws(()=>normalize({due_at:'infinity'}));
});
test('task assignment integer bounds priority and nullable deadline',()=>{
 assert.equal(cmd('tasks',{title:'Follow-up',assignee_id:7,priority:'urgent',due_at:'2026-10-11T12:00:00Z',company_id:ID}).data.assignee_id,7);
 for(const assignee_id of ['7',0,-1,1.1,2147483648,ID])assert.throws(()=>cmd('tasks',{title:'X',assignee_id}));
 for(const priority of ['fallback','',null,3])assert.throws(()=>cmd('tasks',{title:'X',priority}));
 assert.equal(cmd('tasks',{title:'X',assignee_id:null,due_at:null}).data.due_at,null);
});
test('interaction CRUD strict text timestamps and field allowlist',()=>{
 const data={title:'Call',kind:'call',occurred_at:'2026-10-10T14:00:00Z',body:'Note',company_id:ID};
 assert.equal(cmd('interactions',data).data.kind,'call');
 assert.equal(cmd('interactions',{id:ID,version:1,body:''},'update').data.body,'');
 assert.equal(cmd('interactions',{id:ID,version:1},'delete').data.id,ID);
 for(const patch of [{kind:'send-email'},{body:'x'.repeat(4001)},{occurred_at:null},{actor_id:7},{workspace_id:ID}])assert.throws(()=>cmd('interactions',{...data,...patch}));
 assert.throws(()=>cmd('interactions',{title:'No date',kind:'note'}));
});
test('explicit process fields validate zero days and strict enums',()=>{
 const data={title:'Next',process_id:ID,position:1,task_title:'Call',task_assignee_id:7,task_priority:'high',task_due_days:0};
 assert.equal(cmd('stages',data).data.task_due_days,0);
 for(const patch of [{task_due_days:-1},{task_due_days:3651},{task_due_days:'1'},{task_assignee_id:'7'},{task_priority:'auto'}])assert.throws(()=>cmd('stages',{...data,...patch}));
});
async function request(query,role='viewer',post){let seen;const store={membership:async()=>role?{role}:null,read:async c=>{seen=c;return [];},command:async c=>{seen=c;return c.data;}};const res={setHeader(){},status(s){this.code=s;return this;},json(v){this.body=v;return this;}};await createHandler({getSessionUser:()=>({uid:7}),getStore:()=>store})({method:post?'POST':'GET',query,body:post,headers:{'content-type':'application/json','x-radix-sales':'1'}},res);return {res,seen};}
test('Customer360 validated scope pagination and membership deny default',async()=>{
 const q={workspace:W,entity:'customer360',subject:'contacts',id:ID,offset:'100'};
 const {res,seen}=await request(q);assert.equal(res.code,200);assert.equal(seen.subject,'contacts');assert.equal(seen.offset,100);
 for(const patch of [{subject:'users'},{id:'bad'},{offset:['0']},{offset:'-1'},{subject:['contacts']}])assert.equal((await request({...q,...patch})).res.code,400);
 for(const role of [null,'unknown','__proto__'])assert.equal((await request(q,role)).res.code,403);
 assert.equal((await request({workspace:W,entity:'tasks',subject:'contacts',id:ID})).res.code,400);
});
test('interaction writes enforce server role membership',async()=>{
 const post={workspace:W,entity:'interactions',action:'create',data:{title:'Note',kind:'note',occurred_at:'2026-10-10T12:00:00Z',company_id:ID}};
 assert.equal((await request({},'viewer',post)).res.code,403);assert.equal((await request({},'member',post)).res.code,200);assert.equal((await request({},null,post)).res.code,403);
});
test('Customer360 query binds scope and caps every combined page',async()=>{
 const calls=[];const store=createStore(async(q,p)=>{calls.push([q,p]);return [];});
 for(const subject of ['companies','contacts','opportunities'])await store.read({workspace:W,entity:'customer360',subject,id:ID,offset:100},7);
 for(const [q,p] of calls){for(const s of ['WITH root AS','JOIN users','LIMIT 100 OFFSET $5','EXISTS(SELECT 1 FROM root)'])assert.ok(q.includes(s));assert.deepEqual(p.slice(0,3),[W,7,ID]);assert.equal(p[4],100);assert.ok(!q.includes(ID));}
 await assert.rejects(store.read({workspace:W,entity:'customer360',subject:'users',id:ID,offset:0},7));
});
test('member selector excludes credentials and scopes pagination',async()=>{
 let call;const store=createStore(async(q,p)=>{call=[q,p];return [];});await store.read({workspace:W,entity:'members',offset:0},7);
 assert.ok(call[0].includes('m.user_id AS id,u.name,m.role'));assert.ok(call[0].includes('LIMIT 100 OFFSET $3'));assert.ok(!/email|password/i.test(call[0]));assert.deepEqual(call[1],[W,7,0]);
});
test('STATIC SQL contracts composite context audit explicit rules (not DB execution)',()=>{
 const sql=fs.readFileSync('migrations/sales/003_activities.sql','utf8');
 for(const token of ['REFERENCES sales_memberships(workspace_id,user_id)','FOREIGN KEY(workspace_id,opportunity_id,contact_id)','NEW.company_id IS DISTINCT FROM c','NEW.contact_id IS DISTINCT FROM o.contact_id','linked contact context','linked opportunity context','num_nonnulls(task_title,task_assignee_id,task_priority,task_due_days) IN(0,4)',"interval '24 hours'",'pg_advisory_xact_lock','FOR SHARE OF m,u',"jsonb_build_object('before',current_row,'after'",'legacy context requires explicit reviewed remediation'])assert.ok(sql.includes(token),token);
 assert.ok(sql.trimEnd().endsWith('COMMIT;'));assert.ok(!sql.includes('SECURITY DEFINER'));
});
