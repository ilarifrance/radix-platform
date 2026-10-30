'use strict';
// Studio «Budget e KPI della strategia» (lib/strategy-budget.js): the approved brief, goal and channels read by fixed
// words, the three splits by fixed rules (whole euros, always equal to the budget typed by the person, minimums of paid
// channels), the refinement totals, the KPI whose current value comes only from the project data («da misurare»
// otherwise), targets typed or derived from that value, the checks, the PDF, the .pptx, the CSV, the saved key
// strategyBudget that agents-page.js keeps, the card in «Cosa vuoi fare» and the link from the brief. No AI.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const S=require('../lib/strategy-budget.js'),PX=require('../lib/pptx-lite.js'),F=require('./strategy-budget-fixtures.js');
const crea=require('../agency/crea-core.js'),look=require('../agency/marketing-look.js');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const latin=b=>Buffer.from(b).toString('latin1');
const win=s=>s.replace(/€/g,'\x80').replace(/’/g,'\x92').replace(/–/g,'\x96');
const pdfText=bytes=>[...latin(bytes).matchAll(/<([0-9A-F]+)> Tj/g)].map(m=>Buffer.from(m[1],'hex').toString('latin1')).join('\n');
const BRAND=S.brandFor(F.PROFILE,'Forno Aurora');
const base=(over)=>S.baselines(F.input(over));
// A ready plan: budget 1.200 € a month, «Bilanciata», targets +10% on the current value.
function plan({budget=1200,proposal='bilanciata',growth=10,over}={}){const src=F.input(over),st=S.strategyOf(src.editorial),b=S.baselines(src),p=S.newPlan({strategy:st,projectName:'Forno Aurora',today:F.TODAY,base:b});
 p.budget=budget;const a=S.allocate(budget,p.channels,p.goal,proposal,{b2b:p.b2b});p.proposal=proposal;p.lines=a.lines;p.excluded=a.excluded;p.kpis=S.kpisFor(p.lines,b);if(growth!=null)p.kpis=S.deriveTargets(p.kpis,growth);return p}

test('goal and channels are read from the brief by fixed words; the person can change both',()=>{
 assert.equal(S.detectGoal(F.BRIEF.goal),'contatti','contatti and ordini both named: the first written wins the tie');
 assert.equal(S.detectGoal('Vogliamo vendere di più online e far crescere gli ordini dell’e-commerce'),'vendite');
 assert.equal(S.detectGoal('Farci conoscere in città: più notorietà e visibilità'),'notorieta');
 assert.equal(S.detectGoal('Lancio della nuova linea di panettoni'),'lancio');
 assert.equal(S.detectGoal('Fidelizzare i clienti abituali'),'fidelizzare');
 assert.equal(S.detectGoal('Boh'),'','no word, no guess');
 assert.deepEqual(S.parseChannels(F.BRIEF.channels),['instagram','facebook','googleads','gbp','email']);
 assert.deepEqual(S.parseChannels('Meta Ads (Instagram e Facebook); sito e blog / SEO; volantini; WhatsApp; TikTok, LinkedIn, YouTube'),['instagram','facebook','seo','offline','whatsapp','tiktok','linkedin','youtube']);
 assert.equal(S.channelOf('Instagram'),'instagram');assert.equal(S.channelOf('Pagina Facebook'),'facebook');
 assert.equal(S.isB2b(F.BRIEF.audience),true);assert.equal(S.isB2b('Famiglie e ragazzi'),false);
 const p=S.newPlan({strategy:S.strategyOf(F.editorial()),projectName:'Forno Aurora',today:F.TODAY});
 assert.equal(p.budget,null,'no budget is ever proposed');assert.equal(p.goal,'contatti');assert.equal(p.start,'2026-11','the plan starts the month after today');assert.equal(p.months,6);
 assert.deepEqual(S.periodOf('2026-11',6),{start:'2026-11',months:6,end:'2027-04',until:'2027-04-30',label:'Novembre 2026 – Aprile 2027',untilLabel:'30/04/2027'});
});

