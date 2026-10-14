'use strict';
(function(root){
 const STAGES=Object.freeze(['contacted','replied','meeting','won','lost']);
 const levels={contacted:1,replied:2,meeting:3,won:4,lost:0};
 function summarize(events){
  const state=new Map();
  for(const row of events||[]){
   if(!row||!Number.isInteger(row.index)||row.index<0||!STAGES.includes(row.stage))continue;
   const prior=state.get(row.index)||{level:0,latest:''};
   state.set(row.index,{level:Math.max(prior.level,levels[row.stage]),latest:row.stage});
  }
  const out={contacted:0,replied:0,meeting:0,won:0,lost:0};
  for(const {level,latest} of state.values()){
   if(level>=1)out.contacted++;
   if(level>=2)out.replied++;
   if(level>=3)out.meeting++;
   if(latest==='won')out.won++;
   if(latest==='lost')out.lost++;
  }
  return out;
 }
 const api={summarize,STAGES};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 root.RadixLeadOutcomes=api;
})(typeof window!=='undefined'?window:globalThis);
