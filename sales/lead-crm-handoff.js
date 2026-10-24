'use strict';
(()=>{
 const $=id=>document.getElementById(id);
 const state={prospects:[],workspace:'',checked:null,linked:new Map(),busy:false,epoch:0,attempted:new Set()};
 const norm=value=>String(value??'').trim().normalize('NFKC').toLocaleLowerCase('it');
 const key=i=>state.workspace+'|'+i;
 const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
 const status=msg=>$('sync-status').textContent=msg;
 const selectedIndex=()=>Number($('sync-prospect').value);
 const prospect=()=>state.prospects[selectedIndex()];
 const approval=i=>window.radixLeadWorkflow?.approvalFor(i)||null;
 const el=(tag,value)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=String(value);return n};
 function controls(){
  const linked=state.linked.get(key(selectedIndex()));
  $('sync-linked').hidden=!linked;
  $('sync-create-contact').disabled=state.busy||!linked||Boolean(linked.contactId)||!approval(selectedIndex())?.contact?.trim()||state.attempted.has(key(selectedIndex())+'|contact');
  $('sync-create-lead').disabled=state.busy||!linked||!approval(selectedIndex())||Boolean(linked.leadId)||state.attempted.has(key(selectedIndex())+'|lead');
  if(linked)$('sync-linked-title').textContent='Azienda CRM collegata: '+(prospect()?.name||'Scheda esistente');
 }
 function reset(msg){
  state.epoch++;state.checked=null;
  $('sync-confirm').disabled=true;$('sync-matches').replaceChildren();
  status(msg||'Verifica i duplicati prima di registrare una nuova azienda.');
  controls();
 }
 async function get(url){
  const response=await fetch(url,{credentials:'same-origin',cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||data.message||'CRM HTTP '+response.status);
  if(!Array.isArray(data.rows))throw Error('Il CRM ha restituito un formato inatteso');
  return data.rows;
 }
 async function create(entity,data){
  const response=await fetch('/api/sales',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','x-radix-sales':'1'},body:JSON.stringify({workspace:state.workspace,entity,action:'create',data})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(result.error||'CRM HTTP '+response.status);
  const created=result.rows?.[0];if(!uuid(created?.id))throw Error('Risposta CRM priva di un identificativo verificabile');
  return created.id;
 }
 async function search(entity,term){
  const values=new URLSearchParams({entity,workspace:state.workspace,search:term,offset:'0'});
  return get('/api/sales?'+values);
 }
 async function readAllLeads(){
  const rows=[];
  for(let page=0;page<10;page++){
   const q=new URLSearchParams({entity:'leads',workspace:state.workspace,offset:String(rows.length)});
   const slice=await get('/api/sales?'+q);
   rows.push(...slice);
   if(slice.length<100)return rows;
  }
  throw Error('Archivio CRM oltre 1.000 lead: controllo completo duplicati non disponibile. Verifica nel CRM.');
 }
 function linkCompany(i,companyId,existing=false){
  if(!uuid(companyId))throw Error('ID azienda CRM non valido');
  const entry={companyId,workspace:state.workspace,contactId:null,leadId:null,existing};
  state.linked.set(key(i),entry);
  reset(existing?'Azienda esistente collegata: nessuna nuova azienda creata.':'Azienda creata e collegata al CRM.');
  $('sync-linked-status').textContent='Azienda collegata. Referente e lead richiedono conferme separate.';
  window.dispatchEvent(new CustomEvent('radix:lead-crm-created',{detail:{index:i,workspace:state.workspace,companyId}}));
 }
 function refresh(items){
  state.prospects=Array.isArray(items)?items.slice(0,250):[];
  state.linked.clear();state.attempted.clear();
  const select=$('sync-prospect');select.replaceChildren();
  state.prospects.forEach((p,i)=>{const o=el('option',p.name||p.domain||'Prospect '+(i+1));o.value=String(i);select.append(o)});
  if(!state.prospects.length)select.append(el('option','Qualifica prima la lista'));
  select.disabled=!state.prospects.length;
  $('sync-check').disabled=!state.prospects.length||!state.workspace;
  reset('Approva e verifica il prospect prima di creare o collegare una scheda CRM.');
 }
 async function connect(){
  try{
   const workspaces=await get('/api/sales?entity=workspaces');
   const authorized=workspaces.filter(w=>['owner','admin','member'].includes(w.role));
   if(!authorized.length)throw Error('Nessun workspace CRM con permessi di scrittura');
   const select=$('sync-workspace');select.replaceChildren();
   for(const w of authorized){const o=el('option',w.name||w.id);o.value=w.id;select.append(o)}
   window.RadixLeadFlow?.preferWorkspace(select);select.disabled=false;state.workspace=select.value;
   $('sync-check').disabled=!state.prospects.length;
   reset('Workspace autorizzato collegato. Verifica il prospect prima della registrazione.');
  }catch(e){reset('CRM non collegato: '+e.message)}
 }
 $('sync-workspace').addEventListener('change',()=>{state.workspace=$('sync-workspace').value;reset('Workspace cambiato: ripeti controllo duplicati e conferma.')});
 window.addEventListener('radix:lead-approval-changed',e=>{if(e.detail?.approved===false&&Number(e.detail.index)===selectedIndex())reset('Revisione modificata o revocata: ricontrolla il prospect prima di procedere nel CRM.');});
 $('sync-prospect').addEventListener('change',()=>reset('Prospect selezionato: controlla le corrispondenze in CRM.'));
 $('sync-check').addEventListener('click',async()=>{
  const i=selectedIndex(),p=prospect(),a=approval(i),name=p?.name?.trim();
  if(state.busy||!state.workspace)return;
  if(!a){reset('Questo prospect richiede prima la revisione umana e approvazione.');return}
  if(!name||name.length>200){reset('Indica un nome azienda valido, massimo 200 caratteri.');return}
  state.busy=true;reset('Ricerca aziende CRM in corso…');$('sync-check').disabled=true;
  const epoch=state.epoch,workspace=state.workspace;
  try{
   const matches=await search('companies',name);
   if(epoch!==state.epoch||workspace!==state.workspace||p!==prospect())return;
   const same=matches.filter(x=>norm(x.name)===norm(name)&&uuid(x.id));
   if(matches.length){
    $('sync-matches').append(el('p','Corrispondenze trovate ('+matches.length+'):'));
    for(const row of matches.slice(0,8))$('sync-matches').append(el('p','• '+(row.name||'Azienda senza nome')));
   }
   if(matches.length>=100){status('Verifica incompleta (100+ aziende): non è sicuro creare una nuova azienda.');return}
   if(same.length){
    status('Azienda già presente. Associa la scheda esistente per evitare un duplicato.');
    for(const found of same.slice(0,8)){
     const button=el('button','✓ Usa azienda esistente · '+found.name);
     button.type='button';button.className='crm-existing-button';
     button.addEventListener('click',()=>{
      if(!approval(i)){reset('Approvazione revocata: ripeti la revisione.');return}
      if(!window.confirm('Associare il prospect alla società CRM esistente "'+found.name+'"? Non verrà creata alcuna azienda.'))return;
      linkCompany(i,found.id,true);
     });
     $('sync-matches').append(button);
    }
   }else{
    state.checked={index:i,name,workspace};$('sync-confirm').disabled=false;
    status(matches.length?'Controlla le corrispondenze prima di creare la nuova azienda.':'Nessuna corrispondenza nominale nella ricerca CRM. Verifica e conferma la creazione.');
   }
  }catch(e){if(epoch===state.epoch)reset('Verifica duplicati non riuscita: '+e.message)}
  finally{state.busy=false;$('sync-check').disabled=!state.workspace||!state.prospects.length;controls()}
 });
 $('sync-confirm').addEventListener('click',async()=>{
  const c=state.checked;
  if(state.busy||!c||!approval(c.index)||c.workspace!==state.workspace||c.index!==selectedIndex()||c.name!==prospect()?.name?.trim())return;
  if(!window.confirm('Creare la scheda azienda "'+c.name+'" nel workspace CRM? Non verranno inviati messaggi.'))return;
  state.busy=true;$('sync-confirm').disabled=true;
  const epoch=state.epoch;const writeKey=key(c.index)+'|company';
  if(state.attempted.has(writeKey)){state.busy=false;reset('Creazione già tentata: verifica prima il CRM.');return}
  state.attempted.add(writeKey);
  try{
   const companyId=await create('companies',{name:c.name});
   if(epoch!==state.epoch){reset('Azienda registrata, ma la selezione è cambiata. Controlla il CRM.');return}
   linkCompany(c.index,companyId,false);
  }catch(e){if(epoch===state.epoch)reset('Esito creazione non confermato: '+e.message+'. Controlla il CRM prima di ripetere.')}
  finally{state.busy=false;controls()}
 });
 $('sync-create-contact').addEventListener('click',async()=>{
  const i=selectedIndex(),link=state.linked.get(key(i)),a=approval(i);
  if(!link||!a||!a.contact?.trim()||state.busy)return;
  const name=a.contact.trim();
  if(name.length>200){$('sync-linked-status').textContent='Nome referente troppo lungo (max 200).';return}
  state.busy=true;controls();
  const epoch=state.epoch,ws=state.workspace,idx=i;
  try{
   const matches=await search('contacts',name);
   if(epoch!==state.epoch||idx!==selectedIndex()||ws!==state.workspace)return;
   if(matches.length>=100)throw Error('Verifica incompleta dei contatti: almeno 100 corrispondenze.');
   const existing=matches.find(c=>norm(c.name)===norm(name)&&c.company_id===link.companyId&&uuid(c.id));
   if(existing){
    if(!window.confirm('Referente "'+name+'" già registrato per questa azienda. Usare il contatto esistente?'))return;
    link.contactId=existing.id;
    $('sync-linked-status').textContent='Referente CRM esistente collegato. Nessuna nuova scheda creata.';
    return;
   }
   if(!window.confirm('Registrare il referente "'+name+'" per '+prospect().name+'? Attenzione: l’email NON sarà salvata nell’attuale schema CRM.'))return;
   const mark=key(i)+'|contact';if(state.attempted.has(mark))throw Error('Tentativo precedente: verifica prima i contatti CRM');
   state.attempted.add(mark);
   const id=await create('contacts',{name,company_id:link.companyId});
   if(epoch!==state.epoch||idx!==selectedIndex()||ws!==state.workspace){$('sync-linked-status').textContent='Referente creato, ma contesto cambiato. Verifica il CRM.';return}
   link.contactId=id;$('sync-linked-status').textContent='Referente registrato nel CRM. Email e provenienza restano nella sessione locale.';
  }catch(e){$('sync-linked-status').textContent='Registrazione non confermata: '+e.message+'. Verifica il CRM prima di ripetere.'}
  finally{state.busy=false;controls()}
 });
 $('sync-create-lead').addEventListener('click',async()=>{
  const i=selectedIndex(),link=state.linked.get(key(i)),a=approval(i),p=prospect();
  if(!link||!a||!p||state.busy)return;
  state.busy=true;controls();const epoch=state.epoch,ws=state.workspace;
  try{
   const title=('Lead Intelligence · '+p.name).slice(0,200);
   const leads=await readAllLeads();
   if(epoch!==state.epoch||i!==selectedIndex()||ws!==state.workspace)return;
   if(leads.some(x=>x.company_id===link.companyId&&norm(x.title)===norm(title))){
    $('sync-linked-status').textContent='Un lead con questa azienda e titolo esiste già. Aprilo nel CRM per evitare duplicazioni.';return;
   }
   if(!window.confirm('Creare UN nuovo lead CRM per "'+p.name+'"? '+(link.contactId?'Il referente collegato sarà associato.':'Senza referente CRM collegato.')+' Nessuna email inviata.'))return;
   const mark=key(i)+'|lead';if(state.attempted.has(mark))throw Error('Tentativo precedente: verifica i lead CRM prima di ripetere');
   state.attempted.add(mark);
   const data={title,company_id:link.companyId,source:'Lead Intelligence'};if(link.contactId)data.contact_id=link.contactId;
   const id=await create('leads',data);
   if(epoch!==state.epoch||i!==selectedIndex()||ws!==state.workspace){$('sync-linked-status').textContent='Lead creato con contesto cambiato. Verifica il CRM.';return}
   link.leadId=id;$('sync-linked-status').textContent='Lead registrato correttamente nel CRM. Le attività successive rimangono manuali.';
  }catch(e){$('sync-linked-status').textContent='Lead non confermato: '+e.message+'. Verifica il CRM prima di ripetere.'}
  finally{state.busy=false;controls()}
 });
 window.addEventListener('radix:lead-reviewed',e=>refresh(e.detail?.prospects));
 connect();
})();
