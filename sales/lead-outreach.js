'use strict';
(()=>{
 const $=id=>document.getElementById(id),C=window.RadixOutreach,state={approvals:new Map(),edits:new Map(),drafts:new Map(),plans:new Map(),created:new Map(),tasks:new Set(),taskGroups:new Set(),busy:false};
 let queue=[],activeIndex=null;
 const elt=(t,s,c)=>{const n=document.createElement(t);if(s!==undefined)n.textContent=String(s);if(c)n.className=c;return n};
 const i=()=>Number($('out-prospect').value),candidate=()=>queue[i()];
 const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
 const say=s=>{$('out-status').textContent=s;$('out-plan-status').textContent=s;};
 function counters(){$('out-count').textContent=state.approvals.size+' / '+queue.length;$('out-summary').textContent=String(state.approvals.size);$('out-summary-side').textContent=String(state.approvals.size)}
 function controls(){$('out-plan').disabled=!state.approvals.has(i())||!state.drafts.has(i());$('out-export').disabled=!state.plans.has(i());$('out-task').disabled=!state.approvals.has(i())||!state.plans.has(i())||state.tasks.has(i());$('out-task-all').disabled=state.busy||!state.approvals.has(i())||!state.plans.has(i())||state.taskGroups.has(i())}
 function timeline(){const root=$('out-timeline');root.replaceChildren();const plan=state.plans.get(i());if(!plan){root.append(elt('p','Prima approva un prospect e prepara la sua bozza email.','muted'));return}for(const item of plan){const card=elt('article',undefined,'out-sequence-card'),date=elt('time',item.date);date.dateTime=item.date;card.append(date,elt('b',item.step),elt('strong',item.subject),elt('p',item.body));root.append(card)}}
 const form=()=>({email:$('out-email').value.trim(),contact:$('out-contact').value.trim(),source:$('out-source').value.trim(),basis:$('out-basis').value,notes:$('out-notes').value.trim(),checked:$('out-checked').checked,privacy:$('out-privacy').checked});
 function remember(){if(activeIndex!==null&&queue[activeIndex])state.edits.set(activeIndex,form())}
 function selected(){
  const next=i();if(activeIndex!==null&&activeIndex!==next)remember();
  const q=candidate(),a=state.edits.get(next)||state.approvals.get(next);
  activeIndex=q?next:null;
  $('out-company').textContent=q?.candidate.name||'—';
  $('out-email').value=a?.email||'';$('out-contact').value=a?.contact||'';
  $('out-source').value=a?.source||(q&&C&&/^https:\/\//.test(q.candidate.source)?q.candidate.source:'');
  $('out-basis').value=a?.basis||'';$('out-notes').value=a?.notes||'';
  $('out-checked').checked=Boolean(a?.checked);$('out-privacy').checked=Boolean(a?.privacy);
  $('out-approve').disabled=!q;
  say(q?(state.approvals.has(next)?'✓ APPROVATO · ':'Bozza revisione · ')+'Score '+(q.score??'—')+' · '+q.priority+' · '+q.reasons.join(' / '):'Qualifica almeno un prospect.');
  timeline();controls();counters();
 }
 function invalidateApproval(idx){
  if(!state.approvals.has(idx))return false;
  state.approvals.delete(idx);state.drafts.delete(idx);state.plans.delete(idx);
  window.dispatchEvent(new CustomEvent('radix:lead-approval-changed',{detail:{index:idx,approved:false}}));
  return true;
 }
 function update(items){
  queue=Array.isArray(items)?items.slice(0,250):[];activeIndex=null;state.edits.clear();state.approvals.clear();state.drafts.clear();state.plans.clear();state.created.clear();state.tasks.clear();state.taskGroups.clear();
  const sel=$('out-prospect');sel.replaceChildren();queue.forEach((p,n)=>{const o=elt('option',p.candidate.name||p.candidate.domain||'Prospect '+(n+1));o.value=String(n);sel.append(o)});if(!queue.length)sel.append(elt('option','Qualifica prima la lista'));sel.disabled=!queue.length;selected()
 }
 function approve(){
  const q=candidate();if(!q)return;const data=form();const validation=C.validate(q,data);
  if(!validation.ok){say('Approvazione bloccata: '+validation.errors.join(' · '));return}
  state.edits.set(i(),data);state.approvals.set(i(),data);state.drafts.delete(i());state.plans.delete(i());window.dispatchEvent(new CustomEvent('radix:lead-approval-changed',{detail:{index:i(),approved:true}}));$('mail-prospect').value=String(i());$('mail-copy').disabled=true;timeline();controls();counters();say('Approvato per bozza: nessun messaggio inviato.')
 }
 function plan(){
  try{if($('out-start').value<today())throw Error('Seleziona una data non passata');state.plans.set(i(),C.makePlan(candidate(),state.drafts.get(i()),$('out-start').value,$('out-d1').value,$('out-d2').value));window.dispatchEvent(new CustomEvent('radix:lead-plan-created',{detail:{index:i()}}));say('Sequenza di tre bozze pronta per revisione. Nessun invio programmato.')}catch(e){state.plans.delete(i());say(e.message)}timeline();controls()
 }
 function exportCsv(){const p=state.plans.get(i()),a=state.approvals.get(i());if(!p||!a)return;const value=C.toCsv(p,candidate().candidate.name,a.email),url=URL.createObjectURL(new Blob([value],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='RADIX_Lead_outreach.csv';document.body.append(link);link.click();link.remove();URL.revokeObjectURL(url);say('Esportato il piano: nessuna email inviata.')}
 async function readTaskPage(workspace,offset){
  const query=new URLSearchParams({entity:'tasks',workspace,offset:String(offset)});
  const res=await fetch('/api/sales?'+query.toString(),{method:'GET',credentials:'same-origin',cache:'no-store'});
  const json=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(json.error||'Verifica task: HTTP '+res.status);
  if(!Array.isArray(json.rows))throw Error('Elenco task non disponibile.');
  return json.rows;
 }
 async function crmTask(){
  const idx=i(),p=state.plans.get(idx),record=state.created.get(idx),ws=$('sync-workspace').value,name=queue[idx]?.candidate?.name;
  if(state.busy||!p||state.tasks.has(idx)||!state.approvals.has(idx)||!name)return;
  if(!record||!record.companyId||record.workspace!==ws){say('Prima crea la scheda azienda con il CRM handoff nello stesso workspace.');return}
  state.busy=true;$('out-task').disabled=true;let postAttempted=false;
  const title='Primo contatto · '+name;
  const unchanged=()=>state.approvals.has(idx)&&state.plans.get(idx)===p&&state.created.get(idx)===record&&$('sync-workspace').value===ws;
  try{
   // Fail closed if the authorized workspace cannot be scanned completely.
   const found=await window.RadixLeadTaskGuard.findExisting({
    companyId:record.companyId,title,fetchPage:offset=>readTaskPage(ws,offset)
   });
   if(!unchanged()){say('Dati o approvazione cambiati durante la verifica: nessun task creato.');return}
   if(found){state.tasks.add(idx);say('Attività CRM già presente per questa azienda. Nessun duplicato creato. Controlla To-do nel CRM.');return}
   if(!window.confirm('Non risultano task identici nei primi 1000 record del workspace. Creare UNA attività CRM per '+name+' in data '+p[0].date+'? Nessuna email sarà inviata.'))return;
   if(!unchanged()){say('Dati cambiati durante la conferma: nessun task creato.');return}
   const body={workspace:ws,entity:'tasks',action:'create',data:{title,company_id:record.companyId,status:'todo',priority:'normal',due_at:p[0].date+'T12:00:00Z'}};
   // Once POST has started, never blindly retry after an uncertain response.
   postAttempted=true;state.tasks.add(idx);
   const res=await fetch('/api/sales',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','x-radix-sales':'1'},body:JSON.stringify(body)});
   const json=await res.json().catch(()=>({}));
   if(!res.ok)throw Error(json.error||'HTTP '+res.status);
   if(!Array.isArray(json.rows)||!json.rows[0]?.id)throw Error('Conferma server incompleta');
   say('Attività CRM creata e confermata. Nessuna email inviata.');
  }catch(e){
   say((postAttempted?'Esito creazione non confermato: controlla nel CRM prima di ripetere. ':'Nessun task creato: verifica CRM non completata. ')+e.message);
  }finally{state.busy=false;controls()}
 }
 async function crmSequenceTasks(){
  const idx=i(),plan=state.plans.get(idx),record=state.created.get(idx),workspace=$('sync-workspace').value,company=queue[idx]?.candidate?.name;
  if(state.busy||state.taskGroups.has(idx)||!state.approvals.has(idx)||!plan||plan.length!==3||!company)return;
  if(!record||!record.companyId||record.workspace!==workspace){say('Prima collega un’azienda CRM autorizzata nello stesso workspace.');return}
  const labels=['Primo contatto','Follow-up 1','Follow-up 2'];
  const specs=plan.map((row,j)=>({
   title:(labels[j]+' · '+company).slice(0,200),
   company_id:record.companyId,status:'todo',priority:'normal',due_at:row.date+'T12:00:00Z'
  }));
  const originalPlan=plan,originalRecord=record,unchanged=()=>state.approvals.has(idx)&&state.plans.get(idx)===originalPlan&&state.created.get(idx)===originalRecord&&$('sync-workspace').value===workspace;
  state.busy=true;controls();let startedPost=false;
  try{
   const present=await window.RadixLeadTaskGuard.findExistingMany({
    companyId:record.companyId,titles:specs.map(s=>s.title),fetchPage:offset=>readTaskPage(workspace,offset)
   });
   if(!unchanged()){say('Piano o revisione cambiati durante il controllo: nessuna attività creata.');return}
   const missing=specs.filter(s=>!present.has(s.title));
   if(!missing.length){state.tasks.add(idx);state.taskGroups.add(idx);say('Tutte e tre le attività sono già presenti nel CRM: nessun duplicato creato.');return}
   if(!window.confirm('Il CRM contiene già '+present.size+' fasi di questa sequenza. Creare le '+missing.length+' attività mancanti per '+company+'? Le date sono quelle del piano, ma NESSUNA email verrà inviata.'))return;
   if(!unchanged()){say('Piano cambiato prima della conferma: nessuna attività creata.');return}
   let created=0;
   for(const data of missing){
    // Do not silently repeat a possibly completed POST.
    startedPost=true;state.taskGroups.add(idx);controls();
    const res=await fetch('/api/sales',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','x-radix-sales':'1'},body:JSON.stringify({workspace,entity:'tasks',action:'create',data})});
    const result=await res.json().catch(()=>({}));
    if(!res.ok)throw Error(result.error||'HTTP '+res.status);
    if(!Array.isArray(result.rows)||!result.rows[0]?.id)throw Error('Risposta CRM non confermata');
    created++;
    say(created+' / '+missing.length+' attività CRM create. Nessuna email inviata.');
   }
   state.tasks.add(idx);say('Sequenza di 3 task CRM verificata: '+present.size+' già presenti, '+created+' aggiunti. Nessun invio email.');
  }catch(e){
   say((startedPost?'Operazione parziale o esito incerto: controlla i task nel CRM prima di riprovare. ':'Nessuna nuova attività creata: ')+e.message);
  }finally{state.busy=false;controls()}
 }

 window.radixLeadWorkflow={
  approvalFor:n=>state.approvals.get(Number(n))||null,
  archiveReviews:()=>{
   const rows=[];
   for(const [idx,a] of state.approvals.entries()){
    const q=queue[idx];if(!q||!C.validate(q,a).ok)continue;
    rows.push({index:idx,contact:a.contact,email:a.email,source:a.source,basis:a.basis,notes:a.notes,
     checked:a.checked,privacy:a.privacy,draft:state.drafts.get(idx)||null,plan:state.plans.get(idx)||[]});
   }
   return rows;
  },
  restoreReviews:rows=>{
   if(!Array.isArray(rows))throw Error('Revisioni non valide');
   // Called only after the source prospect list has been requalified, triggering update().
   let restored=0;
   for(const r of rows){
    const idx=r.index,q=queue[idx],a={contact:r.contact,email:r.email,source:r.source,basis:r.basis,notes:r.notes,checked:r.checked,privacy:r.privacy};
    if(!q||!C.validate(q,a).ok)continue; // never silently reapprove a changed/duplicate prospect.
    state.approvals.set(idx,a);state.edits.set(idx,a);
    if(r.draft&&r.draft.subject&&r.draft.body)state.drafts.set(idx,{subject:r.draft.subject,body:r.draft.body});
    if(state.drafts.has(idx)&&Array.isArray(r.plan)&&r.plan.length===3)state.plans.set(idx,r.plan.map(x=>({...x})));
    window.dispatchEvent(new CustomEvent('radix:lead-approval-changed',{detail:{index:idx,approved:true}}));
    if(state.drafts.has(idx))window.dispatchEvent(new CustomEvent('radix:lead-draft',{detail:{index:idx,...state.drafts.get(idx)}}));
    if(state.plans.has(idx))window.dispatchEvent(new CustomEvent('radix:lead-plan-created',{detail:{index:idx}}));
    restored++;
   }
   selected();counters();controls();
   say('Ricaricate '+restored+' / '+rows.length+' approvazioni. Verifica fonti, consenso e scadenze prima di nuove attività CRM.');
   return restored;
  }
 };
 window.addEventListener('radix:lead-reviewed',e=>update(e.detail?.entries||[]));
 window.addEventListener('radix:lead-draft',e=>{const x=e.detail||{},j=Number(x.index);if(!state.approvals.has(j))return;state.drafts.set(j,{subject:x.subject,body:x.body});state.plans.delete(j);window.dispatchEvent(new CustomEvent('radix:lead-plan-stale',{detail:{index:j}}));timeline();controls();say('Bozza disponibile: prepara ora la sequenza.')});
 window.addEventListener('radix:lead-draft-stale',e=>{const n=Number(e.detail?.index);state.drafts.delete(n);state.plans.delete(n);window.dispatchEvent(new CustomEvent('radix:lead-plan-stale',{detail:{index:n}}));if(n===i()){timeline();controls();say('Bozza modificata: rigenerala prima di ripianificare la sequenza.')}});
 window.addEventListener('radix:lead-crm-created',e=>{const x=e.detail||{};if(/^[0-9a-f-]{36}$/i.test(x.companyId||''))state.created.set(Number(x.index),{workspace:x.workspace,companyId:x.companyId})});
 $('out-prospect').addEventListener('change',selected);$('out-approve').addEventListener('click',approve);
 $('out-revoke').addEventListener('click',()=>{
  if(!candidate())return;if(!window.confirm('Revocare approvazione e piano?'))return;
  const changed=invalidateApproval(i());$('out-checked').checked=false;$('out-privacy').checked=false;
  state.edits.set(i(),form());timeline();controls();counters();
  say(changed?'Approvazione revocata. Dati di lavoro conservati solo in memoria.':'Nessuna approvazione attiva. Bozza conservata solo in memoria.');
 });
 const fields=['out-email','out-contact','out-source','out-basis','out-notes','out-checked','out-privacy'];
 function changedField(){
  if(!candidate())return;
  const previouslyApproved=invalidateApproval(i());
  if(previouslyApproved){$('out-checked').checked=false;$('out-privacy').checked=false}
  remember();timeline();controls();counters();
  if(previouslyApproved)say('Dati del prospect modificati: approvazione e bozze CRM/email invalidate. Ricontrolla privacy e approva di nuovo.');
  else say('Bozza di revisione salvata temporaneamente in questa scheda. Non ancora approvata.');
 }
 for(const id of fields)$(id).addEventListener('input',changedField);
 for(const id of fields.filter(id=>['out-basis','out-checked','out-privacy'].includes(id)))$(id).addEventListener('change',changedField);
 for(const id of ['out-start','out-d1','out-d2'])$(id).addEventListener('change',()=>{if(!state.plans.has(i()))return;state.plans.delete(i());window.dispatchEvent(new CustomEvent('radix:lead-plan-stale',{detail:{index:i()}}));timeline();controls();say('Scadenze modificate: genera nuovamente la sequenza.')});
 $('out-start').value=today();$('out-start').min=today();$('out-plan').addEventListener('click',plan);$('out-export').addEventListener('click',exportCsv);$('out-task').addEventListener('click',crmTask);$('out-task-all').addEventListener('click',crmSequenceTasks);update([]);
})();
