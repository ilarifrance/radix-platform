'use strict';
(()=>{
 const $=id=>document.getElementById(id),Core=window.RadixLeadCrmOutcomesCore,links=new Map(),pending=new Map(),attempted=new Set();
 let prospects=[],busy=false,history=null;
 const idx=()=>Number($('outcome-prospect').value),ws=()=>$('sync-workspace').value;
 const key=(workspace,index)=>workspace+'|'+index;
 const active=()=>links.get(key(ws(),idx()));
 const approval=()=>Boolean(window.radixLeadWorkflow?.approvalFor(idx()));
 const speak=x=>$('crm-outcome-status').textContent=x;
 const el=(tag,txt)=>{const e=document.createElement(tag);if(txt!==undefined)e.textContent=String(txt);return e};
 const entry=()=>pending.get(idx())?.[0]||null;
 function controls(){
  const link=active(),ready=Boolean(link?.companyId&&approval()&&!busy);
  $('crm-outcome-save').disabled=!ready||!entry()||attempted.has(entry()?.key);
  $('crm-outcome-load').disabled=!ready;
  $('crm-outcome-pending').textContent=(pending.get(idx())||[]).length+' esiti o correzioni in attesa';
 }
 function draw(rows){
  const box=$('crm-outcome-history');box.replaceChildren();
  const result=Core.timeline(rows);
  const summary=el('p','Storico CRM: '+result.active.length+' esiti attivi · '+result.corrections.length+' rettifiche. Fonte: interazioni del workspace autorizzato.');
  box.append(summary);
  for(const row of [...result.all,...result.corrections].sort((a,b)=>b.at.localeCompare(a.at)).slice(0,25)){
   const note=el('p',(row.type==='void'?'↶ Rettifica':'✓ '+row.stage)+' · '+new Date(row.at).toLocaleString('it-IT'));
   note.className='crm-outcome-history-row';box.append(note);
  }
  if(!rows.length)box.append(el('p','Nessun esito Lead Intelligence registrato nel CRM per questa azienda.'));
 }
 function reset(){prospects=[];pending.clear();links.clear();attempted.clear();history=null;draw([]);controls();speak('Collega un’azienda dal passaggio 05 CRM, registra un esito e conferma il salvataggio.')}
 const getRows=async(workspace,companyId)=>{
  return Core.read({companyId,fetchPage:async offset=>{
   const query=new URLSearchParams({workspace,entity:'interactions',offset:String(offset)});
   const response=await fetch('/api/sales?'+query,{credentials:'same-origin',cache:'no-store'});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(data.error||'Lettura CRM HTTP '+response.status);
   return data.rows;
  }});
 };
 async function load(){
  const link=active(),index=idx(),workspace=ws();
  if(!link||!approval()||busy)return;
  busy=true;history=null;controls();speak('Consultazione interazioni CRM in corso…');
  try{
   const rows=await getRows(workspace,link.companyId);
   if(active()!==link||idx()!==index||workspace!==ws())return;
   history=rows;draw(rows);speak('Storico CRM aggiornato. Nessuna modifica effettuata.');
  }catch(e){speak('Storico CRM non disponibile: '+e.message)}
  finally{busy=false;controls()}
 }
 async function save(){
  const link=active(),index=idx(),workspace=ws(),row=entry();
  if(!link||!approval()||!row||busy||attempted.has(row.key))return;
  busy=true;controls();let postAttempted=false;
  try{
   // This read is necessary: never blindly retry a potentially successful previous POST.
   const rows=await getRows(workspace,link.companyId);
   if(!approval()||link!==active()||idx()!==index||workspace!==ws()||entry()!==row){speak('Contesto cambiato durante la verifica: salvataggio annullato.');return}
   if(rows.some(x=>x.key===row.key)){pending.get(index).shift();draw(rows);speak('Esito già presente nel CRM: non è stato creato un duplicato.');return}
   if(row.type==='void'&&!rows.some(x=>x.key===row.ref&&x.type==='event')){speak('Prima registra nel CRM l’esito originale da rettificare.');return}
   if(!window.confirm('Registrare nel CRM un '+(row.type==='void'?'annullamento':'esito commerciale')+' per '+(prospects[index]?.name||'questa azienda')+'? Solo la dichiarazione manuale sarà salvata; nessuna email sarà inviata.'))return;
   if(entry()!==row||!approval()||active()!==link){speak('Operazione annullata: dati modificati.');return}
   const data=Core.writeData(row,link.companyId);
   postAttempted=true;attempted.add(row.key);
   const resp=await fetch('/api/sales',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','x-radix-sales':'1'},body:JSON.stringify({workspace,entity:'interactions',action:'create',data})});
   const payload=await resp.json().catch(()=>({}));
   if(!resp.ok)throw Error(payload.error||'Creazione CRM HTTP '+resp.status);
   if(!Array.isArray(payload.rows)||!payload.rows[0]?.id)throw Error('Conferma CRM incompleta.');
   const q=pending.get(index)||[];if(q[0]===row)q.shift();
   history=null;speak('Esito salvato nel CRM. Puoi rileggere lo storico e registrare il successivo.');
  }catch(e){speak((postAttempted?'Esito remoto incerto: controlla lo storico CRM prima di ripetere. ':'Nessun dato scritto: ')+e.message)}
  finally{busy=false;controls()}
 }
 window.addEventListener('radix:lead-reviewed',e=>{
  reset();prospects=Array.isArray(e.detail?.prospects)?e.detail.prospects.slice(0,250):[];controls();
 });
 window.addEventListener('radix:lead-crm-created',e=>{
  const d=e.detail||{};if(!d.workspace||!d.companyId||!Number.isInteger(d.index))return;
  links.set(key(d.workspace,d.index),{companyId:d.companyId});
  if(d.index===idx()&&d.workspace===ws())speak('Azienda collegata: ora puoi salvare gli esiti nel CRM.');
  controls();
 });
 window.addEventListener('radix:lead-outcome-recorded',e=>{
  const row=e.detail;if(!row||!Number.isInteger(row.index))return;
  const q=pending.get(row.index)||[];
  q.push({type:'event',key:row.key,stage:row.stage,at:row.at});pending.set(row.index,q);
  controls();speak('Esito registrato localmente. Per conservarlo nel CRM, premi «Salva esito nel CRM».');
 });
 window.addEventListener('radix:lead-outcome-voided',e=>{
  const row=e.detail;if(!row||!Number.isInteger(row.index))return;
  const q=pending.get(row.index)||[];
  const original=q.find(x=>x.key===row.ref&&x.type==='event');
  if(original){q.splice(q.indexOf(original),1)} // Nothing was saved remotely: nothing to correct.
  else q.push({type:'void',key:row.key,ref:row.ref,stage:row.stage,at:row.at});
  pending.set(row.index,q);controls();speak('Rettifica registrata localmente. Se esiste un evento remoto, salva anche la correzione.');
 });
 window.addEventListener('radix:lead-approval-changed',e=>{
  if(e.detail?.approved!==false)return;
  pending.delete(Number(e.detail.index));history=null;
  if(Number(e.detail.index)===idx())draw([]);
  controls();speak('Approvazione revocata: dati locali da sincronizzare eliminati. Lo storico CRM non viene cancellato automaticamente.');
 });
 $('outcome-prospect').addEventListener('change',()=>{history=null;draw([]);controls()});
 $('sync-workspace').addEventListener('change',()=>{history=null;draw([]);controls()});
 $('crm-outcome-save').addEventListener('click',save);
 $('crm-outcome-load').addEventListener('click',load);
 reset();
})();
