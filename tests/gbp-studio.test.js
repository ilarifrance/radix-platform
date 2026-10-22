'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const G=require('../lib/gbp-studio.js'),CSV=require('../sales/crm-csv-core.js');
const root=path.join(__dirname,'..');
const VALUES={kind:'Panificio artigianale',area:'Torino, San Salvario',services:'Pane a lievito madre\nTorte su ordinazione',strengths:'Forno a legna dal 1987, aperti la domenica',contacts:'tel. 011 555 1234',facts:'Farine di mulini piemontesi.'};
const ctxOf=v=>({kind:v.kind,area:v.area,input:G.inputText(v)});
const DESC='Forno Aurora è un panificio artigianale a Torino, in San Salvario: pane a lievito madre cotto nel forno a legna dal 1987. Prepariamo torte su ordinazione e siamo aperti la domenica.';

test('limits and validation: Google’s numbers, six questions, required fields',()=>{
 assert.equal(G.LIMITS.description,750);assert.equal(G.LIMITS.keywordWithin,250);assert.equal(G.LIMITS.secondary,9);assert.equal(G.LIMITS.reply,4096);
 assert.equal(G.LIMITS.serviceDescription,300);assert.equal(G.LIMITS.qa,10);assert.equal(G.LIMITS.postTitle,58);assert.equal(G.LIMITS.post,1500);
 assert.ok(G.FIELDS.length+1<=6,'at most six questions (fields plus tone)');
 assert.deepEqual(G.POST_TYPES.map(t=>t[0]),['offerta','novita','evento','aggiornamento']);
 assert.deepEqual(G.normalize({tone:'boh'}),{tone:'Cordiale'});assert.deepEqual(G.normalize({tone:'Elegante'}),{tone:'Elegante'});
 assert.throws(()=>G.validate({...VALUES,area:''}),/Città o zona servita/);
 assert.throws(()=>G.validate({...VALUES,services:'x'}),/Servizi principali/);
 assert.equal(G.validate({...VALUES,strengths:'',contacts:''}),true,'strengths and contacts are optional');
 assert.deepEqual(G.prefill({kind:'Progetto Agency',positioning:'Pane vero'}),{kind:'',area:'',services:'',strengths:'Pane vero',contacts:''});
 assert.equal(G.prefill({kind:'Panificio'}).kind,'Panificio');
});

test('description rules: no links, phone numbers or e-mails (removed with their sentence), no offers, keyword in the first 250',()=>{
 const s=G.sanitizeDescription('Panificio a Torino.\n\nChiamaci al 011 555 1234 per ordinare. Visita www.forno-aurora.it! Scrivi a info@forno.it. Dal 1987 a San Salvario.');
 assert.equal(s.text,'Panificio a Torino.\n\nDal 1987 a San Salvario.');
 assert.deepEqual(s.removed.map(r=>r.kind).sort(),['email','phone','url']);
 assert.equal(G.sanitizeDescription('Dal 1987 a oggi: 3 generazioni.').removed.length,0,'years and small numbers are not phones');
 const msgs=t=>G.descriptionIssues(t,{kind:'Panificio artigianale',area:'Torino'}).map(i=>i.msg).join('\n');
 assert.match(msgs('Il PANE MIGLIORE con SCONTI del 20%. '+'x'.repeat(300)),/maiuscolo[\s\S]*/);
 assert.match(msgs('Sconto del 20% sul pane. Panificio a Torino.'),/Niente offerte, sconti o prezzi/);
 assert.match(msgs('Visita https://forno.it per tutto. Panificio a Torino.'),/Niente link/);
 assert.match(msgs('Chiama 011 555 1234. Panificio a Torino.'),/Niente numeri di telefono/);
 assert.match(msgs('Scrivi a a@b.it. Panificio a Torino.'),/Niente e-mail/);
 assert.match(msgs('x'.repeat(760)),/760 caratteri/);
 assert.match(msgs('Siamo a Torino da anni. '+'Lavoriamo con passione ogni giorno. '.repeat(8)+' Il nostro panificio.'),/non compare nei primi 250/);
 assert.doesNotMatch(msgs(DESC),/primi 250|Niente/);
 assert.equal(G.hasKeyword(DESC,'Panificio artigianale'),true);assert.equal(G.hasKeyword('Pane buono','Gelateria'),false);
 assert.equal(G.hasKeyword('Il panificio','',250),true,'no keyword to check');
});

