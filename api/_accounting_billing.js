'use strict';
// RADIX Accounting — public sign-up, client session and Stripe subscription (migrations/accounting/002).
// Client accounts get their own cookie signed with a key derived from JWT_SECRET, so a client token is never valid
// as a team session (radix_session) and the rest of RADIX stays closed to them. Stripe is called over its REST API
// (STRIPE_SECRET_KEY, test mode on the Preview); without the key sign-up answers 503 and nothing is created.
const crypto=require('node:crypto');
const {randomUUID}=crypto;
const coa=require('../lib/accounting/chart-of-accounts');
const pricing=require('../lib/accounting/pricing');
const {hashPassword,verifyPassword,parseCookies}=require('./_auth');

class BillingError extends Error{constructor(status,message){super(message);this.status=status;}}
const fail=(s,m)=>{throw new BillingError(s,m);};
const q=(t,p)=>[t,p||[]];
const ACTIVE=['active','trialing'];

// ---------- client session ----------
const CLIENT_COOKIE='radix_client',MAX_AGE=60*60*24*30;
const clientKey=()=>{const s=process.env.JWT_SECRET;if(!s)throw new Error('JWT_SECRET is not set in the environment.');return crypto.createHmac('sha256',s).update('radix-accounting-client').digest();};
function signClient(uid){const body=Buffer.from(JSON.stringify({uid,kind:'client',exp:Math.floor(Date.now()/1000)+MAX_AGE})).toString('base64url');
 return body+'.'+crypto.createHmac('sha256',clientKey()).update(body).digest('base64url');}
function verifyClient(token){
 try{if(typeof token!=='string'||!token.includes('.'))return null;const [body,sig]=token.split('.');
  const want=Buffer.from(crypto.createHmac('sha256',clientKey()).update(body).digest('base64url')),got=Buffer.from(sig||'');
  if(want.length!==got.length||!crypto.timingSafeEqual(want,got))return null;
  const p=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));
  if(p.kind!=='client'||!Number.isInteger(p.uid)||p.uid<1||!(p.exp>Date.now()/1000))return null;return {uid:p.uid,client:true};}catch{return null;}
}
const getClientUser=req=>verifyClient(parseCookies(req)[CLIENT_COOKIE]);
const cookie=token=>[CLIENT_COOKIE+'='+encodeURIComponent(token),'Path=/','HttpOnly','SameSite=Lax','Max-Age='+MAX_AGE].concat(process.env.VERCEL?['Secure']:[]).join('; ');
const clearCookie=()=>CLIENT_COOKIE+'=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';

// ---------- Stripe ----------
function form(o,prefix,out=[]){for(const [k,v] of Object.entries(o)){if(v===undefined||v===null)continue;const key=prefix?prefix+'['+k+']':k;
 if(typeof v==='object')form(v,key,out);else out.push(encodeURIComponent(key)+'='+encodeURIComponent(String(v)));}return out.join('&');}
