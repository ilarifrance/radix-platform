'use strict';
/* Analisi commerciale: KPI, pipeline per mese e fase, funnel, team,
   attività e conversione, completezza dei dati e top opportunità, as in the
   CRM "Analytics" mockup. Computed from CRM rows only (crm-data.js). The
   "Previsione" panel is a plain weighted sum (amount × stored probability of
   the opportunity, else of its stage) over open deals: no statistical model.
   forecast() and closings() are pure and exported for tests. */
(function(root){
const isOpen=o=>!!o&&(o.outcome==null||o.outcome==='open');
function forecast(opportunities,stages){
  const byId=new Map((stages||[]).filter(Boolean).map(s=>[s.id,s]));
  const amount=o=>{if(o.amount_cents==null||o.amount_cents==='')return 0;const v=Number(o.amount_cents);return Number.isFinite(v)?v:0};
  const prob=v=>{if(v==null||v==='')return null;const n=Number(v);return Number.isFinite(n)&&n>=0&&n<=100?n:null};
  const r={open:{count:0,total:0,weighted:0,withProbability:0,withoutProbability:0},won:{count:0,total:0},lost:{count:0,total:0},closed:0,winRate:null,lostReasons:[]};
  const reasons=new Map();
  for(const o of opportunities||[]){if(!o)continue;const v=amount(o);
    if(o.outcome==='won'){r.won.count++;r.won.total+=v}
    else if(o.outcome==='lost'){r.lost.count++;r.lost.total+=v;const k=typeof o.lost_reason==='string'&&o.lost_reason.trim()?o.lost_reason.trim():'Motivo non indicato';reasons.set(k,(reasons.get(k)||0)+1)}
    else if(isOpen(o)){r.open.count++;r.open.total+=v;const p=prob(o.probability)??prob(byId.get(o.stage_id)?.probability);if(p==null)r.open.withoutProbability++;else{r.open.withProbability++;r.open.weighted+=v*p/100}}}
  r.open.weighted=Math.round(r.open.weighted);r.closed=r.won.count+r.lost.count;r.winRate=r.closed?r.won.count/r.closed:null;
  r.lostReasons=[...reasons].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'it')).slice(0,3).map(([reason,count])=>({reason,count}));
  return r}
// Expected closes of open deals: past due, the current month and the next two, later, no date. Each bucket
// carries count, total and weighted value (same probability rule as forecast()). Dates are compared as
// YYYY-MM-DD strings against today's date in Italy, so no timezone shifts a deal into another month.
function closings(opportunities,stages,now){
  const byId=new Map((stages||[]).filter(Boolean).map(s=>[s.id,s]));
  const prob=v=>{if(v==null||v==='')return null;const n=Number(v);return Number.isFinite(n)&&n>=0&&n<=100?n:null};
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome'}).format(now instanceof Date?now:new Date(now??Date.now()));
  const ym=today.slice(0,7),months=[ym];for(let i=1;i<3;i++){const [y,m]=months[i-1].split('-').map(Number);months.push(m===12?(y+1)+'-01':y+'-'+String(m+1).padStart(2,'0'))}
  const b=()=>({count:0,total:0,weighted:0});const r={overdue:b(),months:months.map(month=>({month,...b()})),later:b(),undated:b()};
  for(const o of opportunities||[]){if(!isOpen(o))continue;const v=Number(o.amount_cents)||0,p=prob(o.probability)??prob(byId.get(o.stage_id)?.probability)??0;
    const d=typeof o.expected_close==='string'?o.expected_close.slice(0,10):'';
    const k=!/^\d{4}-\d{2}-\d{2}$/.test(d)?r.undated:d<today?r.overdue:(r.months.find(x=>x.month===d.slice(0,7))||(d.slice(0,7)>months[2]?r.later:r.overdue));
    k.count++;k.total+=v;k.weighted+=v*p/100}
  for(const k of [r.overdue,...r.months,r.later,r.undated])k.weighted=Math.round(k.weighted);
  return r}
