'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const nl=require('../lib/ped-newsletter.js'),pv=require('../lib/ped-views.js');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const body='Prima uscita della serie: parto dal costo di un cliente.\n\n## Come si calcola\n\nLa formula è **semplice**:\n\n- Stipendi\n- Pubblicità\n\n## Un esempio\n\n'+'Testo di esempio con numeri indicativi. '.repeat(70)+'\n\n1. Primo passo\n2. Secondo passo\n\nSe vuoi calcolarlo insieme, scrivimi in privato.';
const ed=(id,date,title,extra)=>Object.assign({id,channel:'Newsletter LinkedIn',date,time:'20:00',status:'approved',title,copy:body,revision:1},extra);
const state={timezone:'Europe/Rome',newsletter:{url:'https://www.linkedin.com/newsletters/7521563847824932864/'},contents:[
 ed('a','2026-11-03','Numeri che contano #1: il costo reale di un lead'),
 ed('b','2026-11-10','Numeri che contano #2: sei pronto per il primo commerciale?'),
 ed('c','2026-11-17','Passaggio generazionale: guida per PMI familiari'),
 ed('d','2026-11-24','Numeri che contano #2: il ciclo di vendita',{status:'draft'}),
 ed('x','2026-11-20','Scartata',{status:'rejected'}),
 {id:'p',channel:'LinkedIn',date:'2026-11-12',title:'Post',status:'approved',copy:'ciao'}]};

test('a LinkedIn newsletter is its own kind: never a Buffer image post',()=>{
 assert.equal(pv.mediaKind({channel:'Newsletter LinkedIn'}),'newsletter');assert.equal(pv.mediaKind({channel:'Newsletter'}),'email');
 assert.ok(nl.isLinkedInNewsletter({channel:'Newsletter LinkedIn'}));assert.ok(!nl.isLinkedInNewsletter({channel:'LinkedIn'}));
 const plan=pv.schedulePlan(state.contents,[{id:'li',service:'linkedin'}],{schedule:()=>({mode:'scheduled',scheduledAt:'2026-11-12T07:00:00Z'})});
 assert.deepEqual(plan.ready.map(r=>r.item.id),['p']);
 assert.ok(plan.skipped.filter(s=>/newsletter LinkedIn/.test(s.reason)).length>=3);
});
test('edition numbers follow the plan order and the series name comes from the titles',()=>{
 assert.equal(nl.seriesOf(state).name,'Numeri che contano');assert.equal(nl.seriesOf(state).url,'https://www.linkedin.com/newsletters/7521563847824932864/');
 assert.deepEqual(nl.editions(state.contents).map(x=>x.id),['a','b','c','d']);
 assert.equal(nl.expectedTitle(state,state.contents[2]),'Numeri che contano #3: Passaggio generazionale: guida per PMI familiari');
 assert.equal(nl.expectedTitle(state,state.contents[3]),'Numeri che contano #4: il ciclo di vendita');
 assert.deepEqual(nl.splitTitle('Numeri che contano #12 · Titolo'),{series:'Numeri che contano',number:12,headline:'Titolo'});
});
test('checks: wrong number, missing series, short text, no sections, no closing invite, placeholders',()=>{
 assert.deepEqual(nl.problems(state,state.contents[0],{placeholders:pv.placeholders}),[]);
 assert.ok(nl.problems(state,state.contents[3]).some(p=>p.id==='number'&&/#4/.test(p.label)));
 assert.ok(nl.problems(state,state.contents[2]).some(p=>p.id==='number'));
 const bad=ed('z','2026-12-01','Numeri che contano #5: corta',{copy:'Testo breve senza sezioni [caso reale da fornire].'});
 const ids=nl.problems({contents:[...state.contents,bad]},bad,{placeholders:pv.placeholders}).map(p=>p.id);
 for(const id of ['placeholder','short','sections','cta'])assert.ok(ids.includes(id),id);
 const long=ed('l','2026-12-02','Numeri che contano #5: '+'x'.repeat(140));assert.ok(nl.problems({contents:[...state.contents,long]},long).some(p=>p.id==='title'));
});
test('the text to paste keeps subtitles, bold and lists and drops wrappers and the repeated title',()=>{
 const item=ed('h','2026-11-03','Numeri che contano #1: Il costo',{copy:'---DOCUMENTO---\n# Il costo\n\nCiao <amici>\n\n## Sezione\n\nUn **dato** e *corsivo*\n\n---\n\n- uno\n- due\n\n1. a\n2. b\n---FINE DOCUMENTO---'});
 const html=nl.toHtml(item);
 assert.equal(html,'<p>Ciao &lt;amici&gt;</p>\n<h2>Sezione</h2>\n<p>Un <strong>dato</strong> e <em>corsivo</em></p>\n<ul><li>uno</li><li>due</li></ul>\n<ol><li>a</li><li>b</li></ol>');
 assert.ok(!/DOCUMENTO|\*\*|^#/m.test(nl.toPlain(item)));
});
test('steps, reminders and cover spec',()=>{
 const st=nl.steps(state,state.contents[1]);assert.match(st[0],/linkedin\.com\/newsletters/);assert.match(st[2],/Numeri che contano #2/);assert.match(st[4],/10\/11\/2026, ore 20:00/);
 assert.deepEqual(nl.toSchedule(state,'2026-11-08',pv.isQueued).map(x=>x.id),['b','c']);
 const queued={...state,contents:state.contents.map(x=>x.id==='b'?{...x,publication:{service:'linkedin-newsletter',revision:1}}:x)};
 assert.deepEqual(nl.toSchedule(queued,'2026-11-08',pv.isQueued).map(x=>x.id),['c']);
 const spec=nl.coverSpec(state,state.contents[1],{cover:'#14283F',page:'#F5F3EE',key:'#D8AD58',font:'Inter',signature:'FRANCESCO ILARI – GCP'});
 assert.equal(spec.width,1920);assert.equal(spec.height,1080);assert.equal(spec.number,2);assert.equal(spec.headline,'Sei pronto per il primo commerciale?');assert.equal(spec.signature,'FRANCESCO ILARI – GCP');
});
test('wiring: page loads the module, the server refuses Buffer for editions, the bulk count skips them',()=>{
 const h=read('project-editorial.html');assert.ok(h.indexOf('/lib/ped-newsletter.js')>h.indexOf('/lib/ped-views.js')&&h.indexOf('/lib/ped-newsletter.js')<h.indexOf('editorial-workspace.js'));
 assert.match(read('api/_registry-handler.js'),/mediaKind\(item\)==='newsletter'\)return send\(res,400/);
 const w=read('editorial-workspace.js');assert.match(w,/function bufferPending\(\)\{return state\.contents\.filter\(x=>x\.status==='approved'&&!pv\.isQueued\(x\)&&!\(nl&&nl\.isLinkedInNewsletter\(x\)\)\)\}/);
 assert.match(w,/if\(kind==='newsletter'&&nl\)\{renderNewsletter\(item,box,head\);return\}/);assert.match(w,/service:'linkedin-newsletter'/);
});
