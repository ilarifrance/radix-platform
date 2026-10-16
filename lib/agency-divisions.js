/* RADIX Agency divisions — what each division is working on, computed from registry projects and their
   Agency workspace plans. A task belongs to a division when its specialist is one of the division's agents;
   the Approvals division collects every draft waiting for review. Pure functions, shared with the tests. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixAgencyDivisions=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const STATUS=Object.freeze({proposed:'Da avviare',running:'In lavorazione',done:'Bozza da revisionare',approved:'Bozza approvata',changes_requested:'Modifiche richieste',error:'Errore'});
const OPEN=new Set(['proposed','running','done','changes_requested','error']);

function belongs(division,task){
 if(division.id==='approvals')return task.status==='done';
 return division.agentIds.includes(task.role);
}

// projects: registry rows; plans: Map(projectId -> agency-workspace document data)
function divisionWork(division,projects,plans){
 const out=[];
 for(const p of projects){
  const plan=plans.get(p.id),tasks=plan&&Array.isArray(plan.tasks)?plan.tasks:[];
  const mine=tasks.map((t,i)=>({index:i,id:t.id,role:t.role,status:t.status,title:String(t.instruction||t.title||'').slice(0,160)})).filter(t=>belongs(division,t));
  if(!mine.length)continue;
  out.push({project:{id:p.id,name:p.name,client:p.client_name||null},tasks:mine,
   open:mine.filter(t=>OPEN.has(t.status)).length,review:mine.filter(t=>t.status==='done').length,approved:mine.filter(t=>t.status==='approved').length});
 }
 return out.sort((a,b)=>b.review-a.review||b.open-a.open||a.project.name.localeCompare(b.project.name));
}

function overview(divisions,projects,plans){
 const counts={};
 for(const d of divisions){
  const work=divisionWork(d,projects,plans);
  counts[d.id]={projects:work.length,open:work.reduce((a,w)=>a+w.open,0),review:work.reduce((a,w)=>a+w.review,0)};
 }
 return counts;
}

function summaryLine(c){
 if(!c||!c.projects)return 'Nessun incarico nei progetti del team';
 const parts=[c.projects+(c.projects===1?' progetto':' progetti')];
 if(c.open)parts.push(c.open+(c.open===1?' incarico aperto':' incarichi aperti'));
 if(c.review)parts.push(c.review+' da revisionare');
 return parts.join(' · ');
}

return Object.freeze({STATUS,belongs,divisionWork,overview,summaryLine});
});
