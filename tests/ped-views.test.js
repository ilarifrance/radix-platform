'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const pv=require('../lib/ped-views.js'),core=require('../editorial-core.js');

test('channel slugs match the known channels and fall back safely',()=>{
 assert.equal(pv.channelSlug('LinkedIn'),'linkedin');assert.equal(pv.channelSlug(' instagram reel'),'instagram');
 assert.equal(pv.channelSlug('Podcast Spotify'),'podcast-spotify');assert.equal(pv.channelSlug(''),'altro');
 assert.equal(pv.channelSlug('Città<script>'),'citta-script');
});

test('the board groups contents by state and only the approved revision counts as queued',()=>{
 const items=[{id:'a',status:'draft',date:'2026-11-03'},{id:'b',status:'review',date:'2026-11-01'},{id:'c',status:'approved',revision:2,date:'2026-11-02'},
  {id:'d',status:'approved',revision:3,publication:{revision:3},date:'2026-11-04'},{id:'e',status:'approved',revision:4,publication:{revision:3},date:'2026-11-05'},{id:'f',status:'draft',revision:5,publication:{revision:5}}];
 const cols=Object.fromEntries(pv.board(items).map(c=>[c.id,c.items.map(i=>i.id)]));
 assert.deepEqual(cols,{draft:['a','f'],review:['b'],approved:['c','e'],queued:['d']});
});

test('a new version of a queued content leaves the queue and needs a new approval',()=>{
 const s=core.create({id:'p1',summary:'Obiettivo'});s.briefApproved=true;s.strategyRevision=1;
 const c=core.updateContent(s,{id:'x',title:'Post',channel:'LinkedIn',date:'2026-11-02',copy:'Testo'});core.review(s,'x','request');core.review(s,'x','approve');
 s.contents[0].publication={service:'buffer',revision:s.contents[0].revision};assert.equal(pv.isQueued(s.contents[0]),true);
 core.updateContent(s,{id:'x',title:'Post',channel:'LinkedIn',date:'2026-11-02',copy:'Testo nuovo'});
 assert.equal(pv.isQueued(s.contents[0]),false);assert.equal(pv.columnOf(s.contents[0]),'draft');assert.equal(c.revision,1);
});

test('brief channels come first in the channel suggestions',()=>{
 const list=pv.channelsFromBrief({channels:'Instagram, newsletter mensile; Podcast'});
 assert.deepEqual(list.slice(0,3),['Instagram','Newsletter','Podcast']);assert.ok(list.includes('LinkedIn'));
 assert.equal(new Set(list).size,list.length);
});

test('the copywriter prompt carries the strategy and the content, not empty fields',()=>{
 const p=pv.copyPrompt({goal:'Più lead',audience:'PMI',voice:'Diretto',messages:'',topics:'Casi studio'},{title:'Caso Acme',channel:'LinkedIn',date:'2026-11-02',time:'09:30',copy:''});
 assert.match(p,/Canale: LinkedIn/);assert.match(p,/Data prevista: 2026-11-02 alle 09:30/);assert.match(p,/Pubblico: PMI/);assert.match(p,/Messaggi chiave: —/);
 assert.doesNotMatch(p,/Bozza attuale/);
 assert.match(pv.copyPrompt({}, {title:'T',channel:'X',copy:'vecchio testo'}),/Bozza attuale da migliorare:\nvecchio testo/);
});

test('plan analytics: weeks, channels and what needs attention, in the plan time zone',()=>{
 const s={timezone:'Europe/Rome',contents:[
  {id:'a',title:'A',channel:'LinkedIn',date:'2026-10-14',status:'approved',revision:2},
  {id:'b',title:'B',channel:'LinkedIn',date:'2026-10-20',status:'draft',revision:1},
  {id:'c',title:'C',channel:'Instagram',date:'2026-10-22',status:'approved',revision:3,publication:{revision:3}},
  {id:'d',title:'D',channel:'Instagram',date:'',status:'review',revision:1},
  {id:'e',title:'E',channel:'Blog',date:'2026-11-10',status:'approved',revision:1}]};
 const a=pv.analytics(s,{today:'2026-10-16',pubs:[{content_id:'e',revision:1,status:'failed'},{content_id:'c',revision:3,status:'queued'}]});
 assert.deepEqual(a.byStatus,{draft:1,review:1,approved:2,queued:1});
 assert.equal(a.weeks[0].start,'2026-10-12');assert.deepEqual(a.weeks.slice(0,2).map(w=>[w.count,w.ready]),[[1,1],[2,1]]);
 assert.deepEqual(a.attention.map(x=>x.id+':'+x.kind),['e:failed','a:late','b:soon','d:undated']);
 assert.equal(a.kpis.approvedShare,60);assert.equal(a.kpis.next14,2);assert.equal(a.kpis.next14Ready,50);assert.equal(a.kpis.late,1);
 assert.deepEqual(a.channels.map(c=>c.channel),['Instagram','LinkedIn','Blog']);assert.deepEqual(a.publications,{queued:1,failed:1,sending:0});
 // late night in Rome is already the next day there
 assert.equal(pv.analytics({timezone:'Europe/Rome',contents:[]},{now:Date.parse('2026-10-16T22:30:00Z')}).today,'2026-10-17');
 assert.equal(pv.analytics({contents:[]},{today:'2026-10-16'}).kpis.approvedShare,null);
});
