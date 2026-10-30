'use strict';
// Studio «Firma email» (lib/firma-studio.js, E3): company data never invented (missing fields left out, no name or no
// contact blocks the export), the three layouts, the refinement (colour, logo size, lines, social links), the email
// client rules, dark mode, AA contrast, palette colours, one signature per person, the files and the zip, the install
// steps for Gmail and Outlook, the saved key firme that agents-page.js keeps, and the card in «Cosa vuoi fare».
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const F=require('../lib/firma-studio.js'),C=require('../lib/coordinato-studio.js'),ZIP=require('../lib/zip-lite.js');
const crea=require('../agency/crea-core.js'),look=require('../agency/marketing-look.js');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');

const LOGO='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 96"><circle cx="48" cy="48" r="30" fill="#2F5D50"/><circle cx="60" cy="38" r="10" fill="#E3B448"/><text x="92" y="60" font-family="Fraunces, serif" font-size="34" font-weight="700" fill="#1C1C1E">Forno Aurora</text></svg>';
const KIT={brand:'Forno Aurora',direction:'Bottega di quartiere',palette:[{role:'primary',hex:'#2F5D50'},{role:'secondary',hex:'#A0522D'},{role:'accent',hex:'#E3B448'},{role:'dark',hex:'#1C1C1E'},{role:'light',hex:'#FAF6EE'}],fonts:[{heading:'Fraunces',body:'Inter'}],logo:LOGO};
const PROFILE={identityKit:KIT,contacts:{phone:'011 555 1234',email:'ciao@fornoaurora.it',website:'www.fornoaurora.it',address:'Via Nizza 12, 10125 Torino'}};
const COMPANY={ragione:'Forno Aurora S.r.l.',piva:'01234567897',indirizzo:'Via Nizza 12, 10125 Torino',telefono:'011 555 1234',email:'ciao@fornoaurora.it',sito:'www.fornoaurora.it',payoff:'Pane a lievito madre dal 1987',altri:''};
const PEOPLE=[{nome:'Giulia Rossi',ruolo:'Titolare',email:'giulia@fornoaurora.it',telefono:''},{nome:'Marco Bianchi',ruolo:'Laboratorio',email:'',telefono:'333 123 4567'}];
const model=(o={})=>F.modelOf({layout:'classico',company:COMPANY,people:PEOPLE,...o},PROFILE,{projectName:'Forno Aurora'});
const PNG=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]),png={data:PNG,w:480,h:176,dataUrl:'data:image/png;base64,iVBORw0KGgo='};
const LOGO_PREVIEW={src:'data:image/png;base64,iVBORw0KGgo=',w:480,h:144};

test('three layouts, deterministic and different; the first person shown; one signature per person or one for the company',()=>{
 assert.deepEqual(F.LAYOUTS.map(l=>l.id),['classico','moderno','audace']);
 const html=id=>F.signatures(model({layout:id}),{logo:LOGO_PREVIEW})[0].html;
 for(const id of ['classico','moderno','audace'])assert.equal(html(id),html(id),id+' is deterministic');
 assert.notEqual(html('classico'),html('moderno'));assert.notEqual(html('moderno'),html('audace'));
 assert.equal(model({layout:'boh'}).layout,'classico','unknown layout: the first one');
 const sigs=F.signatures(model());assert.deepEqual(sigs.map(s=>[s.label,s.base]),[['Giulia Rossi','firma-giulia-rossi'],['Marco Bianchi','firma-marco-bianchi']]);
 assert.ok(sigs[0].html.includes('giulia@fornoaurora.it')&&sigs[0].html.includes('011 555 1234'),'the direct email, the company phone');
 assert.ok(sigs[1].html.includes('333 123 4567')&&sigs[1].html.includes('ciao@fornoaurora.it'),'the direct phone, the company email');
 const one=F.signatures(model({people:[]}));assert.deepEqual(one.map(s=>[s.label,s.base]),[['Forno Aurora','firma']]);
});

