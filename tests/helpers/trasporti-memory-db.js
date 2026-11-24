'use strict';
// In-memory stand-in for the tables of migrations/trasporti/006 (same behaviour as api/_trasporti_sync.js defaultDb).
module.exports=function memoryDb(){
 const db={rev:0,records:new Map(),members:new Map(),companies:new Map(),invites:new Map(),devs:new Map(),points:[],files:new Map(),n:0};
 const key=(c,coll,id)=>c+'|'+coll+'|'+id;
 return Object.assign(db,{
  async memberOf(uid){const m=db.members.get(uid);return m?{company_id:m.company_id,role:m.role,name:db.companies.get(m.company_id)}:null;},
  async deviceOf(hash){const d=db.devs.get(hash);return d&&!d.revoked?{company_id:d.company_id,driver_id:d.driver_id}:null;},
  async createCompany(uid,name){const id='00000000-0000-4000-8000-'+String(++db.n).padStart(12,'0');db.companies.set(id,name);db.members.set(uid,{company_id:id,role:'owner'});return id;},
  async pull(company,since){return [...db.records.values()].filter(r=>r.company===company&&r.rev>since).sort((a,b)=>a.rev-b.rev).slice(0,300).map(r=>({coll:r.coll,id:r.id,data:JSON.parse(JSON.stringify(r.data)),deleted:r.deleted,rev:r.rev}));},
  async trips(company){return [...db.records.values()].filter(r=>r.company===company&&r.coll==='trips'&&!r.deleted).map(r=>({id:r.id,data:r.data}));},
  async get(company,keys){return keys.map(k=>db.records.get(key(company,k.coll,k.id))).filter(Boolean).map(r=>({coll:r.coll,id:r.id,data:r.data,deleted:r.deleted}));},
  async push(company,changes,actor){let n=0;for(const c of changes){const k=key(company,c.coll,c.id),old=db.records.get(k);if(old&&JSON.stringify(old.data)===JSON.stringify(c.data)&&old.deleted===!!c.deleted)continue;db.records.set(k,{company,coll:c.coll,id:c.id,data:JSON.parse(JSON.stringify(c.data)),deleted:!!c.deleted,rev:++db.rev,by:actor});n++;}return n;},
  async createInvite(company,driver,hash){db.invites.set(hash,{company_id:company,driver_id:driver,used:false});return new Date(Date.now()+7*86400000);},
  async useInvite(hash,tokenHash){const i=db.invites.get(hash);if(!i||i.used)return null;i.used=true;db.devs.set(tokenHash,{company_id:i.company_id,driver_id:i.driver_id,revoked:false,seen:new Date()});return {company_id:i.company_id,driver_id:i.driver_id,company:db.companies.get(i.company_id)};},
  async revoke(company,driver){let n=0;for(const d of db.devs.values())if(d.company_id===company&&d.driver_id===driver&&!d.revoked){d.revoked=true;n++;}for(const i of db.invites.values())if(i.company_id===company&&i.driver_id===driver)i.used=true;return n;},
  async devices(company){const m={};for(const d of db.devs.values())if(d.company_id===company&&!d.revoked){m[d.driver_id]=m[d.driver_id]||{driver_id:d.driver_id,phones:0,last_seen_at:d.seen};m[d.driver_id].phones++;}return Object.values(m);},
  async saveFile(company,f,actor){const k=company+'|'+f.id;if(db.files.has(k))return 0;db.files.set(k,{media_type:f.media_type,image:f.image,created_by_driver:actor.driver||null});return 1;},
  async readFile(company,id){return db.files.get(company+'|'+id)||null;},
  async positions(company){return db.points.filter(p=>p.company===company).map(({company:_,...p})=>p);},
  async vehicleRecordOk(company,vehicle){const r=db.records.get(key(company,'vehicles',vehicle));return !!r&&!r.deleted;},
  async insertPositions(company,driver,vehicle,points){for(const p of points)db.points.push({company,vehicle_id:vehicle,driver_id:driver,trip_id:p.trip_id||null,at:p.at,lat:p.lat,lon:p.lon,speed_kmh:p.speed_kmh??null,accuracy_m:p.accuracy_m??null,source:'telefono'});return points.length;}
 });
};
