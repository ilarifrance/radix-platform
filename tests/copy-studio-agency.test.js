'use strict';
// The agency-grade Studio Testi services (comunicato, persona, concorrenza, sequenze, tono, influencer, sms) and their
// automatic checks (lib/copy-checks.js). Fake AI replies only (tests/copy-agency-fixtures.js): no network, no credits.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const s=require('../lib/copy-studio.js'),K=require('../lib/copy-checks.js'),F=require('../tests/copy-agency-fixtures.js');
const NEW=['comunicato','persona','concorrenza','sequenze','tono','influencer','sms'];
const values=id=>({...F.VALUES[id],project:F.PROJECT});
const parse=(id,reply,answers)=>{const v=values(id);return s.parseProposals(id,reply==null?F.REPLIES[id]:reply,{text:s.inputText(id,v,answers||{}),values:v,answers:answers||{}})};
const issues=p=>p.issues.map(s.issueText);
const has=(p,re)=>issues(p).some(x=>re.test(x));
const root=path.join(__dirname,'..');

// ---- the checks ----
test('SMS: GSM-7 counts 160 in one SMS and 153 per part; accented lowercase stays GSM-7, È and ’ force UCS-2 (70, then 67)',()=>{
 const a=K.smsInfo('x'.repeat(160));assert.deepEqual([a.encoding,a.units,a.segments],['GSM-7',160,1]);
 assert.equal(K.smsInfo('x'.repeat(161)).segments,2);assert.equal(K.smsInfo('x'.repeat(306)).segments,2);assert.equal(K.smsInfo('x'.repeat(307)).segments,3);
 const it=K.smsInfo('Più già perché così è là: ù ì ò é à');assert.equal(it.encoding,'GSM-7','à è é ì ò ù are in the GSM 03.38 basic set');assert.deepEqual(it.forcing,[]);
 const cap=K.smsInfo('È pronto');assert.equal(cap.encoding,'UCS-2');assert.deepEqual(cap.forcing,['È']);assert.equal(cap.single,70);
 assert.equal(K.smsInfo('È'+'x'.repeat(69)).segments,1);assert.equal(K.smsInfo('È'+'x'.repeat(70)).segments,2);assert.equal(K.smsInfo('È'+'x'.repeat(134)).segments,3,'135 UCS-2 units: 67 per part');
 assert.equal(K.smsInfo('l’assaggio').encoding,'UCS-2','the typographic apostrophe');assert.equal(K.smsInfo("l'assaggio").encoding,'GSM-7');
 assert.equal(K.smsInfo('«ciao»').encoding,'UCS-2');
 const euro=K.smsInfo('10€ [x]');assert.equal(euro.encoding,'GSM-7');assert.equal(euro.units,10,'€ [ ] take 2 septets each');
 assert.equal(K.smsInfo('😀').units,2,'an emoji is 2 UTF-16 units');assert.equal(K.smsInfo('').segments,0);
 assert.equal(K.smsLabel(K.smsInfo('x'.repeat(161))),'161/160 caratteri GSM-7 · 2 SMS');
});

test('SMS sender (11 characters, no accents) and opt-out text',()=>{
 assert.deepEqual(K.senderIssues('FornoRossi'),[]);assert.deepEqual(K.senderIssues('Forno Rossi'),[],'11 with the space');
 assert.match(K.senderIssues('FornoRossiTO')[0],/12 caratteri: massimo 11/);assert.match(K.senderIssues('Caffè')[0],/caratteri non ammessi/);
 assert.match(K.senderIssues('3331234567')[0],/numero di telefono/);assert.match(K.senderIssues('')[0],/manca il mittente/);
 for(const t of ['STOP al 339 0000000','Per non ricevere più SMS rispondi','Disiscriviti: link'])assert.ok(K.hasOptOut(t),t);
 assert.ok(!K.hasOptOut('Ti aspettiamo sabato'));
});

