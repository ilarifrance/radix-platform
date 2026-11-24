/* Regia RADIX · Command Center adapter (phase N1 demo, read-only). It reads what the page already shows (the four
   numbers, «Needs your attention», the workflow cards) and has one harmless local op: «pin» puts an item in the
   «Da guardare oggi» list of the panel, in memory only, undoable. Nothing is saved, sent or changed on the server.
   UMD: registers itself with RadixRegiaCore in the browser; Node gets the adapter for the tests. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.RadixRegiaCC=api;if(root.RadixRegiaCore)root.RadixRegiaCore.register('cc',api.adapter)}})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
// Workflow states that mean «fermo»: waiting on someone or broken.
const STUCK=/(block|bloccat|fail|error|errore|stall|ferm|paus|wait|attesa|needs|pending)/i;
// The workflow states as the page writes them (English codes of the saved workflows) in Italian, for the panel and
// for the AI context; a word already in Italian («da approvare», «in corso») stays as it is.
const STATUS_IT=Object.freeze({blocked:'bloccato',error:'errore',failed:'non riuscito',failure:'non riuscito',running:'in corso',active:'in corso',
 in_progress:'in corso',pending:'in attesa',waiting:'in attesa',queued:'in coda',paused:'in pausa',stale:'fermo da tempo',stalled:'fermo',
 done:'completato',completed:'completato',success:'completato',todo:'da fare',needs_approval:'da approvare',needs_review:'da rivedere',
 cancelled:'annullato',canceled:'annullato',idle:'inattivo',draft:'bozza',review:'in revisione',approved:'approvato'});
function statusIt(s){const raw=String(s||'').trim(),k=raw.toLowerCase().replace(/[\s-]+/g,'_');return Object.prototype.hasOwnProperty.call(STATUS_IT,k)?STATUS_IT[k]:raw}
const txt=n=>n?String(n.textContent||'').replace(/\s+/g,' ').trim():'';
const num=s=>{const n=parseInt(String(s).replace(/[^\d-]/g,''),10);return Number.isFinite(n)?n:null};
// The state from the page as it is rendered now (ids of control-center-v2.html); no request of its own.
function read(doc,prev){const $=id=>doc.getElementById(id);const cards=sel=>{const host=$(sel);return host?[...host.querySelectorAll('.workflow-card')]:[]};
 return {
  metrics:{projects:num(txt($('metricProjects'))),workflows:num(txt($('metricWorkflows'))),approvals:num(txt($('metricApprovals'))),agents:num(txt($('metricAgents')))},
  attention:cards('attentionList').map(c=>({title:txt(c.querySelector('.workflow-name')).replace(/^⚠\s*/,''),detail:txt(c.querySelector('.workflow-task'))})).filter(a=>a.title).slice(0,12),
  workflows:cards('workflowList').map(c=>{const st=c.querySelector('.workflow-state');return {name:txt(c.querySelector('.workflow-name')),status:statusIt(txt(st)),stuck:STUCK.test((st?st.className:'')+' '+txt(st)),task:txt(c.querySelector('.workflow-task'))}}).filter(w=>w.name).slice(0,30),
  pins:prev&&Array.isArray(prev.pins)?prev.pins:[]}}
// A card is stuck by its state class (blocked, failed…) or its word («da approvare» has the class «blocked»).
function stuckOf(state){return (state.workflows||[]).filter(w=>w.stuck!=null?w.stuck:STUCK.test(w.status))}
function context(state){const m=state.metrics||{},s=stuckOf(state);
 return 'Command Center: '+(m.projects??'—')+' progetti, '+(m.workflows??'—')+' workflow in corso, '+(m.approvals??'—')+' approvazioni in attesa. '+
  (state.attention.length?'Da guardare: '+state.attention.map(a=>a.title+(a.detail?' ('+a.detail+')':'')).join('; ')+'. ':'Nessun elemento in «Needs your attention». ')+
  (s.length?'Fermi: '+s.map(w=>w.name+' · '+w.status+(w.task?' · '+w.task:'')).join('; ')+'.':'Nessun workflow fermo.')}
function digest(state){const m=state.metrics||{};return {progetti:m.projects,workflowInCorso:m.workflows,approvazioni:m.approvals,attenzione:state.attention.length,fermi:stuckOf(state).length}}
const ops={
 pin:{
  validate(op,state){const item=String(op.item||'').trim();if(!item)return 'Manca cosa mettere in «Da guardare oggi».';if(item.length>140)return 'Il testo è troppo lungo (al massimo 140 caratteri).';
   if((state.pins||[]).some(p=>p.item===item))return 'È già in «Da guardare oggi».';return true},
  preview:op=>'Metti in «Da guardare oggi»: '+String(op.item).trim()+(op.note?' · '+String(op.note).trim():''),
  copyFields:[],cost:{ai:0}}
};
// Pure: a new state with the pins added; undo gives back the state before.
function apply(state,list){const before=state;const pins=(state.pins||[]).concat(list.filter(o=>o.op==='pin').map(o=>({item:String(o.item).trim(),note:String(o.note||'').trim()})));
 return {state:Object.assign({},state,{pins}),undo:()=>before}}
function view(state){return (state.pins||[]).length?{title:'Da guardare oggi',items:state.pins.map(p=>p.item+(p.note?' · '+p.note:''))}:null}
// N1 only: the fixed answer of the stub AI on this page, built from the page's own data (no AI).
function sample(state){const s=stuckOf(state),first=s[0]||state.attention[0];
 return {area:'cc',summary:s.length?s.length+(s.length===1?' lavoro fermo':' lavori fermi')+': parti da «'+(first.name||first.title)+'».':'Niente di fermo: guarda le approvazioni in attesa.',
  ops:[{op:'pin',item:first?(first.name||first.title):'Approvazioni in attesa',note:first?(first.status||first.detail||''):''},
   {op:'send_reminder',to:'team',message:'Sblocca il workflow'}]}}
const adapter={title:'Command Center',pages:['cc','cc-approvals','cc-integrations','cc-projects'],shortcuts:[{label:'Cosa è fermo?',prompt:'Cosa è fermo oggi? Dimmi cosa sbloccare per primo.'}],read,context,digest,ops,apply,view,sample};
return Object.freeze({adapter,read,stuckOf,statusIt,STATUS_IT});
});
