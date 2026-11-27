'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../lib/booking/slots');
const hours={"2":[["09:00","13:00"],["14:30","19:00"]],"6":[["09:00","12:00"]]};
const svc={id:'s1',duration_min:30,buffer_min:0,staff_ids:[]};
const staff=[{id:'a'},{id:'b'}];
const base={date:'2026-11-24',tz:'Europe/Rome',step_min:30,min_notice_min:0,now:'2026-11-01T00:00:00Z',service:svc,hours,staff,closures:[],busy:[]};

test('Rome offsets follow summer and winter time, and local times round-trip',()=>{
 assert.equal(S.offsetAt('Europe/Rome',Date.parse('2026-01-15T12:00:00Z')),60);
 assert.equal(S.offsetAt('Europe/Rome',Date.parse('2026-07-15T12:00:00Z')),120);
 assert.equal(new Date(S.localToUtc('2026-11-24',9*60,'Europe/Rome')).toISOString(),'2026-11-24T08:00:00.000Z');
 assert.equal(new Date(S.localToUtc('2026-06-02',9*60,'Europe/Rome')).toISOString(),'2026-06-02T07:00:00.000Z');
 // 29 March 2026: 02:30 does not exist in Rome and moves forward to 03:30 (01:30 UTC).
 assert.equal(new Date(S.localToUtc('2026-03-29',150,'Europe/Rome')).toISOString(),'2026-03-29T01:30:00.000Z');
 assert.deepEqual(S.utcToLocal('2026-11-24T08:00:00Z','Europe/Rome'),{date:'2026-11-24',time:'09:00'});
 assert.equal(S.weekday('2026-11-24'),2);assert.equal(S.weekday('2026-11-29'),7);
});

test('a free Tuesday offers every step inside both opening bands, with both staff members',()=>{
 const r=S.freeSlots(base);
 assert.equal(r[0].time,'09:00');assert.equal(r.at(-1).time,'18:30');
 assert.ok(!r.some(x=>x.time==='13:00'||x.time==='14:00'),'lunch break stays closed');
 assert.equal(r.length,8+9);assert.deepEqual(r[0].staff_ids,['a','b']);
 assert.equal(r[0].starts_at,'2026-11-24T08:00:00.000Z');assert.equal(r[0].ends_at,'2026-11-24T08:30:00.000Z');
});

test('busy staff, buffers, notice, closures and long services remove the right slots',()=>{
 const busy=[{staff_id:'a',starts_at:'2026-11-24T08:00:00Z',blocks_until:'2026-11-24T09:00:00Z'}];
 let r=S.freeSlots({...base,busy});
 assert.deepEqual(r.find(x=>x.time==='09:00').staff_ids,['b']);
 assert.deepEqual(r.find(x=>x.time==='10:00').staff_ids,['a','b']);
 r=S.freeSlots({...base,busy,staff_id:'a'});assert.equal(r[0].time,'10:00');
 // A 90-minute colour must end by 13:00 and by 19:00.
 r=S.freeSlots({...base,service:{...svc,duration_min:90}});
 assert.equal(r.filter(x=>x.time<'13:00').at(-1).time,'11:30');assert.equal(r.at(-1).time,'17:30');
 // A 15-minute buffer after a 30-minute service: the next booking cannot start inside it.
 r=S.freeSlots({...base,staff:[{id:'a'}],service:{...svc,buffer_min:15},busy:[{staff_id:'a',starts_at:'2026-11-24T09:00:00Z',blocks_until:'2026-11-24T09:45:00Z'}]});
 assert.ok(!r.some(x=>x.time==='09:30'||x.time==='10:00'));assert.ok(r.some(x=>x.time==='11:00'));
 assert.ok(!r.some(x=>x.time==='09:30'),'a new slot whose buffer would overlap the next booking is refused');
 // Notice: at 10:10 local with 60 minutes notice, the first slot is 11:30 (11:10 rounded up to the step).
 r=S.freeSlots({...base,now:'2026-11-24T09:10:00Z',min_notice_min:60});assert.equal(r[0].time,'11:30');
 assert.equal(S.freeSlots({...base,closures:[{from_date:'2026-11-23',to_date:'2026-11-25'}]}).length,0);
 assert.deepEqual(S.freeSlots({...base,closures:[{from_date:'2026-11-24',staff_id:'b'}]})[0].staff_ids,['a']);
 assert.equal(S.freeSlots({...base,date:'2026-11-23'}).length,0,'Monday closed');
 assert.equal(S.freeSlots({...base,service:{...svc,staff_ids:['b']}})[0].staff_ids.join(),'b');
 assert.equal(S.freeSlots({...base,staff:[{id:'a',hours:{"2":[["15:00","16:00"]]}}]}).length,2,'own hours replace the shop hours');
 assert.equal(S.freeSlots({...base,staff:[{id:'a',active:false}]}).length,0);
});

test('hours validation, staff choice and agenda gaps',()=>{
 assert.equal(S.checkHours(hours),null);assert.equal(S.checkHours(S.DEFAULT_HOURS),null);
 assert.match(S.checkHours({"8":[]}),/Giorno/);assert.match(S.checkHours({"1":[["10:00","09:00"]]}),/dopo/);
 assert.match(S.checkHours({"1":[["09:00","12:00"],["11:00","13:00"]]}),/sovrappongono/);assert.match(S.checkHours({"1":[["9:00","12:00"]]}),/HH:MM/);
 const busy=[{staff_id:'a',starts_at:'2026-11-24T08:00:00Z',blocks_until:'2026-11-24T09:00:00Z'}];
 assert.equal(S.pickStaff(['a','b'],staff,busy),'b');assert.equal(S.pickStaff(['a','b'],staff,[]),'a');
 const g=S.gaps({date:'2026-11-24',tz:'Europe/Rome',hours,member:{id:'a'},busy,closures:[]},15);
 assert.deepEqual(g.map(x=>x.from+'-'+x.to),['10:00-13:00','14:30-19:00']);assert.equal(g[0].minutes,180);
});
