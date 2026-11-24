'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const bk=require('../lib/accounting/bank-csv.js');

test('parseAmount handles Italian and English formats exactly',()=>{
 const cases={'1.234,56':123456,'-1.234,56':-123456,'1234,56':123456,'1,234.56':123456,'1234.56':123456,'1.234':123400,'1,234':123400,
  '1.23':123,'0,125':13,'-0.125':-13,'12,3':1230,'€ 1.234,56':123456,'1.234,56 EUR':123456,'+50,00':5000,'50,00-':-5000,'(1.234,56)':-123456,
  '1.234.567,89':123456789,'1.234.567':123456700,'10':1000,'-10':-1000,'0':0,'1 234,56':123456,'−7,50':-750,',5':50,'1234.567':123457};
 for(const[k,v]of Object.entries(cases))assert.equal(bk.parseAmount(k),v,k);
 for(const bad of['','abc','1.2.3','12a','--5','1,234.56.7','-'])assert.equal(bk.parseAmount(bad),null,bad);
});

test('parseDate accepts common bank formats and validates calendar',()=>{
 assert.equal(bk.parseDate('05/09/2026'),'2026-09-05');assert.equal(bk.parseDate('5-9-2026'),'2026-09-05');assert.equal(bk.parseDate('05.09.2026'),'2026-09-05');
 assert.equal(bk.parseDate('05/09/26'),'2026-09-05');assert.equal(bk.parseDate('2026-09-05'),'2026-09-05');assert.equal(bk.parseDate('2026-09-05T10:00:00'),'2026-09-05');
 assert.equal(bk.parseDate('29/02/2028'),'2028-02-29');
 for(const bad of['31/02/2026','29/02/2026','13/13/2026','','Saldo','2026/09/05','05/09-2026'])assert.equal(bk.parseDate(bad),null,bad);
});

const INTESA=['﻿Intesa Sanpaolo - Lista movimenti','Conto corrente: 1000/00012345;;;;','Intestatario: RADIX STUDIO SRL;;;;','Periodo: 01/09/2026 - 30/09/2026;;;;',';;;;',
 'Data contabile;Data valuta;Descrizione;Dare;Avere',
 '01/09/2026;01/09/2026;BONIFICO A VOSTRO FAVORE   Rossi & Bianchi;;2.557,10',
 '03/09/2026;02/09/2026;Pagamento POS  AMAZON EU;-49,99;',
 '15/09/2026;15/09/2026;"Addebito SDD; utenze luce";120,00;',
 '',
 '30/09/2026;30/09/2026;Commissioni;1,50;',
 ';;Saldo contabile finale;;12.345,67',
 'Saldo disponibile;;;;12.000,00'].join('\r\n');

test('Intesa-style: preamble, semicolons, Dare/Avere, BOM, CRLF',()=>{
 const r=bk.parseStatement(INTESA);
 assert.equal(r.delimiter,';');
 assert.deepEqual(r.columns,{date:'Data contabile',value_date:'Data valuta',description:'Descrizione',amount:null,debit:'Dare',credit:'Avere',currency:null});
 assert.deepEqual(r.rows,[
  {line:7,date:'2026-09-01',value_date:'2026-09-01',description:'BONIFICO A VOSTRO FAVORE Rossi & Bianchi',amount_cents:255710,currency:'EUR'},
  {line:8,date:'2026-09-03',value_date:'2026-09-02',description:'Pagamento POS AMAZON EU',amount_cents:-4999,currency:'EUR'},
  {line:9,date:'2026-09-15',value_date:'2026-09-15',description:'Addebito SDD; utenze luce',amount_cents:-12000,currency:'EUR'},
  {line:11,date:'2026-09-30',value_date:'2026-09-30',description:'Commissioni',amount_cents:-150,currency:'EUR'}]);
 assert.deepEqual(r.warnings,[]);
});

test('UniCredit-style signed Importo column',()=>{
 const csv=['Data Operazione;Data Valuta;Descrizione Operazione;Importo (EUR);Divisa',
  '02/10/2026;02/10/2026;PAGAMENTO F24;-1.234,56;EUR','05/10/2026;06/10/2026;ACCREDITO STIPENDIO;2.100,00;eur','07/10/2026;07/10/2026;Giroconto;+300;EUR'].join('\n');
 const r=bk.parseStatement(csv);
 assert.equal(r.columns.date,'Data Operazione');assert.equal(r.columns.amount,'Importo (EUR)');assert.equal(r.columns.description,'Descrizione Operazione');assert.equal(r.columns.currency,'Divisa');
 assert.deepEqual(r.rows.map(x=>[x.line,x.date,x.value_date,x.amount_cents,x.currency]),[[2,'2026-10-02','2026-10-02',-123456,'EUR'],[3,'2026-10-05','2026-10-06',210000,'EUR'],[4,'2026-10-07','2026-10-07',30000,'EUR']]);
});

