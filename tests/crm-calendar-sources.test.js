'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {EventEmitter}=require('node:events');const {PassThrough}=require('node:stream');
const cf=require('../api/_calendar_fetch.js');
const sc=require('../api/_calendar_sources_crypto.js');
const cal=require('../api/_sales_calendars.js');
const fb=require('../sales/crm-freebusy-core.js');
const {createHandler}=require('../api/_sales');
const W='5b1d2c3e-4f50-4a61-8b72-9c83d4e5f601',S='8924f329-b2c2-4032-9be5-2982d9cd8e5c';
const ENV={MAILBOX_ENC_KEY:Buffer.alloc(32,7).toString('base64')};
const OUTLOOK='https://outlook.office365.com/owa/calendar/4f1b2c3d5e6f@example.it/9a8b7c6d5e4f3a2b1c0d/calendar.ics';
const GOOGLE='https://calendar.google.com/calendar/ical/francesco%40example.com/private-0123456789abcdef0123456789abcdef/basic.ics';
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const fixture=n=>fs.readFileSync(path.join(__dirname,'fixtures','calendars',n),'utf8');
const res=()=>{const r={headers:{},setHeader(k,v){r.headers[k]=v},status(s){r.code=s;return r},json(b){r.body=b;return r},send(b){r.body=b;return r}};return r};

test('checkUrl: only the ICS links Outlook and Google publish',()=>{
 for(const [u,p] of [[OUTLOOK,'outlook'],['https://outlook.live.com/owa/calendar/00000000-0000-0000-0000-000000000000/1a2b/cid-ABC/calendar.ics','outlook'],['https://outlook.office.com/owa/calendar/x@y.it/z/reachcalendar.ics','outlook'],[GOOGLE,'google'],['https://www.google.com/calendar/ical/a%40b.it/private-1/basic.ics','google']]){
  const c=cf.checkUrl(u);assert.equal(c.error,undefined,u);assert.equal(c.provider,p)}
 assert.equal(cf.checkUrl('webcal://outlook.office365.com/owa/calendar/a/b/calendar.ics').url,'https://outlook.office365.com/owa/calendar/a/b/calendar.ics');
 assert.equal(cf.checkUrl('  '+GOOGLE+'  ').url,GOOGLE,'spaces around are trimmed');
 assert.equal(cf.checkUrl('https://OUTLOOK.office365.com:443/owa/calendar/a/b/calendar.ics#x').url,'https://outlook.office365.com/owa/calendar/a/b/calendar.ics');
 for(const bad of ['','http://outlook.office365.com/owa/calendar/a/b/calendar.ics','https://outlook.office365.com.evil.example/owa/calendar/a/b/calendar.ics','https://evil.example/owa/calendar/a/b/calendar.ics',
  'https://user:pw@calendar.google.com/calendar/ical/a/b/basic.ics','https://calendar.google.com:8443/calendar/ical/a/b/basic.ics','https://outlook.office365.com/owa/calendar/a/b/calendar.html',
  'https://calendar.google.com/calendar/embed?src=a','https://127.0.0.1/owa/calendar/a/b/calendar.ics','https://[::1]/calendar/ical/a/basic.ics','file:///etc/passwd','javascript:alert(1)',
  'https://calendar.google.com/calendar/ical/a b/basic.ics','https://calendar.google.com/'+'a'.repeat(2000)+'.ics',null,42]){
  assert.ok(cf.checkUrl(bad).error,String(bad).slice(0,80))}
 assert.match(cf.checkUrl('https://outlook.office365.com/owa/calendar/a/b/calendar.html').error,/\.ics \(non quello HTML\)/);
});

