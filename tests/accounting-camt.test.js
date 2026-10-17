'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('fs'),path=require('path');
const camt=require('../lib/accounting/camt.js'),bk=require('../lib/accounting/bank-csv.js');
const fx=f=>fs.readFileSync(path.join(__dirname,'fixtures/accounting/camt',f),'utf8');
const V02=fx('camt053-v02-banca-italiana.xml'),V08=fx('camt053-v08-mixed.xml');

// Wrap entries/statements in a minimal document of the given message type.
const doc=(body,{ns='camt.053.001.04',msg='BkToCstmrStmt'}={})=>`<?xml version="1.0"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:${ns}"><${msg}><GrpHdr><MsgId>X</MsgId></GrpHdr>${body}</${msg}></Document>`;
const stmt=(entries,{tag='Stmt',iban='IT60X0542811101000000123456',bal=''}={})=>`<${tag}><Id>S</Id><Acct><Id><IBAN>${iban}</IBAN></Id><Ccy>EUR</Ccy></Acct>${bal}${entries}</${tag}>`;
const ntry=({amt='10.00',ccy='EUR',ind='CRDT',sts='<Sts>BOOK</Sts>',date='<BookgDt><Dt>2026-10-01</Dt></BookgDt>',extra=''}={})=>
 `<Ntry><Amt Ccy="${ccy}">${amt}</Amt><CdtDbtInd>${ind}</CdtDbtInd>${sts}${date}<ValDt><Dt>2026-10-02</Dt></ValDt>${extra}</Ntry>`;

test('camt.053.001.02 Italian bank: 5 entries, balances, account, references, counterparts',()=>{
 const r=camt.parseStatement(V02);
 assert.equal(r.columns,null);assert.equal(r.delimiter,null);assert.deepEqual(r.warnings,[]);
 assert.deepEqual(r.account,{iban:'IT60X0542811101000000123456',currency:'EUR'});
 assert.equal(r.opening_cents,1000000);assert.equal(r.closing_cents,1036338);
 assert.equal(r.opening_cents+r.rows.reduce((s,x)=>s+x.amount_cents,0),r.closing_cents);
 assert.deepEqual(r.rows,[
  {line:1,date:'2026-10-16',value_date:'2026-10-16',description:'Saldo fattura 12/2026 BONIFICO SEPA A VOSTRO FAVORE Rossi & Bianchi S.n.c.',amount_cents:244000,currency:'EUR',reference:'0542A1610260001',counterpart:'Rossi & Bianchi S.n.c.'},
  {line:2,date:'2026-10-16',value_date:'2026-10-16',description:'Pagamento fattura n. 88 del 30/09/2026 BONIFICO SEPA DISPOSTO Tipografia Verdi S.r.l.',amount_cents:-120000,currency:'EUR',reference:'0542A1610260002',counterpart:'Tipografia Verdi S.r.l.'},
  {line:3,date:'2026-10-16',value_date:'2026-10-16',description:'COMMISSIONI SU BONIFICO DISPOSTO',amount_cents:-350,currency:'EUR',reference:'0542A1610260003',counterpart:null},
  {line:4,date:'2026-10-16',value_date:'2026-10-16',description:'PAGAMENTO DELEGA F24 - AGENZIA DELLE ENTRATE Protocollo telematico 26101612345678901',amount_cents:-84532,currency:'EUR',reference:'0542A1610260004',counterpart:null},
  {line:5,date:'2026-10-16',value_date:'2026-10-15',description:'PAGAMENTO POS 15/10 12:41 CARTA *4321 BAR <CENTRALE> MILANO',amount_cents:-2780,currency:'EUR',reference:'0542A1610260005',counterpart:null}]);
});