const version=(over={})=>({nome:'Il forno del quartiere',angolo:'vicinanza',descrizione:DESC,categoria_principale:'Panetteria',categorie_secondarie:['Pasticceria','Negozio di torte'],
 servizi:[{nome:'Pane a lievito madre',descrizione:'Cotto ogni mattina nel forno a legna.'}],domande:Array.from({length:10},(_,i)=>({domanda:'Domanda '+String.fromCharCode(65+i)+'?',risposta:'Risposta.'})),
 post:[{tipo:'evento',titolo:'Laboratorio',testo:'Impastiamo insieme il pane: [data dell’evento].',pulsante:'Prenota'},{tipo:'Offerta',titolo:'Colazione',testo:'La colazione del sabato.',pulsante:'Acquista ora!'},
  {tipo:'novità',titolo:'Pane ai cereali',testo:'Arriva il pane ai cereali.',pulsante:'Scopri di più'},{tipo:'aggiornamento',titolo:'',testo:'Aperti anche la domenica.',pulsante:'Chiama'}],
 foto:['L’esterno con l’insegna','Il forno a legna'],...over});

test('prompt and parsing with a fake AI reply: three versions, limits trimmed, posts ordered, placeholders and claims flagged',()=>{
 const p=G.listingPrompt({tone:'Essenziale'},{...VALUES,project:{name:'Forno Aurora'}});
 for(const re of [/3 versioni della scheda Google Business Profile di «Forno Aurora»/,/massimo 750 caratteri/,/nei primi 250/,/niente link, numeri di telefono, e-mail/,/fino a 9 secondarie/,/elenco delle categorie di Google/,/10 domande/,/4 post: offerta, novità, evento, aggiornamento/,/\[offerta da inserire\]/,/non inventare numeri/,/essenziale e diretto/,/Farine di mulini piemontesi/,/"versioni"/])assert.match(p,re);
 assert.throws(()=>G.listingPrompt({},{...VALUES,kind:''}),/Tipo di attività/);
 const long='Panificio artigianale a Torino. '+'Il nostro pane è cotto ogni giorno con cura. '.repeat(20)+'Chiama il 011 555 1234.';
 const reply='Ecco le versioni:\n```json\n'+JSON.stringify({versioni:[version(),version({nome:'Lungo',descrizione:long,categorie_secondarie:['Cat A','Cat B','Cat C','Cat D','Cat E','Cat F','Cat G','Cat H','Cat I','Cat J','Cat K','Panetteria'],servizi:[{nome:'S',descrizione:'d'.repeat(320)}]}),
  version({nome:'Gratis',descrizione:DESC+' Consegna gratis dal 2005.'}),version({nome:'Quarta'})]})+'\n```';
 const vs=G.parseListing(reply,ctxOf(VALUES));
 assert.equal(vs.length,3,'at most three');
 const [a,b,c]=vs;
 assert.deepEqual(a.posts.map(p=>p.type),['offerta','novita','evento','aggiornamento'],'one post per type in order');
 assert.equal(a.posts[0].cta,'Acquista');assert.equal(a.posts[3].cta,'Chiama ora');
 assert.ok(a.issues.some(i=>i.kind==='todo'&&/\[data dell’evento\]/.test(i.msg)),'placeholders are flagged');
 assert.equal(G.blocking(a.issues).filter(i=>i.kind!=='todo').length,0,JSON.stringify(a.issues));
 assert.ok([...b.description].length<=750,'trimmed to 750');assert.doesNotMatch(b.description,/555/,'phone removed');
 assert.ok(b.issues.some(i=>/Tolto il telefono/.test(i.msg)));
 assert.equal(b.secondary.length,9);assert.ok(!b.secondary.includes('Panetteria'),'the primary is not repeated');assert.ok(b.issues.some(i=>/tenute le prime 9/.test(i.msg)));
 assert.ok(b.services[0].description.length<=300);assert.ok(b.issues.some(i=>/descrizione di 320 caratteri accorciata a 300/.test(i.msg)));
 assert.ok(c.issues.some(i=>i.kind==='number'&&i.text==='2005'),'a number not in the brief');assert.ok(c.issues.some(i=>i.kind==='claim'&&/gratis/.test(i.text)),'a claim not in the brief');
 assert.ok(!c.issues.some(i=>i.kind==='number'&&i.text==='1987'),'1987 is in the brief');
 assert.deepEqual(G.parseListing('nessun json',{}),[]);assert.deepEqual(G.parseListing('{"versioni":[{"nome":"x"}]}',{}),[],'a version needs a description');
 // after an edit the rules run again
 a.description='Visita www.forno.it. '+a.description;G.recheck(a,ctxOf(VALUES));assert.doesNotMatch(a.description,/www/);
});

