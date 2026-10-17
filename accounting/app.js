/* RADIX Accounting page: bookkeeping and management control for a client company.
   Data from /api/accounting (or the in-browser demonstration store when the archive is not active yet).
   Every figure is computed by lib/accounting from the company's entries; nothing is invented. */
(function(){
'use strict';
const COA=window.RadixChartOfAccounts,LED=window.RadixLedger,FPA=window.RadixFatturaPA,BANK=window.RadixBankCSV,POST=window.RadixPosting,VAT=window.RadixVAT,MGMT=window.RadixManagement,REC=window.RadixReconcile,DEMO=window.RadixAccDemo,P7M=window.RadixP7M,CAMT=window.RadixCAMT,ASSETS=window.RadixAssets,COP=window.RadixCopilot,PRICE=window.RadixPricing;
const $=id=>document.getElementById(id);
const view=$('accView');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const EUR=new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'});
const eur=c=>EUR.format((c||0)/100);
const eur0=c=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format((c||0)/100);
const signed=c=>'<span class="'+(c<0?'neg':'')+'">'+eur(c)+'</span>';
const dateIt=d=>d?d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4):'';
const today=new Date().toISOString().slice(0,10);
const TABS=['panoramica','fatture','prima-nota','banca','iva','bilancio','gestione','chiusure','copilota','impostazioni'];
const SHELL_IDS={panoramica:'accounting',fatture:'acc-invoices','prima-nota':'acc-journal',banca:'acc-bank',iva:'acc-vat',bilancio:'acc-reports',gestione:'acc-control',chiusure:'acc-close',copilota:'acc-copilot',impostazioni:'accounting'};
const ROLE={owner:'Titolare',admin:'Amministratore',accountant:'Commercialista',member:'Collaboratore',viewer:'Sola lettura'};
const PLAN={base:'RADIX Contabilità',controllo:'RADIX Contabilità',professionista:'Con commercialista'};
const PLAN_OPTS=[['base','RADIX Contabilità, '+eur0(PRICE.PRICE_CENTS)+' al mese'],['professionista','Con commercialista']];
const S={store:null,demo:false,companies:[],company:null,year:+today.slice(0,4),data:null,calc:null,tab:'panoramica',ui:{docFilter:'to_review',doc:null,pct:100,editor:null,ledger:null,itemKind:'receivable',dimension:'project',ivaPeriod:null,journalFilter:'',closeMonth:null,rates:{},accrual:{kind:'risconto_attivo',account:'',amount:'',from:'',to:'',description:''},chat:[],asking:false},busy:false};

// ---------- data access ----------
function liveStore(){
 const call=async(url,opt)=>{const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt});let j={};try{j=await r.json();}catch{}if(!r.ok){const e=new Error(j.error||'Errore '+r.status);e.status=r.status;throw e;}return j;};
 return {
  companies:()=>call('/api/accounting?resource=companies').then(j=>j.rows),
  bundle:year=>call('/api/accounting?resource=bundle&company='+encodeURIComponent(S.company)+'&year='+year),
  command:(action,data)=>call('/api/accounting',{method:'POST',headers:{'Content-Type':'application/json','X-Radix-Accounting':'1'},body:JSON.stringify({action,data,...(action==='company.create'?{}:{company:S.company})})}),
  commandRaw:body=>call('/api/accounting',{method:'POST',headers:{'Content-Type':'application/json','X-Radix-Accounting':'1'},body:JSON.stringify(body)})
 };
}
function banner(text,kind){const b=$('accBanner');if(!text){b.hidden=true;return;}b.hidden=false;b.className='acc-banner '+(kind||'');b.innerHTML=text;}
let flashTimer=null;
function flash(text,kind){if(S.demo&&kind!=='error'){banner(demoNote()+' '+esc(text),'demo');}else banner(esc(text),kind||'ok');clearTimeout(flashTimer);if(kind!=='error')flashTimer=setTimeout(()=>{S.demo?banner(demoNote(),'demo'):banner('');},6000);}
const demoNote=()=>'<b>Modalità dimostrativa.</b> Azienda e numeri inventati, calcolati dal motore contabile vero; nulla viene salvato e tutto si azzera ricaricando.';
async function run(action,data,ok){
 if(S.busy)return null;S.busy=true;document.body.style.cursor='progress';
 try{const r=await S.store.command(action,data);await reload();if(ok)flash(typeof ok==='function'?ok(r):ok,'ok');return r;}
 catch(e){flash(e.message||'Operazione non riuscita.','error');return null;}
 finally{S.busy=false;document.body.style.cursor='';}
}
async function reload(){
 S.data=await S.store.bundle(S.year);
 S.data.accounts=S.data.accounts.map(a=>({...a,group:a.group||a.grp}));
 S.calc=derive(S.data);render();
}

// ---------- derived figures ----------
function derive(d){
 const y=S.year,from=y+'-01-01',to=y+'-12-31',acc=d.accounts,posted=d.entries.filter(e=>e.status==='posted');
 const cut=y===+today.slice(0,4)?today:to;
 const is=LED.incomeStatement(posted,acc,{from,to});
 const kp=MGMT.kpis(posted,acc,d.open_items,{from,to:cut});
 const age=MGMT.ageing(d.open_items,today);
 const fc=MGMT.cashForecast(d.open_items,{today,opening_cents:kp.cash_cents});
 const periodicity=d.company.vat_periodicity;
 const closed=new Map((d.settlements||[]).map(s=>[s.period,s]));
 const periods=VAT.periods(y,periodicity);let debit=0,credit=0;
 const vat=periods.map((p,i)=>{const c=closed.get(p.key);const s=c?c.result:VAT.settle(d.vat_rows,{periodicity,period:p.key,previousDebit_cents:debit,previousCredit_cents:credit});debit=s.carry_debit_cents;credit=s.carry_credit_cents;return {...s,closed:!!c,period:p,canClose:!c&&p.to<today&&(i===0||closed.has(periods[i-1].key))};});
 const next=vat.find(v=>!v.closed&&v.period.to<today)||vat.find(v=>v.period.from<=today&&v.period.to>=today);
 const newBank=d.bank.filter(m=>m.status==='new');
 const sugg=REC.suggest(newBank,d.open_items);
const checks=COP.anomalies(d,{year:y,today});
 return {checks,posted,is,kp,age,fc,vat,next,sugg,toReview:d.documents.filter(x=>x.status==='to_review'),drafts:d.entries.filter(e=>e.status==='draft'),idx:COA.index(acc),cut};
}

// ---------- rendering ----------
function render(){
 const d=S.data,c=S.calc;
 $('accTitle').textContent=d.company.name;
 $('accLead').textContent=[d.company.vat||d.company.tax_code,'Regime '+d.company.regime,'IVA '+(d.company.vat_periodicity==='monthly'?'mensile':'trimestrale'),'Piano '+(PLAN[d.company.plan]||d.company.plan),'Il tuo ruolo: '+(ROLE[d.company.role]||d.company.role)].filter(Boolean).join(' · ');
 $('accSwitch').hidden=false;$('accTabs').hidden=false;
 $('cntDocs').textContent=c.toReview.length||'';$('cntChecks').textContent=c.checks.filter(x=>x.level!=='bassa').length||'';$('cntBank').textContent=c.sugg.length||'';
 for(const a of document.querySelectorAll('#accTabs a'))a.toggleAttribute('aria-current',a.dataset.tab===S.tab),a.dataset.tab===S.tab&&a.setAttribute('aria-current','page');
 for(const a of document.querySelectorAll('.rx-sidebar [data-rx-id^="acc"],.rx-sidebar [data-rx-id="accounting"]')){if(a.dataset.rxId===SHELL_IDS[S.tab]&&!(S.tab==='impostazioni'))a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}
 view.innerHTML=({panoramica,fatture,'prima-nota':primaNota,banca,iva,bilancio,gestione,chiusure,copilota,impostazioni}[S.tab]||panoramica)(d,c);
 if(S.tab==='prima-nota'&&S.ui.editor)updateBalance();
}
const canWrite=()=>['owner','admin','accountant','member'].includes(S.data.company.role);
const canManage=()=>['owner','admin','accountant'].includes(S.data.company.role);
const dis=ok=>ok?'':' disabled title="Il tuo ruolo non consente questa azione"';
const kpi=(label,value,note)=>'<div class="acc-panel acc-kpi"><span>'+esc(label)+'</span><strong>'+value+'</strong>'+(note?'<small>'+note+'</small>':'')+'</div>';
const panel=(title,body,actions)=>'<div class="acc-panel"><div class="acc-panel-head"><h2>'+esc(title)+'</h2>'+(actions||'')+'</div>'+body+'</div>';
const empty=t=>'<p class="acc-empty">'+t+'</p>';
const accOptions=(sel,filter)=>S.data.accounts.filter(a=>a.active!==false&&(!filter||filter(a))).map(a=>'<option value="'+esc(a.code)+'"'+(a.code===sel?' selected':'')+'>'+esc(a.code+' · '+a.name)+'</option>').join('');
const accName=code=>{const a=S.calc.idx.get(code);return a?a.name:code;};

