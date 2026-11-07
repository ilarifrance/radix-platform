'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const S=require('../sales/crm-sla-core.js');
const H=require('../sales/crm-home-core.js');
const {command,createHandler}=require('../api/_sales');
const {createStore}=require('../api/_sales_store');
const W='5b1d2c3e-4f50-4a61-8b72-9c83d4e5f601',ID='9220862f-d82e-4c33-a2b2-899d4a77fe16',C='8924f329-b2c2-4032-9be5-2982d9cd8e5c';
const HOUR=36e5,at=s=>Date.parse(s),iso=n=>new Date(n).toISOString();
const res=()=>{const r={headers:{},setHeader(a,v){r.headers[a]=v},status(s){r.code=s;return r},json(b){r.body=b;return r}};return r};
const biz=over=>({...S.copy(S.DEFAULTS),business:true,...over});

test('defaults: urgente 1/8 h, alta 4/24 h, media 8/48 h, bassa 24/120 h, calendar hours; a broken row falls back to them',()=>{
 assert.deepEqual(S.copy(S.DEFAULTS),{business:false,urgent:{response:1,resolution:8},high:{response:4,resolution:24},normal:{response:8,resolution:48},low:{response:24,resolution:120}});
 assert.equal(S.error(S.copy(S.DEFAULTS)),null);
 assert.equal(S.settings(null),S.DEFAULTS);
 assert.equal(S.settings({filters:{sla:{business:true}}}),S.DEFAULTS,'incomplete settings are ignored');
 const custom=biz({urgent:{response:2,resolution:6}});assert.deepEqual(S.settings({filters:{sla:custom}}),custom);
 assert.match(S.error({...custom,urgent:{response:7,resolution:6}}),/prima risposta non può superare/);
 assert.match(S.error({...custom,low:{response:0,resolution:6}}),/ore intere/);
 assert.match(S.error({...custom,low:{response:1.5,resolution:6}}),/ore intere/);
 assert.match(S.error({...custom,high:{response:1,resolution:S.MAX_HOURS+1}}),/ore intere/);
 assert.ok(S.error({...custom,extra:1}));assert.ok(S.error({...custom,business:'si'}));assert.ok(S.error([]));
 const {normal,...missing}=custom;assert.ok(S.error(missing));
 assert.ok(S.same(S.copy(S.DEFAULTS),S.DEFAULTS));assert.ok(!S.same(custom,S.DEFAULTS));
});

test('business hours: lun-ven 09-18 Europe/Rome, weekends skipped, DST change handled',()=>{
 // Wed 21 Oct 2026, 07:00 Rome (CEST, UTC+2): the day starts at 09:00, 9 working hours end at 18:00.
 assert.equal(iso(S.addBusiness(at('2026-10-21T05:00:00Z'),9*HOUR)),'2026-10-21T16:00:00.000Z');
 // Fri 23 Oct 17:00 Rome + 2 h → 1 h on Friday, 1 h on Monday 26 (CET after 25 Oct, UTC+1): 10:00 Rome = 09:00Z.
 assert.equal(iso(S.addBusiness(at('2026-10-23T15:00:00Z'),2*HOUR)),'2026-10-26T09:00:00.000Z');
 // Saturday counts nothing: + 1 h → Monday 10:00 Rome.
 assert.equal(iso(S.addBusiness(at('2026-10-24T10:00:00Z'),HOUR)),'2026-10-26T09:00:00.000Z');
 // After 18:00 the clock waits for the next morning.
 assert.equal(iso(S.addBusiness(at('2026-10-21T17:30:00Z'),30*6e4)),'2026-10-22T07:30:00.000Z');
 assert.equal(S.businessBetween(at('2026-10-23T15:00:00Z'),at('2026-10-26T09:00:00Z')),2*HOUR);
 assert.equal(S.businessBetween(at('2026-10-24T08:00:00Z'),at('2026-10-25T20:00:00Z')),0,'weekend');
 assert.equal(S.businessBetween(at('2026-10-19T00:00:00Z'),at('2026-10-26T00:00:00Z')),45*HOUR,'a full week');
 assert.equal(S.between(at('2026-10-26T09:00:00Z'),at('2026-10-23T15:00:00Z'),true),-2*HOUR);
 // Calendar mode: plain hours.
 assert.equal(S.add(at('2026-10-24T10:00:00Z'),5,false),at('2026-10-24T15:00:00Z'));
 assert.equal(S.parts(at('2026-03-29T08:00:00Z')).h,10,'CEST from 29 March');
});

