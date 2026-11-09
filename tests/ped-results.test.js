'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const pr=require('../lib/ped-results.js');

test('num reads Italian and English number formats, percent and empty cells',()=>{
 assert.equal(pr.num('1.234'),1234);assert.equal(pr.num('1,234'),1234);assert.equal(pr.num('12,5%'),12.5);assert.equal(pr.num('12.5'),12.5);
 assert.equal(pr.num('1.234,5'),1234.5);assert.equal(pr.num('1,234.5'),1234.5);assert.equal(pr.num('1.234.567'),1234567);assert.equal(pr.num('0.125'),0.125);
 assert.equal(pr.num(' 3 456 '),3456);assert.equal(pr.num(42),42);
 for(const v of ['','-','—','n/a','N/D',null,undefined,'abc'])assert.equal(pr.num(v),null,String(v));
});

test('engagement rate: interactions on reach, else impressions; null without data, missing metrics are not zero',()=>{
 assert.equal(pr.engagementRate({impressions:1000,reach:500,reactions:20,comments:4,shares:1,clicks:null}),5);
 assert.equal(pr.engagementRate({impressions:1000,reach:null,reactions:20,comments:null,shares:null,clicks:null}),2);
 assert.equal(pr.engagementRate({impressions:null,reach:null,reactions:20}),null);
 assert.equal(pr.engagementRate({impressions:1000,reach:500,reactions:null,comments:null,shares:null,clicks:null}),null);
});

test('normalizeBufferPost maps Buffer metric types, sums reposts into shares, leaves missing ones null',()=>{
 const n=pr.normalizeBufferPost({id:'p1',channelId:'ch1',channelService:'LinkedIn',sentAt:'2026-10-06T07:30:00Z',dueAt:'2026-10-06T07:30:00Z',externalLink:'https://www.linkedin.com/feed/update/1',metricsUpdatedAt:'2026-10-07T03:00:00Z',
  metrics:[{type:'impressions',value:1200,unit:'count'},{type:'reactions',value:30},{type:'comments',value:'4'},{type:'shares',value:2},{type:'reposts',value:3},{type:'engagementRate',value:3.1,unit:'percentage'},{type:'saves',value:5}]});
 assert.deepEqual(n,{postId:'p1',channel:'linkedin',channelId:'ch1',publishedAt:'2026-10-06T07:30:00Z',link:'https://www.linkedin.com/feed/update/1',
  metrics:{impressions:1200,reach:null,reactions:30,comments:4,shares:5,clicks:null},engagementRate:3.1,updatedAt:'2026-10-07T03:00:00Z'});
 const old=pr.normalizeBufferPost({id:'p2',metrics:[{type:'favorites',value:7},{type:'replies',value:1},{type:'retweets',value:2}]});
 assert.deepEqual(old.metrics,{impressions:null,reach:null,reactions:7,comments:1,shares:2,clicks:null});
 assert.equal(pr.normalizeBufferPost({id:'p3',channelService:'facebook',metrics:[{type:'likes',value:9}]}).metrics.reactions,9);
 assert.deepEqual(pr.normalizeBufferPost({id:'p4',metrics:null}).metrics,{impressions:null,reach:null,reactions:null,comments:null,shares:null,clicks:null});
 assert.equal(pr.normalizeBufferPost({id:'p5',externalLink:'javascript:alert(1)'}).link,null);
 assert.equal(pr.normalizeBufferPost(null),null);
});

test('CSV columns are mapped by header name in Italian and English, exact names only',()=>{
 const it=pr.mapColumns(['Identificativo del post','Ora di pubblicazione','Permalink','Copertura','Impressioni','Reazioni, commenti e condivisioni','Reazioni','Commenti','Condivisioni','Clic totali']);
 assert.deepEqual(it,{date:1,link:2,impressions:4,reach:3,reactions:6,comments:7,shares:8,clicks:9});
 const en=pr.mapColumns(['Post title','Post link','Created date','Impressions','Clicks','Click through rate (CTR)','Likes','Comments','Reposts','Engagement rate']);
 assert.deepEqual(en,{date:2,link:1,title:0,impressions:3,reactions:6,comments:7,shares:8,clicks:4,engagementRate:9});
});

