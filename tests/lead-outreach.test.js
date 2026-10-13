'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),c=require('../sales/lead-outreach-core');
const e={candidate:{name:'Alfa',source:'https://alfa.it',domain:'alfa.it'},reasons:[]},form={email:'ceo@alfa.it',source:'https://alfa.it/team',basis:'existing',checked:true,privacy:true};
test('verified approval gates mail and prohibits duplicates',()=>{assert.equal(c.validate(e,form).ok,true);assert.equal(c.validate(e,{...form,checked:false}).ok,false);assert.equal(c.validate({...e,reasons:['Possibile duplicato']},form).ok,false)});
test('follow-ups are draft-only and CSV escaped',()=>{const rows=c.makePlan(e,{subject:'=SUM(1)',body:'hello'},'2026-10-13',4,10);assert.deepEqual(rows.map(x=>x.date),['2026-10-13','2026-10-17','2026-10-23']);assert.ok(c.toCsv(rows,'Alfa','ceo@alfa.it').includes("'=SUM"));assert.throws(()=>c.makePlan(e,{subject:'A',body:'B'},'2026-10-13',10,4))});