function panoramica(d,c){
 const k=c.kp,n=c.next;
 const todo=[];
 if(c.toReview.length)todo.push(['warn',c.toReview.length+' fatture da registrare','#fatture','Rivedi']);
 if(c.sugg.length)todo.push(['warn',c.sugg.length+' movimenti bancari da riconciliare','#banca','Riconcilia']);
 if(c.age.overdue.length){const r=c.age.overdue.filter(o=>o.kind==='receivable');if(r.length)todo.push(['err',r.length+' crediti scaduti per '+eur(r.reduce((t,o)=>t+o.open_cents,0)),'#banca','Scadenzario']);const p=c.age.overdue.filter(o=>o.kind==='payable');if(p.length)todo.push(['err',p.length+' debiti scaduti per '+eur(p.reduce((t,o)=>t+o.open_cents,0)),'#banca','Scadenzario']);}
 if(c.drafts.length)todo.push(['warn',c.drafts.length+' registrazioni in bozza','#prima-nota','Apri']);
 if(n&&!n.closed&&n.period.to<today)todo.push(['warn','Liquidazione IVA '+n.period.label+' da chiudere','#iva','Apri']);
 if(c.fc.first_negative)todo.push(['err','Cassa prevista sotto zero nella settimana del '+dateIt(c.fc.first_negative.from),'#gestione','Vedi']);
 const other=c.checks.filter(x=>['duplicate_invoice','negative_cash','customers_credit','suppliers_debit','unbalanced','vat_late','depreciation_missing','unassigned_costs','revenue_debit'].includes(x.code));
 if(other.length)todo.push([other.some(x=>x.level==='alta')?'err':'warn',other.length===1?other[0].title:other.length+' controlli del copilota da verificare','#copilota','Vedi']);
 if(!todo.length)todo.push(['ok','Nessuna attività in sospeso','','']);
 const vatTile=n?(n.closed?eur(n.payable_cents):eur(Math.max(0,n.vp14_cents))):'—';
 return '<div class="acc-grid kpi">'+
  kpi('Ricavi '+S.year,eur0(k.revenue_cents),'Fino al '+dateIt(c.cut))+
  kpi('Margine operativo lordo',eur0(k.ebitda_cents),k.ebitda_pct==null?'':k.ebitda_pct.toLocaleString('it-IT')+'% dei ricavi')+
  kpi('Risultato',eur0(k.net_cents),'prima delle imposte sul reddito non ancora stimate')+
  kpi('Cassa e banca',eur0(k.cash_cents),'saldo contabile')+
  kpi('Crediti da incassare',eur0(k.receivables_cents),k.dso_days==null?'':'incasso medio '+k.dso_days+' giorni')+
  kpi('Debiti da pagare',eur0(k.payables_cents),k.dpo_days==null?'':'pagamento medio '+k.dpo_days+' giorni')+
  kpi('IVA '+(n?n.period.label:''),vatTile,n?(n.closed?(n.payable_cents?'da versare entro il '+dateIt(n.due)+' · F24 '+n.f24_code:n.status):'stima in corso · '+n.status):'')+
 '</div><div class="acc-grid two" style="margin-top:16px">'+
  panel('Ricavi e costi per mese',monthChart(MGMT.monthly(c.posted,d.accounts,S.year))+'<div class="acc-legend"><span><i style="background:var(--rx-studio)"></i>Ricavi</span><span><i style="background:#65B8FF"></i>Costi</span><span><i style="background:#1EF28F"></i>Margine operativo lordo</span></div>')+
  panel('Da fare',(n?'':'')+'<ul class="acc-todo">'+todo.map(t=>'<li><span><span class="acc-dot '+t[0]+'"></span>'+esc(t[1])+'</span>'+(t[2]?'<a class="acc-btn small ghost" href="'+t[2]+'">'+t[3]+'</a>':'')+'</li>').join('')+'</ul>')+
 '</div>'+panel('Cassa prevista nelle prossime 13 settimane',cashChart(c.fc,k.cash_cents)+'<p class="acc-subtle">Saldo di oggi più incassi e pagamenti attesi dalle scadenze delle fatture registrate. Le spese senza fattura (stipendi, F24) non sono ancora incluse.</p>');
}
function monthChart(months){
 const W=960,H=240,P=34,max=Math.max(1,...months.map(m=>Math.max(m.values.ricavi,-(m.values.valore_produzione-m.values.ebitda)))),bw=(W-P)/12;
 const y=v=>H-24-(v/max)*(H-44);
 let s='<svg class="acc-bars" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Ricavi e costi per mese">';
 s+='<line x1="'+P+'" x2="'+W+'" y1="'+(H-24)+'" y2="'+(H-24)+'" stroke="currentColor" opacity=".2"/>';
 const pts=[];
 months.forEach((m,i)=>{const x=P+i*bw,rev=m.values.ricavi,cost=m.values.valore_produzione-m.values.ebitda;
  s+='<rect x="'+(x+bw*.15)+'" y="'+y(rev)+'" width="'+(bw*.32)+'" height="'+Math.max(0,H-24-y(rev))+'" rx="3" fill="var(--rx-studio)"><title>'+esc(m.month+'/'+S.year+' ricavi '+eur(rev))+'</title></rect>';
  s+='<rect x="'+(x+bw*.5)+'" y="'+y(cost)+'" width="'+(bw*.32)+'" height="'+Math.max(0,H-24-y(cost))+'" rx="3" fill="#65B8FF"><title>'+esc('costi '+eur(cost))+'</title></rect>';
  s+='<text x="'+(x+bw/2)+'" y="'+(H-8)+'" text-anchor="middle">'+['G','F','M','A','M','G','L','A','S','O','N','D'][i]+'</text>';
  if(m.values.ricavi||cost)pts.push((x+bw/2)+','+y(Math.max(0,m.values.ebitda)));});
 s+='<polyline points="'+pts.join(' ')+'" fill="none" stroke="#1EF28F" stroke-width="2"/>';
 s+='<text x="0" y="14">'+esc(eur0(max))+'</text></svg>';return s;
}
function cashChart(fc,opening){
 const W=1100,H=200,P=10,vals=[opening,...fc.weeks.map(w=>w.closing_cents)],lo=Math.min(...vals),max=Math.max(...vals,1),min=lo<0?lo:Math.max(0,lo-(max-lo)*0.6-1),span=max-min||1;
 const x=i=>P+i*(W-2*P)/(vals.length-1),y=v=>12+(max-v)/span*(H-36);
 let s='<svg class="acc-bars" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Cassa prevista">';
 if(min<0)s+='<line x1="0" x2="'+W+'" y1="'+y(0)+'" y2="'+y(0)+'" stroke="#FF6B70" stroke-dasharray="4 4" opacity=".7"/>';
 s+='<polyline points="'+vals.map((v,i)=>x(i)+','+y(v)).join(' ')+'" fill="none" stroke="var(--rx-core)" stroke-width="2.5"/>';
 vals.forEach((v,i)=>{s+='<circle cx="'+x(i)+'" cy="'+y(v)+'" r="3" fill="'+(v<0?'#FF6B70':'var(--rx-core)')+'"><title>'+esc((i?'Settimana '+i+': ':'Oggi: ')+eur(v))+'</title></circle>';if(i%3===0||i===vals.length-1)s+='<text x="'+x(i)+'" y="'+(H-4)+'" text-anchor="middle">'+(i?'S'+i:'oggi')+'</text>';});
 s+='<text x="'+(W-4)+'" y="12" text-anchor="end">'+esc('fra 13 settimane: '+eur0(vals[vals.length-1]))+'</text></svg>';return s;
}

// ---------- invoices ----------
function fatture(d,c){
 const f=S.ui.docFilter,list=d.documents.filter(x=>x.status===f);
 const drop='<label class="acc-drop" id="accDrop"><input type="file" id="accXml" accept=".xml,.p7m,text/xml,application/xml,application/pkcs7-mime" multiple'+(canWrite()?'':' disabled')+'><b>Trascina qui le fatture elettroniche XML</b><span>oppure clicca per sceglierle. Fatture di acquisto e di vendita: RADIX riconosce il verso dalla partita IVA dell\'azienda. Vanno bene anche i file firmati .p7m.</span></label>';
 const seg='<div class="acc-seg" role="group" aria-label="Filtro fatture">'+[['to_review','Da registrare'],['registered','Registrate'],['ignored','Ignorate']].map(([k,l])=>'<button type="button" data-act="docfilter" data-v="'+k+'" aria-pressed="'+(f===k)+'">'+l+'</button>').join('')+'</div>';
 const rows=list.map(x=>'<tr class="click'+(S.ui.doc===x.id?' sel':'')+'" data-act="opendoc" data-id="'+esc(x.id)+'"><td>'+dateIt(x.date)+'</td><td>'+esc(x.number)+'</td><td>'+(x.direction==='purchase'?'Acquisto':'Vendita')+(['TD04','TD08'].includes(x.doc_type)?' · nota di credito':'')+'</td><td>'+esc(x.counterpart_name||'')+'</td><td class="num">'+eur(x.total_cents)+'</td><td>'+(x.status==='to_review'?'<span class="acc-chip '+(x.proposal&&x.proposal.confidence==='alta'?'ok':x.proposal&&x.proposal.confidence==='bassa'?'err':'warn')+'">proposta '+esc(x.proposal?x.proposal.confidence:'')+'</span>':x.status==='registered'?'<span class="acc-chip ok">registrata</span>':'<span class="acc-chip">ignorata</span>')+'</td></tr>').join('');
 const table=list.length?'<div class="acc-tablewrap"><table><thead><tr><th>Data</th><th>Numero</th><th>Tipo</th><th>Controparte</th><th class="num">Totale</th><th>Stato</th></tr></thead><tbody>'+rows+'</tbody></table></div>':empty(f==='to_review'?'Nessuna fattura da registrare. Carica i file XML dal cassetto fiscale o dal tuo programma di fatturazione.':'Nessuna fattura in questo elenco.');
 const doc=d.documents.find(x=>x.id===S.ui.doc&&x.status==='to_review');
 return '<div class="acc-grid rev"><div>'+panel('Importa fatture',drop)+panel('Fatture',table,seg)+'</div><div>'+(doc?review(doc):panel('Proposta di registrazione',empty('Seleziona una fattura da registrare per vedere la scrittura proposta.')))+'</div></div>';
}
function review(doc){
 const inv=doc.parsed&&doc.parsed.documents[0],party=doc.direction==='purchase'?doc.parsed.supplier:doc.parsed.customer;
 let p=doc.proposal;
 if(inv&&S.ui.pct!==100&&doc.direction==='purchase')p=POST.propose(inv,party,{direction:'purchase',accounts:S.data.accounts,deductiblePct:S.ui.pct});
 const ed=S.ui.docLines&&S.ui.docLines.id===doc.id&&S.ui.docLines.pct===S.ui.pct?S.ui.docLines.lines:p.entry.lines.map(l=>({...l}));
 S.ui.docLines={id:doc.id,pct:S.ui.pct,lines:ed};
 const kind=doc.direction==='purchase'?'C':'R';
 const lines=ed.map((l,i)=>{const a=S.calc.idx.get(l.account),free=a&&a.kind===kind;
  return '<tr><td>'+(free?'<select data-docline="'+i+'" data-f="account" aria-label="Conto">'+accOptions(l.account,x=>x.kind===kind)+'</select><div class="acc-row acc-tags"><input data-docline="'+i+'" data-f="project" value="'+esc(l.project||'')+'" placeholder="Progetto" aria-label="Progetto" maxlength="80"><input data-docline="'+i+'" data-f="cost_center" value="'+esc(l.cost_center||'')+'" placeholder="Centro di costo" aria-label="Centro di costo" maxlength="80"></div>':esc(l.account+' · '+accName(l.account)))+(l.description?'<div class="acc-subtle">'+esc(l.description)+'</div>':'')+'</td><td class="num">'+(l.debit_cents?eur(l.debit_cents):'')+'</td><td class="num">'+(l.credit_cents?eur(l.credit_cents):'')+'</td></tr>';}).join('');
 const invLines=(inv&&inv.lines||[]).slice(0,30).map(l=>'<tr><td>'+esc(l.description)+'</td><td class="num">'+eur(l.total_cents)+'</td><td class="num">'+(l.nature?esc(l.nature):l.vatRate+'%')+'</td></tr>').join('');
 const items=p.open_items.map(i=>'<li>'+eur(i.amount_cents)+' entro il '+dateIt(i.due)+(i.iban?' · IBAN '+esc(i.iban):'')+'</li>').join('');
 return '<div class="acc-panel"><div class="acc-panel-head"><h2>'+esc((doc.direction==='purchase'?'Acquisto da ':'Vendita a ')+(doc.counterpart_name||''))+'</h2><span class="acc-chip">'+esc(doc.doc_type)+' n. '+esc(doc.number)+' del '+dateIt(doc.date)+'</span></div>'+
  (invLines?'<details><summary class="acc-muted">Righe della fattura</summary><div class="acc-tablewrap"><table><tbody>'+invLines+'</tbody></table></div></details>':'')+
  (doc.direction==='purchase'?'<div class="acc-row" style="margin:12px 0"><label>IVA detraibile<select data-act="pct" aria-label="IVA detraibile">'+[100,50,40,0].map(v=>'<option value="'+v+'"'+(v===S.ui.pct?' selected':'')+'>'+v+'%'+(v===40?' (auto aziendali)':v===0?' (indetraibile)':'')+'</option>').join('')+'</select></label></div>':'')+
  '<h3 style="margin-top:14px">Scrittura proposta</h3><div class="acc-tablewrap"><table class="acc-lines"><thead><tr><th>Conto</th><th class="num">Dare</th><th class="num">Avere</th></tr></thead><tbody>'+lines+'</tbody></table></div>'+
  '<ul class="acc-reasons">'+p.reasons.map(r=>'<li>'+esc(r)+'</li>').join('')+'</ul>'+
  (items?'<h3 style="margin-top:12px">Scadenze</h3><ul class="acc-reasons">'+items+'</ul>':'')+
  '<div class="acc-actions"><button class="acc-btn" type="button" data-act="confirmdoc" data-id="'+esc(doc.id)+'"'+dis(canWrite())+'>Conferma e registra</button><button class="acc-btn ghost" type="button" data-act="ignoredoc" data-id="'+esc(doc.id)+'"'+dis(canWrite())+'>Ignora (non è di competenza)</button></div>'+
  '<p class="acc-subtle">Puoi cambiare solo i conti di costo o ricavo: IVA, cliente/fornitore e ritenute restano quelli della fattura. RADIX ricorda il conto scelto per questa controparte.</p></div>';
}
async function importXml(files){
 let ok=0,dup=0;const errs=[];
 for(const f of files){if(f.size>2400000){errs.push(f.name+': file troppo grande');continue;}
  try{const xml=/\.p7m$/i.test(f.name)?P7M.extract(new Uint8Array(await f.arrayBuffer())).xml:await f.text();
   const r=await S.store.command('document.import',{xml,file_name:f.name.replace(/\.p7m$/i,'').slice(0,200)});for(const x of r.documents)x.duplicate?dup++:ok++;}catch(e){errs.push(f.name+': '+e.message);}}
 await reload();
 flash([ok?ok+' fatture importate':'',dup?dup+' già presenti':'',errs.length?errs.join(' · '):''].filter(Boolean).join(' · ')||'Nessuna fattura importata.',errs.length&&!ok?'error':'ok');
}

