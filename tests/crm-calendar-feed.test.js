'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const feed=require('../api/_sales_calendar_feed.js');
const fb=require('../sales/crm-freebusy-core.js');
const {createHandler}=require('../api/_sales');
const K='k'.repeat(40),W='5b1d2c3e-4f50-4a61-8b72-9c83d4e5f601',C='8924f329-b2c2-4032-9be5-2982d9cd8e5c',T='0f0e0d0c-0b0a-4909-8807-060504030201',I='11111111-2222-4333-8444-555555555555';
const now=Date.parse('2026-10-24T10:00:00Z');
const res=()=>{const r={headers:{},setHeader(k,v){r.headers[k]=v},status(s){r.code=s;return r},json(b){r.body=b;return r},send(b){r.body=b;return r},end(){r.ended=true;return r}};return r};
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

/* A strict RFC 5545 check of what the feed sends: CRLF only, lines of at most 75 octets (continuations start with one space),
   content-line syntax, balanced BEGIN/END, required properties, escaped TEXT values, valid UTC date-times. */
function strictIcs(text){
 const errors=[];
 if(!text.endsWith('\r\n'))errors.push('must end with CRLF');
 if(/\r(?!\n)|(?<!\r)\n/.test(text))errors.push('bare CR or LF');
 const physical=text.slice(0,-2).split('\r\n');
 physical.forEach((l,i)=>{if(Buffer.byteLength(l)>75)errors.push('line '+(i+1)+' longer than 75 octets');if(i===0&&/^[ \t]/.test(l))errors.push('first line is a continuation');if(/[\u0000-\u0008\u000a-\u001f\u007f]/.test(l))errors.push('control character on line '+(i+1))});
 const logical=[];for(const l of physical){if(/^[ \t]/.test(l))logical[logical.length-1]+=l.slice(1);else logical.push(l)}
 const stack=[],seen=[];let cur=null;
 const NAME=/^([A-Za-z0-9-]+)((?:;[A-Za-z0-9-]+=(?:"[^"]*"|[^";:,]*)(?:,(?:"[^"]*"|[^";:,]*))*)*):(.*)$/;
 for(const l of logical){const m=NAME.exec(l);if(!m){errors.push('bad content line: '+l);continue}
  const name=m[1].toUpperCase(),value=m[3];
  if(name==='BEGIN'){stack.push(value);cur={type:value,props:{}};seen.push(cur);continue}
  if(name==='END'){if(stack.pop()!==value)errors.push('END:'+value+' does not close the open component');cur=seen.filter(c=>stack.includes(c.type)).pop()||null;continue}
  if(!cur){errors.push('property outside any component: '+name);continue}
  (cur.props[name]=cur.props[name]||[]).push(value);
  if(['SUMMARY','DESCRIPTION','LOCATION','X-WR-CALNAME','X-WR-CALDESC'].includes(name)&&/(^|[^\\])(\\\\)*[;,]/.test(value))errors.push(name+' has an unescaped ; or ,');
  if(['SUMMARY','DESCRIPTION'].includes(name)&&/\\[^\\;,nN]/.test(value))errors.push(name+' has an invalid escape');
  if(['DTSTART','DTEND','DTSTAMP'].includes(name)&&!/^\d{8}T\d{6}Z$/.test(value))errors.push(name+' is not a UTC date-time: '+value);
 }
 if(stack.length)errors.push('unclosed '+stack.join(','));
 const cal=seen.find(c=>c.type==='VCALENDAR');if(!cal)errors.push('no VCALENDAR');else for(const k of ['VERSION','PRODID'])if(!cal.props[k])errors.push('VCALENDAR without '+k);
 if(cal&&cal.props.VERSION&&cal.props.VERSION[0]!=='2.0')errors.push('VERSION must be 2.0');
 const uids=new Set();
 for(const e of seen.filter(c=>c.type==='VEVENT')){for(const k of ['UID','DTSTAMP','DTSTART'])if(!e.props[k]||e.props[k].length!==1)errors.push('VEVENT needs exactly one '+k);
  if(e.props.UID){if(uids.has(e.props.UID[0]))errors.push('duplicate UID '+e.props.UID[0]);uids.add(e.props.UID[0])}
  if(e.props.DTEND&&e.props.DTSTART&&e.props.DTEND[0]<=e.props.DTSTART[0])errors.push('DTEND not after DTSTART')}
 return errors;
}

