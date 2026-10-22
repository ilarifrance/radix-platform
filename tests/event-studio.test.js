'use strict';
// Studio «Evento o fiera» (lib/event-studio.js): the three automatic quality checks of the kit (dates, consent,
// follow-up within 48 hours), the card in «Cosa vuoi fare», the one confirmed AI call (fake confirm, fake AI: never a
// real call), the files of the kit and the saved key that agents-page.js keeps.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const E=require('../lib/event-studio.js'),PS=require('../lib/print-studio.js'),PX=require('../lib/pptx-lite.js'),ZIP=require('../lib/zip-lite.js'),CRM=require('../sales/crm-campaigns.js');
const crea=require('../agency/crea-core.js');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');

const PROFILE={identityKit:{brand:'Forno Bianchi',direction:'Bottega di quartiere',palette:[{role:'primary',hex:'#2F5D50'},{role:'secondary',hex:'#A0522D'},{role:'accent',hex:'#E3B448'},{role:'dark',hex:'#1C1C1E'},{role:'light',hex:'#F7F5F0'}],fonts:[{heading:'Fraunces',body:'Inter'}]},
 contacts:{phone:'035 123 4567',email:'info@fornobianchi.it',website:'www.fornobianchi.it',address:'Via Roma 12, 24121 Bergamo'}};
const FAIR={type:'fiera',goal:'contatti',stand:'6x3'};
const EVENT={name:'Forni in fiera',date:'2026-11-12',dateEnd:'2026-11-14',start:'10:00',end:'18:00',venue:'Fiera Milano Rho',hall:'Padiglione 3, stand B12',address:'Strada Statale 33, Rho (MI)',regUrl:'https://www.fornobianchi.it/fiera',privacyUrl:'https://www.fornobianchi.it/privacy'};
const WEBINAR={type:'webinar',goal:'vendite'},WEB_EVENT={name:'Il pane in casa',date:'2026-11-19',start:'18:00',end:'19:00',platform:'Zoom',link:'https://zoom.us/j/123456789',regUrl:'https://www.fornobianchi.it/webinar',privacyUrl:'https://www.fornobianchi.it/privacy'};
const FACTS='Presentiamo il forno a legna da banco per panifici; dimostrazioni allo stand; preventivi in fiera.';
const dir=(name,angle,extra={})=>({nome:name,angolo:angle,idea:'Il forno visto da vicino.',titolo:'Il forno a legna da banco',claim:'Vieni a sentire il profumo del pane',punti:['Dimostrazioni allo stand','Preventivi in fiera','Le domande dei panettieri'],invito_azione:'Registrati',
 invito:{oggetto:'Ti aspettiamo in fiera',anteprima:'{data}, {ora} a {luogo}: vieni a vedere il forno a legna da banco.',testo:'Ciao {{nome}},\n\nti aspettiamo {data}, {ora}, a {luogo}.\n\nIscriviti qui: {link}'},
 landing:{titolo:'Il forno a legna da banco',sottotitolo:'Vieni a vederlo acceso',testo:'Dimostrazioni allo stand e preventivi in fiera.'},
 post:{annuncio:'Saremo in fiera {data} a {luogo}. Iscriviti: {link}',countdown:'Mancano {giorni} giorni: ci vediamo {data}.',live:'Il forno è acceso: passa allo stand.',grazie:'Grazie a chi è passato allo stand.'},
 slide:[{titolo:'Il forno a legna da banco',punti:['{data}'],nota:'Benvenuto'},{titolo:'Come funziona',punti:['Legna','Pietra refrattaria'],nota:'Mostrare'},{titolo:'Grazie',punti:['{link}']}],
 grazie:{oggetto:'Grazie della visita',testo:'Ciao {{nome}},\n\ngrazie per essere passato allo stand.'},followup:{oggetto:'Il tuo preventivo',testo:'Ciao {{nome}},\n\nti preparo il preventivo: rispondi con le misure del laboratorio.'},
 rollup:{titolo:'Il forno a legna da banco',sottotitolo:'Dimostrazioni allo stand'},flyer:{titolo:'Il forno a legna da banco',testo:'Vieni a vederlo acceso allo stand.'},...extra});
