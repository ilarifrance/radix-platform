'use strict';
// Regia RADIX panel (lib/radix-regia.js) on a tiny fake DOM: the «Regia» button, shortcuts from the adapter, free
// answers from the Guide map, the note on AI calls, the proposal card with «Sì, applica» and «No», «Annulla» after an
// apply, one image; the AI only through the injected send() (the fake AI) or a fake fetch, never a real call. N3: the real send to
// /api/chat (role radix-director), the confirmation of the first AI message, the image sent once, the team memory after
// an apply, the errors in Italian.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const C=require('../lib/radix-regia-core.js'),CC=require('../lib/regia-cc.js'),guide=require('../lib/radix-guide.js'),R=require('../lib/radix-regia.js');
const {makeDoc,html}=require('./regia-fake-dom.js');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));

function ccPage(opts){const doc=makeDoc(Object.assign({shellPage:'cc',topbar:true},opts)),b=doc.body;
 for(const [id,v] of [['metricProjects','4'],['metricWorkflows','2'],['metricApprovals','1']])b.append(html(doc,'div','metric-value',v,id));
 const wl=html(doc,'div',null,null,'workflowList'),w=html(doc,'div','workflow-card');w.append(html(doc,'div','workflow-name','Orchestratore PED'),html(doc,'div','workflow-state','blocked'),html(doc,'div','workflow-task','Aspetta l’identità visiva'));wl.append(w);
 b.append(html(doc,'div',null,null,'attentionList'),wl);return doc}
// A FileReader that gives a tiny PNG data URL for any file (the real bytes are not needed by the panel).
class FakeReader{readAsDataURL(f){this.result=f.dataUrl||'data:'+f.type+';base64,iVBORw0KGgoAAAANSUhEUg==';setImmediate(()=>this.onload&&this.onload())}}
function fakeStorage(){const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}}
// The fake network: every fetch is recorded; reply(url, body) decides the answer (default: memory saved).
function setup(o){o=o||{};const registry=C.createRegistry();registry.register('cc',CC.adapter);const doc=ccPage(o.page),calls=[],fetches=[],confirms=[];
 const reply=o.reply||(()=>({ok:true,status:201,json:{ok:true}}));
 const win=Object.assign({location:{pathname:'/control-center-v2.html',hash:'',search:''},addEventListener(){},URL:{createObjectURL:f=>'blob:'+f.name},FileReader:FakeReader,sessionStorage:fakeStorage(),
  fetch:async(url,opts)=>{const body=JSON.parse(opts.body);fetches.push({url,opts,body});const r=await reply(url,body);if(r instanceof Error)throw r;return {ok:r.ok,status:r.status,json:async()=>r.json}}},o.win);
 const send=o.send===null?undefined:o.send||(async(messages,ctx)=>{calls.push({messages,ctx});return R.stubSend(messages,ctx)});
 const confirm=o.confirm===null?undefined:o.confirm||(async t=>{confirms.push(t);return true});
 const ui=R.create(Object.assign({doc,win,registry,guide,send,confirm},o.opts));return {doc,ui,calls,fetches,confirms,win}}
const memoryPosts=f=>f.filter(x=>x.url==='/api/agency-memory');
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
 cls(ui.shortcuts,'rx-regia-chip')[0].click();for(let i=0;i<5;i++)await tick();
 assert.equal(calls.length,1);const m=calls[0].messages;assert.deepEqual(m,[{role:'user',content:'Cosa è fermo oggi? Dimmi cosa sbloccare per primo.'}]);
 const ctx=calls[0].ctx.contextBlock;
 assert.match(ctx,/^\[Area: Command Center \(cc\)\]\n\[Operazioni\] pin\n\[Contesto\] Command Center: 4 progetti, 2 workflow in corso, 1 approvazioni in attesa\./);
 assert.match(ctx,/Fermi: Orchestratore PED · bloccato/);
 assert.deepEqual(calls[0].ctx.memoryScope,{level:'agency',agentId:'radix-director'},'no project on this page: the agency-wide memory');
 const card=ui.log.querySelector('.rx-regia-card');assert.ok(card);
 assert.match(card.querySelector('h4').textContent,/1 lavoro fermo: parti da «Orchestratore PED»/);
 assert.deepEqual(card.querySelector('.rx-regia-ops').children.map(li=>li.textContent),['Metti in «Da guardare oggi»: Orchestratore PED · bloccato']);
 const rej=card.querySelector('.rx-regia-rejected');assert.match(rej.textContent,/Non applicabili \(1\)/);assert.match(rej.textContent,/non invia, non pubblica/);
 assert.equal(rej.querySelector('li').children[0].textContent,'Operazione «send_reminder»: Sblocca il workflow','a readable line, not «to: team · message: …»');
 assert.equal(card.querySelector('.rx-regia-cost').textContent,'Costo per applicare: nessuna chiamata AI · nessun credito');
 assert.equal(card.querySelector('.rx-regia-yes').textContent,'Sì, applica');assert.equal(card.querySelector('.rx-regia-no').textContent,'No');
 assert.equal(ui.history.length,2);
});

