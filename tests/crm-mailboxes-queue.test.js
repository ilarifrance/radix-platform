'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto');
const mcrypto=require('../api/_mailbox_crypto.js');
const core=require('../api/_sales_queue_core.js');
const mailq=require('../api/_sales_mailboxes.js');
const worker=require('../api/_sales_send_worker.js');
const sales=require('../api/_sales.js');
const campaigns=require('../sales/crm-campaigns.js');
const read=f=>fs.readFileSync(__dirname+'/../'+f,'utf8');
const W='5b1d2c3e-4f50-4a61-8b72-9c83d4e5f601',M1='11111111-1111-4111-8111-111111111111',M2='22222222-2222-4222-8222-222222222222';
const C1='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',C2='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',C3='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
// Throwaway test key, generated per run: never a real one.
const ENV={MAILBOX_ENC_KEY:crypto.randomBytes(32).toString('base64'),JWT_SECRET:'test-secret-for-mailbox-tests-0123456789'};
const PASSWORD='abcdefghijklmnop';
const seq=(...v)=>{let i=0;return ()=>v[i++%v.length]};
const at=(s)=>Date.parse(s);

// ---------- crypto ----------
test('crypto: AES-256-GCM roundtrip, random iv, base64 fields, hex key accepted',()=>{
 const e1=mcrypto.encrypt(PASSWORD,{workspace:W,id:M1},ENV),e2=mcrypto.encrypt(PASSWORD,{workspace:W,id:M1},ENV);
 assert.notEqual(e1.password_ciphertext,e2.password_ciphertext,'a fresh iv every time');
 assert.ok(!JSON.stringify(e1).includes(PASSWORD));
 assert.equal(Buffer.from(e1.password_iv,'base64').length,12);assert.equal(Buffer.from(e1.password_tag,'base64').length,16);
 assert.equal(mcrypto.decrypt({workspace_id:W,id:M1,...e1},ENV),PASSWORD);
 const hex={MAILBOX_ENC_KEY:crypto.randomBytes(32).toString('hex')};
 assert.equal(mcrypto.decrypt({workspace_id:W,id:M1,...mcrypto.encrypt('x y',{workspace:W,id:M1},hex)},hex),'x y');
});
test('crypto: tampering, a row moved to another mailbox and a wrong key are all refused',()=>{
 const e=mcrypto.encrypt(PASSWORD,{workspace:W,id:M1},ENV),row={workspace_id:W,id:M1,...e};
 const flip=s=>{const b=Buffer.from(s,'base64');b[0]^=1;return b.toString('base64')};
 assert.throws(()=>mcrypto.decrypt({...row,password_ciphertext:flip(e.password_ciphertext)},ENV),/illeggibile/);
 assert.throws(()=>mcrypto.decrypt({...row,password_tag:flip(e.password_tag)},ENV),/illeggibile/);
 assert.throws(()=>mcrypto.decrypt({...row,password_iv:flip(e.password_iv)},ENV),/illeggibile/);
 assert.throws(()=>mcrypto.decrypt({...row,id:M2},ENV),/illeggibile/,'bound to its mailbox');
 assert.throws(()=>mcrypto.decrypt(row,{MAILBOX_ENC_KEY:crypto.randomBytes(32).toString('base64')}),/illeggibile/);
});
test('crypto: a missing or short key stops the save with a clear Italian message',()=>{
 for(const env of [{},{MAILBOX_ENC_KEY:''},{MAILBOX_ENC_KEY:'troppo-corta'}]){
  assert.throws(()=>mcrypto.encrypt(PASSWORD,{workspace:W,id:M1},env),e=>e.status===503&&/Password non salvata: manca la chiave di cifratura delle caselle \(MAILBOX_ENC_KEY\)/.test(e.message)&&!e.message.includes(PASSWORD));
  assert.equal(mcrypto.configured(env),false);
 }
 assert.equal(mcrypto.configured(ENV),true);
});

