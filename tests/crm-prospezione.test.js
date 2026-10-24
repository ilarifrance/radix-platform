'use strict';
// «Prospezione B2B»: eligibility rules, fixed footer, opt-out for contacts without consent, worker checks.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const P=require('../sales/crm-prospecting-core.js');
const core=require('../api/_sales_queue_core.js');
const mailq=require('../api/_sales_mailboxes.js');
const worker=require('../api/_sales_send_worker.js');
const u=require('../api/_sales_unsubscribe.js');
const campaigns=require('../sales/crm-campaigns.js');
const W='5b1d2c3e-4f50-4a61-8b72-9c83d4e5f601',M1='11111111-1111-4111-8111-111111111111';
const C1='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',C2='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',C3='cccccccc-cccc-4ccc-8ccc-cccccccccccc',C4='dddddddd-dddd-4ddd-8ddd-dddddddddddd',C5='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',C6='ffffffff-ffff-4fff-8fff-ffffffffffff';
const ENV={JWT_SECRET:'test-secret-for-prospecting-0123456789'};
const DAY=864e5,NOW=Date.parse('2026-10-20T08:00:00Z');
const seq=(...v)=>{let i=0;return ()=>v[i++%v.length]};
const note=(q,email,source='Dropcontact')=>'Email trovata con '+source+' il 01/10/2026 (qualifica: '+q+'): '+email;

test('business, generic and opted-out addresses',()=>{
 for(const e of ['mario.rossi@acme.it','m.rossi@studio-bianchi.com'])assert.ok(P.businessEmail(e),e);
 for(const e of ['mario@gmail.com','x@libero.it','a@pec.acme.it','acme@legalmail.it','noreply@acme.it','nope'])assert.equal(P.businessEmail(e),false,e);
 for(const e of ['info@acme.it','commerciale@acme.it','amministrazione@acme.it','sales@acme.it','office@acme.it','segreteria@acme.it','contatti@acme.it','hello@acme.it','info2@acme.it','info.milano@acme.it'])assert.ok(P.genericEmail(e),e);
 for(const e of ['mario.rossi@acme.it','irene@acme.it'])assert.equal(P.genericEmail(e),false,e);
 assert.ok(P.optedOut({notes:'bla\n\nDisiscrizione dalle email commerciali tramite link: 01/10/2026 10:00'}));
 assert.ok(P.optedOut({notes:'Disiscrizione: ha chiesto al telefono di non scrivergli'}),'a note written by hand counts');
 assert.ok(P.optedOut({opted_out:true}),'server flag (timeline note, same address elsewhere)');
 assert.equal(P.optedOut({notes:'cliente storico'}),false);
});

test('eligibility: first email — opt-out, webmail, generic, unverified by default, 90 days',()=>{
 const base={id:C1,name:'Mario Rossi',email:'mario.rossi@acme.it',notes:''};
 assert.equal(P.b2bReason(base,{step:0}),null,'no consent needed');
 assert.equal(P.b2bReason({...base,opted_out:true},{step:0}),'optout');
 assert.equal(P.b2bReason({...base,notes:'Disiscrizione dalle email commerciali tramite link: 01/01/2026 09:00'},{step:0}),'optout');
 assert.equal(P.b2bReason({...base,email:''},{step:0}),'email');
 assert.equal(P.b2bReason({...base,email:'mario@gmail.com'},{step:0}),'business');
 assert.equal(P.b2bReason({...base,email:'info@acme.it'},{step:0}),'generic','a role mailbox is never a prospect');
 assert.equal(P.b2bReason({...base,notes:note('nominative@pro','mario.rossi@acme.it')},{step:0}),null);
 assert.equal(P.b2bReason({...base,notes:note('pubblicata sul sito','mario.rossi@acme.it','sito aziendale')},{step:0}),null);
 assert.equal(P.b2bReason({...base,notes:note('verificata','mario.rossi@acme.it','Hunter')},{step:0}),null);
 for(const q of ['catch_all@pro','da verificare','catch_all']){
  assert.equal(P.b2bReason({...base,notes:note(q,'mario.rossi@acme.it')},{step:0}),'unverified',q+' excluded by default');
  assert.equal(P.b2bReason({...base,notes:note(q,'mario.rossi@acme.it')},{step:0,includeUnverified:true}),null,q+' allowed when ticked');
 }
 assert.equal(P.b2bReason({...base,notes:note('invalid@pro','mario.rossi@acme.it')},{step:0,includeUnverified:true}),'unverified','invalid never');
 assert.equal(P.b2bReason({...base,notes:note('catch_all@pro','old@acme.it')},{step:0}),null,'a note about an older address does not apply');
 assert.equal(P.b2bReason(base,{step:0,recent:new Set([C1])}),'recent');
 assert.equal(P.b2bReason(base,{step:0,recent:new Set(['mario.rossi@acme.it'])}),'recent','same address on another contact');
});

