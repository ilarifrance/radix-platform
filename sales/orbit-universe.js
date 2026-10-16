'use strict';
/* Sales Orbit «Il tuo universo commerciale» (sales-orbit-mockup-pianeti.png): the RADIX core with the five CRM areas
   in orbit, the four KPI tiles with their bars, the list view and the Copilota rail. Everything is counted from the rows
   crm-data.js loads (first 100 per entity: a full page is shown as «100+»). Nothing is estimated:
   - Opportunità attive: outcome «open» when the CRM records it, otherwise a stage not named vinto/perso/won/lost.
   - Attività in scadenza: open tasks due within 7 days, overdue included.
   - Copertura clienti: companies with at least one interaction in the last 90 days, over all companies.
   - A rischio (same rule as the CRM Panoramica): expected close passed (Alto), or within 14 days with no open task (Medio).
   - Azioni suggerite: a fixed rule, not AI. Contacts with no interaction in the last 21 days, those with an active opportunity first. */
(()=>{
const stage=document.getElementById('so-universe');if(!stage||!window.RadixCrmData)return;
const $=id=>document.getElementById(id),DAY=864e5;
const H=(t,c,x)=>{const n=document.createElement(t);if(c)n.className=c;if(x!=null)n.textContent=x;return n};
const NS='http://www.w3.org/2000/svg',S=(t,a)=>{const n=document.createElementNS(NS,t);for(const k in a)n.setAttribute(k,a[k]);return n};
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
const it=n=>new Intl.NumberFormat('it-IT',{maximumFractionDigits:0}).format(n);
const eur=c=>{const v=c/100;return '€ '+(v>=1e6?new Intl.NumberFormat('it-IT',{maximumFractionDigits:1}).format(v/1e6)+'M':v>=1e4?new Intl.NumberFormat('it-IT',{maximumFractionDigits:0}).format(v/1e3)+'k':it(v))};
const OPEN=t=>!['done','completed','closed'].includes(String(t.status||'').toLowerCase());
const CLOSED=/vint|won|pers|lost/i;
/* outcome (open/won/lost) when the CRM has it, otherwise the stage name */
const isOpen=(o,stages)=>o.outcome?o.outcome==='open':!CLOSED.test((stages.get(o.stage_id)||{}).title||'');
const t0=()=>{const d=new Date();d.setHours(0,0,0,0);return d};
const day=v=>{const d=new Date(v);return Number.isFinite(+d)?d:null};
const total=(rows,partial)=>rows.length>=100&&partial?'100+':it(rows.length);

/* ---- greeting and date ---- */
const now=new Date(),h=now.getHours();
$('so-date').textContent=now.toLocaleDateString('it-IT',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
const hello=h<13?'Buongiorno':h<18?'Buon pomeriggio':'Buonasera';$('so-hello').textContent=hello;
fetch('/api/auth/me',{credentials:'same-origin'}).then(r=>r.ok?r.json():null).then(me=>{const n=me&&me.user&&me.user.name;if(n)$('so-hello').textContent=hello+', '+String(n).split(' ')[0]}).catch(()=>{});

/* ---- Vista Universo / Vista Lista ---- */
const list=$('so-list');
document.querySelectorAll('.so-toggle [data-view]').forEach(b=>b.addEventListener('click',()=>{const lst=b.dataset.view==='list';
  stage.hidden=lst;list.hidden=!lst;document.querySelectorAll('.so-toggle [data-view]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));if(!lst)size()}));

/* ---- Chiedi a RADIX AI opens the assistant box ---- */
const ask=$('so-ask'),assist=$('so-assist');
ask?.addEventListener('click',()=>{const open=assist.hidden;assist.hidden=!open;ask.setAttribute('aria-expanded',String(open));if(open)$('command')?.focus()});

/* ---- the model ---- */
function model(d){
  const today=t0(),stages=new Map((d.stages||[]).map(s=>[s.id,s])),opps=d.opportunities||[],tasks=d.tasks||[],inter=d.interactions||[];
  const companies=new Map((d.companies||[]).map(c=>[c.id,c])),contacts=new Map((d.contacts||[]).map(c=>[c.id,c]));
  const active=opps.filter(o=>isOpen(o,stages));
  const open=tasks.filter(OPEN);
  const due=open.filter(t=>{const x=day(t.due_at);return x&&x-today<8*DAY});
  const overdue=open.filter(t=>{const x=day(t.due_at);return x&&x<today});
  const year=inter.filter(i=>{const x=day(i.occurred_at);return x&&x.getFullYear()===today.getFullYear()});
  const lastBy=key=>{const m=new Map();for(const i of inter){const id=i[key],x=day(i.occurred_at);if(!id||!x)continue;if(!m.has(id)||m.get(id)<x)m.set(id,x)}return m};
  const lastCompany=lastBy('company_id'),lastContact=lastBy('contact_id');
  for(const i of inter){const c=i.contact_id&&contacts.get(i.contact_id),x=day(i.occurred_at);if(c&&c.company_id&&x&&(!lastCompany.has(c.company_id)||lastCompany.get(c.company_id)<x))lastCompany.set(c.company_id,x)}
  const covered=[...companies.keys()].filter(id=>{const x=lastCompany.get(id);return x&&today-x<=90*DAY}).length;
  const who=r=>(companies.get(r.company_id)||{}).name||(contacts.get(r.contact_id)||{}).name||'';
  const risk=active.map(o=>{const c=day(o.expected_close);if(!c)return null;const days=Math.round((c-today)/DAY);
      if(days<0)return{o,level:'Alto',why:'Chiusura prevista superata il '+c.toLocaleDateString('it-IT')};
      if(days<=14&&!open.some(t=>t.opportunity_id===o.id))return{o,level:'Medio',why:(days?'Chiude tra '+days+(days===1?' giorno':' giorni'):'Chiude oggi')+', nessuna attività aperta'};return null})
    .filter(Boolean).sort((a,b)=>(a.level===b.level?num(b.o.amount_cents)-num(a.o.amount_cents):a.level==='Alto'?-1:1));
  const withOpp=new Set(active.map(o=>o.contact_id).filter(Boolean));
  const actions=[...contacts.values()].map(c=>{const x=lastContact.get(c.id);const gap=x?Math.floor((today-x)/DAY):null;return gap!==null&&gap<=21?null:{c,gap,hot:withOpp.has(c.id)}})
    .filter(Boolean).sort((a,b)=>(b.hot-a.hot)||((b.gap??1e9)-(a.gap??1e9)));
  const prio=open.filter(t=>{const x=day(t.due_at);return x&&x<new Date(+today+DAY)}).sort((a,b)=>String(a.due_at).localeCompare(String(b.due_at)));
  return{d,stages,companies,contacts,opps,active,open,due,overdue,year,covered,risk,actions,prio,who,inter}}

/* ---- months / weeks for the bars ---- */
function months(back){const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-(back?5:0));const out=[];for(let i=0;i<6;i++){out.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'));d.setMonth(d.getMonth()+1)}return out}
function byMonth(rows,key,val,back){const ks=months(back),m=new Map(ks.map(k=>[k,0]));for(const r of rows){const k=String(r[key]||'').slice(0,7);if(m.has(k))m.set(k,m.get(k)+val(r))}return ks.map(k=>m.get(k))}
function weeks(rows){const today=t0(),out=[0,0,0,0,0,0];for(const r of rows){const x=day(r.due_at);if(!x)continue;out[Math.max(0,Math.min(5,Math.floor((x-today)/(7*DAY))+1))]++}return out}
function bars(values,title){const w=70,hh=30,max=Math.max(1,...values),bw=w/values.length;
  const svg=S('svg',{class:'so-bars',viewBox:`0 0 ${w} ${hh}`,role:'img','aria-label':title});const t=S('title',{});t.textContent=title;svg.append(t);
  values.forEach((v,i)=>{const bh=v?Math.max(3,v/max*(hh-2)):2;svg.append(S('rect',{x:i*bw+bw*.18,y:hh-bh,width:bw*.64,height:bh,rx:1.5,class:v?'on':'off'}))});return svg}
function kpi(k,value,note,values,title){const a=document.querySelector(`.stats article[data-k="${k}"]`);if(!a)return;a.querySelector('strong').textContent=value;a.querySelector('span').textContent=note;
  a.querySelector('.so-bars')?.remove();if(values)a.append(bars(values,title))}

/* ---- rail rows ---- */
const ICON={task:'M8 2v3M16 2v3M3 9h18M5 5h14v15H5z',opp:'M12 3v18M16 7H10a3 3 0 000 6h4a3 3 0 010 6H7',person:'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21c0-4 3-6 7-6s7 2 7 6M17 11a3 3 0 100-6M22 20c0-3-2-5-5-5'};
function row(href,icon,title,sub,end,pill){const a=H('a','so-row');a.href=href;const i=H('i'),sv=S('svg',{viewBox:'0 0 24 24','aria-hidden':'true'});sv.append(S('path',{d:ICON[icon]}));i.append(sv);
  const t=H('span');t.append(H('b','',title),H('small','',sub));a.append(i,t);const e=H('em');if(pill){const p=H('mark','so-pill so-'+pill.toLowerCase(),pill);e.append(p)}if(end)e.append(H('span','',end));a.append(e);return a}
function fill(id,nId,items,empty){const r=$(id);r.replaceChildren(...items.slice(0,id==='priorities'?4:3));if(!items.length)r.append(H('p','so-muted',empty));$(nId).textContent=items.length}
function when(t){const x=day(t.due_at),today=t0();if(x<today)return 'Scaduta '+x.toLocaleDateString('it-IT',{day:'numeric',month:'short'});
  const hm=x.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});return hm==='00:00'?'Oggi':'Oggi, '+hm}

/* ---- planets, callouts, list ---- */
function planet(k,line){const p=stage.querySelector(`.so-planet[data-k="${k}"] small`);if(p)p.textContent=line}
function listView(m){list.replaceChildren();const head=H('div','so-list-head');head.append(H('h2','','Il CRM in lista'),H('p','so-muted','Le cinque aree e le opportunità attive, come nell’universo.'));list.append(head);
  const g=H('div','so-list-grid');
  [['companies','Aziende',total(m.d.companies,m.d.partial),m.covered+' con interazioni negli ultimi 90 giorni','/radix-sales.html#companies'],
   ['contacts','Contatti',total(m.d.contacts,m.d.partial),m.actions.length+' senza interazioni da più di 21 giorni','/radix-sales.html#contacts'],
   ['opportunities','Opportunità attive',it(m.active.length),total(m.opps,m.d.partial)+' registrate · '+m.risk.length+' a rischio','/sales-pipeline-premium.html'],
   ['tasks','Attività in scadenza',it(m.due.length),it(m.open.length)+' aperte · '+m.overdue.length+' scadute','/radix-sales.html#tasks'],
   ['interactions','Interazioni quest’anno',it(m.year.length),total(m.inter,m.d.partial)+' registrate in tutto','/radix-sales.html#interactions']]
   .forEach(([k,label,n,sub,href])=>{const a=H('a','so-list-card');a.dataset.k=k;a.href=href;a.append(H('i'),H('b','',label),H('strong','',n),H('small','',sub));g.append(a)});list.append(g);
  const tbl=H('table','so-table'),cap=H('caption','','Opportunità attive');tbl.append(cap);const th=H('tr');['Opportunità','Azienda','Fase','Valore','Chiusura prevista'].forEach(x=>th.append(H('th','',x)));const thead=H('thead');thead.append(th);tbl.append(thead);
  const tb=H('tbody');m.active.slice().sort((a,b)=>String(a.expected_close||'9').localeCompare(String(b.expected_close||'9'))).slice(0,12).forEach(o=>{const tr=H('tr');const c=day(o.expected_close);
    [o.title||'Opportunità',m.who(o)||'—',(m.stages.get(o.stage_id)||{}).title||'—',eur(num(o.amount_cents)),c?c.toLocaleDateString('it-IT'):'—'].forEach(x=>tr.append(H('td','',x)));tb.append(tr)});
  if(!m.active.length){const tr=H('tr'),td=H('td','so-muted','Nessuna opportunità attiva.');td.colSpan=5;tr.append(td);tb.append(tr)}
  tbl.append(tb);const wrap=H('div','so-table-wrap');wrap.append(tbl);list.append(wrap)}

function render(d){if(!d)return;const m=model(d),P=d.partial;
  planet('companies',total(d.companies,P)+' totali');planet('contacts',total(d.contacts,P)+' totali');planet('opportunities',it(m.active.length)+' attive');
  planet('tasks',it(m.due.length)+' in scadenza');planet('interactions',it(m.year.length)+' quest’anno');
  $('so-callout-a').textContent=m.companies.size?m.covered+' aziende su '+m.companies.size+' con interazioni negli ultimi 90 giorni.':'Nessuna azienda nel workspace.';
  $('so-callout-b').textContent=P?'Prime 100 righe per area: alcuni totali sono parziali.':'Dati, relazioni e opportunità del workspace, letti ora.';
  const value=m.active.reduce((s,o)=>s+num(o.amount_cents),0);
  kpi('active',it(m.active.length),'su '+total(m.opps,P)+' registrate',byMonth(m.active,'expected_close',()=>1),'Opportunità attive per mese di chiusura prevista, prossimi 6 mesi');
  kpi('value',m.active.length?eur(value):'—','valuta non indicata',byMonth(m.active,'expected_close',o=>num(o.amount_cents)),'Valore per mese di chiusura prevista, prossimi 6 mesi');
  kpi('due',it(m.due.length),m.overdue.length?m.overdue.length+' già scadute':'nei prossimi 7 giorni',weeks(m.open),'Attività aperte per settimana di scadenza: scadute, questa settimana e le 4 successive');
  kpi('coverage',m.companies.size?Math.round(m.covered/m.companies.size*100)+'%':'—','sentite negli ultimi 90 giorni',byMonth(m.inter,'occurred_at',()=>1,true),'Interazioni registrate per mese, ultimi 6 mesi');
  fill('priorities','so-prio-n',m.prio.map(t=>row('/radix-sales.html#tasks','task',t.title||'Attività',m.who(t)||(m.opps.find(o=>o.id===t.opportunity_id)||{}).title||'Attività CRM',when(t))),'Nessuna attività in scadenza oggi.');
  fill('so-risk','so-risk-n',m.risk.map(r=>row('/sales-pipeline-premium.html','opp',m.who(r.o)||r.o.title||'Opportunità',r.why,eur(num(r.o.amount_cents)),r.level)),'Nessuna opportunità a rischio secondo la regola.');
  fill('so-actions','so-act-n',m.actions.map(a=>row('/radix-sales.html#contacts','person','Ricontatta '+(a.c.name||'contatto'),(a.gap===null?'Nessuna interazione registrata':'Nessun contatto da '+a.gap+' giorni')+(a.hot?' · opportunità attiva':''),'')),'Tutti i contatti sentiti negli ultimi 21 giorni.');
  listView(m);requestAnimationFrame(size)}
function load(){RadixCrmData.load().then(render)}
let tries=0;const wait=setInterval(()=>{if($('workspace')?.value&&!$('workspace').disabled){clearInterval(wait);load()}else if(++tries>60)clearInterval(wait)},250);
$('workspace')?.addEventListener('change',()=>setTimeout(load,0));
document.addEventListener('radix:crm-error',e=>{clearInterval(wait);const msg=String(e.detail||'CRM non disponibile');
  stage.querySelectorAll('.so-planet small').forEach(s=>s.textContent='—');$('so-callout-a').textContent=msg;
  for(const id of ['priorities','so-risk','so-actions'])$(id).replaceChildren(H('p','so-muted',msg))});

/* ---- the sky: stars, the horizon, links from the core to each planet, the RADIX earth with its orbits ---- */
const cv=stage.querySelector('.so-sky'),ctx=cv&&cv.getContext&&cv.getContext('2d');if(!ctx)return;
const reduce=matchMedia('(prefers-reduced-motion: reduce)');let W=0,Ht=0,dpr=1,stars=[];
function size(){const r=cv.getBoundingClientRect();if(!r.width)return;dpr=Math.min(2,devicePixelRatio||1);W=r.width;Ht=r.height;cv.width=Math.round(W*dpr);cv.height=Math.round(Ht*dpr);
  let s=7;const rnd=()=>{s=(s*16807)%2147483647;return s/2147483647};stars=Array.from({length:Math.round(W*Ht/2600)},()=>[rnd()*W,rnd()*Ht,rnd()*1.2+.2,rnd()]);if(reduce.matches)frame(0)}
function geo(){const r=stage.querySelector('.so-core').getBoundingClientRect(),c=cv.getBoundingClientRect();return{cx:r.left+r.width/2-c.left,cy:r.top+r.height/2-c.top,R:r.width/2}}
function frame(t){ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,Ht);const g=geo(),{cx,cy,R}=g;
  for(const[x,y,r,f]of stars){ctx.globalAlpha=.35+.5*Math.abs(Math.sin(t*.0006+f*9));ctx.fillStyle=f>.85?'#ffe2a8':'#bfffee';ctx.fillRect(x,y,r,r)}ctx.globalAlpha=1;
  /* the planet horizon at the bottom left, as in the photo */
  const hx=W*.1,hy=Ht*1.62,hr=Ht*.95,hz=ctx.createRadialGradient(hx-hr*.2,hy-hr*.4,hr*.2,hx,hy,hr);hz.addColorStop(0,'#0a3a44');hz.addColorStop(.7,'#05212b');hz.addColorStop(1,'#031820');
  ctx.fillStyle=hz;ctx.beginPath();ctx.arc(hx,hy,hr,0,Math.PI*2);ctx.fill();ctx.save();ctx.lineWidth=1.6;ctx.strokeStyle='rgba(140,255,235,.55)';ctx.shadowColor='rgba(80,255,220,.9)';ctx.shadowBlur=18;ctx.beginPath();ctx.arc(hx,hy,hr,-Math.PI*.95,-Math.PI*.12);ctx.stroke();ctx.restore();
  const G=window.RadixGlobe,rot=.35+t*.00006;if(G)G.orbits(ctx,g,t,false);
  const cr=cv.getBoundingClientRect();
  for(const p of stage.querySelectorAll('.so-planet i')){const r=p.getBoundingClientRect();if(!r.width)continue;const x=r.left+r.width/2-cr.left,y=r.top+r.height/2-cr.top,dx=x-cx,dy=y-cy,d=Math.hypot(dx,dy)||1;
    const sx=cx+dx/d*R*1.02,sy=cy+dy/d*R*1.02,ex=x-dx/d*r.width*.62,ey=y-dy/d*r.width*.62,col=getComputedStyle(p).color;
    const lg=ctx.createLinearGradient(sx,sy,ex,ey);lg.addColorStop(0,'rgba(120,255,230,.05)');lg.addColorStop(1,col);ctx.globalAlpha=.75;ctx.strokeStyle=lg;ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(ex,ey);ctx.stroke();
    const k=(t*.00025+d*.01)%1;ctx.fillStyle=col;ctx.beginPath();ctx.arc(sx+(ex-sx)*k,sy+(ey-sy)*k,1.8,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1}
  /* the RADIX earth (sales/orbit-globe.js), the front half of its orbits over it */
  if(G){G.draw(ctx,g,rot);G.orbits(ctx,g,t,true)}}
function loop(t){if(stage.hidden){requestAnimationFrame(loop);return}if(!W)size();frame(t);if(!reduce.matches)requestAnimationFrame(loop)}
size();requestAnimationFrame(loop);new ResizeObserver(size).observe(cv);
reduce.addEventListener?.('change',()=>requestAnimationFrame(loop));
})();