// ---------- journal ----------
function primaNota(d,c){
 const ed=S.ui.editor;
 const q=S.ui.journalFilter.toLowerCase();
 const list=d.entries.filter(e=>e.date>=S.year+'-01-01'&&(!q||(e.description+' '+(e.number||'')).toLowerCase().includes(q))).slice().reverse();
 const rows=list.slice(0,300).map(e=>{const tot=e.lines.reduce((t,l)=>t+l.debit_cents,0);
  return '<tr><td>'+dateIt(e.date)+'</td><td>'+esc(e.number||'bozza')+'</td><td>'+esc(e.description)+'<div class="acc-subtle">'+e.lines.map(l=>esc(l.account+' '+accName(l.account))+(l.debit_cents?' D ':' A ')+eur(l.debit_cents||l.credit_cents)).join(' · ')+'</div></td><td class="num">'+eur(tot)+'</td><td>'+(e.status==='draft'?'<button class="acc-btn small ghost" type="button" data-act="editentry" data-id="'+esc(e.id)+'"'+dis(canWrite())+'>Modifica</button>':e.source&&e.source.type==='accrual_reversal'?'<span class="acc-chip">riapertura</span>':e.reverses?'<span class="acc-chip">storno</span>':d.entries.some(x=>x.reverses===e.id&&!(x.source&&x.source.type==='accrual_reversal'))?'<span class="acc-chip">stornata</span>':'<button class="acc-btn small ghost" type="button" data-act="reverse" data-id="'+esc(e.id)+'"'+dis(canWrite())+'>Storna</button>')+'</td></tr>';}).join('');
 return (ed?editor(ed):'<div class="acc-actions" style="margin:0 0 14px"><button class="acc-btn" type="button" data-act="newentry"'+dis(canWrite())+'>+ Nuova registrazione</button></div>')+
  panel('Libro giornale '+S.year,(list.length?'<div class="acc-tablewrap"><table><thead><tr><th>Data</th><th>Protocollo</th><th>Descrizione e righe</th><th class="num">Importo</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>'+(list.length>300?'<p class="acc-subtle">Mostrate le ultime 300 registrazioni: usa la ricerca per trovarne altre.</p>':''):empty('Nessuna registrazione nel '+S.year+'.')),'<input type="search" data-act="jfilter" value="'+esc(S.ui.journalFilter)+'" placeholder="Cerca descrizione o protocollo" aria-label="Cerca nel giornale">');
}
function editor(ed){
 const rows=ed.lines.map((l,i)=>'<tr><td><select data-line="'+i+'" data-f="account" aria-label="Conto"><option value="">Scegli il conto…</option>'+accOptions(l.account)+'</select></td><td class="num"><input data-line="'+i+'" data-f="debit" value="'+esc(l.debit)+'" inputmode="decimal" placeholder="0,00" aria-label="Dare"></td><td class="num"><input data-line="'+i+'" data-f="credit" value="'+esc(l.credit)+'" inputmode="decimal" placeholder="0,00" aria-label="Avere"></td><td><input data-line="'+i+'" data-f="project" value="'+esc(l.project||'')+'" maxlength="80" aria-label="Progetto"></td><td><input data-line="'+i+'" data-f="cost_center" value="'+esc(l.cost_center||'')+'" maxlength="80" aria-label="Centro di costo"></td><td><button class="acc-btn small ghost" type="button" data-act="delline" data-i="'+i+'" aria-label="Togli riga"'+(ed.lines.length<=2?' disabled':'')+'>×</button></td></tr>').join('');
 return '<div class="acc-panel"><div class="acc-panel-head"><h2>'+(ed.id?'Modifica bozza':'Nuova registrazione')+'</h2><span class="acc-balance" id="accBalance"></span></div>'+
  '<div class="acc-row"><label style="flex:0 0 170px">Data<input type="date" id="edDate" value="'+esc(ed.date)+'"></label><label style="flex:1 1 320px">Descrizione<input id="edDesc" value="'+esc(ed.description)+'" maxlength="300" placeholder="Es. Pagamento affitto ottobre"></label></div>'+
  '<div class="acc-tablewrap" style="margin-top:12px"><table class="acc-lines"><thead><tr><th>Conto</th><th class="num">Dare</th><th class="num">Avere</th><th>Progetto</th><th>Centro di costo</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
  '<div class="acc-actions"><button class="acc-btn ghost small" type="button" data-act="addline">+ Riga</button><span style="flex:1"></span><button class="acc-btn ghost" type="button" data-act="canceledit">Annulla</button>'+(ed.id?'<button class="acc-btn warn" type="button" data-act="deldraft">Elimina bozza</button>':'')+'<button class="acc-btn ghost" type="button" data-act="saveentry" data-post="0">Salva bozza</button><button class="acc-btn" type="button" data-act="saveentry" data-post="1">Registra</button></div>'+
  '<p class="acc-subtle">Una registrazione confermata riceve il numero di protocollo e non si modifica più: per correggerla si fa lo storno.</p></div>';
}
const cents=v=>{if(v===''||v==null)return 0;const c=BANK.parseAmount(String(v));return c==null?NaN:c;};
function updateBalance(){
 const ed=S.ui.editor;if(!ed)return;const el=$('accBalance');if(!el)return;
 const d=ed.lines.reduce((t,l)=>t+(cents(l.debit)||0),0),c=ed.lines.reduce((t,l)=>t+(cents(l.credit)||0),0);
 el.textContent='Dare '+eur(d)+' · Avere '+eur(c)+(d===c&&d>0?' · bilanciata':' · differenza '+eur(d-c));el.className='acc-balance '+(d===c&&d>0?'good':'bad');
}
function entryFromEditor(){
 const ed=S.ui.editor;ed.date=$('edDate').value;ed.description=$('edDesc').value;
 const lines=[];for(const l of ed.lines){if(!l.account&&!l.debit&&!l.credit)continue;const dr=cents(l.debit),cr=cents(l.credit);if(Number.isNaN(dr)||Number.isNaN(cr))throw new Error('Importo non leggibile: usa il formato 1.234,56');lines.push({account:l.account,debit_cents:dr,credit_cents:cr,...(l.project?{project:l.project}:{}),...(l.cost_center?{cost_center:l.cost_center}:{})});}
 const e={date:ed.date,description:ed.description,lines};const errs=LED.validateEntry(e,S.data.accounts);if(errs.length)throw new Error(errs.join(' '));return e;
}
const blankLine=()=>({account:'',debit:'',credit:'',project:'',cost_center:''});
const fmtIn=c=>c?(c/100).toFixed(2).replace('.',','):'';

