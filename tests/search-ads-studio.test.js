'use strict';
// Studio «Campagne Google Ads Search» (lib/search-ads-studio.js): the answers, the budget split (arithmetic only), the
// parser of the FAKE AI reply (invalid items dropped and counted), the live checks (limits, duplicates, negatives, the
// Italian ad policy no-nos), the Google Ads Editor files (headers, UTF-16 LE, tabs, escaping), the client summary (PDF
// and HTML, volumes and CPC «non disponibile»), one confirmation before the one AI call, the saved key searchAds that
// agents-page.js keeps, and the card in «Cosa vuoi fare».
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const S=require('../lib/search-ads-studio.js'),F=require('./search-ads-fixtures.js'),Z=require('../lib/zip-lite.js');
const crea=require('../agency/crea-core.js'),look=require('../agency/marketing-look.js');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const parsed=()=>S.parseStructures(F.REPLY,{answers:F.ANSWERS});
const first=()=>parsed().structures[0];
const INPUT=S.inputText(F.ANSWERS,S.factsText(F.PROJECT,F.PROFILE));
const CTX={answers:F.ANSWERS,input:INPUT,projectHost:'fornoaurora.it'};
const latin=b=>Buffer.from(b).toString('latin1');
const pdfText=bytes=>[...latin(bytes).matchAll(/<([0-9A-F]+)> Tj/g)].map(m=>Buffer.from(m[1],'hex').toString('latin1')).join('\n');
// The fixture's first structure with its policy problems fixed by hand, as the person would in the refine step.
function fixed(){const s=first(),g=s.campaigns[0].groups[0];
 g.ad.headlines=g.ad.headlines.map(t=>t==='Pane caldo! Passa a trovarci'?'Pane caldo, passa a trovarci':t==='IL MIGLIORE PANE'?'Pane buono ogni giorno':t);
 const t=s.campaigns[1].groups[0];t.ad.descriptions=t.ad.descriptions.filter(d=>!/miglior/.test(d));
 s.callouts=s.callouts.filter(c=>!/gratuita/.test(c));s.negatives=s.negatives.filter(n=>n.text!=='forno aurora');s.campaigns.slice(0,3).forEach(c=>c.negatives.push({text:'forno aurora',match:'phrase'}));return s}

test('the answers: defaults, lists, money, the landing page, what is missing',()=>{
 assert.equal(S.LIMITS.headline,30);assert.equal(S.LIMITS.description,90);assert.equal(S.LIMITS.path,15);assert.equal(S.LIMITS.headlines,15);assert.equal(S.LIMITS.descriptions,4);
 const a=S.normalize(F.ANSWERS);assert.equal(a.goal,'chiamate');assert.deepEqual(a.services,['Pane a lievito madre','Torte su ordinazione','Catering per eventi']);assert.deepEqual(a.cities,['Torino','Moncalieri']);
 assert.equal(a.radiusKm,10);assert.equal(a.budget,20);assert.deepEqual(a.brand,['Forno Aurora']);assert.equal(S.normalize({goal:'boh'}).goal,'chiamate');
 assert.equal(S.money('20,50'),20.5);assert.equal(S.money('€ 15'),15);assert.equal(S.money('12.345'),null);assert.equal(S.money('dieci'),null);assert.equal(S.money('0'),null);assert.equal(S.money(-3),null);
 assert.deepEqual(S.normalize({services:'pane, Pane ,torte'}).services,['pane','torte'],'duplicates kept once');
 assert.deepEqual(S.landingUrl('www.fornoaurora.it/ordina'),{url:'https://www.fornoaurora.it/ordina',host:'fornoaurora.it',origin:'https://www.fornoaurora.it'});
 assert.equal(S.landingUrl('http://fornoaurora.it').url,'https://fornoaurora.it/');for(const bad of ['','forno aurora','https://1.2.3.4/x','https://user:pw@x.it','javascript:alert(1)'])assert.ok(S.landingUrl(bad).error,bad);
 assert.deepEqual(S.answerErrors(F.ANSWERS),[]);
 const e=S.answerErrors({});assert.equal(e.length,4);assert.match(e.join(' '),/servizio/);assert.match(e.join(' '),/zona/);assert.match(e.join(' '),/budget/);
 assert.deepEqual(S.answerErrors({...F.ANSWERS,cities:'',radiusKm:'5',center:'Via Roma 1, Torino'}),[],'a radius instead of cities');
 const p=S.prefill(F.PROJECT,null);assert.equal(p.landing,'https://www.fornoaurora.it');assert.equal(p.landingFrom,'profilo');assert.deepEqual(p.brand,['Forno Aurora']);assert.deepEqual(p.cities,['Torino']);
 const q=S.prefill(F.PROJECT,{siteOnline:{url:'https://forno-aurora.vercel.app',domain:{name:'forno-aurora.radixinnovationstudio.com',verified:true}}});assert.equal(q.landing,'https://forno-aurora.radixinnovationstudio.com');assert.equal(q.landingFrom,'sito');
 assert.equal(S.prefill(F.PROJECT,{siteOnline:{url:'javascript:x'}}).landingFrom,'profilo');
});

