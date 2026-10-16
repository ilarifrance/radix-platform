/* RADIX v3.7 archive — reads the old shared workspace state (history per agent) so it can be read,
   exported and copied into a registry project's Agenti AI conversations before v3.7 is retired.
   Pure functions shared by archive.html and the tests. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixV37Archive=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const MAX_KEPT=60;
const visible=m=>m&&typeof m.content==='string'&&!m.hidden&&!m.pending&&['user','assistant','error'].includes(m.role);
const text=m=>String(m.role==='user'?(m.display||m.content):m.content||'');

// One row per agent with saved messages, newest activity first when timestamps exist.
function summarize(state,labelOf){
 const history=state&&state.history&&typeof state.history==='object'?state.history:{};
 return Object.entries(history).filter(([,v])=>Array.isArray(v)&&v.some(visible)).map(([agentId,msgs])=>{
  const shown=msgs.filter(visible),last=[...shown].reverse().find(m=>m.at)||null;
  return {agentId,label:labelOf?labelOf(agentId):agentId,count:shown.length,flows:msgs.filter(m=>m&&m.flow).length,last:last?last.at:null,preview:text(shown[shown.length-1]).slice(0,160)};
 }).sort((a,b)=>String(b.last||'').localeCompare(String(a.last||''))||b.count-a.count);
}

function toMarkdown(label,msgs){
 const lines=['# Archivio v3.7 · '+label,''];
 for(const m of (msgs||[]).filter(visible)){
  const who=m.role==='user'?(m.by?m.by:'Utente'):m.role==='error'?'Errore':label;
  lines.push('## '+who+(m.at?' · '+m.at:''),'',text(m).trim(),'');
 }
 return lines.join('\n');
}

// Copies an agent's v3.7 history in front of the project's conversation with that agent. Imported
// messages carry importedFrom, so a second import of the same agent changes nothing.
function mergeInto(conversations,agentId,msgs){
 const conv={...(conversations||{})},current=Array.isArray(conv[agentId])?conv[agentId]:[];
 if(current.some(m=>m&&m.importedFrom==='v3.7'))return {conversations:conv,added:0};
 const imported=(msgs||[]).filter(m=>visible(m)||(m&&m.flow)).map(m=>({...m,importedFrom:'v3.7'}));
 const keep=Math.max(0,MAX_KEPT-current.length);
 const added=imported.slice(-keep);
 conv[agentId]=added.concat(current);
 return {conversations:conv,added:added.length};
}

// ---- last Pipeline post run (state.pipelineTask / pipelineSteps) ----
function pipelineRun(state){
 const steps=(state&&Array.isArray(state.pipelineSteps)?state.pipelineSteps:[]).filter(s=>s&&s.role&&typeof s.output==='string'&&s.output.trim());
 return steps.length?{task:String((state&&state.pipelineTask)||'').trim(),steps}:null;
}
function pipelineMarkdown(run,labelOf){
 const lines=['# Archivio v3.7 · Pipeline post',''];if(run.task)lines.push('**Brief:** '+run.task,'');
 run.steps.forEach((s,i)=>lines.push('## '+(i+1)+'. '+(s.label||(labelOf?labelOf(s.role):s.role)),'',s.output.trim(),''));
 return lines.join('\n');
}
// The run becomes a finished Pipeline post in the project's 'orchestrator' conversation, so each step
// can be edited, regenerated or replied to in Agenti AI. Imported once per project.
function mergePipeline(conversations,run,labelOf){
 const conv={...(conversations||{})},current=Array.isArray(conv.orchestrator)?conv.orchestrator:[];
 if(!run||current.some(m=>m&&m.importedFrom==='v3.7-pipeline'))return {conversations:conv,added:0};
 const nodes=run.steps.map((s,i)=>({role:s.role,subtask:'Pipeline v3.7'+(run.task?': '+run.task:''),deps:Array.from({length:i},(_,k)=>k+1),label:s.label||(labelOf?labelOf(s.role):s.role),status:s.status==='stale'?'stale':'done',output:s.output,sources:[]}));
 const msgs=[{role:'user',content:run.task||'Pipeline post (v3.7)',importedFrom:'v3.7-pipeline'},
  {role:'assistant',agent:'orchestrator',content:'Pipeline importata dalla v3.7: '+nodes.map(n=>n.label).join(' → ')+'.',importedFrom:'v3.7-pipeline',
   flow:{status:'done',round:1,pipeline:true,task:run.task,log:[],nodes}}];
 conv.orchestrator=msgs.concat(current).slice(-MAX_KEPT);
 return {conversations:conv,added:msgs.length};
}
// ---- v3.3 project profiles (state.projects) ----
const PROFILE_FIELDS=['audience','positioning','voice','channels','visual','links','notes'];
function profiles(state){return (state&&Array.isArray(state.projects)?state.projects:[]).filter(p=>p&&(p.name||p.summary))}
// Fills only what the registry project leaves empty: nothing the team already wrote is overwritten.
function profileFill(v37,project){
 const pr={...((project&&project.profile)||{})},filled=[];
 for(const f of PROFILE_FIELDS){const v=String((v37&&v37[f])||'').trim();if(v&&!String(pr[f]||'').trim()){pr[f]=v;filled.push(f)}}
 const changes={profile:pr};
 if(String((v37&&v37.summary)||'').trim()&&!String((project&&project.summary)||'').trim()){changes.summary=v37.summary.trim();filled.push('summary')}
 if(String((v37&&v37.kind)||'').trim()&&!String(pr.kind||'').trim()){pr.kind=v37.kind.trim();filled.push('kind')}
 return {changes,filled};
}
// HeyGen avatar and voice chosen in v3.7 become the project's shared choice when it has none.
function mergePrefs(prefs,state){
 const out={...(prefs||{})};
 if(state&&state.heygenAvatarId&&!out['heygen-avatar'])out['heygen-avatar']=String(state.heygenAvatarId);
 if(state&&state.heygenVoiceId&&!out['heygen-voice'])out['heygen-voice']=String(state.heygenVoiceId);
 return out;
}

return Object.freeze({MAX_KEPT,PROFILE_FIELDS,summarize,toMarkdown,mergeInto,pipelineRun,pipelineMarkdown,mergePipeline,profiles,profileFill,mergePrefs});
});
