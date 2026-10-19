'use strict';
// Read-only advisory signals from an already authorized and validated CRM envelope.
const {validateEnvelope}=require('./_sales_intelligence');
function evaluatePriority(e){
 if(!validateEnvelope(e))throw new TypeError('Invalid Sales Intelligence envelope');
 const now=Date.parse(e.asOf);
 const tasks=e.activities.filter(a=>a.source==='tasks'),interactions=e.activities.filter(a=>a.source==='interactions');
 const open=tasks.filter(t=>t.status!=='done');
 const overdue=open.filter(t=>t.dueAt!==null&&Date.parse(t.dueAt)<now);
 const urgent=open.filter(t=>t.priority==='urgent');
 const high=open.filter(t=>t.priority==='high');
 const unassigned=open.filter(t=>t.assigneeId===null);
 const dueSoon=open.filter(t=>t.dueAt!==null&&Date.parse(t.dueAt)>=now&&Date.parse(t.dueAt)<=now+7*86400000);
 const latest=interactions.reduce((m,i)=>Math.max(m,Date.parse(i.occurredAt)),-Infinity);
 const daysSinceLastInteraction=latest===-Infinity?null:Math.max(0,Math.floor((now-latest)/86400000));
 const alerts=[];
 if(overdue.length)alerts.push({code:'overdue_tasks',severity:'high',count:overdue.length});
 if(urgent.length)alerts.push({code:'urgent_tasks',severity:'high',count:urgent.length});
 if(unassigned.length)alerts.push({code:'unassigned_tasks',severity:'medium',count:unassigned.length});
 if(dueSoon.length)alerts.push({code:'upcoming_tasks',severity:'medium',count:dueSoon.length});
 if(daysSinceLastInteraction!==null&&daysSinceLastInteraction>=30)alerts.push({code:'stale_interaction',severity:'medium',days:daysSinceLastInteraction});
 if(e.closeDate&&e.closeDate<e.asOf.slice(0,10))alerts.push({code:'expected_close_passed',severity:'medium'});
 const attentionScore=Math.min(100,overdue.length*25+urgent.length*20+high.length*8+unassigned.length*10+dueSoon.length*5+(daysSinceLastInteraction!==null&&daysSinceLastInteraction>=30?10:0));
 const sortDue=(a,b)=>(a.dueAt??'9999').localeCompare(b.dueAt??'9999')||a.id.localeCompare(b.id);
 const selected=[...overdue].sort(sortDue)[0]||[...urgent].sort(sortDue)[0]||[...dueSoon].sort(sortDue)[0];
 let nextBestAction=null;
 if(selected)nextBestAction={kind:'review_existing_task',taskId:selected.id,title:selected.title,reason:overdue.some(t=>t.id===selected.id)?'overdue':urgent.some(t=>t.id===selected.id)?'urgent':'due_soon'};
 else if(daysSinceLastInteraction!==null&&daysSinceLastInteraction>=30)nextBestAction={kind:'review_relationship',reason:'stale_interaction'};
 return {opportunityId:e.opportunityId,recordVersion:e.recordVersion,asOf:e.asOf,attentionScore,scoreMeaning:'observed_follow_up_attention_not_win_probability',alerts,nextBestAction,dataLimitations:{activitiesComplete:e.dataQuality.activitiesComplete,issues:[...e.dataQuality.issues],missingFields:[...e.dataQuality.missingFields],warning:!e.dataQuality.activitiesComplete?'Partial activity snapshot: absence of alerts does not mean absence of risk.':null},automatedActionsTaken:false};
}
module.exports={evaluatePriority};
