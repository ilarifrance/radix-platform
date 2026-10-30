// «Progetto da brief o da meeting»: prompt, reading the planner's reply, the plan built with RadixPM, and «Chi lavora».
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const pm=require('../lib/pm-demo.js'),B=require('../lib/pm-brief.js'),RT=require('../lib/radix-agent-runtime.js');
const AGENTS=RT.AGENTS;
const reply=JSON.stringify({name:'Corso LinkedIn',goal:'Lanciare il corso entro gennaio.',summary:'Pagina, video, email.',questions:['Prezzo del corso?'],phases:[
 {name:'Contenuti',tasks:[
  {n:1,title:'Scrivere la pagina di vendita',who:'agente',agent:'copywriter',days:3,after:[]},
  {n:2,title:'Registrare i 3 video',who:'io',days:5,after:[1],milestone:true},
  {n:3,title:'Montaggio',who:'persona',person:'Marco Rossi',days:4,after:[2]}]},
 {name:'Lancio',tasks:[
  {n:4,title:'Calendario dei 12 post',who:'strumento',tool:'ped',days:2,after:[1]},
  {n:5,title:'Agente inventato',who:'agente',agent:'mago',days:1},
  {n:6,title:'Strumento inventato',who:'strumento',tool:'fax',days:1},
  {n:7,title:'Persona senza nome',who:'persona',days:1},
  {n:8,title:'Revisione del contratto',who:'agent',agent:'legal-contracts',days:2,after:[3,4]}]}]});

test('the prompt lists specialist agents and RADIX tools, never hubs, and carries the brief',()=>{
 const p=B.prompt({text:'Lanciare il corso',source:'brief',start:'2026-11-02',me:'Francesco Ilari',people:['Marco Rossi'],agents:AGENTS});
 assert.match(p,/copywriter = Copywriter/);assert.match(p,/ped = Piano editoriale/);assert.match(p,/Lanciare il corso/);assert.match(p,/Marco Rossi/);
 assert.doesNotMatch(p,/marketing-orchestrator =/);assert.doesNotMatch(p,/orchestrator = Pipeline/);
 assert.match(B.prompt({text:'x',source:'meeting',title:'Call kick-off',start:'2026-11-02',agents:AGENTS}),/meeting \(trascrizione di una registrazione «Call kick-off»\)/);
});

test('the reply is read safely: unknown agents, tools and nameless people go back to the person',()=>{
 const r=B.parse('ecco: '+reply,{agents:AGENTS});
 const t=r.phases.flatMap(p=>p.tasks),by=n=>t.find(x=>x.n===n);
 assert.deepEqual([by(1).who,by(1).agent],['agent','copywriter']);
 assert.deepEqual([by(3).who,by(3).person],['person','Marco Rossi']);
 assert.deepEqual([by(4).who,by(4).tool],['tool','ped']);
 assert.equal(by(5).who,'me');assert.equal(by(6).who,'me');assert.equal(by(7).who,'me');
 assert.deepEqual(by(8).after,[3,4]);
 assert.deepEqual(B.split(r),{me:4,person:1,agent:2,tool:1});
 assert.equal(B.parse('niente json',{agents:AGENTS}),null);
 assert.equal(B.parse('{"phases":[]}',{agents:AGENTS}),null);
});

test('the plan: owners per executor, agent work under review, tool link kept, questions first, dropped tasks bridged',()=>{
 const r=B.parse(reply,{agents:AGENTS});
 r.phases[0].tasks[2].include=false;// Montaggio left out: «Revisione del contratto» then waits for what Montaggio waited for
 const s=B.buildState(pm,r,{name:'Corso',start:'2026-11-02',me:'Francesco Ilari',source:'brief',agentLabel:id=>RT.label(id)});
 assert.equal(s.projects[0].name,'Corso');assert.deepEqual(s.projects[0].subprojects.map(x=>x.name),['Contenuti','Lancio']);
 const t=title=>s.tasks.find(x=>x.title===title);
 assert.equal(t('Chiarire i punti aperti del progetto').owner,'Francesco Ilari');assert.match(t('Chiarire i punti aperti del progetto').details,/Prezzo del corso/);
 assert.equal(t('Scrivere la pagina di vendita').owner,'Agente · Copywriter');assert.deepEqual(t('Scrivere la pagina di vendita').assignedAgents,['copywriter']);assert.equal(t('Scrivere la pagina di vendita').approvalRequired,true);
 assert.equal(t('Registrare i 3 video').owner,'Francesco Ilari');assert.equal(t('Registrare i 3 video').milestone,true);
 assert.equal(t('Calendario dei 12 post').owner,'Piano editoriale · RADIX');assert.equal(t('Calendario dei 12 post').tool,'ped');
 assert.equal(t('Montaggio'),undefined);
 assert.deepEqual(t('Revisione del contratto').dependencies.map(id=>s.tasks.find(x=>x.id===id).title).sort(),['Calendario dei 12 post','Registrare i 3 video']);
 assert.ok(t('Registrare i 3 video').start>t('Scrivere la pagina di vendita').due);
 assert.match(t('Scrivere la pagina di vendita').history[0],/analisi del brief/);
 // the tool link survives a save and reload
 assert.equal(pm.validateState(JSON.parse(JSON.stringify(s))).tasks.find(x=>x.title==='Calendario dei 12 post').tool,'ped');
 assert.equal(B.toolHref('ped','prj-1'),'/project-editorial.html?project=prj-1');
 const none=B.parse(reply,{agents:AGENTS});none.phases.forEach(p=>p.tasks.forEach(x=>{x.include=false}));
 assert.throws(()=>B.buildState(pm,none,{start:'2026-11-02'}),/almeno/);
});

