'use strict';
// «Metti online il sito»: api/_site_publish.js against a stubbed fetch and an in-memory project store. No real Vercel call.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const pub=require('../api/_site_publish.js'),auth=require('../api/_auth.js'),studio=require('../lib/site-studio.js');
const TOKEN='vcp_SECRET_token_value_123',SECRET='test-jwt-secret-site-publish';
const res=()=>({code:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(v){this.body=v;return this}});
const PAGE=studio.buildPage({name:'Il risultato',headline:'Torna a fare quello che ami',sections:[{title:'Servizi',text:'Valutazione e piano.'},{title:'Contatti',text:'Scrivici.'}],cta:'Scrivici'},{name:'Studio Fisio',contacts:'035 123456 · info@fisio.it',style:'caldo'});
const PAGES=studio.sitePages({name:'Studio Fisio',style:'caldo',legal:{legalName:'Studio Fisio srl',vat:'01234567897',address:'Via Roma 12, 24121 Bergamo',email:'privacy@fisio.it'}});
function memStore(){const s={doc:{data:{schemaVersion:1,conversations:{copywriter:[{role:'user',content:'ciao'}]},other:1},revision:3},saves:0,conflicts:0,
 project:async id=>id==='fisio-ab12cd34'?{id,name:'Studio Fisio Bergamo'}:null,
 load:async()=>JSON.parse(JSON.stringify(s.doc)),
 save:async(id,data,rev)=>{s.saves++;if(s.conflicts>0){s.conflicts--;s.doc.revision++;return false}if(rev!==s.doc.revision)return false;s.doc={data,revision:rev+1};return true}};return s}
