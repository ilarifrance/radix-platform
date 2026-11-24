'use strict';
// Studio «Report mensile al cliente» (lib/report-studio.js): gathering only the numbers RADIX has for the project and
// the month (PED, social numbers, Search Console, CRM leads and campaigns, work done), «non disponibile» instead of a
// missing number, the comparison with the month before, the three layouts, the grounding of the optional AI comment
// (one confirmation, one call, fake AI only), the PDF bytes, the shareable HTML, the checks, the saved key reports that
// agents-page.js keeps, the CRM reads and the card in «Cosa vuoi fare».
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const R=require('../lib/report-studio.js'),PS=require('../lib/print-studio.js'),F=require('./report-studio-fixtures.js');
const crea=require('../agency/crea-core.js'),look=require('../agency/marketing-look.js');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const K=(d,id,k)=>R.kpisOf(d,id).find(x=>x.id===k);
const data=(over)=>R.gather(F.input(over));
const BRAND=R.brandFor(F.PROFILE,'Forno Aurora');
const latin=b=>Buffer.from(b).toString('latin1');
// The text drawn in a «web» PDF of lib/print-studio.js: hex strings in WinAnsi.
const pdfText=bytes=>[...latin(bytes).matchAll(/<([0-9A-F]+)> Tj/g)].map(m=>Buffer.from(m[1],'hex').toString('latin1')).join('\n');

test('months: the one just closed by default, the one before, labels and days',()=>{
 assert.equal(R.defaultMonth(F.TODAY),'2026-09');assert.equal(R.prevMonth('2026-01'),'2025-12');assert.equal(R.shiftMonth('2026-11',2),'2027-01');
 assert.equal(R.daysIn('2026-02'),28);assert.equal(R.daysIn('2028-02'),29);assert.equal(R.monthLabel('2026-09'),'Settembre 2026');
 const ch=R.monthChoices(F.TODAY);assert.equal(ch.length,13);assert.deepEqual(ch[0],{id:'2026-10',label:'Ottobre 2026 (in corso)'});assert.equal(ch[1].id,'2026-09');
 assert.equal(R.validMonth('2026-13'),false);assert.equal(R.gather({month:'boh',today:F.TODAY}).month,'2026-09','an invalid month falls back to the one just closed');
 assert.equal(R.fmtNum(15000),'15.000');assert.equal(R.fmtNum(12.6,2),'12,6');assert.equal(R.fmtNum(1234567.5,1),'1.234.567,5');assert.equal(R.fmt(null),'non disponibile');assert.equal(R.fmt(2.77,'%',2),'2,77%');
});

test('gathering: every number comes from the project data of the month, compared with the month before',()=>{
 const d=data();assert.equal(d.month,'2026-09');assert.equal(d.prevMonth,'2026-08');assert.equal(d.running,false);
 // PED: 6 posts with numbers + 1 sent by Buffer (no numbers yet) = 7 published; s8 failed on Buffer → approved; review + draft = 2
 assert.deepEqual([d.contents.planned,d.contents.published,d.contents.approved,d.contents.inProgress],[10,7,1,2]);
 assert.deepEqual(d.contents.byChannel,[{channel:'Instagram',count:4},{channel:'Facebook',count:3}]);
 assert.equal(K(d,'contents','published').prev,4);assert.equal(d.contents.list.find(x=>x.title==='Promemoria ordini di ottobre').status,'published');
 // social: lib/ped-results.js on the September posts only
 assert.equal(d.social.available,true);assert.equal(K(d,'social','posts').value,6);assert.equal(K(d,'social','impressions').value,15000);assert.equal(K(d,'social','impressions').prev,6700);
 assert.equal(K(d,'social','interactions').value,1405);assert.equal(K(d,'social','reach').value,11150);assert.equal(K(d,'social','engagementRate').value,12.6);
 assert.equal(K(d,'social','clicks').value,null,'no network reported clicks: null, not 0');
 assert.deepEqual(d.social.sources.sort(),['Buffer','CSV importato nel piano editoriale']);assert.equal(d.social.best.title,'Carosello: 5 pani da provare');
 assert.deepEqual(K(d,'social','impressions').delta,{abs:8300,pct:123.9});
 // Search Console: the daily rows of the month
 assert.equal(d.seo.days,30);assert.equal(d.seo.note,'');assert.equal(K(d,'seo','clicks').value,390);assert.equal(K(d,'seo','clicks').prev,340);assert.equal(K(d,'seo','position').value,12.8);
 assert.equal(K(d,'seo','position').better,'down');assert.equal(R.deltaText(K(d,'seo','position'),'2026-08'),'-1,4 rispetto ad agosto','position: points, not percent');
 // CRM: the workspace's leads and the campaigns first sent in the month
 assert.equal(K(d,'leads','siteLeads').value,7);assert.equal(K(d,'leads','siteLeads').prev,3);assert.equal(K(d,'leads','newLeads').value,9);assert.match(d.leads.note,/tutti i lead del workspace/);
 assert.deepEqual(d.campaigns.list,[{name:'Torte della domenica',sent:40,clickers:9,clickRate:22.5,conversions:1}]);assert.equal(K(d,'campaigns','sent').prev,30);
 // work: PM tasks and production records done in the month, studio materials saved in the month
 assert.equal(d.work.doneCount,4);assert.equal(d.work.prevDone,1);assert.deepEqual(d.work.materials,[{label:'Menu e listini',count:1}]);
 assert.deepEqual(d.work.done.map(x=>x.where),['Attività di progetto','Attività di progetto','Produzione','Attività di progetto']);
 assert.deepEqual(R.missing(d),[]);
 assert.deepEqual(R.headline(d).map(k=>k.id),['published','impressions','interactions','engagementRate','clicks','siteLeads','sent','done']);
 // the running month says where its numbers stop
 const now=R.gather({...F.input(),month:'2026-10'});assert.equal(now.running,true);assert.equal(now.until,'2026-10-22');
});

