'use strict';
// Regia RADIX core (lib/radix-regia-core.js): area registry, proposal parsing, the common rules of validation, cost,
// conversation digest, apply and undo; plus the Command Center demo adapter (lib/regia-cc.js).
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../lib/radix-regia-core.js'),CC=require('../lib/regia-cc.js');
const {makeDoc,html}=require('./regia-fake-dom.js');

// A fake area: posts with a title and a copy, one harmless op «retitle», one «note» with an internal field.
function fakeArea(extra){return Object.assign({title:'Area finta',shortcuts:[{label:'Com’è andata?',prompt:'Com’è andata la settimana?'},{nope:1}],
 context:s=>s.posts.length+' post',digest:s=>({posts:s.posts.length}),
 ops:{retitle:{validate:(op,s)=>s.posts.some(p=>p.id===op.id)?true:'Il post non esiste più.',preview:op=>'Nuovo titolo: '+op.title,cost:{ai:0}},
  draft:{validate:()=>true,cost:op=>({ai:1,paid:op.video?[{label:'Video avatar',amount:'2 crediti'}]:[]})},
  note:{validate:()=>true,copyFields:['copy']}},
 apply(state,ops){const before=state;let posts=state.posts;for(const o of ops)if(o.op==='retitle')posts=posts.map(p=>p.id===o.id?Object.assign({},p,{title:o.title}):p);return {state:Object.assign({},state,{posts}),undo:()=>before}}},extra)}
const STATE={posts:[{id:'p1',title:'Pane del lunedì'},{id:'p2',title:'Lievito madre'}]};

test('registry: register, adapterFor by area or page, invalid adapters refused',()=>{
 const r=C.createRegistry();const a=r.register('demo',fakeArea({pages:['demo','demo-2']}));
 assert.equal(a.area,'demo');assert.equal(r.adapterFor('demo'),a);assert.equal(r.adapterFor('demo-2'),a);assert.equal(r.adapterFor('altro'),null);
 assert.deepEqual(a.shortcuts.map(s=>s.label),['Com’è andata?']);assert.ok(Object.isFrozen(a));
 assert.throws(()=>r.register('Bad Name',fakeArea()),/area non valido/);
 assert.throws(()=>r.register('x',{ops:{a:{}}}),/validate/);
 assert.throws(()=>r.register('x',{ops:{a:{validate:()=>true}}}),/apply/);
 assert.deepEqual(r.areas(),['demo']);
 // the default registry is the one the browser uses; the CC adapter registers there in the page
 assert.equal(typeof C.register,'function');assert.equal(C.adapterFor('nessuna'),null);
});

test('parseProposal: JSON in code fences or in prose, braces inside strings, null for plain text',()=>{
 const p={area:'demo',summary:'Due ritocchi',ops:[{op:'retitle',id:'p1',title:'Pane {caldo}'}]};
 assert.deepEqual(C.parseProposal('Ecco:\n```json\n'+JSON.stringify(p)+'\n```\nDimmi tu.'),p);
 assert.deepEqual(C.parseProposal('Ecco: '+JSON.stringify(p)+' fine'),p);
 assert.deepEqual(C.parseProposal('```\n'+JSON.stringify(p,null,2)+'\n```'),p);
 assert.deepEqual(C.parseProposal('Prima {non json} poi '+JSON.stringify(p)),p);
 assert.equal(C.parseProposal('Nessuna modifica, solo una spiegazione.'),null);
 assert.equal(C.parseProposal('{"area":"demo","summary":"senza ops"}'),null);
 assert.equal(C.parseProposal('```json\n{rotto\n```'),null);
 assert.equal(C.proseOf('Ecco:\n```json\n'+JSON.stringify(p)+'\n```\nDimmi tu.'),'Ecco:\n\nDimmi tu.');
});

