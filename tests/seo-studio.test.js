'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const s=require('../lib/seo-studio.js');

test('the questions: goal (calls, local, AI assistants, ecommerce) and customers; prefill from the profile',()=>{
 assert.deepEqual(s.QUESTIONS.map(q=>q.id),['goal','customers']);
 assert.deepEqual(s.QUESTIONS[0].options.map(o=>o[0]),['Più chiamate e contatti','Visibilità locale','Citati dalle AI','Vendite ecommerce']);
 assert.match(s.QUESTIONS[0].options[2][1],/ChatGPT, Perplexity/);
 assert.equal(s.labelOf('goal',undefined),'Più chiamate e contatti');
 const pre=s.prefill({summary:'Studio dentistico a Bergamo: igiene, impianti e ortodonzia.',audience:'Famiglie e professionisti della provincia',links:'Sito: https://www.dentista-bg.it. Instagram: @dentista'});
 assert.equal(pre.offer,'Studio dentistico a Bergamo: igiene, impianti e ortodonzia.');
 assert.equal(pre.audience,'Famiglie e professionisti della provincia');
 assert.equal(pre.site,'https://www.dentista-bg.it');
 assert.equal(s.labelOf('customers',pre.customers),'Entrambi');
 assert.equal(s.labelOf('customers',s.prefill({audience:'PMI e startup'}).customers),'Aziende');
 assert.deepEqual(s.prefill(null),{offer:'',audience:'',site:'',customers:s.QUESTIONS[1].options[0][1]});
});

test('the site address is optional, normalised and checked',()=>{
 assert.equal(s.siteUrl(''),'');assert.equal(s.siteUrl('  '),'');
 assert.equal(s.siteUrl('www.esempio.it'),'https://www.esempio.it');
 assert.equal(s.siteUrl('http://esempio.it/servizi/'),'http://esempio.it/servizi');
 for(const bad of ['esempio','non è un sito','javascript:alert(1)'])assert.throws(()=>s.siteUrl(bad),/non sembra valido/,bad);
});

test('one prompt asks for exactly 3 strategies with only confirmed facts and no invented numbers',()=>{
 const p=s.strategiesPrompt({goal:s.QUESTIONS[0].options[2][1],customers:s.QUESTIONS[1].options[1][1]},{offer:'  Consulenza fiscale per startup a Milano  ',audience:'Fondatori al primo anno',site:'doccapital.it',competitors:['Studio Rossi','',' fisco-facile.it ','Quarto escluso'],project:{name:'Doc Capital'}});
 assert.match(p,/^Prepara 3 strategie SEO e GEO/);assert.match(p,/«Doc Capital»/);
 assert.match(p,/«Consulenza fiscale per startup a Milano»/);assert.match(p,/aziende e professionisti \(B2B\); in particolare «Fondatori al primo anno»/);
 assert.match(p,/ChatGPT, Perplexity/);assert.match(p,/Sito: https:\/\/doccapital\.it/);
 assert.match(p,/Concorrenti indicati: «Studio Rossi», «fisco-facile\.it», «Quarto escluso»\./);
 assert.match(p,/da 8 a 12 parole chiave o domande/);assert.match(p,/3 pagine o contenuti/);assert.match(p,/FAQ, dati strutturati schema\.org, citazioni/);assert.match(p,/primi 30 giorni/);
 assert.match(p,/Usa solo i fatti confermati/);assert.match(p,/Non inventare posizionamenti su Google, volumi di ricerca/);assert.match(p,/«da verificare»/);
 for(const n of [1,2,3])assert.ok(p.includes('===STRATEGIA '+n+'==='),n);
 assert.ok(!p.includes('===STRATEGIA 4==='));assert.match(p,/===FINE===$/);
 const bare=s.strategiesPrompt({},{offer:'Pizzeria al taglio a Torino'});
 assert.match(bare,/Sito: non indicato/);assert.ok(!/Concorrenti/.test(bare));assert.match(bare,/più chiamate/);
 assert.throws(()=>s.strategiesPrompt({},{offer:'corto'}),/cosa vende/);
 assert.throws(()=>s.strategiesPrompt({goal:'altro'},{offer:'Pizzeria al taglio a Torino'}),/Obiettivo/);
 assert.throws(()=>s.strategiesPrompt({},{offer:'Pizzeria al taglio a Torino',site:'boh'}),/sito/);
 // what the prompt asks for is what the parser reads back
 const echo=p.split('senza testo prima o dopo:\n')[1].replace(/\(([^)]*)\)/g,'$1 esempio');
 const back=s.parseStrategies(echo);assert.equal(back.length,3);assert.ok(back.every(x=>x.keywords.length&&x.pages.length&&x.geo.length&&x.steps.length));
});

