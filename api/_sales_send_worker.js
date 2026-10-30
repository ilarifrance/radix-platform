'use strict';
/* Worker of the «Coda invii» (migration sales 016), run by Vercel Cron every 10 minutes
   (vercel.json → /api/integrations/send-queue). Vercel calls it with «Authorization: Bearer <CRON_SECRET>»;
   anything else is refused, and without CRON_SECRET the worker does not run at all.
   Each run:
   1. a claim left in «sending» for over 15 minutes becomes «failed» (outcome unknown): never sent twice;
   2. claims a few due rows (at most 2 per mailbox) with FOR UPDATE SKIP LOCKED, so parallel runs never take the same row;
   3. re-reads contact and mailbox: opted out (every mode), consent withdrawn (consent campaigns), not a business address
      or a reply logged (B2B follow-ups), or address gone → «skipped»; paused mailbox → waits;
      daily limit reached or outside working hours → moved to the next working morning;
   4. sends through that mailbox (nodemailer, SMTP with its app password), with List-Unsubscribe and the
      tracked links already in the text, records an «email» interaction, marks the row «sent»;
   5. errors: SMTP login refused → the row waits and after 3 consecutive refusals the mailbox goes to «error»
      (paused until someone fixes it); temporary errors retry up to 3 times; a permanent refusal → «failed».
   Rows exist only from a user's confirmed «Metti in coda». */
const crypto=require('node:crypto');
const core=require('./_sales_queue_core');
const mcrypto=require('./_mailbox_crypto');
const optout=require('./_sales_optout');
const PER_RUN=12,PER_MAILBOX=2,BUDGET_MS=40e3;

/* The run itself, on a small database interface (tests use an in-memory one):
   db.recoverStale(), db.claim(limit,perMailbox) → rows, db.contacts(rows) → Map key→contact, db.mailboxes(rows) → Map key→mailbox,
   db.sentToday(rows,sinceMs) → Map key→count, db.finish(row,patch), db.release(row,patch), db.recordInteraction(row,contact),
   db.mailboxResult(mailbox,{ok}|{authError,error}).
   send(mailbox,message) sends one email (throws an SMTP error). */
const key=(w,id)=>w+':'+id;
async function runWorker({db,send,now=()=>Date.now(),random=Math.random,limit=PER_RUN,perMailbox=PER_MAILBOX,budgetMs=BUDGET_MS}){
 const started=now(),out={recovered:0,claimed:0,sent:0,skipped:0,failed:0,postponed:0,waiting:0,retry:0};
 out.recovered=await db.recoverStale();
 const rows=await db.claim(limit,perMailbox);out.claimed=rows.length;
 if(!rows.length)return out;
 const contacts=await db.contacts(rows),mailboxes=await db.mailboxes(rows);
 const today=core.romeDate(now()),since=core.romeToUtc(today,0);
 const sent=await db.sentToday(rows,since),blocked=new Set();
 for(const row of rows){
  const mk=key(row.workspace_id,row.mailbox_id),mailbox=row.mailbox_id?mailboxes.get(mk):null,contact=contacts.get(key(row.workspace_id,row.contact_id))||null;
  // Out of time, or this mailbox was just refused: give the claim back untouched.
  if(now()-started>budgetMs||blocked.has(mk)){await db.release(row,{});out.waiting++;continue}
  const d=core.decide(row,contact,mailbox,{now:now(),sentToday:sent.get(mk)||0,random});
  if(d.action==='skip'){await db.finish(row,{status:'skipped',error:d.error});out.skipped++;continue}
  if(d.action==='wait'){await db.release(row,{});out.waiting++;continue}
  if(d.action==='postpone'){await db.release(row,{scheduled_at:d.at});out.postponed++;continue}
  try{
   await send(mailbox,{to:d.to,subject:row.subject,text:row.body,unsubscribe:row.unsubscribe_url});
  }catch(e){
   const c=core.classify(e,row.attempts);
   if(c.auth){blocked.add(mk);await db.mailboxResult(mailbox,{authError:true,error:c.error})}
   if(c.status==='failed'){await db.finish(row,{status:'failed',error:c.error});out.failed++}
   else{await db.release(row,{scheduled_at:now()+c.retryInMs,error:c.error,keepAttempt:!c.auth});out.retry++}
   continue;
  }
  // Sent: mark it first, so nothing can send it again; then the timeline.
  await db.finish(row,{status:'sent',sent_at:now()});out.sent++;sent.set(mk,(sent.get(mk)||0)+1);
  try{await db.recordInteraction(row,contact)}catch{}
  await db.mailboxResult(mailbox,{ok:true});
 }
 return out;
}

