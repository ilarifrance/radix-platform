'use strict';
// Studio Sito: contact form → CRM (api/_site_form.js through api/_sales.js) and legal pages without AI (lib/site-legal.js).
// In-memory stores and a fake Vercel only: no database, no e-mail, no real publish.
const test=require('node:test'),assert=require('node:assert/strict');
process.env.JWT_SECRET=process.env.JWT_SECRET||'test-secret-for-site-form';
const SECRET=process.env.JWT_SECRET;
const F=require('../api/_site_form.js'),L=require('../lib/site-legal.js'),S=require('../lib/site-studio.js');
const {createHandler}=require('../api/_sales.js'),importToken=require('../api/_lead_import_token.js'),auth=require('../api/_auth.js'),pub=require('../api/_site_publish.js');
const WS='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222',SITE='fisio-ab12cd34';
const FACTS={legalName:'Studio Fisio srl',vat:'01234567897',address:'Via Roma 12, 24121 Bergamo',email:'privacy@fisio.it'};

function call(handler,{method='POST',headers={},body,query={}}){
 return new Promise(resolve=>{
  const res={headers:{},statusCode:0,setHeader(k,v){this.headers[k]=v},status(s){this.statusCode=s;return this},
   json(v){resolve({status:this.statusCode,body:v,headers:this.headers});return this},send(v){resolve({status:this.statusCode,body:v,headers:this.headers});return this},end(v){resolve({status:this.statusCode,body:v,headers:this.headers});return this}};
  Promise.resolve(handler({method,headers,body,query},res)).catch(e=>resolve({status:'threw',body:e}));
 });
}
// The CRM store double: membership, the two SQL reads of the form, and sales_command (recorded).
function fakeStore({roles={[WS]:'member'},existing=null,recent=0}={}){const commands=[],sql=[];
 return {commands,sql,store:{
  membership:async(w,u)=>u===7&&roles[w]?{role:roles[w]}:null,
  leadLists:{membership:async()=>null},
  sql:async(text,params)=>{sql.push({text,params});
   if(/FROM sales_contacts/.test(text))return existing&&params[1].toLowerCase()===existing.email?[{id:existing.id}]:[];
   if(/count\(\*\)/.test(text))return [{n:recent}];
   throw Error('unexpected sql '+text)},
  command:async(c,uid)=>{commands.push({c,uid});return {id:c.data.id,version:1}}
 }};
}
const form=(extra={})=>new URLSearchParams({t:F.sign({uid:7,workspace:WS,site:SITE},SECRET).token,name:'Mario Rossi',email:'Mario.Rossi@example.it',phone:'+39 035 123456',message:'Vorrei un appuntamento\nper la schiena.',privacy:'1',website:'',...extra}).toString();
const H={'content-type':'application/x-www-form-urlencoded',origin:'https://studio-fisio-ab12cd.radixinnovationstudio.com'};
function handler(fake){return createHandler({getSessionUser:()=>({uid:7}),getStore:()=>fake.store})}
// Each send from its own visitor address, so the per-IP limit (tested on its own) does not interfere.
let ip=0;
const send=(fake,{body=form(),headers=H}={})=>call(handler(fake),{method:'POST',headers:{'x-forwarded-for':'198.51.100.'+(++ip%250)+', 10.0.0.'+ip,...headers},body,query:{site_form:'1'}});

