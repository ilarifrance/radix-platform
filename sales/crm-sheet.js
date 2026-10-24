'use strict';
/* «Foglio chiamate»: the third mode of the Contatti list (sales/crm-list.js), next to Schede and Tabella.
   A spreadsheet for whoever calls many contacts: one row per contact, a few contact and company fields,
   then one column per thing still to do and one per interaction done (logic in crm-sheet-core.js).
   - Frozen panes: header rows stay on top, name, phone, «Chiama» and company stay on the left; each
     group label (Contatto, Azienda, Da fare, Attività) appears once and sticks to the left of its group.
   - Keyboard: arrows, Home/End, PageUp/PageDown between cells; Enter or F2 (or just typing) edits a
     contact or company field, Enter saves and goes down, Tab saves and goes right, Esc cancels.
   - Each edit is one update with the record version through RadixSalesApp.api (the same /api/sales
     command as the edit form); a refusal is shown in the cell and the old value comes back.
   - «Registra chiamata»: outcome + optional note → one interactions create (kind call); «Richiamare» and
     «Appuntamento» with a date also create the task that becomes the next activity. No email is sent.
     «Slot liberi» (crm-calendars.js) proposes free times from Outlook / Google and the CRM; a click fills the date.
   - Every interaction has its «Attività» column: when the sheet opens it reads by itself the pages not
     loaded yet (reads only, a progress line under the toolbar). A cell shows two lines of the note; a
     click, Enter or Space opens the whole text (noteDialog), a bottom sheet on a phone.
   - The server's answer replaces the loaded row, so the sheet changes at once and the pages loaded
     with «Carica altri 100» stay loaded. «Completa i dati» reads the remaining pages of companies,
     interactions, tasks and deals (reads only). CSV of the grid as shown (crm-csv-core.js). */
