'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const R=require('../sales/crm-campaign-report-core.js');
const clicks=require('../api/_sales_clicks.js');
const {createHandler}=require('../api/_sales');
const W='5b1d2c3e-4f50-4a61-8b72-9c83d4e5f601';
const enc=s=>encodeURIComponent(s);
const send=(contact,at,campaign,title)=>({contact_id:contact,occurred_at:at,title:'Email: '+(title||campaign||'Oggetto'),k:campaign?enc(campaign):null});
const click=(contact,at,campaign,url)=>({contact_id:contact,campaign,url:url||'https://radix.example/a',clicked_at:at});

test('Europe/Rome: offsets, wall clock to instant, calendar days across DST',()=>{
 assert.equal(R.romeOffset(Date.parse('2026-01-15T12:00:00Z')),60);
 assert.equal(R.romeOffset(Date.parse('2026-07-15T12:00:00Z')),120);
 assert.equal(new Date(R.romeToUtc(2026,10,20,10,0,0)).toISOString(),'2026-10-20T08:00:00.000Z','summer time: UTC+2');
 assert.equal(new Date(R.romeToUtc(2026,11,3,10,0,0)).toISOString(),'2026-11-03T09:00:00.000Z','winter time: UTC+1');
 // 14 calendar days from 10:00 on 20 Oct (CEST) end at 10:00 on 3 Nov (CET): one hour more than 14×24h.
 const t=Date.parse('2026-10-20T08:00:00Z');
 assert.equal(new Date(R.addRomeDays(t,14)).toISOString(),'2026-11-03T09:00:00.000Z');
 assert.equal(R.addRomeDays(t,14)-t,14*864e5+36e5);
 assert.equal(new Date(R.addRomeDays(Date.parse('2026-03-20T09:00:00Z'),14)).toISOString(),'2026-04-03T08:00:00.000Z','spring forward: one hour less');
 assert.equal(R.formatRome('2026-10-20T22:30:00Z'),'21/10/2026 00:30','dates shown in Italian time');
 assert.equal(R.formatRome('2026-10-20T22:30:00Z',false),'21/10/2026');
 assert.equal(R.formatRome('x'),'—');
});

test('unsubscribe stamps from the note written by the unsubscribe link (Rome time, minute precision)',()=>{
 const notes='Cliente storico\n\nDisiscrizione dalle email commerciali tramite link: 21/10/2026 09:05\n\nDisiscrizione dalle email commerciali tramite link: 05/01/2027 18:30';
 assert.deepEqual(R.unsubscribeTimes(notes).map(t=>new Date(t).toISOString()),['2026-10-21T07:05:00.000Z','2027-01-05T17:30:00.000Z']);
 assert.deepEqual(R.unsubscribeTimes(['21/10/2026 09:05','99/99/2026 10:00','bad']).map(t=>new Date(t).toISOString()),['2026-10-21T07:05:00.000Z']);
 assert.deepEqual(R.unsubscribeTimes(null),[]);assert.deepEqual(R.unsubscribeTimes(''),[]);
});

test('rates never divide by zero and format in Italian',()=>{
 assert.equal(R.rate(0,0),null);assert.equal(R.rate(3,0),null);assert.equal(R.rate(1,NaN),null);assert.equal(R.rate(1,4),0.25);
 assert.equal(R.formatRate(null),'—');assert.equal(R.formatRate(0),'0%');assert.equal(R.formatRate(0.25),'25%');assert.equal(R.formatRate(1/3),'33%');assert.equal(R.formatRate(0.0125),'1,3%');assert.equal(R.formatRate(0.05),'5%');
 const r=R.buildReport({clicks:[click('a','2026-10-02T10:00:00Z','Solo clic')]},{now:Date.parse('2026-10-30T00:00:00Z')});
 const c=r.campaigns[0];assert.equal(c.sent,0);assert.equal(c.clickRate,null);assert.equal(c.conversionRate,null);assert.equal(c.unsubscribeRate,null);
 assert.equal(c.clickers,1);assert.equal(c.clickersWithoutSend,1);assert.equal(c.people[0].sentAt,null,'clicker without a logged send stays in the drill-down');
 assert.deepEqual(R.buildReport(null).campaigns,[]);assert.deepEqual(R.buildReport({}).campaigns,[]);
});

