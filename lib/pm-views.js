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

// Share of an activity that is done: 1 when completed, otherwise the share of its sub-tasks ticked.
function doneShare(t){if(t.status==='Completato')return 1;const c=t.checklist||[];return c.length?c.filter(x=>x.done).length/c.length:0}

// Gantt rows grouped by sub-project (the plan's phases), in the plan's order, with progress and
// the dependency links between visible rows.
function phases(g,subprojects,tasks){
 const byId=new Map(tasks.map(t=>[t.id,t])),visible=new Set(g.rows.map(r=>r.id));
 const groups=(subprojects||[]).map(s=>{
  const own=tasks.filter(t=>t.subproject===s.id),rows=g.rows.filter(r=>r.subproject===s.id);
  const share=own.reduce((a,t)=>a+doneShare(t),0);
  return {id:s.id,name:s.name,rows,total:own.length,done:own.filter(t=>t.status==='Completato').length,
   progress:own.length?Math.round(100*share/own.length):0,
   start:rows.length?Math.min(...rows.map(r=>r.start)):null,end:rows.length?Math.max(...rows.map(r=>r.end)):null,
   late:rows.some(r=>r.late)};
 }).filter(x=>x.rows.length);
 const links=[];
 for(const r of g.rows)for(const d of r.dependencies)if(visible.has(d))links.push({from:d,to:r.id,open:(byId.get(d)||{}).status!=='Completato'});
 return {groups,links};
}