test('the budget: only the person’s daily budget, split to the cent, monthly ceiling 30,4 × daily',()=>{
 assert.deepEqual(S.budgetSplit(20,[1,1,1]),[6.67,6.67,6.66]);assert.deepEqual(S.budgetSplit(20,[1,1,1,1]),[5,5,5,5]);
 assert.deepEqual(S.budgetSplit(50,[50,30,20]),[25,15,10]);assert.deepEqual(S.budgetSplit(10,[0,0]),[5,5],'no weights: equal');assert.deepEqual(S.budgetSplit(10,[1,0]),[10,0]);
 assert.deepEqual(S.budgetSplit(0,[1,1]),[0,0]);assert.deepEqual(S.budgetSplit(7,[]),[]);
 for(const [t,w] of [[33.33,[1,2,3]],[0.05,[1,1,1,1,1,1]],[123.45,[13,7,29,1]]]){const r=S.budgetSplit(t,w);assert.equal(Math.round(r.reduce((a,b)=>a+b,0)*100),Math.round(t*100),'adds up: '+t)}
 assert.equal(S.monthlyCap(20),608);assert.equal(S.monthlyCap(6.67),202.77);assert.equal(S.euro(1234.5),'1.234,50 €');
 const s=first();assert.deepEqual(S.budgetOf(s,20).map(b=>[b.share,b.daily,b.monthly]),[[25,5,152],[25,5,152],[25,5,152],[25,5,152]]);
 s.shares=[40,30,20,10];assert.deepEqual(S.budgetOf(s,20).map(b=>b.daily),[8,6,4,2]);
 assert.ok(S.checks({...s,shares:[1,1,1,0]},CTX).some(i=>i.level==='error'&&i.field==='c3.share'),'a campaign at 0 € is an error');
});

