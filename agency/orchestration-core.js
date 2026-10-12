/* Shared, dependency-free routing core extracted from RADIX v3.7 parseRouting contract.
   No HTTP, API credentials, side effects or external actions. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixAgencyRouting=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const MAX_TASKS=12,MAX_INSTRUCTIONS=1400;
function parseRouting(text,allowedRoles){
 const m=/---ROUTING---([\s\S]*?)---FINE---/.exec(String(text||''));
 if(!m)return [];
 const allowed=new Set(allowedRoles||[]);
 const lines=m[1].split(/\r?\n/).map(x=>x.trim().replace(/^\d+[.)]\s*/,'')).filter(Boolean);
 if(lines.length>MAX_TASKS)throw Error('Too many routed tasks');
 let tasks=[],indices={};
 lines.forEach((line,i)=>{
  const sep=line.indexOf('|');if(sep<1)throw Error('Invalid routing line');
  const role=line.slice(0,sep).trim().replace(/^[-*•]\s*/,'');
  if(!allowed.has(role)||role==='marketing-orchestrator'||role==='orchestrator')throw Error('Unsupported specialist role: '+role);
  let rest=line.slice(sep+1).trim(),deps=[];
  const match=/\|\s*dipende\s*:\s*([\d,\s]+)\s*$/i.exec(rest);
  if(match){deps=match[1].split(',').map(n=>Number(n.trim()));rest=rest.slice(0,match.index).trim()}
  rest=rest.replace(/\|\s*$/,'').trim();
  if(!rest||rest.length>MAX_INSTRUCTIONS)throw Error('Task missing or too long');
  if(deps.some(n=>!Number.isInteger(n)||n<1||n>=i+1))throw Error('Task dependencies must reference preceding tasks');
  tasks.push({id:'step-'+(i+1),role,instruction:rest,dependsOn:deps.map(n=>'step-'+n),status:'proposed'});
  indices[i+1]=i;
 });
 return tasks;
}
function stripRouting(text){return String(text||'').replace(/\n?---ROUTING---[\s\S]*?---FINE---/,'').trim()}
function nextReady(tasks){const done=new Set(tasks.filter(t=>t.status==='done').map(t=>t.id));return tasks.filter(t=>t.status==='proposed'&&t.dependsOn.every(d=>done.has(d)))}
function hasBlockedDependencies(tasks){const failed=new Set(tasks.filter(t=>t.status==='error'||t.status==='blocked').map(t=>t.id));return tasks.some(t=>t.status==='proposed'&&t.dependsOn.some(d=>failed.has(d)))}
return Object.freeze({parseRouting,stripRouting,nextReady,hasBlockedDependencies,MAX_TASKS});
});