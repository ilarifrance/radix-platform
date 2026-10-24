'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const u=require('../api/_sales_unsubscribe.js');
const {createHandler}=require('../api/_sales');
const {planCampaign,withUnsubscribe}=require('../sales/crm-campaigns.js');
const K='k'.repeat(40),W='5b1d2c3e-4f50-4a61-8b72-9c83d4e5f601',C='8924f329-b2c2-4032-9be5-2982d9cd8e5c';
const res=()=>{const r={headers:{},setHeader(k,v){r.headers[k]=v},status(s){r.code=s;return r},json(b){r.body=b;return r},send(b){r.body=b;return r}};return r};

test('tokens round-trip and reject tampering, other keys and junk',()=>{
 const t=u.sign(K,W,C);assert.equal(t.length,64);assert.deepEqual(u.verify(K,t),{workspace:W,contact:C});
 assert.equal(u.verify('z'.repeat(40),t),null);
 const flip=t.slice(0,10)+(t[10]==='A'?'B':'A')+t.slice(11);assert.equal(u.verify(K,flip),null,'changed contact id');
 for(const bad of [undefined,'',t.slice(1),t+'A','x'.repeat(64),['a']])assert.equal(u.verify(K,bad),null);
 assert.throws(()=>u.sign('',W,C));assert.throws(()=>u.sign(K,'nope',C));
});

test('link page: GET asks to confirm, POST withdraws consent once, bad token changes nothing',async()=>{
 const calls=[];const sql=async(q,p)=>{calls.push([q,p]);return /^UPDATE/.test(q)?[{id:C}]:[]};
 let r=res();await u.handle({method:'GET',query:{unsubscribe:u.sign(K,W,C)}},r,{getSql:()=>sql,secret:K});
 assert.equal(r.code,200);assert.match(r.body,/<form method="post">/);assert.equal(calls.length,0,'GET writes nothing');
 assert.match(r.headers['Content-Security-Policy'],/default-src 'none'/);
 r=res();await u.handle({method:'POST',query:{unsubscribe:u.sign(K,W,C)}},r,{getSql:()=>sql,secret:K});
 assert.equal(r.code,200);assert.match(r.body,/Disiscrizione registrata/);
 // Consent off + stamped note (also without consent: «Prospezione B2B»), the timeline marker, queued emails cancelled.
 assert.equal(calls.length,3);assert.match(calls[0][0],/SET marketing_consent=false,consent_at=NULL/);assert.match(calls[0][0],/AND \(marketing_consent OR NOT \(/);assert.deepEqual(calls[0][1],[W,C]);
 assert.match(calls[1][0],/^INSERT INTO sales_interactions/);assert.match(calls[1][0],/'Disiscrizione dalle email commerciali','note'/);assert.match(calls[1][0],/NOT EXISTS/);
 assert.match(calls[2][0],/^UPDATE sales_send_queue SET status='cancelled'/);assert.match(calls[2][0],/status='queued'/);
 r=res();await u.handle({method:'POST',query:{unsubscribe:'x'.repeat(64)}},r,{getSql:()=>{throw new Error('no db for junk')},secret:K});assert.equal(r.code,400);assert.equal(calls.length,3);
 r=res();await u.handle({method:'GET',query:{unsubscribe:u.sign(K,W,C)}},r,{getSql:()=>sql,secret:undefined});assert.equal(r.code,503);assert.match(r.body,/<h1>Servizio non disponibile/);
 assert.equal(u.secretOf({JWT_SECRET:'a',UNSUBSCRIBE_SECRET:'b'}),'b');assert.equal(u.secretOf({JWT_SECRET:'a'}),'a');
});

test('sales API: public unsubscribe skips the session, link requests are validated and scoped',async()=>{
 const seen=[];const store={sql:async(q,p)=>{seen.push(p);return /^SELECT id FROM sales_contacts/.test(q)?p[1].filter(x=>x===C).map(id=>({id})):[]},membership:async()=>({role:'member'})};
 process.env.JWT_SECRET=K;
 let h=createHandler({getSessionUser:()=>null,getStore:()=>store});
 let r=res();await h({method:'GET',headers:{},query:{unsubscribe:u.sign(K,W,C)}},r);assert.equal(r.code,200);
 h=createHandler({getSessionUser:()=>({uid:7}),getStore:()=>store});
 const post=data=>{const r=res();return h({method:'POST',headers:{'x-radix-sales':'1','content-type':'application/json'},query:{},body:{workspace:W,entity:'unsubscribe_links',action:'create',data}},r).then(()=>r)};
 const other='11111111-2222-4333-8444-555555555555';
 r=await post({contacts:[C,other,C]});assert.equal(r.code,200);assert.deepEqual(Object.keys(r.body.links),[C],'only contacts of this workspace');
 assert.deepEqual(u.verify(K,r.body.links[C]),{workspace:W,contact:C});assert.deepEqual(seen.at(-1),[W,[C,other]]);
 assert.equal((await post({contacts:[]})).code,400);assert.equal((await post({contacts:['x']})).code,400);
 assert.equal((await post({contacts:Array.from({length:301},()=>C)})).code,400);
 store.membership=async()=>({role:'viewer'});assert.equal((await post({contacts:[C]})).code,403);
});

test('campaign emails end with the contact link; contacts without a link are left out',()=>{
 const contacts=[{id:'a',name:'Anna',email:'a@x.it',marketing_consent:true},{id:'b',name:'Bruno',email:'b@x.it',marketing_consent:true}];
 const plan=withUnsubscribe(planCampaign('Ciao {nome}','x'.repeat(4000),contacts),{a:'T'.repeat(64)},'https://radix.example');
 assert.equal(plan.emails.length,1);assert.equal(plan.skipped.link,1);
 const e=plan.emails[0];assert.equal(e.unsubscribeUrl,'https://radix.example/api/sales?unsubscribe='+'T'.repeat(64));
 assert.ok(e.body.endsWith('Disiscriviti qui: '+e.unsubscribeUrl));assert.equal(e.body.length,4000);
});

test('send-email accepts only a same-site unsubscribe link and sets List-Unsubscribe',()=>{
 const src=fs.readFileSync('api/_send-email.js','utf8');
 assert.ok(src.includes('u.host !== host'));assert.ok(src.includes('u.origin + "/api/sales?unsubscribe=" + token'));assert.ok(src.includes('.split(",")[0].trim()'));assert.ok(src.includes('"List-Unsubscribe-Post": "List-Unsubscribe=One-Click"'));
});
