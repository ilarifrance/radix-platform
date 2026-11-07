'use strict';
// Studio «Sondaggio e NPS» (lib/survey-core.js): the three questionnaires, the checks, the public page, the answers that
// api/_site_form.js writes as CRM notes and reads back, NPS, CSV, PDF and the optional AI summary.
// DATI DI ESEMPIO (Forno Aurora) only: in-memory stores, a fake Vercel, a fake agent. No database, no AI, no publish.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
process.env.JWT_SECRET=process.env.JWT_SECRET||'test-secret-for-survey';
const SECRET=process.env.JWT_SECRET;
const C=require('../lib/survey-core.js'),F=require('../api/_site_form.js'),pub=require('../api/_site_publish.js'),auth=require('../api/_auth.js');
const {createHandler}=require('../api/_sales.js');
const {PROFILE}=require('./fixtures/mockup-forno-aurora.js');
const WS='11111111-1111-4111-8111-111111111111',PROJECT='forno-aurora-ab12cd34',TODAY=new Date('2026-10-23T09:00:00Z');
const FACTS={legalName:'Forno Aurora S.r.l.',vat:'01234567897',address:'Via Nizza 12, 10125 Torino',email:'ciao@fornoaurora.it'};
const INPUT={goal:'nps',audience:'clienti',length:'5',brand:'Forno Aurora'};
const R=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const pdfText=bytes=>Buffer.from(bytes).toString('latin1');
const survey=(variant='standard',input=INPUT)=>C.buildSurvey(input,variant,{today:TODAY});

test('three questionnaires per goal: Breve (NPS + 1 open), Standard 6-8, Approfondito 10-12, neutral and checked',()=>{
 for(const g of C.GOALS)for(const a of C.AUDIENCES){const input={goal:g.id,audience:a.id,length:'5',brand:'Forno Aurora'},ps=C.proposals(input,{today:TODAY});
  assert.deepEqual(ps.map(p=>p.variant),['breve','standard','approfondito']);
  const [b,s,d]=ps,tag=g.id+'/'+a.id;
  assert.equal(b.questions.length,2,tag);assert.equal(b.questions[0].type,'nps',tag);assert.equal(b.questions[1].type,'testo',tag);
  assert.ok(s.questions.length>=6&&s.questions.length<=8,tag+' standard '+s.questions.length);assert.ok(d.questions.length>=10&&d.questions.length<=12,tag+' approfondito '+d.questions.length);
  for(const p of ps){assert.deepEqual(p.questions.map(q=>q.id),p.questions.map((q,i)=>'q'+(i+1)));
   const cs=C.checksOf(p,{...input,length:'10'});assert.deepEqual(C.blocking(cs),[],tag+' '+p.variant);
   for(const id of ['neutre','concetti','scale','opzioni','privacy','campione'])assert.equal(cs.find(c=>c.id===id).state,'ok',tag+' '+p.variant+' '+id);
   assert.match(p.intro,/Forno Aurora/);assert.match(p.privacy,/informativa privacy/);assert.match(p.sample,/ottobre 2026/);
   for(const q of p.questions){assert.ok(C.TYPE_IDS.includes(q.type));assert.ok(q.text.length<=C.LIMITS.question);assert.ok(!/\{brand\}/.test(q.text));
    if(q.type==='nps'||q.type==='scala'){assert.ok(q.low&&q.high,tag+' '+q.text)}if(q.type==='singola'||q.type==='multipla')assert.ok(q.options.length>=2&&q.options.length<=C.LIMITS.options)}}}
 assert.equal(survey().slug,'nps-standard-2026-10');assert.equal(C.recommended({length:'2'}),'breve');assert.equal(C.recommended({length:'10'}),'approfondito');
 assert.equal(C.buildSurvey({goal:'boh',audience:'?',length:'x'},'nessuna',{today:TODAY}).goal,'nps','unknown input falls back to the defaults');
});

