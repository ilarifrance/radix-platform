(function(root){
  'use strict';
  const fields=['goal','audience','channels','period','voice','brand','offer','positioning','messages','topics','frequency','kpis','materials','gaps'];
  function missing(brief){return fields.filter(key=>!String(brief[key]||'').trim())}
  function key(owner,project){if(!owner||!project)throw Error('Account e progetto richiesti');return 'radix-editorial:v1:'+encodeURIComponent(owner)+':'+encodeURIComponent(project)}
  function create(project){return {schemaVersion:1,projectId:String(project.id),brief:{goal:project.summary||'',audience:'',channels:'',period:'',voice:''},briefApproved:false,contents:[]}}
  function revise(state,brief){
    const next=Object.fromEntries(fields.map(k=>[k,String(brief[k]||'').trim()]));
    const changed=fields.some(k=>(state.brief[k]||'')!==next[k]);
    if(changed){
      state.strategyHistory=state.strategyHistory||[];
      state.strategyHistory.push({revision:state.strategyRevision||0,brief:{...state.brief},approval:state.strategyApproval?{...state.strategyApproval}:null});
      state.strategyRevision=(state.strategyRevision||0)+1;
      state.briefApproved=false;state.strategyApproval=null;
      state.contents.forEach(item=>{item.needsStrategyReview=true;item.status='draft'});
    }
    state.brief=next;return state;
  }
  function approveBrief(state){
    if(missing(state.brief).length)throw Error('Completa la strategia prima di confermarla');
    state.strategyRevision=state.strategyRevision||1;
    state.strategyApproval={revision:state.strategyRevision,approvedAt:new Date().toISOString(),scope:'browser-local'};
    state.briefApproved=true;return state;
  }
  function updateContent(state,item){if(!state.briefApproved)throw Error('Conferma prima il brief');if(!String(item.title||'').trim()||!String(item.channel||'').trim())throw Error('Titolo e canale richiesti');if(item.date&&!/^\d{4}-\d{2}-\d{2}$/.test(item.date))throw Error('Data non valida');const previous=state.contents.find(x=>x.id===item.id);const content={id:item.id,title:String(item.title).trim(),channel:String(item.channel).trim(),date:item.date||'',copy:String(item.copy||''),status:'draft',strategyRevision:state.strategyRevision,needsStrategyReview:false,history:previous?[...(previous.history||[]),{revision:previous.revision,title:previous.title,copy:previous.copy,channel:previous.channel,date:previous.date,status:previous.status,strategyRevision:previous.strategyRevision}]:[],revision:previous?previous.revision+1:1};if(previous)state.contents.splice(state.contents.indexOf(previous),1,content);else state.contents.push(content);return content}
  function review(state,id,decision){const item=state.contents.find(x=>x.id===id);if(!item)throw Error('Contenuto non trovato');if(!state.briefApproved)throw Error('Brief da riconfermare');if(decision==='request'){if(!item.copy.trim())throw Error('Inserisci il testo prima della revisione');item.status='review'}else if(decision==='approve'){if(item.status!=='review')throw Error('Invia prima in revisione');item.status='approved'}else if(decision==='revise'){item.status='draft'}else throw Error('Decisione non valida');return item}
  function restore(raw,projectId){const state=JSON.parse(raw);if(state.schemaVersion!==1||String(state.projectId)!==String(projectId)||!state.brief||!Array.isArray(state.contents))throw Error('Archivio locale incompatibile');if(state.contents.some(x=>!x||!x.id||typeof x.copy!=='string'||!['draft','review','approved'].includes(x.status)))throw Error('Contenuti locali non validi');if(!state.strategyApproval||state.strategyApproval.revision!==state.strategyRevision||missing(state.brief).length){state.briefApproved=false}return state}
  const api={fields,missing,key,create,revise,approveBrief,updateContent,review,restore};if(typeof module!=='undefined')module.exports=api;else root.RadixEditorial=api;
})(typeof window==='undefined'?globalThis:window);
