'use strict';
/* Modulo contatti dei siti del Studio Sito (lib/site-studio.js): ogni invio diventa un contatto e una nota nel CRM RADIX
   del workspace scelto (un contatto nuovo apre anche un lead «nuovo» con fonte «sito», migrazione sales 012),
   con le tabelle e il comando che il CRM usa già (sales_contacts, sales_interactions, sales_leads via
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
   Landing con lead magnet (lib/funnel-studio.js): funnel (nome del funnel) e fonte (canale: instagram, google…; vince
   utm_source dell'indirizzo da cui arriva l'invio, quando la pagina lo manda nel Referer). Con «funnel» il messaggio non
   serve; il contatto, la nota e il lead portano il nome del funnel e la fonte (lead con fonte «funnel: <nome>»).
   → 303 verso <origine del sito>/grazie.html, oppure una piccola pagina HTML (errori: 400/401/403/413/429/503).
   Con «Accept: application/json» risponde JSON {ok} / {error}.

   Sondaggio (lib/survey-core.js, studio «Sondaggio e NPS»): con il campo «sondaggio» l'invio è un questionario. Campi
   ammessi, e solo questi (un campo diverso → 400): t, sondaggio (titolo), sid (indirizzo del sondaggio), qt («q1:nps,
   q2:testo,…», tipi nps · scala · singola · multipla · testo), l<N> (testo della domanda), q<N> (risposta), q<N>_<k>
   (scelta multipla), email, consenso, website (trappola). Limiti: 30 domande, 12 scelte, 600 caratteri per risposta
   aperta, 120 per scelta, 200 per domanda (oltre → 413), valori fuori scala o domande non dichiarate → 400.
   Le risposte diventano UNA interazione del CRM (tipo nota, titolo «Risposta sondaggio «…»», corpo = risposte in testo,
   una riga per domanda). Nessuna tabella nuova. Il contatto si usa solo se la persona scrive l'e-mail E spunta il
   consenso: allora la nota va sul contatto con quella e-mail (o su uno nuovo). Altrimenti la risposta è anonima e
   l'e-mail, se scritta senza consenso, non viene salvata. Il CRM non accetta note senza collegamento (vincolo di
   sales_interactions: azienda, contatto o trattativa): le risposte anonime vanno quindi sull'azienda «raccoglitore»
   SURVEY_HOLDER del workspace, creata al primo invio anonimo, senza contatto. Limite per workspace: 200 risposte l'ora. */
