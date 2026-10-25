'use strict';
// Regia RADIX, phase N4: the area adapters of the CRM (lib/regia-crm.js), the Project manager (lib/regia-pm.js) and
// Impostazioni (lib/regia-impostazioni.js). Fake page data and a fake fetch only: no AI, no network, no email.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const C=require('../lib/radix-regia-core.js'),CRM=require('../lib/regia-crm.js'),PMA=require('../lib/regia-pm.js'),IMP=require('../lib/regia-impostazioni.js');
const pm=require('../lib/pm-demo.js'),guide=require('../lib/radix-guide.js'),R=require('../lib/radix-regia.js');
const {makeDoc}=require('./regia-fake-dom.js');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));

// ---------------- CRM ----------------
const NOW=Date.parse('2026-10-21T08:00:00Z');// Wednesday 21/10/2026, 10:00 in Rome
const W='11111111-1111-4111-8111-111111111111';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const P1=id(1),P2=id(2),S1=id(11),S2=id(12),S3=id(13),S9=id(19),K1=id(21),C1=id(31),C2=id(32),O1=id(41),O2=id(42),O3=id(43),T1=id(51),T2=id(52),T3=id(53),I1=id(61);
function crmRows(){return {
 processes:[{id:P1,title:'Vendite'},{id:P2,title:'Rinnovi'}],
 stages:[{id:S1,process_id:P1,title:'Primo contatto',position:1},{id:S2,process_id:P1,title:'Proposta',position:2,task_title:'Inviare la proposta'},{id:S3,process_id:P1,title:'Trattativa',position:3},{id:S9,process_id:P2,title:'Rinnovo',position:1}],
 companies:[{id:K1,name:'Forno Aurora',phone:'+39 02 555 0101'}],
 contacts:[{id:C1,name:'Marta Bianchi',company_id:K1,phone:'+39 333 111 2222',email:'marta@example.test',created_at:'2026-08-01T10:00:00Z'},{id:C2,name:'Luca Verdi',company_id:null,created_at:'2026-08-01T10:00:00Z'}],
 opportunities:[
  {id:O1,title:'Sito Forno Aurora',contact_id:C1,company_id:K1,process_id:P1,stage_id:S1,amount_cents:500000,outcome:'open',version:2,created_at:'2026-09-01T10:00:00Z'},
  {id:O2,title:'Campagna Verdi',contact_id:C2,company_id:null,process_id:P1,stage_id:S2,amount_cents:120000,outcome:'open',version:1,created_at:'2026-10-15T10:00:00Z'},
  {id:O3,title:'Logo 2025',contact_id:C2,process_id:P1,stage_id:S3,amount_cents:90000,outcome:'won',version:5,created_at:'2026-01-10T10:00:00Z'}],
 tasks:[
  {id:T1,title:'Richiamare Luca',contact_id:C2,status:'todo',due_at:'2026-10-20T08:00:00Z',assignee_id:7,version:3},
  {id:T2,title:'Preventivo per Marta',contact_id:C1,company_id:K1,status:'todo',due_at:'2026-10-21T15:00:00Z',assignee_id:7,version:1},
  {id:T3,title:'Vecchia attività',contact_id:C1,status:'done',due_at:'2026-10-01T08:00:00Z',version:2}],
 interactions:[{id:I1,title:'Chiamata',kind:'call',contact_id:C1,opportunity_id:O1,occurred_at:'2026-09-20T09:00:00Z'}],
 members:[{id:7,name:'Francesco'}]}}
const crmState=o=>Object.assign({workspace:W,me:7,ready:true,writable:true,rows:crmRows(),now:NOW},o);
// The fake /api/sales: every POST recorded; the answers mimic api/_sales.js (row with the new version, transition's generated task).
function fakeSales(o){const calls=[],opts=o||{};let n=0;
 const fetch=async(url,init)=>{const body=JSON.parse(init.body);calls.push({url,init,body});const d=body.data;
  if(opts.fail&&opts.fail(body))return {ok:false,status:409,json:async()=>({error:'Conflitto: ricarica i dati.'})};
  let row;if(body.action==='create')row={id:id(900+(++n)),version:1,...d};
   else if(body.action==='update')row={id:d.id,version:d.version+1};
   else if(body.action==='transition')row={id:d.id,version:d.version+1,stage_id:d.stage_id,generated_task_id:d.stage_id===S2?id(800):null};
   else row={id:d.id};
  return {ok:true,status:200,json:async()=>({rows:[row]})}};
 return {calls,fetch}}
