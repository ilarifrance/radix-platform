'use strict';
/* Analisi commerciale: KPI, pipeline per mese e fase, funnel, team,
   attività e conversione, completezza dei dati e top opportunità, as in the
   CRM "Analytics" mockup. Computed from CRM rows only (crm-data.js). The
   "Previsione" panel is a plain weighted sum (amount × stored probability of
   the opportunity, else of its stage) over open deals; predict() adds a small
   naive Bayes estimate from the workspace's own closed deals.
   forecast(), closings() and predict() are pure and exported for tests.
   The page: one period selector (crm-analisi-core.js) drives the KPI row and the Pipeline, Risultati and
   Attività sections; each chart has titled axes, values on the bars and a one-line takeaway from fixed
   rules. Previsioni (forecast, closings, predict, simulator) look ahead from today on all the data. */
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
// Win chance from this workspace's own history: a small naive Bayes over the closed deals (won/lost), with three
// plain features: deal size (above the median closed amount or not), age (open longer than the typical winning
// cycle or not) and recent contact (an interaction with the deal's contact in the 30 days before it closed, or
// before now). Laplace smoothing; nothing leaves the browser. Needs MIN_CLOSED closed deals with both outcomes,
// else ready=false. Each open deal gets histP (0–100) next to its stage probability and the reasons behind it.
const MIN_CLOSED=8,DAY=864e5;
function predict(opportunities,interactions,stages,now){
  const t=now instanceof Date?now.getTime():(now??Date.now()),byId=new Map((stages||[]).filter(Boolean).map(s=>[s.id,s]));
  const amount=o=>{const v=Number(o.amount_cents);return Number.isFinite(v)&&v>0?v:0};
  const ms=v=>{const x=Date.parse(v||'');return Number.isFinite(x)?x:null};
  const touches=new Map();for(const i of interactions||[]){const at=i&&ms(i.occurred_at);if(i&&i.contact_id&&at!=null){const l=touches.get(i.contact_id)||[];l.push(at);touches.set(i.contact_id,l)}}
  const closed=(opportunities||[]).filter(o=>o&&(o.outcome==='won'||o.outcome==='lost')&&ms(o.created_at)!=null&&ms(o.closed_at)!=null);
  const won=closed.filter(o=>o.outcome==='won'),out={ready:false,closed:closed.length,won:won.length,min:MIN_CLOSED,baseRate:null,cycleDays:null,expected:0,items:[]};
  if(closed.length<MIN_CLOSED||!won.length||won.length===closed.length)return out;
  const median=a=>{const b=[...a].sort((x,y)=>x-y),n=b.length;return n?(n%2?b[(n-1)/2]:(b[n/2-1]+b[n/2])/2):0};
  const amountMid=median(closed.map(amount)),cycle=median(won.map(o=>(ms(o.closed_at)-ms(o.created_at))/DAY));
  const feats=(o,at)=>{const age=(at-ms(o.created_at))/DAY,l=o.contact_id?touches.get(o.contact_id)||[]:[];
    return {big:amount(o)>amountMid,old:age>Math.max(cycle,1),active:l.some(x=>x<=at&&x>at-30*DAY)}};
  const rows=closed.map(o=>({w:o.outcome==='won',f:feats(o,ms(o.closed_at))})),nw=won.length,nl=closed.length-nw;
  const like=(k,v,w)=>(rows.filter(r=>r.w===w&&r.f[k]===v).length+1)/((w?nw:nl)+2);
  out.ready=true;out.baseRate=Math.round(100*nw/closed.length);out.cycleDays=Math.round(cycle);
  const label={big:['importo sopra la media','importo nella media o sotto'],old:['aperta da più del ciclo tipico','entro il ciclo tipico'],active:['contatto sentito negli ultimi 30 giorni','nessun contatto negli ultimi 30 giorni']};
  for(const o of (opportunities||[]).filter(isOpen)){if(ms(o.created_at)==null)continue;const f=feats(o,t);let lw=Math.log(nw/closed.length),ll=Math.log(nl/closed.length);
    for(const k of ['big','old','active']){lw+=Math.log(like(k,f[k],true));ll+=Math.log(like(k,f[k],false))}
    const p=Math.round(100/(1+Math.exp(ll-lw))),sp=o.probability!=null&&o.probability!==''?Number(o.probability):byId.get(o.stage_id)?.probability;
    out.expected+=amount(o)*p/100;
    out.items.push({id:o.id,title:o.title,amount:amount(o),histP:p,stageP:Number.isFinite(Number(sp))&&sp!==null?Number(sp):null,why:['big','old','active'].map(k=>label[k][f[k]?0:1])})}
  out.expected=Math.round(out.expected);out.items.sort((a,b)=>Math.abs((b.stageP??b.histP)-b.histP)-Math.abs((a.stageP??a.histP)-a.histP)||b.amount-a.amount);
  return out}
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
const core={isOpen,forecast,closings,predict,simBaseline,simulate};
if(typeof module!=='undefined'&&module.exports)module.exports=core;
root.RadixCrmForecast=core;
if(typeof document==='undefined')return;
const content=document.getElementById('content'),nav=document.getElementById('navigation');if(!content||!nav)return;
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n};
const NS='http://www.w3.org/2000/svg',S=(tag,a)=>{const n=document.createElementNS(NS,tag);for(const k in a)n.setAttribute(k,String(a[k]));return n};
const eur=c=>{const v=Number(c||0)/100;return '€ '+(v>=1e6?(v/1e6).toLocaleString('it-IT',{maximumFractionDigits:1})+'M':v>=1e4?Math.round(v/1e3).toLocaleString('it-IT')+'K':v.toLocaleString('it-IT',{maximumFractionDigits:0}))};
const pct=(a,b)=>b?Math.round(a/b*100):0;
const MN=['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
// Chart colours come only from the page theme: --crm-chart-* in crm-light.css.

function ensure(){if(!nav.querySelector('a[href="#analytics"]')){const a=E('a','Analisi');a.href='#analytics';const c=nav.querySelector('a[href="#calendar"]')||nav.querySelector('a[href="#tasks"]');c?c.after(a):nav.append(a)}
  if((location.hash||'')!=='#analytics'){document.getElementById('analytics')?.remove();return null}
  let s=document.getElementById('analytics');if(!s||s.parentNode!==content){s=E('section',undefined,'panel an-section');s.id='analytics';const r=E('div',undefined,'row');r.append(E('h2','Analisi commerciale'));s.append(r);content.append(s)}
  content.querySelectorAll(':scope>section.rx-view').forEach(x=>{if(x!==s)x.classList.remove('rx-view')});s.classList.add('rx-view');document.documentElement.classList.add('rx-has-view');return s}

const panel=(t,cls,sub)=>{const p=E('section',undefined,'an-panel '+(cls||''));p.append(E('h4',t,'an-ptitle'));if(sub)p.append(E('p',sub,'an-sub'));return p};
const A=()=>root.RadixCrmAnalisi;
const DASH='—',val=o=>Number(o.amount_cents||0);
const MNL=m=>MN[Number(m.slice(5,7))-1]+' '+m.slice(2,4);
const dayIt=s=>s?new Date(s+'T12:00:00Z').toLocaleDateString('it-IT',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}):'';
const int=n=>Number(n||0).toLocaleString('it-IT');
// Stage colours in an order whose neighbours stay apart for colour-blind readers (checked with the dataviz validator).
const STAGE_TONES=[1,4,2,5,3].map(i=>'var(--crm-chart-'+i+')');
const take=(t,cls)=>{const p=E('p',undefined,'an-take'+(cls?' '+cls:''));p.append(E('span',t),E('small','Regola fissa, non AI'));return p};

