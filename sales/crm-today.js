'use strict';
/* «Oggi»: the CRM day view, designed for the phone first (radix-sales.html#today, also the start page
   of the app added to the Home screen, see manifest.webmanifest).
   - Attività scadute e in scadenza oggi, from the server's own due filters (overdue + upcoming), mine first.
     Each one: the contact's phone as a tel: link, «Registra chiamata», «Fatto».
   - «Fatto» sends the same tasks update as the task card (id + version + status), after a confirmation.
   - «Registra chiamata» opens a small sheet: esito + nota → one interactions create (kind call).
     With «Richiamare» the sheet then proposes a task for tomorrow at 9:00, created only on «Crea attività».
   - Agenda di oggi: the calendar's own events (calendar-view.js, RadixCrmCalendar), not a second copy.
   Rules in crm-today-core.js; writes go through RadixSalesApp.api (sales.js), never on their own. AI is not involved. */
(()=>{
const content=document.getElementById('content'),nav=document.getElementById('navigation'),core=window.RadixCrmTodayCore;if(!content||!nav||!core)return;
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n};
const B=(text,fn,cls)=>{const b=E('button',text,cls);b.type='button';b.addEventListener('click',fn);return b};
const app=()=>window.RadixSalesApp;
const hm=d=>d.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
// Tasks of the two due filters, read once per workspace; dropped after a write, on Aggiorna and on a workspace change.
let tasks=null,loading=null,flash='';

function ensureNav(){if(nav.querySelector('a[href="#today"]'))return;const a=E('a','Oggi');a.href='#today';const after=nav.querySelector('a[href="#dashboard"]');after?after.after(a):nav.prepend(a)}
function ensureSection(){let s=document.getElementById('today');if(s&&s.parentNode===content)return s;s=E('section',undefined,'panel td-section');s.id='today';const row=E('div',undefined,'row');row.append(E('h2','Oggi'));s.append(row);content.append(s);return s}

async function readTasks(){
 const a=app(),w=a?.state.workspace;if(!w)return null;
 if(tasks&&tasks.workspace===w)return tasks;if(loading&&loading.workspace===w)return loading.promise;
 const p=Promise.all([a.api('tasks',{due:'overdue'}),a.api('tasks',{due:'upcoming'})])
  .then(([late,next])=>({workspace:w,rows:[...late.rows,...next.rows],partial:late.rows.length===100,error:''}))
  .catch(e=>({workspace:w,rows:[],partial:false,error:e.message||String(e)}))
  .then(r=>{if(app()?.state.workspace===w){tasks=r;}if(loading?.promise===p)loading=null;return r});
 loading={workspace:w,promise:p};return p;
}
function drop(){tasks=null;loading=null;window.RadixCrmData?.reset()}

/* ---------- Writes (one click each, through sales.js) ---------- */
async function afterWrite(message){
 const a=app();drop();flash=message;
 await a.refresh(false);a.notice(message);later();
}
async function done(task){
 const a=app(),data=core.doneData(task);if(!a||a.state.busy||!data||!a.writable('tasks'))return;
 if(!window.confirm('Segnare «'+task.title+'» come fatta?'))return;
 a.lock(true);a.error('');a.notice('Salvataggio sul server…');let ok=false;
 try{await a.api('tasks',{body:{workspace:a.state.workspace,entity:'tasks',action:'update',data}});ok=true}
 catch(e){a.error(e.message+(e.status===409?' Conflitto: l’attività è cambiata nel frattempo, premi Aggiorna.':' Verifica con Aggiorna prima di riprovare.'));a.notice('Operazione non completata.')}
 finally{a.lock(false)}
 if(ok)await afterWrite('«'+task.title+'» segnata come fatta.');
}

let sheet=null;
function callSheet(){
 if(sheet)return sheet;
 const d=E('dialog',undefined,'td-sheet');d.id='today-call';d.setAttribute('aria-labelledby','today-call-title');
 const f=E('form');f.method='dialog';f.noValidate=true;
 const h=E('h2','Registra chiamata');h.id='today-call-title';
 const who=E('p',undefined,'td-sheet-who'),err=E('p',undefined,'notice');err.hidden=true;err.setAttribute('role','alert');
 const step1=E('div',undefined,'td-step');
 const fs=E('fieldset',undefined,'td-outcomes');fs.append(E('legend','Esito'));
 for(const [k,label] of Object.entries(core.OUTCOMES)){const l=E('label');const r=E('input');r.type='radio';r.name='outcome';r.value=k;l.append(r,E('span',label));fs.append(l)}
 const nl=E('label','Nota (facoltativa)');const note=E('textarea');note.name='note';note.rows=3;note.maxLength=3900;note.placeholder='Cosa vi siete detti, cosa serve dopo…';nl.append(note);
 const save=E('button','Salva chiamata','primary');save.type='submit';
 const cancel=B('Annulla',()=>{if(!app()?.state.busy)d.close()});
 const a1=E('div',undefined,'actions');a1.append(save,cancel);
 step1.append(fs,nl,a1,E('p','Si registra un’interazione «Telefonata» adesso, collegata all’attività. Nessuna chiamata parte da qui.','muted'));
 const step2=E('div',undefined,'td-step');step2.hidden=true;
 const ask=E('p',undefined,'td-ask');const yes=E('button','Crea attività','primary');yes.type='button';const no=B('No, grazie',()=>{if(!app()?.state.busy)d.close()});
 const a2=E('div',undefined,'actions');a2.append(yes,no);step2.append(ask,a2);
 f.append(h,who,err,step1,step2);d.append(f);document.body.append(d);
 d.addEventListener('cancel',e=>{if(app()?.state.busy)e.preventDefault()});
 sheet={d,f,who,err,step1,step2,ask,yes,note,save,ctx:null,saved:false};
 d.addEventListener('close',()=>{const s=sheet;if(s.saved){s.saved=false;afterWrite(s.message)}});
 f.addEventListener('submit',e=>{e.preventDefault();saveCall()});
 yes.addEventListener('click',()=>saveFollowUp());
 return sheet;
}
function openCall(task,tg){
 const a=app();if(!a||a.state.busy||!a.writable('interactions'))return;
 const s=callSheet();s.ctx={task,tg};s.saved=false;s.message='';s.f.reset();s.err.hidden=true;s.step1.hidden=false;s.step2.hidden=true;
 s.who.replaceChildren(E('b',tg.name||task.title));
 if(tg.tel){const t=E('a',tg.phone,'td-tel-inline');t.href=tg.tel;s.who.append(document.createTextNode(' · '),t)}
 s.who.append(E('small','Attività: '+task.title));
 s.d.showModal();s.d.querySelector('input[name="outcome"]')?.focus();
}
function sheetError(msg){sheet.err.textContent=msg||'';sheet.err.hidden=!msg}
async function saveCall(){
 const a=app(),s=sheet;if(!a||a.state.busy||!s.ctx)return;
 const outcome=s.f.querySelector('input[name="outcome"]:checked')?.value;
 const plan=core.callPlan({outcome,note:s.note.value},s.ctx.tg,Date.now());if(plan.error){sheetError(plan.error);return}
 sheetError('');a.lock(true);a.error('');a.notice('Salvataggio sul server…');let ok=false;
 try{await a.api('interactions',{body:{workspace:a.state.workspace,entity:'interactions',action:'create',data:plan.data}});ok=true}
 catch(e){sheetError(e.message+' Verifica con Aggiorna prima di riprovare.');a.notice('Operazione non completata.')}
 finally{a.lock(false)}
 if(!ok)return;
 a.notice('Chiamata registrata.');s.saved=true;s.message='Chiamata registrata: '+plan.data.title+'.';
 const follow=core.followUpPlan(s.ctx.tg,Date.now(),a.state.me);
 if(outcome==='callback'&&!follow.error&&a.writable('tasks')){
  s.follow=follow.data;s.step1.hidden=true;s.step2.hidden=false;
  s.ask.textContent='Chiamata registrata. Creare l’attività «'+follow.data.title+'» per domani alle '+hm(new Date(follow.data.due_at))+'?';
  s.yes.focus();return;
 }
 s.d.close();
}
async function saveFollowUp(){
 const a=app(),s=sheet;if(!a||a.state.busy||!s.follow)return;
 a.lock(true);a.notice('Salvataggio sul server…');let ok=false;
 try{await a.api('tasks',{body:{workspace:a.state.workspace,entity:'tasks',action:'create',data:s.follow}});ok=true}
 catch(e){sheetError('Chiamata registrata, ma l’attività non è stata creata: '+e.message)}
 finally{a.lock(false)}
 if(ok){s.message='Chiamata registrata e richiamo creato per domani.';s.follow=null;s.d.close()}
}

/* ---------- View ---------- */
function item(task,d,me,showOwner){
 const a=app(),tg=core.target(task,d.contacts,d.companies),li=E('li',undefined,'td-item'+(Date.parse(task.due_at)<Date.now()?' late':''));
 const text=E('div',undefined,'td-text');text.append(E('b',task.title));
 const due=E('small',core.dueLabel(task.due_at,Date.now()),'td-due');text.append(due);
 const who=[tg.name,tg.company&&tg.company!==tg.name?tg.company:''].filter(Boolean).join(' · ');if(who)text.append(E('small',who,'td-who'));
 if(showOwner){const m=d.members.find(x=>x.id===task.assignee_id);text.append(E('small',m?'Assegnata a '+m.name:'Non assegnata','td-owner'))}
 const acts=E('div',undefined,'td-actions');
 if(tg.tel){const t=E('a','Chiama','td-btn td-call');t.href=tg.tel;t.setAttribute('aria-label','Chiama '+(tg.name||'')+' · '+tg.phone);acts.append(t)}
 const log=B('Registra chiamata',()=>openCall(task,tg),'td-btn td-log');log.disabled=!a.writable('interactions')||!tg.linked;
 if(!tg.linked)log.title='Attività senza azienda, contatto o opportunità';
 const ok=B('Fatto',()=>done(task),'td-btn td-done');ok.disabled=!a.writable('tasks');ok.setAttribute('aria-label','Fatto: '+task.title);
 acts.append(log,ok);li.append(text,acts);return li;
}
function block(title,list,d,me,empty,cls){
 const sec=E('section',undefined,'td-block'+(cls?' '+cls:''));const h=E('div',undefined,'td-head');h.append(E('h3',title),E('span',list.length,'td-count'));sec.append(h);
 if(!list.length){sec.append(E('p',empty,'td-empty'));return sec}
 const ul=E('ul',undefined,'td-list');let others=false;
 for(const t of list){const mine=!!me&&t.assignee_id===me;
  if(me&&!mine&&!others){others=true;if(list.some(x=>x.assignee_id===me))ul.append(E('li','Di altri membri del team','td-sep'))}
  ul.append(item(t,d,me,!mine))}
 sec.append(ul);return sec;
}
function agendaBlock(d){
 const cal=window.RadixCrmCalendar;if(!cal)return null;
 const list=core.todayEvents(cal.events(d),Date.now());
 const sec=E('section',undefined,'td-block td-agenda');const h=E('div',undefined,'td-head');h.append(E('h3','Agenda di oggi'),E('span',list.length,'td-count'));sec.append(h);
 if(!list.length){sec.append(E('p','Nessuna riunione, chiamata o chiusura prevista oggi.','td-empty'));return sec}
 const ul=E('ul',undefined,'td-list');
 for(const e of list){const li=E('li');const a=E('a',undefined,'td-event '+(cal.TYPES[e.type]?.[1]||''));a.href=e.href;a.append(E('time',e.allDay?'Tutto il giorno':hm(e.start)));const x=E('span');x.append(E('em',cal.TYPES[e.type]?.[0]||''),E('b',e.title));if(e.sub)x.append(E('small',e.sub));a.append(x);li.append(a);ul.append(li)}
 sec.append(ul);const more=E('a','Apri il calendario','td-more');more.href='#calendar';sec.append(more);return sec;
}

let busy=false;
async function render(){
 ensureNav();if((location.hash||'')!=='#today'){document.getElementById('today')?.remove();return}
 const sec=ensureSection();content.querySelectorAll(':scope>section.rx-view').forEach(s=>{if(s!==sec)s.classList.remove('rx-view')});sec.classList.add('rx-view');document.documentElement.classList.add('rx-has-view');
 const [d,t]=await Promise.all([window.RadixCrmData?.load(),readTasks()]);if(!d||!t||!sec.isConnected)return;
 const a=app(),me=a.state.me||null,now=Date.now(),g=core.agenda(t.rows,now,me);
 busy=true;sec.querySelector(':scope>.td')?.remove();
 const root=E('div',undefined,'td');
 const day=new Date(now).toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'});
 const top=E('div',undefined,'td-top');top.append(E('p',day.charAt(0).toUpperCase()+day.slice(1),'td-date'));
 top.append(E('p',[g.overdue.length+(g.overdue.length===1?' scaduta':' scadute'),g.today.length+' in scadenza oggi',me?g.mine+' assegnate a te':''].filter(Boolean).join(' · '),'td-sum'));
 root.append(top);
 if(flash){const f=E('p',flash,'td-flash');f.setAttribute('role','status');root.append(f);flash=''}
 if(t.error)root.append(E('p','Attività non disponibili: '+t.error,'notice'));
 root.append(block('Scadute',g.overdue,d,me,'Nessuna attività scaduta.','late'));
 if(t.partial)root.append(E('p','Più di 100 attività scadute: qui le 100 più vecchie. L’elenco completo è in Attività.','td-note'));
 root.append(block('In scadenza oggi',g.today,d,me,'Nient’altro in scadenza oggi.'));
 const ag=agendaBlock(d);if(ag)root.append(ag);
 const all=E('a','Tutte le attività','td-more');all.href='#tasks';
 const note=E('p','Attività aperte dal server, prima le tue. «Fatto» e «Registra chiamata» salvano solo dopo il tuo tocco; nessun messaggio parte.','td-note');
 root.append(all,note);
 sec.append(root);
 if(a.state.busy)root.querySelectorAll('button').forEach(n=>{n.dataset.preDisabled=String(n.disabled);n.disabled=true});
 requestAnimationFrame(()=>{busy=false;if(!sec.isConnected)later()});
}
let q=false;const later=()=>{if(busy||q)return;q=true;setTimeout(()=>{q=false;render()},60)};
new MutationObserver(m=>{if(m.some(r=>![...r.addedNodes,...r.removedNodes].every(n=>n.nodeType===1&&/\b(pv|cx|tv|cal|td-section)\b/.test(n.className||''))))later()}).observe(content,{childList:true});
new MutationObserver(later).observe(nav,{childList:true});
document.getElementById('workspace')?.addEventListener('change',drop);
document.getElementById('refresh')?.addEventListener('click',drop);
addEventListener('hashchange',later);later();
})();