const REPLY='```json\n'+JSON.stringify({kit:[dir('Il forno da vicino','razionale'),dir('Il profumo del pane','emotivo'),dir('Il forno nuovo','impatto')]})+'\n```';
const values=(ev=EVENT)=>({facts:FACTS,event:ev,project:{name:'Forno Bianchi'},projectFacts:''});
const model=(answers=FAIR,ev=EVENT,reply=REPLY)=>{const ds=E.parseDirections(reply,{answers,input:FACTS});const m=E.modelOf(ds[0],answers,ev);m.input=FACTS;return m};

test('dates: one record, the same date, time and place in every material; a wrong date, weekday or time is caught',()=>{
 const m=model(),ev=m.event;
 assert.equal(E.dateText(ev),'da giovedì 12 a sabato 14 novembre 2026');assert.equal(E.timeText(ev),'dalle 10:00 alle 18:00');
 assert.equal(E.placeText(ev),'Fiera Milano Rho, Padiglione 3, stand B12, Strada Statale 33, Rho (MI)');
 assert.deepEqual(E.consistency(E.materialTexts(m),ev),[],'filled from placeholders: all consistent');
 const mats=E.materialTexts(m);for(const x of mats.filter(x=>x.needs.includes('date')))assert.ok(x.text.includes(E.dateText(ev)),x.id);
 // a person edits a text and writes another day, a wrong weekday, an hour outside the opening hours
 m.texts.invito.body+='\nTi aspettiamo anche il 20 novembre.';m.texts.posts.annuncio='Ci vediamo venerdì 12 novembre a {luogo}, alle 21:30.';
 const issues=E.consistency(E.materialTexts(m),ev).map(i=>i.material+':'+i.kind);
 assert.deepEqual(issues.sort(),['annuncio:time','annuncio:weekday','invito:date'],'the date of the post is a day of the fair: only its weekday is wrong');
 assert.equal(E.issueText(E.consistency(E.materialTexts(m),ev).find(i=>i.kind==='weekday')),'Post di annuncio: «venerdì 12 novembre» ha il giorno sbagliato (è giovedì).');
 // numeric dates, other years, ranges and times inside the hours
 const one=t=>E.consistency([{id:'x',label:'X',text:t,needs:[]}],ev).map(i=>i.kind);
 assert.deepEqual(one('Il 13/11 e il 14.11.2026 dalle 10:30'),[]);assert.deepEqual(one('Il 13/11/2025'),['date']);assert.deepEqual(one('dal 12 al 15 novembre'),['date']);
 assert.deepEqual(one('ore 9'),['time']);assert.deepEqual(one('1.200 visitatori, 2 settimane, 3 motivi'),[],'no false dates or times');
 // the check runs again when the event data change: the texts follow, nothing to fix by hand
 m.texts=model().texts;m.event=E.eventOf(FAIR,{...EVENT,date:'2026-12-03',dateEnd:'2026-12-05'});
 assert.deepEqual(E.consistency(E.materialTexts(m),m.event),[]);assert.ok(E.materialTexts(m).find(x=>x.id==='invito').text.includes('da giovedì 3 a sabato 5 dicembre 2026'));
 assert.equal(E.checksOf(m).find(c=>c.id==='dates').ok,true);
 // a deleted placeholder: the date is missing from that material
 m.texts.invito.body='Ciao {{nome}}, ti aspettiamo a {luogo}.';m.texts.invito.preheader='Vieni a trovarci allo stand.';
 assert.deepEqual(E.consistency(E.materialTexts(m),m.event).map(i=>i.material+':'+i.need),['invito:date','invito:time']);
});