(()=>{
const C=()=>window.RadixCrmSheet,app=()=>window.RadixSalesApp;
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n};
const B=(text,fn,cls)=>{const b=E('button',text,cls);b.type='button';b.addEventListener('click',fn);return b};
const money=c=>new Intl.NumberFormat('it-IT',{maximumFractionDigits:0}).format(Number(c||0)/100)+' €';
const int=n=>new Intl.NumberFormat('it-IT').format(n);
// Dates and times in ora italiana (RadixCrmDates), like the fields that set them.
const dShort=t=>{const v=window.RadixCrmDates.inputAt(t);return v.slice(8,10)+'/'+v.slice(5,7)+'/'+v.slice(2,4)};
const hm=t=>window.RadixCrmDates.hm(t);
const CALL={id:'__call',label:'Chiama',call:true};
const ENTITIES=['contacts','companies','interactions','tasks','opportunities','stages'];
const MORE=()=>C().LOAD_ORDER;

/* State kept across redraws (sales.js re-renders #content, so the host element changes).
   auto: the generation+workspace whose pages were already read automatically (once each);
   progress: the line under the toolbar while (and just after) pages are read. */
const S={ws:undefined,prefs:null,query:'',pos:{r:0,c:0},editing:null,pendingDraw:false,errors:new Map(),saving:new Set(),flash:new Map(),dirty:false,loading:false,status:'',progress:'',auto:''};
function prefs(){const ws=app()?.state.workspace;if(S.ws!==ws){S.ws=ws;let raw=null;try{raw=localStorage.getItem(C().storageKey(ws))}catch{}S.prefs=C().parse(raw);S.query='';S.errors.clear();S.flash.clear();S.pos={r:0,c:0};S.editing=null}return S.prefs}
function save(){try{localStorage.setItem(C().storageKey(S.ws),JSON.stringify(S.prefs))}catch{}}
const rows=e=>app()?app().rows(e):[];
function data(){const d={};for(const e of ENTITIES)d[e]=rows(e);return d}
const hasAdded=()=>{const F=window.RadixCrmFields,r=rows('contacts');return !!F&&(!r.length||r.some(x=>F.supported('contacts',x)))};

/* ---------- Writes: same command bodies as the rest of the CRM, row patched in place ---------- */
async function post(entity,action,body){
 const a=app(),gen=a.state.generation,ws=a.state.workspace;
 const res=await a.api(entity,{body:{workspace:ws,entity,action,data:body}});
 const saved=res&&Array.isArray(res.rows)?res.rows[0]:null;
 if(gen===a.state.generation&&ws===a.state.workspace&&saved&&saved.id){a.state.rows[entity]=C().merge(a.state.rows[entity],saved);S.dirty=true;window.RadixCrmData?.reset?.()}
 return saved;
}
const why=e=>(e&&e.message||'Errore')+(e&&e.status===409?' Il record è cambiato nel frattempo: premi Aggiorna.':'');

/* ---------- Toolbar (built once per host) ---------- */
function build(host,ctx){
 const ui={};host.replaceChildren();host.classList.add('cs');
 const bar=E('div',undefined,'cs-bar');
 ui.search=E('input');ui.search.type='search';ui.search.maxLength=200;ui.search.placeholder='Cerca nel foglio…';ui.search.setAttribute('aria-label','Cerca nel foglio chiamate');ui.search.value=S.query;
 let t=null;ui.search.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(()=>{S.query=ui.search.value;S.pos.r=0;draw(host,ctx)},120)});
 const sw=E('label',undefined,'lv-search');sw.append(ui.search);
 const p=prefs();
 const select=(label,opts,key)=>{const s=E('select','', 'cs-filter');s.setAttribute('aria-label',label);for(const [v,l] of opts){const o=E('option',l);o.value=v;s.append(o)}s.value=p.filters[key]||'';
  s.addEventListener('change',()=>{p.filters[key]=s.value;save();S.pos.r=0;draw(host,ctx)});return s};
 ui.outcome=select('Filtra per ultimo esito',[['','Ultimo esito: tutti'],['never','Mai contattati'],['none','Senza esito'],...Object.entries(C().OUTCOMES)],'outcome');
 ui.next=select('Filtra per attività da fare',[['','Da fare: tutti'],['overdue','Con attività scadute'],['today','Da fare entro oggi'],['week','Da fare entro 7 giorni'],['none','Niente da fare']],'next');
 ui.cols=E('details',undefined,'lv-cols');ui.cols.append(E('summary','Colonne'));ui.colList=E('div',undefined,'lv-cols-list');ui.cols.append(ui.colList);
 ui.csv=B('Esporta CSV',()=>exportCsv(host));ui.csv.title='Scarica il foglio come lo vedi: colonne e righe visibili.';
 ui.more=B('Completa i dati',()=>completeData(host,ctx));ui.more.title='Legge le pagine non ancora caricate di aziende, interazioni, attività e trattative (solo lettura).';
 // «Vai alle attività»: scrolls the grid to «Attività 1» (the most recent), right of the frozen columns.
 ui.jump=B('Vai alle attività ›',()=>jumpTo(host,'acts:1'),'cs-jump');ui.jump.title='Scorri il foglio fino alle attività svolte (la più recente per prima).';
 bar.append(ui.outcome,ui.next,sw,ui.cols,ui.jump,ui.csv,ui.more);
 ui.meta=E('p',undefined,'lv-meta cs-meta');ui.meta.setAttribute('aria-live','polite');
 // «5 attività a destra (Attività 1–5) ›»: the activity columns cut off on the right (hiddenRight), so
 // they are never mistaken for missing; a click scrolls to the first of them. Updated on scroll and resize.
 ui.hint=B('',()=>{if(ui.hint.dataset.first)jumpTo(host,ui.hint.dataset.first)},'cs-hint');ui.hint.hidden=true;
 ui.progress=E('p',undefined,'cs-progress');ui.progress.setAttribute('role','status');
 ui.live=E('p',undefined,'lv-sr');ui.live.setAttribute('aria-live','assertive');
 ui.scroll=E('div',undefined,'cs-scroll');ui.scroll.setAttribute('role','region');ui.scroll.setAttribute('aria-label','Foglio chiamate: scorri in orizzontale per tutte le attività');
 ui.note=E('p',undefined,'lv-note muted');
 ui.help=E('p','Frecce per spostarti, Invio o F2 per modificare (oppure inizia a scrivere), Invio salva e scende, Tab salva e va a destra, Esc annulla. Il numero di telefono si chiama con un clic.','cs-help muted');
 host.append(bar,ui.meta,ui.hint,ui.progress,ui.live,ui.scroll,ui.help,ui.note);
 ui.scroll.addEventListener('keydown',e=>onKey(e,host,ctx));
 ui.scroll.addEventListener('scroll',()=>hint(host),{passive:true});
 host._cs=ui;return ui;
}
function drawCols(ui,host,ctx){
 const p=prefs(),key=JSON.stringify([p.columns,hasAdded()]);if(ui.colList.dataset.key===key)return;ui.colList.dataset.key=key;ui.colList.replaceChildren();
 let group='';
 for(const c of C().columnsFor({added:hasAdded()})){
  if(c.group!==group){group=c.group;ui.colList.append(E('strong',C().GROUPS[group],'cs-cols-group'))}
  const l=E('label',undefined,'lv-check');const i=E('input');i.type='checkbox';i.checked=c.fixed||p.columns.includes(c.id);i.disabled=!!c.fixed;
  i.addEventListener('change',()=>{p.columns=C().toggleColumn(p.columns,c.id);save();draw(host,ctx)});l.append(i,E('span',' '+c.label+(c.many?' (una colonna per voce)':'')));ui.colList.append(l)}
}