function crmAdapter(o){let k=0;return CRM.create(Object.assign({app:null,now:NOW,uuid:()=>'key-'+(++k)},o))}

test('CRM: the context and the numbers come from the page rows, through the CRM cores',()=>{
 const a=crmAdapter(),s=crmState(),ctx=a.context(s);
 assert.match(ctx,/^CRM: 2 contatti, 2 trattative aperte \(€ 6\.200\), 2 attività aperte\. Oggi 21\/10\/2026\./);
 assert.match(ctx,new RegExp('Follow-up scaduti \\(1\\): «Richiamare Luca» con Luca Verdi \\(Scaduta ieri · 10:00\\) id '+T1));
 assert.match(ctx,new RegExp('Da fare oggi \\(1\\): «Preventivo per Marta» con Marta Bianchi \\(Oggi · 17:00\\) id '+T2));
 assert.match(ctx,new RegExp('Trattative ferme da 14\\+ giorni \\(1\\): «Sito Forno Aurora» · Marta Bianchi · € 5\\.000 · fase Primo contatto · ultimo contatto 30 giorni fa id '+O1));
 assert.match(ctx,/Pipeline per fase: Primo contatto 1 \(€ 5\.000\); Proposta 1 \(€ 1\.200\)\./);
 assert.match(ctx,/Fasi disponibili: Vendite: Primo contatto → Proposta → Trattativa\./);
 assert.match(ctx,/una bozza la scrivi come testo nella chat/);
 assert.doesNotMatch(ctx,/marta@example|333 111/,'no emails or phone numbers in the AI context');
 assert.deepEqual(a.digest(s),{oggi:1,scadute:1,mie:2,trattativeAperte:2,valoreAperto:'€ 6.200',ferme14giorni:1,
  pipeline:[{fase:'Primo contatto',trattative:1,valore:'€ 5.000'},{fase:'Proposta',trattative:1,valore:'€ 1.200'}]});
 assert.deepEqual(a.view(s).items.slice(0,3),['Follow-up scaduti: 1 · in scadenza oggi: 1','Trattative ferme da 14+ giorni: 1','Pipeline aperta: 2 trattative · € 6.200']);
 const block=C.contextBlock(C.createRegistry().register('crm',a),s);assert.match(block,/^\[Area: CRM \(crm\)\]\n\[Operazioni\] task_add, deal_stage, task_due\n\[Contesto\] CRM:/);
 assert.ok(block.length<=3800);
 assert.deepEqual(a.shortcuts.map(x=>x.label),['Chi chiamo oggi?','Trattative ferme']);
 assert.equal(a.context({workspace:null,rows:{}}),'CRM: nessun workspace caricato, nessun dato da leggere.');
});

