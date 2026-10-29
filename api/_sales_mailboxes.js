'use strict';
/* «Caselle email» and «Coda invii» in /api/sales (migration sales 016).
   entity «mailboxes»: list (any member); add, update, pause, resume, delete and «Prova invio» (owner/admin).
     The app password is encrypted (api/_mailbox_crypto.js) before it reaches the database and is never
     returned: the API only says password_saved:true. «Prova invio» sends one email to the logged-in user's
     own address, after the confirmation in the CRM (confirm:true).
   entity «send_queue»: per-campaign status (any member); plan, enqueue (confirm:true) and cancel (owner/admin/member).
     Recipients are resolved like the campaign panel: the browser sends the segment's contact ids, the server
     reloads them and applies the same rules (sales/crm-campaigns.js planCampaign: consent and a valid address;
     withTracking: signed click links; withUnsubscribe: the personal unsubscribe link, as List-Unsubscribe too).
     Times and mailboxes come from api/_sales_queue_core.js. Rows exist only after the user's confirmed click.
     mode «b2b» («Prospezione B2B», sales/crm-prospecting-core.js): contacts without consent too, with stricter rules,
     a fixed footer and no click tracking; the campaign is named «B2B · …» by the server so the worker knows. */
const {randomUUID}=require('node:crypto');
const mcrypto=require('./_mailbox_crypto');
const core=require('./_sales_queue_core');
const campaigns=require('../sales/crm-campaigns.js');
const unsubscribe=require('./_sales_unsubscribe');
const msoauth=require('./_ms_oauth');
const clicks=require('./_sales_clicks');
// «Prospezione B2B» (sales/crm-prospecting-core.js) and the opt-out / reply signals (api/_sales_optout.js).
const prospecting=require('../sales/crm-prospecting-core.js');
const optout=require('./_sales_optout');
// «I member vedono solo i propri record» (PR #172): recipients, the per-campaign status and «Annulla» cover only contacts
// visible to the caller (TRUE for owners/admins and workspaces without the switch). The dedup read of the queue stays
// workspace-wide on purpose: one email per contact/address per campaign, whoever queued it; it returns only counts.
const vis=require('./_sales_visibility');
class QueueError extends Error{constructor(status,message){super(message);this.status=status}}
const fail=(s,m)=>{throw new QueueError(s,m)};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuid=v=>typeof v==='string'&&UUID.test(v);
const object=v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const CTRL=/[\u0000-\u001f\u007f]/;
const HOST=/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const MAX_CONTACTS=5000;
// Timestamps as ISO text in SQL: the CRM store normalizes only known column names.
const iso=x=>`to_char((${x}) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')`;
// Columns a browser may see: never the encrypted password fields.
const PUBLIC='id,label,from_name,from_email,smtp_host,smtp_port,smtp_secure,smtp_user,daily_limit,warmup_start::text AS warmup_start,status,last_error,created_at,updated_at,provider,(password_ciphertext IS NOT NULL OR oauth_ciphertext IS NOT NULL) AS password_saved';
const MAILBOX_FIELDS=['label','from_name','from_email','smtp_host','smtp_port','smtp_secure','smtp_user','password','daily_limit'];

