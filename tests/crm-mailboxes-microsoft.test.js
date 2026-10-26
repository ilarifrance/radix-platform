'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const ms=require('../api/_ms_oauth.js');
const mailq=require('../api/_sales_mailboxes.js');
const worker=require('../api/_sales_send_worker.js');
const cb=require('../api/ms-oauth.js');
const W='5b1d2c3e-4f50-4a61-8b72-9c83d4e5f601',M1='11111111-1111-4111-8111-111111111111';
const ENV={MAILBOX_ENC_KEY:crypto.randomBytes(32).toString('base64'),JWT_SECRET:'test-secret-for-ms-oauth-tests-0123456789',MS_CLIENT_ID:'cid-123',MS_CLIENT_SECRET:'top-secret-value',MS_TENANT_ID:'11111111-2222-3333-4444-555555555555'};
const NOW=Date.parse('2026-10-26T22:00:00Z');
const json=(status,body)=>({ok:status>=200&&status<300,status,json:async()=>body,clone(){return json(status,body)}});

test('state: signed, bound to the key, expires after 10 minutes, tamper-proof',()=>{
 const s=ms.signState(ENV.JWT_SECRET,{w:W,u:7},NOW);
 assert.equal(ms.verifyState(ENV.JWT_SECRET,s,NOW+60e3).u,7);
 assert.equal(ms.verifyState(ENV.JWT_SECRET,s,NOW+11*60e3),null);
 assert.equal(ms.verifyState('another-secret-0123456789abcdef',s,NOW),null);
 const [b,m]=s.split('.');assert.equal(ms.verifyState(ENV.JWT_SECRET,Buffer.from(JSON.stringify({w:W,u:8,exp:NOW+1e6})).toString('base64url')+'.'+m,NOW),null);
 for(const bad of [undefined,'',b,b+'.'+m+'.x',123])assert.equal(ms.verifyState(ENV.JWT_SECRET,bad,NOW),null);
});

test('authorize URL: tenant, scopes (Mail.Send, offline_access), redirect and state, no secret',()=>{
 const u=new URL(ms.authorizeUrl(ENV,{redirectUri:'https://radix-platform.vercel.app/api/ms-oauth',state:'st'}));
 assert.equal(u.pathname,'/11111111-2222-3333-4444-555555555555/oauth2/v2.0/authorize');
 assert.equal(u.searchParams.get('client_id'),'cid-123');assert.equal(u.searchParams.get('state'),'st');
 assert.match(u.searchParams.get('scope'),/offline_access/);assert.match(u.searchParams.get('scope'),/Mail\.Send/);
 assert.ok(!u.href.includes('top-secret-value'));
 assert.ok(ms.authorizeUrl({MS_CLIENT_ID:'x',MS_CLIENT_SECRET:'y'},{redirectUri:'https://a.b/c',state:'s'}).includes('/organizations/'));
});

test('token errors: auth failures are EAUTH and never quote the client secret',async()=>{
 const f=async()=>json(400,{error:'invalid_grant',error_description:'AADSTS70000 token top-secret-value expired'});
 await assert.rejects(()=>ms.refresh(ENV,'rt',f),e=>e.code==='EAUTH'&&!e.message.includes('top-secret-value'));
 await assert.rejects(()=>ms.refresh(ENV,'rt',async()=>{throw new Error('net')}),e=>e.code==='EMSNET');
});

