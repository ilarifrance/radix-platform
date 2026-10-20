'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const v=require('../lib/video-studio.js');

test('word budget follows the length at ~2.3 spoken Italian words a second',()=>{
 assert.deepEqual(v.wordBudget(15),{seconds:15,target:35,min:30,max:39});
 assert.deepEqual(v.wordBudget(30),{seconds:30,target:69,min:59,max:76});
 assert.deepEqual(v.wordBudget(60),{seconds:60,target:138,min:117,max:152});
 assert.equal(v.wordBudget('nonsense').seconds,30);
 assert.equal(v.countWords("Ciao, sono l'avatar di RADIX: 3 consigli."),7);
 assert.equal(v.secondsFor('uno due tre quattro cinque sei sette otto nove dieci undici dodici tredici quattordici quindici sedici diciassette diciotto diciannove venti ventuno ventidue ventitre'),10);
});

test('the questions: goal, length, tone, call to action; 30 seconds by default; prefill from the profile',()=>{
 assert.deepEqual(v.QUESTIONS.map(q=>q.id),['goal','length','tone','cta']);
 assert.deepEqual(v.QUESTIONS[1].options.map(o=>o[1]),['15','30','60']);
 assert.equal(v.labelOf('length',undefined),'30 secondi');
 for(const q of v.QUESTIONS)assert.ok(q.options.length>=3&&q.options.every(o=>o[0]&&o[1]),q.id);
 const goals=v.QUESTIONS[0].options.map(o=>o[0]);for(const g of ['Presentazione','Offerta','Consiglio pratico','Invito a un evento'])assert.ok(goals.includes(g),g);
 const pre=v.prefill({summary:'Studio di commercialisti per startup a Milano. Seguiamo 200 aziende.',voice:'Professionale e autorevole, mai gergale.'});
 assert.equal(pre.topic,'Studio di commercialisti per startup a Milano.');
 assert.equal(v.labelOf('tone',pre.tone),'Professionale');
 assert.equal(v.labelOf('tone',v.prefill({voice:'Ironico e leggero'}).tone),'Ironico leggero');
 assert.deepEqual(v.prefill(null),{topic:'',tone:v.QUESTIONS[2].options[0][1]});
});

test('one prompt asks for exactly 3 scripts in the parseable format with the word budget of the length',()=>{
 const p=v.scriptsPrompt({goal:v.QUESTIONS[0].options[3][1],length:'15',cta:v.QUESTIONS[3].options[3][1]},{topic:'  La serata di presentazione del nuovo servizio  ',project:{name:'Doc Capital'},avatar:{name:'Giulia'}});
 assert.match(p,/^Scrivi 3 copioni/);
 assert.match(p,/«Doc Capital»/);assert.match(p,/«Giulia»/);
 assert.match(p,/«La serata di presentazione del nuovo servizio»/);
 assert.match(p,/invitare a un evento/);assert.match(p,/iscriversi all’evento/);
 assert.match(p,/Durata: 15 secondi\. Ogni copione deve avere tra 30 e 39 parole \(circa 35\)/);
 for(const n of [1,2,3])assert.ok(p.includes('===COPIONE '+n+'==='),n);
 assert.ok(!p.includes('===COPIONE 4==='));assert.match(p,/===FINE===$/);
 assert.match(v.scriptsPrompt({},{topic:'Un consiglio sulle tasse di fine anno'}),/Durata: 30 secondi\. Ogni copione deve avere tra 59 e 76 parole/);
 assert.match(v.scriptsPrompt({length:'60'},{topic:'Un consiglio sulle tasse di fine anno'}),/tra 117 e 152 parole/);
 assert.throws(()=>v.scriptsPrompt({},{topic:'corto'}),/di cosa parla/);
 assert.throws(()=>v.scriptsPrompt({length:'45'},{topic:'Un consiglio sulle tasse di fine anno'}),/Durata/);
 // what the prompt asks for is what the parser reads back
 const echo=p.split('Rispondi solo in questo formato, senza testo prima o dopo:\n')[1].replace(/\(il copione\)/g,'Ciao, oggi ti racconto una cosa utile in pochi secondi.');
 assert.equal(v.parseScripts(echo).length,3);
});

