'use strict';
// Studio «Audit di comunicazione» (lib/audit-studio.js): the scoring rules per area, «non valutabile» when an area has no
// data (never a score by guess), the overall score weighted by the goal, the 10 actions by fixed rules, the grounding of
// the optional AI rewrite (one confirmation, one call, fake AI only; cancel = no call), the PDF bytes, the shareable
// HTML, the checks, the saved key audits that agents-page.js keeps and the card in «Cosa vuoi fare» › Strategia.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const A=require('../lib/audit-studio.js'),F=require('./audit-studio-fixtures.js');
const crea=require('../agency/crea-core.js'),look=require('../agency/marketing-look.js');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const data=over=>A.gather(F.input(over));
const BRAND=A.brandFor(F.PROFILE,'Forno Aurora');
const latin=b=>Buffer.from(b).toString('latin1');
const pdfText=bytes=>[...latin(bytes).matchAll(/<([0-9A-F]+)> Tj/g)].map(m=>Buffer.from(m[1],'hex').toString('latin1')).join('\n');
const part=(d,id,label)=>d.areas[id].parts.find(p=>p.label===label);

test('scoring rules: each area from its written rules, with its evidence',()=>{
 const d=data();assert.deepEqual(d.sources,A.AREAS.map(a=>a.id));
 // Sito web: the saved Analisi del sito as it is
 const s=d.areas.sito;assert.equal(s.score,64);assert.equal(s.grade.label,'Da migliorare');assert.equal(s.parts.length,5);
 assert.deepEqual(s.findings.map(f=>f.title),['Title duplicati','Link interni interrotti','Meta description mancanti','Manca lo schema LocalBusiness','Caricamento lento su mobile','Manca una pagina Chi siamo'],'alta first, bassa left out');
 assert.match(s.findings[0].evidence,/5 pagine con lo stesso title.*https:\/\/www\.fornoaurora\.it\//);assert.equal(s.findings[0].impact,'alto');
 // Dati strutturati: 5 of 7 required fields × 10 + 6 of 6 optional × 5 = 80
 const ds=d.areas.dati;assert.equal(part(d,'dati','Campi obbligatori').points,50);assert.equal(part(d,'dati','Campi facoltativi').points,30);assert.equal(ds.score,80);
 assert.match(ds.findings[0].evidence,/2 campi obbligatori su 7 mancanti: Ragione sociale, Partita IVA/);
 // Scheda Google: 20+15+6,7+9+4+5+6,7+10 = 76
 const g=d.areas.google;assert.equal(g.score,76);assert.equal(part(d,'google','Servizi').points,9);assert.equal(part(d,'google','Descrizione').detail,'356 caratteri');assert.match(g.note,/non legge il profilo pubblicato/);
 // Recensioni: avg 4,2 → 48; 5 of 6 not negative → 16,7; 5 of 6 replied → 16,7 → 81
 const r=d.areas.recensioni;assert.equal(part(d,'recensioni','Media delle stelle').points,48);assert.equal(r.score,81);assert.ok(r.findings.some(f=>f.evidence==='Media 4,2 stelle su 6 recensioni'));
 // Social: last 90 days (10 posts): 0,8 a settimana → 14 of 35; 7 weeks of 13 → 13,5 of 25; engagement 11,48% ≥ 3% → 30; 2 channels → 10
 const so=d.areas.social;assert.equal(part(d,'social','Frequenza').points,14);assert.equal(part(d,'social','Continuità').points,13.5);assert.equal(part(d,'social','Engagement medio').points,30);assert.equal(so.score,68);
 // Google Search: position 12,8 → 25,5 of 40; CTR 2,77% → 16,6 of 30; clicks +14,7% → 30
 const se=d.areas.seo;assert.equal(part(d,'seo','Posizione media').points,25.5);assert.equal(part(d,'seo','CTR').points,16.6);assert.equal(part(d,'seo','Andamento dei clic').detail,'+14,7%');assert.equal(se.score,72);
 // Coerenza: kit complete 40, the site's accent #C0392B is not in the kit (15 of 30), profile colours all in the kit (30)
 const b=d.areas.brand;assert.equal(b.score,85);assert.equal(b.grade.label,'Buono');assert.match(b.findings[0].evidence,/1 colore del sito su 2 non è nel kit: #C0392B/);
 // overall: the scores weighted for «locale»
 const w=A.WEIGHTS.locale,exp=Math.round(Object.entries(d.areas).reduce((t,[id,a])=>t+a.score*w[id],0));assert.equal(d.overall.score,exp);assert.equal(d.overall.count,7);
 for(const g2 of Object.values(A.WEIGHTS))assert.equal(Math.round(Object.values(g2).reduce((a,v)=>a+v,0)*1000),1000,'weights sum to 1');
 const im=A.gather(F.input({goal:'immagine'})),wi=A.WEIGHTS.immagine;assert.equal(im.overall.score,Math.round(Object.entries(im.areas).reduce((t,[id,a])=>t+a.score*wi[id],0)),'the goal picks the weights');
 // every finding has its evidence: a number or an address (the quality rule of the job)
 for(const f of A.findingsOf(d))assert.match(f.evidence,/\d|https?:\/\//,f.id);
 assert.equal(A.scoreOf([{points:10,max:20},{points:null,max:30}]),50,'a rule that cannot be measured is left out');
 assert.deepEqual([A.grade(85).label,A.grade(60).label,A.grade(59).label,A.grade(null).label],['Buono','Da migliorare','Critico','non valutabile']);
});

test('«non valutabile»: an area without data has no score, does not count and is never guessed',()=>{
 const e=A.gather({today:F.TODAY,projectName:'Nuovo cliente'});
 for(const id of e.sources){const a=e.areas[id];assert.equal(a.available,false,id);assert.equal(a.score,null,id);assert.equal(a.grade.label,'non valutabile');assert.ok(a.note,id+' says why')}
 assert.equal(e.overall.score,null);assert.equal(e.overall.count,0);
 assert.equal(A.checksOf(e,{}).find(c=>c.id==='dati').state,'fail');assert.deepEqual(A.blocking(A.checksOf(e,{})).map(c=>c.id),['dati']);
 // one area missing: the others keep their score and the overall is renormalised over the areas with a score
 const ag=F.agents();delete ag.gbp;const d=data({agents:ag});
 assert.equal(d.areas.google.available,false);assert.equal(d.areas.recensioni.available,false);assert.match(d.areas.google.note,/Nessuna scheda Google/);
 const w=A.WEIGHTS.locale,have=Object.values(d.areas).filter(a=>a.available);assert.equal(d.overall.count,5);
 assert.equal(d.overall.score,Math.round(have.reduce((t,a)=>t+a.score*w[a.id],0)/have.reduce((t,a)=>t+w[a.id],0)));
 // fewer than 3 reviews with stars: not enough to score
 const ag2=F.agents();ag2.gbp.replies=ag2.gbp.replies.slice(0,2);const r=data({agents:ag2}).areas.recensioni;assert.equal(r.available,false);assert.match(r.note,/Solo 2 recensioni con le stelle: ne servono almeno 3/);
 // no posts with numbers in the last 90 days, no Search Console, no kit, no saved site
 const old=A.gather({...F.input(),today:new Date('2027-06-01T09:00:00Z')});assert.equal(old.areas.social.available,false);assert.match(old.areas.social.note,/ultimi 90 giorni/);
 assert.equal(data({agents:{...F.agents(),seoResults:undefined}}).areas.seo.available,false);
 assert.equal(data({profile:{}}).areas.brand.available,false);
 const ag3=F.agents();ag3.conversations={};const nd=data({agents:ag3});assert.equal(nd.areas.dati.available,false);assert.match(nd.areas.dati.note,/Nessun sito salvato dallo Studio Sito/);
 assert.equal(part(nd,'brand','Colori del sito').points,null,'no saved site: that rule is left out, not 0');assert.equal(nd.areas.brand.score,100);
 // only the sources picked are read
 const only=data({sources:['social','seo']});assert.deepEqual(only.sources,['social','seo']);assert.deepEqual(Object.keys(only.areas),['social','seo']);
 // in the PDF and the page the words say it
 const pdf=pdfText(A.auditPdf(e,{direction:'titolare'},BRAND,{date:F.TODAY}));assert.match(pdf,/non valutabile/);assert.doesNotMatch(pdf,/\b0\/100/);
 assert.match(A.htmlAudit(d,{direction:'commerciale'},BRAND),/Aree non valutabili/);
 // a stale site audit is flagged in the checks
 const st=F.agents();st.siteAudit=F.siteAudit({at:'2026-05-01T09:00:00.000Z'});const sd=data({agents:st});assert.equal(sd.areas.sito.stale,true);assert.equal(A.checksOf(sd,{}).find(c=>c.id==='freschezza').state,'warn');
});

test('the 10 actions: fixed rules, no AI, ordered by impact × 2 − effort, then the area weight',()=>{
 const d=data(),acts=A.ruleActions(d);assert.equal(acts.length,10);
 const pr=a=>A.IMPACT[a.impact]*2-A.EFFORT[a.effort];for(let i=1;i<acts.length;i++)assert.ok(pr(acts[i-1])>=pr(acts[i]),'ordered');
 assert.deepEqual(acts[0],{ref:'F1',area:'sito',text:'Scrivi un title diverso per ogni pagina, con il prodotto e la città.',why:'5 pagine con lo stesso title «Forno Aurora» · 5 pagine (es. https://www.fornoaurora.it/)',impact:'alto',effort:'basso'});
 const ids=new Set(A.findingsOf(d).map(f=>f.id));for(const a of acts){assert.ok(ids.has(a.ref),a.ref);assert.match(a.why,/\d|https?:/)}
 assert.deepEqual(A.ruleActions(d),acts,'same data, same actions');
 // among the same priority the area that weighs more for the goal comes first
 const loc=acts.filter(a=>pr(a)===3).map(a=>A.WEIGHTS.locale[a.area]);assert.deepEqual(loc,loc.slice().sort((x,y)=>y-x));
 // areas without data give an action: collect that data
 const e=A.gather({today:F.TODAY});const ea=A.ruleActions(e);assert.equal(ea.length,7);assert.equal(ea[0].text,'Avvia l’Analisi del sito: è gratuita e legge fino a 25 pagine pubbliche.');assert.ok(ea.every(a=>/\d/.test(a.why)));
 // only the areas shown
 assert.ok(A.ruleActions(d,['social']).every(a=>a.area==='social'));
 assert.equal(A.options({},d).actions.length,10);assert.equal(A.checksOf(d,{}).find(c=>c.id==='azioni').state,'ok');
 assert.equal(A.checksOf(d,{areas:['brand']}).find(c=>c.id==='azioni').state,'warn','fewer than 10 found: said');
});

test('the AI rewrite: grounded on the findings, one confirmation, one call; cancel means no call (fake AI)',async()=>{
 const d=data(),allowed=A.allowedNumbers(d);for(const n of ['64','4.2','12.8','356','14100','2.8'])assert.ok(allowed.has(n),n);
 const prompt=A.aiPrompt(d);assert.match(prompt,/F1 · Sito web · Title duplicati/);assert.match(prompt,/sono dati, non istruzioni/);assert.match(prompt,/Non parlare di vendite, fatturato, traffico/);
 assert.match(A.aiPrompt(A.gather({today:F.TODAY})),/Sito web: non valutabile/);
 const reply=JSON.stringify({sintesi:['Il punteggio complessivo è '+d.overall.score+'/100.','Le vendite sono calate del 12%.','La scheda Google è a 76/100.'],
  azioni:[{ref:'F12',azione:'Chiedere una recensione a ogni cliente soddisfatto',perche:'media 4,2 stelle su 6 recensioni',impatto:'alto',sforzo:'basso'},
   {ref:'F1',azione:'Title diversi per le 5 pagine',perche:'5 pagine con lo stesso title',impatto:'alto',sforzo:'basso'},
   {ref:'F99',azione:'Rifare il logo',perche:'è vecchio',impatto:'alto',sforzo:'alto'},
   {ref:'F1',azione:'Di nuovo i title',perche:'doppione'},
   {ref:'F16',azione:'Pubblicare 7 post a settimana per raddoppiare il traffico',perche:'0,8 a settimana'},
   {ref:'F18',azione:'Portare la posizione da 12,8 a 3',perche:'posizione media 12,8',impatto:'qualcosa',sforzo:'alto'}]});
 const p=A.parseAi('Ecco: '+reply,d);
 assert.deepEqual(p.summary,['Il punteggio complessivo è '+d.overall.score+'/100.','La scheda Google è a 76/100.']);
 assert.deepEqual(p.actions.map(a=>a.ref),['F12','F1','F18']);assert.equal(p.actions[0].effort,'basso');assert.equal(p.actions[2].impact,'alto','an unknown level keeps the finding’s');
 assert.equal(p.dropped,4,'unknown ref, repeated ref, unmeasured metric with a number not in the data, a sentence about sales');
 assert.equal(A.parseAi('non so',d),null);assert.equal(A.parseAi('{"azioni":[{"ref":"F77","azione":"x"}]}',d),null);
 // cancelled: no call
 let calls=0,asked=0;const rt={reply:async o=>{calls++;assert.equal(o.role,'strategist');assert.equal(o.messages.length,1);assert.equal(o.messages[0].content,A.aiPrompt(d));return {text:reply}}};
 assert.deepEqual(await A.aiRewrite({data:d,rt,confirm:async()=>{asked++;return false}}),{cancelled:true});assert.equal(calls,0);assert.equal(asked,1);
 let started=false;const r=await A.aiRewrite({data:d,rt,project:{id:'forno-aurora',name:'Forno Aurora'},onStart:()=>{started=true},confirm:async o=>{asked++;assert.match(o.title,/10 azioni/);assert.match(o.cost,/una sola chiamata AI/);assert.match(o.ok,/1 chiamata/);return true}});
 assert.equal(calls,1);assert.equal(asked,2);assert.ok(started);assert.deepEqual(r,p);
 await assert.rejects(A.aiRewrite({data:d,rt:{reply:async()=>({text:'boh'})},confirm:async()=>true}),/legate ai risultati/);
 await assert.rejects(A.aiRewrite({data:d,rt:null,confirm:async()=>true}),/Gli agenti/);
 // used in the report: the actions keep their refs, the note says how they were checked, no foreign number
 const o={summary:p.summary,actions:p.actions,aiUsed:true};assert.match(A.htmlAudit(d,o,BRAND),/riscritte con l’AI e controllate/);
 assert.equal(A.checksOf(d,o).find(c=>c.id==='numeri').state,'ok');
 assert.deepEqual(A.checksOf(d,{note:'Siamo cresciuti del 37%',actions:[{text:'Raddoppiare a 30.000 impression',impact:'alto',effort:'basso'}]}).find(c=>c.id==='numeri').issues.sort(),['30000','37']);
});

test('the three angles: A4 pages with the client colours, nothing out of the page; the PDF bytes',()=>{
 const d=data();assert.deepEqual(A.DIRECTIONS.map(x=>x.title),['Sintesi per il titolare','Tecnico','Commerciale']);
 const docs=Object.fromEntries(A.DIRECTIONS.map(x=>[x.id,A.layoutAudit(d,{direction:x.id},BRAND)]));
 const words=doc=>doc.pages.flatMap(p=>p.items.filter(i=>i.t==='text').map(i=>i.s)).join(' ');
 for(const [id,doc] of Object.entries(docs)){assert.deepEqual(A.fitProblems(doc),[],id);assert.ok(doc.pages.every(p=>p.w===210&&p.h===297));
  assert.ok(doc.pages[0].items.some(it=>it.t==='logo'),id+': kit logo');assert.ok(doc.pages[0].items.some(it=>it.t==='rect'&&it.fill==='#2F5D50'),id+': kit primary colour');assert.match(words(doc),/Punteggio complessivo/)}
 assert.ok(docs.tecnico.pages.length>docs.titolare.pages.length);assert.match(words(docs.tecnico),/Regole del punteggio/);assert.match(words(docs.tecnico),/Campi obbligatori/);
 assert.match(words(docs.titolare),/Le 10 azioni, in ordine/);assert.match(words(docs.commerciale),/Dove oggi si perdono opportunit/);
 assert.deepEqual(A.fitProblems(A.layoutAudit(d,{title:'Audit '+'molto '.repeat(30)},BRAND)),[]);
 assert.deepEqual(A.fitProblems(A.layoutAudit(A.gather({today:F.TODAY}),{direction:'tecnico'},A.brandFor({},'Studio Rossi'))),[]);
 for(const dir of ['titolare','tecnico','commerciale']){const doc=docs[dir],bytes=A.auditPdf(d,{direction:dir},BRAND,{date:F.TODAY,doc}),s=latin(bytes);
  assert.ok(bytes instanceof Uint8Array&&bytes.length>2000);assert.match(s,/^%PDF-1\.4\n/);assert.match(s,/%%EOF\n$/);
  assert.equal((s.match(/\/Type \/Page \/Parent/g)||[]).length,doc.pages.length);assert.match(s,/\/MediaBox \[0 0 595\.276 841\.89\]/);
  const start=+/startxref\n(\d+)\n%%EOF/.exec(s)[1];assert.equal(s.slice(start,start+4),'xref');
  const offs=[...s.slice(start).matchAll(/(\d{10}) 00000 n /g)].map(m=>+m[1]);offs.forEach((o,i)=>assert.equal(s.slice(o,o+String(i+1).length+6),(i+1)+' 0 obj'));
  assert.match(s,/\/Producer \(RADIX Audit di comunicazione\)/);assert.doesNotMatch(s,/\/JavaScript|\/Launch|\/URI/);
  const t=pdfText(bytes);assert.match(t,/Audit di comunicazione/);assert.match(t,/Pagina 1 di /);assert.doesNotMatch(t,/\?/,'every character printable')}
 assert.deepEqual(A.auditPdf(d,{},BRAND,{date:F.TODAY}),A.auditPdf(d,{},BRAND,{date:F.TODAY}),'same data, same bytes');
 assert.equal(A.fileBase(d,BRAND),'audit-forno-aurora-2026-10-22');
});

test('the shareable HTML page: one file, no external request, light and dark, printable, escaped',()=>{
 const d=data({projectName:'Forno <Aurora>'}),html=A.htmlAudit(d,{direction:'tecnico',note:'Nota <b>vera</b>'},BRAND);
 assert.deepEqual(A.externalRefs(html),[]);assert.match(html,/^<!doctype html>/);assert.match(html,/prefers-color-scheme:dark/);assert.match(html,/@media print/);
 assert.match(html,/Nota &lt;b&gt;vera&lt;\/b&gt;/);assert.match(html,/Forno &lt;Aurora&gt;/);assert.match(html,/<img class="logo" src="data:image\/svg\+xml/);
 assert.match(html,/Regole del punteggio/);assert.match(html,/data-grade="good"/);
 for(const dir of ['titolare','commerciale'])assert.deepEqual(A.externalRefs(A.htmlAudit(d,{direction:dir},BRAND)),[]);
 const bad=A.htmlAudit(d,{},{...BRAND,logo:'<svg viewBox="0 0 10 10"><image href="https://evil.test/x.png"/></svg>'});assert.deepEqual(A.externalRefs(bad),[]);
});

test('saved in the project: key audits in the agents document, other keys kept, retried on a conflict; agents-page keeps it',async()=>{
 const d=data(),o={direction:'commerciale',note:'Audit di ottobre'};
 let stored={schemaVersion:1,conversations:{strategist:[{role:'user',content:'ciao'}]},prefs:{a:1},reports:{schemaVersion:1,items:[{id:'r'}]},audits:{schemaVersion:1,items:[{id:'old',data:{areas:{}}}]}},conflicts=1;
 class ConflictError extends Error{}
 const ws={ConflictError,bind:(pid,name)=>{assert.equal(pid,'forno-aurora');assert.equal(name,'agents');return {load:async()=>JSON.parse(JSON.stringify(stored)),save:async x=>{if(conflicts-->0)throw new ConflictError('x');stored=x}}}};
 const rec=A.savedRecord(d,o,{by:'Giulia',at:'2026-10-22T10:00:00.000Z'});assert.equal(rec.id,'audit-20261022100000');assert.equal(rec.overall,d.overall.score);assert.equal(rec.actions.length,10);
 await A.saveToProject(ws,'forno-aurora',rec);
 assert.deepEqual(stored.audits.items.map(x=>x.id),['old',rec.id]);assert.deepEqual(stored.reports,{schemaVersion:1,items:[{id:'r'}]});assert.deepEqual(stored.prefs,{a:1});assert.equal(stored.conversations.strategist.length,1);
 for(let i=0;i<14;i++)await A.saveToProject(ws,'forno-aurora',{...rec,id:'a'+i});assert.equal(stored.audits.items.length,12,'only the last 12');
 assert.deepEqual(A.readStore({audits:'boh'}),{schemaVersion:1,items:[]});assert.deepEqual(A.readStore({audits:{items:[{id:'x'}]}}).items,[],'a record without its data is ignored');
 const back=A.fromRecord(rec);assert.equal(A.htmlAudit(back.data,back.options,BRAND),A.htmlAudit(d,o,BRAND),'reopened with the data as it was');
 const src=read('agents-page.js'),fn=/function clean\(d\)\{[^\n]*\}/.exec(src)[0],ctx={MAX_KEPT:40};vm.createContext(ctx);vm.runInContext(fn+';this.clean=clean',ctx);
 assert.deepEqual(JSON.parse(JSON.stringify(ctx.clean(stored).audits)),stored.audits,'audits kept by agents-page clean()');
 assert.match(src,/\n\s+data\.coordinato=fresh\.coordinato;[^\n]*data\.audits=fresh\.audits;/,'kept after a save conflict');
 assert.match(src,/if\(fresh&&data\)\{[^}]*data\.audits=fresh\.audits;/,'and when the tab comes back');
 assert.equal(require('../lib/report-studio.js').MATERIALS.audits,'Audit di comunicazione','counted in the monthly report');
 // reading the project: agents and editorial, each optional
 const docs={agents:F.agents(),editorial:F.editorial()};const pr=await A.readProject({bind:(pid,name)=>({load:async()=>{if(name==='editorial')throw Error('403');return docs[name]}})},'p');
 assert.equal(pr.editorial,null);assert.ok(pr.agents.siteAudit);
});

test('the card in «Cosa vuoi fare» › Strategia: inline studio, free with an optional confirmed call, icon, script, styles',()=>{
 const c=crea.card('auditcom');assert.equal(c.group,'Strategia');assert.equal(c.title,'Audit di comunicazione');assert.equal(c.inline,'auditcom');assert.equal(crea.linkFor(c,'forno'),null);
 assert.match(c.cost,/^Nessuna chiamata AI/);assert.match(c.cost,/con conferma/);assert.deepEqual(crea.costBadge(c),{tone:'free',label:'Gratis · AI facoltativa'});assert.match(c.hint,/non valutabile/);
 assert.equal(crea.best('audit di comunicazione'),'auditcom');assert.equal(crea.best('valutazione della comunicazione'),'auditcom');assert.equal(crea.best('audit del sito'),'analisi','the site audit keeps its words');
 assert.equal(look.CARDS.auditcom,'audit');assert.ok(look.has('audit'));
 const js=read('agency/crea.js');assert.match(js,/auditcom:\{global:'RadixAuditStudio'[^}]*agent:'strategist'\}/);
 assert.match(js,/S\.auditStudio\(\{project,profile:current\.profile,projectName:current\.name,projectId:current\.id,workspace:ws,rt,agentsUrl:'\/agents\.html\?agent=strategist&project='\+pid\}\)/);
 const html=read('agency/crea.html'),at=f=>html.indexOf(f);
 for(const f of ['/lib/print-studio.js','/lib/ped-results.js','/lib/seo-results-core.js','/lib/site-seo.js','/lib/seo-studio.js','/sales/crm-campaign-next-core.js','/lib/report-studio.js','/lib/radix-confirm.js'])assert.ok(at(f)>=0&&at(f)<at('/lib/audit-studio.js'),f+' before audit-studio');
 assert.ok(at('/lib/audit-studio.js')<at('/agency/crea.js'));
 const css=read('shell/crea.css'),sec=css.slice(css.indexOf('Studio Audit di comunicazione'));assert.match(css,/\.cr-panel \.audit-studio \.au-overall/);assert.doesNotMatch(sec.slice(0,sec.indexOf('Studio Campagne Google Ads')),/var\(--rx-(?!font)/,'light --ma-* tokens');
 const src=read('lib/audit-studio.js');assert.match(src,/'tool photo-studio ad-studio report-studio audit-studio'/,'reuses the report blocks');
 // the only AI path: aiRewrite → rt.reply after the confirmation; no request of its own
 assert.equal((src.match(/\.reply\(/g)||[]).length,1);assert.ok(/const ok=await \(confirm\|\|askConfirm\)[^]*if\(!ok\)return \{cancelled:true\};[^]*rt\.reply\(/.test(src),'confirmation before the call');
 assert.ok(!/\bfetch\(|new XMLHttpRequest|['"`]\/api\//.test(src),'no network request: it reads the project documents only');
});
