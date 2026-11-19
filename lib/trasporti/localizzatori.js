/* Trasporti — vehicle positions from the trackers the vehicles already have (Webfleet, Verizon Connect Reveal,
   Targa Telematics, rFMS from the truck maker), with the driver's phone only as a fallback where the tracker is
   silent. Every source is turned into the same position {vehicle_id, at, lat, lon, speed_kmh, odometer_km, source}
   with the time in local Italian wall-clock "AAAA-MM-GGTHH:MM" like the rest of lib/trasporti.
   Also: km of a trip from the positions (odometer first, then distance between points) and the alerts of the
   command center (vehicle moving with no trip, open trip with no position, trip open too long, silent tracker).
   Pure functions, plus request builders for the server (fetch is injected, credentials never reach the browser).
   The field names of each provider follow its public documentation; check them on the first real account. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixTrLocalizzatori=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';

const PROVIDERS={
 webfleet:{label:'Webfleet (Bridgestone)',api:true,note:'WEBFLEET.connect: account, utente API, password e chiave API dal pannello Webfleet.'},
 verizon:{label:'Verizon Connect Reveal',api:true,note:'Reveal REST API: utente e password API, App ID dal portale sviluppatori Verizon Connect.'},
 targa:{label:'Targa Telematics',api:false,note:'Per ora con l\'export CSV o Excel delle posizioni; l\'API si attiva con il contratto Targa dell\'azienda.'},
 rfms:{label:'rFMS (casa costruttrice)',api:true,note:'Standard rFMS 4 di Volvo, Scania, DAF, MAN, Mercedes, Iveco, Renault: indirizzo e credenziali dal portale della casa.'},
 file:{label:'File di export (CSV)',api:false,note:'Qualsiasi export con data e ora, targa o codice, latitudine e longitudine.'},
 telefono:{label:'Telefono dell\'autista',api:false,note:'Localizzatore principale: l\'app Plancia sul telefono, solo con un viaggio aperto. Dove c\'è anche un localizzatore sul mezzo copre i momenti in cui quello tace.'}
};

const pad=n=>String(n).padStart(2,'0');
const num=v=>{if(typeof v==='number')return Number.isFinite(v)?v:null;if(v==null||v==='')return null;const n=Number(String(v).trim().replace(',','.'));return Number.isFinite(n)?n:null;};
const plateOf=v=>{const s=String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');return s.length>=4&&s.length<=10?s:null;};
const norm=s=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

// An instant with a zone (ISO with Z or +hh:mm, or epoch ms) → Italian wall clock. Without a zone the text is
// already local: it is only reformatted.
const ROME=typeof Intl!=='undefined'?new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}):null;
function romeOf(ms){const p={};for(const x of ROME.formatToParts(new Date(ms)))p[x.type]=x.value;return p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute;}
function localTime(v){
 if(v==null||v==='')return null;
 if(typeof v==='number')return Number.isFinite(v)?romeOf(v<1e11?v*1000:v):null;
 const s=String(v).trim();
 let m=s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i);
 if(m){if(m[7]){const z=m[7].toUpperCase()==='Z'?'Z':m[7].length===5?m[7].slice(0,3)+':'+m[7].slice(3):m[7];const ms=Date.parse(m[1]+'-'+m[2]+'-'+m[3]+'T'+pad(m[4])+':'+m[5]+':'+(m[6]||'00')+z);return Number.isFinite(ms)?romeOf(ms):null;}
  return m[1]+'-'+m[2]+'-'+m[3]+'T'+pad(m[4])+':'+m[5];}
 m=s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})[ T,]+(\d{1,2})[:.](\d{2})/);
 if(m)return m[3]+'-'+pad(m[2])+'-'+pad(m[1])+'T'+pad(m[4])+':'+m[5];
 return null;
}
const minutes=s=>{const m=String(s||'').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);return m?Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5])/60000:null;};

function point(o){
 const lat=num(o.lat),lon=num(o.lon),at=localTime(o.at);
 if(lat==null||lon==null||!at||Math.abs(lat)>90||Math.abs(lon)>180||(lat===0&&lon===0))return null;
 return {ref:o.ref!=null&&o.ref!==''?String(o.ref).trim():null,plate:plateOf(o.plate),vin:o.vin?String(o.vin).trim().toUpperCase():null,name:o.name?String(o.name).trim().slice(0,80):null,
  at,lat:Math.round(lat*1e5)/1e5,lon:Math.round(lon*1e5)/1e5,speed_kmh:num(o.speed),odometer_km:num(o.odometer),ignition:o.ignition==null?null:!!o.ignition,source:o.source};
}
const list=(j,...keys)=>{if(Array.isArray(j))return j;for(const k of keys){const v=k.split('.').reduce((o,p)=>o&&o[p],j);if(Array.isArray(v))return v;}return j&&typeof j==='object'?[j]:[];};

// WEBFLEET.connect showObjectReportExtern (outputformat=json): coordinates in micro-degrees, odometer in 100 m.
function fromWebfleet(j){
 if(j&&j.errorCode)throw new Error('Webfleet: '+(j.errorMsg||('errore '+j.errorCode)));
 return list(j).map(o=>point({ref:o.objectno,name:o.objectname,plate:o.objectname,source:'webfleet',
  lat:o.latitude_mdeg!=null?num(o.latitude_mdeg)/1e6:o.latitude,lon:o.longitude_mdeg!=null?num(o.longitude_mdeg)/1e6:o.longitude,
  at:o.pos_time||o.msgtime,speed:o.speed,odometer:o.odometer!=null?num(o.odometer)/10:null,ignition:o.ignition!=null?String(o.ignition)==='1':null})).filter(Boolean);
}
// Verizon Connect Reveal: /rad/v1/vehicles/{n}/location, or a list of them.
function fromVerizon(j){
 return list(j,'Data','data','Vehicles').map(o=>point({ref:o.VehicleNumber??o.vehicleNumber,name:o.VehicleName??o.Name,plate:o.LicensePlate??o.RegistrationNumber,vin:o.VIN??o.Vin,source:'verizon',
  lat:o.Latitude??o.latitude,lon:o.Longitude??o.longitude,at:o.UpdateUTC??o.UpdateUtc??o.LastUpdated,speed:o.Speed??o.speed,odometer:o.CurrentOdometer??o.Odometer,ignition:o.IgnitionStatus!=null?/on|true|1/i.test(String(o.IgnitionStatus)):null})).filter(Boolean);
}
// rFMS 4 vehiclepositions: gnssPosition per VIN, times in UTC.
function fromRfms(j){
 return list(j,'vehiclePositionResponse.vehiclePositions','vehiclePositions').map(o=>{const g=o.gnssPosition||{};
  return point({vin:o.vin,ref:o.vin,source:'rfms',lat:g.latitude,lon:g.longitude,at:g.positionDateTime||o.createdDateTime||o.receivedDateTime,speed:g.speed??o.wheelBasedSpeed,
   odometer:o.hrTotalVehicleDistance!=null?num(o.hrTotalVehicleDistance)/1000:null});}).filter(Boolean);
}

// CSV export of any tracker (Targa, Webfleet reports, others): header found in the first 15 lines.
const ALIASES={
 at:['data ora','data e ora','dataora','timestamp','date time','datetime','ora posizione','data posizione','data ora posizione','gps time','time','orario'],
 date:['data','date','giorno'],time:['ora','hour'],
 plate:['targa','plate','license plate','registration','targa veicolo','mezzo','veicolo','vehicle','automezzo'],
 ref:['id','codice','unita','unit','device','dispositivo','object','objectno','imei','seriale'],vin:['vin','telaio'],
 lat:['lat','latitudine','latitude','y'],lon:['lon','lng','long','longitudine','longitude','x'],
 speed:['velocita','speed','km h','kmh','velocita km h'],odometer:['km','odometro','odometer','contachilometri','km totali','chilometri']
};
function splitLine(line,sep){const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(q){if(ch==='"'){if(line[i+1]==='"'){cur+='"';i++;}else q=false;}else cur+=ch;}else if(ch==='"')q=true;else if(ch===sep){out.push(cur);cur='';}else cur+=ch;}out.push(cur);return out.map(s=>s.trim());}
function fromRows(rows,source){
 let header=-1,map=null;
 for(let i=0;i<Math.min(15,rows.length)&&header<0;i++){
  const cols=rows[i].map(norm);const m={};
  for(const [key,names] of Object.entries(ALIASES)){const idx=cols.findIndex((c,j)=>names.includes(c)&&!Object.values(m).includes(j));if(idx>-1)m[key]=idx;}
  if(m.lat!=null&&m.lon!=null&&(m.at!=null||m.date!=null)&&(m.plate!=null||m.ref!=null||m.vin!=null)){header=i;map=m;}
 }
 if(header<0)return {positions:[],skipped:[],error:'Non trovo le colonne: servono data e ora, targa o codice del mezzo, latitudine e longitudine.'};
 const positions=[],skipped=[];
 for(let i=header+1;i<rows.length;i++){
  const c=rows[i],get=k=>map[k]!=null?c[map[k]]:null;
  const at=get('at')||(get('date')?get('date')+' '+(get('time')||''):null);
  const p=point({at:at&&String(at).trim(),lat:get('lat'),lon:get('lon'),plate:get('plate'),ref:get('ref')??get('plate'),vin:get('vin'),speed:get('speed'),odometer:get('odometer'),source});
  if(p)positions.push(p);else if(c.some(x=>String(x||'').trim()))skipped.push({line:i+1});
 }
 return {positions,skipped,error:null};
}
function fromCsv(text,source='file'){
 const lines=String(text||'').replace(/^﻿/,'').split(/\r?\n/).filter(l=>l.trim());
 if(!lines.length)return {positions:[],skipped:[],error:'File vuoto.'};
 const first=lines.slice(0,15).join('\n');const sep=[';','\t',','].map(s=>[s,(first.match(new RegExp(s==='\t'?'\\t':s,'g'))||[]).length]).sort((a,b)=>b[1]-a[1])[0][0];
 return fromRows(lines.map(l=>splitLine(l,sep)),source);
}
function parse(provider,payload){
 switch(provider){
  case 'webfleet':return {positions:fromWebfleet(payload),skipped:[],error:null};
  case 'verizon':return {positions:fromVerizon(payload),skipped:[],error:null};
  case 'rfms':return {positions:fromRfms(payload),skipped:[],error:null};
  default:return Array.isArray(payload)?fromRows(payload,provider||'file'):fromCsv(payload,provider||'file');
 }
}

// Which vehicle a tracker position belongs to: tracker code, then VIN, then plate.
function assign(positions,vehicles){
 const byRef=new Map(),byVin=new Map(),byPlate=new Map();
 for(const v of vehicles||[]){if(v.tracker_ref)byRef.set(String(v.tracker_ref).trim(),v);if(v.vin)byVin.set(String(v.vin).trim().toUpperCase(),v);if(v.plate)byPlate.set(plateOf(v.plate),v);}
 const out=[],unknown=new Map();
 for(const p of positions||[]){
  const v=(p.ref&&byRef.get(p.ref))||(p.vin&&byVin.get(p.vin))||(p.plate&&byPlate.get(p.plate))||(p.ref&&byPlate.get(plateOf(p.ref)));
  if(v)out.push({vehicle_id:v.id,at:p.at,lat:p.lat,lon:p.lon,speed_kmh:p.speed_kmh,odometer_km:p.odometer_km,source:p.source||'localizzatore'});
  else{const k=p.ref||p.vin||p.plate||'?';unknown.set(k,(unknown.get(k)||0)+1);}
 }
 return {positions:out,unknown:[...unknown].map(([ref,count])=>({ref,count}))};
}

/* Tracker first: a phone position is kept only where the vehicle's tracker gave nothing within `gapMinutes`.
   Duplicates (same vehicle, minute and source) are dropped. Sorted by vehicle and time. */
