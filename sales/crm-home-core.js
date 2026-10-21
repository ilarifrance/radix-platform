'use strict';
/* «Suggerimenti per oggi» on the CRM home (Panoramica): up to 6 items picked by fixed rules from the
   rows the CRM already loads (crm-data.js, plus the tickets sales.js loads). No AI, no writes: each
   item only says why it is there and where to go (Customer360 of the record, or a CRM view).
   Order: urgency first (3 scaduto, 2 oggi o fermo, 1 da fare, 0 da lavorare), then value, then age.
   Stale deals and new contacts reuse the rules of crm-automations-core.js.
   With the workspace's «Regole» (crm-rules-core.js, opts.rules = the stored list): a default rule switched off
   there (Chiusura scaduta, Trattativa ferma, Primo contatto) disappears here too, and each custom rule adds its
   proposals under its own name. opts.rules undefined (no rules row, or not read) = exactly the fixed behaviour.
   This is the one list of today's actions on the Panoramica: it replaces the old «Azioni suggerite»
   (its «chiude a breve senza attività» rule is «Chiusura vicina» here) and «Focus di oggi»
   (its team counts and last interaction are in pulse()). */
(function(root){
const DAY=864e5,MAX=6,PER_RULE=3;
const list=v=>Array.isArray(v)?v:[];
const ts=v=>{const n=Date.parse(v||'');return Number.isFinite(n)?n:null};
const pad=n=>String(n).padStart(2,'0');
const localDay=n=>{const d=new Date(n);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
const midnight=n=>{const d=new Date(n);d.setHours(0,0,0,0);return +d};
const MONTHS=['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
const fmtDay=s=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(s||''));return m?Number(m[3])+' '+MONTHS[Number(m[2])-1]:''};
const days=n=>n===1?'1 giorno':n+' giorni';
const isOpenDeal=o=>!o.outcome||o.outcome==='open';
const SOON=14;// «Chiusura vicina»: expected close within this many days and no open task on the deal
const automations=()=>root.RadixCrmAutomations||(typeof require==='function'?require('./crm-automations-core.js'):null);
const slaCore=()=>root.RadixCrmSla||(typeof require==='function'?require('./crm-sla-core.js'):null);
const rulesCore=()=>root.RadixCrmRules||(typeof require==='function'?require('./crm-rules-core.js'):null);
const open360=(subject,r)=>({kind:'customer',subject,id:r.id,name:r.name||r.title||''});
const view=(hash)=>({kind:'view',hash});

const RULES=Object.freeze([
 {id:'close-overdue',name:'Chiusura scaduta'},
 {id:'task-due',name:'Attività in scadenza'},
 {id:'close-soon',name:'Chiusura vicina'},
 {id:'stale-deal',name:'Trattativa ferma'},
 {id:'new-contact',name:'Primo contatto'},
 {id:'ticket-sla',name:'Scadenza SLA'},
 {id:'ticket-open',name:'Ticket da seguire'},
 {id:'lead-new',name:'Lead da lavorare'}
]);

// data: crm-data.js rows (+ tickets); opts: {now, me (user id), tickets, rules (stored «Regole» list), quotes,
// sla (settings of crm-sla-core.js: turns on «Scadenza SLA»)}
function collect(data,opts){
 const d=data||{},o=opts||{},now=o.now||Date.now(),today=localDay(now),t0=midnight(now),t1=t0+DAY;
 const RC=o.rules!==undefined&&o.rules!==null?rulesCore():null,eff=RC?RC.effective(o.rules):null;
 const on=id=>!eff||!eff.some(r=>r.builtin&&r.id===id&&!r.on);
 const opps=list(d.opportunities),tasks=list(d.tasks),inter=list(d.interactions),contacts=list(d.contacts),companies=list(d.companies);
 const tickets=list(d.tickets&&d.tickets.length?d.tickets:o.tickets);
 const amountOf=id=>Number((opps.find(x=>x.id===id)||{}).amount_cents||0);
 const companyName=id=>(companies.find(c=>c.id===id)||{}).name||'';
 const out=[];
 // 1. Opportunities still open after their expected close date.
 for(const x of opps){if(!on('close-overdue')||!isOpenDeal(x))continue;const c=String(x.expected_close||'').slice(0,10);if(!c||c>=today)continue;
  const late=Math.round((t0-midnight(new Date(c+'T00:00:00').getTime()))/DAY);
  out.push({rule:'close-overdue',key:'opportunities:'+x.id,urgency:3,value:Number(x.amount_cents||0),age:late,
   title:x.title||'Opportunità',reason:'Chiusura prevista il '+fmtDay(c)+', ancora aperta ('+days(late)+' fa).',action:open360('opportunities',x),label:'Apri'})}
 // 1b. Open deals closing within 14 days with no open task on them.
 for(const x of opps){if(!isOpenDeal(x))continue;const c=String(x.expected_close||'').slice(0,10);if(!c||c<today)continue;
  const left=Math.round((midnight(new Date(c+'T00:00:00').getTime())-t0)/DAY);if(left>SOON)continue;
  if(tasks.some(t=>t.opportunity_id===x.id&&t.status!=='done'))continue;
  out.push({rule:'close-soon',key:'opportunities:'+x.id,urgency:2,value:Number(x.amount_cents||0),age:SOON-left,
   title:x.title||'Opportunità',reason:'Chiude il '+fmtDay(c)+' ('+(left<1?'oggi':'tra '+days(left))+') e non ha attività aperte.',action:open360('opportunities',x),label:'Apri'})}
 // 2. My open tasks overdue or due today.
 if(o.me){for(const t of tasks){if(t.status==='done'||t.assignee_id!==o.me)continue;const due=ts(t.due_at);if(due===null||due>=t1)continue;const late=due<now;
  const n=Math.floor((t0-midnight(due))/DAY);
  out.push({rule:'task-due',key:'tasks:'+t.id,urgency:late?3:2,value:t.opportunity_id?amountOf(t.opportunity_id):0,age:Math.max(0,n),
   title:t.title||'Attività',reason:late?(n>0?'Scaduta da '+days(n)+', assegnata a te.':'Scaduta oggi, assegnata a te.'):'In scadenza oggi, assegnata a te.',action:view('#tasks'),label:'Vai alle attività'})}}
 // 3. Open deals untouched for 14+ days (rule «Trattativa ferma» of the automations).
 const A=automations();
 if(A){if(on('stale-deal'))for(const it of A.plan('stale-deal',{opportunities:opps,tasks,interactions:inter},{now}).items){const x=it.record;
  const last=Math.max(0,...inter.filter(i=>i.opportunity_id===x.id||(x.contact_id&&i.contact_id===x.contact_id)).map(i=>ts(i.occurred_at)||0));
  const n=last?Math.floor((now-last)/DAY):null;
  out.push({rule:'stale-deal',key:'opportunities:'+x.id,urgency:2,value:Number(x.amount_cents||0),age:n===null?Math.floor((now-(ts(x.created_at)||now))/DAY):n,
   title:x.title||'Opportunità',reason:(n===null?'Nessun contatto registrato':'Ultimo contatto '+days(n)+' fa')+' e nessuna attività aperta.',action:open360('opportunities',x),label:'Apri'})}
 // 4. Contacts created in the last 7 days with no interaction, deal or task (rule «Primo contatto»).
  if(on('new-contact'))for(const it of A.plan('new-contact',{contacts,opportunities:opps,tasks,interactions:inter},{now}).items){const c=it.record;const n=Math.floor((now-ts(c.created_at))/DAY);
   out.push({rule:'new-contact',key:'contacts:'+c.id,urgency:1,value:0,age:n,
    title:c.name||'Contatto',reason:'Nuovo contatto'+(companyName(c.company_id)?' di '+companyName(c.company_id):'')+' (da '+(n<1?'oggi':days(n))+'), ancora nessun primo contatto.',action:open360('contacts',c),label:'Apri'})}}
 // 5a. Tickets past or near their SLA (sales/crm-sla-core.js); one item per ticket wins over «Ticket da seguire» at equal urgency.
 const SLA=o.sla&&slaCore();
 if(SLA){for(const k of tickets){const r=SLA.evaluate(k,{now,settings:o.sla,interactions:inter});if(!r||!r.active||(r.state!=='scaduto'&&r.state!=='in-scadenza'))continue;
  const since=ts(k.created_at),n=since===null?0:Math.floor((now-since)/DAY);
  out.push({rule:'ticket-sla',key:'tickets:'+k.id,urgency:r.state==='scaduto'?3:2,value:0,age:n,
   title:k.title||'Ticket',reason:SLA.badge(r).text+' · priorità '+SLA.PRIORITY_LABEL[r.priority]+'.',action:view('#tickets'),label:'Vai all’assistenza'})}}
 // 5. Tickets to follow: open (waiting for us) and «In attesa del cliente» (pending: remind or close).
 for(const k of tickets){if(k.status!=='open'&&k.status!=='pending')continue;const wait=k.status==='pending';
  const since=ts(wait?(k.updated_at||k.created_at):k.created_at);const n=since===null?0:Math.floor((now-since)/DAY);const due=ts(k.due_at),late=due!==null&&due<now;
  const urgent=k.priority==='urgent'||k.priority==='high';
  out.push({rule:'ticket-open',key:'tickets:'+k.id,urgency:late?3:urgent?2:wait&&n<3?0:1,value:0,age:n,
   title:k.title||'Ticket',reason:(wait?'In attesa del cliente da ':'Aperto da ')+(n<1?'oggi':days(n))+(late?', scadenza passata':'')+(urgent?', priorità '+(k.priority==='urgent'?'urgente':'alta'):'')+(wait?': sollecita o chiudi.':'.'),action:view('#tickets'),label:'Vai all’assistenza'})}
 // 6. Leads in the CRM whose contact (or company) has no interaction, task or deal yet.
 for(const l of list(d.leads)){const by=l.contact_id?'contact_id':l.company_id?'company_id':null;const ref=by&&l[by];
  if(!ref)continue;// a lead with no contact nor company cannot be checked: skip it rather than guess
  if(inter.some(i=>i[by]===ref)||tasks.some(t=>t[by]===ref)||opps.some(x=>x[by]===ref))continue;
  const born=ts(l.created_at),n=born===null?0:Math.floor((now-born)/DAY);
  const target=by==='contact_id'?contacts.find(c=>c.id===ref):companies.find(c=>c.id===ref);
  out.push({rule:'lead-new',key:target?(by==='contact_id'?'contacts:':'companies:')+ref:'leads:'+l.id,urgency:0,value:0,age:n,
   title:l.title||'Lead',reason:'Lead nel CRM'+(born!==null?' da '+(n<1?'oggi':days(n)):'')+': nessuna attività, interazione o trattativa.',
   action:target?open360(by==='contact_id'?'contacts':'companies',target):view('#leads'),label:target?'Apri':'Vai ai lead'})}
 // 7. Custom «Regole»: what each one proposes, under its name (one item per record, after the rules above).
 if(eff&&eff.some(r=>!r.builtin&&r.on)){
  const all={opportunities:opps,tasks,interactions:inter,contacts,companies,leads:list(d.leads),tickets,stages:list(d.stages),quotes:list(o.quotes)};
  for(const run of RC.evaluate(o.rules,all,{now,assignee:o.me||null})){if(run.rule.builtin||run.off)continue;
   for(const it of run.items)out.push(customItem(run.rule,it,{opps,contacts,now}))}
 }
 return out;
}
// A custom rule's proposal as a home item: open the record (or its view), say which rule and what it proposes.
function customItem(rule,it,c){
 const RC=rulesCore;
 const r=it.record,opp=it.entity==='opportunities'?r:it.entity==='quotes'&&r.opportunity_id?c.opps.find(x=>x.id===r.opportunity_id):null;
 const contact=it.entity==='contacts'?r:null;
 const born=ts(r.created_at||r.updated_at),age=born===null?0:Math.max(0,Math.floor((c.now-born)/DAY));
 const action=opp?open360('opportunities',opp):contact?open360('contacts',contact):view(it.entity==='tickets'?'#tickets':it.entity==='leads'?'#leads':'#tasks');
 const what=it.task?'proponi l’attività «'+(RC().KINDS[rule.do.kind]||'')+': '+rule.do.title+'»':'proponi la bozza email «'+it.email.subject+'»';
 return {rule:rule.id,ruleName:rule.name,key:(it.entity==='quotes'&&opp?'opportunities:'+opp.id:it.key),urgency:it.entity==='tickets'?2:1,value:opp?Number(opp.amount_cents||0):0,age,
  title:r.title||r.name||(r.number?'Preventivo '+r.number:'Record'),reason:'Regola «'+rule.name+'»: '+what+'.',action,label:opp||contact?'Apri':it.entity==='tickets'?'Vai all’assistenza':it.entity==='leads'?'Vai ai lead':'Vai alle attività'};
}

function rank(items){
 const seen=new Map();
 for(const it of items){const prev=seen.get(it.key);if(!prev||it.urgency>prev.urgency)seen.set(it.key,it)}// one item per record
 const sorted=[...seen.values()].sort((a,b)=>b.urgency-a.urgency||b.value-a.value||b.age-a.age||String(a.title).localeCompare(String(b.title),'it'));
 const per={},out=[];for(const it of sorted){per[it.rule]=(per[it.rule]||0)+1;if(per[it.rule]<=PER_RULE)out.push(it)}
 return out;
}

// Team counts shown on top of the list (what «Focus di oggi» showed): open tasks overdue, due today,
// open, done of all; the last interaction already happened.
function pulse(data,opts){
 const d=data||{},now=(opts&&opts.now)||Date.now(),t0=midnight(now),t1=t0+DAY;
 const tasks=list(d.tasks),open=tasks.filter(t=>t.status!=='done');
 const overdue=open.filter(t=>{const x=ts(t.due_at);return x!==null&&x<t0}).length;
 const today=open.filter(t=>{const x=ts(t.due_at);return x!==null&&x>=t0&&x<t1}).length;
 const past=list(d.interactions).filter(i=>{const x=ts(i.occurred_at);return x!==null&&x<=now}).sort((a,b)=>ts(b.occurred_at)-ts(a.occurred_at));
 const last=past[0]?{title:past[0].title||'Interazione',day:fmtDay(localDay(ts(past[0].occurred_at)))}:null;
 return {overdue,today,open:open.length,done:tasks.length-open.length,total:tasks.length,last};
}

// {items: up to 6, total: how many qualified (after one per record and 3 per rule)}
function suggestions(data,opts){const all=rank(collect(data,opts));return {items:all.slice(0,MAX),total:all.length}}

const api={RULES,MAX,PER_RULE,SOON,collect,rank,suggestions,pulse};
if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixCrmHome=api;
})(typeof globalThis!=='undefined'?globalThis:this);
