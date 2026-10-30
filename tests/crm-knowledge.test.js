'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const K=require('../sales/crm-knowledge-core.js');
const A=[
 {id:'a1',title:'Reimpostare la password',tags:['accesso','login'],text:'Apra la pagina di accesso e scelga Password dimenticata.'},
 {id:'a2',title:'Copia della fattura',tags:['pagamenti'],text:'Le fatture sono nell’area clienti.'},
 {id:'a3',title:'Tempi di consegna',tags:['spedizione'],text:'Gli ordini partono in 2 giorni. Per accesso al tracciamento usi il link.'}
];

test('words: accents, case, stop words, short words and numbers are ignored; first 5 letters compare',()=>{
 assert.deepEqual(K.words('Non riesco ad ACCEDERE al Portale, la Fattura 2026 è già arrivata?'),['acced','porta','fattu','arriv']);
 assert.deepEqual(K.words('accesso accessi'),['acces']);
 assert.deepEqual(K.words(''),[]);assert.deepEqual(K.words(null),[]);
});

test('search: title beats tags beats text; empty query lists every article by title',()=>{
 const r=K.search(A,'accesso');
 assert.deepEqual(r.map(x=>x.article.id),['a1','a3']);
 assert.equal(r[0].score,3,'tag (2) + text (1)');assert.equal(r[1].score,1);assert.deepEqual(r[0].words,['accesso']);
 assert.deepEqual(K.search(A,'fatture').map(x=>x.article.id),['a2'],'plural matches singular');
 assert.deepEqual(K.search(A,'').map(x=>x.article.id),['a2','a1','a3']);
 assert.deepEqual(K.search(A,'zzzz'),[]);
 assert.equal(K.search(A,'',2).length,2);assert.deepEqual(K.search(null,'x'),[]);
});

test('suggest: keyword overlap with the ticket subject and body, minimum 2 points, top 3',()=>{
 const t={title:'Accesso bloccato',body:'Ho dimenticato la password del portale'};
 const s=K.suggest(A,t);
 assert.equal(s[0].article.id,'a1');assert.ok(s[0].words.includes('password')&&s[0].words.includes('accesso'));
 assert.ok(s.every(x=>x.score>=2));assert.ok(!s.some(x=>x.article.id==='a2'));
 assert.deepEqual(K.suggest(A,{title:'Buongiorno',body:'grazie'}),[]);
 assert.equal(K.suggest(A,{title:'accesso'},{min:1}).length,2);
 assert.equal(K.suggest(A,t,{limit:1}).length,1);assert.deepEqual(K.suggest(A,null),[]);
});

test('merge tags: values from contact, company and ticket; fallback when missing; unknown tags kept',()=>{
 const v=K.mergeValues({title:'Accesso al portale'},{name:'Giulia  Bianchi',company:'ACME (lista)'},{name:'ACME Srl'});
 assert.deepEqual(v,{nome:'Giulia Bianchi',azienda:'ACME Srl',ticket:'Accesso al portale'});
 assert.equal(K.mergeValues({},{name:'X',company:'Da elenco'},null).azienda,'Da elenco');
 const f=K.fill('Gentile {{nome}}, per {{ azienda }} su «{{Ticket}}». {{codice}}',v);
 assert.equal(f.text,'Gentile Giulia Bianchi, per ACME Srl su «Accesso al portale». {{codice}}');
 assert.deepEqual(f.missing,[]);assert.deepEqual(f.unknown,['{{codice}}']);
 const g=K.fill('Gentile {{nome}} di {{azienda}}: {{ticket}} {{nome}}',K.mergeValues(null,{name:'Contatto anonimizzato'},null));
 assert.equal(g.text,'Gentile cliente di la vostra azienda: la sua richiesta cliente');
 assert.deepEqual(g.missing,['nome','azienda','ticket']);
 assert.equal(K.fill(null,{}).text,'');
});

