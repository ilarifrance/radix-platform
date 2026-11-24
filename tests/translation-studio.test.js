'use strict';
// Studio «Traduzione e localizzazione» (lib/translation-studio.js): the deterministic checks (numbers, codes, links and
// emails identical; lengths; glossary; language formats), what is never sent to the AI, the CSV round trip with one
// column per language, the batch math, the paid steps with a fake confirmation and a fake AI (Annulla = no call,
// conferma = exactly one call per batch; never a real call), the exports by source, the card in «Cosa vuoi fare» and
// the saved key that agents-page.js keeps.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const T=require('../lib/translation-studio.js'),CSV=require('../sales/crm-csv-core.js'),ZIP=require('../lib/zip-lite.js'),P=require('../lib/product-studio.js');
const crea=require('../agency/crea-core.js'),look=require('../agency/marketing-look.js');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');

// A fake AI that translates by tagging each text with its language and keeps every ⟦n⟧: it reads the JSON of the prompt.
function fakeAi({drop=null,tones=true}={}){const calls=[];
 const textsOf=prompt=>{const lines=prompt.split('\n'),i=lines.findIndex(l=>/^I testi( di questo lotto)? \(JSON\):$/.test(l));return JSON.parse(lines[i+1])};
 const langsOf=prompt=>(/^Traduci dall’italiano in: (.+)\.$/m.exec(prompt)[1]).split('; ').map(x=>x.slice(0,2).toLowerCase());
 const tr=(list,langs,tag)=>list.map(x=>Object.assign({id:x.id},...langs.map(l=>({[l]:(drop&&drop(x,l)?x.testo.replace(/⟦\d+⟧/g,''):x.testo)+' ['+l+(tag?' '+tag:'')+']'}))));
 return {calls,reply:async({role,messages,project,memoryScope})=>{const p=messages[0].content;calls.push({role,prompt:p,project,memoryScope});const list=textsOf(p),langs=langsOf(p);
  if(/Traduci gli stessi testi in 3 toni/.test(p)&&tones)return {text:'```json\n'+JSON.stringify({toni:['Fedele','Naturale','Marketing'].map(t=>({tono:t,traduzioni:tr(list,langs,t.toLowerCase())}))})+'\n```'};
  return {text:JSON.stringify({traduzioni:tr(list,langs)})}}}}
const settings=(x={})=>T.normalizeSettings({langs:['en','de'],material:'catalogo',...x});

test('numbers, prices and dates: same values, the format may follow the language; a changed or added number is caught',()=>{
 const u={text:'La Pagnotta costa 4,50 € al chilo; 1.200 pezzi venduti, lievitazione di 24 ore, ritiro alle 18:00, prenota entro il 12/12/2026.'};
 assert.deepEqual(T.checkText(u,'The loaf costs €4.50 per kilo; 1,200 pieces sold, 24-hour proving, pick-up at 18:00, book by 12/12/2026.','en',[]),[]);
 assert.deepEqual(T.checkText(u,'Das Brot kostet 4,50 € pro Kilo; 1.200 verkaufte Stück, 24 Stunden Gare, Abholung um 18:00, bis 12.12.2026 bestellen.','de',[]),[]);
 assert.deepEqual(T.checkText(u,'Le pain coûte 4,50 € le kilo ; 1 200 pièces vendues, 24 heures de levée, retrait à 18:00, à réserver avant le 12 décembre 2026.','fr',[]),[],'month in words: day and year are enough');
 const bad=T.checkText(u,'The loaf costs €4.90 per kilo; 1,200 pieces sold, 48-hour proving, pick-up at 18:00, book by 13/12/2026.','en',[]);
 assert.deepEqual(bad.filter(i=>i.kind==='numbers').map(i=>i.msg),['Il numero «4,50» dell’originale manca o è cambiato.','Il numero «24» dell’originale manca o è cambiato.','Il numero «4.90» non c’è nell’originale.','Il numero «48» non c’è nell’originale.','La data «12/12/2026» manca o è cambiata.']);
 assert.ok(bad.every(i=>i.level==='fail'));
 // the formats of the language are warnings, not errors
 const fmt=T.checkText(u,'Das Brot kostet €4.50 pro Kilo; 1.200 verkaufte Stück, 24 Stunden Gare, Abholung um 18:00, bis 12/12/2026 bestellen.','de',[]);
 assert.deepEqual(fmt.map(i=>i.kind+':'+i.level),['format:warn','format:warn','format:warn']);assert.match(fmt[0].msg,/virgola/);assert.match(fmt[1].msg,/dopo l’importo/);assert.match(fmt[2].msg,/12\.12\.2026/);
 assert.deepEqual(T.checkText({text:'Prezzo 4,50 €'},'Price 4,50 €','en',[]).map(i=>i.msg),['In inglese i decimali si scrivono con il punto: «4,50 €».','In inglese il simbolo € va prima dell’importo: «4,50 €».']);
 assert.deepEqual(T.numValues('1.200').sort(),['1.2','1200']);assert.deepEqual(T.numValues('1 200'),['1200']);assert.deepEqual(T.numValues('4,50'),['4.5']);assert.deepEqual(T.numValues('18:30'),['18.3']);
 assert.equal(T.levelOf(bad),'fail');assert.equal(T.levelOf(fmt),'warn');assert.equal(T.levelOf([]),'ok');
});