function merge(positions,{gapMinutes=20}={}){
 const seen=new Set(),tracker=new Map(),all=[];
 for(const p of positions||[]){const k=p.vehicle_id+'|'+p.at+'|'+p.source;if(seen.has(k))continue;seen.add(k);all.push(p);
  if(p.source!=='telefono'){(tracker.get(p.vehicle_id)||tracker.set(p.vehicle_id,[]).get(p.vehicle_id)).push(minutes(p.at));}}
 return all.filter(p=>{if(p.source!=='telefono')return true;const ts=tracker.get(p.vehicle_id);if(!ts)return true;const m=minutes(p.at);return !ts.some(t=>Math.abs(t-m)<=gapMinutes);})
  .sort((a,b)=>a.vehicle_id<b.vehicle_id?-1:a.vehicle_id>b.vehicle_id?1:a.at<b.at?-1:a.at>b.at?1:0);
}

function haversineKm(a,b){const R=6371,r=x=>x*Math.PI/180;const dLat=r(b.lat-a.lat),dLon=r(b.lon-a.lon);const h=Math.sin(dLat/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));}
const inTrip=(p,t,now)=>{const m=minutes(p.at),a=minutes(t.started_at),b=t.ended_at?minutes(t.ended_at):now;return p.vehicle_id===t.vehicle_id&&m!=null&&m>=a&&m<=b;};