test('words of the lead; superlatives allowed only next to a number the person gave',()=>{
 assert.equal(K.words('Sabato 8 novembre Forno Rossi apre — in via Po 12.'),10,'the dash is not a word');assert.equal(K.words(''),0);
 const input='Nel 2025 abbiamo vinto il premio Pane d’oro';
 const rel=K.superlatives('Il pane più buono della città.',input);assert.equal(rel.length,1);assert.match(rel[0].word,/più buono della/);
 assert.equal(K.superlatives('Il miglior forno di Torino.\nUn pane straordinario.',input).length,2);
 assert.equal(K.superlatives('Nel 2025 il forno più premiato del Piemonte.',input).length,0,'proved by a number the person wrote');
 assert.equal(K.superlatives('Nel 2019 il forno più premiato del Piemonte.',input).length,1,'a number nobody wrote does not prove it');
 assert.equal(K.superlatives('Il titolo senza punto\nUn pane buonissimo',input).length,1,'each line is its own sentence');
 assert.equal(K.superlatives('Il pane è buono e costa il giusto.',input).length,0);
});

test('quotes: only from the people named, surname alone allowed, another first name is not',()=>{
 assert.deepEqual(K.quotable('Mario Rossi, titolare — il pane come una volta\nAnna Bianchi (responsabile vendite); Luca Verdi: socio'),['Mario Rossi','Anna Bianchi','Luca Verdi']);
 assert.deepEqual(K.quotable(''),[]);
 const names=['Mario Rossi'];
 assert.deepEqual(K.quoteIssues('«Vogliamo fare il pane come una volta» — Mario Rossi, titolare',names),[]);
 assert.deepEqual(K.quoteIssues('«Vogliamo fare il pane come una volta», ha detto Rossi.',names),[],'surname only');
 assert.equal(K.quoteIssues('«Per noi è un sogno che si avvera» — Giulia Rossi, figlia',names)[0].reason,'attribuita a chi non hai indicato');
 assert.equal(K.quoteIssues('«Il pane è la nostra vita da sempre» — Luca Verdi',names).length,1);
 assert.equal(K.quoteIssues('«Il pane è la nostra vita da sempre» — Mario Rossi',[])[0].reason,'nessuna persona da citare indicata');
 assert.deepEqual(K.quoteIssues('Il forno «Forno Rossi» apre',[]),[],'a short quoted name is not a quote');
});

test('«dal cliente» / «ipotesi da verificare» on every trait line; client lines cannot carry new numbers',()=>{
 const t='Chi è: Luca, impiegato (dal cliente)\nObiettivi: pranzo veloce\nCanali: Google (ipotesi da verificare)\nMessaggio: Il pranzo in 5 minuti\n### Persona\n- Età: 30-45 anni';
 assert.deepEqual(K.unlabelled(t,['Messaggio']),['Obiettivi: pranzo veloce','Età: 30-45 anni']);
 assert.deepEqual(K.unlabelled('Panificio Verdi | prezzi bassi | ? | dal cliente\nBottega | Instagram | ?'),['Bottega | Instagram | ?'],'table rows too');
 assert.deepEqual(K.clientNumbers('Problemi: il 45% compra al supermercato (dal cliente)\nCanali: 3 social (ipotesi da verificare)','due bar, 20 kg'),['45']);
});

test('CRM merge tags: the tags of sales/lead-newsletter-core.js (no AI {{gancio}}); foreign placeholders flagged',()=>{
 const N=require('../sales/lead-newsletter-core.js');
 assert.deepEqual([...K.MERGE_TAGS],N.TAGS.filter(t=>t!=='gancio'));
 assert.deepEqual(K.tagIssues('Ciao {{nome|amico}}, {{ azienda }} a {{citta}} e {{città}}'),{unknown:[],foreign:[]});
 assert.deepEqual(K.tagIssues('Ciao {{first_name}} {{gancio}} [Nome] {nome} *|FNAME|* %nome%'),{unknown:['{{first_name}}','{{gancio}}'],foreign:['[Nome]','{nome}','*|FNAME|*','%nome%']});
 // the CRM fills what the sequence writes: no tag left unknown
 assert.deepEqual(N.unknownTags('Ciao {{nome|Ciao}}, ti aspettiamo a {{città|Torino}} con {{azienda}}'),[]);
 assert.equal(N.render('Ciao {{nome|amico}}',{nome:'Luca'}).text,'Ciao Luca');
});