// ---------- bank and open items ----------
function banca(d,c){
 const items=d.open_items;
 const sugg=c.sugg.map(s=>{const m=s.row;
  const opts=s.candidates.map(x=>'<option value="item:'+esc(x.item.id)+'"'+(s.match&&s.match.item.id===x.item.id?' selected':'')+'>'+esc((x.item.kind==='receivable'?'Incasso ':'Pagamento ')+(x.item.doc_number||'')+' · '+(x.item.counterpart||'')+' · '+eur(x.item.amount_cents-x.item.paid_cents)+' ('+x.score+'/100)')+'</option>').join('');
  const others=items.filter(i=>i.paid_cents!==i.amount_cents&&(m.amount_cents>0)===(i.kind==='receivable')&&!s.candidates.some(x=>x.item.id===i.id)&&Math.abs(m.amount_cents)<=Math.abs(i.amount_cents-i.paid_cents)).slice(0,40).map(i=>'<option value="item:'+esc(i.id)+'">'+esc((i.doc_number||'')+' · '+(i.counterpart||'')+' · '+eur(i.amount_cents-i.paid_cents))+'</option>').join('');
  return '<li class="acc-move"><div class="acc-move-head"><span>'+dateIt(m.date)+'</span><b>'+signed(m.amount_cents)+'</b></div><div>'+esc(m.description)+'</div>'+(s.match?'<div class="acc-subtle">Proposta: '+esc(s.match.reasons.join(', '))+'</div>':s.rule?'<div class="acc-subtle">Sembra: '+esc(s.rule.label)+'</div>':'<div class="acc-subtle">Nessuna proposta: scegli tu.</div>')+'<div class="acc-move-act"><select data-bank="'+esc(m.id)+'" aria-label="Abbina a"><option value="">Scegli la scadenza o il conto…</option>'+(opts?'<optgroup label="Scadenze suggerite">'+opts+'</optgroup>':'')+(others?'<optgroup label="Altre scadenze aperte">'+others+'</optgroup>':'')+'<optgroup label="Registra su un conto">'+S.data.accounts.filter(a=>a.active!==false&&a.group!=='liquidita').map(a=>'<option value="acc:'+esc(a.code)+'"'+(!s.match&&s.rule&&s.rule.account===a.code?' selected':'')+'>'+esc(a.code+' · '+a.name)+'</option>').join('')+'</optgroup></select><button class="acc-btn small" type="button" data-act="bankok" data-id="'+esc(m.id)+'"'+dis(canWrite())+'>Conferma</button><button class="acc-btn small ghost" type="button" data-act="bankno" data-id="'+esc(m.id)+'"'+dis(canWrite())+'>Ignora</button></div></li>';}).join('');
 const k=S.ui.itemKind,a=c.age[k];
 const open=items.filter(i=>i.kind===k&&i.paid_cents!==i.amount_cents);
 const ageRow=(l,v)=>'<tr><td>'+l+'</td><td class="num">'+eur(v)+'</td></tr>';
 return panel('Movimenti da riconciliare',c.sugg.length?'<ul class="acc-moves">'+sugg+'</ul><p class="acc-subtle">RADIX propone la scadenza con importo, numero fattura e nome più simili. Confermando registra l\'incasso o il pagamento in prima nota.</p>':empty('Nessun movimento da riconciliare. Carica l\'estratto conto qui sotto.'))+'<div class="acc-grid two" style="margin-top:16px"><div>'+panel('Importa estratto conto','<label class="acc-drop"><input type="file" id="accCsv" accept=".csv,text/csv,.txt,.xml,text/xml,application/xml"'+(canWrite()?'':' disabled')+'><b>Carica l\'estratto conto (CSV o CAMT XML)</b><span>Esportalo dall\'home banking: dal CSV RADIX riconosce data, descrizione e importo (anche dare/avere separati); il formato bancario CAMT.053 si legge così com\'è. I movimenti già caricati vengono saltati.</span></label>')+'</div><div>'+
  panel('Scadenzario',('<div class="acc-tablewrap"><table><tbody>'+ageRow('Non ancora scaduti',a.not_due)+ageRow('Scaduti da 1 a 30 giorni',a.d0_30)+ageRow('Da 31 a 60 giorni',a.d31_60)+ageRow('Da 61 a 90 giorni',a.d61_90)+ageRow('Oltre 90 giorni',a.over_90)+'<tr class="total"><td>Totale aperto</td><td class="num">'+eur(a.total)+'</td></tr></tbody></table></div>')+
   (open.length?'<h3 style="margin-top:14px">Partite aperte</h3><div class="acc-tablewrap"><table><thead><tr><th>Scadenza</th><th>Controparte</th><th>Fattura</th><th class="num">Residuo</th></tr></thead><tbody>'+open.slice(0,200).map(i=>{const late=MGMT.days(i.due,today);return '<tr><td>'+dateIt(i.due)+(late>0?' <span class="acc-chip err">'+late+' gg</span>':'')+'</td><td>'+esc(i.counterpart||'')+'</td><td>'+esc(i.doc_number||'')+'</td><td class="num">'+eur(i.amount_cents-i.paid_cents)+'</td></tr>';}).join('')+'</tbody></table></div>':empty('Nessuna partita aperta.')),
   '<div class="acc-seg" role="group" aria-label="Crediti o debiti">'+[['receivable','Crediti'],['payable','Debiti']].map(([v,l])=>'<button type="button" data-act="itemkind" data-v="'+v+'" aria-pressed="'+(k===v)+'">'+l+'</button>').join('')+'</div>')+'</div></div>';
}

// ---------- VAT ----------
function iva(d,c){
 const sel=S.ui.ivaPeriod||(c.next?c.next.period.key:c.vat[0].period.key);const v=c.vat.find(x=>x.period.key===sel)||c.vat[0];
 const rows=c.vat.map(x=>'<tr class="click'+(x.period.key===v.period.key?' sel':'')+'" data-act="ivaperiod" data-v="'+x.period.key+'"><td>'+esc(x.period.label)+'</td><td class="num">'+eur(x.vp4_cents)+'</td><td class="num">'+eur(x.vp5_cents)+'</td><td class="num">'+signed(x.vp14_cents)+'</td><td class="num">'+(x.payable_cents?eur(x.payable_cents):'—')+'</td><td>'+(x.payable_cents?dateIt(x.due)+' · '+x.f24_code:'')+'</td><td>'+(x.closed?'<span class="acc-chip ok">chiusa</span>':x.canClose?'<button class="acc-btn small" type="button" data-act="vatclose" data-v="'+x.period.key+'"'+dis(canManage())+'>Chiudi</button>':x.period.from>today?'<span class="acc-chip">futura</span>':'<span class="acc-chip warn">in corso</span>')+'</td></tr>').join('');
 const reg=VAT.registers(d.vat_rows,{from:v.period.from,to:v.period.to});
 const regTable=(title,list)=>'<h3 style="margin-top:12px">'+title+'</h3>'+(list.length?'<div class="acc-tablewrap"><table><thead><tr><th>Aliquota</th><th class="num">Documenti</th><th class="num">Imponibile</th><th class="num">IVA</th>'+(title.includes('acquisti')?'<th class="num">Detraibile</th>':'')+'</tr></thead><tbody>'+list.map(r=>'<tr><td>'+(r.nature?esc(r.nature):r.rate+'%')+'</td><td class="num">'+r.count+'</td><td class="num">'+eur(r.taxable_cents)+'</td><td class="num">'+eur(r.vat_cents)+'</td>'+(title.includes('acquisti')?'<td class="num">'+eur(r.deductible_vat_cents)+'</td>':'')+'</tr>').join('')+'</tbody></table></div>':'<p class="acc-subtle">Nessuna operazione.</p>');
 const vp=[['VP2','Totale operazioni attive (imponibile)',v.vp2_cents],['VP3','Totale operazioni passive (imponibile)',v.vp3_cents],['VP4','IVA esigibile',v.vp4_cents],['VP5','IVA detratta',v.vp5_cents],['VP6','IVA dovuta o a credito',v.vp6_cents],['VP7','Debito periodo precedente sotto soglia',v.vp7_cents],['VP8','Credito periodo precedente',v.vp8_cents],['VP9','Credito anno precedente',v.vp9_cents],['VP12','Interessi trimestrali (1%)',v.vp12_cents],['VP13','Acconto versato',v.vp13_cents],['VP14','IVA da versare (+) o a credito (−)',v.vp14_cents]];
 return panel('Liquidazioni IVA '+S.year+' · '+(d.company.vat_periodicity==='monthly'?'mensili':'trimestrali'),'<div class="acc-tablewrap"><table><thead><tr><th>Periodo</th><th class="num">IVA vendite</th><th class="num">IVA acquisti</th><th class="num">Saldo</th><th class="num">Da versare</th><th>Scadenza · F24</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div><p class="acc-subtle">Le liquidazioni si chiudono in ordine. Chiudendo, RADIX registra il giroconto su Erario c/IVA e riporta crediti o debiti sotto 25,82 € al periodo successivo. Il versamento con F24 e la comunicazione LIPE li invia il professionista.</p>')+'<div class="acc-grid half" style="margin-top:16px">'+
  panel('Prospetto '+v.period.label,'<div class="acc-tablewrap"><table><tbody>'+vp.map(r=>'<tr'+(r[0]==='VP14'?' class="total"':'')+'><td>'+r[0]+'</td><td>'+r[1]+'</td><td class="num">'+signed(r[2])+'</td></tr>').join('')+'</tbody></table></div><p class="acc-subtle">Stato: '+esc(v.status)+(v.closed?' · liquidazione chiusa':' · stima aggiornata con le fatture registrate')+'</p>')+panel('Registri IVA · '+v.period.label,regTable('Registro vendite',reg.vendite)+regTable('Registro acquisti',reg.acquisti),'<button class="acc-btn small ghost" type="button" data-act="exportvat" data-v="'+v.period.key+'">Esporta CSV</button>')+'</div>';
}

// ---------- reports ----------
function bilancio(d,c){
 const tb=LED.trialBalance(c.posted,d.accounts,{to:S.year+'-12-31'});
 const bs=LED.balanceSheet(c.posted,d.accounts,{to:S.year+'-12-31'});
 const side=(g,title,total)=>'<h3>'+title+'</h3><table><tbody>'+Object.values(g).map(x=>'<tr><td>'+esc(x.label)+'</td><td class="num">'+eur(x.value_cents)+'</td></tr>').join('')+'<tr class="total"><td>Totale</td><td class="num">'+eur(total)+'</td></tr></tbody></table>';
 const led=S.ui.ledger?LED.accountLedger(c.posted,S.ui.ledger,{from:S.year+'-01-01',to:S.year+'-12-31'}):null;
 return '<div class="acc-grid half">'+panel('Conto economico riclassificato '+S.year,'<div class="acc-tablewrap"><table><thead><tr><th></th><th class="num">Importo</th><th class="num">% ricavi</th></tr></thead><tbody>'+c.is.rows.map(r=>'<tr class="'+(r.kind==='total'?'total':r.kind==='result'?'result':'')+'"><td>'+esc(r.label)+'</td><td class="num">'+signed(r.value_cents)+'</td><td class="num">'+(r.pct==null?'':r.pct.toLocaleString('it-IT')+'%')+'</td></tr>').join('')+'</tbody></table></div>')+
  panel('Stato patrimoniale al 31/12/'+S.year,'<div class="acc-grid half">'+'<div class="acc-tablewrap">'+side(bs.assets,'Attivo',bs.total_assets_cents)+'</div><div class="acc-tablewrap">'+side(bs.liabilities,'Passivo e patrimonio netto',bs.total_liabilities_cents)+'</div></div>'+(bs.balanced?'':'<p class="acc-banner error">Attivo e passivo non coincidono: verificare le registrazioni.</p>'))+'</div>'+
  panel('Bilancio di verifica','<div class="acc-tablewrap"><table><thead><tr><th>Conto</th><th class="num">Dare</th><th class="num">Avere</th><th class="num">Saldo</th></tr></thead><tbody>'+tb.rows.map(r=>'<tr class="click'+(S.ui.ledger===r.code?' sel':'')+'" data-act="ledger" data-v="'+esc(r.code)+'"><td>'+esc(r.code+' · '+r.name)+'</td><td class="num">'+eur(r.debit_cents)+'</td><td class="num">'+eur(r.credit_cents)+'</td><td class="num">'+signed(r.balance_cents)+'</td></tr>'+(S.ui.ledger===r.code&&led?'<tr><td colspan="4">'+ledgerTable(led)+'</td></tr>':'')).join('')+'<tr class="total"><td>Totali</td><td class="num">'+eur(tb.debit_cents)+'</td><td class="num">'+eur(tb.credit_cents)+'</td><td>'+(tb.balanced?'<span class="acc-chip ok">quadra</span>':'<span class="acc-chip err">non quadra</span>')+'</td></tr></tbody></table></div><p class="acc-subtle">Clicca un conto per vedere il mastrino dell\'esercizio.</p>','<span><button class="acc-btn small ghost" type="button" data-act="exporttb">Esporta bilancio CSV</button> <button class="acc-btn small ghost" type="button" data-act="exportjournal">Esporta giornale CSV</button></span>');
}
function ledgerTable(l){return '<div class="acc-tablewrap"><table><thead><tr><th>Data</th><th>Protocollo</th><th>Descrizione</th><th class="num">Dare</th><th class="num">Avere</th><th class="num">Saldo</th></tr></thead><tbody><tr><td colspan="5">Saldo iniziale</td><td class="num">'+eur(l.opening_cents)+'</td></tr>'+l.rows.map(r=>'<tr><td>'+dateIt(r.date)+'</td><td>'+esc(r.number||'')+'</td><td>'+esc(r.description)+'</td><td class="num">'+(r.debit_cents?eur(r.debit_cents):'')+'</td><td class="num">'+(r.credit_cents?eur(r.credit_cents):'')+'</td><td class="num">'+eur(r.balance_cents)+'</td></tr>').join('')+'</tbody></table></div>';}

