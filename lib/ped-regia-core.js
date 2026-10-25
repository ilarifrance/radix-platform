/* RADIX PED «Regia del piano» — pure logic, shared by the panel (lib/ped-regia.js) and the tests.
   statsDigest: real numbers only, computed without AI. validateProposal: the AI's JSON proposal checked against the
   plan before the user sees it, with every discarded change and its reason. applyProposal / undoLast: the plan
   changes only through editorial-core (history kept), one log entry per applied proposal, undone with restoreVersion. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixPedRegia=api})(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const results=()=>(root&&root.RadixPedResults)||(typeof require==='function'?require('./ped-results.js'):null);
const views=()=>(root&&root.RadixPedViews)||(typeof require==='function'?require('./ped-views.js'):null);
const fin=v=>typeof v==='number'&&Number.isFinite(v);
const clip=(v,n)=>String(v==null?'':v).replace(/\s+$/,'').slice(0,n);
const DAY=86400000,MIN_POSTS=5,MAX_OPS=20,LOG_MAX=20;
const isoDay=ms=>new Date(ms).toISOString().slice(0,10);
const validDay=d=>/^\d{4}-\d{2}-\d{2}$/.test(String(d||''))&&isoDay(Date.parse(d+'T12:00:00Z'))===d;
const validTime=t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(t||''));
const normTime=t=>{const m=/^(\d{1,2})[:.](\d{2})$/.exec(String(t||'').trim());return m&&+m[1]<24&&+m[2]<60?m[1].padStart(2,'0')+':'+m[2]:''};

// ---- statsDigest: the last `days` days of published posts with numbers, per channel, best and worst, levers ----
function statsDigest(state,{today,days=30,kindOf}={}){
 const pr=results(),from=today?isoDay(Date.parse(today+'T12:00:00Z')-days*DAY):'';
 const recent={...state,contents:((state&&state.contents)||[]).filter(c=>c&&c.stats&&c.stats.metrics&&(!from||!c.date||c.date>=from))};
 const r=pr.results(recent),lv=pr.levers(recent,{kindOf});
 const ranked=r.posts.filter(p=>p.engagementRate!=null).sort((a,b)=>b.engagementRate-a.engagementRate||(b.interactions||0)-(a.interactions||0));
 const pick=p=>({id:p.id,title:p.title,channel:p.channel,date:p.date,time:p.time,impressions:p.metrics.impressions,interactions:p.interactions,engagementRate:p.engagementRate});
 const byChannel=r.byChannel.map(c=>{const weeks=r.weeks.length?[...new Set(r.posts.filter(p=>p.channel===c.channel&&p.date).map(p=>pr.mondayOf(p.date)))].sort():[];
  return {channel:c.channel,posts:c.posts,impressions:c.impressions,interactions:c.interactions,engagementRate:c.engagementRate,weeks:weeks.length,enough:c.posts>=MIN_POSTS}});
 // A lever group with a single post proves nothing: it is left out, as the optimizer rules already say.
 const levers=Object.fromEntries(Object.entries(lv.groups).map(([k,rows])=>[k,rows.filter(x=>x.posts>=2)]).filter(([,rows])=>rows.length>1));
 const notes=byChannel.filter(c=>!c.enough).map(c=>c.channel+': '+c.posts+(c.posts===1?' post':' post')+' con numeri, troppo pochi per trarre conclusioni (ne servono almeno '+MIN_POSTS+').');
 if(!r.posts.length)notes.unshift('Nessun post con numeri negli ultimi '+days+' giorni: i risultati arrivano da Buffer una volta al giorno dopo la pubblicazione, o da un CSV.');
 return {from,days,posts:r.posts.length,totals:{impressions:r.totals.impressions,interactions:r.totals.interactions,engagementRate:r.totals.engagementRate},byChannel,best:ranked.slice(0,5).map(pick),worst:ranked.length>5?ranked.slice(-5).reverse().map(pick):[],levers,notes};
}
const n0=v=>v==null?'n.d.':String(v);
// The digest as plain lines: shown in the panel and, later, the numbers block of the AI context.
function digestText(d){
 const line=p=>'«'+clip(p.title,90)+'» · '+p.channel+' · '+(p.date||'')+(p.time?' '+p.time:'')+' · impression '+n0(p.impressions)+' · interazioni '+n0(p.interactions)+' · engagement '+n0(p.engagementRate)+'%';
 return [
  'Ultimi '+d.days+' giorni: '+d.posts+' post con numeri · impression '+n0(d.totals.impressions)+' · interazioni '+n0(d.totals.interactions)+' · engagement medio '+n0(d.totals.engagementRate)+'%',
  d.byChannel.length?'Per canale:\n'+d.byChannel.map(c=>'- '+c.channel+': '+c.posts+' post · impression '+n0(c.impressions)+' · interazioni '+n0(c.interactions)+' · engagement '+n0(c.engagementRate)+'%').join('\n'):'',
  d.best.length?'Migliori:\n'+d.best.map(p=>'- '+line(p)).join('\n'):'',
  d.worst.length?'Peggiori:\n'+d.worst.map(p=>'- '+line(p)).join('\n'):'',
  ...d.notes
 ].filter(Boolean).join('\n\n');
}

// ---- Proposal: {summary, ops:[add|move|rewrite|remove|frequency]} from the AI, checked against the plan ----
const OPS=Object.freeze(['add','move','rewrite','remove','frequency']);
const FORMATS=Object.freeze({'reel-avatar':'video',reel:'video',video:'video',carousel:'carousel',carosello:'carousel',image:'image',immagine:'image',text:'',testo:''});
const OP_LABELS=Object.freeze({add:'Nuovo post',move:'Sposta',rewrite:'Riscrivi',remove:'Togli dal calendario',frequency:'Frequenza'});
// Contents never name RADIX or the tools behind them (Francesco, 24/10).
const NAMED=/\bradix\b/i;
function parseProposal(text){
 if(text&&typeof text==='object')return text;
 const t=String(text||'');
 for(const s of [t,(/```(?:json)?\s*([\s\S]*?)```/i.exec(t)||[])[1],t.slice(t.indexOf('{'),t.lastIndexOf('}')+1)]){if(!s)continue;try{const v=JSON.parse(s);if(v&&typeof v==='object')return v}catch(e){}}
 return null;
}
// The plan's own spelling of a channel («instagram» → «Instagram»); null when the plan does not use it.
function channelOf(name,channels){const n=String(name||'').trim().toLowerCase();if(!n)return null;return channels.find(c=>c.toLowerCase()===n)||channels.find(c=>c.toLowerCase().startsWith(n+' '))||null}
function planChannels(state){return [...new Set(((state&&state.contents)||[]).map(c=>String(c.channel||'').trim()).filter(Boolean))]}
// A post already handed to Buffer (or published outside it) is not changed from here.
const isOutDefault=c=>!!(c&&c.publication&&c.publication.service);
function validateProposal(raw,state,{today,channels,isOut=isOutDefault}={}){
 const data=parseProposal(raw);
 if(!data)return {summary:'',ops:[],rejected:[],error:'Proposta non leggibile: riprova.'};
 const plan=channels&&channels.length?channels:planChannels(state),byId=new Map(((state&&state.contents)||[]).map(c=>[c.id,c]));
 const ops=[],rejected=[],seen=new Set(),no=(op,reason)=>rejected.push({op:String(op&&op.op||'?'),title:clip(op&&(op.title||(byId.get(op.contentId)||{}).title),120),reason});
 const list=Array.isArray(data.ops)?data.ops:[];
 for(const op of list){
  if(ops.length>=MAX_OPS){no(op,'Troppe modifiche in una volta: al massimo '+MAX_OPS+'.');continue}
  const kind=String(op&&op.op||'').toLowerCase();
  if(!OPS.includes(kind)){no(op,'Operazione sconosciuta.');continue}
  if(kind==='frequency'){const ch=channelOf(op.channel,plan),n=Number(op.perWeek);
   if(!ch){no(op,'Canale non presente nel piano: '+clip(op.channel,40)+'.');continue}
   if(!Number.isInteger(n)||n<1||n>21){no(op,'Frequenza non valida (da 1 a 21 post a settimana).');continue}
   ops.push({op:kind,channel:ch,perWeek:n});continue}
  if(kind==='add'){const ch=channelOf(op.channel,plan),time=normTime(op.time),title=clip(op.title,200).trim(),copy=clip(op.copy,6000).trim(),script=clip(op.script,20000).trim(),fmt=String(op.format||'').toLowerCase();
   if(!ch){no(op,'Canale non collegato al piano: '+clip(op.channel,40)+'.');continue}
   if(!validDay(op.date)||(today&&op.date<today)){no(op,'Data non valida o già passata.');continue}
   if(!time){no(op,'Orario non valido.');continue}
   if(!title||!copy){no(op,'Mancano il titolo o il testo.');continue}
   if(fmt&&!(fmt in FORMATS)){no(op,'Formato sconosciuto: '+clip(fmt,30)+'.');continue}
   if(NAMED.test(title+' '+copy+' '+script)){no(op,'Il testo nomina RADIX.');continue}
   ops.push({op:kind,channel:ch,date:op.date,time,title,copy,format:FORMATS[fmt]||'',script:FORMATS[fmt]==='video'?script:'',gaps:views().placeholders(copy+' '+script)});continue}
  const cur=byId.get(op.contentId);
  if(!cur){no(op,'Il post non esiste più nel piano.');continue}
  if(isOut(cur)){no(op,'Il post è già su Buffer o pubblicato: cambialo da lì.');continue}
  if(seen.has(cur.id)){no(op,'Una sola modifica per post in ogni proposta.');continue}
  if(kind==='move'){const date=op.date||cur.date,time=op.time?normTime(op.time):cur.time||'';
   if(!validDay(date)||(today&&date<today)){no(op,'Data non valida o già passata.');continue}
   if(op.time&&!time){no(op,'Orario non valido.');continue}
   if(date===cur.date&&time===(cur.time||'')){no(op,'Il post è già in quel giorno e a quell’ora.');continue}
   seen.add(cur.id);ops.push({op:kind,contentId:cur.id,title:cur.title,channel:cur.channel,from:{date:cur.date,time:cur.time||''},date,time});continue}
  if(kind==='rewrite'){const copy=clip(op.copy,6000).trim();
   if(!copy){no(op,'Manca il nuovo testo.');continue}
   if(copy===String(cur.copy||'').trim()){no(op,'Il testo è uguale a quello attuale.');continue}
   if(NAMED.test(copy)){no(op,'Il testo nomina RADIX.');continue}
   seen.add(cur.id);ops.push({op:kind,contentId:cur.id,title:cur.title,channel:cur.channel,date:cur.date,time:cur.time||'',copy,reason:clip(op.reason,300),gaps:views().placeholders(copy)});continue}
  if(kind==='remove'){if(!cur.date){no(op,'Il post non è in calendario.');continue}
   seen.add(cur.id);ops.push({op:kind,contentId:cur.id,title:cur.title,channel:cur.channel,date:cur.date,time:cur.time||''});continue}
 }
 return {summary:clip(data.summary,600),ops,rejected};
}
// One line per change, for the proposal card.
function opText(o){
 const when=(d,t)=>d?d.split('-').reverse().join('/')+(t?' '+t:''):'senza data';
 if(o.op==='add')return when(o.date,o.time)+' · '+o.channel+' · «'+o.title+'»';
 if(o.op==='move')return '«'+o.title+'» · '+when(o.from.date,o.from.time)+' → '+when(o.date,o.time);
 if(o.op==='rewrite')return '«'+o.title+'» · '+o.channel+(o.reason?' · '+o.reason:'');
 if(o.op==='remove')return '«'+o.title+'» · '+when(o.date,o.time);
 if(o.op==='frequency')return o.channel+': '+o.perWeek+' post a settimana (si applica con i nuovi post proposti)';
 return '';
}

// ---- Apply and undo: only through editorial-core, so every change keeps its history ----
// Changed and new posts go to review (as «Ottimizza» does): the user rereads and approves them before Buffer.
function toReview(core,state,id){const c=state.contents.find(x=>x.id===id);if(c&&c.status==='draft'&&String(c.copy||'').trim()){try{core.review(state,id,'request')}catch(e){}}}
function applyProposal(state,proposal,{core,newId,at=new Date().toISOString()}={}){
 if(!core||typeof newId!=='function')throw Error('applyProposal needs core and newId');
 const done=[],failed=[];
 for(const o of (proposal&&proposal.ops)||[]){
  try{
   if(o.op==='frequency'){done.push({op:o.op,channel:o.channel,perWeek:o.perWeek});continue}
   if(o.op==='add'){const id=newId(),item={id,title:o.title,channel:o.channel,date:o.date,time:o.time,copy:o.copy};if(o.format)item.format=o.format;if(o.script)item.script=o.script;
    core.updateContent(state,item);toReview(core,state,id);done.push({op:o.op,id});continue}
   const cur=state.contents.find(x=>x.id===o.contentId);if(!cur)throw Error('post non trovato');
   const prev=cur.revision,patch=o.op==='move'?{date:o.date,time:o.time}:o.op==='rewrite'?{copy:o.copy}:{date:'',time:''};
   core.updateContent(state,{...cur,...patch});if(o.op!=='remove')toReview(core,state,cur.id);done.push({op:o.op,id:cur.id,prevRevision:prev});
  }catch(e){failed.push((o.title||OP_LABELS[o.op]||o.op)+': '+(e&&e.message||e))}
 }
 const entry={at,summary:clip(proposal&&proposal.summary,600),ops:done};
 if(done.length){state.regia=state.regia&&typeof state.regia==='object'?state.regia:{};state.regia.log=[...(Array.isArray(state.regia.log)?state.regia.log:[]),entry].slice(-LOG_MAX)}
 return {entry,changed:done.filter(d=>d.id).map(d=>d.id),failed};
}
const lastApplied=state=>{const log=state&&state.regia&&Array.isArray(state.regia.log)?state.regia.log:[];for(let i=log.length-1;i>=0;i--)if(!log[i].undone&&log[i].ops.some(o=>o.id))return log[i];return null};
// Changed posts go back to the version before the proposal; new posts leave the calendar (their text stays in history).
function undoLast(state,{core,at=new Date().toISOString()}={}){
 const entry=lastApplied(state);if(!entry)return {undone:0,failed:[]};let undone=0;const failed=[];
 for(const o of entry.ops){if(!o.id)continue;const cur=state.contents.find(x=>x.id===o.id);if(!cur){failed.push(o.id);continue}
  try{if(o.op==='add')core.updateContent(state,{...cur,date:'',time:''});else core.restoreVersion(state,o.id,o.prevRevision);undone++}catch(e){failed.push((cur.title||o.id)+': '+(e&&e.message||e))}}
 entry.undone=at;
 return {undone,failed,entry};
}
return Object.freeze({MIN_POSTS,MAX_OPS,OPS,OP_LABELS,FORMATS,statsDigest,digestText,parseProposal,planChannels,validateProposal,opText,applyProposal,lastApplied,undoLast});
});
