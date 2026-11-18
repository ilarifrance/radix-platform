'use strict';
// /api/booking — Ciuffo: the shop's agenda and the public «Prenota» page (hair salons, barbers, beauty centres).
// Public calls (shop page, free slots, booking, the customer's own booking by link) need no login. Owner calls use the
// Ciuffo session cookie (its own key derived from JWT_SECRET: a Ciuffo token is never a RADIX team session).
// Every write is one HTTP transaction whose first statement checks the caller's role; the database refuses
// overlapping appointments for the same staff member (migrations/booking/001, constraint bk_no_overlap).
const crypto=require('node:crypto');
const {randomUUID}=crypto;
const S=require('../lib/booking/slots');
const {hashPassword,verifyPassword,parseCookies}=require('./_auth');

class BkError extends Error{constructor(status,message){super(message);this.status=status;}}
const fail=(s,m)=>{throw new BkError(s,m);};
const q=(t,p)=>[t,p||[]];
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v);
const text=(v,max,req,msg)=>{if(v===undefined||v===null||v===''){if(req)fail(400,msg||'Campo obbligatorio mancante.');return null;}
 if(typeof v!=='string'||v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v))fail(400,msg||'Testo non valido o troppo lungo.');const t=v.trim();if(req&&!t)fail(400,msg||'Campo obbligatorio mancante.');return t||null;};
const int=(v,min,max,msg)=>{if(!Number.isSafeInteger(v)||v<min||v>max)fail(400,msg||'Numero non valido.');return v;};
const bool=(v,msg)=>{if(typeof v!=='boolean')fail(400,msg||'Valore non valido.');return v;};
const id=(v,msg)=>{if(!uuid(v))fail(400,msg||'Identificativo non valido.');return v.toLowerCase();};
const iso=(v,msg)=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(v)||Number.isNaN(Date.parse(v)))fail(400,msg||'Orario non valido.');return new Date(Date.parse(v)).toISOString();};
const date=(v,msg)=>{if(!S.isDate(v))fail(400,msg||'Data non valida: usa AAAA-MM-GG.');return v;};
const email=(v,req)=>{const t=text(v,254,req,'Email non valida.');if(t===null)return null;if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t))fail(400,'Email non valida.');return t.toLowerCase();};
// Italian numbers without prefix get +39; 00 becomes +. Stored as +<digits>.
function phone(v,req){
 const t=text(v,30,req,'Indica un numero di telefono.');if(t===null)return null;
 let n=t.replace(/[\s().\/-]/g,'');if(n.startsWith('00'))n='+'+n.slice(2);if(!n.startsWith('+'))n='+39'+n;
 if(!/^\+[0-9]{6,15}$/.test(n))fail(400,'Numero di telefono non valido.');return n;
}
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const slugify=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40).replace(/-+$/,'');
const SLUG=/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
const RESERVED=new Set(['app','api','admin','accedi','iscrizione','prenota','gestisci','privacy','condizioni','demo','ciuffo','www','help','aiuto']);
const KINDS=['parrucchiere','barbiere','estetista','unghie','altro'];
const STAFF_COLORS=['#E8705F','#6B3A5B','#5E9C76','#D9A441','#4F7CAC','#B5577A','#7A6A58','#3E8E8E'];

// ---------- owner session ----------
const COOKIE='ciuffo_session',MAX_AGE=60*60*24*30;
const key=()=>{const s=process.env.JWT_SECRET;if(!s)throw new Error('JWT_SECRET is not set in the environment.');return crypto.createHmac('sha256',s).update('ciuffo-owner').digest();};
function signOwner(uid,now=Date.now()){const body=Buffer.from(JSON.stringify({uid,kind:'ciuffo',exp:Math.floor(now/1000)+MAX_AGE})).toString('base64url');
 return body+'.'+crypto.createHmac('sha256',key()).update(body).digest('base64url');}
function verifyOwner(token){
 try{if(typeof token!=='string'||!token.includes('.'))return null;const [body,sig]=token.split('.');
  const want=Buffer.from(crypto.createHmac('sha256',key()).update(body).digest('base64url')),got=Buffer.from(sig||'');
  if(want.length!==got.length||!crypto.timingSafeEqual(want,got))return null;
  const p=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));
  if(p.kind!=='ciuffo'||!Number.isInteger(p.uid)||p.uid<1||!(p.exp>Date.now()/1000))return null;return {uid:p.uid};}catch{return null;}
}
const getOwner=req=>verifyOwner(parseCookies(req)[COOKIE]);
const cookie=token=>[COOKIE+'='+encodeURIComponent(token),'Path=/','HttpOnly','SameSite=Lax','Max-Age='+MAX_AGE].concat(process.env.VERCEL?['Secure']:[]).join('; ');
const clearCookie=()=>COOKIE+'=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';

// Per-instance allowance against scripted bookings, sign-ups and password guessing.
const clientIp=req=>String((req.headers||{})['x-forwarded-for']||'').split(',')[0].trim()||null;
const HITS=new Map();
function limit(req,kind,max){const k=kind+':'+(clientIp(req)||'?')+':'+new Date().toISOString().slice(0,13),n=(HITS.get(k)||0)+1;
 if(HITS.size>10000)HITS.clear();HITS.set(k,n);if(n>max)fail(429,'Troppi tentativi: riprova tra un\'ora.');}
