'use strict';
/* Panoramica commerciale: KPI, funnel per fase, pipeline per mese di chiusura,
   opportunità a rischio, classifica del team, focus di oggi e azioni suggerite,
   as in the CRM "Panoramica" mockup. Everything is computed from CRM rows
   (crm-data.js); suggestions come from fixed rules shown to the user, not AI. */
(()=>{
const content=document.getElementById('content');if(!content)return;
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n};
const NS='http://www.w3.org/2000/svg',S=(tag,attrs)=>{const n=document.createElementNS(NS,tag);for(const k in attrs)n.setAttribute(k,String(attrs[k]));return n};
const eur=c=>{const v=Number(c||0)/100;return v>=1e6?(v/1e6).toLocaleString('it-IT',{maximumFractionDigits:1})+'M':v>=1e4?Math.round(v/1e3).toLocaleString('it-IT')+'K':v.toLocaleString('it-IT',{maximumFractionDigits:0})};
const DAY=864e5,today=()=>{const d=new Date();d.setHours(0,0,0,0);return d};
const dd=v=>{const d=new Date(v);return Number.isFinite(d.getTime())?d:null};
const fmtDay=v=>{const d=dd(v);return d?d.toLocaleDateString('it-IT',{day:'2-digit',month:'short'}):'—'};
const initials=t=>String(t||'').trim().split(/\s+/).slice(0,2).map(w=>w[0]?.toUpperCase()||'').join('');
const MONTHS=['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

function spark(values,cls){const svg=S('svg',{viewBox:'0 0 100 30',preserveAspectRatio:'none',class:'pv-spark '+(cls||''),'aria-hidden':'true'});const max=Math.max(1,...values),n=Math.max(1,values.length-1);
  const pts=values.map((v,i)=>[i*100/n,27-v/max*24]);const d=pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  svg.append(S('path',{d:d+' L100 30 L0 30 Z',class:'area'}),S('path',{d,class:'line'}));return svg}

function model(d){const t0=today(),open=d.tasks.filter(t=>t.status!=='done');
  const stages=d.stages.filter(s=>d.opportunities.some(o=>o.process_id===s.process_id)).sort((a,b)=>a.position-b.position);
  const opps=d.opportunities,total=opps.reduce((s,o)=>s+Number(o.amount_cents||0),0);
  const months=[...Array(6)].map((_,i)=>{const m=new Date(t0.getFullYear(),t0.getMonth()+i,1);return{label:MONTHS[m.getMonth()],y:m.getFullYear(),m:m.getMonth(),value:0,count:0}});
  for(const o of opps){const c=dd(o.expected_close);if(!c)continue;const slot=months.find(x=>x.y===c.getFullYear()&&x.m===c.getMonth());if(slot){slot.value+=Number(o.amount_cents||0);slot.count++}}
  const weeks=[...Array(6)].map((_,i)=>({from:+t0+i*7*DAY,to:+t0+(i+1)*7*DAY}));
  const dueWeeks=weeks.map(w=>open.filter(t=>{const x=dd(t.due_at);return x&&+x>=w.from&&+x<w.to}).length);
  const closeWeeks=weeks.map(w=>opps.filter(o=>{const x=dd(o.expected_close);return x&&+x>=w.from&&+x<w.to}).reduce((s,o)=>s+Number(o.amount_cents||0),0));
  const due=open.filter(t=>{const x=dd(t.due_at);return x&&+x<+t0+DAY});
  const in30=opps.filter(o=>{const x=dd(o.expected_close);return x&&+x>=+t0&&+x<+t0+30*DAY});
  const risk=opps.map(o=>{const c=dd(o.expected_close),days=c?Math.round((c-t0)/DAY):null,hasTask=open.some(t=>t.opportunity_id===o.id);
    let level=null,why='';if(days===null){level='Basso';why='Chiusura non impostata'}else if(days<0){level='Alto';why='Chiusura prevista superata'}else if(days<=14&&!hasTask){level='Alto';why='Chiude a breve senza attività'}else if(days<=14){level='Medio';why='Chiude entro 14 giorni'}else if(days<=30&&!hasTask){level='Medio';why='Nessuna attività aperta'}
    return level?{o,level,why,days}:null}).filter(Boolean).sort((a,b)=>({Alto:0,Medio:1,Basso:2}[a.level]-{Alto:0,Medio:1,Basso:2}[b.level])||((a.days??999)-(b.days??999)));
  const owners=new Map();for(const o of opps){const k=o.owner_id??'none';owners.set(k,(owners.get(k)||0)+Number(o.amount_cents||0))}
  const board=[...owners.entries()].map(([id,v])=>({name:d.members.find(m=>String(m.id)===String(id))?.name||'Non assegnato',v})).sort((a,b)=>b.v-a.v);
  return{t0,open,stages,opps,total,months,dueWeeks,closeWeeks,due,in30,risk,board}}

const company=(d,id)=>d.companies.find(c=>c.id===id)?.name||'—';
const panel=(title,cls,link)=>{const p=E('section',undefined,'pv-panel '+(cls||''));const h=E('div',undefined,'pv-head');h.append(E('h3',title));if(link){const a=E('a',link[0]);a.href=link[1];h.append(a)}p.append(h);return p};

function kpis(m){const row=E('div',undefined,'pv-kpis');
  const card=(label,value,sub,series,tone)=>{const c=E('article',undefined,'pv-kpi'+(tone?' '+tone:''));c.append(E('small',label),E('strong',value),E('span',sub),spark(series,tone));row.append(c)};
  let acc=0;card('Pipeline totale','€ '+eur(m.total),m.opps.length+' opportunità nel CRM',m.months.map(x=>acc+=x.value));
  card('Opportunità attive',m.opps.length,'per mese di chiusura',m.months.map(x=>x.count));
  card('Attività in scadenza',m.due.length,'entro oggi, aperte',m.dueWeeks,'warn');
  card('In chiusura a 30 giorni','€ '+eur(m.in30.reduce((s,o)=>s+Number(o.amount_cents||0),0)),m.in30.length+' opportunità',m.closeWeeks);
  return row}

function funnel(m){const p=panel('Opportunità per fase','pv-funnel',['Vedi dettagli pipeline →','/sales-pipeline-premium.html']);const body=E('div',undefined,'pv-funnel-body');
  const svg=S('svg',{viewBox:'0 0 200 220',class:'pv-funnel-svg','aria-hidden':'true'});const n=Math.max(1,m.stages.length);const list=E('ul');
  m.stages.forEach((s,i)=>{const ops=m.opps.filter(o=>o.stage_id===s.id),v=ops.reduce((a,o)=>a+Number(o.amount_cents||0),0);const top=i*220/n,bot=(i+1)*220/n,w1=95-i*70/n,w2=95-(i+1)*70/n;
    svg.append(S('path',{d:`M${100-w1} ${top} L${100+w1} ${top} L${100+w2} ${bot-2} L${100-w2} ${bot-2} Z`,class:'f'+(i%5)}));
    const li=E('li');li.append(E('b',s.title),E('span','€ '+eur(v)+' · '+ops.length+(ops.length===1?' opportunità':' opportunità')));list.append(li)});
  const last=m.stages.at(-1),share=m.opps.length&&last?Math.round(m.opps.filter(o=>o.stage_id===last.id).length/m.opps.length*100):0;
  const fig=E('div',undefined,'pv-funnel-fig');fig.append(svg);const tot=E('p',undefined,'pv-conv');tot.append(E('small','In '+(last?.title||'ultima fase').toLowerCase()),E('b',share+'%'));fig.append(tot);
  body.append(fig,list);p.append(body);return p}

function trend(m){const p=panel('Pipeline per mese di chiusura prevista','pv-trend');const max=Math.max(1,...m.months.map(x=>x.value));
  const svg=S('svg',{viewBox:'0 0 600 240',class:'pv-chart',role:'img','aria-label':'Valore delle opportunità per mese di chiusura prevista'});
  for(let i=0;i<=4;i++){const y=20+i*45;svg.append(S('line',{x1:60,x2:590,y1:y,y2:y,class:'grid'}));const t=S('text',{x:52,y:y+4,class:'ax','text-anchor':'end'});t.textContent='€ '+eur(max*(4-i)/4);svg.append(t)}
  let acc=0;const cum=m.months.map(x=>acc+=x.value),cmax=Math.max(1,acc);
  const X=i=>70+i*(510/5),Y=(v,mx)=>200-v/mx*180;
  const line=(vals,mx,cls)=>{const d=vals.map((v,i)=>(i?'L':'M')+X(i)+' '+Y(v,mx)).join(' ');if(cls==='l1')svg.append(S('path',{d:d+` L${X(5)} 200 L${X(0)} 200 Z`,class:'fill'}));svg.append(S('path',{d,class:cls}));vals.forEach((v,i)=>svg.append(S('circle',{cx:X(i),cy:Y(v,mx),r:4,class:'dot '+cls})))};
  m.months.forEach((x,i)=>{const t=S('text',{x:X(i),y:224,class:'ax','text-anchor':'middle'});t.textContent=x.label;svg.append(t)});
  line(m.months.map(x=>x.value),max,'l2');line(cum.map(v=>v/cmax*max),max,'l1');
  p.append(svg);const lg=E('p',undefined,'pv-legend');lg.append(E('span','Cumulato','l1'),E('span','Valore nel mese','l2'));p.append(lg);return p}

function risks(d,m){const p=panel('Opportunità a rischio','pv-risk',['Vedi tutte ('+m.risk.length+')','#opportunities']);
  if(!m.risk.length){p.append(E('p','Nessuna opportunità a rischio secondo le regole: scadenza superata, chiusura entro 14 giorni o nessuna attività aperta.','pv-empty'));return p}
  const t=E('table');const h=E('tr');['Opportunità','Azienda','Valore','Chiusura','Rischio'].forEach(x=>h.append(E('th',x)));const th=E('thead');th.append(h);t.append(th);const tb=E('tbody');
  for(const r of m.risk.slice(0,5)){const tr=E('tr');tr.title=r.why;tr.append(E('td',r.o.title),E('td',company(d,r.o.company_id)),E('td','€ '+eur(r.o.amount_cents)),E('td',fmtDay(r.o.expected_close)));const c=E('td');c.append(E('span',r.level,'pv-level '+r.level.toLowerCase()));tr.append(c);tb.append(tr)}
  t.append(tb);p.append(t);p.append(E('p','Regole: scadenza superata o chiusura entro 14 giorni senza attività = Alto.','pv-note'));return p}

function team(m){const p=panel('Classifica del team (pipeline)','pv-team');const max=Math.max(1,...m.board.map(x=>x.v));const ol=E('ol');
  m.board.slice(0,5).forEach((x,i)=>{const li=E('li');const av=E('span',initials(x.name),'pv-av');av.setAttribute('aria-hidden','true');const bar=E('span',undefined,'pv-bar');const fill=E('i');fill.style.width=Math.round(x.v/max*100)+'%';bar.append(fill);li.append(E('b',String(i+1),'pv-rank'),av,E('span',x.name,'pv-name'),bar,E('strong','€ '+eur(x.v)));ol.append(li)});
  if(!m.board.length)p.append(E('p','Nessuna opportunità assegnata.','pv-empty'));p.append(ol);return p}

function focus(d,m){const p=panel('Focus di oggi','pv-focus',['Apri attività →','#tasks']);const done=d.tasks.filter(t=>t.status==='done').length,all=d.tasks.length;
  const ring=E('div',undefined,'pv-ring');const svg=S('svg',{viewBox:'0 0 120 120','aria-hidden':'true'});svg.append(S('circle',{cx:60,cy:60,r:50,class:'bg'}));const frac=all?done/all:0;svg.append(S('circle',{cx:60,cy:60,r:50,class:'fg','stroke-dasharray':`${(frac*314).toFixed(1)} 314`}));ring.append(svg);
  const lab=E('div');lab.append(E('b',done),E('small','di '+all+' attività completate'));ring.append(lab);
  const counts=E('ul',undefined,'pv-counts');const overdue=m.open.filter(t=>{const x=dd(t.due_at);return x&&+x<+m.t0}).length;
  [['Scadute',overdue],['Oggi',m.due.length-overdue],['Aperte',m.open.length]].forEach(([k,v])=>{const li=E('li');li.append(E('b',v),E('small',k));counts.append(li)});
  const list=E('ul',undefined,'pv-agenda');const next=[...m.open].sort((a,b)=>String(a.due_at||'9999').localeCompare(String(b.due_at||'9999'))).slice(0,3);
  for(const t of next){const li=E('li');const x=dd(t.due_at);li.append(E('time',x?x.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}):'—'));const tx=E('div');tx.append(E('b',t.title),E('small',company(d,t.company_id)));li.append(tx);const tag=E('span',!x?'Senza data':+x<+m.t0?'Scaduta':+x<+m.t0+DAY?'Oggi':fmtDay(t.due_at),'pv-when'+(x&&+x<+m.t0?' late':''));li.append(tag);list.append(li)}
  if(!next.length)list.append(E('li','Nessuna attività aperta.','pv-empty'));
  const recent=E('div',undefined,'pv-recent');recent.append(E('h4','Ultime interazioni'));const inter=[...d.interactions].sort((a,b)=>String(b.occurred_at).localeCompare(String(a.occurred_at))).slice(0,3);
  if(!inter.length)recent.append(E('p','Nessuna interazione registrata.','pv-empty'));for(const i of inter){const r=E('p');r.append(E('b',i.title),E('small',fmtDay(i.occurred_at)));recent.append(r)}
  const g=E('div',undefined,'pv-focus-grid');const left=E('div',undefined,'pv-focus-left');left.append(ring,counts);g.append(left,list,recent);p.append(g);return p}

