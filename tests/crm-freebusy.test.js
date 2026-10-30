'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const fb=require('../sales/crm-freebusy-core.js');
const fixture=n=>fs.readFileSync(path.join(__dirname,'fixtures','calendars',n),'utf8');
const Z=s=>Date.parse(s);
const iso=ms=>new Date(ms).toISOString().replace('.000Z','Z');
const list=b=>b.map(x=>iso(x.start)+' '+iso(x.end)+(x.summary!==undefined?' '+x.summary:''));
// Monday 26 October 2026 (the day after the switch to winter time) → Saturday 14 November, Europe/Rome.
const FROM=Z('2026-10-25T23:00:00Z'),TO=Z('2026-11-13T23:00:00Z');

test('Outlook / Microsoft 365 export: Windows zone, weekly series with EXDATE and moved instance, monthly 1TH, free/cancelled skipped',()=>{
 const t=fixture('outlook-office365.ics');assert.ok(t.includes('\r\n')&&/\r\n [0-9A-F]/.test(t),'fixture is CRLF with folded UIDs');
 const cal=fb.parse(t);assert.equal(cal.name,'Calendario');assert.equal(cal.events.length,10);
 assert.equal(cal.events[0].summary,'Riunione di reparto');assert.equal(cal.events[0].zone,'Europe/Berlin','W. Europe Standard Time');
 assert.ok(!/\s/.test(cal.events[0].uid)&&cal.events[0].uid.endsWith('0010000000A1B2C3D4E5F60718293A4B5C6D7E8F90'),'folded UID is unfolded');
 assert.deepEqual(list(fb.busy(t,{from:FROM,to:TO,details:true})),[
  '2026-10-26T08:30:00Z 2026-10-26T09:00:00Z Stand-up commerciale',// 09:30 CET, after the DST change
  '2026-10-26T09:00:00Z 2026-10-26T10:00:00Z Riunione di reparto',
  // 28/10 stand-up: EXDATE. 27/10 «Annullato»: STATUS:CANCELLED. 29/10 private reminder: BUSYSTATUS FREE.
  '2026-10-28T15:00:00Z 2026-10-28T16:00:00Z Forse: webinar',// tentative still blocks the slot
  '2026-10-30T07:00:00Z 2026-10-30T08:15:00Z Volo Milano-Roma',// TZID=UTC
  // 02/11 «Ognissanti» all-day FREE: not busy. The 09:30 stand-up moved to 14:00 (RECURRENCE-ID).
  '2026-11-02T13:00:00Z 2026-11-02T13:30:00Z Stand-up commerciale (spostato)',
  '2026-11-04T08:30:00Z 2026-11-04T09:00:00Z Stand-up commerciale',
  '2026-11-05T13:30:00Z 2026-11-05T15:30:00Z ',// «Comitato direttivo», CLASS:PRIVATE: no title even with details
  '2026-11-05T23:00:00Z 2026-11-06T23:00:00Z Ferie',// all-day OOF, local midnight to midnight
  '2026-11-09T08:30:00Z 2026-11-09T09:00:00Z Stand-up commerciale',
  '2026-11-11T08:30:00Z 2026-11-11T09:00:00Z Stand-up commerciale']);
 // Without details: times only.
 assert.ok(fb.busy(t,{from:FROM,to:TO}).every(b=>!('summary' in b)));
 // UNTIL=20261116T083000Z keeps the 16/11 stand-up (09:30 CET = 08:30Z) and stops there.
 const nov=fb.busy(t,{from:Z('2026-11-15T00:00:00Z'),to:Z('2026-12-31T00:00:00Z'),details:true}).filter(b=>/Stand-up/.test(b.summary));
 assert.deepEqual(list(nov).map(s=>s.slice(0,20)),['2026-11-16T08:30:00Z']);
 // COUNT=3 of the first Thursday: 1 Oct, 5 Nov, 3 Dec; nothing in January.
 const com=fb.busy(t,{from:Z('2026-09-01T00:00:00Z'),to:Z('2027-03-01T00:00:00Z')}).filter(b=>b.end-b.start===2*36e5);
 assert.deepEqual(com.map(b=>iso(b.start)),['2026-10-01T12:30:00Z','2026-11-05T13:30:00Z','2026-12-03T13:30:00Z']);
});