const REPLY=['Ecco le strategie:','','**===STRATEGIA 1===**','TITOLO: **Primi nella zona**','FOCUS: ricerche locali e scheda Google.','PAROLE CHIAVE:',
 '- dentista Bergamo','- impianti dentali Bergamo prezzo (volume da verificare)','* quanto costa una pulizia dei denti','1. dentista aperto il sabato','PAGINE:','- Pagina Impianti: spiegare il percorso','- FAQ: le domande dei pazienti','AZIONI GEO:','- FAQ con schema FAQPage','- Nome, indirizzo e telefono identici ovunque','PRIMI 30 GIORNI:','1. Contenuti: scrivere le FAQ','2. Settimana 2: aggiornare la scheda Google','',
 '## Strategia 2: Rispondere alle domande','**Focus:** contenuti utili che le AI possono citare.','### Parole chiave e domande','- come funziona l’ortodonzia invisibile','- allineatori trasparenti età','### Pagine e contenuti','- Guida all’ortodonzia invisibile','### Azioni GEO','- Citazioni su portali di settore','### Primi 30 giorni','- Scrivere la guida','La strategia 2 è più lenta ma dura.',
 '===STRATEGIA 3===','TITOLO: Vuota','FOCUS: niente di concreto','===FINE===','Fammi sapere!'].join('\n');

test('parsing: markers and headings, markdown and bullets removed, empty strategy skipped, text after the end ignored',()=>{
 const r=s.parseStrategies(REPLY);
 assert.equal(r.length,2,'the third has no keywords: skipped');
 assert.deepEqual(r.map(x=>x.title),['Primi nella zona','Rispondere alle domande']);
 assert.equal(r[0].focus,'ricerche locali e scheda Google.');
 assert.deepEqual(r[0].keywords,['dentista Bergamo','impianti dentali Bergamo prezzo (volume da verificare)','quanto costa una pulizia dei denti','dentista aperto il sabato']);
 assert.deepEqual(r[0].pages,['Pagina Impianti: spiegare il percorso','FAQ: le domande dei pazienti']);
 assert.deepEqual(r[0].steps,['Contenuti: scrivere le FAQ','Settimana 2: aggiornare la scheda Google'],'a numbered step that starts with a section word is not a heading');
 assert.equal(r[1].focus,'contenuti utili che le AI possono citare.');
 assert.deepEqual(r[1].steps,['Scrivere la guida','La strategia 2 è più lenta ma dura.'],'a sentence naming «strategia 2» does not open a new strategy');
 assert.ok(!JSON.stringify(r).includes('Fammi sapere'));
});

test('parsing malformed replies: nothing usable is [], extra strategies are cut to 3, JSON is accepted, lists are capped',()=>{
 for(const bad of [undefined,null,'','Mi dispiace, non posso aiutarti.','===STRATEGIA 1===\nTITOLO: Vuota\n\n===STRATEGIA 2===\nPAROLE CHIAVE:\n- solo parole','[not json','{"strategies":[{"title":"X"}]}'])assert.deepEqual(s.parseStrategies(bad),[],String(bad));
 const many=[1,2,3,4,5].map(n=>'===STRATEGIA '+n+'===\nTITOLO: S'+n+'\nPAROLE CHIAVE:\n- parola '+n+'\nPAGINE:\n- pagina '+n).join('\n');
 assert.deepEqual(s.parseStrategies(many).map(x=>x.title),['S1','S2','S3']);
 const j=s.parseStrategies('```json\n{"strategie":[{"titolo":"A","focus":"locale","parole_chiave":["uno","due"],"pagine":["Home"],"azioni_geo":"FAQ; schema LocalBusiness","primi_30_giorni":["passo"]},{"title":"B","keywords":"tre\\nquattro","steps":[{"text":"fare"}]},{"title":"vuota"}]}\n```');
 assert.deepEqual(j.map(x=>x.title),['A','B']);assert.deepEqual(j[0].geo,['FAQ','schema LocalBusiness']);assert.deepEqual(j[1].keywords,['tre','quattro']);assert.deepEqual(j[1].steps,['fare']);
 const untitled=s.parseStrategies('===STRATEGIA 1===\nPAROLE CHIAVE:\n- a b\nAZIONI GEO:\n- FAQ');assert.equal(untitled[0].title,'Strategia 1');
 const long=s.parseStrategies('===STRATEGIA 1===\nPAROLE CHIAVE:\n'+Array.from({length:30},(_,i)=>'- kw '+i).join('\n')+'\nPAGINE:\n- pagina');
 assert.equal(long[0].keywords.length,s.LIMITS.keywords);
});