test('validateProposal: accepted and rejected ops with an Italian reason',()=>{
 const r=C.createRegistry(),a=r.register('demo',fakeArea());
 const v=C.validateProposal({area:'demo',summary:'Prova',ops:[
  {op:'retitle',id:'p1',title:'Pane caldo'},
  {op:'retitle',id:'p9',title:'Altro'},
  {op:'delete_all'},
  {nope:true},
  {op:'retitle',id:'p2',title:'Il lievito di RADIX'},
  {op:'draft',copy:'Video fatto con HeyGen'},
  {op:'draft',caption:'Programmato con buffer'},
  {op:'note',copy:'Pane',reason:'Lo propone Claude dopo i numeri di Buffer'},
  {op:'draft',title:'Radixale',copy:'Il Claudio di OpenAIX'}]},a,STATE);
 assert.equal(v.ok,true);
 assert.deepEqual(v.accepted.map(o=>o.op+':'+(o.id||o.copy||o.title)),['retitle:p1','note:Pane','draft:Il Claudio di OpenAIX']);
 const reasons=v.rejected.map(x=>x.reason);
 assert.equal(reasons[0],'Il post non esiste più.');
 assert.match(reasons[1],/Operazione sconosciuta in questa pagina: «delete_all»/);
 assert.match(reasons[2],/manca il nome «op»/);
 assert.match(reasons[3],/«title».*nomina «RADIX»/);
 assert.match(reasons[4],/«copy».*nomina «HeyGen»/);
 assert.match(reasons[5],/«caption».*nomina «buffer»/);
 for(const b of C.BRANDS)assert.ok(C.brandIn('Testo con '+b+'.'),b);
 assert.equal(C.brandIn('Il Radicchio di Claudia'),null);
});

test('validateProposal: anything that sends, publishes or starts a paid generation is rejected',()=>{
 const r=C.createRegistry(),a=r.register('demo',fakeArea({ops:Object.assign({},fakeArea().ops,{
  sendEmail:{validate:()=>true},boost:{validate:()=>true,effects:['paid']},queue:{validate:()=>true,effects:['publish']}})}));
 const ops=[{op:'sendEmail',to:'a@b.it'},{op:'send_email'},{op:'publish',id:'p1'},{op:'schedule_buffer'},{op:'generate_video'},{op:'boost'},{op:'queue'},
  {op:'retitle',id:'p1',title:'Ok',publish:true},{op:'retitle',id:'p1',title:'Ok',status:'scheduled'},{op:'invia'}];
 const v=C.validateProposal({area:'demo',ops},a,STATE);
 assert.equal(v.ok,false);assert.equal(v.accepted.length,0);assert.equal(v.rejected.length,ops.length);
 for(const x of v.rejected)assert.equal(x.reason,C.REASON.effect,JSON.stringify(x.op));
 assert.match(C.REASON.effect,/non invia, non pubblica e non avvia generazioni a pagamento/);
});

test('validateProposal: unreadable, other area, no adapter, too many ops',()=>{
 const r=C.createRegistry(),a=r.register('demo',fakeArea());
 assert.match(C.validateProposal(null,a,STATE).error,/non leggibile/);
 assert.match(C.validateProposal({area:'ped',ops:[]},a,STATE).error,/altra area/);
 assert.match(C.validateProposal({area:'demo',ops:[]},null,STATE).error,/non ha ancora una Regia/);
 const many=Array.from({length:C.MAX_OPS+3},()=>({op:'note',copy:'x'}));const v=C.validateProposal({ops:many},a,STATE);
 assert.equal(v.accepted.length,C.MAX_OPS);assert.equal(v.rejected.length,3);assert.match(v.rejected[0].reason,/Troppe modifiche/);
});