test('reviews: text blocks with stars and authors, CSV with Italian or English headers',()=>{
 assert.equal(G.starsOf('★★★★☆'),4);assert.equal(G.starsOf('4/5'),4);assert.equal(G.starsOf('2 stelle'),2);assert.equal(G.starsOf('5,0'),5);assert.equal(G.starsOf(''),null);assert.equal(G.starsOf('ottimo'),null);
 const rs=G.parseReviews('Giulia Bianchi\n★★★★★\nPane buonissimo, torneremo!\n\nMarco: 2 stelle – Attesa lunga.\n\n★★★☆☆ · 2 settimane fa\nOttimo pane\nma un po’ caro.\n\nServizio normale, niente di che');
 assert.deepEqual(rs.map(r=>[r.author,r.stars]),[['Giulia Bianchi',5],['Marco',2],['',3],['',null]]);
 assert.equal(rs[1].text,'Attesa lunga.');assert.equal(rs[2].date,'2 settimane fa');assert.equal(rs[2].text,'Ottimo pane\nma un po’ caro.','a short first sentence is not an author');
 const csv=G.parseReviews('Autore;Stelle;Testo;Data\n"Rossi, Anna";4;"Ottima focaccia; un po\' cara";2026-10-01\nLuca;1;Pessimo;\n');
 assert.deepEqual(csv.map(r=>[r.author,r.stars,r.text,r.date]),[['Rossi, Anna',4,'Ottima focaccia; un po\' cara','2026-10-01'],['Luca',1,'Pessimo','']]);
 const en=G.parseReviews('reviewer,rating,comment\nJohn,5,Great bread\n');assert.deepEqual(en.map(r=>[r.author,r.stars,r.text]),[['John',5,'Great bread']]);
 assert.equal(G.parseReviews('a\n\na').length,0,'too short');
 assert.equal(G.parseReviews('Ottimo!\n\nOttimo!').length,1,'duplicates once');
 assert.equal(G.firstName('Anna Rossi'),'Anna');assert.equal(G.shortName('Anna Rossi'),'Anna R.');assert.equal(G.shortName(''),'');
});

test('sentiment, computed here: stars first, words otherwise, sensitive and serious reviews flagged',()=>{
 const s=(text,stars=null)=>G.sentiment({text,stars});
 assert.equal(s('ok',5).label,'positiva');assert.equal(s('ok',3).label,'mista');assert.equal(s('ok',1).label,'negativa');
 assert.equal(s('Pessimo servizio, personale scortese, mai più',null).label,'negativa');assert.equal(s('Ottimo pane, personale gentile, consiglio',null).label,'positiva');
 assert.equal(s('Non consiglio questo posto',null).label,'negativa','«non consiglio» is negative');
 assert.equal(s('Pane buono ma attesa lunghissima, personale scortese e sporco',5).label,'mista','five stars with a negative text');
 assert.equal(s('Prezzi normali, è normale',null).label,'mista','«male» is not in «normale»');
 assert.deepEqual(s('Dopo la diagnosi di celiachia ho trovato pane adatto',5).flags,['sensibile']);
 assert.deepEqual(s('Chiamerò il mio avvocato',1).flags,['grave']);
});

