'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const s=require('../lib/site-studio.js');
const opt=(id,label)=>s.QUESTIONS.find(q=>q.id===id).options.find(o=>o[0]===label)[1];

test('the questions: site type, goal, sections, style; prefill from the profile with brand colours',()=>{
 assert.deepEqual(s.QUESTIONS.map(q=>q.id),['type','goal','style']);
 assert.deepEqual(s.QUESTIONS[0].options.map(o=>o[0]),['Una pagina (landing)','Piccolo sito (4-5 pagine)']);
 assert.deepEqual(s.QUESTIONS[1].options.map(o=>o[0]),['Contatti e chiamate','Prenotazioni','Vetrina','Vendere']);
 assert.deepEqual(s.QUESTIONS[2].options.map(o=>o[0]),['Essenziale','Caldo','Tecnico','Audace']);
 assert.deepEqual(s.SECTIONS.map(x=>x[0]),['Chi siamo','Servizi','Prezzi','Testimonianze','FAQ','Contatti','Mappa']);
 assert.deepEqual(s.DEFAULT_SECTIONS,['about','services','contacts']);
 const pre=s.prefill({summary:'Studio di fisioterapia a Bergamo: riabilitazione sportiva.',notes:'Sede: Via Roma 12, Bergamo',links:'Tel. 035 123456, info@fisio-bg.it, sito https://www.fisio-bg.it.',visual:'Pagine #F7F5F0; copertina #1e3a5f; accento #F59E0B; font Inter'});
 assert.equal(pre.offer,'Studio di fisioterapia a Bergamo: riabilitazione sportiva.');
 assert.equal(pre.place,'Via Roma 12, Bergamo');
 assert.equal(pre.contacts,'info@fisio-bg.it · 035 123456 · https://www.fisio-bg.it');
 assert.deepEqual(pre.colours,['#1E3A5F','#F59E0B','#F7F5F0'],'cover first, then accent, then the rest');
 assert.deepEqual(s.prefill(null),{offer:'',place:'',contacts:'',colours:[]});
 assert.deepEqual(s.brandColours({visual:'colore #12 e rgb(1,2,3)'}),[]);
});

test('one prompt asks the Web Developer for exactly 3 proposals in JSON, with only confirmed facts and placeholders',()=>{
 const p=s.proposalsPrompt({type:opt('type','Piccolo sito (4-5 pagine)'),goal:opt('goal','Prenotazioni'),style:opt('style','Caldo'),sections:['services','prices','reviews','faq','contacts']},
  {offer:'  Fisioterapia sportiva a Bergamo  ',place:'Via Roma 12, Bergamo',contacts:'035 123456',project:{name:'Fisio BG'}});
 assert.match(p,/^Prepara 3 proposte alternative di sito per il progetto «Fisio BG»: un piccolo sito di 4-5 pagine/);
 assert.match(p,/«Fisioterapia sportiva a Bergamo»/);assert.match(p,/Dove: «Via Roma 12, Bergamo»/);assert.match(p,/Contatti confermati: «035 123456»/);
 assert.match(p,/far prenotare/);assert.match(p,/Stile dei testi: caldo/);
 assert.match(p,/in quest’ordine: Servizi, Prezzi, Testimonianze, FAQ, Contatti\./);
 assert.match(p,/Usa solo i fatti confermati/);assert.match(p,/Non inventare clienti, recensioni, testimonianze, numeri, prezzi, indirizzi, orari, premi/);
 assert.match(p,/«\[da completare: prezzi dei servizi\]»/);assert.match(p,/niente HTML/);assert.match(p,/Rispondi solo con JSON valido/);
 assert.match(p,/esattamente 3 proposte/);
 const bare=s.proposalsPrompt({},{offer:'Pizzeria al taglio a Torino'});
 assert.match(bare,/landing page/);assert.match(bare,/Dove: non indicato/);assert.match(bare,/Contatti confermati: non indicati/);assert.match(bare,/Chi siamo, Servizi, Contatti\./);
 assert.throws(()=>s.proposalsPrompt({},{offer:'corto'}),/cosa offre/);
 assert.throws(()=>s.proposalsPrompt({sections:[]},{offer:'Pizzeria al taglio a Torino'}),/almeno una sezione/);
 assert.throws(()=>s.proposalsPrompt({sections:['blog']},{offer:'Pizzeria al taglio a Torino'}),/Sezione non valida/);
 assert.throws(()=>s.proposalsPrompt({style:'neon'},{offer:'Pizzeria al taglio a Torino'}),/Stile/);
 // what the prompt asks for is what the parser reads back
 const echo=p.split('in questa forma:\n')[1];const back=s.parseProposals(echo);
 assert.equal(back.length,1);assert.deepEqual(back[0].sections.map(x=>x.title),['Servizi','Prezzi','Testimonianze','FAQ','Contatti']);
});