test('codes, SKUs, EANs, links, emails and phone numbers: never sent to the AI, back identical; a changed one is caught',()=>{
 const src='La Pagnotta (codice AUR-001, EAN 8034560003708) si ordina su https://www.fornoaurora.it/pane o www.fornoaurora.it: scrivi a ordini@fornoaurora.it o chiama 011 123 4567. Ciao {{nome}}!';
 const m=T.mask(src);
 assert.deepEqual(m.tokens,['https://www.fornoaurora.it/pane','www.fornoaurora.it','{{nome}}','ordini@fornoaurora.it','011 123 4567','AUR-001','8034560003708'].sort((a,b)=>src.indexOf(a)-src.indexOf(b)));
 for(const t of m.tokens)assert.ok(!m.text.includes(t),t);assert.ok(!T.personalIn(m.text),'no email, no phone in what is sent');
 assert.equal(T.unmask(m.text,m.tokens),src);assert.equal(T.unmask('⟦ 1 ⟧ e [[2]]',['A-1','B-2']),'A-1 e B-2');
 const en=T.unmask(m.text.replace('si ordina su','is ordered at'),m.tokens);assert.deepEqual(T.checkText({text:src},en,'en',[]).filter(i=>i.kind==='codes'),[]);
 const broken=en.replace('AUR-001','AUR-01').replace('ordini@fornoaurora.it','orders@fornoaurora.it').replace('https://www.fornoaurora.it/pane','https://www.fornoaurora.it/bread');
 assert.deepEqual(T.checkText({text:src},broken,'en',[]).filter(i=>i.kind==='codes').map(i=>i.msg),['Codice «AUR-001» non è identico all’originale.','Link «https://www.fornoaurora.it/pane» non è identico all’originale.','Email «ordini@fornoaurora.it» non è identico all’originale.']);
 assert.deepEqual(T.checkText({text:'Codice AUR-001'},'Code ⟦1⟧','en',[]).map(i=>i.kind),['codes','codes'],'a placeholder left behind');
 // the prompts carry the placeholders only
 const items=T.fromText(src);const {prompt}=T.batchPrompt(items,'naturale',settings(),[]);
 for(const t of m.tokens)assert.ok(!prompt.includes(t),'never in the prompt: '+t);assert.match(prompt,/⟦1⟧/);
 // numbers that are not codes stay in the text, adapted by the AI
 assert.deepEqual(T.protectedIn('Prezzo 4,50 €, 1.200 pezzi, 12/12/2026, ore 18:00, 250 g, A5').map(p=>p.value),[]);
});

test('lengths: the field limit (Merchant title 150, meta 155, SEO title 70, alt 125…) and a warning over +30%',()=>{
 assert.equal(T.limitFor('Titolo'),150);assert.equal(T.limitFor('Nome prodotto'),150);assert.equal(T.limitFor('Meta description'),155);assert.equal(T.limitFor('Titolo SEO'),70);assert.equal(T.limitFor('Alt immagine'),125);
 assert.equal(T.limitFor('Oggetto'),60);assert.equal(T.limitFor('Anteprima'),110);assert.equal(T.limitFor('Descrizione'),5000);assert.equal(T.limitFor('Ingredienti'),null);
 const u={text:'Pane a lievito madre, cotto nel forno a legna ogni notte.',max:60};
 assert.deepEqual(T.checkText(u,'Sourdough bread, baked in the wood-fired oven every night.','en',[]),[]);
 const long=T.checkText(u,'Sourdough bread, slowly baked in our traditional wood-fired oven every single night.','en',[]);assert.deepEqual(long.map(i=>i.kind+':'+i.level),['length:fail']);assert.match(long[0].msg,/su 60: oltre il limite del campo/);
 const free=T.checkText({text:u.text},'Sourdough bread, slowly baked in our traditional wood-fired oven every night.','en',[]);assert.deepEqual(free.map(i=>i.kind+':'+i.level),['length:warn']);assert.match(free[0].msg,/^\+\d+% rispetto all’originale/);
 assert.deepEqual(T.checkText({text:'Pane'},'Bread made the old way','en',[]),[],'short labels: no expansion warning');
 // the limits come with the units: meta and SEO lines of a page, the fields of a product sheet
 const page=T.fromText(T.SAMPLE_TEXT);assert.deepEqual(page[0].units.map(x=>x.label+':'+x.max),['Titolo:null','Paragrafo:null','Titolo SEO:70','Meta description:155']);
 const tooLong={text:'x',max:155};assert.equal(T.checkText({...tooLong,text:'Meta'},'M'.repeat(156),'en',[])[0].kind,'length');
});