// Single-line text; multiline (the email text) keeps line breaks and tabs.
const CTRL_MULTI=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
function text(v,max,label,{required=true,multiline=false}={}){
 if(v===undefined||v===null||v===''){if(required)fail(400,label+' obbligatorio.');return null}
 if(typeof v!=='string'||(multiline?CTRL_MULTI:CTRL).test(v))fail(400,label+': caratteri non validi.');
 if(v.trim().length>max)fail(400,label+': massimo '+max+' caratteri.');
 const t=v.trim();if(!t&&required)fail(400,label+' obbligatorio.');return t||null;
}
function mailboxData(d,creating){
 const out={};
 for(const k of Object.keys(d)){
  const v=d[k];
  if(k==='label')out.label=text(v,60,'Nome della casella');
  else if(k==='from_name')out.from_name=text(v,80,'Nome mittente',{required:false});
  else if(k==='from_email'||k==='smtp_user'){const t=text(v,254,k==='from_email'?'Email mittente':'Utente SMTP');if(k==='from_email'&&!core.EMAIL.test(t))fail(400,'Email mittente non valida.');out[k]=t}
  else if(k==='smtp_host'){const t=text(v,253,'Server SMTP');if(!HOST.test(t))fail(400,'Server SMTP non valido, ad esempio smtp.gmail.com.');out.smtp_host=t.toLowerCase()}
  else if(k==='smtp_port'){if(![25,465,587,2525].includes(v))fail(400,'Porta SMTP: 465, 587, 25 o 2525.');out.smtp_port=v}
  else if(k==='smtp_secure'){if(typeof v!=='boolean')fail(400,'Connessione sicura non valida.');out.smtp_secure=v}
  else if(k==='daily_limit'){if(!Number.isInteger(v)||v<1||v>core.MAX_DAILY)fail(400,'Limite giornaliero: da 1 a '+core.MAX_DAILY+' email.');out.daily_limit=v}
  // App password: Gmail shows it in groups of 4 letters; spaces are not part of it.
  else if(k==='password'){if(typeof v!=='string'||CTRL.test(v)||!v.replace(/\s+/g,'')||v.length>200)fail(400,'Password per le app non valida.');out.password=v.replace(/\s+/g,'')}
 }
 if(creating){for(const k of ['label','from_email','smtp_host','smtp_user','password'])if(!out[k])fail(400,'Compila nome, email mittente, server, utente e password per le app.');
  if(out.smtp_port===undefined)out.smtp_port=465;if(out.smtp_secure===undefined)out.smtp_secure=out.smtp_port===465;if(out.daily_limit===undefined)out.daily_limit=core.MAX_DAILY}
 return out;
}
// POST body → validated command (no database).
function command(body){
 if(!object(body)||Object.keys(body).some(k=>!['workspace','entity','action','data'].includes(k))||!uuid(body.workspace)||!object(body.data))fail(400,'Comando non valido.');
 const {workspace,entity,action}=body,d=body.data;
 const keys=(...allowed)=>{if(Object.keys(d).some(k=>!allowed.includes(k)))fail(400,'Campo non consentito.')};
 if(entity==='mailboxes'){
  if(action==='add'){keys(...MAILBOX_FIELDS);return {workspace,entity,action,data:{id:randomUUID(),...mailboxData(d,true)}}}
  if(action==='update'){keys('id',...MAILBOX_FIELDS);if(!uuid(d.id))fail(400,'Casella non valida.');const rest={...d};delete rest.id;const data=mailboxData(rest,false);if(!Object.keys(data).length)fail(400,'Nessuna modifica.');return {workspace,entity,action,data:{id:d.id,...data}}}
  if(['pause','resume','delete'].includes(action)){keys('id');if(!uuid(d.id))fail(400,'Casella non valida.');return {workspace,entity,action,data:{id:d.id}}}
  if(action==='oauth_start'){keys('label','from_name','daily_limit');const out={label:text(d.label,60,'Nome della casella'),daily_limit:d.daily_limit===undefined?core.MAX_DAILY:d.daily_limit};
   if(d.from_name!==undefined&&d.from_name!=='')out.from_name=text(d.from_name,80,'Nome mittente');
   if(!Number.isInteger(out.daily_limit)||out.daily_limit<1||out.daily_limit>core.MAX_DAILY)fail(400,'Limite al giorno: da 1 a '+core.MAX_DAILY+'.');
   return {workspace,entity,action,data:out}}
  if(action==='test'){keys('id','confirm');if(!uuid(d.id))fail(400,'Casella non valida.');if(d.confirm!==true)fail(400,'Prova non confermata: conferma l’invio nella finestra del CRM.');return {workspace,entity,action,data:{id:d.id}}}
  fail(400,'Azione non valida.');
 }
 if(entity==='send_queue'){
  if(action==='cancel'){keys('campaign');if(!clicks.validCampaign(d.campaign))fail(400,'Campagna non valida.');return {workspace,entity,action,data:{campaign:d.campaign.trim()}}}
  if(!['plan','enqueue'].includes(action))fail(400,'Azione non valida.');
  keys('campaign','subject','body','contacts','origin','mode','step','base','include_unverified',...(action==='enqueue'?['confirm']:[]));
  if(action==='enqueue'&&d.confirm!==true)fail(400,'Coda non confermata: conferma nella finestra del CRM.');
  const mode=d.mode===undefined?'consent':d.mode;
  if(!['consent','b2b'].includes(mode))fail(400,'Modalità non valida.');
  let campaign=d.campaign,b2b=null;
  if(mode==='b2b'){
   // «Prospezione B2B»: the server names the campaign, so the worker knows these rows go without consent.
   const step=d.step===undefined?0:d.step;
   if(!Number.isInteger(step)||step<0||step>prospecting.MAX_FOLLOW_UPS)fail(400,'Passo non valido: primo invio o follow-up 1 e 2 al massimo.');
   if(d.include_unverified!==undefined&&typeof d.include_unverified!=='boolean')fail(400,'Opzione email non verificate non valida.');
   if(step>0&&!clicks.validCampaign(d.base))fail(400,'Scegli la campagna B2B di partenza del follow-up.');
   if(step===0&&!clicks.validCampaign(d.campaign))fail(400,'Nome campagna non valido: fino a 80 caratteri.');
   campaign=prospecting.b2bCampaign(step>0?d.base:d.campaign,step);
   if(!campaign)fail(400,'Nome campagna non valido.');
   b2b={step,include_unverified:d.include_unverified===true,base:prospecting.b2bCampaign(step>0?d.base:d.campaign,0)};
  }else{
   if(d.step!==undefined||d.base!==undefined||d.include_unverified!==undefined)fail(400,'Campo non consentito.');
   if(typeof d.campaign==='string'&&prospecting.parseCampaign(d.campaign.trim()).b2b)fail(400,'Il prefisso «'+prospecting.B2B_PREFIX.trim()+'» è riservato alla prospezione B2B.');
  }
  if(!clicks.validCampaign(campaign))fail(400,'Nome campagna non valido: fino a 80 caratteri.');
  const subject=text(d.subject,200,'Oggetto'),bodyText=text(d.body,4000,'Testo',{multiline:true});
  if(!Array.isArray(d.contacts)||!d.contacts.length||d.contacts.length>MAX_CONTACTS||!d.contacts.every(uuid))fail(400,'Destinatari non validi (da 1 a '+MAX_CONTACTS+' contatti).');
  if(typeof d.origin!=='string'||d.origin.length>200)fail(400,'Origine non valida.');
  return {workspace,entity,action,data:{campaign:campaign.trim(),subject,body:bodyText,contacts:[...new Set(d.contacts)],origin:d.origin,...(b2b?{mode:'b2b',...b2b}:{})}};
 }
 fail(400,'Comando non valido.');
}
function query(q){
 if(Object.keys(q).some(k=>!['entity','workspace','offset'].includes(k))||!uuid(q.workspace))fail(400,'Parametri non validi.');
 return {workspace:q.workspace,entity:q.entity};
}
// The links in the emails point to the same site the request came to (as /api/send-email checks).
function originOf(req,claimed){
 const host=String((req.headers&&(req.headers['x-forwarded-host']||req.headers.host))||'').split(',')[0].trim();
 let u;try{u=new URL(claimed)}catch{fail(400,'Origine non valida.')}
 if(!/^https?:$/.test(u.protocol)||u.host!==host||u.pathname!=='/'||u.search||u.hash)fail(400,'Origine non valida.');
 return u.origin;
}
const roleAdmin=role=>['owner','admin'].includes(role);

