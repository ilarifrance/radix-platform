'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const core=require('../editorial-core.js'),rg=require('../lib/ped-regia-core.js'),read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

// A small fake plan: two published posts with numbers, three upcoming, one already on Buffer.
const stats=(imp,inter)=>({source:'buffer',metrics:{impressions:imp,reach:imp,reactions:inter,comments:0,shares:0,clicks:null}});
function plan(){return {briefApproved:true,strategyRevision:1,planApproval:null,contents:[
 {id:'p1',title:'Delega',channel:'LinkedIn',date:'2026-10-20',time:'08:00',copy:'Hai mai delegato?',status:'approved',revision:1,strategyRevision:1,history:[],stats:stats(2000,60)},
 {id:'p2',title:'Metriche',channel:'LinkedIn',date:'2026-10-22',time:'08:00',copy:'Tre numeri.',status:'approved',revision:1,strategyRevision:1,history:[],stats:stats(1000,10)},
 {id:'u1',title:'Pipeline',channel:'Instagram',date:'2026-10-27',time:'18:00',copy:'È in trattativa.',status:'review',revision:1,strategyRevision:1,history:[]},
 {id:'u2',title:'CRM vuoto',channel:'Instagram',date:'2026-10-29',time:'18:00',copy:'Il CRM è vuoto?',status:'review',revision:2,strategyRevision:1,history:[{revision:1,title:'CRM vuoto',copy:'vecchio',channel:'Instagram',date:'2026-10-29',time:'18:00',status:'draft',strategyRevision:1}]},
 {id:'q1',title:'In coda',channel:'LinkedIn',date:'2026-10-27',time:'08:00',copy:'Già su Buffer.',status:'approved',revision:1,strategyRevision:1,history:[],publication:{service:'buffer'}}
]}}
const today='2026-10-25';

test('statsDigest: real numbers per channel, best first, and it says when there are too few posts',()=>{
 const d=rg.statsDigest(plan(),{today});
 assert.equal(d.posts,2);assert.equal(d.byChannel[0].channel,'LinkedIn');assert.equal(d.byChannel[0].enough,false);
 assert.equal(d.best[0].id,'p1');assert.deepEqual(d.worst,[]);
 assert.match(d.notes[0],/LinkedIn: 2 post con numeri, troppo pochi/);
 const text=rg.digestText(d);assert.match(text,/impression 3000/);assert.doesNotMatch(text,/undefined|NaN/);
 const empty=rg.statsDigest({contents:[]},{today});assert.equal(empty.posts,0);assert.match(empty.notes[0],/Nessun post con numeri/);
 const old=rg.statsDigest(plan(),{today:'2026-12-31'});assert.equal(old.posts,0,'only the last 30 days');
});

test('validateProposal: keeps the good changes and lists every discarded one with its reason',()=>{
 const raw='Ecco la proposta:\n```json\n'+JSON.stringify({summary:'Più Reel',ops:[
  {op:'add',date:'2026-10-28',time:'18:00',channel:'instagram',format:'reel-avatar',title:'Ascoltare',copy:'Chi parla di più?',script:'Il primo incontro…'},
  {op:'add',date:'2026-10-20',time:'18:00',channel:'instagram',title:'Passato',copy:'x'},
  {op:'add',date:'2026-10-28',time:'18:00',channel:'tiktok',title:'TikTok',copy:'x'},
  {op:'add',date:'2026-10-28',time:'18:00',channel:'instagram',title:'Strumento',copy:'Uso RADIX ogni giorno'},
  {op:'move',contentId:'u1',date:'2026-10-28',time:'12.30'},
  {op:'rewrite',contentId:'u1',copy:'altro'},
  {op:'rewrite',contentId:'u2',copy:'Il tuo CRM è pieno o vuoto? [da fornire]',reason:'apertura più forte'},
  {op:'remove',contentId:'q1'},
  {op:'move',contentId:'nope',date:'2026-10-30'},
  {op:'frequency',channel:'Instagram',perWeek:5},
  {op:'publish',contentId:'u1'}
 ]})+'\n```';
 const v=rg.validateProposal(raw,plan(),{today});
 assert.equal(v.summary,'Più Reel');
 assert.deepEqual(v.ops.map(o=>o.op),['add','move','rewrite','frequency']);
 const add=v.ops[0];assert.equal(add.channel,'Instagram');assert.equal(add.format,'video');assert.equal(add.script,'Il primo incontro…');
 assert.equal(v.ops[1].time,'12:30');assert.deepEqual(v.ops[2].gaps,['[da fornire]']);
 const reasons=v.rejected.map(r=>r.reason).join('\n');
 for(const r of [/già passata/,/Canale non collegato/,/nomina RADIX/,/Una sola modifica per post/,/già su Buffer/,/non esiste più/,/Operazione sconosciuta/])assert.match(reasons,r);
 assert.equal(rg.validateProposal('non è json',plan(),{today}).error,'Proposta non leggibile: riprova.');
 const many={ops:Array.from({length:25},(_,i)=>({op:'frequency',channel:'LinkedIn',perWeek:3}))};
 assert.equal(rg.validateProposal(many,plan(),{today}).ops.length,rg.MAX_OPS);
});

