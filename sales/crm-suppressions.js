'use strict';
/* «Indirizzi disiscritti» (Impostazioni › Caselle email, shell/settings.js; api/_sales_suppressions.js, migration sales 017).
   The permanent list of addresses that never get a campaign email from this workspace, also after the contact is deleted
   or imported again. Owner and admin only. The list holds only an impronta (SHA-256 hash) of each address, never the
   address: the panel shows the count, the reasons, the latest rows by impronta, and exports the list as CSV (hash, motivo,
   fonte, data). The only address on screen is the one the user types to check it or to add it; it is hashed by the server.
   «Rimuovi» asks a RadixConfirm (lib/radix-confirm.js) that shows the reason first. */
(function(root){
const REASONS=Object.freeze({unsubscribe:'Disiscrizione',bounce:'Rimbalzo',complaint:'Segnalata come spam',manual:'Aggiunto a mano'});
const REASON_HINTS=Object.freeze({unsubscribe:'ha chiesto di non ricevere più email (link, risposta o telefono)',bounce:'l’indirizzo non esiste o rifiuta le email',complaint:'ha segnalato una email come spam',manual:'escluso per scelta del team'});
const reasonLabel=r=>REASONS[r]||String(r||'');
const shortHash=h=>String(h||'').slice(0,12)+'…';
const day=t=>{if(!t)return '';const d=new Date(t);return Number.isFinite(d.getTime())?d.toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Europe/Rome'}):''};
const plausible=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim())&&String(v).trim().length<=254;
// CSV of the list: hash, reason (code and label), source, date. Never an address. Semicolon-separated for Excel in Italian.
function toCsv(rows){
 const q=v=>{const s=String(v==null?'':v);return /[";\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
 const lines=[['email_sha256','motivo','motivo_descrizione','fonte','data_utc'].join(';')];
 for(const r of rows||[])lines.push([r.email_hash,r.reason,reasonLabel(r.reason),r.source||'',r.created_at||''].map(q).join(';'));
 return '﻿'+lines.join('\r\n')+'\r\n';
}
const core={REASONS,REASON_HINTS,reasonLabel,shortHash,toCsv,plausible,day};
if(typeof module==='object'&&module.exports){module.exports=core;return}

const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n};
const B=(text,fn,cls)=>{const b=E('button',text,cls);b.type='button';b.addEventListener('click',fn);return b};
const app=()=>root.RadixSalesApp;
const post=(action,data)=>app().api('email_suppressions',{body:{workspace:app().state.workspace,entity:'email_suppressions',action,data}});
async function run(label,fn){const a=app();if(a.state.busy)return false;a.lock(true);a.error('');a.notice(label);let ok=false;try{await fn();ok=true}catch(e){a.error(e.message||String(e))}finally{a.lock(false)}return ok}
const ask=o=>root.RadixConfirm?root.RadixConfirm.ask(o):Promise.resolve(!!root.confirm([o.title,...(o.facts||[]).map(f=>f[0]+': '+f[1]),o.message].filter(Boolean).join('\n')));
const SHOWN=10;

function panel(){
 const box=E('details',undefined,'panel crm-supp');box.append(E('summary','Indirizzi disiscritti'));
 box.append(E('p','Chi è in questa lista non riceve più email commerciali da questo workspace (campagne, coda invii, newsletter, prospezione B2B), anche se il contatto viene eliminato o importato di nuovo. Si conserva solo un’impronta cifrata dell’indirizzo (hash SHA-256), mai l’indirizzo.','muted'));
 const head=E('div',undefined,'crm-supp-head'),form=E('div',undefined,'crm-supp-form'),result=E('div',undefined,'crm-supp-result'),list=E('div',undefined,'crm-supp-list');
 result.setAttribute('role','status');result.setAttribute('aria-live','polite');
 box.append(head,form,result,list);
 let data=null;
 box.addEventListener('toggle',()=>{if(box.open)refresh()});
 box.refresh=refresh;
 async function refresh(){
  try{data=await app().api('email_suppressions',{})}catch(e){head.replaceChildren(E('p',e.message,'notice'));form.replaceChildren();list.replaceChildren();return}
  draw();
 }
 function draw(){
  head.replaceChildren();
  const count=E('div',undefined,'crm-supp-count');count.append(E('strong',String(data.count)),E('span',data.count===1?'indirizzo disiscritto':'indirizzi disiscritti'));
  const chips=E('div',undefined,'crm-supp-chips');
  for(const r of Object.keys(REASONS)){const n=(data.by_reason||{})[r]||0;const c=E('span',reasonLabel(r)+' · '+n,'crm-supp-chip');c.dataset.reason=r;if(!n)c.dataset.empty='1';chips.append(c)}
  const exp=B('Esporta CSV',exportCsv);exp.disabled=!data.rows.length;
  const side=E('div',undefined,'crm-supp-side');side.append(chips,exp);
  head.append(count,side);
  if(!form.childNodes.length)form.append(...addForm());
  drawList();
 }
 function addForm(){
  const email=Object.assign(E('input'),{type:'email',maxLength:254,placeholder:'nome@azienda.it',autocomplete:'off',spellcheck:false});
  email.setAttribute('aria-label','Indirizzo da controllare o aggiungere');
  const reason=E('select');reason.setAttribute('aria-label','Motivo');
  for(const r of ['manual','bounce','complaint','unsubscribe']){const o=E('option',reasonLabel(r));o.value=r;reason.append(o)}
  const l1=E('label',undefined,'crm-mb-field');l1.append(E('span','Indirizzo da controllare o aggiungere'),email);
  const l2=E('label',undefined,'crm-mb-field');l2.append(E('span','Motivo'),reason);
  const hint=E('small',REASON_HINTS.manual,'muted');reason.addEventListener('change',()=>{hint.textContent=REASON_HINTS[reason.value]||''});l2.append(hint);
  const grid=E('div',undefined,'crm-supp-grid');grid.append(l1,l2);
  const value=()=>{const v=email.value.trim();if(!plausible(v)){app().error('Scrivi un indirizzo email valido.');email.focus();return null}return v};
  const check=B('Controlla',async()=>{const v=value();if(!v)return;let r;if(!await run('Controllo l’indirizzo…',async()=>{r=(await post('check',{email:v})).rows[0]}))return;app().notice('');showCheck(v,r)});
  const add=B('Aggiungi alla lista',async()=>{const v=value();if(!v)return;let r;
   if(!await run('Aggiungo l’indirizzo…',async()=>{r=(await post('add',{email:v,reason:reason.value})).rows[0]}))return;
   app().notice(r.added?v+' è ora nella lista dei disiscritti'+(r.cancelled?': '+r.cancelled+(r.cancelled===1?' email in coda annullata':' email in coda annullate'):'')+'.':v+' era già nella lista ('+reasonLabel(r.reason)+').');
   email.value='';result.replaceChildren();await refresh()},'primary');
  const acts=E('div',undefined,'actions');acts.append(check,add);
  email.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();check.click()}});
  return [grid,acts];
 }
 // The address typed by the user, with what the server says about its hash. Nothing of it is kept in the page after.
 function showCheck(email,r){
  result.replaceChildren();const p=E('div',undefined,'crm-supp-check');p.dataset.on=r.suppressed?'1':'0';
  if(!r.suppressed){p.append(E('strong',email),E('span',' non è nella lista: può ricevere campagne se ha il consenso (o rispetta le regole B2B).'));result.append(p);return}
  p.append(E('strong',email),E('span',' è nella lista · '+reasonLabel(r.reason)+' · '+day(r.created_at)+(r.source?' · '+r.source:'')));
  p.append(B('Rimuovi dalla lista',()=>remove(r,email),'danger'));result.append(p);
 }
 function drawList(){
  list.replaceChildren();
  if(!data.rows.length){list.append(E('p','Nessun indirizzo nella lista. Si riempie da sola quando qualcuno usa il link di disiscrizione.','muted'));return}
  list.append(E('h4',data.count>SHOWN?'Ultimi '+SHOWN+' di '+data.count:'Nella lista'));
  const t=E('table',undefined,'crm-supp-table'),hd=E('tr');for(const h of ['Impronta','Motivo','Fonte','Data',''])hd.append(E('th',h));
  const thead=E('thead');thead.append(hd);const tb=E('tbody');t.append(thead,tb);
  for(const r of data.rows.slice(0,SHOWN)){const tr=E('tr');const h=E('td',shortHash(r.email_hash),'crm-supp-hash');h.title=r.email_hash;
   const why=E('td');why.append(E('span',reasonLabel(r.reason),'crm-supp-chip'));why.lastChild.dataset.reason=r.reason;
   const act=E('td');act.append(B('Rimuovi',()=>remove(r),'crm-supp-remove'));
   tr.append(h,why,E('td',r.source||'—'),E('td',day(r.created_at)),act);tb.append(tr)}
  const wrap=E('div',undefined,'crm-supp-scroll');wrap.append(t);list.append(wrap);
  if(data.count>SHOWN)list.append(E('p','Le altre sono nel file CSV.','muted'));
 }
 async function remove(r,email){
  const ok=await ask({title:'Togliere l’indirizzo dalla lista dei disiscritti?',tone:'danger',ok:'Rimuovi dalla lista',
   facts:[...(email?[['Indirizzo',email]]:[['Impronta',shortHash(r.email_hash)]]),['Motivo',reasonLabel(r.reason)+' — '+(REASON_HINTS[r.reason]||'')],['Nella lista dal',day(r.created_at)||'—'],...(r.source?[['Fonte',r.source]]:[])],
   message:r.reason==='unsubscribe'||r.reason==='complaint'?'Questa persona ha chiesto di non ricevere email: toglila solo se te l’ha chiesto di nuovo per iscritto.\nDa ora potrà ricevere campagne, se ha il consenso o rispetta le regole B2B.':'Da ora l’indirizzo potrà ricevere campagne, se ha il consenso o rispetta le regole B2B.'});
  if(!ok)return;let x;
  if(!await run('Rimuovo l’indirizzo…',async()=>{x=(await post('remove',{email_hash:r.email_hash,confirm:true})).rows[0]}))return;
  app().notice('Indirizzo tolto dalla lista.'+(x.still_opted_out?' '+x.still_opted_out+(x.still_opted_out===1?' contatto ha':' contatti hanno')+' ancora una nota di disiscrizione: resta escluso finché non la togli.':''));
  result.replaceChildren();await refresh();
 }
 function exportCsv(){
  if(!data||!data.rows.length)return;
  const a=E('a');a.href=URL.createObjectURL(new Blob([toCsv(data.rows)],{type:'text/csv;charset=utf-8'}));a.download='indirizzi-disiscritti-'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);
  app().notice(data.count>data.rows.length?'Esportati i '+data.rows.length+' più recenti di '+data.count+'.':'Esportati '+data.rows.length+(data.rows.length===1?' indirizzo':' indirizzi')+' (solo impronte, nessun indirizzo).');
 }
 return box;
}
root.RadixCrmSuppressions={...core,panel};
})(typeof globalThis!=='undefined'?globalThis:this);
