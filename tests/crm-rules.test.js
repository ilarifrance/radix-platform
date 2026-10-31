'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const R=require('../sales/crm-rules-core.js'),A=require('../sales/crm-automations-core.js');
const {command,createHandler}=require('../api/_sales.js');
const {createStore}=require('../api/_sales_store.js');
const now=Date.parse('2026-10-16T10:00:00Z');
const ids=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const W=ids(900);
const task=(over={})=>({id:'r1abc',name:'Chiama in proposta',on:true,when:{type:'stage',stage:ids(50)},do:{type:'task',kind:'call',title:'Chiama per la proposta',days:2,to:'owner'},...over});
const old='2026-09-01T10:00:00Z';

test('validation: closed list of triggers and actions, bounded parameters, unknown keys refused',()=>{
 assert.equal(R.ruleError(task()),null);
 assert.equal(R.ruleError({id:'stale-deal',on:false}),null);
 assert.match(R.ruleError({id:'stale-deal',on:false,name:'x'}),/predefinita/);
 assert.match(R.ruleError(task({when:{type:'deal-won'}})),/evento/);
 assert.match(R.ruleError(task({when:{type:'stage',stage:'fase-1'}})),/fase/);
 assert.match(R.ruleError(task({when:{type:'deal-stale',days:0}})),/Giorni/);
 assert.match(R.ruleError(task({when:{type:'contact-idle',days:400}})),/Giorni/);
 assert.match(R.ruleError(task({when:{type:'ticket-high',hours:1.5}})),/Ore/);
 assert.equal(R.ruleError(task({when:{type:'lead-source',source:''}})),null);
 assert.equal(R.ruleError(task({when:{type:'quote-accepted'}})),null);
 assert.match(R.ruleError(task({when:{type:'quote-accepted',days:3}})),/non valido/);
 assert.match(R.ruleError(task({do:{type:'webhook'}})),/azione/);
 assert.match(R.ruleError(task({do:{type:'task',kind:'fax',title:'x',days:1,to:'owner'}})),/Tipo/);
 assert.match(R.ruleError(task({do:{type:'task',kind:'call',title:'',days:1,to:'owner'}})),/Titolo/);
 assert.match(R.ruleError(task({do:{type:'task',kind:'call',title:'x',days:1,to:'me'}})),/Assegnatario/);
 assert.equal(R.ruleError(task({do:{type:'task',kind:'todo',title:'x',days:0,to:12,priority:'high'}})),null);
 assert.match(R.ruleError(task({do:{type:'task',kind:'todo',title:'x',days:0,to:12,send:true}})),/Tipo/);
 assert.equal(R.ruleError(task({do:{type:'email',subject:'Grazie {nome}',body:'Ciao {nome},\ngrazie.'}})),null);
 assert.match(R.ruleError(task({do:{type:'email',subject:'x',body:'y'.repeat(601)}})),/600/);
 assert.match(R.ruleError(task({name:''})),/Nome/);
 assert.match(R.ruleError(task({id:'__proto__'})),/Identificativo/);
 assert.match(R.ruleError(task({extra:1})),/non valida/);
});

test('validation of the stored list: unique ids and names, no clash with the defaults, fits the jsonb CHECK',()=>{
 assert.deepEqual(R.validateSet([]),{ok:true,error:null});
 assert.equal(R.validateSet([task(),{id:'close-overdue',on:false}]).ok,true);
 assert.match(R.validateSet([task(),task()]).error,/ripetuta/);
 assert.match(R.validateSet([task(),task({id:'r2abc',name:' chiama IN proposta '})]).error,/Esiste già/);
 assert.match(R.validateSet([task({name:'Trattativa ferma'})]).error,/Esiste già/);
 assert.match(R.validateSet({}).error,/Elenco/);
 const big=Array.from({length:6},(_,i)=>task({id:'rbig'+i,name:'Email '+i,do:{type:'email',subject:'Oggetto '+i,body:'x'.repeat(400)}}));
 assert.match(R.validateSet(big).error,/Spazio/);
 const many=Array.from({length:17},(_,i)=>task({id:'rmany'+i,name:'R'+i,do:{type:'task',kind:'call',title:'c',days:1,to:'owner'}}));
 assert.match(R.validateSet(many).error,/Troppe/);
 // The size rule counts PostgreSQL's jsonb text (", " and ": "), not JSON.stringify.
 assert.equal(R.jsonbText({rules:[{id:'a',on:true}]}),'{"rules": [{"id": "a", "on": true}]}');
});

