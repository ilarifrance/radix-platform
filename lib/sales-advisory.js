'use strict';
// RADIX Sales: read-only advisory inspired by Qwen's activity-health and
// next-best-action modules, adapted to Nexus's validated v1 envelope.
// Caller must authorize the workspace and validate with Nexus before use.
const DAY=86400000;
const date=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?Date.parse(v):null;
function evaluateOpportunity(envelope,{validateEnvelope,now}={}){
 if(typeof validateEnvelope!=='function'||!validateEnvelope(envelope))throw new TypeError('Valid Nexus Sales Intelligence envelope required');
 const instant=date(now);
 if(instant===null)throw new TypeError('Valid now timestamp required');
 const recommendations=[];
 const add=(kind,priority,reason,evidence)=>recommendations.push({kind,priority,reason,evidence});
 for(const a of envelope.activities){
  if(a.source!=='tasks'||!a.dueAt||!['todo','doing'].includes(a.status))continue;
  const due=date(a.dueAt);
  if(due!==null&&due<instant)add('review_overdue_task','high','A recorded open task is overdue.',[{source:a.source,id:a.id,version:a.version}]);
 }
 const interactions=envelope.activities.filter(a=>a.source==='interactions'&&date(a.occurredAt)!==null&&date(a.occurredAt)<=instant);
 if(interactions.length){
  const latest=interactions.reduce((a,b)=>date(a.occurredAt)>date(b.occurredAt)?a:b);
  if(instant-date(latest.occurredAt)>14*DAY)add('review_follow_up','medium','Last recorded interaction is older than 14 days; verify contact history before outreach.',[{source:latest.source,id:latest.id,version:latest.version}]);
 }
 if(envelope.closeDate){
  const today=new Date(instant).toISOString().slice(0,10);
  if(envelope.closeDate<today)add('review_close_date','medium','Expected close date is in the past; verify the opportunity status.',[{source:'opportunities',id:envelope.opportunityId,version:envelope.recordVersion}]);
 }
 const partial=envelope.dataQuality.completeness!=='complete'||!envelope.dataQuality.activitiesComplete;
 return {opportunityId:envelope.opportunityId,recordVersion:envelope.recordVersion,asOf:envelope.asOf,evaluatedAt:new Date(instant).toISOString(),status:partial?'partial':'complete',limitations:partial?['Activity history may be incomplete; absence of evidence is not evidence of absence.']:[],recommendations,requiresHumanReview:true,actionsExecuted:0};
}
module.exports={evaluateOpportunity};
