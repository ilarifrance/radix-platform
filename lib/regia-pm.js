/* Regia RADIX · Project manager adapter (radix-pm-concept.html, area 'pm'). It reads the plan the page has open
   (window.RadixPmPage) and computes deadlines, late phases and the team's load with lib/pm-views.js (kpis, gantt,
   phases, workload). Two ops, applied only on «Sì, applica» through lib/pm-demo.js and the page's own save
   (persist: validateState, then the shared registry with its version check), each with its undo:
     phase_move   shift the dates of a phase's open activities by N days (RadixPM.reschedule, as «Ripianifica»);
     task_assign  give an open activity to another person of the plan (RadixPM.reassign: status and approval stay).
   Activities that come from the PED keep their date (the PED owns it), as in «Ripianifica i ritardi».
   UMD: registers itself with RadixRegiaCore in the browser; Node gets create(env) for the tests. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else{root.RadixRegiaPm=api;if(root.RadixRegiaCore)root.RadixRegiaCore.register('pm',api.adapter)}})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const need=(name,file)=>root[name]||(typeof require==='function'?require(file):null);
const V=()=>need('RadixPMViews','./pm-views.js');
const P=()=>need('RadixPM','./pm-demo.js');
const DAY=864e5,MAX_SHIFT=120;
const one=(v,n)=>{const s=String(v==null?'':v).replace(/\s+/g,' ').trim();return n&&s.length>n?s.slice(0,n-1)+'…':s};
const norm=s=>one(s).toLocaleLowerCase('it');
const it=d=>d?String(d).slice(8,10)+'/'+String(d).slice(5,7)+'/'+String(d).slice(0,4):'—';
const todayOf=state=>new Date(Number.isFinite(state&&state.now)?state.now:Date.now()).toISOString().slice(0,10);
const plus=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*DAY).toISOString().slice(0,10);
const tasksOf=state=>state&&state.plan&&Array.isArray(state.plan.tasks)?state.plan.tasks.filter(t=>t.project===state.projectId):[];
const projectOf=state=>state&&state.plan&&Array.isArray(state.plan.projects)?state.plan.projects.find(p=>p.id===state.projectId)||null:null;
const open=t=>t.status!=='Completato';
const movable=t=>open(t)&&!t.pedContentId;
// People of the plan: the responsible persons of its activities (the Regia never invents one).
const peopleOf=state=>[...new Set(tasksOf(state).map(t=>one(t.owner)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'it'));
function find(list,id,name,field){if(id!=null&&String(id).trim()){return list.find(x=>x.id===String(id).trim())||null}
 const n=norm(name);if(!n)return null;const hits=list.filter(x=>norm(x[field])===n);return hits.length===1?hits[0]:null}
const phaseOf=(state,op)=>{const p=projectOf(state);return p?find(p.subprojects||[],op.phaseId,op.phase,'name'):null};
const taskOf=(state,op)=>find(tasksOf(state),op.taskId,op.task,'title');

// ---- numbers ----
function numbers(state){const v=V(),tasks=tasksOf(state),now=Date.parse(todayOf(state)+'T12:00:00Z'),p=projectOf(state);
 const k=v.kpis(tasks,now),g=v.gantt(tasks,now),ph=v.phases(g,p?p.subprojects:[],tasks),w=v.workload(tasks,now,6,state&&state.capacity||3);
 return {k,g,phases:ph.groups,w,today:todayOf(state)}}
function digest(state){if(!projectOf(state))return null;const n=numbers(state);
 return {attivita:n.k.total,completate:n.k.done,inRitardo:n.k.late,puntualita:n.k.onTime==null?null:n.k.onTime+'%',daApprovare:n.k.awaitingApproval,
  fasiInRitardo:n.phases.filter(p=>p.late).map(p=>p.name),capacitaSettimanale:n.w.capacity,sovraccarichi:n.w.overloaded}}
function context(state){const p=projectOf(state);if(!p)return 'Project manager: nessun piano caricato.';
 const n=numbers(state),tasks=tasksOf(state),today=n.today,late=tasks.filter(t=>open(t)&&t.due<today).sort((a,b)=>a.due.localeCompare(b.due));
 const soon=tasks.filter(t=>open(t)&&t.due>=today&&t.due<=plus(today,14)).sort((a,b)=>a.due.localeCompare(b.due));
 const task=t=>'«'+one(t.title,60)+'» ('+one(t.owner,30)+', '+it(t.due)+(t.pedContentId?', dal PED':'')+') id '+t.id;
 const phase=g=>g.name+' (id '+g.id+'): '+it(V().fromDay(g.start))+' → '+it(V().fromDay(g.end))+', '+g.done+'/'+g.total+' completate'+(g.late?', in ritardo':'');
 const load=r=>r.owner+' picco '+r.peak+'/'+n.w.capacity+(r.peak>n.w.capacity?' (sovraccarico)':'');
 return 'Project manager · «'+one(state.name||p.name,60)+'»: '+n.k.total+' attività, '+n.k.done+' completate, '+n.k.late+' in ritardo'+(n.k.onTime!=null?', puntualità '+n.k.onTime+'%':'')+
  (n.k.nextMilestone?', prossima milestone «'+one(n.k.nextMilestone.title,50)+'» il '+it(n.k.nextMilestone.due):'')+'. Oggi '+it(today)+'.\n'+
  (late.length?'In ritardo ('+late.length+'): '+late.slice(0,8).map(task).join('; ')+'.\n':'Nessuna attività in ritardo.\n')+
  (soon.length?'Scadenze dei prossimi 14 giorni ('+soon.length+'): '+soon.slice(0,8).map(task).join('; ')+'.\n':'Nessuna scadenza nei prossimi 14 giorni.\n')+
  (n.phases.length?'Fasi: '+n.phases.map(phase).join('; ')+'.\n':'')+
  'Carico delle prossime 6 settimane (capacità '+n.w.capacity+' attività aperte a settimana): '+(n.w.rows.slice(0,8).map(load).join('; ')||'nessuna attività aperta')+'.\n'+
  'Persone del piano: '+(peopleOf(state).join(', ')||'nessuna')+'. Le attività del PED restano alla loro data.'}
function view(state){if(!projectOf(state))return null;const d=digest(state);
 return {title:'Il piano oggi',items:['In ritardo: '+d.inRitardo+' attività'+(d.fasiInRitardo.length?' · fasi: '+d.fasiInRitardo.join(', '):''),
  'Completate: '+d.completate+' su '+d.attivita+(d.puntualita?' · puntualità '+d.puntualita:''),
  d.sovraccarichi.length?'Sopra la capacità ('+d.capacitaSettimanale+' a settimana): '+d.sovraccarichi.join(', '):'Nessuno sopra la capacità di '+d.capacitaSettimanale+' attività a settimana']}}

// The changes a phase_move makes: every open, non-PED activity of the phase, due and start shifted by days.
function phaseChanges(state,op){const ph=phaseOf(state,op),days=Number(op.days);return tasksOf(state).filter(t=>t.subproject===ph.id&&movable(t))
 .map(t=>({id:t.id,title:t.title,from:t.due,due:plus(t.due,days),start:t.start?plus(t.start,days):''}))}

// ---- ops ----
const ops={
 phase_move:{copyFields:[],cost:{ai:0},
  validate(op,state){const ph=phaseOf(state,op);if(!ph)return 'Fase non trovata in questo piano'+(op.phase||op.phaseId?': «'+one(op.phase||op.phaseId,60)+'»':'')+'.';
   const days=Number(op.days);if(!Number.isInteger(days)||days===0)return 'Di quanti giorni sposto la fase? Serve un numero intero diverso da zero.';
   if(Math.abs(days)>MAX_SHIFT)return 'Spostamento troppo grande: al massimo '+MAX_SHIFT+' giorni.';
   const ch=phaseChanges(state,op);if(!ch.length)return 'La fase «'+ph.name+'» non ha attività aperte da spostare (quelle del PED restano alla loro data).';
   const past=ch.find(c=>c.due<todayOf(state));if(past)return '«'+one(past.title,50)+'» finirebbe il '+it(past.due)+', una data già passata.';return true},
  preview(op,state){const ph=phaseOf(state,op),ch=phaseChanges(state,op),d=Number(op.days);
   return 'Sposta la fase «'+ph.name+'» '+(d>0?'avanti':'indietro')+' di '+Math.abs(d)+(Math.abs(d)===1?' giorno':' giorni')+': '+ch.length+(ch.length===1?' attività':' attività')+' ('+ch.slice(0,3).map(c=>one(c.title,30)+' '+it(c.from)+' → '+it(c.due)).join('; ')+(ch.length>3?'; …':'')+')'}},
 task_assign:{copyFields:[],cost:{ai:0},
  validate(op,state){const t=taskOf(state,op);if(!t)return 'Attività non trovata in questo piano'+(op.task||op.taskId?': «'+one(op.task||op.taskId,60)+'»':'')+'.';
   if(!open(t))return '«'+one(t.title,60)+'» è già completata.';const who=one(op.owner);if(!who)return 'A chi la assegno? Manca il responsabile.';
   if(!peopleOf(state).includes(who))return '«'+one(who,40)+'» non è tra le persone di questo piano: aggiungila da «Modifica attività».';
   if(who===one(t.owner))return '«'+one(t.title,60)+'» è già di '+who+'.';return true},
  preview(op,state){const t=taskOf(state,op);return 'Riassegna «'+one(t.title,70)+'» ('+it(t.due)+'): '+one(t.owner,40)+' → '+one(op.owner,40)}}
};
// Whole proposal: one change of each kind per activity, and the ops carry the resolved ids.
function validate(proposal,state){const seen=new Set(),out=[],rejected=[];
 for(const op of proposal.ops){let keys,x;
  if(op.op==='phase_move'){const ph=phaseOf(state,op);x={phaseId:ph.id,days:Number(op.days)};keys=phaseChanges(state,op).map(c=>'date:'+c.id)}
  else{const t=taskOf(state,op);x={taskId:t.id,owner:one(op.owner)};keys=['owner:'+t.id]}
  if(keys.some(k=>seen.has(k))){rejected.push({op,reason:'Una sola modifica per volta sulle stesse attività.'});continue}
  keys.forEach(k=>seen.add(k));out.push(Object.assign({},op,x))}
 return {ops:out,rejected}}

// env: {page} for the tests; the browser uses window.RadixPmPage.
function create(env){const E=env||{};
 const page=()=>E.page!==undefined?E.page:root.RadixPmPage||null;
 function read(){const p=page();if(!p||!p.state())return {plan:null};
  return {plan:p.state(),projectId:p.projectId(),key:p.projectKey(),name:p.projectName(),capacity:p.capacity(),now:E.now||Date.now()}}
 // All changes in memory (each op checked by RadixPM before anything moves), one save; a failed save puts the plan
 // back as it was.
 async function apply(state,list){const p=page();if(!p)throw new Error('Il piano non è aperto.');if(p.busy())throw new Error('Attendi la fine del lavoro in corso.');
  const plan=p.state(),pm=P(),before=new Map();const remember=t=>{if(!before.has(t.id))before.set(t.id,{due:t.due,start:t.start||'',owner:t.owner,history:t.history.length})};
  const restore=()=>{for(const [id,b] of before){const t=plan.tasks.find(x=>x.id===id);if(!t)continue;t.due=b.due;t.start=b.start;t.owner=b.owner;t.history.length=b.history}};
  try{for(const op of list){if(op.op==='phase_move'){const ch=phaseChanges(state,op);ch.forEach(c=>remember(plan.tasks.find(t=>t.id===c.id)));pm.reschedule(plan,ch.map(c=>({id:c.id,due:c.due,start:c.start})))}
    else{const t=plan.tasks.find(x=>x.id===op.taskId);if(t)remember(t);pm.reassign(plan,op.taskId,op.owner)}}}
  catch(e){restore();throw e}
  const saved=await p.persist();if(saved===false){restore();p.render();throw new Error('Salvataggio non riuscito: il piano è rimasto com’era.')}
  p.render();
  return {state:read(),undo:async()=>{const q=page();if(q.busy())throw new Error('Attendi la fine del lavoro in corso.');const cur=q.state(),dates=[],owners=[];
   for(const [id,b] of before){const t=cur.tasks.find(x=>x.id===id);if(!t)continue;if(t.due!==b.due||(t.start||'')!==b.start)dates.push({id,due:b.due,start:b.start});if(t.owner!==b.owner)owners.push([id,b.owner])}
   if(dates.length)pm.reschedule(cur,dates);for(const [id,o] of owners)pm.reassign(cur,id,o);
   const ok=await q.persist();q.render();if(ok===false)throw new Error('salvataggio non riuscito');return read()}}}
 // The fixed answer of the fake AI (tests, screenshots): the first late phase a week later, and the busiest person's
 // last open activity to the least busy one.
 function sample(state){const n=numbers(state),out=[],late=n.phases.find(g=>g.late);
  if(late){const first=tasksOf(state).filter(t=>t.subproject===late.id&&movable(t)).map(t=>t.due).sort()[0];
   const behind=first?Math.round((Date.parse(n.today+'T12:00:00Z')-Date.parse(first+'T12:00:00Z'))/DAY):0;out.push({op:'phase_move',phaseId:late.id,days:Math.max(7,behind+1)})}
  const over=n.w.rows.find(r=>r.peak>n.w.capacity),people=peopleOf(state);
  if(over){const t=tasksOf(state).filter(x=>movable(x)&&one(x.owner)===over.owner).sort((a,b)=>b.due.localeCompare(a.due))[0];
   const free=people.filter(x=>x!==over.owner).map(x=>[x,(n.w.rows.find(r=>r.owner===x)||{total:0}).total]).sort((a,b)=>a[1]-b[1])[0];
   if(t&&free)out.push({op:'task_assign',taskId:t.id,owner:free[0]})}
  out.push({op:'send_reminder',to:'team',message:'Siete in ritardo'});
  return {area:'pm',summary:n.k.late+' attività in ritardo'+(n.w.overloaded.length?', sopra la capacità: '+n.w.overloaded.join(', '):'')+'.',ops:out}}
 const shortcuts=[
  {label:'Cosa è in ritardo?',prompt:'Cosa è in ritardo in questo progetto? Dimmi le fasi e le attività in ritardo, l’effetto sulle scadenze e proponi gli spostamenti.'},
  {label:'Chi è sovraccarico?',prompt:'Chi è sovraccarico nelle prossime settimane rispetto alla capacità? Proponi le riassegnazioni alle persone del piano.'}];
 return {title:'Project manager',pages:['pm'],contextMax:3800,shortcuts,read,context,digest,view,ops,validate,apply,sample,projectId:state=>state&&state.key||''}}

const adapter=create();
return Object.freeze({adapter,create,peopleOf,phaseChanges});
});
