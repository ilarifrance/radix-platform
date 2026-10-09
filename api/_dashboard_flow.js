'use strict';
const {obj,arr,short,stamp,iso,safeStatus,recordedStatus,snapshotStatus,labels}=require('./_dashboard_helpers');
const validDate=(v,now)=>stamp(v)<=now?iso(v):null;
function node(raw,id,index,last,now){const n=obj(raw),recorded=safeStatus(n.status);return {id:id+':'+index,agentId:short(n.role,90)||null,label:short(n.label||labels[n.role]||n.role||('Task '+(index+1)),100),status:snapshotStatus(recorded,last,now),recordedStatus:recorded,subtask:short(n.subtask,220),startedAt:validDate(n.startedAt,now),endedAt:validDate(n.endedAt,now)}}
function projectFlow(agentId,index,message,row,now){
 const flow=obj(message.flow),rawNodes=arr(flow.nodes),allLogs=arr(flow.log),id=short(agentId,90)+':'+index;
 let last=0;for(const v of [flow.startedAt,flow.endedAt,...allLogs.map(e=>obj(e).t)]){const t=stamp(v);if(t<=now)last=Math.max(last,t)}
 for(const n of rawNodes)for(const v of [obj(n).startedAt,obj(n).endedAt]){const t=stamp(v);if(t<=now)last=Math.max(last,t)}
 const recorded=recordedStatus(flow,rawNodes),progress={total:rawNodes.length,done:0,running:0,error:0,pending:0};
 rawNodes.forEach(n=>{const s=safeStatus(obj(n).status);progress[['done','running','error'].includes(s)?s:'pending']++});
 // Error nodes have priority so errors beyond the normal preview limit remain visible.
 const selected=rawNodes.map((n,i)=>({n,i})).sort((a,b)=>Number(obj(b.n).status==='error')-Number(obj(a.n).status==='error')).slice(0,80);
 const workflow={id,orchestratorId:short(agentId,90),orchestrator:labels[agentId]||short(agentId,100),task:short(flow.task||'Workflow orchestrato',220),status:snapshotStatus(recorded,last,now),recordedStatus:recorded,source:'saved-browser-flow',projectId:null,projectAttribution:'unavailable',lastEventAt:iso(last),round:Number.isFinite(Number(flow.round))?Math.max(1,Math.min(100,Math.floor(Number(flow.round)))):1,startedAt:validDate(flow.startedAt,now),endedAt:validDate(flow.endedAt,now),halted:flow.halted?'Workflow interrotto: verifica nel workspace':null,progress,nodes:selected.map(({n,i})=>node(n,id,i,last,now)),nodesTruncated:rawNodes.length>80,sortAt:last};
 // Log text may contain output/provider errors. Return kind-derived summaries, never raw x.
 const kinds={error:'Errore registrato: verifica nel workspace',done:'Completamento registrato',start:'Avvio registrato',info:'Evento registrato',warn:'Avviso registrato'};
 const activity=allLogs.slice(-200).map((raw,i)=>{const e=obj(raw),type=Object.hasOwn(kinds,e.k)?e.k:'info';return {id:id+':log:'+i,at:validDate(e.t,now),type,text:kinds[type],workflowId:id,orchestrator:workflow.orchestrator}});
 const agentSnapshots=rawNodes.map((n,i)=>node(n,id,i,last,now));
 return {workflow,activity,agentSnapshots,truncated:rawNodes.length>80||allLogs.length>200};
}
module.exports={projectFlow,node};