test('CRM: validate rejects unknown contacts and deals, missing stages, past dates, closed deals and any send',()=>{
 const a=crmAdapter(),s=crmState(),reg=C.createRegistry(),ad=reg.register('crm',a);
 const r=C.validateProposal({area:'crm',summary:'x',ops:[
  {op:'task_add',contact:'Mario Rossi',title:'Chiamare',due:'2026-10-22'},
  {op:'task_add',contactId:C1,title:'Chiamare',due:'2026-10-20'},
  {op:'task_add',contactId:C1,title:'Chiamare',due:'2026-10-21',time:'09:30'},
  {op:'deal_stage',deal:'Trattativa inventata',stage:'Proposta'},
  {op:'deal_stage',dealId:O1,stage:'Rinnovo'},
  {op:'deal_stage',dealId:O1,stage:'Primo contatto'},
  {op:'deal_stage',dealId:O3,stage:'Proposta'},
  {op:'task_due',taskId:T3,due:'2026-10-30'},
  {op:'task_due',taskId:id(999),due:'2026-10-30'},
  {op:'send_email',contactId:C1,subject:'Ciao'},
  {op:'task_add',contact:'marta bianchi',title:'Richiamare Marta',due:'2026-10-22'},
  {op:'deal_stage',deal:'Sito Forno Aurora',stage:'Proposta'},
  {op:'task_due',taskId:T1,due:'2026-10-23T15:30'},
  {op:'task_due',task:'Richiamare Luca',due:'2026-10-24'}]},ad,s);
 const reasons=r.rejected.map(x=>x.reason);
 assert.deepEqual(reasons,[
  'Contatto non trovato in questo CRM: «Mario Rossi».',
  'La scadenza 20/10/2026 09:00 è già passata: scegli un momento da adesso in avanti.',
  'La scadenza 21/10/2026 09:30 è già passata: scegli un momento da adesso in avanti.',
  'Trattativa non trovata in questo CRM: «Trattativa inventata».',
  'La fase «Rinnovo» non esiste nel processo di questa trattativa.',
  'La trattativa è già in «Primo contatto».',
  'La trattativa «Logo 2025» è già chiusa.',
  'L’attività «Vecchia attività» è già completata.',
  'Attività non trovata in questo CRM: «'+id(999)+'».',
  C.REASON.effect,
  'Una sola modifica per volta sullo stesso record.']);
 assert.deepEqual(r.accepted.map(o=>[o.op,o.contactId||o.dealId||o.taskId,o.stageId||null]),[['task_add',C1,null],['deal_stage',O1,S2],['task_due',T1,null]]);
 assert.deepEqual(r.accepted.map(o=>C.previewOf(o,ad,s)),[
  'Nuova attività per «Marta Bianchi»: «Richiamare Marta» · scadenza 22/10/2026 09:00',
  'Sposta «Sito Forno Aurora» da «Primo contatto» a «Proposta» · si crea l’attività automatica «Inviare la proposta»',
  'Nuova scadenza per «Richiamare Luca» (Luca Verdi): 20/10/2026 10:00 → 23/10/2026 15:30']);
 assert.equal(C.costOf(r.accepted,ad).label,'nessuna chiamata AI · nessun credito');
 const ro=C.validateProposal({ops:[{op:'task_add',contactId:C1,title:'x',due:'2026-10-22'}]},ad,crmState({writable:false}));
 assert.match(ro.rejected[0].reason,/sola lettura/);
});

test('CRM: apply sends the /api/sales commands sales.js sends, undo restores the values read before',async()=>{
 const net=fakeSales(),a=crmAdapter({fetch:net.fetch}),reg=C.createRegistry(),ad=reg.register('crm',a),s=crmState();
 const v=C.validateProposal({area:'crm',summary:'Richiami',ops:[
  {op:'task_add',contactId:C1,title:'Richiamare Marta',due:'2026-10-22'},
  {op:'deal_stage',dealId:O1,stage:'Proposta'},
  {op:'task_due',taskId:T1,due:'2026-10-23',time:'15:30'}]},ad,s);
 assert.equal(v.accepted.length,3);
 const r=await C.applyProposal(ad,s,v.accepted);
 assert.ok(net.calls.every(c=>c.url==='/api/sales'&&c.init.method==='POST'&&c.init.headers['x-radix-sales']==='1'&&c.init.credentials==='same-origin'));
 assert.deepEqual(net.calls.map(c=>c.body),[
  {workspace:W,entity:'tasks',action:'create',data:{title:'Richiamare Marta',status:'todo',priority:'normal',due_at:'2026-10-22T07:00:00Z',assignee_id:7,company_id:K1,contact_id:C1,opportunity_id:null}},
  {workspace:W,entity:'opportunities',action:'transition',data:{id:O1,version:2,stage_id:S2,key:'key-1'}},
  {workspace:W,entity:'tasks',action:'update',data:{id:T1,version:3,due_at:'2026-10-23T13:30:00Z'}}]);
 net.calls.length=0;
 await r.undo();
 assert.deepEqual(net.calls.map(c=>c.body),[
  {workspace:W,entity:'tasks',action:'update',data:{id:T1,version:4,due_at:'2026-10-20T08:00:00Z'}},
  {workspace:W,entity:'opportunities',action:'transition',data:{id:O1,version:3,stage_id:S1,key:'key-2'}},
  {workspace:W,entity:'tasks',action:'delete',data:{id:id(800),version:1}},
  {workspace:W,entity:'tasks',action:'delete',data:{id:id(901),version:1}}],'newest first; the automatic task of the stage goes too');
});