// Owners (people or agents) × ISO weeks: open tasks due in that week.
// capacity = open activities one owner can carry per week; load is the busiest week against it.
// An agent whose role is also the task owner (Agency tasks: owner «Copywriter», agent «copywriter») is one row, not two.
const norm=x=>String(x||'').toLocaleLowerCase('it').replace(/[-_\s]+/g,' ').trim();
function workload(tasks,now,weeksAhead=6,capacity=3){
 const today=toDay(todayIso(now)),monday=today-((today+3)%7),weeks=[];
 for(let i=0;i<weeksAhead;i++)weeks.push({start:monday+i*7,label:fromDay(monday+i*7)});
 const owners=new Map();
 for(const t of tasks){
  if(t.status==='Completato')continue;
  const names=[t.owner,...(t.assignedAgents||[]).filter(a=>norm(a)!==norm(t.owner)).map(a=>'Agente '+String(a).replace(/[-_]+/g,' '))].filter(Boolean);
  const due=toDay(t.due);if(due==null)continue;
  const w=due<monday?0:Math.floor((due-monday)/7);if(w>=weeksAhead)continue;
  for(const n of new Set(names)){if(!owners.has(n))owners.set(n,new Array(weeksAhead).fill(0));owners.get(n)[w]++}
 }
 const cap=Number.isInteger(capacity)&&capacity>0?capacity:3;
 const rows=[...owners.entries()].map(([owner,cells])=>{const peak=Math.max(...cells),total=cells.reduce((a,b)=>a+b,0);
  return {owner,cells,total,peak,load:Math.round(100*total/(cap*weeksAhead)),peakLoad:Math.round(100*peak/cap),over:cells.map(n=>n>cap)}})
  .sort((a,b)=>b.total-a.total||a.owner.localeCompare(b.owner));
 const max=Math.max(1,...rows.flatMap(r=>r.cells));
 return {weeks,rows,max,capacity:cap,overloaded:rows.filter(r=>r.peak>cap).map(r=>r.owner)};
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

// Portfolio across projects: entries = [{id,name,state,createdAt}] where state is a PM plan (or null when none yet).
// Budget health = share of projects with a budget whose actual costs stay within it.
function portfolio(entries,now){
 const today=toDay(todayIso(now)),weekAgo=(now==null?Date.now():now)-7*DAY,recent=v=>{const t=Date.parse(v||'');return Number.isFinite(t)&&t>=weekAgo},projects=[];let done=0,total=0,dueSoFar=0,dueDone=0,budgeted=0,healthy=0,doneWeek=0,newWeek=0;
 for(const e of entries||[]){
  const tasks=e.state&&Array.isArray(e.state.tasks)?e.state.tasks:[],plan=e.state&&e.state.projects&&e.state.projects[0];
  const k=kpis(tasks,now),b=budget(tasks,plan);
  done+=k.done;total+=k.total;doneWeek+=tasks.filter(t=>t.status==='Completato'&&recent(t.completedAt)).length;if(k.total>k.done&&recent(e.createdAt))newWeek++;
  for(const t of tasks){const d=toDay(t.due);if(d!=null&&d<=today){dueSoFar++;if(t.status==='Completato')dueDone++}}
  if(b.budget){budgeted++;if(!b.overSpent)healthy++}
  projects.push({id:e.id,name:e.name,total:k.total,done:k.done,late:k.late,
   progress:tasks.length?Math.round(100*tasks.reduce((a,t)=>a+doneShare(t),0)/tasks.length):0,
   active:k.total>k.done,overSpent:b.overSpent,nextMilestone:k.nextMilestone});
 }
 projects.sort((a,b)=>b.late-a.late||Number(b.active)-Number(a.active)||a.name.localeCompare(b.name));
 return {active:projects.filter(p=>p.active).length,projects:projects.length,done,total,doneWeek,newWeek,
  onTime:dueSoFar?Math.round(100*dueDone/dueSoFar):null,budgetHealth:budgeted?Math.round(100*healthy/budgeted):null,budgeted,list:projects};
}

// What an assigned agent receives for one activity: the task, its open sub-tasks, and the latest
// result of each completed dependency as material to build on (like v3.7 specialist prompts).
function agentBrief(state,task,agent){
 const byId=new Map(state.tasks.map(t=>[t.id,t])),lines=['ATTIVITÀ DEL PIANO DI PROGETTO: '+task.title,'Scadenza: '+task.due];
 if(task.details)lines.push('','Dettagli:',task.details);
 const open=(task.checklist||[]).filter(c=>!c.done);if(open.length)lines.push('','Sotto-attività da coprire:',...open.map(c=>'- '+c.text));
 const material=(task.dependencies||[]).map(id=>byId.get(id)).filter(d=>d&&d.agentWork&&d.agentWork.length).map(d=>{const w=d.agentWork[d.agentWork.length-1];return '=== '+d.title+' ('+w.agent+') ===\n'+w.text});
 if(material.length)lines.push('','MATERIALE DA USARE — risultato delle attività da cui questa dipende:','',...material,'','Svolgi il tuo compito basandoti su questo materiale (non riscriverlo: usalo).');
 const prev=(task.agentWork||[]).filter(w=>w.agent===agent).pop();if(prev)lines.push('','Tua versione precedente (migliorala tenendo conto dei dettagli aggiornati):','',prev.text);
 lines.push('','Consegna il risultato finale pronto da rivedere, in italiano.');
 return lines.join('\n');
}

// Agency deliverables approved in the Agency workspace close their PM activity.
// Where a task comes from, so automatic changes are never mistaken for someone's manual work.
function origin(t){
 if(t&&t.agencyTaskId)return {kind:'agency',label:t.status==='Completato'?'Approvato in Agency':'Incarico Agency',title:t.status==='Completato'?'Completata in automatico: il deliverable è stato approvato nel workspace Agency.':'Incarico di uno specialista Agency: lo stato segue il workspace Agency.'};
 if(t&&t.pedContentId)return {kind:'ped',label:'Dal PED',title:'Contenuto del Piano editoriale: stato e testo si gestiscono nel PED.'};
 return null;
}
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

// PED → PM: one production task per dated PED content, in the sub-project «Contenuti PED» of the first project.
// The task is due the day before publication and starts three days earlier. The content's state moves the
// task forward (review → In revisione, approved → Completato); a content edited after completion reopens it.
// PM changes never touch the PED. Returns the ids created, updated and completed.
const PED_SUB='Contenuti PED',PED_TARGET={draft:'Da fare',review:'In revisione',approved:'Completato'};
function shiftDay(day,n){const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function syncFromPed(pm,state,ped,owner){
 const out={created:[],updated:[],completed:[]};
 const contents=(ped&&Array.isArray(ped.contents)?ped.contents:[]).filter(c=>c&&typeof c.id==='string'&&c.id.length<=80&&/^\d{4}-\d{2}-\d{2}$/.test(c.date||''));
 if(!contents.length)return out;
 const project=state.projects[0];let sub=project.subprojects.find(s=>s.name===PED_SUB);
 if(!sub){if(project.subprojects.length>=30)return out;const used=new Set(state.projects.flatMap(p=>p.subprojects.map(s=>s.id)));let n=project.subprojects.length+1;while(used.has(project.id+'s'+n))n++;sub={id:project.id+'s'+n,name:PED_SUB};project.subprojects.push(sub)}
 const fieldsOf=c=>({title:(String(c.channel||'Contenuto')+' · '+String(c.title||'')).slice(0,120),start:shiftDay(c.date,-4),due:shiftDay(c.date,-1),details:('Contenuto del PED per '+c.channel+', pubblicazione il '+c.date+(c.time?' alle '+c.time:'')+'. Stato e testo si gestiscono nel PED.').slice(0,4000)});
 for(const c of contents){
  let t=state.tasks.find(x=>x.pedContentId===c.id);const rev=Number(c.revision)||1,target=PED_TARGET[c.status]||'Da fare';
  try{
   if(!t){
    if(state.tasks.length>=500)break;
    t=pm.create(state,{...fieldsOf(c),owner:String(owner||'Social media manager').slice(0,80)||'Social media manager',project:project.id,subproject:sub.id,assignedAgents:['copywriter']});
    t.pedContentId=c.id;t.pedRevision=rev;t.history.push('Creata dal PED del progetto.');out.created.push(t.id);
   }else if(rev>(t.pedRevision||0)){
    if(t.status==='Completato'&&target!=='Completato'){pm.changeStatus(state,t.id,'In corso');t.history.push('Riaperta: il contenuto è stato modificato nel PED.')}
    if(t.status!=='Completato'){const f=fieldsOf(c);if(f.title!==t.title||f.due!==t.due||f.start!==t.start||f.details!==t.details){pm.update(state,t.id,f);out.updated.push(t.id)}}
    t.pedRevision=rev;
   }
   const order=STATUSES.indexOf(target);
   if(STATUSES.indexOf(t.status)<order){
    for(const step of STATUSES.slice(1,order+1))if(STATUSES.indexOf(t.status)<STATUSES.indexOf(step))pm.changeStatus(state,t.id,step);
    if(t.status==='Completato'){t.history.push('Completata: contenuto approvato nel PED.');out.completed.push(t.id)}
   }
  }catch(e){/* blocked in PM (dependencies or open sub-tasks): it advances on a later sync */}
 }
 return out;
}

// Incarichi added to the Agency plan after the PM plan existed get their PM task too, in the first
// sub-project, due a week after the last of their dependencies (or a week from today).
function addFromAgency(pm,state,agency,today){
 const added=[],labels=(agency&&agency.roles)||{},project=state.projects[0],sub=project.subprojects[0];
 if(!state.tasks.some(t=>t.agencyTaskId))return added;// a plan built by hand is left alone
 for(const at of (agency&&Array.isArray(agency.tasks)?agency.tasks:[])){
  if(!at||typeof at.id!=='string'||state.tasks.some(t=>t.agencyTaskId===at.id)||state.tasks.length>=500)continue;
  const deps=(at.dependsOn||[]).map(d=>state.tasks.find(t=>t.agencyTaskId===d)).filter(Boolean);
  const after=deps.map(t=>t.due).filter(Boolean).sort().pop()||today;
  try{
   const name=String(labels[at.role]||at.role);
   const t=pm.create(state,{title:(name+' — '+at.instruction).slice(0,120),owner:name.slice(0,80),start:'',due:shiftDay(after,7),details:String(at.instruction||'').slice(0,4000),assignedAgents:[at.role],project:project.id,subproject:sub.id,dependencies:deps.map(t=>t.id),approvalRequired:true,recurrence:'Nessuna'});
   t.agencyTaskId=at.id;t.history.push('Creata da un incarico aggiunto al piano Agency.');added.push(t.id);
  }catch(e){/* invalid in PM (dates, limits): skipped */}
 }
 return added;
}

// «Ripianifica i ritardi»: open activities past their due date move to today, and every open activity that
// depends on a moved one keeps its original distance from it (at least one day). Completed activities and
// PED contents (their date comes from the PED) never move. Returns the proposed changes in dependency order.
// Pure: agent work that can start now: open tasks (Da fare / In corso) whose dependencies are completed,
// one entry per assigned agent that has not produced a result yet. Order: due date, then title.
function readyAgentWork(tasks,all){
 const byId=new Map((all||tasks||[]).map(t=>[t.id,t])),out=[];
 for(const t of [...(tasks||[])].sort((a,b)=>String(a.due||'').localeCompare(String(b.due||''))||String(a.title).localeCompare(String(b.title)))){
  if(!['Da fare','In corso'].includes(t.status))continue;
  if((t.dependencies||[]).some(id=>(byId.get(id)||{}).status!=='Completato'))continue;
  for(const agent of t.assignedAgents||[])if(!(t.agentWork||[]).some(w=>w.agent===agent))out.push({id:t.id,title:t.title,agent});
 }
 return out;
}
function replan(tasks,now){
 const byId=new Map(tasks.map(t=>[t.id,t])),today=toDay(todayIso(now)),next=new Map(),order=[],seen=new Set();
 const visit=t=>{if(seen.has(t.id))return;seen.add(t.id);for(const d of t.dependencies||[])if(byId.has(d))visit(byId.get(d));order.push(t)};
 tasks.forEach(visit);
 const out=[];
 for(const t of order){
  const due=toDay(t.due);if(due==null){continue}
  let req=due;
  if(t.status!=='Completato'&&!t.pedContentId){
   if(due<today)req=today;
   for(const d of t.dependencies||[]){const dep=byId.get(d),was=dep&&toDay(dep.due),now2=next.get(d);if(was==null||now2==null||now2<=was)continue;req=Math.max(req,now2+Math.max(1,due-was))}
  }
  next.set(t.id,req);
  if(req>due){const start=toDay(t.start);out.push({id:t.id,title:t.title,from:t.due,due:fromDay(req),start:start==null?'':fromDay(start+req-due),late:due<today})}
 }
 return out;
}

// Weekly progress report of one project, as plain text to send to the client or the team: what was completed in
// the last 7 days, what is in progress, late, due in the next 14 days and waiting for approval, with budget.
// Built only from the plan; nothing is sent.
function statusReport(tasks,project,now,opts){
 const o=opts||{},today=toDay(todayIso(now)),it=d=>new Date(d*DAY+43200000).toLocaleDateString('it-IT',{day:'numeric',month:'short',timeZone:'UTC'});
 const sub=id=>((project&&project.subprojects)||[]).find(s=>s.id===id),open=tasks.filter(t=>t.status!=='Completato');
 const line=t=>'• '+t.title+(t.owner?' · '+t.owner:'')+(toDay(t.due)!=null?' · '+it(toDay(t.due)):'')+(t.milestone?' · milestone':'');
 const doneWeek=tasks.filter(t=>t.status==='Completato'&&t.completedAt&&toDay(String(t.completedAt).slice(0,10))>today-7);
 const late=open.filter(t=>toDay(t.due)!=null&&toDay(t.due)<today).sort((a,b)=>String(a.due).localeCompare(String(b.due)));
 const active=open.filter(t=>(t.status==='In corso'||t.status==='In revisione')&&!late.includes(t));
 const next=open.filter(t=>toDay(t.due)!=null&&toDay(t.due)>=today&&toDay(t.due)<=today+13&&!active.includes(t)).sort((a,b)=>String(a.due).localeCompare(String(b.due)));
 const approvals=tasks.filter(t=>t.approvalRequired&&!t.approved&&t.status==='In revisione');
 const k=kpis(tasks,now),b=budget(tasks,project),eur=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n);
 const pct=tasks.length?Math.round(100*tasks.reduce((a,t)=>a+doneShare(t),0)/tasks.length):0;
 const L=['Report di avanzamento · '+((project&&project.name)||'Progetto'),'Settimana dal '+it(today-6)+' al '+it(today),'',
  'Sintesi',
  '• Avanzamento: '+pct+'% · attività completate: '+k.done+' di '+k.total,
  '• Puntualità sulle scadenze passate: '+(k.onTime==null?'nessuna scadenza ancora passata':k.onTime+'%'),
  '• In ritardo: '+late.length+(k.nextMilestone?' · prossima milestone: '+k.nextMilestone.title+' ('+it(toDay(k.nextMilestone.due))+')':''),
  b.budget?'• Budget: speso '+eur(b.spent)+' di '+eur(b.budget)+' ('+b.spentPct+'%)'+(b.overSpent?' · sforato':''):(b.spent?'• Costi effettivi: '+eur(b.spent):'')];
 const section=(title,list,empty)=>{L.push('',title+' ('+list.length+')');if(!list.length)L.push(empty);else{list.slice(0,25).forEach(t=>L.push(line(t)+(sub(t.subproject)&&((project.subprojects||[]).length>1)?' · '+sub(t.subproject).name:'')));if(list.length>25)L.push('… e altre '+(list.length-25))}};
 section('Completate negli ultimi 7 giorni',doneWeek,'• Nessuna');
 section('In lavorazione',active,'• Nessuna');
 section('In ritardo',late,'• Nessuna: il piano è in linea');
 section('In scadenza nei prossimi 14 giorni',next,'• Nessuna');
 if(approvals.length)section('In attesa di approvazione',approvals,'');
 if(o.note)L.push('','Note',String(o.note).trim().slice(0,2000));
 return {text:L.filter((x,i)=>x!==''||L[i-1]!=='').join('\n').trim()+'\n',counts:{done:doneWeek.length,active:active.length,late:late.length,next:next.length,approvals:approvals.length}};
}

return Object.freeze({origin,readyAgentWork,statusReport,STATUSES,toDay,fromDay,kanban,gantt,phases,doneShare,workload,kpis,budget,portfolio,agentBrief,syncFromAgency,syncFromPed,addFromAgency,replan});
});
