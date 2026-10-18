'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{Readable}=require('node:stream');
process.env.JWT_SECRET=process.env.JWT_SECRET||'test-secret';
const billing=require('../api/_accounting_billing');
const auth=require('../api/_auth');
const {createHandler}=require('../api/_accounting');

const C='22222222-2222-4222-8222-222222222222';
function call(handler,{method='POST',body,query={},headers={},cookie}={}){return new Promise(resolve=>{
 const res={headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;},status(c){this.statusCode=c;return this;},json(o){resolve({status:this.statusCode,body:o,headers:this.headers});return this;}};
 handler({method,body,query,headers:{'content-type':'application/json','x-radix-accounting':'1',host:'radix.test',...(cookie?{cookie}:{}),...headers}},res);});}
function fakeStore({account=null,exists=false}={}){
 const txs=[],reads=[];
 return {txs,reads,json:async(t,p)=>{reads.push([t,p]);if(/FROM users WHERE lower\(email\)/.test(t))return exists?true:null;if(/nextval/.test(t))return 41;
   if(/'kind','client'/.test(t))return account;if(/'company',c.company_id,'email'/.test(t))return account&&{company:account.company,email:account.email,status:account.status};
   if(/FROM acc_companies c JOIN acc_memberships/.test(t))return [{id:C,name:'Alfa Srl'}];return null;},
  tx:async q=>{txs.push(q);return [];}};
}
function fakeFetch(){const calls=[];const f=async(url,opt)=>{calls.push({url,opt});return {ok:true,json:async()=>({id:'cs_test_1',url:'https://checkout.stripe.com/c/pay/cs_test_1'})};};f.calls=calls;return f;}
const signupBody={action:'signup.start',data:{name:'Mario Rossi',email:'Mario@Alfa.it',password:'una-password-lunga',accept:true,accept_clauses:true,company:{name:'Alfa Srl',vat:'01234567890',regime:'ordinario',vat_periodicity:'quarterly'}}};

test('sign-up needs Stripe configured and creates nothing without it',async()=>{
 delete process.env.STRIPE_SECRET_KEY;const st=fakeStore();
 const r=await call(createHandler({getSessionUser:()=>null,getClientUser:billing.getClientUser,billing,getStore:()=>st}),{body:signupBody});
 assert.equal(r.status,503);assert.equal(st.txs.length,0);
});

