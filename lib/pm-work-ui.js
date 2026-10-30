/* RADIX PM work views (radix-pm-concept.html): «Le mie attività», quick add, editable list, calendar, comments,
   priority, AI break-down, project health and status updates, project templates. Rules stay in lib/pm-demo.js,
   calculations in lib/pm-work.js; the page hands over its plan through window.RadixPmPage and draws the rest. */
(function(root){
'use strict';
const W=root.RadixPMWork,pm=root.RadixPM,doc=root.document;if(!W||!pm||!doc)return;
const P=()=>root.RadixPmPage;
const $=id=>doc.getElementById(id);
function el(tag,text,cls,attrs){const n=doc.createElement(tag);if(text!=null&&text!=='')n.textContent=text;if(cls)n.className=cls;if(attrs)for(const [k,v] of Object.entries(attrs))if(v!=null)n.setAttribute(k,v);return n}
function btn(text,cls,on,attrs){const b=el('button',text,cls,attrs);b.type='button';if(on)b.onclick=on;return b}
const fmt=(d,o)=>new Date(d+'T12:00:00Z').toLocaleDateString('it-IT',Object.assign({day:'numeric',month:'short',timeZone:'UTC'},o||{}));
const today=()=>W.todayIso();
function whenLabel(due){const n=W.days(today(),due);if(n<0)return n===-1?'Scaduta ieri':'Scaduta da '+(-n)+' giorni';if(n===0)return 'Oggi';if(n===1)return 'Domani';if(n<7)return fmt(due,{weekday:'short',day:'numeric',month:'short'});return fmt(due)}
const PCLS={Urgente:'p-urgent',Alta:'p-high',Media:'p-mid',Bassa:'p-low'};
function priorityPill(p){return p?el('span',p,'pill pm-prio '+PCLS[p],{title:'Priorità '+p.toLowerCase()}):null}
function statusPill(s){return el('span',s,'pill pm-st',{'data-status':s})}
function people(){const p=P();const s=p.state();const names=new Set(s?s.tasks.map(t=>t.owner):[]);(p.entries()||[]).forEach(e=>e.state&&e.state.tasks.forEach(t=>names.add(t.owner)));if(p.me())names.add(p.me());return [...names].filter(Boolean).sort((a,b)=>a.localeCompare(b,'it'))}
function ownersList(){let dl=$('pm-people');if(!dl){dl=el('datalist',null,null,{id:'pm-people'});doc.body.append(dl)}dl.replaceChildren(...people().map(n=>{const o=el('option');o.value=n;return o}));return 'pm-people'}
function act(fn,ok){const p=P();try{const r=fn();p.persist();p.render();if(ok)p.say(typeof ok==='function'?ok(r):ok);return r}catch(e){p.say(e.message);p.render();return null}}
// Completing from a list: walks the activity forward like a person would, stopping where the rules ask for a person.
function complete(state,t){if(t.status==='Completato')return pm.changeStatus(state,t.id,'In corso');if(t.approvalRequired&&!t.approved){if(t.status!=='In revisione')pm.changeStatus(state,t.id,'In revisione');throw new Error('«'+t.title+'» è In revisione: serve la tua approvazione nel dettaglio prima di completarla.')}return pm.changeStatus(state,t.id,'Completato')}
function completedSay(t,state){const next=t.recurrenceNext&&state.tasks.find(x=>x.id===t.recurrenceNext);return t.status==='Completato'?'Completata: «'+t.title+'».'+(next?' Ricorrenza: la prossima è il '+fmt(next.due)+'.':''):'Riaperta: «'+t.title+'».'}

// ---- Quick add ----
function quickContext(){const p=P(),pr=p.project();return {today:today(),people:people(),phases:pr?pr.subprojects:[],me:p.me()}}
function preview(){const box=$('quick-preview'),input=$('quick-input');if(!box||!input)return;const q=W.parseQuick(input.value,quickContext());box.replaceChildren();if(!input.value.trim()){box.append(el('span','Scrivi l’attività: data, @persona, !priorità e #fase si riconoscono da soli. Esempio: «Inviare offerta venerdì @Marco !alta».','muted'));return}
 const chip=(k,v,extra)=>{const c=el('span',null,'pm-chip '+(extra||''));c.append(el('b',k),document.createTextNode(' '+v));box.append(c)};
 const pr=P().project();chip('Attività',q.title||'—');chip('Scadenza',q.due?whenLabel(q.due)+' · '+fmt(q.due,{weekday:'short',day:'numeric',month:'short'}):'tra 7 giorni (predefinita)',q.due?'':'soft');
 chip('Chi',q.owner||P().me()||'—',q.owner?'':'soft');if(q.priority)chip('Priorità',q.priority,PCLS[q.priority]);
 const ph=pr&&(pr.subprojects.find(s=>s.id===q.subproject)||pr.subprojects.find(s=>s.id===$('filter-sub').value)||pr.subprojects[0]);if(ph)chip('Fase',ph.name,q.subproject?'':'soft');if(q.milestone)chip('Milestone','sì');
 if(q.unknown.length)box.append(el('span','Fase non trovata: '+q.unknown.join(', ')+' (resta nel titolo? no, la ignoro).','warn-text'));}
function quickAdd(e){e.preventDefault();const p=P(),state=p.state(),pr=p.project(),input=$('quick-input');if(!state||!pr){p.say('Il piano non è ancora caricato.');return}
 const q=W.parseQuick(input.value,quickContext());if(!q.title){p.say('Scrivi il titolo dell’attività.');input.focus();return}
 const sub=q.subproject||(pr.subprojects.some(s=>s.id===$('filter-sub').value)?$('filter-sub').value:pr.subprojects[0].id);
 const t=act(()=>pm.create(state,{project:pr.id,subproject:sub,title:q.title.slice(0,120),owner:(q.owner||p.me()||'Da assegnare').slice(0,80),start:'',due:q.due||W.plus(today(),7),details:'',dependencies:[],approvalRequired:false,milestone:q.milestone,assignedAgents:[],recurrence:'Nessuna',priority:q.priority}),t=>'Aggiunta «'+t.title+'» · '+t.owner+' · '+whenLabel(t.due).toLowerCase()+'.');
 if(t){t.history=['Aggiunta rapida da '+(p.me()||'il team')+'.'];input.value='';preview();p.markNew(t.id)}input.focus()}
function bindQuick(){const f=$('quick-form'),i=$('quick-input');if(!f||!i||f.dataset.bound)return;f.dataset.bound='1';f.onsubmit=quickAdd;i.addEventListener('input',preview);preview();
 doc.addEventListener('keydown',e=>{const t=e.target,typing=t&&(/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)||t.isContentEditable);if(typing||e.metaKey||e.ctrlKey||e.altKey)return;
  if(e.key==='q'||e.key==='n'){e.preventDefault();i.focus()}else if(e.key==='/'){const s=$('query');if(s){e.preventDefault();s.focus()}}})}
function prefill(text){const i=$('quick-input');if(!i)return;i.value=text;preview();i.focus();if(i.setSelectionRange)i.setSelectionRange(0,0)}

// ---- «Le mie attività» across every project ----
let everyone=false;
function drawMine(box){const p=P(),me=p.me(),entries=p.entries();box.replaceChildren();
 const head=el('div',null,'pm-mine-head');const title=el('div');title.append(el('h3',everyone?'Attività aperte di tutto il team':'Le mie attività'),el('small',everyone?'Su tutti i progetti, per scadenza.':'Assegnate a '+(me||'te')+' su tutti i progetti, per scadenza.','muted'));
 const sw=el('div',null,'pm-seg',{role:'group','aria-label':'Di chi'});[['Solo mie',false],['Tutto il team',true]].forEach(([l,v])=>{const b=btn(l,everyone===v?'on':'',()=>{everyone=v;p.render()},{'aria-pressed':String(everyone===v)});sw.append(b)});head.append(title,sw);box.append(head);
 if(!entries){box.append(el('p','Carico le attività di tutti i progetti…','muted'));return}
 const w=W.myWork(entries,{me,everyone});
 const kp=el('div',null,'pm-mine-kpis');[[w.open,'aperte'],[w.late,'scadute'],[w.groups[1].items.length,'per oggi'],[w.doneWeek,'completate in 7 giorni']].forEach(([n,l],i)=>{const k=el('div',null,'pm-mine-kpi'+(i===1&&n?' late':''));k.append(el('strong',String(n)),el('span',l));kp.append(k)});box.append(kp);
 if(!everyone){const ms=W.mentionsOf(entries,me);if(ms.length){const sec=el('section',null,'pm-mentions');sec.append(el('h4','Ti hanno menzionato ('+ms.length+')'));ms.slice(0,5).forEach(m=>{const r=btn(null,'pm-mention',()=>open(m.projectId,m.task.id));r.append(el('strong',m.comment.by||'Qualcuno'),document.createTextNode(' '),el('span','su «'+m.task.title+'»:'),document.createTextNode(' '),el('q',m.comment.text.slice(0,160)),el('small',' · '+m.projectName,'muted'));sec.append(r)});box.append(sec)}}
 if(!w.open){const e=el('div',null,'pm-mine-empty');e.append(el('strong',everyone?'Nessuna attività aperta nei progetti.':'Niente in sospeso per te.'),el('p',everyone?'Aggiungi la prima qui sopra.':'Le attività assegnate a te in qualsiasi progetto compaiono qui. Usa «Tutto il team» per vedere quelle degli altri.','muted'));box.append(e);return}
 for(const g of w.groups){if(!g.items.length)continue;const sec=el('section',null,'pm-mine-group',{'data-group':g.id});sec.append(el('h4',g.label+' · '+g.items.length));const ul=el('ul',null,'pm-mine-list');
  for(const it of g.items){const t=it.task,li=el('li',null,'pm-mine-row'+(g.id==='late'?' late':''));
   const cb=el('input',null,null,{type:'checkbox','aria-label':'Completa «'+t.title+'»'});cb.onchange=()=>completeIn(it.projectId,t.id);
   const main=btn(null,'pm-mine-title',()=>open(it.projectId,t.id));main.append(el('strong',(t.milestone?'◇ ':'')+t.title),el('small',it.projectName+(it.phase?' · '+it.phase:'')+(everyone?' · '+t.owner:''),'muted'));
   const meta=el('span',null,'pm-mine-meta');const pp=priorityPill(t.priority);if(pp)meta.append(pp);if(t.status!=='Da fare')meta.append(statusPill(t.status));if((t.comments||[]).length)meta.append(el('span','💬 '+t.comments.length,'pill'));meta.append(el('span',whenLabel(t.due),'pm-when'+(g.id==='late'?' late':g.id==='today'?' today':'')));
   li.append(cb,main,meta);ul.append(li)}
  sec.append(ul);box.append(sec)}}
function open(projectId,taskId){const p=P();if(projectId===p.projectKey())p.pick(taskId);else root.location.search='?project='+encodeURIComponent(projectId)+'&task='+encodeURIComponent(taskId)}
async function completeIn(projectId,taskId){const p=P();if(projectId===p.projectKey()){const t=p.state().tasks.find(x=>x.id===taskId);act(()=>complete(p.state(),t),()=>completedSay(t,p.state()));p.refreshEntry();return}
 try{const ws=root.RadixWorkspace,d=await ws.documents.load(projectId,'pm');const s=pm.validateState(d.data),t=s.tasks.find(x=>x.id===taskId);complete(s,t);await ws.documents.save(projectId,'pm',pm.validateState(s),d.revision);p.setEntry(projectId,s);p.say(completedSay(t,s))}catch(e){p.say(e instanceof root.RadixWorkspace.ConflictError?'Un collega ha appena modificato quel piano: riprova.':e.message)}p.render()}

// ---- Editable list (Monday-style table), grouped and sortable ----
let groupBy='subproject',sortKey='due',sortDir='asc';
function drawTable(box,list){const p=P(),state=p.state(),pr=p.project();box.replaceChildren();
 const bar=el('div',null,'pm-table-bar');const gl=el('label');gl.append(el('span','Raggruppa per'));const gs=el('select',null,null,{id:'pm-group','aria-label':'Raggruppa per'});[['subproject','Fase'],['status','Stato'],['owner','Responsabile'],['priority','Priorità']].forEach(([v,l])=>{const o=el('option',l);o.value=v;gs.append(o)});gs.value=groupBy;gs.onchange=()=>{groupBy=gs.value;p.render()};gl.append(gs);bar.append(gl,el('small','Modifica stato, responsabile, scadenza e priorità direttamente nella riga.','muted'));box.append(bar);
 if(!list.length){box.append(el('p','Nessuna attività corrisponde ai filtri. Prova ad azzerarli.','muted'));return}
 const dl=ownersList();const table=el('table',null,'pm-table');const thead=el('thead'),hr=el('tr');hr.append(el('th','',null,{'aria-label':'Fatta'}));
 [['title','Attività'],['owner','Responsabile'],['due','Scadenza'],['priority','Priorità'],['status','Stato']].forEach(([k,l])=>{const th=el('th',null,null,{'aria-sort':sortKey===k?(sortDir==='asc'?'ascending':'descending'):'none'});th.append(btn(l+(sortKey===k?(sortDir==='asc'?' ↑':' ↓'):''),'pm-sort',()=>{if(sortKey===k)sortDir=sortDir==='asc'?'desc':'asc';else{sortKey=k;sortDir='asc'}p.render()}));hr.append(th)});thead.append(hr);table.append(thead);
 for(const g of W.groupTasks(W.sortTasks(list,sortKey,sortDir),groupBy,pr.subprojects)){const tb=el('tbody');const gh=el('tr',null,'pm-group-row');const gc=el('th',null,null,{colspan:'6',scope:'rowgroup'});gc.append(el('strong',g.name),el('small',g.done+'/'+g.items.length+' completate','muted'));
  if(groupBy==='subproject'){const ph=pr.subprojects.find(s=>s.name===g.name);if(ph)gc.append(btn('+ Aggiungi qui','link pm-add-here',()=>prefill(' #'+ph.name.replace(/\s+/g,'-'))))}gh.append(gc);tb.append(gh);
  for(const t of g.items){const tr=el('tr',null,'pm-trow'+(t.status==='Completato'?' done':'')+(t.status!=='Completato'&&t.due<today()?' late':'')+(t.id===p.selected()?' on':''),{'data-id':t.id});
   const c0=el('td');const cb=el('input',null,null,{type:'checkbox','aria-label':(t.status==='Completato'?'Riapri «':'Completa «')+t.title+'»'});cb.checked=t.status==='Completato';cb.onchange=()=>act(()=>complete(state,t),()=>completedSay(t,state));c0.append(cb);
   const c1=el('td',null,'pm-tcell-title');const tb2=btn(null,'pm-tlink',()=>p.pick(t.id));tb2.append(el('span',(t.milestone?'◇ ':'')+t.title));c1.append(tb2);const extra=el('span',null,'pm-tmeta');const cl=t.checklist||[];if(cl.length)extra.append(el('span','☑ '+cl.filter(c=>c.done).length+'/'+cl.length));if((t.comments||[]).length)extra.append(el('span','💬 '+t.comments.length));if(pm.blockers(state,t).length)extra.append(el('span','⛓ in attesa','warn'));if(t.recurrence&&t.recurrence!=='Nessuna'&&!/solo descrizione/.test(t.recurrence))extra.append(el('span','↻ '+t.recurrence.toLowerCase()));if(extra.children.length)c1.append(extra);
   const c2=el('td');const ow=el('input',null,'pm-cell',{list:dl,'aria-label':'Responsabile di «'+t.title+'»',maxlength:'80'});ow.value=t.owner;ow.disabled=t.status==='Completato';ow.onchange=()=>{const v=ow.value.trim();if(!v||v===t.owner){ow.value=t.owner;return}act(()=>pm.reassign(state,t.id,v),'Responsabile aggiornato: '+v+'.')};c2.append(ow);
   const c3=el('td');const du=el('input',null,'pm-cell',{type:'date','aria-label':'Scadenza di «'+t.title+'»'});du.value=t.due;du.disabled=t.status==='Completato';du.onchange=()=>{if(!du.value||du.value===t.due){du.value=t.due;return}const shift=W.days(t.due,du.value);act(()=>pm.reschedule(state,[{id:t.id,due:du.value,start:t.start?W.plus(t.start,shift):''}]),'Scadenza spostata al '+fmt(du.value)+'.')};c3.append(du);
   const c4=el('td');const pr2=el('select',null,'pm-cell pm-prio-sel',{'aria-label':'Priorità di «'+t.title+'»','data-p':t.priority||''});['',...W.PRIORITIES].forEach(v=>{const o=el('option',v||'—');o.value=v;pr2.append(o)});pr2.value=t.priority||'';pr2.onchange=()=>act(()=>pm.setPriority(state,t.id,pr2.value),'Priorità: '+(pr2.value||'nessuna')+'.');c4.append(pr2);
   const c5=el('td');const st=el('select',null,'pm-cell pm-st-sel',{'aria-label':'Stato di «'+t.title+'»','data-status':t.status});pm.statuses.forEach(v=>{const o=el('option',v);o.value=v;st.append(o)});st.value=t.status;st.onchange=()=>act(()=>pm.changeStatus(state,t.id,st.value),()=>completedSay(t,state).startsWith('Completata')?completedSay(t,state):'Stato: '+st.value+'.');c5.append(st);
   tr.append(c0,c1,c2,c3,c4,c5);tb.append(tr)}
  table.append(tb)}
 const wrap=el('div',null,'pm-table-wrap');wrap.append(table);box.append(wrap)}

// ---- Month calendar ----
let month=null;
function drawCalendar(box,list){const p=P(),state=p.state();box.replaceChildren();const c=W.calendar(list,month||today());
 const head=el('div',null,'pm-cal-head');head.append(btn('‹','',()=>{month=c.prev;p.render()},{'aria-label':'Mese precedente'}),el('h3',c.label.charAt(0).toUpperCase()+c.label.slice(1)),btn('›','',()=>{month=c.next;p.render()},{'aria-label':'Mese successivo'}),btn('Oggi','',()=>{month=null;p.render()}));box.append(head);
 const grid=el('div',null,'pm-cal',{role:'grid','aria-label':'Calendario delle scadenze'});(EN()?['Mon','Tue','Wed','Thu','Fri','Sat','Sun']:['Lun','Mar','Mer','Gio','Ven','Sab','Dom']).forEach(d=>grid.append(el('div',d,'pm-cal-dow',{role:'columnheader'})));
 for(const wk of c.weeks)for(const d of wk){const cell=el('div',null,'pm-cal-day'+(d.inMonth?'':' out')+(d.today?' today':'')+(d.weekend?' we':''),{role:'gridcell','data-day':d.day});
  const num=btn(String(Number(d.day.slice(8))),'pm-cal-num',()=>prefill(' il '+d.day.slice(8)+'/'+d.day.slice(5,7)),{title:'Aggiungi un’attività per il '+fmt(d.day),'aria-label':'Aggiungi un’attività per il '+fmt(d.day,{weekday:'long',day:'numeric',month:'long'})});cell.append(num);
  for(const t of d.tasks.slice(0,4)){const chip=btn((t.milestone?'◇ ':'')+t.title,'pm-cal-task'+(t.status==='Completato'?' done':'')+(t.status!=='Completato'&&t.due<today()?' late':'')+(t.priority?' '+PCLS[t.priority]:''),()=>p.pick(t.id),{title:t.title+' · '+t.owner+' · '+t.status,draggable:t.status==='Completato'?'false':'true'});chip.ondragstart=e=>e.dataTransfer.setData('text/plain',t.id);cell.append(chip)}
  if(d.tasks.length>4)cell.append(el('small','+'+(d.tasks.length-4)+' altre','muted'));
  cell.ondragover=e=>{e.preventDefault();cell.classList.add('drop')};cell.ondragleave=()=>cell.classList.remove('drop');
  cell.ondrop=e=>{e.preventDefault();cell.classList.remove('drop');const id=e.dataTransfer.getData('text/plain'),t=state.tasks.find(x=>x.id===id);if(!t||t.due===d.day)return;const shift=W.days(t.due,d.day);act(()=>pm.reschedule(state,[{id,due:d.day,start:t.start?W.plus(t.start,shift):''}]),'«'+t.title+'» spostata al '+fmt(d.day)+'.')};
  grid.append(cell)}
 box.append(grid,el('p','Trascina un’attività su un altro giorno per spostarne la scadenza; premi il numero di un giorno per aggiungerne una.','muted'))}

// ---- Detail: priority, recurrence note, comments with @mentions, AI break-down ----
function detail(box,t){const p=P(),state=p.state();
 const row=el('div',null,'pm-detail-quick');const pl=el('label','Priorità');const ps=el('select',null,null,{id:'detail-priority'});['',...W.PRIORITIES].forEach(v=>{const o=el('option',v||'Nessuna');o.value=v;ps.append(o)});ps.value=t.priority||'';ps.onchange=()=>act(()=>pm.setPriority(state,t.id,ps.value),'Priorità: '+(ps.value||'nessuna')+'.');pl.append(ps);row.append(pl);
 if(t.status!=='Completato'){const done=btn(t.approvalRequired&&!t.approved?'Manda in revisione':'✓ Segna come completata','primary',()=>act(()=>complete(state,t),()=>completedSay(t,state)));if(t.approvalRequired&&!t.approved&&t.status==='In revisione')done.hidden=true;if(pm.blockers(state,t).length){done.disabled=true;done.title='Prima vanno completate le dipendenze.'}row.append(done)}
 const anchor=box.querySelector&&box.querySelector('dl.meta');if(anchor)box.insertBefore(row,anchor);else box.append(row);
 if(t.recurrence&&t.recurrence!=='Nessuna'){const note=/solo descrizione/.test(t.recurrence)?'Ricorrenza segnata come descrizione: apri «Modifica attività» e salva per attivarla.':'↻ '+t.recurrence+': quando la completi si crea da sola la prossima.';box.append(el('p',note,'muted pm-rec-note'))}
 // AI break-down into sub-tasks: one confirmed call, proposals ticked by the person before they are added
 const rt=root.RadixAgents;if(rt&&t.status!=='Completato'){const area=el('div',null,'pm-ai-break');const go=btn('✦ Scomponi in sotto-attività con l’AI','pm-ai-btn',()=>breakdown(t,area,go));area.append(go);box.append(area)}
 box.append(el('h3','Commenti'+((t.comments||[]).length?' · '+t.comments.length:'')));const ul=el('ul',null,'pm-comments');const names=people();
 (t.comments||[]).forEach(c=>{const li=el('li');const h=el('div',null,'pm-comment-head');h.append(el('strong',c.by||'Qualcuno'),el('small',' '+new Date(c.at).toLocaleString('it-IT',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}),'muted'));if(c.by&&c.by===p.me())h.append(btn('Elimina','link',()=>act(()=>pm.removeComment(state,t.id,c.id,p.me()),'Commento eliminato.')));
  const body=el('p');let last=0;const text=c.text;for(const m of text.matchAll(/@([\p{L}][\p{L}'-]*)/gu)){const who=W.mentions(m[0],names);if(!who.length)continue;body.append(document.createTextNode(text.slice(last,m.index)));body.append(el('mark','@'+m[1],'pm-at',{title:who[0]}));last=m.index+m[0].length}body.append(document.createTextNode(text.slice(last)));li.append(h,body);ul.append(li)});
 if(!(t.comments||[]).length)ul.append(el('li','Nessun commento. Scrivi un aggiornamento o una domanda: con @nome avvisi la persona nelle sue attività.','muted'));box.append(ul);
 const f=el('form',null,'pm-comment-form');const ta=el('textarea',null,null,{rows:'2',maxlength:'2000','aria-label':'Nuovo commento',placeholder:'Scrivi un commento… usa @nome per avvisare'});const send=el('button','Commenta');send.type='submit';f.append(ta,send);
 f.onsubmit=e=>{e.preventDefault();if(!ta.value.trim())return;const who=W.mentions(ta.value,names).filter(n=>!W.isMe(n,p.me()));act(()=>pm.addComment(state,t.id,{text:ta.value,by:p.me()}),who.length?'Commento salvato: lo vedranno '+who.join(', ')+' in «Le mie attività».':'Commento salvato.')};box.append(f)}
async function breakdown(t,area,go){const p=P(),rt=root.RadixAgents,C=root.RadixConfirm;const ask=o=>C?C.ask(o):Promise.resolve(!!root.confirm([o.title,o.cost,o.message].join('\n')));
 if(!await ask({title:'Scomporre «'+t.title+'» con l’AI?',cost:'Una chiamata all’AI (consuma crediti API).',message:'Ricevi da 3 a 8 sotto-attività da spuntare: aggiungi solo quelle che scegli.',ok:'Sì, proponi'}))return;
 go.disabled=true;go.textContent='L’AI sta scomponendo…';const pr=p.project();
 try{const r=await rt.reply({role:'pm-planner',project:rt.profileFor?rt.profileFor(p.current()):undefined,memoryScope:{projectId:p.projectKey(),agentId:'pm-planner'},messages:[{role:'user',content:W.breakdownPrompt(t,{project:p.projectName(),phase:(pr.subprojects.find(s=>s.id===t.subproject)||{}).name})}]});
  const items=W.parseBreakdown(r.text,t.checklist);if(!items.length)throw new Error('La risposta non conteneva sotto-attività leggibili: riprova.');
  area.replaceChildren();const f=el('form',null,'pm-ai-proposals');f.append(el('strong','Proposte dell’AI · spunta quelle da aggiungere'));items.forEach((x,i)=>{const l=el('label',null,'check');const cb=el('input',null,null,{type:'checkbox',name:'s'+i});cb.checked=true;l.append(cb,document.createTextNode(x));f.append(l)});
  const add=el('button','Aggiungi le selezionate','primary');add.type='submit';f.append(add,btn('Annulla','',()=>p.render()));
  f.onsubmit=e=>{e.preventDefault();const chosen=items.filter((x,i)=>f.elements.namedItem('s'+i).checked);act(()=>{const st=p.state();for(const x of chosen)pm.addSubtask(st,t.id,x);return chosen.length},n=>n+(n===1?' sotto-attività aggiunta.':' sotto-attività aggiunte.'))};area.append(f)}
 catch(e){go.disabled=false;go.textContent='✦ Scomponi in sotto-attività con l’AI';p.say('AI non disponibile: '+e.message)}}

// ---- Health and status updates ----
const EN=()=>!!(root.RadixI18n&&root.RadixI18n.en);
function healthOf(tasks){return W.health(tasks,{en:EN()})}
function drawHealth(){const p=P(),h=$('health');if(!h||!p.state())return;const r=healthOf(p.scoped());h.hidden=!r.health;h.dataset.health=r.health||'';h.textContent=r.health?'● '+r.health:'';h.title=r.reasons.join(' ');const pr=p.project(),last=pr&&(pr.updates||[]).slice(-1)[0];const n=$('health-note');if(n)n.textContent=last?'Ultimo aggiornamento: '+new Date(last.at).toLocaleDateString('it-IT',{day:'numeric',month:'short'})+(last.by?' · '+last.by:''):'Nessun aggiornamento di stato ancora.'}
function openUpdate(){const p=P(),pr=p.project(),tasks=p.scoped(),h=healthOf(tasks);const sel=$('update-health');if(!sel)return false;sel.value=h.health||'In linea';$('update-reasons').textContent=h.reasons.join(' ');$('report-text').value=W.statusDraft(tasks,{health:h,en:EN()});$('report-status').textContent='';drawUpdates(pr);$('report-dialog').showModal();return true}
function drawUpdates(pr){const ul=$('update-history');if(!ul)return;ul.replaceChildren();const list=(pr.updates||[]).slice().reverse();if(!list.length){ul.append(el('li','Ancora nessun aggiornamento salvato per questo progetto.','muted'));return}
 list.slice(0,10).forEach(u=>{const li=el('li');const d=el('details');const s=el('summary');s.append(el('span',u.health,'pm-health',{'data-health':u.health}),el('span',' '+new Date(u.at).toLocaleDateString('it-IT',{day:'numeric',month:'short',year:'numeric'})+(u.by?' · '+u.by:'')));d.append(s,el('pre',u.text));li.append(d);ul.append(li)})}
function saveUpdate(){const p=P(),pr=p.project();act(()=>pm.addStatusUpdate(p.state(),pr.id,{health:$('update-health').value,text:$('report-text').value,by:p.me()}),'Aggiornamento di stato salvato nel progetto.');drawUpdates(p.project());$('report-status').textContent='Salvato: lo trovi nello storico qui sotto e nel portafoglio.'}

// ---- Templates in «Nuovo progetto» ----
function bindTemplates(){const sel=$('project-template');if(!sel||sel.dataset.bound)return;sel.dataset.bound='1';W.TEMPLATES.forEach(t=>{const o=el('option',t.name+' — '+t.desc);o.value=t.id;sel.append(o)});
 const subs=$('project-subs'),start=$('project-start');if(start&&!start.value)start.value=today();const sync=()=>{const on=!!sel.value;if(subs)subs.hidden=on;const st=$('project-start-wrap');if(st)st.hidden=!on;const pv=$('project-template-preview');if(pv){pv.replaceChildren();const t=W.TEMPLATES.find(x=>x.id===sel.value);if(t){const ol=el('ol');t.phases.forEach(ph=>ol.append(el('li',ph[0]+' · '+ph[1].length+' attività')));pv.append(ol)}}};sel.onchange=sync;
 const cards=$('project-template-cards');if(cards){const opts=[{id:'',name:'Vuoto',desc:'Scrivi tu le fasi.'},...W.TEMPLATES];const draw=()=>cards.replaceChildren(...opts.map(t=>{const c=btn(null,'pm-tpl-card'+(sel.value===t.id?' on':''),()=>{sel.value=t.id;sync();draw()},{role:'radio','aria-checked':String(sel.value===t.id)});c.append(el('strong',t.name),el('small',t.desc));if(t.phases)c.append(el('span',t.phases.length+' fasi · '+t.phases.reduce((n,ph)=>n+ph[1].length,0)+' attività','pm-tpl-count'));return c}));draw()}
 sync()}
function templateState(form){const sel=$('project-template');if(!sel||!sel.value)return null;const data=new FormData(form);return W.fromTemplate(pm,sel.value,{name:String(data.get('name')||''),note:String(data.get('note')||''),start:($('project-start')||{}).value||today()})}

// ---- Portfolio: health of every project ----
function portfolioHealth(li,state){if(!state||!state.tasks)return;const h=W.health(state.tasks,{en:EN()});if(!h.health)return;li.append(el('span',h.health,'pm-health',{'data-health':h.health,title:h.reasons.join(' ')}))}

function draw(kind,box,list){if(kind==='mine')return drawMine(box);if(kind==='calendar')return drawCalendar(box,list);if(kind==='list')return drawTable(box,list)}
function card(t){return priorityPill(t.priority)}
root.RadixPmWorkUI={draw,detail,drawHealth,openUpdate,saveUpdate,bindQuick,bindTemplates,templateState,portfolioHealth,card,prefill,views:['mine','calendar','list']};
})(typeof globalThis!=='undefined'?globalThis:this);
