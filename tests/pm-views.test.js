'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const v=require('../lib/pm-views'),pm=require('../lib/pm-demo');
const now=Date.parse('2026-10-15T10:00:00Z');
const T=(id,o)=>({id,project:'p1',subproject:'p1s1',title:'Task '+id,owner:'Anna',start:'',due:'2026-10-20',details:'',assignedAgents:[],dependencies:[],approvalRequired:false,approved:false,milestone:false,recurrence:'Nessuna',status:'Da fare',documents:[],decisions:[],history:[],...o});

test('kanban groups by status and sorts by due date',()=>{
 const cols=v.kanban([T('a',{due:'2026-10-30'}),T('b',{due:'2026-10-18'}),T('c',{status:'Completato'})]);
 assert.deepEqual(cols.map(c=>c.status),v.STATUSES);assert.deepEqual(cols[0].tasks.map(t=>t.id),['b','a']);assert.equal(cols[3].tasks.length,1);
});

test('gantt places tasks after their dependencies and flags lateness',()=>{
 const g=v.gantt([T('a',{start:'2026-10-01',due:'2026-10-10'}),T('b',{due:'2026-10-25',dependencies:['a']}),T('c',{due:'2026-10-14',status:'Completato'}),T('d',{due:''})],now);
 const by=Object.fromEntries(g.rows.map(r=>[r.id,r]));
 assert.equal(by.d,undefined);assert.equal(v.fromDay(by.b.start),'2026-10-10');assert.equal(by.a.late,true);assert.equal(by.c.late,false);
 assert.ok(g.from<=by.a.start&&g.to>=by.b.end);assert.ok(g.weeks.length>=3);
});

test('workload counts open tasks per owner and agent per week',()=>{
 const w=v.workload([T('a',{due:'2026-10-16',assignedAgents:['copywriter']}),T('b',{due:'2026-10-01'}),T('c',{due:'2026-10-28',owner:'Bruno'}),T('d',{status:'Completato'})],now);
 const anna=w.rows.find(r=>r.owner==='Anna');assert.deepEqual(anna.cells.slice(0,3),[2,0,0]);
 assert.equal(w.rows.find(r=>r.owner==='Agente copywriter').total,1);assert.equal(w.rows.find(r=>r.owner==='Bruno').cells[2],1);
});

test('kpis: on-time rate, late tasks, next milestone',()=>{
 const k=v.kpis([T('a',{due:'2026-10-10',status:'Completato'}),T('b',{due:'2026-10-12'}),T('c',{due:'2026-11-01',milestone:true})],now);
 assert.equal(k.onTime,50);assert.equal(k.late,1);assert.equal(k.nextMilestone.id,'c');
});

test('approved Agency deliverables complete their PM activity in order',()=>{
 const state={projects:[{id:'p1',name:'X',note:'',synthetic:true,subprojects:[{id:'p1s1',name:'Generale'}]}],tasks:[T('t1',{agencyTaskId:'step-1',approvalRequired:true}),T('t2',{agencyTaskId:'step-2',approvalRequired:true,dependencies:['t1']}),T('t3',{agencyTaskId:'step-3',approvalRequired:true})],nextId:4};
 const changed=v.syncFromAgency(pm,state,[{id:'step-1',status:'approved'},{id:'step-2',status:'approved'},{id:'step-3',status:'done'}]);
 assert.deepEqual(changed,['t1','t2']);assert.equal(state.tasks[0].status,'Completato');assert.equal(state.tasks[2].status,'Da fare');
 assert.doesNotThrow(()=>pm.validateState(state));
});

