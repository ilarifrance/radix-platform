'use strict';
(()=>{
 const $=id=>document.getElementById(id),state={workspace:'',listId:'',version:0,role:'',busy:false,dirty:false};
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 const status=x=>$('archive-status').textContent=x;
 const opts=(name,value)=>{const a=document.createElement('option');a.textContent=name;a.value=value;return a};
 const writable=()=>['owner','admin','member'].includes(state.role);
 const clearCurrent=()=>{state.listId='';state.version=0;$('archive-selected').textContent='Nessuna lista caricata'};
 const working=b=>{state.busy=b;$('archive-workspace').disabled=b;$('archive-list').disabled=b;buttons()};
 const buttons=()=>{
  $('archive-save').disabled=state.busy||!writable()||!state.workspace||(Boolean($('archive-list').value)&&$('archive-list').value!==state.listId)||(Boolean(state.listId)&&$('archive-list').value!==state.listId);
  $('archive-new').disabled=state.busy||!writable()||!state.workspace;
  $('archive-load').disabled=state.busy||!state.workspace||!$('archive-list').value;
  $('archive-delete').disabled=state.busy||!writable()||!state.listId||$('archive-list').value!==state.listId;
  $('archive-refresh').disabled=state.busy||!state.workspace;
 };
 const get=async query=>{
  const url='/api/sales?'+new URLSearchParams(query).toString();
  const response=await fetch(url,{method:'GET',credentials:'same-origin',cache:'no-store'});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(result.error||'HTTP '+response.status);
  if(!Array.isArray(result.rows))throw Error('Risposta archivio non valida.');
  return result.rows;
 };
 const post=async(action,data)=>{
  const response=await fetch('/api/sales',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','x-radix-sales':'1'},body:JSON.stringify({workspace:state.workspace,entity:'lead_lists',action,data})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(result.error||'HTTP '+response.status);
  if(!Array.isArray(result.rows)||!result.rows[0]?.id)throw Error('Salvataggio non confermato.');
  return result.rows[0];
 };
 async function list(refreshSelection=''){
  const rows=await get({workspace:state.workspace,entity:'lead_lists',offset:'0'});
  const picker=$('archive-list');picker.replaceChildren(opts('Seleziona una lista salvata',''));
  for(const r of rows)picker.append(opts(r.title+' · '+r.prospect_count+' prospect',r.id));
  picker.value=refreshSelection||'';
  buttons();
  return rows;
 }
 async function connect(){
  working(true);clearCurrent();
  try{
   const workspaces=await get({entity:'lead_workspaces'}),picker=$('archive-workspace');
   picker.replaceChildren(opts('Seleziona workspace',''));
   for(const w of workspaces)picker.append(opts(w.name+' · '+w.role,w.id));
   picker.disabled=false;state.workspace='';state.role='';
   status(workspaces.length?'Seleziona il workspace in cui salvare le liste.':'Nessun workspace disponibile: chiedi l’abilitazione CRM.');
  }catch(e){status('Archivio non disponibile: '+e.message)}
  finally{working(false)}
 }
 async function selectWorkspace(){
  const target=$('archive-workspace').value;
  if(state.listId&&!window.confirm('Passare a un altro workspace? Le modifiche non salvate nella pagina potrebbero andare perse.')){$('archive-workspace').value=state.workspace;return}
  state.workspace=target;state.role=$('archive-workspace').selectedOptions?.[0]?.textContent?.split(' · ').pop()||'';
  // Role is only for interface controls. Server checks session and membership for every request.
  clearCurrent();$('archive-list').replaceChildren(opts('Seleziona una lista salvata',''));
  if(!target){buttons();return}
  working(true);
  try{await list();status('Workspace selezionato. Premi «Salva nuova» o carica una lista esistente.')}
  catch(e){status('Non riesco a leggere le liste: '+e.message)}
  finally{working(false)}
 }
 async function load(){
  const id=$('archive-list').value,workspace=state.workspace;if(!id||!workspace||state.busy)return;
  if(!window.confirm('Caricare questa lista? I prospect e le approvazioni temporanee presenti nella pagina saranno sostituiti.'))return;
  working(true);
  try{
   const rows=await get({entity:'lead_lists',workspace,id});
   if(state.workspace!==workspace)return;
   const row=rows[0];if(!row||!UUID.test(row.id)||!row.payload)throw Error('Lista non trovata.');
   window.radixLeadData.restore(row.payload);
   const count=window.radixLeadWorkflow.restoreReviews(row.payload.reviews||[]);
   state.listId=row.id;state.version=row.version;
   $('archive-title').value=row.title;$('archive-list').value=row.id;
   $('archive-selected').textContent='Lista '+row.title+' · versione '+row.version;
   status('Archivio caricato: '+row.payload.prospects.length+' prospect e '+count+' approvazioni ricostruite. Le associazioni CRM vanno riconfermate.');
  }catch(e){status('Caricamento non confermato: '+e.message)}
  finally{working(false)}
 }
 async function save(newList=false){
  if(!writable()||!state.workspace||state.busy)return;
  const title=$('archive-title').value.trim();if(title.length<1||title.length>120){status('Inserisci un nome lista (max 120 caratteri).');return}
  const data=window.radixLeadData.export(),reviews=window.radixLeadWorkflow.archiveReviews();
  const payload={...data,reviews};
  if(!data.prospects.length){status('Importa almeno un prospect reale prima di salvare.');return}
  if(!window.confirm('Salvare '+payload.prospects.length+' prospect e '+reviews.length+' revisioni nel workspace CRM? Email, basi giuridiche e bozze approvate saranno accessibili ai membri autorizzati. Nessun messaggio verrà inviato.'))return;
  working(true);
  try{
   const action=newList||!state.listId?'create':'update';
   if(action==='update'&&$('archive-list').value!==state.listId)throw Error('Carica prima la lista selezionata per evitare sovrascritture.');
   const result=await post(action,action==='create'?{title,payload}:{id:state.listId,version:state.version,title,payload});
   state.listId=result.id;state.version=result.version;
   await list(result.id);$('archive-selected').textContent='Lista '+result.title+' · versione '+result.version;
   status('Salvataggio CRM confermato · '+reviews.length+' approvazioni · versione '+result.version+'. Nessun invio.');
  }catch(e){status('Archivio non salvato: '+e.message+' Se la lista è stata modificata altrove, ricaricala prima di riprovare.')}
  finally{working(false)}
 }
 async function remove(){
  if(!state.listId||!state.version||!writable()||state.busy)return;
  if(!window.confirm('ELIMINARE definitivamente questa lista e i dati dei contatti dal workspace CRM? Questa azione non è reversibile.'))return;
  working(true);
  try{
   await post('delete',{id:state.listId,version:state.version});
   clearCurrent();$('archive-title').value='';
   await list();status('Lista eliminata dall’archivio CRM. Le informazioni ancora aperte nella pagina restano in memoria fino all’uscita.');
  }catch(e){status('Eliminazione non confermata: '+e.message)}
  finally{working(false)}
 }
 $('archive-workspace').addEventListener('change',selectWorkspace);
 $('archive-list').addEventListener('change',()=>{buttons();if(state.listId&&$('archive-list').value!==state.listId)status('Per modificare la lista selezionata, premi prima «Carica lista». La lista attualmente aperta non verrà sovrascritta.');});
 $('archive-load').addEventListener('click',load);
 $('archive-save').addEventListener('click',()=>save(false));
 $('archive-new').addEventListener('click',()=>save(true));
 $('archive-delete').addEventListener('click',remove);
 $('archive-refresh').addEventListener('click',async()=>{
  if(!state.workspace||state.busy)return;working(true);
  try{await list(state.listId);status('Elenco aggiornato. I dati correnti non sono stati sovrascritti.')}catch(e){status('Aggiornamento non riuscito: '+e.message)}finally{working(false)}
 });
 connect();
})();
