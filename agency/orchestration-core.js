/* Shared, dependency-free routing core extracted from RADIX v3.7 parseRouting contract.
   No HTTP, API credentials, side effects or external actions. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixAgencyRouting=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const MAX_TASKS=12,MAX_INSTRUCTIONS=1400;
function parseRouting(text,allowedRoles){
 const m=/---ROUTING---([\s\S]*?)---FINE---/.exec(String(text||''));
 if(!m)return [];
 const allowed=new Set(allowedRoles||[]);
 const lines=m[1].split(/\r?\n/).map(x=>x.trim().replace(/^\d+[.)]\s*/,'')).filter(Boolean);
 if(lines.length>MAX_TASKS)throw Error('Too many routed tasks');
 let tasks=[],indices={};
 lines.forEach((line,i)=>{
  const sep=line.indexOf('|');if(sep<1)throw Error('Invalid routing line');
  const role=line.slice(0,sep).trim().replace(/^[-*•]\s*/,'');
  if(!allowed.has(role)||role==='marketing-orchestrator'||role==='orchestrator')throw Error('Unsupported specialist role: '+role);
  let rest=line.slice(sep+1).trim(),deps=[];
  const match=/\|\s*dipende\s*:\s*([\d,\s]+)\s*$/i.exec(rest);
  if(match){deps=match[1].split(',').map(n=>Number(n.trim()));rest=rest.slice(0,match.index).trim()}
  rest=rest.replace(/\|\s*$/,'').trim();
  if(!rest||rest.length>MAX_INSTRUCTIONS)throw Error('Task missing or too long');
  if(deps.some(n=>!Number.isInteger(n)||n<1||n>=i+1))throw Error('Task dependencies must reference preceding tasks');
  tasks.push({id:'step-'+(i+1),role,instruction:rest,dependsOn:deps.map(n=>'step-'+n),status:'proposed'});
  indices[i+1]=i;
 });
 return tasks;
}
function stripRouting(text){return String(text||'').replace(/\n?---ROUTING---[\s\S]*?---FINE---/,'').trim()}
function nextReady(tasks){const done=new Set(tasks.filter(t=>t.status==='done').map(t=>t.id));return tasks.filter(t=>t.status==='proposed'&&t.dependsOn.every(d=>done.has(d)))}
function hasBlockedDependencies(tasks){const failed=new Set(tasks.filter(t=>t.status==='error'||t.status==='blocked').map(t=>t.id));return tasks.some(t=>t.status==='proposed'&&t.dependsOn.some(d=>failed.has(d)))}
// Projects created outside Agency (internal, brand) have no incarichi yet: their brief, from the
// approved PED strategy or the project profile, becomes the request to the Marketing Orchestrator.
function briefForSetup(project,editorialBrief){
 const p=project||{},pb=(p.profile&&p.profile.brief)||{},e=editorialBrief||{};
 const pick=(...v)=>v.map(x=>String(x==null?'':x).trim()).find(Boolean)||'';
 const channels=pick(e.channels,Array.isArray(pb.channels)?pb.channels.join(', '):pb.channels).split(/[,;\n]/).map(x=>x.trim()).filter(Boolean);
 return {name:pick(p.name,pb.name),goal:pick(e.goal,pb.goal,p.summary),audience:pick(e.audience,pb.audience),market:pick(pb.market,e.positioning,e.offer),
  budget:pb.budget==null||pb.budget===''?null:pb.budget,channels,brandRules:pick(pb.brandRules,[e.voice,e.brand].map(x=>String(x||'').trim()).filter(Boolean).join(' · ')),
  constraints:pick(pb.constraints,e.gaps),clientId:p.client_id||pb.clientId||null};
}
function setupPrompt(b){
 return 'Progetto: '+b.name+'\nObiettivo: '+b.goal+'\nTarget: '+(b.audience||'da definire')+'\nMercato: '+(b.market||'non indicato')+'\nBudget EUR: '+(b.budget==null?'non indicato':b.budget)+'\nCanali: '+(b.channels.join(', ')||'da definire')+'\nLinee guida: '+(b.brandRules||'non indicate')+'\nVincoli: '+(b.constraints||'nessuno indicato')+
  '\nCrea il piano operativo e un blocco ---ROUTING--- con al massimo 8 incarichi a specialisti reali, con dipendenze dipende:N e chiusura ---FINE---. Solo ricerca, pianificazione e bozze interne. Non includere invii, spesa pubblicitaria, pubblicazioni, deploy o azioni esterne.';
}
function workspaceFromReply(brief,roles,reply,now){
 const tasks=parseRouting(reply,Object.keys(roles||{}).filter(r=>r!=='marketing-orchestrator'&&r!=='orchestrator'));
 if(!tasks.length)throw Error('La risposta non contiene incarichi eseguibili: riprova');
 return {schemaVersion:1,createdAt:now||new Date().toISOString(),brief,roles,planText:stripRouting(reply),tasks};
}
// A person adds an incarico by hand: a specialist from the catalogue, an instruction, optional dependencies
// on existing incarichi. It starts as «Da avviare» like the orchestrator's ones.
function addTask(state,input,roles){
 if(!state||!Array.isArray(state.tasks))throw Error('Piano non valido');
 if(state.tasks.length>=MAX_TASKS)throw Error('Massimo '+MAX_TASKS+' incarichi per progetto');
 const role=String(input&&input.role||'');
 if(!roles||!Object.prototype.hasOwnProperty.call(roles,role)||role==='marketing-orchestrator'||role==='orchestrator')throw Error('Scegli uno specialista del catalogo');
 const instruction=String(input.instruction||'').trim();
 if(instruction.length<10)throw Error('Descrivi il compito (almeno 10 caratteri)');
 if(instruction.length>MAX_INSTRUCTIONS)throw Error('Compito troppo lungo (massimo '+MAX_INSTRUCTIONS+' caratteri)');
 const ids=new Set(state.tasks.map(t=>t.id)),dependsOn=[...new Set((input.dependsOn||[]).map(String))];
 if(dependsOn.some(d=>!ids.has(d)))throw Error('Dipendenza non valida');
 let n=state.tasks.length+1;while(ids.has('step-'+n))n++;
 const task={id:'step-'+n,role,instruction,dependsOn,status:'proposed',addedBy:'manual'};
 state.tasks.push(task);state.roles=Object.assign({},state.roles,{[role]:roles[role]});
 return task;
}
// Numeric claims in a draft (percentages, money, multipliers, result counts) that no source the specialist was given contains.
const RESULT_WORDS='lead|clienti|client|follower|impression|visualizzazion|iscritt|contatti|appuntament|call|vendit|conversion|download|utenti|commenti|like|reazioni|risposte|demo|trattative|opportunità';
const CLAIM=new RegExp('[+−-]?(?:€\\s?)?\\d[\\d.,]*\\s*(?:%|€|euro\\b|x\\b|k\\b|mila\\b|milion[ei]\\b|mln\\b|M\\b|M€|(?:nuovi\\s+|di\\s+|in\\s+più\\s+)?(?:'+RESULT_WORDS+'))','gi');
function numberValue(raw){
 let s=String(raw).toLowerCase(),m=/\d[\d.,]*/.exec(s);if(!m)return null;
 let n=m[0].replace(/[.,]$/,'');
 n=/^\d{1,3}(\.\d{3})+$/.test(n)?n.replace(/\./g,''):n.replace(/\.(?=\d{3}\b)/g,'');
 let v=Number(n.replace(',','.'));if(!isFinite(v))return null;
 const rest=s.slice(m.index+m[0].length).trim();
 if(/^(k\b|mila\b)/.test(rest))v*=1e3;else if(/^(m\b|m€|mln\b|milion)/.test(rest))v*=1e6;
 return Math.round(v*100)/100;
}
function sourceValues(text){const out=new Set();String(text||'').replace(/\d[\d.,]*\s*(?:k\b|mila\b|milion[ei]\b|mln\b|M\b|M€)?/gi,x=>{const v=numberValue(x);if(v!=null)out.add(v);return x});return out}
function unsupportedNumbers(output,sources){
 const all=[].concat(sources||[]).join('\n'),known=sourceValues(all),seen=new Set(),found=[];
 const multipliers=new Set();all.replace(/(\d+(?:[.,]\d+)?)\s*(?:x\b|volte\b)/gi,(x,n)=>{multipliers.add(Number(n.replace(',','.')));return x});
 const text=String(output||'');let m;CLAIM.lastIndex=0;
 while((m=CLAIM.exec(text))&&found.length<12){
  const claim=m[0].trim(),v=numberValue(claim);
  if(v==null||v===0||(/x$/i.test(claim)?multipliers.has(v):known.has(v))||(/^\d{4}$/.test(String(v))&&v>=1990&&v<=2100))continue;
  const key=claim.toLowerCase();if(seen.has(key))continue;seen.add(key);
  const a=Math.max(0,m.index-50),b=Math.min(text.length,m.index+m[0].length+50);
  found.push({claim,value:v,context:(a?'…':'')+text.slice(a,b).replace(/\s+/g,' ').trim()+(b<text.length?'…':'')});
 }
 // Speed promises («in 2 minuti», «in 10 secondi») count as claims unless a source says the same.
 const SPEED=/\bin\s+(?:soli\s+|appena\s+)?\d+(?:[.,]\d+)?\s*(?:secondi|minuti|ore)\b/gi;
 while((m=SPEED.exec(text))&&found.length<12){
  const claim=m[0].trim(),key=claim.toLowerCase();
  if(seen.has(key)||all.toLowerCase().includes(key))continue;seen.add(key);
  const a=Math.max(0,m.index-50),b=Math.min(text.length,m.index+m[0].length+50);
  found.push({claim,value:numberValue(claim),context:(a?'…':'')+text.slice(a,b).replace(/\s+/g,' ').trim()+(b<text.length?'…':'')});
 }
 return found;
}
// Calendar of the coming weeks (Europe/Rome), so specialists copy real dates instead of computing weekdays.
const DAYS=['dom','lun','mar','mer','gio','ven','sab'];
function calendarWeeks(now,weeks){
 const ymd=new Date(now||Date.now()).toLocaleDateString('en-CA',{timeZone:'Europe/Rome'}).split('-').map(Number);
 const d=new Date(Date.UTC(ymd[0],ymd[1]-1,ymd[2]));d.setUTCDate(d.getUTCDate()+((8-d.getUTCDay())%7||7));
 const fmt=x=>DAYS[x.getUTCDay()]+' '+String(x.getUTCDate()).padStart(2,'0')+'/'+String(x.getUTCMonth()+1).padStart(2,'0')+'/'+x.getUTCFullYear();
 const out=[];
 for(let w=1;w<=(weeks||8);w++){const days=[];for(let i=0;i<7;i++){days.push(fmt(d));d.setUTCDate(d.getUTCDate()+1)}out.push('Settimana '+w+': '+days.join(', '))}
 return out.join('\n');
}
// Questions a draft leaves to the reviewer: items under a "dati mancanti / da fornire / domande" heading and every
// [placeholder] the specialist wrote, so the revision notes can start from them.
function missingInfo(output){
 const lines=String(output||'').split(/\r?\n/),out=[],seen=new Set();let inSection=false;
 const add=x=>{x=x.replace(/^\s*([-*•]|\d+[.)])\s*/,'').replace(/\*\*/g,'').trim();const k=x.toLowerCase();if(x.length>3&&!seen.has(k)&&out.length<15){seen.add(k);out.push(x.slice(0,240))}};
 for(const raw of lines){const x=raw.trim();
  const heading=/^#{1,4}\s|^\*\*[^*]+\*\*:?$|^[A-ZÀ-Ü][^.!?]{2,60}:$/.test(x);
  if(heading){inSection=/dati mancanti|informazioni mancanti|da fornire|da completare|domande|da verificare|serve sapere/i.test(x);continue}
  if(inSection&&/^([-*•]|\d+[.)])\s/.test(x))add(x);
 }
 String(output||'').replace(/\[([^\]\n]{4,80})\]/g,(m,inner)=>{if(/fornire|inserire|da definire|completare|reale|tuo|tua/i.test(inner))add(m);return m});
 return out;
}
// Quality pass: the reviewer answers with exact find/replace pairs; only text found verbatim in the draft changes.
function applyReview(draft,reply){
 const t=String(reply||''),a=t.indexOf('['),b=t.lastIndexOf(']');let list=[];
 if(a>=0&&b>a){try{list=JSON.parse(t.slice(a,b+1))}catch(e){list=[]}}
 let text=String(draft||'');const applied=[];let skipped=0;
 (Array.isArray(list)?list:[]).slice(0,20).forEach(x=>{
  const find=x&&typeof x.trova==='string'?x.trova:'',repl=x&&typeof x.sostituisci==='string'?x.sostituisci:null;
  if(find.length<3||repl===null||find===repl||!text.includes(find)){skipped++;return}
  text=text.split(find).join(repl);applied.push({trova:find.slice(0,300),sostituisci:repl.slice(0,300),motivo:String(x.motivo||'').slice(0,200)});
 });
 return {text,applied,skipped};
}
function reviewPrompt(draft,sources){
 return ['Sei il revisore qualità di RADIX Agency. Controlla la BOZZA qui sotto rispetto a FATTI VERIFICATI, BRIEF e MATERIALI APPROVATI.',
  'Correggi solo questi problemi: numeri, percentuali, cifre, clienti o casi che non compaiono nelle fonti; episodi raccontati in prima persona a nome del cliente che non compaiono nelle fonti (riscrivili come scenario tipico in terza persona, senza cifre); promesse di prestazioni (tempi, velocità, «perfetto», «garantito») non presenti nelle fonti; strumenti o fornitori esterni non previsti dalle fonti; giorni della settimana che non corrispondono alle date del calendario fornito.',
  'Non riscrivere lo stile e non accorciare. Rispondi solo con un array JSON, senza testo prima o dopo: [{"trova":"testo copiato esattamente dalla bozza","sostituisci":"testo corretto","motivo":"breve"}]. Massimo 20 elementi; se non c\'è nulla da correggere rispondi [].',
  'FONTI:\n'+String(sources||'').slice(0,40000),
  'BOZZA:\n'+String(draft||'').slice(0,40000)].join('\n\n');
}
return Object.freeze({applyReview,reviewPrompt,missingInfo,calendarWeeks,unsupportedNumbers,addTask,parseRouting,stripRouting,nextReady,hasBlockedDependencies,briefForSetup,setupPrompt,workspaceFromReply,MAX_TASKS,MAX_INSTRUCTIONS});
});