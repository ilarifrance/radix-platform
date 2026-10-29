'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const P=require('../sales/crm-posta-core.js');
const ms=require('../api/_ms_oauth.js');
const R=require('../api/_sales_mail_read.js');
const W='5b1d2c3e-4f50-4a61-8b72-9c83d4e5f601',M1='11111111-1111-4111-8111-111111111111';
const ENV={MAILBOX_ENC_KEY:crypto.randomBytes(32).toString('base64'),JWT_SECRET:'test-secret-for-ms-oauth-tests-0123456789',MS_CLIENT_ID:'cid-123',MS_CLIENT_SECRET:'top-secret-value',MS_TENANT_ID:'11111111-2222-3333-4444-555555555555'};
const json=(status,body)=>({ok:status>=200&&status<300,status,json:async()=>body});
const OWN='f.ilari@example.com';
const msg={id:'AAMkAD1234567890',subject:'Re: offerta forni',from:{name:'Mario Rossi',address:'Mario.Rossi@cliente.it'},to:[{name:'Francesco',address:OWN}],cc:[{name:'',address:'acquisti@cliente.it'}],
 at:'2026-10-27T09:15:42Z',preview:'Buongiorno…',text:'Buongiorno,\n\nconfermiamo la demo.',attachments:true};
const contacts=[{id:'c1',name:'Mario Rossi',email:'mario.rossi@cliente.it',company_id:'co1'},{id:'c2',name:'Ufficio acquisti',email:'acquisti@cliente.it',company_id:'co1'},{id:'c3',name:'Altro',email:'x@y.it'}];

test('matching: participants except the mailbox, contacts found by address (case ignored), sender first',()=>{
 assert.deepEqual(P.participants(msg,OWN).map(p=>p.address),['mario.rossi@cliente.it','acquisti@cliente.it']);
 assert.deepEqual(P.matches(msg,contacts,OWN).map(c=>c.id),['c1','c2']);
 assert.equal(P.direction(msg,OWN),'received');assert.equal(P.direction({...msg,from:{address:'F.Ilari@example.com'}},OWN),'sent');
});
test('«Collega al CRM»: an email interaction with title, exact second, who and text, contact and company',()=>{
 const r=P.interaction(msg,OWN,{contact:contacts[0]});
 assert.deepEqual(Object.keys(r.data).sort(),['body','company_id','contact_id','kind','occurred_at','opportunity_id','title']);
 assert.equal(r.data.title,'Email ricevuta: Re: offerta forni');assert.equal(r.data.kind,'email');assert.equal(r.data.occurred_at,'2026-10-27T09:15:42Z');
 assert.equal(r.data.contact_id,'c1');assert.equal(r.data.company_id,'co1');assert.equal(r.data.opportunity_id,null);
 assert.match(r.data.body,/^Da: Mario Rossi <Mario\.Rossi@cliente\.it>\nA: Francesco <f\.ilari@example\.com>\nCc: acquisti@cliente\.it\nCon allegati/);
 assert.match(r.data.body,/confermiamo la demo\.$/);
 const long=P.interaction({...msg,text:'x'.repeat(9000)},OWN,{contact:contacts[0]});assert.equal(long.data.body.length,P.MAX);
 const opp={id:'o1',title:'Forni',contact_id:'c1',company_id:'co1'};assert.equal(P.interaction(msg,OWN,{contact:contacts[0],opportunity:opp}).data.opportunity_id,'o1');
 assert.match(P.interaction(msg,OWN,{contact:contacts[0],opportunity:{...opp,contact_id:'c9'}}).error,/altro contatto/);
 assert.match(P.interaction(msg,OWN,{}).error,/Scegli/);
 assert.equal(P.interaction(msg,OWN,{opportunity:opp}).data.contact_id,'c1','an opportunity alone brings its contact');
});
test('already linked: same title and same second; opportunities offered for a contact; contact from a sender',()=>{
 const d=P.interaction(msg,OWN,{contact:contacts[0]}).data;
 assert.equal(P.linked(msg,OWN,[{...d,occurred_at:'2026-10-27T09:15:42.000Z'}]).length,1);
 assert.equal(P.linked({...msg,at:'2026-10-27T09:15:43Z'},OWN,[d]).length,0);
 const opps=[{id:'a',contact_id:'c1',outcome:'open'},{id:'b',company_id:'co1',contact_id:null},{id:'c',contact_id:'c1',outcome:'won'},{id:'d',company_id:'co1',contact_id:'c2'}];
 assert.deepEqual(P.opportunitiesFor(contacts[0],opps).map(o=>o.id),['a','b']);
 assert.deepEqual(P.contactFrom({name:'',address:'giulia.bianchi@x.it'}),{name:'Giulia Bianchi',email:'giulia.bianchi@x.it'});
 assert.equal(P.contactFrom({address:'nope'}),null);
 assert.equal(P.companyByDomain('giulia@cliente.it',contacts),'co1');assert.equal(P.companyByDomain('a@gmail.com',[{email:'b@gmail.com',company_id:'z'}]),null);
 assert.equal(P.companyByDomain('a@d.it',[{email:'b@d.it',company_id:'1'},{email:'c@d.it',company_id:'2'}]),null,'two companies: none');
});

