/* «Progetto da brief o da meeting» (radix-pm-concept.html): a brief typed by the person, or a meeting recorded and
   transcribed in RADIX (registry module 'meetings', items from RadixMeeting.record()), goes to the Project planner
   agent once, after a RadixConfirm. The reply becomes phases and tasks, each one for the person, for another person
   named in the brief, for an AI agent of RADIX (it works the task with «Fai svolgere», the result goes to review) or
   for a RADIX tool (PED, CRM, Lead Intelligence…, opened from the task). The proposal stays editable; «Crea» builds
   the plan with RadixPM. On the project, «Chi lavora» shows the progress of each executor and the next actions.
   Pure helpers run in Node for the tests; the panel uses window.RadixAgents and window.RadixWorkspace. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixPmBrief=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const req=n=>{try{return typeof require==='function'?require(n):null}catch(e){return null}};
const ideas=()=>root.RadixPmPlanIdeas||req('./pm-plan-ideas.js');
const work=()=>root.RadixPMWork||req('./pm-work.js');
const MAX_TASKS=40,MAX_DAYS=60,MAX_BRIEF=24000;
// The RADIX tools a task can be handed to: id, name, page ({p} = registry project id), what it is for.
const TOOLS=Object.freeze([
 ['ped','Piano editoriale','/project-editorial.html?project={p}','contenuti social, calendario editoriale e pubblicazione','Editorial plan'],
 ['agency','Marketing Agency','/agency/crea.html','sito, SEO, strategia di marca, campagne, immagini e video','Marketing Agency'],
 ['avatar','Studio Avatar','/agency/avatar.html','video con avatar parlante','Avatar Studio'],
 ['crm','CRM','/radix-sales.html','contatti, aziende, opportunità e follow-up','CRM'],
 ['leads','Lead Intelligence','/lead-intelligence.html','trovare aziende e contatti da contattare','Lead Intelligence'],
 ['campaigns','Campagne email','/sales-growth-campaigns.html','email a liste di contatti, con coda di invio','Email campaigns'],
 ['meeting','Meeting','/meeting.html','registrare e verbalizzare riunioni e telefonate','Meeting'],
 ['legal','Legal','/legal/index.html','contratti, privacy, pareri legali','Legal'],
 ['accounting','Accounting','/accounting/index.html','contabilità e controllo di gestione','Accounting']
].map(([id,name,href,use,nameEn])=>Object.freeze({id,name,href,use,nameEn})));
const tool=id=>TOOLS.find(t=>t.id===id)||null;
const toolHref=(id,projectKey)=>{const t=tool(id);return t?t.href.replace('{p}',encodeURIComponent(projectKey||'')):''};
// Specialist agents only: hubs and the post pipeline do not work a single task.
function agentsOf(list){return (list||[]).filter(a=>a&&a.id&&!a.hub&&!a.pipeline).map(a=>({id:a.id,name:a.name,blurb:a.blurb||''}))}
const str=(v,n)=>String(v==null?'':v).replace(/\s+/g,' ').trim().slice(0,n);
const long=(v,n)=>String(v==null?'':v).replace(/[ \t]+/g,' ').trim().slice(0,n);

// The text the planner reads for a meeting: the transcript when it was kept, else what the analysis left.
function meetingText(m,titles){if(!m)return '';const parts=[];
 if(m.summary)parts.push('Sintesi: '+m.summary);
 if((m.decisions||[]).length)parts.push('Decisioni:\n'+m.decisions.map(d=>'- '+d).join('\n'));
 if((m.questions||[]).length)parts.push('Domande aperte:\n'+m.questions.map(d=>'- '+d).join('\n'));
 const made=[...new Set([...(m.created||[]),...(m.updated||[])])].map(id=>titles&&titles.get(id)).filter(Boolean).map(x=>str(x,120));
 if(made.length)parts.push('Già nel Project Manager dal meeting (non ripeterle):\n'+made.map(d=>'- '+d).join('\n'));
 if(m.transcript)parts.push('Trascrizione:\n'+m.transcript);
 return parts.join('\n\n').slice(0,MAX_BRIEF)}
// Meetings of every archive, newest first: {projectId, projectName, id, title, date, seconds, text}. archive.tasks (the
// project's PM tasks) names the tasks the Meeting page already created or updated, so the planner does not repeat them.
function meetingsFrom(archives){const out=[];for(const a of archives||[]){const titles=new Map((a&&Array.isArray(a.tasks)?a.tasks:[]).map(t=>[t.id,t.title]));for(const m of (a&&a.data&&Array.isArray(a.data.items)?a.data.items:[])){const text=meetingText(m,titles);if(text)out.push({projectId:a.projectId,projectName:a.projectName||'',id:m.id,title:m.title||'Meeting',date:m.date||'',seconds:m.seconds||0,text})}}
 return out.sort((x,y)=>String(y.date).localeCompare(String(x.date)))}

function prompt({text,source,title,name,start,deadline,me,people,agents,tools,en}){
 const ag=agentsOf(agents),tl=tools||TOOLS;
 return 'Analizza questo '+(source==='meeting'?'meeting (trascrizione di una registrazione'+(title?' «'+str(title,120)+'»':'')+')':'brief di progetto')+' e scomponilo in un piano eseguibile dentro RADIX.\n'+
  (name?'Nome del progetto: '+str(name,120)+'.\n':'')+'Inizio: '+start+'.'+(deadline?' Scadenza: '+deadline+'.':' Nessuna scadenza indicata.')+'\n'+
  'Chi usa RADIX: '+(str(me,80)||'il titolare')+' ("io").'+((people||[]).length?' Persone già nei progetti: '+people.slice(0,20).map(p=>str(p,60)).join(', ')+'.':'')+'\n\n'+
  'Ogni attività va a UNO tra:\n'+
  '- "io": decisioni, approvazioni, telefonate, incontri, materiali che ha solo lui.\n'+
  '- "persona": solo se il testo nomina chi la fa (metti il nome in "person").\n'+
  '- "agente": quando un agente AI di RADIX può produrre il risultato (testi, piani, analisi, bozze di contratto); metti l’id in "agent". Agenti:\n'+
  ag.map(a=>'  '+a.id+' = '+a.name+(a.blurb?' ('+a.blurb+')':'')).join('\n')+'\n'+
  '- "strumento": quando il lavoro si fa in una pagina di RADIX; metti l’id in "tool". Strumenti:\n'+
  tl.map(t=>'  '+t.id+' = '+t.name+' ('+t.use+')').join('\n')+'\n\n'+
  'Regole: 2-6 fasi, in tutto 4-'+MAX_TASKS+' attività concrete con verbo iniziale, durata in giorni lavorativi (1-'+MAX_DAYS+'), '+
  'dipendenze come numeri delle attività precedenti, milestone sulle consegne. Il lavoro di un agente va sempre rivisto da "io": non aggiungere attività di revisione separate. '+
  'Usa solo fatti presenti nel testo: niente budget, clienti, nomi o numeri inventati; quello che manca va in "questions".\n'+
  (en?'Scrivi nome, titoli, dettagli e domande in inglese (British English). ':'')+'Rispondi SOLO con questo JSON: {"name":"…","goal":"una frase","summary":"3-5 frasi","questions":["…"],"phases":[{"name":"…","tasks":[{"n":1,"title":"…","details":"cosa consegnare","who":"io","person":"","agent":"","tool":"","days":2,"after":[],"milestone":false}]}]}\n\n'+
  'TESTO:\n'+String(text||'').slice(0,MAX_BRIEF)}

const WHO={io:'me',me:'me',persona:'person',person:'person',agente:'agent',agent:'agent',strumento:'tool',tool:'tool'};
// The planner's reply as {name, goal, summary, questions, phases:[{name, tasks:[{n,title,details,who,person,agent,tool,days,after,milestone}]}]}.
// An unknown agent or tool, or a person without a name, goes back to "me": nothing is assigned to someone who does not exist.
function parse(text,{agents}={}){const m=/\{[\s\S]*\}/.exec(String(text||''));if(!m)return null;let d;try{d=JSON.parse(m[0])}catch(e){return null}
 const ids=new Set(agentsOf(agents).map(a=>a.id)),seen=new Map();let k=0;
 const phases=(Array.isArray(d.phases)?d.phases:[]).slice(0,12).map(ph=>({name:str(ph&&ph.name,120)||'Fase',tasks:(Array.isArray(ph&&ph.tasks)?ph.tasks:[]).map(t=>{
  if(!t||typeof t!=='object'||k>=MAX_TASKS)return null;const title=str(t.title,120);if(!title)return null;k++;
  let who=WHO[str(t.who,20).toLowerCase()]||'me';const agent=str(t.agent,60),tl=str(t.tool,30),person=str(t.person,80);
  if(who==='agent'&&!ids.has(agent))who='me';if(who==='tool'&&!tool(tl))who='me';if(who==='person'&&!person)who='me';
  const out={n:k,title,details:long(t.details,1500),who,person:who==='person'?person:'',agent:who==='agent'?agent:'',tool:who==='tool'?tl:'',
   days:Math.min(MAX_DAYS,Math.max(1,Math.round(Number(t.days))||1)),after:(Array.isArray(t.after)?t.after:[]).map(Number),milestone:t.milestone===true,include:true};
  const own=Number(t.n);if(Number.isInteger(own))seen.set(own,k);return out}).filter(Boolean)})).filter(ph=>ph.tasks.length);
 phases.forEach(ph=>ph.tasks.forEach(t=>{t.after=[...new Set(t.after.map(x=>seen.get(x)).filter(x=>x&&x<t.n))]}));
 const names=new Set();phases.forEach(ph=>{let nm=ph.name,j=2;while(names.has(nm))nm=ph.name.slice(0,110)+' ('+j+++')';names.add(nm);ph.name=nm});
 if(!phases.length)return null;
 return {name:str(d.name,120),goal:str(d.goal,300),summary:long(d.summary,1500),questions:(Array.isArray(d.questions)?d.questions:[]).map(q=>str(q,300)).filter(Boolean).slice(0,12),phases}}

// How many tasks go to whom: {me, person, agent, tool}, over the tasks still included.
function split(proposal){const c={me:0,person:0,agent:0,tool:0};for(const ph of proposal.phases)for(const t of ph.tasks)if(t.include!==false)c[t.who]++;return c}

// The PM state for the proposal, built with RadixPM so the usual validation applies. Tasks left out are dropped,
// and so are their places in the dependencies (a task that depended on one left out waits for that one's own
// prerequisites). Open questions become the person's first task.
function buildState(pm,proposal,{name,start,me,source,agentLabel,en}={}){
 const I=ideas(),label=agentLabel||(id=>id),owner=me||'Io';
 const kept=new Map();proposal.phases.forEach(ph=>ph.tasks.forEach(t=>kept.set(t.n,t)));
 const deps=n=>{const t=kept.get(n);if(!t)return [];return t.include!==false?[n]:t.after.flatMap(deps)};
 const phases=proposal.phases.map(ph=>({name:ph.name,tasks:ph.tasks.filter(t=>t.include!==false).map(t=>({...t,after:[...new Set(t.after.flatMap(deps))]}))})).filter(ph=>ph.tasks.length);
 if(!phases.length)throw new Error('Tieni almeno un’attività.');
 const state={projects:[],tasks:[],nextId:1};
 const note=[proposal.goal,proposal.summary].filter(Boolean).join(' ')||(en?'Plan drawn from '+(source==='meeting'?'a meeting':'a brief')+'.':'Piano ricavato '+(source==='meeting'?'da un meeting':'da un brief')+'.');
 const p=pm.createProject(state,{name:str(name||proposal.name,120)||'Nuovo progetto',note:note.slice(0,1000),subprojects:phases.map(ph=>ph.name)});
 const sub={};p.subprojects.forEach(s=>{sub[s.name]=s.id});const ids={};
 const origin=en?'Created by the Project planner from the '+(source==='meeting'?'meeting':'brief')+'.':'Creata dall’analisi '+(source==='meeting'?'del meeting':'del brief')+' con il Project planner.';
 if(proposal.questions.length){const q=pm.create(state,{title:en?'Clarify the open points of the project':'Chiarire i punti aperti del progetto',owner,start,due:I.addWork(start,1),details:(en?'To clarify before going ahead:':'Da chiarire prima di andare avanti:')+'\n'+proposal.questions.map(x=>'- '+x).join('\n'),assignedAgents:[],project:p.id,subproject:sub[phases[0].name],dependencies:[],approvalRequired:false,milestone:false,recurrence:'Nessuna',priority:'Alta'});q.history=[origin]}
 I.schedule({phases},start).tasks.forEach(t=>{
  const tl=tool(t.tool),who=t.who;
  const input={title:t.title,owner:who==='person'?t.person:who==='agent'?str((en?'Agent · ':'Agente · ')+label(t.agent),80):who==='tool'?(en?tl.nameEn:tl.name)+' · RADIX':owner,
   start:t.start,due:t.due,details:(t.details+(tl?(en?'\n\nDone in RADIX: '+tl.nameEn:'\n\nSi fa in RADIX: '+tl.name)+'.':'')).trim(),assignedAgents:who==='agent'?[t.agent]:[],project:p.id,subproject:sub[t.phase],
   dependencies:t.after.map(x=>ids[x]).filter(Boolean),approvalRequired:who==='agent'||t.milestone,milestone:t.milestone,recurrence:'Nessuna'};
  const task=pm.create(state,input);ids[t.n]=task.id;if(tl)task.tool=tl.id;task.history=[origin]});
 return pm.validateState(state)}

// Who is working on the project and what is next. Groups: the person ("me"), AI agents, RADIX tools, other people.
// next: what to do now, most useful first: agent results to review, agent work ready to start, the person's late and
// due-soon tasks, tool tasks ready to open.
function crew(tasks,{me,today,all}={}){
 const W=work(),day=today||new Date().toISOString().slice(0,10),byId=new Map((all||tasks||[]).map(t=>[t.id,t]));
 const ready=t=>['Da fare','In corso'].includes(t.status)&&(t.dependencies||[]).every(id=>(byId.get(id)||{}).status==='Completato');
 const kind=t=>t.tool&&tool(t.tool)?'tool':(t.assignedAgents||[]).length?'agent':W.isMe(t.owner,me)?'me':'person';
 const G={me:{key:'me',label:'Tu'},agent:{key:'agent',label:'Agenti RADIX'},tool:{key:'tool',label:'Strumenti RADIX'},person:{key:'person',label:'Altre persone'}};
 for(const g of Object.values(G))Object.assign(g,{total:0,done:0,review:0,late:0,ready:0,names:new Set()});
 const next=[];
 for(const t of tasks||[]){const g=G[kind(t)];g.total++;g.names.add(g.key==='tool'?tool(t.tool).name:g.key==='agent'?t.assignedAgents[0]:t.owner);
  if(t.status==='Completato'){g.done++;continue}
  if(t.status==='In revisione')g.review++;
  if(t.due&&t.due<day)g.late++;
  if(ready(t))g.ready++;
  if(g.key==='agent'&&t.status==='In revisione'&&(t.agentWork||[]).length)next.push({kind:'review',rank:0,task:t});
  else if(g.key==='agent'&&ready(t)&&(t.assignedAgents||[]).some(a=>!(t.agentWork||[]).some(w=>w.agent===a)))next.push({kind:'agent',rank:1,task:t});
  else if(g.key==='me'&&ready(t)&&t.due&&W.days(day,t.due)<=3)next.push({kind:'mine',rank:t.due<day?2:3,task:t});
  else if(g.key==='tool'&&ready(t))next.push({kind:'tool',rank:4,task:t});}
 next.sort((a,b)=>a.rank-b.rank||String(a.task.due).localeCompare(String(b.task.due)));
 const groups=Object.values(G).filter(g=>g.total).map(g=>({key:g.key,label:g.label,total:g.total,done:g.done,review:g.review,late:g.late,ready:g.ready,pct:Math.round(g.done/g.total*100),names:[...g.names].filter(Boolean)}));
 return {groups,next:next.slice(0,6).map(({kind,task})=>({kind,task}))}}

// ---- browser ----
const doc=root.document;
const P=()=>root.RadixPmPage;
function el(tag,text,cls,attrs){const n=doc.createElement(tag);if(text!=null&&text!=='')n.textContent=text;if(cls)n.className=cls;if(attrs)for(const [k,v] of Object.entries(attrs))if(v!=null)n.setAttribute(k,v);return n}
function btn(text,cls,on){const b=el('button',text,cls);b.type='button';if(on)b.onclick=on;return b}
const isoToday=()=>new Date().toISOString().slice(0,10);
const itDate=d=>d?d.split('-').reverse().join('/'):'';
const rt=()=>root.RadixAgents;
const EN=()=>!!(root.RadixI18n&&root.RadixI18n.en);
const agentList=()=>agentsOf(rt()&&rt().AGENTS);
const agentName=id=>{const r=rt();return r&&r.agent(id)?r.label(id):id};

let dialog=null,proposal=null,source='brief',meetings=null,picked=null;
function build(){
 dialog=el('dialog',null,'pm-brief',{id:'brief-dialog','aria-labelledby':'brief-title'});
 const head=el('div',null,'row');head.append(el('h2','Progetto da brief o da meeting',null,{id:'brief-title'}),btn('Chiudi',null,()=>dialog.close()));
 const intro=el('p','Scrivi cosa vuoi ottenere o scegli un meeting registrato: il Project planner lo scompone in fasi e attività, alcune per te, altre per gli agenti e gli strumenti di RADIX. Poi qui vedi chi sta lavorando e cosa manca.','muted');
 const srcRow=el('div',null,'pm-brief-src',{role:'tablist','aria-label':'Da dove parte il progetto'});
 const sBrief=btn('✎ Scrivo il brief','pm-brief-tab',()=>setSource('brief')),sMeet=btn('🎙 Da un meeting registrato','pm-brief-tab',()=>setSource('meeting'));
 sBrief.dataset.src='brief';sMeet.dataset.src='meeting';[sBrief,sMeet].forEach(b=>b.setAttribute('role','tab'));srcRow.append(sBrief,sMeet);
 const text=el('textarea',null,null,{id:'brief-text',rows:'7',maxlength:String(MAX_BRIEF),placeholder:'Es. Lanciare il corso online «Vendere su LinkedIn» entro fine gennaio: pagina di vendita, 3 video, campagna email ai contatti del CRM, 12 post. I video li registro io; il contratto con la piattaforma va rivisto.'});
 const textL=el('label','Il progetto, con parole tue',null,{id:'brief-text-label'});textL.append(text);
 const meetBox=el('div',null,'pm-brief-meetings',{id:'brief-meetings'});meetBox.hidden=true;
 const name=el('input',null,null,{id:'brief-name',maxlength:'120',placeholder:'Facoltativo: lo propone l’AI'});const nameL=el('label','Nome del progetto');nameL.append(name);
 const st=el('input',null,null,{id:'brief-start',type:'date'});st.value=isoToday();const stL=el('label','Inizio');stL.append(st);
 const dl=el('input',null,null,{id:'brief-deadline',type:'date'});const dlL=el('label','Scadenza · facoltativa');dlL.append(dl);
 const grid=el('div',null,'pm-brief-grid');grid.append(nameL,stL,dlL);
 const go=el('button','✦ Analizza e scomponi','primary',{id:'brief-go',type:'button'});go.onclick=analyse;
 const status=el('p','','muted',{id:'brief-status',role:'status','aria-live':'polite'});
 const out=el('div',null,'pm-brief-out',{id:'brief-out'});
 dialog.append(head,intro,srcRow,textL,meetBox,grid,go,status,out);doc.body.append(dialog);
 setSource('brief')}
function say(t,warn){const s=doc.getElementById('brief-status');s.textContent=t;s.classList.toggle('warn',!!warn)}
function setSource(s){source=s;dialog.querySelectorAll('.pm-brief-tab').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.src===s)));
 doc.getElementById('brief-text-label').hidden=s!=='brief';doc.getElementById('brief-meetings').hidden=s!=='meeting';if(s==='meeting')loadMeetings()}
async function loadMeetings(wanted){const box=doc.getElementById('brief-meetings');const ws=root.RadixWorkspace,p=P();
 if(!meetings){box.replaceChildren(el('p','Cerco i meeting salvati nei progetti…','muted'));
  const reg=(p&&p.registry&&p.registry())||[];const archives=[];
  await Promise.all(reg.slice(0,40).map(async r=>{try{const d=await ws.documents.load(r.id,'meetings');if(!d||!d.data||!(d.data.items||[]).length)return;let tasks=[];
   if(d.data.items.some(m=>(m.created||[]).length||(m.updated||[]).length)){try{const pmDoc=await ws.documents.load(r.id,'pm');tasks=pmDoc&&pmDoc.data&&pmDoc.data.tasks||[]}catch(e){}}
   archives.push({projectId:r.id,projectName:r.name,data:d.data,tasks})}catch(e){}}));
  meetings=meetingsFrom(archives)}
 box.replaceChildren();
 if(!meetings.length){const a=el('a','Apri Meeting ↗');a.href='/meeting.html';box.append(el('p','Nessun meeting salvato ancora: registralo in Meeting, poi torna qui.','muted'),a);return}
 if(wanted)picked=meetings.find(m=>m.projectId===wanted.from&&m.id===wanted.meeting)||picked;
 const list=el('div',null,'pm-brief-mlist',{role:'radiogroup','aria-label':'Meeting da analizzare'});
 meetings.slice(0,30).forEach((m,i)=>{const l=el('label',null,'pm-brief-meeting'),r=el('input',null,null,{type:'radio',name:'brief-meeting'});r.checked=picked?picked===m:i===0;if(r.checked)picked=m;r.onchange=()=>{picked=m;preview()};
  const t=el('span');t.append(el('b',m.title),el('small',[itDate(m.date),m.projectName].filter(Boolean).join(' · ')));l.append(r,t);list.append(l)});
 const pv=el('pre',null,'pm-brief-preview',{id:'brief-preview'});box.append(list,pv);preview()}
function preview(){const pv=doc.getElementById('brief-preview');if(pv)pv.textContent=picked?picked.text.slice(0,1200)+(picked.text.length>1200?'…':''):''}
async function analyse(){const p=P(),go=doc.getElementById('brief-go');
 const text=source==='meeting'?(picked&&picked.text||''):doc.getElementById('brief-text').value.trim();
 if(text.length<20){say(source==='meeting'?'Scegli un meeting con una trascrizione o una sintesi.':'Scrivi almeno un paio di frasi sul progetto.',true);return}
 const start=doc.getElementById('brief-start').value||isoToday(),deadline=doc.getElementById('brief-deadline').value;
 if(deadline&&deadline<start){say('La scadenza è prima dell’inizio.',true);return}
 if(!rt()){say('Gli agenti di RADIX non sono disponibili su questa pagina.',true);return}
 const C=root.RadixConfirm;const ok=C?await C.ask({title:'Analizzare il progetto con l’AI?',cost:'1 chiamata AI',message:source==='meeting'?'Il Project planner legge il meeting e propone fasi e attività. Nulla viene creato finché non premi «Crea il progetto».':'Il Project planner legge il brief e propone fasi e attività. Nulla viene creato finché non premi «Crea il progetto».',ok:'Sì, analizza'}):root.confirm('Analizzare il progetto con l’AI? La chiamata consuma crediti API.');
 if(!ok)return;
 go.disabled=true;doc.getElementById('brief-out').replaceChildren();say('Il Project planner sta leggendo e scomponendo il progetto…');
 try{const people=[...new Set(((p&&p.entries&&p.entries())||[]).flatMap(e=>e.state?e.state.tasks.map(t=>t.owner):[]))].filter(n=>n&&!/^Agen(te|t) · |· RADIX$/.test(n));
  const r=await rt().reply({role:'pm-planner',memoryScope:{level:'agency',agentId:'pm-planner'},messages:[{role:'user',content:prompt({text,source,title:picked&&picked.title,name:doc.getElementById('brief-name').value,start,deadline,me:p&&p.me(),people,agents:rt().AGENTS,en:EN()})}]});
  proposal=parse(r&&r.text,{agents:rt().AGENTS});if(!proposal)throw new Error('risposta senza un piano leggibile, riprova');
  proposal.start=start;proposal.deadline=deadline;if(!doc.getElementById('brief-name').value)doc.getElementById('brief-name').value=proposal.name;
  draw();const h=doc.querySelector('#brief-out h3');if(h&&h.scrollIntoView)h.scrollIntoView({block:'start',behavior:'smooth'});say('Controlla la proposta: cambia chi fa cosa, togli quello che non serve, poi crea il progetto.')}
 catch(e){say('Analisi non riuscita: '+e.message,true)}finally{go.disabled=false}}
const WHO_LABEL={me:'Tu',person:'Persona',agent:'Agente',tool:'Strumento'};
function assignee(t){const s=el('select',null,'pm-brief-who',{'aria-label':'Chi fa «'+t.title+'»'});
 const add=(g,v,l)=>{const o=el('option',l);o.value=v;g.append(o)};add(s,'me:','Tu');
 if(t.person)add(s,'person:'+t.person,t.person);
 const ga=el('optgroup',null,null,{label:'Agenti RADIX'});agentList().forEach(a=>add(ga,'agent:'+a.id,a.name));
 const gt=el('optgroup',null,null,{label:'Strumenti RADIX'});TOOLS.forEach(x=>add(gt,'tool:'+x.id,x.name));s.append(ga,gt);
 s.value=t.who+':'+(t.who==='agent'?t.agent:t.who==='tool'?t.tool:t.who==='person'?t.person:'');
 const tint=()=>{s.className='pm-brief-who pm-who-'+t.who};s.onchange=()=>{const [w,v]=s.value.split(/:(.*)/);t.who=w;t.agent=w==='agent'?v:'';t.tool=w==='tool'?v:'';if(w==='person')t.person=v;tint();counts()};tint();return s}
function counts(){const box=doc.getElementById('brief-split');if(!box||!proposal)return;const c=split(proposal);box.replaceChildren(...[['me','Tu'],['agent','Agenti RADIX'],['tool','Strumenti RADIX'],['person','Altre persone']].filter(([k])=>c[k]).map(([k,l])=>{const x=el('span',null,'pm-brief-chip pm-who-'+k);x.append(el('b',String(c[k])),doc.createTextNode(' '+l));return x}))}
function draw(){const out=doc.getElementById('brief-out');out.replaceChildren();const pr=proposal;
 out.append(el('h3','Proposta del Project planner'));if(pr.goal)out.append(el('p',pr.goal,'pm-brief-goal'));if(pr.summary)out.append(el('p',pr.summary,'muted'));
 out.append(el('div',null,'pm-brief-split',{id:'brief-split'}));
 for(const ph of pr.phases){const sec=el('section',null,'pm-brief-phase');sec.append(el('h4',ph.name));
  for(const t of ph.tasks){const row=el('div',null,'pm-brief-task');const inc=el('input',null,null,{type:'checkbox','aria-label':'Tieni «'+t.title+'»'});inc.checked=t.include!==false;inc.onchange=()=>{t.include=inc.checked;row.classList.toggle('off',!inc.checked);counts()};
   const title=el('input',null,'pm-brief-title',{maxlength:'120','aria-label':'Titolo'});title.value=t.title;title.oninput=()=>{t.title=title.value.trim().slice(0,120)||t.title};
   const days=el('input',null,'pm-brief-days',{type:'number',min:'1',max:String(MAX_DAYS),'aria-label':'Giorni lavorativi di «'+t.title+'»'});days.value=String(t.days);days.oninput=()=>{t.days=Math.min(MAX_DAYS,Math.max(1,Math.round(Number(days.value))||1))};
   const dl=el('label',null,'pm-brief-dl');dl.append(days,doc.createTextNode(' gg'));
   const main=el('div',null,'pm-brief-main');main.append(title);if(t.details)main.append(el('small',t.details,'muted'));if(t.milestone)main.append(el('span','◇ Milestone','pill'));
   row.append(inc,main,assignee(t),dl);sec.append(row)}
  out.append(sec)}
 if(pr.questions.length){const q=el('div',null,'pm-brief-questions');q.append(el('strong','Da chiarire (diventa la tua prima attività)'));const ul=el('ul');pr.questions.forEach(x=>ul.append(el('li',x)));q.append(ul);out.append(q)}
 const create=el('button','Crea il progetto in RADIX','primary',{id:'brief-create',type:'button'});create.onclick=createProject;
 const foot=el('div',null,'row pm-brief-foot');foot.append(el('small','Le attività degli agenti partono da «Fai svolgere» e tornano a te In revisione; quelle degli strumenti hanno il link alla pagina giusta.','muted'),create);out.append(foot);counts()}
async function createProject(){const p=P(),ws=root.RadixWorkspace,pm=root.RadixPM,b=doc.getElementById('brief-create');
 const name=doc.getElementById('brief-name').value.trim()||proposal.name||'Nuovo progetto';b.disabled=true;say('Creo il progetto «'+name+'»…');
 try{const state=buildState(pm,proposal,{name,start:proposal.start,me:p&&p.me(),source,agentLabel:agentName,en:EN()});
  const reg=await ws.projects.create({name,summary:(proposal.goal||proposal.summary||'').slice(0,500),kind:'internal'});
  await ws.documents.save(reg.id,'pm',state,0);root.location.search='?project='+encodeURIComponent(reg.id)+'&view=board&brief=done'}
 catch(e){say('Progetto non creato: '+e.message,true);b.disabled=false}}
function open(opts){if(!doc)return;if(!dialog)build();dialog.showModal();if(opts&&opts.meeting){setSource('meeting');loadMeetings(opts)}else doc.getElementById(source==='brief'?'brief-text':'brief-go').focus()}

// «Chi lavora»: one card per executor with its progress, then the next actions.
const NEXT={review:'Rivedi il risultato',agent:'Fai lavorare l’agente',mine:'Tocca a te',tool:'Apri lo strumento'};
function drawCrew(box,tasks){if(!box)return;const p=P();if(!tasks||!tasks.length){box.hidden=true;return}
 const c=crew(tasks,{me:p.me(),today:isoToday(),all:p.state().tasks});
 if(c.groups.length<2&&!c.groups.some(g=>g.key!=='me'&&g.key!=='person')){box.hidden=true;return}
 box.hidden=false;box.replaceChildren();const head=el('div',null,'row');head.append(el('h2','Chi lavora al progetto'),el('small','Avanzamento per esecutore e prossime azioni','muted'));box.append(head);
 const cards=el('div',null,'pm-crew-cards');
 for(const g of c.groups){const k=el('article',null,'pm-crew-card pm-who-'+g.key);k.append(el('strong',g.label),el('span',g.done+'/'+g.total,'pm-crew-num'));
  const bar=el('div',null,'pm-crew-bar',{role:'progressbar','aria-valuemin':'0','aria-valuemax':'100','aria-valuenow':String(g.pct),'aria-label':g.label+' '+g.pct+'%'});const f=el('i');f.style.width=g.pct+'%';bar.append(f);k.append(bar);
  const facts=[];if(g.review)facts.push(g.review+' in revisione');if(g.late)facts.push(g.late+' in ritardo');if(g.ready&&g.total>g.done)facts.push(g.ready+' pronte');const fx=el('small',null,'pm-crew-facts '+(g.late?'warn':'muted'));(facts.length?facts:[g.done===g.total?'Tutto completato':'In attesa delle dipendenze']).forEach(f=>fx.append(el('span',f)));k.append(fx);
  if(g.names.length){const nm=el('small',null,'pm-crew-names');g.names.slice(0,3).forEach((n,i)=>{if(i)nm.append(doc.createTextNode(', '));nm.append(el('span',g.key==='agent'?agentName(n):n))});if(g.names.length>3)nm.append(doc.createTextNode(' +'+(g.names.length-3)));k.append(nm)}
  cards.append(k)}
 box.append(cards);
 if(c.next.length){const ul=el('ul',null,'pm-crew-next');for(const n of c.next){const li=el('li',null,'pm-crew-'+n.kind);li.append(el('span',NEXT[n.kind],'pill'),el('span',n.task.title));
   if(n.kind==='tool'){const a=el('a','Apri '+tool(n.task.tool).name+' ↗','pm-crew-go');a.href=toolHref(n.task.tool,p.projectKey());li.append(a)}
   else if(n.kind==='agent'&&doc.getElementById('run-ready')&&!doc.getElementById('run-ready').hidden)li.append(btn('Fai svolgere','pm-crew-go',()=>p.pick(n.task.id)));
   else li.append(btn('Apri','pm-crew-go',()=>p.pick(n.task.id)));ul.append(li)}box.append(ul)}}
// The detail of a task handed to a RADIX tool: the link to that page.
function detail(box,t){if(!box||!t||!t.tool||!tool(t.tool))return;const a=el('a','Apri '+tool(t.tool).name+' ↗','pm-tool-link');a.href=toolHref(t.tool,P().projectKey());const pp=el('p',null,'pm-tool-row');pp.append(el('span','Si fa in RADIX:','muted'),a);const meta=box.querySelector('dl.meta');if(meta)meta.after(pp);else box.append(pp)}
// ?brief=meeting&from=<project>&meeting=<id> (from the Meeting page) opens the panel on that meeting; ?brief=new opens it empty.
function fromUrl(){const q=new URLSearchParams(root.location.search);const b=q.get('brief');if(b==='meeting')open({meeting:true,from:q.get('from')||'',meeting:q.get('meeting')||''});else if(b==='new')open();else if(b==='done'&&P())P().say('Progetto creato dall’analisi: le attività degli agenti partono da «Fai svolgere le attività pronte», le tue sono in «Le mie attività».')}

return Object.freeze({TOOLS,tool,toolHref,agentsOf,meetingText,meetingsFrom,prompt,parse,split,buildState,crew,open,drawCrew,detail,fromUrl});
});
