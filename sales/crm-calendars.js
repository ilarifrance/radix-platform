'use strict';
/* Calendari: the bridge between the CRM and the person's own calendars (Outlook / Microsoft 365 and Google).
   - «Calendario da abbonare» (feedBox): the personal link of the CRM appointments as an iCalendar feed
     (api/_sales_calendar_feed.js). Outlook and Google subscribe to it once and keep it updated by themselves.
     The link is asked to the server (POST entity calendar_feed) only when the box is shown, once per workspace.
   - «Calendari esterni» (sourcesBox): the person's own Outlook / Google iCal links (api/_sales_calendars.js, migration 018).
     The link is sent once when saved and never comes back: the list shows the host and «link salvato». Busy time from those
     links (ensureBusy / busyEvents) appears in the Calendario as «Occupato» blocks (titles only with «Mostra i titoli»).
   - «Orario di lavoro» (workHours, kept in this browser) and slotPicker: the free slots for «Registra chiamata»
     (crm-sheet.js) and for the Chiamata / Evento / Attività forms of the record page (crm-record.js), from the
     external busy time plus the CRM's own appointments (sales/crm-freebusy-core.js).
   - Deep link of the feed events: radix-sales.html?ws=<workspace>&contatto=<id>#contacts opens that contact's Customer360.
   Used by calendar-view.js (the Calendario page), crm-sheet.js and crm-record.js. */
