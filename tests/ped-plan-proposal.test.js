'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const pv=require('../lib/ped-views.js'),core=require('../editorial-core.js');
const state={brief:{channels:'LinkedIn, Instagram',period:'Novembre',frequency:'LinkedIn 2/sett, Instagram 3/sett',goal:'Lead B2B',topics:'Casi studio'},
 rubrics:[{id:'r1',name:'Casi studio',cadence:'ogni martedì'}],contents:[{id:'c1',title:'Lancio',channel:'LinkedIn',date:'2026-10-20',status:'draft'}]};

test('plan prompt carries the strategy, today, the plan to avoid and the JSON format',()=>{
 const p=pv.planPrompt(state,'2026-10-17');
 assert.match(p,/a partire da oggi, 2026-10-17/);assert.match(p,/Frequenza per canale: LinkedIn 2\/sett/);assert.match(p,/Casi studio \(ogni martedì\)/);
 assert.match(p,/- 2026-10-20 · LinkedIn · Lancio/);assert.match(p,/solo con un array JSON/);assert.match(p,/al massimo 30 contenuti/);
});

test('parsePlan keeps valid future items, matches rubrics, drops duplicates and junk',()=>{
 const text='Ecco la proposta:\n```json\n'+JSON.stringify([
  {date:'2026-10-22',time:'09:30',channel:'LinkedIn',title:'  Caso  studio Alfa ',rubric:'casi studio',angle:'Risultati in numeri'},
  {date:'2026-10-21',time:'25:00',channel:'Instagram',title:'Dietro le quinte'},
  {date:'2026-10-20',channel:'linkedin',title:'LANCIO'},
  {date:'2026-10-22',time:'09:30',channel:'LinkedIn',title:'Caso studio Alfa'},
  {date:'2026-10-10',channel:'LinkedIn',title:'Passato'},{date:'2026-02-30',channel:'LinkedIn',title:'Data finta'},
  {date:'2026-10-23',channel:'',title:'Senza canale'},null,'testo',{date:'2028-01-01',channel:'Blog',title:'Troppo lontano'}
 ])+'\n```';
 const r=pv.parsePlan(text,state,'2026-10-17');
 assert.deepEqual(r.items,[
  {date:'2026-10-21',time:'',channel:'Instagram',title:'Dietro le quinte',rubricId:'',angle:''},
  {date:'2026-10-22',time:'09:30',channel:'LinkedIn',title:'Caso studio Alfa',rubricId:'r1',angle:'Risultati in numeri'}]);
 assert.deepEqual(r.skipped,{invalid:4,past:2,duplicate:2,extra:0});
 assert.throws(()=>pv.parsePlan('Non posso aiutarti',state,'2026-10-17'),/non è leggibile/);
 assert.throws(()=>pv.parsePlan('{"a":1}',state,'2026-10-17'),/non è leggibile/);
 const many=Array.from({length:35},(_,i)=>({date:'2026-11-'+String(i%28+1).padStart(2,'0'),channel:'Blog',title:'Post '+i}));
 const m=pv.parsePlan(JSON.stringify(many),state,'2026-10-17');assert.equal(m.items.length,30);assert.equal(m.skipped.extra,5);
});

test('picked items become drafts of the current strategy, with rubric and the angle as starting text',()=>{
 const s=core.create({id:'p1',summary:'x'});core.fields.forEach(k=>{s.brief[k]='ok'});core.approveBrief(s);s.rubrics=[{id:'r1',name:'Casi studio'}];
 const [x]=pv.parsePlan('[{"date":"2026-10-22","time":"09:30","channel":"LinkedIn","title":"Caso","rubric":"Casi studio","angle":"Spunto"}]',s,'2026-10-17').items;
 const c=core.updateContent(s,{id:'n1',title:x.title,channel:x.channel,date:x.date,time:x.time,copy:'Spunto: '+x.angle,rubricId:x.rubricId});
 assert.equal(c.status,'draft');assert.equal(c.rubricId,'r1');assert.equal(c.strategyRevision,s.strategyRevision);assert.equal(s.planApproval,null);
});

test('PED page offers the proposal and wires it to the Social Media Manager',()=>{
 const html=fs.readFileSync('project-editorial.html','utf8'),js=fs.readFileSync('editorial-workspace.js','utf8');
 for(const id of ['proposePlan','planProposal','proposalList','acceptProposal','discardProposal'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.ok(js.includes("role:'social-media-manager'"));assert.ok(js.includes('pv.parsePlan(r.text,state,today)'));assert.ok(js.includes('confirm('));
});
