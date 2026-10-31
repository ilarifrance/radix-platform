// PM work layer: quick add, «Le mie attività», health, calendar, list sorting, templates, AI break-down,
// plus the rules it relies on in lib/pm-demo.js (priority, comments, real recurrence, edits that keep the status).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const pm=require('../lib/pm-demo.js'),W=require('../lib/pm-work.js');
const TODAY='2026-10-29';// a Thursday
const base=()=>pm.validateState({projects:[{id:'p1',name:'P',note:'',synthetic:true,subprojects:[{id:'p1s1',name:'Strategia'},{id:'p1s2',name:'Contenuti web'}]}],tasks:[],nextId:1});
const add=(s,o)=>pm.create(s,{project:'p1',subproject:'p1s1',title:'Attività',owner:'Anna Neri',due:'2026-11-05',...o});

test('quick add reads date, owner, priority, phase and milestone out of plain words',()=>{
 const o={today:TODAY,people:['Marco Rossi','Sara Conti','Francesco Ilari'],phases:[{id:'s1',name:'Strategia'},{id:'s2',name:'Contenuti web'}],me:'Francesco Ilari'};
 const q=W.parseQuick('Chiamare Rossi venerdì @Marco !alta #cont',o);
 assert.deepEqual([q.title,q.due,q.owner,q.priority,q.subproject],['Chiamare Rossi','2026-10-30','Marco Rossi','Alta','s2']);
 const cases=[['Bozza oggi','2026-10-29'],['Bozza domani','2026-10-30'],['Bozza dopodomani','2026-10-31'],['Bozza giovedì','2026-11-05'],['Bozza lunedì prossimo','2026-11-02'],
  ['Bozza prossima settimana','2026-11-02'],['Bozza fine mese','2026-10-31'],['Bozza tra 3 giorni','2026-11-01'],['Bozza fra 2 settimane','2026-11-12'],['Bozza entro il 15/11','2026-11-15'],
  ['Bozza 3 gennaio','2027-01-03'],['Bozza il 5','2026-11-05'],['Bozza 15 nov 2027','2027-11-15'],['Bozza 2026-12-01','2026-12-01'],['Draft tomorrow','2026-10-30'],['Draft in 2 weeks','2026-11-12']];
 for(const [text,due] of cases){const r=W.parseQuick(text,o);assert.equal(r.due,due,text);assert.match(r.title,/^(Bozza|Draft)$/,text)}
 assert.equal(W.parseQuick('Report @io',o).owner,'Francesco Ilari');
 const nw=W.parseQuick('Logo @luca p1',o);assert.equal(nw.owner,'Luca');assert.equal(nw.priority,'Urgente');assert.ok(nw.tokens.find(t=>t.kind==='owner').new);
 assert.equal(W.parseQuick('Fattura 31/02',o).due,'','impossible dates are not dates');
 assert.equal(W.parseQuick('Cena al mar',o).due,'','short day names are ordinary words');
 assert.deepEqual(W.parseQuick('Testo #inesistente',o).unknown,['#inesistente']);
 assert.equal(W.parseQuick('Kick-off lunedì !milestone',o).milestone,true);
});

test('«Le mie attività» groups my open work across projects by urgency',()=>{
 const a=base(),b=base();add(a,{title:'Scaduta',owner:'Francesco Ilari',due:'2026-10-27'});add(a,{title:'Oggi',owner:'Francesco',due:TODAY,priority:'Alta'});add(a,{title:'Di Anna',due:TODAY});
 add(b,{title:'Settimana',owner:'francesco ilari',due:'2026-11-03'});add(b,{title:'Dopo',owner:'Francesco Ilari',due:'2026-12-20'});const d=add(b,{title:'Fatta',owner:'Francesco Ilari',due:'2026-10-20'});pm.changeStatus(b,d.id,'Completato');
 const w=W.myWork([{id:'a',name:'A',state:a},{id:'b',name:'B',state:b}],{me:'Francesco Ilari',today:TODAY});
 assert.deepEqual(w.groups.map(g=>g.items.map(i=>i.task.title)),[['Scaduta'],['Oggi'],['Settimana'],['Dopo']]);
 assert.equal(w.open,4);assert.equal(w.late,1);assert.equal(w.groups[0].items[0].phase,'Strategia');
 assert.equal(W.myWork([{id:'a',name:'A',state:a}],{everyone:true,today:TODAY}).open,3);
});