test('parsing: three scripts, markdown and stage directions removed, text after the end ignored',()=>{
 const r=['Ecco i copioni:','','**===COPIONE 1===**','TITOLO: **Il primo giorno**','TESTO:','Hai appena aperto la partita IVA? [sorride] Ecco tre errori che ti costano caro. Scrivimi in privato.','',
  '=== COPIONE 2 ===','Titolo: Un dato','Testo: Fine del mese e tasse da pagare: ecco come organizzarti senza ansia 🚀 , passo dopo passo.',
  '## Copione 3: Una storia','Marco era bloccato da mesi con la sua attività. (pausa) Poi ha cambiato metodo.','===FINE===','Spero ti piacciano!'].join('\n');
 const s=v.parseScripts(r);
 assert.equal(s.length,3);
 assert.deepEqual(s.map(x=>x.title),['Il primo giorno','Un dato','Una storia']);
 assert.equal(s[0].text,'Hai appena aperto la partita IVA? Ecco tre errori che ti costano caro. Scrivimi in privato.');
 assert.match(s[1].text,/^Fine del mese/,'a line starting with «Fine» is not the end marker');
 assert.match(s[1].text,/senza ansia, passo dopo passo\.$/);
 assert.equal(s[2].text,'Marco era bloccato da mesi con la sua attività. Poi ha cambiato metodo.');
 assert.ok(s.every(x=>x.words===v.countWords(x.text)&&x.seconds>0));
 assert.ok(!/Spero/.test(s[2].text));
});

test('parsing malformed replies: nothing usable is [], extra scripts are cut to 3, JSON is accepted, empty ones skipped',()=>{
 for(const bad of [undefined,null,'','Mi dispiace, non posso aiutarti.','===COPIONE 1===\nTITOLO: Vuoto\nTESTO:\n\n===COPIONE 2===\nTESTO: due parole'])assert.deepEqual(v.parseScripts(bad),[],String(bad));
 const many=[1,2,3,4,5].map(n=>'===COPIONE '+n+'===\nTITOLO: T'+n+'\nTESTO:\nQuesto è il copione numero '+n+' del video.').join('\n');
 assert.deepEqual(v.parseScripts(many).map(x=>x.title),['T1','T2','T3']);
 const two=v.parseScripts('===COPIONE 1===\nTESTO: uno due tre quattro cinque sei\n===COPIONE 2===\nTESTO:\n\n===COPIONE 3===\nTESTO: sette otto nove dieci undici dodici');
 assert.deepEqual(two.map(x=>x.title),['Copione 1','Copione 2'],'the empty one is skipped, titles fall back');
 const j=v.parseScripts('```json\n{"scripts":[{"title":"A","text":"uno due tre quattro cinque sei"},{"titolo":"B","testo":"sette otto nove dieci undici"},"dodici tredici quattordici quindici sedici"]}\n```');
 assert.deepEqual(j.map(x=>x.title),['A','B','Copione 3']);
 assert.deepEqual(v.parseScripts('[not json'),[]);
 assert.ok(v.parseScripts('===COPIONE 1===\nTESTO: '+'parola '.repeat(600)).every(x=>x.text.length<=1500));
});

test('the HeyGen draft reuses the existing «generate» action with the saved avatar and voice',()=>{
 assert.deepEqual(v.draftBody({type:'talking_photo',id:'look1',voiceId:'v1',name:'Giulia'},'Ciao a tutti, oggi un consiglio veloce. [sorride]'),{action:'generate',script:'Ciao a tutti, oggi un consiglio veloce.',voiceId:'v1',talkingPhotoId:'look1'});
 assert.deepEqual(v.draftBody({type:'avatar',id:'av9',voiceId:'v2'},'uno due tre quattro cinque'),{action:'generate',script:'uno due tre quattro cinque',voiceId:'v2',avatarId:'av9'});
 assert.throws(()=>v.draftBody(null,'uno due tre quattro cinque'),/avatar salvato/);
 assert.throws(()=>v.draftBody({id:'x'},'uno due tre quattro cinque'),/avatar salvato/,'an avatar without voice is not saved');
 assert.throws(()=>v.draftBody({id:'x',voiceId:'v'},'  '),/vuoto/);
 assert.equal(v.savedAvatar({avatar:{id:'a',voiceId:'v'}}).id,'a');assert.equal(v.savedAvatar({avatar:{id:'a'}}),null);assert.equal(v.savedAvatar(null),null);
 const heygen=fs.readFileSync(path.join(__dirname,'..','api/_heygen.js'),'utf8');
 assert.match(heygen,/action === 'generate'[\s\S]*talkingPhotoId/,'the server action the studio relies on');
});

test('the widget confirms before the AI call and before HeyGen, and uses the Video Producer',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','lib/video-studio.js'),'utf8');
 assert.match(src,/confirm\('Scrivere 3 copioni[^']*una sola chiamata AI: usa crediti API\.'\)\)return;\s*lock\(true\)/);
 assert.match(src,/confirm\('Creare la bozza video su HeyGen[^\n]*Consuma crediti HeyGen[^\n]*'\)\)return;/);
 assert.match(src,/rt\.reply\(\{role:'video-producer',project:ctx\.project,memoryScope:ctx\.memoryScope/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','lib/radix-agent-runtime.js'),'utf8'),/id:'video-producer'/);
});