(()=>{
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FB=()=>window.RadixFreeBusy;
const pad=x=>String(x).padStart(2,'0');
const get=async(params)=>{
 const r=await fetch('/api/sales?'+new URLSearchParams(params),{credentials:'same-origin',cache:'no-store'});
 let d={};try{d=await r.json()}catch{}
 if(!r.ok)throw new Error(typeof d.error==='string'?d.error:'Richiesta rifiutata ('+r.status+').');return d};
const post=async(workspace,entity,action,data)=>{
 const r=await fetch('/api/sales',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','x-radix-sales':'1'},body:JSON.stringify({workspace,entity,action,data:data||{}})});
 let d={};try{d=await r.json()}catch{}
 if(!r.ok)throw new Error(typeof d.error==='string'?d.error:'Richiesta rifiutata ('+r.status+').');return d};

/* ---------- «Calendario da abbonare» ---------- */
const feed={ws:null,url:'',error:'',pending:null};
function loadFeed(ws){
 if(feed.ws===ws&&(feed.url||feed.pending))return feed.pending||Promise.resolve();
 feed.ws=ws;feed.url='';feed.error='';
 feed.pending=post(ws,'calendar_feed','create').then(d=>{if(feed.ws===ws)feed.url=location.origin+d.path}).catch(e=>{if(feed.ws===ws)feed.error=e.message}).finally(()=>{if(feed.ws===ws)feed.pending=null});
 return feed.pending;
}
async function copy(text,input){
 try{await navigator.clipboard.writeText(text);return true}
 catch{try{input.focus();input.select();return document.execCommand('copy')}catch{return false}}
}
function fillFeed(box){
 box.replaceChildren(E('h3','Calendario da abbonare'),
  E('p','I tuoi appuntamenti, richiami e attività con scadenza del CRM dentro Outlook e Google Calendar. Si aggiornano da soli: le modifiche si fanno qui.','cal-empty'));
 if(feed.error){box.append(E('p',feed.error,'cal-feed-err'));const again=E('button','Riprova','cal-btn');again.type='button';again.onclick=()=>{feed.ws=null;render(box)};box.append(again);return}
 if(!feed.url){box.append(E('p','Preparo il tuo link…','cal-empty'));return}
 const row=E('div',undefined,'cal-feed-row');const input=E('input');input.type='text';input.readOnly=true;input.value=feed.url;input.setAttribute('aria-label','Link del calendario da abbonare');input.spellcheck=false;
 input.addEventListener('focus',()=>input.select());
 const btn=E('button','Copia link','cal-feed-copy');btn.type='button';const note=E('p','','cal-feed-note');note.setAttribute('aria-live','polite');
 btn.onclick=async()=>{const ok=await copy(feed.url,input);note.textContent=ok?'Link copiato: incollalo in Outlook o in Google Calendar.':'Copia non riuscita: seleziona il link e copialo a mano.'};
 row.append(input,btn);box.append(row,note);
 const steps=E('div',undefined,'cal-feed-steps');
 const o=E('section');o.append(E('h4','Outlook / Microsoft 365'));const ol=E('ol');
 for(const s of ['Apri il Calendario di Outlook (web o nuovo Outlook).','Aggiungi calendario › Da Internet (in alcune versioni «Sottoscrivi dal web»).','Incolla il link, dai un nome, ad esempio «RADIX CRM», e conferma.'])ol.append(E('li',s));o.append(ol);
 const g=E('section');g.append(E('h4','Google Calendar'));const gl=E('ol');
 for(const s of ['Apri Google Calendar dal computer.','Accanto ad «Altri calendari» premi + › Da URL.','Incolla il link e premi «Aggiungi calendario».'])gl.append(E('li',s));g.append(gl);
 steps.append(o,g);box.append(steps);
 box.append(E('p','Google rilegge i calendari abbonati ogni qualche ora (non subito); Outlook di solito entro un’ora. Il link è personale: chi lo possiede vede i tuoi appuntamenti, non condividerlo.','cal-feed-warn'));
}
function render(box){const ws=window.RadixCrmData?.workspace();if(!ws){box.replaceChildren(E('h3','Calendario da abbonare'),E('p','Scegli un workspace.','cal-empty'));return}
 fillFeed(box);if(feed.ws!==ws||(!feed.url&&!feed.error&&!feed.pending))loadFeed(ws).then(()=>{if(box.isConnected)fillFeed(box)});}
let feedEl=null;
function feedBox(){const ws=window.RadixCrmData?.workspace();if(feedEl&&ws&&feedEl.dataset.ws===ws&&feed.ws===ws&&(feed.url||feed.pending))return feedEl;const box=E('section',undefined,'cal-card cal-feed');if(ws)box.dataset.ws=ws;feedEl=box;render(box);return box}

/* ---------- Deep link from a feed event: ?ws=…&contatto=… opens the contact's Customer360 ---------- */
(function deepLink(){
 const q=new URLSearchParams(location.search),id=q.get('contatto'),ws=q.get('ws');if(!UUID.test(id||''))return;
 let tries=0,switched=false;
 const done=()=>{clearInterval(t);const u=new URL(location.href);u.searchParams.delete('contatto');u.searchParams.delete('ws');history.replaceState(null,'',u.pathname+(u.search||'')+u.hash)};
 const t=setInterval(()=>{const a=window.RadixSalesApp;if(++tries>80)return done();if(!a||!a.state.ready||a.state.busy)return;
  if(UUID.test(ws||'')&&a.state.workspace!==ws){if(switched||!a.state.workspaces.some(w=>w.id===ws))return done();
   const sel=document.getElementById('workspace');if(!sel)return done();switched=true;sel.value=ws;sel.dispatchEvent(new Event('change'));return}
  const row=(a.rows('contacts')||[]).find(r=>r.id===id)||{id,name:'Contatto'};done();a.openCustomer('contacts',row)},250);
})();

/* ---------- «Calendari esterni»: the person's own links ---------- */
const src={ws:null,rows:null,error:'',pending:null,busy:new Map(),busyPending:new Map(),busyError:'',note:''};
const changed=()=>{try{document.dispatchEvent(new CustomEvent('radix-calendars-changed'))}catch{}};
function resetSources(ws){src.ws=ws;src.rows=null;src.error='';src.pending=null;src.busy.clear();src.busyPending.clear();src.busyError=''}
function loadSources(ws,force){
 if(src.ws!==ws||force)resetSources(ws);
 if(src.rows||src.pending)return src.pending||Promise.resolve(src.rows);
 src.pending=get({entity:'calendar_sources',workspace:ws,offset:'0'}).then(d=>{if(src.ws===ws)src.rows=d.rows||[]}).catch(e=>{if(src.ws===ws){src.error=e.message;src.rows=[]}}).finally(()=>{if(src.ws===ws)src.pending=null});
 return src.pending;
}
const STEPS={
 outlook:['Apri Outlook sul web (outlook.office.com o outlook.live.com) › Impostazioni (⚙) › Calendario › Calendari condivisi.','In «Pubblica un calendario» scegli il calendario e «Può visualizzare quando sono occupato» (o tutti i dettagli), poi Pubblica.','Copia il link ICS (finisce con .ics, non quello HTML) e incollalo qui.'],
 google:['Apri Google Calendar dal computer › Impostazioni (⚙).','In «Impostazioni per i miei calendari» scegli il calendario › Integra calendario.','Copia l’«Indirizzo segreto in formato iCal» (finisce con basic.ics) e incollalo qui.']};
const PROVIDERS={outlook:'Outlook lavoro',google:'Google personale'};
const when=iso=>{if(!iso)return '';const d=new Date(iso);if(!Number.isFinite(+d))return '';return d.toLocaleString('it-IT',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})};
function sourceItem(box,ws,r){
 const li=E('li');const head=E('div',undefined,'cal-src-head');head.append(E('b',r.label),E('span',r.host+' · link salvato','cal-src-host'));li.append(head);
 li.append(r.status==='error'?E('p',r.last_error||'Calendario non leggibile.','cal-src-err'):E('p',r.status==='ok'?'Letto '+when(r.last_fetched_at):'Non ancora letto: premi «Aggiorna».','cal-src-ok'));
 const row=E('div',undefined,'cal-src-actions');
 const lab=E('label',undefined,'cal-check');const cb=E('input');cb.type='checkbox';cb.checked=!!r.show_details;lab.append(cb,document.createTextNode('Mostra i titoli'));
 cb.onchange=async()=>{cb.disabled=true;try{await post(ws,'calendar_sources','update',{id:r.id,show_details:cb.checked});await loadSources(ws,true);changed()}catch(e){src.note=e.message}fillSources(box)};
 const ref=E('button','Aggiorna','cal-link');ref.type='button';ref.onclick=async()=>{ref.disabled=true;ref.textContent='Leggo…';try{const d=await post(ws,'calendar_sources','refresh',{id:r.id});await loadSources(ws,true);changed();if(d.events!=null)src.note=r.label+': '+d.events+' eventi letti.'}catch(e){src.note=e.message}fillSources(box)};
 const del=E('button','Rimuovi','cal-link cal-src-del');del.type='button';del.onclick=async()=>{if(!confirm('Rimuovere «'+r.label+'»? Il link salvato viene cancellato; il calendario in Outlook o Google non cambia.'))return;del.disabled=true;try{await post(ws,'calendar_sources','delete',{id:r.id});await loadSources(ws,true);changed()}catch(e){src.note=e.message}fillSources(box)};
 row.append(lab,ref,del);li.append(row);return li;
}
function addForm(box,ws){
 const d=E('details',undefined,'cal-src-add');if(src.rows&&!src.rows.length)d.open=true;d.append(E('summary','Aggiungi un calendario'));
 const f=E('form');f.noValidate=true;
 const kind=E('select');kind.append(new Option('Outlook / Microsoft 365','outlook'),new Option('Google Calendar','google'));
 const kl=E('label','Calendario');kl.append(kind);
 const name=E('input');name.maxLength=60;name.value=PROVIDERS.outlook;const nl=E('label','Nome');nl.append(name);
 const url=E('input');url.type='url';url.autocomplete='off';url.spellcheck=false;const ul=E('label','Link ICS segreto');ul.append(url);
 const det=E('label',undefined,'cal-check');const dc=E('input');dc.type='checkbox';det.append(dc,document.createTextNode('Mostra i titoli degli impegni (solo a te)'));
 const steps=E('ol',undefined,'cal-src-steps');
 const paint=()=>{steps.replaceChildren(...STEPS[kind.value].map(t=>E('li',t)));url.placeholder=kind.value==='google'?'https://calendar.google.com/calendar/ical/…/basic.ics':'https://outlook.office365.com/owa/calendar/…/calendar.ics'};paint();
 kind.onchange=()=>{if(Object.values(PROVIDERS).includes(name.value))name.value=PROVIDERS[kind.value];paint()};
 const err=E('p','','cal-src-err');err.hidden=true;err.setAttribute('role','alert');
 const save=E('button','Salva','cal-feed-copy');save.type='submit';
 f.append(kl,nl,steps,ul,det,err,save);
 f.onsubmit=async ev=>{ev.preventDefault();err.hidden=true;save.disabled=true;
  try{await post(ws,'calendar_sources','add',{label:name.value,url:url.value,show_details:dc.checked});url.value='';await loadSources(ws,true);src.note='Calendario salvato: lo leggo adesso.';changed();fillSources(box)}
  catch(e){err.textContent=e.message;err.hidden=false;save.disabled=false}};
 d.append(f);return d;
}
function hoursText(v){return 'Lunedì–venerdì'+(v.weekdays.includes(6)?' e sabato':'')+', '+v.start+'–'+v.end+', slot di '+v.slot+' minuti. Salvato in questo browser.'}
function hoursForm(){
 const h=workHours();const box=E('details',undefined,'cal-src-hours');box.append(E('summary','Orario di lavoro per gli slot liberi'));
 const row=E('div',undefined,'cal-src-hrow');
 const a=E('input');a.type='time';a.value=h.start;a.step=1800;const al=E('label','Dalle');al.append(a);
 const b=E('input');b.type='time';b.value=h.end;b.step=1800;const bl=E('label','Alle');bl.append(b);
 const len=E('select');for(const m of [30,60])len.append(new Option(m+' minuti',String(m)));len.value=String(h.slot);const ll=E('label','Durata');ll.append(len);
 const buf=E('select');for(const m of [0,10,15,30])buf.append(new Option(m?m+' min':'nessuno',String(m)));buf.value=String(h.buffer);const fl=E('label','Margine');fl.append(buf);
 const sat=E('label',undefined,'cal-check');const sc=E('input');sc.type='checkbox';sc.checked=h.weekdays.includes(6);sat.append(sc,document.createTextNode('Anche il sabato'));
 const note=E('p',hoursText(h),'cal-empty');
 const save=()=>{const v={start:a.value||'09:00',end:b.value||'18:00',slot:Number(len.value)||30,buffer:Number(buf.value)||0,weekdays:sc.checked?[1,2,3,4,5,6]:[1,2,3,4,5]};
  if(v.end<=v.start){note.textContent='L’orario di fine deve venire dopo l’inizio.';return}setWorkHours(v);note.textContent=hoursText(v)};
 for(const x of [a,b,len,buf,sc])x.onchange=save;row.append(al,bl,ll,fl);box.append(row,sat,note);return box;
}
function fillSources(box){
 const ws=src.ws;box.replaceChildren(E('h3','Calendari esterni'),E('p','Collega Outlook e Google: qui vedi quando sei occupato e trovi gli slot liberi in «Registra chiamata» e nella scheda (Chiamata, Evento, Attività). Il link resta cifrato sul server e lo vedi solo tu.','cal-empty'));
 if(src.note){const n=E('p',src.note,'cal-feed-note');n.setAttribute('aria-live','polite');box.append(n);src.note=''}
 if(!src.rows){box.append(E('p','Carico i tuoi calendari…','cal-empty'));return}
 if(src.error)box.append(E('p',src.error,'cal-src-err'));
 if(src.rows.length){const ul=E('ul',undefined,'cal-src-list');for(const r of src.rows)ul.append(sourceItem(box,ws,r));box.append(ul)}
 if(!src.error&&src.rows.length<5)box.append(addForm(box,ws));
 box.append(hoursForm());
}
// The same element across renders of the Calendario page, so a half-typed link or an open form survives a redraw.
let srcEl=null;
function sourcesBox(){
 const ws=window.RadixCrmData?.workspace();if(srcEl&&ws&&srcEl.dataset.ws===ws&&src.ws===ws)return srcEl;
 const box=E('section',undefined,'cal-card cal-src');if(ws)box.dataset.ws=ws;srcEl=box;
 if(!ws){box.append(E('h3','Calendari esterni'),E('p','Scegli un workspace.','cal-empty'));return box}
 if(src.ws!==ws)resetSources(ws);fillSources(box);
 if(!src.rows)loadSources(ws).then(()=>{if(box.isConnected)fillSources(box)});
 return box;
}

/* ---------- Busy time from the external links ---------- */
const BUSY_TTL=5*60e3;
const isoZ=ms=>new Date(ms).toISOString().replace(/\.\d{3}Z$/,'Z');
// Rows for [from,to) if already read (else null); starts the read once and announces it with «radix-calendars-changed».
function ensureBusy(from,to){
 const ws=window.RadixCrmData?.workspace();if(!ws)return null;if(src.ws!==ws)resetSources(ws);
 const key=from+'|'+to,hit=src.busy.get(key);if(hit&&Date.now()-hit.at<BUSY_TTL)return hit.rows;
 if(!src.busyPending.has(key))src.busyPending.set(key,get({entity:'calendar_busy',workspace:ws,from:isoZ(from),to:isoZ(to)})
  .then(d=>{if(src.ws!==ws)return [];src.busy.set(key,{at:Date.now(),rows:d.rows||[]});src.busyError='';return d.rows||[]})
  .catch(e=>{if(src.ws===ws){src.busy.set(key,{at:Date.now(),rows:[]});src.busyError=e.message}return []})
  .finally(()=>{src.busyPending.delete(key);if(src.ws===ws)changed()}));
 return hit?hit.rows:null;
}
function busyFor(from,to){const now=ensureBusy(from,to);if(now)return Promise.resolve(now);return src.busyPending.get(from+'|'+to)||Promise.resolve([])}
// Busy rows → events of calendar-view.js (type «busy»). An all-day busy block spans whole local days.
function busyEvents(from,to){
 const rows=ensureBusy(from,to)||[];const names=new Map((src.rows||[]).map(r=>[r.id,r.label]));
 const out=[];
 for(const b of rows){const from=names.get(b.source)||'Calendario esterno',title=b.summary||from,sub=b.summary?from:'';
  if(b.allDay){for(let t=b.start;t<b.end;t+=864e5){const d=new Date(t+36e5*3);d.setHours(0,0,0,0);out.push({type:'busy',title,sub,start:d,allDay:true,owner:'',href:'#calendar'})}}
  else out.push({type:'busy',title,sub,start:new Date(b.start),end:new Date(b.end),owner:'',href:'#calendar'})}
 return out;
}

/* ---------- Working hours and free slots ---------- */
const HOURS_KEY='radix-crm-orario-lavoro';
const DEFAULT_HOURS=Object.freeze({start:'09:00',end:'18:00',slot:30,buffer:0,weekdays:Object.freeze([1,2,3,4,5])});
function workHours(){
 let v=null;try{v=JSON.parse(localStorage.getItem(HOURS_KEY)||'null')}catch{v=null}
 const ok=x=>typeof x==='string'&&/^\d{2}:\d{2}$/.test(x);
 if(!v||!ok(v.start)||!ok(v.end)||v.end<=v.start)return {...DEFAULT_HOURS,weekdays:[...DEFAULT_HOURS.weekdays]};
 return {start:v.start,end:v.end,slot:[30,60].includes(v.slot)?v.slot:30,buffer:[0,10,15,30].includes(v.buffer)?v.buffer:0,
  weekdays:Array.isArray(v.weekdays)&&v.weekdays.length&&v.weekdays.every(d=>Number.isInteger(d)&&d>=0&&d<=6)?v.weekdays:[1,2,3,4,5]};
}
function setWorkHours(v){try{localStorage.setItem(HOURS_KEY,JSON.stringify(v))}catch{}}
// Slots are in ora italiana (Europe/Rome, RadixFreeBusy.DEFAULT_ZONE = RadixCrmDates.ZONE) whatever the browser's zone:
// working hours, labels and the value handed to onPick, like the date fields they fill.
const slotValue=(fb,ms)=>{const w=fb.wall(ms,fb.DEFAULT_ZONE);return String(w.y).padStart(4,'0')+'-'+pad(w.m)+'-'+pad(w.d)+'T'+pad(w.h)+':'+pad(w.mi)};
const DAYS=['dom','lun','mar','mer','gio','ven','sab'];
const slotLabel=(fb,ms)=>{const w=fb.wall(ms,fb.DEFAULT_ZONE);return DAYS[w.wd]+' '+w.d+'/'+w.m+' · '+pad(w.h)+':'+pad(w.mi)};
/* «Slot liberi» for the call dialog and the record forms: the next free slots in working hours, from the external calendars and the CRM.
   onPick(value) gets the 'YYYY-MM-DDTHH:mm' of an <input type=datetime-local> in ora italiana (read back with RadixCrmDates.fromInput). */
function slotPicker({onPick}){
 const box=E('div',undefined,'cs-slots');const head=E('div',undefined,'cs-slots-head');head.append(E('b','Slot liberi'));
 const h=workHours();let len=h.slot;const modes=E('div',undefined,'cs-slots-len');modes.setAttribute('role','group');modes.setAttribute('aria-label','Durata dello slot');
 const list=E('div',undefined,'cs-slots-list');const note=E('p','','cs-slots-note');
 const btns=[30,60].map(m=>{const b=E('button',m+' min');b.type='button';b.setAttribute('aria-pressed',String(m===len));b.onclick=()=>{len=m;btns.forEach(x=>x.setAttribute('aria-pressed',String(x===b)));draw()};modes.append(b);return b});
 head.append(modes);box.append(head,list,note);
 let busy=null,crm=[];
 function draw(){const fb=FB();list.replaceChildren();if(!fb){note.textContent='Slot non disponibili.';return}
  if(!busy){list.append(E('span','Cerco gli slot liberi…','cs-slots-wait'));return}
  const slots=fb.freeSlots({busy:fb.merge(busy,crm),zone:fb.DEFAULT_ZONE,now:Date.now()+15*6e4,days:14,slot:len,buffer:h.buffer,hours:{start:h.start,end:h.end},weekdays:h.weekdays,limit:8,perDay:3,step:30});
  if(!slots.length)list.append(E('span','Nessuno slot libero nei prossimi 14 giorni nell’orario di lavoro.','cs-slots-wait'));
  for(const s of slots){const b=E('button',slotLabel(fb,s.start));b.type='button';b.setAttribute('aria-pressed','false');b.onclick=()=>{list.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed','false'));b.setAttribute('aria-pressed','true');onPick(slotValue(fb,s.start))};list.append(b)}}
 (async()=>{
  // The window starts on a 5-minute grid, so the pickers drawn again by the record page (every tab switch and
  // every render of Customer360) reuse the busy time already read instead of asking the server each time.
  const from=Math.floor(Date.now()/BUSY_TTL)*BUSY_TTL,to=from+14*864e5,ws=window.RadixCrmData?.workspace();
  const [ext,data]=await Promise.all([ws?busyFor(from,to):Promise.resolve([]),Promise.resolve(window.RadixCrmData?.load()).catch(()=>null)]);
  if(ws&&!src.rows)await loadSources(ws).catch(()=>{});
  const me=window.RadixSalesApp?.state?.me;busy=ext||[];crm=data&&FB()?FB().crmBusy(data,{me:Number.isInteger(me)&&me>0?me:null,from,to}):[];
  const n=(src.rows||[]).length;
  note.textContent=src.busyError?'Calendari esterni non letti ('+src.busyError+'): gli slot tengono conto solo del CRM.':n?'Esclusi gli impegni del CRM e di '+n+(n===1?' calendario esterno':' calendari esterni')+' · '+h.start+'–'+h.end+'.':'Solo gli impegni del CRM: collega Outlook e Google in Calendario › Calendari esterni.';
  draw()})();
 draw();return box;
}

window.RadixCrmCalendars={feedBox,sourcesBox,ensureBusy,busyFor,busyEvents,slotPicker,workHours,setWorkHours,post};
})();