test('checks: leading words, two concepts, scale labels, options, placeholders, length; editing helpers',()=>{
 const s=survey();s.questions[2].text='Non pensi che il nostro pane sia ottimo?';s.questions[3].text='Quanto sei soddisfatto del pane e dei dolci?';s.questions[4].low='';
 s.questions[5].options=['Sì','Sì'];s.intro='[da completare: introduzione]';
 const cs=C.checksOf(s,INPUT),by=id=>cs.find(c=>c.id===id);
 assert.equal(by('neutre').state,'warn');assert.equal(by('concetti').state,'warn');assert.equal(by('scale').state,'fail');assert.equal(by('opzioni').state,'fail');assert.equal(by('segnaposto').state,'fail');
 assert.equal(C.twoConcepts('Come valuti il rapporto tra qualità e prezzo?'),false,'«tra A e B» is one concept');assert.equal(C.twoConcepts('Quanto è probabile che consigli Forno Aurora e Pane Più?','Forno Aurora e Pane Più'),false,'the brand name is not a concept');
 const t=survey('approfondito');assert.equal(C.checksOf(t,{...INPUT,length:'2'}).find(c=>c.id==='durata').state,'warn');
 const e=survey('breve');C.addQuestion(e,'multipla');assert.equal(e.questions.length,3);assert.equal(e.questions[2].id,'q3');assert.deepEqual(e.questions[2].options,['','']);
 C.addQuestion(e,'boh');assert.equal(e.questions.length,3,'unknown type ignored');
 C.moveQuestion(e,2,-1);assert.deepEqual(e.questions.map(q=>q.id),['q1','q3','q2']);C.moveQuestion(e,0,-1);assert.deepEqual(e.questions.map(q=>q.id),['q1','q3','q2'],'out of range');
 C.addQuestion(e,'scala');assert.equal(e.questions[3].id,'q4','ids are never reused after a move');
 C.removeQuestion(e,0);assert.equal(e.questions.length,3);const one=survey('breve');C.removeQuestion(one,0);C.removeQuestion(one,0);assert.equal(one.questions.length,1,'at least one question stays');
 const full=survey();while(full.questions.length<C.LIMITS.questions)C.addQuestion(full,'testo');C.addQuestion(full,'testo');assert.equal(full.questions.length,C.LIMITS.questions);
 assert.equal(C.checksOf({...survey(),questions:survey().questions.filter(q=>q.type!=='nps')},INPUT).find(c=>c.id==='nps').state,'warn');
});

test('NPS math: promoters 9-10, passives 7-8, detractors 0-6; rounding and empty input',()=>{
 assert.deepEqual(C.npsOf([10,9,8,7,6,0]),{n:6,promoters:2,passives:2,detractors:2,dist:[1,0,0,0,0,0,1,1,1,1,1],score:0,pct:{promoters:33,passives:33,detractors:33}});
 assert.equal(C.npsOf([10,10,10]).score,100);assert.equal(C.npsOf([0,6,3]).score,-100);assert.equal(C.npsOf([9,9,8]).score,67);assert.equal(C.npsOf([10,6,7]).score,0);
 assert.deepEqual(C.npsOf([]),{n:0,promoters:0,passives:0,detractors:0,dist:Array(11).fill(0),score:null,pct:null});
 assert.equal(C.npsOf([11,-1,5.5,'9',null,9]).n,1,'only integers 0-10 count');
 assert.equal(C.signed(33),'+33');assert.equal(C.signed(-12),'-12');assert.equal(C.signed(0),'0');assert.equal(C.signed(null),'—');
});

// ---- the CRM: the same fake store as the contact form ----
function call(handler,{method='POST',headers={},body,query={}}){
 return new Promise(resolve=>{
  const res={headers:{},statusCode:0,setHeader(k,v){this.headers[k]=v},status(s){this.statusCode=s;return this},
   json(v){resolve({status:this.statusCode,body:v,headers:this.headers});return this},send(v){resolve({status:this.statusCode,body:v,headers:this.headers});return this},end(v){resolve({status:this.statusCode,body:v,headers:this.headers});return this}};
  Promise.resolve(handler({method,headers,body,query},res)).catch(e=>resolve({status:'threw',body:e}));
 });
}
function fakeStore({roles={[WS]:'member'},existing=null,holder=null,recent=0}={}){const commands=[],sql=[];
 return {commands,sql,store:{
  membership:async(w,u)=>u===7&&roles[w]?{role:roles[w]}:null,
  leadLists:{membership:async()=>null},
  sql:async(text,params)=>{sql.push({text,params});
   if(/FROM sales_contacts/.test(text))return existing&&params[1].toLowerCase()===existing.email?[{id:existing.id,company_id:existing.company_id||null}]:[];
   if(/FROM sales_companies/.test(text))return holder&&params[1]===F.SURVEY_HOLDER?[{id:holder}]:[];
   if(/count\(\*\)/.test(text))return [{n:recent}];
   throw Error('unexpected sql '+text)},
  command:async(c,uid)=>{commands.push({c,uid});return {id:c.data.id,version:1}}
 }};
}
const TOKEN=F.sign({uid:7,workspace:WS,site:PROJECT},SECRET).token;
const unesc=v=>v.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
// The hidden fields exactly as the published page sends them, plus the visitor's answers.
function hiddenOf(html){const out={};for(const m of html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g))out[m[1]]=unesc(m[2]);return out}
const S0=survey(),PAGE=C.pageHtml(S0,C.brandFor(PROFILE,'Forno Aurora'),{endpoint:'https://radix.example/api/sales?site_form=1',token:TOKEN,facts:FACTS});
const answers=(extra={})=>({...hiddenOf(PAGE),website:'',email:'',q1:'9',q2:'Il pane a lievito madre è il migliore',q3:'4',q6:S0.questions[5].options[1],...extra});
const H={'content-type':'application/x-www-form-urlencoded',origin:'https://radix-sv-nps-standard-2026-10.vercel.app'};
let ip=0;
const send=(fake,body,headers=H)=>call(createHandler({getSessionUser:()=>({uid:7}),getStore:()=>fake.store}),{method:'POST',headers:{'x-forwarded-for':'198.51.100.'+(++ip%250),...headers},body:typeof body==='string'?body:new URLSearchParams(body).toString(),query:{site_form:'1'}});

