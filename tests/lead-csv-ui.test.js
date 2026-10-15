'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {parseCsv}=require('../lib/lead-csv-parser');
const html=fs.readFileSync('lead-intelligence.html','utf8');
const src=fs.readFileSync('sales/lead-premium.js','utf8');
function fixture(){
 const elements=new Map();
 function element(tag='div'){
  return {tagName:tag.toUpperCase(),value:'',checked:false,disabled:false,textContent:'',files:[],children:[],listeners:{},
   replaceChildren(...xs){this.children=xs},append(...xs){this.children.push(...xs)},
   addEventListener(name,fn){(this.listeners[name]??=[]).push(fn)},fire(name){for(const fn of this.listeners[name]||[])fn({target:this})}};
 }
 const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)};
 const window={RadixLeadCsv:{parseCsv},dispatchEvent(){},addEventListener(){}};
 const document={getElementById:get,createElement:element,body:{append(){}}};
 vm.runInNewContext(src,{window,document,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail}},URL:{},Blob:class{},navigator:{}});
 return {get,window};
}
async function importFile(f,text){f.get('file').files=[{name:'test.csv',size:Buffer.byteLength(text),text:async()=>text}];await f.get('file').onchange()}
test('browser loads the shared parser before Lead Intelligence',()=>{
 assert.ok(html.indexOf('src="/lib/lead-csv-parser.js"')<html.indexOf('src="/sales/lead-premium.js"'));
 assert.ok(html.includes('.tsv'));
 assert.ok(!src.includes('function parseCsv(source){'));
});
test('CSV and TSV imports use shared parser and score their rows',async()=>{
 const f=fixture();
 const csv='name;domain;country;industry;companySize;contactRole;source\n"Alfa, S.p.A.";alfa.it;Italia;"Macchine; packaging";PMI;CEO;https://alfa.it\n"Beta\nSrl";beta.it;Italia;Packaging;PMI;CEO;https://beta.it';
 await importFile(f,csv);
 assert.equal(f.get('total').textContent,2);
 assert.match(f.get('import-status').textContent,/2 aziende importate/);
 f.get('country').value='Italia';f.get('score').onclick();
 assert.equal(f.get('results').children.length,2);
 await importFile(f,'azienda\tdominio\nGamma\tgamma.it');
 assert.equal(f.get('total').textContent,1);
});
test('invalid import leaves existing list untouched and reports error',async()=>{
 const f=fixture();
 await importFile(f,'name,domain\nAlfa,alfa.it');
 assert.equal(f.get('total').textContent,1);
 await importFile(f,'name,domain\nAlfa,alfa.it,Italia');
 assert.equal(f.get('total').textContent,1);
 assert.match(f.get('import-status').textContent,/numero colonne/);
 assert.match(f.get('import-status').textContent,/precedente conservata/);
});
test('missing parser fails closed without silently using obsolete implementation',async()=>{
 const f=fixture();delete f.window.RadixLeadCsv;
 await importFile(f,'name,domain\nAlfa,alfa.it');
 assert.match(f.get('import-status').textContent,/Modulo CSV non disponibile/);
 assert.equal(f.get('total').textContent,'');
});

test('overlapping CSV reads keep the newest completed selection, not the slow older file',async()=>{
 const f=fixture(),pending=[];
 function later(){let resolve;const promise=new Promise(r=>resolve=r);pending.push(resolve);return promise}
 f.get('file').files=[{name:'test.csv',size:80,text:()=>later()}];const first=f.get('file').onchange();
 f.get('file').files=[{name:'test.csv',size:80,text:()=>later()}];const second=f.get('file').onchange();
 pending[1]('name,domain\nNuova,nuova.it');await second;
 pending[0]('name,domain\nVecchia,vecchia.it');await first;
 assert.equal(f.get('total').textContent,1);
 f.get('country').value='Italia';f.get('score').onclick();
 assert.equal(f.get('results').children[0].children[0].textContent,'Nuova');
});
test('manual insertion and reset cannot be overwritten by an older pending file read',async()=>{
 const f=fixture();let resolve;const promise=new Promise(r=>resolve=r);
 f.get('file').files=[{name:'test.csv',size:80,text:()=>promise}];const importing=f.get('file').onchange();
 f.get('paste-company').value='Manuale';f.get('paste-domain').value='manuale.it';
 f.get('paste-add').onclick();
 resolve('name,domain\nDaFile,dafile.it');await importing;
 assert.equal(f.get('total').textContent,'1');
 f.get('score').onclick();assert.equal(f.get('results').children[0].children[0].textContent,'Manuale');
 let finish;const secondPromise=new Promise(r=>finish=r);
 f.get('file').files=[{name:'test.csv',size:80,text:()=>secondPromise}];const second=f.get('file').onchange();
 f.get('clear').onclick();finish('name,domain\nAltro,altro.it');await second;
 assert.equal(f.get('total').textContent,'—');
 assert.match(f.get('import-status').textContent,/cancellati dalla memoria/);
});
