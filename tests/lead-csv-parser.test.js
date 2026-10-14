'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseCsv}=require('../lib/lead-csv-parser');
test('CSV separators and multiline fields',()=>{
 const x=parseCsv('name;industry\n"Alfa, S.p.A.";"Macchine, utensili"');
 assert.equal(x[0].name,'Alfa, S.p.A.');
 assert.equal(x[0].industry,'Macchine, utensili');
 const y=parseCsv('azienda\tdominio\nAlfa\talfa.it');
 assert.equal(y[0].domain,'alfa.it');
});
test('CSV validation',()=>{
 assert.throws(()=>parseCsv('name,domain\nAlfa,alfa.it,Italia'),/numero colonne/);
 assert.throws(()=>parseCsv('name,azienda\nAlfa,Beta'),/duplicata/);
});