/* The same interface on Postgres (single statements, as on Neon HTTP). */
function sqlDb(sql){
 const iso=ms=>new Date(ms).toISOString();
 return {
  recoverStale:async()=>(await sql("UPDATE sales_send_queue SET status='failed',error='Esito incerto: invio interrotto, non ripetuto per evitare doppioni.',updated_at=now() WHERE status='sending' AND locked_at<now()-interval '15 minutes' RETURNING id")).length,
  claim:(limit,perMailbox)=>sql(`UPDATE sales_send_queue q SET status='sending',attempts=q.attempts+1,locked_at=now(),updated_at=now()
   FROM (SELECT workspace_id,id FROM sales_send_queue WHERE (workspace_id,id) IN (
     SELECT workspace_id,id FROM (SELECT s.workspace_id,s.id,row_number() OVER (PARTITION BY s.workspace_id,s.mailbox_id ORDER BY s.scheduled_at,s.id) AS rn
      FROM sales_send_queue s JOIN sales_mailboxes m ON m.workspace_id=s.workspace_id AND m.id=s.mailbox_id
      WHERE s.status='queued' AND s.scheduled_at<=now() AND m.status='active') x WHERE x.rn<=$2)
    AND status='queued' ORDER BY scheduled_at,id LIMIT $1 FOR UPDATE SKIP LOCKED) due
   WHERE q.workspace_id=due.workspace_id AND q.id=due.id AND q.status='queued'
   RETURNING q.workspace_id,q.id,q.campaign,q.contact_id,q.mailbox_id,q.subject,q.body,q.unsubscribe_url,q.attempts,q.created_by,q.created_at`,[limit,perMailbox]),
  contacts:async rows=>{
   const r=await sql('SELECT t.workspace_id,t.id,t.email,t.marketing_consent,t.company_id,'+optout.OPTED_OUT('t')+' AS opted_out,'+optout.LAST_REPLY('t')+' AS last_reply_at FROM sales_contacts t JOIN jsonb_to_recordset($1::jsonb) AS x(w uuid,c uuid) ON t.workspace_id=x.w AND t.id=x.c',[JSON.stringify(rows.map(x=>({w:x.workspace_id,c:x.contact_id})))]);
   return new Map(r.map(x=>[key(x.workspace_id,x.id),x]));
  },
  mailboxes:async rows=>{
   const r=await sql('SELECT m.workspace_id,m.id,m.label,m.from_name,m.from_email,m.smtp_host,m.smtp_port,m.smtp_secure,m.smtp_user,m.provider,m.password_ciphertext,m.password_iv,m.password_tag,m.oauth_ciphertext,m.oauth_iv,m.oauth_tag,m.daily_limit,m.warmup_start::text AS warmup_start,m.status FROM sales_mailboxes m JOIN jsonb_to_recordset($1::jsonb) AS x(w uuid,m uuid) ON m.workspace_id=x.w AND m.id=x.m',[JSON.stringify(rows.filter(x=>x.mailbox_id).map(x=>({w:x.workspace_id,m:x.mailbox_id})))]);
   return new Map(r.map(x=>[key(x.workspace_id,x.id),x]));
  },
  sentToday:async(rows,since)=>{
   const r=await sql("SELECT q.workspace_id,q.mailbox_id,count(*)::int AS n FROM sales_send_queue q JOIN jsonb_to_recordset($1::jsonb) AS x(w uuid,m uuid) ON q.workspace_id=x.w AND q.mailbox_id=x.m WHERE q.status='sent' AND q.sent_at>=$2::timestamptz GROUP BY 1,2",[JSON.stringify(rows.filter(x=>x.mailbox_id).map(x=>({w:x.workspace_id,m:x.mailbox_id}))),iso(since)]);
   return new Map(r.map(x=>[key(x.workspace_id,x.mailbox_id),x.n]));
  },
  // Only a row still claimed by this run changes (status='sending').
  finish:(row,p)=>sql("UPDATE sales_send_queue SET status=$3,error=$4,sent_at=$5::timestamptz,locked_at=NULL,updated_at=now() WHERE workspace_id=$1 AND id=$2 AND status='sending'",[row.workspace_id,row.id,p.status,p.error||null,p.sent_at?iso(p.sent_at):null]),
  release:(row,p)=>sql("UPDATE sales_send_queue SET status='queued',attempts=CASE WHEN $5 THEN attempts ELSE greatest(attempts-1,0) END,scheduled_at=COALESCE($3::timestamptz,scheduled_at),error=COALESCE($4,error),locked_at=NULL,updated_at=now() WHERE workspace_id=$1 AND id=$2 AND status='sending'",[row.workspace_id,row.id,p.scheduled_at?iso(p.scheduled_at):null,p.error||null,!!p.keepAttempt]),
  recordInteraction:(row,contact)=>sql("INSERT INTO sales_interactions(workspace_id,id,title,kind,occurred_at,body,contact_id,company_id,created_by) VALUES($1,$2,left($3,200),'email',now(),left($4,4000),$5,$6,$7)",[row.workspace_id,crypto.randomUUID(),'Email: '+row.subject,row.body,row.contact_id,contact.company_id||null,row.created_by||null]),
  saveToken:(m,e)=>sql('UPDATE sales_mailboxes SET oauth_ciphertext=$3,oauth_iv=$4,oauth_tag=$5 WHERE workspace_id=$1 AND id=$2',[m.workspace_id,m.id,e.oauth_ciphertext,e.oauth_iv,e.oauth_tag]),
  mailboxResult:(m,r)=>r.ok?sql("UPDATE sales_mailboxes SET auth_failures=0 WHERE workspace_id=$1 AND id=$2 AND auth_failures<>0",[m.workspace_id,m.id])
   :sql("UPDATE sales_mailboxes SET auth_failures=auth_failures+1,last_error=left($3,500),status=CASE WHEN auth_failures+1>=$4 THEN 'error' ELSE status END,updated_at=now() WHERE workspace_id=$1 AND id=$2",[m.workspace_id,m.id,r.error,core.AUTH_PAUSE_AFTER])
 };
}
// One SMTP transport per mailbox and run; the password is decrypted only here, in memory.
function smtpSender({env,createTransport,fetchImpl,saveToken}){
 const cache=new Map(),mailboxes=require('./_sales_mailboxes'),ms=require('./_ms_oauth');
 return async(m,msg)=>{
  const k=m.workspace_id+':'+m.id;let t=cache.get(k);
  // Microsoft 365 mailbox: Graph sendMail with a short-lived access token (refreshed once per run); Microsoft may rotate the refresh token.
  if(m.provider==='microsoft'){
   if(!t){let rt;try{rt=ms.openToken(m,env)}catch(e){const err=new Error(e.message);err.code='EAUTH';throw err}
    const r=await ms.refresh(env,rt,fetchImpl);
    if(r.refresh_token&&r.refresh_token!==rt&&saveToken)await saveToken(m,ms.sealToken(r.refresh_token,m.workspace_id,m.id,env));
    t={access:r.access_token};cache.set(k,t)}
   return ms.sendMail(t.access,{to:msg.to,subject:msg.subject,text:msg.text,unsubscribe:msg.unsubscribe},fetchImpl);
  }
  if(!t){let pass;try{pass=mcrypto.decrypt(m,env)}catch(e){const err=new Error(e.message);err.code='EAUTH';throw err}t=createTransport(mailboxes.transportOptions(m,pass));cache.set(k,t)}
  return t.sendMail({from:mailboxes.fromOf(m),to:msg.to,subject:msg.subject,text:msg.text,list:{unsubscribe:msg.unsubscribe},headers:{'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}});
 };
}
// Vercel Cron: «Authorization: Bearer <CRON_SECRET>», compared in constant time.
function authorized(req,env){
 const secret=String(env.CRON_SECRET||''),got=String((req.headers&&req.headers.authorization)||'');
 if(secret.length<16)return null;
 const a=Buffer.from(got),b=Buffer.from('Bearer '+secret);
 return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
function createHandler({getSql=()=>require('./_db').sql(),env=process.env,createTransport=o=>require('nodemailer').createTransport(o),fetchImpl}={}){
 return async function(req,res){
  res.setHeader('Cache-Control','no-store');
  const ok=authorized(req,env);
  if(ok===null)return res.status(503).json({error:'Coda invii non attiva: manca CRON_SECRET nelle variabili d’ambiente.'});
  if(!ok)return res.status(401).json({error:'Non autorizzato.'});
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Metodo non consentito.'})}
  try{
   const db=sqlDb(getSql()),result=await runWorker({db,send:smtpSender({env,createTransport,fetchImpl,saveToken:db.saveToken})});
   return res.status(200).json({ok:true,...result});
  }catch(e){
   // Codes only: never the message, which could quote data of a row.
   console.error('send queue worker failed',e&&e.code);
   return res.status(500).json({ok:false,error:'Coda invii non riuscita in questo giro: riprova al prossimo.'});
  }
 };
}
module.exports=createHandler();
module.exports.createHandler=createHandler;
module.exports.runWorker=runWorker;
module.exports.authorized=authorized;
module.exports.sqlDb=sqlDb;
module.exports.smtpSender=smtpSender;
