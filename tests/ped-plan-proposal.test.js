'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const pv=require('../lib/ped-views.js'),core=require('../editorial-core.js');
const state={brief:{channels:'LinkedIn, Instagram',period:'Novembre',frequency:'LinkedIn 2/sett, Instagram 3/sett',goal:'Lead B2B',topics:'Casi studio'},
 rubrics:[{id:'r1',name:'Casi studio',cadence:'ogni martedì'}],contents:[{id:'c1',title:'Lancio',channel:'LinkedIn',date:'2026-10-20',status:'draft'}]};

test('plan prompt carries the strategy, today, the plan to avoid and the JSON format',()=>{
 const p=pv.planPrompt(state,'2026-10-17');
 assert.match(p,/a partire da oggi, 2026-10-17/);assert.match(p,/Frequenza per canale: LinkedIn 2\/sett/);assert.match(p,/Casi studio \(ogni martedì\)/);
 assert.match(p,/- 2026-10-20 · LinkedIn · Lancio/);assert.match(p,/solo con un array JSON/);assert.match(p,/al massimo 60 contenuti/);
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
 const many=Array.from({length:65},(_,i)=>({date:'2026-11-'+String(i%28+1).padStart(2,'0'),channel:'Blog',title:'Post '+i}));
 const m=pv.parsePlan(JSON.stringify(many),state,'2026-10-17');assert.equal(m.items.length,60);assert.equal(m.skipped.extra,5);
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
 assert.ok(js.includes("role:'social-media-manager'"));assert.ok(js.includes('pv.parsePlan(r.text,state,today)'));const body=js.slice(js.indexOf('async function proposePlan'),js.indexOf('function renderProposal'));assert.ok(body.indexOf('await askConfirm(')>0&&body.indexOf('await askConfirm(')<body.indexOf('rt.reply('),'the RADIX confirmation before the AI call');
});

test('the plan prompt carries the real weekdays of the next 8 weeks',()=>{
 const p=pv.planPrompt({brief:{}},'2026-10-17');
 assert.match(p,/\nsab 2026-10-17, dom 2026-10-18\nlun 2026-10-19, mar 2026-10-20, mer 2026-10-21/);
 assert.match(p,/mer 2026-10-28/);assert.match(p,/ven 2026-12-11/);assert.doesNotMatch(p,/2026-12-12/);
});

test('brief prompt uses only approved drafts and the project profile; parseBrief keeps known keys within limits',()=>{
 const labels={goal:'Obiettivo',frequency:'Frequenza'};
 const p=pv.briefPrompt(labels,{name:'FI',brief:{goal:'Richieste qualificate',facts:'+1M€'}},[
  {id:'step-1',role:'brand',roleName:'Stratega',status:'approved',output:'Posizionamento: consulente PMI',feedback:'ok'},
  {id:'step-2',role:'copy',status:'done',output:'BOZZA NON APPROVATA'}]);
 assert.match(p,/### Stratega/);assert.match(p,/Posizionamento: consulente PMI/);assert.doesNotMatch(p,/BOZZA NON APPROVATA/);
 assert.match(p,/- frequency: Frequenza/);assert.match(p,/Non inventare/);assert.match(p,/\+1M€/);
 const b=pv.parseBrief('Ecco: {"goal":"10 richieste","frequency":["LinkedIn 3/sett","Instagram 2/sett"],"extra":"x","kpis":{"a":1}}',labels,{goal:5});
 assert.deepEqual(b,{goal:'10 ri',frequency:'LinkedIn 3/sett\nInstagram 2/sett'});
 assert.throws(()=>pv.parseBrief('niente',labels),/non è leggibile/);
 assert.throws(()=>pv.parseBrief('{"other":"x"}',labels),/nessun campo/);
});

test('parseBrief also accepts the field labels as keys',()=>{
 assert.deepEqual(pv.parseBrief('{"Obiettivo":"A","frequency":"B"}',{goal:'Obiettivo',frequency:'Frequenza'}),{goal:'A',frequency:'B'});
});

test('cadence: posts per week per channel over the proposal span, to compare with the brief',()=>{
 const items=[['LinkedIn','2026-11-02'],['LinkedIn','2026-11-04'],['LinkedIn','2026-11-09'],['LinkedIn','2026-11-11'],['Instagram','2026-11-05'],['Newsletter','2026-11-15'],['X','bad']].map(([channel,date])=>({channel,date,title:'t'}));
 assert.deepEqual(pv.cadence(items),[{channel:'LinkedIn',count:4,perWeek:2},{channel:'Instagram',count:1,perWeek:0.5},{channel:'Newsletter',count:1,perWeek:0.5}]);
 assert.deepEqual(pv.cadence([{channel:'LinkedIn',date:'2026-11-02'}]),[{channel:'LinkedIn',count:1,perWeek:1}],'a short proposal counts as one week');
 assert.deepEqual(pv.cadence([]),[]);
});