test('server: the «__regole__» row holds only validated rules, and only that row may hold them',()=>{
 const cmd=(action,data)=>command({workspace:W,entity:'segments',action,data});
 const ok=cmd('create',{name:'__regole__',filters:{rules:[task()]}});assert.deepEqual(ok.data.filters,{rules:[task()]});
 assert.throws(()=>cmd('create',{name:'__regole__',filters:{city:'Milano'}}),/riservato/);
 assert.throws(()=>cmd('create',{name:'Clienti Milano',filters:{rules:[]}}),/riservato/);
 assert.throws(()=>cmd('create',{name:'__regole__',filters:{rules:[task({when:{type:'webhook'}})]}}),/Regole non valide: Scegli un evento/);
 assert.throws(()=>cmd('create',{name:'__regole__',filters:{rules:[],city:'Milano'}}),/Regole non valide/);
 assert.throws(()=>cmd('update',{id:ids(1),version:1,name:'Altro nome',filters:{rules:[]}}),/riservato/);
 assert.equal(cmd('update',{id:ids(1),version:1,filters:{rules:[{id:'stale-deal',on:false}]}}).data.filters.rules[0].on,false);
 assert.equal(cmd('create',{name:'Decisori Milano',filters:{city:'Milano'}}).data.name,'Decisori Milano');
});

function harness(role,existing){
 const seen=[];const store={membership:async()=>({role}),sql:async(q,p)=>{seen.push([q,p]);return existing?[{name:existing}]:[]},read:async c=>{seen.push(c);return []},command:async c=>{seen.push(c);return c.data}};
 const handle=createHandler({getSessionUser:()=>({uid:7}),getStore:()=>store});
 const call=async(method,query,body)=>{const res={setHeader(){},status(s){this.code=s;return this},json(v){this.body=v;return this}};
  await handle({method,query,body,headers:{'content-type':'application/json','x-radix-sales':'1'}},res);return res};
 return {seen,call};
}
test('server: owners and admins write the rules row; members keep their segments; GET subject=rules reads only that row',async()=>{
 const body=(action,data)=>({workspace:W,entity:'segments',action,data});
 let h=harness('member');
 assert.equal((await h.call('POST',{},body('create',{name:'__regole__',filters:{rules:[]}}))).code,403);
 assert.equal((await h.call('POST',{},body('create',{name:'Milano',filters:{city:'Milano'}}))).code,200);
 h=harness('member','__regole__');
 const r=await h.call('POST',{},body('delete',{id:ids(3),version:1}));assert.equal(r.code,403);assert.match(r.body.error,/owner e admin/);
 h=harness('admin','__regole__');
 assert.equal((await h.call('POST',{},body('update',{id:ids(3),version:1,filters:{rules:[{id:'hot-contact',on:false}]}}))).code,200);
 assert.equal((await h.call('POST',{},body('update',{id:ids(3),version:1,filters:{city:'Roma'}}))).code,400);
 h=harness('admin','Milano');
 assert.equal((await h.call('POST',{},body('update',{id:ids(3),version:1,filters:{rules:[]}}))).code,400);
 h=harness('viewer');
 assert.equal((await h.call('GET',{entity:'segments',workspace:W,subject:'rules'})).code,200);assert.equal(h.seen.at(-1).reserved,'__regole__');
 assert.equal((await h.call('GET',{entity:'segments',workspace:W})).code,200);assert.equal(h.seen.at(-1).reserved,undefined);
 assert.equal((await h.call('GET',{entity:'segments',workspace:W,subject:'reports'})).code,400);
});

