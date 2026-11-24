'use strict';
// Command Center summary from the shared registry: projects, approvals, team activity and the
// orchestrator flows run on the Agenti AI page. Repeated saves of the same thing show once. Like the v3.7 summary, it never returns agent
// outputs or raw log text, only names, states and counts.
const {obj,arr,short,stamp,iso}=require('./_dashboard_helpers');
const {projectFlow}=require('./_dashboard_flow');
const {labels}=require('./_dashboard_helpers');
const {AGENTS}=require('../lib/radix-agent-runtime');
const GROUP_LABELS=Object.freeze({marketing:'Marketing',commerciale:'Commerciale',admin:'Amministrazione',legale:'Legale',dev:'Sviluppo'});

const ACTIONS=Object.freeze({
 'client.created':'ha creato il cliente','client.updated':'ha aggiornato il cliente','client.deleted':'ha eliminato il cliente',
 'project.created':'ha creato il progetto','project.updated':'ha aggiornato il progetto','project.deleted':'ha eliminato il progetto',
 'document.saved':'ha salvato','approval.requested':'ha chiesto l’approvazione di','approval.approved':'ha approvato',
 'approval.needs_revision':'ha chiesto modifiche a','approval.rejected':'ha rifiutato','registry.imported':'ha importato dati da'
});
const MODULE_LABELS=Object.freeze({'agency-workspace':'il workspace Agency','agency-operations':'la board produzione',editorial:'il piano editoriale',pm:'il piano di progetto',agents:'le conversazioni con gli agenti'});
const STATES=Object.freeze({awaiting_approval:'In attesa di decisione',approved:'Approvata',needs_revision:'Modifiche richieste',rejected:'Rifiutata',superseded:'Sostituita'});
const SUBJECTS=Object.freeze({strategy:'Strategia','ped-plan':'Piano editoriale',content:'Contenuto','agency-task':'Deliverable Agency','pm-task':'Attività PM'});
// Where each kind of approval is decided.
const PAGES=Object.freeze({strategy:'/project-editorial.html?project=','ped-plan':'/project-editorial.html?project=',content:'/project-editorial.html?project=','agency-task':'/agency/project-workspace.html?id=','pm-task':'/radix-pm-concept.html?project='});
const KINDS=Object.freeze({agency:'Progetto Agency',brand:'Brand',internal:'Progetto interno',personal:'Personal brand'});

async function loadRegistry(db){
 const [projects,approvals,activity,agentDocs]=await Promise.all([
  db`SELECT p.id,p.name,p.kind,p.status,p.summary,p.updated_at,c.name AS client_name,
     (SELECT array_agg(module ORDER BY module) FROM rx_documents d WHERE d.project_id=p.id) AS modules
     FROM rx_projects p LEFT JOIN rx_clients c ON c.id=p.client_id WHERE p.status<>'archived' ORDER BY p.updated_at DESC LIMIT 100`,
  db`SELECT a.id,a.project_id,a.subject_type,a.summary,a.subject_id,a.state,a.requested_by,a.requested_at,a.decided_at,a.self_review,p.name AS project_name,u.name AS reviewer_name
     FROM rx_approvals a JOIN rx_projects p ON p.id=a.project_id LEFT JOIN users u ON u.id=a.reviewer_id
     WHERE a.state<>'superseded' ORDER BY (a.state='awaiting_approval') DESC, a.requested_at DESC LIMIT 30`,
  db`SELECT a.id,a.project_id,a.action,a.subject,a.at,u.name AS actor,p.name AS project_name
     FROM rx_activity a LEFT JOIN users u ON u.id=a.actor_id LEFT JOIN rx_projects p ON p.id=a.project_id ORDER BY a.id DESC LIMIT 40`,
  db`SELECT d.project_id,d.data,d.updated_at FROM rx_documents d WHERE d.module='agents' ORDER BY d.updated_at DESC LIMIT 20`
 ]);
 // Knowledge counts; agency_memory may be missing on an older database: counts then stay unknown.
 const knowledge=await db`SELECT (SELECT count(*) FROM rx_documents)::int AS documents,
   (SELECT count(*) FROM agency_memory WHERE confirmed_at IS NOT NULL)::int AS memory_confirmed,
   (SELECT count(*) FROM agency_memory WHERE confirmed_at IS NULL)::int AS memory_pending`.then(r=>r[0]||null,()=>null);
 return {projects,approvals,activity,agentDocs,knowledge};
}

