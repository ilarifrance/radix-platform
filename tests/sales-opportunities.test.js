'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {command,calendarDate,createHandler}=require('../api/_sales');
const {createStore}=require('../api/_sales_store');
const W='11111111-1111-4111-8111-111111111111',ID='22222222-2222-4222-8222-222222222222';
const cmd=(data,action='create')=>command({workspace:W,entity:'opportunities',action,data:action==='create'?{title:'Deal',process_id:ID,stage_id:ID,...data}:{id:ID,version:4,...data}});
test('opportunity owner integer or null, strict calendar date or null, omitted unchanged',()=>{
 for(const owner_id of [1,2147483647,null])assert.equal(cmd({owner_id}).data.owner_id,owner_id);
 for(const owner_id of ['7',0,-1,1.2,2147483648,ID,true,{}])assert.throws(()=>cmd({owner_id}));
 for(const expected_close of ['0001-01-01','9999-12-31','2024-02-29','2026-10-14',null])assert.equal(cmd({expected_close}).data.expected_close,expected_close);
 for(const expected_close of ['0000-01-01','10000-01-01','2026-02-29','2026-04-31','2026-1-01','2026-10-14T00:00:00Z','2026-10-14+01:00','infinity','',123,{}]){assert.equal(calendarDate(expected_close),false);assert.throws(()=>cmd({expected_close}));}
 const update=cmd({owner_id:null,expected_close:null},'update');assert.equal(update.data.version,4);assert.equal(update.data.owner_id,null);assert.equal(update.data.expected_close,null);
 assert.equal(Object.hasOwn(cmd({title:'Retitle'},'update').data,'owner_id'),false);
 assert.throws(()=>cmd({owner_id:7,stage_id:ID},'update'));
 assert.throws(()=>cmd({owner_id:7,stage_id:ID,key:ID},'transition'));
 assert.throws(()=>command({workspace:W,entity:'tasks',action:'create',data:{title:'Task',owner_id:7}}));
});
async function request(role,uid=7,code){let writes=0,seen;const res={setHeader(){},status(n){this.code=n;return this;},json(v){this.body=v;}};await createHandler({getSessionUser:()=>uid?{uid}:null,getStore:()=>({membership:async()=>role?{role}:null,command:async(c,u)=>{writes++;seen={c,u};if(code)throw Object.assign(Error('private SQL'),{code});return c.data;}})})({method:'POST',headers:{'content-type':'application/json','x-radix-sales':'1'},body:{workspace:W,entity:'opportunities',action:'update',data:{id:ID,version:4,owner_id:12,expected_close:'2026-10-14'}}},res);return {res,writes,seen};}
test('opportunity metadata ACL denies viewer missing unknown and unauthenticated actors',async()=>{
 for(const role of ['viewer',null,'unknown']){const r=await request(role);assert.equal(r.res.code,403);assert.equal(r.writes,0);}
 const anon=await request('member',null);assert.equal(anon.res.code,401);assert.equal(anon.writes,0);
 for(const role of ['member','admin','owner']){const r=await request(role);assert.equal(r.res.code,200);assert.equal(r.seen.u,7);assert.equal(r.seen.c.workspace,W);assert.equal(r.res.body.rows[0].owner_id,12);}
});
test('opportunity metadata relational conflicts and stale version expose neutral errors',async()=>{
 for(const code of ['23503','40001']){const {res}=await request('member',7,code);assert.equal(res.code,409);assert.doesNotMatch(res.body.error,/private SQL/);}
});
test('opportunity reads preserve date-only output with parameterized tenant and membership guard',async()=>{
 let call;const store=createStore(async(q,p)=>{call=[q,p];return [{id:ID,owner_id:12,expected_close:'2026-10-14'}];});
 const rows=await store.read({workspace:W,entity:'opportunities',offset:100},7);
 assert.equal(rows[0].expected_close,'2026-10-14');assert.equal(rows[0].owner_id,12);
 assert.match(call[0],/expected_close::text AS expected_close/);assert.match(call[0],/JOIN users/);assert.ok(call[0].includes('t.workspace_id=$1'));assert.ok(call[0].includes('LIMIT 100 OFFSET $3'));assert.deepEqual(call[1],[W,7,100]);
});
test('opportunity commands bind nullable metadata and preserve nested JSON date-only values',async()=>{
 let call;const store=createStore(async(q,p)=>{call=[q,p];return [{result:{id:ID,owner_id:null,expected_close:'2026-10-14'}}];});
 const c=cmd({owner_id:null,expected_close:'2026-10-14'},'update');const result=await store.command(c,7);
 assert.equal(result.expected_close,'2026-10-14');assert.equal(result.owner_id,null);assert.equal(call[1][0],W);assert.equal(call[1][1],7);assert.deepEqual(JSON.parse(call[1][4]),c.data);assert.ok(!call[0].includes('2026-10-14'));
});
test('STATIC migration adds tenant owner FK nullable date bounds and only extends opportunity allowlists',()=>{
 const prior=fs.readFileSync('migrations/sales/003_activities.sql','utf8');const sql=fs.readFileSync('migrations/sales/004_opportunity_owner_close.sql','utf8');
 for(const token of ['BEGIN;','owner_id integer','expected_close date','isfinite(expected_close)',"DATE '0001-01-01'","DATE '9999-12-31'",'FOREIGN KEY(workspace_id,owner_id) REFERENCES sales_memberships(workspace_id,user_id)','sales_opportunities_owner_close'])assert.ok(sql.includes(token),token);
 assert.ok(!sql.includes('ON DELETE CASCADE'));assert.ok(!sql.includes('SECURITY DEFINER'));
 const marker='CREATE OR REPLACE FUNCTION sales_command';assert.equal(sql.slice(sql.indexOf(marker)).replaceAll(",'owner_id','expected_close'",''),prior.slice(prior.indexOf(marker)));
});