test('the page: no script, one form to the CRM endpoint with the token, every question declared, CSP and honeypot',()=>{
 assert.ok(!/<script\b|\son\w+\s*=/i.test(PAGE));assert.match(PAGE,/<form method="post" action="https:\/\/radix\.example\/api\/sales\?site_form=1" data-radix-form/);
 assert.match(PAGE,/form-action https:\/\/radix\.example/);assert.match(PAGE,/name="website"/);assert.ok(F.hasForm(PAGE));
 const h=hiddenOf(PAGE);assert.equal(h.t,TOKEN);assert.equal(h.sid,S0.slug);assert.equal(h.qt,C.qtOf(S0));assert.equal(h.sondaggio,S0.title);
 S0.questions.forEach(q=>assert.equal(h['l'+q.id.slice(1)],q.text));
 assert.equal(C.formAction('javascript:alert(1)'),'');assert.equal(C.formAction('http://evil.example/x'),'');assert.equal(C.formAction('http://localhost:3000/api/sales'),'http://localhost:3000/api/sales');
 const site=C.surveySite(S0,C.brandFor(PROFILE,'Forno Aurora'),{token:TOKEN,endpoint:'https://radix.example/api/sales?site_form=1',legal:FACTS,year:2026});
 assert.deepEqual(Object.keys(site.pages).sort(),['cookie.html','grazie.html','privacy.html']);assert.match(site.pages['grazie.html'],/Grazie/);assert.match(site.pages['privacy.html'],/sondaggio|questionario/i);
 assert.match(site.html,/Forno Aurora S\.r\.l\. · P\. IVA 01234567897/);
});

test('an anonymous answer: one note on the «Sondaggi» holder company, no contact, parsed back identically',async()=>{
 const fake=fakeStore(),r=await send(fake,answers());
 assert.equal(r.status,303,JSON.stringify(r.body));assert.equal(r.headers.Location,'https://radix-sv-nps-standard-2026-10.vercel.app/grazie.html');
 assert.deepEqual(fake.commands.map(x=>x.c.entity),['companies','interactions']);
 const [holder,note]=fake.commands;assert.equal(holder.c.data.name,F.SURVEY_HOLDER);assert.match(holder.c.data.notes,/non è un cliente/);
 assert.equal(note.c.data.kind,'note');assert.equal(note.c.data.title,'Risposta sondaggio «'+S0.title+'»');assert.equal(note.c.data.company_id,holder.c.data.id);assert.equal(note.c.data.contact_id,undefined);
 assert.match(note.c.data.body,/Risposta anonima\./);assert.ok(!/E-mail/.test(note.c.data.body));
 assert.ok(!fake.sql.some(q=>/FROM sales_contacts/.test(q.text)),'no contact lookup without e-mail and consent');
 // the studio reads the note back
 const rows=[{id:'n1',title:note.c.data.title,body:note.c.data.body,occurred_at:note.c.data.occurred_at,kind:'note'},{id:'n2',title:'Telefonata',body:'[sid: '+S0.slug+'] q1 [nps] → 0'}];
 const list=C.responsesOf(rows,S0);assert.equal(list.length,1,'only notes titled «Risposta sondaggio»');
 assert.deepEqual(list[0].answers,{q1:9,q2:'Il pane a lievito madre è il migliore',q3:4,q6:S0.questions[5].options[1]});assert.equal(list[0].email,'');
 assert.equal(C.responsesOf(rows,survey('breve')).length,0,'another questionnaire (other sid) is not mixed in');
 // the holder company already there: only the note
 const again=fakeStore({holder:'44444444-4444-4444-8444-444444444444'});await send(again,answers());
 assert.deepEqual(again.commands.map(x=>x.c.entity),['interactions']);assert.equal(again.commands[0].c.data.company_id,'44444444-4444-4444-8444-444444444444');
});