test('CRM: in the page it goes through RadixSalesApp.api and reloads; a failed command rolls back what was done',async()=>{
 const sent=[],refreshed=[],rows=crmRows();
 const app={state:{workspace:W,me:7,ready:true,busy:false,rows},writable:()=>true,refresh:async m=>{refreshed.push(m)},
  api:async(entity,o)=>{sent.push(o.body);if(o.body.action==='update'&&o.body.data.id===T2)throw new Error('Conflitto: premi Aggiorna prima di modificare nuovamente.');
   return {rows:[o.body.action==='create'?{id:id(950),version:1}:{id:o.body.data.id,version:(o.body.data.version||0)+1}]}}};
 const a=crmAdapter({app}),reg=C.createRegistry(),ad=reg.register('crm',a),s=a.read();
 assert.equal(s.workspace,W);assert.equal(s.writable,true);assert.equal(s.rows.tasks.length,3);
 const ok=C.validateProposal({ops:[{op:'task_due',taskId:T1,due:'2026-10-26'}]},ad,s);
 const r=await C.applyProposal(ad,s,ok.accepted);
 assert.deepEqual(sent[0],{workspace:W,entity:'tasks',action:'update',data:{id:T1,version:3,due_at:'2026-10-26T08:00:00Z'}},'26 October: ora solare, UTC+1');
 assert.deepEqual(refreshed,[false]);await r.undo();assert.deepEqual(sent[1].data,{id:T1,version:4,due_at:'2026-10-20T08:00:00Z'});
 sent.length=0;
 const two=C.validateProposal({ops:[{op:'task_add',contactId:C2,title:'Richiamare Luca',due:'2026-10-22'},{op:'task_due',taskId:T2,due:'2026-10-27'}]},ad,s);
 await assert.rejects(C.applyProposal(ad,s,two.accepted),/Conflitto: premi Aggiorna prima di modificare nuovamente\. Le modifiche già fatte sono state annullate\./);
 assert.deepEqual(sent.map(b=>b.entity+':'+b.action),['tasks:create','tasks:update','tasks:delete']);
 assert.deepEqual(sent[2].data,{id:id(950),version:1});
 app.state.busy=true;await assert.rejects(C.applyProposal(ad,s,ok.accepted),/Attendi/);
});

test('CRM: the fake AI sample is a valid proposal with one op the Regia refuses (no email is ever sent)',()=>{
 const a=crmAdapter(),s=crmState(),reg=C.createRegistry(),ad=reg.register('crm',a),p=a.sample(s);
 const v=C.validateProposal(p,ad,s);
 assert.deepEqual(v.accepted.map(o=>o.op),['task_add','task_due']);assert.deepEqual(v.rejected.map(x=>x.reason),[C.REASON.effect]);
 assert.match(p.summary,/2 chiamate per oggi, 1 trattativa ferma: parti da «Sito Forno Aurora»/);
});

test('CRM: the Regia panel on the CRM page has its two shortcuts and the real numbers, without any AI call',()=>{
 const reg=C.createRegistry();reg.register('crm',crmAdapter({app:{state:{workspace:W,me:7,ready:true,rows:crmRows()},writable:()=>true}}));
 const doc=makeDoc({shellPage:'sales-crm'}),calls=[];
 const ui=R.create({doc,win:{location:{pathname:'/radix-sales.html',hash:'',search:''},addEventListener(){}},registry:reg,guide,send:async()=>{calls.push(1);return 'x'}});
 ui.open();assert.equal(ui.adapter.area,'crm');
 assert.deepEqual(ui.shortcuts.querySelectorAll('.rx-regia-chip').map(c=>c.textContent),['Chi chiamo oggi?','Trattative ferme']);
 assert.match(ui.panel.querySelector('.rx-regia-view').textContent,/Oggi nel CRM.*Follow-up scaduti: 1 · in scadenza oggi: 1/);
 assert.equal(ui.panel.querySelector('.rx-regia-page').textContent,'CRM');assert.equal(calls.length,0);
});