test('isPublicIp / safeLookup: private, loopback, link-local, CGNAT, mapped and special ranges are refused',()=>{
 for(const ip of ['52.96.0.1','142.250.180.14','2603:1026::1','2a00:1450:4002:40d::200e'])assert.ok(cf.isPublicIp(ip),ip);
 for(const ip of ['127.0.0.1','10.1.2.3','172.16.0.1','172.31.255.255','192.168.1.1','169.254.169.254','100.64.0.1','0.0.0.0','224.0.0.1','255.255.255.255','198.18.0.1','192.0.2.1',
  '::','::1','fe80::1','fc00::1','fd12:3456::1','ff02::1','::ffff:127.0.0.1','::ffff:7f00:1','::ffff:10.0.0.1','64:ff9b::a9fe:a9fe','2001:db8::1','2002:7f00:1::1','not an ip',''])assert.ok(!cf.isPublicIp(ip),ip);
 const lookup=cf.safeLookup((h,o,cb)=>cb(null,h==='bad.example'?[{address:'52.96.0.1',family:4},{address:'10.0.0.5',family:4}]:[{address:'52.96.0.1',family:4}]));
 lookup('ok.example',{},(e,a,f)=>{assert.equal(e,null);assert.equal(a,'52.96.0.1');assert.equal(f,4)});
 lookup('ok.example',{all:true},(e,a)=>{assert.equal(e,null);assert.deepEqual(a,[{address:'52.96.0.1',family:4}])});
 lookup('bad.example',{},e=>{assert.equal(e.code,'EBLOCKED','one private address is enough to refuse')});
});

// A fake https.request: answers from a table by URL, and checks that our lookup is passed and used.
function transport(table,seen){
 return (url,opts,onRes)=>{const req=new EventEmitter();req.destroyed=false;req.destroy=()=>{req.destroyed=true};
  req.end=()=>{seen&&seen.push(url);assert.equal(typeof opts.lookup,'function','own lookup always passed');assert.equal(opts.agent,false);
   const host=new URL(url).hostname;opts.lookup(host,{},(err)=>{if(err)return req.emit('error',err);const a=table[url];if(!a)return req.emit('error',Object.assign(new Error('x'),{code:'ECONNREFUSED'}));if(a==='hang')return;
    const r=new PassThrough();r.statusCode=a.status||200;r.headers=a.headers||{};onRes(r);r.end(a.body||'')})};
  return req}}
const RESOLVE=(h,o,cb)=>cb(null,[{address:h==='internal.example'?'10.0.0.1':'52.96.0.1',family:4}]);