test('e-mail with consent: the note goes on the contact (new or existing); e-mail without consent is not stored',async()=>{
 const fake=fakeStore(),r=await send(fake,answers({email:'Anna@Esempio.it',consenso:'1'}));assert.equal(r.status,303);
 assert.deepEqual(fake.commands.map(x=>x.c.entity),['contacts','interactions']);const [contact,note]=fake.commands;
 assert.equal(contact.c.data.email,'anna@esempio.it');assert.equal(note.c.data.contact_id,contact.c.data.id);assert.equal(note.c.data.company_id,undefined);
 assert.match(note.c.data.body,/E-mail: anna@esempio\.it\nConsenso al ricontatto: sì/);assert.equal(C.parseResponse({body:note.c.data.body}).email,'anna@esempio.it');
 const ex=fakeStore({existing:{id:'33333333-3333-4333-8333-333333333333',email:'anna@esempio.it',company_id:'55555555-5555-4555-8555-555555555555'}});await send(ex,answers({email:'anna@esempio.it',consenso:'1'}));
 assert.deepEqual(ex.commands.map(x=>x.c.entity),['interactions']);assert.equal(ex.commands[0].c.data.contact_id,'33333333-3333-4333-8333-333333333333');
 assert.equal(ex.commands[0].c.data.company_id,'55555555-5555-4555-8555-555555555555','the note keeps the company of the contact');
 const noConsent=fakeStore();await send(noConsent,answers({email:'anna@esempio.it'}));
 assert.deepEqual(noConsent.commands.map(x=>x.c.entity),['companies','interactions']);assert.ok(!/anna@esempio/.test(JSON.stringify(noConsent.commands)),'e-mail without consent is dropped');
});

test('validation: unknown fields, undeclared questions, out-of-scale values and oversized fields are refused; nothing written',async()=>{
 const cases=[
  [{admin:'1'},400,/Campo non previsto/],[{q1:'11'},400,/fuori scala/],[{q3:'0'},400,/fuori scala/],[{q1:'nove'},400,/fuori scala/],
  [{q9:'x'},400,/non prevista/],[{l9:'Domanda finta'},400,/non dichiarata/],[{q2_1:'A'},400,/non prevista/],
  [{qt:'q1:nps,q1:testo'},400,/Elenco delle domande/],[{qt:'q1:boh'},400,/Elenco delle domande/],[{qt:''},400,/Elenco delle domande/],
  [{sid:'../x'},400,/Sondaggio non valido/],[{sondaggio:''},400,/titolo/],
  [{q2:'x'.repeat(C.LIMITS.answer+1)},413,/massimo 600/],[{q6:'x'.repeat(C.LIMITS.option+1)},413,/massimo 120/],[{l1:'x'.repeat(C.LIMITS.question+1)},413,/massimo 200/],[{sondaggio:'x'.repeat(C.LIMITS.title+1)},413,/massimo 80/],
  [{q1:'',q2:'',q3:'',q6:''},400,/almeno una domanda/],[{consenso:'1'},400,/e-mail/],[{email:'non-una-mail',consenso:'1'},400,/non sembra valido/],
  [{t:'rsf1.x.y'},401,/non è più collegato/]];
 for(const [extra,status,re] of cases){const fake=fakeStore(),r=await send(fake,answers(extra));assert.equal(r.status,status,JSON.stringify(extra).slice(0,80));assert.match(r.body,re);assert.match(r.body,/Risposte non inviate/);assert.equal(fake.commands.length,0)}
 const rep=fakeStore(),hr=createHandler({getSessionUser:()=>({uid:7}),getStore:()=>rep.store});
 assert.equal((await call(hr,{method:'POST',headers:{...H,'x-forwarded-for':'198.51.100.201'},body:{...answers(),q1:['9','3']},query:{site_form:'1'}})).status,400,'a repeated field (body parsed by the platform)');assert.equal(rep.commands.length,0);
 const huge=fakeStore();assert.equal((await send(huge,{...answers(),q2:'x'.repeat(70000)})).status,413,'the whole body is capped');
 const many=fakeStore(),body=answers();for(let i=0;i<500;i++)body['z'+i]='1';assert.equal((await send(many,body)).status,413);
 const bot=fakeStore(),b=await send(bot,answers({website:'http://spam.example'}));assert.equal(b.status,303,'the bot sees the thank-you');assert.equal(bot.commands.length,0);assert.equal(bot.sql.length,0);
 const gone=fakeStore({roles:{}});assert.equal((await send(gone,answers())).status,403);assert.equal(gone.commands.length,0);
 // the contact form keeps its own smaller limit
 const cf=fakeStore(),contact=new URLSearchParams({t:TOKEN,name:'Mario',email:'m@x.it',message:'x'.repeat(25000),privacy:'1',website:''}).toString();assert.equal((await send(cf,contact)).status,413);
 // the server limits are the studio limits
 for(const k of ['questions','options','option','answer','question','title'])assert.equal(F.SURVEY[k],C.LIMITS[k],k);assert.deepEqual([...F.SURVEY_TYPES],[...C.TYPE_IDS]);
 assert.equal(F.SURVEY_PREFIX,C.TITLE_PREFIX);
});

