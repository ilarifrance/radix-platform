'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const s=require('../lib/copy-studio.js');
const catalog=require('../agency/catalog.json'),rt=require('../lib/radix-agent-runtime.js');
const ids=s.SERVICES.map(x=>x.id);
// Values that fill every required field of a service.
// Fields with a format of their own get a valid value (the SMS sender: at most 11 characters).
const VALID={sender:'FornoRossi'};
const filled=(id,extra)=>{const v={project:{name:'Forno Rossi',voice:'Caldo e diretto'}};for(const f of s.service(id).fields)v[f.id]=VALID[f.id]||'Valore scritto dalla persona per '+f.id;return Object.assign(v,extra||{})};

test('the fifteen services: valid configs with a catalog role, questions, fields and sections',()=>{
 assert.deepEqual(ids,['naming','lancio','annunci','testi','newsletter','brochure','scheda','presentazione','comunicato','persona','concorrenza','sequenze','tono','influencer','sms']);
 const roles=Object.keys(catalog.roles);
 for(const x of s.SERVICES){
  assert.ok(roles.includes(x.role),x.id+' role '+x.role);assert.ok(rt.AGENTS.some(a=>a.id===x.role),x.id+' runtime agent');
  assert.ok(x.title&&x.what&&x.file&&/^[a-z-]+$/.test(x.file),x.id);
  assert.ok(Array.isArray(x.who)&&['il','lo'].includes(x.who[0]),x.id);
  assert.ok(x.questions.length>=2,x.id);for(const q of x.questions){assert.ok(q.id&&q.label&&q.options.length>=2,x.id+' '+q.id);for(const o of q.options)assert.ok(o[0]&&o[1],x.id+' '+q.id)}
  assert.equal(new Set(x.questions.map(q=>q.id)).size,x.questions.length,x.id+' question ids');
  assert.ok(x.fields.length>=2&&x.fields.some(f=>f.need),x.id+' has a required field');assert.equal(new Set(x.fields.map(f=>f.id)).size,x.fields.length,x.id+' field ids');
  assert.ok(x.sections.length>=1,x.id);assert.equal(new Set(x.sections.map(c=>s.toMarkdown?c.label:c.label)).size,x.sections.length,x.id+' labels');
  for(const c of x.sections)assert.ok(c.key&&/^[A-ZÀ-Ú0-9 -]+$/.test(c.label)&&c.hint,x.id+' '+c.key);
  assert.ok(x.need.length&&x.need.every(k=>x.sections.some(c=>c.key===k)),x.id+' need');
  assert.ok(Array.isArray(x.rules)&&x.rules.length,x.id+' rules')}
 assert.equal(s.service('boh'),null);assert.throws(()=>s.proposalsPrompt('boh',{},{}),/Servizio non valido/);
 assert.equal(s.whoOf('naming','a'),'allo Stratega di Marca');assert.equal(s.whoOf('scheda','di'),'del Copywriter');assert.equal(s.whoOf('lancio'),'il Digital Strategist');
});

test('prefill from the project profile; the confirmed facts that go in the prompt',()=>{
 assert.deepEqual(s.prefill({name:'Forno Rossi',summary:'  Forno a Torino:   pane e dolci ',audience:'Famiglie'}),{offer:'Forno a Torino: pane e dolci',audience:'Famiglie',name:'Forno Rossi',sender:'FornoRossi'});
 assert.deepEqual(s.prefill(null),{offer:'',audience:'',name:'',sender:''});
 assert.equal(s.prefill({name:'Caffè Città & Più Srl'}).sender,'CaffeCittaP','the SMS sender: no accents nor symbols, 11 characters');
 assert.equal(s.prefill({positioning:'Il forno del quartiere'}).offer,'Il forno del quartiere');
 assert.deepEqual(s.projectFacts({name:'Forno Rossi',voice:'caldo',links:'x'}),['Nome: Forno Rossi','Tono di voce: caldo']);
});

