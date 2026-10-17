'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const route=require('../agency/orchestration-core.js');
const allowed=['strategist','copywriter','seo-geo','paid-media','web-developer','marketing-orchestrator'];
test('RADIX v3.7 ROUTING is parsed with dependencies',()=>{const x=route.parseRouting('Piano\n---ROUTING---\n1. strategist|Strategia\n2. copywriter|Copy|dipende:1\n---FINE---',allowed);assert.equal(x.length,2);assert.deepEqual(x[1].dependsOn,['step-1']);assert.deepEqual(route.nextReady(x).map(t=>t.id),['step-1']);x[0].status='done';assert.deepEqual(route.nextReady(x).map(t=>t.id),['step-2'])});
test('blocks unknown roles, hubs and forward dependencies',()=>{assert.throws(()=>route.parseRouting('---ROUTING---\nunknown|task\n---FINE---',allowed));assert.throws(()=>route.parseRouting('---ROUTING---\nmarketing-orchestrator|task\n---FINE---',allowed));assert.throws(()=>route.parseRouting('---ROUTING---\nstrategist|task|dipende:2\n---FINE---',allowed))});
test('limits size and refuses malformed routing',()=>{assert.throws(()=>route.parseRouting('---ROUTING---\n'+Array.from({length:13},()=> 'strategist|task').join('\n')+'\n---FINE---',allowed));assert.deepEqual(route.parseRouting('No tasks',allowed),[])});
test('does not unblock a failed prerequisite',()=>{const t=route.parseRouting('---ROUTING---\nstrategist|A\ncopywriter|B|dipende:1\n---FINE---',allowed);t[0].status='error';assert.equal(route.nextReady(t).length,0);assert.equal(route.hasBlockedDependencies(t),true)});

test('a project without incarichi gets them from its approved PED brief or its profile',()=>{
 const project={id:'lancio-aura-1',name:'Lancio Aura',summary:'Lanciare Aura',client_id:null,profile:{brief:{budget:'',constraints:''}}};
 const b=route.briefForSetup(project,{goal:'Awareness Aura',audience:'PMI',channels:'LinkedIn, Instagram',voice:'Chiaro',brand:'Aura',gaps:'Niente spesa'});
 assert.deepEqual(b,{name:'Lancio Aura',goal:'Awareness Aura',audience:'PMI',market:'',budget:null,channels:['LinkedIn','Instagram'],brandRules:'Chiaro · Aura',constraints:'Niente spesa',facts:'',cases:'',clientId:null});
 assert.equal(route.briefForSetup(project,null).goal,'Lanciare Aura');
 assert.match(route.setupPrompt(b),/Canali: LinkedIn, Instagram[\s\S]*---ROUTING---/);
 const roles={'marketing-orchestrator':'Orchestratore','copywriter':'Copywriter','strategist':'Strategist'};
 const ws=route.workspaceFromReply(b,roles,'Piano\n---ROUTING---\n1. strategist | Analisi\n2. copywriter | Testi | dipende:1\n---FINE---','2026-10-16T00:00:00Z');
 assert.equal(ws.planText,'Piano');assert.deepEqual(ws.tasks.map(t=>t.role+':'+t.dependsOn.join()),['strategist:','copywriter:step-1']);assert.equal(ws.schemaVersion,1);assert.equal(ws.brief,b);
 assert.throws(()=>route.workspaceFromReply(b,roles,'nessun routing'),/incarichi eseguibili/);
});

test('addTask appends a manual incarico with valid role and dependencies',()=>{
 const core=require('../agency/orchestration-core.js');
 const roles={copywriter:'Copywriter','seo-specialist':'SEO Specialist','marketing-orchestrator':'Orchestratore'};
 const s={tasks:[{id:'step-1',role:'copywriter',instruction:'Scrivi i testi',dependsOn:[],status:'approved'}],roles:{copywriter:'Copywriter'}};
 const t=core.addTask(s,{role:'seo-specialist',instruction:'Analizza le keyword del settore',dependsOn:['step-1','step-1']},roles);
 assert.deepEqual(t,{id:'step-2',role:'seo-specialist',instruction:'Analizza le keyword del settore',dependsOn:['step-1'],status:'proposed',addedBy:'manual'});
 assert.equal(s.roles['seo-specialist'],'SEO Specialist');
 assert.throws(()=>core.addTask(s,{role:'marketing-orchestrator',instruction:'Coordina tutto il lavoro'},roles),/specialista/);
 assert.throws(()=>core.addTask(s,{role:'copywriter',instruction:'corto'},roles),/almeno 10/);
 assert.throws(()=>core.addTask(s,{role:'copywriter',instruction:'Scrivi altri testi',dependsOn:['step-9']},roles),/Dipendenza/);
 while(s.tasks.length<core.MAX_TASKS)core.addTask(s,{role:'copywriter',instruction:'Scrivi altri testi'},roles);
 assert.throws(()=>core.addTask(s,{role:'copywriter',instruction:'Scrivi altri testi'},roles),/Massimo/);
});

