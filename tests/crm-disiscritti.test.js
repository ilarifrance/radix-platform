'use strict';
// «Indirizzi disiscritti» (migration sales 017): the permanent list of opted-out addresses, by hash only.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const optout=require('../api/_sales_optout.js');
const supp=require('../api/_sales_suppressions.js');
const u=require('../api/_sales_unsubscribe.js');
const mailq=require('../api/_sales_mailboxes.js');
const core=require('../api/_sales_queue_core.js');
const worker=require('../api/_sales_send_worker.js');
const finder=require('../api/_sales_email_finder.js');
const sendEmail=require('../api/_send-email.js');
const {createHandler}=require('../api/_sales.js');
const ui=require('../sales/crm-suppressions.js');
const read=f=>fs.readFileSync(__dirname+'/../'+f,'utf8');
const W='5b1d2c3e-4f50-4a61-8b72-9c83d4e5f601',W2='6c2e3d4f-5a61-4b72-8c83-9d94e5f60712',M1='11111111-1111-4111-8111-111111111111';
const C1='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',C2='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',C9='99999999-9999-4999-8999-999999999999';
const ENV={JWT_SECRET:'test-secret-for-suppression-tests-0123456789'};
const sha=s=>crypto.createHash('sha256').update(s,'utf8').digest('hex');
const seq=(...v)=>{let i=0;return ()=>v[i++%v.length]};
const REQ={method:'POST',headers:{host:'radix.example'}};
const res=()=>{const r={headers:{},setHeader(k,v){r.headers[k]=v},status(s){r.code=s;return r},json(b){r.body=b;return r},send(b){r.body=b;return r}};return r};