test('eligibility: follow-ups — after the previous step, 3+ days, never after a reply, at most 2',()=>{
 const c={id:C1,email:'mario.rossi@acme.it'},first=NOW-10*DAY;
 const ctx=(prev,extra)=>({step:1,now:NOW,firstSent:new Map([[C1,first]]),prevSent:new Map(prev===null?[]:[[C1,prev]]),...extra});
 assert.equal(P.b2bReason(c,ctx(null)),'previous');
 assert.equal(P.b2bReason(c,ctx(NOW-2*DAY)),'early');
 assert.equal(P.b2bReason(c,ctx(NOW-4*DAY)),null);
 assert.equal(P.b2bReason({...c,last_reply_at:new Date(first+DAY).toISOString()},ctx(NOW-4*DAY)),'replied');
 assert.equal(P.b2bReason({...c,last_reply_at:new Date(first-DAY).toISOString()},ctx(NOW-4*DAY)),null,'contacts before the sequence do not stop it');
 assert.equal(P.b2bCampaign('Ottobre',0),'B2B · Ottobre');assert.equal(P.b2bCampaign('B2B · Ottobre',2),'B2B · Ottobre · follow-up 2');
 assert.deepEqual(P.parseCampaign('B2B · Ottobre · follow-up 1'),{b2b:true,base:'Ottobre',step:1});
 assert.deepEqual(P.parseCampaign('Ottobre'),{b2b:false,base:'Ottobre',step:0});
 const q={campaign:'Ottobre',subject:'Ciao',body:'Testo',contacts:[C1],origin:'https://radix.example'};
 assert.throws(()=>mailq.command({workspace:W,entity:'send_queue',action:'plan',data:{...q,mode:'b2b',step:3,base:'Ottobre'}}),/follow-up 1 e 2/,'no third follow-up');
 assert.throws(()=>mailq.command({workspace:W,entity:'send_queue',action:'plan',data:{...q,mode:'b2b',step:1}}),/campagna B2B di partenza/);
 assert.throws(()=>mailq.command({workspace:W,entity:'send_queue',action:'plan',data:{...q,campaign:'B2B · finta'}}),/riservato/,'a consent campaign cannot pose as B2B');
 assert.throws(()=>mailq.command({workspace:W,entity:'send_queue',action:'plan',data:{...q,mode:'spam'}}),/Modalità/);
 const c1=mailq.command({workspace:W,entity:'send_queue',action:'plan',data:{...q,mode:'b2b',step:1,base:'B2B · Ottobre'}}).data;
 assert.equal(c1.campaign,'B2B · Ottobre · follow-up 1');assert.equal(c1.base,'B2B · Ottobre');
});

