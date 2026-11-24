'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {command,memberCommand}=require('../api/_sales');
const {createStore}=require('../api/_sales_store');
const W='5b1d2c3e-4f50-4a61-8b72-9c83d4e5f601',ID='9220862f-d82e-4c33-a2b2-899d4a77fe16';
const cmd=(entity,action,data)=>command({workspace:W,entity,action,data});
test('contact and company records accept the phase A fields and clear empty strings',()=>{
 const c=cmd('contacts','create',{name:'Giulia',email:'giulia@example.it',phone:'+39 333',role:'CMO',linkedin_url:'https://linkedin.com/in/g',marketing_consent:true,consent_at:'2026-10-16T10:00:00Z'});
 assert.equal(c.data.email,'giulia@example.it');
 assert.equal(cmd('companies','update',{id:ID,version:1,website:'',city:'Milano'}).data.website,null);
 assert.throws(()=>cmd('contacts','create',{name:'X',email:'non-email'}),/Email non valida/);
 assert.throws(()=>cmd('companies','create',{name:'X',website:'javascript:alert(1)'}),/Indirizzo web/);
 assert.throws(()=>cmd('contacts','create',{name:'X',marketing_consent:'yes'}),/Consenso/);
});
test('won/lost: a lost deal needs a reason, outcome is not settable at creation',()=>{
 assert.throws(()=>cmd('opportunities','update',{id:ID,version:1,outcome:'lost'}),/motivo/);
 assert.equal(cmd('opportunities','update',{id:ID,version:1,outcome:'lost',lost_reason:'Prezzo'}).data.outcome,'lost');
 assert.throws(()=>cmd('opportunities','update',{id:ID,version:1,outcome:'won',lost_reason:'Prezzo'}),/solo per le trattative perse/);
 assert.equal(cmd('opportunities','update',{id:ID,version:1,lost_reason:'Tempi'}).data.lost_reason,'Tempi');
 assert.throws(()=>cmd('opportunities','create',{title:'T',process_id:ID,stage_id:ID,outcome:'won'}),/Campo non consentito/);
 assert.throws(()=>cmd('opportunities','update',{id:ID,version:1,probability:101}),/Probabilità/);
});
test('member commands are strict and never take a user id for additions',()=>{
 assert.deepEqual(memberCommand({workspace:W,entity:'members',action:'add',data:{email:' a@b.it ',role:'member'}}).data,{email:'a@b.it',role:'member'});
 assert.throws(()=>memberCommand({workspace:W,entity:'members',action:'add',data:{email:'a@b.it',role:'member',user_id:3}}));
 assert.throws(()=>memberCommand({workspace:W,entity:'members',action:'update',data:{user_id:2,role:'god'}}));
 assert.ok(memberCommand({workspace:W,entity:'members',action:'remove',data:{user_id:2}}));
});
test('member command errors become plain messages',async()=>{
 const store=createStore(async()=>{throw new Error('unknown user')});
 await assert.rejects(store.memberCommand({workspace:W,action:'add',data:{email:'x@y.it',role:'member'}},1),e=>e.status===404&&/Nessun account/.test(e.message));
});
test('acquisition shares the CRM database and migration 008 keeps author and last-owner guards',()=>{
 const src=fs.readFileSync('api/_sales_store.js','utf8');assert.ok(src.includes('const leadSql=sql;'));assert.ok(!src.includes('LEAD_DATABASE_URL'));
 const sql=fs.readFileSync('migrations/sales/008_crm_phase_a.sql','utf8');
 for(const t of ["format(',%s',actor)",'last owner',"CHECK(outcome='lost' OR lost_reason IS NULL)",'FOR SHARE OF m,u','pg_advisory_xact_lock'])assert.ok(sql.includes(t),t);
});
