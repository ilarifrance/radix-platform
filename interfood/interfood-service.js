'use strict';
/* Interfood demo, Service area: planning board (drag a work order onto an engineer), easy work-order entry,
   engineer report form, and a shared archive for notes and AI answers. Fictional data, in memory only. */
(function(){
window.IFmods=window.IFmods||{};
const HOURS=[8,9,10,11,12,13,14,15,16,17],DAYS=['2026-11-06','2026-11-09','2026-11-10','2026-11-11','2026-11-12'];
const sv={tab:'planning',day:'2026-11-06',sel:null,form:false,report:false,reps:{},seq:2042,q:''};
const I=()=>window.IF,D=()=>window.IF.D;
const day=d=>new Date(d+'T12:00:00Z').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'});
const wo=id=>D().tickets.find(t=>t.id===id);
function field(label,el){const l=I().h('label','sv-f');l.appendChild(I().h('span','',label));l.appendChild(el);return l}
function select(opts,val,fn){const x=I().h('select');opts.forEach(o=>{const e=I().h('option','',o[1]);e.value=o[0];x.appendChild(e)});x.value=val;if(fn)x.addEventListener('change',fn);return x}
function redraw(){I().draw('service')}
function assign(t,tech,d,start){const dur=t.dur||2;if(start+dur>18)start=18-dur;
 const clash=D().tickets.find(x=>x!==t&&x.tech===tech&&x.day===d&&x.status!=='Resolved'&&start<x.start+x.dur&&x.start<start+dur);
 if(clash){I().toast(tech.split(' ')[0]+' already has '+clash.id+' at '+clash.start+':00. Pick another slot.');return false}
 t.tech=tech;t.day=d;t.start=start;if(t.status==='Open'||t.status==='Waiting for parts')t.status='Scheduled';sv.sel=t.id;
 I().toast(t.id+' assigned to '+tech.split(' ')[0]+', '+day(d)+' '+start+':00. The Command Centre priorities update too.');redraw();return true}
// ---- entry
window.IFmods.service=function(root){const IF=I(),h=IF.h;
 if(IF.st.sel&&wo(IF.st.sel)){sv.sel=IF.st.sel;sv.tab='planning';IF.st.sel=null}
 const tabs=h('div','if-tools');[['planning','Planning'],['orders','Work orders'],['archive','Archive']].forEach(t=>tabs.appendChild(IF.btn(t[1],sv.tab===t[0]?'':'ghost',()=>{sv.tab=t[0];sv.form=false;redraw()})));root.appendChild(tabs);
 root.appendChild(h('div','if-note','Proxedo is being implemented by Interfood. RADIX can run alongside it (work orders exchanged between the two) or take over service entirely. This is a decision to make together; this view shows how RADIX service would work.'));
 ({planning:planning,orders:orders,archive:archive})[sv.tab](root)};
// ---- planning board
function planning(root){const IF=I(),h=IF.h,s=IF.s,tk=D().tickets;
 const tools=h('div','if-tools'),i=DAYS.indexOf(sv.day);
 tools.appendChild(IF.btn('‹','ghost small',()=>{if(i>0){sv.day=DAYS[i-1];redraw()}}));tools.appendChild(h('b','sv-day',day(sv.day)));tools.appendChild(IF.btn('›','ghost small',()=>{if(i<DAYS.length-1){sv.day=DAYS[i+1];redraw()}}));
 tools.appendChild(IF.btn('+ New work order','',()=>{sv.form=true;sv.sel=null;sv.report=false;redraw()}));root.appendChild(tools);
 const wrap=h('div','sv-wrap'),queue=h('section','sv-queue'),board=h('section','sv-board'),side=h('aside','if-side');
 // queue of unassigned work orders
 queue.appendChild(h('h3','','To schedule'));const un=tk.filter(t=>!t.tech&&t.status!=='Resolved');
 un.forEach(t=>queue.appendChild(card(t)));if(!un.length)queue.appendChild(h('p','if-lead','Everything is scheduled.'));
 queue.appendChild(h('p','sv-hint','Drag a card onto an engineer and time, or select it and use the form.'));
 // board
 const head=h('div','sv-row sv-hours');head.appendChild(h('div','sv-name',''));const hs=h('div','sv-slots');HOURS.forEach(x=>hs.appendChild(h('div','sv-hr',x+':00')));head.appendChild(hs);board.appendChild(head);
 D().technicians.forEach(tc=>{const row=h('div','sv-row'),nm=h('div','sv-name');nm.appendChild(h('b','',tc.name));const sub=h('small','',tc.base+' · ');sub.appendChild(IF.pill(tc.status,tc.status));nm.appendChild(sub);row.appendChild(nm);
  const sl=h('div','sv-slots');HOURS.forEach(hr=>{const c=h('div','sv-cell cs-'+(hr-7)+'-1');c.addEventListener('dragover',e=>e.preventDefault());c.addEventListener('drop',e=>{e.preventDefault();const t=wo(e.dataTransfer.getData('text/plain'));if(t)assign(t,tc.name,sv.day,hr)});sl.appendChild(c)});
  tk.filter(t=>t.tech===tc.name&&t.day===sv.day).forEach(t=>{const b=h('button','sv-wo cs-'+(t.start-7)+'-'+t.dur+' p'+t.priority+(t.status==='Resolved'?' done':'')+(sv.sel===t.id?' on':''));b.type='button';b.draggable=true;
   b.appendChild(h('b','',t.id));b.appendChild(h('small','',IF.cust(t.customer)));b.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',t.id)});b.addEventListener('click',()=>{sv.sel=t.id;sv.form=false;sv.report=false;redraw()});sl.appendChild(b)});
  row.appendChild(sl);board.appendChild(row)});
 board.appendChild(map());
 wrap.appendChild(queue);wrap.appendChild(board);wrap.appendChild(side);root.appendChild(wrap);
 if(sv.form)newForm(side);else if(sv.report&&sv.sel)report(side,wo(sv.sel));else if(sv.sel&&wo(sv.sel))details(side,wo(sv.sel));else side.appendChild(h('p','if-lead','Select a work order to see its detail, assign it or open the engineer report.'))}
function card(t){const IF=I(),h=IF.h,b=h('button','sv-card p'+t.priority+(sv.sel===t.id?' on':''));b.type='button';b.draggable=true;
 b.appendChild(h('b','',t.id+' · '+t.issue));b.appendChild(h('small','',IF.cust(t.customer)+' · '+(IF.mach(t.machine)||{}).model));const m=h('div');m.appendChild(IF.pill(t.priority));m.appendChild(h('small','',' '+t.dur+' h'));b.appendChild(m);
 b.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',t.id)});b.addEventListener('click',()=>{sv.sel=t.id;sv.form=false;sv.report=false;redraw()});return b}
function map(){const IF=I(),h=IF.h,s=IF.s,w=h('div','sv-map'),svg=s('svg',{viewBox:'0 0 300 330',role:'img','aria-label':'Map of customers and engineers'});
 const X=lon=>(lon+9.5)*20,Y=lat=>(55.2-lat)*54;
 for(let k=0;k<6;k++)svg.appendChild(s('line',{class:'sv-g',x1:k*60,y1:0,x2:k*60,y2:330}));for(let k=0;k<6;k++)svg.appendChild(s('line',{class:'sv-g',x1:0,y1:k*66,x2:300,y2:k*66}));
 const hot={};D().tickets.filter(t=>t.status!=='Resolved'&&t.priority==='High').forEach(t=>hot[t.customer]=1);
 Object.keys(D().geo).forEach(id=>{const g=D().geo[id],x=X(g[1]),y=Y(g[0]),c=s('g',{class:'sv-pin'+(hot[id]?' hot':'')});c.appendChild(s('title',{},IF.cust(id)));c.appendChild(s('circle',{cx:x,cy:y,r:6}));c.appendChild(s('text',{x:x+9,y:y+4},IF.cust(id).split(' ')[0]));svg.appendChild(c)});
 D().technicians.forEach(tc=>{const x=X(tc.lon),y=Y(tc.lat)-12,c=s('g',{class:'sv-tech '+tc.status});c.appendChild(s('title',{},tc.name+' · '+tc.status));c.appendChild(s('circle',{cx:x,cy:y,r:10}));c.appendChild(s('text',{x:x,y:y+3,class:'ini'},tc.name.split(' ').map(z=>z[0]).join('')));svg.appendChild(c)});
 w.appendChild(h('h3','','Where everyone is'));w.appendChild(svg);w.appendChild(h('p','sv-hint','Teal = engineers (Available, Driving, Working). Rings = customers; red = high-priority fault open. Demo positions.'));return w}
// ---- side panels
function details(side,t){const IF=I(),h=IF.h;IF.clear(side);side.appendChild(h('h2','',t.id));const dl=h('dl'),m=IF.mach(t.machine);
 [['Issue',t.issue],['Customer',IF.cust(t.customer)],['Machine',m?m.model+' ('+m.id+')':''],['Priority',t.priority],['Status',t.status],['Engineer',t.tech||'Not assigned'],['When',t.day?day(t.day)+' '+t.start+':00–'+(t.start+t.dur)+':00':'Not scheduled'],['Opened',IF.fmt(t.opened)]].forEach(r=>{dl.appendChild(h('dt','',r[0]));dl.appendChild(h('dd','',r[1]))});side.appendChild(dl);
 if(t.status!=='Resolved'){side.appendChild(h('h3','','Assign'));const tc=select(D().technicians.map(x=>[x.name,x.name]),t.tech||D().technicians[0].name),dy=select(DAYS.map(x=>[x,day(x)]),t.day||sv.day),hr=select(HOURS.map(x=>[String(x),x+':00']),String(t.start||9));
  const g=h('div','sv-assign');g.appendChild(tc);g.appendChild(dy);g.appendChild(hr);side.appendChild(g);
  const w=h('div','if-tools');w.appendChild(IF.btn(t.tech?'Reassign':'Assign','',()=>{sv.day=dy.value;assign(t,tc.value,dy.value,+hr.value)}));w.appendChild(IF.btn('Open engineer report','ghost',()=>{sv.report=true;redraw()}));side.appendChild(w)}
 else side.appendChild(h('p','if-lead','Resolved. The report is saved in the archive.'))}
function newForm(side){const IF=I(),h=IF.h;IF.clear(side);side.appendChild(h('h2','','New work order'));side.appendChild(h('p','if-lead','Four fields are enough. Everything else is filled in from the machine record.'));
 const cu=select(D().customers.map(c=>[c.id,c.name]),D().customers[0].id),mc=h('select'),iss=select(['Fault / alarm','Planned service','Spare parts','Installation support','Training','Other'].map(x=>[x,x]),'Fault / alarm'),de=h('textarea');de.rows=3;de.placeholder='What did the customer say?';
 function fillM(){IF.clear(mc);D().machines.filter(m=>m.customer===cu.value).forEach(m=>{const o=h('option','',m.model+' ('+m.id+')');o.value=m.id;mc.appendChild(o)});if(!mc.firstChild){const o=h('option','','No machine on record');o.value='';mc.appendChild(o)}}
 cu.addEventListener('change',fillM);fillM();let pr='Normal';const seg=h('div','sv-seg');['Low','Normal','High'].forEach(p=>{const b=IF.btn(p,p===pr?'':'ghost small',()=>{pr=p;[...seg.children].forEach(c=>c.classList.toggle('ghost',c.textContent!==pr))});seg.appendChild(b)});
 [field('Customer',cu),field('Machine',mc),field('Type',iss),field('Priority',seg),field('Description',de)].forEach(x=>side.appendChild(x));
 const w=h('div','if-tools');w.appendChild(IF.btn('Dictate (demo)','ghost',()=>{de.value='Operator reports the seal looks uneven and the alarm shows after about ten minutes of running.'}));
 w.appendChild(IF.btn('Create','',()=>{const id='T-'+(sv.seq++);D().tickets.unshift({id:id,customer:cu.value,machine:mc.value,issue:(de.value.trim()||iss.value).slice(0,60),priority:pr,status:'Open',opened:IF.TODAY,tech:null,day:null,start:null,dur:2});sv.sel=id;sv.form=false;IF.toast(id+' created. It is in "To schedule" and in the Command Centre.');redraw()}));
 w.appendChild(IF.btn('Cancel','ghost',()=>{sv.form=false;redraw()}));side.appendChild(w)}
function report(side,t){const IF=I(),h=IF.h,r=sv.reps[t.id]||(sv.reps[t.id]={checks:{},parts:[],notes:'',signed:false,photos:0});IF.clear(side);side.appendChild(h('h2','',t.id+' report'));side.appendChild(h('p','if-lead',IF.cust(t.customer)+' · '+((IF.mach(t.machine)||{}).model||'')));
 side.appendChild(h('h3','','Checklist'));D().checklist.forEach((c,i)=>{const l=h('label','sv-chk'),x=h('input');x.type='checkbox';x.checked=!!r.checks[i];x.addEventListener('change',()=>{r.checks[i]=x.checked});l.appendChild(x);l.appendChild(h('span','',c));side.appendChild(l)});
 side.appendChild(h('h3','','Parts used'));const pl=h('ul','if-time');const draw=()=>{IF.clear(pl);r.parts.forEach(p=>pl.appendChild(h('li','',p.name+' · '+IF.gbp(p.price))));if(!r.parts.length)pl.appendChild(h('li','','None yet'))};draw();side.appendChild(pl);
 const ps=select(D().parts.map(p=>[p.id,p.name]),D().parts[0].id),pa=h('div','if-tools');pa.appendChild(ps);pa.appendChild(IF.btn('Add','ghost small',()=>{r.parts.push(D().parts.find(p=>p.id===ps.value));draw()}));side.appendChild(pa);
 side.appendChild(h('h3','','Notes'));const nt=h('textarea');nt.rows=4;nt.value=r.notes;nt.placeholder='Type or dictate what you found and did';nt.addEventListener('input',()=>{r.notes=nt.value});side.appendChild(nt);
 const na=h('div','if-tools'),ar=select([['','Use a saved note…']].concat(D().archive.map(a=>[a.id,a.title])),'');ar.addEventListener('change',()=>{const a=D().archive.find(x=>x.id===ar.value);if(a){nt.value=(nt.value?nt.value+'\n':'')+a.text;r.notes=nt.value;IF.toast('Saved note added to this report.')}ar.value=''});
 na.appendChild(ar);na.appendChild(IF.btn('Tidy notes (AI demo)','ghost small',()=>{const done=D().checklist.filter((c,i)=>r.checks[i]);nt.value='Visit summary\n- Done: '+(done.length?done.join('; ').toLowerCase():'no checklist item ticked yet')+'.\n- Parts: '+(r.parts.length?r.parts.map(p=>p.name).join(', '):'none')+'.\n- Engineer notes: '+(r.notes.replace(/^Visit summary[\s\S]*Engineer notes: /,'')||'none')+'.';r.notes=nt.value}));side.appendChild(na);
 const ph=h('div','if-tools');ph.appendChild(IF.btn('Add photo (demo)','ghost small',()=>{r.photos++;pc.textContent=IF.plural(r.photos,'photo')+' attached'}));const pc=h('small','',IF.plural(r.photos,'photo')+' attached');ph.appendChild(pc);side.appendChild(ph);
 const sg=h('div','if-tools'),sb=IF.btn(r.signed?'Signed by customer ✓':'Customer signs on screen',r.signed?'':'ghost',()=>{r.signed=!r.signed;sb.textContent=r.signed?'Signed by customer ✓':'Customer signs on screen';sb.classList.toggle('ghost',!r.signed)});sg.appendChild(sb);side.appendChild(sg);
 const err=h('p','if-err');side.appendChild(err);const w=h('div','if-tools');
 w.appendChild(IF.btn('Validate report','',()=>{const e=[];if(!D().checklist.some((c,i)=>r.checks[i]))e.push('tick at least one checklist item');if(!r.notes.trim())e.push('add a note');if(!r.signed)e.push('get the customer signature');
  if(e.length){err.textContent='Cannot validate yet: '+e.join(', ')+'.';return}
  t.status='Resolved';D().archive.unshift({id:'k'+(D().archive.length+1),kind:'Note',title:t.id+' report: '+t.issue,text:r.notes,tags:[(IF.mach(t.machine)||{}).model||'report'],machine:t.machine,shared:true,date:IF.TODAY,by:t.tech||'Engineer'});sv.report=false;IF.toast(t.id+' validated. The report is in the archive and the dashboard counts it as resolved.');redraw()}));
 w.appendChild(IF.btn('Back','ghost',()=>{sv.report=false;redraw()}));side.appendChild(w)}
// ---- work orders table
function orders(root){const IF=I(),h=IF.h,split=h('div','if-split'),left=h('div'),side=h('aside','if-side'),table=h('table','if-table'),th=h('thead'),tr=h('tr'),tb=h('tbody');
 ['Work order','Customer','Machine','Priority','Status','Engineer'].forEach(c=>tr.appendChild(h('th','',c)));th.appendChild(tr);table.appendChild(th);table.appendChild(tb);
 D().tickets.forEach(t=>{const r=h('tr','row'),m=IF.mach(t.machine);r.tabIndex=0;r.appendChild(h('td','',t.id+' · '+t.issue));r.appendChild(h('td','',IF.cust(t.customer)));r.appendChild(h('td','',m?m.model:''));let td=h('td');td.appendChild(IF.pill(t.priority));r.appendChild(td);td=h('td');td.appendChild(IF.pill(t.status,t.status.split(' ')[0]));r.appendChild(td);r.appendChild(h('td','',t.tech||'Not assigned'));
  const open=()=>{sv.sel=t.id;details(side,t)};r.addEventListener('click',open);r.addEventListener('keydown',e=>{if(e.key==='Enter')open()});tb.appendChild(r)});
 left.appendChild(table);split.appendChild(left);split.appendChild(side);root.appendChild(split);side.appendChild(h('p','if-lead','Select a work order. To plan it, use the Planning tab.'))}
// ---- archive
function archive(root){const IF=I(),h=IF.h,A=D().archive,wrap=h('div','if-split'),left=h('div'),side=h('aside','if-side');
 const q=h('input');q.type='search';q.placeholder='Search notes, tags, machines';q.value=sv.q;const tools=h('div','if-tools');tools.appendChild(q);left.appendChild(tools);const list=h('div','sv-arch');left.appendChild(list);
 function draw(){IF.clear(list);const t=q.value.toLowerCase();sv.q=q.value;A.filter(a=>!t||(a.title+' '+a.text+' '+a.tags.join(' ')+' '+a.machine).toLowerCase().includes(t)).forEach(a=>{const c=h('article','sv-a');const hd=h('div','sv-a-h');hd.appendChild(IF.pill(a.kind,'tag'));if(a.shared)hd.appendChild(IF.pill('Shared','Running'));hd.appendChild(h('small','',a.by+' · '+IF.fmt(a.date)));c.appendChild(hd);c.appendChild(h('b','',a.title));c.appendChild(h('p','',a.text));
  const tg=h('div','sv-tags');a.tags.concat(a.machine?[a.machine]:[]).forEach(x=>tg.appendChild(h('span','',x)));c.appendChild(tg);const ac=h('div','if-tools');
  ac.appendChild(IF.btn(a.shared?'Unshare':'Share with team','ghost small',()=>{a.shared=!a.shared;IF.toast(a.shared?'Shared: every engineer can use it in a report.':'Back to private.');draw()}));
  ac.appendChild(IF.btn('Copy','ghost small',()=>{try{navigator.clipboard.writeText(a.title+'\n'+a.text);IF.toast('Copied.')}catch(e){IF.toast('Copy is not available here.')}}));
  if(sv.sel&&wo(sv.sel)&&sv.reps[sv.sel]&&wo(sv.sel).status!=='Resolved')ac.appendChild(IF.btn('Use in '+sv.sel,'small',()=>{const r=sv.reps[sv.sel];r.notes=(r.notes?r.notes+'\n':'')+a.text;IF.toast('Added to the report of '+sv.sel+'.')}));
  c.appendChild(ac);list.appendChild(c)});if(!list.firstChild)list.appendChild(h('p','if-lead','Nothing matches.'))}
 q.addEventListener('input',draw);draw();
 side.appendChild(h('h2','','Save something'));side.appendChild(h('p','if-lead','Paste what ChatGPT or Claude answered, or type a note from site. Engineers can then reuse it in reports. In the live product answers from the RADIX assistant are saved here with one click.'));
 const kind=select(['Chat answer','Note','Voice note'].map(x=>[x,x]),'Chat answer'),ti=h('input'),tx=h('textarea'),mc=select([['','No machine']].concat(D().machines.map(m=>[m.id,m.model+' ('+m.id+')'])),'');ti.placeholder='Title';tx.rows=6;tx.placeholder='Paste or type here';
 [field('Type',kind),field('Title',ti),field('Text',tx),field('Machine',mc)].forEach(x=>side.appendChild(x));
 side.appendChild(IF.btn('Save to archive','',()=>{if(!tx.value.trim()||!ti.value.trim()){IF.toast('Add a title and some text.');return}A.unshift({id:'k'+(A.length+1),kind:kind.value,title:ti.value.trim(),text:tx.value.trim(),tags:[],machine:mc.value,shared:false,date:IF.TODAY,by:IF.st.user?IF.st.user.name:'You'});IF.toast('Saved.');redraw()}));
 wrap.appendChild(left);wrap.appendChild(side);root.appendChild(wrap)}
})();
