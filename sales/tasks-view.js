'use strict';
/* Le mie attività: tabs, KPI, "La mia giornata" timeline, richiami suggeriti,
   attività in scadenza and the full list, as in the CRM "Attività" mockup.
   Read-only data from crm-data.js; completing a task reuses the status
   control that sales.js renders on the task card, so writes stay in sales.js.
   The original kanban stays one click away. */
(()=>{
const content=document.getElementById('content');if(!content)return;
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n};
// Open/won/lost: one rule for every CRM view, RadixCrmForecast.isOpen (analytics-view.js).
const isOpen=o=>window.RadixCrmForecast.isOpen(o);
// Days and hours in ora italiana (RadixCrmDates), like the due dates they come from.
const DAY=864e5,t0=()=>window.RadixCrmDates.dayStart(Date.now());
const dd=v=>{if(v==null||v==='')return null;const d=new Date(v);return Number.isFinite(d.getTime())?d:null};
const hm=d=>window.RadixCrmDates.hm(+d);
const rel=d=>{const D=window.RadixCrmDates,n=Math.round((Date.parse(D.dayOf(+d)+'T00:00:00Z')-Date.parse(D.dayOf(Date.now())+'T00:00:00Z'))/DAY);return n===0?'Oggi':n===-1?'Ieri':n<0?(-n)+' giorni fa':n===1?'Domani':d.toLocaleDateString('it-IT',{day:'2-digit',month:'short',timeZone:'Europe/Rome'})};
const PRI={high:['Alta','alta'],medium:['Media','media'],low:['Bassa','bassa']};
const STATUS={todo:'Da svolgere',doing:'In corso',done:'Completata'};
const initials=t=>String(t||'').trim().split(/\s+/).slice(0,2).map(w=>w[0]?.toUpperCase()||'').join('');
const TABS=[['today','Oggi'],['week','Questa settimana'],['due','In scadenza'],['nodate','Senza data'],['done','Completate']];
const state={tab:'today',kanban:false};

function groups(d){const now=t0(),open=d.tasks.filter(t=>t.status!=='done');
  const inRange=(t,a,b)=>{const x=dd(t.due_at);return x&&+x>=a&&+x<b};
  const end=window.RadixCrmDates.dayEnd(Date.now());
  return{open,today:open.filter(t=>inRange(t,now,end)),week:open.filter(t=>inRange(t,now,now+7*DAY)),due:open.filter(t=>{const x=dd(t.due_at);return x&&+x<end}).sort((a,b)=>String(a.due_at).localeCompare(String(b.due_at))),
    nodate:open.filter(t=>!t.due_at),done:d.tasks.filter(t=>t.status==='done')}}
window.RadixCrmTasksView={groups,rel,dd,recall,rail};
const company=(d,id)=>d.companies.find(c=>c.id===id)?.name||'';
const member=(d,id)=>d.members.find(m=>String(m.id)===String(id))?.name||'Non assegnata';

function complete(task){const card=[...document.querySelectorAll('#tasks .board article.card')].find(c=>(n=>globalThis.RadixI18n?RadixI18n.source(n):(n?n.textContent:''))(c.querySelector('h3')).trim()===task.title);
  const sel=card?.querySelector('select');const btn=sel&&[...card.querySelectorAll('button')].find(b=>/Conferma stato/.test((n=>globalThis.RadixI18n?RadixI18n.source(n):(n?n.textContent:''))(b)));
  if(!sel||!btn||btn.disabled)return false;sel.value='done';sel.dispatchEvent(new Event('change',{bubbles:true}));btn.click();window.RadixCrmData?.reset();return true}

function kpis(d,g){const row=E('div',undefined,'tv-kpis');const all=d.tasks.length,done=g.done.length,pct=all?Math.round(done/all*100):0;
  const card=(ico,label,value,sub,bar,tone)=>{const c=E('article',undefined,'tv-kpi'+(tone?' '+tone:''));c.append(E('span',undefined,'tv-ico '+ico));const b=E('div');b.append(E('small',label),E('strong',value));if(sub)b.append(E('span',sub,'tv-sub'));c.append(b);
    if(bar!==undefined){const p=E('div',undefined,'tv-progress');p.append(E('b',bar+'%'));const tr=E('span');const i=E('i');i.style.width=bar+'%';tr.append(i);p.append(tr);c.append(p)}row.append(c)};
  card('ok','Completate',done+' / '+all,null,pct);
  const next=[...g.open].filter(t=>t.due_at&&+dd(t.due_at)>=Date.now()).sort((a,b)=>String(a.due_at).localeCompare(String(b.due_at)))[0];
  card('cal','Prossima attività',next?hm(dd(next.due_at)):'—',next?next.title+' · '+rel(dd(next.due_at)):'Nessuna in programma');
  card('target','Questa settimana',g.week.length,'attività aperte nei prossimi 7 giorni');
  card('warn','In scadenza',g.due.length,g.due.length?'scadute o entro oggi':'Tutto in regola',undefined,g.due.length?'warn':'');
  return row}

function day(d,g){const p=E('section',undefined,'tv-panel tv-day');const h=E('div',undefined,'tv-head');h.append(E('h3','La mia giornata'));p.append(h);
  let list=g.today.length?g.today:[...g.open].filter(t=>t.due_at).sort((a,b)=>String(a.due_at).localeCompare(String(b.due_at))).slice(0,7);
  if(!g.today.length&&list.length)p.append(E('p','Oggi non hai attività in programma: ecco le prossime.','tv-note'));
  list=[...list].sort((a,b)=>String(a.due_at).localeCompare(String(b.due_at)));
  const ol=E('ol',undefined,'tv-timeline');const now=Date.now();let marked=false;
  for(const t of list){const x=dd(t.due_at);const li=E('li');const cur=!marked&&x&&+x>=now;if(cur){li.className='now';marked=true}
    li.append(E('time',x?hm(x):'—'));const box=E('div',undefined,'tv-slot');const chk=E('button',undefined,'tv-check');chk.type='button';chk.title='Segna come completata';chk.setAttribute('aria-label','Segna come completata: '+t.title);chk.addEventListener('click',()=>{if(!complete(t))chk.title='Non disponibile: verifica i permessi o premi Aggiorna'});
    const tx=E('div');tx.append(E('b',t.title),E('small',[x&&+x<t0()?'Scaduta '+rel(x).toLowerCase():x?rel(x):'',PRI[t.priority]?PRI[t.priority][0]+' priorità':''].filter(Boolean).join(' · ')));box.append(chk,tx);
    const c=company(d,t.company_id);if(c)box.append(E('span',c,'tv-tag'));li.append(box);ol.append(li)}
  if(!list.length)ol.append(E('li','Nessuna attività aperta con una data.','tv-empty'));p.append(ol);
  const a=E('a','Visualizza calendario completo','tv-foot');a.href='/radix-sales.html#calendar';p.append(a);return p}

function recall(d){const p=E('section',undefined,'tv-panel tv-recall');const h=E('div',undefined,'tv-head');h.append(E('h3','Da richiamare'));p.append(h);
  p.append(E('p','Contatti con un’opportunità aperta e senza attività aperte, dal contatto meno recente. Regola fissa, non AI.','tv-note'));
  const last=c=>d.interactions.filter(i=>i.contact_id===c.id).map(i=>i.occurred_at).sort().at(-1)||'';
  const rows=d.contacts.filter(c=>d.opportunities.some(o=>o.contact_id===c.id&&isOpen(o))&&!d.tasks.some(t=>t.contact_id===c.id&&t.status!=='done')).sort((a,b)=>last(a).localeCompare(last(b))).slice(0,3);
  if(!rows.length)p.append(E('p','Nessun contatto da richiamare: ogni trattativa ha un’attività aperta.','tv-empty'));
  for(const c of rows){const o=d.opportunities.find(x=>x.contact_id===c.id&&isOpen(x));const r=E('div',undefined,'tv-recall-row');const av=E('span',initials(c.name),'tv-av');av.setAttribute('aria-hidden','true');
    const tx=E('div');const l=last(c);tx.append(E('b',c.name),E('small',l?'Ultimo contatto '+rel(dd(l)).toLowerCase():'Nessuna interazione registrata'),E('small','Deal: '+o.title+' · '+new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(Number(o.amount_cents||0)/100),'tv-deal'));
    const a=E('a','Apri contatto','tv-btn');a.href='#contacts';r.append(av,tx,a);p.append(r)}
  return p}

function table(d,title,rows,opts){const p=E('section',undefined,'tv-panel tv-table'+(opts.warn?' warn':''));const h=E('div',undefined,'tv-head');const ht=E('h3',title);if(opts.warn)ht.prepend(E('span','⚠','tv-warn-ico'));h.append(ht);h.append(E('span',rows.length,'tv-count'));p.append(h);
  if(!rows.length){p.append(E('p',opts.empty,'tv-empty'));return p}
  const t=E('table');const th=E('thead'),hr=E('tr');['Attività','Relativa a','Scadenza','Priorità','Assegnata a','Stato'].forEach(x=>hr.append(E('th',x)));th.append(hr);t.append(th);const tb=E('tbody');
  for(const r of rows.slice(0,opts.limit||50)){const tr=E('tr');const x=dd(r.due_at);const late=x&&+x<t0()&&r.status!=='done';
    const a=E('td');a.append(E('span',late?'⚠':'○','tv-dot'+(late?' late':'')),document.createTextNode(r.title));
    const pr=E('td');if(PRI[r.priority])pr.append(E('span',PRI[r.priority][0],'tv-pri '+PRI[r.priority][1]));else pr.textContent='—';
    const who=E('td');const av=E('span',initials(member(d,r.assignee_id)),'tv-av sm');av.setAttribute('aria-hidden','true');who.append(av,document.createTextNode(member(d,r.assignee_id)));
    const st=E('td');st.append(E('span',STATUS[r.status]||r.status,'tv-status '+(r.status||'')));
    // A row opens the task editor (the same one as «Modifica» in the kanban), when the role can write.
    const app=window.RadixSalesApp,rec=app?.rows('tasks').find(x=>x.id===r.id);
    if(rec&&app.writable('tasks')){tr.classList.add('tv-open');tr.tabIndex=0;tr.title='Apri l’attività';tr.addEventListener('click',()=>app.edit('tasks',rec));tr.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();app.edit('tasks',rec)}})}
    tr.append(a,E('td',company(d,r.company_id)||'—'),E('td',x?rel(x)+(hm(x)!=='00:00'?' · '+hm(x):''):'Senza data',late?'late':''),pr,who,st);tb.append(tr)}
  t.append(tb);p.append(t);return p}