// ---------------- Project manager ----------------
const PM_NOW=Date.parse('2026-10-21T10:00:00Z');
function plan(){const s={projects:[{id:'p1',name:'Forno Aurora',note:'',synthetic:true,subprojects:[{id:'s1',name:'Discovery'},{id:'s2',name:'Produzione'}]}],tasks:[],nextId:1};
 const add=(sub,title,owner,due,extra)=>{const t=pm.create(s,{title,owner,due,start:'',project:'p1',subproject:sub,details:'',dependencies:[],approvalRequired:false,milestone:false,assignedAgents:[],recurrence:'Nessuna'});Object.assign(t,extra||{});return t};
 add('s1','Brief','Elena Rossi','2026-10-10',{status:'Completato'});
 add('s1','Ricerca','Elena Rossi','2026-10-15',{status:'In corso',start:'2026-10-12'});
 add('s1','Moodboard','Marco Neri','2026-10-19');
 add('s2','Post settimana 1','Elena Rossi','2026-10-22');
 add('s2','Post settimana 2','Elena Rossi','2026-10-23');
 add('s2','Video','Elena Rossi','2026-10-23',{approvalRequired:true,status:'In revisione'});
 add('s2','Post dal PED','Marco Neri','2026-10-24',{pedContentId:'c1'});
 return pm.validateState(s)}
function pmPage(o){const p=plan(),saves=[],renders=[];let fail=false;
 const page={state:()=>p,projectId:()=>'p1',projectKey:()=>'proj-forno',projectName:()=>'Forno Aurora',capacity:()=>2,render:()=>renders.push(1),busy:()=>false,
  persist:async()=>{if(fail)return false;saves.push(JSON.parse(JSON.stringify(pm.validateState(p))));return true}};
 return {page,plan:p,saves,renders,failNext:()=>{fail=true}}}

test('PM: context and numbers: deadlines, late phases, load against the capacity, the people of the plan',()=>{
 const pg=pmPage(),a=PMA.create({page:pg.page,now:PM_NOW}),s=a.read();
 assert.equal(s.key,'proj-forno');assert.equal(a.projectId(s),'proj-forno','the team memory goes to this project');
 const ctx=a.context(s);
 assert.match(ctx,/^Project manager · «Forno Aurora»: 7 attività, 1 completate, 2 in ritardo, puntualità 33%\. Oggi 21\/10\/2026\./);
 assert.match(ctx,/In ritardo \(2\): «Ricerca» \(Elena Rossi, 15\/10\/2026\) id t2; «Moodboard» \(Marco Neri, 19\/10\/2026\) id t3\./);
 assert.match(ctx,/Scadenze dei prossimi 14 giorni \(4\): «Post settimana 1» \(Elena Rossi, 22\/10\/2026\) id t4;.*«Post dal PED» \(Marco Neri, 24\/10\/2026, dal PED\) id t7\./);
 assert.match(ctx,/Fasi: Discovery \(id s1\): 07\/10\/2026 → 19\/10\/2026, 1\/3 completate, in ritardo; Produzione \(id s2\): 19\/10\/2026 → 24\/10\/2026, 0\/4 completate\./);
 assert.match(ctx,/capacità 2 attività aperte a settimana\): Elena Rossi picco 4\/2 \(sovraccarico\); Marco Neri picco 2\/2\./);
 assert.match(ctx,/Persone del piano: Elena Rossi, Marco Neri\./);
 assert.deepEqual(a.digest(s),{attivita:7,completate:1,inRitardo:2,puntualita:'33%',daApprovare:1,fasiInRitardo:['Discovery'],capacitaSettimanale:2,sovraccarichi:['Elena Rossi']});
 assert.deepEqual(a.shortcuts.map(x=>x.label),['Cosa è in ritardo?','Chi è sovraccarico?']);
 assert.match(C.contextBlock(C.createRegistry().register('pm',a),s),/^\[Area: Project manager \(pm\)\]\n\[Operazioni\] phase_move, task_assign\n/);
});

test('PM: validate rejects unknown phases and activities, past dates, people outside the plan, completed work',()=>{
 const pg=pmPage(),a=PMA.create({page:pg.page,now:PM_NOW}),reg=C.createRegistry(),ad=reg.register('pm',a),s=a.read();
 const r=C.validateProposal({area:'pm',ops:[
  {op:'phase_move',phase:'Lancio',days:7},{op:'phase_move',phaseId:'s1',days:0},{op:'phase_move',phaseId:'s1',days:2},{op:'phase_move',phaseId:'s1',days:400},
  {op:'task_assign',taskId:'t9',owner:'Marco Neri'},{op:'task_assign',taskId:'t4',owner:'Giulia Blu'},{op:'task_assign',taskId:'t1',owner:'Marco Neri'},{op:'task_assign',taskId:'t3',owner:'Marco Neri'},
  {op:'phase_move',phase:'discovery',days:7},{op:'task_assign',task:'Video',owner:'Marco Neri'},{op:'phase_move',phaseId:'s1',days:9}]},ad,s);
 assert.deepEqual(r.rejected.map(x=>x.reason),[
  'Fase non trovata in questo piano: «Lancio».','Di quanti giorni sposto la fase? Serve un numero intero diverso da zero.',
  '«Ricerca» finirebbe il 17/10/2026, una data già passata.','Spostamento troppo grande: al massimo 120 giorni.',
  'Attività non trovata in questo piano: «t9».','«Giulia Blu» non è tra le persone di questo piano: aggiungila da «Modifica attività».',
  '«Brief» è già completata.','«Moodboard» è già di Marco Neri.','Una sola modifica per volta sulle stesse attività.']);
 assert.deepEqual(r.accepted.map(o=>C.previewOf(o,ad,s)),['Sposta la fase «Discovery» avanti di 7 giorni: 2 attività (Ricerca 15/10/2026 → 22/10/2026; Moodboard 19/10/2026 → 26/10/2026)','Riassegna «Video» (23/10/2026): Elena Rossi → Marco Neri']);
});