test('reply lint: incentives, review changes, surname, health echo, unknown contacts, apology and offline step, legal admission, signature',()=>{
 const neg={author:'Anna Rossi',stars:1,text:'Sono celiaca e mi sono sentita male, attesa infinita'},ctx={business:'Forno Aurora',input:'info@fornoaurora.it',contacts:'info@fornoaurora.it'};
 const kinds=t=>G.lintReply(t,neg,ctx).map(i=>i.msg).join('\n');
 const good='Gentile Anna, ci dispiace molto per l’esperienza. Ci scriva a info@fornoaurora.it: vorremmo capire cosa è successo.\n\nForno Aurora';
 assert.deepEqual(G.lintReply(good,neg,ctx),[]);
 assert.match(kinds(good.replace('Ci scriva','Le offriamo uno sconto. Ci scriva')),/Incentivo/);
 assert.match(kinds(good+' Avrà un buono regalo.'),/Incentivo/);assert.match(kinds(good+' Un caffè in omaggio!'),/Incentivo/);
 assert.match(kinds(good+' Le chiediamo di modificare la recensione.'),/modificare o togliere/);
 assert.match(kinds(good.replace('Anna','Anna Rossi')),/cognome/);
 assert.match(kinds(good.replace('per l’esperienza','per la sua celiachia')),/salute/);
 assert.doesNotMatch(kinds(good),/salute/,'no echo, no flag');
 assert.match(kinds(good.replace('info@fornoaurora.it','direzione@altro.it')),/Contatto non presente/);
 assert.match(kinds(good.replace('info@fornoaurora.it','al 333 1234567')),/Contatto non presente/);
 assert.match(kinds('Gentile Anna, ci scriva a info@fornoaurora.it. Forno Aurora'),/scuse/);
 assert.match(kinds('Gentile Anna, ci dispiace. Forno Aurora'),/in privato/);
 assert.match(kinds(good+' È colpa nostra.'),/Ammissione/);
 assert.match(kinds('Gentile Anna, ci dispiace, ci scriva a info@fornoaurora.it.'),/firma/);
 assert.match(kinds('x'.repeat(4100)),/4096/);
 const pos={author:'Giulia',stars:5,text:'Bravissimi'};assert.deepEqual(G.lintReply('Grazie Giulia! A presto. Forno Aurora',pos,ctx),[],'a positive needs no apology');
 assert.equal(G.finishReply('Grazie!','Forno Aurora'),'Grazie!\n\nForno Aurora');assert.equal(G.finishReply('Grazie! Forno Aurora','Forno Aurora'),'Grazie! Forno Aurora');
 assert.ok([...G.finishReply('parola '.repeat(800),'Forno Aurora')].length<=4096);assert.match(G.finishReply('parola '.repeat(800),'Forno Aurora'),/Forno Aurora$/);
});

test('replies: prompt with first names only and the rules, parsing a fake AI reply with lint per option',()=>{
 const rs=G.parseReviews('Anna Rossi\n★☆☆☆☆\nAttesa infinita e personale scortese.\n\nGiulia Bianchi\n★★★★★\nPane buonissimo!');
 const p=G.repliesPrompt(rs,{business:'Forno Aurora',contacts:'info@fornoaurora.it',notes:'Il forno si è guastato',tone:'Cordiale'});
 assert.match(p,/Nome: Anna\./);assert.doesNotMatch(p,/Rossi|Bianchi/,'surnames never go to the AI');
 for(const re of [/calda/,/concisa: massimo 40 parole/,/soluzione/,/non offrire sconti, buoni, omaggi/,/non chiedere di modificare o togliere/,/non confermare che la persona sia cliente o paziente/,/firma ogni risposta con «Forno Aurora»/,/1 stelle su 5\. Tono rilevato: negativa/,/info@fornoaurora\.it/,/Il forno si è guastato/,/lingua della recensione/])assert.match(p,re);
 assert.match(G.repliesPrompt(rs,{business:'Forno Aurora'}),/senza inventare numeri o indirizzi/);
 assert.throws(()=>G.repliesPrompt([],{business:'X'}),/almeno una recensione/);assert.throws(()=>G.repliesPrompt(rs,{business:''}),/nome dell’attività/);
 const ai=JSON.stringify({risposte:[{n:2,calda:'Grazie Giulia, che bello leggerla!',concisa:'Grazie Giulia!',soluzione:'Grazie Giulia, provi il pane ai cereali.'},
  {n:1,calda:'Gentile Anna Rossi, ci dispiace molto. Ci scriva a info@fornoaurora.it.',concisa:'Ci dispiace Anna, ci scriva a info@fornoaurora.it.',soluzione:'Gentile Anna, ci scusiamo: le offriamo uno sconto. Ci scriva a info@fornoaurora.it.'}]});
 const items=G.parseReplies('```json\n'+ai+'\n```',rs,{business:'Forno Aurora',input:'info@fornoaurora.it',contacts:'info@fornoaurora.it'});
 assert.equal(items.length,2);assert.equal(items[0].review.author,'Anna Rossi','matched by n');assert.equal(items[0].sentiment,'negativa');
 assert.match(items[0].options.warm,/\n\nForno Aurora$/,'signed');
 assert.match(items[0].issues.warm.map(i=>i.msg).join(),/cognome/);assert.deepEqual(items[0].issues.concise,[]);assert.match(items[0].issues.solution.map(i=>i.msg).join(),/Incentivo/);
 assert.deepEqual(items[1].issues.warm,[]);assert.equal(items[1].chosen,'warm');
 assert.deepEqual(G.parseReplies('niente',rs,{}),[]);
});