test('scopes: sign-in asks Mail.Read too; sending refreshes without it, reading with it',async()=>{
 const u=new URL(ms.authorizeUrl(ENV,{redirectUri:'https://a.b/api/ms-oauth',state:'s'}));
 assert.match(u.searchParams.get('scope'),/Mail\.Read/);assert.match(u.searchParams.get('scope'),/Mail\.Send/);
 const seen=[];const f=async(url,o)=>{seen.push(new URLSearchParams(o.body).get('scope'));return json(200,{access_token:'at'})};
 await ms.refresh(ENV,'rt',f);await ms.refreshRead(ENV,'rt',f);
 assert.ok(!/Mail\.Read/.test(seen[0]),'sending keeps working for mailboxes connected before');assert.match(seen[1],/Mail\.Read/);
});

test('query: only known parameters, folder inbox|sent, bounded search, page and message id',()=>{
 assert.deepEqual(R.query({entity:'mail',workspace:W,mailbox:M1}),{workspace:W,entity:'mail',mailbox:M1,folder:'inbox',search:'',skip:0,id:null});
 assert.equal(R.query({entity:'mail',workspace:W,mailbox:M1,folder:'sent',skip:'25',search:' forni '}).search,'forni');
 for(const bad of [{folder:'drafts'},{skip:'-1'},{skip:'2000'},{search:'x'.repeat(101)},{id:'bad id!'},{other:'1'},{mailbox:'nope'}])
  assert.throws(()=>R.query({entity:'mail',workspace:W,mailbox:M1,...bad}),e=>e.status===400);
});

