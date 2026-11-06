'use strict';
/* Interfood Operations Centre demo. Fictional data, in-memory only (nothing is stored or sent anywhere).
   Demo login with role-based access: a person sees all areas or only the tool they work in. */
(function(){
const D=window.InterfoodDemo;if(!D)return;
const NS='http://www.w3.org/2000/svg',TODAY='2026-11-06';
const main=document.getElementById('main'),rail=document.getElementById('rail'),toastEl=document.getElementById('toast'),who=document.getElementById('who');
const gbp=n=>'£'+Math.round(n).toLocaleString('en-GB');
const fmt=d=>{const x=new Date(d+'T12:00:00Z');return x.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'})};
const days=d=>Math.round((Date.parse(d+'T12:00:00Z')-Date.parse(TODAY+'T12:00:00Z'))/864e5);
const cust=id=>(D.customers.find(c=>c.id===id)||{}).name||'';
const mach=id=>D.machines.find(m=>m.id===id);
const st={user:null,sel:null,q:'',status:'',tab:'machines',crmTab:'orbit',ticketSeq:2042};
let timer=null;
function h(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
function s(tag,attrs,text){const e=document.createElementNS(NS,tag);for(const k in attrs||{})e.setAttribute(k,attrs[k]);if(text!=null)e.textContent=text;return e}
function pill(text,cls){return h('span','if-pill '+(cls||String(text).split(' ')[0]),text)}
function toast(msg){toastEl.textContent=msg;toastEl.hidden=false;clearTimeout(timer);timer=setTimeout(()=>{toastEl.hidden=true},2600)}
function clear(n){while(n.firstChild)n.removeChild(n.firstChild)}
function btn(label,cls,fn){const b=h('button','if-btn '+(cls||''),label);b.type='button';if(fn)b.addEventListener('click',fn);return b}
D.users.forEach(u=>{u.email=u.name.toLowerCase().replace(' ','.')+'@interfood.example'});
const SHORT={assets:'Assets',service:'Service',dashboard:'Dashboard',marketing:'Marketing'};
const plural=(n,w)=>n+' '+w+(n===1?'':'s');
const accessText=u=>u.access.length>=7?'All areas':u.access.map(a=>D.nodes.find(n=>n.id===a).label).join(' + ');
const can=id=>!!(st.user&&st.user.access.indexOf(id)>=0);
const areas=()=>D.nodes.filter(n=>can(n.id));
try{const sid=sessionStorage.getItem('if-demo-user');if(sid)st.user=D.users.find(u=>u.id===sid)||null}catch(e){}
window.IF={D:D,h:h,s:s,pill:pill,toast:toast,clear:clear,btn:btn,gbp:gbp,fmt:fmt,days:days,cust:cust,mach:mach,st:st,can:can,plural:plural,TODAY:TODAY,draw:id=>draw(id),go:go,figures:()=>figures(),priorities:()=>priorities()};
// live figures computed from the demo state, so every area agrees with the others
function figures(){
 const open=D.deals.filter(d=>d.stage!=='Order');
 const openTickets=D.tickets.filter(t=>t.status!=='Resolved');
 return {pipeline:open.reduce((a,d)=>a+d.value,0),deals:open.length,machines:D.machines.length,
  openTickets:openTickets.length,highTickets:openTickets.filter(t=>t.priority==='High').length,
  installs:D.installs.filter(i=>i.phases.some(p=>!p.done)).length,
  serviceDue:D.machines.filter(m=>m.status==='Service due'||m.status==='Warranty ending').length,
  leads:D.leadSources.reduce((a,x)=>a+x.leads,0),qualified:D.leadSources.reduce((a,x)=>a+x.qualified,0),orders:D.deals.filter(d=>d.stage==='Order').reduce((a,d)=>a+d.value,0)};
}
function nodeMetric(id){const f=figures();
 return {crm:f.deals+' open deals · '+gbp(f.pipeline),assets:f.machines+' machines · '+D.installs.length+' installations',service:f.openTickets+' open tickets · '+f.highTickets+' high',dashboard:'Live KPIs across every area',marketing:f.leads+' leads this quarter',erp:'To connect',hr:'To connect'}[id]||''}
// ---- routing
function go(id,q){const t='#/'+(id||'')+(q?'?'+q:'');if(location.hash===t)route();else location.hash=t}
function route(){
 document.body.classList.toggle('if-is-login',!st.user);
 if(!st.user){drawRail('');return login()}
 const parts=location.hash.replace(/^#\//,'').split('?'),id=parts[0],q=new URLSearchParams(parts[1]||'');
 if(!id){if(areas().length===1)return go(areas()[0].id);return draw('')}
 if(!D.nodes.some(n=>n.id===id))return go('');
 st.sel=q.get('sel')||null;if(id==='assets')st.tab=q.get('tab')||'machines';if(id==='crm')st.crmTab=q.get('tab')||'orbit';
 if(!can(id))return denied(id);
 draw(id)}
function drawRail(cur){clear(rail);clear(who);if(!st.user)return;
 if(areas().length>1){const b=h('button',cur===''?'on':'','Command Centre');b.type='button';b.addEventListener('click',()=>go(''));rail.appendChild(b)}
 areas().forEach(n=>{const b=h('button',cur===n.id?'on':'',SHORT[n.id]||n.label);b.type='button';b.addEventListener('click',()=>go(n.id));rail.appendChild(b)});
 const av=h('span','if-av',st.user.name.split(' ').map(x=>x[0]).join('')),tx=h('span','if-who-t');tx.appendChild(h('b','',st.user.name));tx.appendChild(h('small','',st.user.role));
 who.appendChild(av);who.appendChild(tx);who.appendChild(btn('Sign out','ghost small',signOut))}
function signIn(u){st.user=u;try{sessionStorage.setItem('if-demo-user',u.id)}catch(e){}go('')}
function signOut(){st.user=null;try{sessionStorage.removeItem('if-demo-user')}catch(e){}location.hash='#/';route()}
function draw(id){drawRail(id);clear(main);window.scrollTo(0,0);if(!id)return hub();
 const n=D.nodes.find(x=>x.id===id);
 if(areas().length>1)main.appendChild(btn('← Command Centre','ghost if-back',()=>go('')));
 const hd=h('div','if-head');hd.appendChild(h('h1','',n.label));const p=h('p','if-lead',n.sub+' ');p.appendChild(pill(n.stateText,n.state));hd.appendChild(p);main.appendChild(hd);
 ({crm,assets,service:r=>window.IFmods.service(r),dashboard,marketing,erp:connector.bind(null,'erp'),hr:connector.bind(null,'hr')})[id](main)}
function denied(id){drawRail('');clear(main);const n=D.nodes.find(x=>x.id===id),b=h('div','if-denied');
 b.appendChild(h('div','if-lock','🔒'));b.appendChild(h('h1','','No access to '+n.label));
 b.appendChild(h('p','if-lead','Your role ('+st.user.role+') opens '+accessText(st.user)+'. Ask an administrator if you need '+n.label+'.'));
 b.appendChild(btn('Back to my tools','',()=>go('')));main.appendChild(b)}
// ---- globe (the RADIX earth painter shared with Sales Orbit)
function globe(canvas,W,H,cx,cy,R){const ctx=canvas.getContext&&canvas.getContext('2d'),G=window.RadixGlobe;if(!ctx||!G)return;
 canvas.width=W*2;canvas.height=H*2;ctx.setTransform(2,0,0,2,0,0);const g={cx:cx,cy:cy,R:R},t0=performance.now(),still=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
 function frame(now){if(!canvas.isConnected)return;ctx.clearRect(0,0,W,H);const t=now-t0;G.orbits(ctx,g,t,false);G.draw(ctx,g,.6+t*.00006);G.orbits(ctx,g,t,true);if(!still)requestAnimationFrame(frame)}
 requestAnimationFrame(frame)}
// ---- login
function login(){clear(main);const w=h('div','if-login'),art=h('div','if-login-art'),pic=h('div','if-login-pic');pic.appendChild(window.IFmods.art());art.appendChild(pic);
 const tx=h('div','if-login-tx'),lg=h('img','if-logo-lg');lg.src='/interfood/logo.svg';lg.alt='Interfood';tx.appendChild(lg);tx.appendChild(h('div','if-eyebrow','Your Partner in Food Production · Operations Centre'));tx.appendChild(h('h1','','One place for customers, machines and service.'));
 tx.appendChild(h('p','if-lead','Sign in to see your tools. Managers see everything; each team sees the tool they work in.'));art.appendChild(tx);w.appendChild(art);
 const card=h('div','if-login-card');card.appendChild(h('h2','','Sign in'));
 const f=h('form','if-form'),em=h('input'),pw=h('input'),err=h('p','if-err');em.type='email';em.value=D.users[0].email;em.placeholder='name@interfood.example';em.autocomplete='off';em.setAttribute('aria-label','Email');pw.type='password';pw.value='demo';pw.placeholder='Password';pw.autocomplete='off';pw.setAttribute('aria-label','Password');
 const sub=h('button','if-btn','Sign in');sub.type='submit';[em,pw,sub,err].forEach(x=>f.appendChild(x));
 f.addEventListener('submit',e=>{e.preventDefault();const u=D.users.find(x=>x.email===em.value.trim().toLowerCase());if(u&&pw.value==='demo')signIn(u);else err.textContent='Email or password not recognised. Use one of the demo accounts below (password "demo").'});
 card.appendChild(f);card.appendChild(h('div','if-or','or open a demo account'));
 const lst=h('div','if-accts');D.users.forEach(u=>{const b=h('button','if-acct');b.type='button';b.appendChild(h('span','if-av',u.name.split(' ').map(x=>x[0]).join('')));const t=h('span','if-who-t');t.appendChild(h('b','',u.name));t.appendChild(h('small','',u.role+' · '+accessText(u)));b.appendChild(t);b.addEventListener('click',()=>signIn(u));lst.appendChild(b)});
 card.appendChild(lst);card.appendChild(h('p','if-fine','Demo only: fictional people and data. The live product uses each person\'s own RADIX login and permissions.'));w.appendChild(card);main.appendChild(w);
}
// ---- Command Centre
function priorities(){const out=[];
 D.tickets.filter(t=>t.status!=='Resolved'&&t.priority==='High').forEach(t=>out.push({area:'service',lvl:3,title:t.id+' · '+t.issue,sub:cust(t.customer)+' · '+(mach(t.machine)||{}).model+' · high priority',to:['service','sel='+t.id]}));
 D.activities.filter(a=>!a.done&&days(a.due)<0).forEach(a=>out.push({area:'crm',lvl:3,title:a.text,sub:'Overdue by '+plural(Math.abs(days(a.due)),'day')+' · '+a.owner,to:['crm','tab=activities']}));
 D.deals.filter(d=>d.stage!=='Order'&&days(d.due)<=6).forEach(d=>{const n=days(d.due);out.push({area:'crm',lvl:n<=3?2:1,title:d.next+': '+d.title,sub:cust(d.customer)+' · '+gbp(d.value)+' · '+(n<=0?'due today':'due in '+plural(n,'day')),to:['crm','tab=pipeline&sel='+d.id]})});
 D.machines.filter(m=>m.status==='Service due'||m.status==='Warranty ending').forEach(m=>out.push({area:'assets',lvl:2,title:m.model+' · '+m.status.toLowerCase(),sub:cust(m.customer)+' · next service '+fmt(m.nextService),to:['assets','sel='+m.id]}));
 D.installs.forEach(i=>{const p=i.phases.find(x=>!x.done);if(p&&days(p.start)<=16)out.push({area:'assets',lvl:1,title:i.title+': '+p.name.toLowerCase()+' starts '+fmt(p.start),sub:cust(i.customer)+' · '+i.engineer,to:['assets','tab=installs']})});
 D.erpPreview.filter(x=>x.status==='Overdue').forEach(x=>out.push({area:'erp',lvl:2,title:x.item+' overdue',sub:cust(x.customer)+' · '+gbp(x.amount)+' (Business Central, to connect)',to:['erp','']}));
 D.leadSources.filter(x=>x.qualified/x.leads<.15).forEach(x=>out.push({area:'marketing',lvl:1,title:x.source+': '+x.leads+' leads, only '+x.qualified+' qualified',sub:'Review the follow-up',to:['marketing','']}));
 return out.filter(x=>can(x.area)).sort((a,b)=>b.lvl-a.lvl)}
function mini(vals,cls){const svg=s('svg',{class:'if-mini '+(cls||''),viewBox:'0 0 120 34','aria-hidden':'true'}),max=Math.max.apply(null,vals)||1,w=120/vals.length;
 vals.forEach((v,i)=>svg.appendChild(s('rect',{x:i*w+2,y:34-Math.max(2,v/max*32),width:w-5,height:Math.max(2,v/max*32),rx:2})));return svg}
function tileInfo(id){
 if(id==='crm')return mini(D.stages.map(g=>D.deals.filter(d=>d.stage===g).reduce((a,d)=>a+d.value,0)));
 if(id==='assets'){const ks=[...new Set(D.machines.map(m=>m.status))];return mini(ks.map(k=>D.machines.filter(m=>m.status===k).length))}
 if(id==='service')return mini(['High','Normal','Low'].map(p=>D.tickets.filter(t=>t.status!=='Resolved'&&t.priority===p).length),'warm');
 if(id==='marketing')return mini(D.leadSources.map(x=>x.leads));
 if(id==='dashboard')return mini(D.stages.map(g=>D.deals.filter(d=>d.stage===g).length));
 return null}
function hub(){const u=st.user,list=priorities(),f=figures();
 const hero=h('section','if-hero cmp'),ht=h('div','if-hero-t'),fl=h('div','if-fleet');
 ht.appendChild(h('div','if-eyebrow',new Date(TODAY+'T12:00:00Z').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'})));ht.appendChild(h('h1','','Welcome back, '+u.name.split(' ')[0]));
 ht.appendChild(h('p','if-lead',list.length?list.length+' items need your attention across '+areas().length+' '+(areas().length===1?'tool':'tools')+'. The first ones are below.':'Nothing needs your attention right now.'));
 const qa=h('div','if-tools');if(can('service'))qa.appendChild(btn('+ Work order','',()=>go('service')));if(can('crm'))qa.appendChild(btn('Log a call','ghost',()=>go('crm')));if(can('assets'))qa.appendChild(btn('Machines','ghost',()=>go('assets')));ht.appendChild(qa);hero.appendChild(ht);
 if(can('assets')){const hd=h('div','if-fleet-h');hd.appendChild(h('b','','Machines in the field'));const lg=h('span','if-fleet-lg');[['ok','Running'],['warn','Needs attention'],['bad','Fault']].forEach(x=>{const i=h('i','fl-dot '+x[0]);lg.appendChild(i);lg.appendChild(document.createTextNode(x[1]+'  '))});hd.appendChild(lg);fl.appendChild(hd);
  const grid=h('div','if-fleet-g');D.machines.forEach(m=>{const c=m.status==='Running'?'ok':m.status==='Fault reported'?'bad':'warn',t=h('button','fl-t '+c);t.type='button';t.title=m.model+' · '+cust(m.customer)+' · '+m.status;t.setAttribute('aria-label',t.title);t.appendChild(h('i','fl-dot '+c));t.appendChild(h('b','',m.id.replace('M-','')));t.appendChild(h('small','',m.model.split(' ').slice(0,2).join(' ')));t.addEventListener('click',()=>go('assets','sel='+m.id));grid.appendChild(t)});fl.appendChild(grid);hero.appendChild(fl)}
 main.appendChild(hero);
 const k=h('div','if-kpis'),K=[];
 if(can('crm'))K.push([gbp(f.pipeline),'Open pipeline · '+f.deals+' deals','crm']);
 if(can('crm'))K.push([gbp(f.orders),'Orders won, awaiting delivery','crm']);
 if(can('assets'))K.push([f.serviceDue,'Machines needing attention','assets']);
 if(can('service'))K.push([f.openTickets,'Open tickets · '+f.highTickets+' high','service']);
 if(can('assets'))K.push([f.installs,'Installations in progress','assets']);
 if(can('marketing'))K.push([f.leads,'Leads this quarter · '+f.qualified+' qualified','marketing']);
 K.slice(0,6).forEach(x=>{const d=h('button','if-kpi');d.type='button';d.appendChild(h('b','',String(x[0])));d.appendChild(h('span','',x[1]));d.addEventListener('click',()=>go(x[2]));k.appendChild(d)});main.appendChild(k);
 const grid=h('div','if-cc'),pan=h('section','if-panel'),tools=h('section');
 pan.appendChild(h('h2','','Priorities'));const ol=h('ol','if-prio');
 list.slice(0,8).forEach(p=>{const li=h('li','lvl'+p.lvl),b=h('button','if-prio-b');b.type='button';const t=h('span','if-prio-t');t.appendChild(h('b','',p.title));t.appendChild(h('small','',p.sub));
  b.appendChild(h('span','if-dot'));b.appendChild(t);b.appendChild(pill(D.nodes.find(n=>n.id===p.area).label,'tag'));b.addEventListener('click',()=>go(p.to[0],p.to[1]));li.appendChild(b);ol.appendChild(li)});
 if(!list.length)ol.appendChild(h('li','if-empty','All clear.'));pan.appendChild(ol);grid.appendChild(pan);
 const asst=h('div','if-asst');window.IFmods.assistant(asst,{scope:'cc'});grid.appendChild(asst);main.appendChild(grid);
 tools.appendChild(h('h2','if-tools-h','Your tools'));const tg=h('div','if-tiles');
 areas().forEach(n=>{const b=h('button','if-tile '+n.state);b.type='button';b.appendChild(h('h3','',n.label));b.appendChild(h('small','',n.sub));b.appendChild(h('div','if-tile-m',nodeMetric(n.id)));const m=tileInfo(n.id);if(m)b.appendChild(m);b.appendChild(h('span','if-open','Open →'));b.addEventListener('click',()=>go(n.id));tg.appendChild(b)});
 tools.appendChild(tg);main.appendChild(tools)}
// ---- CRM (a simple part of Sales Orbit: orbit home, pipeline, companies, contacts, activities)
const CRMTABS=[['orbit','Orbit'],['today','Today'],['pipeline','Pipeline'],['companies','Companies'],['contacts','Contacts'],['activities','Activities'],['calendar','Calendar'],['mail','Mail'],['campaigns','Campaigns'],['analysis','Analysis']];
const cx=()=>window.IFmods.crmx();
function crm(root){
 const tabs=h('div','if-tools');CRMTABS.forEach(t=>tabs.appendChild(btn(t[1],st.crmTab===t[0]?'':'ghost',()=>{st.crmTab=t[0];st.sel=null;draw('crm')})));root.appendChild(tabs);
 ({orbit:crmOrbit,pipeline:crmPipeline,companies:crmCompanies,contacts:crmContacts,activities:crmActivities,today:r=>cx().today(r),calendar:r=>cx().calendar(r),mail:r=>cx().mail(r),campaigns:r=>cx().campaigns(r),analysis:r=>cx().analysis(r)})[st.crmTab](root)}
function crmOrbit(root){const f=figures(),home=h('div','if-crmhome'),asd=h('div','if-asst');window.IFmods.assistant(asd,{scope:'crm',sub:'Type what happened. I log it and set the follow-up.',placeholder:'Called Fiona Marsh, send the quote Monday…'});home.appendChild(asd);const wrap=h('div','if-orbit'),cv=h('canvas','if-orbit-cv');cv.setAttribute('aria-hidden','true');wrap.appendChild(cv);
 const svg=s('svg',{class:'if-orbit-svg',viewBox:'0 0 900 470',role:'group','aria-label':'Sales Orbit'});
 const open=D.activities.filter(a=>!a.done).length,P=[['companies','Companies',D.customers.length,'accounts',130,95],['contacts','Contacts',D.contacts.length,'people',770,95],['pipeline','Pipeline',f.deals,'open deals',130,320],['activities','Activities',open,'to do',770,320]];
 P.forEach(p=>{const dx=p[4]-450,dy=p[5]-225,L=Math.hypot(dx,dy),a=190/L,b=62/L;svg.appendChild(s('line',{class:'if-line live',x1:450+dx*a,y1:225+dy*a,x2:p[4]-dx*b,y2:p[5]-dy*b}))});
 P.forEach(p=>{const g=s('g',{class:'if-planet',tabindex:'0',role:'button','aria-label':p[1]+', '+p[2]+' '+p[3]});g.appendChild(s('circle',{class:'if-planet-ring',cx:p[4],cy:p[5],r:62}));g.appendChild(s('circle',{class:'if-planet-c',cx:p[4],cy:p[5],r:52}));
  g.appendChild(s('text',{class:'if-pl-n',x:p[4],y:p[5]+4},String(p[2])));g.appendChild(s('text',{class:'if-pl-s',x:p[4],y:p[5]+22},p[3]));g.appendChild(s('text',{class:'if-pl-l',x:p[4],y:p[5]+88},p[1]));
  const go2=()=>{st.crmTab=p[0];st.sel=null;draw('crm')};g.addEventListener('click',go2);g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go2()}});svg.appendChild(g)});
 svg.appendChild(s('text',{class:'if-pl-l',x:450,y:452},'Interfood Sales'));wrap.appendChild(svg);home.appendChild(wrap);root.appendChild(home);globe(cv,900,470,450,225,88);
 const k=h('div','if-kpis');[[gbp(f.pipeline),'Open pipeline'],[gbp(f.orders),'Orders won'],[String(f.deals),'Open deals'],[String(open),'Activities to do']].forEach(x=>{const d=h('div','if-kpi');d.appendChild(h('b','',x[0]));d.appendChild(h('span','',x[1]));k.appendChild(d)});root.appendChild(k);
 root.appendChild(h('p','if-lead','The live product adds forecasting, email, campaigns and the AI copilot on the same records. Lead intelligence is a separate module and is not part of this view.'))}
function crmPipeline(root){
 const split=h('div','if-split'),left=h('div'),side=h('aside','if-side');
 const board=h('div','if-board');
 D.stages.forEach(sg=>{const col=h('div','if-col'),list=D.deals.filter(d=>d.stage===sg),h3=h('h3','',sg);h3.appendChild(h('span','',gbp(list.reduce((a,d)=>a+d.value,0))));col.appendChild(h3);
  list.forEach(d=>{const b=h('button','if-deal');b.type='button';b.appendChild(h('b','',d.title));b.appendChild(h('small','',cust(d.customer)));b.appendChild(h('small','',gbp(d.value)+' · '+d.owner));b.addEventListener('click',()=>{st.sel=d.id;dealSide(side,d,()=>crmRefresh())});col.appendChild(b)});board.appendChild(col)})
 left.appendChild(board);split.appendChild(left);split.appendChild(side);root.appendChild(split);
 const cur=D.deals.find(d=>d.id===st.sel);cur?dealSide(side,cur,()=>crmRefresh()):side.appendChild(h('p','if-lead','Select a deal to see its detail here.'))}
function crmRefresh(){const keep=st.sel;draw('crm');st.sel=keep;const side=document.querySelector('.if-side'),d=D.deals.find(x=>x.id===keep);if(d&&side){clear(side);dealSide(side,d,()=>crmRefresh())}}
function dealSide(side,d,after){clear(side);side.appendChild(h('h2','',d.title));
 const dl=h('dl');[['Customer',cust(d.customer)],['Stage',d.stage],['Value',gbp(d.value)],['Owner',d.owner],['Next step',d.next],['Due',fmt(d.due)]].forEach(r=>{dl.appendChild(h('dt','',r[0]));dl.appendChild(h('dd','',r[1]))});side.appendChild(dl);
 const i=D.stages.indexOf(d.stage),b=h('button','if-btn',i<D.stages.length-1?'Move to '+D.stages[i+1]:'Order won');b.type='button';b.disabled=i>=D.stages.length-1;
 b.addEventListener('click',()=>cx().move(side,d,after));
 const w=h('div','if-tools');w.appendChild(b);w.appendChild(btn('Next move (AI demo)','ghost',()=>{const p=h('p','if-lead',cx().nextMove(d));side.appendChild(p)}));side.appendChild(w);
 side.appendChild(h('p','if-lead','Moving a deal asks what you did and suggests the next reminders.'))}
function crmCompanies(root){
 const split=h('div','if-split'),left=h('div'),side=h('aside','if-side'),table=h('table','if-table'),tr=h('tr'),th=h('thead'),tb=h('tbody');
 ['Company','City','Open deals','Machines','Open tickets'].forEach(c=>tr.appendChild(h('th','',c)));th.appendChild(tr);table.appendChild(th);table.appendChild(tb);
 const one=c=>{clear(side);side.appendChild(h('h2','',c.name));side.appendChild(h('p','if-lead',c.city));
  const sec=(t,rows)=>{side.appendChild(h('h3','',t));const ul=h('ul','if-time');rows.forEach(x=>ul.appendChild(h('li','',x)));if(!rows.length)ul.appendChild(h('li','','None'));side.appendChild(ul)};
  sec('Contacts',D.contacts.filter(p=>p.customer===c.id).map(p=>p.name+' · '+p.role));
  sec('Open deals',D.deals.filter(d=>d.customer===c.id&&d.stage!=='Order').map(d=>d.title+' · '+gbp(d.value)+' · '+d.stage));
  sec('Recent notes',(st.notes||[]).filter(n=>n.customer===c.id).map(n=>n.text+' · '+n.by));
  sec('Machines',D.machines.filter(m=>m.customer===c.id).map(m=>m.model+' · '+m.status));
  sec('Service',D.tickets.filter(t=>t.customer===c.id&&t.status!=='Resolved').map(t=>t.id+' · '+t.issue))};
 D.customers.forEach(c=>{const r=h('tr','row');r.tabIndex=0;r.appendChild(h('td','',c.name));r.appendChild(h('td','',c.city));
  r.appendChild(h('td','',String(D.deals.filter(d=>d.customer===c.id&&d.stage!=='Order').length)));r.appendChild(h('td','',String(D.machines.filter(m=>m.customer===c.id).length)));r.appendChild(h('td','',String(D.tickets.filter(t=>t.customer===c.id&&t.status!=='Resolved').length)));
  r.addEventListener('click',()=>one(c));r.addEventListener('keydown',e=>{if(e.key==='Enter')one(c)});tb.appendChild(r)});
 left.appendChild(table);split.appendChild(left);split.appendChild(side);root.appendChild(split);side.appendChild(h('p','if-lead','Select a company for its full picture: people, deals, machines and service in one place.'))}
function crmContacts(root){const q=h('input');q.type='search';q.placeholder='Search name, company or role';q.setAttribute('aria-label','Search contacts');const tools=h('div','if-tools');tools.appendChild(q);root.appendChild(tools);
 const table=h('table','if-table'),tr=h('tr'),th=h('thead'),tb=h('tbody');['Name','Company','Role','Email','Last contact'].forEach(c=>tr.appendChild(h('th','',c)));th.appendChild(tr);table.appendChild(th);table.appendChild(tb);root.appendChild(table);
 function list(){clear(tb);const t=q.value.toLowerCase();D.contacts.filter(p=>!t||(p.name+' '+cust(p.customer)+' '+p.role).toLowerCase().includes(t)).forEach(p=>{const r=h('tr');[p.name,cust(p.customer),p.role,p.email,fmt(p.last)].forEach(x=>r.appendChild(h('td','',x)));tb.appendChild(r)})}
 q.addEventListener('input',list);list()}
function crmActivities(root){const table=h('table','if-table'),tr=h('tr'),th=h('thead'),tb=h('tbody');['Activity','Deal','Owner','Due',''].forEach(c=>tr.appendChild(h('th','',c)));th.appendChild(tr);table.appendChild(th);table.appendChild(tb);
 D.activities.slice().sort((a,b)=>a.due<b.due?-1:1).forEach(a=>{const r=h('tr'),dl=D.deals.find(d=>d.id===a.deal);r.appendChild(h('td','',a.type+' · '+a.text));r.appendChild(h('td','',dl?cust(dl.customer):''));r.appendChild(h('td','',a.owner));
  const td=h('td','',fmt(a.due)+' ');if(!a.done&&days(a.due)<0)td.appendChild(pill('Overdue','High'));r.appendChild(td);const bt=h('td');bt.appendChild(btn(a.done?'Done':'Mark done',a.done?'ghost small':'small',()=>{a.done=true;toast('Marked done. Orbit and the Command Centre now reflect it.');draw('crm')}));r.appendChild(bt);if(a.done)r.className='done';tb.appendChild(r)});
 root.appendChild(table)}
// ---- assets
function assets(root){
 const grp=(label,list)=>{const r=h('div','lb-grp');if(label)r.appendChild(h('span','lb-gl',label));list.forEach(t=>r.appendChild(btn(t[1],st.tab===t[0]?'':'ghost',()=>{st.tab=t[0];st.sel=null;draw('assets')})));root.appendChild(r)};
 if(!['machines','installs','archive','parts'].includes(st.tab))st.tab='machines';
 grp('Archive',[['archive','Machine files'],['parts','Spare parts']]);grp('Management',[['machines','Machines'],['installs','Installations']]);
 st.tab==='installs'?installs(root):st.tab==='archive'?window.IFmods.assetx().archive(root):st.tab==='parts'?window.IFmods.assetx().parts(root):machines(root)}
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
// ---- dashboard
function dashboard(root){const f=figures(),k=h('div','if-kpis');
 [[gbp(f.pipeline),'Open pipeline ('+f.deals+' deals)'],[gbp(f.orders),'Orders won, awaiting delivery'],[f.machines,'Machines in the field'],[f.serviceDue,'Machines needing attention'],[f.openTickets,'Open service tickets'],[f.installs,'Installations in progress']].forEach(x=>{const d=h('div','if-kpi');d.appendChild(h('b','',String(x[0])));d.appendChild(h('span','',x[1]));k.appendChild(d)});root.appendChild(k);
 root.appendChild(h('h2','','Pipeline value by stage'));
 const vals=D.stages.map(g=>({g:g,v:D.deals.filter(d=>d.stage===g).reduce((a,d)=>a+d.value,0)})),max=Math.max.apply(null,vals.map(v=>v.v))||1,svg=s('svg',{class:'if-bars',viewBox:'0 0 900 '+(30+vals.length*40),role:'img','aria-label':'Pipeline value by stage'});
 vals.forEach((v,i)=>{const y=16+i*40;svg.appendChild(s('text',{class:'b-t',x:12,y:y+18},v.g));svg.appendChild(s('rect',{class:'b-bar',x:130,y:y,width:Math.max(2,v.v/max*620),height:26,rx:6}));svg.appendChild(s('text',{class:'b-v',x:138+v.v/max*620,y:y+18},gbp(v.v)))});
 root.appendChild(svg);root.appendChild(h('p','if-lead','Every figure is computed from the other areas: move a deal in CRM or book a service on a machine, then come back here.'))}
// ---- marketing
function marketing(root){window.IFmods.library(root)}
// ---- connectors (not connected)
const INFO={erp:{what:['Customers, items and the sales orders, invoices and payments behind each deal','Phase 1: read only. Phase 2: an approved quote becomes a sales order, with confirmation'],need:['An app registered by Interfood IT in Microsoft Entra (no passwords shared)','The Business Central environment and company to read from'],prev:true},
 hr:{what:['Engineers, roles and availability feeding installation and service planning'],need:['Which Sage HR edition they use','Whether Sage HR offers API access for this (not yet checked)'],prev:false}};
function connector(id,root){const i=INFO[id];
 root.appendChild(h('div','if-note','Not connected. This area shows what RADIX would bring in once Interfood approves the connection. Nothing is read from this system in the demo.'));
 const a=h('h2','','What RADIX would show');root.appendChild(a);const u=h('ul');i.what.forEach(x=>u.appendChild(h('li','',x)));root.appendChild(u);
 root.appendChild(h('h2','','What we need from Interfood'));const v=h('ul');i.need.forEach(x=>v.appendChild(h('li','',x)));root.appendChild(v);
 if(i.prev){root.appendChild(h('h2','','Preview with demo data'));const t=h('table','if-table'),tr=h('tr');['Record','Customer','Amount','Status'].forEach(c=>tr.appendChild(h('th','',c)));const th=h('thead');th.appendChild(tr);t.appendChild(th);const tb=h('tbody');
  D.erpPreview.forEach(x=>{const r=h('tr');r.appendChild(h('td','',x.item));r.appendChild(h('td','',cust(x.customer)));r.appendChild(h('td','',gbp(x.amount)));const td=h('td');td.appendChild(pill(x.status,x.status==='Overdue'?'High':x.status==='Paid'?'Running':'Normal'));r.appendChild(td);tb.appendChild(r)});t.appendChild(tb);root.appendChild(t)}}
window.addEventListener('hashchange',route);document.getElementById('brand').addEventListener('click',e=>{e.preventDefault();if(st.user)go('')});route();
})();
