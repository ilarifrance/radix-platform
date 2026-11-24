'use strict';
/* Interfood demo: Asset database as an archive (one file per machine) beside the management tabs. Fictional data, in memory only. */
(function(){
let api=null;
function build(){
const I=window.IF,D=I.D,h=I.h,pill=I.pill,toast=I.toast,clear=I.clear,btn=I.btn,gbp=I.gbp,fmt=I.fmt,days=I.days,cust=I.cust,st=I.st;
const sup=id=>(D.suppliers.find(x=>x.id===id)||{}).name||'';
const mk=m=>m.model.split(' ')[0].toLowerCase();
const maker=m=>({tray:'s1',filli:'s2',check:'s3',metal:'s3',dough:'s4',mixer:'s4',flow:'s5'})[mk(m)]||'s6';
function files(m){const out=[['Manual',m.model+' operator manual','PDF'],['Manual',m.model+' cleaning and hygiene guide','PDF'],['Certificate','Conformity declaration','PDF'],['Record','Installation and commissioning record','PDF'],['Drawing','Layout drawing for '+cust(m.customer),'DWG'],['Photo','Site photos at installation','JPG · 8']];
 D.tickets.filter(t=>t.machine===m.id).forEach(t=>out.push(['Service report',t.id+' · '+t.issue,'PDF']));if(m.lastService)out.push(['Service report','Planned service on '+fmt(m.lastService),'PDF']);return out}
function parts(m){return D.partsCatalog.filter(p=>p.fits===m.model)}
function file(root,m){clear(root);root.appendChild(h('h2','',m.model+' · '+m.id));root.appendChild(h('p','if-lead',cust(m.customer)+' · serial '+m.serial+' · '+m.status));
 const dl=h('dl');[['Supplier',sup(maker(m))],['Installed',fmt(m.installed)],['Warranty to',fmt(m.warrantyEnd)+(days(m.warrantyEnd)<90&&days(m.warrantyEnd)>=0?' (ending soon)':days(m.warrantyEnd)<0?' (expired)':'')],['Next service',fmt(m.nextService)]].forEach(r=>{dl.appendChild(h('dt','',r[0]));dl.appendChild(h('dd','',r[1]))});root.appendChild(dl);
 root.appendChild(h('h3','','Documents'));const ul=h('ul','if-time');files(m).forEach(f=>{const li=h('li','');li.appendChild(h('b','',f[0]+' '));li.appendChild(document.createTextNode(f[1]+' · '+f[2]));ul.appendChild(li)});root.appendChild(ul);
 root.appendChild(h('h3','','Spare parts for this machine'));const pl=h('ul','if-time');parts(m).forEach(p=>pl.appendChild(h('li','',p.id+' · '+p.name+' · '+gbp(p.price)+' · '+(p.stock?p.stock+' in stock':p.lead))));if(!parts(m).length)pl.appendChild(h('li','','None listed'));root.appendChild(pl);
 const w=h('div','if-tools');w.appendChild(btn('Request a part','',()=>toast('Request noted (demo). In the live product it goes to the parts desk.')));w.appendChild(btn('Share the file','ghost',()=>toast('Link copied (demo).')));root.appendChild(w)}
function archive(root){const q=h('input');q.type='search';q.placeholder='Search a machine, serial number, customer or document…';q.setAttribute('aria-label','Search the asset archive');q.className='lb-search';root.appendChild(q);
 const split=h('div','if-split'),left=h('div'),side=h('aside','if-side'),g=h('div','lb-cards');left.appendChild(g);split.appendChild(left);split.appendChild(side);root.appendChild(split);
 side.appendChild(h('p','if-lead','Select a machine to see its full file: manuals, certificates, drawings, photos, service reports and spare parts.'));
 function list(){clear(g);const t=q.value.toLowerCase();D.machines.filter(m=>!t||(m.model+' '+m.serial+' '+m.id+' '+cust(m.customer)+' '+files(m).map(f=>f[1]).join(' ')).toLowerCase().includes(t)).forEach(m=>{const c=h('button','lb-card lb-mc');c.type='button';c.appendChild(h('b','',m.model));c.appendChild(h('small','',cust(m.customer)+' · '+m.id));c.appendChild(h('p','lb-meta',files(m).length+' documents · '+parts(m).length+' parts'));c.appendChild(pill(m.status,m.status==='Running'?'Running':m.status==='Fault reported'?'High':'Service'));c.addEventListener('click',()=>{st.sel=m.id;file(side,m)});g.appendChild(c)})}
 q.addEventListener('input',list);list();const cur=D.machines.find(m=>m.id===st.sel);if(cur)file(side,cur)}
return {archive:archive,parts:function(root){const rows=D.partsCatalog;const t=h('table','if-table'),th=h('thead'),tr=h('tr'),tb=h('tbody');['Part','Description','Fits','Supplier','Price','Stock'].forEach(c=>tr.appendChild(h('th','',c)));th.appendChild(tr);t.appendChild(th);t.appendChild(tb);rows.forEach(p=>{const r=h('tr');[p.id,p.name,p.fits,sup(p.sup),gbp(p.price)].forEach(x=>r.appendChild(h('td','',x)));const td=h('td');td.appendChild(pill(p.stock?p.stock+' in stock':p.lead,p.stock?'Running':'Service'));r.appendChild(td);tb.appendChild(r)});root.appendChild(t)}}
}
window.IFmods=window.IFmods||{};window.IFmods.assetx=function(){return api||(api=build())};
})();
