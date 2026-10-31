'use strict';
// RADIX xlsx-lite (lib/xlsx-lite.js): a valid SpreadsheetML package (content types, rels, workbook, styles with bold
// header and € / % number formats, shared strings, column widths, frozen header, SUM formulas with cached values),
// read back by its own checker and by the RADIX Excel reader of the CRM import (lib/lead-xlsx-parser.js) through a tiny
// DOMParser written here (Node has none). Every number is invented.
const test=require('node:test'),assert=require('node:assert/strict');
const X=require('../lib/xlsx-lite.js'),Z=require('../lib/zip-lite.js');

require('./xml-dom-shim.js');// a minimal DOMParser for the reader (Node has none)
const READER=require('../lib/lead-xlsx-parser.js');

const book=()=>({title:'Prova',creator:'RADIX',date:new Date('2026-10-22T10:00:00Z'),sheets:[
 {name:'Piano',cols:[22,12,12,13],freeze:{rows:1,cols:1},rows:[
  [{v:'Canale',s:'headerLeft'},{v:'Nov 26',s:'header'},{v:'Dic 26',s:'header'},{v:'Totale',s:'header'}],
  ['Instagram',{v:100,s:'eur'},{v:150,s:'eur'},{f:'SUM(B2:C2)',v:250,s:'eurBold'}],
  ['Email & «newsletter»',{v:50,s:'eurWarn'},{v:0,s:'eur'},{f:'SUM(B3:C3)',v:50,s:'eurBold'}],
  [{v:'Totale',s:'labelTotal'},{f:'SUM(B2:B3)',v:150,s:'eurTotal'},{f:'SUM(C2:C3)',v:150,s:'eurTotal'},{f:'SUM(D2:D3)',v:300,s:'eurTotal'}],
  ['Quota',{f:'IF($D$4=0,0,B4/$D$4)',v:.5,s:'pct'},{f:'IF($D$4=0,0,C4/$D$4)',v:.5,s:'pct'}]]},
 {name:'Note: [prova]',rows:[[' spazio iniziale',null,true]]}]});

test('the package: parts, content types, relationships, well-formed XML, the sheets and their cells',()=>{
 const bytes=X.build(book()),r=X.inspect(bytes);
 assert.deepEqual(r.problems,[]);assert.equal(r.parts[0],'[Content_Types].xml');
 for(const p of ['_rels/.rels','docProps/core.xml','docProps/app.xml','xl/workbook.xml','xl/_rels/workbook.xml.rels','xl/styles.xml','xl/sharedStrings.xml','xl/worksheets/sheet1.xml','xl/worksheets/sheet2.xml'])assert.ok(r.parts.includes(p),p);
 assert.deepEqual(r.sheets.map(s=>s.name),['Piano','Note prova'],'forbidden characters of a sheet name replaced');
 const P=r.sheets[0];assert.deepEqual(P.rows[1],['Instagram',100,150,250]);assert.equal(P.cells.B3.v,50);assert.equal(P.rows[2][0],'Email & «newsletter»');
 assert.equal(P.cells.D4.f,'SUM(D2:D3)');assert.equal(P.cells.D4.v,300);assert.equal(r.sums,5,'every SUM checked against its cached value');
 assert.deepEqual(P.freeze,{rows:1,cols:1,frozen:true});assert.deepEqual(P.cols,[22,12,12,13]);
 assert.equal(P.cells.A1.s,X.STYLES.headerLeft);assert.equal(P.cells.B2.s,X.STYLES.eur);assert.equal(P.cells.B5.s,X.STYLES.pct);
 assert.equal(r.sheets[1].cells.A1.v,' spazio iniziale');assert.equal(r.sheets[1].cells.C1.v,true);assert.equal(r.sheets[1].cells.B1,undefined,'null is an empty cell');
});

test('styles: bold header on a fill, € and % number formats, totals with a rule; workbook recalculates on open',()=>{
 const files=Object.fromEntries(Z.unzip(X.build(book())).map(f=>[f.name,new TextDecoder().decode(f.data)]));
 const st=files['xl/styles.xml'];assert.match(st,/<numFmt numFmtId="164" formatCode="#,##0&quot; €&quot;"\/>/);assert.match(st,/<numFmt numFmtId="165" formatCode="0\.0%"\/>/);
 assert.match(st,/<font><b\/><sz val="11"\/>/);assert.match(st,/<patternFill patternType="solid"><fgColor rgb="FFEEF0FF"\/>/);
 const xfs=[...st.matchAll(/<xf numFmtId="(\d+)" fontId="(\d+)" fillId="(\d+)" borderId="(\d+)"/g)].slice(1);
 assert.deepEqual(xfs[X.STYLES.header].slice(1),['0','1','2','1'],'header: bold, tinted, bottom rule');assert.equal(xfs[X.STYLES.eurTotal][1],'164');assert.equal(xfs[X.STYLES.pct][1],'165');
 assert.match(files['xl/workbook.xml'],/<calcPr calcId="\d+" fullCalcOnLoad="1"\/>/);assert.match(files['xl/workbook.xml'],/_xlnm\.Print_Titles" localSheetId="0">'Piano'!\$A:\$A,'Piano'!\$1:\$1/);
 const s1=files['xl/worksheets/sheet1.xml'];assert.match(s1,/<pane xSplit="1" ySplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"\/>/);
 assert.match(s1,/<c r="D2" s="\d+"><f>SUM\(B2:C2\)<\/f><v>250<\/v><\/c>/);assert.match(s1,/<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"\/>/);
 assert.match(files['xl/sharedStrings.xml'],/<t>Email &amp; «newsletter»<\/t>/);assert.match(files['xl/sharedStrings.xml'],/<t xml:space="preserve"> spazio iniziale<\/t>/);
});

test('round trip with the RADIX Excel reader (lib/lead-xlsx-parser.js): the cached values of the formulas',async()=>{
 const bytes=X.build(book()),buf=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
 const rows=await READER.readRows(buf,{formulas:true});
 assert.deepEqual(rows,[['Canale','Nov 26','Dic 26','Totale'],['Instagram','100','150','250'],['Email & «newsletter»','50','0','50'],['Totale','150','150','300'],['Quota','0.5','0.5']]);
 await assert.rejects(READER.readRows(buf),/formule/,'the lead import still refuses formulas');
});

test('the checker finds a wrong cached SUM, references, names, empty books',()=>{
 const b=book();b.sheets[0].rows[3][3]={f:'SUM(D2:D3)',v:299,s:'eurTotal'};const r=X.inspect(X.build(b));assert.ok(r.problems.some(p=>/SUM\(D2:D3\) dà 300/.test(p)),r.problems.join());
 assert.equal(X.colName(0),'A');assert.equal(X.colName(25),'Z');assert.equal(X.colName(26),'AA');assert.equal(X.colName(701),'ZZ');assert.equal(X.ref(1,13),'N2');assert.deepEqual(X.parseRef('$N$15'),{r:14,c:13});
 assert.deepEqual(X.sheetNames(['Piano','piano','x'.repeat(40),'']),['Piano','piano (2)','x'.repeat(31),'Foglio 4']);
 assert.throws(()=>X.build({sheets:[]}),/Nessun foglio/);assert.match(X.inspect(new Uint8Array([1,2,3])).problems[0],/non leggibile/);
});
