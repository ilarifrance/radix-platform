'use strict';
/* App passwords of the CRM sending mailboxes (migration sales 016), encrypted with AES-256-GCM.
   The key comes from MAILBOX_ENC_KEY (32 bytes, base64 or hex) and never reaches the database; each
   ciphertext is bound to its workspace and mailbox id (additional authenticated data), so a row copied
   onto another mailbox, or changed by hand, does not decrypt. A missing key stops the save with a clear
   message: nothing is ever stored in clear. Passwords are never logged, returned or put in error messages. */
const crypto=require('node:crypto');
const VERSION='radix-mailbox-v1';
class MailboxKeyError extends Error{constructor(){super('Password non salvata: manca la chiave di cifratura delle caselle (MAILBOX_ENC_KEY) nelle variabili d’ambiente del server. Chiedi a chi gestisce RADIX di impostarla (32 byte casuali in base64), poi riprova.');this.status=503;this.code='MAILBOX_KEY'}}
function keyOf(env){
 const raw=String((env||{}).MAILBOX_ENC_KEY||'').trim();if(!raw)throw new MailboxKeyError();
 const k=/^[0-9a-f]{64}$/i.test(raw)?Buffer.from(raw,'hex'):Buffer.from(raw,'base64');
 if(k.length!==32)throw new MailboxKeyError();
 return k;
}
const configured=env=>{try{keyOf(env);return true}catch{return false}};
const aadOf=(workspace,id)=>Buffer.from(VERSION+':'+workspace+':'+id);
function encrypt(password,{workspace,id},env){
 if(typeof password!=='string'||!password)throw new Error('empty password');
 const key=keyOf(env),iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv);c.setAAD(aadOf(workspace,id));
 const ct=Buffer.concat([c.update(password,'utf8'),c.final()]);
 return {password_ciphertext:ct.toString('base64'),password_iv:iv.toString('base64'),password_tag:c.getAuthTag().toString('base64')};
}
// Throws on a wrong key, a tampered ciphertext/iv/tag or a row moved to another mailbox.
function decrypt(row,env){
 const key=keyOf(env),iv=Buffer.from(String(row.password_iv||''),'base64'),tag=Buffer.from(String(row.password_tag||''),'base64');
 if(iv.length!==12||tag.length!==16)throw new Error('Password della casella illeggibile: salvala di nuovo.');
 const d=crypto.createDecipheriv('aes-256-gcm',key,iv);d.setAAD(aadOf(row.workspace_id,row.id));d.setAuthTag(tag);
 try{return Buffer.concat([d.update(Buffer.from(String(row.password_ciphertext||''),'base64')),d.final()]).toString('utf8')}
 catch{throw new Error('Password della casella illeggibile (chiave cambiata o dato alterato): salvala di nuovo.')}
}
module.exports={encrypt,decrypt,configured,keyOf,MailboxKeyError};