test('fetchIcs: reads an allowed link, follows allowed redirects only, limits size and time, never leaks the link',async()=>{
 const ics=fixture('outlook-office365.ics'),seen=[];
 assert.equal(await cf.fetchIcs(OUTLOOK,{transport:transport({[OUTLOOK]:{body:ics}},seen),resolve:RESOLVE}),ics);
 // gzip answers are decompressed.
 assert.equal(await cf.fetchIcs(GOOGLE,{transport:transport({[GOOGLE]:{body:zlib.gzipSync(ics),headers:{'content-encoding':'gzip'}}}),resolve:RESOLVE}),ics);
 // Redirect to another allowed calendar host: followed.
 const moved='https://outlook.office.com/owa/calendar/4f1b/9a8b/calendar.ics';
 assert.equal(await cf.fetchIcs(OUTLOOK,{transport:transport({[OUTLOOK]:{status:302,headers:{location:moved}},[moved]:{body:ics}}),resolve:RESOLVE}),ics);
 const errOf=async(url,table,o)=>{try{await cf.fetchIcs(url,{transport:transport(table),resolve:RESOLVE,...o});return null}catch(e){return e}};
 for(const loc of ['https://evil.example/x.ics','http://outlook.office.com/owa/calendar/a/b/calendar.ics','https://169.254.169.254/latest/meta-data','file:///etc/passwd']){
  const e=await errOf(OUTLOOK,{[OUTLOOK]:{status:301,headers:{location:loc}}});assert.match(e.message,/indirizzo non consentito|Reindirizzamento non valido/,loc)}
 const loop=await errOf(OUTLOOK,{[OUTLOOK]:{status:302,headers:{location:OUTLOOK}}});assert.match(loop.message,/Troppi reindirizzamenti/);
 assert.match((await errOf(OUTLOOK,{[OUTLOOK]:{status:404}})).message,/Link non più valido/);
 assert.match((await errOf(OUTLOOK,{[OUTLOOK]:{status:403}})).message,/Accesso negato/);
 assert.match((await errOf(OUTLOOK,{[OUTLOOK]:{status:500}})).message,/errore 500/);
 assert.match((await errOf(OUTLOOK,{[OUTLOOK]:{body:'<html>login</html>'}})).message,/non restituisce un calendario/);
 assert.match((await errOf(OUTLOOK,{[OUTLOOK]:{body:'x'.repeat(2000)}},{maxBytes:1000})).message,/troppo grande/);
 assert.match((await errOf(OUTLOOK,{[OUTLOOK]:{body:'BEGIN:VCALENDAR',headers:{'content-length':'99999999'}}})).message,/troppo grande/);
 assert.match((await errOf(OUTLOOK,{[OUTLOOK]:'hang'},{timeoutMs:50})).message,/non ha risposto in tempo/);
 assert.match((await errOf('https://evil.example/a.ics',{})).message,/Sono accettati solo/);
 // DNS that points an allowed name at a private address: refused before connecting.
 const e=await (async()=>{try{await cf.fetchIcs(OUTLOOK,{transport:transport({[OUTLOOK]:{body:ics}}),resolve:(h,o,cb)=>cb(null,[{address:'127.0.0.1',family:4}])})}catch(x){return x}})();
 assert.match(e.message,/Indirizzo del calendario non consentito/);
 for(const x of [loop,e])assert.ok(!x.message.includes('9a8b7c6d5e4f')&&!x.message.includes('/owa/'),'the secret path never appears in errors');
});

test('crypto: AES-256-GCM bound to workspace, row and user; no key → clear 503',()=>{
 const owner={workspace:W,id:S,user:7},enc=sc.encrypt(GOOGLE,owner,ENV);
 assert.ok(!JSON.stringify(enc).includes('calendar.google.com'));
 const row={workspace_id:W,id:S,user_id:7,...enc};assert.equal(sc.decrypt(row,ENV),GOOGLE);
 assert.throws(()=>sc.decrypt({...row,user_id:8},ENV),/illeggibile/,'moved to another person');
 assert.throws(()=>sc.decrypt({...row,id:W},ENV),/illeggibile/);
 assert.throws(()=>sc.decrypt(row,{MAILBOX_ENC_KEY:Buffer.alloc(32,8).toString('base64')}),/illeggibile/,'other key');
 assert.throws(()=>sc.encrypt(GOOGLE,owner,{}),e=>e.status===503&&/MAILBOX_ENC_KEY/.test(e.message));
 assert.notEqual(sc.encrypt(GOOGLE,owner,ENV).url_iv,enc.url_iv,'fresh IV each time');
});