/* ---------- Grid ---------- */
let current={shown:[],nav:[]};
function draw(host,ctx){
 if(!C()||!app())return;
 const ui=host._cs||build(host,ctx);
 if(S.editing&&S.editing.host===host&&ui.scroll.contains(S.editing.input)){S.pendingDraw=true;return}
 S.editing=null;S.pendingDraw=false;
 const p=prefs(),a=app(),now=Date.now();drawCols(ui,host,ctx);
 const all=C().buildRows(data(),{now}),shown=C().apply(all,{filters:p.filters,query:S.query,sort:p.sort},now);
 const drawn=C().expand(p.columns,all,{added:hasAdded()});
 const nav=[];for(const c of drawn){nav.push(c);if(c.id==='phone')nav.push(CALL)}
 current={shown,nav,drawn,all};
 S.pos={r:Math.max(0,Math.min(shown.length-1,S.pos.r)),c:Math.max(0,Math.min(nav.length-1,S.pos.c))};
 const sortCol=C().colOf(p.sort.key);
 ui.meta.textContent=shown.length+(shown.length===1?' contatto':' contatti')+(shown.length!==all.length?' su '+all.length+' caricati':'')+' · Ordinati per '+(sortCol?sortCol.label:'Nome')+(S.status?' · '+S.status:'');
 const partial=MORE().filter(e=>a.state.more?.[e]);ui.more.hidden=!partial.length;ui.more.disabled=S.loading||!!a.state.busy;
 ui.progress.textContent=S.progress;ui.progress.hidden=!S.progress;
 ui.jump.hidden=!drawn.some(c=>c.id==='acts:1');
 ui.note.textContent=(a.state.more?.contacts?'Elenco parziale: sono caricati i primi '+all.length+' contatti, «Carica altri 100 · Contatti» qui sotto aggiunge i successivi. ':'')
  +(partial.length?'Attività, aziende e trattative vengono dalle pagine caricate ('+partial.map(e=>({companies:'aziende',interactions:'interazioni',tasks:'attività',opportunities:'trattative'})[e]).join(', ')+' parziali): «Completa i dati» legge le altre. ':'Attività, aziende e trattative dalle pagine caricate. ')
  +'«Da fare»: attività aperte e interazioni in calendario, la prima è la prossima. «Attività»: interazioni registrate, dalla più recente.';
 const focusIn=ui.scroll.contains(document.activeElement);const sl=ui.scroll.scrollLeft,st=ui.scroll.scrollTop;
 const table=E('table',undefined,'cs-table');table.setAttribute('role','grid');table.setAttribute('aria-rowcount',String(shown.length+2));table.setAttribute('aria-colcount',String(nav.length+1));
 const cap=E('caption','Foglio chiamate · '+shown.length+' contatti','lv-sr');table.append(cap);
 const thead=E('thead');
 // Group row: Chi (frozen) | Contatto | Azienda | Da fare | Attività, each label once (crm-sheet-core headerGroups).
 // A label of the scrolling part sticks to the left edge of its group, just right of the frozen columns.
 const gr=E('tr',undefined,'cs-groups');gr.setAttribute('role','row');const g0=E('th','', 'cs-n cs-fz cs-g-who');g0.setAttribute('aria-hidden','true');gr.append(g0);
 for(const g of C().headerGroups(nav)){
  const th=E('th',undefined,'cs-g-'+g.group+(g.frozen?' cs-fz '+(g.col==='call'?'cs-fz-call':'cs-fz-'+g.col):''));th.setAttribute('aria-hidden','true');
  if(g.span>1)th.colSpan=g.span;if(g.label)th.append(E('span',g.label,'cs-glabel'));gr.append(th)}
 const hr=E('tr',undefined,'cs-head');hr.setAttribute('role','row');const n0=E('th','#','cs-n cs-fz');n0.setAttribute('scope','col');hr.append(n0);
 for(const c of nav){const th=E('th');th.setAttribute('scope','col');th.setAttribute('role','columnheader');th.dataset.col=c.id;if(c.call||(c.base&&c.base.freeze))th.className='cs-fz '+fz(c);if(c.base&&c.base.num)th.classList.add('num');
  if(c.call){th.append(E('span','☎','cs-ico'),E('span','Registra chiamata','lv-sr'));hr.append(th);continue}
  const key=c.base.many?c.base.id:c.id,sortable=!c.base.many||c.index===0,on=sortable&&p.sort.key===key;
  if(on)th.setAttribute('aria-sort',p.sort.dir==='asc'?'ascending':'descending');
  if(sortable){const b=B(c.label,()=>{p.sort=C().nextSort(p.sort,key);save();draw(host,ctx)},'lv-sort');b.tabIndex=-1;b.append(E('span',on?(p.sort.dir==='asc'?'▲':'▼'):'↕','lv-arrow'));b.lastChild.setAttribute('aria-hidden','true');if(c.base.many)b.title='Ordina per '+(c.base.id==='acts'?'ultima interazione':'prossima attività');th.append(b)}
  else th.append(E('span',c.label,'cs-th'));
  hr.append(th)}
 thead.append(gr,hr);table.append(thead);
 const tbody=E('tbody');const canCall=a.writable('interactions');
 shown.forEach((r,ri)=>{const tr=E('tr');tr.setAttribute('role','row');tr.dataset.id=r.id;if(S.flash.has(r.id))tr.classList.add('cs-flash');
  const n=E('th',String(ri+1),'cs-n cs-fz');n.setAttribute('scope','row');tr.append(n);
  nav.forEach((c,ci)=>{const td=cell(r,c,now,host,ctx,canCall);td.setAttribute('role','gridcell');td.dataset.r=String(ri);td.dataset.c=String(ci);td.tabIndex=ri===S.pos.r&&ci===S.pos.c?0:-1;tr.append(td)});
  tbody.append(tr);
  if(S.flash.has(r.id)){const f=E('tr',undefined,'cs-flash-row');const td=E('td');td.colSpan=nav.length+1;const m=S.flash.get(r.id);td.append(E('span',m.text,'cs-flash-msg'+(m.err?' err':'')));f.append(td);tbody.append(f)}});
 table.append(tbody);
 ui.scroll.replaceChildren(table);ui.scroll.scrollLeft=sl;ui.scroll.scrollTop=st;
 if(!shown.length)ui.scroll.append(E('p',all.length?'Nessun contatto con questi filtri'+(S.query?' per «'+S.query+'»':'')+'.':'Nessun contatto caricato. Nessun dato dimostrativo.','lv-none'));
 if(a.state.busy)host.querySelectorAll('button,input,select').forEach(x=>{if(x.dataset.preDisabled===undefined){x.dataset.preDisabled=String(x.disabled);x.disabled=true}});
 if(focusIn)focusCell(host,false);
 hint(host);
 autoLoad(host,ctx);
}
const fz=c=>c.call?'cs-fz-call':'cs-fz-'+c.id;
// «⤢ tutto»: the note is longer than the two lines of the cell (the cell opens it).
const more=()=>{const s=E('span','⤢ tutto','cs-more');s.setAttribute('aria-hidden','true');return s};

