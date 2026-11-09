'use strict';
// Import token for the «Importa in RADIX» Chrome extension.
//
// The extension cannot rely on the radix_session cookie (SameSite=Lax, and
// browsers keep tightening cookies on requests that do not come from the site
// itself), so a signed-in member creates a link code in Lead Intelligence.
// The token is HMAC-signed with a key derived from JWT_SECRET (never the raw
// session key, so a session cookie is never a valid import token and vice
// versa), expires after 14 days and only allows one thing: creating a
// lead_contact_jobs record in the workspace it names. No table or column is
// needed: membership is still checked on every request, so removing the
// member from the workspace revokes the token immediately.
const crypto=require('node:crypto');
const leadContactJobs=require('./_lead_contact_jobs');
const PREFIX='rli1';
const SCOPE='lead-import';
const TTL_SECONDS=60*60*24*14;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function failure(status,message){const e=new Error(message);e.status=status;return e}
function key(secret){
 if(typeof secret!=='string'||!secret)throw failure(503,'Collegamento estensione non configurato su questo ambiente.');
 return crypto.createHmac('sha256',secret).update('radix:lead-import:v1').digest();
}
const signature=(secret,body)=>crypto.createHmac('sha256',key(secret)).update(PREFIX+'.'+body).digest('base64url');
function sign({uid,workspace},secret,now=Date.now()){
 if(!Number.isInteger(uid)||uid<1||uid>2147483647||!UUID.test(workspace||''))throw failure(400,'Utente o workspace non validi.');
 const iat=Math.floor(now/1000),payload={v:1,scope:SCOPE,uid,ws:workspace.toLowerCase(),iat,exp:iat+TTL_SECONDS};
 const body=Buffer.from(JSON.stringify(payload)).toString('base64url');
 return {token:PREFIX+'.'+body+'.'+signature(secret,body),expiresAt:new Date(payload.exp*1000).toISOString(),workspace:payload.ws};
}
function verify(token,secret,now=Date.now()){
 if(typeof token!=='string'||token.length>600)return null;
 const parts=token.split('.');
 if(parts.length!==3||parts[0]!==PREFIX||!/^[A-Za-z0-9_-]+$/.test(parts[1])||!/^[A-Za-z0-9_-]+$/.test(parts[2]))return null;
 const expected=Buffer.from(signature(secret,parts[1])),given=Buffer.from(parts[2]);
 if(expected.length!==given.length||!crypto.timingSafeEqual(expected,given))return null;
 let p;try{p=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'))}catch{return null}
 if(!p||p.v!==1||p.scope!==SCOPE||!Number.isInteger(p.uid)||p.uid<1||!UUID.test(p.ws||'')||!Number.isInteger(p.exp)||!Number.isInteger(p.iat))return null;
 const t=Math.floor(now/1000);
 if(p.exp<=t||p.iat>t+300||p.exp-p.iat>TTL_SECONDS)return null;
 return p;
}
// Only an Authorization header beginning with this prefix selects the import
// path; every other request keeps the cookie session rules untouched.
function bearer(req){
 const h=req.headers?.authorization;
 if(typeof h!=='string'||!/^Bearer rli1\./.test(h))return undefined;
 return h.slice(7).trim();
}
async function handle(req,res,{getStore,secret}){
 const claims=verify(bearer(req),secret);
 if(!claims)throw failure(401,'Collegamento estensione scaduto o non valido: genera un nuovo codice in Lead Intelligence.');
 const store=getStore();
 const membership=async()=>{
  const m=await store.leadLists.membership(claims.ws,claims.uid);
  if(!m||!['owner','admin','member'].includes(m.role))throw failure(403,'Il tuo account non può più importare contatti in questo workspace.');
  return m;
 };
 if(req.method==='GET'){
  const q=req.query||{};
  if(Object.keys(q).length!==1||q.entity!=='lead_import_check')throw failure(400,'Con il collegamento estensione è disponibile solo la verifica.');
  const m=await membership();
  return res.status(200).json({ok:true,workspace:claims.ws,role:m.role,expiresAt:new Date(claims.exp*1000).toISOString()});
 }
 if(req.method!=='POST'){res.setHeader('Allow','GET, POST');throw failure(405,'Metodo non consentito.')}
 if(req.headers['x-radix-sales']!=='1'||!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw failure(403,'Richiesta non consentita.');
 let body=req.body;
 if(typeof body==='string'){if(Buffer.byteLength(body)>4000000)throw failure(413,'Richiesta troppo grande.');try{body=JSON.parse(body)}catch{throw failure(400,'JSON non valido.')}}
 if(Buffer.byteLength(JSON.stringify(body)||'')>4000000)throw failure(413,'Richiesta troppo grande.');
 if(!body||body.entity!=='lead_contact_jobs'||body.action!=='create')throw failure(403,'Il collegamento estensione può solo importare nuovi contatti.');
 if(String(body.workspace||'').toLowerCase()!==claims.ws)throw failure(403,'Workspace diverso da quello collegato.');
 const c=leadContactJobs.command(body);
 await membership();
 return res.status(200).json({rows:[await store.leadContactJobs.command(c,claims.uid)]});
}
module.exports={sign,verify,bearer,handle,PREFIX,SCOPE,TTL_SECONDS};