test('glossary: terms not to translate stay identical, forced translations are used; the prompt lists both',()=>{
 const G=T.parseGlossary('Forno Aurora\n- Panettone\nlievito madre = EN: sourdough; DE: Sauerteig | FR: levain\ngrissini = grissini\n\n# commento\nForno Aurora');
 assert.deepEqual(G,[{term:'Forno Aurora',forced:null},{term:'Panettone',forced:null},{term:'lievito madre',forced:{en:'sourdough',de:'Sauerteig',fr:'levain'}},{term:'grissini',forced:{all:'grissini'}}]);
 const u={text:'Il Panettone di Forno Aurora con lievito madre e grissini.'};
 assert.deepEqual(T.checkText(u,'The Panettone by Forno Aurora with sourdough and grissini.','en',G),[]);
 assert.deepEqual(T.checkText(u,'Der Panettone von Forno Aurora mit Sauerteig und Grissini.','de',G),[],'forced: case does not matter');
 assert.deepEqual(T.checkText({text:'Pane a lievito madre'},'Sauerteigbrot','de',G),[],'forced: inside a German compound');
 assert.deepEqual(T.checkText(u,'The panettone by Aurora Bakery with mother yeast and breadsticks.','en',G).map(i=>i.msg),['«Forno Aurora» non va tradotto: deve restare identico.','«Panettone» non va tradotto: deve restare identico.','Per «lievito madre» usa «sourdough».','Per «grissini» usa «grissini».']);
 assert.deepEqual(T.checkText(u,'El Panettone de Forno Aurora con masa madre y grissini.','es',G),[],'no ES word given for lievito madre: nothing forced');
 assert.deepEqual(T.checkText({text:'Pane e focacce.'},'Bread and focaccia.','en',G),[],'terms not in the original are not checked');
 const p=T.rules(settings({langs:['en','de']}),G).join('\n');assert.match(p,/Non tradurre, scrivi identici: «Forno Aurora», «Panettone»\./);assert.match(p,/«lievito madre» → EN «sourdough», DE «Sauerteig»/);
 assert.match(p,/EN: decimali con il punto \(4\.50\)/);assert.match(p,/DE: decimali con la virgola/);
 // the summary: no glossary, no glossary check
 const items=T.fromText('Pane e focacce.'),out=new Map([[items[0].units[0].k,{en:'Bread and focaccia.',de:'Brot und Focaccia.'}]]);
 assert.equal(T.summary(items,out,settings()).checks.find(c=>c.id==='glossary').state,'off');
 assert.equal(T.summary(items,out,settings({glossary:'Forno Aurora'})).checks.find(c=>c.id==='glossary').state,'ok');
 assert.match(T.glossaryCsv(G,['en','de']),/^﻿Termine;Regola;EN;DE\r\nForno Aurora;non tradurre;Forno Aurora;Forno Aurora\r\n/);
});