// ---------- ramp-up and scheduling ----------
test('ramp-up: days 1-3 → 10, days 4-7 → 25, then the daily limit (never above 50)',()=>{
 const r=(d,limit=50)=>core.rampLimit(limit,'2026-10-20',d);
 assert.deepEqual(['2026-10-20','2026-10-22','2026-10-23','2026-10-26','2026-10-27','2026-11-30'].map(d=>r(d)),[10,10,25,25,50,50]);
 assert.equal(r('2026-10-23',20),20);assert.equal(r('2026-10-20',5),5,'a lower limit wins');
 assert.equal(r('2026-12-01',80),50,'capped at 50');assert.equal(core.rampLimit(30,null,'2026-10-20'),30,'no warm-up date: the limit');
});
test('Europe/Rome working hours: 08:30 is 06:30Z in summer time and 07:30Z after the October change',()=>{
 assert.equal(new Date(core.romeToUtc('2026-10-23',core.START_MIN)).toISOString(),'2026-10-23T06:30:00.000Z');
 assert.equal(new Date(core.romeToUtc('2026-10-26',core.START_MIN)).toISOString(),'2026-10-26T07:30:00.000Z');
 assert.equal(new Date(core.romeToUtc('2026-10-26',core.END_MIN)).toISOString(),'2026-10-26T17:30:00.000Z');
 assert.equal(core.workday('2026-10-24'),false);assert.equal(core.workday('2026-10-26'),true);
});
const MB=(id,o={})=>({id,status:'active',daily_limit:50,warmup_start:'2026-01-01',...o});
function inHours(slots){for(const s of slots){const p=core.romeParts(s.at);assert.ok(core.workday(p.date),'weekday '+p.date);assert.ok(p.minutes>=core.START_MIN&&p.minutes<core.END_MIN,'in hours '+new Date(s.at).toISOString())}}
test('distribution: by remaining capacity, a new mailbox capped by its ramp-up, all in one day when it fits',()=>{
 const now=at('2026-10-20T06:00:00Z');// 08:00 in Rome, Tuesday
 const s=core.schedule({count:60,mailboxes:[MB(M1,{warmup_start:'2026-10-20'}),MB(M2)],now,random:seq(0.5)});
 assert.deepEqual(s.perMailbox,{[M1]:10,[M2]:50});assert.deepEqual(s.days,['2026-10-20']);assert.equal(s.unplanned,0);
 inHours(s.slots);assert.ok(s.slots[0].at>=core.romeToUtc('2026-10-20',core.START_MIN));
 // While both have room, the one with more room left gets the next email: balanced, not one after the other.
 const few=core.schedule({count:4,mailboxes:[MB(M1),MB(M2)],now,random:seq(0.5)});assert.deepEqual(few.perMailbox,{[M1]:2,[M2]:2});
 const load=core.schedule({count:30,mailboxes:[MB(M1),MB(M2)],load:{[M1]:{'2026-10-20':45}},now,random:seq(0.5)});
 assert.deepEqual(load.perMailbox,{[M2]:30},'emails already planned today use up capacity: the emptier mailbox takes them');
});
test('distribution: over several working days, skipping the weekend; paused mailboxes are not used',()=>{
 const fri=at('2026-10-23T06:00:00Z');
 const s=core.schedule({count:130,mailboxes:[MB(M1),MB(M2),MB('33333333-3333-4333-8333-333333333333',{status:'paused'})],now:fri,random:seq(0.3,0.9)});
 assert.deepEqual(s.days,['2026-10-23','2026-10-26']);assert.equal(s.slots.length,130);assert.equal(Object.keys(s.perMailbox).length,2);
 inHours(s.slots);
 const perDay={};for(const x of s.slots){const k=x.mailbox+core.romeDate(x.at);perDay[k]=(perDay[k]||0)+1}
 assert.ok(Object.values(perDay).every(n=>n<=50),'never above the daily limit');
 assert.deepEqual(core.schedule({count:5,mailboxes:[MB(M1,{status:'paused'})],now:fri}).unplanned,5,'no active mailbox: nothing planned');
});
test('working hours: a few random minutes between emails of a mailbox; late in the day it moves on',()=>{
 const now=at('2026-10-20T14:58:00Z');// 16:58 Rome
 const s=core.schedule({count:40,mailboxes:[MB(M1)],now,random:seq(0,0.99,0.4)});
 const mine=s.slots.map(x=>x.at);for(let i=1;i<mine.length;i++){const g=mine[i]-mine[i-1];if(core.romeDate(mine[i])===core.romeDate(mine[i-1]))assert.ok(g>=4*60e3&&g<9*60e3,'gap '+g)}
 assert.ok(mine[0]>=now+2*60e3,'never in the past');inHours(s.slots);
 assert.equal(core.romeDate(mine[mine.length-1]),'2026-10-21','what does not fit before 18:30 goes to the next day');
 const evening=core.schedule({count:1,mailboxes:[MB(M1)],now:at('2026-10-20T17:00:00Z'),random:seq(0)});
 assert.equal(new Date(evening.slots[0].at).toISOString(),'2026-10-21T06:30:00.000Z');
 const last=core.schedule({count:1,mailboxes:[MB(M1)],last:{[M1]:at('2026-10-20T08:00:00Z')},now:at('2026-10-20T07:00:00Z'),random:seq(0)});
 assert.equal(last.slots[0].at,at('2026-10-20T08:04:00Z'),'after the emails already planned for that mailbox');
});