test('English comma CSV with quoted descriptions and multiline cell',()=>{
 const csv='Booking Date,Value Date,Description,Amount,Currency\n2026-09-01,2026-09-01,"Stripe payout, Inc. ""EU""",1,234.56,EUR\n'.replace('1,234.56','"1,234.56"')+
  '2026-09-02,2026-09-02,"Line one\nline two",-12.30,EUR\n2026-09-03,2026-09-03,Fee,(5.00),USD\n';
 const r=bk.parseStatement(csv);
 assert.equal(r.delimiter,',');
 assert.deepEqual(r.rows,[
  {line:2,date:'2026-09-01',value_date:'2026-09-01',description:'Stripe payout, Inc. "EU"',amount_cents:123456,currency:'EUR'},
  {line:3,date:'2026-09-02',value_date:'2026-09-02',description:'Line one line two',amount_cents:-1230,currency:'EUR'},
  {line:5,date:'2026-09-03',value_date:'2026-09-03',description:'Fee',amount_cents:-500,currency:'USD'}]);
});

test('tab-delimited with dd/mm/yy dates and accented headers',()=>{
 const r=bk.parseStatement('Data registrazione\tCausale\tEntrate\tUscite\n01/09/26\tVersamento\t100,00\t\n02/09/26\tPrelievo\t\t50,00\n');
 assert.equal(r.delimiter,'\t');assert.equal(r.columns.credit,'Entrate');assert.equal(r.columns.debit,'Uscite');
 assert.deepEqual(r.rows.map(x=>[x.date,x.description,x.amount_cents,x.value_date]),[['2026-09-01','Versamento',10000,null],['2026-09-02','Prelievo',-5000,null]]);
 // accent/case-insensitive header matching
 const r2=bk.parseStatement('DATA;MOVIMENTO;AMMONTARE\n01/01/2026;x;1');
 assert.deepEqual([r2.columns.date,r2.columns.description,r2.columns.amount],['DATA','MOVIMENTO','AMMONTARE']);
});

test('prefers data contabile over data valuta regardless of column order',()=>{
 const r=bk.parseStatement('Data valuta;Data;Descrizione;Importo\n02/09/2026;01/09/2026;x;1,00');
 assert.equal(r.columns.date,'Data');assert.equal(r.columns.value_date,'Data valuta');
 assert.equal(r.rows[0].date,'2026-09-01');assert.equal(r.rows[0].value_date,'2026-09-02');
});

test('bad rows produce warnings with line numbers, capped at 20',()=>{
 const r=bk.parseStatement('Data;Descrizione;Importo\n01/09/2026;ok;10,00\n32/09/2026;data errata;5,00\n02/09/2026;importo errato;abc\n03/09/2026;vuoto;\nTotale movimenti;;15,00');
 assert.equal(r.rows.length,1);
 assert.deepEqual(r.warnings,['Riga 3: data non valida "32/09/2026"','Riga 4: importo non valido "abc"','Riga 5: importo non valido ""']);
 const many=['Data;Descrizione;Importo'];for(let i=0;i<25;i++)many.push(`xx;riga ${i};1,00`);
 const m=bk.parseStatement(many.join('\n'));
 assert.equal(m.rows.length,0);assert.equal(m.warnings.length,21);assert.equal(m.warnings[0],'Riga 2: data non valida "xx"');assert.equal(m.warnings[20],'Altre 5 righe scartate');
});

test('missing header throws',()=>{
 assert.throws(()=>bk.parseStatement('foo;bar\n1;2'),{message:'Intestazione non riconosciuta: servono almeno data e importo'});
 assert.throws(()=>bk.parseStatement(''),/Intestazione non riconosciuta/);
 assert.throws(()=>bk.parseStatement('Data;Descrizione\n01/01/2026;x'),/Intestazione non riconosciuta/);
});

test('fingerprint is stable across re-exports',()=>{
 const a=bk.parseStatement(INTESA).rows[0];
 const b=bk.parseStatement('Data operazione,Descrizione,Importo\n01/09/2026,"bonifico a vostro favore Rossi &  Bianchi","2.557,10"').rows[0];
 assert.equal(bk.fingerprint(a),'2026-09-01|255710|bonifico a vostro favore rossi & bianchi');
 assert.equal(bk.fingerprint(a),bk.fingerprint(b));
 assert.notEqual(bk.fingerprint(a),bk.fingerprint({...a,amount_cents:-255710}));
});