test('only an approved strategy opens the studio, on the revision that was approved',()=>{
 assert.equal(S.strategyOf(null).ok,false);
 const ok=S.strategyOf(F.editorial());assert.equal(ok.ok,true);assert.equal(ok.revision,3);assert.equal(ok.approvedAt,'2026-10-20');assert.equal(ok.brief.channels,F.BRIEF.channels);
 const draft=S.strategyOf(F.editorial({briefApproved:false}));assert.equal(draft.ok,false);assert.match(draft.reason,/non è ancora approvata/);
 assert.equal(S.strategyOf(F.editorial({strategyRevision:4})).ok,false,'the approval of v3 does not cover v4');
});

test('split: whole euros in proportion, always adding up to the total',()=>{
 assert.deepEqual(S.split(100,{a:1,b:1,c:1}),{a:34,b:33,c:33});
 assert.deepEqual(S.split(1000,{a:5,b:3}),{a:625,b:375});
 for(const t of [1,7,99,101,1234,9999])for(const w of [{a:1},{a:2,b:3},{a:5,b:4,c:4,d:2,e:1}]){const s=S.split(t,w);assert.equal(Object.values(s).reduce((x,y)=>x+y,0),t,t+' '+JSON.stringify(w))}
 assert.deepEqual(S.split(0,{a:1}),{a:0});assert.deepEqual(S.split(100,{}),{});
});

test('three proposals by fixed rules: prudente, bilanciata, crescita, each equal to the budget',()=>{
 const ch=S.parseChannels(F.BRIEF.channels),all=S.proposals(1200,ch,'contatti',{b2b:false});
 assert.deepEqual(all.map(a=>a.id),['prudente','bilanciata','crescita']);
 for(const a of all){assert.equal(a.total,1200,a.id);assert.equal(S.totals(a.lines,1200).ok,true);for(const l of a.lines)assert.ok(Number.isInteger(l.amount))}
 const [pr,bi,cr]=all;
 assert.deepEqual(pr.lines.map(l=>l.id),['googleads','gbp','riserva'],'prudente: the 2 channels that serve «contatti» most (Google Ads 5, Scheda Google 4: tie with Instagram/Facebook broken by weight first) + reserve');
 assert.equal(pr.lines.find(l=>l.id==='riserva').amount,180,'15% kept for tests');
 assert.ok(pr.excluded.every(x=>/prudente/.test(x.reason)));
 assert.equal(bi.lines.find(l=>l.id==='riserva').amount,120,'10% kept for tests');
 assert.equal(cr.lines.some(l=>l.id==='riserva'),false,'no reserve in crescita');
 // crescita weighs paid channels more than bilanciata does
 const sh=(a,id)=>(a.lines.find(l=>l.id===id)||{amount:0}).amount/a.total;
 assert.ok(sh(cr,'googleads')>sh(bi,'googleads'));assert.ok(sh(cr,'gbp')<sh(bi,'gbp'));
 // same input, same output
 assert.deepEqual(S.proposals(1200,ch,'contatti'),S.proposals(1200,ch,'contatti'));
 // order: as in the brief, the reserve last
 assert.deepEqual(bi.lines.map(l=>l.id),['instagram','facebook','googleads','gbp','email','riserva']);
 // B2B: LinkedIn weighs more
 assert.ok(S.weightOf('notorieta','linkedin',true)>S.weightOf('notorieta','linkedin',false));
});

