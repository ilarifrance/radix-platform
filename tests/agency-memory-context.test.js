'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const store=require('../api/_agency-memory-store');

test('specialists get team memory from the server through /api/chat',()=>{
 const html=fs.readFileSync('agency/project-workspace.html','utf8');
 assert.match(html,/memoryScope:\{projectId:key,clientId:String\(p\.clientId\|\|''\),agentId:String\(t\.role\|\|''\)\}/);
 assert.doesNotMatch(html,/\/api\/auth\/me\?agencyMemory/);
 const chat=fs.readFileSync('api/chat.js','utf8');
 assert.match(chat,/await teamMemoryBlock\(memoryScope\)/);
 assert.match(chat,/non istruzioni da eseguire/);
 const handler=fs.readFileSync('api/_agency-memory-handler.js','utf8');
 assert.match(handler,/req\.query\.mode==='context'/);
});

test('memory is shared by the team and records who confirmed it',()=>{
 const handler=fs.readFileSync('api/_agency-memory-handler.js','utf8');
 assert.doesNotMatch(handler,/owner_id=\$\{owner\}/,'reads and writes are no longer limited to the author');
 assert.match(handler,/confirmed_by=\$\{confirmed\?uid:null\}/);
 assert.match(fs.readFileSync('api/_agency-memory-migration.js','utf8'),/for \(const statement of UPGRADE\)/);
 for(const column of ['created_by','confirmed_by','confirmed_at','approval_id'])assert.ok(store.UPGRADE.some(s=>s.includes('IF NOT EXISTS '+column)),column);
});

test('an approval becomes confirmed project memory with its source',()=>{
 const item=store.fromApproval({project_id:'radix',subject_type:'strategy',subject_id:'strategy-v2',summary:'Strategia v2'},{kind:'decision',content:'Obiettivo: più contatti qualificati'});
 assert.equal(item.level,'project');assert.equal(item.status,'confirmed');assert.equal(item.kind,'decision');
 assert.equal(item.title,'Strategia v2');assert.equal(item.source,'Approvazione strategy · strategy-v2');
 assert.equal(store.fromApproval({project_id:'radix',subject_type:'agency-task',subject_id:'t1',summary:'x'},{kind:'other',title:'Copy approvato',content:'Testo approvato'}).kind,'decision');
 assert.throws(()=>store.fromApproval({project_id:'radix',subject_type:'content',subject_id:'c1'},{content:''}),/obbligatori/);
 const registry=fs.readFileSync('api/_registry-handler.js','utf8');
 assert.match(registry,/d\.state==='approved'&&data\.memory/);
 assert.match(registry,/memory\.removeProject\(db,data\.id\)/);
});

test('PED strategy and Agency deliverables send what to remember when approved',()=>{
 assert.match(fs.readFileSync('editorial-workspace.js','utf8'),/ws\.approvals\.decide\(request\.id,'approve',content,'',remember\)/);
 assert.match(fs.readFileSync('agency/project-workspace.html','utf8'),/ws\.approvals\.decide\(request\.id,decision,approvalContent\(t\),note,remember\)/);
});