// Fake of the queries of the B2B plan.
function fakeDb({issuer={legal_name:'Radix Srl',vat_number:'IT01234567890',street:'Via Roma 1',zip:'20100',city:'Milano',province:'MI'},queue=[]}={}){
 const db={queue,calls:[],contacts:[
  {id:C1,name:'Mario Rossi',role:'CEO',email:'mario.rossi@acme.it',marketing_consent:false,company:'Acme',linkedin_url:'https://www.linkedin.com/in/mario',notes:note('nominative@pro','mario.rossi@acme.it'),opted_out:false},
  {id:C2,name:'Lucia Verdi',email:'lucia@gmail.com',marketing_consent:false,company:'Beta',notes:'',opted_out:false},
  {id:C3,name:'Ufficio Acme',email:'info@acme.it',marketing_consent:false,company:'Acme',notes:'',opted_out:false},
  {id:C4,name:'Paolo Neri',email:'p.neri@gamma.it',marketing_consent:false,company:'Gamma',notes:'',opted_out:true},
  {id:C5,name:'Anna Blu',email:'anna.blu@delta.it',marketing_consent:false,company:'Delta',notes:note('da verificare','anna.blu@delta.it','schema del sito aziendale'),opted_out:false},
  {id:C6,name:'Ugo Gialli',email:'ugo.gialli@epsilon.it',marketing_consent:true,company:'Epsilon',notes:'',opted_out:false}],
  mailboxes:[{id:M1,label:'Anna',from_name:'Anna Rossi',from_email:'anna@radix.example',daily_limit:50,warmup_start:'2026-01-01',status:'active'}]};
 db.sql=async(text,params=[])=>{
  const t=text.replace(/\s+/g,' ');db.calls.push({text:t,params});
  if(/FROM sales_contacts t LEFT JOIN sales_companies/.test(t))return db.contacts.filter(c=>params[1].includes(c.id));
  if(/FROM sales_document_settings/.test(t))return issuer?[issuer]:[];
  if(/^SELECT DISTINCT q\.contact_id/.test(t))return db.queue.filter(q=>q.campaign.startsWith('B2B · ')&&q.campaign!==params[2]).map(q=>({contact_id:q.contact_id,email:null}));
  if(/campaign=ANY\(\$2::text\[\]\) AND status='sent'/.test(t))return db.queue.filter(q=>params[1].includes(q.campaign)&&q.status==='sent').map(q=>({contact_id:q.contact_id,campaign:q.campaign,sent_at:q.sent_at}));
  if(/^SELECT q\.contact_id,lower\(btrim\(c\.email\)\) AS email FROM sales_send_queue/.test(t))return db.queue.filter(q=>q.campaign===params[1]).map(q=>({contact_id:q.contact_id,email:db.contacts.find(c=>c.id===q.contact_id).email}));
  if(/^SELECT id FROM sales_contacts/.test(t))return db.contacts.filter(c=>params[1].includes(c.id)).map(c=>({id:c.id}));
  if(/FROM sales_mailboxes WHERE workspace_id=\$1 ORDER BY/.test(t))return db.mailboxes;
  if(/FROM sales_send_queue WHERE workspace_id=\$1 AND mailbox_id IS NOT NULL/.test(t))return [];
  if(/^INSERT INTO sales_send_queue/.test(t)){const rows=JSON.parse(params[3]);for(const r of rows)db.queue.push({...r,campaign:params[1],status:'queued'});return rows.map((r,i)=>({id:i+1}))}
  throw new Error('unexpected query: '+t.slice(0,90));
 };
 return db;
}
const REQ={method:'POST',headers:{host:'radix.example'}};
const ctx=db=>({sql:db.sql,user:1,role:'member',req:REQ,env:ENV,now:NOW,random:seq(0.5)});
const ALL=[C1,C2,C3,C4,C5,C6];

test('B2B queue: only eligible people, fixed footer last, no tracked links, consent not needed',async()=>{
 const db=fakeDb(),data={campaign:'Ottobre',subject:'{nome}, una domanda',body:'Gentile {nome},\nho visto https://acme.it e volevo chiederle una cosa.',contacts:ALL,origin:'https://radix.example',mode:'b2b'};
 const plan=(await mailq.handle(mailq.command({workspace:W,entity:'send_queue',action:'plan',data}),ctx(db))).rows[0];
 assert.equal(plan.mode,'b2b');assert.equal(plan.campaign,'B2B · Ottobre');assert.equal(plan.issuer_ready,true);
 assert.equal(plan.recipients,2,'Mario (nominative@pro) and Ugo (typed by hand)');
 assert.deepEqual([plan.skipped.business,plan.skipped.generic,plan.skipped.optout,plan.skipped.unverified],[1,1,1,1]);
 assert.match(plan.footer_preview,/Radix Srl · P\.IVA IT01234567890 · Via Roma 1, 20100 Milano \(MI\)/);
 const r=(await mailq.handle(mailq.command({workspace:W,entity:'send_queue',action:'enqueue',data:{...data,confirm:true}}),ctx(db))).rows[0];
 assert.equal(r.queued,2);
 for(const q of db.queue){
  assert.equal(q.campaign,'B2B · Ottobre');
  assert.ok(P.hasFooter(q.body,q.unsubscribe_url),'footer present and last');
  assert.match(q.body,/^Anna Rossi · Radix Srl/m,'sender from the mailbox');
  assert.match(q.body,/legittimo interesse tra aziende \(B2B\)/);assert.match(q.body,/Da dove vengono i dati: .*profilo professionale pubblico/);
  assert.ok(!/\/api\/sales\?click=/.test(q.body),'no click tracking, no pixel: plain 1:1 text');
  assert.match(q.body,/https:\/\/acme\.it/);
 }
 const mario=db.queue.find(q=>q.contact_id===C1);assert.match(mario.body,/\(LinkedIn\); indirizzo email aziendale trovato con Dropcontact/);
 // Including «da verificare» on purpose adds Anna; a second first email within 90 days is refused.
 const again=(await mailq.handle(mailq.command({workspace:W,entity:'send_queue',action:'plan',data:{...data,campaign:'Novembre',include_unverified:true}}),ctx(db))).rows[0];
 assert.equal(again.recipients,1,'only Anna: Mario and Ugo were prospected in the last 90 days');assert.equal(again.skipped.recent,2);
});

