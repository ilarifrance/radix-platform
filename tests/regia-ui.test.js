'use strict';
// Regia RADIX panel (lib/radix-regia.js) on a tiny fake DOM: the «Regia» button, shortcuts from the adapter, free
// answers from the Guide map, the note on AI calls, the proposal card with «Sì, applica» and «No», «Annulla» after an
// apply, one image as a preview; the AI only through the injected send(), never /api/chat.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const C=require('../lib/radix-regia-core.js'),CC=require('../lib/regia-cc.js'),guide=require('../lib/radix-guide.js'),R=require('../lib/radix-regia.js');
const {makeDoc,html}=require('./regia-fake-dom.js');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));

function ccPage(opts){const doc=makeDoc(Object.assign({shellPage:'cc',topbar:true},opts)),b=doc.body;
 for(const [id,v] of [['metricProjects','4'],['metricWorkflows','2'],['metricApprovals','1']])b.append(html(doc,'div','metric-value',v,id));
 const wl=html(doc,'div',null,null,'workflowList'),w=html(doc,'div','workflow-card');w.append(html(doc,'div','workflow-name','Orchestratore PED'),html(doc,'div','workflow-state','blocked'),html(doc,'div','workflow-task','Aspetta l’identità visiva'));wl.append(w);
 b.append(html(doc,'div',null,null,'attentionList'),wl);return doc}
function setup(o){const registry=C.createRegistry();registry.register('cc',CC.adapter);const doc=ccPage(o&&o.page),calls=[];
 const win={location:{pathname:'/control-center-v2.html',hash:'',search:''},addEventListener(){},URL:{createObjectURL:f=>'blob:'+f.name},fetch(){throw Error('fetch must not be called')}};
 const send=o&&o.send||(async(messages,ctx)=>{calls.push({messages,ctx});return R.stubSend(messages,ctx)});
 const ui=R.create({doc,win,registry,guide,send});return {doc,ui,calls}}
const cls=(root,c)=>root.querySelectorAll('.'+c);

test('the «?» becomes «Regia», docked in the top bar, and opens a side panel with the page shortcuts and the AI note',()=>{
 const {doc,ui}=setup();
 assert.equal(ui.fab.textContent,'Regia');assert.equal(ui.fab.id,'rxGuide');assert.ok(ui.fab.classList.contains('rx-guide-fab--top'));
 assert.equal(doc.querySelector('header.rx-topbar').children[0],ui.fab,'before the user chip');
 assert.equal(ui.panel.hidden,true);ui.fab.click();assert.equal(ui.panel.hidden,false);assert.equal(ui.fab.getAttribute('aria-expanded'),'true');
 assert.deepEqual(cls(ui.shortcuts,'rx-regia-chip').map(c=>c.textContent),['Cosa è fermo?']);
 assert.equal(doc.querySelector('.rx-regia-note').textContent,'Ogni messaggio usa 1 chiamata AI');
 assert.ok(cls(ui.log,'free').length>=1,'FAQ chips of the Guide map');
 doc.dispatch('keydown',{key:'Escape'});assert.equal(ui.panel.hidden,true);
});

test('free FAQ answers from the Guide map: instant, no send()',async()=>{
 const {ui,calls}=setup();ui.open();
 const chip=cls(ui.log,'rx-regia-chip').find(c=>c.textContent==='Da dove comincio?');chip.click();
 assert.match(ui.log.textContent,/Marketing Agency → Nuovo progetto/);
 const r=await ui.ask('come cambio la grafica dei post?');assert.equal(r.kind,'faq');assert.match(r.answer,/Ridisegna/);
 assert.equal(calls.length,0);
});

test('a shortcut goes through send() with the page context; the card shows ops, rejected ops with reasons, the cost',async()=>{
 const {ui,calls}=setup();ui.open();
 cls(ui.shortcuts,'rx-regia-chip')[0].click();await tick();await tick();
 assert.equal(calls.length,1);const m=calls[0].messages;assert.equal(m.length,1);assert.equal(m[0].role,'user');
 assert.match(m[0].content,/^\[Area: Command Center \(cc\)\]\n\[Contesto\] Command Center: 4 progetti, 2 workflow in corso, 1 approvazioni in attesa\./);
 assert.match(m[0].content,/Fermi: Orchestratore PED · blocked/);assert.match(m[0].content,/Cosa è fermo oggi\?/);
 const card=ui.log.querySelector('.rx-regia-card');assert.ok(card);
 assert.match(card.querySelector('h4').textContent,/1 lavoro fermo: parti da «Orchestratore PED»/);
 assert.deepEqual(card.querySelector('.rx-regia-ops').children.map(li=>li.textContent),['Metti in «Da guardare oggi»: Orchestratore PED · blocked']);
 const rej=card.querySelector('.rx-regia-rejected');assert.match(rej.textContent,/Non applicabili \(1\)/);assert.match(rej.textContent,/send_reminder/);assert.match(rej.textContent,/non invia, non pubblica/);
 assert.equal(card.querySelector('.rx-regia-cost').textContent,'Costo per applicare: nessuna chiamata AI · nessun credito');
 assert.equal(card.querySelector('.rx-regia-yes').textContent,'Sì, applica');assert.equal(card.querySelector('.rx-regia-no').textContent,'No');
 assert.equal(ui.history.length,2);
});

