/* RADIX Meeting core: what the «Meeting» app does with a recording once it exists. Cost estimate before any paid call,
   the prompt for the meeting analyst, the clean proposal from its reply (summary, decisions, new activities with owner
   and date, changes to activities already in the plan, open questions), the PM plan with the proposals the person ticked,
   the meeting archive of a project and the minutes as plain text. Pure functions: no DOM, no network, tests run in Node.
   The page (meeting.html) records, transcribes through /api/integrations/transcribe and saves through RadixWorkspace. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixMeeting=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// One audio segment per transcription call: Vercel accepts request bodies up to 4.5 MB and the audio travels as base64
// (+33%), so a segment closes before 2.8 MB. At 32 kbit/s that is about 11 minutes of speech.
const SEGMENT_MAX_BYTES=2800000;
const SUBPROJECT='Dai meeting';
const MAX_TRANSCRIPT=240000,MAX_TASKS=30,MAX_ARCHIVE=200,ARCHIVE_BYTES=1400000;
// Prices in dollars per minute of audio (OpenAI, October 2026); the analysis is one call to the meeting analyst.
const TRANSCRIBE_PRICES={'gpt-4o-transcribe':0.006,'gpt-4o-mini-transcribe':0.003,'whisper-1':0.006};
const USD_EUR=0.93;
const STATUSES=['Da fare','In corso','In revisione','Completato'];
const str=(v,n)=>String(v==null?'':v).replace(/\s+/g,' ').trim().slice(0,n);
const isoDay=v=>{const s=String(v||'').trim();return /^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s?s:''};
function addDays(day,n){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
const itDate=day=>day?day.split('-').reverse().join('/'):'';

// «1 h 05 min», «12 min», «40 s».
function duration(seconds){const s=Math.max(0,Math.round(Number(seconds)||0));if(s<60)return s+' s';const m=Math.round(s/60);if(m<60)return m+' min';return Math.floor(m/60)+' h '+String(m%60).padStart(2,'0')+' min'}
const euro=v=>v<0.01?'meno di 1 centesimo':'circa '+v.toFixed(2).replace('.',',')+' €';
// What the transcription and the analysis will cost, shown in the confirmation before anything is spent.
function estimate(seconds,{model='gpt-4o-transcribe',transcriptChars}={}){
 const minutes=Math.max(1,Math.ceil((Number(seconds)||0)/60)),perMin=TRANSCRIBE_PRICES[model]||TRANSCRIBE_PRICES['gpt-4o-transcribe'];
 const transcribe=minutes*perMin*USD_EUR;
 // About 900 characters of speech per minute; 4 characters per token; standard model at $3 in and $15 out per million.
 const chars=transcriptChars||minutes*900,analysis=((chars/4+3000)*3+3000*15)/1e6*USD_EUR;
 return {minutes,transcribe,analysis,total:transcribe+analysis,text:{transcribe:euro(transcribe),analysis:euro(analysis),total:euro(transcribe+analysis)}};
}

// The text of the meeting from its transcribed segments, in order.
function transcript(segments){return (segments||[]).slice().sort((a,b)=>a.n-b.n).map(s=>String(s.text||'').trim()).filter(Boolean).join('\n\n')}
// The last words of the previous segment, given to the transcription as context so names and terms stay the same.
function contextFor(segments,n){const prev=(segments||[]).filter(s=>s.n<n&&s.text).sort((a,b)=>b.n-a.n)[0];return prev?String(prev.text).slice(-400):''}

function openTasks(state){return state&&Array.isArray(state.tasks)?state.tasks.filter(t=>t.status!=='Completato').slice(0,80).map(t=>({id:t.id,title:t.title,owner:t.owner,due:t.due,status:t.status})):[]}
// The request to the meeting analyst. With a project chosen, its open activities go along so the analyst can say which
// ones the meeting moved (new date, started, done) instead of creating duplicates.
function prompt({title,date,today,text,project,state,projects}){
 const t=String(text||'');const cut=t.length>MAX_TRANSCRIPT;const body=cut?t.slice(0,MAX_TRANSCRIPT):t;const open=openTasks(state);
 return 'Analizza la trascrizione di una riunione e prepara le proposte per RADIX.\n'+
  'Riunione: '+(str(title,120)||'senza titolo')+' · data '+(isoDay(date)||isoDay(today))+' · oggi è '+isoDay(today)+'.\n'+
  (project?'Progetto RADIX scelto: '+str(project,120)+'.\n':'Nessun progetto scelto: suggerisci tu a quale progetto appartiene.\n')+
  (projects&&projects.length?'Progetti esistenti: '+projects.slice(0,60).map(p=>str(p,80)).join(' · ')+'.\n':'')+
  (open.length?'Attività aperte del progetto (id · titolo · responsabile · scadenza · stato):\n'+open.map(o=>o.id+' · '+o.title+' · '+o.owner+' · '+o.due+' · '+o.status).join('\n')+'\n':'')+
  'Regole: usa solo quello che è stato detto. Non inventare nomi, date, importi o impegni. '+
  'Un\'attività è un impegno concreto preso nella riunione: titolo con verbo iniziale, responsabile solo se nominato (altrimenti vuoto), '+
  'scadenza YYYY-MM-DD solo se detta o chiaramente ricavabile («venerdì prossimo» rispetto alla data della riunione), altrimenti vuota. '+
  'Le scadenze importanti (consegne, eventi, rinnovi) sono attività con "milestone": true. '+
  (open.length?'Se un\'attività aperta è stata spostata, avviata o chiusa nella riunione, mettila in "updates" con il suo id, invece di crearne una nuova. ':'')+
  'Le decisioni sono scelte prese (non proposte). Le domande aperte sono punti rimasti senza risposta.\n'+
  'Rispondi SOLO con questo JSON: {"title":"titolo breve della riunione","summary":"5-8 righe","decisions":["…"],'+
  '"tasks":[{"title":"…","owner":"","due":"","details":"contesto in una frase","milestone":false}],'+
  '"updates":[{"id":"t3","due":"","status":"","note":"cosa è cambiato"}],"questions":["…"],'+
  '"project":{"existing":"nome di un progetto esistente o vuoto","new":"nome di un nuovo progetto se nessuno va bene"},'+
  '"participants":["nomi citati"]}\n'+
  (cut?'(Trascrizione tagliata a '+MAX_TRANSCRIPT+' caratteri.)\n':'')+
  '--- TRASCRIZIONE ---\n'+body;
}

// A clean proposal from the analyst's reply: unknown ids, invalid dates and empty items are dropped, never guessed.
function parse(reply,{state,today}={}){
 const m=/\{[\s\S]*\}/.exec(String(reply||''));if(!m)return null;let d;try{d=JSON.parse(m[0])}catch(e){return null}
 if(!d||typeof d!=='object')return null;
 const list=(v,n,max)=>(Array.isArray(v)?v:[]).map(x=>str(x,n)).filter(Boolean).slice(0,max);
 const known=new Map(((state&&state.tasks)||[]).map(t=>[t.id,t]));
 const seen=new Set();
 const tasks=(Array.isArray(d.tasks)?d.tasks:[]).map(t=>{if(!t||typeof t!=='object')return null;const title=str(t.title,120);if(!title||seen.has(title.toLowerCase()))return null;seen.add(title.toLowerCase());
  return {title,owner:str(t.owner,80),due:isoDay(t.due),details:str(t.details,600),milestone:t.milestone===true}}).filter(Boolean).slice(0,MAX_TASKS);
 const updates=(Array.isArray(d.updates)?d.updates:[]).map(u=>{if(!u||typeof u!=='object')return null;const cur=known.get(String(u.id||'').trim());if(!cur||cur.status==='Completato')return null;
  const due=isoDay(u.due),status=STATUSES.includes(u.status)&&u.status!==cur.status?u.status:'',note=str(u.note,300);
  if(!(due&&due!==cur.due)&&!status&&!note)return null;return {id:cur.id,title:cur.title,due:due&&due!==cur.due?due:'',status,note}}).filter(Boolean).slice(0,MAX_TASKS);
 const p=d.project&&typeof d.project==='object'?d.project:{};
 return {title:str(d.title,120),summary:String(d.summary==null?'':d.summary).trim().slice(0,3000),decisions:list(d.decisions,400,30),tasks,updates,
  questions:list(d.questions,400,30),participants:list(d.participants,80,30),project:{existing:str(p.existing,120),new:str(p.new,120)},today:isoDay(today)};
}

// Which registry project the analyst meant: exact name first, then a name that contains the other.
function matchProject(projects,name){const n=str(name,120).toLowerCase();if(!n)return null;const list=projects||[];
 return list.find(p=>String(p.name||'').toLowerCase()===n)||list.find(p=>{const x=String(p.name||'').toLowerCase();return x&&(x.includes(n)||n.includes(x))})||null}

// The PM plan after the meeting: the ticked new activities in the sub-project «Dai meeting» (created when missing),
// the ticked changes applied with the PM rules (a change the rules refuse is reported, not forced). `pm` is RadixPM.
// Without a plan (new project) one is created with the project name.
function applyToPm(pm,state,proposal,{projectName,today,meetingTitle,meetingDate}={}){
 const day=isoDay(today)||new Date().toISOString().slice(0,10),label='«'+(str(meetingTitle,120)||'Meeting')+'» del '+itDate(isoDay(meetingDate)||day);
 let s=state?JSON.parse(JSON.stringify(state)):null;
 if(!s){s={projects:[],tasks:[],nextId:1};pm.createProject(s,{name:str(projectName,120)||'Progetto dai meeting',note:'Creato dal meeting '+label+'.',subprojects:[SUBPROJECT]})}
 const project=s.projects[0];let sub=project.subprojects.find(x=>x.name===SUBPROJECT);
 const created=[],updated=[],skipped=[];
 const tasks=(proposal&&proposal.tasks||[]).filter(t=>t.selected!==false);
 if(tasks.length&&!sub){let n=1;const ids=new Set(s.projects.flatMap(p=>p.subprojects.map(x=>x.id)));while(ids.has(project.id+'m'+n))n++;sub={id:project.id+'m'+n,name:SUBPROJECT};project.subprojects.push(sub)}
 for(const t of tasks){
  const due=isoDay(t.due)||addDays(day,7);
  try{const task=pm.create(s,{project:project.id,subproject:sub.id,title:str(t.title,120),owner:str(t.owner,80)||'Da assegnare',start:'',due:due<day?day:due,
    details:(str(t.details,3000)+(isoDay(t.due)?'':' (Scadenza da confermare: non detta nella riunione.)')).trim(),dependencies:[],approvalRequired:false,milestone:t.milestone===true,assignedAgents:[],recurrence:'Nessuna'});
   task.history=['Creata dal meeting '+label+'.'];created.push(task.id)}catch(err){skipped.push({title:t.title,reason:err.message})}}
 for(const u of (proposal&&proposal.updates||[]).filter(x=>x.selected!==false)){
  const task=s.tasks.find(x=>x.id===u.id);if(!task){skipped.push({title:u.title||u.id,reason:'Attività non trovata nel piano.'});continue}
  let done=false;
  try{if(isoDay(u.due)&&u.due!==task.due){pm.reschedule(s,[{id:task.id,due:u.due,start:task.start&&task.start>u.due?'':task.start}]);done=true}}catch(err){skipped.push({title:task.title,reason:err.message})}
  try{if(u.status&&u.status!==task.status){pm.changeStatus(s,task.id,u.status);done=true}}catch(err){skipped.push({title:task.title,reason:err.message})}
  if(u.note){task.history.push('Dal meeting '+label+': '+str(u.note,300));done=true}
  if(done)updated.push(task.id)}
 return {state:pm.validateState(s),created,updated,skipped,projectId:project.id};
}

// One meeting in the project's archive (registry module «meetings»).
function record({id,title,date,seconds,source,text,proposal,created,updated,by,at}){
 return {id:str(id,60),title:str(title,120)||'Meeting',date:isoDay(date),seconds:Math.max(0,Math.round(Number(seconds)||0)),source:source==='call'?'call':source==='file'?'file':'room',
  summary:String(proposal&&proposal.summary||'').slice(0,3000),decisions:(proposal&&proposal.decisions||[]).slice(0,30),questions:(proposal&&proposal.questions||[]).slice(0,30),
  participants:(proposal&&proposal.participants||[]).slice(0,30),created:(created||[]).slice(0,60),updated:(updated||[]).slice(0,60),
  transcript:String(text||'').slice(0,MAX_TRANSCRIPT),by:str(by,120),at:at||new Date().toISOString()};
}
// The archive with one more meeting, newest first, under the size the registry accepts: the oldest transcripts go first,
// summaries and decisions stay.
function addToArchive(doc,entry){
 const items=[entry,...((doc&&Array.isArray(doc.items)?doc.items:[]).filter(x=>x&&x.id!==entry.id))].slice(0,MAX_ARCHIVE);
 const out={schemaVersion:1,items};
 const size=()=>JSON.stringify(out).length*1.1;
 for(let i=items.length-1;i>0&&size()>ARCHIVE_BYTES;i--)if(items[i].transcript){items[i]={...items[i],transcript:'',transcriptDropped:true}}
 if(size()>ARCHIVE_BYTES)items[0]={...items[0],transcript:items[0].transcript.slice(0,Math.max(0,items[0].transcript.length-(size()-ARCHIVE_BYTES)))};
 return out;
}

// The minutes as plain text, for «Copia» and «Scarica il verbale».
function minutes({title,date,seconds,participants,summary,decisions,tasks,updates,questions,transcript:text}){
 const lines=['VERBALE · '+(str(title,120)||'Meeting'),'Data: '+itDate(isoDay(date))+(seconds?' · durata '+duration(seconds):'')];
 if(participants&&participants.length)lines.push('Partecipanti citati: '+participants.join(', '));
 lines.push('','RIASSUNTO',summary||'—');
 const block=(h,arr,fmt)=>{if(arr&&arr.length){lines.push('',h);arr.forEach((x,i)=>lines.push((i+1)+'. '+fmt(x)))}};
 block('DECISIONI',decisions,x=>x);
 block('ATTIVITÀ',tasks,t=>t.title+(t.owner?' · '+t.owner:'')+(t.due?' · entro il '+itDate(t.due):'')+(t.milestone?' · scadenza importante':''));
 block('ATTIVITÀ AGGIORNATE',updates,u=>u.title+(u.due?' · nuova scadenza '+itDate(u.due):'')+(u.status?' · '+u.status:'')+(u.note?' · '+u.note:''));
 block('DOMANDE APERTE',questions,x=>x);
 if(text)lines.push('','TRASCRIZIONE',text);
 return lines.join('\n');
}

// The team memory proposal for the decisions (confirmed later on the Memoria page).
function memoryEntry({projectId,clientId,title,date,decisions}){if(!decisions||!decisions.length)return null;
 return {level:'project',kind:'decision',projectId,clientId:str(clientId,80),title:('Decisioni · '+(str(title,90)||'Meeting')).slice(0,140),
  content:('Decisioni del meeting del '+itDate(isoDay(date))+':\n'+decisions.map(d=>'- '+d).join('\n')).slice(0,3900),source:('Meeting · '+itDate(isoDay(date))).slice(0,200)}}

return Object.freeze({SEGMENT_MAX_BYTES,SUBPROJECT,TRANSCRIBE_PRICES,MAX_TRANSCRIPT,duration,estimate,transcript,contextFor,prompt,parse,matchProject,applyToPm,record,addToArchive,minutes,memoryEntry,addDays,isoDay});
});