test('camt.053.001.08: prefixed namespace, Pty nesting, Sts/Cd, DtTm, pending, batch, reversal, PRCD',()=>{
 const r=camt.parseStatement(V08);
 assert.deepEqual(r.account,{iban:'IT60X0542811101000000123456',currency:'EUR'},'IBAN spaces stripped');
 assert.equal(r.opening_cents,-15000,'PRCD used when OPBD missing, DBIT negative');assert.equal(r.closing_cents,132000);
 assert.deepEqual(r.warnings,['1 movimento non contabilizzato (in attesa) ignorato']);
 assert.deepEqual(r.rows.map(x=>x.line),[1,3,4,5],'line is the 1-based Ntry index, pending entry 2 skipped');
 const[credit,batch,rev,fee]=r.rows;
 assert.deepEqual(credit,{line:1,date:'2026-10-16',value_date:'2026-10-16',description:'Acconto progetto sito web 2026 Studio Legale Neri',amount_cents:100000,currency:'EUR',reference:'N-0001',counterpart:'Studio Legale Neri'});
 // batch: one row, Ntry amount, remittances of both TxDtls
 assert.equal(batch.amount_cents,72000);assert.equal(batch.reference,'SDD-BATCH-7781');
 assert.equal(batch.description,'Canone ottobre - contratto 2026/14 Canone ottobre - contratto 2026/21 INCASSO SDD CORE - DISTINTA 7781 Alfa Consulting SRL Beta Design SNC');
 assert.equal(batch.counterpart,'Alfa Consulting SRL, Beta Design SNC');
 // reversal: per ISO 20022 CdtDbtInd is already the booked direction (DBIT for a returned SDD collection)
 assert.equal(rev.amount_cents,-24000);assert.equal(rev.counterpart,'Beta Design SNC');assert.match(rev.description,/^Storno SDD/);
 assert.deepEqual([fee.amount_cents,fee.reference,fee.counterpart],[-1000,null,null]);
 assert.equal(r.opening_cents+r.rows.reduce((s,x)=>s+x.amount_cents,0),r.closing_cents);
 // banks that keep the original direction on reversals: opt-in inversion
 assert.equal(camt.parseStatement(V08,{reversalInvertsSign:true}).rows[2].amount_cents,24000);
});

test('rows have exactly the bank-csv keys (plus reference/counterpart) and fingerprint works',()=>{
 const csv=bk.parseStatement('Data;Data valuta;Descrizione;Importo\n16/10/2026;16/10/2026;COMMISSIONI SU BONIFICO DISPOSTO;-3,50');
 const r=camt.parseStatement(V02),csvKeys=Object.keys(csv.rows[0]);
 for(const row of[...r.rows,...camt.parseStatement(V08).rows]){
  assert.deepEqual(Object.keys(row),[...csvKeys,'reference','counterpart']);
  assert.equal(typeof row.line,'number');assert.ok(Number.isInteger(row.amount_cents));
 }
 for(const k of Object.keys(csv))assert.ok(k in r,k);
 assert.deepEqual(Object.keys(r),['rows','columns','delimiter','warnings','account','opening_cents','closing_cents']);
 assert.equal(bk.fingerprint(r.rows[2]),'2026-10-16|-350|commissioni su bonifico disposto');
 assert.equal(bk.fingerprint(r.rows[2]),bk.fingerprint(csv.rows[0]),'same movement from CSV and CAMT dedupes');
});

test('amounts: exact decimal math, rounding, currency attr, invalid amounts warn',()=>{
 assert.equal(camt.toCents('1234.56'),123456);assert.equal(camt.toCents('0.1'),10);assert.equal(camt.toCents('1000'),100000);
 assert.equal(camt.toCents('0.125'),13);assert.equal(camt.toCents('-0.125'),-13);assert.equal(camt.toCents('9007199254740.99'),900719925474099);
 for(const bad of['','1,50','abc','.','1.2.3'])assert.equal(camt.toCents(bad),null,bad);
 const r=camt.parseStatement(doc(stmt(ntry({amt:'0.1'})+ntry({amt:'99.99',ccy:'usd',ind:'DBIT'})+ntry({amt:'1,50'})+ntry({ind:'XXX'}))));
 assert.deepEqual(r.rows.map(x=>[x.line,x.amount_cents,x.currency]),[[1,10,'EUR'],[2,-9999,'USD']]);
 assert.deepEqual(r.warnings,['Movimento 3: importo non valido "1,50 CRDT"','Movimento 4: importo non valido "10.00 XXX"']);
});

