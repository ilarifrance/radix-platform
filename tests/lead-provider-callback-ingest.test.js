'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {receive}=require('../api/_lead_provider_callback');
const ws='11111111-1111-4111-8111-111111111111',job='22222222-2222-4222-8222-222222222222',secret='abcd'.repeat(12);
const event={run:{run_uid:'run123',batch_uid:'batch4',status:'SUCCEEDED'},results:[{first_name:'Ada',last_name:'Rossi',job_title:'CEO',company:{name:'Example'}}]};
const req={method:'POST',headers:{'content-type':'application/json','x-radix-provider-token':secret},query:{workspace:ws,job},body:event};
test('rejects missing/invalid callback secret and production',async()=>{
 const store={leadContactJobs:{receive:async()=>({})}};
 await assert.rejects(()=>receive(req,store,{VERCEL_ENV:'production',CAPTAIN_DATA_CALLBACK_SECRET:secret}),/produzione/);
 await assert.rejects(()=>receive({...req,headers:{...req.headers,'x-radix-provider-token':'wrong'}},store,{VERCEL_ENV:'preview',CAPTAIN_DATA_CALLBACK_SECRET:secret}),/autorizzato/);
});
test('forwards a validated source-bound run and normalized person only',async()=>{
 let seen;
 const store={leadContactJobs:{receive:async(...args)=>{seen=args;return{accepted:true}}}};
 const r=await receive(req,store,{VERCEL_ENV:'preview',CAPTAIN_DATA_CALLBACK_SECRET:secret});
 assert.equal(r.accepted,true);assert.equal(seen[0],ws);assert.equal(seen[1],job);assert.equal(seen[2],'run123');assert.equal(seen[3][0].companyName,'Example');assert.equal(seen[4],'run-run123-batch4');
});