async function stripe(path,params,{fetchImpl=globalThis.fetch}={}){
 const key=process.env.STRIPE_SECRET_KEY;if(!key)fail(503,'I pagamenti non sono ancora configurati su questo ambiente.');
 const r=await fetchImpl((process.env.STRIPE_API_BASE||'https://api.stripe.com')+'/v1/'+path,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':randomUUID()},body:form(params)});
 const j=await r.json().catch(()=>({}));
 if(!r.ok){console.error('accounting stripe',r.status,j&&j.error&&j.error.type);fail(502,'Il servizio di pagamento non risponde: riprova tra poco.');}
 return j;
}
// The price includes 22 % VAT on the 39 € (STRIPE_PRICE_ID, when set, replaces it with a price defined in Stripe).
const GROSS=Math.round(pricing.PRICE_CENTS*(100+pricing.VAT_RATE)/100);
const grossOf=net=>Math.round(net*(100+pricing.VAT_RATE)/100);
// The fee follows the size pack: base 39 € plus the pack's extra (STRIPE_PRICE_ID only replaces the base pack).
function checkoutParams({companyId,email,origin,priceCents=pricing.PRICE_CENTS,size='base'}){
 const label=pricing.SIZES[size]?pricing.SIZES[size].label:'Base';
 const line=process.env.STRIPE_PRICE_ID&&priceCents===pricing.PRICE_CENTS?{price:process.env.STRIPE_PRICE_ID,quantity:1}
  :{quantity:1,price_data:{currency:'eur',unit_amount:grossOf(priceCents),recurring:{interval:'month'},product_data:{name:'RADIX Contabilità · '+label,description:(priceCents/100)+' € al mese + IVA '+pricing.VAT_RATE+'%, studio commercialista compreso'}}};
 return {mode:'subscription',locale:'it',customer_email:email||undefined,client_reference_id:companyId,line_items:[line],
  metadata:{company_id:companyId},subscription_data:{metadata:{company_id:companyId}},
  success_url:origin+'/contabilita/app/?pagamento=ok',cancel_url:origin+'/contabilita/iscrizione.html?pagamento=annullato'};
}
// Stripe-Signature: t=<time>,v1=<hmac of "t.body"> with the endpoint secret; 5 minutes of tolerance.
function verifyWebhook(raw,header,secret,now=Date.now()){
 if(!secret||typeof header!=='string')return false;
 const parts=Object.create(null),v1=[];for(const kv of header.split(',')){const i=kv.indexOf('=');const k=kv.slice(0,i).trim(),v=kv.slice(i+1).trim();if(k==='v1')v1.push(v);else parts[k]=v;}
 const t=Number(parts.t);if(!Number.isInteger(t)||Math.abs(now/1000-t)>300||!v1.length)return false;
 const want=Buffer.from(crypto.createHmac('sha256',secret).update(t+'.').update(raw).digest('hex'));
 return v1.some(s=>{const b=Buffer.from(s);return b.length===want.length&&crypto.timingSafeEqual(b,want);});
}
const STATUS={active:'active',trialing:'trialing',past_due:'past_due',unpaid:'unpaid',canceled:'canceled',incomplete:'incomplete',incomplete_expired:'canceled',paused:'past_due'};

// ---------- origin and limits ----------
function originOf(req){
 if(process.env.ACCOUNTING_PUBLIC_URL)return process.env.ACCOUNTING_PUBLIC_URL.replace(/\/+$/,'');
 const host=String(req.headers['x-forwarded-host']||req.headers.host||'').split(',')[0].trim();
 if(!/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host))fail(400,'Richiesta non valida.');
 return (/^(localhost|127\.0\.0\.1)(:|$)/.test(host)?'http':'https')+'://'+host;
}
// Per-instance allowance against scripted sign-ups and password guessing.
// Version of /contabilita/condizioni.html and privacy.html the client accepts at sign-up; bump it with the texts.
const TERMS_VERSION='2026-10-18';
const clientIp=req=>String(req.headers['x-forwarded-for']||'').split(',')[0].trim()||null;
const HITS=new Map();
function limit(req,kind,max){const ip=clientIp(req)||'?',k=kind+':'+ip+':'+new Date().toISOString().slice(0,13),n=(HITS.get(k)||0)+1;
 if(HITS.size>10000)HITS.clear();HITS.set(k,n);if(n>max)fail(429,'Troppi tentativi: riprova tra un\'ora.');}
const str=(v,max,msg)=>{if(typeof v!=='string'||!v.trim()||v.length>max||/[\u0000-\u001f\u007f]/.test(v))fail(400,msg);return v.trim();};

