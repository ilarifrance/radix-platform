'use strict';
/* Secret iCal links of «Calendari esterni» (migration sales 018), encrypted like the mailbox passwords
   (api/_mailbox_crypto.js): AES-256-GCM with MAILBOX_ENC_KEY, outside the database. The additional authenticated data
   binds each ciphertext to its workspace, row id and user, so a row copied onto another person or edited by hand does not
   decrypt. A missing key stops the save with a clear message; links are never logged, returned or put in error messages. */
const crypto=require('node:crypto');
const {keyOf}=require('./_mailbox_crypto');
const VERSION='radix-calendar-source-v1';
class CalendarKeyError extends Error{constructor(){super('Link non salvato: manca la chiave di cifratura (MAILBOX_ENC_KEY) nelle variabili d’ambiente del server. Chiedi a chi gestisce RADIX di impostarla, poi riprova.');this.status=503;this.code='CALENDAR_KEY'}}
const key=env=>{try{return keyOf(env)}catch{throw new CalendarKeyError()}};
const aadOf=({workspace,id,user})=>Buffer.from(VERSION+':'+workspace+':'+id+':'+user);
function encrypt(url,owner,env){
 if(typeof url!=='string'||!url)throw new Error('empty url');
 const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key(env),iv);c.setAAD(aadOf(owner));
 const ct=Buffer.concat([c.update(url,'utf8'),c.final()]);
 return {url_ciphertext:ct.toString('base64'),url_iv:iv.toString('base64'),url_tag:c.getAuthTag().toString('base64')};
}
// row: {workspace_id,id,user_id,url_ciphertext,url_iv,url_tag}. Throws on a wrong key, tampering or a moved row.
function decrypt(row,env){
 const k=key(env),iv=Buffer.from(String(row.url_iv||''),'base64'),tag=Buffer.from(String(row.url_tag||''),'base64');
 if(iv.length!==12||tag.length!==16)throw new Error('Link del calendario illeggibile: salvalo di nuovo.');
 const d=crypto.createDecipheriv('aes-256-gcm',k,iv);d.setAAD(aadOf({workspace:row.workspace_id,id:row.id,user:row.user_id}));d.setAuthTag(tag);
 try{return Buffer.concat([d.update(Buffer.from(String(row.url_ciphertext||''),'base64')),d.final()]).toString('utf8')}
 catch{throw new Error('Link del calendario illeggibile (chiave cambiata o dato alterato): salvalo di nuovo.')}
}
module.exports={encrypt,decrypt,CalendarKeyError};
