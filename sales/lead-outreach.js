'use strict';
(()=>{
 const $=id=>document.getElementById(id),C=window.RadixOutreach,entries=[],state={approvals:new Map(),drafts:new Map(),plans:new Map(),created:new Map(),tasks:new Set(),busy:false};
 let queue=[];
 const elt=(t,s,c)=>{const n=document.createElement(t);if(s!==undefined)n.textContent=String(s);if(c)n.className=c;return n};
 const i=()=>Number($('out-prospect').value),candidate=()=>queue[i()];
 const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
 const say=s=>$('out-status').textContent=s;
 function counters(){$('out-count').textContent=state.approvals.size+' / '+queue.length;$('out-summary').textContent=String(state.approvals.size);$('out-summary-side').textContent=String(state.approvals.size)}
 function controls(){$('out-plan').disabled=!state.approvals.has(i())||!state.drafts.has(i());$('out-export').disabled=!state.plans.has(i());$('out-task').disabled=!state.plans.has(i())||state.tasks.has(i())}
 function timeline(){const root=$('out-timeline');root.replaceChildren();const plan=state.plans.get(i());if(!plan){root.append(elt('p','Prima approva un prospect e prepara la sua bozza email.','muted'));return}for(const item of plan){const card=elt('article',undefined,'out-sequence-card'),date=elt('time',item.date);date.dateTime=item.date;card.append(date,elt('b',item.step),elt('strong',item.subject),elt('p',item.body));root.append(card)}}
 function selected(){const q=candidate(),a=state.approvals.get(i());$('out-company').textContent=q?.candidate.name||'—';$('out-email').value=a?.email||'';$('out-contact').value=a?.contact||'';$('out-source').value=a?.source||(q&&C&&/^https:\/\//.test(q.candidate.source)?q.candidate.source:'');$('out-basis').value=a?.basis||'';$('out-notes').value=a?.notes||'';$('out-checked').checked=Boolean(a);$('out-privacy').checked=Boolean(a);say(q?'Score '+(q.score??'—')+' · '+q.priority+' · '+q.reasons.join(' / '):'Qualifica almeno un prospect.');timeline();controls();counters()}
 function update(items){
  queue=Array.isArray(items)?items.slice(0,250):[];state.approvals.clear();state.drafts.clear();state.plans.clear();state.created.clear();state.tasks.clear();
  const sel=$('out-prospect');sel.replaceChildren();queue.forEach((p,n)=>{const o=elt('option',p.candidate.name||p.candidate.domain||'Prospect '+(n+1));o.value=String(n);sel.append(o)});if(!queue.length)sel.append(elt('option','Qualifica prima la lista'));sel.disabled=!queue.length;selected()
 }
 function approve(){
  const q=candidate();if(!q)return;const data={email:$('out-email').value.trim(),contact:$('out-contact').value.trim(),source:$('out-source').value.trim(),basis:$('out-basis').value,notes:$('out-notes').value.trim(),checked:$('out-checked').checked,privacy:$('out-privacy').checked};const validation=C.validate(q,data);
  if(!validation.ok){say('Approvazione bloccata: '+validation.errors.join(' · '));return}
  state.approvals.set(i(),data);state.drafts.delete(i());state.plans.delete(i());$('mail-prospect').value=String(i());$('mail-copy').disabled=true;timeline();controls();counters();say('Approvato per bozza: nessun messaggio inviato.')
 }
 function plan(){
  try{if($('out-start').value<today())throw Error('Seleziona una data non passata');state.plans.set(i(),C.makePlan(candidate(),state.drafts.get(i()),$('out-start').value,$('out-d1').value,$('out-d2').value));say('Sequenza di tre bozze pronta per revisione. Nessun invio programmato.')}catch(e){state.plans.delete(i());say(e.message)}timeline();controls()
 }
 function exportCsv(){const p=state.plans.get(i()),a=state.approvals.get(i());if(!p||!a)return;const value=C.toCsv(p,candidate().candidate.name,a.email),url=URL.createObjectURL(new Blob([value],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='RADIX_Lead_outreach.csv';document.body.append(link);link.click();link.remove();URL.revokeObjectURL(url);say('Esportato il piano: nessuna email inviata.')}
 async function crmTask(){
  const idx=i(),p=state.plans.get(idx),record=state.created.get(idx),ws=$('sync-workspace').value;if(state.busy||!p||state.tasks.has(idx))return;
  if(!record||!record.companyId||record.workspace!==ws){say('Prima crea la scheda azienda con il CRM handoff nello stesso workspace.');return}
  if(!window.confirm('Creare UNA attività CRM per '+candidate().candidate.name+' in data '+p[0].date+'? Non verranno inviate email.'))return;
  state.busy=true;$('out-task').disabled=true;
  try{const body={workspace:ws,entity:'tasks',action:'create',data:{title:'Primo contatto · '+candidate().candidate.name,company_id:record.companyId,status:'todo',priority:'normal',due_at:p[0].date+'T12:00:00Z'}};const res=await fetch('/api/sales',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','x-radix-sales':'1'},body:JSON.stringify(body)});const json=await res.json().catch(()=>({}));if(!res.ok)throw Error(json.error||'HTTP '+res.status);say('Attività creata. Apri To-do nel CRM: nessuna email inviata.')}catch(e){say('Esito non confermato: '+e.message+'. Controlla nel CRM prima di ripetere.')}finally{state.busy=false;state.tasks.add(idx);controls()}
 }
 window.radixLeadWorkflow={approvalFor:n=>state.approvals.get(Number(n))||null};
 window.addEventListener('radix:lead-reviewed',e=>update(e.detail?.entries||[]));
 window.addEventListener('radix:lead-draft',e=>{const x=e.detail||{},j=Number(x.index);if(!state.approvals.has(j))return;state.drafts.set(j,{subject:x.subject,body:x.body});state.plans.delete(j);timeline();controls();say('Bozza disponibile: prepara ora la sequenza.')});
 window.addEventListener('radix:lead-crm-created',e=>{const x=e.detail||{};if(/^[0-9a-f-]{36}$/i.test(x.companyId||''))state.created.set(Number(x.index),{workspace:x.workspace,companyId:x.companyId})});
 $('out-prospect').addEventListener('change',selected);$('out-approve').addEventListener('click',approve);
 $('out-revoke').addEventListener('click',()=>{if(!candidate())return;if(!window.confirm('Revocare approvazione e piano?'))return;state.approvals.delete(i());state.drafts.delete(i());state.plans.delete(i());selected()});
 $('out-start').value=today();$('out-start').min=today();$('out-plan').addEventListener('click',plan);$('out-export').addEventListener('click',exportCsv);$('out-task').addEventListener('click',crmTask);update([]);
})();
