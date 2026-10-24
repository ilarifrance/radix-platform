'use strict';
/* «Indirizzi disiscritti» in /api/sales (entity «email_suppressions», migration sales 017): the permanent list of addresses
   that never get a campaign email from this workspace again, kept only as hashes (api/_sales_optout.js emailHash).
   Owner and admin only, for reading too: the list is the workspace's compliance record.
   - GET → {rows:[{email_hash,reason,source,created_at}] newest first (≤5000, for the panel and the CSV export), count, by_reason}.
   - POST add {email, reason?}: the address typed by the user is hashed here and never stored nor logged; reason «manual»
     unless «bounce», «complaint» or «unsubscribe» (asked by phone or by reply). Its emails still in the «Coda invii» are cancelled.
   - POST check {email}: is this address on the list? (the hash, never the address, goes to the database)
   - POST remove {email_hash, confirm:true}: off the list, after the RadixConfirm in the panel; says how many contacts
     with that address still have an opt-out note (they stay excluded until the note goes).
   Every add and remove is in sales_audit with the hash and the reason only. */
const {randomUUID}=require('node:crypto');
const optout=require('./_sales_optout');
class SuppressionError extends Error{constructor(status,message){super(message);this.status=status}}
const fail=(s,m)=>{throw new SuppressionError(s,m)};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const object=v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const MAX_ROWS=5000;
const iso=x=>`to_char((${x}) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')`;

// The typed address → its hash. Only a plausible address is accepted (≤254 characters, no control characters).
function hashOf(v){
 if(typeof v!=='string'||v.length>254||/[\u0000-\u001f\u007f]/.test(v)||!EMAIL.test(v.trim()))fail(400,'Indirizzo email non valido.');
 return optout.emailHash(v);
}
function command(body){
 if(!object(body)||Object.keys(body).some(k=>!['workspace','entity','action','data'].includes(k))||body.entity!=='email_suppressions'||!UUID.test(String(body.workspace))||!object(body.data))fail(400,'Richiesta non valida.');
 const {workspace,action}=body,d=body.data;
 const keys=(...allowed)=>{if(Object.keys(d).some(k=>!allowed.includes(k)))fail(400,'Campo non consentito.')};
 if(action==='add'){
  keys('email','reason');
  const reason=d.reason===undefined?'manual':d.reason;
  if(!optout.REASONS.includes(reason))fail(400,'Motivo non valido.');
  return {workspace,entity:'email_suppressions',action,data:{email_hash:hashOf(d.email),reason}};
 }
 if(action==='check'){keys('email');return {workspace,entity:'email_suppressions',action,data:{email_hash:hashOf(d.email)}}}
 if(action==='remove'){
  keys('email_hash','confirm');
  if(typeof d.email_hash!=='string'||!optout.HASH.test(d.email_hash))fail(400,'Indirizzo non valido.');
  if(d.confirm!==true)fail(400,'Rimozione non confermata: conferma nella finestra del CRM.');
  return {workspace,entity:'email_suppressions',action,data:{email_hash:d.email_hash}};
 }
 fail(400,'Azione non valida.');
}
function query(q){
 if(Object.keys(q).some(k=>!['entity','workspace','offset'].includes(k))||(q.offset!==undefined&&q.offset!=='0')||!UUID.test(String(q.workspace)))fail(400,'Parametri non validi.');
 return {workspace:q.workspace,entity:'email_suppressions'};
}
const roleAdmin=role=>['owner','admin'].includes(role);

async function run(c,{sql,user,role,method}){
 if(!roleAdmin(role))fail(403,'Solo owner e admin gestiscono gli indirizzi disiscritti.');
 const w=c.workspace;
 if(method==='GET'){
  const [rows,totals]=await Promise.all([
   sql(`SELECT email_hash,reason,source,${iso('created_at')} AS created_at FROM sales_email_suppressions WHERE workspace_id=$1 ORDER BY created_at DESC,email_hash LIMIT ${MAX_ROWS}`,[w]),
   sql('SELECT reason,count(*)::int AS n FROM sales_email_suppressions WHERE workspace_id=$1 GROUP BY reason',[w])]);
  const by_reason=Object.fromEntries(optout.REASONS.map(r=>[r,0]));for(const t of totals)by_reason[t.reason]=t.n;
  return {rows,count:Object.values(by_reason).reduce((a,b)=>a+b,0),by_reason,max:MAX_ROWS,can_manage:true};
 }
 const d=c.data,audit=(action,detail)=>sql('INSERT INTO sales_audit(workspace_id,actor_id,entity,entity_id,action,detail) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[w,user,'email_suppressions',randomUUID(),action,JSON.stringify(detail)]);
 const one=async()=>(await sql(`SELECT email_hash,reason,source,${iso('created_at')} AS created_at FROM sales_email_suppressions WHERE workspace_id=$1 AND email_hash=$2`,[w,d.email_hash]))[0]||null;
 if(c.action==='check'){const r=await one();return {rows:[r?{...r,suppressed:true}:{email_hash:d.email_hash,suppressed:false}]}}
 if(c.action==='add'){
  const added=await sql('INSERT INTO sales_email_suppressions(workspace_id,email_hash,reason,source,created_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT (workspace_id,email_hash) DO NOTHING RETURNING email_hash',[w,d.email_hash,d.reason,'aggiunto a mano',user]);
  // Emails to this address still waiting in the «Coda invii» are cancelled now (the worker would skip them anyway).
  let cancelled=0;
  try{cancelled=(await sql(`UPDATE sales_send_queue q SET status='cancelled',error='Indirizzo disiscritto: invio annullato.',updated_at=now() FROM sales_contacts t
   WHERE q.workspace_id=$1 AND q.status='queued' AND t.workspace_id=q.workspace_id AND t.id=q.contact_id AND nullif(btrim(t.email),'') IS NOT NULL AND ${optout.HASH_SQL('t.email')}=$2 RETURNING q.id`,[w,d.email_hash])).length}
  catch(e){if(!(e&&e.code==='42P01'))throw e}
  if(added.length)await audit('create',{email_hash:d.email_hash,reason:d.reason,cancelled});
  return {rows:[{...(await one()),added:added.length>0,cancelled}]};
 }
 if(c.action==='remove'){
  const gone=await sql('DELETE FROM sales_email_suppressions WHERE workspace_id=$1 AND email_hash=$2 RETURNING reason',[w,d.email_hash]);
  if(!gone.length)fail(404,'Indirizzo non più nella lista: ricarica.');
  await audit('delete',{email_hash:d.email_hash,reason:gone[0].reason});
  // Contacts with this address whose notes or timeline still record an opt-out stay excluded (OPTED_OUT).
  const still=await sql(`SELECT count(*)::int AS n FROM sales_contacts t WHERE t.workspace_id=$1 AND nullif(btrim(t.email),'') IS NOT NULL AND ${optout.HASH_SQL('t.email')}=$2 AND ${optout.OPTED_OUT('t')}`,[w,d.email_hash]);
  return {rows:[{email_hash:d.email_hash,removed:true,reason:gone[0].reason,still_opted_out:(still[0]&&still[0].n)||0}]};
 }
 fail(400,'Azione non valida.');
}
// Called by api/_sales.js after membership is known. Returns the JSON body.
async function handle(c,opts){
 try{return await run(c,opts)}
 catch(e){if(e&&e.code==='42P01')fail(503,'Indirizzi disiscritti non ancora disponibili in questo archivio: serve la migrazione sales 017 (da approvare).');throw e}
}
module.exports={command,query,handle,hashOf,MAX_ROWS,SuppressionError};
