'use strict';
/* Interfood demo: the RADIX CRM screens beyond the basics (Today, Calendar, Mail, Campaigns, Analysis) and the deal move dialog.
   Fictional data, in memory only. Nothing is sent. */
(function(){
let api=null;
function build(){
const I=window.IF;const D=I.D,h=I.h,s=I.s,pill=I.pill,toast=I.toast,clear=I.clear,btn=I.btn,gbp=I.gbp,fmt=I.fmt,days=I.days,cust=I.cust,st=I.st;
const dealOf=id=>D.deals.find(d=>d.id===id);
const table=cols=>{const t=h('table','if-table'),th=h('thead'),tr=h('tr'),tb=h('tbody');cols.forEach(c=>tr.appendChild(h('th','',c)));th.appendChild(tr);t.appendChild(th);t.appendChild(tb);return [t,tb]};
function copy(text){try{navigator.clipboard.writeText(text);toast('Copied.')}catch(e){toast('Select the text and copy it.')}}
// ---- Today
function today(root){
 const open=D.activities.filter(a=>!a.done).sort((a,b)=>a.due<b.due?-1:1);
 const groups=[['Overdue',open.filter(a=>days(a.due)<0)],['Today',open.filter(a=>days(a.due)===0)],['Next 7 days',open.filter(a=>days(a.due)>0&&days(a.due)<=7)]];
 const wrap=h('div','cx-two'),left=h('div'),right=h('div');
 groups.forEach(g=>{left.appendChild(h('h2','',g[0]+' · '+g[1].length));if(!g[1].length)left.appendChild(h('p','if-lead','Nothing here.'));
  g[1].forEach(a=>{const dl=dealOf(a.deal),row=h('div','cx-row');const t=h('div','cx-main');t.appendChild(h('b','',a.type+' · '+a.text));t.appendChild(h('small','',(dl?cust(dl.customer)+' · ':'')+a.owner+' · '+fmt(a.due)));row.appendChild(t);
   row.appendChild(btn('Done','small',()=>{a.done=true;toast('Done. Orbit and the Command Centre now reflect it.');I.draw('crm')}));left.appendChild(row)})});
 const stale=D.deals.filter(d=>d.stage!=='Order'&&days(d.due)<0);
 right.appendChild(h('h2','',"Deals that need a next step"));
 (stale.length?stale:D.deals.filter(d=>d.stage==='Quote'||d.stage==='Negotiation').slice(0,3)).forEach(d=>{const row=h('div','cx-row'),t=h('div','cx-main');t.appendChild(h('b','',d.title));t.appendChild(h('small','',cust(d.customer)+' · '+d.stage+' · '+gbp(d.value)));row.appendChild(t);row.appendChild(btn('Open','small ghost',()=>{st.crmTab='pipeline';st.sel=d.id;I.draw('crm')}));right.appendChild(row)});
 right.appendChild(h('h2','','Unread mail · '+D.mails.filter(m=>m.unread).length));
 D.mails.filter(m=>m.unread).forEach(m=>{const row=h('div','cx-row'),t=h('div','cx-main');t.appendChild(h('b','',m.subject));t.appendChild(h('small','',m.from+' · '+cust(m.customer)));row.appendChild(t);row.appendChild(btn('Read','small ghost',()=>{st.crmTab='mail';st.mail=m.id;I.draw('crm')}));right.appendChild(row)});
 wrap.appendChild(left);wrap.appendChild(right);root.appendChild(wrap)}
// ---- Calendar: two working weeks, activities placed on their due date
function calendar(root){
 const base=new Date('2026-11-09T12:00:00Z'),wk=[0,1];root.appendChild(h('p','if-lead','Activities and follow-ups on their due dates. The live product syncs with Outlook and exports an .ics file.'));
 wk.forEach(w=>{root.appendChild(h('h3','','Week of '+fmt(new Date(base.getTime()+w*7*864e5).toISOString().slice(0,10))));const g=h('div','cx-week');
  for(let i=0;i<5;i++){const d=new Date(base.getTime()+(w*7+i)*864e5).toISOString().slice(0,10),col=h('div','cx-day');col.appendChild(h('h4','',new Date(d+'T12:00:00Z').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'})));
   D.activities.filter(a=>a.due===d).forEach(a=>{const dl=dealOf(a.deal);const c=h('div','cx-ev'+(a.done?' done':''));c.appendChild(h('b','',a.type));c.appendChild(h('small','',(dl?cust(dl.customer):'')+' · '+a.owner));col.appendChild(c)});
   D.deals.filter(x=>x.due===d&&x.stage!=='Order').forEach(x=>{const c=h('div','cx-ev deal');c.appendChild(h('b','','Deal: '+x.next));c.appendChild(h('small','',cust(x.customer)));col.appendChild(c)});g.appendChild(col)}
  root.appendChild(g)});
 root.appendChild(btn('Download .ics (demo)','ghost',()=>toast('In the live product this downloads your calendar file.')))}
// ---- Mail: read, link to a deal, AI reply draft (deterministic), nothing is sent
function reply(m){const d=dealOf(m.deal),first=m.from.split(' ')[0];
 const lines={D01:'Yes, we can split installation and training into separate lines. I will send the revised quote today and confirm the delivery window with our planners.',D02:'Our planners are checking whether delivery and installation fit before 15 December. I will come back to you with a firm answer tomorrow.',D03:'Thank you for the results. I will chase the sign-off with our side and send you the next steps.'};
 const body=m.deal?(lines[m.deal.replace('-','')]||'Thanks for your message. I will come back to you shortly.'):'Thank you. We have a trial slot on Wednesday 18 November. Shall I reserve it for you?';
 return 'Hi '+first+',\n\n'+body+'\n\nBest regards,\n'+st.user.name+'\nInterfood Technology'}
function mail(root){
 const split=h('div','if-split'),left=h('div'),side=h('aside','if-side');const [t,tb]=table(['From','Subject','Linked to','Date']);
 const show=m=>{clear(side);m.unread=false;side.appendChild(h('h2','',m.subject));side.appendChild(h('p','if-lead',m.from+' · '+cust(m.customer)+' · '+fmt(m.date)));side.appendChild(h('p','',m.body));
  const d=dealOf(m.deal);side.appendChild(h('p','if-lead',d?'Linked to the opportunity: '+d.title:'Not linked to an opportunity yet.'));
  const ta=h('textarea','cx-ta');ta.rows=11;ta.setAttribute('aria-label','Reply');ta.value='';const w=h('div','if-tools');
  w.appendChild(btn('Draft a reply (AI demo)','',()=>{ta.value=reply(m)}));if(!d)w.appendChild(btn('Link to an opportunity','ghost',()=>{const o=D.deals.find(x=>x.customer===m.customer);if(o){m.deal=o.id;toast('Linked to '+o.title+'.');show(m)}else toast('No open opportunity for this company yet.')}));
  side.appendChild(w);side.appendChild(ta);const w2=h('div','if-tools');w2.appendChild(btn('Send (demo)','',()=>{if(!ta.value.trim()){toast('Write or draft a reply first.');return}toast('Not sent: this is a preview. In the live product it leaves from the connected mailbox and is logged on the opportunity.')}));w2.appendChild(btn('Copy','ghost',()=>copy(ta.value)));side.appendChild(w2)};
 D.mails.forEach(m=>{const r=h('tr','row'+(m.unread?' unread':''));r.tabIndex=0;[m.from,m.subject,m.deal?(dealOf(m.deal)||{}).title:'—',fmt(m.date)].forEach(x=>r.appendChild(h('td','',x)));r.addEventListener('click',()=>{show(m);I.draw&&0});r.addEventListener('keydown',e=>{if(e.key==='Enter')show(m)});tb.appendChild(r)});
 left.appendChild(h('p','if-lead','Customer mail is read from the connected mailbox and linked to the right company and opportunity.'));left.appendChild(t);split.appendChild(left);split.appendChild(side);root.appendChild(split);
 const cur=D.mails.find(x=>x.id===st.mail);cur?show(cur):side.appendChild(h('p','if-lead','Select a message to read it and draft a reply.'))}
// ---- Campaigns: sequences with steps, enrolment and replies
function campaigns(root){root.appendChild(h('p','if-lead','Sequences send the next email or create the next task by themselves. The sender ramps up gradually and stops when the person replies.'));
 const g=h('div','cx-cards');D.sequences.forEach(q=>{const c=h('div','cx-card');c.appendChild(h('h3','',q.name));const ol=h('ol','cx-steps');q.steps.forEach(x=>ol.appendChild(h('li','',x)));c.appendChild(ol);
  const m=h('div','cx-meta');[[q.enrolled,'enrolled'],[q.sent,'emails sent'],[q.replies,'replies']].forEach(x=>{const b=h('div');b.appendChild(h('b','',String(x[0])));b.appendChild(h('small','',x[1]));m.appendChild(b)});c.appendChild(m);
  c.appendChild(btn('Enrol a contact (demo)','ghost small',()=>{q.enrolled++;toast('Enrolled. The first step is scheduled; nothing is sent in this preview.');I.draw('crm')}));g.appendChild(c)});root.appendChild(g)}
// ---- Analysis: funnel, forecast, owners, sources
function analysis(root){
 const open=D.deals.filter(d=>d.stage!=='Order'),w=open.reduce((a,d)=>a+d.value*(D.stageProb[d.stage]||0),0),won=D.deals.filter(d=>d.stage==='Order').reduce((a,d)=>a+d.value,0);
 const k=h('div','if-kpis');[[gbp(open.reduce((a,d)=>a+d.value,0)),'Open pipeline'],[gbp(w),'Weighted forecast'],[gbp(won),'Orders won'],[String(open.length?Math.round(open.reduce((a,d)=>a+d.value,0)/open.length/1000)+'k':'0'),'Average deal (£)']].forEach(x=>{const d=h('div','if-kpi');d.appendChild(h('b','',x[0]));d.appendChild(h('span','',x[1]));k.appendChild(d)});root.appendChild(k);
 const wrap=h('div','cx-two'),a=h('div'),b=h('div');a.appendChild(h('h2','','Pipeline by stage'));
 const vals=D.stages.map(sg=>D.deals.filter(d=>d.stage===sg).reduce((x,d)=>x+d.value,0)),max=Math.max.apply(null,vals)||1,svg=s('svg',{class:'if-bars',viewBox:'0 0 520 '+(D.stages.length*40+10),role:'img','aria-label':'Pipeline value by stage'});
 D.stages.forEach((sg,i)=>{const y=i*40+6,wd=Math.max(4,Math.round(vals[i]/max*300));svg.appendChild(s('text',{class:'cx-t',x:4,y:y+19},sg));svg.appendChild(s('rect',{class:'cx-bar',x:100,y:y,width:wd,height:26,rx:5}));svg.appendChild(s('text',{class:'cx-t',x:108+wd,y:y+19},gbp(vals[i])))});a.appendChild(svg);
 b.appendChild(h('h2','','By owner'));const [t,tb]=table(['Owner','Open deals','Value']);const owners={};open.forEach(d=>{(owners[d.owner]=owners[d.owner]||[]).push(d)});Object.keys(owners).forEach(o=>{const r=h('tr');[o,String(owners[o].length),gbp(owners[o].reduce((x,d)=>x+d.value,0))].forEach(x=>r.appendChild(h('td','',x)));tb.appendChild(r)});b.appendChild(t);
 b.appendChild(h('h2','','Lead sources'));const [t2,tb2]=table(['Source','Leads','Qualified']);D.leadSources.forEach(x=>{const r=h('tr');[x.source,String(x.leads),String(x.qualified)].forEach(y=>r.appendChild(h('td','',y)));tb2.appendChild(r)});b.appendChild(t2);
 wrap.appendChild(a);wrap.appendChild(b);root.appendChild(wrap)}
return {today:today,calendar:calendar,mail:mail,campaigns:campaigns,analysis:analysis,
 // deal move: ask what was done, suggest the next reminders, then move and log
 move:function(side,d,after){clear(side);const nx=D.stages[D.stages.indexOf(d.stage)+1];side.appendChild(h('h2','','Move to '+nx));side.appendChild(h('p','if-lead',d.title+' · '+cust(d.customer)));
  const sel=h('select');sel.setAttribute('aria-label','What did you do');['Called the customer','Met on site','Sent an email','Sent the quote','Nothing yet'].forEach(x=>sel.appendChild(h('option','',x)));side.appendChild(h('label','','What did you do?'));side.appendChild(sel);
  const note=h('textarea','cx-ta');note.rows=3;note.setAttribute('aria-label','Note');note.placeholder='Short note (optional)';side.appendChild(note);
  const sug={Trial:['Collect the trial results'],Quote:['Send the quote','Call to check the quote arrived'],Negotiation:['Agree the delivery date'],Order:['Book the installation']}[nx]||['Follow up'];
  side.appendChild(h('h3','','Suggested reminders'));const boxes=[];sug.forEach(x=>{const l=h('label','sv-chk'),i=h('input');i.type='checkbox';i.checked=true;l.appendChild(i);l.appendChild(h('span','',x));side.appendChild(l);boxes.push([i,x])});
  const w=h('div','if-tools');w.appendChild(btn('Confirm move','',()=>{d.stage=nx;st.notes=st.notes||[];if(note.value.trim())st.notes.unshift({customer:d.customer,text:sel.value+': '+note.value.trim(),by:st.user.name});
   boxes.forEach(b=>{if(b[0].checked)D.activities.push({id:'a'+(D.activities.length+1),type:'Task',text:b[1]+' · '+d.title,deal:d.id,owner:d.owner,due:'2026-11-12',done:false})});
   toast('Moved to '+nx+'. Reminders added to Today and the Calendar.');after()}));w.appendChild(btn('Cancel','ghost',after));side.appendChild(w)},
 nextMove:function(d){const dd=I.days(d.due);return 'Next move for '+d.title+' ('+cust(d.customer)+', '+d.stage+'): '+d.next+(dd<0?', overdue by '+Math.abs(dd)+' days':', due '+fmt(d.due))+'. Suggested: contact the decision maker today and confirm what blocks the next stage.'}}
}
window.IFmods=window.IFmods||{};window.IFmods.crmx=function(){return api||(api=build())};
})();