test('sign-up creates account, company, subscription and opens Stripe Checkout at 39 € + IVA',async()=>{
 process.env.STRIPE_SECRET_KEY='sk_test_x';const st=fakeStore(),f=fakeFetch();
 const H=createHandler({getSessionUser:()=>null,getClientUser:billing.getClientUser,billing,getStore:()=>st,fetchImpl:f});
 const r=await call(H,{body:signupBody,headers:{'x-forwarded-for':'10.0.0.1'}});
 assert.equal(r.status,200,JSON.stringify(r.body));assert.match(r.body.url,/^https:\/\/checkout\.stripe\.com\//);
 const q=st.txs[0].map(x=>x[0]);
 assert.match(q[0],/INSERT INTO users/);assert.equal(st.txs[0][0][1][1],'mario@alfa.it');assert.notEqual(st.txs[0][0][1][3],'una-password-lunga');
 assert.ok(q.some(t=>/INSERT INTO acc_client_accounts/.test(t)));assert.ok(q.some(t=>/INSERT INTO acc_subscriptions/.test(t)));
 assert.ok(q.some(t=>/'professionista'/.test(t)),'the plan includes the accountant');
 const body=decodeURIComponent(f.calls[0].opt.body);
 assert.match(body,/mode=subscription/);assert.match(body,/\[unit_amount\]=4758/);assert.match(body,/client_reference_id=/);assert.match(body,/success_url=https:\/\/radix\.test\/contabilita\/app\/\?pagamento=ok/);
 assert.equal(f.calls[0].opt.headers.Authorization,'Bearer sk_test_x');
 // The cookie is a client session, not a team session.
 const token=decodeURIComponent(/radix_client=([^;]+)/.exec(r.headers['Set-Cookie'])[1]);
 assert.deepEqual(billing.verifyClient(token),{uid:41,client:true});assert.equal(auth.verifySessionToken(token),null);
 assert.equal(billing.verifyClient(auth.signSessionToken({uid:41})),null);
});

test('sign-up refuses existing emails, missing consent and short passwords',async()=>{
 process.env.STRIPE_SECRET_KEY='sk_test_x';
 const H=st=>createHandler({getSessionUser:()=>null,getClientUser:billing.getClientUser,billing,getStore:()=>st,fetchImpl:fakeFetch()});
 assert.equal((await call(H(fakeStore({exists:true})),{body:signupBody,headers:{'x-forwarded-for':'10.0.0.2'}})).status,409);
 assert.equal((await call(H(fakeStore()),{body:{...signupBody,data:{...signupBody.data,accept:false}},headers:{'x-forwarded-for':'10.0.0.2'}})).status,400);
 assert.equal((await call(H(fakeStore()),{body:{...signupBody,data:{...signupBody.data,password:'corta'}},headers:{'x-forwarded-for':'10.0.0.2'}})).status,400);
});

test('client accounts: closed until paid, then limited to their own company',async()=>{
 const cookie='radix_client='+encodeURIComponent(billing.signClient(41));
 const pending=fakeStore({account:{kind:'client',company:C,email:'mario@alfa.it',status:'incomplete'}}),f=fakeFetch();
 const H=st=>createHandler({getSessionUser:auth.getSessionUser,getClientUser:billing.getClientUser,billing,getStore:()=>st,fetchImpl:f});
 assert.equal((await call(H(pending),{method:'GET',query:{resource:'companies'},cookie})).status,402);
 assert.equal((await call(H(pending),{method:'GET',query:{resource:'account'},cookie})).body.status,'incomplete');
 const pay=await call(H(pending),{body:{action:'billing.checkout',data:{}},cookie});assert.equal(pay.status,200);assert.match(pay.body.url,/checkout\.stripe\.com/);
 const active=fakeStore({account:{kind:'client',company:C,email:'mario@alfa.it',status:'active'}});
 assert.equal((await call(H(active),{method:'GET',query:{resource:'companies'},cookie})).status,200);
 assert.equal((await call(H(active),{body:{action:'company.create',data:{name:'Altra'}},cookie})).status,403);
 assert.equal((await call(H(active),{body:{action:'billing.checkout',data:{}},cookie})).status,409);
 assert.equal((await call(H(active),{body:{company:C,action:'company.update',data:{version:1,plan:'base'}},cookie})).status,403,'clients do not change their plan');
 assert.equal((await call(H(active),{body:{company:C,action:'company.update',data:{version:1,size:'base'}},cookie})).status,403,'clients do not change their size pack');
 // A client token placed in the team cookie is not a team session.
 assert.equal((await call(H(active),{method:'GET',query:{resource:'companies'},cookie:'radix_session='+encodeURIComponent(billing.signClient(41))})).status,401);
});

function signed(event,secret,t=Math.floor(Date.now()/1000)){const raw=JSON.stringify(event);return {raw,header:'t='+t+',v1='+crypto.createHmac('sha256',secret).update(t+'.'+raw).digest('hex')};}
test('Stripe webhook: signature checked, subscription status follows the newest event',async()=>{
 process.env.STRIPE_WEBHOOK_SECRET='whsec_test';
 const send=(st,raw,header)=>new Promise(resolve=>{const req=Readable.from([Buffer.from(raw)]);Object.assign(req,{method:'POST',query:{},headers:{'stripe-signature':header}});
  const res={headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;},status(c){this.statusCode=c;return this;},json(o){resolve({status:this.statusCode,body:o});return this;}};billing.webhook(st,req,res).then(o=>res.status(200).json(o),e=>res.status(e.status||500).json({error:e.message}));});
 const ev={id:'evt_1',type:'checkout.session.completed',created:1760000000,data:{object:{client_reference_id:C,customer:'cus_1',subscription:'sub_1',payment_status:'paid'}}};
 const ok=signed(ev,'whsec_test'),st=fakeStore();
 assert.equal((await send(st,ok.raw,ok.header)).status,200);
 const [ins,upd]=st.txs[0];assert.match(ins[0],/acc_billing_events.*ON CONFLICT\(id\) DO NOTHING/s);assert.match(upd[0],/status_at<=\$5/);assert.deepEqual(upd[1],[C,'cus_1','sub_1',true,1760000000]);
 assert.equal((await send(fakeStore(),ok.raw,ok.header.replace(/v1=.*/,'v1='+'0'.repeat(64)))).status,400);
 assert.equal((await send(fakeStore(),ok.raw,signed(ev,'whsec_test',Math.floor(Date.now()/1000)-900).header)).status,400,'old signatures are refused');
 const del=signed({id:'evt_2',type:'customer.subscription.deleted',created:1760000500,data:{object:{id:'sub_1',customer:'cus_1',status:'canceled',metadata:{company_id:C}}}},'whsec_test'),st2=fakeStore();
 assert.equal((await send(st2,del.raw,del.header)).status,200);assert.equal(st2.txs[0][1][1][1],'canceled');assert.match(st2.txs[0][1][0],/status_at IS NULL OR status_at<=\$6/);
});