test('sends: dedupe per contact, tracked campaigns by k=, untracked by identical title (2+ contacts)',()=>{
 const data={sends:[
  send('a','2026-10-01T08:00:00Z','Autunno'),send('a','2026-10-02T08:00:00Z','Autunno'),send('b','2026-10-01T08:05:00Z','Autunno'),
  send('c','2026-10-03T08:00:00Z',null,'Novità di ottobre'),send('d','2026-10-03T08:00:00Z',null,'Novità di ottobre'),
  send('e','2026-10-03T08:00:00Z',null,'Anna, una proposta'),send('f','2026-10-03T08:00:00Z',null,'Bruno, una proposta'),
  {contact_id:'g',occurred_at:'2026-10-03T08:00:00Z',title:'Clic sull’email: Autunno',k:null},
  {contact_id:'h',occurred_at:'2026-10-03T08:00:00Z',title:'Email: x',k:'%E0%A4%A'},
  {contact_id:null,occurred_at:'2026-10-03T08:00:00Z',title:'Email: Autunno',k:enc('Autunno')}
 ]};
 const r=R.buildReport(data,{now:Date.parse('2026-12-01T00:00:00Z')}),by=Object.fromEntries(r.campaigns.map(c=>[c.name,c]));
 assert.deepEqual(Object.keys(by).sort(),['Autunno','Novità di ottobre']);
 assert.equal(by.Autunno.sent,2);assert.equal(by.Autunno.sendRecords,3);assert.equal(by.Autunno.tracked,true);
 assert.equal(by.Autunno.people.find(p=>p.contact_id==='a').sentAt,Date.parse('2026-10-01T08:00:00Z'),'first send counts');
 assert.equal(by.Autunno.firstSentAt,Date.parse('2026-10-01T08:00:00Z'));assert.equal(by.Autunno.lastSentAt,Date.parse('2026-10-01T08:05:00Z'));
 assert.equal(by['Novità di ottobre'].tracked,false);assert.equal(by['Novità di ottobre'].sent,2);
 assert.equal(R.decodeK('%E0%A4%A'),null,'broken encoding ignored');assert.equal(R.decodeK(enc('Proposta autunno')),'Proposta autunno');
});

test('clicks: unique vs total, repeat clicks, rate on recipients, most clicked links',()=>{
 const data={sends:[send('a','2026-10-01T08:00:00Z','C'),send('b','2026-10-01T08:00:00Z','C'),send('c','2026-10-01T08:00:00Z','C'),send('d','2026-10-01T08:00:00Z','C')],
  clicks:[click('a','2026-10-01T09:00:00Z','C','https://x.it/1'),click('a','2026-10-01T09:10:00Z','C','https://x.it/1'),click('a','2026-10-02T09:00:00Z','C','https://x.it/2'),
   click('b','2026-10-03T09:00:00Z','C','https://x.it/2'),click('z','2026-10-03T09:00:00Z','C','https://x.it/2'),click('a','2026-10-03T09:00:00Z','Altra')]};
 const c=R.buildReport(data,{now:Date.parse('2026-12-01T00:00:00Z')}).campaigns.find(x=>x.name==='C');
 assert.equal(c.clicks,5);assert.equal(c.clickers,3);assert.equal(c.clickersSent,2);assert.equal(c.repeatClicks,2);assert.equal(c.clickRate,0.5);
 assert.deepEqual(c.links,[{url:'https://x.it/2',clicks:3,people:3},{url:'https://x.it/1',clicks:2,people:1}]);
 const a=c.people.find(p=>p.contact_id==='a');assert.equal(a.clicks,3);assert.equal(a.firstClickAt,Date.parse('2026-10-01T09:00:00Z'));
 assert.equal(c.lastClickAt,Date.parse('2026-10-03T09:00:00Z'));
});