// Revenue simulator. simBaseline() reads starting values from the CRM: win rate of closed deals, average
// won amount (else average open amount), opportunities created in the last 90 days per month, median
// days from creation to win. Missing values stay null and the page asks for them. simulate() is a plain
// what-if: the open pipeline closes at the win rate, spread evenly over the sales cycle; each month's new
// opportunities close one cycle later at the same rate. It is a simulation, not a forecast.
function simBaseline(opportunities,now){
  const t=now instanceof Date?now.getTime():Number(now??Date.now()),day=864e5,ms=v=>{const x=Date.parse(v);return Number.isFinite(x)?x:null};
  const all=(opportunities||[]).filter(Boolean),won=all.filter(o=>o.outcome==='won'),lost=all.filter(o=>o.outcome==='lost'),open=all.filter(isOpen),amt=o=>Number(o.amount_cents)||0;
  const closed=won.length+lost.length,base=won.length?won:open.filter(o=>amt(o)>0);
  const recent=all.filter(o=>{const c=ms(o.created_at);return c!=null&&c<=t&&c>t-90*day}).length;
  const days=won.map(o=>{const a=ms(o.created_at),b=ms(o.closed_at);return a!=null&&b!=null&&b>=a?(b-a)/day:null}).filter(x=>x!=null).sort((a,b)=>a-b);
  const median=days.length?(days.length%2?days[(days.length-1)/2]:(days[days.length/2-1]+days[days.length/2])/2):null;
  return {openTotal:open.reduce((a,o)=>a+amt(o),0),openCount:open.length,closed,
    winRate:closed?Math.round(won.length/closed*100):null,
    avgDeal:base.length?Math.round(base.reduce((a,o)=>a+amt(o),0)/base.length):null,avgFrom:won.length?'won':base.length?'open':null,
    newPerMonth:all.some(o=>ms(o.created_at)!=null)?Math.round(recent/3*10)/10:null,
    cycleMonths:median==null?null:Math.max(1,Math.ceil(median/30))}}
function simulate(p){
  const num=(v,lo,hi)=>{const n=Number(v);return Number.isFinite(n)?Math.min(hi,Math.max(lo,n)):lo};
  const months=Math.round(num(p&&p.months,1,24)),w=num(p&&p.winRate,0,100)/100,avg=num(p&&p.avgDeal,0,9e12),n=num(p&&p.newPerMonth,0,1e4),cycle=Math.round(num(p&&p.cycleMonths,1,24)),open=num(p&&p.openTotal,0,9e15);
  const monthly=Array.from({length:months},()=>({pipeline:0,fresh:0}));
  for(let i=0;i<Math.min(cycle,months);i++)monthly[i].pipeline=open*w/cycle;
  for(let m=1;m<=months;m++){const c=m+cycle;if(c<=months)monthly[c-1].fresh+=n*w*avg}
  const r=monthly.map(x=>({pipeline:Math.round(x.pipeline),fresh:Math.round(x.fresh),total:Math.round(x.pipeline+x.fresh)}));
  const fromPipeline=r.reduce((a,x)=>a+x.pipeline,0),fromNew=r.reduce((a,x)=>a+x.fresh,0);
  return {months,monthly:r,fromPipeline,fromNew,total:fromPipeline+fromNew,deals:Math.round(n*Math.max(0,months-cycle)*w*10)/10}}
const core={isOpen,forecast,closings,simBaseline,simulate};
if(typeof module!=='undefined'&&module.exports)module.exports=core;
root.RadixCrmForecast=core;
if(typeof document==='undefined')return;
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