function rail(d,m){const r=E('aside',undefined,'pv-rail');const h=E('div',undefined,'pv-rail-head');h.append(E('span','✦','pv-spark-ico'),E('h3','Azioni suggerite'));r.append(h);
  r.append(E('p','Calcolate con regole fisse sui dati del CRM, non da un modello AI.','pv-note'));
  const items=[];for(const x of m.risk.slice(0,3))items.push(['Pianifica un passo per '+x.o.title,company(d,x.o.company_id)+' · '+x.why.toLowerCase(),'#tasks']);
  const lonely=d.contacts.filter(c=>!d.interactions.some(i=>i.contact_id===c.id)&&!m.open.some(t=>t.contact_id===c.id)).slice(0,2);
  for(const c of lonely)items.push(['Ricontatta '+c.name,company(d,c.company_id)+' · nessuna attività né interazione','#contacts']);
  if(!items.length)r.append(E('p','Niente da segnalare oggi.','pv-empty'));
  for(const [t,s,href] of items){const a=E('a',undefined,'pv-action');a.href=href;a.append(E('b',t),E('small',s));r.append(a)}
  const next=E('div',undefined,'pv-rail-block');next.append(E('h4','Prossime attività'));for(const t of [...m.open].sort((a,b)=>String(a.due_at||'9999').localeCompare(String(b.due_at||'9999'))).slice(0,3)){const p=E('p');p.append(E('b',t.title),E('small',company(d,t.company_id)+' · '+fmtDay(t.due_at)));next.append(p)}r.append(next);
  const ask=E('a','Chiedi a J.A.R.V.I.S. in Sales Orbit →','pv-ask');ask.href='/sales-orbit-higgsfield.html';r.append(ask);return r}