test('@mentions in comments reach the person in «Le mie attività»',()=>{
 const s=base(),t=add(s,{owner:'Marco Rossi'});pm.addComment(s,t.id,{text:'@Francesco puoi rivederla? Anche @Nessuno',by:'Marco Rossi',at:TODAY+'T09:00:00Z'});
 pm.addComment(s,t.id,{text:'Nota mia @Francesco',by:'Francesco Ilari',at:TODAY+'T10:00:00Z'});
 assert.deepEqual(W.mentions('@marco e @Sara',['Marco Rossi','Sara Conti']),['Marco Rossi','Sara Conti']);
 const m=W.mentionsOf([{id:'p',name:'P',state:s}],'Francesco Ilari',{today:TODAY});assert.equal(m.length,1,'my own comments do not notify me');assert.equal(m[0].comment.by,'Marco Rossi');
 const again=pm.validateState(JSON.parse(JSON.stringify(s)));assert.equal(again.tasks[0].comments.length,2);
 assert.throws(()=>pm.removeComment(s,t.id,'m1','Francesco Ilari'),/solo i tuoi/);pm.removeComment(s,t.id,'m2','Francesco Ilari');assert.equal(t.comments.length,1);
 assert.throws(()=>pm.addComment(s,t.id,{text:'  '}),/Commento/);
});

test('project health: on track, at risk, off track, with the reasons',()=>{
 const s=base();add(s,{due:'2026-11-10'});add(s,{due:'2026-11-12'});add(s,{due:'2026-11-14'});add(s,{due:'2026-11-15'});
 assert.equal(W.health(s.tasks,{today:TODAY}).health,'In linea');
 add(s,{title:'Tardi',due:'2026-10-28'});let h=W.health(s.tasks,{today:TODAY});assert.equal(h.health,'A rischio');assert.match(h.reasons.join(' '),/scaduta/);
 add(s,{title:'Milestone',due:'2026-10-27',milestone:true});h=W.health(s.tasks,{today:TODAY});assert.equal(h.health,'Fuori strada');assert.match(h.reasons[0],/milestone in ritardo: Milestone/);
 assert.equal(W.health([],{}).health,'');
 const text=W.statusDraft(s.tasks,{today:TODAY,health:h});assert.match(text,/^Stato: Fuori strada/);assert.match(text,/In ritardo:\n• Milestone/);
});

test('status updates are kept on the project (last 50) and validated',()=>{
 const s=base();assert.throws(()=>pm.addStatusUpdate(s,'p1',{health:'Benissimo',text:'x'}),/salute/);
 pm.addStatusUpdate(s,'p1',{health:'A rischio',text:'Due ritardi sul design.',by:'Anna'});
 const back=pm.validateState(JSON.parse(JSON.stringify(s)));assert.equal(back.projects[0].updates[0].health,'A rischio');
 for(let i=0;i<60;i++)pm.addStatusUpdate(s,'p1',{health:'In linea',text:'ok '+i});assert.equal(s.projects[0].updates.length,50);
});

test('priority is bookkeeping: setting it keeps status and approval',()=>{
 const s=base(),t=add(s,{approvalRequired:true});pm.changeStatus(s,t.id,'In revisione');pm.approve(s,t.id,true);
 pm.setPriority(s,t.id,'Urgente');assert.equal(t.priority,'Urgente');assert.equal(t.approved,true);assert.equal(t.status,'In revisione');
 pm.update(s,t.id,{priority:'Bassa'});assert.equal(t.priority,'Bassa');assert.equal(t.approved,true);
 pm.setPriority(s,t.id,'');assert.equal('priority' in t,false);assert.throws(()=>pm.setPriority(s,t.id,'Altissima'),/non valida/);
 assert.equal(add(s,{priority:'Altissima'}).priority,undefined,'unknown priorities are dropped');
});