// Daily load and latest planned time of each mailbox (planned, being sent or sent, from yesterday on).
async function loadOf(sql,workspace){
 const rows=await sql(`SELECT mailbox_id,to_char(COALESCE(sent_at,scheduled_at) AT TIME ZONE 'Europe/Rome','YYYY-MM-DD') AS day,count(*)::int AS n,${iso('max(scheduled_at)')} AS last_at
  FROM sales_send_queue WHERE workspace_id=$1 AND mailbox_id IS NOT NULL AND status IN ('queued','sending','sent') AND COALESCE(sent_at,scheduled_at)>=now()-interval '2 days' GROUP BY 1,2`,[workspace]);
 const load={},last={};
 for(const r of rows){(load[r.mailbox_id]=load[r.mailbox_id]||{})[r.day]=r.n;const t=new Date(r.last_at).getTime();if(!last[r.mailbox_id]||t>last[r.mailbox_id])last[r.mailbox_id]=t}
 return {load,last};
}
async function listMailboxes(sql,workspace,now){
 const rows=await sql('SELECT '+PUBLIC+' FROM sales_mailboxes WHERE workspace_id=$1 ORDER BY created_at,id',[workspace]);
 const {load}=await loadOf(sql,workspace),today=core.romeDate(now);
 return rows.map(r=>publicMailbox(r,load,today));
}
// Only these keys leave the server.
function publicMailbox(r,load={},today){
 const out={};for(const k of ['id','label','from_name','from_email','smtp_host','smtp_port','smtp_secure','smtp_user','daily_limit','warmup_start','status','last_error','created_at','updated_at','provider'])out[k]=r[k]===undefined?null:r[k];
 out.password_saved=!!(r.password_saved||r.password_ciphertext||r.oauth_ciphertext);
 if(out.provider==='microsoft'){out.smtp_host='Microsoft 365';out.smtp_port=null}
 if(today){out.today_limit=core.rampLimit(r.daily_limit,r.warmup_start,today);out.today_planned=(load[r.id]||{})[today]||0}
 return out;
}

