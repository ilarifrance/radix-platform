'use strict';
(function(root){
/* Pure helpers (exported for tests): only open deals sit in stage columns. */
const isOpen=d=>!!d&&(d.outcome==null||d.outcome==='open');
function outcomeCounts(deals){let won=0,lost=0,open=0;for(const d of deals||[]){if(!d)continue;if(d.outcome==='won')won++;else if(d.outcome==='lost')lost++;else if(isOpen(d))open++}return {open,won,lost}}
function moveTargets(deal,stages){return (stages||[]).filter(s=>s&&deal&&s.id!==deal.stage_id&&(!deal.process_id||s.process_id===deal.process_id))}
function moveConfirmation(deal,stage){return 'Spostare «'+((deal&&deal.title)||'Opportunità senza titolo')+'» in «'+((stage&&stage.title)||'Fase')+'»?'+(stage&&stage.task_title?' Verrà creata l’attività «'+stage.task_title+'».':'')}
// A calendar date «2026-12-15» as the CRM shows it, «15/12/2026»; anything else unchanged.
function dateLabel(v){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v==null?'':v));return m?m[3]+'/'+m[2]+'/'+m[1]:String(v==null?'':v)}
// Today as YYYY-MM-DD in the browser's own day (not UTC), to compare with expected_close.
function localDay(now){const d=now||new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())}
// Open value × probability: the opportunity's own, otherwise its stage's (as Analisi › Valore ponderato), in cents.
function weighted(deals,stages){const by=new Map((stages||[]).map(s=>[s&&s.id,s]));let t=0;
 for(const d of deals||[]){if(!isOpen(d))continue;const c=Number(d.amount_cents);if(!Number.isSafeInteger(c))continue;
  const own=d.probability,st=by.get(d.stage_id),p=own!=null&&own!==''?Number(own):st&&st.probability!=null?Number(st.probability):0;if(Number.isFinite(p))t+=c*Math.min(100,Math.max(0,p))/100}
 return Math.round(t)}
// After a move: the new stage's default probability when the deal still had the old stage's default; a value set by hand
// (or no value at all, which already follows the stage) is never touched. null = nothing to change.
function nextProbability(row,stages,stage){const num=v=>v==null||v===''?null:Number(v);
 const from=(stages||[]).find(s=>s&&s.id===row?.stage_id),own=num(row?.probability),was=num(from?.probability),to=num(stage?.probability);
 return own!=null&&was!=null&&to!=null&&own===was&&to!==was&&Number.isInteger(to)?to:null}
const core={isOpen,outcomeCounts,moveTargets,moveConfirmation,dateLabel,localDay,weighted,nextProbability};
if(typeof module!=='undefined'&&module.exports)module.exports=core;
root.RadixPipelineMove=core;
if(typeof document==='undefined')return;
const $=id=>document.getElementById(id),state={workspace:null,workspaces:[],busy:false,dragId:null,processes:[],processId:'',stages:[],deals:[],generation:0,complete:false};
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n};
const error=msg=>{const p=$('error');p.hidden=!msg;p.textContent=msg||''};
async function api(entity,offset=0){
 const p=new URLSearchParams({entity,offset:String(offset)});if(entity!=='workspaces')p.set('workspace',state.workspace);
 const r=await fetch('/api/sales?'+p,{credentials:'same-origin',cache:'no-store'});
 if(!r.ok)throw Error(r.status===401?'Sessione non autenticata: effettua il login sullo stesso dominio.':r.status===403?'Non hai accesso a questo workspace.':'Errore API ('+r.status+').');
 const data=await r.json();if(!data||!Array.isArray(data.rows))throw Error('Formato API non valido');return data.rows;
}
async function pages(entity,generation){const all=[];let complete=false;
 for(let n=0;n<10;n++){const page=await api(entity,all.length);if(generation!==state.generation)return null;all.push(...page);if(page.length<100){complete=true;break}}
 const seen=new Set();return {rows:all.filter(row=>{if(!row||typeof row.id!=='string'||seen.has(row.id))return false;seen.add(row.id);return true}),complete};}
