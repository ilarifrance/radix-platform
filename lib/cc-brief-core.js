'use strict';
/* Command Center · «Oggi»: il brief del giorno, senza AI. Logica pura (UMD, niente DOM né rete):
   dai dati che l'utente può già leggere (attività e trattative del CRM, percorso dei progetti, servizi collegati)
   ricava una riga per area con il numero, una frase e il link alla pagina giusta. Solo lettura: non propone e
   non cambia nulla. La regola «trattativa ferma» è quella del CRM (sales/crm-automations-core.js, 14 giorni). */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixCcBrief=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
const DAY=864e5,STALE_DAYS=14;
const list=v=>Array.isArray(v)?v:[];
const ms=v=>{const t=Date.parse(v||'');return Number.isFinite(t)?t:NaN};
const n=(k,one,many)=>k+' '+(k===1?one:many);
// Attività aperte con scadenza entro la fine di oggi: in ritardo (prima di adesso) e ancora da fare oggi.
function agenda(tasks,now,dayEnd){const out={overdue:0,today:0};
 for(const t of list(tasks)){if(!t||t.status==='done')continue;const due=ms(t.due_at);if(!Number.isFinite(due)||due>=dayEnd)continue;if(due<now)out.overdue++;else out.today++}
 return out}
// Trattative aperte, nate da più di 14 giorni, senza attività aperte e senza interazioni negli ultimi 14 giorni.
function staleDeals(sales,now){const since=now-STALE_DAYS*DAY,tasks=list(sales.tasks).filter(t=>t&&t.status!=='done'),inter=list(sales.interactions);
 return list(sales.opportunities).filter(o=>{if(!o||(o.outcome&&o.outcome!=='open'))return false;if((ms(o.created_at)||0)>since)return false;
  if(tasks.some(t=>t.opportunity_id===o.id))return false;
  const last=Math.max(0,...inter.filter(i=>i.opportunity_id===o.id||(o.contact_id&&i.contact_id===o.contact_id)).map(i=>ms(i.occurred_at)||0));return last<=since})}
function salesLine(sales,now,dayEnd){
 if(!sales)return null;
 if(sales.error)return {area:'sales',label:'Vendite',tone:'muted',count:null,text:'Dati del CRM non leggibili adesso ('+sales.error+').',href:'/radix-sales.html#today'};
 const a=agenda(sales.tasks,now,dayEnd),stale=staleDeals(sales,now).length,parts=[];
 if(a.overdue)parts.push(n(a.overdue,'attività in ritardo','attività in ritardo'));
 if(a.today)parts.push(n(a.today,'attività da fare oggi','attività da fare oggi'));
 if(stale)parts.push(n(stale,'trattativa ferma da 14 giorni','trattative ferme da 14 giorni'));
 const count=a.overdue+a.today+stale;
 return {area:'sales',label:'Vendite',tone:a.overdue?'late':count?'todo':'ok',count,partial:!!sales.partial,
  text:(parts.length?parts.join(', ')+'.':'Niente in scadenza oggi e nessuna trattativa ferma.')+(sales.partial?' Elenco parziale: contati solo i primi record.':''),
  href:a.overdue||a.today?'/radix-sales.html#today':stale?'/sales-pipeline-premium.html':'/radix-sales.html#today'}}
// Progetti: passi in attesa di una persona (da approvare) e progetti in corso, dal percorso (/api/workspace journey=1).
function lateTasks(plans,today){const out=[];
 for(const p of list(plans)){const k=list(p&&p.tasks).filter(t=>t&&t.status!=='Completato'&&/^\d{4}-\d{2}-\d{2}/.test(String(t.due||''))&&String(t.due).slice(0,10)<today).length;if(k)out.push({id:p.id,name:p.name,late:k})}
 return out.sort((a,b)=>b.late-a.late)}
// pm (facoltativo): {plans:[{id,name,tasks}]} dai piani del Project manager; today = 'AAAA-MM-GG' locale.
function projectsLine(projects,pm,today){
 if(!projects)return null;
 if(projects.error)return {area:'projects',label:'Progetti',tone:'muted',count:null,text:'Progetti non leggibili adesso ('+projects.error+').',href:'/control-center-v2.html#projects'};
 const items=list(projects.items).filter(p=>p&&p.status!=='archived'&&p.journey&&Array.isArray(p.journey.steps));
 let waiting=0,first=null,running=0;
 for(const p of items){const w=p.journey.steps.filter(s=>s&&s.state==='waiting');waiting+=w.length;if(w.length&&!first)first={project:p.name,step:w[0].label};if(p.journey.steps.some(s=>s&&s.state==='active'))running++}
 const lateBy=pm&&today?lateTasks(pm.plans,today):[],late=lateBy.reduce((s,p)=>s+p.late,0);
 const parts=[];if(late)parts.push(n(late,'attività in ritardo','attività in ritardo')+' (soprattutto «'+lateBy[0].name+'»)');
 if(waiting)parts.push(n(waiting,'passo da approvare','passi da approvare')+(first?' (parti da «'+first.project+' · '+first.step+'»)':''));
 if(running)parts.push(n(running,'progetto in corso','progetti in corso'));
 return {area:'projects',label:'Progetti',tone:late?'late':waiting?'todo':'ok',count:late+waiting,partial:!!(pm&&pm.partial),
  text:(parts.length?parts.join(', ')+'.':'Nessun passo in attesa di te.')+(pm&&pm.partial?' Piani guardati solo nei primi progetti.':''),
  href:late?'/radix-pm-concept.html?project='+encodeURIComponent(lateBy[0].id):'/control-center-v2.html#approvals'}}