function store(row){const log=[];const sql=async(q,p)=>{log.push({q,p});if(/^SELECT/.test(q))return row?[row]:[];return []};sql.log=log;return sql}
function mailbox(created_by=7){const e=ms.sealToken('refresh-1',W,M1,ENV);return {workspace_id:W,id:M1,label:'Lavoro',from_email:OWN,provider:'microsoft',created_by,...e}}
test('read: only whoever connected the mailbox; list shaped, token rotated, no secret in errors',async()=>{
 const calls=[];const f=async(url,o)=>{calls.push({url:String(url),o});
  if(/oauth2/.test(url))return json(200,{access_token:'at-1',refresh_token:'refresh-2'});
  return json(200,{value:[{id:'AAMk1',subject:'Ciao',from:{emailAddress:{name:'Mario',address:'Mario@X.it'}},toRecipients:[{emailAddress:{address:OWN}}],receivedDateTime:'2026-10-27T09:00:00Z',bodyPreview:'p',webLink:'https://outlook.office.com/x',hasAttachments:false}]})};
 const sql=store(mailbox());
 const out=await R.handle(R.query({entity:'mail',workspace:W,mailbox:M1}),{sql,user:7,env:ENV,fetchImpl:f});
 assert.equal(out.rows.length,1);assert.deepEqual(out.rows[0].from,{name:'Mario',address:'mario@x.it'});assert.equal(out.rows[0].link,'https://outlook.office.com/x');
 assert.match(calls[1].url,/\/me\/mailFolders\/inbox\/messages\?/);assert.match(calls[1].url,/orderby=receivedDateTime\+desc/);
 assert.ok(sql.log.some(x=>/UPDATE sales_mailboxes SET oauth_ciphertext/.test(x.q)),'rotated refresh token saved encrypted');
 assert.ok(!JSON.stringify(out).includes('refresh-'));
 await assert.rejects(()=>R.handle(R.query({entity:'mail',workspace:W,mailbox:M1}),{sql:store(mailbox(8)),user:7,env:ENV,fetchImpl:f}),e=>e.status===403);
 await assert.rejects(()=>R.handle(R.query({entity:'mail',workspace:W,mailbox:M1}),{sql:store(null),user:7,env:ENV,fetchImpl:f}),e=>e.status===404);
});
test('read: a mailbox connected before Mail.Read answers «ricollega» (needs_reconnect)',async()=>{
 const f=async()=>json(400,{error:'invalid_grant',error_description:'AADSTS65001 consent required'});
 await assert.rejects(()=>R.handle(R.query({entity:'mail',workspace:W,mailbox:M1}),{sql:store(mailbox()),user:7,env:ENV,fetchImpl:f}),e=>e.status===409&&e.code==='needs_reconnect'&&/ricollega/i.test(e.message));
 const g=async(url)=>/oauth2/.test(url)?json(200,{access_token:'at'}):json(403,{error:{code:'ErrorAccessDenied',message:'Access is denied.'}});
 await assert.rejects(()=>R.handle(R.query({entity:'mail',workspace:W,mailbox:M1}),{sql:store(mailbox()),user:7,env:ENV,fetchImpl:g}),e=>e.code==='needs_reconnect');
});
test('read one message: text body requested, search uses ConsistencyLevel',async()=>{
 const calls=[];const f=async(url,o)=>{calls.push({url:String(url),h:o.headers||{}});if(/oauth2/.test(url))return json(200,{access_token:'at'});
  return json(200,/\$search/.test(url)?{value:[]}:{id:'AAMk1',subject:'S',body:{content:'Riga 1\r\n\r\n\r\n\r\nRiga 2'}})};
 const one=await R.handle(R.query({entity:'mail',workspace:W,mailbox:M1,id:'AAMk1234567'}),{sql:store(mailbox()),user:7,env:ENV,fetchImpl:f});
 assert.equal(one.rows[0].text,'Riga 1\n\nRiga 2');assert.match(calls[1].h.Prefer,/body-content-type="text"/);
 await R.handle(R.query({entity:'mail',workspace:W,mailbox:M1,search:'forni "x"'}),{sql:store(mailbox()),user:7,env:ENV,fetchImpl:f});
 assert.equal(calls[3].h.ConsistencyLevel,'eventual');assert.ok(!/orderby/.test(calls[3].url));
});
test('wiring: route in /api/sales, page, nav entry, reconnect sets the owner',()=>{
 const api=fs.readFileSync('api/_sales.js','utf8'),cb=fs.readFileSync('api/ms-oauth.js','utf8'),nav=fs.readFileSync('sales/sales-nav.js','utf8'),html=fs.readFileSync('sales-posta.html','utf8');
 assert.match(api,/q\.entity===mailRead\.ENTITY\)c=\{\.\.\.mailRead\.query\(q\),mailRead:true\}/);
 assert.match(cb,/created_by=\$7/);assert.match(nav,/'\/sales-posta\.html', text: 'Posta', ic: 'mail'/);
 assert.ok(fs.existsSync('sales/icons/mail.svg'));
 for(const s of ['crm-dates-core.js','crm-posta-core.js','crm-posta.js'])assert.ok(html.includes('/sales/'+s));
});
test('replies to campaigns: a received mail from a contact the queue wrote to, with no answer recorded since; one button records them',()=>{
 const sent={contact_id:'c1',kind:'email',title:'Email: Proposta per Cliente',occurred_at:'2026-10-26T08:00:00Z'};
 const reply={...msg,at:'2026-10-27T09:15:42Z'};
 const r=P.campaignReply(reply,OWN,contacts,[sent]);assert.equal(r.contact.id,'c1');assert.equal(r.sent,sent);
 assert.equal(P.campaignReply(reply,OWN,contacts,[]),null,'never written to by the queue');
 assert.equal(P.campaignReply(reply,OWN,contacts,[{...sent,occurred_at:'2026-10-28T08:00:00Z'}]),null,'the campaign email came after this mail');
 assert.equal(P.campaignReply(reply,OWN,contacts,[sent,{contact_id:'c1',kind:'call',title:'Telefonata',occurred_at:'2026-10-26T12:00:00Z'}]),null,'an answer is already recorded');
 assert.equal(P.campaignReply(reply,OWN,contacts,[sent,{contact_id:'c1',kind:'email',title:'Email: Follow-up 1',occurred_at:'2026-10-26T12:00:00Z'}]).sent.title,'Email: Follow-up 1','a second queue email is not an answer');
 assert.equal(P.campaignReply(reply,OWN,contacts,[sent,{contact_id:'c1',kind:'note',title:'Disiscrizione dalla newsletter',occurred_at:'2026-10-26T12:00:00Z'}]),null,'an opt-out is not an answer either: no follow-up, nothing to record');
 assert.equal(P.campaignReply(reply,OWN,contacts,[{...sent,contact_id:'c2'}]),null,'another contact');
 assert.equal(P.campaignReply({...reply,from:{address:OWN}},OWN,contacts,[sent]),null,'sent by the mailbox itself');
 const linked=P.interaction(reply,OWN,{contact:contacts[0]}).data;assert.equal(P.campaignReply(reply,OWN,contacts,[sent,linked]),null,'already linked: «Email ricevuta: …» counts as the answer');
 assert.deepEqual(P.campaignReplies([reply,{...reply,id:'m2',from:{address:'nobody@x.it'}}],OWN,contacts,[sent]).map(x=>x.msg.id),[reply.id]);
 const ui=fs.readFileSync(__dirname+'/../sales/crm-posta.js','utf8');
 assert.ok(ui.includes("'↩ Risposta a una campagna','pm-tag reply'")&&ui.includes("b.id='pm-replies'")&&ui.includes('window.confirm(')&&ui.includes("post('interactions',p.data)"));
 assert.ok(ui.indexOf('window.confirm(')<ui.indexOf("get({entity:'mail',workspace:S.workspace,mailbox:S.mailbox,id:r.msg.id})"),'nothing is read or saved before the confirmation');
 assert.ok(fs.readFileSync(__dirname+'/../sales/crm-posta.css','utf8').includes('.pm-tag.reply'));
 require('../lib/radix-i18n-en.js');assert.equal(globalThis.RadixI18nEn['↩ Risposta a una campagna'],'↩ Reply to a campaign');
});

test('keyboard: ↑ ↓ j k Home End move between the mails from the list and from the open mail; typing in a field is left alone',()=>{
 const ui=fs.readFileSync(__dirname+'/../sales/crm-posta.js','utf8');
 assert.match(ui,/\$\('pm-items'\)\.addEventListener\('keydown',onKeys\);\$\('pm-read'\)\.addEventListener\('keydown',onKeys\)/);
 assert.match(ui,/\['ArrowDown','ArrowUp','Home','End','j','k'\]\.includes\(e\.key\)&&step\(e\.key\)\)e\.preventDefault\(\)/);
 assert.match(ui,/tag==='INPUT'\|\|tag==='TEXTAREA'\|\|tag==='SELECT'/);
 assert.match(ui,/openMessage\(m\);const b=listButtons\(\)\[n\];if\(b\)\{b\.focus\(\{preventScroll:true\}\);b\.scrollIntoView\(\{block:'nearest'\}\)\}/,'the newly opened row keeps the focus after the list is redrawn');
 assert.match(ui,/href:'\/impostazioni\.html\?area=sales#caselle'/,'the reconnect link keeps the Sales menu');
});