test('store: the contact segments read skips the rules row, the rules read returns only it',async()=>{
 const qs=[];const store=createStore(async q=>{qs.push(q);return []});
 await store.read({workspace:W,entity:'segments',offset:0},7);await store.read({workspace:W,entity:'segments',offset:0,reserved:'__regole__'},7);
 assert.match(qs[0],/lower\(btrim\(t\.name\)\)<>ALL\(\$4::text\[\]\)/);assert.match(qs[1],/lower\(btrim\(t\.name\)\)=\$4/);
 // The newsletter and the Segmenti panel read the same entity without subject: they never see the row.
 assert.doesNotMatch(fs.readFileSync(__dirname+'/../sales/lead-newsletter.js','utf8'),/subject:'rules'/);
});

const base=()=>({
 stages:[{id:ids(50),title:'Proposta'},{id:ids(51),title:'Trattativa'}],
 companies:[{id:ids(60),name:'Acme Srl'}],
 contacts:[{id:ids(20),name:'Anna Bianchi',email:'anna@acme.test',company_id:ids(60),created_at:old},{id:ids(21),name:'Bruno',created_at:old},{id:ids(22),name:'Carla',created_at:'2026-10-14T10:00:00Z'},{id:ids(23),name:'Dario',created_at:old,owner_id:5}],
 opportunities:[{id:ids(1),title:'Acme rinnovo',stage_id:ids(50),owner_id:3,contact_id:ids(20),company_id:ids(60),created_at:old},{id:ids(2),title:'Beta',stage_id:ids(51),created_at:old},{id:ids(3),title:'Vinta',stage_id:ids(50),outcome:'won',created_at:old}],
 interactions:[{contact_id:ids(21),occurred_at:'2026-10-12T10:00:00Z'},{opportunity_id:ids(2),occurred_at:'2026-10-10T10:00:00Z'}],
 tasks:[],
 leads:[{id:ids(30),title:'Lead fiera',source:'Fiera',status:'nuovo',owner_id:4},{id:ids(31),title:'Lead sito',source:'Sito web',status:'nuovo'},{id:ids(32),title:'Lead vecchio',source:'fiera',status:'contattato'}],
 tickets:[{id:ids(40),title:'Server giù',status:'open',priority:'urgent',created_at:'2026-10-15T10:00:00Z',assignee_id:6},{id:ids(41),title:'Domanda',status:'open',priority:'normal',created_at:old},{id:ids(42),title:'Appena aperto',status:'open',priority:'high',created_at:'2026-10-16T09:00:00Z'}],
 quotes:[{id:ids(70),kind:'quote',number:'P-2026-0007',title:'Rinnovo',status:'accettato',updated_at:'2026-10-14T10:00:00Z',opportunity_id:ids(1),contact_id:ids(20),company_id:ids(60)},{id:ids(71),kind:'quote',status:'inviato',updated_at:'2026-10-14T10:00:00Z'},{id:ids(72),kind:'quote',status:'accettato',updated_at:'2026-07-01T10:00:00Z'}]
});
const recs=(rule,data,o={})=>R.planCustom(rule,data,{now,...o}).items.map(x=>x.record.id);

test('trigger «entra in fase»: open deals in that stage, task linked and assigned to the owner, once',()=>{
 const d=base(),p=R.planCustom(task(),d,{now,assignee:9});
 assert.deepEqual(p.items.map(x=>x.record.id),[ids(1)]);
 const t=p.items[0].task;
 assert.equal(t.title,'[Auto · Chiama in proposta] Chiama: Chiama per la proposta · Acme rinnovo');
 assert.deepEqual([t.opportunity_id,t.contact_id,t.company_id,t.assignee_id,t.due_at,t.priority,t.status],[ids(1),ids(20),ids(60),3,'2026-10-18T09:00:00Z','normal','todo']);
 d.tasks.push({...t,status:'done'});assert.deepEqual(recs(task(),d),[],'an event is proposed once, even after the task is done');
});