test('B2B queue: the footer cannot be removed — long text is cut, footer stays; no issuer → refused',async()=>{
 const db=fakeDb(),data={campaign:'Lungo',subject:'Ciao',body:'x'.repeat(4000),contacts:[C1],origin:'https://radix.example',mode:'b2b',confirm:true};
 await mailq.handle(mailq.command({workspace:W,entity:'send_queue',action:'enqueue',data}),ctx(db));
 const q=db.queue[0];assert.ok(q.body.length<=4000);assert.ok(P.hasFooter(q.body,q.unsubscribe_url));
 const none=fakeDb({issuer:{name:'Radix'}});
 await assert.rejects(mailq.handle(mailq.command({workspace:W,entity:'send_queue',action:'enqueue',data}),ctx(none)),/Impostazioni › Documenti/);
 assert.equal(none.queue.length,0);
});

test('B2B follow-ups: only after the first email was sent 3+ days ago, never after a reply',async()=>{
 const sent=new Date(NOW-5*DAY).toISOString();
 const db=fakeDb({queue:[{campaign:'B2B · Ottobre',contact_id:C1,status:'sent',sent_at:sent},{campaign:'B2B · Ottobre',contact_id:C6,status:'sent',sent_at:sent}]});
 db.contacts.find(c=>c.id===C6).last_reply_at=new Date(NOW-DAY).toISOString();
 const plan=(await mailq.handle(mailq.command({workspace:W,entity:'send_queue',action:'plan',data:{campaign:'x',subject:'Ritorno',body:'Le riscrivo',contacts:[C1,C6,C5],origin:'https://radix.example',mode:'b2b',step:1,base:'Ottobre',include_unverified:true}}),ctx(db))).rows[0];
 assert.equal(plan.campaign,'B2B · Ottobre · follow-up 1');assert.equal(plan.recipients,1);assert.equal(plan.skipped.replied,1);assert.equal(plan.skipped.previous,1);
});

test('consent campaigns skip opted-out contacts too (queue and direct send)',async()=>{
 const db=fakeDb();
 const plan=(await mailq.handle(mailq.command({workspace:W,entity:'send_queue',action:'plan',data:{campaign:'News',subject:'News',body:'Testo',contacts:ALL,origin:'https://radix.example'}}),ctx(db))).rows[0];
 assert.equal(plan.recipients,1,'only Ugo has consent');assert.equal(plan.skipped.optout,1);
 const recipients=db.calls.find(c=>/FROM sales_contacts t LEFT JOIN/.test(c.text));assert.match(recipients.text,/AS opted_out/);
 const direct=campaigns.planCampaign('S','B',[{id:'a',name:'A',email:'a@x.it',marketing_consent:true,notes:'Disiscrizione dalle email commerciali tramite link: 01/10/2026 09:00'},{id:'b',name:'B',email:'b@x.it',marketing_consent:true}]);
 assert.deepEqual(direct.emails.map(e=>e.contact.id),['b'],'re-ticking consent by hand does not undo an opt-out');
});

test('worker: opted-out never sent in any mode; B2B rows go without consent, only to personal business addresses',()=>{
 const mb={id:M1,status:'active',daily_limit:50,warmup_start:'2026-01-01'},now=Date.parse('2026-10-20T09:00:00Z');
 const b2b={campaign:'B2B · Ottobre',created_at:new Date(now-DAY).toISOString()},plain={campaign:'Ottobre'};
 const c={email:'mario.rossi@acme.it',marketing_consent:false};
 assert.equal(core.decide(b2b,c,mb,{now}).action,'send');
 assert.match(core.decide(plain,c,mb,{now}).error,/Consenso/);
 for(const row of [b2b,plain]){assert.match(core.decide(row,{...c,marketing_consent:true,opted_out:true},mb,{now}).error,/disiscritto/);
  assert.match(core.decide(row,{...c,marketing_consent:true,notes:'Disiscrizione dalle email commerciali tramite link: 01/10/2026'},mb,{now}).error,/disiscritto/)}
 assert.match(core.decide(b2b,{...c,email:'mario@gmail.com'},mb,{now}).error,/non è aziendale/);
 assert.match(core.decide(b2b,{...c,email:'info@acme.it'},mb,{now}).error,/generico/);
 const fu={campaign:'B2B · Ottobre · follow-up 1',created_at:new Date(now-2*DAY).toISOString()};
 assert.equal(core.decide(fu,c,mb,{now}).action,'send');
 assert.match(core.decide(fu,{...c,last_reply_at:new Date(now-DAY).toISOString()},mb,{now}).error,/follow-up fermato/,'a reply logged after queueing stops it');
 // The worker reads the opt-out and reply signals with every contact, and the row's created_at.
 const calls=[];const db=worker.sqlDb(async(q,p)=>{calls.push(q.replace(/\s+/g,' '));return []});
 db.contacts([{workspace_id:W,contact_id:C1}]);db.claim(1,1);
 assert.match(calls[0],/AS opted_out/);assert.match(calls[0],/AS last_reply_at/);assert.match(calls[0],/title ILIKE 'Disiscrizione%'/);
 assert.match(calls[1],/q\.created_at$/);
});

