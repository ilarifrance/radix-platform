'use strict';
/* «Calendari esterni» in /api/sales (migration sales 018): each person's own Outlook / Google iCal links.
   entity «calendar_sources»: list (GET) and add, update, delete, refresh (POST). Every statement filters on the caller's
   user id: a link is visible and changeable only by the person who saved it, owners and admins included. The link is
   encrypted before it reaches the database (api/_calendar_sources_crypto.js) and never returned: rows say only the host
   and url_saved:true.
   entity «calendar_busy» (GET, from/to as UTC ISO, at most 62 days): the caller's busy intervals from all their links,
   read on the server (api/_calendar_fetch.js) and parsed by sales/crm-freebusy-core.js. Titles are included only for
   links with show_details. Each link is read at most once every 5 minutes per server instance (in-memory cache). */
const {randomUUID}=require('node:crypto');
const scrypto=require('./_calendar_sources_crypto');
const cfetch=require('./_calendar_fetch');
const fb=require('../sales/crm-freebusy-core.js');
class CalendarError extends Error{constructor(status,message){super(message);this.status=status}}
const fail=(s,m)=>{throw new CalendarError(s,m)};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuid=v=>typeof v==='string'&&UUID.test(v);
const object=v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const ENTITIES=Object.freeze(['calendar_sources','calendar_busy']);
const MAX_SOURCES=5,MAX_RANGE_DAYS=62,CACHE_MS=5*60e3,CACHE_MAX=100;
const iso=x=>`to_char((${x}) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')`;
// Columns a browser may see: never the encrypted link.
const PUBLIC=`id,label,provider,url_host AS host,show_details,status,last_error,${iso('last_fetched_at')} AS last_fetched_at,${iso('created_at')} AS created_at,true AS url_saved`;
const ISO=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

function label(v){if(typeof v!=='string'||/[\u0000-\u001f\u007f]/.test(v)||!v.trim()||v.trim().length>60)fail(400,'Nome del calendario: da 1 a 60 caratteri, ad esempio «Outlook lavoro».');return v.trim()}
function sourceData(d,creating){
 const out={};
 for(const k of Object.keys(d)){const v=d[k];
  if(k==='label')out.label=label(v);
  else if(k==='show_details'){if(typeof v!=='boolean')fail(400,'Scelta «mostra i titoli» non valida.');out.show_details=v}
  else if(k==='url'){const c=cfetch.checkUrl(v);if(c.error)fail(400,c.error);out.url=c.url;out.url_host=c.host;out.provider=c.provider}}
 if(creating&&(!out.label||!out.url))fail(400,'Indica un nome e il link del calendario.');
 return out;
}
// POST body → validated command (no database).
function command(body){
 if(!object(body)||Object.keys(body).some(k=>!['workspace','entity','action','data'].includes(k))||!uuid(body.workspace)||!object(body.data)||body.entity!=='calendar_sources')fail(400,'Comando non valido.');
 const {workspace,action}=body,d=body.data;const keys=(...a)=>{if(Object.keys(d).some(k=>!a.includes(k)))fail(400,'Campo non consentito.')};
 if(action==='add'){keys('label','url','show_details');return {workspace,entity:'calendar_sources',action,data:{id:randomUUID(),...sourceData(d,true)}}}
 if(action==='update'){keys('id','label','url','show_details');if(!uuid(d.id))fail(400,'Calendario non valido.');const rest={...d};delete rest.id;const data=sourceData(rest,false);if(!Object.keys(data).length)fail(400,'Nessuna modifica.');return {workspace,entity:'calendar_sources',action,data:{id:d.id,...data}}}
 if(action==='delete'||action==='refresh'){keys('id');if(!uuid(d.id))fail(400,'Calendario non valido.');return {workspace,entity:'calendar_sources',action,data:{id:d.id}}}
 fail(400,'Azione non valida.');
}
// GET query → validated read.
function query(q){
 if(q.entity==='calendar_sources'){if(Object.keys(q).some(k=>!['entity','workspace','offset'].includes(k))||!uuid(q.workspace)||(q.offset!==undefined&&q.offset!=='0'))fail(400,'Parametri calendari non validi.');return {workspace:q.workspace,entity:'calendar_sources'}}
 if(q.entity==='calendar_busy'){
  if(Object.keys(q).some(k=>!['entity','workspace','from','to','offset'].includes(k))||!uuid(q.workspace)||typeof q.from!=='string'||typeof q.to!=='string'||!ISO.test(q.from)||!ISO.test(q.to))fail(400,'Intervallo non valido: from e to in UTC (YYYY-MM-DDTHH:MM:SSZ).');
  const from=Date.parse(q.from),to=Date.parse(q.to);if(!(to>from)||to-from>MAX_RANGE_DAYS*864e5)fail(400,'Intervallo non valido: al massimo '+MAX_RANGE_DAYS+' giorni.');
  return {workspace:q.workspace,entity:'calendar_busy',from,to};
 }
 fail(400,'Risorsa non valida.');
}

/* ---------- Reading the links (cache per server instance) ---------- */
const cache=new Map();
function cached(key){const c=cache.get(key);if(c&&Date.now()-c.at<CACHE_MS)return c.text;if(c)cache.delete(key);return null}
function remember(key,text){if(cache.size>=CACHE_MAX)cache.delete(cache.keys().next().value);cache.set(key,{at:Date.now(),text})}
async function readSource(sql,row,{env,fetchIcs,force}){
 const key=row.workspace_id+':'+row.id+':'+row.updated_at;
 const hit=force?null:cached(key);if(hit!==null)return {text:hit,fresh:false};
 let text;
 try{text=await fetchIcs(scrypto.decrypt(row,env))}
 catch(e){const msg=String(e&&e.message||'Calendario non leggibile.').slice(0,300);
  await sql(`UPDATE sales_calendar_sources SET status='error',last_error=$4,last_fetched_at=now() WHERE workspace_id=$1 AND id=$2 AND user_id=$3`,[row.workspace_id,row.id,row.user_id,msg]);
  return {error:msg}}
 remember(key,text);
 await sql(`UPDATE sales_calendar_sources SET status='ok',last_error=NULL,last_fetched_at=now() WHERE workspace_id=$1 AND id=$2 AND user_id=$3`,[row.workspace_id,row.id,row.user_id]);
 return {text,fresh:true};
}