/* Plan for a campaign: recipients (same rules as the campaign panel), skipped, mailboxes, times. */
async function planQueue(sql,c,user,ctx){
 if(c.data.mode==='b2b')return planB2BQueue(sql,c,user,ctx);
 const {req,env,now,random}=ctx;
 const d=c.data,origin=originOf(req,d.origin);
 const all=await sql(`SELECT t.id,t.name,t.role,t.email,t.marketing_consent,t.company_id,t.notes,${optout.OPTED_OUT('t')} AS opted_out,co.name AS company FROM sales_contacts t
  LEFT JOIN sales_companies co ON co.workspace_id=t.workspace_id AND co.id=t.company_id WHERE t.workspace_id=$1 AND t.id=ANY($2::uuid[]) AND ${vis.visible('contacts','t','$1','$3')}`,[c.workspace,d.contacts,user]);
 // Opted-out contacts never get a campaign email, whatever their consent flag says.
 const contacts=all.filter(x=>!prospecting.optedOut(x)),optedOut=all.length-contacts.length;
 // Already in this campaign: these contacts, and these addresses (one email per address).
 const inCampaign=await sql('SELECT q.contact_id,lower(btrim(c.email)) AS email FROM sales_send_queue q JOIN sales_contacts c ON c.workspace_id=q.workspace_id AND c.id=q.contact_id WHERE q.workspace_id=$1 AND q.campaign=$2',[c.workspace,d.campaign]);
 const queued=new Set(inCampaign.map(r=>r.contact_id).filter(id=>d.contacts.includes(id)));
 let plan=campaigns.planCampaign(d.subject,d.body,contacts.filter(x=>!queued.has(x.id)));
 // Two contacts with the same address get one email per campaign.
 const seen=new Set(inCampaign.map(r=>r.email).filter(Boolean));let duplicate=0;plan={...plan,emails:plan.emails.filter(e=>{const k=e.to.trim().toLowerCase();if(seen.has(k)){duplicate++;return false}seen.add(k);return true})};
 const ids=plan.emails.map(e=>e.contact.id),urls=campaigns.urlsIn(d.body),secret=unsubscribe.secretOf(env);
 const links=ids.length?await unsubscribe.links(sql,c.workspace,ids,secret):{};
 const tracked=ids.length&&urls.length?await clicks.links(sql,c.workspace,ids,d.campaign,urls,secret):null;
 plan=campaigns.withUnsubscribe(campaigns.withTracking(plan,tracked,urls,d.campaign,origin),links,origin);
 const mailboxes=await sql('SELECT id,label,from_email,daily_limit,warmup_start::text AS warmup_start,status FROM sales_mailboxes WHERE workspace_id=$1 ORDER BY created_at,id',[c.workspace]);
 const {load,last}=await loadOf(sql,c.workspace);
 const sched=core.schedule({count:plan.emails.length,mailboxes,load,last,now,random});
 const used=mailboxes.filter(m=>sched.perMailbox[m.id]).map(m=>({id:m.id,label:m.label,from_email:m.from_email,emails:sched.perMailbox[m.id]}));
 const summary={campaign:d.campaign,recipients:plan.emails.length,skipped:{consent:plan.skipped.consent,optout:optedOut,email:plan.skipped.email,link:plan.skipped.link||0,duplicate,already:queued.size,missing:d.contacts.length-all.length},
  mailboxes:used,active_mailboxes:mailboxes.filter(m=>m.status==='active').length,days:sched.days.length,first_at:sched.slots[0]?new Date(sched.slots[0].at).toISOString():null,last_at:sched.slots.length?new Date(sched.slots[sched.slots.length-1].at).toISOString():null,unplanned:sched.unplanned};
 return {summary,emails:plan.emails,slots:sched.slots};
}
// Issuer data of the workspace (Impostazioni › Documenti, migration 013): who writes, in every B2B footer.
async function issuerOf(sql,workspace){
 // The letterhead lives in the jsonb column «issuer» (migration 013), not in columns of its own.
 try{const r=(await sql('SELECT issuer FROM sales_document_settings WHERE workspace_id=$1',[workspace]))[0];return r&&r.issuer&&typeof r.issuer==='object'?r.issuer:null}
 catch(e){if(e&&e.code==='42P01')return null;throw e}
}
/* «Prospezione B2B»: contacts without marketing consent too, only with the rules of sales/crm-prospecting-core.js
   (business address, not opted out, Dropcontact «nominative@pro» unless unverified ones are allowed, one first email per
   90 days, follow-ups only 3+ days after the previous step and never after a reply). No click tracking; the fixed
   footer (sender, why, data source, opt-out link) closes every email. Same queue, mailboxes and limits. */
