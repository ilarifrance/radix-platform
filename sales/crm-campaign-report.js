'use strict';
/* «Report campagna» inside «Sequenze e campagne email» (crm-campaigns.js, button «Risultati e report campagne»).
   One read: GET /api/sales?entity=email_clicks&report=campaigns. The numbers come from
   crm-campaign-report-core.js; this file only draws them. No writes, no AI: the «Suggerisci la prossima email»
   block of each campaign comes from crm-campaign-next.js. */
(function(){
const core=window.RadixCrmCampaignReportCore;if(!core)return;
const E=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n};
const B=(text,fn,cls)=>{const b=E('button',text,cls);b.type='button';b.addEventListener('click',fn);return b};
const app=()=>window.RadixSalesApp;
// The send date sits under the campaign name; sorting by it is in «Ordina per».
const SORTS=[['date','Data di invio'],['name','Campagna'],['sent','Inviate'],['clickers','Clic unici'],['clickRate','Tasso di clic'],['unsubscribed','Disiscritti'],['conversions','Conversioni'],['conversionRate','Tasso di conversione']];
const COLS=[['name','Campagna'],['sent','Inviate'],['clickers','Clic unici'],['clickRate','Tasso di clic'],['unsubscribed','Disiscritti'],['conversions','Conversioni'],['conversionRate','Tasso conv.']];
const n=v=>new Intl.NumberFormat('it-IT').format(v||0);
const day=t=>t===null||t===undefined?'—':core.formatRome(t,false);
// Loads the rows, then draws the report into out. State (window, sort, selection) lives on the node.
async function render(out){
 const a=app();if(!a||a.state.busy)return;
 // next: the AI suggestions per campaign key (crm-campaign-next.js), kept here because draw() rebuilds the DOM.
 const st={days:core.DEFAULT_DAYS,sort:'date',dir:'desc',selected:null,filter:'all',data:null,next:new Map()};
 a.lock(true);a.error('');a.notice('Carico il report delle campagne…');
 try{st.data=await loadReport()}catch(e){a.error(e.message||String(e));return}finally{a.lock(false)}
 a.notice('');draw(out,st);
}
async function loadReport(){
 const a=app(),q=new URLSearchParams({entity:'email_clicks',workspace:a.state.workspace,offset:'0',report:'campaigns'});
 const r=await fetch('/api/sales?'+q,{credentials:'same-origin',cache:'no-store'});const d=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(d.error||'Report non disponibile ('+r.status+').');
 return d.report||{};
}
function draw(out,st){
 const rep=core.buildReport(st.data,{days:st.days,now:Date.now()});
 const list=core.sortCampaigns(rep.campaigns,st.sort,st.dir);
 if(st.selected&&!list.some(c=>c.key===st.selected))st.selected=null;
 if(!st.selected&&list.length)st.selected=core.sortCampaigns(rep.campaigns,'date','desc')[0].key;
 const box=E('div',undefined,'crm-crep');box.setAttribute('aria-live','polite');
 const head=E('div',undefined,'crm-crep-head');head.append(E('h4','Report campagne'));
 const win=E('label',undefined,'crm-crep-window');win.append(E('span','Conversioni entro'));const sel=E('select');
 for(const d of core.WINDOWS){const o=E('option',d+' giorni');o.value=String(d);sel.append(o)}sel.value=String(st.days);
 sel.addEventListener('change',()=>{st.days=core.normDays(sel.value);draw(out,st);out.querySelector('.crm-crep-window select')?.focus()});win.append(sel);head.append(win);box.append(head);
 box.append(limits());
 if(!list.length){box.append(E('p','Ancora nessuna campagna registrata negli ultimi 400 giorni. Una campagna entra nel report quando le email vengono inviate o segnate come inviate da «Prepara gli invii».','muted'));out.replaceChildren(box);return}
 box.append(table(list,st,out));
 const c=list.find(x=>x.key===st.selected);if(c)box.append(detail(c,rep,st,out));
 box.append(E('p','Il primo clic di ogni persona su una campagna entra nella sua cronologia, alza il punteggio del contatto e crea un’attività «Richiama» per domani a chi gli ha scritto per ultimo. Alcuni filtri antivirus aprono i link da soli: un clic isolato subito dopo l’invio può non essere una persona. Date e finestre in ora italiana.','muted crm-crep-foot'));
 out.replaceChildren(box);
}
function limits(){
 const d=E('div',undefined,'crm-crep-limits');
 const p=E('p',undefined,'crm-crep-unmeasured');p.append(E('strong','Aperture: non ancora misurate. '),E('span','Servono un pixel di tracciamento e una tabella dedicata, non ancora presenti: per ora il report usa clic, disiscrizioni e conversioni.'));
 const more=E('details');more.append(E('summary','Cosa non è misurato e perché'));const ul=E('ul');
 for(const k of ['opens','ctor','delivered','repeatOpens','readTime'])ul.append(E('li',core.NOT_MEASURED[k]));more.append(ul);d.append(p,more);return d;
}
function table(list,st,out){
 const wrap=E('div',undefined,'crm-crep-tablewrap');const t=E('table',undefined,'crm-crep-table');
 t.append(E('caption','Confronto campagne · clic sul titolo di colonna per ordinare','crm-crep-caption'));
 const hr=E('tr');
 for(const [k,label] of COLS){const th=E('th');th.scope='col';const on=st.sort===k;th.setAttribute('aria-sort',on?(st.dir==='asc'?'ascending':'descending'):'none');
  const b=B(label+(on?(st.dir==='asc'?' ↑':' ↓'):''),()=>{if(st.sort===k)st.dir=st.dir==='asc'?'desc':'asc';else{st.sort=k;st.dir=k==='name'?'asc':'desc'}draw(out,st);out.querySelector('.crm-crep-table th[aria-sort]:not([aria-sort="none"]) button')?.focus()},'crm-crep-sort');
  if(k==='conversions'||k==='conversionRate')b.title=core.CONVERSION_NOTE.replace('N giorni',st.days+' giorni');th.append(b);hr.append(th)}
 const thead=E('thead');thead.append(hr);t.append(thead);const tb=E('tbody');
 for(const c of list){const tr=E('tr');if(c.key===st.selected)tr.className='is-selected';
  const name=E('td');name.dataset.label='Campagna';const pick=B(c.name,()=>{st.selected=c.key;st.filter='all';draw(out,st);out.querySelector('.crm-crep-detail h5')?.focus()},'crm-crep-pick');pick.setAttribute('aria-pressed',String(c.key===st.selected));name.append(pick);name.append(E('small',(c.lastSentAt!==null?'inviata '+day(c.lastSentAt):'nessun invio registrato')+(c.tracked?'':' · senza link tracciati'),'crm-crep-tag'));tr.append(name);
  const cell=(label,v,title)=>{const td=E('td',v);td.dataset.label=label;if(title)td.title=title;tr.append(td)};
  cell('Inviate',n(c.sent));cell('Clic unici',n(c.clickers));cell('Tasso di clic',core.formatRate(c.clickRate),c.sent?n(c.clickersSent)+' destinatari su '+n(c.sent)+' hanno cliccato':'Nessun invio registrato: tasso non calcolabile');
  cell('Disiscritti',n(c.unsubscribed));cell('Conversioni',n(c.conversions));cell('Tasso conv.',core.formatRate(c.conversionRate));tb.append(tr)}
 t.append(tb);
 // The same sort as a select, for the card layout where the column titles are hidden.
 const bar=E('label',undefined,'crm-crep-sortbar');bar.append(E('span','Ordina per'));const s=E('select');
 for(const [k,label] of SORTS)for(const dir of ['desc','asc']){const o=E('option',label+(dir==='asc'?' ↑':' ↓'));o.value=k+':'+dir;s.append(o)}
 s.value=st.sort+':'+st.dir;s.addEventListener('change',()=>{[st.sort,st.dir]=s.value.split(':');draw(out,st);out.querySelector('.crm-crep-sortbar select')?.focus()});bar.append(s);
 wrap.append(bar,t);return wrap;
}
function kpi(label,value,sub,cls,title){const d=E('div',undefined,'crm-crep-kpi'+(cls?' '+cls:''));d.append(E('span',label),E('strong',value));if(sub)d.append(E('small',sub));if(title)d.title=title;return d}
function detail(c,rep,st,out){
 const d=E('section',undefined,'crm-crep-detail');const h=E('h5','«'+c.name+'»');h.tabIndex=-1;d.append(h);
 d.append(E('p',(c.sent?'Inviata a '+n(c.sent)+(c.sent===1?' contatto':' contatti')+(c.firstSentAt!==c.lastSentAt?' tra il '+day(c.firstSentAt)+' e il '+day(c.lastSentAt):' il '+day(c.firstSentAt)):'Nessun invio registrato negli ultimi 400 giorni: ci sono solo clic')+(c.sendRecords>c.sent?' · '+n(c.sendRecords-c.sent)+' invii ripetuti allo stesso contatto contati una volta':'')+'.','muted'));
 const g=E('div',undefined,'crm-crep-kpis');
 g.append(kpi('Inviate',n(c.sent),'contatti con l’invio registrato'),
  kpi('Consegnate · bounce','non disponibile','il CRM registra solo gli invii riusciti','is-na',core.NOT_MEASURED.delivered),
  kpi('Aperture','non ancora misurate','serve il pixel di tracciamento','is-na',core.NOT_MEASURED.opens),
  kpi('Clic unici',n(c.clickers),'tasso di clic '+core.formatRate(c.clickRate),'', 'Destinatari che hanno cliccato almeno un link diviso inviate'+(c.clickersWithoutSend?' · '+n(c.clickersWithoutSend)+' clic da contatti senza invio registrato non entrano nel tasso':'')),
  kpi('Clic totali',n(c.clicks),n(c.repeatClicks)+' ripetuti'),
  kpi('CTOR','—','richiede le aperture','is-na',core.NOT_MEASURED.ctor),
  kpi('Disiscritti dopo l’invio',n(c.unsubscribed),core.formatRate(c.unsubscribeRate)+(c.unsubscribedNoDate?' · '+n(c.unsubscribedNoDate)+' senza consenso, data non registrata':''),'','Contatti che hanno usato il link di disiscrizione dopo questo invio (e prima di una campagna successiva). «Data non registrata»: oggi senza consenso, ma senza la data della disiscrizione nelle note.'),
  kpi('Conversioni entro '+rep.days+' gg',n(c.conversions),core.formatRate(c.conversionRate)+(c.windowOpen?' · finestra aperta per '+n(c.windowOpen):''),'',rep.conversionNote));
 d.append(g);
 const why=E('details',undefined,'crm-crep-why');why.append(E('summary','Cosa conta come conversione'),E('p',rep.conversionNote));
 const by=c.conversionsBy,parts=Object.keys(core.CONVERSION_LABEL).filter(k=>by[k]).map(k=>core.CONVERSION_LABEL[k]+' '+n(by[k]));
 if(parts.length)why.append(E('p','In questa campagna: '+parts.join(' · ')+'.'));
 if(c.windowOpen)why.append(E('p',n(c.windowOpen)+(c.windowOpen===1?' destinatario ha':' destinatari hanno')+' ancora la finestra aperta: il numero può crescere.'));
 d.append(why);
 if(c.links.length){const lk=E('div',undefined,'crm-crep-links');lk.append(E('h6','Link più cliccati'));const ol=E('ol');
  for(const l of c.links.slice(0,5)){const li=E('li');const u=E('span',l.url,'crm-crep-url');u.title=l.url;li.append(u,E('small',n(l.people)+(l.people===1?' persona':' persone')+' · '+n(l.clicks)+' clic'));ol.append(li)}lk.append(ol);d.append(lk)}
 else if(c.tracked)d.append(E('p','Nessun clic sui link di questa campagna.','muted'));
 else d.append(E('p','Email senza link tracciati: per questa campagna i clic non sono misurabili.','muted'));
 // «Suggerisci la prossima email» (crm-campaign-next.js), when loaded; it redraws through draw().
 const nx=window.RadixCrmCampaignNext;if(nx)d.append(nx.section(c,rep,st,out,()=>draw(out,st)));
 d.append(people(c,st,out));return d;
}
const FILTERS=[['all','Tutti'],['clicked','Hanno cliccato'],['converted','Convertiti'],['unsubscribed','Disiscritti']];
function people(c,st,out){
 const box=E('div',undefined,'crm-crep-people');box.append(E('h6','Destinatari'));
 const count={all:c.people.length,clicked:c.people.filter(p=>p.clicks).length,converted:c.people.filter(p=>p.conversion).length,unsubscribed:c.people.filter(p=>p.unsubscribedAt!==null).length};
 const seg=E('div',undefined,'crm-crep-seg');seg.setAttribute('role','group');seg.setAttribute('aria-label','Filtra i destinatari');
 for(const [k,label] of FILTERS){const b=B(label+' ('+count[k]+')',()=>{st.filter=k;draw(out,st);out.querySelector('.crm-crep-seg button[aria-pressed="true"]')?.focus()});b.setAttribute('aria-pressed',String(st.filter===k));seg.append(b)}
 box.append(seg);
 const rows=c.people.filter(p=>st.filter==='all'||(st.filter==='clicked'?p.clicks:st.filter==='converted'?p.conversion:p.unsubscribedAt!==null));
 if(!rows.length){box.append(E('p','Nessun destinatario in questo filtro.','muted'));return box}
 const ul=E('ul',undefined,'crm-crep-list');const MAX=200;
 for(const p of rows.slice(0,MAX)){const li=E('li');
  const who=B(p.name||'Contatto',()=>openRecord('contacts',{id:p.contact_id,name:p.name}),'crm-crep-link');who.title='Apri la scheda del contatto';li.append(who);
  const facts=E('span',undefined,'crm-crep-facts');
  facts.append(E('span',p.sentAt!==null?'inviata '+day(p.sentAt):'invio non registrato'));
  if(p.clicks)facts.append(E('span',p.clicks+(p.clicks===1?' clic':' clic')+' · primo '+core.formatRome(p.firstClickAt),'is-click'));
  if(p.unsubscribedAt!==null)facts.append(E('span','disiscritto '+core.formatRome(p.unsubscribedAt),'is-unsub'));
  if(p.conversion){const cv=E('span',undefined,'is-conv');cv.append(E('span',p.conversion.label+' · '+core.formatRome(p.conversion.at)+(p.conversion.title?' · '+p.conversion.title:'')));
   if(p.conversion.entity==='opportunities'&&p.conversion.id){const o=B('Apri la trattativa',()=>openRecord('opportunities',{id:p.conversion.id,title:p.conversion.title}),'crm-crep-link');cv.append(o)}facts.append(cv)}
  li.append(facts);ul.append(li)}
 box.append(ul);if(rows.length>MAX)box.append(E('p','Mostrati i primi '+MAX+' di '+n(rows.length)+'.','muted'));return box;
}
function openRecord(subject,row){const a=app();if(!a||a.state.busy||!a.openCustomer)return;a.openCustomer(subject,row).then(()=>{document.getElementById('customer360')?.scrollIntoView({block:'start'})})}
window.RadixCrmCampaignReport={render};
})();