/* period: one selector for every panel; the choice survives re-renders and, when allowed, reloads */
const PKEY='radix.crm.analisi.period';
let per=(()=>{try{const v=JSON.parse(localStorage.getItem(PKEY)||'null');if(v&&['month','quarter','year','custom'].includes(v.kind))return v}catch{}return {kind:'quarter'}})();
const savePer=()=>{try{localStorage.setItem(PKEY,JSON.stringify(per))}catch{}};
function currentRange(){const C=A();return C.periodRange(per.kind,Date.now(),per)||C.periodRange('quarter',Date.now())}
function periodBar(range,redraw){const bar=E('div',undefined,'an-period');const g=E('div',undefined,'an-seg');g.setAttribute('role','group');g.setAttribute('aria-label','Periodo');
  for(const [k,l] of [['month','Questo mese'],['quarter','Trimestre'],['year','Anno'],['custom','Personalizzato']]){const b=E('button',l);b.type='button';b.dataset.k=k;b.setAttribute('aria-pressed',String(per.kind===k));
    b.addEventListener('click',()=>{if(k==='custom'&&!per.from){per={kind:'custom',from:range.from,to:range.to}}else per={...per,kind:k};savePer();redraw('[data-k="'+k+'"]')});g.append(b)}
  bar.append(g);
  if(per.kind==='custom'){const f=E('div',undefined,'an-custom');const inp=(n,l)=>{const lb=E('label');const i=E('input');i.type='date';i.name=n;i.value=per[n]||range[n];lb.append(E('span',l),i);
      i.addEventListener('change',()=>{const next={kind:'custom',from:n==='from'?i.value:(per.from||range.from),to:n==='to'?i.value:(per.to||range.to)};
        if(!A().periodRange('custom',Date.now(),next)){msg.textContent='Intervallo non valido: «Dal» deve venire prima di «Al».';return}per=next;savePer();redraw('input[name="'+n+'"]')});return lb};
    const msg=E('p','','an-note an-custom-msg');msg.setAttribute('role','status');f.append(inp('from','Dal'),inp('to','Al'),msg);bar.append(f)}
  const prev=A().previousRange(range);bar.append(E('p',dayIt(range.from)+' – '+dayIt(range.to)+(prev?' · confronto con '+dayIt(prev.from)+' – '+dayIt(prev.to):''),'an-range'));
  return bar}