const crypto=require('node:crypto');
// Lazy: api/_sales.js requires this file too.
const command=(...a)=>require('./_sales').command(...a);
const PREFIX='rsf1',SCOPE='site-form',TTL_SECONDS=60*60*24*730;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SITE=/^[a-z0-9][a-z0-9-]{1,79}$/;
const LIMITS=Object.freeze({name:120,email:254,phone:40,message:3000,body:20000,funnel:80,fonte:40});
const RATE=Object.freeze({perIp:5,windowMs:10*60*1000,perWorkspaceHour:40});
const TITLE='Messaggio dal modulo del sito';
// ---- survey mode (lib/survey-core.js keeps the same limits: tests/sondaggio.test.js) ----
const SURVEY=Object.freeze({questions:30,options:12,option:120,answer:600,question:200,title:80,perWorkspaceHour:200,body:64000});
const SURVEY_TYPES=Object.freeze(['nps','scala','singola','multipla','testo']);
const SURVEY_PREFIX='Risposta sondaggio',SURVEY_HOLDER='Sondaggi · risposte anonime';
const SURVEY_KEY=/^(?:t|sondaggio|sid|qt|email|consenso|website|l(?:[1-9]|[12]\d|30)|q(?:[1-9]|[12]\d|30)(?:_(?:[1-9]|1[0-2]))?)$/;
const isSurvey=b=>!!b&&typeof b==='object'&&Object.prototype.hasOwnProperty.call(b,'sondaggio');
function one(b,k){const v=b[k];if(Array.isArray(v))throw failure(400,'Campo ripetuto: «'+k+'».');if(v!=null&&typeof v==='object')throw failure(400,'Campo non valido: «'+k+'».');return v==null?'':String(v)}
// Oversized → 413, anything outside the questionnaire → 400; nothing is cut silently.
function sized(v,max,what){const t=text(v,100000);if(t.length>max)throw failure(413,what+' (massimo '+max+' caratteri).');return t}
function surveyFields(body){const b=body||{},keys=Object.keys(b);
 if(keys.length>SURVEY.questions*(SURVEY.options+2)+8)throw failure(413,'Troppi campi nel sondaggio.');
 const bad=keys.find(k=>!SURVEY_KEY.test(k));if(bad)throw failure(400,'Campo non previsto nel sondaggio: «'+String(bad).slice(0,40)+'».');
 const f={token:line(one(b,'t'),700),trap:line(one(b,'website'),200),title:sized(one(b,'sondaggio'),SURVEY.title,'Titolo del sondaggio troppo lungo').replace(/\s+/g,' '),sid:line(one(b,'sid'),60),
  email:line(one(b,'email'),254).toLowerCase(),consent:yes(one(b,'consenso')),questions:[],answers:{}};
 if(!f.title)throw failure(400,'Sondaggio senza titolo.');
 if(!/^[a-z0-9][a-z0-9-]{1,39}$/.test(f.sid))throw failure(400,'Sondaggio non valido.');
 const qt=one(b,'qt');if(qt.length>SURVEY.questions*14)throw failure(413,'Elenco delle domande troppo lungo.');
 for(const part of qt.split(',').filter(Boolean)){const m=/^q([1-9]|[12]\d|30):(nps|scala|singola|multipla|testo)$/.exec(part.trim());
  if(!m||f.questions.some(q=>q.id==='q'+m[1]))throw failure(400,'Elenco delle domande non valido.');f.questions.push({id:'q'+m[1],type:m[2],label:''})}
 if(!f.questions.length||f.questions.length>SURVEY.questions)throw failure(400,'Elenco delle domande non valido.');
 const byId=Object.fromEntries(f.questions.map(q=>[q.id,q]));
 for(const k of keys){let m;
  if((m=/^l(\d+)$/.exec(k))){const q=byId['q'+m[1]];if(!q)throw failure(400,'Domanda non dichiarata: «'+k+'».');q.label=sized(one(b,k),SURVEY.question,'Testo della domanda troppo lungo').replace(/\s+/g,' ').replace(/→/g,'-');continue}
  if((m=/^(q\d+)_(\d+)$/.exec(k))){const q=byId[m[1]];if(!q||q.type!=='multipla')throw failure(400,'Risposta non prevista: «'+k+'».');
   const v=sized(one(b,k),SURVEY.option,'Risposta troppo lunga').replace(/\s+/g,' ').replace(/ \| /g,' / ');if(v)(f.answers[q.id]=f.answers[q.id]||[]).push(v);continue}
  if((m=/^(q\d+)$/.exec(k))){const q=byId[m[1]];if(!q||q.type==='multipla')throw failure(400,'Risposta non prevista: «'+k+'».');const raw=one(b,k);
   if(q.type==='nps'||q.type==='scala'){const v=raw.trim();if(!v)continue;const lo=q.type==='nps'?0:1,hi=q.type==='nps'?10:5;
    if(!/^\d{1,2}$/.test(v)||+v<lo||+v>hi)throw failure(400,'Valore fuori scala.');f.answers[q.id]=String(+v);continue}
   const v=sized(raw,q.type==='testo'?SURVEY.answer:SURVEY.option,'Risposta troppo lunga');if(v)f.answers[q.id]=q.type==='testo'?v.replace(/\s*\n\s*/g,' / '):v.replace(/\s+/g,' ')}}
 return f}
function surveyInvalid(f){
 if(!Object.keys(f.answers).length)return 'Rispondi ad almeno una domanda.';
 if(f.consent&&!f.email)return 'Scrivi la tua e-mail per essere ricontattato, oppure togli la spunta.';
 if(f.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email))return 'L’indirizzo e-mail non sembra valido.';
 return ''}
// The note body: «Risposte al sondaggio «…» [sid: …].», one line per answered question («q3 [multipla] Testo → A | B»),
// then who answered. At most 4000 characters (the CRM limit): long question texts go first, then long open answers.
function surveyBody(f,{origin,at,contact}){const answered=f.questions.filter(q=>f.answers[q.id]!=null);
 const val=q=>Array.isArray(f.answers[q.id])?f.answers[q.id].join(' | '):f.answers[q.id];
 const tail=['','— Arrivata dal modulo del sondaggio'+(origin?' '+origin:'')+'.',...(contact?['E-mail: '+f.email,'Consenso al ricontatto: sì ('+at+').']:['Risposta anonima.'])];
 const build=(labelMax,answerMax)=>['Risposte al sondaggio «'+f.title+'» [sid: '+f.sid+'].',...answered.map(q=>{const l=labelMax?q.label.slice(0,labelMax):'',v=String(val(q));
  return q.id+' ['+q.type+']'+(l?' '+l:'')+' → '+(v.length>answerMax?v.slice(0,answerMax-1)+'…':v)}),...tail].join('\n');
 for(const [l,a] of [[SURVEY.question,SURVEY.answer],[80,SURVEY.answer],[0,SURVEY.answer],[0,300],[0,120]]){const t=build(l,a);if(t.length<=4000)return t}
 return build(0,60).slice(0,4000)}
