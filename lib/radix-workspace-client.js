/* RADIX shared registry — browser client for /api/workspace.
   Clients, projects, per-project documents, approvals and activity live on the server
   and are shared by the team. This file also copies data that older pages saved only
   in this browser, once, without overwriting anything already on the server. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixWorkspace=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const BASE='/api/workspace';

class ConflictError extends Error{constructor(message,body){super(message);this.name='ConflictError';this.body=body||{}}}

function fetcher(){if(!root.fetch)throw Error('fetch non disponibile');return root.fetch.bind(root)}

async function call(resource,{method='GET',query={},body}={}){
 const q=new URLSearchParams({resource,...Object.fromEntries(Object.entries(query).filter(([,v])=>v!=null&&v!==''))});
 const res=await fetcher()(BASE+'?'+q.toString(),{method,credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
 let data={};try{data=await res.json()}catch(e){}
 if(res.status===401){const err=Error(data.error||'Accesso RADIX richiesto');err.status=401;throw err}
 if(res.status===409)throw new ConflictError(data.error||'Modificato da qualcun altro: ricarica',data);
 if(!res.ok){const err=Error(data.error||'Registro non disponibile');err.status=res.status;throw err}
 return data;
}

const clients={
 list:()=>call('clients').then(d=>d.items),
 create:input=>call('clients',{method:'POST',body:input}).then(d=>d.item),
 update:(id,revision,changes)=>call('clients',{method:'PATCH',body:{...changes,id,revision}}).then(d=>d.item),
 remove:(id,revision)=>call('clients',{method:'DELETE',body:{id,revision}})
};
const projects={
 list:(clientId)=>call('projects',{query:{clientId}}).then(d=>d.items),
 get:id=>call('projects',{query:{id}}).then(d=>d.item),
 create:input=>call('projects',{method:'POST',body:input}).then(d=>d.item),
 update:(id,revision,changes)=>call('projects',{method:'PATCH',body:{...changes,id,revision}}).then(d=>d.item),
 remove:(id,revision)=>call('projects',{method:'DELETE',body:{id,revision}})
};
const documents={
 load:(projectId,module)=>call('documents',{query:{projectId,module}}),
 save:(projectId,module,data,revision)=>call('documents',{method:'PUT',body:{projectId,module,data,revision}})
};
// Publishing: the server sends only the approved version in the team PED, once per version.
const publications={
 list:projectId=>call('publications',{query:{projectId}}).then(d=>d.items),
 send:input=>call('publications',{method:'POST',body:input})
};
const approvals={
 list:(projectId,subjectType,subjectId)=>call('approvals',{query:{projectId,subjectType,subjectId}}).then(d=>d.items),
 request:input=>call('approvals',{method:'POST',body:{...input,action:'request'}}).then(d=>d.item),
 decide:(id,decision,content,note,memory)=>call('approvals',{method:'POST',body:{action:'decide',id,decision,content,note,memory}}).then(d=>d.item)
};
const activity={list:projectId=>call('activity',{query:{projectId}}).then(d=>d.items)};

// A document bound to one project and module. save() retries once on a conflict by
// reloading and letting the caller merge; otherwise the newest server copy wins.
function bind(projectId,module){
 let revision=0,data=null;
 return {
  async load(){const d=await documents.load(projectId,module);revision=d.revision||0;data=d.data;return data},
  async save(next){const r=await documents.save(projectId,module,next,revision);revision=r.revision;data=next;return r},
  get revision(){return revision},
  get data(){return data}
 };
}

// ---- one-time copy of browser-only data ----
function readJson(storage,key){try{return JSON.parse(storage.getItem(key))}catch(e){return null}}
function collectLocal(storage,owner){
 const ownerId=String(owner||'').trim().toLowerCase(),out={clients:[],projects:[]};
 const clientStore=readJson(storage,'radix-agency-clients:'+encodeURIComponent(ownerId));
 if(clientStore&&Array.isArray(clientStore.clients))out.clients=clientStore.clients.filter(c=>c&&typeof c.id==='string');
 const editorial={};
 for(let i=0;i<storage.length;i++){
  const key=storage.key(i)||'';
  if(key.startsWith('radix-agency-workspace:')){
   const id=key.slice('radix-agency-workspace:'.length),p=readJson(storage,key);
   if(!p||p.schemaVersion!==1||!p.brief||(p.ownerId&&p.ownerId!==ownerId))continue;
   const ops=readJson(storage,'radix-agency-operations:'+encodeURIComponent(ownerId)+':'+id)||readJson(storage,'radix-agency-operations:'+id);
   const documentsOut={'agency-workspace':p};
   if(ops&&Array.isArray(ops.records))documentsOut['agency-operations']={schemaVersion:1,records:ops.records};
   out.projects.push({id:id.toLowerCase(),name:String(p.brief.name||'Progetto Agency'),clientId:p.brief.clientId||null,kind:'agency',summary:String(p.brief.goal||''),profile:{brief:p.brief,source:'browser'},documents:documentsOut});
  }
  const m=/^radix-editorial:v1:([^:]+):(.+)$/.exec(key);
  if(m&&decodeURIComponent(m[1]).toLowerCase()===ownerId){const doc=readJson(storage,key);if(doc&&doc.schemaVersion===1)editorial[decodeURIComponent(m[2]).toLowerCase()]=doc}
 }
 return {...out,editorial};
}

async function importLocal(storage,owner){
 const flag='radix-registry-imported:'+String(owner||'').trim().toLowerCase();
 if(!storage||storage.getItem(flag))return {skipped:true};
 const cc=await call('import',{method:'POST',body:{source:'command-center'}});
 const local=collectLocal(storage,owner);
 const browser=await call('import',{method:'POST',body:{source:'browser',clients:local.clients,projects:local.projects}});
 let editorial=0;
 for(const [projectId,doc] of Object.entries(local.editorial)){
  try{const cur=await documents.load(projectId,'editorial');if(cur.revision===0){await documents.save(projectId,'editorial',doc,0);editorial++}}catch(e){}
 }
 storage.setItem(flag,new Date().toISOString());
 return {commandCenter:cc,browser,editorial};
}

async function currentUser(){
 const res=await fetcher()('/api/auth/me',{credentials:'same-origin'});
 if(!res.ok)return null;
 const d=await res.json();return d&&d.user||null;
}

// Pages call this first: it checks the session and runs the one-time import.
async function ready(storage){
 const user=await currentUser();
 if(!user)return null;
 const owner=String(user.id||user.email||'');
 try{await importLocal(storage||root.localStorage,owner)}catch(e){if(root.console)console.warn('RADIX import',e)}
 return user;
}

return Object.freeze({ConflictError,call,clients,projects,documents,approvals,publications,activity,bind,collectLocal,importLocal,currentUser,ready});
});
