'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
process.env.JWT_SECRET=process.env.JWT_SECRET||'test-secret-for-import-token';
const T=require('../api/_lead_import_token');
const {createHandler}=require('../api/_sales');
const auth=require('../api/_auth');
const Core=require('../tools/radix-chrome-extension/src/core');
const SECRET=process.env.JWT_SECRET;
const WS='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222';
const SOURCE='https://www.linkedin.com/sales/search/people?query=(keywords%3Aceo)';
function fakeStore(roles={[WS]:'member'}){
 const jobs=[];
 return {jobs,store:{
  membership:async()=>{throw Error('CRM membership must not be used for lead entities')},
  leadLists:{membership:async(w,u)=>u===7&&roles[w]?{role:roles[w]}:null},
  leadContactJobs:{command:async(c,uid)=>{jobs.push({c,uid});return {id:c.data.id,title:c.data.title,version:1}}}
 }};
}
function call(handler,{method='POST',headers={},body,query={}}){
 return new Promise(resolve=>{
  const res={headers:{},statusCode:0,setHeader(k,v){this.headers[k]=v},status(s){this.statusCode=s;return this},json(v){resolve({status:this.statusCode,body:v,headers:this.headers});return this}};
  handler({method,headers,body,query},res);
 });
}
const rows=n=>Array.from({length:n},(_,i)=>({fullName:'Persona '+i,firstName:'Persona',lastName:String(i),jobTitle:'CEO',companyName:'Azienda '+i,location:'Milano',profileUrl:'https://www.linkedin.com/sales/lead/ACw'+i+',NAME_SEARCH,x',sourceUrl:SOURCE}));

test('import token: signed, scoped, expiring, not interchangeable with the session cookie',()=>{
 const now=Date.UTC(2026,9,19);
 const {token,expiresAt,workspace}=T.sign({uid:7,workspace:WS},SECRET,now);
 assert.match(token,/^rli1\./);assert.equal(workspace,WS);
 assert.equal(new Date(expiresAt).getTime(),now+14*86400000);
 const claims=T.verify(token,SECRET,now+1000);
 assert.equal(claims.uid,7);assert.equal(claims.ws,WS);assert.equal(claims.scope,'lead-import');
 assert.equal(T.verify(token,SECRET,now+14*86400000+1),null,'expired');
 assert.equal(T.verify(token,'other-secret',now),null,'other secret');
 const [p,b,s]=token.split('.');
 const forged=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(b,'base64url')),ws:OTHER})).toString('base64url');
 assert.equal(T.verify([p,forged,s].join('.'),SECRET,now),null,'tampered workspace');
 assert.equal(auth.verifySessionToken(token),null,'import token is not a session');
 const session=auth.signSessionToken({uid:7,email:'a@b.c'});
 assert.equal(T.verify(session,SECRET),null,'session is not an import token');
 assert.equal(T.verify('rli1.'+session,SECRET),null);
 assert.throws(()=>T.sign({uid:0,workspace:WS},SECRET),/non validi/);
});