test('every prompt: 3 proposals, the user data, the confirmed facts, the no-invention rules and the marker format',()=>{
 for(const id of ids){const x=s.service(id),p=s.proposalsPrompt(id,{},filled(id));
  assert.match(p,new RegExp('^Prepara 3 proposte alternative di '+x.what.replace(/[()]/g,'\\$&')),id);assert.match(p,/«Forno Rossi»/);
  const v=filled(id);for(const f of x.fields)assert.ok(p.includes(f.label+': «'+v[f.id]+'»'),id+' '+f.id);
  assert.match(p,/Fatti confermati del progetto:\n- Nome: Forno Rossi\n- Tono di voce: Caldo e diretto/);
  assert.match(p,/Usa solo i fatti confermati del progetto e quello che è scritto qui\. Non inventare numeri, prezzi, sconti, clienti, premi, certificazioni, recensioni o risultati\./);
  assert.match(p,/«da verificare»/);assert.match(p,/Italiano semplice/);
  for(const r of x.rules)assert.ok(p.includes(r),id+' rule');
  for(const q of x.questions)assert.ok(p.includes(q.label+': '+q.options[q.def||0][1]+'.'),id+' default answer');
  for(const n of [1,2,3])assert.ok(p.includes('===PROPOSTA '+n+'===\nIDEA:'),id+' '+n);assert.ok(!p.includes('===PROPOSTA 4==='));assert.match(p,/===FINE===$/);
  // what the prompt asks for is what the parser reads back
  const echo=p.split('senza testo prima o dopo:\n')[1].replace(/\(([^)]*)\)/g,'$1 esempio');
  assert.equal(s.parseProposals(id,echo).length,3,id+' echo')}
 // required fields
 assert.throws(()=>s.proposalsPrompt('naming',{},{offer:'corto'}),/Compila «Cosa fa l’attività e dove»/);
 assert.throws(()=>s.proposalsPrompt('scheda',{},{product:'Sedia Alba',data:'poco'}),/Compila «Dati tecnici»/);
 assert.ok(s.proposalsPrompt('scheda',{},{product:'Sedia Alba',data:'Altezza 82 cm, faggio massello'}),'the company is optional on the sheet');
 assert.throws(()=>s.proposalsPrompt('naming',{kind:'altro'},filled('naming')),/Risposta non valida per «Cosa serve»/);
 // multi-line data keeps its lines; answers change the words
 const sp=s.proposalsPrompt('scheda',{use:s.service('scheda').questions[0].options[1][1]},{product:'Sedia Alba',data:'Altezza: 82 cm\nMateriale: faggio'});
 assert.match(sp,/Dati tecnici: «Altezza: 82 cm\nMateriale: faggio»/);assert.match(sp,/Dove si usa: una scheda per il sito/);
 assert.match(sp,/usa SOLO i dati tecnici scritti qui/);assert.match(sp,/Non inventare misure, pesi, materiali, certificazioni/);assert.match(sp,/DA VERIFICARE con la scritta «da verificare»/);
 // service-specific rules
 const np=s.proposalsPrompt('naming',{},filled('naming'));assert.match(np,/Non dire mai che un nome è libero/);
 assert.match(s.proposalsPrompt('newsletter',{},filled('newsletter')),/Non scrivere la riga per disiscriversi/);
 const ap=s.proposalsPrompt('annunci',{},filled('annunci'));assert.match(ap,/massimo 30 caratteri/);assert.match(ap,/massimo 90 caratteri/);assert.match(ap,/META TITOLO:/);
 const google=s.proposalsPrompt('annunci',{platform:s.service('annunci').questions[0].options[1][1]},filled('annunci'));assert.match(google,/TITOLI GOOGLE:/);assert.ok(!/META/.test(google),'only Google');
 const meta=s.proposalsPrompt('annunci',{platform:s.service('annunci').questions[0].options[2][1]},filled('annunci'));assert.ok(!/TITOLI GOOGLE/.test(meta));assert.match(meta,/META TESTO PRINCIPALE:/);
 assert.deepEqual(s.sectionsFor('annunci',{}).map(x=>x.key),['gtitles','gdesc','mtext','mtitle']);
});

const NAMING=['Ecco le proposte:','','**===PROPOSTA 1===**','IDEA: **Radici e lievito**','**NOMI:**','- Madia — la madia dove riposa il pane','2. «Lievita»','* Crosta & Co','SLOGAN:','- Il pane che aspetta','PERCHÉ FUNZIONA:','Nomi brevi e caldi.','Facili da dire.','',
 '## Proposta 2: Parole nuove','### Nomi','- Panora','### Slogan','- Ogni giorno, da capo','',
 '===PROPOSTA 3===','IDEA: Vuota','PERCHÉ FUNZIONA: niente','===FINE===','Fammi sapere!'].join('\n');

