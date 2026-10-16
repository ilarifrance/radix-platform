'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const a=require('../lib/v37-archive.js');
const state={history:{copywriter:[{role:'user',content:'[allegato] Scrivi',display:'Scrivi',by:'Anna',at:'2026-10-01T10:00:00Z'},{role:'assistant',content:'Testo',at:'2026-10-01T10:01:00Z'},{role:'user',hidden:true,content:'nota'}],
 'art-director':[],strategist:[{role:'assistant',content:'Piano',flow:{nodes:[]},at:'2026-10-05T09:00:00Z'}],broken:'x'}};

test('summary lists agents with visible messages, newest first',()=>{
 const s=a.summarize(state,id=>id.toUpperCase());
 assert.deepEqual(s.map(r=>r.agentId),['strategist','copywriter']);
 assert.equal(s[1].count,2);assert.equal(s[1].label,'COPYWRITER');assert.equal(s[0].flows,1);assert.equal(s[1].preview,'Testo');
 assert.deepEqual(a.summarize(null),[]);
});

test('markdown export uses what the user saw and skips hidden notes',()=>{
 const md=a.toMarkdown('Copywriter',state.history.copywriter);
 assert.match(md,/^# Archivio v3\.7 · Copywriter/);assert.match(md,/## Anna · 2026-10-01T10:00:00Z\n\nScrivi/);
 assert.doesNotMatch(md,/allegato|nota/);
});

test('import goes in front of the project conversation once',()=>{
 const conv={copywriter:[{role:'user',content:'nuovo'}]};
 const r=a.mergeInto(conv,'copywriter',state.history.copywriter);
 assert.equal(r.added,2);assert.equal(r.conversations.copywriter.length,3);assert.equal(r.conversations.copywriter[0].importedFrom,'v3.7');assert.equal(r.conversations.copywriter[2].content,'nuovo');
 assert.equal(conv.copywriter.length,1);
 assert.equal(a.mergeInto(r.conversations,'copywriter',state.history.copywriter).added,0);
 const many=Array.from({length:80},(_,i)=>({role:'assistant',content:'m'+i}));
 const big=a.mergeInto({},'x',many);assert.equal(big.added,60);assert.equal(big.conversations.x[59].content,'m79');
});

test('last Pipeline post run becomes an editable pipeline flow, once',()=>{
 const st={pipelineTask:'Lancio servizio',pipelineSteps:[{role:'strategist',label:'Strategist',status:'done',output:'Direzione'},{role:'copywriter',label:'Copywriter',status:'stale',output:'Testo'},{role:'art-director',label:'Art Director',status:'pending',output:null}]};
 const run=a.pipelineRun(st);assert.equal(run.steps.length,2);assert.equal(a.pipelineRun({pipelineSteps:[{role:'x',output:'  '}]}),null);
 assert.match(a.pipelineMarkdown(run),/\*\*Brief:\*\* Lancio servizio[\s\S]*## 2\. Copywriter\n\nTesto/);
 const r=a.mergePipeline({orchestrator:[{role:'user',content:'mio'}]},run);
 assert.equal(r.added,2);const f=r.conversations.orchestrator[1].flow;
 assert.equal(f.pipeline,true);assert.deepEqual(f.nodes.map(n=>[n.status,n.deps]),[['done',[]],['stale',[1]]]);assert.equal(r.conversations.orchestrator[2].content,'mio');
 assert.equal(a.mergePipeline(r.conversations,run).added,0);assert.equal(a.mergePipeline({},null).added,0);
});

test('v3.7 profiles fill only empty project fields; HeyGen choice kept when missing',()=>{
 const v={name:'RADIX',kind:'Studio',summary:'Studio AI',audience:'PMI',voice:'Diretta',visual:'#0F2D24'};
 const {changes,filled}=a.profileFill(v,{summary:'Già scritta',profile:{voice:'Del team',channels:'LinkedIn'}});
 assert.deepEqual(filled.sort(),['audience','kind','visual']);assert.equal(changes.profile.voice,'Del team');assert.equal(changes.profile.channels,'LinkedIn');assert.equal(changes.summary,undefined);
 assert.equal(a.profileFill(v,{summary:'',profile:{}}).changes.summary,'Studio AI');
 assert.deepEqual(a.profiles({projects:[{name:'A'},{},null]}).length,1);
 assert.deepEqual(a.mergePrefs({'heygen-voice':'mia'},{heygenAvatarId:'av',heygenVoiceId:'v37'}),{'heygen-voice':'mia','heygen-avatar':'av'});
});