// c: command or query; ctx: {sql, user, env, fetchIcs}
async function handle(c,ctx){
 const {sql,user}=ctx,env=ctx.env||process.env,fetchIcs=ctx.fetchIcs||cfetch.fetchIcs;
 if(!Number.isInteger(user)||user<1)fail(401,'Accedi con il tuo account RADIX.');
 try{
  if(c.entity==='calendar_sources'&&!c.action)return {rows:await sql(`SELECT ${PUBLIC} FROM sales_calendar_sources WHERE workspace_id=$1 AND user_id=$2 ORDER BY created_at,id`,[c.workspace,user])};
  if(c.entity==='calendar_busy'){
   const rows=await sql('SELECT workspace_id,id,user_id,label,show_details,url_ciphertext,url_iv,url_tag,updated_at::text AS updated_at FROM sales_calendar_sources WHERE workspace_id=$1 AND user_id=$2 ORDER BY created_at,id LIMIT '+MAX_SOURCES,[c.workspace,user]);
   const out=[],sources=[];
   await Promise.all(rows.map(async r=>{const got=await readSource(sql,r,{env,fetchIcs});
    if(got.error){sources.push({id:r.id,status:'error',error:got.error});return}
    let busy;try{busy=fb.busy(got.text,{from:c.from,to:c.to,zone:fb.DEFAULT_ZONE,details:r.show_details})}catch{sources.push({id:r.id,status:'error',error:'Calendario non interpretabile.'});return}
    sources.push({id:r.id,status:'ok'});for(const b of busy.slice(0,2000))out.push({...b,source:r.id})}));
   out.sort((a,b)=>a.start-b.start||a.end-b.end);
   return {rows:out,sources};
  }
  const d=c.data;
  if(c.action==='add'){
   const n=await sql('SELECT count(*)::int AS n FROM sales_calendar_sources WHERE workspace_id=$1 AND user_id=$2',[c.workspace,user]);
   if((n[0]?.n||0)>=MAX_SOURCES)fail(409,'Puoi collegare al massimo '+MAX_SOURCES+' calendari: rimuovine uno prima di aggiungerne un altro.');
   const enc=scrypto.encrypt(d.url,{workspace:c.workspace,id:d.id,user},env);
   const rows=await sql(`INSERT INTO sales_calendar_sources(workspace_id,id,user_id,label,provider,url_host,url_ciphertext,url_iv,url_tag,show_details) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${PUBLIC}`,
    [c.workspace,d.id,user,d.label,d.provider,d.url_host,enc.url_ciphertext,enc.url_iv,enc.url_tag,d.show_details===true]);
   return {rows};
  }
  if(c.action==='update'){
   const set=[],args=[c.workspace,d.id,user];const add=(col,v)=>{args.push(v);set.push(col+'=$'+args.length)};
   if(d.label!==undefined)add('label',d.label);if(d.show_details!==undefined)add('show_details',d.show_details);
   if(d.url!==undefined){const enc=scrypto.encrypt(d.url,{workspace:c.workspace,id:d.id,user},env);add('provider',d.provider);add('url_host',d.url_host);add('url_ciphertext',enc.url_ciphertext);add('url_iv',enc.url_iv);add('url_tag',enc.url_tag);set.push("status='pending'",'last_error=NULL','last_fetched_at=NULL')}
   const rows=await sql(`UPDATE sales_calendar_sources SET ${set.join(',')},updated_at=now() WHERE workspace_id=$1 AND id=$2 AND user_id=$3 RETURNING ${PUBLIC}`,args);
   if(!rows.length)fail(404,'Calendario non trovato.');return {rows};
  }
  if(c.action==='delete'){const rows=await sql('DELETE FROM sales_calendar_sources WHERE workspace_id=$1 AND id=$2 AND user_id=$3 RETURNING id',[c.workspace,d.id,user]);if(!rows.length)fail(404,'Calendario non trovato.');return {rows}}
  if(c.action==='refresh'){
   const r=await sql('SELECT workspace_id,id,user_id,url_ciphertext,url_iv,url_tag,updated_at::text AS updated_at FROM sales_calendar_sources WHERE workspace_id=$1 AND id=$2 AND user_id=$3',[c.workspace,d.id,user]);
   if(!r.length)fail(404,'Calendario non trovato.');
   const got=await readSource(sql,r[0],{env,fetchIcs,force:true});
   let events=null;if(!got.error){try{events=fb.parse(got.text).events.length}catch{events=null}}
   const rows=await sql(`SELECT ${PUBLIC} FROM sales_calendar_sources WHERE workspace_id=$1 AND id=$2 AND user_id=$3`,[c.workspace,d.id,user]);
   return {rows,events};
  }
  fail(400,'Azione non valida.');
 }catch(e){
  if(e&&e.code==='42P01')fail(503,'Calendari esterni non ancora disponibili su questo archivio: serve la migrazione sales 018.');
  throw e;
 }
}
module.exports={ENTITIES,command,query,handle,CalendarError,MAX_SOURCES,_cache:cache};