test('states: ok, in scadenza under 25%, scaduto, rispettato; worst live clock wins',()=>{
 const t={id:'k1',title:'Fattura errata',status:'open',priority:'urgent',created_at:'2026-10-21T08:00:00Z',contact_id:C};
 const ev=(row,now,o)=>S.evaluate(row,{now:at(now),...o});
 let r=ev(t,'2026-10-21T08:30:00Z');assert.equal(r.state,'ok');assert.equal(r.response.state,'ok');assert.equal(r.resolution.due,at('2026-10-21T16:00:00Z'));
 r=ev(t,'2026-10-21T08:50:00Z');assert.equal(r.state,'in-scadenza');assert.equal(S.badge(r).text,'SLA prima risposta: 10 min');
 r=ev(t,'2026-10-21T09:30:00Z');assert.equal(r.state,'scaduto');assert.match(S.badge(r).text,/^SLA scaduto: prima risposta da 30 min$/);
 assert.ok(S.matches(r,'scaduti')&&S.matches(r,'a-rischio')&&!S.matches(r,'in-scadenza')&&S.matches(r,''));
 // The reply recorded by «Rispondi al cliente» stops the response clock.
 const reply={kind:'email',title:'Risposta al ticket: Fattura errata',contact_id:C,occurred_at:'2026-10-21T08:40:00Z'};
 r=ev({...t,status:'pending'},'2026-10-21T09:30:00Z',{interactions:[{...reply,kind:'note'},{...reply,contact_id:ID},reply]});
 assert.equal(r.response.state,'rispettato');assert.equal(r.response.at,at(reply.occurred_at));assert.equal(r.state,'ok','only the resolution clock is live');
 assert.equal(S.firstReply(t,[{...reply,occurred_at:'2026-10-20T08:00:00Z'}]),null,'a reply before the ticket is not its reply');
 // Pending with no recorded reply: no response SLA.
 r=ev({...t,status:'pending'},'2026-10-21T09:30:00Z');assert.equal(r.response,null);assert.equal(r.state,'ok');
 // Resolved: rispettato or late.
 r=ev({...t,status:'resolved',resolved_at:'2026-10-21T08:45:00Z'},'2026-10-22T09:00:00Z');assert.equal(r.state,'rispettato');assert.equal(r.active,false);assert.equal(S.badge(r).text,'SLA rispettato');assert.ok(!S.matches(r,'a-rischio'));
 r=ev({...t,status:'closed',resolved_at:'2026-10-21T18:00:00Z'},'2026-10-22T09:00:00Z');assert.equal(r.state,'scaduto');assert.match(S.badge(r).text,/non rispettato/);assert.ok(!S.matches(r,'scaduti'),'closed tickets never match the filter');
 // Business hours: a «bassa» ticket opened Friday evening is still fine on Monday morning.
 r=ev({...t,priority:'low',created_at:'2026-10-23T17:00:00Z'},'2026-10-26T08:00:00Z',{settings:biz()});
 assert.equal(r.state,'ok');assert.equal(r.business,true);assert.match(S.badge(r).text,/lavorative$/);
 assert.equal(ev({...t,priority:'low',created_at:'2026-10-23T17:00:00Z'},'2026-10-26T08:00:00Z').state,'scaduto','calendar hours: 24 h passed');
 assert.equal(S.evaluate({...t,created_at:'bad'},{now:0}),null);
 assert.equal(ev({...t,priority:'mystery'},'2026-10-21T08:30:00Z').priority,'normal');
 assert.deepEqual(S.summary([t,{...t,id:'k2',created_at:'2026-10-21T09:20:00Z'},{...t,id:'k3',status:'closed',resolved_at:'2026-10-21T09:00:00Z'}],{now:at('2026-10-21T09:30:00Z')}),{scaduto:1,'in-scadenza':0,ok:1});
 assert.equal(S.duration(26*HOUR+5*6e4),'1 g 2 h');assert.equal(S.duration(3*HOUR+20*6e4),'3 h 20 min');
});

