'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const S=require('../sales/crm-sequence-ideas.js');
const C=require('../sales/crm-campaigns.js');
test('prompt carries goal, span, channels and detail',()=>{
 const p=S.prompt({goal:'Dopo un preventivo',span:'1 settimana',kinds:['email','task'],detail:'preventivo sito'});
 for(const s of ['preventivo già inviato','7 giorni','email, attività','preventivo sito','"email|task"','{"sequences"'])assert.ok(p.includes(s),s);
 assert.ok(!p.includes('telefonata'));
});
test('parse keeps allowed channels, increasing days within the span, 2-6 steps',()=>{
 const reply='Ecco '+JSON.stringify({sequences:[
  {name:'Tre tocchi',why:'Ritmo serrato',steps:[{day:0,kind:'email',title:'Inviare la prima email'},{day:2,kind:'call',title:'Telefonare'},{day:1,kind:'email',title:'indietro'},{day:20,kind:'email',title:'troppo tardi'},{day:5,kind:'sms',title:'canale non ammesso'},{day:6,kind:'email',title:'Chiudere'}]},
  {name:'Uno solo',steps:[{day:0,kind:'email',title:'Solo uno'}]},
  {steps:[{day:0,kind:'call',title:'A'},{day:3,kind:'call',title:'B'}]}]});
 const l=S.parse(reply,{span:14,kinds:['email','call'],stamp:'x'});
 assert.equal(l.length,2);
 assert.deepEqual(l[0].steps.map(s=>s.day),[0,2,6]);assert.equal(l[0].id,'su-misura-x-1');
 assert.equal(l[1].name,'Su misura 3');assert.deepEqual(S.parse('no'),[]);
});
test('a proposed sequence plans CRM tasks like the built-in ones',()=>{
 const [seq]=S.parse(JSON.stringify({sequences:[{name:'Prova',steps:[{day:0,kind:'email',title:'Uno'},{day:3,kind:'call',title:'Due'}]}]}),{stamp:'y'});
 const plan=C.planSequence(seq,[{id:'c1',name:'Anna Bianchi',marketing_consent:true}],[],{now:Date.parse('2026-10-19T08:00:00Z'),consentOnly:true});
 assert.equal(plan.tasks.length,2);assert.match(plan.tasks[1].title,/^\[Prova\] Telefonata: Due · Anna Bianchi/);
});
