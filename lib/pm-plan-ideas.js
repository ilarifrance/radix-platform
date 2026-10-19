/* New PM project in three proposals: what the project must deliver, when it starts and ends, who works on it,
   then the Project planner agent drafts three plans (fast, balanced, careful) with phases, tasks, durations and
   dependencies. The person picks one and RADIX builds the plan with real dates; every task stays editable.
   Pure helpers run in Node for the tests; the panel uses window.RadixAgents (no direct fetch in the PM page). */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixPmPlanIdeas=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const TEAMS=[['Solo io','una sola persona fa tutto'],['Piccolo team','un team di 2-4 persone'],['Team con agenti AI','persone affiancate dagli agenti AI di RADIX (copywriter, art-director, strategist, analytics)']];
const STYLES=['Rapido','Equilibrato','Prudente'];
const MAX_TASKS=40,MAX_DAYS=120;
function prompt(a){const team=TEAMS.find(t=>t[0]===a.team)||TEAMS[0];
 return 'Prepara TRE piani di progetto diversi per lo stesso obiettivo.\n'+
  'Progetto: '+String(a.name||'').slice(0,120)+'.\nCosa deve consegnare: '+String(a.goal||'').slice(0,1500)+'.\n'+
  'Chi lavora: '+team[1]+'.\n'+(a.deadline?'Scadenza: '+a.deadline+' (inizio '+a.start+').\n':'Nessuna scadenza fissata (inizio '+a.start+').\n')+
  (a.notes?'Vincoli o fasi già decise: '+String(a.notes).slice(0,800)+'.\n':'')+
  'I tre piani: "Rapido" (poche fasi, attività in parallelo), "Equilibrato", "Prudente" (revisioni e margini). '+
  'Ogni piano: 3-6 fasi, in tutto 6-'+MAX_TASKS+' attività concrete con verbo iniziale, durata in giorni lavorativi (1-'+MAX_DAYS+'), '+
  'responsabile (ruolo, non nomi inventati), dipendenze come numeri delle attività precedenti, milestone sulle consegne. '+
  (a.team==='Team con agenti AI'?'Dove un agente AI può fare il lavoro indica "agent" con uno tra copywriter, art-director, strategist, analytics. ':'')+
  'Non inventare budget, clienti o numeri.\n'+
  'Rispondi SOLO con questo JSON: {"plans":[{"name":"Rapido","approach":"una frase","phases":[{"name":"…","tasks":[{"n":1,"title":"…","owner":"…","days":3,"after":[],"milestone":false,"agent":""}]}]}]}'}
const str=(v,n)=>String(v==null?'':v).replace(/\s+/g,' ').trim().slice(0,n);
// Three clean plans from the agent's reply: numbered tasks, dependencies only on earlier tasks of the same plan.
function parse(text){const m=/\{[\s\S]*\}/.exec(String(text||''));if(!m)return [];let d;try{d=JSON.parse(m[0])}catch(e){return []}
 return (Array.isArray(d.plans)?d.plans:[]).slice(0,3).map((p,i)=>{const seen=new Map();let k=0;
  const phases=(Array.isArray(p&&p.phases)?p.phases:[]).slice(0,30).map(ph=>({name:str(ph&&ph.name,120)||'Fase',tasks:(Array.isArray(ph&&ph.tasks)?ph.tasks:[]).map(t=>{
   if(!t||typeof t!=='object'||k>=MAX_TASKS)return null;const title=str(t.title,120);if(!title)return null;k++;const own=Number(t.n);
   const task={n:k,title,owner:str(t.owner,80)||'Da assegnare',days:Math.min(MAX_DAYS,Math.max(1,Math.round(Number(t.days))||1)),after:(Array.isArray(t.after)?t.after:[]).map(Number),milestone:t.milestone===true,agent:/^(copywriter|art-director|strategist|analytics)$/.test(t.agent)?t.agent:''};
   if(Number.isInteger(own))seen.set(own,k);return task}).filter(Boolean)})).filter(ph=>ph.tasks.length);
  phases.forEach(ph=>ph.tasks.forEach(t=>{t.after=[...new Set(t.after.map(x=>seen.get(x)).filter(x=>x&&x<t.n))]}));
  // Phase names become sub-projects: they must be unique.
  const names=new Set();phases.forEach(ph=>{let nm=ph.name,j=2;while(names.has(nm))nm=ph.name.slice(0,110)+' ('+j+++')';names.add(nm);ph.name=nm});
  return {name:str(p&&p.name,40)||STYLES[i]||'Piano '+(i+1),approach:str(p&&p.approach,300),phases}}).filter(p=>p.phases.length)}
// Calendar: working days only (Mon-Fri), from the start date.
const iso=d=>d.toISOString().slice(0,10);
function addWork(dateIso,days){const d=new Date(dateIso+'T12:00:00Z');let left=days;while(d.getUTCDay()===0||d.getUTCDay()===6)d.setUTCDate(d.getUTCDate()+1);
 while(left>1){d.setUTCDate(d.getUTCDate()+1);if(d.getUTCDay()!==0&&d.getUTCDay()!==6)left--}return iso(d)}
function nextWork(dateIso){const d=new Date(dateIso+'T12:00:00Z');do d.setUTCDate(d.getUTCDate()+1);while(d.getUTCDay()===0||d.getUTCDay()===6);return iso(d)}
// Each task starts the working day after its last dependency ends (or on the project start).
function schedule(plan,start){const ends={},out=[];plan.phases.forEach(ph=>ph.tasks.forEach(t=>{
 const from=t.after.reduce((a,x)=>ends[x]&&nextWork(ends[x])>a?nextWork(ends[x]):a,start);const s=addWork(from,1),e=addWork(s,t.days);ends[t.n]=e;out.push({...t,phase:ph.name,start:s,due:e})}));
 return {tasks:out,end:out.reduce((a,t)=>t.due>a?t.due:a,start)}}
