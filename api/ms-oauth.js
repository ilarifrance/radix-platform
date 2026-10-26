'use strict';
/* Return address of «Collega con Microsoft 365» (Impostazioni › Caselle email, migration sales 019).
   Microsoft sends the browser here with ?code=…&state=…; the state is the one signed by api/_sales_mailboxes.js («oauth_start»)
   for this person and workspace, valid 10 minutes. Needs the logged-in session of the same person, now owner or admin of the
   workspace. Exchanges the code for tokens, reads the signed-in account (its address becomes the sender), stores the refresh
   token encrypted (api/_ms_oauth.js) and sends the browser back to the settings page. Nothing secret is ever put in the redirect. */
const {randomUUID}=require('node:crypto');
const msoauth=require('./_ms_oauth');
const core=require('./_sales_queue_core');
const BACK='/impostazioni.html';
const back=(res,ok,msg)=>{
 res.statusCode=302;res.setHeader('Location',BACK+'?ms='+(ok?'ok':'error')+(msg?'&msg='+encodeURIComponent(String(msg).slice(0,200)):'')+'#caselle');res.setHeader('Cache-Control','no-store');res.end();
};
function createHandler({getSessionUser,getStore,env=process.env,fetchImpl,now=()=>Date.now()}){
 return async function(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Metodo non consentito.'})}
  const q=req.query||{};
  try{
   if(q.error)return back(res,false,'Accesso Microsoft annullato o rifiutato.');
   if(!msoauth.configured(env))return back(res,false,'Accesso Microsoft non configurato sul server.');
   const st=msoauth.verifyState(env.JWT_SECRET,q.state,now());
   if(!st||typeof q.code!=='string'||!q.code||q.code.length>4000)return back(res,false,'Collegamento scaduto: riprova da «Collega con Microsoft 365».');
   let user;try{user=getSessionUser(req)}catch{user=null}
   if(!user||user.uid!==st.u)return back(res,false,'Accedi a RADIX con lo stesso account e riprova.');
   const store=getStore(),m=await store.membership(st.w,user.uid);
   if(!m||!['owner','admin'].includes(m.role))return back(res,false,'Solo owner e admin collegano le caselle.');
   const t=await msoauth.exchangeCode(env,{code:q.code,redirectUri:st.r},fetchImpl);
   if(!t.refresh_token)return back(res,false,'Microsoft non ha concesso l’accesso continuo: riprova.');
   const who=await msoauth.me(t.access_token,fetchImpl),sql=store.sql;
   const old=(await sql('SELECT id FROM sales_mailboxes WHERE workspace_id=$1 AND lower(from_email)=$2',[st.w,who.address]))[0];
   const id=old?old.id:randomUUID(),e=msoauth.sealToken(t.refresh_token,st.w,id,env);
   if(old){
    await sql("UPDATE sales_mailboxes SET provider='microsoft',oauth_ciphertext=$3,oauth_iv=$4,oauth_tag=$5,password_ciphertext=NULL,password_iv=NULL,password_tag=NULL,smtp_host='graph.microsoft.com',smtp_port=443,smtp_secure=true,smtp_user=$6,status='active',auth_failures=0,last_error=NULL,updated_at=now() WHERE workspace_id=$1 AND id=$2",[st.w,id,e.oauth_ciphertext,e.oauth_iv,e.oauth_tag,who.address]);
   }else{
    const r=await sql(`INSERT INTO sales_mailboxes(workspace_id,id,label,from_name,from_email,smtp_host,smtp_port,smtp_secure,smtp_user,provider,oauth_ciphertext,oauth_iv,oauth_tag,daily_limit,created_by)
     SELECT $1,$2,$3,$4,$5,'graph.microsoft.com',443,true,$5,'microsoft',$6,$7,$8,$9,$10 WHERE (SELECT count(*) FROM sales_mailboxes WHERE workspace_id=$1)<$11 RETURNING id`,
     [st.w,id,String(st.l||who.address).slice(0,60),(st.f||who.name||null),who.address,e.oauth_ciphertext,e.oauth_iv,e.oauth_tag,st.d,user.uid,core.MAX_MAILBOXES]);
    if(!r.length)return back(res,false,'Massimo '+core.MAX_MAILBOXES+' caselle per workspace: eliminane una prima.');
   }
   await sql('INSERT INTO sales_audit(workspace_id,actor_id,entity,entity_id,action,detail) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[st.w,user.uid,'mailboxes',id,old?'oauth_reconnect':'oauth_create',JSON.stringify({from_email:who.address,provider:'microsoft'})]);
   return back(res,true);
  }catch(e){
   console.error('ms oauth callback failed',e&&e.code);
   return back(res,false,e instanceof msoauth.MsError?e.message:'Collegamento non riuscito: riprova tra poco.');
  }
 };
}
const {getSessionUser}=require('./_auth');
module.exports=createHandler({getSessionUser,getStore:()=>require('./_sales_store').createStore(require('./_db').sql())});
module.exports.createHandler=createHandler;