test('commands and queries: allowlisted fields, ranges and actions',()=>{
 const c=cal.command({workspace:W,entity:'calendar_sources',action:'add',data:{label:' Outlook lavoro ',url:'webcal://outlook.office365.com/owa/calendar/a/b/calendar.ics',show_details:false}});
 assert.equal(c.data.label,'Outlook lavoro');assert.equal(c.data.provider,'outlook');assert.equal(c.data.url_host,'outlook.office365.com');assert.match(c.data.id,/^[0-9a-f-]{36}$/);
 for(const body of [{workspace:W,entity:'calendar_sources',action:'add',data:{label:'x'}},{workspace:W,entity:'calendar_sources',action:'add',data:{label:'x',url:'https://evil.example/a.ics'}},
  {workspace:W,entity:'calendar_sources',action:'add',data:{label:'x',url:OUTLOOK,user_id:1}},{workspace:W,entity:'calendar_sources',action:'update',data:{id:S}},
  {workspace:W,entity:'calendar_sources',action:'delete',data:{id:'x'}},{workspace:W,entity:'calendar_sources',action:'drop',data:{}},{workspace:'x',entity:'calendar_sources',action:'add',data:{}},
  {workspace:W,entity:'calendar_sources',action:'add',data:{label:'a'.repeat(61),url:OUTLOOK}},{workspace:W,entity:'calendar_sources',action:'update',data:{id:S,show_details:'yes'}}])
  assert.throws(()=>cal.command(body),e=>e.status===400,JSON.stringify(body).slice(0,90));
 assert.deepEqual(cal.query({entity:'calendar_busy',workspace:W,from:'2026-10-26T00:00:00Z',to:'2026-11-09T00:00:00Z'}),{workspace:W,entity:'calendar_busy',from:Date.parse('2026-10-26T00:00:00Z'),to:Date.parse('2026-11-09T00:00:00Z')});
 for(const q of [{entity:'calendar_busy',workspace:W,from:'2026-10-26',to:'2026-11-09'},{entity:'calendar_busy',workspace:W,from:'2026-10-26T00:00:00Z',to:'2027-01-26T00:00:00Z'},{entity:'calendar_busy',workspace:W,from:'2026-10-26T00:00:00Z',to:'2026-10-25T00:00:00Z'},{entity:'calendar_sources',workspace:W,user:'1'}])
  assert.throws(()=>cal.query(q),e=>e.status===400);
});

// A fake sql that keeps rows in memory and records every statement with its parameters.
function fakeSql(){const rows=[],calls=[];
 const sql=async(q,p)=>{calls.push([q,p]);
  if(/^SELECT count\(\*\)/.test(q))return [{n:rows.filter(r=>r.workspace_id===p[0]&&r.user_id===p[1]).length}];
  if(/^INSERT INTO sales_calendar_sources/.test(q)){const r={workspace_id:p[0],id:p[1],user_id:p[2],label:p[3],provider:p[4],url_host:p[5],url_ciphertext:p[6],url_iv:p[7],url_tag:p[8],show_details:p[9],status:'pending',last_error:null,updated_at:'t1'};rows.push(r);return [pub(r)]}
  if(/^SELECT workspace_id,id,user_id,label,show_details,url_ciphertext/.test(q))return rows.filter(r=>r.workspace_id===p[0]&&r.user_id===p[1]);
  if(/^SELECT workspace_id,id,user_id,url_ciphertext/.test(q))return rows.filter(r=>r.workspace_id===p[0]&&r.id===p[1]&&r.user_id===p[2]);
  if(/^SELECT id,label/.test(q))return rows.filter(r=>r.workspace_id===p[0]&&r.user_id===(p.length===2?p[1]:p[2])&&(p.length===2||r.id===p[1])).map(pub);
  if(/^UPDATE sales_calendar_sources SET status=/.test(q)){const r=rows.find(r=>r.workspace_id===p[0]&&r.id===p[1]&&r.user_id===p[2]);if(r){r.status=/'ok'/.test(q)?'ok':'error';r.last_error=p[3]||null}return []}
  if(/^UPDATE sales_calendar_sources SET/.test(q)){const r=rows.find(r=>r.workspace_id===p[0]&&r.id===p[1]&&r.user_id===p[2]);if(!r)return [];if(/label=\$4/.test(q))r.label=p[3];if(/show_details=\$/.test(q))r.show_details=p[p.length-1];r.updated_at='t'+calls.length;return [pub(r)]}
  if(/^DELETE FROM sales_calendar_sources/.test(q)){const i=rows.findIndex(r=>r.workspace_id===p[0]&&r.id===p[1]&&r.user_id===p[2]);if(i<0)return [];rows.splice(i,1);return [{id:p[1]}]}
  throw new Error('unexpected sql '+q)};
 const pub=r=>({id:r.id,label:r.label,provider:r.provider,host:r.url_host,show_details:r.show_details,status:r.status,last_error:r.last_error,url_saved:true});
 return {sql,rows,calls}}

