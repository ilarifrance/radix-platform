'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const fp=require('../lib/accounting/fatturapa.js');
const fx=name=>fs.readFileSync(path.join(__dirname,'fixtures','accounting',name),'utf8');

test('cents converts decimal strings exactly',()=>{
 assert.equal(fp.cents('1234.5'),123450);assert.equal(fp.cents('0.125'),13);assert.equal(fp.cents('-0.125'),-13);
 assert.equal(fp.cents('10'),1000);assert.equal(fp.cents('85.00000000'),8500);assert.equal(fp.cents('0.124'),12);
 assert.equal(fp.cents('1.005'),101);assert.equal(fp.cents('-0.004'),0);assert.equal(fp.cents('.5'),50);assert.equal(fp.cents('+7.1'),710);
 assert.throws(()=>fp.cents('1.234,56'),/punto come separatore decimale/);
 assert.throws(()=>fp.cents('12,3'),/punto/);assert.throws(()=>fp.cents('abc'),/Importo non valido/);assert.throws(()=>fp.cents(''),/Importo non valido/);
});

test('standard FPR12 purchase invoice with prefixes, entities, CDATA and installments',()=>{
 const r=fp.parse(fx('fpr12-standard.xml'));
 assert.equal(r.format,'FPR12');
 assert.deepEqual(r.transmitter,{country:'IT',id:'01234567890',progressive:'00042'});
 assert.deepEqual(r.supplier,{name:'Rossi & Bianchi S.r.l.',vat:'IT01234567890',taxCode:'01234567890',regime:'RF01',
  address:{street:'Via Giuseppe Verdi',number:'12',zip:'20121',city:'Milano',province:'MI',country:'IT'}});
 assert.equal(r.customer.vat,'IT09876543210');assert.equal(r.customer.taxCode,null);assert.equal('regime' in r.customer,false);
 assert.equal(r.customer.address.number,'5/B');
 assert.equal(r.documents.length,1);
 const d=r.documents[0];
 assert.equal(d.type,'TD01');assert.equal(d.currency,'EUR');assert.equal(d.date,'2026-09-30');assert.equal(d.number,'FT-2026/0101');
 assert.equal(d.total_cents,255710);assert.equal(d.computed_total_cents,255710);assert.equal(d.rounding_cents,0);assert.equal(d.stamp_cents,0);
 assert.equal(d.causale,'Fornitura servizi settembre <2026> come da ordine');
 assert.equal(d.lines.length,3);
 assert.deepEqual(d.lines[0],{n:1,description:'Consulenza & sviluppo software è à "agile"',quantity:10,unit_price:'85.00000000',total_cents:85000,vatRate:22,nature:null,withholding:false});
 assert.deepEqual(d.lines.map(l=>l.total_cents),[85000,120000,5100]);assert.deepEqual(d.lines.map(l=>l.vatRate),[22,22,10]);
 assert.deepEqual(d.summary,[
  {vatRate:22,nature:null,taxable_cents:205000,vat_cents:45100,exigibility:'I',rounding_cents:0,reference:null},
  {vatRate:10,nature:null,taxable_cents:5100,vat_cents:510,exigibility:'I',rounding_cents:0,reference:null}]);
 assert.deepEqual(d.payments,[
  {terms:'TP01',method:'MP05',due:'2026-10-31',amount_cents:127855,iban:'IT60X0542811101000000123456'},
  {terms:'TP01',method:'MP05',due:'2026-11-30',amount_cents:127855,iban:'IT60X0542811101000000123456'}]);
 assert.deepEqual(d.references,{orders:['PO-2026-77'],linked:[]});
 assert.deepEqual(d.withholding,[]);assert.deepEqual(d.fund,[]);
 assert.deepEqual(r.warnings,[]);
});

test('professional invoice with withholding tax and pension fund',()=>{
 const r=fp.parse(fx('professionista-ritenuta.xml'));
 assert.equal(r.supplier.name,'Mario Rossi');assert.equal(r.supplier.taxCode,'RSSMRA70A01H501U');assert.equal(r.supplier.vat,'IT11223344556');
 const d=r.documents[0];
 assert.deepEqual(d.withholding,[{type:'RT01',rate:20,amount_cents:20000,reason:'A'}]);
 assert.deepEqual(d.fund,[{type:'TC22',rate:4,amount_cents:4000,taxable_cents:100000,vatRate:22,withholding:false,nature:null}]);
 assert.equal(d.lines[0].withholding,true);assert.equal(d.lines[0].quantity,null);
 assert.equal(d.total_cents,126880);assert.equal(d.computed_total_cents,126880);
 assert.equal(d.payments[0].amount_cents,106880);
 assert.deepEqual(r.warnings,[]);
});

test('credit note TD04 links the original invoice',()=>{
 const r=fp.parse(fx('nota-credito.xml'));
 const d=r.documents[0];
 assert.equal(d.type,'TD04');assert.equal(d.total_cents,12200);assert.deepEqual(d.references.linked,['FT-2026/0101']);
 assert.deepEqual(d.payments,[]);assert.deepEqual(r.warnings,[]);
});

test('reverse charge N6.7 at 0%',()=>{
 const r=fp.parse(fx('reverse-charge.xml'));
 const d=r.documents[0];
 assert.equal(d.lines[0].nature,'N6.7');assert.equal(d.lines[0].vatRate,0);
 assert.deepEqual(d.summary[0],{vatRate:0,nature:'N6.7',taxable_cents:500000,vat_cents:0,exigibility:'I',rounding_cents:0,reference:'Inversione contabile art. 17 c. 6 lett. a-ter DPR 633/72'});
 assert.equal(d.computed_total_cents,500000);assert.deepEqual(r.warnings,[]);
});

