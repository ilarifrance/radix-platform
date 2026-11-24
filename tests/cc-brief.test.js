'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const B=require('../lib/cc-brief-core.js');
const DAY=864e5,NOW=Date.parse('2026-11-24T10:00:00Z'),END=Date.parse('2026-11-24T23:00:00Z'),iso=t=>new Date(t).toISOString();
const sales={tasks:[
  {id:'t1',status:'todo',due_at:iso(NOW-DAY)},{id:'t2',status:'todo',due_at:iso(NOW+3600e3)},{id:'t3',status:'done',due_at:iso(NOW-DAY)},
  {id:'t4',status:'todo',due_at:iso(NOW+2*DAY)},{id:'t5',status:'todo',due_at:null},{id:'t6',status:'todo',due_at:iso(NOW+3*DAY),opportunity_id:'o3'}],
 opportunities:[
  {id:'o1',outcome:'open',created_at:iso(NOW-30*DAY),contact_id:'c1'},      // ferma: nessun contatto
  {id:'o2',outcome:'open',created_at:iso(NOW-30*DAY),contact_id:'c2'},      // toccata 3 giorni fa
  {id:'o3',outcome:null,created_at:iso(NOW-30*DAY)},                        // ha un'attività aperta
  {id:'o4',outcome:'open',created_at:iso(NOW-2*DAY)},                       // troppo giovane
  {id:'o5',outcome:'won',created_at:iso(NOW-60*DAY)}],
 interactions:[{id:'i1',contact_id:'c2',occurred_at:iso(NOW-3*DAY)},{id:'i2',opportunity_id:'o1',occurred_at:iso(NOW-20*DAY)}]};