test('«non disponibile»: a source RADIX does not have is never a 0 and never estimated',()=>{
 const d=R.gather({month:'2026-09',today:F.TODAY,projectName:'Forno Aurora'});
 for(const s of R.SECTIONS)if(s.id!=='work')assert.equal(R.available(d,s.id),false,s.id);
 for(const s of R.SECTIONS.filter(x=>x.id!=='work'))for(const k of R.kpisOf(d,s.id)){assert.equal(k.value,null,s.id+' '+k.id);assert.equal(R.fmt(k.value,k.unit,k.d),'non disponibile')}
 assert.equal(d.contents.published,null);assert.match(d.contents.note,/Nessun piano editoriale/);assert.match(d.seo.note,/Nessun export di Search Console/);assert.match(d.leads.note,/Nessun workspace CRM/);
 assert.ok(R.storyLines(d,'racconto').filter(l=>l.id!=='work').every(l=>/non disponibil/.test(l.text)),'the words say it too');
 // a plan with nothing in the month is a real zero, not «non disponibile»
 const z=R.gather({month:'2026-07',today:F.TODAY,editorial:F.editorial()});assert.equal(z.contents.available,true);assert.equal(z.contents.published,0);assert.equal(z.social.available,false);
 // a Search Console import that does not cover the month, and one that covers it only in part
 const ag=F.agents();ag.seoResults.imports=[ag.seoResults.imports[1]];ag.seoResults.imports[0].dates=ag.seoResults.imports[0].dates.slice(0,10);
 const p=data({agents:ag});assert.equal(p.seo.days,10);assert.equal(p.seo.note,'Search Console copre 10 giorni su 30.');assert.equal(K(p,'seo','clicks').prev,null,'August not imported');assert.equal(R.deltaText(K(p,'seo','clicks'),'2026-08'),'agosto: non disponibile');
 assert.match(R.storyLines(p,'sintesi').find(l=>l.id==='seo').text,/dati di 10 giorni su 30/);
 const out=data({agents:{}});assert.match(out.seo.note,/Nessun export/);
 // a CRM that cannot be read
 const e=data({crm:{workspace:F.WS,leads:null,report:null,error:'Membership esplicita richiesta'}});assert.equal(e.leads.available,false);assert.match(e.leads.note,/CRM non letto: Membership/);
 // in the PDF and the page
 const pdf=pdfText(R.reportPdf(d,{direction:'completo'},BRAND,{date:F.TODAY}));assert.match(pdf,/non disponibile/);assert.doesNotMatch(pdf,/Impression\n0\n/);
 const html=R.htmlReport(d,{direction:'sintesi'},BRAND);assert.match(html,/Dati non disponibili/);assert.match(html,/<b class="na">non disponibile<\/b>/);
 assert.equal(R.available(d,'work'),false,'no plan, no production board, no studio materials');assert.equal(d.work.doneCount,null);
 const none=R.gather({month:'2026-09',today:F.TODAY});assert.equal(R.checksOf(none,{}).find(c=>c.id==='dati').state,'fail','nothing at all: no report to send');
});