function rail(d,g){const r=E('aside',undefined,'tv-rail');const h=E('div',undefined,'tv-rail-head');h.append(E('span','✦','tv-spark'),E('h3','Briefing del giorno'));r.append(h);
  const high=g.today.filter(t=>t.priority==='high').length;const atRisk=d.opportunities.filter(o=>{if(!isOpen(o))return false;const x=dd(o.expected_close);return x&&+x<t0()+14*DAY&&!g.open.some(t=>t.opportunity_id===o.id)}).length;
  const pipe=d.opportunities.filter(isOpen).reduce((s,o)=>s+Number(o.amount_cents||0),0);
  [['bulb',`Hai ${g.today.length} attività oggi, ${high} ad alta priorità`],['cal',`${g.due.length} attività scadute o in scadenza oggi`],['chart','Pipeline nel CRM: '+new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(pipe/100)],['clock',`${atRisk} trattative chiudono entro 14 giorni senza attività`]].forEach(([i,t])=>{const b=E('p',undefined,'tv-brief');b.append(E('span',undefined,'tv-ico '+i),E('span',t));r.append(b)});
  r.append(E('p','Numeri calcolati dai dati del CRM.','tv-note'));
  const q=E('div',undefined,'tv-quick');q.append(E('h4','Azioni rapide'));
  [['Nuova attività',()=>[...document.querySelectorAll('#tasks>.row button.primary')][0]?.click()],['Prepara email in Lead Intelligence','/lead-intelligence.html#email-studio'],['Apri il Copilota commerciale in Sales Orbit','/sales-orbit-higgsfield.html']].forEach(([t,a])=>{const el=typeof a==='string'?E('a',t):E('button',t);if(typeof a==='string')el.href=a;else{el.type='button';el.addEventListener('click',a)}q.append(el)});
  r.append(q);return r}