async function planB2BQueue(sql,c,user,{req,env,now,random}){
 const d=c.data,origin=originOf(req,d.origin),w=c.workspace;
 const all=await sql(`SELECT t.id,t.name,t.role,t.email,t.marketing_consent,t.company_id,t.notes,t.linkedin_url,${optout.OPTED_OUT('t')} AS opted_out,${optout.LAST_REPLY('t')} AS last_reply_at,co.name AS company FROM sales_contacts t
  LEFT JOIN sales_companies co ON co.workspace_id=t.workspace_id AND co.id=t.company_id WHERE t.workspace_id=$1 AND t.id=ANY($2::uuid[]) AND ${vis.visible('contacts','t','$1','$3')}`,[w,d.contacts,user]);
 const issuer=await issuerOf(sql,w);
 const inCampaign=await sql('SELECT q.contact_id,lower(btrim(c.email)) AS email FROM sales_send_queue q JOIN sales_contacts c ON c.workspace_id=q.workspace_id AND c.id=q.contact_id WHERE q.workspace_id=$1 AND q.campaign=$2',[w,d.campaign]);
 const queued=new Set(inCampaign.map(r=>r.contact_id).filter(id=>d.contacts.includes(id)));
 const rules={step:d.step,includeUnverified:d.include_unverified,now};
 if(d.step===0){
  // Prospected in the last 90 days (any B2B campaign, queued or sent), by contact and by address.
  const r=await sql(`SELECT DISTINCT q.contact_id,lower(btrim(c.email)) AS email FROM sales_send_queue q JOIN sales_contacts c ON c.workspace_id=q.workspace_id AND c.id=q.contact_id
   WHERE q.workspace_id=$1 AND left(q.campaign,${prospecting.B2B_PREFIX.length})=$2 AND q.campaign<>$3 AND q.status IN ('queued','sending','sent') AND COALESCE(q.sent_at,q.scheduled_at)>=now()-make_interval(days=>$4::int)`,[w,prospecting.B2B_PREFIX,d.campaign,prospecting.WINDOW_DAYS]);
  rules.recent=new Set(r.flatMap(x=>[x.contact_id,x.email].filter(Boolean)));
 }else{
  const prev=d.step===1?d.base:prospecting.b2bCampaign(d.base,d.step-1);
  const r=await sql(`SELECT contact_id,campaign,${iso('sent_at')} AS sent_at FROM sales_send_queue WHERE workspace_id=$1 AND campaign=ANY($2::text[]) AND status='sent'`,[w,[d.base,prev]]);
  rules.firstSent=new Map(r.filter(x=>x.campaign===d.base).map(x=>[x.contact_id,Date.parse(x.sent_at)]));
  rules.prevSent=new Map(r.filter(x=>x.campaign===prev).map(x=>[x.contact_id,Date.parse(x.sent_at)]));
 }
 let plan=prospecting.planB2B(d.subject,d.body,all.filter(x=>!queued.has(x.id)),rules);
 const seen=new Set(inCampaign.map(r=>r.email).filter(Boolean));let duplicate=0;
 plan={...plan,emails:plan.emails.filter(e=>{const k=e.to.trim().toLowerCase();if(seen.has(k)){duplicate++;return false}seen.add(k);return true})};
 const ids=plan.emails.map(e=>e.contact.id),links=ids.length?await unsubscribe.links(sql,w,ids,unsubscribe.secretOf(env)):{};
 let missingLink=0;plan.emails=plan.emails.filter(e=>{if(links[e.contact.id])return true;missingLink++;return false});
 const mailboxes=await sql('SELECT id,label,from_name,from_email,daily_limit,warmup_start::text AS warmup_start,status FROM sales_mailboxes WHERE workspace_id=$1 ORDER BY created_at,id',[w]);
 const {load,last}=await loadOf(sql,w);
 const sched=core.schedule({count:plan.emails.length,mailboxes,load,last,now,random});
 const byId=new Map(mailboxes.map(m=>[m.id,m])),fallback=mailboxes.find(m=>m.status==='active')||mailboxes[0]||{};
 // The footer goes on last, with the sender of the mailbox that will send it; the text above is cut to make room.
 const emails=plan.emails.map((e,i)=>{const url=origin+'/api/sales?unsubscribe='+links[e.contact.id],sender=(sched.slots[i]&&byId.get(sched.slots[i].mailbox))||fallback;
  const foot=prospecting.footer({issuer,sender,contact:e.contact,url});return {...e,body:prospecting.withFooter(e.body,foot),unsubscribeUrl:url,footer:foot}});
 const used=mailboxes.filter(m=>sched.perMailbox[m.id]).map(m=>({id:m.id,label:m.label,from_email:m.from_email,emails:sched.perMailbox[m.id]}));
 const sampleFoot=emails[0]?emails[0].footer:prospecting.footer({issuer,sender:fallback,contact:{company:'{azienda}'},url:origin+'/api/sales?unsubscribe=…'});
 const summary={campaign:d.campaign,mode:'b2b',step:d.step,base:d.base,recipients:emails.length,
  skipped:{consent:0,...plan.skipped,link:missingLink,duplicate,already:queued.size,missing:d.contacts.length-all.length},
  issuer_ready:prospecting.issuerReady(issuer),footer_preview:sampleFoot.replace(/^\n+/,''),
  mailboxes:used,active_mailboxes:mailboxes.filter(m=>m.status==='active').length,days:sched.days.length,first_at:sched.slots[0]?new Date(sched.slots[0].at).toISOString():null,last_at:sched.slots.length?new Date(sched.slots[sched.slots.length-1].at).toISOString():null,unplanned:sched.unplanned};
 return {summary,emails,slots:sched.slots};
}
async function enqueue(sql,c,user,ctx){
 const p=await planQueue(sql,c,user,ctx);
 if(c.data.mode==='b2b'&&!p.summary.issuer_ready)fail(400,'Prima della prospezione B2B compila l’intestazione in Impostazioni › Documenti (ragione sociale e indirizzo): compaiono in fondo a ogni email.');
 if(!p.summary.active_mailboxes)fail(400,'Nessuna casella attiva: collegane una in «Caselle email» prima di mettere in coda.');
 if(!p.summary.recipients)return {...p.summary,queued:0};
 if(p.summary.unplanned)fail(400,'Troppi destinatari per le caselle collegate: '+p.summary.unplanned+' email resterebbero fuori dai prossimi mesi. Riduci il segmento o collega altre caselle.');
 let inserted=0;
 for(let i=0;i<p.emails.length;i+=500){
  const rows=p.emails.slice(i,i+500).map((e,j)=>{const s=p.slots[i+j];return {contact_id:e.contact.id,mailbox_id:s.mailbox,subject:e.subject,body:e.body,unsubscribe_url:e.unsubscribeUrl,scheduled_at:new Date(s.at).toISOString()}});
  const r=await sql(`INSERT INTO sales_send_queue(workspace_id,campaign,contact_id,mailbox_id,subject,body,unsubscribe_url,scheduled_at,created_by)
   SELECT $1,$2,x.contact_id,x.mailbox_id,x.subject,x.body,x.unsubscribe_url,x.scheduled_at,$3 FROM jsonb_to_recordset($4::jsonb) AS x(contact_id uuid,mailbox_id uuid,subject text,body text,unsubscribe_url text,scheduled_at timestamptz)
   ON CONFLICT (workspace_id,campaign,contact_id) DO NOTHING RETURNING id`,[c.workspace,c.data.campaign,user,JSON.stringify(rows)]);
  inserted+=r.length;
 }
 return {...p.summary,queued:inserted};
}
async function status(sql,workspace,user){
 return sql(`SELECT campaign,count(*) FILTER (WHERE status IN ('queued','sending'))::int AS queued,count(*) FILTER (WHERE status='sent')::int AS sent,count(*) FILTER (WHERE status='failed')::int AS failed,
  count(*) FILTER (WHERE status='skipped')::int AS skipped,count(*) FILTER (WHERE status='cancelled')::int AS cancelled,${iso("min(scheduled_at) FILTER (WHERE status='queued')")} AS next_at,
  ${iso("max(scheduled_at) FILTER (WHERE status='queued')")} AS last_at,${iso('max(sent_at)')} AS last_sent_at,(array_agg(error ORDER BY updated_at DESC) FILTER (WHERE status='failed'))[1] AS last_error
  FROM sales_send_queue q WHERE workspace_id=$1 AND ${vis.contact('q.contact_id','$1','$2')} GROUP BY campaign ORDER BY max(created_at) DESC LIMIT 50`,[workspace,user]);
}

