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

return Object.freeze({MAX_KEPT,summarize,toMarkdown,mergeInto});
});