test('session user creates a link code; bearer token imports a contact job and nothing else',async()=>{
 const {jobs,store}=fakeStore();
 const handler=createHandler({getSessionUser:auth.getSessionUser,getStore:()=>store});
 const cookie='radix_session='+encodeURIComponent(auth.signSessionToken({uid:7}));
 const json={'content-type':'application/json','x-radix-sales':'1'};
 const issued=await call(handler,{headers:{...json,cookie,'sec-fetch-site':'same-origin'},body:{workspace:WS,entity:'lead_import_token',action:'create',data:{}}});
 assert.equal(issued.status,200,JSON.stringify(issued.body));assert.match(issued.body.token,/^rli1\./);
 const token=issued.body.token,bearer={...json,authorization:'Bearer '+token};
 // Same flow as the extension: link code → upload.
 const link=Core.parseLinkCode(Core.makeLinkCode('https://radix-platform.vercel.app',token));
 assert.equal(link.token,token);
 const fetchImpl=async(url,init)=>{
  const u=new URL(url),r=await call(handler,{method:init.method,headers:Object.fromEntries(Object.entries(init.headers).map(([k,v])=>[k.toLowerCase(),v])),body:init.body,query:Object.fromEntries(u.searchParams)});
  return {ok:r.status<400,status:r.status,json:async()=>r.body};
 };
 const check=await Core.checkLink({baseUrl:link.baseUrl,token,fetchImpl});
 assert.equal(check.ok,true);assert.equal(check.role,'member');assert.equal(check.workspace,WS);
 const result=await Core.uploadContacts({baseUrl:link.baseUrl,token,rows:rows(450),sourceUrl:SOURCE,runId:'abc',fetchImpl});
 assert.equal(result.count,450);assert.equal(jobs.length,1);assert.equal(jobs[0].uid,7);
 const saved=jobs[0].c;
 assert.equal(saved.workspace,WS);assert.equal(saved.entity,'lead_contact_jobs');assert.equal(saved.action,'create');
 assert.equal(saved.data.payload.records.length,450);assert.equal(saved.data.payload.batches.length,3);
 assert.match(saved.data.title,/^LinkedIn Sales Navigator · /);
 assert.equal(saved.data.payload.records[0].firstName,'Persona');assert.equal(saved.data.payload.records[0].location,'Milano');
 // Scope: any other entity or action is refused, even for the same workspace.
 for(const body of [
  {workspace:WS,entity:'contacts',action:'create',data:{name:'X'}},
  {workspace:WS,entity:'lead_contact_jobs',action:'delete',data:{id:WS,version:1}},
  {workspace:WS,entity:'lead_import_token',action:'create',data:{}},
 ]){const r=await call(handler,{headers:bearer,body});assert.equal(r.status,403,JSON.stringify(body))}
 const other=await call(handler,{headers:bearer,body:{workspace:OTHER,entity:'lead_contact_jobs',action:'create',data:{title:'x',payload:Core.buildJob(rows(1),SOURCE,'r')}}});
 assert.equal(other.status,403);assert.match(other.body.error,/Workspace diverso/);
 const reads=await call(handler,{method:'GET',headers:bearer,query:{entity:'lead_contact_jobs',workspace:WS}});
 assert.equal(reads.status,400);
 const noHeader=await call(handler,{headers:{'content-type':'application/json',authorization:'Bearer '+token},body:Core.importBody(WS,'t',Core.buildJob(rows(1),SOURCE,'r'))});
 assert.equal(noHeader.status,403);
 const bad=await call(handler,{headers:{...json,authorization:'Bearer rli1.abc.def'},body:{}});
 assert.equal(bad.status,401);
 assert.equal(jobs.length,1);
});

test('membership is re-checked: viewers and removed members cannot import',async()=>{
 const token=T.sign({uid:7,workspace:WS},SECRET).token,headers={'content-type':'application/json','x-radix-sales':'1',authorization:'Bearer '+token};
 const body=Core.importBody(WS,'t',Core.buildJob(rows(2),SOURCE,'r'));
 for(const roles of [{[WS]:'viewer'},{}]){
  const {jobs,store}=fakeStore(roles);
  const r=await call(createHandler({getSessionUser:()=>null,getStore:()=>store}),{headers,body});
  assert.equal(r.status,403);assert.equal(jobs.length,0);
 }
});

test('viewers cannot create a link code and cross-site requests are still refused',async()=>{
 const {store}=fakeStore({[WS]:'viewer'});
 const handler=createHandler({getSessionUser:()=>({uid:7}),getStore:()=>store});
 const headers={'content-type':'application/json','x-radix-sales':'1'};
 const body={workspace:WS,entity:'lead_import_token',action:'create',data:{}};
 assert.equal((await call(handler,{headers,body})).status,403);
 const {store:s2}=fakeStore();
 const h2=createHandler({getSessionUser:()=>({uid:7}),getStore:()=>s2});
 assert.equal((await call(h2,{headers:{...headers,'sec-fetch-site':'cross-site'},body})).status,403);
 assert.equal((await call(h2,{headers,body:{...body,data:{scope:'all'}}})).status,400);
 assert.equal((await call(h2,{headers,body})).status,200);
});
