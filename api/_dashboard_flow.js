'use strict';
const h=require('./_dashboard_helpers');
const {obj,arr,short,stamp,iso,safeStatus,recordedStatus,snapshotStatus,labels}=h;
function node(raw,id,index,last,now){
 const n=obj(raw),recorded=safeStatus(n.status);
 return {id:id+':'+index,agentId:short(n.role,90)||null,
  label:short(n.label||labels[n.role]||n.role||('Task '+(index+1)),100),
  status:snapshotStatus(recorded,last,now),recordedStatus:recorded,
  subtask:short(n.subtask,220),startedAt:iso(n.startedAt),endedAt:iso(n.endedAt)};
}
function projectFlow(agentId,index,message,row,now){
 const flow=obj(message.flow),rawNodes=arr(flow.nodes),nodes=rawNodes.slice(0,80),logs=arr(flow.log).slice(-200);
 const dates=[flow.startedAt,flow.endedAt].concat(logs.map(e=>e&&e.t),nodes.flatMap(n=>[n&&n.startedAt,n&&n.endedAt]));
 const last=Math.max(0,...dates.map(stamp).filter(t=>t<=now));
 const id=short(agentId,90)+':'+index,recorded=recordedStatus(flow,nodes);
 const status=snapshotStatus(recorded,last,now);
 const normalized=nodes.map((n,i)=>node(n,id,i,last,now));
 const progress={total:nodes.length,done:0,running:0,error:0,pending:0};
 normalized.forEach(n=>{const s=n.recordedStatus;progress[s==='done'?'done':s==='running'?'running':s==='error'?'error':'pending']++});
 const workflow={id,orchestratorId:short(agentId,90),orchestrator:labels[agentId]||short(agentId,100),
  task:short(flow.task||'Workflow orchestrato',220),status,recordedStatus:recorded,
  source:'saved-browser-flow',projectId:null,projectAttribution:'unavailable',
  lastEventAt:iso(last),round:Math.max(1,Math.min(100,Number(flow.round)||1)),
  startedAt:iso(flow.startedAt),endedAt:iso(flow.endedAt),
  halted:flow.halted?'Workflow interrotto: verifica nel workspace':null,
  progress,nodes:normalized,sortAt:last};
 const activity=logs.map((raw,i)=>({raw:obj(raw),i})).filter(x=>x.raw.x).map(x=>({
  id:id+':log:'+x.i,at:iso(x.raw.t)||iso(flow.startedAt)||iso(row.updated_at),
  type:short(x.raw.k||'info',30),text:short(x.raw.x,260),workflowId:id,
  orchestrator:labels[agentId]||short(agentId,100)}));
 return {workflow,activity,truncated:rawNodes.length>80};
}
module.exports={projectFlow,node};