test('the three layouts: one A4 report each, the words follow the tone, nothing out of the page',()=>{
 const d=data(),acts=['Più caroselli su Instagram: engagement 15,9% sul carosello','Riscrivere il title della pagina con 14.100 impressioni','Richiamare i 9 che hanno cliccato'];
 const docs=Object.fromEntries(R.DIRECTIONS.map(x=>[x.id,R.layoutReport(d,{direction:x.id,actions:acts},BRAND)]));
 assert.deepEqual(R.DIRECTIONS.map(x=>x.tone),['Diretto','Tecnico','Discorsivo']);
 assert.equal(docs.sintesi.pages.length,1,'the summary fits one page');assert.ok(docs.completo.pages.length>docs.sintesi.pages.length);
 for(const [id,doc] of Object.entries(docs)){assert.deepEqual(R.fitProblems(doc),[],id);assert.ok(doc.pages.every(p=>p.w===210&&p.h===297));
  assert.ok(doc.pages[0].items.some(it=>it.t==='logo'),id+': the kit logo in the header');assert.ok(doc.pages[0].items.some(it=>it.t==='rect'&&it.fill==='#2F5D50'),id+': the kit primary colour')}
 const words=doc=>doc.pages.flatMap(p=>p.items.filter(i=>i.t==='text').map(i=>i.s)).join(' ');
 assert.match(words(docs.racconto),/A settembre sono usciti 7 contenuti/);assert.match(words(docs.sintesi),/Contenuti pubblicati: 7/);assert.match(words(docs.completo),/Torte della domenica/);
 assert.match(words(docs.completo),/Prossimi passi/);assert.match(words(docs.sintesi),/Pagina 1 di 1/);
 // sections can be left out; empty ones hidden on request
 const only=R.layoutReport(d,{direction:'completo',sections:['social']},BRAND);assert.doesNotMatch(words(only),/Campagne email/);
 const bare=R.gather({month:'2026-09',today:F.TODAY,editorial:F.editorial()});
 assert.doesNotMatch(words(R.layoutReport(bare,{direction:'completo',hideEmpty:true},BRAND)),/Google \(Search Console\)/);assert.match(words(R.layoutReport(bare,{direction:'completo'},BRAND)),/Google \(Search Console\)/);
 // a very long title is cut with an ellipsis, never out of the page
 const long=R.layoutReport(d,{title:'Report '+'molto '.repeat(30)},BRAND);assert.deepEqual(R.fitProblems(long),[]);
 // brand: the kit, else the colours written in profile.visual, else neutral
 assert.equal(BRAND.source,'kit');const v=R.brandFor({visual:'Blu notte #1E3A5F e sabbia #F4EBDD'},'Studio Rossi');assert.equal(v.source,'visual');assert.equal(v.palette.primary,'#1E3A5F');assert.equal(v.palette.light,'#F4EBDD');
 assert.equal(R.brandFor({},'Studio Rossi').source,'default');assert.deepEqual(R.fitProblems(R.layoutReport(d,{},R.brandFor({},'Studio Rossi'))),[]);
});