test('conversions: what counts, once per recipient, inside the Rome calendar window',()=>{
 const S='2026-10-20T08:00:00Z';
 const data={sends:['a','b','c','d','e','f','g','h'].map(id=>send(id,S,'Q4')),
  contacts:[{id:'a',name:'Anna'},{id:'b',name:'Bruno'},{id:'c',name:'Carla',company_id:'co1'},{id:'d',name:'Dario'},{id:'e',name:'Elisa'},{id:'f',name:'Fabio'},{id:'g',name:'Gina'},{id:'h',name:'Ugo'}],
  followups:[
   {id:'i1',contact_id:'a',kind:'meeting',title:'Demo',occurred_at:'2026-10-22T09:00:00Z'},
   {id:'i2',contact_id:'a',kind:'call',title:'Chiamata',occurred_at:'2026-10-21T09:00:00Z'},
   {id:'i3',contact_id:'b',kind:'email',title:'Re: Q4',occurred_at:'2026-10-25T09:00:00Z'},
   {id:'i4',contact_id:'d',kind:'email',title:'Risposta al ticket: problema',occurred_at:'2026-10-21T09:00:00Z'},
   {id:'i5',contact_id:'d',kind:'email',title:'Clic sull’email: Q4',occurred_at:'2026-10-21T09:00:00Z'},
   {id:'i6',contact_id:'d',kind:'note',title:'Re: nota',occurred_at:'2026-10-21T09:00:00Z'},
   {id:'i7',contact_id:'e',kind:'meeting',title:'Prima',occurred_at:'2026-10-19T09:00:00Z'},
   {id:'i8',contact_id:'e',kind:'call',title:'Stesso istante',occurred_at:S},
   {id:'i9',contact_id:'f',kind:'meeting',title:'Al limite',occurred_at:'2026-11-03T09:00:00Z'},
   {id:'i10',contact_id:'g',kind:'meeting',title:'Un secondo dopo',occurred_at:'2026-11-03T09:00:01Z'},
   {id:'i11',contact_id:'h',kind:'email',title:'R: offerta',occurred_at:'2026-10-27T09:00:00Z'}],
  opportunities:[{id:'o1',title:'Rinnovo',contact_id:null,company_id:'co1',created_at:'2026-10-28T10:00:00Z'},{id:'o0',title:'Vecchia',contact_id:'b',company_id:null,created_at:'2026-09-01T10:00:00Z'}]};
 const r=R.buildReport(data,{days:14,now:Date.parse('2026-12-01T00:00:00Z')}),c=r.campaigns[0],p=Object.fromEntries(c.people.map(x=>[x.contact_id,x]));
 assert.equal(p.a.conversion.type,'call','the first event wins');assert.equal(p.a.conversion.id,'i2');
 assert.equal(p.b.conversion.type,'reply');assert.equal(p.h.conversion.type,'reply','«R:» is a reply');
 assert.equal(p.c.conversion.type,'opportunity','opportunity on the contact’s company');assert.equal(p.c.conversion.entity,'opportunities');assert.equal(p.c.conversion.id,'o1');
 assert.equal(p.d.conversion,null,'ticket replies, click entries and notes do not count');
 assert.equal(p.e.conversion,null,'before or at the send does not count');
 assert.equal(p.f.conversion.type,'meeting','end of the window is inclusive (10:00 Rome on 3 Nov = 09:00Z after DST)');
 assert.equal(p.g.conversion,null,'one second after the window');
 assert.equal(c.conversions,5);assert.equal(c.conversionRate,5/8);assert.deepEqual(c.conversionsBy,{reply:2,meeting:1,call:1,opportunity:1});
 assert.equal(c.windowOpen,0);
 assert.equal(R.buildReport(data,{days:7,now:Date.parse('2026-12-01T00:00:00Z')}).campaigns[0].conversions,3,'7 days (to 27 Oct 10:00 Rome, end inclusive): the 28 Oct opportunity and the 3 Nov meeting fall out');
 assert.equal(R.buildReport(data,{days:30,now:Date.parse('2026-12-01T00:00:00Z')}).campaigns[0].conversions,6,'30 days: the 3 Nov meeting of Gina counts');
 assert.equal(R.buildReport(data,{days:99}).days,14,'only 7/14/30, default 14');
 assert.equal(R.buildReport(data,{days:14,now:Date.parse('2026-10-25T00:00:00Z')}).campaigns[0].windowOpen,8,'windows still open are reported');
 assert.match(r.conversionNote,/entro 14 giorni/);
 assert.equal(R.isReply('Risposta: ok'),true);assert.equal(R.isReply('Risposta al ticket: x'),false);assert.equal(R.isReply('Email: Re: x'),false);assert.equal(R.isReply('re:x'),true);
});

