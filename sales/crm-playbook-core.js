'use strict';
/* Sales playbook per stage: fixed, rule-based steps (not AI) matched on the stage title, e.g. a
   «Proposta» stage gets «Invia la proposta», a call on objections and a written follow-up.
   planPlaybook() returns the tasks still missing on an opportunity; crm-tools.js shows them on the
   opportunity card and creates them after one confirmation, through the normal /api/sales commands. */
(function(root){
const DAY=864e5;
const PLAYBOOKS=Object.freeze([
 {id:'nuovo',match:/lead|nuov|primo contatto|prospect/,name:'Primo contatto',steps:[{day:0,title:'Telefonata di scoperta con il referente'},{day:1,title:'Verifica budget, decisore e tempi'},{day:2,title:'Registra i bisogni emersi nelle note'}]},
 {id:'qualifica',match:/qualific|scoperta|analisi|incontro|demo/,name:'Qualifica',steps:[{day:1,title:'Mappa chi decide e chi influenza la scelta'},{day:3,title:'Fissa l’incontro o la demo'},{day:3,title:'Aggiorna valore e data di chiusura prevista'}]},
 {id:'proposta',match:/propost|offert|preventiv/,name:'Proposta',steps:[{day:0,title:'Invia la proposta con prezzo e tempi'},{day:3,title:'Telefonata per raccogliere le obiezioni'},{day:7,title:'Follow-up scritto sulla proposta'}]},
 {id:'trattativa',match:/trattativ|negozia|contratt/,name:'Trattativa',steps:[{day:1,title:'Concorda le condizioni finali con chi decide'},{day:3,title:'Prepara il contratto'},{day:5,title:'Conferma la data della firma'}]},
 {id:'vinto',match:/vint|chius|clien|firmat/,name:'Cliente acquisito',steps:[{day:1,title:'Avvia il progetto: incontro di partenza'},{day:30,title:'Chiedi una referenza o una recensione'}]}
]);
const GENERIC=Object.freeze({id:'generico',name:'Passi base',steps:[{day:0,title:'Aggiorna fase, valore e data di chiusura'},{day:3,title:'Prossimo contatto con il referente'}]});
const low=s=>String(s||'').toLocaleLowerCase('it');
function playbookFor(stage){const t=low(stage&&stage.title);return PLAYBOOKS.find(p=>p.match.test(t))||GENERIC}
const tag=p=>'[Playbook '+p.name+']';
// Pure: the playbook of the opportunity's stage, each step marked done when a task with the same
// title already exists on the opportunity (any status), and the tasks to create for the others.
function planPlaybook(opp,stages,tasks,opts){
 const stage=(stages||[]).find(s=>s&&s.id===opp.stage_id),p=playbookFor(stage),prefix=tag(p)+' ';
 const have=new Set((tasks||[]).filter(t=>t&&t.opportunity_id===opp.id).map(t=>String(t.title)));
 const start=new Date((opts&&opts.now)||Date.now());start.setUTCHours(9,0,0,0);
 const steps=p.steps.map(s=>{const title=(prefix+s.title).slice(0,200);return {...s,title,done:have.has(title)}});
 const create=steps.filter(s=>!s.done).map(s=>({title:s.title,opportunity_id:opp.id,company_id:opp.company_id||null,contact_id:opp.contact_id||null,assignee_id:opp.owner_id||(opts&&opts.assignee)||null,priority:'normal',status:'todo',due_at:new Date(start.getTime()+(s.day||0)*DAY).toISOString().slice(0,19)+'Z'}));
 return {playbook:p,stage:stage||null,steps,create};
}
const core={PLAYBOOKS,GENERIC,playbookFor,planPlaybook};
if(typeof module==='object'&&module.exports)module.exports=core;
root.RadixCrmPlaybook=core;
})(typeof globalThis!=='undefined'?globalThis:this);
