'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const C=require('../sales/crm-deal-flow-core.js'),P=require('../sales/crm-playbook-core.js');
const opp={id:'o1',title:'Rossi SRL',company_id:'c1',contact_id:'p1',owner_id:7,stage_id:'s1'};
const proposta={id:'s2',title:'Proposta inviata',process_id:'pr'};
const NOW=Date.UTC(2026,10,4,12,0,0);

test('suggestions: steps of the new stage, without those the deal already has',()=>{
 const all=C.suggestions(proposta,opp,[],P,NOW);
 assert.equal(all.length,3);assert.match(all[0].label,/^Invia la proposta/);assert.ok(!/Playbook/.test(all[0].label));assert.match(all[0].title,/^\[Playbook Proposta\] /);
 const have=C.suggestions(proposta,opp,[{opportunity_id:'o1',title:all[0].title}],P,NOW);
 assert.equal(have.length,2);
 assert.deepEqual(C.suggestions(null,opp,[],P),[]);
});
test('recontact: 3 days by default, not preselected on a closing stage',()=>{
 assert.deepEqual(C.recontact(proposta),{days:3,checked:true});
 assert.equal(C.recontact({title:'Vinto'}).checked,false);
});
test('payloads: the activity done and the tasks, only fields the API accepts',()=>{
 const r=C.payloads(opp,{activity:{kind:'call',body:'  Chiamato\nil referente '},tasks:[{title:'Ricontattare',days:3},{title:'  ',days:1},{title:'Ricontattare',days:9}]},{now:NOW});
 assert.equal(r.interaction.kind,'call');assert.equal(r.interaction.title,'Telefonata · Rossi SRL');assert.equal(r.interaction.body,'Chiamato il referente');
 assert.equal(r.interaction.opportunity_id,'o1');assert.equal(r.interaction.occurred_at,'2026-11-04T12:00:00Z');
 assert.equal(r.tasks.length,1);assert.equal(r.tasks[0].due_at,'2026-11-07T09:00:00Z');assert.equal(r.tasks[0].assignee_id,7);assert.equal(r.tasks[0].status,'todo');
 const allowed=['title','kind','occurred_at','body','company_id','contact_id','opportunity_id'];
 assert.ok(Object.keys(r.interaction).every(k=>allowed.includes(k)));
});
test('payloads: nothing chosen creates nothing; bad kind and days are normalised',()=>{
 assert.deepEqual(C.payloads(opp,{activity:null,tasks:[]},{now:NOW}),{interaction:null,tasks:[]});
 const r=C.payloads(opp,{activity:{kind:'zzz',body:''},tasks:[{title:'A',days:'-4'},{title:'B',days:'abc'}]},{now:NOW});
 assert.equal(r.interaction.kind,'note');assert.equal(r.tasks[0].due_at,'2026-11-04T09:00:00Z');assert.equal(r.tasks[1].due_at,'2026-11-04T09:00:00Z');
});
test('pages load the flow and both stage changes go through it',()=>{
 const pipe=fs.readFileSync('sales/pipeline-premium.js','utf8'),sales=fs.readFileSync('sales/sales.js','utf8');
 assert.match(pipe,/RadixDealFlow\.moveDeal/);assert.match(pipe,/RadixDealFlow\.openDetail/);assert.ok(!/window\.confirm\(moveConfirmation/.test(pipe));
 assert.match(sales,/RadixDealFlow\.moveDeal/);assert.match(sales,/RadixDealFlow\.openDetail/);
 for(const f of ['sales-pipeline-premium.html','radix-sales.html']){const h=fs.readFileSync(f,'utf8');for(const x of ['crm-deal-flow-core.js','crm-deal-flow.js','crm-deal-flow.css'])assert.ok(h.includes(x),f+' '+x)}
 const ui=fs.readFileSync('sales/crm-deal-flow.js','utf8');assert.ok(!/\.style\.|innerHTML/.test(ui),'no inline styles or innerHTML');
});
