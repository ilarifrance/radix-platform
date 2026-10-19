'use strict';
(function(root){
 const STAGES=Object.freeze(['contacted','replied','meeting','won','lost']);
 function summarize(events){
  const state=new Map();
  for(const row of events||[]){
   if(!row||!Number.isInteger(row.index)||row.index<0||!STAGES.includes(row.stage)||row.voidedAt)continue;
   const prior=state.get(row.index)||{observed:new Set(),latest:''};
   prior.observed.add(row.stage);prior.latest=row.stage;state.set(row.index,prior);
  }
  const out={contacted:0,replied:0,meeting:0,won:0,lost:0};
  for(const {observed,latest} of state.values()){
   for(const stage of ['contacted','replied','meeting'])if(observed.has(stage))out[stage]++;
   if(latest==='won')out.won++;
   if(latest==='lost')out.lost++;
  }
  return out;
 }
 const api={summarize,STAGES};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.RadixLeadOutcomes=api;
})(typeof window!=='undefined'?window:globalThis);