test('the chosen plan as Markdown, a file name and the entry saved in the specialist thread',()=>{
 const [st]=s.parseStrategies(REPLY);
 const md=s.toMarkdown(st,{project:{name:'Studio Bianchi'},answers:{goal:s.QUESTIONS[0].options[1][1]},site:'https://dentista-bg.it',date:'2026-10-20'});
 assert.match(md,/^# Piano SEO e GEO · Primi nella zona\n\nProgetto: Studio Bianchi · Obiettivo: Visibilità locale · Sito: https:\/\/dentista-bg\.it · 2026-10-20/);
 assert.match(md,/## Parole chiave e domande\n\n- dentista Bergamo/);assert.match(md,/## Primi 30 giorni\n\n1\. Contenuti: scrivere le FAQ\n2\. Settimana 2/);
 assert.match(md,/da verificare con uno strumento SEO/);
 assert.equal(s.filename(st),'piano-seo-geo-primi-nella-zona.md');assert.equal(s.filename({title:'Città & più'}),'piano-seo-geo-citta-piu.md');
 const [u,a]=s.savedEntry(st,md,{by:'Anna',at:'2026-10-20T10:00:00.000Z'});
 assert.equal(u.role,'user');assert.equal(u.by,'Anna');assert.equal(a.agent,'seo-geo');
 const rt=require('../lib/radix-agent-runtime.js'),docs=rt.collectDocuments([a]);
 assert.equal(docs.length,1);assert.equal(docs[0].doc.title,'Piano SEO e GEO · Primi nella zona');assert.equal(docs[0].doc.body,md);assert.equal(docs[0].doc.incomplete,false);
});

test('saving keeps the other agents, appends to the specialist thread and retries once on a conflict',async()=>{
 class ConflictError extends Error{}
 let stored={schemaVersion:1,prefs:{x:1},conversations:{copywriter:[{role:'user',content:'ciao'}],'seo-geo':Array.from({length:59},(_,i)=>({role:'user',content:'m'+i}))}},saves=0,conflicts=1;
 const ws={ConflictError,bind:(pid,module)=>{assert.equal(pid,'radix');assert.equal(module,'agents');return {load:async()=>JSON.parse(JSON.stringify(stored)),save:async next=>{saves++;if(conflicts-->0)throw new ConflictError('conflitto');stored=next;return {revision:2}}}}};
 const [st]=s.parseStrategies(REPLY);
 assert.deepEqual(await s.saveToProject(ws,'radix',st,'# piano',{by:'Anna'}),{revision:2});
 assert.equal(saves,2);
 assert.deepEqual(stored.conversations.copywriter,[{role:'user',content:'ciao'}]);assert.deepEqual(stored.prefs,{x:1});
 const t=stored.conversations['seo-geo'];assert.equal(t.length,60,'the thread keeps the last 60 messages');assert.equal(t[59].agent,'seo-geo');assert.match(t[59].content,/---DOCUMENTO: Piano SEO e GEO/);
 await assert.rejects(s.saveToProject(null,'radix',st,'x'),/non disponibile/);
 const broken={ConflictError,bind:()=>({load:async()=>null,save:async()=>{throw Error('rete')}})};
 await assert.rejects(s.saveToProject(broken,'radix',st,'x'),/rete/);
});

test('the widget confirms before the one AI call and uses the SEO and GEO specialist with its memory',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','lib/seo-studio.js'),'utf8');
 assert.match(src,/confirm\('Preparare 3 strategie SEO e GEO[^']*È una sola chiamata AI: usa crediti API\.'\)\)return;\s*lock\(true\)/);
 assert.match(src,/rt\.reply\(\{role:AGENT,project:ctx\.project,memoryScope:ctx\.memoryScope/);assert.equal(s.AGENT,'seo-geo');
 assert.equal((src.match(/rt\.reply\(/g)||[]).length,1,'one AI call');
 assert.ok(!/fetch\(/.test(src),'no requests of its own: the AI call goes through the agents runtime, the save through the workspace client');
 assert.match(fs.readFileSync(path.join(__dirname,'..','lib/radix-agent-runtime.js'),'utf8'),/id:'seo-geo'/);
 assert.ok(fs.readFileSync(path.join(__dirname,'..','api/_registry-core.js'),'utf8').includes("'agents'"),'the «agents» module the plan is saved in');
});
