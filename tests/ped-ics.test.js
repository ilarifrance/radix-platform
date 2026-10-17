'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../editorial-core.js');
const state={projectId:'p1',timezone:'Europe/Rome',contents:[
 {id:'a',channel:'Instagram',title:'Lancio; parte 1',date:'2026-10-20',time:'18:30',status:'review',copy:'Riga\nDue'},
 {id:'w',channel:'Blog',title:'Inverno',date:'2026-12-01',time:'09:00',status:'approved'},
 {id:'b',channel:'LinkedIn',title:'Senza ora',date:'2026-10-21',status:'draft'},{id:'c',title:'Senza data',status:'draft'}]};

test('one event per dated content, at wall-clock time in the PED time zone',()=>{
 const f=core.calendarIcs(state,{now:Date.parse('2026-10-17T00:00:00Z'),name:'Acme',base:'https://x.test/project-editorial.html?project=p1#ped'}),t=f.text;
 assert.equal(f.count,3);assert.equal((t.match(/BEGIN:VEVENT/g)||[]).length,3);
 assert.match(t,/UID:ped-p1-a@radix-ped\r\nDTSTAMP:20261017T000000Z\r\nDTSTART:20261020T163000Z\r\nDTEND:20261020T170000Z/);// CEST
 assert.match(t,/DTSTART:20261201T080000Z/);// CET
 assert.match(t,/DTSTART;VALUE=DATE:20261021\r\nDTEND;VALUE=DATE:20261022/);
 assert.match(t,/SUMMARY:Instagram · Lancio\\; parte 1\r\n/);assert.match(t,/DESCRIPTION:Stato: In revisione\\n\\nRiga\\nDue/);
 assert.match(t,/X-WR-CALNAME:PED Acme/);assert.match(t,/URL:https:\/\/x\.test\/project-editorial\.html\?project=p1#ped/);
 assert.ok(t.endsWith('END:VCALENDAR\r\n'));assert.ok(!/[^\r]\n/.test(t));
});
test('folds long lines at 75 octets without splitting characters',()=>{
 const line='DESCRIPTION:'+'à'.repeat(90),parts=core.icsFold(line).split('\r\n');
 for(const p of parts)assert.ok(Buffer.byteLength(p)<=75);assert.equal(parts.map((p,i)=>i?p.slice(1):p).join(''),line);
});
test('an empty plan exports nothing',()=>{assert.equal(core.calendarIcs({contents:[]}).count,0)});