test('applyProposal: changes go through editorial-core with history, new posts to review, one log entry; undo restores',()=>{
 const st=plan();let n=0;
 const v=rg.validateProposal({summary:'Settimana',ops:[
  {op:'add',date:'2026-10-28',time:'18:00',channel:'Instagram',format:'reel-avatar',title:'Ascoltare',copy:'Chi parla di più?',script:'Script'},
  {op:'move',contentId:'u1',date:'2026-10-28',time:'12:30'},
  {op:'rewrite',contentId:'u2',copy:'Il tuo CRM è pieno o vuoto?'},
  {op:'frequency',channel:'Instagram',perWeek:5}]},st,{today});
 const out=rg.applyProposal(st,v,{core,newId:()=>'new'+(++n),at:'2026-10-25T10:00:00Z'});
 assert.deepEqual(out.failed,[]);assert.deepEqual(out.changed,['new1','u1','u2']);
 const added=st.contents.find(c=>c.id==='new1');assert.equal(added.format,'video');assert.equal(added.script,'Script');assert.equal(added.status,'review');
 const u1=st.contents.find(c=>c.id==='u1');assert.equal(u1.time,'12:30');assert.equal(u1.revision,2);assert.equal(u1.status,'review');assert.equal(u1.history.length,1);
 assert.equal(st.regia.log.length,1);assert.equal(st.regia.log[0].summary,'Settimana');
 assert.equal(rg.lastApplied(st),st.regia.log[0]);
 const u=rg.undoLast(st,{core,at:'2026-10-25T11:00:00Z'});
 assert.equal(u.undone,3);assert.deepEqual(u.failed,[]);
 assert.equal(st.contents.find(c=>c.id==='u1').time,'18:00');
 assert.equal(st.contents.find(c=>c.id==='u2').copy,'Il CRM è vuoto?');
 assert.equal(st.contents.find(c=>c.id==='new1').date,'','the new post leaves the calendar, its text stays');
 assert.equal(rg.lastApplied(st),null);
 assert.throws(()=>rg.applyProposal(st,v,{}),/needs core and newId/);
});

test('PED adapter of the common Regia: page wiring, core rules first, then the plan checks; apply saves once and undo restores',async()=>{
 const html=read('project-editorial.html');
 assert.match(html,/data-shell-page="agency-ped" data-shell-regia="\/lib\/regia-ped\.js"/);
 assert.match(html,/<script src="editorial-workspace\.js"><\/script><script src="\/lib\/ped-regia-core\.js"><\/script><\/body>/);
 assert.doesNotMatch(html,/ped-regia\.css|lib\/ped-regia\.js/);
 assert.ok(!fs.existsSync(path.join(__dirname,'..','lib','ped-regia.js')),'the provisional panel is gone');
 assert.match(read('shell/radix-shell.js'),/body\.dataset\.shellRegia/);
 assert.match(read('editorial-workspace.js'),/sources:\(\)=>\[JSON\.stringify\(state&&state\.brief\|\|\{\}\),clientFacts\(\)\],personal:/);
 const C=require('../lib/radix-regia-core.js'),{adapter}=require('../lib/regia-ped.js');
 const st=plan(),saves=[];let renders=0;
 globalThis.RadixPedPage={state:()=>st,busy:()=>false,persist:m=>saves.push(m),renderPed:()=>renders++,today:()=>today,isOut:c=>!!(c.publication&&c.publication.service),queued:()=>false,
  sources:()=>['15 anni nel B2B. +1M€ di fatturato annuo'],personal:()=>true};
 try{
  const reg=C.createRegistry();const a=reg.register('ped',adapter);assert.equal(reg.adapterFor('agency-ped'),a);
  assert.match(adapter.context(st),/Da approvare 2/);assert.match(adapter.context(st),/id u1/);
  assert.match(adapter.context(st),/Spazi liberi settimana del 26\/10\/2026: 29\/10\/2026 08:00 LinkedIn/);
  assert.match(String(adapter.digest(st)),/impression 3000/);assert.ok(adapter.view(st).items.length>0);
  const r=C.validateProposal({area:'ped',summary:'Settimana',ops:[
   {op:'add',date:'2026-10-28',time:'18:00',channel:'Instagram',format:'reel-avatar',title:'Ascoltare',copy:'In 15 anni ho imparato ad ascoltare. E tu?',script:'Script'},
   {op:'add',date:'2026-10-28',time:'12:30',channel:'Instagram',title:'Numeri',copy:'Ho chiuso 37 contratti in un mese.'},
   {op:'rewrite',contentId:'u2',copy:'Con HeyGen il CRM si riempie'},
   {op:'remove',contentId:'q1'},
   {op:'move',contentId:'u1',date:'2026-10-28',time:'12:30',publish:true},
   {op:'send_to_buffer',contentId:'u1'}]},a,st);
  assert.deepEqual(r.accepted.map(o=>o.op),['add']);
  const why=r.rejected.map(x=>x.reason).join('\n');
  for(const re of [/Numeri non presenti/,/nomina «HeyGen»/,/già su Buffer/,/non invia, non pubblica/])assert.match(why,re);
  assert.match(C.previewOf(r.accepted[0],a,st),/^Nuovo post: 28\/10\/2026 18:00 · Instagram · «Ascoltare»/);
  assert.equal(C.costOf(r.accepted,a).label,'nessuna chiamata AI · nessun credito');
  const out=await C.applyProposal(a,st,r.accepted);
  const added=st.contents.find(c=>c.title==='Ascoltare');assert.equal(added.status,'review');assert.equal(added.format,'video');
  assert.equal(saves.length,1);assert.match(saves[0],/1 post cambiato/);assert.equal(renders,1);
  assert.equal(await out.undo(),st);assert.equal(st.contents.find(c=>c.title==='Ascoltare').date,'');assert.equal(saves.length,2);
  globalThis.RadixPedPage.busy=()=>true;await assert.rejects(C.applyProposal(a,st,r.accepted),/Attendi/);
 }finally{delete globalThis.RadixPedPage}
});