test('insert: at the cursor with blank lines, appended when no cursor, never past the limit',()=>{
 assert.deepEqual(K.insert('','  Testo  '),{value:'Testo',cursor:5,truncated:false});
 assert.equal(K.insert('Gentile Giulia,','Articolo').value,'Gentile Giulia,\n\nArticolo');
 const r=K.insert('Inizio\nFine','X',6,6);assert.equal(r.value,'Inizio\n\nX\n\nFine');assert.equal(r.cursor,9);
 assert.equal(K.insert('abc def','X',3,7).value,'abc\n\nX','selection replaced');
 const t=K.insert('a'.repeat(15),'b'.repeat(20),undefined,undefined,25);assert.equal(t.value.length,25);assert.ok(t.truncated);
 assert.ok(K.insert('a'.repeat(25),'b',undefined,undefined,25).full);
 assert.equal(K.insert('x','').value,'x');
});

test('check and normalize: titles and text required, limits, tags cleaned, broken entries dropped',()=>{
 assert.match(K.check('article',{title:'',text:'x'}).error,/titolo/);
 assert.match(K.check('article',{title:'x',text:' '}).error,/testo/);
 assert.match(K.check('snippet',{title:'x'.repeat(121),text:'y'}).error,/120/);
 assert.match(K.check('snippet',{title:'x',text:'y'.repeat(4001)}).error,/4000/);
 assert.match(K.check('article',[]).error,/oggetto/);
 const a=K.check('article',{id:'kb-1',title:' T ',text:'a\r\nb',tags:' Accesso , accesso,, Login '}).item;
 assert.deepEqual(a,{id:'kb-1',title:'T',text:'a\nb',tags:['accesso','login']});
 assert.match(K.check('article',{id:'bad id!',title:'T',text:'x'}).item.id,/^kb-/);
 assert.equal(K.check('article',{title:'T',text:'x',tags:Array(20).fill(0).map((_,i)=>'t'+i)}).item.tags.length,10);
 assert.deepEqual(Object.keys(K.check('snippet',{title:'T',text:'x',tags:['a']}).item),['id','title','text']);
 const n=K.normalize({articles:[A[0],A[0],{title:'senza testo'},null],snippets:'no'});
 assert.equal(n.articles.length,1,'duplicate id and invalid entries dropped');assert.deepEqual(n.snippets,[]);
 assert.deepEqual(K.normalize('x'),{articles:[],snippets:[]});
});

test('importJson: format checks, invalid entries reported, nothing imported when nothing valid',()=>{
 assert.match(K.importJson('').error,/vuoto/);assert.match(K.importJson('{').error,/JSON valido/);
 assert.match(K.importJson('[]').error,/Formato/);assert.match(K.importJson('{"a":1}').error,/articles/);
 assert.match(K.importJson('{"format":"altro","articles":[]}').error,/export/);
 assert.match(K.importJson('x'.repeat(K.LIMITS.file+1)).error,/1 MB/);
 assert.match(K.importJson('{"articles":[{"title":""}]}').error,/Nessun elemento valido\. Articolo 1: manca il titolo/);
 const r=K.importJson(JSON.stringify({format:'radix-crm-knowledge',articles:[A[0],{title:'x'}],snippets:[{title:'S',text:'Ciao {{nome}}'}]}));
 assert.equal(r.data.articles.length,1);assert.equal(r.data.snippets.length,1);assert.deepEqual(r.skipped,['Articolo 2: manca il testo']);
 assert.deepEqual(K.importJson('{"articles":{},"snippets":[{"title":"S","text":"t"}]}').skipped,['«articles» non è un elenco']);
});