test('an area core with its own whole-proposal check wraps with thin glue (adapter.validate + adapter.preview)',()=>{
 // Shaped like lib/ped-regia-core.js: validateProposal(raw,state) -> {ops (normalised), rejected:[{op:'name',title,reason}]}
 const pedLike={validateProposal(raw){const ops=[],rejected=[];for(const o of raw.ops){if(o.date<'2026-10-26')rejected.push({op:o.op,title:o.title,reason:'Data non valida o già passata.'});else ops.push(Object.assign({},o,{channel:'Instagram'}))}return {ops,rejected}},
  opText:o=>o.date+' · '+o.channel+' · «'+o.title+'»'};
 const r=C.createRegistry(),a=r.register('ped',{ops:{add:{validate:()=>true},move:{validate:()=>true}},
  validate:(p,s)=>pedLike.validateProposal(p,s),preview:o=>pedLike.opText(o),apply:(s,ops)=>({state:Object.assign({},s,{added:ops.length}),undo:()=>s})});
 const v=C.validateProposal({area:'ped',summary:'Settimana',ops:[{op:'add',date:'2026-10-27',title:'Pane',channel:'instagram'},{op:'add',date:'2026-10-01',title:'Vecchio'},{op:'add',date:'2026-10-28',title:'Con Buffer',copy:'Programmato con Buffer'}]},a,{});
 assert.deepEqual(v.accepted.map(o=>o.channel+' '+o.title),['Instagram Pane']);
 assert.deepEqual(v.rejected.map(x=>x.op.op+' '+(x.op.title||'')),['add Con Buffer','add Vecchio']);
 assert.match(v.rejected[0].reason,/nomina «Buffer»/);assert.equal(v.rejected[1].reason,'Data non valida o già passata.');
 assert.equal(C.previewOf(v.accepted[0],a,{}),'2026-10-27 · Instagram · «Pane»');
});

test('costOf: AI calls and paid items from what each op declares',()=>{
 const r=C.createRegistry(),a=r.register('demo',fakeArea());
 assert.deepEqual(C.costOf([{op:'retitle'}],a),{ai:0,paid:[],label:'nessuna chiamata AI · nessun credito'});
 const c=C.costOf([{op:'draft'},{op:'draft',video:true},{op:'retitle'}],a);
 assert.equal(c.ai,2);assert.deepEqual(c.paid,[{label:'Video avatar',amount:'2 crediti'}]);
 assert.equal(c.label,'2 chiamate AI · Video avatar (2 crediti) da avviare dal pulsante della pagina');
 // without an adapter, the cost each op carries
 assert.equal(C.costOf([{op:'x',cost:{ai:1}},{op:'y'}]).label,'1 chiamata AI · nessun credito');
});

test('conversationDigest: newest messages kept, each capped, total under the cap, a note for the dropped ones',()=>{
 const msgs=Array.from({length:12},(_,i)=>({role:i%2?'assistant':'user',content:'m'+i+' '+'x'.repeat(900)}));
 const d=C.conversationDigest(msgs,{maxChars:3000,perMessage:1000});
 assert.ok(d.map(m=>m.content).join('').length<=3000+60);
 assert.match(d[0].content,/^\[9 messaggi precedenti omessi\]\nm9 /);assert.match(d[d.length-1].content,/^m11 /);
 const long=C.conversationDigest([{role:'user',content:'y'.repeat(5000)}],{perMessage:100});
 assert.equal(long.length,1);assert.equal(long[0].content.length,100);assert.ok(long[0].content.endsWith('…'));
 assert.deepEqual(C.conversationDigest([{role:'system',content:'a'},null,{role:'user'}]),[{role:'user',content:'a'}]);
 const r=C.createRegistry(),a=r.register('demo',fakeArea());
 assert.equal(C.contextBlock(a,STATE),'[Area: Area finta (demo)]\n[Contesto] 2 post\n[Numeri] {"posts":2}');
 assert.ok(C.contextBlock(a,{posts:Array(5000).fill({})},null,200).length<=200);
});

