/* RADIX Accounting — double-entry engine (partita doppia).
   Entries: {id,date:'YYYY-MM-DD',number,description,status:'draft'|'posted',lines:[{account,debit_cents,credit_cents,cost_center,project,description}]}.
   Amounts are integer cents. Reports read posted entries only unless includeDrafts is set. Pure functions. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./chart-of-accounts'):root.RadixChartOfAccounts);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixLedger=api})(typeof globalThis!=='undefined'?globalThis:this,function(coa){
'use strict';
const MAX=9e13;
const isDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
const amount=v=>v===undefined||v===null?0:v;
const okCents=v=>Number.isSafeInteger(v)&&v>=0&&v<=MAX;

// Returns a list of Italian error messages; empty means the entry can be posted.
function validateEntry(entry,accounts){
 const errors=[],idx=accounts instanceof Map?accounts:coa.index(accounts);
 if(!entry||typeof entry!=='object')return ['Registrazione non valida.'];
 if(!isDate(entry.date))errors.push('Data non valida: usa AAAA-MM-GG.');
 if(typeof entry.description!=='string'||!entry.description.trim())errors.push('Descrizione obbligatoria.');
 const lines=Array.isArray(entry.lines)?entry.lines:[];
 if(lines.length<2)errors.push('Servono almeno due righe (dare e avere).');
 if(lines.length>200)errors.push('Massimo 200 righe per registrazione.');
 let d=0,c=0;
 lines.forEach((l,i)=>{
  const n='Riga '+(i+1)+': ';
  if(!l||!idx.has(l.account)){errors.push(n+'conto inesistente '+(l&&l.account||''));return;}
  const dr=amount(l.debit_cents),cr=amount(l.credit_cents);
  if(!okCents(dr)||!okCents(cr))errors.push(n+'importo non valido.');
  else if((dr>0)===(cr>0))errors.push(n+'indica un importo in dare oppure in avere.');
  else{d+=dr;c+=cr;}
 });
 if(!errors.length&&d!==c)errors.push('Registrazione non bilanciata: dare '+fmt(d)+', avere '+fmt(c)+'.');
 return errors;
}
function fmt(c){const s=c<0?'-':'',v=Math.abs(c),e=Math.floor(v/100).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.');return s+e+','+String(v%100).padStart(2,'0')+' €';}
function inRange(date,from,to){return (!from||date>=from)&&(!to||date<=to);}
function usable(entries,o){return (entries||[]).filter(e=>e&&(o.includeDrafts||e.status!=='draft'));}
// Debit and credit totals per account in a date range.
function balances(entries,o={}){
 const m=new Map();
 for(const e of usable(entries,o)){if(!inRange(e.date,o.from,o.to))continue;
  for(const l of e.lines){if(o.filter&&!o.filter(l,e))continue;const b=m.get(l.account)||{debit_cents:0,credit_cents:0};b.debit_cents+=amount(l.debit_cents);b.credit_cents+=amount(l.credit_cents);m.set(l.account,b);}}
 return m;
}
// Bilancio di verifica: every account with movements, balance = dare - avere.
function trialBalance(entries,accounts,o={}){
 const idx=coa.index(accounts),b=balances(entries,o),rows=[];let td=0,tc=0;
 for(const [code,v] of [...b].sort((x,y)=>x[0].localeCompare(y[0]))){
  const a=idx.get(code)||{code,name:'(conto rimosso)',kind:'?'};
  rows.push({code,name:a.name,kind:a.kind,debit_cents:v.debit_cents,credit_cents:v.credit_cents,balance_cents:v.debit_cents-v.credit_cents});
  td+=v.debit_cents;tc+=v.credit_cents;
 }
 return {rows,debit_cents:td,credit_cents:tc,balanced:td===tc};
}
// Mastrino: opening balance before `from`, then each movement with the running balance.
function accountLedger(entries,code,o={}){
 let running=0,opening=0;const rows=[];
 const list=usable(entries,o).filter(e=>!o.to||e.date<=o.to).sort((a,b)=>a.date.localeCompare(b.date)||String(a.number||'').localeCompare(String(b.number||''),undefined,{numeric:true}));
 for(const e of list)for(const l of e.lines){if(l.account!==code)continue;const delta=amount(l.debit_cents)-amount(l.credit_cents);
  if(o.from&&e.date<o.from){opening+=delta;running+=delta;continue;}
  running+=delta;rows.push({entry_id:e.id,date:e.date,number:e.number||null,description:l.description||e.description,debit_cents:amount(l.debit_cents),credit_cents:amount(l.credit_cents),balance_cents:running});}
 return {opening_cents:opening,rows,closing_cents:running};
}
// Natural sign: revenues and liabilities are positive when credit exceeds debit.
function groupTotals(entries,accounts,o){
 const idx=coa.index(accounts),b=balances(entries,o),t={};
 for(const [code,v] of b){const a=idx.get(code);if(!a)continue;const nat=['R','P','N'].includes(a.kind)?v.credit_cents-v.debit_cents:v.debit_cents-v.credit_cents;t[a.group]=(t[a.group]||0)+nat;}
 return t;
}
// Conto economico riclassificato a valore aggiunto, with % on revenue.
function incomeStatement(entries,accounts,o={}){
 const g=groupTotals(entries,accounts,o),v=k=>g[k]||0;
 const revenue=v('ricavi'),production=revenue+v('altri_ricavi'),external=v('acquisti')+v('servizi')+v('godimento')+v('oneri_diversi');
 const added=production-external,ebitda=added-v('personale'),ebit=ebitda-v('ammortamenti'),pretax=ebit+v('proventi_finanziari')-v('oneri_finanziari'),net=pretax-v('imposte');
 const L=coa.CE_GROUPS,pct=x=>revenue?Math.round(x*1000/revenue)/10:null;
 const row=(key,label,value,kind)=>({key,label,value_cents:value||0,kind,pct:value?pct(value):(revenue?0:null)});
 const rows=[row('ricavi',L.ricavi,revenue,'item'),row('altri_ricavi',L.altri_ricavi,v('altri_ricavi'),'item'),row('valore_produzione','Valore della produzione',production,'total'),
  row('acquisti',L.acquisti,-v('acquisti'),'item'),row('servizi',L.servizi,-v('servizi'),'item'),row('godimento',L.godimento,-v('godimento'),'item'),row('oneri_diversi',L.oneri_diversi,-v('oneri_diversi'),'item'),
  row('valore_aggiunto','Valore aggiunto',added,'total'),row('personale',L.personale,-v('personale'),'item'),row('ebitda','Margine operativo lordo (EBITDA)',ebitda,'total'),
  row('ammortamenti',L.ammortamenti,-v('ammortamenti'),'item'),row('ebit','Reddito operativo (EBIT)',ebit,'total'),row('finanza','Gestione finanziaria',v('proventi_finanziari')-v('oneri_finanziari'),'item'),
  row('ante_imposte','Risultato prima delle imposte',pretax,'total'),row('imposte',L.imposte,-v('imposte'),'item'),row('utile','Risultato netto',net,'result')];
 return {rows,revenue_cents:revenue,ebitda_cents:ebitda,ebit_cents:ebit,net_cents:net,external_costs_cents:external,by:Object.fromEntries(rows.map(r=>[r.key,r.value_cents]))};
}
// Stato patrimoniale at `to`. The period result (from the fiscal year start) closes the balance into equity.
// Bilateral accounts (Erario c/IVA, banca) move to the other side when their balance flips.
function balanceSheet(entries,accounts,o={}){
 const idx=coa.index(accounts),b=balances(entries,{...o,from:undefined}),assets={},liabilities={};
 for(const [code,v] of b){const a=idx.get(code);if(!a||['R','C'].includes(a.kind))continue;const bal=v.debit_cents-v.credit_cents;if(!bal)continue;
  let side,group=a.group;
  if(a.kind==='N'||(a.kind==='P'&&bal<0))side=liabilities;
  else if(a.kind==='A'&&(bal>0||group==='immobilizzazioni'))side=assets;
  else if(a.kind==='P')side=assets;
  else{side=liabilities;group=FLIP[group]||group;}
  if(side===assets&&a.kind==='P')group=FLIP[group]||group;
  const val=side===assets?bal:-bal;(side[group]=side[group]||{label:coa.SP_GROUPS[group]||group,value_cents:0,accounts:[]});side[group].value_cents+=val;side[group].accounts.push({code,name:a.name,value_cents:val});}
 const result=incomeStatement(entries,accounts,{...o,from:o.yearStart||(o.to?o.to.slice(0,4)+'-01-01':undefined)}).net_cents;
 const openPrior=incomeStatement(entries,accounts,{...o,from:undefined,to:o.yearStart?prevDay(o.yearStart):(o.to?prevDay(o.to.slice(0,4)+'-01-01'):undefined)}).net_cents;
 const pn=liabilities.patrimonio=liabilities.patrimonio||{label:coa.SP_GROUPS.patrimonio,value_cents:0,accounts:[]};
 if(openPrior){pn.value_cents+=openPrior;pn.accounts.push({code:'06.03',name:'Risultati esercizi precedenti non ripartiti',value_cents:openPrior});}
 pn.value_cents+=result;pn.accounts.push({code:coa.SYSTEM.yearResult,name:'Risultato del periodo',value_cents:result});
 const sum=s=>Object.values(s).reduce((t,x)=>t+x.value_cents,0);
 const ta=sum(assets),tl=sum(liabilities);
 return {assets,liabilities,total_assets_cents:ta,total_liabilities_cents:tl,balanced:ta===tl,result_cents:result};
}
// An account whose balance flips side is shown under the opposite group (e.g. an overdrawn bank is a financial debt).
const FLIP={liquidita:'debiti_finanziari',crediti_tributari:'debiti_tributari',crediti_clienti:'debiti_altri',crediti_altri:'debiti_altri',debiti_fornitori:'crediti_altri',debiti_tributari:'crediti_tributari',debiti_altri:'crediti_altri',debiti_finanziari:'crediti_altri',tfr:'crediti_altri',ratei_attivi:'ratei_passivi',ratei_passivi:'ratei_attivi'};
function prevDay(d){return new Date(Date.parse(d+'T12:00:00Z')-864e5).toISOString().slice(0,10);}
// Next protocol number for a year: 'YYYY/0001' style ordering is left to the caller; here a simple max+1.
function nextNumber(entries,year){let n=0;for(const e of entries||[]){if(!e.number||!String(e.date).startsWith(String(year)))continue;const m=/(\d+)$/.exec(e.number);if(m)n=Math.max(n,+m[1]);}return year+'/'+String(n+1).padStart(4,'0');}
return {validateEntry,balances,trialBalance,accountLedger,incomeStatement,balanceSheet,nextNumber,fmt,isDate};
});
