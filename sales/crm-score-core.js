'use strict';
/* Contact score 0–100 from CRM data only (no model): how recently and how often we spoke, open deal
   value weighted by probability, won deals, marketing consent and decision-making role.
   Same rule everywhere (cards, segments, Sales Orbit), explained by its parts. */
(function(root){
const DAY=864e5;
const SENIOR=/\b(ceo|cfo|cmo|coo|cto|founder|fondat|titolare|amministratore|direttor|director|head|responsabile|partner|owner|presidente|socio)/i;
function score(contact,data,now=Date.now()){
 const id=contact&&contact.id;const inter=(data.interactions||[]).filter(i=>i.contact_id===id);
 const opps=(data.opportunities||[]).filter(o=>o.contact_id===id);const stages=new Map((data.stages||[]).map(s=>[s.id,s]));
 const last=Math.max(0,...inter.map(i=>Date.parse(i.occurred_at)||0));const days=last?(now-last)/DAY:Infinity;
 const recency=days<=7?30:days<=30?22:days<=90?12:days<=180?5:0;
 const recent=inter.filter(i=>now-(Date.parse(i.occurred_at)||0)<=90*DAY).length;
 const frequency=Math.min(20,recent*5);
 const open=opps.filter(o=>!o.outcome||o.outcome==='open');
 const weighted=open.reduce((s,o)=>{const p=o.probability??stages.get(o.stage_id)?.probability??20;return s+Number(o.amount_cents||0)/100*p/100},0);
 const pipeline=weighted<=0?(open.length?5:0):weighted<2000?10:weighted<10000?17:25;
 const won=Math.min(10,opps.filter(o=>o.outcome==='won').length*5);
 const consent=contact.marketing_consent?5:0;
 const role=SENIOR.test(String(contact.role||''))?10:contact.role?4:0;
 const parts={recency,frequency,pipeline,won,consent,role};
 const total=Math.min(100,Object.values(parts).reduce((a,b)=>a+b,0));
 return {total,band:total>=60?'caldo':total>=30?'tiepido':'freddo',parts,lastContactDays:Number.isFinite(days)?Math.floor(days):null};
}
function explain(s){
 const p=s.parts,out=[];
 if(p.recency)out.push(s.lastContactDays===0?'sentito oggi':'sentito '+s.lastContactDays+' giorni fa');else out.push('mai sentito di recente');
 if(p.frequency){const n=p.frequency/5;out.push(n+(n===1?' interazione':' interazioni')+' in 90 giorni'+(n===4?' o più':''))}
 if(p.pipeline)out.push('trattative aperte');if(p.won)out.push('già cliente');if(p.consent)out.push('consenso marketing');if(p.role>=10)out.push('ruolo decisionale');
 return out.join(' · ');
}
const api={score,explain};
if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixCrmScore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
