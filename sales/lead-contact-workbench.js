'use strict';
(()=>{
 const B=window.RadixContactBatch,P=window.RadixProviderContacts;
 if(!B||!P)return;
 const $=id=>document.getElementById(id),text=(id,value)=>$(id).textContent=value;
 let job=null,vault={id:'',version:0,workspace:'',dirty:false};
 const source=()=>{const v=$('contact-source').value.trim();if(!v)throw Error('Inserisci la URL di provenienza');return v};
 const show=()=>{
  const list=job?.records||[];
  text('contact-count',String(list.length));text('contact-batches',String(job?.batches.length||0));
  text('contact-duplicates',String(job?.duplicates||0));
  $('contact-export').disabled=!list.length;
  $('contact-save').disabled=!list.length;
  $('contact-job-save').disabled=!list.length;
  const tbody=$('contact-preview-rows');tbody.replaceChildren();
  for(const r of list.slice(-20).reverse()){
   const tr=document.createElement('tr');
   for(const field of ['fullName','jobTitle','companyName','email','sourceUrl']){
    const td=document.createElement('td');td.textContent=r[field]||'—';tr.append(td);
   }
   tbody.append(tr);
  }
  if(!list.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;td.textContent='Nessun contatto acquisito.';tr.append(td);tbody.append(tr)}
 };
 function saveFile(name,value,type){
  const blob=new Blob([value],{type});const link=document.createElement('a');const uri=URL.createObjectURL(blob);
  link.href=uri;link.download=name;document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(uri),1000);
 }
 async function apiStatus(test){
  try{
   const workspace=$('archive-workspace')?.value;
   if(!workspace)throw Error('Seleziona prima un workspace nell’Archivio Lead Intelligence');
   const options=test?{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','x-radix-sales':'1'},body:JSON.stringify({workspace,entity:'lead_provider_status',action:'test',data:{}})}:{credentials:'same-origin'};
   const path=test?'/api/sales':'/api/sales?entity=lead_provider_status&workspace='+encodeURIComponent(workspace);
   text('contact-api-result','Verifica in corso...');
   const response=await fetch(path,options),body=await response.json();
   if(!response.ok)throw Error(body.error||'Provider non disponibile');
   text('contact-api-result',test?'Connessione API confermata: test di sola lettura, nessuna ricerca avviata.':body.configured?'Chiave API configurata in Preview, non ancora collegata a una ricerca.':'Chiave API non configurata. Inserisci CAPTAIN_DATA_API_KEY nelle variabili Preview di Vercel.');
  }catch(e){text('contact-api-result','Verifica API: '+e.message)}
 }
 $('contact-api-status').onclick=()=>apiStatus(false);
 $('contact-api-test').onclick=()=>apiStatus(true);
 $('contact-import').onclick=async()=>{
  try{
   const file=$('contact-file').files?.[0];if(!file)throw Error('Seleziona prima un file JSON');
   if(file.size>3500000)throw Error('File superiore a 3,5 MB');
   const raw=JSON.parse(await file.text()),provided=source(),callback=window.RadixProviderCallback?.read(raw);
   const id=callback?.id||$('contact-batch-id').value.trim();
   if(!id||id.length>100)throw Error('Indica un ID lotto, ad esempio pagina-1');
   const base=job||B.start(provided);if(base.sourceUrl!==B.start(provided).sourceUrl)throw Error('La provenienza differisce dal lavoro aperto');
   const rows=P.convert(callback?.raw||raw,base.sourceUrl);
   let next=base;
   for(let i=0;i<rows.length;i+=200){next=B.add(next,rows.slice(i,i+200),id+'-'+Math.floor(i/200))}
   job=next;vault.dirty=true;show();
   text('contact-status','Lotto elaborato: '+rows.length+' record ricevuti; '+job.records.length+' contatti unici. Nessun salvataggio sul server.');
  }catch(e){text('contact-status','Importazione non riuscita: '+e.message)}
 };
 $('contact-save').onclick=()=>{
  if(!job?.records.length)return;
  saveFile('radix-contatti-lavoro.json',JSON.stringify(job,null,2),'application/json');
  text('contact-status','Backup JSON salvato sul tuo dispositivo. Contiene dati personali: custodiscilo in modo sicuro.');
 };
 $('contact-restore').onclick=async()=>{
  try{
   const f=$('contact-restore-file').files?.[0];if(!f)throw Error('Seleziona un backup RADIX');
   if(f.size>10000000)throw Error('Backup troppo grande');
   const x=JSON.parse(await f.text());
   if(x.version!==1||!Array.isArray(x.records)||!Array.isArray(x.batches)||x.records.length>10000||x.batches.length>1000)throw Error('Backup incompatibile');
   const src=B.start(x.sourceUrl),validated=x.records.map(r=>B.person(r,src.sourceUrl));
   if(x.batches.some(b=>typeof b.id!=='string'||typeof b.signature!=='string'))throw Error('Lotti non validi');
   if(job&&!window.confirm('Sostituire il lavoro di contatti attualmente aperto?'))return;
   job={...src,records:validated,batches:x.batches,total:Number.isSafeInteger(x.total)?x.total:validated.length,duplicates:Number.isSafeInteger(x.duplicates)?x.duplicates:0};
   $('contact-source').value=job.sourceUrl;vault={id:'',version:0,workspace:'',dirty:true};show();
   text('contact-status','Lavoro ripristinato: '+job.records.length+' contatti. Continua importando un nuovo lotto.');
  }catch(e){text('contact-status','Ripristino non riuscito: '+e.message)}
 };
 $('contact-export').onclick=()=>{
  if(!job?.records.length)return;
  const cols=['fullName','firstName','lastName','jobTitle','companyName','companyDomain','profileUrl','companyUrl','email','phone','location','country','industry','companySize','sourceUrl'];
  const csvCell=x=>{let s=String(x??'');if(/^[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  const csv=[cols.join(','),...job.records.map(r=>cols.map(c=>csvCell(r[c])).join(','))].join('\r\n');
  saveFile('radix-contatti.csv','\ufeff'+csv,'text/csv;charset=utf-8');
  text('contact-status','Esportati '+job.records.length+' contatti in CSV. Nessun invio esterno effettuato.');
 };
 const workspace=()=>{
  const id=$('archive-workspace')?.value||'';
  if(!/^[a-f0-9-]{36}$/i.test(id))throw Error('Seleziona prima un workspace nell’Archivio RADIX');
  return id;
 };
 const api=async(method,entity,data,ws,id)=>{
  const target='/api/sales'+(method==='GET'?'?entity='+entity+'&workspace='+encodeURIComponent(ws)+(id?'&id='+encodeURIComponent(id):''):'');
  const params={method,credentials:'same-origin'};
  if(method==='POST'){params.headers={'Content-Type':'application/json','x-radix-sales':'1'};params.body=JSON.stringify({workspace:ws,entity,action:data.action,data:data.data})}
  const res=await fetch(target,params),json=await res.json();
  if(!res.ok)throw Error(json.error||'Archivio non disponibile');
  return json.rows||[];
 };
 async function listJobs(selected){
  const ws=workspace(),rows=await api('GET','lead_contact_jobs',null,ws);
  const menu=$('contact-job-select');menu.replaceChildren();
  const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Seleziona un lavoro...';menu.append(placeholder);
  for(const row of rows){const option=document.createElement('option');option.value=row.id;option.textContent=row.title+' · '+row.contact_count+' contatti · v'+row.version;menu.append(option)}
  menu.value=selected||'';
  text('contact-job-status',rows.length+' lavori disponibili nel workspace. Nessun dato sovrascritto.');
 }
 $('contact-job-list').onclick=async()=>{try{await listJobs(vault.id&&vault.workspace===workspace()?vault.id:'')}catch(e){text('contact-job-status','Archivio: '+e.message)}};
 $('contact-job-save').onclick=async()=>{
  try{
   if(!job?.records.length)throw Error('Acquisisci almeno un contatto');
   const ws=workspace(),title=$('contact-job-title').value.trim();
   if(vault.id&&vault.workspace!==ws)throw Error('Il workspace è cambiato: crea un nuovo lavoro o torna al workspace precedente');
   if(!title||title.length>120)throw Error('Indica un titolo valido');
   const action=vault.id?'update':'create';
   if(!window.confirm('Salvare '+job.records.length+' contatti individuali nel database Preview isolato del workspace? Verifica provenienza e trattamento dei dati.'))return;
   const payload={...job};delete payload.last;
   const data={title,payload,...(action==='update'?{id:vault.id,version:vault.version}:{})};
   const [row]=await api('POST','lead_contact_jobs',{action,data},ws);
   vault={id:row.id,version:row.version,workspace:ws,dirty:false};
   text('contact-job-status','Lavoro salvato nel workspace · versione '+row.version+' · '+job.records.length+' contatti.');
   await listJobs(row.id);
  }catch(e){text('contact-job-status','Salvataggio non riuscito: '+e.message)}
 };
 $('contact-job-load').onclick=async()=>{
  try{
   const ws=workspace(),id=$('contact-job-select').value;
   if(!id)throw Error('Seleziona un lavoro');
   if((vault.dirty||job)&&!window.confirm('Aprire il lavoro selezionato? I dati non salvati saranno persi.'))return;
   const [row]=await api('GET','lead_contact_jobs',null,ws,id);
   if(!row?.payload)throw Error('Lavoro non disponibile');
   const p=row.payload,B=window.RadixContactBatch;
   if(p.version!==1||!Array.isArray(p.records)||!Array.isArray(p.batches))throw Error('Contenuto archivio non valido');
   const base=B.start(p.sourceUrl);
   const contacts=p.records.map(r=>B.person(r,base.sourceUrl));
   job={...base,records:contacts,batches:p.batches,total:p.total,duplicates:p.duplicates};
   $('contact-source').value=job.sourceUrl;
   $('contact-job-title').value=row.title;
   vault={id:row.id,version:row.version,workspace:ws,dirty:false};show();
   text('contact-job-status','Caricati '+contacts.length+' contatti dal workspace · versione '+row.version);
  }catch(e){text('contact-job-status','Apertura non riuscita: '+e.message)}
 };
 $('contact-job-new').onclick=()=>{
  if(job&&!window.confirm('Iniziare un nuovo lavoro? Esporta o salva quello corrente prima di continuare.'))return;
  job=null;vault={id:'',version:0,workspace:'',dirty:false};
  $('contact-source').value='';$('contact-job-select').value='';show();
  text('contact-job-status','Nuovo lavoro in attesa dei risultati. Il lavoro precedente rimane nell’archivio se salvato.');
 };
 $('contact-job-delete').onclick=async()=>{
  try{
   const ws=workspace(),id=$('contact-job-select').value;
   if(!id)throw Error('Seleziona il lavoro da eliminare');
   if(id!==vault.id||ws!==vault.workspace||!vault.version)throw Error('Apri prima il lavoro, così RADIX ne verifica la versione aggiornata');
   if(!window.confirm('Eliminare definitivamente questo lavoro contatti dal workspace Preview?'))return;
   await api('POST','lead_contact_jobs',{action:'delete',data:{id,version:vault.version}},ws);
   job=null;vault={id:'',version:0,workspace:'',dirty:false};show();await listJobs('');
   text('contact-job-status','Lavoro eliminato dall’archivio.');
  }catch(e){text('contact-job-status','Eliminazione non riuscita: '+e.message)}
 };
 window.addEventListener('beforeunload',event=>{
  if(vault.dirty){event.preventDefault();event.returnValue=''}
 });
 $('contact-clear').onclick=()=>{
  if(job&&!window.confirm('Chiudere il lavoro non ancora salvato? Scarica prima il backup se desideri conservarlo.'))return;
  job=null;vault={id:'',version:0,workspace:'',dirty:false};show();text('contact-status','Lavoro svuotato. Nessun dato inviato al server.');
 };
 show();
})();
