/* Regia RADIX · Piano editoriale adapter. Thin glue around lib/ped-regia-core.js (numbers, proposal checks, apply,
   undo): the panel and the chat are the common Regia (lib/radix-regia.js). The plan changes only on «Sì, applica»,
   through editorial-core and the page's own save (window.RadixPedPage); sending to Buffer and paid generations stay
   on the post's own buttons. UMD: registers itself with RadixRegiaCore in the browser; Node gets the adapter. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else{root.RadixRegiaPed=api;if(root.RadixRegiaCore)root.RadixRegiaCore.register('ped',api.adapter)}})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const rg=()=>root.RadixPedRegia||(typeof require==='function'?require('./ped-regia-core.js'):null);
const ed=()=>root.RadixEditorial||(typeof require==='function'?require('../editorial-core.js'):null);
const page=()=>root.RadixPedPage||null;
const when=(d,t)=>d?d.split('-').reverse().join('/')+(t?' '+t:''):'senza data';
// A post on Buffer, already out or published by hand is not changed from here.
function isOut(c){const p=page();return !!(p&&(p.isOut(c)||p.queued(c.id)))||!!(c&&c.publication&&c.publication.service)}
const todayOf=()=>{const p=page();return p?p.today():new Date().toISOString().slice(0,10)};
const plus=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const mondayAfter=d=>{const w=new Date(d+'T12:00:00Z').getUTCDay();return plus(d,((8-w)%7)||7)};

// The page's live plan: the panel reads it again before every question.
function read(){const p=page();return p&&p.state()||{contents:[]}}
// Compact page summary for the AI: upcoming posts with their ids (the ops name them), what waits for approval,
// and next week's free slots in the plan's own rhythm.
function context(state,opts){const o=opts||{},today=o.today||todayOf(),list=(state.contents||[]);
 const next=list.filter(c=>c.date&&c.date>=today).sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||''))).slice(0,15);
 const review=list.filter(c=>c.date&&c.date>=today&&c.status==='review').length,draft=list.filter(c=>c.date&&c.date>=today&&c.status==='draft').length;
 const R=rg(),start=mondayAfter(today),slots=R.weekSlots(state,{start,rhythm:R.rhythmOf(state,{today})});
 return 'Piano editoriale: '+list.length+' contenuti, canali '+(R.planChannels(state).join(', ')||'nessuno')+'. Oggi '+when(today)+'. '+
  (review||draft?'Da approvare '+review+', in bozza '+draft+'. ':'Nessun post in attesa di approvazione. ')+
  (next.length?'Prossimi: '+next.map(c=>when(c.date,c.time)+' '+c.channel+' «'+String(c.title||'').slice(0,60)+'» ['+(isOut(c)?'su Buffer':c.status)+'] id '+c.id).join('; ')+'. ':'Nessun post in calendario. ')+
  (slots.length?'Spazi liberi settimana del '+when(start)+': '+slots.map(s=>when(s.date,s.time)+' '+s.channel).join('; ')+'.':'')}
function digest(state){const R=rg();return R.digestText(R.statsDigest(state,{today:todayOf(),kindOf:root.RadixPedViews&&root.RadixPedViews.mediaKind}))}
// The real numbers, shown in the panel without any AI call.
function view(state){const R=rg();if(!state||!(state.contents||[]).length)return null;
 return {title:'Com’è andata · ultimi 30 giorni',items:R.digestText(R.statsDigest(state,{today:todayOf(),kindOf:root.RadixPedViews&&root.RadixPedViews.mediaKind})).split('\n').map(s=>s.replace(/^- /,'').trim()).filter(s=>s&&!/:$/.test(s))}}

// Every op is checked as a whole proposal by ped-regia-core (dates, channels, one change per post, fact check).
const OPS=['add','move','rewrite','remove','frequency'];
const ops={};for(const name of OPS)ops[name]={validate:()=>true,cost:{ai:0},copyFields:name==='add'?['title','copy','script']:name==='rewrite'?['copy']:[]};
function validate(proposal,state){const p=page(),v=rg().validateProposal(proposal,state,{today:todayOf(),isOut,sources:p?p.sources():undefined,personal:!!(p&&p.personal())});
 return {ops:v.ops||[],rejected:(v.rejected||[]).map(r=>({op:{op:r.op,title:r.title||''},reason:r.reason})).concat(v.error?[{op:{op:'?'},reason:v.error}]:[])}}
function preview(op){const t=rg().opText(op),L=rg().OP_LABELS[op.op];return (L?L+': ':'')+t+(op.gaps&&op.gaps.length?' · da completare: '+op.gaps.join(', '):'')+(op.warnings&&op.warnings.length?' · '+op.warnings.join(' · '):'')}
// Applies through editorial-core with history; changed and new posts go back to review; one save of the page.
function apply(state,list){const p=page();if(p&&p.busy())throw new Error('Attendi la fine del lavoro in corso.');
 const out=rg().applyProposal(state,{summary:'',ops:list},{core:ed(),newId:()=>root.crypto&&root.crypto.randomUUID?root.crypto.randomUUID():'r'+Date.now().toString(36)+Math.random().toString(36).slice(2,8)});
 if(out.failed.length&&!out.changed.length)throw new Error(out.failed.join(' · '));
 const n=out.changed.length;if(p&&n){p.persist('Regia: '+n+(n===1?' post cambiato':' post cambiati')+' · rileggili e approvali nel piano.');p.renderPed()}
 return {state,changed:out.changed,failed:out.failed,undo(){const q=page();if(q&&q.busy())throw new Error('Attendi la fine del lavoro in corso.');
  const u=rg().undoLast(state,{core:ed()});if(q){q.persist('Regia: ultima proposta annullata.');q.renderPed()}if(u.failed.length)throw new Error('non riuscito: '+u.failed.join(' · '));return state}}}

const shortcuts=[
 {label:'Com’è andata?',prompt:'Com’è andata? Leggi i numeri dei post pubblicati e dimmi cosa funziona e cosa no, per canale.'},
 {label:'Prepara la prossima settimana',prompt:'Prepara i post della prossima settimana negli spazi liberi del piano, con i soli fatti del cliente. Proponi le modifiche.'},
 {label:'Cosa devo approvare?',prompt:'Quali post devo ancora approvare, in ordine di data? Se qualcuno è debole proponi come riscriverlo.'}];
const adapter={title:'Piano editoriale',pages:['agency-ped'],shortcuts,read,context,digest,view,ops,validate,preview,apply};
return Object.freeze({adapter,isOut,context,mondayAfter});
});
