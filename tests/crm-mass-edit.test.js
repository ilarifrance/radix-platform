'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const M=require('../sales/crm-mass-edit-core.js');

test('mass edit: offered fields, with and without the columns of 011/014',()=>{
 assert.deepEqual(M.fieldsFor('companies',{added:true}).map(f=>f.key),['division','owner_id','account_type','rating','industry']);
 assert.deepEqual(M.fieldsFor('companies',{}).map(f=>f.key),['industry']);
 assert.deepEqual(M.fieldsFor('contacts',{}).map(f=>f.key),['role']);
 assert.deepEqual(M.fieldsFor('opportunities',{added:true}),[]);
});

test('mass edit: plan validates like the form, skips records that already have the value, clears with empty',()=>{
 const rows=[{id:'a',version:3,name:'Alfa',rating:'calda'},{id:'b',version:1,name:'Beta',rating:null},{id:'c',version:2,name:'Gamma'}];
 const p=M.plan('companies','rating','calda',rows);
 assert.equal(p.value,'calda');assert.equal(p.unchanged,1);assert.deepEqual(p.changes.map(c=>[c.id,c.version,c.from]),[['b',1,null],['c',2,null]]);
 assert.deepEqual(M.payload(p,p.changes[0]),{id:'b',version:1,rating:'calda'});
 assert.equal(M.confirmText(p,'companies','Calda'),'Impostare «Valutazione» a «Calda» su 2 aziende? 1 ha già questo valore e resta com’è.');
 assert.match(M.plan('companies','rating','bollente',rows).error,/valore non previsto/);
 const clear=M.plan('companies','rating','',rows);assert.equal(clear.value,null);assert.deepEqual(clear.changes.map(c=>c.id),['a']);
 assert.equal(M.confirmText(clear,'companies'),'Impostare «Valutazione» a «(vuoto)» su 1 azienda? 2 hanno già questo valore e restano come sono.');
 // Settore: only voices of the closed list, even if a record still holds an old free text.
 assert.match(M.plan('companies','industry','Roba varia',[{id:'a',industry:'Roba varia'}]).error,/scegli una voce/);
 const owner=M.plan('contacts','owner_id','7',[{id:'x',version:1,name:'Maria',owner_id:7},{id:'y',version:1,name:'Luca',owner_id:2}]);
 assert.equal(owner.value,7);assert.deepEqual(owner.changes.map(c=>c.id),['y']);
 assert.match(M.plan('contacts','owner_id','abc',[{id:'x'}]).error,/Responsabile/);
 const d=M.plan('contacts','division','  Logistica Nord ',[{id:'x',version:1,name:'M',division:'Logistica Nord'},{id:'y',version:4,name:'L'}]);
 assert.equal(d.value,'Logistica Nord');assert.deepEqual(d.changes.map(c=>c.id),['y']);
 assert.match(M.plan('contacts','division','x'.repeat(121),[{id:'x'}]).error,/massimo 120/);
});

test('mass edit: refuses other fields, empty and oversized selections',()=>{
 assert.match(M.plan('contacts','email','a@b.it',[{id:'x'}]).error,/non si modifica in blocco/);
 assert.match(M.plan('contacts','marketing_consent','true',[{id:'x'}]).error,/non si modifica in blocco/);
 assert.match(M.plan('contacts','role','CEO',[]).error,/Nessun record/);
 assert.match(M.plan('contacts','department','IT',Array.from({length:M.MAX+1},(_,i)=>({id:'r'+i}))).error,/Al massimo 500/);
});

test('mass edit: wired in the list bulk bar and loaded after the fields core',()=>{
 const html=fs.readFileSync(__dirname+'/../radix-sales.html','utf8');
 const at=s=>html.indexOf('src="sales/'+s+'"');
 assert.ok(at('crm-fields-core.js')>=0&&at('crm-fields-core.js')<at('crm-mass-edit-core.js'));
 assert.ok(at('crm-mass-edit-core.js')<at('crm-mass-edit.js')&&at('crm-mass-edit.js')<at('crm-list.js'));
 const list=fs.readFileSync(__dirname+'/../sales/crm-list.js','utf8');
 assert.match(list,/RadixCrmMassEdit\.panel\(kind/);assert.match(list,/app\(\)\.writable\(kind\)/);
 const ui=fs.readFileSync(__dirname+'/../sales/crm-mass-edit.js','utf8');
 assert.match(ui,/confirm\(M\(\)\.confirmText/);assert.match(ui,/action:'update'/);
});