test('importCsv: Meta Business Suite export in Italian (semicolons, «1.234», «12,5%», d/m/y)',()=>{
 const csv='﻿Titolo;Ora di pubblicazione;Permalink;Impressioni;Copertura;Reazioni;Commenti;Condivisioni;Clic totali;Tasso di engagement\n'+
  '"Lancio; nuovo servizio";05/10/2026 09:30;https://www.facebook.com/radix/posts/1;1.234;980;45;6;3;12;"5,8%"\n'+
  'Riga vuota;;;;;;;;;\n'+
  'Dietro le quinte;12/10/2026 18:05;https://www.instagram.com/p/abc;2.050;1.500;120;-;n/a;;12,5%\n';
 const r=pr.importCsv(csv);
 assert.equal(r.rows.length,2);assert.equal(r.skipped,1);assert.equal(r.dayFirst,true);
 assert.deepEqual(r.rows[0],{date:'2026-10-05',time:'09:30',link:'https://www.facebook.com/radix/posts/1',title:'Lancio; nuovo servizio',channel:'facebook',metrics:{impressions:1234,reach:980,reactions:45,comments:6,shares:3,clicks:12},engagementRate:5.8});
 assert.deepEqual(r.rows[1].metrics,{impressions:2050,reach:1500,reactions:120,comments:null,shares:null,clicks:null});
 assert.equal(r.rows[1].channel,'instagram');assert.equal(r.rows[1].engagementRate,12.5);
 assert.equal(r.mapping.impressions,'Impressioni');
});

test('importCsv: LinkedIn export in English with a note row above, m/d/y, fraction engagement, default channel',()=>{
 const csv='All posts from 09/01/2026 to 10/20/2026,,,,,,,,\n'+
  'Post title,Post link,Created date,Impressions,Clicks,Likes,Comments,Reposts,Engagement rate\n'+
  'Case study,https://www.linkedin.com/feed/update/urn:li:activity:1,10/06/2026,"1,234",40,30,5,2,0.0624\n';
 const r=pr.importCsv(csv,{channel:'linkedin'});
 assert.equal(r.rows.length,1);assert.equal(r.dayFirst,false);
 assert.equal(r.rows[0].date,'2026-10-06');assert.equal(r.rows[0].channel,'linkedin');
 assert.deepEqual(r.rows[0].metrics,{impressions:1234,reach:null,reactions:30,comments:5,shares:2,clicks:40});
 assert.equal(r.rows[0].engagementRate,6.24);
 assert.match(pr.importCsv('a,b\n1,2').error,/colonne/);
});

test('parseDate: ISO, impossible day/month decides, then the header language; 12h clock',()=>{
 assert.deepEqual(pr.parseDate('2026-10-05T09:00:00+0000'),{date:'2026-10-05',time:'09:00'});
 assert.deepEqual(pr.parseDate('25/10/2026',false),{date:'2026-10-25',time:''});
 assert.deepEqual(pr.parseDate('10/25/2026',true),{date:'2026-10-25',time:''});
 assert.equal(pr.parseDate('05/10/2026',true).date,'2026-10-05');assert.equal(pr.parseDate('05/10/2026',false).date,'2026-05-10');
 assert.deepEqual(pr.parseDate('10/06/2026 6:05 PM',false),{date:'2026-10-06',time:'18:05'});
 assert.equal(pr.parseDate('ieri'),null);
});

test('matchRows: same link first, then same day and channel, title words decide, a content is used once',()=>{
 const contents=[{id:'a',title:'Lancio nuovo servizio',channel:'Facebook',date:'2026-10-05',time:'09:30',copy:''},{id:'b',title:'Dietro le quinte del team',channel:'Instagram',date:'2026-10-12',time:'18:00',copy:''},
  {id:'c',title:'Caso cliente logistica',channel:'Instagram',date:'2026-10-12',time:'09:00',copy:''},{id:'d',title:'Altro',channel:'LinkedIn',date:'2026-10-01',copy:'',stats:{link:'https://www.linkedin.com/x/'}}];
 const m=pr.matchRows(contents,[{date:'2026-10-05',channel:'facebook',title:'',link:''},{date:'2026-10-12',channel:'instagram',title:'Il team dietro le quinte',link:''},{date:'2026-09-01',channel:'linkedin',title:'',link:'https://www.linkedin.com/x'},{date:'2026-10-05',channel:'facebook',title:'',link:''},{date:'2026-10-30',channel:'x',title:'',link:''}]);
 assert.deepEqual(m.map(x=>[x.contentId,x.how]),[['a','data e canale'],['b','data e canale'],['d','link'],[null,''],[null,'']]);
});

test('mergeStats keeps a metric the new source does not report',()=>{
 const prev={source:'csv',metrics:{impressions:100,reach:null,reactions:1,comments:0,shares:0,clicks:9},link:'https://l'};
 const next=pr.statsFromBuffer({postId:'p',link:null,publishedAt:'2026-10-05T07:00:00Z',metrics:{impressions:150,reach:120,reactions:3,comments:1,shares:0,clicks:null},engagementRate:null},'2026-10-21T10:00:00Z');
 const s=pr.mergeStats(prev,next);
 assert.equal(s.source,'buffer');assert.equal(s.metrics.clicks,9);assert.equal(s.metrics.impressions,150);assert.equal(s.link,'https://l');
});