test('parsing: markers and markdown headings, bullets and quotes removed, empty proposal skipped, text after the end ignored',()=>{
 const r=s.parseProposals('naming',NAMING);
 assert.equal(r.length,2,'the third has no names nor slogan');
 assert.deepEqual(r.map(x=>x.title),['Radici e lievito','Parole nuove']);
 assert.deepEqual(r[0].sections.names,['Madia — la madia dove riposa il pane','Lievita','Crosta & Co']);
 assert.deepEqual(r[0].sections.slogan,['Il pane che aspetta']);assert.equal(r[0].sections.why,'Nomi brevi e caldi.\nFacili da dire.');
 assert.deepEqual(r[1].sections,{names:['Panora'],slogan:['Ogni giorno, da capo']});
 assert.ok(!JSON.stringify(r).includes('Fammi sapere'));assert.deepEqual(r[0].issues,[]);
 const untitled=s.parseProposals('newsletter','=== Proposta 1 ===\nOGGETTO: Apriamo la domenica\nTESTO:\nCiao!\n\nDa lunedì…');
 assert.equal(untitled[0].title,'Proposta 1');assert.equal(untitled[0].sections.body,'Ciao!\n\nDa lunedì…');
 const many=[1,2,3,4,5].map(n=>'===PROPOSTA '+n+'===\nIDEA: P'+n+'\nSLIDE:\nSlide 1 · Apertura\n- punto').join('\n');
 assert.deepEqual(s.parseProposals('presentazione',many).map(x=>x.title),['P1','P2','P3']);
 assert.equal(s.parseProposals('presentazione',many)[0].sections.slides,'Slide 1 · Apertura\n- punto','text sections keep their lines');
});

test('parsing JSON variants (fenced, wrapped, trailing commas, labels as keys) and junk is []',()=>{
 const j=s.parseProposals('newsletter','Certo!\n```json\n{"proposte":[{"idea":"Breve","oggetto":"Apriamo la domenica","anteprima":"Dalle 8 alle 13","testo":["Ciao,","da lunedì"],"invito":"Vieni a trovarci",},{"idea":"Senza testo","oggetto":"x"},{"idea":"Due","subject":"Novità","body":"Testo"}]}\n```');
 assert.deepEqual(j.map(x=>x.title),['Breve','Due']);assert.equal(j[0].sections.preheader,'Dalle 8 alle 13');assert.equal(j[0].sections.body,'Ciao,\nda lunedì');assert.equal(j[1].sections.subject,'Novità');
 const list=s.parseProposals('annunci','[{"titoli_google":["Pane caldo a Torino","Forno sotto casa"],"descrizioni_google":"Pane a lievito madre ogni mattina\\nAperti anche la domenica"}]');
 assert.deepEqual(list[0].sections.gtitles,['Pane caldo a Torino','Forno sotto casa']);assert.equal(list[0].sections.gdesc.length,2);assert.equal(list[0].title,'Proposta 1');
 for(const bad of [undefined,null,'','Mi dispiace, non posso aiutarti.','[not json','{"proposte":[{"idea":"X"}]}','[1,2,"a"]','===PROPOSTA 1===\nIDEA: Vuota\nPERCHÉ FUNZIONA: niente'])assert.deepEqual(s.parseProposals('naming',bad),[],String(bad));
 assert.throws(()=>s.parseProposals('boh','x'),/Servizio non valido/);
});

