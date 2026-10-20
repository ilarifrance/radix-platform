'use strict';
/* CSV import of opportunities and tasks, on top of sales.js (window.RadixSalesApp) and
   crm-import-deals-core.js. Reads the CRM, shows a preview table with the problems of each row, and
   writes nothing before the confirmation; then one /api/sales create per row, with a progress line. */
(()=>{
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n};
const B=(text,fn,cls)=>{const b=E('button',text,cls);b.type='button';b.addEventListener('click',fn);return b};
const app=()=>window.RadixSalesApp,C=()=>window.RadixCrmImportDealsCore;
const NAMES={opportunities:['trattativa','trattative'],tasks:['attività','attività']};
const plural=(kind,n)=>n+' '+NAMES[kind][n===1?0:1];
const euro=c=>c==null?'—':new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(c/100);
const when=t=>t?new Intl.DateTimeFormat('it-IT',{dateStyle:'short',...(String(t).length>10?{timeStyle:'short'}:{})}).format(new Date(String(t).length>10?t:t+'T12:00:00')):'—';
const STATUS={todo:'Da fare',doing:'In corso',done:'Fatta'},PRIORITY={low:'Bassa',normal:'Normale',high:'Alta',urgent:'Urgente'};
const OUTCOME={create:'Da creare',dup:'Già presente',error:'Non importabile'};
const post=(entity,data)=>app().api(entity,{body:{workspace:app().state.workspace,entity,action:'create',data}});
// Every row of an entity (100 per page, at most 5000): the matching must not depend on loaded pages.
async function pages(entity){const all=[];let offset=0;for(let i=0;i<50;i++){const r=(await app().api(entity,{offset})).rows||[];all.push(...r);if(r.length<100)break;offset+=r.length}return all}
async function context(kind){
 const [companies,contacts,opportunities,processes,stages,members,tasks]=await Promise.all([pages('companies'),pages('contacts'),pages('opportunities'),pages('processes'),pages('stages'),pages('members').catch(()=>[]),kind==='tasks'?pages('tasks'):[]]);
 return {companies,contacts,opportunities,processes,stages,members,tasks};
}
async function run(label,fn){
 const a=app();if(a.state.busy)return false;a.lock(true);a.error('');a.notice(label);let ok=false;
 try{await fn();ok=true}catch(e){a.error(e.message||String(e));a.notice('Operazione non completata.')}
 finally{a.lock(false)}
 return ok;
}
const COLS={
 opportunities:[['Trattativa',v=>v.title],['Importo',v=>euro(v.amount)],['Fase',v=>v.stage],['Chiusura prevista',v=>when(v.close)],['Azienda',v=>v.company||'—'],['Contatto',v=>v.contact||'—'],['Note',v=>v.notes||'—']],
 tasks:[['Attività',v=>v.title],['Scadenza',v=>when(v.due)],['Stato',v=>STATUS[v.status]],['Priorità',v=>PRIORITY[v.priority]],['Collegata a',v=>v.link||'—']]
};
function table(kind,p){
 const wrap=E('div',undefined,'crm-import-scroll'),t=E('table',undefined,'crm-import-table'),head=E('tr');
 for(const h of ['Riga',...COLS[kind].map(c=>c[0]),'Esito','Problemi'])head.append(E('th',h));
 const thead=E('thead');thead.append(head);const body=E('tbody');
 for(const r of p.rows){const tr=E('tr',undefined,'is-'+r.status);
  // data-label: on a phone each row becomes a card, the column names go before the values.
  const cell=(label,text,cls)=>{const td=E('td',text,cls);td.dataset.label=label;tr.append(td);return td};
  cell('Riga',r.line);for(const [label,f] of COLS[kind])cell(label,f(r.view));
  cell('Esito',OUTCOME[r.status],'crm-import-outcome');const td=cell('Problemi');if(r.problems.length){const ul=E('ul');r.problems.forEach(x=>ul.append(E('li',x)));td.append(ul)}else{td.textContent='—';td.classList.add('is-empty')}body.append(tr)}
 t.append(thead,body);wrap.append(t);return wrap;
}
async function importCsv(kind,file){
 const a=app();if(!file)return;if(file.size>2e6){a.error('File troppo grande: massimo 2 MB.');return}
 let parsed;try{parsed=window.RadixCrmCsv.parse(await file.text())}catch(e){a.error(e.message);return}
 if(!parsed.rows.length){a.error('Il file non ha righe da importare.');return}
 let p;
 if(!await run('Leggo il CRM per il confronto…',async()=>{p=C().plan(kind,parsed,await context(kind),{now:Date.now()})}))return;
 if(p.fatal){a.error(p.fatal);a.notice('Niente importato.');return}
 a.notice('Anteprima pronta: niente è stato ancora scritto.');
 preview(kind,p,file.name);
}
function preview(kind,p,fileName){
 const a=app(),dlg=E('dialog',undefined,'crm-import');dlg.setAttribute('aria-labelledby','crm-import-title');
 const n=p.counts;
 const h=E('h2','Anteprima importazione · '+(kind==='opportunities'?'trattative':'attività'));h.id='crm-import-title';h.tabIndex=-1;dlg.append(h);
 dlg.append(E('p',fileName+' · '+p.rows.length+(p.rows.length===1?' riga':' righe')+'. Niente è stato ancora scritto nel CRM.','muted'));
 const sum=E('p',undefined,'crm-import-sum');
 sum.append(E('strong',plural(kind,n.create)+' da creare'),document.createTextNode(' · '+n.dup+(n.dup===1?' già presente (saltata)':' già presenti (saltate)')+' · '+n.error+(n.error===1?' non importabile':' non importabili')));
 dlg.append(sum);
 dlg.append(E('p','Colonne riconosciute: '+Object.values(p.columns).map(h=>'«'+h+'»').join(', ')+'.','muted'));
 if(kind==='opportunities')dlg.append(E('p','Aziende e contatti si collegano solo se esistono già nel CRM (per nome o email): l’importazione non ne crea di nuovi. La colonna Note diventa una nota sulla trattativa.','muted'));
 else dlg.append(E('p','Trattative, aziende e contatti si collegano solo se esistono già nel CRM: l’importazione non ne crea di nuovi.','muted'));
 dlg.append(table(kind,p));
 const progress=E('p','','crm-import-progress');progress.setAttribute('role','status');
 const actions=E('div',undefined,'actions');
 const close=()=>{dlg.close();dlg.remove()};
 const cancel=B('Annulla',close),go=B(n.create?'Importa '+plural(kind,n.create):'Niente da importare',()=>write(kind,p,{dlg,progress,go,cancel}),'primary');go.disabled=!n.create;
 actions.append(go,cancel);
 dlg.append(progress,actions);dlg.addEventListener('close',()=>dlg.remove());
 // Esc does not hide the dialog while rows are being written: the progress line stays in view.
 dlg.addEventListener('cancel',e=>{if(a.state.busy)e.preventDefault()});
 document.body.append(dlg);dlg.showModal();h.focus();dlg.scrollTop=0;
}
async function write(kind,p,{progress,go,cancel}){
 const a=app(),rows=p.rows.filter(r=>r.status==='create');
 const msg='Creare '+plural(kind,rows.length)+' nel CRM?\n'+(p.counts.dup?(p.counts.dup===1?'1 riga già presente viene saltata. ':p.counts.dup+' righe già presenti vengono saltate. '):'')+(p.counts.error?(p.counts.error===1?'1 riga non importabile viene scartata. ':p.counts.error+' righe non importabili vengono scartate. '):'')+'\nAziende e contatti non trovati non vengono creati.';
 if(!window.confirm(msg))return;
 let done=0;const failed=[],notes=[];
 const step=()=>{progress.textContent='Importate '+done+' di '+rows.length+'…'+(failed.length?' Non riuscite: '+failed.length+'.':'')};
 await run('Importazione in corso…',async()=>{step();
  for(const r of rows){
   try{const res=await post(kind,r.data);done++;
    // «Note» of an opportunity: a note interaction on it; if that fails the opportunity stays.
    const created=res.rows?.[0];if(kind==='opportunities'&&r.note&&created?.id)try{await post('interactions',C().noteFor(created,r.note))}catch(e){notes.push('riga '+r.line+': '+e.message)}
   }catch(e){failed.push('riga '+r.line+' «'+r.data.title+'»: '+e.message)}
   step();if(done%10===0)a.notice('Importate '+done+' di '+rows.length+'…')}
 });
 go.disabled=true;go.textContent='Importazione eseguita';cancel.textContent='Chiudi';
 progress.textContent='Importate '+done+' di '+rows.length+'.'+(failed.length?' Non riuscite: '+failed.length+' — '+failed.slice(0,5).join(' · ')+(failed.length>5?' …':''):'')+(notes.length?' Note non salvate: '+notes.slice(0,3).join(' · '):'');
 await a.refresh(false);
 a.notice('Importate '+done+' di '+plural(kind,rows.length)+'.'+(failed.length?' Non riuscite: '+failed.length+'.':''));
 if(failed.length)a.error('Righe non importate: '+failed.slice(0,5).join(' · ')+(failed.length>5?' …':''));
}
window.RadixCrmImportDeals={
 importCsv,
 // «Importa CSV» in the heading row of the opportunities and tasks lists.
 section(entity,section){
  if(!['opportunities','tasks'].includes(entity)||!app()?.writable(entity)||!C()||!window.RadixCrmCsv)return;
  const head=section.querySelector(':scope>.row')||section,bar=E('div',undefined,'actions crm-tools crm-import-bar');
  const input=E('input');input.type='file';input.accept='.csv,text/csv';input.hidden=true;input.addEventListener('change',()=>{const f=input.files[0];input.value='';importCsv(entity,f)});
  bar.append(B('Importa CSV',()=>input.click()),input);head.append(bar);
 }
};
})();