test('editing keeps the status; an approved activity loses only its approval',()=>{
 const s=base(),a=add(s,{title:'A'});pm.changeStatus(s,a.id,'In corso');pm.update(s,a.id,{title:'A2',due:'2026-11-20'});assert.equal(a.status,'In corso');
 const b=add(s,{title:'B',approvalRequired:true});pm.changeStatus(s,b.id,'In revisione');pm.approve(s,b.id,true);pm.changeStatus(s,b.id,'Completato');
 pm.update(s,b.id,{details:'Nuovo testo'});assert.equal(b.status,'In revisione');assert.equal(b.approved,false);assert.equal(b.completedAt,undefined);
 const c=add(s,{title:'C'});pm.changeStatus(s,c.id,'In corso');pm.update(s,c.id,{dependencies:[a.id]});assert.equal(c.status,'Da fare','an open prerequisite sends it back to «Da fare»');
 const d=add(s,{title:'D'});pm.changeStatus(s,d.id,'Completato');pm.update(s,d.id,{title:'D2'});assert.equal(d.status,'Completato','a completed activity without approval stays completed');
 pm.validateState(JSON.parse(JSON.stringify(s)));
});

test('real recurrence: completing creates the next activity once, not in the past',()=>{
 const s=base(),t=add(s,{title:'Report',due:'2026-10-26',start:'2026-10-23',recurrence:'Ogni settimana',priority:'Alta'});pm.addSubtask(s,t.id,'Numeri');pm.toggleSubtask(s,t.id,'c1',true);
 const next=pm.repeat(s,(pm.changeStatus(s,t.id,'Completato'),t),TODAY)||s.tasks.find(x=>x.recurrenceOf===t.id);
 assert.equal(s.tasks.filter(x=>x.recurrenceOf===t.id).length,1);assert.ok(next.due>=new Date().toISOString().slice(0,10)||next.due>=TODAY);
 assert.equal(next.priority,'Alta');assert.equal(next.checklist[0].done,false);assert.equal(W.days(next.start,next.due),3,'same lead time');
 pm.changeStatus(s,t.id,'In corso');pm.changeStatus(s,t.id,'Completato');assert.equal(s.tasks.filter(x=>x.recurrenceOf===t.id).length,1,'reopening does not duplicate');
 assert.equal(pm.nextDate('2026-01-31','Ogni mese'),'2026-02-28');assert.equal(pm.nextDate('2026-10-30','Ogni giorno lavorativo'),'2026-11-02');assert.equal(pm.nextDate('2026-10-30','Ogni 2 settimane'),'2026-11-13');
 const old=add(s,{title:'Vecchia',recurrence:'Nessuna'});old.recurrence='Settimanale · solo descrizione';pm.changeStatus(s,old.id,'Completato');assert.equal(old.recurrenceNext,undefined,'descriptive recurrences of old plans stay descriptive');
 assert.equal(pm.recurrenceRule('Settimanale · solo descrizione'),'Ogni settimana');
 const back=pm.validateState(JSON.parse(JSON.stringify(s)));assert.equal(back.tasks.find(x=>x.id===t.id).recurrenceNext,next.id);
});

test('calendar: six-or-fewer weeks from Monday, tasks on their due day',()=>{
 const s=base();add(s,{title:'A',due:'2026-10-29'});add(s,{title:'B',due:'2026-10-29',priority:'Urgente'});
 const c=W.calendar(s.tasks,'2026-10',{today:TODAY});assert.equal(c.weeks[0][0].day,'2026-09-28');assert.equal(c.weeks.length,5);
 const day=c.weeks.flat().find(d=>d.day===TODAY);assert.ok(day.today);assert.deepEqual(day.tasks.map(t=>t.title),['B','A']);assert.equal(c.prev,'2026-09');assert.equal(c.next,'2026-11');
});

