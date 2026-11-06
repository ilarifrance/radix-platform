'use strict';
/* Interfood demo: Marketing database as one library (suppliers, price lists, catalogues, parts, certificates, videos, social, website).
   Fictional data, in memory only. */
(function(){
let api=null;
function build(){
const I=window.IF,D=I.D,h=I.h,s=I.s,pill=I.pill,toast=I.toast,clear=I.clear,btn=I.btn,gbp=I.gbp,fmt=I.fmt,days=I.days,st=I.st;
const sup=id=>(D.suppliers.find(x=>x.id===id)||{}).name||'Interfood';
const TABS=[['overview','Overview'],['suppliers','Suppliers'],['price','Price lists'],['catalogue','Catalogues'],['parts','Spare parts'],['cert','Certificates'],['video','Videos'],['social','Social'],['web','Website'],['leads','Leads']];
const cls=x=>({Current:'Running',Published:'Running',Live:'Running',Scheduled:'Normal',Approved:'Normal',Draft:'Low',Expiring:'Service',Outdated:'Service','Needs update':'Service','In editing':'Low',Expired:'High'})[x]||'Normal';
const certDays=l=>l.exp?days(l.exp):9999;
function stats(){return {sup:D.suppliers.length,price:D.library.filter(l=>l.kind==='Price list').length,cat:D.library.filter(l=>l.kind==='Catalogue').length,parts:D.partsCatalog.length,cert:D.library.filter(l=>l.kind==='Certificate').length,video:D.videos.length,social:D.social.length,web:D.website.length}}
function attention(){const out=[];
 D.library.filter(l=>l.kind==='Certificate'&&certDays(l)<0).forEach(l=>out.push({lvl:3,t:'Expired certificate: '+l.title,sub:sup(l.sup)+' · expired '+fmt(l.exp),tab:'cert'}));
 D.library.filter(l=>l.kind==='Certificate'&&certDays(l)>=0&&certDays(l)<=60).forEach(l=>out.push({lvl:2,t:'Certificate expires in '+certDays(l)+' days: '+l.title,sub:sup(l.sup),tab:'cert'}));
 D.library.filter(l=>l.kind==='Price list'&&l.status==='Outdated').forEach(l=>out.push({lvl:2,t:'Outdated price list: '+l.title,sub:sup(l.sup)+' · dated '+fmt(l.date),tab:'price'}));
 D.partsCatalog.filter(p=>p.stock===0).forEach(p=>out.push({lvl:1,t:'Out of stock: '+p.name,sub:sup(p.sup)+' · '+p.lead,tab:'parts'}));
 D.social.filter(p=>p.status==='Draft').slice(0,2).forEach(p=>out.push({lvl:1,t:'Draft to approve: '+p.title,sub:p.ch+' · '+fmt(p.date),tab:'social'}));
 D.website.filter(w=>w.status==='Needs update').forEach(w=>out.push({lvl:1,t:'Web page needs updating: '+w.page,sub:'Last changed '+fmt(w.date),tab:'web'}));
 return out.sort((a,b)=>b.lvl-a.lvl)}
function tbl(cols,rows){const t=h('table','if-table'),th=h('thead'),tr=h('tr'),tb=h('tbody');cols.forEach(c=>tr.appendChild(h('th','',c)));th.appendChild(tr);t.appendChild(th);t.appendChild(tb);
 rows.forEach(r=>{const x=h('tr');r.forEach(c=>{const td=h('td');if(c&&c.nodeType)td.appendChild(c);else td.textContent=c==null?'':String(c);x.appendChild(td)});tb.appendChild(x)});return t}
const act=(l)=>{const w=h('div','lb-act');w.appendChild(btn('Open','small ghost',()=>toast('In the live product this opens the file. The demo holds no real documents.')));w.appendChild(btn('Share','small ghost',()=>toast('Link copied (demo). Customers see only what you share.')));return w};
function docs(root,kind,q){const rows=D.library.filter(l=>l.kind===kind&&(!q||(l.title+' '+sup(l.sup)).toLowerCase().includes(q)));
 root.appendChild(tbl(['Title','Supplier','Date','Format','Status',''],rows.map(l=>[l.title,sup(l.sup),fmt(l.date)+(l.exp?' · to '+fmt(l.exp):''),l.fmt+' · '+l.mb+' MB',pill(l.status,cls(l.status)),act(l)])));if(!rows.length)root.appendChild(h('p','if-lead','No match.'))}
function suppliers(root,go){const g=h('div','lb-cards');D.suppliers.forEach(x=>{const c=h('div','lb-card'),av=h('div','lb-av',x.name.split(' ').map(w=>w[0]).slice(0,2).join(''));c.appendChild(av);c.appendChild(h('h3','',x.name));c.appendChild(h('p','if-lead',x.country+' · '+x.range));
  const n=D.library.filter(l=>l.sup===x.id).length,pt=D.partsCatalog.filter(p=>p.sup===x.id).length;c.appendChild(h('p','lb-meta',n+' documents · '+pt+' parts · partner since '+x.since));c.appendChild(h('small','if-lead','Contact: '+x.contact));
  const w=h('div','if-tools');w.appendChild(btn('Price list','small ghost',()=>go('price',x.name)));w.appendChild(btn('Catalogue','small ghost',()=>go('catalogue',x.name)));w.appendChild(btn('Certificates','small ghost',()=>go('cert',x.name)));c.appendChild(w);g.appendChild(c)});root.appendChild(g)}
function parts(root,q){const rows=D.partsCatalog.filter(p=>!q||(p.id+' '+p.name+' '+p.fits+' '+sup(p.sup)).toLowerCase().includes(q));
 root.appendChild(tbl(['Part','Description','Fits','Supplier','Price','Stock'],rows.map(p=>[p.id,p.name,p.fits,sup(p.sup),gbp(p.price),pill(p.stock?p.stock+' in stock':p.lead,p.stock?'Running':'Service')])))}
function videos(root,q){const g=h('div','lb-cards');D.videos.filter(v=>!q||(v.title+' '+sup(v.sup)).toLowerCase().includes(q)).forEach(v=>{const c=h('div','lb-card'),svg=s('svg',{class:'lb-thumb',viewBox:'0 0 320 120',role:'img','aria-label':'Video thumbnail'});
  svg.appendChild(s('rect',{width:320,height:120,rx:10,class:v.origin==='Supplier'?'lb-th1':'lb-th2'}));svg.appendChild(s('circle',{cx:160,cy:58,r:22,class:'lb-play'}));svg.appendChild(s('path',{d:'M153 46 L174 58 L153 70 Z',class:'lb-tri'}));svg.appendChild(s('text',{x:304,y:110,class:'lb-len','text-anchor':'end'},v.len));c.appendChild(svg);
  c.appendChild(h('h3','',v.title));c.appendChild(h('p','lb-meta',(v.origin==='Supplier'?'From '+sup(v.sup):'Made by Interfood')+(v.views?' · '+v.views.toLocaleString('en-GB')+' views':'')));c.appendChild(pill(v.status,cls(v.status)));g.appendChild(c)});root.appendChild(g)}
function social(root){const cols=['Draft','Approved','Scheduled','Published'],b=h('div','lb-board');cols.forEach(c=>{const col=h('div','lb-col');col.appendChild(h('h3','',c+' · '+D.social.filter(p=>p.status===c).length));
  D.social.filter(p=>p.status===c).sort((a,b2)=>a.date<b2.date?-1:1).forEach(p=>{const k=h('div','lb-post');k.appendChild(h('b','',p.title));k.appendChild(h('small','',p.ch+' · '+fmt(p.date)+(p.reach?' · '+p.reach.toLocaleString('en-GB')+' reached':'')));
   if(c==='Draft')k.appendChild(btn('Approve','small',()=>{p.status='Approved';toast('Approved. Nothing is published in this preview.');I.draw('marketing')}));col.appendChild(k)});b.appendChild(col)});root.appendChild(b)}
function web(root,q){root.appendChild(tbl(['Page','Type','Status','Date','Owner'],D.website.filter(w=>!q||w.page.toLowerCase().includes(q)).map(w=>[w.page,w.type,pill(w.status,cls(w.status)),fmt(w.date),w.owner])))}
function leads(root){root.appendChild(h('div','if-note','Demo data. In the live product this reads from RADIX Lead Intelligence and campaigns.'));
 root.appendChild(tbl(['Source','Leads','Qualified','Rate'],D.leadSources.map(x=>[x.source,x.leads,x.qualified,Math.round(x.qualified/x.leads*100)+'%'])))}
function overview(root,go){const S=stats(),g=h('div','lb-tiles');
 [['suppliers','Suppliers',S.sup,'partners'],['price','Price lists',S.price,'files'],['catalogue','Catalogues',S.cat,'files'],['parts','Spare parts',S.parts,'items'],['cert','Certificates',S.cert,'on file'],['video','Videos',S.video,'supplier and own'],['social','Social posts',S.social,'planned and live'],['web','Website',S.web,'pages and news']].forEach(x=>{const t=h('button','lb-tile');t.type='button';t.appendChild(h('b','',String(x[2])));t.appendChild(h('span','',x[1]));t.appendChild(h('small','',x[3]));t.addEventListener('click',()=>go(x[0]));g.appendChild(t)});root.appendChild(g);
 const a=attention();root.appendChild(h('h2','','Needs attention · '+a.length));
 a.slice(0,7).forEach(x=>{const r=h('div','cx-row'),t=h('div','cx-main');t.appendChild(h('b','',x.t));t.appendChild(h('small','',x.sub));r.appendChild(t);r.appendChild(btn('Open','small ghost',()=>go(x.tab)));root.appendChild(r)})}
function search(root,q,go){root.appendChild(h('h2','','Results for “'+q+'”'));let n=0;
 const sec=(t,fn)=>{const d=h('div');fn(d);if(d.querySelector('tr td')||d.querySelector('.lb-card')||d.querySelector('.lb-post')){root.appendChild(h('h3','',t));root.appendChild(d);n++}};
 sec('Documents',d=>{const rows=D.library.filter(l=>(l.title+' '+l.kind+' '+sup(l.sup)).toLowerCase().includes(q));if(rows.length)d.appendChild(tbl(['Title','Type','Supplier','Status'],rows.map(l=>[l.title,l.kind,sup(l.sup),pill(l.status,cls(l.status))])))});
 sec('Spare parts',d=>parts(d,q));sec('Videos',d=>videos(d,q));sec('Website',d=>web(d,q));
 if(!n)root.appendChild(h('p','if-lead','Nothing matches. Try a supplier, a part number or a machine model.'))}
return function render(root){
 const state=st.mk=st.mk||{tab:'overview',q:''};
 const go=(tab,q)=>{state.tab=tab;state.q=q?q.toLowerCase():'';I.draw('marketing')};
 const top=h('div','lb-top'),inp=h('input');inp.type='search';inp.placeholder='Search suppliers, part numbers, certificates, videos…';inp.setAttribute('aria-label','Search the marketing library');inp.value=state.q;
 inp.addEventListener('keydown',e=>{if(e.key==='Enter'){state.q=inp.value.trim().toLowerCase();state.tab=state.q?'search':'overview';I.draw('marketing')}});top.appendChild(inp);root.appendChild(top);
 const grp=(label,ids)=>{const r=h('div','lb-grp');if(label)r.appendChild(h('span','lb-gl',label));TABS.filter(t=>ids.indexOf(t[0])>=0).forEach(t=>r.appendChild(btn(t[1],state.tab===t[0]?'':'ghost',()=>{state.tab=t[0];state.q='';I.draw('marketing')})));root.appendChild(r)};
 grp('',['overview']);grp('Archive',['suppliers','price','catalogue','parts','cert','video']);grp('Marketing management',['social','web','leads']);
 root.appendChild(h('p','if-lead','Demo data. Supplier names and files are invented. In the live product this is one library that every team can search and share from.'));
 const q=state.q,t=state.tab;
 if(t==='overview')overview(root,go);else if(t==='suppliers')suppliers(root,go);else if(t==='price')docs(root,'Price list',q);else if(t==='catalogue')docs(root,'Catalogue',q);else if(t==='cert')docs(root,'Certificate',q);
 else if(t==='parts')parts(root,q);else if(t==='video')videos(root,q);else if(t==='social')social(root);else if(t==='web')web(root,q);else if(t==='leads')leads(root);else if(t==='search')search(root,q,go)}
}
window.IFmods=window.IFmods||{};window.IFmods.library=function(root){return (api||(api=build()))(root)};
})();