test('CSV export and import: one row per review, formula-safe, readable back; listing as .txt and .csv',()=>{
 const rs=[{id:'r1',author:'Anna Rossi',stars:1,text:'=HYPERLINK("x")',date:'2026-10-01'}];
 const items=[{review:rs[0],sentiment:'negativa',flags:[],options:{warm:'Ci dispiace; ci scriva.\n\nForno Aurora',concise:'Scusi.',solution:'Ci scriva.'},issues:{warm:[],concise:[{msg:'Manca la firma'}],solution:[]},chosen:'concise'}];
 const csv=G.repliesCsv(items);assert.ok(csv.startsWith('﻿autore;stelle;sentimento;data;recensione;risposta scelta;calda;concisa;soluzione;da controllare'));
 assert.match(csv,/'=HYPERLINK/,'a formula stays text');assert.doesNotMatch(csv,/Rossi/,'the author is shortened');
 const back=CSV.parse(csv);assert.equal(back.rows.length,1);assert.equal(back.rows[0]['risposta scelta'],'Scusi.');assert.equal(back.rows[0].calda,'Ci dispiace; ci scriva.\n\nForno Aurora');assert.equal(back.rows[0]['da controllare'],'Manca la firma');
 const again=G.parseReviews(csv);assert.deepEqual(again.map(r=>[r.author,r.stars,r.text]),[['Anna R.',1,"'=HYPERLINK(\"x\")"]],'an export can be imported again');
 const txt=G.repliesTxt(items,{brand:'Forno Aurora',date:'2026-10-21'});assert.match(txt,/Anna R\. · 1\/5 · Negativa/);assert.match(txt,/business\.google\.com/);
 const v=G.parseListing(JSON.stringify({versioni:[version()]}),ctxOf(VALUES))[0];
 const lt=G.listingTxt(v,{values:VALUES,brand:'Forno Aurora',date:'2026-10-21'});
 for(const re of [/^SCHEDA GOOGLE · Forno Aurora/,/RADIX non pubblica su Google/,/DESCRIZIONE \(\d+\/750\)/,/- Principale: Panetteria/,/elenco di Google/,/\[Offerta\] Colazione/,/Pulsante: Acquista/,/\[ \] L’esterno con l’insegna/,/ORARI E CONTATTI[\s\S]*011 555 1234/,/DA CONTROLLARE/])assert.match(lt,re);
 const lc=CSV.parse(G.listingCsv(v));assert.deepEqual(lc.headers,['sezione','campo','testo','caratteri','limite']);assert.equal(lc.rows[0].limite,'750');assert.ok(lc.rows.some(r=>r.sezione==='Post'&&/pulsante/.test(r.campo)));
 assert.equal(G.fileName('listing','Forno Aurora','txt'),'scheda-google-forno-aurora.txt');assert.equal(G.fileName('replies','','csv'),'risposte-recensioni-attivita.csv');
});

test('save: gbp in the agents document, every other key kept, retried on a conflict, replies by review id',async()=>{
 class ConflictError extends Error{}
 let stored={schemaVersion:1,conversations:{'seo-geo':[{role:'user',content:'ciao'}]},prefs:{a:1},seoResults:{schemaVersion:1,imports:[{id:'i1'}]},adCreatives:{schemaVersion:1,items:[{id:'ad'}]}},conflicts=1,saves=0;
 const ws={ConflictError,bind:(pid,mod)=>{assert.equal(pid,'forno');assert.equal(mod,'agents');return {load:async()=>JSON.parse(JSON.stringify(stored)),save:async d=>{saves++;if(conflicts){conflicts--;throw new ConflictError('x')}stored=JSON.parse(JSON.stringify(d))}}}};
 const v=G.parseListing(JSON.stringify({versioni:[version()]}),ctxOf(VALUES))[0];
 const rec=G.listingRecord(v,{values:VALUES,answers:{tone:'Elegante'},by:'Ilari',at:'2026-10-21T10:00:00.000Z'});
 assert.equal(rec.id,'gbp-20261021100000');assert.equal(rec.tone,'Elegante');assert.equal(rec.brief.kind,'Panificio artigianale');assert.equal(rec.version.description,v.description);
 await G.saveListing(ws,'forno',rec);assert.equal(saves,2,'retried once');
 assert.deepEqual(stored.conversations,{'seo-geo':[{role:'user',content:'ciao'}]});assert.deepEqual(stored.prefs,{a:1});assert.deepEqual(stored.seoResults.imports,[{id:'i1'}]);assert.deepEqual(stored.adCreatives.items,[{id:'ad'}]);
 assert.equal(stored.gbp.listings.length,1);assert.deepEqual(stored.gbp.replies,[]);
 for(let i=0;i<6;i++)await G.saveListing(ws,'forno',{...rec,id:'gbp-'+i});assert.equal(stored.gbp.listings.length,5,'the last 5');
 const item=r=>({review:r,sentiment:'positiva',flags:[],options:{warm:'Grazie'},issues:{warm:[]},chosen:'warm'});
 const recs=G.replyRecords([item({id:'r1',author:'Anna Rossi',stars:5,text:'Bravi'}),item({id:'r2',author:'',stars:null,text:'Ok'})],{at:'2026-10-21T10:00:00.000Z'});
 assert.equal(recs[0].author,'Anna R.','only the initial of the surname is saved');assert.equal(recs[0].reply,'Grazie');
 await G.saveReplies(ws,'forno',recs);await G.saveReplies(ws,'forno',[{...recs[0],reply:'Grazie mille'}]);
 assert.deepEqual(stored.gbp.replies.map(r=>[r.id,r.reply]),[['r2','Grazie'],['r1','Grazie mille']],'same review replaced');
 assert.equal(stored.gbp.listings.length,5,'listings kept when replies are saved');
 assert.deepEqual(G.readStore({gbp:'x'}),{schemaVersion:1,listings:[],replies:[]});
 const back=G.fromRecord(rec);assert.equal(back.description,v.description);assert.equal(back.angle,'vicinanza');
 await assert.rejects(G.saveListing(null,'forno',rec),/non disponibile/);
 // the Agenti AI page keeps gbp when it saves its conversations
 const page=fs.readFileSync(path.join(root,'agents-page.js'),'utf8');
 assert.match(page,/if\(d\.gbp\)out\.gbp=d\.gbp;/);assert.match(page,/data\.gbp=fresh\.gbp;/);assert.match(page,/data\.adCreatives=fresh\.adCreatives;data\.gbp=fresh\.gbp\}/);
});