const rows={workspaceName:'Acme; Vendite, Nord',
 tasks:[{id:T,title:'Appuntamento con Mario Rossi',due_at:'2026-10-27T09:00:00.000Z',contact_id:C,contact_name:'Mario Rossi',contact_phone:'+39 02 1234567',contact_mobile:'333 1234567',company_name:'Rossi, Bianchi & C. S.r.l.',company_phone:'02 7654321'},
  {id:'22222222-2222-4222-8222-222222222222',title:'Richiamare; preventivo',due_at:'2026-10-28T14:30:00.000Z',contact_id:null,contact_name:null,company_name:null}],
 interactions:[{id:I,title:'Demo prodotto',kind:'meeting',occurred_at:'2026-11-03T13:00:00.000Z',body:'Portare il listino\nseconda riga con è e € '+'lunga '.repeat(30),contact_id:C,contact_name:'Mario Rossi',contact_phone:'+39 02 1234567',company_name:'Rossi, Bianchi & C. S.r.l.'},
  {id:'33333333-3333-4333-8333-333333333333',title:'Call',kind:'call',occurred_at:'not a date'}]};

test('token: compact, stable, bound to user and workspace, rejects tampering and other keys',()=>{
 const t=feed.sign(K,{uid:42,workspace:W});assert.equal(t.length,52);assert.match(t,/^[A-Za-z0-9_-]+$/);
 assert.equal(feed.sign(K,{uid:42,workspace:W}),t,'the same link every time');
 assert.deepEqual(feed.verify(K,t),{uid:42,workspace:W,generation:0});
 assert.notEqual(feed.sign(K,{uid:43,workspace:W}),t);assert.notEqual(feed.sign(K,{uid:42,workspace:W,generation:1}),t,'a later generation revokes the old link');
 assert.equal(feed.verify('z'.repeat(40),t),null,'other key');
 for(let i=0;i<52;i+=7){const flip=t.slice(0,i)+(t[i]==='A'?'B':'A')+t.slice(i+1);assert.equal(feed.verify(K,flip),null,'changed character '+i)}
 for(const bad of [undefined,'',t.slice(1),t+'A','x'.repeat(52),['a'],{}])assert.equal(feed.verify(K,bad),null);
 assert.throws(()=>feed.sign('',{uid:1,workspace:W}));assert.throws(()=>feed.sign(K,{uid:0,workspace:W}));assert.throws(()=>feed.sign(K,{uid:1,workspace:'nope'}));
 // Not interchangeable with the unsubscribe token (different key derivation and format).
 const unsub=require('../api/_sales_unsubscribe.js');assert.equal(unsub.verify(K,t),null);assert.equal(feed.verify(K,unsub.sign(K,W,C)),null);
 assert.equal(feed.secretOf({JWT_SECRET:'a',CALENDAR_FEED_SECRET:'b'}),'b');assert.equal(feed.secretOf({JWT_SECRET:'a'}),'a');
});

test('feed text: strict RFC 5545, ☎ summary, description with company and phones, contact link, stable UIDs',()=>{
 const f=feed.build(rows,{now,base:'https://radix.example',workspace:W}),t=f.text;
 assert.deepEqual(strictIcs(t),[]);assert.equal(f.count,3,'the interaction without a valid date is left out');
 const cal=fb.parse(t,{zone:'Europe/Rome'});assert.equal(cal.name,'RADIX CRM · Acme; Vendite, Nord');
 const [a,b,c]=cal.events;
 assert.equal(a.summary,'☎ Mario Rossi · Appuntamento con Mario Rossi');assert.equal(a.start,Date.parse('2026-10-27T09:00:00Z'));assert.equal(a.end-a.start,60*6e4,'appointments last an hour');
 assert.equal(b.summary,'Richiamare; preventivo');assert.equal(b.end-b.start,30*6e4,'other tasks half an hour');
 assert.equal(c.summary,'☎ Mario Rossi · Demo prodotto');assert.equal(c.end-c.start,60*6e4);
 assert.ok(t.includes('UID:task-'+T+'@feed.radix-crm\r\n'));assert.ok(t.includes('UID:interaction-'+I+'@feed.radix-crm\r\n'));
 assert.ok(t.includes('DTSTAMP:20261024T100000Z'));assert.ok(t.includes('DTSTART:20261027T090000Z\r\nDTEND:20261027T100000Z'));
 const desc=fb.unfold(t).split('\n').find(l=>l.startsWith('DESCRIPTION:Azienda: Rossi'));
 assert.ok(desc.includes('Azienda: Rossi\\, Bianchi & C. S.r.l.\\nContatto: Mario Rossi\\nTelefono: +39 02 1234567\\nCellulare: 333 1234567\\nTelefono azienda: 02 7654321'));
 assert.ok(fb.unfold(t).includes('URL:https://radix.example/radix-sales.html?ws='+W+'&contatto='+C+'#contacts'));
 assert.ok(fb.unfold(t).includes('URL:https://radix.example/radix-sales.html?ws='+W+'#tasks'),'no contact: the task list');
 assert.match(t,/^X-WR-TIMEZONE:Europe\/Rome\r$/m);assert.match(t,/^REFRESH-INTERVAL;VALUE=DURATION:PT1H\r$/m);
 // Same rows, later: identical apart from DTSTAMP (calendar programs update events in place).
 const later=feed.build(rows,{now:now+36e5,base:'https://radix.example',workspace:W}).text;assert.equal(later.replace(/DTSTAMP:\d{8}T\d{6}Z/g,''),t.replace(/DTSTAMP:\d{8}T\d{6}Z/g,''));
 // Empty calendar is still valid.
 assert.deepEqual(strictIcs(feed.build({},{now}).text),[]);
 // Control characters in CRM text never reach the feed.
 assert.deepEqual(strictIcs(feed.build({tasks:[{id:T,title:'A\u0007B\u001b',due_at:'2026-10-27T09:00:00Z'}]},{now}).text),[]);
});