test('sheets: personal columns are never chosen nor sent; CSV round trip with one column per language next to each translated column',async()=>{
 const sheet={name:'listino.csv',headers:['Codice','Nome prodotto','Descrizione','Prezzo','Email referente','Telefono','Note'],rows:[
  {Codice:'AUR-001','Nome prodotto':'Pagnotta di semola',Descrizione:'Crosta croccante, 1 kg; si ordina su www.fornoaurora.it.',Prezzo:'4,50','Email referente':'mario.rossi@example.com',Telefono:'333 123 4567',Note:'Cliente storico, chiamare dopo le 17'},
  {Codice:'AUR-002','Nome prodotto':'Filone integrale',Descrizione:'Farina integrale e lievito madre, 750 g.',Prezzo:'3,80','Email referente':'anna@example.com',Telefono:'',Note:''}]};
 const cols=T.sheetColumns(sheet);
 assert.deepEqual(cols.filter(c=>c.personal).map(c=>c.name),['Email referente','Telefono']);assert.deepEqual(cols.filter(c=>c.auto).map(c=>c.name),['Nome prodotto','Descrizione','Note']);
 const items=T.fromSheet(sheet,['Nome prodotto','Descrizione','Email referente','Telefono'],{name:sheet.name});
 assert.deepEqual(items.map(it=>it.key+':'+it.name+':'+it.units.map(u=>u.label+'/'+u.max).join(',')),['R2:Pagnotta di semola:Nome prodotto/150,Descrizione/5000','R3:Filone integrale:Nome prodotto/150,Descrizione/5000']);
 const s=settings({langs:['en','de']}),ai=fakeAi(),out=new Map();
 const r=await T.requestBatches({items,settings:s,styleId:'fedele',out,rt:ai,confirm:async()=>true});assert.equal(r.status,'done');assert.equal(ai.calls.length,1);
 for(const c of ai.calls){assert.ok(!/mario\.rossi|anna@|333 123 4567|Cliente storico/.test(c.prompt),'no personal data sent');assert.equal(c.memoryScope,undefined,'no memory scope');assert.equal(c.role,'copywriter')}
 const csv=T.sheetCsv(sheet,['Nome prodotto','Descrizione'],out,s.langs),back=CSV.parse(csv);
 assert.deepEqual(back.headers,['Codice','Nome prodotto','Nome prodotto (EN)','Nome prodotto (DE)','Descrizione','Descrizione (EN)','Descrizione (DE)','Prezzo','Email referente','Telefono','Note']);
 assert.equal(back.rows.length,2);assert.equal(back.rows[0]['Email referente'],'mario.rossi@example.com','the rest of the file is kept as it was');
 assert.equal(back.rows[0]['Nome prodotto (EN)'],'Pagnotta di semola [en]');assert.equal(back.rows[1]['Descrizione (DE)'],'Farina integrale e lievito madre, 750 g. [de]');
 assert.equal(back.rows[0]['Descrizione (EN)'],'Crosta croccante, 1 kg; si ordina su www.fornoaurora.it. [en]','the link went out as ⟦1⟧ and came back');
 for(const row of back.rows)for(const h of sheet.headers)assert.equal(row[h],sheet.rows[back.rows.indexOf(row)][h],h);
 // formulas stay text
 assert.match(T.sheetCsv({headers:['A'],rows:[{A:'=1+1'}]},[],new Map(),['en']),/'=1\+1/);
 // the example sheet of the Studio Schede prodotto: text columns chosen by name and content, codes and links left alone
 const ex=T.sampleSheet();assert.equal(ex.rows.length,30);assert.deepEqual(T.sheetColumns(ex).filter(c=>c.auto).map(c=>c.name),['Nome prodotto','Descrizione','Categoria','Ingredienti','Confezione','Materiale']);
});

test('batches: at most 10 items and about 12,000 characters × languages per call; the confirmation states the calls',()=>{
 const mk=(k,len)=>Array.from({length:k},(_,i)=>({key:'I'+i,name:'Elemento '+i,units:[{k:'I'+i+'|t',text:'x'.repeat(len)}]}));
 assert.deepEqual(T.planBatches(mk(25,100),['en','de','fr','es'],null).map(b=>b.length),[10,10,5],'by count');
 assert.deepEqual(T.planBatches(mk(12,1000),['en','de'],null).map(b=>b.length),[6,6],'by size: 6 × 1000 × 2 = 12,000');
 assert.deepEqual(T.planBatches(mk(3,7000),['en','de'],null).map(b=>b.length),[1,1,1],'an item bigger than a call goes alone');
 assert.deepEqual(T.planBatches(mk(4,100),['en'],null,{maxItems:3}).map(b=>b.length),[3,1]);
 assert.deepEqual(T.planBatches([],['en'],null),[]);
 // items already translated in every language are not planned again
 const items=mk(5,100),out=new Map([['I0|t',{en:'a',de:'b'}],['I1|t',{en:'a'}]]);
 assert.deepEqual(T.planBatches(items,['en','de'],out),[['I1','I2','I3','I4']]);
 const f=T.planFacts(T.planBatches(mk(25,100),['en','de','fr','es'],null),mk(25,100),['en','de','fr','es']);
 assert.equal(f.calls,3);assert.equal(f.items,25);assert.equal(f.chars,2500);assert.match(f.cost,/^Sono 3 chiamate AI, una per lotto: usano crediti API\.$/);
 assert.deepEqual(f.facts.map(x=>x[0]),['Elementi','Lingue','Testo da tradurre','Chiamate AI']);assert.equal(f.facts[1][1],'EN · DE · FR · ES');assert.equal(f.facts[3][1],'3 al Copywriter, una per lotto');
 assert.match(T.planFacts([['I0']],mk(1,10),['en']).cost,/^È una sola chiamata AI/);
});

test('the paid steps: Annulla = no AI call; conferma = exactly one call for the tones and one per batch',async()=>{
 const sheet=T.sampleSheet(),cols=T.sheetColumns(sheet).filter(c=>c.auto).map(c=>c.name),items=T.fromSheet(sheet,cols),s=settings({langs:['en','de','fr'],glossary:'Forno Aurora\nlievito madre = EN: sourdough; DE: Sauerteig; FR: levain'});
 assert.equal(items.length,30);
 // the three tones
 let ai=fakeAi(),asked=[];
 let r=await T.requestProposals({items,settings:s,rt:ai,confirm:async o=>{asked.push(o);return false}});
 assert.deepEqual(r,{cancelled:true});assert.equal(ai.calls.length,0,'Annulla: no call');assert.equal(asked.length,1);
 assert.match(asked[0].title,/Provo 3 toni sui primi 3 elementi/);assert.match(asked[0].cost,/una sola chiamata AI: usa crediti API/);assert.deepEqual(asked[0].facts.find(f=>f[0]==='Chiamate AI'),['Chiamate AI','1, al Copywriter']);
 let started=0;r=await T.requestProposals({items,settings:s,rt:ai,confirm:async()=>true,onStart:()=>started++});
 assert.equal(ai.calls.length,1);assert.equal(started,1);assert.deepEqual(r.samples.map(x=>x.key),['R2','R3','R4'],'the first 3 items');
 assert.deepEqual(r.proposals.map(p=>p.style),['fedele','naturale','marketing']);
 assert.equal(r.proposals[1].out.get('R2|c:Nome prodotto').de,'Pagnotta di semola rimacinata [de naturale]');
 assert.match(ai.calls[0].prompt,/Fedele: fedele/);assert.match(ai.calls[0].prompt,/Marketing: marketing/);
 // pick «Naturale», then the rest in batches
 const out=new Map();for(const [k,o] of r.proposals[1].out)out.set(k,{...o});
 const plan=T.planBatches(items,s.langs,out);assert.equal(plan.flat().length,27);
 ai=fakeAi();asked=[];
 let b=await T.requestBatches({items,settings:s,styleId:'naturale',out,rt:ai,confirm:async o=>{asked.push(o);return false}});
 assert.deepEqual(b,{cancelled:true});assert.equal(ai.calls.length,0,'Annulla: no call');
 assert.match(asked[0].title,new RegExp('^Traduco gli altri 27 elementi in '+plan.length+' lott'));assert.equal(asked[0].ok,'Traduci ('+plan.length+' chiamate)');
 assert.deepEqual(asked[0].facts.find(f=>f[0]==='Chiamate AI'),['Chiamate AI',plan.length+' al Copywriter, una per lotto']);assert.match(asked[0].cost,/crediti API/);
 b=await T.requestBatches({items,settings:s,styleId:'naturale',out,rt:ai,confirm:async()=>true});
 assert.equal(b.status,'done');assert.equal(ai.calls.length,plan.length,'exactly one call per batch');assert.equal(b.run.calls,plan.length);
 assert.ok(ai.calls.every(c=>/Tono scelto: naturale/.test(c.prompt)));
 assert.deepEqual(T.planBatches(items,s.langs,out),[],'everything translated');
 const sum=T.summary(items,out,s);assert.equal(sum.done,sum.total);assert.deepEqual(sum.checks.filter(c=>c.id==='codes'||c.id==='numbers').map(c=>c.state),['ok','ok'],'codes and numbers came back');
 // nothing left: no confirmation, no call
 ai=fakeAi();asked=[];assert.deepEqual(await T.requestBatches({items,settings:s,styleId:'naturale',out,rt:ai,confirm:async o=>{asked.push(o);return true}}),{nothing:true});assert.equal(asked.length+ai.calls.length,0);
 // an empty selection is refused before anything is asked
 await assert.rejects(T.requestProposals({items:[],settings:s,rt:ai,confirm:async o=>{asked.push(o);return true}}),/Non c’è nessun testo/);assert.equal(asked.length,0);
});

test('a batch that loses a code is caught; pause between batches, resume without a new confirmation; failed batches retried',async()=>{
 const mk=k=>Array.from({length:k},(_,i)=>({key:'I'+i,name:'Elemento '+i,units:[{k:'I'+i+'|t',text:'Articolo AUR-'+String(i).padStart(3,'0')+' a 4,50 €.',max:null}]}));
 const items=mk(25),s=settings({langs:['en']}),out=new Map();
 const ai=fakeAi({drop:(x,l)=>x.testo.includes('⟦1⟧')&&out.size===0});
 let n=0;const r=await T.requestBatches({items,settings:s,styleId:'fedele',out,rt:ai,confirm:async()=>true,onUpdate:run=>{if(run.batches[0].status==='done'&&!run.paused&&++n)run.paused=true}});
 assert.equal(r.status,'paused');assert.equal(ai.calls.length,1,'paused after the first batch');assert.deepEqual(T.runCounts(r.run),{total:3,done:1,error:0,todo:2});
 const bad=T.results(items,out,s).filter(x=>x.text&&x.issues.some(i=>i.kind==='codes'));assert.equal(bad.length,10,'the first batch lost its codes: flagged');
 r.run.paused=false;const status=await T.runBatches(r.run,T.keysCall({items,settings:s,styleId:'fedele',glossary:[],out,rt:ai}));
 assert.equal(status,'done');assert.equal(ai.calls.length,3,'resume: the 2 confirmed batches, no more');
 // a reply that misses items marks the batch as failed; «Riprova» puts it back
 const flaky={calls:0,reply:async()=>{flaky.calls++;return {text:'{"traduzioni":[]}'}}},out2=new Map();
 const r2=await T.requestBatches({items:mk(3),settings:s,styleId:'fedele',out:out2,rt:flaky,confirm:async()=>true});
 assert.equal(r2.run.batches[0].status,'error');assert.match(r2.run.batches[0].error,/3 elementi senza traduzione/);assert.equal(T.retryFailed(r2.run),1);assert.equal(r2.run.batches[0].status,'todo');
 // a fatal error (credits) stops the run
 const broke={reply:async()=>{throw Error('Credito API esaurito')}};const r3=await T.requestBatches({items:mk(25),settings:s,styleId:'fedele',out:new Map(),rt:broke,confirm:async()=>true});
 assert.equal(r3.status,'stopped');assert.deepEqual(T.runCounts(r3.run),{total:3,done:0,error:1,todo:2});
});

test('native-speaker review: legal and technical texts are flagged, or everything when the person says so',()=>{
 const it=t=>({units:[{text:t}]});
 assert.match(T.reviewReason(it('Leggi l’informativa privacy ai sensi del Regolamento (UE) 2016/679.'),{}),/legale/);
 assert.match(T.reviewReason(it('Ingredienti: farina, burro. Allergeni: glutine.'),{}),/tecnico/);
 assert.match(T.reviewReason(it('Potenza 1200 W, tensione 230 V.'),{}),/tecnico/);
 assert.equal(T.reviewReason(it('Pane buono ogni giorno.'),{}),'');
 assert.match(T.reviewReason(it('Pane buono ogni giorno.'),{technical:true}),/Hai indicato testi tecnici o legali/);
 const items=T.fromText(T.SAMPLE_TEXT);assert.equal(T.summary(items,new Map(),settings()).review,1,'the allergens section');
 assert.match(T.reportCsv(items,new Map(),settings()),/Allergeni;;EN DE;Revisione madrelingua;avviso;"Testo tecnico/);
});

test('saved product sheets → translated copies, one per language, and the CSV with the languages side by side',()=>{
 const sheet=P.sampleSheet(),settingsP=P.normalizeSettings({}),mapping=P.detectMapping(sheet.headers,sheet.rows),products=P.toProducts(sheet.rows,mapping,settingsP).products.slice(0,2);
 const items=new Map(products.map((p,i)=>[p.key,{key:p.key,title:p.name+' Forno Aurora',description:'Descrizione '+i+': 1 kg, codice '+p.id+'.',bullets:['Punto uno','Punto due'],meta:'Meta '+i,alt:'Foto '+i,status:'ok',flags:[],issues:[]}]));
 const rec=P.savedRecord({fileName:'esempio.csv',sheet:{headers:sheet.headers,rows:sheet.rows.slice(0,2)},mapping,settings:settingsP,styleId:'essenziale',items},{at:'2026-10-22T10:00:00.000Z'});
 const tItems=T.fromProductSheet(rec);
 assert.deepEqual(tItems.map(x=>x.id),['AUR-001','AUR-002']);assert.deepEqual(tItems[0].units.map(u=>u.field+':'+u.max),['title:150','description:5000','bullet0:200','bullet1:200','meta:155','alt:125']);
 const out=new Map();for(const it of tItems)for(const u of it.units)out.set(u.k,{en:u.text+' EN',de:u.text+' DE'});
 const copies=T.productCopies(tItems,out,['en','de']);assert.deepEqual(copies.map(c=>c.lang),['en','de']);
 assert.deepEqual(copies[0].items[0],{key:'R2',id:'AUR-001',title:'Pagnotta di semola rimacinata Forno Aurora EN',description:'Descrizione 0: 1 kg, codice AUR-001. EN',bullets:['Punto uno EN','Punto due EN'],meta:'Meta 0 EN',alt:'Foto 0 EN'});
 const back=CSV.parse(T.productCsv(tItems,out,['en','de']));
 assert.deepEqual(back.headers,['Chiave','Codice','Titolo','Titolo (EN)','Titolo (DE)','Descrizione','Descrizione (EN)','Descrizione (DE)','Punti chiave','Punti chiave (EN)','Punti chiave (DE)','Meta description','Meta description (EN)','Meta description (DE)','Alt immagine','Alt immagine (EN)','Alt immagine (DE)']);
 assert.equal(back.rows[1]['Punti chiave (DE)'],'Punto uno DE\nPunto due DE');
 const files=T.exportFiles({kind:'sheets',name:'esempio',settings:settings({langs:['en','de']}),style:'fedele',items:tItems,out});
 assert.deepEqual(files.map(f=>f.name),['esempio-lingue.csv','schede-prodotto-en.csv','schede-prodotto-de.csv','glossario.csv','controlli.csv','LEGGIMI.txt']);
 assert.equal(CSV.parse(files[1].data).rows[0].Titolo,'Pagnotta di semola rimacinata Forno Aurora EN');
});

test('saved posts, newsletters and Studio Testi documents → translated text, as Markdown per language',()=>{
 const agents={conversations:{copywriter:[{role:'assistant',at:'2026-10-20T09:00:00Z',content:'Ecco.\n\n---DOCUMENTO: Comunicato stampa · Apertura---\n# Apriamo a Torino\n\nIl 12/11/2026 apriamo in via Roma 1.\n---FINE DOCUMENTO---'}]},
  newsletters:{schemaVersion:1,items:[{id:'nl-1',at:'2026-10-21T09:00:00Z',subject:'Il pane di novembre',preheader:'Tre novità dal forno e un invito per sabato mattina in negozio',blocks:[{type:'text',heading:'Novità',body:'Arriva il Panettone.'},{type:'button',label:'Scopri di più',url:'https://x.it'}]}]}};
 const editorial={contents:[{id:'c1',title:'Post del lunedì',channel:'Instagram',date:'2026-11-02',copy:'Il pane di oggi: semola e lievito madre. #pane'}]};
 const list=T.savedTexts(agents,editorial);
 assert.deepEqual(list.map(x=>x.kind+':'+x.title),['post:Post del lunedì','newsletter:Il pane di novembre','doc:Comunicato stampa · Apertura']);
 const items=T.fromSaved(list);
 assert.deepEqual(items.map(i=>i.name+'|'+i.units.map(u=>u.label+':'+u.max).join(',')),['Post del lunedì|Testo del post (Instagram):2200,Titolo:null','Il pane di novembre|Oggetto:60,Anteprima:110,Titolo del blocco:null,Testo:null,Pulsante:null','Comunicato stampa · Apertura|Titolo:null,Paragrafo:null']);
 assert.ok(!items.some(i=>i.units.some(u=>/https:\/\/x\.it/.test(u.text))),'links of buttons are not text to translate');
 const out=new Map();for(const it of items)for(const u of it.units)out.set(u.k,{en:'EN '+u.text});
 const md=T.textMd(items,out,'en',{title:'Testi salvati'});
 assert.match(md,/^# Testi salvati · Inglese\n\n## Post del lunedì\n\n\*\*Testo del post \(Instagram\)\*\*\nEN Il pane di oggi/);
 assert.match(md,/\*\*Oggetto\*\*\nEN Il pane di novembre/);assert.match(md,/# EN Apriamo a Torino\n\nEN Il 12\/11\/2026 apriamo/);
 const files=T.exportFiles({kind:'text',name:'Testi salvati',settings:settings({langs:['en','de']}),style:'fedele',items,out});
 assert.deepEqual(files.map(f=>f.name),['testi-salvati-en.md','testi-salvati-de.md','glossario.csv','controlli.csv','LEGGIMI.txt']);
 assert.match(files[1].data,/\[da tradurre\] Il pane di oggi/,'missing languages are marked, never left silently empty');
 const z=ZIP.unzip(T.exportZip({kind:'text',name:'Testi salvati',settings:settings(),style:'fedele',items,out}));assert.equal(z.length,5);
 assert.equal(T.zipName({name:'Testi salvati',settings:settings()}),'traduzione-testi-salvati-en-de.zip');
 assert.match(T.readme({kind:'text',name:'x',settings:settings(),style:'fedele',items,out}),/Codici, SKU, link, email e numeri di telefono non sono stati inviati all’AI/);
});

test('pasted text keeps its structure: headings, lists, «Titolo SEO:» and «Meta description:» back in place',()=>{
 const items=T.fromText(T.SAMPLE_TEXT),out=new Map();for(const it of items)for(const u of it.units)out.set(u.k,{en:'['+u.text+']'});
 const md=T.textMd(items,out,'en',{title:'Il nostro pane'});
 assert.match(md,/\n# \[Il nostro pane\]\n/);assert.match(md,/\nTitolo SEO: \[Forno Aurora · pane a lievito madre a Torino\]\n/);assert.match(md,/\n- \[Ordini entro le 18:00 per il giorno dopo\]\n/);assert.match(md,/\n## \[Natale\]\n/);
 assert.deepEqual(T.fromText('Primo paragrafo.\n\nSecondo paragrafo.').map(i=>i.name),['Primo paragrafo.','Secondo paragrafo.'],'without headings: one item per paragraph');
});

test('saved in the project: key translations in the agents document, every other key kept, retried on a conflict; agents-page keeps it',async()=>{
 const sheet=T.sampleSheet(),cols=['Nome prodotto','Descrizione'],items=T.fromSheet(sheet,cols).slice(0,4),out=new Map();for(const it of items)for(const u of it.units)out.set(u.k,{en:u.text+' (EN)',_edited:{en:true}});
 const m={kind:'sheet',name:'esempio',settings:settings({langs:['en'],glossary:'Forno Aurora'}),style:'naturale',items,out,sheet:{headers:sheet.headers,rows:sheet.rows.slice(0,4)},columns:cols};
 const rec=T.savedRecord(m,{by:'Ilaria',at:'2026-10-22T10:00:00.000Z'});
 assert.match(rec.id,/^tr-20261022100000-esempio$/);assert.equal(rec.headers.length,15);assert.equal(rec.rows.length,4);assert.ok(!JSON.stringify(rec.out).includes('_edited'));
 let stored={schemaVersion:1,conversations:{copywriter:[{role:'user',content:'ciao'}]},prefs:{a:1},productSheets:{schemaVersion:1,items:[{id:'ps'}]},events:{schemaVersion:1,items:[{id:'ev'}]},translations:{schemaVersion:1,items:[{id:'old'}]}},conflicts=1;
 class ConflictError extends Error{}
 const ws={ConflictError,bind:(pid,name)=>{assert.equal(pid,'forno');assert.equal(name,'agents');return {load:async()=>JSON.parse(JSON.stringify(stored)),save:async d=>{if(conflicts-->0)throw new ConflictError('x');stored=d}}}};
 await T.saveToProject(ws,'forno',rec);
 assert.deepEqual(stored.translations.items.map(x=>x.id),['old',rec.id]);assert.deepEqual(stored.productSheets,{schemaVersion:1,items:[{id:'ps'}]});assert.deepEqual(stored.events,{schemaVersion:1,items:[{id:'ev'}]});assert.deepEqual(stored.prefs,{a:1});assert.equal(stored.conversations.copywriter.length,1);
 for(let i=0;i<6;i++)await T.saveToProject(ws,'forno',{...rec,id:'tr-'+i});assert.equal(stored.translations.items.length,5,'only the last 5');
 // reopened without a new AI call: the same exports
 const back=T.fromRecord(rec);assert.equal(T.sheetCsv(back.sheet,back.columns,back.out,['en']),T.sheetCsv(m.sheet,cols,out,['en']));assert.deepEqual(T.summary(back.items,back.out,back.settings).counts,T.summary(items,out,m.settings).counts);
 assert.deepEqual(T.readStore({translations:'boh'}),{schemaVersion:1,items:[]});
 assert.throws(()=>T.savedRecord({...m,items:[{key:'X',name:'x',units:[{k:'X|t',text:'x'.repeat(500000)}]}]}),/scarica lo zip/);
 // agents-page.js: its own clean() keeps translations; also after a save conflict and when the tab comes back
 const src=read('agents-page.js'),fn=/function clean\(d\)\{[^\n]*\}/.exec(src)[0],ctx={MAX_KEPT:40};vm.createContext(ctx);vm.runInContext(fn+';this.clean=clean',ctx);
 const kept=ctx.clean({...stored,conversations:{a:[{role:'user',content:'x'},{role:'assistant',content:'…',pending:true}]}});
 assert.deepEqual(JSON.parse(JSON.stringify(kept.translations)),stored.translations,'translations kept by agents-page clean()');assert.deepEqual(JSON.parse(JSON.stringify(kept.events)),stored.events);
 assert.match(src,/data\.events=fresh\.events;data\.translations=fresh\.translations;/,'kept after a save conflict');
 assert.match(src,/if\(fresh&&data\)\{data\.events=fresh\.events;data\.translations=fresh\.translations;/,'and when the tab comes back');
});

test('the card in «Cosa vuoi fare»: Web e annunci, after the product sheets; the studio is loaded and opened inline',()=>{
 const c=crea.card('traduzione');
 assert.equal(c.group,'Web e annunci');assert.equal(c.title,'Traduzione e localizzazione');assert.equal(c.inline,'translate');assert.equal(c.state,'ready');assert.match(c.cost,/con conferma/);
 assert.equal(crea.linkFor(c,'radix'),null,'opens inline');assert.deepEqual(crea.fromQuery('?open=traduzione'),{group:'Web e annunci',open:'traduzione'});
 const web=crea.CARDS.filter(x=>x.group==='Web e annunci').map(x=>x.id);assert.equal(web[web.indexOf('schede')+1],'traduzione');
 assert.ok(look.has(look.CARDS.traduzione),'its icon');
 const html=read('agency/crea.html'),at=s=>html.indexOf(s);
 assert.ok(at('/lib/radix-confirm.js')<at('/lib/translation-studio.js')&&at('/lib/product-studio.js')<at('/lib/translation-studio.js')&&at('/lib/translation-studio.js')<at('/agency/crea.js'),'loaded after the confirmation and the sheet readers, before the page');
 const js=read('agency/crea.js');assert.match(js,/translate:\{global:'RadixTranslationStudio'/);assert.match(js,/c\.inline==='translate'\n\s+\?S\.translationStudio\(\{project,projectName:current\.name,projectId:current\.id,workspace:ws\}\)/);
 // one entry point per paid step, the confirmation before the call, no network of its own
 const src=read('lib/translation-studio.js');assert.equal(src.split('rt.reply(').length-1,1);assert.ok(!/fetch\(|send-email|api\//.test(src),'no network');assert.ok(!/[^.]confirm\(/.test(src.replace(/root\.confirm\(/g,'')),'no native confirm');
 const css=read('shell/crea.css');assert.match(css,/\.cr-panel \.translation-studio \.tr-check\[data-state=fail\]/);assert.match(css,/@media \(max-width:640px\)\{\n \.cr-panel \.translation-studio \.tr-materials\{grid-template-columns:minmax\(0,1fr\)\}/);
});