test('«Sì, applica» applies the accepted ops, «Annulla» stays visible and gives the page back',async()=>{
 const {ui}=setup();ui.open();const r=await ui.ask('Cosa è fermo?');assert.equal(r.kind,'proposal');
 assert.equal(ui.undoBar.hidden,true);assert.equal(ui.state.pins.length,0);
 await r.yes.click();
 assert.deepEqual(ui.state.pins,[{item:'Orchestratore PED',note:'blocked'}]);
 assert.equal(r.card.dataset.state,'applied');assert.match(r.status.textContent,/^Applicato: 1 modifica\./);
 assert.equal(r.yes.disabled,true);assert.equal(r.no.disabled,true);
 assert.equal(ui.undoBar.hidden,false);assert.equal(ui.undoBar.querySelector('.rx-regia-undo-btn').textContent,'Annulla');
 const view=ui.panel.querySelector('.rx-regia-view');assert.equal(view.hidden,false);assert.match(view.textContent,/Da guardare oggi.*Orchestratore PED/);
 // a later plain message does not hide «Annulla»
 await ui.ask('ok grazie');assert.equal(ui.undoBar.hidden,false);
 assert.equal(await ui.undo(),true);
 assert.equal(ui.state.pins.length,0);assert.equal(ui.undoBar.hidden,true);assert.equal(view.hidden,true);
 assert.equal(r.card.dataset.state,'undone');assert.match(r.status.textContent,/Annullato/);
});

test('«No» discards the proposal without touching the page',async()=>{
 const {ui}=setup();ui.open();const r=await ui.ask('Cosa è fermo?');const before=ui.state;
 r.no.click();
 assert.equal(r.card.dataset.state,'declined');assert.match(r.status.textContent,/Proposta scartata: non ho cambiato niente/);
 assert.equal(r.yes.disabled,true);assert.equal(ui.state,before);assert.equal(ui.undoBar.hidden,true);
 await r.yes.click();assert.equal(ui.state.pins.length,0,'a disabled «Sì» does nothing');
});

test('a proposal with only rejected ops cannot be applied; a plain reply is a bubble; send() errors are shown',async()=>{
 const replies=['```json\n{"area":"cc","summary":"Invio","ops":[{"op":"publish_now"}]}\n```','Tutto in ordine: nessuna modifica. Apri [[cc-approvals]].'];
 const {ui}=setup({send:async()=>{const r=replies.shift();if(!r)throw Error('rete non raggiungibile');return {reply:r}}});ui.open();
 const a=await ui.ask('pubblica tutto');assert.equal(a.kind,'proposal');assert.equal(a.yes.disabled,true);assert.equal(a.result.ok,false);
 const b=await ui.ask('tutto bene?');assert.equal(b.kind,'text');assert.match(ui.log.textContent,/→ Approvazioni/);
 const c=await ui.ask('ancora?');assert.equal(c.kind,'error');assert.match(ui.log.textContent,/Non riesco a rispondere ora: rete non raggiungibile\./);
});

test('one image: preview only, not sent; non-images refused',async()=>{
 const {ui,calls}=setup();ui.open();
 assert.equal(ui.setImage({name:'doc.pdf',type:'application/pdf',size:10}),false);assert.match(ui.log.textContent,/solo un’immagine/);
 assert.equal(ui.setImage({name:'big.png',type:'image/png',size:9e6}),false);
 assert.equal(ui.setImage({name:'schermata.png',type:'image/png',size:1000}),true);
 assert.equal(ui.attach.hidden,false);assert.equal(ui.attach.querySelector('img').src,'blob:schermata.png');assert.match(ui.attach.textContent,/solo anteprima, non viene inviata/);
 assert.equal(ui.setImage({name:'altra.jpg',type:'image/jpeg',size:1000}),true);assert.equal(ui.attach.querySelectorAll('img').length,1,'only one');
 await ui.ask('Cosa è fermo?');assert.equal(calls.length,1);
 assert.doesNotMatch(JSON.stringify(calls[0].messages),/altra\.jpg|blob:/);assert.equal(ui.attach.hidden,true);
});

test('no AI by itself: the stub is the default, no /api/chat in the panel; the shell loads the Regia; light style and phone full screen',async()=>{
 const src=read('lib/radix-regia.js');assert.doesNotMatch(src.replace(/^\/\*[\s\S]*?\*\//,''),/fetch\(|\/api\//);
 const registry=C.createRegistry();registry.register('cc',CC.adapter);const doc=ccPage();
 const ui=R.create({doc,win:{location:{pathname:'/control-center-v2.html',hash:''},addEventListener(){}},registry,guide});
 const r=await ui.ask('Cosa è fermo?');assert.equal(r.kind,'proposal');assert.match(ui.log.textContent,/Risposta di prova, senza AI/);
 // a page without an adapter: FAQ and a plain stub note, no shortcuts
 const d2=makeDoc({shellPage:'agency-ped'});const u2=R.create({doc:d2,win:{location:{pathname:'/project-editorial.html',hash:''}},registry,guide});u2.open();
 assert.equal(u2.shortcuts.hidden,true);assert.equal((await u2.ask('scrivimi una poesia')).kind,'text');
 const shell=read('shell/radix-shell.js');
 assert.match(shell,/\['\/lib\/radix-regia-core\.js', '\/lib\/regia-cc\.js', '\/lib\/radix-guide\.js', '\/lib\/radix-regia\.js'\]/);
 assert.match(shell,/setAttribute\('data-rx-regia', 'on'\)/);
 assert.match(read('lib/radix-guide.js'),/if\(root\.document&&!root\.document\.documentElement\.hasAttribute\('data-rx-regia'\)\)api\.start\(\)/);
 const css=read('shell/radix-regia.css');
 assert.match(css,/--rg-panel:#fff;/);assert.match(css,/--rg-vi:#4f46e5;/);
 assert.match(css,/@media \(max-width:640px\)\{\s*\.rx-regia,\.rx-regia--top\{top:0;left:0;right:0;bottom:0;width:100vw;/);
 assert.doesNotMatch(css+src,/ped-regia/);
});