test('dates: BookgDt Dt/DtTm, fallback to ValDt, invalid date warns',()=>{
 const r=camt.parseStatement(doc(stmt(
  ntry({date:'<BookgDt><DtTm>2026-10-03T23:59:00Z</DtTm></BookgDt>'})+ntry({date:''})+ntry({date:'<BookgDt><Dt>2026-02-30</Dt></BookgDt>',extra:''}).replace(/<ValDt>.*<\/ValDt>/,''))));
 assert.deepEqual(r.rows.map(x=>[x.date,x.value_date]),[['2026-10-03','2026-10-02'],['2026-10-02','2026-10-02']]);
 assert.deepEqual(r.warnings,['Movimento 3: data contabile mancante o non valida']);
});

test('status handling: BOOKED text, missing Sts accepted, pending and other statuses warned',()=>{
 const r=camt.parseStatement(doc(stmt(
  ntry({sts:'<Sts>BOOKED</Sts>'})+ntry({sts:''})+ntry({sts:'<Sts>PDNG</Sts>'})+ntry({sts:'<Sts><Cd>PDNG</Cd></Sts>'})+ntry({sts:'<Sts>PENDING</Sts>'})+ntry({sts:'<Sts>INFO</Sts>'}))));
 assert.deepEqual(r.rows.map(x=>x.line),[1,2]);
 assert.deepEqual(r.warnings,['3 movimenti non contabilizzati (in attesa) ignorati','1 movimento con stato INFO ignorato']);
});

test('description: all Ustrd, dedup, whitespace collapse, entities, 500 char cap; reference fallbacks',()=>{
 const tx=(u,extra='')=>`<TxDtls>${extra}<RmtInf>${u.map(x=>`<Ustrd>${x}</Ustrd>`).join('')}</RmtInf></TxDtls>`;
 const long='A'.repeat(300);
 const r=camt.parseStatement(doc(stmt(
  ntry({extra:`<NtryDtls>${tx(['Fattura   n.&#160;7','&lt;rif&gt; &amp; co'],'<Refs><EndToEndId>E2E-1</EndToEndId></Refs>')}</NtryDtls><AddtlNtryInf>fattura n. 7</AddtlNtryInf>`})+
  ntry({extra:`<NtryRef>NR-9</NtryRef><NtryDtls>${tx([long,'B'.repeat(300)],'<Refs><EndToEndId>E2E-2</EndToEndId></Refs>')}</NtryDtls>`})+
  ntry({extra:'<!-- nessun dettaglio --><AddtlNtryInf><![CDATA[Giroconto & spese]]></AddtlNtryInf>'}))));
 assert.equal(r.rows[0].description,'Fattura n. 7 <rif> & co','case-insensitive duplicate AddtlNtryInf dropped');
 assert.equal(r.rows[0].reference,'E2E-1');
 assert.equal(r.rows[1].description.length,500);assert.equal(r.rows[1].reference,'NR-9');
 assert.equal(r.rows[2].description,'Giroconto & spese');assert.equal(r.rows[2].reference,null);
});

test('counterpart: Dbtr for credits, Cdtr for debits, falls back to the other party',()=>{
 const rp=p=>`<NtryDtls><TxDtls><RltdPties>${p}</RltdPties></TxDtls></NtryDtls>`;
 const both='<Dbtr><Nm>Pagatore</Nm></Dbtr><Cdtr><Nm>Beneficiario</Nm></Cdtr>';
 const r=camt.parseStatement(doc(stmt(ntry({extra:rp(both)})+ntry({ind:'DBIT',extra:rp(both)})+ntry({ind:'DBIT',extra:rp('<Dbtr><Pty><Nm>Solo Dbtr</Nm></Pty></Dbtr>')}))));
 assert.deepEqual(r.rows.map(x=>x.counterpart),['Pagatore','Beneficiario','Solo Dbtr']);
});

test('camt.052 account report and camt.054 notification share the Ntry structure',()=>{
 const r52=camt.parseStatement(doc(stmt(ntry({amt:'5.00'}),{tag:'Rpt'}),{ns:'camt.052.001.02',msg:'BkToCstmrAcctRpt'}));
 assert.deepEqual(r52.rows.map(x=>x.amount_cents),[500]);assert.equal(r52.opening_cents,null);assert.equal(r52.closing_cents,null);
 const r54=camt.parseStatement(doc(stmt(ntry({amt:'7.00',ind:'DBIT'}),{tag:'Ntfctn'}),{ns:'camt.054.001.08',msg:'BkToCstmrDbtCdtNtfctn'}));
 assert.deepEqual(r54.rows.map(x=>x.amount_cents),[-700]);assert.equal(r54.account.iban,'IT60X0542811101000000123456');
});

