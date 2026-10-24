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
 // Each step's state (brief, piano, incarichi, attività, agenti); without id: the most recent projects.
 journey:id=>id?call('projects',{query:{id,journey:'1'}}).then(d=>d.item.journey):call('projects',{query:{journey:'1'}}).then(d=>d.items),
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

// Team memory: proposals wait on the Memoria page until a person confirms them.
const memory={
 propose:async entry=>{
  const res=await fetcher()('/api/agency-memory',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(entry)});
  let data={};try{data=await res.json()}catch(e){}
  if(!res.ok){const err=Error(data.error||'Memoria non disponibile');err.status=res.status;throw err}
  return data;
 }
};

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

// Which external services have a key on this deployment: {buffer:true, heygen:false, ...}.
// Read once per page; null when unknown (offline, signed out), so callers keep their own error handling.
let integrationsPromise=null;
function integrations(){
 if(!integrationsPromise)integrationsPromise=Promise.resolve().then(()=>fetcher()('/api/integrations/status',{credentials:'same-origin',cache:'no-store'}))
  .then(r=>r.ok?r.json():null).then(d=>d&&Array.isArray(d.items)?Object.fromEntries(d.items.map(i=>[i.id,i.configured===true])):null).catch(()=>null)
  .then(map=>{if(!map)integrationsPromise=null;return map});
 return integrationsPromise;
}

// «Metti online il sito» (api/_site_publish.js): the saved record, publish, deployment state and the RADIX subdomain.
async function siteCall(method,body,query){const res=await fetcher()('/api/integrations/site-publish'+(query?'?'+new URLSearchParams(query):''),{method,credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
 let data={};try{data=await res.json()}catch(e){}
 if(!res.ok){const err=Error(data.error||'Pubblicazione non disponibile');err.status=res.status;err.body=data;throw err}
 return data}
const sites={
 info:projectId=>siteCall('GET',null,{projectId}),
 publish:(projectId,html,pages)=>siteCall('POST',{action:'publish',projectId,html,...(pages?{pages}:{})}),
 status:(projectId,deploymentId)=>siteCall('POST',{action:'status',projectId,deploymentId}),
 domain:projectId=>siteCall('POST',{action:'domain',projectId}),
 // The landing of a lead magnet funnel (lib/funnel-studio.js) on its own hosting project; pdf: {base64}.
 funnel:(projectId,funnel,html,pages,pdf)=>siteCall('POST',{action:'funnel',projectId,funnel,html,pages,pdf}),
 funnelStatus:(projectId,funnel,deploymentId)=>siteCall('POST',{action:'funnelStatus',projectId,funnel,deploymentId}),
 // The questionnaire of «Sondaggio e NPS» (lib/survey-core.js) on its own hosting project.
 survey:(projectId,survey,html,pages)=>siteCall('POST',{action:'survey',projectId,survey,html,pages}),
 surveyStatus:(projectId,survey,deploymentId)=>siteCall('POST',{action:'surveyStatus',projectId,survey,deploymentId})
};
// «Modulo contatti → CRM» of the Studio Sito (api/_sales.js, entity site_form_token; the sends go to api/_site_form.js):
// the CRM workspaces of the person, and the per-site token for the chosen one.
async function salesCall(method,body,query){const res=await fetcher()('/api/sales'+(query?'?'+new URLSearchParams(query):''),{method,credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json','x-radix-sales':'1'}:{},body:body?JSON.stringify(body):undefined});
 let data={};try{data=await res.json()}catch(e){}
 if(!res.ok){const err=Error(data.error||'CRM non disponibile');err.status=res.status;throw err}
 return data}
const siteForm={
 workspaces:()=>salesCall('GET',null,{entity:'workspaces'}).then(d=>Array.isArray(d.rows)?d.rows:[]),
 link:(workspace,projectId)=>salesCall('POST',{workspace,entity:'site_form_token',action:'create',data:{site:projectId}})
};
return Object.freeze({ConflictError,call,integrations,sites,siteForm,clients,projects,documents,approvals,publications,activity,memory,bind,collectLocal,importLocal,currentUser,ready});
});
