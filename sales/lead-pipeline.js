'use strict';
/* Lead pipeline: one table for every imported lead (CSV/XLSX prospects + individual contacts restored from the
   LinkedIn local agent backup), with filters, session segments, CSV export and the bulk «Porta nel CRM».
   Numbers come only from the data on the page or read from the CRM: unknown values stay «—». */
(()=>{
 const C=window.RadixLeadBulkCrm;if(!C)return;
 const $=id=>document.getElementById(id),SHOW=300,PAGE=100,MAX_PAGES=50;
 const state={leads:[],selected:new Set(),segments:new Map(),created:new Set(),outcomes:new Map(),crm:null,workspaces:null,plans:[],running:false,stop:false};
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n};
 const note=msg=>{$('lp-note').textContent=msg};
 const bulkStatus=msg=>{$('bulk-status').textContent=msg};
 // ---- data ----
 function rebuild(){
  const contacts=window.radixLeadContacts?.records()||[],prospects=window.radixLeadData?.list?.()||[];
  const approval=i=>window.radixLeadWorkflow?.approvalFor?.(i)||null;
  state.leads=[...contacts.map(C.fromContact),...prospects.map((p,i)=>C.fromProspect(p,i,approval(i)))];
  for(const l of state.leads)l.key=C.leadKey(l);
  const ids=new Set(state.leads.map(l=>l.id));for(const id of state.selected)if(!ids.has(id))state.selected.delete(id);
  render();
 }
 function status(l){
  if(l.origin==='lista'&&[...state.outcomes.values()].some(i=>i===l.index))return 'Contattato';
  if(state.created.has(l.key))return 'Creato ora';
  if(state.crm)return C.inCrm(l,state.crm.ix)?'Nel CRM':'Nuovo';
  return 'Da verificare';
 }
 function filtered(){
  const q=C.norm($('lp-search').value),src=$('lp-source').value,st=$('lp-status').value,seg=$('lp-segment').value;
  return state.leads.filter(l=>{
   if(q&&!C.norm([l.name,l.email,l.company,l.domain,l.role].join(' ')).includes(q))return false;
   if(src&&l.sourceLabel!==src)return false;if(st&&status(l)!==st)return false;
   const s=state.segments.get(l.key)||'';if(seg==='__none'?s:seg&&s!==seg)return false;
   return true;
  });
 }
 const targets=()=>{const sel=state.leads.filter(l=>state.selected.has(l.id));return sel.length?sel:filtered()};
 function options(select,values,first){const cur=select.value;const all=el('option',first);all.value='';select.replaceChildren(all);for(const [v,t] of values){const o=el('option',t);o.value=v;select.append(o)}select.value=[...select.options].some(o=>o.value===cur)?cur:''}
 // ---- render ----
 function metrics(){
  const n=state.leads.length,set=(id,v)=>{$(id).textContent=v};
  set('lp-total',String(n));set('lp-email',String(state.leads.filter(l=>l.email).length));
  set('lp-incrm',state.crm?String(state.leads.filter(l=>state.created.has(l.key)||C.inCrm(l,state.crm.ix)).length):'—');
  set('lp-contacted',state.leads.some(l=>l.origin==='lista')?String(new Set(state.outcomes.values()).size):'—');
  $('lp-incrm-hint').textContent=state.crm?'workspace '+state.crm.name:'controlla il CRM';
 }
 function render(){
  options($('lp-source'),[...new Set(state.leads.map(l=>l.sourceLabel))].sort().map(x=>[x,x]),'Tutte le fonti');
  options($('lp-segment'),[...[...new Set(state.segments.values())].sort().map(x=>[x,x]),['__none','Senza segmento']],'Tutti i segmenti');
  $('lp-seglist').replaceChildren(...[...new Set(state.segments.values())].map(x=>{const o=el('option');o.value=x;return o}));
  metrics();
  const rows=filtered(),body=$('lp-rows');body.replaceChildren();
  for(const l of rows.slice(0,SHOW)){
   const tr=el('tr');if(state.selected.has(l.id))tr.className='on';
   const box=el('input');box.type='checkbox';box.checked=state.selected.has(l.id);box.setAttribute('aria-label','Seleziona '+(l.name||l.company||'lead'));
   box.addEventListener('change',()=>{box.checked?state.selected.add(l.id):state.selected.delete(l.id);tr.className=box.checked?'on':'';selection()});
   const c0=el('td',null,'lp-check');c0.append(box);
   const c1=el('td',null,'lp-name');c1.append(el('strong',l.name||'—'));if(!l.name)c1.append(el('small','Solo azienda'));
   const c2=el('td',null,'lp-mail');if(l.email){c2.append(el('span',l.email));if(l.verified){const b=el('span','✓','lp-verified');b.title='Email verificata nella revisione';b.setAttribute('aria-label','verificata');c2.append(b)}}else c2.append(el('span','—','lp-dim'));
   const c3=el('td',l.company||'—'),c4=el('td',l.domain||'—','lp-domain'),c5=el('td',l.role||'—','lp-role');
   const c6=el('td',null);c6.append(el('span',l.sourceLabel,'lp-source'));
   const st=status(l),c7=el('td',null);c7.append(el('span',st,'lp-pill lp-'+st.toLowerCase().replace(/\s+/g,'-')));
   const seg=state.segments.get(l.key);if(seg)c7.append(el('small',seg,'lp-seg'));
   tr.append(c0,c1,c2,c3,c4,c5,c6,c7);body.append(tr);
  }
  $('lp-empty').hidden=rows.length>0;
  $('lp-empty-text').textContent=state.leads.length?'Nessun lead corrisponde ai filtri.':'Nessun lead ancora. Scegli da dove prenderli al passo 1: LinkedIn, file CSV/Excel, provider o backup.';
  $('lp-more').textContent=rows.length>SHOW?'Mostrati i primi '+SHOW+' lead su '+rows.length+': usa la ricerca o i filtri per gli altri.':rows.length?rows.length+' lead in elenco':'';
  selection();
 }
 function selection(){
  const n=state.selected.size,rows=filtered();
  $('lp-all').checked=rows.length>0&&rows.slice(0,SHOW).every(l=>state.selected.has(l.id));
  $('lp-selected').textContent=n?n+' selezionati':'';
  $('lp-crm-count').textContent=n?' ('+n+')':'';
 }
 // ---- CRM access (same endpoints and headers as lead-crm-handoff.js) ----
 async function get(params){
  const r=await fetch('/api/sales?'+new URLSearchParams(params),{credentials:'same-origin',cache:'no-store'}),d=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(d.error||d.message||'CRM non raggiungibile (HTTP '+r.status+')');
  if(!Array.isArray(d.rows))throw Error('Il CRM ha restituito un formato inatteso');return d.rows;
 }
 async function readAll(entity,ws){
  const rows=[];
  for(let page=0;page<MAX_PAGES;page++){const slice=await get({entity,workspace:ws,offset:String(rows.length)});rows.push(...slice);if(slice.length<PAGE)return rows}
  throw Error('Il CRM ha più di '+(PAGE*MAX_PAGES)+' '+entity+': controllo doppioni incompleto, operazione bloccata.');
 }
 async function create(ws,entity,data){
  const r=await fetch('/api/sales',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','x-radix-sales':'1'},body:JSON.stringify({workspace:ws,entity,action:'create',data})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(d.error||'Errore del CRM (HTTP '+r.status+')');
  const id=d.rows?.[0]?.id;if(typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id))throw Error('Il CRM non ha confermato il salvataggio');return id;
 }
 async function workspaces(){
  if(state.workspaces)return state.workspaces;
  const all=await get({entity:'workspaces'}),ok=all.filter(w=>['owner','admin','member'].includes(w.role));
  if(!ok.length)throw Error('Nessun workspace CRM in cui puoi scrivere');
  state.workspaces=ok;const sel=$('bulk-workspace');sel.replaceChildren(...ok.map(w=>{const o=el('option',w.name||w.id);o.value=w.id;return o}));window.RadixLeadFlow?.preferWorkspace(sel);sel.disabled=false;
  return ok;
 }
 async function loadCrm(){
  const ws=$('bulk-workspace').value;if(!ws)throw Error('Scegli un workspace');
  const [companies,contacts,leads,opportunities,processes,stages]=await Promise.all(['companies','contacts','leads','opportunities','processes','stages'].map(e=>readAll(e,ws)));
  const pipes=C.pipelines(processes,stages),name=state.workspaces.find(w=>w.id===ws)?.name||'';
  state.crm={ws,name,ix:C.indexCrm({companies,contacts,leads,opportunities}),pipes};
  const sel=$('bulk-target'),cur=sel.value;
  // Default «Lead nel CRM», as in Salesforce: qualify there, then «Converti» into an opportunity.
  sel.replaceChildren(Object.assign(el('option','Lead nel CRM: da qualificare, poi «Converti»'),{value:'leads'}),...pipes.map((p,i)=>{const o=el('option','Subito opportunità · '+p.title+' → fase «'+p.stage+'»');o.value='p'+i;return o}));
  if([...sel.options].some(o=>o.value===cur))sel.value=cur;sel.disabled=false;
  render();
 }
 const target=()=>{const v=$('bulk-target').value;if(v==='leads')return {entity:'leads'};const p=state.crm?.pipes[Number(v.slice(1))];return p?{entity:'opportunities',process_id:p.process_id,stage_id:p.stage_id}:null};
 // ---- bulk flow ----
 function showPreview(){
  const p=state.plans.at(-1),v=C.preview(p),box=$('bulk-preview');box.replaceChildren();
  const stat=(n,t)=>{const d=el('div');d.append(el('strong',String(n)),el('span',t));box.append(d)};
  stat(v.companies,'aziende nuove');stat(v.contacts,'referenti nuovi');stat(v.deals,p.target.entity==='leads'?'lead nuovi':'opportunità nuove');stat(v.existing,'già nel CRM');stat(v.skipped,'saltati');
  $('bulk-run').disabled=!v.leads;$('bulk-run').textContent=v.leads?'Conferma: porta '+v.leads+' lead nel CRM':'Niente da creare';
  bulkStatus(v.leads?'Controllo doppioni fatto sul workspace «'+state.crm.name+'». Un clic crea tutto; i doppioni vengono saltati.':'Tutti i lead sono già nel CRM o non hanno dati sufficienti.');
 }
 async function prepare(leads){
  state.plans=[];$('bulk-summary').replaceChildren();$('bulk-resume').hidden=true;$('bulk-progress').value=0;
  if(!leads.length){bulkStatus('Nessun lead da portare: importa una lista o cambia i filtri.');$('bulk-run').disabled=true;return}
  $('bulk-run').disabled=true;bulkStatus('Lettura del CRM e controllo doppioni…');
  try{await workspaces();await loadCrm();const t=target();if(!t)throw Error('Scegli dove creare le opportunità');state.plans=[C.plan(leads,state.crm.ix,t,state.segments)];state.pending=leads;showPreview()}
  catch(e){bulkStatus('CRM non disponibile: '+e.message)}
 }
 function open(){
  const list=targets();state.pending=list;
  $('bulk-crm').hidden=false;$('bulk-scope').textContent=state.selected.size?list.length+' lead selezionati':'Tutti i '+list.length+' lead in elenco';
  $('bulk-crm').scrollIntoView?.({block:'nearest',behavior:'smooth'});
  prepare(list);
 }
 function summary(){
  const parts=state.plans.map(C.summary),last=parts.at(-1),sum=k=>parts.reduce((a,s)=>a+s[k],0),box=$('bulk-summary');box.replaceChildren();
  const created=sum('companies')+sum('contacts')+sum('deals');
  box.append(el('h3',last.failed.length?'Interrotto':last.pending?'In pausa':'Fatto'));
  const ul=el('ul');
  ul.append(el('li','Creati: '+sum('companies')+' aziende, '+sum('contacts')+' referenti, '+sum('deals')+' '+(state.plans[0].target.entity==='leads'?'lead':'opportunità')+' ('+sum('done')+' lead completati)'));
  ul.append(el('li','Già presenti nel CRM: '+sum('existing')));
  const skipped=parts.flatMap(s=>s.skipped);ul.append(el('li','Saltati: '+skipped.length));box.append(ul);
  if(skipped.length){const d=el('details');d.append(el('summary','Vedi i saltati e il motivo'));const l=el('ul');for(const s of skipped.slice(0,200))l.append(el('li',s.name+' — '+s.reason));d.append(l);box.append(d)}
  if(last.failed.length)box.append(el('p','Errore del CRM su «'+last.failed[0].name+'»: '+last.failed[0].reason+'. Correggi o riprova: «Riprendi» ricontrolla il CRM e continua dai lead mancanti.','lp-error'));
  if(created){const a=el('a','Apri i contatti nel CRM →','lp-link');a.href='/radix-sales.html#contacts';box.append(a)}
 }
 async function run(){
  const p=state.plans.at(-1);if(!p||state.running||!state.crm)return;
  state.running=true;state.stop=false;$('bulk-run').disabled=true;$('bulk-stop').hidden=false;$('bulk-resume').hidden=true;$('bulk-target').disabled=true;$('bulk-workspace').disabled=true;
  const ws=state.crm.ws,before=state.plans.slice(0,-1).reduce((a,x)=>a+C.progress(x).done,0),total=before+C.progress(p).total;
  const tick=x=>{$('bulk-progress').max=Math.max(total,1);$('bulk-progress').value=before+x.done;bulkStatus('In corso: '+(before+x.done)+' di '+total+' lead…')};
  const r=await C.run(p,{create:(entity,data)=>create(ws,entity,data)},{batch:10,onProgress:tick,shouldStop:()=>state.stop});
  for(const it of p.items)if(it.state==='done')state.created.add(it.lead.key);
  state.running=false;$('bulk-stop').hidden=true;$('bulk-workspace').disabled=false;
  $('bulk-resume').hidden=!r.stopped;
  bulkStatus(r.stopped==='error'?'Fermato al primo errore del CRM. Nessun altro lead è stato toccato.':r.stopped==='user'?'Fermato su tua richiesta. Puoi riprendere quando vuoi.':'Completato.');
  summary();
  try{await loadCrm()}catch(_){render()}
 }
 async function resume(){
  const p=state.plans.at(-1);if(!p||state.running)return;
  const rest=p.items.filter(x=>x.state==='todo'||x.state==='error').map(x=>x.lead);
  bulkStatus('Ricontrollo il CRM prima di riprendere…');$('bulk-resume').hidden=true;
  try{await loadCrm();state.plans.push(C.plan(rest,state.crm.ix,p.target,state.segments));await run()}
  catch(e){bulkStatus('Ripresa non riuscita: '+e.message);$('bulk-resume').hidden=false}
 }
 // ---- toolbar ----
 function exportCsv(){
  const rows=targets();if(!rows.length){note('Nessun lead da esportare.');return}
  const csv=C.toCsv(rows.map(l=>({...l,status:status(l),segment:state.segments.get(l.key)||''})));
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='RADIX_lead_pipeline.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  note('Esportati '+rows.length+' lead in CSV. Contiene dati personali: conservalo con cura.');
 }
 function addSegment(){
  const name=$('lp-segname').value.trim().slice(0,80),sel=state.leads.filter(l=>state.selected.has(l.id));
  if(!sel.length){note('Seleziona prima i lead da mettere nel segmento.');return}
  if(!name){note('Scrivi il nome del segmento.');return}
  for(const l of sel)state.segments.set(l.key,name);
  $('lp-segform').hidden=true;$('lp-segname').value='';render();
  note(sel.length+' lead nel segmento «'+name+'» (vale per questa sessione; portandoli nel CRM il segmento finisce nelle note del referente).');
 }
 $('lp-search').addEventListener('input',render);for(const id of ['lp-source','lp-status','lp-segment'])$(id).addEventListener('change',render);
 $('lp-all').addEventListener('change',()=>{for(const l of filtered().slice(0,SHOW))$('lp-all').checked?state.selected.add(l.id):state.selected.delete(l.id);render()});
 $('lp-crm').addEventListener('click',open);
 $('lp-export').addEventListener('click',exportCsv);
 $('lp-segment-add').addEventListener('click',()=>{$('lp-segform').hidden=!$('lp-segform').hidden;if(!$('lp-segform').hidden)$('lp-segname').focus()});
 $('lp-segapply').addEventListener('click',addSegment);$('lp-segname').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addSegment()}});
 $('lp-segcancel').addEventListener('click',()=>{$('lp-segform').hidden=true});
 $('bulk-run').addEventListener('click',run);$('bulk-resume').addEventListener('click',resume);
 $('bulk-stop').addEventListener('click',()=>{state.stop=true;bulkStatus('Mi fermo alla fine del gruppo in corso…')});
 $('bulk-close').addEventListener('click',()=>{if(!state.running)$('bulk-crm').hidden=true});
 $('bulk-workspace').addEventListener('change',()=>{if(!state.running)prepare(state.pending||targets())});
 $('bulk-target').addEventListener('change',()=>{if(!state.running&&state.crm&&state.pending){const t=target();if(t){state.plans=[C.plan(state.pending,state.crm.ix,t,state.segments)];$('bulk-summary').replaceChildren();showPreview()}}});
 // A chosen backup file is restored right away (one step instead of two).
 $('contact-restore-file')?.addEventListener('change',()=>{if($('contact-restore-file').files?.length)$('contact-restore')?.click()});
 window.addEventListener('radix:lead-contacts-updated',rebuild);
 window.addEventListener('radix:lead-list-updated',()=>{state.outcomes.clear();rebuild()});
 window.addEventListener('radix:lead-approval-changed',rebuild);
 window.addEventListener('radix:lead-reviewed',rebuild);
 window.addEventListener('radix:lead-outcome-recorded',e=>{const d=e.detail||{};if(d.key&&Number.isInteger(d.index)&&['contacted','replied','meeting','won','lost'].includes(d.stage))state.outcomes.set(d.key,d.index);render()});
 window.addEventListener('radix:lead-outcome-voided',e=>{state.outcomes.delete(e.detail?.ref);render()});
 // Read-only view for the Newsletter tab (sales/lead-newsletter.js): the leads it would act on and their session segments.
 window.RadixLeadPipeline=Object.freeze({targets:()=>targets().slice(),leads:()=>state.leads.slice(),segmentOf:key=>state.segments.get(key)||'',segments:()=>[...new Set(state.segments.values())].sort(),selected:()=>state.selected.size});
 rebuild();
})();
