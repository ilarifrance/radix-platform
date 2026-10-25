'use strict';
// Regia RADIX on the Sales pages that do not use the shell: the loader (sales/regia-loader.js) on every live page, the
// read-only adapter (lib/regia-sales.js) on fake page data, and no op that sends an email or a LinkedIn message or
// starts a paid enrichment. Fake DOM and fake fetch only: no AI, no network, no email.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const C=require('../lib/radix-regia-core.js'),S=require('../lib/regia-sales.js'),L=require('../sales/regia-loader.js'),CRM=require('../lib/regia-crm.js');
const guide=require('../lib/radix-guide.js');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));

// The live Sales pages and their Regia area. sales-workspace.html is a static UX preview (no data, «PREVIEW UX») and
// radix-crm-concept.html an offline concept: neither loads the Regia.
const LIVE={'sales-pipeline-premium.html':'sales-pipeline','sales-orbit-higgsfield.html':'sales-orbit','sales-orbit.html':'sales-orbit',
 'sales-vendite.html':'sales-vendite','sales-linkedin.html':'sales-linkedin','sales-growth-campaigns.html':'sales-campaigns',
 'sales-growth-projects.html':'sales-projects','lead-intelligence.html':'sales-lead'};

// ---------------- a small DOM: tags, #id, .class, [attr], [attr=value], descendant chains, selector lists ----------------
function compound(s){const m={tag:null,id:null,cls:[],attrs:[]};const re=/([a-z][a-z0-9-]*)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:=([^\]]+))?\]/gi;let x;
 while((x=re.exec(s))){if(x[1])m.tag=x[1].toUpperCase();else if(x[2])m.id=x[2];else if(x[3])m.cls.push(x[3]);else m.attrs.push([x[4],x[5]==null?null:x[5].replace(/^["']|["']$/g,'')])}return m}
function hits(e,c){if(c.tag&&e.tagName!==c.tag)return false;if(c.id&&e.attrs.id!==c.id)return false;if(c.cls.some(k=>!e.classes.includes(k)))return false;
 return c.attrs.every(([k,v])=>k in e.attrs&&(v==null||e.attrs[k]===v))}
function matches(e,sel){return sel.split(',').some(one=>{const parts=one.trim().split(/\s+/).map(compound);if(!hits(e,parts[parts.length-1]))return false;
 let i=parts.length-2,p=e.parent;while(i>=0&&p){if(hits(p,parts[i]))i--;p=p.parent}return i<0})}
class El{constructor(tag,attrs,kids){this.tagName=tag.toUpperCase();this.attrs=Object.assign({},attrs);this.classes=String(this.attrs.class||'').split(/\s+/).filter(Boolean);this.kids=[];this.parent=null;this.text='';
  for(const k of kids||[]){if(typeof k==='string')this.kids.push(k);else{k.parent=this;this.kids.push(k)}}
  if('hidden' in this.attrs)this.hidden=true}
 get textContent(){return this.kids.map(k=>typeof k==='string'?k:k.textContent).join(' ')}
 get value(){return this.attrs.value||''}
 get options(){return this.tagName==='SELECT'?this.querySelectorAll('option'):undefined}
 get selectedIndex(){return Math.max(0,(this.options||[]).findIndex(o=>'selected' in o.attrs))}
 querySelectorAll(sel){const out=[];const walk=e=>{for(const k of e.kids)if(typeof k!=='string'){if(matches(k,sel))out.push(k);walk(k)}};walk(this);return out}
 querySelector(sel){return this.querySelectorAll(sel)[0]||null}
 closest(sel){for(let e=this;e;e=e.parent)if(matches(e,sel))return e;return null}}
const h=(tag,attrs,...kids)=>new El(tag,attrs||{},kids);
function docOf(...kids){const body=h('body',{},...kids),root=h('html',{},body);
 return {body,documentElement:root,querySelector:s=>root.querySelector(s),querySelectorAll:s=>root.querySelectorAll(s),getElementById:id=>root.querySelector('#'+id)}}

// ---------------- wiring ----------------
test('every live Sales page loads the Regia through the loader, with its page id and the Sales adapter',()=>{
 for(const [f,page] of Object.entries(LIVE)){const html=read(f);
  assert.match(html,/<script src="\/sales\/regia-loader\.js" defer><\/script><\/body>/,f+': the loader, last');
  const body=html.match(/<body\b[^>]*>/)[0];
  assert.ok(body.includes('data-shell-page="'+page+'"'),f+': '+body);assert.ok(body.includes('data-shell-regia="/lib/regia-sales.js"'),f);
  assert.doesNotMatch(html,/shell\/radix-shell\.js/,f+': the shell would start a second Regia');
  assert.ok(S.adapters[page],f+': an adapter for '+page);
  assert.ok(guide.forPage(page,'/'+f,'').id===page||(f==='sales-orbit.html'&&guide.forPage(page,'/'+f,'').id==='sales-orbit'),f+': a Guide entry')}
 const crm=read('radix-sales.html');assert.match(crm,/<script src="sales\/regia-loader\.js" defer><\/script><\/body>/);assert.match(crm,/data-shell-regia="\/lib\/regia-crm\.js"/);
 assert.doesNotMatch(crm,/lib\/radix-regia\.js|lib\/radix-regia-core\.js/,'the CRM no longer loads the panel by hand');
 for(const f of ['sales-workspace.html','radix-crm-concept.html'])assert.doesNotMatch(read(f),/regia-loader|radix-regia/,f+' is a concept');
});

test('the loader loads the scripts in the shell’s order: confirm, core, the page’s adapters, Guide, panel',()=>{
 const shell=read('shell/radix-shell.js'),m=shell.match(/var regiaJs = \[([^\]]+)\]/);assert.ok(m,'the shell’s list');
 const list=m[1].split(',').map(s=>s.trim().replace(/^'|'$/g,''));
 assert.deepEqual(L.BASE,list.filter(u=>u!=='/lib/regia-cc.js'),'the shell’s list without its Command Center adapter');
 assert.match(shell,/regiaJs\.splice\(3 \+ k, 0, u\)/,'the shell splices the page adapters before the Guide');
 assert.deepEqual(L.scripts('/lib/regia-sales.js'),['/lib/radix-confirm.js','/lib/radix-regia-core.js','/lib/regia-sales.js','/lib/radix-guide.js','/lib/radix-regia.js']);
 assert.deepEqual(L.scripts('/lib/regia-crm.js /lib/regia-sales.js'),['/lib/radix-confirm.js','/lib/radix-regia-core.js','/lib/regia-crm.js','/lib/regia-sales.js','/lib/radix-guide.js','/lib/radix-regia.js']);
 assert.deepEqual(L.scripts('https://evil.test/x.js /lib/../x.js /lib/radix-regia.js'),L.BASE.slice(),'only /lib/regia-*.js, each once');
 for(const f of L.BASE.concat(['/lib/regia-sales.js','/lib/regia-crm.js'],L.CSS))assert.ok(fs.existsSync(path.join(__dirname,'..',f)),f);
});

// A fake window for the browser start: scripts «load» at once and are recorded.
function fakeWin(me,opts){const o=opts||{},added=[],links=[],attrs={};
 const el=tag=>({tagName:tag,set src(v){this._src=v;added.push(v)},get src(){return this._src}});
 const doc={body:{dataset:Object.assign({shellPage:'sales-lead',shellRegia:'/lib/regia-sales.js'},o.dataset),appendChild(s){setImmediate(()=>s.onerror&&o.fail===s.src?s.onerror():s.onload&&s.onload())}},
  head:{appendChild(l){links.push(l.href)}},documentElement:{setAttribute:(k,v)=>attrs[k]=v,removeAttribute:k=>delete attrs[k]},
  getElementById:()=>null,querySelector:()=>null,createElement:t=>t==='script'?el(t):{tagName:t}};
 const calls=[];const win={document:doc,fetch:async(u,init)=>{calls.push([u,init]);return {ok:me!=null,json:async()=>me}}};
 return {win,added,links,attrs,calls}}
const settle=async()=>{for(let i=0;i<20;i++)await tick()};

test('the loader starts the Regia only for signed-in people, once, and not where the shell is',async()=>{
 const a=fakeWin({user:{name:'Ilaria Prova'}});L.boot(a.win);await settle();
 assert.equal(a.calls[0][0],'/api/auth/me');assert.equal(a.calls[0][1].credentials,'same-origin');
 assert.deepEqual(a.added,['/lib/radix-confirm.js','/lib/radix-regia-core.js','/lib/regia-sales.js','/lib/radix-guide.js','/lib/radix-regia.js']);
 assert.deepEqual(a.links,['/shell/radix-guide.css','/shell/radix-regia.css']);assert.equal(a.attrs['data-rx-regia'],'on');
 L.boot(a.win);await settle();assert.equal(a.calls.length,1,'once per page');
 const out=fakeWin(null);L.boot(out.win);await settle();assert.deepEqual(out.added,[],'signed out: nothing');
 const shell=fakeWin({user:{email:'a@b.test'}});shell.win.__radixShell=true;L.boot(shell.win);await settle();assert.equal(shell.calls.length,0,'the shell does it');
 const off=fakeWin({user:{name:'x'}},{dataset:{shellGuide:'off'}});L.boot(off.win);await settle();assert.equal(off.calls.length,0,'data-shell-guide="off"');
 // The core cannot load: the Guide «?» alone, as the shell does.
 const bad=fakeWin({user:{name:'x'}},{fail:'/lib/radix-regia-core.js'});L.boot(bad.win);await settle();
 assert.deepEqual(bad.added,['/lib/radix-confirm.js','/lib/radix-regia-core.js','/lib/radix-guide.js','/lib/radix-regia.js'],'the adapter is skipped, as in the shell');assert.equal(bad.attrs['data-rx-regia'],undefined);
});

// ---------------- the adapter on fake pages ----------------
function leadDoc(){return docOf(h('nav',{},h('a',{},'Lead Intelligence')),h('main',{},
 h('h1',{id:'lf-title'},'Lead pipeline'),
 h('select',{id:'contact-job-list'},h('option',{value:''},'Scegli'),h('option',{value:'j1'},'LinkedIn Sales Navigator · CFO Lombardia · 42 contatti · v3'),h('option',{value:'j2'},'Fiera Milano · 7 contatti · v1')),
 h('p',{id:'contact-api-status',role:'status'},'Provider collegato: verifica email disponibile (a pagamento).'),
 h('div',{},h('b',{id:'lp-total'},'3'),h('b',{id:'lp-email'},'2'),h('b',{id:'lp-incrm'},'—')),
 h('section',{},h('h2',{},'Liste importate'),h('ul',{},h('li',{},'CFO Lombardia 42 contatti'),h('li',{hidden:''},'nascosta'))),
 h('section',{hidden:''},h('h2',{},'Backup'),h('ul',{},h('li',{},'segreto'))),
 h('input',{id:'contact-api-key',value:'sk-live-SEGRETO'})))}
const LEADS=[{name:'Paolo Neri',company:'Neri Srl',role:'',email:'',linkedin:'',origin:'lista'},
 {name:'Giulia Sala',company:'Sala Spa',role:'CFO',email:'giulia@sala.test',verified:true,linkedin:'https://www.linkedin.com/in/giulia',sourceLabel:'LinkedIn Sales Navigator'},
 {name:'Marco Riva',company:'Riva Srl',role:'COO',email:'marco@riva.test',verified:false,linkedin:''}];

test('Lead Intelligence: lists, leads ranked for «Quali lead lavoro prima?», provider status; nothing hidden, no field value',()=>{
 const s=S.readPage('sales-lead',leadDoc(),{RadixLeadPipeline:{leads:()=>LEADS}});
 assert.deepEqual(s.lists,[{title:'LinkedIn Sales Navigator · CFO Lombardia',count:42},{title:'Fiera Milano',count:7}]);
 assert.deepEqual(s.metrics,[{label:'Lead nella tabella',value:'3'},{label:'Con email',value:'2'}],'«—» is not a number');
 assert.deepEqual(s.leads.top.map(l=>l.name),['Giulia Sala','Marco Riva','Paolo Neri']);
 assert.equal(s.leads.top[0].email,'verificata');assert.equal(s.leads.verified,1);
 const ctx=S.context(s);
 assert.match(ctx,/^Lead Intelligence · «Lead pipeline» \(Sales Intelligence, sola lettura\)\./);
 assert.match(ctx,/Liste salvate nel workspace \(2\): LinkedIn Sales Navigator · CFO Lombardia \(42 contatti\); Fiera Milano \(7 contatti\)\./);
 assert.match(ctx,/Da lavorare prima[^\n]*1\) Giulia Sala, CFO · Sala Spa · email verificata · LinkedIn/);
 assert.match(ctx,/Stato di import e provider: Provider collegato/);
 assert.match(ctx,/Sezioni visibili: Liste importate \[CFO Lombardia 42 contatti\]/);
 assert.match(ctx,/non avvia arricchimenti o verifiche a pagamento/);
 assert.doesNotMatch(ctx,/SEGRETO|segreto|nascosta|Backup/,'hidden parts and field values stay out');
 assert.doesNotMatch(ctx,/giulia@sala\.test/,'the context names the email state, not the address');
 assert.deepEqual(S.view(s),{title:'Sulla pagina',items:['Liste nel workspace: 2 · lead nella tabella: 3 (con email 2)','Lead nella tabella: 3','Con email: 2','Primo da lavorare: Giulia Sala · Sala Spa']});
 assert.deepEqual(S.adapters['sales-lead'].shortcuts.map(x=>x.label),['Quali lead lavoro prima?']);
 const block=C.contextBlock(C.createRegistry().register('sales-lead',S.adapters['sales-lead']),s);assert.ok(block.length<=3600);assert.doesNotMatch(block,/\[Operazioni\]/,'read-only: no ops');
});

test('Lead Intelligence without the lead table or lists: zero, said plainly',()=>{
 const s=S.readPage('sales-lead',docOf(h('main',{},h('h1',{},'Lead pipeline'))),{});
 assert.deepEqual(s.lists,[]);assert.equal(s.leads.total,0);assert.match(S.context(s),/Liste salvate nel workspace \(0\): nessuna\.\nLead nella tabella: 0/);
 assert.deepEqual(S.rankLeads([{email:'x@y.test'},null,{name:'A'}]).map(l=>l.name),['A'],'a lead needs a name or a company');
});

test('Campaigns: the project’s campaigns and counters for «Come vanno le campagne?»',()=>{
 const card=(t,goal,seg,stage,meta)=>h('article',{class:'campaign-card'},h('div',{},h('h3',{},t),h('p',{},goal),h('small',{},'Segmento: '+seg)),h('button',{},'Modifica'),h('div',{class:'campaign-meta'},h('span',{class:'campaign-status ready'},stage),h('span',{class:'helper'},meta)));
 const doc=docOf(h('main',{},h('h1',{},'Campagne commerciali connesse ai progetti.'),
  h('select',{id:'campaign-workspace'},h('option',{value:'1',selected:''},'Agenzia di prova')),h('select',{id:'campaign-project'},h('option',{value:''},'Scegli'),h('option',{value:'p1',selected:''},'Crescita Nord')),
  h('div',{id:'campaign-list'},card('CFO ottobre','20 conversazioni','CFO · Lombardia','Pronta per revisione','email · budget massimo 300 cr'),card('COO','','da definire','Bozza','manual · budget massimo 0 cr')),
  h('div',{},h('div',{id:'campaign-total'},'2'),h('b',{id:'campaign-ready'},'1'),h('b',{id:'campaign-draft'},'1'),h('b',{id:'campaign-credit-total'},'300'))));
 const s=S.readPage('sales-campaigns',doc,{});
 assert.equal(s.workspace,'Agenzia di prova');assert.equal(s.project,'Crescita Nord');
 assert.deepEqual(s.campaigns[0],{title:'CFO ottobre',goal:'20 conversazioni',segment:'CFO · Lombardia',stage:'Pronta per revisione',channel:'email · budget massimo 300 cr'});
 const ctx=S.context(s);
 assert.match(ctx,/Workspace: Agenzia di prova\./);assert.match(ctx,/Numeri sulla pagina: Campagne del progetto 2; Pronte per revisione 1; Bozze 1; Budget massimo totale \(crediti\) 300\./);
 assert.match(ctx,/Campagne: «CFO ottobre» · Pronta per revisione · email · budget massimo 300 cr · segmento CFO · Lombardia · obiettivo: 20 conversazioni; «COO» · Bozza/);
 assert.match(ctx,/invii e risultati sono nel CRM › Campagne/);
 assert.deepEqual(S.digest(s),{'Campagne del progetto':'2','Pronte per revisione':'1','Bozze':'1','Budget massimo totale (crediti)':'300',campagne:2});
 assert.deepEqual(S.adapters['sales-campaigns'].shortcuts.map(x=>x.label),['Come vanno le campagne?']);
});

test('the other pages: title, numbers and the visible rows of each section',()=>{
 const doc=docOf(h('main',{},h('h1',{},'Pipeline'),h('p',{id:'status',role:'status'},'Dati CRM autorizzati'),
  h('section',{},h('strong',{id:'count'},'4'),h('strong',{id:'amount'},'€ 12.000'),h('strong',{id:'overdue'},'1')),
  h('section',{id:'board'},h('div',{class:'stage'},h('h2',{},'Proposta ',h('small',{},'2 opportunità aperte')),h('div',{class:'deals'},h('article',{},'Forno Aurora € 8.000'),h('article',{},'Sito Beta € 4.000'))))));
 const s=S.readPage('sales-pipeline',doc,{});
 assert.match(S.context(s),/^Pipeline \(Sales Intelligence, sola lettura\)\.\nNumeri sulla pagina: Opportunità aperte caricate 4; Valore registrato € 12\.000; Chiusure previste già passate 1\./);
 assert.match(S.context(s),/Sezioni visibili: Proposta 2 opportunità aperte \[Forno Aurora € 8\.000 \| Sito Beta € 4\.000\]/);
 assert.match(S.context(s),/Messaggi della pagina: Dati CRM autorizzati\./);
 for(const page of Object.keys(S.PAGES)){const a=S.adapters[page];assert.equal(a.shortcuts.length,1,page);assert.deepEqual(Object.keys(a.ops),[],page+' is read-only');
  assert.match(S.context(S.readPage(page,docOf(h('main',{})),{})),/sola lettura[\s\S]*non invia email né messaggi LinkedIn/,page)}
 assert.equal(S.view({page:'sales-vendite',metrics:[]}),null,'nothing to show: no box');
});

// ---------------- nothing is sent, nothing paid ----------------
test('no op that sends an email or a LinkedIn message or starts a paid enrichment is accepted, on any Sales page or the CRM',()=>{
 const reg=C.createRegistry();for(const [area,a] of Object.entries(S.adapters))reg.register(area,a);const crm=reg.register('crm',CRM.adapter);
 const bad=['send_email','sendEmail','email_send','send_linkedin_message','linkedinMessage','linkedin_connection_request','send_inmail','invite','connection_request','dm',
  'enrich_leads','enrichLeads','start_enrichment','lead_enrichment','arricchisci_lead','verify_emails','verifyEmails','captain_data_run','outreach_sequence','send_campaign','invia_messaggio','messaggio'];
 for(const area of Object.keys(S.adapters).concat('crm')){const ad=reg.get(area);
  const r=C.validateProposal({area,ops:bad.map(op=>({op,to:'giulia@sala.test',message:'Ciao'}))},ad,{});
  assert.equal(r.ok,false,area);assert.equal(r.accepted.length,0,area);
  for(const x of r.rejected)assert.equal(x.reason,C.REASON.effect,area+': '+x.op.op)}
 // Flags too: an allowed CRM op that asks to send or enrich.
 const r=C.validateProposal({area:'crm',ops:[{op:'task_add',contact:'x',title:'y',send:true},{op:'task_add',contact:'x',title:'y',enrich:true}]},crm,{});
 assert.deepEqual(r.rejected.map(x=>x.reason),[C.REASON.effect,C.REASON.effect]);
 // An adapter that declares a send, publish or paid effect can never have it accepted.
 const t=reg.register('sales-test',{ops:{note_add:{validate:()=>true,effects:['send']},boost:{validate:()=>true,effects:['paid']}},apply:async()=>({undo(){}})});
 assert.deepEqual(C.validateProposal({ops:[{op:'note_add'},{op:'boost'}]},t,{}).rejected.map(x=>x.reason),[C.REASON.effect,C.REASON.effect]);
 // The ops that remain allowed elsewhere still pass the name rule.
 for(const op of ['task_add','task_due','deal_stage','phase_move','task_assign','pin','add','move','rewrite','remove','frequency','connect'])
  assert.notEqual(C.validateProposal({ops:[{op}]},t,{}).rejected[0].reason,C.REASON.effect,op);
});

test('the sample answer of the fake AI shows the rule: its send or enrichment is rejected, «Sì, applica» stays off',()=>{
 for(const page of Object.keys(S.PAGES)){const a=C.createRegistry().register(page,S.adapters[page]);const p=S.sample({page});
  assert.equal(p.area,page);const r=C.validateProposal(p,a,{page});assert.equal(r.ok,false,page);assert.equal(r.rejected[0].reason,C.REASON.effect,page)}
 assert.equal(S.sample({page:'sales-lead'}).ops[0].op,'enrich_leads');assert.equal(S.sample({page:'sales-linkedin'}).ops[0].op,'send_linkedin_message');
});
