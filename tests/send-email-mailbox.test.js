'use strict';
/* /api/send-email with «workspace»: one-off sends (Customer360, follow-up, campaign «Invia», ticket replies) leave from the
   workspace's active mailbox (Impostazioni › Caselle email) through the queue worker's sender, not from the server Gmail. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const mcrypto=require('../api/_mailbox_crypto.js');
const sendEmail=require('../api/_send-email.js');
const read=f=>fs.readFileSync(__dirname+'/../'+f,'utf8');
const W='5b1d2c3e-4f50-4a61-8b72-9c83d4e5f601',M1='11111111-1111-4111-8111-111111111111',M2='22222222-2222-4222-8222-222222222222';
// Throwaway test key, generated per run: never a real one.
const ENV={MAILBOX_ENC_KEY:crypto.randomBytes(32).toString('base64'),JWT_SECRET:'test-secret-for-send-tests-0123456789',GMAIL_USER:'server@radix.example',GMAIL_APP_PASSWORD:'x'.repeat(16)};
const res=()=>{const r={headers:{},setHeader(k,v){r.headers[k]=v},status(s){r.code=s;return r},json(b){r.body=b;return r}};return r};
function mailboxRow(id,extra){
 return {workspace_id:W,id,label:'Vendite',from_name:'RADIX Vendite',from_email:'vendite@radix.example',smtp_host:'smtp.gmail.com',smtp_port:465,smtp_secure:true,smtp_user:'vendite@radix.example',provider:'gmail',
  ...mcrypto.encrypt('abcdefghijklmnop',{workspace:W,id},ENV),oauth_ciphertext:null,oauth_iv:null,oauth_tag:null,daily_limit:50,warmup_start:null,status:'active',...extra};
}
function harness({member=true,rows=[mailboxRow(M1)],fail}={}){
 const seen=[],sent=[],transports=[];
 const sql=async(q,p)=>{seen.push([q.replace(/\s+/g,' '),p]);
  if(/FROM sales_email_suppressions/.test(q))return [];
  if(/SELECT 1 FROM sales_memberships/.test(q))return member?[{}]:[];
  if(/FROM sales_mailboxes m WHERE/.test(q))return rows.filter(r=>r.status==='active'&&(p[1]==null||r.id===p[1])).slice(0,1);
  if(/^UPDATE sales_mailboxes SET auth_failures/.test(q.trim()))return [];
  throw new Error('unexpected '+q.slice(0,80))};
 const h=sendEmail.createHandler({getSessionUser:()=>({uid:7}),getSql:()=>sql,env:ENV,createTransport:o=>{transports.push(o);return {sendMail:async m=>{if(fail)throw new Error(fail);sent.push(m);return {messageId:'m1'}}}}});
 const call=async body=>{const r=res();await h({method:'POST',headers:{host:'radix.example'},body:{subject:'Ciao',body:'Testo',confirm:true,...body}},r);return r};
 return {call,seen,sent,transports};
}

test('with «workspace» the message leaves from the first active mailbox of the workspace, via SMTP with its decrypted app password',async()=>{
 const x=harness();
 const r=await x.call({to:'Mario Rossi <mario@acme.it>',workspace:W});
 assert.equal(r.code,200,JSON.stringify(r.body));assert.equal(r.body.ok,true);assert.deepEqual(r.body.mailbox,{id:M1,label:'Vendite',from_email:'vendite@radix.example'});
 assert.equal(x.transports.length,1);assert.equal(x.transports[0].auth.user,'vendite@radix.example');assert.equal(x.transports[0].auth.pass,'abcdefghijklmnop');
 assert.equal(x.sent.length,1);assert.equal(x.sent[0].to,'mario@acme.it');assert.deepEqual(x.sent[0].from,{name:'RADIX Vendite',address:'vendite@radix.example'});assert.equal(x.sent[0].text,'Testo');
 const mb=x.seen.find(s=>/FROM sales_mailboxes m WHERE/.test(s[0]));assert.deepEqual(mb[1],[W,null]);assert.match(mb[0],/m\.status='active'/);
 assert.ok(x.seen.some(s=>/SELECT 1 FROM sales_memberships WHERE workspace_id=\$1 AND user_id=\$2/.test(s[0])&&s[1][1]===7),'membership checked');
 assert.ok(x.seen.some(s=>/UPDATE sales_mailboxes SET auth_failures=0/.test(s[0])),'a good send clears the failure count');
 assert.ok(!JSON.stringify(x.seen).includes('abcdefghijklmnop'),'the password never reaches the database layer');
});

test('a chosen mailbox is used; no active mailbox → 409; not a member → 403; bad ids → 400; several recipients → 400',async()=>{
 let x=harness({rows:[mailboxRow(M1),mailboxRow(M2,{label:'Supporto'})]});
 let r=await x.call({to:'mario@acme.it',workspace:W,mailbox:M2});assert.equal(r.code,200);assert.equal(r.body.mailbox.label,'Supporto');
 x=harness({rows:[mailboxRow(M1,{status:'paused'})]});r=await x.call({to:'mario@acme.it',workspace:W});assert.equal(r.code,409);assert.match(r.body.error,/Nessuna casella attiva/);assert.equal(x.transports.length,0);
 x=harness({member:false});r=await x.call({to:'mario@acme.it',workspace:W});assert.equal(r.code,403);assert.equal(x.transports.length,0);
 x=harness();r=await x.call({to:'mario@acme.it',workspace:'nope'});assert.equal(r.code,400);
 r=await x.call({to:'mario@acme.it',workspace:W,mailbox:'nope'});assert.equal(r.code,400);
 r=await x.call({to:'a@acme.it, b@acme.it',workspace:W});assert.equal(r.code,400);assert.match(r.body.error,/un destinatario alla volta/);
 assert.equal(x.transports.length,0,'nothing opened for refused calls');
});

test('a failed send answers 502 with the mailbox name and counts the failure; without «workspace» the server Gmail still sends',async()=>{
 let x=harness({fail:'535 Invalid login'});
 let r=await x.call({to:'mario@acme.it',workspace:W});assert.equal(r.code,502);assert.match(r.body.error,/casella «Vendite»/);assert.match(r.body.error,/535/);
 assert.ok(x.seen.some(s=>/auth_failures\+1/.test(s[0])),'the failure is counted on the mailbox');
 x=harness();r=await x.call({to:'mario@acme.it'});assert.equal(r.code,200);assert.equal(r.body.mailbox,undefined);assert.equal(x.sent[0].from,'server@radix.example');
 assert.ok(!x.seen.some(s=>/sales_mailboxes/.test(s[0])),'no mailbox lookup without a workspace');
});

test('pages: every direct send goes through sales/crm-send-direct.js, which prefers the workspace mailbox and names it next to the buttons',()=>{
 const direct=read('sales/crm-send-direct.js');
 assert.match(direct,/a\.api\('mailboxes',\{\}\)/);assert.match(direct,/x\.status==='active'/);assert.match(direct,/body\.workspace=cache\.workspace;body\.mailbox=c\.mailbox\.id/);
 assert.match(direct,/'\/api\/integrations\/status'/,'server Gmail stays the fallback');
 for(const f of ['sales/crm-record.js','sales/crm-follow-up.js','sales/crm-campaigns.js','sales/crm-ticket-reply.js']){
  const src=read(f);assert.doesNotMatch(src,/fetch\('\/api\/send-email/,f+' has no direct fetch');assert.doesNotMatch(src,/\/api\/integrations\/status/,f);assert.match(src,/sender\(\)\.send\(\{to:/,f);
 }
 assert.match(read('sales/crm-record.js'),/sender\(\)\.describe\(ready\)/);
 assert.match(read('sales/crm-mailboxes.js'),/RadixCrmSendDirect\.reset\(\)/,'a mailbox change refreshes the choice');
 const html=read('radix-sales.html');assert.ok(html.indexOf('sales/crm-send-direct.js')<html.indexOf('sales/crm-ticket-reply.js'));
});
