'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const k=require('../api/_sales_clicks.js');
const {createHandler}=require('../api/_sales');
const {withTracking,urlsIn,withUnsubscribe}=require('../sales/crm-campaigns.js');
const K='k'.repeat(40),W='5b1d2c3e-4f50-4a61-8b72-9c83d4e5f601',C='8924f329-b2c2-4032-9be5-2982d9cd8e5c',URL1='https://radix.example/offerta?x=1',CAMP='Proposta autunno';
const res=()=>{const r={headers:{},setHeader(a,v){r.headers[a]=v},status(s){r.code=s;return r},json(b){r.body=b;return r},send(b){r.body=b;return r},end(){return r}};return r};

test('click tokens sign contact, campaign and url: no open redirect, no tampering',()=>{
 const t=k.sign(K,W,C,CAMP,URL1);assert.equal(t.length,64);
 assert.deepEqual(k.verify(K,t,CAMP,URL1),{workspace:W,contact:C});
 assert.equal(k.verify(K,t,CAMP,'https://evil.example/'),null,'another url');
 assert.equal(k.verify(K,t,'Altra',URL1),null,'another campaign');
 assert.equal(k.verify('z'.repeat(40),t,CAMP,URL1),null);
 for(const u of ['javascript:alert(1)','ftp://x.y/','https://u:p@x.y/','','x'.repeat(10)])assert.equal(k.validUrl(u),false,u);
 assert.throws(()=>k.sign(K,W,C,CAMP,'javascript:alert(1)'));assert.throws(()=>k.sign(K,W,C,'',URL1));
});

test('redirect: GET records click (first one also in the timeline), HEAD and failures still redirect',async()=>{
 const calls=[];const sql=async(q,p)=>{calls.push([q,p]);return []};
 const q={click:k.sign(K,W,C,CAMP,URL1),k:CAMP,u:URL1};
 let r=res();await k.handle({method:'GET',query:q},r,{getSql:()=>sql,secret:K});
 assert.equal(r.code,302);assert.equal(r.headers.Location,URL1);assert.equal(calls.length,1);
 assert.match(calls[0][0],/INSERT INTO sales_email_clicks/);assert.match(calls[0][0],/INSERT INTO sales_interactions/);assert.match(calls[0][0],/NOT EXISTS/);assert.match(calls[0][0],/INSERT INTO sales_tasks/);assert.match(calls[0][0],/'high','todo'/);
 assert.deepEqual(calls[0][1],[W,C,CAMP,URL1]);
 r=res();await k.handle({method:'HEAD',query:q},r,{getSql:()=>sql,secret:K});assert.equal(r.code,302);assert.equal(calls.length,1,'HEAD does not count');
 r=res();await k.handle({method:'GET',query:q},r,{getSql:()=>async()=>{throw Object.assign(new Error('x'),{code:'42P01'})},secret:K});assert.equal(r.code,302,'missing table still redirects');
 r=res();await k.handle({method:'GET',query:{...q,u:'https://evil.example/'}},r,{getSql:()=>sql,secret:K});assert.equal(r.code,400);assert.equal(r.headers.Location,undefined);
});

test('sales API: public click route, tracked links in link requests, members-only report',async()=>{
 process.env.JWT_SECRET=K;
 const store={sql:async(q,p)=>/^SELECT id FROM sales_contacts/.test(q)?p[1].filter(x=>x===C).map(id=>({id})):/GROUP BY campaign/.test(q)?[{campaign:CAMP,clicks:2,people:1,last_at:'2026-10-17T20:00:00Z'}]:[],membership:async()=>({role:'viewer'})};
 let h=createHandler({getSessionUser:()=>null,getStore:()=>store});
 let r=res();await h({method:'GET',headers:{},query:{click:k.sign(K,W,C,CAMP,URL1),k:CAMP,u:URL1}},r);assert.equal(r.code,302);
 r=res();await h({method:'GET',headers:{},query:{entity:'email_clicks',workspace:W,offset:'0'}},r);assert.equal(r.code,401,'report needs a session');
 h=createHandler({getSessionUser:()=>({uid:7}),getStore:()=>store});
 r=res();await h({method:'GET',headers:{},query:{entity:'email_clicks',workspace:W,offset:'0'}},r);assert.equal(r.code,200);assert.equal(r.body.campaigns[0].people,1);
 store.membership=async()=>({role:'member'});
 const post=data=>{const r=res();return h({method:'POST',headers:{'x-radix-sales':'1','content-type':'application/json'},query:{},body:{workspace:W,entity:'unsubscribe_links',action:'create',data}},r).then(()=>r)};
 r=await post({contacts:[C],campaign:CAMP,urls:[URL1]});assert.equal(r.code,200);
 assert.deepEqual(k.verify(K,r.body.clicks[C][0],CAMP,URL1),{workspace:W,contact:C});assert.ok(r.body.links[C]);
 assert.equal((await post({contacts:[C],campaign:CAMP,urls:['javascript:x']})).code,400);
 assert.equal((await post({contacts:[C],urls:[URL1]})).code,400,'campaign required with urls');
 assert.equal((await post({contacts:[C]})).body.clicks,undefined,'no urls, no tracking');
});

test('campaign emails: links rewritten per contact, unsubscribe link stays direct',()=>{
 assert.deepEqual(urlsIn('Vedi '+URL1+'. E https://a.b/c, poi (https://a.b/d) e '+URL1),[URL1,'https://a.b/c','https://a.b/d']);
 const plan={emails:[{contact:{id:C},to:'a@b.it',subject:'S',body:'Ciao, guarda '+URL1+' e https://radix.example/offerta'}],skipped:{consent:0,email:0}};
 const urls=[URL1,'https://radix.example/offerta'],clicks={[C]:urls.map(u=>k.sign(K,W,C,CAMP,u))};
 const out=withTracking(plan,clicks,urls,CAMP,'https://app.example');
 const e=out.emails[0];assert.equal(e.tracked,true);assert.ok(!e.body.includes(' '+URL1),'no plain link left');
 const links=[...e.body.matchAll(/https:\/\/app\.example\/api\/sales\?click=([^&]+)&k=([^&]+)&u=(\S+)/g)];assert.equal(links.length,2);
 for(const [,t,c,u] of links)assert.deepEqual(k.verify(K,t,decodeURIComponent(c),decodeURIComponent(u)),{workspace:W,contact:C});
 assert.equal(decodeURIComponent(links[1][3]),'https://radix.example/offerta','shorter url replaced on its own');
 assert.equal(withTracking(plan,{},urls,CAMP,'https://app.example').emails[0].body,plan.emails[0].body,'no tokens, unchanged');
 const final=withUnsubscribe(out,{[C]:'t'.repeat(64)},'https://app.example');assert.match(final.emails[0].body,/unsubscribe=t{64}$/);
});

test('migration 010 adds only the click table',()=>{
 const s=fs.readFileSync(__dirname+'/../migrations/sales/010_email_clicks.sql','utf8');
 assert.deepEqual([...s.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(m=>m[1]),['sales_email_clicks']);
 assert.match(s,/ON DELETE CASCADE/);assert.doesNotMatch(s,/DROP|ALTER TABLE/);
});