function cell(r,c,now,host,ctx,canCall){
 const td=E('td');td.dataset.col=c.id;if(c.call||(c.base&&c.base.freeze))td.className='cs-fz '+fz(c);
 if(c.call){const b=B('☎',()=>callDialog(r,host,ctx),'cs-call');b.tabIndex=-1;b.title='Registra chiamata · '+r.name;b.setAttribute('aria-label','Registra chiamata con '+r.name);b.setAttribute('aria-haspopup','dialog');b.disabled=!canCall;td.append(b);return td}
 const base=c.base,err=S.errors.get(r.id+'|'+c.id),saving=S.saving.has(r.id+'|'+c.id),t=C().target(r,base);
 if(t&&t.entity==='contacts'?app().writable('contacts'):t&&app().writable('companies'))td.classList.add('cs-edit');
 if(base.num)td.classList.add('num');
 const empty=s=>E('span',s||'—','lv-empty');
 const tel=v=>{const h=window.RadixCrmList?.telHref(v);if(!v)return empty();if(!h)return E('span',v);const l=E('a',v);l.href=h;l.tabIndex=-1;l.title='Chiama '+v;return l};
 if(base.many){
  const i=c.index;
  if(base.id==='acts'){const x=r.acts[i];if(!x){td.append(empty(''));td.classList.add('cs-blank');return td}
   // «24/10/26 15:30 · Chiamata [Esito]», then up to two lines of the note (or the title); a click,
   // Enter or Space opens the whole text (noteDialog), «Leggi tutto» says when there is more.
   td.classList.add('cs-act','cs-detail');const top=E('span',undefined,'cs-act-top');top.append(E('b',dShort(x.at)+' '+hm(x.at)),E('span',' · '+(C().KINDS[x.kind]||x.kind||'Interazione')+' '));
   if(x.outcome)top.append(E('span',C().OUTCOMES[x.outcome],'cs-out cs-out-'+x.outcome));
   if(x.long)top.prepend(more());
   td.append(top,E('span',x.preview||(x.outcome?'':x.title)||'—','cs-act-note'));
   td.setAttribute('aria-haspopup','dialog');td.title=C().actText(x)+' · Invio o clic: testo completo';return td}
  const x=r.todos[i];if(!x){td.append(empty(''));td.classList.add('cs-blank');return td}
  td.classList.add('cs-todo','cs-detail');if(x.overdue)td.classList.add('cs-late');
  const due=E('b',undefined,'cs-todo-due');if(x.overdue)due.append(E('span','Scaduta','cs-late-badge'),' ');due.append(x.at==null?'Senza scadenza':dShort(x.at)+' '+hm(x.at));
  if(x.long)due.prepend(more());
  td.append(due,E('span',x.title,'cs-todo-title'));
  td.setAttribute('aria-haspopup','dialog');td.title=C().todoText(x)+(x.source==='interaction'?' (interazione in calendario)':'')+' · Invio o clic: dettagli';return td}
 switch(c.id){
  case 'name':{const s=E('span',r.name,'cs-name');td.append(s);const o=B('↗',e=>{e.stopPropagation();ctx.open('contacts',r.record)},'cs-open');o.tabIndex=-1;o.title='Apri Customer360 · '+r.name;o.setAttribute('aria-label','Apri Customer360 di '+r.name);td.append(o);td.title=r.name;
   // How many «Attività» columns this contact fills on the right, readable without scrolling.
   const n=C().countLabel(r.acts.length);if(n){td.append(E('small',n,'lv-sub cs-count'));td.title=r.name+' · '+n}break}
  case 'company':if(r.companyRecord){const b=B(r.company||'(senza nome)',()=>ctx.open('companies',r.companyRecord),'lv-link');b.tabIndex=-1;b.title='Apri Customer360 · '+r.company;td.append(b)}else td.append(empty(r.companyMissing?'non caricata':'—'));break;
  case 'phone':case 'mobile':case 'companyPhone':td.append(tel(r[c.id]));if(c.id==='companyPhone'&&!r.companyRecord)td.classList.remove('cs-edit');break;
  case 'email':{const h=window.RadixCrmList?.mailHref(r.email);if(h){const l=E('a',r.email);l.href=h;l.tabIndex=-1;td.append(l)}else td.append(r.email?E('span',r.email):empty());break}
  case 'country':td.append(r.country?E('span',r.country):empty());if(r.countryFrom==='contact'&&r.companyRecord){td.append(E('small','dal contatto','lv-sub'));td.title='Paese del contatto: l’azienda non ha il Paese di fatturazione. Modificando scrivi quello dell’azienda.'}break;
  case 'revenue':td.append(r.revenue==null?empty():E('span',money(r.revenue)));break;
  case 'employees':td.append(r.employees==null?empty():E('span',int(r.employees)));break;
  case 'stage':if(!r.deal)td.append(empty());else{td.append(E('span',r.stage,'cs-stage'));if(r.deal.title)td.append(E('small',r.deal.title+(r.deal.count>1?' · '+r.deal.count+' aperte':''),'lv-sub'))}break;
  default:td.append(r[c.id]?E('span',r[c.id]):empty());
 }
 if(base.added&&!hasAdded())td.classList.remove('cs-edit');
 if(saving){td.classList.add('cs-saving');td.append(E('small','Salvataggio…','cs-state'))}
 if(err){td.classList.add('cs-err');const m=E('small',err,'cs-state err');td.append(m);td.title=err}
 return td;
}