test('company data never invented: missing fields are left out and listed; no name or no contact blocks the export',()=>{
 const m=model({company:{...COMPANY,piva:'',indirizzo:'',email:''},people:[{nome:'Giulia Rossi',ruolo:'Titolare'}]});
 assert.deepEqual(F.omitted(m),['Partita IVA','Indirizzo della sede','Email']);
 const html=F.signatures(m)[0].html;assert.ok(!/P\. IVA/.test(html));assert.ok(!/mailto:/.test(html),'no email invented');
 const dati=F.checksOf(m).find(c=>c.id==='dati');assert.equal(dati.state,'warn');assert.match(dati.detail,/non li inventa/);
 assert.deepEqual(F.blockers(m),[],'a phone and a site are enough');
 // no contact at all
 const none=model({company:{ragione:'Forno Aurora S.r.l.'},people:[{nome:'Giulia Rossi',ruolo:'Titolare'}]});
 assert.equal(F.blockers(none).length,1);assert.match(F.blockers(none)[0],/almeno un contatto/);
 assert.equal(F.checksOf(none).find(c=>c.id==='dati').state,'fail');assert.throws(()=>F.files(none),/almeno un contatto/);
 // a person's own email is a contact
 assert.deepEqual(F.blockers(model({company:{ragione:'Forno Aurora S.r.l.'},people:[{nome:'Giulia',email:'giulia@fornoaurora.it'}]})),[]);
 // no name: neither a kit name nor a company name
 const noName=F.modelOf({company:{telefono:'011 555 1234'}},{identityKit:{...KIT,brand:''}},{});
 assert.ok(F.blockers(noName).some(x=>/nome dell’azienda/.test(x)));
 // prefill from the project, as in the coordinato
 const pre=C.prefill(PROFILE,{projectName:'Forno Aurora',clientName:'Forno Aurora S.r.l.'});assert.equal(pre.values.piva,'','no P. IVA invented');assert.equal(pre.values.telefono,'011 555 1234');
});