test('trigger «ferma da N giorni»: same reading as «Trattativa ferma» with the rule’s days',()=>{
 const d=base(),rule=task({when:{type:'deal-stale',days:7}});
 assert.deepEqual(recs(rule,d),[ids(1)]);
 assert.deepEqual(recs(task({when:{type:'deal-stale',days:5}}),d),[ids(1),ids(2)],'Beta was touched 6 days ago');
 d.tasks.push({opportunity_id:ids(1),title:'Chiama',status:'todo'});assert.deepEqual(recs(rule,d),[]);
 // Same answer as the fixed rule at 14 days.
 const fixed=A.plan('stale-deal',base(),{now}).items.map(x=>x.record.id);
 assert.deepEqual(recs(task({when:{type:'deal-stale',days:14}}),base()),fixed);
});

test('trigger «nuovo lead da fonte»: status nuovo, source compared without case; empty source = any; «#id» names the lead',()=>{
 const d=base();
 assert.deepEqual(recs(task({when:{type:'lead-source',source:'FIERA '}}),d),[ids(30)]);
 assert.deepEqual(recs(task({when:{type:'lead-source',source:''}}),d),[ids(30),ids(31)]);
 const it=R.planCustom(task({when:{type:'lead-source',source:'fiera'}}),d,{now}).items[0];
 assert.match(it.task.title,/#00000000-0000-4000-8000-000000000030$/);assert.equal(it.task.assignee_id,4);
 d.tasks.push({...it.task,status:'done'});assert.deepEqual(recs(task({when:{type:'lead-source',source:'fiera'}}),d),[]);
});

test('trigger «contatto senza attività da N giorni»: no interaction for N days, older than N days, no open task',()=>{
 const d=base(),rule=task({when:{type:'contact-idle',days:7},do:{type:'task',kind:'email',title:'Ricontatta',days:0,to:12}});
 assert.deepEqual(recs(rule,d),[ids(20),ids(23)]);
 const it=R.planCustom(rule,d,{now}).items[1];assert.equal(it.task.contact_id,ids(23));assert.equal(it.task.assignee_id,12,'a named member wins over the owner');assert.equal(it.task.due_at,'2026-10-16T09:00:00Z');
 d.tasks.push({contact_id:ids(20),title:'Altro',status:'todo'});assert.deepEqual(recs(rule,d),[ids(23)]);
});

test('trigger «ticket priorità alta aperto da N ore»: high or urgent, open for at least N hours',()=>{
 const d=base();
 assert.deepEqual(recs(task({when:{type:'ticket-high',hours:4}}),d),[ids(40)]);
 assert.deepEqual(recs(task({when:{type:'ticket-high',hours:1}}),d),[ids(40),ids(42)]);
 const it=R.planCustom(task({when:{type:'ticket-high',hours:4}}),d,{now}).items[0];assert.equal(it.task.assignee_id,6);
 d.tasks.push({...it.task,status:'todo'});assert.deepEqual(recs(task({when:{type:'ticket-high',hours:4}}),d),[]);
});

test('trigger «preventivo accettato»: accepted in the last 30 days, linked to its deal, owner from the deal',()=>{
 const d=base(),it=R.planCustom(task({when:{type:'quote-accepted'}}),d,{now}).items;
 assert.deepEqual(it.map(x=>x.record.id),[ids(70)]);assert.equal(it[0].task.opportunity_id,ids(1));assert.equal(it[0].task.assignee_id,3);
 assert.match(it[0].task.title,/· P-2026-0007 · Rinnovo #00000000-0000-4000-8000-000000000070$/);
 assert.deepEqual(recs(task({when:{type:'quote-accepted'}}),{...d,quotes:undefined}),[]);
});

test('action «email da modello»: a draft with the placeholders filled, never a send; recorded drafts are not proposed again',()=>{
 const d=base(),rule=task({id:'rmail1',name:'Grazie',when:{type:'quote-accepted'},do:{type:'email',subject:'Grazie {nome}',body:'Ciao {nome}, grazie da {azienda} per «{trattativa}».'}});
 const [it]=R.planCustom(rule,d,{now}).items;
 assert.equal(it.task,undefined);assert.equal(it.email.subject,'Grazie Anna');assert.equal(it.email.body,'Ciao Anna, grazie da Acme Srl per «Acme rinnovo».');assert.equal(it.email.contact.email,'anna@acme.test');
 assert.equal(it.email.log.kind,'email');assert.match(it.email.log.title,/^\[Auto · Grazie\] Email: Grazie Anna #/);
 const lead=R.planCustom({...rule,when:{type:'lead-source',source:'Sito web'}},d,{now}).items[0];assert.match(lead.email.body,/\[DA COMPLETARE: nome\]/);
 d.interactions.push({...it.email.log,occurred_at:'2026-10-16T09:00:00Z'});assert.equal(R.planCustom(rule,d,{now}).items.length,0);
 assert.doesNotMatch(fs.readFileSync(__dirname+'/../sales/crm-rules.js','utf8'),/send-email/);
});

test('defaults: with no saved rules the result is exactly the fixed rules of crm-automations-core.js',()=>{
 const data={...base(),tasks:[{opportunity_id:ids(2),title:'x',status:'todo'}]};
 data.opportunities.push({id:ids(4),title:'Scaduta',expected_close:'2026-10-01',owner_id:3},{id:ids(5),title:'Vinta ora',outcome:'won',closed_at:'2026-10-10T10:00:00Z'});
 data.tickets.push({id:ids(43),title:'Senza nessuno',status:'pending'});
 data.contacts.push({id:ids(24),name:'Nuovo',created_at:'2026-10-15T10:00:00Z'});
 const score=c=>({band:c.name==='Dario'?'caldo':'freddo'}),opts={now,assignee:9,score};
 for(const stored of [undefined,null,[],[{id:'stale-deal',on:true}]]){
  const runs=R.evaluate(stored,data,opts);
  assert.deepEqual(runs.map(r=>r.rule.id),A.RULES.map(r=>r.id));
  for(const r of runs){assert.equal(r.off,false);assert.deepEqual(r.items.map(x=>x.task),A.plan(r.rule.id,data,opts).items.map(x=>x.task),r.rule.id);assert.deepEqual(r.skipped,[])}
 }
 assert.ok(R.evaluate([],data,opts).reduce((n,r)=>n+r.items.length,0)>=6,'the fixture exercises every default rule');
});

test('disabled rules propose nothing, defaults and custom alike; toggling keeps the stored list minimal',()=>{
 const data=base();
 let list=R.setOn([],'stale-deal',false);assert.deepEqual(list,[{id:'stale-deal',on:false}]);
 list=R.upsert(list,task({on:false}));
 const runs=R.evaluate(list,data,{now});
 const by=id=>runs.find(r=>r.rule.id===id);
 assert.equal(by('stale-deal').off,true);assert.deepEqual(by('stale-deal').items,[]);
 assert.equal(by('r1abc').off,true);assert.deepEqual(by('r1abc').items,[]);
 list=R.setOn(R.setOn(list,'stale-deal',true),'r1abc',true);assert.deepEqual(list,[task()]);
 const on=R.evaluate(list,data,{now}).find(r=>r.rule.id==='r1abc');assert.equal(on.items.length+on.skipped.length,1);
 assert.deepEqual(R.remove(list,'r1abc'),[]);
 assert.match(R.newId([],()=>0.5),/^r[a-z0-9]{6}$/);
 // A stored rule that no longer validates is ignored rather than run.
 assert.equal(R.effective([task({when:{type:'nope'}})]).length,A.RULES.length);
});

test('dedupe: one proposal per record and action across rules (first rule wins), never dropping a default',()=>{
 const data=base();
 const a=task({id:'rfirst',name:'Prima',when:{type:'deal-stale',days:3}}),b=task({id:'rsecond',name:'Seconda'});
 const c=task({id:'rthird',name:'Terza',do:{type:'email',subject:'Ciao {nome}',body:'Testo'}});
 const runs=R.evaluate([a,b,c],data,{now});const by=id=>runs.find(r=>r.rule.id===id);
 // «Trattativa ferma» (default, 14 days) already proposes ids(1): the custom rules skip it.
 assert.deepEqual(by('stale-deal').items.map(x=>x.record.id),[ids(1)]);
 assert.deepEqual(by('rfirst').items.map(x=>x.record.id),[ids(2)]);assert.deepEqual(by('rfirst').skipped.map(x=>[x.record.id,x.by]),[[ids(1),'Trattativa ferma']]);
 assert.deepEqual(by('rsecond').items,[]);assert.equal(by('rsecond').skipped[0].by,'Trattativa ferma');
 assert.deepEqual(by('rthird').items.map(x=>x.record.id),[ids(1)],'an email draft is a different action: not a duplicate of a task');
 // Within a rule, a record already holding the rule's task is not proposed twice.
 assert.deepEqual(R.planCustom(a,data,{now}).items.map(x=>x.record.id),[ids(1),ids(2)]);
 data.tasks.push({...R.planCustom(a,data,{now}).items[1].task,status:'todo'});
 assert.deepEqual(R.planCustom(a,data,{now}).items.map(x=>x.record.id),[ids(1)]);
});

test('registro: proposals now, skipped ones and what was confirmed, from the loaded rows only',()=>{
 const data=base(),rule=task();
 const first=R.planCustom(rule,data,{now}).items[0].task;
 data.tasks.push({...first,status:'done',created_at:'2026-10-10T10:00:00Z'},{title:'[Auto · Chiama in proposta] Chiama: Chiama per la proposta · Altra',opportunity_id:ids(9),status:'todo',created_at:'2026-10-12T10:00:00Z'});
 const log=R.registro([rule],data,{now}),row=log.find(r=>r.rule.id==='r1abc');
 assert.deepEqual(row.confirmed,{tasks:2,open:1,done:1,emails:0});
 assert.equal(row.proposed.length,0);assert.deepEqual(row.recent.map(x=>x.status),['todo','done']);
 assert.equal(log.length,A.RULES.length+1);
 assert.match(R.describe(rule,data),/^Quando un’opportunità è nella fase «Proposta» → proponi «Chiama: Chiama per la proposta» con scadenza a 2 giorni\.$/);
});

test('page wiring: rules load after the fixed rules, the panel replaces the old one, CSS uses only --crm-* tokens',()=>{
 const html=fs.readFileSync(__dirname+'/../radix-sales.html','utf8'),at=s=>html.indexOf(s);
 assert.ok(at('src="sales/crm-automations-core.js"')>0&&at('src="sales/crm-automations-core.js"')<at('src="sales/crm-rules-core.js"'));
 assert.ok(at('src="sales/crm-rules-core.js"')<at('src="sales/crm-rules.js"'));assert.ok(at('href="sales/crm-rules.css"')>0);
 assert.match(fs.readFileSync(__dirname+'/../sales/crm-tools.js','utf8'),/RadixCrmRules\.panel\(\{mode:'proposals'\}\)/);
 const css=fs.readFileSync(__dirname+'/../sales/crm-rules.css','utf8');
 assert.doesNotMatch(css,/#[0-9a-f]{3,8}\b|rgba?\(/i);assert.deepEqual([...new Set(css.match(/var\(--[a-z0-9-]+/g).map(v=>v.slice(4,10)))],['--crm-']);
 assert.match(fs.readFileSync(__dirname+'/../sales/crm-follow-up.js','utf8'),/opts\.send===false/);
});

const H=require('../sales/crm-home-core.js');
const homeData=()=>{const d=base();d.opportunities.push({id:ids(4),title:'Scaduta',expected_close:'2026-10-01',owner_id:3,amount_cents:900000,created_at:'2026-10-10T10:00:00Z'});d.contacts.push({id:ids(24),name:'Nuovo',created_at:'2026-10-15T10:00:00Z'});return d};
const FIXED=['close-overdue','stale-deal','new-contact'];
test('home: no rules row (or only defaults switched on) gives exactly today’s suggestions',()=>{
 const d=homeData(),me={now,me:3},today=H.suggestions(d,me),raw=H.collect(d,me);
 for(const k of FIXED)assert.ok(raw.some(x=>x.rule===k),'fixture exercises '+k);
 for(const rules of [undefined,null,[],[{id:'stale-deal',on:true}],[{id:'hot-contact',on:false}]]){assert.deepEqual(H.suggestions(d,{...me,rules}),today);assert.deepEqual(H.collect(d,{...me,rules}),raw)}
});
test('home: a default switched off in «Regole» disappears; home-only rules stay',()=>{
 const d=homeData(),me={now,me:3};
 const all=H.collect(d,me).map(x=>x.rule),off=H.collect(d,{...me,rules:FIXED.map(id=>({id,on:false}))}).map(x=>x.rule);
 for(const k of FIXED)assert.ok(!off.includes(k),k);
 assert.deepEqual(off,all.filter(k=>!FIXED.includes(k)));assert.ok(off.length>0);
 assert.deepEqual(H.collect(d,{...me,rules:[{id:'stale-deal',on:false}]}).map(x=>x.rule),all.filter(k=>k!=='stale-deal'));
});
test('home: custom rules add their proposals under their name, and a disabled one adds nothing',()=>{
 const d=homeData(),rule=task({id:'rhome1',name:'Ticket caldi',when:{type:'ticket-high',hours:4},do:{type:'task',kind:'call',title:'Richiama il cliente',days:0,to:'owner'}});
 const items=H.collect(d,{now,rules:[rule]}).filter(x=>x.rule==='rhome1');
 assert.equal(items.length,1);assert.equal(items[0].ruleName,'Ticket caldi');assert.equal(items[0].title,'Server giù');
 assert.equal(items[0].reason,'Regola «Ticket caldi»: proponi l’attività «Chiama: Richiama il cliente».');assert.deepEqual(items[0].action,{kind:'view',hash:'#tickets'});
 const mail=task({id:'rhome2',name:'Grazie preventivo',when:{type:'quote-accepted'},do:{type:'email',subject:'Grazie {nome}',body:'Testo'}});
 const q=H.collect(d,{now,rules:[mail],quotes:d.quotes}).find(x=>x.rule==='rhome2');
 assert.deepEqual(q.action,{kind:'customer',subject:'opportunities',id:ids(1),name:'Acme rinnovo'});assert.match(q.reason,/proponi la bozza email «Grazie Anna»/);assert.equal(q.key,'opportunities:'+ids(1));
 assert.equal(H.collect(d,{now,rules:[{...rule,on:false}]}).some(x=>x.rule==='rhome1'),false);
 // One item per record: a record already suggested by a fixed rule keeps a single item.
 const r=H.suggestions(d,{now,rules:[task({id:'rhome3',name:'In proposta'})]});
 assert.equal(r.items.filter(x=>x.key==='opportunities:'+ids(1)).length,1);
});
test('page: one shared read of the rules row for the home and the Automazioni panel',()=>{
 const ui=fs.readFileSync(__dirname+'/../sales/crm-rules.js','utf8'),dash=fs.readFileSync(__dirname+'/../sales/dashboard-view.js','utf8');
 assert.equal((ui.match(/subject:'rules'/g)||[]).length,1);assert.match(ui,/R\.load=load/);assert.match(ui,/await R\.load\(fresh\)/);
 assert.match(dash,/RadixCrmRules\.load\(\)/);assert.match(dash,/regole del workspace, non AI/);assert.match(dash,/it\.ruleName\|\|/);assert.doesNotMatch(dash,/subject:'rules'/);
});
