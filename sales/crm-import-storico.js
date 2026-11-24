'use strict';
/* «Importa storico»: calls, meetings, emails and notes from a CSV or Excel export (Salesforce, HubSpot,
   Pipedrive, a sheet kept by hand), on top of sales.js (window.RadixSalesApp) and
   crm-import-storico-core.js. Reads the CRM, shows the preview with the column mapping (editable), writes
   nothing before the confirmation; then the existing /api/sales create of interactions, a few at a time,
   with progress, a stop button and the final report with the CSV of the skipped rows. */
(()=>{
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n};
const B=(text,fn,cls)=>{const b=E('button',text,cls);b.type='button';b.addEventListener('click',fn);return b};
const app=()=>window.RadixSalesApp,C=()=>window.RadixCrmImportStoricoCore;
const BATCH=5;
const n1=(n,one,many)=>n+' '+(n===1?one:many);
const when=(t,timed)=>t?new Intl.DateTimeFormat('it-IT',{dateStyle:'short',...(timed?{timeStyle:'short'}:{})}).format(new Date(t)):'—';
const OUTCOME={create:'Da creare',dup:'Duplicato',error:'Saltata'};
const post=data=>app().api('interactions',{body:{workspace:app().state.workspace,entity:'interactions',action:'create',data}});
function download(name,text){const a=E('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));a.download=name;document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}
// Every row of an entity, 100 per page: the matching and the duplicates must not depend on loaded pages.
async function pages(entity,max){const all=[];let offset=0,more=false;for(let i=0;i<max;i++){const r=(await app().api(entity,{offset})).rows||[];all.push(...r);if(r.length<100){more=false;break}more=true;offset+=r.length}return {rows:all,more}}
async function context(){
 const [companies,contacts,opportunities,interactions]=await Promise.all([pages('companies',50),pages('contacts',50),pages('opportunities',50),pages('interactions',200)]);
 return {companies:companies.rows,contacts:contacts.rows,opportunities:opportunities.rows,interactions:interactions.rows,partial:interactions.more};
}
async function run(label,fn){
 const a=app();if(a.state.busy)return false;a.lock(true);a.error('');a.notice(label);let ok=false;
 try{await fn();ok=true}catch(e){a.error(e.message||String(e));a.notice('Operazione non completata.')}
 finally{a.lock(false)}
 return ok;
}
async function importFile(file){
 const a=app();if(!file)return;
 let parsed;try{parsed=await window.RadixCrmCsv.readFile(file)}catch(e){a.error(e.message);return}
 if(!parsed.rows.length){a.error('Il file non ha righe da importare.');return}
 let ctx;
 if(!await run('Leggo il CRM per il confronto…',async()=>{ctx=await context()}))return;
 a.notice('Anteprima pronta: niente è stato ancora scritto.');
 preview(parsed,ctx,file.name);
}
function table(p,filter){
 const wrap=E('div',undefined,'crm-import-scroll'),t=E('table',undefined,'crm-import-table'),head=E('tr');
 for(const h of ['Riga','Data','Tipo','Oggetto','Collegata a','Testo','Esito','Avvisi e motivi'])head.append(E('th',h));
 const thead=E('thead');thead.append(head);const body=E('tbody');
 const rows=p.rows.filter(r=>filter==='all'||(filter==='warn'?r.status==='create'&&r.problems.length:filter==='skip'?r.status!=='create':r.status===filter));
 for(const r of rows.slice(0,500)){const tr=E('tr',undefined,'is-'+r.status+(r.status==='create'&&r.problems.length?' is-warn':''));
  const cell=(label,text,cls)=>{const td=E('td',text,cls);td.dataset.label=label;tr.append(td);return td};
  const v=r.view;
  cell('Riga',r.line);cell('Data',when(v.at,v.timed));cell('Tipo',C().KIND_LABEL[v.kind]||'—');cell('Oggetto',v.title||'—');cell('Collegata a',v.link||'—');
  const tx=cell('Testo',v.body||'—','crm-import-text');if(!v.body)tx.classList.add('is-empty');
  cell('Esito',r.status==='create'&&r.problems.length?'Da creare, con avvisi':OUTCOME[r.status],'crm-import-outcome');
  const td=cell('Avvisi e motivi');if(r.problems.length){const ul=E('ul');r.problems.forEach(x=>ul.append(E('li',x)));td.append(ul)}else{td.textContent='—';td.classList.add('is-empty')}
  body.append(tr)}
 t.append(thead,body);wrap.append(t);
 if(!rows.length)wrap.append(E('p','Nessuna riga in questo filtro.','muted crm-import-none'));
 if(rows.length>500)wrap.append(E('p','Mostrate le prime 500 righe di '+rows.length+': il riepilogo e l’importazione valgono per tutte.','muted crm-import-none'));
 return wrap;
}
// Column mapping: one select per field, filled with the file headers; a change rebuilds the preview.
function mapper(p,onChange){
 const det=E('details',undefined,'crm-import-map'),sum=E('summary','Colonne del file ('+Object.keys(p.columns).length+' riconosciute) · modifica');det.append(sum);
 det.append(E('p','Scegli quale colonna del file riempie ogni campo. «Non usare» lascia il campo vuoto.','muted'));
 const grid=E('div',undefined,'crm-import-map-grid');
 for(const [f,label] of Object.entries(C().FIELD_LABEL)){
  const id='crm-storico-map-'+f,lab=E('label',label);lab.htmlFor=id;const sel=E('select');sel.id=id;
  sel.append(new Option('— Non usare —',''));for(const h of p.headers)if(h)sel.append(new Option(h,h));
  sel.value=p.columns[f]||'';sel.addEventListener('change',()=>onChange(f,sel.value));
  const box=E('div',undefined,'crm-import-map-field');box.append(lab,sel);grid.append(box);
 }
 det.append(grid);return det;
}
function preview(parsed,ctx,fileName){
 const a=app(),dlg=E('dialog',undefined,'crm-import crm-import-storico');dlg.setAttribute('aria-labelledby','crm-storico-title');
 const h=E('h2','Anteprima importazione · storico chiamate e riunioni');h.id='crm-storico-title';h.tabIndex=-1;
 const lead=E('p',fileName+' · '+n1(parsed.rows.length,'riga','righe')+'. Niente è stato ancora scritto nel CRM.','muted');
 const sum=E('div',undefined,'crm-import-sum'),info=E('div'),filters=E('div',undefined,'crm-import-filters'),list=E('div'),progress=E('p','','crm-import-progress');
 progress.setAttribute('role','status');progress.setAttribute('aria-live','polite');
 const bar=E('progress');bar.className='crm-import-bar-progress';bar.hidden=true;
 const reportBox=E('div',undefined,'crm-import-report');reportBox.hidden=true;
 const actions=E('div',undefined,'actions');
 let edit={},p=null,filter='all',stop=false,writing=false;
 const close=()=>{dlg.close();dlg.remove()};
 const cancel=B('Annulla',()=>{if(writing){stop=true;cancel.disabled=true;cancel.textContent='Mi fermo dopo questo gruppo…';return}close()});
 const go=B('Importa',()=>write(),'primary');
 actions.append(go,cancel);
 function render(){
  p=C().plan(parsed,ctx,{columns:edit,now:Date.now()});
  sum.replaceChildren();info.replaceChildren();filters.replaceChildren();list.replaceChildren();
  info.append(mapper(p,(f,v)=>{edit={...edit,[f]:v};render();info.querySelector('details').open=true;info.querySelector('#crm-storico-map-'+f)?.focus()}));
  if(p.fatal){sum.append(E('p',p.fatal,'crm-import-fatal'));go.disabled=true;go.textContent='Niente da importare';info.querySelector('details').open=true;return}
  const n=p.counts,ok=n.create-n.warn;
  const chips=[['all','Tutte',p.rows.length],['create','Da creare',n.create],['warn','Con avvisi',n.warn],['dup','Duplicati',n.dup],['error','Saltate',n.error]];
  const line=E('p');line.append(E('strong',n1(n.create,'interazione da creare','interazioni da creare')),document.createTextNode(' ('+ok+' pronte, '+n.warn+' con avvisi) · '+n1(n.dup,'duplicato saltato','duplicati saltati')+' · '+n1(n.error,'riga saltata','righe saltate')));
  sum.append(line);
  if(ctx.partial)sum.append(E('p','Il CRM ha più di 20.000 interazioni: il controllo dei duplicati guarda le più recenti 20.000.','muted'));
  info.append(E('p','Aziende, contatti e trattative si collegano solo se esistono già nel CRM (contatto per email, poi per nome; maiuscole e accenti non contano): l’importazione non ne crea di nuovi. Una riga senza nessun collegamento viene saltata. Durata, esito e «assegnata a» finiscono nel testo dell’interazione. Date senza ora: alle 9:00.','muted'));
  for(const [k,label,count] of chips){const b=B(label+' · '+count,()=>{filter=k;render()},'crm-import-chip');b.setAttribute('aria-pressed',String(filter===k));filters.append(b)}
  list.append(table(p,filter));
  go.disabled=!n.create||writing;go.textContent=n.create?'Importa '+n1(n.create,'interazione','interazioni'):'Niente da importare';
 }
 async function write(){
  const rows=p.rows.filter(r=>r.status==='create');if(!rows.length)return;
  const n=p.counts;
  const msg='Creare '+n1(rows.length,'interazione','interazioni')+' nel CRM?\n'+(n.warn?n1(n.warn,'riga ha','righe hanno')+' avvisi (vedi anteprima).\n':'')+(n.dup?n1(n.dup,'duplicato viene saltato','duplicati vengono saltati')+'.\n':'')+(n.error?n1(n.error,'riga viene saltata','righe vengono saltate')+'.\n':'')+'Aziende e contatti non trovati non vengono creati.';
  if(!window.confirm(msg))return;
  writing=true;stop=false;const results={};let done=0,failed=0;
  dlg.querySelectorAll('.crm-import-map select,.crm-import-chip').forEach(x=>x.disabled=true);
  go.disabled=true;cancel.textContent='Ferma';bar.hidden=false;bar.max=rows.length;bar.value=0;
  const step=()=>{bar.value=done+failed;progress.textContent='Importate '+done+' di '+rows.length+'…'+(failed?' Non riuscite: '+failed+'.':'')};
  await run('Importazione storico in corso…',async()=>{step();
   // A few creates at a time: the server checks each one as when a person records it by hand.
   for(let i=0;i<rows.length&&!stop;i+=BATCH){
    await Promise.all(rows.slice(i,i+BATCH).map(async r=>{try{await post(r.data);results[r.line]={ok:true};done++}catch(e){results[r.line]={error:e.message||String(e)};failed++}}));
    step();if(done%25<BATCH)a.notice('Importate '+done+' di '+rows.length+'…');
   }
  });
  writing=false;
  const rep=C().report(p,results);
  go.textContent='Importazione eseguita';cancel.disabled=false;cancel.textContent='Chiudi';
  progress.textContent=(stop?'Importazione interrotta. ':'')+'Create '+n1(rep.created,'interazione','interazioni')+' di '+rows.length+'.';
  reportBox.hidden=false;reportBox.replaceChildren(E('h3','Resoconto'));
  const ul=E('ul');ul.append(E('li','Create: '+rep.created));
  if(rep.byReason.dup)ul.append(E('li','Duplicati saltati: '+rep.byReason.dup));
  if(rep.byReason.error)ul.append(E('li','Saltate (data non leggibile o nessun collegamento): '+rep.byReason.error));
  if(rep.byReason.failed)ul.append(E('li','Rifiutate dal CRM: '+rep.byReason.failed+' — '+rep.skipped.filter(s=>/^errore del CRM/.test(s.reason)).slice(0,3).map(s=>'riga '+s.line+': '+s.reason.replace(/^errore del CRM: /,'')).join(' · ')));
  if(rep.byReason.stopped)ul.append(E('li','Non inviate (interrotta): '+rep.byReason.stopped));
  reportBox.append(ul);
  if(rep.skipped.length)reportBox.append(B('Scarica righe saltate (CSV) · '+rep.skipped.length,()=>download('storico-righe-saltate-'+new Date().toISOString().slice(0,10)+'.csv',C().skippedCsv(rep,parsed.headers))));
  else reportBox.append(E('p','Nessuna riga saltata.','muted'));
  reportBox.querySelector('h3').scrollIntoView?.({block:'nearest'});
  await a.refresh(false);
  a.notice('Storico importato: '+n1(rep.created,'interazione creata','interazioni create')+(rep.skipped.length?', '+n1(rep.skipped.length,'riga saltata','righe saltate'):'')+'.');
  if(rep.byReason.failed)a.error('Alcune righe sono state rifiutate dal CRM: scarica il CSV delle righe saltate per i motivi.');
 }
 dlg.append(h,lead,sum,info,filters,list,bar,progress,reportBox,actions);
 dlg.addEventListener('close',()=>dlg.remove());
 // Esc does not hide the dialog while rows are being written: the progress stays in view.
 dlg.addEventListener('cancel',e=>{if(writing||a.state.busy)e.preventDefault()});
 render();
 document.body.append(dlg);dlg.showModal();h.focus();dlg.scrollTop=0;
}
window.RadixCrmImportStorico={
 importFile,
 // «Importa storico» in the heading row of the interactions list.
 section(section){
  if(!app()?.writable('interactions')||!C()||!window.RadixCrmCsv)return;
  const head=section.querySelector(':scope>.row')||section,bar=E('div',undefined,'actions crm-tools crm-import-bar');
  const input=E('input');input.type='file';input.accept=window.RadixCrmCsv.ACCEPT;input.hidden=true;input.addEventListener('change',()=>{const f=input.files[0];input.value='';importFile(f)});
  bar.append(Object.assign(B('Importa storico (CSV o Excel)',()=>input.click()),{title:'Chiamate, riunioni, email e note da Salesforce, HubSpot, Pipedrive o Excel: la prima riga con i nomi delle colonne'}),input);head.append(bar);
 }
};
})();