test('apply and undo: only accepted ops reach the adapter, undo gives back the state before',async()=>{
 const r=C.createRegistry(),a=r.register('demo',fakeArea());
 const v=C.validateProposal({ops:[{op:'retitle',id:'p1',title:'Pane caldo'},{op:'publish'}]},a,STATE);
 const res=await C.applyProposal(a,STATE,v.accepted);
 assert.equal(res.state.posts[0].title,'Pane caldo');assert.equal(STATE.posts[0].title,'Pane del lunedì');
 assert.equal(await res.undo(),STATE);
 await assert.rejects(C.applyProposal(r.register('x',{ops:{a:{validate:()=>true}},apply:()=>({state:{}})}),{},[]),/annullamento/);
});

// The Command Center page as rendered (ids of control-center-v2.html)
function ccDoc(){const doc=makeDoc({shellPage:'cc'}),b=doc.body;
 for(const [id,v] of [['metricProjects','7'],['metricWorkflows','3'],['metricApprovals','2'],['metricAgents','—']])b.append(html(doc,'div','metric-value',v,id));
 const att=html(doc,'div','attention-list',null,'attentionList'),card=html(doc,'div','workflow-card');card.append(html(doc,'div','workflow-name','⚠ Piano Forno Aurora'),html(doc,'div','workflow-task','Manca la scheda fatti'));att.append(card);
 const wl=html(doc,'div','workflow-list',null,'workflowList');
 for(const [n,s,t] of [['Orchestratore PED','blocked','Aspetta l’identità visiva'],['Copy Studio','done','Fatto'],['Avatar','waiting','Serve la voce']]){const w=html(doc,'div','workflow-card');w.append(html(doc,'div','workflow-name',n),html(doc,'div','workflow-state '+s,s),html(doc,'div','workflow-task',t));wl.append(w)}
 b.append(att,wl);return doc}

test('Command Center adapter: reads the page, says what is stuck, one harmless undoable op',async()=>{
 const r=C.createRegistry(),a=r.register('cc',CC.adapter);
 assert.equal(r.adapterFor('cc-approvals'),a);assert.deepEqual(a.shortcuts.map(s=>s.label),['Cosa è fermo?']);
 const s=a.read(ccDoc());
 assert.deepEqual(s.metrics,{projects:7,workflows:3,approvals:2,agents:null});
 assert.deepEqual(s.attention,[{title:'Piano Forno Aurora',detail:'Manca la scheda fatti'}]);
 assert.deepEqual(CC.stuckOf(s).map(w=>w.name),['Orchestratore PED','Avatar']);
 assert.match(a.context(s),/7 progetti, 3 workflow in corso, 2 approvazioni in attesa\. Da guardare: Piano Forno Aurora \(Manca la scheda fatti\)\. Fermi: Orchestratore PED · blocked/);
 assert.deepEqual(a.digest(s),{progetti:7,workflowInCorso:3,approvazioni:2,attenzione:1,fermi:2});
 const p=a.sample(s);assert.equal(p.area,'cc');assert.match(p.summary,/2 lavori fermi: parti da «Orchestratore PED»/);
 const v=C.validateProposal(p,a,s);
 assert.deepEqual(v.accepted,[{op:'pin',item:'Orchestratore PED',note:'blocked'}]);
 assert.deepEqual(v.rejected.map(x=>x.op.op+' · '+x.reason),['send_reminder · '+C.REASON.effect]);
 assert.equal(C.costOf(v.accepted,a).label,'nessuna chiamata AI · nessun credito');
 const res=await C.applyProposal(a,s,v.accepted);
 assert.deepEqual(a.view(res.state),{title:'Da guardare oggi',items:['Orchestratore PED · blocked']});
 assert.match(C.validateProposal(p,a,res.state).rejected[0].reason,/già in «Da guardare oggi»/);
 assert.deepEqual(a.read(ccDoc(),res.state).pins,res.state.pins,'a fresh read keeps the pins');
 const back=await res.undo();assert.equal(back,s);assert.equal(a.view(back),null);
 // read keeps nothing from the server: no fetch, no storage in the adapter
 const src=require('fs').readFileSync(require('path').join(__dirname,'../lib/regia-cc.js'),'utf8');
 assert.doesNotMatch(src,/fetch\(|localStorage|sessionStorage|\/api\//);
});