test('form token: signed, scoped to one workspace and one project, expiring, not a session nor an import token',()=>{
 const now=Date.UTC(2026,9,22),{token,expiresAt,workspace,site}=F.sign({uid:7,workspace:WS,site:SITE},SECRET,now);
 assert.match(token,/^rsf1\./);assert.equal(workspace,WS);assert.equal(site,SITE);assert.equal(new Date(expiresAt).getTime(),now+730*86400000);
 const c=F.verify(token,SECRET,now+1000);assert.equal(c.uid,7);assert.equal(c.ws,WS);assert.equal(c.site,SITE);assert.equal(c.scope,'site-form');
 assert.equal(F.verify(token,SECRET,now+730*86400000+1),null,'expired');assert.equal(F.verify(token,'other',now),null,'other secret');
 const [p,b,s]=token.split('.');for(const patch of [{ws:OTHER},{site:'altro-sito'},{uid:8},{scope:'lead-import'}]){
  const forged=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(b,'base64url')),...patch})).toString('base64url');assert.equal(F.verify([p,forged,s].join('.'),SECRET,now),null,JSON.stringify(patch))}
 assert.equal(auth.verifySessionToken(token),null,'not a session');assert.equal(importToken.verify(token,SECRET,now),null,'not an import token');
 assert.equal(F.verify(importToken.sign({uid:7,workspace:WS},SECRET,now).token,SECRET,now),null,'an import token is not a form token');
 assert.equal(F.verify(auth.signSessionToken({uid:7,email:'a@b.c'}),SECRET),null,'a session is not a form token');
 assert.throws(()=>F.sign({uid:7,workspace:WS,site:'../x'},SECRET),/non validi/);assert.throws(()=>F.sign({uid:0,workspace:WS,site:SITE},SECRET),/non validi/);
 assert.throws(()=>F.sign({uid:7,workspace:WS,site:SITE},''),e=>e.status===503);
 for(const bad of [null,'',token+'x','rli1.'+b+'.'+s,'x'.repeat(800)])assert.equal(F.verify(bad,SECRET),null);
});

test('«Collega al CRM»: a writing member gets the token for the project; viewers and bad input are refused',async()=>{
 const fake=fakeStore({roles:{[WS]:'member',[OTHER]:'viewer'}}),h=handler(fake);
 const post=(body,headers={})=>call(h,{method:'POST',headers:{'content-type':'application/json','x-radix-sales':'1',...headers},body});
 const r=await post({workspace:WS,entity:'site_form_token',action:'create',data:{site:SITE}});
 assert.equal(r.status,200);const c=F.verify(r.body.token,SECRET);assert.equal(c.ws,WS);assert.equal(c.site,SITE);assert.equal(c.uid,7);
 assert.equal((await post({workspace:OTHER,entity:'site_form_token',action:'create',data:{site:SITE}})).status,403,'viewer');
 for(const data of [{},{site:'../x'},{site:SITE,extra:1},{site:5}])assert.equal((await post({workspace:WS,entity:'site_form_token',action:'create',data})).status,400,JSON.stringify(data));
 assert.equal((await post({workspace:WS,entity:'site_form_token',action:'update',data:{site:SITE}})).status,400);
 assert.equal((await post({workspace:WS,entity:'site_form_token',action:'create',data:{site:SITE}},{'sec-fetch-site':'cross-site'})).status,403,'never from another site');
 assert.equal(fake.commands.length,0);
});