function originOf(req){
 if(process.env.CIUFFO_PUBLIC_URL)return process.env.CIUFFO_PUBLIC_URL.replace(/\/+$/,'');
 const host=String((req.headers||{})['x-forwarded-host']||(req.headers||{}).host||'').split(',')[0].trim();
 if(!/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host))return '';
 return (/^(localhost|127\.0\.0\.1)(:|$)/.test(host)?'http':'https')+'://'+host;
}

// ---------- reads ----------
const SHOP_PUBLIC="jsonb_build_object('id',s.id,'slug',s.slug,'name',s.name,'phone',s.phone,'address',s.address,'city',s.city,'kind',s.kind,'timezone',s.timezone,'hours',s.hours,'step_min',s.step_min,'min_notice_min',s.min_notice_min,'max_days_ahead',s.max_days_ahead,'cancel_notice_min',s.cancel_notice_min,'booking_open',s.booking_open,'welcome',s.welcome)";
const STAFF_JSON="coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'color',t.color,'hours',t.hours,'active',t.active,'position',t.position) ORDER BY t.position,t.name) FROM bk_staff t WHERE t.shop_id=s.id),'[]')";
const SERVICES_JSON="coalesce((SELECT jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'description',v.description,'duration_min',v.duration_min,'buffer_min',v.buffer_min,'price_cents',v.price_cents,'staff_ids',to_jsonb(v.staff_ids),'active',v.active,'position',v.position) ORDER BY v.position,v.name) FROM bk_services v WHERE v.shop_id=s.id),'[]')";
const CLOSURES_JSON=(from)=>"coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'staff_id',c.staff_id,'from_date',c.from_date,'to_date',c.to_date,'note',c.note) ORDER BY c.from_date) FROM bk_closures c WHERE c.shop_id=s.id AND c.to_date>="+from+"),'[]')";
// Everything the slot calculation needs for one shop between two instants.
async function loadShop(store,where,param,fromIso,toIso){
 return store.json("SELECT "+SHOP_PUBLIC+"||jsonb_build_object('staff',"+STAFF_JSON+",'services',"+SERVICES_JSON+",'closures',"+CLOSURES_JSON('($2::timestamptz AT TIME ZONE s.timezone)::date - 1')+
  ",'busy',coalesce((SELECT jsonb_agg(jsonb_build_object('staff_id',a.staff_id,'starts_at',a.starts_at,'blocks_until',a.blocks_until)) FROM bk_appointments a WHERE a.shop_id=s.id AND a.status IN('confirmed','done') AND a.starts_at<$3::timestamptz AND a.blocks_until>$2::timestamptz),'[]')) AS v FROM bk_shops s WHERE "+where,[param,fromIso,toIso]);
}
const publicShop=s=>({slug:s.slug,name:s.name,phone:s.phone,address:s.address,city:s.city,kind:s.kind,welcome:s.welcome,booking_open:s.booking_open,max_days_ahead:s.max_days_ahead,timezone:s.timezone,
 services:s.services.filter(v=>v.active).map(v=>({id:v.id,name:v.name,description:v.description,duration_min:v.duration_min,price_cents:v.price_cents,staff_ids:v.staff_ids})),
 staff:s.staff.filter(t=>t.active).map(t=>({id:t.id,name:t.name}))});
// Local day window as UTC instants, padded by a day so time-zone edges and long appointments are covered.
const dayWindow=(from,days)=>[new Date(Date.parse(from+'T00:00:00Z')-86400000).toISOString(),new Date(Date.parse(from+'T00:00:00Z')+(days+1)*86400000).toISOString()];
function slotsFor(shop,{service,staff_id,date,now}){
 return S.freeSlots({date,tz:shop.timezone,step_min:shop.step_min,min_notice_min:shop.min_notice_min,now,service,hours:shop.hours,
  staff:shop.staff,closures:shop.closures,busy:shop.busy,staff_id:staff_id||undefined});
}
const todayIn=(tz,now)=>S.utcToLocal(now,tz).date;

// ---------- validation of owner data ----------
function hoursOf(v){const e=S.checkHours(v);if(e)fail(400,e);return v;}
const SHOP_FIELDS={name:v=>text(v,120,true,'Indica il nome del salone.'),phone:v=>phone(v,false),email:v=>email(v,false),address:v=>text(v,200),city:v=>text(v,80),
 kind:v=>{if(!KINDS.includes(v))fail(400,'Tipo di attività non valido.');return v;},
 slug:v=>{if(typeof v!=='string'||!SLUG.test(v)||RESERVED.has(v))fail(400,'Indirizzo della pagina non valido: lettere minuscole, numeri e trattini, da 3 a 40 caratteri.');return v;},
 hours:hoursOf,step_min:v=>{if(![5,10,15,20,30,60].includes(v))fail(400,'Intervallo tra gli orari non valido.');return v;},
 min_notice_min:v=>int(v,0,10080,'Preavviso non valido.'),max_days_ahead:v=>int(v,1,365,'Giorni prenotabili non validi.'),cancel_notice_min:v=>int(v,0,10080,'Preavviso di disdetta non valido.'),
 booking_open:v=>bool(v),welcome:v=>text(v,500)};
