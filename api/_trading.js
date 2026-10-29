'use strict';
/* Personal «Trading» page: the trading system runs on the member's own Mac (trading/ in this repo) and, every hour,
   sends here one snapshot of already computed numbers (backtests, simulated account, data status). RADIX only stores
   the latest snapshot per member and shows it to that member alone: no broker key, no order, no market call here.

   GET  /api/trading                      session cookie → { snapshot, receivedAt } of the signed-in member
   POST /api/trading {action:'token'}     session cookie + x-radix-trading: 1 → a push token for the Mac (replaces older ones)
   POST /api/trading <snapshot>           Authorization: Bearer rtr1.… → stores the snapshot for the token's member

   The push token is HMAC-signed with a key derived from JWT_SECRET (as the Lead import token), lasts one year and
   can only write that member's snapshot. Creating a new token stores its time: tokens issued before it stop working. */
const crypto=require('node:crypto');
const PREFIX='rtr1';
const SCOPE='trading-push';
const TTL_SECONDS=60*60*24*365;
const MAX_BYTES=1500000;

function failure(status,message){const e=new Error(message);e.status=status;return e}
function key(secret){
 if(typeof secret!=='string'||!secret)throw failure(503,'Collegamento trading non configurato su questo ambiente.');
 return crypto.createHmac('sha256',secret).update('radix:trading-push:v1').digest();
}
const signature=(secret,body)=>crypto.createHmac('sha256',key(secret)).update(PREFIX+'.'+body).digest('base64url');
function sign(uid,secret,now=Date.now()){
 if(!Number.isInteger(uid)||uid<1||uid>2147483647)throw failure(400,'Utente non valido.');
 const iat=Math.floor(now/1000),payload={v:1,scope:SCOPE,uid,iat,exp:iat+TTL_SECONDS};
 const body=Buffer.from(JSON.stringify(payload)).toString('base64url');
 return {token:PREFIX+'.'+body+'.'+signature(secret,body),issuedAt:new Date(iat*1000).toISOString(),expiresAt:new Date(payload.exp*1000).toISOString()};
}
function verify(token,secret,now=Date.now()){
 if(typeof token!=='string'||token.length>600)return null;
 const parts=token.split('.');
 if(parts.length!==3||parts[0]!==PREFIX||!/^[A-Za-z0-9_-]+$/.test(parts[1])||!/^[A-Za-z0-9_-]+$/.test(parts[2]))return null;
 const expected=Buffer.from(signature(secret,parts[1])),given=Buffer.from(parts[2]);
 if(expected.length!==given.length||!crypto.timingSafeEqual(expected,given))return null;
 let p;try{p=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'))}catch{return null}
 if(!p||p.v!==1||p.scope!==SCOPE||!Number.isInteger(p.uid)||p.uid<1||!Number.isInteger(p.exp)||!Number.isInteger(p.iat))return null;
 const t=Math.floor(now/1000);
 if(p.exp<=t||p.iat>t+300||p.exp-p.iat>TTL_SECONDS)return null;
 return p;
}
function bearer(req){
 const h=req.headers?.authorization;
 if(typeof h!=='string'||!/^Bearer rtr1\./.test(h))return undefined;
 return h.slice(7).trim();
}

// The snapshot is the Mac's own numbers: only its shape and size are checked, the page shows every text as text.
function parseSnapshot(raw){
 let body=raw;
 if(Buffer.isBuffer(body))body=body.toString('utf8');
 if(typeof body==='string'){if(Buffer.byteLength(body)>MAX_BYTES)throw failure(413,'Fotografia troppo grande.');try{body=JSON.parse(body)}catch{throw failure(400,'JSON non valido.')}}
 if(!body||typeof body!=='object'||Array.isArray(body))throw failure(400,'Fotografia non valida.');
 if(body.versione!==1)throw failure(400,'Versione della fotografia non supportata: aggiorna il programma sul Mac.');
 if(body.modalita!=='paper')throw failure(400,'Il pannello accetta solo risultati di prova (paper).');
 const text=JSON.stringify(body);
 if(Buffer.byteLength(text)>MAX_BYTES)throw failure(413,'Fotografia troppo grande.');
 return text;
}

function store(db){
 return {
  async latest(uid){
   const rows=await db`SELECT snapshot,received_at,token_issued_at FROM rx_trading_snapshots WHERE user_id=${uid}`;
   return rows[0]||null;
  },
  async save(uid,text){
   await db`UPDATE rx_trading_snapshots SET snapshot=${text}::jsonb,received_at=now() WHERE user_id=${uid}`;
  },
  async issued(uid,at){
   await db`INSERT INTO rx_trading_snapshots(user_id,token_issued_at) VALUES(${uid},${at})
    ON CONFLICT (user_id) DO UPDATE SET token_issued_at=EXCLUDED.token_issued_at`;
  }
 };
}

function createHandler({getSql=()=>require('./_db').sql(),getSessionUser=req=>require('./_auth').getSessionUser(req),env=process.env,now=()=>Date.now()}={}){
 return async function trading(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
   const token=bearer(req);
   if(token!==undefined){
    if(req.method!=='POST'){res.setHeader('Allow','POST');throw failure(405,'Metodo non consentito.')}
    const claims=verify(token,env.JWT_SECRET,now());
    if(!claims)throw failure(401,'Token del Mac scaduto o non valido: generane uno nuovo nella pagina Trading.');
    const s=store(getSql());
    const row=await s.latest(claims.uid);
    // Only the newest token works: one created later on the page replaces this one.
    if(!row||!row.token_issued_at||Math.floor(new Date(row.token_issued_at).getTime()/1000)!==claims.iat)throw failure(401,'Questo token è stato sostituito da uno più recente: aggiorna ~/RadixTrading/.env.');
    await s.save(claims.uid,parseSnapshot(req.body));
    return res.status(200).json({ok:true});
   }
   let user;try{user=getSessionUser(req)}catch{user=null}
   if(!user||!Number.isInteger(user.uid))throw failure(401,'Accedi a RADIX per vedere questa pagina.');
   const s=store(getSql());
   if(req.method==='GET'){
    const row=await s.latest(user.uid);
    return res.status(200).json({ok:true,snapshot:row?.snapshot||null,receivedAt:row?.received_at||null,linked:!!row?.token_issued_at});
   }
   if(req.method!=='POST'){res.setHeader('Allow','GET, POST');throw failure(405,'Metodo non consentito.')}
   if(req.headers['x-radix-trading']!=='1')throw failure(403,'Richiesta non consentita.');
   let body=req.body;if(typeof body==='string'){try{body=JSON.parse(body)}catch{body=null}}
   if(!body||body.action!=='token')throw failure(400,'Azione non riconosciuta.');
   const issued=sign(user.uid,env.JWT_SECRET,now());
   await s.issued(user.uid,issued.issuedAt);
   return res.status(200).json({ok:true,...issued});
  }catch(e){
   const status=e.status||500;
   if(status===500)console.error('trading failed',e&&e.code);
   return res.status(status).json({error:status===500?'Errore del pannello Trading.':e.message});
  }
 };
}
module.exports=createHandler();
module.exports.createHandler=createHandler;
module.exports.sign=sign;
module.exports.verify=verify;
module.exports.parseSnapshot=parseSnapshot;
