'use strict';
/* Interfood Operations Centre demo. Fictional data, in-memory only (nothing is stored or sent anywhere). */
(function(){
const D=window.InterfoodDemo;if(!D)return;
const NS='http://www.w3.org/2000/svg';
const main=document.getElementById('main'),rail=document.getElementById('rail'),toastEl=document.getElementById('toast');
const gbp=n=>'£'+Math.round(n).toLocaleString('en-GB');
const fmt=d=>{const x=new Date(d+'T12:00:00Z');return x.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'})};
const cust=id=>(D.customers.find(c=>c.id===id)||{}).name||'';
const mach=id=>D.machines.find(m=>m.id===id);
const st={sel:null,q:'',status:'',tab:'machines',ticketSeq:2042};
let timer=null;
function h(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
function s(tag,attrs,text){const e=document.createElementNS(NS,tag);for(const k in attrs||{})e.setAttribute(k,attrs[k]);if(text!=null)e.textContent=text;return e}
function pill(text,cls){return h('span','if-pill '+(cls||String(text).split(' ')[0]),text)}
function toast(msg){toastEl.textContent=msg;toastEl.hidden=false;clearTimeout(timer);timer=setTimeout(()=>{toastEl.hidden=true},2600)}
function clear(n){while(n.firstChild)n.removeChild(n.firstChild)}
// live figures computed from the demo state, so every area agrees with the others
function figures(){
 const open=D.deals.filter(d=>d.stage!=='Order');
 const openTickets=D.tickets.filter(t=>t.status!=='Resolved');
 return {pipeline:open.reduce((a,d)=>a+d.value,0),deals:open.length,machines:D.machines.length,
  openTickets:openTickets.length,highTickets:openTickets.filter(t=>t.priority==='High').length,
  installs:D.installs.filter(i=>i.phases.some(p=>!p.done)).length,
  serviceDue:D.machines.filter(m=>m.status==='Service due'||m.status==='Warranty ending').length,
  leads:D.leadSources.reduce((a,x)=>a+x.leads,0),orders:D.deals.filter(d=>d.stage==='Order').reduce((a,d)=>a+d.value,0)};
}
function nodeMetric(id){const f=figures();
 return {crm:f.deals+' open deals · '+gbp(f.pipeline),assets:f.machines+' machines · '+D.installs.length+' installations',service:f.openTickets+' open tickets',dashboard:'Live KPIs',marketing:f.leads+' leads this quarter',erp:'Orders, invoices, items',hr:'Engineers and availability'}[id]||''}
function go(id){location.hash=id?'#/'+id:'#/'}
function route(){const id=(location.hash.replace(/^#\//,'')||'').split('?')[0];st.sel=null;draw(D.nodes.some(n=>n.id===id)?id:'')}
function drawRail(cur){clear(rail);D.nodes.forEach(n=>{const b=h('button',cur===n.id?'on':'',n.label);b.type='button';b.addEventListener('click',()=>go(n.id));rail.appendChild(b)})}
function draw(id){drawRail(id);clear(main);window.scrollTo(0,0);if(!id)return hub();
 const n=D.nodes.find(x=>x.id===id);
 const back=h('button','if-btn ghost if-back','← Operations centre');back.type='button';back.addEventListener('click',()=>go(''));main.appendChild(back);
 main.appendChild(h('h1','',n.label));
 const p=h('p','if-lead',n.sub+' ');p.appendChild(pill(n.stateText,n.state));main.appendChild(p);
 ({crm,assets,service,dashboard,marketing,erp:connector.bind(null,'erp'),hr:connector.bind(null,'hr')})[id](main)}
// ---- hub
function hub(){
 main.appendChild(h('h1','','Interfood Operations Centre'));
 main.appendChild(h('p','if-lead','One place where customers, machines, deals and service work meet. Click an area to enter it.'));
 const f=figures(),k=h('div','if-kpis');
 [[gbp(f.pipeline),'Open pipeline'],[f.machines,'Machines in the field'],[f.openTickets+' ('+f.highTickets+' high)','Open service tickets'],[f.installs,'Installations in progress']].forEach(x=>{const d=h('div','if-kpi');d.appendChild(h('b','',String(x[0])));d.appendChild(h('span','',x[1]));k.appendChild(d)});
 main.appendChild(k);
 const wrap=h('div','if-hub'),svg=s('svg',{class:'if-map',viewBox:'0 0 920 580',role:'group','aria-label':'Operations map'});
 const cx=460,cy=290,rx=350,ry=215,n=D.nodes.length;
 const pos=D.nodes.map((nd,i)=>{const a=-Math.PI/2+i*2*Math.PI/n;return {nd,x:cx+rx*Math.cos(a),y:cy+ry*Math.sin(a)}});
 pos.forEach(p=>svg.appendChild(s('line',{class:'if-line '+p.nd.state,x1:cx,y1:cy,x2:p.x,y2:p.y})));
 svg.appendChild(s('circle',{class:'if-core-ring',cx:cx,cy:cy,r:104}));
 svg.appendChild(s('circle',{class:'if-core',cx:cx,cy:cy,r:80}));
 svg.appendChild(s('text',{class:'if-core-t',x:cx,y:cy+2},'CORE'));
 svg.appendChild(s('text',{class:'if-core-s',x:cx,y:cy+24},'Single source of truth'));
 pos.forEach(p=>{const g=s('g',{class:'if-node '+p.nd.state,tabindex:'0',role:'button','aria-label':p.nd.label+', '+p.nd.stateText});
  g.appendChild(s('ellipse',{cx:p.x,cy:p.y,rx:118,ry:50}));
  g.appendChild(s('text',{class:'if-n-t',x:p.x,y:p.y-12},p.nd.label));
  g.appendChild(s('text',{class:'if-n-s',x:p.x,y:p.y+5},p.nd.sub.length>34?p.nd.sub.slice(0,32)+'…':p.nd.sub));
  g.appendChild(s('text',{class:'if-n-k',x:p.x,y:p.y+24},p.nd.state==='connect'?'To connect':nodeMetric(p.nd.id)));
  g.addEventListener('click',()=>go(p.nd.id));g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go(p.nd.id)}});svg.appendChild(g)});
 wrap.appendChild(svg);
 const cards=h('div','if-cards');D.nodes.forEach(nd=>{const b=h('button','if-card');b.type='button';b.appendChild(h('h3','',nd.label));b.appendChild(h('div','',nd.sub));const m=h('div');m.appendChild(pill(nd.stateText,nd.state));m.appendChild(document.createTextNode(' '+(nd.state==='connect'?'':nodeMetric(nd.id))));b.appendChild(m);b.addEventListener('click',()=>go(nd.id));cards.appendChild(b)});
 wrap.appendChild(cards);main.appendChild(wrap)}
// ---- CRM pipeline
function crm(root){
 const split=h('div','if-split'),left=h('div'),side=h('aside','if-side');
 const board=h('div','if-board');
 D.stages.forEach(sg=>{const col=h('div','if-col'),list=D.deals.filter(d=>d.stage===sg),h3=h('h3','',sg);h3.appendChild(h('span','',gbp(list.reduce((a,d)=>a+d.value,0))));col.appendChild(h3);
  list.forEach(d=>{const b=h('button','if-deal');b.type='button';b.appendChild(h('b','',d.title));b.appendChild(h('small','',cust(d.customer)));b.appendChild(h('small','',gbp(d.value)+' · '+d.owner));b.addEventListener('click',()=>{st.sel=d.id;dealSide(side,d,()=>crmRefresh(root))});col.appendChild(b)});board.appendChild(col)});
 left.appendChild(board);split.appendChild(left);split.appendChild(side);root.appendChild(split);
 const cur=D.deals.find(d=>d.id===st.sel);cur?dealSide(side,cur,()=>crmRefresh(root)):side.appendChild(h('p','if-lead','Select a deal to see its detail here.'))}
function crmRefresh(root){const keep=st.sel;draw('crm');st.sel=keep;const side=document.querySelector('.if-side'),d=D.deals.find(x=>x.id===keep);if(d&&side){clear(side);dealSide(side,d,()=>crmRefresh(root))}}
function dealSide(side,d,after){clear(side);side.appendChild(h('h2','',d.title));
 const dl=h('dl');[['Customer',cust(d.customer)],['Stage',d.stage],['Value',gbp(d.value)],['Owner',d.owner],['Next step',d.next],['Due',fmt(d.due)]].forEach(r=>{dl.appendChild(h('dt','',r[0]));dl.appendChild(h('dd','',r[1]))});side.appendChild(dl);
 const i=D.stages.indexOf(d.stage),b=h('button','if-btn',i<D.stages.length-1?'Move to '+D.stages[i+1]:'Order won');b.type='button';b.disabled=i>=D.stages.length-1;
 b.addEventListener('click',()=>{d.stage=D.stages[i+1];toast('Moved to '+d.stage+'. The dashboard and pipeline totals now include this change.');after()});
 const w=h('div','if-tools');w.appendChild(b);side.appendChild(w);
 side.appendChild(h('p','if-lead','In the live product a move also asks what you did and suggests the next reminders. This preview only moves the card.'))}
// ---- assets
function assets(root){
 const tabs=h('div','if-tools');[['machines','Machines'],['installs','Installations']].forEach(t=>{const b=h('button','if-btn '+(st.tab===t[0]?'':'ghost'),t[1]);b.type='button';b.addEventListener('click',()=>{st.tab=t[0];st.sel=null;draw('assets')});tabs.appendChild(b)});root.appendChild(tabs);
 st.tab==='installs'?installs(root):machines(root)}
function machines(root){
 const tools=h('div','if-tools'),q=h('input');q.type='search';q.placeholder='Search model, serial or customer';q.value=st.q;q.setAttribute('aria-label','Search machines');
 const sel=h('select');sel.setAttribute('aria-label','Filter by status');[''].concat([...new Set(D.machines.map(m=>m.status))]).forEach(v=>{const o=h('option','',v||'All statuses');o.value=v;sel.appendChild(o)});sel.value=st.status;
 tools.appendChild(q);tools.appendChild(sel);root.appendChild(tools);
 const split=h('div','if-split'),left=h('div'),side=h('aside','if-side'),tbody=h('tbody');
 const table=h('table','if-table'),thead=h('thead'),tr=h('tr');['Machine','Customer','Installed','Status','Next service'].forEach(c=>tr.appendChild(h('th','',c)));thead.appendChild(tr);table.appendChild(thead);table.appendChild(tbody);left.appendChild(table);split.appendChild(left);split.appendChild(side);root.appendChild(split);
 function list(){clear(tbody);const t=q.value.toLowerCase();st.q=q.value;st.status=sel.value;
  D.machines.filter(m=>(!st.status||m.status===st.status)&&(!t||(m.model+' '+m.serial+' '+cust(m.customer)).toLowerCase().includes(t))).forEach(m=>{const r=h('tr','row');r.tabIndex=0;
   [m.model+' ('+m.id+')',cust(m.customer),fmt(m.installed)].forEach(x=>r.appendChild(h('td','',x)));const td=h('td');td.appendChild(pill(m.status));r.appendChild(td);r.appendChild(h('td','',fmt(m.nextService)));
   const open=()=>{st.sel=m.id;machineSide(side,m)};r.addEventListener('click',open);r.addEventListener('keydown',e=>{if(e.key==='Enter')open()});tbody.appendChild(r)});
  if(!tbody.firstChild){const r=h('tr'),td=h('td','','No machines match.');td.colSpan=5;r.appendChild(td);tbody.appendChild(r)}}
 q.addEventListener('input',list);sel.addEventListener('change',list);list();
 const cur=D.machines.find(m=>m.id===st.sel);cur?machineSide(side,cur):side.appendChild(h('p','if-lead','Select a machine to see its customer, history and open service work.'))}
function machineSide(side,m){clear(side);side.appendChild(h('h2','',m.model));
 const dl=h('dl');[['Machine ID',m.id],['Serial',m.serial],['Customer',cust(m.customer)],['Installed',fmt(m.installed)],['Warranty to',fmt(m.warrantyEnd)],['Last service',fmt(m.lastService)],['Next service',fmt(m.nextService)]].forEach(r=>{dl.appendChild(h('dt','',r[0]));dl.appendChild(h('dd','',r[1]))});side.appendChild(dl);
 const t=D.tickets.filter(x=>x.machine===m.id),ul=h('ul','if-time');
 ul.appendChild(h('li','','Installed '+fmt(m.installed)));ul.appendChild(h('li','','Last service '+fmt(m.lastService)));
 t.forEach(x=>ul.appendChild(h('li','','Ticket '+x.id+': '+x.issue+' ('+x.status+')')));side.appendChild(ul);
 const b=h('button','if-btn','Book a service');b.type='button';
 b.addEventListener('click',()=>{const id='T-'+(st.ticketSeq++);D.tickets.unshift({id:id,customer:m.customer,machine:m.id,issue:'Service requested from machine record',priority:'Normal',status:'Scheduled',opened:'2026-11-06'});toast('Ticket '+id+' created for '+m.model+'. It now appears in Service and in the dashboard.');machineSide(side,m)});
 const w=h('div','if-tools');w.appendChild(b);side.appendChild(w)}
function installs(root){
 const rows=D.installs.slice(),start=Date.UTC(2026,9,1),end=Date.UTC(2026,11,20),day=864e5,W=900,L=240,rowH=84,H=40+rows.length*rowH+20;
 const x=d=>L+(Date.parse(d+'T12:00:00Z')-start)/(end-start)*(W-L-10);
 const svg=s('svg',{class:'if-gantt',viewBox:'0 0 '+W+' '+H,role:'img','aria-label':'Installation schedule'});
 ['2026-10-01','2026-11-01','2026-12-01'].forEach(d=>{svg.appendChild(s('line',{class:'g-grid',x1:x(d),y1:24,x2:x(d),y2:H-8}));svg.appendChild(s('text',{class:'g-m',x:x(d)+4,y:16},fmt(d).replace(/ 2026/,'')))});
 const tx=x('2026-11-06');svg.appendChild(s('line',{class:'g-today',x1:tx,y1:24,x2:tx,y2:H-8}));
 rows.forEach((r,i)=>{const y=40+i*rowH;svg.appendChild(s('text',{class:'g-t',x:10,y:y+16},r.title));svg.appendChild(s('text',{class:'g-m',x:10,y:y+32},cust(r.customer)+' · '+r.engineer));
  r.phases.forEach((p,pi)=>{const a=x(p.start),b=x(p.end);svg.appendChild(s('rect',{class:'g-bar'+(p.done?' done':''),x:a,y:y+22,width:Math.max(6,b-a),height:14,rx:5}));svg.appendChild(s('text',{class:'g-t',x:a>W-130?b:a,y:[y+16,y+52,y+70][pi%3],'text-anchor':a>W-130?'end':'start'},p.name))})});
 root.appendChild(svg);root.appendChild(h('p','if-lead','Green = done. The amber line is today. In the live product each installation is a project with phases, engineers and capacity.'))}
// ---- service
function service(root){
 root.appendChild(h('div','if-note','Proxedo is being implemented by Interfood. RADIX can run alongside it (tickets exchanged between the two) or take over service entirely. This is a decision to make together; the view below is RADIX service.'));
 const split=h('div','if-split'),left=h('div'),side=h('aside','if-side'),table=h('table','if-table'),thead=h('thead'),tr=h('tr');
 ['Ticket','Customer','Machine','Priority','Status'].forEach(c=>tr.appendChild(h('th','',c)));thead.appendChild(tr);table.appendChild(thead);const tb=h('tbody');
 D.tickets.forEach(t=>{const r=h('tr','row');r.tabIndex=0;const m=mach(t.machine);r.appendChild(h('td','',t.id+' · '+t.issue));r.appendChild(h('td','',cust(t.customer)));r.appendChild(h('td','',m?m.model:''));
  let td=h('td');td.appendChild(pill(t.priority));r.appendChild(td);td=h('td');td.appendChild(pill(t.status,t.status.split(' ')[0]));r.appendChild(td);
  const open=()=>{clear(side);side.appendChild(h('h2','',t.id));const dl=h('dl');[['Issue',t.issue],['Customer',cust(t.customer)],['Machine',m?m.model+' ('+m.id+')':''],['Opened',fmt(t.opened)],['Status',t.status]].forEach(q=>{dl.appendChild(h('dt','',q[0]));dl.appendChild(h('dd','',q[1]))});side.appendChild(dl);
   const b=h('button','if-btn',t.status==='Resolved'?'Resolved':'Mark resolved');b.type='button';b.disabled=t.status==='Resolved';b.addEventListener('click',()=>{t.status='Resolved';toast('Ticket '+t.id+' resolved.');draw('service')});const w=h('div','if-tools');w.appendChild(b);side.appendChild(w)};
  r.addEventListener('click',open);r.addEventListener('keydown',e=>{if(e.key==='Enter')open()});tb.appendChild(r)});
 table.appendChild(tb);left.appendChild(table);side.appendChild(h('p','if-lead','Select a ticket to see the machine and customer it belongs to.'));split.appendChild(left);split.appendChild(side);root.appendChild(split)}
// ---- dashboard
function dashboard(root){const f=figures(),k=h('div','if-kpis');
 [[gbp(f.pipeline),'Open pipeline ('+f.deals+' deals)'],[gbp(f.orders),'Orders won, awaiting delivery'],[f.machines,'Machines in the field'],[f.serviceDue,'Machines needing attention'],[f.openTickets,'Open service tickets'],[f.installs,'Installations in progress']].forEach(x=>{const d=h('div','if-kpi');d.appendChild(h('b','',String(x[0])));d.appendChild(h('span','',x[1]));k.appendChild(d)});root.appendChild(k);
 root.appendChild(h('h2','','Pipeline value by stage'));
 const vals=D.stages.map(g=>({g:g,v:D.deals.filter(d=>d.stage===g).reduce((a,d)=>a+d.value,0)})),max=Math.max.apply(null,vals.map(v=>v.v))||1,svg=s('svg',{class:'if-bars',viewBox:'0 0 900 '+(30+vals.length*40),role:'img','aria-label':'Pipeline value by stage'});
 vals.forEach((v,i)=>{const y=16+i*40;svg.appendChild(s('text',{class:'b-t',x:12,y:y+18},v.g));svg.appendChild(s('rect',{class:'b-bar',x:130,y:y,width:Math.max(2,v.v/max*620),height:26,rx:6}));svg.appendChild(s('text',{class:'b-v',x:138+v.v/max*620,y:y+18},gbp(v.v)))});
 root.appendChild(svg);root.appendChild(h('p','if-lead','Every figure is computed from the other areas: move a deal in CRM or book a service on a machine, then come back here.'))}
// ---- marketing
function marketing(root){root.appendChild(h('div','if-note','Demo data. In the live product this reads from RADIX Lead Intelligence and campaigns.'));
 const table=h('table','if-table'),tr=h('tr');['Source','Leads','Qualified','Rate'].forEach(c=>tr.appendChild(h('th','',c)));const th=h('thead');th.appendChild(tr);table.appendChild(th);const tb=h('tbody');
 D.leadSources.forEach(x=>{const r=h('tr');[x.source,x.leads,x.qualified,Math.round(x.qualified/x.leads*100)+'%'].forEach(v=>r.appendChild(h('td','',String(v))));tb.appendChild(r)});table.appendChild(tb);root.appendChild(table)}
// ---- connectors (not connected)
const INFO={erp:{what:['Customers, items and the sales orders, invoices and payments behind each deal','Phase 1: read only. Phase 2: an approved quote becomes a sales order, with confirmation'],need:['An app registered by Interfood IT in Microsoft Entra (no passwords shared)','The Business Central environment and company to read from'],prev:true},
 hr:{what:['Engineers, roles and availability feeding installation and service planning'],need:['Which Sage HR edition they use','Whether Sage HR offers API access for this (not yet checked)'],prev:false}};
function connector(id,root){const i=INFO[id];
 root.appendChild(h('div','if-note','Not connected. This area shows what RADIX would bring in once Interfood approves the connection. Nothing is read from this system in the demo.'));
 const a=h('h2','','What RADIX would show');root.appendChild(a);const u=h('ul');i.what.forEach(x=>u.appendChild(h('li','',x)));root.appendChild(u);
 root.appendChild(h('h2','','What we need from Interfood'));const v=h('ul');i.need.forEach(x=>v.appendChild(h('li','',x)));root.appendChild(v);
 if(i.prev){root.appendChild(h('h2','','Preview with demo data'));const t=h('table','if-table'),tr=h('tr');['Record','Customer','Amount','Status'].forEach(c=>tr.appendChild(h('th','',c)));const th=h('thead');th.appendChild(tr);t.appendChild(th);const tb=h('tbody');
  D.erpPreview.forEach(x=>{const r=h('tr');r.appendChild(h('td','',x.item));r.appendChild(h('td','',cust(x.customer)));r.appendChild(h('td','',gbp(x.amount)));const td=h('td');td.appendChild(pill(x.status,x.status==='Overdue'?'High':x.status==='Paid'?'Running':'Normal'));r.appendChild(td);tb.appendChild(r)});t.appendChild(tb);root.appendChild(t)}}
window.addEventListener('hashchange',route);document.getElementById('brand').addEventListener('click',e=>{e.preventDefault();go('')});route();
})();