// ---------- management control ----------
const BKEYS=[['ricavi','Ricavi'],['acquisti','Acquisti'],['servizi','Servizi'],['godimento','Godimento beni di terzi'],['oneri_diversi','Oneri diversi'],['personale','Personale'],['ebitda','Margine operativo lordo']];
function gestione(d,c){
 const months=y=>y===+today.slice(0,4)?+today.slice(5,7):12;
 const until=months(S.year);
 const budget=d.budget||[];
 const bva=MGMT.budgetVsActual(c.posted,d.accounts,budget.concat(budget.some(b=>b.key==='ebitda')?[]:derivedEbitda(budget)),{year:S.year,months:until});
 const mon=MGMT.monthly(c.posted,d.accounts,S.year);
 const dim=MGMT.byDimension(c.posted,d.accounts,S.ui.dimension,{from:S.year+'-01-01',to:S.year+'-12-31'});
 const lbl=Object.fromEntries(BKEYS);
 const bvaRows=bva.length?'<div class="acc-tablewrap"><table><thead><tr><th>Voce</th><th class="num">Budget</th><th class="num">Consuntivo</th><th class="num">Scostamento</th><th></th></tr></thead><tbody>'+BKEYS.map(([k])=>bva.find(x=>x.key===k)).filter(Boolean).map(r=>'<tr'+(r.key==='ebitda'?' class="total"':'')+'><td>'+esc(lbl[r.key])+'</td><td class="num">'+eur(r.budget_cents)+'</td><td class="num">'+eur(r.actual_cents)+'</td><td class="num">'+signed(r.variance_cents)+(r.variance_pct==null?'':' ('+r.variance_pct.toLocaleString('it-IT')+'%)')+'</td><td><span class="acc-chip '+(r.favourable?'ok':'err')+'">'+(r.favourable?'meglio':'peggio')+'</span></td></tr>').join('')+'</tbody></table></div><p class="acc-subtle">Da gennaio a '+['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'][until-1]+' '+S.year+'. I costi sono negativi: uno scostamento positivo è a favore.</p>':empty('Nessun budget per il '+S.year+'. Impostalo qui sotto: bastano gli importi annuali.');
 const monRows=[['ricavi','Ricavi'],['valore_aggiunto','Valore aggiunto'],['personale','Personale'],['ebitda','Margine operativo lordo'],['utile','Risultato']].map(([k,l])=>'<tr'+(k==='ebitda'?' class="total"':'')+'><td>'+l+'</td>'+mon.map(m=>'<td class="num">'+signed(m.values[k])+'</td>').join('')+'<td class="num"><b>'+signed(mon.reduce((t,m)=>t+m.values[k],0))+'</b></td></tr>').join('');
 const annual=k=>budget.filter(b=>b.key===k).reduce((t,b)=>t+b.amount_cents,0);
 const editorRows=BKEYS.filter(([k])=>k!=='ebitda').map(([k,l])=>'<label>'+l+'<input data-budget="'+k+'" value="'+esc(fmtIn(Math.abs(annual(k))))+'" inputmode="decimal" placeholder="0,00" aria-label="Budget annuale '+esc(l)+'"></label>').join('');
 return '<div class="acc-grid kpi">'+kpi('Margine operativo lordo',eur0(c.kp.ebitda_cents),c.kp.ebitda_pct==null?'':c.kp.ebitda_pct.toLocaleString('it-IT')+'% dei ricavi')+kpi('Incasso medio clienti',c.kp.dso_days==null?'—':c.kp.dso_days+' giorni','DSO')+kpi('Pagamento medio fornitori',c.kp.dpo_days==null?'—':c.kp.dpo_days+' giorni','DPO')+kpi('Cassa minima prevista',eur0(c.fc.min_cents),'prossime 13 settimane')+'</div>'+
 '<div style="margin-top:16px">'+panel('Budget e consuntivo',bvaRows)+panel('Margini per '+(S.ui.dimension==='project'?'progetto':'centro di costo'),dim.length?'<div class="acc-tablewrap"><table><thead><tr><th></th><th class="num">Ricavi</th><th class="num">Costi</th><th class="num">Margine</th></tr></thead><tbody>'+dim.map(x=>'<tr><td>'+esc(x.key==='(non assegnato)'?'Non assegnati (costi generali)':x.key)+'</td><td class="num">'+eur(x.revenue_cents)+'</td><td class="num">'+eur(x.cost_cents)+'</td><td class="num">'+signed(x.margin_cents)+(x.margin_pct==null?'':' · '+x.margin_pct.toLocaleString('it-IT')+'%')+'</td></tr>').join('')+'</tbody></table></div><p class="acc-subtle">Progetti e centri si assegnano sulle righe di costo e ricavo quando registri una fattura o una scrittura.</p>':empty('Nessun ricavo o costo assegnato.'),'<div class="acc-seg" role="group" aria-label="Dimensione">'+[['project','Progetti'],['cost_center','Centri di costo']].map(([v,l])=>'<button type="button" data-act="dimension" data-v="'+v+'" aria-pressed="'+(S.ui.dimension===v)+'">'+l+'</button>').join('')+'</div>')+'</div>'+
 panel('Andamento mensile '+S.year,'<div class="acc-tablewrap"><table><thead><tr><th></th>'+['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'].map(m=>'<th class="num">'+m+'</th>').join('')+'<th class="num">Anno</th></tr></thead><tbody>'+monRows+'</tbody></table></div>')+
 panel('Cassa prevista',cashChart(c.fc,c.kp.cash_cents)+'<div class="acc-tablewrap"><table><thead><tr><th>Settimana</th><th class="num">Entrate</th><th class="num">Uscite</th><th class="num">Saldo</th></tr></thead><tbody>'+c.fc.weeks.map(w=>'<tr><td>'+dateIt(w.from)+' – '+dateIt(w.to)+'</td><td class="num">'+eur(w.inflow_cents)+'</td><td class="num">'+eur(w.outflow_cents)+'</td><td class="num">'+signed(w.closing_cents)+'</td></tr>').join('')+'</tbody></table></div>')+
 panel('Budget annuale '+S.year,'<div class="acc-row">'+editorRows+'</div><div class="acc-actions"><button class="acc-btn" type="button" data-act="savebudget"'+dis(canManage())+'>Salva budget</button></div><p class="acc-subtle">Importi annuali, ripartiti in parti uguali sui dodici mesi. Il margine operativo lordo di budget si ricava dalle altre voci.</p>');
}
function derivedEbitda(budget){const out=[];for(let m=1;m<=12;m++){const v=budget.filter(b=>b.month===m).reduce((t,b)=>t+b.amount_cents,0);if(budget.some(b=>b.month===m))out.push({key:'ebitda',month:m,amount_cents:v});}return out;}