test('sendMail: Graph payload with List-Unsubscribe; retries once without headers if Graph refuses them',async()=>{
 const calls=[];
 const ok=async(url,o)=>{calls.push({url,body:JSON.parse(o.body),auth:o.headers.Authorization});return {status:202,ok:true,json:async()=>({})}};
 await ms.sendMail('AT',{to:'a@b.it',subject:'Ciao',text:'Testo',unsubscribe:'https://x/u'},ok);
 assert.equal(calls[0].url,'https://graph.microsoft.com/v1.0/me/sendMail');assert.equal(calls[0].auth,'Bearer AT');
 assert.equal(calls[0].body.message.toRecipients[0].emailAddress.address,'a@b.it');
 assert.deepEqual(calls[0].body.message.internetMessageHeaders.map(h=>h.name),['List-Unsubscribe','List-Unsubscribe-Post']);
 const seen=[];const picky=async(url,o)=>{const b=JSON.parse(o.body);seen.push(!!b.message.internetMessageHeaders);return b.message.internetMessageHeaders?json(400,{error:{message:'Invalid internet message header'}}):{status:202,ok:true,json:async()=>({})}};
 await ms.sendMail('AT',{to:'a@b.it',subject:'s',text:'t',unsubscribe:'https://x/u'},picky);assert.deepEqual(seen,[true,false]);
 await assert.rejects(()=>ms.sendMail('AT',{to:'a@b.it',subject:'s',text:'t'},async()=>json(401,{error:{message:'bad token'}})),e=>e.code==='EAUTH');
 await assert.rejects(()=>ms.sendMail('AT',{to:'a@b.it',subject:'s',text:'t'},async()=>json(503,{})),e=>e.code==='EMS'&&e.responseCode===undefined);
});

test('refresh token sealed in oauth_* columns, bound to workspace and mailbox',()=>{
 const e=ms.sealToken('refresh-token-value',W,M1,ENV);
 assert.deepEqual(Object.keys(e),['oauth_ciphertext','oauth_iv','oauth_tag']);assert.ok(!JSON.stringify(e).includes('refresh-token-value'));
 assert.equal(ms.openToken({workspace_id:W,id:M1,...e},ENV),'refresh-token-value');
 assert.throws(()=>ms.openToken({workspace_id:W,id:'22222222-2222-4222-8222-222222222222',...e},ENV));
});

test('command oauth_start: validated, no extra fields, bounded limit',()=>{
 const c=mailq.command({workspace:W,entity:'mailboxes',action:'oauth_start',data:{label:' Francesco GCP ',from_name:'Francesco Ilari',daily_limit:30}});
 assert.deepEqual(c.data,{label:'Francesco GCP',daily_limit:30,from_name:'Francesco Ilari'});
 for(const data of [{},{label:'x',from_email:'a@b.it'},{label:'x',daily_limit:99},{label:'x',daily_limit:'5'},{label:'x',password:'p'}])assert.throws(()=>mailq.command({workspace:W,entity:'mailboxes',action:'oauth_start',data}));
});

const fakeSql=(rows={})=>{const log=[];const f=async(q,p)=>{log.push({q,p});if(/count\(\*\)::int AS n/.test(q))return [{n:rows.count||0}];if(/FROM users WHERE id/.test(q))return [{email:'f.ilari@gcpcorporate.com'}];if(/FROM sales_mailboxes WHERE workspace_id=\$1 AND id=\$2$/.test(q))return rows.mailbox?[rows.mailbox]:[];if(/FROM sales_mailboxes WHERE workspace_id=\$1 AND lower/.test(q))return rows.old?[{id:rows.old}]:[];if(/INSERT INTO sales_mailboxes/.test(q))return [{id:p[1]}];return []};f.log=log;return f};

test('oauth_start: owner/admin only, needs server config, returns the Microsoft URL for the site host',async()=>{
 const c=mailq.command({workspace:W,entity:'mailboxes',action:'oauth_start',data:{label:'GCP'}});
 const req={method:'POST',headers:{host:'radix-platform.vercel.app'}};
 const r=await mailq.handle(c,{sql:fakeSql(),user:7,role:'admin',req,env:ENV,now:NOW});
 const u=new URL(r.rows[0].oauth_url);assert.equal(u.hostname,'login.microsoftonline.com');assert.equal(u.searchParams.get('redirect_uri'),'https://radix-platform.vercel.app/api/ms-oauth');
 const st=ms.verifyState(ENV.JWT_SECRET,u.searchParams.get('state'),NOW);assert.equal(st.w,W);assert.equal(st.u,7);assert.equal(st.l,'GCP');
 await assert.rejects(()=>mailq.handle(c,{sql:fakeSql(),user:7,role:'member',req,env:ENV,now:NOW}),e=>e.status===403);
 await assert.rejects(()=>mailq.handle(c,{sql:fakeSql(),user:7,role:'owner',req,env:{...ENV,MS_CLIENT_ID:''},now:NOW}),e=>e.status===503);
 await assert.rejects(()=>mailq.handle(c,{sql:fakeSql({count:5}),user:7,role:'owner',req,env:ENV,now:NOW}),e=>e.status===409);
});