let busy=false;
async function render(){const sec=document.getElementById('dashboard');if(!sec||!sec.classList.contains('rx-view')){document.documentElement.classList.remove('pv-on');return}
  const d=await window.RadixCrmData?.load();if(!d||!sec.isConnected)return;const m=model(d);
  busy=true;sec.querySelector(':scope>.pv')?.remove();
  const root=E('div',undefined,'pv');const main=E('div',undefined,'pv-main');const mid=E('div',undefined,'pv-two');mid.append(funnel(m),trend(m));const low=E('div',undefined,'pv-two pv-two-b');low.append(risks(d,m),team(m));
  main.append(kpis(m),mid,low,focus(d,m));root.append(main,rail(d,m));if(d.partial)root.append(E('p','Calcolato sui primi 100 record per tipo.','pv-note'));sec.append(root);
  document.documentElement.classList.add('pv-on');requestAnimationFrame(()=>{busy=false})}
let q=false;const later=()=>{if(busy||q)return;q=true;setTimeout(()=>{q=false;render()},60)};
new MutationObserver(m=>{if(m.some(r=>![...r.addedNodes,...r.removedNodes].every(n=>n.nodeType===1&&(n.classList?.contains('pv')||n.classList?.contains('cx')))))later()}).observe(content,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
addEventListener('hashchange',later);later();
})();