function build(d){const all=d.opportunities,opps=all.filter(isOpen),fc=forecast(all,d.stages),tasks=d.tasks,val=o=>Number(o.amount_cents||0),total=opps.reduce((s,o)=>s+val(o),0);
  const stages=d.stages.filter(s=>all.some(o=>o.process_id===s.process_id)).sort((a,b)=>a.position-b.position);const last=stages.at(-1);
  const late=stages.slice(-2).map(s=>s.id),lateVal=opps.filter(o=>late.includes(o.stage_id)).reduce((s,o)=>s+val(o),0);
  const root=E('div',undefined,'an');const main=E('div',undefined,'an-main');
  /* KPI */
  const k=E('div',undefined,'an-kpis');const kpi=(l,v,s)=>{const a=E('article',undefined,'an-kpi');a.append(E('small',l),E('strong',v),E('span',s));k.append(a)};
  kpi('Pipeline aperta',eur(total),opps.length+' opportunità aperte');kpi('Valore medio',eur(opps.length?total/opps.length:0),'per opportunità aperta');
  kpi('Nelle ultime due fasi',pct(lateVal,total)+'%',eur(lateVal)+' in '+stages.slice(-2).map(s=>s.title.toLowerCase()).join(' e '));
  kpi('Attività per opportunità',(all.length?tasks.filter(t=>t.opportunity_id).length/all.length:0).toLocaleString('it-IT',{maximumFractionDigits:1}),tasks.length+' attività totali');
  kpi('Interazioni registrate',d.interactions.length,d.contacts.length+' contatti nel CRM');main.append(k);
  /* forecast: weighted open pipeline, won/lost, win rate, lost reasons */
  const fp=panel('Previsione','an-forecast','Trattative aperte pesate per probabilità (dell’opportunità o, se assente, della fase)');const line=(a,b)=>{const r=E('p',undefined,'an-line');r.append(E('span',a),E('b',b));fp.append(r)};
  line('Previsione ponderata',eur(fc.open.weighted));line('Pipeline aperta',eur(fc.open.total)+' · '+fc.open.count+' opp.');
  line('Aperte senza probabilità',fc.open.withoutProbability+(fc.open.count?' su '+fc.open.count:''));if(fc.open.withoutProbability)fp.append(E('p','Escluse dalla previsione: imposta la probabilità sull’opportunità o sulla fase.','an-note'));
  line('Vinte',fc.won.count+' · '+eur(fc.won.total));line('Perse',fc.lost.count+' · '+eur(fc.lost.total));
  if(fc.closed)line('Tasso di vittoria',pct(fc.won.count,fc.closed)+'% ('+fc.won.count+' su '+fc.closed+' chiuse)');else fp.append(E('p','Nessuna trattativa chiusa (vinta o persa): tasso di vittoria non calcolabile.','an-note'));
  if(fc.lostReasons.length){fp.append(E('h4','Principali motivi di perdita'));const ol=E('ol');for(const x of fc.lostReasons)ol.append(E('li',x.reason+' · '+x.count));fp.append(ol)}else if(fc.closed)fp.append(E('p','Nessuna trattativa persa.','an-note'));
  const cl=closings(all,d.stages,Date.now()),mon=m=>MN[Number(m.slice(5))-1]+' '+m.slice(0,4);
  if(fc.open.count){fp.append(E('h4','Chiusure attese'));const row=(l,x)=>{if(x.count)line(l,x.count+' opp. · '+eur(x.total)+' · pesata '+eur(x.weighted))};
    row('Data di chiusura superata',cl.overdue);cl.months.forEach(x=>row(mon(x.month),x));row('Più avanti',cl.later);row('Senza data di chiusura',cl.undated);
    if(cl.overdue.count)fp.append(E('p','Aggiorna la data di chiusura delle trattative scadute: restano nella pipeline ma non in un mese preciso.','an-note'))}
  main.append(fp);
  main.append(simPanel(all));
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
  const q=panel('Completezza dati','an-quality','Campi compilati nel CRM');const checks=[['Aziende',d.companies.length?pct(d.companies.filter(c=>d.contacts.some(x=>x.company_id===c.id)).length,d.companies.length):0,'con almeno un contatto'],['Contatti',pct(d.contacts.filter(c=>c.company_id).length,d.contacts.length),'con azienda'],['Opportunità',pct(all.filter(o=>o.amount_cents&&o.expected_close&&o.contact_id).length,all.length),'con valore, data e contatto'],['Attività',pct(tasks.filter(t=>t.due_at&&t.assignee_id).length,tasks.length),'con scadenza e assegnatario']];
  const avg=Math.round(checks.reduce((a,c)=>a+c[1],0)/checks.length);const big=E('div',undefined,'an-q-head');big.append(E('strong',avg+'%'));const pb=E('span',undefined,'an-q-bar');const pi=E('i');pi.style.width=avg+'%';pb.append(pi);big.append(pb);q.append(big);
  const qg=E('div',undefined,'an-q-grid');for(const [n,v,h] of checks){const c=E('div');c.title=h;c.append(E('small',n),E('b',v+'%'),E('span',h));qg.append(c)}q.append(qg);three.append(team,act,q);main.append(three);
  /* top opportunities */
  const top=panel('Top opportunità','an-top');const t2=E('table');const h2=E('tr');['Opportunità','Azienda','Fase','Valore','Chiusura prevista','Responsabile'].forEach(x=>h2.append(E('th',x)));const th2=E('thead');th2.append(h2);t2.append(th2);const b2=E('tbody');
  for(const o of [...opps].sort((a,b)=>val(b)-val(a)).slice(0,6)){const tr=E('tr');const st=E('td');st.append(E('span',d.stages.find(s=>s.id===o.stage_id)?.title||'—','an-stage'));tr.append(E('td',o.title),E('td',d.companies.find(c=>c.id===o.company_id)?.name||'—'),st,E('td',eur(val(o))),E('td',o.expected_close?new Date(o.expected_close).toLocaleDateString('it-IT',{day:'2-digit',month:'short',year:'numeric'}):'—'),E('td',d.members.find(m=>String(m.id)===String(o.owner_id))?.name||'—'));b2.append(tr)}
  t2.append(b2);top.append(t2);const more=E('a','Vedi tutte le opportunità →','an-link');more.href='#opportunities';top.append(more);main.append(top);
  /* rail */
  const rail=E('aside',undefined,'an-rail');rail.append(E('h3','In sintesi'));const best=stages.map(s=>[s,opps.filter(o=>o.stage_id===s.id).reduce((a,o)=>a+val(o),0)]).sort((a,b)=>b[1]-a[1])[0];
  const lines=[`La pipeline aperta vale ${eur(total)} su ${opps.length} opportunità.`,fc.open.withProbability?`Previsione ponderata: ${eur(fc.open.weighted)}${fc.open.withoutProbability?` (${fc.open.withoutProbability} aperte senza probabilità escluse)`:''}.`:'Nessuna trattativa aperta ha una probabilità: previsione non disponibile.',fc.closed?`Tasso di vittoria ${pct(fc.won.count,fc.closed)}% su ${fc.closed} trattative chiuse.`:'',best?`La fase con più valore è ${best[0].title} (${pct(best[1],total)}%).`:'',`${pct(linked,tasks.length)}% delle attività è collegato a un’opportunità.`,avg<80?`Completezza dati al ${avg}%: completare i campi rende queste analisi più affidabili.`:`Completezza dati buona (${avg}%).`].filter(Boolean);
  for(const l of lines)rail.append(E('p',l));rail.append(E('p','Calcolato dai dati del CRM. La previsione somma valore × probabilità salvata: nessun modello statistico.','an-note'));
  const ask=E('a','Chiedi al Copilota commerciale in Sales Orbit →','an-ask');ask.href='/sales-orbit-higgsfield.html';rail.append(ask);
  root.append(main,rail);if(d.partial)root.append(E('p','Calcolato sui primi 100 record per tipo.','an-note'));return root}

