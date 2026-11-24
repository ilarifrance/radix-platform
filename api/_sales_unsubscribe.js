'use strict';
/* Unsubscribe links for CRM campaign emails. Every marketing email carries a personal link
   /api/sales?unsubscribe=<token>: opening it shows a confirmation page, confirming (or a mail client's
   one-click POST, RFC 8058) withdraws that contact's marketing consent and records the opt-out (also for
   contacts that never gave consent, such as «Prospezione B2B» recipients: see api/_sales_optout.js). No login: the token is the
   permission, and it can only ever turn consent off.
   Token = workspace id + contact id (32 bytes) + the first 16 bytes of an HMAC-SHA256 over them, base64url.
   The key comes from UNSUBSCRIBE_SECRET when set, else from JWT_SECRET: setting UNSUBSCRIBE_SECRET keeps the links
   already sent working even if the session secret is rotated later. */
const crypto=require('node:crypto');
const optout=require('./_sales_optout');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const key=secret=>{if(typeof secret!=='string'||secret.length<16)throw new Error('JWT_SECRET is not set in the environment.');return crypto.createHmac('sha256',secret).update('radix-crm-unsubscribe-v1').digest()};
const toBytes=u=>Buffer.from(u.replace(/-/g,''),'hex');
const toUuid=b=>{const h=b.toString('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20)};
function sign(secret,workspace,contact){
 if(!UUID.test(workspace)||!UUID.test(contact))throw new Error('invalid id');
 const ids=Buffer.concat([toBytes(workspace),toBytes(contact)]);
 return Buffer.concat([ids,crypto.createHmac('sha256',key(secret)).update(ids).digest().subarray(0,16)]).toString('base64url');
}
function verify(secret,token){
 if(typeof token!=='string'||!/^[A-Za-z0-9_-]{64}$/.test(token))return null;
 const raw=Buffer.from(token,'base64url');if(raw.length!==48)return null;
 const ids=raw.subarray(0,32),mac=crypto.createHmac('sha256',key(secret)).update(ids).digest().subarray(0,16);
 if(!crypto.timingSafeEqual(mac,raw.subarray(32)))return null;
 return {workspace:toUuid(ids.subarray(0,16)),contact:toUuid(ids.subarray(16))};
}

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
function page(title,text,form){
 return '<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>'+esc(title)+'</title>'
 +'<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#06161d;color:#e6f6f2;font:16px/1.5 system-ui,sans-serif}main{max-width:440px;margin:24px;padding:28px;border:1px solid #1f5a5c;border-radius:14px;background:#0a2129}h1{margin:0 0 8px;font-size:20px}p{margin:0 0 16px;color:#b5cfcc}button{min-height:44px;padding:8px 18px;border:0;border-radius:10px;background:#3fe8bd;color:#04241c;font:600 15px system-ui,sans-serif;cursor:pointer}</style></head>'
 +'<body><main><h1>'+esc(title)+'</h1><p>'+esc(text)+'</p>'+(form?'<form method="post"><button type="submit">Conferma la disiscrizione</button></form>':'')+'</main></body></html>';
}
function send(res,status,html){
 res.setHeader('Content-Type','text/html; charset=utf-8');
 res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
 res.setHeader('Referrer-Policy','no-referrer');res.status(status).send(html);
}
// GET: confirmation page. POST: consent off (idempotent), then a short confirmation.
const secretOf=env=>env.UNSUBSCRIBE_SECRET||env.JWT_SECRET;
async function handle(req,res,{getSql,secret}){
 let who;try{who=verify(secret,req.query?.unsubscribe)}catch{return send(res,503,page('Servizio non disponibile','La disiscrizione non è disponibile in questo momento. Riprova più tardi o rispondi all’email ricevuta chiedendo di non essere più contattato.'))}
 if(!who)return send(res,400,page('Link non valido','Questo link di disiscrizione non è valido o è incompleto. Rispondi all’email ricevuta chiedendo di non essere più contattato.'));
 if(req.method==='GET')return send(res,200,page('Non ricevere più queste email','Confermando, non riceverai più email commerciali da questo mittente. Le comunicazioni su ordini o richieste già in corso possono continuare.',true));
 if(req.method!=='POST'){res.setHeader('Allow','GET, POST');return send(res,405,page('Richiesta non valida','Apri il link dall’email.'))}
 const sql=getSql();
 // Every contact, with or without marketing consent (a «Prospezione B2B» recipient has none): consent off, a stamped note,
 // a timeline note «Disiscrizione dalle email commerciali» (the durable marker, it survives edits to the notes) and
 // its queued emails cancelled. Repeated clicks change nothing: the WHERE skips a contact already marked.
 let rows;
 try{
  rows=await sql(`UPDATE sales_contacts t SET marketing_consent=false,consent_at=NULL,version=version+1,notes=CASE WHEN length(coalesce(notes,''))<=3900 THEN concat_ws(E'\\n\\n',nullif(notes,''),'Disiscrizione dalle email commerciali tramite link: '||to_char(now() AT TIME ZONE 'Europe/Rome','DD/MM/YYYY HH24:MI')) ELSE notes END WHERE workspace_id=$1 AND id=$2 AND (marketing_consent OR NOT (coalesce(notes,'') ILIKE '%disiscrizione%' OR EXISTS(SELECT 1 FROM sales_interactions i WHERE i.workspace_id=t.workspace_id AND i.contact_id=t.id AND i.title ILIKE 'Disiscrizione%'))) RETURNING id`,[who.workspace,who.contact]);
  await sql(`INSERT INTO sales_interactions(workspace_id,id,title,kind,occurred_at,body,contact_id,company_id) SELECT t.workspace_id,$3,'Disiscrizione dalle email commerciali','note',now(),'Ha chiesto di non ricevere più email commerciali (link di disiscrizione). Non ricontattare via email.',t.id,t.company_id FROM sales_contacts t WHERE t.workspace_id=$1 AND t.id=$2 AND NOT EXISTS(SELECT 1 FROM sales_interactions i WHERE i.workspace_id=t.workspace_id AND i.contact_id=t.id AND i.title ILIKE 'Disiscrizione%')`,[who.workspace,who.contact,crypto.randomUUID()]);
  await sql("UPDATE sales_send_queue SET status='cancelled',error='Disiscritto: invio annullato.',updated_at=now() WHERE workspace_id=$1 AND contact_id=$2 AND status='queued'",[who.workspace,who.contact]);
 }catch(e){
  console.error('unsubscribe failed',e&&e.code);
  return send(res,503,page('Servizio non disponibile','La disiscrizione non è riuscita in questo momento. Riprova tra qualche minuto oppure rispondi all’email ricevuta chiedendo di non essere più contattato.'));
 }
 // «Indirizzi disiscritti» (migration sales 017): the address, by hash, stays on the list even if the contact is deleted or
 // imported again. The opt-out above is already recorded: an archive without 017 (or a failure here) does not undo it.
 try{await optout.suppressContact(sql,who.workspace,who.contact,{reason:'unsubscribe',source:'link di disiscrizione'})}
 catch(e){if(!(e&&e.code==='42P01'))console.error('unsubscribe suppression failed',e&&e.code)}
 const left=rows.length?rows:await sql('SELECT id FROM sales_contacts WHERE workspace_id=$1 AND id=$2',[who.workspace,who.contact]);
 if(!left.length)return send(res,200,page('Disiscrizione registrata','Non risultano più tuoi dati per queste email: non riceverai altri messaggi commerciali.'));
 return send(res,200,page('Disiscrizione registrata','Fatto: non riceverai più email commerciali da questo mittente.'));
}
// Links for the contacts of one workspace (ids not in the workspace are left out). The queue plan calls it with
// recipients already checked for opt-out.
async function links(sql,workspace,ids,secret){
 const rows=await sql('SELECT id FROM sales_contacts WHERE workspace_id=$1 AND id=ANY($2::uuid[])',[workspace,ids]);
 return Object.fromEntries(rows.map(r=>[r.id,sign(secret,workspace,r.id)]));
}
// The browser's link request (campaign panel, newsletter): an opted-out contact (api/_sales_optout.js, «Indirizzi
// disiscritti» included) gets no link, so withUnsubscribe leaves it out of every direct send. → {links:{id:token}, opted_out:n}
async function linksOf(sql,workspace,ids,secret){
 const all=await links(sql,workspace,ids,secret),ok=Object.keys(all);
 if(!ok.length)return {links:all,opted_out:0};
 const out=await sql('SELECT t.id FROM sales_contacts t WHERE t.workspace_id=$1 AND t.id=ANY($2::uuid[]) AND '+optout.OPTED_OUT('t'),[workspace,ok]);
 for(const r of out)delete all[r.id];
 return {links:all,opted_out:out.length};
}
module.exports={sign,verify,handle,links,linksOf,secretOf};
