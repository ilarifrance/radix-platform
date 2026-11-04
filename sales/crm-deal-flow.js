'use strict';
/* Opportunità: scheda di dettaglio a lato (senza cambiare pagina) e domande al cambio fase.
   - RadixDealFlow.openDetail(ctx): pannello laterale con i dati della trattativa, azienda, contatto, attività e
     interazioni (una lettura Customer360), con «Cambia fase», «Registra attività» e «Nuovo promemoria».
   - RadixDealFlow.moveDeal(ctx): dialogo del cambio fase — «Hai svolto attività?», prossimi passi consigliati dal
     playbook della nuova fase e promemoria di ricontatto (giorni a scelta) — poi sposta e crea solo ciò che la persona
     ha confermato. Nessuna AI, nessun invio: solo i comandi normali di /api/sales (sales/crm-deal-flow-core.js).
   ctx: {workspace, deal, stages, canWrite, onDone(msg), say(msg)}. */
(function(){
const C=window.RadixDealFlowCore;if(!C)return;
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n};
const money=c=>Number.isFinite(Number(c))&&c!==null&&c!==''?'€ '+new Intl.NumberFormat('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(c)/100):'—';
const day=v=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(v||''));return m?m[3]+'/'+m[2]+'/'+m[1]:'—'};
async function post(ws,entity,action,data){
 const r=await fetch('/api/sales',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json','x-radix-sales':'1'},body:JSON.stringify({workspace:ws,entity,action,data})});
 let d={};try{d=await r.json()}catch{d={}}
 if(!r.ok){const m=typeof d.error==='string'?d.error:d.error&&d.error.message;throw Object.assign(new Error(m||('Errore ('+r.status+')')),{status:r.status})}
 return d}
async function related(ws,deal){
 const p=new URLSearchParams({entity:'customer360',subject:'opportunities',id:deal.id,workspace:ws});
 const r=await fetch('/api/sales?'+p,{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw new Error('Dettagli non disponibili ('+r.status+').');
 const d=await r.json(),list=Array.isArray(d&&d.rows)?d.rows.filter(x=>x&&x.record&&typeof x.entity==='string'):[];
 const of=e=>list.filter(x=>x.entity===e).map(x=>x.record);
 return {company:of('companies').find(c=>c.id===deal.company_id)||null,contact:of('contacts').find(c=>c.id===deal.contact_id)||null,
  tasks:of('tasks').filter(t=>t.opportunity_id===deal.id),interactions:of('interactions').filter(i=>i.opportunity_id===deal.id)}}

/* ---------- Dialogo del cambio fase ---------- */
function ask(ctx,stage,tasks){
 return new Promise(resolve=>{
  const deal=ctx.deal,dlg=E('dialog',undefined,'df-dialog');let result=null;
  const form=E('form');form.method='dialog';
  form.append(E('h2','Sposta «'+(deal.title||'Opportunità')+'» in «'+(stage.title||'Fase')+'»'));
  if(stage.task_title)form.append(E('p','La fase crea già da sola l’attività «'+stage.task_title+'».','df-note'));
  // 1. Attività svolte
  const s1=E('section',undefined,'df-sec');s1.append(E('h3','Hai svolto delle attività su questa opportunità?'));
  const kind=E('select');kind.setAttribute('aria-label','Tipo di attività svolta');
  const none=E('option','No, nessuna da registrare');none.value='';kind.append(none);C.KINDS.forEach(([v,t])=>{const o=E('option','Sì · '+t);o.value=v;kind.append(o)});
  const body=E('textarea');body.rows=3;body.maxLength=2000;body.placeholder='Cosa è successo? (facoltativo)';body.hidden=true;body.setAttribute('aria-label','Note sull’attività svolta');
  kind.onchange=()=>{body.hidden=!kind.value;if(kind.value)body.focus()};
  s1.append(kind,body);form.append(s1);
  // 2. Prossimi passi
  const s2=E('section',undefined,'df-sec');s2.append(E('h3','Prossimi passi consigliati per questa fase'));
  const rows=[];
  const addRow=(title,label,days,checked,custom)=>{
   const row=E('div',undefined,'df-row'),cb=E('input');cb.type='checkbox';cb.checked=!!checked;
   const lab=E('label');lab.append(cb);
   let titleInput=null;
   if(custom){titleInput=E('input');titleInput.type='text';titleInput.maxLength=160;titleInput.placeholder='Altra attività…';titleInput.setAttribute('aria-label','Titolo della nuova attività');lab.append(' ',titleInput);titleInput.oninput=()=>{cb.checked=!!titleInput.value.trim()}}
   else lab.append(' '+label);
   const wrap=E('span',undefined,'df-days');wrap.append(' tra ');
   const n=E('input');n.type='number';n.min='0';n.max='365';n.value=String(days);n.setAttribute('aria-label','Giorni');wrap.append(n,' giorni');
   row.append(lab,wrap);s2.append(row);rows.push({cb,n,title,titleInput});};
  const rc=C.recontact(stage);
  addRow('Ricontattare «'+(deal.title||'Opportunità')+'»','Promemoria di ricontatto',rc.days,rc.checked);
  for(const s of C.suggestions(stage,deal,tasks,window.RadixCrmPlaybook,Date.now()))addRow(s.title,s.label,s.days,true);
  addRow('','',7,false,true);
  s2.append(E('p','Le attività finiscono in «Attività» con scadenza alle 9:00 del giorno indicato; puoi cambiare i giorni o togliere la spunta.','df-note'));
  form.append(s2);
  const err=E('p',undefined,'df-err');err.hidden=true;form.append(err);
  const bar=E('div',undefined,'df-bar'),ok=E('button','Conferma spostamento','df-ok');ok.type='submit';ok.value='ok';
  const no=E('button','Annulla');no.type='button';no.onclick=()=>dlg.close();bar.append(ok,no);form.append(bar);
  form.addEventListener('submit',e=>{e.preventDefault();
   const picked=rows.filter(r=>r.cb.checked&&(r.titleInput?r.titleInput.value.trim():r.title));
   result={activity:kind.value?{kind:kind.value,body:body.value}:null,tasks:picked.map(r=>({title:r.titleInput?r.titleInput.value:r.title,days:r.n.value}))};dlg.close()});
  dlg.addEventListener('close',()=>{dlg.remove();resolve(result)});
  dlg.append(form);document.body.append(dlg);dlg.showModal();ok.focus();
 })}

async function moveDeal(ctx){
 const deal=ctx.deal,stage=ctx.stage;
 if(!ctx.canWrite||!deal||!stage||stage.id===deal.stage_id)return false;
 if(!globalThis.crypto||!crypto.randomUUID){(ctx.say||alert)('Cambio fase non disponibile: apri la pagina in HTTPS.');return false}
 let tasks=[];try{tasks=(await related(ctx.workspace,deal)).tasks}catch{tasks=[]}
 const choice=await ask(ctx,stage,tasks);if(!choice)return false;
 let moved;
 try{moved=await post(ctx.workspace,'opportunities','transition',{id:deal.id,version:deal.version,stage_id:stage.id,key:crypto.randomUUID()})}
 catch(e){(ctx.say||alert)(e.status===409?'Conflitto: l’opportunità è cambiata nel frattempo. Aggiorna e riprova.':(e.message||'Spostamento non riuscito.'));if(ctx.onDone)await ctx.onDone();return false}
 const row=moved&&moved.rows&&moved.rows[0],NP=window.RadixPipelineMove;
 if(NP&&NP.nextProbability){const p=NP.nextProbability(deal,ctx.stages,stage);if(p!=null&&row&&row.version!=null){try{await post(ctx.workspace,'opportunities','update',{id:deal.id,version:row.version,probability:p})}catch{}}}
 const pay=C.payloads(deal,choice,{now:Date.now(),assignee:ctx.assignee}),failed=[];let made=0;
 if(pay.interaction){try{await post(ctx.workspace,'interactions','create',pay.interaction);made++}catch(e){failed.push(e.message)}}
 for(const t of pay.tasks){try{await post(ctx.workspace,'tasks','create',t);made++}catch(e){failed.push(e.message)}}
 const msg='Spostata in «'+stage.title+'»'+(made?' · '+made+(made===1?' voce registrata.':' voci registrate.'):'.')+(failed.length?' Non registrate: '+failed.length+' ('+failed[0]+').':'');
 if(ctx.onDone)await ctx.onDone(msg);else if(ctx.say)ctx.say(msg);
 return true}

/* ---------- Scheda laterale ---------- */
let open=null;
function closeDetail(){if(open){open.remove();open=null;document.removeEventListener('keydown',onKey)}}
function onKey(e){if(e.key==='Escape')closeDetail()}
function field(label,value){const d=E('div',undefined,'df-f');d.append(E('span',label,'df-l'),E('span',value===null||value===undefined||value===''?'—':value,'df-v'));return d}
function link(href,text){const a=E('a',text);a.href=href;return a}
function personBlock(title,rec,fields){const s=E('section',undefined,'df-sec');s.append(E('h3',title));
 if(!rec){s.append(E('p','Non collegato.','df-note'));return s}
 s.append(field('Nome',rec.name));for(const [l,k,mk] of fields){const v=rec[k];if(!v){s.append(field(l,'—'));continue}const d=E('div',undefined,'df-f');d.append(E('span',l,'df-l'));d.append(mk?link(mk+v,v):E('span',v,'df-v'));s.append(d)}return s}
function openDetail(ctx){
 closeDetail();const deal=ctx.deal;if(!deal)return;
 const back=E('div',undefined,'df-back');back.onclick=closeDetail;
 const aside=E('aside',undefined,'df-drawer');aside.setAttribute('role','dialog');aside.setAttribute('aria-label','Dettaglio opportunità');
 const wrap=E('div');wrap.append(back,aside);document.body.append(wrap);open=wrap;document.addEventListener('keydown',onKey);
 const stageOf=id=>(ctx.stages||[]).find(s=>s.id===id);
 const head=E('header',undefined,'df-head');const close=E('button','Chiudi','df-close');close.type='button';close.onclick=closeDetail;head.append(E('h2',deal.title||'Opportunità'),close);aside.append(head);
 const open1=!deal.outcome||deal.outcome==='open';
 const st=stageOf(deal.stage_id),prob=deal.probability!=null&&deal.probability!==''?deal.probability:(st&&st.probability!=null?st.probability:null);
 const main=E('section',undefined,'df-sec');
 main.append(field('Fase',st?st.title:'—'),field('Valore',money(deal.amount_cents)),field('Probabilità',prob==null?'—':prob+'%'),field('Chiusura prevista',day(deal.expected_close)),field('Esito',deal.outcome==='won'?'Vinta':deal.outcome==='lost'?'Persa'+(deal.lost_reason?' · '+deal.lost_reason:''):'Aperta'));
 aside.append(main);
 if(ctx.canWrite&&open1){
  const sec=E('section',undefined,'df-sec');sec.append(E('h3','Cambia fase'));
  const targets=(ctx.stages||[]).filter(s=>s.id!==deal.stage_id&&(!deal.process_id||s.process_id===deal.process_id)).sort((a,b)=>(a.position||0)-(b.position||0));
  const sel=E('select');sel.setAttribute('aria-label','Nuova fase');const o0=E('option','Scegli la fase');o0.value='';sel.append(o0);targets.forEach(s=>{const o=E('option',s.title);o.value=s.id;sel.append(o)});
  const go=E('button','Continua…','df-ok');go.type='button';go.disabled=true;sel.onchange=()=>{go.disabled=!sel.value};
  go.onclick=async()=>{const stage=targets.find(s=>s.id===sel.value);if(!stage)return;go.disabled=true;const done=await moveDeal({...ctx,stage});if(done)closeDetail();else go.disabled=!sel.value};
  sec.append(sel,' ',go);aside.append(sec);
 }
 const body=E('div');body.append(E('p','Caricamento dei dettagli…','df-note'));aside.append(body);
 related(ctx.workspace,deal).then(r=>{
  if(open!==wrap)return;body.replaceChildren();
  body.append(personBlock('Azienda',r.company,[['Sito','website'],['Email','email','mailto:'],['Telefono','phone','tel:'],['Città','city']]));
  body.append(personBlock('Contatto',r.contact,[['Ruolo','role'],['Email','email','mailto:'],['Telefono','phone','tel:']]));
  const ts=E('section',undefined,'df-sec');ts.append(E('h3','Attività'));
  const openTasks=r.tasks.filter(t=>t.status!=='done').sort((a,b)=>String(a.due_at||'9').localeCompare(String(b.due_at||'9')));
  if(!openTasks.length)ts.append(E('p','Nessuna attività aperta.','df-note'));
  openTasks.slice(0,8).forEach(t=>ts.append(E('p',(t.title||'Attività')+' · '+(t.due_at?day(t.due_at):'senza scadenza'),'df-item')));
  body.append(ts);
  const is=E('section',undefined,'df-sec');is.append(E('h3','Interazioni recenti'));
  const ints=r.interactions.sort((a,b)=>String(b.occurred_at||'').localeCompare(String(a.occurred_at||'')));
  if(!ints.length)is.append(E('p','Nessuna interazione registrata.','df-note'));
  ints.slice(0,6).forEach(i=>{const p=E('p',undefined,'df-item');p.append(E('b',(i.title||C.kindLabel(i.kind))),' · '+day(i.occurred_at));if(i.body)p.append(E('br'),i.body.length>240?i.body.slice(0,240)+'…':i.body);is.append(p)});
  body.append(is);
  if(ctx.canWrite&&open1){
   const sec=E('section',undefined,'df-sec');sec.append(E('h3','Aggiungi'));
   const bar=E('div',undefined,'df-bar');
   const act=E('button','Registra attività svolta');act.type='button';act.onclick=()=>quickAdd(ctx,'activity',()=>openDetail(ctx));
   const rem=E('button','Nuovo promemoria');rem.type='button';rem.onclick=()=>quickAdd(ctx,'task',()=>openDetail(ctx));
   bar.append(act,rem);sec.append(bar);body.append(sec);
  }
  const more=E('p',undefined,'df-note');more.append(link('/radix-sales.html?ws='+encodeURIComponent(ctx.workspace)+'#opportunities','Modifica campi e altre azioni nel CRM'));body.append(more);
 }).catch(e=>{if(open===wrap){body.replaceChildren(E('p',e.message||'Dettagli non disponibili.','df-err'))}});
 close.focus();
}
// One activity done, or one reminder, typed in a small dialog.
function quickAdd(ctx,what,again){
 const deal=ctx.deal,dlg=E('dialog',undefined,'df-dialog'),form=E('form');form.method='dialog';
 form.append(E('h2',what==='activity'?'Registra attività svolta':'Nuovo promemoria'));
 let kind=null,body=null,title=null,days=null;
 if(what==='activity'){kind=E('select');kind.setAttribute('aria-label','Tipo');C.KINDS.forEach(([v,t])=>{const o=E('option',t);o.value=v;kind.append(o)});body=E('textarea');body.rows=3;body.maxLength=2000;body.placeholder='Cosa è successo?';body.setAttribute('aria-label','Note');form.append(kind,body)}
 else{title=E('input');title.type='text';title.maxLength=160;title.placeholder='Es. Richiamare per la risposta';title.setAttribute('aria-label','Titolo');days=E('input');days.type='number';days.min='0';days.max='365';days.value='3';days.setAttribute('aria-label','Giorni');const w=E('p');w.append('Tra ',days,' giorni');form.append(title,w)}
 const err=E('p',undefined,'df-err');err.hidden=true;form.append(err);
 const bar=E('div',undefined,'df-bar'),ok=E('button','Salva','df-ok');ok.type='submit';const no=E('button','Annulla');no.type='button';no.onclick=()=>dlg.close();bar.append(ok,no);form.append(bar);
 form.addEventListener('submit',async e=>{e.preventDefault();ok.disabled=true;err.hidden=true;
  const choice=what==='activity'?{activity:{kind:kind.value,body:body.value},tasks:[]}:{activity:null,tasks:[{title:title.value,days:days.value}]};
  const pay=C.payloads(deal,choice,{now:Date.now(),assignee:ctx.assignee});
  try{if(pay.interaction)await post(ctx.workspace,'interactions','create',pay.interaction);else if(pay.tasks[0])await post(ctx.workspace,'tasks','create',pay.tasks[0]);else{err.textContent='Scrivi un titolo.';err.hidden=false;ok.disabled=false;return}
   dlg.close();if(ctx.onDone)await ctx.onDone('Salvato.');again()}
  catch(x){err.textContent=x.message||'Non salvato.';err.hidden=false;ok.disabled=false}});
 dlg.addEventListener('close',()=>dlg.remove());dlg.append(form);document.body.append(dlg);dlg.showModal();(title||body).focus();
}
window.RadixDealFlow={moveDeal,openDetail,closeDetail};
})();
