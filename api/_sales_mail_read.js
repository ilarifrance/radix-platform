'use strict';
/* CRM «Posta»: read a Microsoft 365 mailbox connected in Impostazioni › Caselle (Microsoft Graph, delegated Mail.Read).
   GET /api/sales?entity=mail&workspace&mailbox[&folder=inbox|sent][&search][&skip] → {rows: 25 messages, newest first}
   GET /api/sales?entity=mail&workspace&mailbox&id=<message id>                   → {rows:[the message with its text]}
   Only whoever connected the mailbox (sales_mailboxes.created_by, set at every Microsoft sign-in) reads it: a colleague's
   mailbox stays private even to owners. Nothing is stored here: the page links a message to a contact or opportunity by
   saving it as an interaction (entity interactions, kind email), which the normal CRM rules check. */
const msoauth=require('./_ms_oauth');
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
class MailReadError extends Error{constructor(status,message,code){super(message);this.status=status;if(code)this.code=code}}
const fail=(s,m,code)=>{throw new MailReadError(s,m,code)};
function query(q){
 const keys=['entity','workspace','mailbox','folder','search','skip','id'];
 if(Object.keys(q).some(k=>!keys.includes(k))||!uuid(q.workspace)||!uuid(q.mailbox))fail(400,'Parametri della posta non validi.');
 const folder=q.folder===undefined?'inbox':q.folder;if(!Object.hasOwn(msoauth.FOLDERS,folder))fail(400,'Cartella non valida: inbox o sent.');
 const search=q.search===undefined?'':String(q.search).trim();if(search.length>100||/[\u0000-\u001f\u007f]/.test(search))fail(400,'Ricerca non valida: massimo 100 caratteri.');
 const skip=q.skip===undefined?0:Number(q.skip);if(!Number.isInteger(skip)||skip<0||skip>1000)fail(400,'Pagina non valida.');
 if(q.id!==undefined&&(typeof q.id!=='string'||!/^[A-Za-z0-9+/=_-]{10,500}$/.test(q.id)))fail(400,'Messaggio non valido.');
 return {workspace:q.workspace,entity:'mail',mailbox:q.mailbox,folder,search,skip,id:q.id||null};
}
async function handle(c,{sql,user,env=process.env,fetchImpl=fetch}){
 if(!msoauth.configured(env))fail(409,'Accesso Microsoft non configurato sul server.');
 const m=(await sql("SELECT workspace_id,id,label,from_email,provider,created_by,oauth_ciphertext,oauth_iv,oauth_tag FROM sales_mailboxes WHERE workspace_id=$1 AND id=$2",[c.workspace,c.mailbox]))[0];
 if(!m)fail(404,'Casella non trovata.');
 if(m.provider!=='microsoft')fail(409,'La lettura della posta funziona con le caselle collegate con Microsoft 365.');
 if(String(m.created_by)!==String(user))fail(403,'Solo chi ha collegato la casella con il proprio account Microsoft può leggerne la posta.');
 let rt;try{rt=msoauth.openToken(m,env)}catch(e){fail(409,e.message)}
 let t;try{t=await msoauth.refreshRead(env,rt,fetchImpl)}
 catch(e){if(e&&e.code==='EAUTH')fail(409,'Per leggere la posta ricollega la casella con «Collega con Microsoft 365» e accetta la lettura della posta. Se Microsoft chiede l’approvazione di un amministratore, va concessa all’app «RADIX CRM» il permesso Mail.Read.','needs_reconnect');throw e}
 if(t.refresh_token&&t.refresh_token!==rt){const e=msoauth.sealToken(t.refresh_token,c.workspace,m.id,env);await sql('UPDATE sales_mailboxes SET oauth_ciphertext=$3,oauth_iv=$4,oauth_tag=$5 WHERE workspace_id=$1 AND id=$2',[c.workspace,m.id,e.oauth_ciphertext,e.oauth_iv,e.oauth_tag])}
 try{
  if(c.id)return {rows:[await msoauth.getMessage(t.access_token,c.id,fetchImpl)],mailbox:{id:m.id,label:m.label,address:m.from_email}};
  return {rows:await msoauth.listMessages(t.access_token,c,fetchImpl),mailbox:{id:m.id,label:m.label,address:m.from_email},folder:c.folder,skip:c.skip};
 }catch(e){if(e&&e.code==='EREAD')fail(409,e.message,'needs_reconnect');if(e instanceof msoauth.MsError)fail(502,e.message);throw e}
}
module.exports={query,handle,MailReadError,ENTITY:'mail'};