test('the PDF: valid bytes from the own writer of lib/print-studio.js (A4, xref, pages, text)',()=>{
 const d=data();
 for(const dir of ['sintesi','completo','racconto']){
  const doc=R.layoutReport(d,{direction:dir},BRAND),bytes=R.reportPdf(d,{direction:dir},BRAND,{date:F.TODAY,doc}),s=latin(bytes);
  assert.ok(bytes instanceof Uint8Array&&bytes.length>2000);assert.match(s,/^%PDF-1\.4\n/);assert.match(s,/%%EOF\n$/);
  const pages=s.match(/\/Type \/Page \/Parent/g)||[];assert.equal(pages.length,doc.pages.length,dir+' pages');assert.match(s,new RegExp('/Count '+doc.pages.length+' '));
  assert.match(s,/\/MediaBox \[0 0 595\.276 841\.89\]/,'A4 in points, no bleed');
  // the cross-reference table points at every object
  const start=+/startxref\n(\d+)\n%%EOF/.exec(s)[1];assert.equal(s.slice(start,start+4),'xref');
  const [,,count]=/xref\n(\d+) (\d+)\n/.exec(s.slice(start)).map(Number),offs=[...s.slice(start).matchAll(/(\d{10}) 00000 n /g)].map(m=>+m[1]);
  assert.equal(offs.length,count-1);offs.forEach((o,i)=>assert.equal(s.slice(o,o+String(i+1).length+6),(i+1)+' 0 obj',dir+' object '+(i+1)));
  assert.match(s,/\/Producer \(RADIX Report mensile\)/);assert.doesNotMatch(s,/\/JavaScript|\/Launch|\/URI/);
  const t=pdfText(bytes);assert.match(t,/Report di settembre 2026/);assert.match(t,/15\.000/);assert.match(t,/Pagina 1 di /);assert.doesNotMatch(t,/\?/,'every character printable')}
 const bytes=R.reportPdf(d,{direction:'completo'},BRAND,{date:F.TODAY});assert.deepEqual(bytes,R.reportPdf(d,{direction:'completo'},BRAND,{date:F.TODAY}),'same numbers, same bytes');
 assert.equal(R.fileBase(d,BRAND),'report-forno-aurora-2026-09');
 // characters the PDF font cannot draw are dropped, not turned into «?»
 const odd=R.gather({...F.input(),editorial:{contents:[{id:'x',title:'Pane 🍞 → buono',channel:'Instagram',date:'2026-09-03',status:'draft'}]}});
 assert.doesNotMatch(pdfText(R.reportPdf(odd,{direction:'completo'},BRAND,{date:F.TODAY})),/\?/);
});