test('the strict check rejects broken files (it is not a rubber stamp)',()=>{
 const ok=feed.build(rows,{now,workspace:W}).text;
 assert.ok(strictIcs(ok.replace(/\r\n/g,'\n')).length);
 assert.ok(strictIcs(ok.replace('SUMMARY:Richiamare\\; preventivo','SUMMARY:Richiamare; preventivo')).some(e=>/unescaped/.test(e)));
 assert.ok(strictIcs(ok.replace('END:VEVENT\r\n','')).length);
 assert.ok(strictIcs('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:'+'x'.repeat(80)+'\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n').length);
});

test('handler: valid token → text/calendar of that user, membership checked every time, junk → 404 without a query',async()=>{
 const calls=[];let role='member';
 const store={membership:async(w,u)=>{calls.push(['membership',w,u]);return role?{role}:null},
  sql:async(q,p)=>{calls.push([q,p]);if(/FROM sales_tasks/.test(q))return rows.tasks;if(/FROM sales_interactions/.test(q))return rows.interactions;if(/FROM sales_workspaces/.test(q))return [{name:'Acme'}];return []}};
 const token=feed.sign(K,{uid:7,workspace:W});
 let r=res();await feed.handle({method:'GET',headers:{host:'radix.example','x-forwarded-proto':'https'},query:{calendar:token}},r,{getStore:()=>store,secret:K,env:{},now});
 assert.equal(r.code,200);assert.equal(r.headers['Content-Type'],'text/calendar; charset=utf-8');assert.match(r.headers['Cache-Control'],/^private/);assert.equal(r.headers['Referrer-Policy'],'no-referrer');
 assert.deepEqual(strictIcs(r.body),[]);assert.ok(r.body.includes('radix.example/radix-sales.html?ws='));
 assert.deepEqual(calls[0],['membership',W,7]);
 const tq=calls.find(c=>/FROM sales_tasks/.test(c[0])),iq=calls.find(c=>/FROM sales_interactions/.test(c[0]));
 assert.deepEqual(tq[1],[W,7]);assert.match(tq[0],/t\.assignee_id=\$2 AND t\.status<>'done'/);assert.match(tq[0],/interval '14 days' AND now\(\)\+interval '90 days'/);assert.match(tq[0],/NOT EXISTS\(SELECT 1 FROM sales_memberships v_m/,'visibility rule applied');
 assert.match(iq[0],/t\.kind IN \('call','meeting'\)/);assert.match(iq[0],/t\.created_by=\$2 OR EXISTS\(SELECT 1 FROM sales_opportunities o/);
 // HEAD: headers only.
 r=res();await feed.handle({method:'HEAD',headers:{},query:{calendar:token}},r,{getStore:()=>store,secret:K,env:{},now});assert.equal(r.code,200);assert.ok(r.ended);assert.equal(r.body,undefined);
 // Removed from the workspace: the link stops working at once.
 role=null;r=res();await feed.handle({method:'GET',headers:{},query:{calendar:token}},r,{getStore:()=>store,secret:K,env:{},now});assert.equal(r.code,404);assert.match(r.body,/Calendario non trovato/);
 const before=calls.length;
 for(const bad of ['x'.repeat(52),'',token.slice(0,-1)+'A']){r=res();await feed.handle({method:'GET',headers:{},query:{calendar:bad}},r,{getStore:()=>{throw new Error('no store for junk')},secret:K,env:{},now});assert.equal(r.code,404)}
 assert.equal(calls.length,before,'junk tokens never reach the database');
 r=res();await feed.handle({method:'POST',headers:{},query:{calendar:token}},r,{getStore:()=>store,secret:K,env:{},now});assert.equal(r.code,405);
 r=res();await feed.handle({method:'GET',headers:{},query:{calendar:token}},r,{getStore:()=>store,secret:undefined,env:{},now});assert.equal(r.code,503);
 role='viewer';r=res();await feed.handle({method:'GET',headers:{},query:{calendar:token}},r,{getStore:()=>({...store,sql:async()=>{throw Object.assign(new Error('x'),{code:'08006'})}}),secret:K,env:{},now});assert.equal(r.code,503);
 assert.equal(feed.origin({headers:{host:'evil.example/x'}},{}),'','odd Host headers give no link');
 assert.equal(feed.origin({headers:{host:'a.example'}},{PUBLIC_BASE_URL:'https://radix.example/'}),'https://radix.example');
});

test('sales API: GET ?calendar skips the session; POST calendar_feed gives the link to any member, viewers included',async()=>{
 process.env.JWT_SECRET=K;delete process.env.CALENDAR_FEED_SECRET;
 const store={membership:async(w,u)=>u===9?null:{role:'viewer'},sql:async()=>[]};
 let h=createHandler({getSessionUser:()=>null,getStore:()=>store});
 let r=res();await h({method:'GET',headers:{},query:{calendar:feed.sign(K,{uid:7,workspace:W})}},r);assert.equal(r.code,200);assert.equal(r.headers['Content-Type'],'text/calendar; charset=utf-8');
 r=res();await h({method:'POST',headers:{'x-radix-sales':'1','content-type':'application/json'},query:{},body:{workspace:W,entity:'calendar_feed',action:'create',data:{}}},r);assert.equal(r.code,401,'creating a link needs the session');
 h=createHandler({getSessionUser:()=>({uid:7}),getStore:()=>store});
 r=res();await h({method:'POST',headers:{'x-radix-sales':'1','content-type':'application/json'},query:{},body:{workspace:W,entity:'calendar_feed',action:'create',data:{}}},r);
 assert.equal(r.code,200);assert.deepEqual(feed.verify(K,r.body.token),{uid:7,workspace:W,generation:0});assert.equal(r.body.path,'/api/sales?calendar='+r.body.token);
 for(const body of [{workspace:W,entity:'calendar_feed',action:'create',data:{uid:8}},{workspace:W,entity:'calendar_feed',action:'delete',data:{}},{workspace:'x',entity:'calendar_feed',action:'create',data:{}}]){
  r=res();await h({method:'POST',headers:{'x-radix-sales':'1','content-type':'application/json'},query:{},body},r);assert.equal(r.code,400)}
 h=createHandler({getSessionUser:()=>({uid:9}),getStore:()=>store});
 r=res();await h({method:'POST',headers:{'x-radix-sales':'1','content-type':'application/json'},query:{},body:{workspace:W,entity:'calendar_feed',action:'create',data:{}}},r);assert.equal(r.code,403,'not a member: no link');
});

test('wiring: Calendario page loads the box, styles and the deep link; no new serverless function',()=>{
 const html=read('radix-sales.html');
 assert.ok(html.indexOf('sales/crm-calendars.js')>0&&html.indexOf('sales/crm-calendars.js')<html.indexOf('sales/calendar-view.js'));assert.ok(html.includes('href="sales/crm-calendars.css"'));
 const js=read('sales/crm-calendars.js');for(const s of ['Calendario da abbonare','Aggiungi calendario › Da Internet','Sottoscrivi dal web','Altri calendari','Da URL','ogni qualche ora','Copia link',"'calendar_feed'"])assert.ok(js.includes(s),s);
 assert.ok(read('sales/calendar-view.js').includes('RadixCrmCalendars.feedBox()'));
 assert.ok(read('api/_sales.js').includes("require('./_sales_calendar_feed')"),'served by /api/sales, no new function');
 assert.ok(!fs.existsSync(path.join(__dirname,'..','api','calendar.js')));
});