const surveyTitle=f=>(SURVEY_PREFIX+' «'+f.title+'»').slice(0,200);
async function recordSurvey(store,claims,f,{origin,now}){
 const at=now.toISOString().replace(/\.\d{3}Z$/,'Z'),ws=claims.ws,contact=!!(f.email&&f.consent);let contactId=null,companyId=null,created=false;
 if(contact){const found=await store.sql('SELECT id,company_id FROM sales_contacts WHERE workspace_id=$1 AND lower(email)=lower($2) ORDER BY created_at LIMIT 1',[ws,f.email]);
  if(found[0]){contactId=found[0].id;companyId=found[0].company_id||null}
  else{const c=command({workspace:ws,entity:'contacts',action:'create',data:{name:f.email,email:f.email,notes:('Contatto arrivato dal sondaggio «'+f.title+'»'+(origin?' '+origin:'')+' il '+at.slice(0,10)+': ha chiesto di essere ricontattato sulle sue risposte.').slice(0,4000)}});
   await store.command(c,claims.uid);contactId=c.data.id;created=true}}
 else{// anonymous: the holder company of the workspace (a note must be linked to something), never a contact
  const h=await store.sql('SELECT id FROM sales_companies WHERE workspace_id=$1 AND name=$2 ORDER BY id LIMIT 1',[ws,SURVEY_HOLDER]);
  if(h[0])companyId=h[0].id;
  else{const c=command({workspace:ws,entity:'companies',action:'create',data:{name:SURVEY_HOLDER,notes:'Raccoglitore creato da RADIX per le risposte anonime dei sondaggi: non è un cliente. Ogni nota è una risposta.'}});await store.command(c,claims.uid);companyId=c.data.id}}
 const n=command({workspace:ws,entity:'interactions',action:'create',data:{title:surveyTitle(f),kind:'note',occurred_at:at,body:surveyBody(f,{origin,at,contact}),...(contactId?{contact_id:contactId}:{}),...(companyId?{company_id:companyId}:{})}});
 await store.command(n,claims.uid);
 return {contactId,companyId,interactionId:n.data.id,created,anonymous:!contact}}
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
// A channel name for the CRM: «instagram», «google-ads»… (letters, digits, - and _), '' when none.
const channel=v=>line(v,200).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,LIMITS.fonte);
// utm_source of the page the send comes from (the funnel landing sends its full address in the Referer).
function utmSource(req){try{return channel(new URL(String(req.headers?.referer||'')).searchParams.get('utm_source')||'')}catch{return ''}}
const yes=v=>['1','on','true','si','sì','yes'].includes(String(Array.isArray(v)?v[0]:v||'').toLowerCase());
function fieldsOf(body){
 const b=body||{},out={token:line(b.t,700),name:line(b.name,LIMITS.name),email:line(b.email,LIMITS.email).toLowerCase(),phone:line(b.phone,LIMITS.phone),message:text(b.message,LIMITS.message),privacy:yes(b.privacy),marketing:yes(b.marketing),trap:line(b.website,200),
  funnel:line(b.funnel,LIMITS.funnel),fonte:channel(b.fonte)};
 return out;
}
// Returns the error to show, or '' when the send is valid. The honeypot is checked before this.
function invalid(f){
 if(!f.name||f.name.length<2)return 'Scrivi il tuo nome.';
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email))return 'Scrivi un indirizzo e-mail valido.';
 if(f.phone&&!/^\+?[\d\s().\/-]{6,40}$/.test(f.phone))return 'Il numero di telefono non sembra valido.';
 if(!f.funnel&&(!f.message||f.message.length<2))return 'Scrivi il messaggio.';
 if(!f.privacy)return 'Per inviare il messaggio serve il consenso al trattamento dei dati (informativa privacy).';
 return '';
}
function parseBody(req,max=LIMITS.body){let b=req.body;
 if(Buffer.isBuffer(b))b=b.toString('utf8');
 if(typeof b==='string'){if(Buffer.byteLength(b)>max)throw failure(413,'Messaggio troppo lungo.');
  if(/^application\/json/i.test(req.headers?.['content-type']||'')){try{return JSON.parse(b||'{}')}catch{throw failure(400,'Richiesta non valida.')}}
  return Object.fromEntries(new URLSearchParams(b))}
 if(!b||typeof b!=='object')return {};
 if(Buffer.byteLength(JSON.stringify(b))>max)throw failure(413,'Messaggio troppo lungo.');
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
 return [...(f.funnel?['Ha chiesto il lead magnet del funnel «'+f.funnel+'»'+(f.fonte?' (fonte: '+f.fonte+')':'')+'.',...(f.message?['',f.message]:[])]:[f.message]),'',
  '— Arrivato dal modulo '+(f.funnel?'della landing':'contatti del sito')+(origin?' '+origin:'')+'.',
  'Nome: '+f.name,'E-mail: '+f.email,...(f.phone?['Telefono: '+f.phone]:[]),
  'Consenso privacy: sì ('+at+').','Consenso a ricevere novità: '+(f.marketing?'sì ('+at+')':'no')+'.'].join('\n').slice(0,4000)}
