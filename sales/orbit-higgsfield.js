'use strict';
(()=>{
const $=id=>document.getElementById(id),state={workspace:null,generation:0,searchCatalog:[],searchComplete:false,searchReady:false};const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n};
async function api(entity,offset=0){const q=new URLSearchParams({entity,offset:String(offset)});if(entity!=='workspaces')q.set('workspace',state.workspace);const res=await fetch('/api/sales?'+q,{credentials:'same-origin',cache:'no-store'});if(!res.ok)throw Error(res.status===401?'Effettua l’accesso al CRM':res.status===403?'Workspace non autorizzato':'Errore CRM '+res.status);const data=await res.json();if(!data||!Array.isArray(data.rows))throw Error('Formato dati CRM non valido');return data.rows}
async function readPages(entity,generation){const rows=[];let complete=false;for(let i=0;i<10;i++){const batch=await api(entity,rows.length);if(generation!==state.generation)return null;rows.push(...batch);if(batch.length<100){complete=true;break}}return{rows,complete}}
function reset(){state.searchCatalog=[];state.searchReady=false;state.searchComplete=false;renderSearch()}
/* The universe, KPIs, charts and Copilota are drawn by orbit-universe.js and orbit-charts.js; this file keeps the workspace, search, assistant and connection state. */
const fail=message=>document.dispatchEvent(new CustomEvent('radix:crm-error',{detail:message}));
async function load(){const generation=++state.generation;reset();$('connection').textContent='Caricamento';$('notice').textContent='Lettura dati dal CRM...';
try{const [opps,tasks,companies,contacts]=await Promise.all([readPages('opportunities',generation),readPages('tasks',generation),readPages('companies',generation),readPages('contacts',generation)]);if(generation!==state.generation||!opps||!tasks||!companies||!contacts)return;
state.searchCatalog=[...companies.rows.map(x=>({name:x.name||'Azienda senza nome',type:'Azienda',path:'/radix-sales.html#companies'})),...contacts.rows.map(x=>({name:x.name||'Contatto senza nome',type:'Contatto',path:'/radix-sales.html#contacts'})),...opps.rows.map(x=>({name:x.title||'Opportunità senza titolo',type:'Opportunità',path:'/radix-sales.html#opportunities'}))];state.searchComplete=opps.complete&&companies.complete&&contacts.complete;state.searchReady=true;renderSearch();
$('connection').textContent='CRM collegato';$('notice').textContent=opps.complete&&tasks.complete?'Dati aggiornati dal CRM':'Dati aggiornati dal CRM · Risultati parziali: altre pagine potrebbero essere presenti';
}catch(err){if(generation!==state.generation)return;$('connection').textContent='Accesso richiesto';$('notice').textContent=err.message;fail(err.message)}}
// The workspace last chosen in the CRM (radix.workspace, see sales.js), so every Sales page opens the same one.
const wsMemo={get(){try{return localStorage.getItem('radix.workspace')||''}catch{return ''}},set(v){try{if(v)localStorage.setItem('radix.workspace',v)}catch{}}};
async function init(){try{const workspaces=await api('workspaces');if(!workspaces.length)throw Error('Nessun workspace autorizzato');const select=$('workspace');select.replaceChildren();workspaces.forEach(w=>{const option=E('option',w.name||w.id);option.value=w.id;select.append(option)});select.disabled=false;{const kept=wsMemo.get();if([...select.options].some(o=>o.value===kept))select.value=kept}state.workspace=select.value;wsMemo.set(state.workspace);await load()}catch(err){$('connection').textContent='Accesso richiesto';$('notice').textContent=err.message;fail(err.message)}}

function renderSearch(){
 const root=$('crm-search-results'),input=$('global-search'),q=input.value.trim().toLocaleLowerCase('it');
 root.replaceChildren();input.setAttribute('aria-expanded',q?'true':'false');root.hidden=!q;
 if(!q)return;
 if(!state.searchReady){root.append(E('p','Accedi e seleziona un workspace per cercare nei dati CRM.','crm-search-hint'));return}
 const rows=state.searchCatalog.filter(x=>x.name.toLocaleLowerCase('it').includes(q)).slice(0,9);
 const header=E('div',rows.length+' risultati'+(state.searchComplete?'':' · archivio parziale'),'crm-search-caption');root.append(header);
 for(const r of rows){const link=E('a',undefined,'crm-search-result');link.href=r.path;link.append(E('b',r.name),E('small',r.type+' · apri nel CRM'));root.append(link)}
 if(!rows.length)root.append(E('p','Nessun elemento trovato nelle pagine caricate.','crm-search-hint'));
}
function go(value){const q=value.trim().toLocaleLowerCase('it');if(/lead|prospect|target|import/.test(q))location.assign('/lead-intelligence.html');else if(/contatt/.test(q))location.assign('/radix-sales.html#contacts');else if(/aziend/.test(q))location.assign('/radix-sales.html#companies');else if(/attivit|task|agenda/.test(q))location.assign('/radix-sales.html#tasks');else location.assign('/sales-pipeline-premium.html')}
$('workspace').onchange=()=>{state.workspace=$('workspace').value;wsMemo.set(state.workspace);load()};$('command-go').onclick=()=>go($('command').value);$('command').addEventListener('keydown',e=>{if(e.key==='Enter')go(e.target.value)});document.querySelectorAll('[data-command]').forEach(b=>b.onclick=()=>go(b.dataset.command));$('global-search').addEventListener('input',renderSearch);$('global-search').addEventListener('keydown',e=>{if(e.key==='Escape'){$('global-search').value='';renderSearch();return}if(e.key==='Enter'&&state.searchReady){const first=$('crm-search-results').querySelector('a');if(first)location.assign(first.href)}});document.addEventListener('click',e=>{if(!e.target.closest('.search')&&!e.target.closest('#crm-search-results')){$('crm-search-results').hidden=true;$('global-search').setAttribute('aria-expanded','false')}});init()
})();