test('unsubscribe works for contacts without consent: marker note, timeline note, queued emails cancelled',async()=>{
 const K='k'.repeat(40);
 // A tiny contact store that runs the semantics of the three statements.
 const contact={id:C1,marketing_consent:false,notes:'',company_id:null,version:1},interactions=[],queue=[{contact_id:C1,status:'queued'},{contact_id:C1,status:'sent'}];
 const sql=async(q)=>{
  if(/^UPDATE sales_contacts t SET marketing_consent=false/.test(q)){
   assert.match(q,/AND \(marketing_consent OR NOT \(coalesce\(notes,''\) ILIKE '%disiscrizione%' OR EXISTS/);
   const marked=/disiscrizione/i.test(contact.notes)||interactions.length>0;
   if(!(contact.marketing_consent||!marked))return [];
   contact.marketing_consent=false;contact.version++;contact.notes=(contact.notes?contact.notes+'\n\n':'')+'Disiscrizione dalle email commerciali tramite link: 20/10/2026 10:00';return [{id:C1}];
  }
  if(/^INSERT INTO sales_interactions/.test(q)){if(!interactions.length)interactions.push({title:'Disiscrizione dalle email commerciali',kind:'note'});return []}
  if(/^UPDATE sales_send_queue SET status='cancelled'/.test(q)){for(const r of queue)if(r.status==='queued')r.status='cancelled';return []}
  if(/^SELECT id FROM sales_contacts/.test(q))return [{id:C1}];
  throw new Error('unexpected '+q.slice(0,40));
 };
 const res=()=>{const r={headers:{},setHeader(k,v){r.headers[k]=v},status(s){r.code=s;return r},send(b){r.body=b;return r}};return r};
 const token=u.sign(K,W,C1);
 let r=res();await u.handle({method:'POST',query:{unsubscribe:token}},r,{getSql:()=>sql,secret:K});
 assert.equal(r.code,200);assert.match(r.body,/Disiscrizione registrata/);
 assert.match(contact.notes,/Disiscrizione dalle email commerciali tramite link/,'note written although there was no consent');
 assert.equal(interactions.length,1);assert.deepEqual(queue.map(x=>x.status),['cancelled','sent']);
 assert.ok(P.optedOut(contact),'from now on every mode skips this person');
 r=res();await u.handle({method:'POST',query:{unsubscribe:token}},r,{getSql:()=>sql,secret:K});
 assert.equal(contact.version,2,'a second click changes nothing');assert.equal(interactions.length,1);
 const src=fs.readFileSync(__dirname+'/../api/_sales_optout.js','utf8');assert.match(src,/lower\(btrim\(oc\.email\)\)=lower\(btrim\(\$\{t\}\.email\)\)/,'an opt-out follows the address to duplicate contacts');
});

test('wiring: scripts on the CRM and settings pages, mode switch in the campaign panel',()=>{
 const html=fs.readFileSync(__dirname+'/../radix-sales.html','utf8');
 for(const f of ['crm-prospecting-core.js','crm-email-finder-core.js','crm-prospecting.js'])assert.ok(html.includes('sales/'+f),f);
 assert.ok(html.indexOf('crm-prospecting.js')<html.indexOf('crm-list.js'));
 const set=fs.readFileSync(__dirname+'/../impostazioni.html','utf8');assert.ok(set.includes('/sales/crm-prospecting.js'));
 const camp=fs.readFileSync(__dirname+'/../sales/crm-campaigns.js','utf8');assert.match(camp,/Prospezione B2B/);assert.match(camp,/prep\.disabled=on/,'B2B goes only through the queue');
});