test('minimums: a paid channel never stays under its minimum when another channel can make room',()=>{
 const ch=S.parseChannels(F.BRIEF.channels);
 for(const budget of [300,450,600,800,1000,1500,2500,5000])for(const pid of ['prudente','bilanciata','crescita']){const a=S.allocate(budget,ch,'vendite',pid);
  assert.equal(a.total,budget,pid+' '+budget);const paid=a.lines.filter(l=>S.CHANNELS.find(c=>c.id===l.id&&c.paid));
  if(a.lines.filter(l=>l.id!=='riserva').length>1)for(const l of paid)assert.ok(l.amount>=l.min,pid+' '+budget+' '+l.id+' '+l.amount)}
 // 1.000 € on «vendite»: Google Ads (weight 5) would get 284 € < 300 → the channels that serve least go out instead, one at a time
 const b=S.allocate(1000,ch,'vendite','bilanciata');assert.deepEqual(b.excluded.map(x=>x.id),['gbp','email'],'Scheda Google (weight 2), then Newsletter (4, the last written among the 4s)');assert.match(b.excluded[0].reason,/Google Ads sopra la soglia di 300 €/);
 assert.ok(b.lines.find(l=>l.id==='googleads').amount>=300);
 // one channel only: kept even under its minimum, and the check says so
 const one=S.allocate(200,['googleads'],'contatti','crescita');assert.deepEqual(one.lines,[{id:'googleads',amount:200,weight:5*1.6,min:300}]);
 const p=plan();p.budget=200;p.lines=one.lines;const c=S.checksOf(p).find(x=>x.id==='minimi');assert.equal(c.state,'warn');assert.match(c.issues[0],/Google Ads: 200 € al mese, soglia 300 €/);
});

test('refinement: totals must match the budget; the difference can go to the reserve',()=>{
 const lines=[{id:'instagram',amount:400},{id:'googleads',amount:500},{id:'riserva',amount:100}];
 assert.deepEqual(S.totals(lines,1000),{sum:1000,budget:1000,diff:0,ok:true});
 const more=lines.map(l=>l.id==='instagram'?{...l,amount:350}:l);assert.deepEqual(S.totals(more,1000),{sum:950,budget:1000,diff:50,ok:false});
 assert.equal(S.fillReserve(more,1000).find(l=>l.id==='riserva').amount,150);assert.equal(S.totals(S.fillReserve(more,1000),1000).ok,true);
 const noRes=[{id:'instagram',amount:300}];assert.deepEqual(S.fillReserve(noRes,500).map(l=>[l.id,l.amount]),[['instagram',300],['riserva',200]]);
 assert.equal(S.below({id:'instagram',amount:100}),true);assert.equal(S.below({id:'instagram',amount:0}),false,'0 € is «no budget», not under the minimum');assert.equal(S.below({id:'gbp',amount:5}),false,'owned channels have no minimum');
 assert.equal(S.parseAmount('1.500'),1500);assert.equal(S.parseAmount('1500,50 €'),1500.5);assert.equal(S.parseAmount('12,5'),12.5);assert.equal(S.parseAmount('abc'),null);assert.equal(S.parseAmount('-3'),null);
 const p=plan();p.lines[0].amount+=37;const t=S.checksOf(p).find(x=>x.id==='totale');assert.equal(t.state,'fail');assert.match(t.detail,/avanzano 37 €/);assert.ok(S.blocking(S.checksOf(p)).length);
});

test('current values come only from the project data; what RADIX does not have is «da misurare»',()=>{
 const b=base();assert.equal(b.month,'2026-09');assert.equal(b.label,'Settembre 2026');
 assert.deepEqual(b.social.instagram,{impressions:12300,interactions:1240,engagementRate:13.63},'September posts of the PED, Instagram only');
 assert.equal(b.social.facebook.impressions,2700);assert.equal(b.social.linkedin,undefined,'no LinkedIn numbers: none invented');
 assert.deepEqual(b.seo,{clicks:390,position:12.8});
 assert.deepEqual(b.crm,{newLeads:9,siteLeads:7,clickRate:22.5,clickers:9});
 assert.deepEqual(b.audit,{at:'2026-10-15',overall:58,areas:{sito:46,google:71,recensioni:84,social:63}},'an area without data has no score');
 const p=plan(),K=k=>p.kpis.find(x=>x.key===k);
 assert.deepEqual(K('instagram:impressions').baseline,{value:12300,from:'Settembre 2026'});
 assert.deepEqual(K('gbp:gbpScore').baseline,{value:71,from:'audit del 15/10/2026'});
 for(const k of ['instagram:cpr','googleads:adsClicks','googleads:cpl','gbp:gbpActions']){assert.equal(K(k).baseline,null,k);assert.equal(K(k).target,null,k+': no target without a current value');assert.equal(S.status(K(k)),'da-misurare')}
 assert.ok(p.kpis.every(k=>k.source),'every KPI says where it is measured');
 assert.deepEqual([...new Set(p.kpis.map(k=>k.channel))],['generale','instagram','facebook','googleads','gbp','email']);
 // without CRM, Search Console and audit: those KPI are «da misurare», never 0
 const bare=S.baselines(F.input({crm:null,agents:{}}));assert.equal(bare.crm,null);assert.equal(bare.audit,null);assert.deepEqual(bare.seo,{clicks:null,position:null});
 assert.ok(bare.notes.some(n=>/^CRM/.test(n))&&bare.notes.some(n=>/^Audit/.test(n)));
 const ks=S.kpisFor(p.lines,bare);for(const k of ks.filter(x=>x.channel==='generale'||x.channel==='email'||x.channel==='gbp'))assert.equal(k.baseline,null,k.key);
 // a channel without budget has no KPI; the general ones are always there
 assert.deepEqual([...new Set(S.kpisFor([{id:'seo',amount:0},{id:'riserva',amount:50}],b).map(k=>k.channel))],['generale']);
 assert.deepEqual(S.kpisFor([{id:'seo',amount:100}],b).filter(k=>k.channel==='seo').map(k=>[k.id,k.baseline&&k.baseline.value]),[['seoClicks',390],['position',12.8],['siteScore',46]]);
});