/* ---------- Keyboard and focus ---------- */
function cellAt(host,pos){return host._cs?.scroll.querySelector('td[data-r="'+pos.r+'"][data-c="'+pos.c+'"]')}
function focusCell(host,scroll=true){const td=cellAt(host,S.pos);if(!td)return;host._cs.scroll.querySelectorAll('td[tabindex="0"]').forEach(x=>{if(x!==td)x.tabIndex=-1});td.tabIndex=0;td.focus({preventScroll:!scroll});if(scroll)td.scrollIntoView({block:'nearest',inline:'nearest'})}
function onKey(e,host,ctx){
 const td=e.target.closest?.('td[data-r]');if(!td||S.editing)return;
 S.pos={r:+td.dataset.r,c:+td.dataset.c};
 const next=C().move(S.pos,e.key,current.shown.length,current.nav.length,{ctrl:e.ctrlKey||e.metaKey});
 if(next){e.preventDefault();S.pos=next;focusCell(host);return}
 const c=current.nav[S.pos.c],r=current.shown[S.pos.r];if(!c||!r)return;
 if(e.key==='Enter'||e.key==='F2'||e.key===' '){
  if(c.call){e.preventDefault();td.querySelector('button')?.click();return}
  if(td.classList.contains('cs-detail')&&e.key!=='F2'){e.preventDefault();noteDialog(r,c,td,host);return}
  if(td.classList.contains('cs-edit')){e.preventDefault();edit(host,ctx,td,r,c,null);return}
  if(e.key==='Enter'){const x=td.querySelector('button,a');if(x){e.preventDefault();x.click()}}
  return}
 if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&td.classList.contains('cs-edit')){e.preventDefault();edit(host,ctx,td,r,c,e.key)}
}
// Click selects a cell (an activity or to-do cell also opens its full text); double click edits it.
document.addEventListener('click',e=>{const td=e.target.closest?.('.cs td[data-r]');if(!td||S.editing)return;const host=td.closest('.cs');S.pos={r:+td.dataset.r,c:+td.dataset.c};if(e.target.closest('a,button'))return;focusCell(host,false);
 if(td.classList.contains('cs-detail'))noteDialog(current.shown[S.pos.r],current.nav[S.pos.c],td,host)});
// Width of the columns frozen on the left on this screen (on a phone the company scrolls: its left is auto).
const frozenWidth=ui=>[...ui.scroll.querySelectorAll('thead tr.cs-head th.cs-fz')].filter(x=>{const s=getComputedStyle(x);return s.display!=='none'&&s.left!=='auto'}).reduce((w,x)=>w+x.offsetWidth,0);
// Left edge of a header cell in grid pixels (scroll offset included).
const gridLeft=(ui,th)=>ui.scroll.scrollLeft+th.getBoundingClientRect().left-ui.scroll.getBoundingClientRect().left-ui.scroll.clientLeft;
/* Scroll the grid so a column starts right of the frozen ones, and select its cell in the current row. */
function jumpTo(host,colId){
 const ui=host._cs,i=current.nav.findIndex(c=>c.id===colId);if(!ui||i<0)return;
 const th=ui.scroll.querySelector('thead tr.cs-head th[data-col="'+colId+'"]');if(!th)return;
 ui.scroll.scrollLeft=Math.max(0,gridLeft(ui,th)-frozenWidth(ui));S.pos={r:S.pos.r,c:i};focusCell(host,false);hint(host);
}
/* The line «N attività a destra (Attività a–b) ›» under the count: which activity columns are cut off
   on the right right now (crm-sheet-core hiddenRight). Once per frame while scrolling. */
function hint(host){
 const ui=host&&host._cs;if(!ui||ui.hintFrame)return;
 ui.hintFrame=requestAnimationFrame(()=>{ui.hintFrame=0;
  const sc=ui.scroll,cols=[...sc.querySelectorAll('thead tr.cs-head th[data-col^="acts:"]')].map(th=>{const left=gridLeft(ui,th);return {id:th.dataset.col,left,right:left+th.offsetWidth}});
  const h=C().hiddenRight(cols,{left:sc.scrollLeft+frozenWidth(ui),right:sc.scrollLeft+sc.clientWidth});
  ui.hint.hidden=!h.count||!sc.isConnected;ui.hint.textContent=h.text;ui.hint.dataset.first=h.first||'';
  ui.hint.title=h.count?'Scorri il foglio fino a '+(h.from===h.to?'Attività '+h.from:'Attività '+h.from+'–'+h.to)+'.':''});
}
addEventListener('resize',()=>{const x=document.querySelector('.cs');if(x)hint(x)},{passive:true});
document.addEventListener('dblclick',e=>{const td=e.target.closest?.('.cs td.cs-edit[data-r]');if(!td||S.editing||e.target.closest('a,button'))return;const host=td.closest('.cs');S.pos={r:+td.dataset.r,c:+td.dataset.c};edit(host,host._ctx,td,current.shown[S.pos.r],current.nav[S.pos.c],null)});

