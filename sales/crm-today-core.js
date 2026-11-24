'use strict';
/* «Oggi» (sales/crm-today.js): the rules behind the phone-first day view, without the DOM.
   - agenda: open tasks already late and those still due today, mine first, then the rest, by due time.
   - target: who a call for a task is with (its contact, else its company) and the phone to dial.
   - callPlan / followUpPlan / doneData: the exact bodies sent to the existing /api/sales commands
     (interactions create with kind call, tasks create, tasks update with the record version).
   Fields and limits are the ones api/_sales.js accepts; nothing here writes. */
(function(root){
const DAY=864e5;
const OUTCOMES=Object.freeze({answered:'Risposto',no_answer:'Non risponde',callback:'Richiamare'});
const utc=ms=>new Date(ms).toISOString().slice(0,19)+'Z';
const time=v=>{if(v==null||v==='')return NaN;const t=Date.parse(v);return Number.isFinite(t)?t:NaN};
// Days and hours are in ora italiana (RadixCrmDates, Europe/Rome) whatever the browser's zone.
const dates=()=>root.RadixCrmDates||(typeof require==='function'?require('./crm-dates-core.js'):null);
// Midnight in Rome of the day that contains now, and of the next day (25 October lasts 25 hours).
function dayBounds(now){return {start:dates().dayStart(now),end:dates().dayEnd(now)}}

// Open tasks with a due time before the end of today, split at "now": late ones and the rest of today.
// Assigned to me first (when I am known), then the others; each group by due time, oldest first.
function agenda(tasks,now,me){
 const {end}=dayBounds(now),seen=new Set(),out={overdue:[],today:[]};
 for(const t of tasks||[]){
  if(!t||!t.id||seen.has(t.id)||t.status==='done')continue;const due=time(t.due_at);if(!Number.isFinite(due)||due>=end)continue;
  seen.add(t.id);(due<now?out.overdue:out.today).push(t);
 }
 const mine=t=>me!=null&&me!==0&&t.assignee_id===me;
 const order=(a,b)=>(mine(b)-mine(a))||(time(a.due_at)-time(b.due_at))||String(a.id).localeCompare(String(b.id));
 out.overdue.sort(order);out.today.sort(order);
 out.mine=[...out.overdue,...out.today].filter(mine).length;
 return out;
}

// A tel: link from a stored phone ("+39 02 555 0101", "(02) 555-0101"): digits and one leading +.
// Fewer than 5 digits, or letters in it, is not a number to dial: null.
function telHref(phone){
 const v=String(phone??'').trim();if(!v||/[a-z]/i.test(v.replace(/^tel:/i,'')))return null;
 const plus=/^(?:tel:)?\s*(?:\+|00)/i.test(v),digits=v.replace(/^(?:tel:)?\s*(?:\+|00)/i,'').replace(/\D/g,'');
 if(digits.length<5||digits.length>15)return null;
 return 'tel:'+(plus?'+':'')+digits;
}

// Who the call of a task is with: the task's contact (with its company), else its company.
// links are the task's own company/contact/opportunity, the combination the server already accepted.
function target(task,contacts,companies){
 if(!task)return null;
 const contact=task.contact_id?(contacts||[]).find(c=>c.id===task.contact_id)||null:null;
 const company=task.company_id?(companies||[]).find(c=>c.id===task.company_id)||null:null;
 const links={company_id:task.company_id||null,contact_id:task.contact_id||null,opportunity_id:task.opportunity_id||null};
 const phone=contact&&telHref(contact.phone)?contact.phone:company&&telHref(company.phone)?company.phone:null;
 return {name:(contact&&contact.name)||(company&&company.name)||'',company:(company&&company.name)||'',phone,tel:telHref(phone),links,
  linked:!!(links.company_id||links.contact_id||links.opportunity_id)};
}

// «Registra chiamata»: one interactions create, kind call, now. The outcome leads the text.
function callPlan(input,tg,now){
 const i=input||{};if(!Object.hasOwn(OUTCOMES,i.outcome))return {error:'Scegli l’esito della chiamata.'};
 if(!tg||!tg.linked)return {error:'Questa attività non è collegata a un’azienda, un contatto o un’opportunità: la chiamata non si può registrare qui.'};
 const note=String(i.note??'').trim(),body='Esito: '+OUTCOMES[i.outcome]+(note?'\n'+note:'');
 if(body.length>4000)return {error:'La nota supera 4000 caratteri.'};
 const title=(tg.name?'Chiamata con '+tg.name:'Chiamata')+' · '+OUTCOMES[i.outcome];
 return {error:null,data:{title:title.length>200?title.slice(0,199)+'…':title,kind:'call',occurred_at:utc(Number.isFinite(now)?now:Date.now()),body,...tg.links}};
}

// Tomorrow at 9:00 in Rome, as the API's UTC timestamp.
function tomorrowAt9(now){const D=dates();return utc(D.fromInputMs(D.addDays(D.dayOf(now),1)+'T09:00'))}
// «Richiamare»: the follow-up task proposed after the call, created only if the user confirms it.
function followUpPlan(tg,now,me){
 if(!tg||!tg.linked)return {error:'Attività non collegata: crea il richiamo dalla sezione Attività.'};
 const title=tg.name?'Richiamare '+tg.name:'Richiamare';
 return {error:null,data:{title:title.length>200?title.slice(0,199)+'…':title,status:'todo',priority:'normal',due_at:tomorrowAt9(Number.isFinite(now)?now:Date.now()),
  assignee_id:Number.isInteger(me)&&me>0?me:null,...tg.links}};
}

// «Fatto»: the same update the task card sends (id + version + status).
function doneData(task){return task&&task.id&&Number.isInteger(task.version)?{id:task.id,version:task.version,status:'done'}:null}

// Calendar items of today that are not tasks (meetings, calls, closings): from calendar-view.js's events.
// All-day items start at the browser's midnight of their date (calendar-view.js): they count on today's Rome date.
const localDay=d=>{const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')};
function todayEvents(events,now){const {start,end}=dayBounds(now),today=dates().dayOf(now);
 return (events||[]).filter(e=>e&&e.type!=='task'&&(e.allDay?localDay(e.start)===today:+e.start>=start&&+e.start<end))}

// "Scaduta ieri · 09:00", "Oggi · 17:30": the due label of a task.
function dueLabel(due_at,now){
 const t=time(due_at);if(!Number.isFinite(t))return '';
 const D=dates(),hm=D.hm(t);
 const days=Math.round((Date.parse(D.dayOf(now)+'T00:00:00Z')-Date.parse(D.dayOf(t)+'T00:00:00Z'))/DAY);
 if(t>=now)return 'Oggi · '+hm;
 return 'Scaduta '+(days<=0?'oggi':days===1?'ieri':'da '+days+' giorni')+' · '+hm;
}

const core={OUTCOMES,dayBounds,agenda,telHref,target,callPlan,followUpPlan,tomorrowAt9,doneData,todayEvents,dueLabel};
if(typeof module==='object'&&module.exports)module.exports=core;else root.RadixCrmTodayCore=core;
})(typeof globalThis!=='undefined'?globalThis:this);