test('ads: Google limits are hard (trimmed at a word and flagged), Meta ones are advice (flagged only)',()=>{
 assert.equal(s.fit('Pane a lievito madre ogni mattina a Torino',30),'Pane a lievito madre ogni');assert.equal(s.fit('breve',30),'breve');
 assert.equal([...s.fit('Panetteriaartigianaleconlievitomadre',30)].length,30,'one long word is cut at the limit');
 const long='Pane a lievito madre ogni mattina a Torino',desc='Pane a lievito madre, dolci della tradizione e focacce sfornate ogni mattina dalle 6, anche la domenica';
 const meta='Il pane che aspetta: lievito madre, farine del Piemonte e tanta pazienza. Passa a trovarci in via Roma, ti facciamo assaggiare la focaccia appena uscita dal forno.';
 const [p]=s.parseProposals('annunci',['===PROPOSTA 1===','IDEA: Il forno sotto casa','TITOLI GOOGLE:','- Pane caldo a Torino','- '+long,'DESCRIZIONI GOOGLE:','- '+desc,'META TESTO PRINCIPALE:','- '+meta,'META TITOLO:','- Pane a lievito madre a Torino','===FINE==='].join('\n'));
 assert.deepEqual(p.sections.gtitles,['Pane caldo a Torino','Pane a lievito madre ogni']);
 assert.ok([...p.sections.gdesc[0]].length<=90);assert.equal(p.sections.mtext[0],meta,'Meta text is not cut');
 assert.deepEqual(p.issues.map(i=>[i.section,i.length,i.max,i.trimmed!=null]),[['gtitles',[...long].length,30,true],['gdesc',[...desc].length,90,true],['mtext',[...meta].length,125,false]]);
 assert.match(s.issueText(p.issues[0]),/aveva 42 caratteri \(massimo 30\): accorciato in «Pane a lievito madre ogni», rileggilo/);
 assert.match(s.issueText(p.issues[2]),/caratteri: meglio entro 125/);
 const md=s.toMarkdown('annunci',p,{date:'2026-10-21'});
 assert.match(md,/## Titoli Google\n\n- Pane caldo a Torino \(19\/30\)\n- Pane a lievito madre ogni \(25\/30\)/);
 assert.match(md,/## Da controllare\n\n- «Pane a lievito madre ogni mattina a Torino» aveva 42/);
 assert.match(md,/RADIX prepara solo i testi: le campagne si creano e si gestiscono nel tuo account/);
});

test('technical sheet: every number must come from the data typed or the confirmed facts',()=>{
 assert.deepEqual(s.unverifiedNumbers('Altezza 82 cm\nPeso 4,5 kg\nPrezzo 1.200 euro','altezza 82, peso 4.5, prezzo 1200'),[],'82, 4,5=4.5, 1.200=1200');
 assert.deepEqual(s.unverifiedNumbers('1. Altezza 82 cm\n2. Larghezza 45 cm\nGaranzia 5 anni, 45 cm','Altezza 82 cm'),['45','5'],'list numbering is not data; each number once');
 const values={product:'Sedia Alba',data:'Altezza: 82 cm\nSeduta: 46 cm\nMateriale: faggio massello\nPeso: 4,5 kg',project:{name:'Mobili 1960'}};
 const input=s.inputText('scheda',values);assert.match(input,/Nome: Mobili 1960/);
 const reply=['===PROPOSTA 1===','IDEA: Prima i dati','DESCRIZIONE BREVE:','Sedia in faggio massello, alta 82 cm.','CARATTERISTICHE TECNICHE:','- Altezza: 82 cm','- Seduta: 46 cm','- Peso: 4.5 kg','- Larghezza: 52 cm','- Certificazione: FSC 100%','DA VERIFICARE:','- Larghezza: da verificare','- Profondità in cm (es. 50): da verificare',
  '===PROPOSTA 2===','IDEA: Azienda dal 1960','CARATTERISTICHE TECNICHE:','- Altezza: 82 cm','===FINE==='].join('\n');
 const [a,b]=s.parseProposals('scheda',reply,input);
 assert.deepEqual(a.issues.map(i=>i.text),['52','100'],'invented width and certification share are flagged; «da verificare» list is not checked');
 assert.match(s.issueText(a.issues[0]),/Il numero «52» non compare nei dati che hai scritto: verificalo o toglilo\./);
 assert.deepEqual(b.issues,[],'1960 is a confirmed fact (project name)');
 const md=s.toMarkdown('scheda',a,{project:{name:'Mobili 1960'},date:'2026-10-21'});
 assert.match(md,/## Da controllare\n\n- Il numero «52»/);assert.match(md,/## Da verificare\n\n- Larghezza: da verificare/);
 assert.match(md,/Ogni dato va controllato sulla fonte del cliente/);
 // other services do not check numbers
 assert.deepEqual(s.parseProposals('newsletter','===PROPOSTA 1===\nOGGETTO: 30 anni di pane\nTESTO:\nDal 1995')[0].issues,[]);
});

test('the chosen proposal as Markdown and a file name',()=>{
 const [p]=s.parseProposals('naming',NAMING);
 const md=s.toMarkdown('naming',p,{project:{name:'Forno Rossi'},answers:{style:s.service('naming').questions[1].options[2][1]},date:'2026-10-21'});
 assert.match(md,/^# Nome e slogan · Radici e lievito\n\nProgetto: Forno Rossi · Cosa serve: Nome della marca · Stile del nome: Inventato · Tono: Semplice · 2026-10-21\n/);
 assert.match(md,/## Nomi\n\n- Madia — la madia dove riposa il pane\n- Lievita\n- Crosta & Co\n\n## Slogan\n\n- Il pane che aspetta\n\n## Perché funziona\n\nNomi brevi e caldi\.\nFacili da dire\./);
 assert.match(md,/---\nPrima di usare un nome verifica che il marchio sia libero sulle banche dati UIBM, TMview e WIPO/);assert.match(md,/non garantisce che sia libero/);
 assert.ok(!/## Da controllare/.test(md));
 assert.equal(s.filename('naming',p),'nome-slogan-radici-e-lievito.md');assert.equal(s.filename('scheda',{title:'Città & più'}),'scheda-tecnica-citta-piu.md');assert.equal(s.filename('testi',{}),'testo-proposta.md');
 const nl=s.toMarkdown('newsletter',s.parseProposals('newsletter','===PROPOSTA 1===\nIDEA: X\nOGGETTO: Apriamo la domenica\nTESTO:\nCiao')[0],{date:'2026-10-21'});
 assert.match(nl,/## Oggetto\n\nApriamo la domenica \(19\/60\)/);assert.match(nl,/Il link per disiscriversi e i dati del mittente li aggiunge il sistema di invio/);
});

test('the entry saved in the role thread is an agent document; saving keeps the rest and retries once on a conflict',async()=>{
 const [p]=s.parseProposals('naming',NAMING),md=s.toMarkdown('naming',p,{date:'2026-10-21'});
 const [u,a]=s.savedEntry('naming',p,md,{by:'Anna',at:'2026-10-21T10:00:00.000Z'});
 assert.equal(u.role,'user');assert.equal(u.by,'Anna');assert.equal(u.source,'copy-studio');assert.equal(a.source,'copy-studio');assert.equal(a.agent,'brand-strategist');
 assert.match(u.content,/^Nome e slogan scelto dal pannello Marketing: «Radici e lievito»\.$/);
 const docs=rt.collectDocuments([a]);assert.equal(docs.length,1);assert.equal(docs[0].doc.title,'Nome e slogan · Radici e lievito');assert.equal(docs[0].doc.body,md);
 assert.equal(s.savedEntry('scheda',p,md)[1].agent,'copywriter');assert.equal(s.savedEntry('annunci',p,md)[1].agent,'paid-media');
 class ConflictError extends Error{}
 let stored={schemaVersion:1,prefs:{x:1},conversations:{'seo-geo':[{role:'user',content:'ciao'}],copywriter:Array.from({length:59},(_,i)=>({role:'user',content:'m'+i}))}},saves=0,conflicts=1;
 const ws={ConflictError,bind:(pid,module)=>{assert.equal(pid,'radix');assert.equal(module,'agents');return {load:async()=>JSON.parse(JSON.stringify(stored)),save:async next=>{saves++;if(conflicts-->0)throw new ConflictError('conflitto');stored=next;return {revision:2}}}}};
 assert.deepEqual(await s.saveToProject(ws,'radix','newsletter',p,'# testo modificato',{by:'Anna'}),{revision:2});
 assert.equal(saves,2);assert.deepEqual(stored.conversations['seo-geo'],[{role:'user',content:'ciao'}]);assert.deepEqual(stored.prefs,{x:1});
 const t=stored.conversations.copywriter;assert.equal(t.length,60);assert.equal(t[59].agent,'copywriter');assert.match(t[59].content,/---DOCUMENTO: Newsletter · Radici e lievito---\n# testo modificato\n---FINE DOCUMENTO---/);
 await assert.rejects(s.saveToProject(null,'radix','naming',p,'x'),/non disponibile/);
 await assert.rejects(s.saveToProject({ConflictError,bind:()=>({load:async()=>null,save:async()=>{throw Error('rete')}})},'radix','naming',p,'x'),/rete/);
});

test('the widget confirms before the one AI call, uses the service role with its memory and saves the edited text',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','lib/copy-studio.js'),'utf8');
 assert.match(src,/confirm\('Preparare 3 proposte di «'\+svc\.title\+'» con '\+who\+' AI\? È una sola chiamata AI: usa crediti API\.'\)\)return;\s*lock\(true\)/);
 assert.match(src,/rt\.reply\(\{role:svc\.role,project:ctx\.project,memoryScope:ctx\.memoryScope,messages:\[\{role:'user',content:prompt\}\]\}\)/);
 assert.equal((src.match(/rt\.reply\(/g)||[]).length,1,'one AI call');
 assert.ok(!/fetch\(/.test(src),'no requests of its own');
 assert.match(src,/saveToProject\(ctx\.workspace,ctx\.projectId,id,p,out\.value/,'what is saved is the edited textarea');
 assert.match(src,/writeText\(out\.value\)/);assert.match(src,/dl\.onclick=\(\)=>file\(out\.value,'text\/markdown'/);assert.match(src,/new root\.Blob\(\[text\]/);
 assert.ok(!/out\.readOnly=true/.test(src),'the chosen text is editable');
 assert.match(src,/'tool photo-studio copy-studio'/);
});