// ---------- send-time decisions ----------
test('send time: withdrawn consent, missing address or deleted mailbox → skipped; paused → waits; limit or hours → next morning',()=>{
 const now=at('2026-10-20T08:00:00Z'),row={};
 const ok={marketing_consent:true,email:'mario@example.it'},mb=MB(M1);
 assert.deepEqual(core.decide(row,ok,mb,{now}),{action:'send',to:'mario@example.it'});
 assert.equal(core.decide(row,{...ok,marketing_consent:false},mb,{now}).action,'skip');
 assert.match(core.decide(row,{...ok,marketing_consent:false},mb,{now}).error,/Consenso marketing ritirato/);
 assert.equal(core.decide(row,{...ok,email:null},mb,{now}).action,'skip');
 assert.equal(core.decide(row,null,mb,{now}).action,'skip');
 assert.equal(core.decide(row,ok,null,{now}).action,'skip');
 assert.equal(core.decide(row,ok,{...mb,status:'paused'},{now}).action,'wait');
 const full=core.decide(row,ok,mb,{now,sentToday:50,random:seq(0)});assert.equal(full.action,'postpone');assert.equal(new Date(full.at).toISOString(),'2026-10-21T06:30:00.000Z');
 assert.equal(core.decide(row,ok,MB(M1,{warmup_start:'2026-10-20'}),{now,sentToday:10}).action,'postpone','ramp-up holds at send time too');
 const night=core.decide(row,ok,mb,{now:at('2026-10-23T19:00:00Z'),random:seq(0)});assert.equal(night.action,'postpone');assert.equal(core.romeDate(night.at),'2026-10-26');
});
test('SMTP errors: login refused is an auth error; 5xx fails; others retry up to 3 attempts; no password in messages',()=>{
 assert.equal(core.classify({code:'EAUTH',responseCode:535,message:'Invalid login'},1).auth,true);assert.equal(core.classify({code:'EAUTH'},9).status,'queued');
 assert.equal(core.classify({responseCode:550,message:'No such user'},1).status,'failed');
 assert.equal(core.classify({code:'ETIMEDOUT',message:'timeout'},1).status,'queued');
 assert.equal(core.classify({code:'ETIMEDOUT',message:'timeout'},3).status,'failed');
 assert.equal(core.cleanError({message:'bad '+PASSWORD+' login'},PASSWORD),'bad ••• login');
});

// ---------- API: commands, output, consent ----------
test('commands: mailbox fields allowlisted and checked; enqueue and test need confirm:true',()=>{
 const add=mailq.command({workspace:W,entity:'mailboxes',action:'add',data:{label:' Anna ',from_email:'anna@example.it',smtp_host:'smtp.gmail.com',smtp_user:'anna@example.it',password:'abcd efgh ijkl mnop'}});
 assert.equal(add.data.label,'Anna');assert.equal(add.data.password,PASSWORD,'spaces of the Gmail grouping removed');assert.equal(add.data.smtp_port,465);assert.equal(add.data.smtp_secure,true);assert.equal(add.data.daily_limit,50);
 const base={label:'A',from_email:'a@example.it',smtp_host:'smtp.gmail.com',smtp_user:'a',password:'x'};
 assert.throws(()=>mailq.command({workspace:W,entity:'mailboxes',action:'add',data:{...base,daily_limit:51}}),/da 1 a 50/);
 assert.throws(()=>mailq.command({workspace:W,entity:'mailboxes',action:'add',data:{...base,smtp_port:8080}}),/Porta/);
 assert.throws(()=>mailq.command({workspace:W,entity:'mailboxes',action:'add',data:{...base,smtp_host:'http://x'}}),/Server SMTP/);
 assert.throws(()=>mailq.command({workspace:W,entity:'mailboxes',action:'add',data:{...base,password_ciphertext:'x'}}),/non consentito/);
 assert.throws(()=>mailq.command({workspace:W,entity:'mailboxes',action:'test',data:{id:M1}}),/conferma/);
 const q={campaign:'Ottobre',subject:'Ciao {nome}',body:'Testo',contacts:[C1],origin:'https://radix.example'};
 assert.throws(()=>mailq.command({workspace:W,entity:'send_queue',action:'enqueue',data:q}),/non confermata/);
 assert.equal(mailq.command({workspace:W,entity:'send_queue',action:'plan',data:{...q,body:'Riga uno\n\tRiga due'}}).data.body,'Riga uno\n\tRiga due','line breaks kept');
 assert.throws(()=>mailq.command({workspace:W,entity:'send_queue',action:'plan',data:{...q,subject:'a\nb'}}),/non validi/);
 assert.equal(mailq.command({workspace:W,entity:'send_queue',action:'enqueue',data:{...q,confirm:true}}).action,'enqueue');
 assert.throws(()=>mailq.command({workspace:W,entity:'send_queue',action:'plan',data:{...q,contacts:Array(5001).fill(C1)}}),/5000/);
 assert.throws(()=>mailq.originOf({headers:{host:'radix.example'}},'https://evil.example'),/Origine/);
 assert.equal(mailq.originOf({headers:{host:'radix.example'}},'https://radix.example'),'https://radix.example');
});