/* ---------- Inline edit ---------- */
function edit(host,ctx,td,r,c,typed){
 const a=app();if(!a||a.state.busy||S.loading){a?.notice('Attendi la fine dell’operazione in corso.');return}
 const t=C().target(r,c.base);if(!t||!a.writable(t.entity))return;
 const busyKey=[...S.saving].some(k=>k.startsWith(r.id+'|'));if(busyKey){S.status='salvataggio in corso su questa riga';return}
 const fd=window.RadixCrmFields?.fieldOf(t.entity,t.key),value=C().editValue(r,c.base);let input;
 if(fd&&fd.type==='choice'){input=E('select');const opts=[['','Non impostato'],...fd.options];if(value&&!fd.options.some(([v])=>v===value))opts.push([value,value+' (da scegliere nell’elenco)']);for(const [v,l] of opts){const o=E('option',l);o.value=v;input.append(o)}input.value=value}
 else{input=E('input');input.type=fd&&fd.type==='email'?'email':fd&&fd.type==='tel'?'tel':'text';input.value=typed!=null?typed:value;if(fd&&fd.max)input.maxLength=fd.max;else input.maxLength=200;if(fd&&['int','money'].includes(fd.type))input.inputMode='numeric'}
 input.className='cs-input';input.setAttribute('aria-label',c.label+' di '+r.name);
 S.errors.delete(r.id+'|'+c.id);
 S.editing={host,input,r,c};td.classList.remove('cs-err');td.replaceChildren(input);input.focus();
 if(typed==null&&input.select)input.select();
 let done=false;
 const finish=(how,move)=>{if(done)return;done=true;const raw=input.value;S.editing=null;
  if(how==='cancel'){redrawAfter(host,ctx);return}
  if(move)S.pos=C().move(S.pos,move,current.shown.length,current.nav.length)||S.pos;
  commit(host,ctx,r,c,raw)};
 input.addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finish('cancel')}
  else if(e.key==='Enter'){e.preventDefault();e.stopPropagation();finish('save','ArrowDown')}
  else if(e.key==='Tab'){e.preventDefault();e.stopPropagation();finish('save',e.shiftKey?'ArrowLeft':'ArrowRight')}});
 input.addEventListener('blur',()=>setTimeout(()=>finish('save'),0));
 if(input.tagName==='SELECT')input.addEventListener('change',()=>{});
}
function redrawAfter(host,ctx){draw(host.isConnected?host:document.querySelector('.cs')||host,ctx);focusCell(document.querySelector('.cs')||host,false)}
async function commit(host,ctx,r,c,raw){
 const plan=C().editPlan(r,c.base,raw),key=r.id+'|'+c.id;
 if(plan.same){redrawAfter(host,ctx);return}
 if(plan.error){S.errors.set(key,plan.error);ctx.say(c.label+': '+plan.error);redrawAfter(host,ctx);return}
 S.saving.add(key);redrawAfter(host,ctx);
 try{await post(plan.entity,'update',plan.data);S.errors.delete(key);ctx.say(c.label+' di '+r.name+' salvato.')}
 catch(e){S.errors.set(key,why(e));ctx.say(c.label+' non salvato: '+why(e))}
 finally{S.saving.delete(key);const h=document.querySelector('.cs');if(h)redrawAfter(h,h._ctx||ctx)}
}