test('a send from the site becomes a new CRM contact and a note, then redirects to grazie.html',async()=>{
 const fake=fakeStore(),r=await send(fake);
 assert.equal(r.status,303);assert.equal(r.headers.Location,'https://studio-fisio-ab12cd.radixinnovationstudio.com/grazie.html');assert.equal(r.headers['Cache-Control'],'no-store');
 assert.equal(fake.commands.length,3);const [contact,note,lead]=fake.commands;
 assert.equal(contact.uid,7);assert.equal(contact.c.workspace,WS);assert.equal(contact.c.entity,'contacts');assert.equal(contact.c.action,'create');
 assert.equal(contact.c.data.name,'Mario Rossi');assert.equal(contact.c.data.email,'mario.rossi@example.it');assert.equal(contact.c.data.phone,'+39 035 123456');
 assert.equal(contact.c.data.marketing_consent,false,'marketing only with its own box');assert.equal(contact.c.data.consent_at,undefined);
 assert.match(contact.c.data.notes,/modulo del sito https:\/\/studio-fisio/);
 assert.equal(note.c.entity,'interactions');assert.equal(note.c.data.kind,'note');assert.equal(note.c.data.title,'Messaggio dal modulo del sito');assert.equal(note.c.data.contact_id,contact.c.data.id);
 assert.match(note.c.data.body,/^Vorrei un appuntamento\nper la schiena\.\n\n— Arrivato dal modulo contatti del sito https:\/\//);assert.match(note.c.data.body,/Consenso privacy: sì \(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ\)/);assert.match(note.c.data.body,/Consenso a ricevere novità: no/);
 assert.equal(lead.c.entity,'leads');assert.equal(lead.c.action,'create');assert.deepEqual({...lead.c.data,id:undefined},{id:undefined,title:'Richiesta dal sito: Mario Rossi',contact_id:contact.c.data.id,status:'nuovo',source:'sito'});
 // an archive without migration 012 refuses the lead: contact and note stay, the visitor still gets the thank-you
 const old=fakeStore();const cmd=old.store.command;old.store.command=async(c,u)=>{if(c.entity==='leads'){const e=Error('invalid field');e.code='22023';throw e}return cmd(c,u)};
 assert.equal((await send(old)).status,303);assert.deepEqual(old.commands.map(x=>x.c.entity),['contacts','interactions']);
 const read=fake.sql.find(q=>/FROM sales_contacts/.test(q.text));assert.match(read.text,/WHERE workspace_id=\$1 AND lower\(email\)=lower\(\$2\)/);assert.deepEqual(read.params,[WS,'mario.rossi@example.it']);
 // marketing box ticked: consent stored on the contact with its time
 const m=fakeStore();await send(m,{body:form({marketing:'1'})});assert.equal(m.commands[0].c.data.marketing_consent,true);assert.match(m.commands[0].c.data.consent_at,/Z$/);
 // same e-mail already in the CRM: only the note, on that contact
 const ex=fakeStore({existing:{id:'33333333-3333-4333-8333-333333333333',email:'mario.rossi@example.it'}});const r2=await send(ex);
 assert.equal(r2.status,303);assert.equal(ex.commands.length,1);assert.equal(ex.commands[0].c.entity,'interactions');assert.equal(ex.commands[0].c.data.contact_id,'33333333-3333-4333-8333-333333333333');
 // JSON clients get JSON; no origin → a small thank-you page
 const j=await send(fakeStore(),{headers:{...H,accept:'application/json'}});assert.equal(j.status,200);assert.deepEqual(j.body,{ok:true});
 const plain=await send(fakeStore(),{headers:{'content-type':'application/x-www-form-urlencoded'}});assert.equal(plain.status,200);assert.match(plain.body,/Grazie, abbiamo ricevuto il tuo messaggio/);
 const obj=fakeStore();assert.equal((await send(obj,{body:Object.fromEntries(new URLSearchParams(form()))})).status,303,'body already parsed by the platform');assert.equal(obj.commands.length,3);
});

test('validation, honeypot and consent: nothing is written for a bad or bot send',async()=>{
 const cases=[[{name:''},400,/nome/],[{email:'non-una-mail'},400,/e-mail valido/],[{phone:'chiamami'},400,/telefono/],[{message:' '},400,/messaggio/],[{privacy:''},400,/consenso/],[{t:'rsf1.x.y'},401,/non è più collegato/]];
 for(const [extra,status,re] of cases){const fake=fakeStore(),r=await send(fake,{body:form(extra)});assert.equal(r.status,status,JSON.stringify(extra));assert.match(r.body,re);assert.match(r.body,/Torna al sito/);assert.equal(fake.commands.length,0)}
 const bot=fakeStore(),r=await send(bot,{body:form({website:'http://spam.example'})});assert.equal(r.status,303,'the bot sees the usual thank-you');assert.equal(bot.commands.length,0);assert.equal(bot.sql.length,0);
 const gone=fakeStore({roles:{}}),g=await send(gone);assert.equal(g.status,403,'member removed: the form is off');assert.equal(gone.commands.length,0);
 const viewer=fakeStore({roles:{[WS]:'viewer'}});assert.equal((await send(viewer)).status,403);
 assert.equal((await call(handler(fakeStore()),{method:'GET',query:{site_form:'1'}})).status,405);
 assert.equal((await send(fakeStore(),{body:form({message:'x'.repeat(30000)})})).status,413);
 const long=fakeStore();await send(long,{body:form({name:'N'.repeat(500),message:'M'.repeat(5000)})});assert.equal(long.commands[0].c.data.name.length,120);assert.ok(long.commands[1].c.data.body.length<=4000);
 const f=F.fieldsOf({name:' Ann\u0000a ',email:'A@B.IT',privacy:'on',message:'ciao\r\nlì'});assert.equal(f.name,'Anna');assert.equal(f.email,'a@b.it');assert.equal(f.message,'ciao\nlì');assert.equal(f.privacy,true);
 assert.equal(F.originOf({headers:{origin:'javascript:alert(1)'}}),'');assert.equal(F.originOf({headers:{referer:'https://x.it/pagina?a=1'}}),'https://x.it');assert.equal(F.originOf({headers:{origin:'http://evil.example'}}),'');
});

test('rate limit: per IP and site in memory, per workspace on the database',async()=>{
 const limit=F.limiter({max:5,windowMs:600000}),fake=fakeStore(),h=createHandler({getSessionUser:()=>null,getStore:()=>fake.store});
 // the handler uses the module limiter: drive it through a fresh IP
 const headers={...H,'x-forwarded-for':'203.0.113.9, 10.0.0.1'};const codes=[];
 for(let i=0;i<6;i++)codes.push((await call(h,{method:'POST',headers,body:form(),query:{site_form:'1'}})).status);
 assert.deepEqual(codes,[303,303,303,303,303,429]);assert.equal(fake.commands.length,15);
 const other=await call(h,{method:'POST',headers:{...H,'x-forwarded-for':'203.0.113.10'},body:form(),query:{site_form:'1'}});assert.equal(other.status,303,'another visitor is not blocked');
 let t=0;for(let i=0;i<5;i++)assert.equal(limit('k',t+=1000),true);assert.equal(limit('k',t),false);assert.equal(limit('k',t+600001),true,'the window passes');
 const busy=fakeStore({recent:F.RATE.perWorkspaceHour});const r=await call(h,{method:'POST',headers:{...H,'x-forwarded-for':'203.0.113.11'},body:form(),query:{site_form:'1'}});
 // h is bound to `fake`: use a handler on the busy store
 const hb=createHandler({getSessionUser:()=>null,getStore:()=>busy.store});const rb=await call(hb,{method:'POST',headers:{...H,'x-forwarded-for':'203.0.113.12'},body:form(),query:{site_form:'1'}});
 assert.equal(r.status,303);assert.equal(rb.status,429);assert.match(rb.body,/Troppi messaggi/);assert.equal(busy.commands.length,0);
});

test('legal facts come only from the project, never guessed; VAT number checked',()=>{
 assert.deepEqual(L.legalFacts(null),{legalName:'',vat:'',address:'',email:''});
 assert.deepEqual(L.missing(L.legalFacts({notes:'Sede: Via Roma 12, Bergamo',summary:'Studio di fisioterapia'})),['legalName','vat','address','email'],'the shop address is not the registered office');
 const f=L.legalFacts({notes:'Ragione sociale: Studio Fisio srl\nP. IVA: IT 01234567897\nSede legale: Via Roma 12, 24121 Bergamo.'},{contacts:'035 123456 · info@fisio.it'});
 assert.deepEqual(f,{legalName:'Studio Fisio srl',vat:'01234567897',address:'Via Roma 12, 24121 Bergamo',email:'info@fisio.it'});
 assert.equal(L.legalFacts({vat:'01234567890'}).vat,'','a wrong check digit is not used');
 assert.equal(L.legalFacts({legalName:'A srl',piva:'00743110157',legalAddress:'Piazza X 1',privacyEmail:'dpo@a.it'}).vat,'00743110157');
 assert.equal(L.vatNumber('IT 0074 3110 157'),'00743110157');assert.equal(L.vatNumber('00000000000'),'');assert.equal(L.vatNumber('123'),'');
 assert.deepEqual(L.checkValue('[da completare: partita IVA]','01234567890'),{error:'Partita IVA non valida: servono 11 cifre (controlla di averla copiata bene).'});
 assert.deepEqual(L.checkValue('[da completare: partita IVA]','IT01234567897'),{value:'01234567897'});
 assert.ok(L.checkValue('[da completare: e-mail per le richieste privacy]','no').error);assert.deepEqual(L.checkValue('[da completare: ragione sociale]','  A  srl '),{value:'A srl'});
});

test('privacy and cookie pages: fixed Italian text, the facts or yellow placeholders, no script',()=>{
 const empty=L.legalPages({facts:{},name:'Studio Fisio',form:true,date:'2026-10-22T10:00:00Z',year:2026});
 assert.deepEqual(Object.keys(empty),['privacy.html','cookie.html','grazie.html']);
 const priv=empty['privacy.html'];
 for(const k of ['legalName','vat','address','email'])assert.ok(priv.includes(L.marker(k)),k);
 assert.ok(S.hasTodo(priv));assert.match(priv,/art\. 13 del Regolamento \(UE\) 2016\/679/);assert.match(priv,/22 ottobre 2026/);
 assert.match(priv,/modulo contatti/);assert.match(priv,/art\. 6, par\. 1, lett\. b/);assert.match(priv,/consenso \(art\. 6, par\. 1, lett\. a/);assert.match(priv,/artt\. 15-22/);assert.match(priv,/garanteprivacy\.it/);
 assert.match(priv,/href="cookie\.html"/);assert.ok(!/<script/i.test(Object.values(empty).join('')),'no script anywhere');
 for(const page of Object.values(empty))assert.match(page,/default-src 'none'/);
 const full=L.legalPages({facts:FACTS,name:'Studio <Fisio>',form:false});
 assert.deepEqual(Object.keys(full),['privacy.html','cookie.html'],'no thank-you page without the form');
 assert.ok(!S.hasTodo(Object.values(full).join('')),'all facts given: nothing to complete');
 assert.match(full['privacy.html'],/Studio Fisio srl, con sede legale in Via Roma 12, 24121 Bergamo, P\. IVA 01234567897/);assert.match(full['privacy.html'],/mailto:privacy@fisio\.it/);
 assert.ok(!/modulo contatti/.test(full['privacy.html']),'no form, no form paragraph');assert.ok(full['privacy.html'].includes('Studio &lt;Fisio&gt;'));
 const cookie=full['cookie.html'];assert.match(cookie,/non usa cookie di profilazione/);assert.match(cookie,/Non contiene script e non installa cookie propri/);assert.ok(!/Statistiche di visita/.test(cookie));
 const stats=L.cookiePage({facts:FACTS,analytics:true});assert.match(stats,/Statistiche di visita/);assert.ok(stats.includes(L.marker('analytics')),'the tool is never invented');
 assert.match(L.footerText(FACTS,{year:2026}),/© 2026 Studio Fisio srl · P\. IVA 01234567897 · Sede legale: Via Roma 12, 24121 Bergamo/);
});

const PROP={name:'Vicini',headline:'Ti rimettiamo in movimento',sections:[{title:'Servizi',text:'Riabilitazione.'},{title:'Contatti',text:'Scrivici.'}],cta:'Scrivici'};
const OPTS={name:'Studio Fisio',style:'caldo',contacts:'035 123456',year:2026,form:{action:'https://radix.example/api/sales?site_form=1',token:''},legal:{}};

test('the page carries the form (no script, honeypot, required privacy consent) and the legal footer',()=>{
 const html=S.buildPage(PROP,OPTS);
 assert.match(html,/<form class="lead" method="post" action="https:\/\/radix\.example\/api\/sales\?site_form=1" accept-charset="utf-8" data-radix-form="unlinked">/);
 assert.match(html,/<input type="hidden" name="t" value="">/);assert.match(html,/class="hp" aria-hidden="true"><label>Non compilare questo campo <input type="text" name="website" tabindex="-1"/);
 assert.match(html,/<input type="checkbox" name="privacy" value="1" required> <span>Ho letto l’<a href="privacy\.html">informativa privacy<\/a>/);
 assert.match(html,/<input type="checkbox" name="marketing" value="1"> /);assert.ok(!/name="marketing" value="1" required/.test(html),'marketing consent is optional');
 assert.match(html,/name="email" required/);assert.match(html,/<textarea name="message" required/);
 assert.match(html,/form-action 'self' https:\/\/radix\.example"/);assert.ok(!/<script/i.test(html));
 assert.match(html,/<footer>[\s\S]*Ragione sociale|<footer>[\s\S]*\[da completare: ragione sociale\][\s\S]*href="privacy\.html">Privacy<\/a><a href="cookie\.html">Cookie/);
 assert.ok(S.formLinked(html)===false&&S.hasForm(html));
 const linked=S.linkForm(html,'rsf1.abc.def');assert.ok(S.formLinked(linked));assert.match(linked,/data-radix-form="linked"/);assert.match(linked,/name="t" value="rsf1\.abc\.def"/);
 assert.equal(S.linkForm(linked,''),html,'unlink restores the page');assert.equal(S.linkForm(html,'"><x').includes('"><x'),false,'token escaped');
 // no Contatti section: the form gets its own «Scrivici» section and the call to action points to it
 const own=S.buildPage({...PROP,sections:[{title:'Servizi',text:'t'}]},OPTS);assert.match(own,/<section id="modulo"[^>]*><div class="wrap"><h2>Scrivici<\/h2><form/);assert.match(own,/class="cta" href="#modulo"/);
 assert.equal(S.formAction('javascript:alert(1)'),'');assert.equal(S.formAction('http://evil.example/x'),'');assert.equal(S.formAction('http://localhost:8787/api/sales?site_form=1'),'http://localhost:8787/api/sales?site_form=1');
 assert.ok(!S.hasForm(S.buildPage(PROP,{name:'Studio Fisio'})),'no form unless asked');
});

test('«Da completare» covers company data on every page; one fill completes footer, privacy and cookie',()=>{
 const html=S.buildPage(PROP,OPTS),pages=S.sitePages(OPTS),all=[html,...Object.values(pages)].join('\n');
 const keys=S.todoMarkers(all).map(m=>m.key);
 for(const k of ['legalName','vat','address','email'])assert.ok(keys.includes(L.marker(k)),k);
 const values=Object.fromEntries(['legalName','vat','address','email'].map(k=>[L.marker(k),FACTS[k]]));
 const done=[S.fillTodos(html,values),...Object.values(pages).map(p=>S.fillTodos(p,values))];
 assert.equal(S.hasTodo(done.join('\n')),false);assert.match(done[0],/© 2026 Studio Fisio srl · P\. IVA 01234567897/);assert.match(done[1],/Il titolare del trattamento è Studio Fisio srl/);
});

// ---- publishing is blocked until legal data are filled and the form is linked to this project ----
const res=()=>({code:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(v){this.body=v;return this}});
function memStore(){const s={doc:{data:{schemaVersion:1,conversations:{}},revision:1},project:async id=>id===SITE?{id,name:'Studio Fisio'}:null,load:async()=>JSON.parse(JSON.stringify(s.doc)),save:async(id,data,rev)=>{s.doc={data,revision:rev+1};return true}};return s}
async function publish(html,pages){const calls=[],orig=auth.getSessionUser;auth.getSessionUser=()=>({uid:7,name:'Anna'});const r=res();
 const fetch=async(url,opts)=>{calls.push({url,body:opts.body?JSON.parse(opts.body):null});return {ok:true,status:200,json:async()=>({id:'dpl_1',url:'x.vercel.app',readyState:'READY'})}};
 try{await pub.handle({method:'POST',query:{},body:{action:'publish',projectId:SITE,html,pages},headers:{}},r,{env:{VERCEL_SITES_TOKEN:'vcp_x',JWT_SECRET:SECRET},store:memStore(),fetch,sleep:async()=>{},pollMs:1,waitMs:10})}finally{auth.getSessionUser=orig}
 return Object.assign(r,{calls})}
const fill=h=>S.fillTodos(h,Object.fromEntries(['legalName','vat','address','email'].map(k=>[L.marker(k),FACTS[k]])));

test('publish is refused with missing company data, missing legal pages or an unlinked form; accepted when complete',async()=>{
 const html=S.buildPage(PROP,OPTS),pages=S.sitePages(OPTS);
 let r=await publish(html,pages);assert.equal(r.code,422);assert.match(r.body.error,/da completare/);assert.equal(r.calls.length,0,'nothing sent to Vercel');
 const filledPages=Object.fromEntries(Object.entries(pages).map(([k,v])=>[k,fill(v)]));
 r=await publish(fill(html),filledPages);assert.equal(r.code,422,'form not linked');assert.match(r.body.error,/modulo contatti non è collegato/);
 const other=F.sign({uid:7,workspace:WS,site:'altro-progetto'},SECRET).token;
 r=await publish(fill(S.linkForm(html,other)),filledPages);assert.equal(r.code,422,'token of another project');
 const good=fill(S.linkForm(html,F.sign({uid:7,workspace:WS,site:SITE},SECRET).token));
 r=await publish(good,{'privacy.html':filledPages['privacy.html']});assert.equal(r.code,422);assert.match(r.body.error,/informativa privacy e la cookie policy/);
 r=await publish(good,{'privacy.html':filledPages['privacy.html'],'cookie.html':filledPages['cookie.html']});assert.equal(r.code,422);assert.match(r.body.error,/ringraziamento/);
 r=await publish(good,{...filledPages,'altro.html':'<html></html>'});assert.equal(r.code,400);
 r=await publish(good,{...filledPages,'cookie.html':pages['cookie.html']});assert.equal(r.code,422,'a placeholder in the cookie page blocks too');
 r=await publish(good,filledPages);assert.equal(r.code,200,JSON.stringify(r.body));
 assert.deepEqual(r.calls[0].body.files.map(f=>f.file),['index.html','privacy.html','cookie.html','grazie.html','robots.txt','sitemap.xml','llms.txt'],'the legal pages plus the files generated on the server');
 assert.equal(r.calls[0].body.files[0].data,good,'a page without JSON-LD goes online as it is');
});

test('wiring: legal script before the studio, profile passed, CRM link through the workspace client, sends routed by /api/sales',()=>{
 const fs=require('node:fs'),html=fs.readFileSync('agency/crea.html','utf8');
 assert.ok(html.indexOf('/lib/site-legal.js')>0&&html.indexOf('/lib/site-legal.js')<html.indexOf('/lib/site-studio.js'));
 assert.match(fs.readFileSync('agency/crea.js','utf8'),/S\.siteStudio\(\{project,profile:current\.profile,/);
 const ws=fs.readFileSync('lib/radix-workspace-client.js','utf8');assert.match(ws,/entity:'site_form_token',action:'create',data:\{site:projectId\}/);assert.match(ws,/'x-radix-sales':'1'/);
 const ui=fs.readFileSync('lib/site-studio.js','utf8');assert.match(ui,/html=linkForm\(html,r\.token\);refresh\(\)/);assert.match(ui,/Legal\.checkValue\(i\.dataset\.label,i\.value\)/);assert.match(ui,/root\.location\.origin\+'\/api\/sales\?site_form=1'/);
 assert.match(fs.readFileSync('api/_sales.js','utf8'),/if\(req\.query\?\.site_form!==undefined\)return await siteForm\.handle/);
 const src=fs.readFileSync('api/_site_form.js','utf8');assert.ok(!/sendMail|nodemailer|_send-email/.test(src),'no e-mail is sent');assert.ok(!/CREATE TABLE|ALTER TABLE/i.test(src),'no new table');
});
