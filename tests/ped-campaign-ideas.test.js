'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),pv=require('../lib/ped-views.js');
const state={brief:{goal:'Più contatti B2B',channels:'LinkedIn, Newsletter',period:'Q4'},campaigns:[{id:'c0',name:'Lancio autunno'}],contents:[]};

test('campaign ideas prompt carries the strategy, existing campaigns and a real calendar',()=>{
 const p=pv.campaignIdeasPrompt(state,'2026-10-19');
 assert.match(p,/3 campagne/);assert.match(p,/Più contatti B2B/);assert.match(p,/Lancio autunno/);assert.match(p,/lun 2026-10-19/);assert.match(p,/Non inventare numeri/);
});

test('parseCampaignIdeas keeps at most 3 valid campaigns',()=>{
 const raw='Ecco:\n```json\n'+JSON.stringify([
  {name:'Casi pratici',start:'2026-10-26',end:'2026-11-22',goal:'Mostrare il metodo',channels:'LinkedIn'},
  {name:'lancio autunno',start:'2026-10-26',end:'2026-11-01'},
  {name:'Passata',start:'2026-10-01',end:'2026-10-30'},
  {name:'Al contrario',start:'2026-11-10',end:'2026-11-01'},
  {name:'Troppo lontana',start:'2026-12-01',end:'2027-03-01'},
  {name:'Data finta',start:'2026-02-30',end:'2026-03-05'},
  {name:'Newsletter mensile',start:'2026-11-01',end:'2026-11-30',goal:'Una newsletter',channels:'Newsletter'},
  {name:'Webinar',start:'2026-11-15',end:'2026-12-15'},
  {name:'Quarta',start:'2026-11-15',end:'2026-12-15'}])+'\n```';
 const out=pv.parseCampaignIdeas(raw,state,'2026-10-19');
 assert.deepEqual(out.map(x=>x.name),['Casi pratici','Newsletter mensile','Webinar']);
 assert.equal(out[0].channels,'LinkedIn');assert.equal(out[2].goal,'');
});

test('parseCampaignIdeas rejects unreadable answers',()=>{
 assert.throws(()=>pv.parseCampaignIdeas('nessuna idea',state,'2026-10-19'),/non sono leggibili/);
});