// A small fake of the queries api/_sales_mailboxes.js runs (keeps full rows, as the worst case).
function fakeDb(){
 const db={mailboxes:[],queue:[],audit:[],calls:[],contacts:[
  {id:C1,name:'Mario Rossi',email:'mario@example.it',marketing_consent:true,company:'Alfa',role:'CEO'},
  {id:C2,name:'Lucia Verdi',email:'lucia@example.it',marketing_consent:false,company:'Beta'},
  {id:C3,name:'Senza Email',email:'',marketing_consent:true},
  {id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',name:'Mario Doppio',email:'MARIO@example.it',marketing_consent:true}]};
 db.sql=async(text,params=[])=>{
  db.calls.push({text,params});const t=text.replace(/\s+/g,' ');
  if(/^INSERT INTO sales_mailboxes/.test(t)){if(db.mailboxes.length>=params[14])return [];const [workspace_id,id,label,from_name,from_email,smtp_host,smtp_port,smtp_secure,smtp_user,password_ciphertext,password_iv,password_tag,daily_limit]=params;db.mailboxes.push({workspace_id,id,label,from_name,from_email,smtp_host,smtp_port,smtp_secure,smtp_user,password_ciphertext,password_iv,password_tag,daily_limit,warmup_start:'2026-10-20',status:'active',last_error:null,password:PASSWORD});return [{id}]}
  if(/FROM sales_mailboxes WHERE workspace_id=\$1 AND id=\$2/.test(t))return db.mailboxes.filter(m=>m.id===params[1]).map(m=>({...m}));
  if(/FROM sales_mailboxes WHERE workspace_id=\$1 ORDER BY/.test(t))return db.mailboxes.map(m=>({...m}));
  if(/^UPDATE sales_mailboxes SET last_error=\$3/.test(t)){db.mailboxes.find(m=>m.id===params[1]).last_error=params[2];return []}
  if(/^UPDATE sales_mailboxes/.test(t))return [];
  if(/^INSERT INTO sales_audit/.test(t)){db.audit.push(params);return []}
  if(/^SELECT email FROM users/.test(t))return [{email:'anna@radix.test'}];
  if(/FROM sales_send_queue WHERE workspace_id=\$1 AND mailbox_id IS NOT NULL/.test(t))return [];
  if(/^SELECT q\.contact_id,lower\(btrim\(c\.email\)\) AS email FROM sales_send_queue/.test(t))return db.queue.filter(q=>q.campaign===params[1]).map(q=>({contact_id:q.contact_id,email:db.contacts.find(c=>c.id===q.contact_id).email.toLowerCase()}));
  if(/FROM sales_contacts t LEFT JOIN sales_companies/.test(t))return db.contacts.filter(c=>params[1].includes(c.id));
  if(/^SELECT id FROM sales_contacts/.test(t))return db.contacts.filter(c=>params[1].includes(c.id)).map(c=>({id:c.id}));
  if(/^INSERT INTO sales_send_queue/.test(t)){const rows=JSON.parse(params[3]);for(const r of rows)db.queue.push({...r,campaign:params[1],created_by:params[2]});return rows.map((r,i)=>({id:i+1}))}
  throw new Error('unexpected query: '+t.slice(0,80));
 };
 return db;
}
const REQ={method:'POST',headers:{host:'radix.example'}};
test('API: the app password is encrypted before the database and never comes back, not even in a failed test',async()=>{
 const db=fakeDb(),sent=[];
 const createTransport=o=>({sendMail:async m=>{sent.push({o,m});if(m.subject.includes('fail'))throw Object.assign(new Error('535 bad credentials for '+o.auth.pass),{code:'EAUTH'});return {messageId:'x'}}});
 const ctx={sql:db.sql,user:1,role:'admin',req:REQ,env:ENV,createTransport,now:at('2026-10-20T08:00:00Z')};
 const add=await mailq.handle(mailq.command({workspace:W,entity:'mailboxes',action:'add',data:{label:'Anna',from_email:'anna@example.it',smtp_host:'smtp.gmail.com',smtp_user:'anna@example.it',password:PASSWORD}}),ctx);
 const ins=db.calls.find(c=>/INSERT INTO sales_mailboxes/.test(c.text));assert.ok(!JSON.stringify(ins.params).includes(PASSWORD),'only ciphertext reaches SQL');
 assert.ok(!JSON.stringify(db.audit).includes(PASSWORD));
 const id=add.rows[0].id;assert.equal(add.rows[0].password_saved,true);
 const list=await mailq.handle({workspace:W,entity:'mailboxes'},{...ctx,req:{method:'GET',headers:{}}});
 assert.equal(list.rows.length,1);assert.equal(list.rows[0].today_limit,10);assert.equal(list.encryption,true);
 const test=await mailq.handle(mailq.command({workspace:W,entity:'mailboxes',action:'test',data:{id,confirm:true}}),ctx);
 assert.equal(test.rows[0].ok,true);assert.equal(sent[0].m.to,'anna@radix.test','only to the logged-in user');assert.equal(sent[0].o.auth.pass,PASSWORD);
 db.mailboxes[0].label='fail';
 const bad=await mailq.handle(mailq.command({workspace:W,entity:'mailboxes',action:'test',data:{id,confirm:true}}),ctx);
 assert.equal(bad.rows[0].ok,false);
 for(const out of [add,list,test,bad]){const s=JSON.stringify(out);assert.ok(!s.includes(PASSWORD),'no password');assert.ok(!/password_(ciphertext|iv|tag)|"password"/.test(s),'no password fields')}
 await assert.rejects(mailq.handle(mailq.command({workspace:W,entity:'mailboxes',action:'pause',data:{id}}),{...ctx,role:'member'}),/owner e admin/);
 await assert.rejects(mailq.handle(mailq.command({workspace:W,entity:'mailboxes',action:'add',data:{label:'B',from_email:'b@example.it',smtp_host:'smtp.gmail.com',smtp_user:'b',password:'x'}}),{...ctx,env:{}}),/MAILBOX_ENC_KEY/);
 for(let i=0;i<4;i++)await mailq.handle(mailq.command({workspace:W,entity:'mailboxes',action:'add',data:{label:'B'+i,from_email:'b'+i+'@example.it',smtp_host:'smtp.gmail.com',smtp_user:'b',password:'x'}}),ctx);
 await assert.rejects(mailq.handle(mailq.command({workspace:W,entity:'mailboxes',action:'add',data:{label:'F',from_email:'f@example.it',smtp_host:'smtp.gmail.com',smtp_user:'f',password:'x'}}),ctx),/Massimo 5 caselle/);
});
test('queue: recipients with the campaign rules — consent skipped, unsubscribe link and List-Unsubscribe url, times planned',async()=>{
 const db=fakeDb();db.mailboxes.push({workspace_id:W,id:M1,label:'Anna',from_email:'anna@example.it',daily_limit:50,warmup_start:'2026-01-01',status:'active'});
 const ctx={sql:db.sql,user:1,role:'member',req:REQ,env:ENV,now:at('2026-10-20T08:00:00Z'),random:seq(0.5)};
 const data={campaign:'Ottobre',subject:'{nome}, una proposta',body:'Gentile {nome},\nguarda https://radix.example/offerta',contacts:[C1,C2,C3,'dddddddd-dddd-4ddd-8ddd-dddddddddddd'],origin:'https://radix.example'};
 const plan=(await mailq.handle(mailq.command({workspace:W,entity:'send_queue',action:'plan',data}),ctx)).rows[0];
 assert.equal(plan.recipients,1);assert.equal(plan.skipped.consent,1);assert.equal(plan.skipped.email,1);assert.equal(plan.skipped.duplicate,1,'one email per address');assert.equal(plan.days,1);assert.deepEqual(plan.mailboxes.map(m=>m.emails),[1]);
 assert.equal(db.queue.length,0,'planning writes nothing');
 const r=(await mailq.handle(mailq.command({workspace:W,entity:'send_queue',action:'enqueue',data:{...data,confirm:true}}),ctx)).rows[0];
 assert.equal(r.queued,1);const q=db.queue[0];
 assert.equal(q.contact_id,C1);assert.equal(q.subject,'Mario, una proposta');
 assert.match(q.unsubscribe_url,/^https:\/\/radix\.example\/api\/sales\?unsubscribe=[A-Za-z0-9_-]{64}$/);
 assert.ok(q.body.endsWith(q.unsubscribe_url),'the text ends with the personal unsubscribe link, as in the campaign panel');
 assert.match(q.body,/\/api\/sales\?click=[A-Za-z0-9_-]{64}&k=Ottobre&u=https%3A%2F%2Fradix\.example%2Fofferta/,'tracked link');
 const p=core.romeParts(Date.parse(q.scheduled_at));assert.ok(p.minutes>=core.START_MIN&&p.minutes<core.END_MIN);
 const again=(await mailq.handle(mailq.command({workspace:W,entity:'send_queue',action:'plan',data}),ctx)).rows[0];
 assert.equal(again.recipients,0);assert.equal(again.skipped.already,1,'one email per contact and campaign');assert.equal(again.skipped.duplicate,1,'nor a second one to an address already in the campaign');
 db.mailboxes[0].status='paused';
 await assert.rejects(mailq.handle(mailq.command({workspace:W,entity:'send_queue',action:'enqueue',data:{...data,campaign:'Altra',confirm:true}}),ctx),/Nessuna casella attiva/);
 await assert.rejects(mailq.handle(mailq.command({workspace:W,entity:'send_queue',action:'enqueue',data:{...data,confirm:true}}),{...ctx,role:'viewer'}),/Permessi/);
});

test('queue: «I member vedono solo i propri record» (PR #172) — recipients, status and cancel go through the visibility predicate',async()=>{
 const vis=require('../api/_sales_visibility.js'),calls=[],flat=s=>s.replace(/\s+/g,' ');
 const sql=async(text,params=[])=>{calls.push({text:flat(text),params});return []};
 const ctx={sql,user:7,role:'member',req:REQ,env:ENV,now:at('2026-10-20T08:00:00Z'),random:seq(0.5)};
 const data={campaign:'Ottobre',subject:'Ciao',body:'Testo',contacts:[C1],origin:'https://radix.example'};
 await mailq.handle(mailq.command({workspace:W,entity:'send_queue',action:'plan',data}),ctx);
 const recipients=calls.find(c=>/FROM sales_contacts t LEFT JOIN sales_companies/.test(c.text));
 assert.ok(recipients.text.includes(flat(vis.visible('contacts','t','$1','$3')))&&recipients.params[2]===7,'recipients: only contacts visible to the caller');
 calls.length=0;await mailq.handle(mailq.query({workspace:W,entity:'send_queue'}),{...ctx,req:{method:'GET',headers:{}}});
 assert.ok(calls[0].text.includes(flat(vis.contact('q.contact_id','$1','$2')))&&calls[0].params[1]===7,'status: counts only visible contacts');
 calls.length=0;await mailq.handle(mailq.command({workspace:W,entity:'send_queue',action:'cancel',data:{campaign:'Ottobre'}}),ctx);
 assert.ok(/^UPDATE sales_send_queue q/.test(calls[0].text)&&calls[0].text.includes(flat(vis.contact('q.contact_id','$1','$3')))&&calls[0].params[2]===7,'cancel: only rows of visible contacts');
});

// ---------- worker ----------
// In-memory version of the worker's database interface, with the same claim rule as the SQL one.
function memoryDb(rows,{contacts,mailboxes}){
 const db={rows,interactions:[],mailboxResults:[],
  recoverStale:async()=>{let n=0;for(const r of rows)if(r.status==='sending'&&r.stale){r.status='failed';r.error='Esito incerto';n++}return n},
  claim:async(limit)=>{await null;const due=rows.filter(r=>r.status==='queued'&&r.scheduled_at<=db.now()&&(mailboxes.get(W+':'+r.mailbox_id)||{}).status==='active').slice(0,limit);for(const r of due){r.status='sending';r.attempts++}return due.map(r=>({...r}))},
  contacts:async()=>contacts,mailboxes:async()=>mailboxes,sentToday:async()=>new Map(),
  finish:async(row,p)=>{const r=rows.find(x=>x.id===row.id);if(r.status!=='sending')return;Object.assign(r,{status:p.status,error:p.error||null,sent_at:p.sent_at||null})},
  release:async(row,p)=>{const r=rows.find(x=>x.id===row.id);if(r.status!=='sending')return;r.status='queued';if(!p.keepAttempt)r.attempts--;if(p.scheduled_at)r.scheduled_at=p.scheduled_at;if(p.error)r.error=p.error},
  recordInteraction:async row=>{db.interactions.push(row.id)},
  mailboxResult:async(m,r)=>{db.mailboxResults.push(r);if(r.authError){m.auth_failures=(m.auth_failures||0)+1;if(m.auth_failures>=core.AUTH_PAUSE_AFTER)m.status='error'}}};
 return db;
}
const NOW=at('2026-10-20T08:00:00Z');
const qrow=(id,contact,o={})=>({workspace_id:W,id,campaign:'Ottobre',contact_id:contact,mailbox_id:M1,subject:'Oggetto '+id,body:'Testo',unsubscribe_url:'https://radix.example/api/sales?unsubscribe='+'a'.repeat(64),status:'queued',attempts:0,scheduled_at:NOW-60e3,...o});
const contactsMap=()=>new Map([[W+':'+C1,{id:C1,email:'mario@example.it',marketing_consent:true}],[W+':'+C2,{id:C2,email:'lucia@example.it',marketing_consent:false}],[W+':'+C3,{id:C3,email:'x@example.it',marketing_consent:true}]]);
test('worker: two runs at once send each due row exactly once; a later run sends nothing again',async()=>{
 const rows=[qrow(1,C1),qrow(2,C3),qrow(3,C1,{scheduled_at:NOW+3600e3})];
 const mailboxes=new Map([[W+':'+M1,MB(M1,{workspace_id:W})]]);
 const db=memoryDb(rows,{contacts:contactsMap(),mailboxes});db.now=()=>NOW;
 const sent=[];const send=async(m,msg)=>{sent.push(msg);await new Promise(r=>setTimeout(r,5))};
 const [a,b]=await Promise.all([worker.runWorker({db,send,now:()=>NOW}),worker.runWorker({db,send,now:()=>NOW})]);
 assert.equal(a.sent+b.sent,2);assert.equal(sent.length,2);assert.deepEqual(sent.map(m=>m.subject).sort(),['Oggetto 1','Oggetto 2']);
 assert.ok(sent.every(m=>m.unsubscribe.includes('unsubscribe=')),'List-Unsubscribe url passed to the sender');
 assert.deepEqual(rows.map(r=>r.status),['sent','sent','queued'],'a row not yet due stays');
 const c=await worker.runWorker({db,send,now:()=>NOW});assert.equal(c.sent,0);assert.equal(sent.length,2);
 assert.deepEqual(db.interactions.sort(),[1,2],'one «email» interaction per sent email');
 // A claim interrupted mid-send is never sent again: it becomes «failed».
 rows.push(qrow(4,C1,{status:'sending',stale:true}));const d=await worker.runWorker({db,send,now:()=>NOW});
 assert.equal(d.recovered,1);assert.equal(rows[3].status,'failed');assert.equal(sent.length,2);
});
test('worker: consent withdrawn after queueing → skipped, not sent',async()=>{
 const rows=[qrow(1,C2)],db=memoryDb(rows,{contacts:contactsMap(),mailboxes:new Map([[W+':'+M1,MB(M1,{workspace_id:W})]])});db.now=()=>NOW;
 const sent=[];const r=await worker.runWorker({db,send:async(m,msg)=>sent.push(msg),now:()=>NOW});
 assert.equal(r.skipped,1);assert.equal(sent.length,0);assert.equal(rows[0].status,'skipped');assert.match(rows[0].error,/Consenso/);
});
test('worker: repeated SMTP login errors put the rows back and stop the mailbox after 3',async()=>{
 const rows=[qrow(1,C1),qrow(2,C3)],mb=MB(M1,{workspace_id:W}),db=memoryDb(rows,{contacts:contactsMap(),mailboxes:new Map([[W+':'+M1,mb]])});let t=NOW;db.now=()=>t;
 const send=async()=>{throw Object.assign(new Error('Invalid login'),{code:'EAUTH',responseCode:535})};
 for(let i=0;i<3;i++){const r=await worker.runWorker({db,send,now:()=>t});assert.equal(r.sent,0);t+=31*60e3}
 assert.equal(mb.status,'error');assert.equal(mb.auth_failures,3);
 assert.ok(rows.every(r=>r.status==='queued'),'emails wait for the mailbox to be fixed');
 assert.deepEqual(rows.map(r=>r.attempts),[0,0],'a refused login does not use up the recipient’s attempts');
 const r=await worker.runWorker({db,send,now:()=>t});assert.equal(r.claimed,0,'a stopped mailbox is not used');
});
test('worker endpoint: only Vercel Cron with the CRON_SECRET bearer; without the secret it does not run',async()=>{
 const res=()=>({code:0,h:{},setHeader(k,v){this.h[k]=v},status(c){this.code=c;return this},json(b){this.body=b;return this}});
 let calls=0;const getSql=()=>async()=>{calls++;return []};
 const none=worker.createHandler({getSql,env:{}}),r1=res();await none({method:'GET',headers:{authorization:'Bearer x'}},r1);assert.equal(r1.code,503);
 const h=worker.createHandler({getSql,env:{CRON_SECRET:'s'.repeat(32),...ENV}});
 const r2=res();await h({method:'GET',headers:{authorization:'Bearer wrong'}},r2);assert.equal(r2.code,401);
 const r3=res();await h({method:'GET',headers:{}},r3);assert.equal(r3.code,401);assert.equal(calls,0);
 const r4=res();await h({method:'GET',headers:{authorization:'Bearer '+'s'.repeat(32)}},r4);assert.equal(r4.code,200);assert.equal(r4.body.claimed,0);
});

// ---------- static checks ----------
test('migration 016: two tables, checks, unique and worker indexes, contact FK like the clicks, no sales_command change',()=>{
 const m=read('migrations/sales/016_crm_mailboxes_queue.sql');
 assert.match(m,/\nBEGIN;\n/);assert.match(m,/\nCOMMIT;\n$/);assert.ok(!/\bDROP\b/i.test(m));
 assert.ok(!/CREATE OR REPLACE FUNCTION sales_command/.test(m),'sales_command unchanged');
 assert.match(m,/CREATE TABLE IF NOT EXISTS sales_mailboxes\(/);assert.match(m,/CREATE TABLE IF NOT EXISTS sales_send_queue\(/);
 assert.match(m,/daily_limit integer NOT NULL DEFAULT 50 CHECK\(daily_limit BETWEEN 1 AND 50\)/);
 assert.match(m,/status text NOT NULL DEFAULT 'active' CHECK\(status IN \('active','paused','error'\)\)/);
 assert.match(m,/CHECK\(status IN \('queued','sending','sent','failed','cancelled','skipped'\)\)/);
 for(const c of ['password_ciphertext','password_iv','password_tag','warmup_start','last_error','created_by','smtp_host','smtp_port','smtp_secure','smtp_user','from_name','from_email','scheduled_at','sent_at','attempts','unsubscribe_url'])assert.match(m,new RegExp('\\n '+c+' '));
 assert.ok(!/\n password text/.test(m),'no clear password column');
 assert.match(m,/FOREIGN KEY\(workspace_id,contact_id\) REFERENCES sales_contacts\(workspace_id,id\) ON DELETE CASCADE/);
 assert.match(m,/CREATE UNIQUE INDEX IF NOT EXISTS sales_send_queue_once ON sales_send_queue\(workspace_id,campaign,contact_id\)/);
 assert.match(m,/sales_send_queue_due ON sales_send_queue\(scheduled_at\) WHERE status='queued'/);
 assert.match(m,/CREATE UNIQUE INDEX IF NOT EXISTS sales_mailboxes_from ON sales_mailboxes\(workspace_id,lower\(from_email\)\)/);
 const w=read('api/_sales_send_worker.js');assert.match(w,/FOR UPDATE SKIP LOCKED/);assert.match(w,/AND q\.status='queued'/);assert.match(w,/AND status='sending'/);
});
test('wiring: cron every 10 minutes on the dispatcher, router entities, Impostazioni mounts the panel',()=>{
 const v=JSON.parse(read('vercel.json'));assert.deepEqual(v.crons.find(c=>c.path==='/api/integrations/send-queue'),{path:'/api/integrations/send-queue',schedule:'*/10 * * * *'});
 assert.match(read('api/integrations/[service].js'),/'send-queue': \(\) => require\('\.\.\/_sales_send_worker'\)/);
 assert.ok(!fs.existsSync(__dirname+'/../api/send-queue.js'),'no extra serverless function');
 assert.deepEqual(mailq.ENTITIES,['mailboxes','send_queue']);
 const html=read('radix-sales.html');assert.ok(html.indexOf('sales/crm-mailboxes.js')>html.indexOf('sales/crm-campaigns.js'));assert.ok(html.includes('href="sales/crm-mailboxes.css"'));
 const ui=read('sales/crm-mailboxes.js');for(const s of ['Caselle email','Prova invio','Metti in pausa','Password per le app','Annulla quelle in coda'])assert.ok(ui.includes(s),s);
 assert.match(read('sales/crm-campaigns.js'),/B\('Metti in coda'/);assert.match(read('sales/crm-tools.js'),/href='\/impostazioni\.html#caselle'/);assert.ok(!read('sales/crm-tools.js').includes('RadixCrmMailboxes.panel()'),'the panel lives in Impostazioni');assert.match(read('shell/settings.js'),/RadixCrmMailboxes;[\s\S]*M\.panel\(\)/);
 assert.equal(campaigns.campaignName(' {nome}, una   proposta ','2026-10-20'),'una proposta');assert.equal(campaigns.campaignName('{nome}','2026-10-20'),'Campagna 2026-10-20');
 assert.ok(!/console\.(log|error)\([^)]*pass/i.test(read('api/_sales_mailboxes.js')+read('api/_sales_send_worker.js')+read('api/_mailbox_crypto.js')),'passwords are never logged');
});
test('router: mailbox and queue requests go through their own validator, GET keeps the usual offset',async()=>{
 const calls=[];const store={sql:async()=>[],membership:async()=>({role:'viewer'})};
 const h=sales.createHandler({getSessionUser:()=>({uid:1}),getStore:()=>store});
 const res=()=>({code:0,h:{},setHeader(k,v){this.h[k]=v},status(c){this.code=c;return this},json(b){this.body=b;calls.push(b);return this}});
 const r1=res();await h({method:'GET',query:{entity:'mailboxes',workspace:W,offset:'0'},headers:{}},r1);assert.equal(r1.code,200);assert.deepEqual(r1.body.rows,[]);assert.equal(r1.body.can_manage,false);
 const r2=res();await h({method:'POST',headers:{'x-radix-sales':'1','content-type':'application/json'},body:{workspace:W,entity:'mailboxes',action:'add',data:{label:'A',from_email:'a@example.it',smtp_host:'smtp.gmail.com',smtp_user:'a',password:'x'}},query:{}},r2);
 assert.equal(r2.code,403,'a viewer cannot add mailboxes');
 const r3=res();await h({method:'GET',query:{entity:'send_queue',workspace:W,extra:'1'},headers:{}},r3);assert.equal(r3.code,400);
});
