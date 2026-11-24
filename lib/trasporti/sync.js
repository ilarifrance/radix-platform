/* Plancia (Trasporti) — synchronisation between the phones of the drivers and the office program.
   The data set of a company is a set of records {coll, id, data}; every device keeps its copy (so it works without
   signal), sends what it changed and receives what the others changed. The server numbers every change (rev).
   Pure functions, shared by the browser (trasporti/sync.js) and the server (api/_trasporti.js).
   A driver's phone sees and changes only its own work: see driverView and driverChange. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixTrSync=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// collections of records with an id; positions travel on their own (posizioni.telefono / posizioni.elenco)
const COLLS=['vehicles','drivers','customers','consignees','trips','shipments','documents','costs','issues','rate_cards','invoices','payslips','cost_documents'];
// single objects of the data set, kept as records of the collection "one"
const ONES=['company','supplier_rules','settings'];
const MAX_RECORD=1800000,MAX_CHANGES=400;
const ID=/^[A-Za-z0-9_.:-]{1,80}$/;

function stable(v){
 if(v===null||typeof v!=='object')return JSON.stringify(v===undefined?null:v);
 if(Array.isArray(v))return '['+v.map(stable).join(',')+']';
 return '{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
}
// short fingerprint of a record (FNV-1a on the stable text, plus the length)
function hash(v){const s=stable(v);let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(36)+'.'+s.length.toString(36);}

function recordsOf(data){
 const out=[];
 for(const c of COLLS)for(const r of Array.isArray(data&&data[c])?data[c]:[])if(r&&typeof r==='object'&&typeof r.id==='string'&&ID.test(r.id))out.push({coll:c,id:r.id,data:r});
 for(const k of ONES)if(data&&data[k]&&typeof data[k]==='object')out.push({coll:'one',id:k,data:data[k]});
 return out;
}
/* What this device changed since the last exchange. `known` is {coll/id: hash} of what the server and the device
   agreed on. A record that was known and is no longer there has been deleted here. */
function diff(data,known){
 known=known||{};const changes=[],seen=new Set();
 for(const r of recordsOf(data)){const key=r.coll+'/'+r.id;seen.add(key);if(known[key]!==hash(r.data))changes.push({coll:r.coll,id:r.id,data:r.data});}
 for(const key of Object.keys(known))if(!seen.has(key)){const i=key.indexOf('/');const coll=key.slice(0,i);if(coll!=='one')changes.push({coll,id:key.slice(i+1),deleted:true});}
 return changes;
}
/* Records received from the server go into the data set; `skip` lists the keys changed here meanwhile and not yet
   sent (they win until the next exchange). Returns how many records changed. */
function apply(data,records,known,skip){
 let n=0;
 for(const r of records||[]){
  if(!r||(r.coll!=='one'&&!COLLS.includes(r.coll))||typeof r.id!=='string')continue;
  const key=r.coll+'/'+r.id;if(skip&&skip.has(key))continue;
  if(r.coll==='one'){
   if(!ONES.includes(r.id)||r.deleted||!r.data||typeof r.data!=='object')continue;
   if(hash(data[r.id])!==hash(r.data)){data[r.id]=r.data;n++;}known[key]=hash(r.data);continue;
  }
  const list=Array.isArray(data[r.coll])?data[r.coll]:(data[r.coll]=[]);const i=list.findIndex(x=>x&&x.id===r.id);
  if(r.deleted){if(i>=0){list.splice(i,1);n++;}delete known[key];continue;}
  if(!r.data||typeof r.data!=='object')continue;
  const rec={...r.data,id:r.id};
  if(i<0){list.push(rec);n++;}else if(hash(list[i])!==hash(rec)){list[i]=rec;n++;}
  known[key]=hash(rec);
 }
 return n;
}
// an empty data set for a company that starts (no example data)
function blank(name){
 const d={version:2,company:{name:name||'La mia azienda',_seeded:true},positions:[],supplier_rules:{},_ctrl_seeded:true,_rates_seeded:true,_plan_seeded:true,_fr_seeded:true,_empty_seeded:true,_tripcost_seeded:true,_live:true};
 for(const c of COLLS)d[c]=[];
 return d;
}