function moneyMinor(cents){return Number.isSafeInteger(cents)?new Intl.NumberFormat('it-IT',{maximumFractionDigits:2,minimumFractionDigits:2}).format(cents/100):'Importo non disponibile'}
function safeDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;const d=new Date(value+'T00:00:00Z');return Number.isNaN(d.valueOf())?null:d}
const cents=v=>v==null||v===''?NaN:Number(v);
const canWrite=()=>{const w=state.workspaces.find(x=>x&&x.id===state.workspace);return !!w&&w.role!=='viewer'};
const transitionKeys=new Map();
function transitionKey(row,stage){const f=[state.workspace,row.id,row.version,stage.id].join(':');if(!transitionKeys.has(f))transitionKeys.set(f,crypto.randomUUID());return transitionKeys.get(f)}
const dragged=()=>state.dragId?state.deals.find(d=>d.id===state.dragId&&isOpen(d)):null;
const clearTargets=()=>document.querySelectorAll('.drop-target').forEach(n=>n.classList.remove('drop-target'));
async function move(row,stage){
 if(state.busy||!row||!stage||stage.id===row.stage_id||!isOpen(row))return;
 if(!canWrite()){error('Il tuo ruolo in questo workspace è di sola lettura: non puoi spostare opportunità.');return}
 if(!globalThis.crypto?.randomUUID){error('Spostamento non disponibile: apri la pagina in HTTPS.');return}
 if(!window.confirm(moveConfirmation(row,stage)))return;
 const generation=state.generation,key=transitionKey(row,stage);state.busy=true;error('');$('status').textContent='Spostamento in corso...';
 let failure=null,conflict=false;
 try{const r=await fetch('/api/sales',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json','x-radix-sales':'1'},body:JSON.stringify({workspace:state.workspace,entity:'opportunities',action:'transition',data:{id:row.id,version:row.version,stage_id:stage.id,key}})});
  let data={};try{data=await r.json()}catch{data={}}
  const p=r.ok?nextProbability(row,state.stages,stage):null,moved=data.rows?.[0];
  if(p!=null&&moved&&moved.version!=null){try{await fetch('/api/sales',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json','x-radix-sales':'1'},body:JSON.stringify({workspace:state.workspace,entity:'opportunities',action:'update',data:{id:row.id,version:moved.version,probability:p}})})}catch{}}
  if(!r.ok){const msg=typeof data.error==='string'?data.error:data.error?.message;conflict=r.status===409;
   failure=r.status===401?'Sessione non autenticata: effettua il login sullo stesso dominio.':r.status===403?'Non hai i permessi per spostare opportunità in questo workspace.':conflict?'Conflitto: l’opportunità è stata modificata nel frattempo. Pipeline ricaricata: verifica e riprova.':(msg||'Spostamento non riuscito ('+r.status+').')}
 }catch{failure='Errore di rete durante lo spostamento: premi Aggiorna e verifica prima di ripetere.'}
 finally{state.busy=false}
 if(generation!==state.generation)return;
 if(!failure||conflict)await load();
 if(failure){error(failure);if(!conflict)$('status').textContent='Spostamento non completato.'}
}
function stageGroup(stage){const group=E('div',undefined,'stage');group.dataset.stageId=stage.id;
 group.addEventListener('dragover',e=>{const d=dragged();if(!d||!moveTargets(d,[stage]).length)return;e.preventDefault();e.dataTransfer.dropEffect='move';group.classList.add('drop-target')});
 group.addEventListener('dragleave',e=>{if(!group.contains(e.relatedTarget))group.classList.remove('drop-target')});
 group.addEventListener('drop',e=>{const d=dragged();clearTargets();if(!d||!moveTargets(d,[stage]).length)return;e.preventDefault();state.dragId=null;move(d,stage)});
 return group}
function selectionPanel(row){const target=$('selection');target.replaceChildren(E('b',row.title||'Opportunità'));if(row.expected_close)target.append(E('p','Data prevista: '+dateLabel(row.expected_close)));
 const options=moveTargets(row,state.stages);
 if(canWrite()&&options.length){const id='move-stage';const wrap=E('p');const label=E('label','Sposta in…');label.htmlFor=id;const sel=E('select');sel.id=id;const none=E('option','Scegli una fase');none.value='';sel.append(none);
  options.forEach(s=>{const o=E('option',s.title||'Fase');o.value=s.id;sel.append(o)});const go=E('button','Sposta');go.type='button';go.disabled=true;sel.onchange=()=>{go.disabled=!sel.value};
  go.onclick=()=>{const stage=state.stages.find(s=>s.id===sel.value);if(stage)move(row,stage)};wrap.append(label,' ',sel,' ',go);target.append(wrap)}
 else if(!canWrite())target.append(E('p','Ruolo in sola lettura: lo spostamento di fase non è disponibile.'));
 const a=E('a','Apri nel CRM operativo ↗');a.href='/radix-sales.html#opportunities';target.append(a)}
function dealCard(row){const b=E('button',undefined,'deal');b.type='button';b.append(E('strong',row.title||'Opportunità senza titolo'));if(Number.isSafeInteger(cents(row.amount_cents)))b.append(E('span','€ '+moneyMinor(cents(row.amount_cents)),'value'));if(row.expected_close){const d=E('small','Chiusura prevista: '+dateLabel(row.expected_close),'date');if(safeDate(row.expected_close)&&row.expected_close<localDay())d.classList.add('past');b.append(d)}b.append(E('small','Apri dettagli ↗'));
 if(canWrite()&&isOpen(row)&&moveTargets(row,state.stages).length){b.draggable=true;b.title='Trascina su un’altra fase per spostarla';b.addEventListener('dragstart',e=>{state.dragId=row.id;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',row.id);b.classList.add('dragging')});b.addEventListener('dragend',()=>{state.dragId=null;b.classList.remove('dragging');clearTargets()})}
 b.onclick=()=>{document.querySelectorAll('.deal').forEach(n=>n.classList.remove('selected'));b.classList.add('selected');selectionPanel(row)};return b}
function render(){
 const board=$('board');board.replaceChildren();const term=$('filter').value.toLocaleLowerCase('it');
 const filtered=state.deals.filter(d=>isOpen(d)&&(!state.processId||d.process_id===state.processId)&&(d.title||'').toLocaleLowerCase('it').includes(term));
 const visibleStages=state.stages.filter(stage=>!state.processId||stage.process_id===state.processId);
 for(const stage of visibleStages){const group=stageGroup(stage);const matching=filtered.filter(d=>d.stage_id===stage.id);const head=E('h2',stage.title||'Fase');head.append(E('small',matching.length+' opportunità aperte'));group.append(head);const list=E('div',undefined,'deals');matching.forEach(d=>list.append(dealCard(d)));if(!matching.length)list.append(E('small','Nessuna opportunità in questa fase.'));group.append(list);board.append(group)}
 const unassigned=filtered.filter(d=>!visibleStages.some(s=>s.id===d.stage_id));if(unassigned.length){const group=E('div',undefined,'stage');group.append(E('h2','Fase non disponibile'));const list=E('div',undefined,'deals');unassigned.forEach(d=>list.append(dealCard(d)));group.append(list);board.append(group)}
 if(!board.children.length)board.append(E('div','Nessuna fase configurata o nessun risultato.','empty'));
 const ro=$('read-only');if(ro)ro.textContent=canWrite()?'Trascina una card su un’altra fase (o usa «Sposta in…» nei dettagli) · conferma richiesta':'Modalità lettura · modifiche dal CRM';
}
function metrics(){
 const scoped=state.deals.filter(d=>!state.processId||d.process_id===state.processId),shown=scoped.filter(isOpen),oc=outcomeCounts(scoped);
 $('count').textContent=String(shown.length);const amounts=shown.filter(d=>Number.isSafeInteger(cents(d.amount_cents)));$('amount').textContent='€ '+moneyMinor(amounts.reduce((s,d)=>s+cents(d.amount_cents),0));$('amount-note').textContent=amounts.length+' trattative aperte';
 $('weighted').textContent='€ '+moneyMinor(weighted(shown,state.stages));
 const today=localDay();$('overdue').textContent=String(shown.filter(d=>typeof d.expected_close==='string'&&d.expected_close<today).length);
 let o=$('outcomes');if(!o){o=E('span');o.id='outcomes';$('count').parentElement.append(o)}o.textContent='Aperte · Vinte '+oc.won+' · Perse '+oc.lost;
}
async function load(){const generation=++state.generation;error('');$('status').textContent='Caricamento pipeline...';try{
 const [processes,stages,deals]=await Promise.all([pages('processes',generation),pages('stages',generation),pages('opportunities',generation)]);if(generation!==state.generation||!processes||!stages||!deals)return;
 state.processes=processes.rows;
 const select=$('process');const previous=state.processId;select.replaceChildren();const all=E('option','Tutti i processi');all.value='';select.append(all);
 processes.rows.forEach(p=>{const opt=E('option',p.title||p.id);opt.value=p.id;select.append(opt)});
 state.processId=processes.rows.some(p=>p.id===previous)?previous:'';select.value=state.processId;select.disabled=false;
 state.stages=stages.rows.sort((a,b)=>(Number(a.position)||0)-(Number(b.position)||0));state.deals=deals.rows;state.complete=processes.complete&&stages.complete&&deals.complete;
 metrics();
 $('status').textContent=state.complete?'Dati aggiornati dal server.':'Dati CRM autorizzati · almeno una risorsa ha altre pagine non caricate';
 render()
}catch(e){if(generation===state.generation){error(e.message);$('status').textContent='Impossibile caricare la pipeline.';idle('Pipeline non disponibile: premi Aggiorna per riprovare.');}}}
// The board starts with a loading line (sales-pipeline-premium.html); when nothing can load it says why instead.
function idle(msg){$('board').replaceChildren(E('div',msg,'empty'))}
async function init(){try{const rows=await api('workspaces');state.workspaces=rows;const sel=$('workspace');sel.replaceChildren();if(!rows.length){sel.append(E('option','Nessun workspace autorizzato'));$('status').textContent='Nessun workspace disponibile';idle('Nessun workspace CRM disponibile per questo account.');return}rows.forEach(w=>{const opt=E('option',w.name||w.id);opt.value=w.id;sel.append(opt)});sel.disabled=false;state.workspace=sel.value;await load()}catch(e){error(e.message);$('status').textContent='Accesso non disponibile.';idle('Accesso al CRM non disponibile.')}}
$('workspace').onchange=()=>{state.workspace=$('workspace').value;transitionKeys.clear();load()};$('reload').onclick=load;$('filter').oninput=render;$('process').onchange=()=>{state.processId=$('process').value;metrics();render()};init();
})(typeof window!=='undefined'?window:globalThis);
