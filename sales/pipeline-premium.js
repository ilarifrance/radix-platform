'use strict';
(()=>{
const $=id=>document.getElementById(id),state={workspace:null,processes:[],processId:'',stages:[],deals:[],generation:0,complete:false};
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
function dealCard(row){const b=E('button',undefined,'deal');b.type='button';b.append(E('strong',row.title||'Opportunità senza titolo'));if(Number.isSafeInteger(cents(row.amount_cents)))b.append(E('span','€ '+moneyMinor(cents(row.amount_cents)),'value'));if(row.expected_close){const d=E('small','Chiusura prevista: '+row.expected_close,'date');const date=safeDate(row.expected_close);if(date&&date<new Date(new Date().toISOString().slice(0,10)+'T00:00:00Z'))d.classList.add('past');b.append(d)}b.append(E('small','Apri dettagli ↗'));b.onclick=()=>{document.querySelectorAll('.deal').forEach(n=>n.classList.remove('selected'));b.classList.add('selected');const target=$('selection');target.replaceChildren(E('b',row.title||'Opportunità'));if(row.expected_close)target.append(E('p','Data prevista: '+row.expected_close));const a=E('a','Apri nel CRM operativo ↗');a.href='/radix-sales.html#opportunities';target.append(a)};return b}
function render(){
 const board=$('board');board.replaceChildren();const term=$('filter').value.toLocaleLowerCase('it');
 const filtered=state.deals.filter(d=>(!state.processId||d.process_id===state.processId)&&(d.title||'').toLocaleLowerCase('it').includes(term));
 const visibleStages=state.stages.filter(stage=>!state.processId||stage.process_id===state.processId);
 for(const stage of visibleStages){const group=E('div',undefined,'stage');const matching=filtered.filter(d=>d.stage_id===stage.id);const head=E('h2',stage.title||'Fase');head.append(E('small',matching.length+' opportunità caricate'));group.append(head);const list=E('div',undefined,'deals');matching.forEach(d=>list.append(dealCard(d)));if(!matching.length)list.append(E('small','Nessuna opportunità in questa fase.'));group.append(list);board.append(group)}
 const unassigned=filtered.filter(d=>!visibleStages.some(s=>s.id===d.stage_id));if(unassigned.length){const group=E('div',undefined,'stage');group.append(E('h2','Fase non disponibile'));const list=E('div',undefined,'deals');unassigned.forEach(d=>list.append(dealCard(d)));group.append(list);board.append(group)}
 if(!board.children.length)board.append(E('div','Nessuna fase configurata o nessun risultato.','empty'));
}
async function load(){const generation=++state.generation;error('');$('status').textContent='Caricamento pipeline...';try{
 const [processes,stages,deals]=await Promise.all([pages('processes',generation),pages('stages',generation),pages('opportunities',generation)]);if(generation!==state.generation||!processes||!stages||!deals)return;
 state.processes=processes.rows;
 const select=$('process');const previous=state.processId;select.replaceChildren();const all=E('option','Tutti i processi');all.value='';select.append(all);
 processes.rows.forEach(p=>{const opt=E('option',p.title||p.id);opt.value=p.id;select.append(opt)});
 state.processId=processes.rows.some(p=>p.id===previous)?previous:'';select.value=state.processId;select.disabled=false;
 state.stages=stages.rows.sort((a,b)=>(Number(a.position)||0)-(Number(b.position)||0));state.deals=deals.rows;state.complete=processes.complete&&stages.complete&&deals.complete;
 const shown=deals.rows.filter(d=>!state.processId||d.process_id===state.processId);
 $('count').textContent=String(shown.length);const amounts=shown.filter(d=>Number.isSafeInteger(cents(d.amount_cents)));$('amount').textContent='€ '+moneyMinor(amounts.reduce((s,d)=>s+cents(d.amount_cents),0));$('amount-note').textContent=amounts.length+' importi disponibili · valuta non modellata';
 const today=new Date().toISOString().slice(0,10);$('overdue').textContent=String(shown.filter(d=>typeof d.expected_close==='string'&&d.expected_close<today).length);
 $('coverage').textContent=state.complete?'Pagine lette':'Parziale';$('status').textContent='Dati CRM autorizzati · '+(state.complete?'copertura delle pagine lette (snapshot non garantito)':'almeno una risorsa ha altre pagine non caricate');
 render()
}catch(e){if(generation===state.generation){error(e.message);$('status').textContent='Impossibile caricare la pipeline.';}}}
async function init(){try{const rows=await api('workspaces');const sel=$('workspace');sel.replaceChildren();if(!rows.length){sel.append(E('option','Nessun workspace autorizzato'));$('status').textContent='Nessun workspace disponibile';return}rows.forEach(w=>{const opt=E('option',w.name||w.id);opt.value=w.id;sel.append(opt)});sel.disabled=false;state.workspace=sel.value;await load()}catch(e){error(e.message);$('status').textContent='Accesso non disponibile.'}}
$('workspace').onchange=()=>{state.workspace=$('workspace').value;load()};$('reload').onclick=load;$('filter').oninput=render;$('process').onchange=()=>{state.processId=$('process').value;const shown=state.deals.filter(d=>!state.processId||d.process_id===state.processId);$('count').textContent=String(shown.length);const amounts=shown.filter(d=>Number.isSafeInteger(d.amount_cents));$('amount').textContent='€ '+moneyMinor(amounts.reduce((sum,d)=>sum+d.amount_cents,0));$('amount-note').textContent=amounts.length+' importi disponibili · valuta non modellata';const today=new Date().toISOString().slice(0,10);$('overdue').textContent=String(shown.filter(d=>typeof d.expected_close==='string'&&d.expected_close<today).length);render()};init();
})();