'use strict';
(()=>{
 const $=id=>document.getElementById(id),MAX_ROWS=250;
 let candidates=[],review=null,importEpoch=0;
 const norm=x=>typeof x==='string'?x.normalize('NFKC').trim().toLocaleLowerCase('it'):'';
 const fields=['name','domain','country','industry','companySize','contactRole','source'];
 const cell=(t,v,cls)=>{const x=document.createElement(t);x.textContent=v===undefined||v===null?'':String(v);if(cls)x.className=cls;return x};
 const list=s=>s.split(',').map(v=>v.trim()).filter(Boolean);
 const identityKeys=c=>{
  const raw=norm(c.domain).replace(/^https?:\/\//,'').replace(/^www\./,'').split(/[/?#:]/)[0],keys=[];
  if(raw&&/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(raw)&&raw.length<=253)keys.push('domain:'+raw);
  if(norm(c.name)&&norm(c.country))keys.push('name:'+norm(c.name)+'|country:'+norm(c.country));
  return keys;
 };
 const key=c=>identityKeys(c)[0]||null;
 function duplicateGroups(rows){
  const parent=rows.map((_,i)=>i),seen=new Map();
  function root(i){while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i]}return i}
  rows.forEach((c,i)=>identityKeys(c).forEach(k=>{if(seen.has(k))parent[root(i)]=root(seen.get(k));else seen.set(k,i)}));
  const groups=new Map();rows.forEach((_,i)=>{const r=root(i);if(!groups.has(r))groups.set(r,[]);groups.get(r).push(i)});
  return [...groups.values()].filter(g=>g.length>1);
 }
 const parseCsv=source=>{
  if(!window.RadixLeadCsv||typeof window.RadixLeadCsv.parseCsv!=='function')throw Error('Modulo CSV non disponibile: ricarica la pagina');
  return window.RadixLeadCsv.parseCsv(source,{maxRows:MAX_ROWS});
 };
 function csvCell(x){let s=String(x??'').replace(/[\r\n\t]+/g,' ').trim().slice(0,500);if(/^[=+\-@\uFEFF]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}
 function invalidate(message){window.dispatchEvent(new CustomEvent('radix:lead-reviewed',{detail:{prospects:[]}}));review=null;$('mail-prospect').disabled=true;$('mail-prospect').replaceChildren(cell('option','Prima qualifica una lista'));$('mail-generate').disabled=true;$('mail-copy').disabled=true;$('mail-preview-subject').textContent='Nessuna bozza';$('mail-preview-body').textContent='Qualifica i prospect per iniziare.';$('export').disabled=true;$('high').textContent='—';$('review').textContent='—';$('dupes').textContent='—';$('results').replaceChildren();const tr=cell('tr');const td=cell('td',message||'Avvia la qualificazione','muted');td.colSpan=5;tr.append(td);$('results').append(tr);$('explanation').textContent='La qualificazione richiede una nuova esecuzione dopo ogni modifica dei dati o dell’ICP.'}
 function score(c,icp){const dimensions=[['country','countries',25],['industry','industries',30],['companySize','sizes',25],['contactRole','roles',20]];let configured=0,matched=0,available=0;const missing=[];for(const [field,criterion,weight] of dimensions){const targets=icp[criterion];if(!targets.length)continue;configured+=weight;if(!norm(c[field])){missing.push(field);continue}available+=weight;if(targets.some(v=>norm(v)===norm(c[field])))matched+=weight}return{score:configured?Math.round(100*matched/configured):null,coverage:configured?Math.round(100*available/configured):0,missing}}
 function calculate(){if(!candidates.length){$('import-status').textContent='Importa almeno una azienda';return}const icp={countries:list($('country').value),industries:list($('industry').value),sizes:list($('size').value),roles:list($('role').value)};const configured=Object.values(icp).some(v=>v.length);if(!configured){$('import-status').textContent='Inserisci almeno un criterio ICP';return}
 const groups=duplicateGroups(candidates),duplicates=new Set(groups.flat());
 const queue=candidates.map((c,i)=>{const s=score(c,icp);let reasons=[];if(!key(c))reasons.push('Identità incompleta');if(duplicates.has(i))reasons.push('Possibile duplicato');if(s.missing.length)reasons.push('Campi ICP mancanti');if(!c.source)reasons.push('Fonte non dichiarata');if(s.score===null)reasons.push('Dati insufficienti');const priority=reasons.length||s.coverage!==100?'DA VERIFICARE':s.score>=75?'ALTA':s.score>=45?'DA VERIFICARE':'BASSA';return {candidate:c,index:i,score:s.score,coverage:s.coverage,reasons,priority,key:key(c)}});review=queue;window.dispatchEvent(new CustomEvent('radix:lead-reviewed',{detail:{prospects:queue.map(p=>({...p.candidate})),entries:queue.map(p=>({candidate:{...p.candidate},index:p.index,score:p.score,priority:p.priority,reasons:[...p.reasons]}))}}));
 const choice=$('mail-prospect');choice.replaceChildren();queue.forEach((p,i)=>{const option=cell('option',p.candidate.name||p.candidate.domain||'Prospect '+(i+1));option.value=String(i);choice.append(option)});choice.disabled=false;$('mail-generate').disabled=false;$('mail-copy').disabled=true;
 $('total').textContent=candidates.length;$('high').textContent=queue.filter(x=>x.priority==='ALTA').length;$('review').textContent=queue.filter(x=>x.priority==='DA VERIFICARE').length;$('dupes').textContent=groups.length;
 $('results').replaceChildren();for(const p of queue){const tr=cell('tr');const name=cell('td',p.candidate.name||p.candidate.domain||'Azienda non identificata');name.append(cell('span',p.candidate.domain,'sub'));tr.append(name,cell('td',p.score===null?'—':p.score+'/100'),cell('td',p.coverage+'%'));const td=cell('td');td.append(cell('span',p.priority,p.priority==='DA VERIFICARE'?'chip warn':'chip'));tr.append(td,cell('td',p.reasons.join(' · ')||'Regole ICP verificate'));$('results').append(tr)}
 $('import-status').textContent='Qualificate '+queue.length+' aziende in locale';$('explanation').textContent='Analizzate '+queue.length+' aziende: '+queue.filter(x=>x.priority==='ALTA').length+' compatibili con copertura completa; '+queue.filter(x=>x.priority==='DA VERIFICARE').length+' richiedono verifica umana. Il punteggio non prova intento d’acquisto.';$('export').disabled=false;
 }
 function download(){if(!review)return;const header=['azienda','dominio','paese','settore','dimensione','ruolo','fonte','icp_score','copertura','priorita','motivi_revisione','revisione_umana','stato'];const rows=[header,...review.map(p=>[p.candidate.name,p.candidate.domain,p.candidate.country,p.candidate.industry,p.candidate.companySize,p.candidate.contactRole,p.candidate.source,p.score??'',p.coverage,p.priority,p.reasons.join(' | '),'obbligatoria','anteprima_non_sincronizzata'])];const output='\uFEFF'+rows.map(x=>x.map(csvCell).join(';')).join('\r\n')+'\r\n';const url=URL.createObjectURL(new Blob([output],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='RADIX_lead_intelligence_review.csv';document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url)}
 $('file').onchange=async()=>{
  const file=$('file').files?.[0],epoch=++importEpoch;
  if(!file)return;
  if(file.size>1024*1024){$('import-status').textContent='Il file supera 1 MB';return}
  $('import-status').textContent='Lettura del file in corso…';
  try{
   const text=await file.text();
   // A slow previous file must never overwrite a newer import, manual entry or reset.
   if(epoch!==importEpoch)return;
   const parsed=parseCsv(text);if(!parsed.length)throw Error('CSV: nessun prospect trovato');
   candidates=parsed;$('total').textContent=candidates.length;
   invalidate('Dati importati: avvia la qualificazione.');
   $('import-status').textContent=candidates.length+' aziende importate: dati soltanto in memoria';
  }catch(e){if(epoch===importEpoch)$('import-status').textContent=e.message+' · Lista precedente conservata, se presente.'}
 };
 function parsePastedProfile(text){const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);const pick=(pattern)=>{for(const line of lines){const m=line.match(pattern);if(m&&m[1]?.trim())return m[1].trim()}return ''};const bare=lines.find(line=>!line.includes(':')&&!/^https?:\/\//i.test(line)&&line.length>=3&&line.length<130)||'';let url=pick(/(?:sito|website|web|dominio|domain)\s*[:：-]\s*(https?:\/\/\S+|[a-z0-9-]+(?:\.[a-z0-9-]+)+)/i);if(!url){const m=text.match(/https?:\/\/(?!www\.linkedin\.com\/)\S+/i);if(m)url=m[0]}let source=pick(/(?:fonte|source|profilo|linkedin)\s*[:：-]\s*(https:\/\/\S+)/i);if(!source){const m=text.match(/https:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/[^\s]+/i);if(m)source=m[0]}return{name:pick(/(?:azienda|company|organization|organizzazione)\s*[:：-]\s*(.+)/i)||bare,domain:url,country:pick(/(?:paese|country|sede)\s*[:：-]\s*(.+)/i),industry:pick(/(?:settore|industry)\s*[:：-]\s*(.+)/i),companySize:pick(/(?:dimensione|company\s*size|size|dipendenti)\s*[:：-]\s*(.+)/i),contactRole:pick(/(?:ruolo|role|posizione|job\s*title)\s*[:：-]\s*(.+)/i),source};}
 $('parse-paste').onclick=()=>{const text=$('paste-text').value.trim();if(!text){$('paste-status').textContent='Incolla prima un testo aziendale o un profilo';return}if(text.length>12000){$('paste-status').textContent='Testo troppo lungo: massimo 12.000 caratteri';return}const fields=parsePastedProfile(text);let filled=0;for(const [key,id] of Object.entries({name:'paste-company',domain:'paste-domain',country:'paste-country',industry:'paste-industry',companySize:'paste-size',contactRole:'paste-role',source:'paste-source'})){if(fields[key]){$(id).value=fields[key];filled++}}$('paste-status').textContent=filled?filled+' campi proposti dal testo. Controllali prima di aggiungere il prospect.':'Nessun campo riconosciuto: compila manualmente.'};
 $('paste-add').onclick=()=>{const c={name:$('paste-company').value.trim(),domain:$('paste-domain').value.trim(),country:$('paste-country').value.trim(),industry:$('paste-industry').value.trim(),companySize:$('paste-size').value.trim(),contactRole:$('paste-role').value.trim(),source:$('paste-source').value.trim()};if(!c.name&&!c.domain){$('paste-status').textContent='Indica almeno un nome azienda o un dominio';return}if(candidates.length>=MAX_ROWS){$('paste-status').textContent='Raggiunto il limite di 250 prospect';return}if(c.source&&!/^https:\/\/[^\s]+$/i.test(c.source)){$('paste-status').textContent='Utilizza una URL https valida per la fonte';return}if(duplicateGroups([...candidates,c]).some(group=>group.includes(candidates.length))){$('paste-status').textContent='Azienda già presente nella lista: controlla prima di aggiungere';return}importEpoch++;candidates.push(c);$('total').textContent=String(candidates.length);$('paste-status').textContent='Azienda aggiunta in memoria, in attesa di qualificazione';$('import-status').textContent=candidates.length+' aziende nella lista';invalidate('Nuovo prospect aggiunto: esegui di nuovo la qualificazione.');for(const id of ['paste-company','paste-domain','paste-country','paste-industry','paste-size','paste-role','paste-source'])$(id).value='';};
 $('sample').onclick=()=>{importEpoch++;candidates=[{name:'Industria Alfa',domain:'alfa.example',country:'Italia',industry:'Macchine industriali',companySize:'PMI',contactRole:'CEO',source:'Esempio RADIX'},{name:'Beta Packaging',domain:'beta.example',country:'Italia',industry:'Packaging',companySize:'PMI',contactRole:'CEO',source:'Esempio RADIX'},{name:'Industria Alfa duplicato',domain:'alfa.example',country:'Italia',industry:'Macchine industriali',companySize:'PMI',contactRole:'',source:''}];$('total').textContent=3;$('import-status').textContent='3 record dimostrativi caricati';invalidate('Dati dimostrativi: avvia la qualificazione.')};
 function draft(){
 if(!review)return;const item=review[Number($('mail-prospect').value)];if(!item)return;const approval=window.radixLeadWorkflow?.approvalFor(item.index);if(!approval){$('mail-copy').disabled=true;$('mail-status').textContent='Approva il prospect nella sezione Revisione prima della bozza.';return}
 const values={azienda:item.candidate.name,settore:item.candidate.industry,paese:item.candidate.country,ruolo:item.candidate.contactRole,nome:approval.contact,email:approval.email};
 const subject=$('mail-subject').value,body=$('mail-template').value;
 const all=subject+' '+body;const placeholders=[...all.matchAll(/\{([^{}]+)\}/g)].map(m=>m[1]);
 const unknown=placeholders.filter(p=>!Object.prototype.hasOwnProperty.call(values,p));
 const missing=placeholders.filter(p=>Object.prototype.hasOwnProperty.call(values,p)&&!values[p]);
 if(unknown.length||missing.length){$('mail-status').textContent='Impossibile generare: '+(unknown.length?'variabili sconosciute '+[...new Set(unknown)].join(', ')+'; ':'')+(missing.length?'dati mancanti '+[...new Set(missing)].join(', '):'');$('mail-copy').disabled=true;return}
 const render=text=>text.replace(/\{([^{}]+)\}/g,(_,key)=>values[key]);
 $('mail-preview-subject').textContent=render(subject);$('mail-preview-body').textContent=render(body);
 $('mail-copy').disabled=false;$('mail-status').textContent='Bozza pronta per revisione. Nessun invio effettuato. Generazione tramite template deterministico, non AI.';window.dispatchEvent(new CustomEvent('radix:lead-draft',{detail:{index:item.index,subject:render(subject),body:render(body)}}));
}
window.addEventListener('radix:lead-approval-changed',e=>{const idx=Number(e.detail?.index);if(e.detail?.approved===false&&Number($('mail-prospect').value)===idx){staleDraft();$('mail-preview-body').textContent='Il prospect è stato modificato: riapprova il contatto e rigenera questa bozza.';$('mail-status').textContent='Revisione revocata: nessuna bozza autorizzata.'}});
$('mail-generate').onclick=draft;function staleDraft(){$('mail-copy').disabled=true;$('mail-preview-subject').textContent='Rigenera la bozza dopo le modifiche';window.dispatchEvent(new CustomEvent('radix:lead-draft-stale',{detail:{index:Number($('mail-prospect').value)}}));}for(const id of ['mail-prospect','mail-subject','mail-template'])$(id).addEventListener('input',staleDraft);
$('mail-copy').onclick=async()=>{if($('mail-copy').disabled)return;const text='Oggetto: '+$('mail-preview-subject').textContent+'\n\n'+$('mail-preview-body').textContent;try{await navigator.clipboard.writeText(text);$('mail-status').textContent='Bozza copiata negli appunti; nessun invio effettuato.'}catch(e){$('mail-status').textContent='Copia non disponibile: seleziona il testo della bozza.'}};
$('score').onclick=calculate;$('export').onclick=download;$('clear').onclick=()=>{importEpoch++;candidates=[];$('total').textContent='—';$('file').value='';$('import-status').textContent='Dati cancellati dalla memoria';invalidate('Importa i dati e avvia la qualificazione.')};for(const id of ['country','industry','size','role'])$(id).addEventListener('input',()=>invalidate('ICP modificato: ricalcola i risultati.'));
// Explicit API for user-authorized archive save/restore. Never uses browser storage for personal data.
 window.radixLeadData={
  export:()=>({
   icp:{country:$('country').value,industry:$('industry').value,size:$('size').value,role:$('role').value},
   prospects:candidates.map(c=>Object.fromEntries(fields.map(k=>[k,c[k]||''])))
  }),
  restore:payload=>{
   if(!payload||!Array.isArray(payload.prospects)||payload.prospects.length>MAX_ROWS||!payload.icp)throw Error('Formato archivio non valido');
   // Invalidate any file read still in flight before replacing the prospect list.
   ++importEpoch;
   candidates=payload.prospects.map(p=>Object.fromEntries(fields.map(f=>[f,String(p[f]||'')])));
   for(const k of ['country','industry','size','role'])$(k).value=String(payload.icp[k]||'');
   $('file').value='';$('total').textContent=String(candidates.length);
   invalidate('Lista archivio caricata: qualificazione da ricostruire.');
   if(candidates.length&&['country','industry','size','role'].some(k=>$(k).value.trim()))calculate();
   $('import-status').textContent='Lista caricata nell’interfaccia: '+candidates.length+' prospect. Ricontrolla sempre le fonti prima di procedere.';
  }
 };
 // CRM handoff loaded as an ordered deferred script in lead-intelligence.html.
})();