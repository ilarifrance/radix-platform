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
function buildContext(rows,{projectId='',clientId='',agentId='',maxChars=6500}={}){
 const relevant=(rows||[]).filter(r=>r.status==='confirmed'&&(r.level==='agency'||r.level==='client'&&clientId&&r.client_id===clientId||r.level==='project'&&projectId&&r.project_id===projectId||r.level==='agent'&&projectId&&agentId&&r.project_id===projectId&&r.agent_id===agentId||r.level==='shared'&&projectId&&r.project_id===projectId));
 let used=0;const chunks=[];
 for(const r of relevant){const block='['+r.level+'/'+r.kind+'] '+r.title+'\n'+r.content+'\nFonte: '+r.source; if(used+block.length>maxChars)break;chunks.push(block);used+=block.length+2}
 return chunks.join('\n\n');
}
module.exports={LEVELS,KINDS,STATUSES,clean,validId,validate,buildContext};
