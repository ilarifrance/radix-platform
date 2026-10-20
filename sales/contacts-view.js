'use strict';
/* Contatti · Workspace: table + contact sheet + relationship map, as in the
   CRM "Contatti" mockup. Read-only view over /api/sales (same endpoint and
   workspace as sales.js). Edit, delete and Customer360 reuse the buttons that
   sales.js renders on each contact card, so every write still goes through
   sales.js. Only fields the CRM really stores are shown: no invented role or
   e-mail. The score is crm-score-core.js (CRM data only, explained by its parts). */
(()=>{
const content=document.getElementById('content'),wsSelect=document.getElementById('workspace');if(!content||!wsSelect)return;
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n};
const initials=t=>String(t||'').trim().split(/\s+/).filter(w=>/^[\p{L}\p{N}]/u.test(w)).slice(0,2).map(w=>w[0].toUpperCase()).join('');
const money=c=>new Intl.NumberFormat('it-IT',{maximumFractionDigits:0}).format(Number(c||0)/100);
const day=v=>{if(!v)return'';const d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleDateString('it-IT',{day:'2-digit',month:'short'}):''};
const ago=v=>{const d=new Date(v);if(!Number.isFinite(d.getTime()))return'';const n=Math.round((Date.now()-d)/864e5);return n<=0?'oggi':n===1?'ieri':n+' g fa'};
const KIND={email:'Email',call:'Call',meeting:'Meeting',note:'Nota',linkedin:'LinkedIn'};
const state={selected:null};

const scoreOf=(d,c)=>window.RadixCrmScore?window.RadixCrmScore.score(c,{interactions:d.interactions,opportunities:d.opportunities,stages:d.stages}):null;
function badge(s){const b=E('span',undefined,'cx-score crm-score-'+s.band);b.dataset.score=String(s.total);b.title=window.RadixCrmScore.explain(s);b.append(E('b',s.total),E('small',s.band));return b}
const load=()=>window.RadixCrmData?window.RadixCrmData.load():Promise.resolve(null);

function facts(d,c){const company=d.companies.find(x=>x.id===c.company_id);
  const inter=d.interactions.filter(i=>i.contact_id===c.id).sort((a,b)=>String(b.occurred_at).localeCompare(String(a.occurred_at)));
  const open=d.tasks.filter(t=>t.contact_id===c.id&&t.status!=='done').sort((a,b)=>String(a.due_at||'9999').localeCompare(String(b.due_at||'9999')));
  const opps=d.opportunities.filter(o=>o.contact_id===c.id);const stage=id=>d.stages.find(s=>s.id===id)?.title||'';
  const peers=d.contacts.filter(x=>x.id!==c.id&&x.company_id&&x.company_id===c.company_id);
  return{company,inter,open,opps,stage,peers}}

function avatar(name,size){const a=E('span',initials(name),'cx-avatar');if(size)a.classList.add(size);a.setAttribute('aria-hidden','true');return a}

function table(d,cards){const wrap=E('div','', 'cx-table');wrap.setAttribute('role','table');wrap.setAttribute('aria-label','Contatti');
  const head=E('div',undefined,'cx-row cx-head');head.setAttribute('role','row');['Contatto','Punteggio','Azienda','Ultimo contatto','Prossimo passo'].forEach(t=>{const c=E('span',t);c.setAttribute('role','columnheader');head.append(c)});wrap.append(head);
  for(const {contact,card} of cards){const f=facts(d,contact);const row=E('button',undefined,'cx-row');row.type='button';row.setAttribute('role','row');row.dataset.id=contact.id;if(state.selected===contact.id)row.setAttribute('aria-current','true');
    const who=E('span',undefined,'cx-who');who.append(avatar(contact.name),E('b',contact.name));
    const comp=E('span',f.company?.name||'—','cx-company');const s=scoreOf(d,contact),score=s?badge(s):E('small','—','cx-score');
    const last=E('span',undefined,'cx-last');if(f.inter[0]){last.append(E('b',ago(f.inter[0].occurred_at)),E('small',KIND[f.inter[0].kind]||f.inter[0].kind||''))}else last.append(E('small','Nessuna interazione'));
    const next=E('span',undefined,'cx-next');if(f.open[0]){next.append(E('b',f.open[0].title));const due=E('small',day(f.open[0].due_at)||'senza scadenza');if(f.open[0].due_at&&new Date(f.open[0].due_at)<new Date())due.className='late';next.append(due)}else next.append(E('small','Nessuna attività aperta'));
    [who,score,comp,last,next].forEach(c=>{c.setAttribute('role','cell');row.append(c)});
    row.addEventListener('click',()=>{state.selected=contact.id;render()});wrap.append(row)}
  return wrap}

function map(d,c,f){const box=E('section',undefined,'cx-panel cx-map');box.append(E('h3','Mappa delle relazioni'));
  const people=f.peers.slice(0,6);if(!people.length){box.append(E('p','Nessun altro contatto della stessa azienda nel CRM.','cx-empty'));return box}
  box.append(E('p','Contatti della stessa azienda'+(f.company?' · '+f.company.name:''),'cx-sub'));
  const stage=E('div',undefined,'cx-map-stage');const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');stage.append(svg);
  const place=(name,x,y,cls,sub)=>{const n=E('div',undefined,'cx-node '+(cls||''));n.style.left=x+'%';n.style.top=y+'%';n.append(avatar(name,cls==='me'?'lg':''),E('b',name));if(sub)n.append(E('small',sub));stage.append(n)};
  place(c.name,50,66,'me','Contatto selezionato');
  people.forEach((p,i)=>{const a=Math.PI+(i+1)*Math.PI/(people.length+1),x=50+Math.cos(a)*36,y=66+Math.sin(a)*46;
    const shared=d.opportunities.some(o=>o.contact_id===p.id&&f.opps.some(m=>m.id===o.id))||d.tasks.some(t=>t.contact_id===p.id&&t.opportunity_id&&f.opps.some(m=>m.id===t.opportunity_id));
    const l=document.createElementNS(ns,'line');l.setAttribute('x1','50');l.setAttribute('y1','66');l.setAttribute('x2',String(x));l.setAttribute('y2',String(y));l.setAttribute('class',shared?'strong':'weak');svg.append(l);
    const btn=E('button',undefined,'cx-node');btn.type='button';btn.style.left=x+'%';btn.style.top=y+'%';btn.append(avatar(p.name),E('b',p.name));btn.addEventListener('click',()=>{state.selected=p.id;render()});stage.append(btn)});
  box.append(stage);const legend=E('p',undefined,'cx-legend');legend.append(E('span','Stessa trattativa','strong'),E('span','Stessa azienda','weak'));box.append(legend);return box}

function sheet(d,c,card){const f=facts(d,c);const s=E('div',undefined,'cx-detail');
  const top=E('section',undefined,'cx-panel cx-profile');const id=E('div',undefined,'cx-id');id.append(avatar(c.name,'xl'));
  const txt=E('div');if(f.opps.length)txt.append(E('span','Trattativa aperta','cx-chip'));txt.append(E('h2',c.name),E('p',f.company?.name||'Azienda non collegata','cx-sub'));
  const sc=scoreOf(d,c);if(sc){const r=E('p',undefined,'cx-score-line');r.append(badge(sc),E('span',window.RadixCrmScore.explain(sc)));txt.append(r)}
  const tags=E('div',undefined,'cx-tags');tags.append(E('span',f.opps.length+' opportunità'),E('span',f.open.length+' attività aperte'),E('span',f.inter.length+' interazioni'));txt.append(tags);id.append(txt);top.append(id);
  const acts=E('div',undefined,'cx-actions');for(const b of card.querySelectorAll('button')){const label=b.textContent.trim();if(!/^(Customer360|Messaggio LinkedIn|Modifica|Elimina|Esporta dati \(GDPR\)|Anonimizza \(GDPR\))$/.test(label))continue;const x=E('button',label,/^(Elimina|Anonimizza)/.test(label)?'danger':label==='Customer360'?'primary':'');x.type='button';x.disabled=b.disabled;x.addEventListener('click',()=>b.click());acts.append(x)}top.append(acts);s.append(top);
  const grid=E('div',undefined,'cx-grid');
  const act=E('section',undefined,'cx-panel');act.append(E('h3','Attività recenti'));const ul=E('ul',undefined,'cx-timeline');
  if(!f.inter.length)ul.append(E('li','Nessuna interazione registrata.','cx-empty'));for(const i of f.inter.slice(0,4)){const li=E('li');li.append(E('b',(KIND[i.kind]||i.kind||'Interazione')+' · '+i.title),E('small',day(i.occurred_at)));ul.append(li)}act.append(ul);
  const deals=E('section',undefined,'cx-panel');deals.append(E('h3','Deal collegati'));if(!f.opps.length)deals.append(E('p','Nessuna opportunità collegata.','cx-empty'));
  for(const o of f.opps.slice(0,4)){const r=E('div',undefined,'cx-deal');const t=E('div');t.append(E('b',o.title),E('small',money(o.amount_cents)+' · '+(f.stage(o.stage_id)||'fase non impostata')));r.append(t);if(o.expected_close)r.append(E('span',day(o.expected_close),'cx-pill'));deals.append(r)}
  const nxt=E('section',undefined,'cx-panel');nxt.append(E('h3','Prossimi passi'));if(!f.open.length)nxt.append(E('p','Nessuna attività aperta.','cx-empty'));
  for(const t of f.open.slice(0,4)){const r=E('div',undefined,'cx-deal');const x=E('div');x.append(E('b',t.title),E('small',(t.priority?'Priorità '+t.priority+' · ':'')+(day(t.due_at)||'senza scadenza')));r.append(x);nxt.append(r)}
  grid.append(act,deals,nxt,map(d,c,f));s.append(grid);return s}

let busy=false;
async function render(){const section=document.getElementById('contacts');if(!section||!section.classList.contains('rx-view')){document.documentElement.classList.remove('cx-on');return}
  const d=await load();if(!d||!section.isConnected)return;
  const cards=[...section.querySelectorAll(':scope>article.card')].map(card=>{const name=card.querySelector('h3')?.textContent.trim();const comp=(card.querySelector('p.muted')?.textContent||'').replace(/^Azienda:\s*/,'').trim();
    const contact=d.contacts.find(c=>c.name===name&&(!comp||d.companies.find(x=>x.id===c.company_id)?.name===comp))||d.contacts.find(c=>c.name===name);return contact?{contact,card}:null}).filter(Boolean);
  if(window.RadixCrmScore)cards.sort((a,b)=>scoreOf(d,b.contact).total-scoreOf(d,a.contact).total);
  busy=true;section.querySelector(':scope>.cx')?.remove();
  if(!cards.length){busy=false;document.documentElement.classList.remove('cx-on');return}
  if(!cards.some(x=>x.contact.id===state.selected))state.selected=cards[0].contact.id;
  const sel=cards.find(x=>x.contact.id===state.selected);
  const root=E('div',undefined,'cx');root.append(table(d,cards),sheet(d,sel.contact,sel.card));
  const after=section.querySelector(':scope>p.muted')||section.querySelector(':scope>form');after?after.after(root):section.append(root);
  document.documentElement.classList.add('cx-on');requestAnimationFrame(()=>{busy=false;if(!section.isConnected)later()})}

let q=false;const later=()=>{if(busy||q)return;q=true;setTimeout(()=>{q=false;render()},60)};
// Changes inside the list view (crm-list.js, class lv) are not ours to redraw.
new MutationObserver(m=>{if(m.some(r=>(r.type==='attributes'&&r.target.parentElement===content)||(!r.target.closest?.('.lv')&&![...r.addedNodes,...r.removedNodes].every(n=>n.nodeType===1&&(n.classList?.contains('cx')||n.classList?.contains('lv'))))))later()}).observe(content,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
wsSelect.addEventListener('change',()=>{state.selected=null});
addEventListener('hashchange',later);later();
})();