function requester(r){const s=String(r||'');return s.startsWith('agent:')?labels[s.slice(6)]||s.slice(6):'una persona del team'}

function withRegistry(base,reg,now=Date.now()){
 const out={...base};reg=obj(reg);
 const projects=arr(reg.projects).map(p=>({id:short(p.id,90),name:short(p.name,100),kind:KINDS[p.kind]||short(p.kind,80),summary:short(p.summary,260),
  client:short(p.client_name,120)||null,registryKind:short(p.kind,20),modules:arr(p.modules).map(m=>short(m,40)),active:false,source:'registry'}));
 // Registry projects first; v3.7 profiles that were never imported stay visible after them.
 const ids=new Set(projects.map(p=>p.id));
 out.projects=projects.concat(arr(base.projects).filter(p=>!ids.has(p.id))).slice(0,100);

 const flows=[],events=[],snapshots=[];
 for(const d of arr(reg.agentDocs)){
  const conv=obj(obj(d.data).conversations),project=projects.find(p=>p.id===d.project_id);
  for(const [agentId,messages] of Object.entries(conv))arr(messages).forEach((m,i)=>{
   if(!obj(m).flow)return;
   const p=projectFlow(d.project_id+'/'+agentId,i,m,{data:{}},now),w=p.workflow;
   w.orchestratorId=short(agentId,90);w.orchestrator=obj(m.flow).pipeline?'Pipeline post':labels[agentId]||short(agentId,100);
   w.projectId=short(d.project_id,90);w.projectAttribution='explicit';w.source='agents-page';w.projectName=project?project.name:null;
   p.activity.forEach(e=>{e.orchestrator=w.orchestrator});
   flows.push(w);events.push(...p.activity);snapshots.push({flow:w,nodes:p.agentSnapshots});
  });
 }
 const allFlows=flows.concat(arr(base.workflows)).sort((a,b)=>(b.sortAt||0)-(a.sortAt||0));
 const blocked=allFlows.filter(f=>['error','blocked'].includes(f.status));
 out.workflows=[...blocked,...allFlows.filter(f=>!blocked.includes(f))].slice(0,24);
 const agentStatus={...obj(base.agentStatus)},seen=new Set();
 snapshots.sort((a,b)=>b.flow.sortAt-a.flow.sortAt);
 // Registry flows are newer than the v3.7 history; the most recent one sets each agent's state.
 for(const {flow,nodes} of snapshots)for(const n of nodes)if(n.agentId&&!seen.has(n.agentId)){seen.add(n.agentId);agentStatus[n.agentId]={status:n.status,task:n.subtask,workflowId:flow.id}}
 out.agentStatus=agentStatus;

 const team=arr(reg.activity).filter((a,i,all)=>!(i>0&&all[i-1].action===a.action&&all[i-1].subject===a.subject&&all[i-1].actor===a.actor&&all[i-1].project_id===a.project_id)).map(a=>{
  const verb=ACTIONS[a.action]||'ha aggiornato',subject=a.action==='document.saved'?MODULE_LABELS[a.subject]||short(a.subject,80):short(a.subject,120);
  return {id:'rx:'+a.id,at:iso(a.at),type:/rejected|needs_revision/.test(a.action)?'warn':a.action.startsWith('approval.approved')?'done':'info',
   text:short((a.actor||'Qualcuno')+' '+verb+' '+subject,240),workflowId:null,orchestrator:short(a.project_name||'Registro RADIX',100),projectId:a.project_id||null};
 });
 out.activity=team.concat(events,arr(base.activity)).filter(e=>e.at).sort((a,b)=>stamp(b.at)-stamp(a.at)).slice(0,24);

 const approvals=arr(reg.approvals).map(a=>({id:short(a.id,40),projectId:short(a.project_id,90),title:short((SUBJECTS[a.subject_type]||a.subject_type)+' · '+(a.summary||a.subject_id),200),
  status:STATES[a.state]||a.state,state:a.state,awaiting:a.state==='awaiting_approval',
  reason:short(a.project_name+' · richiesta da '+requester(a.requested_by)+(a.reviewer_name?' · decisa da '+a.reviewer_name+(a.self_review?' (autorevisione)':''):''),240),
  at:iso(a.decided_at||a.requested_at),href:(PAGES[a.subject_type]||'/agents.html?project=')+encodeURIComponent(a.project_id)}));
 const awaiting=approvals.filter(a=>a.awaiting).length;
 out.approvals=approvals;out.approvalsSupported=true;
 out.attention=arr(base.attention).concat(approvals.filter(a=>a.awaiting).map(a=>({id:a.id,title:a.title,reason:'awaiting_approval',projectId:a.projectId}))).slice(0,24);
 out.metrics={...obj(base.metrics),projects:out.projects.length,workflows:allFlows.length,
  activeWorkflows:allFlows.filter(f=>['unverified','stale'].includes(f.status)).length,
  activeAgents:Object.values(agentStatus).filter(a=>['unverified','stale'].includes(a.status)).length,approvals:awaiting,attention:blocked.length+awaiting};
 // Per project: agents with saved conversations and the orchestrator used most (the project's "role" in the network).
 const byProject=new Map();let conversations=0;
 for(const d of arr(reg.agentDocs)){const conv=obj(obj(d.data).conversations),m=byProject.get(d.project_id)||new Map();
  for(const [agentId,messages] of Object.entries(conv)){const n=arr(messages).length;if(!n)continue;conversations+=n;m.set(agentId,(m.get(agentId)||0)+n)}byProject.set(d.project_id,m)}
 const roster=new Map(AGENTS.map(a=>[a.id,a]));
 out.projects=out.projects.map(p=>{const m=byProject.get(p.id);if(!m)return {...p,agents:[],orchestrator:null};
  const agents=[...m].sort((a,b)=>b[1]-a[1]).map(([id,messages])=>({id:short(id,90),name:roster.get(id)?.name||labels[id]||short(id,100),group:roster.get(id)?.group||null,hub:!!roster.get(id)?.hub,messages}));
  const hub=agents.find(a=>a.hub);return {...p,agents:agents.slice(0,12),orchestrator:hub?{id:hub.id,name:hub.name}:null}});
 // Digital Team by function: configured agents in the roster, agents with a running step now, last step seen.
 const lastByAgent=new Map();for(const {nodes} of snapshots)for(const n of nodes){const t=stamp(n.endedAt||n.startedAt);if(n.agentId&&t>(lastByAgent.get(n.agentId)||0))lastByAgent.set(n.agentId,t)}
 out.team=Object.keys(GROUP_LABELS).map(g=>{const ids=AGENTS.filter(a=>a.group===g).map(a=>a.id);const last=Math.max(0,...ids.map(id=>lastByAgent.get(id)||0));
  return {group:g,label:GROUP_LABELS[g],configured:ids.length,active:ids.filter(id=>['unverified','stale'].includes(obj(agentStatus[id]).status)).length,lastAt:last?iso(last):null}});
 // Live activity per agent: the latest saved steps, done / running / error, never the outputs.
 const steps=[];for(const {flow,nodes} of snapshots)for(const n of nodes){const at=n.endedAt||n.startedAt;if(!at||!n.agentId)continue;
  steps.push({at,agentId:n.agentId,agentName:roster.get(n.agentId)?.name||labels[n.agentId]||n.label,task:short(String(n.subtask||n.label).split('\n')[0],120),state:n.status==='done'?'done':n.status==='error'?'error':['unverified','stale','running'].includes(n.status)?'running':'pending',workflowId:flow.id,projectId:flow.projectId||null})}
 out.agentActivity=steps.sort((a,b)=>stamp(b.at)-stamp(a.at)).slice(0,12);
 const k=obj(reg.knowledge);
 out.knowledge={documents:Number.isInteger(k.documents)?k.documents:null,conversations,memoryConfirmed:Number.isInteger(k.memory_confirmed)?k.memory_confirmed:null,memoryPending:Number.isInteger(k.memory_pending)?k.memory_pending:null};
 out.dataQuality={...obj(base.dataQuality),source:'registry+saved-state',registry:true};
 return out;
}
module.exports={loadRegistry,withRegistry};
