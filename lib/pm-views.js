/* RADIX PM views — Kanban, Gantt timeline, team workload and KPIs computed from a PM plan.
   Pure functions (no DOM, no I/O) so the page and the tests share them. Dates are YYYY-MM-DD. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixPMViews=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const STATUSES=['Da fare','In corso','In revisione','Completato'];
const DAY=86400000;
const toDay=s=>{const t=Date.parse(String(s||'')+'T12:00:00Z');return Number.isFinite(t)?Math.floor(t/DAY):null};
const fromDay=d=>new Date(d*DAY+43200000).toISOString().slice(0,10);
const todayIso=now=>new Date(now==null?Date.now():now).toISOString().slice(0,10);

function kanban(tasks){
 const cols=STATUSES.map(status=>({status,tasks:[]}));
 for(const t of tasks){const c=cols.find(c=>c.status===t.status);if(c)c.tasks.push(t)}
 cols.forEach(c=>c.tasks.sort((a,b)=>String(a.due).localeCompare(String(b.due))));
 return cols;
}

// A task without a start runs from the latest due date of its dependencies (or 3 days before its own due).
function gantt(tasks,now){
 const byId=new Map(tasks.map(t=>[t.id,t])),today=toDay(todayIso(now)),rows=[];
 const startOf=(t,seen=new Set())=>{
  const s=toDay(t.start);if(s!=null)return s;
  if(seen.has(t.id))return null;seen.add(t.id);
  const deps=(t.dependencies||[]).map(id=>byId.get(id)).filter(Boolean).map(d=>toDay(d.due)).filter(v=>v!=null);
  const due=toDay(t.due);if(deps.length)return Math.min(Math.max(...deps),due??Infinity);
  return due==null?null:due-3;
 };
 for(const t of tasks){
  const end=toDay(t.due);if(end==null)continue;
  const start=Math.min(startOf(t)??end,end);
  rows.push({id:t.id,title:t.title,owner:t.owner,status:t.status,milestone:!!t.milestone,subproject:t.subproject,start,end,
   late:t.status!=='Completato'&&end<today,dependencies:(t.dependencies||[]).filter(id=>byId.has(id))});
 }
 rows.sort((a,b)=>a.start-b.start||a.end-b.end);
 if(!rows.length)return {rows,from:today,to:today+14,today,weeks:[]};
 const from=Math.min(...rows.map(r=>r.start),today)-1,to=Math.max(...rows.map(r=>r.end),today)+2;
 const weeks=[];for(let d=from-((from+3)%7);d<=to;d+=7)weeks.push({day:d,label:fromDay(d)});
 return {rows,from,to,today,weeks};
}

// Owners (people or agents) × ISO weeks: open tasks due in that week.
function workload(tasks,now,weeksAhead=6){
 const today=toDay(todayIso(now)),monday=today-((today+3)%7),weeks=[];
 for(let i=0;i<weeksAhead;i++)weeks.push({start:monday+i*7,label:fromDay(monday+i*7)});
 const owners=new Map();
 for(const t of tasks){
  if(t.status==='Completato')continue;
  const names=[t.owner,...(t.assignedAgents||[]).map(a=>'Agente '+a)].filter(Boolean);
  const due=toDay(t.due);if(due==null)continue;
  const w=due<monday?0:Math.floor((due-monday)/7);if(w>=weeksAhead)continue;
  for(const n of new Set(names)){if(!owners.has(n))owners.set(n,new Array(weeksAhead).fill(0));owners.get(n)[w]++}
 }
 const rows=[...owners.entries()].map(([owner,cells])=>({owner,cells,total:cells.reduce((a,b)=>a+b,0)})).sort((a,b)=>b.total-a.total||a.owner.localeCompare(b.owner));
 const max=Math.max(1,...rows.flatMap(r=>r.cells));
 return {weeks,rows,max};
}

function kpis(tasks,now){
 const today=toDay(todayIso(now)),done=tasks.filter(t=>t.status==='Completato');
 const late=tasks.filter(t=>t.status!=='Completato'&&toDay(t.due)!=null&&toDay(t.due)<today);
 const dueSoFar=tasks.filter(t=>toDay(t.due)!=null&&toDay(t.due)<=today);
 const onTime=dueSoFar.length?Math.round(100*dueSoFar.filter(t=>t.status==='Completato').length/dueSoFar.length):null;
 const next=tasks.filter(t=>t.milestone&&t.status!=='Completato').sort((a,b)=>String(a.due).localeCompare(String(b.due)))[0]||null;
 return {total:tasks.length,done:done.length,late:late.length,onTime,awaitingApproval:tasks.filter(t=>t.approvalRequired&&!t.approved&&t.status==='In revisione').length,nextMilestone:next?{id:next.id,title:next.title,due:next.due}:null};
}

// Budget vs costs: planned = sum of estimates, spent = sum of actual costs; percentages only with a budget.
function budget(tasks,project){
 const total=Number(project&&project.budget)||0,sum=k=>Math.round(tasks.reduce((a,t)=>a+(Number(t[k])||0),0)*100)/100;
 const planned=sum('estimate'),spent=sum('actual'),pct=v=>total?Math.round(100*v/total):null;
 return {budget:total,planned,spent,remaining:total?Math.round((total-spent)*100)/100:null,spentPct:pct(spent),plannedPct:pct(planned),overPlanned:!!total&&planned>total,overSpent:!!total&&spent>total};
}

// Agency deliverables approved in the Agency workspace close their PM activity.
function syncFromAgency(pm,state,agencyTasks,note){
 const changed=[];
 for(const at of agencyTasks||[]){
  if(at.status!=='approved')continue;
  const t=state.tasks.find(x=>x.agencyTaskId===at.id);if(!t||t.status==='Completato')continue;
  try{
   for(const step of ['In corso','In revisione']){if(STATUSES.indexOf(t.status)<STATUSES.indexOf(step))pm.changeStatus(state,t.id,step)}
   if(t.approvalRequired&&!t.approved)pm.approve(state,t.id,true);
   pm.changeStatus(state,t.id,'Completato');t.history.push(note||'Completata: deliverable approvato nel workspace Agency.');changed.push(t.id);
  }catch(e){/* dependencies still open in PM: it advances on a later sync */}
 }
 return changed;
}

return Object.freeze({STATUSES,toDay,fromDay,kanban,gantt,workload,kpis,budget,syncFromAgency});
});
