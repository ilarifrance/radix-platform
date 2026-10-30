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
async function api(entity,offset=0,limit=0){
 const p=new URLSearchParams({entity,offset:String(offset)});if(limit)p.set('limit',String(limit));if(entity!=='workspaces')p.set('workspace',state.workspace);
 const r=await fetch('/api/sales?'+p,{credentials:'same-origin',cache:'no-store'});
 if(!r.ok)throw Error(r.status===401?'Sessione non autenticata: effettua il login sullo stesso dominio.':r.status===403?'Non hai accesso a questo workspace.':'Errore API ('+r.status+').');
 const data=await r.json();if(!data||!Array.isArray(data.rows))throw Error('Formato API non valido');const rows=data.rows;rows.limit=Number(data.limit)||100;return rows;
}
async function pages(entity,generation){const all=[];let complete=false;
 for(let n=0;n<10;n++){const page=await api(entity,all.length,500);if(generation!==state.generation)return null;all.push(...page);if(page.length<page.limit){complete=true;break}}
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
 for(const stage of visibleStages){const group=stageGroup(stage);const matching=filtered.filter(d=>d.stage_id===stage.id);const head=E('h2',stage.title||'Fase');head.append(E('small',matching.length+' opportunità aperte'));group.append(head);if(canWrite()){const add=E('button','+ Aggiungi','stage-add');add.type='button';add.title='Nuova opportunità in «'+(stage.title||'Fase')+'»';add.onclick=()=>openQuick(stage.id);group.append(add)}const list=E('div',undefined,'deals');matching.forEach(d=>list.append(dealCard(d)));if(!matching.length)list.append(E('small','Nessuna opportunità in questa fase.'));group.append(list);board.append(group)}
 const unassigned=filtered.filter(d=>!visibleStages.some(s=>s.id===d.stage_id));if(unassigned.length){const group=E('div',undefined,'stage');group.append(E('h2','Fase non disponibile'));const list=E('div',undefined,'deals');unassigned.forEach(d=>list.append(dealCard(d)));group.append(list);board.append(group)}
 if(!board.children.length)board.append(E('div','Nessuna fase configurata o nessun risultato.','empty'));
 const nd=$('new-deal');if(nd)nd.hidden=!canWrite()||!visibleStages.length;const sp=$('setup-pipeline');if(sp)sp.hidden=!canSetup();
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
 // Only sales pipelines (kind opportunity): task processes and their stages are not columns here.
 const pipelines=processes.rows.filter(p=>p.kind==null||p.kind==='opportunity');state.processes=pipelines;
 const select=$('process');const previous=state.processId;select.replaceChildren();const all=E('option','Tutte le pipeline');all.value='';select.append(all);
 pipelines.forEach(p=>{const opt=E('option',p.title||p.id);opt.value=p.id;select.append(opt)});
 // With several pipelines the board opens on one (the last chosen, else the first): their columns differ.
 state.processId=pipelines.some(p=>p.id===previous)?previous:previous===''&&state.allChosen?'':pipelines.length>1?pipelines[0].id:'';select.value=state.processId;select.disabled=false;
 $('process-field').hidden=pipelines.length<2;
 const ids=new Set(pipelines.map(p=>p.id));state.stages=stages.rows.filter(s=>ids.has(s.process_id)).sort((a,b)=>(Number(a.position)||0)-(Number(b.position)||0));state.deals=deals.rows;state.complete=processes.complete&&stages.complete&&deals.complete;
 metrics();
 $('status').textContent=state.complete?'Dati aggiornati dal server.':'Dati CRM autorizzati · almeno una risorsa ha altre pagine non caricate';
 render()
}catch(e){if(generation===state.generation){error(e.message);$('status').textContent='Impossibile caricare la pipeline.';idle('Pipeline non disponibile: premi Aggiorna per riprovare.');}}}
// «+ Nuova opportunità»: title, company, contact, amount, close date and stage in one dialog. A company or contact
// typed with a new name is created first (crm-quick-core.js decides), then the opportunity; no second confirmation.
const quick={rows:null,loading:null,saving:false};
const post=(entity,data)=>send(entity,'create',data);
async function send(entity,action,data){const r=await fetch('/api/sales',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json','x-radix-sales':'1'},body:JSON.stringify({workspace:state.workspace,entity,action,data})});
 let body={};try{body=await r.json()}catch{body={}}
 if(!r.ok){const msg=typeof body.error==='string'?body.error:body.error?.message;throw Error(r.status===401?'Sessione non autenticata: effettua il login sullo stesso dominio.':r.status===403?'Non hai i permessi per creare record in questo workspace.':(msg||'Salvataggio non riuscito ('+r.status+').'))}
 const row=body.rows?.[0];if(action==='delete')return row||{};if(!row||typeof row.id!=='string')throw Error('Risposta del server senza il record creato: premi Aggiorna e verifica.');return row}
function quickLists(){const f=$('quick-deal-form'),Q=window.RadixCrmQuick,rows=quick.rows||{companies:[],contacts:[]};
 const fill=(id,items)=>{const dl=$(id);dl.replaceChildren(...[...new Set(items.map(r=>String(r.name||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'it')).slice(0,1000).map(n=>{const o=E('option');o.value=n;return o}))};
 fill('quick-companies',rows.companies);
 const co=Q.findByName(rows.companies,f.elements.company.value);fill('quick-contacts',co?rows.contacts.filter(c=>c.company_id===co.id):rows.contacts);
 for(const k of ['company','contact']){const h=f.querySelector('[data-hint="'+k+'"]');h.textContent=quick.rows?Q.hint(k==='company'?'companies':'contacts',f.elements[k].value,k==='company'?rows.companies:rows.contacts):(f.elements[k].value.trim()?'Caricamento dell’elenco…':'')}}
async function quickLoad(){if(quick.rows)return quick.rows;if(!quick.loading){const generation=state.generation,ws=state.workspace;
  quick.loading=Promise.all([pages('companies',generation),pages('contacts',generation)]).then(([co,ct])=>{if(!co||!ct||ws!==state.workspace)return null;quick.rows={companies:co.rows,contacts:ct.rows};return quick.rows}).finally(()=>{quick.loading=null})}
 return quick.loading}
function quickError(msg){const p=$('quick-deal-form').querySelector('.quick-error');p.hidden=!msg;p.textContent=msg||''}
function quickStages(stageId){const f=$('quick-deal-form'),stages=state.stages.filter(s=>s.process_id===f.elements.process_id.value);
 f.elements.stage_id.replaceChildren(...stages.map(s=>{const o=E('option',s.title||'Fase');o.value=s.id;return o}));f.elements.stage_id.value=stages.some(s=>s.id===stageId)?stageId:(stages[0]?.id||'')}
function openQuick(stageId){if(!canWrite()||state.busy)return;const dlg=$('quick-deal'),f=$('quick-deal-form');f.reset();quickError('');
 // Pipeline first (hidden with only one), then its columns; «+ Aggiungi» on a column preselects both.
 const withStages=state.processes.filter(p=>state.stages.some(s=>s.process_id===p.id)),from=state.stages.find(s=>s.id===stageId);
 f.elements.process_id.replaceChildren(...withStages.map(p=>{const o=E('option',p.title||'Pipeline');o.value=p.id;return o}));
 f.elements.process_id.value=from?.process_id||(withStages.some(p=>p.id===state.processId)?state.processId:withStages[0]?.id||'');
 f.querySelector('[data-pipeline-pick]').hidden=withStages.length<2;quickStages(stageId);
 quickLists();if(dlg.showModal)dlg.showModal();else dlg.setAttribute('open','');f.elements.title.focus();
 quickLoad().then(()=>quickLists()).catch(e=>quickError('Elenco aziende e contatti non caricato ('+e.message+'). Puoi comunque creare l’opportunità.'))}
async function saveQuick(){if(quick.saving)return;const f=$('quick-deal-form'),Q=window.RadixCrmQuick,v=k=>f.elements[k].value;
 if(!quick.rows&&(v('company').trim()||v('contact').trim())){try{await quickLoad()}catch{}if(!quick.rows){quickError('Elenco aziende e contatti non ancora caricato: riprova tra un istante, così non creo doppioni.');return}}
 const rows=quick.rows||{companies:[],contacts:[]},p=Q.plan({title:v('title'),company:v('company'),contact:v('contact'),amount:v('amount'),expected_close:v('expected_close'),stage_id:v('stage_id')},{...rows,stages:state.stages});
 if(p.error){quickError(p.error);return}
 quick.saving=true;quickError('');const btn=f.querySelector('[data-quick="save"]');btn.disabled=true;btn.textContent='Salvataggio…';const made=[];
 try{let companyId=p.company?.id||null,contactId=p.contact?.id||null;
  if(p.company?.create){const row=await post('companies',p.company.create);rows.companies.push(row);companyId=row.id;made.push('la nuova azienda «'+row.name+'»')}
  if(p.contact?.create){const row=await post('contacts',{...p.contact.create,company_id:companyId});rows.contacts.push(row);contactId=row.id;made.push('il nuovo contatto «'+row.name+'»')}
  await post('opportunities',{...p.opportunity,company_id:companyId,contact_id:contactId});
  const dlg=$('quick-deal');if(dlg.close)dlg.close();else dlg.removeAttribute('open');
  await load();$('status').textContent='Opportunità «'+p.opportunity.title+'» creata'+(made.length?', con '+made.join(' e '):'')+'.';
 }catch(e){quickError((made.length?'Ho creato '+made.join(' e ')+', ma non l’opportunità: ':'')+e.message);quickLists()}
 finally{quick.saving=false;btn.disabled=false;btn.textContent='Crea opportunità'}}
{const f=$('quick-deal-form');if(f){f.addEventListener('submit',e=>{e.preventDefault();saveQuick()});f.querySelector('[data-quick="cancel"]').onclick=()=>{const d=$('quick-deal');if(d.close)d.close();else d.removeAttribute('open')};
 f.elements.process_id.addEventListener('change',()=>quickStages(''));
 f.elements.company.addEventListener('input',quickLists);f.elements.contact.addEventListener('input',quickLists);
 // Picking a known contact with the company still empty fills in its company.
 f.elements.contact.addEventListener('change',()=>{const r=quick.rows;if(!r||f.elements.company.value.trim())return;const c=window.RadixCrmQuick.findByName(r.contacts,f.elements.contact.value),co=c&&r.companies.find(x=>x.id===c.company_id);if(co){f.elements.company.value=co.name;quickLists()}});
 const nd=$('new-deal');if(nd)nd.onclick=()=>openQuick('')}}
// «Personalizza pipeline» (owner and admin, as the server requires for processes and stages): name, columns in order,
// probability per column, new pipelines. pipeline-setup-core.js turns the edit into ordered commands.
const setup={processId:'',cols:[],saving:false};
const canSetup=()=>{const w=state.workspaces.find(x=>x&&x.id===state.workspace);return !!w&&['owner','admin'].includes(w.role)};
function setupError(msg){const p=$('setup-form').querySelector('.quick-error');p.hidden=!msg;p.textContent=msg||''}
function setupRows(){const ol=$('setup-cols');ol.replaceChildren();
 setup.cols.forEach((c,i)=>{const li=E('li',undefined,'setup-col'),name=E('input'),prob=E('input');
  name.value=c.title;name.maxLength=200;name.placeholder='Nome della colonna';name.setAttribute('aria-label','Nome della colonna '+(i+1));name.oninput=()=>{c.title=name.value};
  prob.value=c.probability??'';prob.inputMode='numeric';prob.maxLength=3;prob.placeholder='—';prob.setAttribute('aria-label','Probabilità % della colonna '+(i+1));prob.oninput=()=>{c.probability=prob.value};
  const tool=(t,label,fn,off)=>{const b=E('button',t,'setup-tool');b.type='button';b.title=label;b.setAttribute('aria-label',label);b.disabled=!!off;b.onclick=fn;return b};
  const n=c.id?state.deals.filter(d=>d.stage_id===c.id).length:0;
  li.append(E('span',String(i+1),'setup-num'),name,prob,
   tool('↑','Sposta a sinistra',()=>{setup.cols.splice(i-1,0,setup.cols.splice(i,1)[0]);setupRows()},i===0),
   tool('↓','Sposta a destra',()=>{setup.cols.splice(i+1,0,setup.cols.splice(i,1)[0]);setupRows()},i===setup.cols.length-1),
   tool('✕',n?'Contiene '+n+' opportunità: spostale prima di togliere la colonna':'Togli la colonna',()=>{setup.cols.splice(i,1);setupRows()},n>0||setup.cols.length<2));
  ol.append(li)})}
function setupPick(id){const f=$('setup-form');setup.processId=id;setupError('');
 const p=state.processes.find(x=>x.id===id);f.elements.name.value=p?p.title||'':'';
 setup.cols=p?state.stages.filter(s=>s.process_id===id).map(s=>({id:s.id,title:s.title||'',probability:s.probability==null?'':String(s.probability)})):window.RadixPipelineSetup.TEMPLATE.map(t=>({title:t,probability:''}));
 const sel=f.elements.pipeline;sel.replaceChildren(...state.processes.map(x=>{const o=E('option',x.title||'Pipeline');o.value=x.id;return o}),...(p?[]:[Object.assign(E('option','Nuova pipeline'),{value:''})]));sel.value=id;
 const del=f.querySelector('[data-setup="delete"]'),n=state.deals.filter(d=>d.process_id===id).length;
 del.hidden=!p||state.processes.length<2;del.disabled=n>0;del.title=n?'Contiene '+n+' opportunità: spostale o chiudile prima':'';
 setupRows();if(!p)f.elements.name.focus()}
function openSetup(){if(!canSetup()||state.busy)return;const d=$('setup');setupPick(state.processId||state.processes[0]?.id||'');if(d.showModal)d.showModal();else d.setAttribute('open','')}
const closeSetup=()=>{const d=$('setup');if(d.close)d.close();else d.removeAttribute('open')};
async function saveSetup(){if(setup.saving)return;const S=window.RadixPipelineSetup,f=$('setup-form');
 const name=S.pipelineName(f.elements.name.value,state.processes,setup.processId||null);if(name.error){setupError(name.error);return}
 const current=state.stages.filter(s=>s.process_id===setup.processId),p=S.plan(current,setup.cols,state.deals);if(p.error){setupError(p.error);return}
 setup.saving=true;setupError('');const btn=f.querySelector('[data-setup="save"]');btn.disabled=true;btn.textContent='Salvataggio…';
 const ver=new Map(current.map(s=>[s.id,s.version]));let processId=setup.processId,done=0;
 try{const proc=state.processes.find(x=>x.id===processId);
  if(!proc){const row=await post('processes',{title:name.title,kind:'opportunity'});processId=row.id;state.processes.push(row);setup.processId=processId}
  else if(name.title!==String(proc.title||'').trim()){const row=await send('processes','update',{id:proc.id,version:proc.version,title:name.title});proc.title=row.title;proc.version=row.version}
  for(const st of p.steps){
   if(st.op==='delete')await send('stages','delete',{id:st.id,version:ver.get(st.id)});
   else if(st.op==='update'){const row=await send('stages','update',{id:st.id,version:ver.get(st.id),...st.data});ver.set(st.id,row.version)}
   else await post('stages',{...st.data,process_id:processId});
   done++}
  closeSetup();state.processId=processId;state.allChosen=false;await load();$('status').textContent='Pipeline «'+name.title+'» salvata.';
 }catch(e){setupError((done?'Salvate '+done+' modifiche su '+p.steps.length+'; ':'')+e.message+' Premi Aggiorna e controlla prima di riprovare.');if(done||processId!==setup.processId)load()}
 finally{setup.saving=false;btn.disabled=false;btn.textContent='Salva'}}
async function deleteSetup(){const proc=state.processes.find(x=>x.id===setup.processId);if(!proc||setup.saving)return;
 if(state.deals.some(d=>d.process_id===proc.id)){setupError('Questa pipeline contiene opportunità: spostale o chiudile prima.');return}
 if(!window.confirm('Eliminare la pipeline «'+(proc.title||'Pipeline')+'» e le sue colonne vuote?'))return;
 setup.saving=true;setupError('');
 try{for(const s of state.stages.filter(s=>s.process_id===proc.id))await send('stages','delete',{id:s.id,version:s.version});
  await send('processes','delete',{id:proc.id,version:proc.version});closeSetup();state.processId='';state.allChosen=false;await load();$('status').textContent='Pipeline «'+(proc.title||'')+'» eliminata.'}
 catch(e){setupError(e.message+' Premi Aggiorna e controlla.');load()}finally{setup.saving=false}}
{const f=$('setup-form');if(f){f.addEventListener('submit',e=>{e.preventDefault();saveSetup()});
 f.elements.pipeline.onchange=()=>setupPick(f.elements.pipeline.value);
 f.querySelector('[data-setup="new"]').onclick=()=>setupPick('');
 f.querySelector('[data-setup="add"]').onclick=()=>{if(setup.cols.length>=50)return;setup.cols.push({title:'',probability:''});setupRows();const inputs=$('setup-cols').querySelectorAll('input:not([inputmode])');inputs[inputs.length-1]?.focus()};
 f.querySelector('[data-setup="cancel"]').onclick=closeSetup;f.querySelector('[data-setup="delete"]').onclick=deleteSetup;
 const b=$('setup-pipeline');if(b)b.onclick=openSetup}}
// The board starts with a loading line (sales-pipeline-premium.html); when nothing can load it says why instead.
function idle(msg){$('board').replaceChildren(E('div',msg,'empty'))}
// The workspace last chosen in the CRM (radix.workspace, see sales.js), so every Sales page opens the same one.
const wsMemo={get(){try{return localStorage.getItem('radix.workspace')||''}catch{return ''}},set(v){try{if(v)localStorage.setItem('radix.workspace',v)}catch{}}};
async function init(){try{const rows=await api('workspaces');state.workspaces=rows;const sel=$('workspace');sel.replaceChildren();if(!rows.length){sel.append(E('option','Nessun workspace autorizzato'));$('status').textContent='Nessun workspace disponibile';idle('Nessun workspace CRM disponibile per questo account.');return}rows.forEach(w=>{const opt=E('option',w.name||w.id);opt.value=w.id;sel.append(opt)});sel.disabled=false;{const kept=wsMemo.get();if([...sel.options].some(o=>o.value===kept))sel.value=kept}state.workspace=sel.value;wsMemo.set(state.workspace);await load()}catch(e){error(e.message);$('status').textContent='Accesso non disponibile.';idle('Accesso al CRM non disponibile.')}}
$('workspace').onchange=()=>{state.workspace=$('workspace').value;quick.rows=null;wsMemo.set(state.workspace);transitionKeys.clear();load()};$('reload').onclick=load;$('filter').oninput=render;$('process').onchange=()=>{state.processId=$('process').value;state.allChosen=!state.processId;metrics();render()};init();
})(typeof window!=='undefined'?window:globalThis);
