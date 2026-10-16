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
 assert.deepEqual(b,{name:'Lancio Aura',goal:'Awareness Aura',audience:'PMI',market:'',budget:null,channels:['LinkedIn','Instagram'],brandRules:'Chiaro · Aura',constraints:'Niente spesa',clientId:null});
 assert.equal(route.briefForSetup(project,null).goal,'Lanciare Aura');
 assert.match(route.setupPrompt(b),/Canali: LinkedIn, Instagram[\s\S]*---ROUTING---/);
 const roles={'marketing-orchestrator':'Orchestratore','copywriter':'Copywriter','strategist':'Strategist'};
 const ws=route.workspaceFromReply(b,roles,'Piano\n---ROUTING---\n1. strategist | Analisi\n2. copywriter | Testi | dipende:1\n---FINE---','2026-10-16T00:00:00Z');
 assert.equal(ws.planText,'Piano');assert.deepEqual(ws.tasks.map(t=>t.role+':'+t.dependsOn.join()),['strategist:','copywriter:step-1']);assert.equal(ws.schemaVersion,1);assert.equal(ws.brief,b);
 assert.throws(()=>route.workspaceFromReply(b,roles,'nessun routing'),/incarichi eseguibili/);
});
