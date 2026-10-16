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

test('agents get the memory closest to their work first, without duplicates, and we know what was left out',()=>{
 const core=require('../api/_agency-memory-core');
 const row=(id,level,kind,updated,extra={})=>({id,level,kind,status:'confirmed',project_id:'p1',client_id:'c1',agent_id:'',title:'T '+id,content:'Contenuto '+id,source:'fonte',updated_at:updated,...extra});
 const rows=[row('a1','agency','decision','2026-10-16'),row('p-out','project','outcome','2026-10-15'),row('p-dec','project','decision','2026-10-01'),
  row('ag','agent','preference','2026-09-01',{agent_id:'copywriter'}),row('ag2','agent','preference','2026-10-10',{agent_id:'seo'}),row('c1','client','fact','2026-10-14'),
  row('dup','project','decision','2026-09-30',{title:'T p-dec',content:'Contenuto p-dec'}),row('prop','project','decision','2026-10-16',{status:'proposed'})];
 const sel=core.selectContext(rows,{projectId:'p1',clientId:'c1',agentId:'copywriter'});
 assert.deepEqual(sel.used,['ag','p-dec','p-out','c1','a1']);assert.deepEqual(sel.omitted,[]);
 assert.match(sel.context,/^\[Per questo agente · Preferenza\] T ag/);assert.doesNotMatch(sel.context,/T prop|T ag2/);
 const small=core.selectContext(rows,{projectId:'p1',clientId:'c1',agentId:'copywriter',maxChars:120});
 assert.ok(small.used.length>=1&&small.omitted.length>=1);assert.equal(small.used[0],'ag');
 assert.equal(core.buildContext(rows,{projectId:'p1',clientId:'c1',agentId:'copywriter'}),sel.context);
});

test('editing a memory sends it back to confirmation; the Command Center and the pages read the team memory',()=>{
 const store=fs.readFileSync('api/_agency-memory-store.js','utf8');
 assert.match(store,/status='proposed',confirmed_by=NULL,confirmed_at=NULL,revision=revision\+1/);
 const handler=fs.readFileSync('api/_agency-memory-handler.js','utf8');
 assert.match(handler,/mode==='pending'/);assert.match(handler,/store\.edit\(db,id,revision/);
 assert.match(fs.readFileSync('control-center-v2.html','utf8'),/\/api\/agency-memory\?mode=pending/);
 assert.match(fs.readFileSync('verticals/studio.js','utf8'),/Proponi in memoria/);
 assert.match(fs.readFileSync('agents-page.js','utf8'),/function memoryInfo\(\)/);
});
