'use strict';
/* «Personalizza pipeline» (sales-pipeline-premium.html): a pipeline is a sales process (sales_processes, kind opportunity)
   and its columns are its stages (sales_stages). Pure rules, no DOM: from the columns as edited to the ordered commands
   for /api/sales. Positions are unique per pipeline (UNIQUE workspace_id,process_id,position), so columns that move
   first park on free positions above every current one, then take their final place. */
(function(root){
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const PARK=9000; // positions are 0–10000; columns that move wait at 9000+ while the others settle.
const TEMPLATE=['Nuovo contatto','Qualificato','Proposta inviata','Negoziazione'];
function probability(v){const s=String(v??'').trim();if(!s)return null;if(!/^\d{1,3}$/.test(s)||Number(s)>100)return NaN;return Number(s)}
/* current: the pipeline's stages as stored [{id,title,position,probability}]; draft: the edited columns in order
   [{id?,title,probability}] (no id = new column); deals: opportunities, to refuse removing a column that still holds some.
   → {error} or {steps:[{op:'delete'|'update'|'create', id?, data}]}. Steps are in run order; update data has no id/version. */
function plan(current,draft,deals){
 const cur=(current||[]).filter(Boolean),list=(draft||[]).filter(Boolean),byId=new Map(cur.map(s=>[s.id,s]));
 if(!list.length)return {error:'Una pipeline ha almeno una colonna.'};
 if(list.length>50)return {error:'Massimo 50 colonne per pipeline.'};
 const names=new Set();
 for(const [i,c] of list.entries()){const t=clean(c.title);if(!t)return {error:'La colonna '+(i+1)+' non ha un nome.'};if(t.length>200)return {error:'Il nome della colonna '+(i+1)+' supera 200 caratteri.'};
  const k=t.toLocaleLowerCase('it');if(names.has(k))return {error:'Due colonne si chiamano «'+t+'»: usa nomi diversi.'};names.add(k);
  if(Number.isNaN(probability(c.probability)))return {error:'Probabilità della colonna «'+t+'»: un numero da 0 a 100, oppure vuoto.'};
  if(c.id&&!byId.has(c.id))return {error:'La colonna «'+t+'» non è più nell’archivio: premi Aggiorna e riprova.'}}
 const kept=new Set(list.filter(c=>c.id).map(c=>c.id)),steps=[];
 for(const s of cur)if(!kept.has(s.id)){const n=(deals||[]).filter(d=>d&&d.stage_id===s.id).length;
  if(n)return {error:'La colonna «'+clean(s.title)+'» contiene '+n+(n===1?' opportunità':' opportunità')+': spostale in un’altra colonna prima di toglierla.'};
  steps.push({op:'delete',id:s.id})}
 const moving=list.map((c,i)=>({c,i})).filter(({c,i})=>c.id&&Number(byId.get(c.id).position)!==i);
 // Park only when a final position is still taken by another kept column; otherwise move straight there.
 const taken=new Set(cur.filter(s=>kept.has(s.id)).map(s=>Number(s.position)));
 const park=moving.some(({c,i})=>taken.has(i)&&cur.find(s=>s.id!==c.id&&kept.has(s.id)&&Number(s.position)===i));
 if(park)moving.forEach(({c},k)=>steps.push({op:'update',id:c.id,data:{position:PARK+k}}));
 for(const [i,c] of list.entries()){if(!c.id)continue;const s=byId.get(c.id),data={},t=clean(c.title),p=probability(c.probability);
  if(t!==clean(s.title))data.title=t;if(Number(s.position)!==i)data.position=i;if(p!==(s.probability==null||s.probability===''?null:Number(s.probability)))data.probability=p;
  if(Object.keys(data).length)steps.push({op:'update',id:c.id,data})}
 for(const [i,c] of list.entries())if(!c.id){const data={title:clean(c.title),position:i},p=probability(c.probability);if(p!=null)data.probability=p;steps.push({op:'create',data})}
 return {steps};
}
function pipelineName(title,processes,selfId){const t=clean(title);if(!t)return {error:'Dai un nome alla pipeline.'};if(t.length>200)return {error:'Il nome della pipeline supera 200 caratteri.'};
 if((processes||[]).some(p=>p&&p.id!==selfId&&p.kind==='opportunity'&&clean(p.title).toLocaleLowerCase('it')===t.toLocaleLowerCase('it')))return {error:'Esiste già una pipeline «'+t+'».'};return {title:t}}
const api={plan,pipelineName,probability,TEMPLATE,PARK};
if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixPipelineSetup=api;
})(typeof globalThis!=='undefined'?globalThis:this);
