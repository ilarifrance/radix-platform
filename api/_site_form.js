'use strict';
/* Modulo contatti dei siti del Studio Sito (lib/site-studio.js): ogni invio diventa un contatto e una nota nel CRM RADIX
   del workspace scelto, con le tabelle e il comando che il CRM usa già (sales_contacts, sales_interactions via
   sales_command, validati da command() di api/_sales.js). Nessuna tabella nuova, nessuna e-mail inviata.

   Il permesso è un token del sito, come quello dell'estensione Chrome (api/_lead_import_token.js): firmato HMAC con una
   chiave derivata da JWT_SECRET con un'etichetta propria (mai valido come sessione o come token dell'estensione), legato a
   un utente, un workspace CRM e un progetto RADIX, e capace di una sola cosa: questo invio. Il token sta nella pagina
   pubblica, quindi la membership di chi l'ha creato si controlla a ogni invio: togliere la persona dal workspace spegne il
   modulo. Dura due anni; rimettere online il sito con un modulo ricollegato lo rinnova.

   Difese: campo trappola (honeypot «website»: se è pieno si risponde «grazie» e non si scrive niente), limite per IP e sito
   in memoria (5 invii in 10 minuti per istanza), limite per workspace sul database (40 messaggi dal sito nell'ultima ora),
   consenso privacy obbligatorio, testi puliti e limitati.

   POST /api/sales?site_form=1  (application/x-www-form-urlencoded da un <form> senza script, o JSON)
   campi: t (token), name, email, phone (facoltativo), message, privacy (obbligatorio), marketing (facoltativo), website (trappola)
   → 303 verso <origine del sito>/grazie.html, oppure una piccola pagina HTML (errori: 400/401/403/413/429/503).
   Con «Accept: application/json» risponde JSON {ok} / {error}. */
const crypto=require('node:crypto');
// Lazy: api/_sales.js requires this file too.
const command=(...a)=>require('./_sales').command(...a);
const PREFIX='rsf1',SCOPE='site-form',TTL_SECONDS=60*60*24*730;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SITE=/^[a-z0-9][a-z0-9-]{1,79}$/;
const LIMITS=Object.freeze({name:120,email:254,phone:40,message:3000,body:20000});
const RATE=Object.freeze({perIp:5,windowMs:10*60*1000,perWorkspaceHour:40});
const TITLE='Messaggio dal modulo del sito';
function failure(status,message){const e=new Error(message);e.status=status;return e}
function key(secret){
 if(typeof secret!=='string'||!secret)throw failure(503,'Modulo contatti non configurato su questo ambiente.');
 return crypto.createHmac('sha256',secret).update('radix:site-form:v1').digest();
}
const signature=(secret,body)=>crypto.createHmac('sha256',key(secret)).update(PREFIX+'.'+body).digest('base64url');
function sign({uid,workspace,site},secret,now=Date.now()){
 if(!Number.isInteger(uid)||uid<1||uid>2147483647||!UUID.test(workspace||'')||!SITE.test(String(site||'')))throw failure(400,'Utente, workspace o progetto non validi.');
 const iat=Math.floor(now/1000),payload={v:1,scope:SCOPE,uid,ws:workspace.toLowerCase(),site,iat,exp:iat+TTL_SECONDS};
 const body=Buffer.from(JSON.stringify(payload)).toString('base64url');
 return {token:PREFIX+'.'+body+'.'+signature(secret,body),expiresAt:new Date(payload.exp*1000).toISOString(),workspace:payload.ws,site};
}
function verify(token,secret,now=Date.now()){
 if(typeof token!=='string'||token.length>700)return null;
 const parts=token.split('.');
 if(parts.length!==3||parts[0]!==PREFIX||!/^[A-Za-z0-9_-]+$/.test(parts[1])||!/^[A-Za-z0-9_-]+$/.test(parts[2]))return null;
 const expected=Buffer.from(signature(secret,parts[1])),given=Buffer.from(parts[2]);
 if(expected.length!==given.length||!crypto.timingSafeEqual(expected,given))return null;
 let p;try{p=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'))}catch{return null}
 if(!p||p.v!==1||p.scope!==SCOPE||!Number.isInteger(p.uid)||p.uid<1||!UUID.test(p.ws||'')||!SITE.test(String(p.site||''))||!Number.isInteger(p.exp)||!Number.isInteger(p.iat))return null;
 const t=Math.floor(now/1000);
 if(p.exp<=t||p.iat>t+300||p.exp-p.iat>TTL_SECONDS)return null;
 return p;
}
// The token written in a page by the studio (hidden input «t» of the form marked data-radix-form), or '' when there is none.
function tokenIn(html){const m=/<form\b[^>]*\bdata-radix-form\b[\s\S]*?<input\b[^>]*\bname="t"[^>]*\bvalue="([^"]*)"/i.exec(String(html||''));return m?m[1]:''}
const hasForm=html=>/<form\b[^>]*\bdata-radix-form\b/i.test(String(html||''));

