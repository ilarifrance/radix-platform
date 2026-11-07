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
// An Agency project keeps its brief in the agency-workspace document until a PED exists.
function agencyBrief(w){
 const b=obj(w&&w.brief);
 return !!(String(b.name||'').trim()&&String(b.goal||'').trim()&&String(b.audience||'').trim());
}
function brief(e,w){
 if(!e)return agencyBrief(w)?{state:'done',detail:'Brief compilato in Agency'}:{state:'todo',detail:'Brief non ancora compilato'};
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
// The PM document bound to a registry project is that project's real plan. pm-demo marks every
// plan project synthetic:true (a legacy label of its validator), so the flag must not hide tasks here.
function pm(p){
 const list=p?arr(p.tasks).filter(t=>t&&typeof t==='object'):[];
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
 return {state:'active',detail:n(used.length,'agente coinvolto','agenti coinvolti')+' · '+n(messages,'messaggio','messaggi'),agents:used};
}
// The agency flow (Brief → Ricerca → Strategia → Approvazione → PED → Produzione → Revisione → Pubblicazione → Risultati).
// Agency plan tasks keep their planner ids (brief, research, strategy, produce-*, review, distribution, measurement).
const PHASES=[
 {id:'brief',label:'Brief'},{id:'research',label:'Ricerca'},{id:'strategy',label:'Strategia'},
 {id:'strategy-approval',label:'Approvazione strategia'},{id:'ped',label:'PED'},{id:'production',label:'Produzione'},
 {id:'review',label:'Revisione'},{id:'publishing',label:'Pubblicazione'},{id:'results',label:'Risultati'}
];
const TASK_STATE={approved:'done',done:'waiting',error:'waiting',running:'active',changes_requested:'active'};
function taskPhase(list,todo){
 if(!list.length)return null;
 const states=list.map(t=>TASK_STATE[t.status]||'todo');
 const approved=states.filter(x=>x==='done').length,drafts=list.filter(t=>t.status==='done').length,errors=list.filter(t=>t.status==='error').length;
 const base={total:list.length,done:approved};
 if(approved===list.length)return {...base,state:'done',detail:list.length>1?'Tutti approvati':'Approvato'};
 if(drafts)return {...base,state:'waiting',detail:n(drafts,'bozza da approvare','bozze da approvare')};
 if(errors)return {...base,state:'waiting',detail:n(errors,'lavoro in errore','lavori in errore')};
 if(states.includes('active'))return {...base,state:'active',detail:list.length>1?approved+' di '+list.length+' approvati':'In lavorazione'};
 return {...base,state:'todo',detail:todo};
}
function phases(d,pubs){
 const e=d.editorial,w=d['agency-workspace'],list=w?arr(w.tasks).filter(t=>t&&typeof t==='object'):[];
 const byId=id=>list.filter(t=>t.id===id),contents=e?arr(e.contents).filter(c=>c&&typeof c==='object'):[];
 const strategyOk=!!(e&&strategyApproved(e));
 const out={};
 out.brief=taskPhase(byId('brief'),'Brief da validare')||brief(e,w);
 out.research=taskPhase(byId('research'),'Ricerca da avviare')||{state:'todo',detail:'Ricerca da avviare'};
 const strat=byId('strategy');
 out.strategy=strategyOk?{state:'done',detail:'Strategia approvata'}:taskPhase(strat,'Strategia da preparare')||{state:'todo',detail:'Strategia da preparare'};
 if(strategyOk||(strat.length&&strat.every(t=>t.status==='approved')))out['strategy-approval']={state:'done',detail:'Approvata'};
 else if(out.strategy.state==='waiting'||(e&&brief(e).state==='waiting'))out['strategy-approval']={state:'waiting',detail:'Strategia da approvare'};
 else out['strategy-approval']={state:'todo',detail:'In attesa della strategia'};
 out.ped=ped(e);
 // Production: agency channel tasks plus PED contents still in draft.
 const prod=taskPhase(list.filter(t=>/^produce-/.test(String(t.id))),'Produzione da avviare');
 const drafts=contents.filter(c=>c.status==='draft').length;
 out.production=prod&&prod.state!=='todo'?prod:drafts?{state:'active',detail:n(drafts,'contenuto in bozza','contenuti in bozza')}:prod||{state:contents.length?'done':'todo',detail:contents.length?'Nessuna bozza aperta':'Nessun contenuto da produrre'};
 const inReview=contents.filter(c=>c.status==='review').length;
 const rev=taskPhase(byId('review'),'Revisione da avviare');
 out.review=inReview?{state:'waiting',detail:n(inReview,'contenuto da approvare','contenuti da approvare')}:rev||(contents.length&&contents.every(c=>c.status==='approved')?{state:'done',detail:'Tutti i contenuti approvati'}:{state:'todo',detail:'Niente in revisione'});
 // Publishing: approved contents vs. their queued Buffer publications.
 const approved=contents.filter(c=>c.status==='approved'),p=arr(pubs);
 const queued=new Set(p.filter(x=>x.status==='queued').map(x=>String(x.content_id))),failed=p.filter(x=>x.status==='failed').length;
 const out_=approved.filter(c=>queued.has(String(c.id))).length;
 if(failed)out.publishing={state:'waiting',detail:n(failed,'pubblicazione non riuscita','pubblicazioni non riuscite'),total:approved.length,done:out_};
 else if(approved.length&&out_===approved.length)out.publishing={state:'done',detail:n(out_,'contenuto in coda','contenuti in coda'),total:approved.length,done:out_};
 else if(out_)out.publishing={state:'active',detail:out_+' di '+approved.length+' in coda',total:approved.length,done:out_};
 else out.publishing={state:'todo',detail:approved.length?n(approved.length,'contenuto da programmare','contenuti da programmare'):'Nessun contenuto approvato',total:approved.length,done:0};
 out.results=taskPhase(byId('measurement'),'Metriche da raccogliere')||{state:'todo',detail:'Metriche da raccogliere'};
 return PHASES.map(ph=>({id:ph.id,label:ph.label,...out[ph.id],...who(ph.id,out[ph.id]&&out[ph.id].state)}));
}
// Who moves each phase forward and how, so the automation is visible: 'ai' = RADIX does it (on its own or after one
// click), 'you' = a person must look and decide. where: the page that does it (workspace = Agency workspace, ped = PED).
const WHO={
 brief:{where:'workspace',todo:['you','Completa il brief del progetto'],waiting:['you','Approva il brief']},
 research:{where:'workspace',todo:['ai','Parte da sola con l’avvio automatico degli incarichi'],waiting:['you','Leggi e approva la ricerca']},
 strategy:{where:'workspace',todo:['ai','L’AI la prepara dopo brief e ricerca'],waiting:['you','Leggi e approva la strategia']},
 'strategy-approval':{where:'workspace',todo:['you','Approverai la strategia quando è pronta'],waiting:['you','Approva la strategia']},
 ped:{where:'ped',todo:['ai','Un clic e l’AI propone il calendario dei post'],waiting:['you','Approva il calendario']},
 production:{where:'ped',todo:['ai','«Scrivi tutto»: l’AI scrive testi e grafiche di ogni post'],waiting:['you','Controlla i lavori in errore']},
 review:{where:'ped',todo:['you','Rivedrai le anteprime dei post'],waiting:['you','Rivedi le anteprime e approva i post']},
 publishing:{where:'ped',todo:['you','«Programma su Buffer» mette in coda i post approvati'],waiting:['you','Sistema le pubblicazioni non riuscite']},
 results:{where:'workspace',todo:['ai','L’AI raccoglie le metriche dopo la pubblicazione'],waiting:['you','Approva il report dei risultati']}
};
function who(id,state){const w=WHO[id];if(!w)return {};
 if(state==='done')return {actor:'done',action:'Fatto',where:w.where};
 if(state==='active')return {actor:'ai',action:'RADIX ci sta lavorando',where:w.where};
 const [actor,action]=w[state==='waiting'?'waiting':'todo'];return {actor,action,where:w.where}}
// The one thing to do now: the first phase waiting for a person, else the first one not done.
function now(phases){const list=arr(phases);return list.find(p=>p.state==='waiting')||list.find(p=>p.state!=='done')||null}
const RULES={brief:d=>brief(d.editorial,d['agency-workspace']),ped:d=>ped(d.editorial),tasks:d=>tasks(d['agency-workspace']),pm:d=>pm(d.pm),agents:d=>agents(d.agents)};

// docs: {module: data} for one project. Returns per-step state plus the step to work on next.
// extra.publications: rx_publications rows ({content_id,status}) for the project.
function journey(docs,extra){
 const d=obj(docs);
 const steps=STEPS.map(s=>{let r;try{r=RULES[s.id](d)}catch(e){r={state:'todo',detail:'Dati non leggibili'}}return {id:s.id,label:s.label,module:s.module,...r}});
 const core=steps.filter(s=>s.id!=='agents');
 const done=core.filter(s=>s.state==='done').length;
 const next=core.find(s=>s.state==='waiting')||core.find(s=>s.state==='active')||core.find(s=>s.state!=='done')||null;
 let flow;try{flow=phases(d,obj(extra).publications)}catch(e){flow=PHASES.map(ph=>({id:ph.id,label:ph.label,state:'todo',detail:'Dati non leggibili'}))}
 return {steps,done,total:core.length,progress:Math.round(done/core.length*100),next:next?next.id:null,waiting:core.filter(s=>s.state==='waiting').map(s=>s.id),phases:flow};
}
return {STATES,STEPS,PHASES,journey,strategyApproved,who,now};
});
