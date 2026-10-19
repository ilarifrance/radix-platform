/* RADIX Agency Memory Engine v1: validation and bounded context; no external actions. */
const LEVELS = Object.freeze(['agency','client','project','agent','shared']);
const KINDS = Object.freeze(['fact','decision','preference','feedback','outcome','handoff']);
const STATUSES = Object.freeze(['proposed','confirmed']);
const clean=(value,max)=>String(value==null?'':value).trim().slice(0,max);
const validId=(value)=>/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(String(value||''));
function validate(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Payload memoria non valido');
 const level=clean(input.level,30),kind=clean(input.kind,30),status=clean(input.status||'proposed',30);
 if(!LEVELS.includes(level)||!KINDS.includes(kind)||!STATUSES.includes(status))throw Error('Livello, tipo o stato non valido');
 const projectId=clean(input.projectId,80),clientId=clean(input.clientId,80),agentId=clean(input.agentId,80);
 if(projectId&&!validId(projectId)||clientId&&!validId(clientId)||agentId&&!validId(agentId))throw Error('Identificatore non valido');
 if(level==='project'&&!projectId||level==='client'&&!clientId||level==='agent'&&(!projectId||!agentId)||level==='shared'&&!projectId)throw Error('Contesto richiesto per il livello memoria');
 const title=clean(input.title,140),content=clean(input.content,4000),source=clean(input.source,200);
 if(title.length<3||content.length<5||source.length<3)throw Error('Titolo, contenuto e provenienza obbligatori');
 return {level,kind,status,projectId,clientId,agentId,title,content,source};
}
const LEVEL_LABELS=Object.freeze({agent:'Per questo agente',project:'Progetto',shared:'Condivisa nel progetto',client:'Cliente',agency:'Agenzia'});
const KIND_LABELS=Object.freeze({decision:'Decisione',preference:'Preferenza',feedback:'Feedback',handoff:'Passaggio di consegne',fact:'Informazione',outcome:'Risultato'});
// The closer an item is to the work (this agent, then this project, then client, then agency) and the more
// binding it is (decisions and preferences before results), the earlier it goes in; newest first within that.
const LEVEL_RANK={agent:0,project:1,shared:2,client:3,agency:4},KIND_RANK={decision:0,preference:1,feedback:2,handoff:3,fact:4,outcome:5};
function relevantRows(rows,{projectId='',clientId='',agentId=''}={}){
 const seen=new Set();
 return (rows||[]).filter(r=>r&&r.status==='confirmed'&&(r.level==='agency'||r.level==='client'&&clientId&&r.client_id===clientId||r.level==='project'&&projectId&&r.project_id===projectId||r.level==='agent'&&projectId&&agentId&&r.project_id===projectId&&r.agent_id===agentId||r.level==='shared'&&projectId&&r.project_id===projectId))
  .sort((a,b)=>(LEVEL_RANK[a.level]-LEVEL_RANK[b.level])||((KIND_RANK[a.kind]??9)-(KIND_RANK[b.kind]??9))||String(b.updated_at||'').localeCompare(String(a.updated_at||'')))
  .filter(r=>{const k=String(r.title||'').trim().toLowerCase()+'|'+String(r.content||'').trim().toLowerCase();if(seen.has(k))return false;seen.add(k);return true});
}
// Returns the text for the agents plus which items went in and which were left out for space.
function selectContext(rows,opts={}){
 const maxChars=opts.maxChars||6500,used=[],omitted=[];let size=0;
 for(const r of relevantRows(rows,opts)){
  const block='['+(LEVEL_LABELS[r.level]||r.level)+' · '+(KIND_LABELS[r.kind]||r.kind)+'] '+r.title+'\n'+r.content+'\nFonte: '+r.source;
  if(size+block.length>maxChars){omitted.push(r);continue}
  used.push({row:r,block});size+=block.length+2;
 }
 return {context:used.map(u=>u.block).join('\n\n'),used:used.map(u=>u.row.id),omitted:omitted.map(r=>r.id)};
}
function buildContext(rows,opts){return selectContext(rows,opts).context}
module.exports={LEVELS,KINDS,STATUSES,LEVEL_LABELS,KIND_LABELS,clean,validId,validate,relevantRows,selectContext,buildContext};
