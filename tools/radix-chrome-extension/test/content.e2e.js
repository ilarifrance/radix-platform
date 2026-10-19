'use strict';
// End-to-end test of the real unpacked extension in Playwright's Chromium,
// against a FAKE Sales Navigator page and a fake RADIX server (routes inside
// the browser context). No request reaches LinkedIn or RADIX production.
// Run from the repo root (Playwright is not a repo dependency):
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node --test tools/radix-chrome-extension/test/content.e2e.js
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),os=require('node:os'),path=require('node:path');
// Playwright from the project, NODE_PATH, or the global npm folder next to node.
let chromium;for(const id of ['playwright',path.join(path.dirname(process.execPath),'..','lib','node_modules','playwright')]){try{({chromium}=require(id));break}catch{}}
process.env.JWT_SECRET='e2e-only-secret';
const T=require('../../../api/_lead_import_token');
const {createHandler}=require('../../../api/_sales');
const EXT=path.join(__dirname,'..');
let RADIX='';
const WS='11111111-1111-4111-8111-111111111111';
const FIXTURE=fs.readFileSync(path.join(__dirname,'fixture-salesnav.html'),'utf8');

// Copy of the extension with a test RADIX host and short waits; the shipped files stay untouched.
function testCopy(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'radix-ext-'));
 fs.cpSync(EXT,dir,{recursive:true,filter:src=>!src.includes(path.sep+'test')});
 const m=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
 m.host_permissions=['http://127.0.0.1/*'];fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(m));
 const c=path.join(dir,'src','content.js');
 fs.writeFileSync(c,fs.readFileSync(c,'utf8').replace(/window\.__radixTiming\|\|\{[^}]+\}/,'{scroll:[150,250],page:[300,500],wait:4000,poll:100}'));
 return dir;
}
async function launch(t){
 const ext=testCopy(),profile=fs.mkdtempSync(path.join(os.tmpdir(),'radix-profile-'));
 const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:['--disable-extensions-except='+ext,'--load-extension='+ext]});
 t.after(()=>context.close());
 const jobs=[],requests=[];
 const store={leadLists:{membership:async(w,u)=>w===WS&&u===5?{role:'member'}:null},leadContactJobs:{command:async(c,uid)=>{jobs.push(c);return {id:c.data.id,title:c.data.title,version:1}}}};
 const handler=createHandler({getSessionUser:()=>null,getStore:()=>store});
 // Fake RADIX on 127.0.0.1 (extension service-worker requests are not routed by Playwright).
 const server=http.createServer(async(req,res)=>{
  let data='';for await(const part of req)data+=part;
  const u=new URL(req.url,'http://127.0.0.1');requests.push(req.method+' '+u.pathname);
  const out={headers:{},statusCode:0,setHeader(k,v){this.headers[k]=v},status(s){this.statusCode=s;return this},json(v){res.writeHead(this.statusCode,{'Content-Type':'application/json'});res.end(JSON.stringify(v));return this}};
  handler({method:req.method,headers:req.headers,body:data||undefined,query:Object.fromEntries(u.searchParams)},out);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 RADIX='http://127.0.0.1:'+server.address().port;
 await context.route('https://www.linkedin.com/**',route=>{
  const u=new URL(route.request().url());
  if(u.pathname.startsWith('/sales/search/people'))return route.fulfill({status:200,contentType:'text/html',body:FIXTURE});
  if(u.pathname.startsWith('/checkpoint/'))return route.fulfill({status:200,contentType:'text/html',body:'<h1>Verifica di sicurezza</h1>'});
  return route.fulfill({status:404,body:''});
 });
 let [sw]=context.serviceWorkers();
 if(!sw)sw=await context.waitForEvent('serviceworker',{timeout:15000});
 await sw.evaluate(([base,token])=>chrome.storage.local.set({baseUrl:base,token}),[RADIX,T.sign({uid:5,workspace:WS},process.env.JWT_SECRET).token]);
 return {context,sw,jobs,requests};
}
async function popupFor(context,sw){
 const id=new URL(sw.url()).host,popup=await context.newPage();
 await popup.goto('chrome-extension://'+id+'/popup.html');
 return popup;
}
// The extension has no "tabs" permission: find the Sales Navigator tab by asking each tab's content script.
const toTab=(sw,msg)=>sw.evaluate(async msg=>{for(const tab of await chrome.tabs.query({})){const ok=await chrome.tabs.sendMessage(tab.id,{type:'radix:probe'}).catch(()=>null);if(ok&&ok.supported)return chrome.tabs.sendMessage(tab.id,msg)}return null},msg);
const runState=sw=>sw.evaluate(()=>chrome.storage.local.get('run').then(x=>x.run||null));
async function until(fn,ms=60000){const end=Date.now()+ms;while(Date.now()<end){const v=await fn();if(v)return v;await new Promise(r=>setTimeout(r,250))}throw Error('timeout')}

test('extension e2e on a fake Sales Navigator page',{skip:!chromium&&'playwright non disponibile (NODE_PATH)'},async t=>{
 await t.test('paginates visible results up to the max and imports a RADIX contact job',async t=>{
  const {context,sw,jobs,requests}=await launch(t);
  const page=await context.newPage();
  await page.goto('https://www.linkedin.com/sales/search/people?query=ceo&n=60');
  await page.waitForSelector('#radix-import-badge',{state:'attached'});
  const probe=await toTab(sw,{type:'radix:probe'});
  assert.equal(probe.supported,true);assert.ok(probe.visible>=5,'visible '+probe.visible);assert.equal(probe.total,'60 risultati');assert.equal(probe.challenge,'');
  await page.bringToFront();
  const started=await toTab(sw,{type:'radix:start',max:40});
  assert.equal(started.ok,true,JSON.stringify(started));
  const run=await until(async()=>{const r=await runState(sw);return r&&['imported','upload-error','blocked','collected'].includes(r.status)&&r});
  assert.equal(run.status,'imported',run.message);
  assert.equal(run.rows.length,40);assert.equal(run.page,2);
  assert.equal(jobs.length,1);
  const job=jobs[0];
  assert.equal(job.workspace,WS);assert.equal(job.data.payload.records.length,40);
  const r0=job.data.payload.records[0];
  assert.equal(r0.fullName,'Giulia Bianchi 0');assert.equal(r0.firstName,'Giulia');assert.equal(r0.lastName,'Bianchi');
  assert.equal(r0.jobTitle,'Responsabile acquisti');assert.equal(r0.companyName,'Azienda 0 Srl');assert.equal(r0.location,'Milano, Lombardia, Italia');
  assert.equal(r0.profileUrl,'https://www.linkedin.com/sales/lead/ACwAA0000,NAME_SEARCH,x1');
  assert.equal(r0.email,'');
  const r3=job.data.payload.records[3];assert.equal(r3.jobTitle,'');assert.equal(r3.companyName,'Azienda 3 Srl');
  const r4=job.data.payload.records[4];assert.equal(r4.companyName,'');
  assert.equal(new Set(job.data.payload.records.map(r=>r.profileUrl)).size,40);
  assert.match(job.data.title,/^LinkedIn Sales Navigator · /);
  assert.deepEqual(requests,['POST /api/sales']);
  const popup=await popupFor(context,sw);
  await popup.waitForSelector('#open:not([hidden])');
  assert.match(await popup.textContent('#run-message'),/Importati 40 contatti/);
  assert.equal(await popup.getAttribute('#open','href'),RADIX+'/lead-intelligence.html');
 });
 await t.test('stops at an in-page CAPTCHA and still sends what was visible before',async t=>{
  const {context,sw,jobs}=await launch(t);
  const page=await context.newPage();
  await page.goto('https://www.linkedin.com/sales/search/people?query=ceo&n=60&captcha=2');
  await page.waitForSelector('#radix-import-badge',{state:'attached'});
  await toTab(sw,{type:'radix:start',max:100});
  const run=await until(async()=>{const r=await runState(sw);return r&&!['running','uploading'].includes(r.status)&&r});
  assert.equal(run.endReason,'blocked');assert.equal(run.rows.length,25);assert.equal(run.status,'imported');
  assert.equal(jobs.length,1);
 });
 await t.test('a checkpoint navigation ends the run and keeps the contacts',async t=>{
  const {context,sw,jobs}=await launch(t);
  const page=await context.newPage();
  await page.goto('https://www.linkedin.com/sales/search/people?query=ceo&n=60&checkpoint=2');
  await page.waitForSelector('#radix-import-badge',{state:'attached'});
  await toTab(sw,{type:'radix:start',max:100});
  const run=await until(async()=>{const r=await runState(sw);return r&&!['running','uploading'].includes(r.status)&&r});
  assert.equal(run.endReason,'blocked');assert.equal(run.rows.length,25);
  assert.equal(jobs.length,1);
  assert.match(page.url(),/checkpoint/);
 });
 await t.test('without a link the contacts wait in the extension and can be sent later',async t=>{
  const {context,sw,jobs}=await launch(t);
  await sw.evaluate(()=>chrome.storage.local.remove('token'));
  const page=await context.newPage();
  await page.goto('https://www.linkedin.com/sales/search/people?query=ceo&n=10');
  await page.waitForSelector('#radix-import-badge',{state:'attached'});
  await toTab(sw,{type:'radix:start',max:25});
  const run=await until(async()=>{const r=await runState(sw);return r&&r.status==='needs-link'&&r});
  assert.equal(run.rows.length,10);assert.equal(jobs.length,0);
  await sw.evaluate(([base,token])=>chrome.storage.local.set({baseUrl:base,token}),[RADIX,T.sign({uid:5,workspace:WS},process.env.JWT_SECRET).token]);
  const popup=await popupFor(context,sw);
  await popup.click('#retry');
  await until(async()=>(await runState(sw)).status==='imported');
  assert.equal(jobs.length,1);assert.equal(jobs[0].data.payload.records.length,10);
 });
});
