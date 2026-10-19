'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const script=fs.readFileSync('sales/lead-archive.js','utf8');
test('switching saved list requires explicit load before overwrite',()=>{
 assert.match(script,/archive-list'\)\.value!==state\.listId/);
 assert.match(script,/Carica prima la lista selezionata/);
 assert.match(script,/addEventListener\('change'/);
 assert.doesNotThrow(()=>new vm.Script(script));
});
test('invalid follow-up calendar dates cannot be persisted',()=>{
 const {payload}=require('../api/_lead_lists'),candidate={name:'A',domain:'a.it',country:'Italia',industry:'Industria',companySize:'PMI',contactRole:'CEO',source:'https://a.it'};
 const draft={subject:'Oggetto',body:'Testo'},review={index:0,contact:'',email:'ceo@a.it',source:'https://a.it',basis:'consent',notes:'',checked:true,privacy:true,draft,plan:[{date:'2026-02-30',step:'Primo',subject:'Oggetto',body:'Testo'},{date:'2026-03-05',step:'Secondo',subject:'Oggetto',body:'Testo'},{date:'2026-03-10',step:'Terzo',subject:'Oggetto',body:'Testo'}]};
 assert.throws(()=>payload({icp:{country:'Italia',industry:'',size:'',role:''},prospects:[candidate],reviews:[review]}),/Data non valida/);
});