test('unsubscribes: stamp attributed to the latest campaign received before it; consent lost without a date counted apart',()=>{
 const data={sends:[send('a','2026-10-01T08:00:00Z','Prima'),send('a','2026-10-10T08:00:00Z','Seconda'),send('b','2026-10-01T08:00:00Z','Prima'),send('c','2026-10-01T08:00:00Z','Prima'),send('d','2026-10-10T08:30:20Z','Seconda')],
  contacts:[{id:'a',name:'A',marketing_consent:false,unsubscribed:['10/10/2026 11:00']},{id:'b',name:'B',marketing_consent:false,unsubscribed:['02/10/2026 09:00']},{id:'c',name:'C',marketing_consent:false,unsubscribed:null},{id:'d',name:'D',marketing_consent:false,unsubscribed:['10/10/2026 10:30']}]};
 const r=R.buildReport(data,{now:Date.parse('2026-12-01T00:00:00Z')}),by=Object.fromEntries(r.campaigns.map(c=>[c.name,c]));
 assert.equal(by.Prima.unsubscribed,1,'only B: A unsubscribed after the second campaign');assert.equal(by.Prima.unsubscribedNoDate,1,'C has no stamp');
 assert.equal(by.Seconda.unsubscribed,2,'A, and D in the same minute as the send (10:30 Rome = 08:30Z)');
 assert.equal(by.Prima.unsubscribeRate,1/3);
 assert.equal(by.Seconda.people.find(p=>p.contact_id==='a').unsubscribedAt,Date.parse('2026-10-10T09:00:00Z'));
});

test('campaign table sorting: by any column, missing rates last, ties by name',()=>{
 const list=[{name:'B',sent:10,clickRate:0.2,lastSentAt:3},{name:'A',sent:0,clickRate:null,lastSentAt:null,lastClickAt:5},{name:'C',sent:10,clickRate:0.5,lastSentAt:1}];
 assert.deepEqual(R.sortCampaigns(list,'clickRate','desc').map(c=>c.name),['C','B','A']);
 assert.deepEqual(R.sortCampaigns(list,'clickRate','asc').map(c=>c.name),['B','C','A']);
 assert.deepEqual(R.sortCampaigns(list,'sent','desc').map(c=>c.name),['B','C','A']);
 assert.deepEqual(R.sortCampaigns(list,'name','asc').map(c=>c.name),['A','B','C']);
 assert.deepEqual(R.sortCampaigns(list,'date','desc').map(c=>c.name),['A','B','C'],'clicks-only campaigns use their last click');
 assert.deepEqual(R.sortCampaigns(list,'nope','desc').map(c=>c.name),['A','B','C']);
});

test('not measured: opens, CTOR, delivered/bounce are said, never invented',()=>{
 assert.match(R.NOT_MEASURED.opens,/^Aperture: non ancora misurate/);assert.match(R.NOT_MEASURED.delivered,/non disponibili/);assert.match(R.NOT_MEASURED.ctor,/non calcolabile/);
 const c=R.buildReport({sends:[send('a','2026-10-01T08:00:00Z','X')]}).campaigns[0];
 for(const k of ['opens','openRate','ctor','delivered','bounces'])assert.equal(Object.hasOwn(c,k),false,k);
 const ui=fs.readFileSync(__dirname+'/../sales/crm-campaign-report.js','utf8');
 assert.match(ui,/Aperture: non ancora misurate/);assert.match(ui,/non disponibile/);assert.doesNotMatch(ui,/\/api\/chat|RadixCrmCopilot/,'no AI calls');
});

test('server: campaign rows are read-only, bounded and never return email bodies',async()=>{
 const calls=[];const sql=async(q,p)=>{calls.push([q,p]);return []};
 const d=await clicks.campaignData(sql,W);
 assert.deepEqual(Object.keys(d),['sends','clicks','contacts','followups','opportunities']);
 assert.equal(calls.length,5);
 for(const [q,p] of calls){assert.deepEqual(p,[W]);assert.match(q,/^\s*SELECT/);assert.doesNotMatch(q,/INSERT|UPDATE|DELETE/);assert.match(q,/LIMIT \d+/);assert.match(q,/workspace_id=\$1/)}
 assert.match(calls[0][0],/substring\(s\.body from '\[\?&\]k=\(\[\^&\[:space:\]\]\+\)&u='\) AS k/);assert.doesNotMatch(calls[0][0],/SELECT[^F]*\bs\.body\b\s*,/,'body only inside substring');
 assert.match(calls[0][0],/title LIKE 'Email: %'/);
 assert.match(calls[2][0],/Disiscrizione dalle email commerciali tramite link: /);
 assert.match(calls[3][0],/kind IN \('meeting','call'\)/);assert.match(calls[3][0],/\^\\s\*\(re\|r\|risposta\)\\s\*:/);
 // The SQL reply filter and the core agree.
 const re=new RegExp(calls[3][0].match(/~\* '([^']+)'/)[1],'i');for(const t of ['Re: x','R: x','risposta: x','Risposta al ticket: x','Email: x'])assert.equal(re.test(t),R.isReply(t),t);
 const stamp=calls[2][0].match(/'(Disiscrizione[^']+)'/)[1];assert.ok(new RegExp(stamp).test('Disiscrizione dalle email commerciali tramite link: 21/10/2026 09:05'));
 const unsub=fs.readFileSync(__dirname+'/../api/_sales_unsubscribe.js','utf8');assert.match(unsub,/'Disiscrizione dalle email commerciali tramite link: '\|\|to_char\(now\(\) AT TIME ZONE 'Europe\/Rome','DD\/MM\/YYYY HH24:MI'\)/,'stamp format the report parses');
});

