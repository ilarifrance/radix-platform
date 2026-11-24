'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {predict}=require('../sales/analytics-view.js');
const D=864e5,NOW=Date.parse('2026-10-17T12:00:00Z'),iso=ms=>new Date(ms).toISOString();
// History: small, quick, followed-up deals win; big, slow, silent deals lose.
const closed=[];const inter=[];
for(let i=0;i<6;i++){const c='w'+i,end=NOW-(40+i)*D;closed.push({id:'W'+i,title:'Vinta '+i,outcome:'won',amount_cents:100000,contact_id:c,created_at:iso(end-20*D),closed_at:iso(end)});inter.push({contact_id:c,occurred_at:iso(end-5*D)})}
for(let i=0;i<5;i++){closed.push({id:'L'+i,title:'Persa '+i,outcome:'lost',amount_cents:900000,contact_id:'l'+i,created_at:iso(NOW-200*D),closed_at:iso(NOW-(60+i)*D)})}
const stages=[{id:'s1',probability:50}];
const open=[{id:'A',title:'Piccola seguita',outcome:'open',amount_cents:100000,contact_id:'a',stage_id:'s1',created_at:iso(NOW-10*D)},
 {id:'B',title:'Grande ferma',outcome:'open',amount_cents:900000,contact_id:'b',stage_id:'s1',probability:80,created_at:iso(NOW-150*D)},
 {id:'C',title:'Senza data',outcome:'open',amount_cents:5,stage_id:'s1'}];
inter.push({contact_id:'a',occurred_at:iso(NOW-3*D)});

test('predict learns from closed deals and explains each open deal',()=>{
 const r=predict([...closed,...open],inter,stages,NOW);
 assert.equal(r.ready,true);assert.equal(r.closed,11);assert.equal(r.baseRate,55);assert.equal(r.cycleDays,20);
 const a=r.items.find(x=>x.id==='A'),b=r.items.find(x=>x.id==='B');
 assert.ok(a.histP>85,'similar to the won deals: '+a.histP);assert.ok(b.histP<15,'similar to the lost deals: '+b.histP);
 assert.equal(a.stageP,50);assert.equal(b.stageP,80,'own probability wins over the stage');
 assert.deepEqual(b.why,['importo sopra la media','aperta da più del ciclo tipico','nessun contatto negli ultimi 30 giorni']);
 assert.equal(r.items[0].id,'B','largest gap between stage and history first');assert.ok(!r.items.some(x=>x.id==='C'),'no creation date: skipped');
 assert.equal(r.expected,Math.round(1000*a.histP+9000*b.histP));
});

test('predict waits for enough history with both outcomes',()=>{
 assert.deepEqual(predict(closed.slice(0,7),[],stages,NOW),{ready:false,closed:7,won:6,min:8,baseRate:null,cycleDays:null,expected:0,items:[]});
 assert.equal(predict(closed.filter(o=>o.outcome==='won').concat(closed.filter(o=>o.outcome==='won').map(o=>({...o,id:o.id+'b'}))),[],stages,NOW).ready,false,'only wins');
 assert.equal(predict(null,null,null,NOW).ready,false);
});
