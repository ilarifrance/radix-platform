/* RADIX Accounting — copilot: deterministic checks on a company's books (anomalies, month-end checklist) and the
   compact numeric snapshot the AI assistant answers from. The same code runs in the page and in the API, so the
   assistant only ever sees figures the engine computed. Pure functions. */
(function(root,factory){const r=typeof module==='object'&&module.exports?require:null;const api=factory(r?r('./chart-of-accounts'):root.RadixChartOfAccounts,r?r('./ledger'):root.RadixLedger,r?r('./management'):root.RadixManagement,r?r('./vat'):root.RadixVAT,r?r('./assets'):root.RadixAssets);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixCopilot=api})(typeof globalThis!=='undefined'?globalThis:this,function(coa,ledger,mgmt,vat,assets){
'use strict';
const days=mgmt.days,addDays=mgmt.addDays;
const euro=c=>Math.round(c||0)/100;
const fmt=ledger.fmt;
const pad=n=>String(n).padStart(2,'0');

// Figures shared by checks and snapshot, from the bundle the API returns (or the demo store).
function figures(b,{year,today}){
 const y=+year,from=y+'-01-01',to=y+'-12-31',acc=b.accounts,posted=(b.entries||[]).filter(e=>e.status==='posted');
 const cut=today<to?today:to,periodicity=b.company.vat_periodicity;
 const closed=new Map((b.settlements||[]).map(s=>[s.period,s]));let debit=0,credit=0;
 const vatPeriods=vat.periods(y,periodicity).map(p=>{const c=closed.get(p.key);const s=c?c.result:vat.settle(b.vat_rows||[],{periodicity,period:p.key,previousDebit_cents:debit,previousCredit_cents:credit});debit=s.carry_debit_cents;credit=s.carry_credit_cents;return {...s,period:p,closed:!!c};});
 const kp=mgmt.kpis(posted,acc,b.open_items,{from,to:cut});
 return {y,from,to,cut,acc,posted,periodicity,vatPeriods,kp,is:ledger.incomeStatement(posted,acc,{from,to:cut}),
  tb:ledger.trialBalance(posted,acc,{to:cut}),age:mgmt.ageing(b.open_items,today),fc:mgmt.cashForecast(b.open_items,{today,opening_cents:kp.cash_cents})};
}
/* Checks a bookkeeper would run. Each: {level:'alta'|'media'|'bassa', code, title, detail, tab}. tab = page section to open. */
function anomalies(b,{year,today}){
 const f=figures(b,{year,today}),out=[],idx=coa.index(f.acc),add=(level,code,title,detail,tab)=>out.push({level,code,title,detail,tab});
 if(!f.tb.balanced)add('alta','unbalanced','Il bilancio di verifica non quadra','Dare '+fmt(f.tb.debit_cents)+', avere '+fmt(f.tb.credit_cents)+'.','bilancio');
 const bal=ledger.balances(f.posted,{to:f.cut});
 for(const [code,v] of bal){const a=idx.get(code);if(!a)continue;const d=v.debit_cents-v.credit_cents;
  if(a.group==='liquidita'&&d<0)add('alta','negative_cash','Saldo negativo su '+a.name,'Il conto '+code+' è a '+fmt(d)+': manca un incasso o è registrato due volte un pagamento.','banca');
  if(code===coa.SYSTEM.customers&&d<0)add('media','customers_credit','Clienti con saldo in avere','Il conto clienti è a '+fmt(d)+': incassi senza fattura o note di credito non compensate.','banca');
  if(code===coa.SYSTEM.suppliers&&d>0)add('media','suppliers_debit','Fornitori con saldo in dare','Il conto fornitori è a +'+fmt(d)+': pagamenti senza la fattura registrata.','banca');
  if(a.kind==='R'&&d>0&&code!=='70.05')add('bassa','revenue_debit','Ricavo con saldo in dare: '+a.name,'Saldo '+fmt(d)+': controlla storni e note di credito.','bilancio');
 }
 const oldDocs=(b.documents||[]).filter(x=>x.status==='to_review'&&days(x.date,today)>15);
 if(oldDocs.length)add('media','docs_waiting',oldDocs.length+(oldDocs.length===1?' fattura aspetta':' fatture aspettano')+' da più di 15 giorni','Finché non le confermi mancano da IVA, scadenze e margini.','fatture');
 const oldBank=(b.bank||[]).filter(m=>m.status==='new'&&days(m.date,today)>30);
 if(oldBank.length)add('media','bank_waiting',oldBank.length+' movimenti bancari non riconciliati da più di 30 giorni','Il saldo contabile della banca non coincide con l\'estratto conto finché non li abbini.','banca');
 const drafts=(b.entries||[]).filter(e=>e.status==='draft'&&days(e.date,today)>30);
 if(drafts.length)add('bassa','old_drafts',drafts.length+' registrazioni in bozza da più di 30 giorni','Le bozze non entrano nei conti: registrale o eliminale.','prima-nota');
 for(const p of f.vatPeriods){if(p.closed||p.period.to>=today)continue;
  const late=p.due&&p.due<today,soon=p.due&&days(today,p.due)<=10;
  if(late)add('alta','vat_late','IVA '+p.period.label+' non chiusa e scaduta il '+p.due.split('-').reverse().join('/'),'Importo '+fmt(p.payable_cents)+' (codice '+p.f24_code+'): verifica il versamento, eventualmente con ravvedimento.','iva');
  else if(soon)add('media','vat_due','IVA '+p.period.label+' da versare entro il '+p.due.split('-').reverse().join('/'),fmt(p.payable_cents)+' con F24 codice '+p.f24_code+'.','iva');
  else if(!p.due)add('bassa','vat_open','Liquidazione '+p.period.label+' da chiudere','Risultato: '+p.status+'.','iva');
 }
 const late60=f.age.overdue.filter(i=>i.kind==='receivable'&&i.days_late>60);
 if(late60.length)add('media','receivables_late',late60.length+' crediti scaduti da oltre 60 giorni','Totale '+fmt(late60.reduce((t,i)=>t+i.open_cents,0))+': '+late60.slice(0,3).map(i=>(i.counterpart||'')+' '+fmt(i.open_cents)).join(', ')+'.','banca');
 if(f.fc.first_negative)add('alta','cash_negative','Cassa prevista negativa nella settimana del '+f.fc.first_negative.from.split('-').reverse().join('/'),'Saldo previsto '+fmt(f.fc.first_negative.closing_cents)+': anticipa incassi o sposta pagamenti.','gestione');
 // Same supplier, same total, within 10 days, different numbers: probably the same invoice twice.
 const purch=(b.documents||[]).filter(x=>x.direction==='purchase'&&x.status!=='ignored').sort((a,c)=>a.date.localeCompare(c.date));
 for(let i=0;i<purch.length;i++)for(let j=i+1;j<purch.length&&days(purch[i].date,purch[j].date)<=10;j++){const a=purch[i],c=purch[j];
  if(a.total_cents===c.total_cents&&a.number!==c.number&&(a.counterpart_vat||a.counterpart_name)===(c.counterpart_vat||c.counterpart_name))add('media','duplicate_invoice','Possibile fattura doppia da '+(a.counterpart_name||'fornitore'),'N. '+a.number+' e n. '+c.number+', stesso importo '+fmt(a.total_cents)+'.','fatture');}
 if(['controllo','professionista'].includes(b.company.plan)){let tot=0,none=0;
  for(const e of f.posted)if(e.date>=f.from&&e.date<=f.cut)for(const l of e.lines){const a=idx.get(l.account);if(a&&a.kind==='C'&&l.debit_cents){tot+=l.debit_cents;if(!l.project&&!l.cost_center)none+=l.debit_cents;}}
  if(tot&&none*100/tot>30)add('bassa','unassigned_costs',Math.round(none*100/tot)+'% dei costi senza progetto né centro di costo','I margini per progetto restano parziali: assegnali in prima nota.','gestione');}
 const yearEnd=f.y<+today.slice(0,4)||today.slice(5)>='12-15';
 if(yearEnd){const dep=assets.depreciation(b.entries||[],f.acc,f.y);
  if(dep.total_cents&&!dep.existing.length)add('media','depreciation_missing','Ammortamenti '+f.y+' da registrare','Quota calcolata '+fmt(dep.total_cents)+' su '+dep.rows.length+' cespiti.','chiusure');}
 const rank={alta:0,media:1,bassa:2};
 return out.sort((a,c)=>rank[a.level]-rank[c.level]);
}
// Month-end checklist (chiusura del mese) for month 1-12 of `year`.
function monthClose(b,{year,month,today}){
 const y=+year,m=+month,from=y+'-'+pad(m)+'-01',to=y+'-'+pad(m)+'-'+pad(new Date(Date.UTC(y,m,0)).getUTCDate());
 const inMonth=d=>d>=from&&d<=to,items=[],add=(key,label,done,detail,tab)=>items.push({key,label,done,detail,tab});
 const docs=(b.documents||[]).filter(x=>x.status==='to_review'&&inMonth(x.date));
 add('documents','Fatture del mese registrate',!docs.length,docs.length?docs.length+' da confermare':'Tutte confermate','fatture');
 const bank=(b.bank||[]).filter(x=>x.status==='new'&&x.date<=to);
 add('bank','Banca riconciliata fino a fine mese',!bank.length,bank.length?bank.length+' movimenti da abbinare':'Nessun movimento in sospeso','banca');
 const drafts=(b.entries||[]).filter(e=>e.status==='draft'&&inMonth(e.date));
 add('drafts','Nessuna bozza nel mese',!drafts.length,drafts.length?drafts.length+' bozze':'—','prima-nota');
 const p=vat.periods(y,b.company.vat_periodicity).find(x=>x.to===to);
 if(p){const done=(b.settlements||[]).some(s=>s.period===p.key);add('vat','Liquidazione IVA '+p.label,done,done?'Chiusa':'Da chiudere, versamento entro il '+p.due.split('-').reverse().join('/'),'iva');}
 if(m===12){const dep=assets.depreciation(b.entries||[],b.accounts,y);add('depreciation','Ammortamenti dell\'esercizio',!dep.total_cents||dep.existing.length>0,dep.existing.length?'Registrati':dep.total_cents?'Da registrare: '+fmt(dep.total_cents):'Nessun cespite','chiusure');
  const acc=(b.entries||[]).some(e=>e.source&&e.source.type==='accrual'&&e.date===to);add('accruals','Ratei e risconti valutati',acc,acc?'Registrati':'Controlla affitti, assicurazioni, canoni e abbonamenti a cavallo d\'anno','chiusure');}
 const lock=b.company.lock_date;add('lock','Periodo bloccato',!!lock&&lock>=to,lock?'Bloccato fino al '+lock.split('-').reverse().join('/'):'Nessuna data di blocco','impostazioni');
 return {from,to,items,done:items.filter(i=>i.done).length,total:items.length};
}
/* Compact snapshot for the assistant: euro amounts as numbers, labels in Italian, no personal data beyond
   counterpart names already in the books. Kept small so a question costs little. */
function snapshot(b,{year,today}){
 const f=figures(b,{year,today}),idx=coa.index(f.acc);
 const monthly=mgmt.monthly(f.posted,f.acc,f.y).filter(m=>m.from<=f.cut).map(m=>({mese:m.month,ricavi:euro(m.values.ricavi),ebitda:euro(m.values.ebitda),utile:euro(m.values.utile)}));
 const costs=[...ledger.balances(f.posted,{from:f.from,to:f.cut})].map(([code,v])=>({code,a:idx.get(code),v:v.debit_cents-v.credit_cents})).filter(x=>x.a&&x.a.kind==='C'&&x.v>0).sort((a,c)=>c.v-a.v).slice(0,10).map(x=>({conto:x.code+' '+x.a.name,importo:euro(x.v)}));
 const sales=new Map();for(const d of b.documents||[])if(d.direction==='sale'&&d.status==='registered'&&d.date>=f.from&&d.date<=f.cut)sales.set(d.counterpart_name||'?',(sales.get(d.counterpart_name||'?')||0)+d.total_cents);
 const budget=(b.budget||[]).length?mgmt.budgetVsActual(f.posted,f.acc,b.budget,{year:f.y,months:f.cut.slice(0,4)==String(f.y)?+f.cut.slice(5,7):12}).map(r=>({voce:r.key,budget:euro(r.budget_cents),consuntivo:euro(r.actual_cents),scostamento:euro(r.variance_cents),favorevole:r.favourable})):[];
 const dims=k=>mgmt.byDimension(f.posted,f.acc,k,{from:f.from,to:f.cut}).slice(0,8).map(r=>({nome:r.key,ricavi:euro(r.revenue_cents),costi:euro(r.cost_cents),margine:euro(r.margin_cents),margine_pct:r.margin_pct}));
 const dep=assets.depreciation(b.entries||[],f.acc,f.y);
 return {
  azienda:{nome:b.company.name,regime:b.company.regime,forma:b.company.legal_form||null,iva:f.periodicity==='monthly'?'mensile':'trimestrale',piano:b.company.plan},
  oggi:today,esercizio:f.y,dati_fino_al:f.cut,valuta:'EUR (importi in euro)',
  kpi:{ricavi:euro(f.kp.revenue_cents),ebitda:euro(f.kp.ebitda_cents),ebitda_pct:f.kp.ebitda_pct,utile:euro(f.kp.net_cents),cassa:euro(f.kp.cash_cents),crediti_aperti:euro(f.kp.receivables_cents),debiti_aperti:euro(f.kp.payables_cents),dso_giorni:f.kp.dso_days,dpo_giorni:f.kp.dpo_days},
  conto_economico:f.is.rows.map(r=>({voce:r.label,importo:euro(r.value_cents),pct_ricavi:r.pct})),
  mesi:monthly,costi_principali:costs,
  clienti_principali:[...sales].sort((a,c)=>c[1]-a[1]).slice(0,8).map(([n,v])=>({cliente:n,fatturato_ivato:euro(v)})),
  budget,progetti:dims('project'),centri_di_costo:dims('cost_center'),
  iva:f.vatPeriods.map(p=>({periodo:p.period.label,stato:p.closed?'chiusa':p.status,da_versare:euro(p.payable_cents),credito:euro(p.carry_credit_cents),codice_f24:p.f24_code,scadenza:p.due})),
  scadenzario:{crediti:{totale:euro(f.age.receivable.total),scaduti_oltre_90:euro(f.age.receivable.over_90)},debiti:{totale:euro(f.age.payable.total)},
   scaduti:f.age.overdue.slice(0,10).map(i=>({tipo:i.kind==='receivable'?'credito':'debito',controparte:i.counterpart,documento:i.doc_number,residuo:euro(i.open_cents),giorni_ritardo:i.days_late}))},
  cassa_13_settimane:f.fc.weeks.map(w=>({dal:w.from,entrate:euro(w.inflow_cents),uscite:euro(w.outflow_cents),saldo:euro(w.closing_cents)})),
  da_fare:{fatture_da_confermare:(b.documents||[]).filter(x=>x.status==='to_review').length,movimenti_banca_da_abbinare:(b.bank||[]).filter(m=>m.status==='new').length,bozze:(b.entries||[]).filter(e=>e.status==='draft').length},
  ammortamenti:{quota_esercizio:euro(dep.total_cents),cespiti:dep.rows.length,gia_registrati:dep.existing.length>0},
  anomalie:anomalies(b,{year,today}).map(a=>({livello:a.level,titolo:a.title,dettaglio:a.detail}))
 };
}
const SUGGESTED=Object.freeze(['Come sta andando l\'azienda quest\'anno?','Quanta IVA devo versare e quando?','Avrò problemi di cassa nelle prossime settimane?','Quali clienti mi devono più soldi?','Dove posso tagliare i costi?','Cosa devo sistemare prima della chiusura del mese?']);
// System prompt and messages for the model. The snapshot goes in the system prompt (stable per company and day).
function prompt(snap,question,history){
 const system='Sei il copilota contabile di RADIX Accounting e rispondi al titolare di una piccola azienda italiana, che non è un contabile. '+
  'Rispondi in italiano, in modo chiaro e breve (massimo 180 parole), partendo dalla risposta e poi dal perché. Usa importi in euro con il formato italiano (1.234,56 €).\n\n'+
  'Regole:\n- Usa solo i numeri della SITUAZIONE qui sotto, calcolati dal motore contabile sulle registrazioni confermate. Non inventare dati: se un dato manca, dillo e indica dove si inserisce (Fatture, Prima nota, Banca e scadenze, IVA, Bilancio, Controllo di gestione, Chiusure).\n'+
  '- Non dare per fatti invii o versamenti: RADIX prepara i dati, F24, LIPE e dichiarazioni li trasmette il professionista abilitato.\n'+
  '- Su scelte fiscali o legali dai l\'indicazione generale e consiglia di confermarla con il commercialista.\n'+
  '- Se l\'utente chiede di registrare o cambiare qualcosa, spiega i passi nella pagina: tu non modifichi i conti.\n'+
  '- Niente tabelle lunghe: al massimo un elenco di 5 punti.\n\nSITUAZIONE (JSON):\n'+JSON.stringify(snap);
 const msgs=[];for(const h of (history||[]).slice(-6))if(h&&['user','assistant'].includes(h.role)&&typeof h.content==='string'&&h.content.trim())msgs.push({role:h.role,content:h.content.slice(0,2000)});
 while(msgs.length&&msgs[0].role!=='user')msgs.shift();
 msgs.push({role:'user',content:String(question).slice(0,1000)});
 return {system,messages:msgs};
}
return {anomalies,monthClose,snapshot,prompt,SUGGESTED};
});
