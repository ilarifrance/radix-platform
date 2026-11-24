'use strict';
/* Interfood demo: the RADIX assistant as a chat. Answers are computed from the sample data (no AI call is made).
   In the CRM it also logs what a salesperson types ("Called Fiona Marsh, send the quote Monday"). */
(function(){
window.IFmods=window.IFmods||{};
const I=()=>window.IF,chats={};
const PROMPTS={cc:['What needs my attention today?','Which machines are out of warranty?','Summarise Greenacre Dairy','Draft an update for Millbrook about T-2038'],
 crm:['What should I do today?','Summarise Northfield Bakeries','Called Fiona Marsh, wants delivery on 20 Nov, follow up Monday','Draft a follow-up email for Pennine Pies']};
function findCustomer(t){const D=I().D;let c=D.customers.find(x=>t.includes(x.name.toLowerCase())||t.includes(x.name.toLowerCase().split(' ')[0]));
 if(!c){const p=D.contacts.find(x=>t.includes(x.name.toLowerCase())||t.includes(x.name.toLowerCase().split(' ')[1]));if(p)c=D.customers.find(x=>x.id===p.customer)}return c}
function summary(c){const IF=I(),D=IF.D,deals=D.deals.filter(d=>d.customer===c.id&&d.stage!=='Order'),ms=D.machines.filter(m=>m.customer===c.id),ts=D.tickets.filter(x=>x.customer===c.id&&x.status!=='Resolved'),ps=D.contacts.filter(p=>p.customer===c.id),ns=(IF.st.notes||[]).filter(n=>n.customer===c.id);
 const L=[c.name+' ('+c.city+')'];if(IF.can('crm')){L.push('People: '+(ps.map(p=>p.name+', '+p.role).join('; ')||'none'));L.push('Open deals: '+(deals.map(d=>d.title+' '+IF.gbp(d.value)+' ('+d.stage+', next: '+d.next.toLowerCase()+')').join('; ')||'none'))}
 if(IF.can('assets'))L.push('Machines: '+(ms.map(m=>m.model+' '+m.status.toLowerCase()).join('; ')||'none'));if(IF.can('service'))L.push('Open work orders: '+(ts.map(x=>x.id+' '+x.issue.toLowerCase()).join('; ')||'none'));
 if(ns.length)L.push('Latest note: '+ns[0].text);return L.join('\n')}
function answer(q,scope){const IF=I(),D=IF.D,t=q.toLowerCase().trim(),c=findCustomer(t),can=IF.can;
 if(/^(log|called|call|met|spoke|emailed|email|visited)\b/.test(t)&&can('crm')){
  if(!c)return{text:'I could not tell which customer that is. Start with a name, for example "Called Fiona Marsh, ..."'};
  IF.st.notes=IF.st.notes||[];IF.st.notes.unshift({customer:c.id,text:q.trim(),by:IF.st.user.name,date:IF.TODAY});let out='Logged on '+c.name+'.';
  if(/follow.?up|call back|send|remind|chase/.test(t)){const dl=D.deals.find(d=>d.customer===c.id&&d.stage!=='Order');D.activities.push({id:'a'+(D.activities.length+1),type:'Task',text:'Follow up: '+q.trim().slice(0,70),deal:dl?dl.id:'',owner:IF.st.user.name,due:'2026-11-09',done:false});out+=' I also created a follow-up task for Mon 9 Nov'+(dl?' on "'+dl.title+'"':'')+'.'}
  return{text:out+' It shows on the company record and in Activities.'}}
 if(/attention|priorit|today|urgent|what should|what next/.test(t)){const p=IF.priorities().slice(0,5);return{text:p.length?'Here is what I would do first:\n'+p.map((x,i)=>(i+1)+'. '+x.title+' ('+x.sub+')').join('\n'):'Nothing needs your attention right now.',save:true}}
 if(/draft|write|reply|email|update/.test(t)&&c){const tk=D.tickets.find(x=>x.customer===c.id&&x.status!=='Resolved'),dl=D.deals.find(x=>x.customer===c.id&&x.stage!=='Order'),p=D.contacts.find(x=>x.customer===c.id);const nm=p?p.name.split(' ')[0]:'there';
  if(tk&&can('service')&&!/quote|offer|pipeline|deal/.test(t))return{text:'Subject: '+tk.id+' update\n\nHi '+nm+',\n\nQuick update on '+tk.issue.toLowerCase()+' ('+((IF.mach(tk.machine)||{}).model||'your machine')+'): '+(tk.tech?tk.tech+' is booked for '+IF.fmt(tk.day)+' at '+tk.start+':00.':'we are scheduling an engineer and will confirm the visit today.')+'\n\nTell me if the machine cannot be stopped at that time.\n\nBest regards,\n'+IF.st.user.name,save:true};
  if(dl&&can('crm'))return{text:'Subject: '+dl.title+'\n\nHi '+nm+',\n\nFollowing our conversation, '+dl.next.toLowerCase()+' is the next step on '+dl.title.toLowerCase()+' ('+IF.gbp(dl.value)+'). Would '+IF.fmt(dl.due)+' work for you?\n\nBest regards,\n'+IF.st.user.name,save:true}}
 if(c)return{text:summary(c),save:true};
 if(/warrant/.test(t)){if(!can('assets'))return{text:'Machine data is not part of your role ('+IF.st.user.role+').'};const m=D.machines.filter(x=>x.status==='Out of warranty'||x.status==='Warranty ending');return{text:'Out of warranty or ending soon:\n'+m.map(x=>'- '+x.model+' ('+x.id+') at '+IF.cust(x.customer)+', warranty '+IF.fmt(x.warrantyEnd)).join('\n')+'\nThese are the best spare-parts and upgrade conversations.',save:true}}
 if(/pipeline|forecast|deal|quote/.test(t)){if(!can('crm'))return{text:'The pipeline is not part of your role ('+IF.st.user.role+').'};const f=IF.figures();return{text:'Open pipeline: '+IF.gbp(f.pipeline)+' across '+f.deals+' deals.\n'+D.stages.map(g=>'- '+g+': '+IF.gbp(D.deals.filter(d=>d.stage===g).reduce((a,d)=>a+d.value,0))).join('\n'),save:true}}
 if(/ticket|work order|fault|service|engineer/.test(t)){if(!can('service'))return{text:'Service is not part of your role ('+IF.st.user.role+').'};const o=D.tickets.filter(x=>x.status!=='Resolved');return{text:o.length+' open work orders:\n'+o.map(x=>'- '+x.id+' '+x.issue.toLowerCase()+' at '+IF.cust(x.customer)+' ('+x.priority.toLowerCase()+', '+(x.tech||'not scheduled')+')').join('\n'),save:true}}
 return{text:'I can summarise a customer, list priorities, check warranties, the pipeline and open work orders, draft a message, or log a note (start with "Called ..."). Try one of the suggestions below.'}}
window.IFmods.assistant=function(root,o){const IF=I(),h=IF.h,scope=o.scope,msgs=chats[scope]||(chats[scope]=[]);
 const box=h('section','as-box');const hd=h('div','as-head');hd.appendChild(h('span','as-spark','✦'));const tt=h('div');tt.appendChild(h('b','','RADIX Assistant'));tt.appendChild(h('small','',o.sub||'Ask about your customers, machines and work'));hd.appendChild(tt);box.appendChild(hd);
 const list=h('div','as-msgs');box.appendChild(list);
 function paint(){IF.clear(list);if(!msgs.length)list.appendChild(h('p','as-empty',o.empty||'Ask a question or type what happened. Demo answers are computed from the sample data.'));
  msgs.forEach(m=>{const b=h('div','as-m '+m.who);b.appendChild(h('div','as-t',m.text));
   if(m.who==='bot'&&m.save){const ac=h('div','as-ac');if(IF.can('service')){ac.appendChild(IF.btn(m.saved?'Saved ✓':'Save to archive','ghost small',()=>{if(m.saved)return;IF.D.archive.unshift({id:'k'+(IF.D.archive.length+1),kind:'Chat answer',title:m.q.slice(0,60),text:m.text,tags:['assistant'],machine:'',shared:false,date:IF.TODAY,by:IF.st.user.name});m.saved=true;IF.toast('Saved to the Service archive. Engineers can reuse it in reports.');paint()}))}
    ac.appendChild(IF.btn('Copy','ghost small',()=>{try{navigator.clipboard.writeText(m.text);IF.toast('Copied.')}catch(e){IF.toast('Copy is not available here.')}}));b.appendChild(ac)}
   list.appendChild(b)});list.scrollTop=list.scrollHeight}
 paint();
 const chips=h('div','as-chips');(o.prompts||PROMPTS[scope]||[]).forEach(p=>{const b=h('button','as-chip',p);b.type='button';b.addEventListener('click',()=>send(p));chips.appendChild(b)});box.appendChild(chips);
 const f=h('form','as-form'),inp=h('input');inp.type='text';inp.placeholder=o.placeholder||'Ask, or type what happened…';inp.setAttribute('aria-label','Message');const sb=h('button','if-btn','Send');sb.type='submit';f.appendChild(inp);f.appendChild(sb);box.appendChild(f);
 function send(q){if(!q.trim())return;msgs.push({who:'me',text:q});const r=answer(q,scope);paint();setTimeout(()=>{msgs.push({who:'bot',text:r.text,save:r.save,q:q});if(list.isConnected)paint();if(scope==='crm'&&/^Logged/.test(r.text))IF.refreshNotes&&IF.refreshNotes()},250);inp.value=''}
 f.addEventListener('submit',e=>{e.preventDefault();send(inp.value)});
 root.appendChild(box)}
})();