test('handler: links private to their user, encrypted at rest, never returned; busy merges links, hides titles unless asked',async()=>{
 cal._cache.clear();const db=fakeSql();const fetched=[];
 const fetchIcs=async url=>{fetched.push(url);if(url===GOOGLE)return fixture('google-personale.ics');if(url===OUTLOOK)return fixture('outlook-office365.ics');throw new Error('Link non più valido (outlook.office365.com)')};
 const ctx=u=>({sql:db.sql,user:u,env:ENV,fetchIcs});
 const add=(u,data)=>cal.handle(cal.command({workspace:W,entity:'calendar_sources',action:'add',data}),ctx(u));
 const o=await add(7,{label:'Outlook lavoro',url:OUTLOOK});const g=await add(7,{label:'Google personale',url:GOOGLE,show_details:true});
 await add(8,{label:'Altro collega',url:'https://outlook.office365.com/owa/calendar/z/z/calendar.ics'});
 assert.deepEqual(Object.keys(o.rows[0]).sort(),['host','id','label','last_error','provider','show_details','status','url_saved'].sort());
 assert.ok(!JSON.stringify(db.calls).includes('9a8b7c6d5e4f3a2b1c0d')&&!JSON.stringify(db.calls).includes('private-0123'),'the clear link never reaches the database');
 assert.equal(sc.decrypt(db.rows[0],ENV),OUTLOOK);
 const list=await cal.handle(cal.query({entity:'calendar_sources',workspace:W}),ctx(7));assert.deepEqual(list.rows.map(r=>r.label),['Outlook lavoro','Google personale']);
 assert.ok(!JSON.stringify(list).includes('ciphertext')&&!JSON.stringify(list).includes('/owa/'));
 // Every statement filters on the caller.
 for(const [q,p] of db.calls)if(/sales_calendar_sources/.test(q)&&!/^INSERT/.test(q))assert.match(q,/user_id=\$(2|3)/,q.slice(0,60));
 // Someone else's link: not found for update, delete and refresh, even for an owner of the workspace.
 for(const action of ['update','delete','refresh'])await assert.rejects(cal.handle(cal.command({workspace:W,entity:'calendar_sources',action,data:{id:o.rows[0].id,...(action==='update'?{label:'x'}:{})}}),ctx(8)),e=>e.status===404);
 const from=Date.parse('2026-10-25T23:00:00Z'),to=Date.parse('2026-11-08T23:00:00Z');
 const busy=await cal.handle(cal.query({entity:'calendar_busy',workspace:W,from:'2026-10-25T23:00:00Z',to:'2026-11-08T23:00:00Z'}),ctx(7));
 assert.deepEqual(fetched.sort(),[GOOGLE,OUTLOOK].sort(),'only the caller\'s links are read');
 assert.ok(busy.rows.every(b=>b.start>=from-864e5&&b.end<=to+864e5));
 const out=busy.rows.filter(b=>b.source===o.rows[0].id),goo=busy.rows.filter(b=>b.source===g.rows[0].id);
 assert.equal(out.length,8);assert.equal(goo.length,6);assert.ok(out.every(b=>!('summary' in b)),'Outlook: times only');assert.ok(goo.some(b=>b.summary==='Dentista'),'Google: titles (show_details)');
 assert.deepEqual(busy.sources.map(s=>s.status),['ok','ok']);assert.ok(db.rows.filter(r=>r.user_id===7).every(r=>r.status==='ok'));
 // Second read within 5 minutes: from the cache, no new fetch.
 await cal.handle(cal.query({entity:'calendar_busy',workspace:W,from:'2026-10-25T23:00:00Z',to:'2026-11-08T23:00:00Z'}),ctx(7));assert.equal(fetched.length,2);
 // «Aggiorna» forces a read; a failing link records a short error without the link.
 const r=await cal.handle(cal.command({workspace:W,entity:'calendar_sources',action:'refresh',data:{id:o.rows[0].id}}),ctx(7));assert.equal(fetched.length,3);assert.equal(r.events,10);
 const bad=await add(8,{label:'Rotto',url:'https://outlook.office365.com/owa/calendar/q/q/calendar.ics'});
 const b8=await cal.handle(cal.query({entity:'calendar_busy',workspace:W,from:'2026-10-25T23:00:00Z',to:'2026-11-08T23:00:00Z'}),ctx(8));
 assert.ok(b8.sources.some(s=>s.id===bad.rows[0].id&&s.status==='error'));assert.equal(db.rows.find(x=>x.id===bad.rows[0].id).status,'error');
 assert.ok(!JSON.stringify(db.rows.map(x=>x.last_error)).includes('/owa/'));
 // Update: label and show_details; delete.
 const up=await cal.handle(cal.command({workspace:W,entity:'calendar_sources',action:'update',data:{id:o.rows[0].id,show_details:true}}),ctx(7));assert.equal(up.rows[0].show_details,true);
 await cal.handle(cal.command({workspace:W,entity:'calendar_sources',action:'delete',data:{id:g.rows[0].id}}),ctx(7));assert.equal(db.rows.filter(x=>x.user_id===7).length,1);
 // At most 5 per person.
 for(let i=0;i<4;i++)await add(7,{label:'C'+i,url:OUTLOOK});
 await assert.rejects(add(7,{label:'Sesto',url:OUTLOOK}),e=>e.status===409&&/al massimo 5/.test(e.message));
 // Without MAILBOX_ENC_KEY nothing is stored.
 const n=db.rows.length;await assert.rejects(cal.handle(cal.command({workspace:W,entity:'calendar_sources',action:'add',data:{label:'x',url:GOOGLE}}),{sql:db.sql,user:9,env:{},fetchIcs}),e=>e.status===503);assert.equal(db.rows.length,n);
 // Archive without migration 018.
 await assert.rejects(cal.handle(cal.query({entity:'calendar_sources',workspace:W}),{sql:async()=>{throw Object.assign(new Error('x'),{code:'42P01'})},user:7,env:ENV}),e=>e.status===503&&/migrazione sales 018/.test(e.message));
});