// The lead source of a funnel: «funnel: <name>» (at most 80 characters, the CRM limit), the one a CRM rule can match.
const leadSource=name=>('funnel: '+name).slice(0,80);
async function record(store,claims,f,{origin,now}){
 const at=now.toISOString().replace(/\.\d{3}Z$/,'Z'),ws=claims.ws;
 const found=await store.sql('SELECT id FROM sales_contacts WHERE workspace_id=$1 AND lower(email)=lower($2) ORDER BY created_at LIMIT 1',[ws,f.email]);
 let contactId=found[0]&&found[0].id,created=false;
 if(!contactId){
  const data={name:f.name,email:f.email,notes:(f.funnel?'Contatto arrivato dal funnel «'+f.funnel+'»'+(f.fonte?' (fonte: '+f.fonte+')':'')+' della landing':'Contatto arrivato dal modulo del sito')+(origin?' '+origin:'')+' il '+at.slice(0,10)+'.',marketing_consent:f.marketing,...(f.marketing?{consent_at:at}:{}),...(f.phone?{phone:f.phone}:{})};
  const c=command({workspace:ws,entity:'contacts',action:'create',data});
  await store.command(c,claims.uid);contactId=c.data.id;created=true;
 }
 const n=command({workspace:ws,entity:'interactions',action:'create',data:{title:TITLE,kind:'note',occurred_at:at,body:noteBody(f,{origin,at}),contact_id:contactId}});
 await store.command(n,claims.uid);
 // A new contact also opens a lead (status «nuovo», source «sito», migration sales 012) with the same command the CRM
 // uses. The contact and the note are already saved, so a failed lead (an archive without 012) never fails the send:
 // the visitor would otherwise send again and duplicate the note.
 let leadId=null;
 if(created){const l=command({workspace:ws,entity:'leads',action:'create',data:{title:(f.funnel?'Lead magnet «'+f.funnel+'»: '+f.name:'Richiesta dal sito: '+f.name).slice(0,200),contact_id:contactId,status:'nuovo',source:f.funnel?leadSource(f.funnel):'sito'}});
  try{await store.command(l,claims.uid);leadId=l.data.id}catch(e){leadId=null}}
 return {contactId,interactionId:n.data.id,leadId,created};
}

// ---- the answer: a redirect to the site's thank-you page, or a small page / JSON ----
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function page(title,message,back){return '<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>'+esc(title)+'</title>'+
 '<style>body{margin:0;font:17px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#1f2328;background:#fff}main{max-width:620px;margin:0 auto;padding:56px 20px}h1{font-size:28px;line-height:1.2}a{color:#2563EB}</style></head>'+
 '<body><main><h1>'+esc(title)+'</h1><p>'+esc(message)+'</p>'+(back?'<p><a href="'+esc(back)+'">Torna al sito</a></p>':'')+'</main></body></html>'}
function answer(req,res,status,{ok,error,origin,survey}){
 const json=/application\/json/i.test(req.headers?.accept||'')||/^application\/json/i.test(req.headers?.['content-type']||'');
 if(json)return res.status(ok?200:status).json(ok?{ok:true}:{error});
 if(ok&&origin){res.setHeader('Location',origin+'/grazie.html');return res.status(303).end?res.status(303).end():res.status(303).send('')}
 res.setHeader('Content-Type','text/html; charset=utf-8');
 const html=survey?(ok?page('Grazie, abbiamo ricevuto le tue risposte','Il tuo parere ci aiuta a migliorare.',origin||''):page('Risposte non inviate',error,origin||''))
  :ok?page('Grazie, abbiamo ricevuto il tuo messaggio','Ti rispondiamo il prima possibile.',origin||''):page('Messaggio non inviato',error,origin||'');
 return res.status(status).send?res.status(status).send(html):res.status(status).end(html);
}

