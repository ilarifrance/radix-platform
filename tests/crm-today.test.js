'use strict';
process.env.TZ='Europe/Rome';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const core=require('../sales/crm-today-core.js');
const {command}=require('../api/_sales.js');
const read=f=>fs.readFileSync(__dirname+'/../'+f,'utf8');
const W='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',K1='11111111-1111-4111-8111-111111111111',C1='22222222-2222-4222-8222-222222222222',O1='33333333-3333-4333-8333-333333333333';
const NOW=Date.parse('2026-10-20T13:00:00Z'); // 15:00 in Rome
const task=(id,due,extra={})=>({id:'00000000-0000-4000-8000-'+String(id).padStart(12,'0'),title:'T'+id,status:'todo',due_at:due,assignee_id:1,version:3,...extra});

test('agenda: late and still-due-today open tasks, mine first, then by due time; tomorrow, done and undated are left out',()=>{
 const rows=[task(1,'2026-10-20T14:00:00Z',{assignee_id:2}),task(2,'2026-10-18T08:00:00Z',{assignee_id:2}),task(3,'2026-10-19T08:00:00Z'),task(4,'2026-10-20T15:30:00Z'),
  task(5,'2026-10-20T22:30:00Z'),task(6,'2026-10-17T08:00:00Z',{status:'done'}),task(7,null),task(8,'2026-10-20T21:59:00Z',{assignee_id:2}),task(3,'2026-10-19T08:00:00Z')];
 const g=core.agenda(rows,NOW,1);
 assert.deepEqual(g.overdue.map(t=>t.title),['T3','T2'],'mine first, then the others; duplicates of the two reads counted once');
 assert.deepEqual(g.today.map(t=>t.title),['T4','T1','T8'],'23:59 Rome is today, 00:30 Rome tomorrow is not');
 assert.equal(g.mine,2);
 assert.deepEqual(core.agenda(rows,NOW,null).overdue.map(t=>t.title),['T2','T3'],'unknown user: by due time only');
});

test('telHref keeps digits and a leading +, refuses text and short numbers',()=>{
 assert.equal(core.telHref('+39 02 555 0101'),'tel:+39025550101');
 assert.equal(core.telHref('(02) 555-01.01'),'tel:025550101');
 assert.equal(core.telHref('0039 333 1234567'),'tel:+393331234567');
 for(const bad of [null,'','123','chiamare in ufficio','javascript:alert(1)','+39 02 555 0101 int. 4 ext'])assert.equal(core.telHref(bad),null,String(bad));
});

test('target: the contact of the task and its phone, else the company; links are the task own',()=>{
 const contacts=[{id:C1,name:'Giulia Rossi',phone:'333 123 4567',company_id:K1}],companies=[{id:K1,name:'Rossi Srl',phone:'030 123456'}];
 const t=core.target(task(1,null,{contact_id:C1,company_id:K1,opportunity_id:O1}),contacts,companies);
 assert.equal(t.name,'Giulia Rossi');assert.equal(t.tel,'tel:3331234567');assert.equal(t.company,'Rossi Srl');
 assert.deepEqual(t.links,{company_id:K1,contact_id:C1,opportunity_id:O1});assert.equal(t.linked,true);
 const noPhone=core.target(task(1,null,{contact_id:C1,company_id:K1}),[{...contacts[0],phone:null}],companies);
 assert.equal(noPhone.tel,'tel:030123456','falls back to the company phone');
 const bare=core.target(task(1,null),contacts,companies);assert.equal(bare.linked,false);assert.equal(bare.tel,null);
});

test('callPlan: one interactions create of kind call that api/_sales.js accepts; outcome required',()=>{
 const tg=core.target(task(1,null,{contact_id:C1,company_id:K1}),[{id:C1,name:'Giulia Rossi'}],[]);
 assert.match(core.callPlan({},tg,NOW).error,/esito/);
 assert.match(core.callPlan({outcome:'answered'},core.target(task(1,null),[],[]),NOW).error,/non è collegata/);
 const p=core.callPlan({outcome:'callback',note:'  Vuole il listino  '},tg,NOW);
 assert.deepEqual(p.data,{title:'Chiamata con Giulia Rossi · Richiamare',kind:'call',occurred_at:'2026-10-20T13:00:00Z',body:'Esito: Richiamare\nVuole il listino',company_id:K1,contact_id:C1,opportunity_id:null});
 assert.equal(core.callPlan({outcome:'no_answer'},tg,NOW).data.body,'Esito: Non risponde');
 const c=command({workspace:W,entity:'interactions',action:'create',data:p.data});assert.equal(c.data.kind,'call');
 assert.match(core.callPlan({outcome:'answered',note:'x'.repeat(4000)},tg,NOW).error,/4000/);
 const long=core.callPlan({outcome:'answered'},{...tg,name:'N'.repeat(300)},NOW);assert.ok(long.data.title.length<=200);command({workspace:W,entity:'interactions',action:'create',data:long.data});
});