test('split payment FPA12: payment net of VAT does not warn',()=>{
 const r=fp.parse(fx('split-payment-pa.xml'));
 assert.equal(r.format,'FPA12');
 assert.equal(r.customer.vat,null);assert.equal(r.customer.taxCode,'00514490010');assert.equal(r.customer.address.street,'Piazza Palazzo di Città');
 const d=r.documents[0];
 assert.equal(d.summary[0].exigibility,'S');assert.equal(d.total_cents,244000);assert.equal(d.payments[0].amount_cents,200000);
 assert.deepEqual(d.references.orders,['DET-2026-118']);
 assert.deepEqual(r.warnings,[]);
});

test('file with two bodies yields two documents',()=>{
 const r=fp.parse(fx('lotto-due-body.xml'));
 assert.deepEqual(r.documents.map(d=>[d.number,d.type,d.total_cents,d.computed_total_cents]),[['A/1','TD01',12200,12200],['A/2','TD24',5500,5500]]);
 assert.equal(r.documents[1].stamp_cents,200);assert.equal(r.documents[0].causale,null);
 assert.deepEqual(r.warnings,[]);
});

test('inconsistencies produce Italian warnings, not errors',()=>{
 let xml=fx('fpr12-standard.xml').replace('<ImportoTotaleDocumento>2557.10','<ImportoTotaleDocumento>2600.00').replace('<Imposta>451.00','<Imposta>450.00');
 let r=fp.parse(xml);
 assert.equal(r.warnings.length,3);
 assert.match(r.warnings[0],/FT-2026\/0101.*imposta 450\.00.*attesa 451\.00/);
 assert.match(r.warnings[1],/Documento FT-2026\/0101: totale documento 2600\.00 diverso dal totale calcolato 2556\.10/);
 assert.match(r.warnings[2],/somma pagamenti 2557\.10 diversa dal netto a pagare 2600\.00/);
 // 1 cent tolerance on VAT and total
 r=fp.parse(fx('fpr12-standard.xml').replace('<Imposta>5.10','<Imposta>5.11').replace('<ImportoTotaleDocumento>2557.10','<ImportoTotaleDocumento>2557.11').replace(/1278\.55<\/ImportoPagamento>\s*<IBAN>IT60X0542811101000000123456<\/IBAN>\s*<\/DettaglioPagamento>\s*<\/DatiPagamento>/,'1278.56</ImportoPagamento></DettaglioPagamento></DatiPagamento>'));
 assert.deepEqual(r.warnings,[]);
 r=fp.parse(fx('nota-credito.xml').replace(/<DatiRiepilogo>[\s\S]*<\/DatiRiepilogo>/,''));
 assert.deepEqual(r.warnings,['Documento NC-12: DatiRiepilogo mancante','Documento NC-12: totale documento 122.00 diverso dal totale calcolato 0.00']);
 r=fp.parse(fx('professionista-ritenuta.xml').replace('<ImportoPagamento>1068.80','<ImportoPagamento>1268.80'));
 assert.equal(r.warnings.length,1);assert.match(r.warnings[0],/12\/2026: somma pagamenti 1268\.80 diversa dal netto a pagare 1068\.80/);
});

test('BOM, comments and missing total are handled',()=>{
 const r=fp.parse('﻿'+fx('nota-credito.xml').replace('<ImportoTotaleDocumento>122.00</ImportoTotaleDocumento>','<!-- nessun totale -->'));
 assert.equal(r.documents[0].total_cents,null);assert.equal(r.documents[0].computed_total_cents,12200);assert.deepEqual(r.warnings,[]);
});

test('rejects DOCTYPE, wrong root and malformed XML',()=>{
 assert.throws(()=>fp.parse('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><FatturaElettronica>&e;</FatturaElettronica>'),{message:'DOCTYPE non consentito'});
 assert.throws(()=>fp.parse('<ns:Ordine xmlns:ns="x"><A/></ns:Ordine>'),/non è una FatturaPA.*ns:Ordine/);
 assert.throws(()=>fp.parse('<FatturaElettronica><A></B></FatturaElettronica>'),/chiusura inattesa/);
 assert.throws(()=>fp.parse('<FatturaElettronica><A>'),/non chiuso/);
 assert.throws(()=>fp.parse('<FatturaElettronica>&foo;</FatturaElettronica>'),/Entità XML non supportata/);
 assert.throws(()=>fp.parse(''),/documento vuoto/);
});

test('attribute and numeric entities decode; empty bodies warn',()=>{
 const r=fp.parse(`<a:FatturaElettronica a:versione='FPR12' xmlns:a="u"><a:FatturaElettronicaHeader><a:CedentePrestatore><a:DatiAnagrafici><a:Anagrafica><a:Denominazione>A&#x26;B &lt;srl&gt; &apos;x&apos;</a:Denominazione></a:Anagrafica></a:DatiAnagrafici></a:CedentePrestatore></a:FatturaElettronicaHeader></a:FatturaElettronica>`);
 assert.equal(r.format,'FPR12');assert.equal(r.supplier.name,"A&B <srl> 'x'");assert.equal(r.supplier.vat,null);
 assert.deepEqual(r.documents,[]);assert.deepEqual(r.warnings,['Nessun FatturaElettronicaBody nel file']);
});