test('the parser: the fake reply validated, invalid items dropped and counted, never cut',()=>{
 const {structures,dropped}=parsed();
 assert.deepEqual(structures.map(s=>s.kind),['servizio','intento','zona']);assert.equal(dropped.structures,2,'the string and the fourth structure');
 const s=structures[0];assert.deepEqual(s.campaigns.map(c=>c.name),['Pane a lievito madre','Torte su ordinazione','Catering per eventi','Marchio']);
 const g=s.campaigns[0].groups[0];
 assert.deepEqual(g.keywords,[{text:'pane a lievito madre torino',match:'phrase'},{text:'panificio torino',match:'exact'},{text:'forno pane fresco torino',match:'phrase'},{text:'pane artigianale torino',match:'broad'}]);
 assert.equal(dropped.keywords,2,'«pane!!! subito» and the duplicate «panificio torino»');
 assert.equal(g.ad.headlines.length,14);assert.ok(g.ad.headlines.every(t=>[...t].length<=30));assert.ok(!g.ad.headlines.some(t=>/troppo lungo/.test(t)),'over 30: dropped, not cut');
 assert.equal(g.ad.descriptions.length,4);assert.ok(g.ad.descriptions.every(t=>[...t].length<=90));assert.equal(dropped.headlines,1);assert.equal(dropped.descriptions,1);
 assert.equal(g.ad.path1,'pane');assert.equal(g.ad.path2,'lievito-madre','spaces become hyphens within 15');
 assert.deepEqual(s.sitelinks.map(l=>l.url),['https://www.fornoaurora.it/ordina','https://www.fornoaurora.it/torte','https://www.fornoaurora.it/catering','https://www.fornoaurora.it/dove-siamo']);
 assert.equal(dropped.sitelinks,1,'the sitelink to another site');assert.deepEqual([s.sitelinks[3].line1,s.sitelinks[3].line2],['',''],'one line only: both dropped');assert.equal(dropped.sitelinkLines,1);
 assert.deepEqual(s.callouts,['Lievito madre','Cotto ogni mattina','Torte su ordinazione','Consegna gratuita']);assert.equal(dropped.callouts,1);
 assert.deepEqual(s.snippet,{header:'Servizi',values:['Pane','Torte','Catering','Focacce']});assert.equal(structures[2].snippet,null,'«Ricette» is not a Google header');assert.equal(dropped.snippets,1);
 assert.deepEqual(s.negatives.map(S.keywordLine),['lavoro','"fai da te"','corso','"forno aurora"']);assert.deepEqual(s.campaigns[0].negatives,[{text:'ricetta',match:'broad'}]);
 assert.equal(S.droppedTotal(dropped),10);assert.match(S.droppedText(dropped),/2 parole chiave/);assert.match(S.droppedText(dropped),/1 titolo, 1 descrizione/);
 // nothing usable
 for(const bad of ['','non so','{"strutture":[]}','{"strutture":[{"campagne":[{"gruppi":[{"parole_chiave":["!!!"]}]}]}]}','[1,2,3]'])assert.deepEqual(S.parseStructures(bad,{answers:F.ANSWERS}).structures,[],bad);
 // keywords as Google Ads writes them
 assert.deepEqual(S.keywordOf('[Panificio Torino]'),{text:'panificio torino',match:'exact'});assert.deepEqual(S.keywordOf('"pane fresco"'),{text:'pane fresco',match:'phrase'});
 assert.deepEqual(S.keywordOf('+pane +torino',undefined,'broad'),{text:'pane torino',match:'broad'});assert.deepEqual(S.keywordOf({testo:'pane',corrispondenza:'Corrispondenza esatta'}),{text:'pane',match:'exact'});
 for(const bad of ['pane, torino','pane (torino)','pane?','a b c d e f g h i j k','x'.repeat(81),'🍞 pane'])assert.equal(S.keywordOf(bad),null,bad);
 const lines=S.parseKeywordLines('pane torino\n"pane fresco"\n[forno aurora]\npane torino\npane!!\n');assert.deepEqual(lines.keywords.map(S.keywordLine),['pane torino','"pane fresco"','[forno aurora]']);assert.deepEqual(lines.invalid,['pane!!']);
});