const res=()=>{const r={headers:{}, setHeader(k,v){r.headers[k]=v},end(){r.ended=true},status(c){r.code=c;return r},json(b){r.body=b;return r}};return r};
function callback({query,user={uid:7},role='owner',sql=fakeSql(),fetchImpl}){
 const store={membership:async()=>role?{role}:null,sql};
 const h=cb.createHandler({getSessionUser:()=>user,getStore:()=>store,env:ENV,fetchImpl,now:()=>NOW});
 const r=res();return h({method:'GET',query,headers:{}},r).then(()=>({r,sql}));
}
const goodState=()=>ms.signState(ENV.JWT_SECRET,{w:W,u:7,l:'GCP',f:'Francesco Ilari',d:40,r:'https://radix-platform.vercel.app/api/ms-oauth'},NOW-1000);
const graph=async(url,o)=>{
 if(/oauth2\/v2\.0\/token/.test(url))return json(200,{access_token:'AT',refresh_token:'RT-new',expires_in:3600});
 if(/\/me\?/.test(url))return json(200,{displayName:'Francesco Ilari',mail:'F.Ilari@gcpcorporate.com'});
 throw new Error('unexpected '+url);
};

test('callback: stores the sender from the Microsoft account with the refresh token encrypted, then back to the settings page',async()=>{
 const {r,sql}=await callback({query:{code:'abc',state:goodState()},fetchImpl:graph});
 assert.equal(r.statusCode,302);assert.match(r.headers.Location,/^\/impostazioni\.html\?ms=ok#caselle$/);
 const ins=sql.log.find(x=>/INSERT INTO sales_mailboxes/.test(x.q));
 assert.equal(ins.p[4],'f.ilari@gcpcorporate.com');assert.equal(ins.p[2],'GCP');assert.equal(ins.p[3],'Francesco Ilari');assert.equal(ins.p[8],40);
 assert.ok(!JSON.stringify(ins.p).includes('RT-new'));
 assert.equal(ms.openToken({workspace_id:W,id:ins.p[1],oauth_ciphertext:ins.p[5],oauth_iv:ins.p[6],oauth_tag:ins.p[7]},ENV),'RT-new');
 assert.ok(sql.log.some(x=>/INSERT INTO sales_audit/.test(x.q)&&x.p[4]==='oauth_create'));
});

test('callback: reconnecting an existing address replaces its credentials and clears the error',async()=>{
 const {r,sql}=await callback({query:{code:'abc',state:goodState()},sql:fakeSql({old:M1}),fetchImpl:graph});
 assert.match(r.headers.Location,/ms=ok/);
 const up=sql.log.find(x=>/UPDATE sales_mailboxes SET provider='microsoft'/.test(x.q));assert.ok(up);assert.equal(up.p[1],M1);assert.match(up.q,/password_ciphertext=NULL/);assert.match(up.q,/status='active'/);
});

test('callback refuses: tampered or expired state, another user, non-admin, Microsoft error, no refresh token',async()=>{
 const bad=async o=>(await callback(o)).r.headers.Location;
 assert.match(await bad({query:{code:'abc',state:'x.y'},fetchImpl:graph}),/ms=error/);
 assert.match(await bad({query:{code:'abc',state:ms.signState(ENV.JWT_SECRET,{w:W,u:7},NOW-20*60e3)},fetchImpl:graph}),/ms=error/);
 assert.match(await bad({query:{code:'abc',state:goodState()},user:{uid:8},fetchImpl:graph}),/ms=error/);
 assert.match(await bad({query:{code:'abc',state:goodState()},user:null,fetchImpl:graph}),/ms=error/);
 assert.match(await bad({query:{code:'abc',state:goodState()},role:'member',fetchImpl:graph}),/ms=error/);
 assert.match(await bad({query:{error:'access_denied',state:goodState()},fetchImpl:graph}),/ms=error/);
 const noRt=async url=>/token/.test(url)?json(200,{access_token:'AT'}):graph(url);
 assert.match(await bad({query:{code:'abc',state:goodState()},fetchImpl:noRt}),/ms=error/);
 const loc=await bad({query:{code:'abc',state:goodState()},fetchImpl:async()=>json(400,{error:'invalid_grant',error_description:'secret top-secret-value'})});
 assert.ok(!decodeURIComponent(loc).includes('top-secret-value'));
});

test('worker: a Microsoft mailbox sends through Graph and stores a rotated refresh token',async()=>{
 const e=ms.sealToken('RT-old',W,M1,ENV),m={workspace_id:W,id:M1,provider:'microsoft',from_email:'f.ilari@gcpcorporate.com',...e};
 const calls=[],saved=[];
 const f=async(url,o)=>{calls.push(url);if(/token/.test(url)){assert.match(String(o.body),/refresh_token=RT-old/);return json(200,{access_token:'AT',refresh_token:'RT-rot',expires_in:3600})}return {status:202,ok:true,json:async()=>({})}};
 const send=worker.smtpSender({env:ENV,createTransport:()=>{throw new Error('SMTP must not be used')},fetchImpl:f,saveToken:async(mb,enc)=>saved.push(enc)});
 await send(m,{to:'a@b.it',subject:'s',text:'t',unsubscribe:'https://x/u'});await send(m,{to:'c@d.it',subject:'s',text:'t',unsubscribe:'https://x/u'});
 assert.equal(calls.filter(u=>/token/.test(u)).length,1,'one refresh per mailbox and run');assert.equal(calls.filter(u=>/sendMail/.test(u)).length,2);
 assert.equal(saved.length,1);assert.equal(ms.openToken({workspace_id:W,id:M1,...saved[0]},ENV),'RT-rot');
 await assert.rejects(()=>worker.smtpSender({env:ENV,createTransport:()=>{},fetchImpl:async()=>json(400,{error:'invalid_grant'})})(m,{to:'a@b.it',subject:'s',text:'t'}),e=>e.code==='EAUTH');
});

test('«Prova invio» of a Microsoft mailbox goes through Graph to the user',async()=>{
 const e=ms.sealToken('RT-old',W,M1,ENV);
 const sql=fakeSql({mailbox:{workspace_id:W,id:M1,label:'GCP',provider:'microsoft',from_email:'f.ilari@gcpcorporate.com',...e}});
 const sent=[];const f=async(url,o)=>{if(/token/.test(url))return json(200,{access_token:'AT',refresh_token:'RT-old'});sent.push(JSON.parse(o.body));return {status:202,ok:true,json:async()=>({})}};
 const c=mailq.command({workspace:W,entity:'mailboxes',action:'test',data:{id:M1,confirm:true}});
 const r=await mailq.handle(c,{sql,user:7,role:'owner',req:{method:'POST',headers:{}},env:ENV,now:NOW,fetchImpl:f,createTransport:()=>{throw new Error('SMTP must not be used')}});
 assert.equal(r.rows[0].ok,true);assert.equal(sent[0].message.toRecipients[0].emailAddress.address,'f.ilari@gcpcorporate.com');
 const fail=await mailq.handle(c,{sql,user:7,role:'owner',req:{method:'POST',headers:{}},env:ENV,now:NOW,fetchImpl:async()=>json(400,{error:'invalid_grant',error_description:'expired'}),createTransport:()=>{}});
 assert.equal(fail.rows[0].ok,false);assert.match(fail.rows[0].error,/Accesso Microsoft rifiutato/);
});

test('migration 019 and the UI: provider column, nullable password, MS button; queue/settings copy unchanged for SMTP',()=>{
 const m=fs.readFileSync(__dirname+'/../migrations/sales/019_crm_mailbox_oauth.sql','utf8');
 assert.match(m,/ADD COLUMN IF NOT EXISTS provider/);assert.match(m,/DROP NOT NULL/);assert.match(m,/sales_mailboxes_credentials/);
 const ui=fs.readFileSync(__dirname+'/../sales/crm-mailboxes.js','utf8');assert.match(ui,/Collega con Microsoft 365/);assert.match(ui,/oauth_start/);
});
