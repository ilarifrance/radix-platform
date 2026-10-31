'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const core=require('../api/_registry-core');

test('client and project validation keeps the existing Agency limits',()=>{
 assert.deepEqual(core.client({name:' Acme ',status:'active',goal:'x'.repeat(600)}).goal.length,500);
 assert.throws(()=>core.client({name:'A'}),/almeno 2/);
 assert.throws(()=>core.client({name:'Acme',status:'deleted'}),/Stato cliente/);
 assert.deepEqual(core.client({goal:'Nuovo'},{partial:true}),{goal:'Nuovo'});
 const p=core.project({name:'Lancio',clientId:'cl-12345678'});
 assert.equal(p.kind,'agency');assert.equal(p.status,'active');assert.deepEqual(p.profile,{});
 assert.throws(()=>core.project({name:'Lancio',clientId:'acme'}),/Cliente non valido/);
 assert.throws(()=>core.project({name:'Lancio',profile:[]}),/Profilo/);
 assert.deepEqual(core.project({clientId:null},{partial:true}),{clientId:null});
});

test('generated ids match what the database accepts',()=>{
 assert.ok(core.validClientId(core.newClientId()));
 const id=core.newProjectId('Campagna Natale Caffè');
 assert.match(id,/^campagna-natale-caffe-[0-9a-f]{8}$/);
 assert.ok(core.validProjectId(id));
 assert.match(core.newProjectId('!!'),/^prj-[0-9a-f]{8}$/);
 assert.ok(core.validProjectId('agency-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),'browser Agency ids import unchanged');
 assert.ok(core.validProjectId('radix'),'Command Center ids import unchanged');
});

test('documents are limited to known modules and a bounded size',()=>{
 assert.equal(core.documentPayload({projectId:'radix',module:'pm',revision:0,data:{}}).module,'pm');
 assert.throws(()=>core.documentPayload({projectId:'radix',module:'other',revision:0,data:{}}),/Modulo/);
 assert.throws(()=>core.documentPayload({projectId:'radix',module:'pm',data:{}}),/Versione/);
 assert.throws(()=>core.documentPayload({projectId:'radix',module:'pm',revision:0,data:{big:'x'.repeat(core.MAX_DOCUMENT_BYTES)}}),/troppo grande/);
});

test('fingerprint ignores key order and changes with content',()=>{
 assert.equal(core.fingerprint({a:1,b:[{c:2,d:3}]}),core.fingerprint({b:[{d:3,c:2}],a:1}));
 assert.notEqual(core.fingerprint({a:1}),core.fingerprint({a:2}));
 assert.notEqual(core.fingerprint([1,2]),core.fingerprint([2,1]));
 assert.match(core.fingerprint('testo'),/^[0-9a-f]{64}$/);
 assert.throws(()=>core.fingerprint(undefined),/richiesto/);
});

test('approvals: agents may request, a person decides, edits make an approval stale',()=>{
 const r=core.approvalRequest({projectId:'radix',subjectType:'content',subjectId:'post-1',content:{copy:'Ciao'},agentId:'copywriter'},7);
 assert.equal(r.requestedBy,'agent:copywriter');
 assert.equal(core.approvalRequest({projectId:'radix',subjectType:'strategy',subjectId:'rev-1',content:{}},7).requestedBy,'user:7');
 assert.throws(()=>core.approvalRequest({projectId:'radix',subjectType:'publish',subjectId:'x',content:{}},7),/Tipo/);
 assert.throws(()=>core.approvalDecision({id:'00000000-0000-4000-8000-000000000000',decision:'reject',content:{}}),/nota/);
 const d=core.approvalDecision({id:'00000000-0000-4000-8000-000000000000',decision:'approve',content:{copy:'Ciao'}});
 assert.equal(d.state,'approved');assert.equal(d.fingerprint,r.fingerprint);
 const record={state:'approved',fingerprint:r.fingerprint};
 assert.equal(core.approvalStatus(record,{copy:'Ciao'}),'approved');
 assert.equal(core.approvalStatus(record,{copy:'Ciao!'}),'stale');
 assert.equal(core.approvalStatus(null,{}),'none');
});

test('schema file and handler stay in sync with the core',()=>{
 const sqlFile=fs.readFileSync('migrations/core/001_registry.sql','utf8');
 for(const statement of core.SCHEMA)assert.ok(sqlFile.includes(statement),'migration file contains '+statement.slice(0,40));
 for(const m of core.MODULES)assert.match(core.SCHEMA.join('\n'),new RegExp("'"+m+"'"));
 const handler=fs.readFileSync('api/_registry-handler.js','utf8');
 assert.match(handler,/getSessionUser\(req\)/);
 assert.match(handler,/revision=\$\{revision\}|revision=\$\{d\.revision\}/);
 assert.match(fs.readFileSync('api/workspace.js','utf8'),/_registry-handler/);
 assert.match(fs.readFileSync('api/admin/_migrate.js','utf8'),/registry === '1'/);
});

test('serverless function count stays within the Hobby limit of 12',()=>{
 const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(d+'/'+e.name):[d+'/'+e.name]);
 const fns=walk('api').filter(f=>f.endsWith('.js')&&!f.split('/').pop().startsWith('_'));
 assert.ok(fns.length<=12,fns.join(', '));
});

test('publication requests name one approved content version and a Buffer channel',()=>{
 const ok=core.publicationRequest({projectId:'radix',contentId:'c-1',revision:3,channelId:'ch1',channelName:'LinkedIn RADIX',mode:'scheduled'});
 assert.deepEqual(ok,{projectId:'radix',contentId:'c-1',revision:3,channelId:'ch1',channelName:'LinkedIn RADIX',mode:'scheduled',retryUncertain:false});
 assert.throws(()=>core.publicationRequest({projectId:'radix',contentId:'c-1',revision:0,channelId:'ch1',mode:'queue'}),/Versione/);
 assert.throws(()=>core.publicationRequest({projectId:'radix',contentId:'c-1',revision:1,channelId:'',mode:'queue'}),/canale/);
 assert.throws(()=>core.publicationRequest({projectId:'radix',contentId:'c-1',revision:1,channelId:'x',mode:'now'}),/Modalità/);
 assert.match(core.SCHEMA.join('\n'),/UNIQUE \(project_id, content_id, revision, service\)/);
});

test('an approval survives a new revision that changes only the graphics', () => {
 const editorial = require('../editorial-core.js');
 const base = { title: 'T', channel: 'LinkedIn', date: '2026-10-24', time: '08:00', strategyRevision: 1 };
 const item = { ...base, copy: 'Ciao', revision: 4, status: 'approved', history: [
  { ...base, copy: 'Bozza', revision: 2, status: 'review' }, { ...base, copy: 'Ciao', revision: 3, status: 'approved' }] };
 assert.deepEqual(editorial.sameWordRevisions(item), [4, 3]);
 const record = { state: 'approved', fingerprint: core.fingerprint(editorial.approvalPayload({ ...item, revision: 3 })) };
 const ok = editorial.sameWordRevisions(item).some(revision => core.approvalStatus(record, editorial.approvalPayload({ ...item, revision })) === 'approved');
 assert.equal(ok, true);
 const old = { state: 'approved', fingerprint: core.fingerprint(editorial.approvalPayload({ ...item, copy: 'Bozza', revision: 2 })) };
 assert.equal(editorial.sameWordRevisions(item).some(revision => core.approvalStatus(old, editorial.approvalPayload({ ...item, revision })) === 'approved'), false);
});

test('an uploaded photo is kept on the content without a Higgsfield request',()=>{
 const editorial=require('../editorial-core.js');
 const state={briefApproved:true,strategyRevision:1,contents:[]};
 const c=editorial.updateContent(state,{id:'p1',title:'Post',channel:'LinkedIn',copy:'Testo',photo:{source:'upload',headline:'Titolo',at:'2026-10-24T10:00:00Z',url:'javascript:x'}});
 assert.deepEqual(c.photo,{source:'upload',headline:'Titolo',at:'2026-10-24T10:00:00Z'});
 assert.equal(editorial.updateContent(state,{id:'p2',title:'Post',channel:'LinkedIn',copy:'x',photo:{source:'other'}}).photo,undefined);
});
