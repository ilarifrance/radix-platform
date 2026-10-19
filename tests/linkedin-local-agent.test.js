'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const Batch=require('../lib/lead-contact-batches'),Source=require('../lib/salesnav-source');
const {normalizeVisibleCards,csvExport}=require('../lib/linkedin-browser-extract');
const {handler,isAuthOrChallenge,isLocalRequest}=require('../tools/linkedin-local-agent/index');
const SOURCE='https://www.linkedin.com/sales/search/people?query=test';
test('validates real Sales Navigator URLs, rejects other sources and credentials',()=>{
 assert.equal(Source.validate(SOURCE),SOURCE);
 assert.throws(()=>Source.validate('https://evil.example'),/linkedin.com/);
 assert.throws(()=>Source.validate('https://user:secret@linkedin.com/sales/search/people'),/credenziali/);
});
test('normalizes visible individual profiles and does not fabricate email',()=>{
 const rows=normalizeVisibleCards([
  {fullName:'Jane Smith',profileUrl:'https://www.linkedin.com/sales/lead/abc,123?trk=xyz',lines:['Jane Smith','Managing Director at Company SRL','Milano']},
  {fullName:'Jane Smith',profileUrl:'https://www.linkedin.com/sales/lead/abc,123',lines:['Jane Smith']},
  {fullName:'Bad',profileUrl:'https://evil.example/profile',lines:['Bad']}
 ],SOURCE);
 assert.equal(rows.length,1);assert.equal(rows[0].fullName,'Jane Smith');assert.equal(rows[0].jobTitle,'Managing Director');assert.equal(rows[0].companyName,'Company SRL');assert.equal(rows[0].email,undefined);
});
test('RADIX batch format supports 600 records, deduplication and retry',()=>{
 let job=Batch.start(SOURCE);
 for(let p=0;p<3;p++)job=Batch.add(job,Array.from({length:200},(_,i)=>({fullName:'Person '+(i+p*200),profileUrl:'https://www.linkedin.com/sales/lead/'+(i+p*200)})),'page-'+p+'-0');
 job=Batch.add(job,[{fullName:'Person 1',profileUrl:'https://www.linkedin.com/sales/lead/1',jobTitle:'CEO'}],'page-4-0');
 assert.equal(job.records.length,600);assert.equal(job.duplicates,1);assert.equal(job.records[1].jobTitle,'CEO');
 assert.equal(Batch.add(job,[{fullName:'Person 1',profileUrl:'https://www.linkedin.com/sales/lead/1',jobTitle:'CEO'}],'page-4-0').total,601);
});
test('CSV escapes spreadsheet formulas',()=>{assert.match(csvExport({records:[{fullName:'=HYPERLINK("x")',jobTitle:'+SUM(1,1)'}]}),/'=HYPERLINK/);});
test('authentication challenge requires manual intervention',()=>{assert.equal(isAuthOrChallenge('https://www.linkedin.com/checkpoint/challenge'),true);assert.equal(isAuthOrChallenge('https://www.linkedin.com/sales/search/people'),false);});
test('local API rejects foreign origin and requires browser session',async()=>{
 const server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const addr='http://127.0.0.1:'+server.address().port;
  const foreign=await fetch(addr+'/api/start',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://untrusted.example'},body:'{}'});assert.equal(foreign.status,403);
  const unauth=await fetch(addr+'/api/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:SOURCE,quantity:50})});assert.equal(unauth.status,409);
  const content=await fetch(addr+'/');assert.equal(content.status,200);assert.match(await content.text(),/RADIX/);
  const status=await(await fetch(addr+'/api/status')).json();assert.equal(status.phase,'idle');
 }finally{server.close()}
});

test('local server rejects forged Host headers (DNS rebinding) and accepts loopback',async()=>{
 const server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const port=server.address().port,addr='http://127.0.0.1:'+port;
  const valid=await fetch(addr+'/api/status');assert.equal(valid.status,200);
  // Node's fetch() overrides the Host header: use raw http.request to exercise
  // the actual Host validation instead of inadvertently testing a normal request.
  const rawHost=host=>new Promise((resolve,reject)=>{
   const req=http.request({hostname:'127.0.0.1',port,path:'/api/status',method:'GET',headers:{Host:host}},res=>{
    res.resume();res.on('end',()=>resolve(res.statusCode));
   });req.on('error',reject);req.end();
  });
  assert.equal(await rawHost('attacker.example'),403);
  assert.equal(await rawHost('localhost:'+port),403);
  assert.equal(await rawHost('127.0.0.1:'+port),200);
  assert.equal(isLocalRequest({headers:{host:'127.0.0.1:'+port},socket:{localPort:port,remoteAddress:'127.0.0.1'}}),true);
 }finally{server.close()}
});


test('extracts Italian role and company from visible Sales Navigator card text',()=>{
 const rows=normalizeVisibleCards([
  {fullName:'Carmine Cavezza',profileUrl:'https://www.linkedin.com/sales/lead/flaxia,123',lines:['Carmine Cavezza · 2°','Proprietario · Flaxia spa','Cicciano, Campania, Italia','3 anni 10 mesi nel ruolo']},
  {fullName:'Nicolò Costanzo',profileUrl:'https://www.linkedin.com/sales/lead/intertex,123',lines:['Nicolò Costanzo','Direttore · Intertex Milano 1-2-3 February 2027','Milano, Lombardia, Italia']},
  {fullName:'Francesco Canuti',profileUrl:'https://www.linkedin.com/sales/lead/confindustria,123',lines:['Francesco Canuti','Vice presidente · Confindustria Reggio Emilia','9 anni nel ruolo']},
  {fullName:'Michele Sacchet',profileUrl:'https://www.linkedin.com/sales/lead/remax,123',lines:['Michele Sacchet','Broker Titolare · Re/Max casamia Belluno','Belluno, Veneto, Italia']}
 ],SOURCE);
 assert.deepEqual(rows.map(x=>[x.jobTitle,x.companyName]),[
  ['Proprietario','Flaxia spa'],
  ['Direttore','Intertex Milano 1-2-3 February 2027'],
  ['Vice presidente','Confindustria Reggio Emilia'],
  ['Broker Titolare','Re/Max casamia Belluno']
 ]);
});
test('does not invent a company from location or profile metadata',()=>{
 const rows=normalizeVisibleCards([{fullName:'Example Person',profileUrl:'https://www.linkedin.com/sales/lead/test,123',lines:['Example Person · 2°','Milano, Lombardia, Italia','3 anni 10 mesi nel ruolo','Informazioni: personal update']}],SOURCE);
 assert.equal(rows[0].companyName,'');
 assert.equal(rows[0].jobTitle,'');
});


test('local contact receiver is read-only and returns an empty table without jobs',async()=>{
 const server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const base='http://127.0.0.1:'+server.address().port;
  const response=await fetch(base+'/api/contacts');
  assert.equal(response.status,200);
  const payload=await response.json();
  assert.equal(Array.isArray(payload.records),true);
  assert.equal(payload.total,0);
  assert.equal(payload.complete,0);
  assert.equal(payload.incomplete,0);
  const page=await(await fetch(base+'/')).text();
  assert.match(page,/Contatti ricevuti/);
  assert.match(page,/receiver-filter/);
 }finally{server.close()}
});
test('profile normalization prefers structured fields without inventing email or telephone',()=>{
 const {normalizeProfileDetails}=require('../lib/linkedin-browser-extract');
 const base={fullName:'Giulia Test',profileUrl:'https://www.linkedin.com/sales/lead/example,123',jobTitle:'',companyName:'',sourceUrl:SOURCE};
 const normalized=normalizeProfileDetails({roleText:'Proprietaria · Impresa Esempio Srl',location:'Milano',lines:[]},base,SOURCE);
 assert.equal(normalized.jobTitle,'Proprietaria');
 assert.equal(normalized.companyName,'Impresa Esempio Srl');
 assert.equal(normalized.location,'Milano');
 assert.equal(normalized.email,undefined);
 assert.equal(normalized.phone,undefined);
});