const P=(n,extra)=>({nome:'Proposta '+n,concetto:'Concetto '+n,titolo:'Titolo '+n,sottotitolo:'Sotto '+n,sezioni:[{titolo:'Servizi',testo:'Testo '+n}],invito:'Prenota ora',...extra});

test('parsing: fenced JSON with prose around, English keys, string sections, trailing commas, max 3',()=>{
 const r=s.parseProposals('Ecco le proposte:\n```json\n'+JSON.stringify({proposte:[P(1),P(2),P(3),P(4)]})+'\n```\nFammi sapere!');
 assert.deepEqual(r.map(x=>x.name),['Proposta 1','Proposta 2','Proposta 3']);
 assert.deepEqual(r[0],{name:'Proposta 1',concept:'Concetto 1',headline:'Titolo 1',sub:'Sotto 1',sections:[{title:'Servizi',text:'Testo 1'}],cta:'Prenota ora'});
 const en=s.parseProposals(JSON.stringify([{name:'A',concept:'c',headline:'**Big** title',sections:['Chi siamo: Siamo uno studio.','Solo testo'],cta:{text:'Scrivici'}}]));
 assert.equal(en[0].headline,'Big title');assert.deepEqual(en[0].sections,[{title:'Chi siamo',text:'Siamo uno studio.'},{title:'Sezione 2',text:'Solo testo'}]);assert.equal(en[0].cta,'Scrivici');
 const trailing=s.parseProposals('{"proposte":[{"nome":"T","titolo":"Ciao","sezioni":[{"titolo":"FAQ","testo":"x",},],},]}');
 assert.equal(trailing.length,1);assert.equal(trailing[0].name,'T');
 const single=s.parseProposals('{"nome":"Sola","titolo":"Una","sezioni":[{"titolo":"Servizi","testo":"y"}]}');assert.equal(single[0].name,'Sola');
 const unnamed=s.parseProposals(JSON.stringify({proposals:[{titolo:'H',sezioni:[{testo:'t'}]}]}));assert.equal(unnamed[0].name,'Proposta 1');assert.equal(unnamed[0].sections[0].title,'Sezione 1');
 const many=s.parseProposals(JSON.stringify({proposte:[P(1,{sezioni:Array.from({length:20},(_,i)=>({titolo:'S'+i,testo:'t'}))})]}));assert.equal(many[0].sections.length,8);
});

test('parsing: plain-text «Proposta n» fallback, and [] on an unusable reply',()=>{
 const t=s.parseProposals(['**PROPOSTA 1**','NOME: Vicini a te','CONCETTO: la persona prima di tutto','TITOLO: Ti rimettiamo in movimento','SOTTOTITOLO: Fisioterapia a Bergamo','SEZIONI:','- Chi siamo: Uno studio giovane.','- Servizi: Riabilitazione.','INVITO: Prenota una visita','','## Proposta 2','NOME: Vuota','TITOLO: Senza sezioni','===FINE==='].join('\n'));
 assert.equal(t.length,1);assert.equal(t[0].name,'Vicini a te');assert.equal(t[0].cta,'Prenota una visita');assert.deepEqual(t[0].sections.map(x=>x.title),['Chi siamo','Servizi']);
 for(const bad of [undefined,null,'','Mi dispiace, non posso aiutarti.','[not json','{"proposte":[{"nome":"X"}]}','{"proposte":[{"titolo":"Solo titolo","sezioni":[]}]}','{"proposte":"testo"}'])assert.deepEqual(s.parseProposals(bad),[],String(bad));
});

