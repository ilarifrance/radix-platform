'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const ics=require('../sales/crm-ics-core.js');
const now=Date.parse('2026-10-17T08:00:00Z');
const data={companies:[{id:'c1',name:'Acme, S.p.A.'}],
 tasks:[{id:'t1',title:'Chiama; poi scrivi',due_at:'2026-10-18T09:00:00Z',status:'todo',company_id:'c1',assignee_id:7},
  {id:'t2',title:'Fatta',due_at:'2026-10-18T09:00:00Z',status:'done'},{id:'t3',title:'Senza data',status:'todo'},{id:'t4',title:'Altro',due_at:'2026-10-19T10:00:00Z',status:'doing',assignee_id:8}],
 interactions:[{id:'i1',kind:'meeting',title:'Demo',occurred_at:'2026-10-20T14:00:00Z',body:'riga1\nriga2',company_id:'c1'},
  {id:'i2',kind:'note',title:'Nota',occurred_at:'2026-10-20T14:00:00Z'},{id:'i3',kind:'call',title:'Vecchia',occurred_at:'2026-08-01T10:00:00Z'}],
 opportunities:[{id:'o1',title:'Rinnovo',expected_close:'2026-10-31',outcome:'open',owner_id:7,company_id:'c1'},{id:'o2',title:'Persa',expected_close:'2026-10-31',outcome:'lost'}]};

test('exports open tasks, recent meetings and calls, open closings',()=>{
 const ev=ics.events(data,{now});assert.deepEqual(ev.map(e=>e.uid).sort(),['close-o1','interaction-i1','task-t1','task-t4']);
});
test('owner filter keeps only that owner records, like the calendar view',()=>{
 assert.deepEqual(ics.events(data,{now,owner:'7'}).map(e=>e.uid).sort(),['close-o1','task-t1']);
});
test('builds a valid VCALENDAR with escaping, all-day closings and CRLF',()=>{
 const f=ics.build(data,{now,base:'https://x.test/radix-sales.html'});assert.equal(f.count,4);
 const t=f.text;assert.ok(t.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));assert.ok(t.endsWith('END:VCALENDAR\r\n'));
 assert.ok(!/[^\r]\n/.test(t),'only CRLF line breaks');
 assert.ok(t.includes('SUMMARY:Chiama\\; poi scrivi\r\n'),'semicolon escaped as \\;');assert.match(t,/DESCRIPTION:Acme\\, S\.p\.A\.\\nriga1\\nriga2/);
 assert.match(t,/UID:task-t1@radix-crm\r\nDTSTAMP:20261017T080000Z\r\nDTSTART:20261018T090000Z\r\nDTEND:20261018T100000Z/);
 assert.match(t,/DTSTART;VALUE=DATE:20261031\r\nDTEND;VALUE=DATE:20261101/);
 assert.match(t,/URL:https:\/\/x\.test\/radix-sales\.html#opportunities/);
 assert.equal((t.match(/BEGIN:VEVENT/g)||[]).length,4);
});
test('folds long lines at 75 octets without splitting characters',()=>{
 const line='SUMMARY:'+'è'.repeat(80);const f=ics.fold(line);const parts=f.split('\r\n');
 assert.ok(parts.length>1);for(const p of parts)assert.ok(Buffer.byteLength(p)<=75);
 assert.equal(parts.map((p,i)=>i?p.slice(1):p).join(''),line);
});