/* Km of a trip: from the odometer when the tracker gives it (exact), otherwise the distance between consecutive
   points (a minimum: the road is longer than the straight lines). null when there are fewer than two points. */
function tripKm(trip,positions,nowAt){
 const now=minutes(nowAt)??Infinity;
 const ps=(positions||[]).filter(p=>inTrip(p,trip,now)).sort((a,b)=>a.at<b.at?-1:1);
 if(ps.length<2)return null;
 const od=ps.filter(p=>p.odometer_km!=null);
 if(od.length>=2){const d=od[od.length-1].odometer_km-od[0].odometer_km;if(d>=0&&d<5000)return {km:Math.round(d),method:'contachilometri',points:ps.length};}
 let d=0;for(let i=1;i<ps.length;i++)d+=haversineKm(ps[i-1],ps[i]);
 return {km:Math.round(d),method:'punti_gps',points:ps.length};
}

/* Alerts for the command center, most serious first.
   - moving with no trip: two positions of a vehicle outside every trip more than 2 km apart, or speed > 10 km/h
   - open trip with no position for `silentMinutes` (default 90): tracker off or phone without signal
   - trip open for more than `longHours` (default 16): forgotten to close?
   - tracker silent: a vehicle with a tracker and no position in the last 3 days (a parked truck may send nothing) */