test('hashing: trimmed and lower-cased, SHA-256 hex, the same rule as the SQL; no address in commands',()=>{
 const h=sha('mario.rossi@acme.it');
 for(const v of ['mario.rossi@acme.it',' Mario.Rossi@ACME.it ','MARIO.ROSSI@acme.IT\n'])assert.equal(optout.emailHash(v),h,JSON.stringify(v));
 assert.match(h,optout.HASH);assert.equal(optout.emailHash(''),null);assert.equal(optout.emailHash('   '),null);assert.equal(optout.emailHash(null),null);
 assert.notEqual(optout.emailHash('mario.rossi@acme.it'),optout.emailHash('mariorossi@acme.it'),'no provider-specific folding');
 assert.equal(optout.HASH_SQL('t.email'),"encode(sha256(convert_to(lower(btrim(t.email)),'UTF8')),'hex')");
 assert.match(optout.OPTED_OUT('t'),/EXISTS\(SELECT 1 FROM sales_email_suppressions os WHERE os\.workspace_id=t\.workspace_id AND os\.email_hash=encode\(sha256/);
 assert.match(optout.OPTED_OUT('t'),/ILIKE '%disiscrizione%'/,'the note rule stays');
 // The API command keeps only the hash: the typed address does not go further than the validator.
 const add=supp.command({workspace:W,entity:'email_suppressions',action:'add',data:{email:' Mario.Rossi@ACME.it '}});
 assert.deepEqual(add.data,{email_hash:h,reason:'manual'});assert.ok(!JSON.stringify(add).includes('@'));
 assert.deepEqual(supp.command({workspace:W,entity:'email_suppressions',action:'check',data:{email:'mario.rossi@acme.it'}}).data,{email_hash:h});
 assert.equal(supp.command({workspace:W,entity:'email_suppressions',action:'add',data:{email:'a@b.it',reason:'bounce'}}).data.reason,'bounce');
 for(const bad of [{email:'nope'},{email:'a@b.it',reason:'spam'},{email:'a@b.it',extra:1},{email:'a@b.it\n'.repeat(2)},{email:'x'.repeat(250)+'@b.it'}])
  assert.throws(()=>supp.command({workspace:W,entity:'email_suppressions',action:'add',data:bad}),/non valid|non consentito/,JSON.stringify(bad));
 assert.throws(()=>supp.command({workspace:W,entity:'email_suppressions',action:'remove',data:{email_hash:h}}),/non confermata/);
 assert.throws(()=>supp.command({workspace:W,entity:'email_suppressions',action:'remove',data:{email_hash:'abc',confirm:true}}),/non valido/);
 assert.throws(()=>supp.command({workspace:W,entity:'email_suppressions',action:'drop',data:{}}),/Azione/);
});

/* A small in-memory CRM: contacts, timeline notes, the suppression list (hashes), the queue. The contact reads evaluate
   OPTED_OUT in JS, and use the list only when the query really reads sales_email_suppressions. */
function fakeCrm(){
 const db={contacts:[],interactions:[],suppressions:new Map(),queue:[],audit:[],calls:[],
  mailboxes:[{workspace_id:W,id:M1,label:'Anna',from_name:'Anna',from_email:'anna@radix.example',daily_limit:50,warmup_start:'2026-01-01',status:'active'}]};
 const noted=c=>/disiscrizione/i.test(c.notes||'')||db.interactions.some(i=>i.contact_id===c.id&&/^disiscrizione/i.test(i.title));
 const out=(c,t)=>{const h=optout.emailHash(c.email);return noted(c)||(!!h&&db.contacts.some(o=>o.id!==c.id&&optout.normalEmail(o.email)===optout.normalEmail(c.email)&&noted(o)))||(/sales_email_suppressions/.test(t)&&!!h&&db.suppressions.has(c.workspace_id+':'+h))};
 db.sql=async(text,params=[])=>{
  const t=text.replace(/\s+/g,' ');db.calls.push({t,params});
  if(/^UPDATE sales_contacts t SET marketing_consent=false/.test(t)){const c=db.contacts.find(x=>x.workspace_id===params[0]&&x.id===params[1]);if(!c)return [];c.marketing_consent=false;c.notes=(c.notes?c.notes+'\n\n':'')+'Disiscrizione dalle email commerciali tramite link: 20/10/2026 10:00';return [{id:c.id}]}
  if(/^INSERT INTO sales_interactions/.test(t)){if(db.contacts.some(x=>x.id===params[1]))db.interactions.push({contact_id:params[1],title:'Disiscrizione dalle email commerciali'});return []}
  if(/^UPDATE sales_send_queue SET status='cancelled'/.test(t))return [];
  if(/^INSERT INTO sales_email_suppressions\(workspace_id,email_hash,reason,source,created_by\) SELECT t\.workspace_id,encode\(sha256\(convert_to\(lower\(btrim\(t\.email\)\),'UTF8'\)\),'hex'\)/.test(t)){
   const c=db.contacts.find(x=>x.workspace_id===params[0]&&x.id===params[1]);const h=c&&optout.emailHash(c.email);if(!h)return [];
   const k=params[0]+':'+h;if(db.suppressions.has(k))return [];db.suppressions.set(k,{reason:params[2],source:params[3]});return [{email_hash:h}]}
  if(/^SELECT email_hash FROM sales_email_suppressions/.test(t))return params[1].filter(h=>db.suppressions.has(params[0]+':'+h)).map(email_hash=>({email_hash}));
  if(/FROM sales_contacts t LEFT JOIN sales_companies/.test(t))return db.contacts.filter(c=>c.workspace_id===params[0]&&params[1].includes(c.id)).map(c=>({...c,opted_out:out(c,t)}));
  if(/^SELECT t\.id FROM sales_contacts t WHERE .* AND \(coalesce/.test(t))return db.contacts.filter(c=>c.workspace_id===params[0]&&params[1].includes(c.id)&&out(c,t)).map(c=>({id:c.id}));
  if(/^SELECT id FROM sales_contacts/.test(t))return db.contacts.filter(c=>c.workspace_id===params[0]&&params[1].includes(c.id)).map(c=>({id:c.id}));
  if(/^SELECT t\.workspace_id,t\.id,t\.email,t\.marketing_consent/.test(t)){const keys=JSON.parse(params[0]);return db.contacts.filter(c=>keys.some(k=>k.w===c.workspace_id&&k.c===c.id)).map(c=>({...c,opted_out:out(c,t),last_reply_at:null}))}
  if(/q\.contact_id,lower\(btrim\(c\.email\)\) AS email FROM sales_send_queue/.test(t))return [];
  if(/FROM sales_send_queue WHERE workspace_id=\$1 AND mailbox_id IS NOT NULL/.test(t))return [];
  if(/FROM sales_mailboxes WHERE workspace_id=\$1 ORDER BY/.test(t))return db.mailboxes.map(m=>({...m}));
  if(/FROM sales_document_settings/.test(t))return [{name:'Radix',legal_name:'Radix Srl',vat_number:'IT01234567890',street:'Via Roma 1',zip:'20100',city:'Milano',province:'MI',country:'IT'}];
  if(/^INSERT INTO sales_send_queue/.test(t)){const rows=JSON.parse(params[3]);for(const r of rows)db.queue.push({...r,campaign:params[1]});return rows.map((r,i)=>({id:i+1}))}
  throw new Error('unexpected query: '+t.slice(0,90));
 };
 return db;
}
const person=(id,email,o)=>({workspace_id:W,id,name:'Mario Rossi',role:'CEO',email,marketing_consent:true,company_id:null,company:'Acme',notes:'',...o});

test('opt-out by link: consent off, notes, timeline, queue cancelled, and the address hashed on the permanent list',async()=>{
 const db=fakeCrm();db.contacts.push(person(C1,'Mario.Rossi@acme.it'));
 const r=res();await u.handle({method:'POST',query:{unsubscribe:u.sign(ENV.JWT_SECRET,W,C1)}},r,{getSql:()=>db.sql,secret:ENV.JWT_SECRET});
 assert.equal(r.code,200);assert.match(r.body,/Disiscrizione registrata/);
 assert.deepEqual([...db.suppressions.entries()],[[W+':'+sha('mario.rossi@acme.it'),{reason:'unsubscribe',source:'link di disiscrizione'}]]);
 const ins=db.calls.find(c=>/INSERT INTO sales_email_suppressions/.test(c.t));assert.ok(!JSON.stringify(ins.params).includes('@'),'the clear address never leaves the database');
 // A second click: nothing new, still 200.
 const r2=res();await u.handle({method:'POST',query:{unsubscribe:u.sign(ENV.JWT_SECRET,W,C1)}},r2,{getSql:()=>db.sql,secret:ENV.JWT_SECRET});assert.equal(r2.code,200);assert.equal(db.suppressions.size,1);
 // An archive without migration 017, or a failure of the list: the opt-out is still recorded and confirmed.
 for(const code of ['42P01','XX000']){
  const calls=[];const sql=async q=>{calls.push(q);if(/sales_email_suppressions/.test(q))throw Object.assign(new Error('x'),{code});return /^UPDATE sales_contacts/.test(q)?[{id:C1}]:[]};
  const r3=res();await u.handle({method:'POST',query:{unsubscribe:u.sign(ENV.JWT_SECRET,W,C1)}},r3,{getSql:()=>sql,secret:ENV.JWT_SECRET});
  assert.equal(r3.code,200,code);assert.match(r3.body,/Fatto/);assert.equal(calls.length,4);
 }
});

test('queue plan skips a suppressed address; a deleted and re-imported contact stays suppressed (consent and B2B)',async()=>{
 const db=fakeCrm();db.contacts.push(person(C1,'mario.rossi@acme.it'),person(C2,'lucia.verdi@beta.it',{name:'Lucia Verdi'}));
 const ctx={sql:db.sql,user:1,role:'member',req:REQ,env:ENV,now:Date.parse('2026-10-20T08:00:00Z'),random:seq(0.5)};
 // Mario unsubscribes through his link, then his contact is deleted and imported again with the same address (other case).
 await u.handle({method:'POST',query:{unsubscribe:u.sign(ENV.JWT_SECRET,W,C1)}},res(),{getSql:()=>db.sql,secret:ENV.JWT_SECRET});
 db.contacts=db.contacts.filter(c=>c.id!==C1);db.interactions=[];
 db.contacts.push(person(C9,' MARIO.ROSSI@Acme.it ',{notes:'Reimportato da LinkedIn'}));
 const data={campaign:'Novembre',subject:'{nome}, una proposta',body:'Gentile {nome}, una proposta.',contacts:[C9,C2],origin:'https://radix.example'};
 const plan=(await mailq.handle(mailq.command({workspace:W,entity:'send_queue',action:'plan',data}),ctx)).rows[0];
 assert.equal(plan.recipients,1);assert.equal(plan.skipped.optout,1,'the new contact is still opted out: its address is on the list');
 await mailq.handle(mailq.command({workspace:W,entity:'send_queue',action:'enqueue',data:{...data,confirm:true}}),ctx);
 assert.deepEqual(db.queue.map(q=>q.contact_id),[C2]);
 const b2b=(await mailq.handle(mailq.command({workspace:W,entity:'send_queue',action:'plan',data:{...data,campaign:'Prospezione',mode:'b2b',step:0,include_unverified:true}}),ctx)).rows[0];
 assert.equal(b2b.skipped.optout,1,'B2B too');assert.equal(b2b.recipients,1);
 // Another workspace keeps its own list.
 db.contacts.push({...person(C9,'mario.rossi@acme.it'),workspace_id:W2});
 const other=(await mailq.handle(mailq.command({workspace:W2,entity:'send_queue',action:'plan',data:{...data,contacts:[C9]}}),{...ctx})).rows[0];
 assert.equal(other.skipped.optout,0);assert.equal(other.recipients,1);
});

test('worker: a queued email to a suppressed address is skipped at send time, never sent',async()=>{
 const db=fakeCrm();db.contacts.push(person(C9,'mario.rossi@acme.it',{notes:''}));
 db.suppressions.set(W+':'+sha('mario.rossi@acme.it'),{reason:'bounce'});
 const contacts=await worker.sqlDb(db.sql).contacts([{workspace_id:W,contact_id:C9}]);
 const c=contacts.get(W+':'+C9);assert.equal(c.opted_out,true);
 const d=core.decide({campaign:'Novembre',created_at:'2026-10-19T08:00:00Z'},c,{status:'active',daily_limit:50,warmup_start:'2026-01-01'},{now:Date.parse('2026-10-20T08:00:00Z')});
 assert.equal(d.action,'skip');assert.match(d.error,/disiscritto/);
});

test('campaign panel and newsletter: no unsubscribe link for a suppressed contact, so it is left out of direct sends',async()=>{
 const db=fakeCrm();db.contacts.push(person(C1,'mario.rossi@acme.it'),person(C2,'lucia.verdi@beta.it'));
 db.suppressions.set(W+':'+sha('lucia.verdi@beta.it'),{reason:'manual'});
 const r=await u.linksOf(db.sql,W,[C1,C2],ENV.JWT_SECRET);
 assert.deepEqual(Object.keys(r.links),[C1]);assert.equal(r.opted_out,1);
 // Through /api/sales: the response says how many were left out.
 const store={sql:db.sql,membership:async()=>({role:'member'})};process.env.JWT_SECRET=ENV.JWT_SECRET;
 const h=createHandler({getSessionUser:()=>({uid:7}),getStore:()=>store});const out=res();
 await h({method:'POST',headers:{'x-radix-sales':'1','content-type':'application/json'},query:{},body:{workspace:W,entity:'unsubscribe_links',action:'create',data:{contacts:[C1,C2]}}},out);
 assert.equal(out.code,200);assert.deepEqual(Object.keys(out.body.links),[C1]);assert.equal(out.body.opted_out,1);
 for(const f of ['sales/crm-campaigns.js','sales/lead-newsletter.js'])assert.match(read(f),/optedOut\+=\w\.opted_out\|\|0/,f);
});

test('/api/send-email: a suppressed recipient is refused before SMTP; support replies pass; no list → no block',async()=>{
 const h0=sha('lucia.verdi@beta.it');let transports=0;const sent=[];
 const mk=sql=>sendEmail.createHandler({getSessionUser:()=>({uid:7}),getSql:()=>sql,env:{GMAIL_USER:'me@radix.example',GMAIL_APP_PASSWORD:'x'.repeat(16),...ENV},createTransport:()=>{transports++;return {sendMail:async m=>{sent.push(m);return {messageId:'id'}}}}});
 const seen=[];const sql=async(q,p)=>{seen.push([q,p]);return p[1].includes(h0)?[{reason:'manual'}]:[]};
 const call=async(body,s=sql)=>{const r=res();await mk(s)({method:'POST',headers:{host:'radix.example'},body:{subject:'Ciao',body:'Testo',confirm:true,...body}},r);return r};
 let r=await call({to:'Lucia Verdi <Lucia.Verdi@beta.it>'});
 assert.equal(r.code,409);assert.equal(r.body.suppressed,true);assert.match(r.body.error,/disiscritti/);assert.equal(transports,0,'no SMTP connection');
 assert.match(seen[0][0],/FROM sales_email_suppressions s WHERE s\.email_hash=ANY\(\$2::text\[\]\) AND \(s\.workspace_id IN \(SELECT m\.workspace_id FROM sales_memberships m WHERE m\.user_id=\$1\)/);
 assert.deepEqual(seen[0][1],[7,[h0],null]);assert.ok(!JSON.stringify(seen).includes('@'),'only hashes reach the database');
 r=await call({to:'mario@acme.it; lucia.verdi@beta.it'});assert.equal(r.code,409,'every recipient is checked');
 const token=u.sign(ENV.JWT_SECRET,W,C1);r=await call({to:'mario@acme.it',unsubscribeUrl:'https://radix.example/api/sales?unsubscribe='+token});
 assert.equal(r.code,200);assert.equal(seen.at(-1)[1][2],W,'the workspace of the unsubscribe link is checked too');
 assert.equal(sent.at(-1).list.unsubscribe,'https://radix.example/api/sales?unsubscribe='+token);
 const before=seen.length;r=await call({to:'lucia.verdi@beta.it',kind:'service'});assert.equal(r.code,200,'a support reply is not a commercial email');assert.equal(seen.length,before);
 r=await call({to:'lucia.verdi@beta.it'},async()=>{throw Object.assign(new Error('no table'),{code:'42P01'})});assert.equal(r.code,200,'archive without 017');
 r=await call({to:'lucia.verdi@beta.it'},async()=>{throw Object.assign(new Error('down'),{code:'08006'})});assert.equal(r.code,503,'list unreadable: nothing sent');
 assert.deepEqual(sendEmail.recipientsOf(' A@B.it , "C" <c@d.IT>;'),['a@b.it','c@d.it']);
 assert.match(read('sales/crm-ticket-reply.js'),/kind:'service',confirm:true/);
 assert.ok(!/kind:'service'/.test(read('sales/crm-follow-up.js')+read('sales/crm-record.js')+read('sales/crm-campaigns.js')+read('sales/lead-newsletter.js')),'commercial sends are checked');
});

test('«Trova email»: a found address on the list is saved, marked in the note, the row and the count',async()=>{
 const db={contacts:[{id:C1,version:1,name:'Mario Rossi',email:null,notes:'',company_id:null,company:'Acme',website:'https://www.acme.it',company_email:null,opted_out:false}],saves:[]};
 const hash=sha('mario.rossi@acme.it');const seen=[];
 db.sql=async(text,params)=>{const t=text.replace(/\s+/g,' ');seen.push(params);
  if(/^SELECT email_hash FROM sales_email_suppressions/.test(t))return params[1].includes(hash)?[{email_hash:hash}]:[];
  if(/FROM sales_contacts t LEFT JOIN sales_companies/.test(t))return db.contacts.map(c=>({...c}));
  throw new Error('unexpected '+t.slice(0,60))};
 const save=async(entity,data)=>{db.saves.push([entity,data]);return {}};
 const getPage=async u=>new URL(u).pathname==='/contatti'?'<p>mario.rossi@acme.it</p>':null;
 const r=await finder.handle(finder.command({workspace:W,entity:'email_finder',action:'free',data:{contacts:[C1],confirm:true}}),{sql:db.sql,user:1,role:'member',env:{},fetch:async()=>{throw new Error('no network')},getPage,save,now:Date.parse('2026-10-23T10:00:00Z')});
 assert.equal(r.saved,1);assert.equal(r.suppressed,1);assert.equal(r.rows[0].suppressed,true);
 const notes=db.saves[0][1].notes;assert.match(notes,/qualifica: pubblicata sul sito\): mario\.rossi@acme\.it\n/);assert.ok(notes.endsWith(finder.SUPPRESSED_NOTE));
 assert.ok(seen.some(p=>Array.isArray(p&&p[1])&&p[1][0]===hash),'the finder asks the list by hash');
 assert.match(read('sales/crm-email-finder-core.js'),/out\.suppressed\+=r\.suppressed\|\|0/);assert.match(read('sales/crm-prospecting.js'),/nella lista dei disiscritti/);
});

test('suppressions API: owner/admin only, add hashes and cancels the queue, check, remove with the notes still counted',async()=>{
 const calls=[];const rows=new Map();
 const sql=async(text,params=[])=>{const t=text.replace(/\s+/g,' ');calls.push({t,params});
  if(/^SELECT email_hash,reason,source,.* WHERE workspace_id=\$1 ORDER BY/.test(t))return [...rows.values()];
  if(/^SELECT reason,count/.test(t)){const by={};for(const r of rows.values())by[r.reason]=(by[r.reason]||0)+1;return Object.entries(by).map(([reason,n])=>({reason,n}))}
  if(/^SELECT email_hash,reason,source,.* AND email_hash=\$2/.test(t))return rows.has(params[1])?[rows.get(params[1])]:[];
  if(/^INSERT INTO sales_email_suppressions/.test(t)){if(rows.has(params[1]))return [];rows.set(params[1],{email_hash:params[1],reason:params[2],source:params[3],created_at:'2026-10-24T09:00:00Z'});return [{email_hash:params[1]}]}
  if(/^UPDATE sales_send_queue q SET status='cancelled'/.test(t))return [{id:1}];
  if(/^DELETE FROM sales_email_suppressions/.test(t)){const r=rows.get(params[1]);rows.delete(params[1]);return r?[{reason:r.reason}]:[]}
  if(/^SELECT count\(\*\)::int AS n FROM sales_contacts t/.test(t))return [{n:1}];
  if(/^INSERT INTO sales_audit/.test(t))return [];
  throw new Error('unexpected '+t.slice(0,70))};
 const h=sha('anna@acme.it'),ctx={sql,user:3,role:'admin',method:'POST'};
 for(const role of ['member','viewer']){
  await assert.rejects(supp.handle({workspace:W,entity:'email_suppressions'},{...ctx,role,method:'GET'}),/owner e admin/,role+' cannot read');
  await assert.rejects(supp.handle(supp.command({workspace:W,entity:'email_suppressions',action:'add',data:{email:'anna@acme.it'}}),{...ctx,role}),/owner e admin/);
 }
 const add=(await supp.handle(supp.command({workspace:W,entity:'email_suppressions',action:'add',data:{email:'Anna@Acme.it',reason:'complaint'}}),ctx)).rows[0];
 assert.equal(add.added,true);assert.equal(add.cancelled,1);assert.equal(add.reason,'complaint');assert.equal(add.email_hash,h);
 const q=calls.find(c=>/^UPDATE sales_send_queue/.test(c.t));assert.match(q.t,/encode\(sha256\(convert_to\(lower\(btrim\(t\.email\)\),'UTF8'\)\),'hex'\)=\$2/);
 const audit=calls.filter(c=>/^INSERT INTO sales_audit/.test(c.t));assert.equal(audit.length,1);assert.equal(audit[0].params[2],'email_suppressions');
 assert.ok(!JSON.stringify(calls).includes('@'),'no clear address in any query or audit row');
 assert.equal((await supp.handle(supp.command({workspace:W,entity:'email_suppressions',action:'add',data:{email:'anna@acme.it'}}),ctx)).rows[0].added,false,'already there: first reason kept');
 const list=await supp.handle({workspace:W,entity:'email_suppressions'},{...ctx,method:'GET'});
 assert.equal(list.count,1);assert.equal(list.by_reason.complaint,1);assert.equal(list.by_reason.unsubscribe,0);assert.equal(list.rows[0].email_hash,h);
 assert.equal((await supp.handle(supp.command({workspace:W,entity:'email_suppressions',action:'check',data:{email:'anna@acme.it'}}),ctx)).rows[0].suppressed,true);
 assert.equal((await supp.handle(supp.command({workspace:W,entity:'email_suppressions',action:'check',data:{email:'altro@acme.it'}}),ctx)).rows[0].suppressed,false);
 const rm=(await supp.handle(supp.command({workspace:W,entity:'email_suppressions',action:'remove',data:{email_hash:h,confirm:true}}),ctx)).rows[0];
 assert.equal(rm.removed,true);assert.equal(rm.reason,'complaint');assert.equal(rm.still_opted_out,1);
 await assert.rejects(supp.handle(supp.command({workspace:W,entity:'email_suppressions',action:'remove',data:{email_hash:h,confirm:true}}),ctx),/non più nella lista/);
 await assert.rejects(supp.handle({workspace:W,entity:'email_suppressions'},{sql:async()=>{throw Object.assign(new Error('x'),{code:'42P01'})},user:3,role:'owner',method:'GET'}),/migrazione sales 017/);
 // Routed by /api/sales after membership.
 const store={sql,membership:async()=>({role:'owner'})};const hh=createHandler({getSessionUser:()=>({uid:3}),getStore:()=>store});
 const r=res();await hh({method:'GET',headers:{},query:{entity:'email_suppressions',workspace:W}},r);assert.equal(r.code,200);assert.equal(r.body.can_manage,true);
 store.membership=async()=>({role:'member'});const r2=res();await hh({method:'POST',headers:{'x-radix-sales':'1','content-type':'application/json'},query:{},body:{workspace:W,entity:'email_suppressions',action:'add',data:{email:'b@c.it'}}},r2);assert.equal(r2.code,403);
});

test('migration 017: one hashed table, reason check, workspace FK, triggers for hand-written opt-outs, backfill, sales_command unchanged',()=>{
 const m=read('migrations/sales/017_crm_email_suppressions.sql');
 assert.match(m,/\nBEGIN;\n/);assert.match(m,/\nCOMMIT;\n$/);assert.ok(!/\bDROP\b|\bDELETE FROM\b|\bTRUNCATE\b/i.test(m));
 assert.ok(!/sales_command/.test(m.replace(/^--.*$/gm,'')),'sales_command unchanged');
 assert.match(m,/CREATE TABLE IF NOT EXISTS sales_email_suppressions\(/);
 assert.match(m,/workspace_id uuid NOT NULL REFERENCES sales_workspaces\(id\)/);
 assert.match(m,/email_hash text NOT NULL CHECK\(email_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/);
 assert.match(m,/reason text NOT NULL CHECK\(reason IN \('unsubscribe','bounce','complaint','manual'\)\)/);
 assert.match(m,/created_at timestamptz NOT NULL DEFAULT now\(\)/);assert.match(m,/created_by integer REFERENCES users\(id\) ON DELETE SET NULL/);
 assert.match(m,/PRIMARY KEY\(workspace_id,email_hash\)\)/);
 assert.ok(!/\n email text|\n email_plain|\n address/.test(m),'no clear address column');
 assert.match(m,/CREATE OR REPLACE TRIGGER sales_contacts_optout_suppress AFTER INSERT OR UPDATE OF notes,email ON sales_contacts/);
 assert.match(m,/CREATE OR REPLACE TRIGGER sales_interactions_optout_suppress AFTER INSERT OR UPDATE OF title ON sales_interactions/);
 assert.equal((m.match(/encode\(sha256\(convert_to\(lower\(btrim\(\w+(\.\w+)?\)\),'UTF8'\)\),'hex'\)/g)||[]).length,3,'the same hash as optout.HASH_SQL everywhere');
 assert.match(m,/ON CONFLICT \(workspace_id,email_hash\) DO NOTHING;\nCOMMIT;/,'backfill is idempotent');
});

test('UI: «Indirizzi disiscritti» in Impostazioni › Caselle email, owner/admin only, RadixConfirm, CSV of hashes only',()=>{
 const s=read('shell/settings.js');assert.match(s,/RadixCrmSuppressions;[\s\S]*C\.canManage\(role\(\)\)\)\{const d=card\('Indirizzi disiscritti'/);
 const html=read('impostazioni.html');
 assert.ok(html.indexOf('/lib/radix-confirm.js')>0&&html.indexOf('/sales/crm-suppressions.js')>html.indexOf('/lib/radix-confirm.js')&&html.indexOf('/sales/crm-suppressions.js')<html.indexOf('/shell/settings.js'));
 const src=read('sales/crm-suppressions.js');
 for(const x of ['Indirizzi disiscritti','Controlla','Aggiungi alla lista','Rimuovi dalla lista','Esporta CSV','RadixConfirm.ask',"tone:'danger'","['Motivo',reasonLabel(r.reason)"])assert.ok(src.includes(x),x);
 assert.ok(!/localStorage|sessionStorage/.test(src),'the typed address is not kept in the browser');
 assert.match(read('sales/crm-mailboxes.css'),/\.crm-supp-table/);
 const csv=ui.toCsv([{email_hash:'a'.repeat(64),reason:'unsubscribe',source:'link di disiscrizione',created_at:'2026-10-20T08:00:00Z'},{email_hash:'b'.repeat(64),reason:'manual',source:'a;b',created_at:'2026-10-21T08:00:00Z'}]);
 assert.equal(csv,'﻿email_sha256;motivo;motivo_descrizione;fonte;data_utc\r\n'+'a'.repeat(64)+';unsubscribe;Disiscrizione;link di disiscrizione;2026-10-20T08:00:00Z\r\n'+'b'.repeat(64)+';manual;Aggiunto a mano;"a;b";2026-10-21T08:00:00Z\r\n');
 assert.ok(!csv.includes('@'));assert.equal(ui.shortHash('0123456789abcdef'),'0123456789ab…');
 assert.equal(ui.reasonLabel('bounce'),'Rimbalzo');assert.ok(ui.plausible(' a@b.it '));assert.equal(ui.plausible('nope'),false);
});