test('targets: typed by the person, or the current value plus the growth the person typed',()=>{
 const p=plan({growth:null}),K=k=>p.kpis.find(x=>x.key===k);
 assert.ok(p.kpis.every(k=>k.target==null),'no target before the person asks');
 const t=S.deriveTargets(p.kpis,10),T=k=>t.find(x=>x.key===k);
 assert.equal(T('instagram:impressions').target,13530);assert.equal(T('instagram:engagementRate').target,14.99);assert.equal(T('generale:siteLeads').target,8);
 assert.equal(T('instagram:impressions').targetBy,'+10% sul dato attuale');assert.equal(T('googleads:cpl').target,null,'«da misurare» stays without target');
 assert.equal(S.deriveTarget({baseline:{value:12.8},better:'down',unit:'',d:1},10),11.5,'position: lower is better');
 assert.equal(S.deriveTarget({baseline:{value:95},better:'up',unit:'/100',d:0},10),100,'a score stops at 100');
 // a target typed by the person is kept, unless the person recomputes them all
 const mine=p.kpis.map(k=>k.key==='instagram:impressions'?{...k,target:20000,targetBy:'persona'}:k);
 assert.equal(S.deriveTargets(mine,10).find(x=>x.key==='instagram:impressions').target,20000);
 assert.equal(S.deriveTargets(mine,10,{overwrite:true}).find(x=>x.key==='instagram:impressions').target,13530);
 // a target the person types on a KPI without a current value stays «da misurare» (it has no base)
 assert.equal(S.status({baseline:null,target:5}),'senza-base');assert.equal(S.status(K('instagram:impressions')),'da-fissare');
 // kpisFor keeps the targets already there when the lines change
 const again=S.kpisFor(p.lines,p.base,mine);assert.equal(again.find(x=>x.key==='instagram:impressions').target,20000);
});

test('priorities from the audit: weak areas first, with the channels they hold back',()=>{
 const p=plan(),pr=S.priorities(p.base,p.lines);
 assert.deepEqual(pr.map(x=>[x.area,x.score]),[['sito',46]],'only areas under 60');
 assert.deepEqual(pr[0].channels,['instagram','facebook','googleads']);assert.match(pr[0].text,/Prima di spendere su Instagram, Facebook, Google Ads, sistema quest’area/);
 assert.deepEqual(S.priorities(null,p.lines),[]);
});