test('PM: apply goes through RadixPM and the page save; undo restores dates and owners; the PED keeps its date',async()=>{
 const pg=pmPage(),a=PMA.create({page:pg.page,now:PM_NOW}),reg=C.createRegistry(),ad=reg.register('pm',a),s=a.read();
 const v=C.validateProposal({area:'pm',ops:[{op:'phase_move',phaseId:'s2',days:3},{op:'task_assign',taskId:'t6',owner:'Marco Neri'}]},ad,s);
 assert.equal(v.accepted.length,2);
 const r=await C.applyProposal(ad,s,v.accepted);
 const byId=id=>pg.plan.tasks.find(t=>t.id===id);
 assert.deepEqual(['t4','t5','t6','t7'].map(id=>byId(id).due),['2026-10-25','2026-10-26','2026-10-26','2026-10-24'],'t7 comes from the PED');
 assert.equal(byId('t6').owner,'Marco Neri');assert.equal(byId('t6').status,'In revisione','status and approval stay');
 assert.equal(pg.saves.length,1);assert.equal(pg.saves[0].tasks.find(t=>t.id==='t6').owner,'Marco Neri');
 assert.match(byId('t6').history.slice(-1)[0],/Riassegnata: Elena Rossi → Marco Neri\./);
 await r.undo();
 assert.deepEqual(['t4','t5','t6','t7'].map(id=>byId(id).due),['2026-10-22','2026-10-23','2026-10-23','2026-10-24']);
 assert.equal(byId('t6').owner,'Elena Rossi');assert.equal(pg.saves.length,2);
 // A save that fails leaves the plan as it was.
 pg.failNext();const before=JSON.stringify(pg.plan);
 await assert.rejects(C.applyProposal(ad,s,v.accepted),/Salvataggio non riuscito: il piano è rimasto com’era\./);
 assert.equal(JSON.stringify(pg.plan),before);
});

test('PM: RadixPM.reassign keeps status and approval and refuses completed work',()=>{
 const s=plan();const t=s.tasks.find(x=>x.id==='t6');t.status='In revisione';
 pm.reassign(s,'t6','Marco Neri');assert.equal(t.owner,'Marco Neri');assert.equal(t.status,'In revisione');pm.validateState(s);
 assert.throws(()=>pm.reassign(s,'t1','Marco Neri'),/completata/);assert.throws(()=>pm.reassign(s,'t6',''),/Responsabile non valido/);
});

test('PM: the fake AI sample moves the late phase past today and gives work to the least busy person',()=>{
 const pg=pmPage(),a=PMA.create({page:pg.page,now:PM_NOW}),reg=C.createRegistry(),ad=reg.register('pm',a),s=a.read(),p=a.sample(s);
 const v=C.validateProposal(p,ad,s);
 assert.deepEqual(v.accepted.map(o=>o.op),['phase_move','task_assign']);assert.equal(v.accepted[0].days,7);assert.equal(v.accepted[1].owner,'Marco Neri');
 assert.deepEqual(v.rejected.map(x=>x.reason),[C.REASON.effect]);
});