test('sales API: calendar entities need the session and a membership; viewers manage their own links',async()=>{
 process.env.JWT_SECRET='k'.repeat(40);
 const calls=[];const store={membership:async(w,u)=>u===9?null:{role:'viewer'},sql:async(q,p)=>{calls.push([q,p]);return []}};
 let h=createHandler({getSessionUser:()=>null,getStore:()=>store});
 let r=res();await h({method:'GET',headers:{},query:{entity:'calendar_sources',workspace:W,offset:'0'}},r);assert.equal(r.code,401);
 h=createHandler({getSessionUser:()=>({uid:7}),getStore:()=>store});
 r=res();await h({method:'GET',headers:{},query:{entity:'calendar_sources',workspace:W,offset:'0'}},r);assert.equal(r.code,200);assert.deepEqual(r.body,{rows:[]});assert.deepEqual(calls[0][1],[W,7]);
 r=res();await h({method:'GET',headers:{},query:{entity:'calendar_busy',workspace:W,from:'2026-10-26T00:00:00Z',to:'2026-11-02T00:00:00Z'}},r);assert.equal(r.code,200);assert.deepEqual(r.body,{rows:[],sources:[]});
 r=res();await h({method:'POST',headers:{'x-radix-sales':'1','content-type':'application/json'},query:{},body:{workspace:W,entity:'calendar_sources',action:'add',data:{label:'x',url:'https://evil.example/a.ics'}}},r);assert.equal(r.code,400);assert.match(r.body.error,/Sono accettati solo/);
 h=createHandler({getSessionUser:()=>({uid:9}),getStore:()=>store});
 r=res();await h({method:'GET',headers:{},query:{entity:'calendar_sources',workspace:W,offset:'0'}},r);assert.equal(r.code,403);
});