// Lazy, so tests and pages that never send do not load nodemailer.
const defaultTransport=opts=>require('nodemailer').createTransport(opts);
function transportOptions(m,pass){return {host:m.smtp_host,port:m.smtp_port,secure:!!m.smtp_secure,auth:{user:m.smtp_user,pass},connectionTimeout:15000,greetingTimeout:10000,socketTimeout:20000}}
const fromOf=m=>m.from_name?{name:m.from_name,address:m.from_email}:m.from_email;

async function mailboxCommand(sql,c,user,{env,now,createTransport=defaultTransport,req,fetchImpl}){
 const d=c.data,w=c.workspace;
 const one=async()=>{const r=await sql('SELECT '+PUBLIC+' FROM sales_mailboxes WHERE workspace_id=$1 AND id=$2',[w,d.id]);if(!r.length)fail(404,'Casella non trovata.');return r[0]};
 const audit=(id,action,detail)=>sql('INSERT INTO sales_audit(workspace_id,actor_id,entity,entity_id,action,detail) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[w,user,'mailboxes',id,action,JSON.stringify(detail||{})]);
 const dup=e=>{if(e&&e.code==='23505')fail(409,'Questa email mittente è già collegata al workspace.');throw e};
 if(c.action==='add'){
  const enc=mcrypto.encrypt(d.password,{workspace:w,id:d.id},env);
  const r=await sql(`INSERT INTO sales_mailboxes(workspace_id,id,label,from_name,from_email,smtp_host,smtp_port,smtp_secure,smtp_user,password_ciphertext,password_iv,password_tag,daily_limit,created_by)
   SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14 WHERE (SELECT count(*) FROM sales_mailboxes WHERE workspace_id=$1)<$15 RETURNING id`,
   [w,d.id,d.label,d.from_name||null,d.from_email,d.smtp_host,d.smtp_port,d.smtp_secure,d.smtp_user,enc.password_ciphertext,enc.password_iv,enc.password_tag,d.daily_limit,user,core.MAX_MAILBOXES]).catch(dup);
  if(!r.length)fail(409,'Massimo '+core.MAX_MAILBOXES+' caselle per workspace: eliminane una prima di aggiungerne un’altra.');
  await audit(d.id,'create',{from_email:d.from_email,smtp_host:d.smtp_host});
  return publicMailbox(await one());
 }
 if(c.action==='oauth_start'){
  if(!msoauth.configured(env))fail(503,'Accesso Microsoft non ancora configurato sul server: mancano MS_CLIENT_ID e MS_CLIENT_SECRET nelle variabili d’ambiente.');
  if(!mcrypto.configured(env))throw new mcrypto.MailboxKeyError();
  const n=(await sql('SELECT count(*)::int AS n FROM sales_mailboxes WHERE workspace_id=$1',[w]))[0].n;
  if(n>=core.MAX_MAILBOXES)fail(409,'Massimo '+core.MAX_MAILBOXES+' caselle per workspace: eliminane una prima di aggiungerne un’altra.');
  const host=String((req.headers&&(req.headers['x-forwarded-host']||req.headers.host))||'').split(',')[0].trim();
  if(!/^[a-z0-9.-]+(:\d+)?$/i.test(host))fail(400,'Origine non valida.');
  const redirectUri=msoauth.redirectOf(env,(/^localhost|^127\./.test(host)?'http://':'https://')+host);
  const state=msoauth.signState(env.JWT_SECRET,{w,u:user,l:d.label,f:d.from_name||null,d:d.daily_limit,r:redirectUri},now);
  return {oauth_url:msoauth.authorizeUrl(env,{redirectUri,state})};
 }
 const before=await one();
 if(c.action==='update'){
  const set=[],vals=[w,d.id];const put=(col,v)=>{vals.push(v);set.push(col+'=$'+vals.length)};
  for(const k of ['label','from_name','from_email','smtp_host','smtp_port','smtp_secure','smtp_user','daily_limit'])if(Object.hasOwn(d,k))put(k,d[k]);
  if(d.password){const enc=mcrypto.encrypt(d.password,{workspace:w,id:d.id},env);for(const k of ['password_ciphertext','password_iv','password_tag'])put(k,enc[k]);set.push("auth_failures=0,last_error=NULL,status=CASE WHEN status='error' THEN 'active' ELSE status END")}
  await sql('UPDATE sales_mailboxes SET '+set.join(',')+',updated_at=now() WHERE workspace_id=$1 AND id=$2',vals).catch(dup);
  await audit(d.id,'update',{fields:Object.keys(d).filter(k=>k!=='id'&&k!=='password').concat(d.password?['password']:[])});
  return publicMailbox(await one());
 }
 if(c.action==='pause'||c.action==='resume'){
  await sql(c.action==='pause'?"UPDATE sales_mailboxes SET status='paused',updated_at=now() WHERE workspace_id=$1 AND id=$2":"UPDATE sales_mailboxes SET status='active',auth_failures=0,last_error=NULL,updated_at=now() WHERE workspace_id=$1 AND id=$2",[w,d.id]);
  await audit(d.id,c.action,{});return publicMailbox(await one());
 }
 if(c.action==='delete'){
  // Its queued emails are cancelled, not moved: the user decides whether to queue them again.
  const cancelled=await sql("UPDATE sales_send_queue SET status='cancelled',error='Casella eliminata.',updated_at=now() WHERE workspace_id=$1 AND mailbox_id=$2 AND status='queued' RETURNING id",[w,d.id]);
  await sql('DELETE FROM sales_mailboxes WHERE workspace_id=$1 AND id=$2',[w,d.id]);
  await audit(d.id,'delete',{from_email:before.from_email,cancelled:cancelled.length});
  return {id:d.id,deleted:true,cancelled:cancelled.length};
 }
 if(c.action==='test'){
  const me=(await sql('SELECT email FROM users WHERE id=$1',[user]))[0];
  if(!me||!core.EMAIL.test(String(me.email||'')))fail(400,'Il tuo account non ha un indirizzo email valido.');
  const full=(await sql('SELECT * FROM sales_mailboxes WHERE workspace_id=$1 AND id=$2',[w,d.id]))[0];
  if(full.provider==='microsoft'){
   try{
    let rt;try{rt=msoauth.openToken(full,env)}catch(e){fail(409,e.message)}
    const t=await msoauth.refresh(env,rt,fetchImpl);
    if(t.refresh_token&&t.refresh_token!==rt){const e=msoauth.sealToken(t.refresh_token,w,d.id,env);await sql('UPDATE sales_mailboxes SET oauth_ciphertext=$3,oauth_iv=$4,oauth_tag=$5 WHERE workspace_id=$1 AND id=$2',[w,d.id,e.oauth_ciphertext,e.oauth_iv,e.oauth_tag])}
    await msoauth.sendMail(t.access_token,{to:me.email,subject:'Prova invio da RADIX · '+full.label,text:'Questa è una email di prova inviata da RADIX con la casella «'+full.label+'» ('+full.from_email+').\nSe la leggi, la casella è collegata correttamente e può inviare le campagne in coda.'},fetchImpl);
   }catch(e){
    if(e instanceof QueueError)throw e;
    const error=core.cleanError(e);
    await sql("UPDATE sales_mailboxes SET last_error=$3,updated_at=now() WHERE workspace_id=$1 AND id=$2",[w,d.id,'Prova non riuscita: '+error]);
    return {ok:false,to:me.email,error,mailbox:publicMailbox(await one())};
   }
   await sql("UPDATE sales_mailboxes SET last_error=NULL,auth_failures=0,status=CASE WHEN status='error' THEN 'active' ELSE status END,updated_at=now() WHERE workspace_id=$1 AND id=$2",[w,d.id]);
   return {ok:true,to:me.email,mailbox:publicMailbox(await one())};
  }
  let pass;try{pass=mcrypto.decrypt(full,env)}catch(e){fail(409,e.message)}
  try{
   await createTransport(transportOptions(full,pass)).sendMail({from:fromOf(full),to:me.email,subject:'Prova invio da RADIX · '+full.label,text:'Questa è una email di prova inviata da RADIX con la casella «'+full.label+'» ('+full.from_email+').\nSe la leggi, la casella è collegata correttamente e può inviare le campagne in coda.'});
  }catch(e){
   const error=core.cleanError(e,pass);
   await sql("UPDATE sales_mailboxes SET last_error=$3,updated_at=now() WHERE workspace_id=$1 AND id=$2",[w,d.id,'Prova non riuscita: '+error]);
   return {ok:false,to:me.email,error,mailbox:publicMailbox(await one())};
  }
  await sql("UPDATE sales_mailboxes SET last_error=NULL,auth_failures=0,status=CASE WHEN status='error' THEN 'active' ELSE status END,updated_at=now() WHERE workspace_id=$1 AND id=$2",[w,d.id]);
  return {ok:true,to:me.email,mailbox:publicMailbox(await one())};
 }
 fail(400,'Azione non valida.');
}

// Called by api/_sales.js after membership is known. Returns the JSON body.
async function handle(c,opts){
 try{return await run(c,opts)}
 catch(e){if(e&&e.code==='42P01')fail(503,'Caselle email e coda invii non ancora disponibili in questo archivio: servono le migrazioni sales 016 e 017 (da approvare).');throw e}
}
async function run(c,{sql,user,role,req,env=process.env,now=Date.now(),random=Math.random,createTransport,fetchImpl}){
 if(req.method==='GET'){
  if(c.entity==='mailboxes'){const rows=await listMailboxes(sql,c.workspace,now);return {rows,max:core.MAX_MAILBOXES,encryption:mcrypto.configured(env),microsoft:msoauth.configured(env),can_manage:roleAdmin(role)}}
  return {rows:await status(sql,c.workspace,user)};
 }
 if(c.entity==='mailboxes'){
  if(!roleAdmin(role))fail(403,'Solo owner e admin gestiscono le caselle email.');
  return {rows:[await mailboxCommand(sql,c,user,{env,now,createTransport,req,fetchImpl})]};
 }
 if(!['owner','admin','member'].includes(role))fail(403,'Permessi insufficienti.');
 if(c.action==='cancel'){const r=await sql("UPDATE sales_send_queue q SET status='cancelled',error='Annullata dall’utente.',updated_at=now() WHERE workspace_id=$1 AND campaign=$2 AND status='queued' AND "+vis.contact('q.contact_id','$1','$3')+" RETURNING id",[c.workspace,c.data.campaign,user]);return {rows:[{campaign:c.data.campaign,cancelled:r.length}]}}
 const ctx={req,env,now,random};
 if(c.action==='plan')return {rows:[(await planQueue(sql,c,user,ctx)).summary]};
 return {rows:[await enqueue(sql,c,user,ctx)]};
}
module.exports={command,query,handle,publicMailbox,originOf,transportOptions,fromOf,mailboxData,ENTITIES:['mailboxes','send_queue'],MAX_CONTACTS,PUBLIC};