function alerts({vehicles,trips,positions,nowAt,silentMinutes=90,longHours=16}){
 const now=minutes(nowAt);const out=[];
 const byV=new Map();for(const p of positions||[])(byV.get(p.vehicle_id)||byV.set(p.vehicle_id,[]).get(p.vehicle_id)).push(p);
 for(const v of vehicles||[]){
  const ps=(byV.get(v.id)||[]).slice().sort((a,b)=>a.at<b.at?-1:1);
  const vt=(trips||[]).filter(t=>t.vehicle_id===v.id);
  const outside=ps.filter(p=>!vt.some(t=>{const a=minutes(t.started_at)-15,b=(t.ended_at?minutes(t.ended_at):now??Infinity)+15,m=minutes(p.at);return m>=a&&m<=b;}));
  const recent=outside.filter(p=>now==null||now-minutes(p.at)<=24*60);
  let moving=recent.find(p=>p.speed_kmh>10);
  if(!moving)for(let i=1;i<recent.length;i++)if(minutes(recent[i].at)-minutes(recent[i-1].at)<=120&&haversineKm(recent[i-1],recent[i])>2){moving=recent[i];break;}
  if(moving)out.push({level:'alto',kind:'senza_viaggio',vehicle_id:v.id,at:moving.at,text:v.plate+' in movimento senza un viaggio aperto ('+moving.at.slice(11)+'): viaggio non registrato o uso del mezzo da verificare.'});
  for(const t of vt.filter(t=>!t.ended_at)){
   const a=minutes(t.started_at);
   if(now!=null&&now-a>longHours*60)out.push({level:'medio',kind:'viaggio_lungo',vehicle_id:v.id,trip_id:t.id,at:t.started_at,text:'Viaggio di '+v.plate+' aperto da più di '+longHours+' ore: l\'autista si è dimenticato di chiuderlo?'});
   const last=ps.filter(p=>minutes(p.at)>=a).pop();
   const since=last?minutes(last.at):a;
   if(now!=null&&now-since>silentMinutes)out.push({level:'medio',kind:'senza_posizione',vehicle_id:v.id,trip_id:t.id,at:last?last.at:t.started_at,text:v.plate+' in viaggio senza posizioni da '+String(Math.round((now-since)/60*10)/10).replace('.',',')+' ore: localizzatore spento o telefono senza rete.'});
  }
  if(v.tracker&&v.tracker!=='telefono'&&now!=null){const last=ps.filter(p=>p.source!=='telefono').pop();if(!last||now-minutes(last.at)>72*60)out.push({level:'basso',kind:'localizzatore_muto',vehicle_id:v.id,at:last?last.at:null,text:'Il localizzatore di '+v.plate+' non manda posizioni da più di 3 giorni.'});}
 }
 const rank={alto:0,medio:1,basso:2};
 return out.sort((a,b)=>rank[a.level]-rank[b.level]||String(b.at||'').localeCompare(String(a.at||'')));
}