test('crmBusy: the CRM appointments as busy time, with the feed lengths',()=>{
 const data={tasks:[{title:'Appuntamento con Rossi',due_at:'2026-10-27T09:00:00Z',status:'todo',assignee_id:7},{title:'Richiamare Bianchi',due_at:'2026-10-27T13:00:00Z',status:'doing',assignee_id:7},
  {title:'Fatta',due_at:'2026-10-27T10:00:00Z',status:'done',assignee_id:7},{title:'Di un altro',due_at:'2026-10-27T11:00:00Z',status:'todo',assignee_id:8},{title:'Senza data',status:'todo',assignee_id:7}],
  interactions:[{kind:'meeting',occurred_at:'2026-10-28T08:00:00Z',created_by:7},{kind:'call',occurred_at:'2026-10-28T10:00:00Z',created_by:8},{kind:'note',occurred_at:'2026-10-28T11:00:00Z',created_by:7}]};
 const iso=b=>b.map(x=>new Date(x.start).toISOString().slice(11,16)+'+'+(x.end-x.start)/6e4);
 assert.deepEqual(iso(fb.crmBusy(data,{me:7})),['09:00+60','13:00+30','08:00+60']);
 assert.equal(fb.crmBusy(data,{}).length,5);
 assert.deepEqual(iso(fb.crmBusy(data,{me:7,from:Date.parse('2026-10-28T00:00:00Z')})),['08:00+60']);
});

test('wiring: scripts, Calendario box, busy blocks, «Slot liberi» in «Registra chiamata», migration 018',()=>{
 const html=read('radix-sales.html'),i=s=>html.indexOf(s);
 assert.ok(i('sales/crm-freebusy-core.js')>0&&i('sales/crm-freebusy-core.js')<i('sales/crm-calendars.js')&&i('sales/crm-calendars.js')<i('sales/calendar-view.js'));
 const js=read('sales/crm-calendars.js');
 for(const s of ['Calendari esterni','Calendari condivisi','Pubblica un calendario','link ICS','Indirizzo segreto in formato iCal','Integra calendario','link salvato','Mostra i titoli','Slot liberi','Orario di lavoro',"'calendar_busy'","'calendar_sources'"])assert.ok(js.includes(s),s);
 assert.ok(!/\.url\b(?!_)/.test(js.replace(/url\.value|url\.placeholder|url:url\.value|feed\.url/g,'')),'the page never reads a saved link back');
 const view=read('sales/calendar-view.js');assert.ok(view.includes("busy:['Occupato','gray']"));assert.ok(view.includes('RadixCrmCalendars.sourcesBox()'));assert.ok(view.includes("'radix-calendars-changed'"));
 assert.ok(read('sales/crm-sheet.js').includes('RadixCrmCalendars.slotPicker({onPick:v=>{when.value=v;fcb.checked=true}})'));
 const mig=read('migrations/sales/018_crm_calendar_sources.sql');
 for(const s of ['CREATE TABLE IF NOT EXISTS sales_calendar_sources','user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE','url_ciphertext text NOT NULL',"provider IN ('outlook','google')",'show_details boolean NOT NULL DEFAULT false',"status IN ('pending','ok','error')",'last_fetched_at timestamptz','BEGIN;','COMMIT;'])assert.ok(mig.includes(s),s);
 assert.ok(!/url text|url_clear|\burl\b text/.test(mig),'no clear link column');
 assert.ok(read('api/_sales.js').includes("require('./_sales_calendars')"),'no new serverless function');
});
