/* RADIX project journey — where a project stands on each step of its flow
   (brief, piano editoriale, incarichi, attività, agenti), computed from the saved module documents.
   Pure (no DOM, no I/O): the registry API and the pages share it. */
(function(root,factory){
 const api=factory(typeof module==='object'&&module.exports?require('../editorial-core.js'):root.RadixEditorial);
 if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixJourney=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(editorial){
'use strict';
// todo: nothing yet · active: work in progress · waiting: a person must review or approve · done: complete.
const STATES=['todo','active','waiting','done'];
const STEPS=[
 {id:'brief',label:'Brief e strategia',module:'editorial'},
 {id:'ped',label:'Piano editoriale',module:'editorial'},
 {id:'tasks',label:'Incarichi',module:'agency-workspace'},
 {id:'pm',label:'Attività',module:'pm'},
 {id:'agents',label:'Agenti AI',module:'agents'}
];
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const arr=v=>Array.isArray(v)?v:[];
const n=(k,one,many)=>k+' '+(k===1?one:many);

function strategyApproved(e){
 const a=obj(e.strategyApproval);
 return !!(e.briefApproved&&a.revision===e.strategyRevision);
}
function brief(e){
 if(!e)return {state:'todo',detail:'Brief non ancora compilato'};
 if(strategyApproved(e))return {state:'done',detail:'Strategia approvata'};
 const missing=editorial&&editorial.missing?editorial.missing(obj(e.brief)).length:0;
 if(missing)return {state:'active',detail:n(missing,'campo da completare','campi da completare')};
 return {state:'waiting',detail:'Strategia da approvare'};
}
function ped(e){
 const contents=e?arr(e.contents).filter(c=>c&&typeof c==='object'):[];
 if(!contents.length)return {state:'todo',detail:'Nessun contenuto nel piano',total:0,done:0};
 const approved=contents.filter(c=>c.status==='approved').length,review=contents.filter(c=>c.status==='review').length;
 let planOk=false;
 try{planOk=!!(editorial&&editorial.isPlanApproved&&strategyApproved(e)&&editorial.isPlanApproved(e))}catch(err){planOk=false}
 const base={total:contents.length,done:approved};
 if(planOk)return {...base,state:'done',detail:'Piano approvato · '+n(contents.length,'contenuto','contenuti')};
 if(review)return {...base,state:'waiting',detail:n(review,'contenuto da approvare','contenuti da approvare')};
 return {...base,state:'active',detail:n(contents.length,'contenuto','contenuti')+' · piano da approvare'};
}
// Agency tasks: a finished draft ('done') waits for a person; 'approved' closes it.
function tasks(w){
 const list=w?arr(w.tasks).filter(t=>t&&typeof t==='object'):[];
 if(!list.length)return {state:'todo',detail:'Nessun incarico',total:0,done:0};
 const approved=list.filter(t=>t.status==='approved').length,drafts=list.filter(t=>t.status==='done').length,errors=list.filter(t=>t.status==='error').length;
 const base={total:list.length,done:approved};
 if(approved===list.length)return {...base,state:'done',detail:'Tutti gli incarichi approvati'};
 if(drafts)return {...base,state:'waiting',detail:n(drafts,'bozza da approvare','bozze da approvare')};
 if(errors)return {...base,state:'waiting',detail:n(errors,'incarico in errore','incarichi in errore')};
 return {...base,state:'active',detail:approved+' di '+list.length+' approvati'};
}
// Synthetic demo projects inside a PM plan are not real work.
function pm(p){
 const synthetic=new Set(arr(p&&p.projects).filter(x=>x&&x.synthetic).map(x=>x.id));
 const list=p?arr(p.tasks).filter(t=>t&&typeof t==='object'&&!synthetic.has(t.project)):[];
 if(!list.length)return {state:'todo',detail:'Nessuna attività pianificata',total:0,done:0};
 const done=list.filter(t=>t.status==='Completato').length,review=list.filter(t=>t.status==='In revisione').length;
 const base={total:list.length,done};
 if(done===list.length)return {...base,state:'done',detail:'Tutte le attività completate'};
 if(review)return {...base,state:'waiting',detail:n(review,'attività in revisione','attività in revisione')};
 if(list.some(t=>t.status!=='Da fare'))return {...base,state:'active',detail:done+' di '+list.length+' completate'};
 return {...base,state:'todo',detail:n(list.length,'attività da avviare','attività da avviare')};
}
// Agents are a working space, not a phase that closes: used or not yet used.
function agents(a){
 const conv=obj(a&&a.conversations),used=Object.keys(conv).filter(k=>arr(conv[k]).length);
 if(!used.length)return {state:'todo',detail:'Nessuna conversazione'};
 const messages=used.reduce((s,k)=>s+arr(conv[k]).length,0);
 return {state:'active',detail:n(used.length,'agente coinvolto','agenti coinvolti')+' · '+n(messages,'messaggio','messaggi')};
}
const RULES={brief:d=>brief(d.editorial),ped:d=>ped(d.editorial),tasks:d=>tasks(d['agency-workspace']),pm:d=>pm(d.pm),agents:d=>agents(d.agents)};

// docs: {module: data} for one project. Returns per-step state plus the step to work on next.
function journey(docs){
 const d=obj(docs);
 const steps=STEPS.map(s=>{let r;try{r=RULES[s.id](d)}catch(e){r={state:'todo',detail:'Dati non leggibili'}}return {id:s.id,label:s.label,module:s.module,...r}});
 const phases=steps.filter(s=>s.id!=='agents');
 const done=phases.filter(s=>s.state==='done').length;
 const next=phases.find(s=>s.state==='waiting')||phases.find(s=>s.state==='active')||phases.find(s=>s.state!=='done')||null;
 return {steps,done,total:phases.length,progress:Math.round(done/phases.length*100),next:next?next.id:null,waiting:phases.filter(s=>s.state==='waiting').map(s=>s.id)};
}
return {STATES,STEPS,journey,strategyApproved};
});
