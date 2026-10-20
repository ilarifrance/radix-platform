'use strict';
/* Contatti and Aziende as Salesforce list views (logic in crm-list-core.js): a real table with the
   record count, sortable headers, a search over the list, fixed views, a column chooser and a
   checkbox per row. Records are the ones sales.js has loaded (RadixSalesApp.rows; RadixCrmData is
   the fallback for the related rows). Every write goes through sales.js (Modifica, Elimina,
   Customer360) and the bulk actions reuse crm-tools.js (CSV) and crm-campaigns.js (sequences and
   campaigns, each send with its own confirmation). «Schede» brings back the previous view. */
(()=>{
const content=document.getElementById('content');if(!content)return;
const L=()=>window.RadixCrmList,app=()=>window.RadixSalesApp;
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n};
const B=(text,fn,cls)=>{const b=E('button',text,cls);b.type='button';b.addEventListener('click',fn);return b};
const NAME={contacts:{one:'contatto',many:'contatti',title:'Contatti'},companies:{one:'azienda',many:'aziende',title:'Aziende'}};
const KIND={email:'Email',call:'Chiamata',meeting:'Riunione',note:'Nota',linkedin:'LinkedIn'};
const money=c=>new Intl.NumberFormat('it-IT',{maximumFractionDigits:0}).format(Number(c||0)/100);
const hhmm=d=>d.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
const fullDate=t=>t==null?'':new Date(t).toLocaleString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
const shortDate=t=>t==null?'':new Date(t).toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'});

/* Per-kind state; prefs live in localStorage per workspace (wrapped: storage may be blocked). */
const st={contacts:{selected:new Set(),query:'',pending:null},companies:{selected:new Set(),query:'',pending:null}};
function prefs(kind){const ws=app()?.state.workspace;if(st[kind].ws!==ws){st[kind].ws=ws;let raw=null;try{raw=localStorage.getItem(L().storageKey(ws,kind))}catch{}st[kind].prefs=L().parse(kind,raw);st[kind].selected=new Set();st[kind].query=''}return st[kind].prefs}
function save(kind){try{localStorage.setItem(L().storageKey(st[kind].ws,kind),JSON.stringify(st[kind].prefs))}catch{}}

// Records as sales.js loaded them; RadixCrmData (same endpoint, first 100 rows) only while sales.js has no complete data.
let cached=null;
async function fallback(){if(!window.RadixCrmData)return;try{cached=await window.RadixCrmData.load()}catch{cached=null}}
function data(){const a=app(),ready=!!a?.state.ready,r={};
 for(const e of ['contacts','companies','interactions','opportunities','stages','members']){const mine=a?a.rows(e):[];r[e]=!ready&&!mine.length&&cached&&Array.isArray(cached[e])?cached[e]:mine}
 return r}

function setMode(kind,mode){document.documentElement.dataset['lv'+(kind==='contacts'?'Contacts':'Companies')]=mode}

/* One list box per section that sales.js renders. */
function mount(section,kind){
 if(section.querySelector(':scope>.lv'))return;
 const p=prefs(kind),loadedAt=new Date();
 const box=E('div',undefined,'lv');box.dataset.kind=kind;
 // Header: view picker as title, count and update time, then search, columns, Schede/Tabella.
 const head=E('div',undefined,'lv-head');const titleBox=E('div',undefined,'lv-title');
 titleBox.append(E('span',NAME[kind].title,'lv-object'));
 const viewSel=E('select','', 'lv-view');viewSel.setAttribute('aria-label','Vista elenco · '+NAME[kind].title);
 for(const v of L().VIEWS[kind]){const o=E('option',v.label);o.value=v.id;viewSel.append(o)}viewSel.value=p.view;
 const meta=E('p',undefined,'lv-meta');meta.setAttribute('aria-live','polite');titleBox.append(viewSel,meta);
 const tools=E('div',undefined,'lv-tools');
 const search=E('input');search.type='search';search.maxLength=200;search.placeholder='Cerca in questo elenco…';search.value=st[kind].query;search.setAttribute('aria-label','Cerca in questo elenco · '+NAME[kind].title);
 const sWrap=E('label',undefined,'lv-search');sWrap.append(search);
 const cols=E('details',undefined,'lv-cols');const sum=E('summary','Colonne');cols.append(sum);const colList=E('div',undefined,'lv-cols-list');cols.append(colList);
 const modes=E('div',undefined,'lv-mode');modes.setAttribute('role','group');modes.setAttribute('aria-label','Visualizzazione');
 const bTable=B('Tabella',()=>switchMode('table')),bCards=B('Schede',()=>switchMode('cards'));modes.append(bCards,bTable);
 // «Dipartimento»: the company or department followed; options from the loaded rows, refreshed on each draw.
 const divSel=E('select','', 'lv-division');divSel.setAttribute('aria-label','Filtra per dipartimento · '+NAME[kind].title);
 divSel.addEventListener('change',()=>{p.division=divSel.value;save(kind);draw()});
 function drawDivisions(all){const list=L().divisions(all),key=JSON.stringify([list,p.division]);if(divSel.dataset.key===key)return;divSel.dataset.key=key;divSel.replaceChildren();
  const add=(v,t)=>{const o=E('option',t);o.value=v;divSel.append(o)};add('','Tutti i dipartimenti');for(const d of list)add(d.value,d.value+' ('+d.count+')');
  if(p.division&&p.division!==L().NONE&&!list.some(d=>L().fold(d.value)===L().fold(p.division)))add(p.division,p.division+' (0)');
  if(list.length||p.division===L().NONE)add(L().NONE,'Senza dipartimento');divSel.value=p.division||'';divSel.hidden=p.mode!=='table'||(!list.length&&!p.division)}
 tools.append(divSel,sWrap,cols,modes);head.append(titleBox,tools);
 const bulk=E('div',undefined,'lv-bulk');bulk.hidden=true;bulk.setAttribute('role','region');bulk.setAttribute('aria-label','Azioni sui record selezionati');
 const scroll=E('div',undefined,'lv-scroll');scroll.tabIndex=0;scroll.setAttribute('role','region');scroll.setAttribute('aria-label','Tabella '+NAME[kind].title);
 const note=E('p',undefined,'lv-note muted');
 box.append(head,bulk,scroll,note);
 let campaign=null;

 function switchMode(m){p.mode=m;save(kind);applyMode()}
 function applyMode(){setMode(kind,p.mode);bTable.setAttribute('aria-pressed',String(p.mode==='table'));bCards.setAttribute('aria-pressed',String(p.mode==='cards'));scroll.hidden=p.mode!=='table';if(p.mode!=='table'){bulk.hidden=true;if(campaign)campaign.hidden=true}
  for(const n of [sWrap,cols,viewSel,meta,note])n.hidden=p.mode!=='table';if(p.mode==='table')draw()}
 viewSel.addEventListener('change',()=>{p.view=viewSel.value;const v=L().VIEWS[kind].find(x=>x.id===p.view);p.sort=v&&v.sort?{...v.sort}:{key:'name',dir:'asc'};save(kind);draw()});
 let t=null;search.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(()=>{st[kind].query=search.value;draw()},120)});
 const hasScore=()=>!!window.RadixCrmScore;
 // Columns of migration 011 only when the loaded rows carry those fields (an older archive does not).
 const hasAdded=()=>{const F=window.RadixCrmFields,rows=data()[kind];return !!F&&(!rows.length||rows.some(r=>F.supported(kind,r)))};
 const colOpts=()=>({score:hasScore(),added:hasAdded()});
 let offered='';
 function drawCols(){colList.replaceChildren();offered=L().columnsFor(kind,colOpts()).map(c=>c.id).join();for(const c of L().columnsFor(kind,colOpts())){const l=E('label',undefined,'lv-check');const i=E('input');i.type='checkbox';i.checked=p.columns.includes(c.id);i.disabled=!!c.fixed;
  i.addEventListener('change',()=>{p.columns=L().toggleColumn(kind,p.columns,c.id);save(kind);draw()});l.append(i,E('span',' '+c.label));colList.append(l)}}

 function rowsNow(){const d=data(),now=Date.now();const all=L().buildRows(kind,d,{now,score:window.RadixCrmScore?.score,explain:window.RadixCrmScore?.explain});
  // A selection handed over from Aziende («Seleziona i loro contatti») shows every contact.
  if(st[kind].pending){st[kind].selected=new Set(st[kind].pending);st[kind].pending=null;p.view='all';viewSel.value='all';st[kind].query='';search.value=''}
  st[kind].selected=L().prune(st[kind].selected,all.map(r=>r.id));
  drawDivisions(all);
  return {all,shown:L().apply(kind,all,{view:p.view,division:p.division,query:st[kind].query,sort:p.sort},now),now,d}}

 function cell(kind,col,r,now){const td=E('td');td.dataset.col=col.id;
  const link=(label,href,ext)=>{const a=E('a',label);a.href=href;if(ext){a.target='_blank';a.rel='noopener noreferrer'}return a};
  const v=r[col.id];
  switch(col.id){
   case 'name':{const b=B(r.name,()=>open(kind,r.record),'lv-name');b.title='Apri Customer360 · '+r.name;td.append(b);
    // Contacts with a valid LinkedIn profile: a compact «in» opening «Messaggio LinkedIn» (crm-linkedin-message.js).
    if(kind==='contacts'&&r.linkedinUrl&&window.RadixCrmLinkedIn){const li=B('in',e=>{e.stopPropagation();if(!app()?.state.busy)window.RadixCrmLinkedIn.open(r.record)},'lv-li');
     li.title='Messaggio LinkedIn · '+r.name;li.setAttribute('aria-label','Messaggio LinkedIn a '+r.name);li.setAttribute('aria-haspopup','dialog');td.append(li);td.classList.add('lv-has-li')}
    break}
   case 'company':if(r.companyRecord){const b=B(r.company,()=>open('companies',r.companyRecord),'lv-link');b.title='Apri Customer360 · '+r.company;td.append(b)}else td.append(E('span','—','lv-empty'));break;
   case 'email':{const h=L().mailHref(v);td.append(h?link(v,h):E('span',v||'—',v?'':'lv-empty'));break}
   case 'phone':case 'mobile':{const h=L().telHref(v);td.append(h?link(v,h):E('span',v||'—',v?'':'lv-empty'));break}
   case 'revenue':td.append(v==null?E('span','—','lv-empty'):E('span',money(v)));td.className='num';td.title='Fatturato annuo in euro';break;
   case 'employees':td.append(v==null?E('span','—','lv-empty'):E('span',new Intl.NumberFormat('it-IT').format(v)));td.className='num';break;
   case 'website':{const h=L().websiteHref(v);td.append(h?link(v.replace(/^https?:\/\//,'').replace(/\/$/,''),h,true):E('span',v||'—',v?'':'lv-empty'));break}
   case 'linkedin':{const h=L().websiteHref(v);td.append(h?link('Profilo',h,true):E('span','—','lv-empty'));break}
   case 'consent':{const s=E('span',r.consent?'Sì':'No','lv-pill '+(r.consent?'ok':'no'));if(r.consent&&r.consentAt)s.title='Registrato il '+shortDate(Date.parse(r.consentAt));td.append(s);break}
   case 'score':if(r.score==null)td.append(E('span','—','lv-empty'));else{const s=E('span',undefined,'cx-score crm-score-'+r.band);s.dataset.score=String(r.score);s.title=r.explain;s.append(E('b',r.score),E('small',r.band));td.append(s)}break;
   case 'lastAt':if(r.lastAt==null)td.append(E('span',kind==='contacts'?'Mai':'Nessuna','lv-empty'));else{const s=E('span',L().ago(r.lastAt,now));s.title=fullDate(r.lastAt);td.append(s);if(r.lastKind)td.append(E('small',KIND[r.lastKind]||r.lastKind,'lv-sub'))}break;
   case 'contacts':td.append(E('span',String(r.contacts)));td.className='num';break;
   case 'openValue':if(!r.openCount)td.append(E('span','—','lv-empty'));else{td.append(E('span',money(r.openValue)),E('small',r.openCount+(r.openCount===1?' aperta':' aperte'),'lv-sub'));td.title='Valore nella valuta del workspace'}td.className='num';break;
   case 'createdAt':td.append(r.createdAt==null?E('span','—','lv-empty'):E('span',shortDate(r.createdAt)));break;
   default:td.append(v?E('span',v):E('span','—','lv-empty'));
  }
  const first=td.firstElementChild;if(first&&!first.title&&first.textContent.length>24)first.title=first.textContent;
  return td}

 function draw(){
  if(p.mode!=='table')return;
  const {all,shown,now}=rowsNow(),a=app(),sel=st[kind].selected;
  const offer=L().columnsFor(kind,colOpts()).map(c=>c.id).join();if(offer!==offered)drawCols();const columns=L().columnsFor(kind,colOpts()).filter(c=>p.columns.includes(c.id));
  const v=L().VIEWS[kind].find(x=>x.id===p.view);const sortCol=L().COLUMNS[kind].find(c=>c.id===p.sort.key);
  meta.textContent=shown.length+(shown.length===1?' elemento':' elementi')+(shown.length!==all.length?' su '+all.length+' caricati':'')+' · Ordinati per '+(sortCol?sortCol.label:'Nome')+' · Aggiornato alle '+hhmm(loadedAt);
  note.textContent=(a?.state.more?.[kind]?'Elenco parziale: sono caricati i primi '+all.length+' record, «Carica altri 100» qui sotto aggiunge i successivi. ':'')+(p.view==='recent'?'«Creati di recente»: negli ultimi '+L().RECENT_DAYS+' giorni. ':p.view==='idle'?'Senza interazioni registrate negli ultimi '+L().IDLE_DAYS+' giorni (azienda, suoi contatti o trattative). ':'')+(kind==='contacts'?'Ultimo contatto e punteggio dalle interazioni e trattative caricate.':'Contatti, opportunità e attività contati sui record caricati.');
  const table=E('table',undefined,'lv-table');const cap=E('caption',(v?v.label:NAME[kind].title)+' · '+shown.length+' righe');cap.className='lv-sr';table.append(cap);
  const thead=E('thead'),hr=E('tr');
  const thN=E('th','', 'lv-n');thN.setAttribute('scope','col');thN.append(E('span','N.','lv-sr'));
  const thC=E('th',undefined,'lv-cb');thC.setAttribute('scope','col');const all_=E('input');all_.type='checkbox';all_.setAttribute('aria-label','Seleziona tutti i '+NAME[kind].many+' nell’elenco');
  const ss=L().selectionState(sel,shown.map(r=>r.id));all_.checked=ss==='all';all_.indeterminate=ss==='some';all_.disabled=!shown.length;
  all_.addEventListener('change',()=>{st[kind].selected=L().toggleAll(st[kind].selected,shown.map(r=>r.id));draw()});thC.append(all_);hr.append(thN,thC);
  for(const c of columns){const th=E('th');th.setAttribute('scope','col');th.dataset.col=c.id;if(['contacts','openValue','revenue','employees'].includes(c.id))th.className='num';
   const on=p.sort.key===c.id;if(on)th.setAttribute('aria-sort',p.sort.dir==='asc'?'ascending':'descending');
   const b=B(c.short||c.label,()=>{p.sort=L().nextSort(p.sort,c.id);save(kind);draw()},'lv-sort');if(c.short)b.title=c.label;b.append(E('span',on?(p.sort.dir==='asc'?'▲':'▼'):'↕','lv-arrow'));b.lastChild.setAttribute('aria-hidden','true');th.append(b);hr.append(th)}
  const thA=E('th',undefined,'lv-actions');thA.setAttribute('scope','col');thA.append(E('span','Azioni','lv-sr'));hr.append(thA);thead.append(hr);table.append(thead);
  const tbody=E('tbody');const canWrite=!!a&&a.writable(kind);
  shown.forEach((r,i)=>{const tr=E('tr');tr.dataset.id=r.id;if(sel.has(r.id))tr.className='on';
   const n=E('td',String(i+1),'lv-n');const cb=E('td',undefined,'lv-cb');const x=E('input');x.type='checkbox';x.checked=sel.has(r.id);x.setAttribute('aria-label','Seleziona '+r.name);
   x.addEventListener('change',()=>{x.checked?st[kind].selected.add(r.id):st[kind].selected.delete(r.id);draw()});cb.append(x);tr.append(n,cb);
   for(const c of columns)tr.append(cell(kind,c,r,now));
   const act=E('td',undefined,'lv-actions');if(canWrite)act.append(B('Modifica',()=>a.edit(kind,r.record),'lv-mini'),B('Elimina',()=>a.remove(kind,r.record),'lv-mini danger'));tr.append(act);
   tbody.append(tr)});
  table.append(tbody);scroll.replaceChildren(table);
  if(!shown.length)scroll.append(E('p',all.length?'Nessun '+NAME[kind].one+' in questa vista'+(st[kind].query?' per «'+st[kind].query+'»':'')+'.':'Nessun '+NAME[kind].one+' caricato. Nessun dato dimostrativo.','lv-none'));
  drawBulk(shown);
  if(a?.state.busy)box.querySelectorAll('button,input,select').forEach(n=>{if(n.dataset.preDisabled===undefined){n.dataset.preDisabled=String(n.disabled);n.disabled=true}});
 }

 function drawBulk(shown){
  const sel=st[kind].selected,n=sel.size;bulk.hidden=!n||p.mode!=='table';if(!n){if(campaign)campaign.hidden=true;return}
  const hiddenN=[...sel].filter(id=>!shown.some(r=>r.id===id)).length;
  bulk.replaceChildren(E('strong',n+(n===1?' '+NAME[kind].one+' selezionat'+(kind==='contacts'?'o':'a'):' '+NAME[kind].many+' selezionat'+(kind==='contacts'?'i':'e'))+(hiddenN?' ('+hiddenN+' fuori da questa vista)':'')));
  const ids=()=>new Set(st[kind].selected);
  if(window.RadixCrmTools?.exportCsv)bulk.append(B('Esporta CSV',()=>{const s=ids();window.RadixCrmTools.exportCsv(kind,r=>s.has(r.id))}));
  if(kind==='contacts'&&window.RadixCrmCampaigns&&(app().writable('tasks')||app().writable('interactions')))bulk.append(Object.assign(B('Sequenza o campagna email',()=>{
   if(!campaign){campaign=window.RadixCrmCampaigns.panel(async()=>{const s=ids();return r=>s.has(r.id)});campaign.classList.add('lv-campaign');
    const s=campaign.querySelector('summary');if(s)s.textContent='Sequenze e campagne email sui contatti selezionati';bulk.after(campaign)}
   campaign.hidden=false;campaign.open=true;campaign.scrollIntoView({block:'nearest',behavior:'smooth'})}),{title:'Solo i contatti spuntati. Nulla parte da solo: ogni invio chiede conferma e le email vanno solo a chi ha il consenso marketing.'}));
  if(kind==='companies')bulk.append(B('Seleziona i loro contatti',()=>{const c=L().contactsOf([...ids()],app().rows('contacts'));if(!c.length){app().notice('Nessun contatto caricato per le aziende selezionate.');return}
   st.contacts.pending=c;app().notice(c.length+(c.length===1?' contatto selezionato':' contatti selezionati')+' in Contatti.');if(location.hash!=='#contacts')location.hash='#contacts';else rescan()}));
  bulk.append(B('Deseleziona',()=>{st[kind].selected=new Set();draw()},'lv-ghost'));
 }

 function open(subject,record){const a=app();if(!a||a.state.busy)return;a.openCustomer(subject,record).then(()=>{document.getElementById('customer360')?.scrollIntoView({block:'start'})})}

 drawCols();
 const anchor=[...section.querySelectorAll(':scope>p.muted')].pop()||section.querySelector(':scope>form')||section.querySelector(':scope>.row');
 anchor?anchor.after(box):section.prepend(box);
 box.redraw=draw;applyMode();
}

function rescan(){if(!window.RadixCrmList||!window.RadixSalesApp)return;
 for(const kind of ['contacts','companies']){const s=document.getElementById(kind);if(!s||s.parentElement!==content){continue}
  const box=s.querySelector(':scope>.lv');if(box)box.redraw();else mount(s,kind)}}
let q=false;const later=()=>{if(q)return;q=true;requestAnimationFrame(()=>{q=false;rescan()})};
// sales.js re-renders the whole #content: new sections are direct children.
new MutationObserver(later).observe(content,{childList:true});
addEventListener('hashchange',later);
document.getElementById('workspace')?.addEventListener('change',()=>{for(const k of ['contacts','companies']){st[k].ws=undefined}});
later();window.RadixCrmData&&!app()?.state.ready&&fallback().then(later);
})();