// ---- the submitted fields ----
const text=(v,max)=>{if(Array.isArray(v))v=v[0];return String(v==null?'':v).replace(/\r\n?/g,'\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0,max)};
const line=(v,max)=>text(v,max).replace(/\s+/g,' ');
const yes=v=>['1','on','true','si','sì','yes'].includes(String(Array.isArray(v)?v[0]:v||'').toLowerCase());
function fieldsOf(body){
 const b=body||{},out={token:line(b.t,700),name:line(b.name,LIMITS.name),email:line(b.email,LIMITS.email).toLowerCase(),phone:line(b.phone,LIMITS.phone),message:text(b.message,LIMITS.message),privacy:yes(b.privacy),marketing:yes(b.marketing),trap:line(b.website,200)};
 return out;
}
// Returns the error to show, or '' when the send is valid. The honeypot is checked before this.
function invalid(f){
 if(!f.name||f.name.length<2)return 'Scrivi il tuo nome.';
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email))return 'Scrivi un indirizzo e-mail valido.';
 if(f.phone&&!/^\+?[\d\s().\/-]{6,40}$/.test(f.phone))return 'Il numero di telefono non sembra valido.';
 if(!f.message||f.message.length<2)return 'Scrivi il messaggio.';
 if(!f.privacy)return 'Per inviare il messaggio serve il consenso al trattamento dei dati (informativa privacy).';
 return '';
}
function parseBody(req){let b=req.body;
 if(Buffer.isBuffer(b))b=b.toString('utf8');
 if(typeof b==='string'){if(Buffer.byteLength(b)>LIMITS.body)throw failure(413,'Messaggio troppo lungo.');
  if(/^application\/json/i.test(req.headers?.['content-type']||'')){try{return JSON.parse(b||'{}')}catch{throw failure(400,'Richiesta non valida.')}}
  return Object.fromEntries(new URLSearchParams(b))}
 if(!b||typeof b!=='object')return {};
 if(Buffer.byteLength(JSON.stringify(b))>LIMITS.body)throw failure(413,'Messaggio troppo lungo.');
 return b;
}

// ---- rate limit: per IP and site in this instance (cheap), per workspace on the database (shared) ----
function limiter({max=RATE.perIp,windowMs=RATE.windowMs,size=5000}={}){const hits=new Map();
 return (k,now=Date.now())=>{const list=(hits.get(k)||[]).filter(t=>now-t<windowMs);
  if(list.length>=max){hits.set(k,list);return false}
  list.push(now);hits.delete(k);hits.set(k,list);
  if(hits.size>size)hits.delete(hits.keys().next().value);
  return true}}
const defaultLimiter=limiter();
const ipOf=req=>String(req.headers?.['x-forwarded-for']||req.headers?.['x-real-ip']||req.socket?.remoteAddress||'').split(',')[0].trim().slice(0,64)||'?';
// The site the visitor came from: only an https origin (or localhost for the local harness) is used for the redirect.
function originOf(req){const h=req.headers||{};let o=String(h.origin||'');
 if(!o||o==='null'){try{o=new URL(String(h.referer||'')).origin}catch{o=''}}
 return /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(o)||/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(o)?o:''}

// ---- the record in the CRM: an existing contact with the same e-mail gets the note, otherwise a new contact ----
function noteBody(f,{origin,at}){
 return [f.message,'',
  '— Arrivato dal modulo contatti del sito'+(origin?' '+origin:'')+'.',
  'Nome: '+f.name,'E-mail: '+f.email,...(f.phone?['Telefono: '+f.phone]:[]),
  'Consenso privacy: sì ('+at+').','Consenso a ricevere novità: '+(f.marketing?'sì ('+at+')':'no')+'.'].join('\n').slice(0,4000)}