// ---------- public actions ----------
async function signup(store,req,res,d,deps){
 limit(req,'signup',5);
 const email=str(d.email,254,'Email non valida.').toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'Email non valida.');
 const name=str(d.name,120,'Indica nome e cognome.');
 if(typeof d.password!=='string'||d.password.length<10||d.password.length>200)fail(400,'La password deve avere almeno 10 caratteri.');
 if(d.accept!==true)fail(400,'Per continuare accetta le condizioni del servizio.');
 if(d.accept_clauses!==true)fail(400,'Per continuare approva le clausole indicate all\'articolo 14 delle condizioni.');
 const company=deps.companyData(d.company||{},false);
 const size=d.size===undefined?'base':d.size;if(!pricing.SIZE_KEYS.includes(size))fail(400,'Pacchetto non valido.');const priceCents=pricing.priceOf(size);
 if(!process.env.STRIPE_SECRET_KEY)fail(503,'I pagamenti non sono ancora configurati su questo ambiente.');
 if(await store.json('SELECT to_jsonb(true) AS v FROM users WHERE lower(email)=$1',[email]))fail(409,'Esiste già un account con questa email: accedi.');
 const uid=await store.json("SELECT to_jsonb(nextval(pg_get_serial_sequence('users','id'))) AS v");
 const id=randomUUID();
 const accounts=coa.STANDARD.map(a=>({code:a.code,name:a.name,kind:a.kind,grp:a.group,keywords:a.keywords,system:Object.values(coa.SYSTEM).includes(a.code)}));
 await store.tx([
  q('INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)',[uid,email,name,hashPassword(d.password)]),
  q("INSERT INTO acc_companies(id,name,vat,tax_code,legal_form,regime,vat_periodicity,plan,size,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,'professionista',$8,$9)",[id,company.name,company.vat??null,company.tax_code??null,company.legal_form||'srl',company.regime||'ordinario',company.vat_periodicity||'quarterly',size,uid]),
  q("INSERT INTO acc_memberships(company_id,user_id,role) VALUES($1,$2,'owner')",[id,uid]),
  q('INSERT INTO acc_accounts(company_id,code,name,kind,grp,keywords,system) SELECT $1,x.code,x.name,x.kind,x.grp,x.keywords,x.system FROM jsonb_to_recordset($2::jsonb) AS x(code text,name text,kind text,grp text,keywords text,system boolean)',[id,JSON.stringify(accounts)]),
  q('INSERT INTO acc_client_accounts(user_id,company_id) VALUES($1,$2)',[uid,id]),
  q('INSERT INTO acc_subscriptions(company_id,price_cents) VALUES($1,$2)',[id,priceCents]),
  q('INSERT INTO acc_audit(company_id,actor_id,action,entity_id,detail) VALUES($1,$2,$3,$1,$4::jsonb)',[id,uid,'signup',JSON.stringify({name:company.name,size,terms_version:TERMS_VERSION,accepted:['condizioni','privacy','art_1341_1342'],ip:clientIp(req)})])]);
 res.setHeader('Set-Cookie',cookie(signClient(uid)));
 return {company:id,url:await openCheckout(store,{companyId:id,email,priceCents,size},req,deps)};
}
async function checkout(store,uid,req,deps){
 const a=await store.json("SELECT jsonb_build_object('company',c.company_id,'email',u.email,'status',s.status,'price_cents',s.price_cents,'size',co.size) AS v FROM acc_client_accounts c JOIN users u ON u.id=c.user_id JOIN acc_subscriptions s ON s.company_id=c.company_id JOIN acc_companies co ON co.id=c.company_id WHERE c.user_id=$1",[uid]);
 if(!a)fail(403,'Questo account non ha un abbonamento.');
 if(ACTIVE.includes(a.status))fail(409,'L\'abbonamento è già attivo.');
 return openCheckout(store,{companyId:a.company,email:a.email,priceCents:a.price_cents,size:a.size},req,deps);
}
async function openCheckout(store,{companyId,email,priceCents,size},req,deps){
 const s=await stripe('checkout/sessions',checkoutParams({companyId,email,priceCents,size,origin:originOf(req)}),deps);
 await store.tx([q('UPDATE acc_subscriptions SET checkout_session=$2,updated_at=now() WHERE company_id=$1',[companyId,s.id])]);
 return s.url;
}
async function login(store,req,res,d){
 limit(req,'login',20);
 const email=str(d.email,254,'Email o password errati.').toLowerCase();if(typeof d.password!=='string'||d.password.length>200)fail(400,'Email o password errati.');
 const u=await store.json('SELECT jsonb_build_object(\'id\',u.id,\'hash\',u.password_hash) AS v FROM users u JOIN acc_client_accounts c ON c.user_id=u.id WHERE lower(u.email)=$1',[email]);
 if(!u||!verifyPassword(d.password,u.hash))fail(401,'Email o password errati.');
 res.setHeader('Set-Cookie',cookie(signClient(u.id)));return {ok:true};
}
// What a signed-in client account may do: everything on its own company once the subscription is active.
async function account(store,uid){
 return store.json("SELECT jsonb_build_object('kind','client','company',c.company_id,'name',u.name,'email',u.email,'status',s.status,'price_cents',s.price_cents,'current_period_end',s.current_period_end) AS v FROM acc_client_accounts c JOIN users u ON u.id=c.user_id LEFT JOIN acc_subscriptions s ON s.company_id=c.company_id WHERE c.user_id=$1",[uid]);
}

