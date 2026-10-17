'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const D=require('../sales/crm-dedupe-core.js');

test('groups contacts by email, phone, or name within the same company',()=>{
 const g=D.groups([
  {id:'a',name:'Mario Rossi',email:'Mario@Acme.it',company:'Acme'},{id:'b',name:'M. Rossi',email:' mario@acme.it ',company:'Acme'},
  {id:'c',name:'Luca Bianchi',phone:'+39 333 123 4567',company:'Beta'},{id:'d',name:'Luca B.',phone:'3331234567',company:'Gamma'},
  {id:'e',name:'Anna Verdì',company:'Acme'},{id:'f',name:'anna  verdi',company:'acme'},
  {id:'g',name:'Anna Verdi',company:'Altro'},{id:'h',name:'Contatto anonimizzato'},{id:'i',name:'Contatto anonimizzato'},{id:'j',name:'Solo',phone:'123'},{id:'k',name:'Solo 2',phone:'123'}]);
 const sets=g.map(x=>x.contacts.map(c=>c.id).sort().join(','));
 assert.deepEqual(sets.sort(),['a,b','c,d','e,f']);
 assert.deepEqual(g.find(x=>x.contacts[0].id==='c').reasons,['telefono']);
});
test('chains of matches form one group with every reason',()=>{
 const g=D.groups([{id:'a',name:'A',email:'x@y.it'},{id:'b',name:'B',email:'x@y.it',phone:'0612345678'},{id:'c',name:'C',phone:'06 1234 5678'}]);
 assert.equal(g.length,1);assert.equal(g[0].contacts.length,3);assert.deepEqual(g[0].reasons.sort(),['email','telefono']);
});
const keep={id:'k',name:'Mario',version:3,company_id:'co',email:'m@a.it',phone:null,notes:'vecchie',marketing_consent:false};
const drop={id:'d',name:'M. Rossi',version:1,company_id:'co',email:'x@a.it',phone:'333',role:'CEO',notes:'nuove',marketing_consent:true};
test('merge plan fills empty fields, appends notes, moves records and flags consent',()=>{
 const rel=[{entity:'contacts',record:drop},{entity:'opportunities',record:{id:'o1',title:'Deal',contact_id:'d',version:1}},
  {entity:'tasks',record:{id:'t1',contact_id:'d',version:2}},{entity:'tasks',record:{id:'t2',contact_id:'other',version:1}},
  {entity:'interactions',record:{id:'i1',contact_id:'d',version:1}},{entity:'tickets',record:{id:'k1',contact_id:'d',version:4}}];
 const p=D.mergePlan(keep,drop,rel);
 assert.equal(p.blocked,null);assert.deepEqual(p.fill,{phone:'333',role:'CEO',notes:'vecchie\n\nUnito da «M. Rossi»: nuove'});
 assert.deepEqual(p.moves.map(m=>m.entity+':'+m.record.id),['opportunities:o1','tasks:t1','interactions:i1','tickets:k1']);
 assert.equal(p.consentLost,true);
});
test('merge is refused across companies, for deals with activities, and for the same contact',()=>{
 assert.match(D.mergePlan(keep,{...drop,company_id:'other'},[]).blocked,/aziende diverse/);
 assert.match(D.mergePlan(keep,drop,[{entity:'opportunities',record:{id:'o1',title:'Deal',contact_id:'d'}},{entity:'tasks',record:{id:'t1',opportunity_id:'o1',contact_id:'d'}}]).blocked,/Deal/);
 assert.ok(D.mergePlan(keep,keep,[]).blocked);
});
test('keys: emails keep punctuation, Italian prefixes are ignored, names of any script count',()=>{
 assert.notEqual(D.email('mario_rossi@acme.it'),D.email('mario-rossi@acme.it'));assert.equal(D.email(' Mario@Acme.IT '),'mario@acme.it');
 assert.equal(D.phone('+39 12345678'),D.phone('12345678'));assert.equal(D.phone('0039 333 1234567'),D.phone('333-1234567'));assert.equal(D.phone('123'),'');
 assert.notEqual(D.phone('+44 20 7946 0958'),D.phone('+1 20 7946 0958'));
 assert.equal(D.norm('张伟'),'张伟');assert.notEqual(D.norm('Łukasz Nowak'),D.norm('ukasz Nowak'));assert.equal(D.norm('Anna  Verdì'),'anna verdi');
 const g=D.groups([{id:'a',name:'张伟',company:'X'},{id:'b',name:'张伟',company:'X'}]);assert.equal(g.length,1);
});
test('leads move too; notes are never cut and never appended twice',()=>{
 const p=D.mergePlan(keep,drop,[{entity:'leads',record:{id:'l1',contact_id:'d',version:1}}]);
 assert.deepEqual(p.moves.map(m=>m.entity+':'+m.record.id),['leads:l1']);
 assert.equal(D.mergePlan({...keep,notes:'vecchie\n\nUnito da «M. Rossi»: nuove'},drop,[]).fill.notes,undefined);
 assert.match(D.mergePlan({...keep,notes:'x'.repeat(3000)},{...drop,notes:'y'.repeat(1500)},[]).blocked,/4000/);
});
