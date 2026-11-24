'use strict';
/* Analisi CRM, pure logic: the period (this month / quarter / year / custom), the five KPI tiles, the
   rows behind each chart and the one-line takeaways. Everything is computed from the rows the CRM
   stores (crm-data.js); a value with no data is null and the page shows «—». The takeaways are fixed
   rules written here, not AI. Dates are compared as YYYY-MM-DD in Europe/Rome, so a deal closed late
   in the evening never moves to the next day or month.
   Which date puts a row in the period:
   - open deals: expected_close (the period is a close-date filter, as in Salesforce dashboards);
   - won and lost deals: closed_at;
   - tasks: due_at; interactions: occurred_at. */
(function(root){
const DAY=864e5,ISO=/^\d{4}-\d{2}-\d{2}$/;
const fmtRome=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome'});
// YYYY-MM-DD in Italy for a date-only string, an ISO timestamp or a Date; '' when missing or invalid.
function romeDay(v){
  if(v==null||v==='')return '';
  if(typeof v==='string'&&ISO.test(v))return v;
  const t=v instanceof Date?v.getTime():typeof v==='number'?v:Date.parse(String(v));
  return Number.isFinite(t)?fmtRome.format(new Date(t)):''}
const pad=n=>String(n).padStart(2,'0');
const ymd=(y,m,d)=>y+'-'+pad(m)+'-'+pad(d);
const lastDay=(y,m)=>new Date(Date.UTC(y,m,0)).getUTCDate();
const toUTC=s=>Date.UTC(+s.slice(0,4),+s.slice(5,7)-1,+s.slice(8,10));
const fromUTC=t=>new Date(t).toISOString().slice(0,10);
const validDay=s=>typeof s==='string'&&ISO.test(s)&&fromUTC(toUTC(s))===s;
const PERIODS=['month','quarter','year','custom'];
// The period as {kind, from, to, days}, both ends included. Custom needs valid from <= to, else null.
function periodRange(kind,now,custom){
  const today=romeDay(now instanceof Date||typeof now==='number'?now:Date.now());
  const y=+today.slice(0,4),m=+today.slice(5,7);let from,to;
  if(kind==='month'){from=ymd(y,m,1);to=ymd(y,m,lastDay(y,m))}
  else if(kind==='quarter'){const q=Math.floor((m-1)/3)*3+1;from=ymd(y,q,1);to=ymd(y,q+2,lastDay(y,q+2))}
  else if(kind==='year'){from=ymd(y,1,1);to=ymd(y,12,31)}
  else if(kind==='custom'){const f=custom&&custom.from,t=custom&&custom.to;if(!validDay(f)||!validDay(t)||f>t)return null;from=f;to=t}
  else return null;
  return {kind,from,to,days:Math.round((toUTC(to)-toUTC(from))/DAY)+1}}
// The period just before, of the same kind: previous month, quarter or year; for custom, the same number of days.
function previousRange(r){
  if(!r)return null;
  if(r.kind==='custom'){const to=fromUTC(toUTC(r.from)-DAY),from=fromUTC(toUTC(r.from)-r.days*DAY);return {kind:'custom',from,to,days:r.days}}
  const back=r.kind==='month'?1:r.kind==='quarter'?3:12;let y=+r.from.slice(0,4),m=+r.from.slice(5,7)-back;while(m<1){m+=12;y--}
  const e=m+back-1,ey=y+Math.floor((e-1)/12),em=(e-1)%12+1;const from=ymd(y,m,1),to=ymd(ey,em,lastDay(ey,em));
  return {kind:r.kind,from,to,days:Math.round((toUTC(to)-toUTC(from))/DAY)+1}}
const inRange=(v,r)=>{const d=romeDay(v);return !!d&&!!r&&d>=r.from&&d<=r.to};
// Months touched by the period, 'YYYY-MM', at most 24 (a longer custom period shows its first 24).
function monthsIn(r){if(!r)return[];const out=[];let y=+r.from.slice(0,4),m=+r.from.slice(5,7);const end=r.to.slice(0,7);
  while(out.length<24){const k=y+'-'+pad(m);out.push(k);if(k>=end)break;m++;if(m>12){m=1;y++}}return out}

const isOpen=o=>!!o&&(o.outcome==null||o.outcome==='open');
const amount=o=>{const v=Number(o&&o.amount_cents);return Number.isFinite(v)&&v>0?v:0};
const prob=v=>{if(v==null||v==='')return null;const n=Number(v);return Number.isFinite(n)&&n>=0&&n<=100?n:null};
const KINDS={call:'Chiamata',email:'Email',meeting:'Riunione',note:'Nota'};

/* Everything the page shows for one period. d: {opportunities, stages, tasks, interactions, members}. */
function analyze(d,range,now){
  d=d||{};const t=now instanceof Date?now.getTime():Number(now??Date.now()),today=romeDay(t);
  const opps=(d.opportunities||[]).filter(Boolean),stagesAll=(d.stages||[]).filter(Boolean);
  const stageById=new Map(stagesAll.map(s=>[s.id,s]));
  const stages=stagesAll.filter(s=>opps.some(o=>o.process_id===s.process_id||o.stage_id===s.id)).sort((a,b)=>(a.position??0)-(b.position??0));
  const prev=previousRange(range);
  const open=opps.filter(isOpen),openIn=open.filter(o=>inRange(o.expected_close,range));
  const won=opps.filter(o=>o.outcome==='won'),lost=opps.filter(o=>o.outcome==='lost');
  const wonIn=won.filter(o=>inRange(o.closed_at,range)),lostIn=lost.filter(o=>inRange(o.closed_at,range));
  const sum=l=>l.reduce((a,o)=>a+amount(o),0);
  // KPI: weighted value uses the deal's probability, else its stage's; deals with neither are counted apart.
  let weighted=0,withProb=0;for(const o of openIn){const p=prob(o.probability)??prob(stageById.get(o.stage_id)?.probability);if(p!=null){withProb++;weighted+=amount(o)*p/100}}
  const cycles=wonIn.map(o=>{const a=Date.parse(o.created_at||''),b=Date.parse(o.closed_at||'');return Number.isFinite(a)&&Number.isFinite(b)&&b>=a?(b-a)/DAY:null}).filter(x=>x!=null);
  const closedIn=wonIn.length+lostIn.length;
  const kpi={
    open:{count:openIn.length,total:openIn.length?sum(openIn):null},
    weighted:{value:withProb?Math.round(weighted):null,withProb,withoutProb:openIn.length-withProb},
    won:{count:wonIn.length,total:wonIn.length?sum(wonIn):null},
    winRate:{won:wonIn.length,closed:closedIn,rate:closedIn?Math.round(wonIn.length/closedIn*100):null},
    cycle:{days:cycles.length?Math.round(cycles.reduce((a,b)=>a+b,0)/cycles.length):null,n:cycles.length}};
  // Pipeline: open value per stage and per month of expected close, inside the period.
  const stageRows=stages.map(s=>{const l=openIn.filter(o=>o.stage_id===s.id);return {id:s.id,title:s.title,value:sum(l),count:l.length}});
  const months=monthsIn(range);
  const monthRows=months.map(mo=>{const l=openIn.filter(o=>romeDay(o.expected_close).slice(0,7)===mo);return {month:mo,total:sum(l),count:l.length,byStage:stages.map(s=>sum(l.filter(o=>o.stage_id===s.id)))}});
  const lateInPeriod=openIn.filter(o=>romeDay(o.expected_close)<today).length;
  const outside={undated:open.filter(o=>!romeDay(o.expected_close)).length,other:open.filter(o=>romeDay(o.expected_close)&&!inRange(o.expected_close,range)).length};
  const top=[...openIn].sort((a,b)=>amount(b)-amount(a)).slice(0,6);
  // Results: won and lost per month of closing, the period before, lost reasons.
  const resultRows=months.map(mo=>{const w=wonIn.filter(o=>romeDay(o.closed_at).slice(0,7)===mo),l=lostIn.filter(o=>romeDay(o.closed_at).slice(0,7)===mo);return {month:mo,won:sum(w),lost:sum(l),wonCount:w.length,lostCount:l.length}});
  const wonPrev=won.filter(o=>inRange(o.closed_at,prev));
  const reasons=new Map();for(const o of lostIn){const k=typeof o.lost_reason==='string'&&o.lost_reason.trim()?o.lost_reason.trim():'Motivo non indicato';reasons.set(k,(reasons.get(k)||0)+1)}
  const lostReasons=[...reasons].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'it')).map(([reason,count])=>({reason,count}));
  // Per owner: open pipeline of the period and won in the period.
  const owners=new Map();const own=(o)=>{const k=o.owner_id==null||o.owner_id===''?'':String(o.owner_id);if(!owners.has(k))owners.set(k,{id:k,open:0,openCount:0,won:0,wonCount:0});return owners.get(k)};
  for(const o of openIn){const r=own(o);r.open+=amount(o);r.openCount++}for(const o of wonIn){const r=own(o);r.won+=amount(o);r.wonCount++}
  const members=d.members||[];const ownerRows=[...owners.values()].map(r=>({...r,name:r.id?(members.find(m=>String(m.id)===r.id)?.name||'Membro '+r.id):'Non assegnato'})).sort((a,b)=>b.open-a.open||b.won-a.won||a.name.localeCompare(b.name,'it'));
  // Activities: tasks due in the period, interactions logged in the period.
  const tasks=(d.tasks||[]).filter(Boolean),taskIn=tasks.filter(x=>inRange(x.due_at,range));
  const taskStats={total:taskIn.length,done:taskIn.filter(x=>x.status==='done').length,late:taskIn.filter(x=>x.status!=='done'&&romeDay(x.due_at)<today).length,linked:taskIn.filter(x=>x.opportunity_id).length,undated:tasks.filter(x=>!romeDay(x.due_at)).length};
  const inter=(d.interactions||[]).filter(Boolean).filter(x=>inRange(x.occurred_at,range));const kinds=new Map();for(const x of inter){const k=KINDS[x.kind]?x.kind:'other';kinds.set(k,(kinds.get(k)||0)+1)}
  const byKind=['call','email','meeting','note','other'].filter(k=>kinds.has(k)).map(k=>({kind:k,label:KINDS[k]||'Altro',count:kinds.get(k)}));
  return {range,prev,today,kpi,stages:stageRows,months:monthRows,stageTitles:stages.map(s=>s.title),lateInPeriod,outside,top,
    results:resultRows,wonPrev:{count:wonPrev.length,total:sum(wonPrev)},lost:{count:lostIn.length,total:lostIn.length?sum(lostIn):null},lostReasons,
    owners:ownerRows,tasks:taskStats,interactions:{total:inter.length,byKind}}}