test('the checks: Google’s limits and policy (no «!» in headlines, ALL CAPS, symbols, phone), claims and numbers flagged',()=>{
 const is=S.checks(first(),CTX),by=f=>is.filter(i=>i.field===f);
 assert.ok(by('c0.g0.h10').some(i=>i.level==='error'&&/«!»/.test(i.text)),'«!» in a headline');
 assert.ok(by('c0.g0.h11').some(i=>i.level==='error'&&/maiuscolo/.test(i.text)),'ALL CAPS');assert.ok(by('c0.g0.h11').some(i=>i.level==='warn'&&/il migliore/.test(i.text)),'claim');
 assert.ok(by('c1.g0.d2').some(i=>/il migliore/.test(i.text))&&by('c1.g0.d2').some(i=>/gratis/.test(i.text)),'«La miglior torta… consegna gratis»');
 assert.ok(by('co3').some(i=>/gratis/.test(i.text)));assert.ok(is.some(i=>i.field==='neg'&&/blocca la parola chiave «forno aurora»/.test(i.text)),'a negative that blocks a keyword');
 assert.equal(S.errorsOf(is).length,2);
 const ok=S.checks(fixed(),CTX);assert.deepEqual(S.errorsOf(ok),[],'fixed by hand: no errors');assert.deepEqual(ok.map(i=>i.text),[],'and no warnings');
 // the policy of one text
 const T=(t,k='headline',o={})=>S.textIssues(t,k,{input:INPUT,brand:['Forno Aurora'],...o}).map(i=>i.code);
 assert.deepEqual(T('Pane fresco a Torino'),[]);assert.deepEqual(T('FORNO AURORA a Torino'),[],'the brand may be in capitals');assert.deepEqual(T('Pane DOP e IVA inclusa'),[],'acronyms');
 assert.deepEqual(T('Pane fresco!','description'),[]);assert.deepEqual(T('Pane! Fresco!','description'),['esclamativi']);assert.deepEqual(T('Pane fresco!'),['esclamativo']);
 assert.ok(T('Davvero??','description').includes('punteggiatura'));assert.ok(T('Pane ★ fresco').includes('simboli'));assert.ok(T('Pane 🍞').includes('simboli'));
 assert.ok(T('Chiama 011 1234567','description').includes('telefono'));assert.ok(T('Chiama 333 123 4567','description').includes('telefono'));
 assert.ok(T('Il pane numero 1 a Torino').includes('promessa'));assert.ok(T('Pane in offerta').includes('promessa'));assert.ok(T('Da 30 anni il tuo forno').includes('numero'),'30 is not in the brief');
 assert.deepEqual(T('Torte con 48 ore di preavviso'),[],'48 is in the facts');assert.deepEqual(T('Pane gratis',undefined,{input:'pane gratis il sabato'}),[],'a claim the brief makes');
 // limits, duplicates and structure, after an edit
 const s=fixed(),g=s.campaigns[0].groups[0];g.ad.headlines[0]='Pane a lievito madre a Torino, sempre';g.ad.headlines[3]=g.ad.headlines[2];g.ad.descriptions=[g.ad.descriptions[0]];g.ad.path1='';g.ad.path2='x';
 g.keywords.push({text:'pane a lievito madre torino',match:'phrase'});s.campaigns[1].groups[0].keywords.push({text:'pane artigianale torino',match:'exact'});
 const e=S.checks(s,CTX),has=(f,re,l='error')=>assert.ok(e.some(i=>i.field===f&&i.level===l&&re.test(i.text)),f+' '+re);
 has('c0.g0.h0',/caratteri su 30/);has('c0.g0.h3',/uguale al titolo 3/);has('c0.g0.d',/almeno 2 descrizioni/);has('c0.g0.p1',/percorso 2 senza il percorso 1/);has('c0.g0.kw',/doppia nello stesso gruppo/);
 has('c1.g0.kw',/anche nella campagna «Pane a lievito madre»/,'warn');
 const few=fixed();few.campaigns[0].groups[0].ad.headlines=['Pane fresco','Forno','Torino'];const f2=S.checks(few,CTX);
 assert.ok(f2.some(i=>i.field==='c0.g0.h'&&i.level==='warn'&&/Solo 3 titoli/.test(i.text)));assert.ok(f2.some(i=>i.field==='c0.g0.h'&&/Nessun titolo contiene una parola chiave/.test(i.text)));
 few.campaigns[0].groups[0].ad.headlines=['Pane','Forno'];assert.ok(S.checks(few,CTX).some(i=>i.field==='c0.g0.h'&&i.level==='error'&&/almeno 3 titoli/.test(i.text)));
 // blanks kept in place while editing do not count
 const b=fixed(),bh=b.campaigns[0].groups[0].ad.headlines;bh.splice(2,0,'',' ');assert.deepEqual(S.errorsOf(S.checks(b,CTX)),[]);
 // landing and sitelinks
 assert.ok(S.checks(fixed(),{...CTX,answers:{...F.ANSWERS,landing:'www.altrosito.it'}}).some(i=>i.field==='landing'&&i.level==='warn'));
 assert.ok(S.checks(fixed(),{...CTX,answers:{...F.ANSWERS,landing:'boh'}}).some(i=>i.field==='landing'&&i.level==='error'));
 const sl=fixed();sl.sitelinks[0].url='https://altrosito.it/x';sl.sitelinks[1].line2='';assert.ok(S.checks(sl,CTX).some(i=>i.field==='sl0'&&/stesso sito/.test(i.text)));assert.ok(S.checks(sl,CTX).some(i=>i.field==='sl1'&&/tutte e due/.test(i.text)));
 assert.equal(S.fieldLevels([{field:'a',level:'warn'},{field:'a',level:'error'},{field:'a',level:'warn'}]).a,'error');
 assert.ok(S.blocks({text:'fai da te',match:'phrase'},{text:'pane fai da te'}));assert.ok(!S.blocks({text:'fai da te',match:'phrase'},{text:'fai pane da te'}));assert.ok(S.blocks({text:'te fai',match:'broad'},{text:'fai pane da te'}));assert.ok(!S.blocks({text:'pane',match:'exact'},{text:'pane fresco'}));
});