// ---------- closings: month checklist, depreciation, accruals ----------
const MONTHS_IT=['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
function defaultMonth(){const y=+today.slice(0,4),m=+today.slice(5,7);return S.year<y?12:S.year>y?1:Math.max(1,m-1);}
function chiusure(d,c){
 const month=S.ui.closeMonth||defaultMonth(),mc=COP.monthClose(d,{year:S.year,month,today});
 const checklist='<ul class="acc-todo">'+mc.items.map(i=>'<li><span><span class="acc-dot '+(i.done?'ok':'warn')+'"></span>'+esc(i.label)+' <span class="acc-subtle">· '+esc(i.detail)+'</span></span>'+(i.done?'':'<a class="acc-btn small ghost" href="#'+i.tab+'">Apri</a>')+'</li>').join('')+'</ul>';
 const monthSel='<select data-act="closemonth" aria-label="Mese">'+MONTHS_IT.map((n,i)=>'<option value="'+(i+1)+'"'+(i+1===month?' selected':'')+'>'+n[0].toUpperCase()+n.slice(1)+' '+S.year+'</option>').join('')+'</select>';
 const dep=ASSETS.depreciation(d.entries,d.accounts,S.year,{rates:S.ui.rates});
 const reg=ASSETS.register(d.entries,d.accounts,{to:S.year+'-12-31'});
 const accs=[...new Set(reg.map(a=>a.account))];
 const rateInputs=accs.map(code=>{const r=Object.hasOwn(S.ui.rates,code)?S.ui.rates[code]:ASSETS.RATES[code];return '<label style="flex:0 0 170px">'+esc(accName(code))+' %<input data-rate="'+esc(code)+'" value="'+esc(r==null?'':String(r).replace('.',','))+'" inputmode="decimal" aria-label="Aliquota '+esc(accName(code))+'"></label>';}).join('');
 const depRows=dep.rows.map(r=>'<tr><td>'+dateIt(r.date)+'</td><td>'+esc(r.description)+'<div class="acc-subtle">'+esc(r.account+' '+r.account_name)+'</div></td><td class="num">'+eur(r.cost_cents)+'</td><td class="num">'+String(r.rate).replace('.',',')+'%</td><td class="num">'+eur(r.amount_cents)+'</td><td class="num">'+eur(r.residual_cents)+'</td></tr>').join('');
 const depDone=dep.existing.length>0;
 const depBody=reg.length?'<div class="acc-row">'+rateInputs+'</div><div class="acc-tablewrap" style="margin-top:12px"><table><thead><tr><th>Acquisto</th><th>Cespite</th><th class="num">Costo</th><th class="num">Aliquota</th><th class="num">Quota '+S.year+'</th><th class="num">Residuo</th></tr></thead><tbody>'+(depRows||'<tr><td colspan="6">Nessuna quota nel '+S.year+'.</td></tr>')+'<tr class="total"><td colspan="4">Totale ammortamenti '+S.year+'</td><td class="num">'+eur(dep.total_cents)+'</td><td></td></tr></tbody></table></div>'+
  (dep.missing.length?'<p class="acc-banner">'+dep.missing.length+' cespiti senza aliquota: indicala sopra.</p>':'')+
  '<div class="acc-actions">'+(depDone?'<span class="acc-chip ok">Ammortamenti '+S.year+' registrati</span>':'<button class="acc-btn" type="button" data-act="depreciate"'+(dep.total_cents?dis(canManage()):' disabled')+'>Registra ammortamenti al 31/12/'+S.year+'</button>')+'</div>'+
  '<p class="acc-subtle">I cespiti sono gli acquisti registrati sui conti di immobilizzazione. Aliquote indicative dei coefficienti ministeriali, metà nel primo anno; i beni fino a 516,46 € si ammortizzano nell\'anno. Il commercialista conferma le aliquote del tuo settore.</p>'
  :empty('Nessun cespite: quando registri una fattura di un bene durevole (computer, arredi, macchinari) scegli il conto di immobilizzazione al posto del costo.');
 const a=S.ui.accrual,k=ASSETS.KINDS[a.kind];
 const done=d.entries.filter(e=>e.source&&e.source.type==='accrual'&&e.date.startsWith(String(S.year)));
 const accForm='<div class="acc-row"><label>Tipo<select data-acc="kind">'+Object.entries(ASSETS.KINDS).map(([v,x])=>'<option value="'+v+'"'+(v===a.kind?' selected':'')+'>'+x.label+'</option>').join('')+'</select></label><label style="flex:1 1 240px">'+(k.side==='C'?'Conto di costo':'Conto di ricavo')+'<select data-acc="account"><option value="">Scegli…</option>'+accOptions(a.account,x=>x.kind===k.side)+'</select></label><label>Importo totale<input data-acc="amount" value="'+esc(a.amount)+'" inputmode="decimal" placeholder="0,00"></label></div>'+
  '<div class="acc-row" style="margin-top:10px"><label>Competenza dal<input type="date" data-acc="from" value="'+esc(a.from)+'"></label><label>al<input type="date" data-acc="to" value="'+esc(a.to)+'"></label><label style="flex:1 1 240px">Descrizione<input data-acc="description" value="'+esc(a.description)+'" maxlength="200" placeholder="Es. polizza RC 01/07–30/06"></label></div><div id="accPreview">'+accrualPreview()+'</div>'+
  '<div class="acc-actions"><button class="acc-btn" type="button" data-act="accrue"'+dis(canManage())+'>Registra al 31/12/'+S.year+'</button></div>'+
  '<p class="acc-subtle">'+esc({risconto_attivo:'Costo già registrato che vale in parte per l\'anno prossimo (affitti anticipati, assicurazioni, canoni annuali).',rateo_attivo:'Ricavo maturato quest\'anno che fatturerai l\'anno prossimo.',rateo_passivo:'Costo maturato quest\'anno che ti verrà fatturato l\'anno prossimo (utenze, interessi).',risconto_passivo:'Ricavo già fatturato che vale in parte per l\'anno prossimo (abbonamenti, canoni incassati in anticipo).'}[a.kind])+'</p>'+
  (done.length?'<h3 style="margin-top:14px">Registrati nel '+S.year+'</h3><ul class="acc-reasons">'+done.map(e=>'<li>'+esc(e.number||'')+' · '+esc(e.description)+' · '+eur(e.lines.reduce((t,l)=>t+l.debit_cents,0))+'</li>').join('')+'</ul>':'');
 return '<div class="acc-grid half">'+panel('Chiusura del mese',checklist+'<p class="acc-subtle">'+mc.done+' di '+mc.total+' controlli completati per '+MONTHS_IT[month-1]+' '+S.year+'.</p>',monthSel)+panel('Ratei e risconti',accForm)+'</div>'+panel('Cespiti e ammortamenti '+S.year,depBody);
}

function accrualPreview(){
 const a=S.ui.accrual,k=ASSETS.KINDS[a.kind];if(!(a.account&&a.amount&&a.from&&a.to))return '';
 try{const p=ASSETS.accrual({...a,amount_cents:cents(a.amount),closing:S.year+'-12-31'},S.data.accounts);return '<p class="acc-banner ok">'+esc(p.label)+' di '+eur(p.amount_cents)+': '+(k.future?p.days_after+' giorni su '+p.days_total+' sono del '+(S.year+1):p.days_before+' giorni su '+p.days_total+' sono del '+S.year)+'. Il 01/01/'+(S.year+1)+' RADIX registra la riapertura.</p>';}
 catch(e){return '<p class="acc-banner error">'+esc(e.message)+'</p>';}
}
// ---------- copilot ----------
const LEVEL={alta:['err','Alta'],media:['warn','Media'],bassa:['','Bassa']};
function md(t){return esc(t).split(/\n{2,}/).map(p=>{const lines=p.split('\n');const li=lines.every(l=>/^\s*([-*•]|\d+[.)])\s+/.test(l));const b=x=>x.replace(/\*\*(.+?)\*\*/g,'<b>$1</b>');return li?'<ul>'+lines.map(l=>'<li>'+b(l.replace(/^\s*([-*•]|\d+[.)])\s+/,''))+'</li>').join('')+'</ul>':'<p>'+b(lines.join('<br>'))+'</p>';}).join('');}
function copilota(d,c){
 const checks=c.checks.length?'<ul class="acc-checks">'+c.checks.map(x=>'<li><span class="acc-chip '+LEVEL[x.level][0]+'">'+LEVEL[x.level][1]+'</span><div><b>'+esc(x.title)+'</b><div class="acc-subtle">'+esc(x.detail)+'</div></div><a class="acc-btn small ghost" href="#'+x.tab+'">Apri</a></li>').join('')+'</ul>':empty('Nessuna anomalia trovata nei conti del '+S.year+'.');
 const chat=S.ui.chat.map(m=>'<div class="acc-msg '+m.role+'">'+(m.role==='assistant'?md(m.content):'<p>'+esc(m.content)+'</p>')+'</div>').join('')+(S.ui.asking?'<div class="acc-msg assistant"><p class="acc-muted">Sto leggendo i conti…</p></div>':'');
 const sugg=COP.SUGGESTED.map(q=>'<button class="acc-btn small ghost" type="button" data-act="askq" data-v="'+esc(q)+'"'+(S.ui.asking?' disabled':'')+'>'+esc(q)+'</button>').join('');
 return '<div class="acc-grid two">'+panel('Chiedi al copilota','<div class="acc-chat" id="accChat">'+(chat||'<p class="acc-muted">Fai una domanda sui conti di '+esc(d.company.name)+': risponde con i numeri di questa pagina.</p>')+'</div><div class="acc-suggest">'+sugg+'</div><form class="acc-ask" data-act="askform"><textarea id="accQ" rows="2" maxlength="1000" placeholder="Es. Perché il margine di settembre è sceso?" aria-label="Domanda al copilota"'+(S.ui.asking?' disabled':'')+'></textarea><button class="acc-btn" type="submit"'+(S.ui.asking?' disabled':'')+'>Chiedi</button></form><p class="acc-subtle">Il copilota legge solo i dati calcolati da RADIX su questa azienda e non modifica nulla. Le scelte fiscali vanno confermate con il commercialista.'+(S.ui.usage&&!S.demo?' Domande usate questo mese: '+S.ui.usage.used+' di '+S.ui.usage.limit+'.':'')+'</p>',S.ui.chat.length?'<button class="acc-btn small ghost" type="button" data-act="clearchat">Nuova conversazione</button>':'')+
  panel('Controlli automatici',checks+'<p class="acc-subtle">Controlli che RADIX ripete a ogni modifica: quadratura, saldi anomali, documenti e movimenti fermi, scadenze IVA, crediti scaduti, cassa, fatture doppie, ammortamenti.</p>')+'</div>';
}
async function ask(question){
 question=String(question||'').trim();if(!question||S.ui.asking)return;
 const history=S.ui.chat.slice(-6);S.ui.chat.push({role:'user',content:question});S.ui.asking=true;render();
 try{
  let r;
  if(S.demo){const ctx=COP.snapshot(S.data,{year:S.year,today});r=await liveStore().commandRaw({action:'copilot.ask',data:{question,history,context:ctx}});}
  else r=await S.store.command('copilot.ask',{question,history,year:S.year});
  S.ui.chat.push({role:'assistant',content:r.answer});if(r.limit)S.ui.usage={used:r.used,limit:r.limit};
 }catch(e){S.ui.chat.pop();flash(e.status===401?'Accedi a RADIX per usare il copilota.':e.message||'Il copilota non risponde.','error');if($('accQ'))$('accQ').value=question;}
 finally{S.ui.asking=false;if(S.tab==='copilota')render();const box=$('accChat');if(box)box.scrollTop=box.scrollHeight;}
}

// ---------- company settings ----------
function impostazioni(d){
 const co=d.company;
 const f=(id,label,val,extra)=>'<label>'+label+'<input id="'+id+'" value="'+esc(val||'')+'"'+(extra||'')+'></label>';
 const sel=(id,label,val,opts)=>'<label>'+label+'<select id="'+id+'">'+opts.map(([v,l])=>'<option value="'+v+'"'+(v===val?' selected':'')+'>'+l+'</option>').join('')+'</select></label>';
 const members=d.members.map(m=>'<tr><td>'+esc(m.name)+'</td><td>'+esc(m.email)+'</td><td>'+esc(ROLE[m.role]||m.role)+'</td><td>'+(['owner','admin'].includes(co.role)&&m.role!=='owner'?'<button class="acc-btn small ghost" type="button" data-act="rmmember" data-id="'+m.user_id+'">Rimuovi</button>':'')+'</td></tr>').join('');
 const accRows=d.accounts.map(a=>'<tr><td>'+esc(a.code)+'</td><td>'+esc(a.name)+'</td><td>'+esc(COA.KINDS[a.kind]||a.kind)+'</td><td>'+esc((COA.CE_GROUPS[a.group]||COA.SP_GROUPS[a.group]||a.group))+'</td><td>'+(a.system?'<span class="acc-chip">di sistema</span>':'')+'</td></tr>').join('');
 const groups=[...Object.entries(COA.CE_GROUPS),...Object.entries(COA.SP_GROUPS)];
 return '<div class="acc-grid half">'+panel('Anagrafica',
  '<div class="acc-row">'+f('coName','Ragione sociale',co.name,' maxlength="200"')+f('coVat','Partita IVA',co.vat,' maxlength="16"')+f('coCf','Codice fiscale',co.tax_code,' maxlength="16"')+'</div><div class="acc-row" style="margin-top:10px">'+
  sel('coForm','Forma giuridica',co.legal_form,[['srl','S.r.l.'],['srls','S.r.l.s.'],['spa','S.p.A.'],['snc','S.n.c.'],['sas','S.a.s.'],['ditta','Ditta individuale'],['professionista','Professionista'],['altro','Altro']])+
  sel('coRegime','Regime contabile',co.regime,[['ordinario','Ordinario'],['semplificato','Semplificato'],['forfettario','Forfettario']])+
  sel('coPer','Liquidazione IVA',co.vat_periodicity,[['quarterly','Trimestrale'],['monthly','Mensile']])+
  sel('coPlan','Piano del servizio',co.plan==='controllo'?'base':co.plan,PLAN_OPTS)+'</div>'+
  '<div class="acc-actions"><button class="acc-btn" type="button" data-act="savecompany"'+dis(canManage())+'>Salva anagrafica</button></div>'+
  '<h3 style="margin-top:18px">Chiusura del periodo</h3><div class="acc-row"><label style="flex:0 0 200px">Nessuna registrazione fino al<input type="date" id="coLock" value="'+esc(co.lock_date||'')+'"></label><button class="acc-btn ghost" type="button" data-act="savelock"'+dis(canManage())+'>Aggiorna blocco</button></div><p class="acc-subtle">Dopo l\'invio delle dichiarazioni il commercialista blocca il periodo: nessuno può più registrare o modificare scritture con data precedente.</p>')+
 panel('Persone con accesso',(members?'<div class="acc-tablewrap"><table><thead><tr><th>Nome</th><th>Email</th><th>Ruolo</th><th></th></tr></thead><tbody>'+members+'</tbody></table></div>':'')+
  '<div class="acc-row" style="margin-top:12px"><label>Email dell\'account RADIX<input id="mEmail" type="email" maxlength="254" placeholder="nome@azienda.it"></label>'+sel('mRole','Ruolo','accountant',[['accountant','Commercialista'],['member','Collaboratore'],['viewer','Sola lettura'],['admin','Amministratore']])+'<button class="acc-btn ghost" type="button" data-act="addmember"'+dis(['owner','admin'].includes(co.role)&&!S.demo)+'>Aggiungi</button></div><p class="acc-subtle">Il commercialista vede tutto, chiude le liquidazioni e blocca i periodi; il collaboratore registra; la sola lettura consulta.</p>')+'</div>'+
 panel('Piano dei conti','<details><summary class="acc-muted">'+d.accounts.length+' conti · aggiungi o rinomina</summary><div class="acc-row" style="margin:12px 0">'+f('aCode','Codice (es. 61.12)','',' maxlength="8"')+f('aName','Nome','',' maxlength="120"')+sel('aKind','Tipo','C',Object.entries(COA.KINDS))+sel('aGroup','Gruppo','servizi',groups)+'<button class="acc-btn ghost" type="button" data-act="saveaccount"'+dis(canManage())+'>Salva conto</button></div><div class="acc-tablewrap"><table><thead><tr><th>Codice</th><th>Nome</th><th>Tipo</th><th>Gruppo</th><th></th></tr></thead><tbody>'+accRows+'</tbody></table></div></details>')+
 panel('Attività recenti',d.audit.length?'<ul class="acc-reasons">'+d.audit.slice(0,20).map(a=>'<li>'+esc(new Date(a.at).toLocaleString('it-IT'))+' · '+esc(a.actor||'')+' · '+esc(AUDIT[a.action]||a.action)+'</li>').join('')+'</ul>':empty('Nessuna attività.'));
}
const AUDIT={'company.create':'ha creato l\'azienda','company.update':'ha aggiornato l\'anagrafica','member.add':'ha aggiunto una persona','member.remove':'ha rimosso una persona','account.save':'ha salvato un conto','entry.save':'ha salvato una registrazione','entry.post':'ha confermato una registrazione','entry.delete':'ha eliminato una bozza','entry.reverse':'ha stornato una registrazione','document.import':'ha importato fatture','document.confirm':'ha registrato una fattura','document.ignore':'ha ignorato una fattura','bank.import':'ha importato l\'estratto conto','bank.confirm':'ha riconciliato un movimento','bank.ignore':'ha ignorato un movimento','budget.save':'ha salvato il budget','vat.close':'ha chiuso una liquidazione IVA','closing.depreciation':'ha registrato gli ammortamenti','closing.accrual':'ha registrato un rateo o risconto'};