test('sales API: report=campaigns for members only, other values refused, plain report unchanged',async()=>{
 const res=()=>{const r={headers:{},setHeader(a,v){r.headers[a]=v},status(s){r.code=s;return r},json(b){r.body=b;return r},send(b){r.body=b;return r},end(){return r}};return r};
 const seen=[];const store={sql:async q=>{seen.push(q);return /GROUP BY campaign/.test(q)?[{campaign:'C',clicks:1,people:1,last_at:'2026-10-17T20:00:00Z'}]:/title LIKE 'Email: %' AND s.contact_id IS NOT NULL AND s.occurred_at>=now\(\)-interval '400 days' ORDER BY/.test(q)?[{contact_id:'a',occurred_at:'2026-10-17T08:00:00Z',title:'Email: C',k:'C'}]:[]},membership:async()=>({role:'viewer'})};
 const h=createHandler({getSessionUser:()=>({uid:7}),getStore:()=>store});
 let r=res();await h({method:'GET',headers:{},query:{entity:'email_clicks',workspace:W,offset:'0',report:'campaigns'}},r);
 assert.equal(r.code,200);assert.equal(r.body.campaigns[0].campaign,'C');assert.equal(r.body.report.sends.length,1);assert.ok(Array.isArray(r.body.rows));
 r=res();await h({method:'GET',headers:{},query:{entity:'email_clicks',workspace:W,offset:'0',report:'tutto'}},r);assert.equal(r.code,400);
 const before=seen.length;r=res();await h({method:'GET',headers:{},query:{entity:'email_clicks',workspace:W,offset:'0'}},r);assert.equal(r.code,200);assert.equal(r.body.report,undefined);assert.equal(seen.length-before,4,'plain report: same 4 queries as before');
 store.membership=async()=>null;r=res();await h({method:'GET',headers:{},query:{entity:'email_clicks',workspace:W,offset:'0',report:'campaigns'}},r);assert.equal(r.code,403);
});

test('store: click timestamps keep their value (a driver Date is not flattened to {})',()=>{
 const {normalize}=require('../api/_sales_store');
 const out=normalize([{campaign:'C',last_at:new Date('2026-10-17T20:00:00Z'),clicked_at:new Date('2026-10-17T21:00:00Z'),occurred_at:new Date('2026-10-17T22:00:00Z')}]);
 assert.deepEqual(out,[{campaign:'C',last_at:'2026-10-17T20:00:00.000Z',clicked_at:'2026-10-17T21:00:00.000Z',occurred_at:'2026-10-17T22:00:00.000Z'}]);
});

test('page wiring: core before UI, stylesheet in head, report opened from «Risultati e report campagne»',()=>{
 const html=fs.readFileSync(__dirname+'/../radix-sales.html','utf8');
 const core=html.indexOf('src="sales/crm-campaign-report-core.js"'),ui=html.indexOf('src="sales/crm-campaign-report.js"');
 assert.ok(core>0&&ui>core);assert.match(html,/<link rel="stylesheet" href="sales\/crm-campaign-report\.css">/);
 assert.ok(html.indexOf('crm-campaign-report.css')<html.indexOf('</head>'));
 const camp=fs.readFileSync(__dirname+'/../sales/crm-campaigns.js','utf8');assert.match(camp,/Risultati e report campagne/);assert.match(camp,/RadixCrmCampaignReport\.render\(results\)/);
 assert.equal(fs.existsSync(__dirname+'/../migrations/sales/016_campaign_report.sql'),false,'no migration');
});
