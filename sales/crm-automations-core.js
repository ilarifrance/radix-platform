'use strict';
/* CRM automations: rules that look at the loaded CRM data and propose tasks. Nothing runs by itself:
   the page shows what each rule would create and a person confirms. Each rule tags its task titles
   with «[Auto · name]» so it never proposes a second open task for the same record.
   Stage-entry tasks are a separate, server-side rule configured on each pipeline stage. */
(function(root){
const DAY=864e5,STALE_DAYS=14;
const RULES=Object.freeze([
 {id:'close-overdue',name:'Chiusura scaduta',description:'Trattative aperte con data di chiusura prevista già passata.'},
 {id:'won-onboarding',name:'Avvio cliente',description:'Trattative vinte negli ultimi 30 giorni: avvia l’onboarding del cliente.'},
 {id:'ticket-stalled',name:'Ticket fermo',description:'Ticket aperti o in attesa senza assegnatario, oppure con scadenza passata.'},
 {id:'stale-deal',name:'Trattativa ferma',description:'Trattative aperte senza interazioni né attività aperte da 14 giorni.'},
 {id:'hot-contact',name:'Contatto caldo',description:'Contatti con punteggio caldo senza trattative né attività aperte.'}
]);
const tag=rule=>'[Auto · '+rule.name+']';
const isOpenTask=t=>t&&t.status!=='done';
const at9=(now,days)=>{const d=new Date(now+days*DAY);d.setUTCHours(9,0,0,0);return d.toISOString().slice(0,19)+'Z'};
const short=(s,n)=>String(s||'').slice(0,n);

// data: {opportunities,tasks,tickets,contacts,interactions,stages}; score: optional (contact,data,now)=>{band}
function plan(ruleId,data,opts){
 const rule=RULES.find(r=>r.id===ruleId);if(!rule)throw Error('Regola sconosciuta');
 const now=opts&&opts.now||Date.now(),today=new Date(now).toISOString().slice(0,10),assignee=opts&&opts.assignee||null;
 const tasks=(data.tasks||[]).filter(isOpenTask),title=tag(rule);
 const has=(field,id)=>tasks.some(t=>t[field]===id&&String(t.title||'').startsWith(title));
 const out=[];
 const opps=data.opportunities||[];
 if(ruleId==='close-overdue'){
  for(const o of opps){if(o.outcome&&o.outcome!=='open')continue;const d=String(o.expected_close||'').slice(0,10);if(!d||d>=today||has('opportunity_id',o.id))continue;
   out.push({record:o,task:{title:short(title+' Aggiorna la chiusura: '+(o.title||''),200),opportunity_id:o.id,company_id:o.company_id||null,contact_id:o.contact_id||null,assignee_id:o.owner_id||assignee,priority:'high',status:'todo',due_at:at9(now,1)}})}
 }else if(ruleId==='won-onboarding'){
  for(const o of opps){if(o.outcome!=='won'||has('opportunity_id',o.id))continue;const when=Date.parse(o.closed_at||o.created_at||'');if(when&&now-when>30*DAY)continue;
   if((data.tasks||[]).some(t=>t.opportunity_id===o.id&&String(t.title||'').startsWith(title)))continue;// done once is enough
   out.push({record:o,task:{title:short(title+' Avvia l’onboarding: '+(o.title||''),200),opportunity_id:o.id,company_id:o.company_id||null,contact_id:o.contact_id||null,assignee_id:o.owner_id||assignee,priority:'normal',status:'todo',due_at:at9(now,1)}})}
 }else if(ruleId==='ticket-stalled'){
  for(const k of data.tickets||[]){if(!['open','pending'].includes(k.status))continue;const late=k.due_at&&Date.parse(k.due_at)<now;if(k.assignee_id&&!late)continue;
   if(tasks.some(t=>String(t.title||'').startsWith(title)&&String(t.title).endsWith('#'+k.id)))continue;
   out.push({record:k,task:{title:short(title+' '+(late?'Ticket scaduto':'Ticket senza assegnatario')+': '+short(k.title,100),160)+' #'+k.id,company_id:k.company_id||null,contact_id:k.contact_id||null,assignee_id:k.assignee_id||assignee,priority:'high',status:'todo',due_at:at9(now,0)}})}
 }else if(ruleId==='stale-deal'){
  // Last touch = newest interaction on the deal or its contact; a deal younger than 14 days is not stale yet.
  const since=now-STALE_DAYS*DAY,inter=data.interactions||[];
  for(const o of opps){if(o.outcome&&o.outcome!=='open')continue;if((Date.parse(o.created_at||'')||0)>since)continue;
   if(tasks.some(t=>t.opportunity_id===o.id))continue;
   const last=Math.max(0,...inter.filter(i=>i.opportunity_id===o.id||(o.contact_id&&i.contact_id===o.contact_id)).map(i=>Date.parse(i.occurred_at)||0));if(last>since)continue;
   const days=last?Math.floor((now-last)/DAY):null;
   out.push({record:o,task:{title:short(title+' Riprendi il contatto: '+(o.title||'')+(days!=null?' (ultimo contatto '+days+' giorni fa)':' (nessun contatto registrato)'),200),opportunity_id:o.id,company_id:o.company_id||null,contact_id:o.contact_id||null,assignee_id:o.owner_id||assignee,priority:'normal',status:'todo',due_at:at9(now,1)}})}
 }else if(ruleId==='hot-contact'){
  const scorer=opts&&opts.score;if(!scorer)return {rule,items:[]};
  const busy=new Set([...tasks.map(t=>t.contact_id),...opps.filter(o=>!o.outcome||o.outcome==='open').map(o=>o.contact_id)].filter(Boolean));
  for(const c of data.contacts||[]){if(busy.has(c.id))continue;const s=scorer(c,data,now);if(!s||s.band!=='caldo')continue;
   out.push({record:c,task:{title:short(title+' Contatta: '+(c.name||''),200),contact_id:c.id,company_id:c.company_id||null,assignee_id:assignee,priority:'normal',status:'todo',due_at:at9(now,1)}})}
 }
 return {rule,items:out};
}
const api={RULES,plan,tag};
if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixCrmAutomations=api;
})(typeof globalThis!=='undefined'?globalThis:this);