// ---------- onboarding ----------
function onboarding(reason){
 $('accSwitch').hidden=!S.companies.length;$('accTabs').hidden=true;
 view.innerHTML='<div class="acc-panel acc-onboard"><h2>Attiva la contabilità della tua azienda</h2><p class="acc-muted">Tenuta della contabilità e controllo di gestione a costo contenuto: l\'automazione fa il lavoro ripetitivo, tu e il commercialista verificate solo le eccezioni.</p>'+
  '<ol class="acc-steps"><li>Crea l\'azienda con partita IVA e regime</li><li>Carica le fatture XML: RADIX propone le scritture</li><li>Carica l\'estratto conto: RADIX abbina incassi e pagamenti</li><li>Guarda IVA, margini, budget e cassa sempre aggiornati</li></ol>'+
  (reason?'<p class="acc-banner">'+reason+'</p>':'')+
  '<div class="acc-row">'+'<label>Ragione sociale<input id="nName" maxlength="200" placeholder="Rossi Srl"></label><label>Partita IVA<input id="nVat" maxlength="16" placeholder="IT01234567890"></label><label>Codice fiscale (se diverso)<input id="nCf" maxlength="16"></label></div>'+
  '<div class="acc-row" style="margin-top:10px"><label>Regime<select id="nRegime"><option value="ordinario">Ordinario</option><option value="semplificato">Semplificato</option><option value="forfettario">Forfettario</option></select></label><label>Liquidazione IVA<select id="nPer"><option value="quarterly">Trimestrale</option><option value="monthly">Mensile</option></select></label><label>Piano<select id="nPlan">'+PLAN_OPTS.map(o=>'<option value="'+o[0]+'">'+esc(o[1])+'</option>').join('')+'</select></label></div>'+
  '<div class="acc-actions"><button class="acc-btn" type="button" data-act="createcompany"'+(S.store&&!S.demo&&S.live?'':' disabled')+'>Crea l\'azienda</button><button class="acc-btn ghost" type="button" data-act="startdemo">Prova con l\'azienda dimostrativa</button></div>'+
  '<h3 style="margin-top:20px">Piani del servizio</h3><div class="acc-plans">'+'<div class="acc-plan"><b>'+esc(PRICE.PLANS.base.label)+'</b><p class="acc-price">'+eur0(PRICE.PRICE_CENTS)+' al mese + IVA</p><p>'+esc(PRICE.PLANS.base.summary)+' Controllo di gestione incluso: budget, margini per progetto e centro di costo, cassa prevista.</p><p>Fino a '+PRICE.INCLUDED.invoices+' fatture al mese, '+PRICE.INCLUDED.bank_accounts+' conto bancario, '+PRICE.INCLUDED.copilot_questions+' domande al copilota, '+PRICE.INCLUDED.users+' utenti.</p></div>'+'<div class="acc-plan"><b>'+esc(PRICE.PLANS.professionista.label)+'</b><p class="acc-price">'+eur0(PRICE.PRICE_CENTS)+' al mese + onorario dello studio</p><p>'+esc(PRICE.PLANS.professionista.summary)+' Studio: '+esc(PRICE.PARTNER.name)+'.</p></div></div></div>';
}