test('«Sì, applica» applies the accepted ops, «Annulla» stays visible and gives the page back',async()=>{
 const {ui,fetches}=setup({win:{location:{pathname:'/control-center-v2.html',hash:'',search:'?project=forno-aurora'}}});ui.open();const r=await ui.ask('Cosa è fermo?');assert.equal(r.kind,'proposal');
 assert.equal(ui.undoBar.hidden,true);assert.equal(ui.state.pins.length,0);assert.equal(memoryPosts(fetches).length,0,'nothing in memory before «Sì»');
 await r.yes.click();
 assert.deepEqual(ui.state.pins,[{item:'Orchestratore PED',note:'bloccato'}]);
 // the decision goes to the team memory as a proposal, with the endpoint and shape of the other callers
 assert.equal(await ui.memoryWrites[0],true);const mem=memoryPosts(fetches);assert.equal(mem.length,1);
 assert.equal(mem[0].opts.method,'POST');assert.equal(mem[0].opts.credentials,'same-origin');
 assert.deepEqual(mem[0].body,{level:'project',kind:'decision',status:'proposed',projectId:'forno-aurora',clientId:'',agentId:'radix-director',
  title:'Regia: 1 lavoro fermo: parti da «Orchestratore PED».',content:'Applicate con «Sì, applica» nella Regia · area «Command Center» (1 modifica):\n- Metti in «Da guardare oggi»: Orchestratore PED · bloccato',source:'Regia · Command Center'});
 assert.match(r.status.textContent,/Decisione proposta in Memoria/);
 assert.equal(r.card.dataset.state,'applied');assert.match(r.status.textContent,/^Applicato: 1 modifica\./);
 assert.equal(r.yes.disabled,true);assert.equal(r.no.disabled,true);
 assert.equal(ui.undoBar.hidden,false);assert.equal(ui.undoBar.querySelector('.rx-regia-undo-btn').textContent,'Annulla');
 const view=ui.panel.querySelector('.rx-regia-view');assert.equal(view.hidden,false);assert.match(view.textContent,/Da guardare oggi.*Orchestratore PED/);
 // a later plain message does not hide «Annulla»
 await ui.ask('ok grazie');assert.equal(ui.undoBar.hidden,false);
 assert.equal(await ui.undo(),true);
 assert.equal(ui.state.pins.length,0);assert.equal(ui.undoBar.hidden,true);assert.equal(view.hidden,true);
 assert.equal(r.card.dataset.state,'undone');assert.match(r.status.textContent,/Annullato/);
 assert.equal(memoryPosts(fetches).length,1,'«Annulla» does not delete the proposed decision');assert.ok(fetches.every(f=>f.opts.method==='POST'));
});