test('multiple statements: rows concatenated, balances span same account, different IBAN warns',()=>{
 const bal=(cd,a,ind='CRDT')=>`<Bal><Tp><CdOrPrtry><Cd>${cd}</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">${a}</Amt><CdtDbtInd>${ind}</CdtDbtInd></Bal>`;
 const same=camt.parseStatement(doc(stmt(ntry(),{bal:bal('OPBD','100.00')+bal('CLBD','110.00')})+stmt(ntry({amt:'5.00',ind:'DBIT'}),{bal:bal('OPBD','110.00')+bal('CLBD','105.00')})));
 assert.deepEqual(same.rows.map(x=>[x.line,x.amount_cents]),[[1,1000],[2,-500]]);
 assert.deepEqual([same.opening_cents,same.closing_cents,same.warnings],[10000,10500,[]]);
 const diff=camt.parseStatement(doc(stmt(ntry(),{bal:bal('CLBD','1.00')})+stmt(ntry(),{iban:'DE89370400440532013000',bal:bal('CLBD','999.00')})));
 assert.equal(diff.rows.length,2);assert.equal(diff.account.iban,'IT60X0542811101000000123456');assert.equal(diff.closing_cents,100);
 assert.deepEqual(diff.warnings,['Il file contiene estratti di più conti: saldi e conto riferiti a IT60X0542811101000000123456']);
});

test('isCamt sniffs namespace or root element cheaply',()=>{
 assert.equal(camt.isCamt(V02),true);assert.equal(camt.isCamt(V08),true);
 assert.equal(camt.isCamt('<Document><BkToCstmrAcctRpt></BkToCstmrAcctRpt></Document>'),true);
 assert.equal(camt.isCamt('<x:BkToCstmrDbtCdtNtfctn>'),true);
 assert.equal(camt.isCamt('Data;Descrizione;Importo\n01/01/2026;x;1'),false);
 assert.equal(camt.isCamt(fs.readFileSync(path.join(__dirname,'fixtures/accounting/fpr12-standard.xml'),'utf8')),false);
 assert.equal(camt.isCamt(null),false);
});

test('errors: not CAMT, malformed XML, too large, no entries',()=>{
 const NOT=/^Error: Il file non è un estratto conto CAMT \(ISO 20022\)\.$/;
 assert.throws(()=>camt.parseStatement('Data;Importo\n01/01/2026;1'),{message:'Il file non è un estratto conto CAMT (ISO 20022).'});
 assert.throws(()=>camt.parseStatement(''),NOT);
 assert.throws(()=>camt.parseStatement('<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><Foo/></Document>'),NOT);
 assert.throws(()=>camt.parseStatement(doc(stmt(ntry())).replace('</Stmt>','')),/XML non valido/);
 assert.throws(()=>camt.parseStatement('<!DOCTYPE x [<!ENTITY a "b">]>'+doc(stmt(ntry()))),/DOCTYPE non consentito/);
 assert.throws(()=>camt.parseStatement(V02+' '.repeat(5*1024*1024)),/File troppo grande/);
 assert.throws(()=>camt.parseStatement(V02.replace('</BkToCstmrStmt>','<!--'+'è'.repeat(2.7*1024*1024)+'--></BkToCstmrStmt>')),/File troppo grande/,'UTF-8 byte size counts');
 assert.throws(()=>camt.parseStatement(doc(stmt(''))),{message:'Nessun movimento trovato nell\'estratto conto CAMT.'});
 // BOM is tolerated
 assert.equal(camt.parseStatement('﻿'+V02).rows.length,5);
});

test('warnings capped at 20 like bank-csv',()=>{
 const r=camt.parseStatement(doc(stmt(Array.from({length:25},()=>ntry({amt:'x'})).join(''))));
 assert.equal(r.rows.length,0);assert.equal(r.warnings.length,21);assert.equal(r.warnings[20],'Altri 5 movimenti scartati');
});
