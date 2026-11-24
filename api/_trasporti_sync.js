/* Plancia (Trasporti) — the office program and the drivers' phones share the data of the company.
   Called by api/_trasporti.js for these actions of POST /api/trasporti:
     sync               {since, changes:[{coll,id,data|deleted}]} → {rev, records, role}   office member or driver's phone
     azienda.crea       {name}            → the signed-in user opens their company (only where TRASPORTI_REGISTRAZIONE=1)
     autista.invita     {driver_id}       → {code, expires_at}: the office gives it to the driver (valid 7 days, one use)
     autista.scollega   {driver_id}       → the phones of that driver stop working
     autista.entra      {code}            → {token, driver_id, company}: no sign-in, the code is the key. The phone then
                                            sends the token in the header X-Plancia-Device.
     posizioni.elenco   {}                → positions of the last 3 days, for the map of the office
     file.salva         {id, media_type, image (base64), trip_id?} → the photo of a document, kept with the company
     file.leggi         {id}              → {media_type, image}: the office, or the driver who took it
   Tables: migrations/trasporti/006_sincronizzazione.sql. Codes and tokens are stored only as SHA-256. */
'use strict';
const crypto=require('crypto');
const S=require('../lib/trasporti/sync');
const sha=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
function failure(status,message){const e=new Error(message);e.status=status;return e;}
const OFFICE=['owner','admin','office'];
const TOKEN=/^[a-f0-9]{64}$/;

