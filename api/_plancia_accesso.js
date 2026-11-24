/* Plancia on its own domain and server — accounts of the offices (the drivers enter with the code of the office,
   see _trasporti_sync.js). POST /api/accesso {action, data}:
     entra    {email, password}                          → session cookie
     attiva   {company, name, email, password, code}     → new account + its company (owner). `code` is an activation
                                                           code given by Plancia: env PLANCIA_CODICI, separated by commas
     io       {}                                         → {user, company} or 401
     esci     {}                                         → clears the cookie
     password {current, password}                        → changes the password of the signed-in user
   Same session cookie and password hashing as api/_auth.js (JWT_SECRET). Tables: users (migrations/trasporti/000),
   tr_companies, tr_members, tr_records. */
'use strict';
const crypto=require('crypto');
const auth=require('./_auth');
function failure(status,message){const e=new Error(message);e.status=status;return e;}
const EMAIL=/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

const defaultDb={
 async userByEmail(email){const {sql}=require('./_db');return (await sql()`SELECT id,email,name,password_hash FROM users WHERE email=${email} LIMIT 1`)[0]||null;},
 async userById(id){const {sql}=require('./_db');return (await sql()`SELECT id,email,name,password_hash FROM users WHERE id=${id} LIMIT 1`)[0]||null;},
 async companyOf(uid){const {sql}=require('./_db');return (await sql()`SELECT c.id,c.name,m.role FROM tr_members m JOIN tr_companies c ON c.id=m.company_id WHERE m.user_id=${uid} LIMIT 1`)[0]||null;},
 async setPassword(id,hash){const {sql}=require('./_db');await sql()`UPDATE users SET password_hash=${hash} WHERE id=${id}`;},
 // user, company, membership and the first record of the company, all or nothing
 async activate({email,name,hash,company,code}){
  const {sql}=require('./_db');const id=crypto.randomUUID();
  const r=await sql()`WITH u AS (INSERT INTO users(email,name,password_hash) VALUES(${email},${name},${hash}) ON CONFLICT(email) DO NOTHING RETURNING id),
   c AS (INSERT INTO tr_companies(id,name,created_by) SELECT ${id}::uuid,${company},id FROM u RETURNING id),
   m AS (INSERT INTO tr_members(company_id,user_id,role) SELECT c.id,u.id,'owner' FROM c,u),
   r AS (INSERT INTO tr_records(company_id,coll,id,data,updated_by) SELECT c.id,'one','company',${JSON.stringify({name:company,_seeded:true})}::jsonb,u.id FROM c,u),
   a AS (INSERT INTO tr_audit(company_id,actor_id,action,detail) SELECT c.id,u.id,'azienda.attivata',${JSON.stringify({code})}::jsonb FROM c,u)
   SELECT u.id FROM u`;
  return r[0]?{id:r[0].id,company_id:id}:null;
 }
};

function createHandler({db=defaultDb,now=()=>Date.now(),codes=()=>String(process.env.PLANCIA_CODICI||'').split(',').map(s=>s.trim().toUpperCase()).filter(Boolean)}={}){
 const tries=new Map();
 const limit=(key,max)=>{const t=now(),l=(tries.get(key)||[]).filter(x=>t-x<600000);if(l.length>=max)throw failure(429,'Troppi tentativi: riprova tra dieci minuti.');l.push(t);tries.set(key,l);if(tries.size>5000)tries.clear();};
 const session=(res,u)=>res.setHeader('Set-Cookie',auth.buildSessionCookie(auth.signSessionToken({uid:u.id,email:u.email,name:u.name})));
 return async function(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
   if(req.method!=='POST')throw failure(405,'Metodo non consentito.');
   if(req.headers['x-radix-trasporti']!=='1'||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')||req.headers['sec-fetch-site']==='cross-site')throw failure(403,'Richiesta non consentita.');
   let body=req.body;if(typeof body==='string'){try{body=JSON.parse(body);}catch{throw failure(400,'JSON non valido.');}}
   if(!body||typeof body!=='object'||Array.isArray(body))throw failure(400,'Richiesta non valida.');
   const d=body.data&&typeof body.data==='object'?body.data:{};
   const ip=String(req.headers['x-forwarded-for']||'').split(',')[0].trim()||'?';
   const email=String(d.email||'').trim().toLowerCase();
   if(body.action==='esci'){res.setHeader('Set-Cookie',auth.buildClearCookie());return res.status(200).json({ok:true});}
   if(!process.env.DATABASE_URL&&db===defaultDb)throw failure(503,'L\'accesso non è attivo su questo ambiente.');
   if(body.action==='entra'){
    limit('e:'+ip,20);
    if(!email||typeof d.password!=='string'||!d.password)throw failure(400,'Scrivi email e password.');
    limit('u:'+email,10);
    const u=await db.userByEmail(email);
    if(!u||!auth.verifyPassword(d.password,u.password_hash))throw failure(401,'Email o password non corretti.');
    session(res,u);const c=await db.companyOf(u.id);
    return res.status(200).json({ok:true,user:{name:u.name,email:u.email},company:c?c.name:null});
   }
   if(body.action==='attiva'){
    limit('a:'+ip,8);
    const code=String(d.code||'').trim().toUpperCase(),list=codes();
    if(!list.length)throw failure(503,'Le attivazioni non sono aperte su questo ambiente.');
    if(!code||!list.includes(code))throw failure(403,'Codice di attivazione non valido: è quello che ti ha dato Plancia.');
    const company=String(d.company||'').trim().slice(0,200),name=String(d.name||'').trim().slice(0,120);
    if(!company)throw failure(400,'Scrivi il nome dell\'azienda.');
    if(!name)throw failure(400,'Scrivi il tuo nome.');
    if(!EMAIL.test(email)||email.length>254)throw failure(400,'Email non valida.');
    if(typeof d.password!=='string'||d.password.length<8||d.password.length>200)throw failure(400,'La password deve avere almeno 8 caratteri.');
    const made=await db.activate({email,name,hash:auth.hashPassword(d.password),company,code});
    if(!made)throw failure(409,'Questa email ha già un account: entra con la tua password.');
    session(res,{id:made.id,email,name});
    return res.status(200).json({ok:true,user:{name,email},company});
   }
   const s=auth.getSessionUser(req);
   if(!s||s.uid==null)throw failure(401,'Non hai fatto l\'accesso.');
   if(body.action==='io'){const c=await db.companyOf(s.uid);return res.status(200).json({user:{name:s.name,email:s.email},company:c?c.name:null,role:c?c.role:null});}
   if(body.action==='password'){
    limit('p:'+s.uid,10);
    if(typeof d.password!=='string'||d.password.length<8||d.password.length>200)throw failure(400,'La nuova password deve avere almeno 8 caratteri.');
    const u=await db.userById(s.uid);
    if(!u||!auth.verifyPassword(String(d.current||''),u.password_hash))throw failure(400,'La password attuale non è corretta.');
    await db.setPassword(u.id,auth.hashPassword(d.password));
    return res.status(200).json({ok:true});
   }
   throw failure(400,'Azione non riconosciuta.');
  }catch(e){
   if(!e.status)console.error('plancia accesso',e&&e.message);
   return res.status(e.status||500).json({error:e.status?e.message:'Il server non risponde: riprova tra poco.'});
  }
 };
}
let handler=null;
module.exports=function(req,res){handler=handler||createHandler();return handler(req,res);};
module.exports.createHandler=createHandler;
