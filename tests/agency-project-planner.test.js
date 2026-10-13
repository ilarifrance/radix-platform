'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const {normalizeBrief,buildPlan}=require('../lib/agency-project-planner');
const b={name:'Launch',goal:'Leads',audience:'SMB',channels:['social','paid'],budget:500};
test('rejects invalid project data',()=>{assert.throws(()=>normalizeBrief({name:'x'}));assert.throws(()=>normalizeBrief({...b,channels:['fake']}));assert.throws(()=>normalizeBrief({...b,budget:-1}));});
test('deduplicates channels',()=>assert.deepEqual(normalizeBrief({...b,channels:['social','social']}).channels,['social']));
test('builds only proposed steps with separated approval gates',()=>{const p=buildPlan(b,{'strategist':'Digital Strategist'});assert.equal(p.tasks.length,8);assert.ok(p.tasks.every(t=>t.automated===false&&t.state==='proposed'));assert.equal(p.tasks.find(t=>t.channel==='social').gate,'per_post_revision');assert.equal(p.tasks.find(t=>t.id==='distribution').gate,'external_action');assert.equal(p.execution.status,'not_started');assert.ok(p.tasks[0].missingRoles.includes('marketing-orchestrator'));});