test('Google Calendar export: X-WR-TIMEZONE, weekly TU,TH across DST, EXDATE, moved and cancelled instances, all-day, DURATION, COUNT',()=>{
 const t=fixture('google-personale.ics');const cal=fb.parse(t);assert.equal(cal.name,'Francesco Personale');assert.equal(cal.zone,'Europe/Rome');
 const dent=cal.events.find(e=>e.summary==='Dentista');assert.equal(dent.location,'Studio Rossi, Milano','escaped comma');
 assert.deepEqual(list(fb.busy(t,{from:FROM,to:TO,details:true})),[
  '2026-10-26T17:30:00Z 2026-10-26T19:00:00Z Corso di inglese',// DURATION:PT1H30M, COUNT=3
  '2026-10-27T07:00:00Z 2026-10-27T08:00:00Z Palestra',// 08:00 local: 06:00Z before the change, 07:00Z after
  '2026-10-27T16:30:00Z 2026-10-27T17:30:00Z Dentista',
  '2026-10-27T17:30:00Z 2026-10-27T19:00:00Z Corso di inglese',
  '2026-10-28T17:30:00Z 2026-10-28T19:00:00Z Corso di inglese',
  // 29/10 Palestra: EXDATE. 01/11 birthday: TRANSP:TRANSPARENT.
  '2026-11-03T11:00:00Z 2026-11-03T12:00:00Z Palestra (pausa pranzo)',// RECURRENCE-ID override
  // 05/11 Palestra: the override is STATUS:CANCELLED → the instance disappears.
  '2026-11-08T23:00:00Z 2026-11-10T23:00:00Z Viaggio a Torino',// two all-day dates (DTEND exclusive)
  '2026-11-10T07:00:00Z 2026-11-10T08:00:00Z Palestra',
  '2026-11-12T07:00:00Z 2026-11-12T08:00:00Z Palestra']);
 const before=fb.busy(t,{from:Z('2026-10-19T22:00:00Z'),to:Z('2026-10-23T22:00:00Z'),details:true}).filter(b=>b.summary==='Palestra');
 assert.deepEqual(before.map(b=>iso(b.start)),['2026-10-20T06:00:00Z','2026-10-22T06:00:00Z']);
 // Monthly BYMONTHDAY=15 with UNTIL=20261215T115959Z: Sep, Oct, Nov; 15 Dec at 13:00 CET (12:00Z) is after UNTIL.
 const lunch=fb.busy(t,{from:Z('2026-09-01T00:00:00Z'),to:Z('2027-02-01T00:00:00Z'),details:true}).filter(b=>/Pranzo/.test(b.summary));
 assert.deepEqual(lunch.map(b=>iso(b.start)),['2026-09-15T11:00:00Z','2026-10-15T11:00:00Z','2026-11-15T12:00:00Z']);
});

test('Outlook.com labels as TZID and a zone known only from its VTIMEZONE block',()=>{
 const t=fixture('outlook-live.ics');
 assert.deepEqual(list(fb.busy(t,{from:Z('2026-07-01T00:00:00Z'),to:TO})),['2026-07-15T16:30:00Z 2026-07-15T17:30:00Z','2026-10-27T19:00:00Z 2026-10-27T21:00:00Z','2026-10-28T17:30:00Z 2026-10-28T18:30:00Z']);
 assert.equal(fb.resolveZone('(UTC+01:00) Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna',null,'UTC'),'Europe/Rome');
 assert.equal(fb.resolveZone('W. Europe Standard Time',null,'UTC'),'Europe/Berlin');
 assert.equal(fb.resolveZone('/mozilla.org/20050126_1/Europe/Rome',null,'UTC'),'Europe/Rome');
 assert.equal(fb.resolveZone('Nessuna idea',null,'Europe/Rome'),'Europe/Rome','unknown: the fallback zone');
 const fixed=fb.resolveZone('(UTC+05:30) Chennai, Kolkata, Mumbai, New Delhi',null,'UTC');assert.equal(typeof fixed,'object');
 for(const [win,iana] of Object.entries(fb.WINDOWS))assert.doesNotThrow(()=>new Intl.DateTimeFormat('en',{timeZone:iana}),win+' → '+iana);
});