const HOSTILE={name:'<b>Nome</b>',concept:'c',headline:'<script>alert(1)</script> Benvenuti',sub:'"><img src=x onerror=alert(2)>',
 sections:[{title:'<i>Servizi</i>',text:'- Massaggi <style>body{display:none}</style>\n- Riabilitazione\nPrezzi: [da completare: prezzi dei servizi]'},{title:'Contatti',text:'Scrivici.'},{title:'Mappa',text:'Siamo in centro.'}],cta:'</a><script>x()</script>'};

test('the page template escapes every text, carries no script and highlights the placeholders',()=>{
 const html=s.buildPage(HOSTILE,{style:'caldo',colours:['#1E3A5F','#F59E0B'],name:'Fisio <BG>',place:'Via Roma 12, Bergamo',contacts:'035 123456 · info@fisio.it · https://fisio.it · javascript:alert(3)',year:2026});
 assert.match(html,/^<!doctype html>\n<html lang="it">/);assert.match(html,/<\/html>$/);
 assert.ok(!/<script/i.test(html),'no script tag');assert.ok(!/<[^>]*\son\w+=/i.test(html.replace(/="[^"]*"/g,'=""')),'no event handler attribute (quoted values cannot hold a quote)');assert.ok(!/<img|<iframe|<style>body/i.test(html));
 assert.ok(!/href="javascript:/i.test(html),'no javascript: link');
 assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt; Benvenuti'));assert.ok(html.includes('&quot;&gt;&lt;img src=x onerror=alert(2)&gt;'));
 assert.ok(html.includes('&lt;i&gt;Servizi&lt;/i&gt;'));assert.ok(html.includes('Fisio &lt;BG&gt;'));
 assert.match(html,/<li>Massaggi &lt;style&gt;body\{display:none\}&lt;\/style&gt;<\/li><li>Riabilitazione<\/li><\/ul><p>Prezzi: <mark class="todo">\[da completare: prezzi dei servizi\]<\/mark><\/p>/);
 assert.match(html,/Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"/);
 assert.ok(html.includes('<a href="tel:035123456">035 123456</a>'));assert.ok(html.includes('<a href="mailto:info@fisio.it">'));assert.ok(html.includes('<a href="https://fisio.it">fisio.it</a>'));
 assert.ok(html.includes('query=Via%20Roma%2012%2C%20Bergamo'),'map link from the confirmed place');
 assert.match(html,/class="cta" href="#s2-contatti"/,'the call to action leads to the contacts');
 assert.match(html,/--p:#1E3A5F;--a:#F59E0B/,'brand colours');assert.match(html,/Georgia/,'warm style headings');
 assert.match(html,/@media \(max-width:640px\)/);assert.match(html,/name="viewport"/);
 assert.ok(s.hasTodo(html));
});

test('the template fills what is missing with placeholders, varies by style and refuses bad colours',()=>{
 const html=s.buildPage({name:'A',headline:'Ciao',sections:[{title:'Contatti',text:''},{title:'Mappa',text:''}]},{style:'essenziale'});
 assert.ok(html.includes('[da completare: nome dell’attività]'));assert.ok(html.includes('[da completare: telefono, e-mail e orari]'));assert.ok(html.includes('[da completare: indirizzo]'));
 assert.ok(!/google\.com\/maps/.test(html),'no map link without a confirmed place');
 const css=st=>s.buildPage({headline:'H',sections:[{title:'S',text:'t'}]},{style:st}).match(/<style>[\s\S]*<\/style>/)[0];
 const all=['essenziale','caldo','tecnico','audace'].map(css);assert.equal(new Set(all).size,4,'four different templates');
 assert.match(css('audace'),/text-transform:uppercase/);assert.match(css('tecnico'),/monospace/);
 assert.equal(css(opt('style','Tecnico')),css('tecnico'),'the answer value picks the same template');
 const evil=s.buildPage({headline:'H',sections:[{title:'S',text:'t'}]},{colours:['red;}body{display:none','#FFFFFF']});
 assert.ok(!evil.includes('display:none'));assert.match(evil,/--p:#FFFFFF/);
 assert.equal(s.palette('essenziale',['#FFFF00']).a!=='#FFFF00',true,'a too light accent is darkened');
 assert.equal(s.filename({name:'Vicini a te!'}),'sito-vicini-a-te.html');assert.equal(s.filename({}),'sito-proposta.html');
 assert.ok(!s.hasTodo(s.buildPage({name:'A',headline:'H',sections:[{title:'Servizi',text:'t'}]},{name:'Studio'})));
});

test('the chosen site is saved in the Web Developer thread as a site page, keeping the other agents',async()=>{
 const p={name:'Vicini a te',headline:'H',sections:[{title:'Servizi',text:'t'}]},html=s.buildPage(p,{name:'Studio'});
 const [u,a]=s.savedEntry(p,html,{by:'Anna',at:'2026-10-20T10:00:00.000Z'});
 assert.equal(u.role,'user');assert.equal(u.by,'Anna');assert.equal(a.agent,'web-developer');
 const rt=require('../lib/radix-agent-runtime.js'),docs=rt.collectDocuments([a]);
 assert.equal(docs.length,1);assert.equal(docs[0].doc.title,'sito-vicini-a-te.html');assert.equal(rt.htmlSource(docs[0].doc),html);assert.ok(rt.isHtmlDoc(docs[0].doc),'listed as a site page with its preview');
 class ConflictError extends Error{}
 let stored={schemaVersion:1,conversations:{copywriter:[{role:'user',content:'ciao'}]}},saves=0,conflicts=1;
 const ws={ConflictError,bind:(pid,module)=>{assert.equal(pid,'radix');assert.equal(module,'agents');return {load:async()=>JSON.parse(JSON.stringify(stored)),save:async next=>{saves++;if(conflicts-->0)throw new ConflictError('conflitto');stored=next;return {revision:2}}}}};
 assert.deepEqual(await s.saveToProject(ws,'radix',p,html,{by:'Anna'}),{revision:2});assert.equal(saves,2);
 assert.deepEqual(stored.conversations.copywriter,[{role:'user',content:'ciao'}]);assert.equal(stored.conversations['web-developer'].length,2);
 await assert.rejects(s.saveToProject(null,'radix',p,html),/non disponibile/);
});

test('the widget confirms before the one AI call, uses the Web Developer memory and shows pages in a frame without scripts',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','lib/site-studio.js'),'utf8');
 assert.match(src,/confirm\('Preparare 3 proposte di sito[^']*È una sola chiamata AI: usa crediti API\.'\)\)return;\s*lock\(true\)/);
 assert.match(src,/rt\.reply\(\{role:AGENT,project:ctx\.project,memoryScope:ctx\.memoryScope/);assert.equal(s.AGENT,'web-developer');
 assert.equal((src.match(/rt\.reply\(/g)||[]).length,1,'one AI call');
 assert.ok(!/fetch\(|innerHTML|insertAdjacentHTML|eval\(|new Function/.test(src),'no requests of its own and no HTML injected into RADIX');
 assert.match(src,/f\.setAttribute\('sandbox',''\)/);assert.ok(!/allow-scripts/.test(src));assert.match(src,/f\.srcdoc=html/);
 assert.match(src,/if\(!root\.confirm\(PUBLISH_CONFIRM\)\)return;\s*btn\.disabled=true/);assert.match(src,/Sarà pubblicato su internet/);assert.match(src,/'Aggiorna il sito online'/);assert.match(src,/Scarica il sito \(\.html\)/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','lib/radix-agent-runtime.js'),'utf8'),/id:'web-developer'/);
});