test('checks: strategy, budget, totals, KPI sources, «da misurare», targets with a date, market figures without source',()=>{
 const p=plan(),c=Object.fromEntries(S.checksOf(p).map(x=>[x.id,x]));
 assert.deepEqual(Object.keys(c),['strategia','budget','totale','minimi','fonti','base','obiettivi','cifre']);
 assert.equal(c.strategia.state,'ok');assert.equal(c.budget.state,'ok');assert.match(c.budget.detail,/1\.200 € al mese per 6 mesi: 7\.200 € in tutto/);
 assert.equal(c.totale.state,'ok');assert.equal(c.fonti.state,'ok');assert.equal(c.base.state,'warn');assert.match(c.base.detail,/da misurare/);
 assert.equal(c.obiettivi.state,'ok');assert.match(c.obiettivi.detail,/30\/04\/2027/);assert.equal(c.cifre.state,'ok');
 const nob=plan();nob.budget=null;assert.equal(S.checksOf(nob).find(x=>x.id==='budget').state,'fail');
 const mkt=plan({over:{editorial:F.editorial({brief:{...F.BRIEF,gaps:'Il mercato dei dolci cresce del 12% ogni anno.',offer:'Torte in 48 ore, fonte: listino 2026, 15% di sconto (fonte: listino).'}})}});
 const cf=S.checksOf(mkt).find(x=>x.id==='cifre');assert.equal(cf.state,'warn');assert.equal(cf.issues.length,1);assert.match(cf.issues[0],/12%/);
 const notOk=plan();notOk.strategy.approvedAt='';assert.equal(S.checksOf(notOk).find(x=>x.id==='strategia').state,'fail');
});

test('PDF: the full brief with budget, KPI and «da misurare», branded, nothing out of the page',()=>{
 const p=plan(),doc=S.layoutBrief(p,BRAND,{date:F.TODAY});assert.ok(doc.pages.length>=2&&doc.pages.length<=4,doc.pages.length+' pages');assert.deepEqual(S.fitProblems(doc),[]);
 assert.ok(doc.pages[0].items.some(i=>i.t==='logo'),'the kit logo');assert.ok(doc.pages[0].items.some(i=>i.t==='rect'&&i.fill==='#2F5D50'),'the kit colour');
 const bytes=S.briefPdf(p,BRAND,{date:F.TODAY});assert.equal(latin(bytes).slice(0,5),'%PDF-');
 const t=pdfText(bytes);
 for(const s of ['Strategia di marketing','Situazione','Budget per canale','KPI e modalità di misura','Priorità dall’audit','Instagram','1.200 €','7.200 €','da misurare','12.300','13.530','30/04/2027','Pagina 1 di '])assert.ok(t.includes(win(s)),s);
 assert.doesNotMatch(t,/\?/,'every character printable');
 for(const [k] of S.FIELDS)assert.ok(t.includes(win(F.BRIEF[k].slice(0,18))),'field '+k+' in the PDF');
});

test('PowerPoint: a real 16:9 deck with editable text, budget, KPI and notes',()=>{
 const p=plan(),bytes=S.pptxBytes(p,BRAND,{},{date:F.TODAY}),i=PX.inspect(bytes);
 assert.deepEqual(i.problems,[]);assert.equal(i.slides,9);
 const all=i.texts.flat().join('\n');
 for(const s of ['Strategia di marketing','Obiettivo e pubblico','Budget per canale','1.200 € al mese per 6 mesi: 7.200 € in tutto','Google Ads · ','KPI e obiettivi al 30/04/2027','Da misurare il primo mese','Priorità dall’audit','Prossimi passi'])assert.ok(all.includes(s),s);
 assert.match(all,/Instagram · Impression: 12\.300 → 13\.530/);
 assert.ok(i.notes.some(n=>/fonte: Search Console|fonte: Google Ads/.test(n)||/Google Ads e CRM RADIX/.test(n)),'sources in the speaker notes');
 assert.deepEqual(S.deckOf(p,BRAND).warnings.filter(w=>w.kind==='overflow'),[],'every text fits its box');
 const m=S.deckModel(p);assert.deepEqual(m.slides.map(s=>s.layout),['title','content','content','section','two','content','content','content','closing']);
});