test('Vendite: attività in ritardo e di oggi, trattative ferme con la regola dei 14 giorni',()=>{
 assert.deepEqual(B.agenda(sales.tasks,NOW,END),{overdue:1,today:1});
 assert.deepEqual(B.staleDeals(sales,NOW).map(o=>o.id),['o1']);
 const l=B.salesLine(sales,NOW,END);
 assert.equal(l.count,3);assert.equal(l.tone,'late');assert.equal(l.href,'/radix-sales.html#today');
 assert.equal(l.text,'1 attività in ritardo, 1 attività da fare oggi, 1 trattativa ferma da 14 giorni.');
 const calm=B.salesLine({tasks:[],opportunities:[],interactions:[]},NOW,END);assert.equal(calm.tone,'ok');assert.equal(calm.count,0);
 assert.match(B.salesLine({error:'CRM 504'},NOW,END).text,/non leggibili adesso \(CRM 504\)/);
 assert.match(B.salesLine({...sales,partial:true},NOW,END).text,/Elenco parziale/);
});
test('Vendite: email ricevute oggi, dalle interazioni salvate dalla Posta',()=>{
 const START=END-DAY,inter=[{title:'Email ricevuta: Offerta',occurred_at:iso(START+3600e3)},{title:'Email ricevuta: ieri',occurred_at:iso(START-3600e3)},
  {title:'Email inviata: Offerta',occurred_at:iso(START+7200e3)},{title:'Chiamata',occurred_at:iso(START+7200e3)}];
 assert.equal(B.repliesToday(inter,END),1);
 const l=B.salesLine({tasks:[],opportunities:[],interactions:inter},NOW,END);
 assert.equal(l.text,'1 email ricevuta oggi.');assert.equal(l.count,1);assert.equal(l.tone,'todo');assert.equal(l.href,'/sales-posta.html');
});
test('Progetti e Sistema: passi da approvare, servizi non collegati (solo i nomi)',()=>{
 const p=B.projectsLine({items:[
  {name:'Alfa',status:'active',journey:{steps:[{id:'brief',label:'Brief',state:'done'},{id:'ped',label:'Piano editoriale',state:'waiting'}]}},
  {name:'Beta',status:'active',journey:{steps:[{id:'brief',label:'Brief',state:'active'}]}},
  {name:'Vecchio',status:'archived',journey:{steps:[{id:'ped',label:'PED',state:'waiting'}]}}]});
 assert.equal(p.count,1);assert.equal(p.text,'1 passo da approvare (parti da «Alfa»), 1 progetto in corso.');
 const s=B.systemLine({items:[{id:'hunter',label:'Hunter',configured:true},{id:'twilio',label:'Twilio',configured:false},{id:'x',label:'Apollo',configured:false}]});
 assert.equal(s.count,2);assert.equal(s.text,'2 servizi non collegati: Twilio, Apollo.');
 assert.equal(B.systemLine({items:[{id:'a',label:'A',configured:true}]}).tone,'ok');
});
test('Progetti: attività in ritardo dai piani del Project manager',()=>{
 const pm={plans:[{id:'p1',name:'Alfa',tasks:[{status:'In corso',due:'2026-11-20'},{status:'Completato',due:'2026-11-01'},{status:'Da fare',due:'2026-11-24'},{status:'Da fare',due:''}]},
  {id:'p2',name:'Beta',tasks:[{status:'Da fare',due:'2026-11-10'},{status:'In revisione',due:'2026-11-23'}]}]};
 assert.deepEqual(B.lateTasks(pm.plans,'2026-11-24'),[{id:'p2',name:'Beta',late:2},{id:'p1',name:'Alfa',late:1}]);
 const l=B.projectsLine({items:[]},pm,'2026-11-24');
 assert.equal(l.count,3);assert.equal(l.tone,'late');assert.equal(l.text,'3 attività in ritardo (soprattutto «Beta»).');assert.equal(l.href,'/radix-pm-concept.html?project=p2');
 assert.equal(B.projectsLine({items:[]},{plans:[]},'2026-11-24').text,'Nessun passo in attesa di te.');
 assert.match(B.projectsLine({items:[]},{plans:[],partial:true},'2026-11-24').text,/solo nei primi progetti/);
});
test('Marketing: post in uscita oggi e pubblicazioni non riuscite, solo la riga più recente',()=>{
 const pubs=[
  {project_id:'p1',content_id:'c1',channel_id:'li',status:'queued',due_at:iso(NOW+3600e3),updated_at:iso(NOW-DAY)},
  {project_id:'p1',content_id:'c2',channel_id:'li',status:'queued',scheduled_at:iso(NOW+2*DAY),updated_at:iso(NOW-DAY)},   // dopodomani
  {project_id:'p1',content_id:'c3',channel_id:'li',status:'queued',due_at:iso(NOW-3600e3),updated_at:iso(NOW-DAY)},        // già uscito
  {project_id:'p2',content_id:'c4',channel_id:'ig',status:'failed',updated_at:iso(NOW-2*DAY)},
  {project_id:'p2',content_id:'c5',channel_id:'ig',status:'queued',due_at:iso(NOW+7200e3),updated_at:iso(NOW)},
  {project_id:'p2',content_id:'c5',channel_id:'ig',status:'failed',updated_at:iso(NOW-DAY)}];                               // revisione vecchia
 const l=B.marketingLine({publications:pubs},NOW,END);
 assert.equal(l.count,3);assert.equal(l.tone,'late');assert.equal(l.text,'1 pubblicazione non riuscita, 2 post in uscita oggi.');
 assert.equal(l.href,'/project-editorial.html?project=p2#ped');
 const calm=B.marketingLine({publications:[],partial:true},NOW,END);assert.equal(calm.tone,'ok');assert.match(calm.text,/Nessun post in uscita oggi\. Guardati solo i primi progetti\./);
 assert.equal(B.marketingLine(null,NOW,END),null);assert.match(B.marketingLine({error:'Pubblicazioni 500'},NOW,END).text,/non leggibili/);
});
test('Brief: solo le aree lette, totale e titolo; la pagina lo carica senza AI',()=>{
 const b=B.brief({now:NOW,dayEnd:END,sales,integrations:{items:[]}});
 assert.deepEqual(b.lines.map(l=>l.area),['sales','system']);assert.equal(b.total,3);assert.equal(b.late,true);
 assert.equal(B.headline(b),'3 cose ti aspettano oggi.');assert.equal(B.headline(B.brief({now:NOW,integrations:{items:[]}})),'Niente che ti aspetta, per ora.');
 assert.equal(B.headline(B.brief({})),'Nessun dato da mostrare.');
 const ui=fs.readFileSync('lib/cc-brief.js','utf8'),html=fs.readFileSync('control-center-v2.html','utf8');
 assert.ok(html.includes('/lib/cc-brief-core.js')&&html.includes('/lib/cc-brief.js'));
 assert.ok(!/\/api\/chat|method:\s*'POST'|innerHTML/.test(ui),'sola lettura, niente AI, niente HTML da stringhe');
});
test('La Regia del Command Center legge «Oggi»: contesto con tutte le aree, nessuna richiesta sua',()=>{
 const CC=require('../lib/regia-cc.js');
 const el=(o)=>Object.assign({textContent:'',className:'',dataset:{},hidden:false,querySelector:()=>null,querySelectorAll:()=>[]},o);
 const row=(area,text,tone)=>el({dataset:{tone},querySelector:s=>s==='.cc-brief-area'?el({textContent:area}):s==='.cc-brief-text'?el({textContent:text}):null});
 const brief=el({querySelectorAll:s=>s==='.cc-brief-row'?[row('Vendite','2 attività in ritardo.','late'),row('Marketing','1 post in uscita oggi.','todo')]:[]});
 const doc={getElementById:id=>id==='ccBrief'?brief:null};
 const st=CC.read(doc,null);
 assert.deepEqual(st.today,[{area:'Vendite',text:'2 attività in ritardo.',tone:'late'},{area:'Marketing',text:'1 post in uscita oggi.',tone:'todo'}]);
 assert.match(CC.adapter.context(st),/Oggi nelle aree: Vendite: 2 attività in ritardo\. Marketing: 1 post in uscita oggi\./);
 const d=CC.adapter.digest(st);assert.equal(d.areeOggi,2);assert.equal(d.areeInRitardo,1);
 brief.hidden=true;assert.deepEqual(CC.read(doc,null).today,[]);
 assert.ok(!/Oggi nelle aree/.test(CC.adapter.context(CC.read({getElementById:()=>null},null))));
 assert.ok(!/fetch\(/.test(fs.readFileSync('lib/regia-cc.js','utf8')));
});
test('Inglese: ogni frase di «Oggi» ha la sua traduzione',()=>{
 const I=require('../lib/radix-i18n.js');require('../lib/radix-i18n-en.js');const C=I.compile(globalThis.RadixI18nEn,I.HAND),T=x=>C.tr(x);
 const b=B.brief({now:NOW,dayEnd:END,today:'2026-11-24',sales:{...sales,partial:true},
  marketing:{publications:[{project_id:'p',content_id:'c',channel_id:'x',status:'failed',updated_at:iso(NOW)}],partial:true},
  projects:{items:[{name:'Alfa',status:'active',journey:{steps:[{label:'Brief',state:'waiting'},{label:'PED',state:'active'}]}}]},
  pm:{plans:[{id:'p',name:'Alfa',tasks:[{status:'Da fare',due:'2026-11-01'},{status:'Da fare',due:'2026-11-02'}]}],partial:true},
  integrations:{items:[{label:'Twilio',configured:false}]}});
 const phrases=b.lines.flatMap(l=>l.parts.concat(l.notes)).concat([B.headline(b),B.headline(B.brief({})),B.headline(B.brief({now:NOW,integrations:{items:[]}}))],
  B.brief({now:NOW,dayEnd:END,today:'2026-11-24',sales:{tasks:[],opportunities:[],interactions:[]},marketing:{publications:[]},projects:{items:[]},integrations:{items:[]}}).lines.flatMap(l=>l.parts),
  [B.salesLine({error:'CRM 504'},NOW,END),B.marketingLine({error:'x'},NOW,END),B.projectsLine({error:'x'}),B.systemLine({error:'x'})].flatMap(l=>l.parts));
 assert.ok(phrases.length>=18);
 for(const p of phrases){const en=T(p);assert.ok(en&&en!==p,'manca la traduzione di: '+p)}
 assert.equal(T('2 attività in ritardo (soprattutto «Alfa»)'),'2 tasks late (mostly «Alfa»)');
 assert.equal(T('1 servizio non collegato: Twilio'),'1 service not connected: Twilio');
 for(const l of b.lines)assert.equal(l.text,[l.parts.join(', ')].concat(l.notes).map(x=>x+'.').join(' '));
});
// ---- Registro «Fatto oggi dalla Regia» (solo nel browser) ----
test('Registro della Regia: voce pulita, limiti, annullamento segnato, solo le voci di oggi',()=>{
 const C=require('../lib/radix-regia-core.js'),CC=require('../lib/regia-cc.js');
 const result={summary:'  1 lavoro fermo:\n parti da «Orchestratore PED». ',accepted:[{op:'pin',item:'Orchestratore PED',note:'bloccato'}]};
 const e=C.logEntry(result,CC.adapter,{pins:[]},{id:'a1',at:NOW,href:'/control-center-v2.html?project=forno-aurora'});
 assert.equal(e.summary,'1 lavoro fermo: parti da «Orchestratore PED».');assert.equal(e.n,1);assert.equal(e.state,'applied');assert.equal(e.title,'Command Center');
 assert.equal(e.lines.length,1);assert.equal(e.href,'/control-center-v2.html?project=forno-aurora');
 for(const bad of ['https://altro.example/x','//altro.example','javascript:alert(1)','/a b'])assert.equal(C.logEntry(result,CC.adapter,{},{id:'x',at:NOW,href:bad}).href,'',bad);
 assert.equal(C.logEntry(result,CC.adapter,{},{id:'',at:NOW}),null);assert.equal(C.logEntry(result,CC.adapter,{},{id:'x',at:'ieri'}),null);
 let list=C.logAdd([],e);list=C.logAdd(list,Object.assign({},e,{id:'a2',at:NOW-3*86400000}));list=C.logAdd(list,Object.assign({},e,{id:'a3',at:NOW-9*86400000}));
 const back=C.logParse(JSON.stringify(list),NOW);assert.deepEqual(back.map(x=>x.id).sort(),['a1','a2'],'oltre 7 giorni si perde');
 assert.deepEqual(C.logParse('non json',NOW),[]);assert.deepEqual(C.logParse('{"a":1}',NOW),[]);
 assert.deepEqual(C.logParse(JSON.stringify([{id:'z',at:NOW,summary:'<b>x</b>',lines:'no',n:1e9,state:'boh',extra:{a:1}}]),NOW),[{id:'z',at:NOW,area:'',title:'',href:'',summary:'<b>x</b>',lines:[],n:99,state:'applied'}]);
 let many=[];for(let i=0;i<60;i++)many=C.logAdd(many,Object.assign({},e,{id:'m'+i}));assert.equal(many.length,C.LOG_MAX);assert.equal(many[0].id,'m59');
 const marked=C.logMark(back,'a1','undone');assert.equal(marked.find(x=>x.id==='a1').state,'undone');assert.equal(back.find(x=>x.id==='a1').state,'applied','la lista di prima non cambia');
 const start=END-86400000;assert.deepEqual(C.logToday(marked,start,END).map(x=>x.id),['a1']);
});
test('Regia: «Sì, applica» scrive il registro nel browser, «Annulla» lo segna; senza archivio non si rompe niente',async()=>{
 const C=require('../lib/radix-regia-core.js'),CC=require('../lib/regia-cc.js'),guide=require('../lib/radix-guide.js'),R=require('../lib/radix-regia.js');
 const {makeDoc,html}=require('./regia-fake-dom.js');
 const page=()=>{const doc=makeDoc({shellPage:'cc',topbar:true}),b=doc.body;for(const [id,v] of [['metricProjects','4'],['metricWorkflows','2'],['metricApprovals','1']])b.append(html(doc,'div','metric-value',v,id));
  const wl=html(doc,'div',null,null,'workflowList'),w=html(doc,'div','workflow-card');w.append(html(doc,'div','workflow-name','Orchestratore PED'),html(doc,'div','workflow-state','blocked'),html(doc,'div','workflow-task','Aspetta l’identità visiva'));wl.append(w);b.append(html(doc,'div',null,null,'attentionList'),wl);return doc};
 const mem=new Map(),events=[];
 const run=async(localStorage)=>{const registry=C.createRegistry();registry.register('cc',CC.adapter);
  const win={location:{pathname:'/control-center-v2.html',hash:'',search:'?project=forno-aurora'},addEventListener(){},localStorage,Event:function(t){this.type=t},dispatchEvent:e=>events.push(e.type),
   fetch:async()=>({ok:true,status:201,json:async()=>({ok:true})})};
  const ui=R.create({doc:page(),win,registry,guide,send:R.stubSend,confirm:async()=>true,now:()=>NOW});ui.open();const r=await ui.ask('Cosa è fermo?');assert.equal(r.kind,'proposal');return {ui,r}};
 const store={getItem:k=>mem.has(k)?mem.get(k):null,setItem:(k,v)=>mem.set(k,String(v))};
 const a=await run(store);assert.equal(mem.size,0,'niente prima del «Sì»');
 await a.r.yes.click();
 let list=C.logParse(mem.get(C.LOG_KEY),NOW);assert.equal(list.length,1);assert.equal(list[0].state,'applied');assert.equal(list[0].title,'Command Center');
 assert.equal(list[0].href,'/control-center-v2.html?project=forno-aurora');assert.match(list[0].lines[0],/Orchestratore PED/);assert.deepEqual(events,['rx-regia-log']);
 assert.equal(await a.ui.undo(),true);list=C.logParse(mem.get(C.LOG_KEY),NOW);assert.equal(list[0].state,'undone');assert.equal(list.length,1);
 const b=await run({getItem(){throw new Error('bloccato')},setItem(){throw new Error('bloccato')}});await b.r.yes.click();assert.equal(b.ui.state.pins.length,1,'la modifica si applica lo stesso');
 const c=await run(undefined);await c.r.yes.click();assert.equal(c.ui.state.pins.length,1);
 const src=fs.readFileSync('lib/cc-brief.js','utf8');assert.ok(/logToday/.test(src)&&!/innerHTML|method:\s*'POST'/.test(src));
});
test('Inglese: il registro «Fatto oggi dalla Regia» è tradotto',()=>{
 const I=require('../lib/radix-i18n.js');require('../lib/radix-i18n-en.js');const T=I.compile(globalThis.RadixI18nEn,I.HAND);
 for(const [it,en] of [['Fatto oggi dalla Regia','Done today by Regia'],['1 modifica','1 change'],['3 modifiche','3 changes'],['annullata','cancelled'],['Apri la pagina','Open the page']])assert.equal(T.tr(it),en);
});
// ---- «passa»: una richiesta portata dal Command Center alla Regia di un'altra area ----
test('Command Center «passa»: validata, senza effetti, diventa un link con la richiesta; annullabile',async()=>{
 const C=require('../lib/radix-regia-core.js'),CC=require('../lib/regia-cc.js');const r=C.createRegistry(),a=r.register('cc',CC.adapter);
 const s={metrics:{},attention:[],workflows:[],today:[],pins:[],handoffs:[]};
 const p={area:'cc',summary:'Due cose da fare nelle aree',ops:[
  {op:'passa',area:'CRM',richiesta:'  Crea un’attività: richiamare Rossi\n domani alle 10 '},
  {op:'passa',area:'ped',richiesta:'Sposta il post di giovedì a venerdì',project:'forno-aurora'},
  {op:'passa',area:'ped',richiesta:'Senza progetto'},{op:'passa',area:'contabilita',richiesta:'x'},{op:'passa',area:'pm',richiesta:''},
  {op:'passa',area:'pm',richiesta:'x'.repeat(301)},{op:'passa',area:'pm',richiesta:'ok',project:'../x'},{op:'invia_email',to:'a@b.test'}]};
 const v=C.validateProposal(p,a,s);
 assert.equal(v.accepted.length,2);assert.deepEqual(v.rejected.map(x=>x.reason),['Per il Piano editoriale serve il progetto.','Area non riconosciuta: posso portare una richiesta solo a CRM, Project manager o Piano editoriale.','Manca la richiesta da portare.','La richiesta è troppo lunga (al massimo 300 caratteri).','Il progetto indicato non è valido.',C.REASON.effect]);
 assert.equal(C.previewOf(v.accepted[0],a,s),'Porta a CRM: «Crea un’attività: richiamare Rossi domani alle 10» (la applichi lì, con la sua conferma)');
 assert.equal(C.costOf(v.accepted,a).label,'nessuna chiamata AI · nessun credito');
 const res=await C.applyProposal(a,s,v.accepted),view=a.view(res.state);
 assert.equal(view.title,'Da portare nelle aree');assert.deepEqual(view.items,[]);
 assert.deepEqual(view.links,[{title:'Apri CRM: «Crea un’attività: richiamare Rossi domani alle 10»',href:'/radix-sales.html',handoff:{area:'crm',text:'Crea un’attività: richiamare Rossi domani alle 10'}},
  {title:'Apri Piano editoriale: «Sposta il post di giovedì a venerdì»',href:'/project-editorial.html?project=forno-aurora',handoff:{area:'ped',text:'Sposta il post di giovedì a venerdì'}}]);
 assert.match(C.validateProposal(p,a,res.state).rejected[0].reason,/già pronta/);
 assert.equal(await res.undo(),s);assert.equal(a.view(s),null);
 assert.match(a.context(s),/"op":"passa","area":"crm\|pm\|ped"/);assert.ok(C.contextBlock(a,s).length<=2500);
 const src=fs.readFileSync('lib/regia-cc.js','utf8');assert.ok(!/fetch\(|Storage/.test(src),'l’adattatore non chiama e non salva');
 for(const k of Object.keys(CC.AREAS))assert.ok(fs.existsSync(CC.AREAS[k].href.slice(1)),'la pagina esiste: '+CC.AREAS[k].href);
});
test('Passaggio tra pagine: scade, vale per una sola area, il testo è ripulito',()=>{
 const C=require('../lib/radix-regia-core.js');const h=C.handoffPack('crm','  richiamare\n Rossi ',NOW);
 assert.deepEqual(h,{area:'crm',text:'richiamare Rossi',at:NOW});const raw=JSON.stringify(h);
 assert.deepEqual(C.handoffParse(raw,'crm',NOW+60000),h);assert.equal(C.handoffParse(raw,'pm',NOW+60000),null);
 assert.equal(C.handoffParse(raw,'crm',NOW+31*60000),null,'dopo 30 minuti non vale più');assert.equal(C.handoffParse(raw,'crm',NOW-1),null,'non dal futuro');
 for(const bad of ['','null','[]','{"area":"crm"}','non json','{"area":"CRM!","text":"x","at":1}'])assert.equal(C.handoffParse(bad,'crm',NOW),null,bad);
 assert.equal(C.handoffPack('crm','',NOW),null);assert.equal(C.handoffPack('crm','x'.repeat(999),NOW).text.length,300);
});
test('Regia: il link scrive il passaggio nella sessione; la pagina di arrivo mostra il testo pronto e non invia niente',async()=>{
 const C=require('../lib/radix-regia-core.js'),CC=require('../lib/regia-cc.js'),guide=require('../lib/radix-guide.js'),R=require('../lib/radix-regia.js');
 const {makeDoc}=require('./regia-fake-dom.js');
 const mem=new Map(),session={getItem:k=>mem.has(k)?mem.get(k):null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k)};mem.set(R.CONFIRM_KEY,'1');
 const fetches=[],win=(pathname)=>({location:{pathname,hash:'',search:''},addEventListener(){},sessionStorage:session,fetch:async u=>{fetches.push(u);return {ok:true,status:201,json:async()=>({ok:true})}}});
 // partenza: Command Center, AI finta che propone un «passa»
 const reg=C.createRegistry();reg.register('cc',CC.adapter);const sent=[];
 const send=async m=>{sent.push(m);return 'Ecco.\n```json\n'+JSON.stringify({area:'cc',summary:'Richiamo da fissare',ops:[{op:'passa',area:'crm',richiesta:'Crea un’attività: richiamare Rossi domani alle 10'}]})+'\n```'};
 const ui=R.create({doc:makeDoc({shellPage:'cc',topbar:true}),win:win('/control-center-v2.html'),registry:reg,guide,send,now:()=>NOW});
 assert.equal(ui.carried,null);ui.open();const r=await ui.ask('Com’è la giornata?');assert.equal(r.kind,'proposal');await r.yes.click();
 const links=ui.areaView.querySelectorAll('.rx-regia-link');assert.equal(links.length,1);assert.equal(links[0].getAttribute('href')||links[0].href,'/radix-sales.html');
 assert.equal(mem.has(C.HANDOFF_KEY),false,'niente prima del clic');links[0].dispatchEvent?links[0].dispatchEvent({type:'click'}):links[0].click();
 assert.deepEqual(JSON.parse(mem.get(C.HANDOFF_KEY)),{area:'crm',text:'Crea un’attività: richiamare Rossi domani alle 10',at:NOW});
 // arrivo: una pagina dell'area «crm» (adattatore finto, senza operazioni)
 const reg2=C.createRegistry();reg2.register('crm',{title:'CRM',pages:['sales-crm'],shortcuts:[],ops:{},context:()=>'',read:()=>({})});const sent2=[];
 const there=()=>R.create({doc:makeDoc({shellPage:'sales-crm',topbar:true}),win:win('/radix-sales.html'),registry:reg2,guide,send:async m=>{sent2.push(m);return 'ok'},now:()=>NOW+5000});
 const ui2=there();assert.equal(ui2.carried.text,'Crea un’attività: richiamare Rossi domani alle 10');assert.equal(ui2.panel.hidden,false);
 assert.equal(ui2.input.value,'Crea un’attività: richiamare Rossi domani alle 10');assert.match(ui2.log.textContent,/Richiesta portata dal Command Center/);
 assert.equal(sent2.length,0,'nessuna chiamata AI da sola');assert.equal(mem.has(C.HANDOFF_KEY),false,'usato una volta sola');
 assert.equal(there().carried,null);
 // un passaggio per un'altra area resta dov'è
 mem.set(C.HANDOFF_KEY,JSON.stringify(C.handoffPack('pm','Sposta la fase Collaudo',NOW)));assert.equal(there().carried,null);assert.equal(mem.has(C.HANDOFF_KEY),true);
});
