'use strict';
(()=>{
 const $=id=>document.getElementById(id),C=window.RadixLeadIntakeCore;
 if(!C||!window.radixLeadData){return}
 const state={url:null,suggestions:[],evidence:[],pending:[]};
 const status=(id,msg)=>$(id).textContent=msg;
 const el=(tag,text)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=String(text);return x};
 const current=()=>window.radixLeadData.export().prospects;
 function url(){
  const x=C.linkedinUrl($('li-source-url').value);state.url=x;
  status('li-source-status',x.kind==='sales-list'?'URL Sales Navigator valido. Non è possibile leggere una ricerca privata direttamente dall’URL: importa i dati che puoi esportare o copiare legittimamente.':x.kind==='company'?'Pagina aziendale valida. Puoi associare la fonte a righe importate o aggiungere manualmente un’azienda.':'Profilo LinkedIn valido. Puoi associare questa fonte a dati forniti volontariamente.');
  $('li-open').href=x.url;$('li-open').hidden=false;
  return x;
 }
 $('li-validate').onclick=()=>{try{url()}catch(e){state.url=null;$('li-open').hidden=true;status('li-source-status',e.message)}};
 function replace(rows,reason){
  // All approvals and previous CRM links are invalidated by the existing RADIX import/restore flow.
  window.radixLeadData.restore({...window.radixLeadData.export(),prospects:rows});
  status('li-source-status',reason);
 }
 $('li-company-add').onclick=()=>{
  try{
   const link=url();
   if(link.kind!=='company')throw Error('Questa azione richiede un URL LinkedIn di una pagina aziendale, non una ricerca');
   const company=$('li-company-name').value.trim();
   if(company.length<2||company.length>200)throw Error('Indica il nome azienda verificato da te (2–200 caratteri)');
   const rows=current(),next={name:company,domain:'',country:'',industry:'',companySize:'',contactRole:'',source:link.url.slice(0,500)};
   if(rows.length>=250)throw Error('La lista ha già 250 aziende');
   if(rows.some(r=>r.source===next.source))throw Error('Questa URL è già associata a un prospect');
   if(!window.confirm('Aggiungere '+company+' come dato inserito dall’utente? RADIX NON ha letto automaticamente LinkedIn.'))return;
   replace([...rows,next],'Prospect aggiunto dalla URL come dato inserito dall’utente. Completa e verifica i campi prima dello score e del CRM.');
  }catch(e){status('li-source-status',e.message)}
 };
 $('li-paste-import').onclick=()=>{
  try{
   const link=url(),raw=$('li-paste-rows').value;
   if(raw.length>100000)throw Error('Testo troppo grande');
   const parsed=window.RadixLeadCsv.parseCsv(raw,{maxRows:250});
   const supplied=C.link(parsed,link.url),previous=current();
   if(!supplied.length)throw Error('Nessun prospect rilevato');
   if(previous.length+supplied.length>250)throw Error('La lista supererebbe 250 aziende');
   if(!window.confirm('Aggiungere '+supplied.length+' prospect da dati incollati? Non sono stati scaricati automaticamente da LinkedIn. Le approvazioni correnti saranno azzerate.'))return;
   const existing=new Set(previous.map(C.identity).filter(Boolean)),toAdd=[],duplicates=[];
   for(const row of supplied){const k=C.identity(row);if(k&&existing.has(k)){duplicates.push(row.name||row.domain);continue}if(k)existing.add(k);toAdd.push(row)}
   if(!toAdd.length)throw Error('Tutte le righe sono duplicate. Nessuna modifica.');
   replace([...previous,...toAdd],toAdd.length+' record importati da testo fornito dall’utente; '+duplicates.length+' duplicati esclusi. Origine dichiarata: URL LinkedIn.');
  }catch(e){status('li-source-status','Importazione bloccata: '+e.message)}
 };
 const sheet=async file=>{
  const ext=(file.name.split('.').pop()||'').toLowerCase();
  if(!['csv','tsv','xlsx'].includes(ext))throw Error('Per i completamenti usa CSV, TSV o XLSX');
  if(file.size>(ext==='xlsx'?3:1)*1024*1024)throw Error('File troppo grande');
  if(ext==='xlsx'){if(!window.RadixLeadXlsx)throw Error('Modulo XLSX non disponibile');return window.RadixLeadXlsx.parseXlsx(await file.arrayBuffer(),{maxRows:250})}
  return window.RadixLeadCsv.parseCsv(await file.text(),{maxRows:250});
 };
 function render(){
  const box=$('li-suggestions');box.replaceChildren();
  const info=el('p',state.suggestions.length+' campi completabili · '+state.pending.length+' righe senza corrispondenza. Sono suggerimenti, non dati verificati.');
  info.className='muted';box.append(info);
  for(let k=0;k<state.suggestions.length;k++){
   const s=state.suggestions[k],line=el('label');line.className='li-suggestion';
   const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=false;checkbox.value=String(k);
   const description=el('span',(s.company||'Prospect')+' · '+s.field+' → '+s.value+' · '+s.match+' · '+(s.source||'fonte non indicata'));
   line.append(checkbox,description);box.append(line);
  }
  $('li-apply').disabled=!state.suggestions.length;
 }
 $('li-enrich-file').onchange=async()=>{
  const f=$('li-enrich-file').files?.[0];if(!f)return;
  state.suggestions=[];state.pending=[];render();
  try{
   const original=current();if(!original.length)throw Error('Importa prima una lista prospect nella sezione Dati');
   const rows=await sheet(f),fallback=$('li-enrich-source').value.trim();
   const plan=C.plan(original,rows,fallback);
   state.suggestions=plan.suggestions;state.pending=plan.unmatched;
   render();
   status('li-enrich-status','Confrontate '+rows.length+' righe. '+plan.suggestions.length+' suggerimenti; '+plan.ambiguous.length+' corrispondenze ambigue; '+plan.unmatched.length+' non abbinate. Seleziona soltanto i campi che hai verificato.');
  }catch(e){state.suggestions=[];state.pending=[];render();status('li-enrich-status','Confronto non riuscito: '+e.message)}
 };
 $('li-select-all').onclick=()=>{for(const check of $('li-suggestions').querySelectorAll('input[type=checkbox]'))check.checked=true};
 $('li-apply').onclick=()=>{
  try{
   const chosen=[...$('li-suggestions').querySelectorAll('input[type=checkbox]:checked')].map(x=>state.suggestions[Number(x.value)]).filter(Boolean);
   if(!chosen.length)throw Error('Seleziona almeno un campo');
   if(!window.confirm('Applicare '+chosen.length+' completamenti verificati da te? Le approvazioni commerciali saranno invalidate; dovrai salvare esplicitamente la lista.'))return;
   const update=C.apply(current(),chosen);
   replace(update.rows,chosen.length+' campi completati dopo revisione. Salva le modifiche nell’Archivio per renderle persistenti.');
   state.evidence.push(...update.evidence);
   state.suggestions=[];state.pending=[];render();
   status('li-enrich-status',update.evidence.length+' completamenti applicati; provenienza conservata nell’archivio fino al limite previsto. Nessuna fonte verificata automaticamente.');
  }catch(e){status('li-enrich-status','Impossibile applicare: '+e.message)}
 };
 window.radixLeadIntakeEvidence={
  export:()=>state.evidence.map(e=>({...e})),
  restore:rows=>{if(!Array.isArray(rows)||rows.length>250)throw Error('Provenienza non valida');state.evidence=rows.map(e=>({...e}));state.suggestions=[];render();}
 };
 // Whenever a new independent file import/clear/reset is performed, old provenance must not remain attached to new indexes.
 window.addEventListener('radix:lead-primary-list-changed',()=>{state.evidence=[];state.suggestions=[];render();status('li-enrich-status','La lista è cambiata. Ricalcola i completamenti prima di applicarli.')});
 render();
})();