test('server: «__sla__» is validated, kept apart from segments and hidden from the segments list',async()=>{
 const cmd=(action,data)=>command({workspace:W,entity:'segments',action,data});
 const sla=S.copy(S.DEFAULTS);
 assert.equal(cmd('create',{name:'__sla__',filters:{sla}}).data.name,'__sla__');
 assert.throws(()=>cmd('create',{name:'__sla__',filters:{city:'Milano'}}),/riservato alle scadenze SLA/);
 assert.throws(()=>cmd('create',{name:'Milano',filters:{sla}}),/riservato alle scadenze SLA/);
 assert.throws(()=>cmd('create',{name:'__sla__',filters:{sla:{...sla,urgent:{response:9,resolution:8}}}}),/Scadenze SLA non valide: Priorità urgente/);
 assert.throws(()=>cmd('create',{name:'__sla__',filters:{sla,city:'Roma'}}),/Scadenze SLA non valide|riservato/);
 assert.equal(cmd('update',{id:ID,version:1,filters:{sla}}).data.filters.sla.urgent.response,1);
 assert.throws(()=>cmd('create',{name:'__sla__',filters:{rules:[]}}),/riservato/,'one reserved name, its own filters');
 assert.throws(()=>cmd('create',{name:'__regole__',filters:{sla}}),/riservato/);
 assert.throws(()=>cmd('create',{name:'X',filters:{sla,rules:[]}}),/non valid/);
 // Store: the plain list excludes reserved rows; subject=sla reads only that one.
 const seen=[];const store=createStore(async(q,p)=>{seen.push([q,p]);return []});
 await store.read({workspace:W,entity:'segments',offset:0},7);
 assert.match(seen[0][0],/lower\(btrim\(t\.name\)\)<>ALL\(\$4::text\[\]\)/);assert.deepEqual(seen[0][1][3],['__regole__','__sla__','__visibilita__','__trova_email__']);
 await store.read({workspace:W,entity:'segments',offset:0,reserved:'__sla__'},7);
 assert.match(seen[1][0],/lower\(btrim\(t\.name\)\)=\$4/);assert.equal(seen[1][1][3],'__sla__');
 // Handler: GET subject=sla for every member; writes on the row for owners/admins only.
 const calls=[];let role='member',existing='__sla__';
 const fake={membership:async()=>({role}),sql:async(q,p)=>{calls.push(q);return /SELECT name FROM sales_segments/.test(q)?[{name:existing}]:[]},read:async c=>[{c}],command:async c=>({ok:c.entity})};
 const h=createHandler({getSessionUser:()=>({uid:7}),getStore:()=>fake});
 const get=async q=>{const r=res();await h({method:'GET',headers:{},query:q},r);return r};
 const post=async(action,data)=>{const r=res();await h({method:'POST',headers:{'x-radix-sales':'1','content-type':'application/json'},query:{},body:{workspace:W,entity:'segments',action,data}},r);return r};
 let r=await get({entity:'segments',workspace:W,subject:'sla'});assert.equal(r.code,200);assert.equal(r.body.rows[0].c.reserved,'__sla__');
 r=await get({entity:'segments',workspace:W});assert.equal(r.body.rows[0].c.reserved,undefined);
 r=await get({entity:'segments',workspace:W,subject:'rules'});assert.equal(r.code,200);assert.equal(r.body.rows[0].c.reserved,'__regole__','the rules row shares the same helper');
 assert.equal((await get({entity:'segments',workspace:W,subject:'reports'})).code,400);
 assert.equal((await get({entity:'segments',workspace:W,subject:'sla',offset:'100'})).code,400);
 r=await post('create',{name:'__sla__',filters:{sla}});assert.equal(r.code,403);assert.match(r.body.error,/owner e admin/);
 r=await post('update',{id:ID,version:1,filters:{sla}});assert.equal(r.code,403);
 r=await post('delete',{id:ID,version:1});assert.equal(r.code,403);
 existing='Decisori Milano';r=await post('delete',{id:ID,version:1});assert.equal(r.code,200,'a member still deletes a plain segment');
 r=await post('update',{id:ID,version:1,filters:{sla}});assert.equal(r.code,400,'a segment cannot become the SLA row');
 role='admin';existing='__sla__';
 r=await post('update',{id:ID,version:1,filters:{sla:{...sla,business:true}}});assert.equal(r.code,200);
 r=await post('update',{id:ID,version:1,filters:{city:'Milano'}});assert.equal(r.code,400,'the SLA row stays SLA');
 r=await post('update',{id:ID,version:1,filters:{rules:[]}});assert.equal(r.code,400,'the SLA row cannot become the rules row');
 r=await post('create',{name:'__sla__',filters:{sla}});assert.equal(r.code,200);
});