test('parser details: line folding, escapes, floating times, DATE ranges, DURATION, RRULE edge cases',()=>{
 const ics=['BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VEVENT','UID:a','SUMMARY:Uno\\, due\\; tre\\\\ \\n','  quattro','DTSTART:20261026T100000','DURATION:PT45M','END:VEVENT',
  'BEGIN:VEVENT','UID:b','DTSTART:20261031T230000Z','DTEND:20261101T003000Z','RRULE:FREQ=DAILY;INTERVAL=2;COUNT=2','END:VEVENT',
  'BEGIN:VEVENT','UID:c','DTSTART;VALUE=DATE:20261029','RRULE:FREQ=WEEKLY;BYDAY=TH;UNTIL=20261112','EXDATE;VALUE=DATE:20261105','END:VEVENT',
  'BEGIN:VEVENT','UID:d','DTSTART;TZID=Europe/Rome:20261130T090000','DTEND;TZID=Europe/Rome:20261130T100000','RRULE:FREQ=MONTHLY;BYDAY=-1MO;COUNT=2','END:VEVENT',
  'BEGIN:VEVENT','UID:e','DTSTART;TZID=Europe/Rome:20260131T090000','DTEND;TZID=Europe/Rome:20260131T093000','RRULE:FREQ=MONTHLY','END:VEVENT',
  'BEGIN:VEVENT','UID:f','DTSTART;TZID=Europe/Rome:20261026T120000','END:VEVENT',
  'BEGIN:VEVENT','UID:g','DTSTART;TZID=Europe/Rome:20261026T090000','DTEND;TZID=Europe/Rome:20261026T091500','RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR;WKST=SU','END:VEVENT',
  'END:VCALENDAR'].join('\n');// LF only: tolerated
 const cal=fb.parse(ics);assert.equal(cal.events[0].summary,'Uno, due; tre\\ \n quattro');
 assert.equal(cal.events[0].start,Z('2026-10-26T09:00:00Z'),'floating time: Europe/Rome');assert.equal(cal.events[0].end-cal.events[0].start,45*6e4);
 const b=fb.busy(ics,{from:Z('2026-10-26T00:00:00Z'),to:Z('2027-04-01T00:00:00Z')});
 const by=uid=>fb.expand(cal.events.find(e=>e.uid===uid),Z('2026-01-01T00:00:00Z'),Z('2027-04-01T00:00:00Z')).map(x=>iso(x.start));
 assert.deepEqual(by('b'),['2026-10-31T23:00:00Z','2026-11-02T23:00:00Z']);
 assert.deepEqual(by('c'),['2026-10-28T23:00:00Z','2026-11-11T23:00:00Z'],'UNTIL as a DATE is inclusive; EXDATE as a DATE');
 assert.deepEqual(by('d'),['2026-11-30T08:00:00Z','2026-12-28T08:00:00Z'],'last Monday');
 assert.deepEqual(by('e').slice(0,4),['2026-01-31T08:00:00Z','2026-03-31T07:00:00Z','2026-05-31T07:00:00Z','2026-07-31T07:00:00Z'],'months without a 31st are skipped');
 assert.deepEqual(by('f'),['2026-10-26T11:00:00Z'],'no DTEND: zero length…');assert.ok(!b.some(x=>x.start===Z('2026-10-26T11:00:00Z')),'…and never busy');
 assert.deepEqual(by('g').slice(0,4),['2026-10-26T08:00:00Z','2026-10-30T08:00:00Z','2026-11-09T08:00:00Z','2026-11-13T08:00:00Z'],'every other week');
 assert.equal(fb.duration('P1W'),7*864e5);assert.equal(fb.duration('PT1H30M'),5400e3);assert.equal(fb.duration('P1DT2H'),26*36e5);assert.equal(fb.duration('P'),null);assert.equal(fb.duration('nope'),null);
 assert.deepEqual(fb.parse('').events,[]);assert.deepEqual(fb.busy('garbage',{from:0,to:1}),[]);assert.deepEqual(fb.busy(ics,{from:5,to:1}),[]);
 // A daily series started years ago still expands quickly and correctly today.
 const old='BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:o\r\nDTSTART;TZID=Europe/Rome:20100104T080000\r\nDTEND;TZID=Europe/Rome:20100104T083000\r\nRRULE:FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
 const t0=Date.now();const ob=fb.busy(old,{from:FROM,to:FROM+7*864e5});assert.ok(Date.now()-t0<2000);assert.deepEqual(ob.map(x=>iso(x.start)),['2026-10-26T07:00:00Z','2026-10-27T07:00:00Z','2026-10-28T07:00:00Z','2026-10-29T07:00:00Z','2026-10-30T07:00:00Z']);
});