test('a long questionnaire: 30 questions with long answers fit in one 4000-character note and parse back',async()=>{
 const s=survey('breve');while(s.questions.length<30)C.addQuestion(s,'testo');s.questions.forEach((q,i)=>{if(!q.text)q.text='Domanda aperta numero '+(i+1)+' '+'x'.repeat(150)});
 const page=C.pageHtml(s,C.brandFor(PROFILE,'Forno Aurora'),{endpoint:'https://radix.example/api/sales?site_form=1',token:TOKEN});
 const body={...hiddenOf(page),website:'',q1:'10'};s.questions.slice(1).forEach(q=>body[q.id]='y'.repeat(590));
 const fake=fakeStore(),r=await send(fake,body);assert.equal(r.status,303,String(r.body).slice(0,200));const note=fake.commands[1].c.data;
 assert.ok(note.body.length<=4000);const back=C.parseResponse(note);assert.equal(back.answers.q1,10);assert.equal(Object.keys(back.answers).length,30);
});

test('rate limit: per IP shared with the contact form, then per workspace on the database',async()=>{
 const fake=fakeStore(),h=createHandler({getSessionUser:()=>null,getStore:()=>fake.store}),headers={...H,'x-forwarded-for':'203.0.113.77'},codes=[];
 for(let i=0;i<6;i++)codes.push((await call(h,{method:'POST',headers,body:new URLSearchParams(answers()).toString(),query:{site_form:'1'}})).status);
 assert.deepEqual(codes,[303,303,303,303,303,429]);
 const busy=fakeStore({recent:F.SURVEY.perWorkspaceHour}),r=await send(busy,answers());assert.equal(r.status,429);assert.match(r.body,/Troppe risposte/);assert.equal(busy.commands.length,0);
 const q=busy.sql.find(x=>/count\(\*\)/.test(x.text));assert.match(q.text,/starts_with\(title,\$2\)/);assert.deepEqual(q.params,[WS,'Risposta sondaggio']);
});