/* Server side: the request to make for each provider. `creds` come from the server environment, never from the
   browser. Returns {url, headers} or a list of them (Verizon is per vehicle after a token). */
function webfleetRequest(c){
 const q=new URLSearchParams({account:c.account,apikey:c.apikey,lang:'it',action:'showObjectReportExtern',outputformat:'json',useUTF8:'true',useISO8601:'true'});
 return {url:'https://csv.webfleet.com/extern?'+q,headers:{Authorization:'Basic '+b64(c.username+':'+c.password)}};
}
function rfmsRequest(c){
 const base=String(c.base_url||'').replace(/\/+$/,'');if(!/^https:\/\//.test(base))throw new Error('rFMS: indirizzo https mancante.');
 return {url:base+'/vehiclepositions?latestOnly=true',headers:{Accept:'application/vnd.fmsstandard.com.vehiclepositions.v4.0+json; UTF-8',Authorization:c.token?'Bearer '+c.token:'Basic '+b64(c.username+':'+c.password)}};
}
const b64=s=>typeof Buffer!=='undefined'?Buffer.from(s,'utf8').toString('base64'):btoa(unescape(encodeURIComponent(s)));
async function fetchPositions(provider,c,{fetch:f=globalThis.fetch,timeoutMs=15000}={}){
 const get=async(req,kind='json')=>{const ctl=typeof AbortController!=='undefined'?new AbortController():null;const tm=ctl&&setTimeout(()=>ctl.abort(),timeoutMs);
  try{const r=await f(req.url,{headers:req.headers,signal:ctl&&ctl.signal});if(!r.ok)throw new Error(PROVIDERS[provider].label+': risposta '+r.status+'.');return kind==='text'?(await r.text()).trim():await r.json();}finally{tm&&clearTimeout(tm);}};
 if(provider==='webfleet')return fromWebfleet(await get(webfleetRequest(c)));
 if(provider==='rfms')return fromRfms(await get(rfmsRequest(c)));
 if(provider==='verizon'){
  const base=c.base_url||'https://fim.api.eu.fleetmatics.com';
  const token=await get({url:base+'/token',headers:{Authorization:'Basic '+b64(c.username+':'+c.password),Accept:'text/plain'}},'text');
  const auth={Authorization:'Atmosphere atmosphere_app_id='+c.app_id+', Bearer '+token.replace(/^"|"$/g,''),Accept:'application/json'};
  const out=[];for(const n of c.vehicles||[]){try{out.push(...fromVerizon(await get({url:base+'/rad/v1/vehicles/'+encodeURIComponent(n)+'/location',headers:auth})));}catch(e){if(!/risposta 404/.test(e.message))throw e;}}
  return out;
 }
 throw new Error('Questo localizzatore si collega per ora con il file di export.');
}

return {PROVIDERS,parse,fromWebfleet,fromVerizon,fromRfms,fromCsv,fromRows,assign,merge,tripKm,alerts,haversineKm,localTime,minutes,webfleetRequest,rfmsRequest,fetchPositions};
});