test('sign-up needs the specific approval of the onerous clauses and records the terms version',async()=>{
 process.env.STRIPE_SECRET_KEY='sk_test_x';const st=fakeStore();
 const H=createHandler({getSessionUser:()=>null,getClientUser:billing.getClientUser,billing,getStore:()=>st,fetchImpl:fakeFetch()});
 const r=await call(H,{body:{...signupBody,data:{...signupBody.data,accept_clauses:false}},headers:{'x-forwarded-for':'10.0.0.3'}});
 assert.equal(r.status,400);assert.match(r.body.error,/articolo 14/);assert.equal(st.txs.length,0);
 assert.equal((await call(H,{body:signupBody,headers:{'x-forwarded-for':'10.0.0.4'}})).status,200);
 const audit=st.txs[0].find(x=>/INSERT INTO acc_audit/.test(x[0]));const detail=JSON.parse(audit[1][3]);
 assert.equal(detail.terms_version,billing.TERMS_VERSION);assert.deepEqual(detail.accepted,['condizioni','privacy','art_1341_1342']);assert.equal(detail.ip,'10.0.0.4');
});

test('sign-up with a larger size pack charges its price and stores the pack',async()=>{
 process.env.STRIPE_SECRET_KEY='sk_test_x';const st=fakeStore(),f=fakeFetch();
 const H=createHandler({getSessionUser:()=>null,getClientUser:billing.getClientUser,billing,getStore:()=>st,fetchImpl:f});
 assert.equal((await call(H,{body:{...signupBody,data:{...signupBody.data,size:'enorme'}},headers:{'x-forwarded-for':'10.0.0.5'}})).status,400);
 const r=await call(H,{body:{...signupBody,data:{...signupBody.data,size:'crescita'}},headers:{'x-forwarded-for':'10.0.0.6'}});
 assert.equal(r.status,200,JSON.stringify(r.body));
 const qs=st.txs[0],co=qs.find(x=>/INSERT INTO acc_companies/.test(x[0])),sub=qs.find(x=>/INSERT INTO acc_subscriptions/.test(x[0]));
 assert.equal(co[1][7],'crescita');assert.equal(sub[1][1],6900);
 const body=decodeURIComponent(f.calls[0].opt.body);assert.match(body,/\[unit_amount\]=8418/);assert.match(body,/RADIX Contabilità · Crescita/);
});

test('legal pages: terms and privacy exist, are linked from every public page and load no third-party fonts',()=>{
 const fs=require('node:fs'),d=__dirname+'/../contabilita/';
 const terms=fs.readFileSync(d+'condizioni.html','utf8'),priv=fs.readFileSync(d+'privacy.html','utf8');
 assert.match(terms,new RegExp('Versione '+billing.TERMS_VERSION));assert.match(priv,new RegExp('Versione '+billing.TERMS_VERSION));
 assert.match(terms,/id="approvazione"/);assert.match(terms,/id="allegato-a"/);assert.match(terms,/1341/);
 for(const f of ['index.html','iscrizione.html','accedi.html','condizioni.html','privacy.html']){const h=fs.readFileSync(d+f,'utf8');
  assert.match(h,/href="\/contabilita\/condizioni\.html"/,f);assert.match(h,/href="\/contabilita\/privacy\.html"/,f);assert.doesNotMatch(h,/googleapis|gstatic/,f);}
 assert.doesNotMatch(fs.readFileSync(d+'app/index.html','utf8'),/googleapis|gstatic/);
 const signup=fs.readFileSync(d+'iscrizione.html','utf8');assert.match(signup,/name="accept"/);assert.match(signup,/name="accept_clauses"[^>]*required/);
 assert.match(fs.readFileSync(d+'account.js','utf8'),/accept_clauses:f\.accept_clauses\.checked/);
 // The demo link on the public page opens the demonstration company without an account.
 assert.match(fs.readFileSync(__dirname+'/../accounting/app.js','utf8'),/get\('demo'\)==='1'/);
});