test('Google Ads Editor files: Editor’s headers, UTF-16 LE with BOM, tabs, escaping, campaigns paused, budget split',()=>{
 const s=fixed(),R=S.editorRows(s,F.ANSWERS);
 assert.deepEqual(R.campaigns[0],['Campaign','Campaign Type','Networks','Budget','Budget type','Bid Strategy Type','Campaign Status','Languages']);
 assert.deepEqual(R.campaigns.slice(1).map(r=>[r[0],r[1],r[3],r[4],r[5],r[6],r[7]]),[['Pane a lievito madre','Search','5.00','Daily','Maximize conversions','Paused','it'],['Torte su ordinazione','Search','5.00','Daily','Maximize conversions','Paused','it'],['Catering per eventi','Search','5.00','Daily','Maximize conversions','Paused','it'],['Marchio','Search','5.00','Daily','Maximize conversions','Paused','it']]);
 assert.equal(S.editorRows(s,{...F.ANSWERS,goal:'visite'}).campaigns[1][5],'Maximize clicks');
 assert.deepEqual(R.locations.slice(1,3),[['Pane a lievito madre','Torino, Italy'],['Pane a lievito madre','Moncalieri, Italy']]);
 assert.deepEqual(R.adGroups[0],['Campaign','Ad group']);assert.deepEqual(R.keywords[0],['Campaign','Ad group','Keyword','Criterion Type']);
 assert.deepEqual(R.keywords[1],['Pane a lievito madre','Pane a lievito madre','pane a lievito madre torino','Phrase']);assert.deepEqual(R.keywords[2].slice(2),['panificio torino','Exact']);assert.deepEqual(R.keywords[4].slice(2),['pane artigianale torino','Broad']);
 const neg=R.negatives.filter(r=>r[0]==='Marchio').map(r=>r.slice(1));assert.deepEqual(neg,[['','lavoro','Negative Broad'],['','fai da te','Negative Phrase'],['','corso','Negative Broad']],'account negatives on every campaign, campaign level');
 assert.ok(R.negatives.some(r=>r[0]==='Pane a lievito madre'&&r[2]==='forno aurora'&&r[3]==='Negative Phrase'));
 const ad=R.ads[0];assert.equal(ad.length,3+15+4+3);assert.deepEqual([ad[3],ad[17],ad[18],ad[21],ad[22],ad[23],ad[24]],['Headline 1','Headline 15','Description 1','Description 4','Path 1','Path 2','Final URL']);
 const row=R.ads[1];assert.equal(row[2],'Responsive search ad');assert.equal(row[3],'Pane a lievito madre a Torino');assert.equal(row[24],'https://www.fornoaurora.it/ordina');assert.equal(row[23],'lievito-madre');
 assert.ok(R.ads.slice(1).every(r=>r.slice(3,18).every(t=>[...t].length<=30)&&r.slice(18,22).every(t=>[...t].length<=90)));
 assert.deepEqual(R.sitelinks[0],['Campaign','Link text','Description line 1','Description line 2','Final URL']);assert.deepEqual(R.callouts[0],['Campaign','Callout text']);
 assert.deepEqual(R.snippets[1],['Pane a lievito madre','Service catalog','Pane;Torte;Catering;Focacce']);
 // escaping and encoding
 assert.equal(S.tsvCell('a\tb\nc'),'a b c');assert.equal(S.tsvCell('Pane "vero"'),'"Pane ""vero"""');assert.equal(S.tsvCell(null),'');assert.equal(S.tsv([['a','b'],['c','d']]),'a\tb\r\nc\td\r\n');
 const bytes=S.utf16le('Città €');assert.deepEqual([...bytes.slice(0,2)],[0xFF,0xFE]);assert.equal(bytes.length,2+7*2);assert.equal(S.fromUtf16le(bytes),'Città €');
 const files=S.editorFiles(s,F.ANSWERS,{brand:{name:'Forno Aurora'},date:new Date('2026-10-23T09:00:00Z')});
 assert.deepEqual(files.map(f=>f.name),['01-campagne.csv','02-localita.csv','03-gruppi.csv','04-parole-chiave.csv','05-negative.csv','06-annunci-rsa.csv','07-sitelink.csv','08-callout.csv','09-snippet.csv','LEGGIMI.txt']);
 const camp=S.fromUtf16le(files[0].data);assert.ok(camp.startsWith('Campaign\tCampaign Type\tNetworks\tBudget'));assert.equal(camp.split('\r\n').filter(Boolean).length,5);
 const back=S.fromUtf16le(files[5].data).split('\r\n')[1].split('\t');assert.equal(back[3],'Pane a lievito madre a Torino');
 assert.ok(!S.editorFiles({...s,sitelinks:[],callouts:[],snippet:null},{...F.ANSWERS,cities:'',center:'Via Roma 1',radiusKm:'5'}).some(f=>/sitelink|callout|snippet|localita/.test(f.name)),'empty files are left out');
 const txt=files[9].data;assert.ok(txt.startsWith('﻿'));assert.match(txt,/Account › Importa › Da file/);assert.match(txt,/01-campagne\.csv: Campagne \(in pausa\) \(4 righe\)/);assert.match(txt,/UTF-16 LE con BOM/);assert.match(txt,/tabulazione/);
 assert.match(txt,/IN PAUSA/);assert.match(txt,/raggio di 10 km intorno a «Via Garibaldi 12, Torino»/);assert.match(txt,/Volume di ricerca: non disponibile \(serve Google Ads API\)\. CPC: non disponibile \(serve Google Ads API\)/);
 assert.match(txt,/Pane a lievito madre: 5,00 € al giorno \(25%\), al massimo 152,00 € al mese/);
 // nothing invented: no volumes or prices in any file
 const all=files.map(f=>typeof f.data==='string'?f.data:S.fromUtf16le(f.data)).join('\n');assert.doesNotMatch(all,/ricerche al mese|CPC (?:medio|stimato)|€ a clic/i);
 const z=Z.zip(files.concat([{name:'riepilogo-cliente.html',data:'x'}]));assert.equal(z[0],0x50);assert.equal(S.zipName(s,{name:'Forno Aurora'}),'google-ads-forno-aurora-servizio.zip');
});