test('merge and export: same id replaces, new ids added, limits respected; export reimports unchanged',()=>{
 const m=K.merge({articles:[A[0]],snippets:[]},{articles:[{...A[0],title:'Nuovo titolo'},A[1]],snippets:[]});
 assert.equal(m.added,1);assert.equal(m.replaced,1);assert.equal(m.data.articles[0].title,'Nuovo titolo');
 const full={articles:Array.from({length:K.LIMITS.articles},(_,i)=>({id:'k'+i,title:'T'+i,text:'x'})),snippets:[]};
 assert.equal(K.merge(full,{articles:[{id:'nuovo',title:'T',text:'x'}]}).dropped,1);
 const out=K.exportJson({articles:A,snippets:K.EXAMPLES.snippets},'ws-1',Date.parse('2026-10-19T08:00:00Z'));
 const d=JSON.parse(out);assert.equal(d.format,'radix-crm-knowledge');assert.equal(d.workspace,'ws-1');assert.equal(d.exported_at,'2026-10-19T08:00:00.000Z');
 const back=K.importJson(out);assert.deepEqual(back.data,K.normalize({articles:A,snippets:K.EXAMPLES.snippets}));assert.deepEqual(back.skipped,[]);
 assert.equal(K.storageKey('ws-1'),'radix-crm-knowledge:ws-1');
});

test('examples are valid and use every merge tag',()=>{
 const n=K.normalize(K.EXAMPLES);assert.equal(n.articles.length,3);assert.equal(n.snippets.length,2);
 const all=K.EXAMPLES.snippets.map(s=>s.text).join(' ');for(const t of ['nome','azienda','ticket'])assert.ok(all.includes('{{'+t+'}}'));
});

test('page wiring: assets at the end of their groups, hooks in reply block and tickets section, no AI, storage guarded',()=>{
 const html=fs.readFileSync('radix-sales.html','utf8');
 // Order, not exact neighbours: other CRM PRs add their own tags to the same one-line head.
 const at=t=>{const i=html.indexOf(t);assert.ok(i>=0,t);return i};
 assert.ok(at('<link rel="stylesheet" href="sales/sales-nav.css">')<at('<link rel="stylesheet" href="sales/crm-knowledge.css">'));
 assert.ok(at('<script src="sales/crm-tools.js" defer></script>')<at('<script src="sales/crm-knowledge-core.js"></script>'));
 assert.ok(at('<script src="sales/crm-knowledge-core.js"></script>')<at('<script src="sales/crm-knowledge.js" defer></script>'));
 assert.ok(at('<script src="sales/crm-knowledge.js" defer></script>')<at('</head>'));
 assert.ok(fs.readFileSync('sales/crm-ticket-reply.js','utf8').includes('RadixCrmKnowledge.attach(box,area,ticket,load)'));
 assert.ok(fs.readFileSync('sales/crm-tools.js','utf8').includes("entity==='tickets'&&window.RadixCrmKnowledge"));
 const ui=fs.readFileSync('sales/crm-knowledge.js','utf8'),core=fs.readFileSync('sales/crm-knowledge-core.js','utf8');
 for(const src of [ui,core])assert.doesNotMatch(src,/fetch\(|\/api\/chat|XMLHttpRequest/);
 assert.match(ui,/regola fissa, non AI/);assert.match(ui,/Inserisci nella risposta/);
 const uses=(ui.match(/localStorage\.\w+/g)||[]).length;assert.equal(uses,2);
 assert.match(ui,/try\{const raw=localStorage\.getItem/);assert.match(ui,/try\{localStorage\.setItem/);
 const css=fs.readFileSync('sales/crm-knowledge.css','utf8');
 assert.equal((css.match(/:root\s*\{/g)||[]).length,1);
 const colours=css.replace(/:root\{[\s\S]*?\}/,'').match(/#[0-9a-f]{3,8}\b(?![\w-])/gi)||[];
 assert.deepEqual(colours,[],'colours only in the :root block');
 for(const m of css.match(/:root\{[\s\S]*?\}/)[0].matchAll(/--kb-[\w-]+:([^;}]+)/g))assert.match(m[1],/^var\(--crm-[\w-]+,/);
});
