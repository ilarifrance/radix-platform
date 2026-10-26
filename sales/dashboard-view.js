'use strict';
/* Panoramica commerciale: «Suggerimenti per oggi» (the one list of today's actions), «Primi passi»,
   KPI, funnel per fase, pipeline per mese di chiusura, opportunità a rischio, classifica del team,
   as in the CRM "Panoramica" mockup. Everything is computed from CRM rows
   (crm-data.js); suggestions come from fixed rules shown to the user, not AI. */
(()=>{
const content=document.getElementById('content');if(!content)return;
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n};
const NS='http://www.w3.org/2000/svg',S=(tag,attrs)=>{const n=document.createElementNS(NS,tag);for(const k in attrs)n.setAttribute(k,String(attrs[k]));return n};
const eur=c=>{const v=Number(c||0)/100;return v>=1e6?(v/1e6).toLocaleString('it-IT',{maximumFractionDigits:1})+'M':v>=1e4?Math.round(v/1e3).toLocaleString('it-IT')+'K':v.toLocaleString('it-IT',{maximumFractionDigits:0})};
// Top of the «Pipeline per mese» axis: the larger of a month's value and the running total (never below 1).
const trendMax=months=>{let acc=0,top=1;for(const x of months||[]){const v=Number(x&&x.value)||0;acc+=v;top=Math.max(top,v,acc)}return top};
// Open/won/lost: one rule for every CRM view, RadixCrmForecast.isOpen (analytics-view.js).
const isOpen=o=>window.RadixCrmForecast.isOpen(o);
const DAY=864e5,today=()=>{const d=new Date();d.setHours(0,0,0,0);return d};
const dd=v=>{if(v==null||v==='')return null;const d=new Date(v);return Number.isFinite(d.getTime())?d:null};
const fmtDay=v=>{const d=dd(v);return d?d.toLocaleDateString('it-IT',{day:'2-digit',month:'short',timeZone:'Europe/Rome'}):'—'};
const initials=t=>String(t||'').trim().split(/\s+/).slice(0,2).map(w=>w[0]?.toUpperCase()||'').join('');
const MONTHS=['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

function spark(values,cls){const svg=S('svg',{viewBox:'0 0 100 30',preserveAspectRatio:'none',class:'pv-spark '+(cls||''),'aria-hidden':'true'});const max=Math.max(1,...values),n=Math.max(1,values.length-1);
  const pts=values.map((v,i)=>[i*100/n,27-v/max*24]);const d=pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  svg.append(S('path',{d:d+' L100 30 L0 30 Z',class:'area'}),S('path',{d,class:'line'}));return svg}

function model(d){const t0=today(),open=d.tasks.filter(t=>t.status!=='done');
  const stages=d.stages.filter(s=>d.opportunities.some(o=>o.process_id===s.process_id)).sort((a,b)=>a.position-b.position);
  const opps=d.opportunities.filter(isOpen),total=opps.reduce((s,o)=>s+Number(o.amount_cents||0),0);
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

window.RadixCrmDashboardView={model,trendMax};
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

// One scale for both lines: the axis goes up to the cumulative total, so «Cumulato» reads its real value.
function trend(m){const p=panel('Pipeline per mese di chiusura prevista','pv-trend');const max=trendMax(m.months);
  const svg=S('svg',{viewBox:'0 0 600 240',class:'pv-chart',role:'img','aria-label':'Valore delle opportunità per mese di chiusura prevista'});
  for(let i=0;i<=4;i++){const y=20+i*45;svg.append(S('line',{x1:60,x2:590,y1:y,y2:y,class:'grid'}));const t=S('text',{x:52,y:y+4,class:'ax','text-anchor':'end'});t.textContent='€ '+eur(max*(4-i)/4);svg.append(t)}
  let acc=0;const cum=m.months.map(x=>acc+=x.value);
  const X=i=>70+i*(510/5),Y=(v,mx)=>200-v/mx*180;
  const line=(vals,mx,cls)=>{const d=vals.map((v,i)=>(i?'L':'M')+X(i)+' '+Y(v,mx)).join(' ');if(cls==='l1')svg.append(S('path',{d:d+` L${X(5)} 200 L${X(0)} 200 Z`,class:'fill'}));svg.append(S('path',{d,class:cls}));vals.forEach((v,i)=>svg.append(S('circle',{cx:X(i),cy:Y(v,mx),r:4,class:'dot '+cls})))};
  m.months.forEach((x,i)=>{const t=S('text',{x:X(i),y:224,class:'ax','text-anchor':'middle'});t.textContent=x.label;svg.append(t)});
  line(m.months.map(x=>x.value),max,'l2');line(cum,max,'l1');
  p.append(svg);const lg=E('p',undefined,'pv-legend');lg.append(E('span','Cumulato','l1'),E('span','Valore nel mese','l2'));p.append(lg);return p}

function risks(d,m){const p=panel('Opportunità a rischio','pv-risk',['Vedi tutte ('+m.risk.length+')','#opportunities']);
  if(!m.risk.length){p.append(E('p','Nessuna opportunità a rischio secondo le regole: scadenza superata, chiusura entro 14 giorni o nessuna attività aperta.','pv-empty'));return p}
  const t=E('table');const h=E('tr');['Opportunità','Azienda','Valore','Chiusura','Rischio'].forEach(x=>h.append(E('th',x)));const th=E('thead');th.append(h);t.append(th);const tb=E('tbody');
  for(const r of m.risk.slice(0,5)){const tr=E('tr');tr.title=r.why;tr.append(E('td',r.o.title),E('td',company(d,r.o.company_id)),E('td','€ '+eur(r.o.amount_cents)),E('td',fmtDay(r.o.expected_close)));const c=E('td');c.append(E('span',r.level,'pv-level '+r.level.toLowerCase()));tr.append(c);tb.append(tr)}
  t.append(tb);p.append(t);p.append(E('p','Regole: scadenza superata o chiusura entro 14 giorni senza attività = Alto.','pv-note'));return p}

function team(m){const p=panel('Classifica del team (pipeline)','pv-team');const max=Math.max(1,...m.board.map(x=>x.v));const ol=E('ol');
  m.board.slice(0,5).forEach((x,i)=>{const li=E('li');const av=E('span',initials(x.name),'pv-av');av.setAttribute('aria-hidden','true');const bar=E('span',undefined,'pv-bar');const fill=E('i');fill.style.width=Math.round(x.v/max*100)+'%';bar.append(fill);li.append(E('b',String(i+1),'pv-rank'),av,E('span',x.name,'pv-name'),bar,E('strong','€ '+eur(x.v)));ol.append(li)});
  if(!m.board.length)p.append(E('p','Nessuna opportunità assegnata.','pv-empty'));p.append(ol);return p}

// «Focus di oggi» and «Azioni suggerite» were merged into «Suggerimenti per oggi» (crm-home-core.js):
// the team counts and last interaction are its summary line, «chiude a breve senza attività» is a rule.

// «Primi passi»: steps from crm-onboarding-core.js, ticked only by the data; hidden per user and workspace.
function onboarding(d){const O=window.RadixCrmOnboarding,app=window.RadixSalesApp;if(!O)return null;
  const key=O.storageKey(app?.state.me,document.getElementById('workspace')?.value);
  let hidden=false;if(key){try{hidden=localStorage.getItem(key)==='hidden'}catch{}}
  // Hidden: only a small link to show the card again.
  if(hidden){const w=E('p',undefined,'pv-onboard-show');const b=E('button','Mostra i primi passi');b.type='button';b.onclick=()=>{try{localStorage.removeItem(key)}catch{}const n=onboarding(d);if(n)w.replaceWith(n)};w.append(b);return w}
  const steps=O.steps(d),pr=O.progress(steps);const p=E('section',undefined,'pv-panel pv-onboard');p.setAttribute('aria-labelledby','pv-onboard-title');
  const h=E('div',undefined,'pv-head');const t=E('h3',pr.complete?'Primi passi: tutto pronto':'Primi passi');t.id='pv-onboard-title';h.append(t,E('span',pr.done+' di '+pr.total+' fatti','pv-onboard-count'));
  if(key){const x=E('button','Nascondi','pv-onboard-hide');x.type='button';x.onclick=()=>{try{localStorage.setItem(key,'hidden')}catch{}const n=onboarding(d);if(n)p.replaceWith(n);else p.remove()};h.append(x)}
  p.append(h);const body=E('div',undefined,'pv-onboard-body');
  // Every step done: only the title row, the steps behind «Vedi i passi».
  if(pr.complete){p.classList.add('done');body.hidden=true;const v=E('button','Vedi i passi','pv-onboard-toggle');v.type='button';v.setAttribute('aria-expanded','false');v.onclick=()=>{body.hidden=!body.hidden;v.setAttribute('aria-expanded',String(!body.hidden));v.textContent=body.hidden?'Vedi i passi':'Chiudi i passi'};h.insertBefore(v,h.querySelector('.pv-onboard-hide'))}
  p.append(body);const bar=E('div',undefined,'pv-onboard-bar');bar.setAttribute('role','progressbar');bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax',String(pr.total));bar.setAttribute('aria-valuenow',String(pr.done));bar.setAttribute('aria-label','Passi completati');const fill=E('i');fill.style.width=Math.round(pr.done/pr.total*100)+'%';bar.append(fill);body.append(bar);
  const ol=E('ol',undefined,'pv-onboard-list');for(const s of steps){const li=E('li',undefined,s.done?'done':'todo');li.append(E('span',s.done?'✓':'',s.done?'pv-onboard-mark ok':'pv-onboard-mark'));const tx=E('div');tx.append(E('b',s.label),E('small',s.hint));li.append(tx);
    if(s.done)li.append(E('span','Fatto','pv-onboard-state'));else{const a=E('a','Vai','pv-onboard-go');a.href=s.href;a.setAttribute('aria-label','Vai: '+s.label);li.append(a)}ol.append(li)}
  body.append(ol,E('p','Si spuntano da soli leggendo i dati del workspace'+(d.partial?' (primi 100 record per tipo)':'')+'.','pv-note'));return p}

// «Suggerimenti per oggi»: items from crm-home-core.js (fixed rules, as switched by the workspace's «Regole»). Buttons only open Customer360 or a view.
// rules: the shared read of the workspace's «Regole» (crm-rules.js); null = fixed rules, as before.
function assistant(d,rules){const H=window.RadixCrmHome,app=window.RadixSalesApp;if(!H)return null;
  const res=H.suggestions(d,{now:Date.now(),me:app?.state.me||null,tickets:app?.rows('tickets'),sla:window.RadixCrmSla?.current(),...(rules&&rules.loaded?{rules:rules.list,quotes:rules.quotes}:{})});
  const p=E('section',undefined,'ch');p.setAttribute('aria-labelledby','ch-title');
  const h=E('div',undefined,'ch-head');const t=E('h3','Suggerimenti per oggi');t.id='ch-title';h.append(t,E('span',rules&&rules.loaded&&window.RadixCrmRules?.effective(rules.list).some(r=>!r.builtin&&r.on)?'regole del workspace, non AI':'regole fisse, non AI','ch-tag'));p.append(h);
  // Team summary (was «Focus di oggi»): counts of all open tasks and the last interaction.
  const s=H.pulse(d,{now:Date.now()});const sum=E('p',undefined,'ch-pulse');
  for(const [n,label,cls] of [[s.overdue,s.overdue===1?'scaduta':'scadute',s.overdue?'late':''],[s.today,'oggi',''],[s.open,s.open===1?'aperta':'aperte',''],[s.done+' di '+s.total,'completate','']]){const c=E('span',undefined,'ch-chip'+(cls?' '+cls:''));c.append(E('b',n),document.createTextNode(' '+label));sum.append(c)}
  const all=E('a','Attività del team →','ch-link');all.href='#tasks';sum.append(all);p.append(sum);
  if(s.last)p.append(E('p','Ultima interazione: '+s.last.title+' · '+s.last.day,'ch-last'));
  if(!res.items.length){const ok=E('div',undefined,'ch-ok');ok.append(E('b','Tutto in ordine'),E('small','Nessuna scadenza, trattativa ferma, ticket aperto o contatto da avviare.'));p.append(ok)}
  const ol=E('ol',undefined,'ch-list');
  // On a phone only the first PHONE items show; the rest behind «Mostra tutti» (CSS, crm-home.css).
  const PHONE=3;res.items.forEach((it,i)=>{const li=E('li',undefined,'ch-item u'+it.urgency+(i>=PHONE?' ch-more':''));const tx=E('div',undefined,'ch-text');
    tx.append(E('small',it.ruleName||(H.RULES.find(r=>r.id===it.rule)||{}).name||'','ch-rule'),E('b',it.title),E('span',it.reason,'ch-why'));
    if(it.value>0)tx.append(E('span','€ '+eur(it.value),'ch-value'));
    const b=E('button',it.label,'ch-go');b.type='button';b.dataset.rule=it.rule;b.setAttribute('aria-label',it.label+': '+it.title);
    b.addEventListener('click',()=>{const a=it.action;if(a.kind==='view'){app?.closeCustomer?.();location.hash=a.hash;return}if(app?.state.busy)return;app?.openCustomer(a.subject,{id:a.id,name:a.name})});
    li.append(tx,b);ol.append(li)});
  if(res.items.length)p.append(ol);
  if(res.items.length>PHONE){const all=E('button','Mostra tutti ('+res.items.length+')','ch-all');all.type='button';all.setAttribute('aria-expanded','false');all.onclick=()=>{const on=ol.classList.toggle('open');all.setAttribute('aria-expanded',String(on));all.textContent=on?'Mostra meno':'Mostra tutti ('+res.items.length+')'};p.append(all)}
  const more=res.total>res.items.length?' Altri '+(res.total-res.items.length)+' non mostrati.':'';
  const note=((res.items.length?'Ordine: prima le scadenze, poi il valore.':'')+more+(app?.state.me?'':' Attività personali non disponibili: utente non riconosciuto.')).trim();if(note)p.append(E('p',note,'ch-note'));
  const ask=E('a','Chiedi al Copilota commerciale in Sales Orbit →','ch-link');ask.href='/sales-orbit-higgsfield.html';p.append(ask);
  return p}

let busy=false;
async function render(){const sec=document.getElementById('dashboard');if(!sec||!sec.classList.contains('rx-view')){document.documentElement.classList.remove('pv-on');return}
  const d=await window.RadixCrmData?.load();if(!d||!sec.isConnected)return;if(!window.RadixCrmForecast){later();return}
  // The workspace's «Regole», read once and shared with the Automazioni panel (crm-rules.js); a failed read = fixed rules.
  const rules=window.RadixCrmRules?.load?await window.RadixCrmRules.load().catch(()=>null):null;if(!sec.isConnected)return;const m=model(d);
  busy=true;sec.querySelector(':scope>.pv')?.remove();
  const root=E('div',undefined,'pv');const main=E('div',undefined,'pv-main');const mid=E('div',undefined,'pv-two');mid.append(funnel(m),trend(m));const low=E('div',undefined,'pv-two pv-two-b');low.append(risks(d,m),team(m));
  // Order: today's actions, onboarding (collapsed when done), then KPI and charts. No side rail.
  const tips=assistant(d,rules);if(tips)main.append(tips);const start=onboarding(d);if(start)main.append(start);main.append(kpis(m),mid,low);root.classList.add('pv-solo');root.append(main);if(d.partial)root.append(E('p','Calcolato sui primi 100 record per tipo.','pv-note'));sec.append(root);
  document.documentElement.classList.add('pv-on');requestAnimationFrame(()=>{busy=false;if(!sec.isConnected)later()})}
let q=false;const later=()=>{if(busy||q)return;q=true;setTimeout(()=>{q=false;render()},60)};
new MutationObserver(m=>{if(m.some(r=>(r.type==='attributes'&&r.target.parentElement===content)||![...r.addedNodes,...r.removedNodes].every(n=>n.nodeType===1&&(n.classList?.contains("pv")||n.classList?.contains("cx")))))later()}).observe(content,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
addEventListener('hashchange',later);later();
})();
