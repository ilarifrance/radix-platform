/* Regia RADIX · Command Center adapter (phase N1 demo, read-only). It reads what the page already shows (the four
   numbers, «Needs your attention», the workflow cards) and has one harmless local op: «pin» puts an item in the
   «Da guardare oggi» list of the panel, in memory only, undoable. «passa» prepares a request for the Regia of another
   area (CRM, Project manager, Piano editoriale) as a link in the panel. Nothing is saved, sent or changed on the server.
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
// The project a row of «Oggi» points to (its link carries ?project=id), so a «passa» to PM or PED can name it.
function projectIn(href){const m=/[?&]project=([^&#]+)/.exec(String(href||''));let id='';try{id=m?decodeURIComponent(m[1]):''}catch(e){id=''}return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(id)?id:''}
// The state from the page as it is rendered now (ids of control-center-v2.html); no request of its own.
function read(doc,prev){const $=id=>doc.getElementById(id);const cards=sel=>{const host=$(sel);return host?[...host.querySelectorAll('.workflow-card')]:[]};
 return {
  metrics:{projects:num(txt($('metricProjects'))),workflows:num(txt($('metricWorkflows'))),approvals:num(txt($('metricApprovals'))),agents:num(txt($('metricAgents')))},
  attention:cards('attentionList').map(c=>({title:txt(c.querySelector('.workflow-name')).replace(/^⚠\s*/,''),detail:txt(c.querySelector('.workflow-task'))})).filter(a=>a.title).slice(0,12),
  workflows:cards('workflowList').map(c=>{const st=c.querySelector('.workflow-state');return {name:txt(c.querySelector('.workflow-name')),status:statusIt(txt(st)),stuck:STUCK.test((st?st.className:'')+' '+txt(st)),task:txt(c.querySelector('.workflow-task'))}}).filter(w=>w.name).slice(0,30),
  // «Oggi» (lib/cc-brief.js): una riga per area di RADIX, già calcolata dalla pagina senza AI.
  today:(()=>{const host=$('ccBrief');return host&&!host.hidden?[...host.querySelectorAll('.cc-brief-row')].map(r=>({area:txt(r.querySelector('.cc-brief-area')),text:txt(r.querySelector('.cc-brief-text')),tone:r.dataset?r.dataset.tone||'':'',project:projectIn(r.getAttribute?r.getAttribute('href'):'')})).filter(t=>t.area&&t.text).slice(0,8):[]})(),
  pins:prev&&Array.isArray(prev.pins)?prev.pins:[],handoffs:prev&&Array.isArray(prev.handoffs)?prev.handoffs:[]}}
// A card is stuck by its state class (blocked, failed…) or its word («da approvare» has the class «blocked»).
function stuckOf(state){return (state.workflows||[]).filter(w=>w.stuck!=null?w.stuck:STUCK.test(w.status))}
// What the two operations are, for the AI (the context is where it learns their fields).
const OPS_HELP='Operazioni di questa pagina: {"op":"pin","item":"…","note":"…"} mette una voce in «Da guardare oggi»; {"op":"passa","area":"crm|pm|ped","richiesta":"…","project":"id, obbligatorio per ped"} prepara una richiesta per la Regia di quell’area (attività, scadenze e fasi nel CRM; fasi e persone nel Project manager; post nel Piano editoriale): da qui non cambia niente, la persona la apre e la conferma in quella pagina.';
function context(state){const m=state.metrics||{},s=stuckOf(state);
 return 'Command Center: '+(m.projects??'—')+' progetti, '+(m.workflows??'—')+' workflow in corso, '+(m.approvals??'—')+' approvazioni in attesa. '+
  (state.attention.length?'Da guardare: '+state.attention.map(a=>a.title+(a.detail?' ('+a.detail+')':'')).join('; ')+'. ':'Nessun elemento in «Needs your attention». ')+
  (s.length?'Fermi: '+s.map(w=>w.name+' · '+w.status+(w.task?' · '+w.task:'')).join('; ')+'.':'Nessun workflow fermo.')+
  ((state.today||[]).length?' Oggi nelle aree: '+state.today.map(t=>t.area+': '+t.text+(t.project?' [project: '+t.project+']':'')).join(' '):'')+' '+OPS_HELP}
function digest(state){const m=state.metrics||{},t=state.today||[],d={progetti:m.projects,workflowInCorso:m.workflows,approvazioni:m.approvals,attenzione:state.attention.length,fermi:stuckOf(state).length};
 if(t.length){d.areeOggi=t.length;d.areeInRitardo=t.filter(x=>x.tone==='late').length}return d}