async function record(store,claims,f,{origin,now}){
 const at=now.toISOString().replace(/\.\d{3}Z$/,'Z'),ws=claims.ws;
 const found=await store.sql('SELECT id FROM sales_contacts WHERE workspace_id=$1 AND lower(email)=lower($2) ORDER BY created_at LIMIT 1',[ws,f.email]);
 let contactId=found[0]&&found[0].id,created=false;
 if(!contactId){
  const data={name:f.name,email:f.email,notes:'Contatto arrivato dal modulo del sito'+(origin?' '+origin:'')+' il '+at.slice(0,10)+'.',marketing_consent:f.marketing,...(f.marketing?{consent_at:at}:{}),...(f.phone?{phone:f.phone}:{})};
  const c=command({workspace:ws,entity:'contacts',action:'create',data});
  await store.command(c,claims.uid);contactId=c.data.id;created=true;
 }
 const n=command({workspace:ws,entity:'interactions',action:'create',data:{title:TITLE,kind:'note',occurred_at:at,body:noteBody(f,{origin,at}),contact_id:contactId}});
 await store.command(n,claims.uid);
 return {contactId,interactionId:n.data.id,created};
}

// ---- the answer: a redirect to the site's thank-you page, or a small page / JSON ----
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function page(title,message,back){return '<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>'+esc(title)+'</title>'+
 '<style>body{margin:0;font:17px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#1f2328;background:#fff}main{max-width:620px;margin:0 auto;padding:56px 20px}h1{font-size:28px;line-height:1.2}a{color:#2563EB}</style></head>'+
 '<body><main><h1>'+esc(title)+'</h1><p>'+esc(message)+'</p>'+(back?'<p><a href="'+esc(back)+'">Torna al sito</a></p>':'')+'</main></body></html>'}
function answer(req,res,status,{ok,error,origin}){
 const json=/application\/json/i.test(req.headers?.accept||'')||/^application\/json/i.test(req.headers?.['content-type']||'');
 if(json)return res.status(ok?200:status).json(ok?{ok:true}:{error});
 if(ok&&origin){res.setHeader('Location',origin+'/grazie.html');return res.status(303).end?res.status(303).end():res.status(303).send('')}
 res.setHeader('Content-Type','text/html; charset=utf-8');
 const html=ok?page('Grazie, abbiamo ricevuto il tuo messaggio','Ti rispondiamo il prima possibile.',origin||''):page('Messaggio non inviato',error,origin||'');
 return res.status(status).send?res.status(status).send(html):res.status(status).end(html);
}

async function handle(req,res,{getStore,secret,now=()=>new Date(),limit=defaultLimiter}){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex');
 const origin=originOf(req);
 try{
  if(req.method!=='POST'){res.setHeader('Allow','POST');throw failure(405,'Il modulo si invia solo dal sito.')}
  const f=fieldsOf(parseBody(req));
  const claims=verify(f.token,secret,now().getTime());
  if(!claims)throw failure(401,'Questo modulo non è più collegato: avvisa il titolare del sito.');
  if(!limit(ipOf(req)+'|'+claims.site+'|'+claims.ws,now().getTime()))throw failure(429,'Troppi invii in poco tempo: riprova tra qualche minuto.');
  // Honeypot: a bot filled the hidden field. It sees the usual thank-you, nothing is written.
  if(f.trap)return answer(req,res,origin?303:200,{ok:true,origin});
  const bad=invalid(f);if(bad)throw failure(400,bad);
  const store=getStore();
  const m=await store.membership(claims.ws,claims.uid);
  if(!m||!['owner','admin','member'].includes(m.role))throw failure(403,'Questo modulo non è più collegato: avvisa il titolare del sito.');
  const recent=await store.sql("SELECT count(*)::int AS n FROM sales_interactions WHERE workspace_id=$1 AND title=$2 AND created_at>now()-interval '1 hour'",[claims.ws,TITLE]);
  if(Number(recent[0]&&recent[0].n)>=RATE.perWorkspaceHour)throw failure(429,'Troppi messaggi in poco tempo: riprova più tardi.');
  await record(store,claims,f,{origin,now:now()});
  return answer(req,res,origin?303:200,{ok:true,origin});
 }catch(e){
  const status=e.status||(e.code==='42P01'?503:503);
  return answer(req,res,status,{error:e.status?e.message:'Il messaggio non è stato inviato: riprova tra qualche minuto.',origin});
 }
}
module.exports={sign,verify,tokenIn,hasForm,fieldsOf,invalid,parseBody,limiter,originOf,noteBody,record,handle,PREFIX,SCOPE,TTL_SECONDS,TITLE,RATE,LIMITS};