// ---------- what the server accepts ----------
function cleanChanges(list){
 if(!Array.isArray(list))return [];
 if(list.length>MAX_CHANGES)throw new Error('Troppe modifiche insieme: riprova.');
 const out=[];
 for(const c of list){
  if(!c||typeof c!=='object'||typeof c.id!=='string'||!ID.test(c.id))throw new Error('Modifica non valida.');
  if(c.coll==='one'){if(!ONES.includes(c.id)||c.deleted)throw new Error('Modifica non valida.');}
  else if(!COLLS.includes(c.coll))throw new Error('Modifica non valida.');
  if(c.deleted){out.push({coll:c.coll,id:c.id,deleted:true,data:{}});continue;}
  if(!c.data||typeof c.data!=='object'||Array.isArray(c.data))throw new Error('Modifica non valida.');
  const data=c.coll==='one'?c.data:{...c.data,id:c.id};
  if(JSON.stringify(data).length>MAX_RECORD)throw new Error('Un documento è troppo grande: riduci la foto e riprova.');
  out.push({coll:c.coll,id:c.id,deleted:false,data});
 }
 return out;
}

// ---------- the phone of a driver ----------
const mine=(t,driver)=>!!t&&(t.driver_id===driver||(t.status==='pianificato'&&!t.driver_id));
/* What a driver's phone receives: its trips (and the planned ones nobody has yet), what belongs to those trips,
   the vehicles to choose from, the names of customers and places. No prices, invoices, payslips or other drivers. */
function driverView(records,driver,allTrips){
 // allTrips: {id: data} of every trip of the company (records may hold only what changed since the last exchange)
 const trips=new Set(Object.keys(allTrips||{}).filter(id=>mine(allTrips[id],driver)));
 const out=[];
 for(const r of records){
  if(r.deleted){if(['trips','documents','costs','issues','shipments','vehicles','consignees','customers'].includes(r.coll))out.push({coll:r.coll,id:r.id,deleted:true,rev:r.rev});continue;}
  const d=r.data||{};
  if(r.coll==='vehicles'||r.coll==='consignees')out.push(r);
  else if(r.coll==='drivers'){if(r.id===driver)out.push(r);}
  else if(r.coll==='customers')out.push({...r,data:{id:r.id,name:d.name}});
  else if(r.coll==='trips'){
   if(trips.has(r.id)){const {revenue_cents,invoice_id,price,...rest}=d;out.push({...r,data:{...rest,revenue_cents:null}});}
   else out.push({coll:'trips',id:r.id,deleted:true,rev:r.rev}); // a trip given to someone else leaves the phone
  }
  else if(r.coll==='documents'||r.coll==='shipments'){if(trips.has(d.trip_id))out.push(r);}
  else if(r.coll==='issues'){if(d.driver_id===driver)out.push(r);}
  else if(r.coll==='costs'){if(d.driver_id===driver&&d.trip_id&&trips.has(d.trip_id)&&(d.source==='spesa'||d.doc_id))out.push(r);}
  else if(r.coll==='one'&&r.id==='company')out.push({...r,data:{name:d.name,_seeded:true}});
 }
 return out;
}
/* A change sent by a driver's phone: returns the record to save, or null when the phone may not make it.
   `current` is the record now on the server (or null), `trips` gives the trips by id as they are on the server. */
const OFFICE_ONLY=['revenue_cents','invoice_id','price','customer_id'];
function driverChange(c,driver,current,trips){
 if(c.deleted)return null;
 const d=c.data;
 if(c.coll==='trips'){
  if(current){
   if(!mine(current,driver)||current.status==='fatturato')return null;
   const out={...d,driver_id:driver};
   for(const k of OFFICE_ONLY){if(current[k]===undefined)delete out[k];else out[k]=current[k];}
   return out;
  }
  return {...d,driver_id:driver,revenue_cents:null,invoice_id:undefined,price:undefined};
 }
 if(c.coll==='documents'||c.coll==='shipments'||c.coll==='issues'||c.coll==='costs'){
  const t=trips&&trips[d.trip_id];
  if(!t||!mine(t,driver)&&t.driver_id!==driver)return null;
  if(current&&current.trip_id!==d.trip_id)return null;
  if(c.coll==='costs'||c.coll==='issues')return {...d,driver_id:driver};
  return d;
 }
 return null;
}

// ---------- invitation codes ----------
const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I
function codeFrom(bytes){let s='';for(let i=0;i<10;i++)s+=ALPHABET[bytes[i]%32];return s.slice(0,5)+'-'+s.slice(5);}
function cleanCode(v){const s=String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');return /^[A-Z2-9]{10}$/.test(s)?s.slice(0,5)+'-'+s.slice(5):null;}

return {COLLS,ONES,ID,MAX_CHANGES,stable,hash,recordsOf,diff,apply,blank,cleanChanges,driverView,driverChange,mine,codeFrom,cleanCode};
});