// A fake Vercel: deployments go QUEUED → BUILDING → READY over polls; every request is recorded.
function fakeVercel({states=['QUEUED','BUILDING','READY'],domain}={}){const calls=[];let polls=0;
 const reply=(status,body)=>({ok:status<400,status,json:async()=>body});
 const fetch=async(url,opts)=>{calls.push({url,method:opts.method,headers:opts.headers,body:opts.body?JSON.parse(opts.body):null});
  if(opts.method==='POST'&&/\/v13\/deployments(\?|$)/.test(url))return reply(200,{id:'dpl_1',url:'radix-site-x-abc.vercel.app',readyState:states[0]});
  if(/\/v13\/deployments\/dpl_1/.test(url)){polls++;const st=states[Math.min(polls,states.length-1)];return reply(200,{id:'dpl_1',url:'radix-site-x-abc.vercel.app',readyState:st,alias:st==='READY'?['radix-site-studio-fisio.vercel.app']:[]})}
  if(/\/v10\/projects\/[^/]+\/domains/.test(url))return domain==='conflict'?reply(409,{error:{code:'domain_already_in_use',message:'already'}}):reply(200,{name:JSON.parse(opts.body).name,verified:false});
  if(/\/v9\/projects\/[^/]+\/domains\//.test(url))return reply(200,{name:'x',verified:true});
  return reply(404,{error:{message:'not found '+TOKEN}})};
 return {fetch,calls,get polls(){return polls}}}
async function call(method,body,{env={VERCEL_SITES_TOKEN:TOKEN,JWT_SECRET:SECRET},store=memStore(),vercel=fakeVercel(),user={uid:7,name:'Anna'},waitMs=60000}={}){
 const orig=auth.getSessionUser;auth.getSessionUser=()=>user;const r=res();
 try{await pub.handle({method,query:method==='GET'?body:{},body:method==='POST'?body:undefined,headers:{}},r,{env,store,fetch:vercel.fetch,sleep:async()=>{},pollMs:2000,waitMs})}finally{auth.getSessionUser=orig}
 assert.ok(!JSON.stringify(r.body).includes(TOKEN),'the token never reaches a response');
 return Object.assign(r,{store,vercel})}

test('slug: [a-z0-9-], at most 40 characters, stable suffix from the project id',()=>{
 const a=pub.siteSlug('Studio Fisio Bergamo','fisio-ab12cd34'),b=pub.siteSlug('Studio Fisio Bergamo','fisio-ffff0000');
 assert.match(a,/^studio-fisio-bergamo-[0-9a-f]{6}$/);assert.notEqual(a,b,'two clients with the same name never collide');
 assert.equal(a,pub.siteSlug('Studio Fisio Bergamo','fisio-ab12cd34'),'stable');
 const long=pub.siteSlug('Caffè Già Ònice — una attività con un nome davvero molto lunghissimo!!','p-1');
 assert.ok(long.length<=40,long);assert.match(long,/^[a-z0-9-]+$/);assert.ok(!/--/.test(long));assert.match(long,/^caffe-gia-onice-/);
 assert.match(pub.siteSlug('!!!','p-1'),/^sito-[0-9a-f]{6}$/);
 assert.equal(pub.projectName(a),'radix-site-'+a);assert.equal(pub.subdomain('x-1'),'x-1.radixinnovationstudio.com');
});

test('payload shape and Vercel requests: production, one index.html, no framework, bearer token, team id when set',async()=>{
 const r=await call('POST',{action:'publish',projectId:'fisio-ab12cd34',html:PAGE,pages:PAGES},{env:{VERCEL_SITES_TOKEN:TOKEN,VERCEL_SITES_TEAM_ID:'team_9',VERCEL_API_BASE:'http://127.0.0.1:9/'}});
 assert.equal(r.code,200,JSON.stringify(r.body));
 const [first]=r.vercel.calls,slug=pub.siteSlug('Studio Fisio Bergamo','fisio-ab12cd34');
 assert.equal(first.url,'http://127.0.0.1:9/v13/deployments?teamId=team_9');assert.equal(first.method,'POST');
 assert.deepEqual(first.body,{name:'radix-site-'+slug,project:'radix-site-'+slug,target:'production',files:[{file:'index.html',data:PAGE},{file:'privacy.html',data:PAGES['privacy.html']},{file:'cookie.html',data:PAGES['cookie.html']}],projectSettings:{framework:null}});
 assert.deepEqual(first.body,pub.deploymentPayload('radix-site-'+slug,PAGE,PAGES));
 assert.equal(first.headers.Authorization,'Bearer '+TOKEN);
 for(const c of r.vercel.calls)assert.ok(!c.url.includes(TOKEN),'token never in a URL');
 const def=await call('POST',{action:'publish',projectId:'fisio-ab12cd34',html:PAGE,pages:PAGES});assert.equal(def.vercel.calls[0].url,'https://api.vercel.com/v13/deployments');
});

test('publish polls until READY, returns the alias and saves the record in the agents document',async()=>{
 const r=await call('POST',{action:'publish',projectId:'fisio-ab12cd34',html:PAGE,pages:PAGES});
 assert.equal(r.code,200);assert.equal(r.body.state,'READY');assert.equal(r.body.url,'https://radix-site-studio-fisio.vercel.app');
 assert.equal(r.body.deploymentId,'dpl_1');assert.match(r.body.project,/^radix-site-studio-fisio-bergamo-[0-9a-f]{6}$/);assert.ok(Date.parse(r.body.publishedAt));
 assert.equal(r.vercel.polls,2);assert.deepEqual(r.vercel.calls.slice(1).map(c=>c.method),['GET','GET']);
 const d=r.store.doc.data;assert.equal(d.siteOnline.url,r.body.url);assert.equal(d.other,1,'other keys kept');
 assert.deepEqual(d.conversations.copywriter,[{role:'user',content:'ciao'}]);
 const t=d.conversations['web-developer'];assert.equal(t.length,2);assert.equal(t[1].source,'site-publish');assert.match(t[1].content,/Il sito è online: https:\/\/radix-site-studio-fisio\.vercel\.app/);
 assert.deepEqual(pub.savedSite({conversations:d.conversations}),d.siteOnline,'found in the thread when siteOnline was dropped');
 // GET shows it next time; re-publish keeps the Vercel project and the thread grows once per new deployment
 const info=await call('GET',{projectId:'fisio-ab12cd34'},{store:r.store});assert.equal(info.code,200);assert.equal(info.body.configured,true);assert.equal(info.body.site.url,r.body.url);
 r.store.conflicts=1;const again=await call('POST',{action:'publish',projectId:'fisio-ab12cd34',html:PAGE,pages:PAGES},{store:r.store});
 assert.equal(again.code,200);assert.equal(again.vercel.calls[0].body.project,r.body.project);assert.equal(r.store.doc.data.conversations['web-developer'].length,2,'same deployment id: no second entry');
});

test('a slow build answers BUILDING and the status action finishes it',async()=>{
 const store=memStore(),vercel=fakeVercel({states:['QUEUED','BUILDING','BUILDING','BUILDING','READY']});
 const r=await call('POST',{action:'publish',projectId:'fisio-ab12cd34',html:PAGE,pages:PAGES},{store,vercel,waitMs:4000});
 assert.equal(r.code,200);assert.equal(r.body.state,'BUILDING');assert.equal(vercel.polls,2,'stops at the wait limit');
 assert.equal(store.doc.data.siteOnline.state,'BUILDING');assert.equal(store.doc.data.conversations['web-developer'],undefined);
 let s=await call('POST',{action:'status',projectId:'fisio-ab12cd34',deploymentId:'dpl_1'},{store,vercel});assert.equal(s.body.state,'BUILDING');
 s=await call('POST',{action:'status',projectId:'fisio-ab12cd34',deploymentId:'dpl_1'},{store,vercel});assert.equal(s.body.state,'READY');
 assert.equal(s.body.url,'https://radix-site-studio-fisio.vercel.app');assert.equal(s.body.publishedAt,r.body.publishedAt);assert.equal(store.doc.data.conversations['web-developer'].length,2);
 const other=await call('POST',{action:'status',projectId:'fisio-ab12cd34',deploymentId:'dpl_other'},{store,vercel});assert.equal(other.code,404,'only this project’s deployment');
 const failed=await call('POST',{action:'publish',projectId:'fisio-ab12cd34',html:PAGE,pages:PAGES},{vercel:fakeVercel({states:['BUILDING','ERROR']})});
 assert.equal(failed.code,502);assert.equal(failed.body.state,'ERROR');assert.match(failed.body.error,/non è riuscito/);
});

test('missing key: 503 with the message, for every action; GET still returns the saved site',async()=>{
 for(const env of [{},{VERCEL_SITES_TOKEN:'  '}]){
  const vercel=fakeVercel(),r=await call('POST',{action:'publish',projectId:'fisio-ab12cd34',html:PAGE,pages:PAGES},{env,vercel});
  assert.equal(r.code,503);assert.deepEqual(r.body,{error:'Pubblicazione non ancora attiva: manca la chiave Vercel dei siti.'});assert.equal(vercel.calls.length,0);
 }
 const store=memStore();store.doc.data.siteOnline={url:'https://a.vercel.app',deploymentId:'d',project:'radix-site-a',state:'READY'};
 const g=await call('GET',{projectId:'fisio-ab12cd34'},{env:{},store});assert.equal(g.code,503);assert.equal(g.body.error,pub.MISSING);assert.equal(g.body.site.url,'https://a.vercel.app');
});

test('refuses yellow TODO markers, oversized pages, bad input; needs a session and an existing project',async()=>{
 const todo=studio.buildPage({name:'P',headline:'H',sections:[{title:'Prezzi',text:'[da completare: prezzi]'}]},{name:'Studio'});assert.ok(studio.hasTodo(todo));
 let r=await call('POST',{action:'publish',projectId:'fisio-ab12cd34',html:todo});assert.equal(r.code,422);assert.match(r.body.error,/da completare.*completali prima di metterlo online/);assert.equal(r.vercel.calls.length,0);
 const big=PAGE.replace('</body>','<p>'+'x'.repeat(pub.MAX_HTML)+'</p></body>');
 r=await call('POST',{action:'publish',projectId:'fisio-ab12cd34',html:big});assert.equal(r.code,413);assert.match(r.body.error,/2 MB/);assert.equal(r.vercel.calls.length,0);
 r=await call('POST',{action:'publish',projectId:'fisio-ab12cd34',html:''});assert.equal(r.code,400);
 r=await call('POST',{action:'publish',projectId:'../x',html:PAGE,pages:PAGES});assert.equal(r.code,400);
 r=await call('POST',{action:'publish',projectId:'altro-progetto',html:PAGE,pages:PAGES});assert.equal(r.code,404);
 r=await call('POST',{action:'boh',projectId:'fisio-ab12cd34'});assert.equal(r.code,400);
 r=await call('POST',{action:'publish',projectId:'fisio-ab12cd34',html:PAGE,pages:PAGES},{user:null});assert.equal(r.code,401);
 r=await call('PUT',{},{});assert.equal(r.code,405);
});

test('subdomain: adds <slug>.radixinnovationstudio.com and returns the CNAME record to set at Namecheap',async()=>{
 const store=memStore();let r=await call('POST',{action:'domain',projectId:'fisio-ab12cd34'},{store});assert.equal(r.code,409,'publish first');
 await call('POST',{action:'publish',projectId:'fisio-ab12cd34',html:PAGE,pages:PAGES},{store});
 const project=store.doc.data.siteOnline.project,slug=project.replace('radix-site-','');
 r=await call('POST',{action:'domain',projectId:'fisio-ab12cd34'},{store});
 assert.equal(r.code,200);assert.deepEqual(r.body,{domain:slug+'.radixinnovationstudio.com',verified:false,record:{type:'CNAME',name:slug,value:'cname.vercel-dns.com',zone:'radixinnovationstudio.com'}});
 const c=r.vercel.calls[0];assert.equal(c.url,'https://api.vercel.com/v10/projects/'+project+'/domains');assert.deepEqual(c.body,{name:slug+'.radixinnovationstudio.com'});
 assert.deepEqual(store.doc.data.siteOnline.domain,{name:slug+'.radixinnovationstudio.com',verified:false});
 r=await call('POST',{action:'domain',projectId:'fisio-ab12cd34'},{store,vercel:fakeVercel({domain:'conflict'})});
 assert.equal(r.code,200);assert.equal(r.body.verified,true,'already added: read back from Vercel');
 // the domain survives a re-publish
 await call('POST',{action:'publish',projectId:'fisio-ab12cd34',html:PAGE,pages:PAGES},{store});assert.equal(store.doc.data.siteOnline.domain.verified,true);
});

test('provider errors never echo the token; routing, status list and studio wiring',async()=>{
 const vercel={calls:[],fetch:async()=>({ok:false,status:403,json:async()=>({error:{message:'bad token '+TOKEN}})})};
 const r=await call('POST',{action:'publish',projectId:'fisio-ab12cd34',html:PAGE,pages:PAGES},{vercel});assert.equal(r.code,502);assert.match(r.body.error,/Vercel ha risposto 403: bad token \[chiave\]/);
 const down={calls:[],fetch:async()=>{throw Error('connect ECONNREFUSED '+TOKEN)}};
 const r2=await call('POST',{action:'publish',projectId:'fisio-ab12cd34',html:PAGE,pages:PAGES},{vercel:down});assert.equal(r2.code,502);
 const src=fs.readFileSync('api/_site_publish.js','utf8');assert.ok(!/console\./.test(src),'nothing logged');assert.match(src,/env\.VERCEL_API_BASE\|\|'https:\/\/api\.vercel\.com'/);
 assert.match(fs.readFileSync('api/integrations/[service].js','utf8'),/'site-publish': \(\) => require\('\.\.\/_site_publish'\)/);
 const status=require('../api/_integrations-status.js');const v=status.status({VERCEL_SITES_TOKEN:TOKEN}).find(s=>s.id==='vercel-sites');
 assert.equal(v.configured,true);assert.ok(!JSON.stringify(status.status({VERCEL_SITES_TOKEN:TOKEN})).includes(TOKEN));
 const ws=fs.readFileSync('lib/radix-workspace-client.js','utf8');assert.match(ws,/'\/api\/integrations\/site-publish'/);assert.match(ws,/sites,/);
 const ui=fs.readFileSync('lib/site-studio.js','utf8');assert.match(ui,/publishBox\(\(\)=>\(\{html,pages\}\)\)/);assert.match(ui,/Usa il tuo dominio/);assert.match(ui,/cname\.vercel-dns\.com/);assert.match(ui,/Namecheap/);
});
