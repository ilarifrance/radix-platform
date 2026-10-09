'use strict';
const {obj,arr,short,stamp,iso}=require('./_dashboard_helpers');
const {projectFlow}=require('./_dashboard_flow');
function dashboard(row,user,now=Date.now()){
 row=obj(row);const state=obj(row.data),history=obj(state.history),flows=[],events=[],snapshots=[];let truncated=false;
 for(const [agentId,messages] of Object.entries(history))arr(messages).forEach((m,i)=>{if(!obj(m).flow)return;const p=projectFlow(agentId,i,m,row,now);flows.push(p.workflow);snapshots.push({flow:p.workflow,nodes:p.agentSnapshots});events.push(...p.activity);truncated=truncated||p.truncated});
 flows.sort((a,b)=>b.sortAt-a.sortAt);events.sort((a,b)=>stamp(b.at)-stamp(a.at));
 const projects=arr(state.projects).filter(p=>obj(p).id).map(p=>({id:short(p.id,90),name:short(p.name||p.id,100),kind:short(p.kind,80),summary:short(p.summary,260),active:p.id===state.activeProject}));
 const blocked=flows.filter(f=>['error','blocked'].includes(f.status));
 snapshots.sort((a,b)=>b.flow.sortAt-a.flow.sortAt);const agentStatus=Object.create(null);for(const {flow:f,nodes} of snapshots)for(const n of nodes)if(n.agentId&&!agentStatus[n.agentId])agentStatus[n.agentId]={status:n.status,task:n.subtask,workflowId:f.id};
 const preview=[...blocked,...flows.filter(f=>!blocked.includes(f))].slice(0,24);
 return {user:{name:short(obj(user).name,100),email:short(obj(user).email,160)},workspace:{activeProjectId:short(state.activeProject,90)||null,updatedAt:stamp(row.updated_at)<=now?iso(row.updated_at):null,updatedBy:short(row.updated_by,100)||null},projects:projects.slice(0,100),workflows:preview,activity:events.slice(0,24),agentStatus,approvals:[],approvalsSupported:false,attention:blocked.slice(0,24).map(f=>({id:f.id,title:f.task,reason:f.status,workflowId:f.id})),metrics:{projects:projects.length,workflows:flows.length,activeWorkflows:flows.filter(f=>['unverified','stale'].includes(f.status)).length,activeAgents:Object.values(agentStatus).filter(a=>['unverified','stale'].includes(a.status)).length,approvals:0,attention:blocked.length},dataQuality:{source:'authenticated-saved-state',realtimeExecutionVerified:false,integrationsVerified:false,projectAgentAssignmentsVerified:false,truncated:truncated||flows.length>24||events.length>24||projects.length>100,attentionTotal:blocked.length,attentionOmitted:Math.max(0,blocked.length-24)}};
}
module.exports={dashboard};