test('a meeting gives its transcript, or what is left of it, and names the tasks it already created',()=>{
 const archives=[{projectId:'prj-a',projectName:'Interfood',tasks:[{id:'t3',title:'Mandare il preventivo'}],data:{schemaVersion:1,items:[
  {id:'m1',title:'Kick-off',date:'2026-10-20',summary:'Nuovo sito.',decisions:['Budget 5k'],questions:[],transcript:'Parliamo del sito…',created:['t3']},
  {id:'m2',title:'Vecchio',date:'2026-09-01',summary:'Riassunto.',decisions:[],questions:['Chi paga?'],transcript:'',transcriptDropped:true},
  {id:'m3',title:'Vuoto',date:'2026-10-25'}]}}];
 const list=B.meetingsFrom(archives);
 assert.deepEqual(list.map(m=>m.id),['m1','m2']);
 assert.match(list[0].text,/Trascrizione:\nParliamo del sito/);assert.match(list[0].text,/non ripeterle\):\n- Mandare il preventivo/);
 assert.match(list[1].text,/Sintesi: Riassunto/);assert.match(list[1].text,/Chi paga/);assert.doesNotMatch(list[1].text,/Trascrizione/);
});

test('«Chi lavora»: progress per executor and the next actions, reviews first',()=>{
 const r=B.parse(reply,{agents:AGENTS});
 const s=B.buildState(pm,r,{name:'Corso',start:'2026-11-02',me:'Francesco Ilari',agentLabel:id=>RT.label(id)});
 const copy=s.tasks.find(x=>x.title==='Scrivere la pagina di vendita');
 pm.recordAgentWork(s,copy.id,{agent:'copywriter',text:'Bozza'});
 const c=B.crew(s.tasks,{me:'Francesco Ilari',today:'2026-11-03'});
 const g=Object.fromEntries(c.groups.map(x=>[x.key,x]));
 assert.deepEqual(Object.keys(g).sort(),['agent','me','person','tool']);
 assert.equal(g.agent.total,2);assert.equal(g.agent.review,1);assert.equal(g.tool.total,1);assert.equal(g.person.total,1);
 assert.equal(c.next[0].kind,'review');assert.equal(c.next[0].task.id,copy.id);
 assert.ok(c.next.some(n=>n.kind==='mine'&&n.task.title==='Chiarire i punti aperti del progetto'));
 assert.ok(!c.next.some(n=>n.task.title==='Calendario dei 12 post'),'the PED task waits for the copy');
 pm.changeStatus(s,copy.id,'In revisione');pm.approve(s,copy.id,true);pm.changeStatus(s,copy.id,'Completato');
 const c2=B.crew(s.tasks,{me:'Francesco Ilari',today:'2026-11-03'});
 assert.ok(c2.next.some(n=>n.kind==='tool'&&n.task.title==='Calendario dei 12 post'));
 assert.equal(c2.groups.find(x=>x.key==='agent').done,1);
});

test('the PM page loads the brief flow and stays free of direct network calls',()=>{
 const html=fs.readFileSync(__dirname+'/../radix-pm-concept.html','utf8'),js=fs.readFileSync(__dirname+'/../lib/pm-brief.js','utf8');
 assert.match(html,/<script src="lib\/pm-brief\.js"><\/script>/);assert.match(html,/id="pm-crew"/);assert.match(html,/id="brief-open"/);
 for(const bad of ['fetch(','innerHTML','localStorage','sessionStorage','XMLHttpRequest','eval('])assert.ok(!js.includes(bad),bad);
});