test('consent: the landing asks the privacy consent (required, not ticked, with the policy link); marketing apart and optional',()=>{
 const m=model(),form=E.landingForm(m.event,m);
 assert.deepEqual(E.consentIssues(form),[]);
 assert.deepEqual(E.consentIssues({...form,privacyUrl:''}).map(i=>i.kind),['policy']);
 const bad=f=>E.consentIssues({...form,fields:form.fields.map(x=>x.consent==='privacy'?{...x,...f}:x)}).map(i=>i.kind);
 assert.deepEqual(bad({required:false}),['required']);assert.deepEqual(bad({checked:true}),['prechecked']);
 assert.deepEqual(E.consentIssues({...form,fields:form.fields.filter(x=>x.consent!=='privacy')}).map(i=>i.kind),['consent']);
 assert.deepEqual(E.consentIssues({...form,fields:form.fields.map(x=>x.consent==='marketing'?{...x,checked:true,required:true}:x)}).map(i=>i.kind),['marketing-required','marketing-prechecked']);
 // read back from the HTML that is downloaded
 const html=E.landingHtml(m,PS.brandOf(PROFILE,'Forno Bianchi'));
 assert.deepEqual(E.consentIssues(E.consentInHtml(html)),[]);
 assert.match(html,/<input type="checkbox" name="privacy" required>/);assert.match(html,/<input type="checkbox" name="marketing">/);assert.ok(!/\bchecked\b/.test(html));
 assert.match(html,/href="https:\/\/www\.fornobianchi\.it\/privacy"[^>]*>Leggi l’informativa/);assert.ok(!/<script/i.test(html),'static page');
 assert.deepEqual(E.consentIssues(E.consentInHtml(html.replace('name="privacy" required','name="privacy" required checked'))).map(i=>i.kind),['prechecked']);
 assert.deepEqual(E.consentIssues(E.consentInHtml(html.replace(/<label class="ck"><input type="checkbox" name="privacy"[\s\S]*?<\/label>/,''))).map(i=>i.kind),['consent']);
 assert.ok(E.checksOf(m).find(c=>c.id==='consent').ok);
 m.event={...m.event,privacyUrl:''};const c=E.checksOf(m).find(c=>c.id==='consent');assert.equal(c.ok,true);assert.equal(c.warn,true,'missing policy link: to complete');
});

test('follow-up: within 48 hours of the end, as the CRM sequence «Dopo l’incontro» would send it',()=>{
 const m=model(),sp=E.span(m.event);
 assert.deepEqual(m.after,{grazie:'2026-11-15T10:00',followup:'2026-11-16T09:00'});assert.deepEqual(E.followUpIssues(m.after,m.event),[]);
 // the same time the real CRM planner gives for the first email step, started at the end of the event
 const seq=CRM.SEQUENCES.find(s=>s.id==='incontro');assert.deepEqual(E.incontro(),seq,'the CRM sequence itself, not a copy');assert.deepEqual(JSON.parse(JSON.stringify(E.INCONTRO_FALLBACK)),JSON.parse(JSON.stringify(seq)),'the copy used where the CRM script is not loaded is the same');
 const plan=CRM.planSequence(seq,[{id:'c1',name:'Anna',marketing_consent:true}],[],{now:sp.end*6e4,consentOnly:true});
 const firstEmail=Date.parse(plan.tasks.find(t=>/Email/.test(t.title)).due_at)/6e4;
 assert.equal(E.crmFirstEmail(sp.end),firstEmail);assert.ok(firstEmail-sp.end<=48*60&&firstEmail>sp.end);
 // later than 48 hours, before the end, or missing: flagged
 const late=E.followUpIssues({...m.after,followup:'2026-11-17T09:00'},m.event);assert.deepEqual(late.map(i=>i.kind+':'+i.which),['late:followup']);assert.match(late[0].text,/63 ore dopo la fine: deve partire entro 48 ore/);
 assert.deepEqual(E.followUpIssues({grazie:'2026-11-14T17:00',followup:''},m.event).map(i=>i.kind+':'+i.which),['before:grazie','missing:followup']);
 assert.deepEqual(E.followUpIssues({...m.after,followup:'2026-11-16T18:00'},m.event),[],'exactly 48 hours is fine');
 // an event that ends early in the morning: the CRM time would be 49 hours later, so the default is 24 hours
 const early=E.eventOf({type:'openday'},{date:'2026-11-12',start:'06:00',end:'08:00',venue:'Bottega'});assert.equal(E.crmFirstEmail(E.span(early).end)-E.span(early).end,49*60);
 assert.deepEqual(E.followUpIssues(E.afterDefaults(early),early),[]);assert.equal(E.afterDefaults(early).followup,'2026-11-13T08:00');
 assert.equal(E.checksOf({...m,after:{...m.after,followup:'2026-11-20T09:00'}}).find(c=>c.id==='followup').ok,false);
 // the timeline puts the follow-up in «Dopo»
 const sch=E.schedule(m.event,m.after,m);assert.deepEqual(sch.filter(s=>s.phase==='dopo').map(s=>s.id),['grazie','followup']);
 assert.deepEqual(sch.filter(s=>s.phase==='prima').map(s=>s.at),['2026-10-15T10:00','2026-11-05T12:30','2026-11-09T12:30','2026-11-11T12:30']);
});