/* What the CRM lacks for this page, in plain words (empty state). Only checks what the analysis reads. */
function missingData(d){
  d=d||{};const opps=(d.opportunities||[]).filter(Boolean),open=opps.filter(isOpen),out=[];
  if(!opps.length){out.push('Nessuna opportunità nel CRM: crea la prima da Pipeline.');}
  else{
    if(!opps.some(o=>amount(o)>0))out.push('Nessuna opportunità ha un valore: senza importi i totali restano a «—».');
    if(open.length&&!open.some(o=>romeDay(o.expected_close)))out.push('Nessuna opportunità aperta ha la data di chiusura prevista: non entrano in nessun periodo.');
    if(!opps.some(o=>(o.outcome==='won'||o.outcome==='lost')&&romeDay(o.closed_at)))out.push('Nessuna trattativa chiusa (vinta o persa): tasso di vittoria e ciclo medio non calcolabili.');
    const st=new Map((d.stages||[]).filter(Boolean).map(s=>[s.id,s]));
    if(open.length&&!open.some(o=>prob(o.probability)!=null||prob(st.get(o.stage_id)?.probability)!=null))out.push('Nessuna probabilità sulle opportunità o sulle fasi: valore ponderato non calcolabile.')}
  if(!(d.tasks||[]).length&&!(d.interactions||[]).length)out.push('Nessuna attività né interazione registrata.');
  return out}

