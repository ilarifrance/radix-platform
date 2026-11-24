'use strict';
/* «Calendario da abbonare»: the CRM appointments of one person as an iCalendar feed (RFC 5545) that Outlook / Microsoft 365
   («Aggiungi calendario › Da Internet») and Google Calendar («Altri calendari › Da URL») subscribe to and refresh by themselves.
   GET /api/sales?calendar=<token>, no session: the token in the link is the permission, like the unsubscribe link.
   Content: the person's open tasks with a due date (assigned to them) and the calls and meetings they recorded or that sit on
   their opportunities, from 14 days ago to 90 days ahead; «I member vedono solo i propri record» applies as in every read.
   Token (no table): version byte 1 · user id (4 bytes) · workspace id (16 bytes) · generation (2 bytes) · first 16 bytes of
   HMAC-SHA256 over them, base64url (52 characters). Key: HMAC(CALENDAR_FEED_SECRET or JWT_SECRET, 'radix-crm-calendar-feed-v1'),
   a key of its own, so a feed link is never a session or an unsubscribe token. The link is the same every time it is shown.
   Revocation: removing the person from the workspace stops the feed at once (membership is checked on every request);
   setting or rotating CALENDAR_FEED_SECRET stops every link; `generation` is there so a per-user revocation (a counter
   stored per user) can be added later without changing the format. Nothing is written by this endpoint. */