test('the card: «Evento o fiera» in Social e contenuti, opening the studio inline with the Stratega di Marca memory',()=>{
 const c=crea.card('evento');
 assert.equal(c.title,'Evento o fiera');assert.equal(c.group,'Social e contenuti');assert.equal(c.inline,'event');assert.equal(c.state,'ready');assert.equal(crea.linkFor(c,'radix'),null);
 assert.match(c.line,/Webinar/);assert.match(c.line,/3 direzioni/);assert.match(c.cost,/^Una chiamata AI allo Stratega di Marca, con conferma\./);
 assert.deepEqual(crea.fromQuery('?open=evento'),{group:'Social e contenuti',open:'evento'});
 const js=read('agency/crea.js');
 assert.match(js,/event:\{global:'RadixEventStudio'[^}]*agent:'brand-strategist'\}/);
 assert.match(js,/S\.eventStudio\(\{project,profile:current\.profile,projectName:current\.name,memoryScope,projectId:current\.id,workspace:ws,crmUrl:'\/radix-sales\.html#contacts',agentsUrl:'\/agents\.html\?agent=brand-strategist&project='\+pid\}\)/);
 const html=read('agency/crea.html'),at=s=>html.indexOf(s);
 for(const s of ['/lib/print-studio.js','/lib/newsletter-studio.js','/lib/doc-studio.js','/lib/pptx-lite.js','/lib/zip-lite.js','/lib/copy-checks.js','/lib/ad-studio.js'])assert.ok(at(s)>0&&at(s)<at('/lib/event-studio.js'),s+' before the studio');
 assert.ok(at('/lib/event-studio.js')<at('/agency/crea.js'),'the studio loads before the page script');
 assert.ok(!html.includes('/sales/crm-campaigns.js'),'the CRM page script is not loaded here: the studio uses its copy of the sequence, kept equal by the follow-up test');
 assert.equal(read('agency/marketing-look.js').includes("evento:'ticket'"),true);
 assert.match(read('shell/crea.css'),/\.cr-panel \.event-studio \.ev-checks/);
});