// Survey mode: same token, same limit per IP and site, its own limit per workspace, then one CRM note.
async function handleSurvey(req,res,body,{getStore,secret,now,limit,origin}){
 const f=surveyFields(body);
 const claims=verify(f.token,secret,now().getTime());
 if(!claims)throw failure(401,'Questo questionario non è più collegato: avvisa il titolare del sito.');
 if(!limit(ipOf(req)+'|'+claims.site+'|'+claims.ws,now().getTime()))throw failure(429,'Troppi invii in poco tempo: riprova tra qualche minuto.');
 if(f.trap)return answer(req,res,origin?303:200,{ok:true,origin,survey:true});
 const bad=surveyInvalid(f);if(bad)throw failure(400,bad);
 const store=getStore();
 const m=await store.membership(claims.ws,claims.uid);
 if(!m||!['owner','admin','member'].includes(m.role))throw failure(403,'Questo questionario non è più collegato: avvisa il titolare del sito.');
 const recent=await store.sql("SELECT count(*)::int AS n FROM sales_interactions WHERE workspace_id=$1 AND starts_with(title,$2) AND created_at>now()-interval '1 hour'",[claims.ws,SURVEY_PREFIX]);
 if(Number(recent[0]&&recent[0].n)>=SURVEY.perWorkspaceHour)throw failure(429,'Troppe risposte in poco tempo: riprova più tardi.');
 await recordSurvey(store,claims,f,{origin,now:now()});
 return answer(req,res,origin?303:200,{ok:true,origin,survey:true})}
async function handle(req,res,{getStore,secret,now=()=>new Date(),limit=defaultLimiter}){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex');
 const origin=originOf(req);let survey=false;
 try{
  if(req.method!=='POST'){res.setHeader('Allow','POST');throw failure(405,'Il modulo si invia solo dal sito.')}
  const body=parseBody(req,SURVEY.body);
  if(isSurvey(body)){survey=true;return await handleSurvey(req,res,body,{getStore,secret,now,limit,origin})}
  // the contact form keeps its own, smaller limit (the survey one only fits a long questionnaire)
  if(Buffer.byteLength(JSON.stringify(body))>LIMITS.body)throw failure(413,'Messaggio troppo lungo.');
  const f=fieldsOf(body);
  const claims=verify(f.token,secret,now().getTime());
  if(!claims)throw failure(401,'Questo modulo non è più collegato: avvisa il titolare del sito.');
  if(!limit(ipOf(req)+'|'+claims.site+'|'+claims.ws,now().getTime()))throw failure(429,'Troppi invii in poco tempo: riprova tra qualche minuto.');
  // Honeypot: a bot filled the hidden field. It sees the usual thank-you, nothing is written.
  if(f.trap)return answer(req,res,origin?303:200,{ok:true,origin});
  const bad=invalid(f);if(bad)throw failure(400,bad);
  if(f.funnel)f.fonte=utmSource(req)||f.fonte||'landing';else f.fonte='';
  const store=getStore();
  const m=await store.membership(claims.ws,claims.uid);
  if(!m||!['owner','admin','member'].includes(m.role))throw failure(403,'Questo modulo non è più collegato: avvisa il titolare del sito.');
  const recent=await store.sql("SELECT count(*)::int AS n FROM sales_interactions WHERE workspace_id=$1 AND title=$2 AND created_at>now()-interval '1 hour'",[claims.ws,TITLE]);
  if(Number(recent[0]&&recent[0].n)>=RATE.perWorkspaceHour)throw failure(429,'Troppi messaggi in poco tempo: riprova più tardi.');
  await record(store,claims,f,{origin,now:now()});
  return answer(req,res,origin?303:200,{ok:true,origin});
 }catch(e){
  const status=e.status||(e.code==='42P01'?503:503);
  return answer(req,res,status,{error:e.status?e.message:survey?'Le risposte non sono state inviate: riprova tra qualche minuto.':'Il messaggio non è stato inviato: riprova tra qualche minuto.',origin,survey});
 }
}
module.exports={SURVEY,SURVEY_TYPES,SURVEY_PREFIX,SURVEY_HOLDER,isSurvey,surveyFields,surveyInvalid,surveyBody,surveyTitle,recordSurvey,handleSurvey,leadSource,utmSource,channel,sign,verify,tokenIn,hasForm,fieldsOf,invalid,parseBody,limiter,originOf,noteBody,record,handle,PREFIX,SCOPE,TTL_SECONDS,TITLE,RATE,LIMITS};