test('results: totals, engagement over posts with both numbers, per channel, weeks with gaps, best post and best slot',()=>{
 const st=(m,extra)=>({source:'csv',metrics:{impressions:null,reach:null,reactions:null,comments:null,shares:null,clicks:null,...m},...extra});
 const state={contents:[
  {id:'1',title:'A',channel:'LinkedIn',date:'2026-10-06',time:'09:30',stats:st({impressions:1000,reach:800,reactions:30,comments:5,shares:3,clicks:2})},
  {id:'2',title:'B',channel:'LinkedIn',date:'2026-10-08',time:'17:00',stats:st({impressions:500,reach:400,reactions:4})},
  {id:'3',title:'C',channel:'Instagram',date:'2026-10-27',time:'09:15',stats:st({impressions:2000,reach:1000,reactions:90,comments:10})},
  {id:'4',title:'D',channel:'Instagram',date:'2026-10-28',stats:st({impressions:300})},
  {id:'5',title:'Senza numeri',channel:'LinkedIn',date:'2026-10-07'}]};
 const r=pr.results(state);
 assert.equal(r.posts.length,4);
 assert.deepEqual([r.totals.impressions,r.totals.reach,r.totals.reactions,r.totals.comments,r.totals.clicks,r.totals.interactions],[3800,2200,124,15,2,144]);
 assert.equal(r.totals.engagementRate,6.55);// 144 / (800+400+1000)
 assert.deepEqual(r.byChannel.map(c=>[c.channel,c.posts,c.impressions,c.engagementRate]),[['Instagram',2,2300,10],['LinkedIn',2,1500,3.67]]);
 assert.deepEqual(r.weeks.map(w=>[w.start,w.posts,w.impressions]),[['2026-10-05',2,1500],['2026-10-12',0,null],['2026-10-19',0,null],['2026-10-26',2,2300]]);
 assert.equal(r.best.id,'3');assert.equal(r.best.engagementRate,10);
 assert.deepEqual(r.bestSlot,{label:'martedì · mattina (9-12)',posts:2,engagementRate:7.5});// 6 and 27 Oct: 5% and 10%
 assert.deepEqual(pr.sortPosts(r.posts,'impressions','desc').map(p=>p.id),['3','1','2','4']);
 assert.deepEqual(pr.sortPosts(r.posts,'engagementRate','asc').map(p=>p.id),['2','1','3','4']);// null last
 assert.deepEqual(pr.results({contents:[]}).totals.impressions,null);
 const sparse=pr.results({contents:[{id:'x',title:'X',channel:'LinkedIn',date:'2026-01-05',stats:st({impressions:1})},{id:'y',title:'Y',channel:'LinkedIn',date:'2026-10-20',stats:st({impressions:2})}]});
 assert.deepEqual(sparse.weeks.map(w=>w.start),['2026-01-05','2026-10-19']);
});

test('nextStepsPrompt sends aggregated numbers and titles only, never the post text',()=>{
 const state={contents:[{id:'1',title:'Lancio',channel:'LinkedIn',date:'2026-10-06',time:'09:30',copy:'TESTO SEGRETO DEL POST',stats:{metrics:{impressions:1000,reach:800,reactions:30,comments:5,shares:3,clicks:null}}}]};
 const p=pr.nextStepsPrompt(pr.results(state));
 assert.match(p,/«Lancio»/);assert.match(p,/impression 1000/);assert.match(p,/clic n\.d\./);assert.match(p,/"azioni"/);
 assert.doesNotMatch(p,/SEGRETO/);
});

