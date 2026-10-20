'use strict';
/* Sales Orbit, under the KPI tiles (sales-orbit-mockup-pianeti.png): «Andamento pipeline» and «Distribuzione opportunità»,
   from the CRM rows crm-data.js already loads. Opportunities carry no creation date, so the line is the value of the
   active opportunities (stage not won or lost) per month of expected close, over the next six months.
   Read-only: no number is estimated, and an empty CRM shows an empty state instead of a chart. */
(()=>{
const stats=document.querySelector('#main .stats');if(!stats||!window.RadixCrmData)return;
const NS='http://www.w3.org/2000/svg',S=(t,a)=>{const n=document.createElementNS(NS,t);for(const k in a)n.setAttribute(k,a[k]);return n};
const H=(t,c,x)=>{const n=document.createElement(t);if(c)n.className=c;if(x!=null)n.textContent=x;return n};
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
const eur=c=>new Intl.NumberFormat('it-IT',{maximumFractionDigits:0}).format(c/100);
const MON=['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
const COLORS=['#0f9f7a','#0e7490','#2563eb','#7c3aed','#d97706','#e11d48','#4d7c0f'];

// Six months from the current one, keyed yyyy-mm.
function months(){const d=new Date(),out=[];d.setDate(1);for(let i=0;i<6;i++){out.push({k:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'),label:MON[d.getMonth()]});d.setMonth(d.getMonth()+1)}return out}
function byMonth(rows,dateKey,val){const ms=months(),m=new Map(ms.map(x=>[x.k,0]));
  for(const r of rows){const k=String(r[dateKey]||'').slice(0,7);if(m.has(k))m.set(k,m.get(k)+val(r))}
  return ms.map(x=>({...x,v:m.get(x.k)}))}
function trendPanel(series){
  const p=H('article','so-panel');const hd=H('div','so-panel-head');hd.append(H('h2','','Andamento pipeline'),H('span','so-chip','Prossimi 6 mesi'));p.append(hd,H('p','so-sub','Valore delle opportunità attive per mese di chiusura prevista'));
  const total=series.reduce((s,x)=>s+x.v,0);
  if(!total){p.append(H('p','so-empty','Nessuna opportunità attiva con chiusura prevista nei prossimi 6 mesi.'));return p}
  const W=520,Hh=200,L=46,R=14,T=16,B=26,max=Math.max(...series.map(x=>x.v))*1.15,step=(W-L-R)/(series.length-1),Y=v=>T+(Hh-T-B)*(1-v/max);
  const svg=S('svg',{class:'so-trend',viewBox:`0 0 ${W} ${Hh}`,role:'img','aria-label':'Valore delle opportunità attive per mese di chiusura prevista'});
  const defs=S('defs',{}),g=S('linearGradient',{id:'soArea',x1:0,y1:0,x2:0,y2:1});g.append(S('stop',{offset:0,'stop-color':'#14a37f','stop-opacity':.35}),S('stop',{offset:1,'stop-color':'#14a37f','stop-opacity':0}));defs.append(g);svg.append(defs);
  [0,.25,.5,.75,1].forEach(f=>{const y=Y(max/1.15*f);svg.append(S('line',{class:'so-grid',x1:L,x2:W-R,y1:y,y2:y}));const t=S('text',{class:'so-axis',x:L-8,y:y+4,'text-anchor':'end'});t.textContent=f?eurShort(max/1.15*f):'0';svg.append(t)});
  const pts=series.map((x,i)=>[L+step*i,Y(x.v)]),line=pts.map((q,i)=>(i?'L':'M')+q[0].toFixed(1)+' '+q[1].toFixed(1)).join(' ');
  svg.append(S('path',{class:'so-area',d:line+` L${pts[pts.length-1][0]} ${Hh-B} L${L} ${Hh-B} Z`}),S('path',{class:'so-line',d:line}));
  series.forEach((x,i)=>{const[cx,cy]=pts[i];const c=S('circle',{class:'so-pt',cx,cy,r:x.v?3.4:2.2});const t=S('title',{});t.textContent=x.label+': € '+eur(x.v);c.append(t);svg.append(c);
    const lb=S('text',{class:'so-axis',x:cx,y:Hh-8,'text-anchor':'middle'});lb.textContent=x.label;svg.append(lb)});
  const top=series.reduce((a,x,i)=>x.v>series[a].v?i:a,0),tx=Math.min(W-R-40,Math.max(L+40,pts[top][0])),tag=S('g',{class:'so-tag'});
  tag.append(S('rect',{x:tx-40,y:pts[top][1]-32,width:80,height:22,rx:6}));const tt=S('text',{x:tx,y:pts[top][1]-17,'text-anchor':'middle'});tt.textContent='€ '+eurShort(series[top].v);tag.append(tt);svg.append(tag);
  p.append(svg);const a=H('a','so-link','Vai alla pipeline →');a.href='/sales-pipeline-premium.html';p.append(a);return p}
const eurShort=c=>{const v=c/100;return v>=1e6?new Intl.NumberFormat('it-IT',{maximumFractionDigits:1}).format(v/1e6)+'M':v>=1e3?new Intl.NumberFormat('it-IT',{maximumFractionDigits:0}).format(v/1e3)+'k':eur(c)};

function donutPanel(d){
  const p=H('article','so-panel');const hd=H('div','so-panel-head');hd.append(H('h2','','Distribuzione opportunità'),H('span','so-chip','Per fase'));p.append(hd,H('p','so-sub','Tutte le opportunità registrate, per fase della pipeline'));
  const stages=(d.stages||[]).slice().sort((a,b)=>num(a.position)-num(b.position)),opps=d.opportunities||[];
  if(!opps.length){p.append(H('p','so-empty','Nessuna opportunità nel workspace.'));return p}
  const closed=o=>o.outcome==='won'||o.outcome==='lost',live=opps.filter(o=>!closed(o));
  const rows=stages.map((s,i)=>{const o=live.filter(x=>x.stage_id===s.id);return {label:s.title||'Fase '+(i+1),n:o.length,v:o.reduce((a,x)=>a+num(x.amount_cents),0),c:/pers|lost/i.test(s.title||'')?'#dc2626':/vint|won/i.test(s.title||'')?'#16a34a':COLORS[i%COLORS.length]}});
  /* outcome won/lost, when recorded, goes to Vinte / Perse whatever the stage */
  [['won','Vinte','#16a34a'],['lost','Perse','#dc2626']].forEach(([k,label,c])=>{const o=opps.filter(x=>x.outcome===k);if(o.length)rows.push({label,n:o.length,v:o.reduce((a,x)=>a+num(x.amount_cents),0),c})});
  const other=live.filter(x=>!stages.some(s=>s.id===x.stage_id));if(other.length)rows.push({label:'Senza fase',n:other.length,v:other.reduce((a,x)=>a+num(x.amount_cents),0),c:'#94a3b8'});
  const wrap=H('div','so-donut-wrap'),R=58,C=2*Math.PI*R,svg=S('svg',{class:'so-donut',viewBox:'0 0 160 160',role:'img','aria-label':'Opportunità per fase'});
  svg.append(S('circle',{cx:80,cy:80,r:R,class:'so-donut-track'}));
  let off=0;rows.filter(r=>r.n).forEach(r=>{const len=C*r.n/opps.length;const c=S('circle',{cx:80,cy:80,r:R,stroke:r.c,class:'so-donut-seg','stroke-dasharray':`${Math.max(0,len-2)} ${C}`,'stroke-dashoffset':-off,transform:'rotate(-90 80 80)'});const t=S('title',{});t.textContent=r.label+': '+r.n;c.append(t);svg.append(c);off+=len});
  const n=S('text',{x:80,y:80,class:'so-donut-n','text-anchor':'middle'});n.textContent=opps.length;const s=S('text',{x:80,y:99,class:'so-donut-s','text-anchor':'middle'});s.textContent='totali';svg.append(n,s);
  const leg=H('ul','so-legend');rows.forEach(r=>{const li=H('li');li.style.setProperty('--c',r.c);li.title='€ '+eur(r.v);li.append(H('i'),H('span','',r.label),H('b','',String(r.n)),H('small','',Math.round(r.n/opps.length*100)+'%'));leg.append(li)});
  wrap.append(svg,leg);p.append(wrap);return p}

let box=null;
const CLOSED=/vint|won|pers|lost/i;
function render(d){
  if(!d)return;
  const st=new Map((d.stages||[]).map(s=>[s.id,s])),active=(d.opportunities||[]).filter(o=>o.outcome?o.outcome==='open':!CLOSED.test((st.get(o.stage_id)||{}).title||''));
  box?.remove();box=H('section','so-charts');box.setAttribute('aria-label','Andamento e distribuzione della pipeline');
  box.append(trendPanel(byMonth(active,'expected_close',o=>num(o.amount_cents))),donutPanel(d));stats.after(box)}
function load(){RadixCrmData.load().then(render)}
let tries=0;const wait=setInterval(()=>{if(document.getElementById('workspace')?.value){clearInterval(wait);load()}else if(++tries>40)clearInterval(wait)},250);
document.getElementById('workspace')?.addEventListener('change',()=>setTimeout(load,0));
})();
