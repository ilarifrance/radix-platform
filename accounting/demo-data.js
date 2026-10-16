/* RADIX Accounting — demonstration mode. An in-memory store with the same commands as /api/accounting,
   built on the same lib/accounting functions, plus a fictional company seeded through those commands.
   Used when the accounting archive is not active yet: nothing leaves the browser, nothing is saved. */
(function(root,factory){const deps=typeof module==='object'&&module.exports?{coa:require('../lib/accounting/chart-of-accounts'),ledger:require('../lib/accounting/ledger'),fpa:require('../lib/accounting/fatturapa'),bank:require('../lib/accounting/bank-csv'),posting:require('../lib/accounting/posting'),vat:require('../lib/accounting/vat'),rec:require('../lib/accounting/reconcile')}:{coa:root.RadixChartOfAccounts,ledger:root.RadixLedger,fpa:root.RadixFatturaPA,bank:root.RadixBankCSV,posting:root.RadixPosting,vat:root.RadixVAT,rec:root.RadixReconcile};const api=factory(deps);if(typeof module==='object'&&module.exports)module.exports=api;else root.RadixAccDemo=api})(typeof globalThis!=='undefined'?globalThis:this,function(deps){
'use strict';
const {coa,ledger,fpa,bank,posting,vat,rec}=deps;
let n=0;const id=()=>'demo-'+(++n).toString(36)+'-'+Math.random().toString(36).slice(2,8);
const clone=o=>JSON.parse(JSON.stringify(o));
const fail=m=>{throw Object.assign(new Error(m),{status:400});};
function createStore(){
 const db={company:null,accounts:coa.STANDARD.map(a=>({...a,system:Object.values(coa.SYSTEM).includes(a.code),active:true})),entries:[],documents:[],vat_rows:[],open_items:[],bank:[],budget:{},settlements:[],learned:{},audit:[],seq:{}};
 const log=(action,detail)=>db.audit.unshift({at:new Date().toISOString(),action,detail:detail||{},actor:'Tu (demo)'});
 const lockOk=d=>{if(db.company.lock_date&&d<=db.company.lock_date)fail('Periodo chiuso: fino alla data di blocco non si registra più nulla');};
 function addEntry(e,post,source){
  const errs=ledger.validateEntry(e,db.accounts);if(errs.length)fail(errs.join(' '));lockOk(e.date);
  const row={id:id(),date:e.date,description:e.description,status:'draft',source:source||e.source||{type:'manual'},lines:e.lines.map(l=>({account:l.account,debit_cents:l.debit_cents||0,credit_cents:l.credit_cents||0,cost_center:l.cost_center||null,project:l.project||null,description:l.description||null})),version:1,number:null,created_at:new Date().toISOString()};
  db.entries.push(row);if(post)postEntry(row);return row;
 }
 function postEntry(e){const y=e.date.slice(0,4);db.seq[y]=(db.seq[y]||0)+1;e.number=y+'/'+String(db.seq[y]).padStart(4,'0');e.status='posted';e.version++;}
 const find=(list,i,v,extra)=>{const x=list.find(r=>r.id===i);if(!x||(v!==undefined&&x.version!==v)||(extra&&!extra(x)))fail('Dati cambiati nel frattempo: ricarica e riprova.');return x;};
 async function command(action,d){
  d=clone(d||{});
  switch(action){
  case 'company.create':db.company={id:'demo-company',name:d.name,vat:d.vat||null,tax_code:d.tax_code||null,legal_form:d.legal_form||'srl',regime:d.regime||'ordinario',vat_periodicity:d.vat_periodicity||'quarterly',plan:d.plan||'base',lock_date:null,version:1,role:'owner'};log(action);return {id:db.company.id};
  case 'company.update':for(const k of ['name','vat','tax_code','legal_form','regime','vat_periodicity','plan','lock_date'])if(k in d)db.company[k]=d[k];db.company.version++;log(action);return {id:db.company.id};
  case 'member.add':fail('In modalità dimostrativa non si aggiungono persone.');break;
  case 'member.remove':fail('In modalità dimostrativa non si rimuovono persone.');break;
  case 'account.save':{const errs=coa.validate([...db.accounts.filter(a=>a.code!==d.code),{code:d.code,name:d.name,kind:d.kind,group:d.group}]);if(errs.length)fail(errs[0]);const a=db.accounts.find(x=>x.code===d.code);if(a){if(a.system&&(a.kind!==d.kind||a.group!==d.group))fail('I conti di sistema non cambiano tipo o gruppo.');Object.assign(a,{name:d.name,kind:d.kind,group:d.group,keywords:d.keywords||null});}else{db.accounts.push({code:d.code,name:d.name,kind:d.kind,group:d.group,keywords:d.keywords||null,system:false,active:true});db.accounts.sort((x,y)=>x.code.localeCompare(y.code));}return {code:d.code};}
  case 'entry.save':{
   if(d.id){const e=find(db.entries,d.id,d.version,x=>x.status==='draft');const errs=ledger.validateEntry(d,db.accounts);if(errs.length)fail(errs.join(' '));lockOk(d.date);Object.assign(e,{date:d.date,description:d.description,lines:d.lines.map(l=>({account:l.account,debit_cents:l.debit_cents||0,credit_cents:l.credit_cents||0,cost_center:l.cost_center||null,project:l.project||null,description:l.description||null}))});e.version++;if(d.post)postEntry(e);log(action);return {id:e.id};}
   const e=addEntry(d,!!d.post);log(action);return {id:e.id};
  }
  case 'entry.post':{const e=find(db.entries,d.id,d.version,x=>x.status==='draft');lockOk(e.date);postEntry(e);log(action);return {id:e.id};}
  case 'entry.delete':{const e=find(db.entries,d.id,d.version,x=>x.status==='draft');lockOk(e.date);db.entries=db.entries.filter(x=>x!==e);log(action);return {id:e.id};}
  case 'entry.reverse':{const e=find(db.entries,d.id,undefined,x=>x.status==='posted');if(db.entries.some(x=>x.reverses===e.id))fail('Registrazione già stornata.');const r=addEntry({date:d.date||new Date().toISOString().slice(0,10),description:('Storno '+e.number+' · '+e.description).slice(0,300),lines:e.lines.map(l=>({...l,debit_cents:l.credit_cents,credit_cents:l.debit_cents}))},true,{type:'reversal'});r.reverses=e.id;log(action);return {id:r.id};}
  case 'document.import':{
   let parsed;try{parsed=fpa.parse(d.xml);}catch(e){fail(e.message);}
   const direction=posting.directionFor(parsed,{vat:db.company.vat,taxCode:db.company.tax_code});
   if(!direction)fail('La fattura non riporta la partita IVA o il codice fiscale di questa azienda: controlla l\'anagrafica o il file.');
   const party=direction==='purchase'?parsed.supplier:parsed.customer,key=posting.counterpartKey(party);
   const out=parsed.documents.map(doc=>{
    const dup=db.documents.some(x=>x.direction===direction&&x.number===doc.number&&x.date===doc.date&&x.counterpart_key===key);
    const p=posting.propose(doc,party,{direction,accounts:db.accounts,learned:db.learned});const row={id:id(),direction,doc_type:doc.type,number:doc.number,date:doc.date,counterpart_name:party&&party.name,counterpart_vat:party&&(party.vat||party.taxCode),counterpart_key:key,total_cents:doc.total_cents??doc.computed_total_cents,status:'to_review',parsed:{...parsed,documents:[doc]},proposal:p,file_name:d.file_name||null,entry_id:null,version:1,created_at:new Date().toISOString()};
    if(!dup)db.documents.push(row);return {id:row.id,number:doc.number,date:doc.date,direction,counterpart:row.counterpart_name,total_cents:row.total_cents,confidence:p.confidence,duplicate:dup};});
   log(action,{documents:out.length});return {documents:out,warnings:parsed.warnings};
  }
  case 'document.confirm':{
   const doc=find(db.documents,d.id,d.version,x=>x.status==='to_review'),inv=doc.parsed.documents[0],party=doc.direction==='purchase'?doc.parsed.supplier:doc.parsed.customer;
   const regDate=d.date||inv.date,p=posting.propose(inv,party,{direction:doc.direction,accounts:db.accounts,deductiblePct:d.deductible_pct??100,registrationDate:regDate});
   const e=addEntry({date:regDate,description:d.description||p.entry.description,lines:d.lines||p.entry.lines},true,{type:'invoice',document_id:doc.id,direction:doc.direction,number:inv.number});
   p.vat.forEach(r=>db.vat_rows.push({...r,id:id(),document_id:doc.id,entry_id:e.id,paid_date:null}));
   p.open_items.filter(i=>i.amount_cents).forEach(i=>db.open_items.push({...i,id:id(),document_id:doc.id,paid_cents:0,version:1}));
   const kind=doc.direction==='purchase'?'C':'R',idx=coa.index(db.accounts),main=e.lines.filter(l=>idx.get(l.account)?.kind===kind).sort((a,b)=>(b.debit_cents+b.credit_cents)-(a.debit_cents+a.credit_cents))[0];
   if(main&&doc.counterpart_key)db.learned[doc.counterpart_key]=main.account;
   doc.status='registered';doc.entry_id=e.id;doc.version++;log(action);return {id:doc.id,entry_id:e.id};
  }
  case 'document.ignore':{const doc=find(db.documents,d.id,d.version,x=>x.status==='to_review');doc.status='ignored';doc.version++;return {id:doc.id};}
  case 'bank.import':{
   let parsed;try{parsed=bank.parseStatement(d.csv);}catch(e){fail(e.message);}
   let added=0;for(const r of parsed.rows){if(!r.amount_cents)continue;const fp=bank.fingerprint(r);if(db.bank.some(m=>m.fingerprint===fp))continue;db.bank.push({id:id(),account:d.account||'03.01',date:r.date,value_date:r.value_date,amount_cents:r.amount_cents,description:r.description,fingerprint:fp,status:'new',entry_id:null,open_item_id:null,version:1});added++;}
   log(action);return {imported:added,duplicates:parsed.rows.length-added,warnings:parsed.warnings};
  }
  case 'bank.confirm':{
   const m=find(db.bank,d.id,d.version,x=>x.status==='new');let item=null;
   if(d.open_item_id){item=db.open_items.find(i=>i.id===d.open_item_id);if(!item)fail('Scadenza non trovata.');if((m.amount_cents>0)!==(item.kind==='receivable'))fail('Un incasso va su un credito, un pagamento su un debito.');if(Math.abs(m.amount_cents)>Math.abs(item.amount_cents-item.paid_cents))fail('Il movimento supera il residuo della scadenza.');}
   const e=addEntry(rec.entryFor(m,{item,account:item?null:d.account,bankAccount:m.account}),true,{type:'bank',movement_id:m.id});
   if(item){item.paid_cents+=Math.sign(item.amount_cents)*Math.abs(m.amount_cents);item.version++;const all=db.open_items.filter(i=>i.document_id===item.document_id);if(all.every(i=>i.paid_cents===i.amount_cents))db.vat_rows.filter(v=>v.document_id===item.document_id&&!v.paid_date).forEach(v=>v.paid_date=m.date);}
   Object.assign(m,{status:'matched',entry_id:e.id,open_item_id:item?item.id:null});m.version++;log(action);return {id:m.id,entry_id:e.id};
  }
  case 'bank.ignore':{const m=find(db.bank,d.id,d.version,x=>x.status==='new');m.status='ignored';m.version++;return {id:m.id};}
  case 'budget.save':db.budget[d.year]=d.rows;log(action);return {year:d.year};
  case 'vat.close':{
   const list=vat.periods(+d.period.slice(0,4),db.company.vat_periodicity),i=list.findIndex(p=>p.key===d.period);if(i<0)fail('Periodo non valido per la periodicità dell\'azienda.');
   if(db.settlements.some(s=>s.period===d.period))fail('Liquidazione di questo periodo già chiusa.');
   const prev=i?db.settlements.find(s=>s.period===list[i-1].key):null;if(i&&!prev)fail('Chiudi prima la liquidazione del periodo precedente ('+list[i-1].label+').');
   const s=vat.settle(db.vat_rows,{periodicity:db.company.vat_periodicity,period:d.period,previousDebit_cents:prev?prev.result.carry_debit_cents:0,previousCredit_cents:prev?prev.result.carry_credit_cents:0,yearCredit_cents:i?0:(d.opening_credit_cents||0),advance_cents:d.advance_cents||0});
   const se=vat.settlementEntry(s),e=se?addEntry(se,true,{type:'vat',period:d.period}):null;
   db.settlements.push({period:d.period,result:s,entry_id:e&&e.id,closed_at:new Date().toISOString()});log(action);return {settlement:s,entry_id:e&&e.id};
  }
  default:fail('Azione non disponibile in modalità dimostrativa.');
  }
 }
 async function bundle(year){
  const to=year+'-12-31';
  return clone({company:db.company,accounts:db.accounts,entries:db.entries.filter(e=>e.date<=to).sort((a,b)=>a.date.localeCompare(b.date)),documents:db.documents.slice().sort((a,b)=>(a.status==='to_review'?0:1)-(b.status==='to_review'?0:1)||b.date.localeCompare(a.date)),
   vat_rows:db.vat_rows,open_items:db.open_items.slice().sort((a,b)=>a.due.localeCompare(b.due)),bank:db.bank.slice().sort((a,b)=>b.date.localeCompare(a.date)),budget:db.budget[year]||[],settlements:db.settlements.filter(s=>s.period.startsWith(String(year))),
   members:[{user_id:0,name:'Tu (demo)',email:'',role:'owner'}],audit:db.audit.slice(0,50)});
 }
 return {command,bundle,demo:true};
}

// ---- Fictional company and its year, generated through the same commands ----
const COMPANY={name:'Officina Digitale Demo Srl',vat:'IT01234560789',tax_code:'01234560789',legal_form:'srl',regime:'ordinario',vat_periodicity:'quarterly',plan:'controllo'};
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
const money=c=>(c<0?'-':'')+Math.floor(Math.abs(c)/100)+'.'+String(Math.abs(c)%100).padStart(2,'0');
// Minimal FatturaPA FPR12 document (one body). lines: [{d,c (cents),r (rate)}]
function invoiceXml({supplier,customer,number,date,lines,type='TD01',due,ritenuta}){
 const party=(p,tag)=>`<${tag}><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${p.vat.slice(2)}</IdCodice></IdFiscaleIVA><Anagrafica><Denominazione>${esc(p.name)}</Denominazione></Anagrafica>${tag==='CedentePrestatore'?'<RegimeFiscale>RF01</RegimeFiscale>':''}</DatiAnagrafici><Sede><Indirizzo>Via Roma 1</Indirizzo><CAP>20100</CAP><Comune>Milano</Comune><Provincia>MI</Provincia><Nazione>IT</Nazione></Sede></${tag}>`;
 const byRate={};lines.forEach(l=>{byRate[l.r]=(byRate[l.r]||0)+l.c;});
 const summary=Object.entries(byRate).map(([r,c])=>({r:+r,c,v:Math.round(c*r/100)}));
 const total=summary.reduce((t,s)=>t+s.c+s.v,0),rit=ritenuta?Math.round(lines.reduce((t,l)=>t+l.c,0)*ritenuta/100):0;
 return `<?xml version="1.0" encoding="UTF-8"?><p:FatturaElettronica versione="FPR12" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2"><FatturaElettronicaHeader><DatiTrasmissione><IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>${supplier.vat.slice(2)}</IdCodice></IdTrasmittente><ProgressivoInvio>${esc(number).replace(/\W/g,'')}</ProgressivoInvio><FormatoTrasmissione>FPR12</FormatoTrasmissione><CodiceDestinatario>0000000</CodiceDestinatario></DatiTrasmissione>${party(supplier,'CedentePrestatore')}${party(customer,'CessionarioCommittente')}</FatturaElettronicaHeader><FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento><TipoDocumento>${type}</TipoDocumento><Divisa>EUR</Divisa><Data>${date}</Data><Numero>${esc(number)}</Numero>${rit?`<DatiRitenuta><TipoRitenuta>RT01</TipoRitenuta><ImportoRitenuta>${money(rit)}</ImportoRitenuta><AliquotaRitenuta>${ritenuta}.00</AliquotaRitenuta><CausalePagamento>A</CausalePagamento></DatiRitenuta>`:''}<ImportoTotaleDocumento>${money(total)}</ImportoTotaleDocumento></DatiGeneraliDocumento></DatiGenerali><DatiBeniServizi>${lines.map((l,i)=>`<DettaglioLinee><NumeroLinea>${i+1}</NumeroLinea><Descrizione>${esc(l.d)}</Descrizione><PrezzoUnitario>${money(l.c)}</PrezzoUnitario><PrezzoTotale>${money(l.c)}</PrezzoTotale><AliquotaIVA>${l.r}.00</AliquotaIVA>${rit?'<Ritenuta>SI</Ritenuta>':''}</DettaglioLinee>`).join('')}${summary.map(s=>`<DatiRiepilogo><AliquotaIVA>${s.r}.00</AliquotaIVA><ImponibileImporto>${money(s.c)}</ImponibileImporto><Imposta>${money(s.v)}</Imposta><EsigibilitaIVA>I</EsigibilitaIVA></DatiRiepilogo>`).join('')}</DatiBeniServizi><DatiPagamento><CondizioniPagamento>TP02</CondizioniPagamento><DettaglioPagamento><ModalitaPagamento>MP05</ModalitaPagamento><DataScadenzaPagamento>${due}</DataScadenzaPagamento><ImportoPagamento>${money(total-rit)}</ImportoPagamento></DettaglioPagamento></DatiPagamento></FatturaElettronicaBody></p:FatturaElettronica>`;
}
const addDays=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*864e5).toISOString().slice(0,10);
const pad=x=>String(x).padStart(2,'0');
const SUPPLIERS=[{name:'Cloud Servizi Italia Srl',vat:'IT02345670981',lines:[{d:'Abbonamento software gestionale e hosting cloud',c:42000,r:22}]},{name:'Energia Nord Spa',vat:'IT03456780192',lines:[{d:'Fornitura energia elettrica ufficio',c:31000,r:10}]},{name:'Immobiliare Duomo Srl',vat:'IT04567890123',lines:[{d:'Canone di locazione ufficio',c:180000,r:22}]},{name:'Studio Verdi Consulenza',vat:'IT05678901234',lines:[{d:'Consulenza fiscale e societaria',c:60000,r:22}],ritenuta:20}];
const CUSTOMERS=[{name:'Ferri Costruzioni Srl',vat:'IT06789012345'},{name:'Bottega Rossi Snc',vat:'IT07890123456'},{name:'Alfa Logistica Spa',vat:'IT08901234567'}];
// Seeds a year up to `today`: monthly sales and purchases (registered), payments through the bank, salaries, a few items still to review.
async function seed(store,today){
 today=today||new Date().toISOString().slice(0,10);
 const year=+today.slice(0,4),lastMonth=+today.slice(5,7);
 await store.command('company.create',COMPANY);
 await store.command('entry.save',{date:year+'-01-02',description:'Saldo iniziale banca e capitale',lines:[{account:'03.01',debit_cents:4000000},{account:'06.01',credit_cents:1000000},{account:'06.02',credit_cents:3000000}],post:true});
 const csv=['Data contabile;Data valuta;Descrizione;Dare;Avere'];const it=d=>d.slice(8)+'/'+d.slice(5,7)+'/'+d.slice(0,4);
 let seq=0;const pending=[];
 for(let m=1;m<=lastMonth;m++){
  const d=y=>year+'-'+pad(m)+'-'+pad(y);const current=m===lastMonth;
  for(const [i,cu] of CUSTOMERS.entries()){
   const date=d(5+i*6);if(date>today)continue;const amt=[1450000,620000,980000][i]+((m*37+i*11)%7)*15000;const num=year+'/'+String(++seq).padStart(3,'0');
   const xml=invoiceXml({supplier:COMPANY,customer:cu,number:num,date,lines:[{d:i===1?'Sviluppo sito e-commerce':'Servizi di consulenza digitale e marketing',c:amt,r:22}],due:addDays(date,30)});
   const r=await store.command('document.import',{xml,file_name:num.replace('/','-')+'.xml'});
   if(current&&i===1){continue;}
   const b=await store.bundle(year);const doc=b.documents.find(x=>x.id===r.documents[0].id);
   const proj=['Ferri · Portale','Rossi · E-commerce','Alfa · Marketing'][i];
   await store.command('document.confirm',{id:doc.id,version:doc.version,lines:doc.proposal.entry.lines.map(l=>l.account.startsWith('70')?{...l,project:proj,cost_center:i===1?'Sviluppo':'Consulenza'}:l)});
   const pay=addDays(date,i===0?28:i===1?35:33);if(pay<=today&&!(i===1&&m>=lastMonth-1))csv.push([it(pay),it(pay),'Bonifico da '+cu.name+' saldo fattura '+num,'',(Math.round(amt*1.22)/100).toFixed(2).replace('.',',')].join(';'));
  }
  for(const [i,s] of SUPPLIERS.entries()){
   if(s.ritenuta&&m%3!==0)continue;
   const num='F'+m+'-'+(100+i),date=d(3+i*5);if(date>today)continue;const xml=invoiceXml({supplier:s,customer:COMPANY,number:num,date,lines:s.lines,due:addDays(date,30),ritenuta:s.ritenuta});
   const r=await store.command('document.import',{xml,file_name:num+'.xml'});
   if(current&&i===1)continue;
   const b=await store.bundle(year);const doc=b.documents.find(x=>x.id===r.documents[0].id);
   await store.command('document.confirm',{id:doc.id,version:doc.version,lines:doc.proposal.entry.lines.map(l=>/^6[0-6]/.test(l.account)?{...l,cost_center:'Struttura'}:l)});
   const gross=s.lines.reduce((t,l)=>t+Math.round(l.c*(1+l.r/100)),0)-(s.ritenuta?Math.round(s.lines[0].c*s.ritenuta/100):0);
   const pay=addDays(date,30);if(pay<=today)csv.push([it(pay),it(pay),'Bonifico a '+s.name+' fattura '+num,(gross/100).toFixed(2).replace('.',','),''].join(';'));
  }
  if(d(27)<=today){await store.command('entry.save',{date:d(27),description:'Stipendi '+m+'/'+year,lines:[{account:'63.01',debit_cents:1450000,cost_center:'Struttura'},{account:'63.02',debit_cents:435000,cost_center:'Struttura'},{account:'03.01',credit_cents:1885000}],post:true});}
  const fee=d(Math.min(28,+today.slice(8)||28));if(fee<=today)csv.push([it(fee),it(fee),'Commissioni e spese tenuta conto',(1250/100).toFixed(2).replace('.',','),''].join(';'));
 }
 await store.command('bank.import',{csv:csv.join('\n')});
 // Reconcile everything with a confident match, leave the rest to the user.
 let b=await store.bundle(year);
 const sugg=rec.suggest(b.bank.filter(m=>m.status==='new'),b.open_items);
 const holdFrom=addDays(today,-20);
 for(const s of sugg){const m=s.row;if(m.date>=holdFrom)continue;if(s.match)await store.command('bank.confirm',{id:m.id,version:m.version,open_item_id:s.match.item.id});else if(s.rule)await store.command('bank.confirm',{id:m.id,version:m.version,account:s.rule.account});}
 const budget=[];for(let m=1;m<=12;m++){budget.push({key:'ricavi',month:m,amount_cents:3200000},{key:'servizi',month:m,amount_cents:-260000},{key:'godimento',month:m,amount_cents:-180000},{key:'personale',month:m,amount_cents:-1885000});}
 await store.command('budget.save',{year,rows:budget});
 const periods=vat.periods(year,COMPANY.vat_periodicity);for(const p of periods){if(p.to<addDays(today,-1)&&p.due<=addDays(today,60))await store.command('vat.close',{period:p.key});else break;}
 // F24 payments of the closed VAT settlements, reconciled against Erario c/IVA.
 b=await store.bundle(year);const f24=['Data contabile;Descrizione;Importo'];
 for(const st of b.settlements){const r=st.result;if(r.payable_cents&&r.due<=today)f24.push([it(r.due),'Pagamento delega F24 IVA '+r.period.label,'-'+(r.payable_cents/100).toFixed(2).replace('.',',')].join(';'));}
 if(f24.length>1){await store.command('bank.import',{csv:f24.join('\n')});b=await store.bundle(year);for(const m of b.bank.filter(x=>x.status==='new'&&/F24/.test(x.description)))await store.command('bank.confirm',{id:m.id,version:m.version,account:coa.SYSTEM.vatSettlement});}
 return store;
}
return {createStore,seed,invoiceXml,COMPANY};
});