test('parseNextSteps: JSON, fenced JSON with prose, bare array, numbered list fallback, garbage',()=>{
 const json='{"azioni":[{"titolo":"Carosello caso cliente","canale":"LinkedIn","perche":"engagement 6%","come":"martedì 9:30"},{"titolo":"Reel dietro le quinte","perche":"x","come":"y"},{"titolo":"Sondaggio","perche":"","come":""},{"titolo":"Quarto"}]}';
 const a=pr.parseNextSteps(json);assert.equal(a.length,3);assert.deepEqual(a[0],{titolo:'Carosello caso cliente',canale:'LinkedIn',perche:'engagement 6%',come:'martedì 9:30'});
 assert.equal(pr.parseNextSteps('Ecco:\n```json\n'+json+'\n```\nBuon lavoro')[1].titolo,'Reel dietro le quinte');
 assert.equal(pr.parseNextSteps('Ecco le azioni '+json+' fine')[2].titolo,'Sondaggio');
 assert.deepEqual(pr.parseNextSteps('[{"title":"A","why":"b","how":"c"}]'),[{titolo:'A',canale:'',perche:'b',come:'c'}]);
 const list=pr.parseNextSteps('Proposte:\n1. **Carosello**: il formato rende di più\n2) Video breve — più commenti\n- Sondaggio: domanda al pubblico');
 assert.deepEqual(list.map(x=>x.titolo),['Carosello','Video breve','Sondaggio']);assert.equal(list[0].perche,'il formato rende di più');
 assert.deepEqual(pr.parseNextSteps('nessuna idea'),[]);assert.deepEqual(pr.parseNextSteps(null),[]);
});

test('Buffer stats: aliased query with inline ids, normalized items, per-post retry when the batch fails',async()=>{
 const {postStats}=require('../api/_buffer.js');const seen=[];const orig=global.fetch;
 const post=id=>({id,channelService:'instagram',sentAt:'2026-10-06T07:00:00Z',metrics:[{type:'impressions',value:10},{type:'reactions',value:2}]});
 global.fetch=async(url,opts)=>{const q=JSON.parse(opts.body).query;seen.push(q);
  if(/"bad"/.test(q)&&/p1:/.test(q))return {ok:true,status:200,json:async()=>({errors:[{message:'Post not found'}]})};
  if(/"bad"/.test(q))return {ok:true,status:200,json:async()=>({errors:[{message:'Post not found'}]})};
  if(/p0:/.test(q)){const data={};[...q.matchAll(/(p\d+): post\(input: \{ id: "([^"]+)" \}\)/g)].forEach(m=>{data[m[1]]=post(m[2])});return {ok:true,status:200,json:async()=>({data})}}
  const id=/id: "([^"]+)"/.exec(q)[1];return {ok:true,status:200,json:async()=>({data:{post:post(id)}})}};
 try{
  const r=await postStats('k',['a1','a1','x y','a2']);
  assert.equal(seen.length,1);assert.match(seen[0],/p0: post\(input: \{ id: "a1" \}\) \{ id channelId channelService sentAt dueAt externalLink metrics \{ type value unit \} metricsUpdatedAt \}/);
  assert.doesNotMatch(seen[0],/x y/);assert.deepEqual(r.items.map(x=>[x.postId,x.metrics.impressions,x.metrics.reach]),[['a1',10,null],['a2',10,null]]);
  seen.length=0;const r2=await postStats('k',['a1','bad']);
  assert.equal(seen.length,3);assert.deepEqual(r2.items.map(x=>x.postId),['a1']);assert.equal(r2.errors[0].postId,'bad');assert.match(r2.errors[0].error,/not found/);
  global.fetch=async()=>({ok:false,status:403,json:async()=>({})});
  await assert.rejects(postStats('k',['a1']),/chiave Buffer/);
 }finally{global.fetch=orig}
});

test('PED page: «Risultati» panel wired, AI next steps only after confirm, stats kept across content edits',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','project-editorial.html'),'utf8'),src=fs.readFileSync(path.join(__dirname,'..','editorial-workspace.js'),'utf8');
 for(const id of ['results','statsRefresh','statsFile','resultTiles','resultChart','resultPosts','nextSteps','nextStepList'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/<script src="\/lib\/ped-results\.js"><\/script>/);
 const body=src.slice(src.indexOf('async function nextSteps'),src.indexOf('function renderNextSteps'));
 assert.ok(body.indexOf('await askConfirm(')>0&&body.indexOf('await askConfirm(')<body.indexOf('rt.reply('),'the RADIX confirmation before the AI call');assert.match(body,/crediti API/);assert.ok(!/[^.\w]confirm\(/.test(body),'no native confirm');
 assert.doesNotMatch(body,/tools\(\)|clientFacts|project:/);
 const core=require('../editorial-core.js'),state=core.create({id:'p1',name:'P'});state.briefApproved=true;state.strategyRevision=1;
 core.updateContent(state,{id:'c1',title:'T',channel:'LinkedIn',copy:'x'});state.contents[0].stats={source:'csv',metrics:{impressions:5}};state.contents[0].statsAt='2026-10-21T00:00:00Z';
 core.updateContent(state,{id:'c1',title:'T',channel:'LinkedIn',copy:'y'});
 assert.equal(state.contents[0].stats.metrics.impressions,5);assert.equal(state.contents[0].statsAt,'2026-10-21T00:00:00Z');
});
