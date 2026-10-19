'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const DIR=path.join(__dirname,'..','tools','radix-chrome-extension');
const Core=require('../tools/radix-chrome-extension/src/core');
const X=require('../tools/radix-chrome-extension/src/extract');
const Lib=require('../lib/linkedin-browser-extract');
const V=require('../api/_lead_contact_jobs');
const B=require('../lib/lead-contact-batches');
const SOURCE='https://www.linkedin.com/sales/search/people?query=test';
const read=f=>fs.readFileSync(path.join(DIR,f),'utf8');

test('manifest: MV3, minimal permissions, no cookies, no webRequest, LinkedIn only for Sales Navigator',()=>{
 const m=JSON.parse(read('manifest.json'));
 assert.equal(m.manifest_version,3);assert.equal(m.name,'RADIX — Importa in RADIX');
 assert.deepEqual(m.permissions,['storage']);
 assert.deepEqual(m.host_permissions,['https://radix-platform.vercel.app/*']);
 assert.ok(!JSON.stringify(m).match(/cookies|webRequest|debugger|<all_urls>|scripting|tabs"/));
 assert.deepEqual(m.content_scripts[0].matches,['https://www.linkedin.com/sales/*']);
 for(const f of [...m.content_scripts[0].js,m.background.service_worker,m.action.default_popup,m.options_page,...Object.values(m.icons)])assert.ok(fs.existsSync(path.join(DIR,f)),f);
 for(const s of [16,32,48,128])assert.equal(fs.readFileSync(path.join(DIR,'icons','icon'+s+'.png')).readUInt32BE(16),s);
});

test('extension code never reads cookies, calls LinkedIn APIs or loads remote code',()=>{
 const files=['src/content.js','src/extract.js','src/core.js','src/background.js','src/settings.js','popup.js','options.js'];
 for(const f of files){
  const s=read(f);
  assert.ok(!/document\.cookie|chrome\.cookies|voyager|\/sales-api\/|navigator\.webdriver|eval\(|new Function/.test(s),f);
 }
 assert.ok(!/<script>[^<]/.test(read('popup.html')+read('options.html')),'no inline scripts (MV3 CSP)');
 assert.ok(!/https?:\/\/(?!www\.linkedin\.com|radix-platform\.vercel\.app)/.test(read('popup.html').replace(/http:\/\/www\.w3\.org[^"]*/g,'')));
});

test('vendored RADIX batch module is identical to lib/lead-contact-batches.js',()=>{
 assert.equal(read('src/lead-contact-batches.js'),fs.readFileSync(path.join(__dirname,'..','lib','lead-contact-batches.js'),'utf8'));
});

test('card normalisation matches the local agent and adds first/last name and location',()=>{
 const cards=[
  {fullName:'Jane Smith',profileUrl:'https://www.linkedin.com/sales/lead/abc,123?trk=xyz',lines:['Jane Smith','Managing Director at Company SRL','Milano'],locationText:'Milano, Lombardia, Italia'},
  {fullName:'Mario De Luca',profileUrl:'https://www.linkedin.com/sales/lead/def,1',lines:['Mario De Luca','2°'],roleText:'Responsabile acquisti',companyText:'Acme SpA'},
  {fullName:'Luca Bianchi',profileUrl:'https://www.linkedin.com/sales/lead/ghi,1',lines:['Luca Bianchi'],positionText:'Direttore commerciale · Beta Srl'},
  {fullName:'Jane Smith',profileUrl:'https://www.linkedin.com/sales/lead/abc,123',lines:['Jane Smith']},
  {fullName:'Bad',profileUrl:'https://evil.example/profile',lines:['Bad']},
  {fullName:'Anna',profileUrl:'http://www.linkedin.com/in/anna',lines:[]},
 ];
 const ours=X.normalizeVisibleCards(cards,SOURCE),theirs=Lib.normalizeVisibleCards(cards,SOURCE);
 assert.deepEqual(ours.map(({firstName,lastName,location,...r})=>r),theirs);
 assert.equal(ours.length,3);
 assert.deepEqual([ours[0].firstName,ours[0].lastName,ours[0].location],['Jane','Smith','Milano, Lombardia, Italia']);
 assert.deepEqual([ours[1].jobTitle,ours[1].companyName,ours[1].lastName],['Responsabile acquisti','Acme SpA','De Luca']);
 assert.deepEqual([ours[2].jobTitle,ours[2].companyName,ours[2].location],['Direttore commerciale','Beta Srl','']);
 assert.equal(ours[0].email,undefined);
});

test('splitName keeps missing parts empty and handles particles and credentials',()=>{
 assert.deepEqual(X.splitName('Mario Rossi'),{firstName:'Mario',lastName:'Rossi'});
 assert.deepEqual(X.splitName('Gian Luca Bianchi'),{firstName:'Gian Luca',lastName:'Bianchi'});
 assert.deepEqual(X.splitName('Anna Maria della Valle, MBA'),{firstName:'Anna Maria',lastName:'della Valle'});
 assert.deepEqual(X.splitName('Ludwig van Beethoven 🎹'),{firstName:'Ludwig',lastName:'van Beethoven'});
 assert.deepEqual(X.splitName("Giovanni D'Amico"),{firstName:'Giovanni',lastName:"D'Amico"});
 assert.deepEqual(X.splitName('Cher'),{firstName:'Cher',lastName:''});
 assert.deepEqual(X.splitName(''),{firstName:'',lastName:''});
});

test('URLs: supported pages, blocked pages, RADIX address and long source URLs',()=>{
 assert.equal(Core.isSupportedUrl(SOURCE),true);
 assert.equal(Core.isSupportedUrl('https://www.linkedin.com/sales/lists/people/123?sortCriteria=x'),true);
 assert.equal(Core.isSupportedUrl('https://www.linkedin.com/sales/lead/abc'),false);
 assert.equal(Core.isSupportedUrl('https://evil.example/sales/search/people'),false);
 assert.equal(Core.isBlockedUrl('https://www.linkedin.com/checkpoint/challenge/x'),true);
 assert.equal(Core.isBlockedUrl('https://www.linkedin.com/sales/login'),true);
 assert.equal(Core.isBlockedUrl(SOURCE),false);
 assert.equal(Core.normalizeBaseUrl('https://radix-platform-git-x.vercel.app/lead-intelligence.html'),'https://radix-platform-git-x.vercel.app');
 assert.equal(Core.normalizeBaseUrl('http://localhost:3000/'),'http://localhost:3000');
 assert.throws(()=>Core.normalizeBaseUrl('http://radix.example'),/https/);
 assert.throws(()=>Core.normalizeBaseUrl('https://u:p@radix.example'),/credenziali/);
 assert.throws(()=>Core.normalizeBaseUrl('nonsense'),/non valido/);
 const long='https://www.linkedin.com/sales/search/people?query='+'x'.repeat(2000)+'#frag';
 assert.equal(Core.sourceUrlFor(long),'https://www.linkedin.com/sales/search/people');
 assert.equal(Core.sourceUrlFor(SOURCE+'#a'),SOURCE);
});

test('link code round trip, bare token, expiry display and bad codes',()=>{
 const body=Buffer.from(JSON.stringify({v:1,scope:'lead-import',uid:3,ws:'11111111-1111-4111-8111-111111111111',iat:1,exp:2000000000})).toString('base64url');
 const token='rli1.'+body+'.sig_-';
 const code=Core.makeLinkCode('https://radix-platform.vercel.app/',token);
 assert.deepEqual(Core.parseLinkCode(code),{baseUrl:'https://radix-platform.vercel.app',token});
 assert.deepEqual(Core.parseLinkCode('  '+code.slice(0,20)+'\n'+code.slice(20)+' '),{baseUrl:'https://radix-platform.vercel.app',token});
 assert.deepEqual(Core.parseLinkCode(token),{baseUrl:null,token});
 assert.throws(()=>Core.parseLinkCode('hello'),/non riconosciuto/);
 assert.throws(()=>Core.parseLinkCode(code.slice(0,30)),/incompleto/);
 assert.throws(()=>Core.parseLinkCode(Core.LINK_PREFIX+Buffer.from(JSON.stringify({u:'http://evil.example',t:token})).toString('base64url')),/https/);
 const info=Core.tokenInfo(token,0);
 assert.equal(info.workspace,'11111111-1111-4111-8111-111111111111');assert.equal(info.expired,false);
 assert.equal(Core.tokenInfo(token,2000000000*1000).expired,true);
 assert.equal(Core.tokenInfo('garbage'),null);
 // The page script builds the code the same way.
 const page=fs.readFileSync(path.join(__dirname,'..','sales','lead-extension-link.js'),'utf8');
 assert.ok(page.includes("'radix-link:'+b64url(JSON.stringify({u:location.origin,t:token}))"));
});

test('dedupe, max and payload accepted by the RADIX contact-job validator',()=>{
 const rows=n=>Array.from({length:n},(_,i)=>({fullName:'P '+i,firstName:'P',lastName:String(i),jobTitle:'',companyName:'',location:'',profileUrl:'https://www.linkedin.com/sales/lead/'+i,sourceUrl:SOURCE}));
 let m=Core.mergeRows([],rows(30),25);assert.equal(m.rows.length,25);assert.equal(m.added.length,25);
 m=Core.mergeRows(m.rows,[...rows(30),{...rows(1)[0],profileUrl:'https://www.linkedin.com/sales/lead/0/'}],100);
 assert.equal(m.rows.length,30);assert.equal(m.added.length,5);
 assert.equal(Core.clampMax(5000),1000);assert.equal(Core.clampMax('x'),100);assert.equal(Core.clampMax(25),25);
 const payload=Core.buildJob(rows(1000),SOURCE,'run 1!');
 assert.equal(payload.last,undefined);assert.equal(payload.batches.length,5);assert.equal(payload.batches[0].id,'ext-run1-0');
 const ok=V.payload(payload);assert.equal(ok.records.length,1000);
 assert.equal(V.command(Core.importBody('11111111-1111-4111-8111-111111111111',Core.jobTitle(1000,new Date(2026,9,19,9,5)),payload)).data.title,'LinkedIn Sales Navigator · 19/10/2026 09:05 · 1000 contatti');
 assert.throws(()=>Core.buildJob(rows(1001),SOURCE),/Massimo/);
 assert.throws(()=>Core.buildJob([],SOURCE),/Nessun/);
 // Backup JSON restores in Lead Intelligence the same way as the local agent backup.
 const restored=JSON.parse(JSON.stringify(payload));
 assert.equal(restored.version,1);assert.ok(restored.records.every(r=>B.person(r,restored.sourceUrl)));
});

test('random waits stay within the requested range',()=>{
 assert.equal(Core.randomDelay(4000,9000,()=>0),4000);assert.equal(Core.randomDelay(4000,9000,()=>1),9000);
 for(let i=0;i<50;i++){const d=Core.randomDelay(4000,9000);assert.ok(d>=4000&&d<=9000)}
});

test('upload refuses missing or expired link before contacting RADIX',async()=>{
 let called=false;const fetchImpl=async()=>{called=true};
 await assert.rejects(Core.uploadContacts({baseUrl:Core.DEFAULT_BASE,token:'',rows:[],sourceUrl:SOURCE,fetchImpl}),/non collegata/);
 const expired='rli1.'+Buffer.from(JSON.stringify({ws:'11111111-1111-4111-8111-111111111111',exp:1})).toString('base64url')+'.x';
 await assert.rejects(Core.uploadContacts({baseUrl:Core.DEFAULT_BASE,token:expired,rows:[],sourceUrl:SOURCE,fetchImpl}),/scaduto/);
 assert.equal(called,false);
});

test('Lead Intelligence gets one isolated «Collega estensione» button and script',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','lead-intelligence.html'),'utf8');
 assert.equal((html.match(/radix-extension-link/g)||[]).length,1);
 assert.equal((html.match(/\/sales\/lead-extension-link\.js/g)||[]).length,1);
 const page=fs.readFileSync(path.join(__dirname,'..','sales','lead-extension-link.js'),'utf8');
 assert.ok(page.includes("entity:'lead_import_token'")&&page.includes("'x-radix-sales':'1'")&&page.includes("credentials:'same-origin'"));
});

test('README states the LinkedIn terms risk in Italian and the install steps',()=>{
 const md=read('README.md');
 assert.match(md,/termini/i);assert.match(md,/sospes|limitat/i);assert.match(md,/Carica estensione non pacchettizzata/);
 assert.match(md,/chrome:\/\/extensions/);
});
