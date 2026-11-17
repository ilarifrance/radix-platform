'use strict';
/* «Percorso commerciale» on the contact (and on the opportunity, for its contact): the activities done on the contact
   before an opportunity exists, the open to-dos, and the contact's opportunities, with «Crea opportunità» prefilled
   from the contact. sales/crm-record.js mounts it inside the record view; the steps come from
   sales/crm-journey-core.js over the Customer360 rows (no extra request). */
(()=>{
const core=window.RadixCrmJourneyCore;if(!core)return;
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n};
const B=(text,fn,cls)=>{const b=E('button',text,cls);b.type='button';b.addEventListener('click',fn);return b};
const app=()=>window.RadixSalesApp;
const when=iso=>{if(!iso)return '';const d=new Date(iso);if(!Number.isFinite(d.getTime()))return '';
 return d.toLocaleDateString('it-IT',{day:'numeric',month:'short',year:d.getFullYear()===new Date().getFullYear()?undefined:'numeric',timeZone:'Europe/Rome'})+
  (/T00:00:00/.test(iso)?'':' · '+d.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Rome'}))};
const eur=c=>'€ '+(Number(c||0)/100).toLocaleString('it-IT',{maximumFractionDigits:0});

// «Crea opportunità»: the normal editor, with contact, company and a title already filled in.
function createOpportunity(j){
 const a=app();if(!a||a.state.busy||!a.writable('opportunities'))return;
 const company=j.contact&&j.contact.company_id?a.rows('companies').find(c=>c.id===j.contact.company_id):null;
 const d=core.opportunityDraft(j.contact,company&&company.name);if(!d)return;
 a.edit('opportunities',null);
 const f=document.getElementById('editor-form');if(!f)return;
 const set=(name,v)=>{const c=f.elements.namedItem(name);if(!c||v==null||v==='')return;
  if(c.tagName==='SELECT'&&![...c.options].some(o=>o.value===v)){const label=name==='contact_id'?(j.contact.name||'Contatto'):(company&&company.name)||'Azienda';c.append(new Option(label,v))}
  c.value=v;c.dispatchEvent(new Event('change',{bubbles:true}))};
 set('company_id',d.company_id);set('contact_id',d.contact_id);
 const title=f.elements.namedItem('title');if(title&&!title.value){title.value=d.title;title.select?.()}
 // Saved: back to the contact, now «In trattativa», with the new opportunity listed.
 const before=new Set(a.rows('opportunities').map(o=>o.id)),dlg=document.getElementById('editor');
 dlg?.addEventListener('close',()=>{let n=0;const t=setInterval(()=>{if(++n>60){clearInterval(t);return}if(a.state.busy)return;clearInterval(t);
  if(a.rows('opportunities').some(o=>o.contact_id===j.contactId&&!before.has(o.id)))a.openCustomer('contacts',j.contact)},200)},{once:true});
}
async function markDone(step,ctx){
 const a=app(),r=step.record;if(!a||a.state.busy||!a.writable('tasks')||!r||!Number.isInteger(r.version))return;
 const ok=await a.mutate('tasks','update',{id:r.id,version:r.version,status:'done'},'Segnare come fatta «'+r.title+'»?');
 if(ok)await a.openCustomer(ctx.subject,{id:ctx.id,name:ctx.title});
}
function item(step,ctx,canTasks){
 const li=E('li',undefined,'cj-step cj-'+(step.overdue?'overdue':step.planned?'planned':'done'));li.dataset.kind=step.kind;
 li.append(E('span',step.icon,'cj-ico'));
 const body=E('div',undefined,'cj-body');
 const top=E('p',undefined,'cj-top');top.append(E('b',step.label),E('span',step.title));body.append(top);
 const meta=step.kind==='task'?(step.planned?(step.due?(step.overdue?'Scaduta il ':'Entro il ')+when(step.due):'Senza scadenza'):(step.at?'Fatta il '+when(step.at):'Fatta')):(step.planned?'In programma il '+when(step.at):when(step.at));
 body.append(E('small',meta,'cj-when'));
 if(step.body)body.append(E('p',step.body.length>220?step.body.slice(0,219)+'…':step.body,'cj-text'));
 li.append(body);
 if(step.kind==='task'&&step.planned&&canTasks)li.append(B('Fatta',()=>markDone(step,ctx),'cj-done'));
 return li;
}
function list(title,steps,ctx,canTasks,empty){
 const box=E('div',undefined,'cj-part');box.append(E('h4',title+(steps.length?' · '+steps.length:'')));
 if(!steps.length){if(empty)box.append(E('p',empty,'muted'));return box}
 const ul=E('ul',undefined,'cj-list');steps.forEach(s=>ul.append(item(s,ctx,canTasks)));box.append(ul);return box;
}
function panel(ctx){
 const a=app();if(!a||!['contacts','opportunities'].includes(ctx.subject))return null;
 const j=core.journey(ctx.subject,ctx.id,ctx.rows,Date.now());if(!j)return null;
 const s=core.stage(j);
 const box=E('section',undefined,'crm-journey');box.setAttribute('aria-labelledby','cj-title');box.dataset.stage=s.key;
 const head=E('div',undefined,'crm-rec-head');
 const h=E('h3',ctx.subject==='contacts'?'Percorso commerciale':'Percorso del contatto');h.id='cj-title';
 const badge=E('span',s.label,'cj-badge cj-badge-'+s.key);
 const left=E('div',undefined,'cj-title');left.append(h,badge);head.append(left);
 if(ctx.subject==='contacts'&&!j.openOpportunities.length&&a.writable('opportunities'))head.append(B('Crea opportunità',()=>createOpportunity(j),'primary cj-create'));
 box.append(head);
 const facts=[];
 facts.push(j.counts.done+(j.counts.done===1?' attività fatta':' attività fatte')+' prima dell’opportunità');
 if(j.open.length)facts.push(j.open.length+' da fare'+(j.overdue.length?' ('+j.overdue.length+' scadute)':''));
 if(j.daysSinceLast!=null)facts.push(j.daysSinceLast===0?'ultimo contatto oggi':'ultimo contatto '+j.daysSinceLast+' g fa');
 box.append(E('p',s.hint+' '+facts.join(' · ')+'.','cj-hint'));
 // The contact's opportunities, each one opens its record.
 if(ctx.subject==='contacts'&&j.opportunities.length){
  const ol=E('div',undefined,'cj-opps');
  for(const o of j.opportunities){const st=o.outcome==='won'?'vinta':o.outcome==='lost'?'persa':'aperta';
   const b=B(o.title+' · '+eur(o.amount_cents)+' · '+st,()=>a.openCustomer('opportunities',o),'cj-opp cj-opp-'+st);b.title='Apri l’opportunità';ol.append(b)}
  box.append(ol);
 }
 const canTasks=a.writable('tasks');
 const cols=E('div',undefined,'cj-cols');
 cols.append(list('Da fare',j.open,ctx,canTasks,'Niente in programma: aggiungi una chiamata o un’attività da «Registra un’attività».'));
 const before=j.preparatory.filter(x=>!x.planned);
 cols.append(list(j.opportunities.length?'Prima dell’opportunità':'Attività sul contatto',before,ctx,canTasks,'Nessuna attività registrata sul contatto.'));
 const onOpp=j.onOpportunity.filter(x=>!x.planned);
 if(onOpp.length)cols.append(list('Sull’opportunità',onOpp,ctx,canTasks));
 box.append(cols);
 return box;
}
window.RadixCrmJourney={panel};
})();