test('list: sort by any column and group by phase, status, owner or priority',()=>{
 const s=base();add(s,{title:'b',due:'2026-11-03',owner:'Zoe'});add(s,{title:'a',due:'2026-11-01',priority:'Bassa',subproject:'p1s2'});add(s,{title:'c',due:'2026-11-02',priority:'Urgente'});
 assert.deepEqual(W.sortTasks(s.tasks,'due').map(t=>t.title),['a','c','b']);assert.deepEqual(W.sortTasks(s.tasks,'priority').map(t=>t.title),['c','a','b']);assert.deepEqual(W.sortTasks(s.tasks,'title','desc').map(t=>t.title),['c','b','a']);
 assert.deepEqual(W.groupTasks(s.tasks,'subproject',s.projects[0].subprojects).map(g=>[g.name,g.items.length]),[['Strategia',2],['Contenuti web',1]]);
 assert.deepEqual(W.groupTasks(s.tasks,'priority').map(g=>g.name),['Urgente','Bassa','Senza priorità']);
});

test('templates build a valid plan with phases, working-day dates and dependencies',()=>{
 for(const t of W.TEMPLATES){const s=W.fromTemplate(pm,t.id,{name:'X',start:'2026-11-02'});assert.equal(s.projects[0].subprojects.length,t.phases.length,t.id);
  assert.equal(s.tasks.length,t.phases.reduce((n,p)=>n+p[1].length,0));for(const x of s.tasks){const wd=new Date(x.due+'T12:00:00Z').getUTCDay();assert.ok(wd>0&&wd<6,t.id+' '+x.title+' on a weekend');assert.ok(!x.start||x.start<=x.due)}
  for(const x of s.tasks)for(const d of x.dependencies)assert.ok(s.tasks.find(y=>y.id===d).due<=x.due,t.id+': '+x.title+' ends before its prerequisite')}
 assert.throws(()=>W.fromTemplate(pm,'nope',{}),/Modello/);
 assert.equal(W.workdays('2026-10-30',1),'2026-11-02');
});

test('AI break-down: one prompt, an editable list without duplicates',()=>{
 const t={title:'Testi home',owner:'Sara',due:'2026-11-05',details:'',checklist:[{id:'c1',text:'Bozza',done:false}]};
 assert.match(W.breakdownPrompt(t,{project:'Sito'}),/Sotto-attività già presenti: Bozza/);
 assert.deepEqual(W.parseBreakdown('Ecco:\n- Raccogliere i testi\n2. **Scrivere** la bozza.\n- bozza\n* Rivedere\n',t.checklist),['Raccogliere i testi','Scrivere la bozza','Rivedere']);
});

test('the page loads the work layer, stays on its own origin and keeps the old list for plain browsers',()=>{
 const html=fs.readFileSync('radix-pm-concept.html','utf8');
 for(const f of ['lib/pm-work.js','lib/pm-work-ui.js','/lib/radix-confirm.js','/shell/pm-work.css'])assert.ok(html.includes(f),f);
 assert.ok(html.indexOf('lib/pm-work.js')<html.indexOf('lib/pm-work-ui.js'));
 for(const id of ['quick-form','quick-input','quick-preview','health','update-health','update-save','update-history','project-template','project-template-cards','project-start'])assert.match(html,new RegExp('id="'+id+'"'),id);
 assert.match(html,/data-view="mine"/);assert.match(html,/data-view="calendar"/);assert.match(html,/name="priority"/);
 const ui=fs.readFileSync('lib/pm-work-ui.js','utf8');assert.doesNotMatch(ui,/https?:\/\/|fetch\(|innerHTML|localStorage/);
 assert.match(ui,/RadixConfirm/,'the AI call asks first');
});
