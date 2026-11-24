/* Plancia (Trasporti) — a real company: the data of this device go to the server and come back from it.
   Loaded after lib/trasporti/sync.js and trasporti/store.js, before the program (boot.js waits for `ready`).
   - Demonstration (nobody signed in, no code of the office): nothing changes, data stay in localStorage.
   - Office: the signed-in user is a member of a company → the data set is the one of the company.
   - Driver: entered once with the code of the office → the phone keeps a token and sees only its own work.
   The data set stays in memory and in IndexedDB (photos do not fit in localStorage), so everything works without
   signal; changes are sent and received every 30 seconds, when something is saved and when the signal comes back. */
(function(root){
'use strict';
const S=root.RadixTrSync,ST=root.RadixTrStore;
const FLAG='plancia-live';            // {role:'office'|'driver', token?, driver_id?, company?}
const API='/api/trasporti';
let flag=null;try{flag=JSON.parse(root.localStorage.getItem(FLAG)||'null');}catch{flag=null;}
let state=null;                       // {data, known, since}
let busy=false,again=false,timer=null,saveTimer=null,status={ok:null,at:null,error:null,pending:0};
const listeners=[];
const emit=(what)=>{for(const f of listeners)try{f(what,status);}catch(e){console.error(e);}};

// ---------- IndexedDB: one value, the whole data set with what the server knows ----------
const dbName=()=>'plancia-dati-'+(flag&&flag.role==='driver'?'autista':'ufficio');
function idb(mode,fn){return new Promise((ok,ko)=>{if(!root.indexedDB)return ko(new Error('no idb'));const r=root.indexedDB.open(dbName(),1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onerror=()=>ko(r.error);
 r.onsuccess=()=>{const t=r.result.transaction('kv',mode);const q=fn(t.objectStore('kv'));t.oncomplete=()=>{r.result.close();ok(q&&q.result);};t.onerror=()=>{r.result.close();ko(t.error);};};});}
const persist=()=>{clearTimeout(saveTimer);saveTimer=setTimeout(()=>{if(state)idb('readwrite',s=>s.put(JSON.parse(JSON.stringify(state)),'state')).catch(e=>console.error('plancia: salvataggio locale',e));},250);};

async function post(action,data,extra){
 let r;try{r=await root.fetch(API,{method:'POST',credentials:'same-origin',headers:{...ST.headers(),...(extra||{})},body:JSON.stringify({action,data})});}
 catch{const e=new Error('Senza rete.');e.offline=true;throw e;}
 let j=null;try{j=await r.json();}catch{}
 if(!r.ok){const e=new Error(j&&j.error||'Il server non risponde.');e.status=r.status;throw e;}
 return j||{};
}

function batches(changes){
 const out=[];let cur=[],size=0;
 for(const c of changes){const n=c.deleted?50:JSON.stringify(c.data).length;if(cur.length&&(size+n>2500000||cur.length>=300)){out.push(cur);cur=[];size=0;}cur.push(c);size+=n;}
 out.push(cur);return out;
}
/* One exchange: send what changed here, receive what changed elsewhere. `full` asks again for everything (done when
   the program opens: it also brings what became visible to this device after it was written). */
async function run(full){
 if(!state)return;
 if(busy){again=true;return;}
 busy=true;let got=0;
 try{
  if(full)state.since=0;
  let more=true,guard=0;
  while(more&&guard++<200){
   // a device that never exchanged anything first receives (it has nothing of its own to send yet)
   const first=!Object.keys(state.known).length&&state.since===0;
   const all=first?[]:S.diff(state.data,state.known);
   const batch=batches(all)[0];
   const sent={};for(const c of batch)sent[c.coll+'/'+c.id]=c.deleted?null:S.hash(c.data);
   const res=await post('sync',{since:state.since,changes:batch});
   if(res.no_company){status={...status,ok:false,error:'no_company'};break;}
   // another company on this device (someone else signed in): start again from what the server has
   if(state.company_id&&res.company_id&&state.company_id!==res.company_id){state.data=S.blank();state.known={};state.since=0;state.company_id=res.company_id;ST.setBackend(null);attachBackend();continue;}
   state.company_id=res.company_id||state.company_id;
   // what was sent is now known to the server; what changed here during the call waits for the next round
   const now={};for(const r of S.recordsOf(state.data))now[r.coll+'/'+r.id]=r.data;
   const skip=new Set();
   for(const key of Object.keys(sent)){
    const cur=key in now?S.hash(now[key]):null;
    if(sent[key]===null)delete state.known[key];else state.known[key]=sent[key];
    if(cur!==sent[key])skip.add(key);
   }
   got+=S.apply(state.data,res.records,state.known,skip);
   state.since=res.rev;
   if(res.phones)state.phones=res.phones;
   if(res.driver_id&&flag&&flag.role==='driver'&&flag.driver_id!==res.driver_id){flag.driver_id=res.driver_id;root.localStorage.setItem(FLAG,JSON.stringify(flag));}
   if(first&&!res.records.length)state.known['one/_']='-';
   more=!!res.more||all.length>batch.length||first;
  }
  status={ok:status.error==='no_company'?false:true,at:Date.now(),error:status.error==='no_company'?'no_company':null,pending:S.diff(state.data,state.known).length};
  persist();
 }catch(e){
  status={...status,ok:false,error:e.offline?'offline':e.status===401?'accesso':(e.message||'errore'),pending:S.diff(state.data,state.known).length};
 }finally{busy=false;}
 emit(got?'data':'status');
 if(again){again=false;return run();}
}
const soon=()=>{clearTimeout(timer);timer=setTimeout(()=>run(),1200);};

function attachBackend(){
 ST.setBackend({
  token:flag.token||null,
  get:()=>state.data,
  set:d=>{state.data=d;persist();soon();},
  info:()=>({...flag,status,phones:state.phones||[]})
 });
}
function attach(){
 attachBackend();
 root.addEventListener('online',()=>run());
 root.document.addEventListener('visibilitychange',()=>{if(!root.document.hidden)run();});
 setInterval(()=>{if(!root.document.hidden)run();},30000);
}
async function start(){
 if(!flag||!S)return probe();
 try{state=await idb('readonly',s=>s.get('state'));}catch{state=null;}
 if(!state||!state.data)state={data:S.blank(flag.company),known:{},since:0};
 attach();
 run(true);
}
// The office: is the person signed in and member of a company? Asked in the background; if yes the page reloads once
// on the real data. On the showcase site there is no /api: the demonstration stays.
async function probe(){
 if(root.location.pathname.indexOf('/trasporti/autista')===0)return;
 try{
  const res=await post('sync',{since:9e15,changes:[]});
  if(res.role==='office'||res.role==='viewer'){root.localStorage.setItem(FLAG,JSON.stringify({role:'office'}));root.location.reload();}
  else if(res.no_company){status={ok:false,error:'no_company',can_create:!!res.can_create};emit('status');}
 }catch{}
}

const api={
 on(f){listeners.push(f);},
 status:()=>status,
 live:()=>!!state,
 role:()=>flag&&flag.role,
 run:()=>run(),
 post,
 // the driver types the code of the office (or opens the link): from then on this phone is theirs
 async enter(code){
  const res=await post('autista.entra',{code});
  root.localStorage.setItem(FLAG,JSON.stringify({role:'driver',token:res.token,driver_id:res.driver_id,company:res.company}));
  root.localStorage.setItem('radix-trasporti-autista',JSON.stringify({driver:res.driver_id,vehicle:null}));
  return res;
 },
 // the office opens its company (where allowed), then works on the real data
 async createCompany(name){const res=await post('azienda.crea',{name});root.localStorage.setItem(FLAG,JSON.stringify({role:'office',company:res.name}));return res;},
 // back to the demonstration on this device (the data of the company stay on the server)
 async leave(){root.localStorage.removeItem(FLAG);root.localStorage.removeItem('radix-trasporti-autista');try{await new Promise(ok=>{const r=root.indexedDB.deleteDatabase(dbName());r.onsuccess=r.onerror=r.onblocked=()=>ok();});}catch{}}
};
api.ready=start().catch(e=>{console.error('plancia: avvio',e);});
root.RadixTrLive=api;
})(typeof globalThis!=='undefined'?globalThis:this);