test('email sequences read back block by block and written as CSV for Italian Excel',()=>{
 const t='### Email 1 · Giorno 0\nScopo: accogliere\nOggetto: «Benvenuto» (20/60)\nAnteprima: Ciao\nTesto:\nRiga uno\n\nRiga due\nInvito: Scopri\n**Email 2 - Giorno 3**\nOggetto: =SOMMA(1;2)\nTesto: breve\nCTA: Vai';
 const l=K.parseSequence(t);
 assert.deepEqual(l.map(e=>[e.n,e.invio,e.subject,e.preheader,e.body,e.cta,e.goal]),[[1,'Giorno 0','Benvenuto','Ciao','Riga uno\n\nRiga due','Scopri','accogliere'],[2,'Giorno 3','=SOMMA(1;2)','','breve','Vai','']]);
 const csv=K.sequenceCsv(l);
 assert.ok(csv.startsWith('﻿N;Invio;Oggetto;Anteprima;Testo;Invito;Scopo\r\n'));
 assert.match(csv,/\r\n1;Giorno 0;Benvenuto;Ciao;"Riga uno\n\nRiga due";Scopri;accogliere\r\n/);
 assert.match(csv,/\r\n2;Giorno 3;"'=SOMMA\(1;2\)";;breve;Vai;$/,'formula guarded and quoted');
 assert.deepEqual(K.parseSequence('niente email qui'),[]);
});

test('competitors, sites nobody gave, mandatory mentions and the advertising label',()=>{
 assert.deepEqual(K.competitors(F.VALUES.concorrenza.rivals),[{name:'Panificio Verdi',url:'www.panificioverdi.it',notes:'prezzi bassi, aperto anche la sera'},{name:'Bottega del Pane',url:'bottegadelpane.it',notes:'molto attivi su Instagram'},{name:'Supermercato Centro',url:'',notes:'reparto pane industriale, aperto fino alle 21'}]);
 assert.deepEqual(K.competitors('1. https://www.verdi.it/pane'),[{name:'https://www.verdi.it/pane',url:'https://www.verdi.it/pane',notes:''}]);
 assert.deepEqual(K.unknownUrls('Vedi https://www.panificioverdi.it/prezzi e bottega-pane.com, scrivi a info@bottegadelpane.it',F.VALUES.concorrenza.rivals),['bottega-pane.com']);
 assert.deepEqual(K.mentionsIn('@fornorossi #biscottirossi, www.fornorossi.it.'),['@fornorossi','#biscottirossi','www.fornorossi.it']);
 for(const t of ['#adv in prima riga','Scrivi «Pubblicità»','Prodotto inviato da Forno Rossi','#ad'])assert.ok(K.hasDisclosure(t),t);
 assert.ok(!K.hasDisclosure('Ringrazia il forno alla fine'));assert.ok(!K.hasDisclosure('#advertisingweek'.replace('advertising','x')));
});