test('public pages: sign-up and sign-in post to the accounting API',()=>{
 const fs=require('node:fs'),d=__dirname+'/../contabilita/';
 const js=fs.readFileSync(d+'account.js','utf8');assert.match(js,/signup\.start/);assert.match(js,/client\.login/);
 for(const f of ['iscrizione.html','accedi.html'])assert.match(fs.readFileSync(d+f,'utf8'),/\/contabilita\/account\.js/);
 assert.match(fs.readFileSync(d+'index.html','utf8'),/href="\/contabilita\/iscrizione\.html"/);
 // The client app is the accounting page without the RADIX shell, with the same sections.
 const app=fs.readFileSync(d+'app/index.html','utf8'),team=fs.readFileSync(__dirname+'/../accounting/index.html','utf8');
 assert.doesNotMatch(app,/radix-shell/);assert.match(team,/radix-shell\.js/);
 const tabs=h=>[...h.matchAll(/data-tab="([^"]+)"/g)].map(m=>m[1]),scripts=h=>[...h.matchAll(/<script src="([^"]+)"/g)].map(m=>m[1]).filter(x=>!/shell/.test(x));
 assert.deepEqual(tabs(app),tabs(team));assert.deepEqual(scripts(app),scripts(team));
 assert.equal(require('../api/accounting-stripe.js').config.api.bodyParser,false);
});

test('password reset: one-hour link by email, valid once, no account enumeration',async()=>{
 const {hashPassword}=require('../api/_auth');let hash=hashPassword('vecchia-password');const txs=[],mails=[];
 const st={json:async(t,p)=>{if(/'name',u.name,'hash'/.test(t))return p[0]==='mario@alfa.it'?{id:41,name:'Mario Rossi',hash}:null;
   if(/'hash',u.password_hash,'company'/.test(t))return p[0]===41?{hash,company:C}:null;return null;},tx:async q=>{txs.push(q);return [];}};
 const sendMail=async m=>{mails.push(m);};
 const H=createHandler({getSessionUser:()=>null,getClientUser:billing.getClientUser,billing,getStore:()=>st,sendMail});
 const ask=email=>call(H,{body:{action:'client.reset_request',data:{email}},headers:{'x-forwarded-for':'10.0.1.'+mails.length+txs.length}});
 // Unknown address: same answer, no email.
 const none=await ask('nessuno@alfa.it');assert.equal(none.status,200);assert.deepEqual(none.body,{ok:true});assert.equal(mails.length,0);
 const r=await ask('Mario@Alfa.it');assert.equal(r.status,200);assert.equal(mails.length,1);assert.equal(mails[0].to,'mario@alfa.it');
 const link=mails[0].text.match(/https:\/\/radix\.test\/contabilita\/reimposta\.html#t=([A-Za-z0-9_.-]+)/);assert.ok(link,mails[0].text);const token=link[1];
 const set=(tok,password='nuova-password-lunga')=>call(H,{body:{action:'client.reset',data:{token:tok,password}},headers:{'x-forwarded-for':'10.0.2.'+txs.length}});
 assert.equal((await set(token,'corta')).status,400);
 assert.equal((await set(token.slice(0,-2)+'xx')).status,400,'tampered signature');
 const ok=await set(token);assert.equal(ok.status,200,JSON.stringify(ok.body));
 assert.match(ok.headers['Set-Cookie'],/^radix_client=/);
 const q=txs[0].map(x=>x[0]);assert.match(q[0],/password_hash=\$2/);assert.match(q[1],/UPDATE users SET password_hash/);assert.match(q[2],/'?password\.reset'?|acc_audit/);
 assert.ok(require('../api/_auth').verifyPassword('nuova-password-lunga',txs[0][1][1][1]));
 // Once the password changed the same link no longer verifies.
 hash=txs[0][1][1][1];assert.equal((await set(token)).status,400);
 // Expired link.
 const old=billing.resetToken(41,hash,Date.now()-2*60*60*1000);assert.equal((await set(old)).status,400);
 // Without a mail sender the request says so instead of pretending.
 const saved=[process.env.GMAIL_USER,process.env.GMAIL_APP_PASSWORD];delete process.env.GMAIL_USER;delete process.env.GMAIL_APP_PASSWORD;
 const H2=createHandler({getSessionUser:()=>null,getClientUser:billing.getClientUser,billing,getStore:()=>st});
 assert.equal((await call(H2,{body:{action:'client.reset_request',data:{email:'mario@alfa.it'}},headers:{'x-forwarded-for':'10.0.3.1'}})).status,503);
 if(saved[0])process.env.GMAIL_USER=saved[0];if(saved[1])process.env.GMAIL_APP_PASSWORD=saved[1];
 const fs=require('node:fs'),d=__dirname+'/../contabilita/';
 assert.match(fs.readFileSync(d+'accedi.html','utf8'),/href="\/contabilita\/recupero\.html"/);
 for(const f of ['recupero.html','reimposta.html'])assert.match(fs.readFileSync(d+f,'utf8'),/\/contabilita\/account\.js/);
});