test('PM page offers the four views and syncs from the Agency workspace',()=>{
 const html=fs.readFileSync('radix-pm-concept.html','utf8');
 for(const view of ['list','kanban','gantt','workload'])assert.match(html,new RegExp('data-view="'+view+'"'));
 assert.match(html,/views\.syncFromAgency\(pm,state/);assert.doesNotMatch(fs.readFileSync('lib/pm-demo.js','utf8'),/Cambio stato simulato|Approvazione esplicita simulata/);
});

test('budget compares planned and actual costs with the project budget',()=>{
 const v=require('../lib/pm-views.js');
 const tasks=[{estimate:1000,actual:400},{estimate:500.5},{actual:250.25},{}];
 assert.deepEqual(v.budget(tasks,{budget:2000}),{budget:2000,planned:1500.5,spent:650.25,remaining:1349.75,spentPct:33,plannedPct:75,overPlanned:false,overSpent:false});
 const none=v.budget(tasks,{});assert.equal(none.spentPct,null);assert.equal(none.remaining,null);assert.equal(none.overSpent,false);
 assert.equal(v.budget([{estimate:3000,actual:2100}],{budget:2000}).overSpent,true);
});

test('cost-only edits keep status and approval; other edits still revoke it',()=>{
 const s=pm.validateState({projects:[{id:'p1',name:'P',note:'',synthetic:true,subprojects:[{id:'p1s1',name:'G'}]}],tasks:[],nextId:1});
 const t=pm.create(s,{title:'A',owner:'Anna',due:'2026-10-20',project:'p1',subproject:'p1s1',approvalRequired:true});
 pm.changeStatus(s,t.id,'In corso');pm.changeStatus(s,t.id,'In revisione');pm.approve(s,t.id,true);
 pm.update(s,t.id,{estimate:'800',actual:'120,5'});
 assert.equal(t.status,'In revisione');assert.equal(t.approved,true);assert.equal(t.estimate,800);assert.equal(t.actual,120.5);
 pm.update(s,t.id,{actual:''});assert.equal('actual' in t,false);assert.equal(t.approved,true);
 assert.throws(()=>pm.update(s,t.id,{estimate:'-5'}),/Costo previsto/);
 assert.deepEqual(pm.validateState(JSON.parse(JSON.stringify(s))).tasks[0].estimate,800);
 pm.update(s,t.id,{title:'B'});assert.equal(t.approved,false);assert.equal(t.status,'Da fare');
});

test('phases group the timeline by sub-project with progress and dependency links',()=>{
 const subs=[{id:'p1s1',name:'Strategia'},{id:'p1s2',name:'Produzione'},{id:'p1s3',name:'Vuota'}];
 const tasks=[T('a',{due:'2026-10-10',status:'Completato'}),T('b',{due:'2026-10-20',checklist:[{id:'c1',text:'x',done:true},{id:'c2',text:'y',done:false}]}),T('c',{subproject:'p1s2',due:'2026-10-25',dependencies:['b']}),T('d',{subproject:'p1s2',due:'2026-10-26',dependencies:['a']})];
 const ph=v.phases(v.gantt(tasks,now),subs,tasks);
 assert.deepEqual(ph.groups.map(g=>g.name),['Strategia','Produzione']);
 assert.equal(ph.groups[0].progress,75);assert.equal(ph.groups[0].done,1);assert.equal(ph.groups[1].progress,0);
 assert.deepEqual(ph.links.sort((x,y)=>x.to.localeCompare(y.to)),[{from:'b',to:'c',open:true},{from:'a',to:'d',open:false}]);
});

test('workload measures each owner against the weekly capacity',()=>{
 const tasks=['a','b','c','d'].map(id=>T(id,{due:'2026-10-16'}));
 const w=v.workload(tasks,now,4,3),anna=w.rows[0];
 assert.equal(w.capacity,3);assert.equal(anna.peak,4);assert.equal(anna.peakLoad,133);assert.equal(anna.load,33);assert.deepEqual(w.overloaded,['Anna']);assert.equal(anna.over[0],true);
 assert.equal(v.workload(tasks,now,4,0).capacity,3);
});

test('portfolio sums projects: active, completed, on-time and budget health',()=>{
 const plan=(tasks,budget)=>({projects:[{id:'p1',name:'X',note:'',synthetic:true,subprojects:[{id:'p1s1',name:'G'}],...(budget?{budget}:{})}],tasks,nextId:9});
 const p=v.portfolio([
  {id:'x',name:'Alfa',state:plan([T('a',{due:'2026-10-10',status:'Completato',actual:500}),T('b',{due:'2026-10-12'})],400)},
  {id:'y',name:'Beta',state:plan([T('c',{due:'2026-10-11',status:'Completato',actual:100})],1000)},
  {id:'z',name:'Gamma',state:null}],now);
 assert.equal(p.projects,3);assert.equal(p.active,1);assert.equal(p.done,2);assert.equal(p.total,3);
 assert.equal(p.onTime,67);assert.equal(p.budgetHealth,50);assert.equal(p.list[0].name,'Alfa');assert.equal(p.list[0].late,1);assert.equal(p.list[0].overSpent,true);
});

test('weekly capacity is validated with the plan',()=>{
 const base={projects:[{id:'p1',name:'X',note:'',synthetic:true,subprojects:[{id:'p1s1',name:'G'}]}],tasks:[],nextId:1};
 assert.equal(pm.validateState({...base,projects:[{...base.projects[0],capacity:5}]}).projects[0].capacity,5);
 assert.throws(()=>pm.validateState({...base,projects:[{...base.projects[0],capacity:0}]}),/Capacità/);
 assert.equal('capacity' in pm.validateState(base).projects[0],false);
});

test('agent work goes to review, keeps the last five results and feeds dependent briefs',()=>{
 const state={projects:[{id:'p1',name:'X',note:'',synthetic:true,subprojects:[{id:'p1s1',name:'G'}]}],nextId:3,
  tasks:[T('t1',{assignedAgents:['strategist'],approvalRequired:true,history:[]}),T('t2',{assignedAgents:['copywriter'],dependencies:['t1'],details:'Tre post',checklist:[{id:'c1',text:'Post LinkedIn',done:false}],history:[]})]};
 assert.throws(()=>pm.recordAgentWork(state,'t2',{agent:'copywriter',text:'x'}),/dipendenze/);
 assert.throws(()=>pm.recordAgentWork(state,'t1',{agent:'copywriter',text:'x'}),/non è assegnato/);
 const e=pm.recordAgentWork(state,'t1',{agent:'strategist',text:'Strategia: tono diretto',by:'Anna',at:'2026-10-16T08:00:00Z'});
 assert.equal(e.by,'Anna');assert.equal(state.tasks[0].status,'In revisione');assert.match(state.tasks[0].history.join('|'),/Risultato dell’agente strategist avviato da Anna/);
 for(let i=0;i<6;i++)pm.recordAgentWork(state,'t1',{agent:'strategist',text:'v'+i,at:'2026-10-16T08:0'+i+':00Z'});
 assert.equal(state.tasks[0].agentWork.length,5);pm.approve(state,'t1',true);pm.recordAgentWork(state,'t1',{agent:'strategist',text:'v5'});assert.equal(state.tasks[0].approved,false);assert.equal(state.tasks[0].agentWork[4].text,'v5');
 assert.doesNotThrow(()=>pm.validateState(state));
 pm.approve(state,'t1',true);pm.changeStatus(state,'t1','Completato');assert.throws(()=>pm.recordAgentWork(state,'t1',{agent:'strategist',text:'x'}),/già completata/);
 const brief=v.agentBrief(state,state.tasks[1],'copywriter');
 assert.match(brief,/Tre post/);assert.match(brief,/- Post LinkedIn/);assert.match(brief,/=== Task t1 \(strategist\) ===\nv5/);
 assert.throws(()=>pm.validateState({...state,tasks:[{...state.tasks[0],agentWork:[{agent:'a',at:'ieri',text:'x'}]},state.tasks[1]]}),/Data lavoro/);
});

test('completion date is stamped, cleared on reopen, and drives the weekly portfolio deltas',()=>{
 const state={projects:[{id:'p1',name:'X',note:'',synthetic:true,subprojects:[{id:'p1s1',name:'G'}]}],nextId:3,tasks:[T('t1',{history:[]}),T('t2',{history:[]})]};
 pm.changeStatus(state,'t1','In corso');pm.changeStatus(state,'t1','Completato');
 assert.ok(Date.parse(state.tasks[0].completedAt)>Date.now()-5000);assert.equal(pm.validateState(state).tasks[0].completedAt,state.tasks[0].completedAt);
 pm.changeStatus(state,'t1','Da fare');assert.equal('completedAt' in state.tasks[0],false);
 const at=Date.parse('2026-10-15T10:00:00Z'),plan=t=>({projects:state.projects,tasks:t,nextId:9});
 const p=v.portfolio([{id:'a',name:'A',createdAt:'2026-10-14T09:00:00Z',state:plan([T('x',{status:'Completato',completedAt:'2026-10-13T09:00:00Z'}),T('y')])},{id:'b',name:'B',createdAt:'2026-09-01T09:00:00Z',state:plan([T('z',{status:'Completato',completedAt:'2026-09-20T09:00:00Z'}),T('w')])}],at);
 assert.equal(p.doneWeek,1);assert.equal(p.newWeek,1);
});

test('statusReport: weekly progress text from the plan, with budget, late and upcoming work',()=>{
 const views=require('../lib/pm-views.js');
 const P={id:'p1',name:'Campagna',budget:1000,subprojects:[{id:'s1',name:'Generale'},{id:'s2',name:'Contenuti PED'}]};
 const T=[{title:'A',owner:'Anna',due:'2026-10-10',status:'Completato',completedAt:'2026-10-15T10:00:00Z',subproject:'s1',actual:200},
  {title:'Vecchia',due:'2026-09-01',status:'Completato',completedAt:'2026-09-02T10:00:00Z',subproject:'s1'},
  {title:'B',owner:'Bruno',due:'2026-10-12',status:'In corso',subproject:'s1'},
  {title:'C',due:'2026-10-20',status:'In revisione',approvalRequired:true,subproject:'s2'},
  {title:'D',due:'2026-10-25',status:'Da fare',milestone:true,subproject:'s2'},{title:'Lontana',due:'2026-12-25',status:'Da fare',subproject:'s1'}];
 const r=views.statusReport(T,P,Date.parse('2026-10-17T09:00:00Z'),{note:'Ok dal cliente sul brief.'});
 assert.deepEqual(r.counts,{done:1,active:1,late:1,next:1,approvals:1});
 assert.match(r.text,/^Report di avanzamento · Campagna\nSettimana dal 11 ott al 17 ott/);
 assert.match(r.text,/attività completate: 2 di 6/);assert.match(r.text,/Puntualità sulle scadenze passate: 67%/);
 assert.match(r.text,/prossima milestone: D \(25 ott\)/);assert.match(r.text,/Budget: speso 200\s€ di 1000\s€ \(20%\)/);
 assert.match(r.text,/In ritardo \(1\)\n• B · Bruno · 12 ott · Generale/);assert.match(r.text,/• D · 25 ott · milestone · Contenuti PED/);
 assert.doesNotMatch(r.text,/Vecchia|Lontana/);assert.match(r.text,/Note\nOk dal cliente sul brief\.\n$/);
 const empty=views.statusReport([],{name:'X',subprojects:[{id:'s1',name:'Generale'}]},Date.parse('2026-10-17T09:00:00Z')).text;
 assert.match(empty,/nessuna scadenza ancora passata/);assert.match(empty,/il piano è in linea/);assert.doesNotMatch(empty,/Budget|\n\n\n/);
});

test('readyAgentWork: open tasks with completed dependencies, one entry per agent without a result',()=>{
 const t=(id,o)=>Object.assign({id,title:id,status:'Da fare',dependencies:[],assignedAgents:[],agentWork:[],due:'2026-11-0'+id.length},o);
 const all=[t('a',{status:'Completato',assignedAgents:['copywriter']}),t('bb',{dependencies:['a'],assignedAgents:['copywriter','seo']}),t('ccc',{dependencies:['bb'],assignedAgents:['copywriter']}),
  t('dddd',{status:'In corso',assignedAgents:['seo'],agentWork:[{agent:'seo'}]}),t('eeeee',{status:'In revisione',assignedAgents:['seo']}),t('ffffff',{assignedAgents:['analyst']})];
 assert.deepEqual(v.readyAgentWork(all,all).map(x=>x.id+':'+x.agent),['bb:copywriter','bb:seo','ffffff:analyst']);
 assert.deepEqual(v.readyAgentWork([all[2]],all),[],'a dependency outside the list still blocks');
});

test('level pushes overflow to the first week with room for everyone on the task',()=>{
 const mon=Date.parse('2026-10-19T09:00:00Z');// Monday
 const t=(id,due,extra={})=>({id,title:id,owner:'Anna',status:'Da fare',start:'',due,dependencies:[],assignedAgents:[],...extra});
 const tasks=[t('a','2026-10-20'),t('b','2026-10-21'),t('c','2026-10-22',{start:'2026-10-19'}),t('d','2026-10-23'),
  t('e','2026-10-27'),t('f','2026-10-28'),t('g','2026-10-29'),
  t('ped','2026-10-23',{pedContentId:'x'}),t('base','2026-10-22'),t('next','2026-11-20',{dependencies:['base']}),t('done','2026-10-22',{status:'Completato'})];
 const moves=v.level(tasks,mon,6,3);
 // week 1: a,b,c,d,ped,base = 6 → ped and base stay, d c b move (latest first). Week 2 has e,f,g = 3 (full): week 3.
 assert.deepEqual(moves.map(m=>m.id+':'+m.due),['d:2026-11-06','c:2026-11-05','b:2026-11-04']);
 assert.equal(moves[1].start,'2026-11-02');assert.equal(moves[0].owner,'Anna');
 const after=tasks.map(x=>{const m=moves.find(y=>y.id===x.id);return m?{...x,due:m.due}:x});
 assert.equal(v.level(after,mon,6,3).length,0);
 assert.deepEqual(v.level(tasks,mon,6,10),[]);
});