// The areas a request can be carried to («passa»): the page whose Regia has the real operations of that area.
const AREAS=Object.freeze({crm:{title:'CRM',href:'/radix-sales.html'},pm:{title:'Project manager',href:'/radix-pm-concept.html'},ped:{title:'Piano editoriale',href:'/project-editorial.html',project:true}});
const PROJECT_ID=/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/,ASK_MAX=300;
const one=s=>String(s==null?'':s).replace(/\s+/g,' ').trim();
const areaOf=op=>{const k=one(op&&op.area).toLowerCase();return Object.prototype.hasOwnProperty.call(AREAS,k)?k:''};
function hrefOf(h){const a=AREAS[h.area];return a.href+(h.project?'?project='+encodeURIComponent(h.project):'')}
const ops={
 pin:{
  validate(op,state){const item=String(op.item||'').trim();if(!item)return 'Manca cosa mettere in «Da guardare oggi».';if(item.length>140)return 'Il testo è troppo lungo (al massimo 140 caratteri).';
   if((state.pins||[]).some(p=>p.item===item))return 'È già in «Da guardare oggi».';return true},
  preview:op=>'Metti in «Da guardare oggi»: '+String(op.item).trim()+(op.note?' · '+String(op.note).trim():''),
  copyFields:[],cost:{ai:0}},
 // «passa»: nothing changes here or on the server. After «Sì, applica» the panel lists a link per request; the link
 // opens the page of that area with the request ready in its Regia, where the person sends it and confirms the changes.
 passa:{
  validate(op,state){const k=areaOf(op),ask=one(op.richiesta),pr=one(op.project);
   if(!k)return 'Area non riconosciuta: posso portare una richiesta solo a CRM, Project manager o Piano editoriale.';
   if(!ask)return 'Manca la richiesta da portare.';if(ask.length>ASK_MAX)return 'La richiesta è troppo lunga (al massimo '+ASK_MAX+' caratteri).';
   if(pr&&!PROJECT_ID.test(pr))return 'Il progetto indicato non è valido.';if(AREAS[k].project&&!pr)return 'Per il Piano editoriale serve il progetto.';
   if((state.handoffs||[]).some(h=>h.area===k&&h.text===ask))return 'Questa richiesta è già pronta da portare.';return true},
  preview:op=>'Porta a '+AREAS[areaOf(op)].title+': «'+one(op.richiesta)+'» (la applichi lì, con la sua conferma)',
  copyFields:[],cost:{ai:0},quiet:true}
};
// Pure: a new state with the pins added; undo gives back the state before.
function apply(state,list){const before=state;const pins=(state.pins||[]).concat(list.filter(o=>o.op==='pin').map(o=>({item:String(o.item).trim(),note:String(o.note||'').trim()})));
 const handoffs=(state.handoffs||[]).concat(list.filter(o=>o.op==='passa').map(o=>({area:areaOf(o),text:one(o.richiesta),project:one(o.project)})));
 return {state:Object.assign({},state,{pins,handoffs}),undo:()=>before}}
function view(state){const pins=state.pins||[],hs=state.handoffs||[];if(!pins.length&&!hs.length)return null;
 const v={title:pins.length?'Da guardare oggi':'Da portare nelle aree',items:pins.map(p=>p.item+(p.note?' · '+p.note:''))};
 if(hs.length)v.links=hs.map(h=>({title:'Apri '+AREAS[h.area].title,quote:h.text,href:hrefOf(h),handoff:{area:h.area,text:h.text}}));return v}
// N1 only: the fixed answer of the stub AI on this page, built from the page's own data (no AI).
function sample(state){const s=stuckOf(state),first=s[0]||state.attention[0];
 return {area:'cc',summary:s.length?s.length+(s.length===1?' lavoro fermo':' lavori fermi')+': parti da «'+(first.name||first.title)+'».':'Niente di fermo: guarda le approvazioni in attesa.',
  ops:[{op:'pin',item:first?(first.name||first.title):'Approvazioni in attesa',note:first?(first.status||first.detail||''):''},
   {op:'send_reminder',to:'team',message:'Sblocca il workflow'}]}}
const adapter={title:'Command Center',pages:['cc','cc-approvals','cc-integrations','cc-projects'],shortcuts:[{label:'Cosa è fermo?',prompt:'Cosa è fermo oggi? Dimmi cosa sbloccare per primo.'},{label:'Com’è la giornata?',prompt:'Com’è la giornata? Riassumi cosa mi aspetta nelle aree e da dove partire.'}],read,context,digest,ops,apply,view,sample};
return Object.freeze({adapter,read,stuckOf,statusIt,STATUS_IT,AREAS,OPS_HELP});
});