/* revenue simulator: starting values from the CRM, editable; edits survive re-renders of the view */
const simEdits={};
function simPanel(all){const b=simBaseline(all,Date.now());
  const p=panel('Simulatore ricavi','an-sim','Cambia i valori per vedere quanto potresti incassare. È una simulazione, non una previsione.');
  const fields=[['winRate','Tasso di vittoria (%)',b.winRate,b.winRate!=null?'Dai dati: '+b.winRate+'% su '+b.closed+' chiuse':'Nessuna trattativa chiusa: inserisci un valore',1],
    ['avgDeal','Valore medio per contratto (€)',b.avgDeal==null?null:Math.round(b.avgDeal/100),b.avgFrom==='won'?'Dai dati: media delle vinte':b.avgFrom==='open'?'Dai dati: media delle aperte (nessuna vinta)':'Nessun importo nel CRM: inserisci un valore',100],
    ['newPerMonth','Nuove opportunità al mese',b.newPerMonth,b.newPerMonth!=null?'Dai dati: create negli ultimi 90 giorni':'Data di creazione assente: inserisci un valore',0.5],
    ['cycleMonths','Durata della trattativa (mesi)',b.cycleMonths,b.cycleMonths!=null?'Dai dati: mediana dalla creazione alla vittoria':'Nessuna vinta con date: inserisci un valore',1]];
  const form=E('div',undefined,'an-sim-form'),inputs={};
  for(const [k,label,def,hint,step] of fields){const l=E('label');const i=E('input');i.type='number';i.min='0';i.step=String(step);i.name=k;
    const v=simEdits[k]!==undefined?simEdits[k]:def;if(v!=null)i.value=String(v);i.placeholder='da inserire';inputs[k]=i;l.append(E('span',label),i,E('small',hint));form.append(l)}
  const hl=E('label');const hz=E('select');hz.name='months';for(const m of [3,6,12]){const o=E('option',m+' mesi');o.value=String(m);hz.append(o)}hz.value=String(simEdits.months||6);hl.append(E('span','Orizzonte'),hz,E('small','Pipeline aperta: '+eur(b.openTotal)+' su '+b.openCount+' opp.'));form.append(hl);
  const out=E('div',undefined,'an-sim-out');p.append(form,out);
  const draw=()=>{const val=k=>inputs[k].value===''?null:Number(inputs[k].value);const miss=fields.filter(f=>val(f[0])==null).map(f=>f[1].replace(/ \(.*\)$/,'').toLowerCase());out.replaceChildren();
    if(miss.length){out.append(E('p','Per simulare inserisci: '+miss.join(', ')+'.','an-note'));return}
    const r=simulate({openTotal:b.openTotal,winRate:val('winRate'),avgDeal:val('avgDeal')*100,newPerMonth:val('newPerMonth'),cycleMonths:val('cycleMonths'),months:Number(hz.value)});
    const line=(a,c)=>{const x=E('p',undefined,'an-line');x.append(E('span',a),E('b',c));out.append(x)};
    line('Incasso simulato in '+r.months+' mesi',eur(r.total));line('Dalla pipeline aperta',eur(r.fromPipeline));line('Da nuove opportunità',eur(r.fromNew)+(r.deals?' · circa '+r.deals.toLocaleString('it-IT')+' contratti':''));
    const max=Math.max(1,...r.monthly.map(x=>x.total)),bars=E('div',undefined,'an-sim-bars'),t0=new Date();
    r.monthly.forEach((x,i)=>{const c=E('div');c.title=eur(x.total);const st=E('span');const seg=(v,cls)=>{const q=E('i',undefined,cls);q.style.height=(v/max*100)+'%';return q};st.append(seg(x.fresh,'new'),seg(x.pipeline,'pipe'));const d=new Date(t0.getFullYear(),t0.getMonth()+i+1,1);c.append(st,E('small',MN[d.getMonth()]));bars.append(c)});out.append(bars);const lg=E('p',undefined,'an-legend');[['Dalla pipeline aperta','#26d796'],['Da nuove opportunità','#4aa3ff']].forEach(([t,col])=>{const x=E('span',t);x.style.setProperty('--c',col);lg.append(x)});out.append(lg);
    if(r.fromNew===0&&Number(inputs.cycleMonths.value)>=r.months)out.append(E('p','Le nuove opportunità chiudono dopo l’orizzonte scelto: allunga l’orizzonte per vederle.','an-note'))};
  for(const i of [...Object.values(inputs),hz])i.addEventListener('input',()=>{simEdits[i.name]=i.value===''?null:i.name==='months'?Number(i.value):Number(i.value);draw()});
  draw();return p}