/* Takeaways: one sentence per chart, from fixed rules. eur formats cents. Each returns a string. */
const pct=(a,b)=>b?Math.round(a/b*100):0;
const MONTHS=['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
const monthName=k=>MONTHS[+k.slice(5,7)-1]+' '+k.slice(0,4);
const defEur=c=>'€ '+Math.round(Number(c||0)/100).toLocaleString('it-IT');
const takeaway={
  stages(a,eur=defEur){const tot=a.stages.reduce((s,x)=>s+x.value,0);if(!a.kpi.open.count)return 'Nessuna trattativa aperta con chiusura prevista nel periodo.';
    if(!tot)return a.kpi.open.count+' trattative aperte nel periodo, nessuna con un valore.';
    const best=[...a.stages].sort((x,y)=>y.value-x.value)[0];const share=pct(best.value,tot);
    return 'La fase con più valore è «'+best.title+'»: '+share+'% della pipeline del periodo'+(share>=50?', quasi tutto il valore è lì.':'.')},
  months(a,eur=defEur){if(!a.kpi.open.count)return 'Nessuna chiusura prevista nel periodo.';
    const late=a.lateInPeriod?' '+a.lateInPeriod+(a.lateInPeriod===1?' trattativa ha':' trattative hanno')+' la data di chiusura già passata: aggiornala.':'';
    if(a.months.length<2)return a.kpi.open.count+' chiusure previste nel periodo, per '+eur(a.kpi.open.total||0)+'.'+late;
    const best=[...a.months].sort((x,y)=>y.total-x.total||x.month.localeCompare(y.month))[0];
    return 'Il mese con più valore in chiusura è '+monthName(best.month)+': '+eur(best.total)+'.'+late},
  results(a,eur=defEur){const k=a.kpi;if(!k.winRate.closed)return 'Nessuna trattativa chiusa nel periodo.';
    let s='Vinte '+k.won.count+' su '+k.winRate.closed+' chiuse ('+k.winRate.rate+'%).';const now=k.won.total||0,before=a.wonPrev.total;
    if(now||before){const diff=now-before;s+=diff>0?' Vinto '+eur(diff)+' in più del periodo precedente.':diff<0?' Vinto '+eur(-diff)+' in meno del periodo precedente.':' Vinto quanto nel periodo precedente.'}
    return s},
  lostReasons(a){if(!a.lost.count)return 'Nessuna trattativa persa nel periodo.';const r=a.lostReasons[0];
    return r.reason==='Motivo non indicato'?'Il motivo più frequente non è indicato ('+r.count+' su '+a.lost.count+' perse): compilalo quando chiudi come persa.':'Il motivo di perdita più frequente è «'+r.reason+'» ('+r.count+' su '+a.lost.count+' perse).'},
  owners(a){const tot=a.owners.reduce((s,x)=>s+x.open,0);if(!a.owners.length)return 'Nessuna trattativa del periodo da assegnare.';
    if(a.owners.length===1)return 'Tutte le trattative del periodo sono di '+a.owners[0].name+'.';
    if(!tot)return 'Nessun valore aperto nel periodo da confrontare tra i responsabili.';
    return a.owners[0].name+' ha il '+pct(a.owners[0].open,tot)+'% della pipeline aperta del periodo.'},
  tasks(a){const t=a.tasks;if(!t.total)return 'Nessuna attività in scadenza nel periodo.';
    return t.done+' attività completate su '+t.total+' in scadenza nel periodo'+(t.late?'; '+t.late+(t.late===1?' scaduta e non completata.':' scadute e non completate.'):'.')},
  interactions(a){const i=a.interactions;if(!i.total)return 'Nessuna interazione registrata nel periodo.';const b=[...i.byKind].sort((x,y)=>y.count-x.count)[0];
    return 'Il tipo più frequente è «'+b.label+'»: '+b.count+' su '+i.total+' interazioni.'}};

const core={romeDay,periodRange,previousRange,inRange,monthsIn,analyze,missingData,takeaway,PERIODS,monthName};
if(typeof module!=='undefined'&&module.exports)module.exports=core;
root.RadixCrmAnalisi=core;
})(typeof window!=='undefined'?window:globalThis);