test('factCheck: tools, numbers and links outside the facts sheet block the change; lint and gaps are warnings',()=>{
 const sources=['15 anni nel B2B. +1M€ di fatturato annuo, +4M€ in 3 anni. Sito: https://gcp.example'];
 assert.deepEqual(rg.factCheck('In 15 anni ho visto tanti commerciali. Tu cosa ne pensi?',{sources,channel:'Instagram'}).blocking,[]);
 const bad=rg.factCheck('Con HeyGen ho trovato 47 aziende: www.inventato.it',{sources,channel:'Instagram'});
 assert.deepEqual(bad.blocking.map(b=>b.id),['tool','numbers','link']);assert.match(bad.blocking[1].label,/«47/);
 const ok=rg.factCheck('Scrivi a https://gcp.example. **Grassetto** [da fornire]',{sources,channel:'Instagram'});
 assert.deepEqual(ok.blocking,[]);assert.ok(ok.warnings.some(w=>w.id==='placeholder'));assert.ok(ok.warnings.some(w=>w.id==='markdown'));
 const v=rg.validateProposal({ops:[{op:'add',date:'2026-10-28',time:'18:00',channel:'Instagram',title:'Numeri',copy:'Ho chiuso 37 contratti in un mese.'},{op:'add',date:'2026-10-28',time:'12:30',channel:'Instagram',title:'Ok',copy:'In 15 anni ho imparato una cosa. E tu?'}]},plan(),{today,sources});
 assert.equal(v.ops.length,1);assert.match(v.rejected[0].reason,/Numeri non presenti/);
});

test('next week: slots from the plan’s own rhythm, taken ones left out; the AI fills slots by number',()=>{
 const st=plan();
 const rhythm=rg.rhythmOf(st,{today});
 assert.ok(rhythm.some(r=>r.channel==='Instagram'&&r.weekday===2&&r.time==='18:00'),'Tuesday 18:00 Instagram from u1');
 const slots=rg.weekSlots(st,{start:'2026-11-02',rhythm});
 assert.ok(slots.every(s=>s.date>='2026-11-02'&&s.date<='2026-11-08'));
 assert.ok(slots.some(s=>s.channel==='Instagram'&&s.date==='2026-11-03'&&s.time==='18:00'));
 assert.equal(rg.weekSlots(st,{start:'2026-10-26',rhythm}).some(s=>s.channel==='Instagram'&&s.date==='2026-10-27'&&s.time==='18:00'),false,'u1 already takes 27/10 18:00');
 const reply=JSON.stringify({summary:'Settimana 2',posts:[{slot:1,title:'A',copy:'Testo A?'},{slot:1,title:'dup',copy:'x'},{slot:99,title:'no',copy:'x'}]});
 const p=rg.slotOps(slots,reply);assert.equal(p.ops.length,1);assert.equal(p.ops[0].date,slots[0].date);assert.equal(p.summary,'Settimana 2');
 assert.equal(rg.validateProposal(p,st,{today}).ops.length,1);
});
