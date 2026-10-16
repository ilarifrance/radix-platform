'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {forecast,isOpen}=require('../sales/analytics-view.js');
const pipe=require('../sales/pipeline-premium.js');
const stages=[{id:'s1',process_id:'p',title:'Qualifica',probability:20},{id:'s2',process_id:'p',title:'Proposta',probability:null,task_title:'Inviare offerta'},{id:'s3',process_id:'q',title:'Altro processo'}];
test('forecast weights open deals by own probability, else the stage default',()=>{
 const r=forecast([
  {id:'a',stage_id:'s1',amount_cents:10000},                       // stage 20% -> 2000
  {id:'b',stage_id:'s1',amount_cents:5000,probability:60},         // own 60% -> 3000
  {id:'c',stage_id:'s2',amount_cents:7000},                        // no probability anywhere
  {id:'d',stage_id:'s2',amount_cents:4000,probability:0,outcome:'open'}, // explicit 0 counts as known
  {id:'e',stage_id:'s1',amount_cents:900,outcome:'won'},
  {id:'f',stage_id:'s1',amount_cents:100,outcome:'won'},
  {id:'g',stage_id:'s2',amount_cents:300,outcome:'lost',lost_reason:'Prezzo'},
 ],stages);
 assert.deepEqual(r.open,{count:4,total:26000,weighted:5000,withProbability:3,withoutProbability:1});
 assert.deepEqual(r.won,{count:2,total:1000});assert.deepEqual(r.lost,{count:1,total:300});
 assert.equal(r.closed,3);assert.equal(r.winRate,2/3);
});
test('forecast reports no win rate without closed deals and tolerates bad rows',()=>{
 const r=forecast([null,{id:'x',stage_id:'zz',amount_cents:null,probability:150},{id:'y',stage_id:'s1',amount_cents:'2500'}],stages);
 assert.equal(r.winRate,null);assert.equal(r.closed,0);assert.deepEqual(r.lostReasons,[]);
 assert.equal(r.open.count,2);assert.equal(r.open.withoutProbability,1);assert.equal(r.open.weighted,500);
 assert.equal(forecast([],[]).open.weighted,0);
});
test('top three lost reasons, blank reason grouped as not indicated',()=>{
 const lost=(lost_reason)=>({outcome:'lost',lost_reason,amount_cents:1});
 const r=forecast([lost('Prezzo'),lost(' Prezzo '),lost('Tempi'),lost('Tempi'),lost('Concorrente'),lost(null),lost(''),lost(''),lost('Budget')],[]);
 assert.deepEqual(r.lostReasons,[{reason:'Motivo non indicato',count:3},{reason:'Prezzo',count:2},{reason:'Tempi',count:2}]);
 assert.equal(r.winRate,0);
});
test('only undefined or open outcomes are open deals',()=>{
 assert.ok(isOpen({}));assert.ok(isOpen({outcome:'open'}));assert.ok(!isOpen({outcome:'won'}));assert.ok(!isOpen({outcome:'lost'}));assert.ok(!isOpen(null));
 assert.ok(pipe.isOpen({outcome:null}));assert.ok(!pipe.isOpen({outcome:'lost'}));
 assert.deepEqual(pipe.outcomeCounts([{},{outcome:'won'},{outcome:'lost'},{outcome:'lost'},null]),{open:1,won:1,lost:2});
});
test('pipeline moves stay within the deal process and skip the current stage',()=>{
 assert.deepEqual(pipe.moveTargets({id:'a',process_id:'p',stage_id:'s1'},stages).map(s=>s.id),['s2']);
 assert.equal(pipe.moveConfirmation({title:'Rinnovo'},stages[0]),'Spostare «Rinnovo» in «Qualifica»?');
 assert.equal(pipe.moveConfirmation({title:'Rinnovo'},stages[1]),'Spostare «Rinnovo» in «Proposta»? Verrà creata l’attività «Inviare offerta».');
});
test('pipeline posts the idempotent transition and marks drop targets',()=>{
 const src=fs.readFileSync('sales/pipeline-premium.js','utf8'),css=fs.readFileSync('sales/pipeline-premium.css','utf8');
 for(const t of ["action:'transition'","entity:'opportunities'","'x-radix-sales':'1'","credentials:'same-origin'",'crypto.randomUUID()','drop-target','draggable=true','Sposta in…','r.status===409'])assert.ok(src.includes(t),t);
 assert.ok(css.includes('.drop-target'));
 const an=fs.readFileSync('sales/analytics-view.js','utf8');for(const t of ["panel('Previsione'",'Pipeline aperta','Tasso di vittoria','Nessuna trattativa chiusa'])assert.ok(an.includes(t),t);
});