function pick(d,fields){if(!obj(d))fail(400,'Dati non validi.');const out={};for(const [k,v] of Object.entries(d)){if(['id','shop_id'].includes(k))continue;if(!Object.hasOwn(fields,k))fail(400,'Campo non consentito: '+k);out[k]=fields[k](v);}return out;}
const STAFF_FIELDS={name:v=>text(v,80,true,'Indica il nome.'),color:v=>{if(v===null)return null;if(typeof v!=='string'||!/^#[0-9a-fA-F]{6}$/.test(v))fail(400,'Colore non valido.');return v;},
 hours:v=>v===null?null:hoursOf(v),active:v=>bool(v),position:v=>int(v,0,1000)};
const SERVICE_FIELDS={name:v=>text(v,80,true,'Indica il nome del servizio.'),description:v=>text(v,300),duration_min:v=>int(v,5,480,'Durata non valida: da 5 a 480 minuti.'),
 buffer_min:v=>int(v,0,120,'Pausa dopo il servizio non valida.'),price_cents:v=>v===null?null:int(v,0,10000000,'Prezzo non valido.'),
 staff_ids:v=>{if(!Array.isArray(v)||v.length>50)fail(400,'Operatori non validi.');return [...new Set(v.map(x=>id(x,'Operatore non valido.')))];},active:v=>bool(v),position:v=>int(v,0,1000)};

// ---------- errors ----------
function dbError(e){
 if(e instanceof BkError)return e;
 const code=e&&e.code;
 if(code==='23P01')return new BkError(409,'Quell\'orario è appena stato preso: scegline un altro.');
 if(code==='23505')return new BkError(409,/slug/.test(String(e.constraint||e.message))?'Questo indirizzo della pagina è già usato: scegline un altro.':/phone/.test(String(e.constraint||e.message))?'Esiste già un cliente con questo numero.':'Dato già presente.');
 if(code==='42501')return new BkError(403,'Permessi insufficienti per questa azione.');
 if(code==='40001')return new BkError(409,'I dati sono cambiati nel frattempo: ricarica e riprova.');
 if(code==='42P01'||code==='42883')return new BkError(503,'Il servizio non è ancora attivo su questo ambiente.');
 if(code==='23503'||code==='23514'||code==='22P02')return new BkError(400,'Dati non validi.');
 if(code==='P0001')return new BkError(400,String(e.message||'Dati non validi.'));
 console.error('booking',code,e&&e.message);return new BkError(500,'Servizio non disponibile in questo momento: riprova tra poco.');
}

// ---------- mail (best effort) ----------
function defaultSendMail(){
 const user=process.env.GMAIL_USER,pass=process.env.GMAIL_APP_PASSWORD;if(!user||!pass)return null;
 return async msg=>{const nodemailer=require('nodemailer');await nodemailer.createTransport({service:'gmail',auth:{user,pass}}).sendMail({from:process.env.CIUFFO_MAIL_FROM||'Ciuffo <'+user+'>',...msg});};
}
const fmtWhen=(isoStr,tz)=>new Intl.DateTimeFormat('it-IT',{timeZone:tz,weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}).format(new Date(isoStr));

function createHandler(deps){
 const nowOf=()=>deps.now?deps.now():Date.now();
 const sendMail=deps.sendMail===undefined?defaultSendMail():deps.sendMail;
 async function mail(msg){if(!sendMail||!msg.to)return false;try{await sendMail(msg);return true;}catch(e){console.error('booking mail',e&&e.code);return false;}}

 // ----- public -----
 async function shopBySlug(store,slug,from,days){
  if(typeof slug!=='string'||!SLUG.test(slug))fail(404,'Salone non trovato.');
  const [a,b]=dayWindow(from,days);const s=await loadShop(store,'s.slug=$1',slug,a,b);if(!s)fail(404,'Salone non trovato.');return s;
 }
 async function getSlots(store,qs){
  const now=nowOf();const s0=await store.json('SELECT jsonb_build_object(\'timezone\',timezone) AS v FROM bk_shops WHERE slug=$1',[String(qs.slug||'')]);
  if(!s0)fail(404,'Salone non trovato.');
  const today=todayIn(s0.timezone,now),from=qs.date?date(qs.date):today,days=qs.days===undefined?1:int(Number(qs.days),1,14,'Giorni non validi.');
  const shop=await shopBySlug(store,qs.slug,from,days);
  if(!shop.booking_open)return {open:false,days:[]};
  const service=shop.services.find(v=>v.id===String(qs.service||'').toLowerCase()&&v.active);if(!service)fail(400,'Scegli un servizio.');
  const staffId=qs.staff?id(qs.staff,'Operatore non valido.'):null;if(staffId&&!shop.staff.some(t=>t.id===staffId&&t.active))fail(400,'Operatore non valido.');
  const last=S.addDays(today,shop.max_days_ahead),out=[];
  for(let i=0;i<days;i++){const d=S.addDays(from,i);if(d<today||d>last){out.push({date:d,slots:[]});continue;}
   out.push({date:d,slots:slotsFor(shop,{service,staff_id:staffId,date:d,now}).map(x=>({time:x.time,starts_at:x.starts_at}))});}
  return {open:true,days:out};
 }
 async function book(store,req,d){
  limit(req,'book',20);
  if(!obj(d))fail(400,'Dati non validi.');
  const slug=text(d.slug,40,true);const start=iso(d.starts_at,'Scegli un orario.');
  const name=text(d.name,120,true,'Indica nome e cognome.'),tel=phone(d.phone,true),mail_=email(d.email,false),note=text(d.note,500);
  if(d.consent!==true)fail(400,'Per prenotare serve il consenso al trattamento dei dati.');
  const s0=await store.json('SELECT jsonb_build_object(\'timezone\',timezone) AS v FROM bk_shops WHERE slug=$1',[slug]);if(!s0)fail(404,'Salone non trovato.');
  const local=S.utcToLocal(start,s0.timezone),shop=await shopBySlug(store,slug,local.date,1);
  if(!shop.booking_open)fail(409,'Il salone non accetta prenotazioni online in questo momento.');
  const service=shop.services.find(v=>v.id===String(d.service||'').toLowerCase()&&v.active);if(!service)fail(400,'Scegli un servizio.');
  const staffId=d.staff?id(d.staff,'Operatore non valido.'):null;
  const now=nowOf();if(local.date>S.addDays(todayIn(shop.timezone,now),shop.max_days_ahead))fail(400,'Questa data non è ancora prenotabile.');
  const slot=slotsFor(shop,{service,staff_id:staffId,date:local.date,now}).find(x=>x.starts_at===start);
  if(!slot)fail(409,'Quell\'orario non è più libero: scegline un altro.');
  const staff=S.pickStaff(slot.staff_ids,shop.staff,shop.busy);
  const apptId=randomUUID(),custId=randomUUID(),token=crypto.randomBytes(24).toString('base64url');
  await store.tx([
   q('INSERT INTO bk_customers(shop_id,id,name,phone,email) VALUES($1,$2,$3,$4,$5) ON CONFLICT(shop_id,phone) DO UPDATE SET name=EXCLUDED.name,email=coalesce(EXCLUDED.email,bk_customers.email)',[shop.id,custId,name,tel,mail_]),
   q("INSERT INTO bk_appointments(shop_id,id,staff_id,service_id,customer_id,starts_at,ends_at,blocks_until,source,price_cents,note,manage_token_hash) SELECT $1,$2,$3,$4,c.id,$5,$6,$7,'web',$8,$9,$10 FROM bk_customers c WHERE c.shop_id=$1 AND c.phone=$11",
    [shop.id,apptId,staff,service.id,slot.starts_at,slot.ends_at,slot.blocks_until,service.price_cents,note,sha(token),tel]),
   q('INSERT INTO bk_audit(shop_id,actor_id,action,entity_id,detail) VALUES($1,NULL,$2,$3,$4::jsonb)',[shop.id,'appointment.book',apptId,JSON.stringify({source:'web',ip:clientIp(req)})])]);
  const staffName=(shop.staff.find(t=>t.id===staff)||{}).name||null,when=fmtWhen(slot.starts_at,shop.timezone);
  const link=originOf(req)+'/ciuffo/gestisci.html#t='+token;
  const mailed=await mail(mail_&&{to:mail_,subject:'Appuntamento confermato da '+shop.name,
   text:'Ciao '+name+',\n\nil tuo appuntamento da '+shop.name+' è confermato:\n'+service.name+', '+when+(staffName?' con '+staffName:'')+'.\n'+(shop.address?'\nDove: '+shop.address+(shop.city?', '+shop.city:'')+'\n':'')+
    '\nPer vederlo o disdirlo: '+link+'\n\nA presto!\n'+shop.name});
  return {id:apptId,token,starts_at:slot.starts_at,ends_at:slot.ends_at,service:service.name,staff:staffName,shop:{name:shop.name,address:shop.address,city:shop.city,phone:shop.phone},mailed};
 }
 const BOOKING_BY_TOKEN="SELECT jsonb_build_object('id',a.id,'status',a.status,'starts_at',a.starts_at,'ends_at',a.ends_at,'service',v.name,'staff',t.name,'customer',c.name,'shop',jsonb_build_object('id',s.id,'slug',s.slug,'name',s.name,'phone',s.phone,'address',s.address,'city',s.city,'timezone',s.timezone,'cancel_notice_min',s.cancel_notice_min)) AS v FROM bk_appointments a JOIN bk_shops s ON s.id=a.shop_id JOIN bk_services v ON v.shop_id=a.shop_id AND v.id=a.service_id JOIN bk_staff t ON t.shop_id=a.shop_id AND t.id=a.staff_id JOIN bk_customers c ON c.shop_id=a.shop_id AND c.id=a.customer_id WHERE a.manage_token_hash=$1";
 async function byToken(store,token){
  if(typeof token!=='string'||!/^[A-Za-z0-9_-]{20,64}$/.test(token))fail(404,'Prenotazione non trovata.');
  const b=await store.json(BOOKING_BY_TOKEN,[sha(token)]);if(!b)fail(404,'Prenotazione non trovata.');
  b.can_cancel=b.status==='confirmed'&&Date.parse(b.starts_at)-nowOf()>=b.shop.cancel_notice_min*60000;return b;
 }
 async function cancelByToken(store,req,d){
  limit(req,'cancel',30);const b=await byToken(store,d&&d.token);
  if(b.status==='cancelled')return {ok:true,status:'cancelled'};
  if(!b.can_cancel)fail(409,'Mancano meno di '+Math.round(b.shop.cancel_notice_min/60)+' ore: per disdire chiama il salone'+(b.shop.phone?' al '+b.shop.phone:'')+'.');
  await store.tx([q("UPDATE bk_appointments SET status='cancelled',cancelled_at=now() WHERE manage_token_hash=$1 AND status='confirmed'",[sha(d.token)]),
   q('INSERT INTO bk_audit(shop_id,actor_id,action,entity_id,detail) VALUES($1,NULL,$2,$3,$4::jsonb)',[b.shop.id,'appointment.cancel',b.id,JSON.stringify({by:'customer',ip:clientIp(req)})])]);
  return {ok:true,status:'cancelled'};
 }

 // ----- owner accounts -----
 async function signup(store,req,res,d){
  limit(req,'signup',5);if(!obj(d))fail(400,'Dati non validi.');
  const mail_=email(d.email,true),name=text(d.name,120,true,'Indica nome e cognome.');
  if(typeof d.password!=='string'||d.password.length<10||d.password.length>200)fail(400,'La password deve avere almeno 10 caratteri.');
  if(d.accept!==true)fail(400,'Per continuare accetta le condizioni del servizio.');
  if(!obj(d.shop))fail(400,'Indica i dati del salone.');
  const shopName=text(d.shop.name,120,true,'Indica il nome del salone.'),kind=d.shop.kind===undefined?'parrucchiere':SHOP_FIELDS.kind(d.shop.kind);
  const city=text(d.shop.city,80),tel=phone(d.shop.phone,false);
  if(await store.json('SELECT to_jsonb(true) AS v FROM users WHERE lower(email)=$1',[mail_]))fail(409,'Esiste già un account con questa email: accedi.');
  let slug=slugify(shopName+(city?'-'+city:''));if(slug.length<3)slug=('salone-'+slug).slice(0,40);if(RESERVED.has(slug))slug+='-1';
  const taken=await store.json("SELECT coalesce(jsonb_agg(slug),'[]') AS v FROM bk_shops WHERE slug=$1 OR slug LIKE $1||'-%'",[slug])||[];
  if(taken.includes(slug)){let i=2;while(taken.includes(slug.slice(0,36)+'-'+i))i++;slug=slug.slice(0,36)+'-'+i;}
  const uid=await store.json("SELECT to_jsonb(nextval(pg_get_serial_sequence('users','id'))) AS v");
  const shopId=randomUUID(),staffId=randomUUID(),first=name.split(/\s+/)[0];
  const services=S.DEFAULT_SERVICES.map((v,i)=>({id:randomUUID(),name:v.name,duration_min:v.duration_min,buffer_min:v.buffer_min||0,price_cents:v.price_cents,position:i}));
  await store.tx([
   q('INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)',[uid,mail_,name,hashPassword(d.password)]),
   q('INSERT INTO bk_shops(id,slug,name,phone,email,city,kind,hours,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)',[shopId,slug,shopName,tel,mail_,city,kind,JSON.stringify(S.DEFAULT_HOURS),uid]),
   q("INSERT INTO bk_members(shop_id,user_id,role) VALUES($1,$2,'owner')",[shopId,uid]),
   q('INSERT INTO bk_staff(shop_id,id,name,color,position) VALUES($1,$2,$3,$4,0)',[shopId,staffId,first,STAFF_COLORS[0]]),
   q('INSERT INTO bk_services(shop_id,id,name,duration_min,buffer_min,price_cents,position) SELECT $1,x.id,x.name,x.duration_min,x.buffer_min,x.price_cents,x.position FROM jsonb_to_recordset($2::jsonb) AS x(id uuid,name text,duration_min int,buffer_min int,price_cents int,position int)',[shopId,JSON.stringify(services)]),
   q('INSERT INTO bk_audit(shop_id,actor_id,action,entity_id,detail) VALUES($1,$2,$3,$1,$4::jsonb)',[shopId,uid,'signup',JSON.stringify({name:shopName,terms_version:'2026-11-18',ip:clientIp(req)})])]);
  res.setHeader('Set-Cookie',cookie(signOwner(uid)));
  return {shop:shopId,slug};
 }
 async function login(store,req,res,d){
  limit(req,'login',20);if(!obj(d))fail(400,'Email o password errati.');
  const mail_=typeof d.email==='string'?d.email.trim().toLowerCase():'';if(!mail_||typeof d.password!=='string'||d.password.length>200)fail(400,'Email o password errati.');
  const u=await store.json('SELECT jsonb_build_object(\'id\',u.id,\'hash\',u.password_hash) AS v FROM users u WHERE lower(u.email)=$1 AND EXISTS(SELECT 1 FROM bk_members m WHERE m.user_id=u.id)',[mail_]);
  if(!u||!verifyPassword(d.password,u.hash))fail(401,'Email o password errati.');
  res.setHeader('Set-Cookie',cookie(signOwner(u.id)));return {ok:true};
 }
 const me=(store,uid)=>store.json("SELECT jsonb_build_object('id',u.id,'name',u.name,'email',u.email,'shops',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'slug',s.slug,'role',m.role) ORDER BY s.created_at) FROM bk_members m JOIN bk_shops s ON s.id=m.shop_id WHERE m.user_id=u.id),'[]')) AS v FROM users u WHERE u.id=$1",[uid]);

 // ----- owner reads -----
 async function member(store,shop,uid){const r=await store.json('SELECT to_jsonb(bk_role($1::uuid,$2::integer)) AS v',[shop,uid]);if(!r)fail(403,'Non hai accesso a questo salone.');return r;}
 async function setup(store,shop,uid){
  const role=await member(store,shop,uid);
  const s=await store.json("SELECT "+SHOP_PUBLIC+"||jsonb_build_object('email',s.email,'staff',"+STAFF_JSON+",'services',"+SERVICES_JSON+",'closures',"+CLOSURES_JSON('(now() AT TIME ZONE s.timezone)::date - 31')+") AS v FROM bk_shops s WHERE s.id=$1",[shop]);
  if(!s)fail(404,'Salone non trovato.');s.role=role;return s;
 }
 async function agenda(store,shop,uid,qs){
  await member(store,shop,uid);const from=date(qs.from),to=qs.to?date(qs.to):from;
  if(to<from||Date.parse(to)-Date.parse(from)>42*86400000)fail(400,'Periodo non valido: al massimo 6 settimane.');
  return store.json("SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'staff_id',a.staff_id,'service_id',a.service_id,'service',v.name,'customer_id',a.customer_id,'customer',c.name,'phone',c.phone,'starts_at',a.starts_at,'ends_at',a.ends_at,'blocks_until',a.blocks_until,'status',a.status,'source',a.source,'price_cents',a.price_cents,'note',a.note) ORDER BY a.starts_at),'[]') AS v FROM bk_appointments a JOIN bk_shops s ON s.id=a.shop_id JOIN bk_services v ON v.shop_id=a.shop_id AND v.id=a.service_id JOIN bk_customers c ON c.shop_id=a.shop_id AND c.id=a.customer_id WHERE a.shop_id=$1 AND a.starts_at>=($2::date::timestamp AT TIME ZONE s.timezone) AND a.starts_at<(($3::date+1)::timestamp AT TIME ZONE s.timezone)",[shop,from,to]);
 }
 async function customers(store,shop,uid,qs){
  await member(store,shop,uid);const t=text(qs.q,80)||'';
  return store.json("SELECT coalesce(jsonb_agg(x ORDER BY x->>'name'),'[]') AS v FROM (SELECT jsonb_build_object('id',c.id,'name',c.name,'phone',c.phone,'email',c.email,'notes',c.notes,'visits',(SELECT count(*) FROM bk_appointments a WHERE a.shop_id=c.shop_id AND a.customer_id=c.id AND a.status IN('confirmed','done')),'last',(SELECT max(a.starts_at) FROM bk_appointments a WHERE a.shop_id=c.shop_id AND a.customer_id=c.id AND a.status IN('confirmed','done'))) AS x FROM bk_customers c WHERE c.shop_id=$1 AND ($2='' OR c.name ILIKE '%'||$2||'%' OR c.phone LIKE '%'||regexp_replace($2,'\\D','','g')||'%') ORDER BY c.name LIMIT 30) t",[shop,t.replace(/[%_\\]/g,'')]);
 }

 // ----- owner writes -----
 const ROLE=(shop,uid,roles)=>q("SELECT bk_assert(bk_role($1::uuid,$2::integer)=ANY($3::text[]),'forbidden','42501')",[shop,uid,roles]);
 const OWNER=['owner'],ANY=['owner','staff'];
 const audit=(shop,uid,action,eid,detail)=>q('INSERT INTO bk_audit(shop_id,actor_id,action,entity_id,detail) VALUES($1,$2,$3,$4,$5::jsonb)',[shop,uid,action,eid||null,JSON.stringify(detail||{})]);
 function setClause(fields,start){const cols=Object.keys(fields);return {sql:cols.map((c,i)=>c+'=$'+(start+i)+(c==='hours'?'::jsonb':c==='staff_ids'?'::uuid[]':'')).join(','),params:cols.map(c=>c==='hours'&&fields[c]!==null?JSON.stringify(fields[c]):fields[c])};}
 async function act(store,uid,action,shop,d,req){
  if(!obj(d))fail(400,'Dati non validi.');
  switch(action){
   case 'shop.save':{const f=pick(d,SHOP_FIELDS);if(!Object.keys(f).length)return {ok:true};const s=setClause(f,2);
    await store.tx([ROLE(shop,uid,OWNER),q('UPDATE bk_shops SET '+s.sql+',updated_at=now() WHERE id=$1',[shop,...s.params]),audit(shop,uid,action,shop,{fields:Object.keys(f)})]);return {ok:true};}
   case 'staff.save':{const f=pick(d,STAFF_FIELDS);const sid=d.id?id(d.id):randomUUID();
    if(d.id){const s=setClause(f,3);if(!Object.keys(f).length)return {id:sid};await store.tx([ROLE(shop,uid,OWNER),q("SELECT bk_assert(EXISTS(SELECT 1 FROM bk_staff WHERE shop_id=$1 AND id=$2),'Operatore non trovato.','P0001')",[shop,sid]),q('UPDATE bk_staff SET '+s.sql+' WHERE shop_id=$1 AND id=$2',[shop,sid,...s.params]),audit(shop,uid,action,sid,{fields:Object.keys(f)})]);}
    else{if(!f.name)fail(400,'Indica il nome.');await store.tx([ROLE(shop,uid,OWNER),q('INSERT INTO bk_staff(shop_id,id,name,color,hours,active,position) VALUES($1,$2,$3,$4,$5::jsonb,$6,coalesce($7,(SELECT coalesce(max(position),-1)+1 FROM bk_staff WHERE shop_id=$1)))',[shop,sid,f.name,f.color??STAFF_COLORS[parseInt(sid.slice(0,2),16)%STAFF_COLORS.length],f.hours?JSON.stringify(f.hours):null,f.active??true,f.position??null]),audit(shop,uid,action,sid,{name:f.name})]);}
    return {id:sid};}
   case 'service.save':{const f=pick(d,SERVICE_FIELDS);const vid=d.id?id(d.id):randomUUID();
    const staffCheck=f.staff_ids&&f.staff_ids.length?[q("SELECT bk_assert((SELECT count(*) FROM bk_staff WHERE shop_id=$1 AND id=ANY($2::uuid[]))=cardinality($2::uuid[]),'Operatore non trovato.','P0001')",[shop,f.staff_ids])]:[];
    if(d.id){const s=setClause(f,3);if(!Object.keys(f).length)return {id:vid};await store.tx([ROLE(shop,uid,OWNER),...staffCheck,q("SELECT bk_assert(EXISTS(SELECT 1 FROM bk_services WHERE shop_id=$1 AND id=$2),'Servizio non trovato.','P0001')",[shop,vid]),q('UPDATE bk_services SET '+s.sql+' WHERE shop_id=$1 AND id=$2',[shop,vid,...s.params]),audit(shop,uid,action,vid,{fields:Object.keys(f)})]);}
    else{if(!f.name||!f.duration_min)fail(400,'Indica nome e durata del servizio.');await store.tx([ROLE(shop,uid,OWNER),...staffCheck,q('INSERT INTO bk_services(shop_id,id,name,description,duration_min,buffer_min,price_cents,staff_ids,active,position) VALUES($1,$2,$3,$4,$5,$6,$7,$8::uuid[],$9,coalesce($10,(SELECT coalesce(max(position),-1)+1 FROM bk_services WHERE shop_id=$1)))',[shop,vid,f.name,f.description??null,f.duration_min,f.buffer_min??0,f.price_cents??null,f.staff_ids||[],f.active??true,f.position??null]),audit(shop,uid,action,vid,{name:f.name})]);}
    return {id:vid};}
   case 'closure.save':{const cid=d.id?id(d.id):randomUUID(),from=date(d.from_date),to=d.to_date?date(d.to_date):from;if(to<from)fail(400,'La fine deve venire dopo l\'inizio.');
    const staff=d.staff_id?id(d.staff_id,'Operatore non valido.'):null,note=text(d.note,200);
    await store.tx([ROLE(shop,uid,OWNER),q('INSERT INTO bk_closures(shop_id,id,staff_id,from_date,to_date,note) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(shop_id,id) DO UPDATE SET staff_id=EXCLUDED.staff_id,from_date=EXCLUDED.from_date,to_date=EXCLUDED.to_date,note=EXCLUDED.note',[shop,cid,staff,from,to,note]),audit(shop,uid,action,cid,{from,to,staff})]);
    return {id:cid};}
   case 'closure.delete':{const cid=id(d.id);await store.tx([ROLE(shop,uid,OWNER),q('DELETE FROM bk_closures WHERE shop_id=$1 AND id=$2',[shop,cid]),audit(shop,uid,action,cid)]);return {ok:true};}
   case 'customer.save':{const cid=d.id?id(d.id):randomUUID(),name=text(d.name,120,true,'Indica il nome del cliente.'),tel=phone(d.phone,false),m=email(d.email,false),notes=text(d.notes,1000);
    await store.tx([ROLE(shop,uid,ANY),q('INSERT INTO bk_customers(shop_id,id,name,phone,email,notes) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(shop_id,id) DO UPDATE SET name=EXCLUDED.name,phone=EXCLUDED.phone,email=EXCLUDED.email,notes=EXCLUDED.notes',[shop,cid,name,tel,m,notes]),audit(shop,uid,action,cid)]);return {id:cid};}
   case 'appointment.create':case 'appointment.move':{
    const moving=action==='appointment.move',aid=moving?id(d.id):randomUUID(),start=iso(d.starts_at,'Scegli un orario.');
    const setup_=await setup(store,shop,uid);
    const service=setup_.services.find(v=>v.id===String(d.service_id||'').toLowerCase());if(!service)fail(400,'Scegli un servizio.');
    const staff=setup_.staff.find(t=>t.id===String(d.staff_id||'').toLowerCase());if(!staff)fail(400,'Scegli un operatore.');
    const ends=new Date(Date.parse(start)+service.duration_min*60000).toISOString(),blocks=new Date(Date.parse(ends)+(service.buffer_min||0)*60000).toISOString();
    // Outside the opening hours or on a closed day the owner must confirm (force); overlaps are always refused by the database.
    if(d.force!==true){const local=S.utcToLocal(start,setup_.timezone);
     const ok=S.freeSlots({date:local.date,tz:setup_.timezone,step_min:1,min_notice_min:0,now:0,service,hours:setup_.hours,staff:setup_.staff,closures:setup_.closures,busy:[],staff_id:staff.id}).some(x=>x.starts_at===start);
     if(!ok)return {needs_confirm:true,message:'Questo orario è fuori dall\'orario di '+staff.name+' o in un giorno di chiusura. Confermi lo stesso?'};}
    const note=text(d.note,500);
    if(moving){await store.tx([ROLE(shop,uid,ANY),q("SELECT bk_assert(EXISTS(SELECT 1 FROM bk_appointments WHERE shop_id=$1 AND id=$2 AND status IN('confirmed','done')),'Appuntamento non trovato.','P0001')",[shop,aid]),
     q('UPDATE bk_appointments SET staff_id=$3,service_id=$4,starts_at=$5,ends_at=$6,blocks_until=$7'+(d.note!==undefined?',note=$8':'')+' WHERE shop_id=$1 AND id=$2',[shop,aid,staff.id,service.id,start,ends,blocks,...(d.note!==undefined?[note]:[])]),audit(shop,uid,action,aid,{starts_at:start,staff:staff.id})]);
     return {id:aid};}
    let cust;
    if(d.customer_id)cust=[q("SELECT bk_assert(EXISTS(SELECT 1 FROM bk_customers WHERE shop_id=$1 AND id=$2),'Cliente non trovato.','P0001')",[shop,id(d.customer_id)])];
    else{if(!obj(d.customer))fail(400,'Indica il cliente.');const cname=text(d.customer.name,120,true,'Indica il nome del cliente.'),tel=phone(d.customer.phone,false);
     d.customer_id=randomUUID();
     cust=tel?[q('INSERT INTO bk_customers(shop_id,id,name,phone) VALUES($1,$2,$3,$4) ON CONFLICT(shop_id,phone) DO UPDATE SET name=EXCLUDED.name',[shop,d.customer_id,cname,tel])]:[q('INSERT INTO bk_customers(shop_id,id,name) VALUES($1,$2,$3)',[shop,d.customer_id,cname])];
     if(tel){await store.tx([ROLE(shop,uid,ANY),...cust,
      q("INSERT INTO bk_appointments(shop_id,id,staff_id,service_id,customer_id,starts_at,ends_at,blocks_until,source,price_cents,note,created_by) SELECT $1,$2,$3,$4,c.id,$5,$6,$7,'owner',$8,$9,$10 FROM bk_customers c WHERE c.shop_id=$1 AND c.phone=$11",[shop,aid,staff.id,service.id,start,ends,blocks,service.price_cents,note,uid,tel]),audit(shop,uid,action,aid,{starts_at:start,staff:staff.id})]);
      return {id:aid};}}
    await store.tx([ROLE(shop,uid,ANY),...cust,
     q("INSERT INTO bk_appointments(shop_id,id,staff_id,service_id,customer_id,starts_at,ends_at,blocks_until,source,price_cents,note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'owner',$9,$10,$11)",[shop,aid,staff.id,service.id,d.customer_id,start,ends,blocks,service.price_cents,note,uid]),audit(shop,uid,action,aid,{starts_at:start,staff:staff.id})]);
    return {id:aid};}
   case 'appointment.status':{const aid=id(d.id);if(!['confirmed','done','no_show','cancelled'].includes(d.status))fail(400,'Stato non valido.');
    await store.tx([ROLE(shop,uid,ANY),q("SELECT bk_assert(EXISTS(SELECT 1 FROM bk_appointments WHERE shop_id=$1 AND id=$2),'Appuntamento non trovato.','P0001')",[shop,aid]),
     q("UPDATE bk_appointments SET status=$3,cancelled_at=CASE WHEN $3='cancelled' THEN now() ELSE NULL END WHERE shop_id=$1 AND id=$2",[shop,aid,d.status]),audit(shop,uid,action,aid,{status:d.status})]);return {ok:true};}
   default:fail(400,'Azione non riconosciuta.');
  }
 }

 return async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
   const qs=req.query||{};
   if(req.method==='GET'){
    const store=deps.getStore();
    switch(qs.resource){
     case 'shop':{const s0=await store.json('SELECT jsonb_build_object(\'timezone\',timezone) AS v FROM bk_shops WHERE slug=$1',[String(qs.slug||'')]);if(!s0)fail(404,'Salone non trovato.');
      return res.status(200).json(publicShop(await shopBySlug(store,qs.slug,todayIn(s0.timezone,nowOf()),1)));}
     case 'slots':return res.status(200).json(await getSlots(store,qs));
     case 'booking':return res.status(200).json(await byToken(store,qs.token));
    }
    const u=deps.getOwner(req);if(!u)fail(401,'Accedi per continuare.');
    switch(qs.resource){
     case 'me':{const m=await me(store,u.uid);if(!m)fail(401,'Accedi per continuare.');return res.status(200).json(m);}
     case 'setup':return res.status(200).json(await setup(store,id(qs.shop,'Salone non valido.'),u.uid));
     case 'agenda':return res.status(200).json(await agenda(store,id(qs.shop,'Salone non valido.'),u.uid,qs));
     case 'customers':return res.status(200).json(await customers(store,id(qs.shop,'Salone non valido.'),u.uid,qs));
    }
    fail(400,'Risorsa non riconosciuta.');
   }
   if(req.method!=='POST')fail(405,'Metodo non consentito.');
   if(String((req.headers||{})['x-ciuffo']||'')!=='1')fail(403,'Richiesta non consentita.');
   let body=req.body;if(typeof body==='string'){try{body=JSON.parse(body);}catch{fail(400,'Richiesta non leggibile.');}}
   if(!obj(body))fail(400,'Richiesta non leggibile.');
   const store=deps.getStore(),action=body.action,data=body.data;
   switch(action){
    case 'book':return res.status(200).json(await book(store,req,data));
    case 'booking.cancel':return res.status(200).json(await cancelByToken(store,req,data));
    case 'auth.signup':return res.status(200).json(await signup(store,req,res,data));
    case 'auth.login':return res.status(200).json(await login(store,req,res,data));
    case 'auth.logout':res.setHeader('Set-Cookie',clearCookie());return res.status(200).json({ok:true});
   }
   const u=deps.getOwner(req);if(!u)fail(401,'Accedi per continuare.');
   return res.status(200).json(await act(store,u.uid,action,id(body.shop,'Salone non valido.'),data,req));
  }catch(e){const err=dbError(e);return res.status(err.status).json({error:err.message});}
 };
}
module.exports={createHandler,getOwner,signOwner,verifyOwner,phone,slugify,BkError,COOKIE};