test('flags numeric claims in a draft that no given source contains',()=>{
 const sources=['15 anni nel B2B, +1M€ di fatturato annuo, +4 milioni in 3 anni','LinkedIn: 1.000 follower, circa 2.000 impression'];
 const draft='Con 15 anni di esperienza ho portato +1M€ annuo. Oggi ho 1.000 follower e 2.000 impression. Un cliente ha ottenuto +38% di lead e 120 nuovi clienti, ROI 3x, con 4.500 € di budget. Nel 2026, alle 9:00.';
 const flagged=route.unsupportedNumbers(draft,sources).map(x=>x.claim);
 assert.deepEqual(flagged,['+38%','120 nuovi clienti','3x','4.500 €']);
 assert.match(route.unsupportedNumbers(draft,sources)[0].context,/cliente ha ottenuto \+38% di lead/);
 assert.deepEqual(route.unsupportedNumbers('+4 milioni in 3 anni e 1M€',sources),[]);
 assert.deepEqual(route.unsupportedNumbers('',sources),[]);
});

test('calendar weeks start next Monday with correct weekdays in Europe/Rome',()=>{
 const c=route.calendarWeeks(Date.parse('2026-10-17T16:00:00Z'),8).split('\n');
 assert.equal(c.length,8);
 assert.equal(c[0],'Settimana 1: lun 19/10/2026, mar 20/10/2026, mer 21/10/2026, gio 22/10/2026, ven 23/10/2026, sab 24/10/2026, dom 25/10/2026');
 assert.match(c[1],/^Settimana 2: lun 26\/10\/2026/);
 assert.match(c[2],/^Settimana 3: lun 02\/11\/2026/);
 assert.match(route.calendarWeeks(Date.parse('2026-10-18T23:30:00Z'),1),/^Settimana 1: lun 26\/10/);
 assert.match(route.calendarWeeks(Date.parse('2026-10-19T08:00:00Z'),1),/^Settimana 1: lun 26\/10/);
});

test('collects the questions a draft leaves to the reviewer',()=>{
 const out='# Strategia\nTesto [caso reale da fornire] e ancora [caso reale da fornire].\n## Dati mancanti\n- Settore del cliente del caso\n2. **Tempo** che puoi dedicare\n## Calendario\n- Lunedì post\nFirma: [tuo link Calendly]';
 assert.deepEqual(route.missingInfo(out),['Settore del cliente del caso','Tempo che puoi dedicare','[caso reale da fornire]','[tuo link Calendly]']);
 assert.deepEqual(route.missingInfo('Solo testo [nota]'),[]);
});

test('flags speed promises that no source states',()=>{
 const flagged=route.unsupportedNumbers('Piano pronto in 2 minuti, video in 10 minuti, risposta in soli 10 secondi. Revisione in 1 ora.',['Il tempo di revisione è in 1 ora']).map(x=>x.claim);
 assert.deepEqual(flagged,['in 2 minuti','in 10 minuti','in soli 10 secondi']);
});

test('applies only the review fixes found verbatim in the draft',()=>{
 const draft='Il commerciale mi ha chiamato giovedì. Preventivo più basso di 1.500 euro. Fine.';
 const r=route.applyReview(draft,'Ecco:\n[{"trova":"Il commerciale mi ha chiamato giovedì.","sostituisci":"Succede spesso: il commerciale chiama.","motivo":"episodio inventato"},{"trova":"più basso di 1.500 euro","sostituisci":"più basso","motivo":"cifra non fornita"},{"trova":"testo assente","sostituisci":"x"},{"trova":"Fine.","sostituisci":"Fine."}]');
 assert.equal(r.text,'Succede spesso: il commerciale chiama. Preventivo più basso. Fine.');
 assert.equal(r.applied.length,2);assert.equal(r.skipped,2);assert.equal(r.applied[0].motivo,'episodio inventato');
 assert.deepEqual(route.applyReview(draft,'non è JSON'),{text:draft,applied:[],skipped:0});
 assert.match(route.reviewPrompt('BOZZA X','FATTI Y'),/FONTI:\nFATTI Y[\s\S]*BOZZA:\nBOZZA X/);
});

test('specialists get the real RADIX tools, the reviewer enforces them, cases travel with the brief',()=>{
 const R=require('../agency/orchestration-core.js');
 assert.match(R.RADIX_TOOLS,/clic sui link/);assert.match(R.RADIX_TOOLS,/NON misura le aperture/);assert.match(R.RADIX_TOOLS,/Non esistono in RADIX/);
 const p=R.reviewPrompt('bozza','fonti');assert.ok(p.includes(R.RADIX_TOOLS));assert.match(p,/funzioni attribuite a RADIX/);
 const b=R.briefForSetup({name:'X',profile:{brief:{goal:'g',facts:'15 anni B2B',cases:'Cliente A: +10%'}}},{});
 assert.equal(b.facts,'15 anni B2B');assert.equal(b.cases,'Cliente A: +10%');
 const src=require('node:fs').readFileSync(__dirname+'/../agency/project-workspace.html','utf8');
 assert.match(src,/RadixAgencyRouting\.RADIX_TOOLS/);assert.match(src,/CASI REALI DEL CLIENTE/);assert.match(src,/id="cases"/);
 const ped=require('node:fs').readFileSync(__dirname+'/../editorial-workspace.js','utf8');
 assert.match(ped,/copyPrompt\(state\.brief,item\)\+tools\(\)/);assert.match(ped,/planPrompt\(state,today\)\+tools\(\)/);
});
