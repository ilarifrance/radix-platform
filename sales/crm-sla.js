'use strict';
/* «Scadenze SLA» in Assistenza (hooked by sales/crm-tools.js): a badge on every ticket card, the filter «Scaduti / In scadenza»
   over the ticket board and the settings panel (owners and admins save, everyone reads). The math is sales/crm-sla-core.js;
   the settings are the «__sla__» row of sales_segments, read once per workspace and shared with the Panoramica suggestions. */
(function(root){
const S=root.RadixCrmSla;if(!S)return;
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n};
const B=(text,fn,cls)=>{const b=E('button',text,cls);b.type='button';b.addEventListener('click',fn);return b};
const app=()=>root.RadixSalesApp;
const post=(entity,action,data)=>app().api(entity,{body:{workspace:app().state.workspace,entity,action,data}});
const canEdit=()=>['owner','admin'].includes(app().role());
const FILTERS=[['','Tutti i ticket'],['a-rischio','Scaduti e in scadenza'],['scaduti','Solo scaduti'],['in-scadenza','Solo in scadenza']];
let shared=null,filter='';
const rows=new WeakMap();// badge node → [ticket row, card]
// The «__sla__» row, read once per workspace. → {row,settings,loaded,error}; a failed read is not kept.
function load(fresh){
 const a=app(),ws=a&&a.state.workspace;if(!ws)return Promise.resolve(null);
 if(!fresh&&shared&&shared.ws===ws)return shared.promise;
 const entry={ws,value:null};
 entry.promise=(async()=>{const out={row:null,settings:S.DEFAULTS,loaded:false,error:''};
  try{const d=await a.api('segments',{subject:'sla'});out.row=(d.rows||[])[0]||null;out.settings=S.settings(out.row);out.loaded=true}
  catch(e){out.error=e.message||String(e)}
  entry.value=out;if(!out.loaded&&shared===entry)shared=null;
  if(shared===entry)refreshBadges();
  return out})();
 shared=entry;return entry.promise;
}
// Settings now (defaults until the row is read); starts the read.
function current(){const ws=app()?.state.workspace;if(!shared||shared.ws!==ws)load();return shared&&shared.ws===ws&&shared.value?shared.value.settings:S.DEFAULTS}
const evaluate=row=>S.evaluate(row,{now:Date.now(),settings:current(),interactions:app().rows('interactions')});
function paint(node,row,card){
 const r=evaluate(row),b=S.badge(r);
 if(!b){node.hidden=true;if(card)delete card.dataset.sla;return}
 node.hidden=false;node.textContent=b.text;node.title=b.title;node.className='crm-sla-badge is-'+b.state;
 if(card)card.dataset.sla=r.active?r.state:'chiuso';
}
function refreshBadges(){for(const n of document.querySelectorAll('.crm-sla-badge')){const x=rows.get(n);if(x)paint(n,x[0],x[1])}applyFilter()}
// Card block: the badge under the ticket's state line (ticket board and Customer360).
function mount(c,row){
 const node=E('span',undefined,'crm-sla-badge');rows.set(node,[row,c]);
 const state=c.querySelector('.ticket-state');if(state)state.after(node);else c.append(node);
 paint(node,row,c);
}
function applyFilter(scope){
 const sec=scope||document.getElementById('tickets'),board=sec&&sec.querySelector(':scope>.board');if(!board)return;let shown=0;
 for(const card of board.querySelectorAll('.card')){const r=card.dataset.sla;
  const ok=!filter||(r==='scaduto'&&filter!=='in-scadenza')||(r==='in-scadenza'&&filter!=='scaduti');card.hidden=!ok;if(ok)shown++}
 const note=sec.querySelector('.crm-sla-shown');if(note)note.textContent=filter?shown+(shown===1?' ticket mostrato':' ticket mostrati')+' con il filtro SLA.':'';
}
function summaryLine(){
 const n=S.summary(app().rows('tickets'),{now:Date.now(),settings:current(),interactions:app().rows('interactions')});
 return n.scaduto+(n.scaduto===1?' scaduto':' scaduti')+' · '+n['in-scadenza']+' in scadenza · '+n.ok+' nei tempi';
}
function settingsPanel(){
 const box=E('details',undefined,'crm-sla-settings');box.append(E('summary','Scadenze SLA'));
 const body=E('div',undefined,'crm-sla-body');box.append(body);
 let st=null;
 const draw=()=>{body.replaceChildren();if(!st){body.append(E('p','Caricamento delle scadenze…','muted'));return}
  const edit=canEdit()&&st.loaded,s=S.copy(st.settings);
  body.append(E('p','Ore dalla creazione del ticket alla prima risposta (registrata con «Rispondi al cliente») e alla risoluzione. «In scadenza» quando resta meno del 25% del tempo.','muted'));
  if(st.error)body.append(E('p','Impostazioni non leggibili: valgono quelle predefinite. '+st.error,'notice'));
  const table=E('table',undefined,'crm-sla-table'),head=E('tr');for(const h of ['Priorità','Prima risposta (ore)','Risoluzione (ore)'])head.append(E('th',h));table.append(head);
  const inputs={};
  for(const p of S.PRIORITIES){const tr=E('tr');tr.append(E('td',S.PRIORITY_LABEL[p]));inputs[p]={};
   for(const k of ['response','resolution']){const i=E('input');i.type='number';i.min='1';i.max=String(S.MAX_HOURS);i.step='1';i.inputMode='numeric';i.value=String(s[p][k]);i.disabled=!edit;
    i.setAttribute('aria-label',(k==='response'?'Prima risposta':'Risoluzione')+' in ore, priorità '+S.PRIORITY_LABEL[p]);inputs[p][k]=i;const td=E('td');td.append(i);tr.append(td)}
   table.append(tr)}
  const biz=E('label',undefined,'crm-sla-business'),cb=E('input');cb.type='checkbox';cb.checked=s.business;cb.disabled=!edit;biz.append(cb,document.createTextNode(' Solo orario lavorativo (lun-ven 09-18, ora di Roma; le festività non sono escluse)'));
  body.append(table,biz);
  if(!edit){body.append(E('p',canEdit()?'Impostazioni non lette: riprova più tardi.':'Solo owner e admin possono modificare le scadenze.','muted'));return}
  const read=()=>{const out={business:cb.checked};for(const p of S.PRIORITIES)out[p]={response:Number(inputs[p].response.value),resolution:Number(inputs[p].resolution.value)};return out};
  const acts=E('div',undefined,'actions');
  acts.append(B('Salva scadenze',()=>save(read()),'primary'),B('Ripristina predefinite',()=>{if(window.confirm('Ripristinare le scadenze predefinite (urgente 1/8 h, alta 4/24 h, media 8/48 h, bassa 24/120 h, ore di calendario)?'))save(S.copy(S.DEFAULTS))}));
  body.append(acts);
 };
 async function save(next){
  const v=S.validate(next);if(!v.ok){app().error(v.error);return}
  const a=app();if(a.state.busy)return;a.lock(true);a.error('');a.notice('Salvo le scadenze SLA…');
  try{const row=st.row,def=S.same(next,S.DEFAULTS);
   if(row&&def)await post('segments','delete',{id:row.id,version:row.version});
   else if(row)await post('segments','update',{id:row.id,version:row.version,filters:{sla:next}});
   else if(!def)await post('segments','create',{name:S.RESERVED,filters:{sla:next}});
   a.notice('Scadenze SLA salvate.')}
  catch(e){a.error(e.message||String(e));a.notice('Scadenze non salvate.')}
  finally{a.lock(false)}
  st=await load(true);draw();refreshBadges();const line=document.querySelector('#tickets .crm-sla-summary');if(line)line.textContent=summaryLine();
 }
 draw();load().then(r=>{st=r||{row:null,settings:S.DEFAULTS,loaded:false,error:'workspace non scelto.'};draw()});
 return box;
}
function section(section){
 const bar=E('div',undefined,'crm-sla-bar'),lab=E('label','Filtro SLA '),sel=E('select');
 for(const [v,t] of FILTERS){const o=E('option',t);o.value=v;sel.append(o)}sel.value=filter;
 sel.addEventListener('change',()=>{filter=sel.value;applyFilter(section)});lab.append(sel);
 bar.append(lab,E('span',summaryLine(),'crm-sla-summary muted'),E('span','','crm-sla-shown muted'));
 const board=section.querySelector(':scope>.board');
 section.insertBefore(bar,board);section.insertBefore(settingsPanel(),board);
 applyFilter(section);
}
Object.assign(S,{load,current,mount,section});
})(typeof globalThis!=='undefined'?globalThis:this);
