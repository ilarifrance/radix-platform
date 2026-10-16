'use strict';
/* Sales Orbit, under the globe (sales-orbit-mockup.png): a sparkline in each KPI tile, then «Andamento pipeline»
   and «Distribuzione opportunità», all from the CRM rows crm-data.js already loads. Opportunities carry no creation
   date, so the timeline is the expected close: value and count per month of expected close. Tasks use their due date.
   Read-only: no number is estimated, and an empty CRM shows an empty state instead of a chart. */
(()=>{
const stats=document.querySelector('#main>.stats');if(!stats||!window.RadixCrmData)return;
const NS='http://www.w3.org/2000/svg',S=(t,a)=>{const n=document.createElementNS(NS,t);for(const k in a)n.setAttribute(k,a[k]);return n};
const H=(t,c,x)=>{const n=document.createElement(t);if(c)n.className=c;if(x!=null)n.textContent=x;return n};
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
const eur=c=>new Intl.NumberFormat('it-IT',{maximumFractionDigits:0}).format(c/100);
const MON=['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
const COLORS=['#36edbd','#54cbda','#4a8dff','#a27bff','#f5b544','#ff7a9a','#8fe36b'];
const OPEN=t=>!['done','completed','closed'].includes(String(t.status||'').toLowerCase());

// Six months from the current one, keyed yyyy-mm.
function months(){const d=new Date(),out=[];d.setDate(1);for(let i=0;i<6;i++){out.push({k:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'),label:MON[d.getMonth()]});d.setMonth(d.getMonth()+1)}return out}
function byMonth(rows,dateKey,val){const ms=months(),m=new Map(ms.map(x=>[x.k,0]));
  for(const r of rows){const k=String(r[dateKey]||'').slice(0,7);if(m.has(k))m.set(k,m.get(k)+val(r))}
  return ms.map(x=>({...x,v:m.get(x.k)}))}
function weeks(rows){const t0=new Date();t0.setHours(0,0,0,0);const out=[0,0,0,0,0,0];
  for(const r of rows){const d=new Date(r.due_at);if(!Number.isFinite(+d))continue;const w=Math.floor((d-t0)/(7*864e5))+1;out[Math.max(0,Math.min(5,w))]++}
  return out}

function spark(values,title){
  const w=120,h=34,max=Math.max(1,...values),step=w/(values.length-1||1);
  const pts=values.map((v,i)=>[i*step,h-3-(v/max)*(h-8)]);
  const svg=S('svg',{class:'so-spark',viewBox:`0 0 ${w} ${h}`,preserveAspectRatio:'none',role:'img','aria-label':title});
  const t=S('title',{});t.textContent=title;svg.append(t);
  const line=pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  svg.append(S('path',{class:'so-spark-area',d:line+` L${w} ${h} L0 ${h} Z`}),S('path',{class:'so-spark-line',d:line}));
  const last=pts[pts.length-1];svg.append(S('circle',{class:'so-spark-dot',cx:last[0],cy:last[1],r:2.6}));
  return svg}
function setSpark(i,values,title){const a=stats.children[i];if(!a)return;a.querySelector('.so-spark')?.remove();a.classList.add('so-has-spark');a.append(spark(values,title))}

function trendPanel(series){
  const p=H('article','so-panel');p.append(H('h2','','Andamento pipeline'),H('p','so-sub','Valore per mese di chiusura prevista · prossimi 6 mesi'));
  const total=series.reduce((s,x)=>s+x.v,0);
  if(!total){p.append(H('p','so-empty','Nessuna opportunità con chiusura prevista nei prossimi 6 mesi.'));return p}
  const W=520,Hh=190,L=8,B=26,max=Math.max(...series.map(x=>x.v)),bw=(W-L*2)/series.length;
  const svg=S('svg',{class:'so-trend',viewBox:`0 0 ${W} ${Hh}`,role:'img','aria-label':'Valore delle opportunità per mese di chiusura prevista'});
  const defs=S('defs',{}),g=S('linearGradient',{id:'soBar',x1:0,y1:0,x2:0,y2:1});g.append(S('stop',{offset:0,'stop-color':'#36edbd'}),S('stop',{offset:1,'stop-color':'#36edbd','stop-opacity':.15}));defs.append(g);svg.append(defs);
  [.25,.5,.75,1].forEach(f=>svg.append(S('line',{class:'so-grid',x1:L,x2:W-L,y1:(Hh-B)-(Hh-B-18)*f,y2:(Hh-B)-(Hh-B-18)*f})));
  const pts=[];
  series.forEach((x,i)=>{const bh=(x.v/max)*(Hh-B-18),cx=L+bw*i+bw/2;pts.push([cx,(Hh-B)-bh]);
    const r=S('rect',{class:'so-bar',x:cx-bw*.28,y:(Hh-B)-bh,width:bw*.56,height:Math.max(bh,x.v?2:0),rx:4});const t=S('title',{});t.textContent=x.label+': '+eur(x.v);r.append(t);svg.append(r);
    const lb=S('text',{class:'so-axis',x:cx,y:Hh-8,'text-anchor':'middle'});lb.textContent=x.label;svg.append(lb);
    if(x.v){const v=S('text',{class:'so-val',x:cx,y:(Hh-B)-bh-6,'text-anchor':'middle'});v.textContent=eur(x.v);svg.append(v)}});
  svg.append(S('path',{class:'so-trend-line',d:pts.map((p,i)=>(i?'L':'M')+p[0]+' '+p[1]).join(' ')}));
  p.append(svg);const a=H('a','so-link','Vai alla pipeline →');a.href='/sales-pipeline-premium.html';p.append(a);return p}

function donutPanel(d){
  const p=H('article','so-panel');p.append(H('h2','','Distribuzione opportunità'),H('p','so-sub','Per fase della pipeline'));
  const stages=(d.stages||[]).slice().sort((a,b)=>num(a.position)-num(b.position)),opps=d.opportunities||[];
  if(!opps.length){p.append(H('p','so-empty','Nessuna opportunità nel workspace.'));return p}
  const rows=stages.map((s,i)=>{const o=opps.filter(x=>x.stage_id===s.id);return {label:s.title||'Fase '+(i+1),n:o.length,v:o.reduce((a,x)=>a+num(x.amount_cents),0),c:COLORS[i%COLORS.length]}});
  const other=opps.filter(x=>!stages.some(s=>s.id===x.stage_id));if(other.length)rows.push({label:'Senza fase',n:other.length,v:other.reduce((a,x)=>a+num(x.amount_cents),0),c:'#5b7a70'});
  const wrap=H('div','so-donut-wrap'),R=58,C=2*Math.PI*R,svg=S('svg',{class:'so-donut',viewBox:'0 0 160 160',role:'img','aria-label':'Opportunità per fase'});
  svg.append(S('circle',{cx:80,cy:80,r:R,class:'so-donut-track'}));
  let off=0;rows.filter(r=>r.n).forEach(r=>{const len=C*r.n/opps.length;const c=S('circle',{cx:80,cy:80,r:R,stroke:r.c,class:'so-donut-seg','stroke-dasharray':`${Math.max(0,len-2)} ${C}`,'stroke-dashoffset':-off,transform:'rotate(-90 80 80)'});const t=S('title',{});t.textContent=r.label+': '+r.n;c.append(t);svg.append(c);off+=len});
  const n=S('text',{x:80,y:80,class:'so-donut-n','text-anchor':'middle'});n.textContent=opps.length;const s=S('text',{x:80,y:99,class:'so-donut-s','text-anchor':'middle'});s.textContent='opportunità';svg.append(n,s);
  const leg=H('ul','so-legend');rows.forEach(r=>{const li=H('li');li.style.setProperty('--c',r.c);li.append(H('i'),H('span','',r.label),H('b','',String(r.n)),H('small','',eur(r.v)));leg.append(li)});
  wrap.append(svg,leg);p.append(wrap);return p}

let box=null;
function render(d){
  if(!d)return;
  const open=(d.tasks||[]).filter(OPEN),value=byMonth(d.opportunities||[],'expected_close',o=>num(o.amount_cents)),count=byMonth(d.opportunities||[],'expected_close',()=>1);
  let run=0;setSpark(0,value.map(x=>run+=x.v),'Valore cumulato per mese di chiusura prevista, prossimi 6 mesi');
  setSpark(1,count.map(x=>x.v),'Opportunità per mese di chiusura prevista, prossimi 6 mesi');
  setSpark(2,weeks(open),'Attività aperte per scadenza: superate, questa settimana e le 4 successive');
  box?.remove();box=H('section','so-charts');box.setAttribute('aria-label','Andamento e distribuzione della pipeline');
  box.append(trendPanel(value),donutPanel(d));stats.after(box)}
function load(){RadixCrmData.load().then(render)}
let tries=0;const wait=setInterval(()=>{if(document.getElementById('workspace')?.value){clearInterval(wait);load()}else if(++tries>40)clearInterval(wait)},250);
document.getElementById('workspace')?.addEventListener('change',()=>setTimeout(load,0));
})();