test('zoned(): DST gap and overlap in Europe/Rome',()=>{
 assert.equal(fb.zoned(2026,3,29,2,30,0,'Europe/Rome'),Z('2026-03-29T01:30:00Z'),'02:30 does not exist: 03:30 CEST');
 assert.equal(fb.zoned(2026,10,25,2,30,0,'Europe/Rome'),Z('2026-10-25T00:30:00Z'),'02:30 twice: the first one (CEST)');
 assert.equal(fb.zoned(2026,7,1,9,0,0,'Europe/Rome'),Z('2026-07-01T07:00:00Z'));assert.equal(fb.zoned(2026,12,1,9,0,0,'Europe/Rome'),Z('2026-12-01T08:00:00Z'));
 assert.equal(fb.zoned(2026,12,1,9,0,0,'America/New_York'),Z('2026-12-01T14:00:00Z'));
});

test('merge(): several calendars and the CRM in one list without overlaps',()=>{
 assert.deepEqual(fb.merge([{start:10,end:20},{start:30,end:40}],[[15,32]],[{start:50,end:60},{start:60,end:61}],[{start:5,end:5},{start:'x',end:9}]),[{start:10,end:40},{start:50,end:61}]);
 assert.deepEqual(fb.merge(),[]);
});

test('freeSlots(): working hours Mon–Fri 9–18 in Europe/Rome, busy from Outlook + Google + CRM, buffer, 30/60 minutes',()=>{
 const busy=fb.merge(fb.busy(fixture('outlook-office365.ics'),{from:FROM,to:TO}),fb.busy(fixture('google-personale.ics'),{from:FROM,to:TO}),
  [{start:Z('2026-10-26T13:00:00Z'),end:Z('2026-10-26T14:00:00Z')}]);// a CRM appointment Monday 14:00–15:00
 const now=Z('2026-10-24T10:00:00Z');// Saturday: the first slot is Monday
 const local=ms=>{const w=fb.wall(ms,'Europe/Rome');return String(w.d).padStart(2,'0')+'/'+w.m+' '+String(w.h).padStart(2,'0')+':'+String(w.mi).padStart(2,'0')};
 const s60=fb.freeSlots({busy,now,days:3,slot:60,limit:50});
 assert.deepEqual(s60.slice(0,6).map(s=>local(s.start)),['26/10 11:00','26/10 11:30','26/10 12:00','26/10 12:30','26/10 13:00','26/10 15:00']);
 // Monday: 09:30–10:00 stand-up, 10:00–11:00 meeting, 14:00–15:00 CRM. The last hour ends at 18:00.
 assert.ok(s60.every(s=>{const w=fb.wall(s.start,'Europe/Rome'),e=fb.wall(s.end,'Europe/Rome');return w.h>=9&&(e.h<18||(e.h===18&&e.mi===0))}));
 assert.ok(!s60.some(s=>busy.some(b=>s.start<b.end&&b.start<s.end)),'no slot touches busy time');
 // Tuesday 27: Palestra 08:00–09:00 local does not block 09:00 without buffer, does with 15 minutes.
 const tue=s=>local(s.start).startsWith('27/10');
 assert.equal(local(fb.freeSlots({busy,now,days:4,slot:30,limit:100}).find(tue).start),'27/10 09:00');
 assert.equal(local(fb.freeSlots({busy,now,days:4,slot:30,buffer:15,limit:100}).find(tue).start),'27/10 09:30');
 // Weekend never; Friday 6/11 «Ferie» all day; options respected.
 const all=fb.freeSlots({busy,now,days:14,slot:30,limit:500});
 assert.ok(!all.some(s=>[0,6].includes(fb.wall(s.start,'Europe/Rome').wd)));assert.ok(!all.some(s=>local(s.start).startsWith('06/11')));
 assert.equal(fb.freeSlots({busy,now,days:14,slot:30,limit:3}).length,3);
 assert.ok(fb.freeSlots({busy,now,days:5,slot:30,perDay:2,limit:100}).length<=10);
 // Saturday hours only: today (now = 12:00 local) has nothing left, next Saturday has 10:00, 10:30, 11:00.
 const sat=fb.freeSlots({busy:[],now,days:8,weekdays:[6],hours:{start:'10:00',end:'12:00'},slot:60});
 assert.deepEqual(sat.map(s=>local(s.start)),['31/10 10:00','31/10 10:30','31/10 11:00']);
 // A start in the middle of the day rounds up to the step grid of the working day.
 assert.equal(local(fb.freeSlots({busy:[],now:Z('2026-10-27T11:07:00Z'),days:1,slot:30})[0].start),'27/10 12:30');
 assert.equal(local(fb.freeSlots({busy:[],now:Z('2026-10-27T11:07:00Z'),days:1,slot:60,step:60})[0].start),'27/10 13:00');
 assert.deepEqual(fb.freeSlots({busy:[],now,hours:{start:'18:00',end:'09:00'}}),[],'bad hours: nothing');
});