// ---- the services ----
test('the seven services: prompt builder with their structure rules and the person’s own constraints',()=>{
 for(const id of NEW){const x=s.service(id),p=s.proposalsPrompt(id,{},values(id));assert.ok(x.lint,id+' has checks');assert.ok(x.note,id+' note');
  assert.match(p,/===PROPOSTA 3===/);assert.match(p,/Non inventare numeri, prezzi/);for(const r of x.rules)assert.ok(p.includes(r),id)}
 const c=s.proposalsPrompt('comunicato',{},values('comunicato'));
 assert.match(c,/titolo, sottotitolo, luogo e data, attacco con le 5W \(chi, cosa, quando, dove, perché\), corpo a piramide rovesciata, citazione, profilo aziendale, contatti stampa/);
 assert.match(c,/Puoi citare solo queste persone, con nome e ruolo come scritti qui: Mario Rossi\. Non inventare altre persone/);
 assert.match(c,/In LUOGO E DATA scrivi esattamente: Torino, 3 novembre 2026\./);assert.match(c,/entro 60 parole/);assert.match(c,/Niente superlativi/);
 assert.match(s.proposalsPrompt('comunicato',{},{...values('comunicato'),people:''}),/Nessuna persona da citare: non scrivere citazioni/);
 const pe=s.proposalsPrompt('persona',{},values('persona'));assert.match(pe,/«\(ipotesi da verificare\)»/);assert.match(pe,/PERSONA 1:\n\(le righe «Chi è: …», «Obiettivi: …», «Problemi: …», «Obiezioni: …», «Canali: …», «Messaggio: …»/);
 const co=s.proposalsPrompt('concorrenza',{},values('concorrenza'));assert.match(co,/Concorrenti da confrontare \(3\): Panificio Verdi \(www\.panificioverdi\.it\); Bottega del Pane \(bottegadelpane\.it\); Supermercato Centro\./);
 assert.match(co,/nessuno ha letto i loro siti/);assert.match(co,/una lettura difensiva, una d’attacco e una di nicchia/);
 assert.match(s.proposalsPrompt('concorrenza',{reading:s.service('concorrenza').questions[1].options[3][1]},values('concorrenza')),/stessa lettura con assi della mappa diversi/);
 assert.throws(()=>s.proposalsPrompt('concorrenza',{},{...values('concorrenza'),rivals:'a\nb\nc\nd\ne\nf'}),/al massimo 5 concorrenti: ne hai scritti 6/);
 const sq=s.proposalsPrompt('sequenze',{count:'5 email'},values('sequenze'));assert.match(sq,/esattamente 5 email, numerate da 1 a 5/);assert.match(sq,/\{\{nome\}\}, \{\{cognome\}\}, \{\{azienda\}\}/);assert.match(sq,/\{\{nome\|Ciao\}\}/);
 assert.match(s.proposalsPrompt('sequenze',{},values('sequenze')),/esattamente 3 email/,'3 by default');
 assert.match(s.proposalsPrompt('tono',{},values('tono')),/Non usare mai queste parole, tranne in PAROLE NO: eccellenza, top\./);
 assert.match(s.proposalsPrompt('tono',{},values('tono')),/LINKEDIN:\n\(le righe «Registro: …»/);
 const inf=s.proposalsPrompt('influencer',{},values('influencer'));assert.match(inf,/Codice di Autodisciplina IAP \(Digital Chart\) e le linee guida AGCOM/);assert.match(inf,/«Pubblicità» o «#adv»/);assert.match(inf,/Le menzioni obbligatorie sono esattamente: @fornorossi #biscottirossi\./);
 const sm=s.proposalsPrompt('sms',{},values('sms'));assert.match(sm,/al massimo 160 caratteri/);assert.match(sm,/Usa solo caratteri GSM-7/);assert.match(sm,/Ogni SMS finisce con: STOP SMS al 339 0000000\./);assert.match(sm,/Usa il link così com’è: fornorossi\.it\/po\./);
 assert.throws(()=>s.proposalsPrompt('sms',{},{...values('sms'),sender:'Forno Rossi Torino'}),/Correggi «Mittente \(massimo 11 caratteri\)»: il mittente «Forno Rossi Torino» ha 18 caratteri/);
 assert.throws(()=>s.proposalsPrompt('sms',{},{...values('sms'),optout:''}),/Compila «Testo per disiscriversi»/);
});

test('comunicato: lead ≤ 60 words, superlatives without data, quotes only from the names given, sections present',()=>{
 const [a,b,c]=parse('comunicato');
 assert.deepEqual(a.issues,[],'the clean release');assert.equal(a.sections.dateline,'Torino, 3 novembre 2026');
 assert.ok(has(b,/«miglior» è un superlativo senza un dato/));assert.ok(has(b,/«Per noi è un sogno.*attribuita a chi non hai indicato: puoi citare solo Mario Rossi/));assert.ok(has(b,/Il numero «1\.200»/));
 assert.ok(has(c,/L’attacco ha 69 parole: massimo 60/));
 const [n]=parse('comunicato','===PROPOSTA 1===\nIDEA: X\nATTACCO:\nSabato apre il forno.\nCORPO:\nTesto.\nCITAZIONE:\nnessuna citazione');
 assert.equal(n.sections.quote,undefined,'«nessuna citazione» is dropped');
 assert.deepEqual(issues(n),['Manca il luogo e la data.','Manca il profilo aziendale.','Manca il contatto stampa.']);
 const md=s.toMarkdown('comunicato',a,{project:F.PROJECT,date:'2026-11-03'});
 assert.match(md,/## Titolo\n\nForno Rossi apre il secondo forno in via Po a Torino \(52\/90\)\n\n## Sottotitolo/);assert.match(md,/## Luogo e data\n\nTorino, 3 novembre 2026\n\n## Attacco/);
 assert.match(md,/## Profilo aziendale\n\nForno Rossi è/);assert.match(md,/## Contatti stampa\n\nAnna Bianchi/);assert.match(md,/fai approvare testo e citazione/);
});

test('persona: 3 personas with goals, problems, objections, channels, message; every inferred trait labelled',()=>{
 const [a,b,c]=parse('persona');
 assert.deepEqual(a.issues,[]);assert.match(a.sections.p1,/^Chi è: Luca, impiegato degli uffici di via Roma \(dal cliente\)\nObiettivi:/);assert.equal(a.sections.journey.length,2);
 assert.ok(has(b,/Ci sono 2 persona su 3/));assert.ok(has(b,/Persona 1: «Età: 30-45 anni» non dice se viene dal cliente o se è un’ipotesi da verificare/));
 assert.ok(has(b,/Persona 2: il numero «45» è segnato «dal cliente» ma non è nei dati che hai scritto/));
 assert.deepEqual(c.issues,[]);
 const [m]=parse('persona','===PROPOSTA 1===\nPERSONA 1:\nChi è: Luca (dal cliente)\nCanali: Google (ipotesi da verificare)');
 assert.deepEqual(issues(m).filter(x=>/manca la riga/.test(x)),['Persona 1: manca la riga «Obiettivi».','Persona 1: manca la riga «Problemi».','Persona 1: manca la riga «Obiezioni».','Persona 1: manca la riga «Messaggio».']);
 assert.match(s.toMarkdown('persona',a,{date:'x'}),/## Persona 1\n\nChi è: Luca[^\n]*\n[\s\S]*## Percorso\n\n- Scoperta/);
});

test('concorrenza: table of strengths and weaknesses, every row labelled, no invented sites; no web fetch',()=>{
 const [a,b,c]=parse('concorrenza');
 assert.deepEqual(a.issues,[]);assert.equal(a.sections.table.length,3,'the Markdown header and separator rows are dropped');assert.equal(a.sections.table[0],'Panificio Verdi | prezzi bassi, aperto anche la sera | qualità del pane da verificare | dal cliente');
 assert.ok(has(b,/Confronto: «Bottega del Pane \| Instagram con 12\.000 follower/));assert.ok(has(b,/Mappa: «Panificio Verdi: comodo, qualità media» non dice/));
 assert.ok(has(b,/Nel confronto manca «Supermercato Centro»/));assert.ok(has(b,/Il sito «bottega-pane\.com» non è tra quelli che hai scritto/));assert.ok(has(b,/Il numero «4,2»/));
 assert.deepEqual(c.issues,[]);
 const md=s.toMarkdown('concorrenza',a,{date:'x'});
 assert.match(md,/## Confronto\n\n\| Concorrente \| Punti di forza \| Punti deboli \| Fonte \|\n\|---\|---\|---\|---\|\n\| Panificio Verdi \| prezzi bassi, aperto anche la sera \| qualità del pane da verificare \| dal cliente \|/);
 assert.match(md,/RADIX non ha letto i siti dei concorrenti/);
 const src=fs.readFileSync(path.join(root,'lib/copy-checks.js'),'utf8');assert.ok(!/fetch\(|XMLHttpRequest|RadixAgents/.test(src),'the checks read nothing from the network');
});

test('sequenze: count, timing, subject ≤ 60, preheader, CTA and CRM merge tags; CSV from the edited text',()=>{
 const [a,b,c]=parse('sequenze');
 assert.deepEqual(a.issues,[]);assert.deepEqual(c.issues,[]);
 assert.deepEqual(issues(b).slice(0,6),['La sequenza ha 2 email invece di 3.','Email 1: l’oggetto ha 79 caratteri: massimo 60.','Email 2: manca l’anteprima.','Email 2: manca l’invito all’azione.','Il campo {{first_name}} non esiste nel CRM: usa {{nome}}, {{azienda}}, {{città}}…','«[Nome]» non è un campo del CRM: scrivilo come {{nome}}.']);
 assert.ok(has(b,/Il numero «20»/),'an invented discount');assert.ok(!has(a,/Il numero «(0|3|7)»/),'days are not data');
 const [five]=parse('sequenze',F.REPLIES.sequenze,{count:'5 email'});assert.ok(has(five,/La sequenza ha 3 email invece di 5/));
 const md=s.toMarkdown('sequenze',a,{project:F.PROJECT,date:'2026-10-22'});
 assert.match(md,/## Sequenza\n\n### Email 1 · Giorno 0\nScopo: accogliere\nOggetto: \{\{nome\|Ciao\}\}, benvenuto da Forno Rossi/);
 const csv=s.csvOf('sequenze',md.replace('Scopri il forno','Scopri il nostro forno'));
 const rows=csv.split('\r\n');assert.equal(rows.length,4);assert.equal(rows[0],'﻿N;Invio;Oggetto;Anteprima;Testo;Invito;Scopo');
 assert.match(rows[1],/^1;Giorno 0;\{\{nome\|Ciao\}\}, benvenuto da Forno Rossi;Il pane a lievito madre[^;]*;"Ciao \{\{nome\|\}\},\n/);assert.match(rows[1],/;Scopri il nostro forno;accogliere$/,'the edit is in the CSV');
 assert.match(rows[3],/^3;Giorno 7;Ti aspettiamo per una degustazione gratuita;/);
 assert.equal(s.csvOf('comunicato','x'),null,'only sequences have a CSV');
 assert.equal(s.filename('sequenze',a,'csv'),'sequenza-email-benvenuto-caldo.csv');
 const card=s.service('sequenze').sections.find(x=>x.key==='emails').summary(a.sections.emails);
 assert.deepEqual(card,['Email 1 · Giorno 0 — {{nome|Ciao}}, benvenuto da Forno Rossi (39/60)','Email 2 · Giorno 3 — Come nasce il nostro pane (25/60)','Email 3 · Giorno 7 — Ti aspettiamo per una degustazione gratuita (43/60)']);
});

test('tono: a grid per channel (site, LinkedIn, Instagram, email, WhatsApp) with do, don’t and an example line',()=>{
 const [a,b,c]=parse('tono');
 assert.deepEqual(a.issues,[]);assert.deepEqual(c.issues,[]);
 assert.deepEqual(issues(b),['LinkedIn: manca la riga «Sì».','LinkedIn: manca la riga «No».','Manca il canale WhatsApp.','Il tratto «Tecnico: spiega le farine» non dice cosa non è.','«eccellenza» è tra le parole da non usare, ma compare nella guida.','«top» è tra le parole da non usare, ma compare nella guida.']);
 const lei=s.service('tono').questions[0].options[1][1];
 const [x]=parse('tono',F.REPLIES.tono,{address:lei});assert.ok(has(x,/Instagram: l’esempio dà del tu, ma hai scelto il lei/));
 const md=s.toMarkdown('tono',a,{date:'x'});
 assert.match(md,/## LinkedIn\n\nRegistro:[^\n]*\nSì:[^\n]*\nNo:[^\n]*\nEsempio:/);assert.match(md,/## WhatsApp\n/);assert.match(md,/## Parole sì\n\n- lievito madre/);assert.match(md,/## Parole no\n\n- eccellenza → buono/);
});

test('influencer: objectives, deliverables, mandatory mentions, #adv / «Pubblicità» label, do and don’t, timeline, KPI, rights',()=>{
 const [a,b,c]=parse('influencer');
 assert.deepEqual(a.issues,[]);assert.deepEqual(c.issues,[]);
 assert.deepEqual(a.sections.mentions,['@fornorossi','#biscottirossi','«Pubblicità» oppure #adv nella prima riga'],'hashtags survive the list parser');
 assert.deepEqual(issues(b),['La trasparenza non dice la dicitura da usare: «Pubblicità» o «#adv» (per un omaggio «Prodotto inviato da …»).','La dicitura di pubblicità («Pubblicità» o «#adv») non è tra le menzioni obbligatorie.','Mancano i diritti di utilizzo dei contenuti.','Manca la menzione obbligatoria «@fornorossi».','Il numero «5.000» non compare nei dati che hai scritto: verificalo o toglilo.']);
 const md=s.toMarkdown('influencer',a,{date:'x'});
 for(const h of ['Obiettivo','Consegne','Menzioni obbligatorie','Trasparenza','Da fare','Da non fare','Tempi','KPI','Diritti di utilizzo'])assert.ok(md.includes('\n## '+h+'\n'),h);
 assert.match(md,/verifica le regole aggiornate prima di firmare/);
});

test('sms: 3 variants with characters, encoding and segments shown; sender ≤ 11; opt-out; live count of the edited text',()=>{
 const [a,b,c]=parse('sms');
 assert.deepEqual(a.issues,[]);assert.equal(a.sections.sender,'FornoRossi');
 assert.deepEqual(issues(b),['I caratteri «È» «’» non sono GSM-7: l’SMS passa in UCS-2 e il limite scende a 70 caratteri. Sostituiscili (’ con \', « » con ", È con E\').','L’SMS conta 160 caratteri UCS-2: partono 3 SMS e si pagano tutti. Accorcialo entro 70.']);
 assert.equal(c.sections.sender,'Forno Rossi','trimmed to 11 at a word');assert.ok(has(c,/partono 2 SMS/));assert.ok(has(c,/Il numero «50»/));
 const [n]=parse('sms','===PROPOSTA 1===\nMITTENTE: FornoRossi\nSMS:\nSabato 8 novembre apriamo! www.forno-rossi.com');
 assert.deepEqual(issues(n),['Manca il testo per disiscriversi.','Manca il link che hai indicato.','Il link «forno-rossi.com» non è quello che hai scritto: correggilo.']);
 const sec=s.service('sms').sections.find(x=>x.key==='sms');assert.equal(sec.meter(a.sections.sms),'140/160 caratteri GSM-7 · 1 SMS');assert.equal(sec.over(b.sections.sms),true);
 const md=s.toMarkdown('sms',a,{date:'x'});
 assert.match(md,/## SMS\n\nForno Rossi: sabato 8 novembre[^\n]*0000000\n\nConteggio: 140\/160 caratteri GSM-7 · 1 SMS\n/,'the count on its own line: the SMS copies clean');
 assert.equal(s.liveOf('sms',md),'SMS modificato: 140/160 caratteri GSM-7 · 1 SMS');
 assert.equal(s.liveOf('sms',md.replace('Ti aspettiamo:','È il momento:')),'SMS modificato: 139/70 caratteri UCS-2 · 3 SMS · non GSM-7: È','an accented capital in the edit');
 assert.equal(s.liveOf('comunicato','x'),'','other services have no live count');
 assert.equal(s.plainText(md).split('\n')[0],'SMS · Diretto all\'evento');assert.ok(!/^#/m.test(s.plainText(md)));
});

test('saved like every copy service: in the role thread, as an agent document',()=>{
 const [p]=parse('influencer'),md=s.toMarkdown('influencer',p,{date:'x'});
 assert.equal(s.savedEntry('influencer',p,md)[1].agent,'social-media-manager');assert.equal(s.savedEntry('persona',p,md)[1].agent,'brand-strategist');assert.equal(s.savedEntry('sms',p,md)[1].agent,'copywriter');
 assert.match(s.savedEntry('comunicato',p,md)[1].content,/---DOCUMENTO: Comunicato stampa · La colazione senza zucchero---/);
});

test('the widget offers .md, .txt and, for sequences, .csv from the edited text; the live count; the page loads the checks first',()=>{
 const src=fs.readFileSync(path.join(root,'lib/copy-studio.js'),'utf8');
 assert.match(src,/txtBtn\.onclick=\(\)=>file\(plainText\(out\.value\),'text\/plain',filename\(id,p,'txt'\)\)/);
 assert.match(src,/if\(svc\.csv\)\{const csvBtn=button\('Scarica \.csv'\);acts\.append\(csvBtn\);csvBtn\.onclick=\(\)=>file\(csvOf\(id,out\.value\),'text\/csv'/);
 assert.match(src,/out\.addEventListener\('input',upd\)/);
 assert.match(src,/parseProposals\(id,r&&r\.text,\{text:inputText\(id,values,asked\.answers\),values,answers:asked\.answers\}\)/);
 assert.equal((src.match(/rt\.reply\(/g)||[]).length,1,'still one AI call');
 const html=fs.readFileSync(path.join(root,'agency/crea.html'),'utf8'),at=x=>html.indexOf(x);
 assert.ok(at('/lib/copy-checks.js')>0&&at('/lib/copy-checks.js')<at('/lib/copy-studio.js'),'checks load before the studio');
 assert.match(fs.readFileSync(path.join(root,'shell/crea.css'),'utf8'),/\.cr-panel \.copy-studio \.cs-live/);
});

test('the panel: one card per new service, in Strategia, Brand, Social e contenuti and the new Email e SMS group, each with its icon',()=>{
 const core=require('../agency/crea-core.js'),look=require('../agency/marketing-look.js');
 const want={persona:'Strategia',concorrenza:'Strategia',tono:'Brand',comunicato:'Social e contenuti',influencer:'Social e contenuti',newsletter:'Email e SMS',sequenze:'Email e SMS',sms:'Email e SMS'};
 for(const [id,g] of Object.entries(want)){const c=core.card(id);assert.equal(c.group,g,id);assert.equal(c.inline,'copy:'+id,id);assert.equal(c.title,s.service(id).title,id);assert.ok(look.has(look.CARDS[id]),id+' icon')}
 assert.deepEqual(core.fromQuery('?area=email'),{group:'Email e SMS',open:''});assert.deepEqual(core.fromQuery('?open=sms'),{group:'Email e SMS',open:'sms'});
 assert.equal(look.AREAS.email.icon,'mail');assert.match(core.card('concorrenza').hint,/ipotesi/);assert.match(core.card('concorrenza').hint,/Confronto con i siti dei concorrenti/,'the facts read from the sites are in the new studio (lib/competitor-studio.js)');
});