test('followUpPlan: a task for tomorrow at 9:00 local, to me, accepted by the tasks create command',()=>{
 const tg=core.target(task(1,null,{contact_id:C1,company_id:K1}),[{id:C1,name:'Giulia Rossi'}],[]);
 const f=core.followUpPlan(tg,NOW,1);
 assert.deepEqual(f.data,{title:'Richiamare Giulia Rossi',status:'todo',priority:'normal',due_at:'2026-10-21T07:00:00Z',assignee_id:1,company_id:K1,contact_id:C1,opportunity_id:null});
 command({workspace:W,entity:'tasks',action:'create',data:f.data});
 assert.equal(core.followUpPlan(tg,NOW,0).data.assignee_id,null);
 assert.equal(core.tomorrowAt9(Date.parse('2026-10-24T20:00:00Z')),'2026-10-25T08:00:00Z','DST end: 9:00 is UTC+1 again');
});

test('doneData: the task card update (id, version, status done), valid for the API',()=>{
 const d=core.doneData(task(1,null));assert.deepEqual(d,{id:task(1,null).id,version:3,status:'done'});
 command({workspace:W,entity:'tasks',action:'update',data:d});
 assert.equal(core.doneData({id:'x'}),null,'no version, no write');
});

test('todayEvents and dueLabel',()=>{
 const ev=[{type:'meeting',start:new Date('2026-10-20T08:00:00Z')},{type:'task',start:new Date('2026-10-20T09:00:00Z')},{type:'close',start:new Date('2026-10-20T00:00:00+02:00'),allDay:true},{type:'call',start:new Date('2026-10-21T08:00:00Z')}];
 assert.deepEqual(core.todayEvents(ev,NOW).map(e=>e.type),['meeting','close']);
 assert.equal(core.dueLabel('2026-10-20T15:30:00Z',NOW),'Oggi · 17:30');
 assert.equal(core.dueLabel('2026-10-20T08:00:00Z',NOW),'Scaduta oggi · 10:00');
 assert.equal(core.dueLabel('2026-10-19T08:00:00Z',NOW),'Scaduta ieri · 10:00');
 assert.equal(core.dueLabel('2026-10-16T08:00:00Z',NOW),'Scaduta da 4 giorni · 10:00');
});

test('wiring: menu, loading title, scripts, calendar reuse, writes only through sales.js after a tap',()=>{
 const html=read('radix-sales.html'),at=s=>{const i=html.indexOf(s);assert.ok(i>0,s+' missing');return i};
 assert.ok(at('src="sales/calendar-view.js"')<at('src="sales/crm-today-core.js"')&&at('src="sales/crm-today-core.js"')<at('src="sales/crm-today.js"'));
 assert.ok(at('href="sales/crm-today.css"')<at('<script'));
 const nav=read('sales/sales-nav.js');assert.ok(nav.indexOf("'#dashboard'")<nav.indexOf("CRM + '#today', text: 'Oggi'")&&nav.indexOf("'#today'")<nav.indexOf("'/sales-pipeline-premium.html'"));
 assert.match(read('sales/crm-boot.js'),/today: 'Oggi'/);
 assert.match(read('sales/calendar-view.js'),/window\.RadixCrmCalendar=\{events:collect,TYPES\}/);
 const v=read('sales/crm-today.js');
 assert.match(v,/RadixCrmCalendar/);assert.doesNotMatch(v,/function collect|TYPES=\{/,'no second calendar');
 assert.doesNotMatch(v,/fetch\(|\/api\/chat/,'reads and writes through RadixSalesApp.api only, no AI');
 assert.equal((v.match(/action:'(create|update)'/g)||[]).length,3,'call, follow-up, done');
 assert.match(v,/window\.confirm\('Segnare/,'«Fatto» asks first');
 assert.match(v,/'Crea attività'/,'the follow-up is created only from its own button');
 const css=read('sales/crm-today.css');
 assert.equal((css.match(/:root\{/g)||[]).length,1);
 assert.doesNotMatch(css.replace(/:root\{[^}]*\}/,''),/#[0-9a-f]{3,8}\b/i,'colours only in the :root block');
});

test('web app manifest: linked from the CRM, allowed by the CSP, starts on «Oggi», icons exist',()=>{
 const html=read('radix-sales.html');
 assert.ok(html.includes('<link rel="manifest" href="/manifest.webmanifest">'));
 const csp=/http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
 assert.match(csp,/manifest-src 'self'/);assert.match(csp,/default-src 'none'/);
 const m=JSON.parse(read('manifest.webmanifest'));
 assert.equal(m.start_url,'/radix-sales.html#today');assert.equal(m.display,'standalone');assert.equal(m.lang,'it');assert.ok(m.name&&m.short_name.length<=12);
 for(const i of m.icons)assert.ok(fs.existsSync(__dirname+'/..'+i.src),i.src);
 assert.ok(m.icons.some(i=>i.type==='image/svg+xml'&&i.sizes==='any'));
 for(const href of [...html.matchAll(/rel="(?:icon|apple-touch-icon)" href="([^"]+)"/g)].map(x=>x[1]))assert.ok(fs.existsSync(__dirname+'/..'+href),href);
 const vercel=JSON.parse(read('vercel.json'));
 assert.ok(vercel.headers.some(h=>h.source==='/manifest.webmanifest'&&h.headers.some(x=>x.key==='Content-Type'&&/application\/manifest\+json/.test(x.value))));
});
