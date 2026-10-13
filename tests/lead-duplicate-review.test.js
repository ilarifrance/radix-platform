'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('sales/lead-premium.js','utf8');
const start=source.indexOf(' const identityKeys=c=>');
const end=source.indexOf(' function parseCsv(source)');
if(start<0||end<=start)throw Error('Lead identity functions missing');
const norm=x=>typeof x==='string'?x.normalize('NFKC').trim().toLocaleLowerCase('it'):'';
const fragment=source.slice(start,end);
const identity=vm.runInNewContext('(function(norm){'+fragment+';return {identityKeys,duplicateGroups};})',{})(norm);
test('same domain with website URL and case variation',()=>{
 const groups=identity.duplicateGroups([{name:'A',domain:'example.it'},{name:'B',domain:'https://www.EXAMPLE.IT/about'}]);
 assert.equal(groups.length,1);assert.equal(Array.from(groups[0]).join(','),'0,1');
});
test('name and country connect separate domains; domain connects third record',()=>{
 const groups=identity.duplicateGroups([{name:'Alfa',country:'Italia',domain:'alfa.it'},{name:'ALFA',country:'italia',domain:'beta.it'},{name:'Other',country:'France',domain:'beta.it'}]);
 assert.equal(groups.length,1);assert.equal(Array.from(groups[0]).join(','),'0,1,2');
});
test('same name in different countries is not flagged without domain',()=>{
 assert.equal(identity.duplicateGroups([{name:'Alfa',country:'Italia'},{name:'Alfa',country:'Francia'}]).length,0);
});
test('missing country and domain does not trigger false positive',()=>{
 assert.equal(identity.duplicateGroups([{name:'Alfa'},{name:'Alfa'}]).length,0);
});