const defaultDb={
 async memberOf(uid){const {sql}=require('./_db');const r=await sql()`SELECT m.company_id,m.role,c.name FROM tr_members m JOIN tr_companies c ON c.id=m.company_id WHERE m.user_id=${uid} ORDER BY m.role IN('owner','admin','office') DESC LIMIT 1`;return r[0]||null;},
 async deviceOf(hash){const {sql}=require('./_db');const r=await sql()`UPDATE tr_driver_devices SET last_seen_at=now() WHERE token_hash=${hash} AND revoked_at IS NULL RETURNING company_id,driver_id`;return r[0]||null;},
 async createCompany(uid,name){
  const {sql}=require('./_db');const id=crypto.randomUUID();
  await sql().transaction(q=>[q`INSERT INTO tr_companies(id,name,created_by) VALUES(${id},${name},${uid})`,q`INSERT INTO tr_members(company_id,user_id,role) VALUES(${id},${uid},'owner')`]);
  return id;
 },
 async pull(company,since){const {sql}=require('./_db');return sql()`SELECT coll,id,data,deleted,rev::float8 AS rev FROM tr_records WHERE company_id=${company} AND rev>${since} ORDER BY rev LIMIT 300`;},
 async trips(company){const {sql}=require('./_db');return sql()`SELECT id,data FROM tr_records WHERE company_id=${company} AND coll='trips' AND NOT deleted`;},
 async get(company,keys){
  if(!keys.length)return [];
  const {sql}=require('./_db');
  return sql()`SELECT r.coll,r.id,r.data,r.deleted FROM tr_records r JOIN jsonb_to_recordset(${JSON.stringify(keys)}::jsonb) AS k(coll text,id text) ON k.coll=r.coll AND k.id=r.id WHERE r.company_id=${company}`;
 },
 async push(company,changes,actor){
  if(!changes.length)return 0;
  const {sql}=require('./_db');
  const r=await sql()`INSERT INTO tr_records(company_id,coll,id,data,deleted,updated_by,updated_by_driver)
   SELECT ${company}::uuid,x.coll,x.id,x.data,x.deleted,${actor.uid||null},${actor.driver||null}
   FROM jsonb_to_recordset(${JSON.stringify(changes)}::jsonb) AS x(coll text,id text,data jsonb,deleted boolean)
   ON CONFLICT(company_id,coll,id) DO UPDATE SET data=EXCLUDED.data,deleted=EXCLUDED.deleted,rev=nextval('tr_rev'),updated_at=now(),updated_by=EXCLUDED.updated_by,updated_by_driver=EXCLUDED.updated_by_driver
   WHERE tr_records.data IS DISTINCT FROM EXCLUDED.data OR tr_records.deleted IS DISTINCT FROM EXCLUDED.deleted RETURNING 1`;
  return r.length;
 },
 async createInvite(company,driver,hash,uid){const {sql}=require('./_db');const r=await sql()`INSERT INTO tr_driver_invites(code_hash,company_id,driver_id,created_by,expires_at) VALUES(${hash},${company},${driver},${uid},now()+interval '7 days') RETURNING expires_at`;return r[0].expires_at;},
 async useInvite(hash,tokenHash){
  const {sql}=require('./_db');
  const r=await sql()`WITH i AS (UPDATE tr_driver_invites SET used_at=now() WHERE code_hash=${hash} AND used_at IS NULL AND expires_at>now() RETURNING company_id,driver_id),
   d AS (INSERT INTO tr_driver_devices(token_hash,company_id,driver_id) SELECT ${tokenHash},company_id,driver_id FROM i RETURNING company_id,driver_id)
   SELECT d.company_id,d.driver_id,c.name AS company FROM d JOIN tr_companies c ON c.id=d.company_id`;
  return r[0]||null;
 },
 async revoke(company,driver){
  const {sql}=require('./_db');
  const r=await sql().transaction(q=>[q`UPDATE tr_driver_devices SET revoked_at=now() WHERE company_id=${company} AND driver_id=${driver} AND revoked_at IS NULL RETURNING 1`,q`UPDATE tr_driver_invites SET used_at=now() WHERE company_id=${company} AND driver_id=${driver} AND used_at IS NULL`]);
  return r[0].length;
 },
 async devices(company){const {sql}=require('./_db');return sql()`SELECT driver_id,count(*)::int AS phones,max(last_seen_at) AS last_seen_at FROM tr_driver_devices WHERE company_id=${company} AND revoked_at IS NULL GROUP BY driver_id`;},
 async saveFile(company,f,actor){
  const {sql}=require('./_db');
  const r=await sql()`INSERT INTO tr_files(company_id,id,media_type,bytes,trip_id,created_by,created_by_driver) VALUES(${company},${f.id},${f.media_type},decode(${f.image},'base64'),${f.trip_id||null},${actor.uid||null},${actor.driver||null}) ON CONFLICT(company_id,id) DO NOTHING RETURNING 1`;
  return r.length;
 },
 async readFile(company,id){const {sql}=require('./_db');return (await sql()`SELECT media_type,encode(bytes,'base64') AS image,created_by_driver FROM tr_files WHERE company_id=${company} AND id=${id}`)[0]||null;},
 async positions(company){const {sql}=require('./_db');return sql()`SELECT vehicle_id,driver_id,trip_id,at,lat,lon,speed_kmh,accuracy_m,source FROM tr_positions WHERE company_id=${company} AND at>now()-interval '3 days' ORDER BY at DESC LIMIT 20000`;},
 async insertPositions(company,driver,vehicle,points){
  const {sql}=require('./_db');
  const r=await sql()`INSERT INTO tr_positions(company_id,vehicle_id,driver_id,at,lat,lon,source,trip_id,speed_kmh,accuracy_m)
   SELECT ${company}::uuid,${vehicle}::uuid,${driver}::uuid,x.at,x.lat,x.lon,'telefono',x.trip_id,x.speed_kmh,x.accuracy_m
   FROM jsonb_to_recordset(${JSON.stringify(points)}::jsonb) AS x(at timestamptz,lat double precision,lon double precision,trip_id uuid,speed_kmh real,accuracy_m real)
   ON CONFLICT DO NOTHING RETURNING 1`;
  return r.length;
 }
};

const ACTIONS=['sync','azienda.crea','autista.invita','autista.scollega','autista.entra','posizioni.elenco','file.salva','file.leggi'];
const FILE_MEDIA=['image/jpeg','image/png','image/webp','application/pdf'],MAX_FILE=4200000;

