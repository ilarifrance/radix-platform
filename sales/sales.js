'use strict';
(() => {
const $ = id => document.getElementById(id);
const names = {dashboard:'Panoramica',companies:'Aziende',contacts:'Contatti',leads:'Lead',opportunities:'Opportunità',tasks:'Attività',processes:'Processi',stages:'Fasi'};
const entities = Object.keys(names).filter(x => x !== 'dashboard');
const state = {workspace:null,workspaces:[],rows:{},more:{},offset:{},errors:{},busy:false,ready:false};
let editing = null;
const transitionKeys = new Map();
function transitionKey(row,stage){const fingerprint=[state.workspace,row.id,row.version,stage.id].join(':');if(!transitionKeys.has(fingerprint))transitionKeys.set(fingerprint,crypto.randomUUID());return transitionKeys.get(fingerprint);}
const el = (tag, text, cls) => { const n=document.createElement(tag); if(text!==undefined)n.textContent=String(text); if(cls)n.className=cls; return n; };
const button = (text, fn, cls) => {const b=el('button',text,cls);b.type='button';b.addEventListener('click',fn);return b;};
const title = row => row.name || row.title || row.id;
const rows = entity => state.rows[entity] || [];
const role = () => state.workspaces.find(w=>w.id===state.workspace)?.role;
const writable = entity => state.ready && (['processes','stages'].includes(entity)?['admin','owner'].includes(role()):['member','admin','owner'].includes(role()));
function notice(message){$('status').textContent=message;}
function error(message){$('error').textContent=message || ''; $('error').hidden=!message;$('editor-error').textContent=message || '';$('editor-error').hidden=!message;}
function lock(value){state.busy=value;document.querySelectorAll('button, input, select').forEach(n=>{if(value){n.dataset.preDisabled=String(n.disabled);n.disabled=true;}else if(n.dataset.preDisabled!==undefined){n.disabled=n.dataset.preDisabled==='true';delete n.dataset.preDisabled;}});$('main').setAttribute('aria-busy',String(value));}
async function api(entity, options={}) {
 const query=new URLSearchParams({entity,offset:String(options.offset || 0)});
 if(state.workspace && entity!=='workspaces')query.set('workspace',state.workspace);
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
 try{
  const response=await fetch('/api/sales'+(options.body?'':'?'+query),{method:options.body?'POST':'GET',credentials:'same-origin',cache:'no-store',signal:controller.signal,...(options.body?{headers:{'Content-Type':'application/json','x-radix-sales':'1'},body:JSON.stringify(options.body)}:{})});
  let data;try{data=await response.json();}catch{throw new Error('Risposta server non valida ('+response.status+').');}
  if(!response.ok){if(response.status===401)throw new Error('Sessione non autenticata o scaduta. Accedi alla piattaforma sullo stesso dominio, poi premi Aggiorna.');throw new Error(typeof data.error==='string'?data.error:data.error?.message || 'Richiesta rifiutata ('+response.status+').');}
  if(!options.body && !Array.isArray(data.rows))throw new Error('Risposta API priva di rows.');
  return data;
 }catch(e){if(e.name==='AbortError')throw new Error('Tempo di attesa scaduto. Se era un salvataggio, verifica i dati con Aggiorna prima di riprovare.');throw e;}finally{clearTimeout(timer);}
}
async function load(entity, append=false){
 const offset=append?state.offset[entity]:0;
 try{const data=await api(entity,{offset});state.rows[entity]=append?[...rows(entity),...data.rows.filter(r=>!rows(entity).some(old=>old.id===r.id))]:data.rows;state.offset[entity]=offset+data.rows.length;state.more[entity]=data.rows.length===100;delete state.errors[entity];}
 catch(e){state.errors[entity]=e.message;if(!append){state.rows[entity]=[];state.more[entity]=false;}throw e;}
}
async function reload(){
 state.ready=false;state.rows={};state.more={};state.offset={};state.errors={};
 const result=await Promise.allSettled(Object.keys(names).map(entity=>load(entity)));
 state.ready=result.every(r=>r.status==='fulfilled');render();
 if(!state.ready)error('Alcuni dati non sono disponibili. Scrittura disabilitata: premi Aggiorna per riprovare.');
}
async function refresh(memberships=true){
 if(state.busy)return;lock(true);error('');notice('Caricamento dal server…');
 try{
  if(memberships){const result=await api('workspaces');state.workspaces=result.rows;if(!result.rows.some(w=>w.id===state.workspace))state.workspace=result.rows[0]?.id || null;}
  renderWorkspace();
  if(!state.workspace){state.ready=false;state.rows={};$('content').replaceChildren();$('membership').textContent='Nessun workspace disponibile. Chiedi a un amministratore di assegnarti una membership. Nessun workspace viene creato automaticamente.';notice('Nessun dato da mostrare.');return;}
  await reload();notice(state.ready?'Dati aggiornati dal server.':'Caricamento parziale.');
 }catch(e){state.ready=false;state.rows={};$('content').replaceChildren();error(e.message);notice('Caricamento non riuscito.');}
 finally{lock(false);$('workspace').disabled=!state.workspaces.length;}
}
function renderWorkspace(){const select=$('workspace');select.replaceChildren();if(!state.workspaces.length){const o=el('option','Nessuna appartenenza');o.value='';select.append(o);}state.workspaces.forEach(w=>{const o=el('option',w.name+' · '+w.role);o.value=w.id;select.append(o);});select.value=state.workspace || '';select.disabled=state.busy || !state.workspaces.length;if(state.busy)select.dataset.preDisabled=String(!state.workspaces.length);$('membership').textContent='Ruolo: '+(role() || 'non disponibile')+' · '+(role()==='viewer'?'Sola lettura.':'Le modifiche richiedono conferma e vengono salvate sul server.');}
function selectControl(labelText, choices, value){const wrap=el('div');const label=el('label',labelText);const select=el('select');choices.forEach(([v,t])=>{const o=el('option',t);o.value=v;select.append(o);});select.value=value || '';label.append(select);wrap.append(label);return {wrap,select};}
function relation(entity,id){return rows(entity).find(r=>r.id===id)?title(rows(entity).find(r=>r.id===id)):id?'Riferimento non caricato':'Non assegnato';}
function card(entity,row){
 const c=el('article',undefined,'card');c.append(el('h3',title(row)));
 if(row.company_id)c.append(el('p','Azienda: '+relation('companies',row.company_id),'muted'));
 if(entity==='opportunities')c.append(el('p','Valore: '+new Intl.NumberFormat('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(row.amount_cents || 0)/100)+' (valuta del workspace)'));
 if(entity==='processes')c.append(el('p','Tipo: '+row.kind));
 if(entity==='stages')c.append(el('p',relation('processes',row.process_id)+' · Posizione '+row.position+' · Attività automatica: '+(row.task_title || 'nessuna')));
 if(entity==='opportunities'){
  const stageRows=rows('stages').filter(s=>s.process_id===row.process_id).sort((a,b)=>a.position-b.position);
  const options=[['', 'Seleziona fase'],...stageRows.map(s=>[s.id,s.title])];
  if(row.stage_id && !stageRows.some(s=>s.id===row.stage_id))options.push([row.stage_id,'Fase corrente non caricata']);
  const control=selectControl('Fase di '+title(row),options,row.stage_id);control.select.disabled=!writable(entity);
  const move=button('Conferma cambio fase',async()=>{const stage=stageRows.find(s=>s.id===control.select.value);if(!stage || stage.id===row.stage_id)return;if(!globalThis.crypto?.randomUUID){error('Cambio fase non disponibile: apri la pagina in HTTPS.');return;}await mutate(entity,'transition',{id:row.id,version:row.version,stage_id:stage.id,key:transitionKey(row,stage)},'Spostare «'+title(row)+'» in «'+stage.title+'»?'+(stage.task_title?' Verrà creata l’attività «'+stage.task_title+'».':''));});move.disabled=!writable(entity);c.append(control.wrap,move);
 }
 if(entity==='tasks'){
  const control=selectControl('Stato di '+title(row),[['todo','Da svolgere'],['doing','In corso'],['done','Completata']],row.status);control.select.disabled=!writable(entity);
  const save=button('Conferma stato',()=>{if(control.select.value!==row.status)mutate(entity,'update',{id:row.id,version:row.version,status:control.select.value},'Aggiornare lo stato di «'+title(row)+'»?');});save.disabled=!writable(entity);c.append(control.wrap,save);
  if(row.process_id)c.append(el('p',relation('processes',row.process_id)+' · '+relation('stages',row.stage_id),'muted'));
 }
 if(writable(entity)){const a=el('div',undefined,'actions');a.append(button('Modifica',()=>openEditor(entity,row)),button('Elimina',()=>mutate(entity,'delete',{id:row.id,version:row.version},'Eliminare definitivamente «'+title(row)+'»? I collegamenti potrebbero impedire l’eliminazione.'),'danger'));c.append(a);}
 return c;
}
function render(){
 const root=$('content');root.replaceChildren();
 for(const [entity,label] of Object.entries(names)){
  const section=el('section',undefined,'panel');section.id=entity;const heading=el('div',undefined,'row');heading.append(el('h2',label));
  if(entity!=='dashboard' && writable(entity))heading.append(button('Crea · '+label,()=>openEditor(entity), 'primary'));section.append(heading);
  if(state.errors[entity])section.append(el('p',state.errors[entity],'notice'));
  if(entity==='dashboard'){
   const stats=rows(entity)[0];if(stats){const metrics=el('div',undefined,'metrics');for(const key of ['companies','contacts','leads','opportunities','tasks','open_amount_cents']){const box=el('div',undefined,'metric');box.append(el('span',names[key] || 'Valore pipeline · valuta workspace'),el('strong',key==='open_amount_cents'?new Intl.NumberFormat('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(stats[key] || 0)/100):stats[key] ?? '—'));metrics.append(box);}section.append(metrics);}else section.append(el('p','Indicatori server non disponibili.','muted'));
  }else{
   section.append(el('p',rows(entity).length+' record caricati.'+(state.more[entity]?' Elenco parziale: sono disponibili altre pagine.':'')+' I selettori includono solo i riferimenti già caricati.','muted'));
   if(entity==='opportunities' || entity==='tasks'){
    const board=el('div',undefined,'board');board.setAttribute('aria-label',label+' · vista kanban');
    const groups=entity==='tasks'?[['todo','Da svolgere'],['doing','In corso'],['done','Completate']]:rows('stages').filter(s=>rows('processes').some(p=>p.id===s.process_id && p.kind==='opportunity')).sort((a,b)=>a.position-b.position).map(s=>[s.id,relation('processes',s.process_id)+' / '+s.title]);
    const known=new Set(groups.map(g=>g[0]));if(rows(entity).some(r=>!known.has(entity==='tasks'?r.status:r.stage_id)))groups.push(['unassigned','Fase non assegnata / non caricata']);
    groups.forEach(([id,name])=>{const col=el('div',undefined,'column');const items=rows(entity).filter(r=>{const key=entity==='tasks'?r.status:r.stage_id;return id==='unassigned'?!known.has(key):key===id;});col.append(el('h3',name+' · '+items.length));items.forEach(r=>col.append(card(entity,r)));if(!items.length)col.append(el('p','Nessun record caricato.','muted'));board.append(col);});section.append(board);
   }else rows(entity).forEach(r=>section.append(card(entity,r)));
   if(!rows(entity).length)section.append(el('p','Nessun record caricato. Nessun dato dimostrativo.','muted'));
   if(state.more[entity])section.append(button('Carica altri 100 · '+label,async()=>{if(state.busy)return;lock(true);error('');notice('Caricamento pagina…');try{await load(entity,true);render();notice('Pagina caricata.');}catch(e){error(e.message);}finally{lock(false);}}));
  }
  root.append(section);
 }
 // New controls created while a request is pending must remain locked until completion.
 if(state.busy)document.querySelectorAll('#content button,#content select').forEach(n=>{n.dataset.preDisabled=String(n.disabled);n.disabled=true;});
}
async function mutate(entity,action,data,confirmation){
 if(state.busy || !writable(entity))return;if(!window.confirm(confirmation))return;
 lock(true);error('');notice('Salvataggio sul server…');let saved=false;
 try{await api(entity,{body:{workspace:state.workspace,entity,action,data}});saved=true;$('editor').close();await reload();notice(state.ready?'Modifica confermata dal server.':'Modifica salvata; ricaricamento parziale.');}
 catch(e){error(e.message+(saved?' La modifica è stata salvata.':' Verifica con Aggiorna prima di ripetere una richiesta incerta.'));notice('Operazione non completata o da verificare.');}
 finally{lock(false);}
}
function openEditor(entity,row=null){
 if(state.busy || !writable(entity))return;
 error('');editing={entity,row};$('editor-title').textContent=(row?'Modifica · ':'Crea · ')+names[entity];const fields=$('editor-fields');fields.replaceChildren();
 const addInput=(key,label,type='text',value='',required=false)=>{const box=el('div');const l=el('label',label);const input=el('input');input.name=key;input.type=type;input.value=value ?? '';input.required=required;if(type==='text')input.maxLength=200;if(type==='number'){input.min='0';input.step='1';input.max=String(Number.MAX_SAFE_INTEGER);}l.append(input);box.append(l);fields.append(box);return input;};
 const addSelect=(key,label,options,value='',required=false)=>{const control=selectControl(label,options,value);control.select.name=key;control.select.required=required;fields.append(control.wrap);return control.select;};
 const references=(entity)=>[['','Non assegnato'],...rows(entity).map(r=>[r.id,title(r)])];
 addInput(['companies','contacts'].includes(entity)?'name':'title','Nome / titolo *','text',row?title(row):'',true);
 if(!row && ['contacts','leads','opportunities'].includes(entity))addSelect('company_id','Azienda',references('companies'));
 if(!row && ['leads','opportunities'].includes(entity))addSelect('contact_id','Contatto',references('contacts'));
 if(entity==='processes' && !row)addSelect('kind','Tipo *',[['opportunity','Opportunità'],['task','Attività']],'opportunity',true);
 if(entity==='stages'){
  addSelect('process_id','Processo *',references('processes'),row?.process_id,true);addInput('position','Posizione *','number',row?.position ?? 0,true);addInput('task_title','Attività automatica al passaggio (solo opportunità)','text',row?.task_title || '');
 }
 if(entity==='opportunities' && !row)addInput('amount_cents','Importo in centesimi *','number',0,true);
 if(entity==='tasks'){
  if(!row)addSelect('opportunity_id','Opportunità collegata',references('opportunities'));
  addSelect('status','Stato *',[['todo','Da svolgere'],['doing','In corso'],['done','Completata']],row?.status || 'todo',true);
 }
 if((entity==='opportunities' && !row) || entity==='tasks'){
  const kind=entity==='tasks'?'task':'opportunity';const processes=rows('processes').filter(p=>p.kind===kind);const processChoices=[['',entity==='tasks'?'Nessun processo':'Seleziona processo'],...processes.map(p=>[p.id,p.title])];
  if(row?.process_id && !processes.some(p=>p.id===row.process_id))processChoices.push([row.process_id,'Processo corrente non caricato']);
  const process=addSelect('process_id','Processo'+(entity==='opportunities'?' *':''),processChoices,row?.process_id,entity==='opportunities');
  const stage=addSelect('stage_id','Fase',[],row?.stage_id,entity==='opportunities');
  const fill=()=>{stage.replaceChildren();const choices=[['','Nessuna fase'],...rows('stages').filter(s=>s.process_id===process.value).sort((a,b)=>a.position-b.position).map(s=>[s.id,s.title])];if(row?.stage_id && process.value===row.process_id && !choices.some(c=>c[0]===row.stage_id))choices.push([row.stage_id,'Fase corrente non caricata']);choices.forEach(([v,t])=>{const o=el('option',t);o.value=v;stage.append(o);});stage.value=process.value===row?.process_id?row?.stage_id || '':'';stage.required=Boolean(process.value);};process.addEventListener('change',fill);fill();
 }
 $('editor').showModal();fields.querySelector('input')?.focus();
}
$('editor-form').addEventListener('submit',event=>{
 event.preventDefault();if(!editing || state.busy)return;const {entity,row}=editing;const data={};
 for(const [key,value] of new FormData(event.currentTarget)){
  if(['position','amount_cents'].includes(key)){const n=Number(value);if(!Number.isSafeInteger(n) || n<0){error('Inserisci un intero non negativo valido.');return;}data[key]=n;}
  else if(key.endsWith('_id') || key==='task_title')data[key]=value.trim() || null;
  else{data[key]=value.trim();if(!data[key]){error('Compila i campi obbligatori senza usare solo spazi.');return;}}
 }
 if(row){data.id=row.id;data.version=row.version;}
 mutate(entity,row?'update':'create',data,'Confermare il salvataggio di «'+(data.name || data.title)+'» nel workspace corrente?');
});
$('editor-cancel').addEventListener('click',()=>{if(!state.busy)$('editor').close();});
$('editor').addEventListener('cancel',event=>{if(state.busy)event.preventDefault();});
$('workspace').addEventListener('change',()=>{if(state.busy)return;state.workspace=$('workspace').value;$('editor').close();refresh(false);});
$('refresh').addEventListener('click',()=>refresh(true));
for(const [entity,label] of Object.entries(names)){const a=el('a',label);a.href='#'+entity;$('navigation').append(a);}
refresh(true);
})();
