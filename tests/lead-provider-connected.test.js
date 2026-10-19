'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),C=require('../api/_lead_provider_client');
test('does not infer LinkedIn account from provider API key alone',()=>{
 const v=C.status({VERCEL_ENV:'preview',CAPTAIN_DATA_API_KEY:'test',CAPTAIN_DATA_USER_UID:'test-user'});
 assert.equal(v.configured,true);assert.equal(v.linked,false);
});
test('read-only API lookup confirms LinkedIn only if provider reports it',async()=>{
 const env={VERCEL_ENV:'preview',CAPTAIN_DATA_API_KEY:'test',CAPTAIN_DATA_USER_UID:'user-123'};
 let called=0;
 const f=async(_url,opts)=>{called++;assert.equal(opts.method,'GET');return{ok:true,json:async()=>({integrations:['linkedin']})}};
 const v=await C.verify(env,f);assert.equal(called,1);assert.equal(v.linked,true);assert.equal(v.automatedExtraction,false);
 const no=await C.verify(env,async()=>({ok:true,json:async()=>({integrations:[]})}));assert.equal(no.linked,false);
});