/* horizontal bars: rows of one or more bars (stacked segments), value written at the end of each bar,
   titled axes, ticks at 0, half and max. Works at phone width without scrolling. */
function hbars(cfg){const fig=E('figure',undefined,'an-fig');const fmt=cfg.fmt||eur;
  const max=Math.max(0,...cfg.rows.flatMap(r=>r.bars.map(b=>b.segs.reduce((a,s)=>a+(s.v||0),0))));
  if(!max){fig.append(E('p',cfg.empty||'Nessun dato nel periodo.','an-nodata'));if(cfg.take&&!/^Nessun/.test(cfg.take))fig.append(take(cfg.take));return fig}
  const box=E('div',undefined,'an-hb');box.setAttribute('role','img');box.setAttribute('aria-label',cfg.label);
  const head=E('div',undefined,'an-hb-row an-hb-head');head.append(E('span',cfg.yTitle,'an-hb-yt'),E('span'));box.append(head);
  for(const r of cfg.rows){const row=E('div',undefined,'an-hb-row');row.append(E('span',r.label,'an-hb-l'));const cell=E('div',undefined,'an-hb-cell');
    for(const b of r.bars){const tot=b.segs.reduce((a,s)=>a+(s.v||0),0);const line=E('div',undefined,'an-hb-line');const bar=E('span',undefined,'an-hb-bar');bar.style.setProperty('--p',String(tot/max));if(!tot)bar.classList.add('zero');
      for(const s of b.segs){if(!s.v)continue;const i=E('i');i.style.flexGrow=String(s.v);i.style.background=s.c;i.title=(s.name?s.name+': ':'')+(cfg.full||fmt)(s.v);bar.append(i)}
      line.title=(b.name?b.name+' · ':'')+r.label+': '+(cfg.full||fmt)(tot);line.append(bar,E('b',b.text??fmt(tot),'an-hb-v'));cell.append(line)}
    row.append(cell);box.append(row)}
  const ax=E('div',undefined,'an-hb-row an-hb-axis');const ticks=E('div',undefined,'an-hb-ticks');for(const f of [0,.5,1]){if(f===.5&&(fmt(max/2)===fmt(0)||fmt(max/2)===fmt(max)))continue;const t=E('i',fmt(max*f));t.style.setProperty('--x',String(f));ticks.append(t)}ax.append(E('span'),ticks);box.append(ax);
  const xt=E('div',undefined,'an-hb-row');xt.append(E('span'),E('span',cfg.xTitle,'an-hb-xt'));box.append(xt);fig.append(box);
  if(cfg.legend&&cfg.legend.length>1){const lg=E('p',undefined,'an-legend');for(const [n,c] of cfg.legend){const x=E('span',n);x.style.setProperty('--c',c);lg.append(x)}fig.append(lg)}
  if(cfg.take)fig.append(take(cfg.take));return fig}
