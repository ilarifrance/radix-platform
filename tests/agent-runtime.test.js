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

test('the plain-language API errors from the server still halt the queue',async()=>{
 const {friendlyApiError}=require('../api/chat.js');
 for(const [m,st] of [['Your credit balance is too low',400],['invalid x-api-key',401],['Overloaded',529]]){
  const msg=friendlyApiError(Object.assign(new Error(m),{status:st}));
  const flow=rt.makeFlow([{role:'strategist',subtask:'A'},{role:'copywriter',subtask:'B'}],1);
  await rt.runNodes(flow,{concurrency:1,call:async()=>{throw Error(msg)}});
  assert.equal(flow.halted,msg);assert.equal(flow.nodes[1].status,'pending');
 }
});

test('a reply cut off before the document is a failure, not a delivery',async()=>{
 const flow=rt.makeFlow([{role:'legal-contracts',subtask:'Contratto'},{role:'legal-risk-analyst',subtask:'Rileggi',deps:[1]}],1);
 await rt.runNodes(flow,{concurrency:1,call:async()=>({text:'---DOCUMENTO: Contratto---\n# CONTRATTO\n\n⚠️ [Risposta interrotta per limite di spazio anche dopo 2 parti: scrivi "continua" per farla finire.]',truncated:true})});
 assert.deepEqual(flow.nodes.map(n=>n.status),['error','error']);
 assert.match(flow.nodes[0].output,/Rigenera ultima risposta/);
 const long=rt.makeFlow([{role:'legal-contracts',subtask:'X'}],1);
 await rt.runNodes(long,{call:async()=>({text:'a'.repeat(4000),truncated:true})});
 assert.equal(long.nodes[0].status,'done','a long text cut at the end is still delivered');
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
test('Markdown tables become Excel sheets with numbers kept as numbers',()=>{
 const md='Piano\n\n| Canale | Post | Budget |\n|---|:---:|---|\n| **LinkedIn** | 4 | 1200,50 |\n| Instagram | 6 | da definire |\n\nTesto\n\n| A | B |\n|---|---|\n| 1 | <x> |';
 const t=rt.markdownTables(md);assert.equal(t.length,2);assert.deepEqual(t[0],[['Canale','Post','Budget'],['LinkedIn','4','1200,50'],['Instagram','6','da definire']]);
 const x=rt.excelXml('Piano / Q4',md);assert.match(x,/<Worksheet ss:Name="1 Piano   Q4">/);assert.match(x,/<Data ss:Type="Number">1200.5<\/Data>/);assert.match(x,/<Data ss:Type="String">da definire/);assert.match(x,/&lt;x&gt;/);
 assert.equal(rt.excelXml('Nessuna','solo testo'),null);
});
test('pipeline steps: edit or regenerate one step and mark the later ones to update',async()=>{
 const flow=rt.makeFlow([{role:'strategist',subtask:'A'},{role:'copywriter',subtask:'B',deps:[1]},{role:'art-director',subtask:'C',deps:[1,2]},{role:'analytics',subtask:'D'}],1);
 flow.nodes.forEach((n,i)=>{n.status='done';n.output='out'+i});
 assert.equal(rt.editNode(flow,0,' Nuova direzione ','Anna'),2);assert.deepEqual(flow.nodes.map(n=>n.status),['done','stale','stale','done']);assert.equal(flow.nodes[0].output,'Nuova direzione');
 assert.throws(()=>rt.editNode(flow,0,'  '),/vuoto/);
 await assert.rejects(rt.rerunNode(flow,2,{call:async()=>({text:'x'})}),/Aggiorna prima/);
 const prompts=[];const call=async(role,text)=>{prompts.push(text);return {text:'nuovo '+role}};
 assert.equal(rt.requeueStale(flow),2);await rt.runNodes(flow,{call,concurrency:1});assert.deepEqual(flow.nodes.map(n=>n.status),['done','done','done','done']);
 assert.match(prompts[0],/Nuova direzione/);
 prompts.length=0;const stale=await rt.rerunNode(flow,1,{call,note:'Più breve'});assert.equal(stale,1);assert.match(prompts[0],/Più breve/);assert.match(prompts[0],/LA TUA VERSIONE PRECEDENTE:\nnuovo copywriter/);
 assert.equal(flow.nodes[2].status,'stale');assert.equal(flow.nodes[3].status,'done');
 await rt.rerunNode(flow,3,{call:async()=>{throw Error('rete')}});assert.equal(flow.nodes[3].status,'error');
});
test('flow summaries: time left, full text, all documents and the "cosa creare ora" decision',()=>{
 assert.equal(rt.fmtDur(42000),'42 s');assert.equal(rt.fmtDur(125000),'2 min 05 s');
 const flow=rt.makeFlow(rt.PIPELINE.map((role,i)=>({role,subtask:'s'+i})),1);flow.pipeline=true;
 assert.equal(rt.flowEta(flow,1),'stima disponibile dopo il primo compito');
 flow.nodes[0].status='done';flow.nodes[0].startedAt=1000;flow.nodes[0].endedAt=61000;flow.nodes[0].output='Direzione\n---DOCUMENTO: Strategia---\nTesto\n---FINE DOCUMENTO---';
 assert.equal(rt.flowEta(flow,1),'circa 4 min 00 s ancora');
 assert.equal(rt.flowElapsed({startedAt:1000,endedAt:31000}),'30 s');assert.equal(rt.flowElapsed({}),'');
 flow.nodes.forEach((n,i)=>{if(i){n.status='done';n.output=n.role==='social-media-manager'?'**Formato:** Carosello 6 slide\nMotivo: il video resta in riserva':'out '+n.role}});
 assert.equal(rt.flowEta(flow,1),'');
 const full=rt.flowFullText(flow,t=>t.replace('out','OUT'));assert.match(full,/^STRATEGIST|^[A-ZÀ-Ü ]+\n/);assert.match(full,/OUT copywriter/);assert.equal(full.split('\n\n').length>=5,true);
 const d=rt.pipelineDecision(flow);assert.equal(d.format,'Carosello 6 slide');assert.equal(d.carousel,true);assert.equal(d.video,false);assert.equal(d.art,2);assert.equal(d.copy,1);
 assert.equal(rt.pipelineDecision(rt.makeFlow([{role:'copywriter',subtask:'x'}],1)),null);
 const docs=rt.collectDocuments([{role:'assistant',agent:'legal-contracts',content:'---DOCUMENTO: NDA---\nCorpo\n---FINE DOCUMENTO---'},{role:'assistant',pending:true,content:'---DOCUMENTO: X---\nno\n---FINE DOCUMENTO---'},{role:'assistant',content:'ok',flow}]);
 assert.deepEqual(docs.map(x=>x.doc.title),['NDA','Strategia']);assert.equal(docs[1].by,flow.nodes[0].label);
});
test('Web Developer pages: recognised, unwrapped from code fences, one per file name',()=>{
 const a={title:'Home',body:'```html\n<!doctype html><html><body>v1</body></html>\n```'},b={title:'Chi Siamo.html',body:'<p>x</p>'},c={title:'Home',body:'<!doctype html><html><body>v2</body></html>'};
 assert.equal(rt.isHtmlDoc(a),true);assert.equal(rt.isHtmlDoc(b),true);assert.equal(rt.isHtmlDoc({title:'NDA',body:'Testo'}),false);
 assert.equal(rt.htmlSource(a),'<!doctype html><html><body>v1</body></html>');assert.equal(rt.htmlFilename(a),'home.html');assert.equal(rt.htmlFilename(b),'chi-siamo.html');
 assert.deepEqual(rt.sitePages([{doc:a},{doc:{title:'NDA',body:'x'}},{doc:b},{doc:c}]).map(p=>p.doc),[a,b]);
 const page=fs.readFileSync('agents.html','utf8');assert.match(page,/<iframe id="site-frame" sandbox="allow-same-origin"/);assert.doesNotMatch(page,/sandbox="[^"]*allow-scripts/);
});
test('single post images: layout field, automatic layout and on-brand colour pairs',()=>{
 const media=require('../lib/radix-agent-media');
 const [a]=media.parseSlides('---SLIDES---\n1|#0F2D24|#FAF9F6|Quanto costa non delegare?|question\n---FINE---');
 assert.equal(a.layout,'question');assert.equal(a.text,'Quanto costa non delegare?');
 assert.equal(media.parseSlides('---SLIDES---\n1|#0F2D24|#FAF9F6|Testo | con barra\n---FINE---')[0].layout,undefined);
 assert.equal(media.autoLayout('Sei pronto?'),'question');assert.equal(media.autoLayout('«Delegare è scegliere»'),'quote');
 assert.equal(media.autoLayout('Uno · due · tre'),'list');assert.equal(media.autoLayout('Il 30% del tempo'),'stat');assert.equal(media.autoLayout('Delegare è una scelta'),'statement');
 const seen=new Set(['Primo post','Secondo messaggio','Terzo claim forte','Quarta frase','Quinto'].map(t=>media.schemeFor({bg:'#0F2D24',fg:'#FAF9F6',text:t},null).bg));
 assert.ok(seen.size>=2,'posts do not all share one background');
});
test('style guide in the visual identity: one colour per role, font and signature',()=>{
 const media=require('../lib/radix-agent-media');
 const g=media.styleGuide({name:'X',visual:'Copertina e chiusura: blu notte #14283F. Pagine interne: bianco caldo #F5F3EE. Numeri e parole chiave: petrolio #147D83. Accento: oro tenue #D8AD58. Testi su fondo chiaro: grigio scuro #344054. Font: Inter Bold e Inter Regular. Firma: FRANCESCO ILARI – GCP in alto a sinistra.'});
 assert.deepEqual(g,{cover:'#14283F',page:'#F5F3EE',key:'#147D83',accent:'#D8AD58',text:'#344054',font:'Inter',signature:'FRANCESCO ILARI – GCP'});
 assert.equal(media.styleGuide({visual:'Palette #0F2D24, #6B7F72, #EDE6DE, Montserrat + Inter'}),null,'a plain palette keeps the rotating layouts');
 const h=media.styleGuide({name:'Studio Alfa — sito',visual:'Copertina #000000\nSfondo #FFFFFF'});assert.equal(h.key,'#000000');assert.equal(h.text,'#000000');assert.equal(h.signature,'STUDIO ALFA');
});
