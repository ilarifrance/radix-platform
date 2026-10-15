'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const rt=require('../lib/radix-agent-runtime');

test('roster matches the agents the server knows',()=>{
 const src=fs.readFileSync('api/chat.js','utf8'),i=src.indexOf('const AGENTS = {');
 const server=new Set([...src.slice(i).matchAll(/^ {0,2}"?([a-z-]+)"?: \{/gm)].map(m=>m[1]));
 for(const a of rt.AGENTS)if(!a.pipeline)assert.ok(server.has(a.id),a.id+' exists in api/chat.js');
 assert.equal(rt.agent('consulente-lavoro').id,'lavoro-paghe');
 assert.ok(rt.isHub('partner'));assert.ok(!rt.isHub('copywriter'));
});

test('routing keeps v3.7 numbering, drops hubs and unknown roles',()=>{
 const text='Piano\n---ROUTING---\n1. strategist|Definisci i pilastri\n\nfoo|ignoto\n- copywriter|Scrivi 3 post|dipende:1\npartner|non ammesso\nart-director|Visual|dipende:1,3\n---FINE---';
 const items=rt.parseRouting(text);
 assert.deepEqual(items.map(i=>i.role),['strategist','copywriter','art-director']);
 assert.deepEqual(items[1].deps,[1]);assert.deepEqual(items[2].deps,[1,2]);
 assert.equal(rt.stripRouting(text),'Piano');
 assert.deepEqual(rt.parseRouting('niente'),[]);
});

test('documents are parsed, stripped and flagged when interrupted',()=>{
 const t='Ecco.\n---DOCUMENTO: "Piano Q1"---\n# Titolo\nTesto\n---FINE DOCUMENTO---\nNota finale\n---DOCUMENTO: Bozza---\nmezzo';
 const docs=rt.parseDocuments(t);
 assert.equal(docs.length,2);assert.equal(docs[0].title,'Piano Q1');assert.equal(docs[0].body,'# Titolo\nTesto');assert.equal(docs[1].incomplete,true);
 assert.equal(rt.stripDocuments(t),'Ecco.\n\nNota finale');
 assert.ok(rt.looksLikeDraftedDocument(t));assert.ok(!rt.looksLikeDraftedDocument('Piano breve'));
});

test('a truncated reply is continued with the text so far as prefill',async()=>{
 const bodies=[];const replies=[{reply:'Prima parte ',truncated:true,sources:[{url:'https://a'}]},{reply:' seconda parte',truncated:false,sources:[{url:'https://a'},{url:'https://b'}]}];
 const fetch=async(url,opts)=>{bodies.push(JSON.parse(opts.body));const d=replies.shift();return {status:200,ok:true,json:async()=>d}};
 const progress=[];
 const r=await rt.reply({role:'copywriter',messages:[{role:'user',content:'Scrivi'}],project:{name:'X'},memoryScope:{projectId:'radix'}},{fetch,onProgress:p=>progress.push(p)});
 assert.equal(r.text,'Prima parte seconda parte');assert.equal(r.parts,2);assert.equal(r.sources.length,2);assert.deepEqual(progress,[2]);
 assert.deepEqual(bodies[1].messages.at(-1),{role:'assistant',content:'Prima parte'});
 assert.deepEqual(bodies[0].memoryScope,{projectId:'radix'});
 const unauth=async()=>({status:401,ok:false,json:async()=>({})});
 await assert.rejects(rt.reply({role:'x',messages:[]},{fetch:unauth}),e=>e.status===401);
});

test('flows respect dependencies, pass results on and skip work after a failure',async()=>{
 const flow=rt.makeFlow([{role:'strategist',subtask:'A'},{role:'copywriter',subtask:'B',deps:[1]},{role:'seo-geo',subtask:'C'},{role:'analytics',subtask:'D',deps:[3]}],1);
 const seen={};
 await rt.runNodes(flow,{call:async(role,text)=>{seen[role]=text;if(role==='seo-geo')throw Error('rete');return {text:'---DOCUMENTO: Doc '+role+'---\nok\n---FINE DOCUMENTO---'}}});
 assert.deepEqual(flow.nodes.map(n=>n.status),['done','done','error','error']);
 assert.match(seen.copywriter,/=== Digital Strategist \(A\) ===\n---DOCUMENTO: Doc strategist/);
 assert.equal(seen.analytics,undefined);
 const {prompt,produced}=rt.summaryPrompt('Lancio',flow,1);
 assert.equal(produced.length,2);assert.match(prompt,/Richiesta originale: Lancio/);assert.match(prompt,/non riuscito: rete/);assert.match(prompt,/nuovo blocco ---ROUTING---/);
 assert.doesNotMatch(rt.summaryPrompt('x',flow,rt.MAX_ORCH_ROUNDS).prompt,/emetti un nuovo blocco/);
});

test('a billing error halts the queue so the flow can be resumed',async()=>{
 const flow=rt.makeFlow([{role:'strategist',subtask:'A'},{role:'copywriter',subtask:'B'},{role:'seo-geo',subtask:'C'}],1);
 await rt.runNodes(flow,{concurrency:1,call:async()=>{throw Error('Your credit balance is too low')}});
 assert.match(flow.halted,/credit balance/);assert.equal(flow.nodes.filter(n=>n.status==='pending').length,2);
});

test('markdown is escaped before formatting',()=>{
 const html=rt.renderMarkdown('# Titolo\n<script>x</script> **forte** [link](javascript:alert(1))\n\n| a | b |\n|---|---|\n| 1 | <b>2</b> |\n\n- uno\n- due',1);
 assert.doesNotMatch(html,/<script>|<b>2/);assert.match(html,/<h2>Titolo<\/h2>/);assert.match(html,/<strong>forte<\/strong>/);
 assert.doesNotMatch(html,/href="javascript/);assert.match(html,/<table>/);assert.match(html,/<ul><li>uno<\/li>/);
 assert.match(rt.wordHtml('Doc','## Sezione'),/<h1>Doc<\/h1><h2>Sezione<\/h2>/);
});

test('registry projects become the profile every agent receives',()=>{
 const p=rt.profileFor({id:'acme',name:'Acme',kind:'agency',summary:'',profile:{brief:{goal:'Più lead',audience:'PMI',channels:['LinkedIn','Email'],brandRules:'Diretto'}}});
 assert.equal(p.summary,'Più lead');assert.equal(p.channels,'LinkedIn, Email');assert.equal(p.voice,'Diretto');assert.equal(p.kind,'Progetto Agency');
 assert.equal(rt.profileFor({id:'radix',name:'RADIX',kind:'brand',summary:'Studio',profile:{voice:'Sintetico'}}).voice,'Sintetico');
});

test('agents page stores conversations per project and is linked from the other areas',()=>{
 const core=require('../api/_registry-core');assert.ok(core.MODULES.includes('agents'));
 const page=fs.readFileSync('agents-page.js','utf8');
 assert.match(page,/ws\.bind\(project\.id,'agents'\)/);assert.match(page,/memoryScope:scope\(role\)/);
 const html=fs.readFileSync('agents.html','utf8');assert.match(html,/connect-src 'self'/);assert.doesNotMatch(html,/<script>(?!<\/script>)/);
});

test('v3.7 media tools: slides, email drafts and which agent gets which tool',()=>{
 const media=require('../lib/radix-agent-media');
 const text='Concept\n---SLIDES---\n1|#0F2D24|#FAF9F6|Hook forte\n2|#zzzzzz|#FAF9F6|colore errato\n3|#EDE6DE|#1F1F1F|Testo | con barra\n---FINE---';
 const slides=media.parseSlides(text);
 assert.equal(slides.length,2);assert.equal(slides[1].text,'Testo | con barra');assert.equal(media.stripSlides(text),'Concept');
 assert.deepEqual(media.parseEmailDraft('Oggetto: Ciao\nCorpo:\nTesto mail'),{subject:'Ciao',body:'Testo mail'});
 assert.equal(media.shortLabel({id:'acme',name:'Acme — Lancio'}),'ACME');assert.deepEqual(media.palette({visual:'#111111 e #222222'}),['#111111','#222222']);
 assert.match(media.slideImagePrompt({text:'Hook'},{id:'acme',summary:'Caffè'}),/Caffè/);
 const src=fs.readFileSync('lib/radix-agent-media.js','utf8');
 for(const phrase of ['DAVVERO in coda','DAVVERO un’email','consuma crediti'])assert.ok(src.includes(phrase),'confirmation: '+phrase);
 assert.match(fs.readFileSync('agents-page.js','utf8'),/media\.toolsFor\(/);
});
