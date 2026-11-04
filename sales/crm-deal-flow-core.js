'use strict';
/* Cambio fase di un'opportunità, pure rules (no DOM): the steps the dialog offers and the rows it creates.
   - suggestions(): the playbook steps of the NEW stage that the deal does not have yet (crm-playbook-core.js).
   - recontact(): the default «ricontatto» reminder (3 days; none preselected on a won/lost stage).
   - payloads(): what the choices of the dialog turn into — one interaction (the activity done) and the tasks —
     exactly the fields api/_sales.js already accepts, so nothing new is stored. */
(function(root){
const DAY=864e5;
const KINDS=Object.freeze([['call','Telefonata'],['meeting','Incontro'],['email','Email'],['note','Nota']]);
const RECALL_DAYS=Object.freeze([1,2,3,5,7,14,30]);
const clamp=(v,d)=>{const n=Math.round(Number(v));return Number.isFinite(n)&&n>=0&&n<=365?n:d};
const text=(v,n)=>String(v==null?'':v).replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,n);
const dueAt=(days,now)=>{const d=new Date(Number.isFinite(now)?now:Date.now());d.setUTCHours(9,0,0,0);return new Date(d.getTime()+clamp(days,0)*DAY).toISOString().slice(0,19)+'Z'};
const tagOf=t=>String(t||'').replace(/^\[Playbook [^\]]*\] /,'');
const kindLabel=k=>(KINDS.find(x=>x[0]===k)||[])[1]||'Nota';
// Steps of the new stage still missing on the deal, as [{title, label, days}] (title keeps the playbook tag so the same
// step is never offered twice; label is what the person reads).
function suggestions(stage,opp,tasks,Playbook,now){
 if(!stage||!opp||!Playbook)return [];
 const plan=Playbook.planPlaybook({...opp,stage_id:stage.id},[stage],tasks||[],{now});
 return plan.steps.filter(s=>!s.done).map(s=>({title:s.title,label:tagOf(s.title),days:clamp(s.day,0)}));
}
// The «ricontatto» reminder offered on every move; preselected unless the stage closes the deal.
function recontact(stage){const t=String(stage&&stage.title||'').toLocaleLowerCase('it');return {days:3,checked:!/vint|perd|chius|firmat|clien/.test(t)}}
// choice: {activity:{kind,body}|null, tasks:[{title,days}]}. opp: the deal. Returns {interaction, tasks}.
function payloads(opp,choice,opts){
 const o=opp||{},c=choice||{},now=opts&&Number.isFinite(opts.now)?opts.now:Date.now(),name=text(o.title,120)||'Opportunità';
 const link={opportunity_id:o.id,company_id:o.company_id||null,contact_id:o.contact_id||null};
 let interaction=null;const a=c.activity;
 if(a&&(a.kind||a.body)){const kind=KINDS.some(k=>k[0]===a.kind)?a.kind:'note',body=text(a.body,2000);
  interaction={title:text(kindLabel(kind)+' · '+name,200),kind,occurred_at:new Date(now).toISOString().slice(0,19)+'Z',...(body?{body}:{}),...link}}
 const tasks=[];const seen=new Set();
 for(const t of c.tasks||[]){const title=text(t&&t.title,200);if(!title||seen.has(title))continue;seen.add(title);
  tasks.push({title,...link,assignee_id:o.owner_id||(opts&&opts.assignee)||null,priority:'normal',status:'todo',due_at:dueAt(t.days,now)})}
 return {interaction,tasks};
}
const core={KINDS,RECALL_DAYS,clamp,dueAt,tagOf,kindLabel,suggestions,recontact,payloads};
if(typeof module==='object'&&module.exports)module.exports=core;
root.RadixDealFlowCore=core;
})(typeof globalThis!=='undefined'?globalThis:this);