test('the shareable HTML page: one file, no external request, light and dark, printable, escaped',()=>{
 const d=data({projectName:'Forno <Aurora>'}),html=R.htmlReport(d,{direction:'completo',note:'Nota <b>vera</b>',actions:['Azione 1 con 7 contatti']},BRAND);
 assert.deepEqual(R.externalRefs(html),[]);assert.match(html,/^<!doctype html>/);assert.match(html,/prefers-color-scheme:dark/);assert.match(html,/@media print/);
 assert.match(html,/Nota &lt;b&gt;vera&lt;\/b&gt;/);assert.doesNotMatch(html,/<b>vera<\/b>/);assert.match(html,/Forno &lt;Aurora&gt;/);
 assert.match(html,/<img class="logo" src="data:image\/svg\+xml/);assert.match(html,/Torte della domenica/);assert.match(html,/<ol class="steps"><li>Azione 1 con 7 contatti<\/li><\/ol>/);
 const bad=R.htmlReport(d,{},{...BRAND,logo:'<svg viewBox="0 0 10 10"><image href="https://evil.test/x.png"/></svg>'});assert.deepEqual(R.externalRefs(bad),[],'a logo with an external link is left out');
 for(const dir of ['sintesi','racconto'])assert.deepEqual(R.externalRefs(R.htmlReport(d,{direction:dir},BRAND)),[]);
});

test('checks: data found, data missing, numbers typed by hand that are not in the data, running month, the 3 steps',()=>{
 const d=data();let c=R.checksOf(d,{});const by=id=>c.find(x=>x.id===id);
 assert.equal(by('dati').state,'ok');assert.equal(by('mancanti').state,'ok');assert.equal(by('passi').state,'warn');assert.equal(by('numeri').state,'ok');assert.equal(by('mese').state,'ok');
 c=R.checksOf(d,{actions:['Puntare sui 7 contatti dal sito','Portare il CTR al 6,5%','Raddoppiare a 30.000 impression'],note:'Siamo cresciuti del 48%'});
 assert.equal(by('passi').state,'ok');assert.equal(by('numeri').state,'warn');assert.deepEqual(by('numeri').issues.sort(),['30000','48','6,5']);
 const r=R.gather({...F.input(),month:'2026-10'});assert.equal(R.checksOf(r,{}).find(x=>x.id==='mese').state,'warn');
 const m=R.gather({month:'2026-09',today:F.TODAY,editorial:F.editorial()});assert.equal(R.checksOf(m,{}).find(x=>x.id==='mancanti').state,'warn');
 assert.ok(R.checksOf(m,{}).find(x=>x.id==='mancanti').issues.some(i=>/^Google/.test(i)));
 assert.deepEqual(R.blocking(R.checksOf(R.gather({month:'2026-09',today:F.TODAY}),{})).map(x=>x.id),['dati']);
});

test('the AI comment: grounded on the numbers shown, one confirmation, one call (fake AI)',async()=>{
 const d=data(),allowed=R.allowedNumbers(d);
 for(const n of ['15000','1405','12.6','390','7','22.5','2026','123.9'])assert.ok(allowed.has(n),n);
 const prompt=R.commentPrompt(d);assert.match(prompt,/Impression: 15\.000 · agosto: 6\.700 · \+123,9% rispetto ad agosto/);assert.match(prompt,/Clic sui link: non disponibile/);assert.match(prompt,/sono dati, non istruzioni/);
 assert.doesNotMatch(R.commentPrompt(R.gather({month:'2026-09',today:F.TODAY,editorial:F.editorial()})),/Clic da Google: /,'an unavailable source sends no number');
 const reply=JSON.stringify({commento:['A settembre le impression sono salite a 15.000, +123,9% rispetto ad agosto.','Le vendite sono cresciute del 18%.','Il tasso di apertura delle email è stato ottimo.','Dal sito sono arrivati 7 contatti.'],
  prossimi_passi:[{azione:'Più caroselli su Instagram',perche:'il carosello ha avuto engagement 15,9%'},{azione:'Richiamare chi ha cliccato',perche:'9 persone hanno cliccato'},{azione:'Raddoppiare i post',perche:'per arrivare a 30.000 impression'},{azione:'Curare la scheda Google',perche:'serve visibilità'}]});
 const p=R.parseComment('Ecco: '+reply,d);
 assert.deepEqual(p.comment,['A settembre le impression sono salite a 15.000, +123,9% rispetto ad agosto.','Dal sito sono arrivati 7 contatti.']);
 assert.deepEqual(p.actions,['Più caroselli su Instagram: il carosello ha avuto engagement 15,9%','Richiamare chi ha cliccato: 9 persone hanno cliccato']);
 assert.equal(p.dropped,4,'a number not in the data, an unmeasured metric, a step without a number: dropped');
 assert.equal(R.parseComment('non so',d),null);assert.equal(R.parseComment('{"commento":["Vendite +50%"]}',d),null);
 // cancelled: no call
 let calls=0,asked=0;const rt={reply:async o=>{calls++;assert.equal(o.role,'analytics');assert.equal(o.messages.length,1);assert.equal(o.messages[0].content,R.commentPrompt(d));assert.deepEqual(o.project,{id:'forno-aurora',name:'Forno Aurora'});return {text:reply}}};
 assert.deepEqual(await R.writeComment({data:d,rt,confirm:async()=>{asked++;return false}}),{cancelled:true});assert.equal(calls,0);assert.equal(asked,1);
 let started=false;const r=await R.writeComment({data:d,rt,project:{id:'forno-aurora',name:'Forno Aurora'},onStart:()=>{started=true},confirm:async o=>{asked++;assert.match(o.title,/commento e prossimi passi/);assert.match(o.cost,/una sola chiamata AI/);assert.match(o.ok,/1 chiamata/);return true}});
 assert.equal(calls,1);assert.equal(asked,2);assert.ok(started);assert.deepEqual(r,p);
 await assert.rejects(R.writeComment({data:d,rt:{reply:async()=>({text:'boh'})},confirm:async()=>true}),/frasi con i numeri/);
 assert.deepEqual(await R.writeComment({data:R.gather({month:'2026-09',today:F.TODAY}),rt,confirm:async()=>{throw Error('not asked')}}),{nothing:true});
 await assert.rejects(R.writeComment({data:d,rt:null,confirm:async()=>true}),/Gli agenti/);
 // the comment goes in the report, with the note on how it was checked
 const html=R.htmlReport(d,{comment:p.comment,actions:p.actions,aiUsed:true},BRAND);assert.match(html,/<h2>Commento<\/h2>/);assert.match(html,/scritti con l’AI e controllati/);
 assert.equal(R.checksOf(d,{comment:p.comment,actions:p.actions}).find(c=>c.id==='numeri').state,'ok');
});

test('saved in the project: key reports in the agents document, other keys kept, retried on a conflict; agents-page keeps it',async()=>{
 const d=data(),o={direction:'racconto',note:'Mese buono',actions:['Richiamare i 9 che hanno cliccato']};
 let stored={schemaVersion:1,conversations:{analytics:[{role:'user',content:'ciao'}]},prefs:{a:1},menu:{schemaVersion:1,items:[{id:'m'}]},reports:{schemaVersion:1,items:[{id:'old',month:'2026-08',data:{v:1}}]}},conflicts=1;
 class ConflictError extends Error{}
 const ws={ConflictError,bind:(pid,name)=>{assert.equal(pid,'forno-aurora');assert.equal(name,'agents');return {load:async()=>JSON.parse(JSON.stringify(stored)),save:async x=>{if(conflicts-->0)throw new ConflictError('x');stored=x}}}};
 const rec=R.savedRecord(d,o,{by:'Ilaria',at:'2026-10-22T10:00:00.000Z'});assert.equal(rec.id,'report-2026-09-20261022100000');assert.equal(rec.month,'2026-09');assert.equal(rec.direction,'racconto');assert.equal(rec.data.social.kpis[1].value,15000);
 await R.saveToProject(ws,'forno-aurora',rec);
 assert.deepEqual(stored.reports.items.map(x=>x.id),['old',rec.id]);assert.deepEqual(stored.menu,{schemaVersion:1,items:[{id:'m'}]});assert.deepEqual(stored.prefs,{a:1});assert.equal(stored.conversations.analytics.length,1);
 for(let i=0;i<14;i++)await R.saveToProject(ws,'forno-aurora',{...rec,id:'r'+i});assert.equal(stored.reports.items.length,12,'only the last 12');
 assert.deepEqual(R.readStore({reports:'boh'}),{schemaVersion:1,items:[]});assert.deepEqual(R.readStore({reports:{items:[{id:'x'}]}}).items,[],'a record without its numbers is ignored');
 const back=R.fromRecord(rec);assert.equal(R.htmlReport(back.data,back.options,BRAND),R.htmlReport(d,o,BRAND),'reopened with the numbers as they were');
 const src=read('agents-page.js'),fn=/function clean\(d\)\{[^\n]*\}/.exec(src)[0],ctx={MAX_KEPT:40};vm.createContext(ctx);vm.runInContext(fn+';this.clean=clean',ctx);
 const kept=ctx.clean({...stored,conversations:{a:[{role:'user',content:'x'},{role:'assistant',content:'…',pending:true}]}});
 assert.deepEqual(JSON.parse(JSON.stringify(kept.reports)),stored.reports,'reports kept by agents-page clean()');
 assert.match(src,/\n\s+data\.coordinato=fresh\.coordinato;[^\n]*data\.reports=fresh\.reports;/,'kept after a save conflict');
 assert.match(src,/if\(fresh&&data\)\{[^}]*data\.reports=fresh\.reports;/,'and when the tab comes back');
});

test('reading the project and the CRM: every source optional, leads paged, errors said',async()=>{
 const docs={editorial:F.editorial(),agents:F.agents(),pm:F.PM};
 const ws={bind:(pid,name)=>({load:async()=>{if(name==='agency-operations')throw Error('403');return docs[name]||null}}),publications:{list:async()=>F.PUBLICATIONS}};
 const src=await R.readProject(ws,'forno-aurora');assert.equal(src.operations,null);assert.equal(src.pm,F.PM);assert.equal(src.publications.length,2);
 assert.deepEqual((await R.readProject({bind:()=>({load:async()=>{throw Error('x')}})},'p')).publications,[]);
 const many=Array.from({length:230},(_,i)=>({id:'l'+i,source:i%2?'sito':'manuale',created_at:'2026-09-0'+(1+i%9)+'T10:00:00Z'})),urls=[];
 const fetch=async(u,o)=>{urls.push(u);assert.equal(o.credentials,'same-origin');const q=new URL('http://x'+u).searchParams;
  if(q.get('entity')==='leads'){const off=+q.get('offset');return {ok:true,status:200,json:async()=>({rows:many.slice(off,off+100),limit:100,offset:off})}}
  if(q.get('entity')==='email_clicks'){assert.equal(q.get('report'),'campaigns');return {ok:true,status:200,json:async()=>({clicks:[],report:F.campaigns()})}}
  return {ok:false,status:400,json:async()=>({error:'no'})}};
 const crm=await R.readCrm(F.WS,fetch);assert.equal(crm.leads.length,230);assert.equal(crm.truncated,false);assert.equal(urls.filter(u=>/entity=leads/.test(u)).length,3);assert.ok(urls.every(u=>u.startsWith('/api/sales?')&&u.includes('workspace='+F.WS.id)));
 assert.equal(crm.report.sends.length,70);assert.equal(crm.error,'');
 const d=R.gather({...F.input(),crm});assert.equal(R.kpisOf(d,'leads').find(k=>k.id==='siteLeads').value,115);
 const denied=await R.readCrm(F.WS,async()=>({ok:false,status:403,json:async()=>({error:'Membership esplicita richiesta per questo workspace.'})}));
 assert.equal(denied.leads,null);assert.equal(denied.report,null);assert.match(denied.error,/Membership/);
});

test('the card in «Cosa vuoi fare»: Strategia, inline studio, free with an optional confirmed call, icon, scripts, styles',()=>{
 const c=crea.card('report');assert.equal(c.group,'Strategia');assert.equal(c.title,'Report mensile al cliente');assert.equal(c.inline,'report');assert.equal(crea.linkFor(c,'forno'),null);
 assert.match(c.cost,/^Nessuna chiamata AI/);assert.match(c.cost,/con conferma/);assert.deepEqual(crea.costBadge(c),{tone:'free',label:'Gratis · AI facoltativa'});assert.match(c.hint,/non disponibile/);
 assert.equal(crea.best('report mensile per il cliente'),'report');assert.equal(crea.best('i kpi del mese'),'report');assert.equal(look.CARDS.report,'chart');assert.ok(look.has('chart'));
 const js=read('agency/crea.js');assert.match(js,/report:\{global:'RadixReportStudio'[^}]*agent:'analytics'\}/);
 assert.match(js,/S\.reportStudio\(\{project,profile:current\.profile,projectName:current\.name,projectId:current\.id,workspace:ws,rt,agentsUrl:'\/agents\.html\?agent=analytics&project='\+pid\}\)/);
 const html=read('agency/crea.html'),at=f=>html.indexOf(f);
 for(const f of ['/lib/print-studio.js','/lib/ped-results.js','/lib/seo-results-core.js','/sales/crm-campaign-report-core.js','/sales/crm-campaign-next-core.js','/lib/radix-confirm.js'])assert.ok(at(f)>=0&&at(f)<at('/lib/report-studio.js'),f+' before report-studio');
 assert.ok(at('/lib/report-studio.js')<at('/agency/crea.js'));
 const css=read('shell/crea.css');assert.match(css,/\.cr-panel \.report-studio \.rp-tile\[data-na=true\]/);assert.doesNotMatch(css.slice(css.indexOf('Studio Report mensile')),/var\(--rx-(?!font)/,'light --ma-* tokens');
 const src=read('lib/report-studio.js');assert.match(src,/'ad-dir rp-dir'/,'the three layouts get the «Scelta» ring');
 // the only AI path: writeComment → rt.reply, after the confirmation; the only request: the CRM reads
 assert.equal((src.match(/\.reply\(/g)||[]).length,1);assert.ok(/const ok=await \(confirm\|\|askConfirm\)[^]*if\(!ok\)return \{cancelled:true\};[^]*rt\.reply\(/.test(src),'confirmation before the call');
 assert.ok(!/\bfetch\(\s*['"`]|new XMLHttpRequest|['"`]\/api\/chat/.test(src),'no direct request but the CRM reads');assert.equal((src.match(/'\/api\/sales\?'/g)||[]).length,1);
 assert.doesNotMatch(src,/method:\s*'(POST|PUT|PATCH|DELETE)'/,'reads only');
});

test('leads from a funnel landing (source «funnel: …», lib/funnel-studio.js) count as contacts from the site',()=>{
 const inp=F.input(),one=inp.crm.leads.find(l=>l.source==='sito'),base=R.kpisOf(R.gather(inp),'leads').find(k=>k.id==='siteLeads').value;
 const more={...inp,crm:{...inp.crm,leads:inp.crm.leads.concat([{...one,id:'funnel-lead-1',source:'funnel: Le 10 torte per le feste'},{...one,id:'other-1',source:'fiera'}])}};
 assert.equal(R.kpisOf(R.gather(more),'leads').find(k=>k.id==='siteLeads').value,base+1);
});
