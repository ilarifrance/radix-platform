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
const signupBody={action:'signup.start',data:{name:'Mario Rossi',email:'Mario@Alfa.it',password:'una-password-lunga',accept:true,company:{name:'Alfa Srl',vat:'01234567890',regime:'ordinario',vat_periodicity:'quarterly'}}};

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