// ---------- events ----------
function setTab(t){S.tab=TABS.includes(t)?t:'panoramica';if(S.data)render();}
window.addEventListener('hashchange',()=>{const t=location.hash.slice(1);if(TABS.includes(t))setTab(t);});
document.addEventListener('click',async ev=>{
 const el=ev.target.closest('[data-act]');if(!el||el.tagName==='SELECT'||el.type==='search')return;
 const a=el.dataset.act,idv=el.dataset.id,v=el.dataset.v,d=S.data;
 if(a==='docfilter'){S.ui.docFilter=v;S.ui.doc=null;render();}
 else if(a==='opendoc'){S.ui.doc=idv;S.ui.pct=100;S.ui.docLines=null;render();}
 else if(a==='confirmdoc'){const doc=d.documents.find(x=>x.id===idv);const lines=S.ui.docLines&&S.ui.docLines.id===idv?S.ui.docLines.lines.map(({account,debit_cents,credit_cents,cost_center,project,description})=>({account,debit_cents,credit_cents,...(cost_center?{cost_center}:{}),...(project?{project}:{}),...(description?{description}:{})})):undefined;
  const r=await run('document.confirm',{id:idv,version:doc.version,...(lines?{lines}:{}),...(S.ui.pct!==100?{deductible_pct:S.ui.pct}:{})},'Fattura '+doc.number+' registrata in prima nota.');if(r){S.ui.doc=(S.calc.toReview[0]||{}).id||null;S.ui.docLines=null;S.ui.pct=100;render();}}
 else if(a==='ignoredoc'){const doc=d.documents.find(x=>x.id===idv);if(confirm('Ignorare la fattura '+doc.number+'? Non verrà registrata.'))await run('document.ignore',{id:idv,version:doc.version},'Fattura ignorata.');}
 else if(a==='newentry'){S.ui.editor={date:today<S.year+'-12-31'&&today>=S.year+'-01-01'?today:S.year+'-12-31',description:'',lines:[blankLine(),blankLine()]};render();}
 else if(a==='editentry'){const e=d.entries.find(x=>x.id===idv);S.ui.editor={id:e.id,version:e.version,date:e.date,description:e.description,lines:e.lines.map(l=>({account:l.account,debit:fmtIn(l.debit_cents),credit:fmtIn(l.credit_cents),project:l.project||'',cost_center:l.cost_center||''}))};render();scrollTo({top:0,behavior:'smooth'});}
 else if(a==='addline'){syncEditorHead();S.ui.editor.lines.push(blankLine());render();}
 else if(a==='delline'){syncEditorHead();S.ui.editor.lines.splice(+el.dataset.i,1);render();}
 else if(a==='canceledit'){S.ui.editor=null;render();}
 else if(a==='deldraft'){const ed=S.ui.editor;if(confirm('Eliminare la bozza?')){const r=await run('entry.delete',{id:ed.id,version:ed.version},'Bozza eliminata.');if(r){S.ui.editor=null;render();}}}
 else if(a==='saveentry'){let e;try{e=entryFromEditor();}catch(x){flash(x.message,'error');return;}const ed=S.ui.editor,post=el.dataset.post==='1';
  const r=await run('entry.save',{...(ed.id?{id:ed.id,version:ed.version}:{}),...e,post},post?'Registrazione confermata.':'Bozza salvata.');if(r){S.ui.editor=null;render();}}
 else if(a==='reverse'){const e=d.entries.find(x=>x.id===idv);if(confirm('Stornare la registrazione '+e.number+'? Verrà creata una scrittura opposta con data di oggi.'))await run('entry.reverse',{id:idv},'Storno registrato.');}
 else if(a==='bankok'){const m=d.bank.find(x=>x.id===idv),sel=document.querySelector('select[data-bank="'+CSS.escape(idv)+'"]').value;if(!sel){flash('Scegli la scadenza o il conto da abbinare.','error');return;}
  await run('bank.confirm',{id:idv,version:m.version,...(sel.startsWith('item:')?{open_item_id:sel.slice(5)}:{account:sel.slice(4)})},'Movimento riconciliato e registrato.');}
 else if(a==='bankno'){const m=d.bank.find(x=>x.id===idv);await run('bank.ignore',{id:idv,version:m.version},'Movimento ignorato.');}
 else if(a==='itemkind'){S.ui.itemKind=v;render();}
 else if(a==='ivaperiod'){S.ui.ivaPeriod=v;render();}
 else if(a==='vatclose'){const x=S.calc.vat.find(p=>p.period.key===v);if(confirm('Chiudere la liquidazione '+x.period.label+'? '+(x.payable_cents?'IVA da versare: '+eur(x.payable_cents)+' entro il '+dateIt(x.due)+'.':'Esito: '+x.status+'.')+' La scrittura di giroconto verrà registrata.'))await run('vat.close',{period:v},'Liquidazione '+x.period.label+' chiusa.');}
 else if(a==='ledger'){S.ui.ledger=S.ui.ledger===v?null:v;render();}
 else if(a==='dimension'){S.ui.dimension=v;render();}
 else if(a==='savebudget'){const rows=[];for(const inp of document.querySelectorAll('[data-budget]')){const c=cents(inp.value.trim());if(Number.isNaN(c)){flash('Importo non leggibile: '+inp.value,'error');return;}if(!c)continue;const k=inp.dataset.budget,sign=k==='ricavi'?1:-1,tot=Math.abs(c),base=Math.trunc(tot/12);for(let m=1;m<=12;m++)rows.push({key:k,month:m,amount_cents:sign*(base+(m===12?tot-base*12:0))});}
  await run('budget.save',{year:S.year,rows},'Budget '+S.year+' salvato.');}
 else if(a==='savecompany'){const co=d.company;await run('company.update',{version:co.version,name:$('coName').value,vat:$('coVat').value||null,tax_code:$('coCf').value||null,legal_form:$('coForm').value,regime:$('coRegime').value,vat_periodicity:$('coPer').value,plan:$('coPlan').value},'Anagrafica aggiornata.');}
 else if(a==='savelock'){const co=d.company;await run('company.update',{version:co.version,lock_date:$('coLock').value||null},'Blocco del periodo aggiornato.');}
 else if(a==='addmember'){await run('member.add',{email:$('mEmail').value,role:$('mRole').value},'Persona aggiunta.');}
 else if(a==='rmmember'){if(confirm('Togliere l\'accesso a questa persona?'))await run('member.remove',{user_id:+idv},'Accesso rimosso.');}
 else if(a==='saveaccount'){await run('account.save',{code:$('aCode').value.trim(),name:$('aName').value,kind:$('aKind').value,group:$('aGroup').value},'Conto salvato.');}
 else if(a==='createcompany'){const r=await S.store.command('company.create',{name:$('nName').value,vat:$('nVat').value||null,tax_code:$('nCf').value||null,regime:$('nRegime').value,vat_periodicity:$('nPer').value,plan:$('nPlan').value}).catch(e=>{flash(e.message,'error');return null;});if(r){S.company=r.id;await loadCompanies();flash('Azienda creata: carica le prime fatture.','ok');location.hash='#fatture';}}
 else if(a==='startdemo'){await startDemo();}
 else if(a==='depreciate'){const dep=ASSETS.depreciation(d.entries,d.accounts,S.year,{rates:S.ui.rates});if(confirm('Registrare ammortamenti per '+eur(dep.total_cents)+' al 31/12/'+S.year+' su '+dep.rows.length+' cespiti?'))await run('closing.depreciation',{year:S.year,...(Object.keys(S.ui.rates).length?{rates:S.ui.rates}:{})},'Ammortamenti '+S.year+' registrati.');}
 else if(a==='accrue'){const x=S.ui.accrual,amount=cents(x.amount);if(!x.account||!amount||Number.isNaN(amount)||!x.from||!x.to){flash('Indica conto, importo e periodo di competenza.','error');return;}
  const r=await run('closing.accrual',{kind:x.kind,account:x.account,amount_cents:amount,from:x.from,to:x.to,closing:S.year+'-12-31',...(x.description.trim()?{description:x.description.trim()}:{})},r=>ASSETS.KINDS[x.kind].label+' di '+eur(r.amount_cents)+' registrato, con riapertura al 01/01/'+(S.year+1)+'.');if(r){S.ui.accrual={...S.ui.accrual,account:'',amount:'',from:'',to:'',description:''};render();}}
 else if(a==='askq'){await ask(v);}
 else if(a==='clearchat'){S.ui.chat=[];render();}
 else if(a==='exporttb'){const tb=LED.trialBalance(S.calc.posted,d.accounts,{to:S.year+'-12-31'});download('bilancio-verifica-'+S.year+'.csv',[['Conto','Nome','Dare','Avere','Saldo'],...tb.rows.map(r=>[r.code,r.name,cc(r.debit_cents),cc(r.credit_cents),cc(r.balance_cents)])]);}
 else if(a==='exportjournal'){download('libro-giornale-'+S.year+'.csv',[['Data','Protocollo','Descrizione','Conto','Nome conto','Dare','Avere','Progetto','Centro di costo'],...S.calc.posted.filter(e=>e.date.startsWith(String(S.year))).flatMap(e=>e.lines.map(l=>[e.date,e.number,e.description,l.account,accName(l.account),cc(l.debit_cents),cc(l.credit_cents),l.project||'',l.cost_center||'']))]);}
 else if(a==='exportvat'){const p=S.calc.vat.find(x=>x.period.key===v).period;download('registri-iva-'+v+'.csv',[['Registro','Data','Numero','Tipo','Controparte','Partita IVA','Aliquota','Natura','Imponibile','IVA','IVA detraibile','Esigibilità'],...d.vat_rows.filter(r=>r.date>=p.from&&r.date<=p.to).map(r=>[r.register,r.date,r.doc_number,r.doc_type,r.counterpart||'',r.counterpart_vat||'',r.rate,r.nature||'',cc(r.taxable_cents),cc(r.vat_cents),cc(r.deductible_vat_cents),r.exigibility])]);}
});
const cc=c=>((c||0)/100).toFixed(2).replace('.',',');
function download(name,rows){const csv='﻿'+rows.map(r=>r.map(x=>{const s=String(x??'');return /[;"\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}).join(';')).join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);}
function syncEditorHead(){const ed=S.ui.editor;if(!ed)return;if($('edDate'))ed.date=$('edDate').value;if($('edDesc'))ed.description=$('edDesc').value;}
document.addEventListener('submit',ev=>{const f=ev.target.closest('[data-act=askform]');if(!f)return;ev.preventDefault();ask($('accQ').value);});
document.addEventListener('keydown',ev=>{if(ev.target.id==='accQ'&&ev.key==='Enter'&&!ev.shiftKey){ev.preventDefault();ask(ev.target.value);}});
document.addEventListener('input',ev=>{
 const t=ev.target;
 if(t.dataset.line!==undefined&&S.ui.editor){S.ui.editor.lines[+t.dataset.line][t.dataset.f]=t.value;updateBalance();}
 else if(t.dataset.docline!==undefined&&S.ui.docLines){S.ui.docLines.lines[+t.dataset.docline][t.dataset.f]=t.value||null;}
 else if(t.dataset.acc!==undefined){S.ui.accrual[t.dataset.acc]=t.value;if($('accPreview'))$('accPreview').innerHTML=accrualPreview();}
 else if(t.dataset.act==='jfilter'){S.ui.journalFilter=t.value;clearTimeout(S.jt);S.jt=setTimeout(()=>{render();const s=document.querySelector('[data-act=jfilter]');if(s){s.focus();s.setSelectionRange(s.value.length,s.value.length);}},250);}
});
document.addEventListener('change',async ev=>{
 const t=ev.target;
 if(t.dataset.line!==undefined&&S.ui.editor){S.ui.editor.lines[+t.dataset.line][t.dataset.f]=t.value;updateBalance();}
 else if(t.dataset.docline!==undefined&&S.ui.docLines){S.ui.docLines.lines[+t.dataset.docline][t.dataset.f]=t.value||null;}
 else if(t.dataset.act==='pct'){S.ui.pct=+t.value;S.ui.docLines=null;render();}
 else if(t.dataset.act==='closemonth'){S.ui.closeMonth=+t.value;render();}
 else if(t.dataset.rate!==undefined){const v=t.value.trim().replace(',','.');if(v===''){delete S.ui.rates[t.dataset.rate];}else if(+v>0&&+v<=100)S.ui.rates[t.dataset.rate]=Math.round(+v*100)/100;else{flash('Aliquota non valida: da 0,01 a 100.','error');return;}render();}
 else if(t.dataset.acc!==undefined){S.ui.accrual[t.dataset.acc]=t.value;if(t.dataset.acc==='kind'){S.ui.accrual.account='';render();}else if($('accPreview'))$('accPreview').innerHTML=accrualPreview();}
 else if(t.id==='accXml'&&t.files.length){await importXml([...t.files]);}
 else if(t.id==='accCsv'&&t.files.length){const f=t.files[0];if(f.size>2400000){flash('File troppo grande.','error');return;}const txt=await f.text(),isCamt=/\.xml$/i.test(f.name)||CAMT.isCamt(txt);await run('bank.import',isCamt?{camt:txt}:{csv:txt},r=>r.imported+' movimenti importati'+(r.duplicates?', '+r.duplicates+' già presenti':'')+(r.warnings.length?' · '+r.warnings.length+' righe scartate':''));}
 else if(t.id==='accCompany'){if(t.value==='__demo'){await startDemo();return;}S.company=t.value;S.ui.doc=null;S.ui.editor=null;await reload().catch(e=>flash(e.message,'error'));}
 else if(t.id==='accYear'){S.year=+t.value;S.ui.ivaPeriod=null;await reload().catch(e=>flash(e.message,'error'));}
});
// Drag and drop of XML files on the invoice drop zone.
document.addEventListener('dragover',ev=>{const z=ev.target.closest&&ev.target.closest('#accDrop');if(z){ev.preventDefault();z.classList.add('over');}});
document.addEventListener('dragleave',ev=>{const z=ev.target.closest&&ev.target.closest('#accDrop');if(z)z.classList.remove('over');});
document.addEventListener('drop',ev=>{const z=ev.target.closest&&ev.target.closest('#accDrop');if(!z)return;ev.preventDefault();z.classList.remove('over');if(!canWrite())return;const files=[...ev.dataTransfer.files].filter(f=>/\.(xml|p7m)$/i.test(f.name));if(files.length)importXml(files);else flash('Trascina file .xml o .p7m di fatture elettroniche.','error');});

// ---------- start ----------
function fillSwitch(){
 const sel=$('accCompany');sel.innerHTML=S.companies.map(c=>'<option value="'+esc(c.id)+'"'+(c.id===S.company?' selected':'')+'>'+esc(c.name)+'</option>').join('')+(S.demo?'':'<option value="__demo">Azienda dimostrativa…</option>');
 const ys=$('accYear'),now=+today.slice(0,4);ys.innerHTML=[now+1,now,now-1,now-2,now-3].map(y=>'<option'+(y===S.year?' selected':'')+'>'+y+'</option>').join('');
 $('accNewCompany').hidden=S.demo||!S.live;
}
$('accNewCompany').addEventListener('click',()=>{S.data=null;onboarding();});
async function loadCompanies(){
 S.companies=await S.store.companies();
 if(!S.companies.length){fillSwitch();onboarding();return;}
 if(!S.companies.some(c=>c.id===S.company))S.company=S.companies[0].id;
 fillSwitch();await reload();
}
async function startDemo(){
 S.demo=true;S.store=DEMO.createStore();banner('Preparo l\'azienda dimostrativa…','demo');
 await DEMO.seed(S.store,today);
 const b=await S.store.bundle(S.year);S.store.companies=async()=>[{id:b.company.id,name:b.company.name+' (demo)'}];S.company=b.company.id;
 await loadCompanies();banner(demoNote(),'demo');
}
async function start(){
 setTab(location.hash.slice(1));
 S.store=liveStore();
 try{await S.store.companies();S.live=true;}
 catch(e){
  if(e.status===401){S.live=false;banner('Per usare la contabilità della tua azienda <a href="/control-center-v2.html">accedi a RADIX</a>. Intanto puoi provare l\'azienda dimostrativa.','');onboarding();return;}
  if(e.status===503){S.live=false;banner('L\'archivio contabile non è ancora attivo su questo ambiente: ti mostro l\'azienda dimostrativa.','demo');return startDemo();}
  S.live=false;banner(esc(e.message),'error');onboarding();return;
 }
 try{await loadCompanies();}catch(e){banner(esc(e.message),'error');}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
