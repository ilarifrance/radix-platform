'use strict';
(()=>{
 const B=window.RadixContactBatch,P=window.RadixProviderContacts;
 if(!B||!P)return;
 const $=id=>document.getElementById(id),text=(id,value)=>$(id).textContent=value;
 let job=null;
 const source=()=>{const v=$('contact-source').value.trim();if(!v)throw Error('Inserisci la URL di provenienza');return v};
 const show=()=>{
  const list=job?.records||[];
  text('contact-count',String(list.length));text('contact-batches',String(job?.batches.length||0));
  text('contact-duplicates',String(job?.duplicates||0));
  $('contact-export').disabled=!list.length;
  $('contact-save').disabled=!list.length;
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
   job=next;show();
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
   $('contact-source').value=job.sourceUrl;show();
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
 $('contact-clear').onclick=()=>{
  if(job&&!window.confirm('Chiudere il lavoro non ancora salvato? Scarica prima il backup se desideri conservarlo.'))return;
  job=null;show();text('contact-status','Lavoro svuotato. Nessun dato inviato al server.');
 };
 show();
})();