test('the summary for the client: A4 PDF with the own writer and one HTML file, volumes and CPC «non disponibile»',()=>{
 const s=fixed(),brand=S.brandFor(F.PROFILE,'Forno Aurora'),date=new Date('2026-10-23T09:00:00Z');
 const doc=S.layoutSummary(s,F.ANSWERS,brand,{date});assert.ok(doc.pages.length>=3);
 for(const p of doc.pages)for(const it of p.items)if(it.t==='text')assert.ok(it.x>=15.5&&it.y<=297,'inside the page: '+it.s);
 const bytes=S.summaryPdf(s,F.ANSWERS,brand,{date,doc});assert.equal(latin(bytes.slice(0,5)),'%PDF-');const t=pdfText(bytes);
 assert.match(t,/Proposta di campagne Google Ads/);assert.match(t,/non disponibile \(serve Google Ads API\)/);assert.match(t,/5,00 \x80/,'€ in WinAnsi');assert.match(t,/152,00 \x80/);assert.match(t,/Preparato con RADIX il 23\/10\/2026 per Forno Aurora/);
 const html=S.summaryHtml(s,F.ANSWERS,brand,{date});assert.match(html,/^<!doctype html><html lang="it">/);assert.match(html,/prefers-color-scheme:dark/);assert.match(html,/non disponibile \(serve Google Ads API\)/);
 assert.doesNotMatch(html,/<script|<link|<img|src=|href=|@import|url\(/i,'one file, no external request');
 const evil=fixed();evil.campaigns[0].name='<b>x</b>';evil.campaigns[0].groups[0].ad.headlines[0]='<script>alert(1)</script>';const h2=S.summaryHtml(evil,F.ANSWERS,brand,{date});assert.doesNotMatch(h2,/<script>|<b>x/);assert.match(h2,/&lt;b&gt;x&lt;\/b&gt;/);
 assert.match(S.summaryHtml(s,F.ANSWERS,brand,{date,issues:[{level:'warn'},{level:'warn'}]}),/2 punti da rivedere/);
});

test('the AI: answers checked first, ONE confirmation, ONE call to the Paid Media Specialist (fake AI only)',async()=>{
 let calls=0,asked=0,got=null;const rt={reply:async o=>{calls++;got=o;return {text:F.REPLY}}};
 await assert.rejects(S.generateStructures({answers:{},rt,confirm:async()=>{asked++;return true}}),/servizio/);assert.equal(asked,0,'no confirmation for incomplete answers');assert.equal(calls,0);
 assert.deepEqual(await S.generateStructures({answers:F.ANSWERS,values:{project:F.PROJECT},rt,confirm:async()=>{asked++;return false}}),{cancelled:true});assert.equal(asked,1);assert.equal(calls,0,'no AI without a yes');
 let started=false;const r=await S.generateStructures({answers:F.ANSWERS,values:{project:F.PROJECT,facts:'Catering fino a 80 persone'},rt,project:{id:'forno-aurora',name:'Forno Aurora'},memoryScope:{projectId:'forno-aurora',agentId:'paid-media'},onStart:()=>{started=true},
  confirm:async o=>{asked++;assert.match(o.title,/3 strutture/);assert.match(o.cost,/una sola chiamata AI/);assert.match(o.ok,/1 chiamata/);assert.deepEqual(o.facts.find(f=>f[0]==='Chiamate AI'),['Chiamate AI','1']);assert.match(o.message,/non vengono stimati/);return true}});
 assert.equal(calls,1);assert.ok(started);assert.equal(r.structures.length,3);assert.equal(got.role,'paid-media');assert.equal(got.memoryScope.agentId,'paid-media');assert.equal(got.messages.length,1);
 const p=got.messages[0].content;assert.match(p,/3 strutture/);assert.match(p,/"servizio"/);assert.match(p,/"intento"/);assert.match(p,/"zona"/);assert.match(p,/massimo 30 caratteri/);assert.match(p,/massimo 90/);assert.match(p,/massimo 15 caratteri/);
 assert.match(p,/Non indicare volumi di ricerca, costi per clic o budget/);assert.match(p,/«Forno Aurora»/);assert.match(p,/raggio di 10 km/);assert.match(p,/https:\/\/www\.fornoaurora\.it\/ordina/);assert.match(p,/Catering fino a 80 persone/);assert.match(p,/niente punto esclamativo nei titoli/);
 await assert.rejects(S.generateStructures({answers:F.ANSWERS,rt:{reply:async()=>({text:'non so'})},confirm:async()=>true}),/strutture valide/);
 await assert.rejects(S.generateStructures({answers:F.ANSWERS,rt:null,confirm:async()=>true}),/Gli agenti/);
});

test('saved in the project: key searchAds in the agents document, other keys kept, retried on a conflict; agents-page keeps it',async()=>{
 const s=fixed(),is=S.checks(s,CTX);let stored={schemaVersion:1,conversations:{'paid-media':[{role:'user',content:'ciao'}]},prefs:{a:1},adCreatives:{schemaVersion:1,items:[{id:'ad'}]},searchAds:{schemaVersion:1,items:[{id:'old',structure:{campaigns:[{groups:[]}]}}]}},conflicts=1;
 class ConflictError extends Error{}
 const ws={ConflictError,bind:(pid,name)=>{assert.equal(pid,'forno-aurora');assert.equal(name,'agents');return {load:async()=>JSON.parse(JSON.stringify(stored)),save:async x=>{if(conflicts-->0)throw new ConflictError('x');stored=x}}}};
 const rec=S.savedRecord(s,F.ANSWERS,{by:'Giulia',at:'2026-10-23T09:00:00.000Z',issues:is});assert.equal(rec.id,'gads-20261023090000-una-campagna-per-servizi');assert.equal(rec.kind,'servizio');assert.equal(rec.answers.budget,20);assert.deepEqual(rec.counts,S.counts(s));assert.equal(rec.errors,0);
 await S.saveToProject(ws,'forno-aurora',rec);
 assert.deepEqual(stored.searchAds.items.map(x=>x.id),['old',rec.id]);assert.deepEqual(stored.adCreatives,{schemaVersion:1,items:[{id:'ad'}]});assert.deepEqual(stored.prefs,{a:1});assert.equal(stored.conversations['paid-media'].length,1);
 for(let i=0;i<14;i++)await S.saveToProject(ws,'forno-aurora',{...rec,id:'r'+i});assert.equal(stored.searchAds.items.length,12,'only the last 12');
 assert.deepEqual(S.readStore({searchAds:'boh'}),{schemaVersion:1,items:[]});assert.deepEqual(S.readStore({searchAds:{items:[{id:'x'},{id:'y',structure:{campaigns:[]}}]}}).items,[],'a record without campaigns is ignored');
 const back=S.fromRecord(rec);assert.deepEqual(S.editorRows(back.structure,back.answers),S.editorRows(s,F.ANSWERS),'reopened as it was');
 const src=read('agents-page.js'),fn=/function clean\(d\)\{[^\n]*\}/.exec(src)[0],ctx={MAX_KEPT:40};vm.createContext(ctx);vm.runInContext(fn+';this.clean=clean',ctx);
 const kept=ctx.clean({...stored,conversations:{a:[{role:'user',content:'x'},{role:'assistant',content:'…',pending:true}]}});
 assert.deepEqual(JSON.parse(JSON.stringify(kept.searchAds)),stored.searchAds,'searchAds kept by agents-page clean()');
 assert.match(src,/\n\s+data\.coordinato=fresh\.coordinato;[^\n]*data\.searchAds=fresh\.searchAds;/,'kept after a save conflict');
 assert.match(src,/if\(fresh&&data\)\{[^}]*data\.searchAds=fresh\.searchAds;/,'and when the tab comes back');
 assert.equal(require('../lib/report-studio.js').MATERIALS.searchAds,'Campagne Google Ads','counted in the monthly report');
});

test('the card in «Cosa vuoi fare»: Web e annunci, inline studio, one confirmed AI call, icon, script, styles',()=>{
 const c=crea.card('searchads');assert.equal(c.group,'Web e annunci');assert.equal(c.title,'Campagne Google Ads Search');assert.equal(c.inline,'searchads');assert.equal(crea.linkFor(c,'forno'),null);
 assert.match(c.cost,/^Una chiamata AI al Paid Media Specialist, con conferma\./);assert.deepEqual(crea.costBadge(c),{tone:'ai',label:'1 chiamata AI'});assert.match(c.hint,/non disponibile/);assert.match(c.hint,/in pausa/);
 assert.equal(crea.best('campagne google ads'),'searchads');assert.equal(crea.best('parole chiave e cpc per adwords'),'searchads');assert.equal(crea.best('scheda google'),'google');
 assert.equal(look.CARDS.searchads,'searchAds');assert.ok(look.has('searchAds'));
 const js=read('agency/crea.js');assert.match(js,/searchads:\{global:'RadixSearchAdsStudio'[^}]*agent:'paid-media'\}/);
 assert.match(js,/S\.searchAdsStudio\(\{project,profile:current\.profile,projectName:current\.name,memoryScope,projectId:current\.id,workspace:ws,rt,agentsUrl:'\/agents\.html\?agent=paid-media&project='\+pid\}\)/);
 const html=read('agency/crea.html'),at=f=>html.indexOf(f);
 for(const f of ['/lib/print-studio.js','/lib/copy-checks.js','/lib/copy-studio.js','/lib/zip-lite.js','/lib/radix-confirm.js'])assert.ok(at(f)>=0&&at(f)<at('/lib/search-ads-studio.js'),f+' before search-ads-studio');
 assert.ok(at('/lib/search-ads-studio.js')<at('/agency/crea.js'));
 const css=read('shell/crea.css'),block=css.slice(css.indexOf('Studio Campagne Google Ads Search'));assert.match(block,/\.cr-panel \.search-ads-studio \[data-level=error\]/);assert.doesNotMatch(block,/var\(--rx-(?!font|display)/,'light --ma-* tokens');
 const src=read('lib/search-ads-studio.js');assert.match(src,/'ad-dir sa-dir'/,'the three structures get the «Scelta» ring');
 // the only AI path: generateStructures → rt.reply, after the confirmation; no request of its own
 assert.equal((src.match(/\.reply\(/g)||[]).length,1);assert.ok(/const ok=await \(confirm\|\|askConfirm\)[^]*if\(!ok\)return \{cancelled:true\};[^]*rt\.reply\(/.test(src),'confirmation before the call');
 assert.ok(!/\bfetch\(|XMLHttpRequest|['"`]\/api\//.test(src),'no direct request: no Google Ads API, no AI outside RadixAgents');
});