let busy=false;
async function render(){const sec=document.getElementById('tasks');if(!sec||!sec.classList.contains('rx-view')){document.documentElement.classList.remove('tv-on');return}
  const d=await window.RadixCrmData?.load();if(!d||!sec.isConnected)return;if(!window.RadixCrmForecast){later();return}const g=groups(d);
  busy=true;sec.querySelector(':scope>.tv')?.remove();
  const root=E('div',undefined,'tv');const main=E('div',undefined,'tv-main');
  const tabs=E('div',undefined,'tv-tabs');tabs.setAttribute('role','tablist');
  for(const [k,label] of TABS){const b=E('button',undefined,k==='due'?'due':'');b.type='button';b.setAttribute('role','tab');b.setAttribute('aria-selected',String(state.tab===k&&!state.kanban));b.append(document.createTextNode(label),E('span',g[k].length,'tv-badge'));b.addEventListener('click',()=>{state.tab=k;state.kanban=false;render()});tabs.append(b)}
  const kb=E('button','Vista kanban','tv-kanban');kb.type='button';kb.setAttribute('aria-pressed',String(state.kanban));kb.addEventListener('click',()=>{state.kanban=!state.kanban;render()});tabs.append(kb);
  main.append(tabs);
  if(!state.kanban){main.append(kpis(d,g));const two=E('div',undefined,'tv-two');two.append(day(d,g),recall(d));main.append(two);
    if(state.tab!=='due')main.append(table(d,'In scadenza',g.due,{warn:true,empty:'Nessuna attività scaduta o in scadenza oggi.'}));
    const label=TABS.find(x=>x[0]===state.tab)[1];main.append(table(d,state.tab==='done'?'Attività completate':'Attività · '+label.toLowerCase(),g[state.tab],{warn:state.tab==='due',empty:'Nessuna attività in questa vista.'}))}
  root.append(main,rail(d,g));
  const anchor=sec.querySelector(':scope>.row');anchor?anchor.after(root):sec.prepend(root);
  document.documentElement.classList.toggle('tv-on',true);document.documentElement.classList.toggle('tv-kanban',state.kanban);requestAnimationFrame(()=>{busy=false;if(!sec.isConnected)later()})}
let q=false;const later=()=>{if(busy||q)return;q=true;setTimeout(()=>{q=false;render()},60)};
new MutationObserver(m=>{if(m.some(r=>(r.type==='attributes'&&r.target.parentElement===content)||![...r.addedNodes,...r.removedNodes].every(n=>n.nodeType===1&&/\b(pv|cx|tv)\b/.test(n.className||''))))later()}).observe(content,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
addEventListener('hashchange',later);later();
})();