// Marketing: pubblicazioni programmate su Buffer che escono entro oggi e invii falliti, per progetto
// (/api/workspace?resource=publications). Di ogni contenuto e canale vale solo la riga più recente.
function marketingLine(marketing,now,dayEnd){
 if(!marketing)return null;
 const ped=id=>'/project-editorial.html'+(id?'?project='+encodeURIComponent(id)+'#ped':'');
 if(marketing.error)return {area:'marketing',label:'Marketing',tone:'muted',count:null,text:'Pubblicazioni non leggibili adesso ('+marketing.error+').',href:ped()};
 const seen=new Set(),rows=list(marketing.publications).slice().sort((a,b)=>(ms(b&&b.updated_at)||0)-(ms(a&&a.updated_at)||0)).filter(r=>{if(!r)return false;const k=[r.project_id,r.content_id,r.channel_id].join('|');if(seen.has(k))return false;seen.add(k);return true});
 const when=r=>ms(r.due_at||r.scheduled_at),out=rows.filter(r=>r.status==='queued'&&when(r)>=now&&when(r)<dayEnd),failed=rows.filter(r=>r.status==='failed');
 const parts=[];if(failed.length)parts.push(n(failed.length,'pubblicazione non riuscita','pubblicazioni non riuscite'));
 if(out.length)parts.push(n(out.length,'post in uscita oggi','post in uscita oggi'));
 const first=failed[0]||out[0];
 return {area:'marketing',label:'Marketing',tone:failed.length?'late':out.length?'todo':'ok',count:failed.length+out.length,partial:!!marketing.partial,
  text:(parts.length?parts.join(', ')+'.':'Nessun post in uscita oggi.')+(marketing.partial?' Guardati solo i primi progetti.':''),href:ped(first&&first.project_id)}}
// Sistema: servizi esterni senza chiave su questo ambiente (/api/integrations/status). Mai i valori, solo i nomi.
function systemLine(integrations){
 if(!integrations)return null;
 if(integrations.error)return {area:'system',label:'Sistema',tone:'muted',count:null,text:'Stato dei servizi non leggibile adesso ('+integrations.error+').',href:'/control-center-v2.html#integrations'};
 const off=list(integrations.items).filter(s=>s&&s.configured===false).map(s=>String(s.label||s.id||'').trim()).filter(Boolean);
 return {area:'system',label:'Sistema',tone:off.length?'todo':'ok',count:off.length,
  text:off.length?n(off.length,'servizio non collegato','servizi non collegati')+': '+off.slice(0,4).join(', ')+(off.length>4?' e altri '+(off.length-4):'')+'.':'Tutti i servizi sono collegati.',href:'/control-center-v2.html#integrations'}}
/* input: {now, dayEnd, sales:{tasks,opportunities,interactions,partial}|{error}, marketing:{publications,partial}|{error}, pm:{plans,partial}, today:'AAAA-MM-GG', projects:{items}|{error}, integrations:{items}|{error}}.
   Un'area non letta (null/undefined) non compare. → {lines, total, late}. */
function brief(input){const i=input||{},now=Number(i.now)||Date.now(),dayEnd=Number(i.dayEnd)||now+DAY;
 const lines=[salesLine(i.sales,now,dayEnd),marketingLine(i.marketing,now,dayEnd),projectsLine(i.projects,i.pm,i.today),systemLine(i.integrations)].filter(Boolean);
 return {lines,total:lines.reduce((s,l)=>s+(l.count||0),0),late:lines.some(l=>l.tone==='late')}}
// Una frase per il titolo del pannello.
function headline(b){if(!b||!b.lines.length)return 'Nessun dato da mostrare.';if(!b.total)return 'Niente che ti aspetta, per ora.';return n(b.total,'cosa ti aspetta','cose ti aspettano')+' oggi.'}
return Object.freeze({STALE_DAYS,agenda,staleDeals,lateTasks,salesLine,marketingLine,projectsLine,systemLine,brief,headline});
});
