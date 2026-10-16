'use strict';
// Read and stage a checkpoint locally; only explicit user actions import it.
(()=>{
 const Bridge=window.RadixLeadLocalHandoff;
 if(!Bridge)return;
 const $=id=>document.getElementById(id);
 const input=$('local-handoff-file'),status=$('local-handoff-status');
 if(!input||!status)return;
 const buttons=['local-handoff-restore','local-handoff-prospects','local-handoff-download'];
 let staged=null,selection=0;
 function reset(message){staged=null;window.dispatchEvent(new CustomEvent('radix:lead-local-handoff-staged',{detail:{contacts:[]}}));buttons.forEach(id=>$(id).disabled=true);status.textContent=message;$('local-handoff-summary').textContent='Nessun backup analizzato.'}
 function download(name,content){
  const url=URL.createObjectURL(new Blob([content],{type:'application/json'}));const a=document.createElement('a');
  a.href=url;a.download=name;a.hidden=true;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 input.addEventListener('change',async()=>{
  const stamp=++selection;reset('Lettura locale in corso…');const file=input.files?.[0];
  if(!file)return reset('Seleziona un backup JSON dell’agente locale.');
  if(file.size>10000000)return reset('Backup troppo grande (massimo 10 MB).');
  try{
   const converted=Bridge.parse(await file.text());if(stamp!==selection)return;
   const companies=Bridge.toProspects(converted.job.records);
   staged={...converted,companies};
   window.dispatchEvent(new CustomEvent('radix:lead-local-handoff-staged',{detail:{contacts:converted.job.records}}));
   const r=converted.report,c=companies.report;
   $('local-handoff-summary').textContent=r.received+' contatti ricevuti · '+r.unique+' unici · '+r.duplicates+' duplicati · '+r.missingCompany+' senza azienda · '+r.withDomain+' con dominio · '+c.uniqueCompanies+' aziende candidabili all’ICP · '+c.conflicts+' aziende conflittuali escluse.';
   status.textContent='Backup valido. Nessun dato è stato inviato al server; rivedi le informazioni prima di confermare. '+(c.identityUncertain?'Identità da verificare per '+c.identityUncertain+' contatti senza paese/dominio. ':'')+r.warning;
   buttons.forEach(id=>$(id).disabled=false);
  }catch(e){if(stamp===selection)reset(e.message)}
 });
 $('local-handoff-download').addEventListener('click',()=>{
  if(!staged)return;
  download('radix-local-job-converted.json',JSON.stringify(staged.job,null,2));
  status.textContent='Backup RADIX normalizzato scaricato sul dispositivo; conserva i dati personali in modo sicuro.';
 });
 $('local-handoff-restore').addEventListener('click',()=>{
  if(!staged)return;
  if(!window.confirm('Caricare '+staged.report.unique+' contatti nel motore contatti RADIX di questa scheda? Un lavoro già aperto potrebbe essere sostituito; nessun caricamento cloud avviene senza successivo salvataggio esplicito.'))return;
  const target=$('contact-restore-file'),action=$('contact-restore');
  if(!target||!action||typeof DataTransfer!=='function'){status.textContent='Il browser non supporta il passaggio diretto. Scarica il JSON normalizzato e usa «Riprendi backup» nella sezione contatti.';return}
  const transfer=new DataTransfer();transfer.items.add(new File([JSON.stringify(staged.job)],'radix-local-job-converted.json',{type:'application/json'}));
  target.files=transfer.files;action.click();
  status.textContent='Ripristino richiesto al motore contatti. Verifica il messaggio «Lavoro ripristinato», poi scegli il workspace e premi «Salva contatti nel workspace» se desideri persisterli.';
 });
 $('local-handoff-prospects').addEventListener('click',()=>{
  if(!staged)return;
  const result=staged.companies;
  if(!result.prospects.length){status.textContent='Nessuna azienda completa disponibile: verifica i contatti nel backup.';return}
  const data=window.radixLeadData;
  if(!data||typeof data.export!=='function'||typeof data.restore!=='function'){status.textContent='Motore ICP non disponibile.';return}
  const current=data.export();
  // Existing ICP fields and company data are preserved; exact-identity duplicates are not injected.
  const identity=r=>String(r.domain||'').trim().toLowerCase()?'d:'+String(r.domain).trim().toLowerCase():'n:'+String(r.name||'').trim().toLowerCase()+'|'+String(r.country||'').trim().toLowerCase();
  const known=new Set(current.prospects.map(identity));
  const incoming=[];for(const p of result.prospects){const k=identity(p);if(known.has(k))continue;known.add(k);incoming.push(p)}
  if(!incoming.length){status.textContent='Tutte le aziende erano già presenti nell’elenco ICP: nessuna modifica.';return}
  if(current.prospects.length+incoming.length>250){status.textContent='Limite 250 aziende superato: importa un lotto più piccolo o salva la lista corrente.';return}
  if(!window.confirm('Aggiungere '+incoming.length+' aziende da verificare alla lista ICP? La qualificazione precedente verrà ricalcolata. Nessuna creazione CRM automatica.'))return;
  data.restore({...current,prospects:[...current.prospects,...incoming]});
  window.dispatchEvent(new CustomEvent('radix:lead-primary-list-changed'));
  window.dispatchEvent(new CustomEvent('radix:lead-prospects-edited'));
  status.textContent=incoming.length+' aziende aggiunte alla lista ICP. Verifica le fonti, completa i campi mancanti e approva manualmente prima del CRM.';
 });
 reset('Seleziona il backup JSON scaricato da http://127.0.0.1:4317.');
})();
