'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const F=require('../sales/crm-fields-core.js');
const csv=require('../sales/crm-csv-core.js');

test('Settore and Ruolo are closed lists ending with «Altro»',()=>{
 assert.equal(F.fieldOf('companies','industry').type,'choice');
 assert.equal(F.fieldOf('contacts','role').type,'choice');
 assert.equal(F.INDUSTRIES.at(-1)[0],'Altro');assert.equal(F.ROLES.at(-1)[0],'Altro');
 for(const [v] of [...F.INDUSTRIES,...F.ROLES])assert.ok(v.length<=120,v);
});

test('a voice of the list is accepted, other text only when it is the stored value',()=>{
 assert.deepEqual(F.parse('companies','industry','Informatica e software'),{value:'Informatica e software'});
 assert.match(F.parse('companies','industry','Software house').error,/elenco/);
 assert.deepEqual(F.parse('companies','industry','Software house',{current:'Software house'}),{value:'Software house'});
 assert.deepEqual(F.parse('contacts','role',''),{value:null});
});

test('free text goes to the nearest voice',()=>{
 const role=t=>F.classify('contacts','role',t),ind=t=>F.classify('companies','industry',t);
 assert.equal(role('Sales Manager EMEA'),'Commerciale e vendite');
 assert.equal(role('CEO & Founder'),'Titolare / CEO');
 assert.equal(role('Responsabile Ufficio Acquisti'),'Acquisti');
 assert.equal(role('Customer Success Manager'),'Assistenza clienti');
 assert.equal(role('direzione generale'),'Direzione generale');
 assert.equal(role('Impiegata'),null);
 assert.equal(ind('Software house'),'Informatica e software');
 assert.equal(ind('Mobili e arredamento'),'Arredo e design');
 assert.equal(ind("commercio all'ingrosso"),'Commercio all’ingrosso');
 assert.equal(ind('xyz'),null);
});

test('import: role → voice with the title kept in Qualifica; unknown sector → Altro with a warning',()=>{
 const c=csv.mapRows('contacts',{headers:['Nome','Ruolo'],rows:[{Nome:'Anna Rossi',Ruolo:'Head of Marketing'},{Nome:'Bea Neri',Ruolo:'Impiegata'}]},{extended:true});
 assert.equal(c.rows[0].role,'Marketing e comunicazione');assert.equal(c.rows[0].title,'Head of Marketing');
 assert.equal(c.rows[1].role,undefined);assert.equal(c.rows[1].title,'Impiegata');
 const a=csv.mapRows('companies',{headers:['Azienda','Settore'],rows:[{Azienda:'Uno Srl',Settore:'Retail'},{Azienda:'Due Srl',Settore:'Boh'}]},{extended:true});
 assert.equal(a.rows[0].industry,'Commercio al dettaglio');assert.equal(a.rows[1].industry,'Altro');
 assert.match(a.warnings[0].why,/Altro/);
});