const eurFull=c=>'€ '+(Number(c||0)/100).toLocaleString('it-IT',{maximumFractionDigits:0});
const cnt=n=>Math.round(n).toLocaleString('it-IT');

function kpiTile(label,value,sub,def){const a=E('article',undefined,'an-kpi');a.title=def;a.append(E('small',label),E('strong',value),E('span',sub),E('p',def,'an-def'));return a}
function section(title,sub,cls){const s=E('section',undefined,'an-sec '+(cls||''));const h=E('div',undefined,'an-sec-h');h.append(E('h3',title));if(sub)h.append(E('p',sub));s.append(h);return s}

function build(d,redraw){const C=A(),range=currentRange(),a=C.analyze(d,range,Date.now()),T=C.takeaway,all=d.opportunities,tasks=d.tasks,k=a.kpi;
  const opps=all.filter(isOpen),fc=forecast(all,d.stages);
  const wrap=E('div',undefined,'an');const main=E('div',undefined,'an-main');wrap.append(main);
  main.append(periodBar(range,redraw));
  /* empty state: say what is missing, never fill the gap with numbers */
  const miss=C.missingData(d);if(miss.length){const box=E('div',undefined,'an-empty');box.setAttribute('role','note');box.append(E('h4',all.length?'Mancano alcuni dati':'Ancora nessun dato da analizzare'));
    const ul=E('ul');for(const m of miss)ul.append(E('li',m));box.append(ul,E('p','Qui compaiono solo i valori salvati nel CRM: dove mancano trovi «—».','an-note'));if(!all.length){const go=E('a','Apri la pipeline →','an-link');go.href='#opportunities';box.append(go)}main.append(box)}
  /* KPI row */
  const kp=E('div',undefined,'an-kpis');
  kp.append(kpiTile('Pipeline aperta',k.open.total==null?DASH:eur(k.open.total),k.open.count?k.open.count+' trattative aperte':'Nessuna nel periodo','Valore delle trattative aperte con chiusura prevista nel periodo.'));
  kp.append(kpiTile('Valore ponderato',k.weighted.value==null?DASH:eur(k.weighted.value),k.weighted.withoutProb?k.weighted.withoutProb+' senza probabilità, escluse':k.open.count?'tutte con probabilità':'Nessuna nel periodo','Pipeline aperta × probabilità dell’opportunità (o della fase).'));
  kp.append(kpiTile('Vinte nel periodo',k.won.total==null?DASH:eur(k.won.total),k.won.count?k.won.count+(k.won.count===1?' trattativa':' trattative'):'Nessuna vinta','Trattative segnate come vinte con data di chiusura nel periodo.'));
  kp.append(kpiTile('Tasso di vittoria',k.winRate.rate==null?DASH:k.winRate.rate+'%',k.winRate.closed?k.winRate.won+' su '+k.winRate.closed+' chiuse':'Nessuna chiusa','Vinte diviso chiuse (vinte + perse) nel periodo.'));
  kp.append(kpiTile('Ciclo medio',k.cycle.days==null?DASH:k.cycle.days+(k.cycle.days===1?' giorno':' giorni'),k.cycle.n?'su '+k.cycle.n+(k.cycle.n===1?' vinta':' vinte'):'Nessuna vinta con date','Giorni medi dalla creazione alla vittoria, per le vinte nel periodo.'));
  main.append(kp);
  /* Pipeline */
  const sp=section('Pipeline','Trattative aperte con chiusura prevista nel periodo.','an-sec-pipe');const g1=E('div',undefined,'an-two');
  const totStage=a.stages.reduce((s,x)=>s+x.value,0);
  const p1=panel('Pipeline per fase','an-stages','Valore aperto in ogni fase, con quota e numero di trattative');
  p1.append(hbars({label:'Valore aperto per fase',yTitle:'Fase',xTitle:'Valore aperto (€)',rows:a.stages.map((s,j)=>({label:s.title,bars:[{segs:[{v:s.value,c:STAGE_TONES[j%5]}],text:eur(s.value)+' · '+pct(s.value,totStage)+'%'}]})),full:eurFull,empty:'Nessun valore aperto nel periodo.',take:T.stages(a,eur)}));
  const late2=a.stages.slice(-2);if(totStage&&late2.length===2)p1.append(E('p','Nelle ultime due fasi ('+late2.map(s=>s.title.toLowerCase()).join(' e ')+'): '+pct(late2[0].value+late2[1].value,totStage)+'% del valore, '+(late2[0].count+late2[1].count)+' trattative.','an-note'));
  const p2=panel('Pipeline per mese di chiusura','an-bars','Valore aperto per mese, diviso per fase');
  p2.append(hbars({label:'Valore aperto per mese di chiusura prevista e fase',yTitle:'Mese di chiusura',xTitle:'Valore aperto (€)',rows:a.months.map(m=>({label:MNL(m.month),bars:[{segs:m.byStage.map((v,j)=>({v,c:STAGE_TONES[j%5],name:a.stageTitles[j]})),text:m.total?eur(m.total):DASH}]})),full:eurFull,legend:a.stageTitles.map((t,j)=>[t,STAGE_TONES[j%5]]),empty:'Nessuna chiusura prevista nel periodo.',take:T.months(a,eur)}));
  g1.append(p1,p2);sp.append(g1);
  const top=panel('Top opportunità','an-top','Le trattative aperte del periodo con il valore più alto');
  if(a.top.length){const sc=E('div',undefined,'an-scroll');const t2=E('table');const h2=E('tr');['Opportunità','Azienda','Fase','Valore','Chiusura prevista','Responsabile'].forEach(x=>h2.append(E('th',x)));const th2=E('thead');th2.append(h2);t2.append(th2);const b2=E('tbody');
    for(const o of a.top){const tr=E('tr');const st=E('td');st.append(E('span',d.stages.find(s=>s.id===o.stage_id)?.title||DASH,'an-stage'));tr.append(E('td',o.title),E('td',d.companies.find(c=>c.id===o.company_id)?.name||DASH),st,E('td',val(o)?eur(val(o)):DASH),E('td',o.expected_close?dayIt(C.romeDay(o.expected_close)):DASH),E('td',d.members.find(m=>String(m.id)===String(o.owner_id))?.name||DASH));b2.append(tr)}
    t2.append(b2);sc.append(t2);top.append(sc)}else top.append(E('p','Nessuna trattativa aperta con chiusura prevista nel periodo.','an-nodata'));
  if(a.outside.undated||a.outside.other)top.append(E('p','Fuori da questo periodo: '+[a.outside.other?a.outside.other+' con chiusura in un altro periodo':'',a.outside.undated?a.outside.undated+' senza data di chiusura':''].filter(Boolean).join(', ')+'.','an-note'));
  const more=E('a','Vedi tutte le opportunità →','an-link');more.href='#opportunities';top.append(more);sp.append(top);main.append(sp);
  /* Risultati */
  const sr=section('Risultati','Trattative vinte e perse con data di chiusura nel periodo.','an-sec-res');const g2=E('div',undefined,'an-two');
  const WON='var(--crm-chart-1)',LOST='var(--crm-chart-5)';
  const p3=panel('Vinte e perse per mese','an-results','Valore chiuso per mese: una barra per le vinte, una per le perse');
  p3.append(hbars({label:'Valore vinto e perso per mese di chiusura',yTitle:'Mese di chiusura',xTitle:'Valore chiuso (€)',rows:a.results.map(m=>({label:MNL(m.month),bars:[{name:'Vinte',segs:[{v:m.won,c:WON,name:'Vinte'}],text:m.wonCount?eur(m.won)+' · '+m.wonCount:DASH},{name:'Perse',segs:[{v:m.lost,c:LOST,name:'Perse'}],text:m.lostCount?eur(m.lost)+' · '+m.lostCount:DASH}]})),full:eurFull,legend:[['Vinte',WON],['Perse',LOST]],empty:'Nessuna trattativa chiusa con un valore nel periodo.',take:T.results(a,eur)}));
  const p4=panel('Motivi di perdita','an-lost','Trattative perse nel periodo, per motivo');
  p4.append(hbars({label:'Trattative perse per motivo',yTitle:'Motivo',xTitle:'Trattative perse (numero)',fmt:cnt,full:n=>cnt(n)+' trattative',rows:a.lostReasons.slice(0,5).map(r=>({label:r.reason,bars:[{segs:[{v:r.count,c:LOST}],text:cnt(r.count)}]})),empty:'Nessuna trattativa persa nel periodo.',take:T.lostReasons(a)}));
  g2.append(p3,p4);sr.append(g2);
  const team=panel('Per responsabile','an-team','Pipeline aperta e vinte del periodo per responsabile');
  if(a.owners.length){const sc=E('div',undefined,'an-scroll');const tb=E('table');const hr=E('tr');['Responsabile','Pipeline aperta','Opp.','Vinte'].forEach(x=>hr.append(E('th',x)));const th=E('thead');th.append(hr);tb.append(th);const body=E('tbody');const tmax=Math.max(1,...a.owners.map(r=>r.open));
    for(const r of a.owners){const tr=E('tr');const bar=E('td');const i=E('i');i.style.width=Math.round(r.open/tmax*100)+'%';const track=E('span',undefined,'an-bar');track.append(i);bar.append(E('span',r.openCount?eur(r.open):DASH),track);tr.append(E('td',r.name),bar,E('td',r.openCount),E('td',r.wonCount?eur(r.won)+' · '+r.wonCount:DASH));body.append(tr)}
    tb.append(body);sc.append(tb);team.append(sc)}else team.append(E('p','Nessuna trattativa nel periodo.','an-nodata'));
  team.append(take(T.owners(a)));sr.append(team);main.append(sr);
  /* Attività */
  const sa=section('Attività','Attività in scadenza e interazioni registrate nel periodo.','an-sec-att');const g3=E('div',undefined,'an-three');const t=a.tasks;
  const act=panel('Attività e conversione','an-act','Dalle attività alle opportunità');
  const line=(p,x,y)=>{const r=E('p',undefined,'an-line');r.append(E('span',x),E('b',y));p.append(r)};
  line(act,'In scadenza nel periodo',t.total);line(act,'Completate',t.total?pct(t.done,t.total)+'% ('+t.done+')':DASH);line(act,'Scadute e non completate',t.total?t.late:DASH);
  line(act,'Collegate a un’opportunità',t.total?pct(t.linked,t.total)+'%':DASH);
  line(act,'Attività per opportunità (in totale)',all.length?(tasks.filter(x=>x.opportunity_id).length/all.length).toLocaleString('it-IT',{maximumFractionDigits:1}):DASH);
  line(act,'Valore medio opportunità aperta',opps.length&&opps.some(o=>val(o)>0)?eur(opps.reduce((s,o)=>s+val(o),0)/opps.length):DASH);
  if(t.undated)act.append(E('p',t.undated+' attività senza scadenza non entrano in nessun periodo.','an-note'));act.append(take(T.tasks(a)));
  const ip=panel('Interazioni per tipo','an-inter','Chiamate, email, riunioni e note registrate nel periodo');
  ip.append(hbars({label:'Interazioni per tipo',yTitle:'Tipo',xTitle:'Interazioni (numero)',fmt:cnt,full:n=>cnt(n)+' interazioni',rows:a.interactions.byKind.map((x,j)=>({label:x.label,bars:[{segs:[{v:x.count,c:'var(--crm-chart-2)'}],text:cnt(x.count)}]})),empty:'Nessuna interazione registrata nel periodo.',take:T.interactions(a)}));
  const q=panel('Completezza dati','an-quality','Stato attuale dei campi nel CRM: non dipende dal periodo');
  const ratio=(n,m)=>m?pct(n,m):null;
  const checks=[['Aziende',ratio(d.companies.filter(c=>d.contacts.some(x=>x.company_id===c.id)).length,d.companies.length),'con almeno un contatto'],['Contatti',ratio(d.contacts.filter(c=>c.company_id).length,d.contacts.length),'con azienda'],['Opportunità',ratio(all.filter(o=>o.amount_cents&&o.expected_close&&o.contact_id).length,all.length),'con valore, data e contatto'],['Attività',ratio(tasks.filter(x=>x.due_at&&x.assignee_id).length,tasks.length),'con scadenza e assegnatario']];
  const known=checks.filter(c=>c[1]!=null),avg=known.length?Math.round(known.reduce((s,c)=>s+c[1],0)/known.length):null;
  const big=E('div',undefined,'an-q-head');big.append(E('strong',avg==null?DASH:avg+'%'));const pb=E('span',undefined,'an-q-bar');const pi=E('i');pi.style.width=(avg||0)+'%';pb.append(pi);big.append(pb);q.append(big);
  const qg=E('div',undefined,'an-q-grid');for(const [n,v,h] of checks){const c=E('div');c.title=h;c.append(E('small',n),E('b',v==null?DASH:v+'%'),E('span',h));qg.append(c)}q.append(qg);
  g3.append(act,ip,q);sa.append(g3);main.append(sa);
  /* Previsioni */
  const sf=section('Previsioni','Da oggi in avanti, su tutte le trattative aperte e sullo storico: non cambiano con il periodo.','an-sec-fc');
  const fp=panel('Previsione','an-forecast','Tutte le trattative aperte pesate per probabilità (dell’opportunità o, se assente, della fase)');const fl=(x,y)=>line(fp,x,y);
  fl('Previsione ponderata',fc.open.withProbability?eur(fc.open.weighted):DASH);fl('Pipeline aperta',fc.open.count?eur(fc.open.total)+' · '+fc.open.count+' opp.':DASH);
  fl('Aperte senza probabilità',fc.open.withoutProbability+(fc.open.count?' su '+fc.open.count:''));if(fc.open.withoutProbability)fp.append(E('p','Escluse dalla previsione: imposta la probabilità sull’opportunità o sulla fase.','an-note'));
  fl('Vinte (tutto lo storico)',fc.won.count+' · '+eur(fc.won.total));fl('Perse (tutto lo storico)',fc.lost.count+' · '+eur(fc.lost.total));
  if(fc.closed)fl('Tasso di vittoria (tutto lo storico)',pct(fc.won.count,fc.closed)+'% ('+fc.won.count+' su '+fc.closed+' chiuse)');else fp.append(E('p','Nessuna trattativa chiusa (vinta o persa): tasso di vittoria non calcolabile.','an-note'));
  const cl=closings(all,d.stages,Date.now()),mon=m=>MN[Number(m.slice(5))-1]+' '+m.slice(0,4);
  if(fc.open.count){fp.append(E('h4','Chiusure attese'));const row=(l,x)=>{if(x.count)fl(l,x.count+' opp. · '+eur(x.total)+' · pesata '+eur(x.weighted))};
    row('Data di chiusura superata',cl.overdue);cl.months.forEach(x=>row(mon(x.month),x));row('Più avanti',cl.later);row('Senza data di chiusura',cl.undated);
    if(cl.overdue.count)fp.append(E('p','Aggiorna la data di chiusura delle trattative scadute: restano nella pipeline ma non in un mese preciso.','an-note'))}
  /* history-based win chance (predict): only with enough closed deals of this workspace */
  const pr=predict(all,d.interactions,d.stages,Date.now());fp.append(E('h4','Previsione dallo storico'));
  if(!pr.ready)fp.append(E('p','Servono almeno '+pr.min+' trattative chiuse, vinte e perse, per stimare le probabilità dallo storico (oggi '+pr.closed+').','an-note'));
  else{fl('Valore atteso dallo storico',eur(pr.expected));fl('Tasso storico di vittoria',pr.baseRate+'% su '+pr.closed+' chiuse · ciclo tipico '+pr.cycleDays+' giorni');
    const ol=E('ol',undefined,'an-predict');for(const x of pr.items.slice(0,5)){const li=E('li');li.append(E('b',x.title),E('span',' · storico '+x.histP+'%'+(x.stageP!=null?' · fase '+x.stageP+'%':'')),E('small',' '+x.why.join(', ')));ol.append(li)}
    if(pr.items.length){fp.append(E('p','Dove lo storico e la probabilità della fase differiscono di più:','an-note'),ol)}
    fp.append(E('p','Modello statistico semplice sulle trattative chiuse di questo workspace (importo, durata, contatti recenti): è una stima, non cambia le probabilità salvate.','an-note'))}
  sf.append(fp,simPanel(all));main.append(sf);
  /* in sintesi: the same fixed rules, in one place */
  const rail=E('aside',undefined,'an-rail');rail.append(E('h3','In sintesi'));
  const lines=[k.open.count?`Pipeline aperta del periodo: ${eur(k.open.total||0)} su ${k.open.count} trattative.`:'Nessuna trattativa aperta con chiusura prevista nel periodo.',
    k.weighted.value!=null?`Valore ponderato: ${eur(k.weighted.value)}${k.weighted.withoutProb?` (${k.weighted.withoutProb} senza probabilità escluse)`:''}.`:'',
    T.results(a,eur),T.stages(a,eur),T.tasks(a),avg==null?'':avg<80?`Completezza dati al ${avg}%: completare i campi rende queste analisi più affidabili.`:`Completezza dati buona (${avg}%).`].filter(Boolean);
  for(const l of lines)rail.append(E('p',l));rail.append(E('p','Regole fisse, non AI: frasi calcolate dai dati del CRM. La previsione somma valore × probabilità salvata; la previsione dallo storico usa un modello statistico semplice sulle trattative chiuse.','an-note'));
  const ask=E('a','Chiedi al Copilota commerciale in Sales Orbit →','an-ask');ask.href='/sales-orbit-higgsfield.html';rail.append(ask);
  main.append(rail);if(d.partial)main.append(E('p','Calcolato sui primi 100 record per tipo.','an-note'));return wrap}

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
    r.monthly.forEach((x,i)=>{const c=E('div');c.title=eur(x.total);const st=E('span');const seg=(v,cls)=>{const q=E('i',undefined,cls);q.style.height=(v/max*100)+'%';return q};st.append(seg(x.fresh,'new'),seg(x.pipeline,'pipe'));const d=new Date(t0.getFullYear(),t0.getMonth()+i+1,1);c.append(st,E('small',MN[d.getMonth()]));bars.append(c)});out.append(bars);const lg=E('p',undefined,'an-legend');[['Dalla pipeline aperta','var(--crm-chart-1)'],['Da nuove opportunità','var(--crm-chart-4)']].forEach(([t,col])=>{const x=E('span',t);x.style.setProperty('--c',col);lg.append(x)});out.append(lg);
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
async function render(){const s=ensure();if(!s)return;const d=await window.RadixCrmData?.load();if(!d||!s.isConnected)return;busy=true;const draw=focus=>{if(!s.isConnected)return;busy=true;s.querySelector(':scope>.an')?.remove();s.append(build(d,draw));emailPanel(s.querySelector(':scope>.an .an-sec-att'));if(focus)s.querySelector(':scope>.an '+focus)?.focus();requestAnimationFrame(()=>{busy=false})};s.querySelector(':scope>.an')?.remove();s.append(build(d,draw));emailPanel(s.querySelector(':scope>.an .an-sec-att'));requestAnimationFrame(()=>{busy=false;if(!s.isConnected)later()})}
let q=false;const later=()=>{if(busy||q)return;q=true;setTimeout(()=>{q=false;render()},60)};
new MutationObserver(m=>{if(m.some(r=>(r.type==='attributes'&&r.target.parentElement===content)||![...r.addedNodes,...r.removedNodes].every(n=>n.nodeType===1&&/\b(pv|cx|tv|cal|an)\b/.test(n.className||''))))later()}).observe(content,{childList:true});
new MutationObserver(later).observe(nav,{childList:true});addEventListener('hashchange',later);later();
})(typeof window!=='undefined'?window:globalThis);