function create({db=defaultDb,now=()=>Date.now(),random=n=>crypto.randomBytes(n),open=()=>process.env.TRASPORTI_REGISTRAZIONE==='1'}={}){
 const tries=new Map();
 async function device(req){
  const t=req.headers&&req.headers['x-plancia-device'];
  if(typeof t!=='string'||!TOKEN.test(t))return null;
  const d=await db.deviceOf(sha(t));
  return d?{company_id:d.company_id,driver_id:d.driver_id}:null;
 }
 // who is asking: the phone of a driver, or a signed-in member of a company
 async function actor(user,dev){
  if(dev)return {kind:'driver',company:dev.company_id,driver:dev.driver_id};
  if(!user||!user.uid)throw failure(401,'Accedi per usare Plancia.');
  const m=await db.memberOf(user.uid);
  return m?{kind:OFFICE.includes(m.role)?'office':'viewer',company:m.company_id,uid:user.uid,name:m.name}:{kind:'none',uid:user.uid};
 }
 async function handle(action,data,{user,dev,req}){
  data=data&&typeof data==='object'?data:{};
  if(action==='autista.entra'){
   const ip=String(req&&req.headers&&req.headers['x-forwarded-for']||'').split(',')[0].trim()||'?';
   const t=now(),list=(tries.get(ip)||[]).filter(x=>t-x<600000);
   if(list.length>=10)throw failure(429,'Troppi tentativi: riprova tra dieci minuti.');
   list.push(t);tries.set(ip,list);if(tries.size>5000)tries.clear();
   const code=S.cleanCode(data.code);if(!code)throw failure(400,'Il codice ha 10 caratteri: controllalo con l\'ufficio.');
   const token=random(32).toString('hex');
   const r=await db.useInvite(sha(code),sha(token));
   if(!r)throw failure(404,'Codice non valido o già usato: chiedine uno nuovo all\'ufficio.');
   return {token,driver_id:r.driver_id,company:r.company};
  }
  const a=await actor(user,dev);
  if(action==='azienda.crea'){
   if(a.kind==='driver')throw failure(403,'Non consentito.');
   if(a.kind!=='none')throw failure(409,'Hai già un\'azienda in Plancia.');
   if(!open())throw failure(403,'L\'attivazione la fa Plancia: scrivici e ti apriamo l\'azienda.');
   const name=String(data.name||'').trim().slice(0,200);if(!name)throw failure(400,'Scrivi il nome dell\'azienda.');
   const id=await db.createCompany(a.uid,name);
   await db.push(id,[{coll:'one',id:'company',deleted:false,data:{name,_seeded:true}}],{uid:a.uid});
   return {company_id:id,name};
  }
  if(action==='sync'){
   if(a.kind==='none')return {no_company:true,can_create:open()};
   const since=Number.isFinite(Number(data.since))&&Number(data.since)>0?Math.floor(Number(data.since)):0;
   let changes;try{changes=S.cleanChanges(data.changes);}catch(e){throw failure(400,e.message);}
   let rejected=0;
   if(a.kind==='viewer'){rejected=changes.length;changes=[];}
   if(a.kind==='driver'&&changes.length){
    const trips={};for(const t of await db.trips(a.company))trips[t.id]=t.data;
    const cur={};for(const r of await db.get(a.company,changes.map(c=>({coll:c.coll,id:c.id}))))cur[r.coll+'/'+r.id]=r.deleted?null:r.data;
    const ok=[];
    // trips first, so that what belongs to a trip created on the phone finds it
    for(const c of changes.filter(c=>c.coll==='trips')){const d=S.driverChange(c,a.driver,cur['trips/'+c.id]||null,trips);if(d){const rec={...d,id:c.id};trips[c.id]=rec;ok.push({coll:'trips',id:c.id,deleted:false,data:rec});}else rejected++;}
    for(const c of changes.filter(c=>c.coll!=='trips')){const d=S.driverChange(c,a.driver,cur[c.coll+'/'+c.id]||null,trips);if(d)ok.push({coll:c.coll,id:c.id,deleted:false,data:{...d,id:c.id}});else rejected++;}
    changes=ok;
   }
   if(changes.length)await db.push(a.company,changes,a.kind==='driver'?{driver:a.driver}:{uid:a.uid});
   // at most 300 records and about 3 MB per answer (photos travel inside the records): the device asks again while `more`
   const all=await db.pull(a.company,since);let records=[],size=0,rev=since;
   for(const r of all){const n=r.deleted?0:JSON.stringify(r.data).length;if(records.length&&size+n>3000000)break;records.push(r);size+=n;rev=Math.max(rev,Number(r.rev)||0);}
   const more=records.length<all.length||all.length>=300;
   if(a.kind==='driver'){const trips={};for(const t of await db.trips(a.company))trips[t.id]=t.data;records=S.driverView(records,a.driver,trips);}
   const out={rev,records:records.map(r=>({coll:r.coll,id:r.id,deleted:!!r.deleted,data:r.deleted?undefined:r.data})),role:a.kind,rejected,more,company_id:a.company};
   if(a.kind==='driver')out.driver_id=a.driver;
   if(a.kind==='office')out.phones=await db.devices(a.company);
   return out;
  }
  if(action==='file.salva'){
   if(a.kind!=='office'&&a.kind!=='driver')throw failure(403,'Non consentito.');
   if(typeof data.id!=='string'||!S.ID.test(data.id))throw failure(400,'File non valido.');
   if(!FILE_MEDIA.includes(data.media_type))throw failure(400,'Formato non supportato: usa una foto JPEG, PNG, WebP o un PDF.');
   if(typeof data.image!=='string'||!data.image||data.image.length>MAX_FILE||!/^[A-Za-z0-9+/]+={0,2}$/.test(data.image))throw failure(data.image&&data.image.length>MAX_FILE?413:400,'File troppo grande o non valido.');
   const trip=typeof data.trip_id==='string'&&S.ID.test(data.trip_id)?data.trip_id:null;
   await db.saveFile(a.company,{id:data.id,media_type:data.media_type,image:data.image,trip_id:trip},a.kind==='driver'?{driver:a.driver}:{uid:a.uid});
   return {saved:true};
  }
  if(action==='file.leggi'){
   if(a.kind==='none')throw failure(403,'Non consentito.');
   if(typeof data.id!=='string'||!S.ID.test(data.id))throw failure(400,'File non valido.');
   const f=await db.readFile(a.company,data.id);
   if(!f||(a.kind==='driver'&&f.created_by_driver!==a.driver))throw failure(404,'File non trovato.');
   return {media_type:f.media_type,image:f.image.replace(/\s/g,'')};
  }
  if(a.kind!=='office')throw failure(403,'Questa operazione la fa l\'ufficio.');
  if(action==='posizioni.elenco')return {positions:(await db.positions(a.company)).map(p=>({...p,at:new Date(p.at).toISOString()}))};
  const driver=typeof data.driver_id==='string'&&S.ID.test(data.driver_id)?data.driver_id:null;
  if(!driver)throw failure(400,'Autista non valido.');
  if(action==='autista.scollega')return {phones:await db.revoke(a.company,driver)};
  if(action==='autista.invita'){
   const r=(await db.get(a.company,[{coll:'drivers',id:driver}]))[0];
   if(!r||r.deleted)throw failure(404,'Salva prima l\'autista, poi invitalo.');
   const code=S.codeFrom(random(10));
   const expires=await db.createInvite(a.company,driver,sha(code),a.uid);
   return {code,expires_at:new Date(expires).toISOString(),name:r.data&&r.data.name};
  }
  throw failure(400,'Azione non riconosciuta.');
 }
 return {handle,device,ACTIONS};
}
module.exports={create,defaultDb,ACTIONS,sha};