const crypto=require('node:crypto');
const ics=require('../sales/crm-ics-core.js');
const vis=require('./_sales_visibility');
const DAY=864e5;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAST_DAYS=14,AHEAD_DAYS=90,MAX_ROWS=500;
const secretOf=env=>(env||{}).CALENDAR_FEED_SECRET||(env||{}).JWT_SECRET;
const key=secret=>{if(typeof secret!=='string'||secret.length<16)throw new Error('JWT_SECRET is not set in the environment.');return crypto.createHmac('sha256',secret).update('radix-crm-calendar-feed-v1').digest()};
const mac=(secret,body)=>crypto.createHmac('sha256',key(secret)).update(body).digest().subarray(0,16);
const toUuid=b=>{const h=b.toString('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20)};
function sign(secret,{uid,workspace,generation=0}){
 if(!Number.isInteger(uid)||uid<1||uid>2147483647||!UUID.test(workspace||'')||!Number.isInteger(generation)||generation<0||generation>65535)throw new Error('invalid feed owner');
 const body=Buffer.alloc(23);body[0]=1;body.writeUInt32BE(uid,1);Buffer.from(workspace.replace(/-/g,''),'hex').copy(body,5);body.writeUInt16BE(generation,21);
 return Buffer.concat([body,mac(secret,body)]).toString('base64url');
}
function verify(secret,token){
 if(typeof token!=='string'||!/^[A-Za-z0-9_-]{52}$/.test(token))return null;
 const raw=Buffer.from(token,'base64url');if(raw.length!==39||raw[0]!==1)return null;
 const body=raw.subarray(0,23);if(!crypto.timingSafeEqual(mac(secret,body),raw.subarray(23)))return null;
 const uid=body.readUInt32BE(1);if(uid<1||uid>2147483647)return null;
 return {uid,workspace:toUuid(body.subarray(5,21)),generation:body.readUInt16BE(21)};
}

/* ---------- Feed text (pure) ---------- */
const utc=ms=>new Date(ms).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
const clean=v=>String(v==null?'':v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim();
// The CRM link of a record: the contact's Customer360 when there is a contact (radix-sales.html opens it), else the list.
function link(base,workspace,row,fallback){
 if(!base)return '';
 const q=new URLSearchParams({ws:workspace});if(row.contact_id){q.set('contatto',row.contact_id);return base+'/radix-sales.html?'+q+'#contacts'}
 return base+'/radix-sales.html?'+q+'#'+fallback;
}
// One row of tasks or interactions (with contact_name, contact_phone, contact_mobile, company_name, company_phone) → event.
function event(kind,row,{workspace,base}){
 const title=clean(row.title)||(kind==='task'?'Attività':'Interazione'),who=clean(row.contact_name);
 const start=Date.parse(kind==='task'?row.due_at:row.occurred_at);if(!Number.isFinite(start))return null;
 const minutes=kind==='task'?(/^appuntamento\b/i.test(title)?60:30):(row.kind==='meeting'?60:30);
 const lines=[];
 if(clean(row.company_name))lines.push('Azienda: '+clean(row.company_name));
 if(who)lines.push('Contatto: '+who);
 for(const [label,v] of [['Telefono',row.contact_phone],['Cellulare',row.contact_mobile],['Telefono azienda',row.company_phone]])if(clean(v))lines.push(label+': '+clean(v));
 if(kind!=='task'&&clean(row.body))lines.push('',clean(row.body).slice(0,1500));
 const url=link(base,workspace,row,kind==='task'?'tasks':'interactions');
 if(url)lines.push('','Apri in RADIX: '+url);
 return {uid:(kind==='task'?'task-':'interaction-')+row.id+'@feed.radix-crm',start,end:start+minutes*6e4,
  summary:(who?'☎ '+who+' · ':'')+title,description:lines.join('\n'),url};
}
// rows: {tasks, interactions, workspaceName}; opts: {now, base, workspace} → the .ics text (CRLF, folded at 75 octets).
function build(rows,opts){
 const o=opts||{},now=Number.isFinite(o.now)?o.now:Date.now(),stamp=utc(now);
 const list=[...(rows.tasks||[]).map(r=>event('task',r,o)),...(rows.interactions||[]).map(r=>event('interaction',r,o))].filter(Boolean).sort((a,b)=>a.start-b.start||(a.uid<b.uid?-1:1));
 const name='RADIX CRM'+(clean(rows.workspaceName)?' · '+clean(rows.workspaceName):'');
 const L=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//RADIX//CRM Calendario abbonato//IT','CALSCALE:GREGORIAN','METHOD:PUBLISH',
  'X-WR-CALNAME:'+ics.esc(name),'X-WR-TIMEZONE:Europe/Rome','X-WR-CALDESC:'+ics.esc('Appuntamenti, richiami e attività del CRM RADIX. Si aggiorna da solo: le modifiche si fanno nel CRM.'),
  'REFRESH-INTERVAL;VALUE=DURATION:PT1H','X-PUBLISHED-TTL:PT1H'];
 for(const e of list){
  L.push('BEGIN:VEVENT','UID:'+e.uid,'DTSTAMP:'+stamp,'DTSTART:'+utc(e.start),'DTEND:'+utc(e.end),'SUMMARY:'+ics.esc(e.summary));
  if(e.description)L.push('DESCRIPTION:'+ics.esc(e.description));
  if(e.url)L.push('URL:'+e.url);
  L.push('STATUS:CONFIRMED','TRANSP:OPAQUE','END:VEVENT');
 }
 L.push('END:VCALENDAR');
 return {count:list.length,text:L.map(ics.fold).join('\r\n')+'\r\n'};
}

/* ---------- Reads ---------- */
const MINE_INTERACTION="(t.created_by=$2 OR EXISTS(SELECT 1 FROM sales_opportunities o WHERE o.workspace_id=t.workspace_id AND o.id=t.opportunity_id AND (o.owner_id=$2 OR o.created_by=$2)))";
const JOINS="LEFT JOIN sales_contacts c ON c.workspace_id=t.workspace_id AND c.id=t.contact_id LEFT JOIN sales_companies co ON co.workspace_id=t.workspace_id AND co.id=coalesce(t.company_id,c.company_id)";
const COLS="t.id,t.title,c.id AS contact_id,c.name AS contact_name,c.phone AS contact_phone,to_jsonb(c)->>'mobile' AS contact_mobile,co.name AS company_name,co.phone AS company_phone";
async function read(sql,workspace,uid){
 const window=`now()-interval '${PAST_DAYS} days' AND now()+interval '${AHEAD_DAYS} days'`;
 const [tasks,interactions,ws]=await Promise.all([
  sql(`SELECT ${COLS},t.due_at FROM sales_tasks t ${JOINS} WHERE t.workspace_id=$1 AND t.assignee_id=$2 AND t.status<>'done' AND t.due_at BETWEEN ${window}${vis.and('tasks')} ORDER BY t.due_at,t.id LIMIT ${MAX_ROWS}`,[workspace,uid]),
  sql(`SELECT ${COLS},t.kind,t.body,t.occurred_at FROM sales_interactions t ${JOINS} WHERE t.workspace_id=$1 AND t.kind IN ('call','meeting') AND t.occurred_at BETWEEN ${window} AND ${MINE_INTERACTION}${vis.and('interactions')} ORDER BY t.occurred_at,t.id LIMIT ${MAX_ROWS}`,[workspace,uid]),
  sql('SELECT name FROM sales_workspaces WHERE id=$1',[workspace])]);
 return {tasks,interactions,workspaceName:ws[0]?.name||''};
}
function origin(req,env){
 const fixed=String((env||{}).PUBLIC_BASE_URL||'').trim().replace(/\/+$/,'');if(/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(fixed))return fixed;
 const host=String(req.headers?.['x-forwarded-host']||req.headers?.host||'').split(',')[0].trim();
 if(!/^[a-z0-9.-]+(:\d+)?$/i.test(host))return '';
 const proto=String(req.headers?.['x-forwarded-proto']||'https').split(',')[0].trim()==='http'?'http':'https';
 return proto+'://'+host;
}
function plain(res,status,text){res.setHeader('Content-Type','text/plain; charset=utf-8');res.setHeader('Cache-Control','no-store');res.status(status).send(text)}
async function handle(req,res,{getStore,secret,env=process.env,now=Date.now()}){
 res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('X-Content-Type-Options','nosniff');
 if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');return plain(res,405,'Metodo non consentito.')}
 let who;try{who=verify(secret,req.query?.calendar)}catch{return plain(res,503,'Calendario non disponibile in questo momento.')}
 if(!who)return plain(res,404,'Calendario non trovato: copia di nuovo il link dal CRM (Calendario › Calendario da abbonare).');
 try{
  const store=getStore();const m=await store.membership(who.workspace,who.uid);
  if(!m||!['owner','admin','member','viewer'].includes(m.role))return plain(res,404,'Calendario non trovato: copia di nuovo il link dal CRM (Calendario › Calendario da abbonare).');
  const f=build(await read(store.sql,who.workspace,who.uid),{now,base:origin(req,env),workspace:who.workspace});
  res.setHeader('Content-Type','text/calendar; charset=utf-8');res.setHeader('Content-Disposition','inline; filename="radix-crm.ics"');
  // Calendar programs poll: a short private cache is enough, and nothing is stored by shared caches.
  res.setHeader('Cache-Control','private, max-age=300');
  if(req.method==='HEAD')return res.status(200).end();
  return res.status(200).send(f.text);
 }catch(e){console.error('calendar feed failed',e&&e.code);return plain(res,503,'Calendario non disponibile in questo momento: riprova più tardi.')}
}
module.exports={sign,verify,build,event,handle,read,secretOf,origin,PAST_DAYS,AHEAD_DAYS};
