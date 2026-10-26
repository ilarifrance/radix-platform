'use strict';
/* Microsoft 365 sending mailboxes (migration sales 019): sign-in with OAuth 2.0 (authorization code) and email sent through
   Microsoft Graph «sendMail» (delegated Mail.Send). Graph does not depend on SMTP AUTH, which many organisations switch off.
   Env: MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT_ID (optional: the organisation's tenant id; default «organizations»),
   MS_REDIRECT_URI (optional, default <site>/api/ms-oauth). The refresh token is encrypted before it reaches the database
   (api/_mailbox_crypto.js) and, like the client secret, never logged, returned or put in an error message.
   The state of the sign-in is signed with a key of its own (HMAC of JWT_SECRET) and expires after 10 minutes. */
const crypto=require('node:crypto');
const mcrypto=require('./_mailbox_crypto');
const SCOPE='offline_access https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read';
const STATE_TTL=10*60e3;
const configured=env=>!!(env&&env.MS_CLIENT_ID&&env.MS_CLIENT_SECRET);
const tenantOf=env=>/^[0-9a-f-]{36}$/i.test(String(env.MS_TENANT_ID||''))||/^[a-z0-9.-]+\.[a-z]+$/i.test(String(env.MS_TENANT_ID||''))?String(env.MS_TENANT_ID):'organizations';
const redirectOf=(env,origin)=>String(env.MS_REDIRECT_URI||'')||String(origin||'').replace(/\/$/,'')+'/api/ms-oauth';
const key=secret=>{if(typeof secret!=='string'||secret.length<16)throw new Error('JWT_SECRET is not set in the environment.');return crypto.createHmac('sha256',secret).update('radix-ms-oauth-state-v1').digest()};
function signState(secret,payload,now=Date.now()){
 const body=Buffer.from(JSON.stringify({...payload,exp:now+STATE_TTL})).toString('base64url');
 return body+'.'+crypto.createHmac('sha256',key(secret)).update(body).digest('base64url');
}
function verifyState(secret,state,now=Date.now()){
 if(typeof state!=='string'||state.length>2000)return null;
 const [body,mac,extra]=state.split('.');if(!body||!mac||extra!==undefined)return null;
 const want=Buffer.from(crypto.createHmac('sha256',key(secret)).update(body).digest('base64url')),got=Buffer.from(mac);
 if(want.length!==got.length||!crypto.timingSafeEqual(want,got))return null;
 let p;try{p=JSON.parse(Buffer.from(body,'base64url').toString('utf8'))}catch{return null}
 return p&&typeof p==='object'&&Number.isFinite(p.exp)&&p.exp>now?p:null;
}
function authorizeUrl(env,{redirectUri,state,loginHint}){
 const q=new URLSearchParams({client_id:env.MS_CLIENT_ID,response_type:'code',redirect_uri:redirectUri,response_mode:'query',scope:SCOPE,state,prompt:'select_account'});
 if(loginHint)q.set('login_hint',loginHint);
 return 'https://login.microsoftonline.com/'+encodeURIComponent(tenantOf(env))+'/oauth2/v2.0/authorize?'+q.toString();
}
class MsError extends Error{constructor(message,code,status){super(message);this.code=code;if(status&&status<500)this.responseCode=status}}
const clean=(s,env)=>{let m=String(s||'').replace(/\s+/g,' ').trim();for(const v of [env&&env.MS_CLIENT_SECRET])if(v)m=m.split(v).join('•••');return m.slice(0,300)};
async function token(env,params,fetchImpl=fetch){
 const body=new URLSearchParams({client_id:env.MS_CLIENT_ID,client_secret:env.MS_CLIENT_SECRET,scope:SCOPE,...params});
 let r;try{r=await fetchImpl('https://login.microsoftonline.com/'+encodeURIComponent(tenantOf(env))+'/oauth2/v2.0/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body})}
 catch{throw new MsError('Microsoft non raggiungibile in questo momento.','EMSNET')}
 const j=await r.json().catch(()=>({}));
 if(!r.ok||!j.access_token){
  const auth=['invalid_grant','invalid_client','interaction_required','unauthorized_client'].includes(j.error);
  throw new MsError('Accesso Microsoft rifiutato: '+clean(j.error_description||j.error||('HTTP '+r.status),env),auth?'EAUTH':'EMS',r.status);
 }
 return {access_token:j.access_token,refresh_token:j.refresh_token||null,expires_in:Number(j.expires_in)||3600};
}
const exchangeCode=(env,{code,redirectUri},f)=>token(env,{grant_type:'authorization_code',code,redirect_uri:redirectUri},f);
const refresh=(env,refreshToken,f)=>token(env,{grant_type:'refresh_token',refresh_token:refreshToken},f);
// The signed-in account: its address is the sender of every email.
async function me(accessToken,fetchImpl=fetch){
 const r=await fetchImpl('https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName',{headers:{Authorization:'Bearer '+accessToken}}).catch(()=>null);
 if(!r||!r.ok)throw new MsError('Non riesco a leggere l’account Microsoft collegato.','EMS',r&&r.status);
 const j=await r.json().catch(()=>({})),address=String(j.mail||j.userPrincipalName||'').trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))throw new MsError('L’account Microsoft non ha un indirizzo email utilizzabile.','EMS');
 return {address,name:String(j.displayName||'').slice(0,80)};
}
// One email from the signed-in mailbox. List-Unsubscribe goes as header; if Graph refuses the headers, once without them.
async function sendMail(accessToken,{to,subject,text,unsubscribe},fetchImpl=fetch){
 const message={subject,body:{contentType:'Text',content:text},toRecipients:[{emailAddress:{address:to}}]};
 const attempt=withHeaders=>fetchImpl('https://graph.microsoft.com/v1.0/me/sendMail',{method:'POST',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},
  body:JSON.stringify({message:withHeaders?{...message,internetMessageHeaders:[{name:'List-Unsubscribe',value:'<'+unsubscribe+'>'},{name:'List-Unsubscribe-Post',value:'List-Unsubscribe=One-Click'}]}:message,saveToSentItems:true})});
 let r;try{r=await attempt(!!unsubscribe)}catch{throw new MsError('Microsoft non raggiungibile in questo momento.','EMSNET')}
 if(r.status===400&&unsubscribe){const j=await r.clone().json().catch(()=>({}));if(/header/i.test(JSON.stringify(j)))try{r=await attempt(false)}catch{throw new MsError('Microsoft non raggiungibile in questo momento.','EMSNET')}}
 if(r.status===202||r.ok)return {ok:true};
 const j=await r.json().catch(()=>({})),msg=clean((j.error&&(j.error.message||j.error.code))||('HTTP '+r.status));
 throw new MsError('Microsoft ha rifiutato l’invio: '+msg,r.status===401||r.status===403?'EAUTH':'EMS',r.status);
}
// The refresh token lives in the oauth_* columns, encrypted like a password (same envelope, same binding).
const sealToken=(tokenText,workspace,id,env)=>{const e=mcrypto.encrypt(tokenText,{workspace,id},env);return {oauth_ciphertext:e.password_ciphertext,oauth_iv:e.password_iv,oauth_tag:e.password_tag}};
const openToken=(row,env)=>mcrypto.decrypt({workspace_id:row.workspace_id,id:row.id,password_ciphertext:row.oauth_ciphertext,password_iv:row.oauth_iv,password_tag:row.oauth_tag},env);
module.exports={SCOPE,configured,tenantOf,redirectOf,signState,verifyState,authorizeUrl,exchangeCode,refresh,me,sendMail,sealToken,openToken,MsError};
