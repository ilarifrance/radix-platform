'use strict';
(()=>{
 const $=id=>document.getElementById(id),S=window.RadixSalesnavSource;
 if(!S)return;
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 const say=(id,value)=>{$(id).textContent=value};
 const addOption=(target,value,label)=>{const opt=document.createElement('option');opt.value=value;opt.textContent=label;target.append(opt)};
 const workspace=()=>{const id=$('linkedin-workspace').value;if(!UUID.test(id))throw Error('Seleziona un workspace RADIX');return id};
 const request=async(path,params)=>{
  const resp=await fetch(path,{credentials:'same-origin',cache:'no-store',...params});
  const payload=await resp.json().catch(()=>({}));
  if(!resp.ok)throw Error(payload.error||'HTTP '+resp.status);
  return payload;
 };
 const resetConnection=()=>{
  say('linkedin-key','Da verificare');say('linkedin-account','Non verificato');say('linkedin-automation','Non attivata');
  say('linkedin-connection-pill','NON VERIFICATA');
 };
 async function check(test){
  try{
   const ws=workspace();
   say('linkedin-connection-status',test?'Verifica read-only dell’account Captain Data in corso...':'Verifica delle variabili API Preview in corso...');
   const result=await request(test?'/api/sales':'/api/sales?'+new URLSearchParams({entity:'lead_provider_status',workspace:ws}),test?{
     method:'POST',headers:{'Content-Type':'application/json','x-radix-sales':'1'},
     body:JSON.stringify({workspace:ws,entity:'lead_provider_status',action:'test',data:{}})
   }:undefined);
   say('linkedin-key',result.configured?'Configurata':'Non configurata');
   say('linkedin-automation','Non attivata');
   if(test&&result.connection==='ok'){
    say('linkedin-account',result.linked?'Presente nel provider':'Non confermato');
    say('linkedin-connection-pill',result.linked?'LINKEDIN RILEVATO':'API VERIFICATA');
    say('linkedin-connection-status',result.linked?'Captain Data restituisce una integrazione LinkedIn per l’utente configurato. La compatibilità Advanced Plus e l’azione Sales Navigator restano da collaudare.':'Chiave API valida, ma il provider non ha confermato l’integrazione LinkedIn su questo utente.');
   }else{
    say('linkedin-account','Non verificato');
    say('linkedin-connection-pill',result.configured?'API CONFIGURATA':'CONFIGURAZIONE ASSENTE');
    say('linkedin-connection-status',result.configured?'Chiave configurata in Preview. Usa Verifica collegamento per controllare l’account; nessun job verrà avviato.':'Chiave e UID Captain Data non configurati nel server Preview. Il collegamento reale richiede queste variabili.');
   }
  }catch(e){resetConnection();say('linkedin-connection-status','Verifica non riuscita: '+e.message)}
 }
 async function loadProjects(){
  const sel=$('linkedin-project');sel.replaceChildren();addOption(sel,'','Nessuno / scegli progetto');
  try{
   const ws=workspace(),res=await request('/api/sales?'+new URLSearchParams({entity:'lead_growth_projects',workspace:ws}));
   const rows=res.rows||[];
   for(const r of rows)if(UUID.test(r.id))addOption(sel,r.id,r.title);
   const pref=new URLSearchParams(location.search).get('project');
   if(pref&&rows.some(r=>r.id===pref))sel.value=pref;
  }catch(e){say('linkedin-search-status','I progetti salvati non sono ancora disponibili: '+e.message+'. Puoi preparare comunque una ricerca senza progetto.')}
 }
 async function connect(){
  try{
   const info=await request('/api/sales?entity=lead_workspaces');
   const target=$('linkedin-workspace');target.replaceChildren();addOption(target,'','Seleziona workspace RADIX');
   const list=info.rows||[];
   for(const ws of list)if(UUID.test(ws.id))addOption(target,ws.id,ws.name+' · '+ws.role);
   const selected=new URLSearchParams(location.search).get('workspace');
   if(selected&&list.some(w=>w.id===selected))target.value=selected;
   else if(list.length===1)target.value=list[0].id;
   if(target.value){await loadProjects();await check(false)}
  }catch(e){say('linkedin-connection-status','Archivio Preview non disponibile: '+e.message+'. La ricerca può comunque essere preparata, ma non verificata come connessione.')}
 }
 $('linkedin-check').onclick=()=>check(false);
 $('linkedin-test').onclick=()=>check(true);
 $('linkedin-workspace').onchange=async()=>{resetConnection();if($('linkedin-workspace').value){await loadProjects();await check(false)}};
 $('linkedin-prepare').onclick=()=>{
  try{
   const url=S.validate($('linkedin-search-url').value),requested=S.quantity($('linkedin-quantity').value);
   const project=$('linkedin-project').value,ws=$('linkedin-workspace').value;
   if(project&&(!UUID.test(project)||!UUID.test(ws)))throw Error('Seleziona un workspace valido per associare il progetto');
   const data={url,requested,at:Date.now()};
   sessionStorage.setItem('radix.salesnav.pending.v1',JSON.stringify(data));
   const path='/lead-intelligence.html'+(project?'?'+new URLSearchParams({growth_project:project,growth_workspace:ws}):'');
   say('linkedin-search-status','URL Sales Navigator verificato. Reindirizzamento al motore contatti; non è stata avviata un’acquisizione automatica.');
   location.assign(path);
  }catch(e){say('linkedin-search-status','Preparazione non riuscita: '+e.message)}
 };
 connect();
})();
