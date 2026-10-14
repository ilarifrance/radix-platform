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
  window.dispatchEvent(new CustomEvent('radix:lead-prospects-edited'));
  status('li-source-status',reason);
 }
 $('li-provider-file').onchange=async()=>{
  const file=$('li-provider-file').files?.[0];if(!file)return;
  try{
   if(!file.name.toLowerCase().endsWith('.json')||file.size>250000)throw Error('Carica un JSON valido (max 250 KB)');
   const link=url(),mapped=window.RadixLeadProviderAdapter.convert(await file.text(),$('li-provider').value,link.url);
   const previous=current(),seen=new Set(previous.map(C.identity).filter(Boolean));const add=[];let duplicate=0;
   for(const row of mapped.rows){const id=C.identity(row);if(id&&seen.has(id)){duplicate++;continue}if(id)seen.add(id);add.push(row)}
   if(!add.length)throw Error('Nessun prospect nuovo');
   if(add.length+previous.length>250)throw Error('La lista supererebbe 250 aziende');
   if(!window.confirm('Importare '+add.length+' aziende dal provider '+mapped.provider+'? '+duplicate+' duplicati esclusi. Verifica di avere il diritto di utilizzare i dati.'))return;
   replace([...previous,...add],'Provider importato: '+add.length+' aziende.');
   status('li-provider-status','Importazione completata: '+add.length+' aziende, '+duplicate+' duplicati. Qualifica e salva nell’Archivio.');
  }catch(e){status('li-provider-status','Importazione provider non riuscita: '+e.message)}
 };
 $('li-agent-open').onclick=()=>{
  try{const link=url();window.open(link.url,'_blank','noopener,noreferrer');status('li-agent-status','URL aperta nel browser. Puoi utilizzare i dati ai quali hai legittimo accesso; poi importa JSON da agente o provider.')}
  catch(e){status('li-agent-status',e.message)}
 };
 $('li-agent-instructions').onclick=async()=>{
  const instruction='Prepara un file JSON versione 1 con i soli dati aziendali che sono legittimamente disponibili per uso ed esportazione. Non aggirare protezioni, non effettuare scraping massivo e non condividere cookie o password. Schema: {"version":1,"sourceUrl":"URL LinkedIn/Sales Navigator fornito dall’utente","companies":[{"name":"Azienda","domain":"","country":"","industry":"","companySize":"","contactRole":"","source":"URL della fonte pubblica o esportazione autorizzata"}]}. Per campi non verificati usa una stringa vuota. Non inventare email o dati e non includere dati personali superflui.';
  try{await navigator.clipboard.writeText(instruction);status('li-agent-status','Istruzioni copiate: incollale nel tuo agente browser, poi importa il file JSON prodotto.')}catch{status('li-agent-status','Clipboard non disponibile in questo browser.')}
 };
 $('li-agent-paste-import').onclick=()=>{
  try{
   const parsed=$('li-agent-paste').value.trim();if(parsed.length>160000)throw Error('JSON troppo grande');
   const rows=C.fromAgentExport(parsed,url().url),previous=current();
   const seen=new Set(previous.map(C.identity).filter(Boolean));const add=[];let skipped=0;
   for(const row of rows){const key=C.identity(row);if(key&&seen.has(key)){skipped++;continue}if(key)seen.add(key);add.push(row)}
   if(!add.length)throw Error('Nessuna azienda nuova');
   if(add.length+previous.length>250)throw Error('Limite lista: 250 aziende');
   if(!window.confirm('Importare '+add.length+' aziende? '+skipped+' duplicati esclusi.'))return;
   replace([...previous,...add],'Risultati agente aggiunti alla lista.');
   status('li-agent-status',add.length+' aziende aggiunte. Qualifica e salva la lista.');
  }catch(e){status('li-agent-status','Importazione non riuscita: '+e.message)}
 };
 $('li-agent-file').onchange=async()=>{
  const file=$('li-agent-file').files?.[0];if(!file)return;
  try{
    const link=url();
    if(file.size>160000)throw Error('File troppo grande (massimo 160 KB)');
    if(!file.name.toLowerCase().endsWith('.json'))throw Error('Carica un file JSON');
    const rows=C.fromAgentExport(await file.text(),link.url),previous=current();
    if(previous.length+rows.length>250)throw Error('Limite di 250 aziende superato');
    const seen=new Set(previous.map(C.identity).filter(Boolean)),newRows=[];let duplicates=0;
    for(const row of rows){const key=C.identity(row);if(key&&seen.has(key)){duplicates++;continue}if(key)seen.add(key);newRows.push(row)}
    if(!newRows.length)throw Error('Tutti i record sono duplicati: nessuna modifica');
    if(!window.confirm('Importare '+newRows.length+' aziende dal file dell’agente? '+duplicates+' duplicati esclusi. Conferma solo se i dati sono utilizzabili legittimamente.'))return;
    replace([...previous,...newRows],'File agente importato: '+newRows.length+' aziende, '+duplicates+' duplicati.');
    status('li-agent-status','Importate '+newRows.length+' aziende dal file agente. Nessun dato acquisito direttamente da LinkedIn.');
  }catch(e){status('li-agent-status','Importazione non riuscita: '+e.message)}
 };
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
 $('li-public-lookup').onclick=async()=>{
  const work=$('archive-workspace')?.value,rows=current();
  if(!work){status('li-public-status','Accedi a RADIX e seleziona prima il Workspace Vault.');return}
  if(!rows.length){status('li-public-status','Importa almeno una azienda.');return}
  const missing=rows.map((row,index)=>({row,index})).filter(x=>!x.row.domain&&x.row.name?.trim().length>=3).slice(0,5);
  if(!missing.length){status('li-public-status','Nessuna azienda senza dominio e con nome utilizzabile.');return}
  if(!window.confirm('Cercare su Wikidata il sito ufficiale di '+missing.length+' aziende? I nomi verranno trasmessi a Wikidata. Nessun dato sarà inserito senza revisione.'))return;
  const button=$('li-public-lookup');button.disabled=true;let found=0,errors=0;
  state.suggestions=[];state.pending=[];render();
  try{
   for(const {row,index} of missing){
    status('li-public-status','Ricerca '+(found+errors+1)+' / '+missing.length+' in corso...');
    try{
     const r=await fetch('/api/sales',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','x-radix-sales':'1'},body:JSON.stringify({workspace:work,entity:'lead_public_lookup',action:'suggest',data:{name:row.name,domain:row.domain||''}})});
     const data=await r.json();if(!r.ok)throw Error(data.error||'HTTP '+r.status);
     for(const suggestion of data.suggestions||[]){
      if(suggestion.field!=='domain'||!suggestion.value||!suggestion.source)continue;
      state.suggestions.push({index,field:'domain',value:suggestion.value,source:suggestion.source,company:row.name,match:'voce pubblica per nome',verified:false});
      found++;
     }
    }catch{errors++}
   }
   render();status('li-public-status','Ricerca conclusa: '+found+' possibili siti ufficiali, '+errors+' errori. Seleziona e verifica i suggerimenti prima di applicarli.');
  }finally{button.disabled=false}
 };
 $('li-select-all').onclick=()=>{for(const check of $('li-suggestions').querySelectorAll('input[type=checkbox]'))check.checked=true};
 $('li-apply').onclick=()=>{
  try{
   const chosen=[...$('li-suggestions').querySelectorAll('input[type=checkbox]:checked')].map(x=>state.suggestions[Number(x.value)]).filter(Boolean);
   if(!chosen.length)throw Error('Seleziona almeno un campo');
   if(chosen.some(s=>!/^https:\/\/[^\s/]+\.[^\s/]+/i.test(s.source)))throw Error('Ogni completamento richiede un URL HTTPS di provenienza. Inseriscilo nel campo Fonte e ricarica il file di completamento.');
   if(state.evidence.length+chosen.length>250)throw Error('Massimo 250 campi di provenienza per lista. Seleziona meno suggerimenti.');
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