test('one AI call: «Annulla» = 0 calls, conferma = exactly 1 call; the prompt keeps dates out of the AI',async()=>{
 const calls=[],asked=[];const rt={reply:async o=>{calls.push(o);return {text:REPLY}}};
 const args=answer=>({answers:FAIR,values:values(),rt,project:{name:'Forno Bianchi'},memoryScope:{projectId:'p1',agentId:'brand-strategist'},confirm:async o=>{asked.push(o);return answer}});
 assert.deepEqual(await E.requestDirections(args(false)),{cancelled:true});assert.equal(calls.length,0,'cancel: no AI call');assert.equal(asked.length,1);
 assert.match(asked[0].title,/3 direzioni del kit/);assert.match(asked[0].cost,/una sola chiamata AI/i);assert.deepEqual(asked[0].facts.map(f=>f[0]),['Evento','Quando','Dove']);
 const r=await E.requestDirections(args(true));assert.equal(calls.length,1,'confirm: exactly one call');assert.equal(asked.length,2);
 assert.equal(calls[0].role,'brand-strategist');assert.equal(calls[0].messages.length,1);
 assert.equal(r.directions.length,3);assert.deepEqual(r.directions.map(d=>d.angle),['razionale','emotivo','impatto']);
 const prompt=calls[0].messages[0].content;
 assert.match(prompt,/\{data\}, \{ora\}, \{luogo\}/);assert.ok(!prompt.includes('novembre')&&!prompt.includes('10:00'),'the AI never sees the dates: they are filled by RADIX');
 assert.match(prompt,/Stand: 6 × 3 m/);assert.match(prompt,/"rollup"/);assert.ok(!/promemoria_ora/.test(prompt));
 // nothing asked and nothing spent when the answers are not enough
 const noDate={...args(true),values:values({...EVENT,date:''})};await assert.rejects(E.requestDirections(noDate),/data dell’evento/);
 await assert.rejects(E.requestDirections({...args(true),values:{...values(),facts:'poco'}}),/almeno 10 caratteri/);
 assert.equal(calls.length,1);assert.equal(asked.length,2);
 // webinar prompt: reminders, no roll-up
 const wp=E.directionsPrompt(WEBINAR,values(WEB_EVENT));assert.match(wp,/promemoria_giorno/);assert.match(wp,/\{accesso\}/);assert.ok(!/"rollup"/.test(wp));
 // the widget uses this one entry point and no other AI call; the confirmation comes before the call
 const src=read('lib/event-studio.js');assert.equal(src.split('rt.reply(').length-1,1);assert.equal(src.split('await ask(').length-1,1);
 assert.ok(src.indexOf('await ask(')<src.indexOf('rt.reply('));assert.match(src,/requestDirections\(\{answers:a,values,rt:root\.RadixAgents/);
 assert.ok(!/fetch\(|send-email|api\/buffer/.test(src),'no network, no email, no Buffer');
});

test('parsing: missing pieces get a base text and a warning; numbers not in the facts are flagged; slide numbers are not',()=>{
 const partial='{"kit":[{"titolo":"Open day","claim":"Porte aperte con 30% di sconto","invito":{"oggetto":"Vieni"}}]}';
 const [d]=E.parseDirections(partial,{answers:{type:'openday'},input:FACTS});
 assert.equal(d.texts.invito.subject,'Vieni');assert.match(d.texts.invito.body,/\{data\}/);assert.match(d.texts.posts.countdown,/\{giorni\}/);
 assert.deepEqual(d.issues.map(i=>i.kind),['number','filled']);assert.equal(d.issues[0].text,'30');
 assert.ok(!d.texts.rollup.title.includes('{'),'physical: roll-up text');
 const [ok]=E.parseDirections(REPLY,{answers:FAIR,input:FACTS});assert.deepEqual(ok.issues,[]);assert.match(ok.texts.slides,/^Slide 1 · Il forno a legna da banco\n- \{data\}/);
 assert.deepEqual(E.parseDirections('nessun json',{answers:FAIR}),[]);
 assert.equal(E.checksOf(model()).find(c=>c.id==='numbers').ok,true,'dates, stand and slide numbers are not «invented numbers»');
});

test('the kit: every file of before, during and after; PDF/X-1a for the print shop, a real .pptx, one zip',async()=>{
 const m=model(),files=await E.kitFiles(m,{profile:PROFILE,projectName:'Forno Bianchi',date:new Date('2026-10-22T10:00:00Z')});
 const names=files.map(f=>f.phase+'/'+f.name);
 assert.deepEqual(names,['prima/email-invito.html','prima/email-invito.txt','prima/invito-a5.pdf','prima/landing-registrazione.html','prima/landing-struttura.md','prima/post-social.txt','prima/countdown-7.svg','prima/countdown-3.svg','prima/countdown-1.svg','prima/evento.ics',
  'durante/rollup-85x200.pdf','durante/flyer-a5.pdf','durante/badge-85x55.pdf','durante/slide.pptx','durante/slide.pdf','dopo/email-grazie.html','dopo/email-grazie.txt','dopo/email-follow-up.html','dopo/email-follow-up.txt','dopo/follow-up-crm.txt','dopo/piano-evento.md']);
 const get=n=>files.find(f=>f.name===n).data,txt=n=>typeof get(n)==='string'?get(n):Buffer.from(get(n)).toString('latin1');
 for(const n of ['rollup-85x200.pdf','flyer-a5.pdf','badge-85x55.pdf']){assert.deepEqual(PS.checkPdf(get(n)),[],n);assert.match(txt(n),/GTS_PDFX/);assert.match(txt(n),/\/TrimBox/)}
 assert.ok(!/GTS_PDFX/.test(txt('invito-a5.pdf')),'the invitation is a web PDF');
 const deck=PX.inspect(get('slide.pptx'));assert.deepEqual(deck.problems,[]);assert.ok(deck.texts.some(t=>t.join(' ').includes('da giovedì 12 a sabato 14 novembre 2026')));
 // the same date, time and place in every text file
 for(const n of ['email-invito.html','email-invito.txt','landing-registrazione.html','landing-struttura.md','post-social.txt','piano-evento.md'])assert.ok(get(n).includes('da giovedì 12 a sabato 14 novembre 2026'),n);
 for(const n of ['countdown-7.svg','countdown-1.svg'])assert.ok(get(n).includes('da giovedì 12 a sabato 14 novembre 2026'),n);
 assert.match(get('evento.ics'),/DTSTART;TZID=Europe\/Rome:20261112T100000\r\nDTEND;TZID=Europe\/Rome:20261114T180000/);
 assert.match(get('email-invito.html'),/href="https:\/\/www\.fornobianchi\.it\/fiera"/);assert.ok(!/Iscriviti all’evento/.test(get('email-grazie.html')),'no invitation button after the event');
 assert.match(get('follow-up-crm.txt'),/«Dopo l’incontro»/);assert.match(get('follow-up-crm.txt'),/RADIX qui non invia nulla/);assert.match(get('follow-up-crm.txt'),/lun 16 nov · 09:00/);
 assert.match(get('piano-evento.md'),/roll-up consigliati: 3/);assert.match(get('piano-evento.md'),/\[ok\] Date, orari e luoghi uguali in tutti i materiali/);
 const z=ZIP.unzip(E.bundle(files,{date:new Date('2026-10-22T10:00:00Z')}));assert.equal(z.length,files.length);assert.ok(z.every(f=>/^(1-prima|2-durante|3-dopo)\//.test(f.name)));
 assert.equal(E.zipName(m),'kit-fiera-il-forno-a-legna-da-banco-2026-11-12.zip');
});

test('the webinar: title, landing, slides, emails (invito, conferma, −1 giorno, −1 ora, grazie con registrazione, follow-up), posts; no print',async()=>{
 const reply=JSON.stringify({kit:[0,1,2].map(i=>dir('Webinar '+i,'x',{titolo:'Il pane in casa',rollup:undefined,flyer:undefined,
  conferma:{oggetto:'Iscrizione confermata',testo:'Ciao {{nome}}, ci vediamo {data}, {ora}. Entra da qui: {accesso}'},promemoria_giorno:{oggetto:'Domani',testo:'Domani {ora}: {accesso}'},promemoria_ora:{oggetto:'Tra un’ora',testo:'Tra un’ora iniziamo: {accesso}'}}))});
 const m=model(WEBINAR,WEB_EVENT,reply);
 assert.equal(E.placeText(m.event),'online su Zoom');assert.equal(E.timeText(m.event),'dalle 18:00 alle 19:00');assert.deepEqual(m.after,{grazie:'2026-11-19T21:00',followup:'2026-11-21T09:00'});
 assert.deepEqual(E.materialsFor('webinar').map(x=>x[1]),['core','invito','landing','conferma','annuncio','countdown','promemoria_giorno','promemoria_ora','live','slides','grazie','postgrazie','followup']);
 assert.deepEqual(E.checksOf(m).filter(c=>!c.ok),[]);
 const sch=E.schedule(m.event,m.after,m);assert.equal(sch.find(s=>s.id==='promemoria-giorno').at,'2026-11-18T18:00');assert.equal(sch.find(s=>s.id==='promemoria-ora').at,'2026-11-19T17:00');
 // a reminder without the access link is flagged
 m.texts.promemoria_ora.body='Tra un’ora iniziamo.';assert.deepEqual(E.consistency(E.materialTexts(m),m.event).map(i=>i.material+':'+i.need),['promemoria_ora:access']);
 m.texts.promemoria_ora.body='Tra un’ora iniziamo: {accesso}';
 const files=await E.kitFiles(m,{profile:PROFILE,projectName:'Forno Bianchi',date:new Date('2026-10-22T10:00:00Z')}),names=files.map(f=>f.name);
 for(const n of ['email-conferma-iscrizione.html','email-promemoria-1-giorno.html','email-promemoria-1-ora.html','email-grazie.html','slide.pptx','landing-registrazione.html'])assert.ok(names.includes(n),n);
 for(const n of ['rollup-85x200.pdf','flyer-a5.pdf','badge-85x55.pdf','invito-a5.pdf'])assert.ok(!names.includes(n),n);
 assert.match(files.find(f=>f.name==='email-promemoria-1-ora.html').data,/href="https:\/\/zoom\.us\/j\/123456789"/);
 assert.match(files.find(f=>f.name==='piano-evento.md').data,/Studio Reel/);
});

test('saved in the project: key events in the agents document, every other key kept, retried on a conflict; agents-page keeps it',async()=>{
 const m=model();let stored={schemaVersion:1,conversations:{'brand-strategist':[{role:'user',content:'ciao'}]},prefs:{a:1},reels:{schemaVersion:1,items:[{id:'r'}]},events:{schemaVersion:1,items:[{id:'old'}]}},conflicts=1;
 class ConflictError extends Error{}
 const ws={ConflictError,bind:(pid,name)=>{assert.equal(pid,'forno');assert.equal(name,'agents');return {load:async()=>JSON.parse(JSON.stringify(stored)),save:async d=>{if(conflicts-->0)throw new ConflictError('x');stored=d}}}};
 const rec=E.savedRecord(m,{by:'Ilaria',at:'2026-10-22T10:00:00.000Z'});
 await E.saveToProject(ws,'forno',rec);
 assert.deepEqual(stored.events.items.map(x=>x.id),['old',rec.id]);assert.deepEqual(stored.reels,{schemaVersion:1,items:[{id:'r'}]});assert.deepEqual(stored.prefs,{a:1});assert.equal(stored.conversations['brand-strategist'].length,1);
 assert.equal(rec.checks.every(c=>c.ok),true);assert.equal(rec.schedule.length,8);
 const back=E.fromRecord(rec);assert.deepEqual(back.texts,m.texts);assert.deepEqual(back.event,m.event);assert.deepEqual(E.checksOf(back).map(c=>c.ok),E.checksOf(m).map(c=>c.ok));
 // agents-page.js: its own clean() run on a document with events keeps them, as it keeps reels
 const src=read('agents-page.js'),fn=/function clean\(d\)\{[^\n]*\}/.exec(src)[0],ctx={MAX_KEPT:40};vm.createContext(ctx);vm.runInContext(fn+';this.clean=clean',ctx);
 const kept=ctx.clean({...stored,conversations:{a:[{role:'user',content:'x'},{role:'assistant',content:'…',pending:true}]}});
 assert.deepEqual(JSON.parse(JSON.stringify(kept.events)),stored.events,'events kept by agents-page clean()');assert.equal(kept.conversations.a.length,1);
 assert.match(src,/data\.reels=fresh\.reels;data\.events=fresh\.events;/,'kept after a save conflict too');
 assert.match(src,/if\(fresh&&data\)\{data\.events=fresh\.events;/,'and when the tab comes back');
});
