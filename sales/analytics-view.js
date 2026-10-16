'use strict';
/* Analisi commerciale: KPI, pipeline per mese e fase, funnel, team,
   attività e conversione, completezza dei dati e top opportunità, as in the
   CRM "Analytics" mockup. Computed from CRM rows only (crm-data.js): no
   forecast model, probabilities or scores the CRM does not store. */
(()=>{
const content=document.getElementById('content'),nav=document.getElementById('navigation');if(!content||!nav)return;
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n};
const NS='http://www.w3.org/2000/svg',S=(tag,a)=>{const n=document.createElementNS(NS,tag);for(const k in a)n.setAttribute(k,String(a[k]));return n};
const eur=c=>{const v=Number(c||0)/100;return '€ '+(v>=1e6?(v/1e6).toLocaleString('it-IT',{maximumFractionDigits:1})+'M':v>=1e4?Math.round(v/1e3).toLocaleString('it-IT')+'K':v.toLocaleString('it-IT',{maximumFractionDigits:0}))};
const pct=(a,b)=>b?Math.round(a/b*100):0;
const MN=['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
const TONES=['#26d796','#36c9e0','#4aa3ff','#a48cff','#f2c063'];

function ensure(){if(!nav.querySelector('a[href="#analytics"]')){const a=E('a','Analisi');a.href='#analytics';const c=nav.querySelector('a[href="#calendar"]')||nav.querySelector('a[href="#tasks"]');c?c.after(a):nav.append(a)}
  if((location.hash||'')!=='#analytics'){document.getElementById('analytics')?.remove();return null}
  let s=document.getElementById('analytics');if(!s||s.parentNode!==content){s=E('section',undefined,'panel an-section');s.id='analytics';const r=E('div',undefined,'row');r.append(E('h2','Analisi commerciale'));s.append(r);content.append(s)}
  content.querySelectorAll(':scope>section.rx-view').forEach(x=>{if(x!==s)x.classList.remove('rx-view')});s.classList.add('rx-view');document.documentElement.classList.add('rx-has-view');return s}

const panel=(t,cls,sub)=>{const p=E('section',undefined,'an-panel '+(cls||''));p.append(E('h3',t));if(sub)p.append(E('p',sub,'an-sub'));return p};

function build(d){const opps=d.opportunities,tasks=d.tasks,val=o=>Number(o.amount_cents||0),total=opps.reduce((s,o)=>s+val(o),0);
  const stages=d.stages.filter(s=>opps.some(o=>o.process_id===s.process_id)).sort((a,b)=>a.position-b.position);const last=stages.at(-1);
  const late=stages.slice(-2).map(s=>s.id),lateVal=opps.filter(o=>late.includes(o.stage_id)).reduce((s,o)=>s+val(o),0);
  const root=E('div',undefined,'an');const main=E('div',undefined,'an-main');
  /* KPI */
  const k=E('div',undefined,'an-kpis');const kpi=(l,v,s)=>{const a=E('article',undefined,'an-kpi');a.append(E('small',l),E('strong',v),E('span',s));k.append(a)};
  kpi('Pipeline totale',eur(total),opps.length+' opportunità');kpi('Valore medio',eur(opps.length?total/opps.length:0),'per opportunità');
  kpi('Nelle ultime due fasi',pct(lateVal,total)+'%',eur(lateVal)+' in '+stages.slice(-2).map(s=>s.title.toLowerCase()).join(' e '));
  kpi('Attività per opportunità',(opps.length?tasks.filter(t=>t.opportunity_id).length/opps.length:0).toLocaleString('it-IT',{maximumFractionDigits:1}),tasks.length+' attività totali');
  kpi('Interazioni registrate',d.interactions.length,d.contacts.length+' contatti nel CRM');main.append(k);
  /* stacked bars by close month and stage */
  const two=E('div',undefined,'an-two');const vel=panel('Pipeline per mese di chiusura','an-bars','Valore per fase, in base alla chiusura prevista');
  const t0=new Date();const months=[...Array(6)].map((_,i)=>new Date(t0.getFullYear(),t0.getMonth()+i,1));
  const per=months.map(m=>stages.map(s=>opps.filter(o=>o.stage_id===s.id&&o.expected_close&&new Date(o.expected_close).getFullYear()===m.getFullYear()&&new Date(o.expected_close).getMonth()===m.getMonth()).reduce((a,o)=>a+val(o),0)));
  const max=Math.max(1,...per.map(r=>r.reduce((a,b)=>a+b,0)));const svg=S('svg',{viewBox:'0 0 620 260',class:'an-chart',role:'img','aria-label':'Valore per mese di chiusura e fase'});
  for(let i=0;i<=4;i++){const y=20+i*50;svg.append(S('line',{x1:60,x2:610,y1:y,y2:y,class:'grid'}));const t=S('text',{x:52,y:y+4,class:'ax','text-anchor':'end'});t.textContent=eur(max*(4-i)/4);svg.append(t)}
  per.forEach((r,i)=>{let y=220;const x=90+i*88;r.forEach((v,j)=>{if(!v)return;const h=v/max*200;y-=h;svg.append(S('rect',{x,y,width:44,height:h,rx:3,fill:TONES[j%5]}))});const t=S('text',{x:x+22,y:244,class:'ax','text-anchor':'middle'});t.textContent=MN[months[i].getMonth()]+' '+String(months[i].getFullYear()).slice(2);svg.append(t)});
  vel.append(svg);const lg=E('p',undefined,'an-legend');stages.forEach((s,j)=>{const x=E('span',s.title);x.style.setProperty('--c',TONES[j%5]);lg.append(x)});vel.append(lg);
  /* funnel */
  const fun=panel('Funnel per fase','an-funnel','Quota del valore in ogni fase');const fw=E('div',undefined,'an-fun');
  stages.forEach((s,j)=>{const ops=opps.filter(o=>o.stage_id===s.id),v=ops.reduce((a,o)=>a+val(o),0);const row=E('div',undefined,'an-fun-row');const bar=E('div',undefined,'an-fun-bar');bar.style.setProperty('--w',(92-j*(60/Math.max(1,stages.length-1)))+'%');bar.style.setProperty('--c',TONES[j%5]);bar.append(E('b',s.title),E('small',eur(v)+' ('+pct(v,total)+'%)'));row.append(bar,E('span',ops.length+' opp.','an-fun-n'));fw.append(row)});
  fun.append(fw);if(last)fun.append(E('p','In '+last.title.toLowerCase()+': '+opps.filter(o=>o.stage_id===last.id).length+' su '+opps.length,'an-note'));two.append(vel,fun);main.append(two);
  /* team + activity + data quality */
  const three=E('div',undefined,'an-three');const team=panel('Performance team','an-team');const tb=E('table');const hr=E('tr');['Responsabile','Valore','Opp.'].forEach(x=>hr.append(E('th',x)));const th=E('thead');th.append(hr);tb.append(th);const body=E('tbody');
  const owners=new Map();for(const o of opps){const k2=String(o.owner_id??'');const r=owners.get(k2)||{v:0,n:0};r.v+=val(o);r.n++;owners.set(k2,r)}const tmax=Math.max(1,...[...owners.values()].map(r=>r.v));
  [...owners.entries()].sort((a,b)=>b[1].v-a[1].v).forEach(([id,r])=>{const tr=E('tr');const bar=E('td');const i=E('i');i.style.width=Math.round(r.v/tmax*100)+'%';const track=E('span',undefined,'an-bar');track.append(i);bar.append(E('span',eur(r.v)),track);tr.append(E('td',d.members.find(m=>String(m.id)===id)?.name||'Non assegnato'),bar,E('td',r.n));body.append(tr)});tb.append(body);team.append(tb);
  const act=panel('Attività e conversione','an-act','Dalle attività alle opportunità');const linked=tasks.filter(t=>t.opportunity_id).length,done=tasks.filter(t=>t.status==='done').length;
  [['Attività totali',tasks.length],['Collegate a un’opportunità',pct(linked,tasks.length)+'%'],['Completate',pct(done,tasks.length)+'%'],['Valore medio opportunità',eur(opps.length?total/opps.length:0)]].forEach(([a,b])=>{const r=E('p',undefined,'an-line');r.append(E('span',a),E('b',b));act.append(r)});
  const q=panel('Completezza dati','an-quality','Campi compilati nel CRM');const checks=[['Aziende',d.companies.length?pct(d.companies.filter(c=>d.contacts.some(x=>x.company_id===c.id)).length,d.companies.length):0,'con almeno un contatto'],['Contatti',pct(d.contacts.filter(c=>c.company_id).length,d.contacts.length),'con azienda'],['Opportunità',pct(opps.filter(o=>o.amount_cents&&o.expected_close&&o.contact_id).length,opps.length),'con valore, data e contatto'],['Attività',pct(tasks.filter(t=>t.due_at&&t.assignee_id).length,tasks.length),'con scadenza e assegnatario']];
  const avg=Math.round(checks.reduce((a,c)=>a+c[1],0)/checks.length);const big=E('div',undefined,'an-q-head');big.append(E('strong',avg+'%'));const pb=E('span',undefined,'an-q-bar');const pi=E('i');pi.style.width=avg+'%';pb.append(pi);big.append(pb);q.append(big);
  const qg=E('div',undefined,'an-q-grid');for(const [n,v,h] of checks){const c=E('div');c.title=h;c.append(E('small',n),E('b',v+'%'),E('span',h));qg.append(c)}q.append(qg);three.append(team,act,q);main.append(three);
  /* top opportunities */
  const top=panel('Top opportunità','an-top');const t2=E('table');const h2=E('tr');['Opportunità','Azienda','Fase','Valore','Chiusura prevista','Responsabile'].forEach(x=>h2.append(E('th',x)));const th2=E('thead');th2.append(h2);t2.append(th2);const b2=E('tbody');
  for(const o of [...opps].sort((a,b)=>val(b)-val(a)).slice(0,6)){const tr=E('tr');const st=E('td');st.append(E('span',d.stages.find(s=>s.id===o.stage_id)?.title||'—','an-stage'));tr.append(E('td',o.title),E('td',d.companies.find(c=>c.id===o.company_id)?.name||'—'),st,E('td',eur(val(o))),E('td',o.expected_close?new Date(o.expected_close).toLocaleDateString('it-IT',{day:'2-digit',month:'short',year:'numeric'}):'—'),E('td',d.members.find(m=>String(m.id)===String(o.owner_id))?.name||'—'));b2.append(tr)}
  t2.append(b2);top.append(t2);const more=E('a','Vedi tutte le opportunità →','an-link');more.href='#opportunities';top.append(more);main.append(top);
  /* rail */
  const rail=E('aside',undefined,'an-rail');rail.append(E('h3','In sintesi'));const best=stages.map(s=>[s,opps.filter(o=>o.stage_id===s.id).reduce((a,o)=>a+val(o),0)]).sort((a,b)=>b[1]-a[1])[0];
  const lines=[`La pipeline vale ${eur(total)} su ${opps.length} opportunità.`,best?`La fase con più valore è ${best[0].title} (${pct(best[1],total)}%).`:'',`${pct(linked,tasks.length)}% delle attività è collegato a un’opportunità.`,avg<80?`Completezza dati al ${avg}%: completare i campi rende queste analisi più affidabili.`:`Completezza dati buona (${avg}%).`].filter(Boolean);
  for(const l of lines)rail.append(E('p',l));rail.append(E('p','Calcolato dai dati del CRM, senza modelli previsionali. Probabilità e punteggi arriveranno quando il CRM li salverà.','an-note'));
  const ask=E('a','Chiedi al Copilota commerciale in Sales Orbit →','an-ask');ask.href='/sales-orbit-higgsfield.html';rail.append(ask);
  root.append(main,rail);if(d.partial)root.append(E('p','Calcolato sui primi 100 record per tipo.','an-note'));return root}

let busy=false;
async function render(){const s=ensure();if(!s)return;const d=await window.RadixCrmData?.load();if(!d||!s.isConnected)return;busy=true;s.querySelector(':scope>.an')?.remove();s.append(build(d));requestAnimationFrame(()=>{busy=false;if(!s.isConnected)later()})}
let q=false;const later=()=>{if(busy||q)return;q=true;setTimeout(()=>{q=false;render()},60)};
new MutationObserver(m=>{if(m.some(r=>(r.type==='attributes'&&r.target.parentElement===content)||![...r.addedNodes,...r.removedNodes].every(n=>n.nodeType===1&&/\b(pv|cx|tv|cal|an)\b/.test(n.className||''))))later()}).observe(content,{childList:true});
new MutationObserver(later).observe(nav,{childList:true});addEventListener('hashchange',later);later();
})();
