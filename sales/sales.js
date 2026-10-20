'use strict';
(() => {
const $ = id => document.getElementById(id);
const names = {dashboard:'Panoramica',companies:'Aziende',contacts:'Contatti',leads:'Lead',opportunities:'Opportunità',tasks:'Attività',interactions:'Interazioni',tickets:'Assistenza',members:'Membri',processes:'Processi',stages:'Fasi'};
const entities = Object.keys(names).filter(x => x !== 'dashboard');
const state = {me:null,workspace:null,workspaces:[],rows:{},more:{},offset:{},errors:{},search:{},taskDue:'all',busy:false,ready:false,generation:0};
let editing = null;
let customer = null;
const transitionKeys = new Map();
const ticketStatus={open:'Aperto',pending:'In attesa del cliente',resolved:'Risolto',closed:'Chiuso'},ticketChannel={email:'Email',phone:'Telefono',chat:'Chat',web:'Sito web',other:'Altro'};
function transitionKey(row,stage){const fingerprint=[state.workspace,row.id,row.version,stage.id].join(':');if(!transitionKeys.has(fingerprint))transitionKeys.set(fingerprint,crypto.randomUUID());return transitionKeys.get(fingerprint);}
const el = (tag, text, cls) => { const n=document.createElement(tag); if(text!==undefined)n.textContent=String(text); if(cls)n.className=cls; return n; };
const button = (text, fn, cls) => {const b=el('button',text,cls);b.type='button';b.addEventListener('click',fn);return b;};
const title = row => row.name || row.title || row.id;
const rows = entity => state.rows[entity] || [];
const role = () => state.workspaces.find(w=>w.id===state.workspace)?.role;
const writable = entity => state.ready && !['members','customer360'].includes(entity) && (['processes','stages'].includes(entity)?['admin','owner'].includes(role()):['member','admin','owner'].includes(role()));
// Hook for sales/crm-tools.js (CSV, segments, GDPR, follow-up automation): same state and API, no second copy.
window.RadixSalesApp={state,rows:e=>rows(e),api:(...a)=>api(...a),refresh:(...a)=>refresh(...a),role:()=>role(),writable:e=>writable(e),notice:m=>notice(m),error:m=>error(m),lock:v=>lock(v),title:r=>title(r),openCustomer:(...a)=>openCustomer(...a),edit:(e,r)=>openEditor(e,r),remove:(e,r)=>removeRecord(e,r),closeCustomer:()=>{if(customer&&!state.busy){customer=null;render();}}};
function notice(message){$('status').textContent=message;}
function error(message){$('error').textContent=message || ''; $('error').hidden=!message;$('editor-error').textContent=message || '';$('editor-error').hidden=!message;}
function lock(value){state.busy=value;document.querySelectorAll('button, input, select, textarea').forEach(n=>{if(value){n.dataset.preDisabled=String(n.disabled);n.disabled=true;}else if(n.dataset.preDisabled!==undefined){n.disabled=n.dataset.preDisabled==='true';delete n.dataset.preDisabled;}});$('main').setAttribute('aria-busy',String(value));}
class ApiError extends Error { constructor(message,status=0){super(message);this.status=status;} }
function invalidateAccess(){
 state.generation++;state.ready=false;state.workspace=null;state.workspaces=[];state.rows={};state.more={};state.offset={};state.errors={};state.search={};state.taskDue='all';editing=null;customer=null;transitionKeys.clear();
 $('editor').close();$('editor-form').reset();$('editor-fields').replaceChildren();$('editor-title').textContent='';$('content').replaceChildren();renderWorkspace();
}
function current(generation){return generation===state.generation;}
async function api(entity, options={}) {
 const generation=state.generation;
 const query=new URLSearchParams({entity,offset:String(options.offset || 0)});
 if(options.subject)query.set('subject',options.subject);
 if(options.id)query.set('id',options.id);
 if(options.search!==undefined)query.set('search',options.search);
 if(options.due!==undefined)query.set('due',options.due);
 if(state.workspace && entity!=='workspaces')query.set('workspace',state.workspace);
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
 try{
  const response=await fetch('/api/sales'+(options.body?'':'?'+query),{method:options.body?'POST':'GET',credentials:'same-origin',cache:'no-store',signal:controller.signal,...(options.body?{headers:{'Content-Type':'application/json','x-radix-sales':'1'},body:JSON.stringify(options.body)}:{})});
  let data;try{data=await response.json();}catch{data={};if(response.ok)throw new ApiError('Risposta server non valida ('+response.status+').',response.status);}
  if(!response.ok){if(current(generation) && [401,403].includes(response.status)){invalidateAccess();error('Accesso non disponibile. Accedi nuovamente o verifica la membership, poi premi Aggiorna.');}if(response.status===401)throw new ApiError('Sessione non autenticata o scaduta. Accedi alla piattaforma sullo stesso dominio, poi premi Aggiorna.',response.status);throw new ApiError(typeof data.error==='string'?data.error:data.error?.message || 'Richiesta rifiutata ('+response.status+').',response.status);}
  if(!options.body && !Array.isArray(data.rows))throw new Error('Risposta API priva di rows.');
  return data;
 }catch(e){if(e.name==='AbortError')throw new ApiError('Tempo di attesa scaduto. Se era un salvataggio, verifica i dati con Aggiorna prima di riprovare.');throw e;}finally{clearTimeout(timer);}
}
async function load(entity, append=false){
 const generation=state.generation;const offset=append?state.offset[entity]:0;
 try{const data=await api(entity,{offset,...(entity==='tasks'?{due:state.taskDue}:{}),...(state.search[entity]!==undefined?{search:state.search[entity]}:{})});if(!current(generation))return;state.rows[entity]=append?[...rows(entity),...data.rows.filter(r=>!rows(entity).some(old=>old.id===r.id))]:data.rows;state.offset[entity]=offset+data.rows.length;state.more[entity]=data.rows.length===100;delete state.errors[entity];}
 catch(e){if(!current(generation))throw e;state.errors[entity]=e.message;if(!append){state.rows[entity]=[];state.more[entity]=false;}throw e;}
}
async function reload(){
 if(!state.workspace)return;
 const generation=++state.generation;
 state.ready=false;state.rows={};state.more={};state.offset={};state.errors={};customer=null;
 const result=await Promise.allSettled(Object.keys(names).map(entity=>load(entity)));
 if(!current(generation))return;state.ready=result.every(r=>r.status==='fulfilled');render();
 if(!state.ready)error('Alcuni dati non sono disponibili. Scrittura disabilitata: premi Aggiorna per riprovare.');
}
async function refresh(memberships=true){
 if(state.busy)return;lock(true);error('');notice('Caricamento dal server…');
 try{
  if(memberships&&state.me===null){try{const r=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'});const d=r.ok?await r.json():null;state.me=Number.isInteger(d?.user?.id)?d.user.id:0;}catch{state.me=0;}}
  if(memberships){const generation=state.generation;const result=await api('workspaces');if(!current(generation))return;state.workspaces=result.rows;if(!result.rows.some(w=>w.id===state.workspace))state.workspace=result.rows[0]?.id || null;}
  renderWorkspace();
  if(!state.workspace){state.ready=false;state.rows={};$('content').replaceChildren();$('membership').textContent='Nessun workspace disponibile. Chiedi a un amministratore di assegnarti una membership. Nessun workspace viene creato automaticamente.';notice('Nessun dato da mostrare.');return;}
  await reload();notice(state.ready?'Dati aggiornati dal server.':'Caricamento parziale.');
 }catch(e){state.ready=false;state.rows={};$('content').replaceChildren();error(e.message);notice('Caricamento non riuscito.');}
 finally{lock(false);$('workspace').disabled=!state.workspaces.length;}
}
function renderWorkspace(){const select=$('workspace');select.replaceChildren();if(!state.workspaces.length){const o=el('option','Nessuna appartenenza');o.value='';select.append(o);}state.workspaces.forEach(w=>{const o=el('option',w.name+' · '+w.role);o.value=w.id;select.append(o);});select.value=state.workspace || '';select.disabled=state.busy || !state.workspaces.length;if(state.busy)select.dataset.preDisabled=String(!state.workspaces.length);$('membership').textContent='Ruolo: '+(role() || 'non disponibile')+' · '+(role()==='viewer'?'Sola lettura.':'Le modifiche richiedono conferma e vengono salvate sul server.');}
function selectControl(labelText, choices, value){const wrap=el('div');const label=el('label',labelText);const select=el('select');choices.forEach(([v,t])=>{const o=el('option',t);o.value=v;select.append(o);});select.value=value == null ? '' : String(value);label.append(select);wrap.append(label);return {wrap,select};}
function relation(entity,id){return rows(entity).find(r=>r.id===id)?title(rows(entity).find(r=>r.id===id)):id?'Riferimento non caricato':'Non assegnato';}
function card(entity,row,readonly=false){
 const c=el('article',undefined,'card');c.append(el('h3',title(row)));
 if(entity==='contacts'&&row.role)c.append(el('p',row.role,'muted'));
 if(row.company_id)c.append(el('p','Azienda: '+relation('companies',row.company_id),'muted'));
 if(['contacts','companies'].includes(entity)){const reach=[row.email,row.phone,entity==='companies'?row.city:null].filter(Boolean).join(' · ');if(reach)c.append(el('p',reach,'muted'));if(entity==='companies'&&row.website)c.append(el('p',row.website,'muted'));if(entity==='contacts')c.append(el('p',row.marketing_consent?'Consenso marketing registrato'+(row.consent_at?' il '+row.consent_at.slice(0,10):''):'Nessun consenso marketing','muted'));}
 if(entity==='opportunities'&&row.outcome&&row.outcome!=='open')c.append(el('p',row.outcome==='won'?'Vinta'+(row.closed_at?' il '+row.closed_at.slice(0,10):''):'Persa'+(row.lost_reason?' · '+row.lost_reason:''),'outcome outcome-'+row.outcome));
 if(entity==='opportunities'&&(row.probability!=null||stageProbability(row)!=null))c.append(el('p','Probabilità: '+(row.probability??stageProbability(row))+'%'+(row.probability==null?' (dalla fase)':''),'muted'));
 if(entity==='opportunities')c.append(el('p','Valore: '+new Intl.NumberFormat('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(row.amount_cents || 0)/100)+' (valuta del workspace)'));
 if(entity==='opportunities')c.append(el('p','Responsabile: '+relation('members',row.owner_id)+' · Chiusura prevista: '+(row.expected_close || 'non impostata')));
 if(entity==='processes')c.append(el('p','Tipo: '+row.kind));
 if(entity==='stages')c.append(el('p',relation('processes',row.process_id)+' · Posizione '+row.position+' · Attività automatica: '+(row.task_title || 'nessuna')));
 if(!readonly && ((entity==='opportunities'&&(!row.outcome||row.outcome==='open')) || (entity==='tasks' && row.process_id))){
  const stageRows=rows('stages').filter(s=>s.process_id===row.process_id).sort((a,b)=>a.position-b.position);
  const options=[['', 'Seleziona fase'],...stageRows.map(s=>[s.id,s.title])];
  if(row.stage_id && !stageRows.some(s=>s.id===row.stage_id))options.push([row.stage_id,'Fase corrente non caricata']);
  const control=selectControl('Fase di '+title(row),options,row.stage_id);control.select.disabled=!writable(entity);
  const move=button('Conferma cambio fase',async()=>{const stage=stageRows.find(s=>s.id===control.select.value);if(!stage || stage.id===row.stage_id)return;if(entity==='tasks'){await mutate(entity,'update',{id:row.id,version:row.version,process_id:row.process_id,stage_id:stage.id},'Confermare il cambio fase?');return;}if(!globalThis.crypto?.randomUUID){error('Cambio fase non disponibile: apri la pagina in HTTPS.');return;}await mutate(entity,'transition',{id:row.id,version:row.version,stage_id:stage.id,key:transitionKey(row,stage)},'Spostare «'+title(row)+'» in «'+stage.title+'»?'+(stage.task_title?' Verrà creata l’attività «'+stage.task_title+'».':''));});move.disabled=!writable(entity);c.append(control.wrap,move);
 }
 if(entity==='tasks' && !readonly){
  const control=selectControl('Stato di '+title(row),[['todo','Da svolgere'],['doing','In corso'],['done','Completata']],row.status);control.select.disabled=!writable(entity);
  const save=button('Conferma stato',()=>{if(control.select.value!==row.status)mutate(entity,'update',{id:row.id,version:row.version,status:control.select.value},'Aggiornare lo stato di «'+title(row)+'»?');});save.disabled=!writable(entity);c.append(control.wrap,save);
  if(row.process_id)c.append(el('p',relation('processes',row.process_id)+' · '+relation('stages',row.stage_id),'muted'));
 }
 if(row.contact_id)c.append(el('p','Contatto: '+relation('contacts',row.contact_id),'muted'));
 if(row.opportunity_id)c.append(el('p','Opportunità: '+relation('opportunities',row.opportunity_id),'muted'));
 if(entity==='members')c.append(...memberControls(row,readonly));
 if(entity==='tasks' && readonly)c.append(el('p','Stato: '+row.status+' · Fase: '+relation('stages',row.stage_id)));
 if(entity==='opportunities' && readonly)c.append(el('p','Fase: '+relation('stages',row.stage_id)));
 if(entity==='tasks')c.append(el('p','Assegnatario: '+relation('members',row.assignee_id)+' · Priorità: '+(row.priority || 'normal')+' · Scadenza UTC: '+(row.due_at || 'nessuna')));
 if(entity==='stages' && row.task_title)c.append(el('p','Regole esplicite: '+relation('members',row.task_assignee_id)+' · '+(row.task_priority || 'non impostata')+' · Giorni: '+(row.task_due_days ?? 'non impostati')));
 if(entity==='interactions'){c.append(el('p','Tipo: '+row.kind+' · Data UTC: '+row.occurred_at+(row.created_by?' · Registrata da '+relation('members',row.created_by):'')));if(row.body)c.append(el('p',row.body,'interaction-body'));}
 if(entity==='tickets'){
  c.append(el('p',(ticketStatus[row.status]||row.status)+' · Priorità: '+({low:'bassa',normal:'normale',high:'alta',urgent:'urgente'}[row.priority]||row.priority)+' · Canale: '+(ticketChannel[row.channel]||row.channel),'ticket-state ticket-'+row.status));
  c.append(el('p','Assegnato a: '+relation('members',row.assignee_id)+' · Scadenza UTC: '+(row.due_at||'nessuna')+(row.resolved_at?' · Risolto il '+row.resolved_at.slice(0,10):''),'muted'));
  if(row.body)c.append(el('p',row.body,'interaction-body'));if(row.resolution)c.append(el('p','Soluzione: '+row.resolution,'muted'));
  if(!readonly){const control=selectControl('Stato di '+title(row),Object.entries(ticketStatus),row.status);control.select.disabled=!writable(entity);
   const save=button('Conferma stato',()=>{if(control.select.value!==row.status)mutate(entity,'update',{id:row.id,version:row.version,status:control.select.value},'Portare «'+title(row)+'» in «'+ticketStatus[control.select.value]+'»?');});save.disabled=!writable(entity);c.append(control.wrap,save);}
 }
 if(!readonly && ['companies','contacts','opportunities'].includes(entity))c.append(button('Customer360',()=>openCustomer(entity,row)));
 if(!readonly && writable(entity)){const a=el('div',undefined,'actions');a.append(button('Modifica',()=>openEditor(entity,row)),button('Elimina',()=>removeRecord(entity,row),'danger'));c.append(a);}
 window.RadixCrmTools?.card(entity,row,c,readonly);
 return c;
}
// The one delete of a record, shared by the cards and the list views (sales/crm-list.js).
function removeRecord(entity,row){return mutate(entity,'delete',{id:row.id,version:row.version},'Eliminare definitivamente «'+title(row)+'»? I collegamenti potrebbero impedire l’eliminazione.');}
async function searchRecords(entity,value){
 if(state.busy || !state.workspace || !['companies','contacts'].includes(entity))return;
 if(value.length>200 || /[\u0000-\u001f\u007f]/.test(value)){error('Ricerca non valida: massimo 200 caratteri, senza caratteri di controllo.');return;}
 const generation=state.generation;state.search[entity]=value.trim();lock(true);error('');notice('Ricerca sul server…');
 try{await load(entity);if(current(generation))notice('Ricerca completata.');}
 catch(e){if(current(generation))error(e.message);}
 finally{if(current(generation))render();lock(false);if(current(generation))document.getElementById('search-'+entity)?.focus();}
}
function searchControl(entity){
 const form=el('form');const label=el('label','Cerca per nome · '+names[entity]);const input=el('input');
 input.id='search-'+entity;input.type='search';input.maxLength=200;input.value=state.search[entity] || '';label.append(input);
 const submit=el('button','Cerca');submit.type='submit';
 form.addEventListener('submit',event=>{event.preventDefault();return searchRecords(entity,input.value);});
 form.append(label,submit,button('Azzera ricerca',()=>searchRecords(entity,'')));
 return form;
}
function taskDueControl(){
 const control=selectControl('Scadenza attività / follow-up',[['all','Tutte (incluse completate)'],['overdue','Scadute aperte'],['upcoming','Prossime 168 ore · aperte'],['unscheduled','Senza scadenza · aperte']],state.taskDue);
 control.select.addEventListener('change',async()=>{
  if(state.busy || !state.workspace || !['all','overdue','upcoming','unscheduled'].includes(control.select.value))return;
  const generation=state.generation;state.taskDue=control.select.value;lock(true);error('');notice('Filtro scadenze sul server…');
  try{await load('tasks');if(current(generation))notice('Filtro scadenze aggiornato.');}
  catch(e){if(current(generation))error(e.message);}
  finally{if(current(generation))render();lock(false);}
 });
 const box=el('div');box.append(control.wrap,el('p','Filtro su tutte le attività del workspace prima della paginazione. Ora del server; prossime = da adesso incluso a 168 ore escluse. Nessun invio automatico.','muted'));return box;
}
const stageProbability=row=>rows('stages').find(s=>s.id===row.stage_id)?.probability??null;
const ROLE_NAMES={owner:'Owner',admin:'Admin',member:'Membro',viewer:'Sola lettura'};
// Owners/admins manage members; only an owner grants owner/admin (the server enforces the same rules).
function memberControls(row,readonly){
 const out=[el('p','Ruolo: '+(ROLE_NAMES[row.role]||row.role)+(row.id===state.me?' · tu':''),'muted')];
 const mine=role();if(readonly||!state.ready||!['owner','admin'].includes(mine)||row.id===state.me)return out;
 if(mine!=='owner'&&['owner','admin'].includes(row.role))return out;
 const choices=Object.entries(ROLE_NAMES).filter(([k])=>mine==='owner'||!['owner','admin'].includes(k));
 const control=selectControl('Ruolo di '+title(row),choices,row.role);
 const save=button('Cambia ruolo',()=>{if(control.select.value!==row.role)memberMutate('update',{user_id:row.id,role:control.select.value},'Cambiare il ruolo di «'+title(row)+'» in '+ROLE_NAMES[control.select.value]+'?');});
 const remove=button('Rimuovi dal workspace',()=>memberMutate('remove',{user_id:row.id},'Rimuovere «'+title(row)+'» dal workspace? Le sue trattative e attività vanno prima riassegnate.'),'danger');
 const a=el('div',undefined,'actions');a.append(save,remove);out.push(control.wrap,a);return out;
}
function inviteControl(){
 const form=el('form',undefined,'invite');form.setAttribute('aria-label','Aggiungi un membro');
 const email=el('input');email.type='email';email.required=true;email.maxLength=254;email.placeholder='email dell’account RADIX';email.setAttribute('aria-label','Email');
 const mine=role();const choices=Object.entries(ROLE_NAMES).filter(([k])=>mine==='owner'||!['owner','admin'].includes(k));
 const control=selectControl('Ruolo',choices,'member');const submit=el('button','Aggiungi membro','primary');submit.type='submit';
 form.append(email,control.wrap,submit);form.append(el('p','La persona deve avere già un account RADIX: lo crea l’amministrazione. Nessuna email viene inviata.','muted'));
 form.addEventListener('submit',event=>{event.preventDefault();memberMutate('add',{email:email.value.trim(),role:control.select.value},'Aggiungere '+email.value.trim()+' come '+ROLE_NAMES[control.select.value]+'?');});
 return form;
}
async function memberMutate(action,data,confirmation){
 if(state.busy||!window.confirm(confirmation))return;
 lock(true);error('');notice('Salvataggio sul server…');
 let ok=false;
 try{await api('members',{body:{workspace:state.workspace,entity:'members',action,data}});ok=true;}
 catch(e){error(e.message);notice('Operazione non completata.');}
 finally{lock(false);}
 if(ok){await refresh(true);notice('Membri aggiornati.');}
}
// In-app reminder: my open tasks that are overdue or due within 24 hours.
function reminderPanel(){
 if(!state.me)return null;const now=Date.now(),soon=now+864e5;
 const mine=rows('tasks').filter(t=>t.assignee_id===state.me&&t.status!=='done'&&t.due_at);
 const late=mine.filter(t=>Date.parse(t.due_at)<now),due=mine.filter(t=>{const d=Date.parse(t.due_at);return d>=now&&d<soon;});
 if(!late.length&&!due.length)return null;
 const box=el('aside',undefined,'panel reminder');box.setAttribute('role','status');
 box.append(el('strong','Promemoria'),el('p',[late.length?late.length+(late.length===1?' attività scaduta':' attività scadute'):'',due.length?due.length+' in scadenza entro 24 ore':''].filter(Boolean).join(' · ')));
 const list=el('ul');[...late,...due].slice(0,5).forEach(t=>{const li=el('li',title(t)+' · '+t.due_at.slice(0,16).replace('T',' ')+' UTC');list.append(li);});box.append(list);
 const a=el('a','Apri le attività');a.href='#tasks';box.append(a);return box;
}
function render(){
 const root=$('content');root.replaceChildren();if(!state.workspace)return;
 if(customer)root.append(customerPanel());
 const reminder=reminderPanel();if(reminder)root.append(reminder);
 for(const [entity,label] of Object.entries(names)){
  const section=el('section',undefined,'panel');section.id=entity;const heading=el('div',undefined,'row');heading.append(el('h2',label));
  if(entity!=='dashboard' && writable(entity))heading.append(button('Crea · '+label,()=>openEditor(entity), 'primary'));section.append(heading);
  if(entity==='members'&&state.ready&&['owner','admin'].includes(role()))section.append(inviteControl());
  if(['companies','contacts'].includes(entity))section.append(searchControl(entity));
  if(entity==='tasks')section.append(taskDueControl());
  if(state.search[entity])section.append(el('p','Filtro nome attivo: '+state.search[entity]+' · ricerca su tutte le anagrafiche del workspace, prima della paginazione.','muted'));
  if(state.errors[entity])section.append(el('p',state.errors[entity],'notice'));
  if(entity==='dashboard'){
   const stats=rows(entity)[0];if(stats){const metrics=el('div',undefined,'metrics');for(const key of ['companies','contacts','leads','opportunities','tasks','open_amount_cents']){const box=el('div',undefined,'metric');box.append(el('span',names[key] || 'Valore pipeline · valuta workspace'),el('strong',key==='open_amount_cents'?new Intl.NumberFormat('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(stats[key] || 0)/100):stats[key] ?? '—'));metrics.append(box);}section.append(metrics);}else section.append(el('p','Indicatori server non disponibili.','muted'));
  }else{
   section.append(el('p',rows(entity).length+' record caricati.'+(state.more[entity]?' Elenco parziale: sono disponibili altre pagine.':'')+' I selettori includono solo i riferimenti già caricati.','muted'));
   if(entity==='tickets'){
    const board=el('div',undefined,'board');board.setAttribute('aria-label','Assistenza · ticket per stato');
    Object.entries(ticketStatus).forEach(([status,name])=>{const col=el('div',undefined,'column');const items=rows(entity).filter(r=>r.status===status);col.append(el('h3',name+' — '+items.length));items.forEach(r=>col.append(card(entity,r)));if(!items.length)col.append(el('p','Nessun ticket.','muted'));board.append(col);});section.append(board);
   }else if(entity==='opportunities' || entity==='tasks'){
    const board=el('div',undefined,'board');board.setAttribute('aria-label',label+' · vista kanban');
    const kind=entity==='tasks'?'task':'opportunity';
    const groups=rows('processes').filter(p=>p.kind===kind).flatMap(p=>rows('stages').filter(s=>s.process_id===p.id).sort((a,b)=>a.position-b.position).map(s=>({name:title(p)+' / '+s.title,matches:r=>r.process_id===p.id && r.stage_id===s.id})));
    const configured=[...groups];
    if(entity==='tasks')groups.push({name:'Senza processo',matches:r=>!r.process_id && !r.stage_id});
    const open=r=>entity!=='opportunities'||!r.outcome||r.outcome==='open';
    groups.forEach(g=>{const m=g.matches;g.matches=r=>open(r)&&m(r);});
    groups.push({name:'Fase non assegnata / non caricata',matches:r=>open(r)&&!configured.some(g=>g.matches(r)) && !(entity==='tasks' && !r.process_id && !r.stage_id)});
    if(entity==='opportunities')groups.push({name:'Vinte',matches:r=>r.outcome==='won'},{name:'Perse',matches:r=>r.outcome==='lost'});
    groups.forEach(({name,matches})=>{const col=el('div',undefined,'column');const items=rows(entity).filter(matches);col.append(el('h3',name+' — '+items.length));items.forEach(r=>col.append(card(entity,r)));if(!items.length)col.append(el('p','Nessun record caricato.','muted'));board.append(col);});section.append(board);
   }else rows(entity).forEach(r=>section.append(card(entity,r)));
   window.RadixCrmTools?.section(entity,section);
   if(!rows(entity).length)section.append(el('p',state.errors[entity]?'Dati non disponibili: riprova la ricerca o premi Aggiorna.':state.search[entity]?'Nessun risultato per la ricerca.':'Nessun record caricato. Nessun dato dimostrativo.','muted'));
   if(state.more[entity])section.append(button('Carica altri 100 · '+label,async()=>{if(state.busy)return;lock(true);error('');notice('Caricamento pagina…');try{await load(entity,true);render();notice('Pagina caricata.');}catch(e){error(e.message);}finally{lock(false);}}));
  }
  root.append(section);
 }
 // New controls created while a request is pending must remain locked until completion.
 if(state.busy)document.querySelectorAll('#content button,#content select,#content input').forEach(n=>{n.dataset.preDisabled=String(n.disabled);n.disabled=true;});
}
function validUTC(value){
 const match=/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.\d{1,3})?Z$/.exec(value);
 if(!match||value.startsWith('0000-'))return false;const date=new Date(value);return Number.isFinite(date.getTime()) && date.toISOString().slice(0,19)===match[1]+'T'+match[2];
}
async function openCustomer(subject,row){
 if(state.busy || !state.workspace)return;
 customer={subject,id:row.id,title:title(row),rows:[],offset:0,more:false,error:''};await loadCustomer();$('customer360')?.focus();
}
async function loadCustomer(append=false){
 if(state.busy || !customer)return;
 const selected=customer,generation=state.generation;lock(true);error('');
 try{
  const data=await api('customer360',{subject:selected.subject,id:selected.id,offset:append?selected.offset:0});
  if(!current(generation) || customer!==selected)return;
  selected.rows=append?[...selected.rows,...data.rows]:data.rows;selected.offset=(append?selected.offset:0)+data.rows.length;selected.more=data.rows.length===100;selected.error='';
 }catch(e){if(current(generation) && customer===selected)selected.error=e.message;}
 finally{if(current(generation) && customer===selected)render();lock(false);}
}
function customerPanel(){
 const panel=el('section',undefined,'panel customer360');panel.id='customer360';panel.tabIndex=-1;
 const heading=el('div',undefined,'row');heading.append(el('h2','Customer360 · '+customer.title),button('Chiudi Customer360',()=>{if(!state.busy){customer=null;render();}}));panel.append(heading);
 panel.append(el('p','Relazioni restituite dal server, inclusa la scheda selezionata. '+customer.rows.length+' record caricati. Vista sola lettura; le modifiche sono nelle sezioni dedicate.','muted'));
 if(customer.error)panel.append(el('p',customer.error,'notice'),button('Riprova Customer360',()=>loadCustomer(customer.offset>0)));
 // Riepilogo AI and the activity composer for this record (sales/crm-record.js).
 if(customer.rows.length)window.RadixCrmRecord?.mount(panel,{subject:customer.subject,id:customer.id,title:customer.title,rows:customer.rows});
 customer.rows.forEach(item=>{const group=el('div');group.append(el('h3',names[item.entity] || item.entity),card(item.entity,item.record,true));panel.append(group);});
 if(!customer.rows.length && !customer.error)panel.append(el('p','Nessun record restituito.','muted'));
 if(customer.more)panel.append(button('Carica altri 100 · Customer360',()=>loadCustomer(true)));
 return panel;
}
async function mutate(entity,action,data,confirmation){
 if(state.busy || !writable(entity))return;if(!window.confirm(confirmation))return;
 lock(true);error('');notice('Salvataggio sul server…');let saved=false;
 const generation=state.generation;
 try{await api(entity,{body:{workspace:state.workspace,entity,action,data}});if(!current(generation))return;saved=true;$('editor').close();await reload();notice(state.ready?'Modifica confermata dal server.':'Modifica salvata; ricaricamento parziale.');}
 catch(e){const advice=[401,403].includes(e.status)?' Accesso invalidato: verifica sessione e membership, poi premi Aggiorna.':e.status===409?' Conflitto: premi Aggiorna prima di modificare nuovamente.':' Verifica con Aggiorna prima di ripetere una richiesta incerta.';error(e.message+(saved?' La modifica è stata salvata.':advice));notice('Operazione non completata o da verificare.');}
 finally{lock(false);}
}
// Aziende e Contatti as in Salesforce: «Informazioni», addresses, «Dati fiscali», «Altro», each a
// section that folds (closed on a phone except the first). Fields from sales/crm-fields-core.js.
function recordSections(entity,row,host,references,selectControl){
 const RF=window.RadixCrmFields;const wide=!window.matchMedia||window.matchMedia('(min-width: 700px)').matches;
 // Archive without migration 011: rows come back without the added keys, so those fields stay read-only.
 const loaded=rows(entity),missing=loaded.length>0&&!loaded.some(r=>RF.supported(entity,r));
 if(missing)host.append(el('p','Questo archivio non ha ancora i campi aggiuntivi (ragione sociale, indirizzi, dati fiscali…): arrivano con la migrazione sales 011, da approvare. Gli altri campi si salvano normalmente.','notice rf-missing'));
 const inputs={};
 RF.SECTIONS[entity].forEach((sec,i)=>{
  const box=el('details',undefined,'rf-sec');box.dataset.section=sec.id;box.open=wide||i===0;
  const sum=el('summary');const count=el('small',undefined,'rf-count');sum.append(el('span',sec.label),count);box.append(sum);
  const grid=el('div',undefined,'rf-grid');box.append(grid);
  for(const fd of sec.fields){
   const value=RF.formValue(entity,fd.key,row);let control,wrap;
   if(['select','member','company','contact'].includes(fd.type)){
    let choices=fd.type==='select'?[['','Non impostato'],...fd.options]:references(fd.type==='member'?'members':fd.type==='company'?'companies':'contacts',row?.[fd.key]);
    if(row&&((fd.type==='company'&&entity==='companies')||(fd.type==='contact'&&entity==='contacts')))choices=choices.filter(([v])=>v!==row.id);
    const c=selectControl(fd.label,choices,value);control=c.select;wrap=c.wrap;
   }else{
    wrap=el('div');const l=el('label',fd.label);
    if(fd.type==='area'){control=el('textarea');control.rows=3;wrap.className='rf-full';}
    else{control=el('input');control.type={email:'email',url:'url',tel:'tel',date:'date',int:'number'}[fd.type]||'text';
     if(fd.type==='int'){control.min='0';control.step='1';control.max='10000000';control.inputMode='numeric';}
     if(fd.type==='money'){control.inputMode='decimal';control.placeholder='Es. 1.250.000';}
     if(fd.type==='date'){control.min='1900-01-01';control.max=new Date().toISOString().slice(0,10);}
     if(fd.type==='url')control.placeholder='https://';
     if(['vat','taxcode','sdi'].includes(fd.type)){control.autocapitalize='characters';control.spellcheck=false;}}
    if(fd.max)control.maxLength=fd.max;control.value=value;l.append(control);wrap.append(l);
   }
   control.name=fd.key;if(fd.added&&missing){control.disabled=true;control.dataset.rfMissing='1';}
   if(fd.hint)wrap.append(el('small',fd.hint,'rf-hint'));
   if(['street'].some(x=>fd.key.endsWith(x)))wrap.classList.add('rf-full');
   grid.append(wrap);inputs[fd.key]=control;
  }
  if(sec.id==='shipping')grid.prepend(Object.assign(button('Copia l’indirizzo di fatturazione',()=>{for(const k of ['street','zip','city','province','country']){const from=inputs['billing_'+k],to=inputs['shipping_'+k];if(from&&to&&!to.disabled)to.value=from.value;}update();},'rf-copy'),{title:'Riempie i campi qui sotto con quelli dell’indirizzo di fatturazione'}));
  const update=()=>{const n=sec.fields.filter(fd=>inputs[fd.key]&&String(inputs[fd.key].value||'').trim()).length;count.textContent=n?n+(n===1?' compilato':' compilati'):'';};
  box.addEventListener('input',update);box.addEventListener('change',update);update();
  host.append(box);
 });
 if(entity==='contacts'){const name=host.querySelector('input[name="name"]'),hint=()=>{if(name)name.placeholder=RF.displayName(inputs.first_name?.value,inputs.last_name?.value)||'Vuoto = Nome e Cognome';};
  for(const k of ['first_name','last_name'])inputs[k]?.addEventListener('input',hint);hint();}
}
function openEditor(entity,row=null){
 if(state.busy || !writable(entity))return;
 error('');editing={entity,row};$('editor-title').textContent=(row?'Modifica · ':'Crea · ')+names[entity];const fields=$('editor-fields');fields.replaceChildren();
 const addInput=(key,label,type='text',value='',required=false)=>{const box=el('div');const l=el('label',label);const input=el('input');input.name=key;input.type=type;input.value=value ?? '';input.required=required;if(type==='text')input.maxLength=200;if(type==='number'){input.min='0';input.step='1';input.max=String(Number.MAX_SAFE_INTEGER);}l.append(input);box.append(l);fields.append(box);return input;};
 const addSelect=(key,label,options,value='',required=false)=>{const control=selectControl(label,options,value);control.select.name=key;control.select.required=required;fields.append(control.wrap);return control.select;};
 const references=(entity,value)=>{const choices=[['','Non assegnato'],...rows(entity).map(r=>[r.id,title(r)])];if(value && !rows(entity).some(r=>r.id===value))choices.push([value,'Riferimento corrente non caricato']);return choices;};
 const priorities=[['low','Bassa'],['normal','Normale'],['high','Alta'],['urgent','Urgente']];
 const utcInput=(key,label,value,required=false)=>{const input=addInput(key,label,'text',value || '',required);input.placeholder='2026-10-10T14:30:00Z';fields.append(el('small','ISO UTC esplicito: YYYY-MM-DDTHH:mm:ssZ. Nessuna conversione locale.'));return input;};
 const RF=window.RadixCrmFields,record=!!RF&&['companies','contacts'].includes(entity);$('editor').classList?.toggle('rf-wide',record);
 if(record&&entity==='contacts'){const n=addInput('name','Nome visualizzato','text',row?.name||'',false);n.placeholder='Vuoto = Nome e Cognome';}
 else addInput(['companies','contacts'].includes(entity)?'name':'title',record?'Nome azienda *':'Nome / titolo *','text',row?title(row):'',true);
 const addText=(key,label,max,type='text')=>{const input=addInput(key,label,type,row?.[key]||'');input.maxLength=max;return input;};
 const addArea=(key,label,max)=>{const l=el('label',label);const t=el('textarea');t.name=key;t.maxLength=max;t.rows=4;t.value=row?.[key]||'';l.append(t);fields.append(l);return t;};
 if(record)recordSections(entity,row,fields,references,selectControl);
 if(entity==='companies'&&!record){addText('industry','Settore',120);addText('website','Sito web',300,'url').placeholder='https://';addText('email','Email',254,'email');addText('phone','Telefono',40,'tel');addText('city','Città',120);addArea('notes','Note',4000);}
 if(entity==='contacts'&&!record){addText('role','Ruolo',120);addText('email','Email',254,'email');addText('phone','Telefono',40,'tel');addText('linkedin_url','Profilo LinkedIn',300,'url').placeholder='https://';addArea('notes','Note',4000);
  const l=el('label');const box=el('input');box.type='checkbox';box.name='marketing_consent';box.checked=Boolean(row?.marketing_consent);l.append(box,el('span',' Ha dato il consenso a ricevere comunicazioni marketing'));fields.append(l);
  fields.append(el('small','Registra il consenso solo se la persona lo ha dato esplicitamente. Togliendo la spunta si registra la revoca.'));}
 if(entity==='contacts'&&record){const l=el('label');const box=el('input');box.type='checkbox';box.name='marketing_consent';box.checked=Boolean(row?.marketing_consent);l.append(box,el('span',' Ha dato il consenso a ricevere comunicazioni marketing'));fields.append(l);
  fields.append(el('small','Registra il consenso solo se la persona lo ha dato esplicitamente. Togliendo la spunta si registra la revoca.'));}
 if(['contacts','leads','opportunities','tasks','interactions','tickets'].includes(entity)&&!(record&&entity==='contacts'))addSelect('company_id','Azienda',references('companies',row?.company_id),row?.company_id);
 if(['leads','opportunities','tasks','interactions','tickets'].includes(entity))addSelect('contact_id','Contatto',references('contacts',row?.contact_id),row?.contact_id);
 if(['leads','opportunities','tasks','interactions'].includes(entity))fields.append(el('p','Se scegli un contatto, indica la sua azienda. Se colleghi un’opportunità, riporta esattamente la sua azienda e il suo contatto (anche i valori non assegnati). Il server rifiuta combinazioni incoerenti.','muted'));
 if(entity==='interactions')fields.append(el('p','Collega almeno un’azienda, un contatto o un’opportunità. Registrare un’email non la invia.','muted'));
 if(entity==='tickets'){
  fields.append(el('p','Se scegli un contatto, indica anche la sua azienda: il server rifiuta combinazioni incoerenti.','muted'));
  addArea('body','Descrizione della richiesta',4000);
  addSelect('status','Stato *',Object.entries(ticketStatus),row?.status||'open',true);
  addSelect('priority','Priorità *',priorities,row?.priority||'normal',true);
  addSelect('channel','Canale *',Object.entries(ticketChannel),row?.channel||'email',true);
  addSelect('assignee_id','Assegnato a',references('members',row?.assignee_id),row?.assignee_id);
  utcInput('due_at','Scadenza UTC (opzionale)',row?.due_at);
  addArea('resolution','Soluzione (quando lo risolvi)',4000);
 }
 if(entity==='processes' && !row)addSelect('kind','Tipo *',[['opportunity','Opportunità'],['task','Attività']],'opportunity',true);
 if(entity==='stages'){
  addSelect('process_id','Processo *',references('processes',row?.process_id),row?.process_id,true);addInput('position','Posizione *','number',row?.position ?? 0,true);addInput('task_title','Attività automatica al passaggio (solo opportunità)','text',row?.task_title || '');
 }
 if(entity==='stages'){
  addSelect('task_assignee_id','Assegnatario attività automatica',references('members',row?.task_assignee_id),row?.task_assignee_id);
  addSelect('task_priority','Priorità attività automatica',[['','Non impostata'],...priorities],row?.task_priority);
  const days=addInput('task_due_days','Scadenza attività automatica (giorni 0–3650)','number',row?.task_due_days ?? '');days.max='3650';
  const sp=addInput('probability','Probabilità di chiusura in questa fase %','number',row?.probability ?? '');sp.max='100';
  fields.append(el('p','Con un titolo automatico, specifica tutte e tre le regole. Senza titolo, lascia tutte le regole vuote.','muted'));
 }
 if(entity==='interactions'){
  addSelect('kind','Tipo *',[['note','Nota'],['call','Telefonata'],['meeting','Incontro'],['email','Email registrata']],row?.kind || 'note',true);
  utcInput('occurred_at','Data interazione UTC *',row?.occurred_at,true);
  addSelect('opportunity_id','Opportunità collegata',references('opportunities',row?.opportunity_id),row?.opportunity_id);
  const label=el('label','Testo (opzionale, massimo 4000 caratteri)');const body=el('textarea');body.name='body';body.maxLength=4000;body.rows=6;body.value=row?.body || '';label.append(body);fields.append(label);
 }
 if(entity==='opportunities'){
  addInput('amount_cents','Importo in centesimi *','number',row?.amount_cents ?? 0,true);
  addSelect('owner_id','Responsabile opportunità',references('members',row?.owner_id),row?.owner_id);
  const close=addInput('expected_close','Chiusura prevista (opzionale)','date',row?.expected_close || '');close.min='0001-01-01';close.max='9999-12-31';
  fields.append(el('small','Data di calendario YYYY-MM-DD, senza ora o fuso. Responsabile e data possono restare non impostati; nessun valore è dedotto.'));
  const prob=addInput('probability','Probabilità di chiusura % (vuoto = quella della fase)','number',row?.probability ?? '');prob.max='100';
  if(row){addSelect('outcome','Esito',[['open','Aperta'],['won','Vinta'],['lost','Persa']],row.outcome||'open',true);addText('lost_reason','Motivo della perdita (obbligatorio se persa)',500);}
 }
 if(entity==='tasks'){
  addSelect('assignee_id','Assegnatario',references('members',row?.assignee_id),row?.assignee_id);
  addSelect('priority','Priorità *',priorities,row?.priority || 'normal',true);
  utcInput('due_at','Scadenza UTC (opzionale)',row?.due_at);
  addSelect('opportunity_id','Opportunità collegata',references('opportunities',row?.opportunity_id),row?.opportunity_id);
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
 const RF=window.RadixCrmFields,record=!!RF&&['companies','contacts'].includes(entity);
 for(const [key,value] of new FormData(event.currentTarget)){
  // Aziende e Contatti: every field of crm-fields-core.js is parsed (and checked) the same way.
  if(record&&key==='name'&&entity==='contacts'){data.name=value.trim();continue;}
  if(record&&key!=='name'&&RF.fieldOf(entity,key)){const r=RF.parse(entity,key,value,{selfId:row?.id});if(r.error){error(r.error);return;}data[key]=r.value;continue;}
  if(['position','amount_cents'].includes(key)){const n=Number(value);if(!Number.isSafeInteger(n) || n<0){error('Inserisci un intero non negativo valido.');return;}data[key]=n;}
  else if(['owner_id','assignee_id','task_assignee_id','task_due_days'].includes(key)){
   if(!value.trim())data[key]=null;
   else{const n=Number(value);if(!/^\d+$/.test(value) || !Number.isSafeInteger(n) || (key==='task_due_days'?(n<0 || n>3650):(n<1 || n>2147483647))){error('Assegnatario o giorni non validi.');return;}data[key]=n;}
  }
  else if(key==='expected_close'){
   const v=value.trim();if(!v)data[key]=null;
   else if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!validUTC(v+'T00:00:00Z')){error('Usa una data di chiusura reale YYYY-MM-DD.');return;}else data[key]=v;
  }
  else if(['due_at','occurred_at'].includes(key)){
   const v=value.trim();if(!v && key==='due_at')data[key]=null;
   else if(!validUTC(v)){error('Usa una data reale ISO UTC esplicita, ad esempio 2026-10-10T14:30:00Z.');return;}else data[key]=v;
  }
  else if(['website','industry','email','phone','city','notes','role','linkedin_url','lost_reason','resolution'].includes(key))data[key]=value.trim()||null;
  else if(key==='marketing_consent')continue;
  else if(key==='outcome')data[key]=value;
  else if(key==='probability'){const v=value.trim();if(!v)data[key]=null;else{const n=Number(v);if(!/^\d+$/.test(v)||n>100){error('La probabilità è un numero da 0 a 100.');return;}data[key]=n;}}
  else if(key==='body'){data[key]=value.trim();if(data[key].length>4000){error('Il testo supera 4000 caratteri.');return;}}
  else if(key==='task_priority')data[key]=value || null;
  else if(key.endsWith('_id') || key==='task_title')data[key]=value.trim() || null;
  else{data[key]=value.trim();if(!data[key]){error('Compila i campi obbligatori senza usare solo spazi.');return;}}
 }
 if(entity==='stages'){
  const rules=[data.task_assignee_id,data.task_priority,data.task_due_days];
  if(data.task_title?rules.some(v=>v==null):rules.some(v=>v!=null)){error('Titolo automatico e tutte e tre le regole devono essere compilati insieme, oppure tutti vuoti.');return;}
 }
 if(record){
  if(entity==='contacts'&&!data.name)data.name=RF.displayName(data.first_name,data.last_name);
  if(!data.name){error(entity==='contacts'?'Indica il nome visualizzato oppure Nome e Cognome.':'Indica il nome dell’azienda.');return;}
  // Added fields left as stored are not resent: an archive without migration 011 still saves the rest.
  const kept=RF.prune(entity,data,row);for(const k of Object.keys(data))if(!Object.hasOwn(kept,k))delete data[k];
 }
 if(entity==='contacts'){const consent=Boolean(event.currentTarget.elements.marketing_consent?.checked);data.marketing_consent=consent;data.consent_at=consent?(row?.marketing_consent&&row.consent_at?row.consent_at:new Date().toISOString().slice(0,19)+'Z'):null;}
 if(entity==='opportunities'&&row){if(data.outcome==='lost'&&!data.lost_reason){error('Indica il motivo della perdita.');return;}if(data.outcome!=='lost')delete data.lost_reason;
  // Unchanged fields are not resent: the server rejects lost_reason on an open/won deal.
  for(const k of ['outcome','lost_reason','probability'])if(Object.hasOwn(data,k)&&data[k]===(row[k]??null))delete data[k];}
 if(row){data.id=row.id;data.version=row.version;}
 mutate(entity,row?'update':'create',data,'Confermare il salvataggio di «'+(data.name || data.title)+'» nel workspace corrente?');
});
$('editor-cancel').addEventListener('click',()=>{if(!state.busy)$('editor').close();});
$('editor').addEventListener('cancel',event=>{if(state.busy)event.preventDefault();});
$('workspace').addEventListener('change',()=>{if(state.busy)return;state.search={};state.taskDue='all';state.workspace=$('workspace').value;$('editor').close();refresh(false);});
$('refresh').addEventListener('click',()=>refresh(true));
for(const [entity,label] of Object.entries(names)){const a=el('a',label);a.href='#'+entity;$('navigation').append(a);}
refresh(true);
})();
