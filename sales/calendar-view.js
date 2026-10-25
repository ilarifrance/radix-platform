'use strict';
/* Calendario CRM: settimana / giorno / mese, as in the CRM "Calendario" mockup.
   Events come from CRM rows only (crm-data.js): tasks by due date,
   interactions by date and kind, opportunity closings as all-day items.
   «Occupato» blocks come from the person's own Outlook / Google links (crm-calendars.js, «Calendari esterni»).
   The rail offers «Calendario da abbonare» (the CRM appointments as a feed for Outlook / Google), «Calendari esterni»
   and a one-off .ics export. */
(()=>{
const content=document.getElementById('content'),nav=document.getElementById('navigation');if(!content||!nav)return;
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n};
const DAY=864e5,H0=8,H1=22,ROW=56;
const DN=globalThis.RadixI18n&&RadixI18n.en?['Mon','Tue','Wed','Thu','Fri','Sat','Sun']:['Lun','Mar','Mer','Gio','Ven','Sab','Dom'],MN=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const TYPES={meeting:['Riunione','teal'],call:['Call','blue'],task:['Attività','purple'],email:['Email','gold'],note:['Nota','orange'],close:['Chiusura prevista','red'],busy:['Occupato','gray']};
const mid=d=>{const x=new Date(d);x.setHours(0,0,0,0);return x};
const monday=d=>{const x=mid(d);x.setDate(x.getDate()-((x.getDay()+6)%7));return x};
const same=(a,b)=>mid(a).getTime()===mid(b).getTime();
const hm=d=>d.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
const state={mode:'week',cursor:mid(new Date()),off:new Set(),owner:''};

function ensureNav(){if(nav.querySelector('a[href="#calendar"]'))return;const a=E('a','Calendario');a.href='#calendar';const after=nav.querySelector('a[href="#tasks"]');after?after.after(a):nav.append(a)}
function ensureSection(){let s=document.getElementById('calendar');if(s&&s.parentNode===content)return s;s=E('section',undefined,'panel cal-section');s.id='calendar';const row=E('div',undefined,'row');row.append(E('h2','Calendario'));s.append(row);content.append(s);return s}

// Every CRM event, unfiltered; also read by the «Oggi» view (crm-today.js) for today's agenda.
function collect(d){const out=[],company=id=>d.companies.find(c=>c.id===id)?.name||'',ownerOf=r=>String(r.assignee_id??r.owner_id??'');
  for(const t of d.tasks){if(!t.due_at)continue;const s=new Date(t.due_at);if(!Number.isFinite(+s))continue;out.push({type:'task',title:t.title,sub:company(t.company_id),start:s,end:new Date(+s+60*6e4),done:t.status==='done',owner:ownerOf(t),href:'#tasks'})}
  for(const i of d.interactions){if(!i.occurred_at)continue;const s=new Date(i.occurred_at);if(!Number.isFinite(+s))continue;const k=TYPES[i.kind]?i.kind:'note';out.push({type:k,id:i.id,title:i.title,sub:company(i.company_id),start:s,end:new Date(+s+30*6e4),owner:'',href:'#interactions'})}
  for(const o of d.opportunities){if(!o.expected_close)continue;const s=new Date(o.expected_close+'T00:00:00');if(!Number.isFinite(+s))continue;out.push({type:'close',title:o.title,sub:company(o.company_id),start:s,allDay:true,owner:String(o.owner_id??''),href:'#opportunities'})}
  return out.sort((a,b)=>a.start-b.start)}
// Busy time of the person's own Outlook / Google links (crm-calendars.js), for the 6 weeks of the month grid around the cursor.
function busyRange(){const first=new Date(state.cursor.getFullYear(),state.cursor.getMonth(),1),s=monday(first);return [+s,+s+42*DAY+3600e3]}
function external(){const C=window.RadixCrmCalendars;if(!C)return [];const me=String(window.RadixSalesApp?.state?.me??'');if(state.owner&&state.owner!==me)return [];const [a,b]=busyRange();return C.busyEvents(a,b)}
function events(d){return [...collect(d),...external()].sort((a,b)=>a.start-b.start).filter(e=>!state.off.has(e.type)&&(e.type==='busy'||!state.owner||e.owner===state.owner))}
window.RadixCrmCalendar={events:collect,TYPES};

function mini(){const box=E('section',undefined,'cal-card cal-mini');const c=state.cursor,first=new Date(c.getFullYear(),c.getMonth(),1);
  const head=E('div',undefined,'cal-mini-head');const prev=E('button','‹');prev.type='button';prev.setAttribute('aria-label','Mese precedente');prev.onclick=()=>{state.cursor=new Date(c.getFullYear(),c.getMonth()-1,1);render()};
  const next=E('button','›');next.type='button';next.setAttribute('aria-label','Mese successivo');next.onclick=()=>{state.cursor=new Date(c.getFullYear(),c.getMonth()+1,1);render()};head.append(prev,E('b',MN[c.getMonth()]+' '+c.getFullYear()),next);box.append(head);
  const g=E('div',undefined,'cal-mini-grid');for(const n of DN)g.append(E('span',n[0],'dow'));const start=monday(first),wk=monday(c);
  for(let i=0;i<42;i++){const day=new Date(+start+i*DAY+3600e3);const b=E('button',day.getDate());b.type='button';if(day.getMonth()!==c.getMonth())b.className='out';if(same(day,new Date()))b.classList.add('today');if(state.mode!=='month'&&+monday(day)===+wk)b.classList.add('week');if(same(day,c))b.classList.add('sel');b.onclick=()=>{state.cursor=mid(day);render()};g.append(b)}
  box.append(g);const today=E('button','Oggi','cal-today');today.type='button';today.onclick=()=>{state.cursor=mid(new Date());render()};box.append(today);return box}

function filters(d){const box=E('section',undefined,'cal-card cal-filters');const h=E('div',undefined,'cal-filter-head');h.append(E('h3','Filtri'));const z=E('button','Azzera','cal-link');z.type='button';z.onclick=()=>{state.off.clear();state.owner='';render()};h.append(z);box.append(h);
  const lab=E('label','Responsabile');const sel=E('select');sel.append(new Option('Tutti',''));for(const m of d.members)sel.append(new Option(m.name,String(m.id)));sel.value=state.owner;sel.onchange=()=>{state.owner=sel.value;render()};lab.append(sel);box.append(lab);
  box.append(E('h4','Tipo'));for(const [k,[name,tone]] of Object.entries(TYPES)){const l=E('label',undefined,'cal-check');const i=E('input');i.type='checkbox';i.checked=!state.off.has(k);i.onchange=()=>{i.checked?state.off.delete(k):state.off.add(k);render()};l.append(i,E('span',undefined,'dot '+tone),document.createTextNode(name));box.append(l)}
  return box}

function chip(e,compact){const a=E('a',undefined,'cal-ev '+TYPES[e.type][1]+(e.done?' done':''));a.href=e.href;a.title=(e.allDay?'':hm(e.start)+' – '+hm(e.end)+' · ')+e.title+(e.sub?' · '+e.sub:'');
  if(!e.allDay&&!compact)a.append(E('small',hm(e.start)+' – '+hm(e.end)));a.append(E('em',TYPES[e.type][0]),E('b',e.title));if(e.sub&&!compact)a.append(E('span',e.sub));return a}

function grid(list){const days=state.mode==='day'?[state.cursor]:[...Array(7)].map((_,i)=>new Date(+monday(state.cursor)+i*DAY+3600e3));
  const wrap=E('div',undefined,'cal-week'+(state.mode==='day'?' one':''));wrap.style.setProperty('--cols',days.length);
  const head=E('div',undefined,'cal-row cal-days');head.append(E('span'));for(const d of days){const c=E('div',undefined,'cal-dayhead'+(same(d,new Date())?' today':''));c.append(E('small',DN[(d.getDay()+6)%7].toUpperCase()),E('b',d.getDate()));head.append(c)}wrap.append(head);
  const all=E('div',undefined,'cal-row cal-allday');all.append(E('span','Tutto il giorno','cal-hour'));for(const d of days){const c=E('div',undefined,'cal-cell'+(same(d,new Date())?' today':''));for(const e of list.filter(e=>e.allDay&&same(e.start,d)))c.append(chip(e,true));all.append(c)}wrap.append(all);
  const body=E('div',undefined,'cal-body');const hours=E('div',undefined,'cal-hours');for(let h=H0;h<H1;h++)hours.append(E('span',String(h).padStart(2,'0')+':00','cal-hour'));body.append(hours);
  for(const d of days){const col=E('div',undefined,'cal-col'+(same(d,new Date())?' today':''));const evs=list.filter(e=>!e.allDay&&same(e.start,d));const lanes=[];
    for(const e of evs){let lane=lanes.findIndex(end=>end<=+e.start);if(lane<0){lane=lanes.length;lanes.push(0)}lanes[lane]=+e.end;e.lane=lane}
    for(const e of evs){const top=Math.max(0,(e.start.getHours()+e.start.getMinutes()/60-H0))*ROW,h=Math.max(.75,(e.end-e.start)/36e5)*ROW;const n=lanes.length,c=chip(e);c.style.top=Math.min(top,(H1-H0-.75)*ROW)+'px';c.style.height=(h-4)+'px';c.style.left=`calc(${e.lane*100/n}% + 3px)`;c.style.width=`calc(${100/n}% - 6px)`;
      if(e.start.getHours()<H0||e.start.getHours()>=H1)c.classList.add('offhours');col.append(c)}
    if(same(d,new Date())){const now=new Date(),y=(now.getHours()+now.getMinutes()/60-H0)*ROW;if(y>0&&y<(H1-H0)*ROW){const l=E('i',undefined,'cal-now');l.style.top=y+'px';col.append(l)}}
    body.append(col)}
  wrap.append(body);return wrap}

function month(list){const c=state.cursor,first=new Date(c.getFullYear(),c.getMonth(),1),start=monday(first);const g=E('div',undefined,'cal-month');for(const n of DN)g.append(E('span',n,'dow'));
  for(let i=0;i<42;i++){const d=new Date(+start+i*DAY+3600e3);const cell=E('div',undefined,'cal-mcell'+(d.getMonth()!==c.getMonth()?' out':'')+(same(d,new Date())?' today':''));cell.append(E('b',d.getDate()));const evs=list.filter(e=>same(e.start,d));evs.slice(0,3).forEach(e=>cell.append(chip(e,true)));if(evs.length>3)cell.append(E('small','+'+(evs.length-3)+' altri'));g.append(cell)}
  return g}

function rail(d,all){const r=E('aside',undefined,'cal-rail');const t=E('section',undefined,'cal-card');const now=new Date();t.append(E('h3','Oggi'),E('p',now.toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'}),'cal-sub'));
  const today=all.filter(e=>same(e.start,now));if(!today.length)t.append(E('p','Niente in agenda oggi.','cal-empty'));
  for(const e of today.slice(0,5)){const row=E('a',undefined,'cal-agenda');row.href=e.href;row.append(E('time',e.allDay?'Tutto il giorno':hm(e.start)));const x=E('div');x.append(E('b',TYPES[e.type][0],TYPES[e.type][1]),E('span',e.title));row.append(x);t.append(row)}
  r.append(t);const nx=all.find(e=>!e.allDay&&e.type!=='busy'&&+e.start>Date.now()&&!e.done);const n=E('section',undefined,'cal-card cal-next');n.append(E('h3','Prossimo impegno'));
  if(nx){const mins=Math.round((nx.start-Date.now())/6e4);n.append(E('p',(mins<60?'Tra '+mins+' min':mins<1440?'Tra '+Math.round(mins/60)+' ore':nx.start.toLocaleDateString('it-IT',{day:'numeric',month:'short'})+' alle '+hm(nx.start))+': '+nx.title+(nx.sub?' con '+nx.sub:'')));const a=E('a','Apri','cal-btn');a.href=nx.href;n.append(a)}else n.append(E('p','Nessun impegno in programma.','cal-empty'));
  r.append(n);if(window.RadixCrmCalendars)r.append(window.RadixCrmCalendars.feedBox(),window.RadixCrmCalendars.sourcesBox());const s=E('section',undefined,'cal-card cal-sync');s.append(E('h3','Esporta una copia'),E('p','Un file .ics con gli impegni di oggi in poi, da importare una volta sola. Per averli sempre aggiornati usa «Calendario da abbonare».','cal-empty'));
  const ics=window.RadixCrmIcs;if(ics){const b=E('button','Esporta per Google / Outlook (.ics)','cal-btn cal-ics');b.type='button';const note=E('p','','cal-empty cal-ics-note');note.setAttribute('aria-live','polite');
   b.onclick=()=>{const f=ics.build(d,{owner:state.owner,base:location.origin+location.pathname});if(!f.count){note.textContent='Nessun impegno da esportare'+(state.owner?' per questo responsabile.':'.');return}
    const a=E('a');a.href=URL.createObjectURL(new Blob([f.text],{type:'text/calendar;charset=utf-8'}));a.download='radix-crm-'+new Date().toISOString().slice(0,10)+'.ics';document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);
    note.textContent=f.count+' impegni esportati. Importa il file in Google Calendar (Impostazioni › Importa) o in Outlook (Aggiungi calendario › Carica da file); reimportarlo aggiorna gli stessi eventi.'};
   s.append(b,note)}
  r.append(s);return r}

let busy=false;
async function render(){ensureNav();if((location.hash||'')!=='#calendar'){document.getElementById('calendar')?.remove();return}
  const sec=ensureSection();content.querySelectorAll(':scope>section.rx-view').forEach(s=>{if(s!==sec)s.classList.remove('rx-view')});sec.classList.add('rx-view');document.documentElement.classList.add('rx-has-view');
  const d=await window.RadixCrmData?.load();if(!d||!sec.isConnected)return;busy=true;sec.querySelector(':scope>.cal')?.remove();
  const all=events(d);const root=E('div',undefined,'cal');const left=E('div',undefined,'cal-left');left.append(mini(),filters(d));
  const main=E('section',undefined,'cal-card cal-main');const bar=E('div',undefined,'cal-bar');const step=state.mode==='month'?null:state.mode==='day'?1:7;
  const prev=E('button','‹');prev.type='button';prev.setAttribute('aria-label','Precedente');prev.onclick=()=>{const c=state.cursor;state.cursor=step?new Date(+c-step*DAY):new Date(c.getFullYear(),c.getMonth()-1,1);render()};
  const next=E('button','›');next.type='button';next.setAttribute('aria-label','Successivo');next.onclick=()=>{const c=state.cursor;state.cursor=step?new Date(+c+step*DAY+3600e3):new Date(c.getFullYear(),c.getMonth()+1,1);state.cursor=mid(state.cursor);render()};
  const today=E('button','Oggi');today.type='button';today.onclick=()=>{state.cursor=mid(new Date());render()};
  const mon=monday(state.cursor),sun=new Date(+mon+6*DAY);const title=state.mode==='month'?MN[state.cursor.getMonth()]+' '+state.cursor.getFullYear():state.mode==='day'?state.cursor.toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long',year:'numeric'}):mon.getDate()+(mon.getMonth()!==sun.getMonth()?' '+MN[mon.getMonth()]:'')+' – '+sun.getDate()+' '+MN[sun.getMonth()]+' '+sun.getFullYear();
  const modes=E('div',undefined,'cal-modes');for(const [k,l] of [['day','Giorno'],['week','Settimana'],['month','Mese']]){const b=E('button',l);b.type='button';b.setAttribute('aria-pressed',String(state.mode===k));b.onclick=()=>{state.mode=k;render()};modes.append(b)}
  bar.append(prev,today,next,E('h3',title),modes);main.append(bar,state.mode==='month'?month(all):grid(all));
  const legend=E('div',undefined,'cal-legend');for(const [name,tone] of Object.values(TYPES))legend.append(E('span',name,'dot '+tone));main.append(legend);
  root.append(left,main,rail(d,all));sec.append(root);
  const body=sec.querySelector('.cal-body');if(body&&state.mode!=='month'&&!sec.dataset.scrolled){sec.dataset.scrolled='1'}
  requestAnimationFrame(()=>{busy=false;if(!sec.isConnected)later()})}
let q=false;const later=()=>{if(busy||q)return;q=true;setTimeout(()=>{q=false;render()},60)};
new MutationObserver(m=>{if(m.some(r=>(r.type==='attributes'&&r.target.parentElement===content)||![...r.addedNodes,...r.removedNodes].every(n=>n.nodeType===1&&/\b(pv|cx|tv|cal)\b/.test(n.className||''))))later()}).observe(content,{childList:true});
new MutationObserver(later).observe(nav,{childList:true});
addEventListener('hashchange',later);document.addEventListener('radix-calendars-changed',later);later();
})();