// The PM state for the chosen plan, built with RadixPM so the usual validation applies.
function buildState(pm,plan,{name,note,start}){const state={projects:[],tasks:[],nextId:1};
 const p=pm.createProject(state,{name,note:note||('Piano «'+plan.name+'» proposto da RADIX'+(plan.approach?': '+plan.approach:'')).slice(0,1000),subprojects:plan.phases.map(ph=>ph.name)});
 const sub={};p.subprojects.forEach(s=>{sub[s.name]=s.id});const ids={};
 schedule(plan,start).tasks.forEach(t=>{const task=pm.create(state,{title:t.title,owner:t.owner,start:t.start,due:t.due,details:'',assignedAgents:t.agent?[t.agent]:[],project:p.id,subproject:sub[t.phase],dependencies:t.after.map(x=>ids[x]).filter(Boolean),approvalRequired:t.milestone,milestone:t.milestone,recurrence:'Nessuna'});
  ids[t.n]=task.id;task.history=['Creata dal piano «'+plan.name+'» proposto da RADIX.']});
 return pm.validateState(state)}

// ---- browser panel ----
function start({mount,onUse,today}){
 const doc=root.document,E=(t,x,c)=>{const n=doc.createElement(t);if(x!=null)n.textContent=x;if(c)n.className=c;return n};
 const day=today||iso(new Date());
 const open=E('button','✦ Fammi proporre 3 piani','pm-ideas-open');open.type='button';
 const panel=E('div',null,'pm-ideas');panel.hidden=true;
 const field=(label,input)=>{const l=E('label',label);l.append(input);return l};
 const name=E('input');name.maxLength=120;const goal=E('textarea');goal.maxLength=1500;goal.rows=3;goal.placeholder='Es. lanciare il nuovo sito con 10 pagine, blog e modulo contatti';
 const st=E('input');st.type='date';st.value=day;const dl=E('input');dl.type='date';
 const fs=E('fieldset');fs.append(E('legend','Chi lavora al progetto'));TEAMS.forEach(([t],i)=>{const l=E('label',null,'pm-ideas-chip'),r=E('input');r.type='radio';r.name='pm-ideas-team';r.value=t;r.checked=i===0;l.append(r,doc.createTextNode(' '+t));fs.append(l)});
 const notes=E('input');notes.maxLength=800;notes.placeholder='Facoltativo';
 const go=E('button','Proponi 3 piani','primary');go.type='button';const state=E('p','','muted');state.setAttribute('role','status');const cards=E('div',null,'pm-ideas-cards');
 const dates=E('div',null,'pm-ideas-dates');dates.append(field('Inizio',st),field('Scadenza · facoltativa',dl));
 panel.append(field('Nome del progetto',name),field('Cosa deve consegnare',goal),dates,fs,field('Vincoli o fasi già decise',notes),go,state,cards);
 mount.prepend(open,panel);
 open.onclick=()=>{panel.hidden=!panel.hidden;if(!panel.hidden)name.focus()};
 go.onclick=async()=>{const a={name:name.value.trim(),goal:goal.value.trim(),start:st.value||day,deadline:dl.value,team:(panel.querySelector('input[name="pm-ideas-team"]:checked')||{}).value,notes:notes.value.trim()};
  if(!a.name||!a.goal){state.textContent='Scrivi il nome e cosa deve consegnare il progetto.';(a.name?goal:name).focus();return}
  if(a.deadline&&a.deadline<a.start){state.textContent='La scadenza è prima dell’inizio.';return}
  if(!root.confirm('Chiedere tre piani all’AI? La chiamata consuma crediti API.'))return;
  go.disabled=true;cards.replaceChildren();state.textContent='L’AI prepara tre piani…';
  try{const r=await root.RadixAgents.reply({role:'pm-planner',messages:[{role:'user',content:prompt(a)}]});const plans=parse(r.text);if(!plans.length)throw Error('risposta senza piani leggibili, riprova');
   plans.forEach(p=>{const sc=schedule(p,a.start),c=E('article',null,'pm-ideas-card'),late=a.deadline&&sc.end>a.deadline;
    c.append(E('strong',p.name),E('p',p.approach,'muted'),E('p',p.phases.length+' fasi · '+sc.tasks.length+' attività · fine '+sc.end.split('-').reverse().join('/'),late?'pm-ideas-late':'pm-ideas-meta'));
    if(late)c.append(E('p','Finisce dopo la scadenza: accorcia le fasi dopo averlo creato, o scegli un altro piano.','pm-ideas-late'));
    const ol=E('ol',null,'pm-ideas-phases');p.phases.forEach(ph=>{const li=E('li');li.append(E('b',ph.name),E('span',' · '+ph.tasks.map(t=>t.title).join(' · ')));ol.append(li)});c.append(ol);
    const use=E('button','Usa questo piano','primary');use.type='button';
    use.onclick=async()=>{use.disabled=true;state.textContent='Creo il progetto con il piano «'+p.name+'»…';try{await onUse(p,a)}catch(err){state.textContent='Progetto non creato: '+err.message;use.disabled=false}};
    c.append(use);cards.append(c)});
   state.textContent='Scegli il piano migliore: date e attività restano modificabili.'}
  catch(err){state.textContent='Piani non disponibili: '+err.message}finally{go.disabled=false}};
 return {open,panel}}
return Object.freeze({TEAMS,STYLES,prompt,parse,schedule,addWork,buildState,start});
});