test('every layout and refinement passes the mail rules, dark mode, AA contrast and the palette',()=>{
 const styles=[{},{accent:'primary'},{accent:'secondary',logo:'piccolo',payoff:true},{logo:'nessuno',legal:false},{social:{instagram:'https://www.instagram.com/fornoaurora',linkedin:'linkedin.com/company/forno-aurora'}}];
 for(const layout of ['classico','moderno','audace'])for(const style of styles){const m=model({layout,style}),tag=layout+' '+JSON.stringify(style);
  const cs=F.checksOf(m,{logo:LOGO_PREVIEW});
  for(const id of ['regole','scuro','contrasto','colori'])assert.equal(cs.find(c=>c.id===id).state,'ok',tag+' '+id+': '+JSON.stringify(cs.find(c=>c.id===id)));
  for(const s of F.signatures(m,{logo:LOGO_PREVIEW})){assert.deepEqual(C.signatureProblems(s.html,m),[],tag);assert.match(s.html,/^<!--[^>]*--><table role="presentation"[^>]*bgcolor="#FFFFFF"/);
   for(const w of [...s.html.matchAll(/width(?:="(\d+)|:(\d+)px)/g)].map(x=>+(x[1]||x[2])))assert.ok(w<=600,tag+' width '+w)}}
 assert.deepEqual(F.checksOf(model()).map(c=>c.id),['dati','regole','scuro','contrasto','colori','logo']);
 // the refinement shows: payoff, no legal line, smaller logo, the chosen colour on the line
 const base=F.signatures(model({layout:'classico'}),{logo:LOGO_PREVIEW})[0].html;
 const small=F.signatures(model({layout:'classico',style:{logo:'piccolo'}}),{logo:LOGO_PREVIEW})[0].html;
 assert.ok(+small.match(/<img [^>]*width="(\d+)"/)[1]<+base.match(/<img [^>]*width="(\d+)"/)[1]);
 assert.ok(!/<img/.test(F.signatures(model({style:{logo:'nessuno'}}),{logo:LOGO_PREVIEW})[0].html),'no logo');
 assert.match(F.signatures(model({style:{payoff:true}}))[0].html,/Pane a lievito madre dal 1987/);assert.ok(!/Pane a lievito/.test(base),'payoff off by default');
 assert.ok(!/P\. IVA/.test(F.signatures(model({style:{legal:false}}))[0].html));assert.match(base,/P\. IVA 01234567897/);
 assert.match(F.signatures(model({style:{accent:'secondary'}}))[0].html,/border-left:2px solid #A0522D/);assert.match(base,/border-left:2px solid #E3B448/);
 // social links: only https on the network's own domain, as text links
 const soc=F.signatures(model({style:{social:{instagram:'instagram.com/fornoaurora',facebook:'https://evil.example.com/fornoaurora',linkedin:'http://www.linkedin.com/company/forno'}}}))[0];
 assert.match(soc.html,/href="https:\/\/instagram\.com\/fornoaurora"/);assert.match(soc.html,/href="https:\/\/www\.linkedin\.com\/company\/forno"/);assert.ok(!/evil/.test(soc.html),'another domain is dropped');
 assert.match(soc.text,/Instagram: https:\/\/instagram\.com\/fornoaurora/);
 assert.ok(C.signatureProblems('<table><tr><td style="font-size:12px;overflow-wrap:anywhere">Forno Aurora <a href="https://tracker.example.com/x">x</a></td></tr></table>',model()).some(x=>/esterno/.test(x)),'other links still refused');
 // dark mode off: a warning, not a block
 const dark=F.checksOf(model({style:{darkSafe:false}})).find(c=>c.id==='scuro');assert.equal(dark.state,'warn');assert.match(dark.detail,/modalità scura/);
});

test('the logo: embedded PNG on white is a warning (Gmail drops it), the address on the client site is fine, no logo is fine',()=>{
 const emb=F.checksOf(model()).find(c=>c.id==='logo');assert.equal(emb.state,'warn');assert.match(emb.detail,/Gmail/);
 const hosted=F.checksOf(model({logoUrl:'https://www.fornoaurora.it/img/logo-firma.png'})).find(c=>c.id==='logo');assert.equal(hosted.state,'ok');
 const other=F.checksOf(model({logoUrl:'https://cdn.altro.it/logo.png'})).find(c=>c.id==='logo');assert.equal(other.state,'warn');assert.match(other.detail,/non è un https del tuo sito/);
 assert.equal(F.checksOf(model({style:{logo:'nessuno'}})).find(c=>c.id==='logo').state,'ok');
 const fh=F.files(model({logoUrl:'https://www.fornoaurora.it/img/logo-firma.png'}),{png});assert.match(fh[0].data,/src="https:\/\/www\.fornoaurora\.it\/img\/logo-firma\.png"/);
});

test('the files: HTML page and text per person, the logo on white, the instructions; the zip',()=>{
 const m=model({layout:'audace'}),list=F.files(m,{png});
 assert.deepEqual(list.map(f=>f.name),['firma-email/firma-giulia-rossi.html','firma-email/firma-giulia-rossi.txt','firma-email/firma-marco-bianchi.html','firma-email/firma-marco-bianchi.txt','firma-email/logo-firma.png','firma-email/ISTRUZIONI.txt']);
 const page=list[0].data;assert.match(page,/^<!doctype html>/);assert.match(page,/<meta name="color-scheme" content="light">/);assert.match(page,/src="data:image\/png;base64,/);assert.deepEqual(C.signatureProblems(page,m),[]);
 assert.match(list[1].data,/^-- \nGiulia Rossi\nTitolare · Forno Aurora\n/);
 const ist=list.at(-1).data;assert.match(ist,/^FIRMA EMAIL · Forno Aurora\nLayout: Audace/);
 for(const s of ['GMAIL','Impostazioni › Firme','File › Opzioni › Posta › Firme','APPLE MAIL','Gmail toglie le immagini incorporate','fondo bianco fisso'])assert.ok(ist.includes(s),s);
 assert.deepEqual(F.files(model({style:{logo:'nessuno'}}),{png}).map(f=>f.name).filter(n=>/png$/.test(n)),[],'no logo: no PNG');
 const zip=F.bundle(list,{date:new Date('2026-10-22T10:00:00Z')});assert.deepEqual(ZIP.unzip(zip).map(f=>f.name),list.map(f=>f.name));
 assert.equal(F.zipName(m),'firma-forno-aurora-audace.zip');
 // the steps: Gmail, Outlook web/new, classic Outlook, Apple Mail
 assert.deepEqual(F.CLIENTS.map(c=>c.id),['gmail','outlook','outlook-classico','apple']);for(const c of F.CLIENTS)assert.ok(c.steps.length>=4,c.id);
});

test('saved in the project: key firme in the agents document, other keys kept, retried on a conflict; agents-page keeps it',async()=>{
 const m=model({layout:'moderno',style:{accent:'primary',logo:'piccolo',social:{instagram:'https://www.instagram.com/fornoaurora'}}});
 let stored={schemaVersion:1,conversations:{'art-director':[{role:'user',content:'ciao'}]},prefs:{a:1},coordinato:{schemaVersion:1,items:[{id:'c'}]},firme:{schemaVersion:1,items:[{id:'old'}]}},conflicts=1;
 class ConflictError extends Error{}
 const ws={ConflictError,bind:(pid,name)=>{assert.equal(pid,'forno');assert.equal(name,'agents');return {load:async()=>JSON.parse(JSON.stringify(stored)),save:async d=>{if(conflicts-->0)throw new ConflictError('x');stored=d}}}};
 const rec=F.savedRecord(m,{by:'Ilaria',at:'2026-10-22T10:00:00.000Z'});
 assert.equal(rec.id,'firma-20261022100000');assert.equal(rec.layout,'moderno');assert.deepEqual(rec.style,{accent:'primary',logo:'piccolo',legal:true,payoff:false,darkSafe:true,social:{instagram:'https://www.instagram.com/fornoaurora'}});
 await F.saveToProject(ws,'forno',rec);
 assert.deepEqual(stored.firme.items.map(x=>x.id),['old',rec.id]);assert.deepEqual(stored.coordinato,{schemaVersion:1,items:[{id:'c'}]});assert.deepEqual(stored.prefs,{a:1});assert.equal(stored.conversations['art-director'].length,1);
 for(let i=0;i<12;i++)await F.saveToProject(ws,'forno',{...rec,id:'f'+i});assert.equal(stored.firme.items.length,10,'only the last 10');
 assert.deepEqual(F.readStore({firme:'boh'}),{schemaVersion:1,items:[]});
 const back=F.fromRecord(rec,PROFILE,{projectName:'Forno Aurora'});assert.equal(JSON.stringify(F.signatures(back)),JSON.stringify(F.signatures(m)),'reopened as it was');
 const src=read('agents-page.js'),fn=/function clean\(d\)\{[^\n]*\}/.exec(src)[0],ctx={MAX_KEPT:40};vm.createContext(ctx);vm.runInContext(fn+';this.clean=clean',ctx);
 assert.deepEqual(JSON.parse(JSON.stringify(ctx.clean(stored).firme)),stored.firme,'firme kept by agents-page clean()');
 assert.match(src,/data\.firme=fresh\.firme;[^\n]*\n/,'kept after a save conflict');assert.match(src,/if\(fresh&&data\)\{[^}]*data\.firme=fresh\.firme;/,'and when the tab comes back');
});

test('the card in «Cosa vuoi fare»: Email e SMS, inline studio, free, its icon, its script and its styles; no AI anywhere',()=>{
 const c=crea.card('firma');assert.equal(c.group,'Email e SMS');assert.equal(c.title,'Firma email');assert.equal(c.inline,'firma');assert.equal(crea.linkFor(c,'forno'),null);
 assert.deepEqual(crea.costBadge(c),{tone:'free',label:'Gratis, senza AI'});assert.match(c.hint,/non inventa/);
 assert.equal(crea.best('firma email'),'firma');assert.ok(look.has(look.CARDS.firma));
 const js=read('agency/crea.js');assert.match(js,/firma:\{global:'RadixFirmaStudio'[^}]*agent:'art-director'\}/);
 assert.match(js,/S\.firmaStudio\(\{project,profile:current\.profile,projectName:current\.name,clientName:current\.client_name\|\|''[^\n]*openIdentity:\(\)=>openInline\(core\.card\('identita'\)\)/);
 const html=read('agency/crea.html');assert.ok(html.indexOf('/lib/firma-studio.js')>html.indexOf('/lib/coordinato-studio.js')&&html.indexOf('/lib/firma-studio.js')<html.indexOf('/agency/crea.js'));
 const css=read('shell/crea.css');assert.match(css,/\.cr-panel \.firma-studio \.fs-views\{display:grid/);assert.match(css,/\.cr-panel \.coordinato-studio fieldset\.co-options/);
 const src=read('lib/firma-studio.js');assert.match(src,/coordinato-studio firma-studio/,'reuses the coordinato styles');assert.ok(!/RadixAgents|\/api\/chat|reply\(|fetch\(/.test(src),'no AI call, no network');
 assert.match(src,/sandbox','allow-same-origin'/,'the previews run no script');assert.match(read('lib/report-studio.js'),/firme:'Firme email'/);
});