test('Panoramica: «Scadenza SLA» only with settings, and it wins over «Ticket da seguire»',()=>{
 const now=at('2026-10-21T12:00:00Z');
 const tickets=[{id:'k1',title:'Bloccato',status:'open',priority:'high',created_at:'2026-10-21T07:00:00Z'},{id:'k2',title:'Lento',status:'pending',priority:'urgent',created_at:'2026-10-21T04:30:00Z'},{id:'k3',title:'Calmo',status:'open',priority:'low',created_at:'2026-10-21T11:00:00Z'}];
 assert.ok(!H.suggestions({tickets},{now}).items.some(i=>i.rule==='ticket-sla'),'without settings nothing changes');
 const items=H.suggestions({tickets},{now,sla:S.DEFAULTS}).items,by=id=>items.find(i=>i.key==='tickets:'+id);
 assert.equal(by('k1').rule,'ticket-sla');assert.equal(by('k1').urgency,3);assert.match(by('k1').reason,/SLA scaduto: prima risposta/);
 assert.equal(by('k2').rule,'ticket-sla');assert.equal(by('k2').urgency,2);assert.match(by('k2').reason,/^SLA risoluzione: 30 min · priorità urgente\.$/);
 assert.equal(by('k3').rule,'ticket-open');
 assert.equal(H.RULES.find(r=>r.id==='ticket-sla').name,'Scadenza SLA');
});

test('page wiring: scripts in order, hooks on the ticket cards and section, settings for owners/admins',()=>{
 const html=fs.readFileSync(__dirname+'/../radix-sales.html','utf8'),i=f=>html.indexOf(f);
 assert.ok(i('sales/crm-sla-core.js')>i('sales/crm-tools.js')&&i('sales/crm-sla-core.js')<i('sales/crm-sla.js'),'deferred: both run before the first render');
 assert.ok(i('src="sales/crm-sla.js" defer')>0&&i('src="sales/crm-sla-core.js" defer')>0);
 assert.ok(i('sales/crm-sla.css')>0);
 const tools=fs.readFileSync(__dirname+'/../sales/crm-tools.js','utf8');
 assert.match(tools,/entity==='tickets'\)window\.RadixCrmSla\?\.mount\(c,row\)/);assert.match(tools,/entity==='tickets'\)window\.RadixCrmSla\?\.section\(section\)/);
 const ui=fs.readFileSync(__dirname+'/../sales/crm-sla.js','utf8');
 assert.match(ui,/'Scadenze SLA'/);assert.match(ui,/\['owner','admin'\]\.includes/);assert.match(ui,/subject:'sla'/);assert.match(ui,/Solo scaduti/);
 assert.doesNotMatch(ui,/api\/chat|send_email|sendEmail/);
 assert.match(fs.readFileSync(__dirname+'/../sales/dashboard-view.js','utf8'),/sla:window\.RadixCrmSla\?\.current\(\)/);
});