/* email campaigns: clicks on tracked links (RADIX does not track opens) */
async function emailPanel(main){const api=window.RadixSalesApp?.api;if(!api||!main)return;let r;try{r=await api('email_clicks',{})}catch{return}if(!main.isConnected)return;
  const p=panel('Campagne email','an-email','Clic sui link tracciati delle campagne inviate dal CRM');const camps=(r&&r.campaigns)||[];
  if(!camps.length)p.append(E('p','Ancora nessun clic. I clic arrivano quando i destinatari aprono un link di una campagna inviata dal CRM.','an-note'));
  else{const tb=E('table');const hr=E('tr');['Campagna','Persone','Clic','Ultimo clic'].forEach(x=>hr.append(E('th',x)));const th=E('thead');th.append(hr);tb.append(th);const b=E('tbody');
    for(const c of camps.slice(0,6)){const tr=E('tr');tr.append(E('td',c.campaign||'—'),E('td',c.people),E('td',c.clicks),E('td',c.last_at?new Date(c.last_at).toLocaleDateString('it-IT',{day:'2-digit',month:'short'}):'—'));b.append(tr)}tb.append(b);p.append(tb);
    p.append(E('p',((r.contacts||[]).length)+' contatti hanno cliccato almeno una volta. Per ognuno il CRM ha creato un’attività «Richiama».','an-note'))}
  p.append(E('p','Le aperture delle email non vengono tracciate.','an-note'));const go=E('a','Apri le campagne →','an-link');go.href='#contacts';p.append(go);main.append(p)}

let busy=false;
async function render(){const s=ensure();if(!s)return;const d=await window.RadixCrmData?.load();if(!d||!s.isConnected)return;busy=true;s.querySelector(':scope>.an')?.remove();s.append(build(d));emailPanel(s.querySelector(':scope>.an .an-main'));requestAnimationFrame(()=>{busy=false;if(!s.isConnected)later()})}
let q=false;const later=()=>{if(busy||q)return;q=true;setTimeout(()=>{q=false;render()},60)};
new MutationObserver(m=>{if(m.some(r=>(r.type==='attributes'&&r.target.parentElement===content)||![...r.addedNodes,...r.removedNodes].every(n=>n.nodeType===1&&/\b(pv|cx|tv|cal|an)\b/.test(n.className||''))))later()}).observe(content,{childList:true});
new MutationObserver(later).observe(nav,{childList:true});addEventListener('hashchange',later);later();
})(typeof window!=='undefined'?window:globalThis);