test('results: analyse, paper answers from the CSV model, CSV export with formulas neutralised',()=>{
 const s=survey(),mk=(id,at,a,email)=>({id,at,sid:s.slug,answers:a,labels:{},email:email||'',contactId:null});
 const list=[mk('1','2026-10-05T08:00:00Z',{q1:10,q2:'Ottimo pane',q3:5,q6:s.questions[5].options[0]}),mk('2','2026-10-07T08:00:00Z',{q1:7,q3:3},'a@b.it'),mk('3','2026-10-06T08:00:00Z',{q1:3,q2:'=HYPERLINK("x")'})];
 const a=C.analyse(s,list);assert.equal(a.count,3);assert.equal(a.first,'2026-10-05T08:00:00Z');assert.equal(a.last,'2026-10-07T08:00:00Z');assert.equal(a.withEmail,1);
 assert.equal(a.nps.score,0);assert.equal(a.nps.n,3);const q3=a.questions.find(q=>q.id==='q3');assert.deepEqual(q3.dist,[0,0,1,0,1]);assert.equal(q3.mean,4);
 const q6=a.questions.find(q=>q.id==='q6');assert.equal(q6.answered,1);assert.equal(q6.counts[0].n,1);assert.equal(q6.counts[0].pct,100);
 const csv=C.responsesCsv(s,list);assert.ok(csv.startsWith('﻿'));assert.match(csv,/^﻿Data;Contatto;D1 · /);assert.match(csv,/'=HYPERLINK\(""x""\)/);assert.match(csv,/a@b\.it/);assert.match(csv,/anonimo/);
 assert.match(C.summaryCsv(s,a),/NPS;nps;3;Punteggio NPS;0;/);
 // paper: the model downloaded from the studio, filled by hand; bad values left empty, empty rows skipped
 const model=C.responsesCsv(s,[]),filled=model.trimEnd()+'\r\n;;9;Buono;6;;;Più di 2 anni;\r\n;;12;;;;;;\r\n;;;;;;;;\r\n';
 const p=C.paperResponses(filled,s);assert.equal(p.error,'');assert.equal(p.responses.length,1);assert.equal(p.skipped,1);
 assert.deepEqual(p.responses[0].answers,{q1:9,q2:'Buono',q6:'Più di 2 anni'},'6 is out of the 1-5 scale');assert.equal(p.responses[0].paper,true);
 assert.match(C.paperResponses('a;b\n1;2',s).error,/colonne D1/);assert.match(C.paperResponses('',s).error,/vuoto/);
 const both=C.analyse(s,[...list,...p.responses]);assert.equal(both.count,4);assert.equal(both.paper,1);assert.equal(both.last,'2026-10-07T08:00:00Z','paper answers have no date');
 assert.match(C.npsSvg(a.nps),/^<svg[^>]*aria-label="NPS 0 su 3 risposte"/);assert.match(C.npsSvg(a.nps,{width:340}),/viewBox="0 0 340 216"/);assert.match(C.npsSvg(null),/Nessuna risposta/);
 assert.match(C.distSvg(q3),/^<svg/);assert.match(C.choiceSvg(q6,{width:340}),/^<svg/);
});

test('files: questionnaire PDF, report PDF, CSV, the page, LEGGIMI; one zip',()=>{
 const s=survey(),brand=C.brandFor(PROFILE,'Forno Aurora'),site=C.surveySite(s,brand,{token:TOKEN,endpoint:'https://radix.example/api/sales?site_form=1',legal:FACTS,year:2026});
 const list=C.responsesOf([{id:'1',title:'Risposta sondaggio «x»',occurred_at:'2026-10-05T08:00:00Z',body:'Risposte al sondaggio «x» [sid: '+s.slug+'].\nq1 [nps] Quanto… → 10\nq2 [testo] Perché → Buono\n\nRisposta anonima.'}],s),a=C.analyse(s,list);
 const out=C.files(s,a,brand,{date:TODAY,site,responses:list});
 assert.deepEqual(out.map(f=>f.name),['questionario.pdf','report.pdf','risposte.csv','riepilogo.csv','pagina/index.html','pagina/privacy.html','pagina/cookie.html','pagina/grazie.html','LEGGIMI.txt']);
 for(const f of out.filter(f=>/\.pdf$/.test(f.name))){const t=pdfText(f.data);assert.match(t,/^%PDF-/);assert.ok(f.data.length>3000,f.name)}
 const texts=C.reportDoc(s,a,brand,{date:TODAY}).pages.flatMap(p=>p.items).filter(x=>x.t==='text').map(x=>x.s);
 assert.ok(texts.includes('+100'),'the NPS of the report');assert.ok(!texts.some(t=>/−/.test(t)),'no minus sign outside the PDF fonts');
 const zip=C.bundle(out,{date:TODAY});assert.equal(zip[0],0x50);assert.equal(zip[1],0x4b);
 assert.match(C.readme(s,a,{date:TODAY}),/non è ancora online/);
});

test('optional AI summary: never without RadixConfirm, one call to the analyst, invented quotes and numbers dropped',async()=>{
 const s=survey(),a=C.analyse(s,['Il pane a lievito madre è il migliore della zona','La focaccia è sempre fresca','A volte c’è tanta coda il sabato','Prezzi un po’ alti, chiamatemi al 333 1234567 o scrivete a mario@x.it'].map((t,i)=>({id:String(i),at:'',sid:s.slug,answers:{q2:t},labels:{},email:''})));
 let calls=0,sent='';const rt={reply:async x=>{calls++;sent=x;return {text:JSON.stringify({temi:[
  {titolo:'Il pane',sintesi:'Piace il pane a lievito madre.',citazioni:['Il pane a lievito madre è il migliore della zona','Il miglior forno d’Italia']},
  {titolo:'Attese',sintesi:'Il 40% si lamenta della coda.',citazioni:['A volte c’è tanta coda il sabato']},
  {titolo:'Inventato',sintesi:'Clienti furiosi.',citazioni:['Clienti furiosi']}]})}}};
 const no=await C.summarizeWithAi({survey:s,analysis:a,rt,confirm:async()=>false,project:{id:'demo',name:'Forno Aurora'}});
 assert.deepEqual(no,{cancelled:true});assert.equal(calls,0,'no AI call without a yes');
 let asked=null;const r=await C.summarizeWithAi({survey:s,analysis:a,rt,confirm:async o=>{asked=o;return true},project:{id:'demo',name:'Forno Aurora'}});
 assert.equal(calls,1);assert.match(asked.cost,/una sola chiamata AI/);assert.equal(sent.role,C.AGENT);assert.equal(sent.messages.length,1);
 assert.ok(!/333 1234567|mario@x\.it/.test(sent.messages[0].content),'phone numbers and e-mails are not sent');
 assert.deepEqual(r.themes.map(t=>t.title),['Il pane']);assert.deepEqual(r.themes[0].quotes,['Il pane a lievito madre è il migliore della zona']);
 assert.ok(r.dropped.some(d=>/Il miglior forno/.test(d)));assert.ok(r.dropped.some(d=>/numeri.*Attese/.test(d)));assert.ok(r.dropped.some(d=>/Clienti furiosi/.test(d)));
 await assert.rejects(C.summarizeWithAi({survey:s,analysis:C.analyse(s,[]),rt,confirm:async()=>true}),/almeno 3 risposte/);assert.equal(calls,1);
 assert.equal(C.parseSummary('niente json',s,a),null);
 // the studio never calls on its own: the summary sits behind the button and its confirm
 const studio=R('lib/survey-studio.js');assert.equal((studio.match(/summarizeWithAi\(/g)||[]).length,1);assert.match(studio,/aiB\.onclick=async\(\)=>\{[^]*?S\.summarizeWithAi\(\{[^}]*confirm:askConfirm/);
});

test('saved under «surveys» in the project: records replaced by id, online addresses kept, no form token saved',async()=>{
 let doc={schemaVersion:1,conversations:{analytics:[{role:'user',content:'ciao'}]},surveys:{schemaVersion:1,items:[],online:{'nps-standard-2026-10':{url:'https://radix-sv-x.vercel.app',deploymentId:'dpl_1'}}},other:1};
 const ws={bind:(id,kind)=>{assert.equal(id,'demo');assert.equal(kind,'agents');return {load:async()=>JSON.parse(JSON.stringify(doc)),save:async d=>{doc=d}}}};
 const model={...C.newModel({projectName:'Forno Aurora',profile:PROFILE}),survey:survey(),form:{workspace:'Forno Aurora · CRM',workspaceId:WS,token:TOKEN}};
 const rec=C.savedRecord(model,{by:'Anna',at:'2026-10-23T10:00:00.000Z'});assert.equal(rec.id,'survey-nps-standard-2026-10');assert.ok(!JSON.stringify(rec).includes(TOKEN),'the token is not saved');assert.equal(rec.model.form.workspaceId,WS);
 await C.saveToProject(ws,'demo',rec);await C.saveToProject(ws,'demo',C.savedRecord(model,{at:'2026-10-23T11:00:00.000Z'}));
 assert.equal(doc.surveys.items.length,1);assert.equal(doc.surveys.items[0].at,'2026-10-23T11:00:00.000Z');assert.equal(doc.surveys.online['nps-standard-2026-10'].deploymentId,'dpl_1');
 assert.equal(doc.other,1);assert.equal(doc.conversations.analytics[0].content,'ciao');
 assert.deepEqual(C.readStore({surveys:'x'}),{schemaVersion:1,items:[],online:{}});
});

// ---- publishing: the survey action of api/_site_publish.js, with a fake Vercel ----
const res=()=>({code:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(v){this.body=v;return this}});
function memStore(){const s={doc:{data:{schemaVersion:1,conversations:{}},revision:1},project:async id=>id===PROJECT?{id,name:'Forno Aurora'}:null,load:async()=>JSON.parse(JSON.stringify(s.doc)),save:async(id,data,rev)=>{s.doc={data,revision:rev+1};return true}};return s}
async function publish(body){const calls=[],orig=auth.getSessionUser,store=memStore();auth.getSessionUser=()=>({uid:7,name:'Anna'});const r=res();
 const fetch=async(url,opts)=>{calls.push({url,body:opts.body?JSON.parse(opts.body):null});return {ok:true,status:200,json:async()=>({id:'dpl_1',url:'radix-sv-x.vercel.app',readyState:'READY'})}};
 try{await pub.handle({method:'POST',query:{},body:{projectId:PROJECT,...body},headers:{}},r,{env:{VERCEL_SITES_TOKEN:'vcp_x',JWT_SECRET:SECRET},store,fetch,sleep:async()=>{},pollMs:1,waitMs:10})}finally{auth.getSessionUser=orig}
 return Object.assign(r,{calls,store})}

test('publish: only a questionnaire of this survey, linked to this project, without scripts; saved under surveys.online',async()=>{
 const s=survey(),brand=C.brandFor(PROFILE,'Forno Aurora'),site=C.surveySite(s,brand,{token:TOKEN,endpoint:'https://radix.example/api/sales?site_form=1',legal:FACTS,year:2026});
 let r=await publish({action:'survey',survey:s.slug,html:site.html,pages:site.pages});assert.equal(r.code,200,JSON.stringify(r.body));
 assert.equal(r.calls.length,1);assert.match(r.calls[0].body.name,/^radix-sv-/);assert.equal(r.body.survey,s.slug);
 assert.equal(r.store.doc.data.surveys.online[s.slug].deploymentId,'dpl_1');
 const bad=[[{survey:'altro-sondaggio'},422,/non corrisponde/],[{survey:'../x'},400,/non valido/],[{html:site.html.replace('</form>','<script>alert(1)</script></form>')},422,/script/],
  [{html:site.html.replace(/name="sondaggio"/,'name="x"')},422,/non è un questionario/],[{pages:{...site.pages,'altro.html':'x'}},400,/Pagine/],
  [{html:site.html.replace(TOKEN,F.sign({uid:7,workspace:WS,site:'altro-progetto'},SECRET).token)},422,/collegat/]];
 for(const [patch,code,re] of bad){r=await publish({action:'survey',survey:s.slug,html:site.html,pages:site.pages,...patch});assert.equal(r.code,code,JSON.stringify(patch).slice(0,60)+' '+JSON.stringify(r.body));assert.match(r.body.error,re);assert.equal(r.calls.length,0)}
 assert.equal(pub.surveyProject(s.slug,PROJECT),pub.surveyProject(s.slug,PROJECT));assert.notEqual(pub.surveyProject(s.slug,PROJECT),pub.surveyProject(s.slug,'altro'));
});

test('wiring: card in «Strategia», scripts in crea.html, studio map, agents page keeps «surveys», styles and icon',()=>{
 const core=require('../agency/crea-core.js'),card=core.CARDS.find(c=>c.id==='sondaggio');
 assert.equal(card.group,'Strategia');assert.equal(card.inline,'survey');assert.equal(card.title,'Sondaggio e NPS');assert.match(card.cost,/Nessuna chiamata AI/);assert.match(card.cost,/Facoltativa: 1 chiamata AI all’analista[^.]*con conferma/);
 for(const w of ['sondaggio','questionario','nps','fare un sondaggio ai clienti'])assert.equal(core.best(w),'sondaggio',w);
 const html=R('agency/crea.html'),i=s=>html.indexOf('<script src="/lib/'+s+'"');
 for(const s of ['print-studio.js','zip-lite.js','site-legal.js','survey-core.js'])assert.ok(i(s)>=0&&i(s)<i('survey-studio.js'),s);
 assert.ok(html.indexOf('/sales/crm-campaign-next-core.js')>=0);
 const js=R('agency/crea.js');assert.match(js,/survey:\{global:'RadixSurveyStudio'/);assert.match(js,/S\.surveyStudio\(\{project,profile:current\.profile/);
 const ap=R('agents-page.js');assert.equal((ap.match(/data\.surveys=fresh\.surveys/g)||[]).length,2);assert.match(ap,/if\(d\.surveys\)out\.surveys=d\.surveys/);
 assert.match(R('shell/crea.css'),/\.cr-panel \.survey-studio/);assert.match(R('agency/marketing-look.js'),/sondaggio:'survey'/);
 assert.match(R('lib/radix-workspace-client.js'),/survey:\(projectId,survey,html,pages\)=>siteCall\('POST',\{action:'survey'/);
 const src=R('api/_site_form.js');assert.ok(!/CREATE TABLE|ALTER TABLE/i.test(src),'no new table');assert.ok(!/sendMail|nodemailer/.test(src));
 assert.ok(!fs.readdirSync(path.join(__dirname,'..','migrations')).some(f=>/survey|sondagg/i.test(f)),'no migration');
});