test('a failed memory write blocks nothing: the apply holds, «Annulla» works, no memory note',async()=>{
 for(const reply of [()=>({ok:false,status:500,json:{error:'db'}}),()=>new Error('offline')]){
  const {ui,fetches}=setup({reply});ui.open();const r=await ui.ask('Cosa è fermo?');await r.yes.click();
  assert.equal(r.card.dataset.state,'applied');assert.equal(ui.undoBar.hidden,false);assert.equal(await ui.memoryWrites[0],false);
  assert.equal(memoryPosts(fetches).length,1);assert.equal(memoryPosts(fetches)[0].body.level,'agency','no project: an agency-wide proposal');
  assert.doesNotMatch(r.status.textContent,/Memoria/);assert.equal(await ui.undo(),true);assert.equal(ui.state.pins.length,0)}
 // an injected remember() that throws is swallowed too
 const {ui}=setup({opts:{remember:()=>{throw Error('x')}}});ui.open();const r=await ui.ask('Cosa è fermo?');await r.yes.click();
 assert.equal(r.card.dataset.state,'applied');assert.equal(await ui.memoryWrites[0],false);
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

test('one image: png/jpeg/webp up to 20 MB picked, sent once with the next message as a data URL, then gone',async()=>{
 const {ui,calls}=setup();ui.open();
 assert.equal(ui.setImage({name:'doc.pdf',type:'application/pdf',size:10}),false);assert.match(ui.log.textContent,/solo un’immagine PNG, JPG o WebP/);
 assert.equal(ui.setImage({name:'anim.gif',type:'image/gif',size:10}),false);assert.equal(ui.setImage({name:'v.svg',type:'image/svg+xml',size:10}),false);
 assert.equal(ui.setImage({name:'big.png',type:'image/png',size:R.PICK_IMAGE+1}),false);assert.match(ui.log.textContent,/al massimo 20 MB/);
 assert.equal(ui.setImage({name:'schermata.png',type:'image/png',size:1000}),true);
 assert.equal(ui.attach.hidden,false);assert.equal(ui.attach.querySelector('img').src,'blob:schermata.png');assert.match(ui.attach.textContent,/va con il prossimo messaggio, non viene salvata/);
 assert.equal(ui.setImage({name:'altra.webp',type:'image/webp',size:1000}),true);assert.equal(ui.attach.querySelectorAll('img').length,1,'only one');
 await ui.ask('Cosa è fermo?');assert.equal(calls.length,1);
 assert.deepEqual(calls[0].ctx.image,{name:'altra.webp',type:'image/webp',size:1000,dataUrl:'data:image/webp;base64,iVBORw0KGgoAAAANSUhEUg=='});
 assert.doesNotMatch(JSON.stringify(calls[0].messages),/altra|base64|blob:/,'the image is not in the conversation');assert.equal(ui.attach.hidden,true);
 await ui.ask('E adesso?');assert.equal(calls[1].ctx.image,null,'sent once');
 // a file the reader turns into something else is refused before any call
 const t=setup();t.ui.open();t.ui.setImage({name:'x.png',type:'image/png',size:10,dataUrl:'data:text/html;base64,PGI+'});
 const e=await t.ui.ask('Guarda');assert.equal(e.kind,'error');assert.equal(t.calls.length,0);assert.match(t.ui.log.textContent,/non riesco a leggere l’immagine/);
});

test('the first AI message of the browser session asks for confirmation, later ones only show the note',async()=>{
 const {ui,calls,confirms,win,doc}=setup();ui.open();
 assert.equal(confirms.length,0,'opening the panel asks nothing and calls nothing');assert.equal(calls.length,0);
 await ui.ask('Cosa è fermo?');assert.equal(confirms.length,1);assert.equal(confirms[0].title,'La Regia usa 1 chiamata AI per ogni messaggio. Continuare?');
 assert.equal(confirms[0].title,R.CONFIRM_TEXT);assert.equal(calls.length,1);
 await ui.ask('E poi?');cls(ui.shortcuts,'rx-regia-chip')[0].click();for(let i=0;i<5;i++)await tick();
 assert.equal(confirms.length,1,'once per session');assert.equal(calls.length,3);assert.equal(doc.querySelector('.rx-regia-note').textContent,'Ogni messaggio usa 1 chiamata AI');
 assert.equal(win.sessionStorage.getItem(R.CONFIRM_KEY),'1');
 // a new panel in the same browser session (another page) does not ask again
 const again=setup({win:{sessionStorage:win.sessionStorage}});again.ui.open();await again.ui.ask('Cosa è fermo?');assert.equal(again.confirms.length,0);assert.equal(again.calls.length,1);
 // free FAQ answers never ask
 const faq=setup();faq.ui.open();await faq.ui.ask('come cambio la grafica dei post?');assert.equal(faq.confirms.length,0);
 // declined: no call, the text goes back in the field, the next message asks again
 let answer=false;const seen=[];const no=setup({confirm:async t=>{seen.push(t);return answer}});no.ui.open();
 no.ui.input.value='Cosa è fermo?';await no.ui.form.onsubmit();
 assert.equal(no.calls.length,0);assert.match(no.ui.log.textContent,/Messaggio non inviato: nessuna chiamata AI/);assert.equal(no.ui.input.value,'Cosa è fermo?');
 assert.equal(no.ui.history.length,0);answer=true;await no.ui.ask('Cosa è fermo?');assert.equal(seen.length,2);assert.equal(no.calls.length,1);
});

test('the confirmation goes through RadixConfirm when the page has it, else the browser confirm()',async()=>{
 const asked=[];const rc=require('../lib/radix-confirm.js');const had=globalThis.RadixConfirm,hadConfirm=globalThis.confirm;
 globalThis.RadixConfirm=rc;globalThis.confirm=t=>{asked.push(t);return true};
 try{const {ui,calls}=setup({confirm:null});ui.open();await ui.ask('Cosa è fermo?');
  assert.equal(calls.length,1);assert.equal(asked.length,1);assert.match(asked[0],/^La Regia usa 1 chiamata AI per ogni messaggio\. Continuare\?\n1 chiamata AI per ogni messaggio/)}
 finally{if(had===undefined)delete globalThis.RadixConfirm;else globalThis.RadixConfirm=had;if(hadConfirm===undefined)delete globalThis.confirm;else globalThis.confirm=hadConfirm}
 const said=[];const {ui,calls}=setup({confirm:null,win:{confirm:t=>{said.push(t);return false}}});ui.open();
 assert.equal((await ui.ask('Cosa è fermo?')).kind,'cancelled');assert.deepEqual(said,[R.CONFIRM_TEXT]);assert.equal(calls.length,0);
});

test('Enter sends, Shift+Enter does not; a message starts only from the person',async()=>{
 const {ui,calls}=setup();ui.open();ui.input.value='Cosa è fermo?';
 ui.input.dispatch('keydown',{key:'Enter',shiftKey:true});for(let i=0;i<3;i++)await tick();assert.equal(calls.length,0);
 ui.input.dispatch('keydown',{key:'Enter'});for(let i=0;i<5;i++)await tick();assert.equal(calls.length,1);
});

test('the fake AI stays injectable; the shell loads the Regia and its confirm; light style and phone full screen',async()=>{
 const src=read('lib/radix-regia.js');assert.doesNotMatch(src,/localStorage/);
 const registry=C.createRegistry();registry.register('cc',CC.adapter);const doc=ccPage();
 const ui=R.create({doc,win:{location:{pathname:'/control-center-v2.html',hash:''},addEventListener(){}},registry,guide,send:R.stubSend,confirm:()=>true});
 const r=await ui.ask('Cosa è fermo?');assert.equal(r.kind,'proposal');assert.match(ui.log.textContent,/Risposta di prova, senza AI/);
 // a page without an adapter: FAQ and a plain stub note, no shortcuts
 const d2=makeDoc({shellPage:'agency-ped'});const u2=R.create({doc:d2,win:{location:{pathname:'/project-editorial.html',hash:''}},registry,guide,send:R.stubSend,confirm:()=>true});u2.open();
 assert.equal(u2.shortcuts.hidden,true);assert.equal((await u2.ask('scrivimi una poesia')).kind,'text');
 const shell=read('shell/radix-shell.js');
 assert.match(shell,/\['\/lib\/radix-confirm\.js', '\/lib\/radix-regia-core\.js', '\/lib\/regia-cc\.js', '\/lib\/radix-guide\.js', '\/lib\/radix-regia\.js'\]/);
 assert.match(shell,/if \(regiaJs\[i\] === '\/lib\/radix-confirm\.js'\) \{ next\(i \+ 1\); return; \}/,'without the dialog the Regia still loads');
 assert.match(shell,/setAttribute\('data-rx-regia', 'on'\)/);
 assert.match(read('lib/radix-guide.js'),/if\(root\.document&&!root\.document\.documentElement\.hasAttribute\('data-rx-regia'\)\)api\.start\(\)/);
 const css=read('shell/radix-regia.css');
 assert.match(css,/--rg-panel:#fff;/);assert.match(css,/--rg-vi:#4f46e5;/);
 assert.match(css,/@media \(max-width:640px\)\{\s*\.rx-regia,\.rx-regia--top\{top:0;left:0;right:0;bottom:0;width:100vw;/);
 assert.doesNotMatch(css+src,/ped-regia/);
});

test('a picture over 2,5 MB is redrawn as a smaller JPEG before it leaves; without a canvas it is refused before any call',async()=>{
 const t=setup();t.ui.open();assert.equal(t.ui.setImage({name:'foto.png',type:'image/png',size:R.SEND_IMAGE+1}),true);
 const e=await t.ui.ask('Guarda');assert.equal(e.kind,'error');assert.equal(t.calls.length,0);assert.match(t.ui.log.textContent,/troppo grande da inviare/);
 const drawn=[];const canvas={width:0,height:0,getContext:()=>({drawImage:(b,x,y,w,h)=>drawn.push([w,h])}),toDataURL:(type,q)=>'data:'+type+';base64,/9j/4AAQ'};
 const s=setup({win:{createImageBitmap:async()=>({width:4000,height:3000,close(){}}),document:{createElement:()=>canvas}}});s.ui.open();
 s.ui.setImage({name:'foto.png',type:'image/png',size:R.SEND_IMAGE+1});await s.ui.ask('Guarda');
 assert.deepEqual(drawn,[[1600,1200]]);assert.equal(s.calls.length,1);assert.equal(s.calls[0].ctx.image.dataUrl,'data:image/jpeg;base64,/9j/4AAQ');
});