// ---------------- Impostazioni ----------------
test('Impostazioni: names and collegato / da collegare only, the guides of what is missing first, no ops',async()=>{
 const a=IMP.create({load:async()=>({anthropic:true,database:true,buffer:false,heygen:false,email:true,higgsfield:'sk-live-123456','new-service':false})});
 assert.deepEqual(a.read(),{services:null},'not read yet');await a.load();const s=a.read();
 assert.deepEqual(s.services.map(x=>[x.id,x.ok]),[['anthropic',true],['database',true],['buffer',false],['heygen',false],['email',true],['new-service',false]],'a value that is not a boolean is left out');
 const ctx=a.context(s);
 assert.match(ctx,/^Impostazioni · Collegamenti\. Collegati: Agenti AI, Database RADIX, Email di RADIX \(Gmail\)\. Da collegare: Buffer \(pubblicazione dei post\), HeyGen \(video con avatar\), new-service\./);
 assert.doesNotMatch(ctx,/sk-live/);
 assert.match(ctx,/Guide fisse[^\n]*\n- Collegare un canale a Buffer: 1\) /);
 for(const g of ['Collegare un canale a Buffer','Passare Instagram ad account professionale','Collegare una pagina LinkedIn aziendale','Attivare HeyGen','Collegare una casella email con la password per le app'])assert.ok(ctx.includes(g),g);
 assert.deepEqual(a.digest(s),{collegati:3,daCollegare:['Buffer (pubblicazione dei post)','HeyGen (video con avatar)','new-service']});
 assert.deepEqual(a.view(s).items,['Da collegare: Buffer (pubblicazione dei post), HeyGen (video con avatar), new-service','Collegati: 3 su 6']);
 const reg=C.createRegistry(),ad=reg.register('impostazioni',a);
 const block=C.contextBlock(ad,s);assert.ok(block.length<=3900);assert.doesNotMatch(block,/\[Operazioni\]/);assert.match(block,/Collegare una casella email con la password per le app/,'all five guides fit');
 const r=C.validateProposal({area:'impostazioni',ops:[{op:'connect',service:'buffer'}]},ad,s);assert.equal(r.ok,false);assert.match(r.rejected[0].reason,/sconosciuta/);
 assert.deepEqual(a.shortcuts.map(x=>x.label),['Cosa manca da collegare?']);
});

test('Impostazioni: without a session the status is «non disponibile» and the AI is told not to guess',async()=>{
 const a=IMP.create({load:async()=>null});await a.load();const s=a.read();
 assert.deepEqual(s,{services:null});assert.match(a.context(s),/Stato dei collegamenti non disponibile .*non dire cosa è collegato/);
 assert.equal(a.view(s),null);assert.deepEqual(a.digest(s),{stato:'non disponibile'});
});

// ---------------- wiring ----------------
test('wiring: each page loads its adapter before the panel starts',()=>{
 const sales=read('radix-sales.html'),i=s=>sales.indexOf(s);
 assert.match(sales,/<html lang="it" data-rx-regia="on">/);assert.match(sales,/<body data-shell-page="sales-crm">/);
 for(const f of ['sales/crm-dates-core.js','sales/crm-today-core.js','sales/crm-automations-core.js','sales/crm-record-core.js','sales/sales.js'])assert.ok(i(f)>0&&i(f)<i('lib/regia-crm.js'),f);
 assert.ok(i('lib/radix-regia-core.js')<i('lib/regia-crm.js')&&i('lib/regia-crm.js')<i('lib/radix-guide.js')&&i('lib/radix-guide.js')<i('lib/radix-regia.js'));
 assert.match(read('impostazioni.html'),/data-shell-page="impostazioni" data-shell-regia="\/lib\/regia-impostazioni\.js"/);
 const pmHtml=read('radix-pm-concept.html');assert.match(pmHtml,/data-shell-page="pm"[^>]*data-shell-regia="\/lib\/regia-pm\.js"/);
 assert.match(pmHtml,/window\.RadixPmPage=\{state:\(\)=>state,/);assert.match(pmHtml,/function persist\(\)\{[^\n]*return saving;\}/);
 const shell=read('shell/radix-shell.js');assert.match(shell,/if \(body\.dataset\.shellUser === 'off'\) return;/);
 assert.equal(guide.forPage('impostazioni','/impostazioni.html','').title,'Impostazioni');
 assert.equal(guide.forPage('sales-crm','/radix-sales.html','').title,'CRM');
 for(const f of ['lib/regia-crm.js','lib/regia-pm.js','lib/regia-impostazioni.js'])assert.doesNotMatch(read(f),/process\.env|api\/chat/,f);
});