test('wiring: the card in «Web e annunci», the studio in the page, every AI call behind a confirmation, nothing posted to Google',()=>{
 const core=require('../agency/crea-core.js'),look=require('../agency/marketing-look.js');
 const c=core.card('google');assert.equal(c.group,'Web e annunci');assert.equal(c.inline,'gbp');assert.equal(c.title,'Scheda Google e recensioni');assert.match(c.cost,/con conferma/);assert.match(c.hint,/non pubblica su Google/);
 assert.equal(look.CARDS.google,'mapPin');assert.ok(look.has('mapPin'));
 assert.deepEqual(core.fromQuery('?open=google'),{group:'Web e annunci',open:'google'});
 const html=fs.readFileSync(path.join(root,'agency/crea.html'),'utf8');assert.ok(html.indexOf('/lib/ad-studio.js')<html.indexOf('/lib/gbp-studio.js')&&html.indexOf('/lib/gbp-studio.js')<html.indexOf('/agency/crea.js'));
 const page=fs.readFileSync(path.join(root,'agency/crea.js'),'utf8');assert.match(page,/gbp:\{global:'RadixGbpStudio'/);assert.match(page,/S\.gbpStudio\(\{project,profile:current\.profile/);
 const src=fs.readFileSync(path.join(root,'lib/gbp-studio.js'),'utf8');
 assert.equal((src.match(/rt\.reply\(/g)||[]).length,2,'two AI calls');assert.equal((src.match(/if\(!await askConfirm\(/g)||[]).length,2,'two confirmations');assert.ok(!src.includes('root.confirm(\''),'no native confirm left');
 for(const m of src.matchAll(/rt\.reply\(/g)){const before=src.slice(0,m.index),conf=before.lastIndexOf('if(!await askConfirm('),click=before.lastIndexOf('.onclick=async');assert.ok(conf>click&&click>0,'the call follows a click and a confirmation')}
 assert.doesNotMatch(src,/fetch\(/,'no network call of its own: no posting to Google');
 assert.match(src,/business\.google\.com/);
 const css=fs.readFileSync(path.join(root,'shell/crea.css'),'utf8');assert.match(css,/\.cr-panel \.gbp-studio/);
});