// ---------- webhook ----------
async function rawBody(req){if(Buffer.isBuffer(req.rawBody))return req.rawBody;const chunks=[];let n=0;for await(const c of req){n+=c.length;if(n>1e6)fail(413,'Richiesta troppo grande.');chunks.push(Buffer.from(c));}return Buffer.concat(chunks);}
async function webhook(store,req,res){
 if(req.method!=='POST'){res.setHeader('Allow','POST');fail(405,'Metodo non consentito.');}
 const raw=await rawBody(req);
 if(!verifyWebhook(raw,req.headers['stripe-signature'],process.env.STRIPE_WEBHOOK_SECRET))fail(400,'Firma non valida.');
 const ev=JSON.parse(raw.toString('utf8')),o=ev.data&&ev.data.object||{};
 let company=null,update=null;
 if(ev.type==='checkout.session.completed'){
  company=o.client_reference_id||o.metadata&&o.metadata.company_id;
  update=q("UPDATE acc_subscriptions SET stripe_customer=$2,stripe_subscription=coalesce($3,stripe_subscription),status=CASE WHEN $4 AND (status_at IS NULL OR status_at<=$5) THEN 'active' ELSE status END,status_at=CASE WHEN $4 AND (status_at IS NULL OR status_at<=$5) THEN $5 ELSE status_at END,updated_at=now() WHERE company_id=$1::uuid",
   [company,o.customer||null,o.subscription||null,o.payment_status==='paid',ev.created]);
 }else if(/^customer\.subscription\.(created|updated|deleted)$/.test(ev.type)){
  company=o.metadata&&o.metadata.company_id;const st=ev.type.endsWith('deleted')?'canceled':STATUS[o.status]||'past_due';
  const end=o.current_period_end||o.items&&o.items.data&&o.items.data[0]&&o.items.data[0].current_period_end;
  update=q('UPDATE acc_subscriptions SET status=$2,stripe_subscription=$3,stripe_customer=coalesce($4,stripe_customer),current_period_end=$5,status_at=$6,updated_at=now() WHERE company_id=$1::uuid AND (status_at IS NULL OR status_at<=$6)',
   [company,st,o.id,o.customer||null,end?new Date(end*1000).toISOString():null,ev.created]);
 }
 if(company&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(company))company=null;
 if(typeof ev.id!=='string'||!/^evt_\w{1,250}$/.test(ev.id)||!Number.isInteger(ev.created))fail(400,'Evento non valido.');
 await store.tx([q('INSERT INTO acc_billing_events(id,type,company_id,created) VALUES($1,$2,(SELECT company_id FROM acc_subscriptions WHERE company_id=$3::uuid),$4) ON CONFLICT(id) DO NOTHING',[ev.id,String(ev.type).slice(0,100),company,ev.created]),
  ...(company&&update?[update]:[])]);
 return {received:true};
}

module.exports={getClientUser,signClient,verifyClient,clearCookie,signup,checkout,login,account,webhook,verifyWebhook,checkoutParams,form,BillingError,ACTIVE,GROSS,TERMS_VERSION};