/* ---------- «Registra chiamata» ---------- */
let dlg=null;
function callDialog(r,host,ctx){
 const a=app();if(!a||a.state.busy||!a.writable('interactions'))return;
 if(!dlg){dlg=E('dialog',undefined,'cs-dialog');dlg.setAttribute('aria-labelledby','cs-dialog-title');document.body.append(dlg)}
 const h=E('h2','Registra chiamata');h.id='cs-dialog-title';
 const who=E('p',undefined,'cs-who');who.append(E('b',r.name),E('span',r.company?' · '+r.company:''));
 const phones=E('p',undefined,'cs-phones');for(const [l,v] of [['Tel.',r.phone],['Cell.',r.mobile],['Azienda',r.companyPhone]]){const href=window.RadixCrmList?.telHref(v);if(!href)continue;const x=E('a',l+' '+v);x.href=href;phones.append(x)}
 const noteL=E('label','Nota (facoltativa)');const note=E('textarea');note.rows=2;note.maxLength=3900;note.placeholder='Cosa vi siete detti, a chi richiedere…';noteL.append(note);
 const canTask=a.writable('tasks');
 const fl=E('label',undefined,'cs-follow');const fcb=E('input');fcb.type='checkbox';fcb.checked=canTask;fcb.disabled=!canTask;const when=E('input');when.type='datetime-local';when.value=C().tomorrowAt9(Date.now());when.disabled=!canTask;
 fl.append(fcb,E('span',' Con «Richiamare» o «Appuntamento» crea la prossima attività per il '),when);
 // «Slot liberi» (crm-calendars.js): free time from Outlook / Google and the CRM; a click fills the date.
 const slots=canTask&&window.RadixCrmCalendars?window.RadixCrmCalendars.slotPicker({onPick:v=>{when.value=v;fcb.checked=true}}):null;
 const err=E('p',undefined,'notice');err.hidden=true;err.setAttribute('role','alert');
 const outs=E('div',undefined,'cs-outs');outs.setAttribute('role','group');outs.setAttribute('aria-label','Esito: un clic registra la chiamata');
 const buttons=[];
 for(const [k,l] of Object.entries(C().OUTCOMES)){const b=B(l,()=>go(k),'cs-out-btn cs-out-'+k);buttons.push(b);outs.append(b)}
 const close=B('Annulla',()=>dlg.close(),'lv-ghost');
 dlg.replaceChildren(h,who,phones,E('p','Scegli l’esito: un clic registra la chiamata. Nessuna email viene inviata.','muted cs-hint'),outs,noteL,fl,...(slots?[slots]:[]),err,close);
 async function go(k){
  const plan=C().callPlan(r,{outcome:k,note:note.value,follow:fcb.checked?when.value:''},Date.now(),a.state.me);
  if(plan.error){err.textContent=plan.error;err.hidden=false;return}
  for(const b of buttons)b.disabled=true;err.hidden=true;
  let msg='',bad=false;
  try{await post('interactions','create',plan.interaction);msg='Chiamata registrata · '+C().OUTCOMES[k]}
  catch(e){err.textContent='Chiamata non registrata: '+why(e);err.hidden=false;for(const b of buttons)b.disabled=false;return}
  if(plan.task&&canTask){try{await post('tasks','create',plan.task);msg+=' · prossima attività '+dShort(Date.parse(plan.task.due_at))+' '+hm(Date.parse(plan.task.due_at))}catch(e){msg+=' · prossima attività NON creata: '+why(e);bad=true}}
  dlg.close();S.flash.set(r.id,{text:msg,err:bad});setTimeout(()=>{S.flash.delete(r.id);const x=document.querySelector('.cs');if(x&&!S.editing)draw(x,x._ctx||ctx)},6000);
  ctx.say(msg+' — '+r.name);(bad?a.error:a.notice)(msg+' — '+r.name+'.');
  const x=document.querySelector('.cs');if(x){draw(x,x._ctx||ctx);focusCell(x,false)}
 }
 dlg.addEventListener('close',()=>{const x=document.querySelector('.cs');if(x)focusCell(x,false)},{once:true});
 dlg.showModal();buttons[0].focus();
}

/* ---------- Full text of an activity or to-do ---------- */
/* A modal panel (a bottom sheet on a phone): date, type, outcome, the whole note with its line breaks,
   who registered it, and «Apri il contatto». Esc, «Chiudi» or a click outside close it; the focus goes
   back to the cell. ‹ › (or the arrow keys) move to the previous or next one of the same contact. */
let noteDlg=null;
function noteDialog(r,c,td,host){
 if(!r||!c||!c.base||!c.base.many)return;
 const items=c.base.id==='acts'?r.acts:r.todos;let i=c.index;if(!items[i])return;
 if(!noteDlg){noteDlg=E('dialog',undefined,'cs-note');noteDlg.setAttribute('aria-labelledby','cs-note-title');document.body.append(noteDlg);
  // A click on the backdrop lands on the dialog element itself.
  noteDlg.addEventListener('click',e=>{if(e.target===noteDlg)noteDlg.close()});
  noteDlg.addEventListener('close',()=>{const back=noteDlg._back;noteDlg._back=null;const x=document.querySelector('.cs');if(x&&back)focusCell(x,false)})}
 const ctx=host?._ctx;
 const show=k=>{
  i=k;const d=C().detail(r,items[i],{members:rows('members')});if(!d)return;
  const head=E('div',undefined,'cs-note-head');
  const h=E('h2',d.heading);h.id='cs-note-title';
  const close=B('Chiudi',()=>noteDlg.close(),'lv-ghost cs-note-close');close.setAttribute('aria-label','Chiudi il testo completo');
  head.append(h,close);
  const meta=E('p',undefined,'cs-note-meta');
  if(d.late)meta.append(E('span','Scaduta','cs-late-badge'),' ');
  meta.append(E('b',d.when));if(d.outcome)meta.append(' ',E('span',d.outcome.label,'cs-out cs-out-'+d.outcome.key));
  const who=E('p',d.contact,'cs-note-who');
  const parts=[head,meta,who];
  if(d.title)parts.push(E('p',d.title,'cs-note-title'));
  const body=E('div',undefined,'cs-note-body');body.tabIndex=0;body.setAttribute('aria-label','Testo completo');
  if(d.paragraphs.length)for(const p of d.paragraphs)body.append(E('p',p));else body.append(E('p',d.kind==='act'?'Nessuna nota scritta.':'Nessuna nota: c’è solo il titolo.','muted'));
  parts.push(body);
  if(d.facts.length){const dl=E('dl',undefined,'cs-note-facts');for(const [k,v] of d.facts)dl.append(E('dt',k),E('dd',v));parts.push(dl)}
  const foot=E('div',undefined,'cs-note-foot');
  const prev=B('‹ Precedente',()=>show(i-1),'lv-ghost');prev.disabled=i<=0;
  const pos=E('span',d.position,'cs-note-pos');
  const next=B('Successiva ›',()=>show(i+1),'lv-ghost');next.disabled=i>=items.length-1;
  const open=B('Apri il contatto',()=>{noteDlg._back=null;noteDlg.close();ctx?.open('contacts',r.record)},'primary');
  if(items.length>1)foot.append(prev,pos,next);foot.append(open);parts.push(foot);
  // Content in an inner box: the dialog element itself is only the backdrop area (click = close).
  const inner=E('div',undefined,'cs-note-in');inner.append(...parts);noteDlg.replaceChildren(inner);
  // Keep the cell under the panel in step: the selection follows ‹ ›.
  const ci=current.nav.findIndex(x=>x.base&&x.base.id===c.base.id&&x.index===i);if(ci>=0)S.pos={r:S.pos.r,c:ci};
  body.scrollTop=0;
 };
 noteDlg.onkeydown=e=>{if(e.target.closest('button')&&(e.key==='Enter'||e.key===' '))return;
  if(e.key==='ArrowLeft'&&i>0){e.preventDefault();show(i-1)}else if(e.key==='ArrowRight'&&i<items.length-1){e.preventDefault();show(i+1)}};
 show(i);noteDlg._back=td;
 if(!noteDlg.open)noteDlg.showModal();
 noteDlg.querySelector('.cs-note-close')?.focus();
}

