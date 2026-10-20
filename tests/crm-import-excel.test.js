'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const csv=require('../sales/crm-csv-core.js');

test('sheet rows become the same shape as a parsed CSV',()=>{
 const p=csv.fromRows([['Nome','Cellulare','Telefono'],['Anna Rossi','333 1',' 0422 2 '],['','',''],['Bruno',7]]);
 assert.deepEqual(p.headers,['Nome','Cellulare','Telefono']);
 assert.deepEqual(p.rows,[{Nome:'Anna Rossi',Cellulare:'333 1',Telefono:'0422 2'},{Nome:'Bruno',Cellulare:'7',Telefono:''}]);
 const m=csv.mapRows('contacts',p,{extended:true});assert.equal(m.rows[0].mobile,'333 1');assert.equal(m.rows[0].phone,'0422 2');
 assert.throws(()=>csv.fromRows(Array.from({length:csv.MAX_ROWS+2},()=>['x'])),/Massimo/);
});

test('readFile: CSV as text, old .xls refused with a hint, size limits',async()=>{
 const file=(name,text,size)=>({name,size:size??text.length,text:async()=>text,arrayBuffer:async()=>new ArrayBuffer(0)});
 assert.equal((await csv.readFile(file('a.csv','Nome\nAnna\n'))).rows[0].Nome,'Anna');
 await assert.rejects(csv.readFile(file('a.xls','')),/\.xlsx o CSV/);
 await assert.rejects(csv.readFile(file('a.csv','',3e6)),/2 MB/);
 await assert.rejects(csv.readFile(file('a.xlsx','',4e6)),/3 MB/);
});

test('the CRM imports accept .xlsx and load the Excel reader',()=>{
 assert.match(csv.ACCEPT,/\.xlsx/);
 const html=fs.readFileSync(__dirname+'/../radix-sales.html','utf8');
 assert.ok(html.indexOf('lib/lead-xlsx-parser.js')>-1&&html.indexOf('lib/lead-xlsx-parser.js')<html.indexOf('sales/crm-csv-core.js'));
 for(const f of ['crm-tools.js','crm-import-deals.js']){const src=fs.readFileSync(__dirname+'/../sales/'+f,'utf8');assert.match(src,/readFile\(file\)/,f);assert.match(src,/Importa CSV o Excel/,f)}
});