test('CSV of the budget: Excel in Italian, one row per line and the total',()=>{
 const p=plan(),csv=S.budgetCsv(p),rows=csv.replace(/^﻿/,'').split('\r\n');
 assert.ok(csv.startsWith('﻿'));assert.equal(rows[0],'Canale;Tipo;Euro al mese;Quota %;Mesi;Totale periodo (euro);Soglia minima RADIX (euro al mese);Note');
 const lines=rows.slice(1,1+p.lines.length).map(r=>r.split(';'));assert.deepEqual(lines.map(r=>r[0]),p.lines.map(l=>S.CHANNELS.concat([S.RESERVE]).find(c=>c.id===l.id).label));
 assert.equal(lines.reduce((a,r)=>a+Number(r[2].replace(',','.')),0),1200);
 const tot=rows[1+p.lines.length].split(';');assert.deepEqual(tot.slice(0,6),['Totale','','1200','100','6','7200']);
 assert.ok(rows.some(r=>r==='Proposta;Bilanciata'));assert.match(S.fileBase(p,BRAND),/^strategia-forno-aurora-2026-11$/);
 const odd=plan();odd.project='Forno; "Aurora"';assert.match(S.budgetCsv(odd),/Progetto;"Forno; ""Aurora"""/);
});

test('saved in the project under strategyBudget, the rest of the agents document kept; agents-page.js keeps it',async()=>{
 let doc={schemaVersion:1,conversations:{strategist:[{role:'user',content:'x'}]},audits:F.audit(),reports:{schemaVersion:1,items:[]}};
 const ws={bind:()=>({load:async()=>JSON.parse(JSON.stringify(doc)),save:async d=>{doc=d}})};
 const p=plan(),rec=S.savedRecord(p,{by:'Francesco',at:'2026-10-22T10:00:00.000Z'});
 assert.equal(rec.revision,3);assert.equal(rec.budget,1200);assert.deepEqual(rec.checks.map(c=>c.id),['strategia','budget','totale','minimi','fonti','base','obiettivi','cifre']);
 await S.saveToProject(ws,'forno-aurora',rec);assert.equal(doc.strategyBudget.items.length,1);assert.deepEqual(doc.audits,F.audit());assert.equal(doc.conversations.strategist.length,1);
 assert.deepEqual(S.readStore(doc).items[0].plan.lines,p.lines);
 assert.equal(S.outdated(rec,{revision:3}),false);assert.equal(S.outdated(rec,{revision:4}),true,'the strategy changed after the save');
 for(let i=0;i<14;i++)await S.saveToProject(ws,'x',S.savedRecord(p,{at:'2026-10-22T10:00:'+String(10+i)+'.000Z'}));assert.equal(doc.strategyBudget.items.length,12);
 const ap=read('agents-page.js');assert.match(ap,/if\(d\.strategyBudget\)out\.strategyBudget=d\.strategyBudget/);assert.equal((ap.match(/data\.strategyBudget=fresh\.strategyBudget/g)||[]).length,2);
});

test('no AI: the studio makes no call to the agents or to /api/chat',()=>{
 const src=read('lib/strategy-budget.js');assert.doesNotMatch(src,/\.reply\(|\/api\/chat|rt\.reply/);
});

test('the card in «Cosa vuoi fare», the studio in crea.js and crea.html, the link from the approved brief',()=>{
 const c=crea.card('budget');assert.equal(c.group,'Strategia');assert.equal(c.inline,'budget');assert.deepEqual(crea.costBadge(c),{tone:'free',label:'Gratis, senza AI'});
 assert.equal(crea.best('budget per canale'),'budget');assert.equal(look.CARDS.budget,'coin');
 assert.match(read('agency/crea.html'),/<script src="\/lib\/strategy-budget\.js"><\/script>/);
 const js=read('agency/crea.js');assert.match(js,/c\.inline==='budget'/);assert.match(js,/RadixStrategyBudget/);assert.match(js,/briefUrl:'\/project-editorial\.html\?project='\+pid\+'#brief'/);
 assert.match(read('project-editorial.html'),/id="budgetNext"[^>]*hidden/);assert.match(read('editorial-workspace.js'),/\$\('budgetNext'\)\.hidden=!state\.briefApproved/);
 assert.match(read('shell/crea.css'),/\.strategy-budget/);
});