/* ---------- CSV and «Completa i dati» ---------- */
function exportCsv(host){
 const CSV=window.RadixCrmCsv;if(!CSV){app().error('Esportazione CSV non disponibile.');return}
 const text=CSV.toCsv(current.shown,C().csvColumns(current.drawn));
 const l=E('a');l.href=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));l.download='foglio-chiamate-'+new Date().toISOString().slice(0,10)+'.csv';document.body.append(l);l.click();setTimeout(()=>{URL.revokeObjectURL(l.href);l.remove()},500);
 app().notice(current.shown.length+' righe esportate dal foglio chiamate.');
}
/* Reads the pages not loaded yet of interactions, tasks, companies and deals (reads only, the same
   requests as «Carica altri 100»), at most PAGE_CAP pages per kind each time; the progress line says
   what is being read and whether the cap left something out. auto: started by the sheet itself. */
async function completeData(host,ctx,auto){
 const a=app();if(!a||a.state.busy||S.loading)return;S.loading=true;const gen=a.state.generation,ws=a.state.workspace;let pages=0;const capped=[];
 const redraw=()=>{const x=document.querySelector('.cs')||host;draw(x,x._ctx||ctx)};
 try{
  for(const e of C().toLoad(a.state.more)){let guard=0;
   while(a.state.more?.[e]&&guard<C().PAGE_CAP){guard++;
    S.progress=C().progressText({entity:e,pages});S.status='';redraw();
    const off=a.state.offset[e]||0;const r=await a.api(e,{offset:off,...(e==='tasks'?{due:a.state.taskDue}:{}),...(a.state.search?.[e]!==undefined?{search:a.state.search[e]}:{})});
    if(gen!==a.state.generation||ws!==a.state.workspace){S.progress='';return}
    const have=new Set((a.state.rows[e]||[]).map(x=>x.id));a.state.rows[e]=[...(a.state.rows[e]||[]),...r.rows.filter(x=>!have.has(x.id))];
    a.state.offset[e]=off+r.rows.length;a.state.more[e]=r.rows.length===100;pages++;S.dirty=true}
   if(a.state.more?.[e])capped.push(e)}
  S.progress=C().progressText({pages,done:true,capped});
  if(!auto&&!pages)S.progress='Dati già completi: tutte le attività sono nel foglio.';
 }catch(e){S.progress=C().progressText({failed:String(e&&e.message||e)});if(!auto)a.error('Completamento dati non riuscito: '+(e.message||e))}
 finally{S.loading=false;window.RadixCrmData?.reset?.();redraw();
  // A finished line goes away after a while; a cap or an error stays until the next read.
  if(!capped.length&&!/interrotto/.test(S.progress)){const shown=S.progress;setTimeout(()=>{if(S.progress===shown){S.progress='';const x=document.querySelector('.cs');if(x&&!S.editing)draw(x,x._ctx||ctx)}},8000)}}
}
/* When the sheet opens (once per workspace load) it reads the missing pages by itself, so every
   interaction is in the «Attività» columns without pressing a button. Waits while the app is busy. */
function autoLoad(host,ctx){
 const a=app();if(!a||S.loading||a.state.busy||!Array.isArray(a.state.rows?.contacts))return;
 const key=a.state.generation+'|'+a.state.workspace;if(S.auto===key||!C().toLoad(a.state.more).length)return;
 S.auto=key;setTimeout(()=>completeData(host,ctx,true),0);
}

window.RadixCrmSheetView=Object.freeze({
 /* host: the box of crm-list.js; ctx: {open(subject,record), say(text)}. */
 draw(host,ctx){host._ctx=ctx;draw(host,ctx)},
 // Leaving the sheet: the cards of sales.js are redrawn once if the sheet changed loaded rows.
 leave(){if(S.dirty){S.dirty=false;app()?.render?.()}},
 state:S
});
})();
